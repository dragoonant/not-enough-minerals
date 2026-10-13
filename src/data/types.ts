// Game data schema (FROZEN at M1, 2026-10-13; edition "sc-2026-10"). Spec: docs/spec/20-data-schema.md.
// A change here needs the matching edit in spec 20, in src/data/validate.ts (OP_FIELDS, checks) and a note in the
// agent's issues. All content is declarative JSON; prose fields are our own one-line summaries (IP rule).
import type { BaseMm } from '../engine/types'

export type { BaseMm }

// ---------------------------------------------------------------- shared
export type Id = string
/** Citation(s) in the spec 10 format, e.g. "CS1-T p.1" or ["CT p.2", "CL p.2"]. */
export type Source = string | string[]
export type Race = 'terran' | 'zerg' | 'protoss'
/** Faction resources: Command Points (Terran), Biomass (Zerg), Psionic Energy (Protoss). */
export type Resource = 'CP' | 'BM' | 'PE'
export type Phase = 'movement' | 'assault' | 'combat' | 'scoring'
/** The printed phase band an ability sits in ("ANY PHASE" = 'any'). */
export type PhaseBand = Phase | 'any'
export type Slot = 'core' | 'elite' | 'support' | 'air' | 'hero'
export type CombatTag = 'armoured' | 'biological' | 'light' | 'mechanical' | 'psionic' | 'ground' | 'flying'
/** Kebab-case faction tag id listed in rules.json `factionTags` ('terran', 'raynors-raiders', 'khalai', ...). */
export type FactionTag = string
/** Printed "4+" -> 4. */
export type TN = 2 | 3 | 4 | 5 | 6
/** Dice expression as printed: "D3", "D6", "D3+1", "2D6". */
export type DiceExpr = string
export type Characteristic = 'speed' | 'armour' | 'evade' | 'hp' | 'size' | 'shield' | 'supply' | 'roa' | 'hit' | 'range' | 'dmg'
/** Status ids are keyword ids of kind 'status' in keywords.json (BURROWED, HIDDEN, SIEGE_MODE, STATIONARY, SHIELDED, ON_CREEP). */
export type StatusId = string
export type Duration = 'endOfRound' | 'endOfPhase' | 'endOfActivation' | 'untilNextAction' | 'thisAttack' | 'thisRoll' | 'permanent'

/** Keyword reference. PIERCE Armoured (2) -> {kw:'PIERCE', tag:'armoured', x:2}; BURST FIRE 8" (3) -> {kw:'BURST_FIRE', y:8, x:3};
 *  IMPACT (4) 3+ -> {kw:'IMPACT', x:4, y:3}; HITS 5 (1) -> {kw:'HITS', x:5, y:1}; BUFF Speed (3) -> {kw:'BUFF', char:'speed', x:3};
 *  MORPH (Ravager) 1 -> {kw:'MORPH', unit:'ravager', x:1}. Params must match the keyword's `params` exactly. */
export interface KwRef { kw: string; x?: number; y?: number; tag?: CombatTag; char?: Characteristic; unit?: Id }

/** Escape hatch: a named engine hook; the name must be listed in data/<edition>/hooks/<area>.json. */
export interface CodeRef { code: Id; args?: Record<string, unknown> }

// ---------------------------------------------------------------- conditions and targets
/** All keys AND-ed; an absent key = no constraint. Self = the Unit that owns the ability (or the affected Unit in an aura). */
export interface Condition {
  tags?: CombatTag[]; notTags?: CombatTag[]; factionTags?: FactionTag[]; race?: Race
  /** The Unit is one of these unit ids (Target Lock: only Goliaths). */
  units?: Id[]
  unique?: boolean; structure?: boolean
  size?: { min?: number; max?: number }
  status?: StatusId[]; notStatus?: StatusId[]
  engaged?: boolean; activated?: boolean; onCreep?: boolean
  /** Within X" of a Mission Marker. */
  withinMarker?: number
  /** At least n Friendly models Within d" (Psionic Link: {n:7, d:6}). */
  friendlyModelsWithin?: { n: number; d: number }
  /** The attack: weapon ids used, kind of attack. */
  weapons?: Id[]; attack?: 'ranged' | 'closeCombat'
  /** The attack target / other Unit of the event. */
  targetWithin?: number; targetBeyond?: number; targetTags?: CombatTag[]; targetSize?: { min?: number; max?: number }
  targetStatus?: StatusId[]; targetActivated?: boolean; targetEngagedWithOtherFriendly?: boolean
  targetWithinMarkerOfSelf?: number
  /** The target is Engaged with this Unit (Point Blank). */
  engagedWithSelf?: boolean
  /** The target / attacker is the Unit selected by this card's ability id (Target Lock, Sentenced to Death, Mutating Carapace). */
  targetSelectedBy?: Id; attackerSelectedBy?: Id
  /** The target is within d" of one of this Unit's tokens (Psionic Presence: {token:'shade', d:4}). */
  targetWithinToken?: { token: Id; d: number }
  /** The damage or hits come from this ability id (Potent Bile vs Corrosive Bile). */
  fromAbility?: Id
  /** The triggering attack has (or lacks) INSTANT. */
  attackInstant?: boolean
  /** First roll of its kind in this scope (Ancillary Carapace: 'activation'; Shield Overcharge: 'round'; Lurking first Ranged Attack). */
  first?: 'activation' | 'round'
  phase?: Phase[]
  code?: Id
}

