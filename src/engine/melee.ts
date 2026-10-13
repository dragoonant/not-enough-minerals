// Checklist: CC (CC-001..060), CR (Close Ranks), PH3. Owner A.
// melee.ts: the Combat Phase activation (spec 13 s8): optional Close Ranks (movement.reposition kind 'closeRanks'),
// Fighting / Supporting Rank, split across enemy units with the Surge target declared first, then
// attack.resolveBatch (engaged casualty priority). Namespace 'melee' (a melee.go; k melee.closeRanks, melee.split).
import type { EditionBundle, Id, WeaponProfile } from '../data/types'
import { rule } from './edition'
import { pSuccess } from './dice'
import { hasStatus, setStatus, weaponProfile } from './effects'
import { engagedWith, isEngaged, modelsEngaged } from './engage'
import { buildBatch, hasKw, resolveBatch } from './attack'
import { isRejection, reject } from './errors'
import { dist, EPS } from './geometry'
import { modelDistance } from './measure'
import { reposition } from './movement'
import { option, pushEvents, raiseDecision, updateUnit, type ActionDone, type ModuleDef, type StepResult } from './registry'
import { unitModels } from './squads'
import type { Action, AttackBatch, GameState, ModelId, ModelState, UnitId, UnitState, Vec2 } from './types'

const CONTACT = EPS * 10

function enemyModels(state: GameState, unit: UnitState): ModelState[] {
  return Object.values(state.units).filter((u) => u.owner !== unit.owner && u.location === 'table').flatMap((u) => unitModels(state, u.id))
}

/** Models within Engagement Range of an enemy model they could legally be Engaged with (CC-020). */
export function fightingRank(state: GameState, bundle: EditionBundle, unitId: UnitId): ModelId[] {
  const unit = state.units[unitId]
  if (!unit) return []
  const enemies = enemyModels(state, unit)
  return unitModels(state, unitId).filter((m) => enemies.some((e) => modelsEngaged(state, bundle, m.id, e.id))).map((m) => m.id)
}

/** Models base-to-base with a same-unit Fighting Rank model, not themselves in range (CC-020). */
export function supportingRank(state: GameState, bundle: EditionBundle, unitId: UnitId): ModelId[] {
  const fighting = new Set(fightingRank(state, bundle, unitId))
  const mine = unitModels(state, unitId)
  return mine
    .filter((m) => !fighting.has(m.id) && mine.some((f) => fighting.has(f.id) && modelDistance(m, f) <= CONTACT))
    .map((m) => m.id)
}

/** Enemy units one model may attack (CC-040): those it ranks against, or whose ranker it supports. */
export function meleeTargets(state: GameState, bundle: EditionBundle, modelId: ModelId): UnitId[] {
  const model = state.models[modelId]
  const unit = model ? state.units[model.unitId] : undefined
  if (!model || !unit) return []
  const enemies = enemyModels(state, unit)
  const against = (m: ModelState): UnitId[] => enemies.filter((e) => modelsEngaged(state, bundle, m.id, e.id)).map((e) => e.unitId)
  const fighting = new Set(fightingRank(state, bundle, unit.id))
  if (fighting.has(modelId)) return [...new Set(against(model))]
  const touching = unitModels(state, unit.id).filter((f) => fighting.has(f.id) && modelDistance(model, f) <= CONTACT)
  return [...new Set(touching.flatMap(against))]
}

// ---------------------------------------------------------------- Close Ranks (CC-010, CR-001..006)
/** Models in base contact with an enemy at the start of the step do not move (CR-003). */
function pinned(state: GameState, unit: UnitState): Set<ModelId> {
  const enemies = enemyModels(state, unit)
  return new Set(unitModels(state, unit.id).filter((m) => enemies.some((e) => modelDistance(m, e) <= CONTACT)).map((m) => m.id))
}

const isVec = (v: unknown): v is Vec2 => typeof v === 'object' && v !== null && typeof (v as Vec2).x === 'number' && typeof (v as Vec2).z === 'number'

const finishedAction = (unitId: UnitId, fought: boolean): ActionDone =>
  ({ modelId: unitId, unitId, type: 'melee.go', triggers: fought ? [{ kind: 'meleeAttack', sourceId: unitId }] : [] })

