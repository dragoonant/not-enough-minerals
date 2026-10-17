// Writes public/sounds.html, the audition page: every SFX and music entry with a play button (played through its
// real trim gain, or raw with the toggle), its trim/gain, group and the cues that use it, the cue -> sound table,
// the weapon -> sound table and the music director scenes. Reads the client modules, so the page cannot drift.
//   npx tsx tools/gen-sfx.ts
// (tools/gen-audio.ts also writes a plainer page at the same path; run this one after it.)
import { writeFileSync, readFileSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { SFX } from '../src/client/audio/sfx'
import { MUSIC_TRACKS, MUSIC_TRIMS, SCENE_TRIMS, sceneGain } from '../src/client/audio/music'
import { CUE_SOUND_TABLE } from '../src/client/audio/cueSounds'
import { WEAPON_FLAVOUR } from '../src/client/weaponFlavour'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const manifest = JSON.parse(readFileSync(join(root, 'tools', 'audio-manifest.json'), 'utf8')) as { items: { id: string; kind: string; durationSeconds?: number }[] }
const dur = new Map(manifest.items.map((i) => [i.id, i.durationSeconds]))
const esc = (s: string): string => s.replace(/&/g, '&amp;').replace(/</g, '&lt;')

const usedBy = (id: string): string => {
  const cues = CUE_SOUND_TABLE.filter((r) => r.sounds.includes(id) || (id.startsWith('wpn-') && r.sounds.includes('wpn-<flavour>'))).map((r) => r.cue)
  const weapons = Object.entries(WEAPON_FLAVOUR).filter(([, f]) => `wpn-${f}` === id).map(([w]) => w)
  return [...new Set(cues)].join(', ') + (weapons.length ? ` (${weapons.join(', ')})` : '')
}

const row = (url: string, id: string, gain: number, label: string, info: string): string =>
  `<li><button data-url="${url}" data-gain="${gain}">Play</button><span class="m"><code>${id}</code> <small>${esc(label)}</small><br><small>gain ${gain.toFixed(2)}${info ? ` &middot; ${esc(info)}` : ''}</small></span></li>`

const groups = new Map<string, string[]>()
for (const s of SFX) {
  const d = dur.get(s.id)
  const list = groups.get(s.group) ?? []
  list.push(row(`audio/sfx/${s.id}.mp3`, s.id, s.trim, s.label, `${d ? `${d}s &middot; ` : ''}${usedBy(s.id)}`.replace(/&middot; $/, '')))
  groups.set(s.group, list)
}
const music = Object.entries(MUSIC_TRACKS).map(([scene, spec]) =>
  row(`audio/music/${spec.id}.mp3`, scene, sceneGain(scene as keyof typeof MUSIC_TRACKS), `${spec.id}.mp3`, `${spec.loop ? 'loop' : 'one-shot'}, rate ${spec.rate}, file trim ${MUSIC_TRIMS[spec.id] ?? 1} x scene ${SCENE_TRIMS[scene as keyof typeof SCENE_TRIMS]}`)).join('')

const html = `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Not Enough Minerals sound check</title>
<style>
:root{--bg:#0f141b;--fg:#dfe6ee;--muted:#8fa3b5;--card:#1b232d;--accent:#e0a03a}
body{margin:0;background:var(--bg);color:var(--fg);font:16px/1.4 system-ui,sans-serif;padding:16px;max-width:820px;margin-inline:auto}
h1{font-size:1.4rem}h2{font-size:1rem;color:var(--accent);margin-top:1.6rem;text-transform:capitalize}p,small{color:var(--muted)}
ul{list-style:none;padding:0;margin:0}li{display:flex;align-items:center;gap:12px;background:var(--card);padding:8px 12px;border-radius:6px;margin:5px 0}
button{min-width:64px;padding:8px 12px;border-radius:4px;border:1px solid #46515c;background:#26323f;color:var(--fg);cursor:pointer}button.on{background:var(--accent);color:#111}
table{border-collapse:collapse;width:100%}td{padding:4px 8px;border-bottom:1px solid #2c3a48;vertical-align:top}a{color:var(--accent)}label{color:var(--muted)}
</style></head><body>
<h1>Sound check</h1><p>Every sound by id with the gain the game applies. Unofficial fan project. <a href="./">Back to the game</a></p>
<p><label><input type="checkbox" id="raw"> Raw file (ignore trim)</label></p>
${[...groups].map(([g, rows]) => `<h2>${g}</h2><ul>${rows.join('')}</ul>`).join('\n')}
<h2>music scenes</h2><p>The director picks calm on the start screen, battle in play, tense when the human side is 3+ VP behind or in the last round, then a stinger at game over.</p><ul>${music}</ul>
<h2>cue to sound</h2><table>${CUE_SOUND_TABLE.map((r) => `<tr><td><code>${r.cue}</code></td><td>${esc(r.when)}</td><td>${esc(r.sounds)}</td></tr>`).join('')}</table>
<h2>weapon to sound</h2><table>${Object.entries(WEAPON_FLAVOUR).sort().map(([w, f]) => `<tr><td><code>${w}</code></td><td><code>wpn-${f}</code></td></tr>`).join('')}</table>
<script>
let ctx, cur, curBtn
const raw = document.getElementById('raw')
document.addEventListener('click', async (e) => {
  const b = e.target.closest('button[data-url]'); if (!b) return
  ctx ??= new AudioContext(); await ctx.resume()
  if (cur) { try { cur.stop() } catch {} ; curBtn.classList.remove('on'); curBtn.textContent = 'Play'; const same = curBtn === b; cur = null; if (same) return }
  try {
    const buf = await ctx.decodeAudioData(await (await fetch(b.dataset.url)).arrayBuffer())
    const g = ctx.createGain(); g.gain.value = raw.checked ? 1 : Number(b.dataset.gain)
    const src = ctx.createBufferSource(); src.buffer = buf; src.connect(g).connect(ctx.destination)
    src.onended = () => { if (cur === src) { cur = null; b.classList.remove('on'); b.textContent = 'Play' } }
    src.start(); cur = src; curBtn = b; b.classList.add('on'); b.textContent = 'Stop'
  } catch { b.textContent = 'Error' }
})
</script>
</body></html>
`
writeFileSync(join(root, 'public', 'sounds.html'), html)
console.log(`[gen-sfx] wrote public/sounds.html (${SFX.length} sfx, ${Object.keys(MUSIC_TRACKS).length} music scenes)`)