export type WeaponSel = { ids?: Id[]; phase?: 'assault' | 'combat'; all?: true; first?: true }

export interface TargetSpec {
  kind: 'self' | 'activeUnit' | 'friendlyUnit' | 'otherFriendlyUnit' | 'enemyUnit' | 'anyUnit' | 'point' | 'tableEdge'
  range?: number
  /** Default true when `range` is set and kind is a Unit (ABL-002/003). "Line of Sight is not required" -> false. */
  los?: boolean
  /** Unoccupied space only (Force Field). */
  unoccupied?: boolean
  filter?: Condition
}

// ---------------------------------------------------------------- effects (one vocabulary for every "does something" field)
/** Effects run in array order. `when` gates one effect; `duration` defaults to 'permanent' for passives/upgrades and to
 *  'endOfRound' for BUFF/DEBUFF (KW-040). `to` picks who is affected when it is not the ability's target or self. */
export interface EffectBase {
  op: EffectOp; when?: Condition; duration?: Duration; to?: EffectSubject
  /** Delayed effect: resolves at that later event instead of now (Corrosive Bile hits at End of the Assault Phase;
   *  Psionic Transfer / Deep Tunnel set the Unit at its token at End of the Round, CA-013). */
  at?: { event: TriggerEvent; phase?: Phase }
}
/** Who an effect lands on. Default: the ability's target, else self. A WeaponSel = these weapons of the affected Unit. */
export type EffectSubject = 'self' | 'target' | 'attacker' | 'triggerUnit' | 'tokenArea' | 'allFriendly' | 'allEnemy'
  | 'engagedEnemies' | 'summoned' | WeaponSel
export type Effect = EffectBase & Record<string, unknown>
export const EFFECT_OPS = [
  'grantKeyword', 'denyKeyword', 'buff', 'debuff', 'modify', 'setChar', 'rollMod', 'weaponMod', 'status', 'denyStatus',
  'cleanse', 'heal', 'nonLethal', 'hits', 'impact', 'impactBonus', 'damageReduce', 'damageCap', 'removeDice', 'canEvade',
  'place', 'move', 'charge', 'chargeAgain', 'summon', 'morph', 'respawn', 'setToken', 'aura', 'detection', 'altEntry',
  'returnToReserves', 'removeSelf', 'removeToken', 'activation', 'ignoreDisengage', 'costMod', 'supplyOverride', 'coherency', 'moveThrough',
  'targetRestriction', 'abilityMod', 'gainVP', 'code',
] as const
export type EffectOp = typeof EFFECT_OPS[number]
/** Value that depends on the board: Medpack HEAL (X) with X = models of this Unit Within 4" of the target. */
export interface ValueExpr { count: 'ownModelsWithinTarget' | 'modelsInUnit' | 'tokensWithin'; d?: number; plus?: number; token?: Id }

// ---------------------------------------------------------------- weapons, abilities, upgrades
export interface WeaponProfile {
  id: Id; name: string
  phase: 'assault' | 'combat'
  /** Inches, or 'E' = Engagement Range (close combat weapons). */
  range: number | 'E'
  target: 'ground' | 'flying' | 'all'
  /** Number, or "BT+4" = models under the Blast Template plus 4 (Shock Cannon). */
  roa: number | string
  hit: TN
  surgeTypes: CombatTag[]
  /** "-" = null; "BT" = Surge dice equal to models under the template. */
  sDice: DiceExpr | 'BT' | null
  dmg: number
  keywords: KwRef[]
  template?: 'BT' | 'FT'
  /** "SIEGE MODE Status" in the Keyword column: usable only with that status. */
  requiresStatus?: StatusId
  /** Printed misprints corrected, per field. */
  provenance?: Record<string, Source>
}

