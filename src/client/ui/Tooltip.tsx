// The one shared tooltip. Native title= popups are banned (tests/client/noNativeTooltips.test.ts).
// <Tip title="Armour" body="One line"><button/></Tip>: the child gets hover / focus / tap handlers and aria-describedby;
// the popup is portalled to <body>, ignores the pointer and is clamped on screen. No title = the child untouched.
import {
  cloneElement, useCallback, useEffect, useId, useLayoutEffect, useRef, useState,
  type ReactElement, type ReactNode, type SyntheticEvent,
} from 'react'
import { createPortal } from 'react-dom'

export type TipPlacement = 'top' | 'bottom' | 'left' | 'right'
interface Box { left: number; top: number; right: number; bottom: number }
const GAP = 8
const MARGIN = 8
const DELAY_MS = 140

function place(a: Box, w: number, h: number, want: TipPlacement): { left: number; top: number } {
  const vw = window.innerWidth
  const vh = window.innerHeight
  const fits = (p: TipPlacement) => p === 'top' ? a.top - GAP - h >= MARGIN : p === 'bottom' ? a.bottom + GAP + h <= vh - MARGIN : p === 'left' ? a.left - GAP - w >= MARGIN : a.right + GAP + w <= vw - MARGIN
  const opp: Record<TipPlacement, TipPlacement> = { top: 'bottom', bottom: 'top', left: 'right', right: 'left' }
  const p = fits(want) || !fits(opp[want]) ? want : opp[want]
  const cx = (a.left + a.right) / 2
  const cy = (a.top + a.bottom) / 2
  const [left, top] = p === 'top' ? [cx - w / 2, a.top - GAP - h] : p === 'bottom' ? [cx - w / 2, a.bottom + GAP] : p === 'left' ? [a.left - GAP - w, cy - h / 2] : [a.right + GAP, cy - h / 2]
  return { left: Math.max(MARGIN, Math.min(left, vw - w - MARGIN)), top: Math.max(MARGIN, Math.min(top, vh - h - MARGIN)) }
}

function Popup({ id, anchor, placement, title, body, wide }: { id: string; anchor: Box; placement: TipPlacement; title: ReactNode; body?: ReactNode; wide?: boolean }) {
  const ref = useRef<HTMLDivElement>(null)
  const [pos, setPos] = useState<{ left: number; top: number } | null>(null)
  useLayoutEffect(() => {
    const el = ref.current
    if (!el) return
    const r = el.getBoundingClientRect()
    setPos(place(anchor, r.width, r.height, placement))
  }, [anchor, placement])
  return createPortal(
    <div ref={ref} id={id} role="tooltip" className={wide ? 'tip tip-wide' : 'tip'} data-testid="tooltip" style={{ left: pos?.left ?? -9999, top: pos?.top ?? -9999, visibility: pos ? 'visible' : 'hidden' }}>
      <div className="tip-title">{title}</div>
      {body ? <div className="tip-body">{body}</div> : null}
    </div>,
    document.body,
  )
}

/** `wide` = the roomier skill popup (max 320px). */
export interface TipProps { title?: ReactNode; body?: ReactNode; placement?: TipPlacement; disabled?: boolean; wide?: boolean; children: ReactElement }

export function Tip({ title, body, placement = 'top', disabled, wide, children }: TipProps) {
  const id = useId()
  const [anchor, setAnchor] = useState<Box | null>(null)
  const timer = useRef<number | null>(null)
  const clear = () => { if (timer.current !== null) { window.clearTimeout(timer.current); timer.current = null } }
  const show = useCallback((e: SyntheticEvent, delay: number) => {
    const el = e.currentTarget as HTMLElement
    clear()
    const go = () => { const r = el.getBoundingClientRect(); setAnchor({ left: r.left, top: r.top, right: r.right, bottom: r.bottom }) }
    if (delay > 0) timer.current = window.setTimeout(go, delay); else go()
  }, [])
  const hide = useCallback(() => { clear(); setAnchor(null) }, [])
  useEffect(() => () => clear(), [])
  useEffect(() => {
    if (!anchor) return
    const off = () => setAnchor(null)
    window.addEventListener('scroll', off, true)
    window.addEventListener('keydown', off)
    return () => { window.removeEventListener('scroll', off, true); window.removeEventListener('keydown', off) }
  }, [anchor])
  if (disabled || !title) return children
  const p = children.props as Record<string, unknown>
  const chain = <E extends SyntheticEvent>(name: string, f: (e: E) => void) => (e: E) => { f(e); (p[name] as ((e: E) => void) | undefined)?.(e) }
  return (
    <>
      {cloneElement(children, {
        'aria-describedby': anchor ? id : (p['aria-describedby'] as string | undefined),
        onMouseEnter: chain('onMouseEnter', (e: SyntheticEvent) => show(e, DELAY_MS)),
        onMouseLeave: chain('onMouseLeave', hide),
        onFocus: chain('onFocus', (e: SyntheticEvent) => show(e, 0)),
        onBlur: chain('onBlur', hide),
      } as Record<string, unknown>)}
      {anchor ? <Popup id={id} anchor={anchor} placement={placement} title={title} body={body} wide={wide} /> : null}
    </>
  )
}
