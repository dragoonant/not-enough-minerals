import { existsSync, readdirSync, statSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { BOARD_THEMES, THEME_IDS, contrast, groundLuminance, hexRgb, luminance, themeIdFor, themeOverride } from '../../src/client/board/boardTheme'
import { SIDE_HEX } from '../../src/client/board/sideColours'

describe('board theme', () => {
  it('is deterministic per seed, mission and deployment', () => {
    expect(themeIdFor('seed-1', 'm1', 'd1')).toBe(themeIdFor('seed-1', 'm1', 'd1'))
    expect(themeIdFor(undefined)).toBe('badlands')
  })
  it('spreads across all four themes over many seeds', () => {
    const seen = new Set<string>()
    for (let i = 0; i < 200; i++) seen.add(themeIdFor(`s${i}`, 'mission', 'dep'))
    expect([...seen].sort()).toEqual([...THEME_IDS].sort())
  })
  it('parses the ?theme override and ignores junk', () => {
    expect(themeOverride('?theme=ash')).toBe('ash')
    expect(themeOverride('?theme=lava')).toBeNull()
    expect(themeOverride('')).toBeNull()
  })
  for (const id of THEME_IDS) {
    it(`${id}: ground is mid-tone, with enough contrast left for the strengthened strips and outlines`, () => {
      const t = BOARD_THEMES[id]
      const L = groundLuminance(t)
      expect(L).toBeLessThan(0.2)
      expect(contrast(L, luminance(hexRgb(SIDE_HEX.red)))).toBeGreaterThan(1.7)
      expect(contrast(L, luminance(hexRgb(SIDE_HEX.blue)))).toBeGreaterThan(1.7)
    })
    it(`${id}: texture files exist`, () => {
      for (const k of ['albedo', 'normal', 'rough']) expect(existsSync(`public/assets/ground/${BOARD_THEMES[id].ground.stem}_${k}.webp`)).toBe(true)
    })
  }
  it('keeps the ground textures under the 8 MB budget', () => {
    const dir = 'public/assets/ground'
    const total = readdirSync(dir).reduce((n, f) => n + statSync(`${dir}/${f}`).size, 0)
    expect(total).toBeLessThan(8 * 1024 * 1024)
  })
})
