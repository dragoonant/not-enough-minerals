// Checklist: ENG (ENG-001..004), FLY (never Engaged), DIS (who is Engaged), CC-001/060. Owner M.
// engage.ts: Engagement (spec 14 s9): two enemy models are Engaged within rules.json engagementRange only when the
// tag / terrain / elevation gates allow it. engagedPairs() is recomputed after every reposition or removal (cache by
// positions). Service: no decisions.
import type { EditionBundle } from '../data/types'
import { rule } from './edition'
import { baseRadius, dist, isOnTable } from './geometry'
import { modelDistance } from './measure'
import { isFlyingModel } from './squads'
import { SOLID_TERRAIN_SIZE, levelOfBase, scPieces, segmentCrosses, surfaceAt, type ScPiece } from './terrain'
import type { GameState, ModelId, ModelState, UnitId, Vec2 } from './types'

const gapToPoint = (m: ModelState, p: Vec2): number => Math.max(0, dist(m.pos, p) - baseRadius(m.base))

/** Model-level Engagement with every gate (Ground vs Ground, no Size 2+ terrain between, compatible elevation). */
export function modelsEngaged(state: GameState, bundle: EditionBundle, a: ModelId, b: ModelId): boolean {
  const ma = state.models[a], mb = state.models[b]
  if (!ma || !mb || ma.owner === mb.owner || !isOnTable(ma) || !isOnTable(mb)) return false
  return pairEngaged(state, bundle, ma, mb, rule(bundle, 'engagementRange'))
}

function pairEngaged(state: GameState, bundle: EditionBundle, ma: ModelState, mb: ModelState, er: number): boolean {
  if (modelDistance(ma, mb) > er + 1e-6) return false
  if (isFlyingModel(bundle, ma) || isFlyingModel(bundle, mb)) return false // FLY-002: Flying is never Engaged
  const ra = baseRadius(ma.base), rb = baseRadius(mb.base)
  const sa = surfaceAt(state, ma.pos), sb = surfaceAt(state, mb.pos)
  // Size 2+ terrain (Grass included, ENG-004) on the shortest segment between the two bases blocks Engagement
  const d = dist(ma.pos, mb.pos)
  if (d > ra + rb + 1e-9) {
    const k = (t: number): Vec2 => ({ x: ma.pos.x + (mb.pos.x - ma.pos.x) * t, z: ma.pos.z + (mb.pos.z - ma.pos.z) * t })
    const pa = k(ra / d), pb = k(1 - rb / d)
    const stands = (p: ScPiece, s: ScPiece | null): boolean => !!s && (s === p || s.below.includes(p.t.id))
    for (const p of scPieces(state)) {
      if (p.size < SOLID_TERRAIN_SIZE || stands(p, sa) || stands(p, sb)) continue
      if (segmentCrosses(p, pa, pb)) return false
    }
  }
  const la = levelOfBase(state, ma.pos, ra), lb = levelOfBase(state, mb.pos, rb)
  if (la === lb) return true
  if ((la === 0 && lb === 2) || (la === 2 && lb === 0)) return false
  // MID GROUND meets another level only beside an ACCESS POINT both stand Within Engagement Range of
  for (const p of scPieces(state)) {
    for (const ap of p.access) if (gapToPoint(ma, ap) <= er + 1e-6 && gapToPoint(mb, ap) <= er + 1e-6) return true
  }
  return false
}

interface Cached { terrain: GameState['terrain']; bundle: EditionBundle; pairs: [ModelId, ModelId][] }
const cache = new WeakMap<GameState['models'], Cached>()

/** Every Engaged model pair [a, b] (a < b), cached on the identity of the models map and terrain. */
export function engagedModelPairs(state: GameState, bundle: EditionBundle): [ModelId, ModelId][] {
  const hit = cache.get(state.models)
  if (hit && hit.terrain === state.terrain && hit.bundle === bundle) return hit.pairs
  const er = rule(bundle, 'engagementRange')
  const live = Object.values(state.models).filter(isOnTable)
  const pairs: [ModelId, ModelId][] = []
  for (let i = 0; i < live.length; i++) {
    for (let j = i + 1; j < live.length; j++) {
      const a = live[i]!, b = live[j]!
      if (a.owner === b.owner) continue
      // cheap reject before the gates
      if (dist(a.pos, b.pos) - baseRadius(a.base) - baseRadius(b.base) > er + 1e-6) continue
      if (pairEngaged(state, bundle, a, b, er)) pairs.push(a.id < b.id ? [a.id, b.id] : [b.id, a.id])
    }
  }
  cache.set(state.models, { terrain: state.terrain, bundle, pairs })
  return pairs
}

/** Every Engaged unit pair [a, b] with a < b. */
export function engagedPairs(state: GameState, bundle: EditionBundle): [UnitId, UnitId][] {
  const seen = new Set<string>()
  const out: [UnitId, UnitId][] = []
  for (const [a, b] of engagedModelPairs(state, bundle)) {
    const ua = state.models[a]!.unitId, ub = state.models[b]!.unitId
    const key = ua < ub ? `${ua}|${ub}` : `${ub}|${ua}`
    if (seen.has(key)) continue
    seen.add(key)
    out.push(ua < ub ? [ua, ub] : [ub, ua])
  }
  return out
}

/** Enemy units this unit is Engaged with (ENG-002: one model pair engages both whole units). */
export function engagedWith(state: GameState, bundle: EditionBundle, unitId: UnitId): UnitId[] {
  const out: UnitId[] = []
  for (const [a, b] of engagedPairs(state, bundle)) {
    if (a === unitId) out.push(b)
    else if (b === unitId) out.push(a)
  }
  return out
}

/** True when the unit is Engaged with any enemy unit. */
export function isEngaged(state: GameState, bundle: EditionBundle, unitId: UnitId): boolean {
  return engagedWith(state, bundle, unitId).length > 0
}

/** Models of the unit that are Engaged with at least one enemy model (the Fighting Rank candidates, spec 13 s8). */
export function engagedModels(state: GameState, bundle: EditionBundle, unitId: UnitId): ModelId[] {
  const out = new Set<ModelId>()
  for (const [a, b] of engagedModelPairs(state, bundle)) {
    if (state.models[a]!.unitId === unitId) out.add(a)
    if (state.models[b]!.unitId === unitId) out.add(b)
  }
  return [...out]
}
