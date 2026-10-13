import { describe, expect, it } from 'vitest'
import { formatError, validateBundle } from './validate'
import { emptyBundle } from './bundle'
import { validateDataDir } from '../../tools/validate-data'

describe('data', () => {
  it('DATA-001 every record on disk validates', () => {
    expect(validateDataDir().map(formatError)).toEqual([])
  })

  it('DATA-002 ids are unique, kebab-case and every record cites a source', () => {
    const b = emptyBundle('fixture')
    const faction = { id: 'fixture-side', name: 'Fixture side', source: 'fixture' }
    b.records.factions.push(faction, { ...faction })
    b.records.units.push({ id: 'Bad_Id', name: 'x', source: '' })
    const msgs = validateBundle(b).map((e) => `${e.id} ${e.path}: ${e.message}`)
    expect(msgs).toContain('fixture-side id: duplicate id (2 records)')
    expect(msgs).toContain('Bad_Id id: must be kebab-case (a-z, 0-9, single hyphens)')
    expect(msgs).toContain('Bad_Id source: is required (string or non-empty array)')
  })
})
