// Scratch: same seed top-down with the procedural rules prisms vs the fitted GLBs, HUD hidden, to compare footprints.
import { chromium } from '@playwright/test'
import { fileURLToPath } from 'node:url'
const OUT = fileURLToPath(new URL('./ad/', import.meta.url))
const BASE = 'http://localhost:5202/not-enough-minerals/'
const browser = await chromium.launch({ headless: true, args: ['--use-angle=d3d11', '--ignore-gpu-blocklist'] })
const page = await browser.newPage({ viewport: { width: 1280, height: 800 } })
for (const [theme, seed] of [['ice', 'rv1-ice'], ['temple', 'rv1-temple'], ['badlands', 'rv1-badlands'], ['ash', 'rv2-ash']]) {
  for (const terr of ['procedural', 'glb']) {
    await page.goto(`${BASE}?test=1&seats=bot,bot&seed=${seed}&speed=fast&theme=${theme}${terr === 'procedural' ? '&terrain=procedural' : ''}`)
    await page.getByTestId('game-screen').waitFor({ timeout: 30000 })
    for (let i = 0; i < 60; i++) { const r = await page.evaluate(() => { const t = window.__terrain; return t && Object.keys(t).length && !Object.values(t).some((v) => v === 'loading') }); if (r) break; await page.waitForTimeout(400) }
    await page.evaluate(() => window.__game.pauseBots(true))
    await page.getByRole('button', { name: 'Top down', exact: true }).click()
    await page.waitForTimeout(1500)
    await page.addStyleTag({ content: '[class*="rail"],[data-testid*="rail"],[data-testid="hud-banner"],[data-testid="hud-thinking"],[data-testid="dice-tray"]{visibility:hidden!important}' })
    await page.waitForTimeout(300)
    await page.screenshot({ path: `${OUT}fp-${theme}-${terr}.png`, clip: { x: 300, y: 60, width: 680, height: 680 } })
  }
}
// hover a terrain piece to see what info appears
await page.mouse.move(640, 400); await page.waitForTimeout(500)
await browser.close()
