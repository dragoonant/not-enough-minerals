import { describe, expect, it } from 'vitest'
import { existsSync, readFileSync } from 'node:fs'
import { MUSIC_TRACKS, MUSIC_TRIMS, directScene, loopWindow, sceneGain, vpLeadOf, type MusicScene } from '../../src/client/audio/music'
import { CUE_SOUND_TABLE, soundsForCue } from '../../src/client/audio/cueSounds'
import { SFX_BY_ID } from '../../src/client/audio/sfx'
import { RECIPES } from '../../src/client/audio/synth'

describe('music director', () => {
  it('MUS-001 title is calm; play is battle; game over stings by result', () => {
    expect(directScene({ screen: 'title' })).toBe('calm')
    expect(directScene({ screen: 'game', round: 2, maxRounds: 5, vpLead: 0 })).toBe('battle')
    expect(directScene({ screen: 'game', over: true, humanWon: true })).toBe('victory')
    expect(directScene({ screen: 'game', over: true, humanWon: false })).toBe('defeat')
  })
  it('MUS-002 tense when 3+ VP behind or in the last round, with hysteresis', () => {
    expect(directScene({ screen: 'game', round: 2, maxRounds: 5, vpLead: -2 })).toBe('battle')
    expect(directScene({ screen: 'game', round: 2, maxRounds: 5, vpLead: -3 })).toBe('tense')
    expect(directScene({ screen: 'game', round: 5, maxRounds: 5, vpLead: 4 })).toBe('tense')
    expect(directScene({ screen: 'game', round: 5, maxRounds: null, vpLead: 4 })).toBe('battle')
    expect(directScene({ screen: 'game', round: 2, maxRounds: 5, vpLead: -2, prev: 'tense' })).toBe('tense')
    expect(directScene({ screen: 'game', round: 2, maxRounds: 5, vpLead: -1, prev: 'tense' })).toBe('battle')
  })
  it('MUS-003 vpLeadOf compares with the best opponent', () => {
    expect(vpLeadOf({ a: { vp: 2 }, b: { vp: 5 }, c: { vp: 1 } }, 'a')).toBe(-3)
    expect(vpLeadOf({ a: { vp: 2 } }, 'a')).toBe(0)
  })
  it('MUS-004 every scene has a shipped file and a sane trim; loops sit inside the buffer', () => {
    const manifest = JSON.parse(readFileSync('tools/audio-manifest.json', 'utf8')) as { items: { id: string; kind: string }[] }
    const ids = new Set(manifest.items.filter((i) => i.kind === 'music').map((i) => i.id))
    for (const scene of Object.keys(MUSIC_TRACKS) as MusicScene[]) {
      const { id } = MUSIC_TRACKS[scene]
      expect(ids.has(id), id).toBe(true)
      expect(existsSync(`public/audio/music/${id}.mp3`), id).toBe(true)
      expect(MUSIC_TRIMS[id]).toBeGreaterThan(0)
      expect(sceneGain(scene)).toBeLessThanOrEqual(1.2)
    }
    const w = loopWindow(60)
    expect(w.start).toBeGreaterThanOrEqual(0)
    expect(w.end).toBeLessThan(60)
    expect(w.end).toBeGreaterThan(59.9)
  })
})

describe('cue sound table', () => {
  it('MUS-005 every sound a cue can return exists as a file entry or a synth recipe', () => {
    const cues = [
      { kind: 'charge', unitId: 'u', stage: 'impact', targets: [] }, { kind: 'charge', unitId: 'u', stage: 'failed', targets: [] },
      { kind: 'activation', unitId: 'u', seat: null }, { kind: 'passed', seat: 's', phase: null },
      { kind: 'score', seat: 's', vp: 2, source: 'x', round: 1 }, { kind: 'marker', n: 1, change: 'claimed' },
      { kind: 'banner', tone: 'round', text: '', round: 1, phase: null, seat: null },
    ] as const
    for (const c of cues) {
      const calls = soundsForCue(c as never, 400)
      expect(calls.length, c.kind).toBeGreaterThan(0)
      for (const s of calls) expect(SFX_BY_ID[s.id] ?? RECIPES[s.id], s.id).toBeDefined()
    }
    expect(CUE_SOUND_TABLE.length).toBeGreaterThan(8)
  })
})
