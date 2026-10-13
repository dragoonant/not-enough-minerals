// Checklist: MOVE (MOVE-001..061), PH1, DIS (Disengage moves), FLY, TOK (moving through tokens), ELEV, BASE, ZOI-003. Owner M.
// movement.ts: reposition(unit, spec), the one repositioning mechanism (spec 00 s4; spec 14 s8): Leading Model path,
// then squads.placeFormation; coherency and Zone of Influence checked once at the end; fires onMoveEnd (and
// onPlaceResolved for PLACE). Move, Run, Deploy, Disengage, Charge, Close Ranks, PLACE and forced moves all use it.
// Namespace 'move' (a move.go, move.run, move.disengage; k move.path, move.place).
import type { EditionBundle } from '../data/types'
import { rule } from './edition'
import { effectOps, setStatus } from './effects'
import { isEngaged } from './engage'
import { isRejection, reject, TodoError } from './errors'
import { baseRadius, dist, EPS, isOnTable, lerp } from './geometry'
import { runHook, type HookCtx } from './hooks'
import { inEnemyZoneOf } from './measure'
import { removeModels } from './damage'
import { option, pushEvents, raiseDecision, updateUnit, type ActionDone, type ModuleDef, type StepResult } from './registry'
import {
  bearing, dataOps, endProblem, isFlyingUnit, leadingModel, moveThrough, placeFormation, squadCtx, statusOn, tableModels, tokenBodies, unitModels, unitSize, unitSpeed,
  type EndOpts, type SquadCtx,
} from './squads'
import { hasTacticalMass } from './supply'
import { accessDistance, crushable, crushableUnder, grassUnder, heightAt, inOpening, pointInShape, distToShape, scPieces, SOLID_TERRAIN_SIZE, surfaceAt } from './terrain'
import type { Action, GameEvent, GameState, ModelId, Rejection, RejectionCode, UnitId, Vec2 } from './types'

export type RepositionKind = 'move' | 'run' | 'deploy' | 'disengage' | 'charge' | 'closeRanks' | 'place' | 'forced'

export interface RepositionSpec {
  kind: RepositionKind
  leaderId: ModelId
  /** Leading Model waypoints (world); a PLACE gives just the destination. */
  path: Vec2[]
  /** Path length limit in inches (Speed, Run, charge roll, PLACE X). */
  maxDist: number
  /** Optional explicit positions for the other models (else placeFormation decides). */
  placement?: Record<ModelId, Vec2>
  /** Enemy units the move may end within Engagement Range of (charge targets, units already Engaged). */
  allowEngage?: UnitId[]
  /** Units the Leading Model must end within Engagement Range of (Charge success, CHG-004). */
  mustEngage?: UnitId[]
  /** Close Ranks: must end closer to these units than it started (CC-010). */
  mustCloseOn?: UnitId[]
  /** No model may end within this many inches of an enemy model (minEnemyDist on PLACE / arrivals). */
  minEnemyDist?: number
  /** Where the Leading Model starts when it is not on the table (Deploy: just outside its Entry Edge). Default: its position. */
  from?: Vec2
  /** Ban ending in an enemy Zone of Influence (default: true for Deploy, false otherwise; ZOI-003). */
  banZone?: boolean
  /** Namespace whose resume() continues the caller's flow when a Reaction window opens at the end hooks ('move', 'deploy'...). */
  returnTo?: string
}

/** A hook that still has to fire because an earlier one at the end of the same reposition opened a Reaction window. The
 *  caller stores it with its stage event and calls firePending() from its resume(). */
export interface PendingHook { point: 'onPlaceResolved' | 'onArrive'; ctx: HookCtx }

export interface RepositionResult {
  state: GameState
  events: GameEvent[]
  inCoherency: boolean
  /** Models removed because no linked spot existed (COH-004). */
  casualties: ModelId[]
  /** A Reaction window opened at an end hook (onMoveEnd / onPlaceResolved / onArrive): the caller must stop, keep `state`
   *  as it is (the window is its pending decision) and continue in its resume() through `returnTo`. */
  raised?: boolean
  /** The end hook that has not fired yet because `raised` cut the sequence short. */
  pending?: PendingHook[]
}

/** Fire the hooks left over by a raised Reaction window (see PendingHook), in order; stops at the next window and returns
 *  what is still to fire in `rest`. */
export function firePending(state: GameState, bundle: EditionBundle, pending: PendingHook[], returnTo: string): { state: GameState; raised: boolean; rest: PendingHook[] } {
  let s = state
  for (let i = 0; i < pending.length; i++) {
    const h = runHook(s, bundle, pending[i]!.point, { ...pending[i]!.ctx, returnTo })
    s = h.state
    if (h.raised) return { state: s, raised: true, rest: pending.slice(i + 1) }
  }
  return { state: s, raised: false, rest: [] }
}

const STEP = 0.1
/** Kinds after which the unit is no longer BURROWED (VIS-023). */
const BURROW_ENDERS: readonly RepositionKind[] = ['move', 'run', 'deploy', 'disengage', 'closeRanks']
/** Kinds that destroy Grass they cross or end on (MOVE-030); PLACE and forced moves never do. */
const GRASS_KINDS: readonly RepositionKind[] = ['move', 'run', 'deploy', 'disengage', 'charge', 'closeRanks']

