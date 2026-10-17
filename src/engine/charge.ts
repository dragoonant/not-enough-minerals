// Checklist: CHG (CHG-001..018), KW IMPACT (ATK-091 entry), PH2 charge action. Owner A.
// charge.ts: Charge declare (all targets, no LoS), roll (D6 + Speed, value generation via dice.rollExpr), path
// (movement.reposition kind 'charge' with mustEngage), then IMPACT through attack.resolveBatch at 'armour'.
// Namespace 'charge' (a charge.go; k charge.targets, charge.path).
// The stage a Charge is in is read from the events it logged (`charge.declared`, `charge.rolled`, `charge.distance`,
// `charge.succeeded`, `charge.failed`), so a Reaction window opened by a hook can hand back through resume().
import type { EditionBundle } from '../data/types'
import { unitDef, rule } from './edition'
import { rollExpr } from './dice'
import { abilitiesOf, effectOps, hasStatus, keywordOf, removeEffects, statOf } from './effects'
import { isEngaged } from './engage'
import { impactBatch, resolveBatch } from './attack'
import { isRejection, reject } from './errors'
import { baseRadius, dist } from './geometry'
import { runHook } from './hooks'
import { fightingRank, meleeTargets, supportingRank } from './melee'
import { modelDistance } from './measure'
import { firePending, reposition, type PendingHook, type RepositionSpec } from './movement'
import { option, pushEvents, raiseDecision, type ActionDone, type ModuleDef, type StepResult } from './registry'
import { unitModels } from './squads'
import type { Action, AttackBatch, EngineEvent, GameState, ModelState, UnitId, UnitState, Vec2 } from './types'

const hasTag = (b: EditionBundle, u: UnitState, tag: 'ground' | 'flying'): boolean => unitDef(b, u.profileId)?.combatTags.includes(tag) ?? false

/** May this unit make a Charge at all (CHG-001): on the table, Ground, Unengaged, not barred by a Disengage, can move. */
function mayCharge(state: GameState, b: EditionBundle, unit: UnitState | undefined): unit is UnitState {
  if (!unit || unit.location !== 'table' || unit.noShootChargeRound === state.round) return false
  if (!hasTag(b, unit, 'ground') || hasTag(b, unit, 'flying')) return false
  if (hasStatus(state, unit.id, 'BURROWED')) return false // VIS-023: a BURROWED unit never Charges
  if (!unitModels(state, unit.id).length) return false
  const speed = statOf(state, b, unit.id, 'speed', { phase: 'assault' })
  if (speed === null) return false
  return !isEngaged(state, b, unit.id)
}

/** Enemy units this unit may declare as Charge targets (Ground, not Flying; CHG-001/002). No LoS needed (HIDDEN too). */
export function chargeTargets(state: GameState, bundle: EditionBundle, unitId: UnitId): UnitId[] {
  const unit = state.units[unitId]
  if (!mayCharge(state, bundle, unit)) return []
  return Object.values(state.units)
    .filter((u) => u.owner !== unit.owner && u.location === 'table' && hasTag(bundle, u, 'ground') && !hasTag(bundle, u, 'flying') && unitModels(state, u.id).length > 0)
    .map((u) => u.id)
}

/** The model that has to travel least to end Within Engagement Range of every target, and that distance. */
function bestLeader(state: GameState, b: EditionBundle, unit: UnitState, targetIds: UnitId[]): { model: ModelState; travel: number } | null {
  const er = rule(b, 'engagementRange')
  let best: { model: ModelState; travel: number } | null = null
  for (const m of unitModels(state, unit.id)) {
    let travel = 0
    for (const tid of targetIds) {
      const near = Math.min(...unitModels(state, tid).map((t) => modelDistance(m, t)))
      travel = Math.max(travel, near - er)
    }
    if (!best || travel < best.travel) best = { model: m, travel: Math.max(0, travel) }
  }
  return best
}

// ---------------------------------------------------------------- the path planner (CHG-004)
export interface ChargePlan { leaderId: string; path: Vec2[] }
/** Search constants (geometry only, not rules): stop this far short of base contact, and the sideways offsets of a detour. */
const STOP_SHORT = 0.01
const DETOUR_OFFSETS = [3, 6] as const
const PLAN_TRIES = 60

