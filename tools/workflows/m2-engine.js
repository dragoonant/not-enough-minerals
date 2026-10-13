export const meta = {
  name: 'm2-engine',
  description: 'M2: rules engine (services, turn loop, movement/supply/reserves, attack pipeline, abilities/visibility), sim, golden test, 3 verify lenses, owner fixes, gate',
  phases: [
    { title: 'Foundations', detail: 'additive contracts, services, stubs with TodoError' },
    { title: 'Rules', detail: 'four Sonnet owners, disjoint modules' },
    { title: 'Integrate', detail: 'query.ts, sim, golden test, green' },
    { title: 'Verify', detail: 'rules fidelity, robustness/invariants, hook wiring' },
    { title: 'Fix', detail: 'one fix agent per owner, may refute' },
    { title: 'Gate', detail: 'typecheck/test/validate/build/sim, STATUS.md' },
  ],
}

const ROOT = args && args.root
const MAL = args && args.mal
if (!ROOT || !MAL) throw new Error('pass args.root and args.mal')

const COMMON = `Project root: ${ROOT} (ABSOLUTE paths; your shell cwd is a different old folder, never write there). Orient from ${ROOT}/STATUS.md and CLAUDE.md only.
IP rule: mechanics 1:1; all prose (labels, log text, comments) in our own words.
Run long commands in the FOREGROUND. Never npm install, never git commit; never edit STATUS.md or package.json unless told. Never write the owner's real name or a C:\\Users\\<name> path into any repo file.
Engine rules (docs/spec/00-architecture.md is the law: module map s1, namespaces s3.2, ONE mechanism per concept s4, HOOK_WIRING s4.3): pure TS, no DOM, no Math.random, only roll() advances state.rng; exactly one PendingDecision; legalActions never empty; bad input returns a Rejection, never throws (unbuilt bodies throw TodoError -> E_TODO); every rules number comes from the data bundle (src/data, edition sc-2026-10) or rules.json, never a literal.
Data: src/data/types.ts and data/** are FROZEN; read, do not edit; report misfits in issues.
Squad mechanics shape (coherency, model removal, reserves, objective control) may be copied from the Mallet project at ${MAL} (read-only; copy code shape, never 40k numbers).
Rulings: return "RULING: <rule> | <what we did> | <why> | <status> | <source>" lines in issues.
Tests: Vitest, each it() named by checklist ID from docs/spec/12-rules-test-checklist.md (e.g. it('ATK-003 ...')). About 12-20 focused tests per agent covering the core of each ID group.`

const RESULT = { type: 'object', properties: { ok: { type: 'boolean' }, summary: { type: 'string' }, files: { type: 'array', items: { type: 'string' } }, issues: { type: 'array', items: { type: 'string' } } }, required: ['ok', 'summary', 'files', 'issues'] }
const FINDINGS = { type: 'object', properties: { ok: { type: 'boolean' }, findings: { type: 'array', items: { type: 'object', properties: { owner: { type: 'string', enum: ['T', 'M', 'A', 'B', 'I'] }, where: { type: 'string' }, problem: { type: 'string' }, fix: { type: 'string' } }, required: ['owner', 'where', 'problem', 'fix'] } } }, required: ['ok', 'findings'] }
const KEEP = 'Return the schema object; summary and each issue 1-2 sentences; under ~800 tokens overall.'

