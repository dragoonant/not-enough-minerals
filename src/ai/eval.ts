// Evaluation (spec 30 s7, s9; owner E). Every number comes from query.* on ctx.q (or a withUnitAt copy of it): this file
// weighs engine numbers, it never re-derives a rule. Units: unit Supply (CSV) and VP; 1 VP ~ 1 Supply destroyed (SUP-060).
// Anytime: every query call ticks timeUp(ctx); once the work cap is spent, searches return the best found so far.
import * as query from '../engine/query'
import type { ObjectiveStatus } from '../engine/query'
import type { Id, GameState, ModelState, SeatId, UnitId, Vec2 } from '../engine/types'
import type { AiContext, Score, ScorePart, ThreatMap, TierParams, VpOutlook } from './types'
import { spend, timeUp } from './types'
import { besideTarget, chargeOddsOf, edgeDist, impactOf, meleeOf, previewOf, reachOfUnit, rangedOf, threatAt, threatenedBy, toward, unitCostOf, weaponReach } from './threat'
import { dist, enemyUnitsOf, leaderOf, modelsOf, opponentOf, unitsOf, withUnitAt } from './world'

export const ZERO: Score = { value: 0, parts: {} }

/** Sum parts into a Score (weights default 1). Implemented: shared by every owner. */
export function combine(parts: Score['parts'], weights: Partial<Record<ScorePart, number>> = {}): Score {
  let value = 0
  for (const [k, v] of Object.entries(parts) as [ScorePart, number][]) value += v * (weights[k] ?? 1)
  return { value, parts }
}

/** Weights of the tier's params applied to Score parts (threat -> wThreat, cover -> wCover...). */
export function tierWeights(p: TierParams): Partial<Record<ScorePart, number>> {
  return { kill: p.wKill, threat: p.wThreat, cover: p.wCover, objective: p.wObjective, tempo: p.wTempo, survival: p.wSurvival }
}
const weigh = (ctx: AiContext, parts: Score['parts']): Score => combine(parts, tierWeights(ctx.params))
const plain = (parts: Score['parts']): Score => combine(parts)

const rad = (mm: number): number => mm / 25.4 / 2

// ---------------------------------------------------------------- objectives
const OBJ = new WeakMap<GameState, ObjectiveStatus[]>()
function markers(ctx: AiContext, q: GameState): ObjectiveStatus[] {
  let o = OBJ.get(q)
  if (!o) {
    try { o = query.objectiveStatus(q, ctx.bundle) } catch { o = [] }
    OBJ.set(q, o)
  }
  return o
}
/** VP a marker is worth (the best per-marker VP it shows, else 1 so an unscored marker still attracts). */
const markerVp = (m: ObjectiveStatus): number => {
  const v = Math.max(...Object.values(m.vpNow), 0)
  return v > 0 ? v : 1
}
const markerPos = (q: GameState, n: number): Vec2 | null => q.markers.find((m) => m.n === n)?.pos ?? null

/** Current Supply of a unit (query.unitSupply); 0 for units gone. */
export function unitCost(ctx: AiContext, unitId: UnitId, q?: GameState): number { return unitCostOf(ctx, unitId, q ?? ctx.q) }

/** Value of one Batch (query.attackPreview): expectedSupplyRemoved + wKill x killChance x cost + damage towards the next
 *  bracket + a control term when the removal flips a marker. Surge tag match and carry-over are inside the preview. */
