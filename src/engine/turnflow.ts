// Checklist: GEN, RND, INIT, ACT, PASS, PH1-PH3 loop, MRK (Activation Markers). Owner T.
// turnflow.ts: the Round and the four Phases (spec 11). ONE phase loop serves Phases 1-3 (spec 00 s4): the First Player
// Marker holder names who activates first (turn.first), then seats alternate; a turn is either "activate one eligible
// unit for one action" (turn.activate: unit x menu entry from registry.allOptions, or turn.hold) or turn.pass. Phase 4
// is the fixed pipeline in scoring.ts. The old M0 placeholder flow (kind turn.choose) stays only for createDemoGame().
import type { EditionBundle } from '../data/types'
import { openWindow, runDelayed } from './abilities'
import { FIRST_PLAYER_LOCK, firstPlayerLock } from './code-hooks'
import * as dice from './dice'
import { unitDef } from './edition'
import { expireEffects, hasStatus, setStatus } from './effects'
import { isEngaged } from './engage'
import { runHook } from './hooks'
import { TodoError } from './errors'
import { startOfRoundMarkers } from './missions'
import {
  allOptions, isRejection, moduleFor, option, pushEvents, raiseDecision, reject, updateUnit,
  type ActionDone, type Controller, type StepResult,
} from './registry'
import { roll } from './rng'
import { resumeScoring, runScoring } from './scoring'
import { canArrive } from './supply'
import type { Action, AttackBatch, DecisionOption, GameState, RoundPhase, SeatId, UnitId } from './types'

/** Round limit of the placeholder flow (not a rules value; the rules spec sets game length). */
export const PLACEHOLDER_ROUNDS = 3

// ---------------------------------------------------------------- placeholder flow (M0, createDemoGame only)
/** Open the one decision for the seat whose turn it is. */
export function openTurn(state: GameState, seat: SeatId): GameState {
  const s: GameState = { ...state, turn: { seat, step: 'choose' } }
  return raiseDecision(s, {
    seat, kind: 'turn.choose', context: { round: s.round }, canPass: true,
    options: [option('roll', 'Roll a test die', 'turn.roll', {}, seat), option('pass', 'Pass', 'turn.pass', {}, seat)],
  })
}

/** Start round 1 with the first seat (placeholder game). */
export function beginPlay(state: GameState): GameState {
  const first = state.seatOrder[0]!
  return openTurn({ ...state, phase: 'play', round: 1 }, first)
}

/** Placeholder: hand the turn to the next seat; after the last seat a new round starts; past the limit the game ends. */
function advance(state: GameState): GameState {
  const seat = state.turn?.seat ?? state.seatOrder[0]!
  const i = state.seatOrder.indexOf(seat)
  if (i < state.seatOrder.length - 1) return openTurn(state, state.seatOrder[i + 1]!)
  const round = state.round + 1
  if (state.maxRounds !== null && round > state.maxRounds) {
    return endGame(state, null, 'The placeholder game ends after its last round (no scoring yet).', seat, 'placeholder')
  }
  return openTurn({ ...state, round }, state.seatOrder[0]!)
}

/** End the game: result, phase 'over' and the terminal decision (a finished game still holds exactly one decision so
 *  legalActions is never empty; apply() refuses it with E_GAME_OVER). */
export type GameOverKind = 'special' | 'vp' | 'draw' | 'placeholder'
export function endGame(state: GameState, winner: SeatId | null, reason: string, seat?: SeatId, kind?: GameOverKind): GameState {
  // The structured fields (kind, vp) ride along on the result and the event; types.ts GameResult only names winner+reason.
  const how: GameOverKind = kind ?? (winner === null ? 'draw' : 'vp')
  const vp = Object.fromEntries(Object.entries(state.seats).map(([id, st]) => [id, st.vp]))
  const result = { winner, reason, kind: how, vp }
  const over = pushEvents({ ...state, phase: 'over', turn: null, active: null, activeUnit: null, result }, [{ type: 'gameOver', winner, reason, kind: how, vp }])
  const who = seat ?? over.firstPlayer ?? over.seatOrder[0]!
  return raiseDecision(over, { seat: who, kind: 'turn.over', context: {}, canPass: false, options: [option('over', 'Game over', 'turn.over', {}, who)] })
}

// ---------------------------------------------------------------- eligibility and menus (spec 11 s5-8)
const NEXT_PHASE = { movement: 'assault', assault: 'combat', combat: 'scoring' } as const

