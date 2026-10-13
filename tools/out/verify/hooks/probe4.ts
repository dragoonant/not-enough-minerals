import { bundle, squad, duelState } from '../../../../tests/engine/helpers'
import { runHook } from '../../../../src/engine/hooks'
import { addEffect } from '../../../../src/engine/effects'
const b = bundle()
let s = duelState(b, { gap: 10, roundPhase: 'scoring' })
const ad = squad(b, { id: 'A-adept', owner: 'A', profileId: 'adept', models: 2, at: { x: 8, z: 8 } })
s = { ...s, units: { ...s.units, 'A-adept': ad.unit }, models: { ...s.models, ...Object.fromEntries(ad.models.map((m) => [m.id, m])) }, activeUnit: null,
  tokens: [{ id: 'shade-1-r1', defId: 'shade', owner: 'A', sourceId: 'A-adept', pos: { x: 8, z: 0 }, elev: 0, round: 1 } as any] }
const pa = b.records.units.find((u: any) => u.id === 'adept')!.abilities.find((a: any) => a.id === 'psionic-transfer')!
const { at, ...plain } = pa.effects[1] as any
s = addEffect(s, 'A-adept', { source: '__delayed:psionic-transfer', kind: 'mod', expires: 'permanent', bySeat: 'A', round: 1, data: { op: 'delayed', at, rec: plain, ctx: { seat: 'A', sourceId: 'psionic-transfer', unitId: 'A-adept', tokenId: 'shade-1-r1' } } })
const before = s.pending.id
const h = runHook(s, b, 'endOfRound', { seat: 'A' })
console.log('raised flag', h.raised, 'pending changed', h.state.pending.id !== before, h.state.pending.kind)