export type AbilityType = 'active' | 'passive' | 'reaction'
export interface Cost { res: Resource; n: number | 'X' }
export type TriggerEvent =
  | 'declareRangedAttack' | 'declareCharge' | 'targeted' | 'attackResolved' | 'beforeArmourRoll' | 'beforeEvadeRoll'
  | 'damageSuffered' | 'debuffReceived' | 'chargeDistance' | 'chargeSucceeded' | 'activated' | 'actionResolved'
  | 'nominatedToDeploy' | 'leadingModelMoveEnd' | 'usesAbility' | 'startOfRound' | 'endOfRound' | 'endOfPhase' | 'modelsRemoved'
export interface Trigger {
  event: TriggerEvent
  /** Who acts in the event (declares, attacks, charges, resolves): this Unit (default), a Friendly, another Friendly, an Enemy. */
  who?: 'self' | 'friendly' | 'otherFriendly' | 'enemy' | 'any'
  /** Who the event happens to (the attack/charge target, the damaged or debuffed Unit), when that matters. */
  subject?: 'self' | 'friendly' | 'otherFriendly' | 'enemy'
  /** The subject (or, without subject, the actor) must be Within X" of this Unit. */
  within?: number
  attack?: 'ranged' | 'closeCombat' | 'any'
  phase?: Phase
  filter?: Condition
}
export interface AbilityOption { id: Id; cost?: Cost; effects: Effect[]; text: string }
export interface AbilityDef {
  id: Id; name: string; type: AbilityType
  phase: PhaseBand
  /** Printed cost. Card abilities omit it (exhausting the card pays). n 'X' = the chosen option's cost (Orders). */
  cost?: Cost
  /** Printed "Once per Round" / "Once per Game"; REPEATABLE = may be used more than once per Round. */
  limit?: 'oncePerRound' | 'oncePerGame'
  repeatable?: boolean
  /** Resolves instead of performing a standard action (Ready for Pickup?). */
  insteadOfAction?: boolean
  /** The Unit's Activation ends after it (Burrow Ambush, Rapid Reinforcements, Phase Prism, Warp Conduit). */
  endsActivation?: boolean
  trigger?: Trigger
  requires?: Condition
  target?: TargetSpec
  effects: Effect[]
  /** "Apply one of the following": the player picks one option (each may carry its own cost). */
  options?: AbilityOption[]
  text: string
  provenance?: Record<string, Source>
}
export interface UpgradeDef {
  id: Id; name: string
  /** Printed upgrade box band. */
  phase: PhaseBand
  /** One named model only (SPECIALIST, ARMY-023). Must match a SPECIALIST keyword on `weapon` when there is one. */
  specialist?: boolean
  /** FOR [weapon]: id of the default weapon this replaces (ARMY-022). */
  replaces?: Id
  weapon?: WeaponProfile
  ability?: AbilityDef
  provenance?: Record<string, Source>
}

// ---------------------------------------------------------------- tokens
/** A token or indicator an ability sets (Shade, Force Field, Creep Tumor, Corrosive Bile, Ravager Burrow, Faction Indicator). */
export interface TokenDef {
  id: Id; name: string
  /** Printed or rules-given base in mm; null when no source gives one (engine uses rules default). */
  baseMm: number | null
  /** Physical size for LoS/movement; null = no physical presence (indicators). */
  size: number | null
  displacement?: boolean
  /** How it interacts with movement: none, or blocks Units up to a Size and is removed when a bigger one crosses (Force Field). */
  blocks?: { maxSize: number; removedByLarger: boolean }
  stayInPlay?: boolean
  text: string
}

