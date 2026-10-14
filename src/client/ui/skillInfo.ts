// What a skill does, in plain words, for the shared Tooltip (spec 50 s4). One builder for every place the screen names a
// unit's skill: abilities (active / passive / reaction, on units, upgrades and cards), upgrades, weapon keywords, weapons,
// unit statuses and faction resources. Everything is read from the data bundle; no rules number is computed here.
import type {
  AbilityDef, CardDef, Cost, Effect, EditionBundle, KwRef, PhaseBand, Resource, TargetSpec, Trigger, UnitDef, UpgradeDef, WeaponProfile,
} from '../../data/types'
import type { GameState } from '../../engine/types'

export type SkillKind = 'ability' | 'upgrade' | 'keyword' | 'weapon' | 'status' | 'resource'
export interface SkillLine { label: string; text: string }
export interface SkillInfo {
  name: string
  kind: SkillKind
  /** Short chips for compact lists: type, phase, cost. */
  chips: string[]
  /** Labelled facts shown in the popup (Type, When, Cost, Target...). */
  lines: SkillLine[]
  /** What it does, in our own words (never empty). */
  text: string
}

// ---------------------------------------------------------------- words
const PHASES: Record<string, string> = { any: 'Any Phase', movement: 'Movement Phase', assault: 'Assault Phase', combat: 'Combat Phase', scoring: 'Scoring Phase' }
export const phaseWords = (p: PhaseBand | string | undefined): string => (p ? PHASES[p] ?? p : 'Any Phase')

export const RESOURCES: Record<Resource, { name: string; race: string }> = {
  CP: { name: 'Command Points', race: 'Terran' },
  BM: { name: 'Biomass', race: 'Zerg' },
  PE: { name: 'Psionic Energy', race: 'Protoss' },
}
const PAY_WORDS = 'Paid by exhausting Ready Tactical or Faction Cards whose values add up to the cost; any surplus is lost. Cards ready again at the end of the Round.'

export function costWords(cost: Cost | undefined, onCard: boolean): string {
  if (!cost) return onCard ? 'Exhaust this card' : 'Free'
  if (cost.n === 'X') return 'Depends on the option chosen'
  if (cost.n === 0) return onCard ? 'Exhaust this card' : 'Free'
  return `${cost.n} ${cost.res}${onCard ? ' (plus exhausting this card)' : ''}`
}
const costChip = (cost: Cost | undefined, onCard: boolean): string =>
  !cost || cost.n === 0 ? (onCard ? 'exhaust card' : 'free') : cost.n === 'X' ? `X ${cost.res}` : `${cost.n} ${cost.res}`

const EVENTS: Record<string, string> = {
  declareRangedAttack: 'declares a Ranged Attack', declareCharge: 'declares a Charge', targeted: 'is targeted',
  attackResolved: 'finishes an attack', beforeArmourRoll: 'is about to make an Armour Roll', beforeEvadeRoll: 'is about to make an Evade Roll',
  damageSuffered: 'suffers damage', debuffReceived: 'receives a Debuff', chargeDistance: 'rolls its Charge distance',
  chargeSucceeded: 'completes a Charge', activated: 'activates', actionResolved: 'finishes an action', nominatedToDeploy: 'is chosen to Deploy',
  leadingModelMoveEnd: 'ends a move with its Leading Model', usesAbility: 'uses an ability', modelsRemoved: 'loses models',
  loseHidden: 'loses HIDDEN', arrived: 'arrives from Reserves', placeResolved: 'is placed by a PLACE effect',
}
const WHO: Record<string, string> = { self: 'this unit', friendly: 'a friendly unit', otherFriendly: 'another friendly unit', enemy: 'an enemy unit', any: 'a unit' }
const SUBJECT: Record<string, string> = { self: 'at this unit', friendly: 'at a friendly unit', otherFriendly: 'at another friendly unit', enemy: 'at an enemy unit' }

