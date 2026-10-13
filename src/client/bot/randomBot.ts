// Default bot brain: the engine's seeded random decider over the legal options, skipping passive ones when it has a
// choice. Candidates are checked with gameStore.preview (a dry-run apply) through ctx.accepts; the bot never computes a
// rules number itself. M4 replaces this with the utility AI through the tier brains (aiWorkerClient.ts).
import { createRandomDecider } from '../../engine/decider'
import type { Action, PendingDecision, PlayerView } from '../../engine/types'
import { PARAMETERISED } from '../../ai/random'

export interface BotContext {
  seed: string
  /** Dry-run an action: true when the engine would accept it. */
  accepts(action: Action): boolean
  /** Time budget for this decision (VITE_AI_MS). */
  budgetMs: number
  /** True while the decision this answer is for is still the open one (a brain skips late work for a decision that moved on). */
  isCurrent?: () => boolean
}
/** A bot brain answers one decision from the seat's view. */
export type BotBrain = (view: PlayerView, pending: PendingDecision, legal: Action[], ctx: BotContext) => Promise<Action> | Action

export { PARAMETERISED }

/** Options that throw a turn away; the placeholder bot takes them only when nothing else is offered. */
const PASSIVE: ReadonlySet<string> = new Set(['turn.pass'])

/** Fill a parameterised template (none at M0); falls back to another legal option. */
export function completeAction(_view: PlayerView, _pending: PendingDecision, legal: Action[], pick: Action, _ctx: BotContext): Action {
  if (!PARAMETERISED.has(pick.type)) return pick
  return legal.find((x) => !PARAMETERISED.has(x.type)) ?? pick
}

export const randomBrain: BotBrain = async (view, pending, legal, ctx) => {
  let pool = legal.filter((a) => !PASSIVE.has(a.type))
  if (!pool.length) pool = legal
  const pick = await createRandomDecider(`${ctx.seed}:${view.seat}`).decide(view, pending, pool)
  return completeAction(view, pending, pool, pick, ctx)
}
