// Small transient effects driven by presentation cues: a tracer for each attack, a dashed charge line, a ring flash where a
// Mission Marker changes hands and where a unit arrives. Purely cosmetic; fades by wall-clock time and stops invalidating
// when nothing is left.
import { useEffect, useRef, useState } from 'react'
import { useFrame, useThree } from '@react-three/fiber'
import { Group, Mesh, MeshBasicMaterial, Vector3 } from 'three'
import { onCue, usePresented, type Cue } from '../contract'
import type { GameState, ModelId } from '../../engine/types'

interface Fx { id: number; kind: 'line' | 'ring'; a: Vector3; b?: Vector3; color: string; t0: number; dur: number; r?: number }
let nextId = 1

const posOf = (s: GameState | null, id: ModelId | null | undefined): Vector3 | null => {
  const m = id ? s?.models[id] : undefined
  return m ? new Vector3(m.pos.x, m.elev + 0.7, m.pos.z) : null
}
const leadOf = (s: GameState | null, unitId: string | null | undefined): Vector3 | null => {
  const u = unitId ? s?.units[unitId] : undefined
  return u ? posOf(s, u.leadingModelId ?? u.modelIds.find((m) => s?.models[m]?.life !== 'dead')) : null
}

function Line({ fx }: { fx: Fx }) {
  const len = fx.a.distanceTo(fx.b!)
  const mid = fx.a.clone().add(fx.b!).multiplyScalar(0.5)
  const ang = Math.atan2(fx.b!.x - fx.a.x, fx.b!.z - fx.a.z)
  const pitch = -Math.asin((fx.b!.y - fx.a.y) / Math.max(len, 1e-6))
  return (
    <mesh position={mid} rotation={[pitch, ang, 0]} name={`fx-${fx.id}`} userData={{ t0: fx.t0, dur: fx.dur }}>
      <boxGeometry args={[0.07, 0.07, len]} />
      <meshBasicMaterial color={fx.color} transparent opacity={0.9} depthWrite={false} />
    </mesh>
  )
}
function Ring({ fx }: { fx: Fx }) {
  return (
    <mesh position={[fx.a.x, 0.06, fx.a.z]} rotation={[-Math.PI / 2, 0, 0]} name={`fx-${fx.id}`} userData={{ t0: fx.t0, dur: fx.dur, ring: fx.r ?? 2 }}>
      <ringGeometry args={[0.85, 1, 48]} />
      <meshBasicMaterial color={fx.color} transparent opacity={0.9} depthWrite={false} />
    </mesh>
  )
}

export function CueFx() {
  const presented = usePresented()
  const stateRef = useRef<GameState | null>(null)
  stateRef.current = presented
  const root = useRef<Group>(null)
  const list = useRef<Fx[]>([])
  const invalidate = useThree((s) => s.invalidate)
  const [, setVersion] = useState(0)

  useEffect(() => onCue((cue: Cue) => {
    const s = stateRef.current
    const now = performance.now()
    const add = (fx: Omit<Fx, 'id' | 't0'>) => { list.current.push({ ...fx, id: nextId++, t0: now }); setVersion((v) => v + 1); invalidate() }
    if (cue.kind === 'attack') {
      const a = posOf(s, cue.attackerId), b = posOf(s, cue.targetId)
      if (a && b) add({ kind: 'line', a, b, color: '#ffd166', dur: 420 })
    } else if (cue.kind === 'charge' && (cue.stage === 'declared' || cue.stage === 'succeeded')) {
      const a = leadOf(s, cue.unitId), b = leadOf(s, cue.targets[0])
      if (a && b) add({ kind: 'line', a, b, color: cue.stage === 'declared' ? '#e0a03a' : '#ff7a5c', dur: 600 })
    } else if (cue.kind === 'marker' && s) {
      const mk = s.markers.find((m) => m.n === cue.n)
      if (mk) add({ kind: 'ring', a: new Vector3(mk.pos.x, mk.elev, mk.pos.z), color: '#ffffff', dur: 800, r: 4 })
    } else if (cue.kind === 'arrival' && cue.stage === 'arrived') {
      const a = leadOf(s, cue.unitId)
      if (a) add({ kind: 'ring', a, color: '#59b8d6', dur: 700, r: 3 })
    }
  }), [invalidate])

  useFrame(() => {
    const now = performance.now()
    const before = list.current.length
    list.current = list.current.filter((f) => now - f.t0 < f.dur)
    root.current?.children.forEach((c) => {
      const t0 = c.userData['t0'] as number | undefined
      const dur = c.userData['dur'] as number | undefined
      if (t0 === undefined || dur === undefined) return
      const k = Math.min(1, (now - t0) / dur)
      const mat = (c as Mesh).material as MeshBasicMaterial
      mat.opacity = 0.9 * (1 - k)
      const ring = c.userData['ring'] as number | undefined
      if (ring) c.scale.setScalar(0.5 + k * ring)
    })
    if (list.current.length) invalidate()
    if (list.current.length !== before) setVersion((v) => v + 1)
  })

  return <group ref={root}>{list.current.map((fx) => (fx.kind === 'line' ? <Line key={fx.id} fx={fx} /> : <Ring key={fx.id} fx={fx} />))}</group>
}

