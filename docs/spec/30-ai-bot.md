# 30: Versus bot (our AI)

We found no official solo mode for StarCraft TMG, so this bot is the only opponent: **the AI is the product**. It is
a utility AI adapted from Fell-in's (spec 30 there, itself from the WHI bot). For each open decision it scores the
legal answers with numbers the engine computes and picks the best. Order of work: random (exists), normal (M4), then
easy as a parameter set of normal.

Frozen at M4: `src/ai/types.ts`, `src/ai/decider.ts`, `src/ai/world.ts`, `src/ai/random.ts`, `src/ai/worker.ts` and
the export lists of `eval.ts`, `threat.ts`, `moves.ts`, `policies.ts` (section 13). Build owners fill the bodies.

## 1. Inputs and the rules boundary
- A decider receives only `view(state, seat)`, the open `PendingDecision` and `legalActions` (spec 00 s3, s5). It
  never sees the raw state and never reads `state.rng`.
- The AI never re-derives a rule. Every number comes from `query.*`: `attackPreview`, `chargeOdds`, `shootOptions`,
  `supplyStatus`, `unitSupply`, `poolTable`, `objectiveStatus`, `missionScore`, `canSee`, `coverFor`, `engaged`,
  `reachOf`, `coherencyPreview`, `detectedUnits`. Missing numbers are requested as additive `query.ts` helpers
  (logged in spec 00 s10), never computed in `src/ai`.
- `world.queryState(view, bundle)` is the read-only shim `query.*` runs on: every public view field, engine defaults
  for the rest, a throwaway rng. `world.withUnitAt(q, unitId, leaderAt)` answers "what if this unit stood there".
  Neither is ever applied for real.
- **The engine enumerates almost every answer.** `move.path`, `deploy.path`, `charge.path` and `ability.target`
  list their end spots and points as options, so policies score `ctx.legal` and return one of them. Only
  `move.place` (PLACE abilities, summons) is a parameterised template (`PARAMETERISED` in `random.ts`; the answer adds
  `leaderId` and `dest`); it is checked with `ctx.accepts`: `apply(...).ok` on the main thread and in the bench,
  `world.shimAccepts` in the worker. The host re-validates every answer.
- View gaps: the view has no `passed`, `firstPasser` or `reactionsUsed`. The AI tracks its own Passes in
  `memory.passed`, and it infers an opponent Pass from activation markers: if the opponent's markers did not change
  between two of our `turn.activate` decisions in one Phase, the opponent passed.

## 2. Tiers (`TIERS` in types.ts)
| Tier | What it is | Key parameters |
|---|---|---|
| `random` | Seeded uniform pick over legal answers. It prefers any action over `turn.pass` and completes `move.place` by a seeded search. This is the bench baseline: do not make it smarter. | none |
| `easy` | Utility AI with noise and short sight: no threat lookahead, no Pass timing, greedy deployment (dearest unit that fits), takes the first ability or Reaction that adds value. | noise 0.2, wThreat 0, wCover 0.3, wKill 1, wObjective 2, wTempo 0, moveSamples 16 |
| `normal` | Full utility AI: threat map, cover, objective control by Supply, focus fire, knapsack deployment, Pass timing, ability and card use by value. | noise 0, wThreat 0.6, wCover 1, wKill 2, wObjective 4, wTempo 0.5, moveSamples 40 |

You can tune without code changes: `AI_TUNE="normal.wThreat=0.8,easy.noise=0.3"` (the bench applies it).

## 3. Policies by decision kind (`POLICIES` in policies.ts)
`createAiDecider(tier, opts)` looks up `POLICIES[pending.kind]`, then `POLICIES['<namespace>.*']`. A policy returns
an `Action` from `ctx.legal` (or a completed `move.place`) or `null` for "no opinion". With `null`, the random
policy answers and no fallback is counted. An answer that is not a legal template or fails `accepts`, or a policy
that throws, is a **fallback**: the random policy answers, and the fallback is counted per kind in
`memory.stats.byKind`.

