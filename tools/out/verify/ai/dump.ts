// AI verify scratch: play one game normal vs normal and dump each decision of seat A (kind, chosen, options summary).
import { createAiDecider } from '../../../../src/ai/decider'
import { apply } from '../../../../src/engine/apply'
import { legalActions } from '../../../../src/engine/pending'
import { createGame } from '../../../../src/engine/setup'
import { view } from '../../../../src/engine/view'
import { loadBundle } from '../../../sim-core'
const bundle = loadBundle()
const seed = process.argv[2] ?? 'd0'
const armies = process.argv[3] === 'tm' ? { A: 'terran-starter', B: 'terran-starter' } : { A: 'terran-founders', B: 'zerg-founders' }
const tierB = (process.argv[4] ?? 'normal') as any
let state = createGame(bundle, { seed, seats: ['A', 'B'], armies, missionId: 'frontlines-skirmish', deploymentId: 'abandoned-camp' } as any)
const dec: any = { A: createAiDecider('normal', { seed: seed + 'A', bundle, accepts: (a) => apply(state, bundle, a).ok }), B: createAiDecider(tierB, { seed: seed + 'B', bundle, accepts: (a) => apply(state, bundle, a).ok }) }
let n = 0
const short = (a: any) => JSON.stringify(a, (k, v) => (k === 'path' && Array.isArray(v) ? `path(${v.length})->${JSON.stringify(v.at(-1))}` : typeof v === 'number' ? Math.round(v * 100) / 100 : v))
while (state.phase !== 'over' && n < 3000) {
  const p = state.pending
  const seat = p.seat === 'all' ? state.seatOrder[0]! : p.seat
  const legal = legalActions(state)
  const { action } = dec[seat].decideSync(view(state, seat), p, legal)
  const types = [...new Set(legal.map((a: any) => a.type))].join(',')
  console.log(`r${state.round} ${state.roundPhase} ${seat} ${p.kind} [${legal.length}:${types}] -> ${short(action).slice(0, 220)}`)
  const r = apply(state, bundle, p.seat === 'all' ? { ...action, seat } : action)
  if (!r.ok) { console.log('REJECT', r.rejection); break }
  for (const e of (r.state.events ?? []).slice(state.events?.length ?? 0)) { if (/score|vp|destroy|removed|charge\.|control/i.test(e.type)) console.log('   ev', JSON.stringify(e).slice(0, 200)) }
  state = r.state; n++
}
console.log('END', state.phase, JSON.stringify(state.result), JSON.stringify(Object.fromEntries(state.seatOrder.map((s) => [s, state.seats[s]!.vp]))))
for (const u of Object.values(state.units)) console.log('unit', u.owner, u.id, u.location, u.damage)
