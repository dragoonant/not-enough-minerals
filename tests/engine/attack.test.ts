// Tests for src/engine/attack.ts (owner A). Names follow docs/spec/12-rules-test-checklist.md IDs.
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { KwRef, WeaponProfile } from '../../src/data/types'
import { buildBatch, hitsBatch, impactBatch, resolveBatch } from '../../src/engine/attack'
import { requireUnitDef, weaponDef } from '../../src/engine/edition'
import { isRejection } from '../../src/engine/errors'
import type { AttackBatch, AttackStep, GameState } from '../../src/engine/types'
import { bundle, duelState, squad, withForcedDice } from './helpers'

// ---- stand-ins for the services other rules owners are building in parallel (printed data only) ----
// effects, visibility, engage, squads, supply, hooks, movement and query are mocked so this file tests owner A's modules alone.
/* eslint-disable @typescript-eslint/no-explicit-any */
const ctl = vi.hoisted(() => ({
  kw: {} as Record<string, { kw: string; x?: number; y?: number; tag?: string }[]>,
  status: {} as Record<string, string[]>,
  cover: 'none',
  hidden: [] as string[],
  hooks: {} as Record<string, (s: any, ctx: any) => any>,
  repo: null as null | ((state: any, unitId: string, spec: any) => any),
}))
vi.mock('../../src/engine/effects', async (orig) => {
  const ed = await import('../../src/engine/edition')
  const def = (s: any, b: any, id: string) => ed.requireUnitDef(b, s.units[id].profileId)
  return {
    ...(await orig<object>()),
    statOf: (s: any, b: any, id: string, stat: string) => {
      const d = def(s, b, id)
      if (stat === 'speed') { const sp = d.stats.speed; return Array.isArray(sp) ? sp[0] : sp }
      return (d.stats as any)[stat] ?? null
    },
    weaponProfile: (s: any, b: any, id: string, w: string) => ed.weaponDef(def(s, b, id), w) ?? null,
    keywordOf: (_s: any, _b: any, id: string, kw: string) => ctl.kw[id]?.find((k) => k.kw === kw) ?? null,
    hasStatus: (_s: any, id: string, st: string) => ctl.status[id]?.includes(st) ?? false,
  }
})
vi.mock('../../src/engine/hooks', async (orig) => ({
  ...(await orig<object>()),
  runHook: (s: any, _b: any, point: string, ctx: any) => ctl.hooks[point]?.(s, ctx) ?? { state: s, mods: [], ...(ctx.value !== undefined ? { value: ctx.value } : {}) },
}))
vi.mock('../../src/engine/squads', async (orig) => ({
  ...(await orig<object>()),
  unitModels: (s: any, id: string, o: { includeDead?: boolean } = {}) =>
    s.units[id].modelIds.map((m: string) => s.models[m]).filter((m: any) => m && (o.includeDead || (m.life === 'active' && !m.offTable))),
}))
vi.mock('../../src/engine/visibility', async (orig) => {
  const live = (s: any, id: string): string[] => s.units[id].modelIds.filter((m: string) => s.models[m].life === 'active')
  return {
    ...(await orig<object>()),
    visibleModels: (s: any, _b: any, _o: string, t: string) => (ctl.hidden.includes(t) ? [] : live(s, t)),
    canTarget: (s: any, _b: any, _a: string, t: string) => ({ ok: !ctl.hidden.includes(t), reasons: ['noLos'], models: ctl.hidden.includes(t) ? [] : live(s, t) }),
    canSee: () => true,
  }
})
vi.mock('../../src/engine/engage', async (orig) => {
  const m = await import('../../src/engine/measure')
  const eng = (s: any, a: string, b: string) => {
    const A = s.models[a], B = s.models[b]
    return !!A && !!B && A.owner !== B.owner && A.life === 'active' && B.life === 'active' && m.modelDistance(A, B) <= 1 + 1e-6
  }
  const engagedWith = (s: any, _b: any, u: string): string[] =>
    Object.values<any>(s.units).filter((o) => o.owner !== s.units[u].owner && o.location === 'table' && o.modelIds.some((x: string) => s.units[u].modelIds.some((y: string) => eng(s, y, x)))).map((o) => o.id)
  return { ...(await orig<object>()), modelsEngaged: (s: any, _b: any, a: string, b: string) => eng(s, a, b), engagedWith, isEngaged: (s: any, b: any, u: string) => engagedWith(s, b, u).length > 0 }
})
vi.mock('../../src/engine/supply', async (orig) => {
  const ed = await import('../../src/engine/edition')
  const csv = (s: any, b: any, id: string) => ed.bracketSupply(ed.requireUnitDef(b, s.units[id].profileId), s.units[id].modelIds.filter((m: string) => s.models[m].life === 'active').length)
  return {
    ...(await orig<object>()),
    supplyFor: (s: any, b: any, id: string) => csv(s, b, id),
    recordSupplyLoss: (s: any, b: any, id: string, before: number) => {
      const u = s.units[id]
      const lost = u.summoned ? 0 : Math.max(0, before - csv(s, b, id))
      return { ...s, seats: { ...s.seats, [u.owner]: { ...s.seats[u.owner], supplyLostThisRound: s.seats[u.owner].supplyLostThisRound + lost } } }
    },
  }
})
vi.mock('../../src/engine/query', async (orig) => ({ ...(await orig<object>()), coverFor: () => ctl.cover }))
vi.mock('../../src/engine/movement', async (orig) => ({
  ...(await orig<object>()),
  reposition: (s: any, _b: any, id: string, spec: any) => (ctl.repo ? ctl.repo(s, id, spec) : { code: 'E_PATH_BLOCKED', message: 'no mock' }),
}))
/* eslint-enable @typescript-eslint/no-explicit-any */

