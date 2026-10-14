// Runtime side of the terrain GLBs: loads public/assets/terrain/manifest.json once and builds a model instance fitted to an
// engine piece. The fit uses the MEASURED bounding box of the loaded mesh (not the manifest numbers), so the drawn piece
// fills exactly the engine footprint (x, z) and height (y) whatever the source scale was. Local frame: the piece frame
// (footprint centred at the origin, y up, bottom on the table); the caller adds pos and rot.
import { useEffect, useMemo, useState } from 'react'
import { Box3, Group, Mesh, type Material, type Object3D } from 'three'
import { useGlbInstance } from '../figures/glbLoader'
import { footprintBox, parseTerrainManifest, type TerrainModel, type TerrainPick } from './terrainFit'
import type { TerrainInstance } from '../../engine/types'
import type { BoardThemeId } from './boardTheme'
import { applyThemePass } from './terrainTheme'

export const terrainDir = (): string => `${import.meta.env.BASE_URL}assets/terrain/`

let models: TerrainModel[] | null = null
let loading: Promise<void> | undefined
function loadManifest(): Promise<void> {
  if (loading) return loading
  loading = (async () => {
    try {
      // ?terrain=procedural keeps the plain footprint prisms (QA and A/B frame-time checks).
      if (typeof location !== 'undefined' && new URLSearchParams(location.search).get('terrain') === 'procedural') { models = []; return }
      const res = await fetch(`${terrainDir()}manifest.json`)
      models = res.ok ? parseTerrainManifest(await res.json()) : []
    } catch { models = [] }
  })()
  return loading
}

/** The terrain models (null until the manifest has loaded or failed; failure gives [] and every piece stays procedural). */
export function useTerrainModels(): TerrainModel[] | null {
  const [, tick] = useState(0)
  useEffect(() => { if (!models) void loadManifest().then(() => tick((n) => n + 1)) }, [])
  return models
}

/** The picked model fitted to the piece footprint and height, or null while loading / if the GLB failed. */
export function useFittedTerrain(pick: TerrainPick | null, t: TerrainInstance, theme?: BoardThemeId): Group | null {
  const inst = useGlbInstance(pick ? terrainDir() + pick.model.file : undefined)
  const box = footprintBox(t.footprint)
  const { w = 0, d = 0 } = box ?? {}
  return useMemo(() => {
    const g = inst && pick && box ? fitTerrainModel(inst, pick, w, d, t.height) : null
    if (g && pick && theme) applyThemePass(g, theme, pick.model.theme)
    return g
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [inst, pick, w, d, t.height, theme])
}

/** Wraps `inst` (private materials) so it fills w x height x d in the piece frame, bottom on y=0, after the pick's turns. */
export function fitTerrainModel(inst: Object3D, pick: TerrainPick, w: number, d: number, height: number): Group | null {
  inst.position.set(0, 0, 0); inst.rotation.set(0, 0, 0); inst.scale.set(1, 1, 1)
  inst.updateMatrixWorld(true)
  const b = new Box3().setFromObject(inst)
  if (b.isEmpty()) return null
  inst.traverse((o) => {
    const m = o as Mesh
    if (!m.isMesh) return
    m.material = Array.isArray(m.material) ? m.material.map((x: Material) => x.clone()) : (m.material as Material).clone()
  })
  const centre = new Group()
  centre.add(inst)
  inst.position.set(-(b.min.x + b.max.x) / 2, -b.min.y, -(b.min.z + b.max.z) / 2)
  const turn = new Group()
  turn.add(centre)
  turn.rotation.y = pick.quarter ? Math.PI / 2 : 0
  const sx = pick.quarter ? b.max.z - b.min.z : b.max.x - b.min.x
  const sz = pick.quarter ? b.max.x - b.min.x : b.max.z - b.min.z
  const fit = new Group()
  fit.add(turn)
  fit.scale.set(w / sx, height / (b.max.y - b.min.y), d / sz)
  const yaw = new Group()
  yaw.add(fit)
  yaw.rotation.y = pick.yaw
  yaw.name = `terrain-glb-${pick.model.slug}`
  return yaw
}
