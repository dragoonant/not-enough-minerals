// Checklist: ABL, REA, CA, KW (hook-driven keywords), HOOK wiring (spec 00 s4.3). Owner B.
// hooks.ts: the hook points, the HOOK_WIRING table (each point is called from exactly one place) and runHook(), which
// runs every passive / reaction / code hook listening on a point. code-hooks.ts holds the {code} implementations.
import type { EditionBundle, TriggerEvent } from '../data/types'
import { abilityRefs, dispatch, offerKhala, refreshCards, runDelayedStep } from './abilities'
import { CODE_POINTS, runCode } from './code-hooks'
import { addEffect, effectOps, expireEffects, hasStatus, keywordOf, LOSE_HIDDEN_QUEUE, removeEffects, rollModOf, setStatus, startOfRoundStatuses } from './effects'
import { answeringId } from './pending'
import { detect } from './visibility'
import type { ArrivalEntry, AttackBatch, GameState, ModelId, Mod, RoundPhase, SeatId, SupplyPurpose, UnitId } from './types'

export const HOOK_POINTS = [
  'startOfRound', 'beforeAction', 'afterAction', 'onTargeted', 'onChargeDeclared', 'onChargeRoll', 'attackMods',
  'beforeArmourRoll', 'beforeEvadeRoll', 'reduceDamage', 'onModelsRemoved', 'onMoveEnd', 'onArrive', 'onLoseHidden',
  'onPlaceResolved', 'poolMods', 'supplyMods', 'canContest', 'endOfRound', 'cleanup',
] as const
export type HookPoint = typeof HOOK_POINTS[number]

/** The single call site of each hook point (spec 00 s4.3). A test must show each one firing in a real game. */
export const HOOK_WIRING: Readonly<Record<HookPoint, string>> = {
  startOfRound: 'turnflow.startRound step 5',
  beforeAction: 'turnflow ability window before the action',
  afterAction: 'turnflow ability window after the action',
  onTargeted: 'shooting.declareBatch, charge.declare',
  onChargeDeclared: 'charge.ts declare',
  onChargeRoll: 'charge.ts roll',
  attackMods: 'attack.ts step 1',
  beforeArmourRoll: 'attack.ts step 3',
  beforeEvadeRoll: 'attack.ts step 4',
  reduceDamage: 'attack.ts step 5',
  onModelsRemoved: 'damage.removeModels',
  onMoveEnd: 'movement.reposition',
  onArrive: 'reserves.arrive',
  onLoseHidden: 'visibility.detect / effects.setStatus (HIDDEN lost)',
  onPlaceResolved: 'movement.reposition (kind place)',
  poolMods: 'supply.poolFor',
  supplyMods: 'supply.supplyFor',
  canContest: 'control.contest',
  endOfRound: 'scoring step 4',
  cleanup: 'scoring step 5',
}

/** What a hook point is told. Fields are optional; each point documents which it fills. */
export interface HookCtx {
  seat?: SeatId
  /** The acting Unit (attacker, mover, arriving Unit, contester, the Unit that lost HIDDEN). */
  unitId?: UnitId
  /** The Unit the event happens to (attack or charge target, damaged Unit). */
  targetUnitId?: UnitId
  modelIds?: ModelId[]
  batch?: AttackBatch
  entry?: ArrivalEntry
  phase?: RoundPhase
  purpose?: SupplyPurpose
  markerN?: number
  /** The number being folded (pool size, Supply, Total Damage, charge distance). */
  value?: number
  /** Names the exact TriggerEvent when one point serves several (onTargeted: 'targeted' or 'declareRangedAttack';
   *  onChargeRoll: 'chargeDistance' before the roll is known, 'chargeSucceeded' after it succeeded; afterAction:
   *  'actionResolved' or 'attackResolved'; onArrive: 'nominatedToDeploy' or 'arrived'). Absent = every event of the point. */
  cause?: string
  /** B additions (optional, additive). Skip Reaction prompts: only passives run (services that cannot suspend). */
  noPrompt?: boolean
  /** Offer only the Reactions of the event; its Passives already ran (a queued loss of HIDDEN, flushed later). */
  reactionsOnly?: boolean
  /** Whether this Armour / Evade Roll is the first of its kind this Round / this Activation for the rolling Unit (runHook
   *  fills it; conditions with `first` read it). */
  first?: { round: boolean; activation: boolean }
  /** Do not run listeners again, only fold the Effects already in force into the result. Call it with this set after a
   *  raised Reaction has resolved and the pipeline continues in its resume(): listeners must not fire twice. */
  foldOnly?: boolean
  /** Namespace whose resume() continues the pipeline after a Reaction window (default: the open attack's returnTo). */
  returnTo?: string
  /** What kind of reposition ended: 'move' | 'run' | 'deploy' | 'disengage' | 'charge' | 'closeRanks' | 'place' | 'forced'
   *  (movement.reposition and reserves.arrive set it; absent = 'move'). Creep Removal reads it. */
  kind?: string
  /** For code hooks: the Unit that owns the ability being run (a Reaction listener); `unitId` stays the acting Unit. */
  selfUnitId?: UnitId
  /** For code hooks: the ability / card id being run. */
  sourceId?: string
  /** For code hooks: a table edge picked by a `tableEdge` target, or a point picked for the verb. */
  edge?: string
  point?: { x: number; z: number }
  /** For code hooks: the token the previous `setToken` of the same ability placed. */
  tokenId?: string
}

