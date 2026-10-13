// Tests for src/engine/melee.ts (owner A). Names follow docs/spec/12-rules-test-checklist.md IDs.
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { isRejection, reject } from '../../src/engine/errors'
import { fightingRank, melee, meleeTargets, supportingRank } from '../../src/engine/melee'
import type { GameState, Rejection } from '../../src/engine/types'
import { allWeapons, requireUnitDef } from '../../src/engine/edition'
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
  extra: {} as Record<string, any>,
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
    weaponProfile: (s: any, b: any, id: string, w: string) => ctl.extra[w] ?? ed.weaponDef(def(s, b, id), w) ?? null,
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
const C = 32 / 25.4 // two 32 mm bases touching
type Ev = { type: string; step?: string; [k: string]: unknown }

beforeEach(() => {
  for (const k of Object.keys(ctl.kw)) delete ctl.kw[k]
  for (const k of Object.keys(ctl.status)) delete ctl.status[k]
  for (const k of Object.keys(ctl.hooks)) delete ctl.hooks[k]
  ctl.hidden = []
  ctl.repo = null
  for (const k of Object.keys(ctl.extra)) delete ctl.extra[k]
})

function addUnit(s: GameState, spec: Parameters<typeof squad>[1], place: Record<number, [number, number]>): GameState {
  const q = squad(b, spec)
  const models = q.models.map((m, i) => (place[i] ? { ...m, pos: { x: place[i]![0], z: place[i]![1] } } : m))
  return { ...s, units: { ...s.units, [q.unit.id]: q.unit }, models: { ...s.models, ...Object.fromEntries(models.map((m) => [m.id, m])) } }
}
const ok = <T>(r: T | Rejection): T => { if (isRejection(r)) throw new Error(`${r.code}: ${r.message}`); return r }
const live = (s: GameState, u: string): string[] => s.units[u]!.modelIds.filter((id) => s.models[id]!.life === 'active')
const hits = (s: GameState): Ev[] => (s.events as Ev[]).filter((e) => e.type === 'atk.stage' && e.step === 'hit')
const act = (type: string, unitId: string, f: Record<string, unknown> = {}) => ({ type, decisionId: 'x', seat: 'A', unitId, ...f })
/** The combat table: everything happens around x = 20, away from the default duel squads. */
const base = (): GameState => ({ ...duelState(b, { marines: 1, zerglings: 1 }), roundPhase: 'combat' })

