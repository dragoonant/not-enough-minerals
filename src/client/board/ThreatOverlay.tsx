// Threat and detection overlays (spec 50 s5). Threat (key T): for every enemy unit on the table, its Move reach and its
// maximum Charge reach, from query.reachOf via useReachOf (never computed here), drawn as discs around each model so the
// shape follows the squad. Detection (overlay on, or a HIDDEN / BURROWED unit is in play): the stored 6" style detector
// areas from query.detectorAreas (stored areas plus the self-centred detectors of passive abilities, resolved by the engine).
import { useMemo } from 'react'
import { useDetectorAreas, useFocus, usePresented, useReachOf, useViewerSeat } from '../contract'
import type { GameState, UnitId } from '../../engine/types'
import { SIDE_HEX } from './sideColours'

const MM = 25.4
const THREAT_MOVE = '#e0a03a', THREAT_CHARGE = '#d2542c', DETECT = '#59b8d6'

const concealed = (state: GameState, unitId: UnitId): boolean =>
  !!state.units[unitId]?.effects.some((e) => e.kind === 'status' && (e.status === 'HIDDEN' || e.status === 'BURROWED'))

function Disc({ x, z, y, r, color, fill, edge }: { x: number; z: number; y: number; r: number; color: string; fill: number; edge: number }) {
  return (
    <group position={[x, y + 0.04, z]} rotation={[-Math.PI / 2, 0, 0]}>
      <mesh><circleGeometry args={[r, 48]} /><meshBasicMaterial color={color} transparent opacity={fill} depthWrite={false} /></mesh>
      <mesh position={[0, 0, 0.005]}><ringGeometry args={[Math.max(0, r - 0.1), r, 64]} /><meshBasicMaterial color={color} transparent opacity={edge} depthWrite={false} /></mesh>
    </group>
  )
}

function UnitReach({ unitId }: { unitId: UnitId }) {
  const reach = useReachOf(unitId)
  const state = usePresented()
  const models = useMemo(() => (state ? Object.values(state.models).filter((m) => m.unitId === unitId && !m.offTable && m.life !== 'dead') : []), [state, unitId])
  if (!reach) return null
  return (
    <group name={`threat-${unitId}`}>
      {models.map((m) => {
        const br = m.base / MM / 2
        return (
          <group key={m.id}>
            {reach.chargeMax !== null && <Disc x={m.pos.x} z={m.pos.z} y={m.elev} r={br + reach.chargeMax} color={THREAT_CHARGE} fill={0.025} edge={0.35} />}
            {reach.move !== null && <Disc x={m.pos.x} z={m.pos.z} y={m.elev + 0.01} r={br + reach.move} color={THREAT_MOVE} fill={0.04} edge={0.55} />}
          </group>
        )
      })}
    </group>
  )
}

export function ThreatOverlay() {
  const on = useFocus((f) => f.overlays.threat)
  const detOn = useFocus((f) => f.overlays.detection)
  const state = usePresented()
  const viewer = useViewerSeat()
  const detectors = useDetectorAreas()
  if (!state) return null
  const enemies = Object.values(state.units).filter((u) => u.location === 'table' && u.owner !== viewer && !concealed(state, u.id))
  const anyConcealed = Object.values(state.units).some((u) => u.location === 'table' && concealed(state, u.id))
  const showDetect = detOn || anyConcealed
  return (
    <group name="overlays-threat">
      {on && enemies.map((u) => <UnitReach key={u.id} unitId={u.id} />)}
      {showDetect && detectors?.flatMap((a) => a.centres.map((c, i) => (
        <Disc key={`${a.id}:${i}`} x={c.x} z={c.z} y={0} r={a.radius} color={a.owner === viewer ? DETECT : SIDE_HEX.neutral} fill={0.05} edge={0.6} />
      )))}
    </group>
  )
}
