import { describe, expect, it, vi } from 'vitest'
import { handleRequest, resetWorkerDeciders, type WorkerRequest, type WorkerResponse } from '../../src/ai/worker'
import { AI_WORKER_TIMEOUT_MS, aiBudgetMs } from '../../src/ai/types'
import { createAiBrain, getAiTrace, clearAiTrace, type WorkerLike } from '../../src/client/bot/aiWorkerClient'
import { AI_MS, botRaceMs, setTierBrains, WATCHDOG_MS } from '../../src/client/bot/botDriver'
import type { Action } from '../../src/engine/types'

const legal: Action[] = [{ type: 'turn.pass' } as unknown as Action]
const view = { seat: 0, round: 1 } as never
const pending = { id: 'p1', kind: 'turn.activate', seat: 0 } as never
const ctx = { seed: 's', budgetMs: 100, accepts: () => true }

function fakeWorker(mode: 'ok' | 'silent' | 'throw' | 'error'): WorkerLike {
  const w: WorkerLike = {
    onmessage: null, onerror: null,
    postMessage(m: WorkerRequest) {
      if (m.type !== 'decide' || mode === 'silent') return
      if (mode === 'throw') throw new Error('boom')
      const r: WorkerResponse = mode === 'ok'
        ? { type: 'action', id: m.id, action: m.legal[0]!, ms: 5, fallback: false }
        : { type: 'error', id: m.id, message: 'bad' }
      queueMicrotask(() => w.onmessage?.({ data: r }))
    },
  }
  return w
}

describe('ai worker host and client', () => {
  it('AIW-001 init answers ready; unknown messages answer nothing', () => {
    expect(handleRequest({ type: 'init' }, {} as never)).toEqual({ type: 'ready' })
    resetWorkerDeciders()
  })
  it('AIW-002 a decide request with an unusable bundle answers an error, not a throw', () => {
    const r = handleRequest({ type: 'decide', id: 7, view, pending, legal, tier: 'normal', seed: 's', memoryKey: 'k' }, {} as never)
    expect(r?.type === 'action' || r?.type === 'error').toBe(true)
    expect((r as { id: number }).id).toBe(7)
  })
  it('AIW-003 budget defaults to 150 ms and the worker timeout is 3 s', () => {
    expect(AI_WORKER_TIMEOUT_MS).toBe(3000)
    expect(aiBudgetMs()).toBeGreaterThan(0)
    expect(AI_MS).toBe(aiBudgetMs())
  })
  it('AIW-004 the brain returns the worker action and traces it', async () => {
    clearAiTrace()
    const b = createAiBrain('normal', { makeWorker: () => fakeWorker('ok') })
    const a = await b(view, pending, legal, ctx)
    expect(a).toBe(legal[0])
    expect(getAiTrace().at(-1)).toMatchObject({ via: 'worker', kind: 'turn.activate', tier: 'normal' })
    expect((b as { usesWorker: boolean }).usesWorker).toBe(true)
    b.dispose()
  })
  it('AIW-005 a silent worker times out and the main thread answers (no bundle -> rejects)', async () => {
    vi.useFakeTimers()
    const b = createAiBrain('normal', { makeWorker: () => fakeWorker('silent'), timeoutMs: 50 })
    const p = Promise.resolve(b(view, pending, legal, ctx)).then(() => 'answered', (e: unknown) => (e as Error).message)
    await vi.advanceTimersByTimeAsync(60)
    expect(await p).toBe('ai: no bundle') // reached the in-thread path
    vi.useRealTimers()
    b.dispose()
  })
  it('AIW-006 a worker error reply also falls through to the main thread', async () => {
    const b = createAiBrain('easy', { makeWorker: () => fakeWorker('error') })
    await expect(b(view, pending, legal, ctx)).rejects.toThrow('ai: no bundle')
    b.dispose()
  })
  it('AIW-007 no Worker available: main-thread path, usesWorker false', async () => {
    const b = createAiBrain('normal', { makeWorker: () => null })
    await expect(b(view, pending, legal, ctx)).rejects.toThrow('ai: no bundle')
    expect(b.usesWorker).toBe(false)
  })
  it('AIW-008 trace keeps at most 60 entries; setTierBrains(null) is accepted', async () => {
    clearAiTrace()
    const b = createAiBrain('normal', { makeWorker: () => fakeWorker('ok') })
    for (let i = 0; i < 65; i++) await b(view, pending, legal, ctx)
    expect(getAiTrace().length).toBe(60)
    setTierBrains(null)
    b.dispose()
  })
  it('AIW-009 the driver waits for the worker timeout plus the main-thread search, and stays under the watchdog', () => {
    const race = botRaceMs(AI_MS)
    expect(race).toBeGreaterThanOrEqual(AI_WORKER_TIMEOUT_MS + 4 * aiBudgetMs())
    expect(race).toBeLessThan(WATCHDOG_MS)
    expect(botRaceMs(AI_MS, 100)).toBe(AI_MS) // a tiny test watchdog never makes the race shorter than the budget
  })
  it('AIW-010 a decision the driver already gave up on is not searched on the main thread after a worker timeout', async () => {
    vi.useFakeTimers()
    const b = createAiBrain('normal', { makeWorker: () => fakeWorker('silent'), timeoutMs: 50 })
    const p = Promise.resolve(b(view, pending, legal, { ...ctx, isCurrent: () => false })).then(() => 'answered', (e: unknown) => (e as Error).message)
    await vi.advanceTimersByTimeAsync(60)
    expect(await p).toBe('stale decision') // not 'ai: no bundle': the in-thread decider never ran
    vi.useRealTimers()
    b.dispose()
  })
  it('AIW-011 the brain passes the declared budget to the worker unchanged', async () => {
    const seen: number[] = []
    const w = fakeWorker('ok')
    const post = w.postMessage.bind(w)
    w.postMessage = (m: WorkerRequest) => { if (m.type === 'decide') seen.push(m.budgetMs ?? -1); post(m) }
    const b = createAiBrain('normal', { makeWorker: () => w })
    await b(view, pending, legal, ctx)
    expect(seen).toEqual([ctx.budgetMs])
    b.dispose()
  })
})
