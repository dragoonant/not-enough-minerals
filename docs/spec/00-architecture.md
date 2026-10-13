# 00: Architecture

Contracts here are FROZEN after M1. A change needs an edit to this file, an entry in section 10 and a note in the
agent's `issues`. The skeleton was copied from the base project (Fell-in) and stripped of its rules. This file keeps
its engine contracts and adds the StarCraft TMG module map. The rules live in specs 10-19; where a rules spec names a
function or decision kind, section 3.3 maps it to the protocol names used here.

Guiding rule (KB 9.3): **one generic mechanism per concept, planned now.** Section 4 lists each concept, its single
owner and the shortcuts that are not allowed. A second mechanism for a concept that already has one is a review
blocker.

## 1. Modules

```
src/engine/   pure TypeScript, no DOM, no Math.random, never imports JSON. State in, state out.
  -- frozen at M0 (skeleton) --
  types.ts      contract types                  decider.ts  Decider interface, random + replay deciders
  view.ts       per-seat view (section 5)       rng.ts      seeded sfc32 + D6 helpers, roll(), deriveSeed()
  pending.ts    raise() the one open decision   registry.ts action protocol: ModuleDef, Controller, raiseDecision
  apply.ts      validate, dispatch by namespace, afterAction, append to log
  -- generic geometry (base project; M2 replaces the TODO(M2) movement/cover details per spec 14) --
  geometry.ts   circle bases, sweeps, placement, path validation
  measure.ts    distance(a,b), within, whollyWithin (base edge to base edge, inches, 1e-6 epsilon)
  los.ts        line of sight with an explaining verdict (spec 14 s6)
  terrain.ts    terrain pieces: Size, footprint, walkable tops, ACCESS POINTs, Grass (spec 14 s4-5)
  -- M2 shared services (no decisions; pure functions over state) --
  edition.ts    bundle lookups: unit profiles, weapons, missions, deployments, rule constants
  dice.ts       test(dice, tn) primitive, finalTN clamp 2..6, natural 1/6, re-roll flag, D3, exact odds
  effects.ts    one Effect list per unit; statOf(unit, stat) folds BUFF/DEBUFF/flat mods (spec 16 s6)
  squads.ts     UnitState helpers: unitModels(), leading model, coherencyState(), formation placer (spec 14 s10)
  engage.ts     engaged(a,b) with the tag/terrain/elevation gates, engagedPairs cache (spec 14 s9)
  visibility.ts canSee(actor,target): LoS + HIDDEN 4" filter + detector areas + BURROWED (spec 16 s7)
  supply.ts     supplyFor(unit,purpose), poolFor(round), available(seat), canArrive(), supply-lost ledger (spec 15)
  control.ts    marker contest and control by Supply, Sticky Control (spec 11 s9.1, spec 15 s6)
  hooks.ts      hook points, HOOK_WIRING table, runHook(); code-hooks.ts holds the {code} implementations
  query.ts      every number the client or AI shows (section 6)
  army.ts       validateArmy(list, scale), costs from the 10.2026 Cost Table (spec 15 s9-10)
  -- M2 rules modules (each owns the namespaces listed in section 3.2) --
  turnflow.ts   controller: rounds, the four Phases, initiative, alternating activation and Pass, markers
  setup.ts      createGame(), draft, terrain, First Player Marker Roll-Off (spec 17 s1-4)
  movement.ts   reposition(unit, spec): Move, Run, Disengage, Close Ranks, PLACE, forced moves (spec 14 s8)
  reserves.ts   Reserves container, arrive(unit, entry), ReturnToReserves, arrival queue (spec 15 s3-4, 16 s8)
  shooting.ts   Ranged Attack batches and templates (spec 13 s5, s9-10)
  charge.ts     Charge declare, roll, path (spec 13 s12)
  melee.ts      Combat Phase: Close Ranks, attacker declaration, split across enemy units (spec 13 s8)
  attack.ts     THE attack pipeline: resolveBatch(batch, entryStep) hit > surge > armour > evade > damage
  damage.ts     allocateDamage() and removeModels(): carry-over marker, Shield, casualty priority (spec 13 s7)
  abilities.ts  Active/Passive/Reaction abilities, card Ready/Exhausted, pay() solver (spec 16 s1-5)
  missions.ts   mission actions (Gather, CLAIM), start-of-round marker steps, scoring vocabulary (spec 17 s7)
  scoring.ts    Phase 4 pipeline: control, VP, end check, end of round, cleanup, initiative (spec 11 s9)
src/data/     JSON bundle + schemas (M1 freezes the schema after a dry run on every Founders card)
src/ai/       deciders: random (M0), normal and easy utility AI (M4); Web Worker host (spec 30)
src/client/   React 19 + R3F + zustand; never mutates GameState, never computes a rules number (spec 50)
tools/        sim, ai-bench, validate-data, probe-deploy (M2), workflows
```

