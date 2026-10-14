// Generates every terrain GLB + manifest.json + catalog.json. Run from the repo root: node art/terrain/gen-terrain.mjs
// Sizes are the engine's terrain footprints (generateTerrain + demo table); each piece stands on a base plate cut to its exact
// footprint so the rules edge is the visible base edge. Original designs only (no Blizzard IP).
import { mkdirSync, writeFileSync, readdirSync, unlinkSync, readFileSync } from 'node:fs'
import { Piece, bboxOf, toGlb } from './lib.mjs'

const OUT = 'public/assets/terrain'
const PAL = {
  temple: { rim: '#2d2822', top: '#62584a', a: '#b79b6b', b: '#8e7550', c: '#6d5a3f', cap: '#cdb283' },
  outpost: { rim: '#1c1f22', top: '#3b4147', a: '#6b7842', b: '#5d6873', c: '#454c54', y: '#d6a51f', k: '#181a1c', bag: '#a28c60', cap: '#5f6b46' },
  crystal: { rim: '#12151b', top: '#262b35', a: '#2d333f', b: '#3e4655', c: '#1c2028', cy: '#35d3e6', cy2: '#86f2ff', deep: '#1d86ad' },
  creep: { rim: '#140710', top: '#27101d', a: '#4f1b35', b: '#6c2849', c: '#33122a', vein: '#92406c', acid: '#a8e83a', acid2: '#6cc22a' },
}
const GLOW = '#0b2e2c'

// ---------- shared helpers ----------
function wallRun(P, axis, fixed, a0, a1, t, y0, heights, colors, mat = 'main', capFn) {
  const n = heights.length, len = (a1 - a0) / n
  heights.forEach((h, i) => {
    const s0 = a0 + i * len, c = (s0 + s0 + len) / 2
    const colr = colors[i % colors.length]
    if (axis === 'x') P.box(c, y0, fixed, len + 0.01, h - y0, t, colr, mat); else P.box(fixed, y0, c, t, h - y0, len + 0.01, colr, mat)
    if (capFn) capFn(axis === 'x' ? c : fixed, h, axis === 'x' ? fixed : c, axis === 'x' ? len : t, axis === 'x' ? t : len, i)
  })
}

