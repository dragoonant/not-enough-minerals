// query.ts: every number the client or the AI shows (spec 00 s6). The client and AI use nothing else; each body
// delegates to the owning service or rules module, so the number shown is the number the rules use. Exact over the
// dice (dice.ts distributions), never sampled; a Monte Carlo test checks attackPreview against the real pipeline.
// Pure: hooks are read with noPrompt and their state changes are thrown away.
import type { EditionBundle, Id } from '../data/types'
import { buildBatch, evadeReasons, hasKw, kwX, modelRoa, weaponKeywords } from './attack'
import { chargeNeeded, chargeTargets } from './charge'
import { contest } from './control'
import { atLeastP, binomial, convolve, exprDistribution, finalTN, mean, pAtLeast, pSuccess } from './dice'
import { keywordOf, rollModOf, statOf, weaponProfile, type StatCtx } from './effects'
import { bracketSupply, unitDef } from './edition'
import { engagedWith, isEngaged } from './engage'
import { runHook } from './hooks'
import { highGroundCover, losBetween } from './los'
import { missionOf, scoreRules, sideFor } from './missions'
import { moveReach } from './movement'
import { isRejection } from './errors'
import { meleeTargets } from './melee'
import { previewBatch } from './shooting'
import { coherencyState, tableModels, unitModels } from './squads'
import { available, canArrive, onTableSupply, poolFor } from './supply'
import { updateControl } from './control'
import { canTarget, type SeeVerdict } from './visibility'
import type { AttackBatch, GameState, ModelId, ModelState, SeatId, UnitId, Vec2 } from './types'

// ---------------------------------------------------------------- attack
export interface AttackPreview {
  attackerUnitId: UnitId
  weaponId: Id
  targetUnitId: UnitId
  /** False with a reason when the Batch cannot be declared (out of range, no LoS, HIDDEN, engaged rules...). */
  legal: boolean
  reason?: string
  /** Per contributing model: attack dice and final Hit TN (LONG RANGE groups differ). */
  perModel: { modelId: ModelId; dice: number; hitTN: number | null }[]
  /** Surge: dice expression, whether the target's tags match, expected dice moved. */
  surge: { dice: string | null; tagMatch: boolean; expected: number }
  /** Final Armour / Evade TNs (null = no roll possible) with the reason an Evade roll is or is not granted. */
  armourTN: number | null
  evadeTN: number | null
  evadeReason: string | null
  expectedDamage: number
  /** P(exactly k models removed), index = k. */
  modelsRemoved: number[]
  killChance: number
  expectedSupplyRemoved: number
}

const emptyPreview = (a: UnitId, w: Id, t: UnitId, reason: string): AttackPreview => ({
  attackerUnitId: a, weaponId: w, targetUnitId: t, legal: false, reason, perModel: [], surge: { dice: null, tagMatch: false, expected: 0 },
  armourTN: null, evadeTN: null, evadeReason: null, expectedDamage: 0, modelsRemoved: [1], killChance: 0, expectedSupplyRemoved: 0,
})

/** The close combat Batch the attacker's models would make against `target` (Fighting and Supporting Rank). */
function meleeBatch(state: GameState, bundle: EditionBundle, attacker: UnitId, weaponId: Id, target: UnitId): AttackBatch | string {
  const u = state.units[attacker]
  if (!u || !engagedWith(state, bundle, attacker).includes(target)) return 'notEngaged'
  const profile = weaponProfile(state, bundle, attacker, weaponId, { attack: 'closeCombat', targetUnitId: target })
  if (!profile) return 'noWeapon'
  const contributors = unitModels(state, attacker).filter((m) => m.weapons.includes(weaponId) && meleeTargets(state, bundle, m.id).includes(target)).map((m) => ({ modelId: m.id }))
  if (!contributors.length) return 'noModelInRange'
  return buildBatch(state, bundle, { seat: u.owner, attackerUnitId: attacker, profile, kind: 'closeCombat', targetUnitId: target, contributors, eligible: null })
}

