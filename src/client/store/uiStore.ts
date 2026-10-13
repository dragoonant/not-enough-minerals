// Shared view state across the slot owners (FROZEN with contract.ts at M3): what the player is pointing at and which
// panels and overlays are open. Never game state and never a rules number. Interaction (I) writes hover / select /
// target; the HUD (U) writes cardHover, rails and the briefing; Board/Figures (P) read all of it and report figuresReady.
import { create } from 'zustand'
import type { Id, UnitId } from '../../engine/types'

export type RailId = 'left' | 'right'
export type OverlayId = 'rings' | 'zones' | 'threat' | 'detection'

export interface FocusState {
  /** Unit under the pointer on the table. */
  hoverUnitId: UnitId | null
  /** Unit selected on the table (or picked in a list); its card shows in the HUD. */
  selectedUnitId: UnitId | null
  /** Candidate target being previewed (odds panel): attacker, weapon and target, or a charge. */
  target: { kind: 'attack'; attackerUnitId: UnitId; weaponId: Id; targetUnitId: UnitId } | { kind: 'charge'; unitId: UnitId; targetIds: UnitId[] } | null
  /** Unit whose card the pointer is over in the HUD: Figures glow its models. */
  cardHoverUnitId: UnitId | null
  /** Rails: open (full) or collapsed to icon tabs. */
  rails: Record<RailId, boolean>
  briefingOpen: boolean
  /** The briefing has been shown for this game epoch (opens once at game start). */
  briefingSeenEpoch: number
  overlays: Record<OverlayId, boolean>
  /** Board/Figures have loaded the figures of the current game (the bot waits for this; the watchdog does not). */
  figuresReady: boolean
}

export const INITIAL_FOCUS: FocusState = {
  hoverUnitId: null, selectedUnitId: null, target: null, cardHoverUnitId: null,
  rails: { left: true, right: true }, briefingOpen: false, briefingSeenEpoch: 0,
  overlays: { rings: true, zones: true, threat: false, detection: false }, figuresReady: false,
}

export const useFocusStore = create<FocusState>(() => ({ ...INITIAL_FOCUS }))
const set = useFocusStore.setState
const get = useFocusStore.getState

export const focus = {
  hover: (id: UnitId | null) => { if (get().hoverUnitId !== id) set({ hoverUnitId: id }) },
  select: (id: UnitId | null) => { if (get().selectedUnitId !== id) set({ selectedUnitId: id }) },
  setTarget: (t: FocusState['target']) => set({ target: t }),
  cardHover: (id: UnitId | null) => { if (get().cardHoverUnitId !== id) set({ cardHoverUnitId: id }) },
  setRail: (rail: RailId, open: boolean) => set((s) => ({ rails: { ...s.rails, [rail]: open } })),
  toggleRail: (rail: RailId) => set((s) => ({ rails: { ...s.rails, [rail]: !s.rails[rail] } })),
  openBriefing: (open = true) => set({ briefingOpen: open }),
  /** Open the briefing once per game epoch (call when a game starts). */
  briefOnce: (epoch: number) => { if (get().briefingSeenEpoch !== epoch) set({ briefingOpen: true, briefingSeenEpoch: epoch }) },
  setOverlay: (id: OverlayId, on: boolean) => set((s) => ({ overlays: { ...s.overlays, [id]: on } })),
  toggleOverlay: (id: OverlayId) => set((s) => ({ overlays: { ...s.overlays, [id]: !s.overlays[id] } })),
  setFiguresReady: (ready: boolean) => { if (get().figuresReady !== ready) set({ figuresReady: ready }) },
}

/** New game or load: drop per-game focus (rails and overlays are kept). */
export function resetFocus(): void {
  set({ hoverUnitId: null, selectedUnitId: null, target: null, cardHoverUnitId: null, briefingOpen: false, figuresReady: false })
}
export const isFiguresReady = (): boolean => get().figuresReady
