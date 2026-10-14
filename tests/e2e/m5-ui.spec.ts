// M5 owner feedback: skill names explain themselves on hover (unit card and decision panel), and every box on the game
// screen can be minimised; H hides them all and brings the exact layout back. Screenshots: screenshots/m5-skill-tooltip-*.png,
// screenshots/m5-ui-hidden.png, screenshots/m5-ui-restored.png (1280x800).
import { expect, test, type Page } from '@playwright/test'
import { captureErrors } from './helpers'

type G = { __game: { getState(): { phase: string; pending: { seat: string; kind: string; options: { action: { type: string } }[] } } | null; idle(): boolean; legalActions(): { type: string }[]; submit(a: unknown): unknown; setSpeed(s: number): void } }

test.use({ viewport: { width: 1280, height: 800 } })
test.describe.configure({ mode: 'default' })

/** Answer seat A's decisions (preferring to act) until `want` matches the open decision kind. */
async function driveUntil(page: Page, want: RegExp, budgetMs: number, accept?: (kind: string, types: string[]) => boolean): Promise<boolean> {
  const t0 = Date.now()
  let seed = 11
  while (Date.now() - t0 < budgetMs) {
    seed = (seed * 48271) % 2147483647
    const r = await page.evaluate(({ src, roll }) => {
      const g = (window as unknown as G).__game, s = g.getState()
      if (!s) return { wait: true }
      if (s.phase === 'over') return { over: true }
      if (!g.idle() || s.pending.seat !== 'A') return { wait: true }
      if (new RegExp(src).test(s.pending.kind)) return { hit: s.pending.kind, types: s.pending.options.map((o) => o.action.type) }
      const legal = g.legalActions()
      const acting = legal.filter((a) => a.type !== 'turn.pass' && a.type !== 'ability.done')
      const use = legal.filter((a) => /^ability\./.test(a.type) && a.type !== 'ability.done')
      const pool = use.length ? use : acting.length ? acting : legal
      g.submit(pool[roll % pool.length])
      return { did: true }
    }, { src: want.source, roll: seed })
    if (r.over) return false
    if (r.hit && (!accept || accept(r.hit, r.types ?? []))) return true
    if (r.hit) {
      await page.evaluate(() => { const g = (window as unknown as G).__game; const l = g.legalActions(); g.submit(l.find((a) => a.type !== 'turn.pass') ?? l[0]) })
    }
    await page.waitForTimeout(r.did ? 15 : 40)
  }
  return false
}

test('m5 skill tooltips on the unit card and the decision panel', async ({ page }) => {
  test.setTimeout(240_000)
  const errors = captureErrors(page)
  await page.goto('./?test=1&seats=human,bot&seed=m5-skill&speed=instant&matchup=founders')
  await expect(page.getByTestId('game-screen')).toBeVisible({ timeout: 30_000 })
  await page.evaluate(() => (window as unknown as G).__game.setSpeed(0))

  // 1) unit card: open the activation menu on a squad whose card lists abilities, then hover an ability name
  expect(await driveUntil(page, /^turn\.activate$/, 90_000)).toBe(true)
  await page.waitForTimeout(400)
  const chips = page.locator('[data-testid^="unit-chip-"]')
  const n = await chips.count()
  let found = false
  for (let i = 0; i < n && !found; i++) {
    await chips.nth(i).click()
    await page.waitForTimeout(150)
    found = (await page.locator('[data-testid="unit-card"] [data-testid^="ability-name-"]').count()) > 0
  }
  expect(found).toBe(true)
  const name = page.locator('[data-testid="unit-card"] [data-testid^="ability-name-"]').first()
  await name.hover()
  const tip = page.getByTestId('tooltip')
  await expect(tip).toBeVisible()
  await expect(tip.getByTestId('skill-tip')).toContainText(/Active|Passive|Reaction/)
  const box = (await tip.boundingBox())!
  expect(box.width).toBeLessThanOrEqual(322)
  expect(box.x).toBeGreaterThanOrEqual(0)
  expect(box.y).toBeGreaterThanOrEqual(0)
  expect(box.x + box.width).toBeLessThanOrEqual(1280)
  expect(box.y + box.height).toBeLessThanOrEqual(800)
  await page.screenshot({ path: 'screenshots/m5-skill-tooltip-card.png' })

  // 2) decision panel: an ability window or reaction for seat A, hover its first ability button
  await page.mouse.move(640, 400)
  const ok = await driveUntil(page, /^ability\.(window|react)$/, 120_000)
  expect(ok).toBe(true)
  await page.waitForTimeout(400)
  const btn = page.locator('[data-testid="interaction-prompt"] [data-testid^="opt-use"], [data-testid="interaction-prompt"] [data-testid^="opt-react"]').first()
  await expect(btn).toBeVisible()
  await expect(btn.locator('.skill-name')).toBeVisible()
  await btn.hover()
  await expect(page.getByTestId('tooltip')).toBeVisible()
  await expect(page.getByTestId('tooltip').getByTestId('skill-tip')).toContainText(/Cost|Type/)
  const b2 = (await page.getByTestId('tooltip').boundingBox())!
  expect(b2.y + b2.height).toBeLessThanOrEqual(800)
  await page.screenshot({ path: 'screenshots/m5-skill-tooltip-menu.png' })
  expect(errors).toEqual([])
})

test('m5 hide UI collapses every box and restores the exact layout', async ({ page }) => {
  test.setTimeout(150_000)
  const errors = captureErrors(page)
  await page.goto('./?test=1&seats=human,bot&seed=m5-hide&speed=instant&matchup=founders')
  await expect(page.getByTestId('game-screen')).toBeVisible({ timeout: 30_000 })
  await page.evaluate(() => (window as unknown as G).__game.setSpeed(0))
  expect(await driveUntil(page, /^turn\.activate$/, 90_000)).toBe(true)
  await page.locator('[data-testid^="unit-chip-"]').first().click()
  await page.mouse.move(640, 790)
  await page.waitForTimeout(600)

  const boxes = () => page.evaluate(() => ['rail-left', 'rail-right', 'interaction-prompt', 'cams', 'hud-topbar']
    .map((t) => { const r = document.querySelector(`[data-testid="${t}"]`)?.getBoundingClientRect(); return r ? [t, Math.round(r.x), Math.round(r.y), Math.round(r.width), Math.round(r.height)] : [t, null] }))
  const before = await boxes()

  // one panel minimises to a tab and comes back
  await page.getByTestId('min-feed').click()
  await expect(page.getByTestId('restore-feed')).toBeVisible()
  await page.getByTestId('restore-feed').click()
  await expect(page.getByTestId('event-feed')).toBeVisible()

  await page.keyboard.press('h')
  await expect(page.getByTestId('rail-left')).toHaveCount(0)
  await expect(page.getByTestId('rail-right')).toHaveCount(0)
  await expect(page.getByTestId('ix-your-move')).toBeVisible()
  await expect(page.getByTestId('pass-button')).toBeVisible()
  await page.waitForTimeout(300)
  await page.screenshot({ path: 'screenshots/m5-ui-hidden.png' })

  await page.keyboard.press('h')
  await expect(page.getByTestId('rail-left')).toBeVisible()
  await page.waitForTimeout(300)
  expect(await boxes()).toEqual(before)
  await page.screenshot({ path: 'screenshots/m5-ui-restored.png' })
  expect(errors).toEqual([])
})
