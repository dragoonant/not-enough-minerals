// Checklist: ATK (ATK-001..091), HIT, SRG, ARM, EVD, KW (PRECISION, CRITICAL HIT, DODGE, TOUGH, PIERCE, ANTI-EVADE...). Owner A.
// attack.ts: THE attack pipeline (spec 00 s4; spec 13 s6): resolveBatch(batch, entryStep) over {attackPool,
// armourPool, damagePool, surgeDie}: hit > surge > armour > evade > damage. Ranged, close combat and templates enter
// at 'hit'; HITS and IMPACT at 'armour'. Every stage emits an `atk.stage` event (dice, TN, which dice moved where).
// When the Batch and state.attack.queue are done, it clears state.attack and calls resumeIn(returnTo).
// Namespace 'atk' (k atk.casualty is the only decision raised here; PRECISION and TOUGH have no real choice because
// every failed die is equal, so they move dice without asking; atk.reroll is raised by the ability interpreter).
//
// Hook protocol with hooks.runHook (owner B) used here:
//  - attackMods:       ctx.value = attack dice about to be rolled; result.mods = Hit TN modifiers (value > 0 = easier),
//                      result.value = the dice count after die removal (Guardian Shield, Point Defense Laser).
//  - beforeArmourRoll: result.mods = Armour TN modifiers.
//  - beforeEvadeRoll:  ctx.value = 1 when the engine already found the target eligible; result.value > 0 = eligible
//                      (a canEvade grant may turn 0 into 1); result.mods = Evade TN modifiers.
//  - reduceDamage:     called twice with ctx.cause 'perDie' (value = DMG per die, after PIERCE; damageCap acts here)
//                      and 'total' (value = Total Damage incl. the marker; damageReduce acts here); result.value replaces it.
//  A result with raised:true means a Reaction window is open: the step stops and attack.resume() continues the same
//  step without calling that hook again.
import type { CombatTag, EditionBundle, Id, KwRef, WeaponProfile } from '../data/types'
import { unitDef } from './edition'
import { finalTN, rollExpr, test } from './dice'
import { hasStatus, keywordOf, statOf, weaponProfile, type StatCtx } from './effects'
import { engagedWith, isEngaged } from './engage'
import { allocate, continueCasualty } from './damage'
import { isRejection, reject } from './errors'
import { runHook } from './hooks'
import { modelDistance } from './measure'
import { highGroundCover } from './los'
import { pushEvents, resumeIn, type ModuleDef, type StepResult } from './registry'
import { unitModels } from './squads'
import { visibleModels } from './visibility'
import type { AttackBatch, AttackKind, AttackPools, AttackStep, Die, DieGroup, GameState, ModelId, Mod, SeatId, UnitId } from './types'

/** HIT-004 / KW-028: a LONG RANGE model beyond the printed Range rolls at -1 to Hit. Printed in R p.89, not in the data. */
export const LONG_RANGE_HIT_MOD = -1

const RANGED_KINDS: ReadonlySet<AttackKind> = new Set<AttackKind>(['ranged', 'template', 'spillover'])
export const isRangedKind = (k: AttackKind): boolean => RANGED_KINDS.has(k)

// ---------------------------------------------------------------- keyword helpers
/** Weapon keywords that act on this Batch: none for Spillover, HITS and IMPACT (F p.5, KW-044). */
export function weaponKeywords(batch: AttackBatch): KwRef[] {
  return batch.kind === 'spillover' || batch.kind === 'hits' || batch.kind === 'impact' ? [] : batch.keywords
}
/** Highest X of a numeric keyword (keywords never stack, KW-002); 0 when absent. */
export const kwX = (list: readonly KwRef[], kw: string): number =>
  list.reduce((m, k) => (k.kw === kw ? Math.max(m, k.x ?? 0) : m), 0)
export const hasKw = (list: readonly KwRef[], kw: string): boolean => list.some((k) => k.kw === kw)

function statCtx(batch: AttackBatch): StatCtx {
  const c: StatCtx = { targetUnitId: batch.targetUnitId }
  if (batch.weaponId) c.weaponId = batch.weaponId
  if (isRangedKind(batch.kind)) c.attack = 'ranged'
  else if (batch.kind === 'closeCombat') c.attack = 'closeCombat'
  return c
}

