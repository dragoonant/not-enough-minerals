// Checklist: MOD, ST, KW (stacking, KW-002), DICE-026/027, WPN-004 (effective profiles), VIS-020 (status links). Owner B.
// effects.ts: the one Effect list per unit (spec 16 s6) and statOf(), which folds it: BUFF/DEBUFF keep the highest X
// per (kind, stat), flat named mods add up, value floor 0. Statuses are Effects of kind 'status'. Service: no decisions.
//
// Read-time sources of a unit's effects (one pipeline, `liveEffects`): its stored Effect list; its printed and bought
// passive abilities without a trigger (only while on the table, ABL-030); passives and auras of other units and of
// Ready cards that reach it (`to: allFriendly | allEnemy`, `aura`). Event-driven passives and reactions never sit in
// that list: hooks.ts runs them at their hook point and writes the result back as short-lived stored Effects.
import type {
  AbilityDef, Characteristic, Condition, EditionBundle, EntryKind, Effect as DataEffect, Id, KwRef, StatusId, UnitDef, WeaponProfile,
  WeaponSel,
} from '../data/types'
import { allAbilities, bracketSupply, cardDef, requireUnitDef, rule, unitDef, weaponDef } from './edition'
import { codeCondition } from './code-hooks'
import { engagedWith, isEngaged } from './engage'
import { abilityRefs } from './abilities'
import { runHook } from './hooks'
import { modelDistance } from './measure'
import { unitModels } from './squads'
import type { CardState, Effect, EffectExpiry, GameState, ModelState, RoundPhase, SeatId, UnitId, UnitState, Vec2 } from './types'
import { baseRadius, dist } from './geometry'

/** What a characteristic read is for (some effects only apply to one weapon, attack kind or target). */
export interface StatCtx {
  weaponId?: Id
  attack?: 'ranged' | 'closeCombat'
  targetUnitId?: UnitId
  phase?: RoundPhase
  /** Speed: read the Run value of a split Speed (default: the Move value). */
  run?: boolean
  /** The attacking Unit when the read is for the defender's side of an attack. */
  attackerUnitId?: UnitId
  /** The ability or card id whose damage / hits this is (Potent Bile vs Corrosive Bile). */
  fromAbility?: Id
  /** The triggering attack has INSTANT. */
  instant?: boolean
  /** How the Unit arrived (Photon Overcharge). */
  entryKind?: EntryKind
  /** False when the roll is not the first of its kind in the scope a `first` condition names (one flag for both scopes,
   *  or one per scope). Absent = true. hooks.runHook fills it for the Armour and Evade Roll points. */
  first?: boolean | { round: boolean; activation: boolean }
}

/** One normalized, currently applicable effect record on a unit (see file header). */
export interface LiveEffect {
  /** Ability / card / upgrade id: same-named sources never stack (ABL-005, DICE-026). */
  source: Id
  rec: DataEffect
  /** Which of the unit's weapons it touches; absent = the unit (or every weapon for a weapon characteristic). */
  sel?: WeaponSel
  expires: EffectExpiry
  bySeat: SeatId
}

const isSel = (x: unknown): x is WeaponSel => typeof x === 'object' && x !== null && !Array.isArray(x)
const num = (x: unknown): number => (typeof x === 'number' ? x : 0)
const TN_STATS: readonly Characteristic[] = ['armour', 'evade', 'hit']
const WEAPON_STATS: readonly Characteristic[] = ['roa', 'hit', 'range', 'dmg']

// ---------------------------------------------------------------- geometry helpers
/** The unit's models that are on the table (alive and not off it). */
export function tableModels(state: GameState, unitId: UnitId): ModelState[] {
  return unitModels(state, unitId).filter((m) => !m.offTable && m.life !== 'dead')
}

/** Smallest base-edge distance between two units' table models (Infinity when either has none). */
export function unitDistance(state: GameState, a: UnitId, b: UnitId): number {
  const ma = tableModels(state, a), mb = tableModels(state, b)
  let best = Infinity
  for (const x of ma) for (const y of mb) best = Math.min(best, modelDistance(x, y))
  return best
}

/** Smallest base-edge distance from a unit to a point. */
export function unitToPoint(state: GameState, unitId: UnitId, p: Vec2): number {
  let best = Infinity
  for (const m of tableModels(state, unitId)) best = Math.min(best, Math.max(0, dist(m.pos, p) - baseRadius(m.base)))
  return best
}

// ---------------------------------------------------------------- conditions
/** Evaluate a data Condition (all keys AND-ed). `selfId` = the Unit that owns the ability, or the affected Unit inside an
 *  aura; target-side keys read ctx.targetUnitId. Keys that need another module (engaged) may raise TodoError. */
