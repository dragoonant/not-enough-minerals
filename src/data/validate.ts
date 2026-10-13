// Data validator core (generic M0 shape; spec 20). Pure: no fs, no Vite. tools/validate-data.ts wraps it for the CLI.
// M1 adds per-kind checks when the schema is frozen.
import { KINDS, type EditionBundle, type EditionsFile, type Kind } from './types'

export interface ValidationError { file: string; id: string; path: string; message: string }

export const ID_RE = /^[a-z0-9]+(-[a-z0-9]+)*$/

const isObj = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v)
const nonEmpty = (v: unknown): v is string => typeof v === 'string' && v.trim() !== ''

function checkSource(err: (path: string, msg: string) => void, v: unknown): void {
  if (Array.isArray(v) && v.length > 0) v.forEach((x, i) => { if (!nonEmpty(x)) err(`source[${i}]`, 'must be a non-empty string') })
  else if (!nonEmpty(v)) err('source', 'is required (string or non-empty array)')
}

/** Validate one edition bundle. Returns every problem found; empty array = valid. */
export function validateBundle(b: EditionBundle): ValidationError[] {
  const errs: ValidationError[] = []
  const counts = new Map<string, number>()
  const visit = (kind: Kind | 'singleton', rec: unknown, fallbackFile: string) => {
    const id = isObj(rec) && typeof rec.id === 'string' ? rec.id : '(no id)'
    const err = (path: string, message: string) => errs.push({ file: b.origin[id] ?? fallbackFile, id, path, message })
    if (!isObj(rec)) { err('', 'record must be an object'); return }
    if (!nonEmpty(rec.id)) err('id', 'is required')
    else if (!ID_RE.test(rec.id)) err('id', 'must be kebab-case (a-z, 0-9, single hyphens)')
    if (kind !== 'singleton' && !nonEmpty(rec.name)) err('name', 'is required')
    checkSource(err, rec.source)
    counts.set(id, (counts.get(id) ?? 0) + 1)
  }
  for (const kind of KINDS) for (const rec of b.records[kind] as unknown[]) visit(kind, rec, `${b.edition}/${kind}/?`)
  for (const [name, rec] of Object.entries(b.singletons)) {
    visit('singleton', rec, `${b.edition}/${name}.json`)
    if (isObj(rec) && rec.id !== name) errs.push({ file: `${b.edition}/${name}.json`, id: String(rec.id), path: 'id', message: `must be "${name}"` })
  }
  for (const [id, n] of counts) if (n > 1 && id !== '(no id)') errs.push({ file: b.origin[id] ?? b.edition, id, path: 'id', message: `duplicate id (${n} records)` })
  return errs
}

/** Validate editions.json against the bundles found on disk. */
export function validateEditions(editions: unknown, found: string[]): ValidationError[] {
  const errs: ValidationError[] = []
  const e = (path: string, message: string) => errs.push({ file: 'editions.json', id: '-', path, message })
  if (!isObj(editions)) { e('', 'must be an object { default, editions }'); return errs }
  const ed = editions as unknown as EditionsFile
  if (!Array.isArray(ed.editions) || ed.editions.some((x) => typeof x !== 'string')) e('editions', 'must be a string array')
  else {
    if (!ed.editions.includes(ed.default)) e('default', `"${ed.default}" is not listed in editions`)
    for (const f of found) if (!ed.editions.includes(f)) e('editions', `folder data/${f}/ is not listed`)
  }
  return errs
}

export function formatError(x: ValidationError): string {
  return `data/${x.file} [${x.id}] ${x.path || '(record)'}: ${x.message}`
}
