// Shared helpers for the headless tools (sim, ai-bench): load the data tree from disk without Vite.
import { readdirSync, readFileSync, statSync } from 'node:fs'
import { dirname, join, relative, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { buildBundles, emptyBundle, type RawFile } from '../src/data/bundle'
import type { EditionBundle, EditionsFile } from '../src/data/types'

export const DATA_DIR = resolve(dirname(fileURLToPath(import.meta.url)), '..', 'data')
/** Read data/<edition>/** from disk (the default edition from data/editions.json). */
export function loadBundle(edition?: string): EditionBundle {
  const files: RawFile[] = []
  let editions: EditionsFile = { default: 'core', editions: ['core'] }
  const walk = (dir: string) => {
    for (const name of readdirSync(dir)) {
      const p = join(dir, name)
      if (statSync(p).isDirectory()) walk(p)
      else if (name.endsWith('.json')) {
        const path = relative(DATA_DIR, p).split('\\').join('/')
        const json = JSON.parse(readFileSync(p, 'utf8'))
        if (path === 'editions.json') editions = json as EditionsFile
        else files.push({ path, json })
      }
    }
  }
  walk(DATA_DIR)
  const name = edition ?? editions.default
  return buildBundles(files).bundles[name] ?? emptyBundle(name)
}

