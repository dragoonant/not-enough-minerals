// VFX simulation (no three.js): two pooled particle layers (additive glow, normal-blend dust/smoke/ichor), a pooled projectile list
// and a pooled schedule for delayed effects. Driven only by presentation cues (see Vfx.tsx); never touches engine state.
import { ParticlePool } from './pool'
import { BLOOD, LEVELS, SEAT_COLOURS, SHIELD_COLOR, lookOf, type Faction, type ImpactKind, type MeleeSpec, type ProjSpec, type Rgb } from './recipes'
import type { EffectsLevel } from './vfxStore'
import type { WeaponFlavour } from '../weaponFlavour'

const rnd = Math.random
const rr = (a: number, b: number) => a + (b - a) * rnd()
const TAU = Math.PI * 2
const MAX_PROJ = 96, MAX_SCHED = 96
const WHITE: Rgb = [1, 1, 1]

interface Proj {
  on: boolean; started: boolean; melee: boolean
  t0: number; dur: number
  x0: number; y0: number; z0: number; x1: number; y1: number; z1: number
  px: number; py: number; pz: number; ang0: number; sweep: number
  spec: ProjSpec | null; mspec: MeleeSpec | null; fac: Faction; hops: number
  /** Lateral offset (fan / twin beam), arc multiplier, speed in in/s, hold time after arrival (beams), path distance since last echo, landed flag. */
  lat: number; arcMul: number; vel: number; hold: number; acc: number; landed: boolean
}
const newProj = (): Proj => ({ on: false, started: false, melee: false, t0: 0, dur: 1, x0: 0, y0: 0, z0: 0, x1: 0, y1: 0, z1: 0, px: 0, py: 0, pz: 0, ang0: 0, sweep: 0, spec: null, mspec: null, fac: 'terran', hops: 0, lat: 0, arcMul: 1, vel: 60, hold: 0, acc: 0, landed: false })

/** Reference camera distance (inches) at which recipe sizes read well; farther away, sprites grow so a hit never drops below a legible size. */
const REF_DIST = 20, MAX_VS = 3.4
/** Shortest time a bolt is on screen, whatever the speed setting: a tracer must be seen to travel. */
const MIN_FLIGHT = 0.1, MIN_GAP = 0.06

export type SchedKind = 'death' | 'arrive' | 'burrow' | 'unburrow' | 'dust'
interface Sched { on: boolean; kind: SchedKind; fac: Faction; t: number; x: number; y: number; z: number }

export class VfxEngine {
  readonly glow = new ParticlePool(LEVELS.full.cap)
  readonly soft = new ParticlePool(LEVELS.full.cap)
  private proj: Proj[] = Array.from({ length: MAX_PROJ }, newProj)
  private sched: Sched[] = Array.from({ length: MAX_SCHED }, () => ({ on: false, kind: 'death' as SchedKind, fac: 'terran' as Faction, t: 0, x: 0, y: 0, z: 0 }))
  t = 0
  level: EffectsLevel = 'full'
  /** Flight-time factor from the animation speed (1 = normal, <1 faster). */
  timeScale = 1
  private density = 1
  private smoke = true
  /** Last frame time step, and the camera position (set by Vfx.tsx) for distance-scaled sprites. */
  private dt = 1 / 60
  private cam: [number, number, number] | null = null
  /** Current sprite scale factor (>= 1), set at each entry point from the camera distance to the effect. */
  private vs = 1
  private tmp: [number, number, number] = [0, 0, 0]

  setCamera(x: number, y: number, z: number): void { this.cam = [x, y, z] }
  /** Sprite scale for an effect at (x,y,z): grows with camera distance beyond REF_DIST so hits stay legible at Overview. */
  private scaleAt(x: number, y: number, z: number, pow = 1): number {
    if (!this.cam) return 1
    const d = Math.hypot(x - this.cam[0], y - this.cam[1], z - this.cam[2])
    return Math.min(MAX_VS, Math.max(1, d / REF_DIST)) ** pow
  }

  setLevel(level: EffectsLevel): void {
    this.level = level
    const L = LEVELS[level]
    this.density = L.density; this.smoke = L.smoke
    this.glow.limit = this.soft.limit = Math.max(1, L.cap)
    if (level === 'off') this.clear()
  }
  clear(): void {
    this.glow.clear(); this.soft.clear()
    for (const p of this.proj) p.on = false
    for (const s of this.sched) s.on = false
  }
  get active(): boolean { return this.glow.live > 0 || this.soft.live > 0 || this.activeProjectiles() > 0 || this.activeScheduled() > 0 }
  activeProjectiles(): number { let n = 0; for (const p of this.proj) if (p.on) n++; return n }
  private activeScheduled(): number { let n = 0; for (const s of this.sched) if (s.on) n++; return n }
  get liveParticles(): number { return this.glow.live + this.soft.live }

