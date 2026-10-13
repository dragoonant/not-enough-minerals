// Engine contract (FROZEN after M1; see docs/spec/00-architecture.md). Pure data, inches, y up, x/z ground plane.
// Origin = table centre. Skirmish table 36 x 36 in, standard table 36 x 54 in. M0 holds only the generic shape: the
// StarCraft rules state (squads, Supply, phases, activation, wounds, tokens) is added by M2, additively.
import type { DiceRolled } from './rng'
import type { Characteristic, DiceExpr, EntryKind, KwRef, Resource, Slot, StatusId, WeaponSel } from '../data/types'

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
  /** Squad (unit) this model belongs to. M2: required; squads.unitModels() is the only lookup (spec 00 s4). */
  unitId: Id
  pos: Vec2
  elev: number // surface elevation in inches
  base: number // mm
  life: LifeState
  offTable?: boolean
  conditions: ConditionId[]
  inert?: boolean
  /** Misc named counters; modules document the keys they use. */
  tokens: Record<string, number>
  /** M2: this model's loadout (weapon profile ids, defaults with FOR [weapon] upgrades applied), built once at muster. */
  weapons: Id[]
  /** M2: this model's HP; the first model of a Shield unit holds HP + Shield (DMG-011). The Damage Marker is per unit. */
  hp: number
}

export type GamePhase = 'setup' | 'play' | 'over'

