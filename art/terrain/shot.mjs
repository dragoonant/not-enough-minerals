// Contact-sheet renderer: node art/terrain/shot.mjs <set> [az] [el]  (needs the dev server on :5201). Writes art/terrain/contact-<set>.png
import { chromium } from '@playwright/test'
const [set = 'temple', az = '0', el = '0.8', d] = process.argv.slice(2)
const b = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] })
const p = await b.newPage({ viewport: { width: 1600, height: 900 } })
p.on('console', (m) => { if (m.type() === 'error') console.log('console:', m.text()) })
await p.goto(`http://localhost:5201/art/terrain/preview.html?set=${set}&az=${az}&el=${el}${d ? `&d=${d}` : ''}`)
await p.waitForFunction(() => window.__done, null, { timeout: 60000 })
await p.screenshot({ path: `art/terrain/contact-${set}${az !== '0' ? '-' + az : ''}.png` })
await b.close()
