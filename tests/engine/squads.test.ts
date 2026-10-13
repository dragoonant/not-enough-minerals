import { describe, expect, it } from 'vitest'
import { unitWhollyWithin } from '../../src/engine/measure'
import {
  coherencyDistance, coherencyState, leadingModel, liveModelCount, placeFormation, unitModels, unitOf,
} from '../../src/engine/squads'
import type { GameState, TerrainInstance, Vec2 } from '../../src/engine/types'
import { baseRadius, dist } from '../../src/engine/geometry'
import { bundle, duelState, squad, ter, type SquadSpec } from './helpers'

const b = bundle()

/** An open table holding exactly these squads (and terrain). */
function arena(specs: SquadSpec[], terrain: TerrainInstance[] = []): GameState {
  const s0 = duelState(b)
  const sq = specs.map((x) => squad(b, x))
  return {
    ...s0, terrain,
    models: Object.fromEntries(sq.flatMap((x) => x.models).map((m) => [m.id, m])),
    units: Object.fromEntries(sq.map((x) => [x.unit.id, x.unit])),
  }
}
const wall = (id: string, x: number, z: number, w: number, d: number, size: number, extra: Record<string, unknown> = {}): TerrainInstance =>
  ter(id, 'obstruction', x, z, w, d, size, { size, ...extra })
const place = (s: GameState, id: string, pos: Vec2): GameState => ({ ...s, models: { ...s.models, [id]: { ...s.models[id]!, pos } } })
/** Put several models exactly where the test wants them. */
const lay = (s: GameState, at: Record<string, Vec2>): GameState => Object.entries(at).reduce((acc, [id, p]) => place(acc, id, p), s)

