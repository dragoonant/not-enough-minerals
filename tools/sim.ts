// Headless sim: npm run sim -- --games 60 --seed s [--matchup all|founders|first-battle|tt|zz|pp|tz|tp|zp] [--cap 2000]
//   [--check-every 1] [--stats] [--verbose]
// Plays the real game (setup.ts setupGame via createGame with army presets) with a seeded random decider on both seats
// and checks the engine invariants of docs/spec/60-testing.md s3: one open decision with a non-empty legal list, every
// legal option accepted by a dry-run apply, reject-never-throw on malformed input, determinism (seed + action log
// replays to the same state), state.debug never set, the 2000-decision stall cap and the step time.
// Game g plays matchup g mod N when --matchup is 'all' (the default).
// Prints one JSON line: {games, finished, avgRounds, winners, draws, decisions, errors, maxStepMs}. Exit 1 on any error.
import type { EditionBundle } from '../src/data/types'
import { apply } from '../src/engine/apply'
import type { Decider } from '../src/engine/decider'
import { legalActions } from '../src/engine/pending'
import { chargeOdds } from '../src/engine/query'
import { deriveSeed, nextFloat } from '../src/engine/rng'
import { createGame, type CreateGameOpts } from '../src/engine/setup'
import type { Action, GameState, SeatId } from '../src/engine/types'
import { view } from '../src/engine/view'
import { loadBundle } from './sim-core'
import { MATCHUP_OPTS } from './sim-matchups'

const arg = (name: string, def: string) => {
  const i = process.argv.indexOf(`--${name}`)
  return i >= 0 && process.argv[i + 1] !== undefined ? process.argv[i + 1]! : def
}
const GAMES = Number(arg('games', '3'))
const SEED = arg('seed', 's')
const MATCHUP = arg('matchup', arg('scenario', 'all'))
const CAP = Number(arg('cap', '2000')) // decisions per game before calling it a stall (spec 60 s4)
const CHECK_EVERY = Math.max(1, Number(arg('check-every', '1')))
const STATS = process.argv.includes('--stats')
const VERBOSE = process.argv.includes('--verbose')
const STEP_MS = Number(process.env.SIM_STEP_MS ?? '250') // slow-step threshold (CI runners are slow)

const MATCHUPS = MATCHUP_OPTS
const NAMES = MATCHUP === 'all' ? Object.keys(MATCHUPS) : MATCHUP.split(',')
for (const n of NAMES) if (!MATCHUPS[n]) { console.error(`sim: unknown matchup "${n}" (${Object.keys(MATCHUPS).join(', ')})`); process.exit(2) }

const fingerprint = (s: GameState) => JSON.stringify({ ...s, log: s.log.length })
// Every 4th game runs the Mission / Deployment draft; the others rotate through the data's skirmish Missions and Deployments
// (every sim army is skirmish scale, so these pools are the legal ones).
const bundleForOpts = loadBundle()
const MISSIONS = bundleForOpts.records.missions.filter((m) => m.scale === 'skirmish').map((m) => m.id)
const DEPLOYMENTS = bundleForOpts.records.deployments.filter((d) => d.scale === 'skirmish').map((d) => d.id)
const optsFor = (g: number): CreateGameOpts => ({
  seed: `${SEED}-${g}`, seats: ['A', 'B'], ...MATCHUPS[NAMES[g % NAMES.length]!]!,
  ...(g % 4 === 3 ? { draft: true } : { missionId: MISSIONS[g % MISSIONS.length]!, deploymentId: DEPLOYMENTS[(g * 7 + Math.floor(g / MISSIONS.length)) % DEPLOYMENTS.length]! }),
})

/** Seeded random bot that prefers acting over Passing (9 in 10) so games exercise the rules, not just the Pass. It also
 *  leans toward combat: it Charges and Fights when it can, picks only Charge targets that can be reached (chargeOdds > 0),
 *  never gives up a Charge path, and answers a Move path that closes on the enemy 60% of the time. */
