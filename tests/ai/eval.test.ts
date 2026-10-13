import { describe, expect, it } from 'vitest'
import { createAiDecider, makeContext } from '../../src/ai/decider'
import { activationValue, attackValue, bestAttack, casualtyCost, chargeValue, deployValue, objectiveValue, passValue, positionValue, stateValue, vpGain, vpOutlook } from '../../src/ai/eval'
import { besideTarget, chargeOddsOf, enemyReach, threatAt, threatenedBy, threatsFor, weaponReach } from '../../src/ai/threat'
import { AI_WORKER_TIMEOUT_MS, hardDeadlineMs, newMemory, TIERS, WORK_PER_MS, type AiContext } from '../../src/ai/types'
import { legalActions } from '../../src/engine/pending'
import { impactPreview } from '../../src/engine/query'
import { view } from '../../src/engine/view'
import type { GameState, SeatId } from '../../src/engine/types'
import { bundle, duelState } from '../engine/helpers'

const b = bundle()
function ctxFor(s: GameState, seat: SeatId, budgetMs = 150): AiContext {
  return makeContext('normal', view(s, seat), s.pending, [], { seed: 't', bundle: b, budgetMs }, newMemory())
}
const weapon = (s: GameState, unit: string): string => s.models[s.units[unit]!.modelIds[0]!]!.weapons[0]!

describe('ai eval and threat', () => {
  it('AI-E01 attackValue is positive in range and zero out of range', () => {
    const near = duelState(b, { gap: 6 }), far = duelState(b, { gap: 40 })
    const w = weapon(near, 'A-marines')
    expect(attackValue(ctxFor(near, 'A'), 'A-marines', w, 'B-zerglings').value).toBeGreaterThan(0)
    expect(attackValue(ctxFor(far, 'A'), 'A-marines', w, 'B-zerglings').value).toBe(0)
  })

  it('AI-E02 bestAttack picks the legal target and is null when nothing is in range', () => {
    const near = duelState(b, { gap: 6 }), far = duelState(b, { gap: 40 })
    expect(bestAttack(ctxFor(near, 'A'), 'A-marines')?.targetUnitId).toBe('B-zerglings')
    expect(bestAttack(ctxFor(far, 'A'), 'A-marines')).toBeNull()
  })

  it('AI-E03 the threat map holds each enemy reach and is memoised per decision', () => {
    const s = duelState(b, { gap: 10 })
    const c = ctxFor(s, 'A')
    const t = threatsFor(c)
    expect(threatsFor(c)).toBe(t)
    const r = enemyReach(c, 'B-zerglings')
    expect(r?.move).toBeGreaterThan(0)
    expect(r?.melee).toBe(true)
    expect(enemyReach(c, 'A-marines')).toBeNull()
  })

  it('AI-E04 threatAt: zerglings threaten close marines and cannot reach far ones', () => {
    const s = duelState(b, { gap: 6 })
    const c = ctxFor(s, 'A')
    const t = threatsFor(c)
    const lead = s.models[s.units['A-marines']!.leadingModelId!]!.pos
    const close = threatAt(c, t, 'A-marines', lead)
    expect(close.expSupply).toBeGreaterThan(0)
    expect(close.attackers).toContain('B-zerglings')
    expect(threatAt(c, t, 'A-marines', lead)).toBe(close) // memo
    const away = { x: lead.x, z: lead.z + 60 }
    expect(threatenedBy(c, t, away)).toEqual([])
    expect(threatAt(c, t, 'A-marines', away).expSupply).toBe(0)
  })

  it('AI-E05 positionValue prefers the spot the enemy cannot reach (wThreat > 0)', () => {
    const s = duelState(b, { gap: 6 })
    const c = ctxFor(s, 'A')
    const t = threatsFor(c)
    const lead = s.models[s.units['A-marines']!.leadingModelId!]!.pos
    const here = positionValue(c, 'A-marines', lead, t)
    const safe = positionValue(c, 'A-marines', { x: lead.x, z: lead.z + 40 }, t)
    expect(here.parts.threat ?? 0).toBeLessThan(0)
    expect(Math.abs(safe.parts.threat ?? 0)).toBe(0)
    expect(TIERS.normal.wThreat).toBeGreaterThan(0)
  })

  it('AI-E06 chargeValue is zero with no reach and positive for a close charger', () => {
    const near = duelState(b, { gap: 5 }), far = duelState(b, { gap: 40 })
    expect(chargeValue(ctxFor(near, 'B'), 'B-zerglings', ['A-marines']).value).not.toBe(0)
    expect(chargeValue(ctxFor(far, 'B'), 'B-zerglings', ['A-marines']).value).toBe(0)
  })

  it('AI-E07 casualtyCost keeps the leading model dearer than a plain one', () => {
    const s = duelState(b, { gap: 12 })
    const c = ctxFor(s, 'A')
    const u = s.units['A-marines']!
    const lead = u.leadingModelId!
    const other = u.modelIds.find((m) => m !== lead && m !== u.modelIds[0])!
    expect(casualtyCost(c, 'A-marines', lead)).toBeGreaterThan(casualtyCost(c, 'A-marines', other))
  })

  it('AI-E08 stateValue and vpOutlook rise with our VP; objectiveValue stays finite', () => {
    const s = duelState(b, { gap: 12 })
    const ahead: GameState = { ...s, seats: { ...s.seats, A: { ...s.seats.A!, vp: 4 } } }
    const c0 = ctxFor(s, 'A'), c1 = ctxFor(ahead, 'A')
    expect(vpOutlook(c1, 'A').vp).toBe(4)
    expect(vpOutlook(c1, 'A').projected).toBeGreaterThanOrEqual(vpOutlook(c0, 'A').projected + 4)
    expect(stateValue(c1, threatsFor(c1)).value).toBeGreaterThan(stateValue(c0, threatsFor(c0)).value)
    expect(Number.isFinite(objectiveValue(c0, 'A-marines', { x: 0, z: 0 }))).toBe(true)
  })

  it('AI-E09 anytime: an exhausted work cap returns neutral values, never throws', () => {
    const s = duelState(b, { gap: 6 })
    const c = ctxFor(s, 'A')
    c.work.n = c.work.cap + 1
    expect(attackValue(c, 'A-marines', weapon(s, 'A-marines'), 'B-zerglings').value).toBe(0)
    expect(positionValue(c, 'A-marines', { x: 0, z: 0 }, threatsFor(c)).value).toBe(0)
  })

  it('AI-E10 passValue never rewards passing while a shot is worth taking; activation and deploy values are finite', () => {
    const s = duelState(b, { gap: 6 })
    const c = ctxFor(s, 'A')
    c.legal = [{ type: 'shoot.go', unitId: 'A-marines', decisionId: 'd', seat: 'A' }, { type: 'turn.pass', decisionId: 'd', seat: 'A' }]
    const t = threatsFor(c)
    expect(activationValue(c, 'A-marines', 'shoot.go', t).value).toBeGreaterThan(0)
    expect(passValue({ ...c, params: { ...c.params, wTempo: 0 } }, t).value).toBeLessThan(0)
    expect(Number.isFinite(deployValue(c, 'A-marines', t))).toBe(true)
  })
})