const bad = (code: RejectionCode, message: string, detail?: Record<string, unknown>): Rejection => reject(code, message, detail)

/** Map an endProblem() message to a rejection code. */
function endCode(msg: string): RejectionCode {
  if (msg.startsWith('inside Engagement')) return 'E_ENGAGED'
  if (msg.startsWith('overlaps')) return 'E_BASE_OVERLAP'
  return 'E_PLACEMENT'
}

/** Gap Clearance in inches for the unit's Size (MOVE-040, rules.json gapClearance). */
export function clearanceFor(bundle: EditionBundle, size: number, large = false): number {
  const g = rule(bundle, 'gapClearance')
  return large || size >= g.largeFromSize ? g.large : g.small
}

/** Does the unit keep BURROWED through a Move or Run (Tunneling Claws: status keepOnMove)? VIS-023, VIS-027. */
export function keepsBurrowOnMove(state: GameState, bundle: EditionBundle, unitId: UnitId): boolean {
  return dataOps(state, bundle, unitId, 'status').some((n) => n['mode'] === 'keepOnMove' && n['status'] === 'BURROWED')
}

/** Move reach of the unit (query.reachOf uses it): Move and Run distances after effects, null when it cannot move. */
export function moveReach(state: GameState, bundle: EditionBundle, unitId: UnitId): { move: number; run: number } | null {
  const sp = unitSpeed(state, bundle, unitId)
  return sp === null || sp <= 0 ? null : { move: sp, run: sp }
}

// ---------------------------------------------------------------- the leading model's path
interface Transit { length: number; grass: Set<string>; tokens: Set<string>; crushed: Set<string> }

function polyline(start: Vec2, pts: Vec2[]): { legs: [Vec2, Vec2][]; length: number } {
  const legs: [Vec2, Vec2][] = []
  let length = 0
  let cur = start
  for (const p of pts) { legs.push([cur, p]); length += dist(cur, p); cur = p }
  return { legs, length }
}

/** Walk the Leading Model's centre along the path in 0.1" steps (spec 14 s8 engine notes): gaps are measured by inflating
 *  obstacles by half the Gap Clearance, level changes need an ACCESS POINT, other units' models and Size 2+ terrain stop it. */
function transit(ctx: SquadCtx, kind: RepositionKind, start: Vec2, pts: Vec2[], leaderBase: number): Transit | Rejection {
  const { state, bundle } = ctx
  const W = state.scenario.table.w, D = state.scenario.table.d
  const out: Transit = { length: 0, grass: new Set(), tokens: new Set(), crushed: new Set() }
  const { legs, length } = polyline(start, pts)
  out.length = length
  const inside = (p: Vec2): boolean => Math.abs(p.x) <= W / 2 + 1e-6 && Math.abs(p.z) <= D / 2 + 1e-6
  let entered = inside(start)
  if (!entered && kind !== 'deploy') return bad('E_PLACEMENT', 'The Leading Model starts off the table.')
  if (ctx.flying) {
    for (const [a, b] of legs) {
      const n = Math.max(1, Math.ceil(dist(a, b) / STEP))
      for (let i = 1; i <= n; i++) {
        const ok = inside(lerp(a, b, i / n))
        if (!entered && ok) entered = true
        else if (entered && !ok) return bad('E_PATH_BLOCKED', 'The path leaves the table.')
      }
    }
    return out
  }
  const size = unitSize(state, bundle, ctx.unitId)
  const clearance = clearanceFor(bundle, size, ctx.large)
  const half = clearance / 2
  const through = moveThrough(state, bundle, ctx.unitId)
  const er = ctx.er
  // BURROWED models may be moved through (VIS-025; endProblem still keeps the end off their bases and Engagement Range),
  // and DISPLACEMENT models are pushed aside rather than blocking (KW-042)
  const burrowed = new Map<string, boolean>()
  const underground = (unitId: string): boolean => { if (!burrowed.has(unitId)) burrowed.set(unitId, statusOn(state, unitId, 'BURROWED')); return burrowed.get(unitId)! }
  const grounded = ctx.foreign.filter((o) => !o.flying && !o.displace && !underground(o.unitId))
  // obstacles the start already crowds are ignored while the path does not move closer to them
  const startGap = new Map<string, number>()
  for (const o of grounded) { const g = dist(start, o.pos); if (g < o.r + half) startGap.set(o.id, g) }
  const pieces = scPieces(state)
  let prev = surfaceAt(state, start)
  let fresh = !entered // first sample on the table after coming from outside (Deploy)
  for (const [a, b] of legs) {
    const n = Math.max(1, Math.ceil(dist(a, b) / STEP))
    for (let i = 1; i <= n; i++) {
      const p = lerp(a, b, i / n)
      const ins = inside(p)
      if (!entered) { if (ins) entered = true; else continue }
      else if (!ins) return bad('E_PATH_BLOCKED', 'The path leaves the table.')
      if (!through.units) {
        for (const o of grounded) {
          const d = dist(p, o.pos)
          const lim = startGap.has(o.id) ? Math.min(startGap.get(o.id)!, o.r + half) : o.r + half
          if (d < lim - 1e-9) return bad('E_PATH_BLOCKED', `The path squeezes past ${o.id} in a gap narrower than ${clearance}".`, { blocker: o.id })
        }
      }
      for (const t of ctx.tokens) {
        if (t.blocksMax === null || dist(p, t.pos) >= t.r + (size <= t.blocksMax ? half : 0)) continue
        if (size <= t.blocksMax) return bad('E_PATH_BLOCKED', `${t.id} blocks a unit of Size ${size}.`, { blocker: t.id })
        if (t.removedBy === 'movement' || t.removedBy === 'any') out.tokens.add(t.id)
      }
      for (const pc of pieces) {
        if (pc.grass) { if (pointInShape(p, pc.shape)) out.grass.add(pc.t.id); continue }
        if (ctx.large && crushable(pc)) { if (pointInShape(p, pc.shape)) out.crushed.add(pc.t.id); continue }
        if (through.terrainMax !== null && pc.size <= through.terrainMax) continue
        if (pc.walkable) {
          // from outside, the edge of a walkable piece is as solid as a wall except at its ACCESS POINTS (ELEV-005)
          if (!pointInShape(p, pc.shape) && distToShape(p, pc.shape) < half - 1e-9 && accessDistance(pc, p) > er + 1e-9) {
            return bad('E_PATH_BLOCKED', `The gap beside ${pc.t.id} is narrower than ${clearance}".`, { blocker: pc.t.id })
          }
          continue
        }
        if (pc.size < SOLID_TERRAIN_SIZE) continue
        if (distToShape(p, pc.shape) < half - 1e-9 && !inOpening(pc, p, clearance)) {
          return bad('E_PATH_BLOCKED', `Size ${pc.size} terrain ${pc.t.id} is in the way (gaps need ${clearance}").`, { blocker: pc.t.id })
        }
      }
      const cur = surfaceAt(state, p)
      // a Deploy may step straight onto High Ground that touches its Entry Edge (DEP-006): no access point is needed at the edge
      const atEdge = kind === 'deploy' && (W / 2 - Math.abs(p.x) < 0.25 || D / 2 - Math.abs(p.z) < 0.25)
      if (cur !== prev && !fresh && !atEdge) {
        const up = !cur ? prev! : !prev ? cur : cur.es >= prev.es ? cur : prev
        const free = through.terrainMax !== null && through.noAccess && up.size <= through.terrainMax
        if (!free && accessDistance(up, p) > er + 1e-9) {
          return bad('E_PATH_BLOCKED', `Level changes only at an access point (${up.t.id}).`, { blocker: up.t.id })
        }
      }
      fresh = false
      prev = cur
    }
  }
  return out
}

