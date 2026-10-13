# 20 Data schema (DRAFT)

**DRAFT (M0, 2026-10-13). Not frozen.** M1 dry-runs this schema on every unit, tactical, faction, creep,
mission and deployment card in the card sheets (section 9) before freezing it. Each dry-run record goes to
`docs/sources/extract/dryrun/` (gitignored). Any field that does not fit is fixed here first. On freeze,
the header changes to FROZEN and gets the date. From then on a change needs an edit here, the matching edit
in `src/data/types.ts` and in the validator, and a note in the agent's `issues`.

All game content is declarative JSON. The engine never reads PDFs and holds no card number as a literal.
Every record has `id` and `source`. `source` is a string or an array in the `10` citation format, e.g.
`"CS1-T p.1"` or `["CS1-T p.1", "CT p.2"]`. The literal `"placeholder"` marks data still waiting for a source.
Prose fields (`text`) are our own one-line mechanical summaries, never a paraphrase of card wording (IP rule).
Names (units, cards, abilities, keywords) may match the printed names.

## 1. Layout
```
data/
  rules.json            # RulesDef: engine constants (section 2.3)
  keywords.json         # KeywordDef[]: the keyword and status registry (section 6)
  costs/ct-2026-10.json # CostTableDef: every mineral/gas price (section 7); a new CT = a new file
  units/{terran,zerg,protoss}/*.json   # UnitDef
  cards/{faction,tactical,creep}/*.json # CardDef
  tokens/*.json         # TokenDef (Shade, Creep Tumor, Corrosive Bile, Force Field, Ravager burrow)
  missions/*.json       # MissionDef
  deployments/*.json    # DeploymentDef
  maps/*.json           # MapDef (terrain spec owns the piece shape; listed here for completeness)
  presets/*.json        # ArmyListDef: First Battle preset, bot lists
```
- Each file in a kind folder holds one record or an array of records of that kind. Root files are singletons.
- Ids are kebab-case (`^[a-z0-9]+(-[a-z0-9]+)*$`) and unique across all of `data/`. Nested ids (weapons,
  abilities, upgrades) are unique within their owner and are addressed as `owner/child` (e.g.
  `marine/c-14-rifle`). Keyword ids are UPPER_SNAKE (`LONG_RANGE`).
- Costs live only in the cost table, never on unit or card records. CL/CT revisions replace one file, and
  the validator proves every buyable thing is priced (`GEN-006`, `COST-002`).
- Units in CT with no card in our sheets (Nova, Spec Ops Marauder, Raven, Vileling, Defiler, Bile
  Launcher, Zagara, High Templar, Twilight Templar, Tassadar) may appear in the cost table only. The
  validator warns and does not fail.

## 2. Shared types
```ts
type Id = string; type Source = string | string[];
type Race = 'terran' | 'zerg' | 'protoss';
type Resource = 'CP' | 'BM' | 'PE';
type Phase = 'movement' | 'assault' | 'combat' | 'scoring';
type PhaseBand = Phase | 'any';                       // printed phase band on an ability
type Slot = 'core' | 'elite' | 'support' | 'air' | 'hero';
type CombatTag = 'armoured' | 'biological' | 'light' | 'mechanical' | 'psionic' | 'ground' | 'flying';
type FactionTag = string;     // 'terran' | 'zerg' | 'protoss' | 'raynors-raiders' | 'kerrigans-swarm' | 'khalai' | 'nerazim' | 'daelaam' ...
type TN = 2 | 3 | 4 | 5 | 6;  // "4+" -> 4
type Dice = { n: number; die: 'D3' | 'D6'; plus?: number };   // "D3+1" -> {n:1, die:'D3', plus:1}
type Characteristic = 'speed' | 'hit' | 'armour' | 'evade' | 'roa' | 'range' | 'dmg' | 'size' | 'hp' | 'supply';
type StatusId = 'burrowed' | 'hidden' | 'siege-mode' | 'stationary' | 'shielded';
type Duration = 'endOfRound' | 'untilNextAction' | 'permanent' | 'whileCondition' | 'thisAttack';
interface KwRef { kw: string; x?: number; y?: number; tag?: CombatTag; char?: Characteristic; unit?: Id }
// PIERCE Armoured (2) -> {kw:'PIERCE', tag:'armoured', x:2}; BURST FIRE 8" (3) -> {kw:'BURST_FIRE', y:8, x:3}
// IMPACT (4) 3+ -> {kw:'IMPACT', x:4, y:3}; HITS 3 (1) -> {kw:'HITS', x:3, y:1}; MORPH (Ravager) 1 -> {kw:'MORPH', unit:'ravager', x:1}
```
- Null characteristics (printed "-") are JSON `null` (`DICE-024`, `KW-010`). Speed `-` = `null`, Evade `-` = `null`.
- Printed misprints are entered corrected with a `provenance` note (Pylon "ARMORED", AGG-12 "RIFFLE", Large
  "Impassible", Glial Reconstitution "CP" on Zerg cards; `19` D-02, D-06..D-08).

