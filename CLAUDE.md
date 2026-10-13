# Not Enough Minerals - Tabletop Miniatures Game: agent orientation

Read these in order, and nothing else up front:
1. `HANDOFF.md`: current state, owner decisions and next steps.
2. `STATUS.md`: what exists.
3. `PLAN.md`: scope, decisions and milestones.
4. `docs/spec/`: read only the sections a task names.

`docs/KNOWLEDGE-BASE.md` holds the lessons from the five earlier ports; read a section only when a task cites it.
Sources for rules and card data are mapped in `docs/spec/sources/SC-SOURCES.md`.

## Owner priority: playable first
- Something the owner can open on Pages and play beats test coverage. Every stage ends in something
  visible: a Pages deploy or screenshots.
- **The AI opponent is the product.** There is no official solo mode, so our bot is the only opponent. The AI
  milestone gets verify loops ON, benchmarks (bot beats random in at least 95% of games) and an owner playtest gate.
- Lean mode is the default (`args.lean: true`): implement and commit with about 10 focused tests and no
  adversarial verify loop. Turn verify loops on for rules-dense content: the unit/weapon/tactical-card data batches,
  the AI, or when the owner asks.
- Check-ins are 10 lines or fewer with a screenshot per milestone. Don't narrate options you won't pursue and
  don't re-ask settled decisions (PLAN.md, HANDOFF.md).
- Rules ambiguities never block work: add a `RULING: <rule> | <what we did> | <why>` line to
  `docs/needs-rules-check.md` with a status word (Confirmed, Corrected, Unsourced, Fan-source). Use the most literal
  reading of the Core Rules plus the Changelog, Cost Table and FAQ, and keep going.
- Do the legwork: free downloads, public pages and fan databases are the agent's job. Stop only for
  passwords, payment or account creation. One blocked source is never the only source: search fan wikis,
  rulebooks, store listings and community data, cite each, and only then fall back to a placeholder.

## Rules sources and precedence
- Primary sources are the free official PDFs, extracted to `docs/sources/text/*.txt` (gitignored). The Changelog
  10.2026 (CL) and Cost Table 10.2026 (CT) override the Core Rules (R); the FAQ (F) clarifies; the Quick Start (QS)
  is a summary. Card sheets (CS1/CS2) hold unit, tactical and faction cards. Cite as "R p.N 8.5.3", "CL p.1".
- Leak list (never a source): StarCraft II video game numbers (HP, shields, build times, upgrades, energy);
  preview or beta rules from before June 2026; R values superseded by CL/CT; other wargames' numbers (copy code
  shape only). Put this list in every rules prompt.
- BattleScribe and other community data files are a cross-check aid only; never commit them.

## Token rules (metered plan: mandatory)
- The main loop never reads whole source files or hand-writes bulk code. It writes Workflow scripts
  (`tools/workflows/`), reads structured JSON results, and checks in with the owner.
- Models:
  - Implementation and data entry run on Sonnet (`model: 'sonnet'`).
  - Spec writing, card prose and adversarial verification run on the session model at `effort: 'high'`.
  - Agents return schema-validated JSON, 300 tokens or fewer.
- Stages:
  - One workflow stage at a time, up to 15 agents per stage (owner approval 2026-10-13).
  - Commit and push after every stage. Ceiling about 2.5M tokens per push unless the owner sets another.
  - Resume (`resumeFromRunId`) works in the same session only.
- Prompts point at specs on disk ("read spec section X, build Y"); they never paste specs in.
- Freeze interfaces before fan-out. Freeze the data schema only after a dry run that encodes every unit and
  tactical card in the first slice (the Two-Player Starter Set, Founders Edition: Terran vs Zerg).
- Cap research at 3 to 6 WebFetches per agent and name the exact spec sections. Probe a new setup with one
  cheap agent before fanning out. Pages that block `curl` and WebFetch are read once through a real browser into
  `docs/spec/sources/`; nobody re-fetches.

## Workflow script pattern
- Every prompt starts with a `COMMON` preamble containing:
  - the absolute project root, derived at runtime (`path.resolve` from the script location or
    `process.cwd()`), never typed out; "use absolute paths, the cwd resets";
  - "orient from STATUS.md only";
  - the IP rule and the leak list;
  - the frozen-contract rule;
  - "run long commands in the FOREGROUND".
- Schemas:
  - `RESULT = {ok, summary, files[], issues[]}`
  - `VERDICT = {verdict, coverage, failing[], notes}`
  - `FINDINGS = {ok, findings:[{owner, where, problem, fix}]}`
- Every prompt says "You own ONLY: ...", and concurrent agents own disjoint files. Verify agents never edit.
  Route each finding to the agent that owns the file.
