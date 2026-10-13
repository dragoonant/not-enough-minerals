// Procedural placeholder terrain: one box (or cylinder) per piece, tinted by its geometric class. The engine only reads
// the footprint and rules type; the mesh is cosmetic. M8 replaces these with generated terrain models.
import { usePresented } from '../contract'
import type { TerrainInstance } from '../../engine/types'
import { PALETTE } from '../theme'

const TINT: Partial<Record<TerrainInstance['rulesType'], string>> = {
  obstacle: PALETTE.steel, obstruction: PALETTE.ash, building: PALETTE.slateLight, rubble: PALETTE.steelDark,
}

function Piece({ t }: { t: TerrainInstance }) {
  const color = TINT[t.rulesType] ?? PALETTE.steel
  const f = t.footprint
  if ('circle' in f) {
    return (
      <mesh position={[t.pos.x, t.height / 2, t.pos.z]} castShadow receiveShadow name={`terrain-${t.id}`}>
        <cylinderGeometry args={[f.circle.r * 0.8, f.circle.r, t.height, 9]} />
        <meshStandardMaterial color={color} roughness={0.95} flatShading />
      </mesh>
    )
  }
  if ('rect' in f) {
    return (
      <mesh position={[t.pos.x, t.height / 2, t.pos.z]} rotation={[0, t.rot, 0]} castShadow receiveShadow name={`terrain-${t.id}`}>
        <boxGeometry args={[f.rect.w, t.height, f.rect.d]} />
        <meshStandardMaterial color={color} roughness={0.85} metalness={t.rulesType === 'obstacle' ? 0.35 : 0.05} />
      </mesh>
    )
  }
  return null
}

export function TerrainPieces() {
  const terrain = usePresented()?.terrain ?? []
  return <>{terrain.map((t) => <Piece key={t.id} t={t} />)}</>
}
