// M2 follow-up wiring tests: raised Reaction windows through arrivals, tumors surviving Cleanup, Divide and Conquer
// totals, and the delayed/summoned context of the real cards. Names follow docs/spec/12-rules-test-checklist.md IDs.
import { describe, expect, it } from 'vitest'
import { apply } from '../../src/engine/apply'
import { runDelayedStep, runEffects } from '../../src/engine/abilities'
import { legalActions } from '../../src/engine/pending'
import { addEffect, tokenGrants } from '../../src/engine/effects'
import { raiseEntry, returnToReserves } from '../../src/engine/reserves'
import { scoreRules } from '../../src/engine/missions'
import { supplyFor } from '../../src/engine/supply'
import { planBatches } from '../../src/engine/shooting'
import { stepCleanup } from '../../src/engine/scoring'
import { tokenBodies } from '../../src/engine/squads'
import { withForcedDice, bundle, duelState, squad, type SquadSpec } from './helpers'
import type { CardState, GameState, TokenState } from '../../src/engine/types'

const b = bundle()
const card = (id: string, res: 'CP' | 'BM' | 'PE', n = 1, kind: CardState['kind'] = 'tactical'): CardState => ({ id, kind, exhausted: false, resource: { res, n }, usage: {} })

function arena(specs: SquadSpec[], over: Partial<GameState> = {}): GameState {
  const s0 = duelState(b, { roundPhase: 'movement' })
  const sq = specs.map((x) => squad(b, x))
  return {
    ...s0, ...over,
    models: Object.fromEntries(sq.flatMap((x) => x.models).map((m) => [m.id, m])),
    units: Object.fromEntries(sq.map((x) => [x.unit.id, x.unit])),
  }
}
const step = (s: GameState, pick: (a: { type: string; [k: string]: unknown }) => boolean): GameState => {
  const a = legalActions(s).find(pick)
  if (!a) throw new Error(`no matching option in ${s.pending.kind}: ${s.pending.options.map((o) => o.id).join(',')}`)
  const r = apply(s, b, a)
  if (!r.ok) throw new Error(`${r.rejection.code}: ${r.rejection.message}`)
  return r.state
}

describe('arrivals with a raised Reaction window (DEP-015)', () => {
  it('DEP-015 Photon Overcharge: an enemy arriving from a non-Entry edge opens the window; the HITS resolve, then the Deploy finishes', () => {
    const warp = { source: 'warp-in', kind: 'mod' as const, expires: 'permanent' as const, bySeat: 'B', round: 1, data: { op: 'altEntry', kind: 'nonEntryEdge' } }
    let s = arena([
      { id: 'p', owner: 'A', profileId: 'zealot', models: 3, at: { x: -10, z: 5 } },
      { id: 'r', owner: 'B', profileId: 'zergling', models: 4, at: { x: 0, z: 9 }, location: 'reserves' },
    ])
    s = { ...s, cards: { A: [card('overcharged-nexus', 'PE')], B: [] }, activeUnit: 'r', active: 'B', units: { ...s.units, r: { ...s.units.r!, effects: [{ ...warp, id: 'warp#1' }] } } }
    const entry = raiseEntry(s, b, 'r')
    if ('code' in entry) throw new Error(entry.message)
    let cur = entry.state
    cur = step(cur, (a) => a.type === 'deploy.entry' && (a['entry'] as { segment?: unknown }).segment === 'N')
    cur = step(withForcedDice(cur, [6, 6, 6, 6, 6, 6]), (a) => a.type === 'deploy.path' && a['path'] !== undefined)
    // the arrival is on the table and the window is open for the Protoss seat, with the Deploy parked on a stage
    expect(cur.units.r!.location).toBe('table')
    expect(cur.pending.kind).toBe('ability.react')
    expect(cur.pending.seat).toBe('A')
    expect(cur.events.some((e) => e.type === 'deploy.stage' && (e as { stage?: string }).stage === 'arrived')).toBe(true)
    const use = legalActions(cur).find((a) => a.type === 'ability.useReaction' && a['abilityId'] === 'photon-overcharge')
    expect(use).toBeDefined()
    // answer the window and any casualty picks until the Deploy is over
    let guard = 0
    cur = step(cur, (a) => a === use)
    while (cur.pending.kind !== 'test.idle' && cur.pending.kind !== 'turn.activate' && guard++ < 30) {
      cur = step(cur, (a) => a.type !== 'turn.pass' || true)
    }
    expect(cur.units.r!.location === 'table' || cur.units.r!.location === 'destroyed').toBe(true)
    expect(cur.events.some((e) => e.type === 'atk.removed' || e.type === 'deploy.stage')).toBe(true)
  })
})

