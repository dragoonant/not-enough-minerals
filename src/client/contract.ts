// Client contract (FROZEN at M3). Board, figures, interaction, HUD and dice code import ONLY from here (plus engine/data
// types). The start screen is the exception: it stays in the start chunk and imports store/launch.ts, store/catalog.ts
// and store/settingsStore.ts. Additive changes only; log them at the bottom of this file.
//
// Rules for callers:
//  - Render from the PRESENTED state (usePresented*), never the true state: it trails the animations.
//  - Never compute a rules number. Odds, TNs, Supply, control, visibility, reach and coherency come from the query hooks
//    below (engine/query.ts), pending.context / pending.options, or cue payloads.
//  - Answer decisions only through game.submit / game.answer / game.choose / game.pass. Preview with game.dryRun.
//  - Selectors return stable references, so they are safe as React hooks.
import { useEffect, useMemo } from 'react'
import { useShallow } from 'zustand/react/shallow'
import type { DeploymentDef, EditionBundle, KeywordDef, MissionDef, UnitDef } from '../data/types'
import {
  allAbilities, allWeapons, deploymentDef, keywordDef, markerSide, missionDef, rule, segmentToWorld, tableOf, unitDef, zoneRect,
  type Rect, type RuleKey, type RuleValue,
} from '../engine/edition'
import * as query from '../engine/query'
import { view as engineView } from '../engine/view'
import type {
  Action, Colour, GameResult, GameState, Id, MarkerState, ModelId, ModelState, PendingDecision, PlayerView, RoundPhase, SeatId,
  UnitId, UnitState, Vec2,
} from '../engine/types'
import { getBotDriver, setBotBrain, setTierBrains, startBotDriver, type TierBrainFactory } from './bot/botDriver'
import type { BotBrain, BotContext } from './bot/randomBot'
import type { Params } from './params'
import { useAnnounceStore, type Banner, type NarrationLine } from './presentation/announceStore'
import type { AtkStageData, BannerTone, Cue, CueKind, CueOf, RolledDie, SeqEvent } from './presentation/cues'
import { directorNow, onCue, setPaused, skipAll, skipBeat, type CueListener } from './presentation/director'
import { conditionWord, dataName, modelName, narrate, phaseLabel, rollLabel, seatLabel, unitName } from './presentation/labels'
import { usePresentedStore, type ActiveBeat, type DamagePop, type FeedEntry, type MoveTween, type ShownRoll } from './presentation/presentedStore'
import {
  actionFor, clearRejection, deleteAutosave, dispatch, installAutosave, isHotSeat, isHumanDecision, legalFor, loadAutosave,
  newGame, ownerSeat, preview, rematch, saveGame, setController, useGameStore,
  type ClientRejection, type GameStoreState, type NewGameOptions, type ResolvedLaunch, type SeatController,
} from './store/gameStore'
import { backToMenu, hasAutosave, MATCHUPS, matchupOf, type Launch, type Matchup, type MatchupId } from './store/launch'
import { SPEED_PRESETS, useSettingsStore, type Settings } from './store/settingsStore'
import { installTestHooks, type GameTestApi } from './store/testHooks'
import { focus, useFocusStore, type FocusState, type OverlayId, type RailId } from './store/uiStore'

// ---------- types callers need ----------
export type {
  ActiveBeat, AtkStageData, Banner, BannerTone, BotBrain, BotContext, ClientRejection, Cue, CueKind, CueListener, CueOf,
  DamagePop, FeedEntry, FocusState, GameTestApi, Matchup, MatchupId, MoveTween, NarrationLine, NewGameOptions, OverlayId,
  RailId, ResolvedLaunch, RolledDie, SeatController, SeqEvent, Settings, ShownRoll, TierBrainFactory,
}
export type {
  AttackPreview, ChargeOdds, CoherencyPreview, CoverLevel, MissionScore, ObjectiveStatus, PoolRow, Reach, SupplyStatus,
} from '../engine/query'
export type { SeeVerdict, SeeReason } from '../engine/visibility'
export type { Rect } from '../engine/edition'
export { SPEED_PRESETS, MATCHUPS, matchupOf }

