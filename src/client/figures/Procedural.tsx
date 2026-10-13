// Procedural placeholder figure in the project's MGSD look (owner 2026-10-13): about 2.25 heads tall, a huge helmeted
// head, small torso, stubby legs on chunky feet, oversized hands and an oversized weapon block. Replaced by generated
// GLB figures (glbLoader.ts) in M5. Cosmetic only: measurement always uses the base, never the mesh.
import { PALETTE } from '../theme'

const MM = 25.4
export interface FigureProps {
  id: string; x: number; z: number; baseMm: number; color: string; accent: string; heightIn?: number
  /** omit the built-in weapon block (weapons as separate models later) */
  bare?: boolean
}

/** Figure height in inches by base size (cosmetic): grows with the base. */
export const figureHeight = (baseMm: number): number => 1.2 + (baseMm - 25) * 0.04

export function ProceduralFigure({ id, x, z, baseMm, color, accent, heightIn, bare }: FigureProps) {
  const r = baseMm / MM / 2
  const h = heightIn ?? figureHeight(baseMm)
  const head = h / 2.25 // ~2.25 heads tall
  const legH = h * 0.2, torsoH = h * 0.36
  const y0 = 0.12
  return (
    <group position={[x, 0, z]} name={`model-${id}`} userData={{ id, x, z }}>
      <mesh position={[0, 0.06, 0]} castShadow receiveShadow>
        <cylinderGeometry args={[r, r * 1.04, 0.12, 32]} />
        <meshStandardMaterial color={PALETTE.slateLight} roughness={0.7} metalness={0.2} />
      </mesh>
      {[-1, 1].map((s) => (
        <group key={s}>
          <mesh position={[s * r * 0.3, y0 + 0.08, r * 0.08]} castShadow>
            <boxGeometry args={[r * 0.42, 0.16, r * 0.62]} />
            <meshStandardMaterial color={PALETTE.steelDark} roughness={0.6} metalness={0.4} />
          </mesh>
          <mesh position={[s * r * 0.3, y0 + legH / 2 + 0.1, 0]} castShadow>
            <boxGeometry args={[r * 0.34, legH, r * 0.34]} />
            <meshStandardMaterial color={color} roughness={0.7} />
          </mesh>
        </group>
      ))}
      <mesh position={[0, y0 + legH + torsoH / 2 + 0.06, 0]} castShadow>
        <boxGeometry args={[r * 0.9, torsoH, r * 0.6]} />
        <meshStandardMaterial color={color} roughness={0.6} metalness={0.3} />
      </mesh>
      {[-1, 1].map((s) => (
        <mesh key={`hand${s}`} position={[s * r * 0.62, y0 + legH + torsoH * 0.35, r * 0.18]} castShadow>
          <boxGeometry args={[r * 0.3, r * 0.3, r * 0.3]} />
          <meshStandardMaterial color={PALETTE.steelDark} roughness={0.6} metalness={0.4} />
        </mesh>
      ))}
      <mesh position={[0, y0 + legH + torsoH + head * 0.45, 0]} castShadow>
        <sphereGeometry args={[head * 0.55, 20, 16]} />
        <meshStandardMaterial color={color} roughness={0.45} metalness={0.35} />
      </mesh>
      <mesh position={[0, y0 + legH + torsoH + head * 0.45, head * 0.38]} castShadow>
        <boxGeometry args={[head * 0.7, head * 0.28, head * 0.2]} />
        <meshStandardMaterial color={accent} roughness={0.2} metalness={0.6} emissive={accent} emissiveIntensity={0.25} />
      </mesh>
      {!bare && (
        <mesh position={[r * 0.62, y0 + legH + torsoH * 0.45, r * 0.55]} castShadow>
          <boxGeometry args={[r * 0.26, r * 0.32, h * 0.6]} />
          <meshStandardMaterial color={PALETTE.steel} roughness={0.5} metalness={0.5} />
        </mesh>
      )}
    </group>
  )
}
