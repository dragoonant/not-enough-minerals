// Tiled PBR ground (CC0 Poly Haven sets, see public/assets/CREDITS.md) with a low-frequency macro tint and a second,
// rotated, noise-masked sample that hide the tiling (the Fell-in ground-mat approach). Grid-free: distance reading is
// the measuring tools' job. The shader hook is plain GLSL patched into MeshStandardMaterial, so lights, shadows and fog
// keep working. Falls back to a flat colour until (or unless) the textures load.
import { Color, LinearMipmapLinearFilter, MeshStandardMaterial, RepeatWrapping, SRGBColorSpace, TextureLoader, Vector2, type Texture } from 'three'
import type { BoardTheme } from './boardTheme'

const base = (): string => {
  const b = (import.meta as { env?: { BASE_URL?: string } }).env?.BASE_URL ?? '/'
  return b.endsWith('/') ? b : b + '/'
}
export const groundUrl = (stem: string, kind: 'albedo' | 'normal' | 'rough'): string => `${base()}assets/ground/${stem}_${kind}.webp`

const NOISE = /* glsl */ `
varying vec3 vNemWPos;
uniform vec3 uNemMacroA; uniform vec3 uNemMacroB; uniform float uNemMacroK; uniform vec2 uNemHalf; uniform float uNemMix2; uniform float uNemMix3;
float nemH(vec2 p){ return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
float nemN(vec2 p){ vec2 i = floor(p), f = fract(p); f = f*f*(3.0-2.0*f);
  return mix(mix(nemH(i), nemH(i+vec2(1,0)), f.x), mix(nemH(i+vec2(0,1)), nemH(i+vec2(1,1)), f.x), f.y); }
float nemF(vec2 p){ return 0.55*nemN(p) + 0.3*nemN(p*2.1+7.3) + 0.15*nemN(p*4.3+3.1); }
`

export interface Ground { material: MeshStandardMaterial; dispose: () => void }

/** Builds the ground material for a w x d inch table. `onLoad` fires as each texture arrives (invalidate a demand canvas). */
export function createGroundMaterial(theme: BoardTheme, w: number, d: number, onLoad?: () => void): Ground {
  const g = theme.ground
  const material = new MeshStandardMaterial({ color: new Color(g.fallback), roughness: g.roughness, metalness: 0 })
  const loader = new TextureLoader()
  const owned: Texture[] = []
  const fit = (t: Texture, srgb: boolean): Texture => {
    t.wrapS = t.wrapT = RepeatWrapping
    t.repeat.set(w / g.tileInches, d / g.tileInches)
    t.anisotropy = 8
    t.minFilter = LinearMipmapLinearFilter
    if (srgb) t.colorSpace = SRGBColorSpace
    owned.push(t)
    return t
  }
  let alive = true
  const swap = (apply: (t: Texture) => void, kind: 'albedo' | 'normal' | 'rough', srgb: boolean) => {
    loader.load(groundUrl(g.stem, kind), (t) => {
      if (!alive) { t.dispose(); return }
      apply(fit(t, srgb)); material.needsUpdate = true; onLoad?.()
    }, undefined, () => { /* keep the flat fallback */ })
  }
  swap((t) => { material.map = t; material.color.set(g.tint).multiplyScalar(g.gain) }, 'albedo', true)
  swap((t) => { material.normalMap = t; material.normalScale = new Vector2(g.normalScale, g.normalScale) }, 'normal', false)
  swap((t) => { material.roughnessMap = t }, 'rough', false)

  material.customProgramCacheKey = () => 'nem-ground-v2'
  material.onBeforeCompile = (shader) => {
    shader.uniforms.uNemMacroA = { value: new Color(g.macroA) }
    shader.uniforms.uNemMacroB = { value: new Color(g.macroB) }
    shader.uniforms.uNemMacroK = { value: g.macroStrength }
    shader.uniforms.uNemMix2 = { value: g.mix2 }
    shader.uniforms.uNemMix3 = { value: g.mix3 }
    shader.uniforms.uNemHalf = { value: new Vector2(w / 2, d / 2) }
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vNemWPos;')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\nvNemWPos = (modelMatrix * vec4(transformed, 1.0)).xyz;')
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', '#include <common>\n' + NOISE)
      .replace('#include <map_fragment>', /* glsl */ `
#ifdef USE_MAP
  // low-frequency UV warp bends the texture rows so they never read as a grid
  vec2 nemWarp = (vec2(nemN(vNemWPos.xz * 0.21), nemN(vNemWPos.xz * 0.21 + 5.2)) - 0.5) * 0.09;
  vec4 nemA = texture2D(map, vMapUv + nemWarp);
  // second sample: rotated, rescaled and offset, blended in by a slow noise so the repeat never lines up
  vec2 nemUv2 = mat2(0.8, -0.6, 0.6, 0.8) * vMapUv * 0.73 + vec2(0.31, 0.17);
  vec4 nemB = texture2D(map, nemUv2);
  float nemMask = smoothstep(0.3, 0.7, nemF(vNemWPos.xz * 0.11));
  vec4 sampledDiffuseColor = mix(nemA, nemB, nemMask * uNemMix2);
  // third sample: much larger scale and another rotation, so no repeat period is shared with the first two
  vec2 nemUv3 = mat2(0.6, 0.8, -0.8, 0.6) * vMapUv * 0.29 + vec2(0.62, 0.41);
  vec4 nemC = texture2D(map, nemUv3);
  float nemMask3 = smoothstep(0.35, 0.65, nemF(vNemWPos.xz * 0.06 + 3.7));
  sampledDiffuseColor = mix(sampledDiffuseColor, nemC, nemMask3 * uNemMix3);
  diffuseColor *= sampledDiffuseColor;
#endif
  // macro tint: large soft patches of lighter and darker ground
  float nemM = nemF(vNemWPos.xz * 0.045 + 11.0);
  vec3 nemTone = mix(uNemMacroB, uNemMacroA, nemM);
  diffuseColor.rgb = mix(diffuseColor.rgb, diffuseColor.rgb * nemTone * 2.4, uNemMacroK);
  // gentle falloff toward the frame so the mat sits in its border
  vec2 nemEdge = uNemHalf - abs(vNemWPos.xz);
  diffuseColor.rgb *= mix(0.8, 1.0, smoothstep(0.0, 5.0, min(nemEdge.x, nemEdge.y)));
`)
  }
  return {
    material,
    dispose: () => { alive = false; owned.forEach((t) => t.dispose()); material.dispose() },
  }
}
