// The AI decider (FROZEN at M4; spec 30). createAiDecider(tier, opts) implements the engine Decider: it builds an
// AiContext from the view (query shim, seeded stream, work meter), dispatches on pending.kind to POLICIES (exact kind
// first, then the '<namespace>.*' entry), checks the answer (legal template, plus ctx.accepts for parameterised
// answers) and falls back to the random policy on null, a bad answer or a throw. The random tier runs no policy.
import type { Decider } from '../engine/decider'
import { deriveSeed, nextFloat } from '../engine/rng'
import type { Action, PendingDecision, PlayerView } from '../engine/types'
import { POLICIES } from './policies'
import { PARAMETERISED, randomPolicy } from './random'
import { aiBudgetMs, hardDeadlineMs, newMemory, TIERS, WORK_PER_MS, type AiContext, type AiMemory, type AiOpts, type Policy, type Tier } from './types'
import { isLegalShape, namespaceOfKind, queryState } from './world'

export { POLICIES }

const clock = (): number => (typeof performance !== 'undefined' ? performance.now() : Date.now())

/** Seeded stream for one decision: deriveSeed(seed, 'ai', round, decisionId, tier); never state.rng. */
export function rngFor(seed: string, round: number, decisionId: string, tier: Tier): () => number {
  let st = deriveSeed(seed, 'ai', round, decisionId, tier)
  return () => { const [f, n] = nextFloat(st); st = n; return f }
}

/** The policy for a decision kind: exact kind, else the namespace entry ('shoot.*'), else none (random). */
export function policyFor(kind: string): Policy | undefined {
  const table = POLICIES as Record<string, Policy | undefined>
  return table[kind] ?? table[`${namespaceOfKind(kind)}.*`]
}

export function makeContext(tier: Tier, view: PlayerView, pending: PendingDecision, legal: Action[], opts: AiOpts, memory: AiMemory): AiContext {
  const now = opts.now ?? clock
  const budget = opts.budgetMs ?? aiBudgetMs()
  const t0 = now()
  return {
    tier, params: tier === 'random' ? TIERS.normal : TIERS[tier], seat: view.seat, bundle: opts.bundle, view, pending, legal,
    q: queryState(view, opts.bundle),
    rng: rngFor(opts.seed, view.round, pending.id, tier),
    accepts: opts.accepts ?? ((a) => isLegalShape(a, legal)),
    now, deadline: t0 + budget,
    work: { n: 0, cap: Math.max(20, Math.round(budget * WORK_PER_MS)), hardDeadline: t0 + hardDeadlineMs(budget), hard: false },
    memory,
  }
}

/** A usable answer: matches a legal template and, when parameterised, is accepted by the dry run. */
export function answerOk(ctx: AiContext, a: Action | null): a is Action {
  if (!a || !isLegalShape(a, ctx.legal)) return false
  return !PARAMETERISED.has(a.type) || ctx.accepts(a)
}

export interface AiDecision { action: Action; fallback: boolean; ms: number }
export interface AiDecider extends Decider {
  readonly tier: Tier
  readonly memory: AiMemory
  /** Synchronous core (bench, worker, tests). */
  decideSync(view: PlayerView, pending: PendingDecision, legal: Action[]): AiDecision
}

/** The AI decider for a tier ('random' = the random policy only). Same view, decision, legal list and seed -> same answer. */
export function createAiDecider(tier: Tier, opts: AiOpts): AiDecider {
  const memory = opts.memory ?? newMemory()
  function decideSync(view: PlayerView, pending: PendingDecision, legal: Action[]): AiDecision {
    if (legal.length === 0) throw new Error(`ai decider: no legal actions for ${pending.id}`)
    const ctx = makeContext(tier, view, pending, legal, opts, memory)
    const t0 = ctx.now()
    let action: Action | null = null
    let fallback = false
    const policy = tier === 'random' ? undefined : policyFor(pending.kind)
    if (policy) {
      try {
        const a = policy(ctx)
        if (answerOk(ctx, a)) action = a
        else if (a !== null) fallback = true // an unusable answer (not a legal template, or refused by the dry run)
      } catch {
        memory.stats.errors++
        fallback = true
      }
    }
    // null = no opinion: the random policy answers and it is not counted as a fallback.
    if (!action) action = randomPolicy(ctx)
    const ms = ctx.now() - t0
    const st = memory.stats
    st.decisions++; st.ms += ms; st.maxMs = Math.max(st.maxMs, ms)
    if (fallback) st.fallbacks++
    if (ctx.work.hard) st.hard++
    const k = (st.byKind[pending.kind] ??= { n: 0, ms: 0, max: 0, fallbacks: 0, work: 0, capped: 0 })
    k.n++; k.ms += ms; k.max = Math.max(k.max, ms); if (fallback) k.fallbacks++
    k.work += ctx.work.n; if (ctx.work.n > ctx.work.cap) k.capped++
    return { action, fallback, ms }
  }
  return {
    tier, memory, decideSync,
    async decide(view, pending, legal) { return decideSync(view, pending, legal).action },
  }
}
