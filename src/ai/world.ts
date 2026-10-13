// View helpers (spec 30 s1): the read-only query shim built from a PlayerView, "what if" copies of it, the worker's
// dry-run check and small lookups. Nothing here computes a rules number; query.* does that against the shim.
import type { EditionBundle } from '../data/types'
import { matchesOption } from '../engine/apply'
import { isRejection, moduleFor } from '../engine/registry'
import { seedRng } from '../engine/rng'
import { gameDefaults } from '../engine/setup'
import type { Action, GameState, ModelState, PlayerView, SeatId, UnitId, UnitState, Vec2 } from '../engine/types'

/**
 * A read-only GameState for query.* built from the view: every public field of the view, engine defaults for the
 * rest (no log, no events, empty passed/firstPasser/reactionsUsed) and a throwaway rng that no AI code reads.
 * Never passed to apply() for real.
 */
export function queryState(view: PlayerView, bundle: EditionBundle): GameState {
  const { seat: _seat, ...pub } = view
  const base = gameDefaults('ai-shim', view.seatOrder, bundle.edition)
  return { ...base, ...pub, seed: 'ai-shim', rng: seedRng('ai-shim'), log: [], events: [] }
}

const BASES = new WeakMap<GameState, GameState>()
/** The decision's own shim a derived shim was built from (itself when not derived); memo tables key on it. */
export const baseOf = (q: GameState): GameState => BASES.get(q) ?? q

/** The shim with a whole unit translated so its leading model stands at `leaderAt` (move and threat scoring ask
 *  query.* "what if it stood here"). Formation is kept; coherency is the engine's answer, not this helper's. */
export function withUnitAt(q: GameState, unitId: UnitId, leaderAt: Vec2): GameState {
  const u = q.units[unitId]
  const lead = leaderOf(q, unitId)
  if (!u || !lead) return q
  const dx = leaderAt.x - lead.pos.x, dz = leaderAt.z - lead.pos.z
  const models = { ...q.models }
  for (const id of u.modelIds) {
    const m = models[id]
    if (m && m.life === 'active' && !m.offTable) models[id] = { ...m, pos: { x: m.pos.x + dx, z: m.pos.z + dz } }
  }
  const out = { ...q, models }
  BASES.set(out, baseOf(q))
  return out
}

/**
 * Worker dry run (spec 30 s1): the answer matches a legal template and the owning module's resolve() accepts it on the
 * shim. Close to the real engine, not exact; the host re-validates every answer.
 */
export function shimAccepts(view: PlayerView, bundle: EditionBundle): (a: Action) => boolean {
  let q: GameState | null = null
  return (a) => {
    if (!view.pending.options.some((o) => matchesOption(a, o.action))) return false
    const mod = moduleFor(view.pending.kind)
    if (!mod) return false
    try {
      q ??= queryState(view, bundle)
      return !isRejection(mod.resolve(q, bundle, a))
    } catch {
      return false
    }
  }
}

/** True when the answer matches one of the legal templates (extra fields are parameters). */
export const isLegalShape = (a: Action, legal: readonly Action[]): boolean => legal.some((t) => matchesOption(a, t))

/** 'shoot.batch' -> 'shoot'. */
export const namespaceOfKind = (kind: string): string => kind.split('.')[0] ?? kind

export const dist = (a: Vec2, b: Vec2): number => Math.hypot(a.x - b.x, a.z - b.z)
export const liveModel = (m: ModelState | undefined): m is ModelState => !!m && m.life === 'active' && !m.offTable
/** Live, on-table models of a unit. */
export const modelsOf = (q: Pick<GameState, 'units' | 'models'>, unitId: UnitId): ModelState[] =>
  (q.units[unitId]?.modelIds ?? []).map((id) => q.models[id]).filter(liveModel)
/** The unit's leading model if live, else its first live model. */
export function leaderOf(q: Pick<GameState, 'units' | 'models'>, unitId: UnitId): ModelState | undefined {
  const u = q.units[unitId]
  const lead = u?.leadingModelId ? q.models[u.leadingModelId] : undefined
  return liveModel(lead) ? lead : modelsOf(q, unitId)[0]
}
/** Units of a seat on the table (or every location with `anywhere`). */
export const unitsOf = (q: Pick<GameState, 'units'>, seat: SeatId, anywhere = false): UnitState[] =>
  Object.values(q.units).filter((u) => u.owner === seat && (anywhere || u.location === 'table'))
export const enemyUnitsOf = (q: Pick<GameState, 'units'>, seat: SeatId): UnitState[] =>
  Object.values(q.units).filter((u) => u.owner !== seat && u.location === 'table')
/** The other seat (two-player game). */
export const opponentOf = (q: Pick<GameState, 'seatOrder'>, seat: SeatId): SeatId => q.seatOrder.find((s) => s !== seat) ?? seat

/** Last point of an answer's `path` (move.path, deploy.path, charge.path) or its `dest` / `point`; null if none. */
export function endOf(a: Action): Vec2 | null {
  const isVec = (v: unknown): v is Vec2 => !!v && typeof (v as Vec2).x === 'number' && typeof (v as Vec2).z === 'number'
  if (Array.isArray(a.path) && a.path.length) { const p = a.path.at(-1); return isVec(p) ? p : null }
  if (isVec(a.dest)) return a.dest
  if (isVec(a.point)) return a.point
  return null
}