function simDecider(seed: string, getState: () => GameState, bundle: EditionBundle): Decider {
  return {
    async decide(_view, pending, legal) {
      const [f, s2] = nextFloat(deriveSeed(seed, pending.id))
      const [g, s3] = nextFloat(s2)
      const [h] = nextFloat(s3)
      const state = getState()
      const pickFrom = (pool: Action[]) => pool[Math.floor(f * pool.length)]!
      if (pending.kind === 'charge.path') {
        const go = legal.filter((a) => a.giveUp !== true)
        if (go.length) return pickFrom(go)
      }
      if (pending.kind === 'charge.targets') {
        const reach = legal.filter((a) => {
          const ids = a.targetIds as string[] | undefined
          return !!ids && chargeOdds(state, bundle, a.unitId as string, ids).chance > 0
        })
        if (reach.length) return pickFrom(reach)
      }
      if (pending.kind === 'move.path' && g < 0.6) {
        const enemy = Object.values(state.models).filter((m) => m.life === 'active' && !m.offTable && m.owner !== pending.seat)
        const paths = legal.filter((a) => Array.isArray(a.path) && (a.path as unknown[]).length)
        if (enemy.length && paths.length) {
          const score = (a: Action) => {
            const end = (a.path as { x: number; z: number }[]).at(-1)!
            return Math.min(...enemy.map((m) => Math.hypot(m.pos.x - end.x, m.pos.z - end.z)))
          }
          return paths.reduce((best, a) => (score(a) < score(best) ? a : best))
        }
      }
      const prefer = legal.filter((a) => a.type === 'charge.go' || a.type === 'melee.go')
      if (prefer.length && h < 0.7) return pickFrom(prefer)
      const acts = legal.filter((a) => a.type !== 'turn.pass')
      const pool = acts.length && g < 0.9 ? acts : legal
      return pickFrom(pool)
    },
  }
}

interface GameOut { finished: boolean; rounds: number; winner: string | null; decisions: number; errors: string[]; maxStepMs: number; log: Action[]; final: GameState }

async function playOne(bundle: EditionBundle, g: number): Promise<GameOut> {
  const opts = optsFor(g)
  const tag = `${opts.seed}/${NAMES[g % NAMES.length]}`
  const errors: string[] = []
  const err = (s: GameState, msg: string) => { if (errors.length < 5) errors.push(`${tag} r${s.round} ${s.roundPhase ?? s.phase} ${s.pending.kind} ${s.pending.id}: ${msg}`) }
  let state: GameState
  try { state = createGame(bundle, opts) } catch (e) {
    return { finished: false, rounds: 0, winner: null, decisions: 0, errors: [`${tag}: createGame threw ${(e as Error).stack?.split('\n').slice(0, 4).join(' | ')}`], maxStepMs: 0, log: [], final: null as unknown as GameState }
  }
  const bots: Record<SeatId, Decider> = {}
  for (const seat of state.seatOrder) bots[seat] = simDecider(`${opts.seed}-${seat}`, () => state, bundle)
  let decisions = 0, maxStepMs = 0

  // Reject, never throw: a malformed action leaves the same state reference.
  const bad = apply(state, bundle, { type: 'nonsense', decisionId: 'x', seat: 'nobody' } as Action)
  if (bad.ok || bad.state !== state) err(state, 'malformed action was not rejected cleanly')

  while (state.phase !== 'over') {
    if (decisions >= CAP) { err(state, `stall: ${CAP} decisions without an end`); break }
    const p = state.pending
    const legal = legalActions(state)
    if (legal.length === 0) { err(state, 'open decision with no legal actions'); break }
    if (state.debug) { err(state, 'state.debug is set in a sim game'); break }
    try {
      if (decisions % CHECK_EVERY === 0) {
        for (const o of legal) {
          const r = apply(state, bundle, o)
          if (!r.ok) err(state, `legal option ${o.type} ${JSON.stringify(o).slice(0, 160)} rejected: ${r.rejection.code} ${r.rejection.message}`)
        }
      }
      // Purity: 1 in 20 decisions try every option on a cloned state; the live state must come out unchanged.
      if (decisions % 20 === 0) {
        const before = fingerprint(state)
        for (const o of legal) {
          const r = apply(structuredClone(state), bundle, o)
          if (!r.ok) err(state, `legal option ${o.type} rejected on a cloned state: ${r.rejection.code} ${r.rejection.message}`)
        }
        if (fingerprint(state) !== before) err(state, 'trying the legal options changed the live state')
      }
      const seat = p.seat === 'all' ? state.seatOrder[0]! : p.seat
      const action = await bots[seat]!.decide(view(state, seat), p, legal)
      const t0 = performance.now()
      const r = apply(state, bundle, action)
      const ms = performance.now() - t0
      maxStepMs = Math.max(maxStepMs, ms)
      if (ms > STEP_MS) err(state, `slow step ${action.type}: ${ms.toFixed(0)} ms`)
      if (!r.ok) { err(state, `chosen ${action.type} rejected: ${r.rejection.code} ${r.rejection.message}`); break }
      if (r.state.log.length !== state.log.length + 1) err(state, 'accepted action was not logged')
      // An accepted answer must settle the decision: the same id staying open is the stuck-Reaction / stuck-pay class.
      if (r.state.phase !== 'over' && r.state.pending.id === p.id) { err(state, `accepted ${action.type} left decision ${p.id} open`); break }
      state = r.state
      decisions++
    } catch (e) {
      err(state, `threw: ${(e as Error).stack?.split('\n').slice(0, 4).join(' | ')}`)
      break
    }
  }
  return { finished: state.phase === 'over', rounds: state.round, winner: state.result?.winner ?? null, decisions, errors, maxStepMs, log: state.log, final: state }
}

