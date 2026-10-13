import { describe, expect, it, vi } from 'vitest'
import {
  atLeastP, binomial, capAt, clampTN, d3, exprDistribution, finalTN, mean, pAtLeast, parseDice, pSuccess, reroll, rollDice,
  rollExpr, rollOff, succeeds, test,
} from '../../src/engine/dice'
import { bracketSupply, cardToWorld, markerSide, requireUnitDef, rule, segmentToWorld, worldToCard, zoneRect } from '../../src/engine/edition'
import { apply } from '../../src/engine/apply'
import { isRejection, modules, NAMESPACES, TodoError } from '../../src/engine/registry'
import { shooting } from '../../src/engine/shooting'
import { roll } from '../../src/engine/rng'
import type { Die, GameState } from '../../src/engine/types'
import { bundle, duelState, runDeciders, withForcedDice } from './helpers'

const b = bundle()
const fresh = (seed = 'dice'): GameState => duelState(b, { seed })

describe('dice service (spec 13 s1-4)', () => {
  it('DICE-001 every die is a D6 face 1..6 from roll() and advances rollSeq', () => {
    const r = rollDice(fresh(), 600, 'test')
    expect(new Set(r.dice.map((d) => d.face))).toEqual(new Set([1, 2, 3, 4, 5, 6]))
    expect(r.state.rollSeq).toBe(1)
    expect(r.dice.every((d) => !d.rerolled)).toBe(true)
  })

  it('DICE-002 D3 halves a D6 rounding up', () => {
    expect([1, 2, 3, 4, 5, 6].map(d3)).toEqual([1, 1, 2, 2, 3, 3])
    expect(exprDistribution('D3')).toEqual([0, 1 / 3, 1 / 3, 1 / 3])
  })

  it('DICE-003 nD6 sums n dice; DICE-025 fixed additions are added unclamped', () => {
    expect(parseDice('2D6')).toEqual({ n: 2, sides: 6, plus: 0 })
    expect(parseDice('D3+1')).toEqual({ n: 1, sides: 3, plus: 1 })
    expect(parseDice('D4')).toBeNull()
    const r = rollExpr(withForcedDice(fresh(), [6, 5]), '2D6', 'test')
    expect(isRejection(r) ? null : r.value).toBe(11)
    const p = rollExpr(withForcedDice(fresh(), [6]), 'D3+1', 'test')
    expect(isRejection(p) ? null : p.value).toBe(4)
    expect(mean(exprDistribution('2D6')!)).toBeCloseTo(7)
  })

  it('DICE-004 Roll-Off: 2D6 each, ties re-roll until someone wins', () => {
    const s = withForcedDice(fresh(), [3, 4, 5, 2, 6, 6, 1, 1])
    const r = rollOff(s, ['A', 'B'], 'rollOff')
    expect(r.events.length).toBe(4)
    expect(r.winner).toBe('A')
    expect(r.state.rollSeq).toBe(4)
  })

  it('DICE-010 DICE-011 DICE-012 a re-roll replaces one die, even when worse, once only', () => {
    const die: Die = { id: 'x', face: 6, rerolled: false }
    const r = reroll(withForcedDice(fresh(), [2]), b, die, 'reroll')
    if (isRejection(r)) throw new Error(r.message)
    expect(r.die).toEqual({ id: 'x', face: 2, rerolled: true })
    const again = reroll(r.state, b, r.die, 'reroll')
    expect(isRejection(again) ? again.code : null).toBe('E_USED')
  })

  it('DICE-020 DICE-021 modifiers move the TN and differently named sources add', () => {
    expect(finalTN(b, 4, [1])).toBe(3)
    expect(finalTN(b, 4, [-1])).toBe(5)
    expect(finalTN(b, 5, [{ source: 'a', label: 'A', value: 1, mode: 'add' }, { source: 'b', label: 'B', value: 1, mode: 'add' }])).toBe(3)
  })

  it('DICE-022 the final TN clamps to the rules.json range', () => {
    expect(rule(b, 'tnClamp')).toEqual([2, 6])
    expect(finalTN(b, 3, [3])).toBe(2)
    expect(finalTN(b, 5, [-4])).toBe(6)
    expect(clampTN(b, 9)).toBe(6)
  })

  it('DICE-023 natural 6 succeeds and natural 1 fails at any TN', () => {
    expect(succeeds(6, 6)).toBe(true)
    expect(succeeds(1, 2)).toBe(false)
    expect(pSuccess(2)).toBeCloseTo(5 / 6)
    expect(pSuccess(6)).toBeCloseTo(1 / 6)
  })

  it('DICE-024 a null characteristic rolls nothing and every die fails', () => {
    const s = fresh()
    const t = test(s, b, { count: 3, tn: finalTN(b, null, [2]), purpose: 'armour' })
    expect(t).toMatchObject({ autoFail: true, failCount: 3, successCount: 0, dice: [] })
    expect(t.state).toBe(s)
    expect(pSuccess(null)).toBe(0)
  })

  it('DICE-030 a test succeeds on die >= final TN', () => {
    const t = test(withForcedDice(fresh(), [1, 2, 3, 4, 5, 6]), b, { count: 6, tn: 4, purpose: 'hit' })
    expect(t.successes.map((d) => d.face)).toEqual([4, 5, 6])
    expect(t.failures.map((d) => d.face)).toEqual([1, 2, 3])
  })

  it('DICE-031 value generation ignores the natural-1 rule: P(D6 >= need) for charges', () => {
    expect(pAtLeast(1)).toBe(1)
    expect(pAtLeast(4)).toBeCloseTo(0.5)
    expect(pAtLeast(7)).toBe(0)
  })

  it('DICE-032 groups with different TNs are separate tests of one Batch; exact odds helpers agree', () => {
    let s = withForcedDice(fresh(), [3, 3, 3, 3])
    const near = test(s, b, { count: 2, tn: 3, purpose: 'hit', group: 0 }); s = near.state
    const far = test(s, b, { count: 2, tn: 4, purpose: 'hit', group: 1 })
    expect(near.successCount + far.successCount).toBe(2)
    expect(far.dice.every((d) => d.group === 1)).toBe(true)
    const dist = binomial(4, 0.5)
    expect(dist.reduce((a, x) => a + x, 0)).toBeCloseTo(1)
    expect(atLeastP(dist, 4)).toBeCloseTo(1 / 16)
    expect(capAt([0.25, 0.25, 0.5], 1)).toEqual([0.25, 0.75])
  })
})

