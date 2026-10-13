// Interaction layer (owner I, spec 50 s5): per-decision controllers, picking, Leading Model drag with ruler, formation and
// coherency preview, targeting with the odds line. Mounted twice by GameScreen: <InteractionScene /> inside the Board's
// <Canvas> (3D picking, ghosts, rulers; see Scene.tsx) and <Interaction /> as the DOM overlay (decision panel, keys).
// Reads only from ../contract; writes focus.* and answers through game.answer / game.choose / game.dryRun.
import { useEffect, useRef, type ReactElement } from 'react'
import { focus, game, useFocus } from '../contract'
import type { PendingDecision } from '../../engine/types'
import { answerOption, confirmPath, fireArmed } from './actions'
import { activeWeapon } from './highlights'
import { useDecision, useDraftFor, usePathPreview, useTargetFocus } from './hooks'
import { activationMenu, batchMenu, classify } from './kinds'
import { Prompt } from './Prompt'
import { cancelDraft, draft, useDraft } from './store'
import './interaction.css'

const typing = (e: KeyboardEvent): boolean => {
  const t = e.target as HTMLElement | null
  return !!t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.tagName === 'SELECT' || t.isContentEditable)
}

/** Keyboard: P pass, T threat overlay, Esc cancel, Enter confirm, Backspace undo a point, 1-9 pick the nth choice. */
function useKeys(pending: PendingDecision | null): void {
  const ref = useRef(pending)
  ref.current = pending
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (typing(e) || e.ctrlKey || e.metaKey || e.altKey) return
      const p = ref.current
      const k = e.key
      if (k === 'Escape') {
        game.clearRejection()
        if (!cancelDraft()) focus.select(null)
        return
      }
      if (k === 't' || k === 'T') { focus.toggleOverlay('threat'); return }
      if (!p) return
      if (k === 'p' || k === 'P') { if (game.pass() === null) e.preventDefault(); return }
      const mode = classify(p)
      if (k === 'Enter') {
        if (mode === 'path') confirmPath(p)
        else if (mode === 'target') fireArmed(p)
        return
      }
      if (k === 'Backspace' && mode === 'path') { draft.undoWaypoint(); e.preventDefault(); return }
      if (/^[1-9]$/.test(k)) {
        const n = Number(k) - 1
        const d = useDraft.getState()
        if (mode === 'activate') {
          const menu = activationMenu(p)
          const open = menu.units.find((u) => u.unitId === d.menuUnit)
          if (open) { const o = open.options[n]; if (o) answerOption(o) } else { const u = menu.units[n]; if (u) { draft.openMenu(u.unitId); focus.select(u.unitId) } }
        } else if (mode === 'list' || mode === 'entry') {
          const o = p.options[n]
          if (o) answerOption(o)
        } else if (mode === 'target' && p.kind !== 'shoot.batch' && p.kind !== 'charge.targets') {
          const o = p.options[n]
          if (o) answerOption(o)
        }
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])
}

/** Side effects that need the open decision: path dry runs and the odds panel's target. */
function Effects({ pending }: { pending: PendingDecision | null }): null {
  usePathPreview(pending)
  const d = useDraftFor(pending?.id ?? null)
  const hover = useFocus((f) => f.hoverUnitId)
  let attacker: string | null = null, weapon: string | null = null, target: string | null = null
  if (pending?.kind === 'shoot.batch') {
    const menu = batchMenu(pending)
    attacker = menu.unitId
    weapon = activeWeapon(menu, d.weaponId)
    const row = menu.rows.find((r) => r.weaponId === weapon)
    target = d.armed?.unitId ?? (hover && row?.targets.includes(hover) ? hover : null)
  }
  useTargetFocus(pending, attacker, weapon, target, pending?.kind === 'charge.targets' ? d.picked : [])
  return null
}

/** DOM overlay half (testid interaction). */
export function Interaction(): ReactElement | null {
  const pending = useDecision()
  useKeys(pending)
  return (
    <div data-testid="interaction" className="ix-root" data-mode={pending ? classify(pending) : 'none'}>
      <Effects pending={pending} />
      {pending && <Prompt pending={pending} />}
    </div>
  )
}

export { InteractionScene } from './Scene'
