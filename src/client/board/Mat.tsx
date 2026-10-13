// Placeholder table mat: an ash-grey ground with a faint 6-inch grid (1 world unit = 1 inch) on a dark plinth.
// M8 replaces it with a textured terrain board.
import { useMemo } from 'react'
import { PALETTE } from '../theme'

function GridLines({ w, d, step = 6 }: { w: number; d: number; step?: number }) {
  const positions = useMemo(() => {
    const out: number[] = []
    for (let x = -w / 2 + step; x < w / 2 - 1e-6; x += step) out.push(x, 0.01, -d / 2, x, 0.01, d / 2)
    for (let z = -d / 2 + step; z < d / 2 - 1e-6; z += step) out.push(-w / 2, 0.01, z, w / 2, 0.01, z)
    return new Float32Array(out)
  }, [w, d, step])
  return (
    <lineSegments name="mat-grid">
      <bufferGeometry>
        <bufferAttribute attach="attributes-position" args={[positions, 3]} />
      </bufferGeometry>
      <lineBasicMaterial color={PALETTE.steelDark} transparent opacity={0.35} />
    </lineSegments>
  )
}

export function Mat({ w, d }: { w: number; d: number }) {
  return (
    <group>
      <mesh rotation={[-Math.PI / 2, 0, 0]} receiveShadow name="mat">
        <planeGeometry args={[w, d]} />
        <meshStandardMaterial color={PALETTE.ashDark} roughness={0.95} />
      </mesh>
      <GridLines w={w} d={d} />
      <mesh position={[0, -0.27, 0]} receiveShadow>
        <boxGeometry args={[w + 1.2, 0.5, d + 1.2]} />
        <meshStandardMaterial color={PALETTE.slateLight} roughness={0.8} metalness={0.2} />
      </mesh>
    </group>
  )
}
