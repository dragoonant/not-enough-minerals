// Checklist: VIS (VIS-001..024), ST-001/002, ATK-013, DMG-002 (Visible casualties). Owner B.
// visibility.ts: the one visibility mechanism (spec 16 s7): canSee = LoS clear and (not HIDDEN or within hiddenRange);
// detector areas strip HIDDEN at check points and fire onLoseHidden. Every targeting, casualty-visibility and
// Spillover check calls this file. Service: no decisions.
import type { EditionBundle } from '../data/types'
import { detectorAreas, hasStatus, inDetection, setStatus, tableModels } from './effects'
import { rule } from './edition'
import { hasLos } from './los'
import { modelDistance } from './measure'
import type { GameState, ModelId, ModelState, UnitId } from './types'

export type SeeReason = 'clear' | 'noLos' | 'hidden' | 'reserves' | 'destroyed' | 'friendly' | 'self'
export interface SeeVerdict { ok: boolean; reasons: SeeReason[]; /** target models the actor can see */ models: ModelId[] }

const onTable = (m: ModelState | undefined): m is ModelState => !!m && !m.offTable && m.life !== 'dead'

/** Model-to-model visibility: LoS (los.ts) plus the HIDDEN distance filter. A BURROWED Unit's models never block
 *  sight (Size counts as 0, VIS-021); a friendly HIDDEN model stays visible to its own side. */
export function canSee(state: GameState, bundle: EditionBundle, actorModelId: ModelId, targetModelId: ModelId): boolean {
  const a = state.models[actorModelId], t = state.models[targetModelId]
  if (!onTable(a) || !onTable(t)) return false
  if (a.unitId === t.unitId) return true
  if (a.owner !== t.owner && hasStatus(state, t.unitId, 'HIDDEN') && modelDistance(a, t) > rule(bundle, 'hiddenRange') + 1e-6) return false
  return hasLos(state, a.id, t.id, { bundle, skipModel: (m) => hasStatus(state, m.unitId, 'BURROWED') })
}

/** Models of `targetUnitId` Visible to at least one model of `observerUnitId` (casualty eligibility, DMG-002). */
export function visibleModels(state: GameState, bundle: EditionBundle, observerUnitId: UnitId, targetUnitId: UnitId): ModelId[] {
  const obs = tableModels(state, observerUnitId)
  return tableModels(state, targetUnitId).filter((t) => obs.some((o) => canSee(state, bundle, o.id, t.id))).map((m) => m.id)
}

/** May `actorUnitId` pick `targetUnitId` as a target? `ranged` applies the HIDDEN targeting ban (ATK-013, R16-5);
 *  `needsLos` false for Charges and point abilities (R16-4). `actorModelIds` limits the acting models. A HIDDEN enemy can
 *  be chosen by a Ranged Attack or an ability that needs LoS only when an acting model is within hiddenRange of it. */
export function canTarget(state: GameState, bundle: EditionBundle, actorUnitId: UnitId, targetUnitId: UnitId,
  opts: { ranged: boolean; needsLos: boolean; actorModelIds?: ModelId[] }): SeeVerdict {
  const tu = state.units[targetUnitId]
  if (!tu || tu.location === 'destroyed') return { ok: false, reasons: ['destroyed'], models: [] }
  if (tu.location === 'reserves') return { ok: false, reasons: ['reserves'], models: [] }
  const tModels = tableModels(state, targetUnitId)
  if (actorUnitId === targetUnitId) return { ok: true, reasons: ['self'], models: tModels.map((m) => m.id) }
  const au = state.units[actorUnitId]
  const friendly = !!au && au.owner === tu.owner
  const acting = (opts.actorModelIds ? opts.actorModelIds.map((id) => state.models[id]) : tableModels(state, actorUnitId)).filter(onTable)
  const hiddenBound = rule(bundle, 'hiddenRange') + 1e-6
  if (!friendly && hasStatus(state, targetUnitId, 'HIDDEN') && (opts.ranged || opts.needsLos)
    && !acting.some((a) => tModels.some((t) => modelDistance(a, t) <= hiddenBound))) {
    return { ok: false, reasons: ['hidden'], models: [] }
  }
  const tag: SeeReason[] = friendly ? ['friendly'] : []
  if (!opts.needsLos) return { ok: true, reasons: [...tag, 'clear'], models: tModels.map((m) => m.id) }
  const seen = tModels.filter((t) => acting.some((a) => canSee(state, bundle, a.id, t.id))).map((m) => m.id)
  if (seen.length === 0) return { ok: false, reasons: [hasStatus(state, targetUnitId, 'HIDDEN') && !friendly ? 'hidden' : 'noLos'], models: [] }
  return { ok: true, reasons: [...tag, 'clear'], models: seen }
}

/** Detection check point: every enemy unit inside a DetectorArea loses HIDDEN (fires onLoseHidden). BURROWED stays
 *  (VIS-014); leaving the area does not bring HIDDEN back (RULING R16-7). */
export function detect(state: GameState, bundle: EditionBundle): GameState {
  let s = state
  if (detectorAreas(state, bundle).length === 0) return s
  for (const u of Object.values(state.units)) {
    if (u.location === 'table' && hasStatus(s, u.id, 'HIDDEN') && inDetection(s, bundle, u.id)) s = setStatus(s, bundle, u.id, 'HIDDEN', 'lose', 'rule:detection')
  }
  return s
}
