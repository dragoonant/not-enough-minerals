// Checklist: ATK-001..033 (who can shoot, target eligibility, batches), TPL, WPN (SIDEARM, SPECIALIST), RA, PH2. Owner A.
// shooting.ts: the Ranged Attack action (spec 13 s5, s9-10): planBatches() lists (weapon profile, eligible targets);
// the seat declares one Batch at a time (shoot.batch), attack.resolveBatch runs it, resume() re-plans on survivors.
// Namespace 'shoot' (a shoot.go; k shoot.batch, shoot.template).
// Which models already fired this Round is kept in UnitState.usage (`shoot.fired:<round>:<modelId>[:<weaponId>]`): a
// Unit takes one Ranged Attack action per Round, so the Round is a safe scope and no new state field is needed.
import type { EditionBundle, Id, WeaponProfile } from '../data/types'
import { unitDef } from './edition'
import { effectOps, hasStatus, keywordOf, removeEffects, weaponProfile } from './effects'
import { engagedWith, isEngaged } from './engage'
import { buildBatch, hasKw, kwX, resolveBatch } from './attack'
import { reject } from './errors'
import { baseRadius } from './geometry'
import { runHook } from './hooks'
import { modelDistance, modelsInCircle } from './measure'
import { option, pushEvents, raiseDecision, updateUnit, type ActionDone, type ModuleDef, type StepResult } from './registry'
import { unitModels } from './squads'
import { canSee, canTarget, visibleModels } from './visibility'
import type { Action, AttackBatch, DecisionOption, GameState, ModelId, ModelState, UnitId, UnitState, Vec2 } from './types'

export interface BatchCandidate {
  weaponId: Id
  /** Models that carry the profile and may fire it now. */
  modelIds: ModelId[]
  /** Eligible target units (ATK-010..013). */
  targets: UnitId[]
}

/** Template sizes (inches). GAP: R p.66 prints them only in a diagram; kept here as the one config constant (TPL-008). */
export const TEMPLATE_DIMS = { BT: { diameter: 3 }, FT: { length: 8, width: 2 } } as const

const EPS = 1e-6
const firedKey = (round: number, modelId: ModelId, weaponId?: Id): string => `shoot.fired:${round}:${modelId}${weaponId ? `:${weaponId}` : ''}`
const isSidearm = (p: WeaponProfile): boolean => hasKw(p.keywords, 'SIDEARM')

// ---------------------------------------------------------------- planning
function enemyUnits(state: GameState, unit: UnitState): UnitState[] {
  return Object.values(state.units).filter((u) => u.owner !== unit.owner && u.location === 'table' && unitModels(state, u.id).length > 0)
}

export function carriers(state: GameState, unit: UnitState, profile: WeaponProfile): ModelState[] {
  const sidearm = isSidearm(profile)
  return unitModels(state, unit.id).filter((m) => m.weapons.includes(profile.id) && !unit.usage[sidearm ? firedKey(state.round, m.id, profile.id) : firedKey(state.round, m.id)])
}

/** Result of checkTarget. `reason` (when not ok): friendly, reserves, targetTag, engagedShooter, engagedTarget, restricted,
 *  or a SeeReason word (hidden, noLos, destroyed) or outOfRange. */
export interface TargetCheck { ok: boolean; reason?: string; contributors: { modelId: ModelId; far: boolean }[]; seen: ModelId[] }

