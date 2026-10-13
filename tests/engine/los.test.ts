import { describe, expect, it } from 'vitest'
import { highGroundCover, losBetween, losToMarker } from '../../src/engine/los'
import type { Effect, GameState, TerrainInstance, Vec2 } from '../../src/engine/types'
import { bundle, duelState, squad, ter } from './helpers'

const b = bundle()
interface Who { profile: string; at: Vec2; id?: string; owner?: string }
/** Two single-model squads at exact positions on an open table with this terrain. */
function pair(a: Who, c: Who, terrain: TerrainInstance[] = []): GameState {
  const s0 = duelState(b)
  const sa = squad(b, { id: a.id ?? 'a', owner: a.owner ?? 'A', profileId: a.profile, models: 1, at: a.at })
  const sc = squad(b, { id: c.id ?? 'c', owner: c.owner ?? 'B', profileId: c.profile, models: 1, at: c.at })
  const put = (x: typeof sa, p: Vec2) => ({ ...x, models: x.models.map((m) => ({ ...m, pos: p })) })
  const A = put(sa, a.at), C = put(sc, c.at)
  return {
    ...s0, terrain,
    models: Object.fromEntries([...A.models, ...C.models].map((m) => [m.id, m])),
    units: { [A.unit.id]: A.unit, [C.unit.id]: C.unit },
  }
}
const piece = (id: string, x: number, z: number, w: number, d: number, size: number, extra: Record<string, unknown> = {}): TerrainInstance =>
  ter(id, 'obstruction', x, z, w, d, size, { size, ...extra })
const vis = (s: GameState, from = 'a.0', to = 'c.0') => losBetween(s, b, from, to).visible

