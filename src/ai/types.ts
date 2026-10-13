// AI contracts (FROZEN at M4; docs/spec/30-ai-bot.md). Pure types, the tier table, the time budget and the work cap.
// Deciders see only view(state, seat), the open PendingDecision and legalActions; every rules number comes from
// src/engine/query.ts run against the read-only shim (world.ts queryState). Never the raw state, never state.rng.
import type { EditionBundle } from '../data/types'
import type { Action, GameState, PendingDecision, PlayerView, SeatId, UnitId, Vec2 } from '../engine/types'

export type Tier = 'random' | 'easy' | 'normal'
export const TIER_IDS: readonly Tier[] = ['random', 'easy', 'normal']

/** Every decision kind the engine raises (spec 00 s3.2, spec 30 s3). Unknown kinds fall back to the random policy. */
export const DECISION_KINDS = [
  'setup.colour', 'setup.draftControl', 'setup.ban', 'setup.pick', 'setup.terrain', 'setup.firstPlayer',
  'turn.first', 'turn.activate', 'turn.choose', 'turn.order', 'turn.over',
  'move.path', 'move.place',
  'deploy.entry', 'deploy.path', 'deploy.drop',
  'shoot.batch', 'shoot.template',
  'charge.targets', 'charge.path', 'charge.impact',
  'melee.closeRanks', 'melee.split',
  'atk.reroll', 'atk.precision', 'atk.tough', 'atk.casualty',
  'ability.window', 'ability.target', 'ability.pay', 'ability.react',
  'mission.claim', 'mission.choose',
  'score.order',
] as const
export type DecisionKind = (typeof DECISION_KINDS)[number]

/** Utility-AI parameters of one tier (spec 30 s2). `random` has none. */
export interface TierParams {
  id: Exclude<Tier, 'random'>
  /** Score noise: sigma as a fraction of the candidate score spread (0 = always the best). */
  noise: number
  /** Weight of enemy threat (expected Supply the enemy removes) at a destination; 0 = no lookahead. */
  wThreat: number
  /** Weight of cover against the nearest threats. */
  wCover: number
  /** Weight of kill odds (whole unit removed) over plain expected Supply removed. */
  wKill: number
  /** Weight of objective Supply (contests we win or flip) per marker VP. */
  wObjective: number
  /** Weight of the First Player Marker race (Pass timing, turn.first). 0 = never Passes while it can act. */
  wTempo: number
  /** Weight of keeping our own Supply brackets (casualty choice, exposure of damaged units). */
  wSurvival: number
  /** Move / deploy / charge-end candidates scored per decision (best by a cheap pre-score first). */
  moveSamples: number
  /** Deployment: 'knapsack' fills Available Supply for value; 'greedy' deploys the dearest unit that fits. */
  deploy: 'knapsack' | 'greedy'
  /** Abilities and cards: 'smart' = value gain above resource cost; 'first' = first one that adds value. */
  abilities: 'smart' | 'first'
  /** Reactions: 'smart' = beats the expected later reaction; 'first' = any that adds value. */
  reactions: 'smart' | 'first'
}

export const TIERS: Record<TierParams['id'], TierParams> = {
  easy: { id: 'easy', noise: 0.2, wThreat: 0, wCover: 0.3, wKill: 1, wObjective: 2, wTempo: 0, wSurvival: 0.3, moveSamples: 16, deploy: 'greedy', abilities: 'first', reactions: 'first' },
  normal: { id: 'normal', noise: 0, wThreat: 0.6, wCover: 1, wKill: 2, wObjective: 4, wTempo: 0.5, wSurvival: 0.6, moveSamples: 40, deploy: 'knapsack', abilities: 'smart', reactions: 'smart' },
}

/** Bench tuning hook (node only): AI_TUNE="normal.wThreat=0.8,easy.noise=0.3". */
export function applyTuning(spec: string | undefined): void {
  if (!spec) return
  for (const part of spec.split(',')) {
    const m = /^(easy|normal)\.(\w+)=(.+)$/.exec(part.trim())
    if (!m) continue
    const t = TIERS[m[1] as TierParams['id']] as unknown as Record<string, unknown>
    const v = m[3]!
    t[m[2]!] = Number.isFinite(Number(v)) ? Number(v) : v
  }
}

/** One scored candidate. Only `value` decides; `parts` feeds the bench and the AI trace (spec 30 s9). */
export type ScorePart = 'vp' | 'damage' | 'kill' | 'supply' | 'threat' | 'cover' | 'objective' | 'survival' | 'tempo' | 'cost'
export interface Score { value: number; parts: Partial<Record<ScorePart, number>> }
export interface Scored<T = Action> { action: T; score: Score }

export interface KindStats { n: number; ms: number; max: number; fallbacks: number; work: number; capped: number }
export interface AiStats { decisions: number; ms: number; maxMs: number; fallbacks: number; errors: number; hard: number; byKind: Record<string, KindStats> }

/** Per-seat memory across the decisions of one game (lives in the decider; the worker keys it by memoryKey). */
export interface AiMemory {
  /** The activation plan: unit and intended remaining menu picks (action types), re-planned when stale. */
  plan: { unitId: UnitId; round: number; phase: string; steps: string[] } | null
  /** Deployment plan of this Movement Phase: reserve units chosen by the knapsack (spec 30 s5). */
  deployPlan: { round: number; unitIds: UnitId[] } | null
  /** Phases ('<round>:<phase>') in which this seat has Passed (the view does not carry state.passed). */
  passed: Set<string>
  /** Units whose move found no useful answer, keyed `${unitId}:${round}`. */
  stuck: Set<string>
  stats: AiStats
}
export const newMemory = (): AiMemory => ({
  plan: null, deployPlan: null, passed: new Set(), stuck: new Set(),
  stats: { decisions: 0, ms: 0, maxMs: 0, fallbacks: 0, errors: 0, hard: 0, byKind: {} },
})