export function attackValue(ctx: AiContext, attacker: UnitId, weaponId: Id, target: UnitId, q: GameState = ctx.q): Score {
  if (timeUp(ctx)) return ZERO
  const p = previewOf(ctx, q, attacker, weaponId, target)
  if (!p.legal) return ZERO
  const t = q.units[target]
  if (!t) return ZERO
  const cost = unitCostOf(ctx, target, q)
  const hp = Math.max(1, modelsOf(q, target).reduce((a, m) => a + m.hp, 0) - t.damage)
  const finish = p.killChance > 0.5 ? 0.25 * cost * p.killChance : 0 // finish-off bonus: a unit about to be wiped
  const parts: Score['parts'] = {
    supply: p.expectedSupplyRemoved,
    kill: p.killChance * cost + finish,
    // progress towards the next removed model (damage not yet worth Supply), plus a nudge for matched Surge dice
    damage: 0.2 * cost * Math.min(1, p.expectedDamage / hp) + (p.surge.tagMatch ? 0.03 * p.surge.expected : 0),
  }
  const flip = flipTerm(ctx, q, target, p.expectedSupplyRemoved)
  if (flip > 0) parts.objective = flip
  return weigh(ctx, parts)
}

/** Taking Supply off a unit that holds a marker against us flips it in proportion to the contest gap. */
function flipTerm(ctx: AiContext, q: GameState, target: UnitId, removed: number): number {
  const lead = leaderOf(q, target)
  if (!lead || removed <= 0) return 0
  const opp = q.units[target]!.owner
  let best = 0
  for (const m of markers(ctx, q)) {
    if (m.controller !== opp) continue
    const pos = markerPos(q, m.n)
    if (!pos || dist(pos, lead.pos) > m.contestRadius + 2) continue
    const gap = Math.max(1, (m.totals[opp] ?? 0) - (m.totals[ctx.seat] ?? 0) + 1)
    best = Math.max(best, 0.5 * markerVp(m) * Math.min(1, removed / gap))
  }
  return best
}

type BestAttack = { weaponId: Id; targetUnitId: UnitId; score: Score } | null
const BEST_ATTACKS = new WeakMap<GameState, Map<UnitId, BestAttack>>()
/** Best (weapon, target) for a unit from where it stands in `q` (default ctx.q); null when it has no legal Batch.
 *  Memoised per shim; a search cut short by the work cap is not remembered. */
export function bestAttack(ctx: AiContext, unitId: UnitId, q: GameState = ctx.q): BestAttack {
  let m = BEST_ATTACKS.get(q)
  if (!m) { m = new Map(); BEST_ATTACKS.set(q, m) }
  if (m.has(unitId)) return m.get(unitId)!
  const r = searchAttack(ctx, unitId, q)
  if (ctx.work.n <= ctx.work.cap) m.set(unitId, r)
  return r
}
function searchAttack(ctx: AiContext, unitId: UnitId, q: GameState): BestAttack {
  const u = q.units[unitId]
  if (!u) return null
  let best: BestAttack = null
  const weapons = [...rangedOf(ctx, q, unitId), ...meleeOf(ctx, q, unitId)]
  for (const e of enemyUnitsOf(q, u.owner)) {
    const d = edgeDist(q, unitId, e.id)
    if (!Number.isFinite(d)) continue
    for (const w of weapons) {
      if (timeUp(ctx)) return best
      const reach = w.phase === 'combat' ? 1.5 : weaponReach(w) // printed range or LONG_RANGE X, whichever is more
      if (d > reach + 0.5) continue // beyond every range this weapon can have; attackPreview decides the rest
      const score = attackValue(ctx, unitId, w.id, e.id, q)
      if (score.value > 0 && (!best || score.value > best.score.value)) best = { weaponId: w.id, targetUnitId: e.id, score }
    }
  }
  return best
}

/** Close combat value of `unitId` fighting `target` once beside it. */
function meleeValue(ctx: AiContext, unitId: UnitId, target: UnitId): number {
  const s = besideTarget(ctx.q, unitId, target)
  let v = 0
  for (const w of meleeOf(ctx, s, unitId)) v += attackValue(ctx, unitId, w.id, target, s).value
  return v
}

