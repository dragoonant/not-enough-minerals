// The 3D table. Demand frameloop, dpr capped at 1.5. Renders only from the PRESENTED state.
import { useEffect, type ReactElement } from 'react'
import { Canvas, useFrame, useThree } from '@react-three/fiber'
import { useAnimating, usePresented, usePresentedRev } from '../contract'
import { Figures } from '../figures/Figures'
import { CameraRig } from './Camera'
import { FpsMeter, FpsProbe, fpsEnabled } from './FpsMeter'
import { Mat } from './Mat'
import { ModelProxies, ProxySync } from './ModelProxies'
import { TerrainPieces } from './Terrain'
import { cameraPose } from './layout'

/** Keeps a demand canvas drawing: once per presented change, every frame while a beat or tween plays. */
function Invalidator() {
  const invalidate = useThree((s) => s.invalidate)
  const rev = usePresentedRev()
  const animating = useAnimating()
  useEffect(() => { invalidate() }, [rev, animating, invalidate])
  useFrame(() => { if (animating) invalidate() })
  return null
}

const START = cameraPose('overview', { w: 36, d: 36 })

export function Board(): ReactElement {
  const table = usePresented()?.scenario.table ?? { w: 36, d: 36 }
  const fps = fpsEnabled()
  return (
    <div style={{ position: 'absolute', inset: 0 }} data-testid="board">
      <Canvas frameloop="demand" dpr={[1, 1.5]} shadows camera={{ fov: 42, position: START.pos }} gl={{ preserveDrawingBuffer: true }}>
        <color attach="background" args={['#0f141b']} />
        <fog attach="fog" args={['#0f141b', 70, 150]} />
        <hemisphereLight args={['#cfe2f2', '#2a2622', 0.85]} />
        <directionalLight position={[16, 36, 18]} intensity={2.3} castShadow shadow-mapSize={[1024, 1024]} shadow-bias={-0.0004} shadow-normalBias={0.03}
          shadow-camera-left={-34} shadow-camera-right={34} shadow-camera-top={34} shadow-camera-bottom={-34} />
        <Mat w={table.w} d={table.d} />
        <TerrainPieces />
        <Figures />
        <CameraRig />
        <Invalidator />
        <ProxySync />
        {fps && <FpsProbe />}
      </Canvas>
      <ModelProxies />
      {fps && <FpsMeter />}
    </div>
  )
}
