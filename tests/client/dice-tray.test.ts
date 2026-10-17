import { describe, expect, it } from 'vitest'
import type { ShownRoll } from '../../src/client/contract'
import { buildBatchView, damageLine } from '../../src/client/dice/diceView'

type Data = Extract<ShownRoll['cue'], { kind: 'attackStage' }>['data']
let n = 0
const stage = (data: Data, batchId = 'b1'): ShownRoll => ({
  id: ++n, startedAt: 0, durationMs: 0,
  cue: { kind: 'attackStage', batchId, step: data.step, data, dice: [], rolls: [], attackerUnitId: 'u1', targetUnitId: 'u2', weaponId: 'c-14-rifle' },
})

describe('dice tray working', () => {
  const hit = stage({ step: 'hit', groups: [{ count: 4, tn: 4, faces: [6, 2, 4, 5] }], hits: 3, precision: 0, surge: { die: 5, result: 5 }, armourPool: 3 })
  const surge = stage({ step: 'surge', tagMatch: true, surgeResult: 5, surgeMoved: 1, critMoved: 0, dodge: 0 })
  const armour = stage({ step: 'armour', tn: 5, dice: [5, 2], saved: 1, tough: 0, toDamage: 1 })
  const evade = stage({ step: 'evade', eligible: false, reasons: ['no_evade'], base: null })
  const dmg = stage({ step: 'damage', dice: 2, perDie: 2, newDamage: 4, marker: 1, total: 5 })
  const other = stage({ step: 'damage', dice: 1, perDie: 1, newDamage: 1, marker: 0, total: 1 }, 'b2')
  const log = [hit, surge, armour, evade, dmg, other]

  it('DICE-T1 folds one Batch: attack dice vs the Hit TN, Surge match, armour, evade and the damage line', () => {
    const v = buildBatchView(log, dmg)!
    expect(v.batchId).toBe('b1')
    expect(v.attack?.groups[0]?.tn).toBe(4)
    expect(v.attack?.groups[0]?.dice.map((d) => d.pass)).toEqual([true, false, true, true])
    expect(v.attack?.hits).toBe(3)
    expect(v.surge).toMatchObject({ face: 5, match: true, moved: 1 })
    expect(v.armour).toMatchObject({ tn: 5, saved: 1, toDamage: 1 })
    expect(v.evade).toMatchObject({ eligible: false })
    expect(v.totals).toEqual({ hits: 3, saved: 1, evaded: null, damage: 5 })
    expect(damageLine(v.damage!)).toBe('1 marked + 4 new = 5')
  })
  it('DICE-T2 steps not yet shown stay hidden, and the tumbling step is held back', () => {
    const early = buildBatchView(log, surge)!
    expect(early.armour).toBeNull()
    expect(early.damage).toBeNull()
    expect(early.totals.damage).toBeNull()
    const rolling = buildBatchView(log, surge, true)!
    expect(rolling.surge).toMatchObject({ match: null })
  })
  it('DICE-T3 a plain dice cue has no batch view', () => {
    const plain: ShownRoll = { id: ++n, startedAt: 0, durationMs: 0, cue: { kind: 'dice', purpose: 'charge', dice: [], rolls: [] } }
    expect(buildBatchView([plain], plain)).toBeNull()
  })
  it('DICE-T4 no damage reads as no damage', () => {
    const none = buildBatchView([stage({ step: 'damage', dice: 0, total: 0 }, 'b3')], stage({ step: 'damage', dice: 0, total: 0 }, 'b3'))!
    expect(damageLine(none.damage!)).toBe('No damage')
  })
})

describe('dice tray targets and outcomes', () => {
  it('DICE-T3 the tray colours dice with the engine dice.succeeds (natural 6 passes, natural 1 fails, null TN fails)', async () => {
    const { dieSucceeds } = await import('../../src/client/contract')
    const { succeeds } = await import('../../src/engine/dice')
    for (const tn of [null, 2, 3, 4, 5, 6]) for (let f = 1; f <= 6; f++) expect(dieSucceeds(f, tn), `face ${f} tn ${tn}`).toBe(succeeds(f, tn))
  })
  it('DICE-T4 a null TN reads as a failure, a natural 6 as a success, and the TN is spelled out', async () => {
    const { needsText } = await import('../../src/client/dice/diceView')
    const g = buildBatchView([], stage({ step: 'armour', tn: null, dice: [6, 1], saved: 0, tough: 0, toDamage: 2 }, 'b9'))!
    expect(g.armour?.dice.map((d) => d.pass)).toEqual([false, false])
    const h = buildBatchView([], stage({ step: 'hit', groups: [{ count: 2, tn: 6, faces: [6, 5] }], hits: 1, precision: 0, surge: { die: 3, result: 3 }, armourPool: 1 }, 'b8'))!
    expect(h.attack?.groups[0]?.dice.map((d) => d.pass)).toEqual([true, false])
    expect(needsText(4)).toBe('needs 4+')
    expect(needsText(null)).toMatch(/no target/)
  })
  it('DICE-T5 plain rolls name the owner and what was needed', async () => {
    const { plainTitle } = await import('../../src/client/dice/diceView')
    expect(plainTitle('Charge roll', 'Player 1', 7)).toBe('Player 1: Charge roll (needed 7)')
    expect(plainTitle('Roll-Off', 'Player 2', null)).toBe('Player 2: Roll-Off')
  })
})