const stepSpec = (leaderId: string, path: Vec2[], distance: number, targets: UnitId[], again: boolean): RepositionSpec & { ignoreEngaged?: boolean } =>
  ({ kind: 'charge', leaderId, path, maxDist: distance, allowEngage: targets, mustEngage: targets, returnTo: 'charge', ...(again ? { ignoreEngaged: true } : {}) })

/** Complete, dry-run-checked Charge answers: leader x target model x (straight | one-waypoint detour either side), each
 *  ending 0.01" short of contact. A Charge succeeds when ANY legal Leading Model end exists, so the first valid one wins. */
export function planCharge(state: GameState, b: EditionBundle, unitId: UnitId, targets: UnitId[], distance: number, limit = 6, again = false): ChargePlan[] {
  const unit = state.units[unitId]
  if (!unit || !targets.length) return []
  const mine = unitModels(state, unitId)
  const targetModels = targets.flatMap((t) => unitModels(state, t))
  const leaders = [...mine].sort((a, c) => Math.min(...targetModels.map((t) => modelDistance(a, t))) - Math.min(...targetModels.map((t) => modelDistance(c, t)))).slice(0, 4)
  const out: ChargePlan[] = []
  let tries = 0
  for (const L of leaders) {
    // the nearest model of every target unit comes first, so a multi-target Charge aims at each in turn
    const aims = [...targets.map((t) => unitModels(state, t).sort((a, c) => modelDistance(L, a) - modelDistance(L, c))[0]), ...[...targetModels].sort((a, c) => modelDistance(L, a) - modelDistance(L, c)).slice(0, 2)]
      .filter((m): m is ModelState => !!m)
    for (const T of aims) {
      const stand = baseRadius(L.base) + baseRadius(T.base) + STOP_SHORT
      const centres = dist(L.pos, T.pos)
      if (centres < 1e-9) continue
      const ux = (T.pos.x - L.pos.x) / centres, uz = (T.pos.z - L.pos.z) / centres
      const go = Math.max(0, Math.min(centres - stand, distance))
      const cands: Vec2[][] = [[{ x: L.pos.x + ux * go, z: L.pos.z + uz * go }]]
      for (const sign of [1, -1]) for (const off of DETOUR_OFFSETS) {
        const wp = { x: L.pos.x + (T.pos.x - L.pos.x) / 2 - uz * off * sign, z: L.pos.z + (T.pos.z - L.pos.z) / 2 + ux * off * sign }
        const dw = dist(wp, T.pos) || 1
        cands.push([wp, { x: T.pos.x + ((wp.x - T.pos.x) / dw) * stand, z: T.pos.z + ((wp.z - T.pos.z) / dw) * stand }])
      }
      for (const path of cands) {
        if (tries++ >= PLAN_TRIES) return out
        const r = reposition(state, b, unitId, stepSpec(L.id, path, distance, targets, again))
        if (!isRejection(r)) { out.push({ leaderId: L.id, path }); if (out.length >= limit) return out }
      }
    }
  }
  return out
}

/** Smallest D6 face that makes the Charge succeed against all `targetIds` (null = impossible even on a 6).
 *  The same planner as the Charge itself, started at the straight-line lower bound. query.chargeOdds turns it into odds. */
export function chargeNeeded(state: GameState, bundle: EditionBundle, unitId: UnitId, targetIds: UnitId[], again = false): number | null {
  const unit = state.units[unitId]
  if (!unit || !targetIds.length) return null
  const speed = statOf(state, bundle, unitId, 'speed', { phase: 'assault' })
  const lead = bestLeader(state, bundle, unit, targetIds)
  if (speed === null || !lead) return null
  const lo = Math.max(1, Math.ceil(lead.travel - speed - 1e-9))
  // a longer roll only widens what the Leading Model may reach, so success is monotone in the face: test a 6, then bisect
  const works = (face: number): boolean => planCharge(state, bundle, unitId, targetIds, speed + face, 1, again).length > 0
  if (lo > 6 || !works(6)) return null
  let a = lo, z = 6
  while (a < z) {
    const mid = Math.floor((a + z) / 2)
    if (works(mid)) z = mid
    else a = mid + 1
  }
  return a
}

// ---------------------------------------------------------------- event-backed progress
type Ev = EngineEvent & { unitId?: string }
function lastChargeEvent(state: GameState, unitId: UnitId): Ev | undefined {
  for (let i = state.events.length - 1; i >= 0; i--) {
    const e = state.events[i] as Ev
    if (typeof e.type === 'string' && e.type.startsWith('charge.') && e.unitId === unitId) return e
  }
  return undefined
}
function lastOfType(state: GameState, unitId: UnitId, type: string): Ev | undefined {
  for (let i = state.events.length - 1; i >= 0; i--) {
    const e = state.events[i] as Ev
    if (e.type === type && e.unitId === unitId) return e
    if (e.type === 'charge.declared' && e.unitId === unitId) break
  }
  return undefined
}

