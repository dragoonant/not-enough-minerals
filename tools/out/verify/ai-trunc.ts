// Verifier scratch: turn.activate answers with the work cap vs uncapped; index of the uncapped pick in the menu.
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
let n = 0, capped = 0, differ = 0
const ex: string[] = []
for (const name of ['pp', 'tz', 'founders', 'tp']) {
  let state: GameState = createGame(bundle, { seed: 't-' + name, seats: ['A', 'B'], ...MATCHUP_OPTS[name]!, missionId: 'frontlines-skirmish', deploymentId: 'abandoned-camp' })
  const ds = Object.fromEntries(state.seatOrder.map((s) => [s, createAiDecider('normal', { seed: 'w' + s, bundle, accepts: (a) => apply(state, bundle, a).ok })]))
  let k = 0
  while (state.phase !== 'over' && k++ < 2000) {
    const p = state.pending, seat = p.seat as string, legal = legalActions(state), v = view(state, seat)
    if (p.kind === 'turn.activate' && legal.length > 1) {
      n++
      const c1 = makeContext('normal', v, p, legal, { seed: 'x', bundle }, newMemory())
      const a1 = policyFor(p.kind)!(c1)
      if (c1.work.n > c1.work.cap) {
        capped++
        const c2 = makeContext('normal', v, p, legal, { seed: 'x', bundle, budgetMs: 1e6 }, newMemory())
        const a2 = policyFor(p.kind)!(c2)
        if (JSON.stringify(a1) !== JSON.stringify(a2)) { differ++; if (ex.length < 8) ex.push(`${name} r${state.round} ${state.roundPhase}: capped=${a1?.type}/${a1?.unitId} (idx ${legal.findIndex((x) => JSON.stringify(x) === JSON.stringify(a1))}) uncapped=${a2?.type}/${a2?.unitId} (idx ${legal.findIndex((x) => JSON.stringify(x) === JSON.stringify(a2))} of ${legal.length})`) }
      }
    }
    const r = apply(state, bundle, ds[seat]!.decideSync(v, p, legal).action)
    state = r.ok ? r.state : state
  }
}
console.log({ n, capped, differ }); for (const e of ex) console.log(e)
