// Mission Cards and Deployment Cards as data (MSN, MM, DEPL, ZOI-005). Supply and Engagement are mocked.
import { describe, expect, it, vi } from 'vitest'
import type { EditionBundle } from '../../src/data/types'
import { claimOptions, applyClaim, initialMarkers, missionActionOptions, missions, scoreRules, startOfRoundMarkers } from '../../src/engine/missions'
import { cardToWorld } from '../../src/engine/edition'
import type { GameState, MarkerState } from '../../src/engine/types'
import { bundle, duelState, squad } from './helpers'

const ctl = vi.hoisted(() => ({ engaged: new Set<string>() }))
vi.mock('../../src/engine/engage', () => ({ isEngaged: (_s: unknown, _b: unknown, id: string) => ctl.engaged.has(id) }))
vi.mock('../../src/engine/supply', async () => {
  const ed = await import('../../src/engine/edition')
  return {
    supplyFor: (state: GameState, b: EditionBundle, unitId: string) => {
      const u = state.units[unitId]!
      return ed.bracketSupply(ed.requireUnitDef(b, u.profileId), u.modelIds.filter((id) => state.models[id]!.life !== 'dead').length)
    },
    canArrive: () => true,
  }
})

const b = bundle()
const dep = (id: string) => b.records.deployments.find((d) => d.id === id)!
const mis = (id: string) => b.records.missions.find((m) => m.id === id)!

/** A duel on a given mission and deployment, markers placed from the card, A (red) marines at (x, z). */
function game(missionId: string, deploymentId: string, at = { x: 12, z: 2.5 }, round = 2): GameState {
  const s0 = duelState(b, { missionId, deploymentId })
  const sq = squad(b, { id: 'A-m', owner: 'A', profileId: 'marine', models: 6, at })
  const models = { ...Object.fromEntries(Object.entries(s0.models).filter(([, m]) => m.unitId !== 'A-marines')), ...Object.fromEntries(sq.models.map((m) => [m.id, m])) }
  const { 'A-marines': _gone, ...rest } = s0.units
  return { ...s0, models, units: { ...rest, 'A-m': sq.unit }, markers: initialMarkers(b, mis(missionId), dep(deploymentId)), round, roundPhase: 'assault' }
}
const withMarker = (s: GameState, n: number, patch: Partial<MarkerState>): GameState => ({ ...s, markers: s.markers.map((m) => (m.n === n ? { ...m, ...patch } : m)) })

// Card-frame marker centres from spec 17 s8 (x, y; origin bottom-left).
const CARDS: Record<string, [number, number, number][]> = {
  'abandoned-camp': [[1, 6, 18], [2, 30, 18], [5, 18, 18]], 'agria-valley': [[1, 6, 6], [2, 30, 30], [5, 18, 18]],
  'dirt-side': [[1, 6, 18], [2, 30, 18], [5, 18, 18]], 'char-plains': [[1, 6, 6], [2, 6, 30], [5, 24, 18]],
  frontier: [[1, 6, 6], [2, 30, 30], [5, 18, 18]], 'green-valleys': [[1, 12, 6], [2, 24, 30], [5, 18, 18]],
  gauntlet: [[1, 12, 24], [2, 42, 12], [3, 36, 24], [4, 18, 12], [5, 27, 18]], typhoon: [[1, 18, 24], [2, 6, 30], [3, 48, 6], [4, 36, 12], [5, 27, 18]],
  acropolis: [[1, 12, 24], [2, 42, 24], [3, 42, 12], [4, 12, 12], [5, 27, 18]], 'proving-grounds': [[1, 12, 24], [2, 36, 12], [3, 42, 24], [4, 18, 12], [5, 27, 24]],
  breach: [[1, 18, 30], [2, 36, 30], [3, 36, 6], [4, 18, 6], [5, 27, 18]], 'meeting-engagement': [[1, 12, 24], [2, 42, 12], [3, 42, 24], [4, 12, 12], [5, 27, 18]],
}

