// Maps a weapon id (data records, M1) to a flavour read by sound now and VFX later. Longest substring match wins; ties
// go to the earlier table entry. Unknown ids fall back on the attack namespace. Generic words only (no data copied).
export type WeaponFlavour = 'pistol' | 'rifle' | 'shotgun' | 'laser' | 'plasma' | 'explosive' | 'blunt' | 'blade' | 'bite' | 'claw'

const TABLE: [string, WeaponFlavour][] = [
  ['laser', 'laser'], ['beam', 'laser'], ['plasma', 'plasma'], ['psi', 'plasma'], ['disruptor', 'plasma'], ['shotgun', 'shotgun'],
  ['grenade', 'explosive'], ['missile', 'explosive'], ['rocket', 'explosive'], ['launcher', 'explosive'], ['cannon', 'explosive'], ['acid', 'explosive'],
  ['rifle', 'rifle'], ['gauss', 'rifle'], ['gatling', 'rifle'], ['autocannon', 'rifle'], ['pistol', 'pistol'], ['revolver', 'pistol'],
  ['hammer', 'blunt'], ['fist', 'blunt'], ['club', 'blunt'],
  ['blade', 'blade'], ['sword', 'blade'], ['knife', 'blade'], ['scythe', 'blade'],
  ['bite', 'bite'], ['jaw', 'bite'], ['mandible', 'bite'], ['claw', 'claw'], ['talon', 'claw'], ['spine', 'claw'], ['slash', 'claw'],
]

export function weaponFlavour(weaponId: string, ns?: string): WeaponFlavour {
  const id = weaponId.toLowerCase()
  let best: WeaponFlavour | null = null
  let len = 0
  for (const [key, f] of TABLE) if (key.length > len && id.includes(key)) { best = f; len = key.length }
  if (best) return best
  if (ns === 'melee') return 'blunt'
  if (ns === 'blast') return 'explosive'
  return 'rifle'
}
