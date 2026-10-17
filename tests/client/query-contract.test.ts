// Contract surface for the integrator queries: they exist, answer from the true state, and take placements.
import { afterEach, describe, expect, it } from 'vitest'
import { dieSucceeds, queries } from '../../src/client/contract'
import { succeeds } from '../../src/engine/dice'
import { newGame, resetGameStore, useGameStore } from '../../src/client/store/gameStore'
import { useSettingsStore } from '../../src/client/store/settingsStore'

afterEach(() => resetGameStore())

describe('contract integrator queries', () => {
  it('QCON-1 queries answer null without a game, and read the true state with one', () => {
    expect(queries.shootOptions('x')).toBeNull()
    expect(queries.detectorAreas()).toBeNull()
    useSettingsStore.getState().set({ speed: 0 }, false)
    expect(newGame({ seats: ['human', 'human'], seed: 'q', demo: true })).toBeNull()
    const s = useGameStore.getState().state!
    expect(queries.shootOptions('nobody')?.reason).toBe('notOnTable')
    expect(Array.isArray(queries.detectorAreas())).toBe(true)
    expect(queries.markerGeometry()!.contestRadius).toBeGreaterThan(0)
    expect(queries.readyPools(s.seatOrder[0]!)).toBeInstanceOf(Array)
    expect(queries.engaged('nobody', {})).toEqual(queries.engaged('nobody'))
  })

  it('QCON-2 dieSucceeds is the engine rule', () => {
    for (const tn of [null, 2, 4, 6]) for (let f = 1; f <= 6; f++) expect(dieSucceeds(f, tn)).toBe(succeeds(f, tn))
  })

  it('QCON-3 skipAbilityWindows is a plain boolean setting', () => {
    expect(typeof useSettingsStore.getState().skipAbilityWindows).toBe('boolean')
  })
})
