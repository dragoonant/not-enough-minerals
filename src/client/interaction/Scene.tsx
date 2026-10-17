// In-canvas half of the interaction layer: invisible pickers over every model, glow rings for what can be clicked, the table
// plane that catches drags and clicks, and the path preview (route, range ring, engine-placed ghosts, coherency links, red
// marks, ruler label). Everything it draws is a read-out of engine answers (dry runs and queries); it decides nothing.
import { useEffect, useMemo, useRef, type ReactElement } from 'react'
import { Html, Line } from '@react-three/drei'
import { useFrame, useThree, type ThreeEvent } from '@react-three/fiber'
import type { Group, Mesh, MeshBasicMaterial } from 'three'
import { focus, queries, useBoardGeometry, useGame, usePending, usePresentedModels, usePresentedUnits } from '../contract'
import type { ModelId, PendingDecision, Vec2 } from '../../engine/types'
import { clickModel, clickPoint, clickUnit, defaultLeader, answerOption } from './actions'
import { baseRadiusIn, dist } from './geometry'
import { highlightsFor, type Highlights, type Role } from './highlights'
import { useDraftFor } from './hooks'
import { entrySegment } from './attention'
import { classify, pathPlan } from './kinds'
import { limitFor, type PathPreview } from './preview'
import { draft, useDraft } from './store'

const ROLE_COLOUR: Record<Role | 'candidate', string> = {
  ready: '#e0a03a', selected: '#59b8d6', target: '#e0503a', armed: '#ff7a5c', picked: '#f0b24a', candidate: '#59b8d6',
}
const OK = '#59d68a', BAD = '#e0503a'

/** Keep a demand canvas drawing at a gentle rate while something pulses. */
function usePulseClock(active: boolean): void {
  const invalidate = useThree((s) => s.invalidate)
  useEffect(() => {
    if (!active) return
    const t = setInterval(() => invalidate(), 70)
    return () => clearInterval(t)
  }, [active, invalidate])
}

function Ring({ x, z, y, r, colour, speed = 4, width = 0.16 }: { x: number; z: number; y: number; r: number; colour: string; speed?: number; width?: number }): ReactElement {
  const mesh = useRef<Mesh>(null)
  useFrame(({ clock }) => {
    const mat = mesh.current?.material as MeshBasicMaterial | undefined
    if (mat) mat.opacity = 0.55 + 0.4 * Math.sin(clock.elapsedTime * speed)
  })
  return (
    <mesh ref={mesh} position={[x, y + 0.05, z]} rotation={[-Math.PI / 2, 0, 0]} renderOrder={5}>
      <ringGeometry args={[r + 0.1, r + 0.1 + width, 32]} />
      <meshBasicMaterial color={colour} transparent opacity={0.8} depthWrite={false} />
    </mesh>
  )
}

/** Glow rings under every squad / model the open decision lets you click. */
function Rings({ hl }: { hl: Highlights }): ReactElement | null {
  const models = usePresentedModels()
  const speeds: Record<string, number> = { ready: 3, selected: 1.5, target: 4, armed: 7, picked: 2 }
  if (!models) return null
  const items: ReactElement[] = []
  for (const m of Object.values(models)) {
    if (m.offTable || m.life === 'dead') continue
    const role = (hl.models[m.id] as Role | 'candidate' | undefined) ?? (hl.units[m.unitId] as Role | undefined)
    if (!role) continue
    items.push(<Ring key={m.id} x={m.pos.x} z={m.pos.z} y={m.elev} r={baseRadiusIn(m.base)} colour={ROLE_COLOUR[role]} speed={speeds[role] ?? 3} width={role === 'armed' ? 0.3 : 0.16} />)
  }
  return <>{items}</>
}

// ------------------------------------------------------------------ pickers
let pointerDownAt: { x: number; y: number } | null = null