// =====================================================================================================
// Presented state (render from these)
// =====================================================================================================
/** Engine state as of the animation cursor; null before a game. */
export const usePresented = (): GameState | null => usePresentedStore((s) => s.state)
/** One model as presented (its END position while a tween plays: use useTween/tweenPosition). */
export const usePresentedModel = (id: ModelId | null | undefined): ModelState | undefined =>
  usePresentedStore((s) => (id ? s.state?.models[id] : undefined))
/** All models as presented. */
export const usePresentedModels = (): Record<ModelId, ModelState> | null => usePresentedStore((s) => s.state?.models ?? null)
/** Every model id in the presented state (shallow-stable). Reserve models are included: check model.offTable. */
export const useModelIds = (): ModelId[] => usePresentedStore(useShallow((s) => (s.state ? Object.keys(s.state.models) : [])))
/** One unit as presented. */
export const usePresentedUnit = (id: UnitId | null | undefined): UnitState | undefined =>
  usePresentedStore((s) => (id ? s.state?.units[id] : undefined))
export const usePresentedUnits = (): Record<UnitId, UnitState> | null => usePresentedStore((s) => s.state?.units ?? null)
/** Unit ids (optionally of one seat), in muster order (shallow-stable). */
export const useUnitIds = (seat?: SeatId): UnitId[] =>
  usePresentedStore(useShallow((s) => (s.state ? Object.values(s.state.units).filter((u) => !seat || u.owner === seat).map((u) => u.id) : [])))
/** Mission Markers as presented (onTable false = removed or carried). */
export const usePresentedMarkers = (): MarkerState[] => usePresentedStore((s) => s.state?.markers ?? EMPTY_MARKERS)
const EMPTY_MARKERS: MarkerState[] = []
/** Round, Phase and turn as presented. `seat` = the seat acting now (active, else turn.seat). */
export interface PresentedTurn {
  round: number; maxRounds: number | null; phase: GameState['phase'] | null; roundPhase: RoundPhase | null
  seat: SeatId | null; activeUnit: UnitId | null; firstPlayer: SeatId | null; passed: SeatId[]
}
export const usePresentedTurn = (): PresentedTurn => usePresentedStore(useShallow((s) => {
  const st = s.state
  return {
    round: st?.round ?? 0, maxRounds: st?.maxRounds ?? null, phase: st?.phase ?? null, roundPhase: st?.roundPhase ?? null,
    seat: st?.active ?? st?.turn?.seat ?? null, activeUnit: st?.activeUnit ?? null, firstPlayer: st?.firstPlayer ?? null, passed: st?.passed ?? EMPTY_SEATS,
  }
}))
const EMPTY_SEATS: SeatId[] = []
/** Game result once the presented state reaches the end, else null. */
export const useGameResult = (): GameResult | null => usePresentedStore((s) => (s.state?.phase === 'over' ? s.state.result : null))

