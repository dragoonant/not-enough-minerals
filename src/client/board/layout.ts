// Pure board helpers (no three, no React): camera poses. Display only; no rules numbers.
import type { Vec2 } from '../../engine/types'

export type CameraPresetId = 'overview' | 'near' | 'far' | 'top'
export interface Pose { pos: [number, number, number]; target: [number, number, number] }

export const CAMERA_TRANSITION_MS = 500
export const easeInOut = (t: number): number => (t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2)

/** Camera pose for a preset on a w x d table. The human seat is the near edge (+z). */
export function cameraPose(preset: CameraPresetId, table: { w: number; d: number }): Pose {
  const k = Math.max(table.w, table.d) / 36
  switch (preset) {
    case 'near': return { pos: [0, 14 * k, 30 * k], target: [0, 0, 6 * k] }
    case 'far': return { pos: [0, 18 * k, -30 * k], target: [0, 0, -4 * k] }
    case 'top': return { pos: [0, 62 * k, 0.01], target: [0, 0, 0] }
    default: return { pos: [0, 30 * k, 38 * k], target: [0, 0, 2 * k] }
  }
}

export type Tooltip = { x: number; y: number }
export const clampTooltipLeft = (x: number, viewportW: number, width = 260): number => Math.max(8, Math.min(x + 16, viewportW - width - 12))

export type { Vec2 }
