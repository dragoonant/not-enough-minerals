# 20 Data schema (FROZEN 2026-10-13, edition `sc-2026-10`)

Frozen at M1 after a dry run that encoded every unit card of CS1 and CS2 (Terran, Zerg, Protoss, waves 1 and 2:
31 Unit cards with every upgrade, token and summoned Unit), one faction card, one tactical card, one mission and
one deployment card (section 10). The code is `src/data/types.ts` (types), `src/data/validate.ts` (checks),
`src/data/bundle.ts` (layout), `src/data/index.ts` (Vite loader), `src/data/query.ts` (read helpers) and
`tools/validate-data.ts` (CLI, prose guard). A change from now on needs an edit here, the matching edit in
`types.ts` and `validate.ts` (`OP_FIELDS`, `OP_OPTIONAL`, enums), and a note in the agent's `issues`.

**M2 additive changes (2026-10-13, M2 foundations; closes the open schema items of the M1 report):** Condition
`slots`, `entryKinds`; trigger events `loseHidden`, `arrived`, `placeResolved`; `who` default convention (s2.3);
`setToken`/`altEntry` `minEnemyDist`; `altEntry.kind` enum; `damageReduce.min`; `heal.x`/`nonLethal.x`/
`damageReduce.n` take a ValueExpr; `coherency.axis`; `costMod`/`abilityMod` `optional`; the closed `abilityMod.field`
list; TokenDef `terrain`, `removedBy`; ClaimRule `phase`, `controlled`; RulesDef `claimTiming`; cost `n: 0` means no
exhaust. Six code hooks became plain data and left `hooks/cards.json`: unit-slot-support, forward-deploy-clearance,
damage-reduce-min-one, lost-hidden-status, arrival-off-entry-edge, resolved-place-effect.

All game content is declarative JSON. The engine never reads PDFs and holds no card number as a literal.
Every record has `id` and `source`. `source` is a string or array in the spec 10 citation format (`"CS1-T p.1"`,
`["CT p.2", "CL p.2"]`). Prose fields (`text`) are our own one-line mechanical summaries, never a paraphrase of
card wording (IP rule); `validate:data` fails any `text` sharing an 8-word run with the card sheets. Names
(units, weapons, abilities, keywords, cards) may match the printed names. Entry conventions: spec 21.

## 1. Layout and ownership
```
data/editions.json                      {default: "sc-2026-10", editions: ["sc-2026-10"]}
data/sc-2026-10/
  rules.json                            RulesDef      engine constants, faction tags, shared tokens   (core batch)
  keywords.json                         KeywordsFile  every keyword and status                          (core batch)
  missions/<mission>.json               MissionDef[]  one record per printed scale                    (core batch)
  deployments/<deployment>.json         DeploymentDef                                                  (core batch)
  presets/<list>.json                   ArmyListDef   First Battle preset, bot lists (M3)              (core batch)
  hooks/core.json                       HookDef[]                                                      (core batch)
  units/terran/<unit>.json   costs/terran.json   hooks/terran.json                                     (Terran batch)
  units/zerg/<unit>.json     costs/zerg.json     hooks/zerg.json                                       (Zerg batch)
  units/protoss/<unit>.json  costs/protoss.json  hooks/protoss.json                                    (Protoss batch)
  cards/<card>.json          costs/cards.json    hooks/cards.json     faction, tactical, creep cards   (Cards batch)
```
- Kind = folder. A kind file holds one record or an array; root files are singletons (one object). Unknown
  folders, files at the wrong depth, units outside `units/<race>/` and hook files other than
  `hooks/<terran|zerg|protoss|cards|core>.json` are load errors. A unit's `race` must match its folder.
- Costs are split by owner so batches never share a file: every `costs/*.json` with the same `table` merges
  into one Cost Table (`mergedCostTable`). The newest `date` wins. Costs never live on unit or card records.
- Ids are kebab-case (`^[a-z0-9]+(-[a-z0-9]+)*$`) and unique across all records of the edition. Nested ids
  (weapons, abilities, upgrades, tokens, options) are unique within their owner, per namespace: weapons
  (default + upgrade weapons), abilities (default + upgrade abilities), upgrades, tokens. Keyword ids are
  UPPER_SNAKE.
