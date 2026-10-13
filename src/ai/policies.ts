// Policies by decision kind (spec 30 s3; owner M). A policy returns one of ctx.legal (or a completed parameterised
// template) or null for "no opinion" (the decider then answers with the random policy). Policies score candidates
// with eval/threat/moves and pick with choose/pickBest (easy draws from its top three). The decider looks up the exact
// kind first, then the '<namespace>.*' entry. Engine numbers come from query.* (and eval.ts); nothing here re-derives a rule.
import type { AbilityDef, WeaponSel } from '../data/types'
import * as query from '../engine/query'
import { attackPreview, unitSupply } from '../engine/query'
import type { Action, UnitId } from '../engine/types'
import { activationValue, attackValue, bestAttack, bestCharge, casualtyCost, chargeValue, deployValue, passValue } from './eval'
import { bestChargeEnd, bestDeploySpot, bestEntry, bestMove, choose, deployPlan, localTerm, placeGoal } from './moves'
import { completePlace } from './random'
import { chargeOddsOf, reachOfUnit, edgeDist, longestReach, threatAt, threatsFor, weaponsOf } from './threat'
import { timeUp, type AiContext, type Policy, type PolicyTable, type Scored } from './types'
import { dist, enemyUnitsOf, leaderOf, modelsOf } from './world'
import type { GameState } from '../engine/types'

/** Highest score; easy adds Gaussian-ish noise (params.noise x score spread). Ties break on ctx.rng. */
export function pickBest<T>(ctx: AiContext, scored: readonly Scored<T>[]): Scored<T> | null {
  if (!scored.length) return null
  const vals = scored.map((s) => s.score.value)
  const spread = Math.max(...vals) - Math.min(...vals)
  const sigma = ctx.params.noise * (spread || 1)
  let best: Scored<T> | null = null
  let bestV = -Infinity
  for (const s of scored) {
    const n = sigma ? (ctx.rng() + ctx.rng() + ctx.rng() - 1.5) * 2 * sigma : 0
    const v = s.score.value + n + ctx.rng() * 1e-9
    if (v > bestV) { bestV = v; best = s }
  }
  return best
}

/** A decision with exactly one answer. */
export const pickOnly: Policy = (ctx) => (ctx.legal.length === 1 && !ctx.legal[0]!.type.endsWith('.place') ? ctx.legal[0]! : null)

const sc = (value: number, parts: Scored['score']['parts'] = {}): Scored['score'] => ({ value, parts })
const unitIdOf = (a: Action): UnitId | null => (typeof a.unitId === 'string' ? a.unitId : null)
const supplyOf = (ctx: AiContext, id: UnitId): number => unitSupply(ctx.q, ctx.bundle, id)
const lastRound = (ctx: AiContext): boolean => ctx.view.maxRounds != null && ctx.view.round >= ctx.view.maxRounds

/** The best-scoring option of `ctx.legal` under `f`, via choose (null score = skip the option). */
function bestOf(ctx: AiContext, f: (a: Action) => Scored['score'] | null): Action | null {
  const scored: Scored[] = []
  for (const action of ctx.legal) {
    if (scored.length && timeUp(ctx)) break
    const score = f(action)
    if (score) scored.push({ action, score })
  }
  return choose(ctx, scored)?.action ?? null
}

// ---------------------------------------------------------------- ability value (data-driven, spec 30 s7.5)
/** Rough gain of one effect op for the side using it. Ops with no entry (summons, tokens, place, status, code...) add 0:
 *  the bot leaves them alone rather than guess. */