export function triggerWords(t: Trigger | undefined): string {
  if (!t) return 'its trigger happens'
  if (t.event === 'startOfRound') return 'the Round starts'
  if (t.event === 'endOfRound') return 'the Round ends'
  if (t.event === 'endOfPhase') return `the ${t.phase ? phaseWords(t.phase) : 'Phase'} ends`
  const who = WHO[t.who ?? (t.subject ? 'any' : 'self')] ?? 'a unit'
  const bits = [`${who} ${EVENTS[t.event] ?? t.event.replace(/([A-Z])/g, ' $1').toLowerCase()}`]
  if (t.attack === 'ranged') bits.push('with a Ranged Attack')
  else if (t.attack === 'closeCombat') bits.push('in Close Combat')
  if (t.subject) bits.push(SUBJECT[t.subject] ?? '')
  if (t.within !== undefined) bits.push(`within ${t.within}" of this unit`)
  if (t.phase) bits.push(`in the ${phaseWords(t.phase)}`)
  return bits.filter(Boolean).join(' ')
}

const TARGETS: Record<TargetSpec['kind'], string> = {
  self: 'This unit', activeUnit: 'The activated unit', friendlyUnit: 'A friendly unit', otherFriendlyUnit: 'Another friendly unit',
  enemyUnit: 'An enemy unit', anyUnit: 'Any unit', point: 'A spot on the table', tableEdge: 'A table edge',
}
export function targetWords(t: TargetSpec | undefined): string | null {
  if (!t) return null
  const bits = [TARGETS[t.kind] ?? t.kind]
  if (t.range !== undefined) bits.push(`within ${t.range}"`)
  const unitKind = t.kind !== 'point' && t.kind !== 'tableEdge' && t.kind !== 'self'
  if (unitKind && t.range !== undefined) bits.push(t.los === false ? '(no line of sight needed)' : 'in line of sight')
  if (t.unoccupied) bits.push('(empty space only)')
  return bits.join(' ')
}

const TYPE_CHIP: Record<string, string> = { active: 'Active', passive: 'Passive', reaction: 'Reaction' }
function typeWords(a: AbilityDef): string {
  if (a.type === 'active') {
    const when = a.insteadOfAction ? 'Use it instead of this unit\'s action when it activates' : 'Use it when this unit activates (just before or just after its action)'
    const limit = a.limit === 'oncePerGame' ? 'once per Game' : a.repeatable ? 'as often as you can pay (REPEATABLE)' : 'once per Round'
    return `Active: ${when}, ${limit}.${a.endsActivation ? ' Using it ends the Activation.' : ''}`
  }
  if (a.type === 'passive') return a.trigger ? `Passive: happens on its own when ${triggerWords(a.trigger)}.` : 'Passive: always on while the unit is on the table. Nothing to do.'
  const limit = a.limit === 'oncePerGame' ? 'once per Game' : a.repeatable ? 'more than once per Round (REPEATABLE)' : 'once per Round'
  return `Reaction: you may use it when ${triggerWords(a.trigger)}, ${limit}. Each player gets one Reaction per Activation.`
}