- Dependencies between batches: cards reference units (SUMMON, MORPH), so the Cards batch validates after the
  unit batches merge. Faction tags and keywords come from `rules.json` / `keywords.json`; a batch that needs a
  new one reports it instead of editing those files.

## 2. Shared types
```ts
type Id = string; type Source = string | string[]; type Race = 'terran' | 'zerg' | 'protoss'
type Resource = 'CP' | 'BM' | 'PE'                      // Terran / Zerg / Protoss; validator enforces the race's own
type Phase = 'movement' | 'assault' | 'combat' | 'scoring'; type PhaseBand = Phase | 'any'
type Slot = 'core' | 'elite' | 'support' | 'air' | 'hero'
type CombatTag = 'armoured' | 'biological' | 'light' | 'mechanical' | 'psionic' | 'ground' | 'flying'
type TN = 2 | 3 | 4 | 5 | 6                             // "4+" -> 4
type DiceExpr = string                                  // "D3", "D6", "D3+1", "2D6" (^[1-9]?D(3|6)(\+[1-9])?$)
type Characteristic = 'speed' | 'armour' | 'evade' | 'hp' | 'size' | 'shield' | 'supply' | 'roa' | 'hit' | 'range' | 'dmg'
type StatusId = string                                  // keyword id of kind 'status': BURROWED HIDDEN SIEGE_MODE STATIONARY SHIELDED ON_CREEP
type Duration = 'endOfRound' | 'endOfPhase' | 'endOfActivation' | 'untilNextAction' | 'thisAttack' | 'thisRoll' | 'permanent'
interface KwRef { kw: string; x?: number; y?: number; tag?: CombatTag; char?: Characteristic; unit?: Id }
// PIERCE Armoured (2) {kw:'PIERCE',tag:'armoured',x:2}; BURST FIRE 8" (3) {kw:'BURST_FIRE',y:8,x:3};
// IMPACT (4) 3+ {kw:'IMPACT',x:4,y:3}; MORPH (Ravager) 1 {kw:'MORPH',unit:'ravager',x:1}. Params = the keyword's params, exactly.
```
- Printed `-` is JSON `null` (Speed, Evade, Armour, Size, S Dice, Shield). Misprints are entered corrected with
  a `provenance` note on the record, weapon, ability or upgrade (field -> what was printed and why).

### 2.1 Condition (all keys AND-ed; self = the owning Unit, or the affected Unit inside an aura)
```ts
interface Condition {
  tags?, notTags?: CombatTag[]; factionTags?: string[]; race?: Race; units?: Id[]; unique?, structure?: boolean
  size?: {min?, max?}; status?, notStatus?: StatusId[]; engaged?, activated?, onCreep?: boolean
  withinMarker?: number; friendlyModelsWithin?: {n, d}
  weapons?: Id[]; attack?: 'ranged' | 'closeCombat'; attackInstant?: boolean; fromAbility?: Id
  targetWithin?, targetBeyond?: number; targetTags?: CombatTag[]; targetSize?: {min?, max?}; targetStatus?: StatusId[]
  targetActivated?, targetEngagedWithOtherFriendly?, engagedWithSelf?: boolean; targetWithinMarkerOfSelf?: number
  targetSelectedBy?, attackerSelectedBy?: Id              // the Unit picked by this card's ability (Target Lock, Sentenced to Death)
  targetWithinToken?: {token, d}                          // Psionic Presence: target within 4" of the Shade
  first?: 'activation' | 'round'                          // first roll of its kind in that scope
  slots?: Slot[]                                          // M2: the Unit fills one of these Army Slots (Advanced Training)
  entryKinds?: EntryKind[]                                // M2: the arriving Unit came in this way (Photon Overcharge)
  phase?: Phase[]; code?: Id }                            // code = hook escape hatch
type EntryKind = 'edge' | 'friendlyEdge' | 'nonEntryEdge' | 'indicator' | 'place'
// edge = own Deployment Card Entry Edge; friendlyEdge = Pylon / Omega Worm base; nonEntryEdge = another table edge
// (Proxy Barracks, Warp Gate, Timing Push); indicator = End-of-Round drop at a Faction Indicator; place = PLACE from Reserves
```
### 2.2 Effects (`Effect[]`, one vocabulary for abilities, upgrades, cards and mission actions; applied in order)
Base keys on every effect: `op`, `when?: Condition`, `duration?: Duration` (default `permanent` for passives and
upgrades, `endOfRound` for BUFF/DEBUFF), `to?: Subject`, `at?: {event, phase?}` (delayed: resolves at that later
event, e.g. CA-013 End-of-Round set-up at a token), `weapons?: WeaponSel` (which weapons of the affected Unit),
`unitFilter?: Condition` (which Units when `to` is `allFriendly`/`allEnemy`).
`Subject = 'self' | 'target' | 'attacker' | 'triggerUnit' | 'tokenArea' | 'allFriendly' | 'allEnemy' |
'engagedEnemies' | 'summoned' | WeaponSel`; default = the ability's target, else self.
`WeaponSel = {ids?: Id[], phase?: 'assault'|'combat', all?: true, first?: true}`.
`ValueExpr = {count: 'ownModelsWithinTarget'|'modelsInUnit'|'tokensWithin', d?, plus?, token?}` (Medpack HEAL (X)).
`heal.x`, `nonLethal.x` and `damageReduce.n` are a number or a ValueExpr (M2; Life Support).

