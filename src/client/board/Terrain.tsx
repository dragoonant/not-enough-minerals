// Terrain at exactly the rules footprints and heights (spec 50 s2): every piece is drawn from the engine's
// TerrainInstance (footprint shape, pos, rot about +y, height); looks are cosmetic per rules type. Walls, buildings,
// obstructions and hills fill the footprint to full height; forests, water, rough ground, rubble, trenches and hazards
// are low ground patches (forests add small trees inside the footprint).
import { useMemo } from 'react'
import { DoubleSide, ExtrudeGeometry, Shape, Vector2 } from 'three'
import { usePresented } from '../contract'
import type { TerrainInstance, TerrainRulesType, Vec2 } from '../../engine/types'
import { PALETTE } from '../theme'
import { hash01 } from './layout'

interface Look { color: string; metal: number; rough: number; flat?: number; emissive?: string; opacity?: number }
const LOOK: Record<TerrainRulesType, Look> = {
  obstacle: { color: PALETTE.steel, metal: 0.35, rough: 0.8 },
  obstruction: { color: '#7a746a', metal: 0.05, rough: 0.95 },
  building: { color: '#566371', metal: 0.25, rough: 0.7 },
  hill: { color: '#7d7566', metal: 0, rough: 1 },
  forest: { color: '#3c5a3a', metal: 0, rough: 1, flat: 0.04 },
  shallowWater: { color: '#3a6f86', metal: 0.3, rough: 0.25, flat: 0.05, opacity: 0.75 },
  deepWater: { color: '#1d4258', metal: 0.3, rough: 0.2, flat: 0.06, opacity: 0.88 },
  rough: { color: '#6a5f4c', metal: 0, rough: 1, flat: 0.06 },
  rubble: { color: '#5b5750', metal: 0, rough: 1 },
  trench: { color: '#2c2a26', metal: 0, rough: 1, flat: 0.03 },
  hazard: { color: '#7a3b2a', metal: 0, rough: 0.6, flat: 0.05, emissive: '#d2542c' },
  scenarioTerrain: { color: PALETTE.steelDark, metal: 0.2, rough: 0.8 },
}

function outline(f: TerrainInstance['footprint']): Vec2[] | null {
  if ('rect' in f) { const hw = f.rect.w / 2, hd = f.rect.d / 2; return [{ x: -hw, z: -hd }, { x: hw, z: -hd }, { x: hw, z: hd }, { x: -hw, z: hd }] }
  if ('polygon' in f) return f.polygon
  return null
}

function inside(f: TerrainInstance['footprint'], p: Vec2): boolean {
  if ('circle' in f) return Math.hypot(p.x, p.z) <= f.circle.r
  if ('rect' in f) return Math.abs(p.x) <= f.rect.w / 2 && Math.abs(p.z) <= f.rect.d / 2
  const pts = f.polygon
  let c = false
  for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) {
    const a = pts[i]!, b = pts[j]!
    if ((a.z > p.z) !== (b.z > p.z) && p.x < ((b.x - a.x) * (p.z - a.z)) / (b.z - a.z) + a.x) c = !c
  }
  return c
}

function bounds(f: TerrainInstance['footprint']): { x0: number; x1: number; z0: number; z1: number } {
  if ('circle' in f) return { x0: -f.circle.r, x1: f.circle.r, z0: -f.circle.r, z1: f.circle.r }
  if ('rect' in f) return { x0: -f.rect.w / 2, x1: f.rect.w / 2, z0: -f.rect.d / 2, z1: f.rect.d / 2 }
  const xs = f.polygon.map((p) => p.x), zs = f.polygon.map((p) => p.z)
  return { x0: Math.min(...xs), x1: Math.max(...xs), z0: Math.min(...zs), z1: Math.max(...zs) }
}

