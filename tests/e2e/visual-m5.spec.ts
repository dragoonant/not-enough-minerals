// M5 visuals (screenshots/m5-*.png at 1280x800): each board theme with its fitted terrain GLBs, a terrain close-up with
// figures, and battlefield effects caught mid-flight (firefight, arrival, death). The effects are real: the human seat is
// driven through window.__game at instant speed, slowed to normal for the trigger action, and window.__vfx.autoHold freezes
// the particle simulation a few frames after the cue so the frame is repeatable on the software renderer.
import { expect, test, type Page } from '@playwright/test'
import { captureErrors } from './helpers'

const shot = (page: Page, name: string) => page.screenshot({ path: `screenshots/m5-${name}.png` })
const camera = (page: Page, label: string) => page.getByRole('button', { name: label, exact: true }).click()
/** Panels that can sit over the spot where an effect plays; effect shots hide them (the HUD is covered by other shots). */
const hidePrompt = (page: Page) => page.addStyleTag({
  content: ['interaction-prompt', 'dice-tray', 'hud-banner', 'hud-thinking'].map((t) => `[data-testid="${t}"]`).join(',') + '{visibility:hidden !important}',
})

type W = {
  __game: { getState(): { phase: string; pending: { seat: string } } | null; idle(): boolean; legalActions(): { type: string }[]; submit(a: unknown): unknown; setSpeed(s: number): void; pauseBots(p?: boolean): void }
  __vfx?: { times: Record<string, number>; autoHold: { kind: string; steps: number } | null; hold(on: boolean): void; engine: { liveParticles: number } }
  __terrain?: Record<string, string | null>
}

/** Every terrain piece that has a model shows it (no piece still loading). Returns the number of GLB pieces. */
async function terrainReady(page: Page): Promise<number> {
  await expect.poll(async () => page.evaluate(() => {
    const t = (window as unknown as W).__terrain
    if (!t || !Object.keys(t).length) return 'none'
    return Object.values(t).some((v) => v === 'loading') ? 'loading' : 'ready'
  }), { timeout: 60_000 }).toBe('ready')
  return page.evaluate(() => Object.values((window as unknown as W).__terrain ?? {}).filter((v) => v && v !== 'loading').length)
}

/**
 * Drives seat A (human) against the bot at instant speed until an action matching `trigger` is legal, then plays it at
 * normal speed with an auto-hold on the effect cue `kind`. Returns true once a cue of that kind froze the effect.
 */
async function catchEffect(page: Page, trigger: RegExp, kind: string, steps: number, budgetMs: number): Promise<boolean> {
  await page.evaluate(() => (window as unknown as W).__game.setSpeed(0))
  const t0 = Date.now()
  let seed = 23
  while (Date.now() - t0 < budgetMs) {
    seed = (seed * 48271) % 2147483647
    const r = await page.evaluate(({ roll, src }) => {
      const g = (window as unknown as W).__game, s = g.getState()
      if (!s) return { wait: true }
      if (s.phase === 'over') return { over: true }
      if (!g.idle() || s.pending.seat !== 'A') return { wait: true }
      const legal = g.legalActions()
      const hot = legal.filter((a) => new RegExp(src).test(a.type) && !JSON.stringify(a).includes('"done":true'))
      if (hot.length) return { hot: hot[roll % hot.length] }
      const fight = legal.filter((a) => /^(shoot|charge|melee|deploy)\./.test(a.type))
      const acting = legal.filter((a) => a.type !== 'turn.pass')
      const pool = fight.length && roll % 4 ? fight : acting.length ? acting : legal
      g.submit(pool[roll % pool.length])
      return { did: true }
    }, { roll: seed, src: trigger.source })
    if (r.over) return false
    if (r.hot) {
      const before = await page.evaluate((k) => (window as unknown as W).__vfx?.times[k] ?? 0, kind)
      await page.evaluate(({ k, n }) => { const w = window as unknown as W; w.__game.setSpeed(1); w.__vfx!.autoHold = { kind: k, steps: n } }, { k: kind, n: steps })
      await page.waitForTimeout(300)
      await page.evaluate((a) => (window as unknown as W).__game.submit(a), r.hot)
      const fired = await expect.poll(async () => page.evaluate((k) => (window as unknown as W).__vfx?.times[k] ?? 0, kind), { timeout: 8000 })
        .not.toBe(before).then(() => true, () => false)
      if (fired) { await page.waitForTimeout(900); return true }
      await page.evaluate(() => { const w = window as unknown as W; w.__vfx!.autoHold = null; w.__vfx!.hold(false); w.__game.setSpeed(0) })
    }
    await page.waitForTimeout(r.did ? 15 : 40)
  }
  return false
}

