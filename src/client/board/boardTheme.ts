// Board themes (pure: no three, no React). One theme per game, chosen deterministically from the game seed, mission and
// deployment so both seats (and a replay) see the same table. Display only: no rules numbers. Grounds are kept mid-tone
// (not near-black) so the painted detail shows; the Entry Edge strips and Zone outlines carry the red/blue readability.

export type BoardThemeId = 'temple' | 'badlands' | 'ash' | 'ice'
export const THEME_IDS: readonly BoardThemeId[] = ['temple', 'badlands', 'ash', 'ice']

export interface BoardTheme {
  id: BoardThemeId
  label: string
  ground: {
    /** File stem under public/assets/ground (<stem>_albedo|normal|rough.webp). */
    stem: string
    /** Mean sRGB albedo of the source texture (measured), used for the readability budget. */
    mean: readonly [number, number, number]
    /** Multiplied into the albedo: darkens and desaturates so the side colours read on top. */
    tint: string
    /** Inches covered by one texture tile. */
    tileInches: number
    /** Low-frequency macro tint blended over the tiling (kills visible repetition). */
    macroA: string
    macroB: string
    macroStrength: number
    /** Brightness gain applied after the tint (the tint alone can only darken). */
    gain: number
    normalScale: number
    roughness: number
    /** Weight of the second (rotated) sample that breaks up the tiling: 0..1. */
    mix2: number
    /** Weight of the large-scale third sample / UV warp that breaks up visible rows. */
    mix3: number
    /** Flat colour shown until the textures arrive (or when they cannot load). */
    fallback: string
  }
  frame: { colour: string; rim: string }
  /** Tabletop the mat sits on: tint multiplied into the wood texture. */
  table: { tint: string; gain: number }
  sky: { top: string; horizon: string; floor: string; glow: string; fog: string; fogNear: number; fogFar: number }
  lights: {
    hemiSky: string; hemiGround: string; hemi: number
    key: string; keyIntensity: number; keyPos: readonly [number, number, number]
    rim: string; rimIntensity: number; rimPos: readonly [number, number, number]
    ambient: number
    /** Key shadow strength 0..1 (1 = black) and blur radius. */
    shadowIntensity: number; shadowRadius: number
    /** Environment (HDRI) reflection strength on lit pieces. */
    envIntensity: number
  }
}

