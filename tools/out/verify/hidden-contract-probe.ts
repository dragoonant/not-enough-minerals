// Scratch probe (reviewer): long-range targets dropped by eval.bestAttack's pre-filter; hidden units in charge slots.
import { makeContext } from '../../../src/ai/decider'
import { bestAttack } from '../../../src/ai/eval'
import { edgeDist, rangedOf } from '../../../src/ai/threat'
import { newMemory } from '../../../src/ai/types'
import { enemyUnitsOf, unitsOf } from '../../../src/ai/world'
import { createRandomDecider } from '../../../src/engine/decider'
import { apply } from '../../../src/engine/apply'
import { legalActions } from '../../../src/engine/pending'
import * as query from '../../../src/engine/query'
import { hasStatus } from '../../../src/engine/effects'
import { createGame } from '../../../src/engine/setup'
import type { GameState } from '../../../src/engine/types'
import { view } from '../../../src/engine/view'
import { loadBundle } from '../../sim-core'

const bundle = loadBundle()
const ups = [['terran-starter', 'terran-starter'], ['terran-starter', 'zerg-starter'], ['terran-starter', 'protoss-starter'], ['zerg-starter', 'protoss-starter']]
let lrMiss = 0, lrExample = '', bestNullButLegal = 0, hiddenSlot = 0, hiddenEx = ''
for (let g = 0; g < 12; g++) {
  const [a, b] = ups[g % ups.length]!
  let s: GameState = createGame(bundle, { seed: `p${g}`, seats: ['A', 'B'], armies: { A: a!, B: b! }, missionId: 'frontlines-skirmish', deploymentId: 'abandoned-camp' })
  const d = { A: createRandomDecider(`a${g}`), B: createRandomDecider(`b${g}`) }
  for (let n = 0; n < 1500 && s.phase !== 'over'; n++) {
    const p = s.pending
    const seat = p.seat === 'all' ? s.seatOrder[0]! : p.seat
    if (s.roundPhase === 'assault' && n % 3 === 0) {
      const v = view(s, seat)
      const ctx = makeContext('normal', v, p, legalActions(s), { seed: 'x', bundle, budgetMs: 100000 }, newMemory())
      for (const u of unitsOf(ctx.q, seat)) {
        let anyLegal = false
        for (const w of rangedOf(ctx, ctx.q, u.id)) for (const e of enemyUnitsOf(ctx.q, seat)) {
          const pv = query.attackPreview(ctx.q, bundle, u.id, w.id, e.id)
          if (!pv.legal) continue
          anyLegal = true
          const dd = edgeDist(ctx.q, u.id, e.id)
          const r = typeof w.range === 'number' ? w.range : 0
          if (dd > r + 0.5 && pv.expectedDamage > 0) { lrMiss++; if (!lrExample || Math.random() < 0.1) lrExample = `${u.id} ${w.id} range ${r} -> ${e.id} at ${dd.toFixed(1)}" legal, exp ${pv.expectedSupplyRemoved.toFixed(2)}` }
        }
        if (anyLegal && !bestAttack(ctx, u.id)) bestNullButLegal++
        // charge slots: nearest three by leader distance include uncharacteable HIDDEN enemies while a further one is chargeable
        const near = enemyUnitsOf(ctx.q, seat).map((e) => ({ e, dd: edgeDist(ctx.q, u.id, e.id) })).sort((x, y) => x.dd - y.dd)
        if (near.length > 3) {
          const top = near.slice(0, 3), rest = near.slice(3)
          const topHidden = top.filter((x) => hasStatus(ctx.q, x.e.id, 'HIDDEN') && query.chargeOdds(ctx.q, bundle, u.id, [x.e.id]).chance === 0)
          const restOk = rest.find((x) => query.chargeOdds(ctx.q, bundle, u.id, [x.e.id]).chance > 0)
          if (topHidden.length && restOk && !top.some((x) => query.chargeOdds(ctx.q, bundle, u.id, [x.e.id]).chance > 0)) { hiddenSlot++; if (!hiddenEx) hiddenEx = `${u.id}: nearest ${top.map((x) => x.e.id).join(',')} unchargeable (hidden ${topHidden.map((x) => x.e.id)}), ${restOk.e.id} chargeable` }
        }
      }
    }
    const legal = legalActions(s)
    const act = await d[seat as 'A' | 'B'].decide(view(s, seat), p, legal)
    const r = apply(s, bundle, p.seat === 'all' ? { ...act, seat } : act)
    if (!r.ok) break
    s = r.state
  }
}
console.log(JSON.stringify({ lrMiss, lrExample, bestNullButLegal, hiddenSlot, hiddenEx }))