/** Active move tween for a model, if any. */
export const useTween = (id: ModelId): MoveTween | undefined => usePresentedStore((s) => s.tweens[id])
export const useTweens = (): Record<ModelId, MoveTween> => usePresentedStore((s) => s.tweens)
/** Where a tweening figure is at `now` (directorNow()), eased along its path. Display only. */
export function tweenPosition(t: MoveTween, now = directorNow()): Vec2 {
  const f = t.durationMs > 0 ? Math.min(1, Math.max(0, (now - t.startedAt) / t.durationMs)) : 1
  const e = f < 0.5 ? 2 * f * f : 1 - Math.pow(-2 * f + 2, 2) / 2
  return pointAlong(t.points, e)
}
/** Point at fraction f (0..1) of a polyline's length. */
export function pointAlong(pts: readonly Vec2[], f: number): Vec2 {
  if (pts.length === 0) return { x: 0, z: 0 }
  if (pts.length === 1 || f <= 0) return pts[0]!
  const seg = pts.slice(1).map((p, i) => Math.hypot(p.x - pts[i]!.x, p.z - pts[i]!.z))
  let left = seg.reduce((a, b) => a + b, 0) * Math.min(1, f)
  for (let i = 0; i < seg.length; i++) {
    if (left <= seg[i]! || i === seg.length - 1) {
      const t = seg[i]! > 0 ? Math.min(1, left / seg[i]!) : 1
      return { x: pts[i]!.x + (pts[i + 1]!.x - pts[i]!.x) * t, z: pts[i]!.z + (pts[i + 1]!.z - pts[i]!.z) * t }
    }
    left -= seg[i]!
  }
  return pts[pts.length - 1]!
}
/** Clock beats, tweens, pops and banners are timed against. */
export { directorNow }
/** True while a beat plays or a tween runs (keep invalidating a demand canvas). */
export const useAnimating = (): boolean => usePresentedStore((s) => s.beat !== null || Object.keys(s.tweens).length > 0)
/** Nothing queued or playing. */
export const usePresentationIdle = (): boolean => usePresentedStore((s) => s.idle)
export const usePresentationPaused = (): boolean => usePresentedStore((s) => s.paused)
/** The beat playing now (with its cue), or null. */
export const useCurrentBeat = (): ActiveBeat | null => usePresentedStore((s) => s.beat)
/** Last dice or attackStage roll shown in the tray (still rolling while directorNow() < startedAt + durationMs). */
export const useShownRoll = (): ShownRoll | null => usePresentedStore((s) => s.roll)
/** Every roll shown this game, oldest first. */
export const useDiceLog = (): ShownRoll[] => usePresentedStore((s) => s.diceLog)
/** Floating pops; drop each after startedAt + durationMs. */
export const useDamagePops = (): DamagePop[] => usePresentedStore((s) => s.pops)
/** One entry per beat shown (cue + our-words text), oldest first. */
export const useFeed = (): FeedEntry[] => usePresentedStore((s) => s.feed)
/** Bumps on every presented change (demand frameloop invalidation). */
export const usePresentedRev = (): number => usePresentedStore((s) => s.rev)
/** Big centred banner, or null. */
export const useBanner = (): Banner | null => useAnnounceStore((s) => s.banner)
/** Narration lines, oldest first. */
export const useNarration = (): NarrationLine[] => useAnnounceStore((s) => s.lines)
/** Subscribe to every cue as its beat starts (dice tray, VFX, audio). Returns an unsubscribe. */
export { onCue }