/** Can this unit be activated in this Phase (spec 11 s5-8; Combat: Engaged Ground units only)? */
export function eligible(state: GameState, bundle: EditionBundle, unitId: UnitId, phase: RoundPhase): boolean {
  const u = state.units[unitId]
  if (!u || u.location === 'destroyed') return false
  switch (phase) {
    case 'movement':
      if (u.activation !== null) return false
      return u.location === 'table' || canArrive(state, bundle, u.owner, u.id)
    case 'assault':
      return u.location === 'table' && u.activation === 'movement'
    case 'combat':
      if (u.location !== 'table' || u.activation === null) return false
      if (unitDef(bundle, u.profileId)?.combatTags.includes('flying')) return false
      return isEngaged(state, bundle, u.id)
    default:
      return false
  }
}

/** The unit's menu: every module's entries (stamped with the unit) plus Hold in Phases 1-2 for a unit on the table. */
function unitMenu(state: GameState, bundle: EditionBundle, unitId: UnitId, phase: RoundPhase): DecisionOption[] {
  const u = state.units[unitId]!
  const stamped = allOptions(state, bundle, unitId).map((o) =>
    ('unitId' in o.action ? o : { ...o, id: `${unitId}:${o.id}`, action: { ...o.action, unitId } }))
  if ((phase === 'movement' || phase === 'assault') && u.location === 'table') {
    stamped.push(option(`${unitId}:hold`, 'Hold', 'turn.hold', { unitId }, u.owner))
  }
  return stamped
}

/** Can `seat` activate anything now? Stops at the first unit with an entry (a table unit always has Hold in Phases 1-2, so
 *  no menu is built for it); the full menu is only needed when the turn is actually opened. */
function canActivateAny(state: GameState, bundle: EditionBundle, seat: SeatId): boolean {
  const phase = state.roundPhase!
  for (const u of Object.values(state.units)) {
    if (u.owner !== seat || !eligible(state, bundle, u.id, phase)) continue
    if ((phase === 'movement' || phase === 'assault') && u.location === 'table') return true
    if (allOptions(state, bundle, u.id).length > 0) return true
  }
  return false
}

const menuCache = new WeakMap<GameState, Map<SeatId, { options: DecisionOption[]; units: UnitId[] }>>()
/** Every activation `seat` could make now: eligible units x their menus (a unit with an empty menu is left out). Cached per
 *  state object, so a menu is built once per decision. */
function activationMenu(state: GameState, bundle: EditionBundle, seat: SeatId): { options: DecisionOption[]; units: UnitId[] } {
  const hit = menuCache.get(state)?.get(seat)
  if (hit) return hit
  const out = buildMenu(state, bundle, seat)
  let m = menuCache.get(state)
  if (!m) menuCache.set(state, (m = new Map()))
  m.set(seat, out)
  return out
}
function buildMenu(state: GameState, bundle: EditionBundle, seat: SeatId): { options: DecisionOption[]; units: UnitId[] } {
  const phase = state.roundPhase!
  const options: DecisionOption[] = []
  const units: UnitId[] = []
  for (const u of Object.values(state.units)) {
    if (u.owner !== seat || !eligible(state, bundle, u.id, phase)) continue
    const menu = unitMenu(state, bundle, u.id, phase)
    if (menu.length === 0) continue
    units.push(u.id)
    options.push(...menu)
  }
  return { options, units }
}

// ---------------------------------------------------------------- Start of the Round (spec 11 s2)
/** Start of the Round (spec 11 s2): mission marker steps, pending initiative Roll-Off, STATIONARY, startOfRound hook,
 *  then Phase 1. Increments the Round counter (setup calls it with round 0). */
export function startRound(state: GameState, bundle: EditionBundle): GameState {
  let s: GameState = {
    ...state, phase: 'play', round: state.round + 1, roundPhase: null, turn: null, active: null, activeUnit: null,
    passed: [], firstPasser: {}, reactionsUsed: [],
  }
  s = startOfRoundMarkers(s, bundle) // step 1: before any Roll-Off (F p.2)
  if (s.firstPlayer === null) { // step 2: a Roll-Off is pending
    const [a, b] = s.seatOrder
    const r = dice.rollOff(s, [a!, b!], 'initiative')
    s = pushEvents(r.state, r.events)
    s = pushEvents(s, [{ type: 'initiative', winner: r.winner, round: s.round }])
    if (s.round === 1) { // pre-game: the winner gives the marker to either player (INIT-001)
      return raiseDecision(s, {
        seat: r.winner, kind: 'setup.firstPlayer', context: { winner: r.winner }, canPass: false,
        options: s.seatOrder.map((id) => option(`give:${id}`, `${id} holds the First Player Marker`, 'setup.firstPlayer', { holder: id }, r.winner)),
      })
    }
    s = { ...s, firstPlayer: r.winner } // a VP-tie Roll-Off: the winner takes it (INIT-006)
  }
  return finishStartOfRound(s, bundle)
}

