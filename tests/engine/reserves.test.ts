import { describe, expect, it } from 'vitest'
import { isRejection } from '../../src/engine/errors'
import { baseRadius } from '../../src/engine/geometry'
import { movement, reposition } from '../../src/engine/movement'
import { addEffect } from '../../src/engine/effects'
import { arrive, inEnemyZone, queueArrival, raiseDeployNow, reserves, resolveArrivals, returnToReserves } from '../../src/engine/reserves'
import { coherencyState, tableModels } from '../../src/engine/squads'
import { available, onTableSupply } from '../../src/engine/supply'
import type { ArrivalEntry, Effect, GameState, Rejection, TerrainInstance, TokenState, Vec2 } from '../../src/engine/types'
import { bundle, duelState, squad, ter, type SquadSpec } from './helpers'

const b = bundle()
function arena(specs: SquadSpec[], terrain: TerrainInstance[] = [], over: Partial<GameState> = {}): GameState {
  const s0 = duelState(b, { roundPhase: 'movement' })
  const sq = specs.map((x) => squad(b, x))
  return {
    ...s0, terrain, ...over,
    models: Object.fromEntries(sq.flatMap((x) => x.models).map((m) => [m.id, m])),
    units: Object.fromEntries(sq.map((x) => [x.unit.id, x.unit])),
  }
}
const lay = (s: GameState, at: Record<string, Vec2>): GameState => ({
  ...s, models: Object.fromEntries(Object.entries(s.models).map(([id, m]) => [id, at[id] ? { ...m, pos: at[id]! } : m])),
})
const rej = (r: unknown): Rejection => {
  if (!isRejection(r)) throw new Error('expected a rejection')
  return r
}
const S_EDGE: ArrivalEntry = { kind: 'edge', segment: 1 } // Frontier, red: [N, S]
const inReserves = (id: string, profileId = 'marine', models = 6, owner = 'A'): SquadSpec => ({ id, owner, profileId, models, at: { x: 0, z: 9 }, location: 'reserves' })
const enter = (s: GameState, unit = 'r', dest: Vec2 = { x: 0, z: 15 }, entry: ArrivalEntry = S_EDGE) =>
  arrive(s, b, unit, entry, { leaderId: `${unit}.0`, path: [dest], maxDist: 4 })

