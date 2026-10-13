import { describe, expect, it } from 'vitest'
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { FLAVOURS, WEAPON_FLAVOUR, weaponFlavour } from '../../src/client/weaponFlavour'
import { SFX, SFX_BY_ID, SFX_TRIMS, weaponSfxId } from '../../src/client/audio/sfx'
import { arrivalSoundFor, deathSoundFor, soundsForCue } from '../../src/client/audio/cueSounds'
import type { Cue } from '../../src/client/presentation/cues'
import { RECIPES } from '../../src/client/audio/synth'

const DATA = 'data/sc-2026-10/units'
function dataWeaponIds(): string[] {
  const ids = new Set<string>()
  const walk = (dir: string): void => {
    for (const e of readdirSync(dir, { withFileTypes: true })) {
      const p = join(dir, e.name)
      if (e.isDirectory()) walk(p)
      else if (e.name.endsWith('.json')) {
        const j = JSON.parse(readFileSync(p, 'utf8')) as { weapons?: { id: string }[] }
        for (const w of j.weapons ?? []) ids.add(w.id)
      }
    }
  }
  walk(DATA)
  return [...ids]
}

describe('sfx and weapon flavours', () => {
  it('SFX-001 every weapon id in the data has an explicit flavour (no fallback guesses)', () => {
    const ids = dataWeaponIds()
    expect(ids.length).toBeGreaterThan(30)
    const missing = ids.filter((id) => !(id in WEAPON_FLAVOUR))
    expect(missing).toEqual([])
  })
  it('SFX-002 every flavour has a sound id, a manifest prompt, a shipped file and a synth stand-in', () => {
    const manifest = JSON.parse(readFileSync('tools/audio-manifest.json', 'utf8')) as { items: { id: string; kind: string; prompt?: string; durationSeconds?: number }[] }
    const sfx = new Map(manifest.items.filter((i) => i.kind === 'sfx').map((i) => [i.id, i]))
    for (const f of FLAVOURS) {
      const id = weaponSfxId(f)
      expect(SFX_BY_ID[id], id).toBeDefined()
      expect(sfx.get(id)?.prompt, id).toBeTruthy()
      expect(existsSync(`public/audio/sfx/${id}.mp3`), id).toBe(true)
    }
    // Every flavour in the map is a known flavour.
    for (const f of Object.values(WEAPON_FLAVOUR)) expect(FLAVOURS).toContain(f)
    for (const s of SFX) expect(RECIPES[s.synth], `${s.id} synth stand-in`).toBeTypeOf('function')
  })
  it('SFX-003 client list, manifest and files agree; prompts name no game or brand; trims are sane', () => {
    const manifest = JSON.parse(readFileSync('tools/audio-manifest.json', 'utf8')) as { items: { id: string; kind: string; prompt?: string }[] }
    const items = manifest.items.filter((i) => i.kind === 'sfx')
    expect(items.map((i) => i.id).sort()).toEqual(SFX.map((s) => s.id).sort())
    expect(SFX.length).toBeGreaterThanOrEqual(25)
    expect(SFX.length).toBeLessThanOrEqual(35)
    for (const i of items) {
      expect(i.prompt).not.toMatch(/starcraft|blizzard|terran|zerg|protoss|archon|marine|zealot/i)
      expect(statSync(`public/audio/sfx/${i.id}.mp3`).size, i.id).toBeGreaterThan(3000)
    }
    for (const id of Object.keys(SFX_TRIMS)) expect(SFX_BY_ID[id], id).toBeDefined()
    for (const s of SFX) expect(s.trim).toBeGreaterThan(0)
    for (const s of SFX) expect(s.trim).toBeLessThanOrEqual(4)
  })
  it('SFX-004 flavour lookup: exact id first, keywords for new ids, namespace last', () => {
    expect(weaponFlavour('c-14-rifle')).toBe('gauss')
    expect(weaponFlavour('hellfire-missiles')).toBe('missiles')
    expect(weaponFlavour('shock-cannon')).toBe('siege-cannon')
    expect(weaponFlavour('master-warp-blade')).toBe('warp-blade')
    expect(weaponFlavour('new-glaive-thing')).toBe('glaive')
    expect(weaponFlavour('mystery', 'melee')).toBe('strike')
  })
  it('SFX-005 cues pick deaths, arrivals and shields by race and weapons by flavour', () => {
    const raceOf = (u: string): string | undefined => ({ a: 'terran', b: 'zerg', c: 'protoss' } as Record<string, string>)[u]
    expect(soundsForCue({ kind: 'casualties', unitId: 'b', modelIds: ['m'], cause: 'damage', destroyed: false }, 400, undefined, { raceOf })[0]?.id).toBe('death-zerg')
    expect(deathSoundFor('mystery')).toBe('death')
    expect(arrivalSoundFor('protoss')).toBe('arrive-warp')
    expect(arrivalSoundFor('zerg')).toBe('arrive-burrow')
    expect(arrivalSoundFor('terran')).toBe('arrive-drop')
    const atk = { kind: 'attack', attackerId: 'a', targetId: 'b', weaponId: 'acid-saliva', ns: 'shoot', success: true, result: null } as const
    expect(soundsForCue(atk, 400)[0]?.id).toBe('wpn-acid')
    const dmg: Extract<Cue, { kind: 'attackStage' }> = { kind: 'attackStage', batchId: 'x', step: 'damage', data: { step: 'damage', dice: 1, total: 2 }, dice: [], rolls: [], attackerUnitId: 'a', targetUnitId: 'c', weaponId: null }
    expect(soundsForCue(dmg, 400, undefined, { raceOf })[0]?.id).toBe('shield-hit')
    expect(soundsForCue({ ...dmg, targetUnitId: 'a' }, 400, undefined, { raceOf })[0]?.id).toBe('hit')
  })
})
