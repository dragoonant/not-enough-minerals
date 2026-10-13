import { describe, expect, it } from 'vitest'
import { engagedModels, engagedPairs, engagedWith, isEngaged, modelsEngaged } from '../../src/engine/engage'
import { baseRadius } from '../../src/engine/geometry'
import type { GameState, TerrainInstance, Vec2 } from '../../src/engine/types'
import { bundle, duelState, squad, ter, type SquadSpec } from './helpers'

const b = bundle()
function arena(specs: SquadSpec[], terrain: TerrainInstance[] = []): GameState {
  const s0 = duelState(b)
  const sq = specs.map((x) => squad(b, x))
  return {
    ...s0, terrain,
    models: Object.fromEntries(sq.flatMap((x) => x.models).map((m) => [m.id, m])),
    units: Object.fromEntries(sq.map((x) => [x.unit.id, x.unit])),
  }
}
const lay = (s: GameState, at: Record<string, Vec2>): GameState => ({
  ...s, models: Object.fromEntries(Object.entries(s.models).map(([id, m]) => [id, at[id] ? { ...m, pos: at[id]! } : m])),
})
/** A marine at the origin and a zergling `gap` inches (base edge to base edge) to its east. */
const pair = (gap: number, terrain: TerrainInstance[] = [], enemy = 'zergling'): GameState => {
  const s = arena([
    { id: 'm', owner: 'A', profileId: 'marine', models: 1, at: { x: 0, z: 0 } },
    { id: 'z', owner: 'B', profileId: enemy, models: 1, at: { x: 0, z: 9 } },
  ], terrain)
  const er = baseRadius(32)
  return lay(s, { 'm.0': { x: -5, z: 0 }, 'z.0': { x: -5 + er * 2 + gap, z: 0 } })
}
const solid = (id: string, x: number, z: number, w: number, d: number, size: number, extra: Record<string, unknown> = {}): TerrainInstance =>
  ter(id, 'obstruction', x, z, w, d, size, { size, ...extra })

describe('engagement', () => {
  it('ENG-001 two enemy models are Engaged within 1" of each other, measured edge to edge', () => {
    expect(modelsEngaged(pair(0.9), b, 'm.0', 'z.0')).toBe(true)
    expect(modelsEngaged(pair(1.0), b, 'm.0', 'z.0')).toBe(true)
    expect(modelsEngaged(pair(1.1), b, 'm.0', 'z.0')).toBe(false)
    expect(modelsEngaged(pair(0), b, 'm.0', 'z.0')).toBe(true)
  })

  it('ENG-001 friends are never Engaged with each other', () => {
    const s = arena([
      { id: 'm', owner: 'A', profileId: 'marine', models: 2, at: { x: 0, z: 0 } },
      { id: 'z', owner: 'B', profileId: 'zergling', models: 1, at: { x: 0, z: 9 } },
    ])
    const close = lay(s, { 'm.0': { x: 0, z: 0 }, 'm.1': { x: 1.4, z: 0 } })
    expect(modelsEngaged(close, b, 'm.0', 'm.1')).toBe(false)
  })

  it('ENG-001 Size 2+ terrain between two models stops Engagement; Size 1 does not', () => {
    const er = baseRadius(32)
    const midX = -5 + er + 0.4
    expect(modelsEngaged(pair(0.8, [solid('w2', midX, 0, 0.3, 4, 2)]), b, 'm.0', 'z.0')).toBe(false)
    expect(modelsEngaged(pair(0.8, [solid('w1', midX, 0, 0.3, 4, 1)]), b, 'm.0', 'z.0')).toBe(true)
  })

  it('ENG-004 Grass is Size 2 and blocks Engagement until it is removed', () => {
    const er = baseRadius(32)
    const grass = ter('g', 'rough', -5 + er + 0.4, 0, 0.3, 4, 0.2, { grass: true })
    expect(modelsEngaged(pair(0.8, [grass]), b, 'm.0', 'z.0')).toBe(false)
    expect(modelsEngaged(pair(0.8), b, 'm.0', 'z.0')).toBe(true)
  })

  it('FLY-002 a Flying model is never Engaged', () => {
    const s = pair(0.5, [], 'point-defense-drone')
    expect(modelsEngaged(s, b, 'm.0', 'z.0')).toBe(false)
    expect(isEngaged(s, b, 'm')).toBe(false)
  })

  it('ENG-001 HIGH GROUND and GROUND LEVEL models are not Engaged; two models on the same top are', () => {
    // a Size 3 platform you can stand on, with the ground marine hugging its edge
    const platform = solid('p', 0, 0, 6, 6, 3, { walkable: true, accessPoints: [{ x: 3, z: 0 }] })
    const s = arena([
      { id: 'm', owner: 'A', profileId: 'marine', models: 1, at: { x: 0, z: 9 } },
      { id: 'z', owner: 'B', profileId: 'zergling', models: 2, at: { x: 0, z: 9 } },
    ], [platform])
    const edge = lay(s, { 'm.0': { x: 2.7, z: 0 }, 'z.0': { x: 3.9, z: 0 }, 'z.1': { x: 1.9, z: 0 } })
    expect(modelsEngaged(edge, b, 'm.0', 'z.0')).toBe(false) // m on top (HIGH), z.0 on the ground
    expect(modelsEngaged(edge, b, 'm.0', 'z.1')).toBe(true) // both on the platform top
  })

  it('ENG-001 a MID GROUND ramp engages the ground only beside its ACCESS POINT', () => {
    const ramp = ter('r', 'obstacle', 0, 0, 6, 3, 1, { size: 1, ramp: true, accessPoints: [{ x: 3, z: 0 }, { x: -3, z: 0 }] })
    const s = arena([
      { id: 'm', owner: 'A', profileId: 'marine', models: 1, at: { x: 0, z: 9 } },
      { id: 'z', owner: 'B', profileId: 'zergling', models: 2, at: { x: 0, z: 9 } },
    ], [ramp])
    // marine on the ramp near the east access point, one zergling on the ground just off that end, one off the long side
    const at = lay(s, { 'm.0': { x: 2.5, z: 0 }, 'z.0': { x: 4.2, z: 0.3 }, 'z.1': { x: 1.0, z: 2.6 } })
    expect(modelsEngaged(at, b, 'm.0', 'z.0')).toBe(true)
    expect(modelsEngaged(at, b, 'm.0', 'z.1')).toBe(false)
  })

  it('ENG-002 one Engaged model pair makes both whole units Engaged', () => {
    const s = arena([
      { id: 'm', owner: 'A', profileId: 'marine', models: 3, at: { x: 0, z: 0 } },
      { id: 'z', owner: 'B', profileId: 'zergling', models: 3, at: { x: 0, z: 9 } },
    ])
    const er = baseRadius(32)
    const touch = lay(s, {
      'm.0': { x: -6, z: 0 }, 'm.1': { x: -6, z: 4 }, 'm.2': { x: -6, z: 6 },
      'z.0': { x: -6 + 2 * er, z: 0 }, 'z.1': { x: 8, z: 8 }, 'z.2': { x: 9, z: 8 },
    })
    expect(engagedPairs(touch, b)).toEqual([['m', 'z']])
    expect(engagedWith(touch, b, 'm')).toEqual(['z'])
    expect(engagedWith(touch, b, 'z')).toEqual(['m'])
    expect(engagedModels(touch, b, 'm')).toEqual(['m.0'])
    expect(isEngaged(touch, b, 'z')).toBe(true)
    expect(isEngaged(s, b, 'm')).toBe(false)
  })
})
