// Contact-sheet renderer: node art/terrain/shot.mjs <set> [az] [el] [dist|-] [dir served by vite, e.g. /art/terrain/staging/] [out.png]  (needs the dev server on :5201). Writes art/terrain/contact-<set>.png
import { chromium } from '@playwright/test'
const [set = 'temple', az = '0', el = '0.8', d, dir, out] = process.argv.slice(2)
const b = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] })
const p = await b.newPage({ viewport: { width: 1600, height: 900 } })
p.on('console', (m) => { if (m.type() === 'error') console.log('console:', m.text()) })
await p.goto(`http://localhost:5201/art/terrain/preview.html?set=${set}&az=${az}&el=${el}${d && d !== '-' ? `&d=${d}` : ''}${dir ? `&env=1&dir=${encodeURIComponent(dir)}` : ''}`)
await p.waitForFunction(() => window.__done, null, { timeout: 60000 })
await p.screenshot({ path: out || `art/terrain/contact-${set}${az !== '0' ? '-' + az : ''}.png` })
await b.close()
