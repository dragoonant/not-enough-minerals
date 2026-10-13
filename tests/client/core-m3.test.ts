// M3 client core: launch options, matchups, saves, the director's cues, and the bot gates (spec 50, spec 00 s3/s8).
import { afterEach, describe, expect, it } from 'vitest'
import { createBotDriver } from '../../src/client/bot/botDriver'
import { onCue } from '../../src/client/presentation/director'
import type { Cue } from '../../src/client/presentation/cues'
import { usePresentedStore } from '../../src/client/presentation/presentedStore'
import {
  dispatch, exportSave, importSave, legalFor, newGame, rematch, resetGameStore, saveGame, loadAutosave, useGameStore,
} from '../../src/client/store/gameStore'
import { DEFAULT_MATCHUP, MATCHUPS, missionChoices, deploymentChoices, resolveLaunch } from '../../src/client/store/launch'
import { useSettingsStore } from '../../src/client/store/settingsStore'
import { focus, useFocusStore } from '../../src/client/store/uiStore'

afterEach(() => resetGameStore())

/** Answer `n` decisions with the first non-pass legal action (deterministic), as the test source. */
function play(n: number): number {
  let done = 0
  for (let i = 0; i < n; i++) {
    const s = useGameStore.getState().state
    if (!s || s.phase === 'over') break
    const legal = legalFor(s)
    const a = legal.find((x) => x.type !== 'turn.pass') ?? legal[0]
    if (!a || dispatch(a, 'test') !== null) break
    done++
  }
  return done
}

describe('M3 client core', () => {
  it('CLI-010 the default launch is box-forces Terran vs Zerg, human vs bot, a real StarCraft game', () => {
    useSettingsStore.getState().set({ speed: 0 }, false)
    expect(DEFAULT_MATCHUP).toBe('founders')
    expect(newGame({ seed: 'f1' })).toBeNull()
    const g = useGameStore.getState()
    expect(g.controllers).toEqual({ A: 'human', B: 'bot' })
    expect(g.launch).toMatchObject({ matchup: 'founders', armies: ['terran-founders', 'zerg-founders'], demo: false })
    const s = g.state!
    expect(s.missionId).toBeTruthy()
    expect(s.deploymentId).toBeTruthy()
    expect(s.seats['A']!.faction).toBe('terran')
    expect(s.seats['B']!.faction).toBe('zerg')
    expect(Object.values(s.units).length).toBeGreaterThan(4)
    expect(legalFor(s).length).toBeGreaterThan(0)
  })

  it('CLI-011 every matchup sets up, mirrors included, and random cards are seeded', () => {
    useSettingsStore.getState().set({ speed: 0 }, false)
    for (const m of MATCHUPS) {
      expect(newGame({ matchup: m.id, seed: `m-${m.id}`, missionId: 'random', deploymentId: 'random' }), m.id).toBeNull()
      const s = useGameStore.getState().state!
      expect(s.seats['A']!.faction, m.id).toBe(m.races[0])
      expect(s.seats['B']!.faction, m.id).toBe(m.races[1])
    }
    const a = resolveLaunch({ missionId: 'random', deploymentId: 'random' }, 'seed-1')
    expect(resolveLaunch({ missionId: 'random', deploymentId: 'random' }, 'seed-1')).toEqual(a)
    expect(missionChoices('skirmish').map((c) => c.id)).toContain(a.missionId)
    expect(deploymentChoices('skirmish').map((c) => c.id)).toContain(a.deploymentId)
    expect(newGame({ seed: 'p', missionId: 'hold-position-skirmish', deploymentId: 'frontier' })).toBeNull()
    expect(useGameStore.getState().state).toMatchObject({ missionId: 'hold-position-skirmish', deploymentId: 'frontier' })
  })

  it('CLI-012 save and Continue replay the log to the same state; rematch keeps the launch with a new seed', () => {
    useSettingsStore.getState().set({ speed: 0 }, false)
    expect(newGame({ seed: 'sv', seats: ['bot', 'bot'], matchup: 'tvz', missionId: 'random' })).toBeNull()
    expect(play(25)).toBeGreaterThan(5)
    const before = useGameStore.getState().state!
    const save = exportSave()!
    expect(save.launch.matchup).toBe('tvz')
    expect(saveGame()).toBe(true)
    resetGameStore()
    expect(loadAutosave()).toBeNull()
    const after = useGameStore.getState().state!
    expect(after.events.length).toBe(before.events.length)
    expect(after.pending.id).toBe(before.pending.id)
    expect(importSave({ ...save, v: 1 })?.code).toBe('E_CLIENT')
    const seed = useGameStore.getState().seed
    expect(rematch()).toBeNull()
    expect(useGameStore.getState().launch?.matchup).toBe('tvz')
    expect(useGameStore.getState().seed).not.toBe(seed)
  })

  it('CLI-013 the director turns engine events into typed cues and the presented state snaps to the truth when idle', () => {
    useSettingsStore.getState().set({ speed: 0 }, false)
    const kinds = new Set<Cue['kind']>()
    const stages = new Set<string>()
    const off = onCue((c) => { kinds.add(c.kind); if (c.kind === 'attackStage') stages.add(c.data.step) })
    expect(newGame({ seed: 'cues', seats: ['bot', 'bot'] })).toBeNull()
    play(400)
    off()
    expect(usePresentedStore.getState().idle).toBe(true)
    expect(usePresentedStore.getState().state).toBe(useGameStore.getState().state)
    for (const k of ['banner', 'activation', 'arrival', 'move', 'dice'] as const) expect(kinds.has(k), k).toBe(true)
    if (kinds.has('attackStage')) {
      expect(stages.has('hit')).toBe(true)
      expect(usePresentedStore.getState().diceLog.some((r) => r.cue.kind === 'attackStage')).toBe(true)
    }
    expect(usePresentedStore.getState().feed.some((f) => typeof f.text === 'string' && f.text.length > 0)).toBe(true)
  })

  it('CLI-014 the bot answers only when the presentation is idle and the figures are ready; the watchdog forces after 5 s', () => {
    useSettingsStore.getState().set({ speed: 0 }, false)
    let t = 0
    const timers: { at: number; fn: () => void }[] = []
    const d = createBotDriver({ now: () => t, setTimeout: (fn, ms) => { const h = { at: t + ms, fn }; timers.push(h); return h }, clearTimeout: (h) => { const i = timers.indexOf(h as never); if (i >= 0) timers.splice(i, 1) } })
    expect(newGame({ seed: 'bot', seats: ['bot', 'bot'] })).toBeNull()
    expect(useFocusStore.getState().figuresReady).toBe(false)
    const v0 = useGameStore.getState().version
    expect(d.tick()).toBe('waiting')
    focus.setFiguresReady(true)
    expect(['thinking', 'answered']).toContain(d.tick())
    focus.setFiguresReady(false)
    t += 5001
    expect(d.tick()).toBe('forced')
    expect(useGameStore.getState().version).toBeGreaterThan(v0)
    expect(d.forced).toBe(1)
    d.stop()
  })
})
