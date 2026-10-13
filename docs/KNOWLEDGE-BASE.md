# Knowledge base: what five tabletop-to-browser ports learned

First distilled 2026-10-11 for Fell-in (Fallout: Wasteland Warfare). Carried forward and extended 2026-10-13
for the 6th port, StarCraft: Tabletop Miniatures Game. Sections 1-7 are the original three-port lessons
(Mallet-42k, whirr-machine, Dead-of-winner) plus Fell-in's early figure notes (3.4). **Section 9 is new**:
lessons from Fell-in M0-M4c (10-11 to 10-12), WarMechForge/BattleTech M0-M8a (10-08) and Mallet-42k after
10-05. **Section 8 is the StarCraft fast-start.** Where section 9 contradicts an older line, section 9 wins.
**Section 10 is the kickoff question set with the owner's answers** (StarCraft, 2026-10-13): use them as the
defaults for the next game and ask only what is genuinely new.

Paths moved: every project now lives in `C:\Claude Code Projects\` (siblings of this folder), not OneDrive.
Read the old `~/OneDrive/Documents/<X>` paths below as `../<X>`:
`MAL` = `../Mallet-42k`, `WHI` = `../WarMForge/whirr-machine`, `DOW` = `../Dead-of-winner`,
`FELL` = `../Fell-in`, `BT` = `../WarMechForge/warmechforge` (brief: `../WarMechForge/BATTLETECH-HANDOFF.md`).
All are read-only references; COPY, never edit. Pages: `https://dragoonant.github.io/<repo>/`
(fell-in, warmechforge, ...).

Short verdict for StarCraft: **FELL is the best skeleton** (newest WHI-derived engine and client, data-driven
scenarios, briefings, the newest workflow scripts with owner-routed fix agents). **MAL is the best source for
squad mechanics** (multi-model units, coherency, wound allocation and model removal, objective control by
models in range, reserves, multi-weapon squads, dice presentation). WHI for terrain and the AI core; BT for
large-model rigs (split GLBs), music and make-up gain; DOW only if hidden info appears (tactical card hands).

---------------------------------------------------------------------------------------------------

## 1. Project shape that worked

### 1.1 Stack (identical in all three; copy package.json from WHI verbatim)
- Vite 8, TypeScript 7 (strict; `paths` WITHOUT `baseUrl`, `@/` -> `src/`), React 19.2.8, three 0.186,
  @react-three/fiber 9, @react-three/drei 10, zustand 5, Vitest 5 (node env, `tests/**/*.test.ts`),
  Playwright 1.63, ajv + ajv-formats (data schemas), tsx (tools), `@breezystack/lamejs` (mp3 encode in tools).
  DOW adds `@gltf-transform/*`, `meshoptimizer`, `sharp` for `tools/models/optimize.mjs`.
- Node 22 in CI (Vitest 5 warns EBADENGINE on Node 25: harmless).
- `vite.config.ts`: `base` = `/<repo>/` in prod only, `/` in dev; every asset URL uses
  `import.meta.env.BASE_URL` (base-path bugs only show up on Pages otherwise).
- npm scripts (same in all): `dev build preview typecheck test test:watch e2e sim bench:ai validate:data`
  (`balance:report`, `spike:*` in MAL only).
- Deploy: `WHI/.github/workflows/deploy.yml` (push to `main`: `npm ci`, typecheck, `npm test`, build,
  `upload-pages-artifact dist`, `deploy-pages`; Pages `build_type: workflow`). Copy verbatim. Never run e2e
  in CI (3D pages are slow); e2e is local only.
- Dev server entry in `.claude/launch.json` (DOW: `dow-dev` on port 5181; WHI: `whirr-dev`; MAL had 8765 for
  the Hunyuan model viewer). Pick a new port per project.
- `playwright.config.ts` (WHI): `webServer.command = npm run build && npm run preview -- --port $PW_PORT
  --strictPort`, baseURL `http://localhost:4173/<repo>/` (serves the Pages sub-path), `fullyParallel`, one
  chromium project. DOW learned (commit c416330): **4 workers and a 90 s timeout** or parallel 3D pages
  time out.

