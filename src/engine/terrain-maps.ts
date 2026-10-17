// Hand-designed map layouts (TER-001 alongside the generated stand-ins). "Sunken Shrine": an original, point-symmetric
// temple table: a raised central plateau (High Ground, Size 3) with four ramps, mirrored outer ruins and LoS blockers.
// Pure data plus a placer. Every outer piece is listed once for the z<0 half and mirrored by a half turn about the table
// centre (id "x" and "xm", the same pairing the generated maps and terrainFit use). Layout tuning, not rules; the Core Rules
// limits it respects are: pieces stay clear of every Mission Marker's control radius (a Marker may sit on the plateau or a
// ramp: MID / HIGH GROUND is legal) and clear of the table edges, and the plateau has an ACCESS POINT at every ramp top.
import type { MarkerState, TerrainInstance, TerrainRulesType, Vec2 } from './types'
import { distToShape, worldShape } from './terrain'

/** Marker control radius used for spacing (inches). */
export const MARKER_CLEAR = 3
/** Smallest gap kept between any hand-placed piece and the table edge. */
export const EDGE_CLEAR = 2.5

type Foot = { rect: { w: number; d: number } } | { circle: { r: number } }
interface Spec {
  name: string
  type: TerrainRulesType
  foot: Foot
  h: number
  x: number
  z: number
  rot?: number
  props?: Record<string, unknown>
}
interface Layout {
  /** Table size this layout is drawn for. */
  w: number
  d: number
  /** Map-roll result that picks it. */
  variant: number
  /** Centre structure: placed as listed, never filtered (Markers may stand on it). */
  centre: Spec[]
  /** Outer pieces for the z<0 half; each is mirrored by a half turn and dropped as a pair if it would crowd a Marker. */
  half: Spec[]
}

const rect = (w: number, d: number): Foot => ({ rect: { w, d } })
const circle = (r: number): Foot => ({ circle: { r } })
const HALF_PI = Math.PI / 2

/** A ramp (Size 1, MID GROUND) whose high end meets the plateau; `top` and `bottom` are its ACCESS POINTS in world space. */
function ramp(name: string, x: number, z: number, rot: number, len: number, wid: number, h: number): Spec {
  // local +x is the high end; world direction of local +x is (cos rot, -sin rot)
  const dx = Math.cos(rot), dz = -Math.sin(rot)
  return {
    name, type: 'obstacle', foot: rect(len, wid), h, x, z, rot,
    props: {
      size: 1, ramp: true, blocksLos: false, cover: false, topElev: h,
      accessPoints: [{ x: x - dx * len / 2, z: z - dz * len / 2 }, { x: x + dx * len / 2, z: z + dz * len / 2 }],
    },
  }
}

function centreOf(pw: number, pd: number, ph: number, rl: number, rw: number): Spec[] {
  const gx = pw / 2, gz = pd / 2 // plateau edges
  const rx = gx + rl / 2, rz = gz + rl / 2
  return [
    {
      name: 'plateau', type: 'building', foot: rect(pw, pd), h: ph, x: 0, z: 0,
      props: { size: 3, plateau: true, walkable: true, topElev: ph, accessPoints: [{ x: -gx, z: 0 }, { x: gx, z: 0 }, { x: 0, z: -gz }, { x: 0, z: gz }] },
    },
    ramp('ramp-w', -rx, 0, 0, rl, rw, ph),
    ramp('ramp-e', rx, 0, Math.PI, rl, rw, ph),
    ramp('ramp-n', 0, -rz, -HALF_PI, rl, rw, ph),
    ramp('ramp-s', 0, rz, HALF_PI, rl, rw, ph),
  ]
}

// Dimensions match the temple GLB footprints in public/assets/terrain/manifest.json so the models fit without stretching.
export const HAND_LAYOUTS: Record<'skirmish' | 'standard', Layout> = {
  skirmish: {
    w: 36, d: 36, variant: 4,
    centre: centreOf(5, 5, 4, 5, 3.5),
    half: [
      { name: 'a', type: 'building', foot: rect(6, 4), h: 4, x: -8.5, z: -9, props: { size: 2 } }, // stepped platform ruin
      { name: 'b', type: 'obstacle', foot: rect(5, 1.2), h: 1.6, x: 0, z: -13 }, // carved wall
      { name: 'c', type: 'obstruction', foot: circle(1.7), h: 3, x: -13.5, z: -4.5 }, // broken pillars
    ],
  },
  standard: {
    w: 54, d: 36, variant: 7,
    centre: centreOf(6, 5, 4, 7, 4),
    half: [
      { name: 'a', type: 'building', foot: rect(6, 4), h: 4, x: -18, z: -7, props: { size: 2 } }, // stepped platform ruin
      { name: 'b', type: 'building', foot: rect(7, 4), h: 4, x: -20, z: -13.5, props: { size: 2 } }, // collapsed arch
      { name: 'c', type: 'obstacle', foot: rect(5, 1.2), h: 1.6, x: -9, z: -13 }, // carved wall
      { name: 'd', type: 'obstruction', foot: circle(1.7), h: 3, x: -13, z: -2.5 }, // broken pillars
    ],
  },
}

/** The hand layout drawn for this table and map-roll result, or null (a generated map). */
export function handLayoutFor(variant: number, table: { w: number; d: number }): Layout | null {
  return Object.values(HAND_LAYOUTS).find((l) => l.variant === variant && l.w === table.w && l.d === table.d) ?? null
}

const make = (variant: number, s: Spec, id: string, pos: Vec2): TerrainInstance => ({
  id, pieceId: id, rulesType: s.type, pos, rot: s.rot ?? 0, height: s.h, footprint: s.foot, props: { set: 'temple', ...(s.props ?? {}) }, // `set`: cosmetic, the board draws the hand layout from the temple models only
})

/** Place a hand layout for the Markers of the chosen Deployment. Deterministic: depends only on the layout and the Markers. */
export function placeHandLayout(l: Layout, markers: readonly MarkerState[]): TerrainInstance[] {
  const out: TerrainInstance[] = l.centre.map((s) => make(l.variant, s, `map${l.variant}-${s.name}`, { x: s.x, z: s.z }))
  for (const s of l.half) {
    const a = make(l.variant, s, `map${l.variant}-${s.name}`, { x: s.x, z: s.z })
    const b = make(l.variant, s, `map${l.variant}-${s.name}m`, { x: -s.x, z: -s.z })
    const clear = [a, b].every((t) => {
      const sh = worldShape(t)
      return markers.every((m) => distToShape(m.pos, sh) >= MARKER_CLEAR)
    })
    if (clear) out.push(a, b)
  }
  return out
}
