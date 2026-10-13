// DOM labels pinned to the table. (drei's Html makes its own React root per label, which React 19 reports as an error when
// labels come and go during a render, so labels are plain DOM in one overlay layer and a projector inside the canvas moves
// them each frame, exactly like the test proxies in ModelProxies.tsx.)
//   <Anchored model="m1" dy={2}>...</Anchored>   follows a model (tweens included), dy inches above its surface
//   <Anchored at={[x, y, z]}>...</Anchored>      fixed world point (inches)
//   rise={{ t0, dur }}                           floats up 1.6 inches and fades over `dur` ms of director time (damage pops)
import type { CSSProperties, ReactNode } from 'react'
import { useFrame, useThree } from '@react-three/fiber'
import { Vector3 } from 'three'
import { directorNow, tweenPosition, usePresented, useTweens } from '../contract'

export interface AnchoredProps {
  model?: string
  at?: [number, number, number]
  dy?: number
  rise?: { t0: number; dur: number }
  /** CSS box alignment: 'bottom' (default; the label sits above the point) or 'center'. */
  align?: 'bottom' | 'center'
  style?: CSSProperties
  testid?: string
  children: ReactNode
}

export function Anchored({ model, at, dy = 0, rise, align = 'bottom', style, testid, children }: AnchoredProps) {
  return (
    <div data-anchor={model ? 'model' : 'point'} data-model={model} data-dy={dy} data-align={align} data-testid={testid}
      data-x={at?.[0]} data-y={at?.[1]} data-z={at?.[2]} data-t0={rise?.t0} data-dur={rise?.dur}
      style={{ position: 'absolute', left: 0, top: 0, visibility: 'hidden', pointerEvents: 'none', whiteSpace: 'nowrap', ...style }}>
      {children}
    </div>
  )
}

const v = new Vector3()

/** Inside the Canvas: projects every [data-anchor] element of the board's label layer. */
export function AnchorProjector() {
  const { camera, gl, invalidate } = useThree()
  const state = usePresented()
  const tweens = useTweens()
  useFrame(() => {
    const root = gl.domElement.closest('[data-testid="board"]')?.querySelector('[data-testid="label-layer"]')
    if (!root) return
    const w = gl.domElement.clientWidth, h = gl.domElement.clientHeight
    camera.updateMatrixWorld()
    let rising = false
    root.querySelectorAll<HTMLElement>('[data-anchor]').forEach((el) => {
      const d = el.dataset
      let x = Number(d['x']), y = Number(d['y']), z = Number(d['z'])
      if (d['anchor'] === 'model') {
        const m = state?.models[d['model'] ?? '']
        if (!m || m.offTable || m.life === 'dead') { el.style.visibility = 'hidden'; return }
        const tw = tweens[m.id]
        const p = tw ? tweenPosition(tw) : m.pos
        x = p.x; y = m.elev; z = p.z
      }
      let dy = Number(d['dy'] ?? 0)
      let alpha = 1
      if (d['t0'] !== undefined && d['dur'] !== undefined) {
        const age = Math.min(1, Math.max(0, (directorNow() - Number(d['t0'])) / Math.max(1, Number(d['dur']))))
        dy += age * 1.6
        alpha = age < 0.7 ? 1 : 1 - (age - 0.7) / 0.3
        if (age < 1) rising = true
      }
      v.set(x, y + dy, z).project(camera)
      const off = v.z > 1 || v.z < -1
      el.style.visibility = off ? 'hidden' : 'visible'
      if (off) return
      el.style.opacity = String(alpha)
      el.style.transform = `translate(${((v.x + 1) / 2) * w}px, ${((1 - v.y) / 2) * h}px) translate(-50%, ${d['align'] === 'center' ? '-50%' : '-100%'})`
    })
    if (rising) invalidate()
  })
  return null
}