const tagsOf = (bundle: EditionBundle, state: GameState, unitId: UnitId): CombatTag[] => {
  const u = state.units[unitId]
  return u ? unitDef(bundle, u.profileId)?.combatTags ?? [] : []
}

// ---------------------------------------------------------------- Batch builders
/** RoA of one model against a target: printed RoA (after effects) + BURST FIRE Y" (X) + LOCKED IN (X) (ATK-040). */
export function modelRoa(state: GameState, _bundle: EditionBundle, profile: WeaponProfile, modelId: ModelId, targetUnitId: UnitId): number {
  const base = typeof profile.roa === 'number' ? profile.roa : 0
  let roa = base
  const m = state.models[modelId]
  const tu = state.units[targetUnitId]
  if (!m || !tu) return roa
  for (const k of profile.keywords) {
    if (k.kw === 'BURST_FIRE' && k.y !== undefined && k.x !== undefined) {
      const near = unitModels(state, targetUnitId).some((t) => modelDistance(m, t) <= k.y! + 1e-6)
      if (near) roa += k.x
    }
  }
  const locked = kwX(profile.keywords, 'LOCKED_IN')
  if (locked > 0 && hasStatus(state, targetUnitId, 'STATIONARY')) roa += locked
  return roa
}

export interface BuildSpec {
  seat: SeatId
  attackerUnitId: UnitId
  profile: WeaponProfile
  kind: 'ranged' | 'closeCombat'
  targetUnitId: UnitId
  /** Models that add dice; `far` = beyond the printed Range but inside LONG RANGE (rolls at -1 to Hit). */
  contributors: { modelId: ModelId; far?: boolean }[]
  /** Casualty-eligible models snapshotted now (DMG-002); null = Engaged priority. */
  eligible: ModelId[] | null
  /** Replace the profile's keywords (close combat splits give PRECISION to one pool). */
  keywords?: KwRef[]
  /** False: no Surge Die for this pool (the Surge target is another pool of a split melee Batch, CC-040). */
  surge?: boolean
}

/** One ranged or close combat Batch from a weapon profile (ATK-030): dice per Hit-TN group, Surge, DMG, keywords. */
export function buildBatch(state: GameState, bundle: EditionBundle, spec: BuildSpec): AttackBatch {
  const near: ModelId[] = [], far: ModelId[] = []
  let nearDice = 0, farDice = 0
  for (const c of spec.contributors) {
    const n = modelRoa(state, bundle, spec.profile, c.modelId, spec.targetUnitId)
    if (c.far) { far.push(c.modelId); farDice += n } else { near.push(c.modelId); nearDice += n }
  }
  const groups: DieGroup[] = []
  if (nearDice > 0 || near.length) groups.push({ count: nearDice, hitTN: finalTN(bundle, spec.profile.hit), modelIds: near })
  if (far.length) groups.push({ count: farDice, hitTN: finalTN(bundle, spec.profile.hit, [LONG_RANGE_HIT_MOD]), modelIds: far })
  const surge = spec.surge !== false && spec.profile.sDice !== null && spec.profile.sDice !== 'BT'
  return {
    id: `atk:${state.round}:${state.rollSeq}:${spec.attackerUnitId}:${spec.profile.id}:${spec.targetUnitId}`,
    kind: spec.kind,
    attackerSeat: spec.seat,
    attackerUnitId: spec.attackerUnitId,
    attackerModelIds: spec.contributors.map((c) => c.modelId),
    weaponId: spec.profile.id,
    sourceId: null,
    targetUnitId: spec.targetUnitId,
    dieGroups: groups,
    surgeDice: surge ? spec.profile.sDice : null,
    surgeFixed: null,
    dmg: spec.profile.dmg,
    keywords: spec.keywords ?? spec.profile.keywords,
    eligible: spec.eligible,
  }
}

