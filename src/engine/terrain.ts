// Terrain prisms by rules type . Pure functions, inches.
// Self-contained on purpose (geometry.ts imports this file, not the other way round).
import type { DamageType, GameState, TerrainInstance, TerrainRulesType, Vec2 } from './types'

const EPS = 1e-9

// ---------- world shapes ----------
export type WorldShape = { kind: 'circle'; c: Vec2; r: number } | { kind: 'poly'; pts: Vec2[] }

/** Rotation convention: `rot` is radians about +y, so a local (x,z) maps to (x cos + z sin, -x sin + z cos). */
export function worldShape(t: TerrainInstance): WorldShape {
  const rot = (p: Vec2): Vec2 => {
    const c = Math.cos(t.rot), s = Math.sin(t.rot)
    return { x: t.pos.x + p.x * c + p.z * s, z: t.pos.z - p.x * s + p.z * c }
  }
  const f = t.footprint
  if ('circle' in f) return { kind: 'circle', c: { ...t.pos }, r: f.circle.r }
  if ('rect' in f) {
    const hw = f.rect.w / 2, hd = f.rect.d / 2
    return { kind: 'poly', pts: [{ x: -hw, z: -hd }, { x: hw, z: -hd }, { x: hw, z: hd }, { x: -hw, z: hd }].map(rot) }
  }
  return { kind: 'poly', pts: f.polygon.map(rot) }
}

const hyp = (dx: number, dz: number) => Math.hypot(dx, dz)

function segDistPt(a: Vec2, b: Vec2, p: Vec2): number {
  const dx = b.x - a.x, dz = b.z - a.z
  const l2 = dx * dx + dz * dz
  const t = l2 < EPS ? 0 : Math.max(0, Math.min(1, ((p.x - a.x) * dx + (p.z - a.z) * dz) / l2))
  return hyp(p.x - (a.x + dx * t), p.z - (a.z + dz * t))
}

export function pointInShape(p: Vec2, s: WorldShape): boolean {
  if (s.kind === 'circle') return hyp(p.x - s.c.x, p.z - s.c.z) <= s.r
  let inside = false
  const n = s.pts.length
  for (let i = 0, j = n - 1; i < n; j = i++) {
    const a = s.pts[i]!, b = s.pts[j]!
    if (a.z > p.z !== b.z > p.z && p.x < ((b.x - a.x) * (p.z - a.z)) / (b.z - a.z) + a.x) inside = !inside
  }
  return inside
}

/** Distance from a point to the shape (0 inside). */
export function distToShape(p: Vec2, s: WorldShape): number {
  if (pointInShape(p, s)) return 0
  if (s.kind === 'circle') return hyp(p.x - s.c.x, p.z - s.c.z) - s.r
  let d = Infinity
  for (let i = 0; i < s.pts.length; i++) d = Math.min(d, segDistPt(s.pts[i]!, s.pts[(i + 1) % s.pts.length]!, p))
  return d
}

/** Distance from an inside point to the boundary (0 outside). */
export function depthInShape(p: Vec2, s: WorldShape): number {
  if (!pointInShape(p, s)) return 0
  if (s.kind === 'circle') return s.r - hyp(p.x - s.c.x, p.z - s.c.z)
  let d = Infinity
  for (let i = 0; i < s.pts.length; i++) d = Math.min(d, segDistPt(s.pts[i]!, s.pts[(i + 1) % s.pts.length]!, p))
  return d
}

/** Circle (base) overlaps the shape with positive area (merely touching does not count). */
export function circleOverlapsShape(c: Vec2, r: number, s: WorldShape): boolean {
  return pointInShape(c, s) || distToShape(c, s) < r - 1e-7
}
/** Whole circle inside the shape. */
export function circleInsideShape(c: Vec2, r: number, s: WorldShape): boolean {
  return pointInShape(c, s) && depthInShape(c, s) >= r - 1e-7
}