const OP_GAIN: Record<string, number> = {
  buff: 3, grantKeyword: 2.5, rollMod: 3, weaponMod: 3, hits: 4, canEvade: 2.5, damageReduce: 2.5, debuff: 2.5, heal: 2,
  move: 2, charge: 2.5, chargeAgain: 3, aura: 1.5, cleanse: 1, setChar: 1.5, detection: 1, nonLethal: 0, returnToReserves: -5,
}
const ABILITIES = new WeakMap<object, Map<string, AbilityDef>>()
function abilityDef(ctx: AiContext, id: string): AbilityDef | undefined {
  let m = ABILITIES.get(ctx.bundle)
  if (!m) {
    m = new Map()
    const add = (a: AbilityDef | undefined) => { if (a && !m!.has(a.id)) m!.set(a.id, a) }
    for (const u of ctx.bundle.records.units) { u.abilities.forEach(add); u.upgrades.forEach((g) => add(g.ability)) }
    for (const c of ctx.bundle.records.cards) c.abilities.forEach(add)
    ABILITIES.set(ctx.bundle, m)
  }
  return m.get(id)
}
const GATES = new WeakMap<GameState, Map<string, boolean>>()
function memoGate(ctx: AiContext, key: string, f: () => boolean): boolean {
  let m = GATES.get(ctx.q)
  if (!m) { m = new Map(); GATES.set(ctx.q, m) }
  let v = m.get(key)
  if (v === undefined) { v = f(); m.set(key, v) }
  return v
}
/** Some enemy unit is inside the unit's reach this Round (Run, or Move plus its longest weapon, or a charge), edge to edge. */
function enemyInReach(ctx: AiContext, unitId: UnitId): boolean {
  return memoGate(ctx, `reach:${unitId}`, () => {
    const r = reachOfUnit(ctx, unitId)
    if (!r) return false
    const reach = Math.max(r.run ?? r.move ?? 0, (r.move ?? 0) + longestReach(ctx, ctx.q, unitId), r.chargeMax ?? 0) + 1
    return enemyUnitsOf(ctx.q, ctx.seat).some((e) => edgeDist(ctx.q, unitId, e.id) <= reach)
  })
}
/** The threat map says an enemy can hit the unit where it stands. */
function unitExposed(ctx: AiContext, unitId: UnitId): boolean {
  return memoGate(ctx, `exposed:${unitId}`, () => {
    const lead = leaderOf(ctx.q, unitId)
    return !!lead && threatAt(ctx, threatsFor(ctx), unitId, lead.pos).attackers.length > 0
  })
}
/** The menu action this unit's activation is taking (activationMenu stores it in memory.plan before the window opens). */
function planStep(ctx: AiContext, unitId: UnitId): string | null {
  const p = ctx.memory.plan
  return p && p.unitId === unitId && p.round === ctx.view.round && p.phase === ctx.view.roundPhase ? p.steps[0] ?? null : null
}
/** Which weapon phase an effect aims at (its `to` / `weapons` selector), or null when it names none. */
function effectPhase(ctx: AiContext, unitId: UnitId, e: Record<string, unknown>): 'assault' | 'combat' | null {
  for (const sel of [e.to, e.weapons]) {
    if (!sel || typeof sel !== 'object') continue
    const w = sel as WeaponSel
    if (w.phase) return w.phase
    if (w.ids) return weaponsOf(ctx, ctx.q, unitId).find((x) => w.ids!.includes(x.id))?.phase ?? null
  }
  return null
}
const CHARGE_STEPS: readonly string[] = ['charge.go']
/** Does this effect help the activation the unit is taking? Offensive gains need a step that uses them (or, with no plan,
 *  an enemy in reach); defensive ones need a threat on the unit. */
