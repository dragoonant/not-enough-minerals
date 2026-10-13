// Threat map (spec 30 s9; owner E). Built once per decision: each enemy unit's reach next Phase (query.reachOf: move or
// charge, plus its longest ranged weapon) and, per asked spot, the expected Supply it could remove there
// (query.attackPreview on withUnitAt shims). Memoised per decision; every query call ticks timeUp(ctx).
// Also hosts the small shared helpers eval.ts uses (memoised previews, weapon lists, edge distance, "stand beside").
import type { WeaponProfile } from '../data/types'
import { unitDef, weaponDef } from '../engine/edition'
import * as query from '../engine/query'
import type { AttackPreview } from '../engine/query'
import type { GameState, Id, SeatId, UnitId, Vec2 } from '../engine/types'
import { spend, timeUp, type AiContext, type ThreatMap, type ThreatReach, type ThreatReport } from './types'
import { baseOf, dist, enemyUnitsOf, leaderOf, modelsOf, withUnitAt } from './world'

export const NO_THREAT: ThreatReport = { expSupply: 0, pKill: 0, attackers: [] }

/** Gap in inches between base edges when a unit is placed "beside" another (inside Engagement Range, 1"). */
const BESIDE_GAP = 0.5
const MM = 25.4
/** Slack (inches) on reach tests (edge to edge): formations are not rigid. */
const SLACK = 1
/** Work units one uncached chargeOdds costs (about 12 ms in a crowded game; see types.WORK_PER_MS). */
const CHARGE_ODDS_COST = 5

const radius = (mm: number): number => mm / MM / 2

// ---------------------------------------------------------------- shared helpers
/** Work units one uncached attackPreview costs. Its time is line-of-sight tracing, which grows with the model pairs and with
 *  the distance (measured on a desktop: nm = 1 pair 0.4 ms at 3" to 2.4 ms at 20"; 4 pairs 1.0 to 5.4 ms; 10+ pairs 2.8
 *  to 7 ms). Fit: ms ~ min(pairs, 10)^0.7 x (0.3 + 0.07 x distance"); one unit is 0.5 ms (types.WORK_PER_MS). A pure
 *  function of the position, so the cap stays deterministic. */
export function previewCost(q: GameState, attacker: UnitId, target: UnitId): number {
  const pairs = modelsOf(q, attacker).length * modelsOf(q, target).length
  const d = Math.min(30, Math.max(0, edgeDist(q, attacker, target)))
  return Math.max(1, 2 * Math.pow(Math.min(pairs, 10), 0.7) * (0.3 + 0.07 * d) * tableFactor(q))
}
const TABLE_FACTORS = new WeakMap<object, number>()
/** Line-of-sight cost of a table: every piece that blocks sight (obstruction, building) is traced for every model pair
 *  (measured: 0.14-0.28 ms per work unit with 2 blockers, 0.3-0.37 with 4, 0.5-0.67 with 7). 1 at four blockers. */
function tableFactor(q: GameState): number {
  let f = TABLE_FACTORS.get(q.terrain)
  if (f === undefined) {
    f = (0.5 + q.terrain.filter((t) => t.rulesType === 'obstruction' || t.rulesType === 'building').length) / 4.5
    TABLE_FACTORS.set(q.terrain, f)
  }
  return f
}
const PREVIEWS = new WeakMap<GameState, Map<string, AttackPreview>>()
/** query.attackPreview, memoised per shim. */
export function previewOf(ctx: AiContext, q: GameState, attacker: UnitId, weaponId: Id, target: UnitId): AttackPreview {
  let m = PREVIEWS.get(q)
  if (!m) { m = new Map(); PREVIEWS.set(q, m) }
  const key = `${attacker}|${weaponId}|${target}`
  let p = m.get(key)
  if (!p) {
    spend(ctx, previewCost(q, attacker, target))
    try { p = query.attackPreview(q, ctx.bundle, attacker, weaponId, target) } catch {
      p = { attackerUnitId: attacker, weaponId, targetUnitId: target, legal: false, perModel: [], surge: { dice: null, tagMatch: false, expected: 0 },
        armourTN: null, evadeTN: null, evadeReason: null, expectedDamage: 0, modelsRemoved: [1], killChance: 0, expectedSupplyRemoved: 0 }
    }
    m.set(key, p)
  }
  return p
}

