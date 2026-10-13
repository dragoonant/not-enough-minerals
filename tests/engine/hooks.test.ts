import { describe, expect, it, vi } from 'vitest'
import type { Condition, Effect as DataEffect } from '../../src/data/types'
import { abilities, runEffects } from '../../src/engine/abilities'
import { CODE_CONDITIONS, CODE_HOOKS, closedEdges, firstPlayerLock, runCode } from '../../src/engine/code-hooks'
import { HOOK_POINTS, HOOK_WIRING, POINT_EVENTS, runHook } from '../../src/engine/hooks'
import { modelDistance } from '../../src/engine/measure'
import { addEffect } from '../../src/engine/effects'
import { raiseDecision, option } from '../../src/engine/registry'
import type { AttackBatch, CardState, GameState } from '../../src/engine/types'
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

/** The duel plus a Medic squad of three close to the Marines, a CP card for seat A, and B activating. */
function medicDuel(): GameState {
  let s = duelState(b)
  const m = squad(b, { id: 'A-medics', owner: 'A', profileId: 'medic', models: 3, at: { x: 3.2, z: 6 } })
  s = {
    ...s, units: { ...s.units, [m.unit.id]: m.unit }, models: { ...s.models, ...Object.fromEntries(m.models.map((x) => [x.id, x])) },
    cards: { A: [card('barracks', 'CP')], B: [] }, activeUnit: 'B-zerglings', active: 'B',
  }
  return s
}

const hit = (s: GameState, value: number) => ({ unitId: 'B-zerglings', targetUnitId: 'A-marines', seat: 'B', value, phase: s.roundPhase! })

