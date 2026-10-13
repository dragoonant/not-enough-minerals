// DOM label layer for the board: Mission Marker labels (number, holder, totals) and Entry Edge captions. Positions come
// from the same presented state as the canvas; Anchored + AnchorProjector pin them to the table.
import type { CSSProperties } from 'react'
import { seatLabel, unitName, useBoardGeometry, useObjectiveStatus, usePresented, usePresentedMarkers } from '../contract'
import type { SeatId } from '../../engine/types'
import { Anchored } from './Anchored'
import { SIDE_HEX, sideHex } from './sideColours'

const box = (border: string): CSSProperties => ({
  display: 'flex', alignItems: 'center', gap: 6, font: '600 11px/1.1 "Segoe UI", system-ui, sans-serif', color: '#dfe6ee',
  background: 'rgba(15,20,27,0.78)', border: `1px solid ${border}`, borderRadius: 4, padding: '3px 7px',
})

export const NEUTRAL_RING = '#c9d3dc'

/** Off-table token slot for the i-th removed or claimed marker (beside the left plinth edge). */
export const parkedPos = (i: number, table: { w: number; d: number }): [number, number, number] => [-table.w / 2 - 2.6, 0, -table.d / 2 + 2 + i * 2.2]

/** 'Contested (<seat> ahead)' when one seat has more models/points in range, else plain 'Contested'. */
export function contestLabel(order: readonly SeatId[], totals: Partial<Record<SeatId, number>>, name: (s: SeatId) => string): string {
  const ranked = order.map((s) => [s, totals[s] ?? 0] as const).filter(([, n]) => n > 0).sort((a, b) => b[1] - a[1])
  return ranked.length > 1 && ranked[0]![1] > ranked[1]![1] ? `Contested (${name(ranked[0]![0])} ahead)` : 'Contested'
}

export function BoardLabels() {
  const geo = useBoardGeometry()
  const state = usePresented()
  const markers = usePresentedMarkers()
  const status = useObjectiveStatus()
  if (!geo || !state) return null
  const seatColour = (s: SeatId | null) => (s ? state.seats[s]?.colour ?? null : null)
  let parked = 0
  return (
    <>
      {geo.edges.map((e) => {
        const seg = e.segments[0]
        if (!seg) return null
        return (
          <Anchored key={e.seat} at={[(seg[0].x + seg[1].x) / 2, 0.2, (seg[0].z + seg[1].z) / 2]} align="center" testid={`edge-label-${e.colour}`}>
            <div style={{ font: '700 10px/1 "Segoe UI", system-ui, sans-serif', letterSpacing: '0.08em', textTransform: 'uppercase', padding: '3px 7px', borderRadius: 3, color: '#0f141b', background: SIDE_HEX[e.colour], opacity: 0.85 }}>
              {e.colour} edge · {seatLabel(e.seat)}
            </div>
          </Anchored>
        )
      })}
      {markers.map((m) => {
        if (!m.onTable) {
          const p = parkedPos(parked++, geo.table)
          return (
            <Anchored key={m.n} at={[p[0], 0.7, p[2]]} testid={`marker-label-${m.n}`}>
              <div style={box('#46515c')}><b>{m.n}</b><span style={{ opacity: 0.8 }}>{m.claimedBy ? `claimed by ${unitName(state, m.claimedBy)}` : 'removed'}</span></div>
            </Anchored>
          )
        }
        const st = status?.find((s) => s.n === m.n)
        const present = st ? state.seatOrder.filter((s) => (st.totals[s] ?? 0) > 0) : []
        const contested = present.length > 1
        const ctrl = st ? st.controller : m.controller
        const ring = ctrl ? sideHex(seatColour(ctrl)) : NEUTRAL_RING
        return (
          <Anchored key={m.n} at={[m.pos.x, m.elev + 1.4, m.pos.z]} testid={`marker-label-${m.n}`}>
            <div data-controller={ctrl ?? ''} data-contested={contested ? '1' : '0'} style={box(ring)}>
              <b style={{ fontSize: 14, color: sideHex(m.side) }}>{m.n}</b>
              <span>{contested ? contestLabel(state.seatOrder, st?.totals ?? {}, seatLabel) : ctrl ? `${seatLabel(ctrl)} holds` : 'Open'}</span>
              {st && (
                <span style={{ opacity: 0.9 }}>
                  {state.seatOrder.map((s, i) => <span key={s} style={{ color: sideHex(seatColour(s)) }}>{i ? ' : ' : ''}{st.totals[s] ?? 0}</span>)}
                </span>
              )}
              {m.active && <span style={{ color: SIDE_HEX.neutral }}>Activated</span>}
            </div>
          </Anchored>
        )
      })}
    </>
  )
}