/** Cut a forced move short where it would leave the table: it stops in contact with the edge (MOVE-052). */
function clampForced(state: GameState, start: Vec2, pts: Vec2[], r: number): Vec2[] {
  const W = state.scenario.table.w / 2 - r, D = state.scenario.table.d / 2 - r
  const out: Vec2[] = []
  let cur = start
  for (const p of pts) {
    if (Math.abs(p.x) <= W + EPS && Math.abs(p.z) <= D + EPS) { out.push(p); cur = p; continue }
    let t = 1
    const dx = p.x - cur.x, dz = p.z - cur.z
    if (Math.abs(dx) > 1e-12) t = Math.min(t, ((dx > 0 ? W : -W) - cur.x) / dx)
    if (Math.abs(dz) > 1e-12) t = Math.min(t, ((dz > 0 ? D : -D) - cur.z) / dz)
    out.push(lerp(cur, p, Math.max(0, Math.min(1, t))))
    return out
  }
  return out
}

interface LeaderPlan { start: Vec2; end: Vec2; path: Vec2[]; transit: Transit | null; targets: UnitId[]; endOpts: EndOpts; ctx: SquadCtx }

/** Everything about the Leading Model's move: legality of the start, the path, the end spot and the kind's own demands. */
function planLeader(state: GameState, bundle: EditionBundle, unitId: UnitId, spec: RepositionSpec): LeaderPlan | Rejection {
  const unit = state.units[unitId]
  if (!unit || unit.location === 'destroyed') return bad('E_BAD_TARGET', `Unit ${unitId} is not in the game.`)
  const leader = state.models[spec.leaderId]
  if (!leader || leader.unitId !== unitId || leader.life === 'dead') return bad('E_BAD_PARAM', 'The Leading Model must be a live model of the unit.')
  if (spec.kind !== 'deploy' && unit.location !== 'table' && spec.from === undefined) return bad('E_NOT_LEGAL', 'The unit is not on the table.')
  if (!Array.isArray(spec.path) || spec.path.length === 0) return bad('E_BAD_PARAM', 'A path needs at least one point.')
  if (!spec.path.every((p) => p && Number.isFinite(p.x) && Number.isFinite(p.z))) return bad('E_BAD_PARAM', 'The path holds a point that is not a number.')
  // a unit that is entering from Reserves is not being moved (a summoned Pylon has Speed "-"); one on the table is (MOVE-001)
  if (unit.location === 'table' && unitSpeed(state, bundle, unitId) === null) return bad('E_NOT_LEGAL', 'A unit with Speed "-" can never move or be repositioned (MOVE-001).')
  const engaged = unit.location === 'table' && isEngaged(state, bundle, unitId)
  if ((spec.kind === 'move' || spec.kind === 'run' || spec.kind === 'charge') && engaged) return bad('E_ENGAGED', 'An Engaged unit cannot do that; it may Disengage or Hold.')
  if (spec.kind === 'disengage' && !engaged) return bad('E_NOT_ENGAGED', 'Only an Engaged unit can Disengage.')

  const start = spec.from ?? leader.pos
  let path = spec.path
  const r = baseRadius(leader.base)
  if (spec.kind === 'forced') path = clampForced(state, start, path, r)
  const end = path[path.length - 1]!
  const { length } = polyline(start, path)
  const straight = dist(start, end)
  if ((spec.kind === 'move' || spec.kind === 'run') && straight < 1e-6) return bad('E_NOT_LEGAL', 'A Move must change position; a 0" move is a Hold.')
  if (spec.kind === 'place') {
    if (straight > spec.maxDist + 1e-6) return bad('E_TOO_FAR', `The destination is ${straight.toFixed(2)}" away; the limit is ${spec.maxDist}".`)
  } else if (length > spec.maxDist + 1e-6) {
    return bad('E_TOO_FAR', `The path is ${length.toFixed(2)}" long; the limit is ${spec.maxDist}".`)
  }
  const ctx = squadCtx(state, bundle, unitId)
  const t = spec.kind === 'place' ? null : transit(ctx, spec.kind, start, path, leader.base)
  if (t && isRejection(t)) return t
  const targets = [...(spec.allowEngage ?? []), ...(spec.mustEngage ?? []), ...(spec.mustCloseOn ?? [])]
  const endOpts: EndOpts = {
    ...(targets.length ? { targets } : {}),
    ...(spec.minEnemyDist !== undefined ? { avoidEnemyWithin: spec.minEnemyDist } : {}),
  }
  const problem = endProblem(ctx, leader.base, end, [], endOpts)
  if (problem) return bad(endCode(problem), `The Leading Model cannot end there: ${problem}.`)
  // Charge: within Engagement Range of every declared target; Close Ranks: strictly closer to the engaged enemy
  for (const u of spec.mustEngage ?? []) {
    const near = tableModels(state, u).some((m) => Math.max(0, dist(end, m.pos) - r - baseRadius(m.base)) <= ctx.er + 1e-6)
    if (!near) return bad('E_OUT_OF_RANGE', `The Leading Model must end within ${ctx.er}" of ${u}.`)
  }
  if (spec.mustCloseOn?.length) {
    const gap = (p: Vec2): number => Math.min(...spec.mustCloseOn!.flatMap((u) => tableModels(state, u).map((m) => Math.max(0, dist(p, m.pos) - r - baseRadius(m.base)))))
    if (!(gap(end) < gap(start) - 1e-6)) return bad('E_NOT_LEGAL', 'Close Ranks must end closer to the Engaged enemy than it started.')
  }
  return { start, end, path, transit: t, targets, endOpts, ctx }
}

