import { describe, expect, it } from 'vitest'
import { formatError, isWarning, validateBundle } from './validate'
import { emptyBundle } from './bundle'
import { mergedCostTable } from './query'
import type { EditionBundle, UnitDef } from './types'
import { validateDataDir } from '../../tools/validate-data'
import { loadBundle } from '../../tools/sim-core'
import { createDemoGame } from '../engine/setup'

const real = (): EditionBundle => loadBundle('sc-2026-10')
const clone = <T,>(x: T): T => JSON.parse(JSON.stringify(x)) as T
/** The real edition with one edit applied, for negative checks. */
function mutated(edit: (b: EditionBundle) => void): string[] {
  const b = clone(real())
  edit(b)
  return validateBundle(b).filter((e) => !isWarning(e)).map((e) => `${e.id} ${e.path}: ${e.message}`)
}
/** The Terran cost record (records are loaded in file order, so index 0 is not stable). */
const terranCt = (b: EditionBundle) => b.records.costs.find((c) => c.id === 'ct-2026-10-terran')!
const marine = (b: EditionBundle) => b.records.units.find((u) => u.id === 'marine') as UnitDef

describe('data', () => {
  it('DATA-001 every record on disk validates', () => {
    expect(validateDataDir().filter((e) => !isWarning(e)).map(formatError)).toEqual([])
  })

  it('DATA-002 ids are unique, kebab-case and every record cites a source', () => {
    const b = emptyBundle('fixture')
    const hook = { id: 'fixture-hook', text: 'x', source: 'fixture' }
    b.records.hooks.push(hook, { ...hook })
    b.records.hooks.push({ id: 'Bad_Id', text: 'x', source: '' })
    const msgs = validateBundle(b).map((e) => `${e.id} ${e.path}: ${e.message}`)
    expect(msgs).toContain('fixture-hook id: duplicate id (2 records)')
    expect(msgs).toContain('Bad_Id id: must be kebab-case (a-z, 0-9, single hyphens)')
    expect(msgs).toContain('Bad_Id source: is required (string or non-empty array)')
  })

  it('DATA-003 the Marine exemplar carries split Speed, brackets, SPECIALIST + FOR upgrades', () => {
    const m = marine(real())
    expect(m.stats.speed).toEqual([4, 7])
    expect(m.supplyProfile.map((x) => x.supply)).toEqual([0, 1, 2])
    const agg = m.upgrades.find((u) => u.id === 'agg-12')!
    expect(agg.specialist && agg.replaces).toBe('c-14-rifle')
    expect(m.upgrades.find((u) => u.id === 'rocket-launcher')!.weapon!.keywords.map((k) => k.kw)).toContain('SIDEARM')
  })

  it('COST-002 every buyable unit and upgrade has a CT price, and CT Supply matches the card bracket', () => {
    const ct = mergedCostTable(real())!
    expect(ct.table).toBe('ct-2026-10')
    expect(ct.units.marine.compositions.map((c) => c.minerals)).toEqual([170, 220])
    expect(mutated((b) => { terranCt(b).units.marine.compositions[0].supply = 2 }))
      .toContain('ct-2026-10-terran units.marine.compositions[0].supply: CT says 2, the card bracket 4-6 says 1')
    expect(mutated((b) => { delete terranCt(b).units.marine.upgrades.bayonet }))
      .toContain('ct-2026-10-terran units.marine.upgrades: upgrade "bayonet" has no CT price')
    expect(mutated((b) => { terranCt(b).units = {} })).toContain('marine cost: has no row in the cost table')
  })

  it('DATA-004 keywords, effect ops, statuses and hooks must resolve', () => {
    const errs = mutated((b) => {
      const m = marine(b)
      m.weapons[0].keywords.push({ kw: 'LONG_RANGE' }, { kw: 'NOT_A_KEYWORD' })
      m.abilities[0].effects.push({ op: 'buff', char: 'speed', x: 1, colour: 'red' }, { op: 'code', code: 'no-such-hook' })
      m.weapons[1].requiresStatus = 'SLEEPY'
    })
    expect(errs).toEqual(expect.arrayContaining([
      'marine weapons[0].keywords[0].x: LONG_RANGE needs "x"',
      'marine weapons[0].keywords[1].kw: unknown keyword "NOT_A_KEYWORD" (add it to keywords.json)',
      'marine abilities[0].effects[4].colour: op "buff" has no field "colour" (spec 20 s2.2)',
      'marine abilities[0].effects[5].code: hook "no-such-hook" is not listed in hooks/<area>.json',
      'marine weapons[1].requiresStatus: unknown status "SLEEPY" (keywords.json kind "status")',
    ]))
  })

  it('DATA-005 Supply brackets are contiguous from 1 and never decrease; FOR names a default weapon', () => {
    const errs = mutated((b) => {
      const m = marine(b)
      m.supplyProfile = [{ min: 1, max: 3, supply: 1 }, { min: 5, max: 9, supply: 0 }]
      m.upgrades.find((u) => u.id === 'bayonet')!.replaces = 'sword'
    })
    expect(errs).toEqual(expect.arrayContaining([
      'marine supplyProfile[1].min: must be 4 (brackets are contiguous from 1)',
      'marine supplyProfile[1].supply: Supply never decreases as models increase',
      'marine upgrades[5].replaces: "sword" is not a default weapon on this card',
    ]))
  })

  it('SETUP-002 the demo game fields a 6-model Marine squad from data', () => {
    const g = createDemoGame('m', real())
    const marines = Object.values(g.models).filter((m) => m.profileId === 'marine')
    expect(marines).toHaveLength(6)
    expect(new Set(marines.map((m) => m.base))).toEqual(new Set([32]))
  })
})
