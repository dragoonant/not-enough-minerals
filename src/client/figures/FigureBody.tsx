// One figure's body on its base: the shipped GLB when the manifest lists the unit profile and the file loads, else the
// procedural MGSD stand-in (never an empty base). Local frame: origin at the base centre on the surface, front +z.
// With `instanced` (the board) an unrigged GLB is drawn through a shared InstancedMesh (glbBatch.ts) and the owner calls
// the `onSync` function each frame after placing the figure; rigged (split) models and the gallery use a private clone.
import { useEffect, useMemo, useRef } from 'react'
import { Box3, type Group, type Object3D } from 'three'
import { batchLayer, isBatchable } from './glbBatch'
import { useGlbInstance, useGlbScene } from './glbLoader'
import { useManifest, modelUrl } from './manifest'
import { figureHeight, ProceduralFigure } from './Procedural'
import { buildGlbRig, type GlbRig } from './rig'

export interface FigureBodyProps {
  id: string; profileId: string; baseMm: number; color: string; accent: string
  /** receives the GLB rig (null for a procedural stand-in or while loading); inert for one-node models */
  onRig?: (rig: GlbRig | null) => void
  /** draw unrigged GLBs through shared instanced meshes; then `onSync` receives a per-frame matrix upload (or null) */
  instanced?: boolean
  onSync?: (sync: (() => void) | null) => void
}

/** Fit a GLB to the manifest height with its lowest point on y = 0 (the base). Returns the uniform scale and lift. */
function fit(inst: Object3D, height: number): { scale: number; lift: number } {
  const box = new Box3().setFromObject(inst)
  const h = box.max.y - box.min.y
  const scale = height > 0 && h > 1e-6 ? height / h : 1
  return { scale, lift: -box.min.y * scale }
}

/** Display height in inches (manifest height for a GLB figure, else the procedural stand-in's). */
export function useFigureHeight(profileId: string, baseMm: number): number {
  const manifest = useManifest()
  return manifest?.[profileId]?.height || figureHeight(baseMm)
}

/** One slot in the url's instanced meshes; its group sits where the GLB scene's origin would be. */
function BatchMember({ url, scene, onSync }: { url: string; scene: Object3D; onSync?: (sync: (() => void) | null) => void }) {
  const ref = useRef<Group>(null)
  useEffect(() => {
    const g = ref.current
    if (!g) return
    const h = batchLayer.batchFor(url, scene).acquire()
    onSync?.(() => { g.updateWorldMatrix(true, false); h.set(g.matrixWorld) })
    return () => { onSync?.(null); h.release() }
  }, [url, scene, onSync])
  return <group ref={ref} />
}

export function FigureBody({ id, profileId, baseMm, color, accent, onRig, instanced, onSync }: FigureBodyProps) {
  const manifest = useManifest()
  const entry = manifest?.[profileId]
  const url = entry ? modelUrl(entry.file) : undefined
  const scene = useGlbScene(instanced ? url : undefined)
  const batched = !!(instanced && scene && isBatchable(scene, profileId))
  const inst = useGlbInstance(url && !batched && (!instanced || scene) ? url : undefined)
  const src = batched ? scene : inst
  const placed = useMemo(() => (src && entry ? fit(src, entry.height) : null), [src, entry])
  const rig = useMemo(() => (inst ? buildGlbRig(inst, profileId) : null), [inst, profileId])
  useEffect(() => { onRig?.(rig); return () => onRig?.(null) }, [rig, onRig])
  if (src && entry && placed && url) {
    return (
      <group name={`model-${id}`} rotation={[0, entry.yaw, 0]}>
        <group position={[0, placed.lift, 0]} scale={placed.scale}>
          {batched ? <BatchMember url={url} scene={src} onSync={onSync} /> : <primitive object={src} />}
        </group>
      </group>
    )
  }
  return <ProceduralFigure id={id} x={0} z={0} baseMm={baseMm} color={color} accent={accent} />
}