export function conditionHolds(state: GameState, bundle: EditionBundle, cond: Condition | undefined, selfId: UnitId | null, ctx: StatCtx = {}): boolean {
  if (!cond) return true
  const self = selfId ? state.units[selfId] : undefined
  const sdef = self ? unitDef(bundle, self.profileId) : undefined
  const tgt = ctx.targetUnitId ? state.units[ctx.targetUnitId] : undefined
  const tdef = tgt ? unitDef(bundle, tgt.profileId) : undefined
  const needSelf = (ok: () => boolean): boolean => (self && sdef ? ok() : false)
  const needTgt = (ok: () => boolean): boolean => (tgt && tdef ? ok() : false)
  const sizeOk = (v: number | null, r: { min?: number; max?: number }): boolean => v !== null && (r.min === undefined || v >= r.min) && (r.max === undefined || v <= r.max)

  if (cond.tags && !needSelf(() => cond.tags!.every((t) => sdef!.combatTags.includes(t)))) return false
  if (cond.notTags && !needSelf(() => !cond.notTags!.some((t) => sdef!.combatTags.includes(t)))) return false
  if (cond.factionTags && !needSelf(() => cond.factionTags!.some((t) => sdef!.factionTags.includes(t)))) return false
  if (cond.race && !needSelf(() => sdef!.race === cond.race)) return false
  if (cond.units && !needSelf(() => cond.units!.includes(sdef!.id))) return false
  if (cond.unique !== undefined && !needSelf(() => sdef!.unique === cond.unique)) return false
  if (cond.structure !== undefined && !needSelf(() => (keywordOf(state, bundle, selfId!, 'STRUCTURE') !== null) === cond.structure)) return false
  if (cond.size && !needSelf(() => sizeOk(statOf(state, bundle, selfId!, 'size'), cond.size!))) return false
  if (cond.status && !needSelf(() => cond.status!.every((s) => statusHeld(state, bundle, selfId!, s)))) return false
  if (cond.notStatus && !needSelf(() => !cond.notStatus!.some((s) => statusHeld(state, bundle, selfId!, s)))) return false
  if (cond.engaged !== undefined && !needSelf(() => isEngaged(state, bundle, selfId!) === cond.engaged)) return false
  if (cond.activated !== undefined && !needSelf(() => (self!.activation !== null) === cond.activated)) return false
  if (cond.onCreep !== undefined && !needSelf(() => statusHeld(state, bundle, selfId!, 'ON_CREEP') === cond.onCreep)) return false
  if (cond.withinMarker !== undefined) {
    const r = rule(bundle, 'markerDiameterMm') / 25.4 / 2
    if (!needSelf(() => state.markers.some((mk) => mk.onTable && unitToPoint(state, selfId!, mk.pos) - r <= cond.withinMarker! + 1e-6))) return false
  }
  if (cond.friendlyModelsWithin) {
    const { n, d } = cond.friendlyModelsWithin
    // RULING: counts every friendly model on the table within d of the Unit, its own models included.
    const mine = self ? tableModels(state, selfId!) : []
    const count = self ? Object.values(state.units).filter((u) => u.owner === self.owner && u.location === 'table')
      .reduce((s, u) => s + tableModels(state, u.id).filter((m) => mine.some((o) => modelDistance(o, m) <= d + 1e-6)).length, 0) : 0
    if (count < n) return false
  }
  if (cond.weapons && !(ctx.weaponId && cond.weapons.includes(ctx.weaponId))) return false
  if (cond.attack && ctx.attack !== cond.attack) return false
  if (cond.targetWithin !== undefined && !(selfId && ctx.targetUnitId && unitDistance(state, selfId, ctx.targetUnitId) <= cond.targetWithin + 1e-6)) return false
  if (cond.targetBeyond !== undefined && !(selfId && ctx.targetUnitId && unitDistance(state, selfId, ctx.targetUnitId) > cond.targetBeyond)) return false
  if (cond.targetTags && !needTgt(() => cond.targetTags!.every((t) => tdef!.combatTags.includes(t)))) return false
  if (cond.targetSize && !needTgt(() => sizeOk(statOf(state, bundle, ctx.targetUnitId!, 'size'), cond.targetSize!))) return false
  if (cond.targetStatus && !needTgt(() => cond.targetStatus!.every((s) => statusHeld(state, bundle, ctx.targetUnitId!, s)))) return false
  if (cond.targetActivated !== undefined && !needTgt(() => (tgt!.activation !== null) === cond.targetActivated)) return false
  if (cond.targetEngagedWithOtherFriendly !== undefined) {
    const v = needTgt(() => engagedWith(state, bundle, ctx.targetUnitId!).some((o) => o !== selfId && state.units[o]?.owner === self?.owner))
    if (v !== cond.targetEngagedWithOtherFriendly) return false
  }
  if (cond.targetWithinMarkerOfSelf !== undefined) {
    const r = rule(bundle, 'markerDiameterMm') / 25.4 / 2
    const ok = needTgt(() => state.markers.some((mk) => mk.onTable && needSelf(() => unitToPoint(state, selfId!, mk.pos) - r <= cond.targetWithinMarkerOfSelf!)
      && unitToPoint(state, ctx.targetUnitId!, mk.pos) - r <= cond.targetWithinMarkerOfSelf!))
    if (!ok) return false
  }
  if (cond.engagedWithSelf !== undefined) {
    const v = !!(selfId && ctx.targetUnitId && engagedWith(state, bundle, selfId).includes(ctx.targetUnitId))
    if (v !== cond.engagedWithSelf) return false
  }
  if (cond.targetSelectedBy && !(tgt && selectedBy(tgt, cond.targetSelectedBy))) return false
  if (cond.attackerSelectedBy) {
    const a = ctx.attackerUnitId ? state.units[ctx.attackerUnitId] : self
    if (!(a && selectedBy(a, cond.attackerSelectedBy))) return false
  }
  if (cond.targetWithinToken) {
    const { token, d } = cond.targetWithinToken
    if (!needTgt(() => state.tokens.some((t) => t.defId === token && t.owner === self?.owner && unitToPoint(state, ctx.targetUnitId!, t.pos) <= d + 1e-6))) return false
  }
  if (cond.fromAbility && ctx.fromAbility !== cond.fromAbility) return false
  if (cond.attackInstant !== undefined && (ctx.instant ?? false) !== cond.attackInstant) return false
  if (cond.first && (ctx.first === false || (typeof ctx.first === 'object' && ctx.first[cond.first] === false))) return false
  if (cond.phase && !((ctx.phase ?? state.roundPhase) && cond.phase.includes((ctx.phase ?? state.roundPhase)!))) return false
  if (cond.slots && !needSelf(() => !!self!.slot && cond.slots!.includes(self!.slot))) return false
  if (cond.entryKinds && !(ctx.entryKind && cond.entryKinds.includes(ctx.entryKind))) return false
  if (cond.code && !codeCondition(state, bundle, cond.code, { unitId: selfId ?? undefined, targetUnitId: ctx.targetUnitId })) return false
  return true
}