/** Parameter intervals [t0,t1] within [0,1] of the segment a to b that lie inside the shape. */
export function segmentInsideIntervals(a: Vec2, b: Vec2, s: WorldShape): [number, number][] {
  const ts: number[] = [0, 1]
  const dx = b.x - a.x, dz = b.z - a.z
  if (s.kind === 'circle') {
    const fx = a.x - s.c.x, fz = a.z - s.c.z
    const A = dx * dx + dz * dz, B = 2 * (fx * dx + fz * dz), C = fx * fx + fz * fz - s.r * s.r
    const disc = B * B - 4 * A * C
    if (A > EPS && disc > 0) {
      const q = Math.sqrt(disc)
      for (const t of [(-B - q) / (2 * A), (-B + q) / (2 * A)]) if (t > 0 && t < 1) ts.push(t)
    }
  } else {
    for (let i = 0; i < s.pts.length; i++) {
      const p = s.pts[i]!, q = s.pts[(i + 1) % s.pts.length]!
      const ex = q.x - p.x, ez = q.z - p.z
      const den = dx * ez - dz * ex
      if (Math.abs(den) < EPS) continue
      const t = ((p.x - a.x) * ez - (p.z - a.z) * ex) / den
      const u = ((p.x - a.x) * dz - (p.z - a.z) * dx) / den
      if (t > 0 && t < 1 && u >= 0 && u <= 1) ts.push(t)
    }
  }
  ts.sort((x, y) => x - y)
  const out: [number, number][] = []
  for (let i = 0; i < ts.length - 1; i++) {
    const t0 = ts[i]!, t1 = ts[i + 1]!
    if (t1 - t0 < 1e-12) continue
    const tm = (t0 + t1) / 2
    if (pointInShape({ x: a.x + dx * tm, z: a.z + dz * tm }, s)) {
      const last = out[out.length - 1]
      if (last && Math.abs(last[1] - t0) < 1e-12) last[1] = t1
      else out.push([t0, t1])
    }
  }
  return out
}

// ---------- traits by rules type ----------
export type MoveBlock = 'none' | 'obstacle' | 'impassable'
export type CoverKind = 'none' | 'cover' | 'concealment'
export interface TerrainTraits {
  type: TerrainRulesType // effective type (scenario terrain resolves to props.baseType, default obstacle)
  move: MoveBlock
  rough: boolean
  blocksLos: boolean // by height against volumes; forests are handled by depth instead
  forest: boolean
  height: number
  /** surface elevation granted to models completely within (hill; props.elevation overrides) */
  elevation: number
  cover: CoverKind // granted within 1" along a line (obstacle/obstruction)
  insideCover: CoverKind // granted to a model completely inside (rubble, forest)
  hazard: boolean
  /** Hazard data (props.hazard); only on hazard pieces */
  hazardSpec?: { pow: number; damageType?: DamageType; on: ('enter' | 'endActivation')[] }
  /** forest: a line that starts or ends inside may cross this much; props.losThrough, default 3 */
  losThrough: number
  /** damage types a model completely inside resists (trench: blast; props.resistance) */
  resist: DamageType[]
}

export function effectiveType(t: TerrainInstance): TerrainRulesType {
  if (t.rulesType === 'scenarioTerrain') {
    const b = t.props['baseType']
    return typeof b === 'string' ? (b as TerrainRulesType) : 'obstacle'
  }
  return t.rulesType
}

/** First 'damage' node of props.hazard.effect: POW, optional damage type, and the triggers (default both). */
function hazardSpecOf(t: TerrainInstance): TerrainTraits['hazardSpec'] {
  const h = t.props['hazard'] as { effect?: Record<string, unknown>[]; on?: ('enter' | 'endActivation')[] } | undefined
  const node = h?.effect?.find((n) => n['op'] === 'damage')
  const pow = typeof node?.['pow'] === 'number' ? (node['pow'] as number) : 10
  const on = Array.isArray(h?.on) && h!.on!.length ? h!.on! : (['enter', 'endActivation'] as ('enter' | 'endActivation')[])
  return { pow, ...(typeof node?.['damageType'] === 'string' ? { damageType: node['damageType'] as DamageType } : {}), on }
}

/**
 * Traits by rules type, then the schema props overrides (terrain.schema.json): blocksLos, losThrough, cover, concealment,
 * rough, impassable, elevation, resistance, hazard. (feature, baseType and baseElev are read elsewhere.)
 */
