// Shared engine test helpers. Geometry fixtures (mdl, ter, world) plus the M2 fixtures every rules owner uses:
// the data bundle from disk, squads built from UnitDefs, the Marine vs Zergling duel on an open table, forced dice,
// and a deterministic decider runner. Fixtures build state directly; they are not a rules path (setup.ts is).
import type { EditionBundle, Id } from '../../src/data/types'
import { apply } from '../../src/engine/apply'
import { createRandomDecider, type Decider } from '../../src/engine/decider'
import { allWeapons, requireUnitDef } from '../../src/engine/edition'
import { legalActions } from '../../src/engine/pending'
import { option, raiseDecision } from '../../src/engine/registry'
import { gameDefaults } from '../../src/engine/setup'
import type {
  Action, GameState, ModelState, Rejection, RoundPhase, SeatId, TerrainInstance, TerrainRulesType, UnitState, Vec2,
} from '../../src/engine/types'
import { view } from '../../src/engine/view'
import { loadBundle } from '../../tools/sim-core'

export { loadBundle }

export function mdl(id: string, x: number, z: number, o: Partial<ModelState> = {}): ModelState {
  return { id, profileId: 'p', owner: 'A', unitId: id, pos: { x, z }, elev: 0, base: 32, life: 'active', conditions: [], tokens: {}, weapons: [], hp: 1, ...o }
}
export function ter(
  id: string, rulesType: TerrainRulesType, x: number, z: number, w: number, d: number, height: number, props: Record<string, unknown> = {},
): TerrainInstance {
  return { id, pieceId: id, rulesType, pos: { x, z }, rot: 0, footprint: { rect: { w, d } }, height, props }
}
export function world(models: ModelState[], terrain: TerrainInstance[] = [], clouds: GameState['clouds'] = []): GameState {
  return {
    models: Object.fromEntries(models.map((m) => [m.id, m])), terrain, clouds,
    scenario: { table: { w: 36, d: 36 } },
  } as unknown as GameState
}

// ---------------------------------------------------------------- M2 fixtures
let cached: EditionBundle | null = null
/** The default edition read from disk once per test file. */
export function bundle(): EditionBundle {
  return (cached ??= loadBundle())
}

export interface SquadSpec {
  id: string
  owner: SeatId
  /** UnitDef id ('marine', 'zergling'...). */
  profileId: Id
  models: number
  /** Leading Model position; the rest stand in rows of `perRow` behind it (away from the table centre). */
  at: Vec2
  perRow?: number
  /** Gap between bases in inches (default 0.5). */
  gap?: number
  upgrades?: { id: Id; model?: number }[]
  location?: UnitState['location']
}

/** A squad straight from its UnitDef: base, default weapons, HP (Shield on the first model), on the table in
 *  coherency. Models are `<id>.<i>`; model 0 leads. */
export function squad(b: EditionBundle, spec: SquadSpec): { unit: UnitState; models: ModelState[] } {
  const def = requireUnitDef(b, spec.profileId)
  const base = typeof def.baseMm === 'number' ? def.baseMm : Math.min(...def.baseMm)
  const step = base / 25.4 + (spec.gap ?? 0.5)
  const perRow = spec.perRow ?? 3
  const away = spec.at.z >= 0 ? 1 : -1
  const weapons = def.weapons.map((w) => w.id)
  const onTable = (spec.location ?? 'table') === 'table'
  const models: ModelState[] = Array.from({ length: spec.models }, (_, i) => ({
    id: `${spec.id}.${i}`, profileId: def.id, owner: spec.owner, unitId: spec.id,
    pos: { x: spec.at.x + ((i % perRow) - Math.floor((perRow - 1) / 2)) * step, z: spec.at.z + Math.floor(i / perRow) * step * away },
    elev: 0, base, life: 'active', conditions: [], tokens: {}, offTable: !onTable,
    weapons: [...weapons], hp: def.stats.hp + (i === 0 ? def.stats.shield ?? 0 : 0),
  }))
  const unit: UnitState = {
    id: spec.id, owner: spec.owner, profileId: def.id, modelIds: models.map((m) => m.id), location: spec.location ?? 'table',
    activation: null, leadingModelId: models[0]?.id ?? null, inCoherency: true, damage: 0, shielded: def.stats.shield !== null,
    effects: [], upgrades: spec.upgrades ?? [], slot: def.slot, usage: {}, summoned: def.summoned, noShootChargeRound: null,
  }
  return { unit, models }
}