export interface SeatState {
  id: SeatId
  /** Scenario side id this seat plays. */
  side: string
  faction: string | null
  /** True once this seat has finished the current round (placeholder turn flow). */
  done: boolean
  /** Victory points / scenario score. M2: mirrors `vp`. */
  score: number
  controller?: SeatController
  /** M2: the seat's Deployment Card colour (red or blue), null until the draft sets it. */
  colour: Colour | null
  /** M2: Victory Points. */
  vp: number
  /** M2: Supply this seat lost to bracket drops this Round (spec 15 s7); reset at Cleanup. */
  supplyLostThisRound: number
  /** M2: the army's Faction Card id. */
  factionCardId: Id | null
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

// ---------- M2 rules state (additive; spec 00 s4.1) ----------
export type UnitId = Id
export type Colour = 'red' | 'blue'
/** The Phase inside a Round. `GameState.phase` stays the game lifecycle (setup / play / over). */
export type RoundPhase = 'movement' | 'assault' | 'combat' | 'scoring'
export type UnitLocation = 'reserves' | 'table' | 'destroyed'
/** Activation Marker: null = none; 'movement' = activated in Phase 1; 'assault' = activated in Phase 2 (spec 11 s10). */
export type ActivationMarker = null | 'movement' | 'assault'
/** supply.supplyFor purposes (spec 15 s1). */
export type SupplyPurpose = 'pool' | 'control' | 'disengage' | 'vp'

/** When an Effect ends. The data Durations plus the engine-only clocks of spec 00 s4. */
export type EffectExpiry = 'endOfRound' | 'endOfPhase' | 'endOfActivation' | 'untilAction' | 'thisAttack' | 'thisRoll'
  | 'permanent' | 'whileCondition' | 'burrowLinked'
/** One entry of a Unit's Effect list: the only store for buffs, debuffs, statuses, granted keywords and flat mods
 *  (spec 16 s6). `effects.statOf()` folds it: BUFF/DEBUFF max X per (kind, stat), flat mods summed, then clamped. */
export interface Effect {
  /** Unique within the unit (`<source>#<n>`). */
  id: Id
  /** Ability, card, upgrade or rule id that created it; same-named sources never stack (DICE-026). */
  source: Id
  /** buff/debuff = the keywords; flat = an unkeyworded named change (`modify`); status = a StatusId flag;
   *  keyword = a granted keyword (`kw`); deny = a denied keyword or status; mod = any other data effect kept for the
   *  interpreter (rollMod, weaponMod, canEvade, coherency, moveThrough, damageCap, ...: `data` holds the record). */
  kind: 'buff' | 'debuff' | 'flat' | 'status' | 'keyword' | 'deny' | 'mod'
  stat?: Characteristic
  x?: number
  status?: StatusId
  kw?: KwRef
  /** Which of the unit's weapons it applies to; absent = the unit. */
  weapons?: WeaponSel
  expires: EffectExpiry
  /** Seat that controls the source (one reaction per player, ownership of debuffs). */
  bySeat: SeatId
  /** Round it was applied in (expiry bookkeeping). */
  round: number
  /** The data effect record this came from, when the interpreter needs more than the fields above. */
  data?: Record<string, unknown>
}

/** A squad (spec 00 s4.1). Shape follows the Mallet project's UnitState. */
export interface UnitState {
  id: UnitId
  owner: SeatId
  /** UnitDef id. */
  profileId: Id
  /** Every model as mustered, index 0 = the first model (Shield, DMG-011). Removed models stay listed with life 'dead'. */
  modelIds: ModelId[]
  location: UnitLocation
  activation: ActivationMarker
  leadingModelId: ModelId | null
  /** Result of the last coherency check (end of a reposition only; casualties never change it, COH-006). */
  inCoherency: boolean
  /** Damage Marker: carry-over damage, no cap (DMG-005). */
  damage: number
  /** SHIELDED status bookkeeping (DMG-012): true until lost; never returns. */
  shielded: boolean
  effects: Effect[]
  /** Upgrade ids bought for this unit (with the model index for SPECIALIST picks). */
  upgrades: { id: Id; model?: number }[]
  /** Army Slot this unit fills on the list (null for summoned units). */
  slot: Slot | null
  /** Ability usage ledger: key `<abilityId>:round:<n>` or `<abilityId>:game` -> times used (R16-6). */
  usage: Record<string, number>
  summoned: boolean
  /** Round in which it Disengaged without Tactical Mass: no Shoot or Charge that Round (spec 15 s5). */
  noShootChargeRound: number | null
}

/** Mission Marker in play (spec 17 s5). Positions are world coordinates (edition.cardToWorld). */
export interface MarkerState {
  n: number
  pos: Vec2
  elev: number
  /** Card colour of the marker: 1 and 3 red, 2 and 4 blue, 5 neutral. */
  side: Colour | 'neutral'
  active: boolean
  onTable: boolean
  controller: SeatId | null
  controlledSinceRound: number | null
  claimedBy: UnitId | null
  activatedRound: number | null
}

/** A token or indicator on the table (Shade, Force Field, Creep Tumor, Faction Indicator...). */
export interface TokenState {
  id: Id
  /** TokenDef id (on the setting record, or rules.json tokens). */
  defId: Id
  owner: SeatId
  /** Unit or card whose ability set it. */
  sourceId: Id | null
  pos: Vec2
  elev: number
  round: number
}

/** A detection area: enemy units within `radius` of the centre lose HIDDEN at check points (spec 16 s7.3). */
export interface DetectorArea {
  id: Id
  owner: SeatId
  centre: { kind: 'unit'; unitId: UnitId } | { kind: 'token'; tokenId: Id } | { kind: 'point'; pos: Vec2 }
  radius: number
  source: Id
  expires: EffectExpiry
}

/** How a unit arrives (reserves.arrive). `ref` = the token, indicator, unit base or edge segment used. */
export interface ArrivalEntry {
  kind: EntryKind
  ref?: Id
  /** Edge segment index for 'edge', or the edge letter for 'nonEntryEdge'. */
  segment?: number | 'N' | 'S' | 'E' | 'W'
}
/** A delayed arrival (end-of-round drop), resolved at Scoring step 4, First Player Marker holder first. */
export interface ArrivalRow {
  id: Id
  seat: SeatId
  /** Null until the owner nominates the unit at resolution time. */
  unitId: UnitId | null
  entry: ArrivalEntry
  round: number
  source: Id
}

/** One die of the attack pipeline. Every die carries `rerolled` (DICE-012). */
export interface Die {
  id: Id
  face: number
  rerolled: boolean
  /** Which die group (per-model Hit TN) it was rolled in. */
  group?: number
  /** The Batch's Surge Die (tracked apart from attack dice). */
  surge?: boolean
  /** Moved by PRECISION, Surge or CRITICAL HIT (for the dice tray). */
  via?: 'precision' | 'surge' | 'critical' | 'tough'
}
/** Dice of one Batch that share a Hit TN (LONG RANGE models roll as their own group, DICE-032). */
export interface DieGroup { count: number; hitTN: number | null; modelIds: ModelId[] }
export type AttackStep = 'hit' | 'surge' | 'armour' | 'evade' | 'damage'
export type AttackKind = 'ranged' | 'closeCombat' | 'template' | 'spillover' | 'hits' | 'impact'
/** One Batch: all models firing one weapon profile at one target (ATK-030), or a HITS / IMPACT entry. */
export interface AttackBatch {
  id: Id
  kind: AttackKind
  attackerSeat: SeatId
  attackerUnitId: UnitId | null
  attackerModelIds: ModelId[]
  /** Weapon profile id, or null for HITS / IMPACT from an ability. */
  weaponId: Id | null
  /** Ability or card id for HITS / IMPACT. */
  sourceId: Id | null
  targetUnitId: UnitId
  dieGroups: DieGroup[]
  /** S Dice expression for the Batch (null = no Surge), or a fixed count for templates. */
  surgeDice: DiceExpr | null
  surgeFixed: number | null
  dmg: number
  keywords: KwRef[]
  /** Casualty-eligible models snapshotted at declaration (DMG-002); null = engaged priority (DMG-020). */
  eligible: ModelId[] | null
}
export interface AttackPools { attackPool: Die[]; armourPool: Die[]; damagePool: Die[]; surgeDie: Die | null; surgeResult: number }
/** The open attack: the current Batch, its pools, the step, and where to go when it finishes. */
export interface AttackState {
  batch: AttackBatch
  pools: AttackPools
  step: AttackStep
  /** Total Damage once step 5 computed it (before casualties). */
  totalDamage: number | null
  /** Further Batches of the same action (melee split targets, template Spillover). */
  queue: AttackBatch[]
  /** Namespace of the module whose `resume()` runs when the attack (queue included) is done, e.g. 'shoot'. */
  returnTo: string
}

/** Mission / Deployment draft (spec 17 s4). */
export interface DraftState {
  rows: { mission: Id[]; deployment: Id[] }
  colour: Record<SeatId, Colour>
  /** Seat that controls the draft order. */
  control: SeatId | null
  banned: Id[]
  picked: { mission: Id | null; deployment: Id | null }
  step: string
}

/** One Tactical, Faction or Creep Card a seat holds (spec 16 s5). Resources are paid by exhausting cards. */
export interface CardState {
  id: Id
  kind: 'faction' | 'tactical' | 'creep'
  exhausted: boolean
  resource: { res: Resource; n: number } | null
  /** Usage ledger like UnitState.usage. */
  usage: Record<string, number>
}

/** Test-only switches (spec 00 s7). The sim asserts this is never set. */
export interface DebugState {
  /** Faces consumed by roll() before sfc32, in order. */
  forcedDice?: number[]
}

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
  // ---- M2 (spec 00 s4.1) ----
  units: Record<UnitId, UnitState>
  roundPhase: RoundPhase | null
  /** First Player Marker holder. */
  firstPlayer: SeatId | null
  /** Who passed first in each Phase (initiative transfer, RULING R11-2). */
  firstPasser: Partial<Record<RoundPhase, SeatId>>
  /** Seats that have passed in the current Phase. */
  passed: SeatId[]
  /** Seat whose turn it is in the current Phase. */
  active: SeatId | null
  /** Unit currently activating (null between activations). */
  activeUnit: UnitId | null
  missionId: Id | null
  deploymentId: Id | null
  markers: MarkerState[]
  tokens: TokenState[]
  detectors: DetectorArea[]
  arrivals: ArrivalRow[]
  attack: AttackState | null
  /** One Reaction per player per Activation: seats that used theirs in the current activation. */
  reactionsUsed: SeatId[]
  draft: DraftState | null
  cards: Record<SeatId, CardState[]>
  debug?: DebugState
}