### 2.1 Conditions and targets
```ts
interface Condition {                 // all keys AND-ed; absent = no constraint
  tags?: CombatTag[]; notTags?: CombatTag[]; factionTags?: FactionTag[]; unique?: boolean;
  size?: { min?: number; max?: number }; status?: StatusId[]; notStatus?: StatusId[];
  engaged?: boolean; activated?: boolean; onCreep?: boolean; shielded?: boolean; structure?: boolean;
  targetWithin?: number;              // attack target Within X" of the acting model (Slugthrower, Grenades - Frag)
  targetStatus?: StatusId[];          // LOCKED IN-style checks on the target
  models?: { min?: number; max?: number };
  phase?: Phase[]; code?: string }    // code = escape hatch to src/engine/hooks
interface TargetSpec {
  kind: 'self' | 'activeUnit' | 'friendlyUnit' | 'enemyUnit' | 'anyUnit' | 'point' | 'ownToken' | 'weapons';
  range?: number; los?: boolean;      // default los = true when range is set and kind is a Unit (ABL-002/003)
  from?: 'unit' | 'token' | 'indicator' | 'entryEdge';
  filter?: Condition;
  weapons?: WeaponSel }               // when kind = 'weapons'
type WeaponSel = { ids?: Id[]; phase?: 'assault' | 'combat'; first?: boolean; all?: boolean };
```

### 2.2 Effects (one vocabulary for every "does something" field)
Abilities, upgrades, card abilities and mission actions all use `Effect[]`, applied in array order.
```ts
type Effect = { op: EffectOp; when?: Condition; duration?: Duration } & Record<string, unknown>;
type EffectOp =
  | 'grantKeyword'    // kw: KwRef, to: 'unit' | WeaponSel        (Stimpack PRECISION (3) on C-14 + melee)
  | 'buff' | 'debuff' // char, x                                    (keyword BUFF/DEBUFF, max-reduce, endOfRound)
  | 'modify'          // char, delta, weapons?                       (flat named-source modifier; stacks across names)
  | 'setChar'         // char, value: number|'targetSize', min?, unmodifiable?   (Siege size 3; Aftershock; Prophetic Vision)
  | 'surge'           // weapons, sDice?: Dice, addTypes?: CombatTag[]   (Grenades - Frag, Target Lock, Hydriodic Bile)
  | 'status'          // status, mode: 'gain'|'lose'|'toggle'
  | 'heal' | 'nonLethal'          // x: number | ValueExpr   (Medpack: {count:'modelsWithin', d:4})
  | 'hits'            // x, y                                      (HITS X (Y))
  | 'impact'          // x, y                                      (IMPACT (X) Y; Devastating Charge)
  | 'place'           // x, from: 'self'|'entryEdge'|'friendlyUnit'|'token', minEnemyDist?, allowEngage?
  | 'summon'          // unit
  | 'morph'           // unit, x
  | 'respawn'         // x: number | {base, onCreep}
  | 'setToken'        // token, range, from, los?: false
  | 'setIndicator'    // purpose: 'detection'|'deployDrop'|'area', minEnemyDist?, radius?
  | 'aura'            // radius, centre: 'unit'|'token'|'indicator', affects: Condition & {side:'friendly'|'enemy'}, effects
  | 'detection'       // radius (6): enemies inside lose HIDDEN (VIS-010..014)
  | 'grantEvade'      // vs: 'all'|'ranged'|'closeCombat'|'nonLethal'|'abilityDamage'|'template'
  | 'removeDice'      // pool: 'attack', n                         (Guardian Shield, Point Defense Laser)
  | 'damageReduce'    // n | ValueExpr                             (Transfusion, Life Support)
  | 'damageCap'       // max                                       (Improved Barrier)
  | 'returnToReserves'
  | 'altEntry'        // kind: 'friendlyEdge'|'indicatorDrop'|'noEdge', supplyCapPerRound?
  | 'costMod'         // res, delta, floor: 0, scope: Condition    (Psionic Link, Raiders Roll!, Khalai Ingenuity)
  | 'supplyOverride'  // purpose: 'pool'|'control'|'disengage'|'all', value?|delta?  (Medic Facilities, Commander, STRUCTURE)
  | 'coherency'       // d                                         (Squadron 4")
  | 'moveThrough'     // what: 'units'|'impassable', maxSize?       (Tunneling Claws, Raptor Strain)
  | 'chargeReroll'    // mode: 'extraDieKeepHigher'                (Pneumatized Carapace)
  | 'chargeAgain'     // noImpact: true                            (Lightning Dash)
  | 'gainVP'          // n
  | 'code';           // code, args                                (anything the ops cannot say; one hook each)
type ValueExpr = { count: 'modelsWithin' | 'modelsInUnit'; d?: number; plus?: number };
```
The validator holds `OP_FIELDS` (required keys per op), as in FELL. A new op needs an entry here and in the
validator. An unknown `code` is a runtime error until the hook registry exists (M2).