// ---------- BUILDINGS: hall A (hall with doorway, upper floor, roof fragment) and hall B (courtyard with towers + walkway) ----------
function hallA(P, kind, v) {
  const { W, D, H } = P, s = PAL[kind], ph = 0.24, i0 = 0.2, t = 0.5
  const x0 = -W / 2 + i0, x1 = W / 2 - i0, z0 = -D / 2 + i0, z1 = D / 2 - i0
  const dw = 1.5, gx = v ? 0.7 : -0.5
  const yf = Math.round(H * 0.6 * 10) / 10
  const cols = kind === 'crystal' ? [s.a, s.b] : kind === 'creep' ? [s.a, s.b] : [s.a, s.b]
  const wmat = kind === 'outpost' ? 'metal' : kind === 'creep' ? 'gloss' : 'main'
  const cap = (x, h, z, w, d, i) => {
    if (kind === 'creep') for (let k = 0; k < 2; k++) P.blob(x + (k - 0.5) * w * 0.4, h, z, Math.max(0.3, w * 0.28), 0.28, Math.max(0.3, d * 0.62), s.b, 'gloss', 1, 0.2)
    if (kind === 'temple') { P.box(x, h, z, w * 0.55, 0.12, d * 0.8, s.cap, 'main', (P.jr() - 0.5) * 0.3) }
    if (kind === 'crystal' && i % 2 === 0) P.shard(x, h - 0.05, z, 0.16 + P.jr() * 0.1, 0.5 + P.jr() * 0.5, (P.jr() - 0.5) * 0.5, (P.jr() - 0.5) * 0.5, P.jr() > 0.5 ? s.cy : s.cy2)
    if (kind === 'outpost') P.box(x, h, z, w, 0.1, d + 0.1, s.c, 'metal')
  }
  const back = v ? [H, H * 0.75, H] : [H, H * 0.8, H]
  wallRun(P, 'x', z0 + t / 2, x0, x1, t, ph, back, cols, wmat, cap)
  wallRun(P, 'z', x0 + t / 2, z0 + t, z1, t, ph, v ? [H * 0.9, H * 0.45, H * 0.7] : [H * 0.85, H * 0.6, H * 0.4], cols, wmat, cap)
  wallRun(P, 'z', x1 - t / 2, z0 + t, z1, t, ph, v ? [H * 0.8, H * 0.55, H * 0.35] : [H, H * 0.7, H * 0.5], cols, wmat, cap)
  // front wall: two stubs around the doorway
  const fz = z1 - t / 2
  const lw = (gx - dw / 2) - x0, rw = x1 - (gx + dw / 2)
  P.box(x0 + lw / 2, ph, fz, lw, H * 0.7 - ph, t, cols[0], wmat); cap(x0 + lw / 2, H * 0.7, fz, lw, t, 0)
  P.box(x1 - rw / 2, ph, fz, rw, H * 0.5 - ph, t, cols[1], wmat); cap(x1 - rw / 2, H * 0.5, fz, rw, t, 1)
  const lintelY = ph + 2.35
  P.box(gx, lintelY, fz, dw + 0.5, 0.45, t + 0.08, kind === 'outpost' ? s.c : cols[0], kind === 'outpost' ? 'metal' : wmat)
  // upper floor with support pillars and a stair
  const zl = z0 + t + (z1 - z0 - 2 * t) * 0.5
  P.box((x0 + x1) / 2, yf - 0.22, (z0 + t + zl) / 2, x1 - x0 - 2 * t + 0.1, 0.22, zl - z0 - t, kind === 'outpost' ? s.c : s.b, kind === 'outpost' ? 'metal' : wmat)
  for (const px of [x0 + t + 0.45, x1 - t - 0.45]) P.cyl(px, ph, zl - 0.2, 0.2, 0.24, yf - 0.22 - ph, s.c, 8, wmat)
  const steps = 3, stepH = (yf - ph) / (steps + 1)
  for (let k = 0; k < steps; k++) P.box(x0 + t + 0.4, ph, zl + 0.25 + k * 0.4, 0.75, stepH * (steps - k), 0.4, s.b, wmat)
  // roof fragment over the back-right corner, resting on the tall walls
  P.box((x1 + 0) / 2 + 0.05, H - 0.2, (z0 + zl) / 2 - 0.1, x1 - 0.0, 0.2, zl - z0 + 0.3, kind === 'outpost' ? s.c : s.c, kind === 'outpost' ? 'metal' : wmat)
  // floor debris + kind decoration
  for (let k = 0; k < 4; k++) P.box(x0 + t + 0.6 + P.jr() * (x1 - x0 - 2 * t - 1.2), ph, zl + 0.4 + P.jr() * 0.8, 0.28 + P.jr() * 0.2, 0.2 + P.jr() * 0.2, 0.25 + P.jr() * 0.2, s.c, wmat, P.jr() * 3)
  if (kind === 'temple') {
    for (const sx of [gx - dw / 2 - 0.12, gx + dw / 2 + 0.12]) P.box(sx, ph + 0.4, z1 + 0.01, 0.07, 1.7, 0.05, GLOW, 'glow')
    P.box(gx, lintelY + 0.18, z1 + 0.01, dw, 0.07, 0.05, GLOW, 'glow')
    P.box((x0 + x1) / 2 + 0.2, yf + 0.5, z0 + t + 0.01, 1.6, 0.07, 0.05, GLOW, 'glow')
    P.box(x0 + t + 0.01, yf + 0.9, zl - 0.6, 0.05, 0.07, 1.0, GLOW, 'glow')
  }
  if (kind === 'outpost') {
    // hazard trim along the header and the door jambs, sandbags in front of the back wall, a firing slit in the right wall
    for (let k = 0; k < 7; k++) P.box(gx - dw / 2 - 0.2 + k * (dw + 0.4) / 6.5, lintelY + 0.45, fz, 0.2, 0.1, t + 0.1, k % 2 ? s.k : s.y, 'hazard')
    for (const jx of [gx - dw / 2 - 0.04, gx + dw / 2 + 0.04]) for (let k = 0; k < 6; k++) P.box(jx, ph + k * 0.38, z1 + 0.005, 0.07, 0.19, 0.04, k % 2 ? s.k : s.y, 'hazard')
    for (let k = 0; k < 4; k++) P.blob(x0 + t + 0.6 + k * 0.62, ph + 0.17, zl + 0.5 + (k % 2) * 0.08, 0.33, 0.17, 0.2, s.bag, 'main', 1, 0.08, { ry: 0 })
    for (let k = 0; k < 3; k++) P.blob(x0 + t + 0.95 + k * 0.62, ph + 0.45, zl + 0.5, 0.3, 0.15, 0.2, s.bag, 'main', 1, 0.08, { ry: 0 })
    P.box(x1 + 0.01, ph + 1.15, (zl + z1) / 2 - 0.2, 0.05, 0.22, 1.1, '#0b0c0d', 'main')
    P.box(x1 + 0.01, ph + 1.1, (zl + z1) / 2 - 0.2, 0.06, 0.04, 1.3, s.c, 'metal')
    P.box(x0 + 0.5, H + 0.0, z0 + 0.5, 0.06, 0.0001, 0.06, s.c, 'metal')
  }
  if (kind === 'crystal') {
    for (const [cx, cz] of [[x0 + t + 0.3, z1 - 0.7], [x1 - 0.6, z1 - 0.5], [x1 - t - 0.5, zl - 0.9]]) for (let k = 0; k < 3; k++) P.shard(cx + (k - 1) * 0.22, ph, cz + (P.jr() - 0.5) * 0.3, 0.14 + P.jr() * 0.1, 0.5 + P.jr() * 0.9, (P.jr() - 0.5) * 0.5, (P.jr() - 0.5) * 0.5, k % 2 ? s.cy : s.cy2)
    P.box(gx, lintelY + 0.2, z1 + 0.01, dw, 0.07, 0.05, s.cy2, 'glow')
  }
  if (kind === 'creep') {
    for (let k = 0; k < 6; k++) P.blob(x0 + 0.4 + P.jr() * (x1 - x0 - 0.8), ph + 0.1, zl + 0.5 + P.jr() * 0.9, 0.2 + P.jr() * 0.12, 0.16, 0.2, s.acid, 'sac', 1, 0.1)
    P.tube([x0 + t, ph + 0.1, z1 - 0.4], [x0 + t + 0.3, H * 0.6, zl + 0.2], 0.07, s.vein, 'gloss')
    P.tube([x1 - t, ph + 0.1, z1 - 0.9], [x1 - t - 0.2, H * 0.5, zl - 0.3], 0.07, s.vein, 'gloss')
    for (const sx of [gx - dw / 2 - 0.1, gx + dw / 2 + 0.1]) P.blob(sx, ph + 0.8, z1 - 0.05, 0.16, 0.5, 0.16, s.vein, 'gloss', 1, 0.1)
  }
}