/** The unit was picked by the ability `abilityId` (its marker Effect is still in force). */
function selectedBy(u: UnitState, abilityId: Id): boolean {
  return u.effects.some((e) => e.kind === 'mod' && e.source === abilityId && e.data?.op === 'selected')
}

// ---------------------------------------------------------------- statuses
const creepRadius = new WeakMap<EditionBundle, number | null>()
/** The radius of the data aura that grants ON CREEP (Source of Creep); creep tumor tokens use the same radius. */
function creepRadiusOf(bundle: EditionBundle): number | null {
  if (creepRadius.has(bundle)) return creepRadius.get(bundle)!
  let r: number | null = null
  for (const u of bundle.records.units) for (const a of u.abilities) for (const e of a.effects) {
    if (e.op === 'aura' && Array.isArray(e.effects) && (e.effects as DataEffect[]).some((x) => x.op === 'status' && x.status === 'ON_CREEP')) r = num(e.radius)
  }
  creepRadius.set(bundle, r)
  return r
}

/** True when the unit has the stored status (BURROWED, HIDDEN, SIEGE_MODE, STATIONARY) or is SHIELDED. */
export function hasStatus(state: GameState, unitId: UnitId, status: StatusId): boolean {
  const u = state.units[unitId]
  if (!u) return false
  if (status === 'SHIELDED') return u.shielded
  return u.effects.some((e) => e.kind === 'status' && e.status === status)
}

/** hasStatus plus the derived statuses: ON_CREEP (Ground Zerg near a Creep Tumor token or a Source of Creep, never in
 *  Reserves) and statuses granted by an aura. */
export function statusHeld(state: GameState, bundle: EditionBundle, unitId: UnitId, status: StatusId): boolean {
  if (hasStatus(state, unitId, status)) return true
  const u = state.units[unitId]
  if (!u || u.location !== 'table') return false
  if (status === 'ON_CREEP') {
    const def = unitDef(bundle, u.profileId)
    const r = creepRadiusOf(bundle)
    if (!def || r === null || def.race !== 'zerg' || !def.combatTags.includes('ground')) return false
    if (state.tokens.some((t) => t.defId === 'creep-tumor' && unitToPoint(state, unitId, t.pos) <= r + 1e-6)) return true
  }
  return broadcasts(state, bundle).some((b) => b.rec.op === 'aura' && Array.isArray(b.rec.effects)
    && (b.rec.effects as DataEffect[]).some((x) => x.op === 'status' && x.status === status) && auraReaches(state, bundle, b, unitId))
}

/** True when a detector area covers the unit (it cannot hold HIDDEN there, VIS-012). */
export function inDetection(state: GameState, bundle: EditionBundle, unitId: UnitId): boolean {
  const u = state.units[unitId]
  if (!u || u.location !== 'table') return false
  for (const a of detectorAreas(state, bundle)) {
    if (a.owner === u.owner) continue
    const d = a.centre.kind === 'point' ? unitToPoint(state, unitId, a.centre.pos) : a.centre.kind === 'unit' ? unitDistance(state, unitId, a.centre.unitId)
      : (() => { const t = state.tokens.find((x) => x.id === (a.centre as { tokenId: Id }).tokenId); return t ? unitToPoint(state, unitId, t.pos) : Infinity })()
    if (d <= a.radius + 1e-6) return true
  }
  return false
}