// ---------------------------------------------------------------- effects -> plain English (fallback when there is no text)
const CHAR: Record<string, string> = { speed: 'Speed', armour: 'Armour', evade: 'Evade', hp: 'HP', size: 'Size', shield: 'Shield', supply: 'Supply', roa: 'RoA', hit: 'Hit', range: 'Range', dmg: 'Damage' }
const num = (v: unknown): string => (typeof v === 'number' ? String(v) : typeof v === 'string' ? v : 'X')
const kwName = (b: EditionBundle | null, kw: unknown): string => {
  const id = typeof kw === 'string' ? kw : (kw as KwRef | undefined)?.kw
  if (!id) return 'a keyword'
  return b?.singletons.keywords?.keywords.find((k) => k.id === id)?.name ?? id.replace(/_/g, ' ')
}
const statusName = (s: unknown): string => (typeof s === 'string' ? s.replace(/_/g, ' ') : 'a status')
function opWords(e: Effect, b: EditionBundle | null): string {
  const ch = CHAR[e['char'] as string] ?? 'a characteristic'
  switch (e.op) {
    case 'grantKeyword': return `gains ${kwName(b, e['kw'])}`
    case 'denyKeyword': return `loses ${kwName(b, e['kw'])}`
    case 'buff': return `+${num(e['x'])} ${ch}`
    case 'debuff': return `-${num(e['x'])} ${ch}`
    case 'modify': return `changes ${ch}`
    case 'setChar': return `sets ${ch} to ${num(e['x'] ?? e['value'])}`
    case 'rollMod': return 'changes a roll'
    case 'weaponMod': return 'changes a weapon'
    case 'status': return `gains ${statusName(e['status'])}`
    case 'denyStatus': return `cannot gain ${statusName(e['status'])}`
    case 'cleanse': return 'removes effects'
    case 'heal': return 'heals damage'
    case 'nonLethal': return 'deals non-lethal damage'
    case 'hits': return `deals ${num(e['x'])} hits`
    case 'impact': case 'impactBonus': return 'adds IMPACT'
    case 'damageReduce': return 'reduces damage taken'
    case 'damageCap': return 'caps damage taken'
    case 'removeDice': return 'removes dice from a roll'
    case 'canEvade': return 'may make an Evade Roll'
    case 'place': return 'is placed somewhere else'
    case 'move': return 'makes a move'
    case 'charge': case 'chargeAgain': return 'may Charge'
    case 'summon': return 'puts a new unit on the table'
    case 'morph': return 'morphs into another unit'
    case 'respawn': return 'brings back lost models'
    case 'setToken': return 'sets a token on the table'
    case 'aura': return 'gives an effect to units nearby'
    case 'detection': return 'can detect hidden units'
    case 'altEntry': return 'may arrive another way'
    case 'returnToReserves': return 'returns to Reserves'
    case 'removeSelf': return 'is removed'
    case 'removeToken': return 'removes a token'
    case 'activation': return 'changes its Activation'
    case 'ignoreDisengage': return 'ignores Disengage limits'
    case 'costMod': return 'changes a cost'
    case 'supplyOverride': return 'changes its Supply'
    case 'coherency': return 'changes coherency distance'
    case 'moveThrough': return 'moves through other models'
    case 'targetRestriction': return 'limits what can be targeted'
    case 'abilityMod': return 'improves another ability'
    case 'gainVP': return `scores ${num(e['n'] ?? e['x'])} VP`
    default: return 'has a special effect'
  }
}
/** A readable sentence from an effect list, for abilities that carry no text. */
export function effectsSentence(effects: readonly Effect[], b: EditionBundle | null): string {
  if (!effects.length) return 'No effect is listed for this ability.'
  const parts = [...new Set(effects.map((e) => opWords(e, b)))]
  const s = parts.join(', then ')
  return `The affected unit ${s}.`
}

// ---------------------------------------------------------------- builders
export function abilityInfo(a: AbilityDef, b: EditionBundle | null, opts: { cardName?: string } = {}): SkillInfo {
  const onCard = !!opts.cardName
  const lines: SkillLine[] = [{ label: 'Type', text: typeWords(a) }, { label: 'When', text: phaseWords(a.phase) }]
  if (a.type !== 'passive' || a.cost) {
    const cost = costWords(a.cost, onCard)
    const res = a.cost && a.cost.n !== 0 ? RESOURCES[a.cost.res] : undefined
    lines.push({ label: 'Cost', text: res ? `${cost}. ${a.cost!.res} = ${res.name} (${res.race}).` : cost })
  }
  const tgt = targetWords(a.target)
  if (tgt) lines.push({ label: 'Target', text: tgt })
  if (onCard) lines.push({ label: 'From', text: opts.cardName! })
  const own = a.text?.trim()
  let text = own || effectsSentence(a.effects, b)
  if (a.options?.length) text += ` Options: ${a.options.map((o) => `${o.text || o.id}${o.cost ? ` (${costWords(o.cost, false)})` : ''}`).join('; ')}.`
  return { name: a.name, kind: 'ability', chips: [TYPE_CHIP[a.type] ?? a.type, a.phase === 'any' ? 'Any Phase' : phaseWords(a.phase).replace(' Phase', ''), ...(a.type !== 'passive' || a.cost ? [costChip(a.cost, onCard)] : [])], lines, text }
}

