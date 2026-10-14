// Procedural terrain authoring kit (original designs). Every piece is built on a painted base plate cut to its exact rules
// footprint (round plinth for circles, bevelled slab for rectangles), so the footprint edge is the visible base edge.
// Pieces are written as flat-shaded, vertex-coloured GLBs; local frame: y up, footprint centred on the origin, bottom on y=0.
import * as THREE from 'three'
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js'

export const MATS = {
  main: { metallic: 0, rough: 0.92 },
  metal: { metallic: 0.55, rough: 0.5 },
  gloss: { metallic: 0.1, rough: 0.28 },
  crystal: { metallic: 0.15, rough: 0.18, emissive: [0.04, 0.3, 0.36] },
  glow: { metallic: 0, rough: 0.5, emissive: [0.2, 0.95, 0.85] },
  sac: { metallic: 0, rough: 0.3, emissive: [0.12, 0.36, 0.04] },
  hazard: { metallic: 0.1, rough: 0.6 },
}

export function rngOf(seed) {
  let a = seed >>> 0
  return () => { a = (a + 0x6d2b79f5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296 }
}
const col = (c) => new THREE.Color(c)

export class Piece {
  constructor(W, D, H, seed = 1) { this.W = W; this.D = D; this.H = H; this.r = rngOf(seed); this.parts = []; this.jr = rngOf(seed * 7 + 3) }
  add(geo, color, mat, m, opt = {}) {
    const g = geo.index ? geo.toNonIndexed() : geo.clone()
    g.deleteAttribute('uv'); g.applyMatrix4(m)
    g.computeVertexNormals()
    this.parts.push({ g, color: col(color), mat, flat: !!opt.noAo })
  }
  _m(x, y, z, ry = 0, rx = 0, rz = 0) {
    const m = new THREE.Matrix4().makeTranslation(x, y, z)
    const q = new THREE.Quaternion().setFromEuler(new THREE.Euler(rx, ry, rz, 'YXZ'))
    return m.multiply(new THREE.Matrix4().makeRotationFromQuaternion(q))
  }
  /** Box standing on y0 centred on (x,z). */
  box(x, y0, z, w, h, d, color, mat = 'main', ry = 0, o = {}) { this.add(new THREE.BoxGeometry(w, h, d), color, mat, this._m(x, y0 + h / 2, z, ry, o.rx ?? 0, o.rz ?? 0), o) }
  cyl(x, y0, z, rTop, rBot, h, color, seg = 10, mat = 'main', o = {}) { this.add(new THREE.CylinderGeometry(rTop, rBot, h, seg), color, mat, this._m(x, y0 + h / 2, z, o.ry ?? 0, o.rx ?? 0, o.rz ?? 0), o) }
  /** Rectangular frustum (bottom w0 x d0 -> top w1 x d1). */
  frustum(x, y0, z, w0, d0, w1, d1, h, color, mat = 'main', ry = 0, o = {}) {
    const g = new THREE.BoxGeometry(w0, h, d0)
    const p = g.attributes.position
    for (let i = 0; i < p.count; i++) if (p.getY(i) > 0) { p.setX(i, p.getX(i) * (w1 / w0)); p.setZ(i, p.getZ(i) * (d1 / d0)) }
    this.add(g, color, mat, this._m(x, y0 + h / 2, z, ry), o)
  }
  /** Lumpy rock/organic blob centred at (x,y,z). */
  blob(x, y, z, rx, ry, rz, color, mat = 'main', detail = 1, jit = 0.18, o = {}) {
    const g = new THREE.IcosahedronGeometry(1, detail)
    const p = g.attributes.position, seen = new Map()
    for (let i = 0; i < p.count; i++) {
      const k = `${p.getX(i).toFixed(3)},${p.getY(i).toFixed(3)},${p.getZ(i).toFixed(3)}`
      if (!seen.has(k)) seen.set(k, 1 + (this.jr() - 0.5) * 2 * jit)
      const s = seen.get(k)
      p.setXYZ(i, p.getX(i) * s * rx, p.getY(i) * s * ry, p.getZ(i) * s * rz)
    }
    this.add(g, color, mat, this._m(x, y, z, o.ry ?? this.jr() * 6.28), o)
  }
  /** Faceted crystal shard from y0, leaning by (tx, tz) radians. */
  shard(x, y0, z, r, h, tx, tz, color, mat = 'crystal', seg = 6) {
    const g = new THREE.CylinderGeometry(r * 0.06, r, h, seg); g.translate(0, h / 2, 0)
    this.add(g, color, mat, this._m(x, y0, z, this.jr() * 6.28, tx, tz), { noAo: true })
  }
  /** Thin round tube between two points (vein, pipe, cable). */
  tube(a, b, rad, color, mat = 'main', seg = 5) {
    const va = new THREE.Vector3(...a), vb = new THREE.Vector3(...b), d = vb.clone().sub(va), len = d.length()
    const g = new THREE.CylinderGeometry(rad, rad, len, seg)
    const m = new THREE.Matrix4().compose(va.clone().add(vb).multiplyScalar(0.5), new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), d.normalize()), new THREE.Vector3(1, 1, 1))
    this.add(g, color, mat, m, { noAo: mat === 'glow' || mat === 'sac' })
  }
  /** Base plate: bevelled rectangle; returns the top height. */
  plateRect(rim, top) {
    const { W, D } = this
    this.box(0, 0, 0, W, 0.12, D, rim, 'main', 0, { noAo: true })
    this.frustum(0, 0.12, 0, W, D, W - 0.16, D - 0.16, 0.12, top, 'main', 0, { noAo: true })
    return 0.24
  }
  /** Round plinth of diameter W. */
  plateRound(rim, top, seg = 40) {
    this.round = true
    const r = this.W / 2
    this.cyl(0, 0, 0, r, r, 0.12, rim, seg, 'main', { noAo: true })
    this.cyl(0, 0.12, 0, r - 0.09, r, 0.12, top, seg, 'main', { noAo: true })
    return 0.24
  }
  /** Containment pass: nothing may leave the rules footprint (x, z clamped) or the authored height (content above the plate is compressed). */
  contain() {
    const hw = this.W / 2, hd = this.D / 2, H = this.H, base = 0.24
    let top = 0
    for (const p of this.parts) { const a = p.g.attributes.position; for (let i = 0; i < a.count; i++) top = Math.max(top, a.getY(i)) }
    const k = (H - base) / (top - base)
    for (const p of this.parts) {
      const a = p.g.attributes.position
      for (let i = 0; i < a.count; i++) {
        let x = a.getX(i), z = a.getZ(i), y = a.getY(i)
        if (this.round) { const r = Math.hypot(x, z); if (r > hw) { x *= hw / r; z *= hw / r } } else { x = Math.max(-hw, Math.min(hw, x)); z = Math.max(-hd, Math.min(hd, z)) }
        if (y > base) y = base + (y - base) * k
        a.setXYZ(i, x, Math.max(0, y), z)
      }
      p.g.computeVertexNormals()
    }
  }
  build() {
    this.contain()
    const groups = new Map()
    for (const p of this.parts) {
      const g = p.g, pos = g.attributes.position, n = pos.count, c = new Float32Array(n * 3)
      for (let t = 0; t < n; t += 3) {
        const j = 0.93 + this.jr() * 0.14
        for (let k = 0; k < 3; k++) {
          const y = pos.getY(t + k)
          const ao = p.flat ? 1 : 0.7 + 0.3 * Math.min(1, Math.max(0, y / 1.1))
          c[(t + k) * 3] = p.color.r * j * ao; c[(t + k) * 3 + 1] = p.color.g * j * ao; c[(t + k) * 3 + 2] = p.color.b * j * ao
        }
      }
      g.setAttribute('color', new THREE.BufferAttribute(c, 3))
      if (!groups.has(p.mat)) groups.set(p.mat, [])
      groups.get(p.mat).push(g)
    }
    const prims = []
    for (const [mat, gs] of groups) prims.push({ mat, geo: mergeGeometries(gs) })
    return prims
  }
}

