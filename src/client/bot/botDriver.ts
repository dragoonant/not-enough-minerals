// Bot driver (KNOWLEDGE-BASE 1.4): answers bot-owned decisions through gameStore.dispatch, only while the presentation
// is idle AND the figures of the game have loaded (uiStore.figuresReady), so a bot never acts over an animation the
// player has not seen or before the table is drawn. A watchdog force-answers when a bot decision has made no progress
// for WATCHDOG_MS (5 s), whatever the presentation or the figures are doing. Per-decision AI time budget: VITE_AI_MS.
// The tier brains (createAiBrain: Web Worker, in-thread fallback) are installed by default; setTierBrains(null) = random.
import type { Action } from '../../engine/types'
import { AI_WORKER_TIMEOUT_MS, aiBudgetMs, TIER_IDS, type Tier } from '../../ai/types'
import { view as aiViewOf } from '../../engine/view'
import { readParams } from '../params'
import { isFiguresReady, useFocusStore } from '../store/uiStore'
import { skipAll } from '../presentation/director'
import { isPresentationIdle, usePresentedStore } from '../presentation/presentedStore'
import { dispatch, isBotDecision, legalFor, ownerSeat, preview, useGameStore } from '../store/gameStore'
import { getSettings, scaled, useSettingsStore } from '../store/settingsStore'
import { createAiBrain } from './aiWorkerClient'
import { completeAction, PARAMETERISED, randomBrain, type BotBrain, type BotContext } from './randomBot'

export const WATCHDOG_MS = 5000
/** Pause before a bot answers at speed 1 so a human can follow along (scaled by speed; 0 when instant). */
export const BOT_THINK_MS = 350
/** Per-decision AI budget (CI runners are slow): AI_MS / VITE_AI_MS, default 150 ms (ai/types aiBudgetMs). */
export const AI_MS: number = aiBudgetMs()

let override: BotBrain | null = null
/** Install a fixed bot brain (tests, tooling). null restores the tier-driven brain. */
export function setBotBrain(b: BotBrain | null): void { override = b }

export const DEFAULT_TIER: Tier = 'normal'
/** The opponent tier of the running game: its launch tier, else ?tier, else normal. */
export function launchTier(): Tier {
  const t = useGameStore.getState().launch?.tier ?? readParams().tier ?? undefined
  return typeof t === 'string' && (TIER_IDS as readonly string[]).includes(t) ? (t as Tier) : DEFAULT_TIER
}

/** M4 seam: a factory that builds the brain for a tier (e.g. aiWorkerClient.createAiBrain). Null = random for every tier. */
export type TierBrainFactory = (tier: Tier) => BotBrain & { dispose?(): void }
let tierFactory: TierBrainFactory | null = (tier) => createAiBrain(tier)
export function setTierBrains(f: TierBrainFactory | null): void { tierFactory = f; tiered?.dispose?.(); tiered = null }

let tiered: { key: string; brain: BotBrain; dispose?: () => void } | null = null
/** The brain for a tier: the random bot until M4 installs tier brains. */
function brainFor(tier: Tier): BotBrain {
  if (override) return override
  if (!tierFactory || tier === 'random') return randomBrain
  const key = `${tier}:${useGameStore.getState().epoch}`
  if (tiered && tiered.key === key) return tiered.brain
  tiered?.dispose?.()
  const brain = tierFactory(tier)
  tiered = { key, brain, ...(brain.dispose ? { dispose: () => brain.dispose!() } : {}) }
  return brain
}

/** Brain for a bot seat: the tier brain (every bot seat plays the launch tier). */
function brainForSeat(_controller: string | undefined): BotBrain {
  return brainFor(launchTier())
}

/** How long the driver waits for the brain before force-answering. The brain's own worker timeout plus its main-thread
 *  search (up to 4x the budget) must fit inside it, or a slow worker always loses to force() and the main-thread answer
 *  never runs; it stays under the watchdog. */
