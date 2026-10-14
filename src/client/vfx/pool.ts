// Fixed-capacity particle pool (struct of arrays, ring-buffer spawn). No allocation after construction; no three.js import so it
// can be unit tested. The output arrays (pos / col / size) are what the renderer uploads.
export class ParticlePool {
  readonly pos: Float32Array
  readonly col: Float32Array // r g b alpha
  readonly size: Float32Array
  private vel: Float32Array
  private life: Float32Array
  private age: Float32Array
  private s0: Float32Array
  private s1: Float32Array
  private a0: Float32Array
  private grav: Float32Array
  private drag: Float32Array
  private head = 0
  live = 0
  /** Usable slots (<= capacity); lowered in reduced mode. */
  limit: number
  constructor(readonly capacity: number) {
    this.limit = capacity
    this.pos = new Float32Array(capacity * 3); this.col = new Float32Array(capacity * 4); this.size = new Float32Array(capacity)
    this.vel = new Float32Array(capacity * 3)
    this.life = new Float32Array(capacity).fill(1); this.age = new Float32Array(capacity).fill(1)
    this.s0 = new Float32Array(capacity); this.s1 = new Float32Array(capacity); this.a0 = new Float32Array(capacity)
    this.grav = new Float32Array(capacity); this.drag = new Float32Array(capacity)
  }
  spawn(x: number, y: number, z: number, vx: number, vy: number, vz: number, life: number, s0: number, s1: number,
    r: number, g: number, b: number, a: number, grav: number, drag: number): void {
    const i = this.head
    this.head = (this.head + 1) % Math.max(1, this.limit)
    if (this.age[i]! >= this.life[i]!) this.live++
    const p = i * 3, c = i * 4
    this.pos[p] = x; this.pos[p + 1] = y; this.pos[p + 2] = z
    this.vel[p] = vx; this.vel[p + 1] = vy; this.vel[p + 2] = vz
    this.life[i] = Math.max(0.016, life); this.age[i] = 0
    this.s0[i] = s0; this.s1[i] = s1; this.a0[i] = a; this.grav[i] = grav; this.drag[i] = drag
    this.col[c] = r; this.col[c + 1] = g; this.col[c + 2] = b; this.col[c + 3] = a; this.size[i] = s0
  }
  update(dt: number): void {
    if (this.live <= 0) return
    for (let i = 0; i < this.capacity; i++) {
      const age = this.age[i]!, life = this.life[i]!
      if (age >= life) continue
      // Compare the value as stored (Float32): testing the double sum let a slot round up to dead without being counted.
      this.age[i] = age + dt
      const na = this.age[i]!
      if (na >= life) { this.age[i] = life; this.size[i] = 0; this.col[i * 4 + 3] = 0; this.live--; continue }
      const p = i * 3, k = Math.max(0, 1 - this.drag[i]! * dt)
      this.vel[p] = this.vel[p]! * k; this.vel[p + 1] = this.vel[p + 1]! * k - this.grav[i]! * dt; this.vel[p + 2] = this.vel[p + 2]! * k
      this.pos[p] = this.pos[p]! + this.vel[p]! * dt; this.pos[p + 1] = this.pos[p + 1]! + this.vel[p + 1]! * dt; this.pos[p + 2] = this.pos[p + 2]! + this.vel[p + 2]! * dt
      const t = na / life
      this.size[i] = this.s0[i]! + (this.s1[i]! - this.s0[i]!) * t
      this.col[i * 4 + 3] = this.a0[i]! * (1 - t) * (1 - t * 0.25)
    }
  }
  clear(): void { this.age.fill(1); this.size.fill(0); this.col.fill(0); this.live = 0; this.head = 0 }
}