/** Measure the merged bbox of a built piece (inches). */
export function bboxOf(prims) {
  const b = new THREE.Box3()
  for (const p of prims) { p.geo.computeBoundingBox(); b.union(p.geo.boundingBox) }
  return b
}

/** Serialise primitives to a binary glTF (one node, one mesh, one primitive per material). */
export function toGlb(prims) {
  const bufs = [], views = [], accs = [], mats = [], matIdx = new Map(), primitives = []
  let off = 0
  const push = (arr) => {
    const b = Buffer.from(arr.buffer, arr.byteOffset, arr.byteLength); const pad = (4 - (b.length % 4)) % 4
    bufs.push(b, Buffer.alloc(pad)); views.push({ buffer: 0, byteOffset: off, byteLength: b.length, target: 34962 }); off += b.length + pad
    return views.length - 1
  }
  for (const { mat, geo } of prims) {
    const def = MATS[mat]
    if (!matIdx.has(mat)) { matIdx.set(mat, mats.length); mats.push({ name: mat, pbrMetallicRoughness: { baseColorFactor: [1, 1, 1, 1], metallicFactor: def.metallic, roughnessFactor: def.rough }, ...(def.emissive ? { emissiveFactor: def.emissive } : {}) }) }
    const attrs = {}
    for (const [name, key] of [['POSITION', 'position'], ['NORMAL', 'normal'], ['COLOR_0', 'color']]) {
      const a = geo.attributes[key]; const arr = new Float32Array(a.array)
      const v = push(arr)
      const acc = { bufferView: v, componentType: 5126, count: a.count, type: 'VEC3' }
      if (key === 'position') { geo.computeBoundingBox(); const b = geo.boundingBox; acc.min = [b.min.x, b.min.y, b.min.z]; acc.max = [b.max.x, b.max.y, b.max.z] }
      accs.push(acc); attrs[name] = accs.length - 1
    }
    primitives.push({ attributes: attrs, material: matIdx.get(mat), mode: 4 })
  }
  const json = { asset: { version: '2.0', generator: 'nem-terrain-kit' }, scene: 0, scenes: [{ nodes: [0] }], nodes: [{ mesh: 0 }], meshes: [{ primitives }], materials: mats, accessors: accs, bufferViews: views, buffers: [{ byteLength: off }] }
  let js = Buffer.from(JSON.stringify(json)); js = Buffer.concat([js, Buffer.alloc((4 - (js.length % 4)) % 4, 0x20)])
  const bin = Buffer.concat(bufs)
  const head = Buffer.alloc(12); head.writeUInt32LE(0x46546c67, 0); head.writeUInt32LE(2, 4); head.writeUInt32LE(12 + 8 + js.length + 8 + bin.length, 8)
  const jh = Buffer.alloc(8); jh.writeUInt32LE(js.length, 0); jh.writeUInt32LE(0x4e4f534a, 4)
  const bh = Buffer.alloc(8); bh.writeUInt32LE(bin.length, 0); bh.writeUInt32LE(0x004e4942, 4)
  return Buffer.concat([head, jh, js, bh, bin])
}
