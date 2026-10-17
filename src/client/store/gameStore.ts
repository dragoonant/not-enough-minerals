// Game runner (spec 50, 00 s3): the true engine state and THE ONLY CALLER OF engine apply() in the client.
// Every answer (human click, bot, watchdog, test hook) goes through dispatch(); each accepted step is handed to the
// presentation director as one batch. Games are built from launch options (store/launch.ts resolveLaunch: matchup, mission,
// deployment, seats, tier, seed). Saves are (resolved launch, seed, seats, action log) and load by replaying apply().
import { create } from 'zustand'
import { edition } from '../../data/index'
import type { EditionBundle } from '../../data/types'
import { apply } from '../../engine/apply'
import { legalActions } from '../../engine/pending'
import { createGame, type CreateGameOpts } from '../../engine/setup'
import type { Action, GameState, PendingDecision, RejectionCode, SeatId } from '../../engine/types'
import { enqueueBatch, resetPresentation } from '../presentation/director'
import { setLabelContext } from '../presentation/labels'
import type { SeqEvent } from '../presentation/cues'
import { AUTOSAVE_KEY, SAVE_KIND, SAVE_VERSION, resolveLaunch, type NewGameOptions, type ResolvedLaunch, type SeatController } from './launch'
import { resetFocus } from './uiStore'
import { readJson, removeKey, writeJson } from './storage'

export type { NewGameOptions, ResolvedLaunch, SeatController }
export type DispatchSource = 'human' | 'bot' | 'watchdog' | 'test'

export interface ClientRejection {
  code: RejectionCode | 'E_CLIENT'
  /** Player-facing text, our words. */
  text: string
  /** The engine's own message. */
  detail: string
  action: Action | null
  id: number
}

export interface GameStoreState {
  /** True engine state (NOT what the screen shows: render from the presented store). */
  state: GameState | null
  bundle: EditionBundle | null
  controllers: Record<SeatId, SeatController>
  /** Seats in order with their controller (index 0 = near edge). */
  seatOrder: SeatId[]
  seed: string
  /** Every choice the running game was built from (matchup, armies, mission, deployment, tier...). */
  launch: ResolvedLaunch | null
  lastRejection: ClientRejection | null
  /** Set when the engine threw (an engine bug); answers stop until a new game or load. */
  fatal: string | null
  /** Bumps on every accepted step, new game and load. */
  version: number
  /** Bumps on every new game or load (the briefing opens once per epoch). */
  epoch: number
}

const INITIAL: GameStoreState = {
  state: null, bundle: null, controllers: {}, seatOrder: [], seed: '', launch: null, lastRejection: null, fatal: null, version: 0, epoch: 0,
}
export const useGameStore = create<GameStoreState>(() => ({ ...INITIAL }))

// ---------- rejection text (our words) ----------
const REJECTION_TEXT: Partial<Record<RejectionCode, string>> = {
  E_PLACEMENT: 'It cannot be placed there.', E_BASE_OVERLAP: 'Bases would overlap there.', E_TOO_FAR: 'That is too far.',
  E_PATH_BLOCKED: 'The way is blocked.', E_NOT_LEGAL: 'That choice is not available right now.',
  E_STALE_DECISION: 'That answers an earlier question.', E_WRONG_SEAT: 'It is not that player\'s decision.',
  E_GAME_OVER: 'The game is over.', E_BAD_PARAM: 'That choice could not be read.', E_UNKNOWN_KIND: 'That choice is not handled yet.',
  E_BAD_TARGET: 'Not a valid target.', E_TODO: 'That rule is not built yet.',
}
export const rejectionText = (code: ClientRejection['code']): string =>
  code === 'E_CLIENT' ? 'That is not possible right now.' : REJECTION_TEXT[code] ?? 'That is not allowed.'

let rejectionSeq = 0
function reject(code: ClientRejection['code'], detail: string, action: Action | null, text?: string): ClientRejection {
  const r: ClientRejection = { code, text: text ?? rejectionText(code), detail, action, id: ++rejectionSeq }
  useGameStore.setState({ lastRejection: r })
  return r
}

// ---------- seat ownership ----------
/** The seat that answers a decision: its own seat, or for 'all' the first human seat (else the first seat). */
export function ownerSeat(pending: PendingDecision | null | undefined, s: GameStoreState = useGameStore.getState()): SeatId | null {
  if (!pending) return null
  if (pending.seat !== 'all') return pending.seat
  return s.seatOrder.find((x) => s.controllers[x] === 'human') ?? s.seatOrder[0] ?? null
}
export function isHumanDecision(s: GameStoreState = useGameStore.getState()): boolean {
  if (!s.state || s.state.phase === 'over' || s.fatal) return false
  const seat = ownerSeat(s.state.pending, s)
  return !!seat && s.controllers[seat] === 'human'
}
export function isBotDecision(s: GameStoreState = useGameStore.getState()): boolean {
  if (!s.state || s.state.phase === 'over' || s.fatal) return false
  const seat = ownerSeat(s.state.pending, s)
  return !!seat && s.controllers[seat] !== undefined && s.controllers[seat] !== 'human'
}
/** Two or more human seats at one screen. */
export const isHotSeat = (s: GameStoreState = useGameStore.getState()): boolean => s.seatOrder.filter((x) => s.controllers[x] === 'human').length > 1

