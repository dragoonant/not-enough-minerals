// Checklist: ARMY (ARMY-001..027), COST (COST-001..003), WPN-003/004 (loadouts), SUP-030 (all start in Reserves). Owner B.
// army.ts: validateArmy(list, scale) (spec 15 s9-11), costs from the newest Cost Table (data/query.mergedCostTable is
// the only cost reader), and musterArmy(), which turns a list into UnitState/ModelState/CardState in Reserves with the
// per-model loadout (FOR [weapon] replaces, SPECIALIST on one model). Service: pure, no decisions.
import { mergedCostTable } from '../data/query'
import type { ArmyListDef, CardDef, CostUnitRow, EditionBundle, Id, Scale, Slot, UnitDef } from '../data/types'
import { cardDef, requireUnitDef, rule, unitDef } from './edition'
import type { CardState, ModelState, SeatId, UnitState } from './types'

export interface ArmyError { path: string; code: string; message: string }

const SLOTS: readonly Slot[] = ['core', 'elite', 'support', 'air', 'hero']

/** Granted and used Army Slots of a list (ARMY-014). Used = starting Supply of each non-summoned Unit, by its slot. */
export interface SlotLedger { granted: Record<Slot, number>; used: Record<Slot, number> }
const zeroSlots = (): Record<Slot, number> => ({ core: 0, elite: 0, support: 0, air: 0, hero: 0 })

/** The Composition Option a unit entry picked (exactly one per Unit, ARMY-015); undefined for an illegal model count. */
function compositionIndex(row: CostUnitRow | undefined, models: number): number {
  return row ? row.compositions.findIndex((c) => c.models === models) : -1
}

/** Slot ledger of a list. Unknown ids are skipped (validateArmy reports them). */
export function slotLedger(bundle: EditionBundle, list: ArmyListDef): SlotLedger {
  const ct = mergedCostTable(bundle)
  const granted = zeroSlots(), used = zeroSlots()
  const faction = cardDef(bundle, list.faction)
  if (faction) for (const s of SLOTS) granted[s] += faction.slots[s] ?? 0
  for (const id of list.cards) {
    const c = cardDef(bundle, id)
    if (c) for (const s of SLOTS) granted[s] += c.slots[s] ?? 0
  }
  for (const e of list.units) {
    const def = unitDef(bundle, e.unit)
    if (!def || def.summoned || !def.slot) continue
    const row = ct?.units[e.unit]
    const i = compositionIndex(row, e.models)
    if (i >= 0) used[def.slot] += row!.compositions[i]!.supply
  }
  return { granted, used }
}

/** Minerals, gas and starting Supply of a list (Cost Table prices; unknown ids and illegal sizes cost 0). */
export function armyCost(bundle: EditionBundle, list: ArmyListDef): { minerals: number; gas: number; supply: number } {
  const ct = mergedCostTable(bundle)
  let minerals = 0, gas = 0, supply = 0
  for (const e of list.units) {
    const row = ct?.units[e.unit]
    const i = compositionIndex(row, e.models)
    if (!row || i < 0) continue
    const comp = row.compositions[i]!
    minerals += comp.minerals
    supply += comp.supply
    for (const u of e.upgrades) minerals += row.upgrades[u.id]?.[i] ?? 0
  }
  for (const id of [...list.cards, ...(list.creepCard ? [list.creepCard] : [])]) gas += ct?.cards[id] ?? 0
  return { minerals, gas, supply }
}