/** All of ATK-010..014 and ATK-020 for one profile, one target and the models that would fire. */
export function checkTarget(state: GameState, b: EditionBundle, unit: UnitState, profile: WeaponProfile, car: ModelState[], target: UnitState): TargetCheck {
  const fail = (reason: string): TargetCheck => ({ ok: false, reason, contributors: [], seen: [] })
  if (target.owner === unit.owner) return fail('friendly')
  if (target.location !== 'table') return fail('reserves')
  const tags = unitDef(b, target.profileId)?.combatTags ?? []
  const tagOk = profile.target === 'all' ? tags.includes('ground') || tags.includes('flying') : tags.includes(profile.target)
  if (!tagOk) return fail('targetTag')
  const kws = profile.keywords
  const myEngaged = engagedWith(state, b, unit.id)
  const indomitable = !!keywordOf(state, b, unit.id, 'INDOMITABLE', { attack: 'ranged' })
  const targetEngaged = isEngaged(state, b, target.id)
  if (myEngaged.length) {
    if (!myEngaged.includes(target.id) && !(indomitable && !targetEngaged)) return fail('engagedShooter')
  } else if (targetEngaged && !hasKw(kws, 'PINPOINT') && !keywordOf(state, b, target.id, 'INDOMITABLE', { attack: 'ranged' })) return fail('engagedTarget')
  // targetRestriction (Point Blank): a live restriction bars Units Engaged with the shooter.
  if (effectOps(state, b, unit.id, 'targetRestriction').some((l) => (l.rec.cannotTarget as { engagedWithSelf?: boolean } | undefined)?.engagedWithSelf === true && myEngaged.includes(target.id))) return fail('restricted')
  const indirect = hasKw(kws, 'INDIRECT_FIRE')
  // Coordinated Strike: a spotter friend stands in as the shooter for range and Line of Sight; the carriers still fire.
  const spotter = effectOps(state, b, unit.id, 'coordinatedStrike')[0]
  if (spotter && typeof spotter.rec.friend === 'string' && state.units[spotter.rec.friend]?.location === 'table' && typeof profile.range === 'number') {
    const spots = unitModels(state, spotter.rec.friend)
    const seenFromFriend = unitModels(state, target.id).filter((t) => spots.some((f) => canSee(state, b, f.id, t.id) && modelDistance(f, t) <= (profile.range as number) + EPS))
    if (seenFromFriend.length && car.length) return { ok: true, contributors: car.map((m) => ({ modelId: m.id, far: false })), seen: seenFromFriend.map((m) => m.id) }
  }
  const verdict = canTarget(state, b, unit.id, target.id, { ranged: true, needsLos: !indirect, actorModelIds: car.map((m) => m.id) })
  if (!verdict.ok) return fail(verdict.reasons[0] ?? 'noLos')
  // INDIRECT FIRE with no Visible model: any model may be measured (ATK-014).
  const seen = verdict.models.length ? verdict.models : indirect ? unitModels(state, target.id).map((m) => m.id) : []
  const seenModels = seen.map((id) => state.models[id]).filter((m): m is ModelState => !!m)
  const range = typeof profile.range === 'number' ? profile.range : 0
  const long = kwX(kws, 'LONG_RANGE')
  const contributors: TargetCheck['contributors'] = []
  for (const m of car) {
    // ATK-020 RULING: a model adds dice only for a target model Visible from that model itself (all of them for INDIRECT FIRE).
    const mine = indirect ? seenModels : seenModels.filter((t) => canSee(state, b, m.id, t.id))
    if (!mine.length) continue
    const d = Math.min(...mine.map((t) => modelDistance(m, t)))
    if (d <= range + EPS) contributors.push({ modelId: m.id, far: false })
    else if (long > range && d <= long + EPS) contributors.push({ modelId: m.id, far: true })
  }
  if (!contributors.length) return fail('outOfRange')
  return { ok: true, contributors, seen }
}

/** Is this Unit barred from Ranged Attacks right now (Disengage penalty, ATK-001; wrong Phase; off the table)? */
function mayShoot(state: GameState, unit: UnitState | undefined): unit is UnitState {
  return !!unit && unit.location === 'table' && unit.noShootChargeRound !== state.round && !hasStatus(state, unit.id, 'BURROWED') // VIS-023
}

/** Every profile the unit may still fire this action, with its eligible targets. */
export function planBatches(state: GameState, bundle: EditionBundle, unitId: UnitId): BatchCandidate[] {
  const unit = state.units[unitId]
  if (!mayShoot(state, unit)) return []
  const models = unitModels(state, unitId)
  const engaged = isEngaged(state, bundle, unitId)
  const ids = [...new Set(models.flatMap((m) => m.weapons))]
  const out: BatchCandidate[] = []
  for (const wid of ids) {
    const base = weaponProfile(state, bundle, unitId, wid, { attack: 'ranged' })
    if (!base || base.phase !== 'assault') continue // WPN-001
    if (base.requiresStatus && !hasStatus(state, unitId, base.requiresStatus)) continue // ATK-003
    if (engaged && hasKw(base.keywords, 'BULKY')) continue // ATK-003
    const car = carriers(state, unit, base)
    if (!car.length) continue
    const targets: UnitId[] = []
    for (const t of enemyUnits(state, unit)) {
      const prof = weaponProfile(state, bundle, unitId, wid, { attack: 'ranged', targetUnitId: t.id }) ?? base
      if (checkTarget(state, bundle, unit, prof, car, t).ok) targets.push(t.id)
    }
    if (targets.length) out.push({ weaponId: wid, modelIds: car.map((m) => m.id), targets })
  }
  return out
}

