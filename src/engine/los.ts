// Checklist: LOS (LOS-001..008), COV (COV-001..061), SIZE (SIZE-001..004), MEAS-004, FLY-003. Owner M.
// los.ts: Line of Sight and Cover per spec 14 s6-7. Pure geometry; the HIDDEN 4" filter and detectors are visibility.ts.
// A trace is a straight line from any part of A's base to any part of B's base. Each terrain piece is judged alone:
// Full Cover (its Effective Size is at least that of both models), Direct Cover (a model Within 1" of it and the piece at
// least that model's Effective Size), the Elevation Dead Zone, and the Close Quarters exemption. Models never block.
import type { EditionBundle } from '../data/types'
import { rule } from './edition'
import { baseRadius, dist, isOnTable } from './geometry'
import { modelDistance } from './measure'
import { isFlyingModel, modelSize, tableModels, unitModels } from './squads'
import { baseToPiece, levelOfBase, scPieces, segmentCrosses, surfaceAt, type ScPiece } from './terrain'
import type { GameState, Id, LosReason, LosVerdict, ModelState, Vec2 } from './types'

export interface LosOptions {
  /** Data bundle, for model Size, Flying and BURROWED. Without it a model adds no Size of its own and counts as Ground. */
  bundle?: EditionBundle
  /** Weapon range; sets verdict.inRange (LoS itself ignores range). */
  range?: number
  /** Kept for callers of the base-project signature; models never block LoS in this game (LOS-008). */
  skipModel?: (m: ModelState) => boolean
  ignoreModels?: boolean
  ignoreClouds?: boolean
  ignoreForest?: boolean
}

export type LosCover = 'none' | 'direct' | 'full' | 'deadZone'

/** The verdict plus what the LOS view needs to draw the answer. */
export interface LosReport extends LosVerdict {
  /** What stopped the trace when it did not pass (none when visible). */
  cover: LosCover
  line: { from: Vec2; to: Vec2 } | null
  terrainBlockers: Id[]
  /** Short sentence for the UI, in our own words. */
  why: string
}

/** One end of a trace: a model, or a Mission Marker (Size 0, LOS-007). */
export interface Actor {
  id: Id
  pos: Vec2
  r: number
  /** Effective Size: Size plus the Effective Size of the piece stood on; Infinity for Flying (SIZE-003). */
  es: number
  flying: boolean
  surface: ScPiece | null
  level: 0 | 1 | 2
}

/** Size added by a model whose Size cannot be read (no bundle, or a model with no unit record). It adds nothing to Effective
 *  Size, like a Mission Marker (LOS-007); the engine never invents a printed Size. */
const UNREADABLE_SIZE = 0

export function modelActor(state: GameState, bundle: EditionBundle | undefined, m: ModelState): Actor {
  const flying = bundle ? isFlyingModel(bundle, m) : false
  const size = (bundle ? modelSize(state, bundle, m) : null) ?? UNREADABLE_SIZE
  const r = baseRadius(m.base)
  const surface = flying ? null : surfaceAt(state, m.pos)
  return {
    id: m.id, pos: m.pos, r, flying, surface, level: flying ? 0 : levelOfBase(state, m.pos, r),
    es: flying ? Infinity : size + (surface?.es ?? 0),
  }
}
export function markerActor(state: GameState, bundle: EditionBundle, n: number): Actor | null {
  const mk = state.markers.find((x) => x.n === n)
  if (!mk) return null
  const r = baseRadius(rule(bundle, 'markerDiameterMm'))
  const surface = surfaceAt(state, mk.pos)
  return { id: `marker:${n}`, pos: mk.pos, r, flying: false, surface, level: levelOfBase(state, mk.pos, r), es: surface?.es ?? 0 }
}

const K = 16
function rim(a: Actor): Vec2[] {
  const out: Vec2[] = [a.pos]
  for (let i = 0; i < K; i++) {
    const ang = (i / K) * 2 * Math.PI
    out.push({ x: a.pos.x + Math.cos(ang) * a.r, z: a.pos.z + Math.sin(ang) * a.r })
  }
  return out
}

interface Qualified { piece: ScPiece; kind: 'full' | 'direct' | 'deadZone' }