### 1.2 Layout (copy the shape; WHI is the template)
```
src/engine/   pure rules engine, (GameState, Action) -> events + new state + EXACTLY ONE PendingDecision
  FROZEN after M0: types.ts actions.ts events.ts hooks.ts rng.ts decider.ts index.ts   (+ view.ts in DOW)
  WHI modules: geometry los measure terrain dice attack damage focus spells power-attacks movement
               scenario effects code-hooks cards clock pending turnflow setup phases/ factions/<id>.ts
src/data/     JSON data + schema/ (ajv) ; engine never imports data, a bundle is passed in (`registerBundle`)
src/ai/       utility decider (WHI: decider.ts plan.ts threat.ts prob.ts moves.ts deploy.ts roles.ts
              assassin.ts focus.ts scenario.ts tiers.ts worker.ts random.ts)
src/client/   store/ (zustand, the ONLY caller of engine.step), board/, figures/, interaction/,
              presentation/ (director + presentedStore + announceStore), ui/, dice/, vfx/, audio/, bot/, clock/
tools/        sim.ts sim-core.ts ai-bench.ts validate-data.ts gen-audio.ts compose-audio.ts measure-audio.ts
              audio-manifest.json audio-src/ workflows/*.js
docs/spec/    00-architecture 10-rules-core 11-scenarios 12-rules-test-checklist 13-golden 20-data-schema
              30-figures 40-ai 50-client 60-testing 70-terrain-boards factions/<id>.md schemas/
docs/needs-rules-check.md, docs/sources/ (gitignored)
art/unit-concepts/*.png + PROMPTS.md, art/archive/, art/board-textures/gen.py
public/{assets/models,assets/terrain,audio,sounds.html}
tests/{engine,data,ai,client,e2e,fixtures}
```
Size reference (WHI at M13): engine ~8.8k lines, client ~11.3k, AI ~6.7k (src/ai/*), 98 test files.

### 1.3 Engine contracts and the Decider pattern
- `step(state, action)` returns `{state, events, pending}`; **illegal input is rejected with a code
  (`E_WRONG_DECISION`, `E_BAD_PAYLOAD`), never thrown**. Seeded rng (WHI: sfc32 + cyrb128, `deriveSeed`);
  action log gives `save/load/replay`; the engine never imports data.
- `Decider` interface is shared by human UI, random bot and utility AI. Deciders ONLY receive
  `view(state, seatId)` (DOW; WHI gets full info because skirmish is perfect-information). For a game with
  secret info (Fallout WW has little: hands of command/deck cards maybe) reuse DOW `src/engine/view.ts`.
- `legalActions(state)` must NEVER be empty for an open decision, and feasibility = "some candidate passes
  full validation", not "the planner's preferred arrangement fits". MAL froze twice on this. Keep it as a sim
  invariant.
- Exactly one `PendingDecision` at a time, with a `seat` (DOW allows `'all'` for simultaneous votes).
- Data-driven mechanics: abilities are declarative JSON (conditions, effects, scopes, durations) with
  `{"code": "<hookName>"}` escape hatches registered in `code-hooks.ts` (MAL has 29, WHI more).
  **Freeze the DSL only after a dry run that encodes EVERY card in the first slice** (DOW spec
  `docs/spec/21-card-effects-dsl.md` section 12; WHI shipped a dozen "not built" mechanics because the DSL
  lacked a verb).
- One generic mechanism per concept (WHI: disabled -> boxed -> destroyed windows as ONE mechanism; DOW:
  kill-a-survivor, add-zombies-one-at-a-time). MAL ended with three duplicate deferred-death mechanisms.
- The engine owns every number the UI shows (hit target, damage, LOS verdict, objective control, odds). Both
  MAL bugs (objective control computed client-side in `board/controlLevels.ts`; save computed as Sv-AP,
  ignoring cover) came from violating this. WHI exports `query.*`: distance, LOS verdict with cover/
  concealment flags, attack preview (dice, pHit, expected damage, pKill), threat ranges, scenario control,
  stat trace, move check.
- Read targets from state, not from events (a re-roll window opens before the roll event is emitted).
- Additive contract changes are logged in `docs/spec/00-architecture.md` section 14 (WHI) / 16 (DOW).

### 1.4 Client shape (WHI `src/client`)
- `store/gameStore.ts` = the only `engine.step` caller. `bot/botDriver.ts` answers bot decisions only when the
  presentation is idle, with a **5 s no-progress watchdog that force-answers** bot-owned decisions.
- `presentation/director.ts` turns events into beats; `presentedStore.ts` holds state "as of the animation
  cursor"; `announceStore.ts`. Prompts open only when presentation is idle. Narration pauses 2.4 s/phase,
  1.6 s turn handover, scaled by speed, any click skips.
- `contract.ts` is the client's frozen surface (hooks, `game.*`, `query*` helpers, `bootClient`).
- `ui/promptView.ts` (prompt text per decision kind), `ui/PromptForms.tsx`, `ui/activationView.ts` +
  `ActivationPanel.tsx`, `ui/start/StartScreen.tsx` + `startOptions.ts`, `ui/help/` (HelpGuide tabs,
  CoachLine), collapsible rails on `[` and `]`, EventFeed with per-attack breakdowns, GameOver recap.
- Performance from day one: demand frameloop, dpr cap 1.5, on-demand shadows at 1024, shared geometry/
  materials, Low graphics setting, `?fps` meter (`board/FpsMeter.tsx`), AI in a Web Worker (`ai/worker.ts` +
  `client/bot/aiWorkerClient.ts`), code-split engine/data from the 3D client (MAL shipped one 1.6 MB chunk;
  WHI got game chunks ~1.1 MB, start chunk ~0.55 MB).
- Autosave to localStorage each turn (Continue on the start screen).

### 1.5 Test hooks (all three; keep the names)
- `?test=1` exposes `window.__game` (`state, view, step, pending, legalActions`, `pauseBots(true)` in DOW).
- `?seed=<word>` makes games repeatable: put the seed in every bug report. `?gallery` figure gallery,
  `?fps` perf overlay, `?spike=<name>` perf spike (MAL `src/spike/`, `docs/spike-incursion.md`).
- WHI skips the start screen with `?scenario=&lists=&control=bot,bot&seed=` and `?size=skirmish`, `?board=bog|...`;
  DOW with `?seats=human,bot,bot,bot&objective=samples&seed=`, `?tier=easy|normal|hard|random`.
- Invisible DOM proxies `model-<id>` with `data-x`/`data-z` (DOW: `figure-<id>`); `data-testid` =
  `<area>-<element>[-id]`. **E2E text picks must match button text exactly** (MAL "Chaos Space Marines"
  matched "Space Marines").
- Engine tests are named by checklist ID (`it('ATK-012 ...')`, IDs in `docs/spec/12-rules-test-checklist.md`;
  MAL 402 IDs). Coverage = test names vs checklist, not line coverage.
- Headless sim `npm run sim -- --games N --seed S` (WHI `tools/sim.ts`, `sim-core.ts`): bot vs bot, invariants
  after EVERY step (NaN, one pending, legal actions validate, card conservation), 5000-decision cap, 200-
  decision stall detector, mid-game save/load, replay determinism. DOW adds the hidden-info leak test on every
  view/event. Golden tests: WHI `tests/engine/golden.test.ts` replays the Quick Start's worked first turn with
  forced dice (GOLD-001); DOW has six `GOLD-00x` scripts. **Do this for Wasteland Warfare: replay the
  rulebook's worked example.**
- E2E (WHI `tests/e2e/play.spec.ts` + `policy.ts` click policy): UI-click playthrough to round 3, screenshots
  to `e2e-out/`. MAL `play-fast.spec.ts` full game in ~7.5 min. `tests/e2e/art.spec.ts` writes
  `e2e-out/art-*.png` and gallery for owner screenshots.

### 1.6 Workflow scripts (`tools/workflows/*.js`, run with the Workflow tool)
- Templates: `WHI/tools/workflows/w1-engine.js` (phases Reconcile, Foundations, Rules, Integrate),
  `w9-factions.js` (stages spec/build/verify/client/concepts/audio/gpu-figs/gpu-terrain/gpu-wire),
  `w10-backlog.js` (overnight backlog), `w8-terrain.js` (stages redo/ship), `w6-audio.js`, `w5-art-polish.js`;
  `MAL/tools/workflows/w1-stage.js` (full implement -> verify -> fix -> commit loop) and `w10-faction.js`.
  DOW `w3-client.js` is the best example of a parallel-by-disjoint-files client build (store / presentation /
  table / ui owners).
- Header: `export const meta = {name, description, phases}`; `agent(prompt, {label, phase, schema, model|effort})`,
  `parallel([...])`, `phase('X')`. `ROOT` constant = absolute project path; `ATTR` = Co-Authored-By line for the
  CURRENT model (update per session!); `LEAN = !(args && args.lean === false)`.
- Schemas: `RESULT={ok,summary,files[],issues[]}`, `VERDICT={verdict,coverage,failing[],notes}`,
  `FINDINGS={ok,findings:[{owner,where,problem,fix}]}`.
- Every prompt starts with a `COMMON` preamble: absolute root; "orient from STATUS.md only"; IP rule; frozen-
  contract rule; "run long commands in the FOREGROUND" (Sonnet agents that background `npm test` stall);
  file ownership ("You own ONLY: ..."); no `npm install`/`git commit`/edit of `package.json`/`STATUS.md`
  unless told. Prompts point at spec sections on disk, never paste specs.
- `scriptPath` must be inside the session's working directory; keep scripts LF (`.gitattributes`); resume
  (`resumeFromRunId`) only works in the same session.
- Parallel factions/content batches run in `.claude/worktrees/<name>`, each agent calls `EnterWorktree`
  first; shared registries (STATUS, rulings, sound/figure maps, sim faction lists) merge keeping both sides.
- After a killed run: `git status`, `npm run typecheck && npm test && npm run validate:data`, commit by hand or
  park on `wip/<stage>` (MAL did both).

---------------------------------------------------------------------------------------------------

## 2. Reusable code: what a skirmish-miniatures port should COPY

**Best base: WHI.** Copy the whole repo skeleton (config, deploy, CLAUDE.md, tools, client shell), then
replace the Warmachine rules modules. Warmachine and Wasteland Warfare are both circle-base, inch-measured,
LOS-driven skirmish games with card/stat profiles and an AI that must plan activations, so the shape fits.
(Fallout WW specifics, sourced in `docs/spec/sources/WW-SOURCES.md`: one d20 skill die plus coloured d12
effect dice, colour-coded range rulers instead of inches, 2 actions per activation plus AP-bought quick
actions, alternating Ready/Use turns, no facing, an AI card system (Objective + Subject, response matrix).)

### 2.1 From WHI (`WHI` = whirr-machine)
| Need | Copy | Notes |
|---|---|---|
| Config/deploy | `package.json`, `tsconfig.json`, `vite.config.ts`, `playwright.config.ts`, `.github/workflows/deploy.yml`, `.gitattributes`, `.gitignore`, `CLAUDE.md` | rename base path, ports, IP rule, gitignore adds `*.token*`, `tokens.txt*`, `Tokens.txt`, `.env*`, `docs/sources/`, `*.pdf`, `.claude/worktrees/` |
| Geometry/LOS/measure | `src/engine/{geometry,los,measure,terrain,movement}.ts` (422/340/54/244/427 lines) | circle bases, base-edge measuring, sweep collision (stop at first contact), place-within-N", cylinder-volume LOS vs terrain prisms with cover/concealment/forest exceptions; adapt volume heights (WHI table: 30mm 1.75", 40mm 2.25", 50mm 2.75", 80mm 3.25", 120mm 5") to Fallout figure scale |
| Dice/attack/damage | `src/engine/{dice,attack,damage}.ts`, `src/ai/prob.ts` (closed-form expected damage) | rewrite for the d20 skill die + d12 effect dice but keep the event pipeline + `query.attackPreview` shape |
| Turn/decision plumbing | `src/engine/{pending,turnflow,setup,effects,code-hooks,hooks}.ts`, `phases/` | activation model fits any alternating-activation game |
| Terrain data+render | `src/client/board/{Terrain,terrainFit,terrainGlb,terrainModels,terrainInfo,terrainHover,TerrainTooltip,Surface,boards,boardPick,layout,Zones,EdgeMarkers,matShare,proceduralPieces,scenarioElements}.ts(x)`; `src/data/terrain/layouts`; `docs/spec/70-terrain-boards.md` | terrain GLB fitted to an engine footprint by `terrainFit.ts` (port of MAL `ruinFit.ts`; model contract: y up, origin bottom-face centre, long side +x). `TerrainTooltip` = rules-type hover tip. Terrain carries its rules type; engine reads the type, never the mesh |
| Camera/board | `src/client/board/{Board,Camera,labelSprite,FpsMeter,frameRate}.ts(x)` | camera starts behind the human's zone, presets (V), transitions <=600 ms, right/middle drag and Alt/Space never start a model nudge |
| Interaction | `src/client/interaction/{MoveDrag,Overlays,adapter,controller,keys,ray,store}.ts(x)` | drag + multi-waypoint movement clamped to the farthest legal point, ghost preview, ruler (M), LOS view (L), threat rings (T) |
| Figures | `src/client/figures/{glbLoader,glbModels,GlbBody,glbPaint,Figure,FigurePreview,Gallery,Procedural,proceduralPart,proceduralCreatures,kit,facing,paintStore,profile}.ts(x)` | `ENABLED_GLB_SLUGS` + `public/assets/models/manifest.json` (a test checks both agree with files on disk; missing GLB falls back to procedural, no 404s); `glbPaint.ts` hue-band army-paint shader; `facing.ts` figures face nearest enemy |
| Presentation | `src/client/presentation/*`, `src/client/store/*`, `src/client/bot/*`, `src/client/contract.ts` | see 1.4 |
| Dice UI | `src/client/dice/{DiceLog,DiceTray,diceView,trayStore}.tsx` | every roll type must route to the tray |
| VFX | `src/client/vfx/{VfxLayer,effects,engine,particles,sockets,StatusFx,Pops,Clouds}.ts(x)` | beat-driven effects, status visuals, damage pops |
| UI shell | `src/client/ui/{Hud,TopBar,Prompt,PromptForms,promptView,ActivationPanel,activationView,EventFeed,feedView,GameOver,matchStats,SettingsPopover,PaintPanel,paintView,GridCard,cards/,help/,start/}` | `start/StartScreen.tsx` + `startOptions.ts` = army picker (any-vs-any, faction colours, bot tier, scenario, board, speed); `help/HelpGuide.tsx` + `CoachLine.tsx` = first-time coach tips; `PaintPanel.tsx` army painter; `GridCard.tsx` is Warmachine damage grid (drop or adapt) |
| Audio | `src/client/audio/{manager,eventSounds,trims,manifest,music,beatAudio,SoundSettings,settings,useAudioSettings}.ts`, `src/client/weaponFlavour.ts`, `public/sounds.html`, `tools/{gen-audio,compose-audio,measure-audio}.ts`, `tools/audio-manifest.json`, `tools/audio-src/` | see section 3.3 |
| AI | `src/ai/*` (see 1.2) | `tiers.ts` easy/normal; `worker.ts` Web Worker; `threat.ts` threat map; `roles.ts`/`scenario.ts` objective roles; `deploy.ts` includes chain-deploy fallback (MAL bug: crashed in shallow zones); `assassin.ts` (search for own kill lines; the biggest strength signal in WHI) |
| Sim/bench | `tools/{sim,sim-core,ai-bench,validate-data}.ts` | `npm run bench:ai -- --games 20 --seed 1`: normal beat random 20/20 at 4.6 ms/decision |
| Tools | `tools/terrain-catalog.json` (piece prompts), `tools/out/` (bench JSONs), `art/board-textures/gen.py` (FFT-noise battle-scarred ground), `art/terrain-sheets/`, `art/figure-sheets/` | |
| Clock | `src/client/clock/*`, `src/engine/clock.ts` | optional deathclock, off by default |

### 2.2 From MAL (`MAL` = Mallet-42k), only where WHI lacks it
- `src/engine/los.ts`, `geometry.ts` (polygon bases, 3D inches, ruins height rules): not needed for round bases.
- `src/client/board/ruinFit.ts`, `ruinModels*.ts`, `terrainAssets.ts` (original of WHI terrainFit).
- `src/client/interaction/{formations,formationValidation,PlacementOverlay,DeathGhosts}.ts(x)`: formation
  deployment (keys 1-7, Q/E/R rotate, nudge), death ghosts. Useful if squads deploy as groups.
- `src/client/ui/{RerollTray,rerollInfo,StratagemPanel,UnitCardTooltip,UnitCard,VpToast,FormationPicker}.tsx`:
  re-roll offers, unit-card hover tooltips, VP toasts. `src/client/figures/{BipedBody,VehicleBody,SwarmBody,
  ArtilleryBody,kitConfigs,paint}.ts(x)`: procedural kit (placeholders only).
- `src/ai/{expected,formations,stratagems,utility}.ts`; `tools/balance-report.ts`; `tests/ai/stall.test.ts`.
- `src/engine/modules.ts` + `src/engine/phases/README.md` (module interface used for parallel engine build).
- 5 factions + Necrons built via `w10-faction.js`: the repeatable "ship a faction" recipe.

### 2.3 From DOW (`DOW` = Dead-of-winner)
- `src/engine/view.ts` (per-seat redacted view), sim leak test in `tools/sim-core.ts`, `docs/spec/21-card-effects-dsl.md`
  (declarative card DSL with triggers/subjects/conditions/effects/scopes/durations + `{code}` escape hatch),
  `tools/models/optimize.mjs` (`npm run models:optimize`: gltf-transform dedup/prune/weld, textures to webp
  <=1024, meshopt; run on Hunyuan GLBs before shipping), `tools/textures/gen_textures.py`,
  `tools/check-copied-text.ts` (guards against copying rulebook prose), `tools/audio-build-manifest.ts` +
  `audio-content.ts` (manifest generated from data), `tools/default-bundle.ts`.
- `src/client/figures/{glbManifest,figureLook}.ts`, `src/client/table/*` (table layout pure functions, unit-tested),
  `src/client/recap/`, `src/ai/` persona + suspicion modeling (only if Wasteland Warfare has a solo/AI mode
  with talk; otherwise skip).
- `docs/spec/sources/*-sources.md` format: per-card tables with source tags and conflict status. Copy the
  format for Fallout stat blocks (WHI has the same in `docs/spec/factions/*-sources.md`).

---------------------------------------------------------------------------------------------------

## 3. Asset pipelines (Windows PC with the GPU only; never the Mac)

### 3.1 Concept images: Gemini via Claude in Chrome
- Run `mcp__claude-in-chrome__list_connected_browsers` first; need a WINDOWS browser signed in to the
  owner's Google account. The built-in browser is not signed in. The Mac's Chrome was once the only connected
  one: concepts landed on the Mac, the Mac session refused to push, owner annoyed. Ask the owner to connect
  Chrome on the PC if none.
- One Gemini chat per faction (style consistency). File name = GLB slug: `art/unit-concepts/<slug>.png`;
  prompts recorded in `art/unit-concepts/PROMPTS.md`.
- **Proportions in plain words** (see 6.4). **StarCraft: superseded by 9.6 (MGSD).** Prompt template (adapt; WHI Part D.2 in
  `WHI/docs/WARMACHINE-HANDOFF.md` lines 266-300): "Generate an image of a [ORIGINAL DESCRIPTION], mildly
  stylized heroic proportions, about four and a half heads tall, detailed, not cute. Full body, neutral
  standing pose, front three-quarter view, standing on a plain round black base. Plain white background, even
  soft lighting, no shadows, no text, no logos." Follow-ups: "Same style, proportions, framing, base and
  background: now a ...". Reject at once if two figures, cropped, too realistic, base not round (regenerate in
  the same chat with "exactly ONE single figure, centred"). State the base size in context (28mm trooper vs
  50mm+ creature).
- **Getting images out (Gemini gotchas, `MAL/docs/HANDOFF-sd-figures-v2.md`)**: the "Download full size image"
  button is unreliable. Use `javascript_tool`: for `blob:` src draw to canvas + `toDataURL`; for lh3 src
  `fetch(src.split('?')[0] + '?alr=yes', {credentials:'include'})` (body may be text holding another URL; follow
  2+ redirects until blob type is `image/*`); `=s0`/`=s2816` blocked so images are 1024x559 (fine, Hunyuan
  shrinks to ~512). Scroll each response into view and wait ~800 ms; Gemini image N = Nth `model-response`.
  Bundle `{slug: dataURL}` into ONE JSON download per tab (Chrome allows one auto download per tab). The tool
  times out at 45 s: start loops un-awaited and poll `window._log`. Background tabs are throttled (screenshot
  to bring forward). A stuck "Stop response" needs a reload plus a real click on Send.
- **Reference images (official product photos) go in via the hidden `input[type=file]`, NEVER the system
  clipboard**: "Upload & tools" (+) -> hover "Upload files" -> `find` the inputs -> `file_upload` with a path
  INSIDE the session folder (copy refs to `WarMForge\refs-local\` first, outside the repo). Verify the
  rich-textarea holds only the prompt before Enter. (Incident 2026-10-05: a failed clipboard copy pasted the
  owner's private clipboard text into a sent Gemini prompt; the owner paused all GPU work.) Official photos
  are local refs only, never committed.
- Check head-to-height ratio and base on every image before 3D. Cleanup: delete stray abandoned Gemini chats
  (WHI left two; the owner was told).

### 3.2 Hunyuan3D local pipeline (outside the repo and outside OneDrive)
- Folders: `~\Hunyuan3D-2` (Python 3.11 venv: SDXL concepts, cutout, paint) and `~\Hunyuan3D-2.1` (Python 3.10
  venv: shape + bpy finalize). `uv` at `~\.local\bin\uv.exe`; set `UV_SYSTEM_CERTS=1` (PC re-signs HTTPS).
  Data files in the 2.0 folder: `units.json` (`{slug: {prompt, height (in), base (mm)}}`), `picks.json`
  (slug -> seed or absolute PNG path; for Gemini images put the PNG path and skip stage 1).
- Stages: (1) `concepts_sdxl.py` (optional; non-blue factions need `--style 0.2 --avoid "blue armour"` or the
  librarian reference turns everything blue); (2) `stage_cutout.py <slugs>` (2.0 venv); (3)
  `stage_shape.py --only <slugs> [--nocut <slug>]` (2.1 venv, ~90 s/model; `--nocut` for floor-length capes/
  robes, otherwise the display base auto-cut chops them); (4) `stage_paint.py --only <slugs>` (2.0 venv, ~20 s
  each); (5) `..\Hunyuan3D-2.1\.venv\Scripts\python.exe stage_finalize.py <repo>\public\assets\models <slugs>`
  (scales to inches, adds black base cylinder + matte material, writes `<slug>.glb` and
  `outputs\final_contact_*.png`). **Look at the contact sheets before wiring.**
- Throughput: ~10k faces and a 1024 texture per figure; terrain ~15k faces; 5-model batch ~12 min; DOW ran
  batches of ~8; one faction per batch (<=9 models), then finalize, wire, commit, push.
- Gotchas: do not upgrade `transformers` 4.48.3 / `diffusers` 0.32.2 in the 2.0 venv; weights are plain files
  in `~\.cache\hy3dgen` (HF symlinks fail without Developer Mode); PowerShell 5.1 `Out-File` writes a BOM which
  breaks `json.load` (write JSON without BOM); viewer `view_models.bat` (port 8765) or `.claude/launch.json`
  entry. Before overwriting GLBs `git mv` old ones to `art/archive/models-v1/` in the SAME commit so `main`
  never enables a slug without its file.
- Sizing: set finalize height/base from the real base: WHI infantry 30mm ~1.15-1.3", light engine 40mm ~1.8",
  heavy 50mm ~2.3-2.6", colossal 120mm ~4.5"; MAL 25mm 1.15", 32mm 1.55", 100mm 1.6". Measurement uses the
  base, not the mesh.
- **GLBs are fused meshes with baked textures**: recolouring needs `glbPaint.ts` hue-band shader (pick a clean
  two-hue scheme per faction in the concept prompt so the remap works); weapon loadouts need either one GLB
  per loadout or separate weapon GLBs on hand sockets (WHI Part D.3; never solved in MAL "weapons match the
  unit card"; vfx `sockets.ts` is the WHI start). For Fallout (loadouts are central: guns, melee, armour) decide
  at the first figure gate.
- Terrain: Hunyuan GLBs for walls/ruins/cars/junk; flat pieces (trench, ash flats, roads) must be PROCEDURAL
  (image-to-3D cannot do flat). Decimate terrain to ~6k tris (first WHI batch at 12k tris gave 76-86 ms
  frames). Ground mats: CC0 Poly Haven 1k credited in `public/assets/terrain/CREDITS.md` plus `art/board-
  textures/gen.py` (needs numpy/scipy/Pillow from the Hunyuan venv). WHI: 38 pieces, 5 themed boards
  (`w8-terrain.js`, stage 'redo' with `args.redo=[{slug,why}]`, then 'ship'); owner "loved it".
- Cost: GPU is free but slow; the DOW card-figure batches (30 survivors + 4 zombies) were ~5 batch commits.
  Owner accepted WHI figures except 3-4 weak ones; keep a "veto list" step.

### 3.3 Audio: ElevenLabs
- Key: lives in an untracked file (WHI/DOW: `..\WarMForge\Tokens.txt` as `EL=<key>`, or DOW root
  `tokens.txt.txt` as `el=sk_...`; MAL `elevenlabs.token.rtf`). Strip the prefix (`sed s/^EL=//`) and pass via
  the `ELEVENLABS_API_KEY` env var only. Never print, write or commit it. The repos are public.
- SFX: `POST https://api.elevenlabs.io/v1/sound-generation` `{text, duration_seconds, prompt_influence}` with
  `xi-api-key`. Narrator TTS voice "Harry - Fierce Warrior" (`SOYHLrjzK2X1ezoPC6cr`, `eleven_flash_v2_5`).
  Music: ElevenLabs Music endpoint (~12.5 credits/s; a 502 is STILL charged).
- `tools/audio-manifest.json` items `{id, kind: sfx|voice, prompt|text, durationSeconds, promptInfluence,
  loop?}`, mirrored in `src/client/audio/manifest.ts`. `tools/gen-audio.ts` is idempotent (skips existing
  mp3); to redo a sound edit the prompt, delete `public/audio/<id>.mp3`, rerun. Per-run budget constant
  (`RUN_BUDGET_CREDITS = 12000`).
- Costs: Starter tier ~59k credits per cycle (earlier note 29k/month, MAL era). 40 SFX ~470 credits; whole
  batches 0-700. WHI cap 25k, music 4 themes ~12k. DOW had 21.2k left on 2026-10-11; budget 15k, music <=5k.
  Confirm with the owner before music > ~5k credits.
- Audition loop (the owner loves this): `public/sounds.html` (one `<audio>` at a time) on Pages; the owner
  listens and names ids to redo; regenerate only those; push to main.
- Loudness: `npx tsx tools/measure-audio.ts <prefix>` prints RMS/peak/crest; target RMS 0.15-0.18; gunshots
  need crest >=8 (crest ~2 = transient squashed). Trim with `WEAPON_TRIM`/`DEATH_TRIM` (<=1) in
  `eventSounds.ts`/`trims.ts` (can only turn down; raw files 0.05-0.40 RMS). **Ship measure tool + trims with
  the first batch** (Ork guns were 3x louder than Marine ones).
- Layer instead of re-prompting: `tools/compose-audio.ts` mixes clips from `tools/audio-src/` (boltgun single
  -> 4-round burst; chainsword rev/cut/spin-down).
- **Build the weapon-flavour map first** (`src/client/weaponFlavour.ts`, one place read by BOTH sound and VFX;
  match by longest slug contained in the weapon id). MAL played one ranged and one melee sound for the first
  weeks and 59 generated files went unheard. Fallout needs this for every gun type, energy weapon, melee,
  explosive, plus Pip-Boy/UI.
- Prompt lessons: describe the MECHANISM, not the name ("bolter" -> silenced pistol); list exclusions ("no
  music, no clicks, no reloading, no chittering"); promptInfluence 0.45-0.75 (0.7-0.75 for literal); durations
  0.5-1.5 s, deaths 1.2-3 s; "gargle/grunt" made Orks sound like frogs; marines needed "helmet voice amplifier,
  band-limited radio, metallic" and long weighty deaths.
- Audio manager (`client/audio/manager.ts`): Web Audio unlocked on first click; master/sfx/voice/music
  volume+mute persisted; throttling + detune jitter so 20 shots become a few layered sounds; music bus ~-14 dB
  under SFX, ducked -6 dB under narrator, crossfades >=1.5 s; music no vocals.
- Music/audio payload: WHI `public/audio` 18 MB, `public/assets` 102 MB (dist 123 MB). Mind Pages limits
  (1 GB site) and load time; run `models:optimize` (DOW) on GLBs.

---------------------------------------------------------------------------------------------------

### 3.4 Separate weapon models and Gemini batch extraction (FELL, 2026-10-11; in progress)
- **Figures bare-handed, weapons as their own GLBs** (owner decision for loadout-heavy games). Figure prompt adds
  "both hands empty, right hand a loose empty fist as if gripping a handle, left arm relaxed"; Gemini honours it.
  Weapon prompt: "single prop ... exact side view, horizontal, barrel pointing right ... no hands". One Gemini chat
  for figures, a second for weapons. About 1 in 17 weapon replies came back as text with no image (regenerate
  with "Generate an image:" up front), and a few point left anyway (flip at finalize).
- Client contract (`src/client/figures/{Weapon,equipped,glbModels}.ts`): weapon GLB grip at origin, barrel along +z,
  y up; per-unit `rightHand` socket `[x,y,z]` + `rot` in `public/assets/models/manifest.json`; equipped weapon =
  melee when engaged, else ranged; missing weapon GLB shows a procedural stand-in. Socket positions are estimated
  from the concept's fist location on the finished mesh (first pass; verify on screen).
- Gemini proportions: the first figure came out realistic (~7 heads) despite "four and a half heads". A follow-up
  "noticeably larger head, bigger hands and chunkier boots" gave ~6 heads, then later prompts kept the look.
- Extraction: `fetch(img.src)` on Gemini `blob:` images now FAILS; draw the `<img>` (same-origin blob) to a canvas
  after `scrollIntoView` + 900 ms instead, collect `{slug: dataURL}`, then ONE anchor download per tab. Images are
  1024x572. Map slugs by `model-response` index and check for a reply with no `<img>`.
- **GLB loading: `models:optimize` writes `EXT_meshopt_compression`, so `GLTFLoader` must
  `.setMeshoptDecoder(MeshoptDecoder)`**; without it every GLB silently fails and the procedural fallback shows.
- Terrain manifest written by the generator is a flat `{slug: {file, size:[w,d,h], rulesType}}` map; the engine
  keeps a mirrored `src/engine/terrainCatalog.ts` (engine never imports from `public/`).
- **Owner playtest caught (2026-10-12), fixed:** (1) quadrupeds made from side-view concepts face +/-x; the
  manifest now carries a per-unit `yaw` applied before the fit. (2) First socket estimates sat at the hip: the
  raised empty fist is the figure's LEFT hand (+x for humans, -x for the super mutants), at 55-75% of height; store
  the measured fist centre in fitted inches as `hand`. (3) Natural attacks (bite/claw/swipe/crush) must draw
  nothing; the stand-in bar stuck out of the dogs. (4) Quadrupeds need their own `height` (dog 0.8, hound 1.1,
  deathclaw 2.2 in), not the humanoid height from base size. **Always check `?gallery` front and side close-ups
  before shipping figures**; the overview camera hides all of this.
- The in-app browser pane can lose WebGL rendering (blank canvas, no errors, even on Pages); use
  `npx playwright screenshot --wait-for-timeout=12000 <url> out.png` instead of trusting the pane.
- A stale Vite server from another worktree on the same port served old code during a debug session; give each
  worktree its own port or check `preview_list` first.

## 4. Rules and data research

### 4.1 Routes that worked (ranked by value found)
1. **Vassal module (.vmod)** (DOW's best find, "should have been tried first"): `vassalengine.org/api/gls/v1/
   projects/<slug>` lists modules on `obj.vassalengine.org`; a `.vmod` is a zip of clean card scans
   (`images/Crisis_*.jpg`). Extract with Python `zipfile` as DATA only (do not commit images). Check Vassal
   FIRST for any board/card game. Betrayal text was censored in the module (a hole to plug elsewhere). Search
   Vassal for "Fallout Wasteland Warfare"; may not exist (it is a miniatures game, cards are small), so also
   try fan card databases.
2. **Free official PDFs**: rulebooks, Quick Start, FAQ, scenario packets (Modiphius publishes free PDFs;
   check). Steamforged rate-limited bots, so the OWNER or a browser downloads them once into gitignored
   `docs/sources/`; extract text with `/mingw64/bin/pdftotext -layout` (WHI) or PyMuPDF (`pip install
   pymupdf`, renders pages to PNG; pdftoppm is absent on this PC) into the scratchpad; agents grep the text.
   Some free PDFs need a $0 guest checkout (warmachine.gg free-resources): DO IT YOURSELF, no login.
3. **Fan wikis via their MediaWiki API with plain curl and a browser UA** (Fandom is Cloudflare-blocked in
   WebFetch and the built-in browser, but `deadofwinter.fandom.com/api.php?action=parse&page=<Title>&prop=
   wikitext&format=json` works with curl). TV Tropes: 403 to WebFetch, 200 to curl with a Chrome UA. Quizlet
   and NamuWiki 403 to WebFetch. Try `fallout.fandom.com`/Wasteland Warfare wiki pages the same way.
4. **GitHub fan projects** hold real card data (DOW: MiguelAngelCabanillas/Dead-Of-Winter Spanish scans,
   etwest/deadofwinter_site, gimme/forktale, rosentobbe). WHI: `isorna/wardice-warmachine-data` community
   data. Search GitHub for "wasteland warfare" JSON/CSV.
5. Photos: eBay listing photos (built-in browser, then curl `i.ebayimg.com`), unboxing/replay blogs (pixnet,
   livedoor) read with the Read tool; Bing image search works via plain curl (`a.iusc m=` JSON `murl`); BGG
   images on `cf.geekdo-images.com` download fine; BGG/Ludopedia pages often unreachable for the owner: ask
   with exact URLs (worked); owner-downloaded BGG xlsx files.
6. WHI faction stats: official app could not show cards -> web search of rulebooks, faction PDFs, stat sites,
   store listings, battle reports. WebFetch capped at 3-6 per agent; name exact spec sections.
7. MAL: wahapedia.ru via WebFetch (stats not copyrightable). Biggest token sink was verify agents doing
   Wahapedia research: cap it ("fetch at most 3 pages").
- Pages that block curl+WebFetch (Fandom pages, BGG) are read ONCE through a real browser into
  `docs/spec/sources/`; nobody re-fetches.

### 4.2 Sourcing rules
- Two sources per value, each cited; one blocked source is never the only source. Never ship a stand-in or
  "unverified" before trying several (WHI marked all four M9 factions "U-cd" and built a stand-in Tanith; the
  owner was disappointed on 2026-10-07; it was fixed in M10 with web research).
- `docs/spec/sources/` or `docs/spec/factions/<id>-sources.md`: per-card/model tables with a source TAG per
  value (DOW tags: R rulebook, F FAQ, W wiki, T TV Tropes, ES Spanish scans, Ph photo, BC BGG card spread,
  VASSAL v1.1, `(verify)`) and conflict status. An index README lists sources + "shopping list" of gaps.
- Rules/PDF/community data/secrets are gitignored (`docs/sources/`, `*.pdf`, `*.token*`); every data value
  carries its source in `docs/spec/sources/`. Never quote rules text at length; paraphrase in our own words.
  DOW `tools/check-copied-text.ts` guards it.

### 4.3 RULING log format (`docs/needs-rules-check.md`)
```
RULING: <rule> | <what we did> | <why: status word + page/source>
```
Status words (put them in from day one so the owner can scan): **Confirmed** (source agrees, cite page),
**Corrected** (source disagreed, spec now follows it), **Unsourced** (sources silent, our ruling stands),
**Fan-source**, **App** (only the official app can settle), `U-cd`/`U-guess` for unverified card data.
Counts: WHI ~211 rulings, DOW 196 (101 unsourced/fan; a resolution pass `docs/rulings-resolution.md` confirmed
15, corrected 14, 72 still open). Rules ambiguities NEVER block work. Add a "Guard against old-edition leakage"
table to every rules prompt (WHI: MK3 leaks: no facing/free strikes/STR/templates; put the equivalent for
earlier Wasteland Warfare editions or house rules in every rules prompt).
- MAL's version was a table with Status `open|confirmed|wrong -> fix` and IDs RC-001..; WHI/DOW's one-line
  format is simpler and scales better.

### 4.4 Spec-first order
M0 writes specs 00-60 + JSON schemas + rules checklist with IDs, then ONE adversarial review (MAL round 1 found
critical/major items: windows outside turns, kill attribution, checklist prefixes). Checklist prefixes
(WHI): DICE LOS MOVE CHG ATK DMG GRID PWR AOE SPR FOC SPL COND TERR SCN. Reconcile starter data against the
Quick Start PDF (`w1-engine.js` Reconcile phase) before the engine, and write the golden first-turn script from
the rulebook's worked example (`13-golden-first-turn.md`, mark any gap ASSUMED).

---------------------------------------------------------------------------------------------------

## 5. Process and token economy

### 5.1 Milestone order that worked (playable first)
Hindsight order from WHI Part H (best shape; follow it):
M0 specs + frozen contracts + checklist + skeleton on Pages (owner gate: naming/IP) -> M1 geometry + LOS +
headless sim + validate-data -> M2 rules core + golden replay -> **M3 playable vertical slice on Pages**
(board, terrain, 8 starter profiles with procedural figures, click-to-play, prompts with odds, ruler, LOS
view, dice tray, random bot, presentation director from the FIRST client stage) -> M4 utility AI -> M5 art
(Gemini + Hunyuan, painter, VFX, title art) -> M6 audio (flavour map first, trims with first batch,
`sounds.html`) -> M7 polish (event feed breakdowns, settings, Low graphics, narration pauses) -> M8 terrain/
boards -> M9+ more factions (verify loops ON, army picker) -> skirmish/scenarios/clock. Multiplayer: ON HOLD
in all three.
- Actual WHI: M0-M7 in ~3 days, M8 terrain day 3, M9 four factions overnight day 4, M10-M13 overnight day 5.
- DOW: M0 (2026-10-09) -> M3 playable -> M4 AI -> owner playtest gate -> M5 art -> M6 audio -> M7 polish -> M8
  content; "playable on Pages with bots first, art/audio after the owner plays it".
- MAL mistake: spent M0-M2 (specs + 14-agent engine + data) ~9M tokens before anything was visible; owner
  then said "playable first" (2026-09-14) and procedural figures kept until M7.

### 5.2 What burned tokens (avoid)
- DOW M0-M2 under the Fable-era pattern: **~8M subagent tokens** (high-effort session-model agents, parallel
  agents re-reading the same specs 100k+ each, adversarial review + fix + land loops on every stage, main-
  loop card research). Owner switched the session to Opus; the cheap pattern then shipped M2 data + M3 client
  + M4 slim AI + balance for **~1.8M** (agents 0.2-0.5M each). Settled ceiling: stop and report at ~2.5M
  tokens per push (`memory/token-economy.md`). Ask the owner whether the same ceiling applies.
- MAL W0 1.23M, W1 core 0.53M, W2 data 1.97M, W2-finish ~0.7M, main loops ~0.35M; remaining estimate was
  6-8M. A "blocked-agent probe" wasted ~2M. Verify agents doing web research and re-reading full spec files
  were the top sinks. Fix agents with narrow file ownership correctly refuse out-of-scope findings, so route
  each finding to the owner of the file (MAL lost a round).
- Sonnet subagents keep backgrounding long commands and stalling: "foreground only" in every prompt.
- Concurrent `npm install` corrupted `node_modules`: only commit/integration agents install.

### 5.3 What was cheap (do)
- Sonnet implements everything (`model: 'sonnet'`); session model (Opus) only for integration/debugging at
  normal effort; spec writing and adversarial verification at `effort: 'high'` ONLY for rules-dense content
  (card data batches, AI milestone, each new faction, or when the owner asks).
- Lean mode default: ~10 focused tests per module, no adversarial verify loop. QA = sim + one Playwright game.
- Copy a sibling repo's client instead of re-deriving (DOW M3 client from WHI). One or two agents per
  milestone with EXACT file lists, not "read the specs". Agents return schema JSON <=300 tokens.
- ONE workflow stage at a time, <=8 agents, commit + push per stage. The main loop never reads whole source
  files or hand-writes bulk code: it writes workflow scripts, reads JSON, checks in.
- Probe a new setup (browser, GPU stage, source site) with ONE cheap agent before fanning out.
- Cap research at 3-6 WebFetches per agent. Pre-extract PDFs to text in the scratchpad.

### 5.4 Owner feedback loop and preferences
- Check-ins are <=10 lines with a screenshot per milestone (`e2e-out/*.png`). Don't narrate options you will
  not pursue; don't re-ask settled decisions (they are in PLAN.md "Decisions").
- Owner plays on Pages and gives blunt specific feedback ("sounds like a silenced pistol", "prompts should
  say what they're about", "less SD, more detailed"). Fix in small commits and push. Pushing to `main`
  after each stage is pre-approved.
- Owner gates used: naming/IP posture (M0), figure look (M3/M5; "art rework later is the most expensive
  kind"), playtest gate before art/audio (DOW), per-sound audition (`sounds.html`), figure veto list
  (WHI), "owner questions" list at the end of HANDOFF.md (DOW `OWNER-REVIEW.md` = checkbox list: playtest,
  card data, rulings to skim, decisions for next push, known weaknesses, resolved items).
- Overnight autonomy works: owner sets auto mode, leaves the PC on, and lists standing approvals (WHI
  2026-10-06: photos as local refs, Gemini on this PC, music <=12k credits, GPU from 00:00 then wire and
  push without check-in). Write standing approvals into memory/PLAN.
- Things the owner disliked: bouncing chores back ("Please don't make me do the work for you"), stand-ins and
  "unverified" stats after one blocked source, wrong proportions ("MGSD" -> 2-2.5 heads too SD; "Gundam kit"
  -> mecha), going through the Mac, sounds playing wrong/same, burning tokens (8M), UI prompts that do not say
  what they are for, panels too big (asked for slim collapsible rails late), a bot acting ahead of
  animations.
- Docs the agents maintain: `HANDOFF.md` (current state + next + owner questions, rewritten each session,
  append "Resume point" blocks), `STATUS.md` (what exists, orient from this ONLY), `PLAN.md` (decisions +
  milestones), `CLAUDE.md` (process + conventions, checked in). MAL's HANDOFF.md went stale (still said "continue
  to M5" long after M10): keep it short and overwrite, don't accrete.

---------------------------------------------------------------------------------------------------

## 6. Owner decisions that recur (what carries over)

| Decision | Source | Carries over? |
|---|---|---|
| **Mallet posture IP**: real unit/weapon/ability/card names OK; ALL prose (ability text, lore, UI copy, docs) in our own words, written from a one-line mechanical summary, never sentence-by-sentence paraphrase; NO publisher art, icons, logos, trade dress; README + UI state "unofficial fan project, not affiliated with <publisher>"; no "<Game>-compatible" wording | MAL (2026-09), WHI 2026-10-04, DOW 2026-10-09 | LIKELY. Confirm for Modiphius/Fallout (Bethesda licence is stronger than GW's: ask once whether Vault Boy / Pip-Boy / Nuka-Cola / faction logos must be original markings). Do not re-ask the posture itself; ask only about the Fallout-specific trademarks |
| Mechanics ported 1:1 | all | YES |
| Player vs AI first, multiplayer later (ON HOLD in WHI) | all | YES |
| Repo is public, deployed on GitHub Pages from `main` via Actions; push to `main` after each stage is pre-approved | all | YES |
| **AI is the product** (DOW: "a clone without convincing table-mates is solitaire"; WHI: assassination-line search; MAL: AI beat random >=95% target, SM AI stayed weak ~33% for weeks) | DOW/WHI | YES; AI milestone gets verify loops ON, benchmark, owner playtest gate |
| Title is a pun on the original ("Mallet 42k", "Whirr Machine", "Dead of Winner") | all | LIKELY: propose 3 punning titles + repo names in the first check-in and let the owner pick (Part A open decision 2) |
| Lean mode / playable first / <=10-line check-ins / metered plan | all | YES |
| **Figures** (StarCraft: MGSD, owner 2026-10-13, see 9.6; this row is history): original SD (MAL) -> real sculpts rendered as stylized (WHI 2026-10-05) -> full 3D per survivor (DOW). Gemini concept -> Hunyuan3D. Proportion words: "mildly stylized heroic proportions, about 4-5 heads tall, detailed, premium painted tabletop miniature, not cute"; BANNED words: MGSD, SD, super deformed, chibi, Gundam, mecha kit. Lock exact numbers with the owner at the first figure gate | WHI memory 2026-10-07 | LIKELY (re-ask ONE question: figures of the real Fallout WW sculpts vs original designs? WHI reversed itself on this once) |
| Windows PC with GPU does ALL asset work (Hunyuan3D, Claude in Chrome for Gemini, ElevenLabs); never the Mac, never the built-in browser for Gemini | MAL/WHI/DOW | YES (verify a Windows Chrome is connected before starting) |
| Gemini: never paste via the system clipboard; use `file_upload` | WHI 2026-10-05 | YES, hard rule |
| Secrets: ElevenLabs key only in an untracked token file -> env var; gitignore `*.token*`, `tokens.txt*`, `Tokens.txt`; never log/print/commit | all | YES; note the DOW key file is `tokens.txt.txt` (doubled extension) at the DOW root |
| ElevenLabs: confirm before >~5k credits on music; overall cap per run (WHI 25k) | WHI/DOW | likely; re-state cap each run |
| Do the legwork (free downloads, $0 guest checkouts, public pages, fan DBs); stop only for passwords, payment, account creation | memory | YES |
| Research before assuming | memory | YES |
| Credit/attribution in published work: user is **evilgouki**; never real name or `C:\Users\<name>` path in anything public (user global CLAUDE.md) | CLAUDE.md | YES, hard rule. Scan changes before committing |
| Terrain: original designs inspired by official packs, themed boards picked at random per game, generated GLBs fitted by footprint | WHI | LIKELY (Wasteland: ruined suburbia, vault, junkyard, etc.) |
| Army painter (major/minor colours), base presets, in-game colour options | MAL/WHI | LIKELY |
| Token ceiling ~2.5M per push; Opus session, Sonnet agents | DOW memory | RE-ASK at kickoff (depends on the plan the owner is on that week) |
| Repo location: new repo inside the session's working dir (Workflow tool rejects scriptPaths outside it); owner moves repos around (MAL in `~/dev` on the Mac, then OneDrive; DOW sibling of WarMForge) | all | note |
| Models 'Co-Authored-By' must be the CURRENT model's line | CLAUDE.md | per session |

Open items to ask at the Wasteland Warfare kickoff (ONE message <=10 lines): (1) title pun (3 options), (2)
Fallout-specific IP markings, (3) figure approach: real sculpts vs original, proportions sentence, (4) token
ceiling, (5) which factions/starter set to build first (Fallout WW has several starter boxes: pick the
two-player starter that ships in the box), (6) multiplayer stays on hold, (7) music budget.

---------------------------------------------------------------------------------------------------

## 7. Mistakes not to repeat (with source)

### Process
- Spending M0-M2 before anything is visible: MAL `HANDOFF.md` (resume point 2026-09-14), DOW `memory/token-economy.md`
  (8M tokens). Ship a playable slice with procedural figures and a random bot FIRST.
- Verify agents re-reading whole specs / doing web research: MAL `HANDOFF.md` "Token accounting"; WHI `docs/WARMACHINE-HANDOFF.md` B.1.
- Parallel `npm install` corrupting `node_modules`; agents backgrounding `npm test` and stalling; fix agents
  refusing out-of-scope findings (route by owner): MAL `HANDOFF.md` "Gotchas", WHI B.2/B.3.
- Not freezing interfaces before fan-out (#1 rework sink): MAL `PLAN.md` principle 3. Not freezing the card
  DSL after a dry run: DOW `docs/DEAD-OF-WINTER-HANDOFF.md` Part J.
- Stale HANDOFF.md (MAL says "continue to M5" with 136 commits behind it). Resume only works in-session.
- Claude Code worktree specifics: a harness hook refuses Edit/Write into a sibling worktree even with a
  directory grant; each agent must call `EnterWorktree` first. Workflow `scriptPath` must be inside the cwd.
- Hardcoded Mac path `/Users/<name>/dev/...` in MAL workflow scripts and `C:/Users/<name>/...` absolute `ROOT`
  constants in every workflow script: they are fine locally but must NOT be committed to a public repo
  verbatim in a new project (use `process.env.USERPROFILE`/relative root; see the user's privacy rule).

### Engine
- `legalActions` empty for an open decision froze the bot (MAL; twice). WHI: `docs/WARMACHINE-HANDOFF.md` Part I.
- Planner's preferred arrangement used as the feasibility test (MAL).
- AI deployment crashed in shallow zones (MAL M10 commit 1f3f739): chain-deploy fallback in `src/ai/deploy.ts`.
  Warmachine 6-7" zones with 50mm bases hit it immediately; Fallout small zones too.
- Expiry overwrite instead of max on stacking durations (MAL `battleShockTest`; DOW Blizzard).
- Two 3,700-decision games hit the 60 s cap: add per-game decision cap + stall detector from M1 (MAL
  commit c3b1f77 "AI-vs-AI games that never finish").
- Corner move-candidate edge case in `phases/movement.ts` (MAL open issue); AI that ignores faction
  abilities/stratagems.
- Engine not exporting a number the UI needs -> client computes it wrongly (MAL objective OC; save with cover).
- Hidden-info leaks: DOW commit a8a3b88 "Fix Gambling hidden-id leak" / 7c1d58a VIEW-022: the leak test must
  play every card that touches hidden info.
- Per-decision AI time budgets belong behind an env var from the start (CI runners are slow; WHI fe5ac4f).
- Old-edition rules leaking into prompts (WHI MK3 table). Add a "do not leak" table.

### UI
- Previous-roll target shown; UI arithmetic ignoring cover; dice tray behind the prompt (moved to the right
  rail); some rolls never reaching the tray; deploy panel hiding Confirm/Reset; formation clamp leaking out of
  the zone (clamp the group, not the centre); right/middle click starting a nudge; camera transitions >600 ms
  (all MAL; WHI Part I).
- Prompts that do not say what they are for ("this prompt doesn't say what it's for"): build self-explaining
  prompts with exact numbers on day one ("Boost? 2d6+7 vs DEF 14, 58% -> 83%"); retrofitting took ~8 MAL
  commits.
- Bot acting ahead of animations; bot proceeds only when presentation idle + 5 s watchdog (MAL 400 ms
  BOT_DELAY bug).
- Hard-coded two-faction logic (grep for `'orks'` later). Build a generic N-faction client and army picker
  from the start.
- Late additions the owner asked for: slim collapsible rails, in-game colour options, painter, drag movement,
  tooltips for terrain and buttons. Include them in the M3 slice.
- Start screen not fitting one screen at wide/short windows (MAL M9: art scales by height, 3-column setup).
- Hover jitter on the hand fan and missing card hover previews (DOW f3d7dfb).
- E2E: parallel 3D pages timing out (4 workers + 90 s timeout), flaky tests, exact-text picks.
- Bundle: one 1.6 MB chunk; code-split, AI in a Worker.

### Art/audio
- Every ranged weapon one sound (see 3.3); generated sounds never wired; ship the flavour map first.
- Loudness mismatched between factions: ship measure+trims with the first batch.
- Style words in prompts ("MGSD", "Gundam") producing the wrong proportions twice: plain-words only.
- Hunyuan style reference turning everything blue; floor-length capes breaking auto-cut base; blue refs.
- Procedural figures thrown away and v1 GLBs redone (MAL): lock the look with the owner at M3, through the
  full pipeline (2 concepts per side).
- Terrain GLBs at 12k tris hurt frame time (76-86 ms); decimate to ~6k; image-to-3D cannot do flat pieces;
  village pine bases too snowy for green mats.
- Weapon loadout mismatch (fused GLBs) never solved: plan sockets or per-loadout GLBs.
- Weak figures to expect: roughly 4 of 33 were vetoed in WHI (hades, nekane, valeria, pureblood, Tanith not
  real sculpt). Budget a redo step.
- Using the Mac Chrome for Gemini (images stranded, owner angry); clipboard paste incident.
- GW iconography left as playtest placeholder = debt (MAL); decide marking approach at M0 this time
  (originals from day one).

### Data/research
- Marking data "unverified" and shipping stand-ins after one source failed (WHI M9; memory `research-before-assuming`).
- Not trying Vassal first (DOW, found at the END of card research).
- Spec values contradicting data (MAL: terrain footprints violated CP-3.2: data authoritative, spec table
  stale). Keep ONE authoritative file per fact.
- Hook-enforcement notes that JSON schemas cannot express (MAL STATUS Data section): record them next to the
  code-hook list so the implementer sees them.
- Guard against copying prose: `tools/check-copied-text.ts` (DOW).

### Known gaps shipped (for scoping realism)
WHI shipped "not built" lists (Defenses, 3 command cards, Payload stepper, 4 small models, Sniper before roll,
spell racking). Prefer a smaller faction count with all rules done, then expand. Plan one faction-at-a-time
with verify loops ON (WHI w9-factions: 4 factions overnight worked, but needed 61 RULINGs and a stats-sourcing
follow-up M10).

---------------------------------------------------------------------------------------------------


## 8. Fast-start checklist for the StarCraft TMG port

1. Orient: `HANDOFF.md` (project root), then this file's sections 8 and 9, then `docs/spec/sources/SC-SOURCES.md`.
   Skim FELL `CLAUDE.md`, `STATUS.md`, `docs/spec/00-architecture.md` (contract change log section 10) and the
   FELL workflows `tools/workflows/{m1-data,m2-engine,m3-playable,m4a-bot,m4c-briefings}.js`.
2. Skeleton from FELL (not WHI directly): configs, deploy workflow, `.gitattributes`/`.gitignore`
   (`*.token*`, `Tokens.txt`, `tokens.txt*`, `.env*`, `docs/sources/`, `*.pdf`, `.claude/worktrees/`), engine
   contracts, client shell, `tools/{sim,sim-core,ai-bench,validate-data}.ts`, audio manager. Strip the Fallout
   rules (d20/d12 dice, ruler colours, AP, official AI cards). New dev port (FELL 5191, DOW 5181: pick 5201).
3. Pull squad mechanics from MAL (see 9.4 mapping table): unit = N models with coherency, wound allocation,
   AI model removal by coherency cost, objective control by models in range (StarCraft scores by Supply in
   range), reserves/arrival, multi-weapon squad panel, dice tray options, true control-zone rings.
4. Download every free official PDF yourself into gitignored `docs/sources/` and extract with PyMuPDF to the
   scratchpad (no pdftotext/poppler on this PC). Ask the owner on day one whether they own the physical sets or
   any printed material (FELL lost a whole M4b rebuild waiting for a book the owner had).
5. M0: specs + JSON schemas + checklist IDs + frozen contracts + skeleton on Pages. Golden test = the Quick
   Start's worked example. Dry-run the data schema on every Founders Edition unit before freezing it.
6. M1 data, M2 engine, M3 playable slice on Pages (random bot, procedural figures, briefings and objective
   tracker INCLUDED). Stop for the owner's playtest/figure gate. M4 utility AI (verify ON, bench >=95% vs random).
7. After every stage: typecheck, test, validate:data, sim, regenerate STATUS.md (don't append), commit
   `M<n>: <what>` + current model's Co-Authored-By, push; screenshots. Grep for the owner's real name and home
   path before each commit.

---------------------------------------------------------------------------------------------------

## 9. New lessons since 2026-10-11 (FELL M0-M4c, BT M0-M8a, MAL after 10-05)

### 9.1 Pace and process
- **Speed reference.** BT ran M0-M8a in ONE day (18 commits, M3 alone +15.5k lines). FELL: M0 to M3 playable in
  ~3 h of wall clock (M0 13:04, M1 data 14:20, M2 engine 15:02, M3 16:05 on 10-11), M4 bot overnight, M4b/M4c
  the next day; 23 commits in ~28 h. Target a playable Pages slice on day one.
- No project records tokens per milestone; the only budget is ~2.5M per push. Reference points (BT brief B.1):
  MAL specs ~1.2M, engine core ~0.5M, data with verify ~2M; ~2M wasted on worktree agents blocked from writing.
- **One workflow script per milestone** (FELL `tools/workflows/`): root passed as `args.root` (never typed into
  the repo), Sonnet implementers, `effort:'high'` for design/integrate/verify, a 300-token RESULT schema.
  Shapes that worked:
  - `m2-engine`: one high-effort foundations agent writes the contracts, then 4 Sonnet rules owners, then one
    integrate agent. Unimplemented protocol bodies throw `TodoError` (reported E_TODO), so fan-out is safe.
  - `m3-playable`: scenarios agent -> client-core (high) -> 4 Sonnet owners (board+figures, interaction, ui,
    dice+start).
  - `m4a-bot`: design -> build -> up to 3 bench/tune rounds -> 3 verify lenses -> fix agent.
- **Reusable verify/fix pattern** (FELL `m4b-resume.js`, `m4c-briefings.js`): FINDINGS schema with an `owner`
  enum, findings grouped per owner, one fix agent per owner that may refute a finding, then a Sonnet "final
  gate" agent that runs typecheck/test/validate/build/sim/playwright and takes screenshots. Copy as-is.
- **Paste the owner's complaint verbatim** into COMMON as "OWNER FEEDBACK driving this stage", and declare
  "FROZEN SHAPES" (TS interfaces) inline so parallel agents code to the same types (FELL m4c).
- **First-time-player review agent** (FELL m4c): starts Vite only if the port is not up, runs Playwright at
  1280x800 from a scratch dir, reports usability findings, never edits.
- Out-of-scope findings go to `tools/out/m<n>-followups.md` grouped by work package (BT).
- **Rules-check pass after factions land** (MAL 8622426): 282 rulings re-checked -> 243 confirmed, 32 wrong,
  7 unclear; wrong ones fixed in 6 parallel branches by rules area, each with a review-fixes commit.
- Owner check-in: a "Morning summary (owner)" block at the top of HANDOFF.md with numbered questions, the
  figure-gate question first (BT).
- **Answer before building**: when the owner asks questions, reply with a <=10-line plan and wait for a go
  (owner memory, 10-11).

### 9.2 Mistakes (new)
- **Building a rules-dense system from fan sources, then redoing it from the primary book** (FELL M4b built
  twice: ddbdf00, then 4175c95/672125d). Secure the primary source first; ask the owner for books early.
- **Moving the project folder mid-workflow** (FELL 57522c9 parked a partial decider; it needed a separate
  resume workflow and a merge). Commit at stage boundaries; never move folders while a run is live.
- **STATUS.md appended, not rewritten**: stale sections contradicted new ones. Regenerate per milestone.
- **sim/validate-data/ai-bench not copied** because they were game-coupled; rebuilt later at cost. Copy and
  strip them at M0.
- **Box scenarios typed from spec summaries all ended in draws**; re-entered from the PDF, 0 draws (FELL M2/M3).
  Enter scenarios and missions from the primary PDF.
- **Benchmarking on a matchup you keep rebalancing** (BT M8a dropped 19/20 -> 16/20 only because the intro
  forces changed). Bench on a fixed mirror plus the box matchup.
- Repo hygiene (MAL root): untracked `elevenlabs.token.rtf` because `.gitignore` had `*.token`, not `*.token*`;
  a mangled directory named after a Windows Temp path with stripped backslashes (quote paths, use forward
  slashes); stray stash entries.
- Textured weapon paint was blocked by Windows Smart App Control on the GPU PC (FELL ae59c36), so weapons
  shipped as flat tints. Check this blocker before planning a paint stage.

### 9.3 Engine and AI
- Contract changes stay additive and logged (FELL 00-architecture s10). Action kinds `<namespace>.<verb>`, one
  owner module per namespace. Scenarios are data (`src/engine/scenarios/`) with `objectiveStatus(view)` feeding
  a client tracker.
- Sim gates seen: FELL 50 games, 0 errors, 1.4 ms max step; BT 30/30 complete, 0 invariant violations.
- **One generic mechanism per concept, planned at M0**: for StarCraft, one damage pipeline, one visibility model
  (burrow/cloak/hidden/detection), one transport container, one reserve/arrival queue.
- **Every code hook needs a test proving it fires in a real game**; `validate-data` rejects unregistered hook
  names; BT `HOOK_WIRING` lists call sites (WHI registered plugins that were never called).
- **Zero-cost reactions loop forever** (MAL c3b1f77): one reaction per window; stall cap 2000 decisions (a
  normal game is ~500).
- **Engine reports the die face actually needed**, and "No save possible: needs 7+" instead of a blank die
  (MAL 85e4cfc, 854a260). **Cover/visibility is per viewer**, shown live in the move preview (MAL b7d5a70).
- **Large bases**: no non-flying vehicle/monster may deploy even partly inside blocking terrain; biggest bases
  deploy first; `npm run probe:deploy` checks every pairing deploys with 0 trapped (MAL 4e2c3c0). StarCraft has
  80/100/150 mm bases (Siege Tank 150 mm).
- **Coherency is an AI problem**: score model removal by coherency cost; never pull a middle model out of a line;
  the end-of-turn cull removes strays and spares leaders (MAL 477349d).
- Previews must match what the pipeline lands: Monte Carlo test of `expect.ts` over 2000 seeds (BT M8a).
- Rendered terrain must match rules geometry (ruin walls stretched to rules walls, floors at rules height,
  a terrain-fit e2e; model y snapped to the surface) (MAL e09fac2, 0152bc0).
- **AI numbers**: FELL normal 95-98% vs random (gate >=95%), easy ~80% (gate >=75%), ~25 ms/decision vs a
  150 ms budget; BT normal 19/20, easy 12-18/20, move p95 110-290 ms vs a 300 ms target, 3 s worker timeout.
- FELL bench harness `tools/ai-bench.ts --games --seed --a --b --scenarios`: alternates seats, draws count as
  non-wins, one JSON line out. Three verify lenses: legality/robustness; hidden info and contract (view only,
  no `state.rng`, `deriveSeed`); strength/behaviour (walking into open fire, ignoring kill shots, wasting actions).
- BT AI audits every normal-tier move for "no shot" and "back to the threat", and keeps re-scoring the best
  shooting spots. Hold the bot until figures have loaded (MAL 25bfe09).
- Official AI card systems (FELL spec 18) are a separate decider in `src/ai/official/` reusing `query.*`;
  seeded per-activation rolls via `deriveSeed(seed, tag, round, id)` survive reloads. StarCraft has NO official
  solo mode that we found, so our bot is the only opponent: all the more reason it is the product.

### 9.4 StarCraft mechanic -> where to copy from
(Mechanics from the preview rules and reviews; confirm every line against the June 2026 PDF + 10.2026 changelog.)

| StarCraft TMG concept | Closest prior code | Notes |
|---|---|---|
| Squad of N models, ~3" coherency | MAL units/coherency, formations deploy | AI removal by coherency cost (9.3) |
| Phases Movement/Assault/Combat/Scoring, alternate one unit at a time, first to pass takes First Player | WHI/FELL turnflow + pending | phase loop with pass tracking |
| D6 only: RoA dice vs Hit, then Armour/Evade rolls, Dmg with carry-over | MAL dice/attack/damage pipeline | one pipeline; tray shows the working |
| Surge die (bonus hits ignoring armour on tag match Light/Armoured/Biological) | MAL re-roll/extra-dice offers | engine owns the odds preview |
| Supply Pool grows per round; units start in reserve | MAL reserves/deep strike | arrival as one queue |
| Objectives scored by most Supply in range | MAL objective control (OC) + true control-zone rings | Supply drops as models die |
| Minerals buy units/upgrades; Gas (~10%) buys Tactical Cards | MAL army builder / stratagems; DOW card DSL | cards as declarative JSON + `{code}` |
| Burrowed/Hidden untargetable, cloak, detection | DOW view.ts if anything is secret; else one visibility mechanism | per-viewer badges |
| Missions by card draft | FELL data-driven scenarios + briefings | enter from the PDF |
| Large monsters/vehicles 80-150 mm | MAL large-base deploy probe; BT split GLB rigs | turret/limb nodes |
| 32/50/80/100/150 mm round bases, inches, 36x36 (small) / 54x36 (standard) | WHI/FELL geometry | 1 unit = 1 inch |

### 9.5 Client/UI
- **Ship new-player aids with the FIRST playable** (FELL owner, quoted in m4c-briefings.js: the game told them
  nothing about the scenario and felt unfriendly): per-scenario briefing modal + Briefing button, live
  objective tracker, 3D labels over objective markers, start-screen previews, first-turn hints.
- "Make the table the hero": slim translucent rails collapsing to icon tabs, unit card on demand (FELL m3p).
- **No native `title=` tooltips**: one shared `Tooltip.tsx`, enforced by `tests/client/noNativeTooltips.test.ts`
  (MAL d501056).
- Status icons over units that don't jitter: reuse the last layout until something moves; break ties by unit id
  (MAL 42a7b1d, 8aa02da). StarCraft needs burrowed/cloaked/detected/transported icons.
- Dice presentation options in Settings: quick tray, 3D throw onto a mat, dice on the battlefield; totals strip;
  the tray shows the working; `dice.html` test page (MAL 3fb551e, e98ae90, a74cbc5).
- Weapon panel for multi-weapon squads: hold/split fire, per-model profile choice; reactions offer only weapons
  in range with LOS (MAL 2dd2e80, 35a5ed3).
- Unit-card hover = full datasheet; hovering the card makes the unit's figures glow (MAL 03c5d23, 7ce5f99).
- BT extras worth copying: threat overlay (T), AI trace panel, follow-action camera, end screen with per-unit
  mini sheets and Rematch, skirmish picker with "AI picks a force" within 10% of points.
- The built-in browser pane cannot drag three.js models: use Playwright `page.mouse` with >=10 steps. Measure
  fixes inside a `?scenario=` position ("N of M models can fight"); the owner judges by playing, not by tests.
- Pages: fell-in (dev 5191), warmechforge (Vite default 5173; Playwright `PW_PORT=4183` to dodge a busy port).

### 9.6 Art and audio
- **Split GLBs for large models** (BT 6d7390c, 30-figures s7): a bpy finalize step cuts fused GLBs at per-slug
  planes into nodes (`lower`/`upper`, `armL`/`armR`); `buildGlbRig` reports capabilities and degrades
  gracefully. StarCraft: split the Siege Tank turret, Goliath torso, big Zerg limbs; squad models stay one node.
- **STARCRAFT FIGURE STYLE = MGSD (owner, 2026-10-13). This overrides sections 3.1, 6 and 7 and FELL/BT
  CLAUDE.md, which ban the word MGSD and ask for 4-5 heads.** The owner wants the Mallet/Whirr MGSD look; it
  "didn't take" in FELL because FELL inherited the WHI 2026-10-07 "less SD, more detailed" rule (4.5 heads,
  MGSD banned) and Gemini drifted to ~6-7 heads. It also suits StarCraft: the video game's in-game units read
  as chunky, big-headed, oversized weapons from the top-down camera.
  - Target: about 2-2.5 heads tall; head/helmet ~40% of height, as wide as the shoulders; tiny torso; short
    stubby legs with big chunky feet; short arms, oversized hands and weapons; Master Grade hard-surface detail.
  - Approved Mallet prompt (MAL memory `mgsd-proportions`, image `MAL/art/unit-concepts/mgsd-tests/
    mgsd-test-gk-librarian.png`): "super-deformed SD Gundam style model kit figure (Bandai MGSD line) of <unit>.
    Proportions like an SD Gundam: about 2 heads tall in total. The helmeted head is enormous, as tall as the
    torso and legs combined, and as wide as the shoulder pads. Small torso, tiny stubby legs with large chunky
    feet, short arms with big oversized fists. Crisp Master Grade hard-surface panel lines ..." + "no lettering
    or text on the model". For Zerg/Protoss creatures adapt: head/carapace enlarged, limbs shortened and chunky.
  - Gemini method that held the look in MAL: one clean base figure per faction in a fresh chat, then make each
    variant by editing that image ("start from image N, keep everything, change only X"). New free-text
    prompts in follow-ups drift back to normal proportions.
  - Check the IMAGE, not the prompt: head size and leg length on every concept before Hunyuan3D; reject
    duplicate weapons, extra limbs, lettering, cropped bases. Show 2 concepts per side at the first figure gate.
  - Measurement uses the base, never the mesh, so MGSD figures change nothing in the rules.
- BT's owner asked why placeholders were still showing after approving the gate: wire approved figures promptly.
- Terrain variant pools picked from the game seed; baked de-tiled ground mats (BT 09f5f3f, 55880e7); a CC0 Poly
  Haven ground mat tiled with a macro tint is a cheap win (FELL bd13ce8); occluders fade only when they block a
  sight line (BT c421ba2).
- HunyuanVideo victory/defeat cinematics (~0.5-0.7 MB mp4) vs AI only, with Skip (MAL 41d2925; no pipeline doc).
- **Make-up gain is allowed** (BT 72062c3): targets SFX RMS ~0.165, voice ~0.14, UI ~0.08; gains capped at 4
  behind a limiter. Music director (BT 500c54d): title 75 s, two 150 s battle loops alternating, 12 s
  victory/defeat stingers, 2 candidates per slot auditioned on sounds.html; ~9.9k credits (SFX + voice 756).
  Confirm with the owner before >5k credits.
- A test fails if any weapon lacks a sound flavour (BT `weaponFlavour.ts`). Regenerate only the ids the owner
  names. FELL M3 shipped procedural Web Audio only as a placeholder: fine for a first slice.

### 9.7 Research
- Open-source routes failed for FELL's gaps (Reddit 403, BGG XML 401, Fandom api empty, the app bundle had no
  data); the BGG image API and Shopify product JSON via curl worked. The gap closed only when the owner supplied
  the book. StarCraft is easier: the publisher posts the rules, FAQ, changelog, cost table and card sheets free.
- Keep an **edition/source leak list** in every rules prompt. StarCraft: the video game's RTS numbers (unit HP,
  build times, upgrades) and the beta/preview rules (wargamer how-to-play, demo reviews), superseded by the
  June 2026 PDF and the 10.2026 changelog/cost table.
- Audit keywords against the published source (MAL b0d5068: 19 datasheets missing GRENADES, so a stratagem was
  never usable). StarCraft tags (Light/Armoured/Biological/...) drive Surge: audit them.
- Licensed/community data (BattleScribe files, fan builders) is a cross-check aid only; never commit it.
- Rulings counts for scale: FELL 120 (79 Unsourced, 17 Confirmed, 14 Corrected), BT 150, MAL 282 re-checked.

---------------------------------------------------------------------------------------------------

## 10. Kickoff questions and the owner's answers (StarCraft / Not Enough Minerals, 2026-10-13)

**How the owner wants to be asked.** At kickoff the owner said "give me all of your clarifying questions,
your requests for approval, and anything else you'd need" before an overnight unattended run, then asked
for them **through the question API (AskUserQuestion), not as a chat list**. Batch them up front: 4 questions
per call, 2-4 options each, recommended option first. A dismissed question set may be an accident, so re-ask
it when the owner says so. Ask everything once, then run all night without stopping.

**The answers (use these as defaults for the next port; re-ask only the per-game ones marked \*):**

| # | Question | Owner's answer |
|---|---|---|
| 1\* | Title pun and repo slug | Picked their own: "Not Enough Minerals - Tabletop Miniatures Game", slug `not-enough-minerals`. Offer puns, but expect the owner to write in their own. |
| 2 | Multi-agent workflows overnight, and how big? | Yes, up to 15 agents per workflow. |
| 3 | Token ceiling for an overnight run | ~12M total (about 2.5M per push). |
| 4 | Downloads | All approved: official free PDFs, community data clones (cross-check only), CC0 textures/HDRIs, **and reference images of the real miniatures from web image search** (owner added this). |
| 5\* | Does the owner own the physical sets/rulebook? | None for StarCraft. "Authorized to use web searches and research to get what you need." |
| 6 | Stop at the M3 playtest/figure gate while the owner sleeps? | No: keep going to the M4 utility bot; put gate questions in the morning summary. |
| 7\* | Factions in the first night | Owner pushed back on a two-faction slice ("what about protoss?"): **make every faction playable in the first run**, starter box first, then the rest. Plan for all factions from M0. |
| 8 | Figures overnight | Concepts + 3D for 2 figures per faction, wired only if they pass the proportion check; procedural fallback stays. Gemini via Claude in Chrome (owner leaves Chrome signed in with the extension connected); local SDXL/Flux as fallback. Owner pre-approved SDXL/Flux/Gemini/Hunyuan for anything. |
| 9 | Audio budget | SFX + music up to 5k ElevenLabs credits without asking. Key in a `tokens.txt*` file in the project root (gitignored) or `../WarMForge/Tokens.txt` as `EL=<key>`. |
| 10 | Unclear rules overnight | Log a RULING, use the most literal reading of the primary rules + latest errata, keep going. |
| 11 | Slice setup | The starter box matchup on the small table, bot at Normal + Easy, original faction emblems, fan-project notice. |
| 12 | Phone notifications | Two: when playable on Pages, and when the run stops. |
| 13 | Permission mode | Stays in auto mode; request keep-awake for the session. |

**Process notes from this kickoff**
- Rename the project folder by **copying** it to the new name and moving the session with `change_directory`
  (a live session cannot rename its own working directory on Windows). Leave the old folder for the owner to
  delete.
- Record the answers in HANDOFF.md ("Kickoff answers ... do not re-ask") before starting work.
- The SC-SOURCES `files/downloads/` URLs are all correct, but starcraft-tmg.com sits behind a **Cloudflare
  waiting room**: rapid curl bursts get a 22,770-byte HTML page with HTTP 200. Check every download starts
  with `%PDF` and retry with a 20 s backoff (all 12 PDFs landed that way). The downloads index page itself is
  behind the waiting room too.
- Claude in Chrome may default to the owner's **Mac** browser: `list_connected_browsers`, then
  `select_browser` the Windows one (onThisComputer) before any Gemini work. The first screenshot of a freshly
  opened Gemini tab can time out while the page is still loading (the window was visible); retry after a few
  seconds, and use `get_page_text` meanwhile.
- Overnight Gemini (2026-10-13, NEM batch 2): after ~1 h the Windows session showed `lockapp.exe` and the Gemini tab
  reported `visibilityState=hidden`; Gemini's "+" upload menu then stopped opening, so reference uploads stalled.
  Keep-awake does not stop the screen lock. The agent then tried a synthetic paste event to inject files and auto
  mode's safety check blocked it (correctly: it is a clipboard-paste workaround). Plan Gemini batches for when
  the owner is at the PC, or ask the owner to disable the screen lock for overnight runs; fall back to local
  SDXL img2img from an approved concept.
