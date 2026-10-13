// AI brain for the bot driver (spec 40): posts the seat's view to src/ai/worker.ts and returns the action. When no
// Worker exists (node tests, old browsers) or the worker fails, the same decider runs on the main thread with
// accepts = gameStore.preview. Only view(state, seat), the open decision and the legal answers cross over.
import type { WorkerRequest, WorkerResponse } from '../../ai/worker'
import { AI_WORKER_TIMEOUT_MS, aiBudgetMs, type Tier } from '../../ai/types'
import { createAiDecider, type AiDecider } from '../../ai/decider'
import type { Action } from '../../engine/types'
import { preview, useGameStore } from '../store/gameStore'
import { PARAMETERISED, type BotBrain } from './randomBot'

type Pending = { resolve: (r: { action: Action; ms: number; fallback: boolean }) => void; reject: (e: Error) => void }

export interface WorkerLike {
  postMessage(m: WorkerRequest): void
  terminate?(): void
  onmessage: ((ev: { data: WorkerResponse }) => void) | null
  onerror: ((ev: unknown) => void) | null
}

/** One answered decision, for the ?aitrace debug panel (candidates are not exposed by the frozen decider). */
export interface AiTraceEntry { id: string; kind: string; tier: Tier; seat: string; action: string; via: 'worker' | 'main' | 'timeout->main' | 'error->main'; ms: number; fallback: boolean }
const TRACE_MAX = 60
const traceLog: AiTraceEntry[] = []
const traceSubs = new Set<() => void>()
/** Latest AI decisions, newest last (max 60). */
export function getAiTrace(): readonly AiTraceEntry[] { return traceLog }
export function clearAiTrace(): void { traceLog.length = 0; traceSubs.forEach((f) => f()) }
export function subscribeAiTrace(f: () => void): () => void { traceSubs.add(f); return () => { traceSubs.delete(f) } }
function pushTrace(e: AiTraceEntry): void { traceLog.push(e); if (traceLog.length > TRACE_MAX) traceLog.shift(); traceSubs.forEach((f) => f()) }

export interface AiBrainOptions {
  /** Test hook: worker answer timeout in ms (default AI_WORKER_TIMEOUT_MS = 3000). */
  timeoutMs?: number
  /** Test hook: supply a worker (or null to force the main-thread path). Default: a real module Worker if available. */
  makeWorker?: () => WorkerLike | null
}

function defaultWorker(): WorkerLike | null {
  if (typeof Worker === 'undefined') return null
  try { return new Worker(new URL('../../ai/worker.ts', import.meta.url), { type: 'module' }) as unknown as WorkerLike } catch { return null }
}

/** Build the brain for a tier. Call dispose() to end the worker (new game or tier change). */
export function createAiBrain(tier: Tier, opts: AiBrainOptions = {}): BotBrain & { dispose(): void; readonly usesWorker: boolean } {
  let worker: WorkerLike | null | undefined
  let seq = 0
  const pending = new Map<number, Pending>()
  const local = new Map<string, AiDecider>()

  function failAll(msg: string): void {
    for (const p of pending.values()) p.reject(new Error(msg))
    pending.clear()
  }
  function ensureWorker(): WorkerLike | null {
    if (worker !== undefined) return worker
    const w = (opts.makeWorker ?? defaultWorker)()
    worker = w
    if (w) {
      w.onmessage = (ev) => {
        const r = ev.data
        if (r.type === 'ready') return
        const p = pending.get(r.id)
        if (!p) return
        pending.delete(r.id)
        if (r.type === 'action') p.resolve({ action: r.action, ms: r.ms, fallback: r.fallback }); else p.reject(new Error(r.message))
      }
      w.onerror = () => { worker = null; failAll('ai worker failed'); try { w.terminate?.() } catch { /* gone */ } }
    }
    return w
  }

  function mainThread(key: string, seed: string, view: Parameters<BotBrain>[0], p: Parameters<BotBrain>[1], legal: Action[], budgetMs: number): { action: Action; fallback: boolean; ms: number } {
    const bundle = useGameStore.getState().bundle
    if (!bundle) throw new Error('ai: no bundle')
    let d = local.get(key)
    if (!d) { d = createAiDecider(tier, { seed, bundle, budgetMs, accepts: (a) => preview(a).ok }); local.set(key, d) }
    return d.decideSync(view, p, legal)
  }

  const brain: BotBrain = async (view, p, legal, ctx) => {
    // The declared budget unchanged: the work meter is deterministic, so the bot players face is the one the bench measures.
    const budgetMs = ctx.budgetMs > 0 ? ctx.budgetMs : aiBudgetMs()
    const key = `${ctx.seed}:${view.seat}`
    const w = ensureWorker()
    const log = (action: Action, via: AiTraceEntry['via'], ms: number, fallback: boolean): Action => {
      pushTrace({ id: p.id, kind: p.kind, tier, seat: view.seat, action: action.type, via, ms, fallback })
      return action
    }
    let via: AiTraceEntry['via'] = 'main'
    if (w) {
      const id = ++seq
      let timer: ReturnType<typeof setTimeout> | undefined
      try {
        const r = await Promise.race([
          new Promise<{ action: Action; ms: number; fallback: boolean }>((resolve, reject) => {
            pending.set(id, { resolve, reject })
            w.postMessage({ type: 'decide', id, view, pending: p, legal, tier, seed: ctx.seed, memoryKey: key, budgetMs })
          }),
          new Promise<never>((_, reject) => { timer = setTimeout(() => reject(new Error('timeout')), opts.timeoutMs ?? AI_WORKER_TIMEOUT_MS) }),
        ])
        // The worker's shim cannot see everything the engine checks: confirm parameterised answers on the real state.
        if (!PARAMETERISED.has(r.action.type) || ctx.accepts(r.action)) return log(r.action, 'worker', r.ms, r.fallback)
      } catch (e) {
        via = e instanceof Error && e.message === 'timeout' ? 'timeout->main' : 'error->main'
      } finally {
        pending.delete(id)
        if (timer !== undefined) clearTimeout(timer)
      }
    }
    // The driver gave up on this decision while the worker was silent: do not search (or touch the local memory) for it.
    if (via !== 'main' && ctx.isCurrent && !ctx.isCurrent()) throw new Error('stale decision')
    const m = mainThread(key, ctx.seed, view, p, legal, budgetMs)
    return log(m.action, via, m.ms, m.fallback)
  }
  const out = brain as BotBrain & { dispose(): void; readonly usesWorker: boolean }
  out.dispose = () => { failAll('disposed'); try { worker?.terminate?.() } catch { /* gone */ } worker = undefined; local.clear() }
  Object.defineProperty(out, 'usesWorker', { get: () => !!worker })
  return out
}
