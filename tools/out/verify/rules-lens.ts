// Scratch check for the M2 rules-lens verifier (not part of the repo test suite).
import { bundle, duelState, squad, type SquadSpec } from '../../../tests/engine/helpers'
import { removeModels } from '../../../src/engine/damage'
import { supplyFor } from '../../../src/engine/supply'
import { respawnModels } from '../../../src/engine/abilities'
import type { GameState } from '../../../src/engine/types'

const b = bundle()
function arena(specs: SquadSpec[]): GameState {
  const s0 = duelState(b)
  const sq = specs.map((x) => squad(b, x))
  return { ...s0, models: Object.fromEntries(sq.flatMap((x) => x.models).map((m) => [m.id, m])), units: Object.fromEntries(sq.map((x) => [x.unit.id, x.unit])) }
}

// 1. Advanced Medic Facilities: does killing the Medics score VP for the opponent?
{
  const s = arena([{ id: 'd', owner: 'A', profileId: 'medic', models: 2, at: { x: 0, z: 0 }, upgrades: [{ id: 'advanced-medic-facilities' }] }])
  const ids = s.units['d']!.modelIds
  const after = removeModels(s, b, 'd', [...ids], 'attack')
  console.log('medic vp csv before', supplyFor(s, b, 'd', 'vp'), 'ledger A after kill =', after.seats['A']!.supplyLostThisRound)
}

// 2. RESPAWN raising a bracket
{
  const s = arena([{ id: 'z', owner: 'B', profileId: 'zergling', models: 8, at: { x: 0, z: 0 } }])
  const ids = s.units['z']!.modelIds
  const hurt = removeModels(s, b, 'z', ids.slice(4), 'attack')
  const csv1 = supplyFor(hurt, b, 'z', 'pool')
  const back = respawnModels(hurt, b, 'z', 4, 'test')
  console.log('zergling csv after losses', csv1, 'after respawn 4', supplyFor(back, b, 'z', 'pool'), 'brackets', JSON.stringify((b as any).units?.find?.((u: any) => u.id === 'zergling')?.supplyProfile ?? 'n/a'))
}
