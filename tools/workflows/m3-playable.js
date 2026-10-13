export const meta = {
  name: 'm3-playable',
  description: 'M3: playable client on Pages (start/matchups incl. Protoss, board+MGSD figures, interaction, HUD with briefing/tracker/rings/supply/odds, dice tray, SFX), e2e full game, first-time-player review, fixes, gate',
  phases: [
    { title: 'Core', detail: 'client contract, store, launch options, bot driver, test hooks, frozen shapes' },
    { title: 'Build', detail: 'five Sonnet owners, disjoint folders' },
    { title: 'Integrate', detail: 'wire, full-game e2e, screenshots' },
    { title: 'Review', detail: 'first-time player + contract lens' },
    { title: 'Fix', detail: 'per-owner fixes' },
    { title: 'Gate', detail: 'all checks, STATUS.md, screenshots' },
  ],
}

const ROOT = args && args.root
const FELL = args && args.fell
const MAL = args && args.mal
if (!ROOT || !FELL || !MAL) throw new Error('pass args.root, args.fell, args.mal')

const COMMON = `Project root: ${ROOT} (ABSOLUTE paths; your shell cwd is a different old folder, never write there). Orient from ${ROOT}/STATUS.md and CLAUDE.md only. Game: "Not Enough Minerals - Tabletop Miniatures Game", unofficial fan port of StarCraft TMG.
OWNER FEEDBACK driving this stage (from earlier ports, KB 9.5): "the game told me nothing about the scenario and felt unfriendly" -> the briefing, objective tracker, control-zone rings, first-turn hints and a readable HUD are REQUIRED in this first playable, not polish. "Make the table the hero": slim translucent rails that collapse to icon tabs.
Specs: docs/spec/50-client.md (the law for the client), 00-architecture.md s3, s5, s6, s8. Reference clients (read-only, copy and adapt freely, the owner's own projects): Fell-in ${FELL}/src/client (briefing, tracker, interaction controllers, start screen, dice tray) and Mallet ${MAL}/src/client (objective rings, unit-card hover glow, weapon panel, status icons, dice presentation). Strip all Fallout/40k specifics.
The client never mutates GameState and never computes a rules number: odds, TNs, supply, control, visibility, coherency come from src/engine/query.ts or pending.context via src/client/contract.ts. Engine and data are FROZEN: report needed query additions in issues (the integrator adds them).
IP: all UI copy in our own words; original faction emblems (simple geometric SVG of our own), no Blizzard/Archon logos, portraits, card frames or trade dress; fan notice on the start screen.
Run long commands in the FOREGROUND. Never npm install (except the core agent if a dependency is truly missing), never git commit; never edit STATUS.md or package.json unless told. Never write the owner's real name or a C:\\Users\\<name> path into a repo file. Playwright: preview on port 5202 (PW_PORT); dev server 5201.`

const RESULT = { type: 'object', properties: { ok: { type: 'boolean' }, summary: { type: 'string' }, files: { type: 'array', items: { type: 'string' } }, issues: { type: 'array', items: { type: 'string' } } }, required: ['ok', 'summary', 'files', 'issues'] }
const FINDINGS = { type: 'object', properties: { ok: { type: 'boolean' }, findings: { type: 'array', items: { type: 'object', properties: { owner: { type: 'string', enum: ['C', 'P', 'I', 'U', 'D', 'E'] }, where: { type: 'string' }, problem: { type: 'string' }, fix: { type: 'string' } }, required: ['owner', 'where', 'problem', 'fix'] } } }, required: ['ok', 'findings'] }
const KEEP = 'Return the schema object; summary and each issue 1-2 sentences; under ~800 tokens overall.'