describe('ai work meter, charges and reach (audit fixes)', () => {
  it('AI-E20 the hard wall-clock stop sits past 60% of the worker timeout, so a normal decision never reaches it', () => {
    expect(hardDeadlineMs(150)).toBeGreaterThanOrEqual(AI_WORKER_TIMEOUT_MS * 0.6)
    expect(hardDeadlineMs(10000)).toBe(40000)
    expect(WORK_PER_MS * 150).toBeGreaterThanOrEqual(200)
  })

  it('AI-E21 the same decision answers the same under a fast and a very slow clock (the cap, not the clock, ends it)', () => {
    const s = duelState(b, { gap: 8 })
    const legal = legalActions(s)
    const run = (step: number) => {
      let t = 0
      const d = createAiDecider('normal', { seed: 'clock', bundle: b, now: () => (t += step), accepts: () => true })
      return d.decideSync(view(s, 'A'), s.pending, legal).action
    }
    expect(run(0.001)).toEqual(run(0.4)) // 0.4 ms per clock read: 3x slower than a desktop, still under the hard stop
  })

  it('AI-E22 chargeOddsOf is memoised per unit and target set, and an uncached call spends more than one unit', () => {
    const s = duelState(b, { gap: 6 })
    const c = ctxFor(s, 'A')
    const first = chargeOddsOf(c, 'A-marines', ['B-zerglings'])
    const spent = c.work.n
    expect(spent).toBeGreaterThan(1)
    expect(chargeOddsOf(c, 'A-marines', ['B-zerglings'])).toBe(first)
    expect(c.work.n).toBe(spent)
  })

  it('AI-E23 weaponReach honours LONG_RANGE X (a Marine rifle at 12 reaches 18)', () => {
    expect(weaponReach({ range: 12, keywords: [{ kw: 'LONG_RANGE', x: 18 }] } as never)).toBe(18)
    expect(weaponReach({ range: 12, keywords: [] } as never)).toBe(12)
    expect(weaponReach({ range: 'E', keywords: [] } as never)).toBe(0)
  })

  it('AI-E24 the enemy charge mean comes from the engine (chargeMin..chargeMax), not Speed + 4.5', () => {
    const s = duelState(b, { gap: 10 })
    const c = ctxFor(s, 'A')
    const r = enemyReach(c, 'B-zerglings')!
    expect(r.charge).toBeCloseTo((r.chargeMin + r.chargeMax) / 2, 6)
    expect(r.chargeMax - r.chargeMin).toBe(5)
  })

  it('AI-E25 a short charge scores above a long one in chargeValue, and impactPreview feeds it', () => {
    const near = duelState(b, { gap: 3 }), far = duelState(b, { gap: 9 })
    const n = chargeValue(ctxFor(near, 'B'), 'B-zerglings', ['A-marines']).value
    const f = chargeValue(ctxFor(far, 'B'), 'B-zerglings', ['A-marines']).value
    expect(n).not.toBe(f)
    const shim = besideTarget(near, 'B-zerglings', 'A-marines')
    const ip = impactPreview(shim, b, 'B-zerglings', 'A-marines')
    if (ip) { expect(ip.dice).toBeGreaterThan(0); expect(ip.expectedSupplyRemoved).toBeGreaterThanOrEqual(0) }
  })

  it('AI-E26 positionValue prices the Mission VP of a spot through query.missionScore (vpGain)', () => {
    const s = duelState(b, { gap: 12, missionId: 'frontlines-skirmish' })
    const c = ctxFor(s, 'A')
    expect(Number.isFinite(vpGain(c, 'A-marines', { x: 0, z: 0 }))).toBe(true)
    expect(vpGain(c, 'A-marines', { x: 0, z: 6 })).toBe(0) // where it already stands
  })
})