export const BOARD_THEMES: Record<BoardThemeId, BoardTheme> = {
  temple: {
    id: 'temple', label: 'Temple ruins',
    ground: { stem: 'temple', mean: [102, 89, 75], tint: '#ad9f8c', tileInches: 14, macroA: '#85755a', macroB: '#4a4033', macroStrength: 0.35, gain: 1.2, normalScale: 1.5, roughness: 0.95, mix2: 0.8, mix3: 0.4, fallback: '#6a5e50' },
    frame: { colour: '#241f19', rim: '#6a5a3c' },
    table: { tint: '#9a8a78', gain: 0.8 },
    sky: { top: '#17202e', horizon: '#6b5636', floor: '#14110d', glow: '#ffb765', fog: '#2c2418', fogNear: 70, fogFar: 150 },
    lights: { hemiSky: '#ffe2b4', hemiGround: '#2b2217', hemi: 1.15, key: '#ffd9a0', keyIntensity: 1.9, keyPos: [14, 48, 12], rim: '#7fb3d9', rimIntensity: 0.7, rimPos: [-22, 12, -26], ambient: 0.1, shadowIntensity: 0.5, shadowRadius: 4, envIntensity: 0.35 },
  },
  badlands: {
    id: 'badlands', label: 'Badlands',
    ground: { stem: 'badlands', mean: [101, 74, 51], tint: '#c8c0b4', tileInches: 16, macroA: '#8e6a4a', macroB: '#46382c', macroStrength: 0.4, gain: 1.25, normalScale: 1.7, roughness: 0.97, mix2: 0.7, mix3: 0.3, fallback: '#6a5242' },
    frame: { colour: '#211b17', rim: '#5d4936' },
    table: { tint: '#8f7e6c', gain: 0.8 },
    sky: { top: '#2a1f2e', horizon: '#9a5a3a', floor: '#120e0c', glow: '#ff9a5a', fog: '#2a1d16', fogNear: 65, fogFar: 140 },
    lights: { hemiSky: '#f2c9a8', hemiGround: '#2a1a12', hemi: 1.1, key: '#ffc58a', keyIntensity: 1.85, keyPos: [-13, 47, 17], rim: '#9b86d6', rimIntensity: 0.75, rimPos: [24, 10, -22], ambient: 0.1, shadowIntensity: 0.5, shadowRadius: 4, envIntensity: 0.35 },
  },
  ash: {
    id: 'ash', label: 'Ashlands',
    ground: { stem: 'ash', mean: [98, 86, 73], tint: '#aaa6a2', tileInches: 14, macroA: '#64615e', macroB: '#332c27', macroStrength: 0.45, gain: 1.25, normalScale: 1.5, roughness: 0.98, mix2: 0.7, mix3: 0.3, fallback: '#575350' },
    frame: { colour: '#171513', rim: '#4a3f38' },
    table: { tint: '#7c7570', gain: 0.8 },
    sky: { top: '#0e0f13', horizon: '#4a2a1c', floor: '#0b0a09', glow: '#ff6a2a', fog: '#16110e', fogNear: 55, fogFar: 125 },
    lights: { hemiSky: '#c9bfb8', hemiGround: '#1f1410', hemi: 1.05, key: '#ffd2b0', keyIntensity: 1.8, keyPos: [12, 48, 16], rim: '#ff6a2a', rimIntensity: 0.9, rimPos: [-20, 8, -28], ambient: 0.09, shadowIntensity: 0.5, shadowRadius: 4, envIntensity: 0.3 },
  },
  ice: {
    id: 'ice', label: 'Frozen waste',
    ground: { stem: 'ice', mean: [165, 165, 167], tint: '#6a7e9a', tileInches: 18, macroA: '#a9c4e4', macroB: '#5d7794', macroStrength: 0.45, gain: 1.0, normalScale: 1.3, roughness: 0.8, mix2: 0.8, mix3: 0.4, fallback: '#5b6a80' },
    frame: { colour: '#161c24', rim: '#5a7088' },
    table: { tint: '#7d8794', gain: 0.8 },
    sky: { top: '#0f1a2b', horizon: '#486a8c', floor: '#0b1017', glow: '#bfe0ff', fog: '#141d29', fogNear: 70, fogFar: 150 },
    lights: { hemiSky: '#cfe4ff', hemiGround: '#1b2430', hemi: 1.15, key: '#e8f1ff', keyIntensity: 1.7, keyPos: [-12, 48, 15], rim: '#8fd0ff', rimIntensity: 0.8, rimPos: [22, 12, -24], ambient: 0.12, shadowIntensity: 0.45, shadowRadius: 4, envIntensity: 0.5 },
  },
}

function fnv1a(s: string): number {
  let h = 0x811c9dc5
  for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 0x01000193) }
  return h >>> 0
}

/** Same seed/mission/deployment: same theme, on every seat and every replay. Missing data falls back to badlands. */
export function themeIdFor(seed: string | null | undefined, missionId?: string | null, deploymentId?: string | null): BoardThemeId {
  if (!seed) return 'badlands'
  return THEME_IDS[fnv1a(`${seed}|${missionId ?? ''}|${deploymentId ?? ''}`) % THEME_IDS.length]!
}

/** `?theme=ash` style override for QA and screenshots. Unknown values are ignored. */
export function themeOverride(search: string): BoardThemeId | null {
  const v = new URLSearchParams(search).get('theme')
  return (THEME_IDS as readonly string[]).includes(v ?? '') ? (v as BoardThemeId) : null
}

export const themeFor = (id: BoardThemeId): BoardTheme => BOARD_THEMES[id]

const lin = (c: number): number => { const s = c / 255; return s <= 0.04045 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4) }
export function hexRgb(hex: string): [number, number, number] {
  const n = parseInt(hex.slice(1), 16)
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255]
}
/** WCAG relative luminance of a sRGB triplet (0..255). */
export const luminance = ([r, g, b]: readonly [number, number, number]): number => 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b)
export const contrast = (a: number, b: number): number => (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05)

/** Luminance of the lit-neutral ground after the tint (what the side overlays sit on). */
export function groundLuminance(t: BoardTheme): number {
  const tint = hexRgb(t.ground.tint)
  return luminance([t.ground.mean[0] * tint[0] / 255, t.ground.mean[1] * tint[1] / 255, t.ground.mean[2] * tint[2] / 255])
}
