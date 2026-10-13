// The 3D table (owner P). Demand frameloop, dpr capped at 1.5. Renders only from the PRESENTED state. GameScreen passes
// the in-canvas slots (Figures, InteractionScene) as children so the owners never import each other.
import { useEffect, useState, type ReactElement, type ReactNode } from 'react'
import { Canvas, useFrame, useThree } from '@react-three/fiber'
import { useAnimating, useBoardGeometry, useFocus, usePresented, usePresentedRev } from '../contract'
import { FigureLabels } from '../figures/FigureLabels'
import { Gallery, GalleryLabels } from '../figures/Gallery'
import { readParams } from '../params'
import { AnchorProjector } from './Anchored'
import { CameraRig } from './Camera'
import { FpsMeter, FpsProbe, fpsEnabled } from './FpsMeter'
import { BoardLabels } from './Labels'
import { Mat } from './Mat'
import { ModelProxies, ProxySync } from './ModelProxies'
import { Objectives } from './Objectives'
import { TerrainPieces } from './Terrain'
import { ThreatOverlay } from './ThreatOverlay'
import { Zones } from './Zones'
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

/** True while any HUD modal (briefing, prompt, game over) is up: the DOM label layer hides so nothing floats over it. */
function useModalOpen(): boolean {
  const briefing = useFocus((f) => f.briefingOpen)
  const [dom, setDom] = useState(false)
  useEffect(() => {
    const check = () => setDom(!!document.querySelector('.modal-back, .gameover, [role="dialog"]'))
    check()
    const mo = new MutationObserver(check)
    mo.observe(document.body, { childList: true, subtree: true })
    return () => mo.disconnect()
  }, [])
  return briefing || dom
}

const START = cameraPose('overview', { w: 36, d: 36 })

export function Board({ children }: { children?: ReactNode }): ReactElement {
  const presented = usePresented()
  const geo = useBoardGeometry()
  // Mat sized from the deployment table (spec 50 s2); the scenario table is the fallback before geometry resolves.
  const table = geo?.table ?? presented?.scenario.table ?? { w: 36, d: 36 }
  const fps = fpsEnabled()
  const modal = useModalOpen()
  const gallery = readParams().gallery
  const half = Math.max(table.w, table.d) / 2 + 2
  return (
    <div style={{ position: 'absolute', inset: 0, zIndex: 0, isolation: 'isolate' }} data-testid="board">
      <Canvas frameloop="demand" dpr={[1, 1.5]} shadows="percentage" camera={{ fov: 42, position: START.pos }} gl={{ preserveDrawingBuffer: readParams().test }}>
        <color attach="background" args={['#0f141b']} />
        <fog attach="fog" args={['#0f141b', 70 * (half / 20), 150 * (half / 20)]} />
        <hemisphereLight args={['#cfe2f2', '#2a2622', 0.85]} />
        <directionalLight position={[16, 36, 18]} intensity={2.3} castShadow shadow-mapSize={[2048, 2048]} shadow-bias={-0.0004} shadow-normalBias={0.03}
          shadow-camera-left={-half} shadow-camera-right={half} shadow-camera-top={half} shadow-camera-bottom={-half} shadow-camera-far={120} />
        <Mat w={table.w} d={table.d} />
        {gallery ? <Gallery /> : (
          <>
            <Zones />
            <TerrainPieces />
            <Objectives />
            <ThreatOverlay />
            {children}
          </>
        )}
        <CameraRig />
        <Invalidator />
        <ProxySync />
        <AnchorProjector />
        {fps && <FpsProbe />}
      </Canvas>
      <ModelProxies />
      <div data-testid="label-layer" aria-hidden style={{ position: 'absolute', inset: 0, overflow: 'hidden', pointerEvents: 'none', display: modal ? 'none' : 'block' }}>
        {gallery ? <GalleryLabels /> : (
          <>
            <BoardLabels />
            <FigureLabels />
          </>
        )}
      </div>
      {fps && <FpsMeter />}
    </div>
  )
}
