// AI verify scratch: does the work cap change turn.activate / move / charge answers (options never scored)?
import { createAiDecider, type AiDecider } from '../../../../src/ai/decider'
import { newMemory } from '../../../../src/ai/types'
import { apply } from '../../../../src/engine/apply'
import { legalActions } from '../../../../src/engine/pending'
import { createGame } from '../../../../src/engine/setup'
import { view } from '../../../../src/engine/view'
import { loadBundle } from '../../../sim-core'
import { MATCHUP_OPTS } from '../../../sim-matchups'
const bundle = loadBundle()
const MU = ['founders', 'tt', 'tz', 'pp']
const c: Record<string, number> = {}; const ex: string[] = []
for (let g = 0; g < 8; g++) {
  const mu = MU[g % MU.length]!; const seed = `cap-${g}`
  let state = createGame(bundle, { seed, seats: ['A', 'B'], ...MATCHUP_OPTS[mu]!, missionId: 'frontlines-skirmish', deploymentId: 'abandoned-camp' } as any)
  const dec: Record<string, AiDecider> = {}
  for (const s of state.seatOrder) dec[s] = createAiDecider('normal', { seed: `${seed}-${s}`, bundle, accepts: (a) => apply(state, bundle, a).ok })
  let n = 0
  while (state.phase !== 'over' && n < 3000) {
    const p = state.pending; const seat = p.seat === 'all' ? state.seatOrder[0]! : p.seat
    const legal = legalActions(state)
    const { action } = dec[seat]!.decideSync(view(state, seat), p, legal)
    if (['turn.activate', 'charge.targets', 'shoot.batch', 'move.path'].includes(p.kind) && legal.length > 1) {
      const big = createAiDecider('normal', { seed: `${seed}-${seat}`, bundle, budgetMs: 1e6, memory: newMemory(), accepts: (a) => apply(state, bundle, a).ok }).decideSync(view(state, seat), p, legal).action
      const small = createAiDecider('normal', { seed: `${seed}-${seat}`, bundle, memory: newMemory(), accepts: (a) => apply(state, bundle, a).ok }).decideSync(view(state, seat), p, legal).action
      const k = (a: any) => JSON.stringify({ ...a, decisionId: 0 })
      c[p.kind] = (c[p.kind] ?? 0) + 1
      if (k(big) !== k(small)) { c[`${p.kind}-differs`] = (c[`${p.kind}-differs`] ?? 0) + 1; if (ex.length < 10) ex.push(`${seed}/${mu} r${state.round} ${state.roundPhase} ${p.id} legal=${legal.length} capped=${(small as any).type}:${(small as any).unitId ?? ''}${(small as any).targetUnitId ?? ''} full=${(big as any).type}:${(big as any).unitId ?? ''}${(big as any).targetUnitId ?? ''}`) }
    }
    state = apply(state, bundle, p.seat === 'all' ? { ...action, seat } : action).state as any; n++
  }
}
console.log(c); console.log(ex.join('\n'))