/** Result of one repositioning action (spec 14 s8). Bad paths and placements come back as a Rejection (E_PATH_BLOCKED,
 *  E_TOO_FAR, E_COHERENCY for Deploy, E_ZONE, E_ENGAGED). */
export function reposition(state: GameState, bundle: EditionBundle, unitId: UnitId, spec: RepositionSpec): RepositionResult | Rejection {
  const plan = planLeader(state, bundle, unitId, spec)
  if (isRejection(plan)) return plan
  const unit = state.units[unitId]!
  const leader = state.models[spec.leaderId]!
  const prefer = spec.kind === 'charge' ? 'charge' : spec.kind === 'closeRanks' ? 'closeRanks' : 'none'
  const fixed = spec.placement ? Object.fromEntries(Object.entries(spec.placement).filter(([id]) => id !== leader.id)) : undefined
  const form = placeFormation(state, bundle, unitId, {
    leaderId: leader.id, leaderPos: plan.end, prefer, leaderFrom: plan.start,
    ...(plan.targets.length ? { targets: plan.targets } : {}),
    ...(spec.minEnemyDist !== undefined ? { avoidEnemyWithin: spec.minEnemyDist } : {}),
    ...(fixed ? { fixed } : {}),
  })
  if (!form) return bad('E_PLACEMENT', 'The Leading Model cannot be set there.')
  if (spec.kind === 'deploy' && (!form.inCoherency || form.casualties.length)) {
    return bad('E_COHERENCY', 'A Deploy must put every model In Coherency; this placement does not fit (COH-007).', { outOfCoherency: form.casualties })
  }
  if ((spec.banZone ?? spec.kind === 'deploy')) {
    const hit = Object.entries(form.placement).find(([id, pos]) => inEnemyZoneOf(state, bundle, unit.owner, pos, state.models[id]!.base))
    if (hit) return bad('E_ZONE', `Model ${hit[0]} would stand in the enemy Zone of Influence.`, { model: hit[0] })
  }

  // ---- commit
  const flying = isFlyingUnit(state, bundle, unitId)
  let s: GameState = state
  const models = { ...s.models }
  for (const [id, pos] of Object.entries(form.placement)) {
    const m = models[id]!
    models[id] = { ...m, pos, elev: flying ? 0 : heightAt(s, pos), offTable: false }
  }
  s = { ...s, models }
  const grass = new Set<string>()
  if (GRASS_KINDS.includes(spec.kind)) {
    for (const id of plan.transit?.grass ?? []) grass.add(id)
    for (const [id, pos] of Object.entries(form.placement)) for (const g of grassUnder(s, pos, baseRadius(models[id]!.base))) grass.add(g.t.id)
  }
  if (grass.size) s = { ...s, terrain: s.terrain.filter((t) => !grass.has(t.id)) }
  const tokensGone = new Set(plan.transit?.tokens ?? [])
  if (tokensGone.size) s = { ...s, tokens: s.tokens.filter((t) => !tokensGone.has(t.id)) }
  s = updateUnit(s, unitId, { location: 'table', inCoherency: form.inCoherency, leadingModelId: leader.id })
  if (form.casualties.length) s = removeModels(s, bundle, unitId, form.casualties, 'coherency')
  const ev: GameEvent = {
    type: 'reposition', unitId, kind: spec.kind, leaderId: leader.id, from: plan.start, path: plan.path,
    placement: form.placement, inCoherency: form.inCoherency, casualties: form.casualties, grassDestroyed: [...grass],
  }
  s = pushEvents(s, [ev])
  // VIS-023: Moving, Running, Deploying, Disengaging or Closing Ranks ends BURROWED (and the HIDDEN it brought), unless a
  // keepOnMove effect holds it through a Move or Run (Tunneling Claws). PLACE and forced moves never end it.
  if (BURROW_ENDERS.includes(spec.kind) && statusOn(s, unitId, 'BURROWED') && !((spec.kind === 'move' || spec.kind === 'run') && keepsBurrowOnMove(s, bundle, unitId))) {
    s = setStatus(s, bundle, unitId, 'BURROWED', 'lose', 'move')
  }
  const returnTo = spec.returnTo
  const hookCtx: HookCtx = {
    seat: unit.owner, unitId, modelIds: Object.keys(form.placement), cause: spec.kind, kind: spec.kind, ...(returnTo ? { returnTo } : {}),
  }
  const res = (extra: Partial<RepositionResult> = {}): RepositionResult => ({ state: s, events: [ev], inCoherency: form.inCoherency, casualties: form.casualties, ...extra })
  const h1 = runHook(s, bundle, 'onMoveEnd', hookCtx)
  s = h1.state
  if (h1.raised) return res({ raised: true, ...(spec.kind === 'place' ? { pending: [{ point: 'onPlaceResolved' as const, ctx: hookCtx }] } : {}) })
  if (spec.kind === 'place') {
    const h2 = runHook(s, bundle, 'onPlaceResolved', hookCtx)
    s = h2.state
    if (h2.raised) return res({ raised: true })
  }
  return res()
}

