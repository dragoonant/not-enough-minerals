# Status: what exists

Milestone reached: **M0 skeleton** (generated snapshot, 2026-10-13; this file lists only what is real; plans live in
PLAN.md). The specs under `docs/spec/` are written by the spec agents and are not listed here.

## Repo and tooling
- Vite 8 + React 19 + R3F 9 + drei + zustand 5, TypeScript 7 (strict), Vitest 5, Playwright. Pages base
  `/not-enough-minerals/`; chunks react / three / r3f / engine.
- `.github/workflows/deploy.yml`: typecheck, test, build, deploy on push to `main` (and manual dispatch).
- `.claude/launch.json`: `nem-dev` on port 5201. Playwright previews the build on port 5202 (`PW_PORT`).
- `tools/`: `sim.ts` (random bots, invariants, replay determinism, 2000-decision stall cap), `sim-core.ts` (data
  loader for node tools), `ai-bench.ts` (tier vs tier, alternating seats), `validate-data.ts`.
- Not carried over yet: audio generation tools, GLB optimizer, workflows (M5/M6 bring them when needed).

## Engine (`src/engine/`, no StarCraft rules yet)
- Contracts: `types.ts` (generic GameState, models with round bases 25-150 mm, seats, one PendingDecision, PlayerView),
  `decider.ts` (random and replay deciders), `view.ts` (pass-through until hidden information lands), `rng.ts`
  (seeded sfc32, `rollD6`, `roll`), `pending.ts`.
- Foundations: `registry.ts` (ModuleDef/Controller action protocol), `apply.ts` (validate, dispatch, log; never
  throws on bad input).
- Generic geometry carried over: `geometry.ts` (bases, sweeps, placement, path checks), `measure.ts` (base-edge
  distances), `terrain.ts` (terrain prisms), `los.ts` (3D line of sight with reasons). Their movement/LOS/cover
  details are base-project behaviour marked TODO(M2) until the StarCraft spec replaces them.
- `turnflow.ts`: PLACEHOLDER turn loop (each seat rolls a test D6 or passes once per round, 3 rounds, draw). Not a rule.
- `setup.ts`: `createGame` / `createDemoGame` (10 placeholder models on 25/32/40/50 mm bases, 5 terrain pieces,
  36 x 36 in; `table: 'standard'` gives 36 x 54 in).

## Data (`src/data/`, `data/`)
- Minimal generic shape (records `{id, name, source}` in `units/`, `factions/`, `scenarios/`, singleton `rules.json`),
  loader via `import.meta.glob`, pure validator (kebab ids, unique ids, required source). `data/editions.json` lists
  edition `core`, which holds no records yet. M1 defines and freezes the real schema.

## AI (`src/ai/`)
- `decider.ts` (tier decider with an empty POLICIES table and random fallback), `random.ts`, `types.ts` (tiers random /
  easy / normal, `aiBudgetMs` from `VITE_AI_MS` / `AI_MS`), `worker.ts` (Web Worker host). Every tier plays random.

## Client (`src/client/`)
- Start screen "Not Enough Minerals" with the fan notice (mode, bot tier, speed, seed, Continue) -> game screen.
- `contract.ts` surface; `store/gameStore.ts` is the only apply caller (autosave per round, save/replay);
  `presentation/` director, beats, cues, presented and announce stores; `bot/` driver with watchdog, random brain,
  AI worker client; `board/` 36 x 36 in placeholder mat with a 6 in grid, camera presets, procedural terrain, DOM model
  proxies, `?fps` meter; `figures/` procedural MGSD-proportioned placeholder figures (about 2.25 heads) and the GLB
  loader shape; `ui/` HUD shell (top bar, banner, generic option prompt, rejection toast, game over); `dice/` D6 tray
  and log; `audio/` Web Audio manager with procedural SFX and mood music.
- Test hooks: `?test=1` (window.__game), `?seats=`, `?seed=`, `?tier=`, `?speed=`, `?fps`.

## Tests (`npm test`: 25 tests; `npm run e2e`: 3)
RNG-001, SETUP-001, VIEW-001, DECIDER-001, APPLY-001, FLOW-000, GEOM-001..005, LOS-001..003, DATA-001..002, AI-001..002,
AUD-001..003, CLI-001..004. E2E: boot with the fan notice, `?test=1` hooks, screenshots `screenshots/m0-start.png`
and `screenshots/m0-table.png`. `npm run sim -- --games 20`: 20 finished, 0 errors.

## Not yet
Every StarCraft rule (M2), real data (M1), the playable slice (M3), the AI (M4), art, audio files, terrain.
