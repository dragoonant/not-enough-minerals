// Checklist: CA, CARD, MSN (code-hook cards), the {code} hooks listed in data/<edition>/hooks/*.json. Owner B.
// code-hooks.ts: implementations of every `{code: <hook>}` named in data. One entry per hook id; a data hook missing
// here is an M2 runtime error (spec 20 s9), so a test walks bundle.records.hooks and checks CODE_HOOKS has each.
//
// Numbers a hook needs (6", 1") are read from the hook's own data text (hookInches), never typed here.
import type { CodeRef, EditionBundle, Id } from '../data/types'
import { cardDef, deploymentDef, rule, segmentToWorld, tableOf } from './edition'
import { reject, todo } from './errors'
import type { HookCtx, HookResult } from './hooks'
import { dist, segPointDist } from './geometry'
import { addEffect, abilitiesOf, conditionHolds, tableModels, unitDistance, unitToPoint, weaponProfile } from './effects'
import { canTarget } from './visibility'
import { modelDistance } from './measure'
import { returnToReserves } from './reserves'
import { raiseRecall } from './abilities'
import type { GameState, Rejection, SeatId, UnitId, Vec2 } from './types'

/** A hook's result; `rejection` refuses the whole ability (bad spot), `veto` means "not usable now" (E_USED). */
export type CodeResult = HookResult & { rejection?: Rejection }
/** An effect-like hook (op 'code', scoring kind 'code'). */
export type CodeHook = (state: GameState, bundle: EditionBundle, args: Record<string, unknown>, ctx: HookCtx) => CodeResult
/** A condition hook (Condition.code). */
export type CodeCondition = (state: GameState, bundle: EditionBundle, args: Record<string, unknown>, ctx: HookCtx) => boolean

const ok = (state: GameState): CodeResult => ({ state, mods: [] })
const fail = (state: GameState, rejection: Rejection): CodeResult => ({ state, mods: [], rejection })

/** The first "N inch(es)" in the hook's data text: the distance that hook works with. */
export function hookInches(bundle: EditionBundle, id: Id): number {
  const text = bundle.records.hooks.find((h) => h.id === id)?.text ?? ''
  const m = /(\d+(?:\.\d+)?)\s*inch/i.exec(text)
  if (!m) throw new Error(`hook "${id}": its data text names no distance`)
  return Number(m[1])
}

const holder = (state: GameState, ctx: HookCtx): UnitId | undefined => ctx.selfUnitId ?? ctx.unitId ?? state.activeUnit ?? undefined
const seatOf = (state: GameState, ctx: HookCtx): SeatId | undefined => ctx.seat ?? (holder(state, ctx) ? state.units[holder(state, ctx)!]?.owner : undefined)

/** Tokens that stand for rules state (spec 16 s8): a closed table edge and the First Player Marker lock. */
export const CLOSED_EDGE = 'closed-edge'
export const FIRST_PLAYER_LOCK = 'first-player-lock'
/** Table edges closed to enemy Deploys right now, with the seat that closed each (Comsat Station). */
export function closedEdges(state: GameState): { edge: string; owner: SeatId }[] {
  return state.tokens.filter((t) => t.defId === CLOSED_EDGE).map((t) => ({ edge: String(t.sourceId), owner: t.owner }))
}
/** The seat that locked the First Player Marker for the rest of the Phase (Terran Tenacity), or null. */
export function firstPlayerLock(state: GameState): SeatId | null {
  return state.tokens.find((t) => t.defId === FIRST_PLAYER_LOCK)?.owner ?? null
}

function addToken(state: GameState, defId: Id, owner: SeatId, sourceId: Id | null, pos: Vec2): GameState {
  const n = state.tokens.filter((t) => t.defId === defId).length + 1
  return { ...state, tokens: [...state.tokens, { id: `${defId}-${n}-r${state.round}`, defId, owner, sourceId, pos, elev: 0, round: state.round }] }
}

