// Terrain GLB selection and fitting (pure: no three, no React). public/assets/terrain/manifest.json maps each model slug to
// {file, size:[w,d,h], rulesType, theme, footprint}. Every engine terrain piece gets either a model whose rules type and
// footprint shape match (stretched to the EXACT engine footprint and height, spec 50 s2 / KB 9.3) or the procedural prism.
// Picks are deterministic from the game seed and the piece id, so both seats and a replay see the same table; a mirrored
// pair (ids "x" and "xm") shares one model, turned a half turn, so the table reads point-symmetric like the rules layout.
import type { TerrainInstance, TerrainRulesType } from '../../engine/types'
import type { BoardThemeId } from './boardTheme'

export type TerrainSet = 'temple' | 'outpost' | 'crystal' | 'creep'
export interface TerrainModel {
  slug: string
  file: string
  /** Authored bounding box in inches: width (x), depth (z), height (y). */
  size: readonly [number, number, number]
  rulesType: TerrainRulesType
  theme: TerrainSet
  shape: 'rect' | 'circle'
}

/** Terrain sets per board theme, most fitting first. Sets after the first are borrowed when the first has no model that fits. */
export const THEME_SETS: Record<BoardThemeId, readonly TerrainSet[]> = {
  temple: ['temple', 'crystal', 'outpost', 'creep'],
  badlands: ['outpost', 'crystal', 'temple', 'creep'],
  ash: ['creep', 'outpost', 'crystal', 'temple'],
  ice: ['crystal', 'outpost', 'temple', 'creep'],
}

/** Largest stretch (ratio on any axis) a model may take to fill a footprint; anything worse stays procedural. */
export const MAX_STRETCH = 1.4

const SETS: readonly TerrainSet[] = ['temple', 'outpost', 'crystal', 'creep']
const SAFE = /^[a-z0-9][a-z0-9-]*$/

/** Normalise the manifest; malformed rows are dropped (they would only ever fall back to the procedural piece). */
export function parseTerrainManifest(raw: unknown): TerrainModel[] {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return []
  const out: TerrainModel[] = []
  for (const [slug, v] of Object.entries(raw as Record<string, unknown>)) {
    if (!SAFE.test(slug) || !v || typeof v !== 'object') continue
    const e = v as Record<string, unknown>
    const size = e['size']
    const file = typeof e['file'] === 'string' ? e['file'] : `${slug}.glb`
    if (!/^[\w-]+\.glb$/.test(file) || !Array.isArray(size) || size.length !== 3 || !size.every((n) => typeof n === 'number' && n > 0)) continue
    const theme = e['theme'] as TerrainSet
    const fp = e['footprint'] as Record<string, unknown> | undefined
    if (!SETS.includes(theme) || typeof e['rulesType'] !== 'string') continue
    out.push({ slug, file, size: [size[0], size[1], size[2]] as const, rulesType: e['rulesType'] as TerrainRulesType, theme, shape: fp && 'circle' in fp ? 'circle' : 'rect' })
  }
  return out
}

/** Footprint extent in the piece frame: w along local x, d along local z. Polygons are not fitted (procedural only). */
export function footprintBox(f: TerrainInstance['footprint']): { shape: 'rect' | 'circle'; w: number; d: number } | null {
  if ('circle' in f) return { shape: 'circle', w: 2 * f.circle.r, d: 2 * f.circle.r }
  if ('rect' in f) return { shape: 'rect', w: f.rect.w, d: f.rect.d }
  return null
}

/** Worst axis ratio (>= 1) to stretch a model of `size` onto w x d x h, with an optional quarter turn. */
export function stretchOf(size: readonly [number, number, number], w: number, d: number, h: number, quarter: boolean): number {
  const [mw, md, mh] = quarter ? [size[1], size[0], size[2]] : size
  const r = (a: number, b: number): number => Math.max(a / b, b / a)
  return Math.max(r(mw, w), r(md, d), r(mh, h))
}

export function fnv(s: string): number {
  let h = 0x811c9dc5
  for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 0x01000193) }
  return h >>> 0
}

export interface TerrainPick {
  model: TerrainModel
  /** Model turned a quarter turn so its long side follows the footprint's long side. */
  quarter: boolean
  /** Extra yaw on top of the piece rot (radians): a half turn for the mirrored twin; any angle for round pieces. */
  yaw: number
  /** Scale from the authored size onto the footprint (x, y, z in the piece frame, after the quarter turn). */
  scale: readonly [number, number, number]
  stretch: number
}

type PieceLike = Pick<TerrainInstance, 'id' | 'rulesType' | 'footprint' | 'height'>

/**
 * The model for an engine piece, or null (procedural). Candidates share the rules type and footprint shape and stretch by at
 * most MAX_STRETCH; the theme's own set and the next one form the pool (own set weighted 2:1), near-exact fits first; the
 * choice is a hash of the seed and the piece id.
 */
export function pickTerrainModel(models: readonly TerrainModel[], t: PieceLike, theme: BoardThemeId, seed: string): TerrainPick | null {
  const box = footprintBox(t.footprint)
  if (!box || t.height <= 0.3) return null
  const sets = THEME_SETS[theme]
  const cands: { m: TerrainModel; quarter: boolean; stretch: number; tier: number; loose: number }[] = []
  for (const m of models) {
    if (m.rulesType !== t.rulesType || m.shape !== box.shape) continue
    const a = stretchOf(m.size, box.w, box.d, t.height, false)
    const b = box.shape === 'rect' ? stretchOf(m.size, box.w, box.d, t.height, true) : Infinity
    const quarter = b < a
    const stretch = Math.min(a, b)
    if (stretch > MAX_STRETCH) continue
    const tier = sets.indexOf(m.theme)
    cands.push({ m, quarter, stretch, tier: tier < 0 ? 9 : tier, loose: stretch > 1.1 ? 1 : 0 })
  }
  if (!cands.length) return null
  // The best set and the next one both take part (the theme's own set twice as often) so a table is not one model repeated;
  // a near-exact fit beats a stretched one within that pool.
  const top = Math.min(...cands.map((c) => c.tier))
  const near = cands.filter((c) => c.tier <= top + 1)
  const fit = Math.min(...near.map((c) => c.loose))
  const pool = near.filter((c) => c.loose === fit).sort((x, y) => (x.m.slug < y.m.slug ? -1 : 1))
  const weights = pool.map((c) => (c.tier === top ? 2 : 1))
  const twin = t.id.endsWith('m')
  const base = twin ? t.id.slice(0, -1) : t.id
  const h = fnv(`${seed}|${base}`)
  let r = h % weights.reduce((a, b) => a + b, 0), k = 0
  while (r >= weights[k]!) { r -= weights[k]!; k++ }
  const c = pool[k]!
  const [mw, md, mh] = c.quarter ? [c.m.size[1], c.m.size[0], c.m.size[2]] : c.m.size
  const spin = box.shape === 'circle' ? ((h >>> 8) % 360) * (Math.PI / 180) : 0
  return {
    model: c.m, quarter: c.quarter, stretch: c.stretch,
    yaw: spin + (twin ? Math.PI : 0),
    scale: [box.w / mw, t.height / mh, box.d / md],
  }
}
