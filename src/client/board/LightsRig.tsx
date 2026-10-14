// Soft shadows: the key sits high (y ~ 48) and its shadow is only partly dark (shadow.intensity) and blurred, so pieces
// do not cut black holes in the mat. Three-point light rig from the board theme: hemisphere fill, a shadow-casting key and a cool/hot rim from behind the
// table, plus a faint ambient floor so shadowed model faces never go black.
import type { BoardTheme } from './boardTheme'
import { useBoardTheme } from './SkyRig'

export function LightsRig({ theme, half }: { theme?: BoardTheme; half: number }) {
  const own = useBoardTheme()
  const { lights: l } = theme ?? own
  return (
    <>
      <hemisphereLight args={[l.hemiSky, l.hemiGround, l.hemi]} />
      <ambientLight intensity={l.ambient} />
      <directionalLight position={[...l.keyPos]} color={l.key} intensity={l.keyIntensity} castShadow shadow-mapSize={[2048, 2048]}
        shadow-bias={-0.0004} shadow-normalBias={0.03} shadow-intensity={l.shadowIntensity} shadow-radius={l.shadowRadius}
        shadow-camera-left={-half} shadow-camera-right={half} shadow-camera-top={half} shadow-camera-bottom={-half} shadow-camera-far={120} />
      <directionalLight position={[...l.rimPos]} color={l.rim} intensity={l.rimIntensity} />
    </>
  )
}