/** Steps 3-6 of the Start of the Round, then Phase 1. Also the continuation of the pre-game marker assignment. */
export function finishStartOfRound(state: GameState, bundle: EditionBundle): GameState {
  let s = state
  for (const u of Object.values(s.units)) { // step 3
    if (u.location !== 'destroyed' && !hasStatus(s, u.id, 'STATIONARY')) s = setStatus(s, bundle, u.id, 'STATIONARY', 'gain', 'start-of-round')
  }
  // Step 4 (Pool escalation) and step 6 (Available Supply) are derived by supply.poolFor / available: nothing is stored.
  s = { ...s, turn: { seat: s.firstPlayer ?? s.seatOrder[0]!, step: 'round:start' } }
  const h = runHook(s, bundle, 'startOfRound', { phase: 'movement' }) // step 5
  s = h.state
  if (h.raised) return s // afterAction() resumes with startPhase once the window is answered
  return startPhase({ ...s, turn: null }, bundle, 'movement')
}

// ---------------------------------------------------------------- Phases
/** End of a Phase: delayed `endOfPhase` effects run (Corrosive Bile), `endOfPhase` effects expire, a First Player lock ends
 *  (Terran Tenacity lasts "for the Phase"). `paused` = a delayed effect raised a decision; the Phase change resumes from
 *  afterAction() through the 'phase:end:<from>:<to>' turn step. */
function leavePhase(state: GameState, bundle: EditionBundle, from: RoundPhase, to: RoundPhase): { state: GameState; paused: boolean } {
  let s = state
  for (let guard = 0; guard < 32; guard++) { // runDelayed stops at the first effect that suspends; go on while it finishes at once
    const before = s.pending.id
    const next = runDelayed(s, bundle, 'endOfPhase', from)
    if (next.pending.id !== before) return { state: { ...next, turn: { seat: next.pending.seat === 'all' ? next.seatOrder[0]! : next.pending.seat, step: `phase:end:${from}:${to}` } }, paused: true }
    if (next === s) break
    s = next
  }
  s = expireEffects(s, bundle, 'endOfPhase')
  if (firstPlayerLock(s) !== null) s = { ...s, tokens: s.tokens.filter((t) => t.defId !== FIRST_PLAYER_LOCK) }
  return { state: s, paused: false }
}

/** Enter a Phase and open the first turn (first activator per initiative, RULING R11-2). */
export function startPhase(state: GameState, bundle: EditionBundle, phase: RoundPhase): GameState {
  let base = state
  const prev = state.roundPhase
  if (prev && prev !== 'scoring' && prev !== phase) {
    const left = leavePhase(state, bundle, prev, phase)
    if (left.paused) return left.state
    base = left.state
  }
  let s: GameState = { ...base, roundPhase: phase, passed: [], active: null, activeUnit: null, reactionsUsed: [] }
  if (phase === 'scoring') {
    const r = runScoring(s, bundle)
    if (isRejection(r)) throw new TodoError(`Scoring could not start (${r.code}): ${r.message}`)
    return r.state
  }
  const holder = s.firstPlayer ?? s.seatOrder[0]!
  if (!s.seatOrder.some((seat) => canActivateAny(s, bundle, seat))) {
    // Nothing is eligible for anybody: the Phase ends at once with both seats Passing (RND-002).
    for (const seat of [holder, ...s.seatOrder.filter((x) => x !== holder)]) s = doPass(s, seat, true)
    return startPhase(s, bundle, NEXT_PHASE[phase])
  }
  return raiseDecision(s, {
    seat: holder, kind: 'turn.first', context: { phase, round: s.round }, canPass: false,
    options: s.seatOrder.map((id) => option(`first:${id}`, `${id} activates first`, 'turn.first', { first: id }, holder)),
  })
}