/** Pieces that qualify as Cover against this pair (spec 14 s6 engine notes, steps 2-3). */
function qualifying(state: GameState, A: Actor, B: Actor): Qualified[] {
  const out: Qualified[] = []
  const between = Math.max(0, dist(A.pos, B.pos) - A.r - B.r)
  const stands = (p: ScPiece, x: Actor): boolean => !!x.surface && (x.surface === p || x.surface.below.includes(p.t.id))
  for (const p of scPieces(state)) {
    const aNear = baseToPiece(p, A.pos, A.r) <= 1 + 1e-9
    const bNear = baseToPiece(p, B.pos, B.r) <= 1 + 1e-9
    const closeQuarters = aNear && bNear && between <= 3 + 1e-9 // COV-040: Direct Cover and the Dead Zone of this piece off
    // Elevation Dead Zone (COV-030): one model on HIGH GROUND of this piece, the other at GROUND LEVEL Within 1" of it
    const deadFor = (hi: Actor, lo: Actor, loNear: boolean): boolean =>
      !hi.flying && hi.surface === p && hi.level === 2 && lo.level === 0 && loNear
    if (!closeQuarters && (deadFor(A, B, bNear) || deadFor(B, A, aNear))) { out.push({ piece: p, kind: 'deadZone' }); continue }
    if (p.es < 1 || stands(p, A) || stands(p, B)) continue // the surface a model stands on never blocks (LOS-005)
    if (p.es >= A.es && p.es >= B.es) { out.push({ piece: p, kind: 'full' }); continue } // COV-010 (never for Flying: ES Infinity)
    if (closeQuarters) continue
    if ((aNear && p.es >= A.es) || (bNear && p.es >= B.es)) out.push({ piece: p, kind: 'direct' }) // COV-020/021
  }
  return out
}

function traces(A: Actor, B: Actor): [Vec2, Vec2][] {
  const out: [Vec2, Vec2][] = [[A.pos, B.pos]]
  const d = dist(A.pos, B.pos)
  if (d > 1e-9) {
    const nx = -(B.pos.z - A.pos.z) / d, nz = (B.pos.x - A.pos.x) / d
    for (const s of [1, -1]) out.push([{ x: A.pos.x + nx * A.r * s, z: A.pos.z + nz * A.r * s }, { x: B.pos.x + nx * B.r * s, z: B.pos.z + nz * B.r * s }])
  }
  const pa = rim(A), pb = rim(B)
  for (const a of pa) for (const b of pb) out.push([a, b])
  return out
}

/** Core trace between two actors. */
export function traceBetween(state: GameState, A: Actor, B: Actor): { visible: boolean; cover: LosCover; blockers: Id[]; line: [Vec2, Vec2] | null } {
  const set = qualifying(state, A, B)
  if (!set.length) return { visible: true, cover: 'none', blockers: [], line: [A.pos, B.pos] }
  // a Dead Zone blocks outright, whatever the trace
  const dead = set.find((q) => q.kind === 'deadZone')
  if (dead) return { visible: false, cover: 'deadZone', blockers: [dead.piece.t.id], line: [A.pos, B.pos] }
  for (const [s, t] of traces(A, B)) {
    if (!set.some((q) => segmentCrosses(q.piece, s, t))) return { visible: true, cover: 'none', blockers: [], line: [s, t] }
  }
  const crossed = set.filter((q) => segmentCrosses(q.piece, A.pos, B.pos))
  const used = crossed.length ? crossed : set
  return { visible: false, cover: used.some((q) => q.kind === 'full') ? 'full' : 'direct', blockers: used.map((q) => q.piece.t.id), line: [A.pos, B.pos] }
}

function sentence(visible: boolean, cover: LosCover, reasons: LosReason[]): string {
  if (reasons.includes('self')) return 'A model cannot see itself.'
  if (reasons.includes('outOfTable')) return 'One of the models is not on the table.'
  if (visible) return 'Clear line of sight.'
  if (cover === 'deadZone') return 'Blocked: the high ground hides the foot of its own wall.'
  if (cover === 'full') return 'Blocked: a piece of terrain is as tall as both models.'
  return 'Blocked: terrain next to a model is as tall as that model.'
}

const verdictOf = (visible: boolean, reasons: LosReason[], d: number, range: number | undefined, extra: Partial<LosReport> = {}): LosReport => ({
  visible, reasons, blockers: [], inRange: range === undefined || d <= range + 1e-6, distance: d, cover: 'none', line: null,
  terrainBlockers: [], why: sentence(visible, extra.cover ?? 'none', reasons), ...extra,
})

