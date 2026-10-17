// Checklist: MSN (MSN-001..025), MM (MM-001..005), DEPL (marker placement), OBJ. Owner T.
// missions.ts: the Mission Card as data (spec 17 s5, s7): marker set-up from the Deployment Card (edition.cardToWorld,
// edition.markerSide), start-of-round marker steps (Round step 1), mission actions (Gather...), CLAIM, and the
// ScoringRule vocabulary scoring.stepVP folds. Namespace 'mission' (a mission.<verb>; k mission.choose, mission.claim).
import type { DeploymentDef, EditionBundle, MissionDef } from '../data/types'
import { runCode } from './code-hooks'
import { canContest, markerOf, unitWithinMarker } from './control'
import { cardToWorld, deploymentDef, markerSide, missionDef, rule, zoneRect, type Rect } from './edition'
import { isEngaged } from './engage'
import { reject } from './errors'
import { baseRadius, isOnTable } from './geometry'
import { option, pushEvents, raiseDecision, type ModuleDef, type StepResult } from './registry'
import { roll } from './rng'
import { unitModels } from './squads'
import { supplyFor } from './supply'
import type { DecisionOption, GameState, MarkerState, SeatId, UnitId, Vec2 } from './types'

/** The game's MissionDef / DeploymentDef (null before the draft picks them). */
export function missionOf(state: GameState, bundle: EditionBundle): MissionDef | null {
  return state.missionId ? missionDef(bundle, state.missionId) ?? null : null
}
export function deploymentOf(state: GameState, bundle: EditionBundle): DeploymentDef | null {
  return state.deploymentId ? deploymentDef(bundle, state.deploymentId) ?? null : null
}

/** Markers of the Deployment Card at this scale, in world coordinates, Activated per markerStart. */
export function initialMarkers(_bundle: EditionBundle, mission: MissionDef, deployment: DeploymentDef): MarkerState[] {
  const active = mission.markerStart === 'activated'
  return deployment.markers.map((m) => ({
    n: m.n, pos: cardToWorld({ x: m.x, y: m.y }, deployment.size), elev: 0, side: markerSide(m.n), active, onTable: true,
    controller: null, controlledSinceRound: null, claimedBy: null, activatedRound: null,
  }))
}

function setMarkerActive(state: GameState, n: number, active: boolean): GameState {
  const s = { ...state, markers: state.markers.map((m) => (m.n === n ? { ...m, active, activatedRound: active ? state.round : m.activatedRound } : m)) }
  return pushEvents(s, [{ type: active ? 'markerActivated' : 'markerDeactivated', n, round: state.round }])
}

/** Start of the Round step 1: the Mission's startOfRound marker steps (activateRandom rolls through roll()). */
export function startOfRoundMarkers(state: GameState, bundle: EditionBundle): GameState {
  const mission = missionOf(state, bundle)
  if (!mission) return state
  let s = state
  for (const step of mission.startOfRound) {
    if (!step.rounds.includes(s.round)) continue
    if (step.action === 'activateRandom') {
      const pool = s.markers.filter((m) => step.markers.includes(m.n) && m.onTable && !m.active).sort((a, b) => a.n - b.n)
      if (pool.length === 0) continue
      const r = roll(s, { count: 1, sides: pool.length, purpose: 'marker' })
      s = pushEvents(r.state, [r.event])
      s = setMarkerActive(s, pool[r.event.dice[0]! - 1]!.n, true)
    } else {
      for (const n of step.markers) {
        const m = markerOf(s, n)
        if (m && m.onTable) s = setMarkerActive(s, n, step.action === 'activate')
      }
    }
  }
  return s
}

/** Marker colour as seen from `seat`: own colour, neutral, or the opponent's. */
export function sideFor(state: GameState, marker: MarkerState, seat: SeatId): 'own' | 'neutral' | 'opponent' {
  return marker.side === 'neutral' ? 'neutral' : marker.side === state.seats[seat]?.colour ? 'own' : 'opponent'
}

