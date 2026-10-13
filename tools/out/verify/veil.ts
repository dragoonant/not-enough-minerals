import { apply } from '../../../src/engine/apply'
import { legalActions } from '../../../src/engine/pending'
import { deriveSeed, nextFloat } from '../../../src/engine/rng'
import { createGame } from '../../../src/engine/setup'
import { loadBundle } from '../../sim-core'
import { MATCHUP_OPTS } from '../../sim-matchups'
const bundle = loadBundle()
const c: Record<string, number> = {}; const b = (k: string) => { c[k] = (c[k] ?? 0) + 1 }
for (let gi = 0; gi < 10; gi++) {
  let s = createGame(bundle, { seed: `vl-${gi}`, seats: ['A', 'B'], ...MATCHUP_OPTS['pp']! }); let n = 0
  while (s.phase !== 'over' && n < 3000) {
    const legal = legalActions(s)
    if (s.pending.kind === 'ability.react') for (const o of legal) if ((o as any).abilityId) b(`offer.${(o as any).abilityId}`)
    const [f] = nextFloat(deriveSeed(`vl-${gi}`, s.pending.id))
    const acts = legal.filter((a) => a.type !== 'turn.pass'); const pool = acts.length ? acts : legal
    const a = pool[Math.floor(f * pool.length)]!
    const r = apply(s, bundle, a); if (!r.ok) break
    const evs = r.state.events.slice(s.events.length) as any[]
    for (const e of evs) if (e.type === 'reposition' && e.kind === 'place') b('placeResolved')
    if (evs.some((e) => e.type === 'reposition' && e.kind === 'place')) b(`afterPlace.next.${r.state.pending.kind}`)
    s = r.state; n++
  }
}
console.log(JSON.stringify(c, null, 1))
