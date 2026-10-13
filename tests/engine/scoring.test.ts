// Phase 4: control, CLAIM, VP, end check, End of the Round, Cleanup & Refresh, initiative. Supply, removal, arrivals and
// the menu providers of other owners are replaced by small fakes (see turnflow.test.ts); scoring, missions, control and
// turnflow are the real code.
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { EditionBundle } from '../../src/data/types'
import { apply } from '../../src/engine/apply'
import { initialMarkers } from '../../src/engine/missions'
import { legalActions } from '../../src/engine/pending'
import { runScoring, stepCleanup, stepEndCheck, stepInitiative, stepVP } from '../../src/engine/scoring'
import type { Action, GameState, ModelState, SeatId, UnitState } from '../../src/engine/types'
import { bundle, duelState, squad } from './helpers'

const ctl = vi.hoisted(() => ({ arrivals: 0 }))
const quiet = vi.hoisted(() => (name: string) => async (orig: () => Promise<Record<string, unknown>>) => {
  const m = await orig()
  return { ...m, [name]: { ...(m[name] as object), options: () => [] } }
})
const csv = vi.hoisted(() => async (state: GameState, b: EditionBundle, unitId: string) => {
  const ed = await import('../../src/engine/edition')
  const u = state.units[unitId]!
  return ed.bracketSupply(ed.requireUnitDef(b, u.profileId), u.modelIds.filter((id) => state.models[id]!.life !== 'dead').length)
})
vi.mock('../../src/engine/supply', async () => {
  const ed = await import('../../src/engine/edition')
  return {
    supplyFor: (state: GameState, b: EditionBundle, unitId: string) => {
      const u = state.units[unitId]!
      return ed.bracketSupply(ed.requireUnitDef(b, u.profileId), u.modelIds.filter((id) => state.models[id]!.life !== 'dead').length)
    },
    canArrive: () => true, poolFor: () => 99, available: () => 99,
  }
})
// The one remover, faked: kills the models, marks a wiped unit destroyed and books the Supply drop on the owner's ledger.
vi.mock('../../src/engine/damage', async () => {
  const ed = await import('../../src/engine/edition')
  return {
    removeModels: (state: GameState, b: EditionBundle, unitId: string, ids: string[]) => {
      const u = state.units[unitId]!
      const count = (s: GameState) => ed.bracketSupply(ed.requireUnitDef(b, u.profileId), u.modelIds.filter((id) => s.models[id]!.life !== 'dead').length)
      const before = count(state)
      const models = { ...state.models, ...Object.fromEntries(ids.map((id) => [id, { ...state.models[id]!, life: 'dead' as const }])) }
      const s1 = { ...state, models }
      const lost = before - count(s1)
      const wiped = u.modelIds.every((id) => models[id]!.life === 'dead')
      const seat = state.seats[u.owner]!
      return {
        ...s1, units: { ...state.units, [unitId]: { ...u, location: wiped ? ('destroyed' as const) : u.location } },
        seats: { ...state.seats, [u.owner]: { ...seat, supplyLostThisRound: seat.supplyLostThisRound + (u.summoned ? 0 : lost) } },
      }
    },
  }
})
vi.mock('../../src/engine/hooks', async (orig) => ({ ...(await orig<typeof import('../../src/engine/hooks')>()), runHook: (state: GameState) => ({ state, mods: [] }) }))
vi.mock('../../src/engine/reserves', async (orig) => {
  const m = await quiet('reserves')(orig as never)
  return { ...m, resolveArrivals: (state: GameState) => { ctl.arrivals++; return { state, done: { modelId: '', type: 'deploy.drop', triggers: [] } } } }
})
vi.mock('../../src/engine/shooting', quiet('shooting'))
vi.mock('../../src/engine/charge', quiet('charge'))
vi.mock('../../src/engine/melee', quiet('melee'))
vi.mock('../../src/engine/attack', quiet('attack'))
vi.mock('../../src/engine/abilities', quiet('abilities'))
vi.mock('../../src/engine/movement', async (orig) => {
  const m = await orig<typeof import('../../src/engine/movement')>()
  return {
    ...m,
    movement: { ...m.movement, options: (s: GameState, _b: unknown, id: string) => (s.units[id] ? [{ id: 'go', label: 'Go', action: { type: 'move.go', decisionId: '', seat: s.units[id]!.owner } }] : []) },
  }
})
void csv