Imports flow one way: services never import rules modules; rules modules import services and `registry.ts`;
`turnflow.ts` is the only module that calls `allOptions()`. The client imports engine code only through
`src/client/contract.ts` (spec 50 s1).

## 2. Units, table and coordinates
- 1 world unit = 1 inch. Ground plane x/z, y up, origin at the table centre. Seat 0 sits at the near edge (+z).
- Tables (spec 17 s2): Skirmish 36 x 36, Standard 54 x 36 (x = 54). `scenario.table = {w, d}` comes from the
  Deployment Card. The skeleton's `TABLES.standard` is `{w: 36, d: 54}`; M2 changes it to `{w: 54, d: 36}`
  (section 10).
- Card frame to world: data keeps every coordinate in the card frame of spec 17 s2 (origin bottom-left, x right,
  y towards the N edge). `edition.ts` converts once: `world.x = card.x - W/2`, `world.z = H/2 - card.y`. The card
  is never mirrored or rotated (RULING R17-2); a seat whose Entry Edge is the far side simply gets the far camera.
- Bases are round, in mm: 25, 32, 40, 50, 80, 100, 150 (`BaseMm`). A flight-stand model uses its stand's base.
  Mission Markers are 32 mm discs with no physical presence.
- Elevation is a level tag (GROUND, MID, HIGH) plus a surface height in inches for rendering; rules read the tag.

## 3. Decision model and the action protocol

### 3.1 Decisions (frozen)
- Exactly one `PendingDecision` is open: `{id, seat, kind, context, options, canPass}`. `seat` may be `'all'`.
- `legalActions(state)` is never empty for an open decision, and every member validates. Feasibility means "some
  candidate passes full validation", never "the planner's favourite layout fits" (KB 1.3).
- An `Action` carries `decisionId` and `seat`. A stale or illegal action gets a `Rejection` and the same state
  reference back. The engine never throws on bad input; an unbuilt body throws `TodoError`, reported as `E_TODO`.
- Options are templates: an answer must carry every template field unchanged; extra fields are parameters
  (a path, a placement, a dice pick) that the owning module validates. Parameterised types are listed in
  `PARAMETERISED` (`src/ai/random.ts`) so the AI and the sim know to dry-run them.
- Roll-Offs and other pure dice steps are not decisions. Only a choice is a decision.

### 3.2 Namespaces (`<namespace>.<verb>`, one owner each)
| Namespace | Owner | Decision kinds (k) and action types (a) |
|---|---|---|
| `setup` | setup.ts | k `setup.colour`, `setup.draftControl`, `setup.ban`, `setup.pick`, `setup.terrain`, `setup.firstPlayer` |
| `turn` | turnflow.ts | k `turn.start`, `turn.first` (who activates first), `turn.activate` (unit x action menu + Pass), `turn.order` (order own simultaneous effects); a `turn.pass`, `turn.hold` |
| `move` | movement.ts | a `move.go`, `move.run`, `move.disengage` (menu); k `move.path` (Leading Model path + optional formation), `move.place` |
| `deploy` | reserves.ts | a `deploy.go` (menu); k `deploy.entry` (edge segment or alternate entry), `deploy.path`; end-of-round drops reuse these |
| `shoot` | shooting.ts | a `shoot.go` (menu); k `shoot.batch` (weapon profile + target, or done), `shoot.template` (template position) |
| `charge` | charge.ts | a `charge.go` (menu); k `charge.targets`, `charge.path` (after the roll) |
| `melee` | melee.ts | a `melee.go` (Combat activation); k `melee.closeRanks`, `melee.split` |
| `atk` | attack.ts + damage.ts | k `atk.reroll`, `atk.precision`, `atk.tough`, `atk.casualty` (defender picks a removal) |
| `ability` | abilities.ts | k `ability.window` (before/after the action), `ability.target`, `ability.pay`, `ability.react` |
| `mission` | missions.ts | a `mission.<verb>` from the Mission Card (e.g. `mission.gather`, `mission.claim`); k `mission.choose` |
| `score` | scoring.ts | k `score.order` (order own end-of-round effects) |

