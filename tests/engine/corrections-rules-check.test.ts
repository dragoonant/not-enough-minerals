// The 2026-10-16 rules-check corrections (tools/out/rules-check-pass.md), against the real engine (no mocks).
// Names follow docs/spec/12-rules-test-checklist.md IDs where one fits.
import { describe, expect, it } from 'vitest'
import { abilities, dispatch, openWindow, runEffects } from '../../src/engine/abilities'
import { charge } from '../../src/engine/charge'
import { removeModels } from '../../src/engine/damage'
import { addEffect, expireEffects } from '../../src/engine/effects'
import { isRejection } from '../../src/engine/errors'
import { baseRadius, dist, edgeDistance } from '../../src/engine/geometry'
import { runHook } from '../../src/engine/hooks'
import { melee } from '../../src/engine/melee'
import { coherencyState } from '../../src/engine/squads'
import type { Action, CardState, GameState, ModelState, Rejection, TerrainInstance, Vec2 } from '../../src/engine/types'
import { bundle, duelState, squad, ter, withForcedDice, type SquadSpec } from './helpers'

const b = bundle()
const ok = <T>(r: T | Rejection): T => { if (isRejection(r)) throw new Error(`${r.code}: ${r.message}`); return r }
type Ev = { type: string; [k: string]: unknown }

/** An open table holding exactly these squads (and terrain). */
function arena(specs: SquadSpec[], terrain: TerrainInstance[] = [], at: Partial<GameState> = {}): GameState {
  const s0 = duelState(b)
  const sq = specs.map((x) => squad(b, x))
  return {
    ...s0, terrain, ...at,
    models: Object.fromEntries(sq.flatMap((x) => x.models).map((m) => [m.id, m])),
    units: Object.fromEntries(sq.map((x) => [x.unit.id, x.unit])),
  }
}
const put = (s: GameState, at: Record<string, Vec2>): GameState =>
  ({ ...s, models: { ...s.models, ...Object.fromEntries(Object.entries(at).map(([id, pos]) => [id, { ...s.models[id]!, pos }])) } })
const kill = (s: GameState, ids: string[]): GameState =>
  ({ ...s, models: { ...s.models, ...Object.fromEntries(ids.map((id) => [id, { ...s.models[id]!, life: 'dead' as const }])) } })
const act = (type: string, f: Record<string, unknown> = {}): Action => ({ type, decisionId: 'x', seat: 'A', ...f }) as Action
const card = (id: string, res: 'CP' | 'BM' | 'PE', n = 1): CardState => ({ id, kind: 'tactical', exhausted: false, resource: { res, n }, usage: {} })
const liveOf = (s: GameState, u: string): ModelState[] => s.units[u]!.modelIds.map((id) => s.models[id]!).filter((m) => m.life === 'active' && !m.offTable)
const gapTo = (a: ModelState, o: ModelState): number => edgeDistance(a.pos, a.base, o.pos, o.base)

