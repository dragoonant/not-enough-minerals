// Splits fused GLBs into named nodes by partitioning triangles against a per-slug plane (triangle centroid side).
// Config: tools/models/split-planes.json { <slug>: { file, normal:[x,y,z], frac|offset, below, above } }. The plane is
// normal . p = offset (model space after node transforms), where frac is a fraction of the extent along the normal.
// Shared vertices are duplicated per side; materials and textures are kept. Originals are backed up once to
// art/models-staging/unsplit/ and always used as the source, so re-running is idempotent. Textures are already webp, so
// they are not re-encoded. Usage: node tools/models/split.mjs [--only slug,slug] [--inspect] [--dir public/models]
import { copyFile, readFile, stat, writeFile } from 'node:fs/promises'
import { join, resolve } from 'node:path'
import { NodeIO } from '@gltf-transform/core'
import { EXTMeshoptCompression, EXTTextureWebP, KHRMeshQuantization } from '@gltf-transform/extensions'
import { dedup, meshopt, prune, weld } from '@gltf-transform/functions'
import { MeshoptEncoder, MeshoptDecoder } from 'meshoptimizer'

const args = process.argv.slice(2)
const opt = (n, d) => { const i = args.indexOf(`--${n}`); return i >= 0 ? args[i + 1] : d }
const DIR = resolve(opt('dir', 'public/models'))
const BACKUP = resolve('art/models-staging/unsplit')
const only = (opt('only', '') || '').split(',').filter(Boolean)
const inspect = args.includes('--inspect')
const cfg = JSON.parse(await readFile(resolve('tools/models/split-planes.json'), 'utf8'))

await MeshoptEncoder.ready
await MeshoptDecoder.ready
const io = new NodeIO()
  .registerExtensions([EXTMeshoptCompression, EXTTextureWebP, KHRMeshQuantization])
  .registerDependencies({ 'meshopt.encoder': MeshoptEncoder, 'meshopt.decoder': MeshoptDecoder })

const xf = (m, p) => [
  m[0] * p[0] + m[4] * p[1] + m[8] * p[2] + m[12],
  m[1] * p[0] + m[5] * p[1] + m[9] * p[2] + m[13],
  m[2] * p[0] + m[6] * p[1] + m[10] * p[2] + m[14],
]
const meshNodes = (doc) => doc.getRoot().listNodes().filter((n) => n.getMesh())
const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2]

function extent(doc, normal) {
  let lo = Infinity, hi = -Infinity
  const box = { min: [Infinity, Infinity, Infinity], max: [-Infinity, -Infinity, -Infinity] }
  const ds = []
  for (const n of meshNodes(doc)) {
    const m = n.getWorldMatrix()
    for (const prim of n.getMesh().listPrimitives()) {
      const pos = prim.getAttribute('POSITION')
      for (let i = 0; i < pos.getCount(); i++) {
        const w = xf(m, pos.getElement(i, [0, 0, 0]))
        for (let k = 0; k < 3; k++) { box.min[k] = Math.min(box.min[k], w[k]); box.max[k] = Math.max(box.max[k], w[k]) }
        const d = dot(w, normal)
        ds.push(d); lo = Math.min(lo, d); hi = Math.max(hi, d)
      }
    }
  }
  const hist = new Array(20).fill(0)
  for (const d of ds) hist[Math.min(19, Math.floor(((d - lo) / (hi - lo)) * 20))]++
  return { lo, hi, box, hist }
}

