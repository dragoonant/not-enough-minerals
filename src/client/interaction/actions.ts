// Interaction commands shared by the DOM panel and the in-canvas pickers. Each one maps a click to a decision option and
// answers through game.choose / game.answer; the engine decides whether it is legal (a rejection toasts through the HUD).
import { focus, game, type ClientRejection } from '../contract'
import type { DecisionOption, ModelId, PendingDecision, UnitId, Vec2 } from '../../engine/types'
import { nearestIndex, pointList } from './geometry'
import { activeWeapon } from './highlights'
import {
  activationMenu, batchMenu, chargeOptionFor, chargePickable, classify, modelRef, pathPlan, targetRefs,
} from './kinds'
import { confirmedAction } from './preview'
import { draft, useDraft } from './store'

/** Answer with an option's own action. Never by option id: turn.activate ids repeat across squads (every Hold is 'hold'), so
 *  game.choose(id) could activate the wrong one. */
export const answerOption = (o: DecisionOption): ClientRejection | null => {
  const { type, decisionId: _d, seat: _s, ...rest } = o.action
  void _d; void _s
  return game.answer({ ...rest, type })
}

/** The option a click on `unitId` would answer (shoot.batch uses the active weapon first, then any weapon that reaches it). */
export function optionForTarget(p: PendingDecision, unitId: UnitId, weaponId: string | null): DecisionOption | null {
  if (p.kind === 'shoot.batch') {
    const menu = batchMenu(p)
    const w = activeWeapon(menu, weaponId)
    const first = menu.rows.find((r) => r.weaponId === w && r.options[unitId])
    const row = first ?? menu.rows.find((r) => r.options[unitId])
    return row?.options[unitId] ?? null
  }
  return p.options.find((o) => targetRefs(p.kind, o.action).includes(unitId)) ?? null
}

/** Fire the armed target (second click, Enter or the Confirm button). */
export function fireArmed(p: PendingDecision): ClientRejection | null {
  const d = useDraft.getState()
  if (classify(p) === 'target' && p.kind === 'charge.targets') {
    const o = chargeOptionFor(p, d.picked)
    return o ? answerOption(o) : null
  }
  if (!d.armed) return null
  const o = optionForTarget(p, d.armed.unitId, d.armed.weaponId ?? d.weaponId)
  return o ? answerOption(o) : null
}

/** A click on a squad on the table. */
export function clickUnit(p: PendingDecision | null, unitId: UnitId): void {
  focus.select(unitId)
  if (!p) return
  const mode = classify(p)
  if (mode === 'activate') {
    const has = activationMenu(p).units.some((u) => u.unitId === unitId)
    draft.openMenu(has ? unitId : null)
    return
  }
  if (mode !== 'target') return
  if (p.kind === 'charge.targets') {
    if (chargePickable(p).includes(unitId)) draft.togglePicked(unitId)
    return
  }
  const d = useDraft.getState()
  const o = optionForTarget(p, unitId, d.weaponId)
  if (!o) return
  if (d.armed?.unitId === unitId) { answerOption(o); return }
  const w = typeof o.action['weaponId'] === 'string' ? (o.action['weaponId'] as string) : null
  draft.arm({ unitId, weaponId: w })
}

/** A click on one model (casualty, template aim). */
export function clickModel(p: PendingDecision | null, modelId: ModelId): boolean {
  if (!p || classify(p) !== 'models') return false
  const o = p.options.find((x) => modelRef(x.action) === modelId)
  if (!o) return false
  answerOption(o)
  return true
}

/** A click on bare table in 'point' mode: the nearest offered spot, else the open template with the clicked point. */
export function clickPoint(p: PendingDecision | null, at: Vec2): boolean {
  if (!p || classify(p) !== 'point') return false
  const spots = pointList(p.context['points'])
  const ready = p.options.filter((o) => o.id.startsWith('point:'))
  const i = nearestIndex(at, spots)
  if (i >= 0 && ready[i]) { answerOption(ready[i]!); return true }
  const tmpl = p.options.find((o) => o.id === 'point')
  if (!tmpl) return false
  const { type, decisionId: _d, seat: _s, ...rest } = tmpl.action
  void _d; void _s
  game.answer({ ...rest, type, point: { x: at.x, z: at.z } })
  return true
}

/** The Leading Model to use when the player just clicks the table. */
export function defaultLeader(p: PendingDecision, leadingModelId: ModelId | null, firstModel: ModelId | null): ModelId | null {
  const plan = pathPlan(p)
  return plan?.leaderId ?? leadingModelId ?? firstModel
}

/** Send the previewed path as the answer. */
export function confirmPath(p: PendingDecision): ClientRejection | null {
  const d = useDraft.getState()
  const plan = pathPlan(p)
  if (!plan || !d.leaderId || !d.waypoints.length || !d.preview?.ok) return null
  const a = confirmedAction(plan, d.leaderId, d.waypoints)
  return a ? game.submit(a) : null
}