// ---------------------------------------------------------------- templates (TPL-001..005)
interface Covered { main: ModelState[]; spill: Map<UnitId, ModelState[]> }

/** Models a template placed on `aimModel` affects. BT is a circle on the Target Point; FT is a strip from the firing
 *  model. Same elevation only; Flying models only for Target All / Flying weapons (TPL-002..004). */
function covered(state: GameState, b: EditionBundle, profile: WeaponProfile, shooter: ModelState, aimModel: ModelState, targetUnitId: UnitId): Covered {
  const centre: Vec2 = aimModel.pos
  let hit: ModelState[]
  if (profile.template === 'FT') {
    const dx = centre.x - shooter.pos.x, dz = centre.z - shooter.pos.z
    const len = Math.hypot(dx, dz) || 1
    const ux = dx / len, uz = dz / len
    const { length, width } = TEMPLATE_DIMS.FT
    hit = Object.values(state.models).filter((m) => {
      if (m.life !== 'active' || m.offTable || m.id === shooter.id) return false
      const px = m.pos.x - shooter.pos.x, pz = m.pos.z - shooter.pos.z
      const along = px * ux + pz * uz, side = Math.abs(-px * uz + pz * ux)
      return along >= -EPS && along - baseRadius(m.base) <= length && side - baseRadius(m.base) <= width / 2
    })
  } else {
    hit = modelsInCircle(state, centre, TEMPLATE_DIMS.BT.diameter / 2)
  }
  const flyingOk = profile.target !== 'ground'
  const tagsOf = (m: ModelState) => unitDef(b, state.units[m.unitId]?.profileId ?? '')?.combatTags ?? []
  hit = hit.filter((m) => Math.abs(m.elev - aimModel.elev) < 1e-3 && (flyingOk || !tagsOf(m).includes('flying')))
  const primaryTags = tagsOf(aimModel)
  const main = hit.filter((m) => m.unitId === targetUnitId)
  const spill = new Map<UnitId, ModelState[]>()
  for (const m of hit) {
    if (m.unitId === targetUnitId) continue
    if (!tagsOf(m).some((t) => primaryTags.includes(t))) continue // F p.5: one shared Combat Tag
    spill.set(m.unitId, [...(spill.get(m.unitId) ?? []), m])
  }
  return { main, spill }
}

const templateBonus = (p: WeaponProfile): number => (typeof p.roa === 'string' ? Number(/\+(\d+)/.exec(p.roa)?.[1] ?? 0) : 0)

// ---------------------------------------------------------------- declaring and firing
function casualtySet(state: GameState, b: EditionBundle, attacker: UnitState, targetId: UnitId, indirect: boolean): ModelId[] | null {
  if (isEngaged(state, b, targetId)) return null // Engaged priority (DMG-020)
  // ATK-014: INDIRECT FIRE ignores Line of Sight for damage, so every target model may be removed.
  if (indirect) return unitModels(state, targetId).map((m) => m.id)
  return visibleModels(state, b, attacker.id, targetId)
}

/** Mark every carrier as spent for this profile: a profile's fire is never split (ATK-030). */
function spend(state: GameState, unit: UnitState, profile: WeaponProfile, car: ModelState[]): GameState {
  const usage = { ...unit.usage }
  for (const m of car) usage[isSidearm(profile) ? firedKey(state.round, m.id, profile.id) : firedKey(state.round, m.id)] = 1
  return updateUnit(state, unit.id, { usage })
}

