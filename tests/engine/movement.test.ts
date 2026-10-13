import { describe, expect, it } from 'vitest'
import { isRejection } from '../../src/engine/errors'
import { baseRadius, dist } from '../../src/engine/geometry'
import { addEffect, hasStatus, setStatus } from '../../src/engine/effects'
import { directPath, disengageSacrifice, hasLegalLeaderMove, keepsBurrowOnMove, moveReach, movement, pathAnswers, reposition, type RepositionResult, type RepositionSpec } from '../../src/engine/movement'
import { coherencyState, unitModels } from '../../src/engine/squads'
import type { GameState, Rejection, TerrainInstance, Vec2 } from '../../src/engine/types'
import { bundle, duelState, squad, ter, type SquadSpec } from './helpers'

const b = bundle()
/** The only Flying unit on a card (the Point Defense Drone) has Speed "-", so Flying movement tests use this copy of it with Speed 6. */
const fb = { ...b, records: { ...b.records, units: b.records.units.map((u) => (u.id === 'point-defense-drone' ? { ...u, stats: { ...u.stats, speed: 6 } } : u)) } }
function arena(specs: SquadSpec[], terrain: TerrainInstance[] = []): GameState {
  const s0 = duelState(b)
  const sq = specs.map((x) => squad(b, x))
  return {
    ...s0, terrain,
    models: Object.fromEntries(sq.flatMap((x) => x.models).map((m) => [m.id, m])),
    units: Object.fromEntries(sq.map((x) => [x.unit.id, x.unit])),
  }
}
const lay = (s: GameState, at: Record<string, Vec2>): GameState => ({
  ...s, models: Object.fromEntries(Object.entries(s.models).map(([id, m]) => [id, at[id] ? { ...m, pos: at[id]! } : m])),
})
const solid = (id: string, x: number, z: number, w: number, d: number, size: number, extra: Record<string, unknown> = {}): TerrainInstance =>
  ter(id, 'obstruction', x, z, w, d, size, { size, ...extra })
const ok = (r: RepositionResult | Rejection): RepositionResult => {
  if (isRejection(r)) throw new Error(`rejected: ${r.code} ${r.message}`)
  return r
}
const rej = (r: RepositionResult | Rejection): Rejection => {
  if (!isRejection(r)) throw new Error('expected a rejection')
  return r
}
const go = (s: GameState, unit: string, path: Vec2[], o: Partial<RepositionSpec> = {}, bb = b) =>
  reposition(s, bb, unit, { kind: 'move', leaderId: `${unit}.0`, path, maxDist: 4, ...o })
/** One marine squad of n models in a tight cluster around (0,0), leader exactly at the origin. */
const marines = (n: number, extra: Partial<SquadSpec> = {}) => {
  const s = arena([{ id: 'm', owner: 'A', profileId: 'marine', models: n, at: { x: 0, z: 0 }, ...extra }])
  return lay(s, { 'm.0': { x: 0, z: 0 } })
}

