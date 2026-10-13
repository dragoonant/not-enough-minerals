import { describe, expect, it } from 'vitest'
import type { ArmyListDef } from '../../src/data/types'
import { armyCost, musterArmy, slotLedger, validateArmy } from '../../src/engine/army'
import { bundle } from './helpers'

const b = bundle()
const list = (o: Partial<ArmyListDef> & Pick<ArmyListDef, 'faction' | 'units'>): ArmyListDef =>
  ({ id: 't', name: 't', scale: 'standard', cards: [], source: 'test', ...o })
const codes = (l: ArmyListDef) => validateArmy(b, l).map((e) => e.code)

/** The R p.75 Raynor's Raiders example re-costed under the 10.2026 Cost Table (spec 15 s10). */
const golden = list({
  faction: 'raynors-raiders',
  units: [
    { unit: 'marine', models: 9, upgrades: [] }, { unit: 'marine', models: 9, upgrades: [] }, { unit: 'marine', models: 6, upgrades: [] },
    { unit: 'marauder', models: 4, upgrades: [] }, { unit: 'marauder', models: 2, upgrades: [] }, { unit: 'jim-raynor', models: 1, upgrades: [] },
    { unit: 'medic', models: 3, upgrades: [] }, { unit: 'medic', models: 3, upgrades: [] }, { unit: 'goliath', models: 1, upgrades: [] },
  ],
  cards: ['barracks', 'barracks-proxy', 'factory', 'orbital-command', 'academy', 'engineering-bay'],
})

describe('army building and costs (spec 15 s9-11)', () => {
  it('ARMY-030 the golden list costs 1760 minerals and 195 gas and is valid', () => {
    expect(armyCost(b, golden)).toMatchObject({ minerals: 1760, gas: 195 })
    expect(validateArmy(b, golden)).toEqual([])
    const l = slotLedger(b, golden)
    expect(l.used).toEqual({ core: 8, elite: 2, support: 2, air: 0, hero: 1 })
    expect(l.granted).toEqual({ core: 8, elite: 2, support: 3, air: 1, hero: 1 })
  })

  it('COST-001 changelog prices come from the Cost Table (Marine 170/220, Artanis 270, Adept 160)', () => {
    const one = (faction: string, unit: string, models: number) => armyCost(b, list({ faction, units: [{ unit, models, upgrades: [] }] })).minerals
    expect(one('raynors-raiders', 'marine', 6)).toBe(170)
    expect(one('raynors-raiders', 'marine', 9)).toBe(220)
    expect(one('khalai', 'artanis', 1)).toBe(270)
    expect(one('khalai', 'adept', 4)).toBe(160)
  })

  it('ARMY-011 one foreign Faction Tag makes a Unit illegal', () => {
    const l = list({ faction: 'zerg-swarm', units: [{ unit: 'kerrigan-swarm-raptor', models: 6, upgrades: [] }], creepCard: 'accelerating-creep' })
    expect(codes(l)).toContain('unit.tags')
  })

  it('ARMY-013 a Zerg Faction Card needs exactly one Creep Card, a Terran one forbids it', () => {
    expect(codes(list({ faction: 'zerg-swarm', units: [] }))).toContain('creep.required')
    expect(codes(list({ faction: 'raynors-raiders', units: [], creepCard: 'accelerating-creep' }))).toContain('creep.forbidden')
  })

  it('ARMY-015 ARMY-018 only Composition Options exist and a UNIQUE Unit appears once', () => {
    const l = list({ faction: 'raynors-raiders', units: [{ unit: 'marine', models: 7, upgrades: [] }, { unit: 'jim-raynor', models: 1, upgrades: [] }, { unit: 'jim-raynor', models: 1, upgrades: [] }] })
    expect(codes(l)).toEqual(expect.arrayContaining(['unit.composition', 'unit.unique']))
  })

  it('ARMY-017 ARMY-001 minerals and gas are checked against the scale and never converted', () => {
    const big = list({ faction: 'raynors-raiders', scale: 'skirmish', units: golden.units, cards: golden.cards })
    expect(codes(big)).toEqual(expect.arrayContaining(['cost.minerals', 'cost.gas']))
    expect(validateArmy(b, big, 'standard')).toEqual([])
  })

  it('ARMY-023 SPECIALIST goes on one named model; two specialists need different models', () => {
    const ok = list({ faction: 'raynors-raiders', units: [{ unit: 'marine', models: 6, upgrades: [{ id: 'agg-12', model: 0 }, { id: 'rocket-launcher', model: 1 }] }] })
    expect(validateArmy(b, ok)).toEqual([])
    const clash = list({ faction: 'raynors-raiders', units: [{ unit: 'marine', models: 6, upgrades: [{ id: 'agg-12', model: 0 }, { id: 'rocket-launcher', model: 0 }] }] })
    expect(codes(clash)).toContain('upgrade.specialist')
    const noModel = list({ faction: 'raynors-raiders', units: [{ unit: 'marine', models: 6, upgrades: [{ id: 'agg-12' }] }] })
    expect(codes(noModel)).toContain('upgrade.specialist')
  })

  it('ARMY-022 ARMY-023 WPN-004 muster builds each model\'s loadout: FOR swaps, SPECIALIST adds on one model', () => {
    const l = list({ faction: 'raynors-raiders', units: [{ unit: 'marine', models: 6, upgrades: [{ id: 'agg-12', model: 0 }, { id: 'rocket-launcher', model: 1 }, { id: 'bayonet' }] }] })
    const m = musterArmy(b, 'A', l, 'A-u')
    expect(m.units.map((u) => u.id)).toEqual(['A-u1'])
    const w = (i: number) => m.models[i]!.weapons
    expect(w(0)).toEqual(['agg-12', 'bayonet'])
    expect(w(1)).toEqual(['c-14-rifle', 'bayonet', 'rocket-launcher'])
    expect(w(2)).toEqual(['c-14-rifle', 'bayonet'])
    expect(m.models.map((x) => x.id)).toEqual([0, 1, 2, 3, 4, 5].map((i) => `A-u1.${i}`))
  })

  it('SUP-030 a mustered army starts in Reserves with HP, Shield on the first model, cards Ready', () => {
    const l = list({ faction: 'khalai', units: [{ unit: 'zealot', models: 3, upgrades: [] }], cards: [] })
    const m = musterArmy(b, 'B', l, 'B-u')
    expect(m.units[0]).toMatchObject({ location: 'reserves', owner: 'B', activation: null, shielded: true, summoned: false })
    expect(m.models.every((x) => x.offTable === true && x.owner === 'B' && x.unitId === 'B-u1')).toBe(true)
    expect(m.models[0]!.hp).toBeGreaterThan(m.models[1]!.hp)
    expect(m.cards).toEqual([{ id: 'khalai', kind: 'faction', exhausted: false, resource: { res: 'PE', n: 1 }, usage: {} }])
  })

  it('ARMY-019 every shipped preset is a legal army apart from the two Terran lists CL-K1 left over the Skirmish limit', () => {
    const over: string[] = []
    for (const p of b.records.presets) {
      const errs = validateArmy(b, p)
      expect(errs.filter((e) => e.code !== 'cost.minerals'), p.id).toEqual([])
      if (errs.length) over.push(p.id)
    }
    // Recorded as an open data item: Terran Founders 1050 and Terran Starter 1020 minerals under the 10.2026 Cost Table.
    expect(over.sort()).toEqual(['terran-founders', 'terran-starter'])
  })
})
