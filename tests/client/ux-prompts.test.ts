// UX follow-ups (M3 client list): reserves hint, Run wording, ability prompt text, move cues, tolerant ability narration,
// edge-label inset, skip-ability-window setting.
import { afterEach, describe, expect, it } from 'vitest'
import { hintFor, verbOf } from '../../src/client/interaction/kinds'
import { firstChoiceWords, firstSentence, poolLine, readyPools } from '../../src/client/interaction/text'
import { moveHowOf } from '../../src/client/presentation/beats'
import { narrate, setLabelContext } from '../../src/client/presentation/labels'
import { edgeLabelAt } from '../../src/client/board/Labels'
import { useSettingsStore } from '../../src/client/store/settingsStore'
import type { DecisionOption, GameState, PendingDecision } from '../../src/engine/types'

const opt = (id: string, type: string, fields: Record<string, unknown> = {}): DecisionOption => ({ id, label: id, action: { ...fields, type, decisionId: 'd1', seat: 'A' } })
const pend = (kind: string, options: DecisionOption[], context: Record<string, unknown> = {}): PendingDecision => ({ id: 'd1', seat: 'A', kind, context, options, canPass: true })

afterEach(() => useSettingsStore.setState({ skipAbilityWindows: false }, false))

describe('UX prompts', () => {
  it('UX-001 the glowing-squad advice is replaced when every squad is in Reserves', () => {
    const p = pend('turn.activate', [opt('a', 'deploy.go', { unitId: 'A1' }), opt('b', 'deploy.go', { unitId: 'A2' })])
    expect(hintFor(p, () => false)).toMatch(/Reserves/)
    expect(hintFor(p, () => false)).not.toMatch(/glowing/)
    expect(hintFor(p, (id) => id === 'A1')).toMatch(/glowing/)
  })
  it('UX-002 Run no longer points at the rules card; mission actions get a verb hint', () => {
    expect(verbOf(opt('run', 'move.run', { unitId: 'A1' })).hint).not.toMatch(/rules card/)
    const g = verbOf(opt('gather:1', 'mission.gather', { unitId: 'A1', marker: 1 }))
    expect(g.hint).toMatch(/Mission/)
  })
  it('UX-003 pools and effect lines read from the seat cards', () => {
    const st = { cards: { A: [
      { id: 'x', kind: 'tactical', exhausted: false, resource: { res: 'CP', n: 2 }, usage: {} },
      { id: 'y', kind: 'tactical', exhausted: true, resource: { res: 'CP', n: 3 }, usage: {} },
    ] } } as unknown as GameState
    expect(readyPools(st, 'A')).toEqual([{ res: 'CP', n: 2 }])
    expect(poolLine(st, 'A', 'CP')).toBe('You have 2 CP ready.')
    expect(poolLine(st, 'A', 'BM')).toMatch(/no BM/)
    expect(firstSentence('One. Two.')).toBe('One.')
  })
  it('UX-004 turn.first labels are neutral words', () => {
    setLabelContext({ controllers: { A: 'human', B: 'bot' }, seatOrder: ['A', 'B'] })
    expect(firstChoiceWords('A', 'A')).toBe('I take the first turn')
    expect(firstChoiceWords('A', 'B')).toMatch(/Player 2/)
  })
})

describe('UX presentation', () => {
  it('UX-010 Run, Move and Disengage cues are told apart', () => {
    expect(moveHowOf({ type: 'move.path', kind: 'run' } as never)).toBe('run')
    expect(moveHowOf({ type: 'move.path', kind: 'move' } as never)).toBe('move')
    expect(moveHowOf({ type: 'move.path', kind: 'disengage' } as never)).toBe('disengage')
    expect(moveHowOf({ type: 'deploy.path' } as never)).toBe('deploy')
    const base = { kind: 'move' as const, modelId: 'm', points: [], unitId: 'A1', lead: true }
    expect(narrate(null, { ...base, how: 'run' })).toMatch(/runs/)
    expect(narrate(null, { ...base, how: 'move' })).toMatch(/advances/)
    expect(narrate(null, { ...base, how: 'run', lead: false })).toBeNull()
  })
  it('UX-011 ability-use notes narrate whatever shape the event takes', () => {
    setLabelContext({ bundle: null, controllers: {}, seatOrder: [] })
    for (const ev of [{ type: 'ability.use', abilityId: 'x-ray' }, { type: 'abilityUsed', ability: 'x-ray' }, { type: 'ability.action', id: 'x-ray' }]) {
      expect(narrate(null, { kind: 'note', event: ev as never })).toMatch(/X ray|x-ray|Xray/i)
    }
    expect(narrate(null, { kind: 'note', event: { type: 'markerSomething' } as never })).toBeNull()
  })
  it('UX-012 edge captions step inward from a side edge but stay on the line for top and bottom', () => {
    const table = { w: 44, d: 30 }
    const side = edgeLabelAt({ x: -22, z: 0 }, table)
    expect(side[0]).toBeGreaterThan(-22)
    expect(Math.abs(side[0])).toBeLessThan(22 - 3)
    const top = edgeLabelAt({ x: 0, z: -15 }, table)
    expect(top[0]).toBe(0)
    expect(top[2]).toBeGreaterThan(-15)
  })
})

describe('UX settings', () => {
  it('UX-020 skipAbilityWindows defaults off and persists as part of the settings', () => {
    expect(!!useSettingsStore.getState().skipAbilityWindows).toBe(false)
    useSettingsStore.getState().set({ skipAbilityWindows: true }, false)
    expect(useSettingsStore.getState().skipAbilityWindows).toBe(true)
  })
})