// ---------------------------------------------------------------- mission actions (Gather)
/** Mission actions the unit may take as its action now (menu entries, mission.<verb>), one per qualifying marker. */
export function missionActionOptions(state: GameState, bundle: EditionBundle, unitId: UnitId): DecisionOption[] {
  const mission = missionOf(state, bundle)
  const unit = state.units[unitId]
  if (!mission || !unit || unit.location !== 'table') return []
  const out: DecisionOption[] = []
  for (const a of mission.actions) {
    if (a.phase !== state.roundPhase) continue
    if (a.requires.engaged === false && isEngaged(state, bundle, unitId)) continue
    for (const marker of state.markers) {
      if (!marker.onTable) continue
      if (!a.requires.markerSides.includes(sideFor(state, marker, unit.owner))) continue
      if (a.requires.controlled && marker.controller !== unit.owner) continue
      if (!unitWithinMarker(state, bundle, unitId, marker, a.requires.markerWithin)) continue
      out.push(option(`${a.id}:${marker.n}`, `${a.name} at marker ${marker.n}`, `mission.${a.id}`, { unitId, marker: marker.n }, unit.owner))
    }
  }
  return out
}

/** Add VP to a seat (keeps score mirrored on vp). */
export function gainVP(state: GameState, seat: SeatId, n: number, source: string): GameState {
  const st = state.seats[seat]!
  const s = { ...state, seats: { ...state.seats, [seat]: { ...st, vp: st.vp + n, score: st.vp + n } } }
  return pushEvents(s, [{ type: 'vp', seat, n, source, round: state.round }])
}

// ---------------------------------------------------------------- CLAIM (Artefact Hunt)
/** Every (unit, marker) CLAIM `seat` could make right now (MSN-060..062). */
export function claimOptions(state: GameState, bundle: EditionBundle, seat: SeatId): DecisionOption[] {
  const claim = missionOf(state, bundle)?.claim
  if (!claim || state.round < claim.fromRound) return []
  const out: DecisionOption[] = []
  for (const unit of Object.values(state.units)) {
    if (unit.owner !== seat || unit.location !== 'table') continue
    if (state.markers.filter((m) => m.claimedBy === unit.id).length >= claim.maxPerUnit) continue
    for (const marker of state.markers) {
      if (!marker.onTable || marker.claimedBy) continue
      if (claim.controlled && marker.controller !== seat) continue
      const side = sideFor(state, marker, seat)
      if (side === 'own' || !claim.markerSides.includes(side)) continue
      if (!unitWithinMarker(state, bundle, unit.id, marker, claim.within)) continue
      out.push(option(`claim:${unit.id}:${marker.n}`, `Claim marker ${marker.n}`, 'mission.claim', { unitId: unit.id, marker: marker.n }, seat))
    }
  }
  return out
}

/** The marker leaves the table and rides on the unit. */
export function applyClaim(state: GameState, unitId: UnitId, n: number): GameState {
  const s = { ...state, markers: state.markers.map((m) => (m.n === n ? { ...m, onTable: false, claimedBy: unitId } : m)) }
  return pushEvents(s, [{ type: 'markerClaimed', n, unitId, round: state.round }])
}

/** DROP: every marker the unit carries goes back on the table at `near` (default: where the unit's first live model
 *  stands). The marker keeps its controller (RULING R17-8). The modules that detect a drop trigger (Supply loss, PLACE,
 *  out-massed while Engaged, leaving the table) call this; the opponent's choice of spot is not asked yet. */
export function dropClaimed(state: GameState, unitId: UnitId, near?: Vec2): GameState {
  const carried = state.markers.filter((m) => m.claimedBy === unitId)
  if (carried.length === 0) return state
  const first = state.units[unitId]?.modelIds.map((id) => state.models[id]).find((m) => m && m.life !== 'dead')
  const spot = near ?? first?.pos
  let s = state
  for (const m of carried) {
    s = { ...s, markers: s.markers.map((x) => (x.n === m.n ? { ...x, onTable: true, claimedBy: null, pos: spot ?? x.pos } : x)) }
    s = pushEvents(s, [{ type: 'markerDropped', n: m.n, unitId, round: s.round }])
  }
  return s
}

/** Raise the CLAIM decision for `seat` (with a decline option) over the claims it can make. */
export function raiseClaim(state: GameState, bundle: EditionBundle, seat: SeatId): GameState {
  return raiseDecision(state, {
    seat, kind: 'mission.claim', context: { round: state.round }, canPass: true,
    options: [...claimOptions(state, bundle, seat), option('decline', 'Claim nothing more', 'mission.claim', { decline: true }, seat)],
  })
}

