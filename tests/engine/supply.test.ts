import { describe, expect, it } from 'vitest'
import { engagedWith } from '../../src/engine/engage'
import { available, canArrive, hasTacticalMass, onTableSupply, poolFor, recordSupplyLoss, supplyFor } from '../../src/engine/supply'
import type { Effect, GameState, Vec2 } from '../../src/engine/types'
import { bundle, duelState, squad, type SquadSpec } from './helpers'

const b = bundle()
function arena(specs: SquadSpec[], over: Partial<GameState> = {}): GameState {
  const s0 = duelState(b)
  const sq = specs.map((x) => squad(b, x))
  return {
    ...s0, ...over,
    models: Object.fromEntries(sq.flatMap((x) => x.models).map((m) => [m.id, m])),
    units: Object.fromEntries(sq.map((x) => [x.unit.id, x.unit])),
  }
}
const kill = (s: GameState, ids: string[]): GameState => ({
  ...s, models: Object.fromEntries(Object.entries(s.models).map(([id, m]) => [id, ids.includes(id) ? { ...m, life: 'dead' as const } : m])),
})
const status = (name: string): Effect => ({ id: `${name}#1`, source: name, kind: 'status', status: name, expires: 'permanent', bySeat: 'A', round: 1 })
const withEffects = (s: GameState, unit: string, effects: Effect[]): GameState => ({ ...s, units: { ...s.units, [unit]: { ...s.units[unit]!, effects } } })

