// GOLD-*: the rulebook's learn-to-play battle (R Part 1, Terrans vs Zergs on Frontlines / Abandoned Camp, spec 60 s2).
// The narrative skips moves and does not log every roll, so this is a chain of checkpoints, not a replay: each one
// builds the position the text describes with fixtures, feeds the printed dice through state.debug.forcedDice
// (spec 00 s7), submits actions through apply() where a decision exists, and asserts the printed result. Unit numbers
// come from the card data (never from the narrative); where the two disagree the current rules are asserted and the
// difference is a RULING in the integrator's report.
// Seats: A = Terran (red, near edge S), B = Zerg (blue, far edge N).
import { describe, expect, it } from 'vitest'
import { runEffects } from '../../src/engine/abilities'
import { apply } from '../../src/engine/apply'
import { impactBatch, resolveBatch } from '../../src/engine/attack'
import { impactOf } from '../../src/engine/charge'
import { allAbilities, deploymentDef, missionDef, requireUnitDef, tableOf } from '../../src/engine/edition'
import { initialMarkers, missionVP } from '../../src/engine/missions'
import { missionScore, objectiveStatus, supplyStatus } from '../../src/engine/query'
import { isRejection } from '../../src/engine/registry'
import { createGame, gameDefaults } from '../../src/engine/setup'
import { openActivation, startPhase, startRound } from '../../src/engine/turnflow'
import type { Action, GameState, RoundPhase, SeatId, TerrainInstance, UnitState } from '../../src/engine/types'
import { bundle, squad, ter, withForcedDice, type SquadSpec } from './helpers'

const b = bundle()

interface FieldOpts { round?: number; phase?: RoundPhase; firstPlayer?: SeatId; terrain?: TerrainInstance[]; activation?: Record<string, UnitState['activation']> }
/** The worked example's table: Frontlines (Skirmish), Abandoned Camp, Terran red at the S edge, Zerg blue at the N edge. */
function field(specs: SquadSpec[], o: FieldOpts = {}): GameState {
  const mission = missionDef(b, 'frontlines-skirmish')!
  const dep = deploymentDef(b, 'abandoned-camp')!
  const sq = specs.map((x) => squad(b, x))
  const s0 = gameDefaults('golden', ['A', 'B'], b.edition)
  return {
    ...s0, phase: 'play', round: o.round ?? 1, roundPhase: o.phase ?? 'movement', firstPlayer: o.firstPlayer ?? 'A', active: null,
    missionId: mission.id, deploymentId: dep.id, maxRounds: mission.gameLength, scenario: { table: tableOf(dep) },
    markers: initialMarkers(b, mission, dep), terrain: o.terrain ?? [],
    seats: { A: { ...s0.seats.A!, colour: 'red', faction: 'terran' }, B: { ...s0.seats.B!, colour: 'blue', faction: 'zerg' } },
    models: Object.fromEntries(sq.flatMap((x) => x.models).map((m) => [m.id, m])),
    units: Object.fromEntries(sq.map((x) => [x.unit.id, { ...x.unit, activation: o.activation?.[x.unit.id] ?? x.unit.activation }])),
  }
}

/** The option of the open decision whose action matches `want` (type plus the given fields). */
function pick(s: GameState, want: Partial<Action> & { type: string }): Action {
  const o = s.pending.options.find((x) => Object.entries(want).every(([k, v]) => JSON.stringify(x.action[k]) === JSON.stringify(v)))
  if (!o) throw new Error(`no option ${JSON.stringify(want)} in ${s.pending.kind}: ${s.pending.options.map((x) => x.id).join(', ')}`)
  return o.action
}
function step(s: GameState, a: Action): GameState {
  const r = apply(s, b, a)
  if (!r.ok) throw new Error(`${a.type} rejected: ${r.rejection.code} ${r.rejection.message}`)
  return r.state
}
/** Answer the decisions of one activation (Close Ranks skipped, first option otherwise) until the turn moves on. */
function finishActivation(s0: GameState): GameState {
  let s = s0
  for (let i = 0; i < 20 && !s.pending.kind.startsWith('turn.'); i++) {
    const skip = s.pending.options.find((o) => o.action['skip'] === true || o.id === 'skip')
    s = step(s, (skip ?? s.pending.options[0]!).action)
  }
  return s
}
const stages = (s: GameState, from: number) => s.events.slice(from).filter((e) => e.type === 'atk.stage') as unknown as { step: string; [k: string]: unknown }[]

