# 60: Testing

Lean by default: about 10 focused tests per stage, plus the invariants below once the real turn flow exists (M2).
Every rules test is named by its checklist ID from `12-rules-test-checklist.md`.

## 1. Layout and naming
| Path | Runner | Content |
|---|---|---|
| `tests/engine/*.test.ts` | vitest | rules, geometry and protocol by checklist ID; the golden test |
| `tests/data/*.test.ts` | vitest | (M1) schema, cross-checks against the card sheets and the Cost Table, `source` on every record |
| `tests/ai/*.test.ts` | vitest | (M4) policy legality, determinism, safety, preview math |
| `tests/client/*.test.ts` | vitest | contract-only imports, no native tooltips, no faction literals, view helpers |
| `src/**/*.test.ts` | vitest | the skeleton's co-located `ai.test.ts` and `data.test.ts` (kept; new tests go under `tests/`) |
| `tests/e2e/*.spec.ts` | Playwright | the production build served on `/not-enough-minerals/` |

Titles start with the ID: `it('ATK-050 Surge moves dice only on a tag match', ...)`. Rules prefixes come from specs
11-19 (RND, INIT, SUP, ACT, PH1-3, DEP, DIS, MOVE, COH, ENG, FLY, LOS, COV, ELEV, DICE, ATK, DMG, CC, CHG, TPL, ABL,
CARD, ST, KW, VIS, XPORT, CTL, VP, END, CLN, DRF, MSN, ZOI, BF, ARMY, ...). Infrastructure prefixes already in use:
`GEOM- LOS- RNG- SETUP- VIEW- DECIDER- APPLY- FLOW- DATA- AI- CLI- AUD-`. New ones: `GOLD-` (golden test), `INV-`
(invariants), `HOOK-` (hook wiring), `PREV-` (preview vs pipeline), `BENCH-`.

## 2. Golden test: the rulebook's first battle
No worked example exists in the Quick Start (all 10 pages searched, spec 17 s9), so the golden test is the Core
Rules Part 1 learn-to-play battle (R p.7-29): Frontlines on Abandoned Camp, Skirmish, with the Terran and Zerg lists
of spec 17 s9 (preset `first-battle`).
- File `tests/engine/golden-first-battle.test.ts`. The narrative skips moves and does not log every roll, so the
  test is a chain of checkpoints, not a full replay. Each checkpoint builds its position with a fixture helper
  (units placed as the text describes), feeds the printed dice through `state.debug.forcedDice` (spec 00 s7),
  submits the actions through `apply`, and asserts the printed result.
- Checkpoints (each `it('GOLD-nn ...')` cites its page):
  - GOLD-01 initiative Roll-Off 7 vs 5; the winner gives the First Player Marker away (R p.8).
  - GOLD-02 Round 1 Pool 3: a player with no unit that fits must Pass; the first Pass takes the marker (R p.11).
  - GOLD-03 a ranged Batch: hits, Armour Rolls at the printed TN, one Damage left over (R p.13).
  - GOLD-04 Evade eligibility and the Damage Pool sum on an Engaged target (R p.14).
  - GOLD-05 close combat with a carried-over Damage Marker (R p.15).
  - GOLD-06 end-of-round initiative Roll-Off 3 vs 1 and scoring with no control VP yet (R p.16).
  - GOLD-07 NON-LETHAL damage on the marker, then HEAL (R p.17, p.19); a Deploy limited by Available Supply (R p.18).
  - GOLD-08 carry-over removes a 5 HP model, leftover is discarded when no eligible model remains, Supply drops
    and the attacker gains 1 VP (R p.21).
  - GOLD-09 Surge: a D3 Surge of 2 against an Armoured target moves both hits past the Armour Roll (R p.21-22);
    damage reduction from an ability (R p.22).
  - GOLD-10 Charge roll and IMPACT hits split between units (R p.24).
  - GOLD-11 final Scoring: marker 5 contested 1 Supply vs 2, control VP, and 1 VP each for Supply lost (R p.29).
- Unit stats come from the card sheets and the Cost Table, never from the narrative. Where the narrative disagrees
  with current card data or CL/CT, the checkpoint asserts the current rules and the difference is logged as a
  RULING in `docs/needs-rules-check.md`.

