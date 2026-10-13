import { apply } from '../../../src/engine/apply'
import { legalActions } from '../../../src/engine/pending'
import { deriveSeed, nextFloat } from '../../../src/engine/rng'
import { createGame } from '../../../src/engine/setup'
import { unitModels } from '../../../src/engine/squads'
import { chargeNeeded } from '../../../src/engine/charge'
import { reposition } from '../../../src/engine/movement'
import { modelDistance } from '../../../src/engine/measure'
import { dist } from '../../../src/engine/geometry'
import { unitDef } from '../../../src/engine/edition'
import type { Action, GameState } from '../../../src/engine/types'
import { loadBundle } from '../../sim-core'
import { MATCHUP_OPTS } from '../../sim-matchups'
const bundle = loadBundle()
const names = Object.keys(MATCHUP_OPTS)
const msgs: Record<string, number> = {}
let shown = 0
for (let gi = 0; gi < 16; gi++) {
  const name = names[gi % names.length]!
  let s = createGame(bundle, { seed: `cd-${gi}`, seats: ['A', 'B'], ...MATCHUP_OPTS[name]! }); let n = 0
  while (s.phase !== 'over' && n < 3000) {
    const legal = legalActions(s)
    const [f] = nextFloat(deriveSeed(`cd-${gi}`, s.pending.id))
    let a: Action | undefined
    if (s.pending.kind === 'charge.targets') a = legal.find((x) => { const q = chargeNeeded(s, bundle, (x as any).unitId, (x as any).targetIds); return q !== null && q <= 3 && (x as any).targetIds.length === 1 })
    if (s.pending.kind === 'turn.activate') a = legal.find((x) => x.type === 'charge.go' && Object.values(s.units).some((t) => t.owner !== x.seat && t.location === 'table' && (chargeNeeded(s, bundle, (x as any).unitId, [t.id]) ?? 9) <= 3))
    if (s.pending.kind === 'charge.path') {
      const cx = s.pending.context as any
      const need = chargeNeeded(s, bundle, cx.unitId, cx.targets)
      const rolled = [...s.events].reverse().find((e: any) => e.type === 'charge.rolled' && e.unitId === cx.unitId) as any
      if (need !== null && rolled.roll >= need) {
        // replicate the auto plan of charge.ts
        const mine = unitModels(s, cx.unitId); const all = cx.targets.flatMap((t: string) => unitModels(s, t))
        let best: any = null
        for (const m of mine) { const near = Math.min(...all.map((t: any) => modelDistance(m, t))); if (!best || near < best.t) best = { m, t: near } }
        const m = best.m; const tm = all.reduce((p: any, c: any) => (modelDistance(m, c) < modelDistance(m, p) ? c : p))
        const centres = dist(m.pos, tm.pos); const go = Math.min(Math.max(0, modelDistance(m, tm)), cx.distance); const k = go / centres
        const path = [{ x: m.pos.x + (tm.pos.x - m.pos.x) * k, z: m.pos.z + (tm.pos.z - m.pos.z) * k }]
        const r: any = reposition(s, bundle, cx.unitId, { kind: 'charge', leaderId: m.id, path, maxDist: cx.distance, allowEngage: cx.targets, mustEngage: cx.targets } as any)
        const key = r && r.code ? `${r.code}: ${String(r.message).replace(/[A-Z]-s?\d+(-\d+)?/g, 'X').replace(/map\S+/g, 'T').slice(0, 90)}` : 'ok'
        msgs[key] = (msgs[key] ?? 0) + 1
        if (r && r.code && shown++ < 6) console.log(`${name} lead ${m.id} base ${m.base} (${unitDef(bundle, s.units[cx.unitId]!.profileId)?.id}) -> ${tm.id} base ${tm.base} gap ${modelDistance(m, tm).toFixed(3)} dist ${cx.distance}: ${r.code} ${r.message}`)
      }
      a = legal.find((x) => (x as any).auto)
    }
    if (!a) { const acts = legal.filter((x) => x.type !== 'turn.pass' && !(x as any).giveUp); const pool = acts.length ? acts : legal; a = pool[Math.floor(f * pool.length)]! }
    const r = apply(s, bundle, a); if (!r.ok) break; s = r.state; n++
  }
}
console.log(JSON.stringify(msgs, null, 1))