describe('movement', () => {
  it('MOVE-001 Speed comes from the card: 4 for a squad, the second value for a single model; "-" never moves', () => {
    expect(moveReach(marines(3), b, 'm')).toEqual({ move: 4, run: 4 })
    expect(moveReach(marines(1), b, 'm')).toEqual({ move: 7, run: 7 })
    const pylon = arena([{ id: 'p', owner: 'A', profileId: 'pylon', models: 1, at: { x: 0, z: 0 } }])
    expect(moveReach(pylon, b, 'p')).toBeNull()
    const r = rej(reposition(pylon, b, 'p', { kind: 'forced', leaderId: 'p.0', path: [{ x: 1, z: 0 }], maxDist: 3 }))
    expect(r.code).toBe('E_NOT_LEGAL')
  })

  it('MOVE-002 a Move must change position', () => {
    expect(rej(go(marines(3), 'm', [{ x: 0, z: 0 }])).code).toBe('E_NOT_LEGAL')
  })

  it('MOVE-011 the path may not be longer than Speed, bends included', () => {
    const s = marines(3)
    expect(rej(go(s, 'm', [{ x: 4.5, z: 0 }])).code).toBe('E_TOO_FAR')
    expect(rej(go(s, 'm', [{ x: 3, z: 0 }, { x: 3, z: 3 }])).code).toBe('E_TOO_FAR')
    const r = ok(go(s, 'm', [{ x: 2, z: 0 }, { x: 2, z: 2 }]))
    expect(r.state.models['m.0']!.pos).toEqual({ x: 2, z: 2 })
  })

  it('MOVE-020 the rest of the unit is set In Coherency, legally, and the result is stored on the unit', () => {
    const r = ok(go(marines(6), 'm', [{ x: 0, z: -4 }]))
    expect(r.inCoherency).toBe(true)
    expect(r.state.units.m!.inCoherency).toBe(true)
    expect(coherencyState(r.state, b, 'm').inCoherency).toBe(true)
    const live = unitModels(r.state, 'm')
    expect(live).toHaveLength(6)
    for (const a of live) for (const c of live) if (a !== c) expect(dist(a.pos, c.pos)).toBeGreaterThanOrEqual(2 * baseRadius(32) - 1e-6)
    expect(r.events[0]).toMatchObject({ type: 'reposition', kind: 'move', unitId: 'm' })
  })

  it('MOVE-012 the Leading Model passes its own unit but not enemy or other friendly models', () => {
    const s = arena([
      { id: 'm', owner: 'A', profileId: 'marine', models: 2, at: { x: 0, z: 0 } },
      { id: 'f', owner: 'A', profileId: 'marine', models: 1, at: { x: 0, z: 9 } },
      { id: 'z', owner: 'B', profileId: 'zergling', models: 1, at: { x: 0, z: 9 } },
    ])
    const set = lay(s, { 'm.0': { x: 0, z: 0 }, 'm.1': { x: 1.5, z: 0 }, 'f.0': { x: -3, z: 0 }, 'z.0': { x: 0, z: -3 } })
    expect(isRejection(go(set, 'm', [{ x: 3, z: 0 }]))).toBe(false) // straight through its own second model
    expect(rej(go(set, 'm', [{ x: -4, z: 0 }])).code).toBe('E_PATH_BLOCKED') // other friendly unit
    expect(rej(go(set, 'm', [{ x: 0, z: -4 }])).code).toBe('E_PATH_BLOCKED') // enemy
    // Ground and Flying ignore each other's bases
    const flyer = arena([
      { id: 'm', owner: 'A', profileId: 'marine', models: 1, at: { x: 0, z: 0 } },
      { id: 'd', owner: 'B', profileId: 'point-defense-drone', models: 1, at: { x: 0, z: 9 } },
    ])
    expect(isRejection(go(lay(flyer, { 'm.0': { x: 0, z: 0 }, 'd.0': { x: 2, z: 0 } }), 'm', [{ x: 5, z: 0 }], { maxDist: 7 }, fb))).toBe(false)
  })

  it('MOVE-013 a Size 2 wall cannot be crossed; a Size 1 wall can; neither can be ended on', () => {
    const wall = (size: number) => [solid('w', 2, 0, 0.4, 12, size)]
    const at = (size: number) => lay(arena([{ id: 'm', owner: 'A', profileId: 'marine', models: 1, at: { x: 0, z: 0 } }], wall(size)), { 'm.0': { x: 0, z: 0 } })
    expect(rej(go(at(2), 'm', [{ x: 4, z: 0 }], { maxDist: 7 })).code).toBe('E_PATH_BLOCKED')
    expect(isRejection(go(at(1), 'm', [{ x: 4, z: 0 }], { maxDist: 7 }))).toBe(false)
    expect(isRejection(go(at(1), 'm', [{ x: 2, z: 0 }], { maxDist: 7 }))).toBe(true) // ends on the wall
  })

  it('MOVE-040 Gap Clearance: 1" for Size 2 or less, 3" for Size 3', () => {
    const gate = (gap: number) => [solid('a', 2, -(gap / 2) - 3, 0.4, 6, 2), solid('c', 2, gap / 2 + 3, 0.4, 6, 2)]
    const marine = (gap: number) => lay(arena([{ id: 'm', owner: 'A', profileId: 'marine', models: 1, at: { x: 0, z: 0 } }], gate(gap)), { 'm.0': { x: 0, z: 0 } })
    expect(rej(go(marine(0.8), 'm', [{ x: 4, z: 0 }], { maxDist: 7 })).code).toBe('E_PATH_BLOCKED')
    expect(isRejection(go(marine(1.2), 'm', [{ x: 4, z: 0 }], { maxDist: 7 }))).toBe(false)
    const stalker = (gap: number) => lay(arena([{ id: 's', owner: 'A', profileId: 'stalker', models: 1, at: { x: 0, z: 0 } }], gate(gap)), { 's.0': { x: 0, z: 0 } })
    expect(rej(go(stalker(2), 's', [{ x: 4, z: 0 }], { leaderId: 's.0', maxDist: 8 })).code).toBe('E_PATH_BLOCKED')
    expect(isRejection(go(stalker(3.2), 's', [{ x: 4, z: 0 }], { leaderId: 's.0', maxDist: 8 }))).toBe(false)
  })

  it('MOVE-014 a Move may not end Within 1" of an enemy Ground unit; Flying movers only avoid enemy Flying (MOVE-021)', () => {
    const s = lay(arena([
      { id: 'm', owner: 'A', profileId: 'marine', models: 1, at: { x: 0, z: 0 } },
      { id: 'z', owner: 'B', profileId: 'zergling', models: 1, at: { x: 0, z: 9 } },
    ]), { 'm.0': { x: 0, z: 0 }, 'z.0': { x: 6, z: 0 } })
    const near = 6 - 2 * baseRadius(32) - 0.7 // ends 0.7" from the zergling
    expect(rej(go(s, 'm', [{ x: near, z: 0 }], { maxDist: 7 })).code).toBe('E_ENGAGED')
    expect(isRejection(go(s, 'm', [{ x: 6 - 2 * baseRadius(32) - 1.2, z: 0 }], { maxDist: 7 }))).toBe(false)
    // a Flying mover may end beside a Ground model, but not within 1" of enemy Flying
    const fly = lay(arena([
      { id: 'd', owner: 'A', profileId: 'point-defense-drone', models: 1, at: { x: 0, z: 0 } },
      { id: 'z', owner: 'B', profileId: 'zergling', models: 1, at: { x: 0, z: 9 } },
      { id: 'e', owner: 'B', profileId: 'point-defense-drone', models: 1, at: { x: 0, z: 9 } },
    ]), { 'd.0': { x: 0, z: 0 }, 'z.0': { x: 6, z: 0 }, 'e.0': { x: 0, z: 6 } })
    expect(isRejection(go(fly, 'd', [{ x: 4.3, z: 0 }], { leaderId: 'd.0', maxDist: 7 }, fb))).toBe(false)
    expect(rej(go(fly, 'd', [{ x: 0, z: 4.3 }], { leaderId: 'd.0', maxDist: 7 }, fb)).code).toBe('E_ENGAGED')
  })

  it('PH1-010 an Engaged unit cannot Move or Run, and only an Engaged unit can Disengage', () => {
    const er = baseRadius(32)
    const s = lay(arena([
      { id: 'm', owner: 'A', profileId: 'marine', models: 1, at: { x: 0, z: 0 } },
      { id: 'z', owner: 'B', profileId: 'zergling', models: 1, at: { x: 0, z: 9 } },
    ]), { 'm.0': { x: 0, z: 0 }, 'z.0': { x: 2 * er + 0.3, z: 0 } })
    expect(rej(go(s, 'm', [{ x: -3, z: 0 }], { maxDist: 7 })).code).toBe('E_ENGAGED')
    const far = lay(s, { 'z.0': { x: 12, z: 0 } })
    expect(rej(go(far, 'm', [{ x: -3, z: 0 }], { kind: 'disengage', maxDist: 7 })).code).toBe('E_NOT_ENGAGED')
  })

  it('DIS-002 a Disengage is a standard move that must end outside every Engagement Range', () => {
    const er = baseRadius(32)
    const s = lay(arena([
      { id: 'm', owner: 'A', profileId: 'marine', models: 3, at: { x: 0, z: 0 } },
      { id: 'z', owner: 'B', profileId: 'zergling', models: 1, at: { x: 0, z: 9 } },
    ]), { 'm.0': { x: 0, z: 0 }, 'm.1': { x: -1.6, z: 0 }, 'm.2': { x: -1.6, z: 1.6 }, 'z.0': { x: 2 * er + 0.3, z: 0 } })
    expect(rej(go(s, 'm', [{ x: -0.1, z: 0 }], { kind: 'disengage' })).code).toBe('E_ENGAGED') // still Within 1"
    const r = ok(go(s, 'm', [{ x: -3, z: 0 }], { kind: 'disengage' }))
    expect(r.casualties).toEqual([])
    for (const m of unitModels(r.state, 'm')) expect(dist(m.pos, r.state.models['z.0']!.pos) - baseRadius(m.base) - er).toBeGreaterThan(1)
  })

  it('DIS-003 a Disengage with no legal end removes the Leading Model', () => {
    const s = lay(arena([
      { id: 'm', owner: 'A', profileId: 'marine', models: 3, at: { x: 0, z: 0 } },
      { id: 'z', owner: 'B', profileId: 'zergling', models: 1, at: { x: 0, z: 9 } },
    ]), { 'm.0': { x: 0, z: 0 } })
    const after = disengageSacrifice(s, b, 'm')
    expect(after.models['m.0']!.life).toBe('dead')
    expect(unitModels(after, 'm')).toHaveLength(2)
  })

  it('MOVE-030 Grass is destroyed when the Leading Model crosses it or a model ends on it; PLACE never destroys it', () => {
    const grass = ter('g', 'rough', 2, 0, 1.5, 6, 0.2, { grass: true })
    const s = lay(arena([{ id: 'm', owner: 'A', profileId: 'marine', models: 1, at: { x: 0, z: 0 } }], [grass]), { 'm.0': { x: 0, z: 0 } })
    expect(ok(go(s, 'm', [{ x: 4, z: 0 }], { maxDist: 7 })).state.terrain).toEqual([])
    const placed = ok(reposition(s, b, 'm', { kind: 'place', leaderId: 'm.0', path: [{ x: 4, z: 0 }], maxDist: 5 }))
    expect(placed.state.terrain).toHaveLength(1)
    // a Flying unit passing over Grass leaves it standing
    const f = lay(arena([{ id: 'd', owner: 'A', profileId: 'point-defense-drone', models: 1, at: { x: 0, z: 0 } }], [grass]), { 'd.0': { x: 0, z: 0 } })
    expect(ok(go(f, 'd', [{ x: 4, z: 0 }], { leaderId: 'd.0', maxDist: 7 }, fb)).state.terrain).toHaveLength(1)
  })

  it('FLY-001 a Flying model moves point to point over terrain and models, but cannot end on terrain', () => {
    const tower = solid('t', 3, 0, 4, 8, 3)
    const f = lay(arena([{ id: 'd', owner: 'A', profileId: 'point-defense-drone', models: 1, at: { x: 0, z: 0 } }], [tower]), { 'd.0': { x: 0, z: 0 } })
    expect(isRejection(go(f, 'd', [{ x: 6, z: 0 }], { leaderId: 'd.0', maxDist: 7 }, fb))).toBe(false)
    expect(rej(go(f, 'd', [{ x: 3, z: 0 }], { leaderId: 'd.0', maxDist: 7 }, fb)).code).toBe('E_BASE_OVERLAP')
  })

  it('ELEV-003 models change level only through an ACCESS POINT; Raptor Strain does not need one', () => {
    const roof = solid('roof', 6, 0, 6, 6, 3, { walkable: true, accessPoints: [{ x: 3, z: 0 }] })
    const marine = lay(arena([{ id: 'm', owner: 'A', profileId: 'marine', models: 1, at: { x: 0, z: 0 } }], [roof]), { 'm.0': { x: 0, z: 0 } })
    expect(rej(go(marine, 'm', [{ x: 6, z: 3.7 }], { maxDist: 9 })).code).toBe('E_PATH_BLOCKED')
    // through the access point: along z = 0 into the roof
    const up = ok(go(marine, 'm', [{ x: 5, z: 0 }], { maxDist: 7 }))
    expect(up.state.models['m.0']!.elev).toBeGreaterThan(0)
    // the wall of a non-walkable Size 3 block stops a marine but a Raptor climbs it (Size 4 or less)
    const block = solid('b', 3, 0, 2, 8, 3)
    const raptor = lay(arena([{ id: 'r', owner: 'B', profileId: 'raptor', models: 1, at: { x: 0, z: 0 } }], [block]), { 'r.0': { x: 0, z: 0 } })
    expect(isRejection(go(raptor, 'r', [{ x: 6, z: 0 }], { leaderId: 'r.0', maxDist: 9 }))).toBe(false)
    const marineBlocked = lay(arena([{ id: 'm', owner: 'A', profileId: 'marine', models: 1, at: { x: 0, z: 0 } }], [block]), { 'm.0': { x: 0, z: 0 } })
    expect(rej(go(marineBlocked, 'm', [{ x: 6, z: 0 }], { maxDist: 9 })).code).toBe('E_PATH_BLOCKED')
  })

  it('MOVE-060 PLACE ignores gaps and terrain on the way, is capped at X, and may not end inside Engagement Range', () => {
    const wall = solid('w', 2, 0, 0.6, 12, 3)
    const er = baseRadius(32)
    const s = lay(arena([
      { id: 'm', owner: 'A', profileId: 'marine', models: 2, at: { x: 0, z: 0 } },
      { id: 'z', owner: 'B', profileId: 'zergling', models: 1, at: { x: 0, z: 9 } },
    ], [wall]), { 'm.0': { x: 0, z: 0 }, 'z.0': { x: 8, z: 0 } })
    const spec = { kind: 'place' as const, leaderId: 'm.0' }
    const hop = ok(reposition(s, b, 'm', { ...spec, path: [{ x: 4, z: 0 }], maxDist: 5 }))
    expect(hop.state.models['m.0']!.pos).toEqual({ x: 4, z: 0 })
    expect(rej(reposition(s, b, 'm', { ...spec, path: [{ x: 6, z: 0 }], maxDist: 5 })).code).toBe('E_TOO_FAR')
    const next = 8 - 2 * er - 0.5
    expect(rej(reposition(s, b, 'm', { ...spec, path: [{ x: next, z: 0 }], maxDist: 9 })).code).toBe('E_ENGAGED')
    const engaged = ok(reposition(s, b, 'm', { ...spec, path: [{ x: next, z: 0 }], maxDist: 9, allowEngage: ['z'] }))
    expect(engaged.inCoherency).toBe(true)
    expect(rej(reposition(s, b, 'm', { ...spec, path: [{ x: 4, z: 0 }], maxDist: 5, minEnemyDist: 5 })).code).toBe('E_PLACEMENT')
  })

  it('MOVE-052 an involuntary move stops in contact with the table edge', () => {
    const s = marines(1)
    const r = ok(reposition(s, b, 'm', { kind: 'forced', leaderId: 'm.0', path: [{ x: 30, z: 0 }], maxDist: 40 }))
    expect(r.state.models['m.0']!.pos.x).toBeCloseTo(18 - baseRadius(32), 6)
  })

  it('MOVE-050 directly towards stops in contact; directly away stops at the table edge', () => {
    const s = lay(arena([
      { id: 'm', owner: 'A', profileId: 'marine', models: 1, at: { x: 0, z: 0 } },
      { id: 'z', owner: 'B', profileId: 'zergling', models: 1, at: { x: 0, z: 9 } },
    ]), { 'm.0': { x: 0, z: 0 }, 'z.0': { x: 5, z: 0 } })
    const to = directPath(s, b, 'm', 'z', 'towards', 10)!
    expect(to.path[0]!.x).toBeCloseTo(5 - 2 * baseRadius(32), 6)
    const away = directPath(s, b, 'm', 'z', 'away', 40)!
    expect(away.path[0]!.x).toBeCloseTo(-18 + baseRadius(32), 6)
  })

  it('CHG-004 a Charge sets models in base contact with the target where it can', () => {
    const er = baseRadius(32)
    const s = lay(arena([
      { id: 'z', owner: 'B', profileId: 'zergling', models: 6, at: { x: 0, z: 0 } },
      { id: 'm', owner: 'A', profileId: 'marine', models: 3, at: { x: 0, z: 9 } },
    ]), { 'z.0': { x: 0, z: 0 }, 'z.1': { x: 1.5, z: 0 }, 'z.2': { x: 3, z: 0 }, 'z.3': { x: 0, z: -1.5 }, 'z.4': { x: 1.5, z: -1.5 }, 'z.5': { x: 3, z: -1.5 },
      'm.0': { x: 0, z: 7 }, 'm.1': { x: 1.5, z: 7 }, 'm.2': { x: 3, z: 7 } })
    const r = ok(reposition(s, b, 'm', {
      kind: 'charge', leaderId: 'm.0', path: [{ x: 0, z: 2 * er + 0.02 }], maxDist: 9, allowEngage: ['z'], mustEngage: ['z'],
    }))
    const touching = unitModels(r.state, 'm').filter((m) => unitModels(r.state, 'z').some((e) => dist(m.pos, e.pos) <= 2 * er + 0.03))
    expect(touching.length).toBeGreaterThanOrEqual(2)
    // an undeclared enemy within 1" is never allowed
    expect(rej(reposition(s, b, 'm', { kind: 'charge', leaderId: 'm.0', path: [{ x: 0, z: 2 * er + 0.02 }], maxDist: 9 })).code).toBe('E_ENGAGED')
  })

  it('CC-010 Close Ranks must end closer to the Engaged enemy', () => {
    const er = baseRadius(32)
    const s = lay(arena([
      { id: 'z', owner: 'B', profileId: 'zergling', models: 1, at: { x: 0, z: 0 } },
      { id: 'm', owner: 'A', profileId: 'marine', models: 2, at: { x: 0, z: 9 } },
    ]), { 'z.0': { x: 0, z: 0 }, 'm.0': { x: 0, z: 2 * er + 0.5 }, 'm.1': { x: 1.5, z: 2 * er + 0.5 } })
    const spec: RepositionSpec = { kind: 'closeRanks', leaderId: 'm.0', path: [{ x: 0, z: 2 * er + 0.02 }], maxDist: 3, mustCloseOn: ['z'], allowEngage: ['z'] }
    expect(isRejection(reposition(s, b, 'm', spec))).toBe(false)
    expect(rej(reposition(s, b, 'm', { ...spec, path: [{ x: 0, z: 2 * er + 1.2 }] })).code).toBe('E_NOT_LEGAL')
  })

  it('TOK-001 a Force Field stops Units of Size 2 or less; a bigger Unit crosses and breaks it, a PLACE does not', () => {
    const field = { id: 'ff1', defId: 'force-field', owner: 'B', sourceId: 's', pos: { x: 2, z: 0 }, elev: 0, round: 1 }
    const mk = (profileId: string) => ({
      ...lay(arena([
        { id: 'u', owner: 'A', profileId, models: 1, at: { x: 0, z: 0 } },
        { id: 's', owner: 'B', profileId: 'sentry', models: 1, at: { x: 12, z: 12 } },
      ]), { 'u.0': { x: 0, z: 0 } }), tokens: [field],
    })
    expect(rej(go(mk('marine'), 'u', [{ x: 5, z: 0 }], { leaderId: 'u.0', maxDist: 7 })).code).toBe('E_PATH_BLOCKED')
    const big = ok(go(mk('stalker'), 'u', [{ x: 6, z: 0 }], { leaderId: 'u.0', maxDist: 8 }))
    expect(big.state.tokens).toEqual([])
    const hop = ok(reposition(mk('marine'), b, 'u', { kind: 'place', leaderId: 'u.0', path: [{ x: 5, z: 0 }], maxDist: 6 }))
    expect(hop.state.tokens).toHaveLength(1)
  })

  it('PH1-011 the module offers Move to a free unit, Disengage to an Engaged one, and answers the path decision', () => {
    const s0 = lay(arena([{ id: 'm', owner: 'A', profileId: 'marine', models: 3, at: { x: 0, z: 0 } }]), { 'm.0': { x: 0, z: 0 } })
    const s = { ...s0, roundPhase: 'movement' as const }
    expect(movement.options(s, b, 'm').map((o) => o.action.type)).toEqual(['move.go'])
    const asked = movement.resolve(s, b, { type: 'move.go', decisionId: '', seat: 'A', unitId: 'm' })
    if (isRejection(asked)) throw new Error(asked.message)
    expect(asked.state.pending.kind).toBe('move.path')
    // the open template, ready-made answers (each a full path), then Hold
    const types = asked.state.pending.options.map((o) => o.action.type)
    expect(types[0]).toBe('move.path')
    expect(types[types.length - 1]).toBe('move.hold')
    expect(asked.state.pending.options.slice(1, -1).every((o) => o.action.type === 'move.path' && Array.isArray(o.action['path']))).toBe(true)
    const done = movement.resolve(asked.state, b, { type: 'move.path', decisionId: asked.state.pending.id, seat: 'A', unitId: 'm', kind: 'move', leaderId: 'm.0', path: [{ x: 3, z: 0 }] })
    if (isRejection(done)) throw new Error(done.message)
    expect(done.done?.type).toBe('move.go')
    expect(done.state.models['m.0']!.pos).toEqual({ x: 3, z: 0 })
  })
})

