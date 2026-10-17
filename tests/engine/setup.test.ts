// Game set-up: tables, armies into Reserves, Mission and Deployment (quick path and draft), Markers, terrain, Round 1.
// Menu providers and Supply of other owners are faked as in turnflow.test.ts; army, dice, missions, setup are real.
import { describe, expect, it, vi } from 'vitest'
import { apply } from '../../src/engine/apply'
import { legalActions } from '../../src/engine/pending'
import { createDemoGame, createGame, generateTerrain, setupGame, TABLES } from '../../src/engine/setup'
import type { Action, GameState, MarkerState } from '../../src/engine/types'
import { bundle } from './helpers'

const quiet = vi.hoisted(() => (name: string) => async (orig: () => Promise<Record<string, unknown>>) => {
  const m = await orig()
  return { ...m, [name]: { ...(m[name] as object), options: () => [] } }
})
vi.mock('../../src/engine/supply', () => ({ canArrive: () => true, supplyFor: () => 0, poolFor: () => 99, available: () => 99 }))
vi.mock('../../src/engine/hooks', async (orig) => ({ ...(await orig<typeof import('../../src/engine/hooks')>()), runHook: (state: GameState) => ({ state, mods: [] }) }))
vi.mock('../../src/engine/shooting', quiet('shooting'))
vi.mock('../../src/engine/charge', quiet('charge'))
vi.mock('../../src/engine/melee', quiet('melee'))
vi.mock('../../src/engine/attack', quiet('attack'))
vi.mock('../../src/engine/reserves', quiet('reserves'))
vi.mock('../../src/engine/abilities', quiet('abilities'))
vi.mock('../../src/engine/movement', async (orig) => {
  const m = await orig<typeof import('../../src/engine/movement')>()
  return {
    ...m,
    movement: { ...m.movement, options: (s: GameState, _b: unknown, id: string) => (s.units[id] ? [{ id: 'go', label: 'Go', action: { type: 'move.go', decisionId: '', seat: s.units[id]!.owner } }] : []) },
  }
})

const b = bundle()
function step(s: GameState, pred: (a: Action) => boolean = () => true): GameState {
  const a = legalActions(s).find(pred)
  if (!a) throw new Error(`no legal action in ${s.pending.kind}: ${legalActions(s).map((x) => x.type).join(',')}`)
  const r = apply(s, b, a)
  if (!r.ok) throw new Error(r.rejection.message)
  return r.state
}