function Pickers({ pending }: { pending: PendingDecision | null }): ReactElement | null {
  const models = usePresentedModels()
  const units = usePresentedUnits()
  const gl = useThree((s) => s.gl)
  const mode = pending ? classify(pending) : 'none'
  const plan = useMemo(() => (pending ? pathPlan(pending) : null), [pending])
  if (!models || !units) return null
  const setCursorStyle = (c: string) => { gl.domElement.style.cursor = c }
  return (
    <>
      {Object.values(models).map((m) => {
        if (m.offTable || m.life === 'dead') return null
        const r = baseRadiusIn(m.base)
        const own = plan && m.unitId === plan.unitId
        return (
          <mesh
            key={m.id} position={[m.pos.x, m.elev + 0.6, m.pos.z]} name={`pick-${m.id}`}
            onPointerOver={(e: ThreeEvent<PointerEvent>) => {
              e.stopPropagation()
              if (!useDraft.getState().held) focus.hover(m.unitId)
              setCursorStyle(own || mode === 'models' || mode === 'activate' || mode === 'target' ? 'pointer' : 'default')
            }}
            onPointerOut={() => { if (!useDraft.getState().held) focus.hover(null); setCursorStyle('') }}
            onPointerDown={(e: ThreeEvent<PointerEvent>) => {
              if (e.button !== 0 || !own || !pending) return
              e.stopPropagation()
              pointerDownAt = { x: e.clientX, y: e.clientY }
              draft.pickUp(m.id)
            }}
            onClick={(e: ThreeEvent<MouseEvent>) => {
              e.stopPropagation()
              if (e.delta > 3 || !pending) return
              if (mode === 'models') { clickModel(pending, m.id); return }
              if (mode === 'path') return
              clickUnit(pending, m.unitId)
            }}
          >
            <cylinderGeometry args={[r + 0.15, r + 0.15, 1.4, 12]} />
            <meshBasicMaterial transparent opacity={0} depthWrite={false} />
          </mesh>
        )
      })}
    </>
  )
}

// ------------------------------------------------------------------ the table plane (path drags, point picks)
function Ground({ pending }: { pending: PendingDecision }): ReactElement | null {
  const { state } = useGame()
  const geo = useBoardGeometry()
  const gl = useThree((s) => s.gl)
  const mode = classify(pending)
  const plan = useMemo(() => pathPlan(pending), [pending])
  const single = pending.kind === 'deploy.path' || pending.kind === 'move.place'

  // finish a drag when the button comes up anywhere
  useEffect(() => {
    if (mode !== 'path') return
    const up = (e: PointerEvent) => {
      const s = useDraft.getState()
      if (!s.held || !pointerDownAt || !s.leaderId || !s.cursor) return
      const moved = Math.hypot(e.clientX - pointerDownAt.x, e.clientY - pointerDownAt.y)
      pointerDownAt = null
      const start = state?.models[s.leaderId]?.pos
      if (moved > 5 && start && dist(start, s.cursor) > 0.4) {
        if (single) draft.clearPath()
        draft.addWaypoint(s.cursor)
      }
    }
    window.addEventListener('pointerup', up)
    return () => window.removeEventListener('pointerup', up)
  }, [mode, state, single])

  if (!geo || (mode !== 'path' && mode !== 'point')) return null
  const w = geo.table.w + 12, d = geo.table.d + 12
  const cursorStyle = (c: string) => { gl.domElement.style.cursor = c }
  return (
    <mesh position={[0, 0.02, 0]} rotation={[-Math.PI / 2, 0, 0]} name="interaction-ground"
      onPointerMove={(e: ThreeEvent<PointerEvent>) => {
        const s = useDraft.getState()
        if (mode === 'path') {
          if (s.held) draft.setCursor({ x: e.point.x, z: e.point.z })
          cursorStyle(s.held ? 'grabbing' : 'crosshair')
        } else cursorStyle('crosshair')
      }}
      onPointerOut={() => cursorStyle('')}
      onClick={(e: ThreeEvent<MouseEvent>) => {
        if (e.delta > 3) return
        const at: Vec2 = { x: e.point.x, z: e.point.z }
        if (mode === 'point') { clickPoint(pending, at); return }
        if (!plan || !state) return
        const s = useDraft.getState()
        const unit = state.units[plan.unitId]
        const leader: ModelId | null = s.leaderId ?? defaultLeader(pending, unit?.leadingModelId ?? null, unit?.modelIds[0] ?? null)
        if (!leader) return
        if (single || s.waypoints.length === 0 && !s.held) draft.clearPath()
        draft.addWaypoint(at, leader)
      }}
    >
      <planeGeometry args={[w, d]} />
      <meshBasicMaterial transparent opacity={0} depthWrite={false} />
    </mesh>
  )
}

// ------------------------------------------------------------------ path preview
function Ghost({ x, z, y, r, colour, opacity = 0.45 }: { x: number; z: number; y: number; r: number; colour: string; opacity?: number }): ReactElement {
  return (
    <mesh position={[x, y + 0.3, z]} renderOrder={4}>
      <cylinderGeometry args={[r, r, 0.6, 16]} />
      <meshBasicMaterial color={colour} transparent opacity={opacity} depthWrite={false} />
    </mesh>
  )
}