## 3. Engine invariants (M2; checked in every sim game and in a fuzz test)
- INV-01 one open decision; `legalActions` non-empty; every member accepted by a dry-run `apply`.
- INV-02 reject, never throw: malformed and stale actions give a `Rejection` and the same state reference.
- INV-03 determinism: `(seed, action log)` replays to an identical final state; `state.debug` is never set.
- INV-04 view leak: no `rng`, `log` or `debug` in `view()`; deciders get only the view.
- INV-05 Phases run Movement, Assault, Combat, Scoring each Round; a unit activates at most once per Phase; a
  Phase ends only when both seats have Passed or have nothing eligible; turns alternate while both are in.
- INV-06 Supply: after every arrival, on-table Supply is at most the Pool (except the final Round); Supply is
  derived (no stored Pool); every bracket drop adds to `supplyLostThisRound` exactly once.
- INV-07 damage: a Damage Marker is never negative; after an Unengaged allocation no eligible model's HP fits the
  remainder; removals go only through `removeModels`.
- INV-08 geometry: no two bases overlap; no base overlaps impassable terrain or hangs off the table; Flying units are
  never Engaged; units in Reserves have no position.
- INV-09 control: Flying, BURROWED, Reserves and Out-of-Coherency units never count towards a contest.
- INV-10 abilities: at most one Reaction per player per activation; usage ledger respected (KB 9.3: zero-cost
  reactions loop forever otherwise).
- INV-11 VP never decrease; the game ends by Round L (`maxRounds`) or earlier on a special win; destroyed units
  never return unless a rule (RESPAWN, SUMMON) says so.
- INV-12 numbers come from state: the TN and dice count shown in `pending.context` equal what the roll resolves.

## 4. Headless sim (`npm run sim`)
`npm run sim -- --games 200 --seed s [--scenario id] [--cap 2000] [--check-every 1] [--stats]`. Random deciders on
both seats, the invariants of section 3, per-game **2000-decision stall cap** (a normal game is about 500), slow-step
threshold `SIM_STEP_MS`, JSON summary line, exit 1 on any error. A failing seed becomes a fixture test. Gates: M2
200 games 0 errors on `first-battle`; M3 adds the `mirror` and `founders` scenarios; step p95 under 5 ms.

## 5. Other engine and data checks
- HOOK-*: one test per hook point in HOOK_WIRING and per `{code}` hook, each proving it fires inside a real game
  (sim seed or fixture), not just in isolation. `validate:data` rejects unregistered hook names and triggers.
- PREV-*: Monte Carlo of `query.attackPreview` and `chargeOdds` against the real pipeline over 2000 seeds, within
  2 standard errors (KB 9.3).
- `npm run probe:deploy` (M2): every unit in the data deploys from every Entry Edge of every deployment card with 0
  trapped models, biggest bases first (KB 9.3).
- Data (M1): every record has a `source`; costs equal the 10.2026 Cost Table; the spec 15 s10 example army
  validates at the printed totals; the leak list sources never appear in `source`.

## 6. Bench (`npm run bench:ai`)
Gates in spec 30 s12: normal >= 95% vs random over `mirror,founders` (100 games, alternating seats), easy >= 75%,
0 errors, 0 unfinished.

## 7. Playwright
`playwright.config.ts` builds and previews on port 5202 (`PW_PORT` overrides) at `/not-enough-minerals/`; every
`page.goto` is relative (`./?test=1&seed=demo`). WebGL runs on SwiftShader, so 3D pages get time to settle; drags
use `page.mouse` with at least 10 steps.
- `home.spec.ts` (M0): start screen, fan notice, start button, table renders.
- `briefing.spec.ts` (M3): the briefing opens at game start, closes, reopens from `briefing-open`; the objective
  tracker, phase bar, Supply HUD and reserves tray are present with engine values.
- `play.spec.ts` (M3): `?test=1&seats=bot,bot&speed=instant&scenario=first-battle` plays to `game-over`; a human
  deploy from the reserves tray and a Pass via `pass-button` are accepted.
- Screenshots go to `screenshots/` for review only (not baselines).
