import { describe, expect, it, vi } from 'vitest'
import { abilities, abilityOptions, abilityRefs, canPay, costOf, dispatch, openWindow, pay, refreshCards, respawnModels, runDelayedStep, runEffects, spotAnswers, triggerUnitOf } from '../../src/engine/abilities'
import { coherencyState } from '../../src/engine/squads'
import { supplyFor } from '../../src/engine/supply'
import { closedEdges } from '../../src/engine/code-hooks'
import { addEffect, effectOps, hasStatus, setStatus, statOf, statusHeld, weaponProfile } from '../../src/engine/effects'
import { runHook } from '../../src/engine/hooks'
import type { CardState, GameState } from '../../src/engine/types'
import { bundle, duelState, squad } from './helpers'

// Owners M, A and T are still building: stand in for the calls the interpreter makes into their modules.
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
vi.mock('../../src/engine/damage', async (orig) => {
  const real = await orig<typeof import('../../src/engine/damage')>()
  const bump = (s: GameState, id: string, d: number): GameState => ({ ...s, units: { ...s.units, [id]: { ...s.units[id]!, damage: Math.max(0, s.units[id]!.damage + d) } } })
  return { ...real, addNonLethal: (s: GameState, _b: unknown, id: string, x: number) => bump(s, id, x), heal: (s: GameState, _b: unknown, id: string, x: number) => bump(s, id, -x) }
})

const b = bundle()
const card = (id: string, res: 'CP' | 'BM' | 'PE', n = 1, kind: CardState['kind'] = 'tactical'): CardState => ({ id, kind, exhausted: false, resource: { res, n }, usage: {} })

/** Round 1 Movement Phase, the Marines activating, one CP card for seat A. */
function movementDuel(cardsA: CardState[] = [card('barracks', 'CP')]): GameState {
  const s = duelState(b, { roundPhase: 'movement' })
  return { ...s, activeUnit: 'A-marines', cards: { A: cardsA, B: [] } }
}

const setStatusBurrowed = (s: GameState): GameState => setStatus(s, b, 'B-zerglings', 'BURROWED', 'gain', 'burrow')

function choose(s: GameState, type: string, match: Record<string, unknown> = {}) {
  const o = s.pending.options.find((x) => x.action.type === type && Object.entries(match).every(([k, v]) => x.action[k] === v))
  if (!o) throw new Error(`no ${type} option in ${s.pending.kind}: ${s.pending.options.map((p) => p.action.type).join(',')}`)
  const r = abilities.resolve(s, b, o.action)
  if (!('state' in r)) throw new Error(`${r.code}: ${r.message}`)
  return r.state
}