/** Weapon profiles the unit's live models carry (data lookup; no rule maths). */
export function weaponsOf(ctx: AiContext, q: GameState, unitId: UnitId): WeaponProfile[] {
  const u = q.units[unitId]
  const def = u ? unitDef(ctx.bundle, u.profileId) : undefined
  if (!u || !def) return []
  const ids = new Set<Id>()
  for (const m of modelsOf(q, unitId)) for (const w of m.weapons) ids.add(w)
  return [...ids].map((id) => weaponDef(def, id)).filter((w): w is WeaponProfile => !!w)
}
export const rangedOf = (ctx: AiContext, q: GameState, unitId: UnitId): WeaponProfile[] => weaponsOf(ctx, q, unitId).filter((w) => w.phase === 'assault')
export const meleeOf = (ctx: AiContext, q: GameState, unitId: UnitId): WeaponProfile[] => weaponsOf(ctx, q, unitId).filter((w) => w.phase === 'combat')

/** Farthest a ranged weapon can be fired from: its printed range, or its LONG_RANGE X when that is more (data lookup;
 *  attackPreview decides legality). Close combat weapons reach 0 here. */
export function weaponReach(w: WeaponProfile): number {
  const r = typeof w.range === 'number' ? w.range : 0
  const lr = w.keywords.find((k) => k.kw === 'LONG_RANGE')?.x
  return typeof lr === 'number' ? Math.max(r, lr) : r
}
/** Longest weaponReach over a unit's ranged weapons. */
export const longestReach = (ctx: AiContext, q: GameState, unitId: UnitId): number =>
  rangedOf(ctx, q, unitId).reduce((a, w) => Math.max(a, weaponReach(w)), 0)

const REACHES = new WeakMap<GameState, Map<UnitId, query.Reach | null>>()
/** query.reachOf on ctx.q, memoised per unit (null when the engine cannot answer). */
export function reachOfUnit(ctx: AiContext, unitId: UnitId): query.Reach | null {
  let m = REACHES.get(ctx.q)
  if (!m) { m = new Map(); REACHES.set(ctx.q, m) }
  let r = m.get(unitId)
  if (r === undefined) {
    spend(ctx, 1)
    try { r = query.reachOf(ctx.q, ctx.bundle, unitId) } catch { r = null }
    m.set(unitId, r)
  }
  return r
}

const ODDS = new WeakMap<GameState, Map<string, query.ChargeOdds>>()
/** query.chargeOdds on ctx.q, memoised on the unit and its sorted targets; an uncached call spends CHARGE_ODDS_COST work units. */
export function chargeOddsOf(ctx: AiContext, unitId: UnitId, targetIds: readonly UnitId[]): query.ChargeOdds {
  let m = ODDS.get(ctx.q)
  if (!m) { m = new Map(); ODDS.set(ctx.q, m) }
  const ids = [...targetIds].sort()
  const key = `${unitId}>${ids.join(',')}`
  let o = m.get(key)
  if (!o) {
    spend(ctx, CHARGE_ODDS_COST)
    try { o = query.chargeOdds(ctx.q, ctx.bundle, unitId, ids) } catch { o = { targets: ids, needed: null, chance: 0, reason: 'error' } }
    m.set(key, o)
  }
  return o
}

/** Nearest base-edge distance between two units' live models (Infinity when one is off the table). */
export function edgeDist(q: GameState, a: UnitId, b: UnitId): number {
  let best = Infinity
  for (const x of modelsOf(q, a)) for (const y of modelsOf(q, b)) {
    const d = dist(x.pos, y.pos) - radius(x.base) - radius(y.base)
    if (d < best) best = d
  }
  return best
}

/** Shim with `mover` standing beside `target` (leader just inside Engagement Range, on the side it came from). */
export function besideTarget(q: GameState, mover: UnitId, target: UnitId): GameState {
  const lead = leaderOf(q, mover)
  if (!lead) return q
  let near = null as ReturnType<typeof modelsOf>[number] | null, nd = Infinity
  for (const t of modelsOf(q, target)) { const d = dist(t.pos, lead.pos); if (d < nd) { nd = d; near = t } }
  if (!near) return q
  const gap = radius(near.base) + radius(lead.base) + BESIDE_GAP
  if (nd <= gap + 1e-6) return q
  const k = gap / nd
  return withUnitAt(q, mover, { x: near.pos.x + (lead.pos.x - near.pos.x) * k, z: near.pos.z + (lead.pos.z - near.pos.z) * k })
}

