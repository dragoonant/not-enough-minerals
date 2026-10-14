// Battlefield effects layer. Mount ONE <Vfx/> inside the board Canvas. It renders two pooled additive/normal Points layers and
// listens to presentation cues (onCue) and the presented state's conditions; it never reads true engine state. The effects level
// (full / reduced / off) comes from vfxStore. Demand frameloop friendly: it only invalidates while something is alive.
import { useEffect, useMemo, useRef } from 'react'
import { useFrame, useThree } from '@react-three/fiber'
import { AdditiveBlending, BufferAttribute, BufferGeometry, NormalBlending, PerspectiveCamera, Points, ShaderMaterial } from 'three'
import { data, onCue, usePresented, type Cue } from '../contract'
import { usePresentedStore } from '../presentation/presentedStore'
import { useSettingsStore } from '../store/settingsStore'
import { readParams } from '../params'
import { weaponFlavour } from '../weaponFlavour'
import { VfxEngine } from './engine'
import type { ParticlePool } from './pool'
import type { Faction } from './recipes'
import { useEffectsLevel } from './vfxStore'
import type { GameState, ModelId } from '../../engine/types'

const VERT = /* glsl */ `
attribute vec4 aColor; attribute float aSize; uniform float uScale; varying vec4 vColor;
void main() {
  vColor = aColor;
  vec4 mv = modelViewMatrix * vec4(position, 1.0);
  gl_PointSize = aSize <= 0.0 ? 0.0 : max(1.0, aSize * uScale / max(0.1, -mv.z));
  gl_Position = projectionMatrix * mv;
}`
const FRAG = /* glsl */ `
varying vec4 vColor;
void main() {
  float d = length(gl_PointCoord - 0.5) * 2.0;
  if (d > 1.0 || vColor.a <= 0.002) discard;
  float a = vColor.a * (1.0 - d * d);
  gl_FragColor = vec4(vColor.rgb, a);
}`

function makeLayer(pool: ParticlePool, additive: boolean): { points: Points; mat: ShaderMaterial } {
  const g = new BufferGeometry()
  g.setAttribute('position', new BufferAttribute(pool.pos, 3).setUsage(35048))
  g.setAttribute('aColor', new BufferAttribute(pool.col, 4).setUsage(35048))
  g.setAttribute('aSize', new BufferAttribute(pool.size, 1).setUsage(35048))
  const mat = new ShaderMaterial({
    vertexShader: VERT, fragmentShader: FRAG, uniforms: { uScale: { value: 600 } },
    transparent: true, depthWrite: false, blending: additive ? AdditiveBlending : NormalBlending,
  })
  const points = new Points(g, mat)
  points.frustumCulled = false
  points.renderOrder = 20
  points.name = additive ? 'vfx-glow' : 'vfx-soft'
  return { points, mat }
}

/** Sprites read at table distance: recipe sizes are true inches, drawn this much larger so a tracer reads at overview zoom. */
const SIZE_BOOST = 1.7

type Layers = Record<'glow' | 'soft', { points: Points; mat: ShaderMaterial }>
function markDirty(layers: Layers): void {
  for (const l of [layers.glow, layers.soft]) {
    const g = l.points.geometry
    ;(g.getAttribute('position') as BufferAttribute).needsUpdate = true
    ;(g.getAttribute('aColor') as BufferAttribute).needsUpdate = true
    ;(g.getAttribute('aSize') as BufferAttribute).needsUpdate = true
  }
}
interface VfxTestHook {
  engine: VfxEngine; last: string; at: number; times: Record<string, number>
  cue(c: Cue): void; hold(on: boolean): void; step(dt: number, n: number): void
  /** Freeze the simulation `steps` 60 Hz steps after the next cue of this kind (repeatable mid-effect screenshots). */
  autoHold: { kind: string; steps: number } | null
}

const raceCache = new Map<string, Faction>()
function factionOf(s: GameState | null, modelId: ModelId | undefined | null): Faction {
  const m = modelId ? s?.models[modelId] : undefined
  if (!m) return 'terran'
  let f = raceCache.get(m.profileId)
  if (!f) {
    const race = data.unit(m.profileId)?.race
    f = race === 'zerg' || race === 'protoss' ? race : 'terran'
    if (race) raceCache.set(m.profileId, f)
  }
  return f
}
const unitFaction = (s: GameState | null, unitId: string | undefined | null): Faction => {
  const u = unitId ? s?.units[unitId] : undefined
  return factionOf(s, u?.modelIds[0])
}
const leadOf = (s: GameState | null, unitId: string | null | undefined): ModelId | undefined => {
  const u = unitId ? s?.units[unitId] : undefined
  return u ? u.leadingModelId ?? u.modelIds.find((m) => s?.models[m]?.life !== 'dead') : undefined
}

