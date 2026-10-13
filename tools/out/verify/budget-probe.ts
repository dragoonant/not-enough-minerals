// Scratch probe (reviewer): how often the work cap cuts a normal-tier decision at the client's halved budget vs the bench's.
import { makeContext, policyFor } from '../../../src/ai/decider'
import { newMemory } from '../../../src/ai/types'
import { createAiDecider } from '../../../src/ai/decider'
import { apply } from '../../../src/engine/apply'
import { legalActions } from '../../../src/engine/pending'
import { createGame } from '../../../src/engine/setup'
import type { GameState } from '../../../src/engine/types'
import { view } from '../../../src/engine/view'
import { loadBundle } from '../../sim-core'
const bundle = loadBundle()
const cut: Record<number, number> = { 75: 0, 150: 0 }
let total = 0, differ = 0
for (let g = 0; g < 4; g++) {
  let s: GameState = createGame(bundle, { seed: `b${g}`, seats: ['A', 'B'], armies: { A: g % 2 ? 'terran-starter' : 'terran-founders', B: g % 2 ? 'terran-starter' : 'zerg-founders' }, missionId: 'frontlines-skirmish', deploymentId: 'abandoned-camp' })
  const A = createAiDecider('normal', { seed: 'a', bundle, accepts: (a) => apply(s, bundle, a).ok })
  const B = createAiDecider('random', { seed: 'b', bundle })
  for (let n = 0; n < 2000 && s.phase !== 'over'; n++) {
    const p = s.pending; const seat = p.seat === 'all' ? s.seatOrder[0]! : p.seat
    const legal = legalActions(s)
    if (seat === 'A') {
      const pol = policyFor(p.kind)
      if (pol && legal.length > 1) {
        total++
        const ans: string[] = []
        for (const b of [75, 150]) {
          const ctx = makeContext('normal', view(s, seat), p, legal, { seed: 'a', bundle, budgetMs: b, now: () => 0, accepts: (a) => apply(s, bundle, a).ok }, newMemory())
          let a = null; try { a = pol(ctx) } catch { /* */ }
          if (ctx.work.n > ctx.work.cap) cut[b]!++
          ans.push(JSON.stringify(a))
        }
        if (ans[0] !== ans[1]) differ++
      }
    }
    const act = (seat === 'A' ? A : B).decideSync(view(s, seat), p, legal).action
    const r = apply(s, bundle, p.seat === 'all' ? { ...act, seat } : act); if (!r.ok) break; s = r.state
  }
}
console.log(JSON.stringify({ total, cutAt75: cut[75], cutAt150: cut[150], differentAnswers: differ }))