test.use({ viewport: { width: 1280, height: 800 } })
// One worker runs these in order (software WebGL is CPU-bound: in parallel they starve the timed full-game tests).
test.describe.configure({ mode: 'default' })

for (const theme of ['temple', 'badlands', 'ash', 'ice'] as const) {
  test(`m5 board theme ${theme} with fitted terrain`, async ({ page }) => {
    test.setTimeout(150_000)
    const errors = captureErrors(page)
    await page.goto(`./?test=1&seats=bot,bot&seed=m5-${theme}&speed=fast&theme=${theme}`)
    await expect(page.getByTestId('game-screen')).toBeVisible({ timeout: 30_000 })
    expect(await terrainReady(page)).toBeGreaterThan(4)
    await page.waitForTimeout(6000)
    await page.evaluate(() => (window as unknown as W).__game.pauseBots(true))
    await camera(page, 'Overview')
    await page.waitForTimeout(1500)
    await shot(page, `theme-${theme}`)
    expect(errors).toEqual([])
  })
}

test('m5 terrain close-up with figures', async ({ page }) => {
  test.setTimeout(150_000)
  await page.goto('./?test=1&seats=bot,bot&seed=t1&speed=fast&theme=temple')
  await expect(page.getByTestId('game-screen')).toBeVisible({ timeout: 30_000 })
  await terrainReady(page)
  await page.waitForTimeout(9000)
  await page.evaluate(() => (window as unknown as W).__game.pauseBots(true))
  await camera(page, 'Near seat')
  await page.waitForTimeout(1500)
  await shot(page, 'terrain-closeup')
})

test('m5 firefight mid-effects', async ({ page }) => {
  test.setTimeout(300_000)
  await page.goto('./?test=1&seats=human,bot&seed=m5-fire&speed=normal&matchup=tvz&theme=badlands')
  await expect(page.getByTestId('game-screen')).toBeVisible({ timeout: 30_000 })
  await terrainReady(page)
  await camera(page, 'Near seat')
  expect(await catchEffect(page, /^shoot\.batch$/, 'attack', 14, 240_000)).toBe(true)
  expect(await page.evaluate(() => (window as unknown as W).__vfx!.engine.liveParticles)).toBeGreaterThan(10)
  await shot(page, 'firefight')
})

test('m5 arrival effect', async ({ page }) => {
  test.setTimeout(300_000)
  await page.goto('./?test=1&seats=human,bot&seed=m5-arr&speed=normal&matchup=tvz&theme=ice')
  await expect(page.getByTestId('game-screen')).toBeVisible({ timeout: 30_000 })
  await terrainReady(page)
  await camera(page, 'Overview')
  expect(await catchEffect(page, /^deploy\.path$/, 'arrival', 10, 240_000)).toBe(true)
  await hidePrompt(page)
  await page.waitForTimeout(300)
  await shot(page, 'arrival')
})

test('m5 death effect', async ({ page }) => {
  test.setTimeout(300_000)
  await page.goto('./?test=1&seats=human,bot&seed=m5-kill&speed=normal&matchup=tvz&theme=temple')
  await expect(page.getByTestId('game-screen')).toBeVisible({ timeout: 30_000 })
  await terrainReady(page)
  await camera(page, 'Overview')
  expect(await catchEffect(page, /^shoot\.batch$/, 'casualties', 10, 240_000)).toBe(true)
  await hidePrompt(page)
  await page.waitForTimeout(300)
  await shot(page, 'death')
})