New namespaces need a row here (section 10). `registry.modules()` throws at load if two modules claim one namespace.

### 3.3 Names used in the rules specs
Spec 11 `activate` = `turn.activate`; `chooseFirstActivator` = `turn.first`; spec 13 `chooseBatch` =
`shoot.batch`; spec 17 `draftColour`/`draftControl`/`draftBan`/`draftPick`/`terrainChoice`/`firstPlayerAssign` =
`setup.colour`/`setup.draftControl`/`setup.ban`/`setup.pick`/`setup.terrain`/`setup.firstPlayer`. Spec 11's
`state.phase` values become `state.roundPhase` (section 4.1); `state.phase` stays the game lifecycle.

### 3.4 Flow
`apply` checks game over, decision id, seat and template match, then calls `moduleFor(pending.kind).resolve()`.
A step returns `{state}` with a new decision raised by `raiseDecision`, or `{state, done}`; `done` goes to
`turnflow.afterAction`, which opens the after-action ability window, then the next turn (or ends the Phase when
both seats have passed). Turnflow forwards a menu pick (`move.go`, `shoot.go`...) to `moduleFor(action.type)`.
A sub-pipeline started by another module (the attack, a reaction window, a payment) hands control back through
the starter's optional `ModuleDef.resume(state, bundle)`, called via `registry.resumeIn(namespace)`;
`AttackState.returnTo` names it. `ModuleDef.options(state, bundle, unitId)` takes the active Unit id at M2.

