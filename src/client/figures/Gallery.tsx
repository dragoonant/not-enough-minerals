// ?gallery (with ?test=1): every unit profile in the data bundle stood on a 6 inch grid, front toward +z (the Near seat
// camera), GLB where the manifest has one and the procedural MGSD figure otherwise. For checking yaw, scale and bases.
import { useState } from 'react'
import { useFrame, useThree } from '@react-three/fiber'
import { Anchored } from '../board/Anchored'
import { dataName, useBundle } from '../contract'
import { FigureBody } from './FigureBody'
import { useManifest } from './manifest'
import { pulse, type GlbRig } from './rig'
import { tintFor } from './view'

const COLS = 6, CELL = 6

const cellPos = (i: number, n: number): [number, number] => {
  const rows = Math.ceil(n / COLS)
  return [((i % COLS) - (COLS - 1) / 2) * CELL, (Math.floor(i / COLS) - (rows - 1) / 2) * CELL]
}

/** DOM captions for the gallery (mounted in the label layer). */
export function GalleryLabels() {
  const bundle = useBundle()
  const manifest = useManifest()
  if (!bundle) return null
  const units = bundle.records.units
  return (
    <>
      {units.map((u, i) => {
        const [x, z] = cellPos(i, units.length)
        const shipped = !!manifest?.[u.id]
        return (
          <Anchored key={u.id} at={[x, 0.02, z + 2.1]} align="center" testid={`gallery-${u.id}`}>
            <div style={{ font: '600 10px/1.1 "Segoe UI", system-ui, sans-serif', color: shipped ? '#bfe9c8' : '#dfe6ee', background: 'rgba(15,20,27,0.75)', padding: '2px 5px', borderRadius: 3, width: 'max-content', maxWidth: 104, whiteSpace: 'normal', overflowWrap: 'anywhere', textAlign: 'center', display: '-webkit-box', WebkitLineClamp: 3, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>
              {dataName(u.id) || u.id}{shipped ? ' (GLB)' : ''}
            </div>
          </Anchored>
        )
      })}
    </>
  )
}

/** One gallery cell: the figure, plus a slow demo of its rig (turret sweep or lunge loop) so the split nodes can be eyeballed. */
function GalleryCell({ id, mm, color, accent }: { id: string; mm: number; color: string; accent: string }) {
  const [rig, setRig] = useState<GlbRig | null>(null)
  const invalidate = useThree((s) => s.invalidate)
  const live = !!rig && (rig.caps.turret || rig.caps.lunge)
  useFrame(() => {
    if (!rig || !live) return
    const t = performance.now() / 1000
    if (rig.caps.turret) rig.apply({ turret: Math.sin(t * 0.8) * 1.4 })
    else { const env = pulse((t % 2.4) * 1000, 800); rig.apply({ lunge: env, sway: Math.sin(t * 6) * env }) }
    invalidate()
  })
  return <group userData={{ rig: rig ? { turret: rig.caps.turret, lunge: rig.caps.lunge, parts: rig.caps.parts } : null }}><FigureBody id={id} profileId={id} baseMm={mm} color={color} accent={accent} onRig={setRig} /></group>
}

export function Gallery() {
  const bundle = useBundle()
  const manifest = useManifest()
  if (!bundle) return null
  const units = bundle.records.units
  return (
    <group name="gallery">
      {units.map((u, i) => {
        const [x, z] = cellPos(i, units.length)
        const race = u.race === 'terran' ? 0 : u.race === 'zerg' ? 1 : 2
        const [color, accent] = tintFor(race)
        const mm = typeof u.baseMm === 'number' ? u.baseMm : Array.isArray(u.baseMm) ? Math.max(...u.baseMm) : 32
        return (
          <group key={u.id} position={[x, 0, z]} data-unit={u.id}>
            <GalleryCell id={u.id} mm={mm} color={color} accent={accent} />
          </group>
        )
      })}
    </group>
  )
}