/** Host options for createAiDecider. */
export interface AiOpts {
  /** Seed of the AI's own stream (deriveSeed(seed, tag, round, id)); never state.rng. */
  seed: string
  bundle: EditionBundle
  /** Per-decision budget in ms (default aiBudgetMs()). */
  budgetMs?: number
  /** Dry run of a parameterised answer: main thread gameStore.preview, bench apply(...).ok, worker shimAccepts. */
  accepts?: (a: Action) => boolean
  /** Clock (tests). */
  now?: () => number
  memory?: AiMemory
}

/** Deterministic anytime cutoff: timeUp counts calls against `cap` (a pure function of the budget), so answers do not
 *  depend on machine speed; the wall clock is only a hard safety stop at `hardDeadline` (hardDeadlineMs). */
export interface WorkMeter { n: number; cap: number; hardDeadline: number; hard: boolean }

/** Everything a policy may use for one decision. */
export interface AiContext {
  tier: Tier
  /** Tier parameters (TIERS.normal for the random tier, which never runs a policy). */
  params: TierParams
  seat: SeatId
  bundle: EditionBundle
  view: PlayerView
  pending: PendingDecision
  legal: Action[]
  /** Read-only query shim built from the view (world.ts queryState). Passed to query.*; never applied. */
  q: GameState
  /** Seeded stream for tie breaks and noise: deriveSeed(seed, 'ai', round, pending.id). */
  rng: () => number
  accepts: (a: Action) => boolean
  now: () => number
  deadline: number
  work: WorkMeter
  memory: AiMemory
}

/** A policy answers one decision kind; null = no opinion (the decider uses the random policy). */
export type Policy = (ctx: AiContext) => Action | null
export type PolicyTable = Partial<Record<DecisionKind | `${string}.*`, Policy>>

/** What the enemy could do to `unitId` standing at `at` next Phase (spec 30 s9). */
export interface ThreatReport { expSupply: number; pKill: number; attackers: UnitId[] }
/** One enemy unit's reach next Phase: move (or run) plus charge, and its longest ranged weapon. */
export interface ThreatReach {
  unitId: UnitId; at: Vec2
  /** Move reach (0 once the unit has moved this Movement Phase). */
  move: number
  /** Mean charge distance (engine chargeMin..chargeMax), and the two ends. */
  charge: number; chargeMin: number; chargeMax: number
  /** Longest ranged weapon reach (LONG_RANGE included). */
  range: number
  melee: boolean
  /** Spread of the unit's models around its leader. */
  extent: number
}
export interface ThreatMap {
  seat: SeatId
  reach: Record<UnitId, ThreatReach>
  /** Memo of threatAt keyed `${unitId}@${x.toFixed(1)},${z.toFixed(1)}`. */
  memo: Map<string, ThreatReport>
}

/** A scored movement answer (move.path, deploy.path, charge.path, move.place): the action and its leader end spot. */
export interface MoveCandidate { action: Action; end: Vec2 | null; score: Score }

/** VP outlook for a seat (eval.vpOutlook): VP now, what Scoring would add now, and a projection to the game's end. */
export interface VpOutlook { seat: SeatId; vp: number; ifScoredNow: number; projected: number }

const DEFAULT_AI_MS = 150
/** Worker answer timeout in the client (aiWorkerClient): after this the main-thread decider answers. */
export const AI_WORKER_TIMEOUT_MS = 3000
/** Per-decision AI budget: AI_MS (node) or VITE_AI_MS (browser), default 150 ms (spec 30 s10). CI runners are slow. */
export function aiBudgetMs(): number {
  const fromNode = typeof process !== 'undefined' ? Number(process.env?.AI_MS) : NaN
  if (Number.isFinite(fromNode) && fromNode > 0) return fromNode
  const env = (import.meta as { env?: Record<string, unknown> }).env
  const fromVite = Number(env?.VITE_AI_MS)
  return Number.isFinite(fromVite) && fromVite > 0 ? fromVite : DEFAULT_AI_MS
}

/** Work units allowed per millisecond of budget. One unit is about 0.5 ms of query.* work on a desktop under node (a
 *  cheap call is 1 unit, an uncached attackPreview 2, a chargeOdds 6; see spend and tools/ai-bench.ts slowKinds), so the
 *  default 150 ms budget is a cap of 225 (about 70 ms of query work on average, 100 ms on the slowest tables; the spec gate is a mean under 50). The cap, not the clock, ends a normal decision: answers do not depend on
 *  machine speed (a slower machine only takes longer). */
export const WORK_PER_MS = 1.5
/** The wall-clock safety net: a normal decision never reaches it (the work cap ends it long before), so it never changes
 *  an answer. 4x the budget, but never under 60% of the worker timeout. */
export const hardDeadlineMs = (budgetMs: number): number => Math.max(budgetMs * 4, AI_WORKER_TIMEOUT_MS * 0.6)
/** Charge `cost` work units without checking the cap (an expensive query call that was just made or is about to be). */
export function spend(ctx: Pick<AiContext, 'work'>, cost: number): void { ctx.work.n += cost }
/** True once the decision's work cap is spent (or, as a safety stop only, the hard wall clock); searches return their best so far.
 *  `cost` units are charged per call (default 1). */
export function timeUp(ctx: Pick<AiContext, 'now' | 'work'>, cost = 1): boolean {
  const w = ctx.work
  w.n += cost
  if (w.n > w.cap) return true
  if (ctx.now() >= w.hardDeadline) { w.hard = true; return true }
  return false
}
