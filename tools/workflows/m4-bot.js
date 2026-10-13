export const meta = {
  name: 'm4-bot',
  description: 'M4: utility AI (design, build, bench/tune to >=95% normal and >=75% easy vs random on a fixed mirror + the Founders matchup), 3 verify lenses, fix, gate',
  phases: [
    { title: 'Design', detail: 'spec 30 refresh, frozen src/ai interfaces, bench harness' },
    { title: 'Build', detail: 'three Sonnet owners' },
    { title: 'Bench', detail: 'up to 4 tune rounds' },
    { title: 'Verify', detail: 'legality, hidden info/contract, strength/behaviour' },
    { title: 'Fix', detail: 'apply verified findings, re-bench' },
    { title: 'Gate', detail: 'all checks, STATUS.md' },
  ],
}

const ROOT = args && args.root
const FELL = args && args.fell
if (!ROOT || !FELL) throw new Error('pass args.root and args.fell')

const COMMON = `Project root: ${ROOT} (ABSOLUTE paths; your shell cwd is a different old folder, never write there). Orient from ${ROOT}/STATUS.md and CLAUDE.md only. THE AI OPPONENT IS THE PRODUCT: there is no official solo mode, our bot is the only opponent.
Frozen: src/engine/** (except additive query.ts helpers, logged in docs/spec/00-architecture.md s10), src/data/**, data/**, src/client/{contract.ts,presentation/}. Deciders only see view(state, seat) and legalActions; never the raw state, never state.rng (derive randomness with deriveSeed(seed, tag, round, id)).
Engine numbers come from src/engine/query.ts (attackPreview, chargeOdds, supplyStatus, objectiveStatus, canSee, coherencyPreview, reachOf...); never re-derive rules in src/ai.
Reference (read-only, copy and adapt): Fell-in ${FELL}/src/ai (eval, threat, nav, moves, policies, worker, decider, tiers) and ${FELL}/tools/ai-bench.ts; KB sections 9.3 (AI numbers, bench shape, three lenses, BT audits) and 2.1.
Per-decision time budget from process.env.AI_MS / import.meta.env.VITE_AI_MS (default 150 ms; worker timeout 3 s).
Run long commands in the FOREGROUND. Never npm install or git commit; never edit STATUS.md; edit package.json only if told. Never write the owner's real name or a C:\\Users\\<name> path into any repo file.`

const RESULT = { type: 'object', properties: { ok: { type: 'boolean' }, summary: { type: 'string' }, files: { type: 'array', items: { type: 'string' } }, issues: { type: 'array', items: { type: 'string' } } }, required: ['ok', 'summary', 'files', 'issues'] }
const BENCH = { type: 'object', properties: { ok: { type: 'boolean' }, normalVsRandom: { type: 'number' }, easyVsRandom: { type: 'number' }, normalVsEasy: { type: 'number' }, msPerDecision: { type: 'number' }, games: { type: 'number' }, summary: { type: 'string' }, files: { type: 'array', items: { type: 'string' } }, issues: { type: 'array', items: { type: 'string' } } }, required: ['ok', 'normalVsRandom', 'easyVsRandom', 'games', 'summary', 'files', 'issues'] }
const FINDINGS = { type: 'object', properties: { ok: { type: 'boolean' }, findings: { type: 'array', items: { type: 'object', properties: { where: { type: 'string' }, problem: { type: 'string' }, fix: { type: 'string' }, severity: { type: 'string', enum: ['high', 'medium', 'low'] } }, required: ['where', 'problem', 'fix', 'severity'] } } }, required: ['ok', 'findings'] }
const KEEP = 'Return the schema object; summary and each issue 1-2 sentences; under ~600 tokens overall.'

