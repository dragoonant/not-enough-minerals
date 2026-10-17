// Per-card `to: triggerUnit` tests (M2 follow-ups): the real card data is dispatched through the real hook plumbing and
// the Effect must land on the Unit the card text names. Names follow docs/spec/12-rules-test-checklist.md IDs.
import { describe, expect, it, vi } from 'vitest'
import { abilities } from '../../src/engine/abilities'
import { effectOps, statOf, weaponProfile } from '../../src/engine/effects'
import { runHook } from '../../src/engine/hooks'
import type { CardState, GameState } from '../../src/engine/types'
import { bundle, duelState, squad } from './helpers'

vi.mock('../../src/engine/squads', async (orig) => {
  const real = await orig<typeof import('../../src/engine/squads')>()
  return {
    ...real,
    unitModels: (state: GameState, unitId: string, o: { includeDead?: boolean } = {}) => {
      try { return real.unitModels(state, unitId, o) } catch {
        const u = state.units[unitId]
        return u ? u.modelIds.map((id) => state.models[id]!).filter((m) => o.includeDead || m.life !== 'dead') : []
      }
    },
  }
})

const b = bundle()
const card = (id: string, res: 'CP' | 'BM' | 'PE', n = 1, kind: CardState['kind'] = 'tactical'): CardState => ({ id, kind, exhausted: false, resource: { res, n }, usage: {} })

function withSquad(s: GameState, spec: Parameters<typeof squad>[1]): GameState {
  const q = squad(b, spec)
  return { ...s, units: { ...s.units, [q.unit.id]: q.unit }, models: { ...s.models, ...Object.fromEntries(q.models.map((m) => [m.id, m])) } }
}

/** Take the first Reaction on offer for `abilityId` and pay for it. */
function useReaction(s: GameState, abilityId: string): GameState {
  expect(s.pending.kind).toBe('ability.react')
  const o = s.pending.options.find((x) => x.action.type === 'ability.useReaction' && x.action.abilityId === abilityId)
  if (!o) throw new Error(`no ${abilityId} on offer: ${s.pending.options.map((p) => String(p.action.abilityId)).join(',')}`)
  const r = abilities.resolve(s, b, o.action)
  if (!('state' in r)) throw new Error(`${r.code}: ${r.message}`)
  return r.state
}

describe('triggerUnit on the real cards (ABL-032)', () => {
  it('ABL-032 Concussive Shells slows the enemy that charges, not the friend it charges', () => {
    let s = duelState(b, { roundPhase: 'assault' })
    s = withSquad(s, { id: 'A-marauders', owner: 'A', profileId: 'marauder', models: 2, at: { x: 4, z: 6 } })
    s = { ...s, cards: { A: [card('barracks', 'CP')], B: [] }, activeUnit: 'B-zerglings', active: 'B' }
    const speed = (st: GameState, id: string) => statOf(st, b, id, 'speed', { phase: 'assault' })
    const before = { z: speed(s, 'B-zerglings')!, m: speed(s, 'A-marines')! }
    const w = runHook(s, b, 'onChargeDeclared', { unitId: 'B-zerglings', targetUnitId: 'A-marines', seat: 'B', phase: 'assault' })
    expect(w.raised).toBe(true)
    const done = useReaction(w.state, 'concussive-shells')
    expect(speed(done, 'B-zerglings')).toBeLessThan(before.z)
    expect(speed(done, 'A-marines')).toBe(before.m)
  })

  it('ABL-032 Debilitating Saliva worsens the Hit of the enemy that shoots, on its assault weapons', () => {
    let s = duelState(b, { roundPhase: 'assault' })
    s = withSquad(s, { id: 'B-vile', owner: 'B', profileId: 'vile', models: 1, at: { x: 2, z: 1 } })
    s = { ...s, cards: { A: [], B: [card('hatchery', 'BM', 1, 'tactical')] }, activeUnit: 'A-marines', active: 'A' }
    const rifle = (st: GameState) => weaponProfile(st, b, 'A-marines', 'c-14-rifle')!
    const hit0 = rifle(s).hit
    const batch = { id: 'x', kind: 'ranged', keywords: [], attackerModelIds: [], weaponId: 'c-14-rifle', sourceId: null }
    const w = runHook(s, b, 'onTargeted', { unitId: 'A-marines', targetUnitId: 'B-zerglings', seat: 'A', phase: 'assault', cause: 'declareRangedAttack', batch: batch as never })
    if (!w.raised) throw new Error('expected the Reaction window; check the BM card stand-in')
    const done = useReaction(w.state, 'debilitating-saliva')
    // the shooter's assault gun is worse by 1; the Zerglings' own guns are untouched
    expect(Number(rifle(done).hit)).toBe(Number(hit0) + 1)
    expect(weaponProfile(done, b, 'B-zerglings', 'claws')?.hit).toBe(weaponProfile(s, b, 'B-zerglings', 'claws')?.hit)
  })

  it('ABL-032 Gravitic Boosters adds 1" to the Charge distance of the friend who rolls, and to nobody else', () => {
    let s = duelState(b, { roundPhase: 'assault' })
    s = withSquad(s, { id: 'A-zealots', owner: 'A', profileId: 'zealot', models: 2, at: { x: -6, z: 8 } })
    s = { ...s, cards: { A: [card('observer', 'PE')], B: [] }, activeUnit: 'A-marines', active: 'A' }
    const ctx = { unitId: 'A-marines', targetUnitId: 'B-zerglings', seat: 'A', phase: 'assault' as const, cause: 'chargeDistance', value: 7 }
    const w = runHook(s, b, 'onChargeRoll', ctx)
    expect(w.raised).toBe(true)
    const done = useReaction(w.state, 'gravitic-boosters')
    expect(runHook(done, b, 'onChargeRoll', { ...ctx, foldOnly: true }).value).toBe(8)
    expect(runHook(done, b, 'onChargeRoll', { ...ctx, unitId: 'A-zealots', foldOnly: true }).value).toBe(7)
  })

  it('ABL-032 Pneumatized Carapace makes the friend who rolls Charge distance roll best of two dice', () => {
    let s = duelState(b, { roundPhase: 'assault' })
    s = withSquad(s, { id: 'A-zealots', owner: 'A', profileId: 'zealot', models: 2, at: { x: -6, z: 8 } })
    s = { ...s, cards: { A: [card('overseer', 'BM')], B: [] }, activeUnit: 'A-marines', active: 'A' }
    const ctx = { unitId: 'A-marines', targetUnitId: 'B-zerglings', seat: 'A', phase: 'assault' as const, cause: 'chargeDistance', value: 7 }
    const w = runHook(s, b, 'onChargeRoll', ctx)
    expect(w.raised).toBe(true)
    const done = useReaction(w.state, 'pneumatized-carapace')
    expect(effectOps(done, b, 'A-marines', 'charge').some((l) => l.rec.dice === 'best2D6')).toBe(true)
    expect(effectOps(done, b, 'A-zealots', 'charge')).toEqual([])
  })
})