/** Stored detector areas plus the implicit ones of Units with a `detection` passive centred on themselves. */
export function detectorAreas(state: GameState, bundle: EditionBundle): GameState['detectors'] {
  const out = [...state.detectors]
  for (const u of Object.values(state.units)) {
    if (u.location !== 'table') continue
    for (const a of staticAbilities(bundle, u)) for (const e of a.effects) {
      if (e.op === 'detection' && (e.centre === 'self' || e.centre === undefined)) {
        out.push({ id: `${u.id}:${a.id}`, owner: u.owner, centre: { kind: 'unit', unitId: u.id }, radius: num(e.radius), source: a.id, expires: 'permanent' })
      }
    }
  }
  return out
}

// ---------------------------------------------------------------- effect collection
/** A unit's printed and bought abilities (all types). */
export function abilitiesOf(bundle: EditionBundle, u: UnitState): AbilityDef[] {
  const def = unitDef(bundle, u.profileId)
  return def ? allAbilities(def, u.upgrades.map((x) => x.id)) : []
}
/** Passives without a trigger: always on while the Unit is on the table (ABL-030). */
function staticAbilities(bundle: EditionBundle, u: UnitState): AbilityDef[] {
  return abilitiesOf(bundle, u).filter((a) => a.type === 'passive' && !a.trigger)
}
/** A seat's cards with their definitions; Exhausted cards give nothing (CARD-005, RULING R16-1). */
export function readyCards(state: GameState, bundle: EditionBundle, seat: SeatId): { card: CardState; def: NonNullable<ReturnType<typeof cardDef>> }[] {
  return (state.cards[seat] ?? []).flatMap((card) => {
    const def = cardDef(bundle, card.id)
    return def && !card.exhausted ? [{ card, def }] : []
  })
}

interface Broadcast { source: Id; rec: DataEffect; ability: AbilityDef; owner: SeatId; from: UnitId | null }
/** Passive effects whose reach goes beyond their own Unit: `to allFriendly | allEnemy` and `aura`. */
function broadcasts(state: GameState, bundle: EditionBundle): Broadcast[] {
  const out: Broadcast[] = []
  const take = (a: AbilityDef, owner: SeatId, from: UnitId | null) => {
    for (const rec of a.effects) if (rec.op === 'aura' || rec.to === 'allFriendly' || rec.to === 'allEnemy') out.push({ source: a.id, rec, ability: a, owner, from })
  }
  for (const u of Object.values(state.units)) if (u.location === 'table') for (const a of staticAbilities(bundle, u)) take(a, u.owner, u.id)
  for (const seat of Object.keys(state.cards)) for (const { def } of readyCards(state, bundle, seat)) {
    for (const a of def.abilities) if (a.type === 'passive' && !a.trigger) take(a, seat, null)
  }
  // Auras an Active put in force (Guardian Shield, Void Prison): stored on the user for their duration, read like a printed one.
  for (const u of Object.values(state.units)) {
    if (u.location !== 'table') continue
    for (const e of u.effects) {
      if (e.kind === 'mod' && e.data?.op === 'aura') out.push({ source: e.source, rec: e.data as DataEffect, ability: { id: e.source } as AbilityDef, owner: e.bySeat, from: u.id })
    }
  }
  return out
}

function auraReaches(state: GameState, bundle: EditionBundle, b: Broadcast, unitId: UnitId): boolean {
  const u = state.units[unitId]
  if (!u || u.location !== 'table') return false
  const affects = (b.rec.affects ?? {}) as Condition & { side?: 'friendly' | 'enemy' | 'any' }
  const { side, ...cond } = affects
  const friendly = u.owner === b.owner
  if (side === 'friendly' && !friendly) return false
  if (side === 'enemy' && friendly) return false
  if (b.ability.requires && b.from && !conditionHolds(state, bundle, b.ability.requires, b.from)) return false
  if (!conditionHolds(state, bundle, cond, unitId)) return false
  const radius = num(b.rec.radius)
  const centre = b.rec.centre ?? 'self'
  if (centre === 'self') return !!b.from && unitDistance(state, b.from, unitId) <= radius + 1e-6
  const defId = typeof b.rec.token === 'string' ? b.rec.token : centre === 'indicator' ? 'faction-indicator' : ''
  return state.tokens.some((t) => t.defId === defId && t.owner === b.owner && unitToPoint(state, unitId, t.pos) <= radius + 1e-6)
}

function fromStored(e: Effect): LiveEffect | null {
  const base = { source: e.source, expires: e.expires, bySeat: e.bySeat, ...(e.weapons ? { sel: e.weapons } : {}) }
  switch (e.kind) {
    case 'buff': return { ...base, rec: { op: 'buff', char: e.stat, x: e.x } }
    case 'debuff': return { ...base, rec: { op: 'debuff', char: e.stat, x: e.x } }
    case 'flat': return { ...base, rec: { op: 'modify', char: e.stat, delta: e.x } }
    case 'keyword': return e.kw ? { ...base, rec: { op: 'grantKeyword', kw: e.kw } } : null
    case 'deny': return e.kw ? { ...base, rec: { op: 'denyKeyword', kw: e.kw.kw } } : null
    case 'mod': return e.data ? { ...base, rec: e.data as DataEffect } : null
    default: return null
  }
}