/** The point `travel` inches from `from` towards `to`. */
export function toward(from: Vec2, to: Vec2, travel: number): Vec2 {
  const d = dist(from, to)
  if (d < 1e-9 || travel <= 0) return from
  const k = Math.min(1, travel / d)
  return { x: from.x + (to.x - from.x) * k, z: from.z + (to.z - from.z) * k }
}

/** How far the unit's models spread from its leader (centre to outer base edge), inches. */
export function extentOf(q: GameState, unitId: UnitId): number {
  const lead = leaderOf(q, unitId)
  if (!lead) return 0
  let e = 0
  for (const m of modelsOf(q, unitId)) e = Math.max(e, dist(m.pos, lead.pos) + radius(m.base))
  return e
}

// ---------------------------------------------------------------- the map
const MAPS = new WeakMap<GameState, Map<SeatId, ThreatMap>>()

function reachFor(ctx: AiContext, unitId: UnitId): ThreatReach | null {
  const lead = leaderOf(ctx.q, unitId)
  if (!lead) return null
  const r = reachOfUnit(ctx, unitId)
  if (!r) return null
  const u = ctx.q.units[unitId]!
  // An enemy that already moved this Movement Phase cannot move again before it shoots or charges.
  const canMove = !(ctx.view.roundPhase === 'movement' && u.activation === 'movement')
  return {
    unitId, at: lead.pos,
    move: canMove ? r.move ?? 0 : 0,
    charge: r.chargeMin === null || r.chargeMax === null ? 0 : (r.chargeMin + r.chargeMax) / 2, // mean of the engine's min..max
    chargeMin: r.chargeMin ?? 0, chargeMax: r.chargeMax ?? 0,
    range: longestReach(ctx, ctx.q, unitId),
    melee: meleeOf(ctx, ctx.q, unitId).length > 0 && r.chargeMax !== null,
    extent: extentOf(ctx.q, unitId),
  }
}

/** The decision's threat map (memoised on ctx.q via world.baseOf). */
export function threatsFor(ctx: AiContext): ThreatMap {
  const base = baseOf(ctx.q)
  let bySeat = MAPS.get(base)
  if (!bySeat) { bySeat = new Map(); MAPS.set(base, bySeat) }
  const hit = bySeat.get(ctx.seat)
  if (hit) return hit
  const map: ThreatMap = { seat: ctx.seat, reach: {}, memo: new Map() }
  for (const e of enemyUnitsOf(ctx.q, ctx.seat)) {
    if (timeUp(ctx)) break
    const r = reachFor(ctx, e.id)
    if (r) map.reach[e.id] = r
  }
  bySeat.set(ctx.seat, map)
  return map
}

/** One enemy unit's reach next Phase (query.reachOf plus its longest ranged weapon range). */
export function enemyReach(ctx: AiContext, enemyUnitId: UnitId): ThreatReach | null {
  return threatsFor(ctx).reach[enemyUnitId] ?? null
}

/** Edge-to-edge test: the enemy may Move and then shoot (range) or charge (charge roll), formations included. */
const reaches = (r: ThreatReach, at: Vec2, selfExtent: number): boolean => {
  const d = dist(r.at, at) - r.extent - selfExtent
  return d <= r.move + Math.max(r.range, r.melee ? r.chargeMax : 0) + SLACK
}

/** Enemy units that can reach `at` next Phase (cheap distance pre-filter for move candidates). `unitId` adds the
 *  unit's own spread to the test. */
export function threatenedBy(ctx: AiContext, threats: ThreatMap, at: Vec2, unitId?: UnitId): UnitId[] {
  const ext = unitId ? extentOf(ctx.q, unitId) : 0
  return Object.values(threats.reach).filter((r) => reaches(r, at, ext)).map((r) => r.unitId).sort()
}

