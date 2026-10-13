// Local, per-decision draft state of the interaction layer (never game state). Reset whenever the open decision changes.
// The scene writes cursor / waypoints / hover; the DOM panel reads them and writes confirm / cancel.
import { create } from 'zustand'
import type { ModelId, UnitId, Vec2 } from '../../engine/types'
import type { PathPreview } from './preview'

export interface Armed { unitId: UnitId; weaponId: string | null }

export interface DraftState {
  decisionId: string | null
  /** Squad whose action menu is open (turn.activate). */
  menuUnit: UnitId | null
  /** Path drafts. */
  leaderId: ModelId | null
  waypoints: Vec2[]
  cursor: Vec2 | null
  held: boolean
  preview: PathPreview | null
  /** Target drafts. */
  weaponId: string | null
  armed: Armed | null
  picked: UnitId[]
  /** Option under the pointer in a list (entry edge highlight, unit glow). */
  hoverOption: string | null
}

const BLANK: Omit<DraftState, 'decisionId'> = {
  menuUnit: null, leaderId: null, waypoints: [], cursor: null, held: false, preview: null, weaponId: null, armed: null, picked: [], hoverOption: null,
}

export const useDraft = create<DraftState>(() => ({ decisionId: null, ...BLANK }))
const set = useDraft.setState
const get = useDraft.getState

export const draft = {
  /** Call with the open decision id every render: a new id wipes the draft (a stale selection never leaks across decisions). */
  sync(decisionId: string | null): void {
    if (get().decisionId === decisionId) return
    set({ decisionId, ...BLANK })
  },
  reset(): void { set({ ...BLANK }) },
  openMenu: (unitId: UnitId | null) => set({ menuUnit: unitId }),
  /** Start holding a model of the squad (drag or click-to-pick-up). */
  pickUp(leaderId: ModelId): void {
    const s = get()
    set({ leaderId, held: true, waypoints: s.leaderId === leaderId ? s.waypoints : [], cursor: null, preview: s.leaderId === leaderId ? s.preview : null })
  },
  setCursor: (c: Vec2 | null) => set({ cursor: c }),
  /** Commit a point: append, and let go of the model. */
  addWaypoint(p: Vec2, leaderId?: ModelId | null): void {
    const s = get()
    set({ waypoints: [...s.waypoints, p], held: false, cursor: null, leaderId: leaderId ?? s.leaderId })
  },
  release: () => set({ held: false, cursor: null }),
  undoWaypoint: () => set((s) => ({ waypoints: s.waypoints.slice(0, -1), held: false, cursor: null, preview: null })),
  clearPath: () => set({ waypoints: [], held: false, cursor: null, preview: null }),
  setPreview: (preview: PathPreview | null) => set({ preview }),
  setWeapon: (weaponId: string | null) => set({ weaponId, armed: null }),
  arm: (armed: Armed | null) => set({ armed }),
  togglePicked(id: UnitId): void { set((s) => ({ picked: s.picked.includes(id) ? s.picked.filter((x) => x !== id) : [...s.picked, id] })) },
  setPicked: (picked: UnitId[]) => set({ picked }),
  hoverOption: (hoverOption: string | null) => set({ hoverOption }),
}

/** What Esc undoes, innermost first. Returns true when something was cancelled. */
export function cancelDraft(): boolean {
  const s = get()
  if (s.held || s.waypoints.length || s.preview) { draft.clearPath(); return true }
  if (s.armed) { set({ armed: null }); return true }
  if (s.picked.length) { set({ picked: [] }); return true }
  if (s.menuUnit) { set({ menuUnit: null }); return true }
  return false
}