function hallB(P, kind, v) {
  const { W, D, H } = P, s = PAL[kind], ph = 0.24, i0 = 0.2, t = 0.45
  const x0 = -W / 2 + i0, x1 = W / 2 - i0, z0 = -D / 2 + i0, z1 = D / 2 - i0
  const wmat = kind === 'outpost' ? 'metal' : kind === 'creep' ? 'gloss' : 'main'
  const T = 0.95
  const tops = v ? [H, H * 0.6, H * 0.85, H * 0.7] : [H, H * 0.85, H * 0.7, H * 0.55] // BL, BR, FL, FR
  const spots = [[x0 + T / 2, z0 + T / 2], [x1 - T / 2, z0 + T / 2], [x0 + T / 2, z1 - T / 2], [x1 - T / 2, z1 - T / 2]]
  const wcol = (i) => (i % 2 ? s.b : s.a)
  spots.forEach(([x, z], i) => {
    if (kind === 'creep') { P.cyl(x, ph, z, T * 0.38, T * 0.55, tops[i] - ph, wcol(i), 10, 'gloss'); P.blob(x, tops[i], z, T * 0.42, 0.4, T * 0.42, s.b, 'gloss', 1, 0.2) }
    else if (kind === 'crystal') { P.box(x, ph, z, T, tops[i] - ph, T, wcol(i), 'main'); for (let k = 0; k < 2; k++) P.shard(x + (k - 0.5) * 0.3, tops[i] - 0.05, z, 0.15, 0.55 + k * 0.4, (P.jr() - 0.5) * 0.5, (P.jr() - 0.5) * 0.5, k ? s.cy : s.cy2) }
    else if (kind === 'outpost') { P.box(x, ph, z, T, tops[i] - ph, T, wcol(i) === s.a ? s.a : s.b, 'metal'); P.box(x, tops[i], z, T + 0.1, 0.1, T + 0.1, s.c, 'metal'); for (let k = 0; k < 4; k++) P.box(x, ph + 0.15 + k * 0.4, z, T + 0.02, 0.18, T + 0.02, k % 2 ? s.k : s.y, 'hazard') }
    else { P.box(x, ph, z, T, tops[i] - ph, T, wcol(i), 'main'); P.box(x, tops[i], z, T + 0.14, 0.14, T + 0.14, s.cap, 'main'); P.box(x, tops[i] * 0.55, z + (z > 0 ? T / 2 : -T / 2) + (z > 0 ? 0.01 : -0.01), 0.07, 0.9, 0.05, GLOW, 'glow') }
  })
  // low walls with gaps
  const wallH = 1.5
  const run = (axis, fixed, a0, a1, gaps) => {
    let cur = a0
    for (const [g0, g1] of [...gaps, [a1, a1]]) {
      if (g0 > cur + 0.1) { const c = (cur + g0) / 2, len = g0 - cur; if (axis === 'x') P.box(c, ph, fixed, len, wallH - ph, t, s.c, wmat); else P.box(fixed, ph, c, t, wallH - ph, len, s.c, wmat) }
      cur = g1
    }
  }
  const gxF = v ? -0.9 : 0.6
  run('x', z1 - t / 2, x0 + T, x1 - T, [[gxF - 0.8, gxF + 0.8]])
  run('z', x0 + t / 2, z0 + T, z1 - T, [[0.1 - 0.5, 0.1 + 0.5]])
  run('z', x1 - t / 2, z0 + T, z1 - T, v ? [] : [[-0.1 - 0.5, -0.1 + 0.5]])
  // raised walkway between the back towers with a stair along the left wall
  const yf = Math.round(H * 0.6 * 10) / 10
  P.box(0, yf - 0.24, z0 + 0.65, x1 - x0 - T * 2 + 0.1, 0.24, 1.3, kind === 'outpost' ? s.c : s.b, wmat)
  P.box(0, yf, z0 + 0.15, x1 - x0 - T * 2, 0.55, 0.14, s.c, wmat)
  for (let k = 0; k < 4; k++) P.box(x0 + T + 0.45, ph, z0 + T + 0.35 + k * 0.4, 0.7, ((yf - ph) / 5) * (4 - k), 0.4, s.b, wmat)
  // centre piece
  const cx = v ? 0.3 : -0.2, cz = (z0 + z1) / 2 + 0.2
  P.frustum(cx, ph, cz, 1.7, 1.1, 1.4, 0.8, 0.4, s.b, wmat)
  if (kind === 'temple') { P.cyl(cx, ph + 0.4, cz, 0.18, 0.28, 0.9, s.a, 8); P.cyl(cx, ph + 1.3, cz, 0.0, 0.18, 0.35, s.cap, 8); P.box(cx, ph + 0.95, cz + 0.3, 0.05, 0.45, 0.04, GLOW, 'glow') }
  if (kind === 'outpost') { P.box(cx - 0.3, ph + 0.4, cz, 0.7, 0.55, 0.6, s.a, 'metal'); P.box(cx + 0.4, ph + 0.4, cz, 0.55, 0.4, 0.55, s.b, 'metal'); P.box(cx - 0.3, ph + 0.95, cz, 0.72, 0.08, 0.62, s.y, 'hazard') }
  if (kind === 'crystal') for (let k = 0; k < 5; k++) P.shard(cx + (k - 2) * 0.22, ph + 0.35, cz + (P.jr() - 0.5) * 0.4, 0.15 + P.jr() * 0.08, 0.7 + P.jr() * 1.0, (P.jr() - 0.5) * 0.4, (P.jr() - 0.5) * 0.4, k % 2 ? s.cy : s.cy2)
  if (kind === 'creep') { P.blob(cx, ph + 0.7, cz, 0.6, 0.55, 0.5, s.b, 'gloss'); for (let k = 0; k < 4; k++) P.blob(cx + (k - 1.5) * 0.3, ph + 0.5, cz + 0.45, 0.15, 0.13, 0.15, s.acid, 'sac', 1, 0.1) }
  for (let k = 0; k < 4; k++) P.box(x0 + T + 0.2 + P.jr() * (x1 - x0 - 2 * T - 0.4), ph, z1 - 1.0 + P.jr() * 0.3, 0.3, 0.2, 0.3, s.c, wmat, P.jr() * 3)
}

// (hall B takes variant for its sub-layout switch; A-layout sub-switch is picked by size so every building differs)
function buildingAB(kind, W, D, H, layout, sub, seed) {
  const P = new Piece(W, D, H, seed), s = PAL[kind]
  P.plateRect(s.rim, s.top)
  ;(layout === 'A' ? hallA : hallB)(P, kind, sub)
  return P
}