// =====================================================================================================
// Decisions (a prompt opens only when the presentation is idle: it never refers to an unseen event)
// =====================================================================================================
const promptOf = (g: GameStoreState, idle: boolean): PendingDecision | null => (idle && isHumanDecision(g) ? g.state!.pending : null)
/** The open decision when a human answers it AND the presentation is idle; else null. */
export function usePending(): PendingDecision | null {
  const idle = usePresentedStore((s) => s.idle)
  return useGameStore((g) => promptOf(g, idle))
}
const EMPTY: Action[] = []
/** Legal answers for usePending() (complete actions: the engine enumerates parameterised candidates too). */
export function usePendingLegal(): Action[] {
  const p = usePending()
  const state = useGameStore((g) => g.state)
  return p && state ? legalFor(state) : EMPTY
}
/** The true open decision whoever owns it (for "the bot is thinking" and spectators). */
export const useOpenDecision = (): PendingDecision | null => useGameStore((g) => (g.state && g.state.phase !== 'over' ? g.state.pending : null))
/** Who answers the open decision. Hot-seat: show `label` ("Player 2") so the right person takes the mouse. */
export function useWaitingFor(): { seat: SeatId; controller: SeatController; label: string; hotSeat: boolean } | null {
  return useGameStore(useShallow((g) => {
    if (!g.state || g.state.phase === 'over') return null
    const seat = ownerSeat(g.state.pending, g)
    if (!seat) return null
    return { seat, controller: g.controllers[seat] ?? 'bot', label: seatLabel(seat), hotSeat: isHotSeat(g) }
  }))
}
/** Overview of the running game (true state). */
export function useGame(): { state: GameState | null; controllers: Record<SeatId, SeatController>; seatOrder: SeatId[]; hotSeat: boolean; version: number; epoch: number; seed: string; launch: ResolvedLaunch | null } {
  return useGameStore(useShallow((g) => ({ state: g.state, controllers: g.controllers, seatOrder: g.seatOrder, hotSeat: isHotSeat(g), version: g.version, epoch: g.epoch, seed: g.seed, launch: g.launch })))
}
export const useHasGame = (): boolean => useGameStore((g) => g.state !== null)
export const useControllers = (): Record<SeatId, SeatController> => useGameStore((g) => g.controllers)
/** The resolved launch (matchup, armies, mission, deployment, tier). */
export const useLaunch = (): ResolvedLaunch | null => useGameStore((g) => g.launch)
/** Bumps on every new game or load (open the briefing once per epoch). */
export const useEpoch = (): number => useGameStore((g) => g.epoch)
/** Last rejection (our words in .text, the engine's in .detail); cleared by the next accepted step. */
export const useRejection = (): ClientRejection | null => useGameStore((g) => g.lastRejection)
/** Engine crashed (bug): show a recovery prompt. */
export const useFatal = (): string | null => useGameStore((g) => g.fatal)
/** The data bundle the game runs on (records for names, cards, weapon stats). */
export const useBundle = (): EditionBundle | null => useGameStore((g) => g.bundle)
export const getBundle = (): EditionBundle | null => useGameStore.getState().bundle

// ---------- whose eyes: the seat the screen is drawn for ----------
/** The seat the screen shows: the human who answers the open decision (hot-seat hand-over), else the first human seat,
 *  else seat 0 (bots only). Near-edge camera, "you" labels and view() follow it. */
export function viewerSeatOf(g: GameStoreState): SeatId | null {
  const humans = g.seatOrder.filter((s) => g.controllers[s] === 'human')
  const owner = g.state ? ownerSeat(g.state.pending, g) : null
  if (owner && humans.includes(owner) && humans.length > 1) return owner
  return humans[0] ?? g.seatOrder[0] ?? null
}
export const useViewerSeat = (): SeatId | null => useGameStore((g) => viewerSeatOf(g))
/** view(state, viewerSeat) of the TRUE state (deciders' eyes; spec 00 s5). */
export function useView(): PlayerView | null {
  const state = useGameStore((g) => g.state)
  const seat = useViewerSeat()
  return useMemo(() => (state && seat ? engineView(state, seat) : null), [state, seat])
}

// =====================================================================================================
// Commands
// =====================================================================================================
export const game = {
  /** Start a new game from launch options (matchup, missionId, deploymentId, seats, tier, seed). Returns a rejection or null. */
  newGame: (opts: NewGameOptions = {}): ClientRejection | null => newGame(opts),
  /** Same launch and seats, fresh seed. */
  rematch: (): ClientRejection | null => rematch(),
  /** Submit a full Action as a human (refused when the open decision is a bot's). */
  submit: (a: Action): ClientRejection | null => dispatch(a, 'human'),
  /** Submit a payload for the open decision; decisionId and seat are filled in. E.g. answer({ ...opt.action, path }). */
  answer(payload: { type: string; [k: string]: unknown }): ClientRejection | null {
    const a = actionFor(payload)
    return a ? dispatch(a, 'human') : null
  },
  /** Pick one of pending.options by id (non-parameterised options). */
  choose(optionId: string): ClientRejection | null {
    const opt = useGameStore.getState().state?.pending.options.find((o) => o.id === optionId)
    return opt ? dispatch(opt.action, 'human') : null
  },
  /** Pass the open decision when it offers a pass option (turn.pass, or an option with id 'pass'). */
  pass(): ClientRejection | null {
    const opt = useGameStore.getState().state?.pending.options.find((o) => o.action.type === 'turn.pass' || o.action.type === 'pass' || o.id === 'pass')
    return opt ? dispatch(opt.action, 'human') : null
  },
  /** Legal answers for the true open decision (cached per state). */
  legal: (): Action[] => legalFor(useGameStore.getState().state),
  /** Dry run (no commit): would the engine accept this, and with what result state? For drag and placement previews. */
  dryRun: preview,
  /** Same as dryRun (M0 name). */
  preview,
  /** Fill decisionId and seat for the open decision. */
  actionFor,
  clearRejection,
  setController,
  /** Save now to the autosave slot. */
  save: () => saveGame(),
  /** Resume the autosave (replays its log). */
  continue: loadAutosave,
  hasAutosave,
  deleteAutosave,
  /** Back to the start screen. */
  backToMenu,
}

