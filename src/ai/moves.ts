// Movement answers (spec 30 s5-6; owner M). The engine enumerates move.path, deploy.path and charge.path answers (one
// per offered end spot); these helpers score them with eval.positionValue on withUnitAt shims plus a cheap local term
// (distance to the markers worth taking, distance to the enemy) and keep the best. Only move.place is parameterised
// (random.completePlace fills it; placeGoal picks a goal). Coherency and legality are the engine's: every answer
// returned here is one of ctx.legal.
import { zoneRectsOf } from '../engine/measure'
import { sideFor } from '../engine/missions'
import { objectiveStatus, supplyStatus, unitSupply, type ObjectiveStatus } from '../engine/query'
import type { Action, GameState, UnitId, Vec2 } from '../engine/types'
import { deployValue, isHomeCarrier, positionValue } from './eval'
import { pickBest } from './policies'
import { timeUp, type AiContext, type MoveCandidate, type Scored, type ThreatMap } from './types'
import { rangedOf } from './threat'
import { dist, endOf, enemyUnitsOf, leaderOf } from './world'

// ---------------------------------------------------------------- local terms (geometry only, no rules)
export interface ObjInfo { n: number; pos: Vec2; contestRadius: number; status: ObjectiveStatus }
const OBJ = new WeakMap<GameState, ObjInfo[]>()
/** Active markers on the table with their contest radius and totals (query.objectiveStatus, once per decision). */
export function objectivesOf(ctx: AiContext): ObjInfo[] {
  let r = OBJ.get(ctx.q)
  if (!r) {
    const byN = new Map(ctx.view.markers.map((m) => [m.n, m]))
    r = objectiveStatus(ctx.q, ctx.bundle).flatMap((s) => {
      const m = byN.get(s.n)
      return m && m.onTable && s.active ? [{ n: s.n, pos: m.pos, contestRadius: s.contestRadius, status: s } satisfies ObjInfo] : []
    })
    OBJ.set(ctx.q, r)
  }
  return r
}

/** What the Mission pays for taking marker `n` (VP-ish, from the Mission Card's scoring rules for the marker's side as seen by
 *  this seat): a marker the card never pays for is a place to stand, not a goal. Data lookup only; the engine scores it. */
export function markerWorth(ctx: AiContext, n: number): number {
  const mission = ctx.bundle.records.missions.find((x) => x.id === ctx.q.missionId)
  const mk = ctx.q.markers.find((m) => m.n === n)
  if (!mission || !mk) return 1
  const side = sideFor(ctx.q, mk, ctx.seat)
  const last = ctx.q.maxRounds ?? ctx.q.round
  let w = 0
  for (const r of mission.scoring) {
    switch (r.kind) {
      case 'perControlledMarker': if (r.fromRound <= last) w += r.vp[side]; break
      case 'markerControlled': if (r.marker === n && r.fromRound <= last) w += r.vp; break
      case 'activatedMarkerCash': w += 1.5; break
      case 'quarters': w += 0.3 * r.controlBonus; break
      case 'claimCarriedInZone': if (side !== 'own') w += 0.6 * r.vp; break
      case 'ownMarkersNotClaimed': if (side === 'own') w += 0.5 * r.vp; break
      default: break
    }
  }
  return w
}
/** markerWorth as a pull multiplier: a marker that pays nothing keeps a small pull, one that pays 2+ VP a strong one. */
const worthWeight = (ctx: AiContext, n: number): number => (AGG.worth ? Math.max(AGG.minPull!, Math.min(1.3, markerWorth(ctx, n))) : 1)

/** How much a marker is worth walking to: 0.35 when we already hold it clearly, 1.15 when the enemy does. */
function markerWeight(ctx: AiContext, o: ObjInfo): number {
  return worthWeight(ctx, o.n) * markerHold(ctx, o)
}
function markerHold(ctx: AiContext, o: ObjInfo): number {
  const t = o.status.totals
  const mine = t[ctx.seat] ?? 0
  const theirs = Math.max(0, ...Object.entries(t).filter(([s]) => s !== ctx.seat).map(([, v]) => v))
  if (o.status.controller === ctx.seat && mine - theirs >= 3) return 0.35
  return o.status.controller && o.status.controller !== ctx.seat ? 1.15 : 1
}