// ---------- legal actions, cached per state ----------
const legalCache = new WeakMap<GameState, Action[]>()
export function legalFor(state: GameState | null): Action[] {
  if (!state || state.phase === 'over') return []
  let out = legalCache.get(state)
  if (!out) { try { out = legalActions(state) } catch { out = [] } legalCache.set(state, out) }
  return out
}

// ---------- internals ----------
const randomSeed = () => Math.random().toString(36).slice(2, 10)
/** Seat ids in order: A, B, ... */
const seatIds = (seats: readonly SeatController[]): SeatId[] => seats.map((_, i) => String.fromCharCode(65 + i))

function newEvents(before: GameState, after: GameState): SeqEvent[] {
  const from = before.events.length
  return after.events.slice(from).map((event, i) => ({ seq: from + i + 1, event }))
}

/** Bumps on every new game or loaded save; per-game caches (AI memory) key on it. */
export let gameEpoch = 0

function begin(state: GameState, bundle: EditionBundle, controllers: Record<SeatId, SeatController>, seed: string, launch: ResolvedLaunch): void {
  gameEpoch++
  useGameStore.setState({
    ...INITIAL, state, bundle, controllers, seatOrder: [...state.seatOrder], seed, launch, version: useGameStore.getState().version + 1, epoch: gameEpoch,
  })
  setLabelContext({ bundle, controllers, seatOrder: state.seatOrder })
  resetFocus()
  resetPresentation(state)
}

/** Engine set-up options for a resolved launch (the demo table when launch.demo). */
export function createOptsFor(launch: ResolvedLaunch, seed: string, seats: SeatId[]): CreateGameOpts {
  if (launch.demo || !launch.armies) return { seed, seats }
  const [a, b] = seats
  return {
    seed, seats, armies: { [a!]: launch.armies[0], [b!]: launch.armies[1] },
    ...(launch.missionId ? { missionId: launch.missionId } : {}),
    ...(launch.deploymentId ? { deploymentId: launch.deploymentId } : {}),
    ...(launch.preset ? { preset: launch.preset } : {}),
    ...(launch.draft ? { draft: true } : {}),
    ...(launch.map === 'sunken-shrine' ? { map: 'sunken-shrine' as const } : {}),
  }
}

// ---------- public ----------
/** Start a new game from the data bundle. Returns a rejection (and keeps the old game) when setup fails. */
export function newGame(opts: NewGameOptions = {}): ClientRejection | null {
  const seats = (opts.seats && opts.seats.length >= 2 ? opts.seats : (['human', 'bot'] as SeatController[])).slice(0, 2)
  const seed = opts.seed || randomSeed()
  const launch = resolveLaunch(opts, seed)
  let bundle: EditionBundle, state: GameState
  try {
    bundle = edition(launch.edition)
    state = createGame(bundle, createOptsFor(launch, seed, seatIds(seats)))
  } catch (e) {
    return reject('E_CLIENT', e instanceof Error ? e.message : String(e), null, 'The game could not be set up with those choices.')
  }
  const controllers = Object.fromEntries(state.seatOrder.map((id, i) => [id, seats[i] ?? 'bot'])) as Record<SeatId, SeatController>
  begin(state, bundle, controllers, seed, launch)
  return null
}

/**
 * Answer the open decision. A 'human' source is refused when the decision belongs to a bot seat.
 * Returns null when accepted, else the rejection (also stored in lastRejection).
 */
export function dispatch(action: Action, source: DispatchSource = 'human'): ClientRejection | null {
  const s = useGameStore.getState()
  if (!s.state || !s.bundle) return reject('E_CLIENT', 'no game', action, 'Start a game first.')
  if (s.fatal) return reject('E_CLIENT', s.fatal, action, 'The game hit an internal error; start again or continue from the autosave.')
  if (source === 'human' && !isHumanDecision(s)) return reject('E_CLIENT', `decision ${s.state.pending.id} is a bot's`, action, 'It is not your decision to make.')
  const before = s.state
  let r
  try { r = apply(before, s.bundle, action) } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    useGameStore.setState({ fatal: msg })
    return reject('E_CLIENT', msg, action, 'The game hit an internal error.')
  }
  if (!r.ok) return reject(r.rejection.code, r.rejection.message, action)
  useGameStore.setState({ state: r.state, version: s.version + 1, ...(s.lastRejection ? { lastRejection: null } : {}) })
  enqueueBatch({ before, after: r.state, events: newEvents(before, r.state), action })
  return null
}

/** Dry run: what the engine would do with this action, without committing (drag previews, bot path search). */
export function preview(action: Action): { ok: true; state: GameState } | { ok: false; rejection: ClientRejection } {
  const s = useGameStore.getState()
  if (!s.state || !s.bundle) return { ok: false, rejection: { code: 'E_CLIENT', text: 'Start a game first.', detail: 'no game', action, id: 0 } }
  try {
    const r = apply(s.state, s.bundle, action)
    if (r.ok) return { ok: true, state: r.state }
    return { ok: false, rejection: { code: r.rejection.code, text: rejectionText(r.rejection.code), detail: r.rejection.message, action, id: 0 } }
  } catch (e) {
    return { ok: false, rejection: { code: 'E_CLIENT', text: rejectionText('E_CLIENT'), detail: String(e), action, id: 0 } }
  }
}

