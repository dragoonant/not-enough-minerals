// Briefing: the modal that tells the player what this game is about. Opens once per game (GameScreen calls briefOnce),
// and again from the Briefing button. Mission and Deployment names, length, pool, how VP are scored, entry edges on a
// mini map and first-turn hints. All prose is ours; amounts come from the mission data.
import { useEffect, useRef } from 'react'
import {
  focus, seatLabel, useBoardGeometry, usePoolTable, useDeployment, useFocus, useGame, useMission, usePresentedMarkers, useViewerSeat, usePresented,
} from '../contract'
import { sideColour } from '../theme'
import { Emblem } from './bits'
import { ModalLayer } from './ModalLayer'
import { briefingModel, GENERAL_HINTS, poolText } from './hudView'

function MiniMap() {
  const geo = useBoardGeometry()
  const markers = usePresentedMarkers()
  const state = usePresented()
  if (!geo) return null
  const { w, d } = geo.table
  const pad = 3
  const vx = -w / 2 - pad
  const vz = -d / 2 - pad
  return (
    <svg className="minimap" viewBox={`${vx} ${vz} ${w + pad * 2} ${d + pad * 2}`} role="img" aria-label="Table map with Entry Edges" data-testid="briefing-map">
      <rect x={-w / 2} y={-d / 2} width={w} height={d} fill="#26323d" stroke="#59687a" strokeWidth={0.3} />
      {geo.edges.map((e) => (
        <g key={e.seat}>
          {e.zones.map((z, i) => <rect key={i} x={z.min.x} y={z.min.z} width={z.max.x - z.min.x} height={z.max.z - z.min.z} fill={sideColour(e.colour)} opacity={0.2} />)}
          {e.segments.map((s, i) => <line key={i} x1={s[0].x} y1={s[0].z} x2={s[1].x} y2={s[1].z} stroke={sideColour(e.colour)} strokeWidth={1.1} strokeLinecap="round" />)}
          {e.segments.map((s, i) => {
            // Labels sit just inside the table: a side edge gets its text turned to run along it, so it never clips.
            const mx = (s[0].x + s[1].x) / 2
            const mz = (s[0].z + s[1].z) / 2
            const side = Math.abs(s[0].x - s[1].x) < Math.abs(s[0].z - s[1].z)
            const label = `${seatLabel(e.seat)}${e.segments.length > 1 ? `, Edge ${i + 1}` : ''}`
            if (side) {
              const tx = mx + (mx > 0 ? -2 : 2)
              return <text key={i} x={tx} y={mz} textAnchor="middle" dominantBaseline="middle" fontSize={1.8} fill="#dfe6ee" transform={`rotate(${mx > 0 ? 90 : -90} ${tx} ${mz})`}>{label}</text>
            }
            return <text key={i} x={mx} y={mz + (mz > 0 ? -2 : 3.2)} textAnchor="middle" fontSize={1.8} fill="#dfe6ee">{label}</text>
          })}
        </g>
      ))}
      {markers.filter((m) => m.onTable).map((m) => (
        <g key={m.n}>
          <circle cx={m.pos.x} cy={m.pos.z} r={geo.ring.radius} fill="none" stroke={sideColour(geo.markerSides[m.n] ?? m.side)} strokeWidth={0.25} strokeDasharray="0.8 0.6" />
          <circle cx={m.pos.x} cy={m.pos.z} r={geo.ring.markerRadius + 0.6} fill={sideColour(geo.markerSides[m.n] ?? m.side)} />
          <text x={m.pos.x} y={m.pos.z + 0.9} textAnchor="middle" fontSize={2.2} fill="#0f141b" fontWeight={700}>{m.n}</text>
        </g>
      ))}
      {state?.terrain.map((t) => <circle key={t.id} cx={t.pos.x} cy={t.pos.z} r={0.7} fill="#6f7c88" opacity={0.6} />)}
    </svg>
  )
}

