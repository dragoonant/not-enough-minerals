// Rig for split GLBs (tools/models/split.mjs): a fused model is cut into `lower` and `upper` nodes. buildGlbRig finds
// whichever nodes the model has, reports what the model can do (capabilities) and degrades gracefully: a one-node
// model (squad figures) or an unlisted slug gets an inert rig. Cosmetic only; measurement always uses the base.
import { Box3, type Object3D } from 'three'

export type RigPart = 'lower' | 'upper'
export type RigKind = 'turret' | 'lunge'

/** Profiles whose `upper` node is a turret / torso that yaws to face the target when shooting. */
export const TURRET_SLUGS: ReadonlySet<string> = new Set(['siege-tank', 'goliath'])
/** Large Zerg whose `upper` node lunges and sways on attack / charge. */
export const LUNGE_SLUGS: ReadonlySet<string> = new Set(['hydralisk', 'queen', 'ravager', 'omega-worm'])

export interface RigCaps { parts: RigPart[]; turret: boolean; lunge: boolean }

/** What a model can do given the node names found in its GLB. Both parts are needed; anything else is inert. */
export function rigCapabilities(slug: string, nodeNames: Iterable<string>): RigCaps {
  const names = new Set(nodeNames)
  const parts = (['lower', 'upper'] as const).filter((p) => names.has(p))
  const split = parts.length === 2
  return { parts, turret: split && TURRET_SLUGS.has(slug), lunge: split && LUNGE_SLUGS.has(slug) }
}

export const rigIsInert = (c: RigCaps): boolean => !c.turret && !c.lunge

/** Wrap an angle to (-PI, PI]. */
export const wrapAngle = (a: number): number => Math.atan2(Math.sin(a), Math.cos(a))

/** Turret yaw relative to the body that points at a world target direction. */
export const turretRelative = (targetYaw: number, bodyYaw: number): number => wrapAngle(targetYaw - bodyYaw)

/** 0 -> 1 -> 0 envelope over `durMs` since `startMs`; 0 outside. */
export function pulse(ageMs: number, durMs: number): number {
  if (ageMs < 0 || ageMs >= durMs) return 0
  return Math.sin((Math.PI * ageMs) / durMs)
}

export interface RigPose {
  /** turret yaw relative to the body, radians (turret rigs) */
  turret?: number
  /** lunge envelope 0..1 (lunge rigs); `sway` adds a small side wobble in -1..1 */
  lunge?: number
  sway?: number
}

export interface GlbRig {
  slug: string
  caps: RigCaps
  apply(pose: RigPose): void
  /** back to the rest pose */
  reset(): void
}

const LUNGE_FWD = 0.1 // of the upper node's height
const LUNGE_PITCH = 0.14 // radians at full lunge
const SWAY_YAW = 0.12

/** Build the rig for one GLB clone (`root` = the clone's scene, not yet scaled or parented). */
export function buildGlbRig(root: Object3D, slug: string): GlbRig {
  const lower = root.getObjectByName('lower') ?? null
  const upper = root.getObjectByName('upper') ?? null
  const names: string[] = []
  if (lower) names.push('lower')
  if (upper) names.push('upper')
  const caps = rigCapabilities(slug, names)
  if (rigIsInert(caps) || !upper) return { slug, caps, apply: () => {}, reset: () => {} }
  root.updateMatrixWorld(true)
  const box = new Box3().setFromObject(upper)
  const px = (box.min.x + box.max.x) / 2, pz = (box.min.z + box.max.z) / 2
  const h = Math.max(1e-3, box.max.y - box.min.y)
  const set = (yaw: number, fwd: number, pitch: number): void => {
    const c = Math.cos(yaw), s = Math.sin(yaw)
    upper.rotation.set(pitch, yaw, 0)
    // rotate about the vertical axis through the upper node's centre, then slide forward (+z) in the rotated frame
    upper.position.set(px - (c * px + s * pz) + s * fwd, 0, pz - (-s * px + c * pz) + c * fwd)
  }
  return {
    slug,
    caps,
    apply(pose) {
      if (caps.turret) set(pose.turret ?? 0, 0, 0)
      else set((pose.sway ?? 0) * SWAY_YAW, (pose.lunge ?? 0) * LUNGE_FWD * h, (pose.lunge ?? 0) * LUNGE_PITCH)
    },
    reset() { set(0, 0, 0) },
  }
}