| Kind | Policy | Decides |
|---|---|---|
| `setup.colour`, `setup.draftControl` | `draftSetup` | Colour whose Entry Edge sits nearer more markers on the likely Deployment (`context.rows`). Draft control: the draft whose pool differs most for our army. |
| `setup.ban`, `setup.pick` | `draftCard` | Ban the worst card for our list and pick the best. A fixed per-card score from Start Supply and Escalation against our cheapest units, Round count, markers near our edge and the special-win lead. |
| `setup.terrain` | `terrainPick` | The map with the most cover between our entry and the markers. |
| `setup.firstPlayer` | `firstPlayer` | Keep the marker unless our list wants to react: give it away when our cheapest useful unit exceeds the Round 1 Pool or the opponent's army is faster. |
| `turn.first` | `firstActivator` | Go first when a kill, a bracket drop or a marker grab is on offer now. Otherwise make the opponent commit. |
| `turn.activate`, `turn.choose` | `activationMenu` | Which unit, which menu action (`deploy.go`, `move.go`/run/`move.disengage`, `shoot.go`, `charge.go`, `melee.go`, `mission.*`, `ability.action`, `turn.hold`), or `turn.pass` (section 4). |
| `turn.order`, `score.order` | `orderEffects` | Order our own simultaneous effects: buffs before attacks, removals before control. |
| `deploy.drop` | `deployDrop` | The reserve unit with the best `deployValue` that fits, else skip. |
| `deploy.entry`, `deploy.path` | `deployEntry`, `deployPath` | Where to arrive (section 5). |
| `move.path`, `move.place` | `movePath`, `movePlace` | Destination (section 6). For `move.place`, `moves.placeGoal` then `random.completePlace`. |
| `shoot.batch`, `shoot.template` | `shootBatch`, `shootTemplate` | Weapon and target, or done; template spot (section 7.2). |
| `charge.targets`, `charge.path`, `charge.impact` | `chargeTargets`, `chargePath`, `chargeImpact` | Section 7.3. |
| `melee.closeRanks`, `melee.split` | `meleeCloseRanks`, `meleeSplit` | Section 7.3. |
| `atk.reroll`, `atk.precision`, `atk.tough` | `diceChoice` | Spend a re-roll or keyword where it changes kill odds or a bracket most. |
| `atk.casualty` | `casualty` | Section 7.4. |
| `ability.window`, `ability.target`, `ability.pay`, `ability.react` | `abilityWindow`, `abilityTarget`, `abilityPay`, `abilityReact` | Section 7.5. |
| `mission.claim`, `mission.choose` (`mission.*`) | `missionAction` | Claims by VP value; decline when nothing adds VP. |
| `turn.over` | none | Single option. |

## 4. Activation and Pass (`turn.activate`)
- Candidates are the menu options. `eval.activationValue(unit, actionType)` = the best plan value this activation
  plus urgency:
  - **+** a threatened unit that can act before the enemy reaches it;
  - **+** an Engaged unit whose best answer is to Disengage now;
  - **+** a unit that can take or flip a marker now;
  - **-** a unit far from everything (it can wait and reveal less).
- **Phase 1, Movement.** Deploy first when the deploy plan (section 5) is not empty and an entry is safe. Then move
  units to the markers. Hold only when every other action scores below 0.
- **Phase 2, Assault.** Shoot with the best `attackValue` first (kill or bracket drop), then charge where
  `chargeValue` beats shooting.
- **Phase 3, Combat.** Activate every Engaged unit; the best split first.
- **Pass timing (`wTempo`).** In Phases 1 and 2, the first player to Pass takes the First Player Marker for the next
  Phase (spec 11 s3). `eval.passValue` = `wTempo` x what choosing the first activator is worth next Phase (a unit of
  ours that kills or grabs a marker before the enemy can answer, from the threat map), minus the best activation
  left. Normal passes early only when this is above 0 and the opponent has not passed yet. A Pass in Phase 3 never
  moves the marker.
- `memory.plan` keeps the chosen unit and its intended steps (e.g. move then shoot) across the activation's follow-up
  decisions. It is re-planned when the unit, Round or Phase changes.

