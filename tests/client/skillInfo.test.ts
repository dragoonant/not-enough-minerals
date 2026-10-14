// Skill tooltips (owner feedback M5): every ability, upgrade, keyword, weapon, status and resource in the data explains
// itself in plain words through one builder (src/client/ui/skillInfo.ts).
import { describe, expect, it } from 'vitest'
import { edition } from '../../src/data'
import type { AbilityDef } from '../../src/data/types'
import {
  abilityInfo, cardListWords, effectsSentence, findAbility, keywordInfo, optionSkill, resourceInfo, statusInfo, upgradeInfo, weaponInfo,
} from '../../src/client/ui/skillInfo'

const b = edition()
const unitAbilities = b.records.units.flatMap((u) => [...u.abilities, ...u.upgrades.flatMap((x) => (x.ability ? [x.ability] : []))])
const cardAbilities = b.records.cards.flatMap((c) => c.abilities.map((a) => ({ a, card: c.name })))

describe('skill info', () => {
  it('SKILL-001 every ability in the data has a name, a type line, a phase and non-empty text', () => {
    expect(unitAbilities.length + cardAbilities.length).toBeGreaterThan(100)
    for (const a of unitAbilities) {
      const i = abilityInfo(a, b)
      expect(i.name, a.id).toBe(a.name)
      expect(i.text.trim().length, a.id).toBeGreaterThan(5)
      expect(i.lines.find((l) => l.label === 'Type')!.text, a.id).toMatch(/^(Active|Passive|Reaction):/)
      expect(i.chips.length, a.id).toBeGreaterThanOrEqual(2)
      if (a.type !== 'passive') expect(i.lines.some((l) => l.label === 'Cost'), a.id).toBe(true)
    }
    for (const { a, card } of cardAbilities) {
      const i = abilityInfo(a, b, { cardName: card })
      expect(i.text.trim().length, a.id).toBeGreaterThan(5)
      if (a.type !== 'passive') expect(i.lines.find((l) => l.label === 'Cost')!.text, a.id).toMatch(/card|CP|BM|PE|option/)
    }
  })

  it('SKILL-002 actives and reactions say when they can be used, and costs name the resource', () => {
    const active = unitAbilities.find((a) => a.type === 'active' && a.cost && a.cost.n !== 0)!
    const i = abilityInfo(active, b)
    expect(i.lines[0]!.text).toContain('when this unit activates')
    expect(i.lines.find((l) => l.label === 'Cost')!.text).toMatch(/\d (CP|BM|PE)\. (CP|BM|PE) = (Command Points|Biomass|Psionic Energy)/)
    const react = unitAbilities.find((a) => a.type === 'reaction')!
    expect(abilityInfo(react, b).lines[0]!.text).toMatch(/^Reaction: you may use it when .+one Reaction per Activation/)
    expect(abilityInfo(unitAbilities.find((a) => a.type === 'passive' && !a.trigger)!, b).lines[0]!.text).toContain('always on')
  })

  it('SKILL-003 an ability with no text still reads as a sentence built from its effects', () => {
    const bare: AbilityDef = { id: 'x', name: 'Test', type: 'active', phase: 'combat', cost: { res: 'CP', n: 1 }, effects: [{ op: 'buff', char: 'armour', x: 1 }, { op: 'grantKeyword', kw: { kw: 'PIERCE', x: 1 } }], text: '' }
    expect(abilityInfo(bare, b).text).toBe('The affected unit +1 Armour, then gains PIERCE.')
    expect(effectsSentence([], b)).toContain('No effect')
  })

  it('SKILL-004 every upgrade and weapon explains itself; FOR upgrades name what they replace', () => {
    for (const u of b.records.units) {
      for (const up of u.upgrades) {
        const i = upgradeInfo(up, u, b)
        expect(i.text.trim().length, up.id).toBeGreaterThan(5)
        if (up.replaces) expect(i.lines.find((l) => l.label === 'Replaces')!.text, up.id).not.toBe('')
        if (up.specialist) expect(i.lines.some((l) => l.label === 'Specialist'), up.id).toBe(true)
      }
      for (const w of [...u.weapons, ...u.upgrades.flatMap((x) => (x.weapon ? [x.weapon] : []))]) expect(weaponInfo(w, b).text.length, w.id).toBeGreaterThan(5)
    }
  })

  it('SKILL-005 every keyword in keywords.json has its summary; statuses and resources read in plain words', () => {
    const kws = b.singletons.keywords!.keywords
    expect(kws.length).toBeGreaterThan(30)
    for (const k of kws) expect(keywordInfo(k.id, b).text, k.id).toBe(k.text)
    for (const w of ['Activated this Phase', 'Activated (movement)', 'Shielded', 'Out of coherency', 'Burrowed', 'Siege mode', 'Hidden', 'On creep', 'Buff speed 1', 'Debuff armour 1']) {
      expect(statusInfo(w, b).text.length, w).toBeGreaterThan(10)
    }
    expect(statusInfo('Burrowed', b).text).toBe(kws.find((k) => k.id === 'BURROWED')!.text)
    for (const r of ['CP', 'BM', 'PE'] as const) expect(resourceInfo(r).text).toContain('exhausting')
  })

  it('SKILL-006 engine options and feed events resolve to the named ability, cards included', () => {
    const card = b.records.cards.find((c) => c.abilities.some((a) => a.type !== 'passive'))!
    const ab = card.abilities.find((a) => a.type !== 'passive')!
    const hit = findAbility(b, null, ab.id, `${card.id}#2`)
    expect(hit?.ability.id).toBe(ab.id)
    expect(hit?.cardName).toBe(card.name)
    expect(optionSkill(b, null, { abilityId: ab.id, source: card.id })!.name).toBe(ab.name)
    expect(optionSkill(b, null, { type: 'move.go' })).toBeNull()
    expect(cardListWords(b, `Exhaust ${card.id}#1`)).toBe(`Exhaust ${card.name}`)
  })
})
