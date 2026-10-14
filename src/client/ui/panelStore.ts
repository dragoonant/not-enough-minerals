// Which info boxes the player has minimised, and the global "Hide UI" switch (owner request M5: every box on the game
// screen can be minimised and brought back, so the whole table can be seen). Per-panel state persists in localStorage;
// Hide UI is a layer over it, so turning it off restores the exact previous layout. View state only, never game state.
import { create } from 'zustand'
import { useEffect } from 'react'
import { focus, useFocus, type RailId } from '../contract'

export type PanelId =
  | 'objectives' | 'supply' | 'reserves' | 'odds' | 'unit' | 'weapons' | 'feed'
  | 'prompt' | 'tools' | 'cams' | 'ticker' | 'dice'

export interface PanelState {
  /** Minimised panels (true = shown as a small tab). */
  min: Partial<Record<PanelId, boolean>>
  /** Global Hide UI: everything collapses to the minimal strip; the per-panel state above is kept untouched. */
  hideAll: boolean
}

const KEY = 'nem.panels'
interface Saved { min?: PanelState['min']; rails?: Partial<Record<RailId, boolean>> }
function read(): Saved {
  try { const s = localStorage.getItem(KEY); return s ? (JSON.parse(s) as Saved) : {} } catch { return {} }
}
function write(s: Saved): void {
  try { localStorage.setItem(KEY, JSON.stringify(s)) } catch { /* private mode or no storage: the layout just is not kept */ }
}

const saved = read()
export const usePanelStore = create<PanelState>(() => ({ min: saved.min ?? {}, hideAll: false }))

let rails: Partial<Record<RailId, boolean>> = { ...saved.rails }
let railsLoaded = false
/** Mount once in the HUD: applies the saved rail state (the rails live in the frozen focus store) and keeps saving it. */
export function usePanelLayout(): void {
  const now = useFocus((f) => f.rails)
  useEffect(() => {
    if (!railsLoaded) {
      railsLoaded = true
      for (const r of ['left', 'right'] as const) if (typeof saved.rails?.[r] === 'boolean' && saved.rails[r] !== now[r]) focus.setRail(r, saved.rails[r]!)
      return
    }
    rails = { ...now }
    persist()
  }, [now])
}

function persist(): void {
  const p = usePanelStore.getState()
  write({ min: p.min, rails })
}

export const panels = {
  setMin: (id: PanelId, min: boolean): void => { usePanelStore.setState((s) => ({ min: { ...s.min, [id]: min } })); persist() },
  toggle: (id: PanelId): void => panels.setMin(id, !usePanelStore.getState().min[id]),
  setHideAll: (on: boolean): void => { usePanelStore.setState({ hideAll: on }); persist() },
  toggleHideAll: (): void => panels.setHideAll(!usePanelStore.getState().hideAll),
}

/** True when the panel shows as its small tab (minimised by the player, or everything hidden). */
export const usePanelMin = (id: PanelId): boolean => usePanelStore((s) => s.hideAll || !!s.min[id])
export const useHideAll = (): boolean => usePanelStore((s) => s.hideAll)