const done = (unitId: UnitId, charged: boolean): ActionDone => ({ modelId: unitId, unitId, type: 'charge.go', triggers: charged ? [{ kind: 'charged', sourceId: unitId }] : [] })

// ---------------------------------------------------------------- the stages
const wantsBest2 = (state: GameState, b: EditionBundle, unitId: UnitId): boolean => effectOps(state, b, unitId, 'charge').some((l) => l.rec.dice === 'best2D6')

function declare(state: GameState, b: EditionBundle, unit: UnitState, targets: UnitId[], again = false): StepResult {
  const legal = again ? againTargets(state, b, unit.id) : chargeTargets(state, b, unit.id)
  if (!targets.length || targets.some((t) => !legal.includes(t))) return reject('E_BAD_TARGET', 'Every Charge target must be an enemy Ground unit.')
  // `needed`: the smallest D6 face that makes this Charge succeed (null = out of reach), so the UI cue can show it
  const needed = chargeNeeded(state, b, unit.id, targets, again)
  let s = pushEvents(state, [{ type: 'charge.declared', unitId: unit.id, targets, needed, round: state.round, ...(again ? { again: true } : {}) }])
  for (const t of targets) {
    const h = runHook(s, b, 'onTargeted', { seat: unit.owner, unitId: unit.id, targetUnitId: t, phase: 'assault', returnTo: 'charge' })
    s = h.state
    if (h.raised) return { state: s }
  }
  const h = runHook(s, b, 'onChargeDeclared', { seat: unit.owner, unitId: unit.id, targetUnitId: targets[0], phase: 'assault', returnTo: 'charge' })
  if (h.raised) return { state: h.state }
  return rollStep(h.state, b, unit.id)
}

function rollStep(state: GameState, b: EditionBundle, unitId: UnitId): StepResult {
  const unit = state.units[unitId]!
  const decl = lastOfType(state, unitId, 'charge.declared')
  const targets = (decl?.targets as UnitId[] | undefined) ?? []
  const speed = statOf(state, b, unitId, 'speed', { phase: 'assault' }) ?? 0
  // "best of two dice" (Zealot Charge, Pneumatized Carapace...): roll two, keep the higher (CHG-003)
  const two = wantsBest2(state, b, unitId)
  const r = rollExpr(state, two ? '2D6' : 'D6', 'charge', unit.owner)
  if (isRejection(r)) return r
  const face = two ? Math.max(...r.dice.map((d) => d.face)) : r.value
  const distance = face + speed
  const needed = (decl?.needed as number | null | undefined) ?? null
  let s = pushEvents(r.state, [r.event, { type: 'charge.rolled', unitId, roll: face, speed, distance, best2: two, needed }])
  const h = runHook(s, b, 'onChargeRoll', { seat: unit.owner, unitId, targetUnitId: targets[0], phase: 'assault', cause: 'chargeDistance', value: distance, returnTo: 'charge' })
  s = h.state
  if (h.raised) return { state: s }
  s = pushEvents(s, [{ type: 'charge.distance', unitId, distance: Math.max(0, h.value ?? distance) }])
  return pathStep(s, b, unitId)
}

/** Back from a chargeDistance Reaction window: add the second die a Reaction granted, fold the new roll modifiers, go on. */
function afterRollWindow(state: GameState, b: EditionBundle, unitId: UnitId): StepResult {
  const unit = state.units[unitId]!
  const rolled = lastOfType(state, unitId, 'charge.rolled')
  const targets = (lastOfType(state, unitId, 'charge.declared')?.targets as UnitId[] | undefined) ?? []
  if (!rolled) return { state, done: done(unitId, true) }
  let s = state
  let roll = rolled.roll as number
  const speed = rolled.speed as number
  if (!rolled.best2 && wantsBest2(s, b, unitId)) {
    const r = rollExpr(s, 'D6', 'charge', unit.owner)
    if (isRejection(r)) return r
    roll = Math.max(roll, r.value)
    s = pushEvents(r.state, [r.event, { type: 'charge.rolled', unitId, roll, speed, distance: roll + speed, best2: true, needed: (rolled.needed as number | null | undefined) ?? null }])
  }
  const h = runHook(s, b, 'onChargeRoll', { seat: unit.owner, unitId, targetUnitId: targets[0], phase: 'assault', cause: 'chargeDistance', value: roll + speed, foldOnly: true, returnTo: 'charge' })
  s = pushEvents(h.state, [{ type: 'charge.distance', unitId, distance: Math.max(0, h.value ?? roll + speed) }])
  return pathStep(s, b, unitId)
}