// ---------- OBSTACLES 5 x 1.2 x 1.6 ----------
function longObstacle(kind, v, seed) {
  const P = new Piece(5, 1.2, 1.6, seed), s = PAL[kind], W = 5, D = 1.2, H = 1.6, ph = 0.24
  P.plateRect(s.rim, s.top)
  if (kind === 'temple') {
    if (!v) { // carved wall: broken sandstone run with a glowing band and a fallen capstone
      const hs = [1.6, 1.2, 1.45, 0.9, 1.3]
      wallRun(P, 'x', 0, -W / 2 + 0.25, W / 2 - 0.25, 0.55, ph, hs, [s.a, s.b], 'main', (x, h, z, w) => P.box(x, h, z, w * 0.7, 0.1, 0.62, s.cap, 'main', (P.jr() - 0.5) * 0.2))
      P.box(0, ph + 0.7, 0.285, W - 0.7, 0.09, 0.03, GLOW, 'glow'); P.box(0, ph + 0.45, 0.285, W - 1.2, 0.05, 0.03, GLOW, 'glow')
      P.box(-1.3, ph, 0.38, 0.55, 0.3, 0.3, s.c, 'main', 0.4)
    } else { // arcade: three stumpy piers with lintels and rubble
      for (const x of [-1.9, -0.6, 0.7, 1.9]) P.box(x, ph, 0, 0.5, [1.2, 1.6, 1.0, 1.35][[-1.9, -0.6, 0.7, 1.9].indexOf(x)] - ph, 0.62, s.a, 'main')
      P.box(-1.25, 1.1, 0, 1.0, 0.36, 0.6, s.b, 'main'); P.box(1.3, 1.0, 0, 1.0, 0.3, 0.6, s.b, 'main', 0.06)
      for (const x of [-1.9, 0.7]) P.box(x, 0, 0.0, 0.0001, 0.0001, 0.0001, s.a)
      for (const x of [-1.9, -0.6, 0.7, 1.9]) P.box(x, 0.9, 0.32, 0.06, 0.5, 0.03, GLOW, 'glow')
      P.box(0.05, ph, 0.35, 0.55, 0.25, 0.3, s.c, 'main', 0.5); P.cyl(-0.3, ph, -0.35, 0.18, 0.2, 0.3, s.b, 9)
    }
  } else if (kind === 'outpost') {
    if (!v) { // barricade: bevelled concrete slab wall, sandbags and a steel shield plate
      P.box(0, ph, 0, W - 0.5, 0.85 - ph, 0.7, '#6d7075', 'main')
      P.frustum(0, 0.85, 0, W - 0.5, 0.7, W - 0.7, 0.5, 0.15, '#7a7d82', 'main')
      for (let k = 0; k < 5; k++) P.blob(-1.8 + k * 0.9, 1.1, 0.0, 0.42, 0.2, 0.28, s.bag, 'main', 1, 0.08, { ry: 0 })
      for (let k = 0; k < 4; k++) P.blob(-1.35 + k * 0.9, 1.4, 0.0, 0.4, 0.18, 0.26, s.bag, 'main', 1, 0.08, { ry: 0 })
      P.box(1.7, ph, 0.0, 0.9, H - ph, 0.12, s.b, 'metal'); P.box(1.7, 1.2, 0.07, 0.6, 0.12, 0.02, '#0b0c0d', 'main')
      for (let k = 0; k < 5; k++) P.box(-1.9 + k * 0.5, ph + 0.1, 0.36, 0.25, 0.14, 0.04, k % 2 ? s.k : s.y, 'hazard')
    } else { // gate fence: two steel posts, mesh panels, hazard barrier
      for (const x of [-2.1, 0, 2.1]) P.box(x, ph, 0, 0.3, H - ph, 0.4, s.b, 'metal')
      for (const x of [-1.05, 1.05]) { P.box(x, 0.9, 0, 1.8, 0.1, 0.1, s.c, 'metal'); P.box(x, 1.45, 0, 1.8, 0.1, 0.1, s.c, 'metal'); for (let k = -3; k <= 3; k++) P.box(x + k * 0.25, 0.9, 0, 0.05, 0.65, 0.05, s.c, 'metal') }
      P.box(0, ph, 0.35, 4.3, 0.55, 0.25, s.a, 'metal')
      for (let k = 0; k < 9; k++) P.box(-2.0 + k * 0.5, ph + 0.3, 0.48, 0.25, 0.2, 0.02, k % 2 ? s.k : s.y, 'hazard')
      P.box(2.1, H, 0, 0.36, 0.1, 0.44, s.y, 'hazard'); P.box(-2.1, H, 0, 0.36, 0.1, 0.44, s.y, 'hazard')
    }
  } else if (kind === 'crystal') {
    P.blob(0, ph + 0.35, 0, 2.3, 0.55, 0.5, s.a, 'main', 1, 0.2); P.blob(-1.3, ph + 0.5, 0.05, 1.0, 0.55, 0.45, s.b, 'main', 1, 0.22); P.blob(1.4, ph + 0.4, -0.05, 1.0, 0.5, 0.45, s.a, 'main', 1, 0.22)
    const n = v ? 7 : 9
    for (let k = 0; k < n; k++) { const x = -2.0 + (k + (P.jr() - 0.5) * 0.5) * (4.0 / (n - 1)); const hh = v ? 0.5 + P.jr() * 0.6 : 0.8 + (k % 3 === 1 ? 0.7 : P.jr() * 0.4); P.shard(x, ph + 0.45, (P.jr() - 0.5) * 0.4, 0.17 + P.jr() * 0.1, Math.min(hh, H - ph - 0.45), (P.jr() - 0.5) * 0.45, (P.jr() - 0.5) * 0.45, k % 2 ? s.cy : s.cy2) }
    if (v) { P.box(0, ph + 0.7, 0.0, W - 1.0, 0.0001, 0.0001, s.a); P.box(-0.2, ph, 0.0, 1.0, 1.5 - ph, 0.5, s.b, 'main') }
  } else { // creep
    if (!v) { // spine ridge: ridged biomass with a row of curved bone spines
      P.blob(0, ph + 0.3, 0, 2.3, 0.55, 0.5, s.a, 'gloss', 1, 0.16)
      for (let k = 0; k < 7; k++) { const x = -2.0 + k * 0.67; P.shard(x, ph + 0.45, (k % 2 ? 0.12 : -0.12), 0.17, 0.7 + (k % 3) * 0.28, (k % 2 ? 0.2 : -0.2), 0.0, '#c9b9a0', 'main', 5) }
      for (let k = 0; k < 3; k++) P.blob(-1.4 + k * 1.4, ph + 0.3, 0.38, 0.2, 0.17, 0.2, s.acid, 'sac', 1, 0.1)
      P.tube([-2.2, ph + 0.2, 0.3], [2.2, ph + 0.5, -0.3], 0.07, s.vein, 'gloss')
    } else { // chitin wall: plated segments with sacs
      for (let k = 0; k < 5; k++) { const hh = [1.5, 1.1, 1.6, 1.0, 1.35][k]; P.blob(-2 + k * 1.0, ph + hh / 2 - 0.1, 0, 0.58, hh / 2 + 0.1, 0.52, k % 2 ? s.b : s.a, 'gloss', 1, 0.12) }
      for (let k = 0; k < 4; k++) P.blob(-1.5 + k * 1.0, ph + 0.35, 0.4 * (k % 2 ? -1 : 1), 0.2, 0.2, 0.2, s.acid, 'sac', 1, 0.1)
      P.tube([-2.3, ph + 0.15, 0.35], [2.3, ph + 0.15, 0.35], 0.06, s.vein, 'gloss')
    }
  }
  return P
}