export function terrainTraits(t: TerrainInstance): TerrainTraits {
  const type = effectiveType(t)
  const p = t.props
  const hedge = p['feature'] === 'hedge' || p['concealment'] === true
  const base: TerrainTraits = {
    type, move: 'none', rough: false, blocksLos: false, forest: false, height: t.height, elevation: 0,
    cover: 'none', insideCover: 'none', hazard: false, losThrough: 3, resist: [],
  }
  let r: TerrainTraits
  switch (type) {
    case 'obstacle': r = { ...base, move: 'obstacle', blocksLos: true, cover: hedge ? 'concealment' : 'cover' }; break
    case 'obstruction':
    case 'building': r = { ...base, move: 'impassable', blocksLos: true, cover: 'cover' }; break
    case 'forest': r = { ...base, rough: true, forest: true, insideCover: 'concealment' }; break
    case 'shallowWater': r = { ...base, rough: true }; break
    case 'rough': r = { ...base, rough: true }; break
    case 'rubble': r = { ...base, rough: true, insideCover: 'cover' }; break
    case 'hill': r = { ...base, blocksLos: true, elevation: typeof p['elevation'] === 'number' ? (p['elevation'] as number) : t.height }; break
    case 'hazard': r = { ...base, hazard: true, hazardSpec: hazardSpecOf(t) }; break
    case 'deepWater': r = { ...base, move: 'impassable' }; break
    // RULING (G2): a trench is open ground; a model completely inside has cover and Resistance: Blast (20 section 9)
    case 'trench': r = { ...base, insideCover: 'cover', resist: ['blast'] }; break
    default: r = base
  }
  // props overrides (G3)
  if (typeof p['blocksLos'] === 'boolean') r.blocksLos = p['blocksLos']
  if (typeof p['losThrough'] === 'number') r.losThrough = p['losThrough']
  if (typeof p['rough'] === 'boolean') r.rough = p['rough']
  if (typeof p['impassable'] === 'boolean') r.move = p['impassable'] ? 'impassable' : r.move === 'impassable' ? 'none' : r.move
  if (typeof p['elevation'] === 'number' && type !== 'hill') r.elevation = p['elevation']
  if (Array.isArray(p['resistance'])) r.resist = p['resistance'] as DamageType[]
  if (p['hazard'] && type !== 'hazard') { r.hazard = true; r.hazardSpec = hazardSpecOf(t) }
  const lineKind = r.move !== 'none' // walls, buildings and obstructions grant cover along a line; the rest only completely inside
  if (p['cover'] === false) { r.cover = 'none'; r.insideCover = 'none' }
  else if (p['cover'] === true) { if (lineKind) r.cover = 'cover'; else r.insideCover = 'cover' }
  else if (p['concealment'] === true && type !== 'obstacle') { if (lineKind) r.cover = 'concealment'; else if (r.insideCover !== 'cover') r.insideCover = 'concealment' }
  return r
}

export interface TerrainPiece { t: TerrainInstance; shape: WorldShape; traits: TerrainTraits }
const cache = new WeakMap<readonly TerrainInstance[], TerrainPiece[]>()
export function terrainPieces(state: Pick<GameState, 'terrain'>): TerrainPiece[] {
  let r = cache.get(state.terrain)
  if (!r) {
    r = state.terrain.map((t) => ({ t, shape: worldShape(t), traits: terrainTraits(t) }))
    cache.set(state.terrain, r)
  }
  return r
}

/** Rough pieces a base overlaps. */
export function roughUnder(state: Pick<GameState, 'terrain'>, pos: Vec2, r: number): TerrainPiece[] {
  return terrainPieces(state).filter((p) => p.traits.rough && circleOverlapsShape(pos, r, p.shape))
}

/** Surface elevation for a base placed at pos: the tallest hill it is completely within. */
export function elevationAt(state: Pick<GameState, 'terrain'>, pos: Vec2, r: number): number {
  let e = 0
  for (const p of terrainPieces(state)) {
    if (p.traits.elevation > e && circleInsideShape(pos, r, p.shape)) e = p.traits.elevation
  }
  return e
}

/** Pieces a base may not overlap when placed: obstructions, buildings, deep water, obstacles. */
export function placementBlockers(state: Pick<GameState, 'terrain'>, pos: Vec2, r: number): TerrainPiece[] {
  return terrainPieces(state).filter((p) => p.traits.move !== 'none' && circleOverlapsShape(pos, r, p.shape))
}

/** Cover/concealment from terrain a base is completely inside (rubble, forest). Cover wins. */
export function insideCoverOf(state: Pick<GameState, 'terrain'>, pos: Vec2, r: number): CoverKind {
  let best: CoverKind = 'none'
  for (const p of terrainPieces(state)) {
    if (p.traits.insideCover === 'none' || !circleInsideShape(pos, r, p.shape)) continue
    if (p.traits.insideCover === 'cover') return 'cover'
    best = 'concealment'
  }
  return best
}