function effectHelps(ctx: AiContext, unitId: UnitId, e: Record<string, unknown>, window: string | undefined): boolean {
  const op = String(e.op ?? '')
  const step = planStep(ctx, unitId)
  const reach = enemyInReach(ctx, unitId)
  switch (op) {
    case 'charge': case 'chargeAgain': case 'impact': case 'impactBonus': return step ? CHARGE_STEPS.includes(step) && window !== 'after' : reach
    case 'rollMod': {
      const roll = String(e.roll ?? '')
      if (roll === 'charge' || roll === 'impactHit') return step ? CHARGE_STEPS.includes(step) && window !== 'after' : reach
      if (roll === 'evade') return unitExposed(ctx, unitId)
      return reach
    }
    case 'canEvade': case 'damageReduce': case 'damageCap': return unitExposed(ctx, unitId)
    case 'grantKeyword': case 'weaponMod': case 'buff': case 'debuff': case 'hits': case 'denyKeyword': {
      if (e.char === 'speed') return step ? step === 'move.go' || step === 'move.run' || step === 'charge.go' || reach : reach
      const ph = effectPhase(ctx, unitId, e)
      if (ph === 'assault') return step ? step === 'shoot.go' : reach
      if (ph === 'combat') return step ? step === 'charge.go' || step === 'melee.go' || reach : reach
      return reach
    }
    default: return true
  }
}
/** Gain and cost of using an ability now: gain from its effect ops that help what the unit is doing (phase band must
 *  fit), cost from its printed price plus any damage it deals the unit as Supply at risk. */
function abilityNet(ctx: AiContext, abilityId: string, unitId?: UnitId, window?: string): { gain: number; cost: number } {
  const def = abilityDef(ctx, abilityId)
  if (!def) return { gain: 0, cost: 9 }
  const phase = ctx.view.roundPhase
  if (def.phase !== 'any' && phase && def.phase !== phase) return { gain: 0, cost: 9 }
  const hurt = Object.values(ctx.view.units).some((u) => u.owner === ctx.seat && u.damage > 0)
  let gain = 0
  let extra = 0
  for (const e of def.effects) {
    const op = (e as { op?: string }).op ?? ''
    const dur = (e as { duration?: string }).duration
    if (window === 'after' && (dur === 'endOfActivation' || dur === 'untilNextAction')) continue // over before it can matter
    if (op === 'nonLethal' && unitId) { // damage that stays on the unit, as Supply at risk
      const xv = (e as Record<string, unknown>).x
      const x = typeof xv === 'number' ? xv : 1
      const hp = modelsOf(ctx.q, unitId).reduce((a, m) => a + m.hp, 0)
      extra += hp > 0 ? 5 * (x / hp) * supplyOf(ctx, unitId) : 1
      continue
    }
    const g = op === 'heal' && !hurt ? 0 : (OP_GAIN[op] ?? 0)
    gain += unitId && g > 0 && !effectHelps(ctx, unitId, e as Record<string, unknown>, window) ? 0 : g
  }
  if (def.options?.length) gain = 0
  const n = def.cost?.n
  const cost = (def.cost ? (typeof n === 'number' ? (n === 0 ? 0.2 : 1.5 * n) : 3) : 1.2) + extra
  return { gain, cost }
}
const wantAbility = (ctx: AiContext, net: { gain: number; cost: number }, margin: number): boolean =>
  net.gain > 0 && (ctx.params.abilities === 'first' || net.gain - net.cost >= margin)

// ---- setup (spec 30 s3.1)
/** setup.colour / setup.draftControl: control the mission draft (the card whose markers decide the game). */
export const draftSetup: Policy = (ctx) => (ctx.pending.kind === 'setup.draftControl' ? ctx.legal.find((a) => a.control === 'mission') ?? null : null)
/** setup.ban / setup.pick: no card values in the view; the random policy answers. */
export const draftCard: Policy = () => null
/** setup.terrain: no cover numbers in the view; the random policy answers. */
export const terrainPick: Policy = () => null
/** setup.firstPlayer: keep the First Player Marker. */
export const firstPlayer: Policy = (ctx) => ctx.legal.find((a) => a.holder === ctx.seat) ?? null

// ---- turn flow (spec 30 s4)
/** turn.first: activate first ourselves (first grab of markers, first shots). */
export const firstActivator: Policy = (ctx) => ctx.legal.find((a) => a.first === ctx.seat) ?? null

