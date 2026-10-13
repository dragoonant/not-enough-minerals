// edition.ts: read-only lookups over the data bundle (spec 00 s1 services; spec 20). Every rules number the engine uses
// comes from here (records) or from rules.json via rule(); no module holds a card number as a literal. Also the one
// card-frame -> world conversion (spec 00 s2, spec 17 s2): data keeps the card frame (origin bottom-left, x right,
// y towards N); the world has the origin at the table centre, x right, z towards the near (S) edge.
// Checklist groups: GEN (data-driven numbers), TABLE, DEPL (coordinates), ZOI (zone rectangles), SUP-001 (brackets).
import type {
  AbilityDef, ArmyListDef, CardDef, DeploymentDef, EditionBundle, Id, KeywordDef, MissionDef, RulesDef, Segment, Sourced, TokenDef,
  UnitDef, UpgradeDef, WeaponProfile,
} from '../data/types'
import type { Colour, Vec2 } from './types'

// ---------------------------------------------------------------- rules.json
/** rules.json of the bundle. A missing file is a broken bundle (programmer error), so this throws. */
export function rulesOf(b: EditionBundle): RulesDef {
  const r = b.singletons.rules
  if (!r) throw new Error(`edition ${b.edition}: rules.json is missing`)
  return r
}

type SourcedKeys = { [K in keyof RulesDef]-?: NonNullable<RulesDef[K]> extends Sourced<unknown> ? K : never }[keyof RulesDef]
/** Value type of a Sourced rules.json entry. */
export type RuleValue<K extends SourcedKeys> = NonNullable<RulesDef[K]> extends Sourced<infer V> ? V : never
export type RuleKey = SourcedKeys

/** One rules.json constant, e.g. rule(b, 'coherency') -> 3, rule(b, 'tnClamp') -> [2, 6]. Throws when absent. */
export function rule<K extends RuleKey>(b: EditionBundle, key: K): RuleValue<K> {
  const v = rulesOf(b)[key] as Sourced<RuleValue<K>> | undefined
  if (!v) throw new Error(`edition ${b.edition}: rules.json has no "${String(key)}"`)
  return v.value
}

// ---------------------------------------------------------------- records
const idx = new WeakMap<EditionBundle, Map<string, Map<string, unknown>>>()
function index<T extends { id: string }>(b: EditionBundle, kind: keyof EditionBundle['records']): Map<string, T> {
  let byKind = idx.get(b)
  if (!byKind) { byKind = new Map(); idx.set(b, byKind) }
  let m = byKind.get(kind)
  if (!m) { m = new Map((b.records[kind] as { id: string }[]).map((r) => [r.id, r])); byKind.set(kind, m) }
  return m as Map<string, T>
}

export const unitDef = (b: EditionBundle, id: Id): UnitDef | undefined => index<UnitDef>(b, 'units').get(id)
export const cardDef = (b: EditionBundle, id: Id): CardDef | undefined => index<CardDef>(b, 'cards').get(id)
export const missionDef = (b: EditionBundle, id: Id): MissionDef | undefined => index<MissionDef>(b, 'missions').get(id)
export const deploymentDef = (b: EditionBundle, id: Id): DeploymentDef | undefined => index<DeploymentDef>(b, 'deployments').get(id)
export const presetDef = (b: EditionBundle, id: Id): ArmyListDef | undefined => index<ArmyListDef>(b, 'presets').get(id)

/** A record that must exist (the id came from engine state built from the same bundle). Throws otherwise. */
export function requireUnitDef(b: EditionBundle, id: Id): UnitDef {
  const u = unitDef(b, id)
  if (!u) throw new Error(`edition ${b.edition}: no unit "${id}"`)
  return u
}

/** keywords.json entry by UPPER_SNAKE id. */
export function keywordDef(b: EditionBundle, id: string): KeywordDef | undefined {
  return b.singletons.keywords?.keywords.find((k) => k.id === id)
}

/** Every weapon profile a unit can carry: defaults, then upgrade weapons. */
export function allWeapons(def: UnitDef): WeaponProfile[] {
  return [...def.weapons, ...def.upgrades.flatMap((u) => (u.weapon ? [u.weapon] : []))]
}
export const weaponDef = (def: UnitDef, weaponId: Id): WeaponProfile | undefined => allWeapons(def).find((w) => w.id === weaponId)
export const upgradeDef = (def: UnitDef, id: Id): UpgradeDef | undefined => def.upgrades.find((u) => u.id === id)