/** A HITS X (Y) Batch (ATK-090): X dice straight into the Armour Pool, DMG Y, no Surge. */
export function hitsBatch(state: GameState, _bundle: EditionBundle, opts: { seat: SeatId; sourceId: Id; targetUnitId: UnitId; x: number; dmg: number }): AttackBatch {
  return {
    id: `hits:${state.round}:${state.rollSeq}:${opts.sourceId}:${opts.targetUnitId}`,
    kind: 'hits', attackerSeat: opts.seat, attackerUnitId: null, attackerModelIds: [], weaponId: null, sourceId: opts.sourceId,
    targetUnitId: opts.targetUnitId, dieGroups: [{ count: Math.max(0, opts.x), hitTN: null, modelIds: [] }],
    surgeDice: null, surgeFixed: null, dmg: opts.dmg, keywords: [], eligible: null,
  }
}

/** IMPACT (ATK-091/092): roll `dice` Impact Hit Rolls at Y+ (a Test: clamp 2..6, natural 1/6) and return the Batch of
 *  successes, to be resolved from the Armour step. Null when nothing passes or the target is HIDDEN (immune, KW-045). */
export function impactBatch(state: GameState, bundle: EditionBundle, opts: { seat: SeatId; sourceId: Id; attackerUnitId: UnitId; targetUnitId: UnitId; dice: number; y: number; modelIds?: ModelId[] }):
  { state: GameState; batch: AttackBatch | null } {
  let s = state
  if (hasStatus(s, opts.targetUnitId, 'HIDDEN')) return { state: s, batch: null }
  const draft: AttackBatch = {
    id: `impact:${s.round}:${s.rollSeq}:${opts.attackerUnitId}:${opts.targetUnitId}`,
    kind: 'impact', attackerSeat: opts.seat, attackerUnitId: opts.attackerUnitId, attackerModelIds: opts.modelIds ?? [], weaponId: null,
    sourceId: opts.sourceId, targetUnitId: opts.targetUnitId, dieGroups: [{ count: opts.dice, hitTN: opts.y, modelIds: opts.modelIds ?? [] }],
    surgeDice: null, surgeFixed: null, dmg: 1, keywords: [], eligible: null,
  }
  let count = opts.dice
  const h = runHook(s, bundle, 'attackMods', { seat: opts.seat, unitId: opts.attackerUnitId, targetUnitId: opts.targetUnitId, batch: draft, value: count })
  s = h.state
  if (h.value !== undefined) count = Math.max(0, h.value)
  const r = test(s, bundle, { count, tn: finalTN(bundle, opts.y, h.mods), purpose: 'impact', ownerId: opts.seat })
  s = pushEvents(r.state, [...(r.event ? [r.event] : []), { type: 'atk.stage', batchId: draft.id, step: 'impact', dice: r.dice.map((d) => d.face), passed: r.successCount }])
  if (r.successCount === 0) return { state: s, batch: null }
  return { state: s, batch: { ...draft, dieGroups: [{ count: r.successCount, hitTN: null, modelIds: opts.modelIds ?? [] }] } }
}

// ---------------------------------------------------------------- pipeline plumbing
type Out = { state: GameState; status: 'next' | 'wait' | 'finish' }

const emptyPools = (): AttackPools => ({ attackPool: [], armourPool: [], damagePool: [], surgeDie: null, surgeResult: 0 })
const placeholder = (batch: AttackBatch, n: number, tag: string): Die[] =>
  Array.from({ length: n }, (_, i) => ({ id: `${batch.id}.${tag}${i}`, face: 0, rerolled: false }))

function setAttack(s: GameState, patch: Partial<NonNullable<GameState['attack']>>): GameState {
  return { ...s, attack: { ...s.attack!, ...patch } }
}
const stageEvent = (batchId: string, step: AttackStep, data: Record<string, unknown>) => ({ type: 'atk.stage', batchId, step, ...data })
const faces = (d: readonly Die[]): number[] => d.map((x) => x.face)

/** Move `n` dice from the end of `from` to a new list (tagged with `via`). */
function moveDice(from: Die[], n: number, via: Die['via']): { rest: Die[]; moved: Die[] } {
  const k = Math.max(0, Math.min(n, from.length))
  const moved = from.slice(from.length - k).map((d) => ({ ...d, via }))
  return { rest: from.slice(0, from.length - k), moved }
}

/** Remove `n` attack dice before the roll; the defender's ability picks them, so the best-TN group goes first (ATK-033). */
function removeDice(groups: DieGroup[], n: number): DieGroup[] {
  const out = groups.map((g) => ({ ...g }))
  let left = n
  const order = out.map((g, i) => i).sort((a, b) => (out[a]!.hitTN ?? 99) - (out[b]!.hitTN ?? 99))
  for (const i of order) {
    const take = Math.min(left, out[i]!.count)
    out[i]!.count -= take
    left -= take
    if (!left) break
  }
  return out
}