// ---------- decisions and actions (decider plumbing) ----------
export type RejectionCode = 'E_PLACEMENT' | 'E_BASE_OVERLAP' | 'E_TOO_FAR' | 'E_PATH_BLOCKED' | 'E_NOT_LEGAL' | 'E_STALE_DECISION'
  | 'E_WRONG_SEAT' | 'E_GAME_OVER' | 'E_UNKNOWN_KIND' | 'E_BAD_PARAM' | 'E_BAD_TARGET' | 'E_TODO'
  // M2
  | 'E_COHERENCY' | 'E_NO_SUPPLY' | 'E_ZONE' | 'E_ENGAGED' | 'E_NOT_ENGAGED' | 'E_NO_LOS' | 'E_OUT_OF_RANGE'
  | 'E_ACTIVATED' | 'E_COST' | 'E_USED'
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
  // ---- M2 public fields (spec 00 s5: the game is played open; never rng, log or debug) ----
  phase: GamePhase
  roundPhase: RoundPhase | null
  seats: Record<SeatId, SeatState>
  seatOrder: SeatId[]
  units: Record<UnitId, UnitState>
  firstPlayer: SeatId | null
  active: SeatId | null
  activeUnit: UnitId | null
  missionId: Id | null
  deploymentId: Id | null
  markers: MarkerState[]
  tokens: TokenState[]
  detectors: DetectorArea[]
  arrivals: ArrivalRow[]
  attack: AttackState | null
  cards: Record<SeatId, CardState[]>
  result: GameResult | null
}

export type LosReason = 'clear' | 'terrain' | 'model' | 'cloud' | 'forestDepth' | 'outOfTable' | 'self'
export interface LosVerdict { visible: boolean; reasons: LosReason[]; blockers: Id[]; inRange: boolean; distance: number }
export interface Mod { source: string; label: string; value: number; mode: 'add' | 'set' }
