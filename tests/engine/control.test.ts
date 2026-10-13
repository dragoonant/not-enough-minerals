// Marker contest and control by Supply (CTL-001..008, MM-003). Supply is mocked with the real bracket table so the tests
// do not depend on the supply module's unfinished arrival code.
import { describe, expect, it, vi } from 'vitest'
import type { EditionBundle } from '../../src/data/types'
import { canContest, contest, updateControl } from '../../src/engine/control'
import { initialMarkers } from '../../src/engine/missions'
import type { GameState, MarkerState, SeatId, TerrainInstance } from '../../src/engine/types'
import { bundle, duelState, squad, ter } from './helpers'

vi.mock('../../src/engine/supply', async () => {
  const ed = await import('../../src/engine/edition')
  return {
    supplyFor: (state: GameState, b: EditionBundle, unitId: string) => {
      const u = state.units[unitId]!
      return ed.bracketSupply(ed.requireUnitDef(b, u.profileId), u.modelIds.filter((id) => state.models[id]!.life !== 'dead').length)
    },
    canArrive: () => true, poolFor: () => 99, available: () => 99, onTableSupply: () => 0, recordSupplyLoss: (s: GameState) => s,
  }
})

const b = bundle()
const marker = (n: number, x: number, z: number, o: Partial<MarkerState> = {}): MarkerState => ({
  n, pos: { x, z }, elev: 0, side: n === 5 ? 'neutral' : n % 2 ? 'red' : 'blue', active: true, onTable: true,
  controller: null, controlledSinceRound: null, claimedBy: null, activatedRound: null, ...o,
})

/** Seat A's marines stand south of marker 1 (at the origin), seat B's north of it; counts pick their Current Supply. */
function field(a: number, bb: number, markers: MarkerState[] = [marker(1, 0, 0)], terrain: TerrainInstance[] = [], mod?: (s: GameState) => GameState): GameState {
  const s0 = duelState(b)
  const units: GameState['units'] = {}, models: GameState['models'] = {}
  for (const [id, owner, n, z] of [['A-m', 'A', a, 2.5], ['B-m', 'B', bb, -2.5]] as [string, SeatId, number, number][]) {
    if (n === 0) continue
    const sq = squad(b, { id, owner, profileId: 'marine', models: n, at: { x: 0, z } })
    units[id] = sq.unit
    for (const m of sq.models) models[m.id] = m
  }
  const s: GameState = { ...s0, units, models, markers, terrain, round: 2, roundPhase: 'scoring' }
  return mod ? mod(s) : s
}

describe('control (marker contest by Supply)', () => {
  it('CTL-003 the strictly higher Supply total takes the marker', () => {
    const r = contest(field(9, 6), b, 1)
    expect(r.totals).toEqual({ A: 2, B: 1 })
    expect(r.controller).toBe('A')
    expect(updateControl(field(9, 6), b).markers[0]!.controller).toBe('A')
  })

  it('CTL-004 equal totals leave control as it was (a tie never makes a marker neutral)', () => {
    expect(contest(field(6, 6), b, 1).controller).toBeNull()
    expect(contest(field(6, 6, [marker(1, 0, 0, { controller: 'B' })]), b, 1).controller).toBe('B')
  })

  it('CTL-005 a Supply 0 unit takes an uncontested marker but never wins a contest', () => {
    expect(contest(field(3, 0), b, 1).controller).toBe('A')
    expect(contest(field(3, 6), b, 1).controller).toBe('B')
  })

  it('CTL-006 control is sticky: it stays with no units near and changes only to a strictly higher total', () => {
    let s = updateControl(field(6, 0), b)
    expect(s.markers[0]!.controller).toBe('A')
    s = { ...s, units: { 'A-m': { ...s.units['A-m']!, location: 'reserves' } } }
    expect(updateControl(s, b).markers[0]!.controller).toBe('A')
    const withB = field(0, 9, s.markers)
    const t = updateControl(withB, b)
    expect(t.markers[0]!.controller).toBe('B')
    expect(t.events.some((e) => e.type === 'markerControl' && e['from'] === 'A' && e['to'] === 'B')).toBe(true)
  })

  it('CTL-002 flying, BURROWED and out-of-coherency units never contest (MM-003)', () => {
    const s = field(6, 0)
    expect(canContest(s, b, 'A-m', 1)).toBe(true)
    expect(canContest({ ...s, units: { 'A-m': { ...s.units['A-m']!, inCoherency: false } } }, b, 'A-m', 1)).toBe(false)
    const burrowed = { ...s.units['A-m']!, effects: [{ id: 'e', source: 'x', kind: 'status' as const, status: 'BURROWED', expires: 'permanent' as const, bySeat: 'A', round: 1 }] }
    expect(canContest({ ...s, units: { 'A-m': burrowed } }, b, 'A-m', 1)).toBe(false)
    const flyer: EditionBundle = { ...b, records: { ...b.records, units: b.records.units.map((u) => (u.id === 'marine' ? { ...u, combatTags: [...u.combatTags, 'flying' as const] } : u)) } }
    expect(canContest(s, flyer, 'A-m', 1)).toBe(false)
  })

  it('CTL-001 contest needs a model Within 3 in of the marker, on its elevation, with line of sight', () => {
    expect(canContest(field(6, 0), b, 'A-m', 1)).toBe(true)
    const far = field(6, 0, [marker(1, 0, -3)]) // base edge to marker edge is more than 3 in
    expect(canContest(far, b, 'A-m', 1)).toBe(false)
    const high = field(6, 0, [marker(1, 0, 0, { elev: 3 })])
    expect(canContest(high, b, 'A-m', 1)).toBe(false)
    const wall = ter('wall', 'obstruction', 0, 1.2, 12, 0.4, 5)
    expect(canContest(field(6, 0, [marker(1, 0, 0)], [wall]), b, 'A-m', 1)).toBe(false)
  })

  it('CTL-007 CTL-008 deactivated markers can be controlled; a marker off the table is skipped', () => {
    expect(updateControl(field(6, 0, [marker(1, 0, 0, { active: false })]), b).markers[0]!.controller).toBe('A')
    const gone = updateControl(field(6, 0, [marker(1, 0, 0, { onTable: false })]), b)
    expect(gone.markers[0]!.controller).toBeNull()
    expect(contest(field(6, 0, [marker(1, 0, 0, { onTable: false })]), b, 1).controller).toBeNull()
  })

  it('CTL-009 marker colour grants no starting control', () => {
    const dep = b.records.deployments.find((d) => d.id === 'abandoned-camp')!
    const ms = initialMarkers(b, b.records.missions.find((m) => m.id === 'hold-position-skirmish')!, dep)
    expect(ms.every((m) => m.controller === null && m.controlledSinceRound === null)).toBe(true)
  })
})