// ---------------------------------------------------------------- step 1: Roll to Hit (+ PRECISION)
function hitStep(s0: GameState, b: EditionBundle, skipHook: boolean): Out {
  let s = s0
  let mods: Mod[] = []
  let removeTo: number | undefined
  {
    const batch0 = s.attack!.batch
    const total = batch0.dieGroups.reduce((n, g) => n + g.count, 0)
    const h = runHook(s, b, 'attackMods', { seat: batch0.attackerSeat, unitId: batch0.attackerUnitId ?? undefined, targetUnitId: batch0.targetUnitId, batch: batch0, value: total, ...(skipHook ? { foldOnly: true } : {}) })
    s = h.state
    if (h.raised && !skipHook) return { state: s, status: 'wait' }
    mods = h.mods
    if (h.value !== undefined && h.value < total) removeTo = Math.max(0, h.value)
  }
  const a = s.attack!
  const batch = a.batch
  let groups = batch.dieGroups.map((g) => ({ ...g }))
  if (removeTo !== undefined) groups = removeDice(groups, groups.reduce((n, g) => n + g.count, 0) - removeTo)
  const wk = weaponKeywords(batch)

  const hits: Die[] = []
  let fails: Die[] = []
  const rolled: { count: number; tn: number | null; faces: number[] }[] = []
  const events: Parameters<typeof pushEvents>[1][number][] = []
  groups.forEach((g, idx) => {
    const tn = g.hitTN === null ? null : finalTN(b, g.hitTN, mods)
    const r = test(s, b, { count: g.count, tn, purpose: 'hit', ownerId: batch.attackerSeat, group: idx })
    s = r.state
    if (r.event) events.push(r.event)
    hits.push(...r.successes)
    fails = fails.concat(r.failures)
    rolled.push({ count: g.count, tn, faces: faces(r.dice) })
  })

  // Surge Die: rolled alongside, tracked apart (ATK-041); a template's Surge Result is a fixed count.
  let surgeDie: Die | null = null
  let surgeResult = 0
  if (batch.surgeDice) {
    const r = rollExpr(s, batch.surgeDice, 'surge', batch.attackerSeat)
    if (!isRejection(r)) {
      s = r.state
      events.push(r.event)
      surgeResult = r.value
      surgeDie = { ...r.dice[0]!, face: r.value, surge: true }
    }
  } else if (batch.surgeFixed !== null) surgeResult = batch.surgeFixed

  // PRECISION (X): up to X failed dice become hits (ATK-042).
  const precision = kwX(wk, 'PRECISION')
  const promoted = moveDice(fails, precision, 'precision')
  const armourPool = [...hits, ...promoted.moved]
  const pools: AttackPools = { attackPool: promoted.rest, armourPool, damagePool: [], surgeDie, surgeResult }
  s = pushEvents(s, [...events, stageEvent(batch.id, 'hit', { groups: rolled, hits: hits.length, precision: promoted.moved.length, surge: { die: surgeDie?.face ?? null, result: surgeResult }, armourPool: armourPool.length })])
  return { state: setAttack(s, { pools, step: 'surge' }), status: 'next' }
}