describe('reserves and arrival', () => {
  it('DEP-002 the Leading Model starts touching the Entry Edge and the whole unit lands On the table In Coherency (DEP-003)', () => {
    const s = arena([inReserves('r')])
    const r = enter(s)
    if (isRejection(r)) throw new Error(r.message)
    expect(r.state.units.r!.location).toBe('table')
    expect(tableModels(r.state, 'r')).toHaveLength(6)
    expect(r.state.models['r.0']!.pos).toEqual({ x: 0, z: 15 })
    expect(r.inCoherency).toBe(true)
    expect(coherencyState(r.state, b, 'r').inCoherency).toBe(true)
    // a Deploy moves at most Speed from the edge: 4" from just outside z = 18 cannot reach z = 13
    expect(rej(enter(s, 'r', { x: 0, z: 13 })).code).toBe('E_TOO_FAR')
  })

  it('DEP-003 a placement that cannot put every model In Coherency is illegal for a Deploy', () => {
    // a walled pocket 1.4" wide and 3.6" deep: room for the leader and one more
    const walls = [ter('a', 'obstruction', -0.9, 16, 0.4, 4, 2, { size: 2 }), ter('c', 'obstruction', 0.9, 16, 0.4, 4, 2, { size: 2 }), ter('d', 'obstruction', 0, 14.2, 2.2, 0.4, 2, { size: 2 })]
    const s = arena([inReserves('r')], walls)
    expect(rej(enter(s, 'r', { x: 0, z: 16 })).code).toBe('E_COHERENCY')
  })

  it('DEP-001 an arrival needs Available Supply (SUP-021)', () => {
    const s = arena([inReserves('r', 'marine', 9), { id: 'on', owner: 'A', profileId: 'marine', models: 9, at: { x: 5, z: 5 } }])
    expect(available(s, b, 'A')).toBe(1)
    expect(rej(enter(s)).code).toBe('E_NO_SUPPLY')
    expect(isRejection(enter({ ...s, round: 5 }))).toBe(false) // final Round: unlimited
  })

  it('DEP-004 no model may end in the opponent’s Zone of Influence (ZOI-002, ZOI-003)', () => {
    // seat B’s west Entry Edge: x in [-18, -12], z in [-6, 6]
    expect(inEnemyZone(arena([]), b, 'A', { x: -15, z: 0 }, 32)).toBe(true)
    expect(inEnemyZone(arena([]), b, 'A', { x: -11.4, z: 0 }, 32)).toBe(true) // a corner of the base reaches the zone
    expect(inEnemyZone(arena([]), b, 'A', { x: -10.9, z: 0 }, 32)).toBe(false)
    expect(inEnemyZone(arena([]), b, 'A', { x: 0, z: 0 }, 32)).toBe(false)
    expect(inEnemyZone(arena([]), b, 'B', { x: -15, z: 0 }, 32)).toBe(false) // its own zone is no ban
    // a table-edge arrival needs the card's nonEntryEdge permission (Warp In); without it arrive() refuses
    const bare = arena([inReserves('r')])
    expect(rej(arrive(bare, b, 'r', { kind: 'nonEntryEdge', segment: 'N' }, { leaderId: 'r.0', path: [{ x: 0, z: -15.5 }], maxDist: 4 })).code).toBe('E_NOT_LEGAL')
    const s = addEffect(bare, 'r', { source: 'warp-in', kind: 'mod', expires: 'permanent', bySeat: 'A', round: 1, data: { op: 'altEntry', kind: 'nonEntryEdge' } })
    const into = arrive(s, b, 'r', { kind: 'nonEntryEdge', segment: 'W' }, { leaderId: 'r.0', path: [{ x: -15.8, z: 0 }], maxDist: 4 })
    expect(rej(into).code).toBe('E_ZONE')
    const fine = arrive(s, b, 'r', { kind: 'nonEntryEdge', segment: 'N' }, { leaderId: 'r.0', path: [{ x: 0, z: -15.5 }], maxDist: 4 })
    expect(isRejection(fine)).toBe(false)
  })

  it('DEP-005 normal end restrictions apply: not Within 1" of an enemy Ground unit', () => {
    const s = lay(arena([inReserves('r'), { id: 'z', owner: 'B', profileId: 'zergling', models: 1, at: { x: 0, z: 0 } }]), { 'z.0': { x: 0, z: 13.6 } })
    expect(rej(enter(s, 'r', { x: 0, z: 15 })).code).toBe('E_ENGAGED')
  })

  it('DEP-006 a Deploy may step straight onto High Ground that touches the Entry Edge', () => {
    const roof = ter('roof', 'obstruction', 0, 16, 8, 4, 3, { size: 3, walkable: true, accessPoints: [{ x: 4, z: 16 }] })
    const s = arena([inReserves('r', 'marine', 3)], [roof])
    const r = enter(s, 'r', { x: 0, z: 16 })
    if (isRejection(r)) throw new Error(r.message)
    expect(r.state.models['r.0']!.elev).toBeGreaterThan(0)
  })

  it('DEP-008 a Deploy destroys Grass it crosses or ends on', () => {
    const grass = ter('g', 'rough', 0, 16.5, 5, 1.5, 0.2, { grass: true })
    const r = enter(arena([inReserves('r', 'marine', 3)], [grass]), 'r', { x: 0, z: 15 })
    if (isRejection(r)) throw new Error(r.message)
    expect(r.state.terrain).toEqual([])
  })

  it('XPORT-002 a Faction Indicator drop: base contact, nominated at End of Round, a drop nobody can use is wasted', () => {
    const indicator: TokenState = { id: 'tk1', defId: 'faction-indicator', owner: 'A', sourceId: null, pos: { x: 0, z: 10 }, elev: 0, round: 1 }
    let s = arena([inReserves('r', 'marine', 3)], [], { tokens: [indicator] })
    s = queueArrival(s, { seat: 'A', unitId: null, entry: { kind: 'indicator', ref: 'tk1' }, round: 1, source: 'ready-for-dust-off' })
    const asked = resolveArrivals(s, b)
    if (isRejection(asked) || asked.done) throw new Error('expected a decision')
    expect(asked.state.pending.kind).toBe('deploy.drop')
    const rowId = s.arrivals[0]!.id
    const picked = reserves.resolve(asked.state, b, { type: 'deploy.drop', decisionId: asked.state.pending.id, seat: 'A', rowId, unitId: 'r' })
    if (isRejection(picked)) throw new Error(picked.message)
    expect(picked.state.pending.kind).toBe('deploy.path')
    const dest = { x: 0, z: 10 - baseRadius(32) }
    const placed = reserves.resolve(picked.state, b, { type: 'deploy.path', decisionId: picked.state.pending.id, seat: 'A', unitId: 'r', entry: { kind: 'indicator', ref: 'tk1' }, rowId, leaderId: 'r.0', path: [dest] })
    if (isRejection(placed)) throw new Error(placed.message)
    expect(placed.done?.type).toBe('deploy.arrivals')
    expect(placed.state.arrivals).toEqual([])
    expect(placed.state.units.r!.location).toBe('table')
    // a leader that is not in base contact is refused
    const apart = reserves.resolve(picked.state, b, { type: 'deploy.path', decisionId: picked.state.pending.id, seat: 'A', unitId: 'r', entry: { kind: 'indicator', ref: 'tk1' }, rowId, leaderId: 'r.0', path: [{ x: 0, z: 7 }] })
    expect(rej(apart).code).toBe('E_PLACEMENT')
    // nothing in Reserves: the drop is wasted and the queue ends
    const empty = queueArrival(arena([], [], { tokens: [indicator] }), { seat: 'A', unitId: null, entry: { kind: 'indicator', ref: 'tk1' }, round: 1, source: 'x' })
    const wasted = resolveArrivals(empty, b)
    if (isRejection(wasted)) throw new Error(wasted.message)
    expect(wasted.done?.type).toBe('deploy.arrivals')
    expect(wasted.state.arrivals).toEqual([])
  })

  it('DEP-010 deploying through a friendly base (Pylon) ends the activation; Omega Network caps it at 2 Supply a Round (SUP-023)', () => {
    const s = arena([
      inReserves('r'), inReserves('q'), inReserves('t'),
      { id: 'p', owner: 'A', profileId: 'pylon', models: 1, at: { x: 0, z: 0 } },
      { id: 'w', owner: 'A', profileId: 'omega-worm', models: 1, at: { x: -9, z: -9 } },
    ], [], { round: 5 })
    const at = lay(s, { 'p.0': { x: 0, z: 0 }, 'w.0': { x: -9, z: -9 } })
    const viaPylon = reserves.resolve(at, b, { type: 'deploy.path', decisionId: '', seat: 'A', unitId: 'r', entry: { kind: 'friendlyEdge', ref: 'p' }, leaderId: 'r.0', path: [{ x: 2.4, z: 0 }] })
    if (isRejection(viaPylon)) throw new Error(viaPylon.message)
    expect(viaPylon.done?.endsActivation).toBe(true)
    // the Worm: two 1-Supply units fit, the third does not
    const via = (st: GameState, unit: string) => arrive(st, b, unit, { kind: 'friendlyEdge', ref: 'w' }, { leaderId: `${unit}.0`, path: [{ x: -9, z: -6.2 }], maxDist: 4 })
    const one = via(at, 'r')
    if (isRejection(one)) throw new Error(one.message)
    const moved = lay(one.state, Object.fromEntries(tableModels(one.state, 'r').map((m) => [m.id, { x: 14 + m.pos.x / 100, z: 14 + m.pos.z / 100 }])))
    const two = via(moved, 'q')
    if (isRejection(two)) throw new Error(two.message)
    const moved2 = lay(two.state, Object.fromEntries(tableModels(two.state, 'q').map((m) => [m.id, { x: -14 + m.pos.x / 100, z: 14 + m.pos.z / 100 }])))
    expect(rej(via(moved2, 't')).code).toBe('E_NO_SUPPLY')
  })

  it('RES-001 a unit sent to Reserves is not Destroyed: off the table, Supply freed, damage and activation kept (RES-002/003)', () => {
    const marker: Effect = { id: 'siege#1', source: 'siege', kind: 'status', status: 'SIEGE_MODE', expires: 'permanent', bySeat: 'A', round: 1 }
    const kept: Effect = { id: 'buff#1', source: 'x', kind: 'buff', stat: 'speed', x: 2, expires: 'endOfRound', bySeat: 'A', round: 1 }
    const base = arena([{ id: 'm', owner: 'A', profileId: 'marine', models: 9, at: { x: 0, z: 0 } }], [], {
      tokens: [
        { id: 'k1', defId: 'faction-indicator', owner: 'A', sourceId: 'm', pos: { x: 3, z: 3 }, elev: 0, round: 1 },
        { id: 'k2', defId: 'faction-indicator', owner: 'A', sourceId: null, pos: { x: 4, z: 4 }, elev: 0, round: 1 },
      ],
    })
    const s = { ...base, units: { m: { ...base.units.m!, damage: 3, activation: 'movement' as const, effects: [marker, kept] } } }
    expect(onTableSupply(s, b, 'A')).toBe(2)
    const back = returnToReserves(s, b, 'm', 'strap-in')
    expect(back.units.m!.location).toBe('reserves')
    expect(Object.values(back.models).every((m) => m.offTable)).toBe(true)
    expect(Object.values(back.models).every((m) => m.life === 'active')).toBe(true)
    expect(onTableSupply(back, b, 'A')).toBe(0)
    expect(back.units.m!.damage).toBe(3)
    expect(back.units.m!.activation).toBe('movement')
    expect(back.units.m!.effects.map((e) => e.id)).toEqual(['buff#1'])
    expect(back.tokens.map((t) => t.id)).toEqual(['k2'])
    expect(back.seats.A!.supplyLostThisRound).toBe(0)
  })

  it('PH1-001 Deploy is offered to a Reserves unit in the Movement Phase when it fits and a way in exists', () => {
    const s = arena([inReserves('r')])
    expect(reserves.options(s, b, 'r').map((o) => o.action.type)).toEqual(['deploy.go'])
    expect(reserves.options({ ...s, roundPhase: 'assault' }, b, 'r')).toEqual([])
    const crowded = arena([inReserves('r', 'marine', 9), { id: 'on', owner: 'A', profileId: 'marine', models: 9, at: { x: 5, z: 5 } }])
    expect(reserves.options(crowded, b, 'r')).toEqual([])
    // a unit on the table is not a Deploy candidate; Move is the movement module’s
    const onTable = arena([{ id: 'm', owner: 'A', profileId: 'marine', models: 3, at: { x: 0, z: 0 } }])
    expect(reserves.options(onTable, b, 'm')).toEqual([])
    expect(movement.options(onTable, b, 'm')).toHaveLength(1)
  })

  it('DEP-002 the deploy decisions walk entry, then path, then land the unit', () => {
    const s = arena([inReserves('r')])
    const go = reserves.resolve(s, b, { type: 'deploy.go', decisionId: '', seat: 'A', unitId: 'r' })
    if (isRejection(go)) throw new Error(go.message)
    expect(go.state.pending.kind).toBe('deploy.entry')
    expect(go.state.pending.options.map((o) => o.id)).toEqual(['edge:0', 'edge:1'])
    const entry = go.state.pending.options[1]!.action
    const path = reserves.resolve(go.state, b, entry)
    if (isRejection(path)) throw new Error(path.message)
    expect(path.state.pending.kind).toBe('deploy.path')
    const done = reserves.resolve(path.state, b, { ...path.state.pending.options[0]!.action, leaderId: 'r.0', path: [{ x: 0, z: 15 }] })
    if (isRejection(done)) throw new Error(done.message)
    expect(done.done?.type).toBe('deploy.go')
    expect(done.state.units.r!.location).toBe('table')
  })

  it('MOVE-060 PLACE from a unit already in Reserves must start from an entry (it is not on the table)', () => {
    const s = arena([inReserves('r')])
    expect(rej(reposition(s, b, 'r', { kind: 'move', leaderId: 'r.0', path: [{ x: 0, z: 15 }], maxDist: 4 })).code).toBe('E_NOT_LEGAL')
  })
})

