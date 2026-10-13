// AI verify scratch: when tier A picks shoot.go with a near-worthless shot, could a Run have taken/flipped a marker?
import { createAiDecider, makeContext, type AiDecider } from '../../../../src/ai/decider'
import { bestAttack, objectiveValue } from '../../../../src/ai/eval'
import { toward } from '../../../../src/ai/threat'
import { newMemory } from '../../../../src/ai/types'
import { leaderOf } from '../../../../src/ai/world'
import { apply } from '../../../../src/engine/apply'
import { legalActions } from '../../../../src/engine/pending'
import { createGame } from '../../../../src/engine/setup'
import { view } from '../../../../src/engine/view'
import * as query from '../../../../src/engine/query'
import { loadBundle } from '../../../sim-core'
import { MATCHUP_OPTS } from '../../../sim-matchups'
const bundle = loadBundle()
const arg = (n: string, d: string) => { const i = process.argv.indexOf(`--${n}`); return i >= 0 ? process.argv[i + 1]! : d }
const GAMES = Number(arg('games', '8')); const MU = arg('matchups', 'founders,tt').split(','); const MIS = arg('mission', 'hold-position-skirmish')
let shots = 0, weak = 0, weakRunFlip = 0; const ex: string[] = []
for (let g = 0; g < GAMES; g++) {
  const mu = MU[g % MU.length]!; const seed = `rs-${g}`
  let state = createGame(bundle, { seed, seats: ['A', 'B'], ...MATCHUP_OPTS[mu]!, missionId: MIS, deploymentId: 'abandoned-camp' } as any)
  const dec: Record<string, AiDecider> = {}
  for (const s of state.seatOrder) dec[s] = createAiDecider('normal', { seed: `${seed}-${s}`, bundle, accepts: (a) => apply(state, bundle, a).ok })
  let n = 0
  while (state.phase !== 'over' && n < 3000) {
    const p = state.pending; const seat = p.seat === 'all' ? state.seatOrder[0]! : p.seat
    const legal = legalActions(state)
    const { action } = dec[seat]!.decideSync(view(state, seat), p, legal)
    const a: any = action
    if (p.kind === 'turn.activate' && a.type === 'shoot.go' && legal.some((o: any) => o.type === 'move.run' && o.unitId === a.unitId)) {
      shots++
      const ctx = makeContext('normal', view(state, seat), p, legal, { seed: 'x', bundle, budgetMs: 100000 }, newMemory())
      const b = bestAttack(ctx, a.unitId)
      const ev = b ? (b.score.parts.supply ?? 0) + (b.score.parts.kill ?? 0) : 0
      if (ev < 0.25) {
        weak++
        const run = query.reachOf(state, bundle, a.unitId).run ?? 0
        const lead = leaderOf(ctx.q, a.unitId)!
        let best = 0
        for (const m of state.markers.filter((m) => m.onTable)) best = Math.max(best, objectiveValue(ctx, a.unitId, toward(lead.pos, m.pos, run)))
        if (best >= 1) { weakRunFlip++; if (ex.length < 6) ex.push(`${seed}/${mu} r${state.round} ${p.id} ${a.unitId}(${state.units[a.unitId]!.profileId}) shotEV=${ev.toFixed(2)} runObjective=${best.toFixed(2)}`) }
      }
    }
    state = apply(state, bundle, p.seat === 'all' ? { ...action, seat } : action).state as any; n++
  }
}
console.log({ shots, weak, weakRunFlip }); console.log(ex.join('\n'))
