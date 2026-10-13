// Verifier scratch: cost of query.chargeOdds inside charge.targets decisions (unmetered by timeUp).
import { createAiDecider, makeContext, policyFor } from '../../../src/ai/decider'
import { newMemory } from '../../../src/ai/types'
import { apply } from '../../../src/engine/apply'
import { legalActions } from '../../../src/engine/pending'
import * as query from '../../../src/engine/query'
import { createGame } from '../../../src/engine/setup'
import type { GameState } from '../../../src/engine/types'
import { view } from '../../../src/engine/view'
import { loadBundle } from '../../sim-core'
import { MATCHUP_OPTS } from '../../sim-matchups'
const bundle = loadBundle()
for (const name of ['pp', 'tz', 'founders']) {
  let state: GameState = createGame(bundle, { seed: 'w-' + name, seats: ['A', 'B'], ...MATCHUP_OPTS[name]!, missionId: 'frontlines-skirmish', deploymentId: 'abandoned-camp' })
  const ds = Object.fromEntries(state.seatOrder.map((s) => [s, createAiDecider('normal', { seed: 'w' + s, bundle, accepts: (a) => apply(state, bundle, a).ok })]))
  let k = 0
  while (state.phase !== 'over' && k++ < 2000) {
    const p = state.pending, seat = p.seat as string, legal = legalActions(state), v = view(state, seat)
    if (p.kind === 'charge.targets') {
      const ctx = makeContext('normal', v, p, legal, { seed: 'probe', bundle }, newMemory())
      let calls = 0, ms = 0
      for (const a of legal) { if (!Array.isArray(a.targetIds)) continue; const t0 = performance.now(); query.chargeOdds(ctx.q, bundle, a.unitId as string, a.targetIds as string[]); ms += performance.now() - t0; calls++ }
      const t1 = performance.now(); policyFor(p.kind)!(ctx); const pm = performance.now() - t1
      if (pm > 60) console.log(name, 'options', legal.length, 'chargeOdds calls', calls, 'sum', ms.toFixed(0), 'ms; policy', pm.toFixed(0), 'ms, work', ctx.work.n)
    }
    const r = apply(state, bundle, ds[seat]!.decideSync(v, p, legal).action)
    state = r.ok ? r.state : state
  }
}
