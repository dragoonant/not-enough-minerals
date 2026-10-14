// Terrain at exactly the rules footprints and heights (spec 50 s2): every piece is drawn from the engine's
// TerrainInstance (footprint shape, pos, rot about +y, height); looks are cosmetic per rules type. Walls, buildings,
// obstructions and hills fill the footprint to full height; forests, water, rough ground, rubble, trenches and hazards
// are low ground patches (forests add small trees inside the footprint). Pieces with a fitting GLB (terrainFit.ts) draw the
// model stretched to the exact footprint and height instead; the prism stays as the fallback while it loads or if it fails.
// A piece that stands between the camera and the selected unit fades so the unit stays visible.
import { useEffect, useMemo, useRef, useState, type RefObject } from 'react'
import { useFrame, useThree } from '@react-three/fiber'
import { Box3, DoubleSide, ExtrudeGeometry, Mesh, Ray, Shape, ShapeGeometry, Vector2, Vector3, type Group, type Material } from 'three'
import type { ThreeEvent } from '@react-three/fiber'
import { useFocus, usePresented } from '../contract'
import { readParams } from '../params'
import { usePresentedStore } from '../presentation/presentedStore'
import type { TerrainInstance, TerrainRulesType, Vec2 } from '../../engine/types'
import { PALETTE } from '../theme'
import { hash01 } from './layout'
import { useBoardTheme } from './SkyRig'
import { pickTerrainModel, type TerrainPick } from './terrainFit'
import { useFittedTerrain, useTerrainModels } from './terrainGlb'
import { hideTerrainCard, showTerrainCard, terrainInfo } from './terrainHover'
import type { BoardThemeId } from './boardTheme'

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

const FADED = 0.28
const ray = new Ray(), box = new Box3(), hit = new Vector3(), eye = new Vector3(), aim = new Vector3()

/** Fades the group's own materials while it blocks the camera's view of any model of the selected unit. */
function useOccluderFade(group: RefObject<Group | null>, key: unknown) {
  const selected = useFocus((f) => f.selectedUnitId)
  const invalidate = useThree((s) => s.invalidate)
  const level = useRef(1)
  const mats = useRef<{ m: Material; base: number; transparent: boolean; depthWrite: boolean }[]>([])
  useEffect(() => {
    const out: typeof mats.current = []
    group.current?.traverse((o) => {
      const mesh = o as Mesh
      if (!mesh.isMesh) return
      for (const m of Array.isArray(mesh.material) ? mesh.material : [mesh.material]) out.push({ m, base: m.opacity, transparent: m.transparent, depthWrite: m.depthWrite })
    })
    mats.current = out
    level.current = 1
  }, [group, key])
  useEffect(() => { invalidate() }, [selected, invalidate])
  useFrame(({ camera }) => {
    const g = group.current
    if (!g) return
    let want = 1
    if (selected) {
      const s = usePresentedStore.getState().state
      const u = s?.units[selected]
      if (s && u) {
        box.setFromObject(g)
        eye.copy(camera.position)
        for (const id of u.modelIds) {
          const m = s.models[id]
          if (!m?.pos) continue
          aim.set(m.pos.x, (m.elev ?? 0) + 0.6, m.pos.z)
          const dist = eye.distanceTo(aim)
          ray.set(eye, aim.clone().sub(eye).normalize())
          if (box.containsPoint(aim)) continue
          if (ray.intersectBox(box, hit) && eye.distanceTo(hit) < dist - 0.3) { want = FADED; break }
        }
      }
    }
    if (Math.abs(level.current - want) < 0.01) { if (level.current !== want) level.current = want; else return }
    else { level.current += (want - level.current) * 0.25; invalidate() }
    const fading = level.current < 0.999
    for (const e of mats.current) {
      e.m.opacity = e.base * level.current
      if (e.m.transparent !== (fading || e.transparent)) { e.m.transparent = fading || e.transparent; e.m.needsUpdate = true }
      e.m.depthWrite = fading ? false : e.depthWrite
    }
  })
}

/** The exact rules footprint, drawn flat just above the table (y 0.02) while a piece is hovered: a thin band whose inner edge IS
 *  the footprint edge (the base plate sits exactly on it), plus a faint fill that shows where a piece has no plate (gaps, polygons). */