// ---------------------------------------------------------------- units
export interface SupplyBracket { min: number; max: number; supply: number }
export interface UnitStats {
  /** Protoss Shield value; null when not printed. */
  shield: number | null
  /** Split Speed "4/7" -> [4, 7]; "-" -> null. */
  speed: number | [number, number] | null
  armour: TN | null
  evade: TN | null
  hp: number
  /** "-" -> null (Point Defense Drone). */
  size: number | null
}
export interface UnitDef {
  id: Id; name: string; race: Race
  /** Every printed tag, race included: Kerrigan Swarm Raptor = ['zerg', 'kerrigans-swarm']. */
  factionTags: FactionTag[]
  /** Printed "(ZERGLING)": links variants to their parent card for names and CT rows. */
  variantOf?: Id
  unique: boolean
  /** Display only (Damage Dealer, Tank, Tactician, Support, Lifesaver). */
  role: string
  /** Printed Army Slot; null when the card prints none (Summoned Units, Structures). */
  slot: Slot | null
  /** Not bought: put on the table by an ability (R p.78 9.1.9). Has no CT entry. */
  summoned: boolean
  combatTags: CombatTag[]
  stats: UnitStats
  /** Round base in mm, or [w, l] for an oval base (Hydralisk 40x100). */
  baseMm: number | [number, number]
  supplyProfile: SupplyBracket[]
  /** Default loadout carried by every model. */
  weapons: WeaponProfile[]
  abilities: AbilityDef[]
  upgrades: UpgradeDef[]
  tokens?: TokenDef[]
  /** Printed card version, e.g. "1.04.26". */
  cardVersion: string
  provenance?: Record<string, Source>
  source: Source
}

// ---------------------------------------------------------------- cards
export interface CardDef {
  id: Id; name: string
  kind: 'faction' | 'tactical' | 'creep'
  race: Race
  /** Faction card: the tags the army may use. Tactical/creep card: the tags it requires. */
  factionTags: FactionTag[]
  unique: boolean
  /** "SUPPLY: 1 x CORE, 1 x ELITE" -> {core: 1, elite: 1}. */
  slots: Partial<Record<Slot, number>>
  /** "CP: 1" -> {res:'CP', n:1}; null for Creep Cards. */
  resource: { res: Resource; n: number } | null
  /** Zerg faction cards whose Creep passive needs exactly one Creep Card (ARMY-013). */
  requiresCreepCard?: boolean
  abilities: AbilityDef[]
  tokens?: TokenDef[]
  cardVersion: string
  provenance?: Record<string, Source>
  source: Source
}

// ---------------------------------------------------------------- missions and deployments
export type Scale = 'skirmish' | 'standard' | 'grand-offensive'
export type ScoringRule =
  | { kind: 'supplyDestroyed' }
  | { kind: 'perControlledMarker'; fromRound: number; vp: { own: number; neutral: number; opponent: number } }
  | { kind: 'retakeBonus'; fromRound: number; vp: number }
  | { kind: 'activatedMarkerCash'; fromRound: number }
  | { kind: 'quarters'; fromRound: number; vp: number; controlBonus: number }
  | { kind: 'markerControlled'; marker: number; vp: number; fromRound: number }
  | { kind: 'claimCarriedInZone'; rounds: number[]; vp: number }
  | { kind: 'ownMarkersNotClaimed'; rounds: number[]; vp: number }
  | { kind: 'code'; code: Id; args?: Record<string, unknown> }
export interface MarkerStep { rounds: number[]; action: 'activateRandom' | 'activate' | 'deactivate'; markers: number[] }
export interface MissionAction {
  id: Id; name: string; phase: Phase
  requires: Condition & { markerWithin: number; markerSides: ('own' | 'neutral' | 'opponent')[]; controlled?: boolean }
  effects: Effect[]; text: string
}
export interface ClaimRule {
  fromRound: number; within: number; markerSides: ('neutral' | 'opponent')[]; maxPerUnit: number
  dropOn: ('supplyDrop' | 'beforePlace' | 'outmassedEngaged' | 'leftTable')[]; dropWithin: number
}
export interface MissionDef {
  id: Id; name: string; scale: Scale
  startSupply: number; escalation: number; gameLength: number
  /** "The game ends immediately if a Player leads by N+ VPs"; null = none. */
  specialWinLead: number | null
  markerStart: 'activated' | 'deactivated'
  startOfRound: MarkerStep[]
  scoring: ScoringRule[]
  actions: MissionAction[]
  claim?: ClaimRule
  text: string
  cardVersion: string; source: Source
}
export type Edge = 'N' | 'S' | 'E' | 'W'
/** A stretch of a table edge, in inches from the edge's low end (W->E for N/S, S->N for E/W). */
export interface Segment { edge: Edge; from: number; to: number }
export interface DeploymentDef {
  id: Id; name: string; scale: Scale
  /** Table in inches: w along x (W->E), h along y (S->N). Card frame of spec 17 s2: origin bottom-left. */
  size: { w: number; h: number }
  entryEdges: { red: Segment[]; blue: Segment[] }
  /** Marker centres in the card frame; 1 and 3 red, 2 and 4 blue, 5 neutral. */
  markers: { n: number; x: number; y: number }[]
  cardVersion: string; provenance?: Record<string, Source>; source: Source
}