function finish(state: GameState, unitId: UnitId, fought: boolean): StepResult {
  // The attack is the whole activation: the Activation Marker comes off (CC-001).
  const s = pushEvents(updateUnit(state, unitId, { activation: null }), [{ type: 'melee.done', unitId, fought }])
  return { state: s, done: finishedAction(unitId, fought) }
}

function closeRanksMenu(state: GameState, b: EditionBundle, unitId: UnitId): StepResult {
  const unit = state.units[unitId]!
  const pins = pinned(state, unit)
  const free = unitModels(state, unitId).filter((m) => !pins.has(m.id))
  const burrowed = hasStatus(state, unitId, 'BURROWED')
  // VIS-026: a BURROWED unit attacks only after Closing Ranks (which ends BURROWED); with no Close Ranks possible it cannot attack.
  if (!free.length) return burrowed ? finish(state, unitId, false) : attackers(state, b, unitId) // every model in base contact: Close Ranks is impossible (F p.3)
  return {
    state: raiseDecision(state, {
      seat: unit.owner, kind: 'melee.closeRanks', canPass: false, context: { unitId, movers: free.map((m) => m.id) },
      options: [
        option('close', 'Close ranks', 'melee.closeRanks', { unitId, mode: 'close' }, unit.owner),
        option('skip', burrowed ? 'Stay burrowed and make no attack' : 'Hold the line', 'melee.closeRanks', { unitId, mode: 'skip' }, unit.owner),
      ],
    }),
  }
}

function doCloseRanks(state: GameState, b: EditionBundle, action: Action): StepResult {
  const unitId = action.unitId as UnitId
  const unit = state.units[unitId]!
  const burrowed = hasStatus(state, unitId, 'BURROWED')
  if (action.mode === 'skip') return burrowed ? finish(state, unitId, false) : attackers(state, b, unitId)
  const afterMove = (st: GameState): GameState => (burrowed ? setStatus(st, b, unitId, 'BURROWED', 'lose', 'rule:closeRanks') : st)
  const engaged = engagedWith(state, b, unitId)
  const enemies = engaged.flatMap((e) => unitModels(state, e))
  const pins = pinned(state, unit)
  const explicit = typeof action.leaderId === 'string' && Array.isArray(action.path) && action.path.every(isVec)
  let leaderId: string, path: Vec2[]
  const maxDist = rule(b, 'closeRanksMax')
  if (explicit) {
    leaderId = action.leaderId as string
    path = action.path as Vec2[]
    if (state.models[leaderId]?.unitId !== unitId || pins.has(leaderId)) return reject('E_BAD_TARGET', 'The Leading Model must be a unit model that is not already in base contact.')
  } else {
    // Auto: the free model nearest to an engaged enemy walks straight at it, stopping in base contact (CR-004).
    const free = unitModels(state, unitId).filter((m) => !pins.has(m.id))
    let best: { m: ModelState; e: ModelState; d: number } | null = null
    for (const m of free) for (const e of enemies) {
      const d = modelDistance(m, e)
      if (!best || d < best.d) best = { m, e, d }
    }
    if (!best) return burrowed ? finish(state, unitId, false) : attackers(state, b, unitId)
    const centres = dist(best.m.pos, best.e.pos)
    const go = Math.min(best.d, maxDist)
    const k = centres === 0 ? 0 : go / centres
    leaderId = best.m.id
    path = [{ x: best.m.pos.x + (best.e.pos.x - best.m.pos.x) * k, z: best.m.pos.z + (best.e.pos.z - best.m.pos.z) * k }]
  }
  const r = reposition(state, b, unitId, { kind: 'closeRanks', leaderId, path, maxDist, mustCloseOn: engaged, allowEngage: engaged })
  if (isRejection(r)) return explicit ? r : burrowed ? finish(state, unitId, false) : attackers(state, b, unitId)
  return attackers(afterMove(pushEvents(r.state, r.events)), b, unitId)
}

