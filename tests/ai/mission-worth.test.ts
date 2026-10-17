import { describe, expect, it } from 'vitest'
import { createGame } from '../../src/engine/setup'
import { view } from '../../src/engine/view'
import { legalActions } from '../../src/engine/pending'
import { makeContext } from '../../src/ai/decider'
import { markerWorth } from '../../src/ai/moves'
import { newMemory } from '../../src/ai/types'
import { loadBundle } from '../../tools/sim-core'

const bundle = loadBundle()
const ctxFor = (missionId: string) => {
  const state = createGame(bundle, { seed: 'mw', seats: ['A', 'B'], armies: { A: 'terran-starter', B: 'zerg-starter' }, missionId, deploymentId: 'abandoned-camp' })
  const seat = state.pending.seat === 'all' ? state.seatOrder[0]! : state.pending.seat
  return makeContext('normal', view(state, seat), state.pending, legalActions(state), { seed: 'mw', bundle }, newMemory())
}

describe('markerWorth', () => {
  it('prices a marker by what the Mission Card pays for it', () => {
    const own = (id: string) => { const c = ctxFor(id); return c.q.markers.filter((m) => m.onTable).map((m) => markerWorth(c, m.n)) }
    // Gather the Resources pays only for enemy-colour markers; Frontlines pays 1 VP for any held marker
    expect(Math.min(...own('gather-the-resources-skirmish'))).toBe(0)
    expect(Math.max(...own('gather-the-resources-skirmish'))).toBeGreaterThanOrEqual(2)
    expect(Math.min(...own('frontlines-skirmish'))).toBeGreaterThanOrEqual(1)
  })
})
