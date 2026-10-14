# Handoff: StarCraft: Tabletop Miniatures Game port (6th tabletop-to-browser port)

Written 2026-10-13 at kickoff. Start a new Claude Code session opened on THIS folder. Read this file, then
`docs/KNOWLEDGE-BASE.md` sections 8 and 9 (sections 1-7 only when a task cites them), then
`docs/spec/sources/SC-SOURCES.md`. Nothing else exists yet: no repo, no code, no CLAUDE.md.

Folder name `StarCraft-TMG` is a working name. **Rename it once, to the chosen title, BEFORE `git init` and
before any workflow runs** (FELL lost a run to a mid-workflow folder move, KB 9.2).

## Owner decisions already made (do not re-ask)
- **Figures: MGSD style** (owner 2026-10-13), the Mallet-42k / Whirr Machine look, which also matches how
  units read in the StarCraft video games. About 2-2.5 heads tall, huge head/helmet, stubby legs, chunky feet,
  oversized hands and weapons, Master Grade hard-surface detail. The approved Mallet prompt and Gemini method
  are in KB 9.6. This OVERRIDES the "no MGSD wording, 4-5 heads" rule in the FELL/BT CLAUDE.md and KB 3.1/6/7:
  do NOT copy that rule into this project's CLAUDE.md.
