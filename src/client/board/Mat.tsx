// The table mat: a procedural canvas texture (no binary assets) sized from the deployment table, 1 world unit = 1 inch.
// Ash-grey ground with mottling, panel seams, a faint 6-inch grid and tick numbers along the near edge, on a dark plinth.
import { useEffect, useMemo } from 'react'
import { CanvasTexture, SRGBColorSpace, RepeatWrapping } from 'three'
import { PALETTE } from '../theme'
import { hash01 } from './layout'

const PX = 24 // texture pixels per inch

function paintMat(w: number, d: number): HTMLCanvasElement | null {
  if (typeof document === 'undefined') return null
  const c = document.createElement('canvas')
  c.width = Math.round(w * PX); c.height = Math.round(d * PX)
  const g = c.getContext('2d')
  if (!g) return null
  g.fillStyle = PALETTE.ashDark
  g.fillRect(0, 0, c.width, c.height)
  // soft mottling: big translucent blobs placed by a deterministic hash
  for (let i = 0; i < 260; i++) {
    const x = hash01(i, 1) * c.width, y = hash01(i, 2) * c.height, r = (2 + hash01(i, 3) * 6) * PX
    const lum = hash01(i, 4) > 0.5
    const grad = g.createRadialGradient(x, y, 0, x, y, r)
    grad.addColorStop(0, lum ? 'rgba(160,150,132,0.16)' : 'rgba(30,28,24,0.18)')
    grad.addColorStop(1, 'rgba(0,0,0,0)')
    g.fillStyle = grad
    g.fillRect(x - r, y - r, r * 2, r * 2)
  }
  // fine speckle
  for (let i = 0; i < 9000; i++) {
    g.fillStyle = hash01(i, 7) > 0.5 ? 'rgba(255,255,255,0.05)' : 'rgba(0,0,0,0.07)'
    g.fillRect(hash01(i, 5) * c.width, hash01(i, 6) * c.height, 2, 2)
  }
  // grid every 6 inches, heavier at 12
  for (let x = 6; x < w; x += 6) {
    g.strokeStyle = x % 12 === 0 ? 'rgba(15,20,27,0.38)' : 'rgba(15,20,27,0.22)'
    g.lineWidth = x % 12 === 0 ? 2 : 1
    g.beginPath(); g.moveTo(x * PX, 0); g.lineTo(x * PX, c.height); g.stroke()
  }
  for (let y = 6; y < d; y += 6) {
    g.strokeStyle = y % 12 === 0 ? 'rgba(15,20,27,0.38)' : 'rgba(15,20,27,0.22)'
    g.lineWidth = y % 12 === 0 ? 2 : 1
    g.beginPath(); g.moveTo(0, y * PX); g.lineTo(c.width, y * PX); g.stroke()
  }
  // inch ticks on the near and far edges so distances can be read at a glance
  g.fillStyle = 'rgba(15,20,27,0.45)'
  for (let x = 1; x < w; x++) {
    const len = x % 6 === 0 ? 10 : x % 3 === 0 ? 6 : 3
    g.fillRect(x * PX - 0.5, 0, 1, len); g.fillRect(x * PX - 0.5, c.height - len, 1, len)
  }
  for (let y = 1; y < d; y++) {
    const len = y % 6 === 0 ? 10 : y % 3 === 0 ? 6 : 3
    g.fillRect(0, y * PX - 0.5, len, 1); g.fillRect(c.width - len, y * PX - 0.5, len, 1)
  }
  // edge vignette
  const edge = g.createLinearGradient(0, 0, 0, c.height)
  edge.addColorStop(0, 'rgba(0,0,0,0.22)'); edge.addColorStop(0.08, 'rgba(0,0,0,0)'); edge.addColorStop(0.92, 'rgba(0,0,0,0)'); edge.addColorStop(1, 'rgba(0,0,0,0.22)')
  g.fillStyle = edge; g.fillRect(0, 0, c.width, c.height)
  return c
}

export function Mat({ w, d }: { w: number; d: number }) {
  const tex = useMemo(() => {
    const canvas = paintMat(w, d)
    if (!canvas) return null
    const t = new CanvasTexture(canvas)
    t.colorSpace = SRGBColorSpace
    t.wrapS = t.wrapT = RepeatWrapping
    t.anisotropy = 4
    return t
  }, [w, d])
  useEffect(() => () => { tex?.dispose() }, [tex])
  return (
    <group>
      <mesh rotation={[-Math.PI / 2, 0, 0]} receiveShadow name="mat">
        <planeGeometry args={[w, d]} />
        <meshStandardMaterial color={tex ? '#ffffff' : PALETTE.ashDark} map={tex} roughness={0.95} />
      </mesh>
      <mesh position={[0, -0.27, 0]} receiveShadow>
        <boxGeometry args={[w + 1.2, 0.5, d + 1.2]} />
        <meshStandardMaterial color={PALETTE.slateLight} roughness={0.8} metalness={0.2} />
      </mesh>
    </group>
  )
}
