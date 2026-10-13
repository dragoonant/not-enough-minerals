// Checklist: DMG (DMG-001..021), SHD (Shield / SHIELDED), CC-050, DMG-013 (HEAL, NON-LETHAL), DMG-014. Owner A.
// damage.ts: allocateDamage() (mode visible or engaged; leftover onto unit.damage, no cap) and removeModels(), the ONLY
// model remover (spec 00 s4): it fires onModelsRemoved (Supply bracket ledger, Shielded, Destroyed, RESPAWN).
// The defender's casualty picks are atk.casualty decisions, resolved via attack.ts's ModuleDef.
import type { EditionBundle } from '../data/types'
import { tokenDef, unitDef } from './edition'
import { statOf } from './effects'
import { modelsEngaged } from './engage'
import { EPS } from './geometry'
import { runHook } from './hooks'
import { modelDistance } from './measure'
import { option, pushEvents, raiseDecision, reject, updateUnit, type StepResult } from './registry'
import { unitModels } from './squads'
import { recordSupplyLoss, supplyFor } from './supply'
import type { Action, GameState, ModelId, ModelState, Rejection, UnitId } from './types'

export type AllocMode = 'visible' | 'engaged'
export type RemovalCause = 'attack' | 'coherency' | 'reserveSweep' | 'ability' | 'morph' | 'other'

/** What an open atk.casualty decision remembers (it lives in PendingDecision.context, so nothing extra is stored). */
export interface AllocCtx {
  unitId: UnitId
  /** Total Damage still to place. */
  remaining: number
  mode: AllocMode
  /** Visible-mode snapshot (DMG-002); null in engaged mode. */
  eligible: ModelId[] | null
  /** CONCENTRATED FIRE (X): at most X removals (DMG-006); null = no cap. */
  cap: number | null
  removed: number
  cause: RemovalCause
}

export interface AllocResult { state: GameState; /** True when an atk.casualty decision was raised. */ awaiting: boolean }

const live = (state: GameState, unitId: UnitId): ModelState[] => unitModels(state, unitId)

// ---------------------------------------------------------------- the one remover
/** The one remover: marks models dead, recomputes Supply, updates Shielded / Destroyed, fires onModelsRemoved. */
export function removeModels(state: GameState, bundle: EditionBundle, unitId: UnitId, modelIds: ModelId[], cause: RemovalCause): GameState {
  const unit = state.units[unitId]
  if (!unit) return state
  const ids = [...new Set(modelIds)].filter((id) => state.models[id]?.life === 'active')
  if (!ids.length) return state
  const before = supplyFor(state, bundle, unitId, 'vp') // same purpose on both sides of the drop (SUP-007)
  const models = { ...state.models }
  for (const id of ids) models[id] = { ...models[id]!, life: 'dead' }
  let s: GameState = { ...state, models }
  const alive = unit.modelIds.filter((id) => models[id]?.life === 'active').length
  const destroyed = alive === 0
  const patch: Partial<typeof unit> = {}
  // DMG-012: SHIELDED is lost when the first model (index 0 as mustered) goes.
  if (unit.shielded && ids.includes(unit.modelIds[0]!)) patch.shielded = false
  if (destroyed) {
    // GEN-007 / DMG-014: effects on it end; its tokens go unless STAY IN PLAY; effects it placed on others stay.
    patch.location = 'destroyed'
    patch.effects = []
    patch.shielded = false
    patch.damage = 0
    const def = unitDef(bundle, unit.profileId)
    s = { ...s, tokens: s.tokens.filter((t) => t.sourceId !== unitId || tokenDef(bundle, def ?? null, t.defId)?.stayInPlay === true) }
  }
  s = updateUnit(s, unitId, patch)
  s = recordSupplyLoss(s, bundle, unitId, before) // every bracket drop counts, a Morph removal too (VP-002, F p.5)
  s = pushEvents(s, [
    { type: 'atk.removed', unitId, modelIds: ids, cause },
    ...(destroyed ? [{ type: 'unitDestroyed', unitId }] : []),
  ])
  return runHook(s, bundle, 'onModelsRemoved', { seat: unit.owner, unitId, modelIds: ids, cause }).state
}