const b = bundle()
beforeEach(() => { ctl.arrivals = 0 })
const dep = (id: string) => b.records.deployments.find((d) => d.id === id)!
const mis = (id: string) => b.records.missions.find((m) => m.id === id)!
type Spec = { id: string; owner: SeatId; n: number; at: { x: number; z: number }; location?: UnitState['location'] }

/** A scene: no duel units, the given marine squads, markers from the Deployment Card, A red / B blue, scoring step reached. */
function scene(missionId: string, deploymentId: string, round: number, units: Spec[] = [], patch: Partial<GameState> = {}): GameState {
  const s0 = duelState(b, { missionId, deploymentId })
  const us: GameState['units'] = {}, ms: Record<string, ModelState> = {}
  for (const u of units) {
    const q = squad(b, { id: u.id, owner: u.owner, profileId: 'marine', models: u.n, at: u.at, ...(u.location ? { location: u.location } : {}) })
    us[u.id] = q.unit
    for (const m of q.models) ms[m.id] = m
  }
  return {
    ...s0, units: us, models: ms, round, roundPhase: 'scoring', maxRounds: mis(missionId).gameLength, firstPlayer: 'A', markers: initialMarkers(b, mis(missionId), dep(deploymentId)),
    scenario: { table: { w: dep(deploymentId).size.w, d: dep(deploymentId).size.h } }, ...patch,
  }
}
const ctrl = (s: GameState, ...pairs: [number, SeatId | null][]): GameState => ({
  ...s, markers: s.markers.map((m) => { const p = pairs.find((x) => x[0] === m.n); return p ? { ...m, controller: p[1] } : m }),
})
const lost = (s: GameState, a: number, bb: number): GameState => ({ ...s, seats: { A: { ...s.seats.A!, supplyLostThisRound: a }, B: { ...s.seats.B!, supplyLostThisRound: bb } } })
const types = (s: GameState) => legalActions(s).map((a) => a.type)
function step(s: GameState, pred: (a: Action) => boolean): GameState {
  const a = legalActions(s).find(pred)
  if (!a) throw new Error(`no legal action in ${s.pending.kind}: ${types(s).join(',')}`)
  const r = apply(s, b, a)
  if (!r.ok) throw new Error(r.rejection.message)
  return r.state
}

