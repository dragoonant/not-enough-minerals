// npm run validate:data -> validates every data/<edition>/**/*.json against spec 20 (section 8 checks).
// Options: --dir <path> validates another data root (the M1 dry run uses docs/sources/dryrun). Exits 1 with one
// readable line per error; warnings print but do not fail. The IP prose guard runs only when the gitignored
// extracted card text (docs/sources/text) is present, so CI skips it.
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs'
import { dirname, join, relative, resolve } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { buildBundles, type RawFile } from '../src/data/bundle'
import { formatError, isWarning, validateBundle, validateEditions, type ValidationError } from '../src/data/validate'

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..')
export const DATA_DIR = join(ROOT, 'data')
const CARD_TEXT_DIR = join(ROOT, 'docs', 'sources', 'text')
/** Verbatim run length (words) that counts as copied card prose (spec 20 s8 item 12). */
export const VERBATIM_WORDS = 8

function walk(dir: string, out: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name)
    if (statSync(p).isDirectory()) walk(p, out)
    else if (name.endsWith('.json')) out.push(p)
  }
  return out
}

const words = (s: string) => s.toLowerCase().replace(/[’']/g, '').match(/[a-z0-9]+/g) ?? []

/** Every 8-word run in the extracted card-sheet text (card prose only; rules text is not a card). */
function cardGrams(): Set<string> | null {
  if (!existsSync(CARD_TEXT_DIR)) return null
  const grams = new Set<string>()
  for (const f of readdirSync(CARD_TEXT_DIR)) {
    if (!/Card-Sheets/.test(f)) continue
    for (const line of readFileSync(join(CARD_TEXT_DIR, f), 'utf8').split(/\n\s*\n/)) {
      const w = words(line)
      for (let i = 0; i + VERBATIM_WORDS <= w.length; i++) grams.add(w.slice(i, i + VERBATIM_WORDS).join(' '))
    }
  }
  return grams
}

/** IP guard: no `text` field may share an 8-word run with the card sheets. */
export function proseGuard(files: RawFile[], grams: Set<string>): ValidationError[] {
  const errs: ValidationError[] = []
  const visit = (v: unknown, path: string, file: string, id: string) => {
    if (Array.isArray(v)) v.forEach((x, i) => visit(x, `${path}[${i}]`, file, id))
    else if (v && typeof v === 'object') {
      const o = v as Record<string, unknown>
      const rid = typeof o.id === 'string' && !path ? o.id : id
      for (const [k, x] of Object.entries(o)) {
        const p = path ? `${path}.${k}` : k
        if (k === 'text' && typeof x === 'string') {
          const w = words(x)
          for (let i = 0; i + VERBATIM_WORDS <= w.length; i++) {
            const g = w.slice(i, i + VERBATIM_WORDS).join(' ')
            if (grams.has(g)) { errs.push({ file, id: rid, path: p, message: `copies card wording ("${g}"); write it in our own words` }); break }
          }
        } else visit(x, p, file, rid)
      }
    }
  }
  for (const f of files) for (const rec of Array.isArray(f.json) ? f.json : [f.json]) visit(rec, '', f.path, '-')
  return errs
}

/** Validate a data tree on disk. Returns every problem (warnings carry severity 'warning'); no errors = valid. */
export function validateDataDir(dir: string = DATA_DIR): ValidationError[] {
  const errs: ValidationError[] = []
  const files: RawFile[] = []
  let editions: unknown
  for (const abs of walk(dir)) {
    const path = relative(dir, abs).split('\\').join('/')
    let json: unknown
    try { json = JSON.parse(readFileSync(abs, 'utf8')) } catch (e) {
      errs.push({ file: path, id: '-', path: '', message: `invalid JSON: ${(e as Error).message}` }); continue
    }
    if (path === 'editions.json') editions = json
    else files.push({ path, json })
  }
  if (editions === undefined) errs.push({ file: 'editions.json', id: '-', path: '', message: 'is missing' })
  const { bundles, problems } = buildBundles(files)
  for (const p of problems) errs.push({ file: p.file, id: '-', path: '', message: p.message })
  if (editions !== undefined) errs.push(...validateEditions(editions, Object.keys(bundles)))
  for (const b of Object.values(bundles)) errs.push(...validateBundle(b))
  const grams = cardGrams()
  if (grams) errs.push(...proseGuard(files, grams))
  return errs
}

const isMain = process.argv[1] !== undefined && import.meta.url === pathToFileURL(resolve(process.argv[1])).href
if (isMain) {
  const at = process.argv.indexOf('--dir')
  const dir = at > 0 && process.argv[at + 1] ? resolve(process.argv[at + 1]) : DATA_DIR
  const all = validateDataDir(dir)
  const errs = all.filter((e) => !isWarning(e))
  for (const e of all) (isWarning(e) ? console.warn : console.error)(formatError(e))
  if (errs.length) {
    console.error(`validate:data: ${errs.length} problem(s), ${all.length - errs.length} warning(s)`)
    process.exit(1)
  }
  console.log(`validate:data: ok (${all.length} warning(s))${cardGrams() ? '' : ' [prose guard skipped: no extracted card text]'}`)
}