  // ---------------------------------------------------------------------------------------------- primitives
  private n(count: number): number { return this.density <= 0 ? 0 : Math.max(1, Math.round(count * this.density)) }
  private G(x: number, y: number, z: number, vx: number, vy: number, vz: number, life: number, s0: number, s1: number, c: Rgb, a: number, grav = 0, drag = 0): void {
    this.glow.spawn(x, y, z, vx, vy, vz, life, s0 * this.vs, s1 * this.vs, c[0], c[1], c[2], a, grav, drag)
  }
  private S(x: number, y: number, z: number, vx: number, vy: number, vz: number, life: number, s0: number, s1: number, c: Rgb, a: number, grav = 0, drag = 0): void {
    this.soft.spawn(x, y, z, vx, vy, vz, life, s0 * this.vs, s1 * this.vs, c[0], c[1], c[2], a, grav, drag)
  }
  private P(pool: 'glow' | 'soft', x: number, y: number, z: number, vx: number, vy: number, vz: number, life: number, s0: number, s1: number, c: Rgb, a: number, grav: number, drag: number): void {
    if (pool === 'glow') this.G(x, y, z, vx, vy, vz, life, s0, s1, c, a, grav, drag)
    else this.S(x, y, z, vx, vy, vz, life, s0, s1, c, a, grav, drag)
  }
  private burst(pool: 'glow' | 'soft', x: number, y: number, z: number, count: number, sp0: number, sp1: number, up: number, life: number,
    s0: number, s1: number, c: Rgb, a: number, grav: number, drag: number): void {
    const n = this.n(count)
    for (let i = 0; i < n; i++) {
      const th = rnd() * TAU, u = rnd() * 2 - 1, k = Math.sqrt(1 - u * u), s = rr(sp0, sp1) * Math.sqrt(this.vs)
      this.P(pool, x, y, z, Math.cos(th) * k * s, u * s * 0.6 + up, Math.sin(th) * k * s, rr(life * 0.7, life), s0, s1, c, a, grav, drag)
    }
  }
  private ring(pool: 'glow' | 'soft', x: number, y: number, z: number, count: number, radius0: number, speed: number, life: number, s0: number, s1: number, c: Rgb, a: number): void {
    const n = this.n(count)
    for (let i = 0; i < n; i++) {
      const th = (i / n) * TAU + rnd() * 0.2, cx = Math.cos(th), sz = Math.sin(th)
      this.P(pool, x + cx * radius0, y, z + sz * radius0, cx * speed * Math.sqrt(this.vs), 0, sz * speed * Math.sqrt(this.vs), life, s0, s1, c, a, 0, 1.5)
    }
  }
  private column(pool: 'glow' | 'soft', x: number, y: number, z: number, count: number, radius: number, height: number, life: number, s0: number, c: Rgb, a: number, down = false): void {
    const n = this.n(count)
    for (let i = 0; i < n; i++) {
      const th = rnd() * TAU, r = rnd() * radius, h = rnd() * height
      this.P(pool, x + Math.cos(th) * r, y + (down ? height - h : h) * 0.2, z + Math.sin(th) * r, 0, (down ? -1 : 1) * rr((height / life) * 0.6, height / life), 0, rr(life * 0.6, life), s0, s0 * 0.3, c, a, 0, 0.2)
    }
  }