describe('abilities: windows, costs and the interpreter (spec 16 s1-5)', () => {
  it('ABL-020 ABL-021 ABL-023 an Active is offered in the window, paid, applied, and not offered again that Round', () => {
    const s = movementDuel()
    const opened = openWindow(s, b, 'A-marines', 'before')
    if (!('state' in opened)) throw new Error(opened.message)
    expect(opened.state.pending.kind).toBe('ability.window')
    expect(opened.state.pending.options.map((o) => o.action.abilityId)).toContain('stimpack')
    const base = statOf(s, b, 'A-marines', 'speed')!
    const after = choose(opened.state, 'ability.use', { abilityId: 'stimpack' })
    // paid with one CP card (least waste, then lowest opportunity cost), speed BUFF 3, PRECISION on the rifle, damage marker +2
    expect(after.cards.A!.filter((c) => c.exhausted)).toHaveLength(1)
    expect(statOf(after, b, 'A-marines', 'speed')).toBe(base + 3)
    expect(weaponProfile(after, b, 'A-marines', 'c-14-rifle')!.keywords).toContainEqual({ kw: 'PRECISION', x: 3 })
    expect(after.units['A-marines']!.damage).toBe(2)
    expect(abilityOptions(after, b, 'A-marines', 'before').map((o) => o.action.abilityId)).not.toContain('stimpack')
    // the end of the Round removes the BUFF, the keyword grant and nothing else
    const cleaned = runHook(after, b, 'cleanup', {}).state
    expect(statOf(cleaned, b, 'A-marines', 'speed')).toBe(base)
    expect(cleaned.cards.A!.every((c) => !c.exhausted)).toBe(true)
  })

  it('ABL-002 a cost nobody can pay keeps the Active out of the window; an unpayable use is refused with E_COST', () => {
    const s = movementDuel([])
    expect(abilityOptions(s, b, 'A-marines', 'before').map((o) => o.action.abilityId)).not.toContain('stimpack')
    const opened = openWindow(movementDuel([card('barracks', 'CP')]), b, 'A-marines', 'before')
    if (!('state' in opened)) throw new Error(opened.message)
    const drained = { ...opened.state, cards: { A: [{ ...card('barracks', 'CP'), exhausted: true }], B: [] } }
    const use = opened.state.pending.options.find((o) => o.action.abilityId === 'stimpack')!
    expect(abilities.resolve(drained, b, use.action)).toMatchObject({ code: 'E_NOT_LEGAL' })
  })

  it('CARD-004 paying N exhausts Ready cards worth at least N with the least waste; surplus is lost', () => {
    const s = movementDuel([card('a', 'CP', 2), card('b', 'CP', 1), card('c', 'CP', 1)])
    const one = pay(s, b, 'A', 'CP', 1)
    if (!('state' in one)) throw new Error(one.message)
    expect(one.state.cards.A!.map((c) => c.exhausted)).toEqual([false, true, false])
    const two = pay(s, b, 'A', 'CP', 2)
    if (!('state' in two)) throw new Error(two.message)
    expect(two.state.cards.A!.map((c) => c.exhausted)).toEqual([true, false, false])
    const three = pay(s, b, 'A', 'CP', 3)
    if (!('state' in three)) throw new Error(three.message)
    expect(three.state.cards.A!.filter((c) => c.exhausted)).toHaveLength(2)
    expect(canPay(s, b, 'A', 'CP', 5)).toBe(false)
    expect(pay(s, b, 'A', 'CP', 5)).toMatchObject({ code: 'E_COST' })
    expect(pay(s, b, 'A', 'BM', 1)).toMatchObject({ code: 'E_COST' })
    expect(pay(s, b, 'A', 'CP', 0)).toEqual({ state: s })
  })

  it('CARD-004 when two different cards pay equally well the player chooses (ability.pay)', () => {
    const s = movementDuel([card('barracks', 'CP'), card('academy', 'CP')])
    const r = pay(s, b, 'A', 'CP', 1, { cont: { k: 'pay' } })
    if (!('state' in r)) throw new Error(r.message)
    expect(r.state.pending.kind).toBe('ability.pay')
    expect(r.state.pending.options).toHaveLength(2)
    const pick = r.state.pending.options[1]!.action
    const paid = abilities.resolve(r.state, b, { ...pick })
    expect('state' in paid && paid.state.cards.A!.filter((c) => c.exhausted).map((c) => c.id)).toEqual(pick.cards)
    // a card that is not Ready, or two cards when one suffices, is not a payment
    expect(abilities.resolve(r.state, b, { ...pick, cards: ['barracks', 'academy'] })).toMatchObject({ code: 'E_COST' })
  })

  it('CARD-005 CARD-007 an Exhausted card gives nothing until Refresh flips it back', () => {
    const s = movementDuel([{ ...card('barracks', 'CP'), exhausted: true }])
    expect(canPay(s, b, 'A', 'CP', 1)).toBe(false)
    expect(canPay(refreshCards(s), b, 'A', 'CP', 1)).toBe(true)
  })

  it('CARD-006 a passive printed on an Exhausted card is off (Speed on Creep)', () => {
    let s = duelState(b)
    const z = s.models['B-zerglings.0']!.pos
    s = { ...s, cards: { A: [], B: [card('accelerating-creep', 'BM', 0, 'creep')] }, tokens: [{ id: 't', defId: 'creep-tumor', owner: 'B', sourceId: null, pos: { x: z.x, z: z.z + 1 }, elev: 0, round: 1 }] }
    expect(statusHeld(s, b, 'B-zerglings', 'ON_CREEP')).toBe(true)
    const base = statOf({ ...s, tokens: [] }, b, 'B-zerglings', 'speed')!
    expect(statOf(s, b, 'B-zerglings', 'speed')).toBe(base + 1)
    const tired = { ...s, cards: { ...s.cards, B: [{ ...s.cards.B![0]!, exhausted: true }] } }
    expect(statOf(tired, b, 'B-zerglings', 'speed')).toBe(base)
    // an Ally on the same creep does not get it: only the card owner's Units
    expect(statOf({ ...s, units: { ...s.units, 'B-zerglings': { ...s.units['B-zerglings']!, owner: 'A' } } }, b, 'B-zerglings', 'speed')).toBe(base)
  })

  it('ABL-030 ABL-008 passives are off in Reserves, and nothing works from Reserves unless the text says so', () => {
    const on = squad(b, { id: 'A-stalkers', owner: 'A', profileId: 'stalker', models: 1, at: { x: 5, z: 8 } })
    const off = squad(b, { id: 'A-stalkers2', owner: 'A', profileId: 'stalker', models: 1, at: { x: 5, z: 10 }, location: 'reserves' })
    const s = { ...duelState(b), units: { ...duelState(b).units, [on.unit.id]: on.unit, [off.unit.id]: off.unit }, models: { ...duelState(b).models, ...Object.fromEntries([...on.models, ...off.models].map((m) => [m.id, m])) } }
    expect(effectOps(s, b, 'A-stalkers', 'coherency')).toHaveLength(1)
    expect(effectOps(s, b, 'A-stalkers2', 'coherency')).toHaveLength(0)
    const withCards = { ...s, roundPhase: 'movement' as const, activeUnit: 'A-stalkers2', cards: { A: [card('barracks', 'CP')], B: [] } }
    expect(abilityOptions(withCards, b, 'A-stalkers2', 'before')).toEqual([])
  })

  it('CARD-008 cost modifiers apply before payment with a floor of 0 (Psionic Link; Raiders Roll! from Reserves)', () => {
    const q = squad(b, { id: 'B-queen', owner: 'B', profileId: 'queen', models: 1, at: { x: 0, z: -6 } })
    let s = duelState(b)
    s = { ...s, units: { ...s.units, [q.unit.id]: q.unit }, models: { ...s.models, ...Object.fromEntries(q.models.map((m) => [m.id, m])) }, cards: { A: [], B: [card('zerg-swarm', 'BM')] } }
    const ref = abilityRefs(s, b).find((r) => r.unitId === 'B-queen' && r.ability.id === 'spawn-creep-tumor')!
    expect(costOf(s, b, ref, 'B-queen')).toMatchObject({ res: 'BM', n: 0 })
    // too few friendly models around: full price
    const lone = { ...s, units: { ...s.units, 'B-zerglings': { ...s.units['B-zerglings']!, location: 'destroyed' as const } } }
    const fewer = { ...lone, models: Object.fromEntries(Object.entries(lone.models).map(([k, m]) => [k, m.unitId === 'B-zerglings' ? { ...m, life: 'dead' as const } : m])) }
    expect(costOf(fewer, b, ref, 'B-queen')).toMatchObject({ res: 'BM', n: 1 })
    // a Raynor's Raider in Reserves may Stimpack for one CP less
    const rr = squad(b, { id: 'A-raiders', owner: 'A', profileId: 'raynors-raider', models: 6, at: { x: 0, z: 14 }, location: 'reserves' })
    const t = { ...movementDuel(), units: { ...movementDuel().units, [rr.unit.id]: rr.unit }, models: { ...movementDuel().models, ...Object.fromEntries(rr.models.map((m) => [m.id, m])) } }
    const rref = abilityRefs(t, b).find((r) => r.unitId === 'A-raiders' && r.ability.id === 'stimpack')!
    expect(costOf(t, b, rref, 'A-raiders')).toMatchObject({ res: 'CP', n: 0 })
    const marine = abilityRefs(t, b).find((r) => r.unitId === 'A-marines' && r.ability.id === 'stimpack')!
    expect(costOf(t, b, marine, 'A-marines')).toMatchObject({ res: 'CP', n: 1 })
  })

  it('XPORT-003 a card Active with a table-edge target asks for the edge, then closes it (Comsat Station)', () => {
    const s = movementDuel([card('orbital-command', 'CP')])
    const opened = openWindow(s, b, 'A-marines', 'before')
    if (!('state' in opened)) throw new Error(opened.message)
    const picked = choose(opened.state, 'ability.use', { abilityId: 'comsat-station' })
    expect(picked.pending.kind).toBe('ability.target')
    const edges = picked.pending.options.map((o) => o.action.edge)
    expect(edges.length).toBeGreaterThan(0)
    const edge = edges[0] as string
    const done = choose(picked, 'ability.target', { mode: 'edge', edge })
    expect(closedEdges(done)).toEqual([{ edge, owner: 'A' }])
    expect(done.cards.A![0]!.exhausted).toBe(true)
  })

  it('VIS-010 VIS-011 Scanner Sweep sets a Faction Indicator anywhere and strips HIDDEN around it, with no targeting', () => {
    let s = movementDuel([card('orbital-command', 'CP')])
    s = { ...s, units: { ...s.units, 'B-zerglings': { ...s.units['B-zerglings']!, effects: [] } } }
    s = setStatusBurrowed(s)
    expect(hasStatus(s, 'B-zerglings', 'HIDDEN')).toBe(true)
    const opened = openWindow(s, b, 'A-marines', 'before')
    if (!('state' in opened)) throw new Error(opened.message)
    const asked = choose(opened.state, 'ability.use', { abilityId: 'scanner-sweep' })
    expect(asked.pending.kind).toBe('ability.target')
    const at = s.models['B-zerglings.0']!.pos
    const r = abilities.resolve(asked, b, { ...asked.pending.options[0]!.action, point: at })
    if (!('state' in r)) throw new Error(r.message)
    expect(r.state.tokens.map((t) => t.defId)).toEqual(['faction-indicator'])
    expect(r.state.detectors).toHaveLength(1)
    expect(hasStatus(r.state, 'B-zerglings', 'HIDDEN')).toBe(false)
    expect(hasStatus(r.state, 'B-zerglings', 'BURROWED')).toBe(true)
    // the indicator's area lapses with the Round
    expect(runHook(r.state, b, 'cleanup', {}).state.detectors).toHaveLength(0)
  })

  it('KW-043 ABL-004 Medpack heals one marker point per Medic model within 4" of the target, never below 0', () => {
    let s = movementDuel()
    const m = squad(b, { id: 'A-medics', owner: 'A', profileId: 'medic', models: 3, at: { x: 3.2, z: 6 } })
    s = { ...s, activeUnit: 'A-medics', units: { ...s.units, [m.unit.id]: m.unit, 'A-marines': { ...s.units['A-marines']!, damage: 2 } }, models: { ...s.models, ...Object.fromEntries(m.models.map((x) => [x.id, x])) } }
    const opened = openWindow(s, b, 'A-medics', 'before')
    if (!('state' in opened)) throw new Error(opened.message)
    expect(opened.state.pending.options.map((o) => o.action.abilityId)).toEqual(expect.arrayContaining(['medpack']))
    const done = choose(opened.state, 'ability.use', { abilityId: 'medpack' })
    expect(done.units['A-marines']!.damage).toBe(0)
  })

  it('ABL-026 effects granted by a Reaction or an Active last to the End of the Round unless stated', () => {
    let s = duelState(b)
    const r = runEffects(s, b, [{ op: 'buff', char: 'speed', x: 2 }, { op: 'status', status: 'HIDDEN', mode: 'gain', duration: 'untilNextAction' }],
      { seat: 'A', sourceId: 'test', unitId: 'A-marines' })
    if (!('state' in r)) throw new Error(r.message)
    s = r.state
    expect(s.units['A-marines']!.effects.map((e) => e.expires).sort()).toEqual(['endOfRound', 'untilAction'])
    expect(hasStatus(s, 'A-marines', 'HIDDEN')).toBe(true)
    s = addEffect(s, 'A-marines', { source: 'x', kind: 'status', status: 'SIEGE_MODE', expires: 'permanent', bySeat: 'A', round: 1 })
    const cleaned = runHook(s, b, 'cleanup', {}).state
    expect(hasStatus(cleaned, 'A-marines', 'HIDDEN')).toBe(true) // "until another action", not the Round
    expect(hasStatus(cleaned, 'A-marines', 'SIEGE_MODE')).toBe(true)
  })

  it('SUP-004 SUP-013 RESPAWN returns only as many models as keep the Unit in its Supply bracket, and reports them through the move hooks', () => {
    let s = duelState(b)
    const dead = s.units['B-zerglings']!.modelIds.slice(4)
    s = { ...s, models: { ...s.models, ...Object.fromEntries(dead.map((id) => [id, { ...s.models[id]!, life: 'dead' as const }])) } }
    expect(supplyFor(s, b, 'B-zerglings', 'pool')).toBe(0) // 4 Zerglings: bracket 1-6
    const back = respawnModels(s, b, 'B-zerglings', 4, 'test')
    const live = back.units['B-zerglings']!.modelIds.filter((id) => back.models[id]!.life !== 'dead')
    expect(live).toHaveLength(6) // 7 would be the next bracket: CSV never rises
    expect(supplyFor(back, b, 'B-zerglings', 'pool')).toBe(0)
    // the models came in through the one repositioning mechanism: its event is logged and Coherency is recomputed, not copied
    expect(back.events.some((e) => e.type === 'reposition' && e.kind === 'place' && e.unitId === 'B-zerglings')).toBe(true)
    expect(back.units['B-zerglings']!.inCoherency).toBe(coherencyState(back, b, 'B-zerglings').inCoherency)
    // nothing fits: a Unit already at the top of its bracket gets nothing back
    expect(respawnModels(back, b, 'B-zerglings', 2, 'test')).toBe(back)
  })

  it('ABL-031 a Passive that needs a spot (Burrow Ambush on nomination) hands its decision to the caller instead of losing it', () => {
    let s = duelState(b, { roundPhase: 'movement' })
    s = { ...s, units: { ...s.units, 'B-zerglings': { ...s.units['B-zerglings']!, location: 'reserves' as const, upgrades: [{ id: 'burrow-ambush' }] } }, models: Object.fromEntries(Object.entries(s.models).map(([k, m]) => [k, m.unitId === 'B-zerglings' ? { ...m, offTable: true } : m])) }
    const r = dispatch(s, b, 'nominatedToDeploy', { unitId: 'B-zerglings', seat: 'B' }, 'onArrive')
    expect(r.raised).toBe(true)
    expect(r.state.pending.kind).toBe('ability.target')
    expect(r.state.pending.seat).toBe('B')
  })

  it('ABL-032 `to: triggerUnit` is the trigger subject when it names one, otherwise the acting Unit', () => {
    const ctx = { unitId: 'B-zerglings', targetUnitId: 'A-marines', seat: 'B' }
    // Concussive Shells names a subject (the charged friend): triggerUnit is the one that charges
    expect(triggerUnitOf({ event: 'declareCharge', who: 'enemy', subject: 'friendly' }, ctx)).toBe('A-marines')
    // Malevolent Matriarch names none: it means the charger, even though the charge has a target
    expect(triggerUnitOf({ event: 'declareCharge', who: 'friendly' }, ctx)).toBe('B-zerglings')
  })

  it('ABL-026 an Active aura (Guardian Shield) is stored on the user, reaches friends in range, and ends with the Round', () => {
    let s = movementDuel()
    const r = runEffects(s, b, [{ op: 'aura', radius: 4, centre: 'self', affects: { side: 'friendly' }, effects: [{ op: 'rollMod', roll: 'armour', delta: 1 }], duration: 'endOfRound' }],
      { seat: 'A', sourceId: 'guardian-shield', unitId: 'A-marines', defaultDuration: 'endOfRound' })
    if (!('state' in r)) throw new Error(r.message)
    s = r.state
    expect(effectOps(s, b, 'A-marines', 'rollMod').length).toBeGreaterThan(0)
    expect(effectOps(s, b, 'B-zerglings', 'rollMod')).toHaveLength(0)
    expect(effectOps(runHook(s, b, 'cleanup', {}).state, b, 'A-marines', 'rollMod')).toHaveLength(0)
  })

  it('ABL-026 canEvade granted by an Active lasts to the End of the Round, not just the next attack (Mutating Carapace)', () => {
    const r = runEffects(movementDuel(), b, [{ op: 'canEvade', vs: ['all'], to: 'self' }], { seat: 'A', sourceId: 'mutating-carapace', unitId: 'A-marines', defaultDuration: 'endOfRound' })
    if (!('state' in r)) throw new Error(r.message)
    expect(runHook(r.state, b, 'afterAction', { unitId: 'A-marines', noPrompt: true }).state.units['A-marines']!.effects.map((e) => e.expires)).toEqual(['endOfRound'])
    // a Reaction or Passive keeps the short default
    const p = runEffects(movementDuel(), b, [{ op: 'canEvade', vs: ['all'], to: 'self' }], { seat: 'A', sourceId: 'x', unitId: 'A-marines' })
    if (!('state' in p)) throw new Error(p.message)
    expect(p.state.units['A-marines']!.effects.map((e) => e.expires)).toEqual(['thisAttack'])
  })

  it('XPORT-003 a spot off the table is refused, and a malformed point is E_BAD_PARAM rather than a silent first answer', () => {
    const s = movementDuel([card('orbital-command', 'CP')])
    const opened = openWindow(s, b, 'A-marines', 'before')
    if (!('state' in opened)) throw new Error(opened.message)
    const asked = choose(opened.state, 'ability.use', { abilityId: 'scanner-sweep' })
    const open = asked.pending.options[0]!.action
    const off = abilities.resolve(asked, b, { ...open, point: { x: 500, z: 0 } })
    expect('code' in off).toBe(true)
    for (const bad of [{ point: { x: Number.NaN, z: 0 } }, { point: 'x' }, { point: undefined, path: 'bad' }]) {
      const r = abilities.resolve(asked, b, { ...open, ...bad })
      expect('code' in r && r.code).toBe('E_BAD_PARAM')
    }
    // the bare template (no point, no path) still takes the first ready answer
    expect('state' in abilities.resolve(asked, b, { ...open, point: undefined })).toBe(true)
  })

  it('XPORT-003 spot answers do not depend on the seat: the other seat is offered the same spots turned half a circle', () => {
    const s = duelState(b)
    const c = [{ x: 2, z: 3 }]
    const a = spotAnswers(s, 'A', c, () => true)
    const z = spotAnswers(s, 'B', c, () => true)
    expect(a).toHaveLength(6)
    const mean = (ps: { x: number; z: number }[]) => ps.reduce((t, p) => t + p.x - c[0]!.x, 0) / ps.length
    expect(Math.abs(mean(a) + mean(z))).toBeLessThan(0.05)
    expect(z[1]).not.toEqual(a[1])
  })

  it('ABL-033 a delayed removeSelf keeps the summoned Unit it will remove (Rapid Ingress)', () => {
    const s = movementDuel([card('barracks', 'CP')])
    const r = runEffects(s, b, [{ op: 'summon', unit: 'point-defense-drone', minEnemyDist: 1, anywhere: true }, { op: 'removeSelf', to: 'summoned', at: { event: 'endOfRound' } }],
      { seat: 'A', sourceId: 'rapid-ingress', unitId: 'A-marines', point: { x: 5, z: 9 } })
    if (!('state' in r)) throw new Error(r.message)
    const drone = Object.keys(r.state.units).find((id) => r.state.units[id]!.profileId === 'point-defense-drone')!
    expect(drone).toBeDefined()
    const out = runDelayedStep(r.state, b, 'endOfRound')
    expect(out.suspended).toBe(false)
    expect(out.state.units[drone]?.location).not.toBe('table')
  })

  it('CARD-008 an aura that cuts a cost (Khalai Ingenuity) applies once per Round to a friend in range', () => {
    const pylon = squad(b, { id: 'A-pylon', owner: 'A', profileId: 'pylon', models: 1, at: { x: 3, z: 6 } })
    const st = squad(b, { id: 'A-stalkers', owner: 'A', profileId: 'stalker', models: 1, at: { x: 1, z: 6 } })
    let s = movementDuel()
    s = { ...s, units: { ...s.units, [pylon.unit.id]: pylon.unit, [st.unit.id]: st.unit }, models: { ...s.models, ...Object.fromEntries([...pylon.models, ...st.models].map((m) => [m.id, m])) } }
    const pe = abilityRefs(s, b).find((r) => r.unitId === 'A-stalkers' && r.ability.type === 'active' && r.ability.cost?.res === 'PE')
    expect(pe).toBeDefined()
    const full = pe!.ability.cost!.n as number
    const c = costOf(s, b, pe!, 'A-stalkers')!
    expect(c.n).toBe(Math.max(0, full - 1))
    expect(c.mods.map((m) => m.ability.id)).toContain('khalai-ingenuity')
    // spent: the second use in the Round pays in full
    const spent = { ...s, units: { ...s.units, 'A-pylon': { ...s.units['A-pylon']!, usage: { 'khalai-ingenuity:round:1': 1 } } } }
    expect(costOf(spent, b, pe!, 'A-stalkers')!.n).toBe(full)
  })

  it('ABL-024 a card Active aimed at the Unit being nominated from Reserves (Armed and Ready) is offered before its deploy only', () => {
    const z = squad(b, { id: 'A-raiders', owner: 'A', profileId: 'raynors-raider', models: 6, at: { x: 0, z: 14 }, location: 'reserves' })
    let s = movementDuel([card('barracks-proxy', 'CP')])
    s = { ...s, activeUnit: 'A-raiders', units: { ...s.units, [z.unit.id]: z.unit }, models: { ...s.models, ...Object.fromEntries(z.models.map((m) => [m.id, m])) } }
    expect(abilityOptions(s, b, 'A-raiders', 'before').map((o) => o.action.abilityId)).toContain('armed-and-ready')
    expect(abilityOptions(s, b, 'A-raiders', 'after').map((o) => o.action.abilityId)).not.toContain('armed-and-ready')
  })
})