/** Enemy squads the dry-run end point would be Engaged with (red rings) or could see (cyan; amber when the engine reports cover for us). */
function PreviewMarks({ pv }: { pv: PathPreview }): ReactElement | null {
  const models = usePresentedModels()
  if (!models) return null
  const items: ReactElement[] = []
  for (const m of Object.values(models)) {
    if (m.offTable || m.life === 'dead') continue
    if (pv.engaged.includes(m.unitId)) { items.push(<Ring key={`eng-${m.id}`} x={m.pos.x} z={m.pos.z} y={m.elev} r={baseRadiusIn(m.base)} colour="#ff5a3c" speed={6} width={0.3} />); continue }
    const s = pv.sights.find((x) => x.unitId === m.unitId)
    if (s?.sees) items.push(<Ring key={`see-${m.id}`} x={m.pos.x} z={m.pos.z} y={m.elev} r={baseRadiusIn(m.base)} colour={s.cover && s.cover !== 'none' ? '#e0a03a' : '#59b8d6'} speed={2} width={0.12} />)
  }
  return <>{items}</>
}

function PathPreviewLayer({ pending }: { pending: PendingDecision }): ReactElement | null {
  const { state } = useGame()
  const d = useDraftFor(pending.id)
  const plan = useMemo(() => pathPlan(pending), [pending])
  const limit = useMemo(() => (plan ? limitFor(pending, plan.unitId) : null), [pending, plan])
  if (!plan || !state) return null
  const unit = state.units[plan.unitId]
  const leaderId = d.leaderId ?? defaultLeader(pending, unit?.leadingModelId ?? null, unit?.modelIds[0] ?? null)
  const leader = leaderId ? state.models[leaderId] : undefined
  const onTable = !!leader && !leader.offTable && unit?.location === 'table'
  const pv = d.preview
  const route: Vec2[] = [...(onTable ? [leader!.pos] : []), ...d.waypoints, ...(d.held && d.cursor ? [d.cursor] : [])]
  const colour = pv ? (pv.ok ? OK : BAD) : '#59b8d6'
  const y = (leader?.elev ?? 0) + 0.12
  const coh = pv?.placement && pv.ok ? queries.coherencyPreview(plan.unitId, pv.placement) : null
  // Coherency lines: the engine's own link pairs (coherencyPreview.links).
  const links: [Vec2, Vec2][] = []
  if (pv?.placement && coh) {
    for (const [ia, ib] of coh.links) {
      const pa = pv.placement[ia], pb = pv.placement[ib]
      if (pa && pb) links.push([pa, pb])
    }
  }
  const over = !!pv && pv.limit !== null && pv.length > pv.limit + 1e-6
  return (
    <group name="path-preview">
      {onTable && limit !== null && limit > 0 && (
        <mesh position={[leader!.pos.x, y - 0.06, leader!.pos.z]} rotation={[-Math.PI / 2, 0, 0]} renderOrder={2}>
          <ringGeometry args={[Math.max(0, limit - 0.06), limit, 64]} />
          <meshBasicMaterial color="#59b8d6" transparent opacity={0.35} depthWrite={false} />
        </mesh>
      )}
      {route.length >= 2 && <Line points={route.map((p) => [p.x, y, p.z] as [number, number, number])} color={colour} lineWidth={3} dashed={!pv?.ok} dashSize={0.5} gapSize={0.3} />}
      {pv?.placement
        ? Object.entries(pv.placement).map(([id, p]) => {
          const m = state.models[id]!
          const bad = pv.red.includes(id)
          return <Ghost key={id} x={p.x} z={p.z} y={m.elev} r={baseRadiusIn(m.base)} colour={bad ? BAD : id === leaderId ? '#e8fff0' : OK} opacity={bad ? 0.7 : 0.4} />
        })
        : d.waypoints.length > 0 && leader && <Ghost x={route[route.length - 1]!.x} z={route[route.length - 1]!.z} y={leader.elev} r={baseRadiusIn(leader.base)} colour={BAD} opacity={0.5} />}
      {links.map(([a, b], i) => <Line key={i} points={[[a.x, y + 0.3, a.z], [b.x, y + 0.3, b.z]]} color="#ffffff" lineWidth={1.5} transparent opacity={0.55} />)}
      {pv?.ok && <PreviewMarks pv={pv} />}
      {pv?.placement && pv.red.map((id) => {
        const p = pv.placement![id]!
        return <Ring key={`red-${id}`} x={p.x} z={p.z} y={state.models[id]!.elev} r={baseRadiusIn(state.models[id]!.base)} colour={BAD} speed={8} width={0.3} />
      })}
      {pv && route.length >= 1 && (pv.limit !== null || !pv.ok) && (
        <Html position={[pv.end.x, y + 1.6, pv.end.z]} center zIndexRange={[5, 0]} style={{ pointerEvents: 'none' }}>
          <div className={`ix-ruler${over || !pv.ok ? ' bad' : ''}`} data-testid="ruler-label">
            {pv.limit !== null ? `${(Math.round(pv.length * 10) / 10).toString()}" / ${pv.limit}"` : pv.ok ? 'ok' : 'blocked'}{pv.ok && pv.engaged.length > 0 ? ` | Engaged with ${pv.engaged.length}` : ''}
          </div>
        </Html>
      )}
    </group>
  )
}

