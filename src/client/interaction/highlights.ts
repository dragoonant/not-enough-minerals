// Which squads and models glow on the table for the open decision, and in which role. Pure: pending + draft in, roles out.
import type { ModelId, PendingDecision, UnitId, Vec2 } from '../../engine/types'
import { pointList } from './geometry'
import { activationMenu, batchMenu, chargePickable, classify, modelRef, pathPlan, targetRefs, type BatchMenu } from './kinds'
import type { DraftState } from './store'

export type Role = 'ready' | 'selected' | 'target' | 'armed' | 'picked'

export interface Highlights {
  units: Record<UnitId, Role>
  models: Record<ModelId, 'candidate'>
  points: Vec2[]
  /** deploy.entry: the hovered option's entry (segment index or edge letter). */
  entry: { segment: number | string | null; kind: string } | null
}

export const EMPTY_HIGHLIGHTS: Highlights = { units: {}, models: {}, points: [], entry: null }

/** The weapon row a shoot.batch decision is aiming with: the player's pick if still valid, else the first. */
export function activeWeapon(menu: BatchMenu, picked: string | null): string | null {
  if (picked && menu.rows.some((r) => r.weaponId === picked)) return picked
  return menu.rows[0]?.weaponId ?? null
}

export type DraftView = Pick<DraftState, 'menuUnit' | 'weaponId' | 'armed' | 'picked' | 'hoverOption'>

export function highlightsFor(p: PendingDecision | null, d: DraftView): Highlights {
  if (!p) return EMPTY_HIGHLIGHTS
  const mode = classify(p)
  const out: Highlights = { units: {}, models: {}, points: [], entry: null }
  switch (mode) {
    case 'activate': {
      for (const u of activationMenu(p).units) out.units[u.unitId] = 'ready'
      if (d.menuUnit && out.units[d.menuUnit]) out.units[d.menuUnit] = 'selected'
      break
    }
    case 'path': {
      const plan = pathPlan(p)
      if (plan) out.units[plan.unitId] = 'selected'
      break
    }
    case 'target': {
      if (p.kind === 'shoot.batch') {
        const menu = batchMenu(p)
        const w = activeWeapon(menu, d.weaponId)
        const row = menu.rows.find((r) => r.weaponId === w)
        if (menu.unitId) out.units[menu.unitId] = 'selected'
        for (const t of row?.targets ?? []) out.units[t] = 'target'
      } else if (p.kind === 'charge.targets') {
        for (const t of chargePickable(p)) out.units[t] = 'target'
        for (const t of d.picked) out.units[t] = 'picked'
        const me = p.context['unitId']
        if (typeof me === 'string') out.units[me] = 'selected'
      } else {
        for (const o of p.options) for (const t of targetRefs(p.kind, o.action)) out.units[t] = 'target'
      }
      if (d.armed) out.units[d.armed.unitId] = 'armed'
      break
    }
    case 'models': {
      for (const o of p.options) { const m = modelRef(o.action); if (m) out.models[m] = 'candidate' }
      break
    }
    case 'point': {
      out.points = pointList(p.context['points'])
      break
    }
    case 'entry': {
      const o = p.options.find((x) => x.id === d.hoverOption)
      const e = o?.action['entry'] as { kind?: string; segment?: number | string } | undefined
      if (e) out.entry = { kind: String(e.kind ?? ''), segment: e.segment ?? null }
      break
    }
    default: break
  }
  return out
}