/** Charge value: query.chargeOdds chance x (IMPACT + close combat value) - the cost of failing (stranded exposure). */
export function chargeValue(ctx: AiContext, unitId: UnitId, targetIds: UnitId[]): Score {
  if (!targetIds.length || timeUp(ctx)) return ZERO
  const odds = chargeOddsOf(ctx, unitId, targetIds)
  if (odds.chance <= 0) return ZERO
  const cost = unitCostOf(ctx, unitId)
  let gain = 0, back = 0, obj = 0
  for (const t of targetIds) {
    if (timeUp(ctx)) break
    gain += meleeValue(ctx, unitId, t)
    const s = besideTarget(ctx.q, unitId, t) // the target fights back from the same engagement
    const ip = impactOf(ctx, s, unitId, t) // IMPACT lands first (query.impactPreview)
    if (ip) gain += ip.expectedSupplyRemoved + ctx.params.wKill * ip.killChance * unitCostOf(ctx, t)
    for (const w of meleeOf(ctx, s, t)) back += previewOf(ctx, s, t, w.id, unitId).expectedSupplyRemoved
    const lead = leaderOf(s, unitId)
    if (lead) obj = Math.max(obj, objectiveValue(ctx, unitId, lead.pos))
  }
  return weigh(ctx, {
    supply: odds.chance * gain,
    survival: -(odds.chance * back + (1 - odds.chance) * 0.15 * cost), // retaliation if it lands, stranded in the open if not
    objective: odds.chance * Math.max(0, obj),
  })
}

/** The best charge from where the unit stands: value (chargeValue), the odds of that charge and its targets, over the
 *  nearest enemies inside the unit's charge reach. Null when no enemy is in reach. */
export function bestCharge(ctx: AiContext, unitId: UnitId): { value: number; chance: number; targets: UnitId[] } | null {
  const reach = reachOfUnit(ctx, unitId)?.chargeMax ?? 0
  const near = enemyUnitsOf(ctx.q, ctx.seat).map((e) => ({ e, d: edgeDist(ctx.q, unitId, e.id) })).filter((x) => x.d <= reach + 1)
    .sort((a, b) => a.d - b.d).slice(0, 3)
  let best: { value: number; chance: number; targets: UnitId[] } | null = null
  for (const { e } of near) {
    if (best && timeUp(ctx)) break
    const v = chargeValue(ctx, unitId, [e.id]).value
    if (!best || v > best.value) best = { value: v, chance: chargeOddsOf(ctx, unitId, [e.id]).chance, targets: [e.id] }
  }
  return best
}

/** Weight of marker control as a nudge once positionValue prices the VP through query.missionScore. */
const CONTROL_NUDGE = 0.4

/** Objective value of the unit standing with its leader at `at`: marker VP x P(we win or flip the contest) from
 *  query.objectiveStatus on withUnitAt(q, unitId, at). Flying / BURROWED / Supply-0 units add only what the engine says. */
export function objectiveValue(ctx: AiContext, unitId: UnitId, at: Vec2): number {
  if (timeUp(ctx)) return 0
  const here = markers(ctx, ctx.q)
  if (!here.length) return 0
  const shim = withUnitAt(ctx.q, unitId, at)
  if (shim === ctx.q) return 0
  const seat = ctx.seat, opp = opponentOf(ctx.q, seat)
  let v = 0
  for (const m of markers(ctx, shim)) {
    const b = here.find((x) => x.n === m.n)
    if (!b) continue
    const mv = markerVp(m)
    const heldNow = b.controller === seat ? 1 : 0, heldThere = m.controller === seat ? 1 : 0
    // control itself is a nudge (a held marker keeps scoring); the VP it is worth now comes from missionScore in positionValue
    v += CONTROL_NUDGE * mv * (heldThere - heldNow) * (b.controller === opp && heldThere ? 1.5 : 1)
    const gain = (m.totals[seat] ?? 0) - (b.totals[seat] ?? 0)
    if (!heldThere && gain > 0) v += 0.3 * mv * Math.min(1, (m.totals[seat] ?? 0) / Math.max(1, m.totals[opp] ?? 0)) // pressure
    else if (heldNow && heldThere && gain > 0) v += 0.1 * mv // thicker hold
  }
  return v
}