## 4. One generic mechanism per concept
| Concept | The one mechanism | Owner | Not allowed |
|---|---|---|---|
| Round and Phases | `turnflow.phaseLoop(phase)`: alternate turns between seats still in, each turn = activate one eligible unit for one action, or Pass. Parameterised by `eligible(unit, phase)` and the registry menu. Phase 4 is a fixed pipeline of six steps. | turnflow, scoring | a per-phase copy of the loop |
| Initiative | `state.firstPlayer` + `state.firstPasser[phase]`; transfer on Phase 1->2 and 2->3 only (RULING R11-2). | turnflow | |
| Repositioning | `reposition(unit, spec)` for Move, Run, Deploy, Disengage, Charge, Close Ranks, PLACE and forced moves: Leading Model path, then the formation placer; coherency and Zone of Influence checked once at the end; fires `onMoveEnd`. | movement | a module moving models itself |
| Squads | `UnitState` owns `modelIds`; `unitModels(state, unitId)` is the only lookup (shape from Mallet `state.ts`). `coherencyState(unit)` (BFS from the Leading Model, 3") is stored as `unit.inCoherency` at the end of a reposition only; casualties never change it. | squads | reading `state.models` filtered by `unitId` elsewhere |
| Attack | `resolveBatch(batch, entryStep)` over `{attackPool, armourPool, damagePool, surgeDie}`. Ranged, close combat, templates enter at step 1; HITS and IMPACT at step 3. Surge, CRITICAL HIT and DODGE in step 2. | attack | a melee-only or template-only pipeline |
| Damage | `allocateDamage(unit, total, mode, eligible?, cap?)` with `mode` visible or engaged; leftover goes on `unit.damage` (carry-over, no cap). `removeModels(state, unitId, ids, cause)` is the only remover; it fires `onModelsRemoved` (Supply bracket, supply-lost ledger, Shielded, Destroyed). | damage | a second removal path (Mallet ended with three) |
| Supply | `supplyFor(unit, purpose)` with purpose `pool`, `control`, `disengage`, `vp`; `poolFor(round)` derived from the Mission (Infinity in the final round); `available(seat)` recomputed per call; `canArrive(seat, unit)`. | supply | storing a Pool counter or reading raw Supply numbers |
| Reserves and arrivals | Reserves is the one container. `arrive(unit, entry)` with `entry.kind` edge, friendlyEdge, indicator or place runs `canArrive`, the Zone of Influence ban and the placer, then fires `onArrive{entryKind}`. Delayed arrivals (end-of-round drops) are rows in `state.arrivals`, resolved at Scoring step 4, First Player Marker holder first. | reserves | a second deploy path for SUMMON, MORPH or transports |
| Transport | No embark rules exist in any source (spec 16 s8 GAP), so there is no transport entity: ReturnToReserves plus an alternate `arrive` entry. | reserves | a cargo container |
| Objective control | `control.contest(state, marker)` sums `supplyFor(unit, 'control')` for eligible contesters (In Coherency, Within 3", LoS, not Flying, not BURROWED); Scoring step 1 stores `marker.controller`. `query.objectiveStatus` feeds the tracker and the rings. | control | any client-side control calculation (Mallet bug) |
| Visibility | `canSee(actor, target)` = LoS clear and (not HIDDEN or within 4"). HIDDEN and BURROWED are statuses in the unit's Effect list; cloak-like abilities are sources of HIDDEN; detection is `state.detectors: DetectorArea[]` that strip HIDDEN at check points and fire `onLoseHidden`. Every targeting, casualty-visibility and Spillover check calls `canSee`. | visibility | per-keyword visibility code |
| Statuses and buffs | One `Effect` list per unit (`buff`, `debuff`, `status`, `flat`; expiry `endOfRound`, `untilAction`, `permanent`, `whileCondition`, `burrowLinked`). `statOf()` folds it. | effects | flags on `UnitState` for a status |
| Abilities and cards | Declarative JSON (section 4.2) run by one interpreter; `{code}` for the rest. One reaction per player per activation; per-round usage ledger. | abilities | card-specific branches in rules modules |
| Dice | Every die comes from `roll()`; every test uses `dice.test(dice, tn)`; every die carries `rerolled`. | dice, rng | |

### 4.1 State shape added at M2 (additive to `types.ts`)
- `UnitState {id, owner, profileId, modelIds, location: 'reserves'|'table'|'destroyed', activation: null|'movement'|
  'assault', leadingModelId, inCoherency, damage, shielded, effects: Effect[], weapons (per model), usage (ledger),
  summoned, noShootChargeRound}`. `ModelState` gains `weapons: string[]` and `hp`; `unitId` becomes required.
- `GameState` gains `units`, `roundPhase: 'movement'|'assault'|'combat'|'scoring'|null`, `firstPlayer`,
  `firstPasser`, `passed`, `active` (seat whose turn it is), `missionId`, `deploymentId`, `markers: MarkerState[]`
  (spec 17 s5 shape), `tokens: TokenState[]`, `detectors`, `arrivals`, `attack` (the open batch and its pools),
  `reactionsUsed`, `draft`, `cards: Record<SeatId, CardState[]>`. `maxRounds` holds the Mission's Game Length.
- `SeatState` gains `colour: 'red'|'blue'`, `vp`, `supplyLostThisRound`, `factionCardId`. `score` mirrors `vp`.
- `PlayerView` gains the same public fields (section 5).

### 4.2 Abilities and cards as data
An ability record (schema frozen at M1 after the dry run, spec 20):
```json
{ "id": "example-buff", "name": "Example Buff", "type": "active", "phase": ["assault"],
  "cost": { "res": "CP", "n": 1 }, "repeatable": false, "oncePerGame": false,
  "trigger": null, "target": { "scope": "friendlyUnit", "range": 6 },
  "effect": [ { "op": "buff", "stat": "roa", "x": 1, "expires": "endOfRound" } ],
  "source": "CS1-T p.N" }
```
- `type` active, passive or reaction; `trigger` names a hook point (section 4.3) for reactions and passives.
- Effect verbs (closed list, grown only by the dry run): `buff`, `debuff`, `status`, `heal`, `nonLethal`,
  `hits`, `impact`, `place`, `returnToReserves`, `arrive`, `summon`, `morph`, `respawn`, `detect`, `token`,
  `resource`, `reroll`, `modifyTest`, `reduceDamage`, and `{ "code": "<hookName>", "args": {...} }`.
- Costs CP, BM, PE are paid through `abilities.pay(seat, res, n)`, the one payment solver (spec 16 s5).
- `validate:data` rejects an unknown verb, an unregistered `code` name and a `trigger` missing from HOOK_WIRING.

### 4.3 HOOK_WIRING (`src/engine/hooks.ts`)
Every hook point is called from exactly one place. A test must show each hook firing in a real game (KB 9.3).
| Hook point | Called from | Typical users |
|---|---|---|
| `startOfRound` | turnflow.startRound step 5 | Start-of-round abilities, mission marker activation (step 1 is `missions.startOfRound`) |
| `beforeAction`, `afterAction` | turnflow ability windows | Active abilities, Tactical Card actives |
| `onTargeted` | shooting.declareBatch, charge.declare | defensive reactions |
| `onChargeDeclared`, `onChargeRoll` | charge.ts | charge reactions, roll modifiers |
| `attackMods` | attack.ts step 1 | RoA, Hit and Surge modifiers (BURST FIRE, LOCKED IN, buffs) |
| `beforeArmourRoll`, `beforeEvadeRoll` | attack.ts steps 3 and 4 | armour or evade replacing reactions, TOUGH, ANTI-EVADE |
| `reduceDamage` | attack.ts step 5 | damage-reducing abilities (may eat the old marker) |
| `onModelsRemoved` | damage.removeModels | supply ledger, Shielded, Destroyed, RESPAWN |
| `onMoveEnd` | movement.reposition | STATIONARY loss, Grass removal, detection checks |
| `onArrive` | reserves.arrive | arrival reactions that read the entry kind |
| `onLoseHidden` | visibility.detect / effects.setStatus | effects that end with HIDDEN; Might of the Nerazim (`loseHidden`) |
| `onPlaceResolved` | movement.reposition (kind place) | Veil of Shadows (`placeResolved`) |
| `poolMods`, `supplyMods` | supply.poolFor, supply.supplyFor | card changes to Pool or per-purpose Supply |
| `canContest` | control.contest | statuses that block or allow contesting |
| `endOfRound` | scoring step 4 | end-of-round drops, End of Round effects |
| `cleanup` | scoring step 5 | expiry, card Refresh, token removal |

## 5. Hidden information
StarCraft TMG is played open: army lists, Reserves, cards and their Ready state are public, and HIDDEN is a
targeting rule, not secret information. `view(state, seat)` therefore passes the public state through (units,
markers, cards, supply, VP) and never includes `rng`, `log` or test-only fields. Deciders only ever receive the
view. The sim's `VIEW-*` leak test checks that the view has no `rng` and that a decider cannot reach the raw state.

## 6. The engine owns every displayed number
`query.ts` exports, and the client and AI use nothing else:
- `attackPreview(attacker, weapon, target)`: per-model dice, Hit TN, Surge expectation and tag match, Armour and
  Evade TNs (or "no roll possible" with the reason), expected damage, distribution of models removed, kill odds,
  expected Supply removed. Exact over the dice, not sampled.
- `chargeOdds(unit, targets)`: the roll needed and its probability. `canSee` with reasons, `coverFor`, `engaged`.
- `supplyStatus(seat)`: Pool, on-table Supply, Available, next round's Pool, reserve units that fit now.
- `objectiveStatus(state)`: per marker the contest totals, controller, Activated face, and VP if scoring now.
- `coherencyPreview(unit, placement)`, `reachOf(unit)` (move and charge reach), `missionScore(seat)`.
Every attack stage emits an `atk.stage` event with the dice, TN and which dice moved where, so the dice tray shows
the working from events. A Monte Carlo test checks `attackPreview` against the real pipeline (spec 60).

## 7. Determinism
`rng.ts` is sfc32 seeded by cyrb128. Only `roll(state, spec)` advances `state.rng` and `state.rollSeq`. Bots and
the AI derive their own stream with `deriveSeed(seed, decisionId, ...)` and never touch `state.rng`. A game is
reproducible from `(seed, action log)`. Test-only: `state.debug.forcedDice` (a queue of faces) is consumed by
`roll()` before sfc32 so the golden test can replay a printed example; the sim asserts it is never set.

## 8. Decider and test hooks
```ts
interface Decider { decide(view: PlayerView, pending: PendingDecision, legal: Action[]): Promise<Action> }
```
One interface for human, AI, random bot and replay. Client hooks: `?test=1&seats=human,bot&seed=<s>`,
`?scenario=<id>`, `?tier=random|easy|normal`, `?speed=`, `?fps`, `?gallery`. `window.__game` exposes `getState`,
`view(seat)`, `pending`, `legalActions`, `submit`, `pauseBots` and the parsed params. E2E tests pick text exactly and
use `data-testid` (spec 50 s7).

## 9. Performance budgets
Engine step under 5 ms p95 in the sim (LoS cached per pair and terrain version). AI per decision: `AI_MS` /
`VITE_AI_MS`, default 1500 ms in the skeleton, target mean under 150 ms (spec 30 s10). Scene above 30 fps on the
Windows PC with 40 figures (two Founders armies) and 15 terrain pieces. 

## 10. Contract change log (additive only)
- M0 (skeleton): initial contracts copied from the base project, stripped of its rules: frozen `types.ts`,
  `decider.ts`, `view.ts` (pass-through), `rng.ts` (D6), `pending.ts`, `registry.ts`, `apply.ts`; placeholder
  `turnflow.ts` (`turn.choose`, `turn.roll`, `turn.pass`, PLACEHOLDER_ROUNDS = 3, always a draw); data records
  `{id, name, source}` in units/factions/scenarios plus the `rules` singleton.
- M0 (spec): planned M2 additions recorded here so the rules owners build against them:
  - Namespaces of section 3.2; the placeholder `turn.choose`/`turn.roll` are removed when M2 lands.
  - `types.ts`: `UnitState`, `RoundPhase`, `MarkerState`, `TokenState`, `CardState`, `Effect`, `DetectorArea`,
    `ArrivalRow`, `AttackState`, `DraftState` and the `GameState`/`SeatState`/`ModelState` fields of section 4.1;
    `RejectionCode` gains `E_COHERENCY`, `E_NO_SUPPLY`, `E_ZONE`, `E_ENGAGED`, `E_NOT_ENGAGED`, `E_NO_LOS`,
    `E_OUT_OF_RANGE`, `E_ACTIVATED`, `E_COST`, `E_USED`.
  - `setup.ts`: `TABLES.standard` becomes `{w: 54, d: 36}`; `createGame(bundle, {seed, seats, missionId,
    deploymentId, armies, preset})`, preset `first-battle` = spec 17 s9; `maxRounds` = Mission Game Length.
  - `rng.ts`: `state.debug.forcedDice` (test-only, section 7).
  - `view.ts`: public fields of section 5; still no redaction.
- M2 (foundations, 2026-10-13): the planned M0 (spec) additions above landed, with these details:
  - `types.ts`: `UnitState {id, owner, profileId, modelIds, location, activation, leadingModelId, inCoherency,
    damage, shielded, effects, upgrades, slot, usage, summoned, noShootChargeRound}`. The per-model loadout lives
    on `ModelState.weapons` (not on UnitState) so there is one store; `ModelState.hp` (Shield folded into the first
    model) and `ModelState.unitId` are required. `Effect {id, source, kind: buff|debuff|flat|status|keyword|deny|mod,
    stat?, x?, status?, kw?, weapons?, expires, bySeat, round, data?}`, `EffectExpiry` (data Durations plus
    `untilAction`, `whileCondition`, `burrowLinked`), `MarkerState` (world `pos`, `side`), `TokenState`,
    `DetectorArea`, `ArrivalEntry {kind: EntryKind, ref?, segment?}`, `ArrivalRow`, `Die`, `DieGroup`,
    `AttackBatch`, `AttackPools`, `AttackState {batch, pools, step, totalDamage, queue, returnTo}`, `DraftState`,
    `CardState`, `DebugState`, `RoundPhase`, `Colour`, `SupplyPurpose`, `UnitId`. GameState adds `units`,
    `roundPhase`, `firstPlayer` (null = Roll-Off pending), `firstPasser`, `passed`, `active`, `activeUnit`,
    `missionId`, `deploymentId`, `markers`, `tokens`, `detectors`, `arrivals`, `attack`, `reactionsUsed: SeatId[]`,
    `draft`, `cards`, `debug?`. SeatState adds `colour`, `vp`, `supplyLostThisRound`, `factionCardId`. PlayerView
    adds the public fields. RejectionCode adds the ten M2 codes.
  - `errors.ts` (new leaf): `reject`, `isRejection`, `TodoError`, `todo`, re-exported by `registry.ts`, so services
    never import the module table.
  - `registry.ts`: the module table holds all eleven namespace owners; `NAMESPACES` mirrors section 3.2 and
    `modules()` throws when a module claims a namespace that is not its own; `ModuleDef.resume?`, `resumeIn()`,
    `ActionDone.unitId?` and `endsActivation?`, `updateUnit()`.
  - `rng.ts`: `roll()` consumes `state.debug.forcedDice` first without advancing `state.rng`.
  - Services: `dice.ts` (complete: clampTN, finalTN, succeeds, rollDice, test, reroll, d3, parseDice, rollExpr,
    rollOff, pSuccess, pAtLeast, binomial, convolve, exprDistribution, capAt, mean, atLeastP), `edition.ts`
    (complete: rule(), record lookups, allWeapons/allAbilities, tokenDef, bracketSupply, cardToWorld/worldToCard,
    tableOf, segmentToWorld, zoneRect, markerSide), `query.ts` (signatures of section 6; bodies TODO).
  - Stubs with frozen signatures (bodies throw TodoError): effects, squads, engage, visibility, supply, control,
    army, code-hooks, movement, reserves, shooting, charge, melee, attack, damage, abilities, missions, scoring, plus
    M2 entry points added to turnflow (`eligible`, `startRound`, `startPhase`, `openActivation`) and setup
    (`setupGame`, `setupModule`, CreateGameOpts `missionId`/`deploymentId`/`armies`/`preset`). `hooks.runHook` is a
    neutral no-op until the interpreter lands; hook point `onPlaceResolved` added to section 4.3.
  - `setup.ts` `modelDefaults`/`gameDefaults`/`seatDefaults` fill the new required fields (placeholder game only).
- M3 (integration, 2026-10-13): `query.ts` adds `unitSupply(unit)` (supplyFor, purpose pool) for the Reserves tray,
  `poolTable()` (`{round, pool | null}` per Round, null = unlimited final Round) for the briefing, and
  `detectedUnits()` (units inside an enemy detector area, effects.inDetection) for the 'detected' status icon.
  `contract.ts` exposes them as `useUnitSupply`, `usePoolTable`, `useDetectedUnits` (and in `queries`).
- M3 (fix, 2026-10-13): additive `query.ts` changes. `shootOptions(unit)` returns per weapon and enemy unit either
  eligible (with printed vs rolled Hit TN and `hitNotes`: indirectFire, longRange, cover, highGround) or a `reason`
  code plus plain-words `text` with numbers (range, nearest distance), and a unit-level `canShoot`/`reason`, for the
  weapon panel and action menu (eligibility is `shooting.planBatches`). `CoherencyPreview.links: [ModelId, ModelId][]`
  (pairs with base edges within the coherency distance and a valid link). `ObjectiveStatus` gains `markerRadius`,
  `contestRadius` (inches) and `contested` (two or more seats have a Unit that can contest the marker); the client
  reads these instead of computing the ring.
