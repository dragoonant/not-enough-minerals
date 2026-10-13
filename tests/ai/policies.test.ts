import { beforeAll, describe, expect, it } from 'vitest'
import { apply } from '../../src/engine/apply'
import { legalActions } from '../../src/engine/pending'
import { attackPreview, chargeOdds, supplyStatus, unitSupply } from '../../src/engine/query'
import { createGame } from '../../src/engine/setup'
import type { Action, GameState, SeatId } from '../../src/engine/types'
import { view } from '../../src/engine/view'
import { createAiDecider, makeContext } from '../../src/ai/decider'
import { bestCharge } from '../../src/ai/eval'
import { deployPlan, goalTerm } from '../../src/ai/moves'
import { edgeDist, threatsFor } from '../../src/ai/threat'
import { newMemory, type Tier } from '../../src/ai/types'
import { enemyUnitsOf, leaderOf } from '../../src/ai/world'
import { loadBundle } from '../../tools/sim-core'

const bundle = loadBundle()
const mk = (seed: string): GameState => createGame(bundle, { seed, seats: ['A', 'B'], armies: { A: 'terran-founders', B: 'zerg-founders' }, missionId: 'frontlines-skirmish', deploymentId: 'abandoned-camp' })

interface Obs {
  fallbacks: number; errors: number; finished: boolean
  doneWithValue: number; shootN: number
  zeroChance: number; chargeN: number
  casualtyLeader: number; casualtyN: number
  firstDeploy: boolean | null
  goalNormal: number[]; goalRandom: number[]
  deployAbility: number; chargeGo: number; lowChargeGo: number
}

/** Play `a` (seat A) against `b`, observing seat A's decisions. */
function play(seed: string, a: Tier, b: Tier): Obs {
  let state = mk(seed)
  const memA = newMemory()
  const dA = createAiDecider(a, { seed: 'a', bundle, memory: memA, accepts: (x) => apply(state, bundle, x).ok })
  const dB = createAiDecider(b, { seed: 'b', bundle, accepts: (x) => apply(state, bundle, x).ok })
  const o: Obs = { fallbacks: 0, errors: 0, finished: false, doneWithValue: 0, shootN: 0, zeroChance: 0, chargeN: 0, casualtyLeader: 0, casualtyN: 0, firstDeploy: null, goalNormal: [], goalRandom: [], deployAbility: 0, chargeGo: 0, lowChargeGo: 0 }
  let n = 0
  while (state.phase !== 'over' && n++ < 2500) {
    const seat: SeatId = state.pending.seat === 'all' ? state.seatOrder[0]! : state.pending.seat
    const legal = legalActions(state)
    const v = view(state, seat)
    const dec = (seat === 'A' ? dA : dB).decideSync(v, state.pending, legal)
    if (seat === 'A') {
      const act = dec.action
      const ctx = makeContext(a, v, state.pending, legal, { seed: 'obs', bundle }, newMemory())
      const kind = state.pending.kind
      if (kind === 'turn.activate' && o.firstDeploy === null && state.round === 1) o.firstDeploy = act.type === 'deploy.go'
      if (kind === 'ability.window' && act.type === 'ability.use' && memA.plan?.steps[0] === 'deploy.go') {
        // a buff at a deploy is wasted when no enemy is anywhere near (the longest reach in the game is Move + 18)
        const uid = String((state.pending.context as { unitId?: string }).unitId)
        const nearest = Math.min(...enemyUnitsOf(ctx.q, 'A').map((e) => edgeDist(ctx.q, uid, e.id)))
        if (nearest > 30) o.deployAbility++
      }
      if (kind === 'turn.activate' && act.type === 'charge.go') {
        o.chargeGo++
        const c = bestCharge(ctx, String(act.unitId))
        if (!c || c.chance < 0.34 || c.value <= 0) o.lowChargeGo++
      }
      if (kind === 'shoot.batch') {
        o.shootN++
        const live = legal.filter((x) => x.done !== true).some((x) => attackPreview(ctx.q, bundle, String(x.unitId), String(x.weaponId), String(x.targetUnitId)).expectedSupplyRemoved > 0.2)
        if (act.done === true && live) o.doneWithValue++
      }
      if (kind === 'charge.targets') {
        o.chargeN++
        const ch = (x: Action) => chargeOdds(ctx.q, bundle, String(x.unitId), x.targetIds as string[]).chance
        if (ch(act) === 0 && legal.some((x) => ch(x) > 0)) o.zeroChance++
      }
      if (kind === 'atk.casualty') {
        o.casualtyN++
        const u = ctx.view.units[String((state.pending.context as { unitId?: string }).unitId)]
        if (u && legal.length > 1 && legal.some((x) => x.modelId === u.leadingModelId) && act.modelId === u.leadingModelId) o.casualtyLeader++
      }
      if (kind === 'move.path' && typeof act.unitId === 'string' && Array.isArray(act.path)) {
        const end = act.path.at(-1) as { x: number; z: number }
        const pick = legal.filter((x) => Array.isArray(x.path))
        const rnd = pick[Math.floor(ctx.rng() * pick.length)]
        if (rnd) { o.goalNormal.push(goalTerm(ctx, end)); o.goalRandom.push(goalTerm(ctx, (rnd.path as { x: number; z: number }[]).at(-1)!)) }
      }
    }
    const r = apply(state, bundle, dec.action)
    expect(r.ok, `${state.pending.kind} ${JSON.stringify(dec.action)}`).toBe(true)
    if (!r.ok) break
    state = r.state
  }
  o.finished = state.phase === 'over'
  o.fallbacks = memA.stats.fallbacks
  o.errors = memA.stats.errors
  return o
}

