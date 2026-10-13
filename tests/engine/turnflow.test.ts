// The Round and the Phases: alternating activation, Pass, the First Player Marker, Activation Markers, Start of the Round.
// The other owners' modules are replaced by tiny fakes: movement offers one `move.go` menu entry per unit and finishes it
// at once, Engagement and Supply answer from a table, the after-action window closes at once, Scoring just records that
// it was entered. Everything else (apply, registry, turnflow, missions, effects, dice) is the real code.
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { EditionBundle } from '../../src/data/types'
import { apply } from '../../src/engine/apply'
import { eligible, startPhase, startRound } from '../../src/engine/turnflow'
import { legalActions } from '../../src/engine/pending'
import { FIRST_PLAYER_LOCK } from '../../src/engine/code-hooks'
import { hasStatus } from '../../src/engine/effects'
import type { Action, GameState, RoundPhase } from '../../src/engine/types'
import { bundle, duelState, squad } from './helpers'

const ctl = vi.hoisted(() => ({ engaged: new Set<string>(), canArrive: true, scoringCalls: 0, log: [] as string[], windowRaises: false, stampUnit: false }))
// Menu providers owned by other people are silenced: only the fake movement module offers an entry.
const quiet = vi.hoisted(() => (name: string) => async (orig: () => Promise<Record<string, unknown>>) => {
  const m = await orig()
  return { ...m, [name]: { ...(m[name] as object), options: () => [] } }
})
vi.mock('../../src/engine/engage', () => ({ isEngaged: (_s: unknown, _b: unknown, id: string) => ctl.engaged.has(id) }))
vi.mock('../../src/engine/supply', () => ({ canArrive: () => ctl.canArrive, supplyFor: () => 0, poolFor: () => 99, available: () => 99 }))
// abilities imports turnflow (a cycle), so it is replaced whole instead of wrapped: the window and the delayed runner just log.
vi.mock('../../src/engine/abilities', () => ({
  abilities: { id: 'abilities', kinds: ['ability'], options: () => [], resolve: () => ({ code: 'E_UNKNOWN_KIND', message: 'stub' }) },
  openWindow: (state: GameState, _b: unknown, unitId: string, w: string) => {
    ctl.log.push(`window:${w}:${unitId}`)
    return { state, done: { modelId: '', type: 'ability.window', triggers: [] } }
  },
  runDelayed: (state: GameState, _b: unknown, event: string, phase?: string) => { ctl.log.push(`delayed:${event}:${phase}`); return state },
  raiseRecall: (state: GameState) => state, abilityRefs: () => [], dispatch: (state: GameState) => ({ state }),
  offerKhala: () => null, refreshCards: (state: GameState) => state, runDelayedStep: (state: GameState) => ({ state, suspended: false }),
}))
vi.mock('../../src/engine/hooks', () => ({ HOOK_POINTS: [], HOOK_WIRING: {}, POINT_EVENTS: {}, setHookTracer: () => {}, runHook: (state: GameState, _b: unknown, hook: string) => { ctl.log.push(`hook:${hook}`); return { state, mods: [] } } }))
vi.mock('../../src/engine/shooting', quiet('shooting'))
vi.mock('../../src/engine/charge', quiet('charge'))
vi.mock('../../src/engine/melee', quiet('melee'))
vi.mock('../../src/engine/attack', quiet('attack'))
vi.mock('../../src/engine/reserves', quiet('reserves'))
vi.mock('../../src/engine/scoring', () => ({
  scoring: { id: 'scoring', kinds: ['score'], options: () => [], resolve: () => ({ code: 'E_UNKNOWN_KIND', message: 'stub' }) },
  runScoring: (state: GameState) => { ctl.scoringCalls++; return { state: { ...state, roundPhase: 'scoring' } } },
  resumeScoring: (state: GameState) => ({ state }),
}))
vi.mock('../../src/engine/movement', async (orig) => {
  const m = await orig<typeof import('../../src/engine/movement')>()
  return {
    ...m,
    movement: {
      ...m.movement,
      options: (s: GameState, _b: unknown, unitId: string) => {
        const u = s.units[unitId]
        return u ? [{ id: 'go', label: 'Go', action: { type: 'move.go', decisionId: '', seat: u.owner, ...(ctl.stampUnit ? { unitId } : {}) } }] : []
      },
      resolve: (s: GameState, _b: unknown, a: Action) => { ctl.log.push(`resolve:${a['unitId']}`); return { state: s, done: { modelId: a['unitId'], unitId: a['unitId'], type: 'move.go', triggers: [] } } },
    },
  }
})