/** Determinism: replaying (seed, log) from a fresh game reproduces the final state. */
function replay(bundle: EditionBundle, g: number, out: GameOut): string | null {
  const opts = optsFor(g)
  let s = createGame(bundle, opts)
  for (const [i, a] of out.log.entries()) {
    const r = apply(s, bundle, a)
    if (!r.ok) return `${opts.seed}: replay rejected action ${i} (${a.type}): ${r.rejection.message}`
    s = r.state
  }
  return fingerprint(s) === fingerprint(out.final) ? null : `${opts.seed}: replay from seed + log diverged`
}

const bundle = loadBundle()
const t0 = performance.now()
let finished = 0, roundsSum = 0, decisions = 0, maxStepMs = 0, draws = 0
const winners: Record<string, number> = {}
const actions: Record<string, number> = {}, events: Record<string, number> = {}
const errors: string[] = []
for (let g = 0; g < GAMES; g++) {
  const out = await playOne(bundle, g)
  decisions += out.decisions
  maxStepMs = Math.max(maxStepMs, out.maxStepMs)
  errors.push(...out.errors)
  if (out.final) {
    const rp = replay(bundle, g, out)
    if (rp) errors.push(rp)
  }
  if (VERBOSE) console.error(`${g} ${NAMES[g % NAMES.length]} finished=${out.finished} r${out.rounds} winner=${out.winner} decisions=${out.decisions} errors=${out.errors.length}`)
  if (out.final) {
    for (const a of out.log) actions[a.type] = (actions[a.type] ?? 0) + 1
    for (const e of out.final.events) events[e.type] = (events[e.type] ?? 0) + 1
  }
  if (out.finished) {
    finished++
    roundsSum += out.rounds
    if (out.winner) winners[out.winner] = (winners[out.winner] ?? 0) + 1
    else draws++
  }
}
// Coverage: a sim that never fights proves nothing about combat. Per-namespace counts go to stderr; with 20+ games the run
// fails if melee.go, atk.casualty or charge.succeeded never happened.
const byNs: Record<string, number> = {}
for (const [k, v] of [...Object.entries(actions), ...Object.entries(events)]) byNs[k.split('.')[0]!] = (byNs[k.split('.')[0]!] ?? 0) + v
console.error(`coverage by namespace: ${JSON.stringify(byNs)}`)
if (GAMES >= 20) {
  const need: [string, number][] = [['melee.go', actions['melee.go'] ?? 0], ['atk.casualty', actions['atk.casualty'] ?? 0], ['charge.succeeded', events['charge.succeeded'] ?? 0]]
  for (const [name, n] of need) {
    if (n === 0) errors.push(`coverage: ${name} never happened in ${GAMES} games`)
    console.error(`coverage: ${name} = ${n}`)
  }
}
const summary = {
  games: GAMES, finished, avgRounds: finished ? Number((roundsSum / finished).toFixed(2)) : 0, winners, draws, decisions,
  errors: errors.length, maxStepMs: Number(maxStepMs.toFixed(1)), seconds: Number(((performance.now() - t0) / 1000).toFixed(1)),
  ...(STATS ? { actions, events } : {}),
}
console.log(JSON.stringify(summary))
if (errors.length) {
  for (const e of errors.slice(0, 30)) console.error(e)
  process.exitCode = 1
}