/** Every effect record currently acting on the unit that passes its conditions for `ctx` (see file header). */
let liveDepth = 0
export function liveEffects(state: GameState, bundle: EditionBundle, unitId: UnitId, ctx: StatCtx = {}): LiveEffect[] {
  // A condition that reads a characteristic of the same unit would recurse without end; cut it off.
  if (liveDepth > 4) return []
  liveDepth++
  try { return collectLive(state, bundle, unitId, ctx) } finally { liveDepth-- }
}

function collectLive(state: GameState, bundle: EditionBundle, unitId: UnitId, ctx: StatCtx): LiveEffect[] {
  const u = state.units[unitId]
  if (!u) return []
  const out: LiveEffect[] = []
  for (const e of u.effects) {
    const le = fromStored(e)
    if (!le) continue
    if (e.expires === 'whileCondition' && !conditionHolds(state, bundle, (le.rec.when as Condition | undefined) ?? (e.data?.when as Condition | undefined), unitId, ctx)) continue
    if (e.expires !== 'whileCondition' && le.rec.when && !conditionHolds(state, bundle, le.rec.when as Condition, unitId, ctx)) continue
    out.push(le)
  }
  if (u.location !== 'table') return out
  for (const a of staticAbilities(bundle, u)) {
    if (a.requires && !conditionHolds(state, bundle, a.requires, unitId, ctx)) continue
    for (const rec of a.effects) {
      if (rec.op === 'aura' || rec.op === 'status' || rec.op === 'detection') continue
      if (typeof rec.to === 'string' && rec.to !== 'self') continue
      if (rec.when && !conditionHolds(state, bundle, rec.when as Condition, unitId, ctx)) continue
      const sel = isSel(rec.weapons) ? rec.weapons : isSel(rec.to) ? rec.to : undefined
      out.push({ source: a.id, rec, ...(sel ? { sel } : {}), expires: 'permanent', bySeat: u.owner })
    }
  }
  for (const b of broadcasts(state, bundle)) {
    if (b.rec.op === 'aura') {
      if (!auraReaches(state, bundle, b, unitId)) continue
      for (const inner of (b.rec.effects as DataEffect[] | undefined) ?? []) {
        if (inner.op === 'status' || (inner.when && !conditionHolds(state, bundle, inner.when as Condition, unitId, ctx))) continue
        const sel = isSel(inner.weapons) ? inner.weapons : undefined
        out.push({ source: b.source, rec: inner, ...(sel ? { sel } : {}), expires: 'permanent', bySeat: b.owner })
      }
      continue
    }
    const friendly = u.owner === b.owner
    if ((b.rec.to === 'allFriendly') !== friendly) continue
    if (b.ability.requires && b.from && !conditionHolds(state, bundle, b.ability.requires, b.from)) continue
    if (!conditionHolds(state, bundle, b.rec.unitFilter as Condition | undefined, unitId, ctx)) continue
    if (b.rec.when && !conditionHolds(state, bundle, b.rec.when as Condition, unitId, ctx)) continue
    const sel = isSel(b.rec.weapons) ? b.rec.weapons : undefined
    out.push({ source: b.source, rec: b.rec, ...(sel ? { sel } : {}), expires: 'permanent', bySeat: b.owner })
  }
  return out
}

/** The live records of one op on the unit (damageReduce, canEvade, rollMod, coherency, moveThrough, ...). */
export function effectOps(state: GameState, bundle: EditionBundle, unitId: UnitId, op: string, ctx: StatCtx = {}): LiveEffect[] {
  return liveEffects(state, bundle, unitId, ctx).filter((l) => l.rec.op === op)
}

/** Does this selector reach this weapon? No selector = every weapon. `first` has no per-use bookkeeping here. */
function selMatches(sel: WeaponSel | undefined, w: WeaponProfile | undefined): boolean {
  if (!sel || sel.all) return true
  if (!w) return false
  if (sel.ids && !sel.ids.includes(w.id)) return false
  if (sel.phase && sel.phase !== w.phase) return false
  return true
}

// ---------------------------------------------------------------- characteristics
function foldNumber(lives: LiveEffect[], stat: Characteristic, base: number | null, state: GameState, bundle: EditionBundle, ctx: StatCtx, weapon?: WeaponProfile): number | null {
  const mine = lives.filter((l) => l.rec.char === stat && selMatches(l.sel, weapon) && (WEAPON_STATS.includes(stat) ? true : !l.sel || !!l.sel.all))
  const set = mine.filter((l) => l.rec.op === 'setChar')
  const unmod = set.find((l) => l.rec.unmodifiable === true)
  const pick = unmod ?? set[0]
  let b = base
  if (pick) {
    const v = pick.rec.value
    b = v === 'targetSize' ? (ctx.targetUnitId ? statOf(state, bundle, ctx.targetUnitId, 'size') : null) : typeof v === 'number' ? v : b
    if (b !== null && typeof pick.rec.min === 'number') b = Math.max(pick.rec.min, b)
    if (b !== null && typeof pick.rec.max === 'number') b = Math.min(pick.rec.max, b)
    if (unmod) return b
  }
  if (b === null) return null
  // Same-named sources count once (ABL-005); BUFF / DEBUFF keep the highest X per characteristic (KW-040/041).
  const flat = new Map<string, number>()
  for (const l of mine) if (l.rec.op === 'modify') {
    const k = l.source
    const d = num(l.rec.delta)
    if (!flat.has(k) || Math.abs(d) > Math.abs(flat.get(k)!)) flat.set(k, d)
  }
  const buff = Math.max(0, ...mine.filter((l) => l.rec.op === 'buff').map((l) => num(l.rec.x)))
  const debuff = Math.max(0, ...mine.filter((l) => l.rec.op === 'debuff').map((l) => num(l.rec.x)))
  const delta = [...flat.values()].reduce((s, d) => s + d, 0)
  if (TN_STATS.includes(stat)) return b + delta - buff + debuff
  return Math.max(0, b + delta + buff - debuff)
}