const b = bundle()
beforeEach(() => { ctl.engaged.clear(); ctl.canArrive = true; ctl.stampUnit = false; ctl.scoringCalls = 0; ctl.log = [] })

/** The duel with every unit's marker set as given and the holder named; the caller starts the Phase. */
function base(opts: { holder?: string; markers?: Record<string, 'movement' | 'assault' | null> } = {}): GameState {
  const s = duelState(b)
  const units = Object.fromEntries(Object.entries(s.units).map(([id, u]) => [id, { ...u, activation: opts.markers?.[id] ?? null }]))
  return { ...s, units, firstPlayer: opts.holder ?? 'A', roundPhase: null, active: null }
}
function step(s: GameState, pred: (a: Action) => boolean): GameState {
  const a = legalActions(s).find(pred)
  if (!a) throw new Error(`no legal action in ${s.pending.kind}: ${legalActions(s).map((x) => x.type).join(',')}`)
  const r = apply(s, b, a)
  if (!r.ok) throw new Error(r.rejection.message)
  return r.state
}
const types = (s: GameState) => legalActions(s).map((a) => a.type)
const go = (seat: string) => (a: Action) => a.type === 'move.go' && a.seat === seat
const first = (seat: string) => (a: Action) => a.type === 'turn.first' && a['first'] === seat
const pass = (a: Action) => a.type === 'turn.pass'

