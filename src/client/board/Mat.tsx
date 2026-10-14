// The table mat: tiled CC0 PBR ground (themed per game, see boardTheme.ts / groundMaterial.ts) inside a dark bevelled
// gaming-mat frame on a wooden tabletop that runs off into the fog, 1 world unit = 1 inch. No painted grid: the Entry
// Edge strips and Zone bands (Zones.tsx) are the only markings on the surface.
import { useEffect, useMemo, useState } from 'react'
import { Color, ExtrudeGeometry, Path, RepeatWrapping, Shape, ShapeGeometry, SRGBColorSpace, TextureLoader, type Texture } from 'three'
import { useThree } from '@react-three/fiber'
import { createGroundMaterial, groundUrl } from './groundMaterial'
import { useBoardTheme } from './SkyRig'

const FRAME = 1.4 // frame width in inches
const BEVEL = 0.16

function ringShape(ow: number, od: number, iw: number, id: number): Shape {
  const s = new Shape()
  s.moveTo(-ow / 2, -od / 2); s.lineTo(ow / 2, -od / 2); s.lineTo(ow / 2, od / 2); s.lineTo(-ow / 2, od / 2); s.closePath()
  const h = new Path()
  h.moveTo(-iw / 2, -id / 2); h.lineTo(-iw / 2, id / 2); h.lineTo(iw / 2, id / 2); h.lineTo(iw / 2, -id / 2); h.closePath()
  s.holes.push(h)
  return s
}

const TABLE_SPAN = 14 // tabletop edge = this many times the longest mat side
const TABLE_TILE = 30 // inches per wood tile

/** Wood tabletop textures (CC0 Poly Haven wood_table_001); null until they load, flat tint meanwhile. */
function useTableTextures(span: number, onLoad: () => void): { map: Texture | null; rough: Texture | null } {
  const [tex, setTex] = useState<{ map: Texture | null; rough: Texture | null }>({ map: null, rough: null })
  useEffect(() => {
    let alive = true
    const owned: Texture[] = []
    const loader = new TextureLoader()
    const load = (kind: 'albedo' | 'rough', key: 'map' | 'rough', srgb: boolean) => loader.load(groundUrl('table', kind), (t) => {
      if (!alive) { t.dispose(); return }
      t.wrapS = t.wrapT = RepeatWrapping; t.repeat.set(span / TABLE_TILE, span / TABLE_TILE); t.anisotropy = 8
      if (srgb) t.colorSpace = SRGBColorSpace
      owned.push(t); setTex((p) => ({ ...p, [key]: t })); onLoad()
    }, undefined, () => { /* flat tint */ })
    load('albedo', 'map', true); load('rough', 'rough', false)
    return () => { alive = false; owned.forEach((t) => t.dispose()) }
  }, [span, onLoad])
  return tex
}

export function Mat({ w, d }: { w: number; d: number }) {
  const theme = useBoardTheme()
  const invalidate = useThree((s) => s.invalidate)
  const ground = useMemo(() => createGroundMaterial(theme, w, d, () => invalidate()), [theme, w, d, invalidate])
  useEffect(() => () => ground.dispose(), [ground])
  const span = TABLE_SPAN * Math.max(w, d)
  const onTex = useMemo(() => () => invalidate(), [invalidate])
  const tableColour = useMemo(() => new Color(theme.table.tint).multiplyScalar(theme.table.gain), [theme])
  const table = useTableTextures(span, onTex)
  const frameGeo = useMemo(() => {
    const g = new ExtrudeGeometry(ringShape(w + 2 * FRAME, d + 2 * FRAME, w + 2 * BEVEL, d + 2 * BEVEL), {
      depth: 0.3, bevelEnabled: true, bevelSize: BEVEL, bevelThickness: 0.12, bevelSegments: 3, steps: 1,
    })
    g.rotateX(-Math.PI / 2)
    return g
  }, [w, d])
  const rimGeo = useMemo(() => new ShapeGeometry(ringShape(w + 2 * BEVEL + 0.22, d + 2 * BEVEL + 0.22, w + 2 * BEVEL, d + 2 * BEVEL)).rotateX(-Math.PI / 2), [w, d])
  useEffect(() => () => { frameGeo.dispose(); rimGeo.dispose() }, [frameGeo, rimGeo])
  return (
    <group>
      <mesh rotation={[-Math.PI / 2, 0, 0]} receiveShadow name="mat" material={ground.material}>
        <planeGeometry args={[w, d]} />
      </mesh>
      <mesh geometry={frameGeo} position={[0, -0.18, 0]} receiveShadow castShadow name="mat-frame">
        <meshStandardMaterial color={theme.frame.colour} roughness={0.55} metalness={0.35} />
      </mesh>
      <mesh geometry={rimGeo} position={[0, 0.262, 0]} name="mat-rim">
        <meshBasicMaterial color={theme.frame.rim} />
      </mesh>
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -0.525, 0]} receiveShadow name="tabletop">
        <planeGeometry args={[span, span]} />
        <meshStandardMaterial color={tableColour} map={table.map} roughnessMap={table.rough} roughness={0.8} metalness={0} />
      </mesh>
      <mesh position={[0, -0.27, 0]} receiveShadow>
        <boxGeometry args={[w + 2 * FRAME + 0.6, 0.5, d + 2 * FRAME + 0.6]} />
        <meshStandardMaterial color="#10141a" roughness={0.9} metalness={0.1} />
      </mesh>
    </group>
  )
}