/** Damage types a base completely inside terrain resists (trench: blast; props.resistance). */
export function terrainResistance(state: Pick<GameState, 'terrain'>, pos: Vec2, r: number): DamageType[] {
  const out: DamageType[] = []
  for (const p of terrainPieces(state)) if (p.traits.resist.length && circleInsideShape(pos, r, p.shape)) out.push(...p.traits.resist)
  return out
}

/** Hazard pieces a base overlaps. */
export function hazardsUnder(state: Pick<GameState, 'terrain'>, pos: Vec2, r: number): TerrainPiece[] {
  return terrainPieces(state).filter((p) => p.traits.hazard && circleOverlapsShape(pos, r, p.shape))
}

// =====================================================================================================================
// StarCraft layer (spec 14 s4-5, s8): Size, Effective Size, Grass, walkable tops, ramps, ACCESS POINTS and openings.
// A piece is a TerrainInstance; the StarCraft facts ride in its free-form `props` (so the frozen types stay as they are):
//   size: number            terrain Size (default by rulesType, see defaultSize)
//   grass: true             a Size 2 patch that never blocks movement and is destroyed on contact (MOVE-030)
//   standsOn: pieceId       the piece it is set on; Effective Size and levels stack through it (SIZE-002)
//   walkable: true          models may stand on its top (HIGH / MID GROUND); needs access points to be reached
//   ramp: true              Size 1 MID GROUND walkable piece with an access point at each end (ELEV-004)
//   accessPoints: Vec2[]    world points on the piece edge where models change level (ELEV-003)
//   openings: {a,b,width}[] agreed passable gaps inside a Size 2+ piece (MOVE-041); they stay closed for LoS (LOS-004)
//   topElev: number         height of the walkable top in inches (default: the instance height)
// =====================================================================================================================

export interface Opening { a: Vec2; b: Vec2; width: number }
export interface ScPiece {
  t: TerrainInstance
  shape: WorldShape
  size: number
  /** Effective Size: own Size plus the Effective Size of what it stands on. */
  es: number
  grass: boolean
  walkable: boolean
  ramp: boolean
  /** Elevation level of a model standing on top: 0 GROUND, 1 MID, 2 HIGH (0 for pieces nobody can stand on). */
  level: 0 | 1 | 2
  /** Ids of the pieces it stands on, nearest first. */
  below: string[]
  access: Vec2[]
  openings: Opening[]
  /** Height of the walkable top in inches (rendering only; rules read the level). */
  top: number
}

/** Size when props.size is absent: the generic rulesType mapped onto the Size scale. */
export function defaultSize(t: TerrainInstance): number {
  switch (effectiveType(t)) {
    case 'obstacle': return 1
    case 'obstruction': return 2
    case 'building': return 3
    case 'hill': return 3
    default: return 0
  }
}

const scCache = new WeakMap<readonly TerrainInstance[], ScPiece[]>()
/** Every terrain piece with its StarCraft facts, cached per `state.terrain` array (grass removal builds a new array). */
export function scPieces(state: Pick<GameState, 'terrain'>): ScPiece[] {
  let out = scCache.get(state.terrain)
  if (out) return out
  const byId = new Map(state.terrain.map((t) => [t.id, t]))
  const sizeOfT = (t: TerrainInstance): number => {
    const p = t.props['size']
    if (typeof p === 'number') return p
    return t.props['grass'] === true ? 2 : t.props['ramp'] === true ? 1 : defaultSize(t)
  }
  const chainOf = (t: TerrainInstance): TerrainInstance[] => {
    const seen = new Set<string>([t.id])
    const chain: TerrainInstance[] = []
    let cur = t
    for (;;) {
      const id = cur.props['standsOn']
      const next = typeof id === 'string' ? byId.get(id) : undefined
      if (!next || seen.has(next.id)) break
      seen.add(next.id)
      chain.push(next)
      cur = next
    }
    return chain
  }
  out = state.terrain.map((t) => {
    const chain = chainOf(t)
    const size = sizeOfT(t)
    const es = size + chain.reduce((s, c) => s + sizeOfT(c), 0)
    const ramp = t.props['ramp'] === true
    const walkable = ramp || t.props['walkable'] === true
    const level: 0 | 1 | 2 = !walkable ? 0 : ramp ? 1 : es >= 3 ? 2 : 1
    const pts = (k: string): Vec2[] => (Array.isArray(t.props[k]) ? (t.props[k] as Vec2[]) : [])
    return {
      t, shape: worldShape(t), size, es, grass: t.props['grass'] === true, walkable, ramp, level,
      below: chain.map((c) => c.id), access: pts('accessPoints'),
      openings: (Array.isArray(t.props['openings']) ? t.props['openings'] : []) as Opening[],
      top: typeof t.props['topElev'] === 'number' ? (t.props['topElev'] as number) : t.height,
    }
  })
  scCache.set(state.terrain, out)
  return out
}