/** Footprint prism of height h standing on y=0, in the piece's local frame (x, z). */
function Prism({ f, h, look }: { f: TerrainInstance['footprint']; h: number; look: Look }) {
  const geo = useMemo(() => {
    if ('circle' in f) return null
    const pts = outline(f)!
    // Shape lies in XY; the group below is rotated -90 deg about X, which maps shape (x, y) to world (x, z = -y).
    const s = new Shape(pts.map((p) => new Vector2(p.x, -p.z)))
    return new ExtrudeGeometry(s, { depth: h, bevelEnabled: false })
  }, [f, h])
  if ('circle' in f) {
    return (
      <mesh position={[0, h / 2, 0]} castShadow receiveShadow>
        <cylinderGeometry args={[f.circle.r, f.circle.r, h, 24]} />
        <LookMaterial look={look} />
      </mesh>
    )
  }
  return <mesh geometry={geo!} rotation={[-Math.PI / 2, 0, 0]} castShadow receiveShadow><LookMaterial look={look} /></mesh>
}
function LookMaterial({ look: l }: { look: Look }) {
  return <meshStandardMaterial color={l.color} roughness={l.rough} metalness={l.metal} emissive={l.emissive ?? '#000000'} emissiveIntensity={l.emissive ? 0.35 : 0}
    transparent={l.opacity !== undefined} opacity={l.opacity ?? 1} side={DoubleSide} />
}

function Trees({ t }: { t: TerrainInstance }) {
  const trees = useMemo(() => {
    const b = bounds(t.footprint)
    const out: { x: number; z: number; h: number; r: number }[] = []
    const seed = t.id.length * 97 + Math.round(t.pos.x * 13 + t.pos.z * 7)
    const area = (b.x1 - b.x0) * (b.z1 - b.z0)
    const want = Math.min(24, Math.max(4, Math.round(area / 5)))
    for (let i = 0; i < want * 6 && out.length < want; i++) {
      const p = { x: b.x0 + hash01(seed, i * 2) * (b.x1 - b.x0), z: b.z0 + hash01(seed, i * 2 + 1) * (b.z1 - b.z0) }
      const r = 0.35 + hash01(seed, i + 500) * 0.3
      if (inside(t.footprint, p) && inside(t.footprint, { x: p.x + r, z: p.z }) && inside(t.footprint, { x: p.x - r, z: p.z })
        && inside(t.footprint, { x: p.x, z: p.z + r }) && inside(t.footprint, { x: p.x, z: p.z - r })) {
        out.push({ ...p, r, h: Math.max(0.6, t.height) * (0.75 + hash01(seed, i + 900) * 0.25) })
      }
    }
    return out
  }, [t])
  return (
    <>
      {trees.map((tr, i) => (
        <group key={i} position={[tr.x, 0, tr.z]}>
          <mesh position={[0, tr.h * 0.12, 0]} castShadow><cylinderGeometry args={[0.07, 0.09, tr.h * 0.25, 5]} /><meshStandardMaterial color="#4a3a28" roughness={1} /></mesh>
          <mesh position={[0, tr.h * 0.58, 0]} castShadow><coneGeometry args={[tr.r, tr.h * 0.8, 7]} /><meshStandardMaterial color="#2f5a3a" roughness={1} flatShading /></mesh>
        </group>
      ))}
    </>
  )
}

function Piece({ t }: { t: TerrainInstance }) {
  const look = LOOK[t.rulesType] ?? LOOK.obstacle
  const h = look.flat ?? Math.max(0.05, t.height)
  return (
    <group position={[t.pos.x, 0, t.pos.z]} rotation={[0, t.rot, 0]} name={`terrain-${t.id}`} userData={{ terrainId: t.id, rulesType: t.rulesType, height: t.height }}>
      <Prism f={t.footprint} h={h} look={look} />
      {t.rulesType === 'forest' && <Trees t={t} />}
    </group>
  )
}

export function TerrainPieces() {
  const terrain = usePresented()?.terrain ?? []
  return <>{terrain.map((t) => <Piece key={t.id} t={t} />)}</>
}