### 2.3 RulesDef (`data/rules.json`)
Constants the core reads instead of literals: `engagementRange 1`, `coherency 3`, `contestRange 3`,
`hiddenRange 4`, `detectionRadius 6`, `zoiDepth 6`, `gapClearance {small:1, large:3, largeFromSize:3}`,
`tnClamp [2,6]`, `maxRerollsPerDie 1`, `closeRanksMax 3`, `eliminationVP 10`, `markerDiameterMm 32`,
`scales {skirmish:{minerals:1000, gasPct:10, table:[36,36]}, standard:{2000,10,[54,36]}, grandOffensive:{null,10,[72,36]}}`,
`templates {BT:null, FT:null}` (GAP: dimensions not in text, `13` s9). Each constant carries a `source`.

## 3. UnitDef
```ts
interface UnitDef {
  id: Id; name: string; race: Race;
  factionTags: FactionTag[];          // every printed tag, race included: Kerrigan Swarm Raptor = ['zerg','kerrigans-swarm']
  variantOf?: Id;                     // printed "(ZERGLING)": Raptor, Swarmling, KSR, Vile, Corpser, Praetor Guard, Nerazim Watchers, Raynor's Raider
  unique: boolean; role: string;      // role is display-only (Damage Dealer, Tactician, Support, Tank, ...)
  slot: Slot | null;                  // null for summoned Units
  summoned: boolean;                  // Roachling, Point Defense Drone, Pylon, Omega Worm (R p.76 9.1.9)
  combatTags: CombatTag[];
  stats: { hp: number; shield: number | null; armour: TN | null; evade: TN | null;
           size: number; speed: number | [number, number] | null };   // [4,7] = split Speed (MOVE-001)
  base: { shape: 'round'; mm: number } | { shape: 'oval'; mm: [number, number] };  // Hydralisk prints 40x100
  supplyProfile: { min: number; max: number; supply: number }[];       // Marine [{1,3,0},{4,6,1},{7,9,2}]
  weapons: WeaponProfile[];           // default loadout carried by every model
  abilities: AbilityDef[];
  upgrades: UpgradeDef[];             // card reverse
  tokens?: Id[];                      // tokens this Unit can create (Adept: shade)
  cardVersion: string;                // printed "v 1.04.26"
  provenance?: Record<string, Source>;   // per-field source for values fixed from art or another source
  source: Source }
```
- Variants are full records. `variantOf` only links names for CT rows ("Raptor (Zergling)") and for text that
  names the parent. Upgrades printed "as Zergling" in CT are copied, not inherited.
- The first model (index 0) carries the Shield (`SHD-001`). Units with mixed model profiles: none found yet.
  If the dry run finds one, add `modelProfiles[]` here before freezing.

### 3.1 WeaponProfile
```ts
interface WeaponProfile {
  id: Id; name: string; phase: 'assault' | 'combat';
  range: number | 'E' | 'FT';         // 'E' = Engagement (combat), 'FT' = Flamer Template
  target: 'ground' | 'flying' | 'all';
  roa: number | { perAffectedModel: true; plus: number };   // Shock Cannon "BT+4"
  template?: 'BT' | 'FT';
  hit: TN; surgeTypes: CombatTag[];
  sDice: Dice | 'template' | null;    // "-" = null; "BT" = 'template' (Surge = affected models)
  dmg: number; keywords: KwRef[];     // SIDEARM, SPECIALIST, LONG_RANGE etc. live here
  requiresStatus?: StatusId;          // "SIEGE MODE Status" in the Keyword column
  source: Source }
```

