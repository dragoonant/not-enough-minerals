// Checklist: ABL, REA, CARD, MOD (costs), CA, TRN/XPORT (effect verbs), KW-0xx effects. Owner B.
// abilities.ts: Active / Passive / Reaction abilities and cards (spec 16 s1-5): the one effect interpreter over the
// data Effect vocabulary (spec 20 s2.2), ability windows before/after an action, one Reaction per player per
// Activation, per-round / per-game usage ledgers, and pay(), the one payment solver (cards exhausted for CP/BM/PE).
// Namespace 'ability' (k ability.window, ability.target, ability.pay, ability.react).
//
// Control flow. Every multi-step thing (use an Active, answer a Reaction, a verb that needs a spot) is a small state
// machine whose continuation (`Cont`) is plain JSON stored in the open decision's context, so a saved game replays it.
// The one exception is an attack started by a `hits` verb: attack.ts has its own decisions, so the continuation waits
// as a hidden `__cont` Effect on a Unit and abilities.resume() picks it up when attack.ts hands control back.
import type {
  AbilityDef, Condition, Effect as DataEffect, EditionBundle, Id, KwRef, Resource, Trigger, TriggerEvent, ValueExpr, WeaponSel,
} from '../data/types'
import { bracketSupply, cardDef, deploymentDef, rule, tokenDef, unitDef } from './edition'
import { musterUnit } from './army'
import { CODE_NEEDS_POINT, codeCondition, runCode } from './code-hooks'
import { eligible } from './turnflow'
import { addEffect, abilitiesOf, conditionHolds, hasStatus, keywordOf, liveEffects, readyCards, removeEffects, setStatus, tableModels, unitDistance, unitToPoint, effectOps } from './effects'
import { engagedWith } from './engage'
import { baseRadius, dist } from './geometry'
import type { HookCtx } from './hooks'
import { modelDistance } from './measure'
import { firePending, reposition, type PendingHook, type RepositionResult } from './movement'
import { arrive, queueArrival, raiseDeployNow, returnToReserves } from './reserves'
import { hitsBatch, resolveBatch } from './attack'
import { removeModels, heal, addNonLethal } from './damage'
import { option, pushEvents, raiseDecision, reject, resumeIn, updateUnit, type ActionDone, type ModuleDef, type StepResult } from './registry'
import { endProblem, placeFormation, squadCtx } from './squads'
import { isRejection, TodoError } from './errors'
import { canTarget, detect } from './visibility'
import type {
  Action, AttackBatch, CardState, DecisionOption, Effect, EffectExpiry, GameState, PendingDecision, Rejection, RoundPhase, SeatId, UnitId, Vec2,
} from './types'

/** Who and what an effect list runs for. */
export interface EffectCtx {
  seat: SeatId
  /** Ability, card or mission action id. */
  sourceId: Id
  /** The Unit that owns or uses the ability (null for card abilities with no active Unit). */
  unitId: UnitId | null
  targetUnitId?: UnitId
  point?: Vec2
  /** The Unit of the triggering event (subject of a Reaction). */
  triggerUnitId?: UnitId
  attackerUnitId?: UnitId
  /** B additions (optional, additive). Table edge picked by a `tableEdge` target. */
  edge?: string
  /** The Unit a `summon` created (subject `summoned`). */
  summonedUnitId?: UnitId
  /** The token the last `setToken` placed (a following `detection` / `altEntry` anchors to it). */
  tokenId?: Id
  /** Expiry for effects without their own `duration` (default 'endOfRound', ABL-026). */
  defaultDuration?: EffectExpiry
  /** The hook event being answered, when run from a listener. */
  hook?: HookCtx
  /** What to do when the whole list is finished (opaque; set by the flows in this file). */
  after?: After
  /** Chosen payment option for an ability with `options`. */
  optionId?: Id
}

type After =
  | { k: 'flow'; flow: Flow }
  | { k: 'window'; unitId: UnitId; window: 'before' | 'after' }
  | { k: 'resume'; ns: string }
  | { k: 'delayed'; event: TriggerEvent; phase?: string }
  | { k: 'done'; unitId: UnitId }

// ---------------------------------------------------------------- small helpers
const isSel = (x: unknown): x is WeaponSel => typeof x === 'object' && x !== null && !Array.isArray(x)
const isVec = (p: unknown): p is Vec2 => typeof p === 'object' && p !== null && Number.isFinite((p as Vec2).x) && Number.isFinite((p as Vec2).z)
const seatOf = (state: GameState, unitId: UnitId): SeatId | undefined => state.units[unitId]?.owner
const uniq = <T,>(xs: T[]): T[] => [...new Set(xs)]
const NO_LOS_SKIP = { ranged: false } as const

// ---------------------------------------------------------------- ability references and usage ledger
/** One ability of a Unit or a Ready card. */
export interface AbilityRef { ability: AbilityDef; seat: SeatId; unitId: UnitId | null; cardId: Id | null }
const holderId = (r: AbilityRef): Id => r.unitId ?? r.cardId ?? ''
const refKey = (r: AbilityRef): string => `${holderId(r)}:${r.ability.id}`

/** Every ability on the table side of the game: all Units' printed and bought abilities, Ready cards' abilities. */
export function abilityRefs(state: GameState, bundle: EditionBundle): AbilityRef[] {
  const out: AbilityRef[] = []
  for (const u of Object.values(state.units)) {
    if (u.location === 'destroyed') continue
    for (const a of abilitiesOf(bundle, u)) out.push({ ability: a, seat: u.owner, unitId: u.id, cardId: null })
  }
  for (const seat of Object.keys(state.cards)) for (const { card, def } of readyCards(state, bundle, seat)) {
    for (const a of def.abilities) out.push({ ability: a, seat, unitId: null, cardId: card.id })
  }
  return out
}
function findRef(state: GameState, bundle: EditionBundle, source: Id, abilityId: Id, seat?: SeatId): AbilityRef | undefined {
  const u = state.units[source]
  if (u) {
    const a = abilitiesOf(bundle, u).find((x) => x.id === abilityId)
    return a ? { ability: a, seat: u.owner, unitId: u.id, cardId: null } : undefined
  }
  for (const owner of seat ? [seat] : Object.keys(state.cards)) { // both seats may hold the same card
    const c = (state.cards[owner] ?? []).find((x) => x.id === source)
    const def = c && cardDef(bundle, c.id)
    const a = def?.abilities.find((x) => x.id === abilityId)
    if (c && a) return { ability: a, seat: owner, unitId: null, cardId: c.id }
  }
  return undefined
}

const roundKey = (id: Id, round: number): string => `${id}:round:${round}`
const gameKey = (id: Id): string => `${id}:game`
/** Times the ability was used this Round by (or on) `subject` (R16-6: a card is tracked per Unit it is used on). */
function usedRound(state: GameState, r: AbilityRef, subject: UnitId | null): number {
  const holder = r.unitId ?? subject
  return holder ? state.units[holder]?.usage[roundKey(r.ability.id, state.round)] ?? 0 : 0
}
function usedGame(state: GameState, r: AbilityRef): number {
  if (r.unitId) return state.units[r.unitId]?.usage[gameKey(r.ability.id)] ?? 0
  const c = (state.cards[r.seat] ?? []).find((x) => x.id === r.cardId)
  return c?.usage[gameKey(r.ability.id)] ?? 0
}
/** ABL-021/041: once per Round per Unit per name unless REPEATABLE; ABL-010: once per Game. */
function limitOk(state: GameState, r: AbilityRef, subject: UnitId | null): boolean {
  const a = r.ability
  if (a.limit === 'oncePerGame' && usedGame(state, r) >= 1) return false
  if (!a.repeatable && a.type !== 'passive' && usedRound(state, r, subject) >= 1) return false
  if (a.type === 'passive' && a.limit === 'oncePerRound' && usedRound(state, r, subject) >= 1) return false
  return true
}
function recordUse(state: GameState, r: AbilityRef, subject: UnitId | null): GameState {
  let s = state
  const holder = r.unitId ?? subject
  if (holder && s.units[holder]) {
    const u = s.units[holder]!
    const k = roundKey(r.ability.id, s.round)
    s = updateUnit(s, holder, { usage: { ...u.usage, [k]: (u.usage[k] ?? 0) + 1, ...(r.ability.limit === 'oncePerGame' && r.unitId ? { [gameKey(r.ability.id)]: (u.usage[gameKey(r.ability.id)] ?? 0) + 1 } : {}) } })
  }
  if (r.ability.limit === 'oncePerGame' && !r.unitId) {
    s = { ...s, cards: { ...s.cards, [r.seat]: s.cards[r.seat]!.map((c) => (c.id === r.cardId ? { ...c, usage: { ...c.usage, [gameKey(r.ability.id)]: (c.usage[gameKey(r.ability.id)] ?? 0) + 1 } } : c)) } }
  }
  return s
}

// ---------------------------------------------------------------- cards and payment
const cardsOf = (state: GameState, seat: SeatId): CardState[] => state.cards[seat] ?? []
function setCard(state: GameState, seat: SeatId, cardId: Id, patch: Partial<CardState>): GameState {
  return { ...state, cards: { ...state.cards, [seat]: cardsOf(state, seat).map((c) => (c.id === cardId ? { ...c, ...patch } : c)) } }
}
/** Exhaust one Ready card (the price of its own Active or Reaction). */
function exhaustCard(state: GameState, seat: SeatId, cardId: Id): GameState {
  const i = cardsOf(state, seat).findIndex((c) => c.id === cardId && !c.exhausted)
  if (i < 0) return state
  return { ...state, cards: { ...state.cards, [seat]: cardsOf(state, seat).map((c, j) => (j === i ? { ...c, exhausted: true } : c)) } }
}
/** Cleanup & Refresh (CARD-007): every Exhausted card becomes Ready. */
export function refreshCards(state: GameState): GameState {
  if (!Object.values(state.cards).some((cs) => cs.some((c) => c.exhausted))) return state
  return { ...state, cards: Object.fromEntries(Object.entries(state.cards).map(([s, cs]) => [s, cs.map((c) => (c.exhausted ? { ...c, exhausted: false } : c))])) }
}

const readyWith = (state: GameState, seat: SeatId, res: Resource): CardState[] =>
  cardsOf(state, seat).filter((c) => !c.exhausted && c.resource?.res === res && c.resource.n > 0)

/** Can `seat` pay n of `res` right now (Ready cards carrying the resource)? n 0 is always payable. */
export function canPay(state: GameState, _bundle: EditionBundle, seat: SeatId, res: Resource, n: number): boolean {
  return n <= 0 || readyWith(state, seat, res).reduce((s, c) => s + c.resource!.n, 0) >= n
}

interface PayCandidate { ids: Id[]; waste: number; sig: string; opp: number }
/** Minimal subsets of Ready cards worth at least n, best first: least waste, then lowest opportunity cost (the number
 *  of usable abilities printed on the exhausted cards), then card order (CARD-004). */
function payCandidates(state: GameState, bundle: EditionBundle, seat: SeatId, res: Resource, n: number): PayCandidate[] {
  const ready = readyWith(state, seat, res)
  const out: PayCandidate[] = []
  const total = ready.length
  for (let mask = 1; mask < 1 << Math.min(total, 12); mask++) {
    const pick = ready.filter((_, i) => mask & (1 << i))
    const sum = pick.reduce((s, c) => s + c.resource!.n, 0)
    if (sum < n || pick.some((c) => sum - c.resource!.n >= n)) continue
    out.push({
      ids: pick.map((c) => c.id), waste: sum - n, sig: pick.map((c) => c.id).sort().join('+'),
      opp: pick.reduce((s, c) => s + (cardDef(bundle, c.id)?.abilities.filter((a) => a.type !== 'passive').length ?? 0), 0),
    })
  }
  return out.sort((a, b) => a.waste - b.waste || a.opp - b.opp || a.ids.join().localeCompare(b.ids.join()))
}

/** The one payment solver (spec 16 s5): exhaust cards worth n of `res`; raises ability.pay when the choice matters
 *  (more than one equally cheap, non-equivalent set of cards) and a continuation `then` was given. n 0 pays nothing and
 *  exhausts nothing (Advanced Training: cost {CP, n: 0}). Cannot pay -> E_COST. */