const b = bundle()
const rifle = weaponDef(requireUnitDef(b, 'marine'), 'c-14-rifle')!
type Ev = { type: string; step?: string; [k: string]: unknown }

beforeEach(() => {
  for (const k of Object.keys(ctl.kw)) delete ctl.kw[k]
  for (const k of Object.keys(ctl.status)) delete ctl.status[k]
  for (const k of Object.keys(ctl.hooks)) delete ctl.hooks[k]
  ctl.hidden = []
  ctl.cover = 'none'
})

function addUnit(s: GameState, spec: Parameters<typeof squad>[1]): GameState {
  const q = squad(b, spec)
  return { ...s, units: { ...s.units, [q.unit.id]: q.unit }, models: { ...s.models, ...Object.fromEntries(q.models.map((m) => [m.id, m])) } }
}
const live = (s: GameState, u: string): string[] => s.units[u]!.modelIds.filter((id) => s.models[id]!.life === 'active')
const stage = (s: GameState, step: string): Ev[] => (s.events as Ev[]).filter((e) => e.type === 'atk.stage' && e.step === step)

interface Opts { models?: number; profile?: WeaponProfile; target?: string; keywords?: KwRef[]; surge?: boolean; far?: number }
function batchFor(s: GameState, o: Opts = {}): AttackBatch {
  const n = o.models ?? 1
  const target = o.target ?? 'B-zerglings'
  const contributors = Array.from({ length: n }, (_, i) => ({ modelId: `A-marines.${i}`, far: i < (o.far ?? 0) }))
  return buildBatch(s, b, {
    seat: 'A', attackerUnitId: 'A-marines', profile: o.profile ?? rifle, kind: 'ranged', targetUnitId: target, contributors,
    eligible: null, ...(o.keywords ? { keywords: o.keywords } : {}), ...(o.surge === false ? { surge: false } : {}),
  })
}
/** Resolve a Batch with forced dice faces; melee.resume closes the attack so no other module is involved. */
function run(s: GameState, batch: AttackBatch, faces: number[], entry: AttackStep = 'hit'): GameState {
  const eligible = live(s, batch.targetUnitId)
  const r = resolveBatch(withForcedDice({ ...s, activeUnit: 'A-marines' }, faces), b, { ...batch, eligible: batch.eligible ?? eligible }, entry, 'melee')
  if (isRejection(r)) throw new Error(r.message)
  return r.state
}
const duel = (o: Parameters<typeof duelState>[1] = {}): GameState => duelState(b, o)

