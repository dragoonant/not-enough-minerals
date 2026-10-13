// Game data loader (spec 20). Bundles every data/<edition>/**/*.json at build time via Vite.
// Node tools read the same tree from disk through tools/validate-data.ts instead.
import { buildBundles, emptyBundle, type RawFile } from './bundle'
import type { EditionBundle, EditionsFile, Kind, KindMap, SingletonMap, SingletonName } from './types'

export * from './types'
export { buildBundles } from './bundle'
export { validateBundle, validateEditions, formatError, isWarning, type ValidationError } from './validate'
export { mergedCostTable } from './query'

const modules = import.meta.glob('../../data/**/*.json', { eager: true, import: 'default' }) as Record<string, unknown>

const PREFIX = '../../data/'
const raw: RawFile[] = Object.entries(modules).map(([p, json]) => ({ path: p.slice(PREFIX.length), json }))
const editionsFile = (modules[`${PREFIX}editions.json`] as EditionsFile | undefined) ?? { default: 'sc-2026-10', editions: ['sc-2026-10'] }
const { bundles } = buildBundles(raw)
for (const e of editionsFile.editions) bundles[e] ??= emptyBundle(e)

/** Edition list and default from data/editions.json. */
export const editions: Readonly<EditionsFile> = editionsFile
export const defaultEdition = editionsFile.default

/** The bundle for an edition (default when omitted). Throws on an unknown edition. */
export function edition(name: string = defaultEdition): EditionBundle {
  const b = bundles[name]
  if (!b) throw new Error(`unknown data edition "${name}" (have ${Object.keys(bundles).join(', ')})`)
  return b
}

const indexes = new Map<string, Map<string, unknown>>()
function index(b: EditionBundle, kind: Kind): Map<string, unknown> {
  const key = `${b.edition}/${kind}`
  let m = indexes.get(key)
  if (!m) { m = new Map((b.records[kind] as { id: string }[]).map((r) => [r.id, r])); indexes.set(key, m) }
  return m
}

/** All records of a kind. */
export function all<K extends Kind>(kind: K, ed?: string): readonly KindMap[K][] {
  return edition(ed).records[kind]
}
/** One record by id, or undefined. */
export function find<K extends Kind>(kind: K, id: string, ed?: string): KindMap[K] | undefined {
  return index(edition(ed), kind).get(id) as KindMap[K] | undefined
}
/** One record by id; throws when missing. */
export function get<K extends Kind>(kind: K, id: string, ed?: string): KindMap[K] {
  const r = find(kind, id, ed)
  if (!r) throw new Error(`no ${kind} record "${id}" in edition ${ed ?? defaultEdition}`)
  return r
}
/** A root singleton; throws when the file is missing. */
export function singleton<S extends SingletonName>(name: S, ed?: string): SingletonMap[S] {
  const r = edition(ed).singletons[name]
  if (!r) throw new Error(`data/${ed ?? defaultEdition}/${name}.json is missing`)
  return r as SingletonMap[S]
}
