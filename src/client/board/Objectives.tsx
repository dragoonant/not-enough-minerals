// Mission Markers and their control-zone rings (spec 50 s5). The ring radius is the engine constant (contest range from
// the marker edge + marker radius, via useBoardGeometry); colour is the controller's side colour, grey when nobody holds
// it, and it pulses while the contest totals show more than one seat present. The label (number, holder, totals) is DOM,
// see Labels.tsx.
// Removed or claimed markers sit as dimmed tokens beside the table.
import { useRef } from 'react'
import { useFrame, useThree } from '@react-three/fiber'
import type { Mesh, MeshBasicMaterial } from 'three'
import { useBoardGeometry, useFocus, useObjectiveStatus, usePresented, usePresentedMarkers } from '../contract'
import type { MarkerState, SeatId } from '../../engine/types'
import { NEUTRAL_RING, parkedPos } from './Labels'
import { SIDE_HEX, sideHex } from './sideColours'

function RingPulse({ radius, color, pulsing }: { radius: number; color: string; pulsing: boolean }) {
  const fill = useRef<Mesh>(null)
  const edge = useRef<Mesh>(null)
  const invalidate = useThree((s) => s.invalidate)
  const last = useRef(0)
  useFrame(({ clock }) => {
    if (!pulsing) return
    const t = clock.elapsedTime
    const k = 0.5 + 0.5 * Math.sin(t * 5)
    ;(edge.current?.material as MeshBasicMaterial | undefined)?.setValues({ opacity: 0.45 + 0.5 * k })
    ;(fill.current?.material as MeshBasicMaterial | undefined)?.setValues({ opacity: 0.06 + 0.16 * k })
    if (t - last.current > 0.05) { last.current = t; invalidate() }
  })
  return (
    <group position={[0, 0.03, 0]}>
      <mesh ref={fill} rotation={[-Math.PI / 2, 0, 0]} name="ring-fill">
        <circleGeometry args={[radius, 64]} />
        <meshBasicMaterial color={color} transparent opacity={0.1} depthWrite={false} />
      </mesh>
      <mesh ref={edge} rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.01, 0]} name="ring-edge">
        <ringGeometry args={[radius - 0.14, radius, 96]} />
        <meshBasicMaterial color={color} transparent opacity={0.85} depthWrite={false} />
      </mesh>
    </group>
  )
}

function Token({ m, radius, dim }: { m: MarkerState; radius: number; dim?: boolean }) {
  const c = sideHex(m.side)
  return (
    <group>
      <mesh position={[0, 0.09, 0]} castShadow receiveShadow>
        <cylinderGeometry args={[radius, radius * 1.05, 0.18, 28]} />
        <meshStandardMaterial color={c} roughness={0.45} metalness={0.3} transparent={dim} opacity={dim ? 0.45 : 1} />
      </mesh>
      <mesh position={[0, 0.2, 0]}>
        <cylinderGeometry args={[radius * 0.55, radius * 0.55, 0.05, 20]} />
        <meshStandardMaterial color="#0f141b" roughness={0.6} transparent={dim} opacity={dim ? 0.45 : 1} />
      </mesh>
    </group>
  )
}

export function Objectives() {
  const geo = useBoardGeometry()
  const state = usePresented()
  const markers = usePresentedMarkers()
  const status = useObjectiveStatus()
  const showRings = useFocus((f) => f.overlays.rings)
  if (!geo || !state) return null
  const { radius: ringR, markerRadius } = geo.ring
  const seatColour = (s: SeatId | null) => (s ? state.seats[s]?.colour ?? null : null)
  let parked = 0
  return (
    <group name="objectives">
      {markers.map((m) => {
        if (!m.onTable) {
          const i = parked++
          const [x, , z] = parkedPos(i, geo.table)
          return (
            <group key={m.n} position={[x, 0, z]} name={`marker-${m.n}-off`}>
              <Token m={m} radius={markerRadius} dim />
            </group>
          )
        }
        const st = status?.find((s) => s.n === m.n)
        const present = st ? state.seatOrder.filter((s) => (st.totals[s] ?? 0) > 0) : []
        const contested = present.length > 1
        const ctrl = st ? st.controller : m.controller
        const ringColour = ctrl ? sideHex(seatColour(ctrl)) : NEUTRAL_RING
        return (
          <group key={m.n} position={[m.pos.x, m.elev, m.pos.z]} name={`marker-${m.n}`}>
            <Token m={m} radius={markerRadius} />
            {showRings && <RingPulse radius={ringR} color={ringColour} pulsing={contested} />}
          </group>
        )
      })}
    </group>
  )
}
