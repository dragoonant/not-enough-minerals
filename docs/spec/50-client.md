# 50: Client

React 19 + R3F 9 + drei + zustand, adapted from the base project's client (Fell-in) and the Mallet-42k client
(objective rings, dice tray, unit-card hover, status icons, weapon panel). The client never mutates `GameState`
and never computes a rules number: odds, TNs, Supply, control, visibility, reach and coherency come from
`engine/query.ts` or `pending.context`, reached only through `src/client/contract.ts`. It is generic over factions
(no faction id literals outside `src/data/`). **New-player aids ship with the first playable** (KB 9.5): briefing,
objective tracker and control-zone rings are M3 scope, not polish.

## 1. Modules (M0 state in bold)
```
src/client/
  **App.tsx, GameScreen.tsx, store.ts, params.ts, theme.ts, contract.ts**   shell, test hooks, palette, the one import surface
  **store/**        gameStore (true state, dispatch, preview dry run), launch, settings, autosave, testHooks
  **presentation/** director: event batches to timed beats; presentedStore trails the animations; cues, labels
  **board/**        Board (Canvas, lights, camera rig), Mat (procedural mat), Terrain (procedural pieces), layout
  **figures/**      Procedural.tsx MGSD stand-in on its base, glbLoader.ts, Figures.tsx (GLB with procedural fallback)
  **dice/**         DiceTray + diceView: every roll routes here
  **bot/**          botDriver, randomBot, aiWorkerClient
  **audio/**        manager, synth, cue sounds (M6 adds the ElevenLabs set)
  **ui/**           StartScreen, Hud, GameOver, styles
  interaction/     (M3) per-decision controllers, picking, Leading Model drag with ruler and formation preview
  ui/ (M3 adds)    Briefing, ObjectiveTracker, SupplyHud, ReservesTray, PhaseBar, OddsPanel, UnitCard, WeaponPanel,
                   EventFeed, Prompt, Tooltip, SettingsPanel, AiTrace
  vfx/             (M5)
```

## 2. Table, terrain and camera
- Mat sized from `scenario.table` (36 x 36 first; 54 x 36 later), procedural texture on a canvas (no binary assets
  at M3), our own palette in `theme.ts`. Rendered terrain matches the rules footprints and heights exactly; figure
  y snaps to the surface (KB 9.3).
- Entry Edges drawn as coloured strips on the mat edge; Zones of Influence as faint 6" bands (Red and Blue side
  colours from `theme.ts`, colour-blind safe: Red side also gets a hatch pattern).
- Camera presets in `board/Board.tsx`: overview, near seat, far seat, top down. The human's Entry Edge side is the
  near view (the card frame is never rotated, spec 00 s2). Right/middle drag orbits; a preset click resets.

## 3. Figures
- **MGSD look** (owner decision): about 2-2.5 heads tall, big head or helmet, stubby legs, chunky feet, oversized
  hands and weapons. The procedural stand-in (`Procedural.tsx`) already uses these proportions, coloured by side,
  on the unit's real base size (25-150 mm).
- `Figures.tsx` loads a GLB per unit profile from `public/models/<profileId>.glb` when the art pass has wired it,
  and falls back to the procedural figure on a missing file or load error (never an empty base). Split GLBs (turret,
  limbs) for Siege Tank and big Zerg arrive with M5.
- Status icons over each unit, stable layout (reuse the last layout until something moves; ties by unit id):
  Activation Marker face, BURROWED, HIDDEN, detected, STATIONARY, Shielded, SIEGE MODE, BUFF/DEBUFF, Out of
  Coherency, damage marker value. Icons are our own simple glyphs.