phase('Core')
const core = await agent(`${COMMON}
You are the M3 client architect. Read spec 50, 00 s3/s5/s6/s8, src/client/** (the M0 shell), src/engine/{index,query,types,setup}.ts and data/sc-2026-10/presets, missions, deployments.
Build the FROZEN client surface the five owners code against:
1. src/client/contract.ts: hooks/selectors (useGame, usePending, usePresented, useView, useQuery wrappers over every engine query incl. attackPreview, chargeOdds, supplyStatus, objectiveStatus, canSee, coherencyPreview, reachOf), game commands (submit, legal, newGame(opts), dryRun(action) for previews).
2. store/gameStore.ts (only apply caller; createGame from launch options; autosave per round with Continue; hot-seat), store/launch.ts: launch options = matchup (Founders Edition Terran vs Zerg DEFAULT; faction-starter pairings incl. Protoss: T v Z, T v P, Z v P, mirrors), mission + deployment (pick or random), seats human|bot (default human vs bot), bot tier, seed.
3. bot/botDriver.ts: random bot answers bot decisions only when presentation is idle and figures have loaded, 5 s watchdog; tier wiring left for M4 (AI time budget env var VITE_AI_MS).
4. presentation/: director turns engine events (moves, DiceRolled, attack stages, casualties, arrivals, scoring) into typed cues and beats; export the cue types.
5. params.ts test hooks: ?test=1 window.__game {getState, view, pending, legalActions, submit, pauseBots, setSpeed}; ?seats=; ?seed=; ?matchup=; ?mission=; ?speed=fast; ?gallery; ?fps.
6. GameScreen.tsx composes slots with FINAL export names and placeholder bodies: board/Board.tsx (P), figures/Figures.tsx (P), interaction/Interaction.tsx (I), ui/Hud.tsx (U), dice/DiceTray.tsx (D); StartScreen (D). Lazy-load GameScreen + engine/data.
typecheck/test/build green. In issues, FROZEN SHAPES: one line per owner (P board+figures, I interaction, U hud, D dice+start+audio) naming the contract exports, cue types and testids they use. You own ONLY: src/client/{contract.ts,store/**,store.ts,bot/**,presentation/**,params.ts,GameScreen.tsx,App.tsx}, the placeholder files, tests/client/core*.test.ts. ${KEEP}`,
  { label: 'client-core', phase: 'Core', schema: RESULT, effort: 'high' })
if (!core || !core.ok) return { core, stopped: 'client core not ok' }

