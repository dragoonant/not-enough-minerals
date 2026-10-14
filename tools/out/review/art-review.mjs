// Scratch art-direction review: themes x camera angles, then a bot-vs-bot game at speed=fast with frame timing.
import { chromium } from '@playwright/test'
const BASE = 'http://localhost:5202/not-enough-minerals/'
import { fileURLToPath } from 'node:url'
const OUT = fileURLToPath(new URL('./ad/', import.meta.url))
import { mkdirSync } from 'node:fs'
mkdirSync(OUT, { recursive: true })
const mode = process.argv[2] ?? 'themes'
const browser = await chromium.launch({ headless: true, args: ['--use-angle=d3d11', '--ignore-gpu-blocklist', '--enable-gpu', '--enable-unsafe-webgpu'] })
const page = await browser.newPage({ viewport: { width: 1280, height: 800 } })
const errs = []
page.on('pageerror', (e) => errs.push(e.message))
page.on('console', (m) => { if (m.type() === 'error') errs.push(m.text().slice(0, 200)) })
const cam = (l) => page.getByRole('button', { name: l, exact: true }).click()
const shot = (n) => page.screenshot({ path: OUT + n + '.png' })
async function ready() {
  for (let i = 0; i < 120; i++) {
    const r = await page.evaluate(() => { const t = window.__terrain; if (!t || !Object.keys(t).length) return 'none'; return Object.values(t).some((v) => v === 'loading') ? 'loading' : 'ready' })
    if (r === 'ready') return
    await page.waitForTimeout(500)
  }
}
async function renderer() {
  return page.evaluate(() => { const c = document.createElement('canvas').getContext('webgl2'); const e = c.getExtension('WEBGL_debug_renderer_info'); return e ? c.getParameter(e.UNMASKED_RENDERER_WEBGL) : '?' })
}
const hideHud = () => page.addStyleTag({ content: 'body *:not(canvas):not(div:has(canvas)):not(main){}' })

if (mode === 'themes') {
  for (const theme of ['temple', 'badlands', 'ash', 'ice']) {
    for (const seed of ['rv1', 'rv2']) {
      await page.goto(`${BASE}?test=1&seats=bot,bot&seed=${seed}-${theme}&speed=fast&theme=${theme}`)
      await page.getByTestId('game-screen').waitFor({ timeout: 30000 })
      await ready()
      await page.waitForTimeout(seed === 'rv1' ? 7000 : 2500)
      await page.evaluate(() => window.__game.pauseBots(true))
      const terr = await page.evaluate(() => ({ t: window.__terrain, pieces: window.__game.getState().terrain.map((p) => ({ id: p.id, type: p.rulesType, h: p.height, fp: p.footprint, rot: +p.rot.toFixed(2) })) }))
      console.log(theme, seed, JSON.stringify(terr))
      if (seed === 'rv1') console.log('renderer', await renderer())
      const views = seed === 'rv1' ? ['Overview', 'Near seat', 'Far seat', 'Top down'] : ['Overview']
      for (const v of views) { await cam(v); await page.waitForTimeout(1200); await shot(`${theme}-${seed}-${v.replace(' ', '')}`) }
      if (seed === 'rv1') {
        // low oblique: from near seat, orbit down and zoom in
        await cam('Near seat'); await page.waitForTimeout(600)
        const box = await page.locator('canvas').first().boundingBox()
        const cx = box.x + box.width / 2, cy = box.y + box.height / 2
        await page.mouse.move(cx, cy); await page.mouse.down(); await page.mouse.move(cx + 220, cy - 120, { steps: 10 }); await page.mouse.up()
        for (let i = 0; i < 4; i++) { await page.mouse.wheel(0, -300); await page.waitForTimeout(100) }
        await page.waitForTimeout(1000)
        await shot(`${theme}-${seed}-low`)
      }
    }
  }
}

