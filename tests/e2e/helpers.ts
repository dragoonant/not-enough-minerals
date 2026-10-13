// Shared e2e helpers: console error capture and a human-seat driver that answers through window.__game.
import type { Page } from '@playwright/test'

/** Console errors and page errors seen by a page (benign WebGL/driver noise filtered). */
export function captureErrors(page: Page): string[] {
  const errors: string[] = []
  const benign = /GPU stall|WebGL|swiftshader|Automatic fallback to software|favicon/i
  page.on('console', (m) => { if (m.type() === 'error' && !benign.test(m.text())) errors.push(m.text().slice(0, 400)) })
  page.on('pageerror', (e) => errors.push(`pageerror: ${e.message}`))
  return errors
}

interface StepResult { over?: boolean; did?: string; rej?: string | null; wait?: string }

/**
 * Play until the game is over. Every decision owned by a seat in `humanSeats` is answered with a legal action (a seeded
 * pick that prefers acting over passing); bots answer their own. Returns the number of human answers.
 */
export async function playToEnd(page: Page, humanSeats: string[], timeoutMs: number): Promise<number> {
  const t0 = Date.now()
  let answered = 0
  let seed = 7
  while (Date.now() - t0 < timeoutMs) {
    seed = (seed * 1103515245 + 12345) % 2147483648
    const r = await page.evaluate(({ humans, roll }): StepResult => {
      const g = (window as unknown as { __game: {
        getState(): { phase: string; pending: { seat: string; kind: string } } | null; idle(): boolean
        legalActions(): { type: string }[]; submit(a: unknown): { text: string } | null
      } }).__game
      const s = g.getState()
      if (!s) return { wait: 'boot' }
      if (s.phase === 'over') return { over: true }
      if (!humans.includes(s.pending.seat) || !g.idle()) return { wait: 'other' }
      const legal = g.legalActions()
      const acting = legal.filter((a) => a.type !== 'turn.pass')
      const pool = acting.length && roll % 100 < 85 ? acting : legal
      const a = pool[roll % pool.length]
      if (!a) return { wait: 'none' }
      const rej = g.submit(a)
      return { did: a.type, rej: rej ? rej.text : null }
    }, { humans: humanSeats, roll: seed >>> 8 })
    if (r.over) return answered
    if (r.did) answered++
    await page.waitForTimeout(r.did ? 20 : 80)
  }
  throw new Error(`game did not finish within ${timeoutMs} ms (${answered} human answers)`)
}