export function botRaceMs(budgetMs: number, watchdogMs: number = WATCHDOG_MS): number {
  return Math.max(budgetMs, Math.min(AI_WORKER_TIMEOUT_MS + 4 * aiBudgetMs() + 250, watchdogMs - 150))
}

export interface BotDriverOptions {
  now?: () => number
  setTimeout?: (fn: () => void, ms: number) => unknown
  clearTimeout?: (h: unknown) => void
  watchdogMs?: number
  thinkMs?: number
  budgetMs?: number
  /** Wait for uiStore.figuresReady before answering (default true; headless tests pass false). */
  requireFigures?: boolean
}

export type TickResult = 'answered' | 'thinking' | 'forced' | 'waiting' | 'notBot' | 'paused'

/** Bots act only when the presentation is idle and (by default) the figures have loaded. */
export function botMayAct(requireFigures = true): boolean {
  return isPresentationIdle() && (!requireFigures || isFiguresReady())
}

export interface BotDriver {
  /** Try to answer the open bot decision now. */
  tick(): TickResult
  start(): void
  stop(): void
  /** Test hook: hold every bot answer (the watchdog too) until released. */
  setPaused(paused: boolean): void
  readonly running: boolean
  readonly paused: boolean
  /** Watchdog force-answers since creation. */
  readonly forced: number
}

function contextFor(seed: string, budgetMs: number): BotContext {
  return { seed, budgetMs, accepts: (a: Action) => preview(a).ok }
}

/** Synchronous fallback answer: the first non-parameterised legal option (or a filled template). */
function forcedAction(): Action | null {
  const s = useGameStore.getState()
  if (!s.state) return null
  const legal = legalFor(s.state)
  const seat = ownerSeat(s.state.pending, s)
  if (!legal.length || !seat) return null
  const pick = legal.find((a) => !PARAMETERISED.has(a.type)) ?? legal[0]!
  const p = s.state.pending
  const a = completeAction(aiViewOf(s.state, seat), p, legal, pick, contextFor(s.seed, 0))
  return p.seat === 'all' ? { ...a, seat } : a
}