// ---------------------------------------------------------------- attackers and the split (CC-020..040)
function attackers(state: GameState, b: EditionBundle, unitId: UnitId): StepResult {
  const unit = state.units[unitId]!
  const ranks = [...fightingRank(state, b, unitId), ...supportingRank(state, b, unitId)]
  const options = new Map<ModelId, UnitId[]>(ranks.map((id) => [id, meleeTargets(state, b, id)] as [ModelId, UnitId[]]))
  const all = [...new Set([...options.values()].flat())]
  if (!all.length) return finish(state, unitId, false)
  const weaponChoices = weaponMenu(state, b, unitId, options)
  if (all.length === 1 && !Object.keys(weaponChoices).length) return launch(state, b, unitId, all[0]!, {})
  return {
    state: raiseDecision(state, {
      seat: unit.owner, kind: 'melee.split', canPass: false,
      context: { unitId, targets: all, modelTargets: Object.fromEntries(options), weaponChoices },
      options: all.map((t) => option(`surge:${t}`, `Give the Surge Die to ${t}`, 'melee.split', { unitId, surgeTarget: t }, unit.owner)),
    }),
  }
}

/** A model's combat weapons against a target: the best normal one plus every SIDEARM (CC-030). */
function chosenWeapons(state: GameState, b: EditionBundle, unitId: UnitId, model: ModelState, target: UnitId, pick?: Id): WeaponProfile[] {
  const profiles = [...new Set(model.weapons)]
    .map((w) => weaponProfile(state, b, unitId, w, { attack: 'closeCombat', targetUnitId: target }))
    .filter((p): p is WeaponProfile => !!p && p.phase === 'combat')
  const side = profiles.filter((p) => hasKw(p.keywords, 'SIDEARM'))
  const normal = profiles.filter((p) => !hasKw(p.keywords, 'SIDEARM'))
  const score = (p: WeaponProfile) => (typeof p.roa === 'number' ? p.roa : 0) * p.dmg * pSuccess(p.hit)
  const chosen = normal.find((p) => p.id === pick) // CC-030: the player's choice, else the best-scoring one
  const best = chosen ?? normal.sort((a, c) => score(c) - score(a))[0]
  return best ? [best, ...side] : side
}

/** CC-030: models that own more than one non-SIDEARM close combat weapon, with the weapon ids they may pick between. */
function weaponMenu(state: GameState, b: EditionBundle, unitId: UnitId, targets: Map<ModelId, UnitId[]>): Record<ModelId, Id[]> {
  const out: Record<ModelId, Id[]> = {}
  for (const [mid, ts] of targets) {
    const m = state.models[mid]
    if (!m || !ts.length) continue
    const ids = new Set<Id>()
    for (const w of new Set(m.weapons)) {
      const p = weaponProfile(state, b, unitId, w, { attack: 'closeCombat', targetUnitId: ts[0]! })
      if (p && p.phase === 'combat' && !hasKw(p.keywords, 'SIDEARM')) ids.add(p.id)
    }
    if (ids.size > 1) out[mid] = [...ids]
  }
  return out
}