/** Every army-building check of spec 15 s9 (slots, faction tags, uniques, costs vs the scale's limits). */
export function validateArmy(bundle: EditionBundle, list: ArmyListDef, scale: Scale = list.scale): ArmyError[] {
  const errs: ArmyError[] = []
  const err = (path: string, code: string, message: string) => errs.push({ path, code, message })
  const ct = mergedCostTable(bundle)
  if (!ct) err('costs', 'cost.table', 'The edition has no Cost Table.')

  // 1. Faction Card (ARMY-010).
  const faction = cardDef(bundle, list.faction)
  if (!faction) err('faction', 'faction.unknown', `Faction Card "${list.faction}" does not exist.`)
  else if (faction.kind !== 'faction') err('faction', 'faction.kind', `"${list.faction}" is not a Faction Card.`)
  const tags = new Set(faction?.factionTags ?? [])
  const tagsOk = (have: readonly string[]) => have.every((t) => tags.has(t))

  // 2/3. Tactical Cards: tags, UNIQUE copies (ARMY-011/012).
  const seenCards = new Map<Id, number>()
  const tactical: CardDef[] = []
  list.cards.forEach((id, i) => {
    const c = cardDef(bundle, id)
    if (!c) return err(`cards[${i}]`, 'card.unknown', `Card "${id}" does not exist.`)
    if (c.kind !== 'tactical') return err(`cards[${i}]`, 'card.kind', `"${id}" is not a Tactical Card.`)
    if (faction && c.race !== faction.race) err(`cards[${i}]`, 'card.race', `"${id}" belongs to another race than the Faction Card.`)
    if (faction && !tagsOk(c.factionTags)) err(`cards[${i}]`, 'card.tags', `"${id}" needs a Faction Tag the Faction Card does not carry.`)
    const n = (seenCards.get(id) ?? 0) + 1
    seenCards.set(id, n)
    if (c.unique && n > 1) err(`cards[${i}]`, 'card.unique', `UNIQUE card "${id}" appears more than once.`)
    tactical.push(c)
  })

  // 4. Creep Card (ARMY-013).
  if (list.creepCard) {
    const c = cardDef(bundle, list.creepCard)
    if (!c) err('creepCard', 'creep.unknown', `Creep Card "${list.creepCard}" does not exist.`)
    else if (c.kind !== 'creep') err('creepCard', 'creep.kind', `"${list.creepCard}" is not a Creep Card.`)
    else if (faction && !tagsOk(c.factionTags)) err('creepCard', 'creep.tags', `"${list.creepCard}" needs a Faction Tag the Faction Card does not carry.`)
    if (faction && !faction.requiresCreepCard) err('creepCard', 'creep.forbidden', 'This Faction Card does not use a Creep Card.')
  } else if (faction?.requiresCreepCard) err('creepCard', 'creep.required', 'This Faction Card needs exactly one Creep Card.')

  // 5-7. Units: tags, UNIQUE, composition, upgrades.
  const ledger = slotLedger(bundle, list)
  const seenUnits = new Map<Id, number>()
  list.units.forEach((e, i) => {
    const p = `units[${i}]`
    const def = unitDef(bundle, e.unit)
    if (!def) return err(p, 'unit.unknown', `Unit "${e.unit}" does not exist.`)
    if (def.summoned) return err(p, 'unit.summoned', `"${e.unit}" is a summoned Unit and cannot be bought.`)
    if (faction && !tagsOk(def.factionTags)) err(p, 'unit.tags', `"${e.unit}" needs a Faction Tag the Faction Card does not carry.`)
    const n = (seenUnits.get(e.unit) ?? 0) + 1
    seenUnits.set(e.unit, n)
    if (def.unique && n > 1) err(p, 'unit.unique', `UNIQUE Unit "${e.unit}" appears more than once.`)
    const row = ct?.units[e.unit]
    const ci = compositionIndex(row, e.models)
    if (!row) err(p, 'cost.missing', `The Cost Table has no row for "${e.unit}".`)
    else if (ci < 0) err(p, 'unit.composition', `${e.models} models is not a Composition Option of "${e.unit}".`)
    validateUpgrades(bundle, def, e, p, ci, row, err)
  })
  for (const s of SLOTS) if (ledger.used[s] > ledger.granted[s]) {
    err(`slots.${s}`, 'slot.over', `${ledger.used[s]} ${s} Supply is placed in ${ledger.granted[s]} ${s} slots.`)
  }

  // 8. Totals vs the scale's limits (ARMY-017). Grand Offensive's limit is agreed per game (minerals null).
  const sc = rule(bundle, 'scales')[scale]
  const cost = armyCost(bundle, list)
  if (sc && sc.minerals !== null) {
    if (cost.minerals > sc.minerals) err('cost.minerals', 'cost.minerals', `${cost.minerals} minerals exceed the ${scale} limit of ${sc.minerals}.`)
    const gasMax = Math.floor((sc.minerals * sc.gasPct) / 100)
    if (cost.gas > gasMax) err('cost.gas', 'cost.gas', `${cost.gas} gas exceed the ${scale} limit of ${gasMax}.`)
  }
  for (const id of [...list.cards, ...(list.creepCard ? [list.creepCard] : [])]) {
    if (ct && cardDef(bundle, id) && ct.cards[id] === undefined) err('cards', 'cost.missing', `The Cost Table has no gas price for "${id}".`)
  }
  return errs
}

