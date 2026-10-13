const UNIT = globalThis.__unit
await p.click(`[data-testid=interaction-prompt] button:has-text("${UNIT}")`); await p.waitForTimeout(600)
await p.click('[data-testid=action-menu] button:has-text("Deploy")'); await p.waitForTimeout(800)
for (let k = 0; k < 6; k++) {
  const kind = await p.evaluate(() => window.__game.pending()?.kind)
  log('kind', kind)
  if (kind === 'ability.window') { await p.click('[data-testid=opt-done]'); }
  else if (kind === 'deploy.entry' || (await p.locator('[data-testid=interaction-prompt] button:has-text("Entry Edge 1")').count())) { await p.click('[data-testid=interaction-prompt] button:has-text("Entry Edge 1")') }
  else if (kind === 'deploy.path') { await p.click('[data-testid=path-suggested]'); await p.waitForTimeout(500); log(await txt('path-status')); await p.keyboard.press('Enter') }
  else if (kind === 'ability.target') { await p.click('[data-testid=interaction-prompt] button:has-text("Skip")') }
  else break
  await p.waitForTimeout(900)
}
