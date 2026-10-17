// Checklist: PH4, VP (VP-001..003), END (END-001..007), EOR, CLN (CLN-001..004), FIN, INIT-006. Owner T.
// scoring.ts: Phase 4 is a fixed pipeline of steps (spec 11 s9): [final-round Reserves sweep], control, CLAIMs, VP, end
// check, End of the Round, Cleanup & Refresh, initiative. Only Roll-Offs, CLAIM choices and "order your own effects"
// (score.order) are decisions. A tied initiative leaves state.firstPlayer null; the Roll-Off happens at the next Start
// of the Round (RULING R11-1). The step that paused the pipeline is remembered in state.turn.step ('score:<name>') so
// resumeScoring() (called by turnflow.afterAction when the paused step's decision is answered) knows where to go on.
// Namespace 'score' (k score.order).
import type { EditionBundle } from '../data/types'
import { cardDef, rule, tokenDef, unitDef } from './edition'
import { reject } from './errors'
import { expireEffects, tokenGrants } from './effects'
import { updateControl } from './control'
import { runHook } from './hooks'
import { claimOptions, missionOf, raiseClaim, scoreRules } from './missions'
import { removeModels } from './damage'
import { pushEvents, isRejection, type ModuleDef, type StepResult } from './registry'
import { resolveArrivals } from './reserves'
import { endGame, startRound } from './turnflow'
import type { GameState, Rejection, SeatId } from './types'

const ORDER = ['sweep', 'control', 'claim', 'vp', 'end', 'eor', 'arrivals', 'cleanup', 'initiative'] as const
type Cursor = typeof ORDER[number]

const holderOf = (s: GameState): SeatId => s.firstPlayer ?? s.seatOrder[0]!
const setCursor = (s: GameState, c: Cursor): GameState => ({ ...s, turn: { seat: s.turn?.seat ?? holderOf(s), step: `score:${c}` } })
function cursorOf(s: GameState): Cursor | null {
  const step = s.turn?.step
  const c = step?.startsWith('score:') ? (step.slice(6) as Cursor) : null
  return c && ORDER.includes(c) ? c : null
}
const finalRound = (s: GameState): boolean => s.maxRounds !== null && s.round >= s.maxRounds

/** Run Phase 4 from step 1; pauses (returns a state with an open decision) when a seat must choose. */
export function runScoring(state: GameState, bundle: EditionBundle): StepResult {
  return runFrom({ ...state, roundPhase: 'scoring', passed: [], active: null, activeUnit: null, turn: { seat: holderOf(state), step: 'score:sweep' } }, bundle, 'sweep')
}

/** Continue after the paused step's decision was answered (CLAIM re-checks the same step; the others move on). */
export function resumeScoring(state: GameState, bundle: EditionBundle): StepResult | Rejection {
  const c = cursorOf(state)
  if (!c) return reject('E_NOT_LEGAL', 'The Scoring Phase is not waiting for anything.')
  return runFrom(state, bundle, c === 'claim' ? 'claim' : ORDER[ORDER.indexOf(c) + 1] ?? 'initiative')
}

function runFrom(state: GameState, bundle: EditionBundle, from: Cursor): StepResult {
  let s = state
  for (let i = ORDER.indexOf(from); i < ORDER.length; i++) {
    const c = ORDER[i]!
    s = setCursor(s, c)
    switch (c) {
      case 'sweep': s = sweepReserves(s, bundle); break
      case 'control': s = stepControl(s, bundle); break
      case 'claim': {
        const r = claimStep(s, bundle)
        s = r.state
        if (r.paused) return { state: s }
        break
      }
      case 'vp': s = stepVP(s, bundle); break
      case 'end':
        s = stepEndCheck(s, bundle)
        if (s.phase === 'over') return { state: s } // steps 4-6 are skipped (END-004)
        break
      case 'eor': {
        const r = eorHook(s, bundle)
        s = r.state
        if (r.paused) return { state: s }
        break
      }
      case 'arrivals': {
        const r = eorArrivals(s, bundle)
        s = r.state
        if (r.paused) return { state: s }
        break
      }
      case 'cleanup': s = stepCleanup(s, bundle); break
      case 'initiative': return { state: startRound({ ...stepInitiative(s, bundle), turn: null }, bundle) }
    }
  }
  return { state: s }
}

