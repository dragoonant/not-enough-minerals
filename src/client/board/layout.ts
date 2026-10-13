// Pure board helpers (no three, no React): camera poses. Display only; no rules numbers.
import type { Vec2 } from '../../engine/types'

export type CameraPresetId = 'overview' | 'near' | 'far' | 'top'
export interface Pose { pos: [number, number, number]; target: [number, number, number] }

export const CAMERA_TRANSITION_MS = 500
export const easeInOut = (t: number): number => (t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2)

/** Unit direction (table centre -> viewer) the camera stands on. Default +z (seat 0 on the classic deployment). */
export type ViewDir = readonly [number, number]
export const VIEW_SOUTH: ViewDir = [0, 1]

/** Direction from the table centre to the length-weighted centroid of the viewer's Entry Edge segments (world coords,
 *  centred table). Snaps to one of the 4 sides, or to a diagonal when the edge is a corner (both components strong), so
 *  the viewer's own edge or corner is always at the bottom of the screen (spec 50 s2). No segments: seat-index fallback. */
export function viewDirOf(segments: readonly (readonly [Vec2, Vec2])[] | undefined, fallbackFlip = false): ViewDir {
  const fb: ViewDir = fallbackFlip ? [0, -1] : VIEW_SOUTH
  if (!segments || segments.length === 0) return fb
  let x = 0, z = 0
  for (const [a, b] of segments) {
    const w = Math.hypot(b.x - a.x, b.z - a.z) || 1e-6
    x += w * (a.x + b.x) / 2; z += w * (a.z + b.z) / 2
  }
  const n = Math.hypot(x, z)
  if (n < 1e-6) return fb
  const ux = x / n, uz = z / n
  if (Math.abs(ux) > 0.38 && Math.abs(uz) > 0.38) { const r = Math.SQRT1_2; return [Math.sign(ux) * r, Math.sign(uz) * r] }
  return Math.abs(ux) > Math.abs(uz) ? [Math.sign(ux), 0] : [0, Math.sign(uz)]
}

/** Camera pose for a preset on a w x d table. `view` is the direction the camera stands on (the viewer's Entry Edge is
 *  the near edge); a boolean keeps the old meaning (true = the far side, -z). The card frame never rotates. */
export function cameraPose(preset: CameraPresetId, table: { w: number; d: number }, view: ViewDir | boolean = VIEW_SOUTH): Pose {
  const k = Math.max(table.w, table.d) / 36
  const [dx, dz] = typeof view === 'boolean' ? (view ? [0, -1] : VIEW_SOUTH) : view
  let base: Pose
  switch (preset) {
    case 'near': base = { pos: [0, 14 * k, 30 * k], target: [0, 0, 6 * k] }; break
    case 'far': base = { pos: [0, 18 * k, -30 * k], target: [0, 0, -4 * k] }; break
    case 'top': base = { pos: [0, 62 * k, 0.01], target: [0, 0, 0] }; break
    default: base = { pos: [0, 35 * k, 44 * k], target: [0, 0, 9 * k] }
  }
  // Turn about +y so +z maps onto (dx, dz).
  const turn = ([x, y, z]: [number, number, number]): [number, number, number] => [x * dz + z * dx, y, -x * dx + z * dz]
  return { pos: turn(base.pos), target: turn(base.target) }
}

export type Tooltip = { x: number; y: number }
export const clampTooltipLeft = (x: number, viewportW: number, width = 260): number => Math.max(8, Math.min(x + 16, viewportW - width - 12))

/** Deterministic 0..1 hash for cosmetic scatter (trees, speckle): same input, same output. */
export function hash01(a: number, b = 0): number {
  let h = (Math.imul(a | 0, 374761393) + Math.imul(b | 0, 668265263)) | 0
  h = Math.imul(h ^ (h >>> 13), 1274126177)
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296
}

export type { Vec2 }