function chargeDistanceOf(state: GameState, unitId: UnitId): number {
  return (lastOfType(state, unitId, 'charge.distance')?.distance ?? lastOfType(state, unitId, 'charge.rolled')?.distance ?? 0) as number
}

function pathStep(state: GameState, b: EditionBundle, unitId: UnitId): StepResult {
  const unit = state.units[unitId]!
  const decl = lastOfType(state, unitId, 'charge.declared')
  const targets = (decl?.targets as UnitId[] | undefined) ?? []
  const distance = chargeDistanceOf(state, unitId)
  const plans = planCharge(state, b, unitId, targets, distance, 6, decl?.again === true)
  if (!plans.length) return fail(state, unitId, 'noLegalEnd') // CHG-004: no Leading Model end exists, so the Charge fails
  return {
    state: raiseDecision(state, {
      seat: unit.owner, kind: 'charge.path', canPass: false, context: { unitId, targets, distance },
      options: plans.map((pl, i) => i === 0
        ? option('auto', 'Charge along the first legal route', 'charge.path', { unitId, auto: true }, unit.owner)
        : option(`plan:${i}`, `Charge along route ${i + 1}`, 'charge.path', { unitId, leaderId: pl.leaderId, path: pl.path }, unit.owner)),
    }),
  }
}

const isVec = (v: unknown): v is Vec2 => typeof v === 'object' && v !== null && typeof (v as Vec2).x === 'number' && typeof (v as Vec2).z === 'number'

function fail(state: GameState, unitId: UnitId, why: string): StepResult {
  return { state: pushEvents(state, [{ type: 'charge.failed', unitId, why }]), done: done(unitId, false) }
}

function resolvePath(state: GameState, b: EditionBundle, action: Action): StepResult {
  const unitId = action.unitId as UnitId
  const unit = state.units[unitId]
  if (!unit) return reject('E_BAD_TARGET', 'No such unit.')
  const decl = lastOfType(state, unitId, 'charge.declared')
  const targets = (decl?.targets as UnitId[] | undefined) ?? []
  const again = decl?.again === true
  const distance = chargeDistanceOf(state, unitId)
  const explicit = typeof action.leaderId === 'string' && Array.isArray(action.path) && action.path.every(isVec)
  let leaderId: string, path: Vec2[]
  if (explicit) {
    leaderId = action.leaderId as string
    path = action.path as Vec2[]
    if (state.models[leaderId]?.unitId !== unitId) return reject('E_BAD_TARGET', 'The Leading Model must be one of this unit.')
  } else {
    const plan = planCharge(state, b, unitId, targets, distance, 1, again)[0]
    if (!plan) return fail(state, unitId, 'noLegalEnd') // CHG-004: only when no route validates
    leaderId = plan.leaderId
    path = plan.path
  }
  const r = reposition(state, b, unitId, stepSpec(leaderId, path, distance, targets, again))
  if (isRejection(r)) return explicit ? r : fail(state, unitId, r.code)
  return afterMove(pushEvents(r.state, r.events), b, unitId, targets, r)
}

/** The Leading Model has moved: a Reaction window opened at an end hook (onMoveEnd) parks the Charge on a 'charge.moved'
 *  event (with the hooks still to fire); resume() carries on. Otherwise the Charge has succeeded. */
function afterMove(state: GameState, b: EditionBundle, unitId: UnitId, targets: UnitId[], r: { raised?: boolean; pending?: PendingHook[] }): StepResult {
  if (!r.raised) return succeeded(state, b, unitId, targets)
  return { state: pushEvents(state, [{ type: 'charge.moved', unitId, targets, ...(r.pending?.length ? { pending: r.pending } : {}) }]) }
}

