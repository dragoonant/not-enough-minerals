import { apply } from '../../../src/engine/apply'
import { legalActions } from '../../../src/engine/pending'
import { deriveSeed, nextFloat } from '../../../src/engine/rng'
import { createGame } from '../../../src/engine/setup'
import type { Action } from '../../../src/engine/types'
import { loadBundle } from '../../sim-core'
import { MATCHUP_OPTS } from '../../sim-matchups'
const bundle = loadBundle(); const names = Object.keys(MATCHUP_OPTS)
let shown = 0
for (let gi = 0; gi < 8 && shown < 8; gi++) {
  let s = createGame(bundle, { seed: `f2-${gi}`, seats: ['A', 'B'], ...MATCHUP_OPTS[names[gi % names.length]!]! }); let n = 0
  while (s.phase !== 'over' && n < 3000) {
    const legal = legalActions(s)
    for (const o of legal) {
      if (o.type !== 'ability.target' || (o as any).mode !== 'point' || 'point' in o) continue
      for (const pt of [{ x: 500, z: 0 }, { x: NaN, z: 1 }]) {
        const r = apply(s, bundle, { ...o, point: pt } as Action)
        if (!r.ok) continue
        const newTok = r.state.tokens.filter((t) => !s.tokens.some((q) => q.id === t.id))
        const moved = Object.values(r.state.models).filter((m) => s.models[m.id] && (s.models[m.id]!.pos.x !== m.pos.x || s.models[m.id]!.pos.z !== m.pos.z)).map((m) => `${m.id}@${m.pos.x.toFixed(1)},${m.pos.z.toFixed(1)}`)
        const cont = (s.pending.context as any).cont
        if (shown++ < 8) console.log(JSON.stringify(pt), 'op', cont?.rec?.op, cont?.rec?.code ?? cont?.rec?.token ?? '', 'tokens', JSON.stringify(newTok.map((t) => t.pos)), 'moved', moved.slice(0, 3).join(' '), 'events', r.state.events.slice(s.events.length).map((e) => e.type).join(','))
      }
    }
    const [f] = nextFloat(deriveSeed(`f2-${gi}`, s.pending.id))
    const acts = legal.filter((a) => a.type !== 'turn.pass'); const pool = acts.length ? acts : legal
    const r = apply(s, bundle, pool[Math.floor(f * pool.length)]!); if (!r.ok) break; s = r.state; n++
  }
}
