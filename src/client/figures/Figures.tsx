// Presentation-driven figures. Mount inside the Board's <Canvas>. One figure per model from the PRESENTED state: shipped GLB
// (public/models, via manifest.json) or the procedural MGSD stand-in, a side-coloured ring on the base, facing the nearest
// enemy, sliding along move tweens, y snapped to the surface, tipped over when down, sunk when burrowed, and a glow ring for
// the hovered / selected / card-hovered unit. Status icons, damage pops and cue effects ride along. DOM proxies for tests
// live in board/ModelProxies.tsx.
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useFrame, useThree } from '@react-three/fiber'
import type { Group } from 'three'
import {
  onCue, tweenPosition, useFocus, useGame, useModelIds, usePresented, usePresentedModel, usePresentedUnits, useReportFiguresReady, useTween,
} from '../contract'
import { sideHex } from '../board/sideColours'
import { Vfx } from '../vfx'
import { CueFx } from './CueFx'
import { FigureBody, useFigureHeight } from './FigureBody'
import { useGlbsSettled } from './glbLoader'
import { modelUrl, useManifest } from './manifest'
import { pulse, turretRelative, type GlbRig } from './rig'
import { batchLayer } from './glbBatch'
import { ringBatches, type RingHandle } from './rings'
import { facingYaw, lookOf, tintFor, turnToward } from './view'

const TURN_RATE = 9 // rad/s
const GLOW_SELECTED = '#59b8d6', GLOW_HOVER = '#ffffff', GLOW_CARD = '#e0a03a'

/** Glow around a base (inches) for the hovered / selected / card-hovered unit. The side ring itself is instanced (rings.ts). */
export function BaseGlow({ radius, glow }: { radius: number; glow: string }) {
  return (
    <group>
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.03, 0]} name="glow-ring">
        <ringGeometry args={[radius + 0.15, radius + 0.45, 48]} />
        <meshBasicMaterial color={glow} transparent opacity={0.85} depthWrite={false} />
      </mesh>
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.02, 0]}>
        <circleGeometry args={[radius + 0.45, 48]} />
        <meshBasicMaterial color={glow} transparent opacity={0.18} depthWrite={false} />
      </mesh>
    </group>
  )
}

