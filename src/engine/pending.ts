// Helpers for raising the single open PendingDecision. Pure.
import type { GameState, PendingDecision } from './types'

/** Stamp a fresh decision id (d:<n>) and store it as state.pending. */
export function raise(state: GameState, spec: Omit<PendingDecision, 'id'>): { state: GameState; pending: PendingDecision } {
  const seq = state.decisionSeq + 1
  const pending: PendingDecision = { ...spec, id: `d:${seq}` }
  return { state: { ...state, decisionSeq: seq, pending }, pending }
}

/** The id of the decision apply() is resolving right now (null outside apply). A hook that asks "did a passive just open
 *  a decision?" compares state.pending.id with it: the decision being answered is still state.pending until a new one is
 *  raised, so its kind alone says nothing. Set and cleared synchronously by apply(); it never enters GameState. */
let answering: string | null = null
export function answeringId(): string | null { return answering }
export function setAnsweringId(id: string | null): void { answering = id }

/** Legal actions for an open decision: never empty (a rule of the engine). */
export function legalActions(state: GameState) {
  return state.pending.options.map((o) => o.action)
}