/** Outcome of runHook. `mods` (TN or value modifiers) and `value` (a replaced number) are for fold points such as
 *  attackMods, reduceDamage, poolMods, supplyMods; `veto` for canContest-like gates. `raised` = a Reaction window was
 *  opened (ability.react): the caller returns {state} at once and continues in its resume().
 *  B additions (additive): `rolls` = the roll modifiers in force per kind (positive helps the roller; `mods` carries the
 *  one of the point), `removeDice` = dice to take out of the Attack Pool (Point Defense Laser), `redirectTo` = the Unit
 *  an attack was moved onto (redirect-attack). Granted keywords, canEvade and damageCap live in the Effect list: read
 *  them with effects.keywordOf / effects.effectOps. */
export interface HookResult {
  state: GameState; mods: Mod[]; value?: number; veto?: boolean; raised?: boolean
  rolls?: Partial<Record<'hit' | 'armour' | 'evade' | 'impactHit' | 'charge', number>>
  removeDice?: number
  redirectTo?: UnitId
}

/** The TriggerEvents each hook point serves (data triggers name events; code calls points). */
export const POINT_EVENTS: Readonly<Record<HookPoint, readonly TriggerEvent[]>> = {
  startOfRound: ['startOfRound'],
  beforeAction: ['activated'],
  afterAction: ['actionResolved', 'attackResolved'],
  onTargeted: ['targeted', 'declareRangedAttack'],
  onChargeDeclared: ['declareCharge'],
  onChargeRoll: ['chargeDistance', 'chargeSucceeded'],
  attackMods: [],
  beforeArmourRoll: ['beforeArmourRoll'],
  beforeEvadeRoll: ['beforeEvadeRoll'],
  reduceDamage: ['damageSuffered'],
  onModelsRemoved: ['modelsRemoved'],
  onMoveEnd: ['leadingModelMoveEnd'],
  onArrive: ['nominatedToDeploy', 'arrived'],
  onLoseHidden: ['loseHidden'],
  onPlaceResolved: ['placeResolved'],
  poolMods: [],
  supplyMods: [],
  canContest: [],
  endOfRound: ['endOfRound'],
  cleanup: [],
}

const OPEN_BY_PASSIVE: readonly string[] = ['ability.target']

const SUPPLY_PURPOSE_NAMES: Record<SupplyPurpose, readonly string[]> = {
  pool: ['pool', 'all'], control: ['control', 'contest', 'objectives', 'all'], disengage: ['disengage', 'all'], vp: ['vp', 'all'],
}

/** Run every listener of `point`. See HookCtx / HookResult. Built-in rules first (STATIONARY loss, detection checks,
 *  expiry), then the data listeners, then the fold of the Effects in force into the result.
 *
 *  Protocol for the attack pipeline (attack.ts header): attackMods -> mods (Hit TN, or IMPACT hit TN for an 'impact'
 *  batch) and value (dice left after removeDice); beforeArmourRoll / beforeEvadeRoll -> mods, and for evade value > 0 =
 *  the target may roll (canEvade); reduceDamage with cause 'perDie' folds damageCap, with cause 'total' folds
 *  damageReduce and ends the attack's thisRoll / thisAttack effects; onChargeRoll -> value = distance after rollMods.
 *  After a raised Reaction call again with `foldOnly: true` to read the same result without firing listeners twice. */
