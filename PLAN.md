# Plan

Scope, decisions and milestones. `HANDOFF.md` holds the full owner decisions and kickoff answers; this file is the
working summary. Do not re-ask anything listed here.

## Owner decisions (2026-10-13)
- Title **Not Enough Minerals - Tabletop Miniatures Game**; repo and folder slug `not-enough-minerals`; Pages from
  `main` at `/not-enough-minerals/`; push after each stage pre-approved.
- Mechanics 1:1 with StarCraft: Tabletop Miniatures Game; Mallet IP posture (real unit and card names allowed, all
  prose our own, no publisher art, logos or trade dress; original faction emblems, portraits and logo; fan notice in
  the README and the UI). Credit **evilgouki**.
- Player vs AI first, multiplayer on hold. **The AI opponent is the product** (no official solo mode exists).
- Sources: the free official PDFs only (owner has no physical sets or rulebook). Changelog 10.2026 and Cost Table
  10.2026 override the Core Rules; the FAQ clarifies. BattleScribe data is a cross-check aid only, never committed.
- Unclear rules: log a RULING, use the most literal reading, keep going.
- First slice: Founders Edition Terran vs Zerg on 36 x 36 in, bot Normal and Easy, then the Protoss faction starter
  (Zealots, Adepts, Sentries, Stalkers) the same night.
- Figures: **MGSD style** (about 2-2.5 heads tall, huge head, stubby legs, oversized hands and weapons, Master Grade
  detail), KB 9.6. Two MGSD figures per race (Marine, Raynor; Zergling, Kerrigan; Zealot, Stalker) through Gemini in
  Chrome then Hunyuan3D, wired only if the proportions pass; procedural fallback.
- Audio: SFX and music, up to 5k ElevenLabs credits.
- Workflows approved, up to 15 agents each; overnight token ceiling about 12M.
- Skip the M3 owner stop: continue to the M4 bot; gate questions go in the morning summary.
- Lean mode by default; verify loops on for data batches and the AI.

## Milestones
- **M0 bootstrap + spec.** Skeleton from the FELL project (configs, deploy, engine contracts, client shell, sim,
  ai-bench, validate-data, audio manager) stripped of its rules; CLAUDE.md; launch entry on port 5201; free PDFs
  extracted; specs 00-60 and the rules checklist with IDs; skeleton on Pages.
- **M1 data.** Dry-run the schema on every Founders Edition unit and tactical card, then freeze it. Enter the starter
  units and cards, each with a `source`. Verify loops on.
- **M2 engine.** Movement / Assault / Combat / Scoring phases with alternating activation and pass; D6 attack
  pipeline with Surge and damage carry-over; squads with coherency; Supply pool, reserves, Supply-in-range scoring;
  one visibility mechanism (burrow, cloak, detection); one transport container. Golden test = the Quick Start's
  worked example. Headless sim with invariants and a 2000-decision stall cap.
- **M3 playable slice on Pages.** Founders Edition armies with procedural MGSD-ish placeholders, random bot, odds
  previews, dice tray; scenario briefings, objective tracker and control-zone rings from day one.
- **M4 utility AI.** Verify on. Bench at least 95% vs random on a fixed mirror and the box matchup.
- **M5 art.** MGSD figures; split GLBs for the Siege Tank turret, Goliath and large Zerg (KB 9.6).
- **M6 audio.** Flavour map, measured trims, sounds.html audition, music director.
- **M7 polish.**
- **M8 terrain.**
- **M9+ Protoss and Wave 2** (Siege Tank, Immortal, Ravager, Zeratul), then a rules-check pass once factions land.

## Progress (2026-10-17)
M0-M4 done; M5 art, M6 audio, M7 polish and M8 terrain done pending the owner's look and listen; M9 Wave 2 armies
playable (Expanded forces) and the rules-check pass applied. See STATUS.md "Not yet" for what remains.

## Open source gaps (answered 2026-10-16, `tools/out/rules-check-pass.md`)
Game length is on each Mission Card (R p.79 9.2.1); detection exists only on cards (plus F p.5); there is no general
transport rule, only forward-deploy cards; morale does not exist in this game.

## Open source gaps (original note)
Detection, transports, game length and morale were not found in the free rules summary yet; confirm after
extraction, log RULINGs, and ask the owner only if a value exists nowhere else.
