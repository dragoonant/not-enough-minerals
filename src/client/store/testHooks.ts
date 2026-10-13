// window.__game for ?test=1 (spec 00 s8, spec 50 s7, KNOWLEDGE-BASE 1.5). Installed by bootClient; params in params.ts.
import { view as engineView } from '../../engine/view'
import type { Action, GameState, PendingDecision, PlayerView, SeatId } from '../../engine/types'
import { getBotDriver } from '../bot/botDriver'
import { skipAll } from '../presentation/director'
import { usePresentedStore } from '../presentation/presentedStore'
import { parseSpeed, type Params } from '../params'
import { dispatch, legalFor, ownerSeat, useGameStore, type ClientRejection, type ResolvedLaunch } from './gameStore'
import { useSettingsStore } from './settingsStore'
import { focus, isFiguresReady } from './uiStore'

export interface GameTestApi {
  /** True engine state. */
  getState(): GameState | null
  /** What a seat may see (default: the seat that owns the open decision). */
  view(seat?: SeatId): PlayerView | null
  pending(): PendingDecision | null
  legalActions(): Action[]
  /** Dispatch as a test source (bypasses the human-seat check, never the engine's). Returns the rejection or null. */
  submit(action: Action): ClientRejection | null
  /** Hold (true) or release (false) every bot answer, the watchdog included. */
  pauseBots(paused?: boolean): void
  /** Presentation idle (no beat playing or queued). */
  idle(): boolean
  /** Show everything queued now. */
  skipAll(): void
  /** Animation speed for this session: a number (0 = instant) or instant | fast | normal | slow. */
  setSpeed(speed: number | string): void
  /** Figures loaded (the bot waits for this); figuresReady(true) unblocks bots in a headless run. */
  figuresReady(ready?: boolean): boolean
  /** The resolved launch of the running game (matchup, armies, mission, deployment, tier). */
  launch(): ResolvedLaunch | null
  params: Params
}

export function installTestHooks(params: Params): void {
  if (!params.test || typeof window === 'undefined') return
  const api: GameTestApi = {
    getState: () => useGameStore.getState().state,
    view(seat) {
      const s = useGameStore.getState()
      const who = seat ?? ownerSeat(s.state?.pending, s)
      return s.state && who ? engineView(s.state, who) : null
    },
    pending: () => useGameStore.getState().state?.pending ?? null,
    legalActions: () => legalFor(useGameStore.getState().state),
    submit: (a) => dispatch(a, 'test'),
    pauseBots: (p = true) => getBotDriver().setPaused(p),
    idle: () => usePresentedStore.getState().idle,
    skipAll,
    setSpeed(speed) {
      const n = typeof speed === 'number' ? speed : parseSpeed(speed)
      if (n !== null && Number.isFinite(n)) useSettingsStore.getState().set({ speed: n }, false)
    },
    figuresReady(ready) { if (ready !== undefined) focus.setFiguresReady(ready); return isFiguresReady() },
    launch: () => useGameStore.getState().launch,
    params,
  }
  ;(window as unknown as { __game: GameTestApi }).__game = api
}