// ---------------------------------------------------------------- step 2: Resolve Surge, CRITICAL HIT, DODGE
function surgeStep(s0: GameState, b: EditionBundle): Out {
  let s = s0
  const a = s.attack!
  const batch = a.batch
  let pools = a.pools
  const wk = weaponKeywords(batch)
  const ctx = statCtx(batch)

  const profile = batch.weaponId && batch.attackerUnitId ? weaponProfile(s, b, batch.attackerUnitId, batch.weaponId, ctx) : null
  const tags = tagsOf(b, s, batch.targetUnitId)
  const match = pools.surgeResult > 0 && !!profile && profile.surgeTypes.some((t) => tags.includes(t))
  let surgeMoved = match ? Math.min(pools.surgeResult, pools.armourPool.length) : 0
  let critMoved = Math.min(kwX(wk, 'CRITICAL_HIT'), pools.armourPool.length - surgeMoved)
  const dodge = batch.kind === 'hits' || batch.kind === 'impact' ? 0 : keywordOf(s, b, batch.targetUnitId, 'DODGE', ctx)?.x ?? 0
  // DODGE is one budget over Surge then CRITICAL HIT; undone dice stay in the Armour Pool (SRG-004).
  let budget = dodge
  const cutS = Math.min(budget, surgeMoved); surgeMoved -= cutS; budget -= cutS
  const cutC = Math.min(budget, critMoved); critMoved -= cutC
  const first = moveDice(pools.armourPool, surgeMoved, 'surge')
  const second = moveDice(first.rest, critMoved, 'critical')
  pools = { ...pools, armourPool: second.rest, damagePool: [...pools.damagePool, ...first.moved, ...second.moved] }
  s = pushEvents(s, [stageEvent(batch.id, 'surge', { tagMatch: match, surgeResult: pools.surgeResult, surgeMoved, critMoved, dodge })])
  return { state: setAttack(s, { pools, step: 'armour' }), status: 'next' }
}

// ---------------------------------------------------------------- step 3: Armour Rolls (+ TOUGH)
function armourStep(s0: GameState, b: EditionBundle, skipHook: boolean): Out {
  let s = s0
  const a = s.attack!
  const batch = a.batch
  const ctx = statCtx(batch)
  let mods: Mod[] = []
  {
    const h = runHook(s, b, 'beforeArmourRoll', { seat: batch.attackerSeat, unitId: batch.attackerUnitId ?? undefined, targetUnitId: batch.targetUnitId, batch, value: a.pools.armourPool.length, ...(skipHook ? { foldOnly: true } : {}) })
    s = h.state
    if (h.raised && !skipHook) return { state: s, status: 'wait' }
    mods = h.mods
  }
  const pools = s.attack!.pools
  const base = statOf(s, b, batch.targetUnitId, 'armour', ctx)
  const tn = finalTN(b, base, mods)
  const r = test(s, b, { count: pools.armourPool.length, tn, purpose: 'armour', ownerId: s.units[batch.targetUnitId]?.owner })
  s = r.state
  // TOUGH (X): up to X failed results become successes (ARM-002); highest TOUGH only (keywordOf already folds).
  const tough = keywordOf(s, b, batch.targetUnitId, 'TOUGH', ctx)?.x ?? 0
  const failures = r.autoFail ? placeholder(batch, r.failCount, 'f') : r.failures
  const flipped = Math.min(tough, failures.length)
  const toDamage = failures.slice(flipped).map((d) => ({ ...d }))
  s = pushEvents(s, [...(r.event ? [r.event] : []), stageEvent(batch.id, 'armour', { tn, dice: faces(r.dice), saved: r.successCount + flipped, tough: flipped, toDamage: toDamage.length })])
  const next: AttackPools = { ...pools, armourPool: [], damagePool: [...pools.damagePool, ...toDamage] }
  return { state: setAttack(s, { pools: next, step: 'evade' }), status: 'next' }
}

// ---------------------------------------------------------------- step 4: Evade Rolls (only if eligible)
function evadeStep(s0: GameState, b: EditionBundle, skipHook: boolean): Out {
  let s = s0
  const a = s.attack!
  const batch = a.batch
  const ctx = statCtx(batch)
  const reasons = evadeReasons(s, b, batch)
  let eligible = reasons.length > 0
  let mods: Mod[] = []
  {
    const h = runHook(s, b, 'beforeEvadeRoll', { seat: batch.attackerSeat, unitId: batch.attackerUnitId ?? undefined, targetUnitId: batch.targetUnitId, batch, value: eligible ? 1 : 0, ...(skipHook ? { foldOnly: true } : {}) })
    s = h.state
    if (h.raised && !skipHook) return { state: s, status: 'wait' }
    mods = h.mods
    if (h.value !== undefined) eligible = h.value > 0
  }
  return evadeRoll(s, b, batch, ctx, reasons, eligible, mods)
}

/** Why the target may roll Evade against this Batch before the beforeEvadeRoll hook (ATK-070): Engaged and taking a
 *  Ranged Attack, HIDDEN / BURROWED, INDIRECT FIRE without LoS, an Engaged INDOMITABLE shooter, HIGH GROUND cover.
 *  Exported so query.attackPreview reads the same rule as the roll. */