phase('Build')
const SHAPES = JSON.stringify(core.issues)
const OWNERS = [
  { key: 'P', label: 'board+figures', files: 'src/client/board/**, src/client/figures/**, public/models/**, public/assets/**, tests/client/board*.test.ts',
    task: 'Spec 50 s2, s3, s5 (rings/overlays part): mat sized from the deployment table, terrain rendered exactly at rules footprints/heights from the engine terrain, entry-edge strips and 6 inch Zone of Influence bands, mission markers with control-zone rings coloured by controller and pulsing when contested plus 3D labels, camera presets, unit selection glow, stable status icons (spec 50 s3). FIGURES: copy every GLB whose verdict in art/models-staging/REVIEW.md is "ship" into public/models/<unitProfileId>.glb (map slug -> data unit id, e.g. marine -> the Marine profile id in data/sc-2026-10/units), write public/models/manifest.json {id: {file, height, yaw}}, run npm run models:optimize if present (GLTFLoader MUST setMeshoptDecoder per KB 3.4), procedural MGSD fallback for every other unit, figure y snapped to the surface, ?gallery view of all figures. Check the gallery close-up yourself (Playwright screenshot) before finishing.' },
  { key: 'I', label: 'interaction', files: 'src/client/interaction/**, tests/client/interaction*.test.ts',
    task: 'Spec 50 s5 movement part + a controller for EVERY pending decision kind in 00 s3.2 (setup.*, turn.activate menu, turn.first, move.path with Leading Model drag, ruler vs Speed, formation preview and red marks from query.coherencyPreview, deploy.entry/path along the entry edge, shoot.batch target picking with valid targets highlighted and odds hover, shoot.template, charge.targets/path, melee.closeRanks/split, atk.* rerolls/casualty choice, ability.window/target/pay/react, mission.*, score.order). Clicking a unit selects it and opens its action menu; Esc cancels; keyboard shortcuts P = pass, T = threat overlay. Use the gameStore dryRun for legality, never local rules.' },
  { key: 'U', label: 'hud', files: 'src/client/ui/** (except StartScreen and start/), tests/client/ui*.test.ts, tests/client/noNativeTooltips.test.ts',
    task: 'Spec 50 s4 every component with its testid: PhaseBar (with Pass/Hold), SupplyHud, ReservesTray, ObjectiveTracker, Briefing modal (auto-opens at game start, Briefing button reopens; mission/deployment names, game length, pool per round, how VP are scored, entry edges mini map, first-turn hints), OddsPanel, UnitCard on hover/select with keyword Tooltips and figure glow, WeaponPanel, EventFeed, GameOver with VP breakdown and Rematch, SettingsPanel (volume, dice mode, speed), shared Tooltip.tsx (no native title=), original faction emblems in theme.ts. Rails translucent and collapsible.' },
  { key: 'D', label: 'dice+start+audio', files: 'src/client/dice/**, src/client/ui/StartScreen.tsx, src/client/ui/start/**, src/client/audio/** (keep music.ts working), src/client/weaponFlavour.ts, public/audio/sfx/**, public/sounds.html, tools/gen-audio.ts, tools/measure-audio.ts, tools/audio-manifest.json (add sfx; keep music entries), tests/client/{dice,start,audio}*.test.ts',
    task: 'Spec 50 s6 dice tray showing the working (attack dice vs Hit TN, Surge die + matched tag, dice moved by Surge/crit, armour, evade, damage line with carry-over), quick tray default + totals strip. Start screen: title "Not Enough Minerals", fan notice (testid fan-notice), credit evilgouki, matchup picker (Founders T v Z default; faction starters incl. Protoss), mission/deployment pick or random, seats, tier, Continue for autosave, start-screen briefing preview, emblems. SFX via ElevenLabs sound-generation: build the weapon flavour map FIRST (every weapon id in data maps to a flavour: gauss rifle, grenade launcher, autocannon, missiles, siege cannon, claws/slash, spines, acid, psi-blade, warp blade, particle disruptor, glaive, etc.), then ~25-35 SFX (per flavour + deaths per faction + UI clicks + arrival warp-in/drop-pod/burrow + victory/defeat stinger already exist as music). HARD BUDGET 2,200 credits (check estimates; KB 3.3 prompt lessons; describe mechanisms, never name StarCraft/Blizzard). Key: from the gitignored ${ROOT}/tokens.txt.txt line EL=<key>, prefix stripped, passed ONLY via the ELEVENLABS_API_KEY env var; never print/write/commit it. Ship measure-audio + trims with the batch; public/sounds.html audition page listing every sound with its id. A test fails if any weapon lacks a flavour.' },
]
const built = await parallel(OWNERS.map(o => () => agent(`${COMMON}
You are client owner ${o.key} (${o.label}). FROZEN SHAPES from the core agent: ${SHAPES}
Task: ${o.task}
Other owners work at the same time in disjoint folders; import only via contract.ts and the frozen shapes. typecheck + test green for your files.
You own ONLY: ${o.files}. ${KEEP}`, { label: o.label, phase: 'Build', schema: RESULT, model: 'sonnet' })))

phase('Integrate')
const integ = await agent(`${COMMON}
You are the M3 integrator. Owner reports: ${JSON.stringify(built.map((r, i) => r && { owner: OWNERS[i].key, summary: r.summary, issues: r.issues }))}
1. Wire everything into one playable game; add the engine query functions owners asked for (additive, logged in 00 s10); resolve mismatches.
2. tests/e2e/play.spec.ts: start screen -> Founders T v Z human vs bot (?test=1&speed=fast) -> briefing shows -> play a FULL game to the end through window.__game (pick a legal action each human turn) -> game-over shows a winner/VP; also one bot-vs-bot game per faction-starter pairing incl. Protoss reaches game over without errors in the console.
3. Playwright screenshots at 1280x800 to ${ROOT}/screenshots/m3-*.png: start, briefing, mid-game board with HUD, a dice tray mid-attack, objective rings, ?gallery figures, game over. Look at them yourself and fix anything ugly or broken (overlaps, unreadable text, empty bases, blank canvas).
4. npm run typecheck, npm test, npm run validate:data, npm run build (chunks < 800 KB), npm run e2e: green.
You own every file under src/client/, src/engine/query.ts (additive), tests/, public/. ${KEEP}`,
  { label: 'integrate', phase: 'Integrate', schema: RESULT, effort: 'high' })

