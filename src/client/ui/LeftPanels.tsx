// Left rail panels: ObjectiveTracker, SupplyHud, ReservesTray. Every number is an engine read-out (objectiveStatus,
// missionScore, supplyStatus) or a printed data value; nothing is computed here.
import { focus, game, seatLabel, unitName, useDeployment, useGame, useMission, useMissionScore, useObjectiveStatus, usePending, usePresented, usePresentedMarkers, useSupplyAll, useUnitSupplies, useViewerSeat, useFocus } from '../contract'
import { sideColour } from '../theme'
import { PanelHead, SeatTag } from './bits'
import { scoringLines } from './hudView'
import { Tip } from './Tooltip'

function MissionScoreRow({ seat }: { seat: string }) {
  const s = useMissionScore(seat)
  if (!s) return null
  return (
    <tr data-testid={`score-${seat}`}>
      <td><SeatTag seat={seat} plain /></td>
      <td>{s.vp}</td>
      <td><Tip title="If scored now" body="What the Scoring Phase would add right now, if markers stay as they are."><span>+{s.vpIfScoredNow}</span></Tip></td>
    </tr>
  )
}

export function ObjectiveTracker() {
  const status = useObjectiveStatus()
  const markers = usePresentedMarkers()
  const mission = useMission()
  const dep = useDeployment()
  const g = useGame()
  const viewer = useViewerSeat()
  const overlays = useFocus((f) => f.overlays.rings)
  const off = markers.filter((m) => !m.onTable)
  return (
    <section className="panel-sec" data-testid="objective-tracker">
      <PanelHead right={
        <Tip title="Control rings" body="Show or hide the control-zone rings on the table.">
          <button className="mini" aria-pressed={overlays} data-testid="toggle-rings" onClick={() => focus.toggleOverlay('rings')}>Rings</button>
        </Tip>
      }>Objectives</PanelHead>
      {mission && <p className="dim small" data-testid="objective-mission">{mission.name}{dep ? ` on ${dep.name}` : ''}</p>}
      <ul className="objlist">
        {(status ?? []).map((o) => {
          const m = markers.find((x) => x.n === o.n)
          const ctrl = o.controller
          return (
            <li key={o.n} className={`obj${o.active ? ' active' : ''}${m?.claimedBy ? ' claimed' : ''}`} data-testid={`objective-${o.n}`} data-controller={ctrl ?? ''}>
              <Tip title={`Marker ${o.n}`} body={`${m?.side === 'neutral' ? 'Neutral marker: it counts the same for both players.' : `${m?.side === 'red' ? 'Red' : 'Blue'} affinity: this marker belongs to that colour, so it can score differently for its owner.`} ${o.active ? 'Activated: it is lit up on the table and may be cashed in for VP.' : 'Not Activated: it is dark and cannot be cashed in yet.'}`}>
                <span className="objnum" style={{ borderColor: sideColour(m?.side), boxShadow: o.active ? `0 0 8px ${sideColour(m?.side)}` : 'none' }}>{o.n}</span>
              </Tip>
              <span className="objbody">
                <Tip title="Contest" body="Supply each player has standing in this marker's ring, in player order. Control changes hands when someone out-contests the holder; it stays where it is while nobody contests it."><span className="objtotals" tabIndex={0}>
                  {g.seatOrder.map((s, i) => (
                    <span key={s} className={ctrl === s ? 'lead' : ''} data-testid={`contest-${o.n}-${s}`}>{i > 0 ? ' : ' : ''}{o.totals[s] ?? 0}</span>
                  ))}
                </span></Tip>
                <span className="small">{ctrl ? `${seatLabel(ctrl)}${ctrl === viewer && g.controllers[ctrl] === 'human' ? ' (you)' : ''} holds it` : 'Nobody holds it'}{ctrl && m?.controlledSinceRound ? ` since Round ${m.controlledSinceRound}` : ''}{ctrl && !Object.values(o.totals).some((n) => n > 0) ? ' (nobody is contesting it now)' : ''}{m?.claimedBy ? ', carried' : ''}{o.active ? <Tip title="Activated" body="This marker is lit up on the table. Holding an Activated marker can be cashed in for VP."><b className="chip good" tabIndex={0}>Activated</b></Tip> : null}</span>
              </span>
              <span className="objvp">
                {g.seatOrder.map((s) => (o.vpNow[s] ?? 0) > 0 ? <span key={s} className="chip good">{seatLabel(s)} +{o.vpNow[s]}</span> : null)}
              </span>
            </li>
          )
        })}
        {!status?.length && <li className="dim small">No markers on the table yet.</li>}
      </ul>
      {off.length > 0 && <p className="dim small" data-testid="objective-off">Off table: {off.map((m) => `#${m.n}`).join(', ')}</p>}
      <table className="mini-table">
        <thead><tr><th>Score</th><th>VP</th><th>Now</th></tr></thead>
        <tbody>{g.seatOrder.map((s) => <MissionScoreRow key={s} seat={s} />)}</tbody>
      </table>
      {mission && (
        <details className="how" data-testid="objective-rules">
          <summary>How you score</summary>
          <ul className="small">
            {scoringLines(mission.scoring).map((l, i) => <li key={i}>{l}</li>)}
            {mission.specialWinLead !== null && <li data-testid="objective-winlead">The game ends at once if a player leads by {mission.specialWinLead} VP or more.</li>}
          </ul>
        </details>
      )}
    </section>
  )
}

