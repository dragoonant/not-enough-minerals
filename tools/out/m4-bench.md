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
