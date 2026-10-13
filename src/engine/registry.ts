// The action protocol (FROZEN at M2 foundations; docs/spec/00-architecture.md s3).
// Every rules module exports one ModuleDef. apply.ts validates an Action against the open PendingDecision, then hands it
// to the module that owns the pending kind's namespace (the text before the first '.', e.g. 'shoot' in 'shoot.batch').
// The turn-flow module is the controller: it owns the activation menu (turn.activate), forwards a chosen menu action to
// the module that owns the action type's namespace, and runs afterAction() when a module reports its Action done.
// A sub-pipeline (the attack, a reaction window, a payment) that another module started hands control back through
// that module's resume(): AttackState.returnTo names the namespace.
import type { EditionBundle } from '../data/types'
import { abilities } from './abilities'
import { attack } from './attack'
import { charge } from './charge'
import { isRejection, reject, todo, TodoError } from './errors'
import { melee } from './melee'
import { missions } from './missions'
import { movement } from './movement'
import { raise } from './pending'
import { reserves } from './reserves'
import type { DiceRolled } from './rng'
import { scoring } from './scoring'
import { setupModule } from './setup'
import { shooting } from './shooting'
import { turnflow } from './turnflow'
import type { Action, DecisionOption, GameEvent, GameState, Id, ModelId, PendingDecision, Rejection } from './types'

export { isRejection, reject, todo, TodoError }

export type ModuleId = string

/** What happened in a finished Action, for triggered rules and bookkeeping. */
export interface Trigger {
  kind: string
  sourceId: Id
  targetId?: Id
}

/** A module reports this when the current Action (or Reaction) is completely resolved. */
export interface ActionDone {
  /** M0: the acting model. M2: the acting Unit id (same as unitId; kept for the placeholder flow). */
  modelId: Id
  /** M2: the acting Unit. */
  unitId?: Id
  /** The action type that finished, e.g. 'shoot.go'. */
  type: string
  triggers: Trigger[]
  /** M2: the activation ends now (no after-action window), e.g. Pylon deploys or endsActivation abilities. */
  endsActivation?: boolean
}

/**
 * Result of one resolve step: the new state, plus `done` when the Action finished. Without `done` the module must
 * have raised its own next decision (raiseDecision). With `done`, apply() calls the controller's afterAction().
 */
export type StepResult = { state: GameState; done?: ActionDone } | Rejection

export interface ModuleDef {
  id: ModuleId
  /** Namespaces this module owns, for both pending kinds and action types: 'shoot' owns 'shoot.*'. Disjoint across modules. */
  kinds: string[]
  /**
   * Main-menu entries this module offers the active Unit right now (Move, Shoot, Charge, a mission action...). Empty
   * when none is legal. M2: `unitId` is the activating Unit (M0 passed a model id). Action types are
   * '<namespace>.<verb>'; decisionId/seat are stamped by raiseDecision(). Never throws.
   */
  options(state: GameState, bundle: EditionBundle, unitId: Id): DecisionOption[]
  /** Resolve one Action against this module's open decision (or a forwarded menu action). Bad input -> Rejection. */
  resolve(state: GameState, bundle: EditionBundle, action: Action): StepResult
  /** M2: continue after a sub-pipeline this module started has finished (attack.ts calls it when the open attack and
   *  its queue are resolved; `state.attack` is null by then). Optional for modules that never start one. */
  resume?(state: GameState, bundle: EditionBundle): StepResult
}

/** Turnflow's extra hook: after an Action, run reactions/triggers, then raise the next menu or end the activation. */
export interface Controller extends ModuleDef {
  afterAction(state: GameState, bundle: EditionBundle, done: ActionDone): GameState
}

/** Namespace -> owning module id (spec 00 s3.2). modules() checks the table against it at load. */
export const NAMESPACES: Readonly<Record<string, ModuleId>> = {
  setup: 'setup', turn: 'turnflow', move: 'movement', deploy: 'reserves', shoot: 'shooting', charge: 'charge',
  melee: 'melee', atk: 'attack', ability: 'abilities', mission: 'missions', score: 'scoring',
}

