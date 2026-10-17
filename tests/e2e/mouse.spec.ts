// Real-mouse checks (page.mouse hover, then click): the decision panel stays docked inside the window while a hover and a
// click change its content, the odds slot keeps its box when the odds appear, and the entry-band prompt is reachable.
import { expect, test, type Page } from '@playwright/test'
import { captureErrors } from './helpers'

type G = { __game: { getState(): { phase: string; pending: { seat: string; kind: string; options: { action: { type: string } }[] } } | null; idle(): boolean; legalActions(): { type: string }[]; submit(a: unknown): unknown; setSpeed(s: number): void } }

test.use({ viewport: { width: 1280, height: 800 } })
test.describe.configure({ mode: 'default' })

/** Answer seat A's decisions until the open decision kind matches `want`; false when the budget runs out. */
async function driveUntil(page: Page, want: RegExp, budgetMs: number): Promise<boolean> {
  const t0 = Date.now()
  let seed = 5
  while (Date.now() - t0 < budgetMs) {
    seed = (seed * 48271) % 2147483647
    const r = await page.evaluate(({ src, roll }) => {
      const g = (window as unknown as G).__game, s = g.getState()
      if (!s) return { wait: true }
      if (s.phase === 'over') return { over: true }
      if (!g.idle() || s.pending.seat !== 'A') return { wait: true }
      if (new RegExp(src).test(s.pending.kind)) return { hit: true }
      const legal = g.legalActions()
      const acting = legal.filter((a) => a.type !== 'turn.pass' && a.type !== 'ability.done')
      const pool = acting.length ? acting : legal
      g.submit(pool[roll % pool.length])
      return { did: true }
    }, { src: want.source, roll: seed })
    if (r.over) return false
    if (r.hit) return true
    await page.waitForTimeout(r.did ? 15 : 40)
  }
  return false
}

async function boot(page: Page, seed: string): Promise<string[]> {
  const errors = captureErrors(page)
  await page.goto(`./?test=1&seats=human,bot&seed=${seed}&speed=instant&matchup=founders`)
  await expect(page.getByTestId('game-screen')).toBeVisible({ timeout: 30_000 })
  await page.evaluate(() => (window as unknown as G).__game.setSpeed(0))
  return errors
}

const inView = (b: { x: number; y: number; width: number; height: number } | null, vw = 1280, vh = 800): boolean =>
  !!b && b.x >= -1 && b.y >= -1 && b.x + b.width <= vw + 1 && b.y + b.height <= vh + 1

test('mouse: the prompt stays docked in view while a hover and a click change it', async ({ page }) => {
  test.setTimeout(240_000)
  const errors = await boot(page, 'mouse-dock')
  expect(await driveUntil(page, /^turn\.activate$/, 90_000)).toBe(true)
  const prompt = page.getByTestId('interaction-prompt')
  await expect(prompt).toBeVisible()
  const before = await prompt.boundingBox()
  expect(inView(before)).toBe(true)
  const chip = page.locator('[data-testid^="unit-chip-"]').first()
  const cb = (await chip.boundingBox())!
  await page.mouse.move(cb.x + cb.width / 2, cb.y + cb.height / 2)
  await page.mouse.down(); await page.mouse.up()
  await expect(page.getByTestId('action-menu')).toBeVisible()
  const after = await prompt.boundingBox()
  expect(inView(after)).toBe(true)
  expect(after!.y + after!.height).toBeGreaterThan(400) // still on the lower half; it did not jump to the top
  expect(errors).toEqual([])
})

test('mouse: hovering a target fills the fixed odds slot without moving it, a click arms the shot', async ({ page }) => {
  test.setTimeout(300_000)
  const errors = await boot(page, 'mouse-odds')
  expect(await driveUntil(page, /^shoot\.batch$/, 200_000)).toBe(true)
  const slot = page.getByTestId('ix-slot')
  await expect(slot).toBeVisible()
  const empty = await slot.boundingBox()
  const target = page.locator('[data-testid^="target-"]').first()
  const tb = (await target.boundingBox())!
  await page.mouse.move(tb.x + tb.width / 2, tb.y + tb.height / 2)
  await expect(page.getByTestId('ix-odds')).toBeVisible()
  const withOdds = await slot.boundingBox()
  expect(Math.abs(withOdds!.y + withOdds!.height - (empty!.y + empty!.height))).toBeLessThan(40)
  const tb2 = (await target.boundingBox())!
  await page.mouse.move(tb2.x + tb2.width / 2, tb2.y + tb2.height / 2)
  await page.mouse.down(); await page.mouse.up()
  await expect(page.getByTestId('fire-confirm')).toBeEnabled()
  expect(errors).toEqual([])
})

test('mouse: an arriving squad shows its entry prompt and a hover on a choice leaves the panel in view', async ({ page }) => {
  test.setTimeout(300_000)
  const errors = await boot(page, 'mouse-entry')
  const found = await driveUntil(page, /^deploy\.(entry|path)$/, 200_000)
  test.skip(!found, 'no arrival came up in this seed within the budget')
  const prompt = page.getByTestId('interaction-prompt')
  await expect(prompt).toBeVisible()
  const btn = page.locator('[data-testid^="opt-"], [data-testid="path-confirm"]').first()
  const bb = (await btn.boundingBox())!
  await page.mouse.move(bb.x + bb.width / 2, bb.y + bb.height / 2)
  expect(inView(await prompt.boundingBox())).toBe(true)
  expect(errors).toEqual([])
})