// ---------------------------------------------------------------- Shield (DMG-012)
/** Lose SHIELDED when `total` exceeds the Shield value (Shield 3 is lost at 4, kept at 3). */
function breakShield(state: GameState, bundle: EditionBundle, unitId: UnitId, total: number): GameState {
  const u = state.units[unitId]
  if (!u || !u.shielded) return state
  const shield = statOf(state, bundle, unitId, 'shield')
  if (shield === null || total <= shield) return state
  return updateUnit(state, unitId, { shielded: false })
}

/** NON-LETHAL DAMAGE (X): add to the marker, remove nothing (DMG-013); can still break SHIELDED. */
export function addNonLethal(state: GameState, bundle: EditionBundle, unitId: UnitId, x: number): GameState {
  const u = state.units[unitId]
  if (!u || x <= 0) return state
  const damage = u.damage + x
  return breakShield(updateUnit(state, unitId, { damage }), bundle, unitId, damage)
}

/** HEAL (X): reduce the marker by X, floor 0; never returns models or SHIELDED. */
export function heal(state: GameState, _bundle: EditionBundle, unitId: UnitId, x: number): GameState {
  const u = state.units[unitId]
  if (!u || x <= 0) return state
  return updateUnit(state, unitId, { damage: Math.max(0, u.damage - x) })
}

// ---------------------------------------------------------------- Engaged priority (DMG-020..022)
type Tier = 1 | 2 | 3

function enemyModels(state: GameState, unitId: UnitId): ModelState[] {
  const owner = state.units[unitId]!.owner
  return Object.values(state.units).filter((u) => u.owner !== owner && u.location === 'table').flatMap((u) => live(state, u.id))
}

function tierOf(state: GameState, bundle: EditionBundle, m: ModelState, enemies: readonly ModelState[]): Tier {
  let t: Tier = 1
  for (const e of enemies) {
    if (!modelsEngaged(state, bundle, m.id, e.id)) continue
    if (modelDistance(m, e) <= EPS * 10) return 3
    t = 2
  }
  return t
}

/** Candidate casualties among `pool` under the Engaged rules: models whose removal keeps every current Engagement come
 *  first; of those (or of all, when none qualifies) only the lowest non-empty tier (DMG-020..022). */
function engagedPool(state: GameState, bundle: EditionBundle, unitId: UnitId, pool: ModelState[]): ModelState[] {
  const mine = live(state, unitId)
  const enemies = enemyModels(state, unitId)
  const pairs = new Map<string, Set<string>>() // enemy unit -> "mine|theirs" pairs
  for (const m of mine) for (const e of enemies) {
    if (!modelsEngaged(state, bundle, m.id, e.id)) continue
    let set = pairs.get(e.unitId)
    if (!set) { set = new Set(); pairs.set(e.unitId, set) }
    set.add(`${m.id}|${e.id}`)
  }
  const breaks = (c: ModelState): boolean => {
    for (const set of pairs.values()) {
      let keeps = false
      for (const p of set) if (!p.startsWith(`${c.id}|`)) { keeps = true; break }
      if (!keeps) return true
    }
    return false
  }
  const keepers = pool.filter((c) => !breaks(c))
  const base = keepers.length ? keepers : pool
  const tiers = new Map(base.map((m) => [m.id, tierOf(state, bundle, m, enemies)]))
  const lowest = Math.min(...tiers.values())
  return base.filter((m) => tiers.get(m.id) === lowest)
}

// ---------------------------------------------------------------- allocation loop
/** Two models are the same casualty when their HP and loadout match: nothing else changes the rules state (a Leading
 *  Model falls back by itself, and positions are not a rules choice here). Equal models are removed without asking. */
function signature(m: ModelState): string {
  return `${m.hp}|${m.weapons.join(',')}`
}

