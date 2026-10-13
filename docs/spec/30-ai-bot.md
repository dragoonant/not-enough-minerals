# 30: Versus bot (our AI)

No official solo mode was found for StarCraft TMG, so this bot is the only opponent: **the AI is the product**.
It is a utility AI adapted from the base project's (Fell-in spec 30, itself from the WHI bot): for each open
decision it builds candidate answers, scores them with numbers the engine computes, and picks the best. Order of
work: the random bot (exists at M0, playable at M3), then the normal tier (M4), then easy as a parameter set of
normal.

Interfaces in `src/ai/types.ts` and `src/ai/decider.ts` are FROZEN at M4. Policy bodies (`policies.ts`), scoring
(`eval.ts`), the threat map (`threat.ts`), move search (`moves.ts`) and deployment planning (`deploy.ts`) are owned
by the M4 build agents.

## 1. Inputs and the rules boundary
- A decider receives only `view(state, seat)`, the open `PendingDecision` and `legalActions` (spec 00 s5, s8). It
  never sees the raw state and never touches `state.rng`.
- The AI never re-derives a rule. Every number comes from `query.*` (`attackPreview`, `chargeOdds`, `supplyStatus`,
  `objectiveStatus`, `canSee`, `coverFor`, `reachOf`, `coherencyPreview`) and from `pending.context` rows.
- `src/ai/world.ts` builds a query shim from the view (`queryState`): public state, a fake rng, and the activation
  named in `pending.context`. The shim is read by `query.*` and the dry run only; it is never applied for real.
- Parameterised answers (`move.path`, `deploy.path`, `charge.path`, `shoot.template`, `melee.closeRanks`) are
  checked with `ctx.accepts(action)`: the host's dry run (`apply(...).ok`) on the main thread and in the bench,
  `shimAccepts` in the worker. The host re-validates every answer and falls back (section 8).

## 2. Tiers
| Tier | What it is | Key parameters (`TIERS`) |
|---|---|---|
| `random` | Uniform over legal answers, but favours an action over Pass while it has eligible units, fills paths by bisection on `accepts`, never deploys a unit that cannot fit. | none |
| `easy` | The utility AI with noise and short sight: no threat lookahead, greedy targets, first acceptable move, ignores initiative tempo, deploys the most expensive unit that fits. | noise 0.2, wThreat 0, wCover 0.3, wTempo 0, moveSamples 16 |
| `normal` | Full utility AI: threat map, cover and visibility, objective control by Supply, focus fire, deployment budget, Pass timing, ability and card use. | noise 0, wThreat 0.6, wCover 1, wTempo 0.5, moveSamples 40 |

Tuning without code changes: `AI_TUNE="normal.wThreat=0.8,easy.noise=0.3"`.

## 3. Decision kinds and policies
`createAiDecider(tier, opts)` dispatches on `pending.kind` to `POLICIES[kind]`. A policy returns an `Action` or
`null` ("no opinion": use the random policy). New kinds without a policy fall back to random and the bench reports
fallbacks per kind.

| Kind | Policy | What it decides |
|---|---|---|
| `setup.colour`, `setup.draftControl` | `draftSetup` | Colour by which Entry Edge sits nearer more markers on the likely Deployment; take the draft whose card pool differs most for our army. |
| `setup.ban`, `setup.pick` | `draftCard` | Ban the cards worst for our army and pick the best, by a fixed per-card score: Game Length, Starting Supply and Escalation against our list's Supply curve, marker count near our edge. |
| `setup.terrain`, `setup.firstPlayer` | `pickOnly` / `firstPlayer` | Give the First Player Marker to the opponent when we have more reserve Supply than Round 1 Pool (react second), else keep it. |
| `turn.first` | `firstActivator` | Go first when a kill or a marker grab is on offer now; else make the opponent commit. |
| `turn.activate` | `activationMenu` | Which unit and which action, or Pass (sections 4-6). |
| `turn.order`, `score.order` | `orderEffects` | Order own simultaneous effects: buffs before attacks, removals before control. |
| `move.path`, `move.place` | `movePath` | Destination and formation (section 6). |
| `deploy.entry`, `deploy.path` | `deployPlan` | Where to arrive (section 5). |
| `shoot.batch`, `shoot.template` | `pickBatch` | Weapon profile, target and template spot (section 7). |
| `charge.targets`, `charge.path` | `chargePlan` | Charge targets and end spots (section 7). |
| `melee.closeRanks`, `melee.split` | `meleePlan` | Close Ranks into base contact; split attackers to finish units. |
| `atk.reroll`, `atk.precision`, `atk.tough` | `diceChoice` | Spend the re-roll or keyword where it changes kill odds most. |
| `atk.casualty` | `casualty` | Which model to remove (section 7.4). |
| `ability.window`, `ability.target`, `ability.pay`, `ability.react` | `abilities` | Section 7.5. |
| `mission.*` | `missionAction` | Mission actions (Gather, CLAIM) by their VP value. |

