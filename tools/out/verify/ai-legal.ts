// Verifier scratch (legality / robustness lens): normal vs normal AI over every matchup, rotating missions and
// deployments (a draft every 4th game), engine invariants on every decision, answer legality, fallbacks / throws per kind,
// time per decision, and determinism (the same game re-played with fresh deciders gives the same action log).
// Run: npx tsx tools/out/verify/ai-legal.ts <from> <to> [--seed s] [--nodet] [--tier normal]
import { createAiDecider, type AiDecider } from '../../../src/ai/decider'
import { aiBudgetMs, type Tier } from '../../../src/ai/types'
import { apply } from '../../../src/engine/apply'
import { legalActions } from '../../../src/engine/pending'
import { createGame, type CreateGameOpts } from '../../../src/engine/setup'
import type { Action, GameState, SeatId } from '../../../src/engine/types'
import { view } from '../../../src/engine/view'
import { loadBundle } from '../../sim-core'
import { MATCHUP_OPTS } from '../../sim-matchups'

const arg = (n: string, d: string) => { const i = process.argv.indexOf(`--${n}`); return i >= 0 ? process.argv[i + 1]! : d }
const FROM = Number(process.argv[2] ?? '0'), TO = Number(process.argv[3] ?? '40')
const SEED = arg('seed', 'v'), TIER = arg('tier', 'normal') as Tier
const SLOW = Number(arg('slow', '1'))
const DET = !process.argv.includes('--nodet')
const CHECK = !process.argv.includes('--nocheck')
const bundle = loadBundle()
const NAMES = Object.keys(MATCHUP_OPTS)
const MISSIONS = bundle.records.missions.filter((m) => m.scale === 'skirmish').map((m) => m.id)
const DEPLOYMENTS = bundle.records.deployments.filter((d) => d.scale === 'skirmish').map((d) => d.id)
const optsFor = (g: number): CreateGameOpts => ({
  seed: `${SEED}-${g}`, seats: ['A', 'B'], ...MATCHUP_OPTS[NAMES[g % NAMES.length]!]!,
  ...(g % 4 === 3 ? { draft: true } : { missionId: MISSIONS[g % MISSIONS.length]!, deploymentId: DEPLOYMENTS[(g * 7 + Math.floor(g / MISSIONS.length)) % DEPLOYMENTS.length]! }),
})
const budget = aiBudgetMs()
const kinds: Record<string, { n: number; fb: number; err: number; maxMs: number; ms: number }> = {}
const problems: string[] = []
const prob = (s: string) => { if (problems.length < 60) problems.push(s) }
let slow = 0, hard = 0, decisionsTotal = 0

function play(g: number, record: boolean): { log: Action[]; state: GameState; fin: boolean } {
  const opts = optsFor(g)
  const tag = `${opts.seed}/${NAMES[g % NAMES.length]}`
  let state = createGame(bundle, opts)
  const ds: Record<SeatId, AiDecider> = {}
  for (const seat of state.seatOrder) ds[seat] = createAiDecider(TIER, { seed: `${opts.seed}-${seat}-${TIER}`, bundle, ...(SLOW !== 1 ? { now: () => performance.now() * SLOW } : {}), accepts: (a) => apply(state, bundle, a).ok })
  const log: Action[] = []
  let n = 0
  while (state.phase !== 'over' && n < 2000) {
    const p = state.pending
    const legal = legalActions(state)
    if (!legal.length) { prob(`${tag} r${state.round} ${p.kind}: empty legal`); break }
    if (record && CHECK && n % 3 === 0) for (const o of legal) { const r = apply(state, bundle, o); if (!r.ok) prob(`${tag} r${state.round} ${p.kind}: legal option ${o.type} rejected ${r.rejection.code}`) }
    const seat = p.seat === 'all' ? state.seatOrder[0]! : p.seat
    const d = ds[seat]!
    const e0 = d.memory.stats.errors, f0 = d.memory.stats.fallbacks
    let res
    try { res = d.decideSync(view(state, seat), p, legal) } catch (e) { prob(`${tag} r${state.round} ${p.kind}: decideSync threw ${(e as Error).message}`); break }
    if (record) {
      const k = (kinds[p.kind] ??= { n: 0, fb: 0, err: 0, maxMs: 0, ms: 0 })
      k.n++; k.ms += res.ms; k.maxMs = Math.max(k.maxMs, res.ms)
      if (d.memory.stats.errors > e0) { k.err++; prob(`${tag} r${state.round} ${p.kind}: policy threw (fallback to random)`) }
      if (d.memory.stats.fallbacks > f0) k.fb++
      if (res.ms > budget * 1.5) slow++
      if (res.ms >= budget * 4) hard++
      decisionsTotal++
    }
    const action = p.seat === 'all' ? { ...res.action, seat } : res.action
    const r = apply(state, bundle, action)
    if (!r.ok) { prob(`${tag} r${state.round} ${p.kind}: AI answer ${JSON.stringify(action).slice(0, 200)} rejected ${r.rejection.code} ${r.rejection.message}`); break }
    log.push(action)
    state = r.state
    n++
  }
  if (state.phase !== 'over') prob(`${tag}: unfinished after ${n} decisions (round ${state.round}, pending ${state.pending.kind})`)
  return { log, state, fin: state.phase === 'over' }
}

const t0 = performance.now()
let fin = 0, detFail = 0
const results: string[] = []
for (let g = FROM; g < TO; g++) {
  const a = play(g, true)
  if (a.fin) fin++
  results.push(`${g}:${NAMES[g % NAMES.length]}:${a.state.result?.winner ?? '-'}:r${a.state.round}:${a.log.length}`)
  if (DET) {
    const b = play(g, false)
    const ja = a.log.map((x) => JSON.stringify(x)), jb = b.log.map((x) => JSON.stringify(x))
    const i = ja.findIndex((x, k) => x !== jb[k])
    if (i >= 0 || ja.length !== jb.length) { detFail++; prob(`g${g}: nondeterministic at action ${i} (${ja[i]?.slice(0, 120)} vs ${jb[i]?.slice(0, 120)})`) }
  }
}
console.log(JSON.stringify({ games: TO - FROM, fin, decisions: decisionsTotal, slow, hard, detFail, budget, seconds: Math.round((performance.now() - t0) / 1000), results }))
console.log(JSON.stringify(Object.fromEntries(Object.entries(kinds).map(([k, v]) => [k, { n: v.n, fb: v.fb, err: v.err, mean: +(v.ms / v.n).toFixed(1), max: +v.maxMs.toFixed(0) }]))))
for (const p of problems) console.log(p)
