// Path previews (spec 50 s5): turn a dragged Leading Model path into a full answer, dry-run it on the engine (the one legality
// oracle), and read back where the rest of the squad would stand plus which models break coherency. Rules numbers come from
// game.dryRun / queries.coherencyPreview / queries.reachOf; this file only moves data between them.
import { game, queries } from '../contract'
import type { Action, GameState, ModelId, PendingDecision, UnitId, Vec2 } from '../../engine/types'
import { polylineLength } from './geometry'
import { pathPayload, type PathPlan } from './kinds'
import { explainRejection } from './text'

export interface PathPreview {
  ok: boolean
  /** Why not (our words), or an "ok" line. */
  text: string
  code: string | null
  /** Where every model of the squad would stand, from the engine's own formation placer. */
  placement: Record<ModelId, Vec2> | null
  /** Models that would break Coherency (red marks). */
  red: ModelId[]
  /** Length the player drew, in inches. */
  length: number
  /** Limit for that length (Speed, Run, charge roll, PLACE range), or null when none is shown. */
  limit: number | null
  end: Vec2
}

/** The distance limit the ruler compares against. All values come from the pending context or queries.reachOf. */
export function limitFor(p: PendingDecision, unitId: UnitId): number | null {
  const ctx = p.context
  if (p.kind === 'charge.path') return typeof ctx['distance'] === 'number' ? (ctx['distance'] as number) : null
  if (p.kind === 'move.place') return typeof ctx['x'] === 'number' ? (ctx['x'] as number) : null
  if (p.kind === 'move.path') {
    if (ctx['kind'] === 'run') return queries.reachOf(unitId)?.run ?? null
    return typeof ctx['maxDist'] === 'number' ? (ctx['maxDist'] as number) : null
  }
  return null
}

/** Dry-run one candidate answer. `waypoints` are the points after the Leading Model's start (as the engine expects). */
export function previewPath(state: GameState, p: PendingDecision, plan: PathPlan, leaderId: ModelId, waypoints: readonly Vec2[], edge: string | null = null): PathPreview | null {
  if (!waypoints.length) return null
  const leader = state.models[leaderId]
  const end = waypoints[waypoints.length - 1]!
  const limit = limitFor(p, plan.unitId)
  const onTableLeader = !!leader && !leader.offTable && state.units[plan.unitId]?.location === 'table'
  const length = onTableLeader ? polylineLength(leader.pos, waypoints) : 0
  const action = game.actionFor(pathPayload(plan, leaderId, waypoints))
  const base = { length, limit, end }
  if (!action) return { ...base, ok: false, text: 'This is not your decision right now.', code: 'E_CLIENT', placement: null, red: [] }
  const r = game.dryRun(action)
  if (!r.ok) return { ...base, ok: false, text: explainRejection(state, r.rejection.code, r.rejection.text, r.rejection.detail, edge), code: r.rejection.code, placement: null, red: [] }
  const placement = placementOf(r.state, plan.unitId)
  const coh = queries.coherencyPreview(plan.unitId, placement)
  const red = coh && !coh.inCoherency ? coh.outOfCoherency : []
  return { ...base, ok: true, text: red.length ? 'Legal, but some models would be out of coherency.' : 'Looks good. Confirm to go.', code: null, placement, red }
}

/** Where the engine put each live model of the unit in the state a dry run produced. */
export function placementOf(after: GameState, unitId: UnitId): Record<ModelId, Vec2> {
  const out: Record<ModelId, Vec2> = {}
  const u = after.units[unitId]
  for (const id of u?.modelIds ?? []) {
    const m = after.models[id]
    if (m && m.life !== 'dead' && !m.offTable) out[id] = { x: m.pos.x, z: m.pos.z }
  }
  return out
}

/** The full action for a confirmed path (decisionId and seat filled), or null. */
export function confirmedAction(plan: PathPlan, leaderId: ModelId, waypoints: readonly Vec2[]): Action | null {
  if (!waypoints.length) return null
  return game.actionFor(pathPayload(plan, leaderId, waypoints))
}