export function evadeReasons(s: GameState, b: EditionBundle, batch: AttackBatch): string[] {
  const ctx = statCtx(batch)
  const ranged = isRangedKind(batch.kind)
  const reasons: string[] = []
  if (ranged && isEngaged(s, b, batch.targetUnitId)) reasons.push('engagedRanged')
  if (hasStatus(s, batch.targetUnitId, 'HIDDEN') || hasStatus(s, batch.targetUnitId, 'BURROWED')) reasons.push('hiddenOrBurrowed')
  if (ranged && batch.attackerUnitId) {
    if (hasKw(weaponKeywords(batch), 'INDIRECT_FIRE') && visibleModels(s, b, batch.attackerUnitId, batch.targetUnitId).length === 0) reasons.push('indirectNoLos')
    // INDOMITABLE shooter, Engaged, firing at a Unit it is not Engaged with: the defender may Evade (CA-007).
    if (keywordOf(s, b, batch.attackerUnitId, 'INDOMITABLE', ctx) && !engagedWith(s, b, batch.attackerUnitId).includes(batch.targetUnitId)
      && isEngaged(s, b, batch.attackerUnitId)) reasons.push('indomitable')
    if (highGroundCover(s, b, batch.attackerUnitId, batch.targetUnitId)) reasons.push('highGround')
  }
  return reasons
}

function evadeRoll(s0: GameState, b: EditionBundle, batch: AttackBatch, ctx: StatCtx, reasons: string[], eligible: boolean, mods: Mod[]): Out {
  let s = s0
  const pools = s.attack!.pools
  const base = statOf(s, b, batch.targetUnitId, 'evade', ctx)
  // EVD-005: Evade "-" never rolls, even when a rule grants one.
  if (!eligible || base === null || pools.damagePool.length === 0) {
    s = pushEvents(s, [stageEvent(batch.id, 'evade', { eligible: false, reasons, base })])
    return { state: setAttack(s, { step: 'damage' }), status: 'next' }
  }
  const anti = kwX(weaponKeywords(batch), 'ANTI_EVADE')
  const tn = finalTN(b, base, [...mods, ...(anti ? [-anti] : [])])
  const r = test(s, b, { count: pools.damagePool.length, tn, purpose: 'evade', ownerId: s.units[batch.targetUnitId]?.owner })
  s = r.state
  const survivors = new Set(r.failures.map((d) => d.id))
  const damagePool = pools.damagePool.filter((_, i) => survivors.has(r.dice[i]!.id))
  s = pushEvents(s, [...(r.event ? [r.event] : []), stageEvent(batch.id, 'evade', { eligible: true, reasons, tn, dice: faces(r.dice), evaded: r.successCount, remaining: damagePool.length })])
  return { state: setAttack(s, { pools: { ...pools, damagePool }, step: 'damage' }), status: 'next' }
}

