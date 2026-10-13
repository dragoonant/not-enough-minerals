// Tests for src/engine/shooting.ts (owner A). Names follow docs/spec/12-rules-test-checklist.md IDs.
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { isRejection } from '../../src/engine/errors'
import { declareBatch, planBatches, shooting } from '../../src/engine/shooting'
import type { GameState, Rejection } from '../../src/engine/types'
import { bundle, duelState, squad, withForcedDice } from './helpers'

// ---- stand-ins for the services other rules owners are building in parallel (printed data only) ----
// effects, visibility, engage, squads, supply, hooks, movement and query are mocked so this file tests owner A's modules alone.
/* eslint-disable @typescript-eslint/no-explicit-any */
const ctl = vi.hoisted(() => ({
  kw: {} as Record<string, { kw: string; x?: number; y?: number; tag?: string }[]>,
  status: {} as Record<string, string[]>,
  cover: 'none',
  hidden: [] as string[],
  vis: null as null | string[],
  blind: [] as string[],
  wkw: {} as Record<string, { kw: string; x?: number; y?: number }[]>,
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
    weaponProfile: (s: any, b: any, id: string, w: string) => { const p: any = ed.weaponDef(def(s, b, id), w) ?? null; return p && ctl.wkw[w] ? { ...p, keywords: [...p.keywords, ...ctl.wkw[w]] } : p },
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
    visibleModels: (s: any, _b: any, _o: string, t: string) => (ctl.hidden.includes(t) ? [] : ctl.vis ? live(s, t).filter((m) => ctl.vis!.includes(m)) : live(s, t)),
    canTarget: (s: any, _b: any, _a: string, t: string) => ({ ok: !ctl.hidden.includes(t), reasons: ['noLos'], models: ctl.hidden.includes(t) ? [] : ctl.vis ? live(s, t).filter((m) => ctl.vis!.includes(m)) : live(s, t) }),
    canSee: (_s: any, _b: any, a: string) => !ctl.blind.includes(a),
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
type Ev = { type: string; step?: string; batchId?: string; [k: string]: unknown }

beforeEach(() => {
  for (const k of Object.keys(ctl.kw)) delete ctl.kw[k]
  for (const k of Object.keys(ctl.status)) delete ctl.status[k]
  for (const k of Object.keys(ctl.hooks)) delete ctl.hooks[k]
  ctl.hidden = []
  ctl.vis = null
  ctl.blind = []
  for (const k of Object.keys(ctl.wkw)) delete ctl.wkw[k]
  ctl.cover = 'none'
})

function addUnit(s: GameState, spec: Parameters<typeof squad>[1], place?: Record<number, [number, number]>): GameState {
  const q = squad(b, spec)
  const models = q.models.map((m, i) => (place?.[i] ? { ...m, pos: { x: place[i]![0], z: place[i]![1] } } : m))
  return { ...s, units: { ...s.units, [q.unit.id]: q.unit }, models: { ...s.models, ...Object.fromEntries(models.map((m) => [m.id, m])) } }
}
const arm = (s: GameState, unit: string, weapons: (i: number) => string[]): GameState => ({
  ...s, models: { ...s.models, ...Object.fromEntries(s.units[unit]!.modelIds.map((id, i) => [id, { ...s.models[id]!, weapons: weapons(i) }])) },
})
const stages = (s: GameState, step: string): Ev[] => (s.events as Ev[]).filter((e) => e.type === 'atk.stage' && e.step === step)
const ok = <T>(r: T | Rejection): T => { if (isRejection(r)) throw new Error(`${r.code}: ${r.message}`); return r }
const duel = (o: Parameters<typeof duelState>[1] = {}): GameState => ({ ...duelState(b, o), activeUnit: 'A-marines' })

describe('Ranged Attack action (owner A)', () => {
  it('ATK-010 a target needs a Visible model in range; ATK-012 friends are never targets; ATK-001 the Disengage penalty bars the action', () => {
    const s = addUnit(duel(), { id: 'A-friend', owner: 'A', profileId: 'marine', models: 2, at: { x: 10, z: 6 } }, { 0: [10, 6], 1: [12, 6] })
    expect(planBatches(s, b, 'A-marines')).toEqual([{ weaponId: 'c-14-rifle', modelIds: s.units['A-marines']!.modelIds, targets: ['B-zerglings'] }])
    ctl.hidden = ['B-zerglings']
    expect(planBatches(s, b, 'A-marines')).toEqual([])
    ctl.hidden = []
    const far = duel({ gap: 40 })
    expect(planBatches(far, b, 'A-marines')).toEqual([])
    const barred = { ...s, units: { ...s.units, 'A-marines': { ...s.units['A-marines']!, noShootChargeRound: 1 } } }
    expect(planBatches(barred, b, 'A-marines')).toEqual([])
    expect(shooting.options(barred, b, 'A-marines')).toEqual([])
    expect(shooting.options(s, b, 'A-marines').map((o) => o.action.type)).toEqual(['shoot.go'])
    expect(shooting.options({ ...s, roundPhase: 'movement' }, b, 'A-marines')).toEqual([])
  })

  it('ATK-011 an Engaged shooter picks only its engagers; an Unengaged shooter cannot pick an Engaged target', () => {
    // Zn touches the marines; Zf is far away.
    let s = addUnit(duel({ zerglings: 1, gap: 12 }), { id: 'Zn', owner: 'B', profileId: 'zergling', models: 1, at: { x: -1.5, z: 6 } }, { 0: [-1.76, 6 - 32 / 25.4] })
    s = addUnit(s, { id: 'Zf', owner: 'B', profileId: 'zergling', models: 1, at: { x: 8, z: -2 } }, { 0: [8, -2] })
    const engagedShooter = planBatches(s, b, 'A-marines')
    expect(engagedShooter.map((c) => c.targets)).toEqual([['Zn']])
    // A second friendly squad far from Zn: it must not pick Zn, which is Engaged with the marines.
    const lone = addUnit(s, { id: 'A2', owner: 'A', profileId: 'marine', models: 1, at: { x: 4, z: 2 } }, { 0: [4, 2] })
    expect(planBatches(lone, b, 'A2').flatMap((c) => c.targets).sort()).toEqual(['B-zerglings', 'Zf'])
  })

  it('ATK-020 only models in range add dice; HIT-004 LONG RANGE models roll in their own group; ATK-002 a fired profile is spent', () => {
    // Front row 11.5 in from the zerglings (inside 12), back row 13.3 in (outside 12, inside LONG RANGE 18).
    let s = arm(duel({ gap: 12.76, zerglings: 2 }), 'A-marines', () => ['c-14-rifle'])
    const rifle = ok(declareBatch(s, b, 'A-marines', 'c-14-rifle', 'B-zerglings'))
    expect(stages(rifle.state, 'hit')[0]!.groups).toEqual([{ count: 6, tn: 3, faces: expect.any(Array) }]) // 3 front models x RoA 2
    expect(planBatches(rifle.state, b, 'A-marines')).toEqual([])
    s = arm(duel({ gap: 12.76, zerglings: 2 }), 'A-marines', () => ['agg-12'])
    const agg = ok(declareBatch(s, b, 'A-marines', 'agg-12', 'B-zerglings'))
    expect(stages(agg.state, 'hit')[0]!.groups).toMatchObject([{ count: 6, tn: 3 }, { count: 6, tn: 4 }])
  })

  it('WPN-002 a SIDEARM is its own Batch on top of the one normal weapon, and may take a different target', () => {
    let s = arm(duel({ gap: 8, zerglings: 2 }), 'A-marines', (i) => (i === 0 ? ['c-14-rifle', 'rocket-launcher'] : ['c-14-rifle']))
    s = addUnit(s, { id: 'Zb', owner: 'B', profileId: 'zergling', models: 1, at: { x: 6, z: -2 } }, { 0: [6, -2] })
    const first = planBatches(s, b, 'A-marines')
    expect(first.map((c) => c.weaponId).sort()).toEqual(['c-14-rifle', 'rocket-launcher'])
    expect(first.find((c) => c.weaponId === 'rocket-launcher')!.modelIds).toEqual(['A-marines.0'])
    const afterRocket = ok(declareBatch(s, b, 'A-marines', 'rocket-launcher', 'Zb')).state
    expect(stages(afterRocket, 'hit')[0]!.batchId).toContain('rocket-launcher')
    const rest = planBatches(afterRocket, b, 'A-marines')
    expect(rest.map((c) => c.weaponId)).toEqual(['c-14-rifle'])
    expect(rest[0]!.modelIds).toHaveLength(6) // the rocket carrier still has its rifle shot
  })

  it('ATK-031 the action is a loop: pick a Batch, resolve it fully, plan again, finish when nothing is left', () => {
    const s = duel({ gap: 10 })
    const menu = ok(shooting.resolve(s, b, { type: 'shoot.go', decisionId: 'x', seat: 'A', unitId: 'A-marines' }))
    expect(menu.state.pending.kind).toBe('shoot.batch')
    const pick = menu.state.pending.options.find((o) => o.action.weaponId === 'c-14-rifle')!
    expect(menu.state.pending.options.some((o) => o.action.done === true)).toBe(true)
    const out = ok(shooting.resolve(withForcedDice(menu.state, [6, 6, 6, 6, 6, 6, 6, 6, 6, 6, 6, 6]), b, pick.action))
    expect(out.done).toMatchObject({ type: 'shoot.go', unitId: 'A-marines', triggers: [{ kind: 'rangedAttack' }] })
    expect(out.state.attack).toBeNull()
    // Declaring a spent profile again is refused, not thrown.
    expect(isRejection(shooting.resolve(out.state, b, pick.action))).toBe(true)
  })

  it('TPL-003 a Blast Template Batch gets dice from the models it covers plus the RoA bonus; other covered units are Spillover (TPL-005)', () => {
    let s = duel({ zerglings: 4, marines: 1 })
    s = addUnit(s, { id: 'A-tank', owner: 'A', profileId: 'siege-tank', models: 1, at: { x: 0, z: 9 } }, { 0: [0, 9] })
    s = addUnit(s, { id: 'B-roach', owner: 'B', profileId: 'roach', models: 1, at: { x: 0, z: -7.8 } }, { 0: [0, -7.8] })
    s = { ...s, activeUnit: 'A-tank' }
    // Without SIEGE MODE the Shock Cannon is unusable (ATK-003).
    expect(planBatches(s, b, 'A-tank').map((c) => c.weaponId)).not.toContain('shock-cannon')
    ctl.status['A-tank'] = ['SIEGE_MODE']
    expect(planBatches(s, b, 'A-tank').map((c) => c.weaponId)).toContain('shock-cannon')
    const ask = ok(declareBatch(s, b, 'A-tank', 'shock-cannon', 'B-zerglings'))
    expect(ask.state.pending.kind).toBe('shoot.template')
    const aim = ask.state.pending.options.find((o) => o.action.modelId === 'B-zerglings.1')!
    const out = ok(shooting.resolve(ask.state, b, aim.action))
    const hits = stages(out.state, 'hit')
    // Zerglings .0, .1 and .2 are under the template: 3 + 4 dice. The Roach is covered too: one Spillover die.
    expect(hits[0]!.groups).toMatchObject([{ count: 7, tn: 4 }])
    expect(hits[1]!.batchId).toContain(':spill:B-roach')
    expect(hits[1]!.groups).toMatchObject([{ count: 1 }])
  })

  it('VIS-023 a BURROWED unit cannot make a Ranged Attack', () => {
    const s = duel()
    expect(planBatches(s, b, 'A-marines')).not.toEqual([])
    ctl.status['A-marines'] = ['BURROWED']
    expect(planBatches(s, b, 'A-marines')).toEqual([])
    expect(shooting.options(s, b, 'A-marines')).toEqual([])
  })

  it('ATK-020 a model with no Line of Sight of its own adds no dice, even when a squad mate sees the target', () => {
    ctl.blind = ['A-marines.0', 'A-marines.1', 'A-marines.2']
    const out = ok(declareBatch(arm(duel({ gap: 8 }), 'A-marines', () => ['c-14-rifle']), b, 'A-marines', 'c-14-rifle', 'B-zerglings'))
    expect(stages(out.state, 'hit')[0]!.groups).toEqual([{ count: 6, tn: 3, faces: expect.any(Array) }]) // 3 seeing models x RoA 2, not 6
  })

  it('ATK-014 INDIRECT FIRE ignores Line of Sight for damage: models that are not Visible can still be removed', () => {
    ctl.wkw['c-14-rifle'] = [{ kw: 'INDIRECT_FIRE' }]
    ctl.vis = ['B-zerglings.0']
    const s = withForcedDice(arm(duel({ zerglings: 3 }), 'A-marines', () => ['c-14-rifle']), [...Array(12).fill(6), ...Array(40).fill(1)])
    const out = ok(declareBatch(s, b, 'A-marines', 'c-14-rifle', 'B-zerglings'))
    const removed = (out.state.events as Ev[]).filter((e) => e.type === 'atk.removed').flatMap((e) => e.modelIds as string[])
    expect(removed.some((id) => id !== 'B-zerglings.0')).toBe(true)
  })
})