  // ---------------------------------------------------------------------------------------------- cue entry points
  /** A Batch is fired. Coordinates are model centres (y = elevation + height). */
  attack(flavour: WeaponFlavour, ax: number, ay: number, az: number, bx: number, by: number, bz: number, targetFac: Faction): void {
    if (this.level === 'off') return
    const look = lookOf(flavour)
    if ('ranged' in look) {
      const s = look.ranged
      const dist = Math.hypot(bx - ax, bz - az)
      const dur = Math.max(MIN_FLIGHT, (dist / s.speed) * this.timeScale)
      // Rounds of one burst stay visibly apart however fast the animation speed is.
      const gap = s.gapMs > 0 ? Math.max(MIN_GAP, (s.gapMs * this.timeScale) / 1000) : 0
      const hold = s.trail === 'beam' ? Math.max(0.14, 0.24 * this.timeScale) : 0
      for (let i = 0; i < s.shots; i++) {
        const p = this.take(); if (!p) break
        const sp = s.spread, mid = i - (s.shots - 1) / 2
        p.on = true; p.started = false; p.melee = false; p.landed = false; p.t0 = this.t + i * gap; p.dur = dur
        p.spec = s; p.mspec = null; p.fac = targetFac; p.hops = s.bounces
        p.x0 = ax; p.y0 = ay; p.z0 = az; p.x1 = bx + rr(-sp, sp); p.y1 = by + rr(-sp, sp) * 0.5; p.z1 = bz + rr(-sp, sp)
        p.px = ax; p.py = ay; p.pz = az; p.acc = 0; p.hold = hold; p.vel = Math.max(1, dist / dur)
        p.arcMul = s.fan && s.trail === 'smoke' ? 1 + mid * 0.45 : 1
        p.lat = s.trail === 'beam' ? mid * 2 * (s.fan ?? 0) : s.fan ? mid * s.fan : s.trail === 'bone' ? rr(-0.35, 0.35) : 0
      }
    } else {
      const s = look.melee
      const dx = ax - bx, dz = az - bz, d = Math.hypot(dx, dz) || 1
      for (let i = 0; i < s.shots; i++) {
        const p = this.take(); if (!p) break
        const flip = i % 2 ? -1 : 1
        p.on = true; p.started = false; p.melee = true; p.landed = false; p.t0 = this.t + (i * s.gapMs * this.timeScale) / 1000; p.dur = 0.22 * this.timeScale
        p.spec = null; p.mspec = s; p.fac = targetFac; p.hops = 0; p.lat = 0; p.arcMul = 1; p.hold = 0
        p.x0 = bx + (dx / d) * 0.35; p.y0 = by; p.z0 = bz + (dz / d) * 0.35; p.x1 = bx; p.y1 = by; p.z1 = bz
        p.ang0 = Math.atan2(dz, dx) - (flip * s.sweep) / 2 + rr(-0.3, 0.3); p.sweep = flip * s.sweep
      }
    }
  }
  /** Damage resolved against a unit: a hot flash with a ground glow and a spray, or the shield shimmer when a Shield soaks it. */
  damage(x: number, y: number, z: number, fac: Faction, amount: number, shielded: boolean): void {
    if (this.level === 'off') return
    this.vs = this.scaleAt(x, y, z, 1)
    if (shielded) { this.shield(x, y, z); return }
    const b = BLOOD[fac], big = Math.min(2, 0.7 + amount * 0.15)
    const hot: Rgb = fac === 'zerg' ? [0.75, 1, 0.35] : fac === 'protoss' ? [0.6, 0.92, 1] : [1, 0.78, 0.4]
    this.G(x, y, z, 0, 0, 0, 0.22, 0.9 * big, 2.4 * big, WHITE, 0.9) // hit flash, white-hot
    this.G(x, y, z, 0, 0, 0, 0.3, 1.0 * big, 2.8 * big, hot, 0.7)
    this.G(x, y - 0.55, z, 0, 0, 0, 0.45, 1.6 * big, 3.2 * big, hot, 0.5) // brief light thrown on the ground
    this.burst(b.additive ? 'glow' : 'soft', x, y, z, 12 * big, 1.5, 5, 1.8, 0.6, 0.22, 0.05, b.color, 0.95, b.grav, 1.2)
    if (!b.additive) this.burst('glow', x, y, z, 6, 1, 3.5, 1.2, 0.4, 0.14, 0.03, hot, 0.9, 6, 1)
  }
  shield(x: number, y: number, z: number): void {
    if (this.level === 'off') return
    this.vs = this.scaleAt(x, y, z, 1)
    const n = this.n(26)
    for (let i = 0; i < n; i++) { // dots on a hemisphere shell that fade and swell
      const th = rnd() * TAU, ph = Math.acos(rnd()), r = 0.9 * Math.sqrt(this.vs)
      const sx = Math.sin(ph) * Math.cos(th), sy = Math.cos(ph), sz = Math.sin(ph) * Math.sin(th)
      this.G(x + sx * r, y + sy * r * 0.9, z + sz * r, sx * 0.5, sy * 0.5, sz * 0.5, rr(0.3, 0.55), 0.22, 0.4, SHIELD_COLOR, 0.8, 0, 1)
    }
    this.ring('glow', x, y - 0.5, z, 12, 0.7, 0.8, 0.4, 0.2, 0.1, SHIELD_COLOR, 0.6)
  }
  /** A model is removed. `delaySec` staggers a squad. */
  death(x: number, y: number, z: number, fac: Faction, delaySec = 0): void {
    if (this.level !== 'off') this.schedule('death', fac, x, y, z, delaySec)
  }
  arrival(x: number, y: number, z: number, fac: Faction, delaySec = 0): void {
    if (this.level !== 'off') this.schedule('arrive', fac, x, y, z, delaySec)
  }
  burrow(x: number, y: number, z: number, up: boolean): void {
    if (this.level !== 'off') this.schedule(up ? 'unburrow' : 'burrow', 'zerg', x, y, z, 0)
  }
  /** Shimmer for a HIDDEN model; call at a throttled rate. Full level only. */
  cloak(x: number, y: number, z: number): void {
    if (this.level !== 'full') return
    const th = rnd() * TAU, r = rr(0.1, 0.5)
    this.G(x + Math.cos(th) * r, y + rnd() * 0.9, z + Math.sin(th) * r, 0, rr(0.2, 0.6), 0, rr(0.5, 0.9), 0.14, 0.02, [0.7, 0.85, 1], 0.35, 0, 0.3)
  }
  /** Dust puffs along a charge path (points are board x/z), spread over `durSec`. */
  chargeTrail(pts: readonly { x: number; z: number }[], y: number, durSec: number): void {
    if (this.level === 'off' || pts.length < 2) return
    const seglen = (i: number) => Math.hypot(pts[i]!.x - pts[i - 1]!.x, pts[i]!.z - pts[i - 1]!.z)
    let len = 0
    for (let i = 1; i < pts.length; i++) len += seglen(i)
    if (len <= 0) return
    const steps = Math.min(14, Math.max(2, Math.round(len / 1.1)))
    let seg = 1, acc = 0
    for (let k = 0; k < steps; k++) {
      const target = (k / (steps - 1)) * len
      while (seg < pts.length - 1 && acc + seglen(seg) < target) { acc += seglen(seg); seg++ }
      const a = pts[seg - 1]!, b = pts[seg]!, f = Math.min(1, Math.max(0, (target - acc) / (seglen(seg) || 1)))
      this.schedule('dust', 'terran', a.x + (b.x - a.x) * f, y, a.z + (b.z - a.z) * f, (k / steps) * durSec)
    }
  }
  /** Objective capture pulse: expanding ground ring plus a rising column. */
  capture(x: number, y: number, z: number, seatIndex: number): void {
    if (this.level === 'off') return
    this.vs = this.scaleAt(x, y, z, 0.6)
    const c = SEAT_COLOURS[Math.max(0, seatIndex) % SEAT_COLOURS.length]!
    this.ring('glow', x, y + 0.08, z, 36, 0.4, 3.2, 0.9, 0.22, 0.08, c, 0.9)
    this.ring('glow', x, y + 0.08, z, 24, 0.2, 1.8, 1.0, 0.2, 0.06, WHITE, 0.6)
    this.column('glow', x, y, z, 24, 0.5, 4, 1.2, 0.2, c, 0.7)
  }

