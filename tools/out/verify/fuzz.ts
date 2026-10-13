// Verifier scratch: fuzz malformed parameters on every legal option, check state invariants, and diagnose charges.
import { apply } from '../../../src/engine/apply'
import { legalActions } from '../../../src/engine/pending'
import { deriveSeed, nextFloat } from '../../../src/engine/rng'
import { createGame } from '../../../src/engine/setup'
import { unitModels } from '../../../src/engine/squads'
import { chargeNeeded } from '../../../src/engine/charge'
import { modelDistance } from '../../../src/engine/measure'
import type { Action, GameState } from '../../../src/engine/types'
import { loadBundle } from '../../sim-core'
import { MATCHUP_OPTS } from '../../sim-matchups'

const GAMES = Number(process.argv[2] ?? '16')
const FUZZ = process.argv.includes('--fuzz')
const bundle = loadBundle()
const names = Object.keys(MATCHUP_OPTS)
const out: Record<string, number> = {}
const notes: string[] = []
const bump = (k: string, n = 1) => { out[k] = (out[k] ?? 0) + n }
const note = (s: string) => { if (notes.length < 60) notes.push(s) }

const NaNp = [{ x: NaN, z: 0 }]
const far = [{ x: 1e6, z: 1e6 }]
function mutations(o: Action, s: GameState): Action[] {
  const enemyModel = Object.values(s.models).find((m) => m.owner !== o.seat)?.id
  const muts: Record<string, unknown>[] = [
    { path: NaNp }, { path: 'bad' }, { path: far }, { path: [] }, { path: [null] }, { path: Array.from({ length: 500 }, (_, i) => ({ x: i % 3, z: i % 5 })) },
    { leaderId: 'nope', path: [{ x: 0, z: 0 }] }, { leaderId: enemyModel, path: [{ x: 0, z: 0 }] }, { leaderId: 7, path: [{ x: 0, z: 0 }] },
    { point: { x: NaN, z: NaN } }, { point: null }, { point: { x: 1e6, z: 0 } },
    { assign: 'x' }, { assign: { foo: -1 } }, { assign: [null] }, { assign: { [enemyModel ?? 'q']: 99 } },
    { edge: 'zzz' }, { slots: 'x' }, { slots: [{}] }, { cards: 5 }, { modelId: 'nope' }, { surgeTarget: 'nope' },
    { mode: 'weird' }, { optionId: 'nope' }, { weaponId: 'nope' }, { targetUnitId: 'nope' }, { abilityId: 'nope' }, { source: {} }, { done: 'x' },
    { targetIds: [] }, { kind: 'x' }, { window: 'x' }, { race: 'x' },
  ]
  return muts.filter((m) => Object.keys(m).every((k) => !(k in o))).map((m) => ({ ...o, ...m } as Action))
}

function invariants(s: GameState, tag: string) {
  const { w, d } = s.scenario.table
  for (const m of Object.values(s.models)) {
    if (m.life === 'dead' || m.offTable) continue
    const u = s.units[m.unitId]
    if (!u) { bump('inv.modelNoUnit'); note(`${tag} model ${m.id} has no unit`); continue }
    if (u.location !== 'table') continue
    if (!Number.isFinite(m.pos.x) || !Number.isFinite(m.pos.z)) { bump('inv.nanPos'); note(`${tag} ${m.id} NaN pos`) }
    if (Math.abs(m.pos.x) > w / 2 + 0.01 || Math.abs(m.pos.z) > d / 2 + 0.01) { bump('inv.offTable'); note(`${tag} ${m.id} off table ${JSON.stringify(m.pos)}`) }
    if (!(m.hp > 0)) { bump('inv.liveZeroHp'); note(`${tag} ${m.id} alive with hp ${m.hp}`) }
  }
  for (const u of Object.values(s.units)) {
    const alive = unitModels(s, u.id)
    if (u.location === 'table' && alive.length === 0) { bump('inv.tableUnitNoModels'); note(`${tag} unit ${u.id} on table with no models`) }
    if (u.location === 'destroyed' && alive.length > 0) { bump('inv.destroyedHasModels'); note(`${tag} unit ${u.id} destroyed but ${alive.length} alive`) }
    if (u.leadingModelId && u.location === 'table' && !alive.some((m) => m.id === u.leadingModelId)) { bump('inv.leaderDead'); note(`${tag} unit ${u.id} leading model ${u.leadingModelId} not alive`) }
    if (u.damage < 0) bump('inv.negDamage')
  }
  // overlapping bases among alive table models
  const live = Object.values(s.models).filter((m) => m.life !== 'dead' && !m.offTable && s.units[m.unitId]?.location === 'table')
  for (let i = 0; i < live.length; i++) for (let j = i + 1; j < live.length; j++) {
    if (modelDistance(live[i]!, live[j]!) < -0.05 && live[i]!.elev === live[j]!.elev) { bump('inv.overlap'); if ((out['inv.overlap'] ?? 0) < 4) note(`${tag} overlap ${live[i]!.id} ${live[j]!.id} ${modelDistance(live[i]!, live[j]!).toFixed(2)}`) }
  }
  if (s.pending.options.length === 0 && s.phase !== 'over') bump('inv.emptyLegal')
  for (const sid of s.seatOrder) { const st = s.seats[sid] as unknown as { vp?: number; score?: number }; if (st.vp !== undefined && st.score !== undefined && st.vp !== st.score) bump('inv.vpScoreMismatch') }
}