describe('supply', () => {
  it('SUP-003 Current Supply Value follows the live model count through the brackets', () => {
    const s = arena([{ id: 'm', owner: 'A', profileId: 'marine', models: 9, at: { x: 0, z: 0 } }])
    expect(supplyFor(s, b, 'm', 'pool')).toBe(2)
    expect(supplyFor(kill(s, ['m.0', 'm.1', 'm.2']), b, 'm', 'pool')).toBe(1) // 6 models
    expect(supplyFor(kill(s, ['m.0', 'm.1', 'm.2', 'm.3', 'm.4', 'm.5']), b, 'm', 'pool')).toBe(0) // 3 models
  })

  it('SUP-011 the Pool is S + (r-1)*E and unlimited in the final Round', () => {
    const s = arena([])
    expect([1, 2, 3, 4].map((r) => poolFor(s, b, r))).toEqual([3, 4, 5, 6])
    expect(poolFor(s, b, 5)).toBe(Infinity)
    const std = arena([], { missionId: 'hold-position-standard' })
    expect([1, 2, 3, 4, 5].map((r) => poolFor(std, b, r))).toEqual([6, 8, 10, 12, Infinity])
    expect(poolFor({ ...s, round: 3 }, b)).toBe(5)
  })

  it('SUP-020 Available is the Pool minus the Supply on the table; Reserves add nothing', () => {
    const s = arena([
      { id: 'm', owner: 'A', profileId: 'marine', models: 9, at: { x: 0, z: 0 } },
      { id: 'r', owner: 'A', profileId: 'marine', models: 9, at: { x: 0, z: 9 }, location: 'reserves' },
      { id: 'z', owner: 'B', profileId: 'zergling', models: 8, at: { x: 0, z: -9 } },
    ])
    expect(onTableSupply(s, b, 'A')).toBe(2)
    expect(available(s, b, 'A')).toBe(1)
    expect(available(s, b, 'B')).toBe(2)
  })

  it('SUP-021 an arrival needs its CSV within Available, and a CSV 0 unit always fits', () => {
    const s = arena([
      { id: 'm', owner: 'A', profileId: 'marine', models: 9, at: { x: 0, z: 0 } },
      { id: 'big', owner: 'A', profileId: 'marine', models: 9, at: { x: 0, z: 9 }, location: 'reserves' },
      { id: 'mid', owner: 'A', profileId: 'marine', models: 6, at: { x: 0, z: 9 }, location: 'reserves' },
      { id: 'tiny', owner: 'A', profileId: 'marine', models: 3, at: { x: 0, z: 9 }, location: 'reserves' },
    ])
    expect(canArrive(s, b, 'A', 'big')).toBe(false) // 2 > 1
    expect(canArrive(s, b, 'A', 'mid')).toBe(true) // 1 <= 1
    expect(canArrive(s, b, 'A', 'tiny')).toBe(true)
    expect(canArrive(s, b, 'B', 'mid')).toBe(false) // not its owner
    const full = { ...s, units: { ...s.units, mid: { ...s.units.mid!, location: 'table' as const } } }
    expect(canArrive(full, b, 'A', 'tiny')).toBe(true) // CSV 0 fits even with nothing Available
  })

  it('SUP-024 in the final Round the gate always passes', () => {
    const s = arena([
      { id: 'm', owner: 'A', profileId: 'marine', models: 9, at: { x: 0, z: 0 } },
      { id: 'big', owner: 'A', profileId: 'marine', models: 9, at: { x: 0, z: 9 }, location: 'reserves' },
    ], { round: 5 })
    expect(available(s, b, 'A')).toBe(Infinity)
    expect(canArrive(s, b, 'A', 'big')).toBe(true)
  })

  it('SUP-022 a unit sent to Reserves frees its Supply at once', () => {
    const s = arena([{ id: 'm', owner: 'A', profileId: 'marine', models: 9, at: { x: 0, z: 0 } }])
    const back = { ...s, units: { ...s.units, m: { ...s.units.m!, location: 'reserves' as const } } }
    expect(available(s, b, 'A')).toBe(1)
    expect(available(back, b, 'A')).toBe(3)
  })

  it('SUP-005 BURROWED counts 0 for the Disengage comparison only', () => {
    const s = withEffects(arena([{ id: 'r', owner: 'B', profileId: 'zergling', models: 8, at: { x: 0, z: 0 } }]), 'r', [status('BURROWED')])
    expect(supplyFor(s, b, 'r', 'disengage')).toBe(0)
    expect(supplyFor(s, b, 'r', 'pool')).toBe(1)
    expect(supplyFor(s, b, 'r', 'control')).toBe(1)
  })

  it('SUP-006 STRUCTURE counts 0 for everything', () => {
    const s = arena([{ id: 'p', owner: 'A', profileId: 'pylon', models: 1, at: { x: 0, z: 0 } }])
    for (const p of ['pool', 'control', 'disengage', 'vp'] as const) expect(supplyFor(s, b, 'p', p)).toBe(0)
  })

  it('SUP-007 Advanced Medic Facilities: 0 against the Pool only, the real value for control and VP', () => {
    const plain = arena([{ id: 'd', owner: 'A', profileId: 'medic', models: 2, at: { x: 0, z: 0 } }])
    const adv = arena([{ id: 'd', owner: 'A', profileId: 'medic', models: 2, at: { x: 0, z: 0 }, upgrades: [{ id: 'advanced-medic-facilities' }] }])
    expect(supplyFor(plain, b, 'd', 'pool')).toBe(1)
    expect(supplyFor(adv, b, 'd', 'pool')).toBe(0)
    expect(supplyFor(adv, b, 'd', 'control')).toBe(1)
    expect(supplyFor(adv, b, 'd', 'vp')).toBe(1)
    expect(supplyFor(adv, b, 'd', 'disengage')).toBe(1)
  })

  it('SUP-052 Commander adds 1 for markers and Disengage, not for the Pool or VP', () => {
    const s = arena([{ id: 'j', owner: 'A', profileId: 'jim-raynor', models: 1, at: { x: 0, z: 0 } }])
    expect(supplyFor(s, b, 'j', 'pool')).toBe(1)
    expect(supplyFor(s, b, 'j', 'control')).toBe(2)
    expect(supplyFor(s, b, 'j', 'disengage')).toBe(2)
    expect(supplyFor(s, b, 'j', 'vp')).toBe(1)
  })

  it('SUP-041 Tactical Mass needs a strictly greater Disengage Supply than the Engaged enemies together', () => {
    const touch = (mar: number, zer: number): GameState => {
      const s = arena([
        { id: 'm', owner: 'A', profileId: 'marine', models: mar, at: { x: 0, z: 0 } },
        { id: 'z', owner: 'B', profileId: 'zergling', models: zer, at: { x: 0, z: 9 } },
      ])
      const pos: Record<string, Vec2> = { 'm.0': { x: 0, z: 0 }, 'z.0': { x: 1.4, z: 0 } }
      return { ...s, models: Object.fromEntries(Object.entries(s.models).map(([id, m]) => [id, pos[id] ? { ...m, pos: pos[id]! } : { ...m, pos: { x: 12 + m.pos.x / 10, z: m.pos.z } }])) }
    }
    const win = touch(9, 6) // 2 against 0
    expect(engagedWith(win, b, 'm')).toEqual(['z'])
    expect(hasTacticalMass(win, b, 'm')).toBe(true)
    expect(hasTacticalMass(touch(6, 8), b, 'm')).toBe(false) // 1 against 1: equal is not enough
    expect(hasTacticalMass(touch(3, 4), b, 'm')).toBe(false) // 0 against 0
  })

  it('VP-001 a bracket drop is written to the owner’s supply-lost ledger; summoned units count like any drop (F p.5)', () => {
    const s = arena([
      { id: 'm', owner: 'A', profileId: 'marine', models: 9, at: { x: 0, z: 0 } },
      { id: 'w', owner: 'A', profileId: 'pylon', models: 1, at: { x: 0, z: 9 } },
    ])
    const hurt = kill(s, ['m.0', 'm.1', 'm.2'])
    expect(recordSupplyLoss(hurt, b, 'm', 2).seats.A!.supplyLostThisRound).toBe(1)
    expect(recordSupplyLoss(hurt, b, 'm', 1).seats.A!.supplyLostThisRound).toBe(0)
    const summoned = { ...hurt, units: { ...hurt.units, w: { ...hurt.units.w!, summoned: true } } }
    expect(recordSupplyLoss(summoned, b, 'w', 3).seats.A!.supplyLostThisRound).toBe(3)
  })
})