/** A charge below this chance is not worth the stranded exposure. */
const MIN_CHARGE_CHANCE = 0.34

/** turn.activate: which unit and which menu action, or Pass. Deploy first, then moves; shoot before charge before run;
 *  Hold and Pass only when nothing productive is left (Pass takes the First Player Marker in Phases 1-2). */
export const activationMenu: Policy = (ctx) => {
  const only = pickOnly(ctx)
  if (only) { if (only.type === 'turn.pass') ctx.memory.passed.add(`${ctx.view.round}:${ctx.view.roundPhase}`); return only }
  const threats = threatsFor(ctx)
  const phase = ctx.view.roundPhase
  const plan = phase === 'movement' ? deployPlan(ctx, threats) : []
  const tempo = ctx.params.wTempo > 0
  // Shooting, charging and Running are alternatives of one activation: they share one value scale (20 + their gain in the
  // Assault Phase; in the Movement Phase a Run competes with Move on the 10 + scale).
  const group = phase === 'movement' ? 10 : 20
  const best = bestOf(ctx, (a) => {
    const u = unitIdOf(a)
    const t = a.type
    if (t === 'turn.pass') return sc(tempo ? 2 + passValue(ctx, threats).value : -1)
    if (t === 'turn.hold') return sc(1)
    if (!u) return sc(0.5)
    if (t === 'deploy.go') {
      const i = plan.indexOf(u)
      return sc(i >= 0 ? 100 - i * 0.1 + deployValue(ctx, u, threats) * 0.01 : lastRound(ctx) ? 90 : -5)
    }
    if (t === 'move.go') return sc(10 + activationValue(ctx, u, t, threats).value)
    if (t === 'move.disengage') return sc(0.5 + activationValue(ctx, u, t, threats).value)
    if (t === 'move.run') return sc(group + activationValue(ctx, u, t, threats).value - (phase === 'movement' ? 0.3 : 0))
    if (t === 'shoot.go') return sc(20 + Math.max(0, bestAttack(ctx, u)?.score.value ?? 0))
    if (t === 'charge.go') {
      const c = bestCharge(ctx, u)
      return !c || c.chance < MIN_CHARGE_CHANCE || c.value <= 0 ? sc(-1) : sc(20 + c.value)
    }
    if (t === 'melee.go') return sc(10 + Math.max(0, bestAttack(ctx, u)?.score.value ?? 0))
    if (t.startsWith('mission.')) return sc(15)
    if (t === 'ability.action') {
      const net = abilityNet(ctx, String(a.abilityId), u, 'action')
      return sc(wantAbility(ctx, net, 1.5) ? 5 + net.gain - net.cost : 0.4)
    }
    return sc(0.5)
  })
  const bu = best ? unitIdOf(best) : null
  if (best && bu) ctx.memory.plan = { unitId: bu, round: ctx.view.round, phase: phase ?? '', steps: [best.type] }
  if (best?.type === 'turn.pass') ctx.memory.passed.add(`${ctx.view.round}:${phase}`)
  return best
}
/** turn.order / score.order: the order of our own simultaneous effects does not change a number we can see. */
export const orderEffects: Policy = () => null

// ---- movement and deployment (spec 30 s5-6)
export const movePath: Policy = (ctx) => bestMove(ctx, threatsFor(ctx))
/** move.place: head for the best marker (or the enemy); random.completePlace validates the spot against the dry run. */
export const movePlace: Policy = (ctx) => {
  const t = ctx.legal[0]
  if (!t || typeof t.unitId !== 'string') return null
  return completePlace(ctx, t, placeGoal(ctx, t.unitId, threatsFor(ctx)) ?? undefined)
}
export const deployEntry: Policy = (ctx) => pickOnly(ctx) ?? bestEntry(ctx, threatsFor(ctx))
export const deployPath: Policy = (ctx) => bestDeploySpot(ctx, threatsFor(ctx))
/** deploy.drop: drop the reserve unit with the best value, else skip. */
export const deployDrop: Policy = (ctx) => {
  const threats = threatsFor(ctx)
  const drop = bestOf(ctx, (a) => {
    const u = unitIdOf(a)
    return a.type === 'deploy.drop' && u ? sc(supplyOf(ctx, u) + Math.max(0, deployValue(ctx, u, threats))) : null
  })
  return drop ?? ctx.legal.find((a) => a.type === 'deploy.skip') ?? null
}