/** A unit's abilities: printed ones plus those of the given bought upgrades (all upgrades when omitted). */
export function allAbilities(def: UnitDef, upgradeIds?: readonly Id[]): AbilityDef[] {
  const ups = upgradeIds ? def.upgrades.filter((u) => upgradeIds.includes(u.id)) : def.upgrades
  return [...def.abilities, ...ups.flatMap((u) => (u.ability ? [u.ability] : []))]
}

/** A token definition: the setting record's own tokens first, then the shared rules.json tokens. */
export function tokenDef(b: EditionBundle, owner: Pick<UnitDef | CardDef, 'tokens'> | null, id: Id): TokenDef | undefined {
  return owner?.tokens?.find((t) => t.id === id) ?? b.singletons.rules?.tokens.find((t) => t.id === id)
}

/** Supply printed for `models` live models (Supply Profile bracket, SUP-001). 0 models -> 0; above the top bracket the
 *  top bracket applies. supply.supplyFor() is the only caller that turns this into a rules number. */
export function bracketSupply(def: Pick<UnitDef, 'supplyProfile'>, models: number): number {
  if (models <= 0) return 0
  const br = def.supplyProfile.find((x) => models >= x.min && models <= x.max)
  if (br) return br.supply
  const top = def.supplyProfile[def.supplyProfile.length - 1]
  return top && models > top.max ? top.supply : 0
}

// ---------------------------------------------------------------- card frame <-> world
export interface CardPoint { x: number; y: number }
export interface CardSize { w: number; h: number }

/** Card frame (origin bottom-left, y towards N) -> world (origin centre, z towards S). Never mirrored (RULING R17-2). */
export const cardToWorld = (p: CardPoint, size: CardSize): Vec2 => ({ x: p.x - size.w / 2, z: size.h / 2 - p.y })
export const worldToCard = (v: Vec2, size: CardSize): CardPoint => ({ x: v.x + size.w / 2, y: size.h / 2 - v.z })

/** World table {w, d} for a Deployment Card: w along x, d along z (the card's h). */
export const tableOf = (dep: Pick<DeploymentDef, 'size'>): { w: number; d: number } => ({ w: dep.size.w, d: dep.size.h })

/** Endpoints (world) of an Entry Edge segment; `from`/`to` run W->E on N/S and S->N on E/W. */
export function segmentToWorld(seg: Segment, size: CardSize): [Vec2, Vec2] {
  const pts: [CardPoint, CardPoint] =
    seg.edge === 'N' ? [{ x: seg.from, y: size.h }, { x: seg.to, y: size.h }]
      : seg.edge === 'S' ? [{ x: seg.from, y: 0 }, { x: seg.to, y: 0 }]
        : seg.edge === 'W' ? [{ x: 0, y: seg.from }, { x: 0, y: seg.to }]
          : [{ x: size.w, y: seg.from }, { x: size.w, y: seg.to }]
  return [cardToWorld(pts[0], size), cardToWorld(pts[1], size)]
}

/** Axis-aligned world rectangle. */
export interface Rect { min: Vec2; max: Vec2 }

/** Zone of Influence rectangle of one Entry Edge segment (spec 17 s6): segment length x `depth` inward. Pass
 *  depth = rule(b, 'zoiDepth'). */
export function zoneRect(seg: Segment, size: CardSize, depth: number): Rect {
  const card =
    seg.edge === 'N' ? { x0: seg.from, x1: seg.to, y0: size.h - depth, y1: size.h }
      : seg.edge === 'S' ? { x0: seg.from, x1: seg.to, y0: 0, y1: depth }
        : seg.edge === 'W' ? { x0: 0, x1: depth, y0: seg.from, y1: seg.to }
          : { x0: size.w - depth, x1: size.w, y0: seg.from, y1: seg.to }
  const a = cardToWorld({ x: card.x0, y: card.y1 }, size), c = cardToWorld({ x: card.x1, y: card.y0 }, size)
  return { min: { x: Math.min(a.x, c.x), z: Math.min(a.z, c.z) }, max: { x: Math.max(a.x, c.x), z: Math.max(a.z, c.z) } }
}

/** Card colour of Mission Marker n (DeploymentDef: 1 and 3 red, 2 and 4 blue, 5 neutral). */
export function markerSide(n: number): Colour | 'neutral' {
  return n === 1 || n === 3 ? 'red' : n === 2 || n === 4 ? 'blue' : 'neutral'
}
