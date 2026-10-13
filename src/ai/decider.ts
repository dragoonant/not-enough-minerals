// The AI decider (spec 40; skeleton at M0). createAiDecider(tier, opts) implements the engine Decider: it builds an
// AiContext from the view, dispatches on pending.kind to POLICIES, checks the answer (legal template, plus ctx.accepts for
// parameterised answers) and falls back to the random policy on null, a bad answer or a throw.
// M0 has no policies, so every tier plays the random policy. M4 fills POLICIES (verify loops ON, bench >= 95% vs random).
import type { Decider } from '../engine/decider'
import { matchesOption } from '../engine/apply'
import { deriveSeed, nextFloat } from '../engine/rng'
import type { Action, PendingDecision, PlayerView } from '../engine/types'
import { PARAMETERISED, randomPolicy } from './random'
import { aiBudgetMs, newMemory, type AiContext, type AiMemory, type AiOpts, type Policy, type Tier } from './types'

const clock = (): number => (typeof performance !== 'undefined' ? performance.now() : Date.now())

/** Policies by decision kind (M4). */
export const POLICIES: Record<string, Policy> = {}

/** Seeded stream for one decision: deriveSeed(seed, decisionId, tier); never state.rng. */
export function rngFor(seed: string, decisionId: string, tier: Tier): () => number {
  let st = deriveSeed(seed, decisionId, tier)
  return () => { const [f, n] = nextFloat(st); st = n; return f }
}

const isLegalShape = (a: Action, legal: readonly Action[]): boolean => legal.some((t) => matchesOption(a, t))

export function makeContext(tier: Tier, view: PlayerView, pending: PendingDecision, legal: Action[], opts: AiOpts, memory: AiMemory): AiContext {
  const now = opts.now ?? clock
  return {
    tier, seat: view.seat, bundle: opts.bundle, view, pending, legal,
    rng: rngFor(opts.seed, pending.id, tier),
    accepts: opts.accepts ?? ((a) => isLegalShape(a, legal)),
    now, deadline: now() + (opts.budgetMs ?? aiBudgetMs()), memory,
  }
}

/** A usable answer: matches a legal template and, when parameterised, is accepted by the dry run. */
export function answerOk(ctx: AiContext, a: Action | null): a is Action {
  if (!a || !isLegalShape(a, ctx.legal)) return false
  return !PARAMETERISED.has(a.type) || ctx.accepts(a)
}

export interface AiDecider extends Decider {
  readonly tier: Tier
  readonly memory: AiMemory
  /** Synchronous core (bench, worker, tests). */
  decideSync(view: PlayerView, pending: PendingDecision, legal: Action[]): { action: Action; fallback: boolean }
}

/** The AI decider for a tier ('random' = the random policy only). Same inputs and seed -> same answer. */
export function createAiDecider(tier: Tier, opts: AiOpts): AiDecider {
  const memory = opts.memory ?? newMemory()
  function decideSync(view: PlayerView, pending: PendingDecision, legal: Action[]): { action: Action; fallback: boolean } {
    if (legal.length === 0) throw new Error(`ai decider: no legal actions for ${pending.id}`)
    const ctx = makeContext(tier, view, pending, legal, opts, memory)
    const t0 = ctx.now()
    let action: Action | null = null
    const policy = tier === 'random' ? undefined : POLICIES[pending.kind]
    if (policy) {
      try {
        const a = policy(ctx)
        if (answerOk(ctx, a)) action = a
      } catch {
        memory.stats.errors++
      }
    }
    const fallback = !action && !!policy
    if (!action) action = randomPolicy(ctx)
    const ms = ctx.now() - t0
    const st = memory.stats
    st.decisions++; st.ms += ms; st.maxMs = Math.max(st.maxMs, ms)
    if (fallback) st.fallbacks++
    return { action, fallback }
  }
  return {
    tier, memory, decideSync,
    async decide(view, pending, legal) { return decideSync(view, pending, legal).action },
  }
}
