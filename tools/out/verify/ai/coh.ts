// AI verify scratch: does a tier-A move/charge/deploy answer leave its own unit Out of Coherency?
import { createAiDecider, type AiDecider } from '../../../../src/ai/decider'
import { apply } from '../../../../src/engine/apply'
import { legalActions } from '../../../../src/engine/pending'
import { createGame } from '../../../../src/engine/setup'
import { view } from '../../../../src/engine/view'
import * as query from '../../../../src/engine/query'
import type { GameState } from '../../../../src/engine/types'
import { loadBundle } from '../../../sim-core'
import { MATCHUP_OPTS } from '../../../sim-matchups'
const bundle = loadBundle()
const MU = ['founders', 'tt', 'zz', 'pp', 'tz', 'zp']
const coh = (s: GameState, u: string) => { const ms = s.units[u]!.modelIds.map((id) => s.models[id]!).filter((m) => m.life === 'active' && !m.offTable); return ms.length < 2 || query.coherencyPreview(s, bundle, u, Object.fromEntries(ms.map((m) => [m.id, m.pos]))).inCoherency }
const c: Record<string, number> = {}; const ex: string[] = []
for (let g = 0; g < 12; g++) {
  const mu = MU[g % MU.length]!; const seed = `co-${g}`
  let state = createGame(bundle, { seed, seats: ['A', 'B'], ...MATCHUP_OPTS[mu]!, missionId: 'frontlines-skirmish', deploymentId: 'abandoned-camp' } as any)
  const dec: Record<string, AiDecider> = {}
  for (const s of state.seatOrder) dec[s] = createAiDecider('normal', { seed: `${seed}-${s}`, bundle, accepts: (a) => apply(state, bundle, a).ok })
  let n = 0
  while (state.phase !== 'over' && n < 3000) {
    const p = state.pending; const seat = p.seat === 'all' ? state.seatOrder[0]! : p.seat
    const legal = legalActions(state)
    const { action } = dec[seat]!.decideSync(view(state, seat), p, legal)
    const a: any = action
    const next = apply(state, bundle, p.seat === 'all' ? { ...action, seat } : action).state as GameState
    if (['move.path', 'charge.path', 'deploy.path'].includes(p.kind) && a.unitId && next.units[a.unitId]?.location === 'table') {
      c[p.kind] = (c[p.kind] ?? 0) + 1
      if (!coh(next, a.unitId)) {
        const alt = legal.filter((o: any) => o.leaderId && o !== a).some((o: any) => { const r = apply(state, bundle, o); return r.ok && coh(r.state, a.unitId) })
        c[`${p.kind}-outOfCoh`] = (c[`${p.kind}-outOfCoh`] ?? 0) + 1
        if (alt) { c[`${p.kind}-outOfCoh-avoidable`] = (c[`${p.kind}-outOfCoh-avoidable`] ?? 0) + 1; if (ex.length < 8) ex.push(`${seed}/${mu} r${state.round} ${p.id} ${a.unitId}(${state.units[a.unitId]!.profileId})`) }
      }
    }
    state = next; n++
  }
}
console.log(c); console.log(ex.join('\n'))
