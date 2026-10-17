// Checklist: SUP (SUP-001..0xx), VP-001 (supply destroyed), DIS (Tactical Mass compares disengage Supply). Owner M.
// supply.ts: supplyFor(unit, purpose) is the only Supply read (spec 15 s1: CSV from the live model count via
// edition.bracketSupply, then the supplyMods hook, which folds the supplyOverride effects); poolFor(round) is derived from the Mission
// (Infinity in the final round); available() is recomputed per call; canArrive() gates every arrival; the
// supply-lost ledger is fed by damage.removeModels through onModelsRemoved. Service: no decisions.
import type { EditionBundle } from '../data/types'
import { bracketSupply, missionDef } from './edition'
import { engagedWith } from './engage'
import { runHook } from './hooks'
import { hasKeyword, liveModelCount, statusOn, unitDefOf } from './squads'
import type { GameState, SeatId, SupplyPurpose, UnitId } from './types'

/** Current Supply Value of a unit for one purpose (BURROWED counts 0 for disengage, R15-2). */
export function supplyFor(state: GameState, bundle: EditionBundle, unitId: UnitId, purpose: SupplyPurpose): number {
  const u = state.units[unitId]
  const def = unitDefOf(state, bundle, unitId)
  if (!u || !def) return 0
  // STRUCTURE counts 0 for everything (SUP-006)
  if (hasKeyword(state, bundle, unitId, 'STRUCTURE')) return 0
  // BURROWED counts 0 for the Disengage comparison on both sides (SUP-005)
  if (purpose === 'disengage' && statusOn(state, unitId, 'BURROWED')) return 0
  let v = bracketSupply(def, liveModelCount(state, unitId))
  // supplyOverride effects (Commander +1, Medic Facilities 0 for the Pool, auras) are folded by the supplyMods hook, once
  const hooked = runHook(state, bundle, 'supplyMods', { unitId, seat: u.owner, purpose, value: v })
  return Math.max(0, hooked.value ?? v)
}

/** The Supply Pool for a round (default: the current one): S + (round - 1) * E, Infinity from the final round on. */
export function poolFor(state: GameState, bundle: EditionBundle, round?: number): number {
  const mission = state.missionId ? missionDef(bundle, state.missionId) : undefined
  if (!mission) return Infinity
  const r = Math.max(1, round ?? state.round)
  const base = r >= mission.gameLength ? Infinity : mission.startSupply + (r - 1) * mission.escalation
  const hooked = runHook(state, bundle, 'poolMods', { phase: state.roundPhase ?? undefined, value: base })
  return hooked.value ?? base
}

/** Sum of supplyFor(u, 'pool') over the seat's units on the table. */
export function onTableSupply(state: GameState, bundle: EditionBundle, seat: SeatId): number {
  let total = 0
  for (const u of Object.values(state.units)) {
    if (u.owner === seat && u.location === 'table') total += supplyFor(state, bundle, u.id, 'pool')
  }
  return total
}

/** Pool - on-table Supply (SUP-020). */
export function available(state: GameState, bundle: EditionBundle, seat: SeatId): number {
  return poolFor(state, bundle) - onTableSupply(state, bundle, seat)
}

/** May this unit arrive now (its CSV fits in Available)? A unit already on the table does not count against itself, so
 *  the same gate serves SUMMON and MORPH (SUP-023). */
export function canArrive(state: GameState, bundle: EditionBundle, seat: SeatId, unitId: UnitId): boolean {
  const u = state.units[unitId]
  if (!u || u.owner !== seat || u.location === 'destroyed') return false
  const csv = supplyFor(state, bundle, unitId, 'pool')
  const own = u.location === 'table' ? csv : 0
  return csv <= available(state, bundle, seat) + own + 1e-9
}

/** Ledger: add the bracket drop of `unitId` (from `before` to its current CSV) to its owner's supplyLostThisRound.
 *  Summoned units count like any other drop (F p.5 "anytime Supply drops"; R p.78 9.1.9 treats them as Friendly Units;
 *  only the 8.10 Final Score tally leaves them out). Corrected 2026-10-16. */
export function recordSupplyLoss(state: GameState, bundle: EditionBundle, unitId: UnitId, before: number): GameState {
  const u = state.units[unitId]
  if (!u) return state
  const drop = Math.max(0, before - supplyFor(state, bundle, unitId, 'vp'))
  if (drop === 0) return state
  const seat = state.seats[u.owner]
  if (!seat) return state
  return { ...state, seats: { ...state.seats, [u.owner]: { ...seat, supplyLostThisRound: seat.supplyLostThisRound + drop } } }
}

/** Tactical Mass (SUP-041): the unit's Disengage Supply is strictly greater than the sum over the enemy units it is
 *  Engaged with. Read at declaration (SUP-043). */
export function hasTacticalMass(state: GameState, bundle: EditionBundle, unitId: UnitId): boolean {
  const mine = supplyFor(state, bundle, unitId, 'disengage')
  const theirs = engagedWith(state, bundle, unitId).reduce((s, e) => s + supplyFor(state, bundle, e, 'disengage'), 0)
  return mine > theirs
}