## 5. Deployment and Supply (`deploy.go`, `deploy.drop`, `deploy.entry`, `deploy.path`)
- Every unit starts in Reserves, and the Pool grows each Round (`supplyStatus`, `poolTable`). Each Movement Phase is
  a knapsack (`moves.deployPlan`). Choose reserve units from `supplyStatus.canArriveNow` whose total Supply fits
  `available`, and maximise `eval.deployValue` = cost x (objective reach this Round + attack reach next Phase) minus
  exposure at the entry. Easy uses greedy: the dearest unit that fits.
- Final Round: the Pool is unlimited and units left in Reserves count as destroyed (SUP-064), so every tier deploys
  all it can.
- The plan (`memory.deployPlan`) is recomputed every decision, because casualties raise Available Supply.
- **Entry (`deploy.entry`):** the segment nearest the best marker that stays out of the enemy Zone of Influence and
  enemy reach. Alternate entries (drops, PLACE from Reserves) are scored the same way.
- **Spot (`deploy.path`):** the offered end spot with the best `positionValue`.

## 6. Move destinations (`moves.ts`)
- `moves.scorePaths` scores each offered end spot with `eval.positionValue` on `withUnitAt` shims. Large option lists
  are pre-scored by distance to the goal, and the best `moveSamples` get the full score.
- `positionValue(unit, at)` sums:
  - the best attack value from there next Phase;
  - `wObjective` x objective value: the Supply we add to a contest we win or flip, from `objectiveStatus` on the shim.
    Flying, BURROWED and Out-of-Coherency units do not count (SUP-051);
  - `wCover` x cover against the threats that reach the spot;
  - minus `wThreat` x `threatAt(...).expSupply`;
  - `wSurvival` for damaged units near a bracket.
- Coherency is an AI problem (KB 9.3). Prefer answers whose `coherencyPreview` keeps every model In Coherency, and
  never string a squad out so that one casualty strands others; an Out-of-Coherency unit cannot contest.
- Disengage is scored with the Tactical Mass outcome. Without Tactical Mass, the unit cannot shoot or charge this
  Round (`unit.noShootChargeRound`).
- A unit with no useful answer goes into `memory.stuck` for the Round and stops being chosen to move.

## 7. Attacks, casualties and abilities (`eval.ts`)
### 7.1 Attack value
`attackValue(attacker, weapon, target)` combines these `attackPreview` numbers:
- `expectedSupplyRemoved`, worth 1 VP per Supply (every mission scores enemy Supply destroyed, SUP-060);
- plus `wKill` x `killChance` x unit cost;
- plus a share of `expectedDamage` toward the next model;
- plus a control term when the removal flips a marker contest.

The preview already includes the Surge tag match, cover, LONG RANGE and carry-over damage.
### 7.2 Shooting (`shoot.batch`, `shoot.template`)
Score every (weapon, target) option with `attackValue`. Focus fire: add a bonus for a target already carrying damage
or one model from a bracket drop. Answer `done` only when no row scores above 0. Templates: the offered spot with the
best summed value; friendly models under it count as negative value.
### 7.3 Charge and melee
- **`charge.targets`:** `chargeValue` = `chargeOdds.chance` x (close combat value after IMPACT) minus the failed-charge
  exposure. Never declare a target set with chance 0. Prefer charges that also contest a marker.
- **`charge.path`:** the offered end that engages the most value with the least exposure, keeping coherency. Never
  give up a reachable charge.
