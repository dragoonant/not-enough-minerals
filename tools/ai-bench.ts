// AI bench (spec 30 s12): tier A vs tier B on fixed matchups, seats alternated, draws are non-wins.
// Run: npm run bench:ai -- --games 100 --seed s --a normal --b random --matchups founders,terran-mirror [--cap 2000]
//      [--mission frontlines-skirmish] [--deployment abandoned-camp] [--replay 4|all] [--verbose]
// Game g plays matchups[floor(g / 2) % k] with seed `${seed}-${floor(g / 2)}`; tier A sits in seat 0 on even g and
// seat 1 on odd g, so each pair plays the same game from both sides. Mission and Deployment are FIXED (no draft) so
// results compare across runs. Deciders see only view(state, seat); the host dry run (apply(...).ok on the real
// state) is their accepts check, as in the client. AI_MS sets the per-decision budget (default 150).
// Prints one JSON line: {games, a, b, winsA, winsB, draws, unfinished, winRateA, msPerDecision, maxMs, errors,
// fallbacks, policyErrors, hardStops, replays, byMatchup, slowKinds}. Errors: rejected answers, throws, stalls at the cap,
// a replayed game (--replay) that answers differently, any decision that hit the wall-clock hard stop. Exit 1 on any error.
import { createAiDecider, type AiDecider } from '../src/ai/decider'
import { applyTuning, TIER_IDS, type Tier } from '../src/ai/types'
import { apply } from '../src/engine/apply'
import { legalActions } from '../src/engine/pending'
import { createGame, type CreateGameOpts } from '../src/engine/setup'
import type { GameState, SeatId } from '../src/engine/types'
import { view } from '../src/engine/view'
import { loadBundle } from './sim-core'

/** Bench matchups (army presets per seat). founders and terran-mirror are the M4 gate set. */
export const BENCH_MATCHUPS: Record<string, Pick<CreateGameOpts, 'armies'>> = {
  founders: { armies: { A: 'terran-founders', B: 'zerg-founders' } },
  'terran-mirror': { armies: { A: 'terran-starter', B: 'terran-starter' } },
  'zerg-mirror': { armies: { A: 'zerg-starter', B: 'zerg-starter' } },
  'protoss-mirror': { armies: { A: 'protoss-starter', B: 'protoss-starter' } },
  tz: { armies: { A: 'terran-starter', B: 'zerg-starter' } },
  tp: { armies: { A: 'terran-starter', B: 'protoss-starter' } },
  zp: { armies: { A: 'zerg-starter', B: 'protoss-starter' } },
}

const arg = (name: string, def: string): string => {
  const i = process.argv.indexOf(`--${name}`)
  return i >= 0 && process.argv[i + 1] !== undefined ? process.argv[i + 1]! : def
}
const asTier = (t: string): Tier => {
  if (!(TIER_IDS as readonly string[]).includes(t)) { console.error(`bench:ai: unknown tier "${t}" (${TIER_IDS.join(', ')})`); process.exit(2) }
  return t as Tier
}
const GAMES = Number(arg('games', '10'))
const SEED = arg('seed', 's')
const TIER_A = asTier(arg('a', 'normal'))
const TIER_B = asTier(arg('b', 'random'))
const CAP = Number(arg('cap', '2000'))
const MISSION = arg('mission', 'frontlines-skirmish')
const DEPLOYMENT = arg('deployment', 'abandoned-camp')
const NAMES = arg('matchups', arg('scenarios', 'founders,terran-mirror')).split(',').map((s) => s.trim()).filter(Boolean)
const VERBOSE = process.argv.includes('--verbose')
// --replay N: replay the first N games a second time and fail when any answer differs (default 4; 'all' = every game)
const REPLAY = arg('replay', '4') === 'all' ? Infinity : Number(arg('replay', '4'))
for (const n of NAMES) if (!BENCH_MATCHUPS[n]) { console.error(`bench:ai: unknown matchup "${n}" (${Object.keys(BENCH_MATCHUPS).join(', ')})`); process.exit(2) }
applyTuning(process.env.AI_TUNE)

const bundle = loadBundle()
const now = () => performance.now()
let winsA = 0, winsB = 0, draws = 0, unfinished = 0, decisionsA = 0, msA = 0, maxMsA = 0, fallbacks = 0, policyErrors = 0, hardStops = 0, replays = 0
const errors: string[] = []
const byMatchup: Record<string, { games: number; winsA: number; winsB: number; draws: number }> = {}
const kindMs: Record<string, { n: number; ms: number; max: number }> = {}