// ---- attacks (spec 30 s7)
/** Value of one Batch: eval.attackValue, or (while that is neutral) the exact query.attackPreview numbers. */
function batchScore(ctx: AiContext, unitId: UnitId, weaponId: string, targetId: UnitId): Scored['score'] {
  const ev = attackValue(ctx, unitId, weaponId, targetId)
  const focus = 0.2 * (ctx.view.units[targetId]?.damage ?? 0)
  if (ev.value !== 0 || Object.keys(ev.parts).length) return sc(ev.value + focus, ev.parts)
  const p = attackPreview(ctx.q, ctx.bundle, unitId, weaponId, targetId)
  const cost = supplyOf(ctx, targetId)
  const supply = p.expectedSupplyRemoved
  const kill = ctx.params.wKill * p.killChance * cost * 0.5
  return sc(supply + kill + 0.1 * p.expectedDamage + focus, { supply, kill, damage: p.expectedDamage })
}
/** shoot.batch: (weapon, target) by value with focus fire; 'done' only when nothing scores above 0. */
export const shootBatch: Policy = (ctx) => {
  const done = ctx.legal.find((a) => a.done === true)
  const pick = bestOf(ctx, (a) => {
    const u = unitIdOf(a)
    return a.done === true || !u || typeof a.weaponId !== 'string' || typeof a.targetUnitId !== 'string' ? null : batchScore(ctx, u, a.weaponId, a.targetUnitId)
  })
  if (!pick) return done ?? null
  if (done) {
    const s = batchScore(ctx, unitIdOf(pick)!, String(pick.weaponId), String(pick.targetUnitId))
    if (s.value <= 0.001) return done
  }
  return pick
}
/** shoot.template: the aim point that catches the most enemy models and the fewest of ours. */
export const shootTemplate: Policy = (ctx) => bestOf(ctx, (a) => {
  const m = typeof a.modelId === 'string' ? ctx.q.models[a.modelId] : undefined
  if (!m) return null
  let v = 0
  for (const o of Object.values(ctx.q.models)) {
    if (o.life !== 'active' || o.offTable || dist(o.pos, m.pos) > 3) continue
    v += o.owner === ctx.seat ? -1.5 : 1
  }
  return sc(v)
})
/** charge.targets: chargeValue (chance x IMPACT and close combat value, less retaliation) of each target set; never prefers a 0-chance set. */
export const chargeTargets: Policy = (ctx) => bestOf(ctx, (a) => {
  const u = unitIdOf(a)
  const ids = Array.isArray(a.targetIds) ? (a.targetIds as UnitId[]) : []
  if (!u || !ids.length) return null
  const chance = chargeOddsOf(ctx, u, ids).chance
  if (chance === 0) return sc(-50)
  const worth = ids.reduce((s, id) => s + supplyOf(ctx, id), 0)
  return sc(chargeValue(ctx, u, ids).value + 0.15 * chance * worth - 0.5 * (ids.length - 1))
})
export const chargePath: Policy = (ctx) => bestChargeEnd(ctx, threatsFor(ctx))
/** charge.impact: aim the dice at the most damaged target, else split evenly. */
export const chargeImpact: Policy = (ctx) => {
  const hurt = bestOf(ctx, (a) => (typeof a.all === 'string' ? sc(ctx.view.units[a.all]?.damage ?? 0) : null))
  if (hurt && (ctx.view.units[String(hurt.all)]?.damage ?? 0) > 0) return hurt
  return ctx.legal.find((a) => a.even === true) ?? null
}
/** melee.closeRanks: bring every model into the Fighting Rank. */
export const meleeCloseRanks: Policy = (ctx) => ctx.legal.find((a) => a.mode === 'close') ?? null
/** melee.split: give the Surge Die to the unit our best weapon can finish first. */
export const meleeSplit: Policy = (ctx) => bestOf(ctx, (a) => {
  const u = unitIdOf(a)
  const t = typeof a.surgeTarget === 'string' ? a.surgeTarget : null
  if (!u || !t) return null
  const weapons = new Set(modelsOf(ctx.q, u).flatMap((m) => m.weapons))
  const cost = supplyOf(ctx, t)
  let best = 0
  for (const w of weapons) {
    if (timeUp(ctx)) break
    const p = attackPreview(ctx.q, ctx.bundle, u, w, t)
    best = Math.max(best, p.expectedSupplyRemoved + ctx.params.wKill * p.killChance * cost * 0.5)
  }
  return sc(best + 0.1 * (ctx.view.units[t]?.damage ?? 0))
})
/** atk.reroll / atk.precision / atk.tough: no rules-complete value is on offer yet; the random policy answers. */
export const diceChoice: Policy = () => null
/** atk.casualty: least casualtyCost (no leader or Shield model, keep weapon specialists, drop the outermost model). */
export const casualty: Policy = (ctx) => {
  const unitId = String((ctx.pending.context as { unitId?: unknown }).unitId ?? '')
  const unit = ctx.view.units[unitId]
  const models = modelsOf(ctx.q, unitId)
  const cx = models.length ? models.reduce((s, m) => s + m.pos.x, 0) / models.length : 0
  const cz = models.length ? models.reduce((s, m) => s + m.pos.z, 0) / models.length : 0
  return bestOf(ctx, (a) => {
    const id = typeof a.modelId === 'string' ? a.modelId : null
    const m = id ? ctx.q.models[id] : undefined
    if (!id || !m || !unit) return null
    const cost = casualtyCost(ctx, unitId, id) + (unit.leadingModelId === id ? 4 : 0) + (unit.modelIds[0] === id ? 2 : 0)
      + 0.5 * m.weapons.length - 0.05 * dist(m.pos, { x: cx, z: cz })
    return sc(-cost)
  })
}