  // ---------------------------------------------------------------------------------------------- scheduling
  private take(): Proj | null { for (const p of this.proj) if (!p.on) return p; return null }
  private schedule(kind: SchedKind, fac: Faction, x: number, y: number, z: number, delay: number): void {
    for (const s of this.sched) if (!s.on) { s.on = true; s.kind = kind; s.fac = fac; s.t = this.t + delay; s.x = x; s.y = y; s.z = z; return }
  }
  private fire(s: Sched): void {
    const { x, y, z, fac } = s
    this.vs = this.scaleAt(x, y, z, s.kind === 'death' ? 1 : 0.6)
    switch (s.kind) {
      case 'death':
        this.deathMark(fac, x, y, z)
        if (fac === 'terran') { // armour sparks, then a collapse of dust and smoke
          this.G(x, y + 0.5, z, 0, 0, 0, 0.22, 0.4, 1.8, [1, 0.8, 0.45], 0.8)
          this.burst('glow', x, y + 0.5, z, 14, 2, 6, 2.5, 0.6, 0.12, 0.02, [1, 0.7, 0.3], 1, 10, 0.8)
          if (this.smoke) this.burst('soft', x, y + 0.2, z, 8, 0.3, 1.1, 0.5, 1.2, 0.35, 0.9, [0.35, 0.33, 0.3], 0.55, -0.4, 1)
          this.ring('soft', x, y + 0.05, z, 10, 0.2, 1.4, 0.7, 0.3, 0.6, [0.5, 0.45, 0.4], 0.5)
        } else if (fac === 'zerg') { // bile flash and ichor burst, a splat on the ground, then a dissolving green haze rising
          this.G(x, y + 0.5, z, 0, 0, 0, 0.28, 0.4, 2.0, [0.75, 1, 0.35], 0.75)
          this.burst('glow', x, y + 0.5, z, 10, 1, 3.5, 1.5, 0.55, 0.16, 0.03, [0.7, 1, 0.3], 0.9, 6, 1)
          this.burst('soft', x, y + 0.4, z, 18, 1.2, 4.5, 2, 0.8, 0.22, 0.05, [0.5, 0.75, 0.12], 0.9, 10, 1)
          this.ring('soft', x, y + 0.04, z, 12, 0.1, 1.2, 0.9, 0.3, 0.6, [0.4, 0.6, 0.12], 0.6)
          this.burst('soft', x, y + 0.3, z, 7, 0.2, 0.7, 0.8, 1.3, 0.3, 0.9, [0.3, 0.5, 0.15], 0.45, -0.5, 1)
        } else { // blue-white warp-out
          this.column('glow', x, y, z, 26, 0.35, 3.2, 0.7, 0.2, [0.75, 0.92, 1], 0.9)
          this.ring('glow', x, y + 0.05, z, 18, 0.2, 2.2, 0.5, 0.14, 0.04, [0.5, 0.8, 1], 0.9)
          this.burst('glow', x, y + 0.7, z, 8, 0.2, 1.2, 0.2, 0.5, 0.2, 0.02, WHITE, 1, 0, 2)
        }
        break
      case 'arrive':
        if (fac === 'terran') { // bright drop flare falling in, a landing flash and shock ring, then a dust ring
          this.column('glow', x, y + 2, z, 14, 0.2, 5, 0.3, 0.35, [1, 0.85, 0.55], 0.95, true)
          this.G(x, y + 0.4, z, 0, 0, 0, 0.4, 0.5, 2.4, [1, 0.9, 0.65], 0.85)
          this.ring('glow', x, y + 0.06, z, 20, 0.3, 2.6, 0.45, 0.2, 0.06, [1, 0.8, 0.45], 0.85)
          this.ring('soft', x, y + 0.05, z, 16, 0.2, 2.4, 0.9, 0.3, 0.8, [0.55, 0.5, 0.42], 0.6)
          this.burst('soft', x, y + 0.1, z, 6, 0.3, 1.2, 0.6, 1, 0.3, 0.8, [0.5, 0.46, 0.4], 0.5, -0.2, 1)
        } else if (fac === 'zerg') { // creep burst and dirt spray, with a faint bioluminescent pulse
          this.ring('glow', x, y + 0.06, z, 16, 0.2, 2.2, 0.6, 0.2, 0.06, [0.75, 0.4, 0.9], 0.7)
          this.ring('soft', x, y + 0.04, z, 18, 0.2, 2.0, 1.0, 0.35, 0.8, [0.35, 0.18, 0.35], 0.65)
          this.burst('soft', x, y + 0.1, z, 14, 1.2, 3.6, 2.4, 0.8, 0.18, 0.06, [0.32, 0.24, 0.16], 0.9, 11, 0.8)
        } else { // warp-in shimmer column
          this.column('glow', x, y, z, 28, 0.4, 3.5, 0.8, 0.2, [0.6, 0.85, 1], 0.9)
          this.ring('glow', x, y + 0.05, z, 18, 0.1, 1.6, 0.6, 0.12, 0.04, [0.9, 1, 1], 0.9)
        }
        break
      case 'burrow':
        this.burst('soft', x, y + 0.05, z, 14, 1, 3.2, 2.2, 0.8, 0.2, 0.06, [0.38, 0.28, 0.18], 0.9, 11, 0.8)
        this.ring('soft', x, y + 0.04, z, 10, 0.2, 1.3, 0.7, 0.3, 0.7, [0.4, 0.3, 0.2], 0.55)
        break
      case 'unburrow':
        this.burst('soft', x, y + 0.05, z, 20, 1.5, 4.2, 3.2, 0.9, 0.22, 0.06, [0.4, 0.3, 0.2], 0.95, 11, 0.7)
        this.ring('soft', x, y + 0.04, z, 14, 0.2, 2.0, 0.8, 0.35, 0.8, [0.42, 0.32, 0.22], 0.6)
        break
      case 'dust':
        this.burst('soft', x, y + 0.1, z, 2, 0.1, 0.6, 0.3, 0.7, 0.3, 0.8, [0.6, 0.55, 0.46], 0.5, -0.1, 1.2)
        break
    }
  }
  /** A short-lived mark where a model fell, plus a flash of light on the ground: scorch (Terran), creep splat (Zerg), plasma scar (Protoss). */
  private deathMark(fac: Faction, x: number, y: number, z: number): void {
    if (fac === 'terran') {
      this.G(x, y + 0.2, z, 0, 0, 0, 0.35, 1.4, 3.4, [1, 0.7, 0.3], 0.6)
      this.S(x, y + 0.06, z, 0, 0, 0, 6, 1.5, 1.7, [0.07, 0.06, 0.05], 0.6) // scorch
    } else if (fac === 'zerg') {
      this.G(x, y + 0.2, z, 0, 0, 0, 0.35, 1.4, 3.2, [0.7, 1, 0.3], 0.55)
      this.S(x, y + 0.06, z, 0, 0, 0, 7, 1.6, 1.9, [0.34, 0.16, 0.38], 0.6) // creep splat
      this.S(x + 0.15, y + 0.07, z - 0.1, 0, 0, 0, 5, 0.9, 1.0, [0.42, 0.62, 0.12], 0.55)
    } else {
      this.G(x, y + 0.2, z, 0, 0, 0, 0.4, 1.4, 3.6, [0.6, 0.9, 1], 0.7)
      this.G(x, y + 0.08, z, 0, 0, 0, 2.6, 1.3, 1.5, [0.3, 0.7, 1], 0.45) // plasma scar fading
      this.S(x, y + 0.06, z, 0, 0, 0, 4, 1.2, 1.3, [0.08, 0.12, 0.2], 0.45)
    }
  }
  private impact(kind: ImpactKind, x: number, y: number, z: number, fac: Faction, size: number): void {
    const b = BLOOD[fac]
    this.vs = this.scaleAt(x, y, z, 1)
    const gy = y - 0.6 // approximate ground under a model-centre hit
    switch (kind) {
      case 'spark':
        this.G(x, y, z, 0, 0, 0, 0.14, 0.5, 1.5, [1, 0.95, 0.75], 0.95)
        this.G(x, gy, z, 0, 0, 0, 0.25, 0.9, 2.0, [1, 0.7, 0.3], 0.4)
        this.burst(b.additive ? 'glow' : 'soft', x, y, z, 10, 1.5, 4.5, 1, 0.45, 0.18, 0.04, b.color, 0.95, b.grav, 1.5)
        break
      case 'big':
        this.burst('glow', x, y, z, 26, 2, 7, 2, 0.6, 0.26, 0.04, [1, 0.7, 0.3], 1, 8, 0.8)
        this.G(x, y, z, 0, 0, 0, 0.26, 0.8, 3.2 + size * 2, [1, 0.88, 0.55], 0.95)
        this.G(x, gy, z, 0, 0, 0, 0.5, 2.0, 4.6 + size * 2, [1, 0.6, 0.2], 0.55) // ground light
        if (this.smoke) this.burst('soft', x, y, z, 8, 0.4, 1.4, 0.8, 1.1, 0.4, 1.0, [0.22, 0.21, 0.2], 0.5, -0.4, 1)
        this.ring('soft', x, gy, z, 12, 0.2, 2.6, 0.7, 0.3, 0.7, [0.5, 0.45, 0.4], 0.5)
        this.S(x, gy + 0.08, z, 0, 0, 0, 4.5, 1.0 + size, 1.2 + size, [0.08, 0.07, 0.06], 0.5) // scorch
        break
      case 'acid':
        this.G(x, y, z, 0, 0, 0, 0.2, 0.7, 2.0, [0.7, 1, 0.3], 0.85)
        this.burst('soft', x, y, z, 18, 1.2, 4.2, 1.6, 0.8, 0.28, 0.06, [0.55, 0.95, 0.15], 0.95, 10, 1.2)
        this.ring('soft', x, gy, z, 8, 0.1, 1.5, 0.5, 0.3, 0.55, [0.5, 0.85, 0.15], 0.7)
        this.S(x, gy + 0.08, z, 0, 0, 0, 2.5, 0.8, 1.0, [0.36, 0.62, 0.08], 0.65) // corroding pool
        break
      case 'psi':
        this.G(x, y, z, 0, 0, 0, 0.2, 0.5, 2.0, [0.85, 0.97, 1], 0.95)
        this.G(x, gy, z, 0, 0, 0, 0.35, 1.0, 2.8, [0.4, 0.8, 1], 0.5)
        this.burst('glow', x, y, z, 14, 1.5, 5, 0.6, 0.5, 0.22, 0.02, [0.55, 0.88, 1], 1, 0, 2)
        break
      case 'thud':
        this.ring('soft', x, gy, z, 12, 0.2, 2.0, 0.6, 0.28, 0.7, [0.6, 0.54, 0.44], 0.6)
        this.G(x, y, z, 0, 0, 0, 0.14, 0.4, 1.4, [1, 0.9, 0.6], 0.8)
        this.burst('glow', x, y, z, 7, 1, 3, 1.2, 0.35, 0.14, 0.02, [1, 0.85, 0.5], 0.9, 8, 1)
        break
    }
  }

