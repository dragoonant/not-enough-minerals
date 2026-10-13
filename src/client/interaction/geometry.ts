// Display-only geometry for the interaction layer: polyline length for the ruler, nearest-point picks, base radii for
// the rings. These are drawn numbers (a ruler reads what the player drew); every rules number comes from the engine.
import type { Vec2 } from '../../engine/types'

export const dist = (a: Vec2, b: Vec2): number => Math.hypot(a.x - b.x, a.z - b.z)

/** Length of start -> points[0] -> points[1] ... in inches. */
export function polylineLength(start: Vec2, points: readonly Vec2[]): number {
  let len = 0
  let prev = start
  for (const p of points) { len += dist(prev, p); prev = p }
  return len
}

/** Round base diameter in mm to a radius in inches (display only). */
export const baseRadiusIn = (mm: number): number => mm / 25.4 / 2

/** Index of the point nearest to `p`, or -1 when empty. */
export function nearestIndex(p: Vec2, pts: readonly Vec2[]): number {
  let best = -1, bd = Infinity
  pts.forEach((q, i) => { const d = dist(p, q); if (d < bd) { bd = d; best = i } })
  return best
}

export const toVec = (v: unknown): Vec2 | null => {
  const o = v as Vec2 | null | undefined
  return o && typeof o.x === 'number' && typeof o.z === 'number' ? { x: o.x, z: o.z } : null
}

/** A context.points list (ability spots) as Vec2[]. */
export function pointList(v: unknown): Vec2[] {
  return Array.isArray(v) ? v.map(toVec).filter((x): x is Vec2 => x !== null) : []
}