/** Final round only, before step 1: every unit still in Reserves is Destroyed; the opponent scores its Supply (FIN-001). */
function sweepReserves(state: GameState, bundle: EditionBundle): GameState {
  if (!finalRound(state)) return state
  let s = state
  for (const u of Object.values(state.units)) {
    if (u.location !== 'reserves') continue
    const live = u.modelIds.filter((id) => s.models[id] && s.models[id]!.life !== 'dead')
    if (live.length) s = removeModels(s, bundle, u.id, live, 'reserveSweep')
  }
  return s
}

/** Step 1: control.updateControl (marker.controller, Sticky Control). */
export function stepControl(state: GameState, bundle: EditionBundle): GameState { return updateControl(state, bundle) }

/** CLAIMs (Artefact Hunt) between steps 1 and 2, marker holder first (RULING R17-7); one decision per claim. */
function claimStep(state: GameState, bundle: EditionBundle): { state: GameState; paused: boolean } {
  const claim = missionOf(state, bundle)?.claim
  if (!claim || claim.phase !== 'scoring' || state.round < claim.fromRound) return { state, paused: false }
  const holder = holderOf(state)
  for (const seat of [holder, ...state.seatOrder.filter((x) => x !== holder)]) {
    if (state.passed.includes(seat) || claimOptions(state, bundle, seat).length === 0) continue
    return { state: raiseClaim(state, bundle, seat), paused: true }
  }
  return { state: { ...state, passed: [] }, paused: false }
}

/** Step 2: VP from the Mission's ScoringRules (supply destroyed via the supply-lost ledger, markers...), all seats at once. */
export function stepVP(state: GameState, bundle: EditionBundle): GameState {
  const results = state.seatOrder.map((seat) => ({ seat, ...scoreRules(state, bundle, seat) }))
  let s = state
  const cashed = new Set(results.flatMap((r) => r.cashed))
  for (const r of results) {
    const st = s.seats[r.seat]!
    s = { ...s, seats: { ...s.seats, [r.seat]: { ...st, vp: st.vp + r.vp, score: st.vp + r.vp } } }
    s = pushEvents(s, [{ type: 'vpScored', seat: r.seat, round: s.round, vp: r.vp, lines: r.lines }])
  }
  if (cashed.size) s = { ...s, markers: s.markers.map((m) => (cashed.has(m.n) ? { ...m, onTable: false } : m)) }
  return s
}

const hasModels = (s: GameState, seat: SeatId): boolean => Object.values(s.models).some((m) => m.owner === seat && m.life !== 'dead')

/** Step 3: special win, elimination (+eliminationVP) and final Round; sets state.result and phase 'over'. */
export function stepEndCheck(state: GameState, bundle: EditionBundle): GameState {
  const mission = missionOf(state, bundle)
  const vpOf = (s: GameState, seat: SeatId): number => s.seats[seat]!.vp
  const lead = mission?.specialWinLead ?? null
  if (lead !== null) {
    for (const seat of state.seatOrder) {
      if (state.seatOrder.every((o) => o === seat || vpOf(state, seat) - vpOf(state, o) >= lead)) {
        return endGame(state, seat, `${seat} led by ${lead} VP or more, which ends the game at once.`, undefined, 'special')
      }
    }
  }
  const out = state.seatOrder.filter((seat) => !hasModels(state, seat))
  let s = state
  if (out.length === 1) { // both gone at once: nobody gains the bonus (R11-8)
    const gain = rule(bundle, 'eliminationVP')
    for (const seat of state.seatOrder.filter((x) => x !== out[0])) {
      const st = s.seats[seat]!
      s = pushEvents({ ...s, seats: { ...s.seats, [seat]: { ...st, vp: st.vp + gain, score: st.vp + gain } } }, [{ type: 'vp', seat, n: gain, source: 'elimination', round: s.round }])
    }
  }
  if (out.length === 0 && !finalRound(s)) return s
  const top = Math.max(...s.seatOrder.map((x) => vpOf(s, x)))
  const leaders = s.seatOrder.filter((x) => vpOf(s, x) === top)
  const why = out.length ? 'A side ran out of models.' : 'The last round is over.'
  return leaders.length === 1
    ? endGame(s, leaders[0]!, `${why} ${leaders[0]} finishes with the most VP.`, undefined, 'vp')
    : endGame(s, null, `${why} The VP are level, so nobody wins.`, undefined, 'draw')
}