/** Back from a window opened while the Charge move ended: fire the end hooks left, then the Charge succeeds. */
function afterMoveWindow(state: GameState, b: EditionBundle, unitId: UnitId): StepResult {
  const ev = lastOfType(state, unitId, 'charge.moved') ?? lastChargeEvent(state, unitId)
  const targets = (ev?.targets as UnitId[] | undefined) ?? []
  const pending = (ev?.pending as PendingHook[] | undefined) ?? []
  let s = state
  if (pending.length) {
    const f = firePending(s, b, pending, 'charge')
    if (f.raised) return afterMove(f.state, b, unitId, targets, { raised: true, pending: f.rest })
    s = f.state
  }
  return succeeded(s, b, unitId, targets)
}

/** The Charge succeeded: log it, offer the chargeSucceeded Reactions (Lightning Dash), then IMPACT. */
function succeeded(state: GameState, b: EditionBundle, unitId: UnitId, targets: UnitId[]): StepResult {
  const unit = state.units[unitId]!
  const s = pushEvents(state, [{ type: 'charge.succeeded', unitId, targets }])
  const h = runHook(s, b, 'onChargeRoll', { seat: unit.owner, unitId, targetUnitId: targets[0], phase: 'assault', cause: 'chargeSucceeded', returnTo: 'charge' })
  if (h.raised) return { state: h.state }
  return afterSuccess(h.state, b, unitId)
}

function afterSuccess(state: GameState, b: EditionBundle, unitId: UnitId): StepResult {
  if (lastOfType(state, unitId, 'charge.declared')?.again === true) return { state, done: done(unitId, true) } // Lightning Dash: no second IMPACT
  return impactStep(state, b, unitId)
}

/** Enemy Ground units a chargeAgain (Lightning Dash) may pick: not an earlier target, Engaged is fine. */
function againTargets(state: GameState, b: EditionBundle, unitId: UnitId): UnitId[] {
  const unit = state.units[unitId]
  if (!unit) return []
  const first = (lastOfType(state, unitId, 'charge.declared')?.targets as UnitId[] | undefined) ?? []
  return Object.values(state.units)
    .filter((u) => u.owner !== unit.owner && u.location === 'table' && hasTag(b, u, 'ground') && !hasTag(b, u, 'flying') && unitModels(state, u.id).length > 0 && !first.includes(u.id))
    .map((u) => u.id)
}

/** chargeAgain: after a good Charge, a live effect lets the unit Charge a second enemy (no IMPACT). Consumed here. */
function chargeAgainStep(state: GameState, b: EditionBundle, unitId: UnitId): StepResult {
  const unit = state.units[unitId]!
  const decl = lastOfType(state, unitId, 'charge.declared')
  const live = effectOps(state, b, unitId, 'chargeAgain')[0]
  if (!live || decl?.again === true) return { state, done: done(unitId, true) }
  const s = removeEffects(state, unitId, (e) => e.kind === 'mod' && (e.data as { op?: string } | undefined)?.op === 'chargeAgain')
  const targets = againTargets(s, b, unitId)
  if (!targets.length) return { state: s, done: done(unitId, true) }
  return {
    state: raiseDecision(s, {
      seat: unit.owner, kind: 'charge.targets', canPass: false, context: { unitId, targets, again: true },
      options: targets.map((t) => option(`t:${t}`, `Charge ${t} again`, 'charge.targets', { unitId, targetIds: [t], again: true }, unit.owner)),
    }),
  }
}

/** IMPACT X (dice per ranked model) and Y (hit TN) of the Unit: the IMPACT keyword, else the impact verb of a passive
 *  Devastating Charge on its card (the data writes it as an effect, not a keyword), plus impactBonus dice per model
 *  (My Life for Aiur). Exported for query and the AI. */
export function impactOf(state: GameState, b: EditionBundle, unitId: UnitId): { x: number; y: number } | null {
  const u = state.units[unitId]
  if (!u) return null
  let best: { x: number; y: number } | null = null
  const kw = keywordOf(state, b, unitId, 'IMPACT', { phase: 'assault' })
  if (kw && kw.x !== undefined && kw.y !== undefined) best = { x: kw.x, y: kw.y }
  for (const a of abilitiesOf(b, u)) {
    if (a.type !== 'passive') continue
    for (const e of a.effects) {
      if (e.op === 'impact' && typeof e.x === 'number' && typeof e.y === 'number' && (!best || e.x > best.x)) best = { x: e.x, y: e.y }
    }
  }
  if (!best) return null
  const bonus = effectOps(state, b, unitId, 'impactBonus').reduce((n, l) => n + (typeof l.rec.dicePerModel === 'number' ? l.rec.dicePerModel : 0), 0)
  return { x: best.x + bonus, y: best.y }
}

