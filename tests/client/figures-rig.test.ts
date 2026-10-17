// Split-plane config (tools/models/split-planes.json) and the GLB rig capability report (figures/rig.ts).
import { readFileSync } from 'node:fs'
import { Group, Mesh, BoxGeometry, MeshBasicMaterial } from 'three'
import { describe, expect, it } from 'vitest'
import { buildGlbRig, LUNGE_SLUGS, pulse, rigCapabilities, TURRET_SLUGS, turretRelative, wrapAngle } from '../../src/client/figures/rig'
import { RingBatches } from '../../src/client/figures/rings'
import { isBatchable } from '../../src/client/figures/glbBatch'

const planes = JSON.parse(readFileSync('tools/models/split-planes.json', 'utf8')) as Record<string, {
  file: string; normal?: number[]; frac?: number; offset?: number; below: string; above: string
}>
const manifest = JSON.parse(readFileSync('public/models/manifest.json', 'utf8')) as Record<string, { file: string }>

describe('split-planes.json', () => {
  it('covers the turret and large Zerg slugs', () => {
    for (const s of [...TURRET_SLUGS, ...LUNGE_SLUGS]) expect(planes[s], s).toBeDefined()
  })
  it('every entry points at a manifest model and has a sane plane', () => {
    for (const [slug, c] of Object.entries(planes)) {
      expect(manifest[slug]?.file, slug).toBe(c.file)
      expect(c.below).toBe('lower')
      expect(c.above).toBe('upper')
      const n = c.normal ?? [0, 1, 0]
      expect(n).toHaveLength(3)
      expect(Math.hypot(...(n as [number, number, number]))).toBeGreaterThan(0.99)
      if (c.offset === undefined) { expect(c.frac).toBeGreaterThan(0.1); expect(c.frac).toBeLessThan(0.9) }
    }
  })
})

describe('rig capabilities', () => {
  it('turret rig for a split siege tank / goliath', () => {
    expect(rigCapabilities('siege-tank', ['lower', 'upper', 'x'])).toEqual({ parts: ['lower', 'upper'], turret: true, lunge: false })
    expect(rigCapabilities('goliath', ['upper', 'lower']).turret).toBe(true)
  })
  it('lunge rig for large Zerg', () => {
    for (const s of ['hydralisk', 'queen', 'ravager', 'omega-worm']) expect(rigCapabilities(s, ['lower', 'upper']), s).toMatchObject({ turret: false, lunge: true })
  })
  it('degrades: one-node models and unlisted slugs are inert', () => {
    expect(rigCapabilities('marine', ['figure', 'base'])).toEqual({ parts: [], turret: false, lunge: false })
    expect(rigCapabilities('siege-tank', ['figure', 'base']).turret).toBe(false)
    expect(rigCapabilities('siege-tank', ['upper']).turret).toBe(false)
    expect(rigCapabilities('marine', ['lower', 'upper'])).toMatchObject({ turret: false, lunge: false })
  })
  it('buildGlbRig moves only the upper node and resets', () => {
    const root = new Group()
    const lower = new Group(); lower.name = 'lower'
    const upper = new Group(); upper.name = 'upper'
    const turret = new Mesh(new BoxGeometry(1, 1, 1), new MeshBasicMaterial()); turret.position.set(0.5, 1, 0)
    upper.add(turret); lower.add(new Mesh(new BoxGeometry(2, 1, 2), new MeshBasicMaterial()))
    root.add(lower, upper)
    const rig = buildGlbRig(root, 'siege-tank')
    expect(rig.caps.turret).toBe(true)
    rig.apply({ turret: 1 })
    expect(upper.rotation.y).toBeCloseTo(1)
    expect(lower.rotation.y).toBe(0)
    rig.reset()
    expect(upper.rotation.y).toBe(0)
    expect(upper.position.length()).toBeCloseTo(0)
    const zerg = buildGlbRig(root, 'hydralisk')
    zerg.apply({ lunge: 1 })
    expect(upper.position.z).toBeGreaterThan(0)
    expect(upper.rotation.x).toBeGreaterThan(0)
  })
  it('an inert rig does nothing', () => {
    const root = new Group(); const one = new Group(); one.name = 'figure'; root.add(one)
    const rig = buildGlbRig(root, 'marine')
    expect(() => { rig.apply({ turret: 2, lunge: 1 }); rig.reset() }).not.toThrow()
    expect(isBatchable(root, 'marine')).toBe(true)
    const split = new Group(); const lo = new Group(); lo.name = 'lower'; const up = new Group(); up.name = 'upper'; split.add(lo, up)
    expect(isBatchable(split, 'siege-tank')).toBe(false)
    expect(isBatchable(split, 'marine')).toBe(true)
  })
  it('angle helpers', () => {
    expect(wrapAngle(Math.PI * 3)).toBeCloseTo(Math.PI)
    expect(turretRelative(0.1, 6.2832)).toBeCloseTo(0.1, 3)
    expect(pulse(0, 100)).toBe(0)
    expect(pulse(50, 100)).toBeCloseTo(1)
    expect(pulse(100, 100)).toBe(0)
  })
})

describe('instanced base rings', () => {
  it('one draw call per base radius, slots recycled', () => {
    const rb = new RingBatches()
    const hs = [0.63, 0.63, 0.63, 0.79, 0.79].map((r) => rb.acquire(r))
    expect(rb.size).toBe(5)
    expect(rb.drawCalls).toBe(2)
    hs.forEach((h, i) => h.set(i, 0.025, i, '#ff0000'))
    hs[0]!.release()
    expect(rb.size).toBe(4)
    for (let i = 0; i < 40; i++) rb.acquire(0.63).set(i, 0, 0, '#00ff00')
    expect(rb.drawCalls).toBe(2)
    expect(rb.size).toBe(44)
  })
})