describe('rules-check corrections 2026-10-16', () => {
  // ------------------------------------------------------------ 1. Summoned Supply losses score (F p.5)
  it('VP-001 SUP-063 a Summoned Unit losing a Supply bracket is recorded like any other drop (F p.5 beats the old ruling)', () => {
    let s = arena([{ id: 'm', owner: 'A', profileId: 'marine', models: 9, at: { x: 0, z: 0 } }])
    s = { ...s, units: { ...s.units, m: { ...s.units.m!, summoned: true } } }
    const out = removeModels(s, b, 'm', ['m.0', 'm.1', 'm.2'], 'attack')
    expect(out.seats.A!.supplyLostThisRound).toBe(1)
  })

  // ------------------------------------------------------------ 2/3. first-weapon grants last to End of Round
  it('ABL-026 Orders (CRITICAL HIT) and Wild Mutation (PRECISION) are data-declared to last until the End of the Round', () => {
    const raynor = b.records.units.find((u) => u.id === 'jim-raynor')!
    const orders = raynor.abilities.find((a) => a.id === 'orders')!
    const crit = orders.options!.find((o) => o.id === 'crit')!.effects.find((e) => e.op === 'grantKeyword')!
    expect(crit.duration).toBe('endOfRound')
    const swarm = b.records.cards.find((c) => c.id === 'kerrigans-swarm')!
    const wild = swarm.abilities.find((a) => a.id === 'wild-mutation')!.effects.find((e) => e.op === 'grantKeyword')!
    expect(wild.duration).toBe('endOfRound')
  })

  it('ABL-026 a first-weapon grant survives an action with no weapon fired and is used up by the first weapon', () => {
    let s = duelState(b, { roundPhase: 'movement' })
    s = { ...s, activeUnit: 'A-marines' }
    s = addEffect(s, 'A-marines', { source: 'orders', kind: 'keyword', kw: { kw: 'CRITICAL_HIT', x: 2 }, weapons: { first: true }, expires: 'endOfRound', bySeat: 'A', round: 1 })
    const grants = (st: GameState) => st.units['A-marines']!.effects.filter((e) => e.source === 'orders').length
    // the unit moves (no weapon): the grant is still there, also after the Phase turns over
    s = { ...s, events: [...s.events, { type: 'turn.begin', unitId: 'A-marines' }, { type: 'reposition', unitId: 'A-marines' }] as GameState['events'] }
    s = runHook(s, b, 'afterAction', { seat: 'A', unitId: 'A-marines', phase: 'movement' }).state
    expect(grants(s)).toBe(1)
    s = expireEffects(expireEffects(s, b, 'endOfPhase'), b, 'endOfActivation')
    expect(grants(s)).toBe(1)
    // later it fires: the grant goes after that action
    s = { ...s, roundPhase: 'assault', events: [...s.events, { type: 'turn.begin', unitId: 'A-marines' }, { type: 'shoot.fire', unitId: 'A-marines', targetUnitId: 'B-zerglings', weaponId: 'c14' }] as GameState['events'] }
    s = runHook(s, b, 'afterAction', { seat: 'A', unitId: 'A-marines', phase: 'assault' }).state
    expect(grants(s)).toBe(0)
  })

  // ------------------------------------------------------------ 4. coherency link past enemies
  it('COH-005 a link passes only an enemy the unit is actually Engaged with: a Size 2 wall between them blocks it', () => {
    const base = arena([
      { id: 'u', owner: 'A', profileId: 'marine', models: 2, at: { x: 0, z: 0 } },
      { id: 'e', owner: 'B', profileId: 'zergling', models: 1, at: { x: 8, z: 8 } },
    ])
    const line = put(base, { 'u.0': { x: 0, z: 0 }, 'u.1': { x: 2.8, z: 0 }, 'e.0': { x: 1.4, z: 0.45 } })
    // Engaged (open ground): the link passes through the enemy
    expect(coherencyState(line, b, 'u').inCoherency).toBe(true)
    // the same enemy is within 1" of both ends, but a Size 2 wall beside the line keeps it from being Engaged: it blocks
    const walled = { ...line, terrain: [ter('w', 'obstruction', 1.4, 0.2, 6, 0.1, 2, { size: 2 })] }
    expect(coherencyState(walled, b, 'u').inCoherency).toBe(false)
  })

  // ------------------------------------------------------------ 5. split melee keywords
  describe('KW-031 split melee Batch: the attacker allocates PRECISION', () => {
    const C = 32 / 25.4
    function split(): GameState {
      let s = arena([
        { id: 'M', owner: 'A', profileId: 'zealot', models: 2, at: { x: 20, z: 0 } },
        { id: 'Z1', owner: 'B', profileId: 'zergling', models: 1, at: { x: 16, z: -C } },
        { id: 'Z2', owner: 'B', profileId: 'zergling', models: 1, at: { x: 24, z: -C } },
      ], [], { roundPhase: 'combat' })
      s = put(s, { 'M.0': { x: 16, z: 0 }, 'M.1': { x: 24, z: 0 }, 'Z1.0': { x: 16, z: -C }, 'Z2.0': { x: 24, z: -C } })
      s = addEffect(s, 'M', { source: 'x', kind: 'keyword', kw: { kw: 'PRECISION', x: 2 }, expires: 'endOfRound', bySeat: 'A', round: 1 })
      return { ...s, activeUnit: 'M' }
    }
    const precisionOf = (s: GameState, target: string): number => (s.events as Ev[]).find((e) => e.type === 'atk.stage' && e.step === 'hit' && String(e.batchId).endsWith(`:${target}`))!.precision as number

    it('the split asks where PRECISION (2) goes, and the options cover each pool or an even split', () => {
      const menu = ok(melee.resolve(split(), b, act('melee.go', { unitId: 'M' })))
      expect(menu.state.pending.kind).toBe('melee.split')
      const pick = menu.state.pending.options.find((o) => o.action.surgeTarget === 'Z2')!
      const asked = ok(melee.resolve(menu.state, b, pick.action))
      expect(asked.state.pending.kind).toBe('melee.keywords')
      expect(asked.state.pending.options.map((o) => o.action.to).sort()).toEqual(['Z1', 'Z2', 'even'])
    })

    it('all PRECISION on the non-Surge pool, and an even split, both reach the pools as chosen', () => {
      const menu = ok(melee.resolve(split(), b, act('melee.go', { unitId: 'M' })))
      const pick = menu.state.pending.options.find((o) => o.action.surgeTarget === 'Z2')!
      const asked = ok(melee.resolve(withForcedDice(menu.state, Array(40).fill(1)), b, pick.action))
      const onZ1 = ok(melee.resolve(asked.state, b, act('melee.keywords', { unitId: 'M', key: asked.state.pending.context.key, to: 'Z1' })))
      expect(precisionOf(onZ1.state, 'Z1')).toBeGreaterThan(0) // the Surge target is Z2, yet Z1 got the PRECISION
      expect(precisionOf(onZ1.state, 'Z2')).toBe(0)
      const even = ok(melee.resolve(asked.state, b, act('melee.keywords', { unitId: 'M', key: asked.state.pending.context.key, to: 'even' })))
      expect(precisionOf(even.state, 'Z1')).toBe(1)
      expect(precisionOf(even.state, 'Z2')).toBe(1)
    })
  })

  // ------------------------------------------------------------ 6. IMPACT split
  it('ATK-091 the player splits a model\'s IMPACT dice between the Units it ranks against (custom per-model split)', () => {
    let s = arena([
      { id: 'Z', owner: 'B', profileId: 'zergling', models: 1, at: { x: 20, z: 0 } },
      { id: 'M1', owner: 'A', profileId: 'marine', models: 1, at: { x: 21.2, z: 0 } },
      { id: 'M2', owner: 'A', profileId: 'marine', models: 1, at: { x: 18.8, z: 0 } },
    ], [], { roundPhase: 'assault', active: 'B' })
    s = put(s, { 'Z.0': { x: 20, z: 0 }, 'M1.0': { x: 21.2, z: 0 }, 'M2.0': { x: 18.8, z: 0 } })
    s = addEffect(s, 'Z', { source: 'x', kind: 'mod', data: { op: 'impactBonus', dicePerModel: 3 }, expires: 'endOfRound', bySeat: 'B', round: 1 })
    s = { ...s, activeUnit: 'Z', events: [...s.events, { type: 'charge.succeeded', unitId: 'Z', targets: ['M1', 'M2'] }] as GameState['events'] }
    const asked = ok(charge.resume!(s, b))
    expect(asked.state.pending.kind).toBe('charge.impact')
    const ids = asked.state.pending.options.map((o) => o.id)
    expect(ids).toEqual(expect.arrayContaining(['even', 'all:M1', 'all:M2', 'custom']))
    const bad = charge.resolve(asked.state, b, act('charge.impact', { unitId: 'Z', custom: true, split: { 'Z.0': { M1: 1, M2: 1 } } }))
    expect(isRejection(bad)).toBe(true) // must add up to X (1 + 3 dice)
    const out = ok(charge.resolve(withForcedDice(asked.state, Array(8).fill(6)), b, act('charge.impact', { unitId: 'Z', custom: true, split: { 'Z.0': { M1: 3, M2: 1 } } })))
    const rolled = (out.state.events as Ev[]).filter((e) => e.type === 'atk.stage' && e.step === 'impact')
    expect(rolled.map((e) => (e.dice as number[]).length).sort()).toEqual([1, 3])
    expect(String(rolled.find((e) => (e.dice as number[]).length === 3)!.batchId)).toContain(':M1')
  })

  // ------------------------------------------------------------ Advanced Training is optional
  describe('REA-001 Advanced Training is a Reaction the player chooses (R p.82 10.4)', () => {
    function stim(): GameState {
      const s = duelState(b, { roundPhase: 'movement' })
      return { ...s, activeUnit: 'A-marines', units: { ...s.units, 'A-marines': { ...s.units['A-marines']!, slot: 'support' } },
        cards: { A: [card('barracks', 'CP'), card('academy', 'CP')], B: [] } }
    }
    function toDecision(): GameState {
      const opened = ok(openWindow(stim(), b, 'A-marines', 'before'))
      const use = opened.state.pending.options.find((o) => o.action.abilityId === 'stimpack')!
      return ok(abilities.resolve(opened.state, b, use.action)).state
    }
    it('asks first: use it (free, Reaction spent) or pay the full price and keep the Reaction', () => {
      const asked = toDecision()
      expect(asked.pending.kind).toBe('ability.target')
      expect(asked.pending.options.map((o) => o.action.use)).toEqual([true, false])
      const used = ok(abilities.resolve(asked, b, asked.pending.options[0]!.action)).state
      expect(used.reactionsUsed).toContain('A')
      expect(used.cards.A!.filter((c) => c.exhausted)).toHaveLength(0)
      let paid = ok(abilities.resolve(asked, b, asked.pending.options[1]!.action)).state
      if (paid.pending.kind === 'ability.pay') paid = ok(abilities.resolve(paid, b, act('ability.pay', { cards: ['barracks'] }))).state
      expect(paid.reactionsUsed).not.toContain('A')
      expect(paid.cards.A!.filter((c) => c.exhausted)).toHaveLength(1)
    })
  })

  // ------------------------------------------------------------ RESPAWN
  describe('KW-049 RESPAWN sets each returned model in base contact with the Unit, outside enemy Engagement Range', () => {
    const hurt = (): GameState => {
      const s = arena([{ id: 'Z', owner: 'B', profileId: 'zergling', models: 8, at: { x: 0, z: 0 }, perRow: 4 }])
      return kill(s, ['Z.3', 'Z.4', 'Z.5', 'Z.6', 'Z.7'])
    }
    const ctx = { seat: 'B', sourceId: 'test', unitId: 'Z' }

    it('the player picks the spot: the offered spots touch a model, an off-contact spot is refused, and skipping returns none', () => {
      const r = ok(runEffects(hurt(), b, [{ op: 'respawn', x: 2 }], ctx))
      expect(r.state.pending.kind).toBe('ability.target')
      const spots = r.state.pending.context.points as Vec2[]
      expect(spots.length).toBeGreaterThan(0)
      const far = abilities.resolve(r.state, b, act('ability.target', { mode: 'point', point: { x: 9, z: 9 }, seat: 'B' }))
      expect(isRejection(far)).toBe(true)
      const first = ok(abilities.resolve(r.state, b, act('ability.target', { mode: 'point', seat: 'B' })))
      expect(first.state.pending.kind).toBe('ability.target') // the second model
      const done = ok(abilities.resolve(first.state, b, act('ability.target', { mode: 'point', seat: 'B' })))
      const back = liveOf(done.state, 'Z')
      expect(back).toHaveLength(5)
      for (const m of back.filter((x) => ['Z.3', 'Z.4'].includes(x.id))) {
        expect(back.some((o) => o.id !== m.id && Math.abs(gapTo(m, o)) <= 0.05)).toBe(true) // base contact
        expect(m.hp).toBe(b.records.units.find((u) => u.id === 'zergling')!.stats.hp)
      }
      const none = ok(abilities.resolve(r.state, b, act('ability.target', { mode: 'skip', seat: 'B' })))
      expect(liveOf(none.state, 'Z')).toHaveLength(3)
    })

    it('no returned model stands within Engagement Range of an enemy', () => {
      let s = hurt()
      const enemy = squad(b, { id: 'M', owner: 'A', profileId: 'marine', models: 1, at: { x: 0, z: 2.6 } })
      s = { ...s, units: { ...s.units, M: enemy.unit }, models: { ...s.models, [enemy.models[0]!.id]: enemy.models[0]! } }
      const r = ok(runEffects(s, b, [{ op: 'respawn', x: 2 }], ctx))
      const spots = r.state.pending.context.points as Vec2[]
      const mm = s.models['M.0']!
      for (const p of spots) expect(Math.max(0, dist(p, mm.pos) - baseRadius(mm.base) - baseRadius(25))).toBeGreaterThan(1)
    })
  })

  // ------------------------------------------------------------ MORPH + multi-subject resume
  describe('KW-046 MORPH sets ONE new model in base contact, then removes X models', () => {
    function roaches(): GameState {
      return arena([{ id: 'R', owner: 'B', profileId: 'roach', models: 3, at: { x: 0, z: 0 } }], [], { roundPhase: 'movement' })
    }
    const ctx = { seat: 'B', sourceId: 'test', unitId: 'R' }

    it('one Ravager appears in base contact with a Roach (a Unit of its own), then one Roach is removed', () => {
      const s = { ...roaches(), units: { ...roaches().units, R: { ...roaches().units.R!, activation: 'movement' as const } } }
      const r = ok(runEffects(s, b, [{ op: 'morph', unit: 'ravager', x: 1 }], ctx))
      expect(r.state.pending.kind).toBe('ability.target')
      const out = ok(abilities.resolve(r.state, b, act('ability.target', { mode: 'point', seat: 'B' })))
      const newId = Object.keys(out.state.units).find((id) => out.state.units[id]!.profileId === 'ravager')!
      expect(newId).toBeTruthy()
      expect(liveOf(out.state, newId)).toHaveLength(1)
      expect(liveOf(out.state, 'R')).toHaveLength(2)
      const rav = liveOf(out.state, newId)[0]!
      expect(liveOf(out.state, 'R').some((m) => gapTo(rav, m) <= 0.05)).toBe(true) // base contact (the removed Roach may have been the one touched)
      expect(out.state.units[newId]!.activation).toBe('movement') // cannot activate again this Round
      expect(out.state.seats.B!.supplyLostThisRound).toBeGreaterThanOrEqual(0)
    })

    it('a spot not touching the Unit is refused', () => {
      const r = ok(runEffects(roaches(), b, [{ op: 'morph', unit: 'ravager', x: 1 }], ctx))
      const bad = abilities.resolve(r.state, b, act('ability.target', { mode: 'point', point: { x: 9, z: 9 }, seat: 'B' }))
      expect(isRejection(bad)).toBe(true)
    })
  })

  describe('ABL-031 a list over several Units resumes the rest after the first one raised a decision', () => {
    it('RESPAWN on two Units: the second Unit is asked after the first has answered', () => {
      let s = arena([
        { id: 'Z1', owner: 'B', profileId: 'zergling', models: 8, at: { x: -10, z: 0 }, perRow: 4 },
        { id: 'Z2', owner: 'B', profileId: 'zergling', models: 8, at: { x: 10, z: 0 }, perRow: 4 },
      ])
      s = kill(kill(s, ['Z1.3', 'Z1.4', 'Z1.5', 'Z1.6', 'Z1.7']), ['Z2.3', 'Z2.4', 'Z2.5', 'Z2.6', 'Z2.7'])
      const r = ok(runEffects(s, b, [{ op: 'respawn', x: 1, to: 'allFriendly' }], { seat: 'B', sourceId: 'test', unitId: 'Z1' }))
      const first = r.state.pending.context.cont as { unitId: string }
      const second = ok(abilities.resolve(r.state, b, act('ability.target', { mode: 'point', seat: 'B' })))
      expect(second.state.pending.kind).toBe('ability.target')
      const next = second.state.pending.context.cont as { unitId: string }
      expect(next.unitId).not.toBe(first.unitId) // not skipped: the other Unit is now asked
      const end = ok(abilities.resolve(second.state, b, act('ability.target', { mode: 'point', seat: 'B' })))
      expect(liveOf(end.state, 'Z1')).toHaveLength(4)
      expect(liveOf(end.state, 'Z2')).toHaveLength(4)
    })
  })

  // ------------------------------------------------------------ charge: needed on the payload
  describe('CHG-008 the charge events carry `needed`; a declared Charge cannot be taken back', () => {
    it('charge.declared and charge.rolled carry the smallest D6 face that makes it, and the targets decision has no way out', () => {
      const s0 = { ...duelState(b, { gap: 6 }), activeUnit: 'A-marines' }
      const t = ok(charge.resolve(s0, b, act('charge.go', { unitId: 'A-marines' })))
      expect(t.state.pending.kind).toBe('charge.targets')
      expect(t.state.pending.canPass).toBe(false)
      expect(t.state.pending.options.every((o) => o.action.type === 'charge.targets')).toBe(true)
      const pick = t.state.pending.options.find((o) => (o.action.targetIds as string[]).join() === 'B-zerglings')!
      const p = ok(charge.resolve(withForcedDice(t.state, [4]), b, pick.action))
      const declared = (p.state.events as Ev[]).find((e) => e.type === 'charge.declared')!
      const rolled = (p.state.events as Ev[]).find((e) => e.type === 'charge.rolled')!
      expect(typeof declared.needed).toBe('number')
      expect(rolled.needed).toBe(declared.needed)
    })
  })
})

void dispatch