// ---------------------------------------------------------------- scoring vocabulary
function insideRects(pos: Vec2, r: number, rects: Rect[]): boolean {
  const pts: Vec2[] = [pos]
  for (let i = 0; i < 16; i++) pts.push({ x: pos.x + Math.cos((i / 16) * Math.PI * 2) * r, z: pos.z + Math.sin((i / 16) * Math.PI * 2) * r })
  return pts.every((p) => rects.some((k) => p.x >= k.min.x - 1e-6 && p.x <= k.max.x + 1e-6 && p.z >= k.min.z - 1e-6 && p.z <= k.max.z + 1e-6))
}

/** The seat's Zone of Influence rectangles (one per Entry Edge segment, ZOI-002), in world coordinates. */
export function zoneRects(state: GameState, bundle: EditionBundle, seat: SeatId): Rect[] {
  const dep = deploymentOf(state, bundle)
  const colour = state.seats[seat]?.colour
  if (!dep || !colour) return []
  return dep.entryEdges[colour].map((seg) => zoneRect(seg, dep.size, rule(bundle, 'zoiDepth')))
}

/** Markers the seat took from the other seat in this Round's Scoring step 1 (never-held markers do not count, MSN-031). */
export function retakenBy(state: GameState, seat: SeatId): number[] {
  return (state.events as { type: string; [k: string]: unknown }[])
    .filter((e) => e.type === 'markerControl' && e['round'] === state.round && e['to'] === seat && e['from'] !== null && e['from'] !== seat)
    .map((e) => e['n'] as number)
}

function quarterOf(state: GameState, unitId: UnitId): string | null {
  let q: string | null = null
  for (const m of unitModels(state, unitId)) {
    if (!isOnTable(m)) continue
    const r = baseRadius(m.base)
    if (Math.abs(m.pos.x) < r || Math.abs(m.pos.z) < r) return null
    const k = `${m.pos.x > 0 ? 'E' : 'W'}${m.pos.z > 0 ? 'S' : 'N'}`
    if (q !== null && q !== k) return null
    q = k
  }
  return q
}

/** Divide and Conquer: per quarter the seat whose Units Wholly Within it add up strictly higher gains `vp` (MSN-050..053). */
function quarterVP(state: GameState, bundle: EditionBundle, seat: SeatId, vp: number, bonus: number): number {
  const totals: Record<string, Record<SeatId, number>> = {}
  for (const u of Object.values(state.units)) {
    if (u.location !== 'table') continue
    const q = quarterOf(state, u.id)
    if (!q) continue
    const controls = state.markers.some((m) => m.onTable && m.controller === u.owner && canContest(state, bundle, u.id, m.n))
    const t = (totals[q] ??= Object.fromEntries(state.seatOrder.map((s) => [s, 0])))
    // RULING: a quarter is an objective, so the Supply counted is the 'control' reading (Commander / Domineering Presence
    // "markers and objectives" +1 included), plus the Mission's 1 for a Unit that controls a Marker.
    t[u.owner]! += supplyFor(state, bundle, u.id, 'control') + (controls ? bonus : 0)
  }
  return Object.values(totals).filter((t) => state.seatOrder.every((o) => o === seat || t[seat]! > t[o]!)).length * vp
}

export interface VpLine { rule: string; vp: number }
export interface VpResult { vp: number; lines: VpLine[]; /** Markers that leave the table after scoring (Supply Drop cash-in). */ cashed: number[] }

