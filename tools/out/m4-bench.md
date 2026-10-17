# M4 AI bench (final gate, 2026-10-13)

Tool: `tools/ai-bench.ts` (`npm run bench:ai`). Mission `frontlines-skirmish`, Deployment `abandoned-camp` (fixed so
runs compare), seats alternated per game pair, draws count as non-wins. Default budget `AI_MS` 150 ms (work cap 225).
The four runs below ran at the same time on one PC, so the wall-clock figures are pessimistic.

## Gate: bot beats random in at least 95% of games

| Run | Seed | Matchups | Games | A wins | B wins | Draws | A win rate | ms/decision | max ms |
|---|---|---|---|---|---|---|---|---|---|
| normal vs random | m4 | founders, terran-mirror | 100 | 99 | 1 | 0 | **0.99** | 31.9 | 631 |
| easy vs random | m4 | founders, terran-mirror | 100 | 97 | 2 | 1 | **0.97** | 31.7 | 644 |
| normal vs easy | m4 | founders, terran-mirror | 40 | 37 | 3 | 0 | 0.925 | 27.5 | 313 |
| normal vs random (all matchups) | m4x | 7 matchups, 6 games each | 42 | 42 | 0 | 0 | 1.00 | 23.3 | 536 |

Every run: 0 errors, 0 fallbacks, 0 policyErrors, 0 hardStops, 0 unfinished. The replay check (first 4 games played
twice) gave identical answers in each gate run.

### Per matchup

| Run | founders | terran-mirror |
|---|---|---|
| normal vs random | 49-1-0 | 50-0-0 |
| easy vs random | 48-2-0 | 49-0-1 |
| normal vs easy | 19-1-0 | 18-2-0 |

All-matchup run (normal vs random, W-L-D): zerg-mirror 6-0-0, protoss-mirror 6-0-0, tz 6-0-0, tp 6-0-0, zp 6-0-0,
founders 6-0-0, terran-mirror 6-0-0.

### Time per decision kind (normal vs random, m4)

| Kind | n | mean ms | max ms |
|---|---|---|---|
| move.path | 2518 | 75.6 | 631 |
| turn.activate | 4250 | 56.1 | 451 |
| charge.path | 35 | 44.9 | 135 |
| charge.targets | 41 | 30.8 | 124 |
| ability.window | 4217 | 1.4 | 111 |

Spec 30 gate is a mean under 50 ms per decision; met in every run. The work cap, not the clock, ends a decision, so
answers stay deterministic under load. The browser runs the AI in a Web Worker (3 s timeout).

## History
- Round 1 (seed r1): normal beat random 60/60, easy 39/40 (one draw), normal beat easy 13/20; 22.7 ms/decision.
- Fix round (seed s, 15 review findings applied): normal 100/100, easy 95/100 vs random.
- Final (this file, seed m4): normal 0.99, easy 0.97 vs random; normal beat easy 0.925.

## Known weaknesses
- Tail latency: `move.path` and `turn.activate` reach 450 to 650 ms on the slowest decisions under load, several
  times the 150 ms budget. The mean holds, but a slow phone may show a visible pause.
- The bench uses one Mission and one Deployment. The other 11 Missions and 11 Deployments only get coverage from
  `npm run sim`, which runs random bots, so objective play on those cards has no AI measurement.
- Easy vs normal is a clear gap (0.925), but easy still beats random 97%. There is no tier that is harder than normal,
  and no human-strength measure yet; the owner playtest gate is still open.
- Losses and draws against random cluster in founders (Terran vs Zerg). The losing games have not been audited
  game by game.
- Random is a weak baseline: it rarely punishes a bad position, so these rates say little about how the bot does
  against a careful player. In the bench, charge decisions are rare (35 `charge.path` vs 2518 `move.path`), so
  charge choice gets little testing.

## Follow-up (2026-10-16): tail latency, mission coverage, passivity fix

Bench changes (`tools/ai-bench.ts`): `--rotate` (every Mission x Deployment pairing; `--scale skirmish|all`, default skirmish),
`--matchups all` (13 army pairings of the client MATCHUPS), `--offset N` (run shards of one long run in parallel), per-mission
and per-matchup tables, `nonWins` with seeds, `--trace` (board, answers and the top move candidates), `--slow MS`, a frozen
decider clock by default (a decision ends on the work cap alone, so loaded machines do not change answers; `--wall` restores the
real clock and its hard stop), `E_TODO` rejections and decisions that never advance are counted as `engineBlocked`, not bot errors.

What the audit found. Against random the old bot drew (0-0, 1-1) instead of winning in 5 to 10 percent of rotated games, mostly in
Gather the Resources, Artefact Hunt and mirrors, and in founders (e.g. seed r0-91, gather-the-resources-skirmish/agria-valley, 0-0).
Cause: it dithered around markers the Mission never pays for and had almost no pull towards the enemy, so nothing was ever shot.
Fixes (all in `src/ai`): marker pull now scales with what the Mission Card pays for that marker's side (`markerWorth`), the enemy
pull is 0.25/inch ramping up to 2x by the last Round, and `turn.activate` prices attacks, charges and deploys first and gives a full
position search to only the 4 units closest to an enemy for Move/Run (before, the first units listed spent the whole cap and shots
were never seen: shoot.go picks 2x, charge.go picks 2.4x). The preview cost model and chargeOdds cost were re-fitted to measured times
and move.path / turn.activate / charge.* / deploy.path / shoot.batch run at 65% of the cap; bestAttack looks at the 3 nearest enemies
and threatAt at the 4 nearest. Charge was not undervalued once an enemy is in reach (it wins whenever chance >= 0.34 and value > 0);
it was rare because units never got close. Melee-only pull and a 0.2 chance bar were tried and changed nothing.

| Run | Games | A wins | Notes |
|---|---|---|---|
| normal vs random, rotated skirmish cards, founders/terran-mirror/zerg-mirror/tz | 240 | 239 (0.996) | every Mission 39-40 of 40 |
| normal vs easy, same set | 240 | 201 (0.838), 30 losses, 9 draws | |
| normal vs random, founders only, rotated | 240 | 240 (1.00) | no non-wins |
| normal vs random, fixed cards (old gate), founders/terran-mirror | 100 | 100 (1.00) | replay check passed |
| normal vs easy, fixed cards | 80 | 76 (0.95) | |
| normal vs easy, all 12 Missions, 7 non-expanded matchups | 168 | 138 (0.821) | |
| normal vs random, all 12 Missions, 13 matchups | 312 | 0.967 of decided | 36 engine-blocked, 5 engine `ability.pay` errors |

Timing (one process, real clock, `--wall`, 40 games over all Missions): mean 8.4 ms per decision, max 171 ms (move.path mean 20.5 /
max 171; turn.activate mean 15.4 / max 166), 0 hard stops, 0 fallbacks, replay identical. Sharded runs on this shared machine show
maxima of 300 to 500 ms because shards and other jobs compete for the CPU; the work cap, not the clock, ends decisions.
Before: mean 17 to 30 ms and max 230 to 330 ms in the same quiet conditions (450 to 650 under load).

Known weaknesses now: easy still wins 16 percent of rotated games and draws 4 percent; remaining slow decisions are zerg-mirror
swarms (about 1.4 ms per work unit against 0.5 nominal). See `tools/out/ai-followups.md`.
