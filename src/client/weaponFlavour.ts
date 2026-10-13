// One place that says what a weapon sounds (and later looks) like. Every weapon id in the data bundle is listed in
// WEAPON_FLAVOUR (a test fails when a data weapon is missing); the keyword table is only the fallback for ids that
// are added to the data later, and for unknown ids it falls back on the attack namespace. Generic words only.
export type WeaponFlavour =
  | 'gauss' | 'revolver' | 'autocannon' | 'missiles' | 'siege-cannon' | 'glaive' | 'disruptor'
  | 'psi-blade' | 'warp-blade' | 'strike' | 'stab' | 'stomp' | 'claw' | 'slash' | 'spines' | 'acid' | 'bio-blast'

export const FLAVOURS: readonly WeaponFlavour[] = [
  'gauss', 'revolver', 'autocannon', 'missiles', 'siege-cannon', 'glaive', 'disruptor',
  'psi-blade', 'warp-blade', 'strike', 'stab', 'stomp', 'claw', 'slash', 'spines', 'acid', 'bio-blast',
]

/** Flavours of weapons that fight in close combat (used for the sound's loudness and tracer-free VFX). */
export const MELEE_FLAVOURS: readonly WeaponFlavour[] = ['psi-blade', 'warp-blade', 'strike', 'stab', 'stomp', 'claw', 'slash']

// Weapon id (as in the unit data files) to flavour.
export const WEAPON_FLAVOUR: Readonly<Record<string, WeaponFlavour>> = {
  // Terran
  'c-14-rifle': 'gauss', 'commando-rifle': 'gauss', 'justice-revolver': 'revolver',
  'autocannon': 'autocannon', 'underbelly-machine-gun': 'autocannon', 'twin-cannon': 'autocannon', 'quad-k12': 'autocannon',
  'hellfire-missiles': 'missiles', 'shock-cannon': 'siege-cannon',
  'strike': 'strike', 'bayonet': 'stab', 'stomp': 'stomp', 'rolling-over': 'stomp',
  // Zerg
  'claws': 'claw', 'vile-claws': 'claw', 'talons-cc': 'claw', 'scythe': 'slash', 'blades': 'slash',
  'needle-spines': 'spines', 'acid-spines': 'spines', 'talons': 'spines',
  'acid-saliva': 'acid', 'energy-blast': 'bio-blast', 'plasma-discharge': 'bio-blast',
  // Protoss
  'glaive-cannon': 'glaive', 'left-photon-disruptor': 'disruptor', 'right-photon-disruptor': 'disruptor',
  'particle-disruptors': 'disruptor', 'disruption-beam': 'disruptor',
  'psi-blades': 'psi-blade', 'twilight-blades-strike': 'psi-blade', 'twilight-blades-sweep': 'psi-blade', 'beam': 'psi-blade',
  'master-warp-blade': 'warp-blade',
}

// Fallback for ids not yet in the map. Longest substring wins; ties go to the earlier entry.
const KEYWORDS: [string, WeaponFlavour][] = [
  ['gauss', 'gauss'], ['rifle', 'gauss'], ['revolver', 'revolver'], ['pistol', 'revolver'],
  ['cannon', 'autocannon'], ['gun', 'autocannon'], ['missile', 'missiles'], ['rocket', 'missiles'], ['launcher', 'missiles'],
  ['siege', 'siege-cannon'], ['glaive', 'glaive'], ['disruptor', 'disruptor'], ['beam', 'disruptor'], ['plasma', 'bio-blast'], ['blast', 'bio-blast'],
  ['psi', 'psi-blade'], ['warp-blade', 'warp-blade'], ['blade', 'slash'], ['scythe', 'slash'], ['claw', 'claw'], ['talon', 'claw'],
  ['spine', 'spines'], ['acid', 'acid'], ['stomp', 'stomp'], ['strike', 'strike'], ['bayonet', 'stab'], ['fist', 'strike'],
]

export function weaponFlavour(weaponId: string, ns?: string): WeaponFlavour {
  const id = weaponId.toLowerCase()
  const exact = WEAPON_FLAVOUR[id]
  if (exact) return exact
  let best: WeaponFlavour | null = null
  let len = 0
  for (const [key, f] of KEYWORDS) if (key.length > len && id.includes(key)) { best = f; len = key.length }
  if (best) return best
  if (ns === 'melee') return 'strike'
  if (ns === 'blast') return 'siege-cannon'
  return 'gauss'
}
