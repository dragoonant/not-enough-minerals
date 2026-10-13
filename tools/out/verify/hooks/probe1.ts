import { bundle, squad, duelState, withForcedDice } from '../../../../tests/engine/helpers'
import { declareBatch } from '../../../../src/engine/shooting'
import { setHookTracer } from '../../../../src/engine/hooks'
const b = bundle(); for (const u of (b.records.units as any)) for (const a of u.abilities) if (a.id==='point-defense-laser' && process.env.NOATK) delete a.trigger.attack
let s = duelState(b, { gap: 10 })
// replace zerglings with hydralisks (ranged) for B
const h = squad(b, { id: 'B-hydra', owner: 'B', profileId: 'hydralisk', models: 2, at: { x: 0, z: -5 } })
const d = squad(b, { id: 'A-pdd', owner: 'A', profileId: 'point-defense-drone', models: 1, at: { x: 4, z: 6 } })
const art = squad(b, { id: 'A-art', owner: 'A', profileId: 'artanis', models: 1, at: { x: -4, z: 6 } })
const units: any = { 'A-marines': s.units['A-marines'], 'B-hydra': h.unit, 'A-pdd': d.unit, 'A-art': art.unit }
const models: any = {}
for (const [id, m] of Object.entries(s.models)) if (m.unitId === 'A-marines') models[id] = m
for (const m of [...h.models, ...d.models, ...art.models]) models[m.id] = m
s = { ...s, units, models, active: 'B', activeUnit: 'B-hydra', seats: { ...s.seats, A: { ...s.seats.A!, faction: 'protoss' } } }
// give A some PE? check resources
console.log('resources', JSON.stringify((s as any).seats.A.resources ?? (s as any).seats.A))
const calls: string[] = []
setHookTracer((p, c) => calls.push(`${p}:${c.cause ?? ''}:batch=${!!c.batch}:${c.batch?.kind ?? ''}`))
s = withForcedDice(s, Array(40).fill(4))
const w = b.records.units.find((u: any) => u.id === 'hydralisk')!.weapons.find((x: any) => x.phase === 'assault')!.id
const r: any = declareBatch(s, b, 'B-hydra', w, 'A-marines')
if (r.code) { console.log('REJ', r); process.exit() }
console.log(calls.slice(0, 12).join('\n'))
console.log('pending', r.state.pending.kind, JSON.stringify(r.state.pending.options?.map((o: any) => o.id)))
console.log('pdd alive', Object.values(r.state.models).filter((m: any) => m.unitId === 'A-pdd' && m.life === 'active').length)
console.log('events', r.state.events.slice(-30).map((e: any) => e.type + (e.stage ? ':' + e.stage : '') + (e.dice ? ':' + (e.dice.length ?? '') : '')).join(' '))