phase('Design')
const design = await agent(`${COMMON}
You are the AI architect. Read docs/spec/30-ai-bot.md, 00-architecture.md s3 (every decision kind), 11 (phases), 15 (supply/control/VP), 17 (missions), src/engine/{types,query,index}.ts, src/ai/** (M0 random), src/client/bot/**, and the Fell-in AI.
1. Refresh docs/spec/30-ai-bot.md for StarCraft: tiers (random, easy, normal), per-decision-kind policies (setup draft picks, which unit to activate and when to Pass in each phase (passing first grabs the First Player marker), deploy from reserves within available supply and where on the entry edge, move destinations (objectives with supply majority, cover/LoS, avoid enemy threat and charge reach, keep coherency), shooting batch and target choice (kill odds, expected supply removed, Surge tag match), charge (odds, engagement value), close combat splits, casualty choice (keep coherency, keep supply brackets), ability windows and resource spending (CP/BM/PE, cards), mission actions), evaluation (VP now and projected, supply on objectives, supply lost, threat), time budget, determinism, and the bench: normal >= 95% vs random and easy >= 75% vs random on a FIXED mirror (terran-starter vs terran-starter) AND the Founders T v Z matchup, seats alternated, draws are non-wins.
2. Freeze src/ai/types.ts, src/ai/decider.ts (createAiDecider(tier, opts) dispatching by pending.kind namespace), stubs src/ai/{eval,threat,moves,policies}.ts with exact exports, src/ai/random.ts, src/ai/worker.ts.
3. tools/ai-bench.ts: --games N --seed s --a normal --b random --matchups founders,terran-mirror,...; alternate seats; prints JSON {games, winsA, winsB, draws, winRateA, msPerDecision, maxMs, errors}. Ensure package.json has "bench:ai" (you may add that one line).
typecheck + test green. You own ONLY: docs/spec/30-ai-bot.md, src/ai/**, tools/ai-bench.ts, package.json (one line). issues: one line per build owner (E eval+threat, M moves+policies, W worker+client wiring) naming exports. ${KEEP}`,
  { label: 'ai-design', phase: 'Design', schema: RESULT, effort: 'high' })
if (!design || !design.ok) return { design, stopped: 'design not ok' }

phase('Build')
const NOTES = JSON.stringify(design.issues)
const OWNERS = [
  { key: 'E', own: 'src/ai/eval.ts, src/ai/threat.ts, tests/ai/eval.test.ts', task: 'Evaluation: VP and projected VP, supply majority per objective marker (query.objectiveStatus / supplyStatus), expected damage and kill odds and expected supply removed (query.attackPreview), threat map per enemy unit (shoot range with LoS and charge reach via query.reachOf), Surge tag matching value, finish-off bonus, survival penalty, reserves pressure (supply to deploy before the final round). Pure and fast (memoize per decision).' },
  { key: 'M', own: 'src/ai/moves.ts, src/ai/policies.ts, src/ai/random.ts, tests/ai/policies.test.ts', task: 'Candidate generation and policies per decision kind (all namespaces: setup, turn, move, deploy, shoot, charge, melee, atk, ability, mission, score): activation order and Pass timing, deploy entry points, move destinations sampled and validated via the engine dry run (never local rules), shooting batches/targets, charge decisions, close combat splits, casualty picks, rerolls, ability/card use with resource budgeting, mission actions. Easy tier = noisier, shallower (top-3 random pick, no lookahead).' },
  { key: 'W', own: 'src/ai/worker.ts, src/client/bot/** (botDriver, aiWorkerClient.ts, randomBot kept), src/client/ui/start/** (tier picker only), tests/ai/worker.test.ts', task: 'Run the bot in a Web Worker (src/ai/worker.ts + aiWorkerClient.ts), botDriver uses the launch tier (default normal), holds until figures load, keeps the 5 s watchdog, falls back in-thread if Worker is unavailable; AI trace panel data (top candidates + scores) exposed for a debug panel (?aitrace).' },
]
const build = await parallel(OWNERS.map(o => () => agent(`${COMMON}
You are AI build owner ${o.key}. Interfaces FROZEN in src/ai/types.ts, decider.ts and docs/spec/30-ai-bot.md; report needed changes in issues.
Architect notes: ${NOTES}
Build: ${o.task}
About 6-10 focused tests. typecheck + test green for your files.
You own ONLY: ${o.own}. ${KEEP}`, { label: 'ai:' + o.key, phase: 'Build', schema: RESULT, model: 'sonnet' })))