export function pay(state: GameState, bundle: EditionBundle, seat: SeatId, res: Resource, n: number, then?: Record<string, unknown>): StepResult {
  if (n <= 0) return { state }
  const cands = payCandidates(state, bundle, seat, res, n)
  if (cands.length === 0) return reject('E_COST', `Not enough Ready ${res} cards to pay ${n}.`)
  const best = cands.filter((c) => c.waste === cands[0]!.waste)
  const kinds = new Map<string, PayCandidate>()
  for (const c of best) { const sig = c.ids.map((id) => cardsOf(state, seat).find((x) => x.id === id)!.id.replace(/#\d+$/, '')).sort().join('+'); if (!kinds.has(sig)) kinds.set(sig, c) }
  if (kinds.size > 1 && then) {
    const opts = [...kinds.values()].slice(0, 8)
    return {
      state: raiseDecision(state, {
        seat, kind: 'ability.pay', context: { res, n, then }, canPass: false,
        options: opts.map((c, i) => option(`pay${i}`, `Exhaust ${c.ids.join(', ')}`, 'ability.pay', { cards: c.ids }, seat)),
      }),
    }
  }
  return { state: cands[0]!.ids.reduce((s, id) => exhaustCard(s, seat, id), state) }
}

// ---------------------------------------------------------------- effective abilities (abilityMod) and costs
function abilityModRecs(state: GameState, bundle: EditionBundle, r: AbilityRef): DataEffect[] {
  if (!r.unitId) return []
  const u = state.units[r.unitId]!
  const out: DataEffect[] = effectOps(state, bundle, r.unitId, 'abilityMod').map((l) => l.rec)
  if (u.location === 'reserves') {
    for (const a of abilitiesOf(bundle, u)) if (a.type === 'passive' && a.trigger?.event === 'nominatedToDeploy') out.push(...a.effects.filter((e) => e.op === 'abilityMod'))
  }
  return out.filter((e) => e.ability === r.ability.id)
}
/** The ability with `abilityMod` effects applied (usableInReserves flag, count.plus, radius, target.range). */
export function effectiveAbility(state: GameState, bundle: EditionBundle, r: AbilityRef): AbilityDef & { usableInReserves?: boolean } {
  const mods = abilityModRecs(state, bundle, r)
  if (mods.length === 0) return r.ability
  const a: AbilityDef & { usableInReserves?: boolean } = { ...r.ability, effects: r.ability.effects.map((e) => ({ ...e })) }
  for (const m of mods) {
    const field = String(m.field)
    const delta = typeof m.delta === 'number' ? m.delta : 0
    if (field === 'usableInReserves') a.usableInReserves = m.value !== false
    else if (field === 'target.range' && a.target) a.target = { ...a.target, range: typeof m.value === 'number' ? m.value : (a.target.range ?? 0) + delta }
    else if (field === 'count.plus') {
      for (const e of a.effects) for (const k of ['x', 'n'] as const) {
        const v = e[k]
        if (v && typeof v === 'object') e[k] = { ...(v as ValueExpr), plus: ((v as ValueExpr).plus ?? 0) + delta }
      }
    } else if (field === 'radius') for (const e of a.effects) if (typeof e.radius === 'number') e.radius = typeof m.value === 'number' ? m.value : e.radius + delta
  }
  return a
}

/** The cost of using `ability` once, with cost modifiers folded in (CARD-008), and which modifiers applied. */
export function costOf(state: GameState, bundle: EditionBundle, r: AbilityRef, userUnitId: UnitId | null, optionId?: Id,
  /** 'skip' leaves out cost Reactions (Advanced Training): R p.82 10.4 makes using one the player's choice. */
  reactions: 'use' | 'skip' = 'use'): { res: Resource; n: number; mods: AbilityRef[] } | null {
  const a = r.ability
  const base = optionId ? a.options?.find((o) => o.id === optionId)?.cost ?? a.cost : a.cost
  if (!base) return null
  let n = typeof base.n === 'number' ? base.n : 0
  const mods: AbilityRef[] = []
  let floor = 0
  const reactionFree = !state.reactionsUsed.includes(r.seat)
  for (const l of abilityRefs(state, bundle)) {
    const t = l.ability.trigger
    if (l.ability.type === 'active' || !t) continue
    const costRecs = l.ability.effects.filter((e) => e.op === 'costMod' && e.res === base.res && (e.ability === undefined || e.ability === a.id))
    if (costRecs.length === 0) continue
    if (t.event === 'usesAbility') {
      if (reactions === 'skip' && l.ability.type === 'reaction') continue
      if (l.unitId && state.units[l.unitId]?.location !== 'table') continue
      if (l.seat !== r.seat || !matchTrigger(state, bundle, l, t, { unitId: userUnitId ?? undefined, seat: r.seat }, 'usesAbility')) continue
      if (!limitOk(state, l, userUnitId) || (l.ability.type === 'reaction' && !reactionFree) || n <= 0) continue
    } else if (t.event === 'nominatedToDeploy') {
      if (!l.unitId || l.unitId !== userUnitId || state.units[l.unitId]?.location !== 'reserves' || costRecs.every((e) => e.ability !== a.id)) continue
    } else continue
    for (const e of costRecs) {
      if (e.when && !conditionHolds(state, bundle, e.when as Condition, l.unitId ?? userUnitId, {})) continue
      n += typeof e.delta === 'number' ? e.delta : 0
      if (typeof e.floor === 'number') floor = Math.max(floor, e.floor)
      mods.push(l)
    }
  }
  // Auras that reach the user (Khalai Ingenuity): the source's own once-per-Round limit is charged to its holder.
  if (userUnitId && n > 0) {
    for (const l of effectOps(state, bundle, userUnitId, 'costMod')) {
      const e = l.rec
      if (e.res !== base.res || (e.ability !== undefined && e.ability !== a.id) || n <= 0) continue
      const src = abilityRefs(state, bundle).find((x) => x.ability.id === l.source && x.seat === l.bySeat && x.ability.type === 'passive' && !x.ability.trigger
        && !mods.includes(x) && limitOk(state, x, x.unitId))
      if (!src || (e.when && !conditionHolds(state, bundle, e.when as Condition, userUnitId, {}))) continue
      n += typeof e.delta === 'number' ? e.delta : 0
      if (typeof e.floor === 'number') floor = Math.max(floor, e.floor)
      mods.push(src)
    }
  }
  return { res: base.res, n: Math.max(floor, n), mods }
}

// ---------------------------------------------------------------- trigger matching (shared with hooks.ts)
const relation = (state: GameState, r: AbilityRef, u: UnitId | undefined, kind: NonNullable<Trigger['who']> | NonNullable<Trigger['subject']>): boolean => {
  if (kind === 'any') return true
  if (!u) return false
  const owner = seatOf(state, u)
  if (kind === 'self') return u === r.unitId
  if (kind === 'friendly') return owner === r.seat
  if (kind === 'otherFriendly') return owner === r.seat && u !== r.unitId
  return !!owner && owner !== r.seat
}
const attackKindOf = (ctx: HookCtx): 'ranged' | 'closeCombat' | undefined => {
  const k = ctx.batch?.kind
  return k === 'ranged' || k === 'template' || k === 'spillover' ? 'ranged' : k === 'closeCombat' ? 'closeCombat' : undefined
}
const phaseOf = (state: GameState, ctx: HookCtx): RoundPhase | null => ctx.phase ?? state.roundPhase

/** The Unit `to: triggerUnit` means: the trigger's subject when it names one, otherwise the actor of the event. */
export function triggerUnitOf(t: Trigger | undefined, ctx: HookCtx): UnitId | undefined {
  return t?.subject ? ctx.targetUnitId ?? ctx.unitId : ctx.unitId
}

/** Does the event described by `ctx` satisfy the trigger of this listener (spec 20 s2.3)? */
export function matchTrigger(state: GameState, bundle: EditionBundle, r: AbilityRef, t: Trigger, ctx: HookCtx, event: TriggerEvent): boolean {
  if (t.event !== event) return false
  const actor = ctx.unitId
  const subject = ctx.targetUnitId ?? ctx.unitId
  const who = t.who ?? (t.subject ? 'any' : 'self')
  if (!relation(state, r, actor, who)) return false
  if (t.subject && !relation(state, r, subject, t.subject)) return false
  const ak = attackKindOf(ctx)
  if (t.attack && t.attack !== 'any' && ak !== t.attack) return false
  if (t.phase && phaseOf(state, ctx) !== t.phase) return false
  if (t.within !== undefined) {
    const anchor = t.subject ? subject : actor
    if (!r.unitId || !anchor || unitDistance(state, r.unitId, anchor) > t.within + 1e-6) return false
  }
  if (t.filter) {
    const about = t.subject ? subject : actor
    const sc = {
      ...(ak ? { attack: ak } : {}), ...(ctx.targetUnitId ? { targetUnitId: ctx.targetUnitId } : {}), ...(ctx.unitId ? { attackerUnitId: ctx.unitId } : {}),
      ...(ctx.batch?.sourceId ? { fromAbility: ctx.batch.sourceId } : {}), instant: !!ctx.batch?.keywords.some((k: KwRef) => k.kw === 'INSTANT'),
      ...(ctx.entry ? { entryKind: ctx.entry.kind } : {}), ...(ctx.phase ? { phase: ctx.phase } : {}), ...(ctx.first !== undefined ? { first: ctx.first } : {}),
    }
    if (!conditionHolds(state, bundle, t.filter, about ?? null, sc)) return false
  }
  return true
}

/** Is the listener itself in a position to act (on the table, phase band, requires)? */
function listenerReady(state: GameState, bundle: EditionBundle, r: AbilityRef, ctx: HookCtx, event: TriggerEvent): boolean {
  const a = r.ability
  if (r.unitId) {
    const u = state.units[r.unitId]
    if (!u) return false
    const inReserves = u.location === 'reserves' && event === 'nominatedToDeploy' && ctx.unitId === r.unitId
    if (u.location !== 'table' && !inReserves) return false
    if (isDormant(state, bundle, r.unitId) && r.ability.id !== 'structure') return false
  }
  const ph = phaseOf(state, ctx)
  if (a.phase !== 'any' && ph && a.phase !== ph) return false
  if (a.requires && !conditionHolds(state, bundle, a.requires, r.unitId ?? ctx.unitId ?? null, {})) return false
  return true
}

// ---------------------------------------------------------------- the interpreter
function expiryOf(rec: DataEffect, ctx: EffectCtx, dflt?: EffectExpiry): EffectExpiry {
  const d = rec.duration
  if (d === 'untilNextAction') return 'untilAction'
  if (typeof d === 'string') return d as EffectExpiry
  return dflt ?? ctx.defaultDuration ?? 'endOfRound'
}

function evalNum(state: GameState, bundle: EditionBundle, x: unknown, ctx: EffectCtx, subject: UnitId): number {
  if (typeof x === 'number') return x
  if (!x || typeof x !== 'object') return 0
  const v = x as ValueExpr
  let n = 0
  if (v.count === 'ownModelsWithinTarget') {
    const d = v.d ?? 0
    const theirs = tableModels(state, subject)
    n = ctx.unitId ? tableModels(state, ctx.unitId).filter((m) => theirs.some((t) => modelDistance(m, t) <= d + 1e-6)).length : 0
  } else if (v.count === 'modelsInUnit') n = tableModels(state, subject).length
  else if (v.count === 'tokensWithin') n = state.tokens.filter((t) => t.defId === v.token && unitToPoint(state, subject, t.pos) <= (v.d ?? 0) + 1e-6).length
  return n + (v.plus ?? 0)
}

function subjectsOf(state: GameState, bundle: EditionBundle, rec: DataEffect, ctx: EffectCtx): UnitId[] {
  // a list cut short by a raised window carries the Units still waiting (RESPAWN / MORPH)
  if (Array.isArray(rec.__subjects)) return uniq((rec.__subjects as UnitId[]).filter((x) => !!state.units[x]))
  const to = rec.to
  const dflt = ctx.targetUnitId ?? ctx.unitId ?? undefined
  let ids: (UnitId | undefined)[]
  if (to === undefined || isSel(to) || to === 'self') ids = [to === 'self' ? ctx.unitId ?? undefined : dflt]
  else if (to === 'target') ids = [ctx.targetUnitId]
  else if (to === 'attacker') ids = [ctx.attackerUnitId]
  else if (to === 'triggerUnit') {
    // RULING: a debuff aimed at the trigger Unit never lands on the listener's own side when the event's actor is an enemy
    // (Concussive Shells names a friendly subject but means the charger).
    const t = ctx.triggerUnitId
    const swap = rec.op === 'debuff' && t && state.units[t]?.owner === ctx.seat && ctx.attackerUnitId && state.units[ctx.attackerUnitId]?.owner !== ctx.seat
    ids = [swap ? ctx.attackerUnitId : t]
  }
  else if (to === 'summoned') ids = [ctx.summonedUnitId]
  else if (to === 'allFriendly' || to === 'allEnemy') {
    const filter = rec.unitFilter as Condition | undefined
    ids = Object.values(state.units).filter((u) => u.location === 'table' && (to === 'allFriendly') === (u.owner === ctx.seat) && conditionHolds(state, bundle, filter, u.id, {})).map((u) => u.id)
  } else if (to === 'engagedEnemies') ids = ctx.unitId ? engagedWith(state, bundle, ctx.unitId) : []
  else if (to === 'tokenArea') {
    const radius = typeof rec.radius === 'number' ? rec.radius : 0
    const toks = state.tokens.filter((t) => t.defId === rec.token && t.owner === ctx.seat)
    ids = Object.values(state.units).filter((u) => u.location === 'table' && toks.some((t) => unitToPoint(state, u.id, t.pos) <= radius + 1e-6)).map((u) => u.id)
  } else ids = []
  return uniq(ids.filter((x): x is UnitId => !!x && !!state.units[x]))
}

function storeEffect(state: GameState, unitId: UnitId, rec: DataEffect, ctx: EffectCtx, dflt?: EffectExpiry): GameState {
  const sel = isSel(rec.weapons) ? rec.weapons : isSel(rec.to) ? rec.to : undefined
  const base = { source: ctx.sourceId, expires: expiryOf(rec, ctx, dflt), bySeat: ctx.seat, round: state.round, ...(sel ? { weapons: sel } : {}) }
  const { when: _w, ...data } = rec
  void _w
  let e: Omit<Effect, 'id'>
  switch (rec.op) {
    case 'buff': case 'debuff': e = { ...base, kind: rec.op, stat: rec.char as Effect['stat'], x: Number(rec.x) }; break
    case 'modify': e = { ...base, kind: 'flat', stat: rec.char as Effect['stat'], x: Number(rec.delta) }; break
    case 'grantKeyword': e = { ...base, kind: 'keyword', kw: rec.kw as KwRef }; break
    case 'denyKeyword': e = { ...base, kind: 'deny', kw: { kw: String(rec.kw) } }; break
    default: e = { ...base, kind: 'mod', data: (rec.when ? { ...data, when: rec.when } : data) as Record<string, unknown> }
  }
  return addEffect(state, unitId, e)
}

/** Effect kinds that only mean something to the module reading them later (stored as 'mod'). */
const STORED_OPS = new Set(['setChar', 'rollMod', 'weaponMod', 'canEvade', 'damageCap', 'damageReduce', 'impactBonus', 'supplyOverride', 'coherency',
  'moveThrough', 'ignoreDisengage', 'targetRestriction', 'abilityMod', 'chargeAgain', 'denyStatus', 'costMod', 'altEntry'])

type Exec = { state: GameState; suspended?: boolean } | Rejection

/** Run a data effect list in order (the interpreter). May raise decisions (targets, placements) and resume later. */
export function runEffects(state: GameState, bundle: EditionBundle, effects: readonly DataEffect[], ctx: EffectCtx): StepResult {
  const r = execList(state, bundle, [...effects], ctx)
  if (isRejection(r)) return r
  if (r.suspended) return { state: r.state }
  const fin = finishAfter(r.state, bundle, ctx.after)
  return fin
}

function execList(state: GameState, bundle: EditionBundle, effects: DataEffect[], ctx: EffectCtx): Exec {
  let s = state
  const posts: { event: TriggerEvent; ctx: HookCtx }[] = []
  for (let i = 0; i < effects.length; i++) {
    const rec = effects[i]!
    const r = execOne(s, bundle, rec, ctx, effects.slice(i + 1), posts)
    if (isRejection(r)) return r
    s = r.state
    if (r.suspended) return { state: s, suspended: true }
    if (rec.op === 'setToken' && !ctx.tokenId) ctx = { ...ctx, tokenId: s.tokens[s.tokens.length - 1]?.id }
  }
  // Reactions to what this list did (debuffReceived), offered after the list; a raised window suspends the flow.
  for (const p of posts) {
    const r = dispatch(s, bundle, p.event, { ...p.ctx, ...(ctx.hook?.noPrompt ? { noPrompt: true } : {}) }, undefined, ctx.after)
    s = r.state
    if (r.raised) return { state: s, suspended: true }
  }
  return { state: s }
}

function execOne(state: GameState, bundle: EditionBundle, rec: DataEffect, ctx: EffectCtx, rest: DataEffect[], posts: { event: TriggerEvent; ctx: HookCtx }[]): Exec {
  let s = state
  if (rec.when && !conditionHolds(s, bundle, rec.when as Condition, ctx.triggerUnitId ?? ctx.unitId ?? ctx.targetUnitId ?? null, { targetUnitId: ctx.targetUnitId, attackerUnitId: ctx.attackerUnitId, ...(ctx.hook?.first !== undefined ? { first: ctx.hook.first } : {}) })) return { state: s }
  if (rec.at) return { state: schedule(s, rec, ctx) }
  const subs = (): UnitId[] => subjectsOf(s, bundle, rec, ctx)
  // engine-internal step (not data): the removal half of a MORPH whose arrival opened a Reaction window
  if ((rec.op as string) === 'morphRemove') return { state: removeModels(s, bundle, String(rec.unit), (rec.ids as string[]).filter((id) => s.models[id]?.life === 'active'), 'morph') }
  switch (rec.op) {
    case 'buff': case 'debuff': case 'modify': case 'grantKeyword': case 'denyKeyword': {
      for (const u of subs()) s = storeEffect(s, u, rec, ctx)
      if (rec.op === 'debuff') for (const u of subs()) posts.push({ event: 'debuffReceived', ctx: { seat: ctx.seat, unitId: ctx.unitId ?? undefined, targetUnitId: u } })
      return { state: s }
    }
    case 'rollMod': for (const u of subs()) s = storeEffect(s, u, rec, ctx, ctx.defaultDuration ?? 'thisRoll'); return { state: s }
    case 'canEvade': case 'damageCap': {
      for (const u of subs()) s = storeEffect(s, u, rec, ctx, ctx.defaultDuration ?? 'thisAttack')
      return { state: s }
    }
    case 'damageReduce': {
      // The number is worked out now (it may depend on where models stand) and folded by hooks.runHook('reduceDamage').
      for (const u of subs()) s = storeEffect(s, u, { ...rec, n: evalNum(s, bundle, rec.n, ctx, u) }, ctx, 'thisAttack')
      return { state: s }
    }
    case 'removeDice': {
      // Taken out of the Attack Pool of the attack on the hook's target when attackMods folds (Point Defense Laser).
      const holder = ctx.hook?.targetUnitId ?? ctx.triggerUnitId ?? ctx.targetUnitId ?? ctx.unitId
      if (holder && s.units[holder]) s = storeEffect(s, holder, rec, ctx, 'thisAttack')
      return { state: s }
    }
    case 'status': {
      const mode = String(rec.mode ?? 'gain')
      for (const u of subs()) {
        if (mode === 'keepOnMove') s = storeEffect(s, u, rec, ctx, 'permanent')
        else s = setStatus(s, bundle, u, String(rec.status), mode as 'gain' | 'lose' | 'toggle', ctx.sourceId, expiryOf(rec, ctx, 'permanent'))
      }
      return { state: s }
    }
    case 'cleanse': for (const u of subs()) s = removeEffects(s, u, (e) => e.kind === 'debuff'); return { state: s }
    case 'heal': for (const u of subs()) s = heal(s, bundle, u, evalNum(s, bundle, rec.x, ctx, u)); return { state: s }
    case 'nonLethal': for (const u of subs()) s = addNonLethal(s, bundle, u, evalNum(s, bundle, rec.x, ctx, u)); return { state: s }
    case 'hits': return execHits(s, bundle, rec, ctx, rest)
    case 'impact': case 'impactBonus': return { state: s } // IMPACT is resolved by charge.ts from the Unit's data; nothing to store here
    case 'returnToReserves': for (const u of subs()) s = returnToReserves(s, bundle, u, ctx.sourceId); return { state: s }
    case 'removeSelf': {
      for (const u of (rec.to === undefined && ctx.unitId ? [ctx.unitId] : subs())) { const ids = tableModels(s, u).map((m) => m.id); if (ids.length) s = removeModels(s, bundle, u, ids, 'ability') }
      return { state: s }
    }
    case 'place': case 'move': case 'setToken': case 'summon': return askPoint(s, bundle, rec, ctx, rest)
    case 'removeToken': return { state: { ...s, tokens: s.tokens.filter((t) => !(t.defId === rec.token && t.owner === ctx.seat)) } }
    case 'detection': {
      const centre = rec.centre === 'self' || rec.centre === undefined
        ? (ctx.unitId ? { kind: 'unit' as const, unitId: ctx.unitId } : null)
        : ctx.tokenId ? { kind: 'token' as const, tokenId: ctx.tokenId } : ctx.point ? { kind: 'point' as const, pos: ctx.point } : null
      if (!centre) return reject('E_BAD_PARAM', 'A detection area needs a centre.')
      s = { ...s, detectors: [...s.detectors, { id: `${ctx.sourceId}:${s.detectors.length + 1}`, owner: ctx.seat, centre, radius: Number(rec.radius), source: ctx.sourceId, expires: expiryOf(rec, ctx, 'endOfRound') }] }
      return { state: detect(s, bundle) }
    }
    case 'activation': {
      for (const u of subs()) s = updateUnit(s, u, { activation: rec.mode === 'remove' ? null : s.roundPhase === 'movement' ? 'movement' : 'assault' })
      return { state: s }
    }
    case 'gainVP': {
      const n = Number(rec.n) || 0
      const seat = s.seats[ctx.seat]
      if (seat) s = { ...s, seats: { ...s.seats, [ctx.seat]: { ...seat, vp: seat.vp + n, score: seat.score + n } } }
      return { state: s }
    }
    case 'charge': {
      // charge distance bonus (Gravitic Boosters) is a roll modifier on the charge roll
      const plus = typeof rec.plus === 'number' ? rec.plus : 0
      for (const u of subs()) s = storeEffect(s, u, plus ? { op: 'rollMod', roll: 'charge', delta: plus } : rec, ctx, 'thisRoll')
      return { state: s }
    }
    case 'code': {
      if (CODE_NEEDS_POINT.has(String(rec.code)) && !isVec(ctx.point)) return askPoint(s, bundle, rec, ctx, rest)
      return runCodeEffect(s, bundle, rec, ctx)
    }
    case 'respawn': case 'morph': {
      // one Unit at a time: the player places each model; the Units still waiting resume after it (never skipped)
      const list = subs()
      if (list.length === 0) return { state: s }
      return startNewModel(s, bundle, rec, ctx, list[0]!, list.slice(1), rest)
    }
    case 'aura': case 'setChar': case 'weaponMod': case 'costMod': case 'supplyOverride': case 'coherency': case 'moveThrough': case 'ignoreDisengage':
    case 'targetRestriction': case 'abilityMod': case 'chargeAgain': case 'denyStatus': case 'altEntry': {
      if (rec.op === 'altEntry' && rec.at) return { state: s }
      if (rec.op === 'altEntry' && rec.kind === 'indicator' && ctx.tokenId) {
        return { state: queueArrival(s, { seat: ctx.seat, unitId: null, entry: { kind: 'indicator', ref: ctx.tokenId }, round: s.round, source: ctx.sourceId }) }
      }
      if (rec.op === 'aura') {
        // A passive aura is read from the ability itself. One an Active or Reaction puts in force is stored on the
        // user for its duration (default: the End of the Round) and read like a printed one (effects.broadcasts).
        if (ctx.defaultDuration || rec.duration) for (const u of ctx.unitId ? [ctx.unitId] : subs()) s = storeEffect(s, u, rec, ctx, 'endOfRound')
        return { state: s }
      }
      if (STORED_OPS.has(rec.op)) for (const u of subs()) s = storeEffect(s, u, rec, ctx)
      if (rec.op === 'altEntry' && rec.kind === 'deployNow') {
        // Personal Transport: back in Reserves with a deployNow permission, the Unit redeploys at once (DEP-014)
        for (const u of subs()) {
          const d = raiseDeployNow(s, bundle, u)
          if (d) return { state: d, suspended: true }
        }
      }
      return { state: s }
    }
    default: return { state: s }
  }
}

function runCodeEffect(state: GameState, bundle: EditionBundle, rec: DataEffect, ctx: EffectCtx): Exec {
  const hc: HookCtx = {
    ...(ctx.hook ?? { unitId: ctx.unitId ?? undefined, targetUnitId: ctx.targetUnitId }), seat: ctx.seat, selfUnitId: ctx.unitId ?? undefined, sourceId: ctx.sourceId,
    ...(ctx.edge ? { edge: ctx.edge } : {}), ...(ctx.point ? { point: ctx.point } : {}), ...(ctx.tokenId ? { tokenId: ctx.tokenId } : {}),
  }
  const r = runCode(state, bundle, { code: String(rec.code), args: rec.args as Record<string, unknown> | undefined }, hc)
  if (r.rejection) return r.rejection
  if (r.veto) return reject('E_USED', `${String(rec.code)}: not usable again now.`)
  return r.raised ? { state: r.state, suspended: true } : { state: r.state }
}

/** A delayed effect (`at`): kept on the source Unit until the later event runs it (runDelayed). */
function schedule(state: GameState, rec: DataEffect, ctx: EffectCtx): GameState {
  const holder = ctx.unitId ?? ctx.targetUnitId ?? Object.values(state.units).find((u) => u.owner === ctx.seat && u.location !== 'destroyed')?.id
  if (!holder) return state
  const { at, ...plain } = rec
  const saved: Record<string, unknown> = { seat: ctx.seat, sourceId: ctx.sourceId, unitId: ctx.unitId, targetUnitId: ctx.targetUnitId, tokenId: ctx.tokenId,
    ...(ctx.summonedUnitId ? { summonedUnitId: ctx.summonedUnitId } : {}), ...(ctx.point ? { point: ctx.point } : {}), ...(ctx.edge ? { edge: ctx.edge } : {}) }
  return addEffect(state, holder, { source: `__delayed:${ctx.sourceId}`, kind: 'mod', expires: 'permanent', bySeat: ctx.seat, round: state.round, data: { op: 'delayed', at, rec: plain, ctx: saved } })
}

/** Run the delayed effects waiting for `event` (and `phase` for endOfPhase). hooks.runHook('endOfRound') calls it with
 *  'endOfRound'; turnflow calls it with 'endOfPhase' when a Phase ends. */
export function runDelayed(state: GameState, bundle: EditionBundle, event: TriggerEvent, phase?: string): GameState {
  return runDelayedStep(state, bundle, event, phase).state
}

/** Like runDelayed, but also says whether a delayed effect stopped to ask for a decision (an optional PLACE): the caller
 *  then reports `raised` and the answer continues through `after: { k: 'delayed' }`. */
export function runDelayedStep(state: GameState, bundle: EditionBundle, event: TriggerEvent, phase?: string): { state: GameState; suspended: boolean } {
  let s = state
  for (const u of Object.values(state.units)) {
    for (const e of s.units[u.id]?.effects ?? []) {
      const d = e.data as { op?: string; at?: { event: TriggerEvent; phase?: string }; rec?: DataEffect; ctx?: EffectCtx } | undefined
      if (e.kind !== 'mod' || d?.op !== 'delayed' || d.at?.event !== event || (d.at.phase && phase && d.at.phase !== phase) || !d.rec || !d.ctx) continue
      s = removeEffects(s, u.id, (x) => x.id === e.id)
      const c: EffectCtx = { ...d.ctx, after: { k: 'delayed', event, ...(phase ? { phase } : {}) } }
      const r = execList(s, bundle, [d.rec], c)
      if (isRejection(r)) continue
      s = r.state
      if (r.suspended) return { state: s, suspended: true }
    }
  }
  return { state: s, suspended: false }
}

/** A delayed effect's decision was answered: run the ones still waiting. At the End of the Round the scoring pipeline
 *  is waiting for control back (it continues through afterAction), so the last one reports `done`. */
function delayedStep(state: GameState, bundle: EditionBundle, event: TriggerEvent, phase?: string): StepResult {
  const r = runDelayedStep(state, bundle, event, phase)
  if (r.suspended || event !== 'endOfRound') return { state: r.state }
  return { state: r.state, done: windowDone('', 'ability.react') }
}

// ---------------------------------------------------------------- verbs that need a spot or a stack of dice
function execHits(state: GameState, bundle: EditionBundle, rec: DataEffect, ctx: EffectCtx, rest: DataEffect[]): Exec {
  const targets = subjectsOf(state, bundle, rec, ctx).filter((u) => state.units[u]?.owner !== ctx.seat || rec.to === 'self')
  const subs = targets.length ? targets : subjectsOf(state, bundle, rec, ctx)
  if (subs.length === 0) return { state }
  const batches: AttackBatch[] = subs.map((u) => hitsBatch(state, bundle, { seat: ctx.seat, sourceId: ctx.sourceId, targetUnitId: u, x: Number(rec.x) || 0, dmg: Number(rec.y) || 1 }))
  const holder = ctx.unitId ?? subs[0]!
  const cont: Cont = { k: 'effects', rest, ctx }
  const s = stashCont(state, holder, ctx.seat, cont)
  const r = resolveBatch(s, bundle, batches[0]!, 'armour', 'ability', batches.slice(1))
  if (isRejection(r)) return r
  return { state: r.state, suspended: true }
}

type Cont =
  | { k: 'effects'; rest: DataEffect[]; ctx: EffectCtx; pending?: PendingHook[] }
  | { k: 'point'; rec: DataEffect; ctx: EffectCtx; rest: DataEffect[]; optional: boolean }
  | { k: 'option' | 'unit' | 'edge' | 'usePoint'; flow: Flow; cands?: string[] }
  | { k: 'pay'; flow: Flow }
  | { k: 'react'; trig: Trig; offers: Offer[] }
  | { k: 'recall'; unitId: UnitId; source: Id }
  | { k: 'khala'; cands: UnitId[]; unitId: UnitId }
  | { k: 'costReact'; flow: Flow }
  | { k: 'newModel'; op: 'respawn' | 'morph'; rec: DataEffect; ctx: EffectCtx; rest: DataEffect[]; unitId: UnitId; ids: string[]; pts: Vec2[]; into?: Id; x?: number; removed?: string[] }

function stashCont(state: GameState, holder: UnitId, seat: SeatId, cont: Cont): GameState {
  return addEffect(state, holder, { source: '__cont', kind: 'mod', expires: 'endOfActivation', bySeat: seat, round: state.round, data: { op: 'cont', cont } })
}
function popCont(state: GameState): { state: GameState; cont: Cont } | null {
  for (const u of Object.values(state.units)) {
    const e = u.effects.find((x) => x.source === '__cont')
    if (e) return { state: removeEffects(state, u.id, (x) => x.id === e.id), cont: (e.data as { cont: Cont }).cont }
  }
  return null
}

/** A reposition / arrival opened a Reaction window at an end hook (`raised`): park the rest of the list (and the end hooks
 *  still to fire) and suspend. The window closes through resumeIn('ability'), which runs abilities.resume(). */
function parkRaised(state: GameState, rest: DataEffect[], ctx: EffectCtx, pending?: PendingHook[]): Exec {
  const holder = ctx.unitId ?? Object.values(state.units).find((u) => u.owner === ctx.seat)?.id
  if (!holder) return { state, suspended: true }
  const cont: Cont = { k: 'effects', rest, ctx, ...(pending?.length ? { pending } : {}) }
  return { state: stashCont(state, holder, ctx.seat, cont), suspended: true }
}

// ---------------------------------------------------------------- ready-made spots for point decisions
const SPOT_RADII = [0, 1.5, 3, 5, 8, 12, 16]
const SPOT_BEARINGS = [0, 4, 2, 6, 1, 5, 3, 7]
/** Where to look for spots: the acting Unit, its target, other friendly Units on the table, the table centre. */
function spotCentres(state: GameState, seat: SeatId, ids: (UnitId | null | undefined)[]): Vec2[] {
  const out: Vec2[] = []
  const add = (id: UnitId | null | undefined) => { const m = id ? tableModels(state, id)[0] : undefined; if (m) out.push(m.pos) }
  ids.forEach(add)
  for (const u of Object.values(state.units)) if (u.owner === seat && u.location === 'table' && out.length < 5) add(u.id)
  out.push({ x: 0, z: 0 })
  return out
}
/** Up to `n` spots on the table that `ok` accepts (a dry run of the real verb), nearest rings first, at most `budget`
 *  tries. Point decisions offer them as complete answers so every legal option validates as given (spec 00 s3.1). */
export function spotAnswers(state: GameState, seat: SeatId, centres: Vec2[], ok: (p: Vec2) => boolean, n = 6, budget = 160): Vec2[] {
  const W = state.scenario.table.w / 2 - 0.5, D = state.scenario.table.d / 2 - 0.5
  const seen = new Set<string>()
  const out: Vec2[] = []
  let tries = 0
  // Seat-neutral order: opposite bearings alternate so the first answers surround the centre, and each seat's ring is
  // turned half a circle from the other's, so neither the seat nor its entry edge favours one side of the table.
  const turn = Math.max(0, state.seatOrder.indexOf(seat)) * Math.PI
  for (const rad of SPOT_RADII) for (const c of centres) for (let j = 0; j < (rad === 0 ? 1 : 8); j++) {
    const a = (SPOT_BEARINGS[j]! / 8) * 2 * Math.PI + turn + rad * 0.37
    const p = { x: Math.round((c.x + Math.cos(a) * rad) * 100) / 100, z: Math.round((c.z + Math.sin(a) * rad) * 100) / 100 }
    if (Math.abs(p.x) > W || Math.abs(p.z) > D) continue
    const key = `${p.x},${p.z}`
    if (seen.has(key)) continue
    seen.add(key)
    if (++tries > budget) return out
    if (ok(p)) { out.push(p); if (out.length >= n) return out }
  }
  return out
}
const spotOptions = (spots: Vec2[], label: string, seat: SeatId): DecisionOption[] => [
  ...(spots.length ? [option('point', label, 'ability.target', { mode: 'point' }, seat)] : []),
  ...spots.map((p, i) => option(`point:${i}`, `${label} (${p.x.toFixed(1)}, ${p.z.toFixed(1)})`, 'ability.target', { mode: 'point', point: p }, seat)),
]

function askPoint(state: GameState, bundle: EditionBundle, rec: DataEffect, ctx: EffectCtx, rest: DataEffect[]): Exec {
  if (isVec(ctx.point)) return execPoint(state, bundle, rec, ctx, ctx.point, rest)
  const label = rec.op === 'setToken' ? 'Choose where to set the token' : rec.op === 'summon' ? 'Choose where to set the new Unit' : 'Choose where the Leading Model goes'
  const spots = spotAnswers(state, ctx.seat, spotCentres(state, ctx.seat, [ctx.unitId, ctx.targetUnitId]), (p) => !isRejection(execPoint(state, bundle, rec, ctx, p, rest)))
  // RULING: a spot verb with no legal spot is skipped (the rest of the list goes on), as an optional one may be
  const skippable = rec.optional === true || spots.length === 0
  const cont: Cont = { k: 'point', rec, ctx: { ...ctx, hook: undefined }, rest, optional: skippable }
  return {
    suspended: true,
    state: raiseDecision(state, {
      seat: ctx.seat, kind: 'ability.target', context: { cont, prompt: label, points: spots }, canPass: skippable,
      options: [...spotOptions(spots, label, ctx.seat), ...(skippable ? [option('skip', spots.length ? 'Skip' : 'No legal spot: skip', 'ability.target', { mode: 'skip' }, ctx.seat)] : [])],
    }),
  }
}

/** Carry out a spot-taking verb at `point`. A bad spot comes back as a Rejection (the decision stays open). */
function execPoint(state: GameState, bundle: EditionBundle, rec: DataEffect, ctx: EffectCtx, point: Vec2, rest: DataEffect[]): Exec {
  let s = state
  const minEnemy = typeof rec.minEnemyDist === 'number' ? rec.minEnemyDist : undefined
  const enemiesTooClose = (d: number): boolean => Object.values(s.units).some((u) => u.owner !== ctx.seat && u.location === 'table' && unitToPoint(s, u.id, point) < d)
  if (rec.op === 'setToken') {
    const tid = String(rec.token)
    const def = tokenDef(bundle, ctx.unitId ? unitDef(bundle, s.units[ctx.unitId]?.profileId ?? '') ?? null : null, tid)
      ?? bundle.records.cards.flatMap((c) => c.tokens ?? []).find((t) => t.id === tid)
      ?? bundle.records.units.flatMap((u) => u.tokens ?? []).find((t) => t.id === tid)
    if (!def) return reject('E_BAD_PARAM', `Unknown token "${String(rec.token)}".`)
    const tr = (def.baseMm ?? 0) / 25.4 / 2
    if (Math.abs(point.x) + tr > s.scenario.table.w / 2 + 1e-6 || Math.abs(point.z) + tr > s.scenario.table.d / 2 + 1e-6) return reject('E_PLACEMENT', 'The token would not lie wholly on the table.')
    if (typeof rec.range === 'number' && ctx.unitId && unitToPoint(s, ctx.unitId, point) > rec.range + 1e-6) return reject('E_OUT_OF_RANGE', `Farther than ${rec.range}" from the Unit.`)
    if (minEnemy !== undefined && enemiesTooClose(minEnemy + 1e-6)) return reject('E_BAD_PARAM', `Within ${minEnemy}" of an enemy.`)
    const id = `${def.id}-${s.tokens.filter((t) => t.defId === def.id).length + 1}-r${s.round}`
    s = { ...s, tokens: [...s.tokens, { id, defId: def.id, owner: ctx.seat, sourceId: ctx.sourceId, pos: point, elev: 0, round: s.round }] }
    return continueList(s, bundle, rest, { ...ctx, tokenId: id, point })
  }
  if (rec.op === 'code') {
    const r = runCodeEffect(s, bundle, rec, { ...ctx, point })
    if (isRejection(r) || r.suspended) return r
    return continueList(r.state, bundle, rest, { ...ctx, point })
  }
  if (rec.op === 'summon') {
    const unitDefId = String(rec.unit)
    const d = unitDef(bundle, unitDefId)
    if (!d) return reject('E_BAD_PARAM', `Unknown Unit "${unitDefId}".`)
    if (minEnemy !== undefined && enemiesTooClose(minEnemy + 1e-6)) return reject('E_BAD_PARAM', `Within ${minEnemy}" of an enemy.`)
    const id = `${ctx.seat}-s${Object.keys(s.units).length + 1}`
    const m = musterUnit(bundle, ctx.seat, unitDefId, 1, id)
    s = { ...s, units: { ...s.units, [id]: m.unit }, models: { ...s.models, ...Object.fromEntries(m.models.map((x) => [x.id, x])) } }
    const r = arrive(s, bundle, id, { kind: 'place', ref: ctx.unitId ?? undefined }, { leaderId: m.unit.leadingModelId!, path: [point], maxDist: Infinity, returnTo: 'ability', ...(minEnemy !== undefined ? { minEnemyDist: minEnemy } : {}) })
    if (isRejection(r)) return r
    if (r.raised) return parkRaised(r.state, rest, { ...ctx, summonedUnitId: id, point }, r.pending)
    return continueList(r.state, bundle, rest, { ...ctx, summonedUnitId: id, point })
  }
  // place / move of the acting (or target) Unit
  const who = subjectsOf(s, bundle, rec, ctx)[0]
  const u = who ? s.units[who] : undefined
  if (!who || !u?.leadingModelId) return reject('E_BAD_TARGET', 'There is no Unit to move.')
  const spec = {
    leaderId: u.leadingModelId, path: [point], maxDist: typeof rec.x === 'number' && rec.x > 0 ? rec.x : Infinity, returnTo: 'ability',
    ...(minEnemy !== undefined ? { minEnemyDist: minEnemy } : rec.notInEngagement ? { minEnemyDist: rule(bundle, 'engagementRange') + 1e-6 } : {}),
    ...(rec.allowEngage ? { allowEngage: Object.keys(s.units).filter((x) => s.units[x]!.owner !== ctx.seat) } : {}),
  }
  const r = u.location === 'reserves' ? arrive(s, bundle, who, { kind: 'place' }, spec) : reposition(s, bundle, who, { ...spec, kind: rec.op === 'move' ? (rec.kind === 'run' ? 'run' : 'move') : 'place' })
  if (isRejection(r)) return r
  if (r.raised) return parkRaised(r.state, rest, { ...ctx, point }, r.pending)
  return continueList(r.state, bundle, rest, { ...ctx, point })
}

// ---------------------------------------------------------------- RESPAWN and MORPH: models set in base contact
const CONTACT_ANGLES = 24
const CONTACT_TOL = 0.03
const MAX_SPOTS = 12

/** What a spot search needs: the base of the model to set, models of the same job already set, an enemy keep-out
 *  distance (MORPH: Within 1"), and an extra yes/no (MORPH: the dry-run arrival). */
interface SpotJob { base: number; chosen: { pos: Vec2; base: number }[]; avoid?: number; extra?: (p: Vec2) => boolean }

const anchorsOf = (state: GameState, unitId: UnitId, job: SpotJob): { pos: Vec2; r: number }[] =>
  [...tableModels(state, unitId).map((m) => ({ pos: m.pos, r: baseRadius(m.base) })), ...job.chosen.map((c) => ({ pos: c.pos, r: baseRadius(c.base) }))]

/** Can a model of `job.base` stand at `p`: in base contact with an existing model of the Unit (or one just set), on legal
 *  ground, and outside every enemy's Engagement Range (R p.91 RESPAWN, R p.90 MORPH)? */
function spotLegal(state: GameState, bundle: EditionBundle, unitId: UnitId, job: SpotJob, p: Vec2): boolean {
  const r = baseRadius(job.base)
  const anchors = anchorsOf(state, unitId, job)
  if (!anchors.some((a) => Math.abs(dist(a.pos, p) - (a.r + r)) <= CONTACT_TOL)) return false
  if (endProblem(squadCtx(state, bundle, unitId), job.base, p, anchors, job.avoid !== undefined ? { avoidEnemyWithin: job.avoid } : {})) return false
  return job.extra ? job.extra(p) : true
}

/** Legal base-contact spots, nearest the Leading Model first (at most MAX_SPOTS). */
function contactSpots(state: GameState, bundle: EditionBundle, unitId: UnitId, job: SpotJob): Vec2[] {
  const ctx = squadCtx(state, bundle, unitId)
  const r = baseRadius(job.base)
  const anchors = anchorsOf(state, unitId, job)
  const lead = state.models[state.units[unitId]?.leadingModelId ?? '']
  const from = lead?.pos ?? anchors[0]?.pos ?? { x: 0, z: 0 }
  const seen = new Set<string>()
  const cands: Vec2[] = []
  for (const a of anchors) for (let i = 0; i < CONTACT_ANGLES; i++) {
    const t = (i / CONTACT_ANGLES) * 2 * Math.PI
    const p = { x: a.pos.x + Math.cos(t) * (a.r + r), z: a.pos.z + Math.sin(t) * (a.r + r) }
    const key = `${Math.round(p.x * 20)}:${Math.round(p.z * 20)}`
    if (seen.has(key)) continue
    seen.add(key)
    if (endProblem(ctx, job.base, p, anchors, job.avoid !== undefined ? { avoidEnemyWithin: job.avoid } : {})) continue
    cands.push(p)
  }
  cands.sort((a, b) => dist(a, from) - dist(b, from))
  const out: Vec2[] = []
  for (const p of cands) {
    if (job.extra && !job.extra(p)) continue
    out.push(p)
    if (out.length >= MAX_SPOTS) break
  }
  return out
}

/** What a respawn / morph step reports: the state, and when a Reaction window opened at an end hook, `raised` + the hooks left. */
interface StepRaise { state: GameState; raised?: boolean; pending?: PendingHook[] }
const raiseOf = (r: RepositionResult): Pick<StepRaise, 'raised' | 'pending'> => r.raised ? { raised: true, ...(r.pending ? { pending: r.pending } : {}) } : {}

/** RESPAWN X: up to X Destroyed models return to the Unit at full HP, each set in base contact with an existing model of
 *  the Unit and outside every enemy Engagement Range; a model with no legal spot cannot return (R p.91). SUP-004: never more
 *  models than keep the Unit in its current Supply bracket. The models re-enter through the one repositioning mechanism
 *  (kind 'place', the models already on the table stay put), so coherency is stored and the move-end hooks run. */
function respawnPlan(state: GameState, bundle: EditionBundle, unitId: UnitId, x: number): string[] {
  const u = state.units[unitId]
  const def = u ? unitDef(bundle, u.profileId) : undefined
  const lead = u?.leadingModelId ? state.models[u.leadingModelId] : undefined
  if (!u || !def || u.location !== 'table' || !lead || lead.life === 'dead' || x <= 0) return []
  const dead = u.modelIds.filter((id) => state.models[id]?.life === 'dead')
  const live = u.modelIds.length - dead.length
  const csv = bracketSupply(def, live)
  let k = Math.min(Math.floor(x), dead.length)
  while (k > 0 && bracketSupply(def, live + k) > csv) k--
  return dead.slice(0, Math.max(0, k))
}

/** The spot search for the next returning model: `pts` are the spots already chosen for the first of `ids`. */
const respawnJob = (state: GameState, ids: string[], pts: Vec2[]): SpotJob => ({
  base: state.models[ids[pts.length]!]!.base, chosen: pts.map((pos, j) => ({ pos, base: state.models[ids[j]!]!.base })),
})

/** Bring `ids` back at `pts` (one spot each). */
function respawnCommit(state: GameState, bundle: EditionBundle, unitId: UnitId, ids: string[], pts: Vec2[], source: Id): StepRaise {
  const u = state.units[unitId]
  const def = u ? unitDef(bundle, u.profileId) : undefined
  const lead = u?.leadingModelId ? state.models[u.leadingModelId] : undefined
  if (!u || !def || !lead || !ids.length) return { state }
  const revived: GameState = {
    ...state, models: { ...state.models, ...Object.fromEntries(ids.map((id) => [id, { ...state.models[id]!, life: 'active' as const, offTable: true, hp: def.stats.hp }])) },
  }
  const fixed = Object.fromEntries(tableModels(state, unitId).filter((m) => m.id !== lead.id).map((m) => [m.id, m.pos]))
  const placement = { ...fixed, ...Object.fromEntries(ids.map((id, i) => [id, pts[i]!])) }
  const r = reposition(revived, bundle, unitId, { kind: 'place', leaderId: lead.id, path: [lead.pos], maxDist: Infinity, placement, returnTo: 'ability' })
  if (isRejection(r)) return { state }
  const back = ids.filter((id) => r.state.models[id]?.life === 'active')
  return { state: pushEvents(r.state, [{ type: 'respawn', unitId, modelIds: back, source }]), ...raiseOf(r) }
}

/** respawnModels, also reporting a raised Reaction window. The first legal spot is taken for each model (the interpreter
 *  asks the player instead; this is the ready answer for callers with no player). */
export function respawnStep(state: GameState, bundle: EditionBundle, unitId: UnitId, x: number, source: Id): StepRaise {
  const ids = respawnPlan(state, bundle, unitId, x)
  const pts: Vec2[] = []
  for (let i = 0; i < ids.length; i++) {
    const spot = contactSpots(state, bundle, unitId, respawnJob(state, ids, pts))[0]
    if (!spot) break
    pts.push(spot)
  }
  return pts.length ? respawnCommit(state, bundle, unitId, ids.slice(0, pts.length), pts, source) : { state }
}
export function respawnModels(state: GameState, bundle: EditionBundle, unitId: UnitId, x: number, source: Id): GameState {
  return respawnStep(state, bundle, unitId, x, source).state
}

// ---- MORPH (Name) X: set ONE new model in base contact with a model of the Unit (not Within 1" of an enemy), then remove X
// models from that Unit. The new model forms a new Unit that cannot activate this Round. Available Supply is checked first.
interface MorphSetup { newId: UnitId; mu: ReturnType<typeof musterUnit>; t0: GameState; job: SpotJob }

function morphArrival(bundle: EditionBundle, setup: { mu: ReturnType<typeof musterUnit> }, p: Vec2) {
  return { leaderId: setup.mu.unit.leadingModelId!, path: [p], maxDist: Infinity, returnTo: 'ability', minEnemyDist: rule(bundle, 'engagementRange') + 1e-6 }
}

function morphSetup(state: GameState, bundle: EditionBundle, unitId: UnitId, into: Id): MorphSetup | null {
  const u = state.units[unitId]
  if (!u || u.location !== 'table' || !unitDef(bundle, into) || tableModels(state, unitId).length === 0) return null
  const newId = `${u.owner}-s${Object.keys(state.units).length + 1}`
  const mu = musterUnit(bundle, u.owner, into, 1, newId)
  const t0: GameState = { ...state, units: { ...state.units, [newId]: { ...mu.unit, summoned: false } }, models: { ...state.models, ...Object.fromEntries(mu.models.map((m) => [m.id, m])) } }
  const job: SpotJob = {
    base: mu.models[0]!.base, chosen: [], avoid: rule(bundle, 'engagementRange'),
    // the same arrival the commit will run, tried first: a spot it refuses (Supply, Zone, ...) is never offered
    extra: (p) => !isRejection(arrive(t0, bundle, newId, { kind: 'place' }, morphArrival(bundle, { mu }, p))),
  }
  return { newId, mu, t0, job }
}

/** Two models are the same casualty when their HP and loadout match, as in damage.ts. */
const sigOf = (m: { hp: number; weapons: string[] }): string => `${m.hp}|${m.weapons.join(',')}`

/** Set the new model, then remove the chosen models. A Reaction window at the arrival parks the removal (`removeLeft`). */
function morphCommit(state: GameState, bundle: EditionBundle, unitId: UnitId, pt: Vec2, removed: string[], source: Id, setup: MorphSetup): StepRaise & { removeLeft?: string[] } {
  const u0 = state.units[unitId]!
  const r = arrive(setup.t0, bundle, setup.newId, { kind: 'place' }, morphArrival(bundle, setup, pt))
  if (isRejection(r)) return { state }
  const s = pushEvents(updateUnit(r.state, setup.newId, { activation: u0.activation }), [{ type: 'morph', unitId, into: setup.newId, removed, source }])
  if (r.raised) return { state: s, raised: true, ...(r.pending ? { pending: r.pending } : {}), removeLeft: removed }
  return { state: removeModels(s, bundle, unitId, removed, 'morph') }
}

/** morphModels, with the first legal spot and the last (non-leading) models removed: the ready answer for callers with no player. */
export function morphStep(state: GameState, bundle: EditionBundle, unitId: UnitId, into: Id, x: number, source: Id): StepRaise {
  const setup = morphSetup(state, bundle, unitId, into)
  if (!setup) return { state }
  const spot = contactSpots(state, bundle, unitId, setup.job)[0]
  if (!spot) return { state }
  const u0 = state.units[unitId]!
  const pool = tableModels(state, unitId).filter((m) => m.id !== u0.leadingModelId).reverse()
  const lead = tableModels(state, unitId).find((m) => m.id === u0.leadingModelId)
  if (lead) pool.push(lead)
  const r = morphCommit(state, bundle, unitId, spot, pool.slice(0, Math.max(0, x)).map((m) => m.id), source, setup)
  return { state: r.state, ...(r.raised ? { raised: true, ...(r.pending ? { pending: r.pending } : {}) } : {}) }
}
export function morphModels(state: GameState, bundle: EditionBundle, unitId: UnitId, into: Id, x: number, source: Id): GameState {
  return morphStep(state, bundle, unitId, into, x, source).state
}

/** The player-driven RESPAWN / MORPH: a chain of decisions (the spot of each model, then which models MORPH removes) whose
 *  continuation is plain JSON in the decision context. Resumed by resolveTarget(); finished it runs the rest of the list. */
type NewCont = Extract<Cont, { k: 'newModel' }>

function newModelStep(state: GameState, bundle: EditionBundle, c: NewCont): Exec {
  const u = state.units[c.unitId]
  const done = (s: GameState): Exec => execList(s, bundle, c.rest, c.ctx)
  if (!u || u.location !== 'table') return done(state)
  const seat = u.owner
  const ask = (spots: Vec2[], prompt: string, skip: string | null): Exec => ({
    suspended: true,
    state: raiseDecision(state, {
      seat, kind: 'ability.target', context: { cont: c, prompt, points: spots }, canPass: skip !== null,
      options: [...spotOptions(spots, prompt, seat), ...(skip !== null ? [option('skip', skip, 'ability.target', { mode: 'skip' }, seat)] : [])],
    }),
  })
  if (c.op === 'respawn') {
    const finish = (): Exec => {
      if (!c.pts.length) return done(state)
      const r = respawnCommit(state, bundle, c.unitId, c.ids.slice(0, c.pts.length), c.pts, c.ctx.sourceId)
      return r.raised ? parkRaised(r.state, c.rest, c.ctx, r.pending) : done(r.state)
    }
    if (c.pts.length >= c.ids.length) return finish()
    const spots = contactSpots(state, bundle, c.unitId, respawnJob(state, c.ids, c.pts))
    return spots.length ? ask(spots, 'Return a model in base contact with the Unit', 'Return no more models') : finish()
  }
  // MORPH
  const setup = morphSetup(state, bundle, c.unitId, c.into!)
  if (!setup) return done(state)
  if (c.pts.length === 0) {
    const spots = contactSpots(state, bundle, c.unitId, setup.job)
    return spots.length ? ask(spots, `Set the new ${c.into} model in base contact with the Unit`, null) : done(state)
  }
  const removed = [...(c.removed ?? [])]
  for (;;) {
    const left = (c.x ?? 1) - removed.length
    const pool = tableModels(state, c.unitId).filter((m) => !removed.includes(m.id))
    if (left <= 0 || pool.length === 0) break
    if (new Set(pool.map(sigOf)).size > 1) {
      const next: NewCont = { ...c, removed }
      return {
        suspended: true,
        state: raiseDecision(state, {
          seat, kind: 'ability.target', context: { cont: next, prompt: `Remove ${left} model${left > 1 ? 's' : ''} from the Unit` }, canPass: false,
          options: pool.map((m) => option(`remove:${m.id}`, `Remove model ${m.id}`, 'ability.target', { mode: 'remove', modelId: m.id }, seat)),
        }),
      }
    }
    // equal models: no real choice; the last in muster order goes, the Leading Model last of all
    const order = u.modelIds
    const pick = [...pool].sort((a, b) => Number(a.id === u.leadingModelId) - Number(b.id === u.leadingModelId) || order.indexOf(b.id) - order.indexOf(a.id))[0]!
    removed.push(pick.id)
  }
  const r = morphCommit(state, bundle, c.unitId, c.pts[0]!, removed, c.ctx.sourceId, setup)
  if (r.raised) return parkRaised(r.state, [{ op: 'morphRemove' as DataEffect['op'], unit: c.unitId, ids: r.removeLeft ?? removed }, ...c.rest], c.ctx, r.pending)
  return done(r.state)
}

/** Start RESPAWN / MORPH for one Unit of a subject list; `more` are the Units still waiting (they carry on after this one). */
function startNewModel(state: GameState, bundle: EditionBundle, rec: DataEffect, ctx: EffectCtx, unitId: UnitId, more: UnitId[], rest: DataEffect[]): Exec {
  const tail: DataEffect[] = more.length ? [{ ...rec, __subjects: more }, ...rest] : rest
  const base = { k: 'newModel' as const, rec, ctx: { ...ctx, hook: undefined }, rest: tail, unitId, pts: [] as Vec2[] }
  if (rec.op === 'respawn') {
    const ids = respawnPlan(state, bundle, unitId, evalNum(state, bundle, rec.x, ctx, unitId))
    if (!ids.length) return execList(state, bundle, tail, ctx)
    return newModelStep(state, bundle, { ...base, op: 'respawn', ids })
  }
  return newModelStep(state, bundle, { ...base, op: 'morph', ids: [], into: String(rec.unit), x: Math.max(0, evalNum(state, bundle, rec.x, ctx, unitId)), removed: [] })
}

function continueList(state: GameState, bundle: EditionBundle, rest: DataEffect[], ctx: EffectCtx): Exec {
  return execList(state, bundle, rest, ctx)
}

// ---------------------------------------------------------------- flows: using an Active, answering a Reaction
interface Flow {
  v: 'use' | 'react'
  seat: SeatId
  unitId: UnitId | null
  source: Id
  abilityId: Id
  window?: 'before' | 'after' | 'action'
  optionId?: Id
  targetUnitId?: UnitId
  edge?: string
  point?: Vec2
  /** True once the price is paid (a pay decision resumes here). */
  paid?: boolean
  /** The player's answer on a cost Reaction (Advanced Training): use it or pay the full price. Unset = not asked yet. */
  costReact?: 'use' | 'skip'
  trig?: Trig
}
interface Trig { event: TriggerEvent; ctx: HookCtx; point?: string; seatsLeft: SeatId[]; returnTo?: string; prev?: PendingDecision; after?: After }
interface Offer { source: Id; abilityId: Id; seat: SeatId; label: string }

type TargetNeed = { kind: 'none' } | { kind: 'units'; ids: UnitId[] } | { kind: 'point' } | { kind: 'edge'; edges: string[] }

function allowsStructure(a: AbilityDef): boolean {
  return a.effects.some((e) => e.op === 'code' && e.code === 'transfusion-allows-structure')
}

/** Who/where this ability may target now (spec 20 TargetSpec); an empty `units` list means "no legal target". */
function targetNeed(state: GameState, bundle: EditionBundle, r: AbilityRef, a: AbilityDef, user: UnitId | null, trigUnit?: UnitId): TargetNeed {
  const t = a.target
  if (!t) return { kind: 'none' }
  const filterOk = (id: UnitId) => conditionHolds(state, bundle, t.filter, id, {})
  const base = Object.values(state.units).filter((u) => u.location === 'table')
  let ids: UnitId[]
  switch (t.kind) {
    case 'self': ids = user && state.units[user] ? [user] : []; break
    case 'activeUnit': {
      const au = state.activeUnit ? state.units[state.activeUnit] : undefined
      const nominee = user ? state.units[user] : undefined
      ids = au && au.owner === r.seat && au.location === 'table' ? [au.id]
        : nominee && (nominee.location === 'table' || (nominee.location === 'reserves' && a.effects.some((e) => e.op === 'altEntry'))) ? [nominee.id] : []
      break
    }
    case 'friendlyUnit': ids = base.filter((u) => u.owner === r.seat).map((u) => u.id); break
    case 'otherFriendlyUnit': ids = base.filter((u) => u.owner === r.seat && u.id !== user).map((u) => u.id); break
    case 'enemyUnit': ids = base.filter((u) => u.owner !== r.seat).map((u) => u.id); break
    case 'anyUnit': ids = base.map((u) => u.id); break
    case 'point': return { kind: 'point' }
    case 'tableEdge': {
      const dep = state.deploymentId ? deploymentDef(bundle, state.deploymentId) : undefined
      const col = state.seats[r.seat]?.colour
      const own = new Set((dep && col ? dep.entryEdges[col] : []).map((s) => s.edge as string))
      return { kind: 'edge', edges: ['N', 'S', 'E', 'W'].filter((e) => !own.has(e)) }
    }
    default: ids = []
  }
  void trigUnit
  ids = ids.filter((id) => {
    if (!filterOk(id)) return false
    if (t.kind !== 'self' && t.kind !== 'activeUnit' && keywordOf(state, bundle, id, 'STRUCTURE') && !allowsStructure(a)) return false
    if (t.range !== undefined && user && id !== user) {
      if (unitDistance(state, user, id) > t.range + 1e-6) return false
      if (t.los !== false && !canTarget(state, bundle, user, id, { ranged: false, needsLos: true }).ok) return false
    }
    return true
  })
  return { kind: 'units', ids: ids.sort() }
}

/** A summoned structure that "acts dormant" this Round may only use Structure (dormant-summoned-structure). */
const isDormant = (state: GameState, bundle: EditionBundle, unitId: UnitId): boolean => effectOps(state, bundle, unitId, 'dormant').length > 0
/** dormant-summoned-structure also forbids the ability while a friendly Unit of the named type is on the battlefield. */
function blockedByDormantRule(state: GameState, r: AbilityRef, a: AbilityDef): boolean {
  const e = a.effects.find((x) => x.op === 'code' && x.code === 'dormant-summoned-structure')
  const unit = (e?.args as { unit?: string } | undefined)?.unit
  return !!unit && Object.values(state.units).some((u) => u.owner === r.seat && u.profileId === unit && u.location === 'table')
}

function phaseOk(state: GameState, a: AbilityDef): boolean {
  return a.phase === 'any' || !state.roundPhase || a.phase === state.roundPhase
}

interface Usable { ref: AbilityRef; ability: ReturnType<typeof effectiveAbility> }
/** Active abilities and card actives the Unit could use in this window ('action' = as its action, insteadOfAction). */
function usableActives(state: GameState, bundle: EditionBundle, unitId: UnitId, window: 'before' | 'after' | 'action'): Usable[] {
  const u = state.units[unitId]
  if (!u || u.location === 'destroyed') return []
  const out: Usable[] = []
  for (const ref of abilityRefs(state, bundle)) {
    if (ref.seat !== u.owner || ref.ability.type !== 'active') continue
    if (ref.unitId && ref.unitId !== unitId) continue
    const a = effectiveAbility(state, bundle, ref)
    if ((window === 'action') !== !!a.insteadOfAction) continue
    if (ref.unitId && u.location === 'reserves' && !a.usableInReserves) continue
    // ABL-024: a card Active needs the activated Unit on the battlefield.
    // Card Actives that bring the nominated Unit in another way (Armed and Ready, Warp In) are offered before its deploy.
    const aimsAtReserve = u.location === 'reserves' && window === 'before' && a.target?.kind === 'activeUnit' && a.effects.some((e) => e.op === 'altEntry')
    if (!ref.unitId && !aimsAtReserve && (u.location !== 'table' || state.activeUnit !== unitId)) continue
    if (!phaseOk(state, a)) continue
    if (ref.unitId && isDormant(state, bundle, ref.unitId) && ref.ability.id !== 'structure') continue
    if (blockedByDormantRule(state, ref, a)) continue
    const subject = ref.unitId ?? unitId
    if (!limitOk(state, ref, subject)) continue
    if (a.requires && !conditionHolds(state, bundle, a.requires, unitId, {})) continue
    // the price
    if (a.options?.length) {
      if (!a.options.some((o) => { const c = costOf(state, bundle, ref, unitId, o.id); return !c || canPay(state, bundle, ref.seat, c.res, c.n) })) continue
    } else {
      const c = costOf(state, bundle, ref, unitId)
      if (c && !canPay(state, bundle, ref.seat, c.res, c.n)) continue
    }
    const need = targetNeed(state, bundle, ref, a, unitId)
    if (need.kind === 'units' && need.ids.length === 0) continue
    if (need.kind === 'edge' && need.edges.length === 0) continue
    out.push({ ref, ability: a })
  }
  return out.sort((x, y) => refKey(x.ref).localeCompare(refKey(y.ref)))
}

/** Active abilities and card actives the Unit could use in this window ('action' = as its action, insteadOfAction). */
export function abilityOptions(state: GameState, bundle: EditionBundle, unitId: UnitId, window: 'before' | 'after' | 'action'): DecisionOption[] {
  const seat = state.units[unitId]?.owner ?? ''
  return usableActives(state, bundle, unitId, window).map(({ ref, ability }) => option(
    `use:${refKey(ref)}`, `${ability.name}${ref.cardId ? ` (${cardDef(bundle, ref.cardId)?.name ?? ref.cardId})` : ''}`,
    window === 'action' ? 'ability.action' : 'ability.use', { source: holderId(ref), abilityId: ability.id, ...(window === 'action' ? {} : { window }) }, seat,
  ))
}

/** Open the before- or after-action ability window for the active Unit (turnflow calls it). Nothing to offer: the state
 *  comes back unchanged and no decision is raised. Closing the window calls resumeIn('turn') (turnflow.resume). */
export function openWindow(state: GameState, bundle: EditionBundle, unitId: UnitId, window: 'before' | 'after'): StepResult {
  const seat = state.units[unitId]?.owner
  if (!seat) return reject('E_BAD_TARGET', `Unknown Unit ${unitId}.`)
  const opts = abilityOptions(state, bundle, unitId, window)
  if (opts.length === 0) return { state, done: windowDone(unitId) }
  return {
    state: raiseDecision(state, {
      seat, kind: 'ability.window', context: { unitId, window }, canPass: true,
      options: [...opts, option('done', 'Done', 'ability.done', { window }, seat)],
    }),
  }
}

/** turnflow's contract: a closed window reports an `ability.*` ActionDone and afterAction() moves on. */
const windowDone = (unitId: UnitId, type = 'ability.window'): ActionDone => ({ modelId: unitId, unitId, type, triggers: [] })
function closeWindow(state: GameState, unitId: UnitId): StepResult {
  return { state, done: windowDone(unitId) }
}

function startFlow(state: GameState, bundle: EditionBundle, flow: Flow): StepResult {
  const ref = findRef(state, bundle, flow.source, flow.abilityId, flow.seat)
  if (!ref) return reject('E_NOT_LEGAL', `${flow.abilityId} is not available.`)
  const a = effectiveAbility(state, bundle, ref)
  if (flow.v === 'use') {
    const ok = usableActives(state, bundle, flow.unitId ?? '', flow.window ?? 'before').some((x) => refKey(x.ref) === refKey(ref))
    if (!ok) return reject('E_NOT_LEGAL', `${a.name} cannot be used now.`)
  }
  return advance(state, bundle, flow)
}

/** Move a flow to its next stop: option -> target -> pay -> run -> done. */
function advance(state: GameState, bundle: EditionBundle, flow: Flow): StepResult {
  const ref = findRef(state, bundle, flow.source, flow.abilityId, flow.seat)
  if (!ref) return reject('E_NOT_LEGAL', `${flow.abilityId} is no longer available.`)
  const a = effectiveAbility(state, bundle, ref)
  const seat = flow.seat
  if (a.options?.length && !flow.optionId) {
    const opts = a.options.filter((o) => { const c = costOf(state, bundle, ref, flow.unitId, o.id); return !c || canPay(state, bundle, seat, c.res, c.n) })
    if (opts.length === 0) return reject('E_COST', 'No option can be paid.')
    if (opts.length === 1) return advance(state, bundle, { ...flow, optionId: opts[0]!.id })
    return { state: raiseDecision(state, { seat, kind: 'ability.target', context: { cont: { k: 'option', flow } satisfies Cont, prompt: a.name }, canPass: false,
      options: opts.map((o) => option(`opt:${o.id}`, o.text || o.id, 'ability.target', { mode: 'option', optionId: o.id }, seat)) }) }
  }
  if (flow.v === 'use' && !flow.paid) {
    const need = targetNeed(state, bundle, ref, a, flow.unitId)
    if (need.kind === 'units' && flow.targetUnitId === undefined) {
      if (need.ids.length === 0) return reject('E_BAD_TARGET', 'There is no legal target.')
      if (need.ids.length === 1) return advance(state, bundle, { ...flow, targetUnitId: need.ids[0]! })
      return { state: raiseDecision(state, { seat, kind: 'ability.target', context: { cont: { k: 'unit', flow, cands: need.ids } satisfies Cont, prompt: a.name }, canPass: false,
        options: need.ids.map((id) => option(`tgt:${id}`, `${id}`, 'ability.target', { mode: 'unit', unitId: id }, seat)) }) }
    }
    if (need.kind === 'edge' && flow.edge === undefined) {
      return { state: raiseDecision(state, { seat, kind: 'ability.target', context: { cont: { k: 'edge', flow, cands: need.edges } satisfies Cont, prompt: a.name }, canPass: false,
        options: need.edges.map((e) => option(`edge:${e}`, `Edge ${e}`, 'ability.target', { mode: 'edge', edge: e }, seat)) }) }
    }
    if (need.kind === 'point' && flow.point === undefined) {
      const spots = spotAnswers(state, seat, spotCentres(state, seat, [flow.unitId]), (p) => !isRejection(advance(state, bundle, { ...flow, point: p })))
      // no legal spot: the only answer is to drop the ability (it counts as tried this Round so the window cannot loop)
      return { state: raiseDecision(state, { seat, kind: 'ability.target', context: { cont: { k: 'usePoint', flow } satisfies Cont, prompt: a.name, points: spots }, canPass: false,
        options: spots.length ? spotOptions(spots, 'Choose a spot', seat) : [option('cancel', 'No legal spot: do not use it', 'ability.target', { mode: 'cancel' }, seat)] }) }
    }
  }
  // A Reaction that cuts the price (Advanced Training) is the player's choice and takes the one Reaction of this Activation:
  // ask when it would change the price and the full price can be paid without it (else it is the only way to pay).
  if (!flow.paid && flow.costReact === undefined) {
    const withIt = costOf(state, bundle, ref, flow.unitId, flow.optionId)
    const without = costOf(state, bundle, ref, flow.unitId, flow.optionId, 'skip')
    if (withIt && without && withIt.n !== without.n && withIt.mods.some((m) => m.ability.type === 'reaction')) {
      if (!canPay(state, bundle, seat, without.res, without.n)) return advance(state, bundle, { ...flow, costReact: 'use' })
      const names = withIt.mods.filter((m) => m.ability.type === 'reaction').map((m) => m.ability.name).join(', ')
      return { state: raiseDecision(state, { seat, kind: 'ability.target', context: { cont: { k: 'costReact', flow } satisfies Cont, prompt: `${names}?` }, canPass: false,
        options: [
          option('costReaction:use', `Use ${names}: pay ${withIt.n} ${withIt.res} (uses your Reaction)`, 'ability.target', { mode: 'costReaction', use: true }, seat),
          option('costReaction:skip', `Pay the full ${without.n} ${without.res} and keep your Reaction`, 'ability.target', { mode: 'costReaction', use: false }, seat),
        ] }) }
    }
  }
  // the price (ABL-002: paid before the effect), then the effect
  let s = state
  if (!flow.paid) {
    const c = costOf(s, bundle, ref, flow.unitId, flow.optionId, flow.costReact ?? 'use')
    if (ref.cardId) s = exhaustCard(s, seat, ref.cardId)
    if (c && c.n > 0) {
      if (!canPay(s, bundle, seat, c.res, c.n)) return reject('E_COST', `Cannot pay ${c.n} ${c.res}.`)
      const p = pay(s, bundle, seat, c.res, c.n, { cont: { k: 'pay', flow: { ...flow, paid: true } } satisfies Cont } as Record<string, unknown>)
      if (isRejection(p)) return p
      s = p.state
      for (const m of c.mods) { s = recordUse(s, m, flow.unitId); if (m.ability.type === 'reaction') s = markReaction(s, m.seat) }
      s = recordUse(s, ref, usageSubject(flow))
      if (s.pending.kind === 'ability.pay' && s.pending.id !== state.pending.id) return { state: s }
    } else {
      for (const m of c?.mods ?? []) { s = recordUse(s, m, flow.unitId); if (m.ability.type === 'reaction') s = markReaction(s, m.seat) }
      s = recordUse(s, ref, usageSubject(flow))
    }
  }
  return runFlow(s, bundle, ref, a, { ...flow, paid: true })
}

/** The Unit a card ability's once-per-Round is charged to: the reaction's subject, else the target, else the user. */
const usageSubject = (flow: Flow): UnitId | null =>
  flow.trig ? flow.trig.ctx.targetUnitId ?? flow.trig.ctx.unitId ?? flow.unitId : flow.targetUnitId ?? flow.unitId

const markReaction = (state: GameState, seat: SeatId): GameState =>
  state.activeUnit !== null && !state.reactionsUsed.includes(seat) ? { ...state, reactionsUsed: [...state.reactionsUsed, seat] } : state

function runFlow(state: GameState, bundle: EditionBundle, ref: AbilityRef, a: AbilityDef, flow: Flow): StepResult {
  let s = state
  const effects = flow.optionId ? a.options?.find((o) => o.id === flow.optionId)?.effects ?? a.effects : a.effects
  // A targeted Active leaves a marker so conditions like Target Lock's `targetSelectedBy` can find the Unit.
  if (flow.v === 'use' && flow.targetUnitId && a.target && a.target.kind !== 'self' && a.target.kind !== 'activeUnit') {
    s = addEffect(s, flow.targetUnitId, { source: a.id, kind: 'mod', expires: 'endOfRound', bySeat: flow.seat, round: s.round, data: { op: 'selected', by: flow.unitId } })
  }
  const trig = flow.trig
  const ctx: EffectCtx = {
    seat: flow.seat, sourceId: a.id, unitId: ref.unitId ?? flow.unitId, ...(flow.targetUnitId ? { targetUnitId: flow.targetUnitId } : {}),
    ...(flow.point ? { point: flow.point } : {}), ...(flow.edge ? { edge: flow.edge } : {}), ...(flow.optionId ? { optionId: flow.optionId } : {}),
    ...(trig ? { triggerUnitId: triggerUnitOf(a.trigger, trig.ctx), attackerUnitId: trig.ctx.unitId, hook: trig.ctx } : {}),
    after: { k: 'flow', flow },
    // ABL-026: what an Active grants lasts to the End of the Round unless the card gives a shorter span
    ...(a.type === 'active' ? { defaultDuration: 'endOfRound' as const } : {}),
  }
  if (flow.v === 'use' && !ctx.targetUnitId && a.target?.kind === 'activeUnit' && s.activeUnit) ctx.targetUnitId = s.activeUnit
  const r = execList(s, bundle, [...effects], ctx)
  if (isRejection(r)) return r
  if (r.suspended) return { state: r.state }
  return finishAfter(r.state, bundle, ctx.after)
}

function finishAfter(state: GameState, bundle: EditionBundle, after: After | undefined): StepResult {
  if (!after) return { state }
  switch (after.k) {
    case 'flow': return finishFlow(state, bundle, after.flow)
    case 'window': return reopenWindow(state, bundle, after.unitId, after.window)
    case 'resume': return resumeIn(state, bundle, after.ns)
    case 'delayed': return delayedStep(state, bundle, after.event, after.phase)
    case 'done': return { state, done: windowDone(after.unitId, 'ability.react') }
  }
}

function reopenWindow(state: GameState, bundle: EditionBundle, unitId: UnitId, window: 'before' | 'after'): StepResult {
  const r = openWindow(state, bundle, unitId, window)
  if (isRejection(r)) return r
  if (!r.done) return r
  return closeWindow(r.state, unitId)
}

function finishFlow(state: GameState, bundle: EditionBundle, flow: Flow): StepResult {
  if (flow.v === 'react') return finishReaction(markReaction(state, flow.seat), bundle, flow.trig!)
  if (flow.window === 'action') {
    const id = flow.unitId ?? ''
    const ref = findRef(state, bundle, flow.source, flow.abilityId, flow.seat)
    return { state, done: { modelId: id, unitId: id, type: 'ability.action', triggers: [], ...(ref?.ability.endsActivation ? { endsActivation: true } : {}) } }
  }
  return reopenWindow(state, bundle, flow.unitId ?? '', flow.window === 'after' ? 'after' : 'before')
}

// ---------------------------------------------------------------- reactions and the dispatcher
/** Result of dispatching one event to its listeners. Value changes (damage reduced, dice removed, an attack redirected)
 *  are written into the Effect list and read back by hooks.runHook; only the raised flag travels here. */
export interface DispatchResult { state: GameState; raised?: boolean }

const BLOCKED_BY_INSTANT: readonly TriggerEvent[] = ['targeted', 'declareRangedAttack', 'attackResolved', 'beforeArmourRoll', 'beforeEvadeRoll', 'damageSuffered']

function seatOrder(state: GameState): SeatId[] {
  const first = state.active ?? state.firstPlayer ?? state.seatOrder[0]
  return [...(first ? [first] : []), ...state.seatOrder.filter((s) => s !== first)]
}

/** Where control goes when a passive's effect list had to ask the player something (a spot): the same hand-back a
 *  Reaction window uses. */
function passiveAfter(state: GameState, ctx: HookCtx, after?: After): After | undefined {
  if (after) return after
  if (ctx.returnTo) return { k: 'resume', ns: ctx.returnTo }
  if (state.attack) return { k: 'resume', ns: 'atk' }
  if (state.turn?.step === 'round:start' || state.roundPhase === 'scoring') return { k: 'done', unitId: ctx.unitId ?? '' }
  if (state.activeUnit !== null) return { k: 'resume', ns: 'turn' }
  return undefined
}

/** "Its first weapon used" grants (Raynor's Orders, Wild Mutation, the Armory...) are used up by the first weapon the Unit
 *  fires: once an action in which it fired a ranged weapon (grant for the Assault Phase) or fought (grant for the Combat
 *  Phase) is over, the grant is gone (R p.81 10.2: it lasts to the End of the Round unless used). The grant reaches every Batch
 *  of that one action. Scans the log back to the activation's `turn.begin`. */
function spendFirstWeaponGrants(state: GameState, unitId: UnitId): GameState {
  const u = state.units[unitId]
  if (!u || !u.effects.some((e) => e.weapons?.first)) return state
  let ranged = false, melee = false
  for (let i = state.events.length - 1; i >= 0; i--) {
    const e = state.events[i]! as unknown as { type: string; unitId?: string; fought?: boolean }
    if (e.type === 'turn.begin' && e.unitId === unitId) break
    if (e.type === 'shoot.fire' && e.unitId === unitId) ranged = true
    if (e.type === 'melee.done' && e.unitId === unitId && e.fought) melee = true
  }
  if (!ranged && !melee) return state
  return removeEffects(state, unitId, (e) => !!e.weapons?.first && (e.weapons.phase === 'assault' ? ranged : e.weapons.phase === 'combat' ? melee : ranged || melee))
}

/** Find the listeners of `event`, run the matching Passives now (active player's first, ABL-031) and offer the matching
 *  Reactions (one per player per Activation, active player first, ABL-042/043). A raised Reaction window returns
 *  `raised`: the caller stops and continues in its resume(); the window carries `after` / `returnTo`. */
export function dispatch(state: GameState, bundle: EditionBundle, event: TriggerEvent, ctx: HookCtx, point?: string, after?: After): DispatchResult {
  let s = state
  if (event === 'actionResolved' && ctx.unitId && !ctx.foldOnly) s = spendFirstWeaponGrants(s, ctx.unitId)
  const order = seatOrder(s)
  const refs = abilityRefs(s, bundle).filter((r) => r.ability.trigger?.event === event && r.ability.type !== 'active')
    .sort((a, b) => order.indexOf(a.seat) - order.indexOf(b.seat) || refKey(a).localeCompare(refKey(b)))
  const reactions: AbilityRef[] = []
  for (const r of refs) {
    const t = r.ability.trigger!
    if (!listenerReady(s, bundle, r, ctx, event) || !matchTrigger(s, bundle, r, t, ctx, event)) continue
    const subject = ctx.targetUnitId ?? ctx.unitId ?? null
    if (r.ability.type === 'passive') {
      if (ctx.reactionsOnly) continue
      if (!limitOk(s, r, subject)) continue
      if (r.ability.effects.every((e) => e.op === 'costMod' || e.op === 'abilityMod')) continue
      if (r.ability.limit) s = recordUse(s, r, subject)
      const ec: EffectCtx = {
        seat: r.seat, sourceId: r.ability.id, unitId: r.unitId, triggerUnitId: triggerUnitOf(t, ctx), attackerUnitId: ctx.unitId,
        ...(ctx.targetUnitId ? { targetUnitId: ctx.targetUnitId } : {}), hook: ctx,
        ...(passiveAfter(s, ctx, after) ? { after: passiveAfter(s, ctx, after)! } : {}),
      }
      const e = execList(s, bundle, [...r.ability.effects], ec)
      if (!isRejection(e)) {
        s = e.state
        // A passive that needs an answer (a spot for PLACE) raised a decision: stop here and tell the caller, which
        // resumes through `after` once it is answered.
        if (e.suspended && s.pending.id !== state.pending.id) return { state: s, raised: true }
      }
    } else if (limitOk(s, r, subject) && !(ctx.batch?.keywords.some((k: KwRef) => k.kw === 'INSTANT') && BLOCKED_BY_INSTANT.includes(event))) {
      const cost = r.ability.cost
      if (cost && typeof cost.n === 'number' && !canPay(s, bundle, r.seat, cost.res, cost.n)) continue
      reactions.push(r)
    }
  }
  const res: DispatchResult = { state: s }
  if (reactions.length === 0 || ctx.noPrompt) return res
  const inActivation = s.activeUnit !== null
  const seatsWith = order.filter((seat) => reactions.some((r) => r.seat === seat) && !(inActivation && s.reactionsUsed.includes(seat)))
  if (seatsWith.length === 0) return res
  const trig: Trig = {
    event, ctx, ...(point ? { point } : {}), seatsLeft: seatsWith,
    ...(ctx.returnTo ?? (s.attack ? 'atk' : undefined) ? { returnTo: (ctx.returnTo ?? 'atk') } : {}),
    prev: s.pending, ...(after ? { after } : {}),
  }
  const raised = raiseReaction(s, bundle, trig)
  return { ...res, state: raised, raised: raised.pending.id !== s.pending.id }
}

function offersFor(state: GameState, bundle: EditionBundle, trig: Trig, seat: SeatId): Offer[] {
  const out: Offer[] = []
  for (const r of abilityRefs(state, bundle)) {
    if (r.seat !== seat || r.ability.type !== 'reaction' || r.ability.trigger?.event !== trig.event) continue
    const subject = trig.ctx.targetUnitId ?? trig.ctx.unitId ?? null
    if (!listenerReady(state, bundle, r, trig.ctx, trig.event) || !matchTrigger(state, bundle, r, r.ability.trigger, trig.ctx, trig.event)) continue
    if (!limitOk(state, r, subject)) continue
    const cost = r.ability.cost
    if (cost && typeof cost.n === 'number' && !canPay(state, bundle, seat, cost.res, cost.n)) continue
    out.push({ source: holderId(r), abilityId: r.ability.id, seat, label: r.ability.name })
  }
  return out
}

function raiseReaction(state: GameState, bundle: EditionBundle, trig: Trig): GameState {
  let seatsLeft = trig.seatsLeft
  while (seatsLeft.length) {
    const seat = seatsLeft[0]!
    const offers = offersFor(state, bundle, trig, seat)
    if (offers.length && !(state.activeUnit !== null && state.reactionsUsed.includes(seat))) {
      const t: Trig = { ...trig, seatsLeft }
      const cont: Cont = { k: 'react', trig: t, offers }
      return raiseDecision(state, {
        seat, kind: 'ability.react', context: { cont, event: trig.event }, canPass: true,
        options: [...offers.map((o, i) => option(`react${i}`, o.label, 'ability.useReaction', { source: o.source, abilityId: o.abilityId }, seat)),
          option('skip', 'No reaction', 'ability.skipReaction', {}, seat)],
      })
    }
    seatsLeft = seatsLeft.slice(1)
  }
  return state
}

/** After one player's Reaction window: offer the next player, or hand control back. */
function finishReaction(state: GameState, bundle: EditionBundle, trig: Trig): StepResult {
  const left = trig.seatsLeft.slice(1)
  if (left.length) {
    const next = raiseReaction(state, bundle, { ...trig, seatsLeft: left })
    if (next.pending.id !== state.pending.id) return { state: next }
  }
  if (trig.after) return finishAfter(state, bundle, trig.after)
  if (trig.returnTo) return resumeIn(state, bundle, trig.returnTo)
  // Hooks that turnflow runs outside any Activation: its afterAction() continues the Start of the Round / Scoring.
  if (state.turn?.step === 'round:start' || state.roundPhase === 'scoring') return { state, done: windowDone(trig.ctx.unitId ?? '', 'ability.react') }
  return { state: trig.prev ? { ...state, pending: trig.prev } : state }
}

// ---------------------------------------------------------------- the module
/** The spot a point answer names. A point or path that is present must be finite numbers (else E_BAD_PARAM); only an
 *  answer that names neither takes the first ready spot of the open decision (the open template). */
function answerPoint(state: GameState, action: Action): Vec2 | Rejection {
  const bad = (action.point !== undefined && !isVec(action.point))
    || (action.path !== undefined && !(Array.isArray(action.path) && action.path.length > 0 && action.path.every(isVec)))
  if (bad) return reject('E_BAD_PARAM', 'A point is {x, z} with finite numbers; a path is a list of such points.')
  const named = isVec(action.point) ? action.point : Array.isArray(action.path) ? (action.path as Vec2[])[action.path.length - 1] : undefined
  const pt = named ?? (state.pending.context.points as Vec2[] | undefined)?.[0]
  return isVec(pt) ? { x: pt.x, z: pt.z } : reject('E_BAD_PARAM', 'Give a point {x, z}.')
}

function resolveTarget(state: GameState, bundle: EditionBundle, action: Action): StepResult {
  const cont = state.pending.context.cont as Cont | undefined
  if (!cont) return reject('E_BAD_PARAM', 'This decision has no continuation.')
  const mode = String(action.mode ?? '')
  switch (cont.k) {
    case 'option': {
      if (mode !== 'option' || typeof action.optionId !== 'string') return reject('E_BAD_PARAM', 'Pick one of the options.')
      return advance(state, bundle, { ...cont.flow, optionId: action.optionId })
    }
    case 'unit': {
      if (mode !== 'unit' || typeof action.unitId !== 'string' || !cont.cands?.includes(action.unitId)) return reject('E_BAD_TARGET', 'Not a legal target.')
      return advance(state, bundle, { ...cont.flow, targetUnitId: action.unitId })
    }
    case 'edge': {
      if (mode !== 'edge' || typeof action.edge !== 'string' || !cont.cands?.includes(action.edge)) return reject('E_BAD_TARGET', 'Not a legal edge.')
      return advance(state, bundle, { ...cont.flow, edge: action.edge })
    }
    case 'usePoint': {
      if (mode === 'cancel') {
        const ref = findRef(state, bundle, cont.flow.source, cont.flow.abilityId, cont.flow.seat)
        const s = ref ? recordUse(state, ref, usageSubject(cont.flow)) : state
        return finishFlow(s, bundle, cont.flow)
      }
      const pt = answerPoint(state, action)
      if (isRejection(pt)) return pt
      return advance(state, bundle, { ...cont.flow, point: { x: pt.x, z: pt.z } })
    }
    case 'point': {
      const ctx = cont.ctx
      if (mode === 'skip' && cont.optional) {
        const r = execList(state, bundle, cont.rest, ctx)
        if (isRejection(r)) return r
        return r.suspended ? { state: r.state } : finishAfter(r.state, bundle, ctx.after)
      }
      if (mode !== 'point') return reject('E_BAD_PARAM', 'Give a point {x, z}.')
      const pt = answerPoint(state, action)
      if (isRejection(pt)) return pt
      const r = execPoint(state, bundle, cont.rec, ctx, { x: pt.x, z: pt.z }, cont.rest)
      if (isRejection(r)) return r
      return r.suspended ? { state: r.state } : finishAfter(r.state, bundle, ctx.after)
    }
    case 'recall': {
      if (mode === 'return') return { state: returnToReserves(state, bundle, cont.unitId, cont.source) }
      return { state }
    }
    case 'khala': {
      if (mode !== 'unit' || typeof action.unitId !== 'string' || !cont.cands.includes(action.unitId)) return reject('E_BAD_TARGET', 'Not a legal choice.')
      const seat = state.units[action.unitId]!.owner
      const s = addEffect(state, action.unitId, { source: 'bound-by-the-khala', kind: 'mod', expires: 'endOfActivation', bySeat: seat, round: state.round, data: { op: 'khalaActivate' } })
      return resumeIn(s, bundle, 'turn')
    }
    case 'costReact': {
      if (mode !== 'costReaction' || typeof action.use !== 'boolean') return reject('E_BAD_PARAM', 'Say whether to use the Reaction.')
      return advance(state, bundle, { ...cont.flow, costReact: action.use ? 'use' : 'skip' })
    }
    case 'newModel': {
      let next: NewCont
      if (mode === 'skip' && cont.op === 'respawn') next = { ...cont, ids: cont.ids.slice(0, cont.pts.length) }
      else if (mode === 'remove' && cont.op === 'morph') {
        const pool = tableModels(state, cont.unitId).map((m) => m.id).filter((id) => !(cont.removed ?? []).includes(id))
        if (typeof action.modelId !== 'string' || !pool.includes(action.modelId)) return reject('E_BAD_TARGET', 'Not a model that can be removed.')
        next = { ...cont, removed: [...(cont.removed ?? []), action.modelId] }
      } else if (mode === 'point') {
        const pt = answerPoint(state, action)
        if (isRejection(pt)) return pt
        const job = cont.op === 'respawn' ? respawnJob(state, cont.ids, cont.pts) : morphSetup(state, bundle, cont.unitId, cont.into!)?.job
        if (!job || !spotLegal(state, bundle, cont.unitId, job, pt)) return reject('E_PLACEMENT', 'That spot is not in base contact with the Unit, or is within Engagement Range of an enemy.')
        next = { ...cont, pts: [...cont.pts, { x: pt.x, z: pt.z }] }
      } else return reject('E_BAD_PARAM', 'Choose a spot or a model.')
      const r = newModelStep(state, bundle, next)
      if (isRejection(r)) return r
      return r.suspended ? { state: r.state } : finishAfter(r.state, bundle, cont.ctx.after)
    }
    default: return reject('E_BAD_PARAM', 'Unexpected decision.')
  }
}

/** Ask the owner whether a Unit that ended a move touching the Omega Worm goes back to Reserves (Omega Network). */
export function raiseRecall(state: GameState, unitId: UnitId, source: Id): GameState {
  const seat = state.units[unitId]?.owner
  if (!seat) return state
  const cont: Cont = { k: 'recall', unitId, source }
  return raiseDecision(state, { seat, kind: 'ability.target', context: { cont, prompt: 'Return to Reserves?' }, canPass: true,
    options: [option('return', 'Return to Reserves', 'ability.target', { mode: 'return' }, seat), option('stay', 'Stay', 'ability.target', { mode: 'stay' }, seat)] })
}

/** Bound by the Khala, after the active Unit is done: offer the friendly Units that could still act this Phase. The pick
 *  gets a `khalaActivate` marker Effect for turnflow to activate it at once. Returns null when nothing is pending. */
export function offerKhala(state: GameState, bundle: EditionBundle, unitId: UnitId): GameState | null {
  const u = state.units[unitId]
  const marker = u?.effects.find((e) => e.kind === 'mod' && (e.data as { op?: string } | undefined)?.op === 'boundByKhala')
  if (!u || !marker) return null
  const s = removeEffects(state, unitId, (e) => e.id === marker.id)
  const phase = s.roundPhase
  const cands = phase ? Object.values(s.units).filter((x) => x.owner === u.owner && x.id !== unitId && x.location === 'table' && eligible(s, bundle, x.id, phase)).map((x) => x.id).sort() : []
  if (cands.length === 0) return s
  const cont: Cont = { k: 'khala', cands, unitId }
  return raiseDecision(s, { seat: u.owner, kind: 'ability.target', context: { cont, prompt: 'Bound by the Khala' }, canPass: false,
    options: cands.map((id) => option(`khala:${id}`, id, 'ability.target', { mode: 'unit', unitId: id }, u.owner)) })
}

function resolvePay(state: GameState, bundle: EditionBundle, action: Action): StepResult {
  const ctx = state.pending.context as { res: Resource; n: number; then?: { cont: Cont } }
  const cards = action.cards
  if (!Array.isArray(cards)) return reject('E_BAD_PARAM', 'Name the cards to exhaust.')
  const ready = readyWith(state, action.seat, ctx.res)
  const picked = cards.map((id) => ready.find((c) => c.id === id))
  if (picked.some((c) => !c) || new Set(cards).size !== cards.length) return reject('E_COST', 'Those cards cannot be exhausted for this cost.')
  const sum = picked.reduce((s, c) => s + c!.resource!.n, 0)
  if (sum < ctx.n || picked.some((c) => sum - c!.resource!.n >= ctx.n)) return reject('E_COST', `That does not pay exactly ${ctx.n} ${ctx.res} with no spare card.`)
  const s = (cards as Id[]).reduce((st, id) => exhaustCard(st, action.seat, id), state)
  const cont = ctx.then?.cont
  if (cont?.k === 'pay' && cont.flow) return advance(s, bundle, cont.flow)
  return { state: s }
}

function resolveReaction(state: GameState, bundle: EditionBundle, action: Action): StepResult {
  const cont = state.pending.context.cont as Cont | undefined
  if (cont?.k !== 'react') return reject('E_BAD_PARAM', 'This decision has no continuation.')
  const trig = cont.trig
  if (action.type === 'ability.skipReaction') return finishReaction(state, bundle, trig)
  const offer = cont.offers.find((o) => o.source === action.source && o.abilityId === action.abilityId)
  if (!offer) return reject('E_NOT_LEGAL', 'That reaction is not on offer.')
  const flow: Flow = { v: 'react', seat: offer.seat, unitId: state.units[offer.source] ? offer.source : null, source: offer.source, abilityId: offer.abilityId, trig }
  return advance(state, bundle, flow)
}

function resolveMenu(state: GameState, bundle: EditionBundle, action: Action): StepResult {
  const source = typeof action.source === 'string' ? action.source : '', abilityId = typeof action.abilityId === 'string' ? action.abilityId : ''
  const window = action.type === 'ability.action' ? 'action' : action.window === 'after' ? 'after' : 'before'
  const unitId = (state.pending.context.unitId as UnitId | undefined) ?? state.activeUnit
  if (!unitId || !state.units[unitId]) return reject('E_BAD_PARAM', 'No active Unit.')
  if (state.units[unitId]!.owner !== action.seat) return reject('E_WRONG_SEAT', 'Not your Unit.')
  return startFlow(state, bundle, { v: 'use', seat: action.seat, unitId, source, abilityId, window })
}

export const abilities: ModuleDef = {
  id: 'abilities',
  kinds: ['ability'],
  // ModuleDef.options never throws: a rule another module has not built yet (TodoError) just hides the entry.
  options(state, bundle, unitId) {
    try { return abilityOptions(state, bundle, unitId, 'action') } catch (e) { if (e instanceof TodoError) return []; throw e }
  },
  resolve(state, bundle, action) {
    switch (action.type) {
      case 'ability.use': case 'ability.action': return resolveMenu(state, bundle, action)
      case 'ability.done': return closeWindow(state, (state.pending.context.unitId as UnitId | undefined) ?? state.activeUnit ?? '')
      case 'ability.target': return resolveTarget(state, bundle, action)
      case 'ability.pay': return resolvePay(state, bundle, action)
      case 'ability.useReaction': case 'ability.skipReaction': return resolveReaction(state, bundle, action)
      default: return reject('E_UNKNOWN_KIND', `Abilities do not handle ${action.type}.`)
    }
  },
  /** attack.ts calls it when an attack started by a `hits` verb is finished: continue the rest of the effect list. */
  resume(state, bundle) {
    const p = popCont(state)
    if (!p || p.cont.k !== 'effects') return { state }
    let from = p.state
    // end hooks that a raised Reaction window cut short fire first; another window parks the rest again
    if (p.cont.pending?.length) {
      const f = firePending(from, bundle, p.cont.pending, 'ability')
      if (f.raised) return parkRaised(f.state, p.cont.rest, p.cont.ctx, f.rest)
      from = f.state
    }
    const r = execList(from, bundle, p.cont.rest, p.cont.ctx)
    if (isRejection(r)) return r
    return r.suspended ? { state: r.state } : finishAfter(r.state, bundle, p.cont.ctx.after)
  },
}

/** Does the unit have a status gained through the ability machinery? (re-export for callers that only import abilities) */
export { hasStatus as unitHasStatus }
void liveEffects
void setStatus
void codeCondition
void NO_LOS_SKIP
