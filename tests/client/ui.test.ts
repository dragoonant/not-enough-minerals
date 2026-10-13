// M3 HUD (spec 50 s4): briefing text from real mission data, odds rows, VP breakdown, emblems, testid coverage.
import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { createElement } from 'react'
import { renderToString } from 'react-dom/server'
import { afterEach, describe, expect, it } from 'vitest'
import { getBundle } from '../../src/client/contract'
import { newGame, resetGameStore, useGameStore } from '../../src/client/store/gameStore'
import { useSettingsStore } from '../../src/client/store/settingsStore'
import { EMBLEMS, emblemFor, EMBLEM_FALLBACK } from '../../src/client/theme'
import { Hud } from '../../src/client/ui/Hud'
import { Tip } from '../../src/client/ui/Tooltip'
import { GENERAL_HINTS, attackOddsRows, briefingModel, chargeOddsRows, hintFor, pct, poolText, scoringLines, statusWords, vpBreakdown, evadeWords, neverDeployed, rosterLine } from '../../src/client/ui/hudView'
import { feedLines } from '../../src/client/ui/feedView'
import { reasonText } from '../../src/client/ui/GameOver'
import { pickHold } from '../../src/client/ui/PhaseBar'
import type { AttackPreview } from '../../src/engine/query'
import type { DecisionOption } from '../../src/engine/types'

afterEach(() => resetGameStore())

const ui = join(process.cwd(), 'src/client/ui')
const allUiSource = (): string => readdirSync(ui).filter((f) => /\.(tsx|ts)$/.test(f)).map((f) => readFileSync(join(ui, f), 'utf8')).join('\n')

const preview = (over: Partial<AttackPreview> = {}): AttackPreview => ({
  attackerUnitId: 'a', weaponId: 'w', targetUnitId: 't', legal: true, perModel: [{ modelId: 'm1', dice: 2, hitTN: 4 }, { modelId: 'm2', dice: 2, hitTN: 5 }],
  surge: { dice: 'D3', tagMatch: true, expected: 1.2 }, armourTN: 5, evadeTN: null, evadeReason: 'target is not eligible', expectedDamage: 2.34,
  modelsRemoved: [0.5, 0.5], killChance: 0.5, expectedSupplyRemoved: 0.5, ...over,
})