describe('scoring (Phase 4)', () => {
  it('VP-001 VP-002 both seats score the Supply the other lost this Round, from the same state', () => {
    const s = stepVP(lost(scene('hold-position-skirmish', 'abandoned-camp', 1), 2, 3), b)
    expect([s.seats.A!.vp, s.seats.B!.vp]).toEqual([3, 2])
    expect([s.seats.A!.score, s.seats.B!.score]).toEqual([3, 2]) // score mirrors vp
  })

  it('MSN-020 Hold Position from Round 2: 1 VP for own-colour or neutral markers, 2 VP for an opponent-colour marker', () => {
    const base = ctrl(scene('hold-position-skirmish', 'abandoned-camp', 2), [1, 'A'], [2, 'A'], [5, 'B'])
    const s = stepVP(base, b)
    expect([s.seats.A!.vp, s.seats.B!.vp]).toEqual([3, 1]) // A: marker 1 (own) 1 + marker 2 (Blue's) 2; B: neutral marker 5 1
    expect(stepVP({ ...base, round: 1 }, b).seats.A!.vp).toBe(0)
  })

  it('MSN-030 MSN-031 Frontlines: +2 VP for each marker taken from the opponent in this step 1, nothing for a never-held marker', () => {
    const base = ctrl(scene('frontlines-skirmish', 'abandoned-camp', 2), [1, 'A'], [2, 'A'])
    const events = [
      { type: 'markerControl', n: 1, from: null, to: 'A', round: 2 }, { type: 'markerControl', n: 2, from: 'B', to: 'A', round: 2 },
      { type: 'markerControl', n: 5, from: 'A', to: 'B', round: 1 },
    ]
    expect(stepVP({ ...base, events }, b).seats.A!.vp).toBe(2 + 2) // 1 VP per marker, +2 for marker 2 only
  })

  it('MSN-014 MSN-015 Supply Drop cashes each Activated marker you control for the Round it lit, then removes it (sticky control, no unit near)', () => {
    let s = ctrl(scene('supply-drop-skirmish', 'abandoned-camp', 3), [1, 'A'], [5, 'A'], [2, 'A'])
    s = { ...s, markers: s.markers.map((m) => (m.n === 1 ? { ...m, active: true, activatedRound: 2 } : m.n === 5 ? { ...m, active: true, activatedRound: 3 } : { ...m, active: false })) }
    const r = stepVP(s, b)
    expect(r.seats.A!.vp).toBe(5)
    expect(r.markers.filter((m) => !m.onTable).map((m) => m.n)).toEqual([1, 5])
    expect(stepVP({ ...s, round: 1 }, b).seats.A!.vp).toBe(0) // Skirmish scores from Round 2
  })

  it('MSN-050 MSN-051 MSN-052 Divide and Conquer: strictly higher Supply wins a quarter, a marker holder adds 1, marker 5 is worth 2', () => {
    const u: Spec[] = [
      { id: 'A-nw', owner: 'A', n: 6, at: { x: -9, z: -9 } }, { id: 'A-ne', owner: 'A', n: 6, at: { x: 9, z: -9 } },
      { id: 'B-ne', owner: 'B', n: 9, at: { x: 9, z: -14 } }, { id: 'A-sw', owner: 'A', n: 6, at: { x: -12, z: 2.5 } },
      { id: 'B-sw', owner: 'B', n: 6, at: { x: -9, z: 10 } },
    ]
    const s = ctrl(scene('divide-and-conquer-skirmish', 'abandoned-camp', 1, u), [1, 'A'], [5, 'A'])
    const r = stepVP(s, b)
    // NW: A 1 vs 0 -> A. NE: A 1 vs B 2 -> B. SW: A 1 + 1 (holds marker 1) vs B 1 -> A. Marker 5: A.
    expect([r.seats.A!.vp, r.seats.B!.vp]).toEqual([1 + 1 + 2, 1])
  })

  it('END-001 END-004 END-005 a lead of the Mission\'s size ends the game at step 3 and that seat wins; one short does not', () => {
    const s = scene('hold-position-skirmish', 'abandoned-camp', 2, [{ id: 'A-m', owner: 'A', n: 6, at: { x: 0, z: 10 } }, { id: 'B-m', owner: 'B', n: 6, at: { x: 0, z: -10 } }])
    const set = (a: number, bb: number): GameState => ({ ...s, seats: { A: { ...s.seats.A!, vp: a }, B: { ...s.seats.B!, vp: bb } } })
    const won = stepEndCheck(set(8, 0), b)
    expect(won.phase).toBe('over')
    expect(won.result?.winner).toBe('A')
    expect(won.pending.kind).toBe('turn.over')
    expect(stepEndCheck(set(8, 1), b).phase).toBe('play')
    const full = runScoring(set(0, 8), b)
    if ('code' in full) throw new Error(full.message)
    expect(full.state.result?.winner).toBe('B')
    expect(ctl.arrivals).toBe(0) // steps 4-6 were skipped
  })

  it('END-002 END-006 elimination gives the other seat the bonus VP, then totals decide; both gone at once gives nobody a bonus', () => {
    const live: Spec = { id: 'A-m', owner: 'A', n: 6, at: { x: 0, z: 10 } }
    const s = scene('hold-position-skirmish', 'abandoned-camp', 2, [live, { id: 'B-m', owner: 'B', n: 6, at: { x: 0, z: -10 }, location: 'destroyed' }])
    const dead = (st: GameState, owner: SeatId): GameState => ({ ...st, models: Object.fromEntries(Object.entries(st.models).map(([id, m]) => [id, m.owner === owner ? { ...m, life: 'dead' as const } : m])) })
    const e = stepEndCheck(dead(s, 'B'), b)
    expect(e.seats.A!.vp).toBe(10)
    expect(e.result?.winner).toBe('A')
    const comeback = stepEndCheck({ ...dead(s, 'B'), seats: { ...s.seats, B: { ...s.seats.B!, vp: 15 } } }, b)
    expect(comeback.result?.winner).toBe('B') // the eliminated seat can still win on VP
    const both = stepEndCheck(dead(dead(s, 'B'), 'A'), b)
    expect([both.seats.A!.vp, both.seats.B!.vp]).toEqual([0, 0])
    expect(both.result).toEqual(expect.objectContaining({ winner: null }))
  })

  it('END-003 FIN-002 FIN-003 the last Round ends the game: most VP wins, level VP is a draw', () => {
    const s = scene('hold-position-skirmish', 'abandoned-camp', 5, [{ id: 'A-m', owner: 'A', n: 6, at: { x: 0, z: 10 } }, { id: 'B-m', owner: 'B', n: 6, at: { x: 0, z: -10 } }])
    const withVp = (a: number, bb: number): GameState => ({ ...s, seats: { A: { ...s.seats.A!, vp: a }, B: { ...s.seats.B!, vp: bb } } })
    expect(stepEndCheck(withVp(4, 2), b).result?.winner).toBe('A')
    const tie = stepEndCheck(withVp(3, 3), b)
    expect(tie.phase).toBe('over')
    expect(tie.result?.winner).toBeNull()
    expect(stepEndCheck({ ...withVp(3, 3), round: 4 }, b).phase).toBe('play')
  })

  it('FIN-001 FIN-005 in the last Round Reserves are destroyed before step 1 and score for the opponent; a special win earlier does not sweep', () => {
    const units: Spec[] = [{ id: 'A-r', owner: 'A', n: 6, at: { x: 0, z: 10 }, location: 'reserves' }, { id: 'A-m', owner: 'A', n: 3, at: { x: 5, z: 12 } }, { id: 'B-m', owner: 'B', n: 6, at: { x: 0, z: -10 } }]
    const r = runScoring(scene('hold-position-skirmish', 'abandoned-camp', 5, units), b)
    if ('code' in r) throw new Error(r.message)
    expect(r.state.units['A-r']!.location).toBe('destroyed')
    expect(r.state.seats.B!.vp).toBe(1) // the sweep booked 1 Supply for B (6 marines = Supply 1)
    expect(r.state.result?.winner).toBe('B')
    const early = scene('hold-position-skirmish', 'abandoned-camp', 3, units, { seats: { A: { ...duelState(b).seats.A!, vp: 0 }, B: { ...duelState(b).seats.B!, vp: 8 } } })
    const e = runScoring(early, b)
    if ('code' in e) throw new Error(e.message)
    expect(e.state.units['A-r']!.location).toBe('reserves')
  })

  it('INIT-006 fewer VP takes the First Player Marker; a tie leaves it open for the next Roll-Off', () => {
    const s = scene('hold-position-skirmish', 'abandoned-camp', 2)
    const set = (a: number, bb: number): GameState => ({ ...s, seats: { A: { ...s.seats.A!, vp: a }, B: { ...s.seats.B!, vp: bb } } })
    expect(stepInitiative(set(5, 3), b).firstPlayer).toBe('B')
    expect(stepInitiative(set(2, 3), b).firstPlayer).toBe('A')
    expect(stepInitiative(set(3, 3), b).firstPlayer).toBeNull()
  })

  it('CLN-001 CLN-002 CLN-003 CLN-004 Cleanup removes markers and tokens, expires Round effects (also in Reserves), readies cards, resets the ledger', () => {
    const base = scene('hold-position-skirmish', 'abandoned-camp', 2, [{ id: 'A-m', owner: 'A', n: 6, at: { x: 0, z: 10 } }, { id: 'B-r', owner: 'B', n: 6, at: { x: 0, z: -10 }, location: 'reserves' }])
    const fx = (id: string, expires: 'endOfRound' | 'permanent') => ({ id, source: id, kind: 'buff' as const, stat: 'speed' as const, x: 1, expires, bySeat: 'A', round: 2 })
    const unit = (u: UnitState, activation: UnitState['activation'], effects: UnitState['effects']): UnitState => ({ ...u, activation, effects, noShootChargeRound: 2 })
    const s: GameState = {
      ...base,
      units: { 'A-m': unit(base.units['A-m']!, 'assault', [fx('x1', 'endOfRound'), fx('x2', 'permanent')]), 'B-r': unit(base.units['B-r']!, null, [fx('x3', 'endOfRound')]) },
      tokens: [{ id: 't1', defId: 'creep-tumor', owner: 'B', sourceId: 'B-r', pos: { x: 0, z: 0 }, elev: 0, round: 1 }],
      cards: { A: [{ id: 'barracks', kind: 'tactical', exhausted: true, resource: { res: 'CP', n: 1 }, usage: {} }], B: [] },
      seats: { A: { ...base.seats.A!, supplyLostThisRound: 4 }, B: base.seats.B! },
    }
    const r = stepCleanup(s, b)
    expect(r.units['A-m']!.activation).toBeNull()
    expect(r.units['A-m']!.effects.map((e) => e.id)).toEqual(['x2'])
    expect(r.units['B-r']!.effects).toEqual([])
    expect(r.cards.A![0]!.exhausted).toBe(false)
    expect(r.seats.A!.supplyLostThisRound).toBe(0)
    expect(r.tokens).toEqual([]) // no token in the data is STAY IN PLAY yet
    const keep: EditionBundle = { ...b, records: { ...b.records, units: b.records.units.map((u) => (u.id === 'marine' ? { ...u, tokens: [{ id: 'creep-tumor', name: 'x', baseMm: 25, size: 1, stayInPlay: true, text: '' }] } : u)) } }
    const kept = stepCleanup({ ...s, tokens: [{ ...s.tokens[0]!, sourceId: 'A-m' }] }, keep)
    expect(kept.tokens.length).toBe(1)
  })

  it('PH4-001 MRK-005 the pipeline runs in order and opens the next Round with the lower-VP seat holding the marker', () => {
    const units: Spec[] = [{ id: 'A-m', owner: 'A', n: 6, at: { x: 0, z: 10 } }, { id: 'B-m', owner: 'B', n: 6, at: { x: 0, z: -10 } }]
    const s = lost(scene('hold-position-skirmish', 'abandoned-camp', 1, units), 2, 0) // A lost 2 Supply, so B scores 2
    const r = runScoring({ ...s, firstPlayer: 'B' }, b)
    if ('code' in r) throw new Error(r.message)
    const out = r.state
    expect(out.seats.B!.vp).toBe(2)
    expect(ctl.arrivals).toBe(1) // step 4 ran
    expect(out.seats.A!.supplyLostThisRound).toBe(0) // step 5 ran
    expect(out.round).toBe(2)
    expect(out.firstPlayer).toBe('A') // step 6: A has fewer VP
    expect(out.pending).toMatchObject({ kind: 'turn.first', seat: 'A' })
    expect(Object.values(out.units).every((x) => x.activation === null)).toBe(true)
    const kinds = out.events.map((e) => e.type)
    expect(kinds.indexOf('vpScored')).toBeLessThan(kinds.indexOf('initiativeSet'))
  })

  it('MSN-063 CLAIM comes between control and VP, the marker holder first, one decision per claim', () => {
    const units: Spec[] = [{ id: 'A-m', owner: 'A', n: 6, at: { x: 12, z: 2.5 } }, { id: 'B-m', owner: 'B', n: 6, at: { x: -12, z: 2.5 } }]
    // Marker 2 is Blue's colour (Red's unit may claim it), marker 1 is Red's colour (Blue's unit may claim it).
    const s = ctrl(scene('artefact-hunt-skirmish', 'abandoned-camp', 2, units), [2, 'A'], [1, 'B'])
    let r = runScoring({ ...s, firstPlayer: 'B' }, b)
    if ('code' in r) throw new Error(r.message)
    let g = r.state
    expect(g.pending).toMatchObject({ kind: 'mission.claim', seat: 'B' })
    g = step(g, (a) => a.type === 'mission.claim' && a['marker'] === 1)
    expect(g.pending).toMatchObject({ kind: 'mission.claim', seat: 'A' })
    expect(g.markers.find((m) => m.n === 1)).toMatchObject({ onTable: false, claimedBy: 'B-m' })
    g = step(g, (a) => a.type === 'mission.claim' && a['decline'] === true)
    expect(g.round).toBe(3) // the pipeline went on to the end of Phase 4
    expect(g.markers.find((m) => m.n === 2)!.onTable).toBe(true)
    expect(g.markers.find((m) => m.n === 1)!.claimedBy).toBe('B-m')
  })
})