/** Run the casualty loop until the Total Damage is placed or a choice is needed. */
function runAlloc(state: GameState, bundle: EditionBundle, ctx: AllocCtx): AllocResult {
  let s = state
  let { remaining, removed } = ctx
  const unit = s.units[ctx.unitId]
  if (!unit) return { state: s, awaiting: false }
  const eligibleSet = ctx.eligible ? new Set(ctx.eligible) : null
  let capHit = false
  for (;;) {
    if (ctx.cap !== null && removed >= ctx.cap) { capHit = true; break }
    const alive = live(s, ctx.unitId)
    const eligible = eligibleSet ? alive.filter((m) => eligibleSet.has(m.id)) : alive
    const fits = eligible.filter((m) => m.hp <= remaining)
    if (!fits.length) break
    const pool = ctx.mode === 'engaged' ? engagedPool(s, bundle, ctx.unitId, fits) : fits
    const classes = new Set(pool.map(signature))
    if (classes.size > 1) {
      const next: AllocCtx = { ...ctx, remaining, removed }
      return {
        awaiting: true,
        state: raiseDecision(s, {
          seat: unit.owner, kind: 'atk.casualty', canPass: false,
          context: { ...next, candidates: pool.map((m) => m.id) },
          options: pool.map((m) => option(`remove:${m.id}`, `Remove model ${m.id}`, 'atk.casualty', { modelId: m.id }, unit.owner)),
        }),
      }
    }
    // One class of equal models: no real choice, take the last one in muster order (keeps the first/leading ones).
    const order = unit.modelIds
    const pick = [...pool].sort((a, b) => order.indexOf(b.id) - order.indexOf(a.id))[0]!
    s = removeModels(s, bundle, ctx.unitId, [pick.id], ctx.cause)
    remaining -= pick.hp
    removed++
  }
  return { state: finishAlloc(s, ctx, remaining, capHit), awaiting: false }
}

/** Write the leftover to the Damage Marker, or discard it (DMG-004 / DMG-006). */
function finishAlloc(state: GameState, ctx: AllocCtx, remaining: number, capHit: boolean): GameState {
  const u = state.units[ctx.unitId]
  if (!u || u.location === 'destroyed') return state
  let marker = remaining
  if (capHit) marker = 0
  else if (ctx.mode === 'visible' && ctx.eligible) {
    // Every eligible model gone: the rest never passes to non-Visible models (DMG-004).
    const set = new Set(ctx.eligible)
    if (!live(state, ctx.unitId).some((m) => set.has(m.id))) marker = 0
  }
  return updateUnit(state, ctx.unitId, { damage: Math.max(0, marker) })
}

/** Allocate Total Damage to a unit with the choices resolved internally; `awaiting` says a casualty decision is open.
 *  attack.ts calls this (it knows how to continue afterwards). */
export function allocate(state: GameState, bundle: EditionBundle, unitId: UnitId, total: number, mode: AllocMode,
  eligible?: ModelId[] | null, cap?: number | null, cause: RemovalCause = 'attack'): AllocResult {
  const u = state.units[unitId]
  if (!u || u.location !== 'table') return { state, awaiting: false }
  const s = breakShield(state, bundle, unitId, total)
  return runAlloc(s, bundle, { unitId, remaining: Math.max(0, total), mode, eligible: mode === 'visible' ? (eligible ?? live(s, unitId).map((m) => m.id)) : null, cap: cap ?? null, removed: 0, cause })
}

/** Allocate Total Damage to a unit (spec 13 s7): visible mode removes only `eligible` models (snapshot) and discards
 *  the rest when they are all gone (DMG-004); engaged mode uses the priority tiers (DMG-020/021). `cap` = CONCENTRATED
 *  FIRE. Raises atk.casualty when the defender has a real choice. */
export function allocateDamage(state: GameState, bundle: EditionBundle, unitId: UnitId, total: number, mode: AllocMode,
  eligible?: ModelId[], cap?: number): StepResult {
  if (!state.units[unitId]) return reject('E_BAD_TARGET', `No unit ${unitId}.`)
  return { state: allocate(state, bundle, unitId, total, mode, eligible, cap).state }
}

/** The defender's answer to an open atk.casualty: remove the chosen model and carry on. */
export function continueCasualty(state: GameState, bundle: EditionBundle, action: Action): AllocResult | Rejection {
  const p = state.pending
  const ctx = p.context as unknown as AllocCtx & { candidates?: ModelId[] }
  const id = action.modelId
  if (typeof id !== 'string' || !ctx.candidates?.includes(id)) return reject('E_BAD_TARGET', 'That model is not one of the legal casualties.')
  const next: AllocCtx = { unitId: ctx.unitId, remaining: ctx.remaining, mode: ctx.mode, eligible: ctx.eligible, cap: ctx.cap, removed: ctx.removed, cause: ctx.cause }
  const m = state.models[id]!
  const s = removeModels(state, bundle, next.unitId, [id], next.cause)
  return runAlloc(s, bundle, { ...next, remaining: next.remaining - m.hp, removed: next.removed + 1 })
}