// ---------- OBSTACLES 3 x 2 x 1.8 ----------
function smallObstacle(kind, v, seed) {
  const P = new Piece(3, 2, 1.8, seed), s = PAL[kind], H = 1.8, ph = 0.24
  P.plateRect(s.rim, s.top)
  if (kind === 'temple') {
    if (!v) { // fallen drums and a broken statue plinth
      P.box(-0.6, ph, -0.1, 1.1, 1.1 - ph, 1.0, s.a, 'main'); P.box(-0.6, 1.1, -0.1, 1.25, 0.15, 1.15, s.cap, 'main')
      P.cyl(-0.6, 1.25, -0.1, 0.0, 0.25, 0.55, s.b, 8)
      P.cyl(0.8, ph, 0.3, 0.38, 0.4, 0.5, s.a, 12); P.cyl(0.55, ph + 0.5, 0.2, 0.32, 0.36, 0.45, s.b, 12); P.cyl(0.9, ph, -0.5, 0.4, 0.4, 0.4, s.b, 12, 'main', { rz: Math.PI / 2, ry: 0.3 })
      P.box(-0.6, 0.55, 0.45, 0.8, 0.07, 0.04, GLOW, 'glow'); P.box(0, H, 0.0, 0.2, 0.0001, 0.2, s.a)
    } else { // altar: stepped block with glowing channel and two stumps
      P.frustum(0, ph, 0, 2.3, 1.5, 2.0, 1.3, 0.35, s.b, 'main'); P.box(0, 0.59, 0, 1.6, 0.6, 1.0, s.a, 'main'); P.box(0, 1.19, 0, 1.8, 0.14, 1.2, s.cap, 'main')
      P.box(0, 0.8, 0.51, 1.0, 0.07, 0.03, GLOW, 'glow'); P.box(0, 1.33, 0.0, 1.2, 0.04, 0.12, GLOW, 'glow')
      P.cyl(-0.8, 1.33, -0.3, 0.2, 0.23, 0.47, s.a, 8); P.cyl(0.8, 1.33, 0.2, 0.2, 0.24, 0.3, s.b, 8)
      P.cyl(0, 1.33, -0.35, 0.0, 0.32, 0.47, s.cap, 8)
    }
  } else if (kind === 'outpost') {
    if (!v) { // fuel tanks: two olive tanks with black bands and a yellow cradle
      for (const [x, z] of [[-0.65, 0], [0.7, -0.1]]) {
        P.cyl(x, ph + 0.05, z, 0.5, 0.5, H - ph - 0.35, s.a, 14, 'metal'); P.blob(x, H - 0.3, z, 0.5, 0.2, 0.5, s.a, 'metal', 1, 0.01)
        P.cyl(x, 0.6, z, 0.52, 0.52, 0.14, s.k, 14, 'metal'); P.cyl(x, 1.1, z, 0.52, 0.52, 0.14, s.y, 14, 'hazard'); P.cyl(x, H - 0.1, z, 0.12, 0.14, 0.14, s.c, 8, 'metal')
      }
      P.box(0, ph + 0.05, 0.62, 2.4, 0.18, 0.2, s.y, 'hazard'); P.tube([-0.65, 1.75, 0], [0.7, 1.7, -0.1], 0.05, s.c, 'metal'); P.box(0.0, ph, 0.82, 0.6, 0.0001, 0.1, s.k)
    } else { // crate stack: stencil-banded containers
      P.box(-0.5, ph, 0.0, 1.5, 0.62, 1.1, s.a, 'metal'); P.box(0.7, ph, -0.3, 1.0, 0.62, 1.0, s.b, 'metal'); P.box(-0.5, ph + 0.62, 0.0, 1.5, 0.62, 1.1, s.b, 'metal', 0.1); P.box(0.7, ph + 0.62, -0.3, 1.0, 0.62, 1.0, s.a, 'metal', -0.12)
      P.box(-0.1, ph + 1.24, 0.1, 1.0, 0.3, 0.8, s.c, 'metal', 0.3)
      for (let k = 0; k < 3; k++) P.box(-0.5 + (k - 1) * 0.45, ph + 0.31, 0.56, 0.1, 0.5, 0.02, s.y, 'hazard')
      P.box(0.7, ph + 0.31, 0.21, 0.7, 0.1, 0.02, s.y, 'hazard')
    }
  } else if (kind === 'crystal') {
    if (!v) { // mineral vent: dark rock with a glowing fissure and cyan shards
      P.blob(0, ph + 0.5, 0, 1.2, 0.7, 0.8, s.a, 'main', 1, 0.2); P.blob(-0.8, ph + 0.35, 0.2, 0.6, 0.45, 0.5, s.b, 'main', 1, 0.2); P.blob(0.85, ph + 0.35, -0.2, 0.55, 0.4, 0.5, s.b, 'main', 1, 0.2)
      P.box(0, 1.0, 0.05, 0.85, 0.05, 0.1, s.cy2, 'glow')
      for (let k = 0; k < 7; k++) P.shard((k - 3) * 0.28, 1.05, (P.jr() - 0.5) * 0.5, 0.14 + P.jr() * 0.07, 0.5 + P.jr() * 0.55, (P.jr() - 0.5) * 0.5, (P.jr() - 0.5) * 0.5, k % 2 ? s.cy : s.cy2)
    } else { // shard heap
      P.blob(0, ph + 0.25, 0, 1.2, 0.4, 0.8, s.a, 'main', 1, 0.2)
      for (let k = 0; k < 9; k++) { const a = (k / 9) * 6.28; const rr = 0.2 + (k % 3) * 0.28; P.shard(Math.cos(a) * rr, ph + 0.3, Math.sin(a) * rr * 0.7, 0.16 + P.jr() * 0.1, Math.min(0.7 + (k % 4) * 0.2, H - ph - 0.3), Math.cos(a) * 0.35, -Math.sin(a) * 0.35, k % 2 ? s.cy : s.cy2) }
    }
  } else {
    if (!v) { // egg-sac pods
      for (const [x, z, r] of [[-0.8, 0.1, 0.5], [0.0, -0.3, 0.62], [0.85, 0.2, 0.46], [0.1, 0.5, 0.36]]) { P.blob(x, ph + r * 0.95, z, r * 0.9, r * 1.2, r * 0.9, P.jr() > 0.5 ? s.b : s.a, 'gloss', 1, 0.07); P.blob(x, ph + r * 1.55, z, r * 0.45, r * 0.38, r * 0.45, s.acid, 'sac', 1, 0.07) }
      P.blob(0, ph + 0.1, 0, 1.3, 0.14, 0.9, s.c, 'gloss', 1, 0.12); P.tube([-1.2, ph + 0.15, 0.6], [1.2, ph + 0.15, -0.6], 0.06, s.vein, 'gloss')
    } else { // tumour: tall veined lump with sacs
      P.blob(0, ph + 0.7, 0, 0.9, 0.85, 0.7, s.a, 'gloss', 2, 0.14); P.blob(-0.8, ph + 0.35, 0.2, 0.5, 0.4, 0.45, s.b, 'gloss', 1, 0.14); P.blob(0.8, ph + 0.4, 0.0, 0.5, 0.45, 0.45, s.b, 'gloss', 1, 0.14)
      for (let k = 0; k < 4; k++) P.blob(-0.5 + k * 0.4, ph + 0.15, 0.55, 0.14, 0.14, 0.14, s.acid, 'sac', 1, 0.1)
      P.blob(0.0, H - 0.2, 0, 0.3, 0.2, 0.3, s.acid, 'sac', 1, 0.1)
      P.tube([-0.6, ph + 0.4, 0.4], [0, H - 0.3, 0.1], 0.06, s.vein, 'gloss'); P.tube([0.7, ph + 0.4, 0.2], [0.1, H - 0.4, -0.2], 0.06, s.vein, 'gloss')
    }
  }
  return P
}

