// Engine contract (FROZEN after M1; see docs/spec/00-architecture.md). Pure data, inches, y up, x/z ground plane.
// Origin = table centre. Skirmish table 36 x 36 in, standard table 36 x 54 in. M0 holds only the generic shape: the
// StarCraft rules state (squads, Supply, phases, activation, wounds, tokens) is added by M2, additively.
import type { DiceRolled } from './rng'

export type Id = string
export type ModelId = Id
export type SeatId = string
export interface Vec2 { x: number; z: number }

/** Round base diameter in mm (25, 32, 40, 50, 80, 100, 150). */
export type BaseMm = 25 | 32 | 40 | 50 | 80 | 100 | 150
export type LifeState = 'active' | 'down' | 'dead'
/** Free-form condition/status id; M2 narrows it once the rules spec lists them. */
export type ConditionId = string
/** Free-form damage type id (terrain resistances, hazards). */
export type DamageType = string

export type Shape = { circle: { r: number } } | { rect: { w: number; d: number } } | { polygon: Vec2[] }
/** Geometric terrain classes the geometry/LOS code understands. M2 maps the StarCraft terrain rules onto these. */
export type TerrainRulesType = 'obstacle' | 'obstruction' | 'building' | 'forest' | 'shallowWater' | 'rough' | 'rubble' | 'hill' | 'trench' | 'hazard' | 'deepWater' | 'scenarioTerrain'

export interface ModelState {
  id: ModelId
  /** Unit profile id (data record). */
  profileId: Id
  owner: SeatId
  /** Squad (unit) this model belongs to. */
  unitId?: Id
  pos: Vec2
  elev: number // surface elevation in inches
  base: number // mm
  life: LifeState
  offTable?: boolean
  conditions: ConditionId[]
  inert?: boolean
  /** Misc named counters; modules document the keys they use. */
  tokens: Record<string, number>
}

export type GamePhase = 'setup' | 'play' | 'over'

export interface SeatState {
  id: SeatId
  /** Scenario side id this seat plays. */
  side: string
  faction: string | null
  /** True once this seat has finished the current round (placeholder turn flow). */
  done: boolean
  /** Victory points / scenario score. */
  score: number
  controller?: SeatController
}
export type SeatController = 'human' | 'bot'

export interface TurnState {
  /** Seat taking the current turn. */
  seat: SeatId
  /** Free-form step name owned by the turn-flow module. */
  step: string
}

export interface GameResult {
  /** Winning seat, or null for a draw / nobody. */
  winner: SeatId | null
  reason: string
}

/** A logged engine event for the client (dice rolled, model moved, ...). Append-only. */
export interface EngineEvent { type: string; [k: string]: unknown }
export type GameEvent = DiceRolled | EngineEvent

export interface TerrainInstance {
  id: Id
  pieceId: Id
  rulesType: TerrainRulesType
  pos: Vec2
  rot: number // radians about +y
  footprint: Shape
  height: number
  props: Record<string, unknown>
}

/** A circular template that may block or soften line of sight (smoke and the like; generic geometry only). */
export interface Cloud { id: Id; pos: Vec2; diameter: number; owner: SeatId; kind?: 'cloud' | 'hazard' | 'flare'; blocksLos?: boolean; concealment?: boolean }

export type RngState = [number, number, number, number]
export type RollPurpose = string

export interface ScenarioState { table: { w: number; d: number } }

export interface GameState {
  seed: string
  rng: RngState
  rollSeq: number
  decisionSeq: number
  models: Record<ModelId, ModelState>
  terrain: TerrainInstance[]
  clouds: Cloud[]
  scenario: ScenarioState
  pending: PendingDecision
  log: Action[]
  /** Data edition the game was built from (EditionBundle.edition). */
  edition: string
  scenarioId: string | null
  phase: GamePhase
  /** Current round, 0 before the first round starts. */
  round: number
  /** Round limit (null = until a side wins). */
  maxRounds: number | null
  seats: Record<SeatId, SeatState>
  /** Seat order as created (index 0 = the near edge, +z). */
  seatOrder: SeatId[]
  turn: TurnState | null
  events: GameEvent[]
  result: GameResult | null
}

// ---------- decisions and actions (decider plumbing) ----------
export type RejectionCode = 'E_PLACEMENT' | 'E_BASE_OVERLAP' | 'E_TOO_FAR' | 'E_PATH_BLOCKED' | 'E_NOT_LEGAL' | 'E_STALE_DECISION'
  | 'E_WRONG_SEAT' | 'E_GAME_OVER' | 'E_UNKNOWN_KIND' | 'E_BAD_PARAM' | 'E_BAD_TARGET' | 'E_TODO'
export interface Rejection { code: RejectionCode; message: string; detail?: Record<string, unknown> }

export interface Action { type: string; decisionId: Id; seat: SeatId; [k: string]: unknown }
export interface DecisionOption { id: string; label: string; action: Action }

/** Exactly one open decision at a time. `seat` may be 'all' for simultaneous choices. */
export interface PendingDecision {
  id: Id
  seat: SeatId | 'all'
  kind: string
  context: Record<string, unknown>
  options: DecisionOption[]
  canPass: boolean
}

/** What a decider (human or bot) is allowed to see: never the raw state. */
export interface PlayerView {
  seat: SeatId
  models: Record<ModelId, ModelState>
  terrain: TerrainInstance[]
  clouds: Cloud[]
  scenario: ScenarioState
  pending: PendingDecision
  round: number
  maxRounds: number | null
  scenarioId: string | null
}

export type LosReason = 'clear' | 'terrain' | 'model' | 'cloud' | 'forestDepth' | 'outOfTable' | 'self'
export interface LosVerdict { visible: boolean; reasons: LosReason[]; blockers: Id[]; inRange: boolean; distance: number }
export interface Mod { source: string; label: string; value: number; mode: 'add' | 'set' }
