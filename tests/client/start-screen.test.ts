import { userInfo } from 'node:os'
import { describe, expect, it } from 'vitest'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { StartScreen, seatsFor } from '../../src/client/ui/StartScreen'
import { DEFAULT_MATCHUP, FORCES, MATCHUPS, RACES, deploymentChoices, matchupForRaces, matchupOf, missionChoices } from '../../src/client/store/launch'
import { deploymentPreview, missionPreview } from '../../src/client/ui/start/scenarioPreview'

describe('start screen', () => {
  it('START-001 renders the title, fan notice, credit, race pickers and start button', () => {
    const html = renderToStaticMarkup(createElement(StartScreen))
    expect(html).toContain('Not Enough Minerals')
    expect(html).toContain('data-testid="fan-notice"')
    expect(html).toContain('not affiliated with Archon Studio or Blizzard Entertainment')
    expect(html).toContain('evilgouki')
    expect(html).toContain('data-testid="start-button"')
    expect(html).toContain('data-testid="race-picker"')
    expect(html).toContain('data-testid="race-protoss"')
    expect(html).toContain('data-testid="foe-zerg"')
    expect(html).toContain('data-testid="emblem-protoss"')
    // Privacy: no home path and not the local account name (read at run time, never written into the repo).
    expect(html).not.toMatch(/C:\\Users/i)
    const who = userInfo().username.toLowerCase()
    if (who.length > 2) expect(html.toLowerCase()).not.toContain(who)
  })
  it('START-002 the default matchup is the Founders box and every faction starter is offered, Protoss included', () => {
    expect(DEFAULT_MATCHUP).toBe('founders')
    expect(MATCHUPS[0]?.id).toBe('founders')
    const races = new Set(MATCHUPS.flatMap((m) => m.races))
    expect(races).toEqual(new Set(['terran', 'zerg', 'protoss']))
    expect(MATCHUPS.some((m) => m.armies.includes('protoss-starter'))).toBe(true)
  })
  it('START-005 every race pairing maps to a starter-force matchup with your race on your side', () => {
    for (const mine of RACES) for (const theirs of RACES) {
      const { matchup, side } = matchupForRaces(mine, theirs)
      const m = matchupOf(matchup)!
      expect(m.preset, `${mine} v ${theirs}`).toBeUndefined()
      expect(m.armies.every((a) => a.endsWith('-starter'))).toBe(true)
      expect(m.races[side]).toBe(mine)
      expect(m.races[1 - side]).toBe(theirs)
    }
  })
  it('START-006 every race pairing x forces maps to a matchup with your race on your side; expanded presets muster legally', async () => {
    const { loadBundle } = await import('../../tools/sim-core')
    const { validateArmy, musterArmy } = await import('../../src/engine/army')
    const { presetDef } = await import('../../src/engine/edition')
    const bundle = loadBundle()
    for (const forces of FORCES) for (const mine of RACES) for (const theirs of RACES) {
      const { matchup, side } = matchupForRaces(mine, theirs, forces)
      const m = matchupOf(matchup)!
      expect(m.armies.every((a) => a.endsWith(forces === 'expanded' ? '-expanded' : '-starter')), `${forces} ${mine} v ${theirs}`).toBe(true)
      expect(m.races[side]).toBe(mine)
      expect(m.races[1 - side]).toBe(theirs)
    }
    for (const id of ['terran-expanded', 'zerg-expanded', 'protoss-expanded']) {
      const list = presetDef(bundle, id)!
      expect(list, id).toBeTruthy()
      expect(validateArmy(bundle, list), id).toEqual([])
      expect(musterArmy(bundle, 'A', list, 'u').units.length).toBe(list.units.length)
    }
  })
  it('START-003 seats follow the mode and the chosen side', () => {
    expect(seatsFor('bot', 0)).toEqual(['human', 'bot'])
    expect(seatsFor('bot', 1)).toEqual(['bot', 'human'])
    expect(seatsFor('hotseat', 1)).toEqual(['human', 'human'])
    expect(seatsFor('watch', 0)).toEqual(['bot', 'bot'])
  })
  it('START-004 every pickable mission and deployment has a briefing preview', () => {
    expect(missionChoices('skirmish').length).toBeGreaterThan(3)
    for (const m of missionChoices('skirmish')) expect(missionPreview(m.id)?.text, m.id).toBeTruthy()
    for (const d of deploymentChoices('skirmish')) {
      const p = deploymentPreview(d.id)
      expect(p?.markers.length, d.id).toBeGreaterThan(1)
      expect(p?.entryEdges.red.length, d.id).toBeGreaterThan(0)
    }
  })
})

describe('start screen emblems', () => {
  it('START-E1 the start screen draws its emblems from theme.ts, the single source', async () => {
    const { readFileSync } = await import('node:fs')
    const src = readFileSync('src/client/ui/start/Emblems.tsx', 'utf8')
    expect(src).toContain("from '../../theme'")
    expect(src).toContain('emblemFor')
    expect(src).not.toMatch(/<path /)
  })
})