// ---------- module table (built lazily: modules import this file, so nothing here runs at import time) ----------
let table: readonly ModuleDef[] | null = null
export function modules(): readonly ModuleDef[] {
  if (!table) {
    const list: ModuleDef[] = [turnflow, setupModule, movement, reserves, shooting, charge, melee, attack, abilities, missions, scoring]
    const seen = new Map<string, string>()
    for (const m of list) for (const k of m.kinds) {
      const prev = seen.get(k)
      if (prev) throw new Error(`registry: namespace "${k}" claimed by both ${prev} and ${m.id}`)
      if (NAMESPACES[k] !== m.id) throw new Error(`registry: namespace "${k}" belongs to ${NAMESPACES[k] ?? 'nobody'} (spec 00 s3.2), not ${m.id}`)
      seen.set(k, m.id)
    }
    table = list
  }
  return table
}
export const controller = (): Controller => turnflow

/** Namespace of a kind or action type: the text before the first '.'. */
export const namespaceOf = (kindOrType: string): string => kindOrType.split('.')[0]!

/** Module owning a pending kind or an action type, or undefined. */
export function moduleFor(kindOrType: string): ModuleDef | undefined {
  const ns = namespaceOf(kindOrType)
  return modules().find((m) => m.kinds.includes(ns))
}

/** Every module's menu entries for the active Unit, in table order (only turnflow calls this). */
export function allOptions(state: GameState, bundle: EditionBundle, unitId: Id): DecisionOption[] {
  return modules().flatMap((m) => m.options(state, bundle, unitId))
}

/** Hand control back to the module owning `namespace` after a sub-pipeline (see ModuleDef.resume). */
export function resumeIn(state: GameState, bundle: EditionBundle, namespace: string): StepResult {
  const m = moduleFor(namespace)
  if (!m?.resume) return todo(`resume() for namespace "${namespace}"`)
  return m.resume(state, bundle)
}

// ---------- helpers every module uses ----------
/**
 * Raise the one open decision and stamp its id and seat into every option's action (raise() alone does not).
 * Options are templates: a chosen action must carry every field of one option unchanged; extra fields are parameters
 * the owning module validates (e.g. a move destination). Must be given at least one option (legalActions never empty).
 */
export function raiseDecision(state: GameState, spec: Omit<PendingDecision, 'id'>): GameState {
  if (spec.options.length === 0) throw new Error(`raiseDecision(${spec.kind}): no options; legalActions must never be empty`)
  const { state: s, pending } = raise(state, spec)
  const seatOf = (a: Action) => (spec.seat === 'all' ? a.seat : spec.seat)
  const options = pending.options.map((o) => ({ ...o, action: { ...o.action, decisionId: pending.id, seat: seatOf(o.action) } }))
  return { ...s, pending: { ...pending, options } }
}

/** Build a menu option with a placeholder decisionId/seat (raiseDecision stamps them). */
export function option(id: string, label: string, type: string, fields: Record<string, unknown> = {}, seat = ''): DecisionOption {
  return { id, label, action: { ...fields, type, decisionId: '', seat } }
}

/** Append events (dice, damage, removals) to the game's event log. */
export function pushEvents(state: GameState, events: readonly (GameEvent | DiceRolled)[]): GameState {
  return events.length ? { ...state, events: [...state.events, ...events] } : state
}

/** Replace one model immutably. */
export function updateModel(state: GameState, id: ModelId, patch: Partial<GameState['models'][string]>): GameState {
  const m = state.models[id]
  if (!m) return state
  return { ...state, models: { ...state.models, [id]: { ...m, ...patch } } }
}

/** M2: replace one unit immutably. */
export function updateUnit(state: GameState, id: Id, patch: Partial<GameState['units'][string]>): GameState {
  const u = state.units[id]
  if (!u) return state
  return { ...state, units: { ...state.units, [id]: { ...u, ...patch } } }
}