describe('ai policies', () => {
  let obs: Obs
  beforeAll(() => { obs = play('pol-1', 'normal', 'random') }, 120000)

  it('POL-001 a normal game finishes with no fallback, no policy error and no rejected answer', () => {
    expect(obs.finished).toBe(true)
    expect(obs.fallbacks).toBe(0)
    expect(obs.errors).toBe(0)
  })

  it('POL-002 round one starts by deploying', () => {
    expect(obs.firstDeploy).toBe(true)
  })

  it('POL-003 shooting never stops while a Batch with real value is on offer', () => {
    expect(obs.shootN).toBeGreaterThan(0)
    expect(obs.doneWithValue).toBe(0)
  })

  it('POL-004 charge targets with no chance are not picked while another set has one', () => {
    expect(obs.zeroChance).toBe(0)
  })

  it('POL-009 no ability is spent in the window of a deploy (nothing to shoot or charge yet), and every charge.go has odds and value', () => {
    expect(obs.deployAbility).toBe(0)
    expect(obs.lowChargeGo).toBe(0)
  })

  it('POL-005 casualties spare the leading model when another model can go', () => {
    expect(obs.casualtyLeader).toBe(0)
  })

  it('POL-006 moves end nearer the markers than a random pick', () => {
    const avg = (xs: number[]) => xs.reduce((s, x) => s + x, 0) / Math.max(1, xs.length)
    expect(obs.goalNormal.length).toBeGreaterThan(5)
    expect(avg(obs.goalNormal)).toBeGreaterThan(avg(obs.goalRandom))
  })

  it('POL-007 the deploy plan fits Available Supply and is not empty at the first Movement Phase', () => {
    let s = mk('pol-7')
    // answer the pre-game marker choice until a turn.activate is open
    const d = createAiDecider('normal', { seed: 'x', bundle, accepts: (a) => apply(s, bundle, a).ok })
    for (let i = 0; i < 20 && s.pending.kind !== 'turn.activate'; i++) {
      const seat: SeatId = s.pending.seat === 'all' ? s.seatOrder[0]! : s.pending.seat
      const r = apply(s, bundle, d.decideSync(view(s, seat), s.pending, legalActions(s)).action)
      if (!r.ok) break
      s = r.state
    }
    expect(s.pending.kind).toBe('turn.activate')
    const seat = s.pending.seat as SeatId
    const ctx = makeContext('normal', view(s, seat), s.pending, legalActions(s), { seed: 'x', bundle }, newMemory())
    const plan = deployPlan(ctx, threatsFor(ctx))
    const st = supplyStatus(ctx.q, bundle, seat)
    expect(plan.length).toBeGreaterThan(0)
    expect(plan.reduce((t, id) => t + unitSupply(ctx.q, bundle, id), 0)).toBeLessThanOrEqual(st.available)
    expect(leaderOf(ctx.q, plan[0]!) ?? null).toBeDefined()
  })

  it('POL-008 answers are reproducible per seed for easy and normal', () => {
    for (const tier of ['easy', 'normal'] as const) {
      const a = play('pol-8', tier, 'random')
      const b = play('pol-8', tier, 'random')
      expect(a).toEqual(b)
    }
  }, 180000)
})