/** Fill decisionId and seat for the open decision. */
export function actionFor(payload: { type: string; [k: string]: unknown }): Action | null {
  const s = useGameStore.getState()
  const p = s.state?.pending
  const seat = ownerSeat(p, s)
  if (!p || !seat) return null
  return { ...payload, decisionId: p.id, seat } as Action
}

export function clearRejection(): void { if (useGameStore.getState().lastRejection) useGameStore.setState({ lastRejection: null }) }

export function setController(seat: SeatId, c: SeatController): void {
  useGameStore.setState((s) => ({ controllers: { ...s.controllers, [seat]: c } }))
  const s = useGameStore.getState()
  setLabelContext({ controllers: s.controllers })
}

// ---------- save / continue ----------
export interface ClientSave {
  kind: typeof SAVE_KIND; v: typeof SAVE_VERSION; savedAt: string; seed: string; launch: ResolvedLaunch
  /** Controllers in seat order. */
  seats: SeatController[]
  round: number
  log: Action[]
}

export function exportSave(): ClientSave | null {
  const s = useGameStore.getState()
  if (!s.state || !s.bundle || !s.launch) return null
  return {
    kind: SAVE_KIND, v: SAVE_VERSION, savedAt: new Date().toISOString(), seed: s.seed, launch: s.launch,
    seats: s.seatOrder.map((id) => s.controllers[id] ?? 'bot'), round: s.state.round, log: s.state.log,
  }
}
export function saveGame(key = AUTOSAVE_KEY): boolean {
  const d = exportSave()
  return d ? writeJson(key, d) : false
}
/** Rebuild a save by replaying its log through apply() (no animation). */
export function importSave(data: unknown): ClientRejection | null {
  const d = data as Partial<ClientSave> | null
  if (!d || d.kind !== SAVE_KIND || d.v !== SAVE_VERSION || !d.launch || !Array.isArray(d.log) || typeof d.seed !== 'string') return reject('E_CLIENT', 'not a save', null, 'That save could not be read.')
  const launch = d.launch
  let bundle: EditionBundle, state: GameState
  try {
    bundle = edition(launch.edition)
    const seats = d.seats && d.seats.length >= 2 ? d.seats : (['human', 'bot'] as SeatController[])
    const ids = seatIds(seats)
    state = createGame(bundle, createOptsFor(launch, d.seed, ids))
    for (const a of d.log) {
      const r = apply(state, bundle, a)
      if (!r.ok) return reject(r.rejection.code, `replay stopped at ${a.decisionId}: ${r.rejection.message}`, a, 'That save no longer matches the rules; start a new game.')
      state = r.state
    }
    const controllers = Object.fromEntries(state.seatOrder.map((id, i) => [id, seats[i] ?? 'bot'])) as Record<SeatId, SeatController>
    begin(state, bundle, controllers, d.seed, launch)
  } catch (e) {
    return reject('E_CLIENT', e instanceof Error ? e.message : String(e), null, 'That save could not be loaded.')
  }
  return null
}
export function loadAutosave(): ClientRejection | null {
  const d = readJson<unknown>(AUTOSAVE_KEY)
  return d ? importSave(d) : reject('E_CLIENT', 'no autosave', null, 'There is no saved game.')
}
export function deleteAutosave(): void { removeKey(AUTOSAVE_KEY) }

/** Autosave whenever a new round starts (and once at game over, which clears it). Returns an unsubscribe. */
export function installAutosave(): () => void {
  let lastRound = -1
  let lastVersion = -1
  return useGameStore.subscribe((s) => {
    const st = s.state
    if (!st || s.version === lastVersion) return
    lastVersion = s.version
    if (st.phase === 'over') { deleteAutosave(); lastRound = -1; return }
    if (st.round === lastRound) return
    lastRound = st.round
    if (st.round > 0) saveGame()
  })
}

/** Same launch, same seats, fresh seed (Rematch). */
export function rematch(): ClientRejection | null {
  const s = useGameStore.getState()
  if (!s.launch) return newGame({})
  const l = s.launch
  return newGame({
    seats: s.seatOrder.map((id) => s.controllers[id] ?? 'bot'), tier: l.tier, edition: l.edition,
    ...(l.demo ? { demo: true } : {}), ...(l.matchup ? { matchup: l.matchup } : {}), ...(l.draft ? { draft: true } : {}),
    ...(l.missionId ? { missionId: l.missionId } : {}), ...(l.deploymentId ? { deploymentId: l.deploymentId } : {}),
    ...(l.map ? { map: l.map } : {}),
  })
}

/** Tests: forget the current game. */
export function resetGameStore(): void {
  useGameStore.setState({ ...INITIAL })
  resetFocus()
  resetPresentation(null)
}
