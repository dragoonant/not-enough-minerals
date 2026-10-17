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
  // Expanded (Wave 2) forces; ids and armies follow MATCHUPS in src/client/store/launch.ts.
  'tz-x': { armies: { A: 'terran-expanded', B: 'zerg-expanded' } },
  'tp-x': { armies: { A: 'terran-expanded', B: 'protoss-expanded' } },
  'zp-x': { armies: { A: 'zerg-expanded', B: 'protoss-expanded' } },
  'terran-mirror-x': { armies: { A: 'terran-expanded', B: 'terran-expanded' } },
  'zerg-mirror-x': { armies: { A: 'zerg-expanded', B: 'zerg-expanded' } },
  'protoss-mirror-x': { armies: { A: 'protoss-expanded', B: 'protoss-expanded' } },
}
/** Every matchup the client offers (the --matchups all set; first-battle is a preset, not an army pair). */
export const ALL_MATCHUPS = Object.keys(BENCH_MATCHUPS)

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
// --offset K: play games K .. K+games-1 (the same game ids a longer run would play), so shards run in parallel and add up
const OFFSET = Number(arg('offset', '0'))
const TIER_A = asTier(arg('a', 'normal'))
const TIER_B = asTier(arg('b', 'random'))
const CAP = Number(arg('cap', '2000'))
const MISSION = arg('mission', 'frontlines-skirmish')
const DEPLOYMENT = arg('deployment', 'abandoned-camp')
const MATCHUP_ARG = arg('matchups', arg('scenarios', 'founders,terran-mirror'))
const NAMES = MATCHUP_ARG === 'all' ? ALL_MATCHUPS : MATCHUP_ARG.split(',').map((s) => s.trim()).filter(Boolean)
// --rotate: instead of the fixed Mission and Deployment, pair g/2 with the next Mission and a stepped Deployment so every
// Mission Card and Deployment Card is played (--scale skirmish|all restricts the pool; the army presets are skirmish scale).
const ROTATE = process.argv.includes('--rotate')
const SCALE = arg('scale', 'skirmish')
const VERBOSE = process.argv.includes('--verbose')
// --trace: print the board at every Phase change of the first replay of each game (units: owner/id@x,z dmg; markers: n@x,z controller)
// --wall: the deciders run on the real clock (the wall-clock hard stop can then fire on a loaded machine). Default: a frozen
// clock, so a decision ends on the work cap alone and results do not depend on machine load; the timing columns still use the real clock.
const WALL = process.argv.includes('--wall')
const TRACE = process.argv.includes('--trace')
if (TRACE) (globalThis as { __aiTrace?: (l: string) => void }).__aiTrace = (l) => console.error(l)
// --replay N: replay the first N games a second time and fail when any answer differs (default 4; 'all' = every game)
const REPLAY = arg('replay', '4') === 'all' ? Infinity : Number(arg('replay', '4'))
for (const n of NAMES) if (!BENCH_MATCHUPS[n]) { console.error(`bench:ai: unknown matchup "${n}" (${Object.keys(BENCH_MATCHUPS).join(', ')})`); process.exit(2) }
applyTuning(process.env.AI_TUNE)

const bundle = loadBundle()
const MISSIONS = bundle.records.missions.filter((m) => SCALE === 'all' || m.scale === SCALE).map((m) => m.id)
const DEPLOYMENTS = bundle.records.deployments.filter((d) => SCALE === 'all' || d.scale === SCALE).map((d) => d.id)
/** Mission and Deployment of game pair p: fixed, or rotated so every pairing of the pools comes up before a repeat. */
function cardsFor(p: number): { mission: string; deployment: string } {
  if (!ROTATE) return { mission: MISSION, deployment: DEPLOYMENT }
  return { mission: MISSIONS[p % MISSIONS.length]!, deployment: DEPLOYMENTS[(p + Math.floor(p / MISSIONS.length)) % DEPLOYMENTS.length]! }
}
// Timing is the wall clock (process CPU time is quantised to 15.6 ms on Windows). On a shared machine run one process, not shards.
const now = (): number => performance.now()
let winsA = 0, winsB = 0, draws = 0, unfinished = 0, decisionsA = 0, msA = 0, maxMsA = 0, fallbacks = 0, policyErrors = 0, hardStops = 0, replays = 0
const errors: string[] = []
const byMatchup: Record<string, { games: number; winsA: number; winsB: number; draws: number; blocked: number }> = {}
const byMission: Record<string, { games: number; winsA: number; winsB: number; draws: number; blocked: number }> = {}
const nonWins: string[] = []
const slow: string[] = []
const acts: Record<string, number> = {}
const kindWork: Record<string, { n: number; work: number; capped: number }> = {}
const SLOW_MS = Number(arg('slow', '120'))
const todos: string[] = []
let blocked = 0
const kindMs: Record<string, { n: number; ms: number; max: number }> = {}

