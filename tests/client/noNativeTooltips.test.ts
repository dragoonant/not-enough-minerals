// Spec 50 s4: native title= tooltips are banned; the shared ui/Tooltip.tsx is the only tooltip.
import { readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

const root = join(process.cwd(), 'src/client')
function files(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((e) => (e.isDirectory() ? files(join(dir, e.name)) : /\.tsx$/.test(e.name) ? [join(dir, e.name)] : []))
}

/** Lowercase (DOM) JSX opening tags carrying a title attribute. Component props such as <Tip title=...> are fine. */
export function nativeTitleUses(source: string): string[] {
  const hits: string[] = []
  const re = /<([a-z][a-z0-9]*)\b((?:[^<>{}]|\{[^{}]*(?:\{[^{}]*\}[^{}]*)*\})*?)\s(title)=/g
  for (let m = re.exec(source); m; m = re.exec(source)) hits.push(`<${m[1]} title=`)
  return hits
}

// Files owned by other stages that still use title=; each must be fixed by its owner and removed from this list.
const OWNED_ELSEWHERE: string[] = []

describe('no native tooltips', () => {
  it('UI-020 the detector finds DOM title attributes and ignores component props', () => {
    expect(nativeTitleUses('<button title="x">a</button>')).toHaveLength(1)
    expect(nativeTitleUses('<button aria-label="a"\n  onClick={() => f({ a: 1 })}\n  title={s ? "a" : "b"}>a</button>')).toHaveLength(1)
    expect(nativeTitleUses('<Tip title="x"><button>a</button></Tip>')).toHaveLength(0)
    expect(nativeTitleUses('<svg><title>x</title></svg>')).toHaveLength(0)
  })

  it('UI-021 no client file uses a native title= tooltip', () => {
    const bad: string[] = []
    for (const f of files(root)) {
      const rel = f.slice(root.length + 1).replace(/\\/g, '/')
      if (OWNED_ELSEWHERE.includes(rel)) continue
      const hits = nativeTitleUses(readFileSync(f, 'utf8'))
      if (hits.length) bad.push(`${rel}: ${hits.join(', ')}`)
    }
    expect(bad).toEqual([])
  })

  it('UI-022 the allow-list only names files that still need it', () => {
    for (const rel of OWNED_ELSEWHERE) expect(nativeTitleUses(readFileSync(join(root, rel), 'utf8')).length, rel).toBeGreaterThan(0)
  })
})
