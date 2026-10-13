// Tests for src/engine/damage.ts (owner A). Names follow docs/spec/12-rules-test-checklist.md IDs.
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { apply } from '../../src/engine/apply'
import { addNonLethal, allocateDamage, heal, removeModels } from '../../src/engine/damage'
import { isRejection } from '../../src/engine/errors'
import type { GameState } from '../../src/engine/types'
import { bundle, duelState, squad } from './helpers'

// ---- stand-ins for the services other rules owners are building in parallel (printed data only) ----
// effects, visibility, engage, squads, supply, hooks, movement and query are mocked so this file tests owner A's modules alone.
/* eslint-disable @typescript-eslint/no-explicit-any */
const ctl = vi.hoisted(() => ({
  kw: {} as Record<string, { kw: string; x?: number; y?: number; tag?: string }[]>,
  status: {} as Record<string, string[]>,
  cover: 'none',
  hidden: [] as string[],
  hooks: {} as Record<string, (s: any, ctx: any) => any>,
  purposes: [] as string[],
  pool: {} as Record<string, number>,
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
    supplyFor: (s: any, b: any, id: string, purpose?: string) => { ctl.purposes.push(String(purpose)); return purpose === 'pool' && ctl.pool[id] !== undefined ? ctl.pool[id]! : csv(s, b, id) },
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
  ctl.purposes.length = 0
  for (const k of Object.keys(ctl.pool)) delete ctl.pool[k]
  ctl.hidden = []
})

function addUnit(s: GameState, spec: Parameters<typeof squad>[1], place?: Record<number, [number, number]>): GameState {
  const q = squad(b, spec)
  const models = q.models.map((m, i) => (place?.[i] ? { ...m, pos: { x: place[i]![0], z: place[i]![1] } } : m))
  return { ...s, units: { ...s.units, [q.unit.id]: q.unit }, models: { ...s.models, ...Object.fromEntries(models.map((m) => [m.id, m])) } }
}
const live = (s: GameState, u: string): string[] => s.units[u]!.modelIds.filter((id) => s.models[id]!.life === 'active')
const alloc = (s: GameState, unit: string, total: number, mode: 'visible' | 'engaged', eligible?: string[], cap?: number): GameState => {
  const r = allocateDamage(s, b, unit, total, mode, eligible, cap)
  if (isRejection(r)) throw new Error(r.message)
  return r.state
}
const empty = (): GameState => duelState(b, { marines: 1, zerglings: 1 })

describe('damage allocation and removal (owner A)', () => {
  it('DMG-003 the defender removes eligible models while their HP fits; the remainder becomes the marker (DMG-005)', () => {
    const s = addUnit(empty(), { id: 'R', owner: 'B', profileId: 'roach', models: 3, at: { x: 8, z: -8 } })
    const out = alloc(s, 'R', 9, 'visible')
    expect(live(out, 'R')).toHaveLength(1)
    expect(out.units.R!.damage).toBe(1)
  })

  it('DMG-004 when every eligible model is gone the rest of the damage, old marker included, is discarded', () => {
    let s = addUnit(empty(), { id: 'R', owner: 'B', profileId: 'roach', models: 3, at: { x: 8, z: -8 } })
    s = { ...s, units: { ...s.units, R: { ...s.units.R!, damage: 2 } } }
    const out = alloc(s, 'R', 11, 'visible', ['R.0', 'R.1'])
    expect(live(out, 'R')).toEqual(['R.2'])
    expect(out.units.R!.damage).toBe(0)
  })

  it('DMG-006 CONCENTRATED FIRE stops after X removals and records nothing', () => {
    const out = alloc(duelState(b, { marines: 1, zerglings: 6 }), 'B-zerglings', 5, 'visible', undefined, 2)
    expect(live(out, 'B-zerglings')).toHaveLength(4)
    expect(out.units['B-zerglings']!.damage).toBe(0)
  })

  it('DMG-007 mixed HP raises a casualty decision for the defender, and the answer carries on (DMG-011)', () => {
    let s = addUnit(empty(), { id: 'Z', owner: 'B', profileId: 'zealot', models: 3, at: { x: 8, z: -8 } })
    expect(s.models['Z.0']!.hp).toBe(7) // Shield 3 folded into the first model
    s = alloc(s, 'Z', 8, 'visible')
    expect(s.pending.kind).toBe('atk.casualty')
    expect(s.pending.seat).toBe('B')
    const pick = s.pending.options.find((o) => o.action.modelId === 'Z.0')!
    const r = apply(s, b, pick.action)
    expect(r.ok).toBe(true)
    const out = r.ok ? r.state : s
    expect(out.models['Z.0']!.life).toBe('dead')
    expect(out.units.Z!.damage).toBe(1)
    expect(out.units.Z!.shielded).toBe(false)
  })

  it('DMG-012 SHIELDED is lost only when Total Damage exceeds the Shield value (SHD-002), and never comes back (SHD-003)', () => {
    const s = addUnit(empty(), { id: 'Z', owner: 'B', profileId: 'zealot', models: 3, at: { x: 8, z: -8 } })
    expect(s.units.Z!.shielded).toBe(true)
    expect(alloc(s, 'Z', 3, 'visible').units.Z!.shielded).toBe(true)
    const lost = alloc(s, 'Z', 4, 'visible')
    expect(lost.units.Z!.shielded).toBe(false)
    expect(heal(lost, b, 'Z', 5).units.Z!.shielded).toBe(false)
    expect(addNonLethal(s, b, 'Z', 3).units.Z!.shielded).toBe(true)
    expect(addNonLethal(s, b, 'Z', 4).units.Z!.shielded).toBe(false)
  })

  it('DMG-013 NON-LETHAL adds to the marker and removes nothing; HEAL lowers it, floor 0, and returns no models', () => {
    const s = duelState(b, { marines: 3, zerglings: 1 })
    const hurt = addNonLethal(s, b, 'A-marines', 9)
    expect(hurt.units['A-marines']!.damage).toBe(9)
    expect(live(hurt, 'A-marines')).toHaveLength(3)
    expect(heal(hurt, b, 'A-marines', 4).units['A-marines']!.damage).toBe(5)
    expect(heal(hurt, b, 'A-marines', 40).units['A-marines']!.damage).toBe(0)
    // The next standard damage uses the combined total (marines have 2 HP each).
    const next = alloc(hurt, 'A-marines', hurt.units['A-marines']!.damage + 1, 'visible')
    expect(live(next, 'A-marines')).toHaveLength(0)
  })

  it('DMG-014 removeModels is the one remover: bracket Supply is logged, Destroyed clears effects and tokens, onModelsRemoved fires', () => {
    let s = duelState(b, { marines: 6, zerglings: 1 })
    s = { ...s, tokens: [{ id: 't1', defId: 'shade', owner: 'A', sourceId: 'A-marines', pos: { x: 0, z: 0 }, elev: 0, round: 1 }] }
    s = { ...s, units: { ...s.units, 'A-marines': { ...s.units['A-marines']!, effects: [{ id: 'e', source: 'x', kind: 'status', expires: 'permanent', bySeat: 'A', round: 1 }] } } }
    const seen: string[] = []
    ctl.hooks.onModelsRemoved = (st, ctx) => { seen.push(`${ctx.cause}:${ctx.modelIds.length}`); return { state: st, mods: [] } }
    const three = removeModels(s, b, 'A-marines', ['A-marines.3', 'A-marines.4', 'A-marines.5'], 'attack')
    expect(three.seats.A!.supplyLostThisRound).toBe(1) // 6 models (Supply 1) -> 3 models (Supply 0)
    expect(removeModels(three, b, 'A-marines', ['A-marines.3'], 'attack')).toBe(three) // already dead
    const all = removeModels(three, b, 'A-marines', ['A-marines.0', 'A-marines.1', 'A-marines.2'], 'ability')
    expect(all.units['A-marines']!.location).toBe('destroyed')
    expect(all.units['A-marines']!.effects).toEqual([])
    expect(all.tokens).toHaveLength(0)
    expect((all.events as Ev[]).some((e) => e.type === 'unitDestroyed')).toBe(true)
    expect(seen).toEqual(['attack:3', 'ability:3'])
  })

  it('DMG-020 an Engaged unit loses models outside Engagement Range first, then in range, then in base contact', () => {
    let s = addUnit(empty(), { id: 'M', owner: 'A', profileId: 'marine', models: 1, at: { x: 0, z: 0 } }, { 0: [0, 0] })
    s = addUnit(s, { id: 'Z', owner: 'B', profileId: 'zergling', models: 4, at: { x: 0, z: -3 } }, { 0: [0, -C], 1: [3, -C], 2: [1.8, -1], 3: [-C, 0] })
    const one = alloc(s, 'Z', 1, 'engaged')
    expect(live(one, 'Z')).not.toContain('Z.1') // tier 1 goes first
    const two = alloc(s, 'Z', 2, 'engaged')
    expect(live(two, 'Z').sort()).toEqual(['Z.0', 'Z.3']) // then the one inside range but not touching
    expect(live(alloc(s, 'Z', 3, 'engaged'), 'Z')).toHaveLength(1)
  })

  it('DMG-021 a removal that ends Engagement with one enemy unit is barred while another casualty is valid', () => {
    let s = empty()
    s = addUnit(s, { id: 'M1', owner: 'A', profileId: 'marine', models: 1, at: { x: -3, z: 0 } }, { 0: [-3, 0] })
    s = addUnit(s, { id: 'M2', owner: 'A', profileId: 'marine', models: 1, at: { x: 3, z: 0 } }, { 0: [3, 0] })
    s = addUnit(s, { id: 'Z', owner: 'B', profileId: 'zergling', models: 3, at: { x: 0, z: -3 } }, { 0: [-3, -C], 1: [3, -C], 2: [-3 - C, 0] })
    const out = alloc(s, 'Z', 1, 'engaged')
    // Z.1 is M2's only engager: it stays; of the two models touching M1, the later one in muster order goes.
    expect(live(out, 'Z')).toEqual(['Z.0', 'Z.1'])
  })

  it('SUP-007 the ledger takes both sides of a Supply drop with the vp purpose, so a pool-Supply effect cannot hide a loss', () => {
    ctl.pool['A-marines'] = 0 // a pool effect (Advanced Medic Facilities) that would zero the "before" value
    ctl.purposes.length = 0
    const s = duelState(b, { marines: 6, zerglings: 1 })
    const out = removeModels(s, b, 'A-marines', ['A-marines.3', 'A-marines.4', 'A-marines.5'], 'attack')
    expect(ctl.purposes).toContain('vp')
    expect(ctl.purposes).not.toContain('pool')
    expect(out.seats.A!.supplyLostThisRound).toBe(1)
  })

  it('VP-002 a Morph removal is a Supply drop like any other and counts for the opponent (F p.5)', () => {
    const s = duelState(b, { marines: 6, zerglings: 1 })
    const out = removeModels(s, b, 'A-marines', ['A-marines.3', 'A-marines.4', 'A-marines.5'], 'morph')
    expect(out.seats.A!.supplyLostThisRound).toBe(1)
  })
})