/** The final Round lifts the Pool limit (the engine reports Infinity): shown as 'All'. */
const amount = (n: number): string => (Number.isFinite(n) ? String(n) : 'All')

export function SupplyHud() {
  const all = useSupplyAll()
  const state = usePresented()
  const viewer = useViewerSeat()
  return (
    <section className="panel-sec" data-testid="supply-hud">
      <PanelHead>Supply</PanelHead>
      <table className="mini-table supply">
        <thead>
          <tr>
            <th />
            <th><Tip title="Pool" body="The most Supply you may have on the table this Round."><span>Pool</span></Tip></th>
            <th><Tip title="On table" body="Supply of your units standing on the table."><span>Out</span></Tip></th>
            <th><Tip title="Available" body="Pool minus what is on the table: room left to bring units in."><span>Free</span></Tip></th>
            <th><Tip title="Next Round" body="What the pool will be next Round."><span>Next</span></Tip></th>
            <th><Tip title="Victory Points" body="Points scored so far."><span>VP</span></Tip></th>
          </tr>
        </thead>
        <tbody>
          {(all ?? []).map((s) => (
            <tr key={s.seat} data-testid={`supply-${s.seat}`} className={s.seat === viewer ? 'me' : ''}>
              <td><SeatTag seat={s.seat} plain /></td>
              <td>{amount(s.pool)}</td><td>{s.onTable}</td><td><b>{amount(s.available)}</b></td><td>{amount(s.nextPool)}</td>
              <td data-testid={`supply-vp-${s.seat}`}>{state?.seats[s.seat]?.vp ?? 0}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </section>
  )
}

export function ReservesTray() {
  const state = usePresented()
  const all = useSupplyAll()
  const supplies = useUnitSupplies()
  const viewer = useViewerSeat()
  const pending = usePending()
  if (!state || !viewer) return <section className="panel-sec" data-testid="reserves-tray" />
  const mine = Object.values(state.units).filter((u) => u.owner === viewer)
  const reserves = mine.filter((u) => u.location === 'reserves')
  const lost = mine.filter((u) => u.location === 'destroyed')
  const status = all?.find((s) => s.seat === viewer)
  const fits = new Set(status?.canArriveNow ?? [])
  const open = (unitId: string): void => {
    const opt = pending?.options.find((o) => o.action.type === 'deploy.go' && o.action['unitId'] === unitId)
    if (opt) game.submit(opt.action); else focus.select(unitId)
  }
  return (
    <section className="panel-sec" data-testid="reserves-tray">
      <PanelHead>Reserves</PanelHead>
      {reserves.length === 0 && <p className="dim small">Nothing waiting off the table.</p>}
      <ul className="reslist">
        {reserves.map((u) => {
          const sup = supplies?.[u.id] ?? null
          const ok = fits.has(u.id)
          const offered = !!pending?.options.some((o) => o.action.type === 'deploy.go' && o.action['unitId'] === u.id)
          const why = ok ? (offered ? 'Click to bring it in.' : 'It fits your free Supply.') : `Needs ${sup ?? '?'} Supply but you have ${status?.available ?? 0} free.`
          return (
            <li key={u.id} className={ok ? '' : 'grey'} data-testid={`reserve-${u.id}`} data-fits={ok}>
              <Tip title={unitName(state, u.id)} body={why}>
                <button className="rowbtn" aria-disabled={!ok} onClick={() => open(u.id)} onMouseEnter={() => focus.hover(u.id)} onMouseLeave={() => focus.hover(null)}>
                  <span>{unitName(state, u.id)}</span><span className="chip">{sup ?? '?'} Supply</span>
                </button>
              </Tip>
              {!ok && <span className="small bad">{why}</span>}
            </li>
          )
        })}
      </ul>
      {lost.length > 0 && (
        <details open={false} data-testid="lost-units">
          <summary className="small">Lost ({lost.length})</summary>
          <ul className="small">{lost.map((u) => <li key={u.id} className="dim">{unitName(state, u.id)}</li>)}</ul>
        </details>
      )}
    </section>
  )
}
