// PLACEHOLDER turn flow (M0). It exists so the decision loop, client, bots, sim and save/replay run end to end before
// any StarCraft rule is built. It is NOT a rule: seats alternate one choice per round (roll a test die or pass) until
// the round limit, and the game ends in a draw. M2 replaces this module with the real phases (Movement, Assault,
// Combat, Scoring), alternating activation and pass, per docs/spec/10-rules-core.md.
import type { EditionBundle } from '../data/types'
import { roll } from './rng'
import { option, pushEvents, raiseDecision, reject, type Controller, type StepResult } from './registry'
import type { Action, GameState, SeatId } from './types'

/** Round limit of the placeholder flow (not a rules value; the rules spec sets game length). */
export const PLACEHOLDER_ROUNDS = 3

/** Open the one decision for the seat whose turn it is. */
export function openTurn(state: GameState, seat: SeatId): GameState {
  const s: GameState = { ...state, turn: { seat, step: 'choose' } }
  return raiseDecision(s, {
    seat, kind: 'turn.choose', context: { round: s.round }, canPass: true,
    options: [option('roll', 'Roll a test die', 'turn.roll', {}, seat), option('pass', 'Pass', 'turn.pass', {}, seat)],
  })
}

/** Start round 1 with the first seat. */
export function beginPlay(state: GameState): GameState {
  const first = state.seatOrder[0]!
  return openTurn({ ...state, phase: 'play', round: 1 }, first)
}

/** Hand the turn to the next seat; after the last seat a new round starts; past the limit the game ends. */
function advance(state: GameState): GameState {
  const seat = state.turn?.seat ?? state.seatOrder[0]!
  const i = state.seatOrder.indexOf(seat)
  if (i < state.seatOrder.length - 1) return openTurn(state, state.seatOrder[i + 1]!)
  const round = state.round + 1
  if (state.maxRounds !== null && round > state.maxRounds) {
    const result = { winner: null, reason: 'The placeholder game ends after its last round (no scoring yet).' }
    const over = pushEvents({ ...state, phase: 'over', turn: null, result }, [{ type: 'gameOver', winner: null, reason: result.reason }])
    // A finished game still holds exactly one decision (legalActions never empty); apply() refuses it with E_GAME_OVER.
    return raiseDecision(over, { seat: seat, kind: 'turn.over', context: {}, canPass: false, options: [option('over', 'Game over', 'turn.over', {}, seat)] })
  }
  return openTurn({ ...state, round }, state.seatOrder[0]!)
}

export const turnflow: Controller = {
  id: 'turnflow',
  kinds: ['turn'],
  options: () => [],
  resolve(state: GameState, _bundle: EditionBundle, action: Action): StepResult {
    switch (action.type) {
      case 'turn.roll': {
        const r = roll(state, { count: 1, sides: 6, purpose: 'test' })
        return { state: advance(pushEvents(r.state, [r.event])) }
      }
      case 'turn.pass':
        return { state: advance(pushEvents(state, [{ type: 'passed', seat: action.seat }])) }
      default:
        return reject('E_UNKNOWN_KIND', `The placeholder turn flow does not handle ${action.type}.`)
    }
  },
  afterAction: (state) => advance(state),
}