/** Every weapon id the profile can carry (defaults + upgrades), for loadout tests. */
export const weaponIds = (b: EditionBundle, profileId: Id): Id[] => allWeapons(requireUnitDef(b, profileId)).map((w) => w.id)

/** A decision nobody owns: legalActions is non-empty, and apply() answers it with E_UNKNOWN_KIND. Tests that drive a
 *  module directly overwrite it by raising their own decision. */
export function idle(state: GameState, seat: SeatId): GameState {
  return raiseDecision(state, { seat, kind: 'test.idle', context: {}, canPass: false, options: [option('idle', 'Idle', 'test.idle', {}, seat)] })
}

export interface DuelOpts {
  seed?: string
  /** Inches between the two front ranks (default 12: inside C-14 Rifle range). */
  gap?: number
  marines?: number
  zerglings?: number
  roundPhase?: RoundPhase
  missionId?: Id
  deploymentId?: Id | null
}

/** The two-unit duel: seat A (red, near edge) fields 6 Marines `A-marines`, seat B (blue, far edge) 8 Zerglings
 *  `B-zerglings`, facing each other across an open 36 x 36 table (no terrain, no markers). Round 1, Assault Phase by
 *  default, A holds the First Player Marker and is active. Mission Hold Position (skirmish), deployment Frontier. */
export function duelState(b: EditionBundle = bundle(), o: DuelOpts = {}): GameState {
  const gap = o.gap ?? 12
  const a = squad(b, { id: 'A-marines', owner: 'A', profileId: 'marine', models: o.marines ?? 6, at: { x: 0, z: gap / 2 } })
  const z = squad(b, { id: 'B-zerglings', owner: 'B', profileId: 'zergling', models: o.zerglings ?? 8, at: { x: 0, z: -gap / 2 }, perRow: 4 })
  const s0 = gameDefaults(o.seed ?? 'duel', ['A', 'B'], b.edition)
  const s: GameState = {
    ...s0,
    phase: 'play', round: 1, roundPhase: o.roundPhase ?? 'assault', firstPlayer: 'A', active: 'A',
    missionId: o.missionId ?? 'hold-position-skirmish', deploymentId: o.deploymentId === undefined ? 'frontier' : o.deploymentId,
    maxRounds: 5,
    seats: { A: { ...s0.seats.A!, colour: 'red', faction: 'terran' }, B: { ...s0.seats.B!, colour: 'blue', faction: 'zerg' } },
    models: Object.fromEntries([...a.models, ...z.models].map((m) => [m.id, m])),
    units: { [a.unit.id]: a.unit, [z.unit.id]: z.unit },
  }
  return idle(s, 'A')
}

/** Queue test-only dice faces (spec 00 s7): roll() consumes them before the seeded stream. */
export const withForcedDice = (state: GameState, faces: number[]): GameState => ({ ...state, debug: { ...state.debug, forcedDice: [...faces] } })

export interface RunResult { state: GameState; steps: number; log: Action[]; rejection: Rejection | null; over: boolean }

/** Drive a game with deciders (random per seat by default, seeded) until it is over, a step is rejected, or maxSteps.
 *  Deterministic: the same state and seed give the same log. Deciders only ever see view(state, seat). */
export async function runDeciders(state: GameState, b: EditionBundle,
  o: { seed?: string; maxSteps?: number; deciders?: Record<SeatId, Decider> } = {}): Promise<RunResult> {
  let s = state
  const log: Action[] = []
  const max = o.maxSteps ?? 2000
  for (let step = 0; step < max; step++) {
    if (s.phase === 'over') return { state: s, steps: step, log, rejection: null, over: true }
    const p = s.pending
    const seat = p.seat === 'all' ? s.seatOrder[0]! : p.seat
    const decider = o.deciders?.[seat] ?? createRandomDecider(`${o.seed ?? 'run'}:${seat}`)
    const action = await decider.decide(view(s, seat), p, legalActions(s))
    const r = apply(s, b, action)
    if (!r.ok) return { state: s, steps: step, log, rejection: r.rejection, over: false }
    s = r.state
    log.push(action)
  }
  return { state: s, steps: max, log, rejection: null, over: s.phase === 'over' }
}
