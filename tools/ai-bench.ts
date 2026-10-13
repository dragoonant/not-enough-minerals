// AI bench (spec 40): tier A vs tier B with alternating seats. M4's gate is normal >= 95% wins vs random.
// Run: npm run bench:ai -- --games 100 --seed s --a normal --b random [--cap 2000]
// Tier A sits in seat 0 on even games and seat 1 on odd games. Deciders see only view(state, seat); the host dry run
// (apply(...).ok on the real state) is their accepts check, as in the client.
// Prints one JSON line: {games, winsA, winsB, draws, unfinished, winRateA, msPerDecision, maxMs, fallbacks, errors}.
// M0: the placeholder turn flow always ends in a draw, so this only proves the loop runs.
import { createAiDecider, type AiDecider } from '../src/ai/decider'
import { TIER_IDS, type Tier } from '../src/ai/types'
import { apply } from '../src/engine/apply'
import { legalActions } from '../src/engine/pending'
import { createGame } from '../src/engine/setup'
import type { GameState, SeatId } from '../src/engine/types'
import { view } from '../src/engine/view'
import { loadBundle } from './sim-core'

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

const bundle = loadBundle()
let winsA = 0, winsB = 0, draws = 0, unfinished = 0, decisions = 0, msSum = 0, maxMs = 0, fallbacks = 0
const errors: string[] = []
for (let g = 0; g < GAMES; g++) {
  const gameSeed = `${SEED}-${g}`
  let state: GameState = createGame(bundle, { seed: gameSeed })
  const seatA = state.seatOrder[g % 2]!
  const deciders: Record<SeatId, AiDecider> = {}
  for (const seat of state.seatOrder) {
    const tier = seat === seatA ? TIER_A : TIER_B
    deciders[seat] = createAiDecider(tier, { seed: `${gameSeed}-${seat}`, bundle, accepts: (a) => apply(state, bundle, a).ok })
  }
  let n = 0
  while (state.phase !== 'over' && n < CAP) {
    const p = state.pending
    const seat = p.seat === 'all' ? state.seatOrder[0]! : p.seat
    const t0 = performance.now()
    const { action, fallback } = deciders[seat]!.decideSync(view(state, seat), p, legalActions(state))
    const ms = performance.now() - t0
    msSum += ms; maxMs = Math.max(maxMs, ms); if (fallback) fallbacks++
    const r = apply(state, bundle, action)
    if (!r.ok) { errors.push(`${gameSeed}: ${seat} sent a rejected ${action.type}: ${r.rejection.code}`); break }
    state = r.state
    n++; decisions++
  }
  if (state.phase !== 'over') unfinished++
  else if (!state.result?.winner) draws++
  else if (state.result.winner === seatA) winsA++
  else winsB++
}
console.log(JSON.stringify({
  games: GAMES, a: TIER_A, b: TIER_B, winsA, winsB, draws, unfinished, winRateA: GAMES ? Number((winsA / GAMES).toFixed(3)) : 0,
  msPerDecision: decisions ? Number((msSum / decisions).toFixed(2)) : 0, maxMs: Number(maxMs.toFixed(1)), fallbacks, errors: errors.length,
}))
if (errors.length) { for (const e of errors.slice(0, 20)) console.error(e); process.exitCode = 1 }
