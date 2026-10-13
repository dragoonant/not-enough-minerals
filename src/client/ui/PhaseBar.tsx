// PhaseBar: Round r of L, the Phase, whose turn, who holds the First Player Marker, who has Passed, plus the Pass and
// Hold buttons (shown from the open decision's own options: turn.pass, turn.hold / move.hold).
import type { DecisionOption } from '../../engine/types'
import { game, phaseLabel, seatLabel, useFocus, useGame, usePending, usePresentationIdle, usePresented, usePresentedTurn, useWaitingFor } from '../contract'
import { SeatTag } from './bits'
import { Tip } from './Tooltip'

const isPass = (o: DecisionOption): boolean => o.action.type === 'turn.pass' || o.action.type === 'pass' || o.id === 'pass'
const isHold = (o: DecisionOption): boolean => o.action.type === 'turn.hold' || o.action.type === 'move.hold'

/** The Hold option that applies to the selected (or active) unit; the only one when the decision offers one. */
export function pickHold(options: readonly DecisionOption[], unitId: string | null): DecisionOption | null {
  const holds = options.filter(isHold)
  if (holds.length <= 1) return holds[0] ?? null
  return holds.find((o) => o.action['unitId'] === unitId) ?? null
}

export function PhaseBar() {
  const turn = usePresentedTurn()
  const state = usePresented()
  const g = useGame()
  const pending = usePending()
  const waiting = useWaitingFor()
  const idle = usePresentationIdle()
  const selected = useFocus((f) => f.selectedUnitId)
  const pass = pending?.options.find(isPass) ?? null
  const hold = pending ? pickHold(pending.options, selected ?? turn.activeUnit) : null
  const over = state?.phase === 'over'
  // One owner for the "who is acting" text. While an animation plays the presented state is behind the true one, so say
  // so; once it is idle the open decision names who must answer (the presented turn seat is the fallback).
  const status = !idle ? 'Resolving...'
    : waiting && waiting.controller !== 'human' ? `${waiting.label} is thinking`
      : waiting ? (waiting.hotSeat ? `${waiting.label}: your decision` : 'Your decision')
        : turn.seat ? `${seatLabel(turn.seat)} to act` : turn.roundPhase ? 'Start of Phase' : 'Setting up'
  return (
    <div className="phasebar" data-testid="phase-bar">
      <div className="pb-main">
        <b data-testid="hud-round">Round {turn.round}{turn.maxRounds ? ` of ${turn.maxRounds}` : ''}</b>
        <span className="pb-phase" data-testid="hud-phase">{over ? 'Game over' : phaseLabel(turn.roundPhase)}</span>
        <span className="pb-turn" data-testid="hud-turn">{over ? '' : status}</span>
      </div>
      <div className="pb-seats">
        {g.seatOrder.map((seat) => {
          const first = turn.firstPlayer === seat
          const passed = turn.passed.includes(seat)
          return (
            <span key={seat} className={`seatpill${turn.seat === seat ? ' on' : ''}`} data-testid={`seat-${seat}`}>
              <SeatTag seat={seat} />
              <span className="vp" data-testid={`seat-vp-${seat}`}>{state?.seats[seat]?.vp ?? 0} VP</span>
              {first && <Tip title="First Player Marker" body="This player acts first in each Phase this Round."><span className="chip fp" data-testid={`first-${seat}`}>1st</span></Tip>}
              {passed && <Tip title="Passed" body="This player has no more activations this Phase."><span className="chip" data-testid={`passed-${seat}`}>passed</span></Tip>}
            </span>
          )
        })}
      </div>
      {!over && (
        <div className="pb-acts">
          {hold && (
            <Tip title="Hold" body="The unit stays where it is and its activation is spent without moving.">
              <button data-testid="hold-button" onClick={() => game.submit(hold.action)}>Hold</button>
            </Tip>
          )}
          <Tip title="Pass" body={pass ? 'Give up your remaining activations for this Phase.' : 'You cannot pass right now.'}>
            <span><button className="quiet" data-testid="pass-button" disabled={!pass} onClick={() => pass && game.submit(pass.action)}>Pass</button></span>
          </Tip>
        </div>
      )}
    </div>
  )
}
