// Charge planning against real terrain: no mocks, the real movement.reposition validates every route (CHG-004).
import { describe, expect, it } from 'vitest'
import { chargeNeeded, planCharge } from '../../src/engine/charge'
import { isRejection } from '../../src/engine/errors'
import { reposition } from '../../src/engine/movement'
import { bundle, duelState, ter } from './helpers'

const b = bundle()

describe('charge against real terrain (CHG-004)', () => {
  it('CHG-004 an obstruction in the way forces a detour, and the straight line is refused by the real planner', () => {
    const open = duelState(b, { gap: 6, roundPhase: 'assault' })
    const wall = ter('wall', 'obstruction', 0, 0, 5, 0.6, 3, { size: 3 })
    const walled = { ...open, terrain: [wall] }

    const straight = planCharge(open, b, 'A-marines', ['B-zerglings'], 9, 1)[0]
    expect(straight?.path).toHaveLength(1)

    const plans = planCharge(walled, b, 'A-marines', ['B-zerglings'], 12, 3)
    expect(plans.length).toBeGreaterThan(0)
    expect(plans.every((p) => p.path.length === 2)).toBe(true)
    // every offered route validates in the real reposition; the straight one does not
    for (const p of plans) {
      const r = reposition(walled, b, 'A-marines', { kind: 'charge', leaderId: p.leaderId, path: p.path, maxDist: 12, allowEngage: ['B-zerglings'], mustEngage: ['B-zerglings'] })
      expect(isRejection(r)).toBe(false)
    }
    const line = reposition(walled, b, 'A-marines', { kind: 'charge', leaderId: straight!.leaderId, path: straight!.path, maxDist: 12, allowEngage: ['B-zerglings'], mustEngage: ['B-zerglings'] })
    expect(isRejection(line)).toBe(true)
  })

  it('CHG-004 the detour costs distance: a short roll that reaches in the open fails behind the wall', () => {
    const open = duelState(b, { gap: 6, roundPhase: 'assault' })
    const walled = { ...open, terrain: [ter('wall', 'obstruction', 0, 0, 5, 0.6, 3, { size: 3 })] }
    const need = chargeNeeded(open, b, 'A-marines', ['B-zerglings'])
    const needWalled = chargeNeeded(walled, b, 'A-marines', ['B-zerglings'])
    expect(need).not.toBeNull()
    expect(needWalled === null || needWalled > need!).toBe(true)
    expect(planCharge(walled, b, 'A-marines', ['B-zerglings'], 5.2, 1)).toEqual([])
  })
})
