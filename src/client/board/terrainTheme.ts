// Per-theme material pass for terrain GLBs. A model borrowed from another set (or authored for one ground) is brought into the
// board's world at load: frost on upward faces and a cool grade on ice, ash dusting on ash, wind-blown sand on temple and
// badlands. It patches each cloned material's shader (no new textures), keyed per theme so programs are not shared.
import type { Material, Mesh, Object3D } from 'three'
import type { BoardThemeId } from './boardTheme'
import type { TerrainSet } from './terrainFit'

export interface ThemePass { dust: readonly [number, number, number]; amount: number; tint: readonly [number, number, number]; desat: number }

/** Dust colour (linear-ish rgb 0-1), how much of the upward-facing surface it covers, a colour multiplier and a desaturation. */
export function themePass(theme: BoardThemeId, set: TerrainSet): ThemePass {
  const own = (s: TerrainSet): boolean => s === set
  switch (theme) {
    case 'ice': return { dust: [0.86, 0.93, 0.97], amount: own('crystal') ? 0.5 : 0.7, tint: [0.88, 0.96, 1.06], desat: own('crystal') ? 0.0 : 0.25 }
    case 'ash': return { dust: [0.42, 0.4, 0.38], amount: own('creep') ? 0.18 : 0.45, tint: [0.92, 0.9, 0.9], desat: own('creep') ? 0.0 : 0.15 }
    case 'badlands': return { dust: [0.62, 0.45, 0.28], amount: 0.32, tint: [1.0, 0.96, 0.92], desat: 0 }
    default: return { dust: [0.6, 0.5, 0.36], amount: own('temple') ? 0.12 : 0.28, tint: [1, 0.98, 0.96], desat: 0 }
  }
}

const f = (n: number): string => n.toFixed(3)

/** Patch every material under `root` (they must already be private clones). */
export function applyThemePass(root: Object3D, theme: BoardThemeId, set: TerrainSet): void {
  const p = themePass(theme, set)
  const key = `nem-terrain-${theme}-${set}`
  root.traverse((o) => {
    const m = o as Mesh
    if (!m.isMesh) return
    for (const mat of Array.isArray(m.material) ? m.material : [m.material]) patch(mat, p, key)
  })
}

function patch(mat: Material, p: ThemePass, key: string): void {
  mat.onBeforeCompile = (shader) => {
    shader.vertexShader = shader.vertexShader
      .replace('void main() {', 'varying float vUpN;\nvoid main() {')
      .replace('#include <defaultnormal_vertex>', '#include <defaultnormal_vertex>\n  vUpN = normalize(mat3(modelMatrix) * objectNormal).y;')
    shader.fragmentShader = shader.fragmentShader
      .replace('void main() {', 'varying float vUpN;\nvoid main() {')
      .replace('#include <color_fragment>', `#include <color_fragment>
  float nemFrost = smoothstep(0.35, 0.85, vUpN) * ${f(p.amount)};
  float nemLum = dot(diffuseColor.rgb, vec3(0.299, 0.587, 0.114));
  diffuseColor.rgb = mix(diffuseColor.rgb, vec3(nemLum), ${f(p.desat)}) * vec3(${f(p.tint[0])}, ${f(p.tint[1])}, ${f(p.tint[2])});
  diffuseColor.rgb = mix(diffuseColor.rgb, vec3(${f(p.dust[0])}, ${f(p.dust[1])}, ${f(p.dust[2])}), nemFrost);`)
  }
  mat.customProgramCacheKey = () => key
  mat.needsUpdate = true
}