export const presentation = {
  /** Skip the beat now playing (bootClient already wires any pointerdown). */
  skip: skipBeat,
  skipAll,
  setPaused,
  /** 0 instant, 0.5 slow, 1 normal, 3 fast (SPEED_PRESETS). */
  setSpeed: (speed: number) => useSettingsStore.getState().set({ speed }),
}

export const useSettings = (): Settings => useSettingsStore(useShallow((s) => ({ speed: s.speed, narration: s.narration })))
export const settings = { set: (patch: Partial<Settings>) => useSettingsStore.getState().set(patch) }

export const bots = {
  /** Install a fixed bot brain (tests, tooling); null restores the tier brain. */
  setBrain: setBotBrain,
  /** M4: install the tier brain factory (null = random for every tier). */
  setTierBrains,
  setPaused: (p: boolean) => getBotDriver().setPaused(p),
}

// =====================================================================================================
// Shared view state (store/uiStore.ts): hover, selection, target preview, card hover glow, rails, briefing, overlays
// =====================================================================================================
/** Select from the focus store, e.g. useFocus((f) => f.selectedUnitId). Use useShallow-safe primitives or stable refs. */
export function useFocus<T>(sel: (f: FocusState) => T): T { return useFocusStore(sel) }
export { focus }
/** Figures (P) call this with true once the current game's figures are on the table; the bot waits for it. */
export function useReportFiguresReady(ready: boolean): void {
  const epoch = useGameStore((g) => g.epoch)
  useEffect(() => { focus.setFiguresReady(ready) }, [ready, epoch])
}

// =====================================================================================================
// Data lookups (records by id; names and printed text, never rules arithmetic)
// =====================================================================================================
export const useUnitDef = (profileId: Id | null | undefined): UnitDef | undefined => {
  const b = useBundle()
  return useMemo(() => (b && profileId ? unitDef(b, profileId) : undefined), [b, profileId])
}
/** The datasheet of a (presented) unit. */
export const useUnitDefOf = (unitId: UnitId | null | undefined): UnitDef | undefined => useUnitDef(usePresentedUnit(unitId)?.profileId)
/** The Mission and Deployment Card of the running game (null before they are drafted). */
export const useMission = (): MissionDef | null => {
  const b = useBundle()
  const id = useGameStore((g) => g.state?.missionId ?? null)
  return useMemo(() => (b && id ? missionDef(b, id) ?? null : null), [b, id])
}
export const useDeployment = (): DeploymentDef | null => {
  const b = useBundle()
  const id = useGameStore((g) => g.state?.deploymentId ?? null)
  return useMemo(() => (b && id ? deploymentDef(b, id) ?? null : null), [b, id])
}
/** A rules.json constant (engine edition.rule). */
export function useRule<K extends RuleKey>(key: K): RuleValue<K> | null {
  const b = useBundle()
  return useMemo(() => (b ? rule(b, key) : null), [b, key])
}
export const data = {
  unit: (id: Id): UnitDef | undefined => { const b = getBundle(); return b ? unitDef(b, id) : undefined },
  keyword: (id: string): KeywordDef | undefined => { const b = getBundle(); return b ? keywordDef(b, id) : undefined },
  /** Every weapon profile a unit can carry (defaults, then upgrade weapons). */
  weapons: allWeapons,
  /** Printed abilities plus those of the bought upgrades. */
  abilities: allAbilities,
  rule: <K extends RuleKey>(key: K): RuleValue<K> | null => { const b = getBundle(); return b ? rule(b, key) : null },
}

