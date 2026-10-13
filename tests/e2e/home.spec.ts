import { expect, test } from '@playwright/test'

test('app boots to the start screen with the fan notice and opens the table', async ({ page }) => {
  await page.goto('./')
  await expect(page).toHaveTitle('Not Enough Minerals - Tabletop Miniatures Game')
  await expect(page.getByRole('heading', { name: 'Not Enough Minerals' })).toBeVisible()
  await expect(page.getByTestId('fan-notice')).toContainText('not affiliated with Archon Studio or Blizzard Entertainment')
  await page.getByTestId('start-button').click()
  await expect(page.getByTestId('game-screen')).toBeVisible()
  await expect(page.locator('canvas')).toBeVisible()
  // A game started from the menu opens the briefing first.
  await expect(page.getByTestId('briefing')).toBeVisible({ timeout: 30_000 })
})

test('?test=1 exposes window.__game and a human answer from the decision panel reaches the engine', async ({ page }) => {
  await page.goto('./?test=1&seats=human,bot&seed=e2e&speed=instant')
  await expect(page.getByTestId('game-screen')).toBeVisible()
  const seats = await page.evaluate(() => (window as unknown as { __game: { getState(): { seatOrder: string[] } } }).__game.getState().seatOrder)
  expect(seats).toEqual(['A', 'B'])
  const panel = page.getByTestId('interaction-prompt')
  await expect(panel).toBeVisible({ timeout: 30_000 })
  const before = await page.evaluate(() => (window as unknown as { __game: { getState(): { log: unknown[] } } }).__game.getState().log.length)
  await panel.locator('button.ix-btn').first().click()
  await expect.poll(() => page.evaluate(() => (window as unknown as { __game: { getState(): { log: unknown[] } } }).__game.getState().log.length)).toBeGreaterThan(before)
})