// ---------------------------------------------------------------- IMPACT (ATK-091, GOLD-10)
type ImpactChoice = { kind: 'even' } | { kind: 'all'; target: UnitId } | { kind: 'split'; map: Record<string, Record<UnitId, number>> }

function impactRanked(state: GameState, b: EditionBundle, unitId: UnitId): { modelId: string; targets: UnitId[] }[] {
  return [...fightingRank(state, b, unitId), ...supportingRank(state, b, unitId)]
    .map((modelId) => ({ modelId, targets: meleeTargets(state, b, modelId) }))
    .filter((r) => r.targets.length > 0)
}

/** IMPACT (X) Y right after a successful Charge (ATK-091): X dice per ranked model. A model in the Fighting or Supporting
 *  Rank against several Enemy Units: the controlling player splits its dice (R p.88). The decision offers even, all at
 *  one target, and a custom per-model `split` for the UI; the bot answers from the ready options. */
function impactStep(state: GameState, b: EditionBundle, unitId: UnitId): StepResult {
  const unit = state.units[unitId]!
  const imp = impactOf(state, b, unitId)
  if (!imp) return chargeAgainStep(state, b, unitId)
  const ranked = impactRanked(state, b, unitId)
  if (!ranked.length) return chargeAgainStep(state, b, unitId)
  const all = [...new Set(ranked.flatMap((r) => r.targets))]
  if (!ranked.some((r) => r.targets.length > 1)) return runImpact(state, b, unitId, { kind: 'even' })
  return {
    state: raiseDecision(state, {
      seat: unit.owner, kind: 'charge.impact', canPass: false, context: { unitId, x: imp.x, y: imp.y, targets: all, ranked },
      options: [
        option('even', 'Split the IMPACT dice evenly', 'charge.impact', { unitId, even: true }, unit.owner),
        ...all.map((t) => option(`all:${t}`, `Aim the IMPACT dice at ${t}`, 'charge.impact', { unitId, all: t }, unit.owner)),
        // R p.88 IMPACT: the controlling player splits each model's dice. The action also carries `split`
        // ({modelId: {targetUnitId: dice}}, each model's dice adding up to X); without it this entry means "even".
        option('custom', 'Split the IMPACT dice model by model', 'charge.impact', { unitId, custom: true }, unit.owner),
      ],
    }),
  }
}

function runImpact(state: GameState, b: EditionBundle, unitId: UnitId, choice: ImpactChoice): StepResult {
  const unit = state.units[unitId]!
  const imp = impactOf(state, b, unitId)
  if (!imp) return chargeAgainStep(state, b, unitId)
  const perTarget = new Map<UnitId, { dice: number; models: string[] }>()
  const add = (t: UnitId, mid: string, n: number) => {
    if (n <= 0) return
    const cur = perTarget.get(t) ?? { dice: 0, models: [] }
    cur.dice += n
    if (!cur.models.includes(mid)) cur.models.push(mid)
    perTarget.set(t, cur)
  }
  for (const { modelId, targets: ts } of impactRanked(state, b, unitId)) {
    if (choice.kind === 'split' && choice.map[modelId]) { for (const [t, n] of Object.entries(choice.map[modelId]!)) add(t, modelId, n); continue }
    if (choice.kind === 'all' && ts.includes(choice.target)) { add(choice.target, modelId, imp.x); continue }
    for (let i = 0; i < imp.x; i++) add(ts[i % ts.length]!, modelId, 1)
  }
  let s = state
  const batches: AttackBatch[] = []
  for (const [tid, v] of perTarget) {
    const r = impactBatch(s, b, { seat: unit.owner, sourceId: 'impact', attackerUnitId: unitId, targetUnitId: tid, dice: v.dice, y: imp.y, modelIds: v.models })
    s = r.state
    if (r.batch) batches.push(r.batch)
  }
  if (!batches.length) return chargeAgainStep(s, b, unitId)
  s = pushEvents(s, [{ type: 'charge.impact', unitId }])
  return resolveBatch(s, b, batches[0]!, 'armour', 'charge', batches.slice(1))
}

