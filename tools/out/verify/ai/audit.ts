// AI verify scratch (behaviour lens): seeded games, tier A (seat alternates) vs tier B; flags suspect decisions of tier A.
// npx tsx tools/out/verify/ai/audit.ts --games 8 --a normal --b normal --matchups founders,tt --missions frontlines-skirmish
import { createAiDecider, type AiDecider } from '../../../../src/ai/decider'
import { apply } from '../../../../src/engine/apply'
import { legalActions } from '../../../../src/engine/pending'
import { createGame } from '../../../../src/engine/setup'
import { view } from '../../../../src/engine/view'
import * as query from '../../../../src/engine/query'
import { unitDef } from '../../../../src/engine/edition'
import type { GameState, SeatId } from '../../../../src/engine/types'
import { loadBundle } from '../../../sim-core'
import { MATCHUP_OPTS } from '../../../sim-matchups'
const bundle = loadBundle()
const arg = (n: string, d: string) => { const i = process.argv.indexOf(`--${n}`); return i >= 0 ? process.argv[i + 1]! : d }
const GAMES = Number(arg('games', '8')), TA = arg('a', 'normal') as any, TB = arg('b', 'normal') as any
const MU = arg('matchups', 'founders,tt').split(','), MIS = arg('missions', 'frontlines-skirmish').split(','), DEP = arg('deployment', 'abandoned-camp')
const SEED = arg('seed', 'au')
const c: Record<string, number> = {}; const ex: Record<string, string[]> = {}
const bump = (k: string, s?: string) => { c[k] = (c[k] ?? 0) + 1; if (s) { (ex[k] ??= []); if (ex[k]!.length < 6) ex[k]!.push(s) } }
const name = (s: GameState, id: string) => `${id}(${s.units[id]?.profileId})`
const hasMelee = (s: GameState, id: string) => { const u = s.units[id]!; const d = unitDef(bundle, u.profileId)!; return JSON.stringify(d).includes('"phase":"combat"') }
let wins = 0, losses = 0, draws = 0
const vpBy: Record<string, number> = {}
for (let g = 0; g < GAMES; g++) {
  const mu = MU[Math.floor(g / 2) % MU.length]!, mis = MIS[Math.floor(g / (2 * MU.length)) % MIS.length]!
  const seed = `${SEED}-${Math.floor(g / 2)}`
  let state = createGame(bundle, { seed, seats: ['A', 'B'], ...MATCHUP_OPTS[mu]!, missionId: mis, deploymentId: DEP } as any)
  const seatA: SeatId = state.seatOrder[g % 2]!
  const dec: Record<string, AiDecider> = {}
  for (const s of state.seatOrder) dec[s] = createAiDecider(s === seatA ? TA : TB, { seed: `${seed}-${s}`, bundle, accepts: (a) => apply(state, bundle, a).ok })
  const tag = `${seed}/${mu}/${mis}/A=${seatA}`
  let n = 0
  while (state.phase !== 'over' && n < 3000) {
    const p = state.pending
    const seat = p.seat === 'all' ? state.seatOrder[0]! : p.seat
    const legal = legalActions(state)
    const { action } = dec[seat]!.decideSync(view(state, seat), p, legal)
    const where = `${tag} r${state.round} ${state.roundPhase} ${p.id}`
    if (seat === seatA) {
      const k = p.kind; const a: any = action
      if (k === 'turn.activate') {
        const prod = legal.filter((o: any) => !['turn.pass', 'turn.hold', 'move.disengage'].includes(o.type))
        if (a.type === 'turn.pass' && prod.length) bump(`pass-with-${state.roundPhase}`, `${where} opts=${[...new Set(prod.map((o: any) => o.type + ':' + o.unitId))].join(' ')}`)
        if (a.type === 'turn.hold' && prod.length) bump('hold-with-options', `${where} ${a.unitId}`)
        if (a.type === 'charge.go') {
          const u = a.unitId as string
          const shoot = legal.some((o: any) => o.type === 'shoot.go' && o.unitId === u)
          const best = Math.max(0, ...Object.values(state.units).filter((t) => t.owner !== seat && t.location === 'table').map((t) => query.chargeOdds(state, bundle, u, [t.id]).chance))
          bump('charge.go'); if (!hasMelee(state, u)) bump('charge.go-no-melee-weapon', `${where} ${name(state, u)} best=${best.toFixed(2)} couldShoot=${shoot}`)
          if (shoot) bump('charge.go-instead-of-shoot', `${where} ${name(state, u)} chance=${best.toFixed(2)}`)
          if (best < 0.34) bump('charge.go-low-odds', `${where} ${name(state, u)} best=${best.toFixed(2)}`)
        }
        if (['deploy.go', 'shoot.go', 'move.go', 'move.run', 'melee.go'].includes(a.type)) bump(a.type)
        if (a.type.startsWith('mission.')) bump(a.type)
      }
      if (k === 'charge.targets') { const ch = query.chargeOdds(state, bundle, a.unitId, a.targetIds).chance; if (ch < 0.34) bump('charge.targets-low', `${where} ${name(state, a.unitId)} -> ${a.targetIds} ${ch.toFixed(2)}`) }
      if (k === 'shoot.batch' && a.done === true) {
        const pos = legal.filter((o: any) => o.done !== true && typeof o.weaponId === 'string').map((o: any) => query.attackPreview(state, bundle, o.unitId, o.weaponId, o.targetUnitId).expectedSupplyRemoved)
        if (pos.some((x) => x > 0.05)) bump('shoot-done-with-value', `${where} best=${Math.max(...pos).toFixed(2)}`)
      }
      if (k === 'atk.casualty') {
        const ctx: any = p.context; const u = state.units[ctx.unitId]!
        if (a.modelId === u.leadingModelId && legal.length > 1) bump('casualty-leader', `${where} ${a.modelId}`)
        const live = (mid: string) => u.modelIds.map((id) => state.models[id]!).filter((m) => m.life === 'active' && !m.offTable && m.id !== mid)
        const coh = (mid: string) => {
          const r = live(mid)
          if (r.length < 2) return true
          const s2 = { ...state, models: { ...state.models, [mid]: { ...state.models[mid]!, life: 'dead' } } } as GameState
          return query.coherencyPreview(s2, bundle, u.id, Object.fromEntries(r.map((m) => [m.id, m.pos]))).inCoherency
        }
        if (live(a.modelId).length > 1 && !coh(a.modelId) && legal.some((o: any) => coh(o.modelId))) bump('casualty-breaks-coherency', `${where} ${a.modelId}`)
        bump('casualty')
      }
      if (k === 'ability.window' && a.type === 'ability.use') bump(`ability:${a.abilityId}:${state.roundPhase}:${a.window}`)
      if (k === 'ability.react' && a.type === 'ability.useReaction') bump(`react:${a.abilityId}`)
      if (k === 'ability.react' && a.type !== 'ability.useReaction') bump('react-skip')
      if (k.startsWith('mission.')) bump(`${k}:${a.decline ? 'decline' : 'take'}`)
    }
    const r = apply(state, bundle, p.seat === 'all' ? { ...action, seat } : action)
    if (!r.ok) { bump('REJECT', `${where} ${r.rejection.code}`); break }
    const before = state
    state = r.state; n++
    if (before.round !== state.round || state.phase === 'over') {
      const res = Object.values(before.units).filter((u) => u.owner === seatA && u.location === 'reserves').length
      if (res) bump(`reserves-left-end-r${before.round}`, `${tag} ${res}`)
    }
    for (const e of state.events.slice(before.events.length) as any[]) {
      const side = (s: string) => (s === seatA ? 'A' : 'B')
      if (e.type === 'vpScored') for (const l of e.lines) vpBy[`${side(e.seat)}:${l.rule}`] = (vpBy[`${side(e.seat)}:${l.rule}`] ?? 0) + l.vp
      if (e.type === 'charge.failed' && state.units[e.unitId]?.owner === seatA) bump('charge-failed')
      if (e.type === 'unitDestroyed') bump(`destroyed-${side(state.units[e.unitId]?.owner ?? '')}`)
    }
  }
  const w = state.result?.winner
  if (state.phase !== 'over') bump('unfinished', tag)
  else if (!w) draws++
  else if (w === seatA) wins++
  else losses++
  const left = Object.values(state.units).filter((u) => u.owner === seatA && u.location === 'reserves').length
  console.error(`${tag} r${state.round} winner=${w ?? '-'} vp=${JSON.stringify(Object.fromEntries(state.seatOrder.map((s) => [s, state.seats[s]!.vp])))} ${state.result?.reason ?? ''} reservesLeftA=${left}`)
}
console.log(JSON.stringify({ wins, losses, draws, c, vpBy }, null, 1))
for (const [k, v] of Object.entries(ex)) console.log(k, '\n  ' + v.join('\n  '))
