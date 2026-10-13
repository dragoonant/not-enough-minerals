import { describe, expect, it } from 'vitest'
import { emptyBundle } from '../../src/data/bundle'
import { apply } from '../../src/engine/apply'
import { createRandomDecider } from '../../src/engine/decider'
import { legalActions } from '../../src/engine/pending'
import { rollD6, seedRng } from '../../src/engine/rng'
import { createDemoGame, createGame, TABLES } from '../../src/engine/setup'
import type { Action, GameState } from '../../src/engine/types'
import { view } from '../../src/engine/view'

const bundle = emptyBundle('fixture')

describe('engine core (M0 skeleton)', () => {
  it('RNG-001 the seeded rng is deterministic and D6 results stay in 1..6', () => {
    expect(seedRng('s')).toEqual(seedRng('s'))
    let s = seedRng('s')
    const seen = new Set<number>()
    for (let i = 0; i < 600; i++) { const [d, n] = rollD6(s); s = n; seen.add(d) }
    expect([...seen].sort()).toEqual([1, 2, 3, 4, 5, 6])
  })

  it('SETUP-001 the demo table is a 36 in square skirmish table with models on round bases', () => {
    const g = createDemoGame()
    expect(g.scenario.table).toEqual({ w: 36, d: 36 })
    expect(TABLES.standard).toEqual({ w: 36, d: 54 })
    expect(createGame(bundle, { table: 'standard' }).scenario.table).toEqual({ w: 36, d: 54 })
    expect(new Set(Object.values(g.models).map((m) => m.base))).toEqual(new Set([25, 32, 40, 50]))
    expect(legalActions(g).length).toBeGreaterThan(0)
  })

  it('VIEW-001 a view carries the seat and the open decision', () => {
    const g = createDemoGame()
    const v = view(g, 'A')
    expect(v.seat).toBe('A')
    expect(v.pending.id).toBe(g.pending.id)
  })

  it('DECIDER-001 the random decider is reproducible per decision', async () => {
    const g = createDemoGame()
    const legal = legalActions(g)
    const d1 = await createRandomDecider('x').decide(view(g, 'A'), g.pending, legal)
    const d2 = await createRandomDecider('x').decide(view(g, 'A'), g.pending, legal)
    expect(d1).toEqual(d2)
  })

  it('APPLY-001 stale, wrong-seat and illegal actions are rejected with a code and the state is unchanged', () => {
    const g = createDemoGame()
    const ok = legalActions(g)[0]!
    for (const [bad, code] of [
      [{ ...ok, decisionId: 'd:999' }, 'E_STALE_DECISION'],
      [{ ...ok, seat: 'B' }, 'E_WRONG_SEAT'],
      [{ ...ok, type: 'turn.nonsense' }, 'E_NOT_LEGAL'],
    ] as [Action, string][]) {
      const r = apply(g, bundle, bad)
      expect(r.ok).toBe(false)
      expect(r.ok ? null : r.rejection.code).toBe(code)
      expect(r.state).toBe(g)
    }
  })

  it('FLOW-000 the placeholder flow alternates seats, logs actions, ends in a draw and replays from seed + log', () => {
    let g: GameState = createDemoGame('flow')
    let steps = 0
    while (g.phase !== 'over' && steps < 100) {
      const legal = legalActions(g)
      const r = apply(g, bundle, legal[steps % legal.length]!)
      expect(r.ok).toBe(true)
      g = r.state
      steps++
    }
    expect(g.phase).toBe('over')
    expect(g.result?.winner).toBeNull()
    expect(g.log.length).toBe(steps)
    expect(g.events.some((e) => e.type === 'DiceRolled')).toBe(true)
    let again = createDemoGame('flow')
    for (const a of g.log) { const r = apply(again, bundle, a); expect(r.ok).toBe(true); again = r.state }
    expect(JSON.stringify(again)).toBe(JSON.stringify(g))
    expect(apply(g, bundle, legalActions(g)[0]!).ok).toBe(false)
  })
})
