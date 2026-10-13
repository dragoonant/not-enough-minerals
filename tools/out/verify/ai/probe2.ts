// AI verify scratch: replay to a move/deploy/charge path decision and print every option's score parts.
import { createAiDecider, makeContext, type AiDecider } from '../../../../src/ai/decider'
import { positionValue } from '../../../../src/ai/eval'
import { localTerm, scorePaths } from '../../../../src/ai/moves'
import { threatsFor, threatAt } from '../../../../src/ai/threat'
import { newMemory } from '../../../../src/ai/types'
import { endOf } from '../../../../src/ai/world'
import { apply } from '../../../../src/engine/apply'
import { legalActions } from '../../../../src/engine/pending'
import { createGame } from '../../../../src/engine/setup'
import { view } from '../../../../src/engine/view'
import { loadBundle } from '../../../sim-core'
import { MATCHUP_OPTS } from '../../../sim-matchups'
const bundle = loadBundle()
const [seed, mu, did, mis] = process.argv.slice(2) as [string, string, string, string?]
let state = createGame(bundle, { seed, seats: ['A', 'B'], ...MATCHUP_OPTS[mu]!, missionId: mis ?? 'frontlines-skirmish', deploymentId: 'abandoned-camp' } as any)
const dec: Record<string, AiDecider> = {}
for (const s of state.seatOrder) dec[s] = createAiDecider('normal', { seed: `${seed}-${s}`, bundle, accepts: (a) => apply(state, bundle, a).ok })
let n = 0
while (state.phase !== 'over' && n < 3000 && state.pending.id !== did) {
  const p = state.pending; const seat = p.seat === 'all' ? state.seatOrder[0]! : p.seat
  const { action } = dec[seat]!.decideSync(view(state, seat), p, legalActions(state))
  state = apply(state, bundle, p.seat === 'all' ? { ...action, seat } : action).state as any; n++
}
const p = state.pending; const seat = p.seat as string; const legal = legalActions(state)
const v = view(state, seat)
const big = makeContext('normal', v, p, legal, { seed: 'probe', bundle, budgetMs: 100000 }, newMemory())
const th = threatsFor(big)
const uid = (p.context as any).unitId ?? (legal[0] as any).unitId
console.log(`at ${p.id} r${state.round} ${state.roundPhase} ${seat} ${p.kind} unit=${uid} ${state.units[uid]?.profileId}`)
for (const a of legal as any[]) {
  const e = endOf(a)
  if (!e) { console.log('  ', a.type); continue }
  const pv = state.units[uid]?.location === 'table' ? positionValue(big, uid, e, th) : { value: 0, parts: {} }
  const t = state.units[uid]?.location === 'table' ? threatAt(big, th, uid, e) : null
  console.log(`  ${e.x.toFixed(1)},${e.z.toFixed(1)} pre=${localTerm(big, e).toFixed(2)} pv=${pv.value.toFixed(2)} ${JSON.stringify(pv.parts, (k, x) => typeof x === 'number' ? +x.toFixed(2) : x)} threatAttackers=${t?.attackers.join('+')}`)
}
const small = makeContext('normal', v, p, legal, { seed: 'probe', bundle }, newMemory())
console.log('policy scorePaths (real budget):', scorePaths(small, threatsFor(small)).map((c) => `${c.end?.x.toFixed(1)},${c.end?.z.toFixed(1)}=${c.score.value.toFixed(2)}`).join(' '), 'work', small.work.n, '/', small.work.cap)
const { action } = createAiDecider('normal', { seed: `${seed}-${seat}`, bundle, accepts: (a) => apply(state, bundle, a).ok }).decideSync(v, p, legal)
console.log('chosen:', JSON.stringify(endOf(action)), action.type)
