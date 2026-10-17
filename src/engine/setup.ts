// Checklist: SET, BF, TER, DRF, MM (set-up), ZOI (entry edges), INIT-001 (first player Roll-Off), TABLE. Owner T.
// Game setup. Two paths. (1) The M0 demo table (createDemoGame, and createGame without mission/army options): placeholder
// models and terrain with the placeholder turn flow, kept for the client and sim until M3 switches over. (2) setupGame()
// (spec 17 s1-4): muster both armies into Reserves, pick Mission and Deployment (quick path, or the full draft as
// decisions), table, colours, Mission Markers, terrain, then Round 1 (the First Player Roll-Off happens in startRound).
import type { ArmyListDef, EditionBundle, Id, Scale, UnitDef } from '../data/types'
import { musterArmy } from './army'
import * as dice from './dice'
import { deploymentDef, missionDef, presetDef, tableOf, cardDef, rule } from './edition'
import { initialMarkers } from './missions'
import { HAND_LAYOUTS, handLayoutFor, placeHandLayout } from './terrain-maps'
import { option, pushEvents, raiseDecision, reject, type ModuleDef, type StepResult } from './registry'
import { roll, seedRng } from './rng'
import { beginPlay, finishStartOfRound, PLACEHOLDER_ROUNDS, startRound } from './turnflow'
import type { Colour, DraftState, GameState, MarkerState, ModelState, SeatId, SeatState, TerrainInstance } from './types'

/** Skirmish table (36 x 36 in) and standard table (54 x 36 in; w runs along x), in inches (spec 00 s2). */
export const TABLES = { skirmish: { w: 36, d: 36 }, standard: { w: 54, d: 36 } } as const
export type TableSize = keyof typeof TABLES

export interface CreateGameOpts {
  seed?: string
  /** Seat ids in order (index 0 = near edge, +z). Default ['A', 'B']. */
  seats?: SeatId[]
  scenarioId?: string
  table?: TableSize
  // ---- M2 (spec 00 s10) ----
  missionId?: Id
  deploymentId?: Id
  /** Army list per seat (a preset id or a full list). */
  armies?: Record<SeatId, Id | ArmyListDef>
  /** 'first-battle' = spec 17 s9 (fixed mission, deployment and the two First Battle presets). */
  preset?: 'first-battle'
  /** Run the Mission / Deployment draft as decisions (spec 17 s4) instead of the quick path. */
  draft?: boolean
  /** The 2 Mission and 2 Deployment Cards each seat brings to the draft; default = drawn at random from the scale's pool. */
  draftCards?: Record<SeatId, { mission: Id[]; deployment: Id[] }>
  /** Map choice: 'roll' (default, TER-001 D3 / D6) or 'sunken-shrine' (the original temple layout, replaces the roll).
   *  Ignored with `draft` (the draft picks the map) and when the table has no shrine layout. */
  map?: 'roll' | 'sunken-shrine'
}

/** Every generic model field with its default. M2 foundations: unitId is required; weapons/hp default to the
 *  placeholder values (setup fills them from the UnitDef for StarCraft models). */
export function modelDefaults(m: Pick<ModelState, 'id' | 'profileId' | 'owner' | 'unitId' | 'pos' | 'base'> & Partial<ModelState>): ModelState {
  return { elev: 0, life: 'active', conditions: [], tokens: {}, weapons: [], hp: 1, ...m }
}

/** M2 seat fields with their defaults (spec 00 s4.1). */
export function seatDefaults(id: SeatId, i: number): SeatState {
  return { id, side: `side-${i + 1}`, faction: null, done: false, score: 0, colour: null, vp: 0, supplyLostThisRound: 0, factionCardId: null }
}