const OWNERS = [
  { key: 'T', label: 'rules:T turn+score', specs: '11, 17, 15 s6 (control), 19 (TURN/MSN rows)',
    files: 'src/engine/{turnflow,setup,scoring,missions,control}.ts, tests/engine/{turnflow,setup,scoring,missions,control}.test.ts',
    task: 'Round and the four Phases with alternating activation, Pass, First Player marker and initiative transfer, activation markers, eligibility per phase; Phase 4 Scoring pipeline (control by supply, VP incl. supply lost, end check, cleanup/card refresh, end-of-round arrivals); setup: createGame with mission+deployment (a quick setup path that skips the draft for the first slice plus the full draft as decisions), terrain from the deployment/maps, First Player roll-off, game length per mission; mission actions and markers; control.contest.' },
  { key: 'M', label: 'rules:M move+supply', specs: '14, 15 s1-5, 16 s8',
    files: 'src/engine/{movement,squads,engage,reserves,supply,geometry,terrain,los,measure}.ts, tests/engine/{movement,squads,engage,reserves,supply,los}.test.ts',
    task: 'reposition() for Move/Run/Disengage/Close Ranks/PLACE/forced moves with the Leading Model path and the formation placer, coherency (3 inch, links, removal of models with no legal position), Engagement, Flying, terrain Size and access points, LoS per spec 14; supplyFor/poolFor/available/canArrive, Reserves container and arrive() from entry edges with the Zone of Influence ban, final-round unlimited pool, units left in reserve destroyed at game end; disengage supply comparison.' },
  { key: 'A', label: 'rules:A attacks', specs: '13, 18 (weapon keywords)',
    files: 'src/engine/{shooting,charge,melee,attack,damage}.ts, tests/engine/{shooting,charge,melee,attack,damage}.test.ts',
    task: 'THE attack pipeline resolveBatch(): RoA dice per model, Hit TN with modifiers clamp 2..6 and natural 1/6, Surge die on tag match, Armour then Evade where granted, damage pool, DMG per die, allocateDamage with carry-over, Shield, casualty choice decision, removeModels as the only remover firing onModelsRemoved; Ranged Attack batches across weapon profiles and targets (Ground/Flying/All), templates, weapon keywords (PIERCE, PRECISION, LONG RANGE, INDIRECT FIRE, SIDEARM, ANTI-EVADE, CRITICAL HIT etc. per spec 18); Charge (declare, roll, path, impact); Combat Phase Close Ranks and close combat attacks with splits.' },
  { key: 'B', label: 'rules:B abilities', specs: '16, 18, 00 s4.2-4.3',
    files: 'src/engine/{abilities,effects,visibility,hooks,code-hooks,army}.ts, tests/engine/{abilities,effects,visibility,hooks,army}.test.ts',
    task: 'Active/Passive/Reaction abilities interpreter for the declarative effect verbs, one reaction per player per activation, per-round usage ledger, costs CP/BM/PE through pay() with Tactical/Faction card exhaust and refresh; Effect list + statOf (BUFF/DEBUFF/status/flat with expiries); visibility canSee with HIDDEN/BURROWED/detection; HOOK_WIRING with runHook and an implementation in code-hooks.ts for EVERY {code} hook name listed in data/sc-2026-10/hooks/*.json (stub-free: each needs at least a minimal faithful implementation); validateArmy with costs from the 10.2026 cost table.' },
]

