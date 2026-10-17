// Side-coloured base rings drawn with InstancedMesh: one draw call per distinct base radius instead of one per figure.
// A figure acquires a slot (colour via instanceColor), writes its position each frame, and releases it when it goes away.
import { Color, DoubleSide, Group, InstancedMesh, Matrix4, MeshBasicMaterial, RingGeometry, type BufferGeometry } from 'three'

export interface RingHandle {
  set(x: number, y: number, z: number, color: string): void
  release(): void
}

interface Bucket {
  radius: number
  geo: BufferGeometry
  mesh: InstancedMesh
  owners: (RingHandleImpl | null)[]
  count: number
}

const INITIAL = 16
const tmpM = new Matrix4()
const tmpC = new Color()

class RingHandleImpl implements RingHandle {
  slot = -1
  px = NaN; py = NaN; pz = NaN; pc = ''
  constructor(private owner: RingBatches, readonly bucket: Bucket) {}
  set(x: number, y: number, z: number, color: string): void {
    if (x === this.px && y === this.py && z === this.pz && color === this.pc) return
    this.px = x; this.py = y; this.pz = z; this.pc = color
    this.owner.write(this)
  }
  release(): void { this.owner.free(this) }
}

export class RingBatches {
  readonly group = new Group()
  private buckets = new Map<number, Bucket>()
  private material = new MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.9, depthWrite: false, side: DoubleSide })
  /** called after a slot changes so a demand-driven canvas redraws */
  onDirty: () => void = () => {}

  constructor() { this.group.name = 'base-rings' }

  /** Draw calls this batch costs (one per live bucket with figures). */
  get drawCalls(): number { let n = 0; for (const b of this.buckets.values()) if (b.count > 0) n++; return n }
  get size(): number { let n = 0; for (const b of this.buckets.values()) n += b.count; return n }

  acquire(radius: number): RingHandle {
    const key = Math.round(radius * 1000)
    let b = this.buckets.get(key)
    if (!b) {
      const geo = new RingGeometry(radius + 0.03, radius + 0.15, 40)
      geo.rotateX(-Math.PI / 2)
      b = { radius, geo, mesh: this.makeMesh(geo, INITIAL), owners: [], count: 0 }
      this.buckets.set(key, b)
      this.group.add(b.mesh)
    }
    if (b.count >= b.mesh.instanceMatrix.count) this.grow(b)
    const h = new RingHandleImpl(this, b)
    h.slot = b.count++
    b.owners[h.slot] = h
    b.mesh.count = b.count
    tmpM.makeScale(0, 0, 0) // hidden until the figure writes its first position
    b.mesh.setMatrixAt(h.slot, tmpM)
    b.mesh.instanceMatrix.needsUpdate = true
    return h
  }

  private makeMesh(geo: BufferGeometry, capacity: number): InstancedMesh {
    const m = new InstancedMesh(geo, this.material, capacity)
    m.count = 0
    m.frustumCulled = false
    m.name = 'side-ring'
    m.renderOrder = 1
    m.setColorAt(0, tmpC.set(0xffffff))
    return m
  }

  private grow(b: Bucket): void {
    const next = this.makeMesh(b.geo, b.mesh.instanceMatrix.count * 2)
    next.instanceMatrix.array.set(b.mesh.instanceMatrix.array)
    next.instanceColor!.array.set(b.mesh.instanceColor!.array)
    next.count = b.count
    this.group.remove(b.mesh)
    b.mesh.dispose()
    this.group.add(next)
    b.mesh = next
    next.instanceMatrix.needsUpdate = true
    next.instanceColor!.needsUpdate = true
  }

  write(h: RingHandleImpl): void {
    const m = h.bucket.mesh
    tmpM.makeTranslation(h.px, h.py, h.pz)
    m.setMatrixAt(h.slot, tmpM)
    m.setColorAt(h.slot, tmpC.set(h.pc))
    m.instanceMatrix.needsUpdate = true
    if (m.instanceColor) m.instanceColor.needsUpdate = true
    this.onDirty()
  }

  free(h: RingHandleImpl): void {
    const b = h.bucket
    if (h.slot < 0) return
    const last = b.count - 1
    if (h.slot !== last) {
      const moved = b.owners[last]!
      b.owners[h.slot] = moved
      moved.slot = h.slot
      this.write(moved)
    }
    b.owners[last] = null
    b.count = last
    b.mesh.count = last
    h.slot = -1
    b.mesh.instanceMatrix.needsUpdate = true
    this.onDirty()
  }
}

/** The one batch every figure shares. */
export const ringBatches = new RingBatches()
