// Pure tables: what each weapon flavour (src/client/weaponFlavour.ts, shared with sound) looks like. Original designs, generic
// colours only. rgb values are 0..1.
import { FLAVOURS, MELEE_FLAVOURS, type WeaponFlavour } from '../weaponFlavour'

export type Rgb = readonly [number, number, number]
export type Faction = 'terran' | 'zerg' | 'protoss'
export type Trail = 'streak' | 'smoke' | 'glow' | 'drip' | 'disc' | 'bone' | 'beam' | 'none'
export type ImpactKind = 'spark' | 'big' | 'acid' | 'psi' | 'thud'

export interface ProjSpec {
  shots: number // projectiles per Batch cue
  gapMs: number // between shots
  speed: number // inches / second
  arc: number // peak height as a fraction of range
  size: number // head size, inches
  color: Rgb
  trail: Trail
  spread: number // lateral scatter at the target, inches
  impact: ImpactKind
  flash: number // muzzle flash size, inches (0 none)
  bounces: number // glaive hops after the first hit
  /** Visible tail behind the head, inches (streak / bone / glow). Never scaled by speed: a fast shot is not a longer line. */
  tail?: number
  /** Lateral fan between the rounds of one salvo, inches (missiles); for a beam, the offset of each of the twin lines. */
  fan?: number
}
export interface MeleeSpec { shots: number; gapMs: number; radius: number; sweep: number; color: Rgb; glow: number; impact: ImpactKind }

export const RANGED: Partial<Record<WeaponFlavour, ProjSpec>> = {
  // Terran: warm yellow-orange. Short bright bolts with a capped tail.
  gauss: { shots: 1, gapMs: 0, speed: 90, arc: 0, size: 0.16, color: [1, 0.92, 0.55], trail: 'streak', spread: 0.2, impact: 'spark', flash: 0.5, bounces: 0, tail: 1.5 },
  revolver: { shots: 1, gapMs: 0, speed: 80, arc: 0, size: 0.22, color: [1, 0.74, 0.32], trail: 'streak', spread: 0.1, impact: 'spark', flash: 0.8, bounces: 0, tail: 1.2 },
  autocannon: { shots: 5, gapMs: 70, speed: 85, arc: 0, size: 0.15, color: [1, 0.6, 0.18], trail: 'streak', spread: 0.5, impact: 'spark', flash: 0.6, bounces: 0, tail: 1.0 },
  missiles: { shots: 3, gapMs: 120, speed: 24, arc: 0.18, size: 0.2, color: [1, 0.66, 0.25], trail: 'smoke', spread: 0.7, impact: 'big', flash: 0.7, bounces: 0, fan: 1.6 },
  'siege-cannon': { shots: 1, gapMs: 0, speed: 30, arc: 0.3, size: 0.4, color: [1, 0.6, 0.2], trail: 'smoke', spread: 0.3, impact: 'big', flash: 1.6, bounces: 0 },
  // Protoss: cyan. Glaive is a spinning disc that hops with ring echoes; disruptors are twin thin pulsing beams.
  glaive: { shots: 1, gapMs: 0, speed: 45, arc: 0, size: 0.3, color: [0.55, 0.95, 1], trail: 'disc', spread: 0.1, impact: 'psi', flash: 0.5, bounces: 1 },
  disruptor: { shots: 2, gapMs: 0, speed: 110, arc: 0, size: 0.1, color: [0.2, 0.85, 1], trail: 'beam', spread: 0.15, impact: 'psi', flash: 0.5, bounces: 0, fan: 0.32 },
  // Zerg: acid green and violet; spines are pale bone flecks tinted green, not glowing tracers.
  spines: { shots: 4, gapMs: 60, speed: 70, arc: 0.03, size: 0.11, color: [0.72, 0.9, 0.42], trail: 'bone', spread: 0.5, impact: 'spark', flash: 0, bounces: 0, tail: 1.0 },
  acid: { shots: 1, gapMs: 0, speed: 22, arc: 0.35, size: 0.55, color: [0.5, 1, 0.12], trail: 'drip', spread: 0.2, impact: 'acid', flash: 0.5, bounces: 0 },
  'bio-blast': { shots: 1, gapMs: 0, speed: 28, arc: 0.1, size: 0.5, color: [0.72, 0.4, 1], trail: 'glow', spread: 0.2, impact: 'acid', flash: 0.6, bounces: 0, tail: 2.2 },
}
export const MELEE: Partial<Record<WeaponFlavour, MeleeSpec>> = {
  'psi-blade': { shots: 2, gapMs: 140, radius: 1.0, sweep: 2.2, color: [0.45, 0.85, 1], glow: 0.3, impact: 'psi' },
  'warp-blade': { shots: 1, gapMs: 0, radius: 1.5, sweep: 3.0, color: [1, 0.85, 0.4], glow: 0.45, impact: 'psi' },
  slash: { shots: 2, gapMs: 120, radius: 0.9, sweep: 1.8, color: [0.95, 0.95, 0.85], glow: 0.18, impact: 'acid' },
  claw: { shots: 3, gapMs: 90, radius: 0.7, sweep: 1.2, color: [1, 0.85, 0.75], glow: 0.14, impact: 'acid' },
  strike: { shots: 1, gapMs: 0, radius: 0.5, sweep: 0.8, color: [1, 0.9, 0.7], glow: 0.2, impact: 'thud' },
  stab: { shots: 1, gapMs: 0, radius: 0.6, sweep: 0.5, color: [1, 0.95, 0.85], glow: 0.14, impact: 'spark' },
  stomp: { shots: 1, gapMs: 0, radius: 0.4, sweep: 0.3, color: [0.8, 0.7, 0.55], glow: 0.2, impact: 'thud' },
}

export const isMelee = (f: WeaponFlavour): boolean => (MELEE_FLAVOURS as readonly string[]).includes(f)
/** Every flavour has a look (a test enforces this). */
export function lookOf(f: WeaponFlavour): { ranged: ProjSpec } | { melee: MeleeSpec } {
  const r = RANGED[f], m = MELEE[f]
  if (r) return { ranged: r }
  if (m) return { melee: m }
  return { ranged: RANGED.gauss! }
}
export const ALL_FLAVOURS = FLAVOURS

export const BLOOD: Record<Faction, { color: Rgb; additive: boolean; grav: number }> = {
  terran: { color: [1, 0.6, 0.2], additive: true, grav: 9 }, // sparks
  zerg: { color: [0.55, 0.8, 0.15], additive: false, grav: 12 }, // ichor
  protoss: { color: [0.6, 0.9, 1], additive: true, grav: 1 }, // plasma motes
}
export const SHIELD_COLOR: Rgb = [0.4, 0.8, 1]
export const SEAT_COLOURS: readonly Rgb[] = [[0.35, 0.72, 0.85], [0.9, 0.4, 0.35], [0.9, 0.8, 0.3]]

/** Particle budget and density per effects level. */
export const LEVELS = {
  full: { cap: 1400, density: 1, ambient: true, smoke: true },
  reduced: { cap: 450, density: 0.4, ambient: false, smoke: false },
  off: { cap: 0, density: 0, ambient: false, smoke: false },
} as const
