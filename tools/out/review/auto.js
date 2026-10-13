// human autopilot via UI clicks; globalThis.__steps limit
const seen = globalThis.__seen ??= new Set()
const maxSteps = globalThis.__steps ?? 40
const pend = () => p.evaluate(() => { const pe = window.__game.pending(); return pe ? { id: pe.id, kind: pe.kind, seat: pe.seat, ctx: pe.context } : null })
const click = async (sel) => { try { await p.click(sel, { timeout: 4000 }); return true } catch { return false } }
for (let step = 0; step < maxSteps; step++) {
  // wait for my decision and idle
  for (let i = 0; i < 400; i++) { const s = await p.evaluate(() => [window.__game.pending()?.seat, window.__game.idle(), !!document.querySelector('[data-testid=game-over]')]); if (s[2]) { log('GAME OVER'); return } if ((s[0] === (globalThis.__me ?? 'A') || s[0] === 'all') && s[1]) break; await p.waitForTimeout(250) }
  await p.waitForTimeout(300)
  const pe = await pend(); if (!pe) { log('no pending'); return }
  const title = (await txt('interaction-prompt')).split(' | ')[0]
  const key = pe.kind + '/' + title
  if (!seen.has(key)) { seen.add(key); log('NEW', key, JSON.stringify(pe.ctx).slice(0, 200)); await shot(pe.kind.replace(/\./g,'-')) }
  // make sure prompt expanded
  const collapsed = (await txt('interaction-prompt')).includes(' | + ') || (await txt('interaction-prompt')).endsWith('+')
  if (collapsed) await click('[data-testid=ix-collapse]')
  const k = pe.kind
  let ok = false
  if (k === 'ability.window' || k === 'reaction.window' || k.startsWith('reaction')) ok = await click('[data-testid=opt-done]') || await click('[data-testid=interaction-prompt] button:has-text("Done")') || await click('[data-testid=interaction-prompt] button:has-text("Skip")') || await click('[data-testid=interaction-prompt] button:has-text("No")')
  else if (k === 'turn.first' || k === 'setup.firstPlayer') ok = await click('[data-testid=interaction-prompt] button:has-text("Player 1")')
  else if (k === 'turn.activate') {
    const units = pe.ctx.units || []
    if (!units.length) { ok = await click('[data-testid=pass-button]') }
    else {
      const u = units[0]
      const btn = p.locator(`[data-testid=interaction-prompt] button:has-text("(${u})")`)
      await btn.click({ timeout: 4000 }); await p.waitForTimeout(500)
      const menu = await txt('action-menu')
      log(`  ${u} menu: ${menu}`)
      const pref = ['Ranged Attack', 'Close Combat', 'Fight', 'Deploy', 'Move', 'Run', 'Hold']
      for (const w of pref) { if (menu.includes(w)) { ok = await click(`[data-testid=action-menu] button:has-text("${w}")`); log('  ->', w); break } }
    }
  }
  else if (k === 'deploy.entry') ok = await click('[data-testid=interaction-prompt] button:has-text("Entry Edge 1")')
  else if (k === 'deploy.path' || k === 'move.path' || k === 'charge.path') { ok = await click('[data-testid=path-suggested]'); await p.waitForTimeout(600); const st = await txt('path-status'); if (st !== '(none)') log('  path', st); if ((await pend())?.id === pe.id) { await p.keyboard.press('Enter') } }
  else if (k === 'shoot.batch' || k === 'melee.batch') {
    const tb = p.locator('[data-testid^=target-]').first()
    if (await tb.count()) { await p.mouse.move(640, 300); await p.waitForTimeout(300); await tb.click({ timeout: 8000 }); await p.waitForTimeout(400); log('  odds:', (await txt('interaction-prompt')).split(' | ').slice(-4).join(' ')); await p.keyboard.press('Enter'); ok = true }
    else ok = await click('[data-testid=interaction-prompt] button:has-text("Stop")')
  }
  else if (k === 'charge.targets') { const b = p.locator('[data-testid^=target-]').first(); await p.mouse.move(640,300); await b.click(); await p.waitForTimeout(400); log('  charge odds:', await txt('odds-panel')); await p.keyboard.press('Enter'); ok = true }
  else {
    // generic: click first primary option
    const b = p.locator('[data-testid=interaction-prompt] button.ix-btn').first()
    if (await b.count()) { log('  generic click', await b.innerText()); await b.click(); ok = true }
  }
  await p.waitForTimeout(700)
  const after = await pend()
  if (after && after.id === pe.id) { log('  STUCK on', key, await txt('hud-rejection'), await txt('path-status')); await shot('stuck'); 
    // fallback via legal action from test api
    await p.evaluate(() => { const la = window.__game.legalActions(); window.__game.submit(la[la.length-1]) }); log('  (fallback submit last legal)') }
}
