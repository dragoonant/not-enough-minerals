import { apply } from '../../../src/engine/apply'
import { legalActions } from '../../../src/engine/pending'
import { deriveSeed, nextFloat } from '../../../src/engine/rng'
import { createGame } from '../../../src/engine/setup'
import type { Action } from '../../../src/engine/types'
import { loadBundle } from '../../sim-core'
import { MATCHUP_OPTS } from '../../sim-matchups'
const bundle = loadBundle(); const names = Object.keys(MATCHUP_OPTS)
const res: Record<string, number> = {}
const ex: Record<string, string> = {}
for (let gi = 0; gi < 8; gi++) {
  let s = createGame(bundle, { seed: `f2-${gi}`, seats: ['A', 'B'], ...MATCHUP_OPTS[names[gi % names.length]!]! }); let n = 0
  while (s.phase !== 'over' && n < 3000) {
    const legal = legalActions(s)
    for (const o of legal) {
      const open = !('path' in o) && !('point' in o) && (o.type.endsWith('.path') || (o.type === 'ability.target' && (o as any).mode === 'point') || o.type === 'move.place')
      if (!open) continue
      const muts: [string, Record<string, unknown>][] = [['pathStr', { path: 'bad' }], ['pathNaN', { path: [{ x: NaN, z: 0 }] }], ['pathEmpty', { path: [] }], ['pathFar', { path: [{ x: 500, z: 0 }] }], ['leaderBad', { leaderId: 'zz', path: [{ x: 0, z: 0 }] }], ['pointNaN', { point: { x: NaN, z: 1 } }], ['pointStr', { point: 'x' }], ['pointFar', { point: { x: 500, z: 0 } }], ['destNaN', { leaderId: 'zz', dest: { x: NaN, z: 0 } }]]
      for (const [k, m] of muts) {
        const r = apply(s, bundle, { ...o, ...m } as Action)
        const key = `${o.type}.${k}.${r.ok ? 'ACCEPTED' : r.rejection.code}`
        res[key] = (res[key] ?? 0) + 1
        if (r.ok && !ex[key]) ex[key] = JSON.stringify({ ...o, ...m }).slice(0, 200)
      }
    }
    const [f] = nextFloat(deriveSeed(`f2-${gi}`, s.pending.id))
    const acts = legal.filter((a) => a.type !== 'turn.pass'); const pool = acts.length ? acts : legal
    const r = apply(s, bundle, pool[Math.floor(f * pool.length)]!); if (!r.ok) break; s = r.state; n++
  }
}
console.log(JSON.stringify(res, null, 1)); console.log(ex)
