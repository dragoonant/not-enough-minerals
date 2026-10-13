// HOOK-*: every hook point of HOOK_WIRING (spec 00 s4.3) fires inside a real game (KB 9.3), not just in isolation.
// Real set-ups (createGame with the Founders and first-battle armies) are played to the end by a seeded random bot
// while a test-only tracer (hooks.setHookTracer, which never touches state) records each point that runs.
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { apply } from '../../src/engine/apply'
import { HOOK_POINTS, HOOK_WIRING, setHookTracer, type HookPoint } from '../../src/engine/hooks'
import { legalActions } from '../../src/engine/pending'
import { deriveSeed, nextFloat } from '../../src/engine/rng'
import { createGame, type CreateGameOpts } from '../../src/engine/setup'
import type { GameState } from '../../src/engine/types'
import { attackPreview } from '../../src/engine/query'
import { bundle, duelState } from './helpers'

const b = bundle()
/** Matchups tried in order until every point has fired (the loop stops early). */
const GAMES: Pick<CreateGameOpts, 'armies' | 'preset'>[] = [
  { armies: { A: 'terran-founders', B: 'zerg-founders' } },
  { preset: 'first-battle' },
  { armies: { A: 'terran-starter', B: 'zerg-starter' } },
  { armies: { A: 'protoss-starter', B: 'zerg-starter' } },
  { armies: { A: 'terran-starter', B: 'protoss-starter' } },
  { armies: { A: 'protoss-starter', B: 'protoss-starter' } },
]
const seen = new Map<HookPoint, number>()
const finished: boolean[] = []

/** The sim's bot: seeded per decision, acts rather than Passes 9 times in 10. */
function play(opts: Pick<CreateGameOpts, 'armies' | 'preset'>, seed: string): GameState {
  let s = createGame(b, { seed, seats: ['A', 'B'], ...opts })
  for (let i = 0; i < 2000 && s.phase !== 'over'; i++) {
    const legal = legalActions(s)
    const [f, s2] = nextFloat(deriveSeed(seed, s.pending.id))
    const [g] = nextFloat(s2)
    const acts = legal.filter((a) => a.type !== 'turn.pass')
    const pool = acts.length && g < 0.9 ? acts : legal
    const r = apply(s, b, pool[Math.floor(f * pool.length)]!)
    if (!r.ok) throw new Error(`${seed}: ${r.rejection.code} ${r.rejection.message}`)
    s = r.state
  }
  return s
}

describe('HOOK_WIRING in real games', () => {
  beforeAll(() => {
    setHookTracer((p) => seen.set(p, (seen.get(p) ?? 0) + 1))
    for (const [i, g] of GAMES.entries()) {
      finished.push(play(g, `hook-wiring-${i}`).phase === 'over')
      if (HOOK_POINTS.every((p) => seen.has(p))) break
    }
  }, 120_000)
  afterAll(() => setHookTracer(null))

  it('HOOK-000 the games finish and every hook point has one documented call site', () => {
    expect(finished.length).toBeGreaterThan(0)
    expect(finished.every(Boolean)).toBe(true)
    expect(Object.keys(HOOK_WIRING).sort()).toEqual([...HOOK_POINTS].sort())
  })

  for (const [i, point] of HOOK_POINTS.entries()) {
    it(`HOOK-${String(i + 1).padStart(3, '0')} ${point} fires in a real game (${HOOK_WIRING[point]})`, () => {
      expect(seen.get(point) ?? 0).toBeGreaterThan(0)
    })
  }

  it('HOOK-100 attackPreview only folds: every hook call it makes is foldOnly and the state is untouched', () => {
    const s0 = duelState(b, { gap: 10 })
    const calls: { point: HookPoint; foldOnly: boolean }[] = []
    setHookTracer((p, ctx) => calls.push({ point: p, foldOnly: ctx.foldOnly === true }))
    const before = JSON.stringify(s0)
    const p = attackPreview(s0, b, 'A-marines', 'c-14-rifle', 'B-zerglings')
    setHookTracer((pt) => seen.set(pt, (seen.get(pt) ?? 0) + 1))
    expect(p.legal).toBe(true)
    expect(calls.length).toBeGreaterThan(0)
    expect(calls.filter((c) => !c.foldOnly)).toEqual([])
    expect(JSON.stringify(s0)).toBe(before)
  })
})