/** Cover the unit gets at `at` against the threats that can reach it (query.coverFor / canSee). Supply-scaled, >= 0. */
export function coverValue(ctx: AiContext, unitId: UnitId, at: Vec2, threats: ThreatMap): number {
  const cost = unitCostOf(ctx, unitId)
  if (cost <= 0) return 0
  const shim = withUnitAt(ctx.q, unitId, at)
  let sum = 0, n = 0
  for (const eid of threatenedBy(ctx, threats, at, unitId)) {
    if (timeUp(ctx)) break
    if ((threats.reach[eid]?.range ?? 0) <= 0) continue
    let seen = true
    try { seen = query.canSee(shim, ctx.bundle, eid, unitId).ok } catch { /* assume seen */ }
    n++
    if (!seen) { sum += 1; continue } // no line of sight is the best cover there is
    let c: query.CoverLevel = 'none'
    try { c = query.coverFor(shim, ctx.bundle, eid, unitId) } catch { /* none */ }
    sum += c === 'none' ? 0 : c === 'direct' ? 0.5 : 1
  }
  return n ? 0.15 * cost * (sum / n) : 0
}

// ---------------------------------------------------------------- mission VP at a spot
const SCORES = new WeakMap<GameState, Map<string, number>>()
/** VP lead (ours minus the opponent's) that query.missionScore says Scoring would give if it ran in `q` (Round `round` when set);
 *  memoised per shim. Uses the Mission's full scoring rules, so quarters, markers and carried markers all count. */
function vpLead(ctx: AiContext, q: GameState, round?: number): number {
  let m = SCORES.get(q)
  if (!m) { m = new Map(); SCORES.set(q, m) }
  const key = String(round ?? '')
  let v = m.get(key)
  if (v === undefined) {
    spend(ctx, 2)
    const at = round === undefined ? q : { ...q, round }
    try { v = query.missionScore(at, ctx.bundle, ctx.seat).vpIfScoredNow - query.missionScore(at, ctx.bundle, opponentOf(q, ctx.seat)).vpIfScoredNow } catch { v = 0 }
    m.set(key, v)
  }
  return v
}
/** The next Round (this one included) in which the Mission scores carried markers, or null. */
function carryRound(ctx: AiContext): number | null {
  const mission = ctx.bundle.records.missions.find((x) => x.id === ctx.q.missionId)
  const rule = mission?.scoring.find((r) => r.kind === 'claimCarriedInZone')
  if (!rule || rule.kind !== 'claimCarriedInZone') return null
  return rule.rounds.filter((r) => r >= ctx.q.round).sort((a, b) => a - b)[0] ?? null
}
/** Marker carried by the unit (view.markers claimedBy). */
const carries = (ctx: AiContext, unitId: UnitId): boolean => ctx.view.markers.some((m) => m.claimedBy === unitId)
/** The unit carries a marker the Mission still scores for carriers: it should head for its own Zone, not for a marker. */
export const isHomeCarrier = (ctx: AiContext, unitId: UnitId): boolean => carries(ctx, unitId) && carryRound(ctx) !== null

/** VP the Mission would add for us (minus the opponent) if the unit's leader stood at `at` instead of where it is, now and,
 *  for a unit carrying a marker, in the Round that scores carriers (discounted by the Rounds left). */
export function vpGain(ctx: AiContext, unitId: UnitId, at: Vec2): number {
  const shim = withUnitAt(ctx.q, unitId, at)
  if (shim === ctx.q) return 0
  let g = vpLead(ctx, shim) - vpLead(ctx, ctx.q)
  if (carries(ctx, unitId)) {
    const R = carryRound(ctx)
    if (R !== null) g += (vpLead(ctx, shim, R) - vpLead(ctx, ctx.q, R)) / (1 + 0.5 * (R - ctx.q.round))
  }
  return g
}