/** Models removed for `total` Damage under the casualty loop (damage.allocate): while some eligible model's HP fits,
 *  one goes; the defender's free pick is modelled as the biggest model that fits (fewest models lost). */
function removedFor(models: ModelState[], total: number, cap: number | null): ModelState[] {
  const alive = [...models]
  const out: ModelState[] = []
  let left = total
  for (;;) {
    if (cap !== null && out.length >= cap) break
    const fits = alive.filter((m) => m.hp <= left).sort((a, b) => b.hp - a.hp)
    if (!fits.length) break
    const m = fits[0]!
    out.push(m)
    alive.splice(alive.indexOf(m), 1)
    left -= m.hp
  }
  return out
}

/** Exact preview of one Batch (spec 00 s6): the same Batch builder, TNs and keyword rules as attack.ts, folded over
 *  the dice distributions of each step. Reactions that have not been played are not counted. */
export function attackPreview(state: GameState, bundle: EditionBundle, attackerUnitId: UnitId, weaponId: Id, targetUnitId: UnitId): AttackPreview {
  const base = weaponProfile(state, bundle, attackerUnitId, weaponId, {})
  if (!base) return emptyPreview(attackerUnitId, weaponId, targetUnitId, 'noWeapon')
  const built = base.phase === 'assault' ? previewBatch(state, bundle, attackerUnitId, weaponId, targetUnitId) : meleeBatch(state, bundle, attackerUnitId, weaponId, targetUnitId)
  if (typeof built === 'string') return emptyPreview(attackerUnitId, weaponId, targetUnitId, built)
  if (isRejection(built)) return emptyPreview(attackerUnitId, weaponId, targetUnitId, built.message)
  const batch = built
  const target = state.units[targetUnitId]!
  const ctx: StatCtx = { targetUnitId, weaponId, attack: batch.kind === 'closeCombat' ? 'closeCombat' : 'ranged' }
  const hookCtx = { seat: batch.attackerSeat, unitId: attackerUnitId, targetUnitId, batch, noPrompt: true, foldOnly: true }
  const profile = weaponProfile(state, bundle, attackerUnitId, weaponId, ctx) ?? base

  // step 1: hits (+ die removal, PRECISION)
  const total = batch.dieGroups.reduce((n, g) => n + g.count, 0)
  const hm = runHook(state, bundle, 'attackMods', { ...hookCtx, value: total })
  let groups = batch.dieGroups.map((g) => ({ ...g }))
  if (hm.value !== undefined && hm.value < total) {
    let cut = total - Math.max(0, hm.value)
    for (const g of [...groups].sort((a, b) => (a.hitTN ?? 99) - (b.hitTN ?? 99))) { const k = Math.min(cut, g.count); g.count -= k; cut -= k }
  }
  const n = groups.reduce((s, g) => s + g.count, 0)
  let hits = [1]
  const perModel: AttackPreview['perModel'] = []
  for (const g of groups) {
    const tn = g.hitTN === null ? null : finalTN(bundle, g.hitTN, hm.mods)
    hits = convolve(hits, binomial(g.count, pSuccess(tn)))
    for (const id of g.modelIds) perModel.push({ modelId: id, dice: modelRoa(state, bundle, profile, id, targetUnitId), hitTN: tn })
  }
  const wk = weaponKeywords(batch)
  const precision = kwX(wk, 'PRECISION')
  if (precision > 0) { const p = new Array<number>(n + 1).fill(0); hits.forEach((pr, h) => { p[Math.min(n, h + precision)]! += pr }); hits = p }

  // step 2: Surge, CRITICAL HIT, DODGE -> (armour pool, direct damage dice)
  const tags = unitDef(bundle, target.profileId)?.combatTags ?? []
  const surgeDist = batch.surgeDice && batch.surgeDice !== 'BT' ? exprDistribution(batch.surgeDice) ?? [1] : batch.surgeFixed !== null ? [...new Array<number>(batch.surgeFixed).fill(0), 1] : [1]
  const tagMatch = profile.surgeTypes.some((t) => tags.includes(t))
  const crit = kwX(wk, 'CRITICAL_HIT')
  const dodge = keywordOf(state, bundle, targetUnitId, 'DODGE', ctx)?.x ?? 0
  const split = new Map<string, number>() // "pool|direct" -> p
  let surgeExpected = 0
  hits.forEach((ph, h) => surgeDist.forEach((ps, v) => {
    const p = ph * ps
    if (!p) return
    let sm = tagMatch && v > 0 ? Math.min(v, h) : 0
    let cm = Math.min(crit, h - sm)
    let budget = dodge
    const cs = Math.min(budget, sm); sm -= cs; budget -= cs
    cm -= Math.min(budget, cm)
    surgeExpected += p * sm
    const key = `${h - sm - cm}|${sm + cm}`
    split.set(key, (split.get(key) ?? 0) + p)
  }))

  // step 3: Armour (+ TOUGH)
  const am = runHook(state, bundle, 'beforeArmourRoll', { ...hookCtx, value: n })
  const armourTN = finalTN(bundle, statOf(state, bundle, targetUnitId, 'armour', ctx), am.mods)
  const tough = keywordOf(state, bundle, targetUnitId, 'TOUGH', ctx)?.x ?? 0
  let dmgDice = [1].slice(0, 0)
  const addAt = (k: number, p: number) => { while (dmgDice.length <= k) dmgDice.push(0); dmgDice[k]! += p }
  for (const [key, p] of split) {
    const [pool, direct] = key.split('|').map(Number) as [number, number]
    binomial(pool, 1 - pSuccess(armourTN)).forEach((pf, f) => addAt(direct + Math.max(0, f - tough), p * pf))
  }
  if (!dmgDice.length) dmgDice = [1]

  // step 4: Evade
  const reasons = evadeReasons(state, bundle, batch)
  const em = runHook(state, bundle, 'beforeEvadeRoll', { ...hookCtx, value: reasons.length ? 1 : 0 })
  const evadeOk = em.value !== undefined ? em.value > 0 : reasons.length > 0
  const evBase = statOf(state, bundle, targetUnitId, 'evade', ctx)
  const anti = kwX(wk, 'ANTI_EVADE')
  const evadeTN = evadeOk && evBase !== null ? finalTN(bundle, evBase, [...em.mods, ...(anti ? [-anti] : [])]) : null
  if (evadeTN !== null) {
    const out: number[] = []
    dmgDice.forEach((p, k) => binomial(k, 1 - pSuccess(evadeTN)).forEach((ps, s) => { out[s] = (out[s] ?? 0) + p * ps }))
    dmgDice = out.map((x) => x ?? 0)
  }

  // step 5: damage per die (PIERCE, damageCap), Total Damage with the marker, casualties
  const setters = wk.filter((k) => k.kw === 'PIERCE' && k.tag !== undefined && k.x !== undefined && tags.includes(k.tag)).map((k) => k.x!)
  let perDie = setters.length ? Math.max(...setters) : batch.dmg
  const cap = runHook(state, bundle, 'reduceDamage', { ...hookCtx, value: perDie, cause: 'perDie' })
  if (cap.value !== undefined) perDie = Math.max(0, cap.value)
  const eligible = isEngaged(state, bundle, targetUnitId) || !batch.eligible ? tableModels(state, targetUnitId) : tableModels(state, targetUnitId).filter((m) => batch.eligible!.includes(m.id))
  const def = unitDef(bundle, target.profileId)
  const alive = tableModels(state, targetUnitId).length
  const conc = kwX(wk, 'CONCENTRATED_FIRE')
  const removed: number[] = []
  let expectedSupplyRemoved = 0
  dmgDice.forEach((p, k) => {
    if (!p) return
    const gone = k === 0 ? 0 : removedFor(eligible, k * perDie + target.damage, conc > 0 ? conc : null).length
    removed[gone] = (removed[gone] ?? 0) + p
    if (def) expectedSupplyRemoved += p * (bracketSupply(def, alive) - bracketSupply(def, alive - gone))
  })
  const modelsRemoved = Array.from({ length: removed.length }, (_, i) => removed[i] ?? 0)
  return {
    attackerUnitId, weaponId, targetUnitId, legal: true, perModel,
    surge: { dice: batch.surgeDice ?? (batch.surgeFixed !== null ? String(batch.surgeFixed) : null), tagMatch, expected: surgeExpected },
    armourTN, evadeTN, evadeReason: evadeTN !== null ? reasons[0] ?? 'granted' : evBase === null ? 'noEvade' : null,
    expectedDamage: mean(dmgDice) * perDie, modelsRemoved, killChance: atLeastP(modelsRemoved, alive), expectedSupplyRemoved,
  }
}