// ------------------------------------------------------------------ spots and entry edges
/** deploy.path: shade the band inside the chosen Entry Edge the Leading Model may be placed in (depth = the unit's move reach). */
function EntryBand({ pending }: { pending: PendingDecision }): ReactElement | null {
  const geo = useBoardGeometry()
  const plan = useMemo(() => pathPlan(pending), [pending])
  if (pending.kind !== 'deploy.path' || !plan || !geo) return null
  const seg = entrySegment(plan, geo, String(pending.seat))
  const depth = queries.reachOf(plan.unitId)?.move ?? null
  if (!seg || !depth) return null
  const [a, b] = seg
  const len = dist(a, b)
  const mid = { x: (a.x + b.x) / 2, z: (a.z + b.z) / 2 }
  const ang = Math.atan2(b.z - a.z, b.x - a.x)
  // push the band toward the middle of the table, away from the edge
  let nx = -(b.z - a.z) / (len || 1), nz = (b.x - a.x) / (len || 1)
  if (nx * mid.x + nz * mid.z > 0) { nx = -nx; nz = -nz }
  return (
    <mesh name="entry-band" position={[mid.x + nx * depth / 2, 0.06, mid.z + nz * depth / 2]} rotation={[-Math.PI / 2, 0, -ang]} renderOrder={2}>
      <planeGeometry args={[len, depth]} />
      <meshBasicMaterial color="#59d68a" transparent opacity={0.16} depthWrite={false} />
    </mesh>
  )
}

function PointMarkers({ hl }: { hl: Highlights }): ReactElement | null {
  if (!hl.points.length) return null
  return <>{hl.points.map((p, i) => <Ring key={i} x={p.x} z={p.z} y={0} r={0.6} colour="#59b8d6" speed={3} width={0.2} />)}</>
}

function EntryStrips({ pending, hl }: { pending: PendingDecision; hl: Highlights }): ReactElement | null {
  const geo = useBoardGeometry()
  const gl = useThree((s) => s.gl)
  if (!geo || pending.kind !== 'deploy.entry') return null
  const edge = geo.edges.find((e) => e.seat === pending.seat) ?? geo.edges[0]
  if (!edge) return null
  const items: ReactElement[] = []
  for (const o of pending.options) {
    const en = o.action['entry'] as { kind?: string; segment?: number | string } | undefined
    if (!en || en.kind !== 'edge' || typeof en.segment !== 'number') continue
    const seg = edge.segments[en.segment]
    if (!seg) continue
    const [a, b] = seg
    const len = dist(a, b)
    const hot = hl.entry?.kind === 'edge' && hl.entry.segment === en.segment
    const ang = Math.atan2(b.z - a.z, b.x - a.x)
    items.push(
      <mesh key={o.id} position={[(a.x + b.x) / 2, 0.08, (a.z + b.z) / 2]} rotation={[-Math.PI / 2, 0, -ang]} renderOrder={3}
        onPointerOver={(e: ThreeEvent<PointerEvent>) => { e.stopPropagation(); draft.hoverOption(o.id); gl.domElement.style.cursor = 'pointer' }}
        onPointerOut={() => { draft.hoverOption(null); gl.domElement.style.cursor = '' }}
        onClick={(e: ThreeEvent<MouseEvent>) => { e.stopPropagation(); answerOption(o) }}>
        <planeGeometry args={[len, 2.4]} />
        <meshBasicMaterial color={hot ? '#ffd27a' : '#e0a03a'} transparent opacity={hot ? 0.6 : 0.28} depthWrite={false} />
      </mesh>,
    )
  }
  return <>{items}</>
}

// ------------------------------------------------------------------ root
export function InteractionScene(): ReactElement | null {
  const pending = usePending()
  const d = useDraftFor(pending?.id ?? null)
  const hl = useMemo(() => highlightsFor(pending, d), [pending, d.menuUnit, d.weaponId, d.armed, d.picked, d.hoverOption])
  const invalidate = useThree((s) => s.invalidate)
  const groupRef = useRef<Group>(null)
  const active = Object.keys(hl.units).length + Object.keys(hl.models).length + hl.points.length > 0
  usePulseClock(active)
  useEffect(() => { invalidate() }, [d, hl, invalidate])
  return (
    <group ref={groupRef} name="interaction-scene">
      <Pickers pending={pending} />
      <Rings hl={hl} />
      <PointMarkers hl={hl} />
      {pending && <Ground pending={pending} />}
      {pending && classify(pending) === 'path' && <PathPreviewLayer pending={pending} />}
      {pending && <EntryStrips pending={pending} hl={hl} />}
      {pending && <EntryBand pending={pending} />}
    </group>
  )
}

