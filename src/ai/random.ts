// The random tier and the decider's fallback: a seeded pick over the legal answers that skips passive options when it
// has a choice. Parameterised option types (none at M0; M2 adds e.g. a move destination) are filled by M4 policies.
import type { Action } from '../engine/types'
import type { AiContext } from './types'

/** Option types whose template needs a parameter added by the decider (M2 lists them, e.g. a move path). */
export const PARAMETERISED: ReadonlySet<string> = new Set<string>()
/** Options that throw a turn away; taken only when nothing else is offered. */
const PASSIVE: ReadonlySet<string> = new Set(['turn.pass'])

/** The random policy: never null, always one of the legal answers. */
export function randomPolicy(ctx: AiContext): Action {
  let pool = ctx.legal.filter((a) => !PASSIVE.has(a.type) && !PARAMETERISED.has(a.type))
  if (!pool.length) pool = ctx.legal
  return pool[Math.floor(ctx.rng() * pool.length)]!
}