// ---------------------------------------------------------------- feasibility (the menu never offers a dead end)
/** Order of the sixteen bearings: 0, 180, 90, 270, 45... (bit-reversed), so a short list is spread round the circle. */
const BEARING_ORDER = [0, 8, 4, 12, 2, 10, 6, 14, 1, 9, 5, 13, 3, 11, 7, 15]
/** Forward for a unit: the bearing from the Leading Model to the nearest enemy model, else to the table centre. Every
 *  bearing is taken relative to it, so no table axis (and so no seat) is favoured. */
function heading(state: GameState, unitId: UnitId, from: Vec2): number {
  const owner = state.units[unitId]?.owner
  let best: Vec2 | null = null, bd = Infinity
  for (const m of Object.values(state.models)) {
    if (m.owner === owner || !isOnTable(m)) continue
    const d = dist(from, m.pos)
    if (d < bd - 1e-9) { bd = d; best = m.pos }
  }
  return bearing(from, best ?? { x: 0, z: 0 }, 0)
}

type Answer = { leaderId: ModelId; path: Vec2[] }
interface CandOpts { from?: Vec2; maxDist?: number; leaderId?: ModelId; minEnemyDist?: number }

/** Legal destinations for ONE nominated Leading Model: sixteen bearings (measured from its heading) at three distances, each
 *  run through the real path and end checks; with `bent`, two-leg paths too. `limit` stops the search early. */
function candidatesFor(state: GameState, bundle: EditionBundle, unitId: UnitId, kind: RepositionKind, leader: { id: ModelId; pos: Vec2 },
  maxDist: number, opts: CandOpts, bent: boolean, limit: number): Answer[] {
  const out: Answer[] = []
  const from = opts.from ?? leader.pos
  const h0 = heading(state, unitId, from)
  const tryPath = (path: Vec2[]): boolean => {
    const plan = planLeader(state, bundle, unitId, {
      kind, leaderId: leader.id, path, maxDist, ...(opts.from ? { from: opts.from } : {}),
      ...(opts.minEnemyDist !== undefined ? { minEnemyDist: opts.minEnemyDist } : {}),
    })
    if (isRejection(plan)) return false
    out.push({ leaderId: leader.id, path })
    return out.length >= limit
  }
  for (const f of [1, 0.6, 0.3]) {
    for (const i of BEARING_ORDER) {
      const a = h0 + (i / 16) * 2 * Math.PI
      const reachNow = Math.max(0.2, maxDist * f)
      if (tryPath([{ x: from.x + Math.cos(a) * reachNow, z: from.z + Math.sin(a) * reachNow }])) return out
    }
  }
  if (bent) {
    // a detour round a blocker: half the reach out on one bearing, the rest on another
    for (const i of BEARING_ORDER.slice(0, 8)) {
      const a1 = h0 + (i / 8) * 2 * Math.PI
      const mid = { x: from.x + Math.cos(a1) * maxDist * 0.5, z: from.z + Math.sin(a1) * maxDist * 0.5 }
      for (const j of BEARING_ORDER.slice(0, 8)) {
        const a2 = h0 + (j / 8) * 2 * Math.PI
        if (tryPath([mid, { x: mid.x + Math.cos(a2) * maxDist * 0.5, z: mid.z + Math.sin(a2) * maxDist * 0.5 }])) return out
      }
    }
  }
  return out
}