describe('line of sight and cover', () => {
  it('LOS-001 clear in the open; no Blocking Terrain crossed means Visible', () => {
    const r = losBetween(pair({ profile: 'marine', at: { x: -8, z: 0 } }, { profile: 'zergling', at: { x: 8, z: 0 } }), b, 'a.0', 'c.0')
    expect(r.visible).toBe(true)
    expect(r.reasons).toEqual(['clear'])
    expect(r.distance).toBeCloseTo(16 - 2 * 0.63, 1)
  })

  it('COV-010 Full Cover: a piece whose Effective Size is at least both models blocks, from anywhere', () => {
    const wall = piece('w', 0, 0, 0.4, 8, 2)
    // marine (2) and marine (2) behind a Size 2 wall, far from it
    const s = pair({ profile: 'marine', at: { x: -8, z: 0 } }, { profile: 'marine', at: { x: 8, z: 0 } }, [wall])
    expect(vis(s)).toBe(false)
    expect(losBetween(s, b, 'a.0', 'c.0').terrainBlockers).toEqual(['w'])
    // a Size 1 wall is lower than a Size 2 model, so with nobody Within 1" of it nothing blocks
    expect(vis(pair({ profile: 'marine', at: { x: -8, z: 0 } }, { profile: 'zergling', at: { x: 8, z: 0 } }, [piece('w1', 0, 0, 0.4, 8, 1)]))).toBe(true)
  })

  it('LOS-002 a trace around the end of a piece is a clear trace', () => {
    const short = piece('w', 0, 0, 0.4, 2, 2)
    expect(vis(pair({ profile: 'marine', at: { x: -8, z: 0 } }, { profile: 'marine', at: { x: 8, z: 4 } }, [short]))).toBe(true)
  })

  it('LOS-003 Line of Sight is mutual', () => {
    const s = pair({ profile: 'marine', at: { x: -8, z: 0 } }, { profile: 'marine', at: { x: 8, z: 0 } }, [piece('w', 0, 0, 0.4, 8, 2)])
    expect(losBetween(s, b, 'a.0', 'c.0').visible).toBe(losBetween(s, b, 'c.0', 'a.0').visible)
    const open = pair({ profile: 'marine', at: { x: -8, z: 0 } }, { profile: 'zergling', at: { x: 8, z: 3 } })
    expect(losBetween(open, b, 'a.0', 'c.0').visible).toBe(losBetween(open, b, 'c.0', 'a.0').visible)
  })

  it('COV-020 Direct Cover: a model Within 1" of a piece at least as big as it is blocks the trace, even a low wall', () => {
    // zergling (Size 1) hugging a Size 1 wall, marine well away on the other side
    const wall = piece('w', 0, 0, 0.4, 8, 1)
    const hugging = pair({ profile: 'marine', at: { x: -8, z: 0 } }, { profile: 'zergling', at: { x: 1.2, z: 0 } }, [wall])
    expect(vis(hugging)).toBe(false)
    // the same zergling 3" from the wall has no Direct Cover
    expect(vis(pair({ profile: 'marine', at: { x: -8, z: 0 } }, { profile: 'zergling', at: { x: 3.5, z: 0 } }, [wall]))).toBe(true)
  })

  it('COV-001 pieces never add their sizes together', () => {
    const two = [piece('w1', -1, 0, 0.4, 8, 1), piece('w2', 1, 0, 0.4, 8, 1)]
    expect(vis(pair({ profile: 'marine', at: { x: -8, z: 0 } }, { profile: 'marine', at: { x: 8, z: 0 } }, two))).toBe(true)
  })

  it('COV-040 Close Quarters: both Within 1" of the same piece and Within 3" of each other ignore its Direct Cover', () => {
    const wall = piece('w', 0, 0, 0.4, 8, 2)
    // marine hugging the wall, a Size 3 stalker far on the other side: the wall is Direct Cover for the marine
    const far = pair({ profile: 'marine', at: { x: -1.5, z: 0 } }, { profile: 'stalker', at: { x: 9, z: 0 } }, [wall])
    expect(vis(far)).toBe(false)
    // the stalker also hugs the wall and the two are Within 3": Direct Cover is ignored, Full Cover (needs Size 3) does not apply
    const close = pair({ profile: 'marine', at: { x: -1.63, z: 0 } }, { profile: 'stalker', at: { x: 2.5, z: 0 } }, [wall])
    expect(vis(close)).toBe(true)
  })

  it('COV-030 Elevation Dead Zone: HIGH GROUND cannot see the foot of its own building, but sees farther out', () => {
    const tower = piece('t', 0, 0, 10, 10, 3, { walkable: true, accessPoints: [{ x: 5, z: 0 }] })
    const foot = pair({ profile: 'marine', at: { x: 0, z: 0 } }, { profile: 'zergling', at: { x: 6, z: 0 } }, [tower])
    expect(vis(foot)).toBe(false)
    expect(losBetween(foot, b, 'a.0', 'c.0').cover).toBe('deadZone')
    expect(vis(foot, 'c.0', 'a.0')).toBe(false)
    const out = pair({ profile: 'marine', at: { x: 0, z: 0 } }, { profile: 'zergling', at: { x: 9, z: 0 } }, [tower])
    expect(vis(out)).toBe(true)
  })

  it('LOS-005 the surface a model stands on never blocks its own traces', () => {
    const tower = piece('t', 0, 0, 10, 10, 3, { walkable: true, accessPoints: [{ x: 5, z: 0 }] })
    const s = pair({ profile: 'marine', at: { x: 3, z: 0 } }, { profile: 'zergling', at: { x: 11, z: 0 } }, [tower])
    expect(vis(s)).toBe(true)
  })

  it('SIZE-002 Effective Size adds the Size of what the model stands on', () => {
    const wall = piece('w', 0, 0, 0.4, 8, 2)
    const plate = piece('plate', -8, 0, 3, 3, 1, { walkable: true })
    // marine on a Size 1 plate has ES 3: a Size 2 wall is no Full Cover against the lower zergling
    expect(vis(pair({ profile: 'marine', at: { x: -8, z: 0 } }, { profile: 'zergling', at: { x: 8, z: 0 } }, [wall, plate]))).toBe(true)
    expect(vis(pair({ profile: 'marine', at: { x: -8, z: 0 } }, { profile: 'zergling', at: { x: 8, z: 0 } }, [wall]))).toBe(false)
  })

  it('SIZE-001 BURROWED counts as Size 0', () => {
    const wall = piece('w', 0, 0, 0.4, 8, 1)
    const open = pair({ profile: 'marine', at: { x: -8, z: 0 } }, { profile: 'zergling', at: { x: 8, z: 0 } }, [wall])
    expect(vis(open)).toBe(true) // wall (1) is lower than the marine (2)
    const status: Effect = { id: 'b#1', source: 'burrow', kind: 'status', status: 'BURROWED', expires: 'permanent', bySeat: 'A', round: 1 }
    const burrowed = { ...open, units: { ...open.units, a: { ...open.units.a!, effects: [status] } } }
    expect(vis(burrowed)).toBe(false) // a Size 0 marine is lower than the wall: Full Cover
  })

  it('COV-050 a Flying model never gets Full Cover; the Direct Cover of the ground model still applies', () => {
    const wall = piece('w', 0, 0, 0.4, 8, 3)
    expect(vis(pair({ profile: 'marine', at: { x: -8, z: 0 } }, { profile: 'zergling', at: { x: 8, z: 0 } }, [wall]))).toBe(false)
    expect(vis(pair({ profile: 'marine', at: { x: -8, z: 0 } }, { profile: 'point-defense-drone', at: { x: 8, z: 0 } }, [wall]))).toBe(true)
    // the marine hugging the wall: its Direct Cover still blocks the Flying model
    expect(vis(pair({ profile: 'marine', at: { x: -1.2, z: 0 } }, { profile: 'point-defense-drone', at: { x: 8, z: 0 } }, [wall]))).toBe(false)
  })

  it('LOS-008 models never block Line of Sight', () => {
    const s = pair({ profile: 'marine', at: { x: -8, z: 0 } }, { profile: 'zergling', at: { x: 8, z: 0 } })
    const tank = squad(b, { id: 'tank', owner: 'A', profileId: 'siege-tank', models: 1, at: { x: 0, z: 0 } })
    const withTank = { ...s, models: { ...s.models, ...Object.fromEntries(tank.models.map((m) => [m.id, { ...m, pos: { x: 0, z: 0 } }])) },
      units: { ...s.units, tank: tank.unit } }
    expect(vis(withTank)).toBe(true)
  })

  it('LOS-007 a Mission Marker counts as Size 0 for Line of Sight', () => {
    const s = pair({ profile: 'marine', at: { x: -8, z: 0 } }, { profile: 'zergling', at: { x: 9, z: 9 } }, [piece('w', 0, 0, 0.4, 8, 2)])
    const withMarker = { ...s, markers: [{ n: 1, pos: { x: 8, z: 0 }, elev: 0, side: 'red' as const, active: true, onTable: true, controller: null, controlledSinceRound: null, claimedBy: null, activatedRound: null }] }
    expect(losToMarker(withMarker, b, 'a.0', 1).visible).toBe(false)
    expect(losToMarker({ ...withMarker, terrain: [] }, b, 'a.0', 1).visible).toBe(true)
  })

  it('COV-060 HIGH GROUND Cover needs every target model on HIGH GROUND and an attacker below; never for Flying', () => {
    const tower = piece('t', 0, 0, 10, 10, 3, { walkable: true, accessPoints: [{ x: 5, z: 0 }] })
    const s = pair({ profile: 'zergling', at: { x: 9, z: 0 }, owner: 'B', id: 'att' }, { profile: 'marine', at: { x: 0, z: 0 }, owner: 'A', id: 'tgt' }, [tower])
    expect(highGroundCover(s, b, 'att', 'tgt')).toBe(true)
    expect(highGroundCover(s, b, 'tgt', 'att')).toBe(false)
    const flyer = pair({ profile: 'point-defense-drone', at: { x: 9, z: 0 }, owner: 'B', id: 'att' }, { profile: 'marine', at: { x: 0, z: 0 }, owner: 'A', id: 'tgt' }, [tower])
    expect(highGroundCover(flyer, b, 'att', 'tgt')).toBe(false)
  })
})
