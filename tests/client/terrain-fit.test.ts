import { existsSync, readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { Box3, BoxGeometry, Mesh, MeshStandardMaterial } from 'three'
import { fitTerrainModel } from '../../src/client/board/terrainGlb'
import { THEME_IDS } from '../../src/client/board/boardTheme'
import { MAX_STRETCH, THEME_SETS, parseTerrainManifest, pickTerrainModel } from '../../src/client/board/terrainFit'
import type { TerrainInstance } from '../../src/engine/types'

const models = parseTerrainManifest(JSON.parse(readFileSync('public/assets/terrain/manifest.json', 'utf8')))
const rect = (id: string, rulesType: TerrainInstance['rulesType'], w: number, d: number, height: number): TerrainInstance =>
  ({ id, pieceId: id, rulesType, pos: { x: 0, z: 0 }, rot: 0, height, props: {}, footprint: { rect: { w, d } } })
const circle = (id: string, r: number, height: number): TerrainInstance =>
  ({ id, pieceId: id, rulesType: 'obstruction', pos: { x: 0, z: 0 }, rot: 0, height, props: {}, footprint: { circle: { r } } })
// Every shape the engine places: generateTerrain's five kinds and the demo table (src/engine/setup.ts).
const ENGINE_PIECES = [
  rect('b1', 'building', 6, 4, 4), rect('b2', 'building', 5, 5, 4), rect('o1', 'obstacle', 5, 1.2, 1.6), rect('o2', 'obstacle', 3, 2, 1.8),
  circle('c1', 1.7, 3), rect('crates', 'obstacle', 4, 3, 2.5), rect('wall', 'obstacle', 10, 1.2, 3.5), rect('ruin', 'building', 7, 4, 4), circle('rock', 2, 3),
]

describe('terrain GLB fitting', () => {
  it('parses the manifest and every file exists', () => {
    expect(models.length).toBeGreaterThanOrEqual(16)
    for (const m of models) expect(existsSync(`public/assets/terrain/${m.file}`)).toBe(true)
    expect(parseTerrainManifest({ 'bad/slug': { file: 'x.glb' }, ok: { file: '../x.glb', size: [1, 1, 1], rulesType: 'obstacle', theme: 'temple' } })).toEqual([])
  })
  it('gives every engine piece shape a model on every board theme, within the stretch cap', () => {
    for (const theme of THEME_IDS) {
      for (const t of ENGINE_PIECES) {
        const p = pickTerrainModel(models, t, theme, 'seed-1')
        expect(p, `${theme} ${t.id}`).not.toBeNull()
        expect(p!.model.rulesType).toBe(t.rulesType)
        expect(p!.stretch).toBeLessThanOrEqual(MAX_STRETCH)
      }
    }
  })
  it('scales the authored size onto the exact footprint and height', () => {
    const t = rect('x', 'building', 6, 4, 4)
    const p = pickTerrainModel(models, t, 'badlands', 's')!
    const [w, d, h] = p.quarter ? [p.model.size[1], p.model.size[0], p.model.size[2]] : p.model.size
    expect(w * p.scale[0]).toBeCloseTo(6); expect(d * p.scale[2]).toBeCloseTo(4); expect(h * p.scale[1]).toBeCloseTo(4)
  })
  it('prefers the theme set and shares one model across a mirrored pair', () => {
    for (const theme of THEME_IDS) {
      const a = pickTerrainModel(models, rect('map3-1', 'building', 6, 4, 4), theme, 'g')!
      const b = pickTerrainModel(models, rect('map3-1m', 'building', 6, 4, 4), theme, 'g')!
      expect(a.model.slug).toBe(b.model.slug)
      expect(b.yaw - a.yaw).toBeCloseTo(Math.PI)
      expect(THEME_SETS[theme].indexOf(a.model.theme)).toBeLessThanOrEqual(1)
    }
  })
  it('keeps polygons, flat patches and unmatched types procedural', () => {
    expect(pickTerrainModel(models, rect('r', 'rubble', 6, 5, 0.6), 'temple', 's')).toBeNull()
    expect(pickTerrainModel(models, rect('f', 'forest', 6, 5, 3), 'temple', 's')).toBeNull()
    const poly: TerrainInstance = { ...rect('p', 'building', 1, 1, 4), footprint: { polygon: [{ x: 0, z: 0 }, { x: 4, z: 0 }, { x: 0, z: 4 }] } }
    expect(pickTerrainModel(models, poly, 'temple', 's')).toBeNull()
  })
  it('fits an off-centre mesh to the exact footprint box, bottom on the table, with a quarter turn', () => {
    for (const quarter of [false, true]) {
      const mesh = new Mesh(new BoxGeometry(2, 1, 3).translate(5, 7, -2), new MeshStandardMaterial())
      const pick = { ...pickTerrainModel(models, rect('q', 'building', 6, 4, 4), 'temple', 's')!, quarter, yaw: 0 }
      const g = fitTerrainModel(mesh, pick, 6, 4, 4)!
      g.updateMatrixWorld(true)
      const b = new Box3().setFromObject(g)
      expect(b.min.x).toBeCloseTo(-3); expect(b.max.x).toBeCloseTo(3)
      expect(b.min.z).toBeCloseTo(-2); expect(b.max.z).toBeCloseTo(2)
      expect(b.min.y).toBeCloseTo(0); expect(b.max.y).toBeCloseTo(4)
    }
  })
})
