// Small shared HUD pieces: emblem, seat tag, keyword chip, rail frame.
import type { ReactNode } from 'react'
import { data, focus, seatLabel, useFocus, useGame, usePresented, type RailId } from '../contract'
import type { KwRef } from '../../data/types'
import { emblemFor, sideColour } from '../theme'
import { Tip } from './Tooltip'

export function Emblem({ race, size = 18, title }: { race: string | null | undefined; size?: number; title?: string }) {
  return (
    <svg className="emblem" width={size} height={size} viewBox="0 0 24 24" role="img" aria-label={title ?? `${race ?? 'Unknown'} emblem`} dangerouslySetInnerHTML={{ __html: emblemFor(race) }} />
  )
}

/** Colour dot + emblem + "Player 1" for a seat. */
export function SeatTag({ seat, plain }: { seat: string; plain?: boolean }) {
  const state = usePresented()
  const s = state?.seats[seat]
  return (
    <span className="seattag" data-seat={seat}>
      <span className={`sidedot side-${s?.colour ?? 'none'}`} style={{ background: sideColour(s?.colour) }} aria-hidden />
      {!plain && <span style={{ color: sideColour(s?.colour) }}><Emblem race={s?.faction} size={16} /></span>}
      <span>{seatLabel(seat)}</span>
    </span>
  )
}

/** "BURST FIRE 8" (3)" with a hover explanation in our words (keyword text from data). */
export function kwLabel(kw: KwRef): string {
  const name = data.keyword(kw.kw)?.name ?? kw.kw.replace(/_/g, ' ')
  const bits = [name]
  if (kw.tag) bits.push(kw.tag)
  if (kw.char) bits.push(kw.char)
  if (kw.unit) bits.push(kw.unit)
  if (kw.y !== undefined) bits.push(`${kw.y}"`)
  const x = kw.x !== undefined ? ` (${kw.x})` : ''
  return bits.join(' ') + x
}
export function KeywordChip({ kw }: { kw: KwRef }) {
  const def = data.keyword(kw.kw)
  return (
    <Tip title={def?.name ?? kw.kw} body={def?.text ?? 'No summary yet.'}>
      <span className="chip kw" tabIndex={0} data-testid={`kw-${kw.kw}`}>{kwLabel(kw)}</span>
    </Tip>
  )
}

const RAIL_ICON: Record<string, string> = { objectives: 'M12 3l2.6 5.4 5.9.8-4.3 4.1 1 5.8L12 16.3 6.8 19.1l1-5.8L3.5 9.2l5.9-.8z', supply: 'M4 19V9l4 3V7l4 3V5l4 4v10zM3 20h18', reserves: 'M4 7h16v12H4zM8 7V4h8v3M9 12h6', unit: 'M12 4a3 3 0 100 6 3 3 0 000-6zM6 20c0-4 2.5-6 6-6s6 2 6 6', feed: 'M5 6h14M5 12h14M5 18h9', weapons: 'M4 20L14 10M12 6l6-2 2 6-6 2zM6 14l4 4', odds: 'M12 4a8 8 0 100 16 8 8 0 000-16zM12 8v4l3 2' }

export interface RailSection { id: string; label: string; icon: keyof typeof RAIL_ICON; node: ReactNode; hidden?: boolean }

/** A translucent rail that collapses to a column of icon tabs (the table stays the hero). */
export function Rail({ id, side, sections, testid }: { id: RailId; side: 'left' | 'right'; sections: RailSection[]; testid: string }) {
  const open = useFocusRail(id)
  const shown = sections.filter((s) => !s.hidden)
  const toggleLabel = open ? 'Collapse panel' : 'Open panel'
  return (
    <aside className={`rail rail-${side}${open ? ' open' : ' shut'}`} data-testid={testid} data-open={open}>
      <Tip title={toggleLabel} placement={side === 'left' ? 'right' : 'left'}>
        <button className="rail-toggle" aria-expanded={open} aria-label={toggleLabel} data-testid={`${testid}-toggle`} onClick={() => focus.toggleRail(id)}>{(open ? side === 'left' : side !== 'left') ? '‹' : '›'}</button>
      </Tip>
      {open
        ? <div className="rail-body">{shown.map((s) => <div key={s.id} className="rail-section" data-section={s.id}>{s.node}</div>)}</div>
        : (
          <div className="rail-tabs">
            {shown.map((s) => (
              <Tip key={s.id} title={s.label} placement={side === 'left' ? 'right' : 'left'}>
                <button className="rail-tab" aria-label={s.label} data-testid={`${testid}-tab-${s.id}`} onClick={() => focus.setRail(id, true)}>
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinejoin="round" strokeLinecap="round"><path d={RAIL_ICON[s.icon]} /></svg>
                </button>
              </Tip>
            ))}
          </div>
        )}
    </aside>
  )
}

const useFocusRail = (id: RailId): boolean => useFocus((f) => f.rails[id])

/** Seat order helper for panels. */
export function useSeatOrder(): string[] { return useGame().seatOrder }

export function PanelHead({ children, right }: { children: ReactNode; right?: ReactNode }) {
  return <div className="phead"><h3>{children}</h3>{right}</div>
}