describe('attack pipeline (owner A)', () => {
  it('ATK-040 each model rolls RoA dice at the Hit TN; hits go on, misses are dropped', () => {
    const s = duel({ marines: 1, zerglings: 2 })
    const batch = batchFor(s)
    expect(batch.dieGroups).toEqual([{ count: 2, hitTN: 3, modelIds: ['A-marines.0'] }])
    const out = run(s, batch, [6, 2, 5])
    expect(stage(out, 'hit')[0]).toMatchObject({ hits: 1, groups: [{ count: 2, tn: 3, faces: [6, 2] }] })
    expect(live(out, 'B-zerglings')).toHaveLength(1)
    expect(out.attack).toBeNull()
  })

  it('ATK-042 PRECISION promotes failed dice to hits that Surge can use', () => {
    const s = duel({ marines: 1, zerglings: 2 })
    const plain = run(s, batchFor(s), [2, 2, 1])
    expect(live(plain, 'B-zerglings')).toHaveLength(2)
    const prec = run(s, batchFor(s, { keywords: [{ kw: 'PRECISION', x: 1 }] }), [2, 2, 1])
    expect(stage(prec, 'hit')[0]).toMatchObject({ hits: 0, precision: 1 })
    expect(live(prec, 'B-zerglings')).toHaveLength(1)
  })

  it('HIT-004 LONG RANGE models roll as their own group at one TN worse, inside one Batch', () => {
    const s = duel({ marines: 2, zerglings: 2 })
    const batch = batchFor(s, { models: 2, far: 1, surge: false })
    expect(batch.dieGroups.map((g) => [g.count, g.hitTN])).toEqual([[2, 3], [2, 4]])
    const out = run(s, batch, [6, 6, 6, 6])
    expect(stage(out, 'hit')[0]!.groups).toHaveLength(2)
  })

  it('ATK-050 Surge moves dice only on a tag match, capped at the pool (SRG-001, SRG-002)', () => {
    let s = duel({ marines: 1, zerglings: 2 })
    s = addUnit(s, { id: 'B-roach', owner: 'B', profileId: 'roach', models: 2, at: { x: 6, z: -6 } })
    const hit = run(s, batchFor(s), [6, 6, 6])
    expect(stage(hit, 'surge')[0]).toMatchObject({ tagMatch: true, surgeMoved: 2 })
    const miss = run(s, batchFor(s, { target: 'B-roach' }), [6, 6, 6])
    expect(stage(miss, 'surge')[0]).toMatchObject({ tagMatch: false, surgeMoved: 0 })
  })

  it('SRG-003 CRITICAL HIT moves dice after Surge, and DODGE is one budget spent on Surge first (SRG-004)', () => {
    const s = duel({ marines: 2, zerglings: 8 })
    const kws: KwRef[] = [{ kw: 'CRITICAL_HIT', x: 2 }]
    const plain = run(s, batchFor(s, { models: 2, keywords: kws }), [6, 6, 6, 6, 2])
    expect(stage(plain, 'surge')[0]).toMatchObject({ surgeMoved: 1, critMoved: 2 })
    ctl.kw['B-zerglings'] = [{ kw: 'DODGE', x: 1 }]
    const dodged = run(s, batchFor(s, { models: 2, keywords: kws }), [6, 6, 6, 6, 2])
    expect(stage(dodged, 'surge')[0]).toMatchObject({ surgeMoved: 0, critMoved: 2 })
  })

  it('ATK-060 the defender rolls Armour; TOUGH turns failed results into saves (ARM-001, ARM-002)', () => {
    const s = duel({ marines: 1, zerglings: 8 })
    const base = run(s, batchFor(s, { surge: false }), [6, 6, 5, 5])
    expect(stage(base, 'armour')[0]).toMatchObject({ tn: 6, toDamage: 2 })
    expect(live(base, 'B-zerglings')).toHaveLength(6)
    ctl.kw['B-zerglings'] = [{ kw: 'TOUGH', x: 1 }]
    const tough = run(s, batchFor(s, { surge: false }), [6, 6, 5, 5])
    expect(stage(tough, 'armour')[0]).toMatchObject({ tough: 1, toDamage: 1 })
    expect(live(tough, 'B-zerglings')).toHaveLength(7)
  })

  it('ATK-070 an Engaged target of a Ranged Attack Evades; ANTI-EVADE raises its TN; Evade "-" never rolls (EVD-001, EVD-003, EVD-005)', () => {
    let s = duel({ marines: 1, zerglings: 3, gap: 2 })
    const base = run(s, batchFor(s, { surge: false }), [6, 6, 5, 5, 3, 4])
    expect(stage(base, 'evade')[0]).toMatchObject({ eligible: true, tn: 4, evaded: 1, remaining: 1 })
    expect(live(base, 'B-zerglings')).toHaveLength(2)
    const anti = run(s, batchFor(s, { surge: false, keywords: [{ kw: 'ANTI_EVADE', x: 1 }] }), [6, 6, 5, 5, 3, 4])
    expect(stage(anti, 'evade')[0]).toMatchObject({ tn: 5, evaded: 0 })
    expect(live(anti, 'B-zerglings')).toHaveLength(1)
    // A HIDDEN Siege Tank has Evade "-": the grant exists but no roll is made.
    s = addUnit(duel({ marines: 1, zerglings: 1 }), { id: 'B-tank', owner: 'B', profileId: 'siege-tank', models: 1, at: { x: 8, z: -6 } })
    ctl.status['B-tank'] = ['HIDDEN']
    const tank = run(s, batchFor(s, { target: 'B-tank', surge: false }), [6, 6, 1, 1])
    expect(stage(tank, 'evade')[0]).toMatchObject({ eligible: false })
  })

  it('ATK-080 PIERCE sets DMG for the tag; Total Damage adds the old marker; leftover is recorded', () => {
    let s = duel({ marines: 1, zerglings: 1 })
    s = addUnit(s, { id: 'B-roach', owner: 'B', profileId: 'roach', models: 2, at: { x: 6, z: -6 } })
    const plain = run(s, batchFor(s, { target: 'B-roach', surge: false }), [6, 6, 1, 1])
    expect(stage(plain, 'damage')[0]).toMatchObject({ perDie: 1, total: 2 })
    expect(plain.units['B-roach']!.damage).toBe(2)
    const pierce = run(s, batchFor(s, { target: 'B-roach', surge: false, keywords: [{ kw: 'PIERCE', tag: 'armoured', x: 2 }] }), [6, 6, 1, 1])
    expect(stage(pierce, 'damage')[0]).toMatchObject({ perDie: 2, total: 4 })
    expect(live(pierce, 'B-roach')).toHaveLength(1)
    const marked = { ...s, units: { ...s.units, 'B-roach': { ...s.units['B-roach']!, damage: 1 } } }
    const carry = run(marked, batchFor(marked, { target: 'B-roach', surge: false }), [6, 6, 1, 1])
    expect(stage(carry, 'damage')[0]).toMatchObject({ marker: 1, total: 3 })
    expect(carry.units['B-roach']!.damage).toBe(3)
  })

  it('ATK-090 HITS puts dice straight into the Armour Pool with no Surge', () => {
    const s = duel({ marines: 1, zerglings: 8 })
    const batch = hitsBatch(s, b, { seat: 'A', sourceId: 'photon-overcharge', targetUnitId: 'B-zerglings', x: 3, dmg: 1 })
    expect(batch.kind).toBe('hits')
    const out = run(s, batch, [5, 5, 6], 'armour')
    expect(stage(out, 'hit')).toHaveLength(0)
    expect(stage(out, 'surge')).toHaveLength(0)
    expect(live(out, 'B-zerglings')).toHaveLength(6)
  })

  it('ATK-091 IMPACT hit rolls are Tests: TN clamps to 2+, a natural 1 always fails and HIDDEN is immune (ATK-092)', () => {
    const s = duel({ marines: 1, zerglings: 4 })
    const opts = { seat: 'A', sourceId: 'devastating-charge', attackerUnitId: 'A-marines', targetUnitId: 'B-zerglings' }
    const a = impactBatch(withForcedDice(s, [1, 3, 6]), b, { ...opts, dice: 3, y: 3 })
    expect(a.batch?.dieGroups[0]!.count).toBe(2)
    expect(a.batch?.dmg).toBe(1)
    const c = impactBatch(withForcedDice(s, [1, 2]), b, { ...opts, dice: 2, y: 1 })
    expect(c.batch?.dieGroups[0]!.count).toBe(1)
    ctl.status['B-zerglings'] = ['HIDDEN']
    expect(impactBatch(s, b, { ...opts, dice: 2, y: 3 }).batch).toBeNull()
  })

  it('ATK-033 hook protocol: attackMods may remove dice and ease the Hit TN; reduceDamage folds Total Damage', () => {
    const s = duel({ marines: 1, zerglings: 8 })
    ctl.hooks.attackMods = (st, ctx) => ({ state: st, mods: [{ source: 'x', label: 'x', value: 1, mode: 'add' }], value: ctx.value - 1 })
    ctl.hooks.reduceDamage = (st, ctx) => ({ state: st, mods: [], value: ctx.cause === 'total' ? Math.max(0, ctx.value - 1) : ctx.value })
    const out = run(s, batchFor(s, { surge: false }), [2, 1, 1])
    expect(stage(out, 'hit')[0]).toMatchObject({ groups: [{ count: 1, tn: 2, faces: [2] }] })
    expect(stage(out, 'damage')[0]).toMatchObject({ dice: 1, total: 0 })
    expect(live(out, 'B-zerglings')).toHaveLength(8)
  })
})
