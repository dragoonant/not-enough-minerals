// Faction emblems on the start screen are the same marks as the HUD, briefing and unit card: theme.ts (EMBLEMS) is the
// single source (spec 50 s8). This file only adds the race tint and label; theme.ts has no engine or store imports.
import type { Race } from '../../store/launch'
import { emblemFor } from '../../theme'

const RACE_COLOUR: Record<Race, string> = { terran: '#59b8d6', zerg: '#b0608a', protoss: '#e0a03a' }
export const RACE_LABEL: Record<Race, string> = { terran: 'Terran', zerg: 'Zerg', protoss: 'Protoss' }

export function Emblem({ race, size = 36 }: { race: Race; size?: number }) {
  return (
    <svg className="emblem" data-testid={`emblem-${race}`} width={size} height={size} viewBox="0 0 24 24" role="img" aria-label={`${RACE_LABEL[race]} emblem`}
      style={{ color: RACE_COLOUR[race] }} dangerouslySetInnerHTML={{ __html: emblemFor(race) }} />
  )
}
