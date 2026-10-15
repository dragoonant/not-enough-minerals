// M3 screenshots at 1280x800 (screenshots/m3-*.png): start, briefing, mid-game board with HUD, dice tray mid-attack,
// objective rings, figure gallery, game over. Each test also checks the thing it photographs is on screen.
import { expect, test, type Page } from '@playwright/test'
import { captureErrors, playToEnd } from './helpers'

const shot = (page: Page, name: string) => page.screenshot({ path: `screenshots/m3-${name}.png` })
type G = { __game: { getState(): { phase: string; round: number; pending: { seat: string }; markers: { onTable: boolean; controller: string | null }[] } | null; idle(): boolean; pauseBots(p?: boolean): void } }

test.use({ viewport: { width: 1280, height: 800 } })

test('m3 start screen and briefing', async ({ page }) => {
  await page.goto('./?test=1&menu=1&speed=fast')
  await expect(page.getByTestId('fan-notice')).toBeVisible()
  await page.getByTestId('race-terran').click()
  await page.getByTestId('foe-zerg').click()
  await page.waitForTimeout(400)
  await shot(page, 'start')
  await page.getByTestId('seed-input').fill('m3-shots')
  await page.getByTestId('start-button').click()
  await expect(page.getByTestId('briefing')).toBeVisible({ timeout: 30_000 })
  await page.waitForTimeout(1500)
  await shot(page, 'briefing')
})

test('m3 mid-game board with the HUD and the decision panel', async ({ page }) => {
  test.setTimeout(240_000)
  const errors = captureErrors(page)
  await page.goto('./?test=1&seats=human,bot&seed=m3-board&speed=fast&mission=frontlines-skirmish')
  await expect(page.getByTestId('game-screen')).toBeVisible()
  // Answer for the human until Round 2 starts with figures on the table, then stop on an open human decision.
  const t0 = Date.now()
  let seed = 3
  while (Date.now() - t0 < 200_000) {
    seed = (seed * 48271) % 2147483647
    const st = await page.evaluate((roll) => {
      const g = (window as unknown as G & { __game: { legalActions(): { type: string }[]; submit(a: unknown): unknown } }).__game
      const s = g.getState()
      if (!s || !g.idle() || s.pending.seat !== 'A') return 'wait'
      if (s.round >= 2) return 'stop'
      const legal = g.legalActions()
      const acting = legal.filter((a) => a.type !== 'turn.pass')
      const pool = acting.length ? acting : legal
      g.submit(pool[roll % pool.length])
      return 'did'
    }, seed)
    if (st === 'stop') break
    await page.waitForTimeout(st === 'did' ? 20 : 100)
  }
  await expect(page.getByTestId('interaction-prompt')).toBeVisible({ timeout: 20_000 })
  await page.waitForTimeout(1200)
  await shot(page, 'board')
  expect(errors).toEqual([])
})

test('m3 dice tray mid-attack', async ({ page }) => {
  test.setTimeout(300_000)
  await page.addInitScript(() => { try { localStorage.setItem('nem.dice', JSON.stringify({ mode: 'full', collapsed: false })) } catch { /* ignore */ } })
  // Hot-seat driven through window.__game, preferring attacks so a Batch is rolled early.
  await page.goto('./?test=1&seats=human,human&seed=m3-dice&speed=fast&matchup=tvz')
  await expect(page.getByTestId('game-screen')).toBeVisible()
  const working = page.getByTestId('dice-working')
  const t0 = Date.now()
  let seed = 11
  while (Date.now() - t0 < 260_000 && !(await working.isVisible())) {
    seed = (seed * 48271) % 2147483647
    const st = await page.evaluate((roll) => {
      const g = (window as unknown as G & { __game: { legalActions(): { type: string }[]; submit(a: unknown): unknown } }).__game
      const s = g.getState()
      if (!s) return 'wait'
      if (s.phase === 'over') return 'over'
      if (!g.idle()) return 'wait'
      const legal = g.legalActions()
      const fight = legal.filter((a) => /^(shoot|charge|melee|atk)\./.test(a.type))
      const acting = legal.filter((a) => a.type !== 'turn.pass')
      const pool = fight.length ? fight : acting.length ? acting : legal
      g.submit(pool[roll % pool.length])
      return 'did'
    }, seed)
    if (st === 'over') break
    await page.waitForTimeout(st === 'did' ? 30 : 60)
  }
  await expect(working).toBeVisible({ timeout: 10_000 })
  await page.waitForTimeout(1400)
  await shot(page, 'dice')
})

test('m3 figure gallery', async ({ page }) => {
  await page.goto('./?test=1&gallery&speed=instant')
  // The gallery chunk loads lazily; under four parallel workers on SwiftShader it can take longer than the 5 s default.
  await expect(page.locator('canvas')).toBeVisible({ timeout: 30_000 })
  await page.waitForTimeout(6000)
  await shot(page, 'gallery')
})

test('m3 objective rings (a held marker) and game over', async ({ page }) => {
  test.setTimeout(300_000)
  await page.goto('./?test=1&seats=bot,bot&seed=m3-over&speed=instant&matchup=zvp')
  await expect(page.getByTestId('game-screen')).toBeVisible()
  // Stop the bots the moment a marker has a controller, photograph the rings from above, then play on.
  await page.waitForFunction(() => {
    const g = (window as unknown as G).__game
    const s = g.getState()
    if (s && (s.phase === 'over' || s.markers.some((m) => m.onTable && m.controller))) { g.pauseBots(true); return true }
    return false
  }, null, { timeout: 240_000, polling: 50 })
  await page.getByTestId('cam-top').click()
  await page.waitForTimeout(2000)
  await shot(page, 'rings')
  await page.getByTestId('cam-overview').click()
  await page.evaluate(() => (window as unknown as G).__game.pauseBots(false))
  await playToEnd(page, [], 240_000)
  await expect(page.getByTestId('game-over')).toBeVisible({ timeout: 30_000 })
  await page.waitForTimeout(1500)
  await shot(page, 'gameover')
})
