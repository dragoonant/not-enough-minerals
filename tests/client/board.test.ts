import { existsSync, readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { cameraPose, hash01, viewDirOf } from '../../src/client/board/layout'
import { contestLabel } from '../../src/client/board/Labels'

describe('board layout and models', () => {
  it('mirrors the camera presets for the second seat', () => {
    const a = cameraPose('near', { w: 36, d: 36 }), b = cameraPose('near', { w: 36, d: 36 }, true)
    expect(b.pos[2]).toBeCloseTo(-a.pos[2])
    expect(cameraPose('overview', { w: 54, d: 36 }).pos[1]).toBeGreaterThan(cameraPose('overview', { w: 36, d: 36 }).pos[1])
  })
  it('turns the table so the viewer Entry Edge is nearest the camera', () => {
    const seg = (x0: number, z0: number, x1: number, z1: number): [{ x: number; z: number }, { x: number; z: number }] => [{ x: x0, z: z0 }, { x: x1, z: z1 }]
    const north = viewDirOf([seg(-18, -18, 18, -18)]), west = viewDirOf([seg(-18, -18, -18, 18)]), south = viewDirOf([seg(-18, 18, 18, 18)])
    expect(north).toEqual([0, -1]); expect(west).toEqual([-1, 0]); expect(south).toEqual([0, 1])
    const corner = viewDirOf([seg(-18, -18, 18, -18), seg(-18, -18, -18, 18)])
    expect(corner[0]).toBeLessThan(0); expect(corner[1]).toBeLessThan(0)
    for (const [dir, p] of [[north, 'overview'], [west, 'near'], [corner, 'top']] as const) {
      const pose = cameraPose(p, { w: 36, d: 36 }, dir)
      const len = Math.hypot(pose.pos[0], pose.pos[2])
      if (p !== 'top') expect((pose.pos[0] * dir[0] + pose.pos[2] * dir[1]) / len).toBeCloseTo(1)
      else expect(pose.pos[0] * dir[0] + pose.pos[2] * dir[1]).toBeGreaterThan(0)
    }
    expect(viewDirOf(undefined, true)).toEqual([0, -1])
  })
  it('labels a contested marker with who is ahead', () => {
    const name = (s: string) => s.toUpperCase()
    expect(contestLabel(['a', 'b'], { a: 3, b: 1 }, name)).toBe('Contested (A ahead)')
    expect(contestLabel(['a', 'b'], { a: 2, b: 2 }, name)).toBe('Contested')
  })
  it('hash01 is deterministic and in range', () => {
    expect(hash01(3, 4)).toBe(hash01(3, 4))
    for (let i = 0; i < 50; i++) { const v = hash01(i, 9); expect(v).toBeGreaterThanOrEqual(0); expect(v).toBeLessThan(1) }
  })
  it('manifest lists only existing unit ids and files', () => {
    const m = JSON.parse(readFileSync('public/models/manifest.json', 'utf8')) as Record<string, { file: string; height: number; yaw: number }>
    for (const [id, e] of Object.entries(m)) {
      expect(existsSync(`public/models/${e.file}`)).toBe(true)
      expect(e.height).toBeGreaterThan(0)
      expect(['terran', 'zerg', 'protoss'].some((r) => existsSync(`data/sc-2026-10/units/${r}/${id}.json`))).toBe(true)
    }
  })
})