phase('Foundations')
const found = await agent(`${COMMON}
You are the M2 foundations architect. Read docs/spec/00-architecture.md fully, skim 10-19 and 20/21, read src/engine/*.ts, src/data/types.ts and a few data files (units/terran/marine.json, a mission, presets).
Build what the four rules owners code against so that they only fill bodies in disjoint files:
1. ADDITIVE edits to src/engine/types.ts per 00 s4.1 (UnitState, GameState, SeatState, PlayerView fields, Effect, MarkerState, attack batch/pools, RejectionCodes). Log each in 00 s10 "M2".
2. registry.ts ModuleDef/namespace protocol and apply.ts dispatch per 00 s3 (verify the skeleton's; extend additively).
3. COMPLETE services: edition.ts (bundle lookups, card-frame to world conversion), dice.ts (test(), clamp, natural 1/6, rerolls, D3, exact odds helpers), rng helpers, query.ts SIGNATURES (bodies may throw TodoError) for every number in 00 s6.
4. Stub files with exact exported names/signatures for every module in the four owners' lists below (bodies throw TodoError) so typecheck passes; one comment line atop each naming its checklist ID groups.
5. Schema gaps: tools/out/m1-data-report.md lists open schema items (setToken minEnemyDist, damageReduce min, coherency axis, TokenDef terrain/removedBy, ClaimRule phase, Army Slot condition, trigger events for losing HIDDEN / arrival / PLACE resolved, the usableInReserves abilityMod field, ValueExpr in damageReduce.n). Make these ADDITIVE edits to src/data/types.ts + validate.ts + spec 20 (and the few data files that need the new fields) NOW so the owners never touch the schema.
6. tests/engine/helpers.ts: loadBundle from disk, fixtures (two-unit duel state Marine squad vs Zergling squad on an open table, a deterministic decider runner), and tests/engine/dice.test.ts.
Owners: ${JSON.stringify(OWNERS.map(o => ({ key: o.key, files: o.files })))}
typecheck + test green. You own ONLY: src/data/types.ts + validate.ts (additive), data/** (only the fields above), docs/spec/20-data-schema.md, types.ts (additive), registry.ts, apply.ts, edition.ts, dice.ts, rng.ts, query.ts, index.ts, the stubs, tests/engine/{helpers,dice}.test.ts / helpers.ts, docs/spec/00-architecture.md. In issues give one line per owner (T, M, A, B) naming the interfaces they must implement and call. ${KEEP}`,
  { label: 'foundations', phase: 'Foundations', schema: RESULT, effort: 'high' })
if (!found || !found.ok) return { found, stopped: 'foundations not ok' }

phase('Rules')
const IFACE = JSON.stringify(found.issues)
const rules = await parallel(OWNERS.map(o => () => agent(`${COMMON}
You are rules owner ${o.key}. Interfaces FROZEN by foundations: src/engine/{types,registry,apply,edition,dice,rng,query}.ts. Do not edit them; report needed changes in issues.
Foundations notes: ${IFACE}
Read only: docs/spec/00-architecture.md, docs/spec/ ${o.specs}, the matching ID groups in 12-rules-test-checklist.md, docs/spec/19-errata-and-faq.md rows for your area, docs/needs-rules-check.md.
Implement: ${o.task}
Other owners build at the same time; call their exports by the frozen signatures (they may still throw TodoError, so isolate tests with helpers.ts fixtures).
Finish with npm run typecheck and npm test green for your files (list failures in others' files).
You own ONLY: ${o.files}. ${KEEP}`, { label: o.label, phase: 'Rules', schema: RESULT, model: 'sonnet' })))

phase('Integrate')
const integ = await agent(`${COMMON}
You are the M2 integrator. Four owners filled the rules modules. Reports: ${JSON.stringify(rules.map((r, i) => r && { owner: OWNERS[i].key, summary: r.summary, issues: r.issues }))}
1. Make it ONE engine: resolve cross-module TODOs/mismatches (no TodoError left reachable in a normal game), implement query.ts bodies (hit odds, expected damage, kill odds, range/LoS verdict, supply/control status, objectiveStatus) from the owners' pure helpers.
2. Golden test: tests/engine/golden.test.ts reproducing the worked example(s) in the Quick Start / R (spec 60 names it) step by step.
3. tools/sim.ts: createGame for the Founders Terran vs Zerg presets AND every faction-starter pairing (T/Z/P mirror and cross), random deciders both seats, invariants from spec 60 (legalActions never empty, every legal action accepted, replay determinism, 2000-decision stall cap, step time), flags --games --seed --matchup; prints one JSON line {games, finished, avgRounds, winners, draws, decisions, errors, maxStepMs}. Run npm run sim -- --games 60 and fix every error.
4. A HOOK_WIRING test proving every hook point fires in a real simulated game.
5. typecheck, test, validate:data, build: all green.
You own every file under src/engine/, tests/engine/, tools/sim*.ts. Put the sim JSON line in summary. ${KEEP}`,
  { label: 'integrate', phase: 'Integrate', schema: RESULT, effort: 'high' })

