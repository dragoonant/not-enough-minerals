// Scratch: replay one synthetic attack cue per weapon flavour between two real models, hold mid-flight, screenshot.
import { chromium } from '@playwright/test'
import { fileURLToPath } from 'node:url'
const OUT = fileURLToPath(new URL('./ad/', import.meta.url))
const BASE = 'http://localhost:5202/not-enough-minerals/'
const browser = await chromium.launch({ headless: true, args: ['--use-angle=d3d11', '--ignore-gpu-blocklist'] })
const page = await browser.newPage({ viewport: { width: 1280, height: 800 } })
const matchup = process.argv[2] ?? 'tvz', speed = process.argv[3] ?? 'fast'
await page.goto(`${BASE}?test=1&seats=bot,bot&seed=gal-${matchup}&speed=${speed}&theme=badlands&matchup=${matchup}`)
await page.getByTestId('game-screen').waitFor({ timeout: 30000 })
for (let i = 0; i < 200; i++) { const r = await page.evaluate(() => window.__game.getState()?.round ?? 0); if (r >= 2) break; await page.waitForTimeout(500) }
await page.evaluate(() => window.__game.pauseBots(true))
await page.waitForTimeout(2500)
const pair = await page.evaluate(() => {
  const s = window.__game.getState(); const [A, B] = s.seatOrder
  const on = (seat) => Object.values(s.models).filter((m) => m.life !== 'dead' && !m.offTable && s.units[m.unitId]?.owner === seat)
  let best = null
  for (const a of on(A)) for (const b of on(B)) { const d = Math.hypot(a.pos.x - b.pos.x, a.pos.z - b.pos.z); if (d > 5 && d < 24 && (!best || Math.abs(d - 11) < Math.abs(best.d - 11))) best = { a: a.id, b: b.id, bu: b.unitId, d, bm: s.units[b.unitId].modelIds.slice(0, 3) } }
  return best
})
console.log('pair', JSON.stringify(pair))
const weapons = { gauss: 'c-14-rifle', revolver: 'justice-revolver', autocannon: 'quad-k12', missiles: 'hellfire-missiles', siege: 'shock-cannon', glaive: 'glaive-cannon', disruptor: 'particle-disruptors', spines: 'needle-spines', acid: 'acid-saliva', bioblast: 'energy-blast', psiblade: 'psi-blades', warpblade: 'master-warp-blade', claw: 'claws', slash: 'scythe', stomp: 'stomp' }
await page.getByRole('button', { name: 'Near seat', exact: true }).click()
await page.waitForTimeout(1500)
for (const [label, w] of Object.entries(weapons)) {
  for (const steps of [6, 14]) {
    await page.evaluate(() => { window.__vfx.hold(false); window.__vfx.engine.clear?.() })
    await page.waitForTimeout(700)
    await page.evaluate(({ p, w, steps }) => { window.__vfx.autoHold = { kind: 'attack', steps }; window.__vfx.cue({ kind: 'attack', attackerId: p.a, targetId: p.b, weaponId: w, ns: 'shoot' }) }, { p: pair, w, steps })
    await page.waitForTimeout(250)
    await page.screenshot({ path: `${OUT}gal-${matchup}-${speed}-${label}-${steps}.png` })
  }
}
// damage + death
await page.evaluate(() => window.__vfx.hold(false)); await page.waitForTimeout(800)
await page.evaluate(({ p }) => { window.__vfx.autoHold = { kind: 'attackStage', steps: 10 }; window.__vfx.cue({ kind: 'attackStage', targetUnitId: p.bu, data: { step: 'damage', total: 3 } }) }, { p: pair })
await page.waitForTimeout(250); await page.screenshot({ path: `${OUT}gal-${matchup}-${speed}-damage.png` })
await page.evaluate(() => window.__vfx.hold(false)); await page.waitForTimeout(800)
await page.evaluate(({ p }) => { window.__vfx.autoHold = { kind: 'casualties', steps: 12 }; window.__vfx.cue({ kind: 'casualties', modelIds: p.bm }) }, { p: pair })
await page.waitForTimeout(250); await page.screenshot({ path: `${OUT}gal-${matchup}-${speed}-death.png` })
console.log('done', await page.evaluate(() => window.__vfx.engine.liveParticles))
await browser.close()
