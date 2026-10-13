import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { weaponFlavour } from '../weaponFlavour'
import { soundsForCue } from './cueSounds'
import type { Cue } from '../presentation/cues'
import { RECIPES, SOUND_IDS } from './synth'
import { MUSIC_TRACKS, musicUrl } from './music'

describe('audio', () => {
  it('AUD-001 weaponFlavour picks the longest substring match', () => {
    expect(weaponFlavour('gauss-rifle')).toBe('rifle')
    expect(weaponFlavour('psi-blades')).toBe('blade')
    expect(weaponFlavour('psi-emitter')).toBe('plasma')
    expect(weaponFlavour('claws')).toBe('claw')
    expect(weaponFlavour('mystery', 'melee')).toBe('blunt')
  })
  it('AUD-002 every recipe id used by cues exists', () => {
    const cue = { kind: 'attack', attackerId: 'a', targetId: 'b', weaponId: 'plasma-gun', ns: 'shoot', success: true, result: null } as const
    for (const c of soundsForCue(cue, 400)) expect(RECIPES[c.id]).toBeTypeOf('function')
    const dice: Cue = { kind: 'dice', purpose: 'test', dice: [{ sides: 6, face: 3, reroll: false, rollId: 'r:1' }], rolls: [] }
    for (const c of soundsForCue(dice, 400)) expect(RECIPES[c.id]).toBeTypeOf('function')
    expect(SOUND_IDS.length).toBeGreaterThan(15)
  })
  it('AUD-003 move cue yields footsteps', () => {
    const calls = soundsForCue({ kind: 'move', modelId: 'm', points: [{ x: 0, z: 0 }, { x: 0, z: 6 }] }, 800)
    expect(calls.length).toBeGreaterThan(2)
  })
  it('AUD-004 every music scene maps to a manifest item and a shipped file', () => {
    const manifest = JSON.parse(readFileSync('tools/audio-manifest.json', 'utf8')) as { items: { id: string; kind: string }[] }
    const music = new Set(manifest.items.filter((i) => i.kind === 'music').map((i) => i.id))
    for (const { id } of Object.values(MUSIC_TRACKS)) {
      expect(music.has(id)).toBe(true)
      expect(readFileSync(`public/audio/music/${id}.mp3`).length).toBeGreaterThan(50_000)
      expect(musicUrl(id).endsWith(`audio/music/${id}.mp3`)).toBe(true)
    }
    expect(MUSIC_TRACKS.battle.loop && MUSIC_TRACKS.calm.loop && !MUSIC_TRACKS.victory.loop && !MUSIC_TRACKS.defeat.loop).toBe(true)
  })
})