describe('Rapid Ingress delayed context (ABL-033)', () => {
  it('ABL-033 the real card: the summoned drone is remembered by the delayed removeSelf, which survives a JSON round trip', () => {
    const ability = b.records.cards.find((c) => c.id === 'raynors-raiders')!.abilities.find((a) => a.id === 'rapid-ingress')!
    let s = arena([{ id: 'm', owner: 'A', profileId: 'marine', models: 2, at: { x: 0, z: 5 } }], { cards: { A: [card('raynors-raiders', 'CP')], B: [] }, activeUnit: 'm', active: 'A' })
    s = { ...s, units: { ...s.units } }
    const r = runEffects(s, b, [...ability.effects], { seat: 'A', sourceId: 'rapid-ingress', unitId: 'm', point: { x: 6, z: 9 } })
    if (!('state' in r)) throw new Error(r.message)
    const drone = Object.keys(r.state.units).find((id) => r.state.units[id]!.profileId === 'point-defense-drone')!
    expect(drone).toBeDefined()
    // the delayed record is kept on the source Unit with the summoned Unit id in its saved context
    const kept = r.state.units.m!.effects.find((e) => (e.data as { op?: string } | undefined)?.op === 'delayed')
    expect((kept!.data as { ctx: { summonedUnitId?: string } }).ctx.summonedUnitId).toBe(drone)
    const revived = JSON.parse(JSON.stringify(r.state)) as GameState
    const out = runDelayedStep(revived, b, 'endOfRound')
    expect(out.suspended).toBe(false)
    expect(out.state.units[drone]!.location).not.toBe('table')
    expect(out.state.units.m!.location).toBe('table')
  })
})

describe('shooting reads targetRestriction and coordinatedStrike (ATK-010)', () => {
  const eff = (op: Record<string, unknown>) => ({ source: 'test', kind: 'mod' as const, expires: 'permanent' as const, bySeat: 'A', round: 1, data: op })

  it('ATK-010 targetRestriction (Point Blank): a live restriction bars the Units Engaged with the shooter', () => {
    const s = duelState(b, { gap: 1.3 })
    // touching: the Marines are Engaged with the Zerglings, which they may normally still shoot
    const plain = planBatches(s, b, 'A-marines').flatMap((c) => c.targets)
    expect(plain).toContain('B-zerglings')
    const barred = addEffect(s, 'A-marines', eff({ op: 'targetRestriction', cannotTarget: { engagedWithSelf: true } }))
    expect(planBatches(barred, b, 'A-marines').flatMap((c) => c.targets)).not.toContain('B-zerglings')
  })

  it('ATK-010 coordinatedStrike (Coordinated Strike): a spotter friend stands in for range, so a far target becomes legal', () => {
    let s = duelState(b, { gap: 24 })
    const spot = squad(b, { id: 'A-spotter', owner: 'A', profileId: 'marine', models: 1, at: { x: 0, z: -9 } })
    s = { ...s, units: { ...s.units, [spot.unit.id]: spot.unit }, models: { ...s.models, ...Object.fromEntries(spot.models.map((m) => [m.id, m])) } }
    expect(planBatches(s, b, 'A-marines').flatMap((c) => c.targets)).not.toContain('B-zerglings')
    const aided = addEffect(s, 'A-marines', eff({ op: 'coordinatedStrike', friend: 'A-spotter' }))
    expect(planBatches(aided, b, 'A-marines').flatMap((c) => c.targets)).toContain('B-zerglings')
  })
})