/** Spot value (spec 30 s6): attack next Phase + objective (control nudge plus the Mission VP) + cover - threat + survival, weighted by the tier. */
const POSITIONS = new WeakMap<GameState, Map<string, Score>>()
export function positionValue(ctx: AiContext, unitId: UnitId, at: Vec2, threats: ThreatMap): Score {
  const key = `${unitId}@${at.x.toFixed(1)},${at.z.toFixed(1)}`
  let m = POSITIONS.get(ctx.q)
  if (!m) { m = new Map(); POSITIONS.set(ctx.q, m) }
  const hit = m.get(key)
  if (hit) return hit
  const v = positionValueOf(ctx, unitId, at, threats)
  if (ctx.work.n <= ctx.work.cap) m.set(key, v) // a value computed after the cap ran out is partial: not remembered
  return v
}
function positionValueOf(ctx: AiContext, unitId: UnitId, at: Vec2, threats: ThreatMap): Score {
  const u = ctx.q.units[unitId]
  if (!u || timeUp(ctx)) return ZERO
  const cost = unitCostOf(ctx, unitId)
  const atk = bestAttack(ctx, unitId, withUnitAt(ctx.q, unitId, at))
  const t = threatAt(ctx, threats, unitId, at)
  const hp = modelsOf(ctx.q, unitId).reduce((a, m) => a + m.hp, 0)
  const hurt = hp > 0 ? Math.min(1, u.damage / hp) : 0
  return weigh(ctx, {
    damage: atk ? 0.5 * atk.score.value : 0, // from the spot, before it moves again next Phase
    objective: objectiveValue(ctx, unitId, at) + vpGain(ctx, unitId, at),
    cover: coverValue(ctx, unitId, at, threats),
    threat: -t.expSupply,
    survival: -t.pKill * cost * (0.5 + hurt),
  })
}

/** Positions of markers we do not hold. */
const goalPoints = (ctx: AiContext): Vec2[] =>
  markers(ctx, ctx.q).filter((m) => m.controller !== ctx.seat).map((m) => markerPos(ctx.q, m.n)).filter((p): p is Vec2 => !!p)

/** Value of activating `unitId` now with menu action `actionType` (move.go, shoot.go, charge.go, deploy.go, melee.go,
 *  mission.*, ability.action, turn.hold), urgency included (spec 30 s4). */
export function activationValue(ctx: AiContext, unitId: UnitId, actionType: string, threats: ThreatMap): Score {
  const u = ctx.q.units[unitId]
  if (!u || actionType === 'turn.hold') return ZERO
  if (actionType === 'deploy.go' || u.location === 'reserves') return plain({ supply: deployValue(ctx, unitId, threats) })
  if (actionType.startsWith('mission')) return plain({ vp: 0.5 })
  if (actionType.startsWith('ability')) return plain({ supply: 0.2 })
  const lead = leaderOf(ctx.q, unitId)
  if (!lead) return ZERO
  const urgency = 0.3 * threatAt(ctx, threats, unitId, lead.pos).expSupply // a threatened unit acts before the enemy arrives
  if (actionType === 'shoot.go') {
    const a = bestAttack(ctx, unitId)
    return a ? plain({ supply: a.score.value, tempo: urgency * 0.5 }) : ZERO
  }
  if (actionType === 'melee.go') {
    const a = bestAttack(ctx, unitId) // an Engaged unit fights; Disengaging is a move.go and scores below
    return a ? plain({ supply: a.score.value * 1.2, tempo: urgency }) : ZERO
  }
  if (actionType === 'charge.go') {
    const c = bestCharge(ctx, unitId)
    return c ? plain({ supply: c.value }) : ZERO
  }
  if (actionType === 'move.go' || actionType === 'move.run') {
    const run = actionType === 'move.run'
    const rr = reachOfUnit(ctx, unitId)
    const reach = (run ? rr?.run : rr?.move) ?? 0
    const now = positionValue(ctx, unitId, lead.pos, threats).value
    const goals = goalPoints(ctx).sort((a, b) => dist(a, lead.pos) - dist(b, lead.pos)).slice(0, 2)
    const foes = enemyUnitsOf(ctx.q, ctx.seat).map((e) => leaderOf(ctx.q, e.id)?.pos).filter((p): p is Vec2 => !!p)
      .sort((a, b) => dist(a, lead.pos) - dist(b, lead.pos)).slice(0, 1)
    let best = -Infinity
    for (const g of [...goals, ...foes]) {
      if (timeUp(ctx)) break
      const v = positionValue(ctx, unitId, toward(lead.pos, g, reach), threats)
      // a Run forfeits the unit's shots and charge this Round: the attack part of the spot does not count
      best = Math.max(best, run ? v.value - (v.parts.damage ?? 0) : v.value)
    }
    return plain({ supply: Number.isFinite(best) ? best - now : 0, tempo: urgency })
  }
  return ZERO
}

