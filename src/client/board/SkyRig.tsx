// Backdrop for the table: gradient sky dome (no HDRI download), scene background and fog, all from the board theme.
// `useBoardTheme` is the one place that maps the presented game (seed, mission, deployment) to a theme.
import { Suspense, useMemo } from 'react'
import { Environment } from '@react-three/drei'
import { groundUrl } from './groundMaterial'
import { BackSide, Color, ShaderMaterial } from 'three'
import { usePresented } from '../contract'
import { BOARD_THEMES, themeFor, themeIdFor, themeOverride, type BoardTheme } from './boardTheme'

export function useBoardTheme(): BoardTheme {
  const s = usePresented()
  const seed = s?.seed, mission = s?.missionId, deployment = s?.deploymentId
  return useMemo(() => {
    let forced = null
    try { forced = typeof window !== 'undefined' ? themeOverride(window.location.search) : null } catch { /* no window */ }
    return themeFor(forced ?? themeIdFor(seed, mission, deployment))
  }, [seed, mission, deployment])
}

const VERT = /* glsl */ `varying vec3 vDir; void main(){ vDir = normalize(position); gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`
const FRAG = /* glsl */ `
varying vec3 vDir; uniform vec3 uTop; uniform vec3 uHorizon; uniform vec3 uFloor; uniform vec3 uGlow; uniform vec3 uGlowDir;
void main(){
  float h = vDir.y;
  vec3 c = h > 0.0 ? mix(uHorizon, uTop, pow(clamp(h, 0.0, 1.0), 0.55)) : mix(uHorizon, uFloor, clamp(-h * 4.0, 0.0, 1.0));
  float g = max(dot(normalize(vDir), uGlowDir), 0.0);
  c += uGlow * (0.35 * pow(g, 24.0) + 0.12 * pow(g, 4.0));
  gl_FragColor = vec4(c, 1.0);
  #include <colorspace_fragment>
}`

// CC0 Poly Haven "studio_small_03" 1k HDRI (public/assets/CREDITS.md): soft room bounce for reflections on the pieces.
const envFile = (): string => groundUrl('env_studio_small_03_1k', 'albedo').replace(/_albedo\.webp$/, '.hdr')

export function SkyRig({ theme, half }: { theme?: BoardTheme; half: number }) {
  const own = useBoardTheme()
  const t = theme ?? own
  const mat = useMemo(() => {
    const dir = (() => { const [x, y, z] = t.lights.keyPos; const n = Math.hypot(x, y, z) || 1; return [x / n, y / n, z / n] as const })()
    return new ShaderMaterial({
      side: BackSide, depthWrite: false, fog: false,
      uniforms: {
        uTop: { value: new Color(t.sky.top) }, uHorizon: { value: new Color(t.sky.horizon) }, uFloor: { value: new Color(t.sky.floor) },
        uGlow: { value: new Color(t.sky.glow) }, uGlowDir: { value: [dir[0], dir[1], dir[2]] },
      },
      vertexShader: VERT, fragmentShader: FRAG,
    })
  }, [t])
  const k = half / 20
  return (
    <>
      <color attach="background" args={[t.sky.fog]} />
      <fog attach="fog" args={[t.sky.fog, t.sky.fogNear * k, t.sky.fogFar * k]} />
      <mesh name="sky" renderOrder={-1} material={mat} frustumCulled={false}>
        <sphereGeometry args={[Math.max(300, 14 * half), 24, 16]} />
      </mesh>
      <Suspense fallback={null}>
        <Environment files={envFile()} environmentIntensity={t.lights.envIntensity} />
      </Suspense>
    </>
  )
}

export { BOARD_THEMES }