function launch(state: GameState, b: EditionBundle, unitId: UnitId, surgeTarget: UnitId, assign: Record<ModelId, UnitId>, weapons: Record<ModelId, Id> = {}): StepResult {
  const unit = state.units[unitId]!
  const ranks = [...fightingRank(state, b, unitId), ...supportingRank(state, b, unitId)]
  type Pool = { profile: WeaponProfile; target: UnitId; models: ModelId[] }
  const pools = new Map<string, Pool>()
  for (const id of ranks) {
    const m = state.models[id]!
    const can = meleeTargets(state, b, id)
    if (!can.length) continue
    const target = assign[id] && can.includes(assign[id]!) ? assign[id]! : can.includes(surgeTarget) ? surgeTarget : can[0]!
    for (const p of chosenWeapons(state, b, unitId, m, target, weapons[id])) {
      const key = `${p.id}|${target}`
      const cur = pools.get(key) ?? { profile: p, target, models: [] }
      cur.models.push(id)
      pools.set(key, cur)
    }
  }
  const byWeapon = new Map<Id, Pool[]>()
  for (const p of pools.values()) byWeapon.set(p.profile.id, [...(byWeapon.get(p.profile.id) ?? []), p])
  const batches: AttackBatch[] = []
  for (const list of byWeapon.values()) {
    list.sort((a, c) => Number(c.target === surgeTarget) - Number(a.target === surgeTarget))
    const split = list.length > 1
    for (const p of list) {
      const hasSurge = p.target === surgeTarget
      // One split Batch: its PRECISION / CRITICAL HIT go to the Surge target's pool (F p.5, ruling in the owner log).
      const keywords = split && !hasSurge ? p.profile.keywords.filter((k) => k.kw !== 'PRECISION' && k.kw !== 'CRITICAL_HIT') : p.profile.keywords
      batches.push(buildBatch(state, b, {
        seat: unit.owner, attackerUnitId: unitId, profile: p.profile, kind: 'closeCombat', targetUnitId: p.target,
        contributors: p.models.map((modelId) => ({ modelId })), eligible: null, keywords, surge: hasSurge || !split,
      }))
    }
  }
  if (!batches.length) return finish(state, unitId, false)
  return resolveBatch(state, b, batches[0]!, 'hit', 'melee', batches.slice(1))
}

export const melee: ModuleDef = {
  id: 'melee',
  kinds: ['melee'],
  options(state, bundle, unitId) {
    if (state.roundPhase !== 'combat') return []
    const unit = state.units[unitId]
    if (!unit || unit.location !== 'table' || !isEngaged(state, bundle, unitId)) return []
    return [option('melee', 'Fight', 'melee.go', { unitId }, unit.owner)]
  },
  resolve(state, bundle, action) {
    const unitId = action.unitId
    if (typeof unitId !== 'string' || !state.units[unitId]) return reject('E_BAD_TARGET', 'No such unit.')
    switch (action.type) {
      case 'melee.go':
        if (!isEngaged(state, bundle, unitId)) return finish(state, unitId, false) // freed before it acted (CC-060)
        return closeRanksMenu(state, bundle, unitId)
      case 'melee.closeRanks':
        return doCloseRanks(state, bundle, action)
      case 'melee.split': {
        const target = action.surgeTarget
        if (typeof target !== 'string') return reject('E_BAD_PARAM', 'surgeTarget is needed.')
        const assign: Record<ModelId, UnitId> = {}
        if (action.assign !== undefined) {
          if (typeof action.assign !== 'object' || action.assign === null) return reject('E_BAD_PARAM', 'assign must map model ids to unit ids.')
          for (const [mid, tid] of Object.entries(action.assign as Record<string, unknown>)) {
            if (typeof tid !== 'string' || !meleeTargets(state, bundle, mid).includes(tid)) return reject('E_BAD_TARGET', `${mid} cannot attack ${String(tid)}.`)
            assign[mid] = tid
          }
        }
        const weapons: Record<ModelId, Id> = {}
        if (action.weapons !== undefined) {
          if (typeof action.weapons !== 'object' || action.weapons === null) return reject('E_BAD_PARAM', 'weapons must map model ids to weapon ids.')
          const menu = weaponMenu(state, bundle, unitId, new Map([...fightingRank(state, bundle, unitId), ...supportingRank(state, bundle, unitId)].map((id) => [id, meleeTargets(state, bundle, id)] as [ModelId, UnitId[]])))
          for (const [mid, wid] of Object.entries(action.weapons as Record<string, unknown>)) {
            if (typeof wid !== 'string' || !menu[mid]?.includes(wid)) return reject('E_BAD_TARGET', `${mid} cannot fight with ${String(wid)}.`)
            weapons[mid] = wid
          }
        }
        return launch(state, bundle, unitId, target, assign, weapons)
      }
      default:
        return reject('E_UNKNOWN_KIND', `The melee module does not handle ${action.type}.`)
    }
  },
  /** Every Batch of the split is resolved: the activation is over. */
  resume(state) {
    const unitId = state.activeUnit
    if (!unitId || !state.units[unitId]) return reject('E_BAD_TARGET', 'No active unit to finish the Close Combat Attack.')
    return finish(state, unitId, true)
  },
}
