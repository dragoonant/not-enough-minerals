// public/models/manifest.json: { <unitProfileId>: { file, height, yaw } }. height = figure height in inches (the GLB is
// fitted to it, base at y = 0), yaw = radians about +y that turn the raw GLB so its front looks along +z. A unit with no
// entry (or whose GLB fails to load) keeps the procedural MGSD figure.
import { useEffect, useState } from 'react'

export interface ManifestEntry { file: string; height: number; yaw: number }
export type Manifest = Record<string, ManifestEntry>

const base = (): string => (typeof import.meta !== 'undefined' && import.meta.env?.BASE_URL) || '/'
export const modelUrl = (file: string): string => `${base()}models/${file}`

let pending: Promise<Manifest> | null = null
let loaded: Manifest | null = null

export function loadManifest(): Promise<Manifest> {
  if (!pending) {
    pending = fetch(`${base()}models/manifest.json`)
      .then((r) => (r.ok ? r.json() : {}))
      .then((j: unknown) => {
        const out: Manifest = {}
        if (j && typeof j === 'object') {
          for (const [id, e] of Object.entries(j as Record<string, Partial<ManifestEntry>>)) {
            if (e && typeof e.file === 'string') out[id] = { file: e.file, height: typeof e.height === 'number' ? e.height : 0, yaw: typeof e.yaw === 'number' ? e.yaw : 0 }
          }
        }
        loaded = out
        return out
      })
      .catch(() => { loaded = {}; return {} as Manifest })
  }
  return pending
}

/** The manifest once fetched (null while loading; {} when missing). */
export function useManifest(): Manifest | null {
  const [m, setM] = useState<Manifest | null>(loaded)
  useEffect(() => {
    let live = true
    void loadManifest().then((x) => { if (live) setM(x) })
    return () => { live = false }
  }, [])
  return m
}