function FootprintOutline({ f }: { f: TerrainInstance['footprint'] }) {
  const { band, fill } = useMemo(() => {
    const W = 0.1
    const ring = (grow: number): Vector2[] => {
      if ('circle' in f) return Array.from({ length: 64 }, (_, i) => new Vector2(Math.cos((i / 64) * Math.PI * 2) * (f.circle.r + grow), Math.sin((i / 64) * Math.PI * 2) * (f.circle.r + grow)))
      if ('rect' in f) { const hw = f.rect.w / 2 + grow, hd = f.rect.d / 2 + grow; return [new Vector2(-hw, -hd), new Vector2(hw, -hd), new Vector2(hw, hd), new Vector2(-hw, hd)] }
      const c = f.polygon.reduce((a, p) => ({ x: a.x + p.x / f.polygon.length, z: a.z + p.z / f.polygon.length }), { x: 0, z: 0 })
      return f.polygon.map((p) => { const dx = p.x - c.x, dz = p.z - c.z, l = Math.hypot(dx, dz) || 1; return new Vector2(p.x + (dx / l) * grow, -(p.z + (dz / l) * grow)) })
    }
    // Shapes lie in XY; the meshes below are rotated -90 deg about X (shape (x, y) -> world (x, z = -y)); rect/circle are symmetric.
    const outer = new Shape(ring(W)); outer.holes.push(new Shape(ring(0)))
    return { band: new ShapeGeometry(outer), fill: new ShapeGeometry(new Shape(ring(0))) }
  }, [f])
  return (
    <group position={[0, 0.02, 0]} rotation={[-Math.PI / 2, 0, 0]} renderOrder={5}>
      <mesh geometry={fill}><meshBasicMaterial color="#ffe08a" transparent opacity={0.22} depthWrite={false} side={DoubleSide} /></mesh>
      <mesh geometry={band} position={[0, 0, 0.005]}><meshBasicMaterial color="#ffd45a" depthTest={false} transparent opacity={0.95} side={DoubleSide} /></mesh>
    </group>
  )
}

function Piece({ t, pick, waiting, theme }: { t: TerrainInstance; pick: TerrainPick | null; waiting: boolean; theme: BoardThemeId }) {
  const look = LOOK[t.rulesType] ?? LOOK.obstacle
  const h = look.flat ?? Math.max(0.05, t.height)
  const fitted = useFittedTerrain(pick, t, theme)
  const ref = useRef<Group>(null)
  const [hover, setHover] = useState(false)
  useEffect(() => () => hideTerrainCard(), [])
  // Only the nearest surface under the pointer counts, so a figure standing behind a wall does not light the wall up.
  const nearest = (e: ThreeEvent<PointerEvent>): boolean => {
    for (let o: typeof e.object | null = e.intersections[0]?.object ?? null; o; o = o.parent) if (o === e.eventObject) return true
    return false
  }
  const over = (e: ThreeEvent<PointerEvent>) => {
    if (!nearest(e)) { if (hover) { setHover(false); hideTerrainCard() } return }
    if (!hover) setHover(true)
    showTerrainCard(terrainInfo(t), e.nativeEvent.clientX, e.nativeEvent.clientY)
  }
  const out = () => { setHover(false); hideTerrainCard() }
  useEffect(() => { // ?test=1: e2e waits until every piece with a model shows it
    if (!readParams().test) return
    const w = window as unknown as { __terrain?: Record<string, string | null> }
    w.__terrain = { ...w.__terrain, [t.id]: fitted ? pick?.model.slug ?? null : pick || waiting ? 'loading' : null }
    return () => { if (w.__terrain) { const { [t.id]: _gone, ...rest } = w.__terrain; w.__terrain = rest } }
  }, [t.id, fitted, pick, waiting])
  useOccluderFade(ref, fitted)
  return (
    <group ref={ref} position={[t.pos.x, 0, t.pos.z]} rotation={[0, t.rot, 0]} name={`terrain-${t.id}`}
      onPointerOver={over} onPointerMove={over} onPointerOut={out}
      userData={{ terrainId: t.id, rulesType: t.rulesType, height: t.height, model: fitted ? pick?.model.slug : null }}>
      {fitted ? <primitive object={fitted} /> : <Prism f={t.footprint} h={h} look={look} />}
      {t.rulesType === 'forest' && <Trees t={t} />}
      {hover && <FootprintOutline f={t.footprint} />}
    </group>
  )
}

export function TerrainPieces() {
  const s = usePresented()
  const terrain = s?.terrain ?? []
  const seed = s?.seed ?? 'game'
  const theme = useBoardTheme().id
  const models = useTerrainModels()
  const picks = useMemo(() => new Map(terrain.map((t) => [t.id, models ? pickTerrainModel(models, t, theme, seed) : null])), [terrain, models, theme, seed])
  return <>{terrain.map((t) => <Piece key={t.id} t={t} pick={picks.get(t.id) ?? null} waiting={models === null} theme={theme} />)}</>
}
