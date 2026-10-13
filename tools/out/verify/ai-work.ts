// Verifier scratch: per decision, wall ms vs work units (timeUp calls) to check WORK_PER_MS calibration.
import { createAiDecider, makeContext, policyFor } from '../../../src/ai/decider'
import { newMemory } from '../../../src/ai/types'
import { apply } from '../../../src/engine/apply'
import { legalActions } from '../../../src/engine/pending'
import { createGame } from '../../../src/engine/setup'
import type { GameState } from '../../../src/engine/types'
import { view } from '../../../src/engine/view'
import { loadBundle } from '../../sim-core'
import { MATCHUP_OPTS } from '../../sim-matchups'
const bundle = loadBundle()
const rows: { kind: string; ms: number; n: number; cap: number }[] = []
for (const name of (process.argv[2] ?? 'pp,tz').split(',')) {
  let state: GameState = createGame(bundle, { seed: 'w-' + name, seats: ['A', 'B'], ...MATCHUP_OPTS[name]!, missionId: 'frontlines-skirmish', deploymentId: 'abandoned-camp' })
  const ds = Object.fromEntries(state.seatOrder.map((s) => [s, createAiDecider('normal', { seed: 'w' + s, bundle, accepts: (a) => apply(state, bundle, a).ok })]))
  const mem = Object.fromEntries(state.seatOrder.map((s) => [s, newMemory()]))
  let k = 0
  while (state.phase !== 'over' && k++ < 2000) {
    const p = state.pending, seat = p.seat as string, legal = legalActions(state), v = view(state, seat)
    const pol = policyFor(p.kind)
    if (pol) {
      const ctx = makeContext('normal', v, p, legal, { seed: 'probe', bundle, accepts: (a) => apply(state, bundle, a).ok }, mem[seat]!)
      const t0 = performance.now()
      try { pol(ctx) } catch {}
      rows.push({ kind: p.kind, ms: performance.now() - t0, n: ctx.work.n, cap: ctx.work.cap })
    }
    const r = apply(state, bundle, ds[seat]!.decideSync(v, p, legal).action)
    if (!r.ok) throw new Error('rejected')
    state = r.state
  }
}
rows.sort((a, b) => b.ms - a.ms)
for (const r of rows.slice(0, 15)) console.log(r.kind, r.ms.toFixed(0), 'ms', r.n, '/', r.cap, (r.ms / Math.max(1, r.n)).toFixed(2), 'ms/unit')
const capped = rows.filter((r) => r.n > r.cap).length
console.log('decisions', rows.length, 'hit cap', capped, 'over 150ms', rows.filter((r) => r.ms > 150).length)
