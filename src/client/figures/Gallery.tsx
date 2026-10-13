// ?gallery (with ?test=1): every unit profile in the data bundle stood on a 6 inch grid, front toward +z (the Near seat
// camera), GLB where the manifest has one and the procedural MGSD figure otherwise. For checking yaw, scale and bases.
import { Anchored } from '../board/Anchored'
import { dataName, useBundle } from '../contract'
import { FigureBody } from './FigureBody'
import { useManifest } from './manifest'
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
            <div style={{ font: '600 10px/1.1 "Segoe UI", system-ui, sans-serif', color: shipped ? '#bfe9c8' : '#dfe6ee', background: 'rgba(15,20,27,0.75)', padding: '2px 5px', borderRadius: 3 }}>
              {dataName(u.id) || u.id}{shipped ? ' (GLB)' : ''}
            </div>
          </Anchored>
        )
      })}
    </>
  )
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
            <FigureBody id={u.id} profileId={u.id} baseMm={mm} color={color} accent={accent} />
          </group>
        )
      })}
    </group>
  )
}