/** A GameState shell with no models, seats or open decision yet (pending is filled by beginPlay). */
export function gameDefaults(seed: string, seats: SeatId[], edition = 'none'): GameState {
  const seatStates: Record<SeatId, SeatState> = Object.fromEntries(seats.map((id, i) => [id, seatDefaults(id, i)]))
  return {
    seed, rng: seedRng(seed), rollSeq: 0, decisionSeq: 0,
    models: {}, terrain: [], clouds: [], scenario: { table: { ...TABLES.skirmish } },
    pending: { id: 'd:0', seat: seats[0] ?? 'A', kind: 'setup', context: {}, options: [], canPass: false },
    log: [], edition, scenarioId: null, phase: 'setup', round: 0, maxRounds: PLACEHOLDER_ROUNDS,
    seats: seatStates, seatOrder: [...seats], turn: null, events: [], result: null,
    // M2 rules state, empty until the rules modules fill it (spec 00 s4.1)
    units: {}, roundPhase: null, firstPlayer: null, firstPasser: {}, passed: [], active: null, activeUnit: null,
    missionId: null, deploymentId: null, markers: [], tokens: [], detectors: [], arrivals: [], attack: null,
    reactionsUsed: [], draft: null, cards: Object.fromEntries(seats.map((id) => [id, []])),
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

/** True when the bundle carries the full edition (missions, deployments, rules.json), not just the units exemplar. */
function isFullBundle(b: SetupBundle | null): b is EditionBundle {
  const x = b as Partial<EditionBundle> | null
  return !!x && !!x.records && 'missions' in x.records && !!x.singletons?.rules
}

/** A playable game. With mission / deployment / army / preset / draft options and a full bundle it is the real game
 *  (setupGame); otherwise the placeholder demo table with the placeholder turn flow. */
export function createGame(bundle: SetupBundle | null, opts: CreateGameOpts = {}): GameState {
  if (isFullBundle(bundle) && (opts.missionId || opts.deploymentId || opts.armies || opts.preset || opts.draft)) return setupGame(bundle, opts)
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


// ---------- the real game set-up (spec 17 s1-4) ----------
/** Number of generated map layouts per scale (the official maps are only in page images, spec 17 s3 GAP);
 *  TER-001 (R p.80 9.3): roll D3 on a Skirmish table, D6 on a Standard one. The hand-designed Sunken Shrine (terrain-maps.ts)
 *  is never rolled: it is an opt-in launch choice (`map: 'sunken-shrine'`) that replaces the roll. */
const MAP_COUNT_FALLBACK: Record<string, number> = { skirmish: 3, standard: 6, 'grand-offensive': 6 }
/** Map-roll size per scale. DATA MISFIT: rules.json `scales` has no map-count field yet, so the literal above is only the
 *  fallback; a `maps` number added to a scale entry wins (RULING TER-001 in the engine report). */
function mapCount(bundle: EditionBundle, scale: string): number {
  const entry = (rule(bundle, 'scales') as Record<string, { maps?: number } | undefined>)[scale]
  return typeof entry?.maps === 'number' ? entry.maps : MAP_COUNT_FALLBACK[scale] ?? 3
}
/** Default Deployment Card per scale for the quick path (spec 17 s8). */
const DEFAULT_DEPLOYMENT: Record<string, Id> = { skirmish: 'abandoned-camp', standard: 'gauntlet', 'grand-offensive': 'gauntlet' }

const otherSeat = (s: GameState, seat: SeatId): SeatId => s.seatOrder.find((x) => x !== seat)!
const opposite = (c: Colour): Colour => (c === 'red' ? 'blue' : 'red')

/** Small deterministic generator for layouts (never touches state.rng; a layout depends only on its variant number). */
function lcg(seed: number): () => number {
  let x = (seed * 2654435761 + 1) >>> 0
  return () => { x = (Math.imul(x, 1664525) + 1013904223) >>> 0; return x / 4294967296 }
}

/** A stand-in map: pieces on one half, mirrored by a half turn so neither side is favoured, clear of the Markers.
 *  Cosmetic until the official layouts are digitised (spec 17 s3 GAP); the numbers are layout tuning, not rules. */
export function generateTerrain(variant: number, table: { w: number; d: number }, markers: readonly MarkerState[]): TerrainInstance[] {
  const hand = handLayoutFor(variant, table) // variants above the rolled range are the hand-designed temple table (opt-in only)
  if (hand) return placeHandLayout(hand, markers)
  const rnd = lcg(variant + 1)
  const kinds: { type: TerrainInstance['rulesType']; w: number; d: number; h: number }[] = [
    { type: 'building', w: 6, d: 4, h: 4 }, { type: 'building', w: 5, d: 5, h: 4 },
    { type: 'obstacle', w: 5, d: 1.2, h: 1.6 }, { type: 'obstacle', w: 3, d: 2, h: 1.8 }, { type: 'obstruction', w: 3.4, d: 3.4, h: 3 },
  ]
  const placed: { x: number; z: number; r: number }[] = []
  const out: TerrainInstance[] = []
  const perHalf = Math.round((table.w * table.d) / 260)
  for (let i = 0, tries = 0; out.length < perHalf * 2 && tries < 400; tries++) {
    const k = kinds[Math.floor(rnd() * kinds.length)]!
    const r = Math.hypot(k.w, k.d) / 2
    const x = (rnd() - 0.5) * (table.w - 2 * (r + 2)), z = -rnd() * (table.d / 2 - r - 2) - 1
    const spots = [{ x, z }, { x: -x, z: -z }]
    const rot = (rnd() - 0.5) * 0.8
    const clear = spots.every((p) =>
      markers.every((m) => Math.hypot(p.x - m.pos.x, p.z - m.pos.z) > r + 3) && placed.every((q) => Math.hypot(p.x - q.x, p.z - q.z) > r + q.r + 3))
    if (!clear || Math.hypot(2 * x, 2 * z) < 2 * r + 3) continue
    spots.forEach((p, j) => {
      placed.push({ ...p, r })
      const id = `map${variant}-${i}${j ? 'm' : ''}`
      out.push({
        id, pieceId: id, rulesType: k.type, pos: p, rot, height: k.h, props: {},
        footprint: k.type === 'obstruction' ? { circle: { r: k.w / 2 } } : { rect: { w: k.w, d: k.d } },
      })
    })
    i++
  }
  return out
}

/** The map variant of the Sunken Shrine for this table, or null when no shrine layout is drawn for it. */
function shrineVariant(table: { w: number; d: number }): number | null {
  return Object.values(HAND_LAYOUTS).find((l) => l.w === table.w && l.d === table.d)?.variant ?? null
}

/** Fill in the Mission, Deployment, table, colours, Markers and terrain of a game under construction. */
function configure(state: GameState, bundle: EditionBundle, missionId: Id, deploymentId: Id, colours: Record<SeatId, Colour>, mapVariant: number): GameState {
  const mission = missionDef(bundle, missionId)
  const dep = deploymentDef(bundle, deploymentId)
  if (!mission) throw new Error(`setup: no mission "${missionId}"`)
  if (!dep) throw new Error(`setup: no deployment "${deploymentId}"`)
  const markers = initialMarkers(bundle, mission, dep)
  const table = tableOf(dep)
  return {
    ...state, missionId, deploymentId, maxRounds: mission.gameLength, scenario: { table }, markers,
    terrain: generateTerrain(mapVariant, table, markers),
    seats: Object.fromEntries(Object.entries(state.seats).map(([id, st]) => [id, { ...st, colour: colours[id] ?? st.colour }])),
  }
}

function listFor(bundle: EditionBundle, v: Id | ArmyListDef): ArmyListDef {
  const list = typeof v === 'string' ? presetDef(bundle, v) : v
  if (!list) throw new Error(`setup: no army list "${String(v)}"`)
  return list
}

/** The real game set-up (spec 17 s1-4): muster armies (army.musterArmy) into Reserves, mission, deployment, markers,
 *  terrain, colours, then Round 1 (whose Start of the Round holds the First Player Roll-Off). Quick path by default
 *  (seat 0 Red, seat 1 Blue, no draft); `draft: true` runs the draft as decisions. Returns a game that is ready to play. */
export function setupGame(bundle: EditionBundle, opts: CreateGameOpts): GameState {
  const seats = opts.seats && opts.seats.length >= 2 ? opts.seats : ['A', 'B']
  const first = opts.preset === 'first-battle'
  const armies = opts.armies ?? { [seats[0]!]: first ? 'first-battle-terran' : 'terran-starter', [seats[1]!]: first ? 'first-battle-zerg' : 'zerg-starter' }
  let s: GameState = { ...gameDefaults(opts.seed ?? 'game', seats, bundle.edition), phase: 'setup', scenarioId: opts.scenarioId ?? opts.preset ?? null }
  const lists: Record<SeatId, ArmyListDef> = {}
  for (const seat of seats) {
    const list = listFor(bundle, armies[seat] ?? armies[seats[0]!]!)
    lists[seat] = list
    const m = musterArmy(bundle, seat, list, `${seat}-`)
    s = {
      ...s,
      units: { ...s.units, ...Object.fromEntries(m.units.map((u) => [u.id, u])) },
      models: { ...s.models, ...Object.fromEntries(m.models.map((x) => [x.id, x])) },
      cards: { ...s.cards, [seat]: m.cards },
      seats: { ...s.seats, [seat]: { ...s.seats[seat]!, faction: cardDef(bundle, list.faction)?.race ?? null, factionCardId: list.faction } },
    }
  }
  const scale = lists[seats[0]!]!.scale
  if (opts.draft) return startDraft(s, bundle, opts, scale)
  const missionId = opts.missionId ?? (first ? 'frontlines-skirmish' : `frontlines-${scale}`)
  const deploymentId = opts.deploymentId ?? DEFAULT_DEPLOYMENT[scale] ?? 'abandoned-camp'
  const colours = { [seats[0]!]: 'red' as Colour, [seats[1]!]: 'blue' as Colour }
  const dep = deploymentDef(bundle, deploymentId)
  const shrine = opts.map === 'sunken-shrine' && dep ? shrineVariant(tableOf(dep)) : null
  if (shrine !== null) return startRound(configure(s, bundle, missionId, deploymentId, colours, shrine), bundle) // opt-in: the shrine replaces the roll
  const r = roll(s, { count: 1, sides: mapCount(bundle, scale), purpose: 'map' }) // TER-001: roll the map
  s = pushEvents(r.state, [r.event])
  s = configure(s, bundle, missionId, deploymentId, colours, r.event.dice[0]!)
  return startRound(s, bundle)
}

// ---------- the draft (spec 17 s4) ----------
const DRAFT_KINDS = ['mission', 'deployment'] as const
type DraftKind = typeof DRAFT_KINDS[number]

function startDraft(state: GameState, bundle: EditionBundle, opts: CreateGameOpts, scale: Scale): GameState {
  let s = state
  const pools: Record<DraftKind, Id[]> = {
    mission: bundle.records.missions.filter((m) => m.scale === scale).map((m) => m.id),
    deployment: bundle.records.deployments.filter((d) => d.scale === scale).map((d) => d.id),
  }
  const rows: DraftState['rows'] = { mission: [], deployment: [] }
  for (const seat of s.seatOrder.slice(0, 2)) { // each player brings 2 of each, none twice in their own set (DRF-001)
    for (const kind of DRAFT_KINDS) {
      let mine = opts.draftCards?.[seat]?.[kind]
      if (!mine) {
        const left = [...pools[kind]]
        mine = []
        for (let i = 0; i < 2 && left.length; i++) {
          const r = roll(s, { count: 1, sides: left.length, purpose: 'draftCard', ownerId: seat })
          s = pushEvents(r.state, [r.event])
          mine.push(left.splice(r.event.dice[0]! - 1, 1)[0]!)
        }
      }
      rows[kind].push(...mine)
    }
  }
  const [a, b] = s.seatOrder
  const off = dice.rollOff(s, [a!, b!], 'draft')
  s = pushEvents(off.state, off.events)
  const draft: DraftState = { rows, colour: {}, control: null, banned: [], picked: { mission: null, deployment: null }, step: 'colour' }
  return raiseDecision({ ...s, draft }, {
    seat: off.winner, kind: 'setup.colour', context: { rows }, canPass: false,
    options: (['red', 'blue'] as const).map((c) => option(c, `Play ${c}`, 'setup.colour', { colour: c }, off.winner)),
  })
}

/** The seat that controls (picks in) the given draft; the other seat removes cards. */
const controllerOf = (s: GameState, kind: DraftKind): SeatId => (kind === 'mission' ? s.draft!.control! : otherSeat(s, s.draft!.control!))

function raiseBan(s: GameState, kind: DraftKind): GameState {
  const d = s.draft!
  const remover = otherSeat(s, controllerOf(s, kind))
  return raiseDecision(s, {
    seat: remover, kind: 'setup.ban', context: { draft: kind, removed: d.banned.filter((x) => x.startsWith(kind)).length },
    canPass: false,
    options: d.rows[kind].flatMap((card, i) => (d.banned.includes(`${kind}:${i}`) ? [] : [option(`ban:${i}`, `Remove ${card}`, 'setup.ban', { draft: kind, index: i }, remover)])),
  })
}
function raisePick(s: GameState, kind: DraftKind): GameState {
  const d = s.draft!
  const picker = controllerOf(s, kind)
  return raiseDecision(s, {
    seat: picker, kind: 'setup.pick', context: { draft: kind }, canPass: false,
    options: d.rows[kind].flatMap((card, i) => (d.banned.includes(`${kind}:${i}`) ? [] : [option(`pick:${i}`, `Use ${card}`, 'setup.pick', { draft: kind, index: i }, picker)])),
  })
}

function finishDraft(state: GameState, bundle: EditionBundle, variant: number): GameState {
  const d = state.draft!
  const missionId = d.picked.mission!, deploymentId = d.picked.deployment!
  const s = configure(state, bundle, missionId, deploymentId, d.colour, variant)
  return startRound({ ...s, draft: { ...d, step: 'done' } }, bundle)
}

/** Namespace 'setup' (k setup.colour, setup.draftControl, setup.ban, setup.pick, setup.terrain, setup.firstPlayer). */
export const setupModule: ModuleDef = {
  id: 'setup',
  kinds: ['setup'],
  options: () => [],
  resolve(state, bundle, action): StepResult {
    const kind = state.pending.kind
    if (action.type !== kind) return reject('E_UNKNOWN_KIND', `${action.type} does not answer ${kind}.`)
    const d = state.draft
    switch (kind) {
      case 'setup.firstPlayer': { // INIT-001: the Roll-Off winner gives the marker to either player
        const holder = action['holder']
        if (typeof holder !== 'string' || !state.seatOrder.includes(holder)) return reject('E_BAD_PARAM', 'Name a seat.')
        const s = pushEvents({ ...state, firstPlayer: holder }, [{ type: 'firstPlayer', seat: holder, phase: null }])
        return { state: finishStartOfRound(s, bundle) }
      }
      case 'setup.colour': {
        const colour = action['colour']
        if (!d || (colour !== 'red' && colour !== 'blue')) return reject('E_BAD_PARAM', 'Pick red or blue.')
        const me = action.seat
        const draft: DraftState = { ...d, colour: { [me]: colour, [otherSeat(state, me)]: opposite(colour) }, step: 'control' }
        return {
          state: raiseDecision({ ...state, draft }, {
            seat: me, kind: 'setup.draftControl', context: {}, canPass: false,
            options: DRAFT_KINDS.map((k) => option(k, `Control the ${k} draft`, 'setup.draftControl', { control: k }, me)),
          }),
        }
      }
      case 'setup.draftControl': {
        const c = action['control']
        if (!d || (c !== 'mission' && c !== 'deployment')) return reject('E_BAD_PARAM', 'Pick mission or deployment.')
        const missionController = c === 'mission' ? action.seat : otherSeat(state, action.seat)
        return { state: raiseBan({ ...state, draft: { ...d, control: missionController, step: 'missionBan' } }, 'mission') }
      }
      case 'setup.ban': {
        const k = action['draft'] as DraftKind, i = action['index']
        if (!d || typeof i !== 'number') return reject('E_BAD_PARAM', 'Name a card.')
        const draft = { ...d, banned: [...d.banned, `${k}:${i}`] }
        const s = { ...state, draft }
        const removed = draft.banned.filter((x) => x.startsWith(k)).length
        return { state: removed >= 2 ? raisePick(s, k) : raiseBan(s, k) }
      }
      case 'setup.pick': {
        const k = action['draft'] as DraftKind, i = action['index']
        if (!d || typeof i !== 'number') return reject('E_BAD_PARAM', 'Name a card.')
        const draft = { ...d, picked: { ...d.picked, [k]: d.rows[k][i]! } }
        const s = { ...state, draft }
        if (k === 'mission') return { state: raiseBan({ ...s, draft: { ...draft, step: 'deploymentBan' } }, 'deployment') }
        const red = state.seatOrder.find((x) => draft.colour[x] === 'red') ?? state.seatOrder[0]!
        const scale = bundle.records.deployments.find((x) => x.id === draft.rows.deployment[i])?.scale ?? 'skirmish'
        return {
          state: raiseDecision({ ...s, draft: { ...draft, step: 'terrain' } }, {
            seat: red, kind: 'setup.terrain', context: {}, canPass: false,
            options: Array.from({ length: mapCount(bundle, scale) }, (_, n) => option(`map:${n + 1}`, `Use map ${n + 1}`, 'setup.terrain', { map: n + 1 }, red)),
          }),
        }
      }
      case 'setup.terrain': {
        const map = action['map']
        if (!d || typeof map !== 'number') return reject('E_BAD_PARAM', 'Name a map.')
        return { state: finishDraft(state, bundle, map) }
      }
      default:
        return reject('E_UNKNOWN_KIND', `Setup does not handle ${kind}.`)
    }
  },
}
