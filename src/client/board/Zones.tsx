// Entry Edge strips on the mat edge and the faint 6-inch Zone of Influence bands behind them (spec 50 s2). All geometry
// comes from useBoardGeometry (engine edition helpers). Red also gets a diagonal hatch so the sides never rely on hue.
import { useMemo } from 'react'
import { CanvasTexture, RepeatWrapping, SRGBColorSpace } from 'three'
import { useBoardGeometry, useFocus, type Rect } from '../contract'
import { SIDE_HEX } from './sideColours'

function hatchTexture(hex: string): CanvasTexture | null {
  if (typeof document === 'undefined') return null
  const c = document.createElement('canvas')
  c.width = c.height = 64
  const g = c.getContext('2d')
  if (!g) return null
  g.fillStyle = hex + '55'
  g.fillRect(0, 0, 64, 64)
  g.strokeStyle = hex + 'cc'
  g.lineWidth = 6
  for (const o of [-64, 0, 64]) { g.beginPath(); g.moveTo(o, 64); g.lineTo(o + 64, 0); g.stroke() }
  const t = new CanvasTexture(c)
  t.wrapS = t.wrapT = RepeatWrapping
  t.colorSpace = SRGBColorSpace
  return t
}

function Band({ rect, colour }: { rect: Rect; colour: 'red' | 'blue' }) {
  const w = rect.max.x - rect.min.x, d = rect.max.z - rect.min.z
  const hatch = useMemo(() => {
    if (colour !== 'red') return null
    const t = hatchTexture(SIDE_HEX.red)
    t?.repeat.set(Math.max(1, w / 1.5), Math.max(1, d / 1.5))
    return t
  }, [colour, w, d])
  return (
    <mesh rotation={[-Math.PI / 2, 0, 0]} position={[(rect.min.x + rect.max.x) / 2, 0.015, (rect.min.z + rect.max.z) / 2]} name={`zoi-${colour}`}>
      <planeGeometry args={[w, d]} />
      {hatch
        ? <meshBasicMaterial map={hatch} transparent opacity={0.4} depthWrite={false} />
        : <meshBasicMaterial color={SIDE_HEX[colour]} transparent opacity={0.13} depthWrite={false} />}
    </mesh>
  )
}

export function Zones() {
  const geo = useBoardGeometry()
  const showZones = useFocus((f) => f.overlays.zones)
  if (!geo) return null
  return (
    <group name="zones">
      {geo.edges.map((e) => (
        <group key={e.seat}>
          {showZones && e.zones.map((z, i) => <Band key={i} rect={z} colour={e.colour} />)}
          {e.segments.map(([a, b], i) => {
            const len = Math.hypot(b.x - a.x, b.z - a.z)
            const ang = Math.atan2(b.z - a.z, b.x - a.x)
            const mx = (a.x + b.x) / 2, mz = (a.z + b.z) / 2
            return (
              <group key={i}>
                <mesh position={[mx, 0.035, mz]} rotation={[0, -ang, 0]} name={`entry-edge-${e.colour}`}>
                  <boxGeometry args={[len, 0.05, 0.4]} />
                  <meshBasicMaterial color={SIDE_HEX[e.colour]} />
                </mesh>
              </group>
            )
          })}
        </group>
      ))}
    </group>
  )
}