phase('Review')
const reviews = await parallel([
  () => agent(`${COMMON}
You are a FIRST-TIME PLAYER reviewer who has never played StarCraft TMG. Do NOT edit repo files (scratch only in tools/out/review/). Start Vite only if port 5201 is not up (npm run dev -- --port 5201), then drive Playwright at 1280x800 from a scratch script: play one real game as a human vs the bot (Founders T v Z) using mouse clicks like a person (not window.__game except to speed up bot turns), then glance at a Protoss matchup. Report usability findings: can you tell what to do each step, what the mission is, who is winning, why an action is illegal, what the dice meant; anything broken, ugly, slow, unreadable or confusing. Route each finding: C core/store/bot, P board/figures, I interaction, U HUD, D dice/start/audio, E engine query. Max 25, most severe first.`, { label: 'review:first-time', phase: 'Review', schema: FINDINGS, effort: 'high' }),
  () => agent(`${COMMON}
You are a CONTRACT/QUALITY reviewer. Do NOT edit repo files. Check: the client computes no rules number (grep for dice math, distances, TNs, supply sums in src/client), no native title= tooltips, every pending kind has a controller (run random bot-vs-human-random-click sims via ?test=1 hooks to find a decision the UI cannot answer), console errors over 3 full bot-vs-bot games with figures loaded, GLB loading works on the production build base path /not-enough-minerals/ (npm run build && npm run preview -- --port 5202 --base check), frame time with all figures, faction emblems are original, fan notice present, no Blizzard names in UI copy beyond unit/card names. Route findings: C, P, I, U, D, E. Max 25.`, { label: 'review:contract', phase: 'Review', schema: FINDINGS, effort: 'high' }),
])

phase('Fix')
const all = reviews.filter(Boolean).flatMap(v => v.findings)
const byOwner = {}
for (const f of all) (byOwner[f.owner] = byOwner[f.owner] || []).push(f)
const FILES = { C: 'src/client/{contract.ts,store/**,store.ts,bot/**,presentation/**,params.ts,GameScreen.tsx,App.tsx}', P: OWNERS[0].files, I: OWNERS[1].files, U: OWNERS[2].files, D: OWNERS[3].files, E: 'src/engine/query.ts (additive), docs/spec/00-architecture.md s10' }
const fixes = await parallel(Object.keys(byOwner).map(k => () => agent(`${COMMON}
You are the M3 fix agent for owner ${k}. Findings: ${JSON.stringify(byOwner[k])}
For each: reproduce, fix with a test where sensible, or refute in issues ("REFUTED: <where> <why>"). typecheck + test green. You own ONLY: ${FILES[k]}. ${KEEP}`, { label: 'fix:' + k, phase: 'Fix', schema: RESULT, model: 'sonnet' })))

phase('Gate')
const gate = await agent(`${COMMON}
You are the M3 final gate. Fix reports: ${JSON.stringify(fixes.filter(Boolean).map(f => ({ summary: f.summary, issues: f.issues })))}
1. npm run typecheck, npm test, npm run validate:data, npm run build, npm run sim -- --games 30, npm run e2e: all green; fix anything left (any src/client, tests, public file).
2. Fresh Playwright screenshots ${ROOT}/screenshots/m3-{start,briefing,board,dice,gallery,gameover}.png at 1280x800; look at each.
3. Out-of-scope items to tools/out/m3-followups.md. Regenerate STATUS.md (rewrite).
Summary: checks status, test counts, the screenshot list. ${KEEP}`, { label: 'gate', phase: 'Gate', schema: RESULT, effort: 'high' })

return { core: core.summary, built: built.map(r => r && r.summary), integ: integ && { summary: integ.summary, issues: integ.issues }, findings: all.length, fixes: fixes.map(f => f && f.summary), gate }
