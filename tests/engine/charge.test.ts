// Tests for src/engine/charge.ts (owner A). Names follow docs/spec/12-rules-test-checklist.md IDs.
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { charge, chargeNeeded, chargeTargets } from '../../src/engine/charge'
import { isRejection, reject } from '../../src/engine/errors'
import type { GameState, Rejection } from '../../src/engine/types'
import { modelDistance } from '../../src/engine/measure'
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
  ops: {} as Record<string, any[]>,
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
    effectOps: (_s: any, _b: any, id: string, op: string) => ctl.ops[`${id}:${op}`] ?? [],
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
const C = 32 / 25.4 // two 32 mm bases touching
type Ev = { type: string; [k: string]: unknown }

beforeEach(() => {
  for (const k of Object.keys(ctl.kw)) delete ctl.kw[k]
  for (const k of Object.keys(ctl.status)) delete ctl.status[k]
  for (const k of Object.keys(ctl.hooks)) delete ctl.hooks[k]
  ctl.hidden = []
  ctl.repo = null
  for (const k of Object.keys(ctl.ops)) delete ctl.ops[k]
})

const ok = <T>(r: T | Rejection): T => { if (isRejection(r)) throw new Error(`${r.code}: ${r.message}`); return r }
const duel = (o: Parameters<typeof duelState>[1] = {}): GameState => ({ ...duelState(b, o), activeUnit: 'A-marines' })
/** Mock reposition: legal when the path is within reach and ends inside Engagement Range of every target. */
function reach(state: GameState, _id: string, spec: Record<string, any>) {
  const m = state.models[spec.leaderId as string]!
  const end = { ...m, pos: spec.path[spec.path.length - 1] }
  const len = spec.path.reduce((n: number, p: { x: number; z: number }, i: number) => n + Math.hypot(p.x - (i ? spec.path[i - 1].x : m.pos.x), p.z - (i ? spec.path[i - 1].z : m.pos.z)), 0)
  const near = (spec.mustEngage as string[]).every((t) => state.units[t]!.modelIds.some((id) => modelDistance(end, state.models[id]!) <= 1 + 1e-6))
  if (len > spec.maxDist + 1e-6 || !near) return { code: 'E_OUT_OF_RANGE', message: 'short' }
  return { state: { ...state, models: { ...state.models, [m.id]: end } }, events: [], inCoherency: true, casualties: [] }
}
const stages = (s: GameState, step: string): Ev[] => (s.events as Ev[]).filter((e) => e.type === 'atk.stage' && e.step === step)
const act = (type: string, f: Record<string, unknown> = {}) => ({ type, decisionId: 'x', seat: 'A', unitId: 'A-marines', ...f })
const live = (s: GameState, u: string): string[] => s.units[u]!.modelIds.filter((id) => s.models[id]!.life === 'active')

/** Mock reposition: succeeds by standing the Leading Model in base contact with the first zergling. */
function stepIn(state: GameState, _id: string, spec: Record<string, unknown>) {
  const m = state.models[spec.leaderId as string]!
  const z = state.models['B-zerglings.0']!
  return { state: { ...state, models: { ...state.models, [m.id]: { ...m, pos: { x: z.pos.x, z: z.pos.z + C } } } }, events: [], inCoherency: true, casualties: [] }
}