/** Does the point lie within `r` of a friendly Entry Edge, a friendly Omega Worm base or one of the seat's tumors? */
function nearCreepSource(state: GameState, bundle: EditionBundle, seat: SeatId, p: Vec2, r: number): boolean {
  const colour = state.seats[seat]?.colour
  const dep = state.deploymentId ? deploymentDef(bundle, state.deploymentId) : undefined
  if (dep && colour) {
    for (const seg of dep.entryEdges[colour]) {
      const [a, b] = segmentToWorld(seg, dep.size)
      if (segPointDist(a, b, p).d <= r + 1e-6) return true
    }
  }
  for (const u of Object.values(state.units)) {
    if (u.owner !== seat || u.location !== 'table') continue
    if (abilitiesOf(bundle, u).some((a) => a.effects.some((e) => e.op === 'altEntry' && e.kind === 'unitBase')) && unitToPoint(state, u.id, p) <= r + 1e-6) return true
  }
  return state.tokens.some((t) => t.defId === 'creep-tumor' && t.owner === seat && dist(t.pos, p) <= r + 1e-6)
}

/** Hooks that need a spot picked first (the interpreter asks, then calls them with ctx.point). */
export const CODE_NEEDS_POINT: ReadonlySet<Id> = new Set(['creep-tumor-spawn'])
/** Passive hooks without a trigger run at these hook points (hooks.runHook finds them on Ready cards and Units). */
export const CODE_POINTS: Readonly<Record<Id, readonly string[]>> = {
  'creep-tumor-removal': ['onMoveEnd', 'onArrive'],
  'omega-network-recall': ['onMoveEnd'],
}

