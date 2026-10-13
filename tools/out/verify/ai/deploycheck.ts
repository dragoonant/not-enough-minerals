// AI verify scratch: deploy.path answers vs the threat each offered arrival spot would face (AI's own threatAt).
import { createAiDecider, makeContext, type AiDecider } from '../../../../src/ai/decider'
import { threatAt, threatsFor } from '../../../../src/ai/threat'
import { newMemory } from '../../../../src/ai/types'
import { leaderOf } from '../../../../src/ai/world'
import { apply } from '../../../../src/engine/apply'
import { legalActions } from '../../../../src/engine/pending'
import { createGame } from '../../../../src/engine/setup'
import { view } from '../../../../src/engine/view'
import type { GameState } from '../../../../src/engine/types'
import { loadBundle } from '../../../sim-core'
import { MATCHUP_OPTS } from '../../../sim-matchups'
const bundle = loadBundle()
const MU = ['founders', 'tt', 'tz', 'zp']
let n2 = 0, worse = 0; const ex: string[] = []
const thr = (s: GameState, seat: string, u: string) => { const v = view(s, seat); const ctx = makeContext('normal', v, s.pending, legalActions(s), { seed: 'x', bundle, budgetMs: 1e6 }, newMemory()); const l = leaderOf(ctx.q, u); return l ? threatAt(ctx, threatsFor(ctx), u, l.pos).expSupply : 0 }
for (let g = 0; g < 12; g++) {
  const mu = MU[g % MU.length]!; const seed = `dp-${g}`
  let state = createGame(bundle, { seed, seats: ['A', 'B'], ...MATCHUP_OPTS[mu]!, missionId: 'frontlines-skirmish', deploymentId: 'abandoned-camp' } as any)
  const dec: Record<string, AiDecider> = {}
  for (const s of state.seatOrder) dec[s] = createAiDecider('normal', { seed: `${seed}-${s}`, bundle, accepts: (a) => apply(state, bundle, a).ok })
  let n = 0
  while (state.phase !== 'over' && n < 3000) {
    const p = state.pending; const seat = p.seat === 'all' ? state.seatOrder[0]! : p.seat
    const legal = legalActions(state)
    const { action } = dec[seat]!.decideSync(view(state, seat), p, legal)
    if (p.kind === 'deploy.path' && state.round >= 2 && legal.length > 1) {
      n2++
      const u = (action as any).unitId
      const t = legal.map((o) => { const r = apply(state, bundle, o); return r.ok ? thr(r.state, seat, u) : Infinity })
      const mine = t[legal.indexOf(legal.find((o) => JSON.stringify(o) === JSON.stringify({ ...action }))!)] ?? thr(apply(state, bundle, action).state, seat, u)
      const min = Math.min(...t)
      if (mine - min > 0.3) { worse++; if (ex.length < 8) ex.push(`${seed}/${mu} r${state.round} ${p.id} ${u}(${state.units[u]!.profileId}) chosenThreat=${mine.toFixed(2)} minThreat=${min.toFixed(2)} all=${t.map((x) => x.toFixed(2)).join(',')}`) }
    }
    state = apply(state, bundle, p.seat === 'all' ? { ...action, seat } : action).state as any; n++
  }
}
console.log({ n2, worse }); console.log(ex.join('\n'))
