# Status: what exists

Milestone reached: **M3 playable slice** (generated snapshot, 2026-10-13; this file lists only what is real; plans live
in PLAN.md). Gate reports: `tools/out/m1-data-report.md` (M1), `tools/out/m2-followups.md` (M2 open items),
`tools/out/m3-followups.md` (M3 open items). The specs
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

## Client (`src/client/`; spec `docs/spec/50-client.md`)
- `contract.ts` is the only door to the engine: hooks over presented state, `query.ts` previews, `focus` UI state.
  `store/gameStore.ts` is the only apply caller; `store/launch.ts` resolves menu or URL launches (seeded random
  mission and deployment).
- Start screen (`ui/StartScreen.tsx`, `ui/start/`): matchups including Founders Edition and a First Battle learning
  game, mission and deployment pickers with a briefing preview, players (vs bot, hot-seat, watch bots), side, bot
  tier, speed, seed; our own geometric faction emblems; fan notice.
- Game screen: briefing modal (mission, Phases, Supply pool table, scoring, mini-map with Entry Edges, first-turn
  tips) through `ui/ModalLayer.tsx`; collapsible rails with objective tracker, score, Supply table, Reserves, unit
  card with weapon panel and statuses, odds panel, "What happened" feed (`ui/feedView.ts`); PhaseBar, hint strip,
  settings, game-over screen with a per-Round VP table and rosters.
- Board (`board/`): mat, placeholder terrain, deployment zones and edges, objective rings with control labels,
  threat/detection overlay, camera presets facing the viewer's Entry Edge. Figures (`figures/`): GLB models where
  present, procedural MGSD-ish proxies otherwise, status icons, `?gallery`.
- Interaction (`interaction/`): one prompt per decision kind (deploy entry band, move/charge paths with ruler and
  ghost formation, weapon and target picks with odds, abilities, Roll-Offs), docked beside the rails.
- Presentation (`presentation/`): director and beats pace engine events into cues; dice tray (`dice/`, Working and
  Quick modes, dice log); Web Audio SFX and music (`audio/`).
- Test hooks `?test=1` (`window.__game`), `?seats=`, `?seed=`, `?tier=`, `?speed=`, `?matchup=`, `?mission=`,
  `?menu=1`, `?gallery`, `?fps`.

## Verification (2026-10-13, M3 gate)
- `npm run typecheck`: clean. `npm test`: 397 tests in 40 files, all pass (engine checklist IDs plus client UI-,
  INT-, DICE-, board and start-screen tests).
- `npm run validate:data`: ok, 15 warnings. `npm run build`: ok. `npm run sim -- --games 30`: 30 finished, 0 errors,
  avg 4.63 rounds, 8219 decisions, max step 134 ms (winners B 14, A 8, draws 8).
- `npm run e2e`: 11 pass (boot, human answer, a full Founders game vs bot from the menu, bot-vs-bot per matchup,
  screenshots). Screenshots: `screenshots/m3-{start,briefing,board,dice,gallery,gameover,rings}.png` at 1280x800.

## Not yet
The AI policies (M4; every bot tier plays random), most figure art, real terrain, query additions the client is
waiting on (shoot options, contest radii, coherency links, placement-aware visibility). Open items:
`tools/out/m2-followups.md`, `tools/out/m3-followups.md`.