interface Played { state: GameState; n: number; seatA: SeatId; deciders: Record<SeatId, AiDecider>; log: string[]; failed: boolean; todo: boolean }
/** Play game g to its end (or the cap / an error). `timed` records tier A's decision times; the log is every answer sent. */
function playGame(g: number, name: string, gameSeed: string, tag: string, timed: boolean): Played | null {
  let state: GameState
  try {
    state = createGame(bundle, { seed: gameSeed, seats: ['A', 'B'], ...BENCH_MATCHUPS[name]!, missionId: cardsFor(Number(gameSeed.slice(SEED.length + 1))).mission, deploymentId: cardsFor(Number(gameSeed.slice(SEED.length + 1))).deployment })
  } catch (e) { errors.push(`${tag}: createGame threw ${(e as Error).message}`); return null }
  const seatA = state.seatOrder[g % 2]!
  const deciders: Record<SeatId, AiDecider> = {}
  for (const seat of state.seatOrder) {
    const tier = seat === seatA ? TIER_A : TIER_B
    deciders[seat] = createAiDecider(tier, { seed: `${gameSeed}-${seat}-${tier}`, bundle, ...(WALL ? {} : { now: () => 0 }), accepts: (a) => apply(state, bundle, a).ok })
  }
  const log: string[] = []
  let n = 0, failed = false, todo = false, lastRound = -1, lastPhase: string | null = null
  while (state.phase !== 'over' && n < CAP) {
    const p = state.pending
    if (TRACE && timed && (state.round !== lastRound || state.roundPhase !== lastPhase)) {
      lastRound = state.round; lastPhase = state.roundPhase
      const us = Object.values(state.units).filter((u) => u.location === 'table').map((u) => {
        const m = u.leadingModelId ? state.models[u.leadingModelId] : undefined
        return `${u.owner}:${u.profileId}@${m ? m.pos.x.toFixed(0) + ',' + m.pos.z.toFixed(0) : '?'}${u.damage ? '-' + u.damage : ''}`
      }).join(' ')
      const mk = state.markers.map((m) => `${m.n}@${m.pos.x.toFixed(0)},${m.pos.z.toFixed(0)}`).join(' ')
      console.error(`TRACE r${state.round} ${state.roundPhase} vp=${JSON.stringify(Object.fromEntries(state.seatOrder.map((s) => [s, state.seats[s]!.vp])))} lost=${JSON.stringify(Object.fromEntries(state.seatOrder.map((s) => [s, state.seats[s]!.supplyLostThisRound])))} A=${seatA}
  ${us}
  markers ${mk}`)
    }
    const seat = p.seat === 'all' ? state.seatOrder[0]! : p.seat
    let r
    try {
      const w0 = deciders[seat]!.memory.stats.byKind[p.kind]?.work ?? 0
      const t0 = now()
      const legal = legalActions(state)
      const { action, fallback } = deciders[seat]!.decideSync(view(state, seat), p, legal)
      const ms = now() - t0
      log.push(`${p.id}:${seat}:${JSON.stringify(action)}`)
      if (TRACE && timed && seat === seatA && p.kind !== 'ability.window') console.error(`  ${p.kind} ${action.type}${typeof action.unitId === 'string' ? ' ' + action.unitId : ''}${Array.isArray(action.path) ? ' -> ' + JSON.stringify(action.path.at(-1)) : ''} (${ms.toFixed(0)}ms)`)
      if (timed && seat === seatA) {
        if (p.kind === 'turn.activate') { acts[action.type] = (acts[action.type] ?? 0) + 1; if (legal.some((a) => a.type === 'charge.go')) acts['(offered charge.go)'] = (acts['(offered charge.go)'] ?? 0) + 1 }
        decisionsA++; msA += ms; maxMsA = Math.max(maxMsA, ms)
        if (ms > SLOW_MS) slow.push(`${p.kind} ${ms.toFixed(0)}ms work=${((deciders[seat]!.memory.stats.byKind[p.kind]?.work ?? 0) - w0).toFixed(0)} ${tag} r${state.round} ${p.id}`)
        const k = (kindMs[p.kind] ??= { n: 0, ms: 0, max: 0 }); k.n++; k.ms += ms; k.max = Math.max(k.max, ms)
      }
      if (timed && fallback) fallbacks++
      r = apply(state, bundle, p.seat === 'all' ? { ...action, seat } : action)
      // E_TODO = an engine body that is not built yet (another owner's work): the game cannot go on, but it is not a bot error
      if (!r.ok && r.rejection.code === 'E_TODO') { todo = true; failed = true; todos.push(`${tag} r${state.round} ${p.kind}: ${r.rejection.message}`); break }
      if (!r.ok) { errors.push(`${tag} r${state.round} ${p.kind}: ${seat} sent a rejected ${action.type}: ${r.rejection.code} ${r.rejection.message}`); failed = true; break }
    } catch (e) { errors.push(`${tag} r${state.round} ${p.kind}: threw ${(e as Error).stack?.split(String.fromCharCode(10)).slice(0, 3).join(' | ')}`); failed = true; break }
    state = r.state
    n++
  }
  return { state, n, seatA, deciders, log, failed, todo }
}