describe('missions (Mission and Deployment Cards as data)', () => {
  it('DEPL-001 MM-001 every Deployment Card puts its markers at the printed centres (card frame -> world), 5 on Standard, 3 on Skirmish', () => {
    for (const [id, pts] of Object.entries(CARDS)) {
      const d = dep(id)
      const ms = initialMarkers(b, mis('hold-position-skirmish'), d)
      expect(ms.map((m) => m.n)).toEqual(pts.map((p) => p[0]))
      expect(ms.length).toBe(d.scale === 'standard' ? 5 : 3)
      pts.forEach(([n, x, y]) => expect(ms.find((m) => m.n === n)!.pos).toEqual(cardToWorld({ x, y }, d.size)))
    }
    expect(dep('gauntlet').size).toEqual({ w: 54, h: 36 })
  })

  it('MSN-001 MSN-010 the 12 Mission Cards carry the printed Supply, length, special lead and marker start', () => {
    const rows: [string, number, number, number, number | null, 'activated' | 'deactivated'][] = [
      ['supply-drop-standard', 6, 2, 5, 12, 'deactivated'], ['supply-drop-skirmish', 4, 1, 4, 8, 'deactivated'],
      ['hold-position-standard', 6, 2, 5, 10, 'activated'], ['hold-position-skirmish', 3, 1, 5, 8, 'activated'],
      ['frontlines-standard', 6, 2, 5, 10, 'activated'], ['frontlines-skirmish', 3, 1, 5, 8, 'activated'],
      ['gather-the-resources-standard', 6, 2, 5, 10, 'activated'], ['gather-the-resources-skirmish', 3, 1, 5, 8, 'activated'],
      ['divide-and-conquer-standard', 8, 2, 4, 10, 'activated'], ['divide-and-conquer-skirmish', 4, 1, 4, 8, 'activated'],
      ['artefact-hunt-standard', 6, 2, 5, null, 'activated'], ['artefact-hunt-skirmish', 3, 1, 5, null, 'activated'],
    ]
    for (const [id, s, e, len, lead, start] of rows) {
      const m = mis(id)
      expect([m.startSupply, m.escalation, m.gameLength, m.specialWinLead, m.markerStart]).toEqual([s, e, len, lead, start])
      expect(m.scoring[0]!.kind).toBe('supplyDestroyed')
    }
  })

  it('MSN-011 MSN-012 Supply Drop activates one random Deactivated marker at the printed rounds (rolled, so replayable)', () => {
    const std = game('supply-drop-standard', 'gauntlet', { x: 0, z: 14 }, 1)
    const one = startOfRoundMarkers(std, b)
    const lit = one.markers.filter((m) => m.active)
    expect(lit.length).toBe(1)
    expect([1, 2, 3, 4]).toContain(lit[0]!.n)
    expect(lit[0]!.activatedRound).toBe(1)
    expect(one.events.some((e) => e.type === 'DiceRolled')).toBe(true)
    expect(JSON.stringify(startOfRoundMarkers(std, b))).toBe(JSON.stringify(one))
    expect(startOfRoundMarkers({ ...std, round: 5 }, b).markers.find((m) => m.n === 5)!.active).toBe(true)
    const sk = game('supply-drop-skirmish', 'abandoned-camp', { x: 0, z: 14 }, 1)
    expect(startOfRoundMarkers(sk, b).markers.some((m) => m.active)).toBe(false)
    const r2 = startOfRoundMarkers({ ...sk, round: 2 }, b).markers.filter((m) => m.active)
    expect(r2.length).toBe(1)
    expect([1, 2, 5]).toContain(r2[0]!.n)
  })

  it('MSN-041 MSN-042 Gather: an Unengaged unit Within 3 in of a controlled opponent-colour marker takes 1 VP at once, no sight line needed', () => {
    ctl.engaged.clear()
    let s = withMarker(game('gather-the-resources-skirmish', 'abandoned-camp', { x: 12, z: 2.5 }), 2, { controller: 'A' }) // marker 2 is Blue's
    const opts = missionActionOptions(s, b, 'A-m')
    expect(opts.map((o) => o.action.type)).toEqual(['mission.gather'])
    const r = missions.resolve({ ...s, pending: { ...s.pending, kind: 'turn.activate' } }, b, { ...opts[0]!.action, decisionId: 'd', seat: 'A' })
    if ('code' in r) throw new Error(r.message)
    expect(r.state.seats.A!.vp).toBe(1)
    expect(r.done?.unitId).toBe('A-m')
    ctl.engaged.add('A-m')
    expect(missionActionOptions(s, b, 'A-m')).toEqual([]) // an Engaged unit cannot Gather
    ctl.engaged.clear()
    s = withMarker(s, 2, { controller: 'B' })
    expect(missionActionOptions(s, b, 'A-m')).toEqual([]) // not controlled by A
    s = withMarker(game('gather-the-resources-skirmish', 'abandoned-camp', { x: -12, z: 2.5 }), 1, { controller: 'A' }) // marker 1 is A's own colour
    expect(missionActionOptions(s, b, 'A-m')).toEqual([])
  })

  it('MSN-060 MSN-061 CLAIM: a controlled neutral or opponent-colour marker Within 3 in rides on one unit (one marker per carrier)', () => {
    const base = withMarker(game('artefact-hunt-skirmish', 'abandoned-camp', { x: 0, z: 2.5 }), 5, { controller: 'A' })
    const own = withMarker(base, 1, { controller: 'A' })
    expect(claimOptions(own, b, 'A').map((o) => o.action['marker'])).toEqual([5]) // marker 1 is Red's own colour; marker 2 is far away
    expect(claimOptions({ ...base, round: 1 }, b, 'A')).toEqual([]) // from Round 2
    const claimed = applyClaim(base, 'A-m', 5)
    expect(claimed.markers.find((m) => m.n === 5)).toMatchObject({ onTable: false, claimedBy: 'A-m' })
    expect(claimOptions(withMarker(claimed, 2, { controller: 'A', pos: { x: 0, z: 0 } }), b, 'A')).toEqual([]) // already carries one
  })

  it('MSN-066 ZOI-005 Artefact Hunt, final round: carriers Wholly Within their own Zone score 3 (Skirmish), own-colour markers not carried by the enemy score 1', () => {
    let s = game('artefact-hunt-skirmish', 'abandoned-camp', { x: 0, z: 14 }, 5) // Red enters from the south edge: its zone is z 12..18
    s = withMarker(s, 5, { onTable: false, claimedBy: 'A-m' })
    const a = scoreRules(s, b, 'A')
    expect(a.lines.find((l) => l.rule === 'claimCarriedInZone')!.vp).toBe(3)
    expect(a.lines.find((l) => l.rule === 'ownMarkersNotClaimed')!.vp).toBe(1)
    const out = scoreRules({ ...s, models: Object.fromEntries(Object.entries(s.models).map(([id, m]) => [id, m.unitId === 'A-m' ? { ...m, pos: { x: m.pos.x, z: 0 } } : m])) }, b, 'A')
    expect(out.lines.find((l) => l.rule === 'claimCarriedInZone')!.vp).toBe(0)
    const stolen = scoreRules(withMarker(s, 1, { onTable: false, claimedBy: 'B-zerglings' }), b, 'A')
    expect(stolen.lines.find((l) => l.rule === 'ownMarkersNotClaimed')!.vp).toBe(0)
  })
})
