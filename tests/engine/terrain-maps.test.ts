// Hand-designed temple maps (TER-001): half-turn symmetry, legality against Markers and edges, plateau access, determinism.
import { describe, expect, it } from 'vitest'
import { initialMarkers } from '../../src/engine/missions'
import { generateTerrain, setupGame } from '../../src/engine/setup'
import { HAND_LAYOUTS, MARKER_CLEAR, EDGE_CLEAR } from '../../src/engine/terrain-maps'
import { accessDistance, distToShape, scPieces, worldShape } from '../../src/engine/terrain'
import type { TerrainInstance } from '../../src/engine/types'
import { bundle } from './helpers'

const b = bundle()
const mission = b.records.missions[0]!
const cases = Object.values(HAND_LAYOUTS).flatMap((l) =>
  b.records.deployments.filter((d) => d.size.w === l.w && d.size.h === l.d).map((dep) => ({ l, dep, table: { w: dep.size.w, d: dep.size.h } })))

const isRamp = (t: TerrainInstance) => t.props['ramp'] === true
const mod = (a: number, m: number) => ((a % m) + m) % m

describe('hand-designed temple maps', () => {
  it('cover every deployment of both scales', () => {
    expect(cases.some((c) => c.l.variant === 4)).toBe(true)
    expect(cases.some((c) => c.l.variant === 7)).toBe(true)
  })

  it('are deterministic', () => {
    for (const { l, dep, table } of cases) {
      const m = initialMarkers(b, mission, dep)
      expect(JSON.stringify(generateTerrain(l.variant, table, m))).toBe(JSON.stringify(generateTerrain(l.variant, table, m)))
    }
  })

  it('are point-symmetric: every piece has a twin a half turn away with the same footprint and height', () => {
    for (const { l, dep, table } of cases) {
      const t = generateTerrain(l.variant, table, initialMarkers(b, mission, dep))
      expect(t.length).toBeGreaterThanOrEqual(5)
      for (const p of t) {
        const q = t.find((o) => Math.abs(o.pos.x + p.pos.x) < 1e-9 && Math.abs(o.pos.z + p.pos.z) < 1e-9)
        expect(q, `${dep.id} ${p.id}`).toBeDefined()
        expect(q!.rulesType).toBe(p.rulesType)
        expect(q!.height).toBe(p.height)
        expect(q!.footprint).toEqual(p.footprint)
        expect(JSON.stringify(q!.props.size)).toBe(JSON.stringify(p.props.size))
        const d = mod(q!.rot - p.rot, Math.PI)
        expect(Math.min(d, Math.PI - d)).toBeLessThan(1e-9)
      }
    }
  })

  it('keep clear of Mission Markers (outside the central plateau) and of the table edges', () => {
    for (const { l, dep, table } of cases) {
      const markers = initialMarkers(b, mission, dep)
      const t = generateTerrain(l.variant, table, markers)
      for (const p of t) {
        const sh = worldShape(p)
        const pts = sh.kind === 'circle' ? [{ x: sh.c.x + sh.r, z: sh.c.z + sh.r }, { x: sh.c.x - sh.r, z: sh.c.z - sh.r }] : sh.pts
        for (const v of pts) {
          expect(Math.abs(v.x), `${dep.id} ${p.id}`).toBeLessThanOrEqual(table.w / 2 - EDGE_CLEAR + 1e-9)
          expect(Math.abs(v.z), `${dep.id} ${p.id}`).toBeLessThanOrEqual(table.d / 2 - EDGE_CLEAR + 1e-9)
        }
        const central = p.id.endsWith('plateau') || p.id.includes('-ramp-')
        if (central) {
          // a Marker may stand on the plateau or a ramp (MID / HIGH GROUND), but never straddle an edge of the impassable plateau
          if (p.id.endsWith('plateau')) for (const m of markers) {
            const d = distToShape(m.pos, sh)
            expect(d === 0 || d >= 1, `${dep.id} marker ${m.n} on plateau edge`).toBe(true)
          }
          continue
        }
        for (const m of markers) expect(distToShape(m.pos, sh), `${dep.id} ${p.id} vs marker ${m.n}`).toBeGreaterThanOrEqual(MARKER_CLEAR)
      }
    }
  })

  it('give the plateau an ACCESS POINT at the top of every ramp, and every ramp a bottom access point on the ground', () => {
    for (const { l, dep, table } of cases) {
      const t = generateTerrain(l.variant, table, initialMarkers(b, mission, dep))
      const sc = scPieces({ terrain: t })
      const plateau = sc.find((p) => p.t.id.endsWith('plateau'))!
      expect(plateau.walkable && plateau.level === 2).toBe(true)
      const ramps = sc.filter((p) => p.ramp)
      expect(ramps).toHaveLength(4)
      for (const r of ramps) {
        expect(r.access).toHaveLength(2)
        const [bottom, top] = r.access as [{ x: number; z: number }, { x: number; z: number }]
        expect(accessDistance(plateau, top)).toBeLessThan(0.51)
        expect(distToShape(top, plateau.shape)).toBeLessThan(0.51)
        expect(distToShape(bottom, plateau.shape)).toBeGreaterThan(3)
        expect(Math.hypot(bottom.x, bottom.z)).toBeGreaterThan(Math.hypot(top.x, top.z))
      }
    }
  })

  it('put LoS-blocking pieces between the deployment edges outside the centre, on both halves', () => {
    for (const { l, dep, table } of cases) {
      const t = generateTerrain(l.variant, table, initialMarkers(b, mission, dep))
      const blockers = (half: number) => t.filter((p) => !isRamp(p) && !p.id.endsWith('plateau') && p.rulesType !== 'obstacle' && Math.sign(p.pos.z) === half)
      expect(blockers(-1).length).toBeGreaterThanOrEqual(1)
      expect(blockers(1).length).toBeGreaterThanOrEqual(1)
    }
  })

  it('does not overlap any two pieces except a ramp meeting its plateau', () => {
    for (const { l, dep, table } of cases) {
      const t = generateTerrain(l.variant, table, initialMarkers(b, mission, dep))
      for (let i = 0; i < t.length; i++) for (let j = i + 1; j < t.length; j++) {
        const a = t[i]!, c = t[j]!
        const pair = [a, c]
        if (pair.some(isRamp) && pair.some((x) => x.id.endsWith('plateau'))) continue
        const sa = worldShape(a), sc = worldShape(c)
        const pts = sa.kind === 'circle' ? [sa.c] : sa.pts
        const inside = pts.some((v) => distToShape(v, sc) === 0)
        const gap = pts.length ? Math.min(...pts.map((v) => distToShape(v, sc))) : 1
        expect(inside || gap < 0.3, `${a.id} / ${c.id}`).toBe(false)
      }
    }
  })

  it('is reached only through the map option, never the TER-001 roll (D3 skirmish / D6 standard)', () => {
    const rolled = (m: 'roll' | 'sunken-shrine' | undefined, deploymentId: string, missionId: string, seed: string) =>
      setupGame(b, { seed, missionId, deploymentId, ...(m ? { map: m } : {}) })
    const dep = b.records.deployments.find((d) => d.size.w === 36 && d.size.h === 36)!
    const mi = b.records.missions.find((x) => x.scale === dep.scale)!
    for (let i = 0; i < 12; i++) {
      const s = rolled(undefined, dep.id, mi.id, `seed${i}`)
      expect(s.terrain.some((p) => p.id.endsWith('plateau'))).toBe(false)
      const mapRolls = s.events.filter((e) => e.type === 'DiceRolled' && JSON.stringify(e).includes('"map"')) as unknown as { dice: number[] }[]
      expect(mapRolls.every((e) => e.dice[0]! <= 3)).toBe(true)
    }
    const shrine = rolled('sunken-shrine', dep.id, mi.id, 'x')
    expect(shrine.terrain.some((p) => p.id.endsWith('plateau'))).toBe(true)
    expect(rolled('roll', dep.id, mi.id, 'x').terrain.some((p) => p.id.endsWith('plateau'))).toBe(false)
  })
})