### 3.2 AbilityDef (units, upgrades, cards)
```ts
interface AbilityDef {
  id: Id; name: string; type: 'active' | 'passive' | 'reaction';
  phases: PhaseBand[];                // printed band(s)
  cost?: { res: Resource; n: number } | { res: Resource; schedule: number[] };   // Orders 1/1/2 CP
  limit?: 'round' | 'game' | { perRound: number };   // default 'round' for active/reaction; passives 'Once per Round' -> {perRound:1}
  repeatable?: boolean; insteadOfAction?: boolean; worksInReserves?: boolean;
  deploysUnit?: boolean; endsActivation?: boolean;
  trigger?: Trigger; requires?: Condition; target?: TargetSpec;
  effects: Effect[]; options?: Effect[][];   // "X or Y": the user picks one list
  text: string; source: Source }
type Trigger = 'declareRangedAttack' | 'targeted' | 'targetedRanged' | 'beforeArmourRoll' | 'beforeEvadeRoll'
  | 'damageAssigned' | 'chargeDeclared' | 'chargeRoll' | 'chargeSucceeded' | 'activated' | 'actionResolved'
  | 'nominatedToDeploy' | 'enemyArrives' | 'lostHidden' | 'startOfRound' | 'endOfRound' | 'endOfPhase'
  | 'placed' | 'modelRemoved';
```
- Card abilities omit `cost`: exhausting the card is the price (`CARD-003`). A card ability with a printed
  extra cost keeps `cost`.
- `limit:'game'` is tracked per Unit or per card instance (`ABL-010`).

### 3.3 UpgradeDef
```ts
interface UpgradeDef {
  id: Id; name: string;
  specialist?: boolean;               // one named model (ARMY-023)
  replaces?: Id;                      // FOR [weapon]: weapon id on this card (ARMY-022, WPN-004)
  weapon?: WeaponProfile;             // adds or replaces a weapon
  ability?: AbilityDef;               // adds an ability (Combat Shield, Burrow Ambush)
  modifies?: Effect[];                // permanent edits (Medic Facilities supplyOverride pool 0)
  phases?: PhaseBand[]; source: Source }
```
Price comes from the cost table keyed `unitId/upgradeId`. One price per Composition Option.

## 4. CardDef (faction, tactical, creep)
```ts
interface CardDef {
  id: Id; name: string; kind: 'faction' | 'tactical' | 'creep'; race: Race;
  factionTags: FactionTag[];          // tags the card requires (tactical/creep), e.g. Malignant Creep ['zerg','kerrigans-swarm']
  grantsTags?: FactionTag[];          // faction cards only: tags the army may use
  unique: boolean;
  slots: Partial<Record<Slot, number>>;   // "SUPPLY: 1 x CORE, 1 x ELITE" -> {core:1, elite:1}
  resource: { res: Resource; n: number } | null;   // null for creep cards (CARD-001)
  requiresCreepCard?: boolean;        // Zerg Swarm, Kerrigan's Swarm (ARMY-013)
  abilities: AbilityDef[];
  cardVersion: string; source: Source }
```