/** Legal destinations for the Leading Model. The player nominates the Leading Model (MOVE-010), so when the default one has
 *  no legal end every other live model is tried, straight first and then bent. HEURISTIC: a finite sample of bearings, not a
 *  proof that no path exists. `limit` stops the search early. */
export function leaderCandidates(state: GameState, bundle: EditionBundle, unitId: UnitId, kind: RepositionKind,
  opts: CandOpts = {}, limit = Infinity): Answer[] {
  const first = opts.leaderId ? state.models[opts.leaderId] : leadingModel(state, unitId)
  const maxDist = opts.maxDist ?? moveReach(state, bundle, unitId)?.move
  if (!first || maxDist === undefined) return []
  const out = candidatesFor(state, bundle, unitId, kind, first, maxDist, opts, false, limit)
  if (out.length || opts.leaderId) return out
  const others = unitModels(state, unitId).filter((m) => m.id !== first.id)
  for (const m of others) { out.push(...candidatesFor(state, bundle, unitId, kind, m, maxDist, opts, false, limit - out.length)); if (out.length >= limit) return out }
  for (const m of [first, ...others]) { out.push(...candidatesFor(state, bundle, unitId, kind, m, maxDist, opts, true, limit - out.length)); if (out.length >= limit) return out }
  return out
}

/** Up to `n` complete path answers whose full repositioning (formation included) succeeds, spread round the circle from the
 *  unit's own heading. The path decisions offer them as ready answers so every legal option validates as given (spec 00 s3.1);
 *  a client may still send its own path (and its own Leading Model) against the open template. */
export function pathAnswers(state: GameState, bundle: EditionBundle, unitId: UnitId, kind: RepositionKind, maxDist: number,
  n = 6, extra: Partial<RepositionSpec> = {}): Answer[] {
  const cands = leaderCandidates(state, bundle, unitId, kind, {
    maxDist, ...(extra.minEnemyDist !== undefined ? { minEnemyDist: extra.minEnemyDist } : {}),
  })
  const out: Answer[] = []
  for (const c of cands) {
    const r = reposition(state, bundle, unitId, { ...extra, kind, leaderId: c.leaderId, path: c.path, maxDist })
    if (!isRejection(r)) { out.push(c); if (out.length >= n) break }
  }
  return out
}

/** Is there any legal destination for some Leading Model (see leaderCandidates)? */
export function hasLegalLeaderMove(state: GameState, bundle: EditionBundle, unitId: UnitId, kind: RepositionKind, opts: CandOpts = {}): boolean {
  return leaderCandidates(state, bundle, unitId, kind, opts, 1).length > 0
}

/** DIS-003: the Disengage has no legal end for any Leading Model, so the default one stays put and is removed as a casualty. */
export function disengageSacrifice(state: GameState, bundle: EditionBundle, unitId: UnitId): GameState {
  const leader = leadingModel(state, unitId)
  return leader ? removeModels(state, bundle, unitId, [leader.id], 'other') : state
}

// ---------------------------------------------------------------- directly towards / away (MOVE-050..052)
/** A straight path for "directly towards / away from" moves: the Leading Model is the model with the shortest route to the
 *  target; towards stops in contact, away stops at the table edge. Detours round blockers are not planned (see issues). */
export function directPath(state: GameState, bundle: EditionBundle, unitId: UnitId, targetUnitId: UnitId, mode: 'towards' | 'away', maxDist: number): { leaderId: ModelId; path: Vec2[] } | null {
  const mine = tableModels(state, unitId), theirs = tableModels(state, targetUnitId)
  if (!mine.length || !theirs.length) return null
  let best: { m: (typeof mine)[number]; t: (typeof theirs)[number]; d: number } | null = null
  for (const m of mine) for (const t of theirs) {
    const d = dist(m.pos, t.pos)
    if (!best || (mode === 'towards' ? d < best.d : d > best.d)) best = { m, t, d }
  }
  if (!best) return null
  const { m, t, d } = best
  if (d < 1e-9) return null
  const ux = (t.pos.x - m.pos.x) / d, uz = (t.pos.z - m.pos.z) / d
  const sign = mode === 'towards' ? 1 : -1
  let go = maxDist
  if (mode === 'towards') go = Math.min(go, Math.max(0, d - baseRadius(m.base) - baseRadius(t.base)))
  const W = state.scenario.table.w / 2 - baseRadius(m.base), D = state.scenario.table.d / 2 - baseRadius(m.base)
  if (Math.abs(ux) > 1e-12) go = Math.min(go, ((sign * ux > 0 ? W : -W) - m.pos.x) / (sign * ux))
  if (Math.abs(uz) > 1e-12) go = Math.min(go, ((sign * uz > 0 ? D : -D) - m.pos.z) / (sign * uz))
  go = Math.max(0, go)
  return { leaderId: m.id, path: [{ x: m.pos.x + sign * ux * go, z: m.pos.z + sign * uz * go }] }
}

