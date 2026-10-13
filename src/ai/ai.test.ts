import { describe, expect, it } from 'vitest'
import { emptyBundle } from '../data/bundle'
import { apply } from '../engine/apply'
import { legalActions } from '../engine/pending'
import { createDemoGame, createGame } from '../engine/setup'
import type { GameState, SeatId } from '../engine/types'
import { view } from '../engine/view'
import { loadBundle } from '../../tools/sim-core'
import { createAiDecider, policyFor, type AiDecider } from './decider'
import { DECISION_KINDS } from './types'
import { handleRequest } from './worker'
import { queryState } from './world'

describe('ai decider', () => {
  const bundle = emptyBundle('fixture')

  it('AI-001 every tier answers with a legal action, reproducibly per seed', () => {
    const g = createDemoGame('ai')
    const legal = legalActions(g)
    for (const tier of ['random', 'easy', 'normal'] as const) {
      const a = createAiDecider(tier, { seed: 's', bundle }).decideSync(view(g, 'A'), g.pending, legal).action
      const b = createAiDecider(tier, { seed: 's', bundle }).decideSync(view(g, 'A'), g.pending, legal).action
      expect(legal).toContainEqual(a)
      expect(a).toEqual(b)
    }
  })

  it('AI-002 the worker core answers a decide request', () => {
    const g = createDemoGame('ai')
    const r = handleRequest({ type: 'decide', id: 7, view: view(g, 'A'), pending: g.pending, legal: legalActions(g), tier: 'normal', seed: 's', memoryKey: 'k' }, bundle)
    expect(r?.type).toBe('action')
  })

  it('AI-003 every decision kind except turn.over has a policy entry', () => {
    for (const k of DECISION_KINDS) if (k !== 'turn.over') expect(policyFor(k), k).toBeTypeOf('function')
  })

  it('AI-004 the query shim carries the view and no hidden state', () => {
    const g = createDemoGame('ai')
    const q = queryState(view(g, 'A'), bundle)
    expect(q.models).toBe(g.models)
    expect(q.rng).not.toEqual(g.rng)
    expect(q.log).toEqual([])
  })

  it('AI-005 a normal-vs-random Founders game finishes with no rejected answer', () => {
    const real = loadBundle()
    let state: GameState = createGame(real, { seed: 'ai-005', seats: ['A', 'B'], armies: { A: 'terran-founders', B: 'zerg-founders' }, missionId: 'frontlines-skirmish', deploymentId: 'abandoned-camp' })
    const d: Record<SeatId, AiDecider> = {
      A: createAiDecider('normal', { seed: 'a', bundle: real, accepts: (a) => apply(state, real, a).ok }),
      B: createAiDecider('random', { seed: 'b', bundle: real }),
    }
    let n = 0
    while (state.phase !== 'over' && n < 2000) {
      const seat = state.pending.seat === 'all' ? state.seatOrder[0]! : state.pending.seat
      const r = apply(state, real, d[seat]!.decideSync(view(state, seat), state.pending, legalActions(state)).action)
      expect(r.ok).toBe(true)
      if (!r.ok) break
      state = r.state; n++
    }
    expect(state.phase).toBe('over')
    expect(d.A!.memory.stats.errors).toBe(0)
  }, 30000)
})