describe('Charge (owner A)', () => {
  it('CHG-001 only Unengaged Ground units charge enemy Ground units; CHG-002 no Line of Sight is needed', () => {
    const s = duel()
    ctl.hidden = ['B-zerglings'] // not Visible and still a legal Charge target
    expect(chargeTargets(s, b, 'A-marines')).toEqual(['B-zerglings'])
    expect(chargeTargets({ ...s, units: { ...s.units, 'A-marines': { ...s.units['A-marines']!, noShootChargeRound: 1 } } }, b, 'A-marines')).toEqual([])
    expect(charge.options(s, b, 'A-marines').map((o) => o.action.type)).toEqual(['charge.go'])
    expect(charge.options({ ...s, roundPhase: 'movement' }, b, 'A-marines')).toEqual([])
    expect(chargeTargets(duel({ gap: 2 }), b, 'A-marines')).toEqual([]) // Engaged
    // A Flying enemy is never a target.
    const flyer = { ...b, records: { ...b.records, units: b.records.units.map((u) => (u.id === 'zergling' ? { ...u, combatTags: ['biological' as const, 'flying' as const] } : u)) } }
    expect(chargeTargets(s, flyer, 'A-marines')).toEqual([])
  })

  it('CHG-008 the roll needed is ceil(path - Speed), 1 at the least, null past a 6', () => {
    ctl.repo = reach // the planner dry-runs through movement.reposition; this stand-in accepts a path that ends in Engagement Range within reach
    expect(chargeNeeded(duel({ gap: 12 }), b, 'A-marines', ['B-zerglings'])).toBe(6) // 10.74 in gap, 1 in reach, Speed 4
    expect(chargeNeeded(duel({ gap: 8 }), b, 'A-marines', ['B-zerglings'])).toBe(2)
    expect(chargeNeeded(duel({ gap: 5 }), b, 'A-marines', ['B-zerglings'])).toBe(1)
    expect(chargeNeeded(duel({ gap: 20 }), b, 'A-marines', ['B-zerglings'])).toBeNull()
  })

  it('CHG-003 the Charge Roll is D6 + Speed and onChargeRoll may change it; CHG-004 success moves the unit, failure leaves it', () => {
    ctl.hooks.onChargeRoll = (st, ctx) => ({ state: st, mods: [], value: ctx.value - 1 })
    let seen: Record<string, unknown> | null = null
    ctl.repo = (st, id, spec) => { seen = spec; return stepIn(st, id, spec) }
    const s0 = duel({ gap: 6 })
    const targets = ok(charge.resolve(s0, b, act('charge.go')))
    expect(targets.state.pending.kind).toBe('charge.targets')
    const pick = targets.state.pending.options.find((o) => (o.action.targetIds as string[]).join() === 'B-zerglings')!
    const path = ok(charge.resolve(withForcedDice(targets.state, [5]), b, pick.action))
    expect(path.state.pending.kind).toBe('charge.path')
    expect(path.state.pending.context.distance).toBe(5 + 4 - 1)
    const win = ok(charge.resolve(path.state, b, act('charge.path', { auto: true })))
    expect(seen).toMatchObject({ kind: 'charge', maxDist: 8, mustEngage: ['B-zerglings'], allowEngage: ['B-zerglings'] })
    expect(win.done).toMatchObject({ type: 'charge.go', triggers: [{ kind: 'charged' }] })
    expect((win.state.events as Ev[]).some((e) => e.type === 'charge.succeeded')).toBe(true)
    // Fail: the reposition is refused, so the unit does not move and the action still ends.
    ctl.repo = () => reject('E_TOO_FAR', 'short')
    const lose = ok(charge.resolve(path.state, b, act('charge.path', { auto: true })))
    expect(lose.done).toMatchObject({ type: 'charge.go', triggers: [] })
    expect(lose.state.models).toEqual(path.state.models)
    // An explicit path that is refused is reported to the player, who keeps the decision.
    expect(isRejection(charge.resolve(path.state, b, act('charge.path', { leaderId: 'A-marines.0', path: [{ x: 0, z: 0 }] })))).toBe(true)
  })

  it('ATK-091 IMPACT after the Charge makes X dice per ranked model, hits at Y+, and the successes go through Armour (CHG-006)', () => {
    ctl.kw['A-marines'] = [{ kw: 'IMPACT', x: 2, y: 3 }]
    ctl.repo = stepIn
    const s0 = duel({ gap: 6, zerglings: 4 })
    const t = ok(charge.resolve(s0, b, act('charge.go')))
    const pick = t.state.pending.options.find((o) => (o.action.targetIds as string[]).join() === 'B-zerglings')!
    const p = ok(charge.resolve(withForcedDice(t.state, [3, 1, 6, 5]), b, pick.action))
    const out = ok(charge.resolve(p.state, b, act('charge.path', { auto: true })))
    const stagesOf = (out.state.events as Ev[]).filter((e) => e.type === 'atk.stage')
    expect(stagesOf.find((e) => e.step === 'impact')).toMatchObject({ dice: [1, 6], passed: 1 })
    expect(stagesOf.find((e) => e.step === 'armour')).toMatchObject({ tn: 6, toDamage: 1 })
    expect(live(out.state, 'B-zerglings')).toHaveLength(3)
    expect(out.done).toMatchObject({ type: 'charge.go' })
  })

  it('CHG-003 a chargeDistance Reaction window: resume folds the Reaction modifier into charge.distance and goes on to the path', () => {
    ctl.repo = reach
    let raised = true
    ctl.hooks.onChargeRoll = (st, ctx) => (ctx.foldOnly ? { state: st, mods: [], value: ctx.value + 2 } : raised ? { state: st, mods: [], raised: true } : { state: st, mods: [], value: ctx.value })
    const t = ok(charge.resolve(duel({ gap: 6 }), b, act('charge.go')))
    const pick = t.state.pending.options.find((o) => (o.action.targetIds as string[]).join() === 'B-zerglings')!
    const open = ok(charge.resolve(withForcedDice(t.state, [3]), b, pick.action))
    expect((open.state.events as Ev[]).some((e) => e.type === 'charge.distance')).toBe(false) // the window opened first
    raised = false
    const back = ok(charge.resume!(open.state, b))
    expect(back.state.pending.kind).toBe('charge.path')
    expect(back.state.pending.context.distance).toBe(3 + 4 + 2) // not the raw roll: the Reaction's +2 is folded
  })

  it('CHG-003 a "best of two dice" Charge (Zealot Charge, Overseer) rolls 2D6 and keeps the higher', () => {
    ctl.repo = reach
    ctl.ops['A-marines:charge'] = [{ rec: { dice: 'best2D6' } }]
    const t = ok(charge.resolve(duel({ gap: 6 }), b, act('charge.go')))
    const pick = t.state.pending.options.find((o) => (o.action.targetIds as string[]).join() === 'B-zerglings')!
    const p = ok(charge.resolve(withForcedDice(t.state, [2, 5]), b, pick.action))
    expect(p.state.pending.context.distance).toBe(5 + 4)
  })

  it('VIS-023 a BURROWED unit cannot declare a Charge', () => {
    ctl.status['A-marines'] = ['BURROWED']
    expect(chargeTargets(duel(), b, 'A-marines')).toEqual([])
    expect(charge.options(duel(), b, 'A-marines')).toEqual([])
  })

  it('CHG-004 the Charge looks for a legal route (a detour round a blocker) and offers no way to give up on purpose', () => {
    ctl.repo = (st, id, spec) => (spec.path.length === 1 ? { code: 'E_PATH_BLOCKED', message: 'wall' } : reach(st, id, spec))
    const t = ok(charge.resolve(duel({ gap: 6 }), b, act('charge.go')))
    const pick = t.state.pending.options.find((o) => (o.action.targetIds as string[]).join() === 'B-zerglings')!
    const p = ok(charge.resolve(withForcedDice(t.state, [6]), b, pick.action))
    expect(p.state.pending.kind).toBe('charge.path')
    expect(p.state.pending.options.some((o) => o.id === 'giveUp')).toBe(false)
    const win = ok(charge.resolve(p.state, b, act('charge.path', { auto: true })))
    expect((win.state.events as Ev[]).some((e) => e.type === 'charge.succeeded')).toBe(true)
    ctl.repo = () => ({ code: 'E_PATH_BLOCKED', message: 'wall' }) // no route at all: the Charge fails at once
    const fail = ok(charge.resolve(withForcedDice(t.state, [6]), b, pick.action))
    expect(fail.done).toMatchObject({ type: 'charge.go', triggers: [] })
  })

  it('CHG-003 chargeSucceeded Reactions are offered after a successful Charge only; chargeDistance ones at the roll', () => {
    const causes: string[] = []
    ctl.hooks.onChargeRoll = (st, ctx) => { causes.push(String(ctx.cause)); return { state: st, mods: [], value: ctx.value } }
    ctl.repo = stepIn
    const t = ok(charge.resolve(duel({ gap: 6 }), b, act('charge.go')))
    const pick = t.state.pending.options.find((o) => (o.action.targetIds as string[]).join() === 'B-zerglings')!
    const p = ok(charge.resolve(withForcedDice(t.state, [6]), b, pick.action))
    expect(causes).toEqual(['chargeDistance'])
    ok(charge.resolve(p.state, b, act('charge.path', { auto: true })))
    expect(causes).toEqual(['chargeDistance', 'chargeSucceeded'])
    causes.length = 0
    ctl.repo = () => reject('E_TOO_FAR', 'short')
    ok(charge.resolve(p.state, b, act('charge.path', { auto: true })))
    expect(causes).toEqual([])
  })

  it('CHG-004 chargeAgain (Lightning Dash): after a good Charge a second enemy may be charged, with no second IMPACT', () => {
    ctl.ops['A-marines:chargeAgain'] = [{ rec: { differentTarget: true } }]
    ctl.repo = stepIn
    let s = duel({ gap: 6, marines: 1 })
    const q = squad(b, { id: 'Zb', owner: 'B', profileId: 'zergling', models: 1, at: { x: 8, z: 0 } })
    s = { ...s, units: { ...s.units, Zb: q.unit }, models: { ...s.models, ...Object.fromEntries(q.models.map((m) => [m.id, m])) } }
    const t = ok(charge.resolve(s, b, act('charge.go')))
    const pick = t.state.pending.options.find((o) => (o.action.targetIds as string[]).join() === 'B-zerglings')!
    const p = ok(charge.resolve(withForcedDice(t.state, [6]), b, pick.action))
    const out = ok(charge.resolve(p.state, b, act('charge.path', { auto: true })))
    expect(out.state.pending.kind).toBe('charge.targets')
    expect(out.state.pending.options.map((o) => o.action.targetIds)).toEqual([['Zb']])
    expect(out.state.pending.options[0]!.action.again).toBe(true)
  })

  it('GOLD-10 a ranked model that can reach two enemy units splits its IMPACT dice as the player chooses', () => {
    ctl.kw['A-marines'] = [{ kw: 'IMPACT', x: 2, y: 3 }]
    ctl.repo = (st, _id, spec) => {
      const m = st.models[spec.leaderId as string]!
      const z = st.models['B-zerglings.0']!
      return { state: { ...st, models: { ...st.models, [m.id]: { ...m, pos: { x: z.pos.x, z: z.pos.z + C } } } }, events: [], inCoherency: true, casualties: [] }
    }
    let s = duel({ gap: 6, marines: 1, zerglings: 1 })
    const z0 = s.models['B-zerglings.0']!
    const at = { x: z0.pos.x + C + 0.5, z: z0.pos.z + C }
    const q = squad(b, { id: 'Zb', owner: 'B', profileId: 'zergling', models: 1, at })
    s = { ...s, units: { ...s.units, Zb: q.unit }, models: { ...s.models, ...Object.fromEntries(q.models.map((m) => [m.id, { ...m, pos: at }])) } }
    const t = ok(charge.resolve(s, b, act('charge.go')))
    const pick = t.state.pending.options.find((o) => (o.action.targetIds as string[]).join() === 'B-zerglings')!
    const p = ok(charge.resolve(withForcedDice(t.state, [6]), b, pick.action))
    const ask = ok(charge.resolve(p.state, b, act('charge.path', { auto: true })))
    expect(ask.state.pending.kind).toBe('charge.impact')
    expect(ask.state.pending.options.map((o) => o.id)).toContain('even')
    const out = ok(charge.resolve(withForcedDice(ask.state, [6, 1, 6, 1]), b, act('charge.impact', { split: { 'A-marines.0': { 'B-zerglings': 1, Zb: 1 } } })))
    expect(stages(out.state, 'impact').map((e) => (e.dice as number[]).length)).toEqual([1, 1])
    expect(isRejection(charge.resolve(ask.state, b, act('charge.impact', { split: { 'A-marines.0': { 'B-zerglings': 3 } } })))).toBe(true)
  })
})