/** Table, Entry Edges (world segments) and Zones of Influence per seat, and Mission Marker sides: for the mat and the
 *  briefing mini map. All geometry comes from engine/edition helpers. */
export interface BoardGeometry {
  table: { w: number; d: number }
  edges: { seat: SeatId; colour: Colour; segments: [Vec2, Vec2][]; zones: Rect[] }[]
  markerSides: Record<number, Colour | 'neutral'>
  /** Contest range in inches from the marker edge, marker radius in inches, ring radius = both (engine constants). */
  ring: { contestRange: number; markerRadius: number; radius: number }
}
export function useBoardGeometry(): BoardGeometry | null {
  const b = useBundle()
  const dep = useDeployment()
  const seats = useGameStore(useShallow((g) => g.seatOrder.map((s) => `${s}:${g.state?.seats[s]?.colour ?? ''}`)))
  const table = usePresentedStore((s) => s.state?.scenario.table)
  return useMemo(() => {
    if (!b || !table) return null
    const contestRange = rule(b, 'contestRange')
    const markerRadius = rule(b, 'markerDiameterMm') / 25.4 / 2
    const edges: BoardGeometry['edges'] = []
    if (dep) {
      const size = { w: dep.size.w, h: dep.size.h }
      const depth = rule(b, 'zoiDepth')
      for (const pair of seats) {
        const [seat, colour] = pair.split(':') as [SeatId, string]
        if (colour !== 'red' && colour !== 'blue') continue
        const segs = dep.entryEdges[colour]
        edges.push({ seat, colour, segments: segs.map((g) => segmentToWorld(g, size)), zones: segs.map((g) => zoneRect(g, size, depth)) })
      }
    }
    const markerSides: Record<number, Colour | 'neutral'> = {}
    for (const m of dep?.markers ?? []) markerSides[m.n] = markerSide(m.n)
    return { table: dep ? tableOf(dep) : table, edges, markerSides, ring: { contestRange, markerRadius, radius: contestRange + markerRadius } }
  }, [b, dep, seats.join('|'), table])
}

// =====================================================================================================
// Engine queries (spec 00 s6). Prompt-time queries read the TRUE state (prompts open only while idle, when true ==
// presented); HUD read-outs (Supply, objectives, VP) read the PRESENTED state so they never run ahead of the animation.
// =====================================================================================================
const truth = (): { s: GameState; b: EditionBundle } | null => {
  const g = useGameStore.getState()
  return g.state && g.bundle ? { s: g.state, b: g.bundle } : null
}
const safe = <T>(f: () => T): T | null => { try { return f() } catch { return null } }

/** Memoised query on the TRUE state, recomputed when it changes or deps change. Prefer the named hooks below. */
export function useQuery<T>(fn: (state: GameState, bundle: EditionBundle) => T, deps: readonly unknown[]): T | null {
  const state = useGameStore((g) => g.state)
  const bundle = useGameStore((g) => g.bundle)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  return useMemo(() => (state && bundle ? safe(() => fn(state, bundle)) : null), [state, bundle, ...deps])
}
/** Memoised query on the PRESENTED state (HUD read-outs). */
export function usePresentedQuery<T>(fn: (state: GameState, bundle: EditionBundle) => T, deps: readonly unknown[]): T | null {
  const state = usePresentedStore((s) => s.state)
  const bundle = useGameStore((g) => g.bundle)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  return useMemo(() => (state && bundle ? safe(() => fn(state, bundle)) : null), [state, bundle, ...deps])
}