/** VP `seat` scores from the Mission's ScoringRules for the control state stored on the markers (spec 17 s7). Pure. */
export function scoreRules(state: GameState, bundle: EditionBundle, seat: SeatId): VpResult {
  const mission = missionOf(state, bundle)
  const lines: VpLine[] = []
  const cashed: number[] = []
  if (!mission) return { vp: 0, lines, cashed }
  const others = state.seatOrder.filter((s) => s !== seat)
  const mine = state.markers.filter((m) => m.onTable && m.controller === seat)
  for (const r of mission.scoring) {
    switch (r.kind) {
      case 'supplyDestroyed':
        lines.push({ rule: r.kind, vp: others.reduce((a, o) => a + (state.seats[o]?.supplyLostThisRound ?? 0), 0) })
        break
      case 'perControlledMarker':
        if (state.round >= r.fromRound) lines.push({ rule: r.kind, vp: mine.reduce((a, m) => a + r.vp[sideFor(state, m, seat)], 0) })
        break
      case 'retakeBonus':
        if (state.round >= r.fromRound) lines.push({ rule: r.kind, vp: retakenBy(state, seat).length * r.vp })
        break
      case 'activatedMarkerCash':
        if (state.round >= r.fromRound) {
          const cash = mine.filter((m) => m.active)
          cashed.push(...cash.map((m) => m.n))
          lines.push({ rule: r.kind, vp: cash.reduce((a, m) => a + (m.activatedRound ?? 0), 0) })
        }
        break
      case 'markerControlled':
        if (state.round >= r.fromRound && mine.some((m) => m.n === r.marker)) lines.push({ rule: r.kind, vp: r.vp })
        break
      case 'quarters':
        if (state.round >= r.fromRound) lines.push({ rule: r.kind, vp: quarterVP(state, bundle, seat, r.vp, r.controlBonus) })
        break
      case 'claimCarriedInZone':
        if (r.rounds.includes(state.round)) {
          const zone = zoneRects(state, bundle, seat)
          const carriers = new Set(state.markers.filter((m) => m.claimedBy && state.units[m.claimedBy]?.owner === seat).map((m) => m.claimedBy!))
          const inZone = [...carriers].filter((u) => {
            const ms = unitModels(state, u).filter(isOnTable)
            return ms.length > 0 && ms.every((m) => insideRects(m.pos, baseRadius(m.base), zone))
          })
          lines.push({ rule: r.kind, vp: inZone.length * r.vp })
        }
        break
      case 'ownMarkersNotClaimed':
        if (r.rounds.includes(state.round)) {
          const colour = state.seats[seat]?.colour
          const n = state.markers.filter((m) => m.side === colour && !(m.claimedBy && state.units[m.claimedBy]?.owner !== seat)).length
          lines.push({ rule: r.kind, vp: n * r.vp })
        }
        break
      case 'code': {
        const res = runCode(state, bundle, { code: r.code, ...(r.args ? { args: r.args } : {}) }, { seat })
        lines.push({ rule: `code:${r.code}`, vp: res.value ?? 0 })
        break
      }
    }
  }
  return { vp: lines.reduce((a, l) => a + l.vp, 0), lines, cashed }
}

/** VP `seat` would score from the Mission's ScoringRules if Scoring step 2 ran now (query.missionScore). */
export function missionVP(state: GameState, bundle: EditionBundle, seat: SeatId): number {
  return scoreRules(state, bundle, seat).vp
}

export const missions: ModuleDef = {
  id: 'missions',
  kinds: ['mission'],
  options: (state, bundle, unitId) => missionActionOptions(state, bundle, unitId),
  resolve(state, bundle, action): StepResult {
    const unitId = action.unitId as string | undefined
    if (action.type === 'mission.claim') {
      if (state.pending.kind !== 'mission.claim') return reject('E_NOT_LEGAL', 'There is no claim to make now.')
      if (action['decline'] === true) {
        return { state: { ...state, passed: [...state.passed, action.seat] }, done: { modelId: '', type: 'mission.claim', triggers: [] } }
      }
      const ok = claimOptions(state, bundle, action.seat).some((o) => o.action['unitId'] === unitId && o.action['marker'] === action['marker'])
      if (!unitId || !ok) return reject('E_NOT_LEGAL', 'That claim is not available.')
      return { state: applyClaim(state, unitId, action['marker'] as number), done: { modelId: unitId, unitId, type: 'mission.claim', triggers: [] } }
    }
    const def = missionOf(state, bundle)?.actions.find((a) => `mission.${a.id}` === action.type)
    const unit = unitId ? state.units[unitId] : undefined
    if (!def || !unit || !unitId) return reject('E_UNKNOWN_KIND', `No mission action "${action.type}".`)
    const legal = missionActionOptions(state, bundle, unitId).some((o) => o.action.type === action.type && o.action['marker'] === action['marker'])
    if (!legal) return reject('E_NOT_LEGAL', `${def.name} is not available to that unit.`)
    let s = state
    for (const e of def.effects) {
      if (e['op'] === 'gainVP') s = gainVP(s, unit.owner, e['n'] as number, def.id)
      else return reject('E_TODO', `Mission effect "${String(e['op'])}" is not handled yet.`)
    }
    return { state: s, done: { modelId: unitId, unitId, type: action.type, triggers: [] } }
  },
}