function eorHook(state: GameState, bundle: EditionBundle): { state: GameState; paused: boolean } {
  const h = runHook(state, bundle, 'endOfRound', { seat: holderOf(state) })
  return { state: h.state, paused: !!h.raised }
}
function eorArrivals(state: GameState, bundle: EditionBundle): { state: GameState; paused: boolean } {
  const r = resolveArrivals(state, bundle)
  // A rejected arrival pass leaves the queued rows where they are (they retry next Round) and says so in the event log.
  if (isRejection(r)) return { state: pushEvents(state, [{ type: 'arrivalsDeferred', round: state.round, code: r.code, message: r.message }]), paused: false }
  return { state: r.state, paused: !r.done }
}

/** Step 4: End of the Round effects (endOfRound hook) and reserves.resolveArrivals, marker holder first. */
export function stepEndOfRound(state: GameState, bundle: EditionBundle): StepResult {
  const h = eorHook(state, bundle)
  if (h.paused) return { state: h.state }
  const a = eorArrivals(h.state, bundle)
  return a.paused ? { state: a.state } : { state: a.state, done: { modelId: '', type: 'score.endOfRound', triggers: [] } }
}

/** Step 5: Cleanup & Refresh: markers, tokens, timed effects, cards Ready, ledgers (CLN-001..004). */
export function stepCleanup(state: GameState, bundle: EditionBundle): GameState {
  let s: GameState = {
    ...state,
    units: Object.fromEntries(Object.entries(state.units).map(([id, u]) => [id, { ...u, activation: null, noShootChargeRound: null }])),
    tokens: state.tokens.filter((t) => {
      const src = t.sourceId ? state.units[t.sourceId] : undefined
      const owner = src ? unitDef(bundle, src.profileId) : t.sourceId ? cardDef(bundle, t.sourceId) : undefined
      return tokenDef(bundle, owner ?? null, t.defId)?.stayInPlay === true || tokenGrants(state, bundle, t, 'STAY_IN_PLAY')
    }),
    detectors: state.detectors.filter((d) => d.expires === 'permanent' || d.expires === 'whileCondition' || d.expires === 'burrowLinked'),
    cards: Object.fromEntries(Object.entries(state.cards).map(([seat, cs]) => [seat, cs.map((c) => ({ ...c, exhausted: false }))])),
    seats: Object.fromEntries(Object.entries(state.seats).map(([id, st]) => [id, { ...st, supplyLostThisRound: 0 }])),
    reactionsUsed: [],
  }
  s = expireEffects(s, bundle, 'endOfRound')
  return runHook(s, bundle, 'cleanup', {}).state
}

/** Step 6: fewer VP takes the First Player Marker; tie -> firstPlayer null (Roll-Off next Start of Round). */
export function stepInitiative(state: GameState, _bundle: EditionBundle): GameState {
  const [a, b] = state.seatOrder
  const va = state.seats[a!]!.vp, vb = state.seats[b!]!.vp
  const next = va < vb ? a! : vb < va ? b! : null
  return pushEvents({ ...state, firstPlayer: next }, [{ type: 'initiativeSet', seat: next, round: state.round }])
}

export const scoring: ModuleDef = {
  id: 'scoring',
  kinds: ['score'],
  options: () => [],
  resolve(state, bundle, action): StepResult {
    if (action.type !== 'score.order' || state.pending.kind !== 'score.order') return reject('E_UNKNOWN_KIND', `The Scoring Phase does not handle ${action.type}.`)
    const ids = state.pending.context['effects']
    const order = action['order']
    if (!Array.isArray(ids) || !Array.isArray(order) || order.length !== ids.length || !ids.every((x) => order.includes(x))) {
      return reject('E_BAD_PARAM', 'Give every effect exactly once.')
    }
    return resumeScoring(state, bundle)
  },
}