for (let g = 0; g < GAMES; g++) {
  const name = names[g % names.length]!
  let s = createGame(bundle, { seed: `fz-${g}`, seats: ['A', 'B'], ...MATCHUP_OPTS[name]! })
  let n = 0
  const tag = () => `fz-${g}/${name} r${s.round} ${s.roundPhase} ${s.pending.kind}`
  while (s.phase !== 'over' && n < 3000) {
    const legal = legalActions(s)
    invariants(s, tag())
    if (s.pending.kind === 'charge.path') {
      const ctx = s.pending.context as { unitId: string; targets: string[]; distance: number }
      const need = chargeNeeded(s, bundle, ctx.unitId, ctx.targets)
      const minGap = Math.min(...ctx.targets.flatMap((t) => unitModels(s, t)).flatMap((tm) => unitModels(s, ctx.unitId).map((m) => modelDistance(m, tm))))
      bump(`charge.path.seen`)
      note(`${tag()} targets ${ctx.targets.length} gap ${minGap.toFixed(2)} dist ${ctx.distance} need ${need}`); if (minGap - 1 <= ctx.distance) { bump('charge.reachable'); const auto = legal.find((a) => (a as any).auto); if (auto) { const r = apply(s, bundle, auto); const ev = r.ok ? r.state.events.slice(s.events.length).map((e) => e.type) : ['REJ']; if (ev.includes('charge.succeeded')) bump('charge.auto.ok'); else { bump('charge.auto.fail'); const f = r.ok ? r.state.events.slice(s.events.length).find((e) => e.type === 'charge.failed') : null; note(`${tag()} reachable charge failed: gap ${minGap.toFixed(2)} dist ${ctx.distance} need ${need} why ${JSON.stringify(f)}`) } } }
    }
    if (FUZZ) for (const o of legal) for (const m of mutations(o, s)) {
      try {
        const r = apply(s, bundle, m)
        bump(r.ok ? 'fuzz.accepted' : 'fuzz.rejected')
        if (!r.ok && r.state !== s) { bump('fuzz.rejectChangedState') }
        if (r.ok) invariants(r.state, `${tag()} after mutated ${m.type} ${JSON.stringify(m).slice(0, 140)}`)
      } catch (e) { bump('fuzz.threw'); note(`${tag()} THREW on ${JSON.stringify(m).slice(0, 160)}: ${(e as Error).message}`) }
    }
    const [f] = nextFloat(deriveSeed(`fz-${g}`, s.pending.id))
    const acts = legal.filter((a) => a.type !== 'turn.pass')
    const pool = acts.length ? acts : legal
    const a = pool[Math.floor(f * pool.length)]!
    const r = apply(s, bundle, a)
    if (!r.ok) { bump('chosenRejected'); note(`${tag()} chosen rejected ${r.rejection.code}`); break }
    s = r.state; n++
  }
  bump(s.phase === 'over' ? 'finished' : 'unfinished')
  bump(`winner.${s.result?.winner ?? 'draw'}`)
  const vps = s.seatOrder.map((id) => (s.seats[id] as any).vp)
  bump(`vp.${vps.join('-')}`)
}
console.log(JSON.stringify(out, null, 0))
for (const l of notes) console.log(l)