/** Does the piece stop movement through it (Size 2+, Grass excepted; walkable tops count as solid from outside)? */
export const isSolid = (p: ScPiece): boolean => !p.grass && p.size >= SOLID_TERRAIN_SIZE

/** Smallest terrain Size that stops movement and Engagement (R p.39 4.6: Size 0-1 can be moved through). DATA MISFIT:
 *  rules.json has no key for it and data/** is frozen, so it is named here once; every module reads this constant. */
export const SOLID_TERRAIN_SIZE = 2

/** Size 0-1 pieces a LARGE unit flattens when it crosses or ends on them: not Grass, not a walkable top (KW-086, CA-009). */
export const crushable = (p: ScPiece): boolean => !p.grass && !p.walkable && !p.ramp && p.size < SOLID_TERRAIN_SIZE

/** Small pieces a base overlaps (the ones a LARGE unit crushes). */
export function crushableUnder(state: Pick<GameState, 'terrain'>, pos: Vec2, r: number): ScPiece[] {
  return scPieces(state).filter((p) => crushable(p) && circleOverlapsShape(pos, r, p.shape))
}

/** The highest walkable piece whose footprint contains the point (where a base centred there stands), or null. */
export function surfaceAt(state: Pick<GameState, 'terrain'>, pos: Vec2): ScPiece | null {
  let best: ScPiece | null = null
  for (const p of scPieces(state)) {
    if (!p.walkable || !pointInShape(pos, p.shape)) continue
    if (!best || p.es > best.es) best = p
  }
  return best
}

/** Elevation level of a base (R p.59: a base spanning levels counts as the highest, SIZE-004 / ELEV-001). */
export function levelOfBase(state: Pick<GameState, 'terrain'>, pos: Vec2, r: number): 0 | 1 | 2 {
  let lv: 0 | 1 | 2 = 0
  for (const p of scPieces(state)) {
    if (p.walkable && p.level > lv && circleOverlapsShape(pos, r, p.shape)) lv = p.level
  }
  return lv
}

/** Surface height in inches under a base centred at pos (the top of the surface piece, else 0). */
export const heightAt = (state: Pick<GameState, 'terrain'>, pos: Vec2): number => surfaceAt(state, pos)?.top ?? 0

/** Pieces the base may not end overlapping: everything except Grass, the walkable top it stands on (centre inside) and
 *  the pieces under that (BASE-003, MOVE-014). Flying bases get no walkable exception. */
export function endBlockers(state: Pick<GameState, 'terrain'>, pos: Vec2, r: number, flying = false, crush = false): ScPiece[] {
  const stand = flying ? null : surfaceAt(state, pos)
  return scPieces(state).filter((p) => {
    if (p.grass || !circleOverlapsShape(pos, r, p.shape) || (crush && crushable(p))) return false
    if (stand && (p === stand || stand.below.includes(p.t.id))) return false
    return true
  })
}

/** Grass patches a base overlaps. */
export function grassUnder(state: Pick<GameState, 'terrain'>, pos: Vec2, r: number): ScPiece[] {
  return scPieces(state).filter((p) => p.grass && circleOverlapsShape(pos, r, p.shape))
}

/** Distance from a point to the nearest access point of the piece (Infinity when it has none). */
export function accessDistance(p: ScPiece, pos: Vec2): number {
  let d = Infinity
  for (const a of p.access) d = Math.min(d, hyp(pos.x - a.x, pos.z - a.z))
  return d
}

/** Is the point inside an opening of the piece (a gap agreed passable, wide enough for `need` inches)? */
export function inOpening(p: ScPiece, pos: Vec2, need: number): boolean {
  return p.openings.some((o) => o.width + 1e-9 >= need && segDistPt(o.a, o.b, pos) <= o.width / 2 + 1e-9)
}

/** Distance from a base edge to the footprint of a piece (0 when touching or overlapping). */
export function baseToPiece(p: ScPiece, pos: Vec2, r: number): number {
  return Math.max(0, distToShape(pos, p.shape) - r)
}

/** Does the straight segment a-b cross the piece's footprint? */
export const segmentCrosses = (p: ScPiece, a: Vec2, b: Vec2): boolean => segmentInsideIntervals(a, b, p.shape).length > 0
