// Presentation-driven figures. Mount inside the Board's <Canvas>. One figure per model from the PRESENTED state: shipped GLB
// (public/models, via manifest.json) or the procedural MGSD stand-in, a side-coloured ring on the base, facing the nearest
// enemy, sliding along move tweens, y snapped to the surface, tipped over when down, sunk when burrowed, and a glow ring for
// the hovered / selected / card-hovered unit. Status icons, damage pops and cue effects ride along. DOM proxies for tests
// live in board/ModelProxies.tsx.
import { useEffect, useMemo, useRef, useState } from 'react'
import { useFrame, useThree } from '@react-three/fiber'
import type { Group } from 'three'
import {
  tweenPosition, useFocus, useGame, useModelIds, usePresented, usePresentedModel, usePresentedUnits, useReportFiguresReady, useTween,
} from '../contract'
import { sideHex } from '../board/sideColours'
import { Vfx } from '../vfx'
import { CueFx } from './CueFx'
import { FigureBody, useFigureHeight } from './FigureBody'
import { useGlbsSettled } from './glbLoader'
import { modelUrl, useManifest } from './manifest'
import { facingYaw, lookOf, tintFor, turnToward } from './view'

const TURN_RATE = 9 // rad/s
const GLOW_SELECTED = '#59b8d6', GLOW_HOVER = '#ffffff', GLOW_CARD = '#e0a03a'

/** Side ring and optional glow around a base (inches). */
export function BaseRing({ radius, color, glow }: { radius: number; color: string; glow?: string | null }) {
  return (
    <group>
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.025, 0]} name="side-ring">
        <ringGeometry args={[radius + 0.03, radius + 0.15, 40]} />
        <meshBasicMaterial color={color} transparent opacity={0.9} depthWrite={false} />
      </mesh>
      {glow && (
        <>
          <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.03, 0]} name="glow-ring">
            <ringGeometry args={[radius + 0.15, radius + 0.45, 48]} />
            <meshBasicMaterial color={glow} transparent opacity={0.85} depthWrite={false} />
          </mesh>
          <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.02, 0]}>
            <circleGeometry args={[radius + 0.45, 48]} />
            <meshBasicMaterial color={glow} transparent opacity={0.18} depthWrite={false} />
          </mesh>
        </>
      )}
    </group>
  )
}

function Figure({ id, seatIndex }: { id: string; seatIndex: number }) {
  const m = usePresentedModel(id)
  const tween = useTween(id)
  const presented = usePresented()
  const invalidate = useThree((s) => s.invalidate)
  const outer = useRef<Group>(null)
  const body = useRef<Group>(null)
  const yaw = useRef<number | null>(null)
  const tip = useRef(0)
  const elev = useRef<number | null>(null)
  const sink = useRef(0)
  const unit = m ? presented?.units[m.unitId] : undefined
  const burrowed = !!unit?.effects.some((e) => e.kind === 'status' && e.status === 'BURROWED')
  const height = useFigureHeight(m?.profileId ?? '', m?.base ?? 32)
  const glow = useFocus((f) => (m && f.selectedUnitId === m.unitId ? GLOW_SELECTED : m && f.cardHoverUnitId === m.unitId ? GLOW_CARD : m && f.hoverUnitId === m.unitId ? GLOW_HOVER : null))

  useFrame((_, dt) => {
    if (!outer.current || !body.current || !m) return
    const p = tween ? tweenPosition(tween) : m.pos
    // y snaps to the surface the engine reports (hill elevation); ease so a slide onto a hill does not pop.
    if (elev.current === null) elev.current = m.elev
    elev.current += (m.elev - elev.current) * Math.min(1, dt * 14)
    if (Math.abs(m.elev - elev.current) < 0.005) elev.current = m.elev; else invalidate()
    outer.current.position.set(p.x, elev.current, p.z)
    const want = facingYaw(presented, id, p)
    if (want !== null) {
      yaw.current = yaw.current === null ? want : turnToward(yaw.current, want, TURN_RATE * Math.min(dt, 0.1))
      body.current.rotation.y = yaw.current
      if (yaw.current !== want) invalidate()
    }
    const goal = m.life === 'down' ? 1 : 0
    tip.current += (goal - tip.current) * Math.min(1, dt * 10)
    if (Math.abs(goal - tip.current) < 0.01) tip.current = goal; else invalidate()
    const sinkGoal = burrowed ? 1 : 0
    sink.current += (sinkGoal - sink.current) * Math.min(1, dt * 8)
    if (Math.abs(sinkGoal - sink.current) < 0.01) sink.current = sinkGoal; else invalidate()
    body.current.rotation.x = -tip.current * (Math.PI / 2) * 0.96
    body.current.position.y = tip.current * 0.35 - sink.current * height * 0.6
  })

  if (!m || lookOf(m) === 'gone') return null
  const [color, accent] = tintFor(seatIndex)
  const side = presented?.seats[m.owner]?.colour ?? null
  return (
    <group ref={outer} position={[m.pos.x, m.elev, m.pos.z]} name={`figure-${id}`} userData={{ modelId: id, unitId: m.unitId, figure: true }}>
      <BaseRing radius={m.base / 25.4 / 2} color={sideHex(side)} glow={glow} />
      <group ref={body}>
        <FigureBody id={id} profileId={m.profileId} baseMm={m.base} color={color} accent={accent} />
      </group>
    </group>
  )
}

export function Figures() {
  const ids = useModelIds()
  const units = usePresentedUnits()
  const manifest = useManifest()
  // The bot waits until every GLB this game uses has loaded or failed (a failure keeps the procedural body); an 8 s
  // watchdog releases it regardless.
  const urls = useMemo(() => {
    if (!manifest || !units) return []
    return [...new Set(Object.values(units).map((u) => manifest[u.profileId]?.file).filter((f): f is string => !!f))].map(modelUrl)
  }, [manifest, units])
  const settled = useGlbsSettled(urls)
  const [late, setLate] = useState(false)
  useEffect(() => { const t = setTimeout(() => setLate(true), 8000); return () => clearTimeout(t) }, [])
  useReportFiguresReady(late || (manifest !== null && settled))
  const { state, seatOrder } = useGame()
  return (
    <>
      {ids.map((id) => {
        const owner = state?.models[id]?.owner
        return <Figure key={id} id={id} seatIndex={Math.max(0, owner ? seatOrder.indexOf(owner) : 0)} />
      })}
      <CueFx />
      <Vfx />
    </>
  )
}

