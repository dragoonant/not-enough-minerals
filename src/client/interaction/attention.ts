// Where the player has to look and click for the open decision (display geometry only, no rules numbers). The decision panel
// docks on the opposite side of the table so it never covers the active squad, the entry edge or the offered spots.
import type { GameState, PendingDecision, UnitId, Vec2 } from '../../engine/types'
import type { BoardGeometry } from '../contract'
import { pointList } from './geometry'
import { batchMenu, chargePickable, pathPlan } from './kinds'
import type { PathPlan } from './kinds'

export type Side = 'left' | 'right'

function unitPoints(state: GameState | null, id: UnitId | null | undefined, out: Vec2[]): void {
  const u = id ? state?.units[id] : undefined
  if (!u || !state) return
  for (const m of u.modelIds) {
    const model = state.models[m]
    if (model && !model.offTable && model.life !== 'dead') out.push({ x: model.pos.x, z: model.pos.z })
  }
}

/** The entry segment (world points) a deploy plan arrives through, or null for other entries. */
export function entrySegment(plan: PathPlan | null, geo: BoardGeometry | null, seat: string): [Vec2, Vec2] | null {
  const en = plan?.fields['entry'] as { kind?: string; segment?: number } | undefined
  if (!en || en.kind !== 'edge' || typeof en.segment !== 'number' || !geo) return null
  const edge = geo.edges.find((e) => e.seat === seat) ?? geo.edges[0]
  return edge?.segments[en.segment] ?? null
}

/** Name a table side from where a point sits (top = far end of the table as the camera first shows it). */
export function sideName(mid: Vec2, table: { w: number; d: number }): 'top' | 'bottom' | 'left' | 'right' {
  const nx = mid.x / Math.max(table.w, 1), nz = mid.z / Math.max(table.d, 1)
  if (Math.abs(nz) >= Math.abs(nx)) return nz < 0 ? 'top' : 'bottom'
  return nx < 0 ? 'left' : 'right'
}

export const midOf = (s: [Vec2, Vec2]): Vec2 => ({ x: (s[0].x + s[1].x) / 2, z: (s[0].z + s[1].z) / 2 })

/** Every table position the decision is about. */
export function attentionPoints(p: PendingDecision, state: GameState | null, geo: BoardGeometry | null, menuUnit: UnitId | null): Vec2[] {
  const out: Vec2[] = []
  const ctxUnit = p.context['unitId']
  const plan = pathPlan(p)
  unitPoints(state, plan?.unitId ?? (typeof ctxUnit === 'string' ? ctxUnit : null), out)
  if (p.kind === 'turn.activate') unitPoints(state, menuUnit, out)
  if (p.kind === 'shoot.batch') {
    const menu = batchMenu(p)
    unitPoints(state, menu.unitId, out)
    for (const r of menu.rows) for (const t of r.targets) unitPoints(state, t, out)
  }
  if (p.kind === 'charge.targets') for (const t of chargePickable(p)) unitPoints(state, t, out)
  out.push(...pointList(p.context['points']))
  if (p.kind.startsWith('deploy.') && geo) {
    const edge = geo.edges.find((e) => e.seat === p.seat) ?? geo.edges[0]
    const seg = entrySegment(plan, geo, String(p.seat))
    if (seg) out.push(midOf(seg))
    else if (edge) for (const s of edge.segments) out.push(midOf(s))
  }
  return out
}

/** Which side to dock the panel on: away from the mean of the attention points. Default right. */
export function dockSide(points: readonly Vec2[]): Side {
  if (!points.length) return 'right'
  const mean = points.reduce((n, q) => n + q.x, 0) / points.length
  return mean > 0 ? 'left' : 'right'
}
