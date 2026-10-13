// AI verify scratch: replay a normal-vs-normal game to a decision id and print the activation scores of the deciding seat.
// npx tsx tools/out/verify/ai/probe.ts <seed> <matchup> <decisionId> [mission]
import { createAiDecider, makeContext, type AiDecider } from '../../../../src/ai/decider'
import { activationValue, bestAttack, chargeValue, passValue, attackValue } from '../../../../src/ai/eval'
import { threatsFor, threatAt } from '../../../../src/ai/threat'
import { newMemory, TIERS } from '../../../../src/ai/types'
import { apply } from '../../../../src/engine/apply'
import { legalActions } from '../../../../src/engine/pending'
import { createGame } from '../../../../src/engine/setup'
import { view } from '../../../../src/engine/view'
import * as query from '../../../../src/engine/query'
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
const p = state.pending; const seat = p.seat as string
const legal = legalActions(state)
const v = view(state, seat)
const ctx = makeContext('normal', v, p, legal, { seed: 'probe', bundle, budgetMs: 100000 }, newMemory())
const th = threatsFor(ctx)
console.log(`at ${p.id} r${state.round} ${state.roundPhase} ${seat} ${p.kind}`)
for (const u of Object.values(state.units)) if (u.location === 'table') {
  const lead = state.models[u.leadingModelId!] ?? state.models[u.modelIds[0]!]
  console.log(`  unit ${u.owner} ${u.id} ${u.profileId} dmg=${u.damage} supply=${query.unitSupply(state, bundle, u.id)} at=${lead?.pos.x.toFixed(1)},${lead?.pos.z.toFixed(1)}`)
}
for (const a of legal as any[]) {
  let extra = ''
  if (a.unitId) {
    const u = a.unitId
    if (a.type === 'shoot.go') { const b = bestAttack(ctx, u); extra = `bestAttack=${b ? `${b.weaponId}->${b.targetUnitId} ${b.score.value.toFixed(2)} ${JSON.stringify(b.score.parts)}` : 'none'}` }
    if (a.type === 'charge.go') {
      const es = Object.values(state.units).filter((t) => t.owner !== seat && t.location === 'table')
      extra = es.map((t) => { const o = query.chargeOdds(state, bundle, u, [t.id]); return o.chance > 0 ? `${t.id}:p=${o.chance.toFixed(2)} cv=${chargeValue(ctx, u, [t.id]).value.toFixed(2)} ${JSON.stringify(chargeValue(ctx, u, [t.id]).parts)}` : '' }).filter(Boolean).join(' | ')
    }
    const av = activationValue(ctx, u, a.type, th)
    extra += ` actVal=${av.value.toFixed(2)}`
  }
  if (a.type === 'turn.pass') extra = `passValue=${passValue(ctx, th).value.toFixed(2)} ${JSON.stringify(passValue(ctx, th).parts)}`
  console.log(`  opt ${a.type} ${a.unitId ?? ''} ${extra}`)
}
const { action } = createAiDecider('normal', { seed: `${seed}-${seat}`, bundle, accepts: (a) => apply(state, bundle, a).ok }).decideSync(v, p, legal)
console.log('chosen (fresh memory):', JSON.stringify(action))