/** Record a Pass: Activation Markers, and the First Player Marker for the first Pass of Phase 1 or 2 (INIT-003/004). */
function doPass(state: GameState, seat: SeatId, forced: boolean): GameState {
  const phase = state.roundPhase!
  let s: GameState = { ...state, passed: [...state.passed, seat], active: null, activeUnit: null }
  s = pushEvents(s, [{ type: 'passed', seat, phase, forced }])
  if (s.firstPasser[phase] === undefined) {
    s = { ...s, firstPasser: { ...s.firstPasser, [phase]: seat } }
    if ((phase === 'movement' || phase === 'assault') && s.firstPlayer !== seat && firstPlayerLock(s) === null) { // a lock keeps the marker (Tenacity)
      s = pushEvents({ ...s, firstPlayer: seat }, [{ type: 'firstPlayer', seat, phase }])
    }
  }
  const from = phase === 'movement' ? null : phase === 'assault' ? 'movement' : undefined
  if (from !== undefined) {
    for (const u of Object.values(s.units)) {
      if (u.owner === seat && u.location === 'table' && u.activation === from) s = updateUnit(s, u.id, { activation: phase === 'movement' ? 'movement' : 'assault' })
    }
  }
  return s
}

/** After a Pass: end the Phase when everybody has Passed, else pass the turn on. */
function afterPass(state: GameState, bundle: EditionBundle): GameState {
  return state.seatOrder.every((s) => state.passed.includes(s)) ? startPhase(state, bundle, NEXT_PHASE[state.roundPhase as 'movement']) : nextTurn(state, bundle)
}

/** The next seat that has not Passed, in seat order after the one that just acted (strict alternation, ACT-005). */
function nextTurn(state: GameState, bundle: EditionBundle): GameState {
  const n = state.seatOrder.length
  const from = state.active ? state.seatOrder.indexOf(state.active) : -1
  for (let k = 1; k <= n; k++) {
    const cand = state.seatOrder[(from + k + n) % n]!
    if (!state.passed.includes(cand)) return openActivation(state, bundle, cand)
  }
  return startPhase(state, bundle, NEXT_PHASE[state.roundPhase as 'movement'])
}

/** Raise turn.activate for `seat` (never empty: Pass is always there in Phases 1-2 and when nothing is eligible). */
export function openActivation(state: GameState, bundle: EditionBundle, seat: SeatId): GameState {
  const phase = state.roundPhase!
  const { options, units } = activationMenu(state, bundle, seat)
  const mayPass = phase !== 'combat' || options.length === 0 // PASS-001
  const all = mayPass ? [...options, option('pass', 'Pass', 'turn.pass', {}, seat)] : options
  return raiseDecision({ ...state, active: seat, activeUnit: null }, {
    seat, kind: 'turn.activate', context: { phase, round: state.round, units }, canPass: mayPass, options: all,
  })
}

// ---------------------------------------------------------------- end of an activation
/** The after-action ability window of the Unit, then the end of its activation. */
function afterWindow(state: GameState, bundle: EditionBundle, unitId: UnitId): GameState {
  const w = openWindow(state, bundle, unitId, 'after')
  if (isRejection(w)) return endActivation(state, bundle)
  if (!w.done) return w.state // the window raised a decision; its answer comes back through afterAction()
  return endActivation(w.state, bundle)
}

/** The target of the Ranged Attack this Unit fired in the current activation, if any (shooting logs `shoot.fire`; the
 *  activation starts at its `turn.begin` event). */
function firedTarget(state: GameState, unitId: UnitId): UnitId | null {
  for (let i = state.events.length - 1; i >= 0; i--) {
    const e = state.events[i]! as unknown as { type: string; unitId?: string; targetUnitId?: string }
    if (e.type === 'turn.begin' && e.unitId === unitId) return null
    if (e.type === 'shoot.fire' && e.unitId === unitId && e.targetUnitId) return e.targetUnitId
  }
  return null
}

/** What the attack that just finished looked like, for the 'attackResolved' trigger (Lunge reads kind and target). */
function resolvedBatch(state: GameState, unitId: UnitId, targetUnitId: UnitId): AttackBatch {
  return {
    id: `resolved-${unitId}`, kind: 'ranged', attackerSeat: state.units[unitId]!.owner, attackerUnitId: unitId, attackerModelIds: [],
    weaponId: null, sourceId: null, targetUnitId, dieGroups: [], surgeDice: null, surgeFixed: null, dmg: 0, keywords: [], eligible: null,
  }
}

/** The afterAction hook for the Unit (an action that fired a Ranged Attack gets a second pass for 'attackResolved' with the
 *  target and batch), then the after-action window. `from` = how many passes are already done (resume after a Reaction). */