/** Goal term of standing with the leader at `at`: the best marker by weight x (10 - 0.5 x distance to its contest ring). */
export function goalTerm(ctx: AiContext, at: Vec2): number {
  let best = -Infinity
  for (const o of objectivesOf(ctx)) {
    const d = Math.max(0, dist(at, o.pos) - o.contestRadius)
    best = Math.max(best, markerWeight(ctx, o) * (10 - 0.5 * Math.min(d, 20)))
  }
  return best === -Infinity ? 0 : best
}

/** Bench knobs (node only: AI_AGG="kEnemy=0.3,ramp=1"); the shipped values are the defaults. */
export const AGG: Record<string, number> = { kEnemy: 0.25, ramp: 1, worth: 1, minPull: 0.15, minCharge: 0.34, meleePull: 1, capShare: 0.65 }
if (typeof process !== 'undefined' && process.env?.AI_AGG) for (const part of process.env.AI_AGG.split(',')) { const [k, v] = part.split('='); if (k && Number.isFinite(Number(v))) AGG[k] = Number(v) }

const ENEMY = new WeakMap<GameState, Vec2[]>()
/** Leader spots of every enemy unit on the table. */
export function enemySpots(ctx: AiContext): Vec2[] {
  let r = ENEMY.get(ctx.q)
  if (!r) {
    r = enemyUnitsOf(ctx.q, ctx.seat).flatMap((u) => { const l = leaderOf(ctx.q, u.id); return l ? [l.pos] : [] })
    ENEMY.set(ctx.q, r)
  }
  return r
}
/** Pull towards the nearest enemy (we want shots and charges), capped. */
export function enemyTerm(ctx: AiContext, at: Vec2, unitId?: UnitId): number {
  let d = Infinity
  for (const p of enemySpots(ctx)) d = Math.min(d, dist(at, p))
  if (d === Infinity) return 0
  const max = ctx.view.maxRounds ?? 5
  const progress = max > 1 ? Math.min(1, Math.max(0, (ctx.view.round - 1) / (max - 1))) : 1
  // a unit with no ranged weapon can only hurt the enemy by reaching it: it closes in harder
  const melee = unitId && AGG.meleePull! !== 1 && rangedOf(ctx, ctx.q, unitId).length === 0 ? AGG.meleePull! : 1
  return -AGG.kEnemy! * melee * (1 + AGG.ramp! * progress) * Math.min(d, 30)
}

/** The centre of the nearest piece of our own Zone to `from` (where a marker carrier scores), or null. */
export function homeSpot(ctx: AiContext, from: Vec2): Vec2 | null {
  let best: Vec2 | null = null
  for (const r of zoneRectsOf(ctx.q, ctx.bundle, ctx.seat)) {
    const c = { x: (r.min.x + r.max.x) / 2, z: (r.min.z + r.max.z) / 2 }
    if (!best || dist(from, c) < dist(from, best)) best = c
  }
  return best
}

/** Cheap pre-score of a spot (objective weight scaled by the tier's wObjective). A unit carrying a marker is pulled to its
 *  own Zone instead of to the markers. */
export function localTerm(ctx: AiContext, at: Vec2, unitId?: UnitId): number {
  if (unitId && isHomeCarrier(ctx, unitId)) {
    const home = homeSpot(ctx, at)
    if (home) return (12 - 0.5 * Math.min(dist(at, home), 24)) * (ctx.params.wObjective / 4)
  }
  return goalTerm(ctx, at) * (ctx.params.wObjective / 4) + enemyTerm(ctx, at, unitId)
}

// ---------------------------------------------------------------- scoring
const unitOfDecision = (ctx: AiContext): UnitId | null => {
  const c = ctx.pending.context as { unitId?: unknown }
  if (typeof c.unitId === 'string') return c.unitId
  const a = ctx.legal.find((o) => typeof o.unitId === 'string')
  return a ? (a.unitId as string) : null
}

