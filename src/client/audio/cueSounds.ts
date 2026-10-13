// Maps presentation cues to sounds. Pure mapping: never computes rules, only restates what the cue already says.
import { weaponFlavour, type WeaponFlavour } from '../weaponFlavour'
import type { Cue } from '../presentation/cues'

export interface SoundCall { id: string; delayMs?: number; volume?: number }

const SHOT: Record<WeaponFlavour, string> = {
  pistol: 'shot-pistol', rifle: 'shot-rifle', shotgun: 'shot-shotgun', laser: 'laser', plasma: 'plasma', explosive: 'explosion',
  blunt: 'melee-bat', blade: 'melee-blade', bite: 'melee-bite', claw: 'melee-claw',
}
export const soundForFlavour = (f: WeaponFlavour): string => SHOT[f]

export type Outcome = 'victory' | 'defeat'

/** `humanWon` tells a game-over banner whether to sting victory or defeat. */
export function soundsForCue(cue: Cue, durationMs: number, humanWon?: boolean): SoundCall[] {
  switch (cue.kind) {
    case 'banner':
      if (cue.tone === 'round') return [{ id: 'round-start' }]
      if (cue.tone === 'turn') return [{ id: 'ui-confirm', volume: 0.4 }]
      return [{ id: humanWon ? 'victory' : 'defeat' }]
    case 'move': {
      let len = 0
      for (let i = 1; i < cue.points.length; i++) len += Math.hypot(cue.points[i]!.x - cue.points[i - 1]!.x, cue.points[i]!.z - cue.points[i - 1]!.z)
      const steps = Math.max(2, Math.min(8, Math.round(len / 1.1)))
      const span = Math.max(200, durationMs * 0.85)
      return Array.from({ length: steps }, (_, i) => ({ id: 'step', delayMs: (i / steps) * span, volume: 0.6 }))
    }
    case 'dice':
      return [{ id: cue.dice.length > 4 ? 'dice-many' : 'dice-roll' }]
    case 'attack':
      return [{ id: SHOT[weaponFlavour(cue.weaponId, cue.ns)], volume: 0.9 }]
    case 'damage':
      if (cue.removed) return [{ id: 'death', delayMs: 80 }]
      if (cue.applied > 0) return [{ id: 'hit', delayMs: 60 }]
      return [{ id: 'armor-clink', delayMs: 60 }]
    case 'removed':
      return [{ id: 'death' }]
    default:
      return []
  }
}