// ---------- OBSTRUCTIONS: round plinth, diameter 2r, height h ----------
function roundPiece(kind, v, seed, r = 1.7, H = 3) {
  const P = new Piece(2 * r, 2 * r, H, seed), s = PAL[kind], ph = 0.24
  P.plateRound(s.rim, s.top)
  if (kind === 'temple') {
    if (!v) { // broken column stumps and fallen drums on a flagstone plinth
      const cols = [[0, 0, 0.5, 3.0], [-0.85, 0.55, 0.42, 1.8], [0.85, 0.5, 0.4, 1.25], [0.55, -0.95, 0.38, 2.1]]
      for (const [x, z, rad, h] of cols) { P.cyl(x, ph, z, rad * 1.2, rad * 1.3, 0.3, s.b, 12); P.cyl(x, ph + 0.3, z, rad * 0.95, rad * 1.05, h - ph - 0.3, s.a, 12); if (h < 2.9) P.box(x, h - 0.03, z, rad * 1.4, 0.06, rad * 1.1, s.cap, 'main', P.jr() * 3) }
      P.cyl(0, 2.55, 0, 0.62, 0.55, 0.45, s.cap, 12); P.cyl(0, 2.97, 0, 0.5, 0.62, 0.0001 + 0.03, s.cap, 12)
      P.cyl(-0.7, ph, -0.8, 0.38, 0.38, 0.55, s.b, 12, 'main', { rz: Math.PI / 2, ry: 0.5 }); P.cyl(0.0, ph, 1.05, 0.34, 0.34, 0.5, s.a, 12, 'main', { rz: Math.PI / 2, ry: -0.3 })
      for (const [x, z] of [[0.5, 0], [-0.5, 0]]) P.box(x * 1.0, 1.4, z + 0.0, 0.0001, 0.0001, 0.0001, s.a)
      P.box(0, 1.2, 0.5, 0.06, 1.0, 0.04, GLOW, 'glow'); P.box(-0.85, 0.9, 1.0, 0.05, 0.6, 0.04, GLOW, 'glow', 0.5)
      for (let k = 0; k < 5; k++) P.box(Math.cos(k * 1.25) * 1.35, ph, Math.sin(k * 1.25) * 1.35, 0.28, 0.18, 0.24, s.c, 'main', P.jr() * 3)
    } else { // monolith ring
      P.box(0, ph, 0, 0.95, 3 - ph, 0.7, s.a, 'main', 0.2); P.box(0, 2.9, 0, 1.05, 0.1, 0.8, s.cap, 'main', 0.2)
      P.frustum(0, 2.8, 0, 0.0001 + 1.0, 0.75, 0.55, 0.4, 0.2, s.cap, 'main', 0.2)
      for (let k = 0; k < 4; k++) { const a = 0.9 + k * 1.55, rr = 1.1; P.box(Math.cos(a) * rr, ph, Math.sin(a) * rr, 0.42, [1.7, 1.2, 1.9, 0.8][k] - ph, 0.36, k % 2 ? s.b : s.a, 'main', a) }
      P.box(0, 0.9, 0.36, 0.07, 1.6, 0.03, GLOW, 'glow', 0.2); P.box(0, 2.2, 0.38, 0.5, 0.06, 0.03, GLOW, 'glow', 0.2)
      for (let k = 0; k < 4; k++) P.box(Math.cos(k * 1.6 + 0.4) * 1.3, ph, Math.sin(k * 1.6 + 0.4) * 1.3, 0.26, 0.15, 0.22, s.c, 'main', P.jr() * 3)
    }
  } else if (kind === 'outpost') {
    if (!v) { // storage silo with ladder and hazard bands
      const rr = r - 0.35
      P.cyl(0, ph, 0, rr, rr + 0.05, 2.2, s.b, 20, 'metal'); P.cyl(0, 2.4, 0, rr * 0.6, rr, 0.5, s.b, 20, 'metal'); P.cyl(0, 2.45 + 0.4, 0, 0.0, rr * 0.6, 0.15, s.c, 20, 'metal')
      P.cyl(0, 0.5, 0, rr + 0.04, rr + 0.04, 0.2, s.y, 20, 'hazard'); P.cyl(0, 1.7, 0, rr + 0.04, rr + 0.04, 0.2, s.k, 20, 'hazard')
      for (let k = 0; k < 8; k++) P.tube([rr + 0.05, ph + k * 0.35, 0.0], [rr + 0.05, ph + k * 0.35 + 0.0001, 0.35], 0.04, s.c, 'metal')
      P.box(rr + 0.08, ph, 0.18, 0.05, 2.6, 0.04, s.c, 'metal'); P.box(rr + 0.08, ph, -0.18, 0.05, 2.6, 0.04, s.c, 'metal')
      P.tube([0, 2.9, 0], [0, 3.0, 0], 0.03, s.c, 'metal'); P.cyl(0, 2.95, 0, 0.12, 0.12, 0.05, s.y, 8, 'hazard')
      P.cyl(-0.9, ph, -0.9, 0.3, 0.3, 0.7, s.a, 10, 'metal'); P.box(0.9, ph, 0.9, 0.7, 0.5, 0.5, s.y, 'hazard', 0.4)
    } else { // comm dish on a generator plinth
      P.cyl(0, ph, 0, 1.2, 1.3, 0.7, s.b, 14, 'metal'); P.cyl(0, 0.94, 0, 0.9, 1.2, 0.25, s.c, 14, 'metal')
      P.cyl(0, 1.19, 0, 0.22, 0.28, 1.2, s.c, 8, 'metal')
      const dish = new Piece(1, 1, 1, 1)
      P.cyl(0.15, 2.4, 0, 1.15, 0.2, 0.55, '#8d9296', 18, 'metal', { rz: 0.9, ry: 0.0 })
      P.cyl(0.55, 2.8, 0, 0.12, 0.12, 0.2, s.y, 8, 'hazard', { rz: 0.9 })
      P.tube([0.5, 2.9, 0], [0, 2.4, 0], 0.04, s.c, 'metal'); P.tube([0, 2.4, 0.6], [0, 2.4, 0], 0.03, s.c, 'metal')
      for (let k = 0; k < 3; k++) P.box(Math.cos(k * 2.1 + 0.6) * 0.95, 1.0, Math.sin(k * 2.1 + 0.6) * 0.95, 0.35, 0.5, 0.35, s.a, 'metal', k)
      for (let k = 0; k < 8; k++) P.box(Math.cos(k * 0.785) * 1.28, ph + 0.1, Math.sin(k * 0.785) * 1.28, 0.2, 0.14, 0.04, k % 2 ? s.k : s.y, 'hazard', -k * 0.785 + 1.57)
      void dish
    }
  } else if (kind === 'crystal') {
    if (!v) { // mineral cluster: big central crystal, satellites, rock base filling the plinth
      P.blob(0, ph + 0.3, 0, r - 0.25, 0.45, r - 0.25, s.a, 'main', 1, 0.14)
      P.shard(0, ph + 0.25, 0, 0.5, 2.75, 0.05, 0.03, s.cy2, 'crystal', 6)
      const sat = [[0.75, 0.25, 0.3, 1.9], [-0.7, 0.4, 0.34, 1.6], [0.2, -0.85, 0.3, 2.1], [-0.55, -0.7, 0.26, 1.2], [1.05, -0.5, 0.24, 1.0], [-1.1, -0.1, 0.24, 1.3], [0.1, 1.05, 0.26, 1.1]]
      sat.forEach(([x, z, rad, h], k) => P.shard(x, ph + 0.3, z, rad, Math.min(h, H - ph - 0.3), -z * 0.25, x * 0.25, k % 2 ? s.cy : s.deep))
      for (let k = 0; k < 6; k++) { const a = k * 1.1 + 0.3; P.shard(Math.cos(a) * 1.3, ph + 0.15, Math.sin(a) * 1.3, 0.11, 0.4 + (k % 3) * 0.12, Math.sin(a) * 0.3, -Math.cos(a) * 0.3, s.cy) }
    } else { // geode: broken rock ring around a glowing crystal bed
      for (let k = 0; k < 7; k++) { const a = k * 0.9, rr = 1.05; P.blob(Math.cos(a) * rr, ph + 0.55, Math.sin(a) * rr, 0.55, 0.45 + (k % 3) * 0.3, 0.5, k % 2 ? s.a : s.b, 'main', 1, 0.2) }
      P.blob(0, ph + 0.1, 0, 1.0, 0.18, 1.0, s.deep, 'crystal', 1, 0.05)
      for (let k = 0; k < 8; k++) { const a = k * 0.8 + 0.2, rr = k < 3 ? 0.0 : 0.55; P.shard(Math.cos(a) * rr, ph + 0.15, Math.sin(a) * rr, 0.2 + (k < 3 ? 0.12 : 0), Math.min([2.6, 1.7, 1.9, 1.3, 1.1, 1.5, 1.0, 1.2][k], H - ph - 0.15), Math.cos(a) * 0.3, Math.sin(a) * 0.3, k % 2 ? s.cy : s.cy2) }
    }
  } else {
    if (!v) { // creep mound: glossy biomass dome with vein ridges and acid sacs
      P.blob(0, ph + 0.6, 0, r - 0.2, 1.0, r - 0.2, s.a, 'gloss', 2, 0.1)
      P.blob(0, ph + 1.5, 0, 1.0, 1.0, 1.0, s.b, 'gloss', 2, 0.14); P.blob(0.1, 2.5, 0, 0.55, 0.6, 0.55, s.a, 'gloss', 1, 0.15)
      for (let k = 0; k < 6; k++) { const a = k * 1.047 + 0.3; P.tube([Math.cos(a) * 1.5, ph + 0.15, Math.sin(a) * 1.5], [Math.cos(a) * 0.7, 1.9, Math.sin(a) * 0.7], 0.09, s.vein, 'gloss'); P.tube([Math.cos(a) * 0.7, 1.9, Math.sin(a) * 0.7], [Math.cos(a + 0.3) * 0.2, 2.8, Math.sin(a + 0.3) * 0.2], 0.07, s.vein, 'gloss') }
      for (let k = 0; k < 7; k++) { const a = k * 0.9 + 0.1, rr = 1.0 + (k % 2) * 0.3; P.blob(Math.cos(a) * rr, 1.1 + (k % 3) * 0.3, Math.sin(a) * rr, 0.2, 0.2, 0.2, s.acid, 'sac', 1, 0.08) }
    } else { // spore spire
      P.blob(0, ph + 0.35, 0, r - 0.25, 0.5, r - 0.25, s.a, 'gloss', 2, 0.1)
      P.cyl(0, ph + 0.3, 0, 0.18, 0.7, 2.4, s.b, 9, 'gloss'); P.cyl(0, 2.6, 0, 0.0001, 0.18, 0.4, s.b, 9, 'gloss')
      P.blob(0, 2.55, 0, 0.5, 0.4, 0.5, s.acid, 'sac', 1, 0.1)
      for (let k = 0; k < 5; k++) { const a = k * 1.256; P.cyl(Math.cos(a) * 0.9, ph + 0.2, Math.sin(a) * 0.9, 0.04, 0.22, 1.4 + (k % 2) * 0.5, s.b, 7, 'gloss', { rz: Math.cos(a) * -0.28, rx: Math.sin(a) * 0.28 }); P.blob(Math.cos(a) * 0.9, 1.7 + (k % 2) * 0.5, Math.sin(a) * 0.9, 0.12, 0.12, 0.12, s.acid, 'sac', 1, 0.05) }
      P.tube([1.1, ph + 0.15, 0.3], [0.5, 1.2, 0.0], 0.08, s.vein, 'gloss'); P.tube([-0.9, ph + 0.15, -0.7], [-0.3, 1.2, 0], 0.08, s.vein, 'gloss')
    }
  }
  return P
}

