import { apply } from '../../../src/engine/apply'
import { legalActions } from '../../../src/engine/pending'
import { deriveSeed, nextFloat } from '../../../src/engine/rng'
import { createGame } from '../../../src/engine/setup'
import { loadBundle } from '../../sim-core'
import { MATCHUP_OPTS } from '../../sim-matchups'
const bundle = loadBundle()
const M = process.argv[2] ?? 'pp', N = Number(process.argv[3] ?? '10')
const sum: Record<string, { dz: number; dx: number; n: number }> = {}
for (let g = 0; g < N; g++) {
  let s = createGame(bundle, { seed: `drift-${g}`, seats: ['A', 'B'], ...MATCHUP_OPTS[M]! })
  let n = 0
  while (s.phase !== 'over' && n < 3000) {
    const legal = legalActions(s)
    const [f] = nextFloat(deriveSeed(`drift-${g}`, s.pending.id))
    const acts = legal.filter((a) => a.type !== 'turn.pass'); const pool = acts.length ? acts : legal
    const a = pool[Math.floor(f * pool.length)]!
    if ((s.pending.kind === 'move.path' || s.pending.kind === 'ability.target') && Array.isArray((a as any).path ?? null) || (a as any).point) {
      for (const o of legal) {
        const lid = (o as any).leaderId; const p = (o as any).path?.[0] ?? (o as any).point
        if (!p) continue
        const cu = (s.pending.context as any)?.cont?.ctx?.unitId ?? (s.pending.context as any)?.unitId; const lm = lid ? s.models[lid] : cu ? s.models[s.units[cu]?.leadingModelId ?? ""] : undefined; const from = lm ? lm.pos : null
        if (!from) continue
        const k = `${s.pending.kind}.${o.seat}`
        sum[k] ??= { dz: 0, dx: 0, n: 0 }; sum[k].dz += p.z - from.z; sum[k].dx += p.x - from.x; sum[k].n++
      }
    }
    const r = apply(s, bundle, a); if (!r.ok) break; s = r.state; n++
  }
}
for (const [k, v] of Object.entries(sum)) console.log(k, 'mean dx', (v.dx / v.n).toFixed(2), 'mean dz', (v.dz / v.n).toFixed(2), 'n', v.n)