describe('squads and coherency', () => {
  it('DMG-010 unitModels is the one lookup: muster order, live models only unless asked', () => {
    let s = arena([{ id: 'u', owner: 'A', profileId: 'marine', models: 4, at: { x: 0, z: 0 } }])
    expect(unitModels(s, 'u').map((m) => m.id)).toEqual(['u.0', 'u.1', 'u.2', 'u.3'])
    s = { ...s, models: { ...s.models, 'u.1': { ...s.models['u.1']!, life: 'dead' } } }
    expect(unitModels(s, 'u').map((m) => m.id)).toEqual(['u.0', 'u.2', 'u.3'])
    expect(unitModels(s, 'u', { includeDead: true })).toHaveLength(4)
    expect(liveModelCount(s, 'u')).toBe(3)
    expect(unitOf(s, 'u.2')?.id).toBe('u')
  })

  it('COH-002 In Coherency needs every model Wholly Within 3" of the Leading Model', () => {
    const s = arena([{ id: 'u', owner: 'A', profileId: 'marine', models: 3, at: { x: 0, z: 0 } }])
    expect(coherencyDistance(s, b, 'u')).toBe(3)
    const row = lay(s, { 'u.0': { x: 0, z: 0 }, 'u.1': { x: 0, z: 2 }, 'u.2': { x: 2, z: 0 } })
    expect(coherencyState(row, b, 'u').inCoherency).toBe(true)
    const far = place(row, 'u.2', { x: 3.4, z: 0 })
    const r = coherencyState(far, b, 'u')
    expect(r.inCoherency).toBe(false)
    expect(r.outOfCoherency).toEqual(['u.2'])
    // exactly 3" centre to centre for equal bases is still Wholly Within
    expect(coherencyState(place(row, 'u.2', { x: 3, z: 0 }), b, 'u').inCoherency).toBe(true)
  })

  it('COH-002 Squadron widens coherency to 4"', () => {
    const s = arena([{ id: 'u', owner: 'B', profileId: 'raptor', models: 2, at: { x: 0, z: 0 } }])
    expect(coherencyDistance(s, b, 'u')).toBe(4)
    const at = (x: number) => lay(s, { 'u.0': { x: 0, z: 0 }, 'u.1': { x, z: 0 } })
    expect(coherencyState(at(3.8), b, 'u').inCoherency).toBe(true)
    expect(coherencyState(at(4.3), b, 'u').inCoherency).toBe(false)
  })

  it('COH-005 a link cannot cross a Size 2 wall, and may cross another unit only when it is an enemy Engaged with', () => {
    const base = arena([
      { id: 'u', owner: 'A', profileId: 'marine', models: 2, at: { x: 0, z: 0 } },
      { id: 'e', owner: 'B', profileId: 'zergling', models: 1, at: { x: 8, z: 8 } },
    ])
    const two = lay(base, { 'u.0': { x: 0, z: 0 }, 'u.1': { x: 2.8, z: 0 } })
    expect(coherencyState(two, b, 'u').inCoherency).toBe(true)
    const walled = { ...two, terrain: [wall('w', 1.4, 0, 0.3, 4, 2)] }
    expect(coherencyState(walled, b, 'u').inCoherency).toBe(false)
    // a friendly unit of another squad standing on the line blocks the link
    const blocked = place(two, 'e.0', { x: 1.4, z: 0 })
    const friendlyBlocker = { ...blocked, models: { ...blocked.models, 'e.0': { ...blocked.models['e.0']!, owner: 'A' } } }
    expect(coherencyState(friendlyBlocker, b, 'u').inCoherency).toBe(false)
    // an enemy right beside the models (Engagement Range) does not break the link
    expect(coherencyState(blocked, b, 'u').inCoherency).toBe(true)
  })

  it('COH-005 Flying links ignore terrain', () => {
    const s = arena([{ id: 'f', owner: 'A', profileId: 'point-defense-drone', models: 2, at: { x: 0, z: 0 } }], [wall('w', 1.4, 0, 0.3, 4, 3)])
    expect(coherencyState(lay(s, { 'f.0': { x: 0, z: 0 }, 'f.1': { x: 2.8, z: 0 } }), b, 'f').inCoherency).toBe(true)
  })

  it('COH-003 placeFormation sets a deployed squad compact, linked and legal around the Leading Model', () => {
    const s = arena([{ id: 'u', owner: 'A', profileId: 'marine', models: 9, at: { x: 0, z: 0 } }])
    const lead = leadingModel(s, 'u')!
    const r = placeFormation(s, b, 'u', { leaderId: lead.id, leaderPos: { x: 5, z: 5 } })!
    expect(r.casualties).toEqual([])
    expect(r.inCoherency).toBe(true)
    const ids = Object.keys(r.placement)
    expect(ids).toHaveLength(9)
    for (const id of ids) {
      expect(dist(r.placement[id]!, r.placement[lead.id]!) + baseRadius(32) - baseRadius(32)).toBeLessThanOrEqual(3 + 1e-6)
      for (const other of ids) if (other !== id) expect(dist(r.placement[id]!, r.placement[other]!)).toBeGreaterThanOrEqual(2 * baseRadius(32) - 1e-6)
    }
  })

  it('COH-003 a model fixed beyond 3" but still linked leaves the unit Out of Coherency', () => {
    const s = arena([{ id: 'u', owner: 'A', profileId: 'marine', models: 3, at: { x: 0, z: 0 } }])
    const r = placeFormation(s, b, 'u', { leaderId: 'u.0', leaderPos: { x: 0, z: 0 }, fixed: { 'u.2': { x: 5, z: 0 } } })!
    expect(r.casualties).toEqual([])
    expect(r.inCoherency).toBe(false)
  })

  it('COH-004 a model with no legal linked spot is a casualty', () => {
    // the Leading Model stands in a walled pocket just wide enough for itself: nobody else can be linked to it
    const pocket = [
      wall('n', 0, -1.2, 3, 0.4, 2), wall('s', 0, 1.2, 3, 0.4, 2), wall('e', 1.2, 0, 0.4, 3, 2), wall('w', -1.2, 0, 0.4, 3, 2),
    ]
    const s = arena([{ id: 'u', owner: 'A', profileId: 'marine', models: 4, at: { x: 10, z: 10 } }], pocket)
    const r = placeFormation(s, b, 'u', { leaderId: 'u.0', leaderPos: { x: 0, z: 0 } })!
    expect(r.casualties.sort()).toEqual(['u.1', 'u.2', 'u.3'])
  })

  it('MEAS-011 a unit is Wholly Within a range only if every model is', () => {
    const s = arena([{ id: 'u', owner: 'A', profileId: 'marine', models: 3, at: { x: 0, z: 0 } }])
    const tight = lay(s, { 'u.0': { x: 0, z: 0 }, 'u.1': { x: 1.5, z: 0 }, 'u.2': { x: 0, z: 1.5 } })
    expect(unitWhollyWithin(tight, 'u', tight.models['u.0']!, 4)).toBe(true)
    expect(unitWhollyWithin(place(tight, 'u.2', { x: 9, z: 0 }), 'u', tight.models['u.0']!, 4)).toBe(false)
  })
})
