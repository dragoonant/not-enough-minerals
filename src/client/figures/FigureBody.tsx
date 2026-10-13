// One figure's body on its base: the shipped GLB when the manifest lists the unit profile and the file loads, else the
// procedural MGSD stand-in (never an empty base). Local frame: origin at the base centre on the surface, front +z.
import { useMemo } from 'react'
import { Box3, type Object3D } from 'three'
import { useGlbInstance } from './glbLoader'
import { useManifest, modelUrl } from './manifest'
import { figureHeight, ProceduralFigure } from './Procedural'

export interface FigureBodyProps { id: string; profileId: string; baseMm: number; color: string; accent: string }

/** Fit a GLB clone to the manifest height with its lowest point on y = 0 (the base). Returns the uniform scale and lift. */
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

export function FigureBody({ id, profileId, baseMm, color, accent }: FigureBodyProps) {
  const manifest = useManifest()
  const entry = manifest?.[profileId]
  const inst = useGlbInstance(entry ? modelUrl(entry.file) : undefined)
  const placed = useMemo(() => (inst && entry ? fit(inst, entry.height) : null), [inst, entry])
  if (inst && entry && placed) {
    return (
      <group name={`model-${id}`} rotation={[0, entry.yaw, 0]}>
        <group position={[0, placed.lift, 0]} scale={placed.scale}><primitive object={inst} /></group>
      </group>
    )
  }
  return <ProceduralFigure id={id} x={0} z={0} baseMm={baseMm} color={color} accent={accent} />
}
