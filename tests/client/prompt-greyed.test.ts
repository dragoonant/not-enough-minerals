// M7: greyed entries explain themselves (action menu + weapon panel from query.shootOptions), the odds row shows hitNotes,
// and the new decision kinds (melee.keywords, charge.impact split editor, RESPAWN/MORPH/Advanced Training steps) read in plain words.
import { createElement } from 'react'
import { renderToString } from 'react-dom/server'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'

import { newGame, resetGameStore, useGameStore } from '../../src/client/store/gameStore'
import { useSettingsStore } from '../../src/client/store/settingsStore'
import { Prompt } from '../../src/client/interaction/Prompt'
import { draft } from '../../src/client/interaction/store'
import { classify, mentionedUnits, stepLine } from '../../src/client/interaction/kinds'
import { blockedTargetRows, hitNoteLine, offWeaponRows, shootBlockedWhy } from '../../src/client/interaction/text'
import type { DecisionOption, PendingDecision } from '../../src/engine/types'

const opt = (id: string, type: string, fields: Record<string, unknown> = {}): DecisionOption => ({ id, label: id, action: { ...fields, type, decisionId: 'd1', seat: 'A' } })
const pend = (kind: string, options: DecisionOption[], context: Record<string, unknown> = {}): PendingDecision => ({ id: 'd1', seat: 'A', kind, context, options, canPass: false })

let mine = '', foe = ''
function show(p: PendingDecision): string {
  useGameStore.setState({ state: { ...useGameStore.getState().state!, pending: p } })
  draft.sync(p.id)
  return renderToString(createElement(Prompt, { pending: p }))
}

beforeEach(() => {
  useSettingsStore.getState().set({ speed: 0 }, false)
  expect(newGame({ seats: ['human', 'bot'], seed: 'greyed', matchup: 'founders', missionId: 'frontlines-skirmish' })).toBeNull()
  const s = useGameStore.getState().state!
  const units = Object.values(s.units)
  mine = units.find((u) => u.owner === s.seatOrder[0])!.id
  foe = units.find((u) => u.owner === s.seatOrder[1])!.id
})
afterEach(() => resetGameStore())

describe('greyed entries', () => {
  const sh = (over: object = {}) => ({ canShoot: true, weapons: [
    { weaponId: 'live', name: 'Live gun', eligible: true, targets: [
      { targetUnitId: 'T1', eligible: true, printedHit: 4, hitTN: 5, hitNotes: ['cover', 'longRange'] },
      { targetUnitId: 'T2', eligible: false, text: 'No line of sight.' },
    ] },
    { weaponId: 'off', name: 'Sleepy gun', eligible: false, text: 'Already fired this Round.', targets: [] },
  ], ...over })

  it('M7-001 Ranged Attack is greyed in the action menu with the engine reason', () => {
    expect(shootBlockedWhy(sh())).toBe('')
    expect(shootBlockedWhy(sh({ canShoot: false, text: 'Already fired this Round.' }))).toBe('Already fired this Round.')
    expect(shootBlockedWhy(sh({ canShoot: false }))).toBe('Already fired this Round.')
    expect(shootBlockedWhy({ canShoot: false, weapons: [] })).toMatch(/legal target/)
    expect(shootBlockedWhy(null)).toBe('')
  })

  it('M7-002 the weapon panel keeps unavailable weapons and blocked targets with their reasons', () => {
    expect(offWeaponRows(sh(), ['live'])).toEqual([{ weaponId: 'off', name: 'Sleepy gun', why: 'Already fired this Round.' }])
    expect(blockedTargetRows(sh(), 'live', ['T1'])).toEqual([{ unitId: 'T2', why: 'No line of sight.' }])
    expect(blockedTargetRows(sh(), 'live', ['T1', 'T2'])).toEqual([])
    expect(blockedTargetRows(sh(), 'nope', [])).toEqual([])
  })

  it('M7-003 the odds row explains a Hit number that differs from the printed one', () => {
    const t = sh().weapons[0]!.targets[0]!
    expect(hitNoteLine(t)).toBe('Hit 5+ instead of the printed 4+: the target is in cover, some models are at long range.')
    expect(hitNoteLine({ printedHit: 4, hitTN: 4 })).toBe('')
    expect(hitNoteLine(undefined)).toBe('')
  })
})

describe('new decision kinds', () => {
  it('M7-010 melee.keywords is a labelled list that glows the pool it names', () => {
    const p = pend('melee.keywords', [opt('kw:a', 'melee.keywords', { unitId: mine, key: 'k', to: foe }), opt('kw:even', 'melee.keywords', { unitId: mine, key: 'k', to: 'even' })], { kw: 'PRECISION', x: 2, targets: [foe] })
    expect(classify(p)).toBe('list')
    expect(stepLine(p)).toMatch(/precision \(2\).*one enemy squad.*evenly/)
    expect(mentionedUnits(p.options[0]!.action)).toContain(foe)
    expect(show(p)).toContain('Share out a keyword bonus')
  })

  it('M7-011 charge.impact offers a model-by-model editor that keeps each model total at X', () => {
    const p = pend('charge.impact', [opt('even', 'charge.impact', { unitId: mine, even: true }), opt('custom', 'charge.impact', { unitId: mine, custom: true })], { unitId: mine, x: 3, y: 4, targets: ['T1', 'T2'], ranked: [{ modelId: 'm1', targets: ['T1', 'T2'] }] })
    const html = show(p)
    expect(html).toContain('data-testid="impact-custom"')
    expect(html).not.toContain('data-testid="opt-custom"')
    expect(stepLine(p)).toMatch(/3 dice/)
  })

  it('M7-012 ability.target steps explain RESPAWN, MORPH and the Advanced Training choice', () => {
    const respawn = pend('ability.target', [opt('skip', 'ability.target', { mode: 'skip' })], { cont: { k: 'newModel', op: 'respawn', ids: ['a', 'b', 'c'], pts: [{ x: 1, z: 1 }] }, points: [] })
    expect(stepLine(respawn)).toMatch(/RESPAWN.*2 of up to 3.*stop early/)
    const morph1 = pend('ability.target', [], { cont: { k: 'newModel', op: 'morph', ids: [], pts: [], x: 2 } })
    expect(stepLine(morph1)).toMatch(/MORPH.*spot/)
    const morph2 = pend('ability.target', [], { cont: { k: 'newModel', op: 'morph', ids: [], pts: [{ x: 0, z: 0 }], x: 2, removed: ['a'] } })
    expect(stepLine(morph2)).toMatch(/pick 1 model /)
    const train = pend('ability.target', [opt('costReaction:use', 'ability.target', { mode: 'costReaction', use: true })], { cont: { k: 'costReact', flow: {} }, prompt: 'Advanced Training?' })
    expect(stepLine(train)).toMatch(/Reaction/)
    expect(show(train)).toContain('data-testid="ix-step-line"')
  })
})