## 4. Activation choice and Pass (`turn.activate`)
- Each candidate (unit x action) gets `activationValue` = the best plan value this activation plus urgency:
  +urgency when the unit is threatened now and could act first, +urgency for an Engaged unit whose best answer is
  Disengage before the enemy acts, -value for units far from everything (they can wait and reveal less).
- **Pass timing** (`wTempo`): the first player to Pass in Phases 1 and 2 takes the First Player Marker for the next
  Phase (spec 11 s3). Pass value = `wTempo` x the value of choosing who activates first next Phase (from the
  threat map: do we have a unit that kills or grabs a marker before the enemy can answer?) minus the value of the
  best remaining activation. Normal Passes early only when that difference is positive. Phase 3 Pass never moves
  the marker; there the policy activates every Engaged unit.
- Hold is chosen when every other action of a unit scores below 0 (it gives nothing, but it spends the turn).

## 5. Deployment and Supply (`deploy.go`, `deploy.entry`, `deploy.path`)
- Every unit starts in Reserves; the Pool grows each Round (`supplyStatus`). Each Movement Phase is a knapsack:
  choose the reserve units whose Supply fits Available Supply and maximise `deployValue` = unit cost x
  (objective reach this Round + attack reach next Phase) - exposure at the entry spot. In the final Round the Pool
  is unlimited and units still in Reserves are lost as Supply (spec 15 s7), so normal deploys everything it can.
- Keep a reserve for a Supply bracket when a deployed unit is about to drop a bracket (Available rises after
  casualties): the plan is recomputed every decision.
- Entry: the segment and arrival spot nearest the best marker that avoids the enemy Zone of Influence and enemy
  reach. Alternate entries (indicator drops, friendly edges, PLACE from Reserves) are candidates scored the same way.

## 6. Move destination search (`moves.ts`)
- Candidates: fan out from the Leading Model at its allowance along bearings to each enemy unit, each marker and
  each cover piece, at several radii (`moveSamples` total), plus the current spot. Each candidate is pulled back to
  its farthest accepted point by bisection on `ctx.accepts`.
- `positionValue(spot)` = best attack value from there next Phase + `wCover` x cover against the nearest threats -
  `wThreat` x threat at the spot + objective value (Supply we add to a contest we can win or flip) + survival for
  damaged units.
- Formation: ask `coherencyPreview` and prefer formations that keep every model In Coherency and within 3" of the
  marker it is contesting. Coherency is an AI problem (KB 9.3): never string a squad out so that one casualty
  strands others.
- Disengage is scored with the Tactical Mass check from `query` (without it the unit loses its shooting and
  charging this Round).