export interface ChargeOdds { targets: UnitId[]; needed: number | null; chance: number; reason?: string }
/** The D6 face needed to charge these targets and its probability (charge.chargeNeeded + dice.pAtLeast). */
export function chargeOdds(state: GameState, bundle: EditionBundle, unitId: UnitId, targetIds: UnitId[]): ChargeOdds {
  const allowed = chargeTargets(state, bundle, unitId)
  const bad = targetIds.find((t) => !allowed.includes(t))
  if (!targetIds.length || bad) return { targets: targetIds, needed: null, chance: 0, reason: bad ? `${bad} cannot be charged` : 'noTarget' }
  const needed = chargeNeeded(state, bundle, unitId, targetIds)
  if (needed === null) return { targets: targetIds, needed, chance: 0, reason: 'outOfReach' }
  const mod = rollModOf(state, bundle, unitId, 'charge')
  return { targets: targetIds, needed, chance: pAtLeast(needed - mod) }
}

// ---------------------------------------------------------------- sight, cover, engagement
/** visibility.canTarget with reasons, for the targeting overlay. */
export function canSee(state: GameState, bundle: EditionBundle, actorUnitId: UnitId, targetUnitId: UnitId): SeeVerdict {
  return canTarget(state, bundle, actorUnitId, targetUnitId, { ranged: true, needsLos: true })
}
export type CoverLevel = 'none' | 'direct' | 'full' | 'highGround'
/** Cover the target would get against this attacker (spec 14 s7): HIGH GROUND, else what blocks every line between the
 *  two units ('direct' when some line is stopped only by Direct Cover), else none. */