/** Full LOS report from one model to another (spec 14 s6). */
export function losReport(state: GameState, originId: Id, targetId: Id, opts: LosOptions = {}): LosReport {
  const a = state.models[originId], b = state.models[targetId]
  if (!a || !b) return verdictOf(false, ['outOfTable'], Infinity, opts.range)
  if (a.id === b.id) return verdictOf(false, ['self'], 0, opts.range)
  const d = modelDistance(a, b)
  if (!isOnTable(a) || !isOnTable(b)) return verdictOf(false, ['outOfTable'], d, opts.range)
  const t = traceBetween(state, modelActor(state, opts.bundle, a), modelActor(state, opts.bundle, b))
  const reasons: LosReason[] = t.visible ? ['clear'] : ['terrain']
  return verdictOf(t.visible, reasons, d, opts.range, {
    cover: t.cover, blockers: t.blockers, terrainBlockers: t.blockers,
    line: t.line ? { from: t.line[0], to: t.line[1] } : null, why: sentence(t.visible, t.cover, reasons),
  })
}

/** Model-to-model LoS with the bundle first (the spec 14 signature). */
export const losBetween = (state: GameState, bundle: EditionBundle, aId: Id, bId: Id, range?: number): LosReport =>
  losReport(state, aId, bId, { bundle, ...(range !== undefined ? { range } : {}) })

/** LoS from a model to a Mission Marker, which counts as Size 0 (LOS-007). */
export function losToMarker(state: GameState, bundle: EditionBundle, modelId: Id, markerN: number): LosReport {
  const m = state.models[modelId]
  const mk = markerActor(state, bundle, markerN)
  if (!m || !mk || !isOnTable(m)) return verdictOf(false, ['outOfTable'], Infinity, undefined)
  const t = traceBetween(state, modelActor(state, bundle, m), mk)
  const reasons: LosReason[] = t.visible ? ['clear'] : ['terrain']
  return verdictOf(t.visible, reasons, Math.max(0, dist(m.pos, mk.pos) - baseRadius(m.base) - mk.r), undefined, {
    cover: t.cover, blockers: t.blockers, terrainBlockers: t.blockers, line: t.line ? { from: t.line[0], to: t.line[1] } : null,
  })
}

/** Frozen-contract verdict (what the client query holds). */
export function losVerdict(state: GameState, originId: Id, targetId: Id, opts: LosOptions = {}): LosVerdict {
  const { visible, reasons, blockers, inRange, distance } = losReport(state, originId, targetId, opts)
  return { visible, reasons, blockers, inRange, distance }
}
export const hasLos = (state: GameState, originId: Id, targetId: Id, opts: LosOptions = {}): boolean =>
  losReport(state, originId, targetId, opts).visible

/** LoS from a model to an arbitrary pose (placement checks). */
export function hasLosFromPose(state: GameState, moverId: Id, pos: Vec2, targetId: Id, opts: LosOptions = {}): boolean {
  const m = state.models[moverId]
  if (!m) return false
  const probe: GameState = { ...state, models: { ...state.models, [moverId]: { ...m, pos } } }
  return hasLos(probe, moverId, targetId, opts)
}

/** Does any model of unit A see any model of unit B (live models on the table)? */
export function unitsSee(state: GameState, bundle: EditionBundle, aUnit: Id, bUnit: Id): boolean {
  for (const a of tableModels(state, aUnit)) for (const b of tableModels(state, bUnit)) if (losBetween(state, bundle, a.id, b.id).visible) return true
  return false
}

/** HIGH GROUND Cover (COV-060/061): every model of the target stands on HIGH GROUND (any part of its base) and at least
 *  one attacking model does not; Flying units neither get it nor count as attacking from lower ground. */
export function highGroundCover(state: GameState, bundle: EditionBundle, attackerUnit: Id, targetUnit: Id): boolean {
  const tm = unitModels(state, targetUnit).filter(isOnTable)
  const am = unitModels(state, attackerUnit).filter(isOnTable)
  if (!tm.length || !am.length) return false
  if (tm.some((m) => isFlyingModel(bundle, m)) || am.some((m) => isFlyingModel(bundle, m))) return false
  const high = (m: ModelState): boolean => levelOfBase(state, m.pos, baseRadius(m.base)) === 2
  return tm.every(high) && am.some((m) => !high(m))
}

/** All terrain pieces a straight line crosses (for the LoS overlay). */
export const piecesOnLine = (state: GameState, a: Vec2, b: Vec2): Id[] => scPieces(state).filter((p) => segmentCrosses(p, a, b)).map((p) => p.t.id)