function validateUpgrades(bundle: EditionBundle, def: UnitDef, e: ArmyListDef['units'][number], p: string, ci: number,
  row: CostUnitRow | undefined, err: (path: string, code: string, message: string) => void): void {
  void bundle
  const seen = new Set<Id>()
  const specModels = new Set<number>()
  const replaced = new Set<Id>()
  e.upgrades.forEach((u, j) => {
    const up = `${p}.upgrades[${j}]`
    const ud = def.upgrades.find((x) => x.id === u.id)
    if (!ud) return err(up, 'upgrade.unknown', `"${def.id}" has no upgrade "${u.id}".`)
    if (seen.has(u.id)) err(up, 'upgrade.duplicate', `Upgrade "${u.id}" is bought twice.`)
    seen.add(u.id)
    if (row && ci >= 0 && !(u.id in row.upgrades)) err(up, 'cost.missing', `The Cost Table has no price for "${u.id}".`)
    else if (row && ci >= 0 && row.upgrades[u.id]?.[ci] == null) err(up, 'upgrade.unavailable', `"${u.id}" is not sold with this Composition Option.`)
    if (ud.specialist) {
      if (u.model === undefined || !Number.isInteger(u.model) || u.model < 0 || u.model >= e.models) {
        err(up, 'upgrade.specialist', `SPECIALIST "${u.id}" must name one model of the Unit.`)
      } else if (specModels.has(u.model)) err(up, 'upgrade.specialist', `Two SPECIALIST upgrades name model ${u.model}.`)
      else specModels.add(u.model)
    } else if (u.model !== undefined) err(up, 'upgrade.model', `"${u.id}" is not a SPECIALIST and applies to every model.`)
    if (ud.replaces && !ud.specialist) {
      if (replaced.has(ud.replaces)) err(up, 'upgrade.replace', `Weapon "${ud.replaces}" is replaced twice.`)
      replaced.add(ud.replaces)
    }
  })
}

export interface Mustered { units: UnitState[]; models: ModelState[]; cards: CardState[] }

/** The model's base in mm: round bases as printed, the smaller dimension of an oval (engine bases are round only). */
const baseOf = (def: UnitDef): number => (typeof def.baseMm === 'number' ? def.baseMm : Math.min(...def.baseMm))

/** Muster one Unit (bought or summoned) into Reserves: UnitState plus `models` ModelStates with their loadout. Model ids
 *  are `<unitId>.<i>`. `upgrades` carry the SPECIALIST model index. */
export function musterUnit(bundle: EditionBundle, seat: SeatId, unitDefId: Id, models: number, unitId: Id,
  upgrades: { id: Id; model?: number }[] = [], location: UnitState['location'] = 'reserves'): { unit: UnitState; models: ModelState[] } {
  const def = requireUnitDef(bundle, unitDefId)
  const ups = upgrades.map((u) => ({ u, d: def.upgrades.find((x) => x.id === u.id) }))
  const ms: ModelState[] = Array.from({ length: models }, (_, i): ModelState => {
    let weapons = def.weapons.map((w) => w.id)
    for (const { u, d } of ups) {
      if (!d?.weapon) continue
      const mine = d.specialist ? u.model === i : true
      if (!mine) continue
      if (d.replaces) weapons = weapons.map((w) => (w === d.replaces ? d.weapon!.id : w))
      else weapons = [...weapons, d.weapon.id]
    }
    return {
      id: `${unitId}.${i}`, profileId: def.id, owner: seat, unitId, pos: { x: 0, z: 0 }, elev: 0, base: baseOf(def), life: 'active',
      offTable: location !== 'table', conditions: [], tokens: {}, weapons, hp: def.stats.hp + (i === 0 ? def.stats.shield ?? 0 : 0),
    }
  })
  const unit: UnitState = {
    id: unitId, owner: seat, profileId: def.id, modelIds: ms.map((m) => m.id), location, activation: null,
    leadingModelId: ms[0]?.id ?? null, inCoherency: true, damage: 0, shielded: def.stats.shield !== null, effects: [],
    upgrades: upgrades.map((u) => ({ ...u })), slot: def.slot, usage: {}, summoned: def.summoned, noShootChargeRound: null,
  }
  return { unit, models: ms }
}

/** Build a seat's units, models (offTable, in Reserves, with weapons and hp) and cards from a list. Ids are
 *  `<idPrefix><n>` (n from 1) for units and `<unitId>.<i>` for models, so a game is reproducible from its lists. */
export function musterArmy(bundle: EditionBundle, seat: SeatId, list: ArmyListDef, idPrefix: string): Mustered {
  const units: UnitState[] = [], models: ModelState[] = []
  list.units.forEach((e, i) => {
    const m = musterUnit(bundle, seat, e.unit, e.models, `${idPrefix}${i + 1}`, e.upgrades)
    units.push(m.unit)
    models.push(...m.models)
  })
  const cards: CardState[] = []
  for (const id of [list.faction, ...list.cards, ...(list.creepCard ? [list.creepCard] : [])]) {
    const c = cardDef(bundle, id)
    if (c) cards.push({ id: c.id, kind: c.kind, exhausted: false, resource: c.resource, usage: {} })
  }
  return { units, models, cards }
}