/** Test-only observer of hook calls (the HOOK-* wiring test). Never changes state; null in games. */
let tracer: ((point: HookPoint, ctx: HookCtx) => void) | null = null
export function setHookTracer(t: ((point: HookPoint, ctx: HookCtx) => void) | null): void { tracer = t }

export function runHook(state: GameState, bundle: EditionBundle, point: HookPoint, ctx: HookCtx): HookResult {
  tracer?.(point, ctx)
  let s = state
  // `first` conditions (Lurking, Ancillary Carapace, Shield Overcharge): is this the rolling Unit's first roll of its kind?
  const rollKind = point === 'beforeArmourRoll' ? 'armour' : point === 'beforeEvadeRoll' ? 'evade' : null
  const rollBatch = ctx.batch?.id
  if (rollKind && ctx.targetUnitId && rollBatch && !ctx.first) ctx = { ...ctx, first: firstRollFlags(s, ctx.targetUnitId, rollKind, rollBatch) }
  const res: HookResult = { state: s, mods: [], ...(ctx.value !== undefined ? { value: ctx.value } : {}) }
  const live = !ctx.foldOnly

  // 1. built-in rules of the point
  if (live) {
    if (point === 'startOfRound') s = startOfRoundStatuses(s, bundle)
    if (point === 'beforeAction' && ctx.unitId) s = expireEffects(s, bundle, 'untilAction', ctx.unitId) // "until it performs another action"
    if ((point === 'onMoveEnd' || point === 'onPlaceResolved') && ctx.unitId && hasStatus(s, ctx.unitId, 'STATIONARY')) {
      s = setStatus(s, bundle, ctx.unitId, 'STATIONARY', 'lose', 'rule:moved')
    }
    if (point === 'onMoveEnd' || point === 'onPlaceResolved' || point === 'onArrive') s = detect(s, bundle)
    if (point === 'afterAction') {
      if (ctx.unitId) s = expireEffects(s, bundle, 'endOfActivation', ctx.unitId)
      s = expireEffects(expireEffects(s, bundle, 'thisAttack'), bundle, 'thisRoll')
    }
  }

  // 2. data listeners (passives run, reactions are offered)
  if (live) {
    // A passive fired by the action that just ended (Burrow Ambush on arrival) may have opened a decision of its own; a
    // second window raised here would overwrite it. Hand control back as raised: that decision resumes the turn.
    // The decision apply() is answering is still state.pending until a new one is raised, so it does not count.
    if (point === 'afterAction' && ctx.unitId && OPEN_BY_PASSIVE.includes(s.pending.kind) && s.pending.id !== answeringId()) { res.state = s; res.raised = true; return res }
    // passives without a trigger whose only business is a code hook (Creep Removal, Omega Network)
    for (const r of abilityRefs(s, bundle)) {
      if (r.ability.type !== 'passive' || r.ability.trigger || (r.unitId && s.units[r.unitId]?.location !== 'table')) continue
      for (const e of r.ability.effects) {
        if (e.op !== 'code' || !CODE_POINTS[String(e.code)]?.includes(point)) continue
        const cr = runCode(s, bundle, { code: String(e.code), args: e.args as Record<string, unknown> | undefined }, { ...ctx, seat: r.seat, selfUnitId: r.unitId ?? undefined, sourceId: r.ability.id })
        s = cr.state
        if (cr.raised) { res.state = s; res.raised = true; return res }
      }
    }
    if (point === 'afterAction' && ctx.unitId) {
      const k = offerKhala(s, bundle, ctx.unitId)
      if (k) { s = k; if (k.pending.id !== state.pending.id) { res.state = s; res.raised = true; return res } }
    }
    // A loss of HIDDEN queued by a service that could not suspend (effects.setStatus): offer its Reactions here.
    if (!ctx.noPrompt && FLUSH_LOSE_HIDDEN.includes(point)) {
      for (const u of Object.values(s.units)) {
        const q = u.effects.find((e) => e.source === LOSE_HIDDEN_QUEUE)
        if (!q) continue
        s = removeEffects(s, u.id, (e) => e.id === q.id)
        const r = dispatch(s, bundle, 'loseHidden', { unitId: u.id, seat: u.owner, reactionsOnly: true, ...(ctx.returnTo ? { returnTo: ctx.returnTo } : {}) }, 'onLoseHidden')
        s = r.state
        if (r.raised) { res.state = s; res.raised = true; return res }
      }
    }
    const all = POINT_EVENTS[point]
    // `cause` names the event when it is one of this point's events; otherwise it is the caller's own note (a reposition kind...)
    const named = ctx.cause && (all as readonly string[]).includes(ctx.cause) ? [ctx.cause as TriggerEvent] : all
    const events = point === 'reduceDamage' && ctx.cause === 'perDie' ? [] : named
    for (const ev of events) {
      const r = dispatch(s, bundle, ev, ctx, point)
      s = r.state
      if (r.raised) { res.state = s; res.raised = true; return res }
    }
    if (point === 'endOfRound') {
      const d = runDelayedStep(s, bundle, 'endOfRound')
      s = d.state
      if (d.suspended) { res.state = s; res.raised = true; return res }
    }
    if (point === 'cleanup') {
      for (const clock of ['endOfRound', 'endOfPhase', 'endOfActivation', 'thisAttack', 'thisRoll'] as const) s = expireEffects(s, bundle, clock)
      s = refreshCards(s)
    }
  }

  // 3. fold what is in force into the result
  const attacker = ctx.unitId, target = ctx.targetUnitId
  const kind = ctx.batch?.kind
  const sc = { weaponId: ctx.batch?.weaponId ?? undefined, targetUnitId: target }
  const rolls: NonNullable<HookResult['rolls']> = {}
  const addMod = (v: number | undefined) => { if (v) res.mods.push({ source: `hook:${point}`, label: point, value: v, mode: 'add' }) }
  if (point === 'attackMods' && attacker) {
    rolls.hit = rollModOf(s, bundle, attacker, 'hit', sc)
    rolls.impactHit = rollModOf(s, bundle, attacker, 'impactHit', sc)
    addMod(kind === 'impact' ? rolls.impactHit : rolls.hit)
  }
  if (point === 'beforeArmourRoll' && target) { rolls.armour = rollModOf(s, bundle, target, 'armour', { attackerUnitId: attacker, ...(ctx.first ? { first: ctx.first } : {}) }); addMod(rolls.armour) }
  if (point === 'beforeEvadeRoll' && target) { rolls.evade = rollModOf(s, bundle, target, 'evade', { attackerUnitId: attacker, ...(ctx.first ? { first: ctx.first } : {}) }); addMod(rolls.evade) }
  if (point === 'onChargeRoll' && attacker) {
    rolls.charge = rollModOf(s, bundle, attacker, 'charge', { targetUnitId: target })
    if (res.value !== undefined && rolls.charge) res.value += rolls.charge
  }
  if (Object.keys(rolls).length) res.rolls = rolls
  if (live && rollKind && target && rollBatch) s = noteRoll(s, target, rollKind, rollBatch)

  if (point === 'beforeEvadeRoll' && target && res.value !== undefined) {
    // canEvade grants (Combat Shield, Hallucination, Hierarch's Stand) turn "not eligible" into eligible
    const vs = kind === 'closeCombat' ? 'closeCombat' : kind === 'hits' || kind === 'impact' ? 'enemyAbilityDamage' : 'ranged'
    if (effectOps(s, bundle, target, 'canEvade', { attackerUnitId: attacker, ...(ctx.first ? { first: ctx.first } : {}) }).some((l) => ((l.rec.vs as string[] | undefined) ?? []).some((x) => x === 'all' || x === vs))) res.value = Math.max(res.value, 1)
  }
  if (point === 'reduceDamage' && target && res.value !== undefined) {
    let v = res.value
    if (ctx.cause !== 'total') {
      for (const l of effectOps(s, bundle, target, 'damageCap', { attackerUnitId: attacker })) if (typeof l.rec.max === 'number') v = Math.min(v, l.rec.max)
    }
    if (ctx.cause !== 'perDie') {
      // damageReduce (Life Support, Dae'uhl): reduce, but never below its `min` when the damage was at least that.
      const seen = new Set<string>()
      for (const l of effectOps(s, bundle, target, 'damageReduce', { attackerUnitId: attacker })) {
        if (seen.has(l.source)) continue
        seen.add(l.source)
        const n = typeof l.rec.n === 'number' ? l.rec.n : 0
        const min = typeof l.rec.min === 'number' ? l.rec.min : 0
        v = Math.max(v - n, Math.min(v, min))
      }
      if (ctx.cause === 'total') s = expireEffects(expireEffects(s, bundle, 'thisAttack'), bundle, 'thisRoll')
    }
    res.value = v
  }
  if (point === 'attackMods' && target) {
    // removeDice (Point Defense Laser): taken out of the Attack Pool now, then consumed.
    const n = effectOps(s, bundle, target, 'removeDice', { attack: kind === 'closeCombat' ? 'closeCombat' : 'ranged', ...(attacker ? { attackerUnitId: attacker } : {}) }).reduce((t, l) => t + (typeof l.rec.n === 'number' ? l.rec.n : 0), 0)
    if (n > 0) {
      res.removeDice = n
      if (res.value !== undefined) res.value = Math.max(0, res.value - n)
      s = removeEffects(s, target, (e) => e.kind === 'mod' && (e.data as { op?: string } | undefined)?.op === 'removeDice')
    }
  }
  if (point === 'onTargeted' && attacker) {
    const red = effectOps(s, bundle, attacker, 'redirect')[0]
    if (red && typeof red.rec.unit === 'string') res.redirectTo = red.rec.unit
  }
  if (point === 'supplyMods' && ctx.unitId && ctx.purpose && res.value !== undefined) res.value = foldSupply(s, bundle, ctx.unitId, ctx.purpose, res.value)
  if (point === 'canContest' && ctx.unitId) {
    if (hasStatus(s, ctx.unitId, 'BURROWED') || keywordOf(s, bundle, ctx.unitId, 'STRUCTURE')) res.veto = true
  }
  res.state = s
  return res
}