export function weaponLine(w: WeaponProfile): string {
  return `Range ${w.range === 'E' ? 'Engaged' : `${w.range}"`}, RoA ${w.roa}, Hit ${w.hit}+, Surge ${w.sDice ?? '-'}, Dmg ${w.dmg}`
}

export function upgradeInfo(u: UpgradeDef, def: UnitDef | null, b: EditionBundle | null): SkillInfo {
  const lines: SkillLine[] = [{ label: 'Kind', text: 'Upgrade, bought when the army is mustered.' }, { label: 'When', text: phaseWords(u.phase) }]
  if (u.replaces) lines.push({ label: 'Replaces', text: def?.weapons.find((w) => w.id === u.replaces)?.name ?? u.replaces })
  if (u.specialist) lines.push({ label: 'Specialist', text: 'Only one model in the unit takes it.' })
  const bits: string[] = []
  if (u.weapon) {
    bits.push(`${u.replaces ? 'Swaps in' : 'Adds'} the ${u.weapon.name} (${weaponLine(u.weapon)}${u.weapon.keywords.length ? `; ${u.weapon.keywords.map((k) => kwName(b, k.kw)).join(', ')}` : ''}).`)
  }
  if (u.ability) {
    const ai = abilityInfo(u.ability, b)
    lines.push({ label: 'Grants', text: `${u.ability.name}: ${ai.lines[0]!.text}` })
    const c = ai.lines.find((l) => l.label === 'Cost')
    if (c) lines.push(c)
    bits.push(ai.text)
  }
  const text = bits.join(' ') || 'Improves the unit.'
  return { name: u.name, kind: 'upgrade', chips: ['Upgrade', ...(u.specialist ? ['Specialist'] : [])], lines, text }
}

const KW_KIND: Record<string, string> = { weapon: 'Weapon keyword', effect: 'Effect keyword', defensive: 'Defensive keyword', status: 'Status', ability: 'Ability keyword', term: 'Rules term' }
export function keywordInfo(kw: KwRef | string, b: EditionBundle | null, label?: string): SkillInfo {
  const id = typeof kw === 'string' ? kw : kw.kw
  const def = b?.singletons.keywords?.keywords.find((k) => k.id === id)
  const name = def?.name ?? id.replace(/_/g, ' ')
  const lines: SkillLine[] = [{ label: 'Kind', text: KW_KIND[def?.kind ?? ''] ?? 'Keyword' }]
  if (typeof kw !== 'string' && kw.x !== undefined) lines.push({ label: 'Value', text: `X = ${kw.x}` })
  return { name: label ?? name, kind: 'keyword', chips: [], lines, text: def?.text?.trim() || `${name}: a rules keyword.` }
}

export function weaponInfo(w: WeaponProfile, b: EditionBundle | null): SkillInfo {
  const lines: SkillLine[] = [
    { label: 'Profile', text: weaponLine(w) },
    { label: 'When', text: w.phase === 'assault' ? 'Assault Phase (Ranged Attacks)' : 'Combat Phase' },
  ]
  if (w.surgeTypes.length) lines.push({ label: 'Surge vs', text: w.surgeTypes.join(', ') })
  if (w.requiresStatus) lines.push({ label: 'Needs', text: statusName(w.requiresStatus) })
  const kws = w.keywords.map((k) => `${kwName(b, k.kw)}${k.x !== undefined ? ` ${k.x}` : ''}: ${keywordInfo(k, b).text}`)
  return { name: w.name, kind: 'weapon', chips: [], lines, text: kws.length ? kws.join(' ') : 'No special keywords.' }
}