describe('Combat Phase attack (owner A)', () => {
  it('CC-020 Fighting Rank is within 1 in of an enemy; Supporting Rank touches a fighter; no one else strikes', () => {
    let s = addUnit(base(), { id: 'M', owner: 'A', profileId: 'marine', models: 3, at: { x: 20, z: 0 } }, { 0: [20, 0], 1: [20, C], 2: [26, 6] })
    s = addUnit(s, { id: 'Z', owner: 'B', profileId: 'zergling', models: 1, at: { x: 20, z: -C } }, { 0: [20, -C] })
    expect(fightingRank(s, b, 'M')).toEqual(['M.0'])
    expect(supportingRank(s, b, 'M')).toEqual(['M.1'])
    expect(meleeTargets(s, b, 'M.0')).toEqual(['Z'])
    expect(meleeTargets(s, b, 'M.1')).toEqual(['Z']) // supports a model that fights Z
    expect(meleeTargets(s, b, 'M.2')).toEqual([])
    expect(melee.options(s, b, 'M').map((o) => o.action.type)).toEqual(['melee.go'])
    expect(melee.options({ ...s, roundPhase: 'assault' }, b, 'M')).toEqual([])
  })

  it('CR-003 models already in base contact are pinned; with none free Close Ranks is skipped and the unit fights (CC-030, CC-050)', () => {
    let s = addUnit(base(), { id: 'M', owner: 'A', profileId: 'marine', models: 1, at: { x: 20, z: 0 } }, { 0: [20, 0] })
    s = addUnit(s, { id: 'Z', owner: 'B', profileId: 'zergling', models: 2, at: { x: 20, z: -C } }, { 0: [20, -C], 1: [22, -C] })
    s = { ...withForcedDice(s, [6, 1]), activeUnit: 'M', units: { ...s.units, M: { ...s.units.M!, activation: 'assault' } } }
    // Strike: RoA 1 at 5+, one hit, Armour roll 1 fails, one damage; the Engaged zergling goes (engaged priority).
    const out = ok(melee.resolve(s, b, act('melee.go', 'M')))
    expect(out.state.pending.kind).not.toBe('melee.closeRanks')
    expect(out.done).toMatchObject({ type: 'melee.go', unitId: 'M', triggers: [{ kind: 'meleeAttack' }] })
    expect(out.state.units.M!.activation).toBeNull() // the marker comes off after the attack
    expect(live(out.state, 'Z')).toHaveLength(1)
    expect(out.state.attack).toBeNull()
  })

  it('CR-001 Close Ranks moves the Leading Model up to the rules.json distance through movement.reposition, then the unit attacks', () => {
    let s = addUnit(base(), { id: 'M', owner: 'A', profileId: 'marine', models: 2, at: { x: 20, z: 0 } }, { 0: [20, 0], 1: [24, 3] })
    s = addUnit(s, { id: 'Z', owner: 'B', profileId: 'zergling', models: 1, at: { x: 20, z: -C } }, { 0: [20, -C] })
    s = { ...s, activeUnit: 'M' }
    const menu = ok(melee.resolve(s, b, act('melee.go', 'M')))
    expect(menu.state.pending.kind).toBe('melee.closeRanks')
    expect(menu.state.pending.context.movers).toEqual(['M.1'])
    let spec: Record<string, unknown> | null = null
    ctl.repo = (st, _id, sp) => { spec = sp; return { state: st, events: [], inCoherency: true, casualties: [] } }
    const close = menu.state.pending.options.find((o) => o.action.mode === 'close')!
    const out = ok(melee.resolve(menu.state, b, close.action))
    expect(spec).toMatchObject({ kind: 'closeRanks', leaderId: 'M.1', maxDist: 3, mustCloseOn: ['Z'], allowEngage: ['Z'] })
    expect(out.done ?? out.state.attack).toBeTruthy() // fought: either finished or mid-attack
    // A refused explicit path is reported and the decision stays open.
    ctl.repo = () => reject('E_TOO_FAR', 'too far')
    expect(isRejection(melee.resolve(menu.state, b, { ...close.action, leaderId: 'M.1', path: [{ x: 0, z: 0 }] }))).toBe(true)
  })

  it('CC-040 several enemy units: the Surge Die is declared for one target first and the other pool gets none; one Batch per pool', () => {
    let s = addUnit(base(), { id: 'M', owner: 'A', profileId: 'zealot', models: 2, at: { x: 20, z: 0 } }, { 0: [16, 0], 1: [24, 0] })
    s = addUnit(s, { id: 'Z1', owner: 'B', profileId: 'zergling', models: 1, at: { x: 16, z: -C } }, { 0: [16, -C] })
    s = addUnit(s, { id: 'Z2', owner: 'B', profileId: 'zergling', models: 1, at: { x: 24, z: -C } }, { 0: [24, -C] })
    s = { ...s, activeUnit: 'M' }
    const menu = ok(melee.resolve(s, b, act('melee.go', 'M')))
    expect(menu.state.pending.kind).toBe('melee.split')
    expect(menu.state.pending.options.map((o) => o.action.surgeTarget).sort()).toEqual(['Z1', 'Z2'])
    const pick = menu.state.pending.options.find((o) => o.action.surgeTarget === 'Z2')!
    const out = ok(melee.resolve(menu.state, b, pick.action))
    const h = hits(out.state)
    expect(h).toHaveLength(2)
    const surgeOf = (id: string) => (h.find((e) => String(e.batchId).endsWith(id))!.surge as { die: number | null }).die
    expect(surgeOf('Z2')).not.toBeNull()
    expect(surgeOf('Z1')).toBeNull()
    expect(out.done).toMatchObject({ type: 'melee.go' })
    // A model may only be assigned to a unit it ranks against.
    expect(isRejection(melee.resolve(menu.state, b, { ...pick.action, assign: { 'M.0': 'Z2' } }))).toBe(true)
  })

  it('VIS-026 a BURROWED unit offers only Close Ranks or no attack, and attacks only after Closing Ranks', () => {
    let s = addUnit(base(), { id: 'M', owner: 'A', profileId: 'marine', models: 2, at: { x: 20, z: 0 } }, { 0: [20, 0], 1: [24, 3] })
    s = addUnit(s, { id: 'Z', owner: 'B', profileId: 'zergling', models: 1, at: { x: 20, z: -C } }, { 0: [20, -C] })
    s = { ...s, activeUnit: 'M', units: { ...s.units, M: { ...s.units.M!, activation: 'assault' } } }
    ctl.status.M = ['BURROWED']
    const menu = ok(melee.resolve(s, b, act('melee.go', 'M')))
    expect(menu.state.pending.kind).toBe('melee.closeRanks')
    // No attack: the activation ends with fought = false and nobody is hurt.
    const skip = ok(melee.resolve(menu.state, b, menu.state.pending.options.find((o) => o.action.mode === 'skip')!.action))
    expect(skip.done).toMatchObject({ type: 'melee.go', triggers: [] })
    expect(live(skip.state, 'Z')).toHaveLength(1)
    // Close Ranks, then the attack follows.
    ctl.repo = (st) => ({ state: st, events: [], inCoherency: true, casualties: [] })
    const close = ok(melee.resolve(menu.state, b, menu.state.pending.options.find((o) => o.action.mode === 'close')!.action))
    expect(close.done ?? close.state.attack ?? close.state.pending.kind === 'melee.split').toBeTruthy()
    expect((close.state.events as Ev[]).some((e) => e.type === 'melee.done' && e.fought === false)).toBe(false)
    // Every model already in base contact: Close Ranks is impossible, so a BURROWED unit cannot attack.
    let p = addUnit(base(), { id: 'M', owner: 'A', profileId: 'marine', models: 1, at: { x: 20, z: 0 } }, { 0: [20, 0] })
    p = addUnit(p, { id: 'Z', owner: 'B', profileId: 'zergling', models: 1, at: { x: 20, z: -C } }, { 0: [20, -C] })
    const none = ok(melee.resolve({ ...p, activeUnit: 'M' }, b, act('melee.go', 'M')))
    expect(none.done).toMatchObject({ type: 'melee.go', triggers: [] })
    expect(live(none.state, 'Z')).toHaveLength(1)
  })

  it('CC-030 a model with several close combat weapons gets a weapon choice on the split decision; the best pick is the ready answer', () => {
    const mdef = requireUnitDef(b, 'marine')
    const strike = allWeapons(mdef).find((w) => w.phase === 'combat')!
    ctl.extra.heavy = { ...strike, id: 'heavy', roa: 3 }
    let s = addUnit(base(), { id: 'M', owner: 'A', profileId: 'marine', models: 1, at: { x: 20, z: 0 } }, { 0: [20, 0] })
    s = addUnit(s, { id: 'Z', owner: 'B', profileId: 'zergling', models: 1, at: { x: 20, z: -C } }, { 0: [20, -C] })
    s = { ...s, models: { ...s.models, 'M.0': { ...s.models['M.0']!, weapons: [...s.models['M.0']!.weapons, 'heavy'] } }, activeUnit: 'M' }
    const menu = ok(melee.resolve(s, b, act('melee.go', 'M')))
    expect(menu.state.pending.kind).toBe('melee.split')
    expect(menu.state.pending.context.weaponChoices).toEqual({ 'M.0': expect.arrayContaining([strike.id, 'heavy']) })
    const ready = menu.state.pending.options[0]!
    const best = ok(melee.resolve(withForcedDice(menu.state, [6, 6, 6, 1, 1, 1]), b, ready.action))
    expect(hits(best.state)[0]!.groups).toMatchObject([{ count: 3 }])
    const chosen = ok(melee.resolve(withForcedDice(menu.state, [6, 1]), b, { ...ready.action, weapons: { 'M.0': strike.id } }))
    expect(hits(chosen.state)[0]!.groups).toMatchObject([{ count: strike.roa }])
    expect(isRejection(melee.resolve(menu.state, b, { ...ready.action, weapons: { 'M.0': 'nope' } }))).toBe(true)
  })
})
