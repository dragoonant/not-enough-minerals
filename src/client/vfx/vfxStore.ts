// Effects level ("Effects: full / reduced / off"). settingsStore.ts has no generic flag and is not ours to edit, so the level lives
// here, persisted under its own localStorage key. A Settings control can call setEffectsLevel / useEffectsLevel.
import { create } from 'zustand'

export type EffectsLevel = 'full' | 'reduced' | 'off'
export const EFFECTS_LEVELS: readonly { id: EffectsLevel; label: string }[] = [
  { id: 'full', label: 'Full' }, { id: 'reduced', label: 'Reduced' }, { id: 'off', label: 'Off' },
]
const KEY = 'nem.vfx'

function read(): EffectsLevel {
  try {
    const v = typeof localStorage !== 'undefined' ? localStorage.getItem(KEY) : null
    if (v === 'full' || v === 'reduced' || v === 'off') return v
    // Honour reduced-motion by default.
    if (typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches) return 'reduced'
  } catch { /* storage blocked */ }
  return 'full'
}

interface VfxStore { level: EffectsLevel; setLevel(l: EffectsLevel): void }
export const useVfxStore = create<VfxStore>((set) => ({
  level: read(),
  setLevel(level) { set({ level }); try { localStorage.setItem(KEY, level) } catch { /* ignore */ } },
}))
export const setEffectsLevel = (l: EffectsLevel): void => useVfxStore.getState().setLevel(l)
export const useEffectsLevel = (): EffectsLevel => useVfxStore((s) => s.level)
export const getEffectsLevel = (): EffectsLevel => useVfxStore.getState().level