// ---------------------------------------------------------------- costs, presets, keywords, hooks, rules
export interface Composition { models: number; supply: number; minerals: number }
export interface CostUnitRow {
  compositions: Composition[]
  /** Upgrade id -> price per composition (same order as compositions; null where CT prints "-"). */
  upgrades: Record<Id, (number | null)[]>
  source: Source
}
/** One part of a Cost Table. Every file in costs/ with the same `table` merges into one table. */
export interface CostTableDef {
  id: Id
  /** Table id, e.g. "ct-2026-10". */
  table: string
  date: string
  units: Record<Id, CostUnitRow>
  /** Vespene gas per Tactical / Creep Card id. */
  cards: Record<Id, number>
  source: Source
}

export interface ArmyListDef {
  id: Id; name: string; scale: Scale; faction: Id
  units: { unit: Id; models: number; upgrades: { id: Id; model?: number }[] }[]
  cards: Id[]; creepCard?: Id; source: Source
}

export type KeywordKind = 'weapon' | 'effect' | 'defensive' | 'status' | 'ability' | 'term'
export type KeywordParam = 'x' | 'y' | 'tag' | 'char' | 'unit'
export interface KeywordDef {
  /** UPPER_SNAKE, e.g. 'LONG_RANGE'. */
  id: string
  /** As printed, e.g. 'LONG RANGE'. */
  name: string
  kind: KeywordKind
  /** Params a KwRef must carry, exactly. Optional params end with '?' are not allowed: one shape per keyword. */
  params: KeywordParam[]
  /** KW-002: flags do not stack; numeric keywords keep the highest X (BUFF/DEBUFF per characteristic). */
  stacking: 'flag' | 'max' | 'perCharacteristicMax'
  /** Spec reference, e.g. '18 KW-028'. */
  spec: string
  text: string
  source: Source
}
export interface KeywordsFile { id: 'keywords'; keywords: KeywordDef[]; source: Source }

export interface HookDef { id: Id; text: string; source: Source }

export interface Sourced<T> { value: T; source: Source }
export interface RulesDef {
  id: 'rules'
  engagementRange: Sourced<number>
  coherency: Sourced<number>
  contestRange: Sourced<number>
  hiddenRange: Sourced<number>
  zoiDepth: Sourced<number>
  gapClearance: Sourced<{ small: number; large: number; largeFromSize: number }>
  tnClamp: Sourced<[number, number]>
  maxRerollsPerDie: Sourced<number>
  closeRanksMax: Sourced<number>
  eliminationVP: Sourced<number>
  markerDiameterMm: Sourced<number>
  baseSizesMm: Sourced<number[]>
  scales: Sourced<Record<Scale, { minerals: number | null; gasPct: number; table: { w: number; h: number } | null }>>
  /** Every legal faction tag id -> printed name. */
  factionTags: Sourced<Record<FactionTag, string>>
  /** Tokens and indicators shared by every faction (Faction Indicator). */
  tokens: TokenDef[]
  source: Source
}

// ---------------------------------------------------------------- bundle
/** Folder under data/<edition>/ -> record type. units/ has one sub-folder per race. */
export interface KindMap {
  units: UnitDef; cards: CardDef; missions: MissionDef; deployments: DeploymentDef
  costs: CostTableDef; presets: ArmyListDef; hooks: HookDef
}
export type Kind = keyof KindMap
export const KINDS: readonly Kind[] = ['units', 'cards', 'missions', 'deployments', 'costs', 'presets', 'hooks']
/** Root files under data/<edition>/ -> singleton type. */
export interface SingletonMap { rules: RulesDef; keywords: KeywordsFile }
export type SingletonName = keyof SingletonMap
export const SINGLETONS: readonly SingletonName[] = ['rules', 'keywords']
export const RACES: readonly Race[] = ['terran', 'zerg', 'protoss']
export const HOOK_AREAS = ['terran', 'zerg', 'protoss', 'cards', 'core'] as const

export interface EditionsFile { default: string; editions: string[] }
export interface EditionBundle {
  edition: string
  records: { [K in Kind]: KindMap[K][] }
  singletons: Partial<SingletonMap>
  /** record id -> the file it came from (for error messages). */
  origin: Record<string, string>
}