// ---------- extras at the demo-table sizes (src/engine/setup.ts demoTerrain) ----------
function extras() {
  const out = []
  { // temple-collapsed-arch 7x4x4 : hall with a broken span
    const P = new Piece(7, 4, 4, 91), s = PAL.temple, ph = P.plateRect(s.rim, s.top)
    hallA(P, 'temple', 1)
    out.push(['temple-collapsed-arch', P, 'temple', 'building', 'rect'])
  }
  { // outpost-containers 4x3x2.5
    const P = new Piece(4, 3, 2.5, 92), s = PAL.outpost, ph = P.plateRect(s.rim, s.top)
    const stack = [[-1.0, -0.6, s.a, 0], [0.5, -0.7, s.b, 0.05], [-0.9, 0.7, s.b, -0.05], [1.0, 0.65, s.a, 0.08]]
    stack.forEach(([x, z, c, ry]) => { P.box(x, ph, z, 1.8, 0.9, 0.9, c, 'metal', ry); for (let k = -3; k <= 3; k++) P.box(x + k * 0.22, ph + 0.45, z + 0.46, 0.05, 0.7, 0.02, s.c, 'metal', ry) })
    P.box(-0.4, ph + 0.9, -0.5, 1.8, 0.9, 0.9, s.b, 'metal', 0.1); P.box(-0.4, ph + 1.8, -0.5, 1.6, 0.46, 0.8, s.a, 'metal', 0.1)
    for (let k = 0; k < 4; k++) P.box(-1.2 + k * 0.5, ph + 0.05, 1.3, 0.22, 0.1, 0.1, k % 2 ? s.k : s.y, 'hazard')
    out.push(['outpost-containers', P, 'outpost', 'obstacle', 'rect'])
  }
  { // outpost-blast-wall 10x1.2x3.5
    const P = new Piece(10, 1.2, 3.5, 93), s = PAL.outpost, ph = P.plateRect(s.rim, s.top)
    for (let k = 0; k < 6; k++) { const x = -4.4 + k * 1.76; P.box(x, ph, 0, 1.64, [3.5, 2.8, 3.1, 3.5, 2.6, 3.2][k] - ph, 0.62, k % 2 ? s.b : s.c, 'metal'); P.box(x, [3.5, 2.8, 3.1, 3.5, 2.6, 3.2][k], 0, 1.7, 0.1, 0.7, s.c, 'metal'); for (let j = 0; j < 4; j++) P.box(x, ph + 0.15 + j * 0.3, 0.325, 1.6, 0.12, 0.02, j % 2 ? s.k : s.y, 'hazard') }
    out.push(['outpost-blast-wall', P, 'outpost', 'obstacle', 'rect'])
  }
  { // crystal-rock-outcrop r2 h3
    const P = roundPiece('crystal', 0, 94, 2, 3)
    out.push(['crystal-rock-outcrop', P, 'crystal', 'obstruction', 'circle'])
  }
  return out
}

