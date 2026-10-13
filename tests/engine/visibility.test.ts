import { describe, expect, it, vi } from 'vitest'
import { hasStatus, setStatus } from '../../src/engine/effects'
import { runHook } from '../../src/engine/hooks'
import type { GameState } from '../../src/engine/types'
import { canSee, canTarget, detect, visibleModels } from '../../src/engine/visibility'
import { bundle, duelState } from './helpers'

vi.mock('../../src/engine/squads', async (orig) => {
  const real = await orig<typeof import('../../src/engine/squads')>()
  return {
    ...real,
    unitModels: (state: GameState, unitId: string, o: { includeDead?: boolean } = {}) => {
      try { return real.unitModels(state, unitId, o) } catch {
        const u = state.units[unitId]
        return u ? u.modelIds.map((id) => state.models[id]!).filter((m) => o.includeDead || m.life !== 'dead') : []
      }
    },
  }
})

const b = bundle()
const RANGED = { ranged: true, needsLos: true } as const

/** The Marines walk to within `z` of the table centre line (inside HIDDEN range of the Zerglings). */
function marinesCloseIn(s: GameState): GameState {
  const models = { ...s.models }
  for (const id of s.units['A-marines']!.modelIds) models[id] = { ...models[id]!, pos: { x: models[id]!.pos.x, z: -2.2 + (models[id]!.pos.z - 6) } }
  return { ...s, models }
}

describe('visibility: the one mechanism (spec 16 s7)', () => {
  it('VIS-001 a HIDDEN unit cannot be picked by a Ranged Attack unless an acting model is within 4"', () => {
    let s = duelState(b)
    expect(canTarget(s, b, 'A-marines', 'B-zerglings', RANGED).ok).toBe(true)
    s = setStatus(s, b, 'B-zerglings', 'HIDDEN', 'gain', 'path-of-shadows')
    const far = canTarget(s, b, 'A-marines', 'B-zerglings', RANGED)
    expect(far.ok).toBe(false)
    expect(far.reasons).toEqual(['hidden'])
    const near = canTarget(marinesCloseIn(s), b, 'A-marines', 'B-zerglings', RANGED)
    expect(near.ok).toBe(true)
    expect(near.models.length).toBeGreaterThan(0)
  })

  it('VIS-002 HIDDEN models are not Visible beyond 4", whatever the line of sight', () => {
    let s = duelState(b)
    const a = 'A-marines.0', z = 'B-zerglings.0'
    expect(canSee(s, b, a, z)).toBe(true)
    s = setStatus(s, b, 'B-zerglings', 'HIDDEN', 'gain', 'x')
    expect(canSee(s, b, a, z)).toBe(false)
    expect(visibleModels(s, b, 'A-marines', 'B-zerglings')).toEqual([])
    expect(canSee(s, b, z, a)).toBe(true)
  })

  it('VIS-005 HIDDEN does not stop a Charge, but INDIRECT FIRE (ranged, no LoS) is still blocked', () => {
    let s = duelState(b)
    s = setStatus(s, b, 'B-zerglings', 'HIDDEN', 'gain', 'x')
    expect(canTarget(s, b, 'A-marines', 'B-zerglings', { ranged: false, needsLos: false }).ok).toBe(true)
    expect(canTarget(s, b, 'A-marines', 'B-zerglings', { ranged: true, needsLos: false }).ok).toBe(false)
  })

  it('VIS-012 VIS-014 detection removes HIDDEN once, leaves BURROWED, and an area keeps HIDDEN from being held', () => {
    let s = duelState(b)
    s = setStatus(s, b, 'B-zerglings', 'BURROWED', 'gain', 'burrow')
    expect(hasStatus(s, 'B-zerglings', 'HIDDEN')).toBe(true)
    const z = s.models['B-zerglings.0']!.pos
    s = { ...s, detectors: [{ id: 'scan', owner: 'A', centre: { kind: 'point', pos: z }, radius: 6, source: 'scanner-sweep', expires: 'endOfRound' }] }
    s = detect(s, b)
    expect(hasStatus(s, 'B-zerglings', 'HIDDEN')).toBe(false)
    expect(hasStatus(s, 'B-zerglings', 'BURROWED')).toBe(true)
    // inside the area the status cannot be held again; the area's own side is not affected
    expect(hasStatus(setStatus(s, b, 'B-zerglings', 'HIDDEN', 'gain', 'again'), 'B-zerglings', 'HIDDEN')).toBe(false)
    expect(hasStatus(setStatus(s, b, 'A-marines', 'HIDDEN', 'gain', 'own'), 'A-marines', 'HIDDEN')).toBe(true)
  })

  it('VIS-013 a loss of HIDDEN is an event that a Reaction (Might of the Nerazim) can answer', () => {
    let s = duelState(b)
    s = { ...s, cards: { ...s.cards, B: [{ id: 'nerazim', kind: 'faction', exhausted: false, resource: { res: 'PE', n: 1 }, usage: {} }] } }
    const r = runHook(s, b, 'onLoseHidden', { unitId: 'B-zerglings', seat: 'B' })
    expect(r.raised).toBe(true)
    expect(r.state.pending.kind).toBe('ability.react')
    expect(r.state.pending.seat).toBe('B')
    // a service that cannot suspend (setStatus) never prompts
    const quiet = runHook(s, b, 'onLoseHidden', { unitId: 'B-zerglings', seat: 'B', noPrompt: true })
    expect(quiet.raised).toBeUndefined()
  })

  it('VIS-013 a loss of HIDDEN from a service that cannot suspend is queued, and its Reaction is offered at the next hook point', () => {
    let s = duelState(b)
    s = { ...s, cards: { ...s.cards, B: [{ id: 'nerazim', kind: 'faction', exhausted: false, resource: { res: 'PE', n: 1 }, usage: {} }] } }
    s = setStatus(s, b, 'B-zerglings', 'HIDDEN', 'gain', 'test')
    const lost = setStatus(s, b, 'B-zerglings', 'HIDDEN', 'lose', 'test')
    expect(lost.pending.id).toBe(s.pending.id) // the service did not interrupt
    const next = runHook(lost, b, 'onMoveEnd', { unitId: 'A-marines', seat: 'A' })
    expect(next.raised).toBe(true)
    expect(next.state.pending.kind).toBe('ability.react')
    expect(next.state.pending.seat).toBe('B')
    // offered once: the queue is empty afterwards
    expect(runHook(next.state, b, 'onMoveEnd', { unitId: 'A-marines', seat: 'A', foldOnly: true }).raised).toBeUndefined()
  })
})