/** Effect hooks by id. Every hook named in data/<edition>/hooks/*.json has an entry. */
export const CODE_HOOKS: Readonly<Record<Id, CodeHook>> = {
  /** Comsat Station: close one non-Entry table edge to enemy Deploys until the Round ends (token, removed at Cleanup). */
  'deny-deploy-edge'(state, _bundle, _args, ctx) {
    const seat = seatOf(state, ctx)
    const edge = ctx.edge
    if (!seat || !edge || !'NSEW'.includes(edge)) return fail(state, reject('E_BAD_PARAM', 'Name the table edge to close (N, S, E or W).'))
    const { w, d } = state.scenario.table
    const pos = edge === 'N' ? { x: 0, z: -d / 2 } : edge === 'S' ? { x: 0, z: d / 2 } : edge === 'W' ? { x: -w / 2, z: 0 } : { x: w / 2, z: 0 }
    return ok(addToken(state, CLOSED_EDGE, seat, edge, pos))
  },

  /** Terran Tenacity: take the First Player Marker now; it stays locked to you until the Phase ends. */
  'claim-first-player-marker'(state, _bundle, _args, ctx) {
    const seat = seatOf(state, ctx)
    if (!seat) return fail(state, reject('E_BAD_PARAM', 'No seat claims the marker.'))
    const s = addToken({ ...state, firstPlayer: seat }, FIRST_PLAYER_LOCK, seat, state.roundPhase, { x: 0, z: 0 })
    return ok(s)
  },

  /** Barracks (Proxy) / Warp Gate: refuse when a friendly Unit already came in this way this Round; otherwise log it. */
  'forward-deploy-once-per-round'(state, _bundle, _args, ctx) {
    const seat = seatOf(state, ctx)
    const src = ctx.sourceId
    const card = seat && src ? (state.cards[seat] ?? []).find((c) => cardDef(_bundle, c.id)?.abilities.some((a) => a.id === src)) : undefined
    if (!seat || !card) return fail(state, reject('E_BAD_PARAM', 'This hook belongs to a card.'))
    const key = `${src}:forward:${state.round}`
    if ((card.usage[key] ?? 0) >= 1) return { state, mods: [], veto: true }
    return ok({ ...state, cards: { ...state.cards, [seat]: state.cards[seat]!.map((c) => (c === card ? { ...c, usage: { ...c.usage, [key]: 1 } } : c)) } })
  },

  /** Creep Spread / Excrete Creep / Source: set a Creep Tumor within the hook's range of a friendly source; no sight needed. */
  'creep-tumor-spawn'(state, bundle, _args, ctx) {
    const seat = seatOf(state, ctx)
    if (!seat || !ctx.point) return fail(state, reject('E_BAD_PARAM', 'Choose where the tumor goes.'))
    if (!nearCreepSource(state, bundle, seat, ctx.point, hookInches(bundle, 'creep-tumor-spawn'))) {
      return fail(state, reject('E_OUT_OF_RANGE', 'A tumor goes near a friendly Entry Edge, Omega Worm or tumor.'))
    }
    return ok(addToken(state, 'creep-tumor', seat, ctx.sourceId ?? null, ctx.point))
  },

  /** Creep Removal (passive on both Creep Cards): an enemy that ends a listed action near a friendly tumor removes it. */
  'creep-tumor-removal'(state, bundle, args, ctx) {
    const mover = ctx.unitId ? state.units[ctx.unitId] : undefined
    const owner = ctx.seat
    const kind = ctx.kind ?? (ctx.entry ? 'deploy' : ctx.cause ?? 'move')
    const actions = (args.actions as string[] | undefined) ?? []
    if (!mover || !owner || mover.owner === owner || !actions.includes(kind)) return ok(state)
    const r = hookInches(bundle, 'creep-tumor-removal')
    const keep = state.tokens.filter((t) => !(t.defId === 'creep-tumor' && t.owner === owner && unitToPoint(state, mover.id, t.pos) <= r + 1e-6))
    return ok(keep.length === state.tokens.length ? state : { ...state, tokens: keep })
  },

  /** Zerg Creep: army building takes exactly one Creep Card; army.validateArmy enforces it, there is no runtime effect. */
  'zerg-creep-army-building'(state) {
    return ok(state)
  },

  /** Omega Network / Pylon Warp-In: a summoned structure acts dormant this Round (only Structure works). */
  'dormant-summoned-structure'(state, _bundle, _args, ctx) {
    const id = ctx.selfUnitId && state.units[ctx.selfUnitId]?.summoned ? ctx.selfUnitId : undefined
    // the interpreter runs this right after `summon`; the new Unit is the most recent summoned Unit of the seat
    const seat = seatOf(state, ctx)
    const target = id ?? Object.values(state.units).filter((u) => u.summoned && u.owner === seat).map((u) => u.id).pop()
    if (!target) return ok(state)
    return ok(addEffect(state, target, { source: ctx.sourceId ?? 'dormant', kind: 'mod', expires: 'endOfRound', bySeat: seat ?? '', round: state.round, data: { op: 'dormant' } }))
  },

  /** Bound by the Khala: after the active Unit is done, another friendly Unit activates at once (turnflow reads the marker). */
  'bound-by-the-khala'(state, _bundle, _args, ctx) {
    const u = holder(state, ctx)
    const seat = seatOf(state, ctx)
    if (!u || !seat) return fail(state, reject('E_BAD_TARGET', 'There is no active Unit.'))
    return ok(addEffect(state, u, { source: ctx.sourceId ?? 'bound-by-the-khala', kind: 'mod', expires: 'endOfRound', bySeat: seat, round: state.round, data: { op: 'boundByKhala' } }))
  },

  /** Mass Recall: friendly Protoss Units near the indicator that was just placed go back to Reserves. */
  'mass-recall'(state, bundle, _args, ctx) {
    const seat = seatOf(state, ctx)
    const tok = state.tokens.find((t) => t.id === ctx.tokenId) ?? state.tokens.filter((t) => t.owner === seat && t.defId === 'faction-indicator').pop()
    if (!seat || !tok) return fail(state, reject('E_BAD_PARAM', 'Place the indicator first.'))
    const r = hookInches(bundle, 'mass-recall')
    let s = state
    for (const u of Object.values(state.units)) {
      if (u.owner !== seat || u.location !== 'table' || unitToPoint(s, u.id, tok.pos) > r + 1e-6) continue
      if (!(conditionHolds(s, bundle, { race: 'protoss' }, u.id))) continue
      s = returnToReserves(s, bundle, u.id, ctx.sourceId ?? 'mass-recall')
    }
    return ok(s)
  },

  /** Hierarch's Stand: move a declared ranged attack onto this Unit when it is a legal target of that attack. */
  'redirect-attack'(state, bundle, _args, ctx) {
    const self = ctx.selfUnitId, attacker = ctx.unitId
    if (!self || !attacker || !ctx.batch) return ok(state)
    const verdict = canTarget(state, bundle, attacker, self, { ranged: true, needsLos: true, actorModelIds: ctx.batch.attackerModelIds })
    if (!verdict.ok) return ok(state)
    const w = ctx.batch.weaponId ? weaponProfile(state, bundle, attacker, ctx.batch.weaponId) : null
    const range = typeof w?.range === 'number' ? w.range : null
    if (range !== null) {
      const mine = tableModels(state, self)
      const shooters = ctx.batch.attackerModelIds.map((id) => state.models[id]).filter((m) => !!m)
      if (!shooters.some((m) => mine.some((t) => modelDistance(m!, t) <= range + 1e-6))) return ok(state)
    }
    return ok(addEffect(state, attacker, { source: ctx.sourceId ?? 'redirect-attack', kind: 'mod', expires: 'thisAttack', bySeat: seatOf(state, ctx) ?? '', round: state.round, data: { op: 'redirect', unit: self } }))
  },

  /** Coordinated Strike: the Siege Tank may fire its Shock Cannon near the chosen friend at any range (shooting reads it). */
  'coordinated-strike'(state, _bundle, _args, ctx) {
    const tank = holder(state, ctx)
    const friend = ctx.targetUnitId
    const seat = seatOf(state, ctx)
    if (!tank || !friend || !seat) return fail(state, reject('E_BAD_TARGET', 'Pick the friend who spots.'))
    return ok(addEffect(state, tank, { source: ctx.sourceId ?? 'coordinated-strike', kind: 'mod', expires: 'endOfRound', bySeat: seat, round: state.round, data: { op: 'coordinatedStrike', friend } }))
  },

  /** Omega Network: a Unit whose Leading Model ends a move touching the Omega Worm may return to Reserves (a choice). */
  'omega-network-recall'(state, bundle, _args, ctx) {
    const worm = ctx.selfUnitId, mover = ctx.unitId ? state.units[ctx.unitId] : undefined
    const kind = ctx.kind ?? ctx.cause ?? 'move'
    if (!worm || !mover || mover.owner !== state.units[worm]?.owner || mover.id === worm || (kind !== 'move' && kind !== 'run')) return ok(state)
    const lead = mover.leadingModelId ? state.models[mover.leadingModelId] : undefined
    if (!lead || !tableModels(state, worm).some((w) => modelDistance(lead, w) <= 1e-6)) return ok(state)
    // "may go back": the owner decides (ability.target, raised from the move's hook).
    return { state: raiseRecall(state, mover.id, 'omega-network-recall'), mods: [], raised: true }
  },

  /** Transfusion: it may protect a Structure (CA-003 exception). The permission is read by abilities' target check. */
  'transfusion-allows-structure'(state) {
    return ok(state)
  },
}

/** Condition hooks by id. */
export const CODE_CONDITIONS: Readonly<Record<Id, CodeCondition>> = {
  /** Adept / Nerazim Watchers Psionic Transfer: not while the Unit carries a claimed Mission Marker. */
  'not-carrying-claimed-marker'(state, _bundle, _args, ctx) {
    const u = ctx.unitId
    return !u || !state.markers.some((m) => m.claimedBy === u)
  },
}

/** Run an effect hook. */
export function runCode(state: GameState, bundle: EditionBundle, ref: CodeRef, ctx: HookCtx): CodeResult {
  const h = CODE_HOOKS[ref.code]
  if (!h) return todo(`code hook "${ref.code}"`)
  return h(state, bundle, ref.args ?? {}, ctx)
}

/** Evaluate a condition hook. */
export function codeCondition(state: GameState, bundle: EditionBundle, code: Id, ctx: HookCtx): boolean {
  const h = CODE_CONDITIONS[code]
  if (!h) return todo(`condition hook "${code}"`)
  return h(state, bundle, {}, ctx)
}

void rule
void tableOf
void unitDistance