- **`charge.impact`:** aim the dice where they finish a unit or drop a bracket, else split evenly.
- **`melee.closeRanks`:** bring the most models into the Fighting Rank.
- **`melee.split`:** send attackers to the unit they can finish first.
### 7.4 Casualties (`atk.casualty`)
Among the offered models, remove the one with the least `casualtyCost`:
- avoid a Supply bracket drop when one is avoidable;
- keep the Shield model, weapon specialists and the leading model;
- keep coherency: never pull a middle model out of a line;
- keep engagement and marker contests (models within 3" of a marker we hold).
### 7.5 Abilities, resources and cards
- **Actives (`ability.window`, `ability.action` in the menu).** Use one when its value gain beats its cost. Value
  gain = the `query` preview with the effect minus without, or the marker or VP change for non-attack effects. Cost
  is the resource spent (CP for Terran, BM for Zerg, PE for Protoss) plus the abilities a card loses while
  Exhausted.
- **Reactions (`ability.react`).** One per activation per player, so normal takes a Reaction only when it beats the
  best expected Reaction later this Phase. Easy takes the first one that adds value.
- **Payment (`ability.pay`).** Pay with the card whose own abilities we need least this Round.
- **Targets (`ability.target`).** The offered unit or point with the best value, e.g. a summon point near a marker and
  out of enemy reach.

## 8. Evaluation summary (`eval.ts`, `threat.ts`)
- `Score = {value, parts}`, in Supply/VP units. The parts are `vp`, `damage`, `kill`, `supply`, `threat` (negative),
  `cover`, `objective`, `survival`, `tempo` and `cost`. Only `value` decides; `parts` feeds the bench and an AI
  trace.
- `vpOutlook(seat)` gives VP now (`seats[seat].vp`), VP if Scoring ran now (`missionScore.vpIfScoredNow`) and a
  projection to the last Round (marker VP held x Rounds left + expected Supply destroyed).
- `stateValue` = our VP lead now and projected + Supply on objectives - Supply lost this Round - threat to our units.
- Special win: when a lead of the mission's margin (e.g. 8+ VP in Skirmish) is within reach, objective and kill
  weights rise. When the enemy is near it, threat weight rises.
- `threat.threatsFor(ctx)` is built once per decision and memoised on the shim. It holds each enemy unit's reach next
  Phase (`reachOf`: move or charge, plus its longest weapon range). `threatAt(unit, at)` gives the expected Supply the
  enemy removes, P(destroyed) and the attackers, from `attackPreview` on `withUnitAt` shims.

## 9. Determinism
- Randomness comes only from `ctx.rng` = `deriveSeed(seed, 'ai', round, pending.id, tier)`, and it is used for tie
  breaks and easy's noise. The same view, decision, legal list and seed always give the same answer. No `Math.random`,
  no `state.rng`, no wall clock in a score.
- The search cut-off is deterministic. `timeUp(ctx)` counts work units (about one `query.*` call each) against
  `work.cap = budget x WORK_PER_MS`. The wall clock (4x budget) is only a hard safety stop, and the bench reports
  when it fires.

## 10. Time budget
- `AI_MS` (node) or `VITE_AI_MS` (browser), default **150 ms** per decision (`aiBudgetMs()`). Targets: mean under
  50 ms, max under the budget.
- Expensive searches (threat, moves) tick `timeUp` and return the best so far.
- The client worker answer times out after `AI_WORKER_TIMEOUT_MS` = 3 s, and then the main-thread decider answers.
- The bot driver waits for idle presentation and loaded figures, with its 5 s watchdog (KB 9.3).

## 11. Worker and client wiring (`worker.ts`, `src/client/bot/`)
- `src/ai/worker.ts`: request `{type:'decide', id, view, pending, legal, tier, seed, memoryKey, budgetMs?}`, response
  `{type:'action', id, action, ms, fallback}` or `{type:'error', id, message}`.
- `handleRequest(req, bundle)` is the pure core for node tests. In the worker, `accepts` = `shimAccepts(view)`.
- The client (`aiWorkerClient.createAiBrain`, installed through `botDriver.setTierBrains`) re-checks parameterised
  answers on the real state and falls back to the main-thread decider on error or timeout.
- Every bot seat plays the launch tier; `?tier=` overrides it.

## 12. Benchmark (`npm run bench:ai`) and gates
`tsx tools/ai-bench.ts --games N --seed s --a normal --b random --matchups founders,terran-mirror`.

**How games are set up**
- Game g plays `matchups[floor(g/2) % k]` with seed `${seed}-${floor(g/2)}`.
- Tier A sits in seat 0 on even g and seat 1 on odd g, so each pair plays the same game from both sides.
- Mission and Deployment are fixed: Frontlines (Skirmish) on Abandoned Camp, with `--mission` and `--deployment` to
  change them.
- Matchups:
  - `founders`: `terran-founders` vs `zerg-founders`;
  - `terran-mirror`: `terran-starter` vs itself;
  - also available: `zerg-mirror`, `protoss-mirror`, `tz`, `tp`, `zp`.

**Output**
- One JSON line: `{games, a, b, winsA, winsB, draws, unfinished, winRateA, msPerDecision, maxMs, errors, fallbacks,
  policyErrors, byMatchup, slowKinds}`.
- Draws are non-wins.
- `msPerDecision` and `maxMs` are tier A's.
- `errors` counts rejected answers, throws and stalls at the 2000-decision cap; any error exits 1.

**Gates (M4, verify loops ON)**
- normal beats random in **>= 95%** of 100 games, with **each** of `founders` and `terran-mirror` at or above 95%;
- easy beats random in **>= 75%** of 100 games over the same set;
- errors 0, unfinished 0, policyErrors 0;
- fallbacks under 1% of decisions;
- mean ms per decision under 50 at `AI_MS=150`, and max under 150.

**Three verify lenses (KB 9.3)**
1. Legality and robustness.
2. Hidden information and the contract: view only, no `state.rng`, `deriveSeed`, no rules re-derived in `src/ai`.
3. Strength and behaviour. Look for: walking into open fire, ignoring a kill or bracket drop, idle Supply left in
   Reserves, wasted Passes, Flying or BURROWED units sent to contest markers they cannot hold, strung-out squads, and
   0-chance charges.

## 13. Files, owners and exports
| File | Owner | Exports |
|---|---|---|
| `types.ts` | frozen | `Tier`, `TIER_IDS`, `DECISION_KINDS`, `DecisionKind`, `TierParams`, `TIERS`, `applyTuning`, `Score`, `ScorePart`, `Scored`, `AiStats`, `KindStats`, `AiMemory`, `newMemory`, `AiOpts`, `WorkMeter`, `AiContext`, `Policy`, `PolicyTable`, `ThreatReport`, `ThreatReach`, `ThreatMap`, `MoveCandidate`, `VpOutlook`, `aiBudgetMs`, `AI_WORKER_TIMEOUT_MS`, `WORK_PER_MS`, `timeUp` |
| `decider.ts` | frozen | `createAiDecider`, `AiDecider`, `AiDecision`, `makeContext`, `answerOk`, `policyFor`, `rngFor`, `POLICIES` (re-export) |
| `world.ts` | frozen | `queryState`, `withUnitAt`, `baseOf`, `shimAccepts`, `isLegalShape`, `namespaceOfKind`, `dist`, `liveModel`, `modelsOf`, `leaderOf`, `unitsOf`, `enemyUnitsOf`, `opponentOf`, `endOf` |
| `random.ts` | frozen | `PARAMETERISED`, `PASSIVE`, `randomPolicy`, `completeRandom`, `completePlace` |
| `eval.ts` | E | `ZERO`, `combine`, `tierWeights`, `unitCost`, `attackValue`, `bestAttack`, `chargeValue`, `objectiveValue`, `coverValue`, `positionValue`, `activationValue`, `passValue`, `casualtyCost`, `deployValue`, `vpOutlook`, `stateValue` |
| `threat.ts` | E | `NO_THREAT`, `threatsFor`, `enemyReach`, `threatAt`, `threatenedBy` |
| `moves.ts` | M | `scorePaths`, `bestMove`, `bestEntry`, `bestDeploySpot`, `bestChargeEnd`, `placeGoal`, `deployPlan` |
| `policies.ts` | M | `pickBest`, `pickOnly`, the policies of section 3, `POLICIES`, `runPolicy` |
| `worker.ts` | frozen (W wires the client) | `WorkerRequest`, `WorkerResponse`, `handleRequest`, `resetWorkerDeciders` |
| `tools/ai-bench.ts` | frozen | `BENCH_MATCHUPS` |