/** Value of Passing now (spec 30 s4): wTempo x the First Player Marker's worth next Phase - the best activation left. */
export function passValue(ctx: AiContext, threats: ThreatMap): Score {
  let left = 0, worth = 0
  const seen = new Set<string>()
  for (const a of ctx.legal) {
    const id = typeof a.unitId === 'string' ? a.unitId : null
    if (!id || a.type === 'turn.pass' || seen.has(`${id}:${a.type}`)) continue
    seen.add(`${id}:${a.type}`)
    if (timeUp(ctx)) break
    left = Math.max(left, activationValue(ctx, id, a.type, threats).value)
  }
  // what moving first next Phase is worth: our best attack that exists now, and a marker we could still take
  for (const u of unitsOf(ctx.q, ctx.seat)) {
    if (timeUp(ctx)) break
    const a = bestAttack(ctx, u.id)
    if (a) worth = Math.max(worth, 0.5 * a.score.value)
  }
  if (goalPoints(ctx).length) worth += 0.5
  return weigh(ctx, { tempo: worth, cost: -left })
}

/** Cost of removing one model as a casualty (spec 30 s7.4): bracket drop, coherency break, lost contest or weapon. */
export function casualtyCost(ctx: AiContext, unitId: UnitId, modelId: Id): number {
  const q = ctx.q
  const u = q.units[unitId], m = q.models[modelId]
  if (!u || !m) return 0
  const live = modelsOf(q, unitId)
  const without: GameState = { ...q, models: { ...q.models, [modelId]: { ...m, life: 'dead' } as ModelState } }
  let cost = 0.05 * m.hp
  cost += Math.max(0, unitCostOf(ctx, unitId) - unitCostOf(ctx, unitId, without)) * 2 // a Supply bracket drop
  if (u.leadingModelId === modelId) cost += 0.5
  if (u.modelIds[0] === modelId && live.some((x) => x.hp < m.hp)) cost += 0.4 // the Shield model
  for (const w of m.weapons) if (!live.some((x) => x.id !== modelId && x.weapons.includes(w))) cost += 0.3 // last carrier of a weapon
  const rest = live.filter((x) => x.id !== modelId)
  if (rest.length > 1) {
    try {
      const placement = Object.fromEntries(rest.map((x) => [x.id, x.pos]))
      if (!query.coherencyPreview(q, ctx.bundle, unitId, placement).inCoherency) cost += 1
    } catch { /* ignore */ }
  }
  for (const mk of markers(ctx, q)) { // models near a marker we hold keep the contest
    const pos = markerPos(q, mk.n)
    if (mk.controller === ctx.seat && pos && dist(pos, m.pos) <= mk.contestRadius + rad(m.base)) cost += 0.3
  }
  return cost
}