export function Vfx() {
  const level = useEffectsLevel()
  const presented = usePresented()
  const stateRef = useRef<GameState | null>(null)
  stateRef.current = presented
  const invalidate = useThree((s) => s.invalidate)
  const getThree = useThree((s) => s.get)
  const engine = useMemo(() => new VfxEngine(), [])
  const layers = useMemo(() => ({ glow: makeLayer(engine.glow, true), soft: makeLayer(engine.soft, false) }), [engine])
  const hidden = useRef<Set<ModelId>>(new Set())
  const charging = useRef<Map<string, number>>(new Map())
  const cloakAcc = useRef(0)

  useEffect(() => { engine.setLevel(level); invalidate() }, [engine, level, invalidate])
  // ?test=1: e2e screenshots read the live particle count and the time of the last cue per kind, can replay a cue through
  // the same handler, and can hold the simulation and step it by hand so a mid-flight frame is repeatable.
  const handleRef = useRef<((cue: Cue) => void) | null>(null)
  const hold = useRef(false)
  useEffect(() => {
    if (!readParams().test) return
    const w = window as unknown as { __vfx?: VfxTestHook }
    w.__vfx = {
      engine, last: '', at: 0, times: {}, autoHold: null,
      cue: (c) => handleRef.current?.(c),
      hold: (on) => { hold.current = on; invalidate() },
      step: (dt, n) => { for (let i = 0; i < n; i++) engine.update(dt); markDirty(layers); invalidate() },
    }
    return () => { delete w.__vfx }
  }, [engine, layers, invalidate])

  /** Test hook: note an effect kind and freeze the simulation if a screenshot asked for it. */
  const holdHook = useMemo(() => (kind: string): void => {
    const hook = typeof window !== 'undefined' ? (window as unknown as { __vfx?: VfxTestHook }).__vfx : undefined
    if (!hook) return
    hook.last = kind; hook.at = performance.now(); hook.times[kind] = hook.at
    if (hook.autoHold?.kind !== kind) return
    const n = hook.autoHold.steps
    hook.autoHold = null
    hold.current = true
    for (let i = 0; i < n; i++) engine.update(1 / 60)
    markDirty(layers)
  }, [engine, layers])

  // Cue-driven effects.
  useEffect(() => {
  const handle = (cue: Cue): void => {
    if (engine.level === 'off') return
    const s = stateRef.current
    const sp = useSettingsStore.getState().speed
    // Instant speed skips every animation, so it skips the effects too (and the frames they would cost).
    if (sp <= 0) return
    engine.timeScale = Math.min(2, Math.max(0.35, 1 / sp))
    const cp = getThree().camera.position
    engine.setCamera(cp.x, cp.y, cp.z)
    const at = (id: ModelId | undefined | null, dy = 0.7) => { const m = id ? s?.models[id] : undefined; return m ? { x: m.pos.x, y: m.elev + dy, z: m.pos.z } : null }
    switch (cue.kind) {
      case 'attack': {
        const a = at(cue.attackerId), b = at(cue.targetId)
        if (a && b) engine.attack(weaponFlavour(cue.weaponId, cue.ns), a.x, a.y, a.z, b.x, b.y, b.z, factionOf(s, cue.targetId))
        break
      }
      case 'attackStage': {
        if (cue.data.step !== 'damage' || cue.data.total <= 0) break
        const id = leadOf(s, cue.targetUnitId), p = at(id)
        const shielded = !!(cue.targetUnitId && s?.units[cue.targetUnitId]?.shielded)
        if (p) engine.damage(p.x, p.y, p.z, factionOf(s, id), cue.data.total, shielded)
        break
      }
      case 'casualties': {
        let i = 0
        for (const id of cue.modelIds) {
          const p = at(id, 0.1)
          if (p) engine.death(p.x, p.y, p.z, factionOf(s, id), (i++ * 0.07) * engine.timeScale)
          if (i >= 14) break
        }
        break
      }
      // Arrivals come from the presented state (models leaving offTable), see below: most arrivals raise no 'arrived' cue.
      case 'charge': {
        if (cue.stage === 'declared' || cue.stage === 'succeeded') charging.current.set(cue.unitId, performance.now())
        else if (cue.stage === 'failed' || cue.stage === 'impact') charging.current.delete(cue.unitId)
        break
      }
      case 'move': {
        const t = cue.unitId ? charging.current.get(cue.unitId) : undefined
        if (t === undefined || performance.now() - t > 8000 || cue.points.length < 2) break
        const m = s?.models[cue.modelId]
        let len = 0
        for (let i = 1; i < cue.points.length; i++) len += Math.hypot(cue.points[i]!.x - cue.points[i - 1]!.x, cue.points[i]!.z - cue.points[i - 1]!.z)
        const sec = Math.min(1.6, 0.42 + 0.07 * len) * engine.timeScale
        engine.chargeTrail(cue.points, (m?.elev ?? 0) + 0.1, sec)
        break
      }
      case 'marker': {
        if (cue.change !== 'control' && cue.change !== 'claimed') break
        const mk = s?.markers.find((m) => m.n === cue.n)
        if (!mk) break
        const seats = s ? Object.keys(s.seats) : []
        engine.capture(mk.pos.x, mk.elev, mk.pos.z, cue.to ? Math.max(0, seats.indexOf(cue.to)) : 0)
        break
      }
      default: break
    }
    holdHook(cue.kind)
    invalidate()
  }
  handleRef.current = handle
  return onCue(handle)
  }, [engine, getThree, holdHook, invalidate])

  // Burrow / unburrow and the HIDDEN set come from condition changes in the presented state.
  useEffect(() => {
    let prev: GameState['models'] | null = null
    const check = (st: GameState | null) => {
      const models = st?.models ?? null
      if (models && prev && models !== prev && engine.level !== 'off' && useSettingsStore.getState().speed > 0) {
        for (const id in models) {
          const m = models[id]!, o = prev[id]
          if (!o || m.life === 'dead') continue
          const was = o.conditions.includes('burrowed'), now = m.conditions.includes('burrowed')
          if (was !== now) engine.burrow(m.pos.x, m.elev, m.pos.z, !now)
        }
        // Arrival: models that were off the table (Reserves) and now stand on it, staggered per unit.
        const perUnit = new Map<string, number>()
        for (const id in models) {
          const m = models[id]!, o = prev[id]
          if (!o || !o.offTable || m.offTable || m.life === 'dead') continue
          const i = perUnit.get(m.unitId) ?? 0
          perUnit.set(m.unitId, i + 1)
          if (i < 12) engine.arrival(m.pos.x, m.elev + 0.1, m.pos.z, factionOf(st, id), i * 0.08 * engine.timeScale)
        }
        if (perUnit.size) holdHook('arrival')
        invalidate()
      }
      prev = models
      const set = hidden.current
      set.clear()
      if (models) for (const id in models) { const m = models[id]!; if (m.life !== 'dead' && !m.offTable && m.conditions.includes('hidden') && !m.conditions.includes('burrowed')) set.add(id) }
    }
    check(usePresentedStore.getState().state)
    return usePresentedStore.subscribe((st) => check(st.state))
  }, [engine, holdHook, invalidate])

  // Keep a slow heartbeat while a cloaked model is on the table (full level only).
  useEffect(() => {
    if (level !== 'full') return
    const h = setInterval(() => {
      if (hidden.current.size && useSettingsStore.getState().speed > 0 && !(typeof document !== 'undefined' && document.hidden)) invalidate()
    }, 66)
    return () => clearInterval(h)
  }, [level, invalidate])

  useFrame((state, delta) => {
    if (engine.level === 'off') return
    const cam = state.camera as PerspectiveCamera
    engine.setCamera(cam.position.x, cam.position.y, cam.position.z)
    const scale = SIZE_BOOST * (cam.isPerspectiveCamera ? (state.size.height * state.viewport.dpr) / (2 * Math.tan((cam.fov * Math.PI) / 360)) : 600)
    layers.glow.mat.uniforms['uScale']!.value = scale
    layers.soft.mat.uniforms['uScale']!.value = scale
    if (hidden.current.size && engine.level === 'full') {
      cloakAcc.current += delta
      if (cloakAcc.current > 0.07) {
        cloakAcc.current = 0
        const st = stateRef.current
        let n = 0
        for (const id of hidden.current) { const m = st?.models[id]; if (m) engine.cloak(m.pos.x, m.elev, m.pos.z); if (++n >= 24) break }
      }
    }
    if (hold.current) return
    const was = engine.active
    engine.update(delta)
    if (was || engine.active) markDirty(layers)
    if (engine.active) invalidate()
  })

  if (level === 'off') return null
  return (
    <group name="vfx">
      <primitive object={layers.soft.points} />
      <primitive object={layers.glow.points} />
    </group>
  )
}