- Shared working tree:
  - Concurrent agents never run `npm install` or `git commit`, and never edit `package.json` or `STATUS.md`,
    unless told to.
  - Parallel content batches run in git worktrees (`.claude/worktrees/<name>`), and each agent calls
    `EnterWorktree` first. Shared registries merge by keeping both sides.
  - Stage files by exact path.
- After an interrupted run: `git status`, then `npm run typecheck && npm test`, then commit by hand, or park the
  work on `wip/<stage>`.
- Workflow scripts stay LF (see `.gitattributes`). `scriptPath` must be inside this repo.
- Per-decision AI time budgets sit behind an env var from the start (`VITE_AI_MS`, `AI_MS`); CI runners are slow.

## Conventions
- 1 world unit = 1 inch, y up, table centred at the origin. Tables: 36 x 36 in (skirmish, the default) and
  36 x 54 in (standard). The human seat is the near edge (+z); the client is generic N-seat.
- Bases are round: 25, 32, 40, 50, 80, 100 and 150 mm. Measurement always uses the base, never the mesh.
- Engine contracts are frozen after M1: `src/engine/{types,decider,view,rng,pending}.ts`. Any change needs a
  matching edit to `docs/spec/00-architecture.md` and a note in the agent's `issues`.
- Hidden information: deciders (human and bot) only ever receive `view(state, seat)`. Exactly one
  `PendingDecision`, with a `seat` (may be `'all'`).
- `legalActions` is never empty for an open decision. The engine owns every number the UI shows (hit odds,
  Surge, damage, range, cover, Supply in range).
- One generic mechanism per concept (one visibility mechanism for burrow/cloak/detection, one transport
  container). Cards and unit data are declarative JSON with `{"code": "<hook>"}` escape hatches.
- Name engine tests by checklist ID from `docs/spec/12-rules-test-checklist.md` (for example
  `it('LOS-002 ...')`).
- Test hooks: `?test=1`, `?seats=human,bot&seed=`, `?tier=`, `?speed=`, `?gallery`, `?fps`. E2E text picks match
  exactly.
- Dev server: `.claude/launch.json` entry `nem-dev` on port 5201 (`npm run dev -- --port 5201 --strictPort`).
- Commit messages: `M<n>: <what>`, a blank line, then the Co-Authored-By line for the current model. Pushing to
  `main` after each stage is pre-approved. Pages deploys from `main` at `/not-enough-minerals/`.
- Credit the author as **evilgouki**. Never write the owner's real name or a `C:\Users\<name>` path into any
  repo file; use `os.path.expanduser("~")`, `%USERPROFILE%`, `process.env.USERPROFILE` or a relative path.
  Grep for both before every commit.

## IP rule (Mallet posture, carried over by the owner)
- Mechanics are ported 1:1 from StarCraft: Tabletop Miniatures Game (Archon Studio, licensed from Blizzard
  Entertainment).
- Unit, card, keyword and faction names may match the real cards.
- ALL prose is in our own words: card text, scenario text, briefings, UI copy and docs. Write from a one-line
  mechanical summary, never by paraphrasing the original sentence by sentence.
- Never use Archon Studio or Blizzard art, icons, logos or trade dress. Faction emblems (Terran, Zerg, Protoss),
  unit portraits and the logo get our own original markings. Figures, symbols and card faces are our own
  designs. No "compatible" wording.
- The README and the UI state this is an unofficial fan project, not affiliated with Archon Studio or Blizzard
  Entertainment.
- Never commit rulebook or card PDFs, extracted rules text, community data files or secrets. `docs/sources/`,
  `*.pdf`, `*.token*`, `tokens.txt*` and `Tokens.txt` are gitignored. Every data value carries its source.
- The ElevenLabs key lives in the sibling `WarMForge` folder's `Tokens.txt` as `EL=<key>`, and may also be in a
  gitignored `tokens.txt*` file in this project root; strip the prefix and pass it only through the
  `ELEVENLABS_API_KEY` env var. Never write, log or commit it.

## Machines
- The Windows PC with the GPU does all asset work (Hunyuan3D, Claude in Chrome for Gemini, ElevenLabs). Never
  the Mac, never the built-in browser for Gemini.
- Figures are MGSD style (owner 2026-10-13, KB 9.6): about 2-2.5 heads tall, huge head/helmet, stubby legs,
  chunky feet, oversized hands and weapons, Master Grade detail; use the approved Mallet prompt in KB 9.6.
- Never paste into Gemini from the system clipboard; use the hidden file input (see the Gemini clipboard
  guard note in `docs/KNOWLEDGE-BASE.md` section 3).