// ---- abilities, cards, resources (spec 30 s7.5)
/** ability.window: use an Active when its gain beats its cost (once per ability and source per Round). */
export const abilityWindow: Policy = (ctx) => {
  const done = ctx.legal.find((a) => a.type === 'ability.done') ?? null
  const wc = ctx.pending.context as { unitId?: unknown; window?: unknown }
  const winUnit = typeof wc.unitId === 'string' ? wc.unitId : undefined
  const winKind = typeof wc.window === 'string' ? wc.window : undefined
  const key = (a: Action) => `ab:${String(a.source)}:${String(a.abilityId)}:${ctx.view.round}:${ctx.view.roundPhase}`
  const pick = bestOf(ctx, (a) => {
    if (a.type !== 'ability.use' || ctx.memory.stuck.has(key(a))) return null
    const net = abilityNet(ctx, String(a.abilityId), winUnit, winKind)
    return wantAbility(ctx, net, 1) ? sc(net.gain - net.cost) : null
  })
  if (!pick) return done
  ctx.memory.stuck.add(key(pick))
  return pick
}
/** ability.target: units by who gains most (friendly) or loses most (enemy); points by the goal term of the mover. */
export const abilityTarget: Policy = (ctx) => {
  const cont = (ctx.pending.context as { cont?: { ctx?: { unitId?: string; targetUnitId?: string }; flow?: { unitId?: string } } }).cont
  const mover = cont?.ctx?.targetUnitId ?? cont?.ctx?.unitId ?? cont?.flow?.unitId
  const stay = ctx.legal.find((a) => a.mode === 'stay')
  if (stay) return stay
  const pick = bestOf(ctx, (a) => {
    if (a.mode === 'unit' && typeof a.unitId === 'string') {
      const u = ctx.view.units[a.unitId]
      return u ? sc((u.owner === ctx.seat ? 1 : 1.2) * supplyOf(ctx, u.id) + 2 * Math.min(u.damage, 3)) : null
    }
    if (a.mode === 'point' && a.point && mover) return sc(localTerm(ctx, a.point as { x: number; z: number }))
    if (a.mode === 'option' || a.mode === 'edge') return sc(0)
    return null
  })
  return pick
}
/** ability.pay: exhaust the cards that carry the fewest active and reaction abilities. */
export const abilityPay: Policy = (ctx) => bestOf(ctx, (a) => {
  const ids = Array.isArray(a.cards) ? (a.cards as string[]) : []
  let v = 0
  for (const id of ids) {
    const c = ctx.bundle.records.cards.find((x) => x.id === id)
    v += c ? c.abilities.filter((x) => x.type !== 'passive').length : 1
  }
  return sc(-v)
})
/** ability.react: one Reaction per activation; take it when its gain beats its cost by the tier's margin. */
export const abilityReact: Policy = (ctx) => {
  const skip = ctx.legal.find((a) => a.type === 'ability.skipReaction') ?? null
  const margin = ctx.params.reactions === 'first' ? 0 : 1.5
  const pick = bestOf(ctx, (a) => {
    if (a.type !== 'ability.useReaction') return null
    const net = abilityNet(ctx, String(a.abilityId))
    return net.gain > 0 && (ctx.params.reactions === 'first' || net.gain - net.cost >= margin) ? sc(net.gain - net.cost) : null
  })
  return pick ?? skip
}