// Marauders (2) and Roaches (3, or 2 after the first exchange) standing Engaged in the middle of the table.
const engaged = (roaches: number, marauderDamage = 0, roachDamage = 0, phase: RoundPhase = 'assault'): GameState => {
  const s = field([
    { id: 'A-marauders', owner: 'A', profileId: 'marauder', models: 2, at: { x: 0, z: 1.2 }, perRow: 2 },
    { id: 'B-roaches', owner: 'B', profileId: 'roach', models: roaches, at: { x: roaches === 3 ? 0 : 1.235, z: -1.2 }, perRow: 3 },
  ], { phase, activation: phase === 'combat' ? { 'A-marauders': 'assault', 'B-roaches': 'assault' } : { 'A-marauders': 'movement', 'B-roaches': 'movement' } })
  return { ...s, units: { ...s.units, 'A-marauders': { ...s.units['A-marauders']!, damage: marauderDamage }, 'B-roaches': { ...s.units['B-roaches']!, damage: roachDamage } } }
}

describe('golden: the learn-to-play battle (R Part 1)', () => {
  it('GOLD-01 initiative Roll-Off 7 vs 5; the Zerg winner hands the First Player Marker to the Terran (R p.6)', () => {
    const made = createGame(b, { seed: 'golden', preset: 'first-battle', seats: ['A', 'B'] })
    expect(made.missionId).toBe('frontlines-skirmish')
    expect(made.deploymentId).toBe('abandoned-camp')
    // Re-run the Start of Round 1 with the printed dice: Katherine (A) 2+3 = 5, James (B) 3+4 = 7.
    let s = startRound(withForcedDice({ ...made, round: 0, firstPlayer: null, events: [] }, [2, 3, 3, 4]), b)
    expect(s.pending.kind).toBe('setup.firstPlayer')
    expect(s.pending.seat).toBe('B')
    s = step(s, pick(s, { type: 'setup.firstPlayer', holder: 'A' }))
    expect(s.firstPlayer).toBe('A')
    expect(s.roundPhase).toBe('movement')
    expect(s.pending.kind).toBe('turn.first')
    expect(s.pending.seat).toBe('A')
  })

  it('GOLD-02 Round 1 Pool 3: with 3 Supply on the table and nothing that fits, the only answer is Pass, and the first Pass takes the marker (R p.9)', () => {
    const s0 = field([
      { id: 'A-marines', owner: 'A', profileId: 'marine', models: 6, at: { x: -6, z: 10 } },
      { id: 'A-medics', owner: 'A', profileId: 'medic', models: 3, at: { x: 0, z: 12 } },
      { id: 'A-marauders', owner: 'A', profileId: 'marauder', models: 2, at: { x: 6, z: 10 }, perRow: 2 },
      { id: 'A-marines2', owner: 'A', profileId: 'marine', models: 6, at: { x: 0, z: 30 }, location: 'reserves' },
      { id: 'B-zerglings', owner: 'B', profileId: 'zergling', models: 12, at: { x: 0, z: -10 }, perRow: 6 },
    ], { firstPlayer: 'B', activation: { 'A-marines': 'movement', 'A-medics': 'movement', 'A-marauders': 'movement' } })
    const sup = supplyStatus(s0, b, 'A')
    expect(sup).toMatchObject({ pool: 3, onTable: 3, available: 0, canArriveNow: [] })
    let s = openActivation(s0, b, 'A')
    expect(s.pending.options.map((o) => o.action.type)).toEqual(['turn.pass'])
    s = step(s, s.pending.options[0]!.action)
    expect(s.firstPlayer).toBe('A')
    expect(s.firstPasser.movement).toBe('A')
    expect(s.pending.seat).toBe('B')
  })

  it('GOLD-03 the Roaches charge (Speed + D6) and IMPACT: 6 dice, 3 hits, Armour 4+ saves 2, 1 Damage on the Marauders (R p.11)', () => {
    // the Charge roll: Speed 4 (a squad uses the first value) + a 6 reaches the Marauders 6" away
    const far = field([
      { id: 'A-marauders', owner: 'A', profileId: 'marauder', models: 2, at: { x: 0, z: 3 }, perRow: 2 },
      { id: 'B-roaches', owner: 'B', profileId: 'roach', models: 3, at: { x: 0, z: -5 }, perRow: 3 },
    ], { phase: 'assault', activation: { 'A-marauders': 'movement', 'B-roaches': 'movement' } })
    let s = openActivation(far, b, 'B')
    s = step(s, pick(s, { type: 'charge.go', unitId: 'B-roaches' }))
    s = step(withForcedDice(s, [6]), pick(s, { type: 'charge.targets', targetIds: ['A-marauders'] }))
    const rolled = s.events.find((e) => e.type === 'charge.rolled') as unknown as { roll: number; speed: number; distance: number }
    expect(rolled).toMatchObject({ roll: 6, speed: 4, distance: 10 })
    expect(s.pending.kind).toBe('charge.path')
    s = step(s, pick(s, { type: 'charge.path', auto: true }))
    expect(s.events.some((e) => e.type === 'charge.succeeded')).toBe(true)

    // IMPACT (2) 4+ per ranked Roach: three Roaches roll 6 dice; the printed 3 hits, then Armour 4+ on 3 dice saves 2
    const imp = impactOf(engaged(3), b, 'B-roaches')!
    expect(imp).toMatchObject({ x: 2, y: 4 })
    const st = withForcedDice({ ...engaged(3), activeUnit: 'B-roaches' }, [4, 5, 6, 1, 2, 3, 4, 5, 1])
    const r = impactBatch(st, b, { seat: 'B', sourceId: 'impact', attackerUnitId: 'B-roaches', targetUnitId: 'A-marauders', dice: imp.x * 3, y: imp.y })
    expect(r.batch!.dieGroups[0]!.count).toBe(3)
    const done = resolveBatch(r.state, b, r.batch!, 'armour', 'charge')
    if (isRejection(done)) throw new Error(done.message)
    expect(done.state.units['A-marauders']!.damage).toBe(1)
    expect(done.state.units['A-marauders']!.modelIds.every((id) => done.state.models[id]!.life === 'active')).toBe(true)
  })

  it('GOLD-04 Marauders shoot the Roaches they are Engaged with: Surge 2 skips Armour, Evade is allowed, PIERCE (2) kills a Roach (R p.12)', () => {
    let s = openActivation(engaged(3), b, 'A')
    s = step(s, pick(s, { type: 'shoot.go', unitId: 'A-marauders' }))
    expect(s.pending.options.every((o) => o.action['done'] === true || o.action['targetUnitId'] === 'B-roaches')).toBe(true)
    const from = s.events.length
    // 6 dice at 3+: 5 hits; Surge D3 shows 2; Armour 3+ on 3 dice saves 2; Evade 5+ on 3 dice saves 1
    s = step(withForcedDice(s, [6, 5, 4, 3, 3, 1, 3, 3, 4, 2, 5, 1, 2]), pick(s, { type: 'shoot.batch', weaponId: 'quad-k12', targetUnitId: 'B-roaches' }))
    const st = stages(s, from)
    expect(st.find((e) => e.step === 'hit')).toMatchObject({ hits: 5, surge: { result: 2 } })
    expect(st.find((e) => e.step === 'surge')).toMatchObject({ tagMatch: true, surgeMoved: 2 })
    expect(st.find((e) => e.step === 'armour')).toMatchObject({ tn: 3, saved: 2, toDamage: 1 })
    expect(st.find((e) => e.step === 'evade')).toMatchObject({ eligible: true, tn: 5, evaded: 1, remaining: 2 })
    expect(st.find((e) => e.step === 'damage')).toMatchObject({ dice: 2, perDie: 2, total: 4 })
    const live = s.units['B-roaches']!.modelIds.filter((id) => s.models[id]!.life === 'active')
    expect(live).toHaveLength(2)
    expect(s.units['B-roaches']!.damage).toBe(0)
  })

  it('GOLD-05 Combat: Roach claws add 2 to the carried Marauder marker (3, no kill); the Marauders answer and leave 1 on the Roaches (R p.13)', () => {
    let s = openActivation(engaged(2, 1, 0, 'combat'), b, 'B')
    s = step(s, pick(s, { type: 'melee.go', unitId: 'B-roaches' }))
    // 2 Roaches x RoA 2 at 4+: all 4 hit; Armour 4+ on 4 dice saves 2
    s = finishActivation(withForcedDice(s, [4, 5, 6, 6, 4, 5, 1, 2]))
    expect(s.units['A-marauders']!.damage).toBe(3)
    expect(s.units['A-marauders']!.modelIds.every((id) => s.models[id]!.life === 'active')).toBe(true)
    expect(s.pending.seat).toBe('A')
    s = step(s, pick(s, { type: 'melee.go', unitId: 'A-marauders' }))
    // 2 Marauders x RoA 2 at 4+: 2 hit; Armour 3+ on 2 dice saves 1
    s = finishActivation(withForcedDice(s, [4, 4, 1, 2, 3, 1]))
    expect(s.units['B-roaches']!.damage).toBe(1)
  })

  it('GOLD-06 Round 1 Scoring gives no VP (no Supply lost, markers score from Round 2); level VP means a Roll-Off, Zerg wins and takes the marker (R p.14)', () => {
    const s0 = field([
      { id: 'A-marines', owner: 'A', profileId: 'marine', models: 6, at: { x: 0, z: 2 } },
      { id: 'B-zerglings', owner: 'B', profileId: 'zergling', models: 12, at: { x: 0, z: -8 }, perRow: 6 },
    ], { phase: 'combat', firstPlayer: 'B' })
    // Roll-Off at the Start of Round 2 (2D6 each, R 3.2): Katherine 1+1, James 1+2
    const s = startPhase(withForcedDice(s0, [1, 1, 1, 2]), b, 'scoring')
    expect(s.seats.A!.vp).toBe(0)
    expect(s.seats.B!.vp).toBe(0)
    expect(s.markers.find((m) => m.n === 5)!.controller).toBe('A')
    expect(s.round).toBe(2)
    expect(s.firstPlayer).toBe('B')
    expect(s.pending.kind).toBe('turn.first')
    expect(s.pending.seat).toBe('B')
  })

  it('GOLD-07 Stimpack puts 2 NON-LETHAL Damage on 2 HP Marines without a casualty; MedPack from 3 Medics heals it all (R p.15, p.17)', () => {
    let s = field([
      { id: 'A-marines', owner: 'A', profileId: 'marine', models: 6, at: { x: 0, z: 6 } },
      { id: 'A-medics', owner: 'A', profileId: 'medic', models: 3, at: { x: 0, z: 9.5 } },
    ])
    const ab = (unit: string, id: string) => allAbilities(requireUnitDef(b, unit)).find((a) => a.id === id)!
    const stim = runEffects(s, b, ab('marine', 'stimpack').effects, { seat: 'A', sourceId: 'stimpack', unitId: 'A-marines' })
    if (isRejection(stim)) throw new Error(stim.message)
    s = stim.state
    expect(s.units['A-marines']!.damage).toBe(2)
    expect(s.units['A-marines']!.modelIds.every((id) => s.models[id]!.life === 'active')).toBe(true)
    const med = runEffects(s, b, ab('medic', 'medpack').effects, { seat: 'A', sourceId: 'medpack', unitId: 'A-medics', targetUnitId: 'A-marines' })
    if (isRejection(med)) throw new Error(med.message)
    expect(med.state.units['A-marines']!.damage).toBe(0)
  })

  it('GOLD-08 Roach acid on the one Marauder they see: 3 + marker 3 = 6 kills a 5 HP model, the leftover is discarded, Supply drops and Zerg scores 1 VP (R p.19)', () => {
    const wall = ter('wall', 'obstacle', 0, 6.25, 2, 11.5, 4, { size: 3 })
    const s0 = field([
      { id: 'A-marauders', owner: 'A', profileId: 'marauder', models: 2, at: { x: 2, z: -1 }, perRow: 1 },
      { id: 'B-roaches', owner: 'B', profileId: 'roach', models: 2, at: { x: -6, z: -1 }, perRow: 1 },
    ], { phase: 'assault', round: 2, terrain: [wall], activation: { 'A-marauders': 'movement', 'B-roaches': 'movement' } })
    // the second Marauder stands behind the wall
    let s: GameState = { ...s0, models: { ...s0.models, 'A-marauders.1': { ...s0.models['A-marauders.1']!, pos: { x: 2, z: 6 } } }, units: { ...s0.units, 'A-marauders': { ...s0.units['A-marauders']!, damage: 3 } } }
    s = openActivation(s, b, 'B')
    s = step(s, pick(s, { type: 'shoot.go', unitId: 'B-roaches' }))
    // 6 dice at 3+: 4 hits; Armour 4+ on 4 dice saves 1
    s = step(withForcedDice(s, [3, 4, 5, 6, 1, 2, 4, 1, 2, 3]), pick(s, { type: 'shoot.batch', weaponId: 'acid-saliva', targetUnitId: 'A-marauders' }))
    expect(s.models['A-marauders.0']!.life).toBe('dead')
    expect(s.models['A-marauders.1']!.life).toBe('active')
    expect(s.units['A-marauders']!.damage).toBe(0)
    expect(s.seats.A!.supplyLostThisRound).toBe(1)
    expect(missionVP(s, b, 'B')).toBe(1)
  })

  it('GOLD-11 Round 2 Scoring: Marker 5 held by Marines (1) and Medics (1) against the Queen (1) is Terran, 1 VP each for Supply lost: 2 to 1 (R p.27)', () => {
    let s = field([
      { id: 'A-marines', owner: 'A', profileId: 'marine', models: 4, at: { x: -2, z: 1.5 }, perRow: 4 },
      { id: 'A-medics', owner: 'A', profileId: 'medic', models: 3, at: { x: 2.5, z: 2.5 } },
      { id: 'B-queen', owner: 'B', profileId: 'queen', models: 1, at: { x: 0, z: -2.5 } },
    ], { round: 2, phase: 'combat' })
    s = { ...s, seats: { A: { ...s.seats.A!, supplyLostThisRound: 1 }, B: { ...s.seats.B!, supplyLostThisRound: 1 } } }
    const five = objectiveStatus(s, b).find((o) => o.n === 5)!
    expect(five.totals).toEqual({ A: 2, B: 1 })
    expect(five.controller).toBe('A')
    expect(five.vpNow).toEqual({ A: 1, B: 0 })
    expect(missionScore(s, b, 'A').vpIfScoredNow).toBe(2)
    expect(missionScore(s, b, 'B').vpIfScoredNow).toBe(1)
    const after = startPhase(s, b, 'scoring')
    expect(after.seats.A!.vp).toBe(2)
    expect(after.seats.B!.vp).toBe(1)
    expect(after.firstPlayer).toBe('B') // fewer VP takes the First Player Marker
  })
})
