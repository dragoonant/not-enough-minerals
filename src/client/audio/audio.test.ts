import { describe, expect, it } from 'vitest'
import { weaponFlavour } from '../weaponFlavour'
import { soundsForCue } from './cueSounds'
import type { Cue } from '../presentation/cues'
import { RECIPES, SOUND_IDS } from './synth'

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
})
