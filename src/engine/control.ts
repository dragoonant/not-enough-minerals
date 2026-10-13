// Checklist: CTL (CTL-001..012), OBJ, MM-003 (Flying / BURROWED never contest), COH-006. Owner T.
// control.ts: marker contest and control by Supply (spec 11 s9.1, spec 15 s6): contesters are In Coherency, within
// rules.json contestRange with LoS to the marker, not Flying, not BURROWED (canContest hook); each seat sums
// supplyFor(u, 'control'); Sticky Control. The client never computes control (query.objectiveStatus). Service.
import type { EditionBundle } from '../data/types'
import { keywordOf, hasStatus } from './effects'
import { rule, unitDef } from './edition'
import { baseRadius, dist, isOnTable } from './geometry'
import { runHook } from './hooks'
import { losVerdict } from './los'
import { supplyFor } from './supply'
import { unitModels } from './squads'
import type { GameState, MarkerState, ModelState, SeatId, UnitId } from './types'

export interface ContestResult {
  n: number
  totals: Record<SeatId, number>
  contesters: Record<SeatId, UnitId[]>
  /** Who would control the marker after this contest (Sticky Control applied); null = never held. */
  controller: SeatId | null
}

/** Elevation levels are compared in inches with this slack (a geometry tolerance, not a rules number). */
const ELEV_TOL = 0.05

export const markerOf = (state: GameState, n: number): MarkerState | undefined => state.markers.find((m) => m.n === n)

/** Distance from a model's base edge to the edge of the marker's disc (markers are discs of rules.json markerDiameterMm). */
export function modelToMarker(bundle: EditionBundle, m: ModelState, marker: MarkerState): number {
  return Math.max(0, dist(m.pos, marker.pos) - baseRadius(m.base) - baseRadius(rule(bundle, 'markerDiameterMm')))
}

/** Is any live model of the unit Within `d` of the marker (no LoS, elevation or Coherency test: used by Gather and CLAIM)? */
export function unitWithinMarker(state: GameState, bundle: EditionBundle, unitId: UnitId, marker: MarkerState, d: number): boolean {
  return unitModels(state, unitId).some((m) => isOnTable(m) && modelToMarker(bundle, m, marker) <= d + 1e-6)
}

/** A throw-away model standing on the marker, so los.ts can be asked about it (Marker = Size 0, MM-004). */
function probe(bundle: EditionBundle, marker: MarkerState): ModelState {
  return {
    id: `#marker${marker.n}`, profileId: 'marker', owner: '', unitId: '', pos: marker.pos, elev: marker.elev,
    base: rule(bundle, 'markerDiameterMm'), life: 'active', conditions: [], tokens: {}, weapons: [], hp: 1,
  }
}

/** May this unit contest marker n right now? (CTL-001, CTL-002, MM-003.) */
export function canContest(state: GameState, bundle: EditionBundle, unitId: UnitId, n: number): boolean {
  const unit = state.units[unitId]
  const marker = markerOf(state, n)
  if (!unit || !marker || !marker.onTable) return false
  if (unit.location !== 'table' || !unit.inCoherency) return false
  if (unitDef(bundle, unit.profileId)?.combatTags.includes('flying')) return false
  if (hasStatus(state, unitId, 'BURROWED')) return false
  if (keywordOf(state, bundle, unitId, 'STRUCTURE')) return false
  const range = rule(bundle, 'contestRange')
  const near = unitModels(state, unitId).filter((m) =>
    isOnTable(m) && modelToMarker(bundle, m, marker) <= range + 1e-6 && Math.abs(m.elev - marker.elev) <= ELEV_TOL)
  if (near.length === 0) return false
  // LoS to the marker is checked against terrain only: models never block the view of a Size 0 disc (RULING below).
  const probed: GameState = { ...state, models: { ...state.models, [`#marker${n}`]: probe(bundle, marker) } }
  if (!near.some((m) => losVerdict(probed, m.id, `#marker${n}`, { ignoreModels: true }).visible)) return false
  return !runHook(state, bundle, 'canContest', { seat: unit.owner, unitId, markerN: n }).veto
}

/** Contest totals and resulting controller of marker n (does not change state). */
export function contest(state: GameState, bundle: EditionBundle, n: number): ContestResult {
  const marker = markerOf(state, n)
  const totals: Record<SeatId, number> = Object.fromEntries(state.seatOrder.map((s) => [s, 0]))
  const contesters: Record<SeatId, UnitId[]> = Object.fromEntries(state.seatOrder.map((s) => [s, []]))
  const prev = marker?.controller ?? null
  if (!marker || !marker.onTable) return { n, totals, contesters, controller: prev }
  for (const u of Object.values(state.units)) {
    if (!(u.owner in totals) || !canContest(state, bundle, u.id, n)) continue
    contesters[u.owner]!.push(u.id)
    totals[u.owner]! += supplyFor(state, bundle, u.id, 'control')
  }
  const present = state.seatOrder.filter((s) => contesters[s]!.length > 0)
  let controller = prev
  if (present.length === 1) controller = present[0]! // an uncontested marker is taken, even by Supply 0 (CTL-005)
  else if (present.length > 1) {
    const best = Math.max(...present.map((s) => totals[s]!))
    const leaders = present.filter((s) => totals[s] === best)
    if (leaders.length === 1) controller = leaders[0]! // a tie leaves control as it was (CTL-004)
  }
  return { n, totals, contesters, controller }
}

/** Scoring step 1: store marker.controller / controlledSinceRound for every marker on the table. Control that changes
 *  hands logs a `markerControl` event (from, to, round) that Frontlines reads for its retake bonus. */
export function updateControl(state: GameState, bundle: EditionBundle): GameState {
  let s = state
  for (const marker of state.markers) {
    if (!marker.onTable) continue
    const res = contest(s, bundle, marker.n)
    if (res.controller === marker.controller) continue
    s = {
      ...s, markers: s.markers.map((m) => (m.n === marker.n ? { ...m, controller: res.controller, controlledSinceRound: s.round } : m)),
    }
    s = { ...s, events: [...s.events, { type: 'markerControl', n: marker.n, from: marker.controller, to: res.controller, round: s.round, totals: res.totals }] }
  }
  return s
}