export function Briefing() {
  const open = useFocus((f) => f.briefingOpen)
  const mission = useMission()
  const dep = useDeployment()
  const viewer = useViewerSeat()
  const g = useGame()
  const state = usePresented()
  const pools = usePoolTable()
  const geo = useBoardGeometry()
  const btn = useRef<HTMLButtonElement>(null)
  useEffect(() => {
    if (!open) return
    btn.current?.focus({ preventScroll: true })
    const k = (e: KeyboardEvent) => { if (e.key === 'Escape') focus.openBriefing(false) }
    window.addEventListener('keydown', k)
    return () => window.removeEventListener('keydown', k)
  }, [open])
  if (!open) return null
  const b = mission ? briefingModel(mission, dep?.name ?? 'Unknown') : null
  const me = viewer ? state?.seats[viewer] : null
  const foe = g.seatOrder.find((s) => s !== viewer)
  const myEdges = geo?.edges.find((e) => e.seat === viewer)?.segments.length ?? 0
  return (
    <ModalLayer><div className="modal-back" data-testid="briefing-backdrop" onClick={(e) => { if (e.target === e.currentTarget) focus.openBriefing(false) }}>
      <div className="modal briefing" role="dialog" aria-modal="true" aria-label="Mission briefing" data-testid="briefing">
        <header className="bf-head">
          <p className="eyebrow">Mission briefing</p>
          <h2 data-testid="briefing-mission">{b?.missionName ?? 'Skirmish'}</h2>
          <p className="dim" data-testid="briefing-deployment">Deployment: {b?.deploymentName ?? '-'}</p>
        </header>
        <div className="bf-cols">
          <div className="bf-text">
            {b && <p data-testid="briefing-summary">{b.summary}</p>}
            {me && (
              <p className="small" data-testid="briefing-you">
                <span style={{ color: sideColour(me.colour) }}><Emblem race={me.faction} size={18} /></span>{' '}
                You are {viewer ? seatLabel(viewer) : 'a player'}, on the {me.colour ?? 'unassigned'} side{foe ? `, against ${seatLabel(foe)}` : ''}. {myEdges > 1 ? `Your units enter along the ${myEdges} bright lines of your colour on the map (Edge 1 and Edge 2); you pick one when a squad arrives.` : 'Your units enter along the bright line of your colour on the map.'}
              </p>
            )}
            {b && (
              <ul className="bf-facts">
                <li data-testid="briefing-length"><b>Length:</b> {b.gameLength} Rounds. Each Round has four Phases:
                  <ul className="bf-phases" data-testid="briefing-phases">{b.phases.map((p) => <li key={p}>{p}</li>)}</ul>
                </li>
                <li data-testid="briefing-pool"><b>Supply:</b> {poolText(b)}
                  {pools && pools.length > 0 && (
                    <table className="bf-pools" data-testid="briefing-pool-table">
                      <tbody>
                        <tr><th>Round</th>{pools.map((p) => <td key={p.round}>{p.round}</td>)}</tr>
                        <tr><th>Pool</th>{pools.map((p) => <td key={p.round}>{p.pool === null ? 'All' : p.pool}</td>)}</tr>
                      </tbody>
                    </table>
                  )}
                </li>
                <li>{b.markersStart}</li>
                {b.winLead !== null && <li data-testid="briefing-winlead">A lead of {b.winLead} VP ends the game at once.</li>}
              </ul>
            )}
            <h4>How you score</h4>
            <ul data-testid="briefing-scoring">{(b?.scoring ?? []).map((l, i) => <li key={i}>{l}</li>)}</ul>
            <h4>First turn tips</h4>
            <ul className="small" data-testid="briefing-hints">{GENERAL_HINTS.map((h) => <li key={h}>{h}</li>)}</ul>
          </div>
          <div className="bf-map">
            <MiniMap />
            <p className="small dim">Bright lines are Entry Edges (Edge 1, Edge 2 where a side has two). The tinted bands are Zones of Influence. Dashed rings show how close a squad must stand to contest a marker.</p>
          </div>
        </div>
        <footer className="bf-foot">
          <button ref={btn} className="primary" data-testid="briefing-close" onClick={() => focus.openBriefing(false)}>To the table</button>
        </footer>
      </div>
    </div></ModalLayer>
  )
}