for (let g = OFFSET; g < OFFSET + GAMES; g++) {
  const name = NAMES[Math.floor(g / 2) % NAMES.length]!
  const gameSeed = `${SEED}-${Math.floor(g / 2)}`
  const tag = `${gameSeed}/${name}/${g % 2 ? 'B' : 'A'}-seat`
  const row = (byMatchup[name] ??= { games: 0, winsA: 0, winsB: 0, draws: 0, blocked: 0 })
  row.games++
  const cards = cardsFor(Math.floor(g / 2))
  const mrow = (byMission[cards.mission] ??= { games: 0, winsA: 0, winsB: 0, draws: 0, blocked: 0 })
  mrow.games++
  const played = playGame(g, name, gameSeed, tag, true)
  if (!played) { unfinished++; continue }
  const { state, n, seatA, deciders, log } = played
  if (played.todo) { blocked++; mrow.blocked++; row.blocked++; nonWins.push(`g${g} seed=${gameSeed} ${name} ${cards.mission}/${cards.deployment} ENGINE-TODO`); continue }
  for (const [k, v] of Object.entries(deciders[seatA]!.memory.stats.byKind)) { const w = (kindWork[k] ??= { n: 0, work: 0, capped: 0 }); w.n += v.n; w.work += v.work; w.capped += v.capped }
  for (const d of Object.values(deciders)) { policyErrors += d.memory.stats.errors; hardStops += d.memory.stats.hard }
  // a decision that stays open through 8 accepted answers in a row is an engine fault (the bot has nothing else to say): blocked, not a bot stall
  const stuckOn = n >= CAP && log.length >= 8 && new Set(log.slice(-8).map((l) => l.split(':').slice(0, 3).join(':'))).size === 1
  if (stuckOn) { blocked++; mrow.blocked++; row.blocked++; todos.push(`${tag}: decision ${log.at(-1)!.slice(0, 120)} never advances`); nonWins.push(`g${g} seed=${gameSeed} ${name} ${cards.mission}/${cards.deployment} ENGINE-STUCK`); continue }
  if (state.phase !== 'over') { unfinished++; if (n >= CAP) errors.push(`${tag}: stall, ${CAP} decisions without an end; last answers: ${log.slice(-8).map((l) => l.slice(0, 150)).join(' || ')}`) }
  else if (!state.result?.winner) { draws++; row.draws++; mrow.draws++ }
  else if (state.result.winner === seatA) { winsA++; row.winsA++; mrow.winsA++ }
  else { winsB++; row.winsB++; mrow.winsB++ }
  if (state.phase !== 'over' || state.result?.winner !== seatA) {
    nonWins.push(`g${g} seed=${gameSeed} ${name} ${cards.mission}/${cards.deployment} A=${seatA} winner=${state.result?.winner ?? '-'} vp=${JSON.stringify(Object.fromEntries(state.seatOrder.map((s) => [s, state.seats[s]!.vp])))} round=${state.round}`)
  }
  if (VERBOSE) {
    const ks = Object.values(deciders[seatA]!.memory.stats.byKind)
    const ms = ks.reduce((a, k) => a + k.ms, 0), work = ks.reduce((a, k) => a + k.work, 0)
    console.error('   ms ' + ms.toFixed(0) + ' work ' + work.toFixed(0) + ' ms/unit ' + (ms / Math.max(1, work)).toFixed(2) + ' terrain ' + state.terrain.map((t) => t.pieceId).join(','))
  }
  if (VERBOSE) console.error(`${g} ${tag} winner=${state.result?.winner ?? '-'} (A=${seatA}) vp=${JSON.stringify(Object.fromEntries(state.seatOrder.map((s) => [s, state.seats[s]!.vp])))} decisions=${n}`)
  // Determinism: the same game from the same seed must replay answer for answer (the work meter, not the clock, ends a search).
  if (!played.failed && g - OFFSET < REPLAY) {
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
  winRateDecided: GAMES - blocked ? Number((winsA / (GAMES - blocked)).toFixed(3)) : 0, engineBlocked: blocked, engineTodos: [...new Set(todos.map((t) => t.split(': ').slice(1).join(': ')))].slice(0, 5),
  msPerDecision: decisionsA ? Number((msA / decisionsA).toFixed(2)) : 0, maxMs: Number(maxMsA.toFixed(1)),
  errors: errors.length, fallbacks, policyErrors, hardStops, replays, byMatchup, byMission, activations: acts, nonWins, slow: slow.slice(0, 40), slowKinds,
  workByKind: Object.fromEntries(Object.entries(kindWork).filter(([, v]) => v.work > 0).map(([k, v]) => [k, { n: v.n, meanWork: Number((v.work / v.n).toFixed(1)), cappedPct: Number((100 * v.capped / v.n).toFixed(0)) }])),
}))
if (errors.length) { for (const e of errors.slice(0, 20)) console.error(e); process.exitCode = 1 }





