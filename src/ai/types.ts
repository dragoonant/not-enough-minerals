// AI skeleton types (M0). M4 adds the utility AI (eval, threat, moves, policies) behind POLICIES in decider.ts.
// Deciders see only view(state, seat); the host's dry run (accepts) is their only window on the engine's validation.
import type { EditionBundle } from '../data/types'
import type { Action, PendingDecision, PlayerView, SeatId } from '../engine/types'

export type Tier = 'random' | 'easy' | 'normal'
export const TIER_IDS: readonly Tier[] = ['random', 'easy', 'normal']

/** Per-decision budget in ms: VITE_AI_MS (browser) or AI_MS (node), default 1500. CI runners are slow. */
export function aiBudgetMs(): number {
  const env = (import.meta as { env?: Record<string, unknown> }).env
  const node = typeof process !== 'undefined' ? process.env?.AI_MS : undefined
  const v = Number(env?.VITE_AI_MS ?? node)
  return Number.isFinite(v) && v > 0 ? v : 1500
}

export interface AiStats { decisions: number; ms: number; maxMs: number; fallbacks: number; errors: number }
/** Per-seat memory kept across decisions of one game. */
export interface AiMemory { stuck: Set<string>; stats: AiStats }
export const newMemory = (): AiMemory => ({ stuck: new Set(), stats: { decisions: 0, ms: 0, maxMs: 0, fallbacks: 0, errors: 0 } })

export interface AiOpts {
  seed: string
  bundle: EditionBundle
  /** Per-decision budget in ms (default aiBudgetMs()). */
  budgetMs?: number
  /** Host dry run: would the engine accept this action? Default: shape check against the legal templates. */
  accepts?: (a: Action) => boolean
  now?: () => number
  memory?: AiMemory
}

/** What a policy sees for one decision. */
export interface AiContext {
  tier: Tier
  seat: SeatId
  bundle: EditionBundle
  view: PlayerView
  pending: PendingDecision
  legal: Action[]
  /** Seeded stream for this decision (never state.rng). */
  rng: () => number
  accepts: (a: Action) => boolean
  now: () => number
  deadline: number
  memory: AiMemory
}

/** A policy answers one decision kind, or returns null to fall back on the random policy. */
export type Policy = (ctx: AiContext) => Action | null
