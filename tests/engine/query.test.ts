// PREV-* and query.ts: every number the client and AI show comes from the engine (spec 00 s6). attackPreview is exact
// over the dice; PREV-001 checks it against the real pipeline (Monte Carlo over seeds, within a few standard errors).
import { describe, expect, it } from 'vitest'
import { mean } from '../../src/engine/dice'
import { attackPreview, chargeOdds, coherencyPreview, coverFor, engaged, objectiveStatus, reachOf, shootOptions, supplyStatus } from '../../src/engine/query'
import { isRejection } from '../../src/engine/registry'
import { seedRng } from '../../src/engine/rng'
import { declareBatch } from '../../src/engine/shooting'
import { bundle, duelState, ter } from './helpers'

const b = bundle()

describe('query', () => {
  it('PREV-001 attackPreview matches the real Ranged Attack pipeline (models removed, 600 seeds)', () => {
    const s0 = duelState(b, { gap: 10 })
    const p = attackPreview(s0, b, 'A-marines', 'c-14-rifle', 'B-zerglings')
    expect(p.legal).toBe(true)
    expect(p.perModel).toHaveLength(6)
    expect(p.perModel.every((m) => m.dice === 2 && m.hitTN === 3)).toBe(true)
    expect(p.surge.tagMatch).toBe(true) // C-14 Surge Light vs Zerglings
    expect(p.armourTN).toBe(6)
    expect(p.evadeTN).toBeNull() // unengaged and not HIDDEN: no Evade roll
    expect(p.modelsRemoved.reduce((a, x) => a + x, 0)).toBeCloseTo(1, 9)
    const expected = mean(p.modelsRemoved)
    const N = 600
    let sum = 0, sq = 0
    for (let i = 0; i < N; i++) {
      const s = { ...s0, rng: seedRng(`prev-${i}`), activeUnit: 'A-marines' }
      const r = declareBatch(s, b, 'A-marines', 'c-14-rifle', 'B-zerglings')
      if (isRejection(r)) throw new Error(r.message)
      const dead = r.state.units['B-zerglings']!.modelIds.filter((id) => r.state.models[id]!.life === 'dead').length
      sum += dead; sq += dead * dead
    }
    const m = sum / N
    const se = Math.sqrt((sq / N - m * m) / N)
    expect(Math.abs(m - expected)).toBeLessThan(3 * se + 0.02)
  })

  it('PREV-002 attackPreview explains an illegal Batch instead of throwing', () => {
    const s0 = duelState(b, { gap: 30 })
    const p = attackPreview(s0, b, 'A-marines', 'c-14-rifle', 'B-zerglings')
    expect(p.legal).toBe(false)
    expect(p.reason).toBeTruthy()
    expect(p.expectedDamage).toBe(0)
  })

  it('PREV-003 chargeOdds gives the face needed and its chance; reachOf gives Move, Run and Charge reach', () => {
    const s0 = duelState(b, { gap: 8, roundPhase: 'assault' })
    const s = { ...s0, units: { ...s0.units, 'B-zerglings': { ...s0.units['B-zerglings']!, activation: 'movement' as const } } }
    const odds = chargeOdds(s, b, 'B-zerglings', ['A-marines'])
    expect(odds.needed).not.toBeNull()
    expect(odds.chance).toBeCloseTo((7 - odds.needed!) / 6, 9)
    const reach = reachOf(s, b, 'B-zerglings')
    expect(reach.move).toBe(4) // a squad moves at the first Speed value
    expect(reach.chargeMax! - reach.chargeMin!).toBe(5)
    expect(chargeOdds(s, b, 'B-zerglings', ['B-zerglings']).chance).toBe(0)
  })

  it('PREV-004 supplyStatus, objectiveStatus, coverFor and engaged read the services', () => {
    const s0 = duelState(b)
    const sup = supplyStatus(s0, b, 'A')
    expect(sup.onTable).toBe(1) // 6 Marines: bracket 4-6 = 1
    expect(sup.available).toBe(sup.pool - sup.onTable)
    expect(Array.isArray(objectiveStatus(s0, b))).toBe(true)
    expect(coverFor(s0, b, 'A-marines', 'B-zerglings')).toBe('none')
    const walled = { ...s0, terrain: [ter('wall', 'obstacle', 0, 0, 30, 1, 4, { size: 3 })] }
    expect(coverFor(walled, b, 'A-marines', 'B-zerglings')).toBe('full')
    expect(engaged(s0, b, 'A-marines')).toEqual([])
  })
})

describe('query M3 fix additions', () => {
  it('PREV-005 shootOptions explains ineligible weapons and targets with numbers', () => {
    const s0 = duelState(b, { gap: 40, roundPhase: 'assault' })
    const o = shootOptions(s0, b, 'A-marines')
    expect(o.weapons.length).toBeGreaterThan(0)
    const t = o.weapons[0]!.targets.find((x) => x.targetUnitId === 'B-zerglings')!
    expect(t.eligible).toBe(false)
    expect(t.reason).toBe('outOfRange')
    expect(t.distance!).toBeGreaterThan(t.range!)
    const near = shootOptions(duelState(b, { gap: 10, roundPhase: 'assault' }), b, 'A-marines')
    expect(near.canShoot).toBe(true)
    const ok = near.weapons.flatMap((w) => w.targets).find((x) => x.eligible)!
    expect(ok.printedHit).toBeTypeOf('number')
    expect(shootOptions(duelState(b, { gap: 10, roundPhase: 'movement' }), b, 'A-marines').reason).toBe('wrongPhase')
  })

  it('PREV-006 coherencyPreview returns link pairs; objectiveStatus carries ring radius and contested', () => {
    const s0 = duelState(b)
    const c = coherencyPreview(s0, b, 'A-marines', {})
    expect(c.links.length).toBeGreaterThan(0)
    for (const [x, y] of c.links) expect(x).not.toBe(y)
    for (const o of objectiveStatus(s0, b)) {
      expect(o.contestRadius).toBeGreaterThan(o.markerRadius)
      expect(typeof o.contested).toBe('boolean')
    }
  })
})
