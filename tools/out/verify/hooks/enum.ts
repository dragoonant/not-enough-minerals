import { loadBundle } from '../../../sim-core'
const b = loadBundle()
const recs: any = b.records
console.log(Object.keys(recs))
const abil: any[] = []
const add = (owner: string, a: any) => { if (a) abil.push({ owner, a }) }
for (const u of recs.units ?? []) { for (const a of u.abilities ?? []) add('unit:' + u.id, typeof a === 'string' ? recs.abilities?.find((x: any) => x.id === a) : a) }
for (const x of recs.abilities ?? []) add('ab', x)
for (const x of recs.upgrades ?? []) add('upg:' + x.id, x.ability)
for (const c of recs.cards ?? []) for (const a of c.abilities ?? []) add('card:' + c.id, a)
const ops: Record<string, number> = {}, evs: Record<string, number> = {}, conds: Record<string, number> = {}, tk: Record<string, number> = {}, codes: Record<string, string[]> = {}, subj: Record<string,number> = {}, durs: Record<string,number>={}
const walkCond = (c: any) => { if (c) for (const k of Object.keys(c)) conds[k] = (conds[k] ?? 0) + 1 }
const walkEff = (e: any, who: string) => { ops[e.op] = (ops[e.op] ?? 0) + 1; walkCond(e.when); if (e.op === 'code') (codes[e.code] ??= []).push(who); if (e.to) subj[JSON.stringify(e.to)] = (subj[JSON.stringify(e.to)]??0)+1; if (e.duration) durs[JSON.stringify(e.duration)] = (durs[JSON.stringify(e.duration)]??0)+1; if (e.at) evs['at:'+e.at.event]=(evs['at:'+e.at.event]??0)+1 }
const seen = new Set<string>()
for (const { owner, a } of abil) {
  if (seen.has(a.id)) continue; seen.add(a.id)
  if (a.trigger) { evs[a.trigger.event] = (evs[a.trigger.event] ?? 0) + 1; walkCond(a.trigger.filter) }
  walkCond(a.requires); if (a.target) { tk[a.target.kind] = (tk[a.target.kind] ?? 0) + 1; walkCond(a.target.filter) }
  for (const e of a.effects ?? []) walkEff(e, a.id)
  for (const o of a.options ?? []) for (const e of o.effects ?? []) walkEff(e, a.id + '/' + o.id)
  if (a.requires?.code) (codes['cond:' + a.requires.code] ??= []).push(a.id)
}
console.log('abilities', seen.size)
console.log('ops', ops); console.log('events', evs); console.log('conds', conds); console.log('targets', tk); console.log('codes', codes); console.log('subj', subj); console.log('durs', durs)
const kws: Record<string, number> = {}
for (const w of recs.weapons ?? []) for (const k of w.keywords ?? []) kws[k.kw] = (kws[k.kw] ?? 0) + 1
for (const u of recs.upgrades ?? []) for (const k of u.weapon?.keywords ?? []) kws[k.kw] = (kws[k.kw] ?? 0) + 1
console.log('weaponKw', kws)
const ukw: Record<string, number> = {}
for (const u of recs.units ?? []) for (const k of u.keywords ?? []) ukw[typeof k === 'string' ? k : k.kw] = (ukw[typeof k === 'string' ? k : k.kw] ?? 0) + 1
console.log('unitKw', ukw)
