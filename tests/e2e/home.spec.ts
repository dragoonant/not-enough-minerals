import { expect, test } from '@playwright/test'

test('app boots to the start screen with the fan notice and opens the table', async ({ page }) => {
  await page.goto('./')
  await expect(page).toHaveTitle('Not Enough Minerals - Tabletop Miniatures Game')
  await expect(page.getByRole('heading', { name: 'Not Enough Minerals' })).toBeVisible()
  await expect(page.getByTestId('disclaimer')).toContainText('not affiliated with Archon Studio or Blizzard Entertainment')
  await page.getByTestId('start-button').click()
  await expect(page.getByTestId('game-screen')).toBeVisible()
  await expect(page.locator('canvas')).toBeVisible()
})

test('M0 screenshots of the start screen and the table', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 800 })
  await page.goto('./')
  await expect(page.getByTestId('start-screen')).toBeVisible()
  await page.screenshot({ path: 'screenshots/m0-start.png' })
  await page.goto('./?test=1&seats=human,bot&seed=demo&speed=instant')
  await expect(page.locator('canvas')).toBeVisible()
  await expect(page.getByTestId('model-a1')).toHaveCount(1)
  await page.waitForTimeout(2500)
  await page.screenshot({ path: 'screenshots/m0-table.png' })
})

test('?test=1 exposes window.__game and a human answer reaches the engine', async ({ page }) => {
  await page.goto('./?test=1&seats=human,bot&seed=e2e&speed=instant')
  await expect(page.getByTestId('game-screen')).toBeVisible()
  const seats = await page.evaluate(() => (window as unknown as { __game: { getState(): { seatOrder: string[] } } }).__game.getState().seatOrder)
  expect(seats).toEqual(['A', 'B'])
  await page.getByTestId('option-roll').click()
  await expect(page.getByTestId('dice-tray')).toBeVisible()
})