function liveCount(state: GameState, unitId: UnitId): number {
  return unitModels(state, unitId).filter((m) => m.life !== 'dead').length
}

function baseStat(state: GameState, bundle: EditionBundle, u: UnitState, def: UnitDef, stat: Characteristic, ctx: StatCtx): { base: number | null; weapon?: WeaponProfile } {
  switch (stat) {
    case 'speed': { const s = def.stats.speed; return { base: s === null ? null : typeof s === 'number' ? s : ctx.run ? s[1] : s[0] } }
    case 'armour': return { base: def.stats.armour }
    case 'evade': return { base: def.stats.evade }
    case 'hp': return { base: def.stats.hp }
    case 'size': return { base: def.stats.size }
    case 'shield': return { base: def.stats.shield }
    case 'supply': return { base: bracketSupply(def, liveCount(state, u.id)) }
    default: {
      const weapon = ctx.weaponId ? weaponDef(def, ctx.weaponId) : undefined
      if (!weapon) return { base: null }
      if (stat === 'hit') return { base: weapon.hit, weapon }
      if (stat === 'dmg') return { base: weapon.dmg, weapon }
      if (stat === 'range') return { base: weapon.range === 'E' ? rule(bundle, 'engagementRange') : weapon.range, weapon }
      const r = weapon.roa
      return { base: typeof r === 'number' ? r : Number(/\+(\d+)$/.exec(r)?.[1] ?? 0), weapon }
    }
  }
}

/** A unit's current characteristic after its Effect list (Speed, Armour, Evade, HP, Size, Shield, Supply...). TN
 *  characteristics come back unclamped (dice.finalTN clamps); null = printed "-" (DICE-024). Weapon characteristics
 *  (roa, hit, range, dmg) need ctx.weaponId; a "BT+N" RoA comes back as its N. BURROWED Size is 0 (VIS-021). */
export function statOf(state: GameState, bundle: EditionBundle, unitId: UnitId, stat: Characteristic, ctx: StatCtx = {}): number | null {
  const u = state.units[unitId]
  if (!u) return null
  const def = requireUnitDef(bundle, u.profileId)
  const { base, weapon } = baseStat(state, bundle, u, def, stat, ctx)
  if (stat === 'size' && hasStatus(state, unitId, 'BURROWED')) return 0
  const lives = liveEffects(state, bundle, unitId, { ...ctx, ...(weapon ? { weaponId: weapon.id } : {}) })
  return foldNumber(lives, stat, base, state, bundle, ctx, weapon)
}

/** Total of the `rollMod` deltas in force for one kind of roll ('hit', 'armour', 'evade', 'impactHit', 'charge'); a
 *  positive delta helps the roller. Same-named sources count once. */
export function rollModOf(state: GameState, bundle: EditionBundle, unitId: UnitId, roll: string, ctx: StatCtx = {}): number {
  const by = new Map<string, number>()
  for (const l of effectOps(state, bundle, unitId, 'rollMod', ctx)) if (l.rec.roll === roll) by.set(l.source, Math.max(by.get(l.source) ?? -Infinity, num(l.rec.delta)))
  return [...by.values()].reduce((s, d) => s + d, 0)
}

// ---------------------------------------------------------------- keywords
const kwKey = (k: KwRef): string => `${k.kw}|${k.tag ?? ''}|${k.char ?? ''}|${k.unit ?? ''}`
/** KW-002: a keyword never stacks; a numeric one keeps the highest X (BUFF / DEBUFF per characteristic, PIERCE per tag). */
export function stackKeywords(refs: readonly KwRef[]): KwRef[] {
  const best = new Map<string, KwRef>()
  for (const r of refs) {
    const k = kwKey(r), cur = best.get(k)
    if (!cur || (r.x ?? 0) > (cur.x ?? 0)) best.set(k, r)
  }
  return [...best.values()]
}

function keywordRefs(lives: LiveEffect[], weapon?: WeaponProfile, printed: readonly KwRef[] = []): KwRef[] {
  const grants = lives.filter((l) => l.rec.op === 'grantKeyword' && l.rec.kw && selMatches(l.sel, weapon) && (weapon ? true : !l.sel))
  const denied = new Set(lives.filter((l) => l.rec.op === 'denyKeyword' && selMatches(l.sel, weapon) && (weapon ? true : !l.sel)).map((l) => String(l.rec.kw)))
  const refs = [...printed, ...grants.map((l) => l.rec.kw as KwRef)].filter((r) => !denied.has(r.kw))
  return stackKeywords(refs)
}