describe('hooks: wiring, listeners and code hooks (spec 00 s4.3)', () => {
  it('HOOK-001 every hook point has one wired call site and every trigger event in data has a hook point', () => {
    expect(Object.keys(HOOK_WIRING).sort()).toEqual([...HOOK_POINTS].sort())
    expect(new Set(Object.values(HOOK_WIRING)).size).toBe(HOOK_POINTS.length)
    const served = new Set<string>(Object.values(POINT_EVENTS).flat())
    const internal = new Set(['usesAbility', 'debuffReceived', 'endOfPhase']) // answered inside abilities.ts, not by a point
    const events = new Set<string>()
    const walk = (o: unknown) => {
      if (Array.isArray(o)) o.forEach(walk)
      else if (o && typeof o === 'object') {
        const t = (o as { trigger?: { event?: string } }).trigger
        if (t?.event) events.add(t.event)
        Object.values(o).forEach(walk)
      }
    }
    walk(b.records.units); walk(b.records.cards)
    for (const e of events) expect(served.has(e) || internal.has(e), e).toBe(true)
  })

  it('CA-HOOK every {code} named in data is implemented (14 hooks) and no implementation is orphaned', () => {
    const ids = b.records.hooks.map((h) => h.id)
    expect(ids.length).toBeGreaterThanOrEqual(14)
    for (const id of ids) expect(id in CODE_HOOKS || id in CODE_CONDITIONS, id).toBe(true)
    const used = new Set<string>()
    const walk = (o: unknown) => {
      if (Array.isArray(o)) o.forEach(walk)
      else if (o && typeof o === 'object') {
        const r = o as DataEffect & Condition
        if (typeof r.code === 'string') used.add(r.code)
        Object.values(o).forEach(walk)
      }
    }
    walk(b.records.units); walk(b.records.cards); walk(b.records.missions)
    for (const code of used) expect(ids.includes(code), code).toBe(true)
    for (const id of [...Object.keys(CODE_HOOKS), ...Object.keys(CODE_CONDITIONS)]) expect(ids.includes(id), id).toBe(true)
  })

  it('XPORT-003 Comsat Station closes one table edge to enemy Deploys, recorded as a token', () => {
    let s = duelState(b)
    s = { ...s, cards: { A: [card('orbital-command', 'CP')], B: [] } }
    const r = runCode(s, b, { code: 'deny-deploy-edge' }, { seat: 'A', edge: 'E' })
    expect(r.rejection).toBeUndefined()
    expect(closedEdges(r.state)).toEqual([{ edge: 'E', owner: 'A' }])
    expect(runCode(s, b, { code: 'deny-deploy-edge' }, { seat: 'A', edge: 'Q' }).rejection?.code).toBe('E_BAD_PARAM')
  })

  it('INIT-TENACITY Terran Tenacity takes the First Player Marker and locks it', () => {
    const s = duelState(b)
    const r = runCode(s, b, { code: 'claim-first-player-marker' }, { seat: 'B' })
    expect(r.state.firstPlayer).toBe('B')
    expect(firstPlayerLock(r.state)).toBe('B')
    expect(firstPlayerLock(s)).toBeNull()
  })

  it('TRN-002 forward deploys: a second Unit coming in the same way in one Round is refused', () => {
    const s = { ...duelState(b), cards: { A: [card('barracks-proxy', 'CP')], B: [] } }
    const ctx = { seat: 'A', sourceId: 'forward-deploy' }
    const proxy = b.records.cards.find((c) => c.id === 'barracks-proxy')!.abilities.find((a) => a.effects.some((e) => e.code === 'forward-deploy-once-per-round'))!
    const first = runCode(s, b, { code: 'forward-deploy-once-per-round' }, { ...ctx, sourceId: proxy.id })
    expect(first.veto).toBeUndefined()
    const second = runCode(first.state, b, { code: 'forward-deploy-once-per-round' }, { ...ctx, sourceId: proxy.id })
    expect(second.veto).toBe(true)
    expect(runCode({ ...first.state, round: 2 }, b, { code: 'forward-deploy-once-per-round' }, { ...ctx, sourceId: proxy.id }).veto).toBeUndefined()
  })

  it('ST-007 Creep Removal: an enemy move ending near a friendly tumor removes it, a PLACE does not', () => {
    let s = duelState(b)
    const mz = s.models['A-marines.0']!.pos
    s = { ...s, cards: { A: [], B: [card('accelerating-creep', 'BM', 0, 'creep')] }, tokens: [{ id: 'tum', defId: 'creep-tumor', owner: 'B', sourceId: null, pos: { x: mz.x + 1.5, z: mz.z }, elev: 0, round: 1 }] }
    expect(runHook(s, b, 'onMoveEnd', { unitId: 'A-marines', kind: 'place' }).state.tokens).toHaveLength(1)
    expect(runHook(s, b, 'onMoveEnd', { unitId: 'A-marines', kind: 'run' }).state.tokens).toHaveLength(0)
    expect(runHook(s, b, 'onMoveEnd', { unitId: 'B-zerglings', kind: 'move' }).state.tokens).toHaveLength(1)
  })

  it('CA-ARTEFACT not-carrying-claimed-marker is false while the Unit holds a claimed marker', () => {
    const s = duelState(b)
    const c = CODE_CONDITIONS['not-carrying-claimed-marker']!
    expect(c(s, b, {}, { unitId: 'A-marines' })).toBe(true)
    const withMarker = { ...s, markers: [{ n: 1, pos: { x: 0, z: 0 }, elev: 0, side: 'red' as const, active: true, onTable: true, controller: null, controlledSinceRound: null, claimedBy: 'A-marines', activatedRound: 1 }] }
    expect(c(withMarker, b, {}, { unitId: 'A-marines' })).toBe(false)
  })

  it('REA-001 REA-003 a Reaction is offered at the trigger, paid, applied, and a player gets one per Activation', () => {
    const s = medicDuel()
    const r = runHook(s, b, 'reduceDamage', hit(s, 6))
    expect(r.raised).toBe(true)
    expect(r.state.pending).toMatchObject({ kind: 'ability.react', seat: 'A' })
    const use = r.state.pending.options.find((o) => o.action.type === 'ability.useReaction' && o.action.abilityId === 'life-support')!
    expect(use).toBeDefined()
    const done = abilities.resolve(r.state, b, use.action)
    if (!('state' in done)) throw new Error(done.message)
    // paid with the Ready CP card; the interrupted decision is back
    expect(done.state.cards.A![0]!.exhausted).toBe(true)
    expect(done.state.reactionsUsed).toEqual(['A'])
    expect(done.state.pending.id).toBe(s.pending.id)
    // Life Support takes one off per Medic model within 4" of the damaged Unit
    const near = done.state.units['A-medics']!.modelIds.filter((id) => done.state.units['A-marines']!.modelIds.some((m) => modelDistance(done.state.models[id]!, done.state.models[m]!) <= 4)).length
    expect(near).toBeGreaterThan(0)
    const folded = runHook(done.state, b, 'reduceDamage', { ...hit(s, 6), foldOnly: true })
    expect(folded.value).toBe(6 - near)
    // the second Reaction of the same Activation is not even offered
    const again = runHook({ ...done.state, cards: { ...done.state.cards, A: [card('barracks', 'CP')] } }, b, 'reduceDamage', hit(s, 6))
    expect(again.raised).toBeUndefined()
  })

  it('CA-008 Point Defense Laser: targeting a friend within 4" takes up to 2 dice out of the Attack Pool and removes the drone', () => {
    let s = duelState(b)
    const d = squad(b, { id: 'A-drone', owner: 'A', profileId: 'point-defense-drone', models: 1, at: { x: 2.5, z: 6 } })
    s = { ...s, units: { ...s.units, [d.unit.id]: d.unit }, models: { ...s.models, ...Object.fromEntries(d.models.map((m) => [m.id, m])) } }
    const batch = { id: 'x', kind: 'ranged', keywords: [], attackerModelIds: [], weaponId: null, sourceId: null } as unknown as AttackBatch
    const ctx = { unitId: 'B-zerglings', targetUnitId: 'A-marines', seat: 'B', batch }
    const t = runHook(s, b, 'onTargeted', ctx)
    expect(t.raised).toBeUndefined()
    expect(t.state.units['A-drone']!.location).toBe('destroyed')
    const m = runHook(t.state, b, 'attackMods', { ...ctx, value: 7 })
    expect(m.removeDice).toBe(2)
    expect(m.value).toBe(5)
    // consumed: the next Batch is not shorted again
    expect(runHook(m.state, b, 'attackMods', { ...ctx, value: 7 }).value).toBe(7)
    // an INSTANT weapon names the drone's trigger out
    const inst = { ...batch, keywords: [{ kw: 'INSTANT' }] } as unknown as AttackBatch
    expect(runHook(s, b, 'onTargeted', { ...ctx, batch: inst }).state.units['A-drone']!.location).toBe('table')
  })

  it('ATK-HOOKS the attack protocol: roll modifiers, canEvade and the two reduceDamage calls (perDie cap, total reduce)', () => {
    let s = duelState(b)
    const e = (source: string, data: Record<string, unknown>, expires: 'thisRoll' | 'thisAttack' = 'thisAttack') => ({ source, kind: 'mod' as const, expires, bySeat: 'B', round: 1, data })
    s = addEffect(s, 'A-marines', e('brood', { op: 'rollMod', roll: 'evade', delta: 1 }, 'thisRoll'))
    s = addEffect(s, 'A-marines', e('barrier', { op: 'damageCap', max: 1 }))
    s = addEffect(s, 'A-marines', e('daeuhl', { op: 'damageReduce', n: 2, min: 1 }))
    s = addEffect(s, 'A-marines', e('hallucination', { op: 'canEvade', vs: ['ranged'] }))
    const batch = { id: 'x', kind: 'ranged', keywords: [], attackerModelIds: [], weaponId: null, sourceId: null } as unknown as AttackBatch
    const ctx = { unitId: 'B-zerglings', targetUnitId: 'A-marines', seat: 'B', batch }
    expect(runHook(s, b, 'beforeEvadeRoll', { ...ctx, value: 0 })).toMatchObject({ value: 1, mods: [{ value: 1 }] })
    expect(runHook(s, b, 'reduceDamage', { ...ctx, value: 3, cause: 'perDie' }).value).toBe(1)
    const total = runHook(s, b, 'reduceDamage', { ...ctx, value: 6, cause: 'total' })
    expect(total.value).toBe(4)
    expect(runHook(s, b, 'reduceDamage', { ...ctx, value: 1, cause: 'total' }).value).toBe(1)
    // the attack's own effects end with its total damage
    expect(total.state.units['A-marines']!.effects).toEqual([])
  })

  it('REA-007 an INSTANT attack gets no enemy Reactions', () => {
    const s = medicDuel()
    const batch = { id: 'x', kind: 'ranged', keywords: [{ kw: 'INSTANT' }], attackerModelIds: [], weaponId: null, sourceId: null } as unknown as AttackBatch
    expect(runHook(s, b, 'reduceDamage', { ...hit(s, 6), batch }).raised).toBeUndefined()
  })

  it('REA-005 outside an Activation a decline hands the pending decision back and nothing is spent', () => {
    const s0 = medicDuel()
    const s = raiseDecision({ ...s0, activeUnit: null, active: null }, { seat: 'B', kind: 'test.idle', context: {}, canPass: false, options: [option('i', 'Idle', 'test.idle', {}, 'B')] })
    const r = runHook(s, b, 'reduceDamage', hit(s, 6))
    expect(r.raised).toBe(true)
    const skip = r.state.pending.options.find((o) => o.action.type === 'ability.skipReaction')!
    const done = abilities.resolve(r.state, b, skip.action)
    if (!('state' in done)) throw new Error(done.message)
    expect(done.state.pending.id).toBe(s.pending.id)
    expect(done.state.cards.A![0]!.exhausted).toBe(false)
    expect(done.state.reactionsUsed).toEqual([])
  })

  it('REA-008 a delayed effect that needs a spot at the End of the Round raises its decision instead of losing it (Psionic Transfer)', () => {
    let s = duelState(b, { roundPhase: 'scoring' })
    const r = runEffects(s, b, [{ op: 'place', x: 6, optional: true, at: { event: 'endOfRound' } }], { seat: 'A', sourceId: 'psionic-transfer', unitId: 'A-marines' })
    if (!('state' in r)) throw new Error(r.message)
    s = r.state
    const out = runHook(s, b, 'endOfRound', {})
    expect(out.raised).toBe(true)
    expect(out.state.pending.kind).toBe('ability.target')
    expect(out.state.pending.seat).toBe('A')
  })
})