export function createBotDriver(opts: BotDriverOptions = {}): BotDriver {
  const now = opts.now ?? (() => Date.now())
  const setT = opts.setTimeout ?? ((fn, ms) => setTimeout(fn, ms))
  const clearT = opts.clearTimeout ?? ((h) => clearTimeout(h as ReturnType<typeof setTimeout>))
  const watchdogMs = opts.watchdogMs ?? WATCHDOG_MS
  const thinkMs = opts.thinkMs ?? BOT_THINK_MS
  const budgetMs = opts.budgetMs ?? AI_MS
  const requireFigures = opts.requireFigures ?? true

  let seen: string | null = null
  let since = now()
  let forced = 0
  let running = false
  let paused = false
  let inflight: string | null = null
  let unsubs: (() => void)[] = []
  let tickTimer: unknown = null
  let dogTimer: unknown = null

  const decisionKey = () => {
    const s = useGameStore.getState()
    return s.state ? `${s.version}:${s.state.pending.id}` : null
  }
  function note(): void { const k = decisionKey(); if (k !== seen) { seen = k; since = now() } }

  function force(): boolean {
    const a = forcedAction()
    if (!a) return false
    forced++
    skipAll()
    return dispatch(a, 'watchdog') === null
  }

  /** Ask the brain (async, budgeted); the answer is dispatched only if the same decision is still open. */
  function think(): void {
    const s = useGameStore.getState()
    if (!s.state) return
    const key = decisionKey()!
    const p = s.state.pending
    const seat = ownerSeat(p, s)!
    const legal = legalFor(s.state)
    inflight = key
    const ctx: BotContext = { ...contextFor(s.seed, budgetMs), isCurrent: () => running && decisionKey() === key }
    const raceMs = botRaceMs(budgetMs, watchdogMs)
    const timeout = new Promise<null>((res) => { setT(() => res(null), raceMs) })
    Promise.race([Promise.resolve().then(() => brainForSeat(s.controllers[seat])(aiViewOf(s.state!, seat), p, legal, ctx)), timeout])
      .catch(() => null)
      .then((a) => {
        if (inflight === key) inflight = null
        if (!running || paused || decisionKey() !== key || !isBotDecision()) return
        const answer = a ? (p.seat === 'all' ? { ...a, seat } : a) : null
        if (!answer || dispatch(answer, 'bot') !== null) force()
      })
  }

  /** Setting "skip ability windows": answer the human's optional ability window with Done once the table is idle. */
  function autoPassWindow(): boolean {
    if (!running || paused || !getSettings().skipAbilityWindows) return false
    const s = useGameStore.getState()
    const p = s.state?.pending
    if (!s.state || !p || p.kind !== 'ability.window' || isBotDecision(s) || !botMayAct(requireFigures)) return false
    const done = p.options.find((o) => o.action.type === 'ability.done')
    return done ? dispatch(done.action, 'human') === null : false
  }
  function scheduleAutoPass(): void {
    if (!running || !getSettings().skipAbilityWindows) return
    const p = useGameStore.getState().state?.pending
    if (p?.kind === 'ability.window') setT(() => { autoPassWindow() }, 0)
  }

  function tick(): TickResult {
    if (autoPassWindow()) return 'answered'
    note()
    const s = useGameStore.getState()
    if (!isBotDecision(s)) return 'notBot'
    if (paused) return 'paused'
    const key = decisionKey()
    if (now() - since >= watchdogMs) { inflight = null; return force() ? 'forced' : 'waiting' }
    if (inflight === key) return 'thinking'
    if (!botMayAct(requireFigures)) return 'waiting'
    think()
    return inflight === key ? 'thinking' : 'answered'
  }

  function schedule(): void {
    if (!running || paused || tickTimer !== null) return
    if (!isBotDecision() || !botMayAct(requireFigures) || inflight === decisionKey()) return
    const ms = scaled(thinkMs)
    tickTimer = setT(() => { tickTimer = null; if (running) { tick(); schedule() } }, ms)
  }

  function armWatchdog(): void {
    if (dogTimer !== null) clearT(dogTimer)
    dogTimer = null
    if (!running || paused) return
    note()
    if (!isBotDecision()) return
    const left = Math.max(0, since + watchdogMs - now())
    dogTimer = setT(() => { dogTimer = null; if (running) { tick(); schedule(); armWatchdog() } }, left + 1)
  }

  return {
    tick,
    start() {
      if (running) return
      running = true
      note()
      unsubs = [
        useGameStore.subscribe((s, prev) => { if (s.state !== prev.state || s.controllers !== prev.controllers) { schedule(); armWatchdog(); scheduleAutoPass() } }),
        useSettingsStore.subscribe((s, prev) => { if (s.skipAbilityWindows && !prev.skipAbilityWindows) scheduleAutoPass() }),
        usePresentedStore.subscribe((s, prev) => { if (s.idle && !prev.idle) { schedule(); scheduleAutoPass() } }),
        useFocusStore.subscribe((s, prev) => { if (s.figuresReady && !prev.figuresReady) { schedule(); scheduleAutoPass() } }),
      ]
      schedule()
      scheduleAutoPass()
      armWatchdog()
    },
    stop() {
      running = false
      inflight = null
      for (const u of unsubs) u()
      unsubs = []
      if (tickTimer !== null) clearT(tickTimer)
      if (dogTimer !== null) clearT(dogTimer)
      tickTimer = null
      dogTimer = null
    },
    setPaused(p: boolean) {
      if (paused === p) return
      paused = p
      if (!p) { since = now(); schedule(); armWatchdog() }
      else if (dogTimer !== null) { clearT(dogTimer); dogTimer = null }
    },
    get running() { return running },
    get paused() { return paused },
    get forced() { return forced },
  }
}

let appDriver: BotDriver | null = null
/** The app's single driver (started by bootClient). */
export function getBotDriver(): BotDriver { return (appDriver ??= createBotDriver()) }
export function startBotDriver(): BotDriver { const d = getBotDriver(); d.start(); return d }
