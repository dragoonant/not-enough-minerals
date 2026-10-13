// Hidden information: deciders only ever receive view(state, seat), never the raw state.
// M0 passes everything through (nothing is hidden yet). TODO(M2): redact hidden things (reserves, burrowed or cloaked
// models a seat cannot detect, face-down cards) here, and nowhere else; the sim leak test (VIEW-*) checks it.
import type { GameState, PlayerView, SeatId } from './types'

export function view(state: GameState, seat: SeatId): PlayerView {
  return {
    seat,
    models: state.models,
    terrain: state.terrain,
    clouds: state.clouds,
    scenario: state.scenario,
    pending: state.pending,
    round: state.round,
    maxRounds: state.maxRounds,
    scenarioId: state.scenarioId,
  }
}
