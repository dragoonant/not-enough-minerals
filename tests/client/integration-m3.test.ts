// M3 integration: the query additions the HUD reads (unitSupply, poolTable, detectedUnits), ?menu=1, and the seat-id
// label swap in the decision panel (spec 00 s10, spec 50 s4/s7).
import { afterEach, describe, expect, it } from 'vitest'
import * as query from '../../src/engine/query'
import { supplyFor } from '../../src/engine/supply'
import { readParams } from '../../src/client/params'
import { newGame, resetGameStore, useGameStore } from '../../src/client/store/gameStore'
import { prettify } from '../../src/client/interaction/text'

afterEach(() => resetGameStore())

function founders() {
  expect(newGame({ seats: ['human', 'bot'], seed: 'int-m3', matchup: 'founders', missionId: 'frontlines-skirmish' })).toBeNull()
  const g = useGameStore.getState()
  return { s: g.state!, b: g.bundle! }
}

describe('M3 integration', () => {
  it('UI-030 unitSupply is the engine Supply of each reserve unit (supplyFor, purpose pool)', () => {
    const { s, b } = founders()
    const units = Object.values(s.units)
    expect(units.length).toBeGreaterThan(0)
    for (const u of units) expect(query.unitSupply(s, b, u.id)).toBe(supplyFor(s, b, u.id, 'pool'))
  })

  it('UI-031 poolTable lists every Round, the last one unlimited (null)', () => {
    const { s, b } = founders()
    const rows = query.poolTable(s, b)
    expect(rows.map((r) => r.round)).toEqual(Array.from({ length: s.maxRounds ?? 0 }, (_, i) => i + 1))
    expect(rows[rows.length - 1]!.pool).toBeNull()
    expect(rows[0]!.pool).toBe(query.supplyStatus(s, b, 'A').pool)
  })

  it('UI-032 detectedUnits is empty before anything is on the table', () => {
    const { s, b } = founders()
    expect(query.detectedUnits(s, b)).toEqual([])
  })

  it('CLI-010 ?menu=1 keeps the start screen even with ?test=1; ?gallery alone opens the table', () => {
    expect(readParams('?test=1&menu=1')).toMatchObject({ test: true, menu: true, autostart: false })
    expect(readParams('?gallery').autostart).toBe(true)
    expect(readParams('?test=1').autostart).toBe(true)
  })

  it('UI-033 option labels name seats by player, but leave the article "A" alone', () => {
    const { s } = founders()
    expect(prettify(s, 'A activates first')).toBe('Player 1 activates first')
    expect(prettify(s, 'B holds the First Player Marker')).toBe('Player 2 (bot) holds the First Player Marker')
    expect(prettify(s, 'A Marine squad')).toBe('A Marine squad')
  })
})
