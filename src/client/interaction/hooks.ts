// React hooks of the interaction layer.
import { useEffect, useLayoutEffect, useMemo, useRef } from 'react'
import { focus, useBoardGeometry, useGame, usePending } from '../contract'
import type { PendingDecision } from '../../engine/types'
import { entrySegment, midOf, sideName } from './attention'
import { pathPlan } from './kinds'
import { previewPath } from './preview'
import { draft, useDraft, type DraftState } from './store'

const BLANK_DRAFT = {
  menuUnit: null, leaderId: null, waypoints: [], cursor: null, held: false, preview: null, weaponId: null, armed: null, picked: [], hoverOption: null,
} as unknown as DraftState

/** The draft, but only while it belongs to the open decision (a stale draft reads as blank for one render). */
export function useDraftFor(decisionId: string | null): DraftState {
  return useDraft((s) => (decisionId !== null && s.decisionId === decisionId ? s : BLANK_DRAFT))
}

/** Mount once: wipes the draft when the decision changes. Returns the open decision. */
export function useDecision(): PendingDecision | null {
  const pending = usePending()
  const id = pending?.id ?? null
  useLayoutEffect(() => { draft.sync(id) }, [id])
  return pending
}

/** Keep draft.preview in step with the dragged path: a dry run per change, at most one per animation frame. */
export function usePathPreview(pending: PendingDecision | null): void {
  const { state } = useGame()
  const d = useDraftFor(pending?.id ?? null)
  const plan = useMemo(() => (pending ? pathPlan(pending) : null), [pending])
  const geo = useBoardGeometry()
  const frame = useRef(0)
  const candidate = useMemo(() => (d.held && d.cursor ? [...d.waypoints, d.cursor] : d.waypoints), [d.held, d.cursor, d.waypoints])
  useEffect(() => {
    if (!pending || !plan || !state || !d.leaderId || candidate.length === 0) { if (d.preview) draft.setPreview(null); return }
    const run = () => { frame.current = 0; const seg = pending.kind === 'deploy.path' && geo ? entrySegment(plan, geo, String(pending.seat)) : null
      draft.setPreview(previewPath(state, pending, plan, d.leaderId!, candidate, seg && geo ? `${sideName(midOf(seg), geo.table)} edge` : null))
    }
    if (typeof requestAnimationFrame === 'undefined') { run(); return }
    cancelAnimationFrame(frame.current)
    frame.current = requestAnimationFrame(run)
    return () => cancelAnimationFrame(frame.current)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pending?.id, plan, state, d.leaderId, candidate])
}

/** Tell the shared focus store which candidate the odds panel should show. */
export function useTargetFocus(pending: PendingDecision | null, attacker: string | null, weaponId: string | null, target: string | null, picked: string[]): void {
  useEffect(() => {
    if (!pending) { focus.setTarget(null); return }
    if (pending.kind === 'charge.targets') {
      const me = pending.context['unitId']
      focus.setTarget(typeof me === 'string' && picked.length ? { kind: 'charge', unitId: me, targetIds: picked } : null)
    } else if (pending.kind === 'shoot.batch' && attacker && weaponId && target) {
      focus.setTarget({ kind: 'attack', attackerUnitId: attacker, weaponId, targetUnitId: target })
    } else focus.setTarget(null)
    return () => focus.setTarget(null)
  }, [pending, attacker, weaponId, target, picked.join('|')])
}
