# Status: what exists

Milestones reached: M0-M4, M5 art, M6 audio, M7 polish, M8 terrain, M9 Wave 2 armies (snapshot 2026-10-17; this
file lists only what is real; plans live in PLAN.md). Gate reports: `tools/out/m1-data-report.md` (M1),
`tools/out/m2-followups.md` and `tools/out/m3-followups.md` (resolved in the 2026-10-16 follow-up pass),
`tools/out/m4-bench.md` (AI bench, with a follow-up section), `tools/out/rules-check-pass.md` (rules-check pass),
`tools/out/music-report.md` (audio). The specs
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
- Rules decisions: `docs/needs-rules-check.md`. Rules-check pass 2026-10-16: 83 Confirmed, 50 Unsourced (free
  sources silent; literal reading kept), 9 Corrected in code (summoned Supply VP, Orders/Wild Mutation grants,
  coherency past enemies, melee keyword allocation, IMPACT split, Advanced Training, RESPAWN, MORPH).
- Maps: the TER-001 roll (D3 skirmish / D6 standard) picks generated maps; `terrain-maps.ts` adds the original
  "Sunken Shrine" temple layout (skirmish and standard), opt-in through the launch `map` option.

## Data (`src/data/`, `data/`; schema FROZEN)
- Schema `docs/spec/20-data-schema.md` (types `src/data/types.ts`), entry guide `docs/spec/21-data-entry-guide.md`.
  `npm run validate:data`: ok, 15 warnings (CT rows with no card, by design).
- Edition `sc-2026-10`: 31 units (Terran 8, Zerg 13, Protoss 10; 4 summoned), 64 upgrades, 112 abilities, 53 weapons,
  42 cards, Cost Table and Changelog 10.2026, 12 Mission Cards, 12 Deployment Cards, 6 presets, 39 keywords,
  `rules.json`. Open data misfits (missing `rules.json` keys, creep grant shape) are listed in the M2 follow-ups.

## AI (`src/ai/`; spec `docs/spec/30-ai-bot.md`)
- Tiers `random`, `easy`, `normal` (`types.ts` TIERS: weights for threat, cover, kills, objectives, tempo, survival;
  easy adds noise and picks from its top three). Contracts frozen at M4: `types.ts`, `decider.ts`, `worker.ts`.
- `decider.ts`: builds the context from `view(state, seat)` only (query shim in `world.ts`, seeded stream, work
  meter), dispatches on `pending.kind` to `policies.ts`, checks the answer and falls back to `random.ts`.
