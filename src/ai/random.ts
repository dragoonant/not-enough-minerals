// The random tier and the decider's fallback: a seeded pick over the legal answers that skips passive options when it
// has a choice. Almost every decision enumerates its answers (paths and points included); the few templates that need
// a parameter (PARAMETERISED) are completed by a seeded search checked with ctx.accepts (the host's dry run).
import type { Action, Vec2 } from '../engine/types'
import type { AiContext } from './types'
import { leaderOf } from './world'

/** Option types whose template needs a parameter added by the decider (spec 00 s3.1). move.place: leaderId + dest. */
export const PARAMETERISED: ReadonlySet<string> = new Set<string>(['move.place'])
/** Options that throw a turn away; the random tier takes them only when nothing else is offered (the bench baseline:
 *  keep this set as it is, so the gates measure against the same random opponent). */
export const PASSIVE: ReadonlySet<string> = new Set(['turn.pass'])

/** Fill a move.place template: the farthest accepted spot within its `x` inches over 8 seeded bearings. */
export function completePlace(ctx: AiContext, t: Action, goal?: Vec2): Action | null {
  const unitId = t.unitId as string
  const lead = leaderOf(ctx.q, unitId)
  const x = typeof t.x === 'number' ? t.x : 0
  if (!lead) return null
  const start = ctx.rng() * Math.PI * 2
  const bearings = Array.from({ length: 8 }, (_, i) => start + (i * Math.PI) / 4)
  if (goal) bearings.unshift(Math.atan2(goal.z - lead.pos.z, goal.x - lead.pos.x))
  for (const frac of [1, 0.75, 0.5, 0.25]) {
    for (const b of bearings) {
      const dest = { x: lead.pos.x + Math.cos(b) * x * frac, z: lead.pos.z + Math.sin(b) * x * frac }
      const a: Action = { ...t, leaderId: lead.id, dest }
      if (ctx.accepts(a)) return a
    }
  }
  const stay: Action = { ...t, leaderId: lead.id, dest: { ...lead.pos } }
  return ctx.accepts(stay) ? stay : null
}

/** Complete a parameterised pick; null when no accepted parameter was found. */
export function completeRandom(ctx: AiContext, pick: Action): Action | null {
  if (!PARAMETERISED.has(pick.type)) return pick
  if (pick.type === 'move.place') return completePlace(ctx, pick)
  return null
}

/** The random policy: never null, always a legal answer (a completed parameterised one when that is all there is). */
export function randomPolicy(ctx: AiContext): Action {
  let pool = ctx.legal.filter((a) => !PASSIVE.has(a.type) && !PARAMETERISED.has(a.type))
  if (!pool.length) pool = ctx.legal.filter((a) => !PARAMETERISED.has(a.type))
  if (pool.length) return pool[Math.floor(ctx.rng() * pool.length)]!
  for (const t of ctx.legal) {
    const a = completeRandom(ctx, t)
    if (a) return a
  }
  return ctx.legal[0]!
}
