import { describe, expect, it } from 'vitest'
import { emptyBundle } from '../data/bundle'
import { legalActions } from '../engine/pending'
import { createDemoGame } from '../engine/setup'
import { view } from '../engine/view'
import { createAiDecider } from './decider'
import { handleRequest } from './worker'

describe('ai skeleton', () => {
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
})
