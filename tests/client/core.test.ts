import { emptyBundle } from '../../src/data/bundle'
import { afterEach, describe, expect, it } from 'vitest'
import { createDemoGame } from '../../src/engine/setup'
import { buildBeats } from '../../src/client/presentation/beats'
import { paramsLaunch, readParams } from '../../src/client/params'
import { dispatch, legalFor, newGame, resetGameStore, useGameStore } from '../../src/client/store/gameStore'
import { useSettingsStore } from '../../src/client/store/settingsStore'
import { usePresentedStore } from '../../src/client/presentation/presentedStore'
import { viewRoll } from '../../src/client/dice/diceView'
import { tintFor } from '../../src/client/figures/view'

afterEach(() => resetGameStore())

describe('client shell', () => {
  it('CLI-001 ?test=1&seats=human,bot&seed=x&tier=easy&matchup=tvp&mission=random parses and autostarts', () => {
    const p = readParams('?test=1&seats=human,bot&seed=x&tier=easy&matchup=tvp&mission=random&speed=fast')
    expect(p).toMatchObject({ test: true, seats: ['human', 'bot'], seed: 'x', tier: 'easy', matchup: 'tvp', mission: 'random', speed: 3, autostart: true })
    expect(paramsLaunch(p)).toMatchObject({ seats: ['human', 'bot'], seed: 'x', tier: 'easy', matchup: 'tvp', missionId: 'random' })
    expect(paramsLaunch(readParams('?matchup=demo'))).toMatchObject({ demo: true })
    expect(readParams('').autostart).toBe(false)
  })

  it('CLI-002 the store is the only apply caller: a demo game, a human answer, and the presented state catches up', () => {
    useSettingsStore.getState().set({ speed: 0 }, false)
    expect(newGame({ seats: ['human', 'bot'], seed: 'c', demo: true })).toBeNull()
    const s = useGameStore.getState().state!
    expect(s.seatOrder).toEqual(['A', 'B'])
    const roll = legalFor(s).find((a) => a.type === 'turn.roll')!
    expect(dispatch(roll, 'human')).toBeNull()
    expect(useGameStore.getState().state!.pending.seat).toBe('B')
    expect(dispatch(legalFor(useGameStore.getState().state)[0]!, 'human')?.code).toBe('E_CLIENT') // B is a bot seat
    expect(usePresentedStore.getState().state).toBe(useGameStore.getState().state)
    expect(usePresentedStore.getState().diceLog.length).toBe(1)
  })

  it('CLI-003 a roll becomes a dice beat and a turn banner; the tray shows D6 faces', () => {
    const before = createDemoGame('b')
    const roll = before.pending.options.find((o) => o.id === 'roll')!.action
    return import('../../src/engine/apply').then(({ apply }) => {
      const r = apply(before, emptyBundle('x'), roll)
      if (!r.ok) throw new Error('rejected')
      const beats = buildBeats(before, r.state, r.state.events.map((event, i) => ({ seq: i + 1, event })), roll)
      expect(beats.map((b) => b.cue.kind)).toEqual(['dice', 'banner'])
      const cue = beats[0]!.cue
      if (cue.kind !== 'dice') throw new Error('not dice')
      const v = viewRoll(cue, 'Test roll')
      expect(v.dice).toHaveLength(1)
      expect(v.dice[0]!.face).toBeGreaterThanOrEqual(1)
      expect(v.dice[0]!.face).toBeLessThanOrEqual(6)
    })
  })

  it('CLI-004 seat tints differ for the two sides', () => {
    expect(tintFor(0)).not.toEqual(tintFor(1))
  })
})