| op | required | optional | used for |
|---|---|---|---|
| grantKeyword | kw: KwRef | | Stimpack PRECISION, Slugthrower, STRUCTURE, INDOMITABLE, LARGE, DISPLACEMENT |
| denyKeyword | kw: keyword id | | Optical Flare (no LONG RANGE) |
| buff / debuff | char, x | | BUFF Speed (3), DEBUFF Hit (1) on `weapons` |
| modify | char, delta | | flat named changes: Kinetic Foam HP +1, Creep Speed +2 |
| setChar | char | value (number or 'targetSize'), min, max, unmodifiable | Siege size 3, Aftershock, Titan Killers, Prophetic Vision |
| rollMod | roll ('hit','armour','evade','impactHit','charge'), delta | | Adrenal Overload, Mutating Carapace, Lurking |
| weaponMod | (one of) | addSurgeTypes, sDice | Grenades - Frag, Hydriodic Bile, Target Lock |
| status | status, mode ('gain','lose','toggle','keepOnMove') | | Burrow, Mode Transformation, Path of Shadows, Tunneling Claws |
| denyStatus | status | | Underdeveloped Claws |
| cleanse | what ('debuffs') | | Restoration |
| heal / nonLethal | x (number or ValueExpr) | | Medpack, Regeneration, Stimpack |
| hits / impact | x, y | hits: token, radius, perToken | Shadow Strike, Corrosive Bile; Devastating Charge |
| impactBonus | | dicePerModel, hitMod | My Life for Aiur |
| damageReduce / damageCap | n / max | damageReduce: min (Total Damage never below it, M2) | Life Support, Transfusion, Dae'uhl / Improved Barrier |
| removeDice | n | upTo, pool | Point Defense Laser, Guardian Shield |
| canEvade | vs (['all'] or 'ranged','closeCombat','enemyAbilityDamage') | | Combat Shield, Precognition, Hallucination |
| place | x | from ('entryEdge','friendlyUnit','token'), token, minEnemyDist, notInEngagement, allowEngage, optional, wholly | PLACE (X), Burrow Ambush, Blink |
| move | kind ('move','run') | x, towards ('attacker'), freeAction | Lunge, Leg Enhancements |
| charge / chargeAgain | | dice ('best2D6'), plus / differentTarget, ignoreEngaged, noImpact | Metabolic Boost, Leap / Lightning Dash |
| summon / morph / respawn | unit / unit, x / x | summon: anywhere, minEnemyDist | Roachling Infestation, Cocoon, Zergling Reconstitution |
| setToken | token, range (null = anywhere) | wholly, perModel, unoccupied, minEnemyDist (M2) | Shade, Force Field, Creep Tumor, Corrosive Bile, Faction Indicator (drops: more than 10" from enemies) |
| removeToken | token | | Corrosive Bile clean-up |
| aura | radius, centre ('self','token','indicator'), affects (Condition + side), effects | token, los | Source of Creep, Freedom Fighters, Guardian Shield, Void Prison |
| detection | radius | centre, token | Omega Worm, Scanner Sweep, Nerazim Farsight |
| altEntry | kind ('unitBase', 'indicator', 'nonEntryEdge', 'deployNow') | supplyCapPerRound, filter, minEnemyDist (M2) | Omega Network, Warp Conduit, Warp In, Armed and Ready, Timing Push |
| returnToReserves / removeSelf | | | Phase Prism / Point Defense Laser |
| activation | mode ('set','remove') | | Crushing Grip, Orders, Zealous Round |
| ignoreDisengage | | | Orders |
| costMod | res, delta | floor, ability, optional (M2: the player may decline) | Raiders Roll!, Psionic Link, Khalai Ingenuity |
| supplyOverride | purposes ⊂ pool, control, contest, objectives, disengage, vp, all | value, delta, floor | Commander, Advanced Medic Facilities, Freedom Fighters |
| coherency | d | axis ('horizontal' or 'all', default 'all'; M2) | Squadron (horizontal 4") |
| moveThrough | what ('units','impassable') | maxSize, noAccessPoints | Raptor Strain, Tunneling Claws |
| targetRestriction | cannotTarget: Condition | | Point Blank |
| abilityMod | ability, field (closed list, M2: usableInReserves, count.plus, radius, target.range) | value, delta, optional (M2) | A-13 Flash Grenade Launcher, Stabilizer Medpacks, Bloated Bile Ducts, Raiders Roll! |
| gainVP | n | | mission actions |
| code | code (hook id) | args | anything else; one hook each, listed in hooks/<area>.json |

Any key outside base + required + optional is a validation error (typo guard).

### 2.3 Triggers
`Trigger = {event, who?, subject?, within?, attack?: 'ranged'|'closeCombat'|'any', phase?, filter?: Condition}`.
`event`: declareRangedAttack, declareCharge, targeted, attackResolved, beforeArmourRoll, beforeEvadeRoll,
damageSuffered, debuffReceived, chargeDistance, chargeSucceeded, activated, actionResolved, nominatedToDeploy,
leadingModelMoveEnd, usesAbility, startOfRound, endOfRound, endOfPhase, modelsRemoved, and (M2) loseHidden (the
subject just lost HIDDEN, any cause), arrived (the actor was just set up from Reserves; filter `entryKinds`),
placeResolved (a PLACE just finished on the subject). `who` = the Unit acting (friendly, otherFriendly, enemy, any;
default `self` without `subject`, `any` with `subject`, M2 convention); `subject` = the Unit it happens to
(attack/charge target, damaged or debuffed Unit); `within` = inches from this Unit to the subject (or to the actor
without subject). A cost `{res, n: 0}` on a card ability means the card is not exhausted (Advanced Training).
Example: Concussive Shells `{event:'declareCharge', who:'enemy', subject:'friendly', within:8}`.

## 3. UnitDef (`units/<race>/<unit>.json`)
```ts
interface UnitDef {
  id; name; race; factionTags: string[]        // every printed tag, race included
  variantOf?: Id                               // printed "(ZERGLING)": raynors-raider -> marine
  unique: boolean; role: string                // role is display only
  slot: Slot | null; summoned: boolean         // null exactly when summoned (no printed Army Slot, no CT row)
  combatTags: CombatTag[]                      // must include ground or flying
  stats: { shield: number|null; speed: number|[move,run]|null; armour: TN|null; evade: TN|null; hp: number; size: number|null }
  baseMm: number | [w, l]                      // rules.baseSizesMm, or an oval (Hydralisk [40, 100])
  supplyProfile: {min, max, supply}[]          // contiguous from 1, Supply never decreasing
  weapons: WeaponProfile[]; abilities: AbilityDef[]; upgrades: UpgradeDef[]; tokens?: TokenDef[]
  cardVersion: string; provenance?; source }
interface WeaponProfile { id; name; phase: 'assault'|'combat'; range: number|'E'; target: 'ground'|'flying'|'all';
  roa: number | 'BT+N'; hit: TN; surgeTypes: CombatTag[]; sDice: DiceExpr|'BT'|null; dmg: number; keywords: KwRef[];
  template?: 'BT'|'FT'; requiresStatus?: StatusId; provenance? }
interface AbilityDef { id; name; type: 'active'|'passive'|'reaction'; phase: PhaseBand;
  cost?: {res, n: number|'X'}; limit?: 'oncePerRound'|'oncePerGame'; repeatable?; insteadOfAction?; endsActivation?;
  trigger?: Trigger; requires?: Condition; target?: TargetSpec; effects: Effect[];
  options?: {id, cost?, effects, text}[]; text; provenance? }
interface TargetSpec { kind: 'self'|'activeUnit'|'friendlyUnit'|'otherFriendlyUnit'|'enemyUnit'|'anyUnit'|'point'|'tableEdge';
  range?; los?: boolean (default true with a range); unoccupied?; filter?: Condition }
interface UpgradeDef { id; name; phase: PhaseBand; specialist?; replaces?: Id; weapon?: WeaponProfile; ability?: AbilityDef; provenance? }
interface TokenDef { id; name; baseMm: number|null; size: number|null; displacement?; blocks?: {maxSize, removedByLarger}; stayInPlay?;
  terrain?: boolean                            // M2: a terrain piece for movement and LoS (Force Field)
  removedBy?: 'movement'|'place'|'any'         // M2: what removes it besides Cleanup (Force Field: movement, not PLACE)
  text }
```
- One UpgradeDef per CT upgrade row (one price each); exactly one of `weapon` / `ability`. `specialist` is true
  exactly when the weapon carries SPECIALIST. `replaces` (FOR [weapon]) names a default weapon of the card.
- Unit Active abilities print a cost; Reactions need a trigger; `cost.n: 'X'` requires options with costs (Orders).
- Tokens are declared on the record that sets them (Adept: shade); shared ones live in `rules.json` tokens
  (faction-indicator). Summoned Units (Roachling, Point Defense Drone, Pylon, Omega Worm) are full UnitDefs.

## 4. CardDef (`cards/<card>.json`)
```ts
interface CardDef { id; name; kind: 'faction'|'tactical'|'creep'; race; factionTags: string[] // faction: tags it grants; others: tags required
  unique: boolean; slots: Partial<Record<Slot, number>>; resource: {res, n}|null    // null exactly for creep cards
  requiresCreepCard?: boolean (Zerg faction only); abilities: AbilityDef[]; tokens?; cardVersion; provenance?; source }
```
Card abilities omit `cost` (exhausting the card pays) unless the card prints an extra cost. The active Unit is
`target: {kind: 'activeUnit'}`.

## 5. Missions, deployments, presets
```ts
interface MissionDef { id: '<mission>-<scale>'; name; scale: 'skirmish'|'standard'|'grand-offensive'; startSupply; escalation;
  gameLength; specialWinLead: number|null; markerStart: 'activated'|'deactivated';
  startOfRound: {rounds: number[]; action: 'activateRandom'|'activate'|'deactivate'; markers: number[]}[];
  scoring: ScoringRule[]; actions: MissionAction[]; claim?: ClaimRule; text; cardVersion; source }
ScoringRule kinds: supplyDestroyed | perControlledMarker {fromRound, vp:{own,neutral,opponent}} | retakeBonus {fromRound, vp}
  | activatedMarkerCash {fromRound} | quarters {fromRound, vp, controlBonus} | markerControlled {marker, vp, fromRound}
  | claimCarriedInZone {rounds, vp} | ownMarkersNotClaimed {rounds, vp} | code {code, args?}
interface MissionAction { id; name; phase; requires: Condition & {markerWithin, markerSides, controlled?}; effects; text }
interface ClaimRule { fromRound; within; markerSides; maxPerUnit; dropOn[]; dropWithin;
  phase?: Phase; controlled?: boolean }          // M2: Artefact Hunt claims in Scoring, on a marker the claimer controls
interface DeploymentDef { id; name; scale; size: {w, h}; entryEdges: {red: Segment[]; blue: Segment[]};
  markers: {n, x, y}[]; cardVersion; provenance?; source }
type Segment = { edge: 'N'|'S'|'E'|'W'; from; to }    // inches from the edge's low end (W->E, S->N)
interface ArmyListDef { id; name; scale; faction: Id; units: {unit, models, upgrades: {id, model?}[]}[]; cards: Id[]; creepCard?; source }
```
Coordinates use the card frame of spec 17 s2 (origin bottom-left, x right, y towards N). Zones are derived from
entry edges (spec 17 s6), never stored. Skirmish uses markers 1, 2, 5.

## 6. KeywordsFile (`keywords.json`)
`{id: 'keywords', keywords: KeywordDef[], source}`; `KeywordDef = {id: UPPER_SNAKE, name, kind: 'weapon'|'effect'|
'defensive'|'status'|'ability'|'term', params: ('x'|'y'|'tag'|'char'|'unit')[], stacking: 'flag'|'max'|
'perCharacteristicMax', spec: '18 KW-028', text, source}`. Holds every Part 11 weapon/effect/defensive keyword,
every status, and the recurring card abilities that act like keywords (STRUCTURE, INDOMITABLE, LARGE). A status
in a weapon's Keyword column goes in `requiresStatus`, never in `keywords`.

## 7. CostTableDef (`costs/<owner>.json`), HookDef, RulesDef
```ts
interface CostTableDef { id: 'ct-2026-10-<owner>'; table: 'ct-2026-10'; date: '2026-10-09';
  units: Record<unitId, {compositions: {models, supply, minerals}[]; upgrades: Record<upgradeId, (number|null)[]>; source}>;
  cards: Record<cardId, number>; source }       // upgrade prices: one per composition, small -> large; null for "-"
interface HookDef { id; text; source }           // hooks/<area>.json: the named engine hooks `code` may call
interface RulesDef { id: 'rules'; engagementRange, coherency, contestRange, hiddenRange, zoiDepth, gapClearance, tnClamp,
  maxRerollsPerDie, closeRanksMax, eliminationVP, markerDiameterMm, baseSizesMm, scales, factionTags: Sourced<...>;
  claimTiming?: Sourced<{phase, markerMustBeControlled, order}>   // M2: mirrors ClaimRule phase/controlled
  tokens: TokenDef[]; source }                   // Sourced<T> = {value: T, source}
```
CL-changed rows cite `"CL p.2"` with the CT page. CT rows for Units with no card in our sheets (Nova, Raven,
Vileling, Defiler, Zagara, High Templar, Tassadar ...) are allowed and produce a warning.

## 8. Validator checks (`npm run validate:data [--dir <root>]`; errors exit 1, warnings print)
1. Every record has `id` and `source`; ids kebab-case and edition-unique; nested ids unique per namespace; `name`
   on every record except costs and hooks; hooks have `text`.
2. Layout: files sit where section 1 says; a unit's race matches its folder; editions.json lists every folder.
3. References resolve: `variantOf`, `replaces` (a default weapon), weapon ids in `to`/`weapons`/conditions,
   ability ids in `abilityMod`/`targetSelectedBy`/`fromAbility`, token ids (own record or rules.json),
   summon/morph/`units` ids, preset ids.
4. Every keyword used exists in keywords.json with exactly its params; every status is a keyword of kind status.
5. Every `{code}` (effect, condition, scoring) is listed in some `hooks/<area>.json`.
6. Supply Profile contiguous from 1, non-overlapping, never decreasing; every CT composition's `supply` equals the
   card bracket at its `models`.
7. Costs: every non-summoned Unit has a row in the newest table; every unit upgrade has a price per composition
   and every priced upgrade exists on the card; summoned Units have no row; every tactical/creep card has a gas
   price, faction cards none.
8. Unit shape: slot null iff summoned; ground or flying tag; stats ranges; base in `baseSizesMm` or an oval;
   unit ability costs in the race's resource (misprints need `provenance`); Active unit abilities carry a cost;
   Reactions carry a trigger; `cost 'X'` has costed options; upgrade has exactly one of weapon/ability;
   specialist iff SPECIALIST.
9. Weapons: combat phase iff range `E`; `sDice` null iff no Surge types; `BT+N` RoA and `BT` S Dice need
   `template: 'BT'`; dice match `DICE_RE`.
10. Effects: known op, `OP_FIELDS` present, no unknown keys, enum values (char, roll, status mode, subject,
    purposes, trigger events). M2: number-or-ValueExpr fields, `damageReduce.min`, `minEnemyDist` > 0,
    `altEntry.kind`, `coherency.axis`, `abilityMod.field` in the closed list, `optional` boolean, Condition `slots`
    and `entryKinds`; TokenDef keys (typo guard), `terrain`, `removedBy`; ClaimRule `phase`/`controlled`;
    rules.json `claimTiming`.
11. Cards: faction tags known and include the race; slots valid; creep cards `resource: null`, others the race
    resource. Missions: game length, round lists inside it, markers legal for the scale. Deployments: segments on
    the table edges, markers on the table and unique.
12. IP prose guard (only when the gitignored `docs/sources/text` exists, so CI skips it): no `text` field shares
    an 8-word run with the card sheets.

## 9. Engine notes
- `query.ts` `mergedCostTable(bundle)` is the only cost reader (GEN-006, COST-002).
- `setup.ts` reads the Marine record for the demo squad (M1); M2 replaces setup with real army building.
- A hook named in data and absent from the engine registry is an M2 runtime error until implemented.

## 10. Dry run (M1, 2026-10-13) and how each hard case is encoded
Scratch output: `docs/sources/dryrun/` (gitignored), validated clean with `--dir`. It encoded Marine, Marauder,
Medic, Jim Raynor, Point Defense Drone, Raynor's Raider, Goliath, Siege Tank, Hydralisk, Kerrigan, Omega Worm,
Kerrigan Swarm Raptor, Queen, Roach, Corpser, Roachling, Vile, Zergling, Raptor, Swarmling, Ravager, Adept,
Artanis, Praetor Guard, Pylon, Sentry, Stalker, Zealot, Immortal, Zeratul, Nerazim Watchers; Raynor's Raiders
(faction), Orbital Command (tactical), Supply Drop skirmish, Abandoned Camp; plus CT rows for all of them. Every
CT composition matched the bracket read from the card images.

| Hard case | Encoding |
|---|---|
| Supply Profile brackets | `supplyProfile` from the card image (`1-3/0, 4-6/1, 7-9/2`); CT check proves them |
| Split speed `4/7`; `-` speed/size/evade | `speed: [4, 7]`; `null` (PDD Speed and Size, Goliath Evade) |
| Shield | `stats.shield` (Protoss), null elsewhere; SHIELDED is a status |
| Multi-weapon units | several `weapons` (Goliath 3 ranged + Stomp; Artanis two combat profiles; Queen `talons` + `talons-cc`) |
| Specialist upgrades / FOR [weapon] | `specialist: true` + SPECIALIST kw; `replaces: '<default weapon id>'` |
| Phase boxes | `phase` on abilities and upgrades = the printed band; weapons by table |
| Combat tags, base size, oval | `combatTags`; `baseMm: 32` or `[40, 100]` |
| Keyword args | KwRef params (PIERCE tag+x, BURST FIRE y+x, LONG RANGE x) |
| Active / passive / reaction, CP/BM/PE costs | `type`, `cost {res, n}`; Orders `n: 'X'` + costed `options` |
| Burrow / cloak / detection | `status` toggle BURROWED; HIDDEN gain with `untilNextAction`; `detection` op |
| Transports | no container: `returnToReserves` + `place`/`altEntry` + delayed `at: endOfRound` (spec 16 s8) |
| Tokens | `tokens[]` on the record; `setToken`; delayed set-up at the token (`place from token, at endOfRound`) |
| Summoned Units | full UnitDef, `summoned: true`, `slot: null`, no CT row |
| Variants | full records + `variantOf` |
| Misprints | corrected value + `provenance` (Glial Reconstitution CP->BM, Pylon ARMORED, AGG-12 "RIFFLE") |
Cross-check: the community BattleScribe files agree on stats except Protoss Size (they hold other numbers) and
pre-CL costs (Marine 160/210); the official sheets and CT win.