// ---------- prompt-time (true state) ----------
/** Odds panel: dice, Hit TN per model, Surge, Armour/Evade TNs (or why not), expected damage, kill odds, Supply removed. */
export const useAttackPreview = (attackerUnitId: UnitId | null, weaponId: Id | null, targetUnitId: UnitId | null) =>
  useQuery((s, b) => (attackerUnitId && weaponId && targetUnitId ? query.attackPreview(s, b, attackerUnitId, weaponId, targetUnitId) : null), [attackerUnitId, weaponId, targetUnitId])
/** Roll needed to charge these targets and its chance. */
export const useChargeOdds = (unitId: UnitId | null, targetIds: readonly UnitId[] | null) => {
  const key = targetIds ? targetIds.join(',') : ''
  return useQuery((s, b) => (unitId && targetIds && targetIds.length ? query.chargeOdds(s, b, unitId, [...targetIds]) : null), [unitId, key])
}
/** Can the actor unit target this unit (ranged, LoS), with reasons and the visible models. */
export const useCanSee = (actorUnitId: UnitId | null, targetUnitId: UnitId | null) =>
  useQuery((s, b) => (actorUnitId && targetUnitId ? query.canSee(s, b, actorUnitId, targetUnitId) : null), [actorUnitId, targetUnitId])
export const useCover = (attackerUnitId: UnitId | null, targetUnitId: UnitId | null) =>
  useQuery((s, b) => (attackerUnitId && targetUnitId ? query.coverFor(s, b, attackerUnitId, targetUnitId) : null), [attackerUnitId, targetUnitId])
export const useEngaged = (unitId: UnitId | null) => useQuery((s, b) => (unitId ? query.engaged(s, b, unitId) : null), [unitId])
/** Coherency of a proposed placement (pass a memoised placement object). */
export const useCoherencyPreview = (unitId: UnitId | null, placement: Record<ModelId, Vec2> | null) =>
  useQuery((s, b) => (unitId && placement ? query.coherencyPreview(s, b, unitId, placement) : null), [unitId, placement])
/** Move, Run and Charge reach (threat overlay, ruler). */
export const useReachOf = (unitId: UnitId | null) => useQuery((s, b) => (unitId ? query.reachOf(s, b, unitId) : null), [unitId])

// ---------- HUD read-outs (presented state) ----------
export const useSupplyStatus = (seat: SeatId | null) => usePresentedQuery((s, b) => (seat ? query.supplyStatus(s, b, seat) : null), [seat])
/** Supply for every seat in seat order. */
export const useSupplyAll = () => usePresentedQuery((s, b) => s.seatOrder.map((seat) => query.supplyStatus(s, b, seat)), [])
/** Per marker on the table: contest totals, controller, Activated face, VP if scored now. */
export const useObjectiveStatus = () => usePresentedQuery((s, b) => query.objectiveStatus(s, b), [])
export const useMissionScore = (seat: SeatId | null) => usePresentedQuery((s, b) => (seat ? query.missionScore(s, b, seat) : null), [seat])
/** Current Supply Value of one unit (Reserves tray, unit card). */
export const useUnitSupply = (unitId: UnitId | null) => usePresentedQuery((s, b) => (unitId ? query.unitSupply(s, b, unitId) : null), [unitId])
/** Supply per unit id for every unit (one query pass; Reserves tray). */
export const useUnitSupplies = () => usePresentedQuery((s, b) => Object.fromEntries(Object.keys(s.units).map((id) => [id, query.unitSupply(s, b, id)])) as Record<UnitId, number>, [])
/** The Supply Pool for every Round (null = unlimited). */
export const usePoolTable = () => usePresentedQuery((s, b) => query.poolTable(s, b), [])
/** Units inside an enemy detector area ('detected' status icon). */
export const useDetectedUnits = () => usePresentedQuery((s, b) => query.detectedUnits(s, b), [])