- Carry-overs that held in all five ports (KB section 6): mechanics 1:1; Mallet IP posture (real unit/card
  names OK, ALL prose in our own words, no publisher art/icons/logos/trade dress, "unofficial fan project, not
  affiliated with Archon Studio or Blizzard Entertainment" in the README and UI); player vs AI first,
  multiplayer on hold; public repo, Pages from `main`, push after each stage pre-approved; **the AI opponent is
  the product** (no official solo mode was found, so our bot is the only opponent); lean mode, playable first,
  check-ins of 10 lines or fewer with screenshots; Windows GPU PC does all asset work (Gemini via Claude in
  Chrome on the PC, Hunyuan3D, ElevenLabs), never the Mac or the built-in browser for Gemini; never paste into
  Gemini via the clipboard; credit **evilgouki**, never the owner's real name or a `C:\Users\<name>` path.
- ElevenLabs key: `..\WarMForge\Tokens.txt` as `EL=<key>`, strip the prefix, pass only via `ELEVENLABS_API_KEY`.

## Kickoff check-in (send first, ONE message, 10 lines or fewer)
1. Title pun + repo name. Offer three, e.g. "Star Draft" (missions are card-drafted), "Scar Craft",
   "StarCrafty"; the owner picks, then rename the folder.
2. Blizzard markings: confirm faction emblems (Terran/Zerg/Protoss), unit portraits and the logo all become
   our own original markings (same as Fallout's Vault Boy/Nuka-Cola treatment).
3. First slice: recommend the **Two-Player Starter Set, Founders Edition (Terran vs Zerg)**, then the Protoss
   faction starter, then Wave 2 (Siege Tank, Immortal, Ravager, Zeratul).
4. Does the owner own the sets, cards or the printed rulebook? Photos of cards close gaps fast (KB 9.2).
5. Token ceiling (default: about 2.5M per push) and music budget (confirm before more than 5k credits).

## Plan (KB 5.1 order, with the FELL pace as the target: playable on Pages on day one)
- **M0 bootstrap + spec.**
  - Copy the FELL skeleton per KB section 8 step 2, including sim, validate-data and ai-bench, stripped of
    the Fallout rules.
  - Write CLAUDE.md from FELL's, swapping in the decisions above.
  - `.claude/launch.json` dev entry on port 5201.
  - Download all free PDFs from https://starcraft-tmg.com/downloads into gitignored `docs/sources/` yourself
    (core rules, Quick Start, FAQ, Changelog 10.2026, Cost Table 10.2026, wave 1+2 card sheets) and extract
    them with PyMuPDF.
  - Write specs 00-60 and the rules checklist with IDs. The changelog and cost table override the rulebook.
    Put the leak list from SC-SOURCES.md in every rules prompt.
  - Skeleton on Pages.
- **M1 data.**
  - Dry-run the schema on every Founders Edition unit and tactical card, then freeze it.
  - Enter the starter units and cards, each with a `source`. Cross-check against the BattleScribe files
    (stemlerm/starcraft-tmg), never commit them.
  - Verify loops ON for the data batches.
- **M2 engine.**
  - Phases Movement/Assault/Combat/Scoring with alternating activation and pass.
  - D6 attack pipeline with Surge and damage carry-over.
  - Squads with coherency (copy the shape from MAL, KB 9.4).
  - Supply pool, reserves, Supply-in-range scoring.
  - One visibility mechanism for burrow/cloak/detection, one transport container.
  - Golden test = the Quick Start's worked example. Headless sim with invariants and a 2000-decision stall cap.
- **M3 playable slice on Pages.**
  - Founders Edition armies with procedural MGSD-ish placeholders, random bot, odds previews, dice tray.
  - **Scenario briefings, objective tracker and control-zone rings from day one** (FELL's owner complaint,
    KB 9.5).
  - Stop for the owner's playtest and figure-look gate: 2 MGSD concepts per side through the full
    Gemini -> Hunyuan3D pipeline.
- **M4 utility AI.** Verify ON. Bench at least 95% vs random on a fixed mirror plus the box matchup. Owner plays
  3 games.
- **Then:**
  - M5 art: MGSD figures; split GLBs for the Siege Tank turret, Goliath and big Zerg, KB 9.6.
  - M6 audio: flavour map + measure/trims with the first batch, sounds.html audition, music director.
  - M7 polish.
  - M8 terrain (Lost Temple style).
  - M9+ Protoss and Wave 2.
  - A rules-check pass once factions land (KB 9.1).

## Open source gaps (do the legwork before asking)
Not found yet in the free rules: detection, transports, game length, morale. They are probably in the full PDF;
confirm after extraction. The official app (sc.starcraft-tmg.com) is login-gated. We do not create accounts,
so ask the owner only if a value exists nowhere else.

## Kickoff answers (owner, 2026-10-13 night; do not re-ask)
- Title **Not Enough Minerals - Tabletop Miniatures Game**; repo/folder slug `not-enough-minerals`.
- Workflows approved, up to 15 agents each. Overnight token ceiling ~12M.
- Downloads approved: official free PDFs, BattleScribe clone (cross-check only), CC0 textures/HDRIs, reference
  images of the miniatures from web search. Web research authorized for anything needed.
- Owner owns NO physical sets/rulebook: free PDFs + research only.
- Skip the M3 stop: continue to the M4 utility bot; gate questions go in the morning summary.
- First slice: Founders T v Z on 36x36, bot Normal + Easy, original emblems, fan notice. **Then Protoss
  playable too** (faction starter: Zealots, Adepts, Sentries, Stalkers) the same night.
- Figures: 2 MGSD per race (Marine, Raynor; Zergling, Kerrigan; Zealot, Stalker) via Gemini in Chrome ->
  Hunyuan3D, wired only if proportions pass; procedural fallback. Local SDXL/Flux if Chrome is unreachable.
- Audio: SFX + music, up to 5k ElevenLabs credits.
- Unclear rules: log a RULING, use the most literal reading of R + CL/CT/F, keep going.
- Push notifications: one when playable on Pages, one at stop. Session stays in auto mode.

## Owner feedback queue
- 2026-10-13 terrain (verbatim intent): "not in love with the terrain - it's too simple and not shiny, we need more
  war-torn and hurried construction builds, like in war time." Second terrain pass planned later tonight:
  battle-damaged, improvised wartime fortifications (sandbags, scrap-plate walls, cratered bunkers, wrecked
  vehicles, scaffolding), richer detail and specular/metallic sheen. Do not start until the owner says go.
- **Where: the owner's Alienware Aurora R11** (owner 2026-10-13: "I want to test how fast it is"). Record wall-clock
  per stage there (concept, cutout, shape, paint, finalize per piece) and compare with this PC's RTX 5080 (~90 s
  shape and ~20 s paint per model; batch 5 = 10 figures in ~25 min end to end). Put the numbers in KB section 10.

### Terrain pass v2: status (2026-10-13 evening, on the R11 "Alteisen")
- **Done: outpost set (12 pieces)**. Gemini concepts in `art/terrain/concepts/` (prompts in `PROMPTS.md`), Hunyuan 2.1
  shape + 2.0 paint, fitted and graded by `tools/models/terrain/t_fit.py`, in `public/assets/terrain/outpost-*.glb`
  (same slugs and manifest rows; the procedural v1 files are in `art/archive/terrain-v1/`). Contact sheet
  `art/terrain/contact-outpost-v2.png`, in-game `screenshots/terrain-v2-outpost-board.png`. R11 timings: KB 10.1.
- **Owner gate**: does the outpost look land ("war-torn, hurried, shiny")? Known soft spots: the blast wall is still a bit
  smooth, the barricade and gate fence are stretched ~2.2x in height to the 1.6 in rules height.
- **Done: temple set (11)**, 2026-10-13 late: `art/terrain/contact-temple-v2.png`, `screenshots/terrain-v2-temple-board.png`.
  The texture grade in `t_fit.py` is per theme now (sandstone went orange with the outpost grade).
- **Done: crystal (11) and creep (10)**, 2026-10-14 early. **All 44 terrain slugs are now Hunyuan models**; the
  procedural v1 files are in `art/archive/terrain-v1/`. Contact sheets `art/terrain/contact-{outpost,temple,crystal,creep}
  -v2.png`, boards `screenshots/terrain-v2-*-board.png`. Owner gate: does the whole pass land? Known soft spots:
  `creep-sac-hall` is a near-twin of `creep-spore-nest`; crystal walls stretch 2.6-3.5x in height; some bases render
  with pale speckle (paint de-lighting). Gemini caps image generation at roughly 30 images per evening.
- **How the sets were made (for redos)**: crystal (mining camp: rigs, scaffolds and plate barricades among mineral clusters), creep (overrun
  Terran fortifications grown over with creep). Slugs and footprints are the existing ones in `manifest.json`; add each
  to `tools/models/terrain/pieces.json` with a prompt, then follow `tools/models/terrain/` stage order: concepts
  (Gemini + `receiver.mjs`) -> `t_cutout` -> `t_shape --offload` -> `t_paint` -> `t_fit <art/terrain/staging>` ->
  `node tools/models/optimize.mjs --dir art/terrain/staging` -> `node art/terrain/shot.mjs <set> 0.3 0.6 -
  /art/terrain/staging/ <png>` (set `MSYS_NO_PATHCONV=1` in Git Bash) -> `git mv` old GLBs to `art/archive/terrain-v1/`
  and copy. `art/terrain/gen-terrain.mjs` now skips every slug in `pieces.json`, so rerunning it keeps the Hunyuan GLBs.

### Terrain pass on the R11: what the new session needs
- Repo: `git clone https://github.com/dragoonant/not-enough-minerals`, then `npm ci`; dev server `npm run dev -- --port
  5201`. Read this file, CLAUDE.md, STATUS.md, KB sections 3.2 (terrain), 9.6 and 10.
- Current terrain (to replace): 16 GLBs in `public/assets/terrain/` + `manifest.json` `{slug: {file, size:[w,d,h],
  rulesType, theme, footprint}}`; concepts and contact sheets in `art/terrain/`. The client fits each GLB to the
  engine footprint (`src/client/board/terrainFit.ts`, `terrainGlb.ts`; debug `?terrain=procedural`). The engine's
  piece shapes come from `src/engine/terrain.ts` (generateTerrain: building 6x4 and 5x5, obstacle 5x1.2 and 3x2,
  obstruction circle r1.7, plus the demo table pieces). New models must keep origin at the bottom-face centre, long
  side on +x, y up, ~6k tris, then `node tools/models/optimize.mjs --dir <scratch>` (never on a live folder).
- Hunyuan3D is NOT in the repo. On the 5080 PC it lives in `%USERPROFILE%\Hunyuan3D-2` (Python 3.11 venv: SDXL
  concepts, cutout, paint) and `%USERPROFILE%\Hunyuan3D-2.1` (Python 3.10 venv: shape, finalize, `nem_fit.py`), weights
  in `%USERPROFILE%\.cache\hy3dgen` (on the 5080 PC: 2.0 folder 11 GB, 2.1 folder 6.8 GB, weights 48 GB; copying
  them by USB drive or LAN beats re-downloading). The R11 needs its own install of both, plus our stage scripts
  (`stage_cutout.py`, `stage_shape.py` with SHAPE_SEED, `stage_paint.py`, `stage_finalize.py` with "fit",
  `terrain_*.py`, `nem_fit.py`). Pin transformers 4.48.3 / diffusers 0.32.2 in the 2.0 venv (KB 3.2).
- **Hunyuan3D install on the R11** (mirror of the working 5080 setup, checked 2026-10-13):
  1. Prereqs: NVIDIA driver with CUDA 12.8 support, Git, `uv` (`%USERPROFILE%\.local\bin\uv.exe`; set
     `UV_SYSTEM_CERTS=1`), Visual Studio 2022 Build Tools (C++ workload) + CUDA Toolkit 12.8 for the compiled paint
     extensions, Blender's `bpy` comes from pip in the 2.1 venv.
  2. `git clone https://github.com/Tencent/Hunyuan3D-2 %USERPROFILE%\Hunyuan3D-2`; venv Python 3.11; torch 2.11.0
     cu128 (`--index-url https://download.pytorch.org/whl/cu128`); `pip install -r requirements.txt`; pin
     `transformers==4.48.3 diffusers==0.32.2`; build `hy3dgen/texgen/custom_rasterizer` and
     `hy3dgen/texgen/differentiable_renderer` (`pip install -e .` / `python setup.py install` from a VS x64 Native
     Tools prompt). Import torch before custom_rasterizer (the kernel DLL loads from torch's lib).
  3. `git clone https://github.com/Tencent-Hunyuan/Hunyuan3D-2.1 %USERPROFILE%\Hunyuan3D-2.1`; venv Python 3.10; same
     torch; `pip install -r requirements.win.txt`; build `hy3dpaint/custom_rasterizer` (Windows kernel in
     `lib/custom_rasterizer_kernel_for_windows`) and `hy3dpaint/DifferentiableRenderer`.
  4. Weights: copy `%USERPROFILE%\.cache\hy3dgen` (48 GB: `tencent/`, `Tencent-Hunyuan/`, `sdxl/`) from the 5080 PC;
     HF symlinks fail without Developer Mode, so keep them as plain files.
  5. Copy our scripts on top of the clones: from Hunyuan3D-2 (`stage_cutout.py`, `stage_paint.py`,
     `stage_finalize.py`, `concepts_sdxl.py`, `terrain_*.py`, `finalize_model.py`, `units.json`, `picks.json`) and
     from Hunyuan3D-2.1 (`stage_shape.py`, `nem_fit.py`, `terrain_shape.py`, `terrain_finalize.py`,
     `torchvision_fix.py`). Smoke test: `smoke_shape21.py` in 2.1, then one figure end to end. the Claude in Chrome extension there and `select_browser` that machine; standing rules
  (no clipboard paste, hidden file input only) apply.

## Owner questions (fill in as they come up)
- (none yet)