describe('turnflow (Round, Phases, activation, Pass)', () => {
  it('RND-002 a Phase with nothing eligible ends at once with both seats Passing, all the way to Scoring', () => {
    const s = startPhase(base({ markers: { 'A-marines': 'assault', 'B-zerglings': 'assault' } }), b, 'movement')
    expect(s.roundPhase).toBe('scoring')
    expect(ctl.scoringCalls).toBe(1)
    const passes = s.events.filter((e) => e.type === 'passed')
    expect(passes.length).toBe(6) // three Phases, two seats
    expect(passes.every((e) => (e as { forced?: boolean }).forced === true)).toBe(true)
  })

  it('INIT-002 ACT-001 ACT-005 MRK-002 the holder names the first activator, then seats alternate; each activation leaves a Movement marker', () => {
    let s = startPhase(base(), b, 'movement')
    expect(s.pending).toMatchObject({ kind: 'turn.first', seat: 'A' })
    s = step(s, first('B'))
    expect(s.pending).toMatchObject({ kind: 'turn.activate', seat: 'B' })
    expect(types(s)).toEqual(expect.arrayContaining(['move.go', 'turn.hold', 'turn.pass'])) // ACT-002, ACT-003
    s = step(s, go('B'))
    expect(s.units['B-zerglings']!.activation).toBe('movement')
    expect(s.pending).toMatchObject({ kind: 'turn.activate', seat: 'A' })
    s = step(s, (a) => a.type === 'turn.hold' && a.seat === 'A') // Hold counts as the action
    expect(s.units['A-marines']!.activation).toBe('movement')
    expect(s.pending).toMatchObject({ kind: 'turn.activate', seat: 'B' })
    expect(types(s)).toEqual(['turn.pass']) // ACT-003: nothing eligible left, only Pass
  })

  it('PASS-001 Pass is always offered in Phases 1-2; in Combat only when nothing is eligible', () => {
    const m1 = startPhase(base(), b, 'movement')
    expect(types(step(m1, first('A')))).toContain('turn.pass')
    ctl.engaged.add('A-marines')
    let s = startPhase(base({ markers: { 'A-marines': 'assault', 'B-zerglings': 'assault' } }), b, 'combat')
    s = step(s, first('A'))
    expect(types(s)).toEqual(['move.go']) // an Engaged unit must activate: no Pass
    s = step(s, go('A'))
    expect(s.units['A-marines']!.activation).toBeNull() // MRK-004: the marker is removed after the attack
    expect(s.pending).toMatchObject({ seat: 'B' })
    expect(types(s)).toEqual(['turn.pass']) // PH3-004: nothing eligible, so it must Pass
  })

  it('INIT-003 INIT-004 PH1-004 ACT-004 the first Pass of Phase 1 takes the marker and marks the Passer; the other seat plays on alone', () => {
    let s = startPhase(base({ holder: 'B' }), b, 'movement')
    s = step(s, first('A'))
    s = step(s, pass)
    expect(s.firstPlayer).toBe('A') // taken at the moment of the first Pass
    expect(s.units['A-marines']!.activation).toBe('movement')
    expect(s.pending).toMatchObject({ kind: 'turn.activate', seat: 'B' })
    s = step(s, go('B'))
    expect(s.pending).toMatchObject({ seat: 'B' }) // A has passed: B keeps taking turns (ACT-004)
    s = step(s, pass)
    expect(s.roundPhase).toBe('assault')
    expect(s.passed).toEqual([]) // PASS-002
    expect(s.pending).toMatchObject({ kind: 'turn.first', seat: 'A' }) // the new holder names the first activator in Phase 2
  })

  it('PH2-003 INIT-003 a Pass in Assault flips Movement markers and passes the marker on; a Pass in Combat does not', () => {
    const markers = { 'A-marines': 'movement', 'B-zerglings': 'movement' } as const
    let s = startPhase(base({ holder: 'A', markers }), b, 'assault')
    s = step(s, first('B'))
    s = step(s, pass)
    expect(s.firstPlayer).toBe('B')
    expect(s.units['B-zerglings']!.activation).toBe('assault')
    expect(s.units['A-marines']!.activation).toBe('movement') // only the Passer's units flip so far
    s = step(s, pass) // A passes too
    expect(s.units['A-marines']!.activation).toBe('assault')
    ctl.engaged.add('B-zerglings')
    let c = startPhase(base({ holder: 'B', markers: { 'A-marines': 'assault', 'B-zerglings': 'assault' } }), b, 'combat')
    c = step(c, first('A'))
    c = step(c, pass) // A is forced to Pass first
    expect(c.firstPlayer).toBe('B')
    expect(c.firstPasser.combat).toBe('A')
  })

  it('INIT-007 a forced Pass counts: the seat with nothing eligible Passes first in Phase 1 and takes the marker', () => {
    let s = startPhase(base({ holder: 'A', markers: { 'B-zerglings': 'movement' } }), b, 'movement')
    s = step(s, first('B'))
    expect(types(s)).toEqual(['turn.pass'])
    s = step(s, pass)
    expect(s.firstPlayer).toBe('B')
  })

  it('PH1-001 PH2-001 PH3-001 eligibility per Phase: markers, Reserves, Engagement, Flying', () => {
    const s = base()
    const at = (p: RoundPhase, id = 'A-marines', st = s) => eligible(st, b, id, p)
    expect(at('movement')).toBe(true)
    expect(at('assault')).toBe(false)
    const marked = (m: 'movement' | 'assault' | null) => ({ ...s, units: { ...s.units, 'A-marines': { ...s.units['A-marines']!, activation: m } } })
    expect(at('movement', 'A-marines', marked('movement'))).toBe(false)
    expect(at('assault', 'A-marines', marked('movement'))).toBe(true)
    expect(at('combat', 'A-marines', marked('assault'))).toBe(false) // not Engaged
    ctl.engaged.add('A-marines')
    expect(at('combat', 'A-marines', marked('assault'))).toBe(true)
    expect(at('combat', 'A-marines', marked(null))).toBe(false) // already fought: no marker left
    const flyer: EditionBundle = { ...b, records: { ...b.records, units: b.records.units.map((u) => (u.id === 'marine' ? { ...u, combatTags: [...u.combatTags, 'flying' as const] } : u)) } }
    expect(eligible(marked('assault'), flyer, 'A-marines', 'combat')).toBe(false)
  })

  it('PH1-002 a unit in Reserves is eligible in Phase 1 only when its Supply fits, and never in Phase 2', () => {
    const s0 = base()
    const s = { ...s0, units: { ...s0.units, 'A-marines': { ...s0.units['A-marines']!, location: 'reserves' as const } } }
    expect(eligible(s, b, 'A-marines', 'movement')).toBe(true)
    ctl.canArrive = false
    expect(eligible(s, b, 'A-marines', 'movement')).toBe(false)
    expect(eligible(s, b, 'A-marines', 'assault')).toBe(false)
  })

  it('RND-010 RND-011 RND-012 INIT-001 SET-004 mission steps roll before the Roll-Off, the winner assigns the marker, every unit gains STATIONARY', () => {
    const s0 = { ...base(), firstPlayer: null, round: 0, missionId: 'supply-drop-standard', deploymentId: 'gauntlet', markers: [] as GameState['markers'] }
    const m = b.records.missions.find((x) => x.id === 'supply-drop-standard')!
    const d = b.records.deployments.find((x) => x.id === 'gauntlet')!
    const withMarkers = { ...s0, markers: d.markers.map((k) => ({ n: k.n, pos: { x: 0, z: 0 }, elev: 0, side: 'neutral' as const, active: m.markerStart === 'activated', onTable: true, controller: null, controlledSinceRound: null, claimedBy: null, activatedRound: null })) }
    let s = startRound(withMarkers, b)
    expect(s.round).toBe(1)
    const rolls = s.events.filter((e) => e.type === 'DiceRolled')
    expect(rolls[0]!['purpose']).toBe('marker') // F p.2: the marker roll comes first
    expect(rolls.slice(1).every((e) => e['purpose'] === 'initiative')).toBe(true)
    expect(s.markers.filter((k) => k.active).length).toBe(1)
    expect(s.pending.kind).toBe('setup.firstPlayer')
    const winner = s.pending.seat as string
    s = step(s, (a) => a.type === 'setup.firstPlayer' && a['holder'] !== winner) // the winner may hand it to the opponent
    expect(s.firstPlayer).not.toBe(winner)
    expect(s.roundPhase).toBe('movement')
    expect(s.pending).toMatchObject({ kind: 'turn.first', seat: s.firstPlayer })
    expect(Object.keys(s.units).every((id) => hasStatus(s, id, 'STATIONARY'))).toBe(true)
  })

  it('INIT-006 RND-011 after a VP tie the next Start of the Round rolls off and the winner takes the marker with no choice', () => {
    const s = startRound({ ...base(), firstPlayer: null, round: 1 }, b)
    expect(s.round).toBe(2)
    expect(s.firstPlayer).not.toBeNull()
    expect(s.events.some((e) => e.type === 'initiative')).toBe(true)
    expect(s.pending).toMatchObject({ kind: 'turn.first', seat: s.firstPlayer })
  })

  it('APPLY-001 a unit that is not yours or not in the menu is rejected and the state is returned unchanged', () => {
    const s = step(startPhase(base(), b, 'movement'), first('A'))
    const mine = legalActions(s).find(go('A'))!
    const r = apply(s, b, { ...mine, unitId: 'B-zerglings' })
    expect(r.ok).toBe(false)
    expect(r.state).toBe(s)
  })
  it('ACT-006 the before-action ability window opens for the chosen unit ahead of its action, and for Hold too', () => {
    let s = step(startPhase(base(), b, 'movement'), first('B'))
    s = step(s, go('B'))
    expect(ctl.log.filter((x) => x !== 'hook:startOfRound')).toEqual(['hook:beforeAction', 'window:before:B-zerglings', 'resolve:B-zerglings', 'hook:afterAction', 'window:after:B-zerglings'])
    ctl.log = []
    step(s, (a) => a.type === 'turn.hold' && a.seat === 'A')
    expect(ctl.log.slice(0, 2)).toEqual(['hook:beforeAction', 'window:before:A-marines']) // Regeneration and untilAction expiry see a Hold
  })

  it('PH1-005 PH2-005 the end of a Phase expires endOfPhase effects and drops the First Player lock', () => {
    const fx = { id: 'x1', source: 'x1', kind: 'buff' as const, stat: 'speed' as const, x: 1, expires: 'endOfPhase' as const, bySeat: 'A', round: 1 }
    const s0 = base({ markers: { 'A-marines': 'assault', 'B-zerglings': 'assault' } })
    const withFx: GameState = {
      ...s0, units: { ...s0.units, 'A-marines': { ...s0.units['A-marines']!, effects: [fx] } },
      tokens: [{ id: 'l1', defId: FIRST_PLAYER_LOCK, owner: 'A', sourceId: 'movement', pos: { x: 0, z: 0 }, elev: 0, round: 1 }],
    }
    const s = startPhase({ ...withFx, roundPhase: 'movement' }, b, 'assault')
    expect(s.units['A-marines']!.effects.some((e) => e.id === 'x1')).toBe(false)
    expect(s.tokens.some((t) => t.defId === FIRST_PLAYER_LOCK)).toBe(false)
    expect(ctl.log).toContain('delayed:endOfPhase:movement') // Corrosive Bile and the like run first
  })

  it('INIT-003 a locked First Player Marker stays with its holder when the other seat Passes first', () => {
    const s0 = base({ holder: 'A' })
    const locked: GameState = { ...s0, tokens: [{ id: 'l1', defId: FIRST_PLAYER_LOCK, owner: 'A', sourceId: 'movement', pos: { x: 0, z: 0 }, elev: 0, round: 1 }] }
    let s = step(startPhase(locked, b, 'movement'), first('B'))
    s = step(s, pass)
    expect(s.firstPlayer).toBe('A')
  })

  it('ACT-002 every turn.activate option id is unique across squads, so choosing by id activates the squad it names', () => {
    ctl.stampUnit = true // like the real modules: the entry already carries its unitId and a bare id ('go')
    const two = base()
    const extra = squad(b, { id: 'A-marines-2', owner: 'A', profileId: 'marine', models: 3, at: { x: 8, z: 6 } })
    const s0: GameState = {
      ...two,
      units: { ...two.units, [extra.unit.id]: { ...extra.unit, activation: null } },
      models: { ...two.models, ...Object.fromEntries(extra.models.map((m) => [m.id, m])) },
    }
    const s = step(startPhase(s0, b, 'movement'), first('A'))
    expect(s.pending.kind).toBe('turn.activate')
    const ids = s.pending.options.map((o) => o.id)
    expect(new Set(ids).size).toBe(ids.length)
    expect(ids).toEqual(expect.arrayContaining(['A-marines:go', 'A-marines-2:go', 'A-marines:hold', 'A-marines-2:hold']))
    // Choosing by id answers for the named squad, not the first squad with that entry.
    const opt = s.pending.options.find((o) => o.id === 'A-marines-2:go')!
    expect(opt.action['unitId']).toBe('A-marines-2')
    const r = apply(s, b, opt.action)
    expect(r.ok).toBe(true)
    if (r.ok) {
      expect(r.state.units['A-marines-2']!.activation).toBe('movement')
      expect(r.state.units['A-marines']!.activation).toBeNull()
    }
  })
})
