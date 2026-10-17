// The sim's playable pairings (tools/sim.ts --matchup): the Founders box, the first battle, every starter mirror and cross.
import type { CreateGameOpts } from '../src/engine/setup'

export const MATCHUP_OPTS: Record<string, Pick<CreateGameOpts, 'armies' | 'preset'>> = {
  founders: { armies: { A: 'terran-founders', B: 'zerg-founders' } },
  'first-battle': { preset: 'first-battle' },
  tt: { armies: { A: 'terran-starter', B: 'terran-starter' } },
  zz: { armies: { A: 'zerg-starter', B: 'zerg-starter' } },
  pp: { armies: { A: 'protoss-starter', B: 'protoss-starter' } },
  tz: { armies: { A: 'terran-starter', B: 'zerg-starter' } },
  tp: { armies: { A: 'terran-starter', B: 'protoss-starter' } },
  zp: { armies: { A: 'zerg-starter', B: 'protoss-starter' } },
  // Wave 2 expanded forces (Siege Tank, Ravager, Immortal, Zeratul).
  txtx: { armies: { A: 'terran-expanded', B: 'terran-expanded' } },
  zxzx: { armies: { A: 'zerg-expanded', B: 'zerg-expanded' } },
  pxpx: { armies: { A: 'protoss-expanded', B: 'protoss-expanded' } },
  txzx: { armies: { A: 'terran-expanded', B: 'zerg-expanded' } },
  txpx: { armies: { A: 'terran-expanded', B: 'protoss-expanded' } },
  zxpx: { armies: { A: 'zerg-expanded', B: 'protoss-expanded' } },
}