const AIM_HOLD_MS = 1400, TURRET_RATE = 7 // rad/s
const LUNGE_MS = 520, CHARGE_MS = 760

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
  const [rig, setRig] = useState<GlbRig | null>(null)
  const ring = useRef<RingHandle | null>(null)
  const mRef = useRef(m)
  mRef.current = m
  const presentedRef = useRef(presented)
  presentedRef.current = presented
  const aim = useRef<{ yaw: number; t: number } | null>(null)
  const lunge = useRef<{ t0: number; dur: number; sway: boolean } | null>(null)
  const turret = useRef(0)
  const sync = useRef<(() => void) | null>(null)
  const setSync = useCallback((fn: (() => void) | null) => { sync.current = fn }, [])
  const unit = m ? presented?.units[m.unitId] : undefined
  const burrowed = !!unit?.effects.some((e) => e.kind === 'status' && e.status === 'BURROWED')
  const height = useFigureHeight(m?.profileId ?? '', m?.base ?? 32)
  const glow = useFocus((f) => (m && f.selectedUnitId === m.unitId ? GLOW_SELECTED : m && f.cardHoverUnitId === m.unitId ? GLOW_CARD : m && f.hoverUnitId === m.unitId ? GLOW_HOVER : null))

  const baseR = m ? m.base / 25.4 / 2 : 0
  const visible = !!m && lookOf(m) !== 'gone'
  const ringColor = sideHex(presented?.seats[m?.owner ?? '']?.colour ?? null)
  const ringColorRef = useRef(ringColor)
  ringColorRef.current = ringColor
  useEffect(() => {
    if (!visible || baseR <= 0) return
    const h = ringBatches.acquire(baseR)
    ring.current = h
    invalidate()
    return () => { h.release(); if (ring.current === h) ring.current = null }
  }, [visible, baseR, invalidate])

  // Rig cues: a turret rig yaws toward the target of this unit's attack; a lunge rig lunges on attack and sways on charge.
  const live = !!rig && (rig.caps.turret || rig.caps.lunge)
  useEffect(() => {
    if (!live || !rig) return
    const off = onCue((cue) => {
      const cur = mRef.current
      if (!cur) return
      if (cue.kind === 'attack' && (cue.attackerId === id || (cue.attackerUnitId && cue.attackerUnitId === cur.unitId))) {
        const s = presentedRef.current
        const t = s?.models[cue.targetId]
        const a = s?.models[cue.attackerId] ?? cur
        if (rig.caps.turret && t) aim.current = { yaw: Math.atan2(t.pos.x - a.pos.x, t.pos.z - a.pos.z), t: performance.now() }
        if (rig.caps.lunge) lunge.current = { t0: performance.now(), dur: LUNGE_MS, sway: false }
      } else if (cue.kind === 'charge' && cue.unitId === cur.unitId && rig.caps.lunge && cue.stage !== 'rolled' && cue.stage !== 'failed') {
        lunge.current = { t0: performance.now(), dur: CHARGE_MS, sway: true }
      }
      invalidate()
    })
    return () => { off(); rig.reset(); aim.current = null; lunge.current = null; turret.current = 0 }
  }, [live, rig, id, invalidate])

  useFrame((_, dt) => {
    if (!outer.current || !body.current || !m) return
    const p = tween ? tweenPosition(tween) : m.pos
    // y snaps to the surface the engine reports (hill elevation); ease so a slide onto a hill does not pop.
    if (elev.current === null) elev.current = m.elev
    elev.current += (m.elev - elev.current) * Math.min(1, dt * 14)
    if (Math.abs(m.elev - elev.current) < 0.005) elev.current = m.elev; else invalidate()
    outer.current.position.set(p.x, elev.current, p.z)
    ring.current?.set(p.x, elev.current + 0.025, p.z, ringColorRef.current)
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
    if (rig && live) {
      const now = performance.now()
      let busy = false
      if (rig.caps.turret) {
        const a = aim.current
        const goal = a && now - a.t < AIM_HOLD_MS ? turretRelative(a.yaw, yaw.current ?? 0) : 0
        if (a && now - a.t >= AIM_HOLD_MS && Math.abs(turret.current) < 0.005) aim.current = null
        const next = turnToward(turret.current, goal, TURRET_RATE * Math.min(dt, 0.1))
        if (next !== turret.current) { turret.current = next; rig.apply({ turret: next }) }
        busy = !!aim.current || Math.abs(next - goal) > 1e-3
      } else {
        const l = lunge.current
        const age = l ? now - l.t0 : 0
        const env = l ? pulse(age, l.dur) : 0
        if (l) rig.apply({ lunge: env, sway: l.sway ? Math.sin((age / l.dur) * Math.PI * 4) * env : 0 })
        if (l && age >= l.dur) { lunge.current = null; rig.reset() }
        busy = !!lunge.current
      }
      if (busy) invalidate()
    }
    body.current.rotation.x = -tip.current * (Math.PI / 2) * 0.96
    body.current.position.y = tip.current * 0.35 - sink.current * height * 0.6
    sync.current?.() // instanced GLB: upload this figure's matrix now that every transform above is final
  })

  if (!m || lookOf(m) === 'gone') return null
  const [color, accent] = tintFor(seatIndex)
  return (
    <group ref={outer} position={[m.pos.x, m.elev, m.pos.z]} name={`figure-${id}`} userData={{ modelId: id, unitId: m.unitId, figure: true }}>
      {glow && <BaseGlow radius={baseR} glow={glow} />}
      <group ref={body}>
        <FigureBody id={id} profileId={m.profileId} baseMm={m.base} color={color} accent={accent} onRig={setRig} instanced onSync={setSync} />
      </group>
    </group>
  )
}

/** Mounts the shared instanced side rings and redraws the (demand-driven) canvas when a ring slot changes. */
function RingLayer() {
  const invalidate = useThree((s) => s.invalidate)
  useEffect(() => {
    ringBatches.onDirty = invalidate
    batchLayer.onDirty = invalidate
    return () => { ringBatches.onDirty = () => {}; batchLayer.onDirty = () => {} }
  }, [invalidate])
  return <><primitive object={ringBatches.group} /><primitive object={batchLayer.group} /></>
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
      <RingLayer />
      <CueFx />
      <Vfx />
    </>
  )
}