/** Unit-level keywords in force (printed card abilities that act as keywords plus granted ones, highest X kept). */
export function keywordsOf(state: GameState, bundle: EditionBundle, unitId: UnitId, ctx: StatCtx = {}): KwRef[] {
  return keywordRefs(liveEffects(state, bundle, unitId, ctx))
}

/** The keyword `kw` (UPPER_SNAKE) on the unit or the ctx weapon, with its highest X, or null. */
export function keywordOf(state: GameState, bundle: EditionBundle, unitId: UnitId, kw: string, ctx: StatCtx = {}): KwRef | null {
  const refs = [...keywordsOf(state, bundle, unitId, ctx)]
  if (ctx.weaponId) { const w = weaponProfile(state, bundle, unitId, ctx.weaponId, ctx); if (w) refs.push(...w.keywords) }
  const found = stackKeywords(refs.filter((r) => r.kw === kw))
  return found.sort((a, b) => (b.x ?? 0) - (a.x ?? 0))[0] ?? null
}

/** The effective weapon profile for a unit: weaponMod, BUFF/DEBUFF RoA/Hit/Range/Dmg, granted and denied keywords. */
export function weaponProfile(state: GameState, bundle: EditionBundle, unitId: UnitId, weaponId: Id, ctx: StatCtx = {}): WeaponProfile | null {
  const u = state.units[unitId]
  if (!u) return null
  const def = requireUnitDef(bundle, u.profileId)
  const w = weaponDef(def, weaponId)
  if (!w) return null
  const c: StatCtx = { ...ctx, weaponId }
  const lives = liveEffects(state, bundle, unitId, c)
  const out: WeaponProfile = { ...w }
  const fold = (stat: Characteristic, base: number): number => foldNumber(lives, stat, base, state, bundle, c, w) ?? base
  out.hit = fold('hit', w.hit) as WeaponProfile['hit']
  out.dmg = fold('dmg', w.dmg)
  if (w.range !== 'E') out.range = fold('range', w.range)
  out.roa = typeof w.roa === 'number' ? fold('roa', w.roa) : `${w.roa.replace(/\+\d+$/, '')}+${fold('roa', Number(/\+(\d+)$/.exec(w.roa)?.[1] ?? 0))}`
  const surge = new Set(w.surgeTypes)
  for (const l of lives) if (l.rec.op === 'weaponMod' && selMatches(l.sel, w)) {
    for (const t of (l.rec.addSurgeTypes as WeaponProfile['surgeTypes'] | undefined) ?? []) surge.add(t)
    if (typeof l.rec.sDice === 'string') out.sDice = l.rec.sDice
  }
  out.surgeTypes = [...surge]
  out.keywords = keywordRefs(lives, w, w.keywords)
  return out
}

// ---------------------------------------------------------------- mutation
/** Add one Effect (id assigned here). Keyword stacking is resolved at read time, never by refusing to add. */
export function addEffect(state: GameState, unitId: UnitId, effect: Omit<Effect, 'id'>): GameState {
  const u = state.units[unitId]
  if (!u) return state
  const n = u.effects.reduce((m, e) => (e.id.startsWith(`${effect.source}#`) ? Math.max(m, Number(e.id.slice(effect.source.length + 1)) || 0) : m), 0) + 1
  return { ...state, units: { ...state.units, [unitId]: { ...u, effects: [...u.effects, { ...effect, id: `${effect.source}#${n}` }] } } }
}

/** Remove the unit's Effects matching `pred`. */
export function removeEffects(state: GameState, unitId: UnitId, pred: (e: Effect) => boolean): GameState {
  const u = state.units[unitId]
  if (!u || !u.effects.some(pred)) return state
  return { ...state, units: { ...state.units, [unitId]: { ...u, effects: u.effects.filter((e) => !pred(e)) } } }
}

/** A loss of HIDDEN runs the Passives at once (this service cannot suspend). A Reaction to it (Might of the Nerazim) is
 *  queued as a marker on the Unit and offered from the next hook point that can raise a decision (hooks.runHook). */
function fireLoseHidden(state: GameState, bundle: EditionBundle, unitId: UnitId): GameState {
  const u = state.units[unitId]
  let s = runHook(state, bundle, 'onLoseHidden', { unitId, seat: u?.owner, noPrompt: true }).state
  if (abilityRefs(s, bundle).some((r) => r.ability.type === 'reaction' && r.ability.trigger?.event === 'loseHidden')) {
    s = addEffect(s, unitId, { source: LOSE_HIDDEN_QUEUE, kind: 'mod', expires: 'endOfRound', bySeat: u?.owner ?? '', round: s.round, data: { op: 'loseHiddenQueued' } })
  }
  return s
}
export const LOSE_HIDDEN_QUEUE = '__loseHidden'

/** Gain / lose / toggle a status. Losing HIDDEN fires onLoseHidden; gaining BURROWED also grants HIDDEN and losing
 *  BURROWED also removes it (VIS-020). A Unit inside a detector area cannot gain HIDDEN (VIS-012); a `denyStatus` effect
 *  (Underdeveloped Claws) refuses the gain. */
