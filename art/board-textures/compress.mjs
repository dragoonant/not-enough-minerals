// Compress the raw Poly Haven 1k jpgs (CC0) into webp for public/assets/ground. Run: node art/board-textures/compress.mjs
import sharp from 'sharp'
import { mkdirSync } from 'node:fs'
const map = { badlands: 'cracked_red_ground', ash: 'burned_ground_01', temple: 'red_sandstone_pavement', ice: 'snow_02' }
const kinds = { diff: ['albedo', 78], nor_gl: ['normal', 82], rough: ['rough', 70] }
mkdirSync('public/assets/ground', { recursive: true })
for (const [theme, id] of Object.entries(map)) for (const [src, [name, q]] of Object.entries(kinds)) {
  let s = sharp(`art/board-textures/raw/${id}_${src}.jpg`)
  if (name === 'rough') s = s.greyscale()
  await s.webp({ quality: q, effort: 5 }).toFile(`public/assets/ground/${theme}_${name}.webp`)
}
