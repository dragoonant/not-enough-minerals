import { describe, expect, it, vi } from 'vitest'
import {
  addEffect, expireEffects, hasStatus, keywordOf, rollModOf, setStatus, startOfRoundStatuses, statOf, statusHeld, tokenGrants, weaponProfile,
} from '../../src/engine/effects'
import { runHook } from '../../src/engine/hooks'
import type { AttackBatch, Effect, GameState } from '../../src/engine/types'
import { bundle, duelState, squad } from './helpers'

// Squad lookups belong to owner M; until they land, read the unit's own model list.
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
const eff = (source: string, o: Partial<Omit<Effect, 'id'>>): Omit<Effect, 'id'> => ({ source, kind: 'buff', expires: 'endOfRound', bySeat: 'A', round: 1, ...o })

describe('effects: the one Effect list (spec 16 s6)', () => {
  it('MOD-003 BUFF keeps the highest X per characteristic while differently named flat mods stack', () => {
    let s = duelState(b)
    const base = statOf(s, b, 'A-marines', 'speed')!
    s = addEffect(s, 'A-marines', eff('wild-mutation', { stat: 'speed', x: 1 }))
    s = addEffect(s, 'A-marines', eff('glial', { stat: 'speed', x: 2 }))
    expect(statOf(s, b, 'A-marines', 'speed')).toBe(base + 2)
    s = addEffect(s, 'A-marines', eff('accelerating-creep', { kind: 'flat', stat: 'speed', x: 1, expires: 'permanent' }))
    s = addEffect(s, 'A-marines', eff('queen-creep-speed', { kind: 'flat', stat: 'speed', x: 2, expires: 'permanent' }))
    expect(statOf(s, b, 'A-marines', 'speed')).toBe(base + 2 + 3)
  })

  it('ABL-005 two instances of one named source count once', () => {
    let s = duelState(b)
    const base = statOf(s, b, 'A-marines', 'hp')!
    s = addEffect(s, 'A-marines', eff('kinetic-foam', { kind: 'flat', stat: 'hp', x: 1, expires: 'permanent' }))
    s = addEffect(s, 'A-marines', eff('kinetic-foam', { kind: 'flat', stat: 'hp', x: 1, expires: 'permanent' }))
    expect(statOf(s, b, 'A-marines', 'hp')).toBe(base + 1)
  })

  it('MOD-001 MOD-002 BUFF lowers a target number, DEBUFF raises it, a value never drops below 0', () => {
    let s = duelState(b)
    const armour = statOf(s, b, 'A-marines', 'armour')!
    s = addEffect(s, 'A-marines', eff('b', { stat: 'armour', x: 1 }))
    expect(statOf(s, b, 'A-marines', 'armour')).toBe(armour - 1)
    s = addEffect(s, 'A-marines', eff('d', { kind: 'debuff', stat: 'armour', x: 3 }))
    expect(statOf(s, b, 'A-marines', 'armour')).toBe(armour - 1 + 3)
    s = addEffect(s, 'A-marines', eff('slow', { kind: 'debuff', stat: 'speed', x: 99 }))
    expect(statOf(s, b, 'A-marines', 'speed')).toBe(0)
  })

  it('KW-002 PRECISION (1) and PRECISION (2) from two sources act as PRECISION (2) on the weapon', () => {
    let s = duelState(b)
    const w = { ids: ['c-14-rifle'] }
    s = addEffect(s, 'A-marines', eff('stimpack', { kind: 'keyword', kw: { kw: 'PRECISION', x: 1 }, weapons: w }))
    s = addEffect(s, 'A-marines', eff('orders', { kind: 'keyword', kw: { kw: 'PRECISION', x: 2 }, weapons: w }))
    expect(keywordOf(s, b, 'A-marines', 'PRECISION', { weaponId: 'c-14-rifle' })?.x).toBe(2)
    const prof = weaponProfile(s, b, 'A-marines', 'c-14-rifle')!
    expect(prof.keywords.filter((k) => k.kw === 'PRECISION')).toEqual([{ kw: 'PRECISION', x: 2 }])
    // the other weapon of the card is untouched
    expect(weaponProfile(s, b, 'A-marines', 'strike')!.keywords.some((k) => k.kw === 'PRECISION')).toBe(false)
  })

  it('MOD-005 BUFF ends at the End of the Round while a status stays through Cleanup', () => {
    let s = duelState(b)
    s = addEffect(s, 'A-marines', eff('b', { stat: 'speed', x: 2 }))
    s = setStatus(s, b, 'A-marines', 'SIEGE_MODE', 'gain', 'mode')
    const cleaned = runHook(s, b, 'cleanup', {}).state
    expect(cleaned.units['A-marines']!.effects.some((e) => e.kind === 'buff')).toBe(false)
    expect(hasStatus(cleaned, 'A-marines', 'SIEGE_MODE')).toBe(true)
    expect(expireEffects(s, b, 'thisRoll')).toBe(s)
  })

  it('MOD-006 STATIONARY is gained at the Start of the Round and lost the moment a model moves', () => {
    let s = duelState(b)
    s = startOfRoundStatuses(s, b)
    expect(hasStatus(s, 'A-marines', 'STATIONARY')).toBe(true)
    s = runHook(s, b, 'onMoveEnd', { unitId: 'A-marines', kind: 'move' }).state
    expect(hasStatus(s, 'A-marines', 'STATIONARY')).toBe(false)
    expect(hasStatus(s, 'B-zerglings', 'STATIONARY')).toBe(true)
  })

  it('VIS-020 BURROWED grants HIDDEN, makes Size 0 and losing BURROWED removes HIDDEN', () => {
    let s = duelState(b)
    const size = statOf(s, b, 'B-zerglings', 'size')
    expect(size).toBeGreaterThan(0)
    s = setStatus(s, b, 'B-zerglings', 'BURROWED', 'gain', 'burrow')
    expect(hasStatus(s, 'B-zerglings', 'HIDDEN')).toBe(true)
    expect(statOf(s, b, 'B-zerglings', 'size')).toBe(0)
    s = setStatus(s, b, 'B-zerglings', 'BURROWED', 'lose', 'move')
    expect(hasStatus(s, 'B-zerglings', 'BURROWED')).toBe(false)
    expect(hasStatus(s, 'B-zerglings', 'HIDDEN')).toBe(false)
    expect(statOf(s, b, 'B-zerglings', 'size')).toBe(size)
  })

  it('MOD-004 DICE roll modifiers fold per source and a printed "-" stays null', () => {
    let s = duelState(b)
    s = addEffect(s, 'A-marines', eff('adrenal', { kind: 'mod', expires: 'endOfActivation', data: { op: 'rollMod', roll: 'impactHit', delta: 1 } }))
    s = addEffect(s, 'A-marines', eff('adrenal', { kind: 'mod', expires: 'endOfActivation', data: { op: 'rollMod', roll: 'impactHit', delta: 1 } }))
    s = addEffect(s, 'A-marines', eff('evo', { kind: 'mod', expires: 'endOfActivation', data: { op: 'rollMod', roll: 'impactHit', delta: 1 } }))
    expect(rollModOf(s, b, 'A-marines', 'impactHit')).toBe(2)
    expect(rollModOf(s, b, 'A-marines', 'evade')).toBe(0)
  })

  it('ST-007 ON CREEP: ground Zerg near a creep tumor token, derived and never stored', () => {
    let s = duelState(b)
    expect(statusHeld(s, b, 'B-zerglings', 'ON_CREEP')).toBe(false)
    const z = s.models['B-zerglings.0']!
    s = { ...s, tokens: [{ id: 't1', defId: 'creep-tumor', owner: 'B', sourceId: null, pos: { x: z.pos.x + 2, z: z.pos.z }, elev: 0, round: 1 }] }
    expect(statusHeld(s, b, 'B-zerglings', 'ON_CREEP')).toBe(true)
    expect(statusHeld(s, b, 'A-marines', 'ON_CREEP')).toBe(false)
    expect(hasStatus(s, 'B-zerglings', 'ON_CREEP')).toBe(false)
  })

  it('MOD-007 `first: round` limits Lurking to the first shot at the Unit each Round; the same Batch asked again still counts as first', () => {
    const hy = squad(b, { id: 'B-hydra', owner: 'B', profileId: 'hydralisk', models: 1, upgrades: [{ id: 'lurking' }], at: { x: 0, z: -6 } })
    let s = duelState(b)
    s = { ...s, units: { ...s.units, [hy.unit.id]: hy.unit }, models: { ...s.models, ...Object.fromEntries(hy.models.map((m) => [m.id, m])) } }
    s = setStatus(s, b, 'B-hydra', 'STATIONARY', 'gain', 'rule:stationary')
    const shot = (id: string) => ({ unitId: 'A-marines', targetUnitId: 'B-hydra', seat: 'A', value: 0, batch: { id, kind: 'ranged', keywords: [] } as unknown as AttackBatch })
    const one = runHook(s, b, 'beforeEvadeRoll', shot('b1'))
    expect(one.value).toBeGreaterThan(0) // may evade the first shot
    expect(runHook(one.state, b, 'beforeEvadeRoll', { ...shot('b1'), foldOnly: true }).value).toBeGreaterThan(0)
    expect(runHook(one.state, b, 'beforeEvadeRoll', shot('b2')).value).toBe(0) // the second shot of the Round: no
  })

  it('MOD-007 `first: activation` limits Ancillary Carapace TOUGH to the first Armour Roll of an Activation', () => {
    const hy = squad(b, { id: 'B-hydra', owner: 'B', profileId: 'hydralisk', models: 1, upgrades: [{ id: 'ancillary-carapace' }], at: { x: 0, z: -6 } })
    let s = duelState(b)
    s = { ...s, activeUnit: 'A-marines', units: { ...s.units, [hy.unit.id]: hy.unit }, models: { ...s.models, ...Object.fromEntries(hy.models.map((m) => [m.id, m])) } }
    const roll = (id: string) => ({ unitId: 'A-marines', targetUnitId: 'B-hydra', seat: 'A', batch: { id, kind: 'ranged', keywords: [] } as unknown as AttackBatch })
    const toughs = (st: GameState) => st.units['B-hydra']!.effects.filter((e) => e.kind === 'keyword' && e.kw?.kw === 'TOUGH').length
    const one = runHook(s, b, 'beforeArmourRoll', roll('b1')).state
    expect(toughs(one)).toBe(1)
    const two = runHook(one, b, 'beforeArmourRoll', roll('b2')).state
    expect(toughs(two)).toBe(1)
    // the next Activation starts over
    expect(toughs(runHook({ ...two, activeUnit: 'B-hydra' }, b, 'beforeArmourRoll', roll('b3')).state)).toBe(2)
  })

  it('SUP-007 a supplyOverride that only sets a floor (Freedom Fighters) still raises Supply to that floor', () => {
    let s = duelState(b)
    s = addEffect(s, 'B-zerglings', { source: 'freedom-fighters', kind: 'mod', expires: 'endOfRound', bySeat: 'B', round: 1, data: { op: 'supplyOverride', purposes: ['contest', 'objectives'], floor: 1 } })
    expect(runHook(s, b, 'supplyMods', { unitId: 'B-zerglings', purpose: 'control', value: 0 }).value).toBe(1)
    expect(runHook(s, b, 'supplyMods', { unitId: 'B-zerglings', purpose: 'pool', value: 0 }).value).toBe(0)
  })

  it('ST-008 a Ready Creep Card gives its tumors STAY IN PLAY and DISPLACEMENT; an Exhausted one does not', () => {
    const s = { ...duelState(b), cards: { A: [], B: [{ id: 'accelerating-creep', kind: 'creep' as const, exhausted: false, resource: null, usage: {} }] } } as unknown as GameState
    const tumor = { defId: 'creep-tumor', owner: 'B' }
    expect(tokenGrants(s, b, tumor, 'STAY_IN_PLAY')).toBe(true)
    expect(tokenGrants(s, b, tumor, 'DISPLACEMENT')).toBe(true)
    expect(tokenGrants(s, b, { defId: 'shade', owner: 'B' }, 'STAY_IN_PLAY')).toBe(false)
    expect(tokenGrants(s, b, { defId: 'creep-tumor', owner: 'A' }, 'STAY_IN_PLAY')).toBe(false)
    const tired = { ...s, cards: { A: [], B: [{ ...s.cards.B![0]!, exhausted: true }] } }
    expect(tokenGrants(tired, b, tumor, 'STAY_IN_PLAY')).toBe(false)
  })
})