describe('setup (tables, armies, Mission and Deployment, draft)', () => {
  it('SETUP-001 BF-001 TABLE-001 Skirmish is 36 x 36 and Standard is 54 x 36 in; the table comes from the Deployment Card', () => {
    expect(TABLES.skirmish).toEqual({ w: 36, d: 36 })
    expect(TABLES.standard).toEqual({ w: 54, d: 36 })
    expect(setupGame(b, { missionId: 'frontlines-standard', deploymentId: 'gauntlet' }).scenario.table).toEqual({ w: 54, d: 36 })
    expect(setupGame(b, { missionId: 'frontlines-skirmish', deploymentId: 'frontier' }).scenario.table).toEqual({ w: 36, d: 36 })
    expect(createDemoGame().pending.kind).toBe('turn.choose') // the placeholder demo game is untouched
    expect(createGame(b, { preset: 'first-battle' }).missionId).toBe('frontlines-skirmish')
  })

  it('SET-005 GEN-001 INIT-001 the First Battle starts with every unit in Reserves, cards Ready, Round 1 open and the Roll-Off winner assigning the marker', () => {
    const s = setupGame(b, { preset: 'first-battle', seed: 'fb' })
    expect(s).toMatchObject({ phase: 'play', round: 1, missionId: 'frontlines-skirmish', deploymentId: 'abandoned-camp', maxRounds: 5 })
    expect(Object.values(s.units).every((u) => u.location === 'reserves' && u.activation === null)).toBe(true)
    expect(Object.values(s.models).every((m) => m.offTable === true)).toBe(true)
    expect(Object.values(s.cards).flat().every((c) => !c.exhausted)).toBe(true)
    expect(Object.values(s.units).filter((u) => u.owner === 'A').length).toBe(4) // 6 + 6 Marines, Marauders, Medics
    expect(s.seats.A).toMatchObject({ colour: 'red', faction: 'terran', factionCardId: 'terran-armed-forces' })
    expect(s.seats.B).toMatchObject({ colour: 'blue', faction: 'zerg' })
    expect(s.pending.kind).toBe('setup.firstPlayer')
    expect(s.events.filter((e) => e.type === 'DiceRolled').length).toBeGreaterThanOrEqual(2)
    const next = step(s, (a) => a['holder'] === 'B')
    expect(next).toMatchObject({ firstPlayer: 'B', roundPhase: 'movement' })
    expect(next.pending).toMatchObject({ kind: 'turn.first', seat: 'B' })
  })

  it('SET-003 DEPL-001 MM-004 Markers sit at the card coordinates in world space; the same seed builds the same game', () => {
    const s = setupGame(b, { preset: 'first-battle', seed: 'same' })
    expect(s.markers.map((m: MarkerState) => [m.n, m.pos.x, m.pos.z])).toEqual([[1, -12, 0], [2, 12, 0], [5, 0, 0]])
    expect(s.markers.every((m) => m.active && m.onTable && m.controller === null)).toBe(true)
    expect(JSON.stringify(setupGame(b, { preset: 'first-battle', seed: 'same' }))).toBe(JSON.stringify(s))
    expect(setupGame(b, { preset: 'first-battle', seed: 'other' }).rng).not.toEqual(s.rng)
  })

  it('TER-001 TER-005 generated maps are balanced by a half turn and never cover a Marker', () => {
    const dep = b.records.deployments.find((d) => d.id === 'gauntlet')!
    const table = { w: dep.size.w, d: dep.size.h }
    const markers = setupGame(b, { missionId: 'frontlines-standard', deploymentId: 'gauntlet' }).markers
    for (let v = 1; v <= 6; v++) {
      const t = generateTerrain(v, table, markers)
      expect(t.length).toBeGreaterThan(4)
      expect(JSON.stringify(generateTerrain(v, table, markers))).toBe(JSON.stringify(t))
      for (const p of t) {
        expect(markers.every((m) => Math.hypot(p.pos.x - m.pos.x, p.pos.z - m.pos.z) > 3)).toBe(true)
        expect(t.some((q) => Math.abs(q.pos.x + p.pos.x) < 1e-9 && Math.abs(q.pos.z + p.pos.z) < 1e-9)).toBe(true)
      }
    }
  })

  it('RND-001 the game length comes from the Mission Card: 5 rounds, 4 for Divide and Conquer and Supply Drop Skirmish', () => {
    for (const m of b.records.missions) {
      const dep = m.scale === 'standard' ? 'gauntlet' : 'abandoned-camp'
      const s = setupGame(b, { missionId: m.id, deploymentId: dep })
      expect(s.maxRounds).toBe(m.gameLength)
      expect(s.missionId).toBe(m.id)
    }
    expect(setupGame(b, { missionId: 'divide-and-conquer-standard', deploymentId: 'gauntlet' }).maxRounds).toBe(4)
    expect(setupGame(b, { missionId: 'supply-drop-skirmish', deploymentId: 'abandoned-camp' }).maxRounds).toBe(4)
    expect(setupGame(b, { missionId: 'hold-position-skirmish', deploymentId: 'abandoned-camp' }).maxRounds).toBe(5)
  })

  it('DRF-002 DRF-003 DRF-004 DRF-005 the draft: winner picks colour then which draft to control, the other seat removes 2, the controller picks 1', () => {
    const draftCards = {
      A: { mission: ['hold-position-skirmish', 'frontlines-skirmish'], deployment: ['abandoned-camp', 'dirt-side'] },
      B: { mission: ['supply-drop-skirmish', 'frontlines-skirmish'], deployment: ['char-plains', 'abandoned-camp'] },
    }
    let s = setupGame(b, { draft: true, draftCards, seed: 'draft' })
    expect(s.phase).toBe('setup')
    expect(s.draft!.rows.mission).toEqual(['hold-position-skirmish', 'frontlines-skirmish', 'supply-drop-skirmish', 'frontlines-skirmish'])
    expect(s.pending.kind).toBe('setup.colour')
    const winner = s.pending.seat as string
    const loser = winner === 'A' ? 'B' : 'A'
    s = step(s, (a) => a['colour'] === 'blue')
    expect(s.draft!.colour).toEqual({ [winner]: 'blue', [loser]: 'red' })
    expect(s.pending).toMatchObject({ kind: 'setup.draftControl', seat: winner })
    s = step(s, (a) => a['control'] === 'mission')
    expect(s.pending).toMatchObject({ kind: 'setup.ban', seat: loser }) // the seat without control removes 2 cards
    s = step(s, (a) => a['index'] === 0)
    expect(legalActions(s).map((a) => a['index'])).toEqual([1, 2, 3]) // a removed copy is gone, nothing else is
    s = step(s, (a) => a['index'] === 1)
    expect(s.pending).toMatchObject({ kind: 'setup.pick', seat: winner })
    expect(legalActions(s).map((a) => a['index'])).toEqual([2, 3])
    s = step(s, (a) => a['index'] === 3)
    expect(s.draft!.picked.mission).toBe('frontlines-skirmish')
    expect(s.pending).toMatchObject({ kind: 'setup.ban', seat: winner }) // roles swap for the Deployment draft
    s = step(s, (a) => a['index'] === 0)
    s = step(s, (a) => a['index'] === 3)
    expect(s.pending).toMatchObject({ kind: 'setup.pick', seat: loser })
    s = step(s, (a) => a['index'] === 2)
    expect(s.pending).toMatchObject({ kind: 'setup.terrain', seat: loser }) // the Red seat picks the map
    expect(legalActions(s).length).toBe(3) // TER-001 (R p.80 9.3): D3 on a Skirmish table
    s = step(s, (a) => a['map'] === 2)
    expect(s).toMatchObject({ phase: 'play', round: 1, missionId: 'frontlines-skirmish', deploymentId: 'char-plains', maxRounds: 5 })
    expect(s.seats[loser]!.colour).toBe('red')
    expect(s.terrain.length).toBeGreaterThan(0)
    expect(s.pending.kind).toBe('setup.firstPlayer')
  })
})