function afterHooks(state: GameState, bundle: EditionBundle, unitId: UnitId, from = 0): GameState {
  const u = state.units[unitId]
  if (!u) return endActivation(state, bundle)
  const phase = state.roundPhase ?? undefined
  const target = firedTarget(state, unitId)
  const passes: Record<string, unknown>[] = target
    ? [{ cause: 'actionResolved' }, { cause: 'attackResolved', targetUnitId: target, batch: resolvedBatch(state, unitId, target) }]
    : [{}]
  let s = state
  for (let i = from; i < passes.length; i++) {
    const h = runHook(s, bundle, 'afterAction', { seat: u.owner, unitId, phase, returnTo: 'turn', ...passes[i] })
    // a Reaction window or Bound by the Khala opened: resume() goes on with the next pass and the after-action window
    if (h.raised) return pushEvents(h.state, [{ type: 'turn.stage', stage: 'after', unitId, next: i + 1 }])
    s = h.state
  }
  return afterWindow(s, bundle, unitId)
}

/** End the activation: a Unit picked by Bound by the Khala (a khalaActivate marker) activates at once for the same seat,
 *  otherwise the turn passes on. */
function endActivation(state: GameState, bundle: EditionBundle): GameState {
  const phase = state.roundPhase
  for (const u of Object.values(state.units)) {
    const mark = u.effects.find((e) => e.kind === 'mod' && (e.data as { op?: string } | undefined)?.op === 'khalaActivate')
    if (!mark) continue
    const s = updateUnit(state, u.id, { effects: u.effects.filter((e) => e.id !== mark.id) })
    if (!phase || phase === 'scoring' || !eligible(s, bundle, u.id, phase)) return endActivation(s, bundle)
    const menu = unitMenu(s, bundle, u.id, phase)
    if (!menu.length) return endActivation(s, bundle)
    return raiseDecision({ ...s, active: u.owner, activeUnit: null, reactionsUsed: [] }, {
      seat: u.owner, kind: 'turn.activate', context: { phase, round: s.round, units: [u.id], khala: true }, canPass: false, options: menu,
    })
  }
  return nextTurn({ ...state, activeUnit: null, reactionsUsed: [] }, bundle)
}

// ---------------------------------------------------------------- the controller
function legacy(state: GameState, action: Action): StepResult {
  switch (action.type) {
    case 'turn.roll': {
      const r = roll(state, { count: 1, sides: 6, purpose: 'test' })
      return { state: advance(pushEvents(r.state, [r.event])) }
    }
    case 'turn.pass':
      return { state: advance(pushEvents(state, [{ type: 'passed', seat: action.seat }])) }
    default:
      return reject('E_UNKNOWN_KIND', `The placeholder turn flow does not handle ${action.type}.`)
  }
}

/** Run the chosen menu entry (Hold is a complete action by itself). */
function dispatch(state: GameState, bundle: EditionBundle, unitId: UnitId, action: Action): StepResult {
  if (action.type === 'turn.hold') return { state, done: { modelId: unitId, unitId, type: 'turn.hold', triggers: [] } }
  const mod = moduleFor(action.type)
  if (!mod || mod.id === 'turnflow') return reject('E_UNKNOWN_KIND', `No module owns ${action.type}.`)
  return mod.resolve(state, bundle, action)
}

/** ACT-006: the before-action ability window of the activated Unit, then the action itself. A window that raises a
 *  decision parks the chosen action in a 'turn.stage' event; afterAction() runs it when the window closes. */
function beforeWindow(state: GameState, bundle: EditionBundle, unitId: UnitId, action: Action): StepResult {
  const w = openWindow(state, bundle, unitId, 'before')
  if (isRejection(w) || w.done) return dispatch(isRejection(w) ? state : w.state, bundle, unitId, action)
  const parked = pushEvents(w.state, [{ type: 'turn.stage', stage: 'beforeWindow', unitId, action }])
  return { state: { ...parked, turn: { seat: action.seat, step: 'before-window' } } }
}

interface Stage { stage?: string; unitId?: UnitId; action?: Action; next?: number }
function lastStage(state: GameState): Stage | undefined {
  for (let i = state.events.length - 1; i >= 0; i--) if (state.events[i]!.type === 'turn.stage') return state.events[i] as unknown as Stage
  return undefined
}

