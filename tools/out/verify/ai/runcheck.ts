// AI verify scratch: at a turn.activate decision, compare the chosen shoot.go with the real Run end spots (objectiveStatus).
import { createAiDecider, type AiDecider } from '../../../../src/ai/decider'
import { apply } from '../../../../src/engine/apply'
import { legalActions } from '../../../../src/engine/pending'
import { createGame } from '../../../../src/engine/setup'
import { view } from '../../../../src/engine/view'
import * as query from '../../../../src/engine/query'
import { endOf, withUnitAt } from '../../../../src/ai/world'
import { loadBundle } from '../../../sim-core'
import { MATCHUP_OPTS } from '../../../sim-matchups'
const bundle = loadBundle()
const [seed, mu, did, unit, mis] = process.argv.slice(2) as [string, string, string, string, string?]
let state = createGame(bundle, { seed, seats: ['A', 'B'], ...MATCHUP_OPTS[mu]!, missionId: mis ?? 'hold-position-skirmish', deploymentId: 'abandoned-camp' } as any)
const dec: Record<string, AiDecider> = {}
for (const s of state.seatOrder) dec[s] = createAiDecider('normal', { seed: `${seed}-${s}`, bundle, accepts: (a) => apply(state, bundle, a).ok })
let n = 0
while (state.phase !== 'over' && n < 3000 && state.pending.id !== did) {
  const p = state.pending; const seat = p.seat === 'all' ? state.seatOrder[0]! : p.seat
  const { action } = dec[seat]!.decideSync(view(state, seat), p, legalActions(state))
  state = apply(state, bundle, p.seat === 'all' ? { ...action, seat } : action).state as any; n++
}
const seat = state.pending.seat as string
const shots = query.shootOptions(state, bundle, unit)
console.log('shoot options', JSON.stringify(shots.weapons.map((w) => ({ w: w.weaponId, t: w.targets.filter((t) => t.eligible).map((t) => { const pv = query.attackPreview(state, bundle, unit, w.weaponId, t.targetUnitId); return `${t.targetUnitId}:exp=${pv.expectedSupplyRemoved.toFixed(2)} kill=${pv.killChance.toFixed(2)} dmg=${pv.expectedDamage.toFixed(2)}` }) }))))
const base = query.missionScore(state, bundle, seat).vpIfScoredNow
let s2 = state
let r = apply(s2, bundle, { type: 'move.run', unitId: unit, seat, decisionId: state.pending.id } as any)
if (!r.ok) { console.log('run rejected', r.rejection); process.exit(0) }
s2 = r.state
while (s2.pending.kind !== 'move.path') { const l = legalActions(s2); const done = l.find((a: any) => a.type === 'ability.done') ?? l[0]!; s2 = apply(s2, bundle, done).state }
console.log('vpIfScoredNow now', base, 'objectives now', JSON.stringify(query.objectiveStatus(state, bundle).map((o) => [o.n, o.controller, o.totals])))
for (const a of legalActions(s2) as any[]) {
  const e = endOf(a); if (!e) continue
  const sh = withUnitAt(s2, unit, e)
  console.log(' run end', e.x.toFixed(1), e.z.toFixed(1), 'vpIfScoredNow', query.missionScore(sh, bundle, seat).vpIfScoredNow, JSON.stringify(query.objectiveStatus(sh, bundle).map((o) => [o.n, o.controller])))
}
