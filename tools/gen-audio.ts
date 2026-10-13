// Generates the SFX items in tools/audio-manifest.json with the ElevenLabs sound-generation API into
// public/audio/sfx/<id>.mp3. Idempotent: an existing file is skipped, so reruns never re-spend credits. To redo a
// sound, edit its prompt, delete the mp3 and rerun. Music has its own tool (gen-music.ts).
//
//   ELEVENLABS_API_KEY="$(sed -n 's/^EL=//p' tokens.txt.txt | tr -d '\r\n ')" npx tsx tools/gen-audio.ts [--only=prefix] [--dry]
//
// Env: SFX_BUDGET (default 2200): HARD cap of credits this run may spend. Before every call the cost is estimated
//      (CREDITS_PER_SECOND x duration, the documented rate for a fixed duration) and the call is skipped when it would
//      pass the cap; after the call the account counter delta replaces the estimate if it is larger.
// The key is read from the environment only and is never printed or written.
import { mkdir, readFile, readdir, writeFile, stat } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const REPO_ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')
const MANIFEST_PATH = join(REPO_ROOT, 'tools', 'audio-manifest.json')
const OUT_DIR = join(REPO_ROOT, 'public', 'audio', 'sfx')
const BUDGET = Number(process.env.SFX_BUDGET ?? 2200)
const CREDITS_PER_SECOND = 20
const PAGE_PATH = join(REPO_ROOT, 'public', 'sounds.html')

interface SfxItem { id: string; kind: 'sfx'; group?: string; prompt: string; durationSeconds: number; promptInfluence: number }
interface Manifest { items: Array<SfxItem | { id: string; kind: string }> }

const args = process.argv.slice(2)
const flag = (name: string): string | undefined => args.find((a) => a.startsWith(`--${name}=`))?.slice(name.length + 3)
const dry = args.includes('--dry')
const only = flag('only') ?? ''
const pageOnly = args.includes('--page')
const sleep = (ms: number): Promise<void> => new Promise((r) => setTimeout(r, ms))
const est = (i: SfxItem): number => Math.ceil(i.durationSeconds * CREDITS_PER_SECOND)

async function exists(path: string): Promise<boolean> {
  try { const s = await stat(path); return s.isFile() && s.size > 0 } catch { return false }
}
async function used(key: string): Promise<number> {
  const res = await fetch('https://api.elevenlabs.io/v1/user/subscription', { headers: { 'xi-api-key': key } })
  if (!res.ok) throw new Error(`GET /v1/user/subscription failed: ${res.status}`)
  return ((await res.json()) as { character_count: number }).character_count
}
async function generate(key: string, item: SfxItem): Promise<Buffer> {
  const res = await fetch('https://api.elevenlabs.io/v1/sound-generation?output_format=mp3_44100_128', {
    method: 'POST',
    headers: { 'xi-api-key': key, 'Content-Type': 'application/json' },
    body: JSON.stringify({ text: item.prompt, duration_seconds: item.durationSeconds, prompt_influence: item.promptInfluence }),
  })
  if (!res.ok) throw Object.assign(new Error(`sfx "${item.id}" failed: ${res.status} ${(await res.text()).slice(0, 200)}`), { status: res.status })
  return Buffer.from(await res.arrayBuffer())
}

const esc = (t: string): string => t.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/"/g, '&quot;')

