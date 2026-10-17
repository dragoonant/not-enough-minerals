// Integrator query additions: placement-aware engaged / canSee / coverFor, detector areas, marker geometry, ready pools, and
// shootOptions reasons that come from shooting.checkTarget.
import { describe, expect, it } from 'vitest'
import { canSee, coverFor, detectorAreas, engaged, markerGeometry, objectiveStatus, readyPools, shootOptions } from '../../src/engine/query'
import { carriers, checkTarget } from '../../src/engine/shooting'
import { weaponProfile } from '../../src/engine/effects'
import { bundle, duelState } from './helpers'

const b = bundle()

describe('query placement and integrator additions', () => {
  it('QRY-P1 engaged() with a dry-run placement answers for the placed models, and leaves the state alone', () => {
    const s0 = duelState(b, { gap: 10 })
    expect(engaged(s0, b, 'A-marines')).toEqual([])
    const foe = s0.models[s0.units['B-zerglings']!.modelIds[0]!]!
    const placement = Object.fromEntries(s0.units['A-marines']!.modelIds.map((id, i) => [id, { x: foe.pos.x - 1.5, z: foe.pos.z + i * 0.2 }]))
    expect(engaged(s0, b, 'A-marines', placement)).toContain('B-zerglings')
    expect(engaged(s0, b, 'A-marines')).toEqual([])
  })

  it('QRY-P2 canSee and coverFor accept a placement and agree with the plain call when it is empty', () => {
    const s0 = duelState(b, { gap: 10 })
    expect(canSee(s0, b, 'A-marines', 'B-zerglings', {})).toEqual(canSee(s0, b, 'A-marines', 'B-zerglings'))
    expect(coverFor(s0, b, 'B-zerglings', 'A-marines', {})).toBe(coverFor(s0, b, 'B-zerglings', 'A-marines'))
    const id = s0.units['A-marines']!.modelIds[0]!
    const v = canSee(s0, b, 'A-marines', 'B-zerglings', { [id]: { x: s0.models[id]!.pos.x, z: s0.models[id]!.pos.z } })
    expect(typeof v.ok).toBe('boolean')
  })

  it('QRY-P3 markerGeometry matches the ring numbers objectiveStatus reports', () => {
    const g = markerGeometry(b)
    expect(g.contestRadius).toBeCloseTo(g.markerRadius + g.contestRange, 9)
    for (const o of objectiveStatus(duelState(b), b)) {
      expect(o.markerRadius).toBe(g.markerRadius)
      expect(o.contestRadius).toBe(g.contestRadius)
    }
  })

  it('QRY-P4 detectorAreas resolves stored areas to table points; readyPools sums unexhausted cards', () => {
    const s0 = duelState(b)
    const withArea = { ...s0, detectors: [{ id: 'd1', owner: 'A', centre: { kind: 'point' as const, pos: { x: 3, z: 4 } }, radius: 6, source: 'test', expires: 'permanent' as const }] }
    const d = detectorAreas(withArea, b).find((x) => x.id === 'd1')!
    expect(d.centres).toEqual([{ x: 3, z: 4 }])
    expect(d.radius).toBe(6)
    const seat = s0.seatOrder[0]!
    const cards = [{ id: 'c1', exhausted: false, resource: { res: 'CP', n: 2 } }, { id: 'c2', exhausted: true, resource: { res: 'CP', n: 5 } }, { id: 'c3', exhausted: false, resource: { res: 'CP', n: 1 } }]
    const st = { ...s0, cards: { ...s0.cards, [seat]: cards as never } }
    expect(readyPools(st, seat)).toEqual([{ res: 'CP', n: 3 }])
  })

  it('QRY-P5 an ineligible shootOptions target agrees with checkTarget for the same weapon and carriers', () => {
    const s0 = duelState(b, { gap: 40, roundPhase: 'assault' })
    const o = shootOptions(s0, b, 'A-marines')
    const w = o.weapons[0]!
    const unit = s0.units['A-marines']!
    const prof = weaponProfile(s0, b, 'A-marines', w.weaponId, { attack: 'ranged', targetUnitId: 'B-zerglings' })!
    const chk = checkTarget(s0, b, unit, prof, carriers(s0, unit, prof), s0.units['B-zerglings']!)
    expect(chk.ok).toBe(false)
    expect(w.targets.find((t) => t.targetUnitId === 'B-zerglings')!.reason).toBe(chk.reason)
  })
})
