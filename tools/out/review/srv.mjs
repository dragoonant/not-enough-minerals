import { chromium } from 'playwright'
import http from 'node:http'
const b = await chromium.launch()
const ctx = await b.newContext({ viewport: { width: 1280, height: 800 } })
let p = await ctx.newPage()
const errs = []
const hook = (pg) => { pg.on('console', m => { if (m.type() === 'error') errs.push('console.error: '+m.text().slice(0,300)) }); pg.on('pageerror', e => errs.push('pageerror: ' + e.message)) }
hook(p)
let n = 0
const txt = async (id) => { const l = p.locator(`[data-testid=${id}]`); return (await l.count()) ? (await l.first().innerText()).replace(/\n+/g,' | ') : '(none)' }
http.createServer(async (req, res) => {
  let body = ''; for await (const c of req) body += c
  let out = ''
  const log = (...a) => { out += a.map(x => typeof x === 'string' ? x : JSON.stringify(x)).join(' ') + '\n' }
  try {
    const fn = new Function('p', 'log', 'txt', 'errs', 'shot', `return (async () => { ${body} })()`)
    const shot = async (name) => { const f = `${String(++n).padStart(3,'0')}-${name}.png`; await p.screenshot({ path: f }); log('SHOT ' + f); return f }
    const r = await fn(p, log, txt, errs, shot)
    if (r !== undefined) log(r)
  } catch (e) { out += 'ERR ' + e.message + '\n' }
  if (errs.length) { out += 'PAGE ERRS:\n' + errs.splice(0).join('\n') + '\n' }
  res.end(out)
}).listen(5299, () => console.log('ready'))
