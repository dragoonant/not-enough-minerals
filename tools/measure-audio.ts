// Decodes public/audio/sfx/<prefix>*.mp3 (and public/audio/music/) in headless Chromium and prints RMS, peak and crest
// factor (peak / RMS) per file plus a suggested playback trim (aiming at RMS 0.16, or 0.08 for UI and table sounds;
// capped so the peak stays under 1 and at 4x), so trims are measured, not guessed. Paste them into src/client/audio/sfx.ts.
// Gunshots should have a crest of about 8 or more (about 2 means the transient was squashed).
//   npx tsx tools/measure-audio.ts [prefix]
import { readdir, readFile } from 'node:fs/promises'
import { join, sep } from 'node:path'
import { fileURLToPath } from 'node:url'
import { chromium } from '@playwright/test'

const root = join(fileURLToPath(new URL('.', import.meta.url)), '..', 'public', 'audio')
const prefix = process.argv[2] ?? ''
const TARGET_RMS = 0.16
const list = async (dir: string): Promise<string[]> => {
  try { return (await readdir(dir)).filter((f) => f.startsWith(prefix) && f.endsWith('.mp3')).sort().map((f) => join(dir, f)) } catch { return [] }
}
const files = [...(await list(join(root, 'sfx'))), ...(await list(join(root, 'music')))]
const browser = await chromium.launch()
const page = await browser.newPage()
for (const f of files) {
  const b64 = (await readFile(f)).toString('base64')
  const r = await page.evaluate(async (data) => {
    const bytes = Uint8Array.from(atob(data), (c) => c.charCodeAt(0))
    const buf = await new OfflineAudioContext(1, 44100, 44100).decodeAudioData(bytes.buffer)
    const ch = buf.getChannelData(0)
    let sum = 0, peak = 0
    for (const v of ch) { sum += v * v; peak = Math.max(peak, Math.abs(v)) }
    const rms = Math.sqrt(sum / ch.length)
    return { rms, peak, crest: peak / Math.max(rms, 1e-9), dur: buf.duration }
  }, b64)
  const name = f.split(sep).join('/').split('/audio/')[1]!.replace('.mp3', '')
  const quiet = ['ui-', 'dice-', 'marker-', 'shield-'].some((p) => name.startsWith(`sfx/${p}`))
  const target = quiet ? TARGET_RMS / 2 : TARGET_RMS
  const trim = Math.round(Math.min(4, target / Math.max(r.rms, 1e-6), 0.98 / Math.max(r.peak, 1e-6)) * 100) / 100
  console.log(`${name.padEnd(28)} rms ${r.rms.toFixed(3)} peak ${r.peak.toFixed(2)} crest ${r.crest.toFixed(1)} ${r.dur.toFixed(2)}s trim ${trim}`)
}
await browser.close()
if (files.length === 0) console.log(`[measure-audio] no files match "${prefix}"`)