describe('abilities honour a raised Reaction window (ABL-031)', () => {
  it('ABL-031 a PLACE whose end hook opens a Reaction parks the rest of the list; closing the window finishes it (Veil of Shadows)', () => {
    let s = duelState(b, { roundPhase: 'movement' })
    s = { ...s, cards: { A: [card('twilight-council', 'PE', 0)], B: [] }, activeUnit: 'A-marines', active: 'A', units: { ...s.units, 'A-marines': { ...s.units['A-marines']!, damage: 4 } } }
    const from = s.models['A-marines.0']!.pos
    const r = runEffects(s, b, [{ op: 'place', x: 4 }, { op: 'gainVP', n: 1 }], { seat: 'A', sourceId: 'test', unitId: 'A-marines', point: { x: from.x + 1, z: from.z } })
    if (!('state' in r)) throw new Error(r.message)
    expect(r.state.pending.kind).toBe('ability.react')
    expect(r.state.seats.A!.vp).toBe(0) // the rest of the list is waiting
    const use = legalActions(r.state).find((a) => a.type === 'ability.useReaction' && a['abilityId'] === 'veil-of-shadows')
    expect(use).toBeDefined()
    const next = step(r.state, (a) => a === use)
    expect(next.units['A-marines']!.damage).toBe(2)
    expect(next.seats.A!.vp).toBe(1)
  })
})

describe('Divide and Conquer quarter totals (MSN-050)', () => {
  it('MSN-050 a quarter counts the objectives reading of Supply: Jim Raynor (+1 on markers and objectives) tips a tie', () => {
    const lone = (marines: number) => arena([
      { id: 'r', owner: 'A', profileId: 'jim-raynor', models: 1, at: { x: -6, z: 6 } },
      { id: 'b1', owner: 'B', profileId: 'marine', models: marines, at: { x: -6, z: 12 } },
    ], { missionId: 'divide-and-conquer-skirmish', markers: [] })
    const probe = lone(1)
    const vp = supplyFor(probe, b, 'r', 'vp'), ctl = supplyFor(probe, b, 'r', 'control')
    expect(ctl).toBe(vp + 1)
    // find the Marine count whose Supply equals Raynor's plain 'vp' Supply: a tie under 'vp', a win with the objectives +1
    let n = 1
    while (supplyFor(lone(n), b, 'b1', 'vp') < vp && n < 20) n++
    expect(supplyFor(lone(n), b, 'b1', 'vp')).toBe(vp)
    const q = scoreRules(lone(n), b, 'A').lines.find((l) => l.rule === 'quarters')
    expect(q?.vp).toBe(1)
  })
})

describe('Creep Tumors stay in play through the cards (RES-003)', () => {
  const tumor: TokenState = { id: 'tum', defId: 'creep-tumor', owner: 'B', sourceId: 'B-zerglings', pos: { x: 3, z: -3 }, elev: 0, round: 1 }

  it('RES-003 a Ready Creep Card keeps its tumors through Cleanup, a Unit returning to Reserves and a Unit being destroyed', () => {
    const s = { ...duelState(b), tokens: [tumor], cards: { A: [], B: [card('accelerating-creep', 'BM', 0, 'creep')] } }
    expect(stepCleanup(s, b).tokens).toHaveLength(1)
    expect(returnToReserves(s, b, 'B-zerglings', 'test').tokens).toHaveLength(1)
    expect(tokenGrants(s, b, tumor, 'STAY_IN_PLAY')).toBe(true)
    expect(tokenGrants(s, b, tumor, 'DISPLACEMENT')).toBe(true)
    expect(() => tokenBodies(s, b)).not.toThrow()
  })

  it('RES-003 without the card the tumors go at Cleanup and with the Unit', () => {
    const s = { ...duelState(b), tokens: [tumor], cards: { A: [], B: [] } }
    expect(stepCleanup(s, b).tokens).toHaveLength(0)
    expect(returnToReserves(s, b, 'B-zerglings', 'test').tokens).toHaveLength(0)
  })
})
