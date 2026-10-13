import { apply } from '../../../src/engine/apply'
import { legalActions } from '../../../src/engine/pending'
import { deriveSeed, nextFloat } from '../../../src/engine/rng'
import { createGame } from '../../../src/engine/setup'
import { view } from '../../../src/engine/view'
import { loadBundle } from '../../sim-core'
import { MATCHUP_OPTS } from '../../sim-matchups'
const bundle = loadBundle(); const names = Object.keys(MATCHUP_OPTS)
const times: number[] = []; const byKind: Record<string, number[]> = {}; let cloneFail = 0, cloneMsg = ''
let viewLeak = 0
for (let gi = 0; gi < 16; gi++) {
  let s = createGame(bundle, { seed: `pf-${gi}`, seats: ['A', 'B'], ...MATCHUP_OPTS[names[gi % names.length]!]! }); let n = 0
  while (s.phase !== 'over' && n < 3000) {
    const legal = legalActions(s)
    if (n % 7 === 0) { try { const v = view(s, 'A'); structuredClone(v); if ('rng' in v || 'log' in v || 'debug' in v) viewLeak++ } catch (e) { cloneFail++; cloneMsg = (e as Error).message } }
    const [f] = nextFloat(deriveSeed(`pf-${gi}`, s.pending.id))
    const acts = legal.filter((a) => a.type !== 'turn.pass'); const pool = acts.length ? acts : legal
    const a = pool[Math.floor(f * pool.length)]!
    const t0 = performance.now(); const r = apply(s, bundle, a); const ms = performance.now() - t0
    times.push(ms); (byKind[a.type] ??= []).push(ms)
    if (!r.ok) break; s = r.state; n++
  }
}
const pct = (xs: number[], p: number) => { const y = [...xs].sort((a, b) => a - b); return y[Math.min(y.length - 1, Math.floor(p * y.length))]! }
console.log('steps', times.length, 'p50', pct(times, 0.5).toFixed(2), 'p95', pct(times, 0.95).toFixed(2), 'p99', pct(times, 0.99).toFixed(2), 'max', Math.max(...times).toFixed(1))
for (const [k, v] of Object.entries(byKind).sort((a, b) => pct(b[1], 0.95) - pct(a[1], 0.95)).slice(0, 8)) console.log(k, 'n', v.length, 'p95', pct(v, 0.95).toFixed(1), 'max', Math.max(...v).toFixed(1))
console.log('cloneFail', cloneFail, cloneMsg, 'viewLeak', viewLeak)
