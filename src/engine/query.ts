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
import { allWeapons, bracketSupply, rule, unitDef } from './edition'
import { engagedWith, isEngaged } from './engage'
import { runHook } from './hooks'
import { highGroundCover, losBetween } from './los'
import { missionOf, scoreRules, sideFor } from './missions'
import { moveReach } from './movement'
import { isRejection } from './errors'
import { meleeTargets } from './melee'
import { previewBatch } from './shooting'
import { coherencyDistance, coherencyState, linkValid, squadCtx, tableModels, unitModels } from './squads'
import { planBatches } from './shooting'
import { modelDistance } from './measure'
import { baseRadius, edgeDistance } from './geometry'
import { available, canArrive, onTableSupply, poolFor, supplyFor } from './supply'
import { detectorAreas, hasStatus, inDetection } from './effects'
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
  /** Marker disc radius and the control-zone ring radius (marker radius + rules.json contestRange), inches. */
  markerRadius: number
  contestRadius: number
  /** Two or more seats have a Unit that can contest this marker (control.contest; Supply 0 still counts as present). */
  contested: boolean
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
    const markerRadius = baseRadius(rule(bundle, 'markerDiameterMm'))
    const contested = state.seatOrder.filter((x) => c.contesters[x]!.length > 0).length > 1
    return { n: m.n, totals: c.totals, controller: c.controller, active: m.active, vpNow, markerRadius, contestRadius: markerRadius + rule(bundle, 'contestRange'), contested }
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
export interface CoherencyPreview {
  inCoherency: boolean; outOfCoherency: ModelId[]; distance: number
  /** Model pairs a coherency line can be drawn between: base edges within `distance` and a valid link (squads.linkValid). */
  links: [ModelId, ModelId][]
}
/** Coherency of a proposed placement (squads.coherencyState). */
export function coherencyPreview(state: GameState, bundle: EditionBundle, unitId: UnitId, placement: Record<ModelId, Vec2>): CoherencyPreview {
  const r = coherencyState(state, bundle, unitId, placement)
  const nodes = unitModels(state, unitId).filter((m) => placement?.[m.id] || !m.offTable).map((m) => ({ m, pos: placement?.[m.id] ?? m.pos }))
  const ctx = squadCtx(state, bundle, unitId)
  const links: [ModelId, ModelId][] = []
  for (let i = 0; i < nodes.length; i++) for (let j = i + 1; j < nodes.length; j++) {
    const a = nodes[i]!, b = nodes[j]!
    if (edgeDistance(a.pos, a.m.base, b.pos, b.m.base) <= r.distance + 1e-6 && linkValid(ctx, a.pos, baseRadius(a.m.base), b.pos, baseRadius(b.m.base))) links.push([a.m.id, b.m.id])
  }
  return { inCoherency: r.inCoherency, outOfCoherency: r.outOfCoherency, distance: r.distance, links }
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

// ---------------------------------------------------------------- M3 client additions (spec 00 s10)
/** Current Supply Value of one unit (supply.supplyFor, purpose 'pool'): the Reserves tray and the unit card. */
export function unitSupply(state: GameState, bundle: EditionBundle, unitId: UnitId): number {
  return supplyFor(state, bundle, unitId, 'pool')
}

export interface PoolRow { round: number; pool: number | null }
/** The Supply Pool for every Round of the game (null = unlimited, the final Round), for the briefing's Pool table. */
export function poolTable(state: GameState, bundle: EditionBundle): PoolRow[] {
  const last = state.maxRounds ?? 0
  const rows: PoolRow[] = []
  for (let r = 1; r <= last; r++) {
    const p = poolFor(state, bundle, r)
    rows.push({ round: r, pool: Number.isFinite(p) ? p : null })
  }
  return rows
}

/** Units on the table inside an enemy detector area (effects.inDetection): the 'detected' status icon. */
export function detectedUnits(state: GameState, bundle: EditionBundle): UnitId[] {
  if (detectorAreas(state, bundle).length === 0) return []
  return Object.values(state.units).filter((u) => u.location === 'table' && inDetection(state, bundle, u.id)).map((u) => u.id).sort()
}
// ---------------------------------------------------------------- shooting options with reasons (M3 fix)
export type ShotReason = 'wrongPhase' | 'notOnTable' | 'disengaged' | 'burrowed' | 'wrongStatus' | 'bulkyEngaged' | 'spent'
  | 'targetTag' | 'engagedShooter' | 'engagedTarget' | 'noLos' | 'outOfRange' | 'hidden' | 'other'
export interface ShotTarget {
  targetUnitId: UnitId
  eligible: boolean
  reason?: ShotReason
  /** Plain-words reason for the panel (our own wording, with numbers where there are some). */
  text?: string
  /** Nearest base-edge distance and the weapon's range (inches), set for outOfRange and noLos. */
  distance?: number
  range?: number
  /** Eligible only: printed hit TN, best TN actually rolled, and why they differ. */
  printedHit?: number | null
  hitTN?: number | null
  hitNotes?: ('indirectFire' | 'longRange' | 'cover' | 'highGround' | 'modifier')[]
}
export interface ShotWeapon { weaponId: Id; name: string; eligible: boolean; reason?: ShotReason; text?: string; targets: ShotTarget[] }
export interface ShootOptions { unitId: UnitId; canShoot: boolean; reason?: ShotReason; text?: string; weapons: ShotWeapon[] }

const SHOT_TEXT: Record<ShotReason, string> = {
  wrongPhase: 'Ranged Attacks happen in the Assault Phase.', notOnTable: 'This unit is not on the table.',
  disengaged: 'It disengaged this Round, so it may not shoot.', burrowed: 'A burrowed unit cannot shoot.',
  wrongStatus: 'This weapon needs a status the unit does not have.', bulkyEngaged: 'Bulky weapons cannot fire while Engaged.',
  spent: 'Already fired this Round.', targetTag: 'This weapon cannot target that kind of unit.',
  engagedShooter: 'Engaged units may only shoot what they are Engaged with.', engagedTarget: 'The target is Engaged with friendly models.',
  noLos: 'No line of sight.', outOfRange: 'Out of range.', hidden: 'The target is hidden.', other: 'Not a legal target.',
}

/** Per weapon and enemy unit: eligible, or the reason with numbers. Eligibility is shooting.planBatches itself; reasons are
 *  diagnosed from the same visibility, engagement and distance services. For the weapon panel and the action menu. */
export function shootOptions(state: GameState, bundle: EditionBundle, unitId: UnitId): ShootOptions {
  const unit = state.units[unitId]
  const out = (canShoot: boolean, reason: ShotReason | undefined, weapons: ShotWeapon[]): ShootOptions => ({ unitId, canShoot, ...(reason ? { reason, text: SHOT_TEXT[reason] } : {}), weapons })
  if (!unit || unit.location !== 'table') return out(false, 'notOnTable', [])
  if (state.roundPhase !== 'assault') return out(false, 'wrongPhase', [])
  if (unit.noShootChargeRound === state.round) return out(false, 'disengaged', [])
  if (hasStatus(state, unitId, 'BURROWED')) return out(false, 'burrowed', [])
  const plan = planBatches(state, bundle, unitId)
  const models = unitModels(state, unitId)
  const engagedNow = engagedWith(state, bundle, unitId)
  const enemies = Object.values(state.units).filter((u) => u.owner !== unit.owner && u.location === 'table' && tableModels(state, u.id).length > 0).map((u) => u.id).sort()
  const def = unitDef(bundle, unit.profileId)
  const ids = [...new Set(models.flatMap((m) => m.weapons))]
  const weapons: ShotWeapon[] = []
  for (const wid of ids) {
    const base = weaponProfile(state, bundle, unitId, wid, { attack: 'ranged' })
    if (!base || base.phase !== 'assault') continue
    const name = (def ? allWeapons(def).find((w) => w.id === wid)?.name : undefined) ?? base.name
    const cand = plan.find((c) => c.weaponId === wid)
    const wFail = (reason: ShotReason): ShotWeapon => ({ weaponId: wid, name, eligible: false, reason, text: SHOT_TEXT[reason], targets: enemies.map((t) => ({ targetUnitId: t, eligible: false, reason, text: SHOT_TEXT[reason] })) })
    if (base.requiresStatus && !hasStatus(state, unitId, base.requiresStatus)) { weapons.push(wFail('wrongStatus')); continue }
    if (engagedNow.length && hasKw(base.keywords, 'BULKY')) { weapons.push(wFail('bulkyEngaged')); continue }
    const carriers = models.filter((m) => m.weapons.includes(wid) && !Object.keys(unit.usage).some((k) => k.startsWith('shoot.fired:'+state.round+':'+m.id)))
    if (!carriers.length) { weapons.push(wFail('spent')); continue }
    const range = typeof base.range === 'number' ? base.range : 0
    const printed = finalTN(bundle, base.hit)
    const targets: ShotTarget[] = enemies.map((t) => {
      if (cand?.targets.includes(t)) {
        const tns = attackPreview(state, bundle, unitId, wid, t).perModel.map((m) => m.hitTN).filter((x): x is number => x !== null)
        const best = tns.length ? Math.min(...tns) : null
        const notes: NonNullable<ShotTarget['hitNotes']> = []
        if (best !== null && (best !== printed || new Set(tns).size > 1)) {
          if (hasKw(base.keywords, 'INDIRECT_FIRE')) notes.push('indirectFire')
          if (new Set(tns).size > 1) notes.push('longRange')
          const cov = coverFor(state, bundle, unitId, t)
          if (cov === 'highGround') notes.push('highGround'); else if (cov !== 'none') notes.push('cover')
          if (!notes.length) notes.push('modifier')
        }
        return { targetUnitId: t, eligible: true, printedHit: printed, hitTN: best, ...(notes.length ? { hitNotes: notes } : {}) }
      }
      const tags = unitDef(bundle, state.units[t]!.profileId)?.combatTags ?? []
      const tagOk = base.target === 'all' ? tags.includes('ground') || tags.includes('flying') : tags.includes(base.target)
      const near = Math.min(...carriers.flatMap((c) => tableModels(state, t).map((m) => modelDistance(c, m))))
      const fail = (reason: ShotReason, extra: Partial<ShotTarget> = {}): ShotTarget => ({ targetUnitId: t, eligible: false, reason, text: SHOT_TEXT[reason], ...extra })
      if (!tagOk) return fail('targetTag')
      if (engagedNow.length && !engagedNow.includes(t)) return fail('engagedShooter')
      if (isEngaged(state, bundle, t) && !engagedNow.includes(t) && !hasKw(base.keywords, 'PINPOINT')) return fail('engagedTarget')
      const v = canTarget(state, bundle, unitId, t, { ranged: true, needsLos: !hasKw(base.keywords, 'INDIRECT_FIRE'), actorModelIds: carriers.map((m) => m.id) })
      const dTxt = `${near.toFixed(1)}" away, range ${range}"`
      if (!v.ok) {
        if (v.reasons.some((r) => String(r).toLowerCase().includes('hidden'))) return fail('hidden')
        return fail('noLos', { distance: near, range, text: `No line of sight (${dTxt}).` })
      }
      return fail('outOfRange', { distance: near, range, text: `Out of range: ${dTxt}.` })
    })
    weapons.push({ weaponId: wid, name, eligible: !!cand?.targets.length, ...(cand?.targets.length ? {} : { reason: 'other' as ShotReason, text: 'No legal target.' }), targets })
  }
  if (!weapons.some((w) => w.eligible)) return out(false, weapons.length && weapons.every((w) => w.reason === 'spent') ? 'spent' : 'other', weapons)
  return out(true, undefined, weapons)
}
void hasKw
