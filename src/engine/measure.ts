// Base-edge measurement . All distances in inches, never rounded.
import type { EditionBundle } from '../data/types'
import { deploymentDef, rule, zoneRect, type Rect } from './edition'
import { baseRadius, dist, edgeDistance, isOnTable } from './geometry'
import type { GameState, Id, ModelState, SeatId, Vec2 } from './types'

const TOL = 1e-6

/** Nearest base edge to nearest base edge (0 when touching or overlapping). */
export function modelDistance(a: ModelState, b: ModelState): number {
  return edgeDistance(a.pos, a.base, b.pos, b.base)
}
export function distanceBetween(state: GameState, aId: Id, bId: Id): number {
  return modelDistance(state.models[aId]!, state.models[bId]!)
}
/** Base edge to a point. */
export function modelToPoint(a: ModelState, p: Vec2): number {
  return Math.max(0, dist(a.pos, p) - baseRadius(a.base))
}
/** "within d": nearest edges at most d apart (exactly d counts). */
export function within(a: ModelState, b: ModelState, d: number): boolean {
  return modelDistance(a, b) <= d + TOL
}
/** "completely within d" of the anchor's edge: every part of the base is within d. */
export function completelyWithin(m: ModelState, anchor: ModelState, d: number): boolean {
  return dist(m.pos, anchor.pos) + baseRadius(m.base) - baseRadius(anchor.base) <= d + TOL
}
/** Range from the point of origin's edge to the target's edge. */
export function rangeTo(origin: ModelState, target: ModelState): number {
  return modelDistance(origin, target)
}
export function inRange(origin: ModelState, target: ModelState, rng: number): boolean {
  return rangeTo(origin, target) <= rng + TOL
}
/** Base-edge reach check (default 1 in). TODO(M2): StarCraft melee range comes from the rules spec. */
export function inMeleeRange(attacker: ModelState, target: ModelState, reach = 1): boolean {
  return within(attacker, target, reach)
}

/** Models (on the table) within d of the anchor, nearest first. */
export function modelsWithin(
  state: GameState, anchorId: Id, d: number, filter: (m: ModelState) => boolean = () => true,
): ModelState[] {
  const a = state.models[anchorId]!
  return Object.values(state.models)
    .filter((m) => m.id !== anchorId && isOnTable(m) && within(a, m, d) && filter(m))
    .sort((x, y) => modelDistance(a, x) - modelDistance(a, y))
}
/** Models whose base overlaps a circle (clouds, AOEs: any part of the base counts). */
export function modelsInCircle(state: GameState, centre: Vec2, radius: number): ModelState[] {
  return Object.values(state.models).filter((m) => isOnTable(m) && dist(m.pos, centre) < radius + baseRadius(m.base) - 1e-9)
}

// ---------------------------------------------------------------- StarCraft additions (spec 14 s1-2, spec 17 s6)
/** Smallest base-edge distance between any live on-table model of unit `a` and any of unit `b`. */
export function unitDistance(state: GameState, a: Id, b: Id): number {
  let best = Infinity
  const ua = state.units[a], ub = state.units[b]
  if (!ua || !ub) return best
  for (const ia of ua.modelIds) {
    const ma = state.models[ia]
    if (!ma || !isOnTable(ma)) continue
    for (const ib of ub.modelIds) {
      const mb = state.models[ib]
      if (!mb || !isOnTable(mb)) continue
      best = Math.min(best, modelDistance(ma, mb))
    }
  }
  return best
}
/** A unit is Within d" of another when any model of it is (MEAS-010). */
export const unitWithin = (state: GameState, a: Id, b: Id, d: number): boolean => unitDistance(state, a, b) <= d + TOL
/** A unit is Wholly Within a distance of an anchor model only when every model is (MEAS-011). */
export function unitWhollyWithin(state: GameState, unitId: Id, anchor: ModelState, d: number): boolean {
  const u = state.units[unitId]
  if (!u) return false
  const live = u.modelIds.map((id) => state.models[id]).filter((m): m is ModelState => !!m && isOnTable(m))
  return live.length > 0 && live.every((m) => completelyWithin(m, anchor, d))
}

/** Axis-aligned world rectangles of the Zone of Influence of one seat (spec 17 s6: 6" deep, one per Entry Edge segment). */
export function zoneRectsOf(state: GameState, bundle: EditionBundle, seat: SeatId): Rect[] {
  const colour = state.seats[seat]?.colour
  const dep = state.deploymentId ? deploymentDef(bundle, state.deploymentId) : undefined
  if (!colour || !dep) return []
  const depth = rule(bundle, 'zoiDepth')
  return dep.entryEdges[colour].map((seg) => zoneRect(seg, dep.size, depth))
}
/** Does any part of a base at pos touch a rectangle? */
export function baseTouchesRect(pos: Vec2, mm: number, rc: Rect): boolean {
  const r = baseRadius(mm)
  const dx = Math.max(rc.min.x - pos.x, 0, pos.x - rc.max.x)
  const dz = Math.max(rc.min.z - pos.z, 0, pos.z - rc.max.z)
  return Math.hypot(dx, dz) < r - 1e-9 || (dx === 0 && dz === 0)
}
/** Is any part of a base at pos inside a Zone of Influence belonging to a seat other than `seat` (ZOI-003)? */
export function inEnemyZoneOf(state: GameState, bundle: EditionBundle, seat: SeatId, pos: Vec2, mm: number): boolean {
  for (const other of state.seatOrder) {
    if (other === seat) continue
    for (const rc of zoneRectsOf(state, bundle, other)) if (baseTouchesRect(pos, mm, rc)) return true
  }
  return false
}
