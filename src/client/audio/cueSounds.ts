// Maps presentation cues to sounds. Pure mapping: never computes rules, only restates what the cue already says.
// Weapon sounds come from weaponFlavour (one sound per flavour); deaths, arrivals and shield hits go by the unit's race
// through the optional `who` resolvers the host supplies (no faction ids live here beyond the three race names).
import { weaponFlavour, type WeaponFlavour } from '../weaponFlavour'
import { weaponSfxId } from './sfx'
import type { Cue } from '../presentation/cues'

export interface SoundCall { id: string; delayMs?: number; volume?: number }

/** Resolvers for what a cue does not carry itself. */
export interface CueWho {
  raceOf?: (unitId: string) => string | undefined
  /** True when the seat is played by a person on this screen (the turn chime is for them). */
  isHuman?: (seat: string) => boolean
}

export const soundForFlavour = (f: WeaponFlavour): string => weaponSfxId(f)

const RACES = ['terran', 'zerg', 'protoss'] as const
const raceKey = (race: string | undefined): (typeof RACES)[number] | null => (RACES as readonly string[]).includes(race ?? '') ? (race as (typeof RACES)[number]) : null

export function deathSoundFor(race: string | undefined): string {
  const r = raceKey(race)
  return r ? `death-${r}` : 'death'
}
export function arrivalSoundFor(race: string | undefined): string {
  switch (raceKey(race)) {
    case 'protoss': return 'arrive-warp'
    case 'zerg': return 'arrive-burrow'
    default: return 'arrive-drop'
  }
}

export type Outcome = 'victory' | 'defeat'

/** `humanWon` tells a game-over banner whether to sting victory or defeat. */
export function soundsForCue(cue: Cue, durationMs: number, humanWon?: boolean, who: CueWho = {}): SoundCall[] {
  switch (cue.kind) {
    case 'banner':
      if (cue.tone === 'round') return [{ id: 'round-start' }]
      if (cue.tone === 'turn') return cue.seat && who.isHuman?.(cue.seat) ? [{ id: 'ui-turn', volume: 0.7 }] : [{ id: 'ui-confirm', volume: 0.3 }]
      if (cue.tone === 'phase') return [{ id: 'ui-confirm', volume: 0.4 }]
      return [{ id: humanWon ? 'victory' : 'defeat' }]
    case 'move': {
      let len = 0
      for (let i = 1; i < cue.points.length; i++) len += Math.hypot(cue.points[i]!.x - cue.points[i - 1]!.x, cue.points[i]!.z - cue.points[i - 1]!.z)
      const steps = Math.max(2, Math.min(8, Math.round(len / 1.1)))
      const span = Math.max(200, durationMs * 0.85)
      return Array.from({ length: steps }, (_, i) => ({ id: 'step', delayMs: (i / steps) * span, volume: 0.6 }))
    }
    case 'dice':
      return [{ id: 'dice-roll', volume: cue.dice.length > 4 ? 1 : 0.8 }]
    case 'attack':
      return [{ id: soundForFlavour(weaponFlavour(cue.weaponId, cue.ns)), volume: 0.9 }]
    case 'attackStage': {
      if (cue.data.step === 'impact') return [{ id: 'dice-roll', volume: 0.6 }]
      if (cue.data.step !== 'damage') return []
      if (cue.data.total <= 0) return [{ id: 'armor-clink', delayMs: 60 }]
      const shielded = cue.targetUnitId && raceKey(who.raceOf?.(cue.targetUnitId)) === 'protoss'
      return [{ id: shielded ? 'shield-hit' : 'hit', delayMs: 60 }]
    }
    case 'casualties':
      return [{ id: deathSoundFor(who.raceOf?.(cue.unitId)), delayMs: 80 }]
    case 'arrival':
      return cue.stage === 'arrived' ? [{ id: arrivalSoundFor(who.raceOf?.(cue.unitId)), volume: 0.9 }] : []
    case 'marker':
      return cue.change === 'claimed' || (cue.change === 'control' && cue.to) ? [{ id: 'marker-claim', volume: 0.8 }] : []
    case 'charge':
      return cue.stage === 'impact' ? [{ id: 'wpn-strike', volume: 0.6 }] : cue.stage === 'failed' ? [{ id: 'ui-click', volume: 0.4 }] : []
    case 'activation':
      return [{ id: 'ui-select', volume: 0.35 }]
    case 'passed':
      return [{ id: 'ui-click', volume: 0.4 }]
    case 'score':
      return cue.vp > 0 ? [{ id: 'marker-claim', volume: 0.6 }] : []
    default:
      return []
  }
}

/** The one table of cue kind -> sound, for sounds.html and the tests. Edit soundsForCue and this together. */
export const CUE_SOUND_TABLE: readonly { cue: string; when: string; sounds: string }[] = [
  { cue: 'banner', when: 'round / turn (human) / turn (other) / phase / game over', sounds: 'round-start / ui-turn / ui-confirm / ui-confirm / victory or defeat (music stinger when the file loads)' },
  { cue: 'move', when: 'every move, 2-8 steps along the path', sounds: 'step (synth)' },
  { cue: 'dice', when: 'any roll', sounds: 'dice-roll' },
  { cue: 'attack', when: 'weapon fires', sounds: 'wpn-<flavour> via weaponFlavour (17 flavours)' },
  { cue: 'attackStage', when: 'impact / damage 0 / damage on Protoss / damage', sounds: 'dice-roll / armor-clink / shield-hit / hit (synth)' },
  { cue: 'casualties', when: 'a model dies', sounds: 'death-terran | death-zerg | death-protoss | death (race)' },
  { cue: 'arrival', when: 'arrived', sounds: 'arrive-drop | arrive-burrow | arrive-warp (race)' },
  { cue: 'marker', when: 'claimed or taken', sounds: 'marker-claim' },
  { cue: 'charge', when: 'impact / failed', sounds: 'wpn-strike / ui-click' },
  { cue: 'activation', when: 'a unit activates', sounds: 'ui-select' },
  { cue: 'passed', when: 'a seat passes', sounds: 'ui-click' },
  { cue: 'score', when: 'VP gained', sounds: 'marker-claim' },
  { cue: 'initiative, note', when: '-', sounds: 'silent by design' },
]