export function setStatus(state: GameState, bundle: EditionBundle, unitId: UnitId, status: StatusId, mode: 'gain' | 'lose' | 'toggle', source: Id, expires: EffectExpiry = 'permanent'): GameState {
  const u = state.units[unitId]
  if (!u) return state
  const m = mode === 'toggle' ? (hasStatus(state, unitId, status) ? 'lose' : 'gain') : mode
  const mk = (st: StatusId, src: Id, ex: EffectExpiry): Omit<Effect, 'id'> => ({ source: src, kind: 'status', status: st, expires: ex, bySeat: u.owner, round: state.round })
  if (m === 'gain') {
    if (effectOps(state, bundle, unitId, 'denyStatus').some((l) => l.rec.status === status)) return state
    let s = state
    if (status === 'HIDDEN') {
      if (inDetection(s, bundle, unitId) || (hasStatus(s, unitId, 'HIDDEN') && s.units[unitId]!.effects.some((e) => e.kind === 'status' && e.status === 'HIDDEN' && e.source === source))) return state
      return addEffect(s, unitId, mk('HIDDEN', source, expires))
    }
    if (!(hasStatus(s, unitId, status) && s.units[unitId]!.effects.some((e) => e.kind === 'status' && e.status === status && e.source === source))) s = addEffect(s, unitId, mk(status, source, expires))
    if (status === 'BURROWED' && !inDetection(s, bundle, unitId) && !s.units[unitId]!.effects.some((e) => e.kind === 'status' && e.status === 'HIDDEN' && e.expires === 'burrowLinked')) {
      s = addEffect(s, unitId, mk('HIDDEN', `${source}:burrow`, 'burrowLinked'))
    }
    return s
  }
  if (status === 'SHIELDED') return state
  let s = removeEffects(state, unitId, (e) => e.kind === 'status' && e.status === status)
  let lostHidden = status === 'HIDDEN' && s !== state
  if (status === 'BURROWED' && s !== state) {
    const had = s.units[unitId]!.effects.some((e) => e.kind === 'status' && e.status === 'HIDDEN')
    s = removeEffects(s, unitId, (e) => e.kind === 'status' && e.status === 'HIDDEN')
    lostHidden = had
  }
  return lostHidden ? fireLoseHidden(s, bundle, unitId) : s
}

/** End every Effect with this clock (on one unit, or all units including Reserves when unitId is omitted). Detector
 *  areas with the clock end too. A HIDDEN that ends this way is a loss of HIDDEN (event). */
export function expireEffects(state: GameState, bundle: EditionBundle, clock: EffectExpiry, unitId?: UnitId): GameState {
  let s = state
  for (const id of unitId ? [unitId] : Object.keys(state.units)) {
    const u = s.units[id]
    if (!u || !u.effects.some((e) => e.expires === clock)) continue
    const hadHidden = hasStatus(s, id, 'HIDDEN')
    s = removeEffects(s, id, (e) => e.expires === clock)
    if (hadHidden && !hasStatus(s, id, 'HIDDEN')) s = fireLoseHidden(s, bundle, id)
  }
  if (!unitId && s.detectors.some((d) => d.expires === clock)) s = { ...s, detectors: s.detectors.filter((d) => d.expires !== clock) }
  return s
}

/** Start of the Round statuses (MOD-006, VIS-020): every table Unit gains STATIONARY; every BURROWED Unit gains HIDDEN
 *  again. turnflow.startRound may call this; hooks.runHook('startOfRound') calls it too (idempotent). */
export function startOfRoundStatuses(state: GameState, bundle: EditionBundle): GameState {
  let s = state
  for (const u of Object.values(state.units)) {
    if (u.location !== 'table') continue
    if (!hasStatus(s, u.id, 'STATIONARY')) s = setStatus(s, bundle, u.id, 'STATIONARY', 'gain', 'rule:stationary')
    if (hasStatus(s, u.id, 'BURROWED') && !hasStatus(s, u.id, 'HIDDEN')) s = setStatus(s, bundle, u.id, 'HIDDEN', 'gain', 'rule:burrow', 'burrowLinked')
  }
  return s
}

/** Does a Ready Creep Card of the token's owner give this token STAY IN PLAY / DISPLACEMENT? The data grants the keyword
 *  `to: tokenArea` without naming the token, so it reaches the Creep Tumor tokens (printed on the token def, a
 *  card grant is the only way they stay between Rounds). */
export function tokenGrants(state: GameState, bundle: EditionBundle, token: { defId: Id; owner: SeatId }, kw: 'STAY_IN_PLAY' | 'DISPLACEMENT'): boolean {
  return readyCards(state, bundle, token.owner).some(({ def }) => def.abilities.some((a) => a.type === 'passive' && !a.trigger && a.effects.some((e) => {
    if (e.op !== 'grantKeyword' || e.to !== 'tokenArea' || (e.kw as KwRef | undefined)?.kw !== kw) return false
    return typeof e.token === 'string' ? e.token === token.defId : token.defId === 'creep-tumor'
  })))
}