## 5. Tokens, missions, deployments, maps, presets
```ts
interface TokenDef { id: Id; name: string; baseMm: number; size: number; stayInPlay: boolean;
  displacement: boolean; terrain: 'none' | 'size0' | 'forceField'; text: string; source: Source }

interface MissionDef {
  id: Id; name: string; scale: 'skirmish' | 'standard' | 'grand-offensive';
  startSupply: number; escalation: number; gameLength: number;
  specialWinLead: number | null; markerStart: 'activated' | 'deactivated';
  startOfRound: { rounds: number[]; activate: 'random' | 'fixed'; markers: number[] }[];
  scoring: ScoringRule[]; actions: MissionAction[]; claim?: ClaimRule;
  tiebreaker: null; cardVersion: string; source: Source }
type ScoringRule =
  | { kind: 'supplyDestroyed' }
  | { kind: 'perControlledMarker'; fromRound: number; vp: { own: number; neutral: number; opponent: number } }
  | { kind: 'retakeBonus'; fromRound: number; vp: number }
  | { kind: 'activatedMarkerCash'; fromRound: number }                 // VP = round activated, then remove
  | { kind: 'quarters'; fromRound: number; vp: number; controlBonus: number }
  | { kind: 'markerControlled'; marker: number; vp: number; fromRound: number }
  | { kind: 'claimCarriedInZone'; rounds: number[]; vp: number }
  | { kind: 'ownMarkersNotClaimed'; rounds: number[]; vp: number };
interface MissionAction { id: Id; name: string; phase: Phase; requires: Condition & { withinMarker: number;
  markerFilter: ('own' | 'neutral' | 'opponent')[]; controlled: boolean }; effects: Effect[]; text: string }
interface ClaimRule { fromRound: number; phase: 'scoring'; within: number; markerFilter: ('neutral' | 'opponent')[];
  maxPerUnit: 1; dropOn: ('supplyDrop' | 'beforePlace' | 'outmassedEngaged' | 'leftTable')[]; dropWithin: number }

interface DeploymentDef {
  id: Id; name: string; scale: 'skirmish' | 'standard'; size: { w: number; h: number };
  entryEdges: { red: Segment[]; blue: Segment[] };   // zones are derived (17 s6), never stored
  markers: { n: number; x: number; y: number }[];    // centres, frame of 17 s2
  cardVersion: string; provenance?: Record<string, Source>; source: Source }
type Segment = { edge: 'N' | 'S' | 'E' | 'W'; from: number; to: number };

interface ArmyListDef { id: Id; name: string; scale: MissionDef['scale']; faction: Id;
  units: { unit: Id; models: number; upgrades: { id: Id; model?: number }[] }[];
  cards: Id[]; creepCard?: Id; source: Source }
```
`MapDef` = `{id, name, scale, pieces: TerrainPiece[], source}` with `TerrainPiece` from `14` s4 engine notes.

## 6. KeywordDef (`data/keywords.json`)
```ts
interface KeywordDef {
  id: string;                         // 'LONG_RANGE'
  name: string;                       // 'LONG RANGE'
  kind: 'weapon' | 'effect' | 'defensive' | 'status' | 'ability' | 'terrain' | 'term';
  params: ('x' | 'y' | 'tag' | 'char' | 'unit')[];
  stacking: 'flag' | 'max' | 'perCharacteristicMax';   // KW-002; BUFF/DEBUFF max per char
  hook: 'target' | 'hitPool' | 'afterHit' | 'surge' | 'armour' | 'evade' | 'damage' | 'casualties'
      | 'move' | 'status' | 'activation' | 'none';
  spec: string;                       // '18 KW-028'
  text: string; source: Source }
```
Every Part 11 keyword and every status in `18` gets one entry. Every `KwRef.kw` and `StatusId` must resolve
here, with exactly the params the entry lists.

## 7. CostTableDef (`data/costs/ct-2026-10.json`)
```ts
interface CostTableDef {
  id: 'ct-2026-10'; date: '2026-10-09';
  units: Record<Id, { compositions: { models: number; supply: number; minerals: number }[];
                      upgrades: Record<Id, number[]> }>;   // one price per composition, small -> large
  cards: Record<Id, number>;          // gas: tactical + creep cards
  source: Source }                    // per entry: "CT p.N"; CL-changed rows also cite "CL p.2"
```
The engine takes the newest table in `costs/` unless a game pins one.

## 8. Validator checks (`npm run validate:data`)
1. Every record has `id` and `source`. Ids are kebab-case and unique. Nested ids are unique within their owner.
2. Cross-references resolve: `variantOf`, `replaces`, `tokens`, `summon`/`morph` units, preset ids, KwRef ->
   KeywordDef, StatusId -> KeywordDef(kind status).
3. `supplyProfile` brackets are contiguous from 1, never overlap, and Supply never decreases. Every CT
   composition's `supply` equals the bracket value at its `models`.
4. Every unit (except `summoned`), upgrade and tactical/creep card has a CT price. Summoned Units have none.
5. `slot` is null iff `summoned`. Faction cards have `grantsTags`. Tactical cards have no `grantsTags`.
6. Effect ops carry their `OP_FIELDS`. Keyword params match the registry.
7. `requiresStatus` and `when.status` name real statuses. Weapons with `template` have `sDice:'template'`.
8. Missions: `gameLength >= 1`, `markers` in `startOfRound` exist for the scale (Skirmish 1, 2, 5).
9. Deployments: segments lie on the table edges, and every marker lies within `size`.
10. Prose is non-empty. CI also greps `text` fields against the extracted card text, and an 8+ word verbatim
    run fails (IP guard).
