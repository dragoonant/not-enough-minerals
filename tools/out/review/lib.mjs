import { chromium } from 'playwright'
export async function open(url, name='g') {
  const b = await chromium.launch()
  const p = await b.newPage({ viewport: { width: 1280, height: 800 } })
  const errs = []
  p.on('console', m => { if (m.type() === 'error') errs.push('console.error: '+m.text()) })
  p.on('pageerror', e => errs.push('pageerror: ' + e.message))
  await p.goto(url)
  return { b, p, errs }
}
export async function txt(p, id) { const l = p.locator(`[data-testid=${id}]`); return (await l.count()) ? (await l.first().innerText()).replace(/\n+/g,' | ') : '(none)' }