/** The same queries for event handlers (drag, click): bound to the TRUE state, null without a game. */
export const queries = {
  attackPreview: (a: UnitId, w: Id, t: UnitId) => { const x = truth(); return x ? safe(() => query.attackPreview(x.s, x.b, a, w, t)) : null },
  chargeOdds: (u: UnitId, targets: UnitId[]) => { const x = truth(); return x ? safe(() => query.chargeOdds(x.s, x.b, u, targets)) : null },
  canSee: (a: UnitId, t: UnitId) => { const x = truth(); return x ? safe(() => query.canSee(x.s, x.b, a, t)) : null },
  coverFor: (a: UnitId, t: UnitId) => { const x = truth(); return x ? safe(() => query.coverFor(x.s, x.b, a, t)) : null },
  engaged: (u: UnitId) => { const x = truth(); return x ? safe(() => query.engaged(x.s, x.b, u)) : null },
  coherencyPreview: (u: UnitId, placement: Record<ModelId, Vec2>) => { const x = truth(); return x ? safe(() => query.coherencyPreview(x.s, x.b, u, placement)) : null },
  reachOf: (u: UnitId) => { const x = truth(); return x ? safe(() => query.reachOf(x.s, x.b, u)) : null },
  supplyStatus: (seat: SeatId) => { const x = truth(); return x ? safe(() => query.supplyStatus(x.s, x.b, seat)) : null },
  objectiveStatus: () => { const x = truth(); return x ? safe(() => query.objectiveStatus(x.s, x.b)) : null },
  missionScore: (seat: SeatId) => { const x = truth(); return x ? safe(() => query.missionScore(x.s, x.b, seat)) : null },
  unitSupply: (u: UnitId) => { const x = truth(); return x ? safe(() => query.unitSupply(x.s, x.b, u)) : null },
  poolTable: () => { const x = truth(); return x ? safe(() => query.poolTable(x.s, x.b)) : null },
  detectedUnits: () => { const x = truth(); return x ? safe(() => query.detectedUnits(x.s, x.b)) : null },
}

// ---------- labels (our words; names from data) ----------
export { conditionWord, dataName, modelName, narrate, phaseLabel, rollLabel, seatLabel, unitName }

// =====================================================================================================
// Boot
// =====================================================================================================
let booted: (() => void) | null = null
/**
 * Call once from GameScreen (idempotent): applies ?speed for this session, starts the bot driver, autosave per round,
 * click-to-skip and, with ?test=1, window.__game. Returns a teardown.
 */
export function bootClient(params: Params): () => void {
  if (booted) return booted
  if (params.speed !== null) useSettingsStore.getState().set({ speed: params.speed }, false)
  const offs: (() => void)[] = []
  const d = startBotDriver()
  offs.push(() => d.stop())
  offs.push(installAutosave())
  if (typeof window !== 'undefined') {
    const onDown = () => { if (!usePresentedStore.getState().idle) skipBeat() }
    window.addEventListener('pointerdown', onDown, { capture: true })
    offs.push(() => window.removeEventListener('pointerdown', onDown, { capture: true }))
  }
  installTestHooks(params)
  booted = () => { for (const f of offs) f(); booted = null }
  return booted
}

/** Start the game a launch asks for: a new game, or the autosave (falls back to a new game if it will not load). */
export function startLaunch(launch: Launch, params: Params): ClientRejection | null {
  if (launch.mode === 'continue') {
    const r = loadAutosave()
    if (!r) return null
    deleteAutosave()
    return newGame({ seats: params.seats })
  }
  return newGame(launch.opts)
}

// Additive changes after the M3 freeze:
//  - M3 integration: useUnitSupply, useUnitSupplies, usePoolTable, useDetectedUnits (+ queries.unitSupply/poolTable/
//    detectedUnits), type PoolRow; engine/query.ts unitSupply, poolTable, detectedUnits (spec 00 s10).