Exit code 1, one readable line per error.

## 9. M1 dry-run list (every card in CS1/CS2) and the hard cases each must prove
| Card | Sheet | Schema feature it exercises |
|---|---|---|
| Marine | CS1-T p.1 | split Speed `[4,7]`; AGG-12 `specialist`+`replaces`; Rocket Launcher SIDEARM+SPECIALIST added weapon; Slugthrower `grantKeyword` with `when.targetWithin 8`; Grenades - Frag `surge` sDice D6; Stimpack nonLethal + buff + grantKeyword to weapon set |
| Marauder, Medic, Goliath, Jim Raynor, Raynor's Raider(s), Point Defense Drone | CS1-T p.2-7 | Medpack `ValueExpr`; Advanced Medic Facilities `supplyOverride pool 0`; Orders `cost.schedule` + REPEATABLE; BURST FIRE/BULKY; Commander; PDD `summoned`, Speed null, DISPLACEMENT, Point Defense Laser `removeDice` then self-remove |
| Siege Tank | CS2-T p.1 | template `roa {perAffectedModel, plus 4}`; `requiresStatus siege-mode`; `setChar size 3`; Aftershock `setChar dmg targetSize min 1`; once-per-game reactions with `requires.status`; Large, Heavy Plating conditional TOUGH |
| Zergling, Raptor, Swarmling, Kerrigan Swarm Raptor | CS1-Z p.4, p.10-12 | `variantOf`; Squadron `coherency 4`; Raptor Strain `moveThrough impassable maxSize 4`; RESPAWN `{base 2, onCreep 3}`; INSTANT claws |
| Roach, Corpser, Vile, Roachling | CS1-Z p.6-9 | Burrow toggle `status toggle`; Regeneration `trigger activated` + `when.status burrowed`; SUMMON Roachling once per game 2 BM; Glial Reconstitution BM fix + `options`; Underdeveloped Claws |
| Hydralisk, Queen, Kerrigan, Omega Worm | CS1-Z p.1-3 | oval base 40x100; Lurking conditional Evade; ON CREEP auras; Kerrigan UNIQUE Hero; Omega Worm `detection`, Source of Creep `aura`, `altEntry friendlyEdge supplyCapPerRound 2`, STRUCTURE |
| Ravager, Cocoon | CS2-Z p.1-2 | Corrosive Bile token + `hits` at `endOfPhase` assault; Potent Bile DEBUFF; MORPH (Ravager) 1 on a card |
| Zealot, Praetor Guard, Adept, Sentry, Stalker, Artanis, Pylon | CS1-P p.1-7 | Shield on model 0; Shade token + Psionic Transfer end-of-round reset + `aura` PRECISION; Guardian Shield per-Batch `removeDice`; Blink PLACE; Phase Prism PLACE (0) `deploysUnit`; Pylon `summoned`, Speed null, Evade null, Warp Conduit `altEntry`, Khalai Ingenuity `costMod` `{perRound:1}` |
| Immortal, Nerazim Watchers, Zeratul | CS2-P p.1-3 | CONCENTRATED FIRE; Shield Overcharge reaction `requires.shielded`; Prophetic Vision `setChar evade 4 unmodifiable`; One with the Shadows `trigger actionResolved`; Shadow Strike HITS |
| All 7 faction cards, all tactical and creep cards | CS1-T/Z/P p.8-16; CS2-* | slots, UNIQUE, resource 1 or 2, `requiresCreepCard`, card actives with `target activeUnit filter tags`, End-of-Round `altEntry indicatorDrop`, Supply Depot 3 slot types |
| 6 missions x 2 scales, 12 deployments | CS1-T p.11-14; CS2-P p.4-5 | every ScoringRule kind; Gather action; Artefact Hunt `claim`; Proving Grounds blue edge `provenance` |
GAPs the dry run must close from card images, never by guessing: supply brackets lost in extraction (`15`
s1), the slots and UNIQUE flags of Vanadium Plating, Defiler Mound and Templar Archives (`15` s10), Nova
Stealth Mode's card (`16` s7.5), and whether any other unit has an oval base.