phase('Bench')
let bench = null
const history = []
for (let round = 1; round <= 4; round++) {
  bench = await agent(`${COMMON}
Bench and tune round ${round} of 4. Previous rounds: ${JSON.stringify(history)}
Build reports: ${JSON.stringify(build.map(b => b && b.summary))}
1. typecheck + test; fix breakage in src/ai first.
2. npm run bench:ai -- --games 60 --seed r${round} --a normal --b random --matchups terran-mirror,founders ; --games 40 --a easy --b random (same matchups) ; --games 20 --a normal --b easy.
3. If normal < 95% or easy < 75% or msPerDecision > 150 or any errors: replay lost/drawn seeds, find the worst decisions (passing too early, never deploying, wandering, not contesting objectives, ignoring kill shots, suicidal charges, timeouts, draws from never scoring), fix src/ai, re-run. Never weaken the random bot, never touch the engine rules.
You own ONLY: src/ai/**, tests/ai/**, tools/ai-bench.ts. ${KEEP}`,
    { label: 'bench:r' + round, phase: 'Bench', schema: BENCH, effort: 'high' })
  history.push(bench && { normal: bench.normalVsRandom, easy: bench.easyVsRandom, ms: bench.msPerDecision, summary: bench.summary })
  if (bench && bench.ok && bench.normalVsRandom >= 0.95 && bench.easyVsRandom >= 0.75) break
}

phase('Verify')
const LENSES = [
  'LEGALITY and ROBUSTNESS: every action the bot returns is legal for every decision kind the engine can raise (enumerate kinds from src/engine), no throw paths, time budget respected, deterministic from seed. Run a 40-game normal vs normal sim across all faction matchups incl. Protoss with invariants.',
  'HIDDEN INFO and CONTRACT: src/ai reads only view(state, seat), never state.rng or raw state, never re-derives rules numbers query provides; HIDDEN/BURROWED enemy units are not targeted or tracked beyond what the view shows; worker messages serializable; client wiring honours the watchdog and holds until figures load.',
  'STRENGTH and BEHAVIOUR: audit seeded games (verbose bench or a short script): walking into open fire, ignoring kill shots, never scoring objectives, passing too early, never deploying reserves before the final round, wasting CP/BM/PE, charging out of range, breaking coherency, bad casualty picks.',
]
const verdicts = await parallel(LENSES.map((lens, i) => () => agent(`${COMMON}
You are an adversarial reviewer of the AI in src/ai and src/client/bot. NEVER edit repo files (scratch in tools/out/verify/ only). Lens: ${lens}
Report only real, reproducible defects with a precise fix. Max 15.`, { label: 'verify:' + (i + 1), phase: 'Verify', schema: FINDINGS, effort: 'high' })))
const findings = verdicts.filter(Boolean).flatMap(v => v.findings).filter(f => f.severity !== 'low')

phase('Fix')
let fix = null
if (findings.length) {
  fix = await agent(`${COMMON}
Apply these AI findings (re-check each; refute in issues "REFUTED: ..." when wrong): ${JSON.stringify(findings)}
Then typecheck, test, npm run sim -- --games 20, and npm run bench:ai with the same settings as the bench rounds. Normal must stay >= 95% and easy >= 75%.
You own ONLY: src/ai/**, tests/ai/**, src/client/bot/**, tools/ai-bench.ts. ${KEEP}`, { label: 'fix', phase: 'Fix', schema: BENCH, model: 'sonnet' })
}

phase('Gate')
const gate = await agent(`${COMMON}
M4 final gate. Bench history: ${JSON.stringify(history)}; fix: ${JSON.stringify(fix && { summary: fix.summary, n: fix.normalVsRandom, e: fix.easyVsRandom })}
1. npm run typecheck, npm test, npm run validate:data, npm run build, npm run sim -- --games 30, npm run e2e: green (fix anything in src/ai, src/client/bot, tests).
2. Write tools/out/m4-bench.md (rates per matchup and tier, ms/decision, known weaknesses). Regenerate STATUS.md (rewrite).
Summary: final rates and ms. ${KEEP}`, { label: 'gate', phase: 'Gate', schema: RESULT, effort: 'high' })

return { design: design.summary, build: build.map(b => b && b.summary), history, findings: findings.length, fix: fix && fix.summary, gate }
