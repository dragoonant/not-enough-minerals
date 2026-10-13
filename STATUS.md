# Status: what exists

Milestone reached: **M2 rules engine** (generated snapshot, 2026-10-13; this file lists only what is real; plans live
in PLAN.md). Gate reports: `tools/out/m1-data-report.md` (M1), `tools/out/m2-followups.md` (M2 open items). The specs
under `docs/spec/` (00 architecture, 10-19 rules, 20-21 data, 30 AI, 50 client, 60 testing) are not listed here.

## Repo and tooling
- Vite 8 + React 19 + R3F 9 + drei + zustand 5, TypeScript 7 (strict), Vitest 5, Playwright. Pages base
  `/not-enough-minerals/`; chunks react / three / r3f / engine.
- `.github/workflows/deploy.yml`: typecheck, test, build, deploy on push to `main` (and manual dispatch).
- `.claude/launch.json`: `nem-dev` on port 5201. Playwright previews the build on port 5202 (`PW_PORT`).
- `tools/`: `sim.ts` (seeded random bots over real armies, rotating missions and deployments, a draft every 4th
  game; invariants, replay determinism, 2000-decision stall cap, per-namespace coverage that fails when `melee.go`,
  `atk.casualty` or `charge.succeeded` never happen), `sim-core.ts` (data loader for node tools), `ai-bench.ts`,
  `validate-data.ts`, `gen-music.ts`, `workflows/`, `out/` (reports).

## Engine (`src/engine/`, StarCraft rules, pure TS)
- Contracts: `types.ts`, `decider.ts`, `view.ts`, `rng.ts` (seeded sfc32, only `roll()` advances `state.rng`),
  `pending.ts` (one PendingDecision; `answeringId()` names the decision `apply()` is resolving).
- Foundations: `registry.ts` (action protocol, namespaces), `apply.ts` (validate, dispatch, log; bad input is a
  Rejection, unbuilt bodies give E_TODO), `errors.ts`, `dice.ts` (one dice service), `edition.ts` (every rules number
  from the data bundle or `rules.json`), `query.ts` (previews; fold-only hook calls), `hooks.ts` (HOOK_WIRING, one
  `runHook` per point), `effects.ts` (statuses, mods, durations, Supply overrides).
- Rules modules, each tagged with its checklist IDs: `setup` (set-up, terrain, draft, first-player Roll-Off),
  `turnflow` (rounds, initiative, activations, Pass, before/after windows), `army` (muster, costs, loadouts), `squads`
  (coherency, formation placer), `movement` (Move, Run, Disengage, Flying, elevation), `reserves` (Deploy, arrivals,
  transports), `engage`, `los`, `terrain`, `geometry`, `measure`, `visibility` (HIDDEN, BURROWED, detection),
  `shooting` (targets, Batches, templates), `attack` (Hit/Surge/Armour/Evade, keywords), `damage` (HP, Shields,
  casualties, Supply drops), `charge` (Charge and IMPACT), `melee` (Close Combat, Close Ranks), `supply`, `control`
  (marker control), `missions`, `scoring` (VP, End of Round, Cleanup, game end), `abilities` + `code-hooks` (unit
  abilities, Reactions, faction and tactical cards, the 20 `{"code": ...}` hooks).
- Rules decisions: `docs/needs-rules-check.md` (142 RULING lines; the M2 engine set is appended under its own heading).

## Data (`src/data/`, `data/`; schema FROZEN)
- Schema `docs/spec/20-data-schema.md` (types `src/data/types.ts`), entry guide `docs/spec/21-data-entry-guide.md`.
  `npm run validate:data`: ok, 15 warnings (CT rows with no card, by design).
- Edition `sc-2026-10`: 31 units (Terran 8, Zerg 13, Protoss 10; 4 summoned), 64 upgrades, 112 abilities, 53 weapons,
  42 cards, Cost Table and Changelog 10.2026, 12 Mission Cards, 12 Deployment Cards, 6 presets, 39 keywords,
  `rules.json`. Open data misfits (missing `rules.json` keys, creep grant shape) are listed in the M2 follow-ups.

## AI (`src/ai/`)
- Tier decider with an empty POLICIES table; every tier plays random (M4).

## Client (`src/client/`)
- Start screen with the fan notice -> game screen: placeholder mat and terrain, procedural figures, HUD with the
  generic option prompt, dice tray, Web Audio. `store/gameStore.ts` is the only apply caller. Test hooks `?test=1`,
  `?seats=`, `?seed=`, `?tier=`, `?speed=`, `?fps`. No rules-specific UI yet (M3).

## Verification (2026-10-13)
- `npm run typecheck`: clean. `npm test`: 330 tests in 31 files, all pass; each `it()` is named by a checklist ID
  from `docs/spec/12-rules-test-checklist.md` (largest groups SUP, ATK, VIS, MOVE, DEP, DICE, ABL, MSN, GOLD, DMG)
  plus HOOK-000..100 (every hook point fires in real games). `npm run e2e`: 3.
- `npm run build`: ok. `npm run sim -- --games 60`: 60 finished, 0 errors, avg 4.72 rounds, 16597 decisions, max
  step 137 ms (winners B 27, A 17, draws 16).

## Not yet
The playable slice with rules UI (M3), the AI policies (M4), art, audio files, real terrain. Open M2 items:
`tools/out/m2-followups.md`.
