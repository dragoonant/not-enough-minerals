// Presentation-driven figures. Mount inside the Board's <Canvas>. One figure per model from the PRESENTED state: side
// tint, facing the nearest enemy, sliding along move tweens, tipped over when down. DOM proxies for tests live in
// board/ModelProxies.tsx. M5 swaps the procedural body for generated GLBs (glbLoader.ts) with this fallback.
import { useRef } from 'react'
import { useFrame, useThree } from '@react-three/fiber'
import type { Group } from 'three'
import { tweenPosition, useGame, useModelIds, usePresented, usePresentedModel, useTween } from '../contract'
import { ProceduralFigure } from './Procedural'
import { facingYaw, lookOf, tintFor, turnToward } from './view'

const TURN_RATE = 9 // rad/s

function Figure({ id, seatIndex }: { id: string; seatIndex: number }) {
  const m = usePresentedModel(id)
  const tween = useTween(id)
  const presented = usePresented()
  const invalidate = useThree((s) => s.invalidate)
  const outer = useRef<Group>(null)
  const body = useRef<Group>(null)
  const yaw = useRef<number | null>(null)
  const tip = useRef(0)

  useFrame((_, dt) => {
    if (!outer.current || !body.current || !m) return
    const p = tween ? tweenPosition(tween) : m.pos
    outer.current.position.set(p.x, m.elev, p.z)
    const want = facingYaw(presented, id, p)
    if (want !== null) {
      yaw.current = yaw.current === null ? want : turnToward(yaw.current, want, TURN_RATE * Math.min(dt, 0.1))
      body.current.rotation.y = yaw.current
      if (yaw.current !== want) invalidate()
    }
    const goal = m.life === 'down' ? 1 : 0
    tip.current += (goal - tip.current) * Math.min(1, dt * 10)
    if (Math.abs(goal - tip.current) < 0.01) tip.current = goal; else invalidate()
    body.current.rotation.x = -tip.current * (Math.PI / 2) * 0.96
    body.current.position.y = tip.current * 0.35
  })

  if (!m || lookOf(m) === 'gone') return null
  const [color, accent] = tintFor(seatIndex)
  return (
    <group ref={outer} position={[m.pos.x, m.elev, m.pos.z]} name={`figure-${id}`}>
      <group ref={body}>
        <ProceduralFigure id={id} x={0} z={0} baseMm={m.base} color={color} accent={accent} />
      </group>
    </group>
  )
}

export function Figures() {
  const ids = useModelIds()
  const { state, seatOrder } = useGame()
  return (
    <>
      {ids.map((id) => {
        const owner = state?.models[id]?.owner
        return <Figure key={id} id={id} seatIndex={Math.max(0, owner ? seatOrder.indexOf(owner) : 0)} />
      })}
    </>
  )
}
