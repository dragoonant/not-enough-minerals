import { loadBundle } from '../../../sim-core'
const b = loadBundle()
const recs: any = b.records
const abil: any[] = []
const kws: Record<string, string[]> = {}
const addW = (w: any, who: string) => { for (const k of w.keywords ?? []) (kws[k.kw] ??= []).push(who + '/' + w.id) ; if (w.template) (kws['TEMPLATE:'+w.template] ??= []).push(who+'/'+w.id); if (w.requiresStatus) (kws['REQ:'+w.requiresStatus] ??= []).push(who+'/'+w.id); if (typeof w.roa==='string') (kws['ROA:'+w.roa] ??= []).push(who+'/'+w.id); if (w.sDice && typeof w.sDice==='string') (kws['SD:'+w.sDice]??=[]).push(who+'/'+w.id)}
for (const u of recs.units) { for (const w of u.weapons ?? []) addW(w, u.id); for (const a of u.abilities ?? []) abil.push({ owner: 'unit:' + u.id, a }); for (const up of u.upgrades ?? []) { if (up.ability) abil.push({ owner: 'upg:' + u.id, a: up.ability }); if (up.weapon) addW(up.weapon, u.id + '+' + up.id) } }
for (const c of recs.cards) for (const a of c.abilities ?? []) abil.push({ owner: 'card:' + c.id, a })
const ops: Record<string, string[]> = {}, evs: Record<string, string[]> = {}, conds: Record<string, string[]> = {}, tk: Record<string, string[]> = {}, codes: Record<string, string[]> = {}
const gk: Record<string,string[]>={}
const walkCond = (c: any, who: string) => { if (c) for (const k of Object.keys(c)) (conds[k] ??= []).push(who) }
const walkEff = (e: any, who: string) => { (ops[e.op] ??= []).push(who); walkCond(e.when, who); if (e.op === 'code') (codes[e.code] ??= []).push(who); if (e.at) (evs['at:' + e.at.event] ??= []).push(who); if (e.op==='grantKeyword'||e.op==='denyKeyword') (gk[e.kw?.kw ?? e.kw] ??= []).push(who) }
for (const { owner, a } of abil) {
  const who = owner + '>' + a.id + '(' + a.type + ',' + a.phase + (a.cost ? ',' + a.cost.res + a.cost.n : '') + ')'
  if (a.trigger) { (evs[a.trigger.event] ??= []).push(who); walkCond(a.trigger.filter, who) }
  walkCond(a.requires, who); if (a.target) { (tk[a.target.kind] ??= []).push(who); walkCond(a.target.filter, who) }
  for (const e of a.effects ?? []) walkEff(e, who)
  for (const o of a.options ?? []) for (const e of o.effects ?? []) walkEff(e, who + '/' + o.id)
  if (a.requires?.code) (codes['cond:' + a.requires.code] ??= []).push(who)
}
console.log('n abilities', abil.length)
const p = (n: string, o: any) => { console.log('==', n); for (const [k, v] of Object.entries(o)) console.log(' ', k, (v as string[]).length, (v as string[]).slice(0, 40).join(' | ')) }
p('weaponKw', kws); p('grantedKw', gk); p('ops', ops); p('events', evs); p('conds', conds); p('targets', tk); p('codes', codes)
const allKw = new Set<string>(); for (const k of (recs as any).keywords ?? []) allKw.add(k.id)
