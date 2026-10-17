// Instanced GLB figures: every model that uses the same shipped GLB shares one InstancedMesh per primitive, so five marines
// cost the draw calls of one. Rigged (split) models are not batched: they animate their own nodes. A figure acquires a slot,
// writes its world matrix each frame (before the render), and releases it when it goes away.
import { Group, InstancedMesh, Matrix4, type BufferGeometry, type Material, type Mesh, type Object3D } from 'three'
import { rigCapabilities } from './rig'

export interface BatchHandle {
  /** world matrix of the figure root (the GLB scene's own origin) */
  set(world: Matrix4): void
  release(): void
}

/** A GLB scene can be instanced when it carries no rig: no lower/upper split for a profile that animates. */
export function isBatchable(scene: Object3D, slug: string): boolean {
  const names: string[] = []
  scene.traverse((o) => { if (o.name) names.push(o.name) })
  const caps = rigCapabilities(slug, names)
  return !caps.turret && !caps.lunge
}

interface Part { local: Matrix4; mesh: InstancedMesh; geo: BufferGeometry; mat: Material | Material[] }

const INITIAL = 8
const tmp = new Matrix4()
const ZERO = new Matrix4().makeScale(0, 0, 0)

class Handle implements BatchHandle {
  slot = -1
  last = new Float32Array(16).fill(NaN)
  constructor(private batch: GlbBatch) {}
  set(world: Matrix4): void {
    const e = world.elements
    let same = true
    for (let i = 0; i < 16; i++) if (this.last[i] !== e[i]) { same = false; break }
    if (same) return
    for (let i = 0; i < 16; i++) this.last[i] = e[i]!
    this.batch.write(this)
  }
  release(): void { this.batch.free(this) }
}

export class GlbBatch {
  readonly group = new Group()
  private parts: Part[] = []
  private owners: (Handle | null)[] = []
  private count = 0
  private capacity = INITIAL
  onDirty: () => void = () => {}

  constructor(readonly url: string, scene: Object3D) {
    this.group.name = `glb-batch-${url}`
    scene.updateMatrixWorld(true)
    scene.traverse((o) => {
      const m = o as Mesh
      if (!m.isMesh) return
      const im = this.make(m.geometry, m.material, INITIAL)
      this.parts.push({ local: m.matrixWorld.clone(), mesh: im, geo: m.geometry, mat: m.material })
      this.group.add(im)
    })
  }

  get drawCalls(): number { return this.count > 0 ? this.parts.length : 0 }
  get size(): number { return this.count }

  private make(geo: BufferGeometry, mat: Material | Material[], capacity: number): InstancedMesh {
    const im = new InstancedMesh(geo, mat, capacity)
    im.count = 0
    im.frustumCulled = false
    im.castShadow = true
    im.receiveShadow = true
    return im
  }

  acquire(): BatchHandle {
    if (this.count >= this.capacity) this.grow()
    const h = new Handle(this)
    h.slot = this.count++
    this.owners[h.slot] = h
    for (const p of this.parts) { p.mesh.count = this.count; p.mesh.setMatrixAt(h.slot, ZERO); p.mesh.instanceMatrix.needsUpdate = true }
    return h
  }

  private grow(): void {
    this.capacity *= 2
    this.parts.forEach((p) => {
      const next = this.make(p.geo, p.mat, this.capacity)
      next.instanceMatrix.array.set(p.mesh.instanceMatrix.array)
      next.count = this.count
      next.instanceMatrix.needsUpdate = true
      this.group.remove(p.mesh)
      p.mesh.dispose()
      this.group.add(next)
      p.mesh = next
    })
  }

  write(h: Handle): void {
    const w = new Matrix4().fromArray(h.last)
    for (const p of this.parts) {
      p.mesh.setMatrixAt(h.slot, tmp.multiplyMatrices(w, p.local))
      p.mesh.instanceMatrix.needsUpdate = true
    }
    this.onDirty()
  }

  free(h: Handle): void {
    if (h.slot < 0) return
    const last = this.count - 1
    if (h.slot !== last) {
      const moved = this.owners[last]!
      this.owners[h.slot] = moved
      moved.slot = h.slot
      if (Number.isFinite(moved.last[0])) this.write(moved)
      else for (const p of this.parts) p.mesh.setMatrixAt(moved.slot, ZERO)
    }
    this.owners[last] = null
    this.count = last
    for (const p of this.parts) { p.mesh.count = last; p.mesh.instanceMatrix.needsUpdate = true }
    h.slot = -1
    this.onDirty()
  }
}

/** All batches in the scene; Figures mounts `batchLayer.group` once. */
class BatchLayer {
  readonly group = new Group()
  private batches = new Map<string, GlbBatch>()
  onDirty: () => void = () => {}
  constructor() { this.group.name = 'glb-batches' }
  batchFor(url: string, scene: Object3D): GlbBatch {
    let b = this.batches.get(url)
    if (!b) {
      b = new GlbBatch(url, scene)
      b.onDirty = () => this.onDirty()
      this.batches.set(url, b)
      this.group.add(b.group)
    }
    return b
  }
  get drawCalls(): number { let n = 0; for (const b of this.batches.values()) n += b.drawCalls; return n }
  get size(): number { let n = 0; for (const b of this.batches.values()) n += b.size; return n }
}

export const batchLayer = new BatchLayer()