export const turnflow: Controller = {
  id: 'turnflow',
  kinds: ['turn'],
  options: () => [],
  resolve(state: GameState, bundle: EditionBundle, action: Action): StepResult {
    const kind = state.pending.kind
    if (kind === 'turn.choose') return legacy(state, action)
    if (kind === 'turn.first') {
      const first = action['first']
      if (action.type !== 'turn.first' || typeof first !== 'string' || !state.seatOrder.includes(first)) return reject('E_BAD_PARAM', 'Name a seat to activate first.')
      return { state: openActivation(state, bundle, first) }
    }
    if (kind !== 'turn.activate') return reject('E_UNKNOWN_KIND', `The turn flow does not handle ${action.type} here.`)
    if (action.type === 'turn.pass') return { state: afterPass(doPass(state, action.seat, false), bundle) }
    const unitId = action['unitId']
    if (typeof unitId !== 'string' || !state.units[unitId] || state.units[unitId]!.owner !== action.seat) return reject('E_BAD_TARGET', 'Name one of your own units.')
    if (action.type !== 'turn.hold') {
      const mod = moduleFor(action.type)
      if (!mod || mod.id === 'turnflow') return reject('E_UNKNOWN_KIND', `No module owns ${action.type}.`)
    }
    const s: GameState = pushEvents({ ...state, activeUnit: unitId, reactionsUsed: [] }, [{ type: 'turn.begin', unitId }])
    const h = runHook(s, bundle, 'beforeAction', { seat: action.seat, unitId, phase: state.roundPhase ?? undefined, returnTo: 'turn' })
    // a Reaction window opened: resume() opens the before-action window and runs the chosen menu action once it closes
    if (h.raised) return { state: pushEvents(h.state, [{ type: 'turn.stage', stage: 'before', unitId, action }]) }
    return beforeWindow(h.state, bundle, unitId, action)
  },
  afterAction(state: GameState, bundle: EditionBundle, done: ActionDone): GameState {
    if (state.phase === 'over') return state
    if (state.turn?.step === 'before-window') { // the before-action window closed: now the parked action
      const st = lastStage(state)
      const cleared: GameState = { ...state, turn: null }
      if (st?.stage === 'beforeWindow' && st.action && st.unitId && state.units[st.unitId]) {
        const r = dispatch(cleared, bundle, st.unitId, st.action)
        if (!isRejection(r)) return r.done ? turnflow.afterAction(r.state, bundle, r.done) : r.state
        // the parked action is no longer legal (an Active changed the menu): the seat chooses again
        const logged = pushEvents({ ...cleared, activeUnit: null }, [{ type: 'turn.stage', stage: 'beforeWindowRejected', unitId: st.unitId, code: r.code }])
        return openActivation(logged, bundle, state.units[st.unitId]!.owner)
      }
      return endActivation(cleared, bundle)
    }
    if (state.turn?.step.startsWith('phase:end:')) { // a delayed end-of-Phase effect finished; go on to the next Phase
      const to = state.turn.step.split(':')[3] as RoundPhase
      return startPhase({ ...state, turn: null }, bundle, to)
    }
    if (state.turn?.step === 'round:start') return startPhase({ ...state, turn: null }, bundle, 'movement')
    if (state.roundPhase === null) return advance(state) // placeholder flow
    if (state.roundPhase === 'scoring') {
      const r = resumeScoring(state, bundle)
      if (isRejection(r)) throw new TodoError(`Scoring could not continue (${r.code}): ${r.message}`)
      return r.state
    }
    const phase = state.roundPhase
    const unitId = done.unitId ?? done.modelId
    const u = state.units[unitId]
    let s = state
    if (u) s = updateUnit(s, unitId, { activation: phase === 'movement' ? 'movement' : phase === 'assault' ? 'assault' : null })
    if (u && !done.endsActivation && !done.type.startsWith('ability.')) return afterHooks(s, bundle, unitId)
    return endActivation(s, bundle)
  },
  /** Back from a Reaction window (or Bound by the Khala) opened by the beforeAction / afterAction hooks. */
  resume(state: GameState, bundle: EditionBundle): StepResult {
    const stage = lastStage(state)
    if (stage?.stage === 'before' && stage.action && stage.unitId && state.units[stage.unitId]) return beforeWindow(state, bundle, stage.unitId, stage.action)
    if (stage?.stage === 'after' && stage.unitId) return { state: afterHooks(state, bundle, stage.unitId, stage.next ?? 0) }
    return { state: endActivation(state, bundle) }
  },
}