- `eval.ts` (position value from `query.*` numbers), `threat.ts` (enemy reach and expected Supply loss per spot),
  `moves.ts` (scores the engine's move, deploy and charge paths). No rules are re-derived in `src/ai`.
- Budget: `AI_MS` / `VITE_AI_MS` (default 150 ms) maps to a work cap, so answers are deterministic; a wall-clock
  hard stop is the safety net. The client runs the AI in a Web Worker (`src/client/bot/aiWorkerClient.ts`, 3 s
  timeout) driven by `botDriver.ts`.
- Objectives are mission-aware (`markerWorth`: no pull toward markers the Mission does not score); a ramping enemy
  pull; activation prices shots and charges before moves. Policies cover melee keyword allocation, cost Reactions,
  MORPH removals and RESPAWN spots.
- Bench (`npm run bench:ai`, flags `--rotate`, `--matchups all`, `--offset`, `--trace`; `tools/out/m4-bench.md`
  follow-up section): normal beats random 239/240 rotating all 12 Missions x 12 Deployments (every Mission 39-40/40),
  normal beats easy 201/240, founders 240/240; solo run mean 8.4 ms, max 171 ms per decision, 0 fallbacks.
  Open items: `tools/out/ai-followups.md`.

## Client (`src/client/`; spec `docs/spec/50-client.md`)
- `contract.ts` is the only door to the engine: hooks over presented state, `query.ts` previews, `focus` UI state.
  `store/gameStore.ts` is the only apply caller; `store/launch.ts` resolves menu or URL launches (seeded random
  mission and deployment).
- Start screen (`ui/StartScreen.tsx`, `ui/start/`): your race and the opponent's race (Terran/Zerg/Protoss), Forces
  (Starter or Expanded with the Wave 2 units: Siege Tank, Ravager, Zeratul + Immortal under the Nerazim), mission,
  deployment and map pickers with a briefing preview, players (vs bot, hot-seat, watch bots), bot tier, speed, seed;
  our own geometric faction emblems; fan notice. Founders Edition and First Battle remain URL-only (`?matchup=`).
- Game screen: briefing modal (mission, Phases, Supply pool table, scoring, mini-map with Entry Edges, first-turn
  tips) through `ui/ModalLayer.tsx`; collapsible rails with objective tracker, score, Supply table, Reserves, unit
  card with weapon panel and statuses, odds panel, "What happened" feed (`ui/feedView.ts`); PhaseBar, hint strip,
  settings, game-over screen with a per-Round VP table and rosters.
- Terrain GLBs (`public/assets/terrain/`, 44 slugs in four sets: outpost 12, temple 11, crystal 11, creep 10): all
  Hunyuan-made war-torn models from terrain pass v2 (`tools/models/terrain/`); the procedural v1 set from
  `art/terrain/gen-terrain.mjs` is archived in `art/archive/terrain-v1/`.
- Board (`board/`): mat, placeholder terrain, deployment zones and edges, objective rings with control labels,
  threat/detection overlay, camera presets facing the viewer's Entry Edge. Figures (`figures/`): GLB models where
  present, procedural MGSD-ish proxies otherwise, status icons, `?gallery`.
- Interaction (`interaction/`): one prompt per decision kind (deploy entry band, move/charge paths with ruler and
  ghost formation, weapon and target picks with odds, abilities, Roll-Offs), docked beside the rails.
- Presentation (`presentation/`): director and beats pace engine events into cues; dice tray (`dice/`, Working and
  Quick modes, dice log); Web Audio SFX and music (`audio/`).
- Figures: 31 units have GLBs; siege tank, goliath, hydralisk, queen, ravager and omega worm are split into
  `lower`/`upper` nodes (`tools/models/split.mjs`, planes in `split-planes.json`) and rigged (`figures/rig.ts`: turret
  yaw, Zerg lunge); base rings and unrigged GLBs are instanced (152 -> 87 draw calls on the test board).
- Audio: decoded-buffer seamless loops, music director (calm / battle / tense when 3+ VP behind or last round /
  victory and defeat stingers, crossfades), measured trims, `public/sounds.html` audition page (`tools/gen-sfx.ts`).
- Test hooks `?test=1` (`window.__game`), `?seats=`, `?seed=`, `?tier=`, `?speed=`, `?matchup=`, `?mission=`,
  `?menu=1`, `?map=sunken-shrine`, `?gallery`, `?fps`.

## Verification (2026-10-17, follow-up pass)
- `npm run typecheck`: clean. `npm test`: 555 tests in 60 files, all pass.
- `npm run validate:data`: ok, 15 warnings (CT rows with no card, by design). `npm run build`: ok.
- `npm run sim -- --games 40` over all matchups incl. Expanded: 40/40 finished, 0 errors. The sim now also checks that
  an accepted answer settles its decision and that every listed option is accepted (1 in 20 decisions, on a clone).
  100 mirror games: A 42, B 38, draws 20 (no seat bias).
- `npm run bench:ai -- --rotate --matchups all`: 0 engine-blocked games, 0 E_COST, 0 errors (see the AI section).
- `npm run e2e`: 24 pass (run through msedge; this PC's Playwright chromium build is older than the one the
  config expects). Screenshots: `screenshots/m7-{start,start-phone,rig}.png`, `m8-temple-{layout,standard}.png`.

## Not yet
- The owner playtest gate for the AI (3 games) and an owner listen of `sounds.html` (loop seams, the tense variant).
- Turret yaw on the Siege Tank and Goliath not yet seen in a live game (the Ravager lunge was). Shrine ramps are
  plain-coloured steps with no texture; split-plane heights are eyeballed.
- First-weapon grants are spent per action, not per Batch (needs `effects.ts`). Respawn/morph DEP-003 Leading Model
  search is a sampled check. The decision panel can cover a squad at the table's lower right.
- No standard-scale (36 x 54) army presets yet. Open items: `tools/out/ai-followups.md`.