## 7. Attacks, casualties and abilities
### 7.1 Attack value
`attackValue(attacker, target)` = `expectedSupplyRemoved x vpPerSupply` + `wKill x killOdds x unitCost(target)` +
`expectedDamage / remainingHp x unitCost(target) x 0.5` + a control term when removing models flips a marker.
All of it comes from `attackPreview`; Surge tag matches and carry-over on the target's marker are already inside.
### 7.2 Batches and targets
Score every (weapon profile, target) row of `shoot.batch` with `attackValue`; focus fire: a bonus for targets
already carrying damage. Templates: try the spots `query` offers and keep the one with the best summed value.
### 7.3 Charge and melee
Charge when `chargeOdds.p x meleeValue` beats shooting and the end spot's exposure is acceptable. Close Ranks puts
models in base contact; `melee.split` sends attackers to the unit they can finish first.
### 7.4 Casualties (`atk.casualty`)
Among the options the engine offers, remove the model whose loss costs least: no Supply bracket drop if one is
avoidable, keep Shield models and weapon specialists, keep coherency (never pull a middle model out of a line),
keep engagement and marker contests.
### 7.5 Abilities and cards
Use an Active when `query` shows a value gain (the preview with the buff minus without) above its cost in spent
card resources (a card's own abilities are lost while it is Exhausted). Reactions: one per activation per player,
so take one only when its value beats the best expected reaction later this Phase. Easy takes the first reaction
that adds value.

## 8. Determinism, fallback and safety
- Randomness: `rng = deriveSeed(seed, pending.id, tier)`, for tie breaks and easy's noise only. The same view,
  pending, legal list and seed always give the same answer.
- Every answer must match a legal template (`matchesOption`) and, if parameterised, pass `ctx.accepts`. Otherwise
  the decider answers with the random policy and counts a fallback. A throwing policy is caught and counted.
- `AiMemory` keeps per-seat state across decisions (deployment plan, activation plan, stuck units, stats).

## 9. Scoring summary and threat map
`Score = {value, parts}` in unit-cost units: `damage`, `kill`, `supply`, `threat` (negative), `cover`,
`objective`, `survival`, `tempo`. Only `value` decides; `parts` feeds the bench and the AI trace panel.
`threat.ts` builds, once per decision, each enemy unit's reach next Phase (`reachOf`: move or charge plus weapon
range) and the expected Supply it could remove at a point (`attackPreview` in the shim).

## 10. Time budget
`AI_MS` (node) or `VITE_AI_MS` (browser); the skeleton default is 1500 ms. Target: mean under 150 ms, max under the
budget. Move search and threat queries check `timeUp(ctx)` and return the best so far. The client bot driver keeps
its own watchdog and waits until figures have loaded (KB 9.3).

## 11. Worker and client wiring
`src/ai/worker.ts`: request `{type:'decide', id, view, pending, legal, tier, seed, memoryKey}` -> `{type:'action',
id, action, ms, fallback}` or `{type:'error', id, message}`. `handleRequest(req, bundle)` is the pure core for node
tests. The client installs it with `setBotBrain` (`botDriver.ts`), with a main-thread fallback.

## 12. Benchmark (`npm run bench:ai`) and gates
`tsx tools/ai-bench.ts --games N --seed s --a normal --b random --scenarios mirror,founders`. Game g plays
`scenarios[g % k]`, tier A in seat 0 on even g and seat 1 on odd g (so each side of a matchup and each colour is
played). One JSON line out: `{games, winsA, winsB, draws, winRateA, msPerDecision, maxMs, errors, fallbacks,
unfinished}`. Draws count as non-wins.
- `mirror`: a fixed mission and deployment (First Battle: Frontlines on Abandoned Camp, spec 17 s9) with the same
  Founders army on both sides (the Terran list of spec 17 s9 against itself).
- `founders`: the Founders Edition Terran vs Zerg lists of spec 17 s9 on the same mission and deployment.
- After Protoss lands: `protoss` (Protoss faction starter vs each Founders list) joins the rotation.
Gates (M4, verify loops ON):
- normal beats random in at least 95% of 100 games over `mirror,founders`;
- easy beats random in at least 75% of 100 games over the same set;
- errors (unrecovered rejections, throws, stalls at the 2000-decision cap) are 0; unfinished games are 0;
- mean ms per decision under 150; max under the budget.
Three verify lenses (KB 9.3): legality and robustness; hidden-info and contract (view only, no `state.rng`,
`deriveSeed`); strength and behaviour (walking into open fire, ignoring a kill, idle Supply in Reserves, wasted
Passes, Flying units sent to contest markers they cannot hold).
