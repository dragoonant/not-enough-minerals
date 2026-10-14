// In-game board screenshot (needs the dev server on :5201): node art/terrain/board-shot.mjs [theme] [seed] [out.png]
import { chromium } from '@playwright/test'
const [theme = 'badlands', seed = '7', out = 'screenshots/terrain-board.png'] = process.argv.slice(2)
const b = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] })
const p = await b.newPage({ viewport: { width: 1280, height: 800 } })
await p.goto(`http://localhost:5201/not-enough-minerals/?seats=bot,bot&seed=${seed}&theme=${theme}&speed=0.25&test=1`)
await p.waitForTimeout(9000)
await p.keyboard.press('Escape')
await p.getByRole('button', { name: 'Near seat', exact: true }).click()
await p.waitForTimeout(5000)
await p.screenshot({ path: out })
await b.close()
