// Engine faults the AI bench found (2026-10-16 follow-ups): an accepted answer must always settle the decision it answered,
// and an option the engine lists must be accepted. The games are the bench's own seeds (normal AI vs random, frozen clock).
import { describe, expect, it } from 'vitest'
import { createAiDecider } from '../../src/ai/decider'
import { apply } from '../../src/engine/apply'
import { legalActions } from '../../src/engine/pending'
import { createGame } from '../../src/engine/setup'
import type { Action, GameState, SeatId } from '../../src/engine/types'
import { view } from '../../src/engine/view'
import { bundle } from './helpers'

interface Play { state: GameState; problems: string[]; settled: number; reactions: number; pays: number }

function play(seed: string, armies: Record<SeatId, string>, missionId: string, deploymentId: string, aiSeat: SeatId, cap = 1500): Play {
  const b = bundle()
  let state = createGame(b, { seed, seats: ['A', 'B'], armies, missionId, deploymentId })
  const ai = Object.fromEntries(state.seatOrder.map((s) => [s, createAiDecider(s === aiSeat ? 'normal' : 'random', { seed: `${seed}-${s}`, bundle: b, now: () => 0, accepts: (a: Action) => apply(state, b, a).ok })]))
  const out: Play = { state, problems: [], settled: 0, reactions: 0, pays: 0 }
  for (let n = 0; n < cap && state.phase !== 'over'; n++) {
    const p = state.pending
    const seat = p.seat === 'all' ? state.seatOrder[0]! : p.seat
    const { action } = ai[seat]!.decideSync(view(state, seat), p, legalActions(state))
    const r = apply(state, b, action)
    if (!r.ok) { out.problems.push(`${p.id} ${p.kind} ${action.type} rejected: ${r.rejection.code} ${r.rejection.message}`); break }
    if (r.state.phase !== 'over' && r.state.pending.id === p.id) { out.problems.push(`${p.id} ${p.kind} ${action.type} accepted but the decision stayed open`); break }
    if (p.kind === 'ability.react') out.reactions++
    if (p.kind === 'ability.pay') out.pays++
    out.settled++
    state = r.state
  }
  out.state = state
  return out
}

describe('AI bench engine faults', () => {
  it('FAULT-01 a Corrosive Bile (delayed HITS at the end of the Phase) that resolves through Reactions hands control back (zp-x, s-9)', () => {
    const r = play('s-9', { A: 'zerg-expanded', B: 'protoss-expanded' }, 'gather-the-resources-skirmish', 'frontier', 'B')
    expect(r.problems).toEqual([])
    expect(r.reactions).toBeGreaterThan(0)
  }, 120_000)

  it('FAULT-03 a Corrosive Bile whose target dies keeps its continuation (it is not parked on the destroyed Unit) (zp-x, t-9)', () => {
    const r = play('t-9', { A: 'zerg-expanded', B: 'protoss-expanded' }, 'gather-the-resources-skirmish', 'frontier', 'A')
    expect(r.problems).toEqual([])
  }, 120_000)

  it('FAULT-02 a paid Active whose HITS finish at once (Shadow Strike) settles its ability.pay decision (protoss-mirror-x, s-12)', () => {
    for (const aiSeat of ['A', 'B'] as const) {
      const r = play('s-12', { A: 'protoss-expanded', B: 'protoss-expanded' }, 'artefact-hunt-skirmish', 'char-plains', aiSeat)
      expect(r.problems, aiSeat).toEqual([])
      expect(r.pays, aiSeat).toBeGreaterThan(0)
    }
  }, 240_000)
})
