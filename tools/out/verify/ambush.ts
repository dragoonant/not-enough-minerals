import { apply } from '../../../src/engine/apply'
import { legalActions } from '../../../src/engine/pending'
import { deriveSeed, nextFloat } from '../../../src/engine/rng'
import { createGame } from '../../../src/engine/setup'
import { abilitiesOf } from '../../../src/engine/effects'
import { loadBundle } from '../../sim-core'
import { MATCHUP_OPTS } from '../../sim-matchups'
const bundle = loadBundle()
const c: Record<string, number> = {}; const b = (k: string) => { c[k] = (c[k] ?? 0) + 1 }
for (let gi = 0; gi < 12; gi++) {
  const m = ['zz', 'founders', 'pp'][gi % 3]!
  let s = createGame(bundle, { seed: `am-${gi}`, seats: ['A', 'B'], ...MATCHUP_OPTS[m]! }); let n = 0
  while (s.phase !== 'over' && n < 3000) {
    const legal = legalActions(s)
    const [f] = nextFloat(deriveSeed(`am-${gi}`, s.pending.id))
    const acts = legal.filter((a) => a.type !== 'turn.pass'); const pool = acts.length ? acts : legal
    const a = pool[Math.floor(f * pool.length)]!
    if (s.pending.kind === 'ability.target') b(`target.src.${(s.pending.context as any)?.cont?.ctx?.sourceId}`)
    if (a.type === 'deploy.path') {
      const u = s.units[(a as any).unitId]!
      const ids = abilitiesOf(bundle, u).map((x: any) => x.id).filter((id: string) => ['burrow-ambush', 'phase-prism', 'rapid-reinforcements'].includes(id))
      const r = apply(s, bundle, a)
      if (ids.length) { b(`deployWith.${ids.join('+')}`); b(`deployWith.${ids[0]}.next.${r.ok ? r.state.pending.kind : 'REJ'}`); const evs = r.ok ? r.state.events.slice(s.events.length).map((e) => e.type) : []; if (evs.includes('reposition')) b('deployWith.reposition') }
      if (!r.ok) break; s = r.state; n++; continue
    }
    const r = apply(s, bundle, a); if (!r.ok) break; s = r.state; n++
  }
}
console.log(JSON.stringify(c, null, 1))