interface Played { state: GameState; n: number; seatA: SeatId; deciders: Record<SeatId, AiDecider>; log: string[]; failed: boolean }
/** Play game g to its end (or the cap / an error). `timed` records tier A's decision times; the log is every answer sent. */
function playGame(g: number, name: string, gameSeed: string, tag: string, timed: boolean): Played | null {
  let state: GameState
  try {
    state = createGame(bundle, { seed: gameSeed, seats: ['A', 'B'], ...BENCH_MATCHUPS[name]!, missionId: MISSION, deploymentId: DEPLOYMENT })
  } catch (e) { errors.push(`${tag}: createGame threw ${(e as Error).message}`); return null }
  const seatA = state.seatOrder[g % 2]!
  const deciders: Record<SeatId, AiDecider> = {}
  for (const seat of state.seatOrder) {
    const tier = seat === seatA ? TIER_A : TIER_B
    deciders[seat] = createAiDecider(tier, { seed: `${gameSeed}-${seat}-${tier}`, bundle, accepts: (a) => apply(state, bundle, a).ok })
  }
  const log: string[] = []
  let n = 0, failed = false
  while (state.phase !== 'over' && n < CAP) {
    const p = state.pending
    const seat = p.seat === 'all' ? state.seatOrder[0]! : p.seat
    let r
    try {
      const t0 = now()
      const { action, fallback } = deciders[seat]!.decideSync(view(state, seat), p, legalActions(state))
      const ms = now() - t0
      log.push(`${p.id}:${seat}:${JSON.stringify(action)}`)
      if (timed && seat === seatA) {
        decisionsA++; msA += ms; maxMsA = Math.max(maxMsA, ms)
        const k = (kindMs[p.kind] ??= { n: 0, ms: 0, max: 0 }); k.n++; k.ms += ms; k.max = Math.max(k.max, ms)
      }
      if (timed && fallback) fallbacks++
      r = apply(state, bundle, p.seat === 'all' ? { ...action, seat } : action)
      if (!r.ok) { errors.push(`${tag} r${state.round} ${p.kind}: ${seat} sent a rejected ${action.type}: ${r.rejection.code} ${r.rejection.message}`); failed = true; break }
    } catch (e) { errors.push(`${tag} r${state.round} ${p.kind}: threw ${(e as Error).stack?.split(String.fromCharCode(10)).slice(0, 3).join(' | ')}`); failed = true; break }
    state = r.state
    n++
  }
  return { state, n, seatA, deciders, log, failed }
}

for (let g = 0; g < GAMES; g++) {
  const name = NAMES[Math.floor(g / 2) % NAMES.length]!
  const gameSeed = `${SEED}-${Math.floor(g / 2)}`
  const tag = `${gameSeed}/${name}/${g % 2 ? 'B' : 'A'}-seat`
  const row = (byMatchup[name] ??= { games: 0, winsA: 0, winsB: 0, draws: 0 })
  row.games++
  const played = playGame(g, name, gameSeed, tag, true)
  if (!played) { unfinished++; continue }
  const { state, n, seatA, deciders, log } = played
  for (const d of Object.values(deciders)) { policyErrors += d.memory.stats.errors; hardStops += d.memory.stats.hard }
  if (state.phase !== 'over') { unfinished++; if (n >= CAP) errors.push(`${tag}: stall, ${CAP} decisions without an end`) }
  else if (!state.result?.winner) { draws++; row.draws++ }
  else if (state.result.winner === seatA) { winsA++; row.winsA++ }
  else { winsB++; row.winsB++ }
  if (VERBOSE) {
    const ks = Object.values(deciders[seatA]!.memory.stats.byKind)
    const ms = ks.reduce((a, k) => a + k.ms, 0), work = ks.reduce((a, k) => a + k.work, 0)
    console.error('   ms ' + ms.toFixed(0) + ' work ' + work.toFixed(0) + ' ms/unit ' + (ms / Math.max(1, work)).toFixed(2) + ' terrain ' + state.terrain.map((t) => t.pieceId).join(','))
  }
  if (VERBOSE) console.error(`${g} ${tag} winner=${state.result?.winner ?? '-'} (A=${seatA}) vp=${JSON.stringify(Object.fromEntries(state.seatOrder.map((s) => [s, state.seats[s]!.vp])))} decisions=${n}`)
  // Determinism: the same game from the same seed must replay answer for answer (the work meter, not the clock, ends a search).
  if (!played.failed && g < REPLAY) {
    replays++
    const again = playGame(g, name, gameSeed, tag, false)
    if (again) {
      const i = log.findIndex((l, k) => l !== again.log[k])
      if (i >= 0 || again.log.length !== log.length) {
        const at = i >= 0 ? i : Math.min(log.length, again.log.length)
        errors.push(tag + ': replay differs at answer ' + at + ' (' + log.length + ' vs ' + again.log.length + '): ' + (log[at] ?? 'end') + ' vs ' + (again.log[at] ?? 'end'))
      }
      for (const d of Object.values(again.deciders)) hardStops += d.memory.stats.hard
    }
  }
}
if (hardStops > 0) errors.push(`${hardStops} decisions hit the wall-clock hard stop (the work cap should end every decision first)`)

const slowKinds = Object.fromEntries(Object.entries(kindMs).sort((x, y) => y[1].max - x[1].max).slice(0, 5)
  .map(([k, v]) => [k, { n: v.n, mean: Number((v.ms / v.n).toFixed(2)), max: Number(v.max.toFixed(1)) }]))
console.log(JSON.stringify({
  games: GAMES, a: TIER_A, b: TIER_B, matchups: NAMES, winsA, winsB, draws, unfinished,
  winRateA: GAMES ? Number((winsA / GAMES).toFixed(3)) : 0,
  msPerDecision: decisionsA ? Number((msA / decisionsA).toFixed(2)) : 0, maxMs: Number(maxMsA.toFixed(1)),
  errors: errors.length, fallbacks, policyErrors, hardStops, replays, byMatchup, slowKinds,
}))
if (errors.length) { for (const e of errors.slice(0, 20)) console.error(e); process.exitCode = 1 }