describe('M3 HUD', () => {
  it('UI-001 every spec 50 s4 testid exists in the HUD source', () => {
    const src = allUiSource()
    for (const id of ['phase-bar', 'pass-button', 'supply-hud', 'reserves-tray', 'objective-tracker', 'briefing', 'briefing-open', 'odds-panel', 'unit-card', 'weapon-panel', 'event-feed', 'game-over']) {
      expect(src, id).toContain(`"${id}"`)
    }
  })

  it('UI-002 the briefing reads every mission in the data: names, length, scoring lines in our words', () => {
    useSettingsStore.getState().set({ speed: 0 }, false)
    expect(newGame({ seed: 'ui' })).toBeNull()
    const b = getBundle()!
    expect(b.records.missions.length).toBeGreaterThan(5)
    for (const m of b.records.missions) {
      const model = briefingModel(m, 'Some Deployment')
      expect(model.missionName).toBe(m.name)
      expect(model.gameLength).toBe(m.gameLength)
      expect(model.scoring).toHaveLength(m.scoring.length)
      for (const l of [model.summary, ...model.scoring, poolText(model)]) { expect(l.length).toBeGreaterThan(10); expect(l).not.toMatch(/undefined|NaN|\[object/) }
    }
    expect(scoringLines([{ kind: 'markerControlled', marker: 3, vp: 2, fromRound: 2 }])[0]).toContain('marker 3')
  })

  it('UI-003 a started game exposes the briefing inputs: mission, deployment, markers and the first-turn hints', () => {
    expect(newGame({ seed: 'ui2' })).toBeNull()
    const s = useGameStore.getState().state!
    expect(s.missionId && s.deploymentId).toBeTruthy()
    expect(GENERAL_HINTS.length).toBeGreaterThanOrEqual(5)
    expect(hintFor(s.pending.kind) === null || typeof hintFor(s.pending.kind) === 'string').toBe(true)
    expect(hintFor('turn.activate')).toContain('click')
    expect(hintFor('no.such.kind')).toBeNull()
  })

  it('UI-004 odds rows show the face needed, the Evade reason and never a blank die', () => {
    const rows = attackOddsRows(preview())
    expect(rows.find((r) => r.label === 'Hit on')!.value).toBe('4+ / 5+')
    expect(rows.find((r) => r.label === 'Armour')!.value).toBe('5+')
    expect(rows.find((r) => r.label === 'Evade')!.value).toContain('No Evade roll (target is not eligible)')
    expect(attackOddsRows(preview({ evadeReason: 'noEvade' })).find((r) => r.label === 'Evade')!.value).not.toContain('noEvade')
    expect(evadeWords('engagedRanged')).toBe('engaged in melee and shot at')
    expect(rows.find((r) => r.label === 'Expected damage')!.value).toBe('2.3')
    expect(rows.find((r) => r.label === 'Kill chance')!.value).toBe('50%')
    expect(attackOddsRows(preview({ legal: false, reason: 'Out of range' }))[0]).toMatchObject({ tone: 'bad', value: 'Out of range' })
    expect(chargeOddsRows({ targets: ['t'], needed: 7, chance: 0.4167 })[1]!.value).toBe('42%')
    expect(chargeOddsRows({ targets: ['t'], needed: null, chance: 0, reason: 'outOfReach' })[0]!.value).toBe('Out of reach')
    expect(pct(2)).toBe('100%')
  })

  it('UI-005 status words follow the Phase and skip units that are off the table', () => {
    expect(statusWords({ effects: [{ kind: 'status', status: 'SIEGE_MODE' }, { kind: 'debuff', stat: 'speed', x: 2 }], shielded: true, inCoherency: false, activation: 'movement' }))
      .toEqual(['Activated (movement)', 'Shielded', 'Out of coherency', 'Siege mode', 'Debuff speed 2'])
    const u = { effects: [{ kind: 'status', status: 'STATIONARY' }], shielded: false, inCoherency: true, activation: 'movement', location: 'table' }
    expect(statusWords(u, 'assault')).toEqual(['Stationary'])
    expect(statusWords(u, 'movement')).toEqual(['Activated this Phase', 'Stationary'])
    expect(statusWords({ ...u, location: 'reserves' }, 'movement')).toEqual([])
  })

  it('UI-006 the VP breakdown sums End of Round score cues per seat and Round', () => {
    const feed = [
      { id: 1, seq: 1, text: null, cue: { kind: 'score', seat: 'A', vp: 3, source: 'round', round: 1, lines: [{ rule: 'supplyDestroyed', vp: 1 }, { rule: 'perControlledMarker', vp: 2 }] } },
      { id: 2, seq: 2, text: null, cue: { kind: 'score', seat: 'B', vp: 1, source: 'round', round: 1, lines: [] } },
      { id: 3, seq: 3, text: null, cue: { kind: 'score', seat: 'A', vp: 2, source: 'round', round: 2 } },
      { id: 4, seq: 4, text: null, cue: { kind: 'score', seat: 'A', vp: 9, source: 'ability', round: 2 } },
    ] as unknown as Parameters<typeof vpBreakdown>[0]
    const out = vpBreakdown(feed)
    expect(out['A']!.map((r) => r.vp)).toEqual([3, 2])
    expect(out['A']![0]!.lines).toHaveLength(2)
    expect(out['B']![0]!.vp).toBe(1)
  })

  it('UI-007 Hold is picked for the selected unit, and reasons name players not seat ids', () => {
    const o = (id: string, type: string, unitId: string): DecisionOption => ({ id, label: id, action: { type, decisionId: 'd', seat: 'A', unitId } })
    const opts = [o('u1:hold', 'turn.hold', 'u1'), o('u2:hold', 'turn.hold', 'u2'), o('u1:move', 'turn.activate', 'u1')]
    expect(pickHold(opts, 'u2')!.id).toBe('u2:hold')
    expect(pickHold(opts, null)).toBeNull()
    expect(pickHold([o('h', 'move.hold', 'u9')], null)!.id).toBe('h')
    expect(reasonText('A led by 8 VP or more, which ends the game at once.', ['A', 'B'])).toMatch(/^Player 1 led by 8 VP/)
    expect(reasonText('Round 5 ended. B finishes with the most VP.', ['A', 'B'])).toMatch(/Player 2.* finishes/)
  })

  it('UI-008 three original emblems: distinct, plain geometry, no external references', () => {
    const marks = Object.values(EMBLEMS)
    expect(marks).toHaveLength(3)
    expect(new Set(marks).size).toBe(3)
    for (const m of [...marks, EMBLEM_FALLBACK]) { expect(m).not.toMatch(/href|http|image|<text/i); expect(m).toMatch(/currentColor/) }
    expect(emblemFor('nonesuch')).toBe(EMBLEM_FALLBACK)
    expect(emblemFor(null)).toBe(EMBLEM_FALLBACK)
  })

  it('UI-009 the HUD renders with no game and the shared Tip leaves an untitled child alone', () => {
    const html = renderToString(createElement(Hud))
    expect(html).toContain('data-testid="phase-bar"')
    expect(html).toContain('data-testid="rail-left"')
    expect(html).toContain('data-testid="rail-right"')
    const bare = renderToString(createElement(Tip, { children: createElement('button', null, 'x') }))
    expect(bare).toBe('<button>x</button>')
    const shown = renderToString(createElement(Tip, { title: 'T', body: 'B', children: createElement('button', null, 'x') }))
    expect(shown).toContain('<button')
  })

  it('UI-010 rails are keyed by the frozen focus rails and collapse to tabs', () => {
    const src = readFileSync(join(ui, 'bits.tsx'), 'utf8')
    expect(src).toContain('focus.toggleRail')
    expect(src).toContain('rail-tabs')
    expect(statSync(join(ui, 'Tooltip.tsx')).size).toBeGreaterThan(500)
  })

  it('UI-020 the feed narrates actions, adds Phase headers, drops empty saves and labels roll-offs', () => {
    const e = (id: number, cue: unknown, text: string | null = null) => ({ id, seq: id, text, cue }) as never
    const out = feedLines([
      e(1, { kind: 'banner', tone: 'phase', text: 'Combat Phase', round: 2, phase: 'combat', seat: null }, 'Combat Phase'),
      e(2, { kind: 'dice', purpose: 'initiative', dice: [{ face: 6 }, { face: 5 }], rolls: [] }, 'x'),
      e(3, { kind: 'attackStage', step: 'armour', data: { step: 'armour', tn: 5, dice: [], saved: 0, tough: 0, toDamage: 0 } }, 'Armour saves 0.'),
      e(4, { kind: 'attackStage', step: 'hit', data: { step: 'hit', hits: 2, precision: 0 } }, '2 hits.'),
      e(5, { kind: 'arrival', unitId: 'u9', stage: 'arrived', entry: { kind: 'edge', segment: 1 } }, 'u9 arrives on the table.'),
      e(6, { kind: 'score', seat: 'A', vp: 0, source: 'round', round: 2 }, 'x'),
    ], null)
    expect(out[0]).toMatchObject({ head: true, text: 'Round 2: Combat Phase' })
    expect(out.some((l) => l.text === 'Armour saves 0.')).toBe(false)
    expect(out.find((l) => l.text.startsWith('Roll-Off'))!.text).toContain('6, 5')
    expect(out.find((l) => l.text.includes('deploys'))!.text).toContain('Entry Edge 2')
    expect(out.filter((l) => l.head).map((l) => l.text)).toEqual(['Round 2: Combat Phase', 'Round 2: Scoring Phase'])
  })

  it('UI-021 rosters split destroyed models from models that never deployed', () => {
    const feed = [{ id: 1, seq: 1, text: null, cue: { kind: 'casualties', unitId: 'z1', modelIds: ['a', 'b', 'c'], cause: 'reserveSweep', destroyed: false } }] as never
    expect(neverDeployed(feed)).toEqual({ z1: 3 })
    expect(rosterLine({ location: 'table', damage: 0 }, 12, 1, 3)).toBe('1 of 12 models standing (8 destroyed, 3 never deployed), damage 0')
    expect(rosterLine({ location: 'reserves', damage: 0 }, 12, 12, 0)).toContain('never deployed')
  })
})