if (mode === 'game') {
  const theme = process.argv[3] ?? 'badlands'
  const matchup = process.argv[4] ?? 'tvp'
  await page.goto(`${BASE}?test=1&seats=bot,bot&seed=rvg-${matchup}&speed=fast&theme=${theme}&matchup=${matchup}&fps`)
  await page.getByTestId('game-screen').waitFor({ timeout: 30000 })
  await ready()
  console.log('renderer', await renderer())
  await page.evaluate(() => {
    window.__ft = []; let last = performance.now()
    const f = (t) => { window.__ft.push(t - last); last = t; requestAnimationFrame(f) }; requestAnimationFrame(f)
    window.__lt = []; try { new PerformanceObserver((l) => { for (const e of l.getEntries()) window.__lt.push([Math.round(e.startTime), Math.round(e.duration)]) }).observe({ type: 'longtask', buffered: true }) } catch {}
    window.__pk = 0; setInterval(() => { const n = window.__vfx?.engine?.liveParticles ?? 0; if (n > window.__pk) window.__pk = n }, 50)
  })
  await cam('Near seat')
  const t0 = Date.now(); let n = 0, lastKind = ''
  while (Date.now() - t0 < 420000) {
    const s = await page.evaluate(() => { const g = window.__game.getState(); const v = window.__vfx; return { phase: g?.phase, round: g?.round, live: v?.engine?.liveParticles ?? 0, last: v?.last, at: v?.at } })
    if (s.phase === 'over') break
    if (s.live > 30 && n < 40 && s.last !== lastKind + s.at) {
      lastKind = s.last + s.at
      await shot(`game-${matchup}-${String(n).padStart(2, '0')}-${s.last}`); n++
      if (n % 8 === 0) await cam(['Overview', 'Near seat', 'Far seat'][Math.floor(n / 8) % 3])
    }
    await page.waitForTimeout(120)
  }
  await shot(`game-${matchup}-end`)
  const stats = await page.evaluate(() => {
    const ft = window.__ft.slice(5).sort((a, b) => a - b)
    const q = (p) => ft[Math.floor(ft.length * p)]
    return { frames: ft.length, p50: q(0.5), p95: q(0.95), p99: q(0.99), max: ft[ft.length - 1], over50: ft.filter((x) => x > 50).length, over100: ft.filter((x) => x > 100).length, longtasks: window.__lt.length, worstLong: window.__lt.sort((a, b) => b[1] - a[1]).slice(0, 8), peakParticles: window.__pk, vfxTimes: window.__vfx?.times }
  })
  console.log('stats', JSON.stringify(stats), 'secs', (Date.now() - t0) / 1000, 'shots', n)
}

if (mode === 'fx') {
  const theme = process.argv[3] ?? 'temple'
  const matchup = process.argv[4] ?? 'zvp'
  const speed = process.argv[5] ?? 'fast'
  const steps = Number(process.argv[6] ?? 4)
  await page.goto(`${BASE}?test=1&seats=bot,bot&seed=rvfx-${matchup}&speed=${speed}&theme=${theme}&matchup=${matchup}`)
  await page.getByTestId('game-screen').waitFor({ timeout: 30000 })
  await ready()
  await page.evaluate(() => { window.__pk = 0; setInterval(() => { const n = window.__vfx?.engine?.liveParticles ?? 0; if (n > window.__pk) window.__pk = n }, 30) })
  const kinds = ['attack', 'attack', 'attackStage', 'casualties', 'attack', 'marker']
  let ki = 0, n = 0, armedAt = Date.now(), before = 0
  const t0 = Date.now()
  const cams = ['Near seat', 'Overview', 'Far seat']
  await cam(cams[0])
  const arm = async () => { const k = kinds[ki % kinds.length]; before = await page.evaluate((k) => window.__vfx.times[k] ?? 0, k); await page.evaluate(({ k, s }) => { window.__vfx.autoHold = { kind: k, steps: s } }, { k, s: steps }); armedAt = Date.now() }
  await arm()
  while (Date.now() - t0 < 480000 && n < 36) {
    const k = kinds[ki % kinds.length]
    const st = await page.evaluate((k) => ({ phase: window.__game.getState()?.phase, t: window.__vfx.times[k] ?? 0, held: window.__vfx.autoHold === null, live: window.__vfx.engine.liveParticles }), k)
    if (st.phase === 'over') break
    if (st.held && st.t !== before) {
      await page.waitForTimeout(150)
      const feed = await page.evaluate(() => { const el = [...document.querySelectorAll('*')].find((e) => e.textContent?.trim() === 'What happened'); const box = el?.parentElement; const t = (box?.innerText ?? '').split('\n').filter(Boolean); return t.slice(-2).join(' | ') })
      const name = `fx-${matchup}-${speed}-${String(n).padStart(2, '0')}-${k}`
      await shot(name)
      console.log(name, 'live', st.live, '::', feed)
      n++
      await page.evaluate(() => window.__vfx.hold(false))
      if (n % 6 === 0) await cam(cams[Math.floor(n / 6) % cams.length])
      ki++; await arm()
    } else if (Date.now() - armedAt > 7000) { if (ki % 6 === 0) console.log('dbg', JSON.stringify(await page.evaluate(() => ({ ah: window.__vfx.autoHold, t: window.__vfx.times, r: window.__game.getState()?.round })))); ki++; await arm() }
    await page.waitForTimeout(40)
  }
  console.log('peak', await page.evaluate(() => window.__pk), 'secs', (Date.now() - t0) / 1000)
}
console.log('errors', JSON.stringify(errs.slice(0, 10)))
await browser.close()