/** Deploy value of a reserve unit this Phase: cost x (objective reach + attack reach next Phase) - entry exposure. */
export function deployValue(ctx: AiContext, unitId: UnitId, threats: ThreatMap): number {
  const q = ctx.q
  const cost = unitCostOf(ctx, unitId)
  if (cost <= 0) return 0
  const ms = markers(ctx, q)
  const open = ms.length ? ms.filter((m) => m.controller !== ctx.seat).length / ms.length : 0
  const foeSupply = enemyUnitsOf(q, ctx.seat).reduce((a, e) => a + unitCostOf(ctx, e.id), 0)
  const mine = unitsOf(q, ctx.seat).reduce((a, e) => a + unitCostOf(ctx, e.id), 0)
  const attack = foeSupply > 0 ? Math.min(1, foeSupply / Math.max(1, mine + cost)) : 0
  const last = q.maxRounds !== null && q.round >= q.maxRounds
  // units still in Reserves at the end count as destroyed (SUP-064), so the last Round deploys everything
  const urgency = last ? 2 : q.maxRounds ? Math.max(0, (q.round - 1) / q.maxRounds) : 0
  const exposure = 0.1 * Math.min(3, Object.keys(threats.reach).length) * (1 - Math.min(1, urgency / 2))
  return cost * (0.5 + 0.8 * open + 0.5 * attack + urgency - exposure)
}

/** VP now (seat.vp), VP if Scoring ran now (query.missionScore) and a projection to the end of the game. */
export function vpOutlook(ctx: AiContext, seat: SeatId, q: GameState = ctx.q): VpOutlook {
  let now = 0
  try { now = query.missionScore(q, ctx.bundle, seat).vpIfScoredNow } catch { /* mission not scoring */ }
  const vp = q.seats[seat]?.vp ?? 0
  const left = q.maxRounds === null ? 0 : Math.max(0, q.maxRounds - q.round)
  // each remaining Round scores about what holds today, discounted for the board changing
  return { seat, vp, ifScoredNow: now, projected: vp + now + 0.7 * now * left }
}

/** Whole-position value for ctx.seat (spec 30 s9): VP lead now and projected + Supply on objectives - Supply lost - threat. */
export function stateValue(ctx: AiContext, threats: ThreatMap, q: GameState = ctx.q): Score {
  const me = ctx.seat, opp = opponentOf(q, me)
  const a = vpOutlook(ctx, me, q), b = vpOutlook(ctx, opp, q)
  let objective = 0
  for (const m of markers(ctx, q)) {
    objective += markerVp(m) * Math.max(-1, Math.min(1, ((m.totals[me] ?? 0) - (m.totals[opp] ?? 0)) / 3))
  }
  let threat = 0
  const mine = unitsOf(q, me).sort((x, y) => unitCostOf(ctx, y.id, q) - unitCostOf(ctx, x.id, q))
  for (const u of mine) {
    if (timeUp(ctx)) break
    const lead = leaderOf(q, u.id)
    if (lead) threat -= threatAt(ctx, threats, u.id, lead.pos).expSupply
  }
  let reserves = 0 // Supply still off the table as the game runs out counts against us
  if (q.maxRounds) {
    const late = Math.max(0, q.round / q.maxRounds - 0.4)
    for (const u of unitsOf(q, me, true)) if (u.location === 'reserves') reserves -= late * 0.5 * unitCostOf(ctx, u.id, q)
  }
  return weigh(ctx, {
    vp: (a.vp - b.vp) + 0.5 * (a.projected - b.projected - (a.vp - b.vp)),
    objective,
    supply: (q.seats[opp]?.supplyLostThisRound ?? 0) - (q.seats[me]?.supplyLostThisRound ?? 0),
    threat,
    cost: reserves,
  })
}
