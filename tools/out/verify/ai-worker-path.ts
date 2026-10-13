// Verifier scratch: play games through the worker core (handleRequest + shimAccepts, structured-cloned messages).
import { handleRequest, resetWorkerDeciders } from '../../../src/ai/worker'
import { apply } from '../../../src/engine/apply'
import { legalActions } from '../../../src/engine/pending'
import { createGame } from '../../../src/engine/setup'
import type { GameState } from '../../../src/engine/types'
import { view } from '../../../src/engine/view'
import { loadBundle } from '../../sim-core'
import { MATCHUP_OPTS } from '../../sim-matchups'
const bundle = loadBundle()
let id = 0, bad = 0, err = 0, fb = 0, dec = 0
for (const name of ['pp', 'tp', 'zp', 'founders']) {
  resetWorkerDeciders()
  let state: GameState = createGame(bundle, { seed: 'wk-' + name, seats: ['A', 'B'], ...MATCHUP_OPTS[name]!, draft: true })
  let k = 0
  while (state.phase !== 'over' && k++ < 2000) {
    const p = state.pending, seat = p.seat as string
    const req = structuredClone({ type: 'decide' as const, id: ++id, view: view(state, seat), pending: p, legal: legalActions(state), tier: 'normal' as const, seed: 'wk-' + name, memoryKey: `wk-${name}:${seat}`, budgetMs: 75 })
    const r = handleRequest(req, bundle)
    if (!r || r.type !== 'action') { err++; console.log('error', name, p.kind, r && 'message' in r ? r.message : ''); break }
    dec++; if (r.fallback) fb++
    const a = apply(state, bundle, r.action)
    if (!a.ok) { bad++; console.log('rejected', name, p.kind, a.rejection.code); break }
    state = a.state
  }
  console.log(name, state.phase, state.result?.winner, k)
}
console.log({ dec, bad, err, fb })
