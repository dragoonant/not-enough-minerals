// Receives Gemini concept images without a browser download (KB 3.1): node tools/models/terrain/receiver.mjs [outDir]
// The Gemini tab opens http://localhost:8799/ with window.open from a real click and postMessages {slug, dataUrl} to it;
// the page POSTs each image here and it is written to <outDir>/<slug>.png (default art/terrain/concepts).
import { createServer } from 'node:http'
import { mkdirSync, writeFileSync } from 'node:fs'
import { join, resolve } from 'node:path'

const OUT = resolve(process.argv[2] ?? 'art/terrain/concepts')
mkdirSync(OUT, { recursive: true })
const PAGE = `<!doctype html><meta charset="utf-8"><title>receiver</title><pre id=l>waiting</pre><script>
const l = document.getElementById('l')
addEventListener('message', async (e) => {
  if (!/^https:\\/\\/gemini\\.google\\.com$/.test(e.origin)) return
  const { slug, dataUrl } = e.data || {}
  if (!/^[a-z0-9-]+$/.test(slug || '') || !String(dataUrl).startsWith('data:image/')) return
  const r = await fetch('/save?slug=' + slug, { method: 'POST', body: dataUrl })
  l.textContent += '\\n' + slug + ' ' + r.status
  e.source.postMessage({ saved: slug, status: r.status }, e.origin)
})
</script>`

createServer((req, res) => {
  console.log(req.method, req.url.slice(0, 60))
  const u = new URL(req.url, 'http://localhost')
  if (req.method === 'GET' && u.pathname === '/') { res.writeHead(200, { 'content-type': 'text/html' }); return res.end(PAGE) }
  if (req.method === 'POST' && u.pathname === '/save') {
    const slug = u.searchParams.get('slug') ?? ''
    if (!/^[a-z0-9-]+$/.test(slug)) { res.writeHead(400); return res.end() }
    let body = ''
    req.on('data', (c) => { body += c })
    req.on('end', () => {
      const m = /^data:image\/(\w+);base64,(.*)$/s.exec(body)
      if (!m) { res.writeHead(400); return res.end() }
      writeFileSync(join(OUT, `${slug}.png`), Buffer.from(m[2], 'base64'))
      console.log(`saved ${slug}.png (${m[1]})`)
      res.writeHead(200); res.end()
    })
    return
  }
  res.writeHead(404); res.end()
}).listen(8799, '127.0.0.1', () => console.log(`receiver on http://localhost:8799/ -> ${OUT}`))
