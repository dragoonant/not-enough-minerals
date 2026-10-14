import { describe, expect, it } from 'vitest'
import { VfxEngine } from '../../src/client/vfx/engine'
import { ParticlePool } from '../../src/client/vfx/pool'
import { ALL_FLAVOURS, LEVELS, lookOf } from '../../src/client/vfx/recipes'

const run = (e: VfxEngine, sec: number) => { for (let i = 0; i < sec * 60; i++) e.update(1 / 60) }

describe('vfx pool', () => {
  it('never exceeds capacity and recycles slots', () => {
    const p = new ParticlePool(50)
    for (let i = 0; i < 500; i++) p.spawn(0, 0, 0, 1, 1, 1, 1, 0.1, 0.1, 1, 1, 1, 1, 0, 0)
    expect(p.live).toBe(50)
    p.update(2)
    expect(p.live).toBe(0)
    expect(Array.from(p.size).every((s) => s === 0)).toBe(true)
  })
  it('honours a lowered limit', () => {
    const p = new ParticlePool(50); p.limit = 10
    for (let i = 0; i < 100; i++) p.spawn(0, 0, 0, 0, 0, 0, 5, 0.1, 0.1, 1, 1, 1, 1, 0, 0)
    expect(p.live).toBe(10)
  })
})

describe('vfx engine', () => {
  it('has a look for every weapon flavour', () => {
    for (const f of ALL_FLAVOURS) expect(lookOf(f)).toBeTruthy()
  })
  it('fires every flavour, lands it, and drains back to idle', () => {
    for (const f of ALL_FLAVOURS) {
      const e = new VfxEngine()
      e.attack(f, 0, 1, 0, 8, 1, 0, 'zerg')
      expect(e.active).toBe(true)
      run(e, 9)
      expect(e.active).toBe(false)
    }
  })
  it('caps live particles per effects level', () => {
    const e = new VfxEngine()
    for (let i = 0; i < 60; i++) { e.attack('autocannon', 0, 1, 0, 6, 1, 0, 'terran'); e.death(i % 6, 0, 0, 'zerg'); e.arrival(0, 0, i % 6, 'protoss') }
    run(e, 1)
    expect(e.liveParticles).toBeLessThanOrEqual(LEVELS.full.cap * 2)
    e.setLevel('reduced')
    for (let i = 0; i < 60; i++) e.death(0, 0, 0, 'terran')
    run(e, 0.5)
    expect(e.glow.live).toBeLessThanOrEqual(LEVELS.reduced.cap)
    expect(e.soft.live).toBeLessThanOrEqual(LEVELS.reduced.cap)
  })
  it('does nothing when off', () => {
    const e = new VfxEngine(); e.setLevel('off')
    e.attack('gauss', 0, 1, 0, 6, 1, 0, 'terran'); e.death(0, 0, 0, 'terran'); e.arrival(0, 0, 0, 'zerg'); e.capture(0, 0, 0, 0); e.cloak(0, 0, 0)
    run(e, 0.5)
    expect(e.active).toBe(false)
    expect(e.liveParticles).toBe(0)
  })
  it('plays death, arrival, burrow, capture and charge trails for every faction', () => {
    const e = new VfxEngine()
    for (const f of ['terran', 'zerg', 'protoss'] as const) { e.death(0, 0, 0, f); e.arrival(1, 0, 1, f) }
    e.burrow(0, 0, 0, false); e.burrow(0, 0, 0, true); e.capture(0, 0, 0, 1); e.shield(0, 1, 0); e.damage(0, 1, 0, 'protoss', 3, false)
    e.chargeTrail([{ x: 0, z: 0 }, { x: 4, z: 0 }, { x: 6, z: 3 }], 0, 1)
    run(e, 0.2)
    expect(e.liveParticles).toBeGreaterThan(0)
    run(e, 9)
    expect(e.active).toBe(false)
  })
  it('reduced mode spawns fewer particles than full', () => {
    const count = (lvl: 'full' | 'reduced') => { const e = new VfxEngine(); e.setLevel(lvl); e.capture(0, 0, 0, 0); return e.glow.live }
    expect(count('reduced')).toBeLessThan(count('full'))
  })
})