describe('M2 foundations: rng, edition, registry', () => {
  it('RNG-002 forced dice are consumed before the seeded stream, which is untouched', () => {
    const s = fresh()
    const r = roll(withForcedDice(s, [6, 1]), { count: 3, sides: 6, purpose: 't' })
    expect(r.event.dice.slice(0, 2)).toEqual([6, 1])
    expect(r.state.debug?.forcedDice).toEqual([])
    expect(r.event.dice[2]).toBe(roll(s, { count: 1, sides: 6, purpose: 't' }).event.dice[0])
  })

  it('ZOI-002 card frame to world (N is far, never mirrored) and one 6 in zone rectangle per segment', () => {
    const size = { w: 36, h: 36 }
    expect(cardToWorld({ x: 18, y: 18 }, size)).toEqual({ x: 0, z: 0 })
    expect(cardToWorld({ x: 0, y: 0 }, size)).toEqual({ x: -18, z: 18 })
    expect(worldToCard(cardToWorld({ x: 6, y: 30 }, size), size)).toEqual({ x: 6, y: 30 })
    expect(segmentToWorld({ edge: 'N', from: 12, to: 24 }, size)).toEqual([{ x: -6, z: -18 }, { x: 6, z: -18 }])
    expect(zoneRect({ edge: 'S', from: 0, to: 36 }, size, rule(b, 'zoiDepth'))).toEqual({ min: { x: -18, z: 12 }, max: { x: 18, z: 18 } })
    expect([1, 2, 3, 4, 5].map(markerSide)).toEqual(['red', 'blue', 'red', 'blue', 'neutral'])
  })

  it('SUP-001 Supply comes from the printed bracket of the live model count', () => {
    const marine = requireUnitDef(b, 'marine')
    expect([0, 3, 4, 6, 7, 9].map((n) => bracketSupply(marine, n))).toEqual([0, 0, 1, 1, 2, 2])
  })

  it('APPLY-002 every namespace of spec 00 s3.2 has one module, and a TodoError thrown by a body is E_TODO with the state unchanged', async () => {
    expect(modules().flatMap((m) => m.kinds).sort()).toEqual(Object.keys(NAMESPACES).sort())
    const s = fresh()
    // M2 integration: no body is unbuilt any more, so the protocol is shown with a body that throws TodoError
    const spy = vi.spyOn(shooting, 'resolve').mockImplementation(() => { throw new TodoError('test body') })
    const forged = { ...s, pending: { ...s.pending, kind: 'shoot.batch' } }
    const r = apply(forged, b, { ...forged.pending.options[0]!.action, type: 'test.idle' })
    spy.mockRestore()
    expect(r.ok ? null : r.rejection.code).toBe('E_TODO')
    expect(r.state).toBe(forged)
    const run = await runDeciders(s, b, { maxSteps: 5 })
    expect(run.rejection?.code).toBe('E_UNKNOWN_KIND')
  })
})