// ---------------------------------------------------------------- the move module (menu entries and decisions)
const DOING: Record<'move.go' | 'move.run' | 'move.disengage', RepositionKind> = { 'move.go': 'move', 'move.run': 'run', 'move.disengage': 'disengage' }

/** Menu entries for the activating unit (spec 11 s6.2, s7.2): Move and Disengage in Phase 1, Run in Phase 2. Hold is the
 *  turn flow's. An action is offered only when a legal destination exists, so choosing it is never a dead end. */
function menu(state: GameState, bundle: EditionBundle, unitId: UnitId) {
  const u = state.units[unitId]
  if (!u || u.location !== 'table' || !moveReach(state, bundle, unitId)) return []
  const engaged = isEngaged(state, bundle, unitId)
  const seat = u.owner
  if (state.roundPhase === 'movement' && u.activation === null) {
    if (engaged) return [option('disengage', 'Disengage', 'move.disengage', { unitId }, seat)]
    return hasLegalLeaderMove(state, bundle, unitId, 'move') ? [option('move', 'Move', 'move.go', { unitId }, seat)] : []
  }
  if (state.roundPhase === 'assault' && u.activation === 'movement' && !engaged) {
    return hasLegalLeaderMove(state, bundle, unitId, 'run') ? [option('run', 'Run', 'move.run', { unitId }, seat)] : []
  }
  return []
}

/** DIS-003: no model has a legal end, so the Leading Model is lost and the activation ends. */
function sacrifice(state: GameState, bundle: EditionBundle, unitId: UnitId): StepResult {
  const leader = leadingModel(state, unitId)
  return { state: disengageSacrifice(state, bundle, unitId), done: { modelId: leader?.id ?? '', unitId, type: 'move.disengage', triggers: [], endsActivation: true } }
}

/** Raise the path decision for a declared Move, Run or Disengage. */
function askPath(state: GameState, bundle: EditionBundle, unitId: UnitId, type: 'move.go' | 'move.run' | 'move.disengage'): StepResult {
  const u = state.units[unitId]
  const reach = moveReach(state, bundle, unitId)
  if (!u || !reach) return bad('E_NOT_LEGAL', 'That unit cannot move.')
  const kind = DOING[type]
  const answers = pathAnswers(state, bundle, unitId, kind, kind === 'run' ? reach.run : reach.move)
  const defaultLeader = leadingModel(state, unitId)?.id ?? null
  if (kind === 'disengage' && !answers.length) return sacrifice(state, bundle, unitId)
  return {
    state: raiseDecision(state, {
      seat: u.owner, kind: 'move.path', canPass: false,
      context: { unitId, kind, maxDist: reach.move, leaderId: leadingModel(state, unitId)?.id ?? null },
      options: [
        // the open template (a client path); sent without a path it takes the first ready answer
        ...(answers.length ? [option('path', 'Choose the Leading Model path', 'move.path', { unitId, kind }, u.owner)] : []),
        ...answers.map((a, i) => option(`path:${i}`, `Move to (${a.path[a.path.length - 1]!.x.toFixed(1)}, ${a.path[a.path.length - 1]!.z.toFixed(1)})${a.leaderId !== defaultLeader ? ` with ${a.leaderId} leading` : ''}`, 'move.path',
          { unitId, kind, leaderId: a.leaderId, path: a.path }, u.owner)),
        // a declared Disengage cannot turn into a Hold: no rule describes it (RULING below); Move and Run may still Hold
        ...(kind === 'disengage' ? [] : [option('hold', 'Hold instead (a 0" move counts as Hold)', 'move.hold', { unitId }, u.owner)]),
      ],
    }),
  }
}

/** Raise a PLACE destination decision (abilities call this; spec 14 s8.7). The answer carries `leaderId` and `dest`. */
export function raisePlace(state: GameState, seat: string, spec: { unitId: UnitId; x: number; source: string; minEnemyDist?: number; allowEngage?: UnitId[] }): GameState {
  return raiseDecision(state, {
    seat, kind: 'move.place', canPass: false, context: { ...spec },
    options: [option('place', `Place up to ${spec.x}"`, 'move.place', { unitId: spec.unitId, x: spec.x, source: spec.source,
      ...(spec.minEnemyDist !== undefined ? { minEnemyDist: spec.minEnemyDist } : {}),
      ...(spec.allowEngage ? { allowEngage: spec.allowEngage } : {}) }, seat)],
  })
}

const isVec = (v: unknown): v is Vec2 => !!v && typeof (v as Vec2).x === 'number' && typeof (v as Vec2).z === 'number'

/** A reposition opened a Reaction window at an end hook: park what is left in a 'move.stage' event; resume() finishes. */
function parked(r: RepositionResult, doneFor: ActionDone): StepResult {
  return { state: pushEvents(r.state, [{ type: 'move.stage', done: doneFor, ...(r.pending ? { pending: r.pending } : {}) }]) }
}