function fire(state: GameState, b: EditionBundle, unit: UnitState, profile: WeaponProfile, car: ModelState[], chk: TargetCheck, target: UnitState, aim: ModelState | null, skipHook = false): StepResult {
  let redirectTo: UnitId | undefined
  if (!skipHook) {
    // The hook is told the draft Batch so triggers can match the attack kind, the weapon and INSTANT (ATK-021 / REA).
    const draft = buildBatch(state, b, { seat: unit.owner, attackerUnitId: unit.id, profile, kind: 'ranged', targetUnitId: target.id, contributors: chk.contributors, eligible: null })
    const hook = runHook(state, b, 'onTargeted', { seat: unit.owner, unitId: unit.id, targetUnitId: target.id, phase: 'assault', batch: draft, returnTo: 'shoot' })
    // a Reaction window opened: resume() fires this declared Batch once it closes (nothing is spent yet)
    if (hook.raised) return { state: pushEvents(hook.state, [{ type: 'shoot.declared', unitId: unit.id, weaponId: profile.id, targetUnitId: target.id, aim: aim?.id ?? null }]) }
    state = hook.state
    redirectTo = hook.redirectTo
    // Keywords a declare-time Reaction granted (Smart Shells, Shaped Blast) change the declared Batch: read the profile and
    // the target check again, so far dice (LONG RANGE), INDIRECT FIRE and PINPOINT count for this volley.
    const fresh = weaponProfile(state, b, unit.id, profile.id, { attack: 'ranged', targetUnitId: target.id })
    if (fresh) {
      const again = checkTarget(state, b, unit, fresh, car, target)
      if (again.ok && (!fresh.template || (aim && again.seen.includes(aim.id)))) { profile = fresh; chk = again }
    }
  }
  // Redirect (Hierarch's Stand): the declared Batch moves onto the redirecting Unit when it is a legal target.
  const red = effectOps(state, b, unit.id, 'redirect')[0]
  redirectTo ??= red && typeof red.rec.unit === 'string' ? red.rec.unit : undefined
  if (redirectTo !== undefined) {
    state = removeEffects(state, unit.id, (e) => e.kind === 'mod' && (e.data as { op?: string } | undefined)?.op === 'redirect')
    const to = state.units[redirectTo]
    if (to && to.id !== target.id) {
      const prof = weaponProfile(state, b, unit.id, profile.id, { attack: 'ranged', targetUnitId: to.id }) ?? profile
      const chk2 = checkTarget(state, b, unit, prof, car, to)
      if (chk2.ok) {
        const aim2 = profile.template ? state.models[chk2.seen[0] ?? ''] ?? null : null
        if (!profile.template || aim2) { profile = prof; chk = chk2; target = to; aim = aim2 }
      }
    }
  }
  let s = pushEvents(spend(state, unit, profile, car), [{ type: 'shoot.fire', unitId: unit.id, weaponId: profile.id, targetUnitId: target.id }])
  const indirect = hasKw(profile.keywords, 'INDIRECT_FIRE')
  const eligible = casualtySet(s, b, unit, target.id, indirect)
  if (profile.template && aim) {
    const shooter = s.models[chk.contributors[0]!.modelId]!
    const cov = covered(s, b, profile, shooter, aim, target.id)
    const base = buildBatch(s, b, { seat: unit.owner, attackerUnitId: unit.id, profile, kind: 'ranged', targetUnitId: target.id, contributors: chk.contributors, eligible })
    const bonus = templateBonus(profile) * chk.contributors.length
    const main: AttackBatch = {
      ...base, kind: 'template',
      dieGroups: [{ count: cov.main.length + bonus, hitTN: base.dieGroups[0]?.hitTN ?? null, modelIds: chk.contributors.map((c) => c.modelId) }],
      surgeDice: null, surgeFixed: profile.sDice === 'BT' ? cov.main.length : null,
    }
    const queue: AttackBatch[] = [...cov.spill.entries()].map(([uid, ms]) => ({
      ...main, id: `${main.id}:spill:${uid}`, kind: 'spillover', targetUnitId: uid, keywords: [], surgeFixed: null, surgeDice: null,
      dieGroups: [{ count: ms.length, hitTN: main.dieGroups[0]?.hitTN ?? null, modelIds: main.attackerModelIds }],
      eligible: casualtySet(s, b, unit, uid, false),
    }))
    return resolveBatch(s, b, main, 'hit', 'shoot', queue)
  }
  const batch = buildBatch(s, b, { seat: unit.owner, attackerUnitId: unit.id, profile, kind: 'ranged', targetUnitId: target.id, contributors: chk.contributors, eligible })
  return resolveBatch(s, b, batch, 'hit', 'shoot')
}