phase('Verify')
const LENSES = [
  { key: 'rules', prompt: 'RULES FIDELITY: pick the 40 most game-defining checklist IDs (attack pipeline, Surge, carry-over, Shield, supply pool/arrival, control by supply, VP, pass/initiative, coherency, charge, engagement/disengage, burrow/hidden/detection) and check the engine code + tests implement each exactly as specs 11-19 say (and the PDFs where specs look doubtful). Write tiny ad-hoc scripts under tools/out/verify/ if useful (you may create files only there).' },
  { key: 'robust', prompt: 'ROBUSTNESS/CONTRACT: run npm run sim -- --games 100 with different seeds and every matchup; look for stalls, draws in every game, rejected legal actions, TodoError, exceptions, non-determinism, Math.random, literal rules numbers, client-unsafe state, the one-mechanism rule (00 s4 "Not allowed" column) being violated, and a second model-removal path.' },
  { key: 'hooks', prompt: 'DATA COVERAGE: for every unit, upgrade, ability and card in data/sc-2026-10, check the engine can actually use it in play: weapon keywords handled, every {code} hook implemented faithfully (not a no-op) per its card, every trigger wired, abilities offered in the right phase with the right cost. List each gap.' },
]
const verdicts = await parallel(LENSES.map(l => () => agent(`${COMMON}
You are an M2 VERIFIER (lens: ${l.key}). Do NOT edit repo files (except tools/out/verify/ scratch). ${l.prompt}
Integrator report: ${JSON.stringify(integ && { summary: integ.summary, issues: integ.issues })}
Route each finding to the owner of the file: T = turnflow/setup/scoring/missions/control, M = movement/squads/engage/reserves/supply/geometry/terrain/los/measure, A = shooting/charge/melee/attack/damage, B = abilities/effects/visibility/hooks/code-hooks/army, I = query/sim/apply/types/edition/dice. Max 25 findings, most severe first.`, { label: 'verify:' + l.key, phase: 'Verify', schema: FINDINGS, effort: 'high' })))

phase('Fix')
const all = verdicts.filter(Boolean).flatMap(v => v.findings)
const byOwner = {}
for (const f of all) (byOwner[f.owner] = byOwner[f.owner] || []).push(f)
const FILES = { T: OWNERS[0].files, M: OWNERS[1].files, A: OWNERS[2].files, B: OWNERS[3].files, I: 'src/engine/{query,apply,types,edition,dice,index}.ts, tools/sim*.ts, tests/engine/{golden,hooks-wiring,helpers}*' }
const fixes = await parallel(Object.keys(byOwner).map(k => () => agent(`${COMMON}
You are the M2 fix agent for owner ${k}. Findings: ${JSON.stringify(byOwner[k])}
For each: confirm against the spec/PDF and the code; fix it with a test, or refute it in issues ("REFUTED: <where> <why>"). typecheck + test green for your files. You own ONLY: ${FILES[k]}. ${KEEP}`, { label: 'fix:' + k, phase: 'Fix', schema: RESULT, model: 'sonnet' })))

phase('Gate')
const gate = await agent(`${COMMON}
You are the M2 final gate. Fix reports: ${JSON.stringify(fixes.filter(Boolean).map(f => ({ summary: f.summary, issues: f.issues })))}
1. npm run typecheck, npm test, npm run validate:data, npm run build, npm run sim -- --games 60: all green, 0 errors; fix anything left (you may edit any src/engine, tests, tools file).
2. Append these RULING lines to docs/needs-rules-check.md: ${JSON.stringify([...rules, integ, ...fixes].filter(Boolean).flatMap(r => r.issues.filter(i => i.startsWith('RULING'))))}; out-of-scope items to tools/out/m2-followups.md.
3. Regenerate STATUS.md (rewrite, not append).
Put the final sim JSON line and test count in summary. ${KEEP}`, { label: 'gate', phase: 'Gate', schema: RESULT, effort: 'high' })

return { found: found.summary, rules: rules.map(r => r && r.summary), integ: integ && integ.summary, findings: all.length, fixes: fixes.map(f => f && f.summary), gate }