  // ---------------------------------------------------------------------------------------------- frame update
  update(dtIn: number): void {
    if (this.level === 'off') return
    const dt = Math.min(0.05, Math.max(0, dtIn))
    this.t += dt; this.dt = dt || 1 / 60
    // Age the pools first, then spawn: single-frame sprites (bolt heads, beam lines) are then drawn at full strength for exactly the frame they are made.
    this.glow.update(dt); this.soft.update(dt)
    for (const s of this.sched) if (s.on && this.t >= s.t) { s.on = false; this.fire(s) }
    for (const p of this.proj) if (p.on && this.t >= p.t0) this.stepProj(p)
  }
  /** Lifetime of a one-frame sprite. */
  private get frameLife(): number { return Math.max(0.017, this.dt * 0.9) }
  /** Lifetime for a trail particle so it only trails `inches` behind a head moving at p.vel (never the whole path), within [lo, hi] seconds. */
  private tailLife(p: Proj, inches: number, lo: number, hi: number): number { return Math.min(hi, Math.max(lo, inches / Math.max(1, p.vel))) }
  /** Head position on the path at fraction k, with arc, fan offset and (glaive) hop. */
  private projAt(p: Proj, k: number): [number, number, number] {
    const s = p.spec!, o = this.tmp
    const rx = p.x1 - p.x0, rz = p.z1 - p.z0, range = Math.hypot(rx, rz) || 1
    const kk = Math.min(1, Math.max(0, k))
    let x = p.x0 + rx * kk, z = p.z0 + rz * kk
    let y = p.y0 + (p.y1 - p.y0) * kk + 4 * s.arc * p.arcMul * range * kk * (1 - kk)
    if (p.lat) {
      const l = s.trail === 'beam' ? p.lat : p.lat * Math.sin(kk * Math.PI)
      x += (-rz / range) * l; z += (rx / range) * l
    }
    if (s.trail === 'disc') y += 0.4 * Math.abs(Math.sin((kk * range * Math.PI) / 2.8)) * Math.min(1, kk * 6)
    o[0] = x; o[1] = y; o[2] = z
    return o
  }
  private stepProj(p: Proj): void {
    const el = this.t - p.t0
    const k = Math.min(1, el / p.dur)
    if (p.melee) {
      const s = p.mspec!
      this.vs = this.scaleAt(p.x0, p.y0, p.z0, 0.7)
      if (!p.started) { p.started = true; p.px = p.ang0 }
      const ang = p.ang0 + p.sweep * k, prev = p.px
      const steps = Math.max(1, Math.ceil(Math.abs(ang - prev) / 0.12))
      for (let i = 1; i <= steps; i++) {
        const a = prev + ((ang - prev) * i) / steps
        const x = p.x0 + Math.cos(a) * s.radius, z = p.z0 + Math.sin(a) * s.radius, y = p.y0 + 0.2 + rr(0, 0.15)
        this.G(x, y, z, 0, 0, 0, 0.22, s.glow, s.glow * 0.2, s.color, 0.95, 0, 0)
        this.G(x, y, z, 0, 0, 0, 0.1, s.glow * 0.5, s.glow * 0.1, WHITE, 1, 0, 0)
      }
      p.px = ang
      if (k >= 1) { p.on = false; this.impact(s.impact, p.x1, p.y1 + 0.2, p.z1, p.fac, 1) }
      return
    }
    const s = p.spec!
    const h = this.projAt(p, k)
    const x = h[0], y = h[1], z = h[2]
    this.vs = this.scaleAt(x, y, z, 0.6)
    if (!p.started) {
      p.started = true
      if (s.flash > 0) { // muzzle flash
        this.G(p.x0, p.y0, p.z0, 0, 0, 0, 0.1, s.flash * 0.7, s.flash * 1.2, [1, 0.95, 0.8], 0.95)
        this.G(p.x0, p.y0, p.z0, 0, 0, 0, 0.14, s.flash * 0.5, s.flash * 1.6, s.color, 0.7)
        this.burst('glow', p.x0, p.y0, p.z0, 4, 1, 3, 0, 0.18, 0.1, 0.02, s.color, 0.9, 0, 2)
      }
    }
    const fl = this.frameLife
    const dist = Math.hypot(x - p.px, y - p.py, z - p.pz)
    const pathLen = Math.max(0.5, Math.hypot(p.x1 - p.x0, p.z1 - p.z0))
    switch (s.trail) {
      case 'streak': { // head plus a short tail in world inches, drawn for this frame only
        const tail = s.tail ?? 1.2, m = Math.max(2, Math.ceil(tail / 0.25)), kt = Math.min(k, tail / pathLen)
        for (let j = m; j >= 0; j--) {
          const f = j / m, q = this.projAt(p, k - kt * f)
          this.G(q[0], q[1], q[2], 0, 0, 0, fl, s.size * (1 - 0.7 * f), s.size * (1 - 0.7 * f), s.color, 0.95 * (1 - 0.85 * f), 0, 0)
        }
        this.G(x, y, z, 0, 0, 0, fl, s.size * 2.1, s.size * 2.1, WHITE, 1)
        this.G(x, y, z, 0, 0, 0, fl, s.size * 4, s.size * 4, s.color, 0.35)
        break
      }
      case 'bone': { // pale bone dart tinted green: opaque flecks, not a glowing line
        const tail = s.tail ?? 1, m = Math.max(2, Math.ceil(tail / 0.3)), kt = Math.min(k, tail / pathLen)
        for (let j = m; j >= 0; j--) {
          const f = j / m, q = this.projAt(p, k - kt * f)
          this.S(q[0], q[1], q[2], 0, 0, 0, fl, s.size * (1 - 0.6 * f), s.size * (1 - 0.6 * f), [0.88 - 0.35 * f, 0.92 - 0.1 * f, 0.62 - 0.2 * f], 1 - 0.5 * f)
        }
        this.G(x, y, z, 0, 0, 0, fl, s.size * 2.4, s.size * 2.4, [0.45, 1, 0.3], 0.55)
        break
      }
      case 'glow': { // bio-blast: a bright orb with a short violet comet tail and sparkles
        const steps = Math.min(14, Math.max(1, Math.ceil(dist / 0.3)))
        const life = this.tailLife(p, s.tail ?? 2, 0.05, 0.22)
        for (let i = 1; i <= steps; i++) {
          const f = i / steps, tx = p.px + (x - p.px) * f, ty = p.py + (y - p.py) * f, tz = p.pz + (z - p.pz) * f
          this.G(tx, ty, tz, 0, 0, 0, life, s.size * 0.8, s.size * 0.1, s.color, 0.8, 0, 0)
        }
        this.G(x, y, z, 0, 0, 0, fl, s.size * 1.9, s.size * 1.9, s.color, 0.8)
        this.G(x, y, z, 0, 0, 0, fl, s.size * 1.1, s.size * 1.1, [0.85, 1, 0.6], 1)
        if (rnd() < 0.5) this.G(x + rr(-0.3, 0.3), y + rr(-0.2, 0.3), z + rr(-0.3, 0.3), 0, 0.5, 0, 0.25, 0.14, 0.02, [0.6, 1, 0.3], 0.9, 0, 1)
        break
      }
      case 'smoke': { // bright head, engine glow behind it, and short dark ash puffs that fade fast
        const steps = Math.min(14, Math.max(1, Math.ceil(dist / 0.3)))
        const puff = this.tailLife(p, 3.2, 0.1, 0.3)
        for (let i = 1; i <= steps; i++) {
          const f = i / steps, tx = p.px + (x - p.px) * f, ty = p.py + (y - p.py) * f, tz = p.pz + (z - p.pz) * f
          this.G(tx, ty, tz, 0, 0, 0, Math.max(fl, 0.07), s.size * 0.9, s.size * 0.2, [1, 0.6, 0.2], 0.9, 0, 0)
          if (this.smoke && i % 2 === 0) this.S(tx, ty, tz, rr(-0.1, 0.1), rr(0.05, 0.25), rr(-0.1, 0.1), puff, s.size * 0.5, s.size * 1.2, [0.3, 0.29, 0.28], 0.4, 0, 1)
        }
        const q = this.projAt(p, k - 0.5 / pathLen)
        this.G(q[0], q[1], q[2], 0, 0, 0, fl, s.size * 3.2, s.size * 3.2, [1, 0.5, 0.12], 0.55) // engine glow
        this.G(x, y, z, 0, 0, 0, fl, s.size * 2.2, s.size * 2.2, [1, 0.95, 0.7], 1) // head
        this.G(x, y, z, 0, 0, 0, fl, s.size * 1.0, s.size * 1.0, WHITE, 1)
        break
      }
      case 'drip': { // acid glob: big bright blob with a halo, shedding falling droplets
        this.G(x, y, z, 0, 0, 0, fl, s.size * 3.2, s.size * 3.2, [0.6, 1, 0.2], 0.4)
        this.S(x, y, z, 0, 0, 0, fl, s.size * 1.6, s.size * 1.6, [0.4, 0.8, 0.08], 1)
        this.G(x, y + s.size * 0.15, z, 0, 0, 0, fl, s.size * 0.9, s.size * 0.9, [0.85, 1, 0.5], 1)
        const steps = Math.min(6, Math.max(1, Math.ceil(dist / 0.6)))
        for (let i = 1; i <= steps; i++) {
          const f = i / steps, tx = p.px + (x - p.px) * f, ty = p.py + (y - p.py) * f, tz = p.pz + (z - p.pz) * f
          this.S(tx + rr(-0.1, 0.1), ty - 0.1, tz + rr(-0.1, 0.1), rr(-0.2, 0.2), rr(-0.2, 0.3), rr(-0.2, 0.2), this.tailLife(p, 2.5, 0.12, 0.5) * rr(0.8, 1), s.size * 0.4, s.size * 0.15, [0.5, 0.95, 0.12], 0.95, 12, 0.5)
        }
        break
      }
      case 'disc': { // spinning disc head; a cyan ring echo every couple of inches, each fading before the next far behind
        const spin = this.t * 38, r = s.size * 1.15
        for (let i = 0; i < 6; i++) {
          const a = spin + (i / 6) * TAU
          this.G(x + Math.cos(a) * r, y + Math.sin(a) * r * 0.45, z + Math.sin(a) * r, 0, 0, 0, fl, s.size * 0.55, s.size * 0.55, [0.7, 0.97, 1], 0.95)
        }
        this.G(x, y, z, 0, 0, 0, fl, s.size * 1.6, s.size * 1.6, [0.3, 0.75, 1], 0.5)
        this.G(x, y, z, 0, 0, 0, fl, s.size * 0.8, s.size * 0.8, WHITE, 1)
        p.acc += dist
        if (p.acc >= 2) {
          p.acc = 0
          const life = this.tailLife(p, 3, 0.07, 0.2)
          this.ring('glow', x, y, z, 8, 0.25, 1.6, life, 0.13, 0.04, [0.35, 0.85, 1], 0.9)
        }
        break
      }
      case 'beam': { // twin thin lines from the barrels to the target, pulsing; held briefly after arrival
        const full = el >= p.dur, kEnd = full ? 1 : k
        const fade = full ? Math.max(0, 1 - (el - p.dur) / Math.max(0.05, p.hold)) : 1
        const pulse = 0.75 + 0.25 * Math.sin(this.t * 55 + p.lat * 9)
        const stepIn = this.density >= 1 ? 0.3 : 0.6
        const nPts = Math.max(2, Math.ceil((pathLen * kEnd) / stepIn))
        for (let i = 0; i <= nPts; i++) {
          const q = this.projAt(p, (kEnd * i) / nPts)
          const w = 0.6 + 0.4 * Math.sin(i * 0.9 - this.t * 40) // travelling pulse along the line
          this.G(q[0], q[1], q[2], 0, 0, 0, fl, s.size * pulse * (0.7 + 0.5 * w), s.size * pulse, s.color, 0.75 * fade * (0.6 + 0.4 * w))
          if (i % 2 === 0) this.G(q[0], q[1], q[2], 0, 0, 0, fl, s.size * 0.42, s.size * 0.42, WHITE, 0.9 * fade)
        }
        const e = this.projAt(p, kEnd)
        this.G(e[0], e[1], e[2], 0, 0, 0, fl, s.size * 3.4 * pulse, s.size * 3.4 * pulse, [0.5, 0.95, 1], 0.8 * fade) // bright terminus
        break
      }
      default: // 'none'
        this.G(x, y, z, 0, 0, 0, fl, s.size * 1.5, s.size * 1.5, WHITE, 1)
    }
    p.px = x; p.py = y; p.pz = z
    if (!p.landed && k >= 1) {
      p.landed = true
      this.impact(s.impact, p.x1 + (s.trail === 'beam' ? p.lat : 0), p.y1, p.z1, p.fac, s.size)
      if (p.hops > 0) { // glaive: a short hop to a nearby point
        const q = this.take()
        if (q) {
          const a = rnd() * TAU
          q.on = true; q.started = false; q.melee = false; q.landed = false; q.t0 = this.t + 0.04; q.dur = Math.max(0.1, 0.16 * this.timeScale)
          q.spec = s; q.mspec = null; q.fac = p.fac; q.hops = 0; q.lat = 0; q.arcMul = 1; q.hold = 0; q.acc = 0; q.vel = 1.6 / q.dur
          q.x0 = p.x1; q.y0 = p.y1; q.z0 = p.z1; q.x1 = p.x1 + Math.cos(a) * 1.6; q.y1 = p.y1 + 0.2; q.z1 = p.z1 + Math.sin(a) * 1.6
          q.px = p.x1; q.py = p.y1; q.pz = p.z1
        }
      }
    }
    if (el >= p.dur + p.hold) p.on = false
  }
}