/** Score every legal path answer of the open move.path / deploy.path / charge.path decision (best first). */
export function scorePaths(ctx: AiContext, threats: ThreatMap): MoveCandidate[] {
  const unitId = unitOfDecision(ctx)
  if (!unitId) return []
  const cands = ctx.legal.flatMap((action) => { const end = endOf(action); return end ? [{ action, end, pre: localTerm(ctx, end, unitId) }] : [] })
  cands.sort((a, b) => b.pre - a.pre)
  const onTable = ctx.view.units[unitId]?.location === 'table'
  const out: MoveCandidate[] = []
  for (const c of cands.slice(0, ctx.params.moveSamples)) {
    if (out.length && timeUp(ctx)) break
    const ev = onTable ? positionValue(ctx, unitId, c.end, threats) : { value: 0, parts: {} }
    out.push({ action: c.action, end: c.end, score: { value: ev.value + c.pre, parts: { ...ev.parts, objective: c.pre } } })
  }
  return out.sort((a, b) => b.score.value - a.score.value)
}

/** Pick among scored candidates: normal takes the best, easy draws from its top three (weights 60/25/15). */
export function choose<T>(ctx: AiContext, scored: readonly Scored<T>[]): Scored<T> | null {
  if (ctx.tier !== 'easy' || scored.length < 2) return pickBest(ctx, scored)
  const top = [...scored].sort((a, b) => b.score.value - a.score.value).slice(0, 3)
  const r = ctx.rng()
  return top[r < 0.6 || top.length < 2 ? 0 : r < 0.85 || top.length < 3 ? 1 : 2]!
}

const asScored = (c: MoveCandidate): Scored => ({ action: c.action, score: c.score })

/** Best move.path answer (Move, Run or Disengage), or null for no opinion. Holds when no spot beats the current one. */
export function bestMove(ctx: AiContext, threats: ThreatMap): Action | null {
  const scored = scorePaths(ctx, threats)
  if (!scored.length) return null
  const pick = choose(ctx, scored.map(asScored))
  if (!pick) return null
  const hold = ctx.legal.find((a) => a.type === 'move.hold')
  const unitId = unitOfDecision(ctx)
  const lead = unitId ? leaderOf(ctx.q, unitId) : undefined
  const dbg = (globalThis as { __aiTrace?: (line: string) => void }).__aiTrace // bench --trace only
  if (dbg && unitId && lead) {
    const fmt = (c: MoveCandidate) => `${c.end?.x.toFixed(0)},${c.end?.z.toFixed(0)}=${c.score.value.toFixed(1)}{${Object.entries(c.score.parts).map(([k, v]) => `${k}:${(v as number).toFixed(1)}`).join(' ')}}`
    const cur = positionValue(ctx, unitId, lead.pos, threats)
    dbg(`    ${unitId} at ${lead.pos.x.toFixed(0)},${lead.pos.z.toFixed(0)} cur=${(cur.value + localTerm(ctx, lead.pos, unitId)).toFixed(1)}{${Object.entries(cur.parts).map(([k, v]) => `${k}:${(v as number).toFixed(1)}`).join(' ')}} cands ${scored.slice(0, 4).map(fmt).join(' | ')}`)
  }
  if (hold && lead && unitId) {
    const cur = positionValue(ctx, unitId, lead.pos, threats).value + localTerm(ctx, lead.pos, unitId)
    if (pick.score.value <= cur + 0.05) return hold
  }
  return pick.action
}

/** Best deploy.entry answer: the Entry Edge whose zone sits nearest the markers worth taking. */
export function bestEntry(ctx: AiContext, _threats: ThreatMap): Action | null {
  const rects = zoneRectsOf(ctx.q, ctx.bundle, ctx.seat)
  const scored: Scored[] = ctx.legal.map((action) => {
    const e = action.entry as { kind?: string; segment?: unknown } | undefined
    const r = e?.kind === 'edge' && typeof e.segment === 'number' ? rects[e.segment] : undefined
    const centre = r ? { x: (r.min.x + r.max.x) / 2, z: (r.min.z + r.max.z) / 2 } : null
    return { action, score: { value: centre ? localTerm(ctx, centre) : -50, parts: {} } }
  })
  return choose(ctx, scored)?.action ?? null
}