export function coverFor(state: GameState, bundle: EditionBundle, attackerUnitId: UnitId, targetUnitId: UnitId): CoverLevel {
  if (highGroundCover(state, bundle, attackerUnitId, targetUnitId)) return 'highGround'
  let best: CoverLevel | null = null
  for (const a of tableModels(state, attackerUnitId)) for (const t of tableModels(state, targetUnitId)) {
    const r = losBetween(state, bundle, a.id, t.id)
    if (r.visible) return 'none'
    if (r.cover === 'direct') best = 'direct'
    else if (best === null) best = 'full'
  }
  return best ?? 'none'
}
/** Units Engaged with this one (engage.engagedWith). */
export function engaged(state: GameState, bundle: EditionBundle, unitId: UnitId): UnitId[] {
  return engagedWith(state, bundle, unitId)
}

// ---------------------------------------------------------------- supply, objectives, mission
export interface SupplyStatus {
  seat: SeatId
  pool: number
  onTable: number
  available: number
  nextPool: number
  /** Reserve units whose CSV fits in Available now. */
  canArriveNow: UnitId[]
}
export function supplyStatus(state: GameState, bundle: EditionBundle, seat: SeatId): SupplyStatus {
  return {
    seat, pool: poolFor(state, bundle), onTable: onTableSupply(state, bundle, seat), available: available(state, bundle, seat),
    nextPool: poolFor(state, bundle, state.round + 1),
    canArriveNow: Object.values(state.units).filter((u) => u.owner === seat && u.location === 'reserves' && canArrive(state, bundle, seat, u.id)).map((u) => u.id).sort(),
  }
}