function prepare(state: GameState, b: EditionBundle, unitId: UnitId, weaponId: Id, targetUnitId: UnitId):
  { unit: UnitState; target: UnitState; profile: WeaponProfile; car: ModelState[]; chk: TargetCheck } | ReturnType<typeof reject> {
  const unit = state.units[unitId]
  const target = state.units[targetUnitId]
  if (!unit || !target) return reject('E_BAD_TARGET', 'Unknown unit.')
  if (!mayShoot(state, unit)) return reject('E_NOT_LEGAL', 'This unit may not make a Ranged Attack now.')
  const cand = planBatches(state, b, unitId).find((c) => c.weaponId === weaponId)
  if (!cand) return reject('E_NOT_LEGAL', `${weaponId} cannot be fired now.`)
  if (!cand.targets.includes(targetUnitId)) return reject(target.owner === unit.owner ? 'E_BAD_TARGET' : 'E_OUT_OF_RANGE', `${targetUnitId} is not a legal target for ${weaponId}.`)
  const base = weaponProfile(state, b, unitId, weaponId, { attack: 'ranged', targetUnitId })!
  const car = carriers(state, unit, base)
  const chk = checkTarget(state, b, unit, base, car, target)
  return { unit, target, profile: base, car, chk }
}

/** Declare one Batch (fires onTargeted) and hand it to the attack pipeline. Template weapons first ask where to aim. */
export function declareBatch(state: GameState, bundle: EditionBundle, unitId: UnitId, weaponId: Id, targetUnitId: UnitId): StepResult {
  const p = prepare(state, bundle, unitId, weaponId, targetUnitId)
  if ('code' in p) return p
  if (p.profile.template) {
    const aims = p.chk.seen
    return {
      state: raiseDecision(state, {
        seat: p.unit.owner, kind: 'shoot.template', canPass: false, context: { unitId, weaponId, targetUnitId },
        options: aims.map((id) => option(`aim:${id}`, `Aim the template at ${id}`, 'shoot.template', { unitId, weaponId, targetUnitId, modelId: id }, p.unit.owner)),
      }),
    }
  }
  return fire(state, bundle, p.unit, p.profile, p.car, p.chk, p.target, null)
}

// ---------------------------------------------------------------- the decision menu
function batchMenu(state: GameState, b: EditionBundle, unitId: UnitId): StepResult {
  const unit = state.units[unitId]!
  const cands = planBatches(state, b, unitId)
  if (!cands.length) return { state, done: finished(state, unitId) }
  const opts: DecisionOption[] = []
  for (const c of cands) for (const t of c.targets) {
    opts.push(option(`${c.weaponId}>${t}`, `Fire ${c.weaponId} at ${t}`, 'shoot.batch', { unitId, weaponId: c.weaponId, targetUnitId: t }, unit.owner))
  }
  opts.push(option('done', 'Stop shooting', 'shoot.batch', { unitId, done: true }, unit.owner))
  return { state: raiseDecision(state, { seat: unit.owner, kind: 'shoot.batch', canPass: false, context: { unitId, candidates: cands }, options: opts }) }
}

function finished(state: GameState, unitId: UnitId): ActionDone {
  const u = state.units[unitId]
  const fired = !!u && Object.keys(u.usage).some((k) => k.startsWith(`shoot.fired:${state.round}:`))
  return { modelId: unitId, unitId, type: 'shoot.go', triggers: fired ? [{ kind: 'rangedAttack', sourceId: unitId }] : [] }
}

