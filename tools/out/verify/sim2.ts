// Verifier scratch: an aggressive bot (moves toward enemies, charges reachable targets, never gives up a charge) so
// the Combat Phase is exercised; every legal option dry-run; optional fuzz of malformed params; replay determinism.
import { apply } from '../../../src/engine/apply'
import { legalActions } from '../../../src/engine/pending'
import { deriveSeed, nextFloat } from '../../../src/engine/rng'
import { createGame } from '../../../src/engine/setup'
import { unitModels } from '../../../src/engine/squads'
import { chargeNeeded } from '../../../src/engine/charge'
import { dist } from '../../../src/engine/geometry'
import type { Action, GameState } from '../../../src/engine/types'
import { loadBundle } from '../../sim-core'
import { MATCHUP_OPTS } from '../../sim-matchups'
const bundle = loadBundle()
const GAMES = Number(process.argv[2] ?? '16'); const SEED = process.argv[3] ?? 'agg'
const FUZZ = process.argv.includes('--fuzz'); const ONLY = process.argv.find((a) => a.startsWith('--m='))?.slice(4)
const names = ONLY ? ONLY.split(',') : Object.keys(MATCHUP_OPTS)
const c: Record<string, number> = {}; const notes: string[] = []
const bump = (k: string, n = 1) => { c[k] = (c[k] ?? 0) + n }
const note = (s: string) => { if (notes.length < 40) notes.push(s) }
const enemyPts = (s: GameState, seat: string) => Object.values(s.units).filter((u) => u.owner !== seat && u.location === 'table').flatMap((u) => unitModels(s, u.id).map((m) => m.pos))
const nearest = (s: GameState, seat: string, p: { x: number; z: number }) => Math.min(999, ...enemyPts(s, seat).map((q) => dist(p, q)))
function pick(s: GameState, legal: Action[], seed: string): Action {
  const [f, s2] = nextFloat(deriveSeed(seed, s.pending.id)); const [g] = nextFloat(s2)
  const k = s.pending.kind
  if (k === 'charge.path') return legal.find((a) => (a as any).auto) ?? legal[0]!
  if (k === 'charge.targets') {
    const ok = legal.filter((a) => { const n = chargeNeeded(s, bundle, (a as any).unitId, (a as any).targetIds); return n !== null && n <= 4 })
    if (ok.length) return ok[Math.floor(f * ok.length)]!
  }
  if (k === 'turn.activate') {
    const ch = legal.filter((a) => a.type === 'charge.go' && (s.units[(a as any).unitId] ? true : false))
    const good = ch.filter((a) => { const uid = (a as any).unitId; return Object.values(s.units).some((t) => t.owner !== a.seat && t.location === 'table' && chargeNeeded(s, bundle, uid, [t.id]) !== null && chargeNeeded(s, bundle, uid, [t.id])! <= 4) })
    if (good.length && g < 0.9) return good[Math.floor(f * good.length)]!
    const fight = legal.filter((a) => a.type === 'melee.go' || a.type === 'shoot.go')
    if (fight.length && g < 0.8) return fight[Math.floor(f * fight.length)]!
  }
  if ((k === 'move.path' || k === 'deploy.path') && g < 0.8) {
    const withP = legal.filter((a) => Array.isArray((a as any).path))
    if (withP.length) return withP.reduce((a, b) => (nearest(s, a.seat, (a as any).path[0]) <= nearest(s, b.seat, (b as any).path[0]) ? a : b))
  }
  const acts = legal.filter((a) => a.type !== 'turn.pass' && !(a as any).giveUp)
  const pool = acts.length && g < 0.95 ? acts : legal
  return pool[Math.floor(f * pool.length)]!
}
function mutations(o: Action, s: GameState): Action[] {
  const em = Object.values(s.models).find((m) => m.owner !== o.seat)?.id
  const muts: Record<string, unknown>[] = [
    { path: [{ x: NaN, z: 0 }] }, { path: 'bad' }, { path: [{ x: 1e6, z: 1e6 }] }, { path: [] }, { path: [null] },
    { leaderId: 'nope', path: [{ x: 0, z: 0 }] }, { leaderId: em, path: [{ x: 0, z: 0 }] }, { point: { x: NaN, z: NaN } }, { point: { x: 1e6, z: 0 } }, { point: 'x' },
    { assign: 'x' }, { assign: { foo: -1 } }, { assign: [null] }, { slots: 'x' }, { slots: [{}] }, { modelId: 'nope' }, { surgeTarget: 'nope' },
    { mode: 'weird' }, { optionId: 'nope' }, { weaponId: 'nope' }, { targetUnitId: 'nope' }, { abilityId: 'nope' }, { targetIds: ['nope'] }, { edge: 'Q' }, { cards: 3 },
  ]
  return muts.filter((m) => Object.keys(m).every((k) => !(k in o))).map((m) => ({ ...o, ...m } as Action))
}
const fp = (s: GameState) => JSON.stringify({ ...s, log: s.log.length })
for (let gi = 0; gi < GAMES; gi++) {
  const name = names[gi % names.length]!
  const opts = { seed: `${SEED}-${gi}`, seats: process.argv.includes('--swap') ? ['B', 'A'] : ['A', 'B'], ...MATCHUP_OPTS[name]!, ...(process.argv.find((a) => a.startsWith('--dep=')) ? { deploymentId: process.argv.find((a) => a.startsWith('--dep='))!.slice(6) } : {}), ...(process.argv.includes('--draft') ? { draft: true } : {}), ...(process.argv.find((a) => a.startsWith('--mis=')) ? { missionId: process.argv.find((a) => a.startsWith('--mis='))!.slice(6) } : {}) }
  let s = createGame(bundle, opts); let n = 0
  const tag = () => `${SEED}-${gi}/${name} r${s.round} ${s.roundPhase} ${s.pending.kind} ${s.pending.id}`
  try {
    while (s.phase !== 'over' && n < 3000) {
      const legal = legalActions(s)
      if (!legal.length) { bump('err.emptyLegal'); note(`${tag()} empty legal`); break }
      for (const o of legal) { const r = apply(s, bundle, o); if (!r.ok) { bump('err.legalRejected'); note(`${tag()} legal ${o.type} rejected ${r.rejection.code} ${r.rejection.message} ${JSON.stringify(o).slice(0, 200)}`) } }
      if (FUZZ) for (const o of legal) for (const m of mutations(o, s)) {
        try { const r = apply(s, bundle, m); bump(r.ok ? 'fuzz.acc' : 'fuzz.rej'); if (!r.ok && r.state !== s) bump('err.fuzzRejectChanged')
          if (r.ok) { for (const md of Object.values(r.state.models)) if (md.life === 'active' && !md.offTable && (!Number.isFinite(md.pos.x) || !Number.isFinite(md.pos.z) || Math.abs(md.pos.x) > r.state.scenario.table.w / 2 + 0.01 || Math.abs(md.pos.z) > r.state.scenario.table.d / 2 + 0.01)) { bump('err.fuzzBadPos'); note(`${tag()} accepted mutated ${JSON.stringify(m).slice(0, 180)} -> ${md.id} at ${JSON.stringify(md.pos)}`); break } }
        } catch (e) { bump('err.fuzzThrew'); note(`${tag()} THREW ${(e as Error).message.slice(0, 120)} on ${JSON.stringify(m).slice(0, 180)}`) }
      }
      if (s.pending.kind === 'charge.path') { const cx = s.pending.context as any; const need = chargeNeeded(s, bundle, cx.unitId, cx.targets); const rolled = [...s.events].reverse().find((e: any) => e.type === 'charge.rolled' && e.unitId === cx.unitId) as any; const exp = need !== null && rolled && rolled.roll >= need; const auto = legal.find((x) => (x as any).auto)!; const rr = apply(s, bundle, auto); const okc = rr.ok && rr.state.events.slice(s.events.length).some((e) => e.type === 'charge.succeeded'); bump(`charge.exp${exp ? 1 : 0}.got${okc ? 1 : 0}`); if (exp && !okc) { const f = rr.ok ? rr.state.events.slice(s.events.length).find((e) => e.type === 'charge.failed') : null; note(`${tag()} expected-ok charge failed: targets ${cx.targets.length} need ${need} roll ${rolled.roll} dist ${cx.distance} ${JSON.stringify(f)}`) } }
      const a = pick(s, legal, `${opts.seed}-${s.pending.seat}`)
      bump(`act.${a.type}`)
      const r = apply(s, bundle, a)
      if (!r.ok) { bump('err.chosenRejected'); note(`${tag()} chosen rejected ${r.rejection.code}`); break }
      for (const e of r.state.events.slice(s.events.length) as any[]) if (e.type === 'atk.removed') bump(`rm.by${s.active}.of${r.state.units[e.unitId]?.owner}.${s.roundPhase}.${s.pending.kind}`, e.modelIds.length)
      s = r.state; n++
    }
  } catch (e) { bump('err.threw'); note(`${tag()} THREW ${(e as Error).stack?.split('\n').slice(0, 4).join(' | ')}`) }
  if (s.phase !== 'over') { bump('err.unfinished'); note(`${tag()} unfinished after ${n}`) }
  // replay
  let t = createGame(bundle, opts); let ok = true
  for (const a of s.log) { const r = apply(t, bundle, a); if (!r.ok) { ok = false; break } t = r.state }
  if (!ok || fp(t) !== fp(s)) { bump('err.replay'); note(`${opts.seed} replay diverged`) }
  bump(`win.${s.result?.winner ?? 'draw'}`); { const w = s.result?.winner; const col = w ? (s.seats[w] as any).colour : 'draw'; bump(`wincol.${s.deploymentId}.${col}`); bump(`winidx.${w ? s.seatOrder.indexOf(w) : 'draw'}`) }
  for (const e of s.events as any[]) {
    const own = (id: string) => s.units[id]?.owner ?? '?'
    if (e.type === 'atk.removed') bump(`lost.${own(e.unitId)}.${e.cause}`, e.modelIds.length)
    if (e.type === 'charge.succeeded') bump(`chargeOk.${own(e.unitId)}`)
    if (e.type === 'charge.declared') bump(`chargeDecl.${own(e.unitId)}`)
    if (e.type === 'vpScored') for (const l of e.lines) bump(`vp.${e.seat}.${l.rule}`, l.vp)
    if (e.type === 'vp') bump(`vpx.${e.seat}.${e.source}`, e.n)
    if (e.type === 'markerControl') bump(`ctl.${e.to}.r${e.round}`)
  }
  for (const e of s.events as any[]) if (['charge.succeeded', 'melee.done', 'atk.removed', 'unitDestroyed', 'respawn', 'morph', 'returnedToReserves', 'shoot.fire'].includes(e.type)) bump(`ev.${e.type}`)
}
console.log(JSON.stringify(Object.fromEntries(Object.entries(c).sort())))
for (const l of notes) console.log(l)