/** Best deploy.path answer (arrival spot from the chosen entry). */
export function bestDeploySpot(ctx: AiContext, threats: ThreatMap): Action | null {
  const s = scorePaths(ctx, threats)
  return s.length ? choose(ctx, s.map(asScored))?.action ?? null : null
}

/** Best charge.path answer: the offered route whose end is best placed; the engine's own first route when none is. */
export function bestChargeEnd(ctx: AiContext, threats: ThreatMap): Action | null {
  const s = scorePaths(ctx, threats)
  if (s.length) return choose(ctx, s.map(asScored))?.action ?? null
  return ctx.legal.find((a) => a.auto === true) ?? null
}

/** Goal spot for a move.place answer (PLACE abilities, summons): the best marker's centre, else the nearest enemy. */
export function placeGoal(ctx: AiContext, unitId: UnitId, _threats: ThreatMap): Vec2 | null {
  const lead = leaderOf(ctx.q, unitId)
  const from = lead?.pos ?? { x: 0, z: 0 }
  if (isHomeCarrier(ctx, unitId)) { const home = homeSpot(ctx, from); if (home) return home }
  let best: { p: Vec2; v: number } | null = null
  for (const o of objectivesOf(ctx)) {
    const v = markerWeight(ctx, o) * 10 - dist(from, o.pos) * 0.2
    if (!best || v > best.v) best = { p: o.pos, v }
  }
  if (best) return best.p
  let near: Vec2 | null = null
  for (const p of enemySpots(ctx)) if (!near || dist(from, p) < dist(from, near)) near = p
  return near
}

// ---------------------------------------------------------------- deployment knapsack
/** Knapsack over reserve units whose Supply fits Available Supply (query.supplyStatus), by Supply plus eval.deployValue;
 *  the final Round deploys everything it can (units left in Reserves count as destroyed, SUP-064). Easy is greedy:
 *  the dearest unit that fits. Stored in memory.deployPlan. */
export function deployPlan(ctx: AiContext, threats: ThreatMap): UnitId[] {
  const st = supplyStatus(ctx.q, ctx.bundle, ctx.seat)
  const lastRound = ctx.view.maxRounds != null && ctx.view.round >= ctx.view.maxRounds
  const items = st.canArriveNow.map((id) => {
    const cost = Math.max(0, Math.round(unitSupply(ctx.q, ctx.bundle, id)))
    return { id, cost, value: cost + Math.max(0, deployValue(ctx, id, threats)) }
  })
  let plan: UnitId[]
  if (lastRound) plan = items.sort((a, b) => b.value - a.value).map((i) => i.id)
  else if (ctx.params.deploy === 'greedy') {
    let left = st.available
    plan = []
    for (const i of items.sort((a, b) => b.cost - a.cost || (a.id < b.id ? -1 : 1))) if (i.cost <= left) { plan.push(i.id); left -= i.cost }
  } else {
    const cap = Math.max(0, Math.floor(st.available))
    const best: { v: number; ids: UnitId[] }[] = Array.from({ length: cap + 1 }, () => ({ v: 0, ids: [] }))
    for (const it of items) {
      for (let w = cap; w >= it.cost; w--) {
        const cand = best[w - it.cost]!.v + it.value
        if (cand > best[w]!.v) best[w] = { v: cand, ids: [...best[w - it.cost]!.ids, it.id] }
      }
    }
    const ids = best[cap]!.ids
    plan = items.filter((i) => ids.includes(i.id)).sort((a, b) => b.value - a.value).map((i) => i.id)
  }
  ctx.memory.deployPlan = { round: ctx.view.round, unitIds: plan }
  return plan
}