// ---------------------------------------------------------------- step 5: damage and casualties
function damageStep(s0: GameState, b: EditionBundle, skipHook: boolean): Out {
  let s = s0
  const a = s.attack!
  const batch = a.batch
  const pool = a.pools.damagePool
  const target = s.units[batch.targetUnitId]
  if (pool.length === 0 || !target || target.location !== 'table') {
    s = pushEvents(s, [stageEvent(batch.id, 'damage', { dice: 0, total: 0 })])
    return { state: s, status: 'finish' }
  }
  const wk = weaponKeywords(batch)
  const tags = tagsOf(b, s, batch.targetUnitId)
  // DMG setters first: PIERCE [TAG] (X) sets DMG; the attacker takes the best of several (KW-029).
  const setters = wk.filter((k) => k.kw === 'PIERCE' && k.tag !== undefined && k.x !== undefined && tags.includes(k.tag)).map((k) => k.x!)
  let perDie = setters.length ? Math.max(...setters) : batch.dmg
  let total = 0
  {
    const cap = runHook(s, b, 'reduceDamage', { seat: batch.attackerSeat, unitId: batch.attackerUnitId ?? undefined, targetUnitId: batch.targetUnitId, batch, value: perDie, cause: 'perDie', ...(skipHook ? { foldOnly: true } : {}) })
    s = cap.state
    if (cap.raised && !skipHook) return { state: s, status: 'wait' }
    if (cap.value !== undefined) perDie = Math.max(0, cap.value)
  }
  const fresh = s.units[batch.targetUnitId]!
  const newDamage = pool.length * perDie
  total = newDamage + fresh.damage
  {
    const red = runHook(s, b, 'reduceDamage', { seat: batch.attackerSeat, unitId: batch.attackerUnitId ?? undefined, targetUnitId: batch.targetUnitId, batch, value: total, cause: 'total', ...(skipHook ? { foldOnly: true } : {}) })
    s = red.state
    if (red.raised && !skipHook) return { state: s, status: 'wait' }
    if (red.value !== undefined) total = Math.max(0, red.value)
  }
  s = pushEvents(setAttack(s, { totalDamage: total }), [stageEvent(batch.id, 'damage', { dice: pool.length, perDie, newDamage, marker: fresh.damage, total })])
  const engaged = isEngaged(s, b, batch.targetUnitId)
  const concentrated = kwX(wk, 'CONCENTRATED_FIRE')
  const r = allocate(s, b, batch.targetUnitId, total, engaged ? 'engaged' : 'visible', batch.eligible, concentrated > 0 ? concentrated : null)
  return { state: r.state, status: r.awaiting ? 'wait' : 'finish' }
}

const STEPS: Record<AttackStep, (s: GameState, b: EditionBundle, skip: boolean) => Out> = {
  hit: hitStep, surge: surgeStep, armour: armourStep, evade: evadeStep, damage: damageStep,
}

function run(state: GameState, bundle: EditionBundle, skipFirstHook: boolean): StepResult {
  let s = state
  let skip = skipFirstHook
  for (let guard = 0; guard < 12; guard++) {
    const a = s.attack
    if (!a) return { state: s }
    const out = STEPS[a.step](s, bundle, skip)
    skip = false
    s = out.state
    if (out.status === 'wait') return { state: s }
    if (out.status === 'finish') return finishBatch(s, bundle)
  }
  return reject('E_NOT_LEGAL', 'The attack pipeline did not terminate.')
}

/** The Batch is done: start the next queued one, or clear the attack and hand control back to the starter. */
function finishBatch(state: GameState, bundle: EditionBundle): StepResult {
  const a = state.attack!
  const s: GameState = { ...state, attack: null }
  const queue = [...a.queue]
  while (queue.length) {
    const next = queue.shift()!
    const u = s.units[next.targetUnitId]
    if (!u || u.location !== 'table') continue
    return resolveBatch(s, bundle, next, next.kind === 'hits' || next.kind === 'impact' ? 'armour' : 'hit', a.returnTo, queue)
  }
  return resumeIn(s, bundle, a.returnTo)
}

/** Start (or continue) an attack: stores state.attack {batch, pools, step, queue, returnTo} and runs stages until a
 *  decision is needed or the attack finishes. `returnTo` = namespace whose resume() runs afterwards ('shoot', 'melee',
 *  'charge', 'ability'). */
export function resolveBatch(state: GameState, bundle: EditionBundle, batch: AttackBatch, entryStep: AttackStep,
  returnTo: string, queue: AttackBatch[] = []): StepResult {
  const pools = emptyPools()
  if (entryStep !== 'hit') pools.armourPool = placeholder(batch, batch.dieGroups.reduce((n, g) => n + g.count, 0), 'a')
  const s: GameState = { ...state, attack: { batch, pools, step: entryStep, totalDamage: null, queue, returnTo } }
  return run(s, bundle, false)
}

export const attack: ModuleDef = {
  id: 'attack',
  kinds: ['atk'],
  options: () => [],
  resolve(state, bundle, action) {
    if (action.type === 'atk.casualty') {
      const r = continueCasualty(state, bundle, action)
      if (isRejection(r)) return r
      if (r.awaiting) return { state: r.state }
      return r.state.attack ? finishBatch(r.state, bundle) : { state: r.state }
    }
    return reject('E_UNKNOWN_KIND', `The attack module does not handle ${action.type}.`)
  },
  /** Continue the open step after a Reaction window it opened (that hook already ran). */
  resume: (state, bundle) => (state.attack ? run(state, bundle, true) : { state }),
}
