import { apply } from '../../../src/engine/apply'
import { legalActions } from '../../../src/engine/pending'
import { deriveSeed, nextFloat } from '../../../src/engine/rng'
import { createGame } from '../../../src/engine/setup'
import { loadBundle } from '../../sim-core'
import { MATCHUP_OPTS } from '../../sim-matchups'
const bundle = loadBundle()
const M = process.argv[2] ?? 'pp', N = Number(process.argv[3] ?? '20')
const agg: Record<string, number> = {}
const b = (k: string, n = 1) => { agg[k] = (agg[k] ?? 0) + n }
for (let g = 0; g < N; g++) {
  let s = createGame(bundle, { seed: `bias-${g}`, seats: ['A', 'B'], ...MATCHUP_OPTS[M]! })
  let n = 0
  while (s.phase !== 'over' && n < 3000) {
    const legal = legalActions(s)
    const [f, s2] = nextFloat(deriveSeed(`bias-${g}-${s.pending.seat}`, s.pending.id)); const [h] = nextFloat(s2)
    const acts = legal.filter((a) => a.type !== 'turn.pass'); const pool = acts.length && h < 0.9 ? acts : legal
    const a = pool[Math.floor(f * pool.length)]!
    b(`act.${a.seat}.${a.type}${(a as any).abilityId ? "." + (a as any).abilityId : ""}${(a as any).entry ? "." + JSON.stringify((a as any).entry) : ""}`)
    const r = apply(s, bundle, a); if (!r.ok) break; s = r.state; n++
  }
  for (const e of s.events as any[]) {
    if (e.type === "vpScored") for (const l of e.lines) b(`vp.${e.seat}.${l.rule}`, l.vp)
    if (e.type === "markerControl") b(`ctl.${JSON.stringify(e).slice(0,120)}`)
    if (e.type === 'atk.removed') b(`removed.by.${e.attacker ?? e.seat ?? '?'}`)
    if (e.type === 'unitDestroyed') b(`destroyed.${s.units[e.unitId]?.owner}`)
    if (e.type === 'firstPlayer') b(`fp.${e.seat}.${e.phase}`)
  }
  b(`win.${s.result?.winner ?? 'draw'}`)
  if (g === 0) console.log(JSON.stringify((s.events as any[]).filter(e => e.type === 'vpScored' || e.type === 'markerControl').slice(0, 8)))
}
console.log(JSON.stringify(Object.fromEntries(Object.entries(agg).sort()), null, 1))