/** Read a charge.impact answer: even, all at one target, or an explicit per-model split that must add up to X. */
function impactChoice(state: GameState, b: EditionBundle, action: Action): ImpactChoice | ReturnType<typeof reject> {
  const unitId = action.unitId as UnitId
  if (typeof action.all === 'string') return { kind: 'all', target: action.all }
  if (action.split === undefined) return { kind: 'even' }
  const imp = impactOf(state, b, unitId)
  const ranked = new Map(impactRanked(state, b, unitId).map((r) => [r.modelId, r.targets] as const))
  const map: Record<string, Record<UnitId, number>> = {}
  if (!imp || typeof action.split !== 'object' || action.split === null) return reject('E_BAD_PARAM', 'split must map model ids to dice per target.')
  for (const [mid, per] of Object.entries(action.split as Record<string, unknown>)) {
    const ts = ranked.get(mid)
    if (!ts || typeof per !== 'object' || per === null) return reject('E_BAD_TARGET', `${mid} makes no IMPACT.`)
    let sum = 0
    for (const [t, n] of Object.entries(per as Record<string, unknown>)) {
      if (!ts.includes(t) || typeof n !== 'number' || n < 0 || !Number.isInteger(n)) return reject('E_BAD_TARGET', `${mid} cannot aim at ${t}.`)
      sum += n
    }
    if (sum !== imp.x) return reject('E_BAD_PARAM', `${mid} has ${imp.x} IMPACT dice to place, not ${sum}.`)
    map[mid] = per as Record<UnitId, number>
  }
  return { kind: 'split', map }
}

export const charge: ModuleDef = {
  id: 'charge',
  kinds: ['charge'],
  options(state, bundle, unitId) {
    if (state.roundPhase !== 'assault') return []
    const unit = state.units[unitId]
    if (!mayCharge(state, bundle, unit) || !chargeTargets(state, bundle, unitId).length) return []
    return [option('charge', 'Charge', 'charge.go', { unitId }, unit.owner)]
  },
  resolve(state, bundle, action) {
    const unitId = action.unitId
    if (typeof unitId !== 'string' || !state.units[unitId]) return reject('E_BAD_TARGET', 'No such unit.')
    const unit = state.units[unitId]!
    switch (action.type) {
      case 'charge.go': {
        const targets = chargeTargets(state, bundle, unitId)
        if (!targets.length) return reject('E_NOT_LEGAL', 'This unit has nothing to charge.')
        // Single targets, every pair, and all of them: complete options, so a bot can answer without parameters.
        const sets: UnitId[][] = targets.map((t) => [t])
        for (let i = 0; i < targets.length; i++) for (let j = i + 1; j < targets.length; j++) sets.push([targets[i]!, targets[j]!])
        if (targets.length > 2) sets.push(targets)
        return {
          state: raiseDecision(state, {
            seat: unit.owner, kind: 'charge.targets', canPass: false, context: { unitId, targets },
            options: sets.map((set) => option(`t:${set.join('+')}`, `Charge ${set.join(' and ')}`, 'charge.targets', { unitId, targetIds: set }, unit.owner)),
          }),
        }
      }
      case 'charge.targets': {
        const ids = action.targetIds
        if (!Array.isArray(ids) || !ids.every((x) => typeof x === 'string')) return reject('E_BAD_PARAM', 'targetIds must list unit ids.')
        return declare(state, bundle, unit, ids as UnitId[], action.again === true)
      }
      case 'charge.impact': {
        const choice = impactChoice(state, bundle, action)
        if ('code' in choice) return choice
        return runImpact(state, bundle, unitId, choice)
      }
      case 'charge.path':
        return resolvePath(state, bundle, action)
      default:
        return reject('E_UNKNOWN_KIND', `The charge module does not handle ${action.type}.`)
    }
  },
  /** Back from an IMPACT attack, or from a Reaction window opened during declare / roll. */
  resume(state, bundle) {
    const unitId = state.activeUnit
    if (!unitId || !state.units[unitId]) return reject('E_BAD_TARGET', 'No active unit to continue the Charge.')
    const last = lastChargeEvent(state, unitId)
    switch (last?.type) {
      case 'charge.declared': return rollStep(state, bundle, unitId)
      case 'charge.moved': return afterMoveWindow(state, bundle, unitId)
      case 'charge.rolled': return afterRollWindow(state, bundle, unitId)
      case 'charge.succeeded': return afterSuccess(state, bundle, unitId)
      case 'charge.impact': return chargeAgainStep(state, bundle, unitId)
      default: return { state, done: done(unitId, true) }
    }
  },
}