export interface ObjectiveStatus {
  n: number
  totals: Record<SeatId, number>
  controller: SeatId | null
  active: boolean
  /** VP each seat would get from this marker if Scoring ran now. */
  vpNow: Record<SeatId, number>
}
/** Per marker on the table: contest totals and the controller Scoring step 1 would store now (control.contest), and the
 *  marker VP of the Mission's per-marker rules for that controller. */
export function objectiveStatus(state: GameState, bundle: EditionBundle): ObjectiveStatus[] {
  const mission = missionOf(state, bundle)
  return state.markers.filter((m) => m.onTable).map((m) => {
    const c = contest(state, bundle, m.n)
    const vpNow: Record<SeatId, number> = Object.fromEntries(state.seatOrder.map((s) => [s, 0]))
    if (c.controller && mission) {
      for (const r of mission.scoring) {
        if (r.kind === 'perControlledMarker' && state.round >= r.fromRound) vpNow[c.controller]! += r.vp[sideFor(state, m, c.controller)]
        if (r.kind === 'markerControlled' && state.round >= r.fromRound && r.marker === m.n) vpNow[c.controller]! += r.vp
        if (r.kind === 'activatedMarkerCash' && state.round >= r.fromRound && m.active) vpNow[c.controller]! += m.activatedRound ?? 0
      }
    }
    return { n: m.n, totals: c.totals, controller: c.controller, active: m.active, vpNow }
  })
}

export interface MissionScore { seat: SeatId; vp: number; vpIfScoredNow: number; supplyLostByOpponent: number }
/** VP so far, and what Scoring step 2 would add now (control updated first, as step 1 does). */
export function missionScore(state: GameState, bundle: EditionBundle, seat: SeatId): MissionScore {
  const others = state.seatOrder.filter((s) => s !== seat)
  return {
    seat, vp: state.seats[seat]?.vp ?? 0, vpIfScoredNow: scoreRules(updateControl(state, bundle), bundle, seat).vp,
    supplyLostByOpponent: others.reduce((a, o) => a + (state.seats[o]?.supplyLostThisRound ?? 0), 0),
  }
}

// ---------------------------------------------------------------- movement previews
export interface CoherencyPreview { inCoherency: boolean; outOfCoherency: ModelId[]; distance: number }
/** Coherency of a proposed placement (squads.coherencyState). */
export function coherencyPreview(state: GameState, bundle: EditionBundle, unitId: UnitId, placement: Record<ModelId, Vec2>): CoherencyPreview {
  const r = coherencyState(state, bundle, unitId, placement)
  return { inCoherency: r.inCoherency, outOfCoherency: r.outOfCoherency, distance: r.distance }
}

export interface Reach { move: number | null; run: number | null; chargeMin: number | null; chargeMax: number | null }
/** Move, Run and Charge reach of the unit (movement.moveReach; charge = Speed + 1..6 plus charge roll modifiers). */
export function reachOf(state: GameState, bundle: EditionBundle, unitId: UnitId): Reach {
  const r = moveReach(state, bundle, unitId)
  const speed = statOf(state, bundle, unitId, 'speed', { phase: 'assault' })
  const canCharge = chargeTargets(state, bundle, unitId).length > 0 || (speed !== null && !isEngaged(state, bundle, unitId))
  const mod = rollModOf(state, bundle, unitId, 'charge')
  return {
    move: r?.move ?? null, run: r?.run ?? null,
    chargeMin: canCharge && speed !== null ? speed + 1 + mod : null, chargeMax: canCharge && speed !== null ? speed + 6 + mod : null,
  }
}
void hasKw