/** public/sounds.html: every sound by id (one player at a time), the weapon-to-flavour table, and the music. */
async function writePage(manifest: Manifest): Promise<void> {
  const { WEAPON_FLAVOUR } = await import('../src/client/weaponFlavour')
  const groups = new Map<string, SfxItem[]>()
  for (const i of manifest.items) if (i.kind === 'sfx') { const g = (i as SfxItem).group ?? 'other'; groups.set(g, [...(groups.get(g) ?? []), i as SfxItem]) }
  const li = (id: string, src: string, note: string): string => `<li><span><code>${esc(id)}</code> <small>${esc(note)}</small></span><audio controls preload="none" src="${src}"></audio></li>`
  const used = (id: string): string => Object.entries(WEAPON_FLAVOUR).filter(([, f]) => `wpn-${f}` === id).map(([w]) => w).join(', ')
  const body = [...groups].map(([g, items]) => `<h2>${esc(g)}</h2><ul>${items.map((i) => li(i.id, `audio/sfx/${i.id}.mp3`, `${i.durationSeconds}s ${used(i.id)}`)).join('')}</ul>`).join('')
  const music = manifest.items.filter((i) => i.kind === 'music').map((i) => li(i.id, `audio/music/${i.id}.mp3`, 'music')).join('')
  let weapons: string[] = []
  try { weapons = (await readdir(join(REPO_ROOT, 'data'))).length ? Object.keys(WEAPON_FLAVOUR).sort() : [] } catch { /* none */ }
  const table = weapons.map((w) => `<tr><td><code>${esc(w)}</code></td><td><code>wpn-${WEAPON_FLAVOUR[w]}</code></td></tr>`).join('')
  const html = `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Not Enough Minerals sound check</title>
<style>
:root{--bg:#0f141b;--fg:#dfe6ee;--muted:#8fa3b5;--card:#1b232d;--accent:#e0a03a}
body{margin:0;background:var(--bg);color:var(--fg);font:16px/1.4 system-ui,sans-serif;padding:16px;max-width:760px;margin-inline:auto}
h1{font-size:1.4rem}h2{font-size:1rem;color:var(--accent);margin-top:1.6rem;text-transform:capitalize}p,small{color:var(--muted)}
ul{list-style:none;padding:0;margin:0}li{display:flex;flex-wrap:wrap;align-items:center;justify-content:space-between;gap:8px;background:var(--card);padding:8px 12px;border-radius:6px;margin:5px 0}
audio{width:100%;max-width:300px;height:34px}table{border-collapse:collapse;width:100%}td{padding:3px 8px;border-bottom:1px solid #2c3a48}a{color:var(--accent)}
</style></head><body>
<h1>Sound check</h1><p>Every generated sound by id, so you can name the ones to redo. Unofficial fan project. <a href="./">Back to the game</a></p>
${body}
<h2>music</h2><ul>${music}</ul>
<h2>weapon to sound</h2><table>${table}</table>
<script>document.addEventListener("play",e=>{for(const a of document.querySelectorAll("audio"))if(a!==e.target)a.pause()},true)</script>
</body></html>
`
  await writeFile(PAGE_PATH, html)
  console.log(`[gen-audio] wrote public/sounds.html (${[...groups.values()].flat().length} sounds)`)
}

async function main(): Promise<void> {
  const manifest = JSON.parse(await readFile(MANIFEST_PATH, 'utf8')) as Manifest
  if (pageOnly) { await writePage(manifest); return }
  const items = manifest.items.filter((i): i is SfxItem => i.kind === 'sfx' && i.id.startsWith(only))
  const todo: SfxItem[] = []
  for (const i of items) if (!(await exists(join(OUT_DIR, `${i.id}.mp3`)))) todo.push(i)
  console.log(`[gen-audio] ${todo.length} to generate (${items.length - todo.length} present), estimate ${todo.reduce((s, i) => s + est(i), 0)} credits, hard budget ${BUDGET}`)
  if (dry) { for (const i of todo) console.log(`[gen-audio] would generate ${i.id} (${i.durationSeconds}s, ~${est(i)} credits)`); return }
  const key = process.env.ELEVENLABS_API_KEY
  if (!key) throw new Error('ELEVENLABS_API_KEY is not set')
  await mkdir(OUT_DIR, { recursive: true })
  const start = await used(key)
  let spent = 0
  for (const item of todo) {
    if (spent + est(item) > BUDGET) { console.log(`[gen-audio] STOP at ${item.id}: ~${est(item)} would pass the budget (spent ${spent}/${BUDGET})`); break }
    try {
      const audio = await generate(key, item)
      await writeFile(join(OUT_DIR, `${item.id}.mp3`), audio)
      spent += est(item)
      console.log(`[gen-audio] ${item.id}.mp3 ${audio.length} bytes (~${est(item)} credits, run ~${spent})`)
    } catch (err) {
      spent += est(item) // a failed call may still be charged
      console.error(`[gen-audio] FAILED ${item.id} (~${est(item)} assumed charged): ${err instanceof Error ? err.message : String(err)}`)
    }
    await sleep(800)
  }
  await sleep(2000)
  await writePage(manifest)
  const end = await used(key)
  console.log(`[gen-audio] account delta ${end - start} credits; run estimate ${spent}; budget ${BUDGET}`)
}
main().catch((err) => { console.error('[gen-audio] fatal:', err instanceof Error ? err.message : err); process.exitCode = 1 })
