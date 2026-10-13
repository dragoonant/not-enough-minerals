// File-backed SFX (ElevenLabs sound-generation, tools/gen-audio.ts -> public/audio/sfx/<id>.mp3). This list is the
// client's view (ids, groups, trims, the synth sound used until the file loads); the prompts live in
// tools/audio-manifest.json, and a test keeps the two in step.
import { FLAVOURS, type WeaponFlavour } from '../weaponFlavour'

export type SfxGroup = 'weapon' | 'death' | 'arrival' | 'ui' | 'table'
export interface SfxSpec { id: string; group: SfxGroup; label: string; synth: string; trim: number }

/** Weapon flavour to the sound id. */
export const weaponSfxId = (f: WeaponFlavour): string => `wpn-${f}`

const WEAPONS: Record<WeaponFlavour, { label: string; synth: string; trim: number }> = {
  gauss: { label: 'Gauss rifle', synth: 'shot-rifle', trim: 1 },
  revolver: { label: 'Revolver', synth: 'shot-pistol', trim: 1 },
  autocannon: { label: 'Autocannon burst', synth: 'shot-rifle', trim: 1 },
  missiles: { label: 'Missile salvo', synth: 'explosion', trim: 1 },
  'siege-cannon': { label: 'Siege cannon', synth: 'explosion', trim: 1 },
  glaive: { label: 'Glaive cannon', synth: 'plasma', trim: 1 },
  disruptor: { label: 'Particle disruptor', synth: 'laser', trim: 1 },
  'psi-blade': { label: 'Psi-blade', synth: 'melee-blade', trim: 1 },
  'warp-blade': { label: 'Warp blade', synth: 'melee-blade', trim: 1 },
  strike: { label: 'Gauntlet strike', synth: 'melee-bat', trim: 1 },
  stab: { label: 'Bayonet stab', synth: 'melee-blade', trim: 1 },
  stomp: { label: 'Stomp', synth: 'melee-bat', trim: 1 },
  claw: { label: 'Claws', synth: 'melee-claw', trim: 1 },
  slash: { label: 'Bone blades', synth: 'melee-blade', trim: 1 },
  spines: { label: 'Spines', synth: 'melee-claw', trim: 1 },
  acid: { label: 'Acid spit', synth: 'plasma', trim: 1 },
  'bio-blast': { label: 'Bio blast', synth: 'plasma', trim: 1 },
}

/** Per-file playback gain from `npx tsx tools/measure-audio.ts` (aims at RMS 0.16, 0.08 for UI and table sounds). */
export const SFX_TRIMS: Readonly<Record<string, number>> = {
  'arrive-burrow': 0.52, 'arrive-drop': 0.46, 'arrive-warp': 0.73, 'death-protoss': 1, 'death-terran': 0.59, 'death-zerg': 0.98,
  'dice-roll': 1.45, 'marker-claim': 4, 'shield-hit': 0.55, 'ui-click': 1.18, 'ui-select': 1.61, 'ui-turn': 3.59,
  'wpn-acid': 0.98, 'wpn-autocannon': 0.65, 'wpn-bio-blast': 3.52, 'wpn-claw': 1.06, 'wpn-disruptor': 1.03, 'wpn-gauss': 0.98,
  'wpn-glaive': 0.89, 'wpn-missiles': 0.98, 'wpn-psi-blade': 0.83, 'wpn-revolver': 0.64, 'wpn-siege-cannon': 3.67, 'wpn-slash': 0.79,
  'wpn-spines': 1.45, 'wpn-stab': 0.72, 'wpn-stomp': 1.29, 'wpn-strike': 0.98, 'wpn-warp-blade': 0.58,
}

const RAW: readonly SfxSpec[] = [
  ...FLAVOURS.map((f): SfxSpec => ({ id: weaponSfxId(f), group: 'weapon', ...WEAPONS[f] })),
  { id: 'death-terran', group: 'death', label: 'Terran death', synth: 'death', trim: 1 },
  { id: 'death-zerg', group: 'death', label: 'Zerg death', synth: 'death', trim: 1 },
  { id: 'death-protoss', group: 'death', label: 'Protoss death', synth: 'death', trim: 1 },
  { id: 'arrive-warp', group: 'arrival', label: 'Warp-in', synth: 'ui-confirm', trim: 1 },
  { id: 'arrive-drop', group: 'arrival', label: 'Drop-pod landing', synth: 'explosion', trim: 1 },
  { id: 'arrive-burrow', group: 'arrival', label: 'Burrow emerge', synth: 'death', trim: 1 },
  { id: 'ui-click', group: 'ui', label: 'Button click', synth: 'ui-click', trim: 1 },
  { id: 'ui-select', group: 'ui', label: 'Select', synth: 'ui-confirm', trim: 1 },
  { id: 'ui-turn', group: 'ui', label: 'Your turn', synth: 'ui-confirm', trim: 1 },
  { id: 'dice-roll', group: 'table', label: 'Dice roll', synth: 'dice-roll', trim: 1 },
  { id: 'shield-hit', group: 'table', label: 'Shield hit', synth: 'armor-clink', trim: 1 },
  { id: 'marker-claim', group: 'table', label: 'Marker claimed', synth: 'ui-confirm', trim: 1 },
]

export const SFX: readonly SfxSpec[] = RAW.map((s) => ({ ...s, trim: SFX_TRIMS[s.id] ?? 1 }))

export const SFX_BY_ID: Readonly<Record<string, SfxSpec>> = Object.fromEntries(SFX.map((s) => [s.id, s]))

export function sfxUrl(id: string): string {
  const base = (import.meta as unknown as { env?: { BASE_URL?: string } }).env?.BASE_URL ?? '/'
  return `${base.endsWith('/') ? base : `${base}/`}audio/sfx/${id}.mp3`
}