const STATUS_FIXED: Record<string, string> = {
  'Activated this Phase': 'This unit has already acted in this Phase. It can act again in the next Phase.',
  'Out of coherency': 'Some models are not within 3" of the Leading Model. Until its next repositioning action the unit cannot contest or control Mission Markers.',
}
export function statusInfo(word: string, b: EditionBundle | null): SkillInfo {
  const pretty = (s: string): string => s.toLowerCase().replace(/_/g, ' ').replace(/^./, (c) => c.toUpperCase())
  const kws = b?.singletons.keywords?.keywords ?? []
  const fixed = STATUS_FIXED[word]
  if (fixed) return { name: word, kind: 'status', chips: [], lines: [], text: fixed }
  if (/^Activated \(/.test(word)) return { name: word, kind: 'status', chips: [], lines: [], text: 'This unit has an Activation Marker from that Phase.' }
  const bd = /^(Buff|Debuff) (\w+)(?: (\S+))?$/.exec(word)
  if (bd) {
    const k = kws.find((x) => x.id === bd[1]!.toUpperCase())
    const val = bd[3] ? `${bd[1] === 'Buff' ? '+' : '-'}${bd[3]} ` : ''
    return { name: word, kind: 'status', chips: [], lines: [{ label: 'Change', text: `${val}${CHAR[bd[2]!] ?? bd[2]}` }], text: k?.text ?? 'A temporary change to a characteristic, usually until the end of the Round.' }
  }
  const k = kws.find((x) => pretty(x.id) === word || x.name.toLowerCase() === word.toLowerCase())
  return { name: word, kind: 'status', chips: [], lines: [], text: k?.text ?? 'A condition this unit is under right now.' }
}

export function resourceInfo(res: Resource): SkillInfo {
  const r = RESOURCES[res]
  return { name: `${res}: ${r.name}`, kind: 'resource', chips: [], lines: [{ label: 'Race', text: r.race }], text: `The ${r.race} resource for abilities with a cost. ${PAY_WORDS}` }
}

// ---------------------------------------------------------------- lookups
const baseCard = (id: string): string => id.replace(/#\d+$/, '')
export const cardRecord = (b: EditionBundle | null, id: string): CardDef | undefined => b?.records.cards.find((c) => c.id === baseCard(id))
const unitAbilities = (u: UnitDef): AbilityDef[] => [...u.abilities, ...u.upgrades.flatMap((x) => (x.ability ? [x.ability] : []))]

/** The ability an engine option or event names: its holder (a unit id or a card id) first, then any record with that id. */
export function findAbility(b: EditionBundle | null, state: GameState | null, abilityId: string, source?: string | null): { ability: AbilityDef; cardName?: string } | null {
  if (!b) return null
  const unit = source ? state?.units[source] : undefined
  if (unit) {
    const def = b.records.units.find((u) => u.id === unit.profileId)
    const a = def && unitAbilities(def).find((x) => x.id === abilityId)
    if (a) return { ability: a }
  }
  if (source) {
    const c = cardRecord(b, source)
    const a = c?.abilities.find((x) => x.id === abilityId)
    if (c && a) return { ability: a, cardName: c.name }
  }
  for (const u of b.records.units) { const a = unitAbilities(u).find((x) => x.id === abilityId); if (a) return { ability: a } }
  for (const c of b.records.cards) { const a = c.abilities.find((x) => x.id === abilityId); if (a) return { ability: a, cardName: c.name } }
  return null
}

/** Skill info for an engine option that uses an ability (action carries abilityId and source), else null. */
export function optionSkill(b: EditionBundle | null, state: GameState | null, action: Record<string, unknown>): SkillInfo | null {
  const id = action['abilityId']
  if (typeof id !== 'string') return null
  const hit = findAbility(b, state, id, typeof action['source'] === 'string' ? action['source'] : null)
  return hit ? abilityInfo(hit.ability, b, { cardName: hit.cardName }) : null
}

/** "Exhaust barracks#1, academy" -> "Exhaust Barracks, Academy". */
export function cardListWords(b: EditionBundle | null, text: string): string {
  return text.replace(/[a-z0-9-]+(?:#\d+)?/g, (m) => cardRecord(b, m)?.name ?? m)
}