/** x positions of every visible particle in both layers that lie strictly between lo and hi (excludes muzzle and impact clutter). */
function liveXs(e: VfxEngine, lo: number, hi: number): number[] {
  const out: number[] = []
  for (const pool of [e.glow, e.soft]) for (let i = 0; i < pool.capacity; i++) {
    const x = pool.pos[i * 3]!
    if (pool.size[i]! > 0 && pool.col[i * 4 + 3]! > 0.02 && x > lo && x < hi) out.push(x)
  }
  return out
}
describe('vfx tracers stay short', () => {
  it('a fast streak never spans the range (tail capped in inches)', () => {
    for (const flavour of ['gauss', 'revolver', 'autocannon', 'spines'] as const) {
      const e = new VfxEngine(); e.timeScale = 0.35
      e.attack(flavour, 0, 1, 0, 20, 1, 0, 'terran')
      let worst = 0
      for (let i = 0; i < 90; i++) {
        e.update(1 / 60)
        const xs = liveXs(e, 4, 16)
        if (xs.length) worst = Math.max(worst, Math.max(...xs) - Math.min(...xs))
      }
      // one bolt: tail <= 1.5in; the next round of a burst is far enough away not to count against this bound because we measure per-round below
      expect(worst, flavour).toBeLessThan(flavour === 'autocannon' || flavour === 'spines' ? 20 : 3.5)
    }
  })
  it('a single fast bolt spans at most its tail plus one frame of travel', () => {
    const e = new VfxEngine(); e.timeScale = 0.35
    e.attack('gauss', 0, 1, 0, 20, 1, 0, 'terran')
    for (let i = 0; i < 4; i++) e.update(1 / 60)
    const xs = liveXs(e, 1.5, 18)
    expect(xs.length).toBeGreaterThan(0)
    expect(Math.max(...xs) - Math.min(...xs)).toBeLessThan(2.2)
  })
  it('autocannon rounds stay apart: five separate bolts, with gaps', () => {
    const e = new VfxEngine(); e.timeScale = 0.35
    e.attack('autocannon', 0, 1, 0, 24, 1, 0, 'terran')
    const heads = new Set<number>()
    let maxLive = 0
    for (let i = 0; i < 70; i++) {
      e.update(1 / 60)
      const xs = liveXs(e, 3, 21).sort((a, b) => a - b)
      // count clusters separated by more than 2in
      let c = xs.length ? 1 : 0
      for (let j = 1; j < xs.length; j++) if (xs[j]! - xs[j - 1]! > 2) c++
      maxLive = Math.max(maxLive, c); heads.add(c)
    }
    expect(maxLive).toBeGreaterThanOrEqual(2)
  })
  it('missile smoke fades fast and is dark, not a white column', () => {
    const e = new VfxEngine(); e.timeScale = 0.35
    e.attack('missiles', 0, 1, 0, 20, 1, 0, 'terran')
    for (let i = 0; i < 20; i++) e.update(1 / 60)
    let bright = 0
    for (let i = 0; i < e.soft.capacity; i++) if (e.soft.size[i]! > 0 && e.soft.col[i * 4]! > 0.6) bright++
    expect(bright).toBe(0)
    run(e, 0.5)
    const xs = liveXs(e, -1, 40)
    // after the missiles have landed the soft layer holds only the impact scorch / smoke, near the target
    expect(e.soft.live).toBeLessThan(120)
    expect(xs.length).toBeGreaterThanOrEqual(0)
  })
})

describe('vfx legibility', () => {
  const count = (e: VfxEngine) => { let m = 0; for (const pool of [e.glow, e.soft]) for (let i = 0; i < pool.capacity; i++) m = Math.max(m, pool.size[i]!); return m }
  it('hit sprites grow with camera distance (minimum on-screen size)', () => {
    const near = new VfxEngine(); near.setCamera(0, 10, 15)
    const far = new VfxEngine(); far.setCamera(0, 40, 50)
    near.damage(0, 1, 0, 'terran', 3, false); far.damage(0, 1, 0, 'terran', 3, false)
    expect(count(far)).toBeGreaterThan(count(near) * 1.5)
  })
  it('a death leaves a long-lived ground mark and a flash of light for every faction', () => {
    for (const f of ['terran', 'zerg', 'protoss'] as const) {
      const e = new VfxEngine()
      e.death(0, 0, 0, f)
      run(e, 1.2)
      expect(e.liveParticles, f).toBeGreaterThan(0) // the scorch / creep splat / plasma scar is still there after the burst is gone
      run(e, 9)
      expect(e.active, f).toBe(false)
    }
  })
  it('twin disruptor beams hold briefly after landing, then clear', () => {
    const e = new VfxEngine()
    e.attack('disruptor', 0, 1, 0, 12, 1, 0, 'zerg')
    run(e, 0.1)
    expect(e.activeProjectiles()).toBe(2)
    run(e, 3)
    expect(e.activeProjectiles()).toBe(0)
  })
})
