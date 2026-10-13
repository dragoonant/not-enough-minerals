import { bundle, squad, duelState } from '../../../../tests/engine/helpers'
import { arrive, deployAnswers } from '../../../../src/engine/reserves'
import { setHookTracer } from '../../../../src/engine/hooks'
const b = bundle()
let s = duelState(b, { gap: 10, roundPhase: 'movement' })
const z = squad(b, { id: 'B-zl', owner: 'B', profileId: 'zergling', models: 4, at: { x: 0, z: -14 }, location: 'reserves', upgrades: [{ id: 'burrow-ambush' }] })
s = { ...s, units: { ...s.units, 'B-zl': z.unit }, models: { ...s.models, ...Object.fromEntries(z.models.map((m) => [m.id, m])) }, active: 'B', activeUnit: 'B-zl' }
const calls: string[] = []
setHookTracer((p, c) => calls.push(`${p}:${c.cause ?? ''}`))
const entry = { kind: 'edge', segment: 0 } as any
const ans = deployAnswers(s, b, 'B-zl', entry, 1)
console.log('answers', JSON.stringify(ans))
const pend0 = s.pending.id
const r: any = arrive(s, b, 'B-zl', entry, { leaderId: ans[0]!.leaderId, path: ans[0]!.path, maxDist: 99 })
if (r.code) { console.log('REJ', r); process.exit() }
console.log(calls.join(' | '))
console.log('pending changed', r.state.pending.id !== pend0, r.state.pending.kind, JSON.stringify(r.state.pending.context).slice(0, 300))
