// Builds EditionBundles from raw JSON files. Pure: used by the Vite loader (index.ts) and the Node tools
// (tools/validate-data.ts, tools/sim-core.ts). Paths are relative to data/, with forward slashes. Layout (spec 20 s1):
//   <edition>/rules.json, <edition>/keywords.json          singletons (one object each)
//   <edition>/units/<terran|zerg|protoss>/<file>.json       UnitDef or UnitDef[]
//   <edition>/hooks/<terran|zerg|protoss|cards|core>.json   HookDef[]
//   <edition>/<cards|missions|deployments|costs|presets>/<file>.json   one record or an array
import { HOOK_AREAS, KINDS, RACES, SINGLETONS, type EditionBundle, type Kind, type SingletonName } from './types'

export interface RawFile { path: string; json: unknown }
export interface BundleProblem { file: string; message: string }

export function emptyBundle(edition: string): EditionBundle {
  const records = Object.fromEntries(KINDS.map((k) => [k, []])) as unknown as EditionBundle['records']
  return { edition, records, singletons: {}, origin: {} }
}

/** Where a file under an edition folder belongs, or why it does not. */
function placeOf(parts: string[]): { kind: Kind } | { singleton: SingletonName } | { problem: string } {
  if (parts.length === 2) {
    const name = parts[1].replace(/\.json$/, '') as SingletonName
    return SINGLETONS.includes(name) ? { singleton: name } : { problem: `unknown root file (expected ${SINGLETONS.join(', ')}.json)` }
  }
  const kind = parts[1] as Kind
  if (!KINDS.includes(kind)) return { problem: `unknown folder "${parts[1]}" (expected ${KINDS.join(', ')})` }
  if (kind === 'units') {
    if (parts.length !== 4 || !RACES.includes(parts[2] as never)) return { problem: `units go in units/<${RACES.join('|')}>/<file>.json` }
    return { kind }
  }
  if (parts.length !== 3) return { problem: `${kind}/ holds files only, no sub-folders` }
  if (kind === 'hooks' && !HOOK_AREAS.includes(parts[2].replace(/\.json$/, '') as never)) return { problem: `hooks files are ${HOOK_AREAS.map((a) => `${a}.json`).join(', ')}` }
  return { kind }
}

/** Group raw files under data/<edition>/... into bundles. editions.json at the root is skipped. */
export function buildBundles(files: RawFile[]): { bundles: Record<string, EditionBundle>; problems: BundleProblem[] } {
  const bundles: Record<string, EditionBundle> = {}
  const problems: BundleProblem[] = []
  for (const { path, json } of [...files].sort((a, b) => a.path.localeCompare(b.path))) {
    const parts = path.split('/')
    if (parts.length === 1) {
      if (parts[0] !== 'editions.json') problems.push({ file: path, message: 'unexpected file at data/ root' })
      continue
    }
    const bundle = (bundles[parts[0]] ??= emptyBundle(parts[0]))
    const place = placeOf(parts)
    if ('problem' in place) { problems.push({ file: path, message: place.problem }); continue }
    if ('singleton' in place) {
      if (Array.isArray(json) || typeof json !== 'object' || json === null) { problems.push({ file: path, message: 'singleton file must hold one object' }); continue }
      ;(bundle.singletons as Record<string, unknown>)[place.singleton] = json
      const id = (json as { id?: unknown }).id
      if (typeof id === 'string') bundle.origin[id] ??= path
      continue
    }
    for (const rec of Array.isArray(json) ? json : [json]) {
      ;(bundle.records[place.kind] as unknown[]).push(rec)
      const id = (rec as { id?: unknown } | null)?.id
      if (typeof id === 'string') bundle.origin[id] ??= path
    }
  }
  return { bundles, problems }
}