const FLUSH_LOSE_HIDDEN: readonly HookPoint[] = ['onMoveEnd', 'onPlaceResolved', 'onArrive', 'afterAction', 'beforeAction']
const FIRST_ROLL = '__firstRoll'
type RollKind = 'armour' | 'evade'
const rollMarks = (state: GameState, unitId: UnitId, kind: RollKind) =>
  (state.units[unitId]?.effects ?? []).filter((e) => e.source === FIRST_ROLL && e.round === state.round && e.data?.kind === kind)
/** Is a roll of this Batch the Unit's first Armour / Evade Roll this Round, and in the current Activation? Asking again for the same Batch gives the same answer. */
function firstRollFlags(state: GameState, unitId: UnitId, kind: RollKind, batchId: string): { round: boolean; activation: boolean } {
  const others = rollMarks(state, unitId, kind).filter((e) => e.data?.batch !== batchId)
  return { round: others.length === 0, activation: !others.some((e) => e.data?.act === String(state.activeUnit)) }
}
function noteRoll(state: GameState, unitId: UnitId, kind: RollKind, batchId: string): GameState {
  if (rollMarks(state, unitId, kind).some((e) => e.data?.batch === batchId)) return state
  return addEffect(state, unitId, { source: FIRST_ROLL, kind: 'mod', expires: 'endOfRound', bySeat: state.units[unitId]?.owner ?? '', round: state.round, data: { op: 'firstRoll', kind, batch: batchId, act: String(state.activeUnit) } })
}

/** supplyOverride effects on a unit for one purpose: `value` replaces, `delta` adds, `floor` bounds (SUP overrides). */
function foldSupply(state: GameState, bundle: EditionBundle, unitId: UnitId, purpose: SupplyPurpose, current: number): number {
  const names = SUPPLY_PURPOSE_NAMES[purpose]
  let v = current
  let floor = 0
  const ops = effectOps(state, bundle, unitId, 'supplyOverride').filter((l) => ((l.rec.purposes as string[] | undefined) ?? []).some((p) => names.includes(p)))
  for (const l of ops) if (typeof l.rec.value === 'number') v = l.rec.value
  const seen = new Set<string>()
  for (const l of ops) {
    if (typeof l.rec.floor === 'number') floor = Math.max(floor, l.rec.floor) // a floor stands on its own (Freedom Fighters)
    if (typeof l.rec.delta !== 'number' || seen.has(l.source)) continue
    seen.add(l.source)
    v += l.rec.delta
  }
  return Math.max(floor, v)
}