## 4. HUD (slim translucent rails that collapse to icon tabs; the table is the hero)
| Component | testid | What it shows (source) |
|---|---|---|
| PhaseBar | `phase-bar` | Round r of L, Phase name, whose turn, First Player Marker holder, who has Passed; the Pass button `pass-button` (`turn.pass` option) and Hold when offered. |
| SupplyHud | `supply-hud` | Per seat: Pool, on-table Supply, Available, next Round's Pool, VP (`query.supplyStatus`, `seat.vp`). |
| ReservesTray | `reserves-tray` | Units in Reserves with their Supply; ones that do not fit Available are greyed with the reason; click opens `deploy.go`. Units destroyed or lost are listed under it. |
| ObjectiveTracker | `objective-tracker` | Per marker: number, affinity colour, Activated face, contest totals per side, controller, VP if scored now; mission scoring lines and the special win condition (`query.objectiveStatus`, `missionScore`). |
| Briefing | `briefing`, `briefing-open` | Modal at game start and on demand: Mission and Deployment names, Game Length, Pool table per Round, how VP are scored, Entry Edges with a mini map, first-turn hints. Written in our own words from the mission data. |
| OddsPanel | `odds-panel` | For a hovered target or batch: dice, Hit TN, Surge tag match and expectation, Armour TN, Evade TN or "No Evade roll: not eligible", expected damage with the existing marker, kill odds, expected Supply removed (`query.attackPreview`). Charge: roll needed and its chance (`query.chargeOdds`). The face actually needed is always shown, never a blank die. |
| UnitCard | `unit-card` | On hover or select: the full datasheet from data (characteristics, weapons with keywords, Supply Profile, abilities, upgrades bought); hovering the card glows its figures. Every keyword has a Tooltip with our own one-line summary. |
| WeaponPanel | `weapon-panel` | Multi-weapon squads: one row per profile (one Batch each), the models that carry it and its valid targets. |
| EventFeed | `event-feed` | Narrated log lines from events. |
| GameOver | `game-over` | Winner, reason, VP breakdown per Round, per-unit mini sheets, Rematch. |

Native `title=` tooltips are banned: one shared `Tooltip.tsx`, enforced by `tests/client/noNativeTooltips.test.ts`.

## 5. Board overlays
- **Control-zone rings**: each Mission Marker gets a ring at the contest range (3" from the marker edge; radius from
  the engine constant, not a literal), coloured by `marker.controller`, pulsing when contested, with a 3D label
  (number, controller, contest totals). Removed or CLAIMed markers are drawn as off-table tokens.
- Movement: drag the Leading Model; a ruler shows the measured path length against Speed; the engine's formation
  placer previews where the rest go, with coherency links and a red mark on any model that would break coherency
  or end in the enemy's Engagement Range (`query.coherencyPreview`). Legality is the gameStore dry run.
- Visibility and cover are per viewer and live in the move preview: which enemy units can see the end spot, and
  cover from each (`query.canSee`, `coverFor`). Detection areas are drawn as 6" rings when relevant.
- Threat overlay (key T): enemy reach from `query.reachOf`. Templates: a ghost template at the cursor.

## 6. Dice tray (shows the working)
Every roll comes from engine events (`DiceRolled`, `atk.stage`). The tray shows the three pools in order:
Attack Dice against the Hit TN, the Surge Die in its own colour with the tag that matched (or "no match"), dice
moved to the Damage Pool by Surge or CRITICAL HIT, Armour Rolls with TOUGH changes, Evade Rolls, then the damage
line "old marker + new = total, models removed, new marker". Re-rolled dice are marked. Settings offer quick
tray, 3D throw and dice on the battlefield, plus a totals strip; `dice.html` is a test page.

## 7. Test hooks and testids
`?test=1&seats=human,bot&seed=&scenario=&tier=&speed=` (spec 00 s8). Stable testids: `start-screen`,
`start-button`, `fan-notice`, `game-screen`, `board`, `cam-<preset>`, plus section 4. The bot is held until
figures have loaded.

## 8. IP and branding
- Start screen and README carry the notice: "Unofficial fan project, not affiliated with Archon Studio or Blizzard
  Entertainment" (`fan-notice`), and credit evilgouki.
- **Original faction emblems**: three emblems of our own design (simple geometric marks in `theme.ts` as inline
  SVG), never the publisher's or Blizzard's logos, emblems, portraits, card frames or trade dress. Unit and card
  names may match the source; every description is our own words.

## 9. Pages and ports
Production base `/not-enough-minerals/`; asset URLs use `import.meta.env.BASE_URL`. Dev server on 5201
(`.claude/launch.json` `nem-dev`); Playwright previews on 5202 (`PW_PORT`).
