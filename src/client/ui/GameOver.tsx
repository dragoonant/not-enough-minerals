// Game over: winner, reason, VP breakdown per Round (from the End of Round score cues), per-unit mini sheets, Rematch.
import { useMemo } from 'react'
import { data, game, seatLabel, unitName, useFeed, useGame, useGameResult, usePresented } from '../contract'
import { SeatTag } from './bits'
import { ModalLayer } from './ModalLayer'
import { neverDeployed, rosterLine, ruleWord, vpBreakdown } from './hudView'

/** The engine words its reason with raw seat ids ("A led by 8 VP"); show player labels instead. */
export function reasonText(reason: string, seatOrder: readonly string[]): string {
  let out = reason
  for (const s of seatOrder) out = out.replace(new RegExp(`(^|\\. )${s}(?= (led|finishes|wins|has)\\b)`, 'g'), (_m, pre: string) => `${pre}${seatLabel(s)}`)
  return out
}

export function GameOver() {
  const result = useGameResult()
  const state = usePresented()
  const g = useGame()
  const feed = useFeed()
  const vp = useMemo(() => vpBreakdown(feed), [feed])
  const never = useMemo(() => neverDeployed(feed), [feed])
  if (!result || !state) return null
  // every Round from 1: Supply destroyed can score VP as early as Round 1, so the table never starts later
  const lastRound = Math.max(state.round, ...Object.values(vp).flatMap((l) => l.map((r) => r.round)))
  const roundsPlayed = Array.from({ length: Math.max(1, lastRound) }, (_, i) => i + 1)
  return (
    <ModalLayer><div className="gameover" data-testid="game-over" role="dialog" aria-label="Game over">
      <div className="panel modal gameover-card" data-testid="hud-result">
        <h2 data-testid="result-title">{result.winner ? `${seatLabel(result.winner)} wins` : 'A draw'}</h2>
        <p data-testid="result-reason">{reasonText(result.reason, g.seatOrder)}</p>
        <table className="mini-table vp-table" data-testid="vp-breakdown">
          <thead><tr><th>Round</th>{g.seatOrder.map((s) => <th key={s}><SeatTag seat={s} plain /></th>)}</tr></thead>
          <tbody>
            {roundsPlayed.map((r) => (
              <tr key={r}>
                <td>{r}</td>
                {g.seatOrder.map((s) => {
                  const row = vp[s]?.find((x) => x.round === r)
                  return <td key={s}>{row ? <><b>+{row.vp}</b> <span className="small dim">{row.lines.filter((l) => l.vp > 0).map((l) => `${ruleWord(l.rule)} ${l.vp}`).join(', ')}</span></> : '-'}</td>
                })}
              </tr>
            ))}
            <tr className="total"><td>Total</td>{g.seatOrder.map((s) => <td key={s} data-testid={`vp-total-${s}`}><b>{state.seats[s]?.vp ?? 0} VP</b></td>)}</tr>
          </tbody>
        </table>
        <div className="sheets" data-testid="unit-sheets">
          {g.seatOrder.map((s) => (
            <div key={s} className="sheet">
              <h4><SeatTag seat={s} /></h4>
              <ul className="small">
                {Object.values(state.units).filter((u) => u.owner === s).map((u) => {
                  const alive = u.modelIds.filter((id) => state.models[id]?.life !== 'dead').length
                  const def = data.unit(u.profileId)
                  return (
                    <li key={u.id} className={u.location === 'destroyed' ? 'dim' : ''}>
                      {unitName(state, u.id)}: {rosterLine(u, u.modelIds.length, alive, never[u.id] ?? 0)}{def?.unique ? ' (unique)' : ''}
                    </li>
                  )
                })}
              </ul>
            </div>
          ))}
        </div>
        <div className="options">
          <button className="primary" data-testid="rematch-button" onClick={() => { game.rematch() }}>Rematch</button>
          <button className="quiet" data-testid="hud-menu" onClick={() => game.backToMenu()}>Back to the menu</button>
        </div>
      </div>
    </div></ModalLayer>
  )
}
