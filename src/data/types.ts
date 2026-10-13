// Minimal GENERIC data shape (M0). M1 replaces this with the real StarCraft schema after a dry run on every Founders
// Edition unit and tactical card (docs/spec/20-data-schema.md). Until then a record is { id, name, source } plus any
// fields, grouped by folder. A change here needs the matching edit in spec 20 and in src/data/validate.ts.
import type { BaseMm } from '../engine/types'

export type { BaseMm }

export type Source = string | string[]
/** Escape hatch: named behaviour implemented in engine code hooks (M2). */
export interface Code { code: string; args?: Record<string, unknown> }

/** Every record: kebab-case id, display name, and where the values came from (e.g. "CS1 p.3", "CL p.1"). */
export interface BaseRecord { id: string; name: string; source: Source; [k: string]: unknown }
export type UnitDef = BaseRecord
export type FactionDef = BaseRecord
export interface ScenarioDef extends BaseRecord { sides: { id: string; [k: string]: unknown }[] }
/** Rule constants (singleton rules.json); the record's `source` cites them. */
export interface RulesDef { id: 'rules'; constants: Record<string, number | string | object>; source: Source }

// ---- bundle ----
/** Folder name under data/<edition>/ -> record type. M1 adds folders (tactical cards, weapons, missions, ...). */
export interface KindMap { units: UnitDef; factions: FactionDef; scenarios: ScenarioDef }
export type Kind = keyof KindMap
export const KINDS: readonly Kind[] = ['units', 'factions', 'scenarios']
/** Root files under data/<edition>/ -> singleton type. */
export interface SingletonMap { rules: RulesDef }
export type SingletonName = keyof SingletonMap
export const SINGLETONS: readonly SingletonName[] = ['rules']

export interface EditionsFile { default: string; editions: string[] }
export interface EditionBundle {
  edition: string
  records: { [K in Kind]: KindMap[K][] }
  singletons: Partial<SingletonMap>
  /** record id -> the file it came from (for error messages). */
  origin: Record<string, string>
}
