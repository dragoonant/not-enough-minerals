// Generates the music items in tools/audio-manifest.json with the ElevenLabs Music API into
// public/audio/music/<id>.mp3. Idempotent: an existing file is skipped, so reruns never re-spend credits.
//
//   ELEVENLABS_API_KEY=... npx tsx tools/gen-music.ts [--only=id1,id2] [--dry]
//
// Env: MUSIC_BUDGET (default 2800): credits this run may spend. Before every call the cost is estimated at
//      CREDITS_PER_SECOND x duration and the call is skipped if it would pass the budget. A failed call (e.g. a 502)
//      may still be charged, so its estimate counts as spent and it is retried at most once.
// The key is read from the environment only and is never printed or written.

import { mkdir, readFile, writeFile, stat } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const REPO_ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')
const MANIFEST_PATH = join(REPO_ROOT, 'tools', 'audio-manifest.json')
const MUSIC_DIR = join(REPO_ROOT, 'public', 'audio', 'music')
const BUDGET = Number(process.env.MUSIC_BUDGET ?? 2800)
const CREDITS_PER_SECOND = 12.5

interface MusicItem { id: string; kind: 'music'; prompt: string; durationSeconds: number; loop?: boolean }
interface Manifest { music: { endpoint: string; modelId: string; forceInstrumental: boolean; outputFormat: string }; items: Array<MusicItem | { id: string; kind: string }> }
interface Subscription { character_count: number; character_limit: number }

const args = process.argv.slice(2)
const flag = (name: string): string | undefined => args.find((a) => a.startsWith(`--${name}=`))?.slice(name.length + 3)
const dry = args.includes('--dry')
const only = flag('only')?.split(',') ?? null
const sleep = (ms: number): Promise<void> => new Promise((r) => setTimeout(r, ms))

async function exists(path: string): Promise<boolean> {
  try { const s = await stat(path); return s.isFile() && s.size > 0 } catch { return false }
}

async function subscription(key: string): Promise<Subscription> {
  const res = await fetch('https://api.elevenlabs.io/v1/user/subscription', { headers: { 'xi-api-key': key } })
  if (!res.ok) throw new Error(`GET /v1/user/subscription failed: ${res.status}`)
  return (await res.json()) as Subscription
}

async function compose(key: string, m: Manifest, item: MusicItem): Promise<Buffer> {
  const res = await fetch(`https://api.elevenlabs.io${m.music.endpoint}?output_format=${m.music.outputFormat}`, {
    method: 'POST',
    headers: { 'xi-api-key': key, 'Content-Type': 'application/json' },
    body: JSON.stringify({ prompt: item.prompt, music_length_ms: Math.round(item.durationSeconds * 1000), model_id: m.music.modelId, force_instrumental: m.music.forceInstrumental }),
  })
  if (!res.ok) throw Object.assign(new Error(`music "${item.id}" failed: ${res.status} ${(await res.text()).slice(0, 300)}`), { status: res.status })
  return Buffer.from(await res.arrayBuffer())
}

async function main(): Promise<void> {
  const manifest = JSON.parse(await readFile(MANIFEST_PATH, 'utf8')) as Manifest
  const music = manifest.items.filter((i): i is MusicItem => i.kind === 'music' && (!only || only.includes(i.id)))
  const todo: MusicItem[] = []
  for (const item of music) if (!(await exists(join(MUSIC_DIR, `${item.id}.mp3`)))) todo.push(item)
  const est = (i: MusicItem) => Math.ceil(i.durationSeconds * CREDITS_PER_SECOND)
  console.log(`[gen-music] ${todo.length} to generate (${music.length - todo.length} present), estimate ${todo.reduce((s, i) => s + est(i), 0)} credits, budget ${BUDGET}`)
  if (dry) { for (const i of todo) console.log(`[gen-music] would generate ${i.id} (${i.durationSeconds}s, ~${est(i)} credits)`); return }

  const key = process.env.ELEVENLABS_API_KEY
  if (!key) throw new Error('ELEVENLABS_API_KEY is not set')
  await mkdir(MUSIC_DIR, { recursive: true })
  const start = await subscription(key)
  console.log(`[gen-music] account before: ${start.character_count}/${start.character_limit}`)
  let spent = 0

  for (const item of todo) {
    for (let attempt = 1; attempt <= 2; attempt++) {
      if (spent + est(item) > BUDGET) { console.log(`[gen-music] SKIP ${item.id}: ~${est(item)} would pass budget (spent ${spent}/${BUDGET})`); break }
      try {
        const audio = await compose(key, manifest, item)
        await writeFile(join(MUSIC_DIR, `${item.id}.mp3`), audio)
        // The account counter lags music charges by minutes, so the budget counts the estimate (measured: exact).
        spent += est(item)
        console.log(`[gen-music] generated ${item.id}.mp3 (${item.durationSeconds}s, ${audio.length} bytes, ~${est(item)} credits, run ~${spent})`)
        break
      } catch (err) {
        const status = (err as { status?: number }).status ?? 0
        spent += est(item) // a failed call (e.g. 502) may still be charged
        console.error(`[gen-music] FAILED ${item.id} (attempt ${attempt}, ~${est(item)} credits assumed charged): ${err instanceof Error ? err.message : String(err)}`)
        if (!(status >= 500 || status === 429)) break
        await sleep(3000)
      }
    }
  }
  const end = await subscription(key)
  console.log(`[gen-music] account after: ${end.character_count}/${end.character_limit}; account delta ${end.character_count - start.character_count} (may lag), estimated run spend ${spent}`)
}

main().catch((err) => { console.error('[gen-music] fatal:', err instanceof Error ? err.message : err); process.exitCode = 1 })