function splitPrimitive(doc, buffer, prim, m, keep) {
  const pos = prim.getAttribute('POSITION')
  const idxAcc = prim.getIndices()
  const count = idxAcc ? idxAcc.getCount() : pos.getCount()
  const index = (i) => (idxAcc ? idxAcc.getScalar(i) : i)
  const sides = [[], []]
  for (let t = 0; t + 2 < count; t += 3) {
    const tri = [index(t), index(t + 1), index(t + 2)]
    const c = [0, 0, 0]
    for (const v of tri) { const w = xf(m, pos.getElement(v, [0, 0, 0])); c[0] += w[0] / 3; c[1] += w[1] / 3; c[2] += w[2] / 3 }
    sides[keep(c) ? 1 : 0].push(...tri)
  }
  return sides.map((tris) => {
    if (!tris.length) return null
    const map = new Map()
    const order = []
    const newIdx = new Uint32Array(tris.length)
    tris.forEach((v, i) => {
      let k = map.get(v)
      if (k === undefined) { k = order.length; map.set(v, k); order.push(v) }
      newIdx[i] = k
    })
    const out = doc.createPrimitive().setMaterial(prim.getMaterial()).setMode(prim.getMode())
    for (const sem of prim.listSemantics()) {
      const src = prim.getAttribute(sem)
      const size = src.getElementSize()
      const raw = src.getArray()
      const arr = new raw.constructor(order.length * size)
      // raw copy keeps quantised / normalised storage exact
      order.forEach((v, i) => { for (let k = 0; k < size; k++) arr[i * size + k] = raw[v * size + k] })
      out.setAttribute(sem, doc.createAccessor().setType(src.getType()).setArray(arr).setNormalized(src.getNormalized()).setBuffer(buffer))
    }
    out.setIndices(doc.createAccessor().setType('SCALAR').setArray(newIdx).setBuffer(buffer))
    return out
  })
}

for (const [slug, c] of Object.entries(cfg)) {
  if (only.length && !only.includes(slug)) continue
  const live = join(DIR, c.file)
  const backup = join(BACKUP, c.file)
  try { await stat(backup) } catch { await copyFile(live, backup) }
  const doc = await io.read(backup)
  const normal = c.normal || [0, 1, 0]
  const e = extent(doc, normal)
  const offset = c.offset !== undefined ? c.offset : e.lo + (e.hi - e.lo) * c.frac
  if (inspect) {
    console.log(slug, 'bbox', e.box.min.map((x) => x.toFixed(3)).join(','), '->', e.box.max.map((x) => x.toFixed(3)).join(','),
      'plane', offset.toFixed(3), 'hist', e.hist.join(' '))
    continue
  }
  const buffer = doc.getRoot().listBuffers()[0]
  const scene = doc.getRoot().getDefaultScene() || doc.getRoot().listScenes()[0]
  const roots = [doc.createNode(c.below), doc.createNode(c.above)]
  const tris = [0, 0]
  const sources = meshNodes(doc)
  const keep = (p) => dot(p, normal) >= offset
  for (const n of sources) {
    const m = n.getWorldMatrix()
    const parts = n.getMesh().listPrimitives().map((p) => splitPrimitive(doc, buffer, p, m, keep))
    for (const side of [0, 1]) {
      const prims = parts.map((p) => p[side]).filter(Boolean)
      if (!prims.length) continue
      const mesh = doc.createMesh(`${slug}-${side ? c.above : c.below}`)
      prims.forEach((p) => { mesh.addPrimitive(p); tris[side] += p.getIndices().getCount() / 3 })
      roots[side].addChild(doc.createNode(`${side ? c.above : c.below}-part`).setMesh(mesh).setMatrix(m))
    }
  }
  for (const s of doc.getRoot().listScenes()) for (const n of s.listChildren()) if (!roots.includes(n)) n.dispose()
  for (const n of sources) if (!n.isDisposed()) n.dispose()
  roots.forEach((r) => scene.addChild(r))
  await doc.transform(dedup(), prune(), weld(), meshopt({ encoder: MeshoptEncoder, level: 'high' }))
  const out = await io.writeBinary(doc)
  await writeFile(live, out)
  console.log(`${slug}: plane ${offset.toFixed(3)} ${c.below}=${tris[0]} tris, ${c.above}=${tris[1]} tris, ${(out.byteLength / 1024).toFixed(0)} KB`)
}
