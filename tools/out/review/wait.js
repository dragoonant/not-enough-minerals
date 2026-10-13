const t0 = Date.now()
for (let i = 0; i < 240; i++) { const s = await p.evaluate(() => [window.__game.pending()?.seat, window.__game.idle()]); if ((s[0] === 'A' || s[0] === 'all' || s[0] == null) && s[1]) break; await p.waitForTimeout(500) }
log('waited ms', Date.now() - t0)
log(await p.evaluate(() => { const pe = window.__game.pending(); return pe ? JSON.stringify({id: pe.id, kind: pe.kind, seat: pe.seat, ctx: pe.context}).slice(0,300) : 'no pending' }))
for (const id of ['hud-topbar','interaction-prompt']) log(id, '=>', await txt(id))
