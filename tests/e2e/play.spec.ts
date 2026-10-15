// M3 playable slice: a full human-vs-bot game from the start screen, and one bot-vs-bot game per starter pairing.
import { expect, test } from '@playwright/test'
import { captureErrors, playToEnd } from './helpers'

test('start screen -> Terran v Zerg vs bot -> briefing -> full game -> game over with a result', async ({ page }) => {
  test.setTimeout(420_000)
  const errors = captureErrors(page)
  await page.setViewportSize({ width: 1280, height: 800 })
  await page.goto('./?test=1&menu=1&speed=fast')
  await expect(page.getByTestId('start-screen')).toBeVisible()
  await expect(page.getByTestId('fan-notice')).toContainText('not affiliated with Archon Studio or Blizzard Entertainment')
  await page.getByTestId('race-terran').click()
  await page.getByTestId('foe-zerg').click()
  await page.getByTestId('mode-bot').click()
  await page.getByTestId('seed-input').fill('e2e-founders')
  await page.getByTestId('start-button').click()

  // The briefing tells the player what the game is about before anything else.
  await expect(page.getByTestId('briefing')).toBeVisible({ timeout: 30_000 })
  await expect(page.getByTestId('briefing-mission')).not.toHaveText('')
  await expect(page.getByTestId('briefing-scoring').locator('li').first()).toBeVisible()
  await expect(page.getByTestId('briefing-map')).toBeVisible()
  await expect(page.getByTestId('briefing-pool-table')).toBeVisible()
  await page.getByTestId('briefing-close').click()
  await expect(page.getByTestId('briefing')).toHaveCount(0)

  const launch = await page.evaluate(() => (window as unknown as { __game: { launch(): { matchup: string } | null } }).__game.launch())
  expect(launch?.matchup).toBe('tvz')
  await expect(page.getByTestId('objective-tracker')).toBeVisible()
  await expect(page.getByTestId('supply-hud')).toBeVisible()

  const answers = await playToEnd(page, ['A'], 380_000)
  expect(answers).toBeGreaterThan(5)
  await expect(page.getByTestId('game-over')).toBeVisible({ timeout: 30_000 })
  await expect(page.getByTestId('result-title')).toHaveText(/wins$|^A draw$/)
  await expect(page.getByTestId('vp-breakdown')).toBeVisible()
  const result = await page.evaluate(() => (window as unknown as { __game: { getState(): { result: { kind: string; vp: Record<string, number> } } } }).__game.getState().result)
  expect(Object.keys(result.vp).sort()).toEqual(['A', 'B'])
  expect(errors).toEqual([])
})

for (const matchup of ['tvz', 'tvp', 'zvp'] as const) {
  test(`bot vs bot ${matchup} reaches game over without console errors`, async ({ page }) => {
    test.setTimeout(300_000)
    const errors = captureErrors(page)
    await page.goto(`./?test=1&seats=bot,bot&matchup=${matchup}&seed=e2e-${matchup}&speed=instant`)
    await expect(page.getByTestId('game-screen')).toBeVisible()
    await playToEnd(page, [], 280_000)
    await expect(page.getByTestId('game-over')).toBeVisible({ timeout: 30_000 })
    const factions = await page.evaluate(() => {
      const s = (window as unknown as { __game: { getState(): { seats: Record<string, { faction: string }> } } }).__game.getState()
      return Object.values(s.seats).map((x) => x.faction).sort()
    })
    expect(factions.length).toBe(2)
    expect(errors).toEqual([])
  })
}