// ---------- catalogue ----------
const SETS = {
  temple: { b64: ['temple-stepped-platform', 'temple-colonnade'], b55: ['temple-shrine', 'temple-ziggurat'], o51: ['temple-carved-wall', 'temple-arcade'], o32: ['temple-rubble-drums', 'temple-altar'], c: ['temple-broken-pillars', 'temple-monolith'] },
  outpost: { b64: ['outpost-bunker', 'outpost-depot'], b55: ['outpost-comm-tower', 'outpost-generator'], o51: ['outpost-barricade', 'outpost-gate-fence'], o32: ['outpost-fuel-tanks', 'outpost-crate-stack'], c: ['outpost-silo', 'outpost-dish'] },
  crystal: { b64: ['crystal-sanctum', 'crystal-cavern'], b55: ['crystal-spire-hall', 'crystal-shrine'], o51: ['crystal-ridge', 'crystal-rock-fence'], o32: ['crystal-vent-rock', 'crystal-shard-heap'], c: ['crystal-mineral-cluster', 'crystal-geode'] },
  creep: { b64: ['creep-hive-hall', 'creep-brood-chamber'], b55: ['creep-spore-nest', 'creep-sac-hall'], o51: ['creep-spine-ridge', 'creep-chitin-wall'], o32: ['creep-pods', 'creep-tumour'], c: ['creep-mound', 'creep-spore-spire'] },
}

const pieces = []
let seed = 100
for (const [kind, g] of Object.entries(SETS)) {
  for (const v of [0, 1]) {
    pieces.push([g.b64[v], buildingAB(kind, 6, 4, 4, v ? 'B' : 'A', v, seed++), kind, 'building', 'rect'])
    pieces.push([g.b55[v], buildingAB(kind, 5, 5, 4, v ? 'B' : 'A', 1 - v, seed++), kind, 'building', 'rect'])
    pieces.push([g.o51[v], longObstacle(kind, v, seed++), kind, 'obstacle', 'rect'])
    pieces.push([g.o32[v], smallObstacle(kind, v, seed++), kind, 'obstacle', 'rect'])
    pieces.push([g.c[v], roundPiece(kind, v, seed++), kind, 'obstruction', 'circle'])
  }
}
pieces.push(...extras())

// Slugs rebuilt by the Hunyuan terrain pass (tools/models/terrain/pieces.json) keep their GLB; only their manifest row is written here.
const HUNYUAN = new Set(Object.keys(JSON.parse(readFileSync('tools/models/terrain/pieces.json', 'utf8'))).filter((k) => !k.startsWith('_')))
for (const f of readdirSync(OUT)) if (f.endsWith('.glb') && !HUNYUAN.has(f.slice(0, -4))) unlinkSync(`${OUT}/${f}`)
mkdirSync(OUT, { recursive: true })
const manifest = {}, catalog = []
let bad = 0
for (const [slug, P, theme, rulesType, shape] of pieces) {
  const prims = P.build(), bb = bboxOf(prims)
  const size = [P.W, P.D, P.H]
  const got = [bb.max.x - bb.min.x, bb.max.z - bb.min.z, bb.max.y - bb.min.y]
  const off = [Math.abs(bb.min.x + bb.max.x) / 2, Math.abs(bb.min.z + bb.max.z) / 2, Math.abs(bb.min.y)]
  const err = got.map((v, i) => Math.abs(v - size[i]))
  if (err[0] > 0.02 || err[1] > 0.02 || err[2] > 0.06 || off[0] > 0.02 || off[1] > 0.02 || off[2] > 0.001) { bad++; console.log('BBOX', slug, 'want', size, 'got', got.map((n) => +n.toFixed(3)), 'off', off.map((n) => +n.toFixed(3))) }
  if (!HUNYUAN.has(slug)) writeFileSync(`${OUT}/${slug}.glb`, toGlb(prims))
  manifest[slug] = { file: `${slug}.glb`, size, rulesType, theme, footprint: shape === 'circle' ? { circle: { r: P.W / 2 } } : { rect: { w: P.W, d: P.D } } }
  catalog.push({ slug, theme, rulesType, footprint: shape === 'circle' ? [P.W / 2] : [P.W, P.D], height: P.H })
}
writeFileSync(`${OUT}/manifest.json`, JSON.stringify(manifest, null, 1))
writeFileSync('art/terrain/catalog.json', JSON.stringify(catalog, null, 1))
console.log(`wrote ${pieces.length} models, ${bad} bbox problems`)