export const shooting: ModuleDef = {
  id: 'shooting',
  kinds: ['shoot'],
  options(state, bundle, unitId) {
    if (state.roundPhase !== 'assault') return []
    const unit = state.units[unitId]
    if (!mayShoot(state, unit)) return []
    if (!planBatches(state, bundle, unitId).length) return []
    return [option('shoot', 'Ranged Attack', 'shoot.go', { unitId }, unit.owner)]
  },
  resolve(state, bundle, action: Action): StepResult {
    const unitId = action.unitId
    if (typeof unitId !== 'string' || !state.units[unitId]) return reject('E_BAD_TARGET', 'No such unit.')
    switch (action.type) {
      case 'shoot.go':
        return batchMenu(state, bundle, unitId)
      case 'shoot.batch': {
        if (action.done === true) return { state, done: finished(state, unitId) }
        if (typeof action.weaponId !== 'string' || typeof action.targetUnitId !== 'string') return reject('E_BAD_PARAM', 'A weapon and a target are needed.')
        return declareBatch(state, bundle, unitId, action.weaponId, action.targetUnitId)
      }
      case 'shoot.template': {
        if (typeof action.weaponId !== 'string' || typeof action.targetUnitId !== 'string' || typeof action.modelId !== 'string') return reject('E_BAD_PARAM', 'A weapon, a target and a target model are needed.')
        const p = prepare(state, bundle, unitId, action.weaponId, action.targetUnitId)
        if ('code' in p) return p
        const aim = state.models[action.modelId]
        if (!aim || aim.unitId !== action.targetUnitId || !p.chk.seen.includes(aim.id)) return reject('E_BAD_TARGET', 'Aim at a visible model of the target.')
        return fire(state, bundle, p.unit, p.profile, p.car, p.chk, p.target, aim)
      }
      default:
        return reject('E_UNKNOWN_KIND', `The shooting module does not handle ${action.type}.`)
    }
  },
  /** A Batch is resolved: plan again on the survivors (ATK-031) or finish the action. */
  resume(state, bundle) {
    const unitId = state.activeUnit ?? (state.pending.context as { unitId?: UnitId }).unitId
    if (!unitId || !state.units[unitId]) return reject('E_BAD_TARGET', 'No active unit to continue the Ranged Attack.')
    // back from a Reaction to the declaration: fire the declared Batch if it is still legal (RULING: else it is not fired)
    for (let i = state.events.length - 1; i >= 0; i--) {
      const e = state.events[i] as { type: string; unitId?: string; weaponId?: string; targetUnitId?: string; aim?: string | null }
      if (e.unitId !== unitId || (e.type !== 'shoot.fire' && e.type !== 'shoot.declared')) continue
      if (e.type === 'shoot.declared' && e.weaponId && e.targetUnitId) {
        const p = prepare(state, bundle, unitId, e.weaponId, e.targetUnitId)
        const aim = e.aim ? state.models[e.aim] : undefined
        if (!('code' in p) && (!p.profile.template || (aim && p.chk.seen.includes(aim.id)))) return fire(state, bundle, p.unit, p.profile, p.car, p.chk, p.target, aim ?? null, true)
      }
      break
    }
    return batchMenu(state, bundle, unitId)
  },
}

/** The Batch a Ranged Attack would build right now (query.attackPreview): the same prepare() and buildBatch() as fire(),
 *  without the onTargeted hook or any spent weapon. A template is aimed at the first Visible model. */
export function previewBatch(state: GameState, b: EditionBundle, unitId: UnitId, weaponId: Id, targetUnitId: UnitId): AttackBatch | ReturnType<typeof reject> {
  const p = prepare(state, b, unitId, weaponId, targetUnitId)
  if ('code' in p) return p
  const eligible = casualtySet(state, b, p.unit, targetUnitId, hasKw(p.profile.keywords, 'INDIRECT_FIRE'))
  const base = buildBatch(state, b, { seat: p.unit.owner, attackerUnitId: unitId, profile: p.profile, kind: 'ranged', targetUnitId, contributors: p.chk.contributors, eligible })
  const aim = p.profile.template ? state.models[p.chk.seen[0] ?? ''] : undefined
  if (!p.profile.template || !aim) return base
  const cov = covered(state, b, p.profile, state.models[p.chk.contributors[0]!.modelId]!, aim, targetUnitId)
  return {
    ...base, kind: 'template', surgeDice: null, surgeFixed: p.profile.sDice === 'BT' ? cov.main.length : null,
    dieGroups: [{ count: cov.main.length + templateBonus(p.profile) * p.chk.contributors.length, hitTN: base.dieGroups[0]?.hitTN ?? null, modelIds: p.chk.contributors.map((c) => c.modelId) }],
  }
}