describe('reserves: nomination, extra entries, raised windows (M2 fixes)', () => {
  const alt = (kind: string, extra: Record<string, unknown> = {}) =>
    ({ source: `alt-${kind}`, kind: 'mod' as const, expires: 'permanent' as const, bySeat: 'A', round: 1, data: { op: 'altEntry', kind, ...extra } })
  const closedEdge = (edge: string, owner: string): TokenState =>
    ({ id: `ce-${edge}`, defId: 'closed-edge', owner, sourceId: edge, pos: { x: 0, z: 0 }, elev: 0, round: 1 })

  it('DEP-011 a Unit with Burrow Ambush is nominated before its entry is chosen: the passive drives a PLACE, not the edge', () => {
    const s = arena([{ ...inReserves('r', 'zergling', 6), upgrades: [{ id: 'burrow-ambush' }] }])
    const out = reserves.resolve(s, b, { type: 'deploy.go', decisionId: '', seat: 'A', unitId: 'r' })
    if (isRejection(out)) throw new Error(out.message)
    expect(out.state.pending.kind).not.toBe('deploy.entry')
    expect(out.state.events.some((e) => e.type === 'deploy.stage')).toBe(true)
    // a Unit without such a passive goes straight to its entry
    const plain = reserves.resolve(arena([inReserves('p', 'marine', 6)]), b, { type: 'deploy.go', decisionId: '', seat: 'A', unitId: 'p' })
    if (isRejection(plain)) throw new Error(plain.message)
    expect(plain.state.pending.kind).toBe('deploy.entry')
  })

  it('DEP-012 a card that allows a table-edge entry (Warp In) adds the edges that are not the unit’s own Entry Edges', () => {
    const base = arena([inReserves('r')])
    const plain = reserves.resolve(base, b, { type: 'deploy.go', decisionId: '', seat: 'A', unitId: 'r' })
    if (isRejection(plain)) throw new Error(plain.message)
    expect(plain.state.pending.options.map((o) => o.id)).toEqual(['edge:0', 'edge:1'])
    const s = addEffect(base, 'r', alt('nonEntryEdge', { minEnemyDist: 10 }))
    const out = reserves.resolve(s, b, { type: 'deploy.go', decisionId: '', seat: 'A', unitId: 'r' })
    if (isRejection(out)) throw new Error(out.message)
    const ids = out.state.pending.options.map((o) => o.id)
    expect(ids).toEqual(expect.arrayContaining(['edge:0', 'edge:1', 'side:E', 'side:W']))
    expect(ids).not.toContain('side:N')
    expect(ids).not.toContain('side:S')
    // arriving that way keeps the card’s distance from enemies
    const near = lay(arena([inReserves('r'), { id: 'e', owner: 'B', profileId: 'zergling', models: 1, at: { x: -12, z: 0 } }]), { 'e.0': { x: -12, z: 0 } })
    const withEnemy = addEffect(near, 'r', alt('nonEntryEdge', { minEnemyDist: 10 }))
    expect(isRejection(arrive(withEnemy, b, 'r', { kind: 'nonEntryEdge', segment: 'W' }, { leaderId: 'r.0', path: [{ x: -15.2, z: 0 }], maxDist: 4 }))).toBe(true)
  })

  it('DEP-013 a table edge an enemy closed (Comsat Station) is not offered and cannot be entered', () => {
    const base = addEffect(arena([inReserves('r')], [], { tokens: [closedEdge('S', 'B')] }), 'r', alt('nonEntryEdge'))
    const out = reserves.resolve(base, b, { type: 'deploy.go', decisionId: '', seat: 'A', unitId: 'r' })
    if (isRejection(out)) throw new Error(out.message)
    const ids = out.state.pending.options.map((o) => o.id)
    expect(ids).toContain('edge:0')
    expect(ids).not.toContain('edge:1')
    expect(rej(enter(base)).code).toBe('E_NOT_LEGAL')
    // a closure by the unit’s own seat does not stop it
    const own = arena([inReserves('r')], [], { tokens: [closedEdge('S', 'A')] })
    expect(isRejection(enter(own))).toBe(false)
  })

  it('DEP-014 Personal Transport: a Reserves unit with a deployNow permission redeploys at once, whatever its activation says', () => {
    const s0 = arena([inReserves('r')])
    const s = { ...addEffect(s0, 'r', alt('deployNow')), roundPhase: 'assault' as const, activeUnit: 'r' }
    expect(reserves.options(s0, b, 'r').length).toBe(1)
    expect(reserves.options({ ...s0, roundPhase: 'assault' }, b, 'r')).toEqual([])
    expect(reserves.options(s, b, 'r').map((o) => o.action.type)).toEqual(['deploy.go'])
    const raised = raiseDeployNow(s, b, 'r')
    expect(raised?.pending.kind).toBe('deploy.entry')
    expect(raiseDeployNow(s0, b, 'r')).toBeNull()
    // the arrival spends the permission
    const landed = enter(s)
    if (isRejection(landed)) throw new Error(landed.message)
    expect(landed.state.units.r!.effects.some((e) => (e.data as { kind?: string } | undefined)?.kind === 'deployNow')).toBe(false)
  })

  it('DEP-015 a Reaction window opened at the end of an arrival is kept, and resume() finishes the Deploy', () => {
    // the Omega Network question opens at the end of a Move, so drive a friendly Move end through the same plumbing:
    // a window raised by the arrival hooks must stop the module and come back through resume()
    const s = arena([inReserves('r')])
    const go = reserves.resolve(s, b, { type: 'deploy.path', decisionId: '', seat: 'A', unitId: 'r', entry: S_EDGE, leaderId: 'r.0', path: [{ x: 0, z: 15 }] })
    if (isRejection(go)) throw new Error(go.message)
    expect(go.done?.type).toBe('deploy.go')
    // no stage parked when nothing was raised, and a resume with no stage still closes cleanly
    const idle = reserves.resume!(go.state, b)
    if (isRejection(idle)) throw new Error(idle.message)
    expect(idle.done).toBeDefined()
  })

  it('RES-004 returning to Reserves drops SIEGE MODE through the one Effect-list writer', () => {
    const marker: Effect = { id: 'siege#1', source: 'siege', kind: 'status', status: 'SIEGE_MODE', expires: 'permanent', bySeat: 'A', round: 1 }
    const s = arena([{ id: 't', owner: 'A', profileId: 'marine', models: 1, at: { x: 0, z: 0 } }])
    const withSiege = { ...s, units: { t: { ...s.units.t!, effects: [marker] } } }
    const back = returnToReserves(withSiege, b, 't', 'test')
    expect(back.units.t!.effects).toEqual([])
    expect(back.units.t!.location).toBe('reserves')
  })
})