export const movement: ModuleDef = {
  id: 'movement',
  kinds: ['move'],
  options: (state, bundle, unitId) => {
    try { return menu(state, bundle, unitId) } catch (e) { if (e instanceof TodoError) return []; throw e }
  },
  resolve(state, bundle, action: Action): StepResult {
    const unitId = action['unitId']
    if (typeof unitId !== 'string' || !state.units[unitId]) return bad('E_BAD_PARAM', 'The action needs a unitId of a unit in play.')
    switch (action.type) {
      case 'move.go':
      case 'move.run':
        return askPath(state, bundle, unitId, action.type)
      case 'move.disengage': {
        // Tactical Mass is read now, at declaration (SUP-043); without it the unit may not shoot or charge this Round (SUP-040)
        // RULING: Disengage penalty | set at declaration, and the declared Disengage cannot be swapped for a Hold | no rule lets a
        // declared Disengage become a Hold, so the path decision has no Hold option; it ends in a Move or the DIS-003 loss | settled | R DIS
        // ignoreDisengage (Tactical Retreat, Jim Raynor's Orders) lifts the penalty
        const free = hasTacticalMass(state, bundle, unitId) || effectOps(state, bundle, unitId, 'ignoreDisengage').length > 0
        const s0 = free ? state : updateUnit(state, unitId, { noShootChargeRound: state.round })
        return askPath(s0, bundle, unitId, 'move.disengage')
      }
      case 'move.hold':
        return { state, done: { modelId: leadingModel(state, unitId)?.id ?? '', unitId, type: 'move.hold', triggers: [] } }
      case 'move.path': {
        const kind = action['kind'] as RepositionKind
        if (kind !== 'move' && kind !== 'run' && kind !== 'disengage') return bad('E_BAD_PARAM', 'Unknown movement kind.')
        const reach = moveReach(state, bundle, unitId)
        if (!reach) return bad('E_NOT_LEGAL', 'That unit cannot move.')
        let leaderId = action['leaderId'], path = action['path']
        if (leaderId === undefined && path === undefined) {
          const first = pathAnswers(state, bundle, unitId, kind, kind === 'run' ? reach.run : reach.move, 1)[0]
          if (!first) return bad('E_NOT_LEGAL', 'No legal path exists; Hold instead.')
          leaderId = first.leaderId; path = first.path
        }
        if (typeof leaderId !== 'string' || !Array.isArray(path) || !path.every(isVec)) return bad('E_BAD_PARAM', 'A path answer needs leaderId and a list of points.')
        const placement = action['placement']
        const r = reposition(state, bundle, unitId, {
          kind, leaderId, path: path as Vec2[], maxDist: kind === 'run' ? reach.run : reach.move, returnTo: 'move',
          ...(placement && typeof placement === 'object' ? { placement: placement as Record<ModelId, Vec2> } : {}),
        })
        if (isRejection(r)) return r
        const type = kind === 'move' ? 'move.go' : kind === 'run' ? 'move.run' : 'move.disengage'
        const doneFor = { modelId: leaderId, unitId, type, triggers: [{ kind: 'moved', sourceId: unitId }] }
        return r.raised ? parked(r, doneFor) : { state: r.state, done: doneFor }
      }
      case 'move.place': {
        const leaderId = action['leaderId'], dest = action['dest'], x = action['x']
        if (typeof leaderId !== 'string' || !isVec(dest) || typeof x !== 'number') return bad('E_BAD_PARAM', 'A place answer needs leaderId and dest.')
        const r = reposition(state, bundle, unitId, {
          kind: 'place', leaderId, path: [dest], maxDist: x, returnTo: 'move',
          ...(typeof action['minEnemyDist'] === 'number' ? { minEnemyDist: action['minEnemyDist'] as number } : {}),
          ...(Array.isArray(action['allowEngage']) ? { allowEngage: action['allowEngage'] as UnitId[] } : {}),
        })
        if (isRejection(r)) return r
        const doneFor = { modelId: leaderId, unitId, type: 'move.place', triggers: [{ kind: 'placed', sourceId: unitId }] }
        return r.raised ? parked(r, doneFor) : { state: r.state, done: doneFor }
      }
      default:
        return bad('E_UNKNOWN_KIND', `Movement does not handle ${action.type}.`)
    }
  },
  /** Back from a Reaction window opened at the end of a Move, Run, Disengage or PLACE: fire the hook that was cut short, then finish. */
  resume(state, bundle): StepResult {
    let stage: { done?: ActionDone; pending?: PendingHook[] } | undefined
    for (let i = state.events.length - 1; i >= 0; i--) if (state.events[i]!.type === 'move.stage') { stage = state.events[i] as unknown as typeof stage; break }
    const unitId = stage?.done?.unitId ?? state.activeUnit ?? undefined
    const fin: ActionDone = stage?.done ?? { modelId: '', ...(unitId ? { unitId } : {}), type: 'move.resume', triggers: [] }
    if (stage?.pending?.length) {
      const f = firePending(state, bundle, stage.pending, 'move')
      if (f.raised) return { state: pushEvents(f.state, [{ type: 'move.stage', done: fin, pending: f.rest }]) }
      return { state: f.state, done: fin }
    }
    return { state, done: fin }
  },
}

