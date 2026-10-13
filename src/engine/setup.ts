// Game setup. M0/M1: a demo table only (placeholder models and terrain on a 36 x 36 in skirmish table) with the
// placeholder turn flow. When the bundle holds the Marine record (data exemplar, spec 20/21), seat 0's squad is a
// 6-model Marine Unit read from data; everything else stays placeholder. No StarCraft rule lives here yet.
// TODO(M2): createGame(bundle, opts) builds forces, deployment and missions from the data bundle (spec 10/11/20).
import type { EditionBundle, UnitDef } from '../data/types'
import { seedRng } from './rng'
import { beginPlay, PLACEHOLDER_ROUNDS } from './turnflow'
import type { GameState, ModelState, SeatId, SeatState, TerrainInstance } from './types'

/** Skirmish table (36 x 36 in) and standard table (36 x 54 in), in inches. */
export const TABLES = { skirmish: { w: 36, d: 36 }, standard: { w: 36, d: 54 } } as const
export type TableSize = keyof typeof TABLES

export interface CreateGameOpts {
  seed?: string
  /** Seat ids in order (index 0 = near edge, +z). Default ['A', 'B']. */
  seats?: SeatId[]
  scenarioId?: string
  table?: TableSize
}

/** Every generic model field with its default. */
export function modelDefaults(m: Pick<ModelState, 'id' | 'profileId' | 'owner' | 'pos' | 'base'> & Partial<ModelState>): ModelState {
  return { elev: 0, life: 'active', conditions: [], tokens: {}, ...m }
}

/** A GameState shell with no models, seats or open decision yet (pending is filled by beginPlay). */
export function gameDefaults(seed: string, seats: SeatId[], edition = 'none'): GameState {
  const seatStates: Record<SeatId, SeatState> = Object.fromEntries(seats.map((id, i) => [id, { id, side: `side-${i + 1}`, faction: null, done: false, score: 0 }]))
  return {
    seed, rng: seedRng(seed), rollSeq: 0, decisionSeq: 0,
    models: {}, terrain: [], clouds: [], scenario: { table: { ...TABLES.skirmish } },
    pending: { id: 'd:0', seat: seats[0] ?? 'A', kind: 'setup', context: {}, options: [], canPass: false },
    log: [], edition, scenarioId: null, phase: 'setup', round: 0, maxRounds: PLACEHOLDER_ROUNDS,
    seats: seatStates, seatOrder: [...seats], turn: null, events: [], result: null,
  }
}

const rect = (id: string, rulesType: TerrainInstance['rulesType'], x: number, z: number, w: number, d: number, height: number, rot = 0): TerrainInstance =>
  ({ id, pieceId: id, rulesType, pos: { x, z }, rot, footprint: { rect: { w, d } }, height, props: {} })

/** Placeholder pieces: two crates, a wall, a rock and a ruin footprint. Cosmetic stand-ins until M8 terrain. */
function demoTerrain(): TerrainInstance[] {
  return [
    rect('crates', 'obstacle', -8, 2, 4, 3, 2.5, 0.3),
    rect('wall', 'obstacle', 6, 0, 10, 1.2, 3.5, -0.2),
    rect('ruin', 'building', -2, -8, 7, 4, 4, 0.4),
    { id: 'rock', pieceId: 'rock', rulesType: 'obstruction', pos: { x: 11, z: 9 }, rot: 0, footprint: { circle: { r: 2 } }, height: 3, props: {} },
    rect('rubble', 'rubble', -13, -9, 6, 5, 0.6),
  ]
}

/** The data bundle shape setup reads: the edition id and, optionally, its records. */
export type SetupBundle = Pick<EditionBundle, 'edition'> & { records?: Pick<EditionBundle['records'], 'units'> }

/** Seat 0's demo squad: 6 Marines from data when the bundle has the record, else 3 placeholder models. */
function demoSquad(owner: SeatId, marine: UnitDef | undefined): ModelState[] {
  if (marine && typeof marine.baseMm === 'number') {
    const base = marine.baseMm as ModelState['base']
    return [0, 1, 2, 3, 4, 5].map((i) => modelDefaults({
      id: `am${i + 1}`, profileId: marine.id, owner, unitId: 'a-marines', pos: { x: -11 + (i % 3) * 1.6, z: 13.4 + Math.floor(i / 3) * 1.6 }, base,
    }))
  }
  const m = (id: string, x: number, z: number) => modelDefaults({ id, profileId: 'placeholder-25', owner, unitId: 'a-squad', pos: { x, z }, base: 25 })
  return [m('a1', -10, 14), m('a2', -8.5, 14.6), m('a3', -7, 14)]
}

/** Placeholder squads: seat 0 near (+z), seat 1 far (-z), on a spread of round bases. Profile ids are placeholders. */
function demoModels(seats: SeatId[], bundle: SetupBundle | null): ModelState[] {
  const [a = 'A', b = 'B'] = seats
  const m = (id: string, owner: SeatId, unitId: string, x: number, z: number, base: number) =>
    modelDefaults({ id, profileId: `placeholder-${base}`, owner, unitId, pos: { x, z }, base })
  return [
    ...demoSquad(a, bundle?.records?.units.find((u) => u.id === 'marine')),
    m('a4', a, 'a-hero', -2, 14, 32), m('a5', a, 'a-big', 5, 13.5, 50),
    m('b1', b, 'b-swarm', 6, -14, 25), m('b2', b, 'b-swarm', 7.5, -14.5, 25), m('b3', b, 'b-swarm', 9, -14, 25),
    m('b4', b, 'b-hero', 2, -14, 32), m('b5', b, 'b-big', -6, -13, 40),
  ]
}

/** A playable placeholder game (any bundle): the demo table plus the placeholder turn flow. */
export function createGame(bundle: SetupBundle | null, opts: CreateGameOpts = {}): GameState {
  const seed = opts.seed ?? 'demo'
  const seats = opts.seats && opts.seats.length >= 2 ? opts.seats : ['A', 'B']
  const base = gameDefaults(seed, seats, bundle?.edition ?? 'none')
  const state: GameState = {
    ...base,
    scenarioId: opts.scenarioId ?? null,
    scenario: { table: { ...TABLES[opts.table ?? 'skirmish'] } },
    models: Object.fromEntries(demoModels(seats, bundle).map((x) => [x.id, x])),
    terrain: demoTerrain(),
  }
  return beginPlay(state)
}

/** The demo table; with a bundle that holds the Marine, seat 0 fields a Marine squad from data. */
export function createDemoGame(seed = 'demo', bundle: SetupBundle | null = null): GameState {
  return createGame(bundle, { seed })
}
