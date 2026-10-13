// Hidden information: deciders only ever receive view(state, seat), never the raw state.
// StarCraft TMG is played open (spec 00 s5): army lists, Reserves, cards and HIDDEN status are public, so the view
// passes the public state through and never includes rng, log or debug. Redaction, if a rule ever needs it, lives here.
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
    phase: state.phase,
    roundPhase: state.roundPhase,
    seats: state.seats,
    seatOrder: state.seatOrder,
    units: state.units,
    firstPlayer: state.firstPlayer,
    active: state.active,
    activeUnit: state.activeUnit,
    missionId: state.missionId,
    deploymentId: state.deploymentId,
    markers: state.markers,
    tokens: state.tokens,
    detectors: state.detectors,
    arrivals: state.arrivals,
    attack: state.attack,
    cards: state.cards,
    result: state.result,
  }
}