describe('movement: burrow, detours, hooks (M2 fixes)', () => {
  const burrowed = (s: GameState, id: string): GameState => setStatus(s, b, id, 'BURROWED', 'gain', 'test')
  const roachArena = (extra: Partial<SquadSpec> = {}) =>
    lay(arena([{ id: 'u', owner: 'A', profileId: 'roach', models: 1, at: { x: 0, z: 0 }, ...extra }]), { 'u.0': { x: 0, z: 0 } })

  it('VIS-023 a Move, Run, Deploy, Disengage or Close Ranks ends BURROWED; PLACE and forced moves do not', () => {
    const s = burrowed(roachArena(), 'u')
    expect(hasStatus(s, 'u', 'BURROWED') && hasStatus(s, 'u', 'HIDDEN')).toBe(true)
    for (const kind of ['move', 'run'] as const) {
      const r = ok(go(s, 'u', [{ x: 2, z: 0 }], { kind, leaderId: 'u.0', maxDist: 5 }))
      expect(hasStatus(r.state, 'u', 'BURROWED')).toBe(false)
      expect(hasStatus(r.state, 'u', 'HIDDEN')).toBe(false)
    }
    for (const kind of ['place', 'forced'] as const) {
      const r = ok(go(s, 'u', [{ x: 2, z: 0 }], { kind, leaderId: 'u.0', maxDist: 5 }))
      expect(hasStatus(r.state, 'u', 'BURROWED')).toBe(true)
    }
  })

  it('VIS-023 a Disengage and Close Ranks end BURROWED too', () => {
    const er = baseRadius(32)
    const two = lay(arena([
      { id: 'u', owner: 'A', profileId: 'roach', models: 1, at: { x: 0, z: 0 } },
      { id: 'z', owner: 'B', profileId: 'zergling', models: 1, at: { x: 0, z: 9 } },
    ]), { 'u.0': { x: 0, z: 0 }, 'z.0': { x: 2 * er + 0.3, z: 0 } })
    const s = burrowed(two, 'u')
    const d = ok(go(s, 'u', [{ x: -4, z: 0 }], { kind: 'disengage', leaderId: 'u.0', maxDist: 7 }))
    expect(hasStatus(d.state, 'u', 'BURROWED')).toBe(false)
  })

  it('VIS-023 Tunneling Claws (keepOnMove) keeps BURROWED through a Move or Run', () => {
    const s = burrowed(roachArena({ upgrades: [{ id: 'tunneling-claws' }] }), 'u')
    expect(keepsBurrowOnMove(s, b, 'u')).toBe(true)
    expect(hasStatus(ok(go(s, 'u', [{ x: 2, z: 0 }], { kind: 'move', leaderId: 'u.0', maxDist: 5 })).state, 'u', 'BURROWED')).toBe(true)
    expect(hasStatus(ok(go(s, 'u', [{ x: 2, z: 0 }], { kind: 'run', leaderId: 'u.0', maxDist: 5 })).state, 'u', 'BURROWED')).toBe(true)
    expect(keepsBurrowOnMove(roachArena(), b, 'u')).toBe(false)
  })

  it('VIS-025 other models move through BURROWED models but cannot end inside their Engagement Range or on them', () => {
    const base = lay(arena([
      { id: 'm', owner: 'A', profileId: 'marine', models: 1, at: { x: 0, z: 0 } },
      { id: 'z', owner: 'B', profileId: 'zergling', models: 1, at: { x: 3, z: 0 } },
    ]), { 'm.0': { x: 0, z: 0 }, 'z.0': { x: 3, z: 0 } })
    expect(rej(go(base, 'm', [{ x: 6, z: 0 }], { leaderId: 'm.0', maxDist: 7 })).code).toBe('E_PATH_BLOCKED')
    const under = burrowed(base, 'z')
    const through = ok(go(under, 'm', [{ x: 6, z: 0 }], { leaderId: 'm.0', maxDist: 7 }))
    expect(through.state.models['m.0']!.pos).toEqual({ x: 6, z: 0 })
    expect(rej(go(under, 'm', [{ x: 3, z: 0 }], { leaderId: 'm.0', maxDist: 7 })).code).toBe('E_BASE_OVERLAP')
    expect(rej(go(under, 'm', [{ x: 4.5, z: 0 }], { leaderId: 'm.0', maxDist: 7 })).code).toBe('E_ENGAGED')
  })

  it('DIS-003 every model is tried as the Leading Model before the Leading Model is sacrificed (the search is heuristic)', () => {
    // m.0 stands in a closed cell of Size 3 walls; m.1 is outside and Engaged by the zergling
    const walls = [solid('w1', -1.3, 0, 1, 5, 3), solid('w2', 1.3, 0, 1, 5, 3), solid('w3', 0, -1.3, 5, 1, 3), solid('w4', 0, 1.3, 5, 1, 3)]
    const s0 = lay(arena([
      { id: 'm', owner: 'A', profileId: 'marine', models: 2, at: { x: 0, z: 0 } },
      { id: 'z', owner: 'B', profileId: 'zergling', models: 1, at: { x: 0, z: 9 } },
    ], walls), { 'm.0': { x: 0, z: 0 }, 'm.1': { x: 5, z: 0 }, 'z.0': { x: 6.4, z: 0 } })
    const s = { ...s0, roundPhase: 'movement' as const }
    expect(hasLegalLeaderMove(s, b, 'm', 'disengage', { leaderId: 'm.0' })).toBe(false)
    expect(hasLegalLeaderMove(s, b, 'm', 'disengage')).toBe(true)
    const asked = movement.resolve(s, b, { type: 'move.disengage', decisionId: '', seat: 'A', unitId: 'm' })
    if (isRejection(asked)) throw new Error(asked.message)
    expect(asked.done).toBeUndefined()
    expect(asked.state.pending.kind).toBe('move.path')
    const ready = asked.state.pending.options.filter((o) => o.id.startsWith('path:'))
    expect(ready.length).toBeGreaterThan(0)
    expect(ready.every((o) => o.action['leaderId'] === 'm.1')).toBe(true)
    expect(asked.state.models['m.0']!.life).not.toBe('dead')
  })

  it('DIS-006 a declared Disengage cannot turn into a Hold, and ignoreDisengage lifts the Round penalty', () => {
    const er = baseRadius(32)
    const mk = () => ({ ...lay(arena([
      { id: 'm', owner: 'A', profileId: 'marine', models: 1, at: { x: 0, z: 0 } },
      { id: 'z', owner: 'B', profileId: 'zergling', models: 3, at: { x: 0, z: 9 } },
    ]), { 'm.0': { x: 0, z: 0 }, 'z.0': { x: 2 * er + 0.3, z: 0 } }), roundPhase: 'movement' as const, round: 2 })
    const asked = movement.resolve(mk(), b, { type: 'move.disengage', decisionId: '', seat: 'A', unitId: 'm' })
    if (isRejection(asked)) throw new Error(asked.message)
    expect(asked.state.pending.options.some((o) => o.action.type === 'move.hold')).toBe(false)
    expect(asked.state.units.m!.noShootChargeRound).toBe(2)
    const free = addEffect(mk(), 'm', { source: 'tactical-retreat', kind: 'mod', expires: 'endOfActivation', bySeat: 'A', round: 2, data: { op: 'ignoreDisengage' } })
    const again = movement.resolve(free, b, { type: 'move.disengage', decisionId: '', seat: 'A', unitId: 'm' })
    if (isRejection(again)) throw new Error(again.message)
    expect(again.state.units.m!.noShootChargeRound).toBeNull()
  })

  it('MOVE-012 offered answers lean towards no table direction: seats facing each other get mirrored answers', () => {
    const s = lay(arena([
      { id: 'a', owner: 'A', profileId: 'marine', models: 1, at: { x: 0, z: -8 } },
      { id: 'c', owner: 'B', profileId: 'marine', models: 1, at: { x: 0, z: 8 } },
    ]), { 'a.0': { x: 0, z: -8 }, 'c.0': { x: 0, z: 8 } })
    const A = pathAnswers(s, b, 'a', 'move', 4, 6), B = pathAnswers(s, b, 'c', 'move', 4, 6)
    expect(A.length).toBe(6)
    expect(B.length).toBe(6)
    const fwd = (ans: { path: Vec2[] }[], from: Vec2, sign: number): number => ans.reduce((t, x) => t + sign * (x.path[0]!.z - from.z), 0) / ans.length
    expect(A[0]!.path[0]!.z).toBeGreaterThan(-8)
    expect(B[0]!.path[0]!.z).toBeLessThan(8)
    expect(Math.abs(fwd(A, { x: 0, z: -8 }, 1) - fwd(B, { x: 0, z: 8 }, -1))).toBeLessThan(1e-6)
    A.forEach((x, i) => {
      expect(x.path[0]!.x).toBeCloseTo(-B[i]!.path[0]!.x, 6)
      expect(x.path[0]!.z + 8).toBeCloseTo(-(B[i]!.path[0]!.z - 8), 6)
    })
  })

  it('MOVE-013 a Reaction window opened at the end of a Move stays open, and resume() finishes the action', () => {
    const w = squad(b, { id: 'w', owner: 'A', profileId: 'omega-worm', models: 1, at: { x: 6, z: 0 } })
    const z = squad(b, { id: 'z', owner: 'A', profileId: 'zergling', models: 1, at: { x: 0, z: 0 } })
    const rw = baseRadius(w.models[0]!.base), rz = baseRadius(z.models[0]!.base)
    const s0 = arena([])
    const s = {
      ...s0, roundPhase: 'movement' as const, activeUnit: 'z',
      units: { w: w.unit, z: z.unit }, models: { 'w.0': { ...w.models[0]!, pos: { x: 6, z: 0 } }, 'z.0': { ...z.models[0]!, pos: { x: 0, z: 0 } } },
    }
    const r = movement.resolve(s, b, { type: 'move.path', decisionId: '', seat: 'A', unitId: 'z', kind: 'move', leaderId: 'z.0', path: [{ x: 6 - rw - rz, z: 0 }] })
    if (isRejection(r)) throw new Error(r.message)
    expect(r.done).toBeUndefined()
    expect(r.state.pending.kind).toMatch(/^ability\./)
    expect(r.state.events.some((e) => e.type === 'move.stage')).toBe(true)
    const back = movement.resume!(r.state, b)
    if (isRejection(back)) throw new Error(back.message)
    expect(back.done?.type).toBe('move.go')
  })
})