/** What the enemy could do to `unitId` with its leader at `at` next Phase: expected Supply removed, P(unit destroyed)
 *  and the enemy units that can reach it (shooting in range with LoS, or charge reach). */
export function threatAt(ctx: AiContext, threats: ThreatMap, unitId: UnitId, at: Vec2): ThreatReport {
  const key = `${unitId}@${at.x.toFixed(1)},${at.z.toFixed(1)}`
  const memo = threats.memo.get(key)
  if (memo) return memo
  const cost = unitCostOf(ctx, unitId)
  const shim = withUnitAt(ctx.q, unitId, at)
  let exp = 0, survive = 1
  const attackers: UnitId[] = []
  for (const eid of threatenedBy(ctx, threats, at, unitId)) {
    if (timeUp(ctx)) break
    const r = threats.reach[eid]!
    const lead = leaderOf(shim, eid)
    if (!lead) continue
    let bestExp = 0, bestKill = 0
    // shooting: the enemy walks up to range (Move) and fires every ranged weapon
    const ranged = rangedOf(ctx, shim, eid)
    if (ranged.length && r.range > 0) {
      const d = edgeDist(shim, eid, unitId)
      const travel = Math.min(r.move, Math.max(0, d - r.range * 0.9))
      const s2 = travel > 0 ? withUnitAt(shim, eid, toward(lead.pos, at, travel)) : shim
      let e = 0, ks = 1
      for (const w of ranged) {
        if (timeUp(ctx)) break
        const p = previewOf(ctx, s2, eid, w.id, unitId)
        if (!p.legal) continue
        e += p.expectedSupplyRemoved
        ks *= 1 - p.killChance
      }
      bestExp = e; bestKill = 1 - ks
    }
    // charging: the enemy moves up, rolls its charge and arrives beside the unit (IMPACT first, then close combat)
    if (r.melee) {
      const d = edgeDist(shim, eid, unitId)
      const need = d - r.move - 1 // inches the charge roll must cover (Engagement Range is 1")
      // chance from the engine's own reach range, uniform between chargeMin and chargeMax
      const chance = need <= r.chargeMin ? 1 : need > r.chargeMax ? 0 : (r.chargeMax - need + 1) / (r.chargeMax - r.chargeMin + 1)
      if (chance > 0) {
        const s3 = besideTarget(shim, eid, unitId)
        let e = 0, ks = 1
        for (const w of meleeOf(ctx, s3, eid)) {
          if (timeUp(ctx)) break
          const p = previewOf(ctx, s3, eid, w.id, unitId)
          if (!p.legal) continue
          e += p.expectedSupplyRemoved
          ks *= 1 - p.killChance
        }
        const ip = impactOf(ctx, s3, eid, unitId)
        if (ip) { e += ip.expectedSupplyRemoved; ks *= 1 - ip.killChance }
        e *= chance
        if (e > bestExp) { bestExp = e; bestKill = (1 - ks) * chance }
      }
    }
    if (bestExp > 0) { exp += bestExp; survive *= 1 - bestKill; attackers.push(eid) }
  }
  const out: ThreatReport = { expSupply: Math.min(exp, Math.max(cost, 0)), pKill: attackers.length ? 1 - survive : 0, attackers }
  threats.memo.set(key, out)
  return out
}

const IMPACTS = new WeakMap<GameState, Map<string, query.ImpactPreview | null>>()
/** query.impactPreview for `charger` standing in `q` (ask a besideTarget shim), memoised per shim. */
export function impactOf(ctx: AiContext, q: GameState, charger: UnitId, target: UnitId): query.ImpactPreview | null {
  let m = IMPACTS.get(q)
  if (!m) { m = new Map(); IMPACTS.set(q, m) }
  const key = `${charger}|${target}`
  let v = m.get(key)
  if (v === undefined) {
    spend(ctx, 1)
    try { v = query.impactPreview(q, ctx.bundle, charger, target) } catch { v = null }
    m.set(key, v)
  }
  return v
}

/** Current Supply of a unit (query.unitSupply); 0 for units gone. Lives here so both files share it. */
export function unitCostOf(ctx: AiContext, unitId: UnitId, q: GameState = ctx.q): number {
  try { return query.unitSupply(q, ctx.bundle, unitId) } catch { return 0 }
}