// ---- missions
/** mission.claim / mission.choose: claim with the cheapest carrier (a claim adds VP); decline when nothing is on offer. */
export const missionAction: Policy = (ctx) => {
  const claim = bestOf(ctx, (a) => {
    const u = unitIdOf(a)
    return a.type === 'mission.claim' && u && a.decline !== true ? sc(-supplyOf(ctx, u)) : null
  })
  return claim ?? ctx.legal.find((a) => a.decline === true) ?? null
}

/** Policies by decision kind. Kinds with no entry (and turn.over) use the random policy. */
export const POLICIES: PolicyTable = {
  'setup.colour': draftSetup, 'setup.draftControl': draftSetup, 'setup.ban': draftCard, 'setup.pick': draftCard,
  'setup.terrain': terrainPick, 'setup.firstPlayer': firstPlayer,
  'turn.first': firstActivator, 'turn.activate': activationMenu, 'turn.choose': activationMenu, 'turn.order': orderEffects,
  'score.order': orderEffects,
  'move.path': movePath, 'move.place': movePlace,
  'deploy.entry': deployEntry, 'deploy.path': deployPath, 'deploy.drop': deployDrop,
  'shoot.batch': shootBatch, 'shoot.template': shootTemplate,
  'charge.targets': chargeTargets, 'charge.path': chargePath, 'charge.impact': chargeImpact,
  'melee.closeRanks': meleeCloseRanks, 'melee.split': meleeSplit,
  'atk.reroll': diceChoice, 'atk.precision': diceChoice, 'atk.tough': diceChoice, 'atk.casualty': casualty,
  'ability.window': abilityWindow, 'ability.target': abilityTarget, 'ability.pay': abilityPay, 'ability.react': abilityReact,
  'mission.*': missionAction,
}

/** Run a policy (null when absent). */
export const runPolicy = (p: Policy | undefined, ctx: AiContext): Action | null => (p ? p(ctx) : null)
