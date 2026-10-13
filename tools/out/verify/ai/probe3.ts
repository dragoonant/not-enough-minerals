// AI verify scratch: why is threat 0? dump threat reach and melee previews at a spot.
import { createAiDecider, makeContext, type AiDecider } from '../../../../src/ai/decider'
import { besideTarget, edgeDist, meleeOf, rangedOf, threatsFor, threatenedBy } from '../../../../src/ai/threat'
import { newMemory } from '../../../../src/ai/types'
import { withUnitAt } from '../../../../src/ai/world'
import { apply } from '../../../../src/engine/apply'
import { legalActions } from '../../../../src/engine/pending'
import { createGame } from '../../../../src/engine/setup'
import { view } from '../../../../src/engine/view'
import * as query from '../../../../src/engine/query'
import { loadBundle } from '../../../sim-core'
import { MATCHUP_OPTS } from '../../../sim-matchups'
const bundle = loadBundle()
const [seed, mu, did, ux, uz] = process.argv.slice(2) as [string, string, string, string, string]
let state = createGame(bundle, { seed, seats: ['A', 'B'], ...MATCHUP_OPTS[mu]!, missionId: 'frontlines-skirmish', deploymentId: 'abandoned-camp' } as any)
const dec: Record<string, AiDecider> = {}
for (const s of state.seatOrder) dec[s] = createAiDecider('normal', { seed: `${seed}-${s}`, bundle, accepts: (a) => apply(state, bundle, a).ok })
let n = 0
while (state.phase !== 'over' && n < 3000 && state.pending.id !== did) {
  const p = state.pending; const seat = p.seat === 'all' ? state.seatOrder[0]! : p.seat
  const { action } = dec[seat]!.decideSync(view(state, seat), p, legalActions(state))
  state = apply(state, bundle, p.seat === 'all' ? { ...action, seat } : action).state as any; n++
}
const p = state.pending; const seat = p.seat as string; const legal = legalActions(state)
const ctx = makeContext('normal', view(state, seat), p, legal, { seed: 'probe', bundle, budgetMs: 100000 }, newMemory())
const th = threatsFor(ctx)
const uid = (p.context as any).unitId
const at = { x: Number(ux), z: Number(uz) }
console.log('reach', JSON.stringify(th.reach, (k, x) => typeof x === 'number' ? +x.toFixed(2) : x))
console.log('threatenedBy', threatenedBy(ctx, th, at))
const shim = withUnitAt(ctx.q, uid, at)
for (const eid of Object.keys(th.reach)) {
  console.log(eid, ctx.q.units[eid]!.profileId, 'edge', edgeDist(shim, eid, uid).toFixed(2), 'reachOf', JSON.stringify(query.reachOf(ctx.q, bundle, eid)), 'melee', meleeOf(ctx, shim, eid).map((w) => w.id), 'ranged', rangedOf(ctx, shim, eid).map((w) => `${w.id}:${w.range}`))
  const s3 = besideTarget(shim, eid, uid)
  for (const w of meleeOf(ctx, s3, eid)) { const pv = query.attackPreview(s3, bundle, eid, w.id, uid); console.log('   melee', w.id, pv.legal, pv.reason, pv.expectedSupplyRemoved.toFixed(2), 'engaged', query.engaged(s3, bundle, eid)) }
  for (const w of rangedOf(ctx, shim, eid)) { const pv = query.attackPreview(shim, bundle, eid, w.id, uid); console.log('   ranged-now', w.id, pv.legal, pv.reason, pv.expectedSupplyRemoved.toFixed(2)) }
}
console.log('unit supply of mover', query.unitSupply(ctx.q, bundle, uid), 'phase', state.roundPhase)
