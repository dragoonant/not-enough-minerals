// Data validator core (spec 20 section 8). Pure: no fs, no Vite. tools/validate-data.ts wraps it for the CLI and adds
// the IP prose guard. Every check here is listed in spec 20 s8; a new check needs a line there.
import {
  EFFECT_OPS, HOOK_AREAS, KINDS, RACES,
  type CardDef, type CostTableDef, type DeploymentDef, type EditionBundle, type EditionsFile,
  type KeywordDef, type Kind, type MissionDef, type Race, type Resource, type RulesDef, type TokenDef, type UnitDef,
} from './types'

export interface ValidationError { file: string; id: string; path: string; message: string; severity?: 'warning' }

export const ID_RE = /^[a-z0-9]+(-[a-z0-9]+)*$/
export const KW_RE = /^[A-Z][A-Z0-9]*(_[A-Z0-9]+)*$/
export const DICE_RE = /^[1-9]?D(3|6)(\+[1-9])?$/
export const ROA_TEMPLATE_RE = /^BT\+[0-9]+$/

const COMBAT_TAGS = ['armoured', 'biological', 'light', 'mechanical', 'psionic', 'ground', 'flying']
const SLOTS = ['core', 'elite', 'support', 'air', 'hero']
const PHASES = ['movement', 'assault', 'combat', 'scoring']
const BANDS = [...PHASES, 'any']
const CHARS = ['speed', 'armour', 'evade', 'hp', 'size', 'shield', 'supply', 'roa', 'hit', 'range', 'dmg']
const RESOURCES: Resource[] = ['CP', 'BM', 'PE']
export const RACE_RESOURCE: Record<Race, Resource> = { terran: 'CP', zerg: 'BM', protoss: 'PE' }
const DURATIONS = ['endOfRound', 'endOfPhase', 'endOfActivation', 'untilNextAction', 'thisAttack', 'thisRoll', 'permanent']
const TRIGGER_EVENTS = ['declareRangedAttack', 'declareCharge', 'targeted', 'attackResolved', 'beforeArmourRoll', 'beforeEvadeRoll',
  'damageSuffered', 'debuffReceived', 'chargeDistance', 'chargeSucceeded', 'activated', 'actionResolved', 'nominatedToDeploy',
  'leadingModelMoveEnd', 'usesAbility', 'startOfRound', 'endOfRound', 'endOfPhase', 'modelsRemoved']
const TARGET_KINDS = ['self', 'activeUnit', 'friendlyUnit', 'otherFriendlyUnit', 'enemyUnit', 'anyUnit', 'point', 'tableEdge']
const SCALES = ['skirmish', 'standard', 'grand-offensive']
const KW_KINDS = ['weapon', 'effect', 'defensive', 'status', 'ability', 'term']
const KW_PARAMS = ['x', 'y', 'tag', 'char', 'unit']
const SCORING_KINDS = ['supplyDestroyed', 'perControlledMarker', 'retakeBonus', 'activatedMarkerCash', 'quarters', 'markerControlled',
  'claimCarriedInZone', 'ownMarkersNotClaimed', 'code']
const DEFAULT_BASES = [25, 32, 40, 50, 80, 100, 150]
const SKIRMISH_MARKERS = [1, 2, 5]
const RULES_KEYS = ['engagementRange', 'coherency', 'contestRange', 'hiddenRange', 'zoiDepth',
  'gapClearance', 'tnClamp', 'maxRerollsPerDie', 'closeRanksMax', 'eliminationVP', 'markerDiameterMm', 'baseSizesMm', 'scales', 'factionTags']

/** Required keys per effect op (besides `op`). A new op needs an entry here, in EFFECT_OPS and in spec 20 s2.2. */
export const OP_FIELDS: Record<(typeof EFFECT_OPS)[number], string[]> = {
  grantKeyword: ['kw'], denyKeyword: ['kw'], buff: ['char', 'x'], debuff: ['char', 'x'], modify: ['char', 'delta'],
  setChar: ['char'], rollMod: ['roll', 'delta'], weaponMod: [], status: ['status', 'mode'], denyStatus: ['status'],
  cleanse: ['what'], heal: ['x'], nonLethal: ['x'], hits: ['x', 'y'], impact: ['x', 'y'], impactBonus: [],
  damageReduce: ['n'], damageCap: ['max'], removeDice: ['n'], canEvade: ['vs'], place: ['x'], move: ['kind'], charge: [],
  chargeAgain: [], summon: ['unit'], morph: ['unit', 'x'], respawn: ['x'], setToken: ['token', 'range'],
  aura: ['radius', 'centre', 'affects', 'effects'], detection: ['radius'], altEntry: ['kind'], returnToReserves: [], removeSelf: [], removeToken: ['token'],
  activation: ['mode'], ignoreDisengage: [], costMod: ['res', 'delta'], supplyOverride: ['purposes'], coherency: ['d'],
  moveThrough: ['what'], targetRestriction: ['cannotTarget'], abilityMod: ['ability', 'field'], gainVP: ['n'], code: ['code'],
}
const SUBJECTS = ['self', 'target', 'attacker', 'triggerUnit', 'tokenArea', 'allFriendly', 'allEnemy', 'engagedEnemies', 'summoned']
/** Optional keys per op. Every effect may also carry: when, duration, to, at, weapons (WeaponSel on the affected Unit),
 *  unitFilter (Condition on affected Units when `to` is allFriendly/allEnemy). Any other key is an error (typo guard). */
export const OP_OPTIONAL: Record<(typeof EFFECT_OPS)[number], string[]> = {
  grantKeyword: [], denyKeyword: [], buff: [], debuff: [], modify: [], setChar: ['value', 'min', 'max', 'unmodifiable'], rollMod: [],
  weaponMod: ['addSurgeTypes', 'sDice'], status: [], denyStatus: [], cleanse: [], heal: [], nonLethal: [],
  hits: ['token', 'radius', 'perToken'], impact: [], impactBonus: ['dicePerModel', 'hitMod'], damageReduce: [], damageCap: [],
  removeDice: ['upTo', 'pool'], canEvade: [],
  place: ['from', 'token', 'minEnemyDist', 'notInEngagement', 'allowEngage', 'optional', 'wholly'], move: ['x', 'towards', 'freeAction'],
  charge: ['dice', 'plus'], chargeAgain: ['differentTarget', 'ignoreEngaged', 'noImpact'], summon: ['anywhere', 'minEnemyDist'], morph: [],
  respawn: [], setToken: ['wholly', 'perModel', 'unoccupied'], aura: ['token', 'los'], detection: ['centre', 'token'],
  altEntry: ['supplyCapPerRound', 'filter'], returnToReserves: [], removeSelf: [], removeToken: [], activation: [], ignoreDisengage: [],
  costMod: ['floor', 'ability'], supplyOverride: ['value', 'delta', 'floor'], coherency: [], moveThrough: ['maxSize', 'noAccessPoints'],
  targetRestriction: [], abilityMod: ['value', 'delta'], gainVP: [], code: ['args'],
}
const EFFECT_BASE_KEYS = ['op', 'when', 'duration', 'to', 'at', 'weapons', 'unitFilter']
const ROLLS = ['hit', 'armour', 'evade', 'impactHit', 'charge']
const SUPPLY_PURPOSES = ['pool', 'control', 'contest', 'objectives', 'disengage', 'vp', 'all']

const isObj = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v)
const nonEmpty = (v: unknown): v is string => typeof v === 'string' && v.trim() !== ''
const isInt = (v: unknown, min = 0): v is number => typeof v === 'number' && Number.isInteger(v) && v >= min
const isTN = (v: unknown) => isInt(v, 2) && (v as number) <= 6
const str = (v: unknown) => JSON.stringify(v)

type Err = (path: string, message: string, warning?: boolean) => void

function checkSource(err: Err, v: unknown, path = 'source'): void {
  if (Array.isArray(v) && v.length > 0) v.forEach((x, i) => { if (!nonEmpty(x)) err(`${path}[${i}]`, 'must be a non-empty string') })
  else if (!nonEmpty(v)) err(path, 'is required (string or non-empty array)')
}

/** Lookup tables shared by every record check. */
interface Ctx {
  b: EditionBundle
  keywords: Map<string, KeywordDef>
  statuses: Set<string>
  hooks: Set<string>
  units: Map<string, UnitDef>
  cards: Map<string, CardDef>
  coreTokens: Set<string>
  factionTags: Set<string>
}

// ---------------------------------------------------------------- nested pieces
function checkKwRef(c: Ctx, err: Err, path: string, k: unknown): void {
  if (!isObj(k) || !nonEmpty(k.kw)) { err(path, 'keyword ref must be {kw, ...params}'); return }
  const def = c.keywords.get(k.kw)
  if (!def) { err(`${path}.kw`, `unknown keyword "${k.kw}" (add it to keywords.json)`); return }
  for (const p of KW_PARAMS) {
    const has = k[p] !== undefined
    if (has && !def.params.includes(p as never)) err(`${path}.${p}`, `${def.id} takes no "${p}" (params: ${def.params.join(', ') || 'none'})`)
    if (!has && def.params.includes(p as never)) err(`${path}.${p}`, `${def.id} needs "${p}"`)
  }
  for (const key of Object.keys(k)) if (key !== 'kw' && !KW_PARAMS.includes(key)) err(`${path}.${key}`, 'unknown keyword param')
  if (k.x !== undefined && !isInt(k.x)) err(`${path}.x`, 'must be an integer >= 0')
  if (k.y !== undefined && !isInt(k.y)) err(`${path}.y`, 'must be an integer >= 0')
  if (k.tag !== undefined && !COMBAT_TAGS.includes(k.tag as string)) err(`${path}.tag`, `unknown combat tag ${str(k.tag)}`)
  if (k.char !== undefined && !CHARS.includes(k.char as string)) err(`${path}.char`, `unknown characteristic ${str(k.char)}`)
  if (k.unit !== undefined && !c.units.has(k.unit as string)) err(`${path}.unit`, `unknown unit "${k.unit}"`)
}

function checkStatus(c: Ctx, err: Err, path: string, s: unknown): void {
  if (!nonEmpty(s) || !c.statuses.has(s)) err(path, `unknown status ${str(s)} (keywords.json kind "status")`)
}
function checkCode(c: Ctx, err: Err, path: string, code: unknown): void {
  if (!nonEmpty(code) || !c.hooks.has(code)) err(path, `hook ${str(code)} is not listed in hooks/<area>.json`)
}
function checkTags(err: Err, path: string, v: unknown): void {
  if (!Array.isArray(v)) { err(path, 'must be an array of combat tags'); return }
  v.forEach((t, i) => { if (!COMBAT_TAGS.includes(t)) err(`${path}[${i}]`, `unknown combat tag ${str(t)}`) })
}

function checkCondition(c: Ctx, err: Err, path: string, cond: unknown, owner?: Owner): void {
  if (!isObj(cond)) { err(path, 'condition must be an object'); return }
  for (const k of ['tags', 'notTags', 'targetTags'] as const) if (cond[k] !== undefined) checkTags(err, `${path}.${k}`, cond[k])
  for (const k of ['status', 'notStatus', 'targetStatus'] as const) {
    if (cond[k] === undefined) continue
    if (!Array.isArray(cond[k])) err(`${path}.${k}`, 'must be an array')
    else (cond[k] as unknown[]).forEach((s, i) => checkStatus(c, err, `${path}.${k}[${i}]`, s))
  }
  if (cond.factionTags !== undefined) (Array.isArray(cond.factionTags) ? cond.factionTags : [cond.factionTags]).forEach((t, i) => {
    if (!c.factionTags.has(t as string)) err(`${path}.factionTags[${i}]`, `unknown faction tag ${str(t)}`)
  })
  if (cond.phase !== undefined && (!Array.isArray(cond.phase) || cond.phase.some((p) => !PHASES.includes(p)))) err(`${path}.phase`, 'must be phases')
  if (cond.attack !== undefined && !['ranged', 'closeCombat'].includes(cond.attack as string)) err(`${path}.attack`, 'must be ranged | closeCombat')
  if (cond.first !== undefined && !['activation', 'round'].includes(cond.first as string)) err(`${path}.first`, 'must be activation | round')
  if (cond.code !== undefined) checkCode(c, err, `${path}.code`, cond.code)
  if (Array.isArray(cond.units)) cond.units.forEach((u, i) => { if (!c.units.has(u as string)) err(`${path}.units[${i}]`, `unknown unit "${u}"`) })
  if (owner) {
    for (const k of ['targetSelectedBy', 'attackerSelectedBy', 'fromAbility'] as const)
      if (cond[k] !== undefined && !owner.abilities.has(cond[k] as string)) err(`${path}.${k}`, `unknown ability "${cond[k]}" on this card`)
    const tw = cond.targetWithinToken
    if (isObj(tw) && !owner.tokens.has(tw.token as string) && !c.coreTokens.has(tw.token as string)) err(`${path}.targetWithinToken.token`, `unknown token "${tw.token}"`)
    if (Array.isArray(cond.weapons)) cond.weapons.forEach((w, i) => { if (!owner.weapons.has(w as string)) err(`${path}.weapons[${i}]`, `unknown weapon "${w}" on this card`) })
  }
}

/** Owner context for refs that resolve inside a unit or card (weapons, abilities, tokens). */
interface Owner { weapons: Set<string>; abilities: Set<string>; tokens: Set<string>; race: Race; isCard: boolean }

function checkEffects(c: Ctx, err: Err, path: string, effects: unknown, owner: Owner): void {
  if (!Array.isArray(effects)) { err(path, 'must be an array of effects'); return }
  effects.forEach((e, i) => checkEffect(c, err, `${path}[${i}]`, e, owner))
}

function checkEffect(c: Ctx, err: Err, path: string, e: unknown, owner: Owner): void {
  if (!isObj(e)) { err(path, 'effect must be an object'); return }
  const op = e.op as (typeof EFFECT_OPS)[number]
  if (!EFFECT_OPS.includes(op)) { err(`${path}.op`, `unknown effect op ${str(e.op)}`); return }
  for (const f of OP_FIELDS[op]) if (e[f] === undefined) err(`${path}.${f}`, `op "${op}" needs "${f}"`)
  for (const k of Object.keys(e)) if (!EFFECT_BASE_KEYS.includes(k) && !OP_FIELDS[op].includes(k) && !OP_OPTIONAL[op].includes(k))
    err(`${path}.${k}`, `op "${op}" has no field "${k}" (spec 20 s2.2)`)
  if (e.unitFilter !== undefined) checkCondition(c, err, `${path}.unitFilter`, e.unitFilter, owner)
  if (e.when !== undefined) checkCondition(c, err, `${path}.when`, e.when, owner)
  if (e.duration !== undefined && !DURATIONS.includes(e.duration as string)) err(`${path}.duration`, `unknown duration ${str(e.duration)}`)
  if (isObj(e.to) && Array.isArray(e.to.ids)) e.to.ids.forEach((w, i) => {
    if (!owner.weapons.has(w as string)) err(`${path}.to.ids[${i}]`, `unknown weapon "${w}" on this card`)
  })
  if (isObj(e.weapons) && Array.isArray(e.weapons.ids)) e.weapons.ids.forEach((w, i) => {
    if (!owner.weapons.has(w as string)) err(`${path}.weapons.ids[${i}]`, `unknown weapon "${w}" on this card`)
  })
  if (op === 'grantKeyword' && e.kw !== undefined) checkKwRef(c, err, `${path}.kw`, e.kw)
  if (op === 'denyKeyword' && (typeof e.kw !== 'string' || !c.keywords.has(e.kw))) err(`${path}.kw`, `must be a keyword id from keywords.json, got ${str(e.kw)}`)
  if ((op === 'buff' || op === 'debuff' || op === 'modify' || op === 'setChar') && e.char !== undefined && !CHARS.includes(e.char as string))
    err(`${path}.char`, `unknown characteristic ${str(e.char)}`)
  if ((op === 'buff' || op === 'debuff') && !isInt(e.x, 1)) err(`${path}.x`, 'must be an integer >= 1')
  if (op === 'rollMod' && !ROLLS.includes(e.roll as string)) err(`${path}.roll`, `must be one of ${ROLLS.join(', ')}`)
  if ((op === 'status' || op === 'denyStatus') && e.status !== undefined) checkStatus(c, err, `${path}.status`, e.status)
  if (op === 'status' && !['gain', 'lose', 'toggle', 'keepOnMove'].includes(e.mode as string)) err(`${path}.mode`, 'must be gain | lose | toggle | keepOnMove')
  if (typeof e.to === 'string' && !SUBJECTS.includes(e.to)) err(`${path}.to`, `must be one of ${SUBJECTS.join(', ')} or a weapon selector`)
  if (e.at !== undefined && (!isObj(e.at) || !TRIGGER_EVENTS.includes(e.at.event as string))) err(`${path}.at.event`, 'must be a trigger event')
  if (op === 'weaponMod') {
    if (e.addSurgeTypes === undefined && e.sDice === undefined) err(path, 'weaponMod needs addSurgeTypes and/or sDice')
    if (e.addSurgeTypes !== undefined) checkTags(err, `${path}.addSurgeTypes`, e.addSurgeTypes)
    if (e.sDice !== undefined && !DICE_RE.test(String(e.sDice))) err(`${path}.sDice`, `bad dice ${str(e.sDice)}`)
  }
  if ((op === 'summon' || op === 'morph') && e.unit !== undefined && !c.units.has(e.unit as string)) err(`${path}.unit`, `unknown unit "${e.unit}"`)
  if ((op === 'setToken' || op === 'removeToken') && e.token !== undefined && !owner.tokens.has(e.token as string) && !c.coreTokens.has(e.token as string))
    err(`${path}.token`, `unknown token "${e.token}" (declare it in this record's tokens or rules.json tokens)`)
  if (op === 'setToken' && e.range !== null && !(typeof e.range === 'number' && e.range >= 0)) err(`${path}.range`, 'must be inches >= 0, or null = anywhere')
  if (op === 'aura') {
    if (!['self', 'token', 'indicator'].includes(e.centre as string)) err(`${path}.centre`, 'must be self | token | indicator')
    if (e.affects !== undefined) {
      if (!isObj(e.affects) || !['friendly', 'enemy', 'any'].includes(e.affects.side as string)) err(`${path}.affects.side`, 'must be friendly | enemy | any')
      else checkCondition(c, err, `${path}.affects`, { ...e.affects, side: undefined }, owner)
    }
    if (e.effects !== undefined) checkEffects(c, err, `${path}.effects`, e.effects, owner)
  }
  if (op === 'costMod' && !RESOURCES.includes(e.res as Resource)) err(`${path}.res`, 'must be CP | BM | PE')
  if (op === 'supplyOverride') {
    if (!Array.isArray(e.purposes) || e.purposes.some((p) => !SUPPLY_PURPOSES.includes(p))) err(`${path}.purposes`, `must be a subset of ${SUPPLY_PURPOSES.join(', ')}`)
    if (e.value === undefined && e.delta === undefined && e.floor === undefined) err(path, 'supplyOverride needs value, delta or floor')
  }
  if (op === 'targetRestriction' && e.cannotTarget !== undefined) checkCondition(c, err, `${path}.cannotTarget`, e.cannotTarget, owner)
  if (op === 'abilityMod' && e.ability !== undefined && !owner.abilities.has(e.ability as string)) err(`${path}.ability`, `unknown ability "${e.ability}" on this card`)
  if (op === 'code') checkCode(c, err, `${path}.code`, e.code)
}

function checkAbility(c: Ctx, err: Err, path: string, a: unknown, owner: Owner): void {
  if (!isObj(a)) { err(path, 'ability must be an object'); return }
  if (!nonEmpty(a.id) || !ID_RE.test(a.id)) err(`${path}.id`, 'must be kebab-case')
  if (!nonEmpty(a.name)) err(`${path}.name`, 'is required')
  if (!['active', 'passive', 'reaction'].includes(a.type as string)) err(`${path}.type`, 'must be active | passive | reaction')
  if (!BANDS.includes(a.phase as string)) err(`${path}.phase`, `must be one of ${BANDS.join(', ')}`)
  if (!nonEmpty(a.text)) err(`${path}.text`, 'is required (our own one-line summary)')
  if (a.cost !== undefined) {
    const cost = a.cost as Record<string, unknown>
    if (!isObj(cost) || !RESOURCES.includes(cost.res as Resource)) err(`${path}.cost.res`, 'must be CP | BM | PE')
    else if (!owner.isCard && cost.res !== RACE_RESOURCE[owner.race]) err(`${path}.cost.res`, `${owner.race} pays ${RACE_RESOURCE[owner.race]} (misprint? add provenance)`)
    if (isObj(cost) && !(isInt(cost.n) || cost.n === 'X')) err(`${path}.cost.n`, 'must be an integer >= 0 or "X"')
    if (isObj(cost) && cost.n === 'X' && (!Array.isArray(a.options) || a.options.some((o) => !isObj(o) || !isObj(o.cost))))
      err(`${path}.cost`, 'cost "X" needs options that each carry a cost')
  } else if (!owner.isCard && a.type === 'active') err(`${path}.cost`, 'a unit Active ability prints a cost')
  if (a.limit !== undefined && !['oncePerRound', 'oncePerGame'].includes(a.limit as string)) err(`${path}.limit`, 'must be oncePerRound | oncePerGame')
  if (a.type === 'reaction' && a.trigger === undefined) err(`${path}.trigger`, 'a Reaction needs a trigger')
  if (a.trigger !== undefined) {
    const t = a.trigger
    if (!isObj(t) || !TRIGGER_EVENTS.includes(t.event as string)) err(`${path}.trigger.event`, `must be one of ${TRIGGER_EVENTS.join(', ')}`)
    else {
      if (t.who !== undefined && !['self', 'friendly', 'otherFriendly', 'enemy', 'any'].includes(t.who as string)) err(`${path}.trigger.who`, 'bad value')
      if (t.subject !== undefined && !['self', 'friendly', 'otherFriendly', 'enemy'].includes(t.subject as string)) err(`${path}.trigger.subject`, 'bad value')
      if (t.within !== undefined && !(typeof t.within === 'number' && t.within > 0)) err(`${path}.trigger.within`, 'must be inches > 0')
      if (t.attack !== undefined && !['ranged', 'closeCombat', 'any'].includes(t.attack as string)) err(`${path}.trigger.attack`, 'bad value')
      if (t.filter !== undefined) checkCondition(c, err, `${path}.trigger.filter`, t.filter, owner)
    }
  }
  if (a.requires !== undefined) checkCondition(c, err, `${path}.requires`, a.requires, owner)
  if (a.target !== undefined) {
    const t = a.target
    if (!isObj(t) || !TARGET_KINDS.includes(t.kind as string)) err(`${path}.target.kind`, `must be one of ${TARGET_KINDS.join(', ')}`)
    else if (t.filter !== undefined) checkCondition(c, err, `${path}.target.filter`, t.filter, owner)
  }
  checkEffects(c, err, `${path}.effects`, a.effects, owner)
  if (a.options !== undefined) {
    if (!Array.isArray(a.options) || a.options.length < 2) err(`${path}.options`, 'needs at least two options')
    else {
      const seen = new Set<string>()
      a.options.forEach((o, i) => {
        const p = `${path}.options[${i}]`
        if (!isObj(o)) { err(p, 'must be an object'); return }
        if (!nonEmpty(o.id) || !ID_RE.test(o.id)) err(`${p}.id`, 'must be kebab-case')
        else if (seen.has(o.id)) err(`${p}.id`, 'duplicate option id'); else seen.add(o.id)
        if (!nonEmpty(o.text)) err(`${p}.text`, 'is required')
        if (o.cost !== undefined && (!isObj(o.cost) || !RESOURCES.includes(o.cost.res as Resource) || !isInt(o.cost.n))) err(`${p}.cost`, 'must be {res, n}')
        checkEffects(c, err, `${p}.effects`, o.effects, owner)
      })
    }
  } else if (Array.isArray(a.effects) && a.effects.length === 0) err(`${path}.effects`, 'needs at least one effect (or options)')
}

function checkWeapon(c: Ctx, err: Err, path: string, w: unknown): void {
  if (!isObj(w)) { err(path, 'weapon must be an object'); return }
  if (!nonEmpty(w.id) || !ID_RE.test(w.id)) err(`${path}.id`, 'must be kebab-case')
  if (!nonEmpty(w.name)) err(`${path}.name`, 'is required')
  if (w.phase !== 'assault' && w.phase !== 'combat') err(`${path}.phase`, 'must be assault | combat')
  if (w.phase === 'combat' && w.range !== 'E') err(`${path}.range`, 'a Combat Phase weapon has range "E"')
  if (w.phase === 'assault' && !isInt(w.range, 1)) err(`${path}.range`, 'an Assault Phase weapon has a range in inches')
  if (!['ground', 'flying', 'all'].includes(w.target as string)) err(`${path}.target`, 'must be ground | flying | all')
  if (typeof w.roa === 'string') {
    if (!ROA_TEMPLATE_RE.test(w.roa)) err(`${path}.roa`, 'must be an integer or "BT+N"')
    else if (w.template !== 'BT') err(`${path}.template`, 'RoA "BT+N" needs template "BT"')
  } else if (!isInt(w.roa, 1)) err(`${path}.roa`, 'must be an integer >= 1')
  if (!isTN(w.hit)) err(`${path}.hit`, 'must be a target number 2..6')
  checkTags(err, `${path}.surgeTypes`, w.surgeTypes)
  if (w.sDice !== null && w.sDice !== 'BT' && !DICE_RE.test(String(w.sDice))) err(`${path}.sDice`, `bad dice ${str(w.sDice)} (use "D3", "D3+1", "D6", "BT" or null)`)
  if (Array.isArray(w.surgeTypes) && (w.surgeTypes.length === 0) !== (w.sDice === null)) err(`${path}.sDice`, 'is null exactly when surgeTypes is empty')
  if (w.sDice === 'BT' && w.template !== 'BT') err(`${path}.template`, 'S Dice "BT" needs template "BT"')
  if (w.template !== undefined && !['BT', 'FT'].includes(w.template as string)) err(`${path}.template`, 'must be BT | FT')
  if (!isInt(w.dmg, 1)) err(`${path}.dmg`, 'must be an integer >= 1')
  if (!Array.isArray(w.keywords)) err(`${path}.keywords`, 'must be an array ([] for "-")')
  else w.keywords.forEach((k, i) => {
    checkKwRef(c, err, `${path}.keywords[${i}]`, k)
    if (isObj(k) && c.keywords.get(k.kw as string)?.kind === 'status') err(`${path}.keywords[${i}]`, 'a status in the Keyword column goes in requiresStatus')
  })
  if (w.requiresStatus !== undefined) checkStatus(c, err, `${path}.requiresStatus`, w.requiresStatus)
}

function checkTokens(err: Err, path: string, tokens: unknown, ids: Set<string>): void {
  if (tokens === undefined) return
  if (!Array.isArray(tokens)) { err(path, 'must be an array'); return }
  tokens.forEach((t: unknown, i) => {
    const p = `${path}[${i}]`
    if (!isObj(t)) { err(p, 'must be an object'); return }
    if (!nonEmpty(t.id) || !ID_RE.test(t.id)) err(`${p}.id`, 'must be kebab-case')
    else if (ids.has(t.id)) err(`${p}.id`, 'duplicate token id'); else ids.add(t.id)
    if (!nonEmpty(t.name)) err(`${p}.name`, 'is required')
    if (t.baseMm !== null && !isInt(t.baseMm, 1)) err(`${p}.baseMm`, 'must be mm > 0 or null')
    if (t.size !== null && !isInt(t.size)) err(`${p}.size`, 'must be an integer or null')
    if (!nonEmpty(t.text)) err(`${p}.text`, 'is required')
  })
}

/** Collect a unique id set from a list of {id} objects; report duplicates. */
function idSet(err: Err, path: string, list: unknown[], into = new Set<string>()): Set<string> {
  list.forEach((x, i) => {
    const id = isObj(x) ? x.id : undefined
    if (typeof id !== 'string') return
    if (into.has(id)) err(`${path}[${i}].id`, `duplicate id "${id}" within this record`)
    into.add(id)
  })
  return into
}

// ---------------------------------------------------------------- records
function checkUnit(c: Ctx, err: Err, u: UnitDef & Record<string, unknown>, file: string): void {
  if (!RACES.includes(u.race)) err('race', 'must be terran | zerg | protoss')
  else if (!file.startsWith(`${c.b.edition}/units/${u.race}/`)) err('race', `file must live in units/${u.race}/`)
  if (!Array.isArray(u.factionTags) || !u.factionTags.includes(u.race)) err('factionTags', 'must list every printed tag, race included')
  else u.factionTags.forEach((t, i) => { if (!c.factionTags.has(t)) err(`factionTags[${i}]`, `unknown faction tag "${t}" (rules.json)`) })
  if (u.variantOf !== undefined && (!c.units.has(u.variantOf) || u.variantOf === u.id)) err('variantOf', `unknown unit "${u.variantOf}"`)
  if (typeof u.unique !== 'boolean') err('unique', 'must be a boolean')
  if (!nonEmpty(u.role)) err('role', 'is required')
  if (typeof u.summoned !== 'boolean') err('summoned', 'must be a boolean')
  if (u.slot !== null && !SLOTS.includes(u.slot)) err('slot', `must be one of ${SLOTS.join(', ')} or null`)
  if ((u.slot === null) !== (u.summoned === true)) err('slot', 'is null exactly when the Unit is summoned (no printed Army Slot, no CT row)')
  checkTags(err, 'combatTags', u.combatTags)
  if (Array.isArray(u.combatTags) && !u.combatTags.includes('ground') && !u.combatTags.includes('flying')) err('combatTags', 'needs ground or flying')
  const s = u.stats as unknown as Record<string, unknown>
  if (!isObj(s)) err('stats', 'is required')
  else {
    if (s.shield !== null && !isInt(s.shield, 1)) err('stats.shield', 'must be an integer >= 1 or null')
    const sp = s.speed
    if (!(sp === null || isInt(sp, 1) || (Array.isArray(sp) && sp.length === 2 && isInt(sp[0], 1) && isInt(sp[1], 1) && sp[1] > sp[0])))
      err('stats.speed', 'must be an integer, [move, run] or null')
    if (s.armour !== null && !isTN(s.armour)) err('stats.armour', 'must be 2..6 or null')
    if (s.evade !== null && !isTN(s.evade)) err('stats.evade', 'must be 2..6 or null')
    if (!isInt(s.hp, 1)) err('stats.hp', 'must be an integer >= 1')
    if (s.size !== null && !isInt(s.size)) err('stats.size', 'must be an integer or null')
  }
  const bases = c.b.singletons.rules?.baseSizesMm?.value ?? DEFAULT_BASES
  const bm = u.baseMm as unknown
  if (!(isInt(bm, 1) && bases.includes(bm as number)) && !(Array.isArray(bm) && bm.length === 2 && isInt(bm[0], 1) && isInt(bm[1], 1)))
    err('baseMm', `must be one of ${bases.join(', ')} or an oval [w, l]`)
  // supply profile: contiguous from 1, no overlap, never decreasing
  if (!Array.isArray(u.supplyProfile) || u.supplyProfile.length === 0) err('supplyProfile', 'needs at least one bracket')
  else {
    let next = 1, last = -1
    u.supplyProfile.forEach((br, i) => {
      if (!isObj(br) || !isInt(br.min, 1) || !isInt(br.max, 1) || !isInt(br.supply)) { err(`supplyProfile[${i}]`, 'must be {min, max, supply} integers'); return }
      if (br.min !== next) err(`supplyProfile[${i}].min`, `must be ${next} (brackets are contiguous from 1)`)
      if (br.max < br.min) err(`supplyProfile[${i}].max`, 'must be >= min')
      if (br.supply < last) err(`supplyProfile[${i}].supply`, 'Supply never decreases as models increase')
      next = br.max + 1; last = br.supply
    })
  }
  const weapons = Array.isArray(u.weapons) ? u.weapons : []
  if (!Array.isArray(u.weapons)) err('weapons', 'must be an array')
  const upgrades = Array.isArray(u.upgrades) ? u.upgrades : []
  if (!Array.isArray(u.upgrades)) err('upgrades', 'must be an array ([] when the back is blank)')
  const abilities = Array.isArray(u.abilities) ? u.abilities : []
  if (!Array.isArray(u.abilities)) err('abilities', 'must be an array')
  const weaponIds = idSet(err, 'weapons', weapons)
  const defaultWeapons = new Set(weaponIds)
  idSet(err, 'upgrades[].weapon', upgrades.map((x) => (isObj(x) ? x.weapon : undefined)).filter(Boolean) as unknown[], weaponIds)
  const abilityIds = idSet(err, 'abilities', abilities)
  idSet(err, 'upgrades[].ability', upgrades.map((x) => (isObj(x) ? x.ability : undefined)).filter(Boolean) as unknown[], abilityIds)
  idSet(err, 'upgrades', upgrades)
  const tokenIds = new Set<string>()
  checkTokens(err, 'tokens', u.tokens, tokenIds)
  const owner: Owner = { weapons: weaponIds, abilities: abilityIds, tokens: tokenIds, race: u.race, isCard: false }
  weapons.forEach((w, i) => checkWeapon(c, err, `weapons[${i}]`, w))
  abilities.forEach((a, i) => checkAbility(c, err, `abilities[${i}]`, a, owner))
  upgrades.forEach((up, i) => {
    const p = `upgrades[${i}]`
    if (!isObj(up)) { err(p, 'must be an object'); return }
    if (!nonEmpty(up.id) || !ID_RE.test(up.id)) err(`${p}.id`, 'must be kebab-case')
    if (!nonEmpty(up.name)) err(`${p}.name`, 'is required')
    if (!BANDS.includes(up.phase as string)) err(`${p}.phase`, `must be one of ${BANDS.join(', ')}`)
    if ((up.weapon === undefined) === (up.ability === undefined)) err(p, 'needs exactly one of weapon or ability')
    if (up.weapon !== undefined) {
      checkWeapon(c, err, `${p}.weapon`, up.weapon)
      const kws = isObj(up.weapon) && Array.isArray(up.weapon.keywords) ? up.weapon.keywords as { kw: string }[] : []
      if (kws.some((k) => k.kw === 'SPECIALIST') !== (up.specialist === true)) err(`${p}.specialist`, 'is true exactly when the weapon has SPECIALIST')
    }
    if (up.ability !== undefined) checkAbility(c, err, `${p}.ability`, up.ability, owner)
    if (up.replaces !== undefined) {
      if (up.weapon === undefined) err(`${p}.replaces`, 'FOR [weapon] needs a weapon')
      if (!defaultWeapons.has(up.replaces as string)) err(`${p}.replaces`, `"${up.replaces}" is not a default weapon on this card`)
    }
  })
  if (!nonEmpty(u.cardVersion)) err('cardVersion', 'is required (printed "v 1.04.26" -> "1.04.26")')
}

function checkCard(c: Ctx, err: Err, card: CardDef & Record<string, unknown>): void {
  if (!['faction', 'tactical', 'creep'].includes(card.kind)) err('kind', 'must be faction | tactical | creep')
  if (!RACES.includes(card.race)) err('race', 'must be terran | zerg | protoss')
  if (!Array.isArray(card.factionTags) || !card.factionTags.includes(card.race)) err('factionTags', 'must list every printed tag, race included')
  else card.factionTags.forEach((t, i) => { if (!c.factionTags.has(t)) err(`factionTags[${i}]`, `unknown faction tag "${t}"`) })
  if (typeof card.unique !== 'boolean') err('unique', 'must be a boolean')
  if (!isObj(card.slots)) err('slots', 'must be an object ({} when none)')
  else for (const [k, v] of Object.entries(card.slots)) {
    if (!SLOTS.includes(k)) err(`slots.${k}`, 'unknown slot type')
    if (!isInt(v, 1)) err(`slots.${k}`, 'must be an integer >= 1')
  }
  if (card.kind === 'creep') { if (card.resource !== null) err('resource', 'Creep Cards give no resource (null)') }
  else if (!isObj(card.resource) || card.resource.res !== RACE_RESOURCE[card.race] || !isInt(card.resource.n, 1))
    err('resource', `must be {res: "${RACE_RESOURCE[card.race]}", n >= 1}`)
  if (card.requiresCreepCard !== undefined && (card.kind !== 'faction' || card.race !== 'zerg')) err('requiresCreepCard', 'only on Zerg faction cards')
  const tokenIds = new Set<string>()
  checkTokens(err, 'tokens', card.tokens, tokenIds)
  const abilities = Array.isArray(card.abilities) ? card.abilities : []
  if (!Array.isArray(card.abilities)) err('abilities', 'must be an array')
  const owner: Owner = { weapons: new Set(), abilities: idSet(err, 'abilities', abilities), tokens: tokenIds, race: card.race, isCard: true }
  abilities.forEach((a, i) => checkAbility(c, err, `abilities[${i}]`, a, owner))
  if (!nonEmpty(card.cardVersion)) err('cardVersion', 'is required')
}

function checkMission(c: Ctx, err: Err, m: MissionDef & Record<string, unknown>): void {
  if (!SCALES.includes(m.scale)) err('scale', `must be one of ${SCALES.join(', ')}`)
  if (!isInt(m.startSupply, 1)) err('startSupply', 'must be an integer >= 1')
  if (!isInt(m.escalation)) err('escalation', 'must be an integer >= 0')
  if (!isInt(m.gameLength, 1)) err('gameLength', 'must be >= 1')
  if (m.specialWinLead !== null && !isInt(m.specialWinLead, 1)) err('specialWinLead', 'must be an integer or null')
  if (!['activated', 'deactivated'].includes(m.markerStart)) err('markerStart', 'must be activated | deactivated')
  const legal = m.scale === 'skirmish' ? SKIRMISH_MARKERS : [1, 2, 3, 4, 5]
  if (!Array.isArray(m.startOfRound)) err('startOfRound', 'must be an array')
  else m.startOfRound.forEach((st, i) => {
    if (!['activateRandom', 'activate', 'deactivate'].includes(st.action)) err(`startOfRound[${i}].action`, 'bad action')
    if (!Array.isArray(st.rounds) || st.rounds.some((r) => !isInt(r, 1) || r > m.gameLength)) err(`startOfRound[${i}].rounds`, 'rounds must lie within the game length')
    if (!Array.isArray(st.markers) || st.markers.some((n) => !legal.includes(n))) err(`startOfRound[${i}].markers`, `markers must exist at this scale (${legal.join(', ')})`)
  })
  if (!Array.isArray(m.scoring) || m.scoring.length === 0) err('scoring', 'needs at least one rule')
  else m.scoring.forEach((s, i) => {
    if (!SCORING_KINDS.includes(s.kind)) err(`scoring[${i}].kind`, `unknown scoring kind ${str(s.kind)}`)
    if (s.kind === 'code') checkCode(c, err, `scoring[${i}].code`, s.code)
    if (s.kind === 'markerControlled' && !legal.includes(s.marker)) err(`scoring[${i}].marker`, 'no such marker at this scale')
  })
  const owner: Owner = { weapons: new Set(), abilities: new Set(), tokens: new Set(), race: 'terran', isCard: true }
  if (!Array.isArray(m.actions)) err('actions', 'must be an array')
  else m.actions.forEach((a, i) => {
    if (!nonEmpty(a.id) || !ID_RE.test(a.id)) err(`actions[${i}].id`, 'must be kebab-case')
    if (!PHASES.includes(a.phase)) err(`actions[${i}].phase`, 'bad phase')
    if (!nonEmpty(a.text)) err(`actions[${i}].text`, 'is required')
    checkEffects(c, err, `actions[${i}].effects`, a.effects, owner)
  })
  if (!nonEmpty(m.text)) err('text', 'is required (our own summary)')
  if (!nonEmpty(m.cardVersion)) err('cardVersion', 'is required')
}

function checkDeployment(err: Err, d: DeploymentDef & Record<string, unknown>): void {
  if (!SCALES.includes(d.scale)) err('scale', `must be one of ${SCALES.join(', ')}`)
  if (!isObj(d.size) || !isInt(d.size.w, 1) || !isInt(d.size.h, 1)) { err('size', 'must be {w, h} inches'); return }
  const len = (e: string) => (e === 'N' || e === 'S' ? d.size.w : d.size.h)
  for (const side of ['red', 'blue'] as const) {
    const segs = isObj(d.entryEdges) ? (d.entryEdges as Record<string, unknown>)[side] : undefined
    if (!Array.isArray(segs) || segs.length === 0) { err(`entryEdges.${side}`, 'needs at least one segment'); continue }
    segs.forEach((s: unknown, i) => {
      const p = `entryEdges.${side}[${i}]`
      if (!isObj(s) || !['N', 'S', 'E', 'W'].includes(s.edge as string)) { err(p, 'must be {edge, from, to}'); return }
      if (typeof s.from !== 'number' || typeof s.to !== 'number' || s.from < 0 || s.to <= s.from || s.to > len(s.edge as string))
        err(p, `must lie on the ${s.edge} edge (0..${len(s.edge as string)}) with from < to`)
    })
  }
  const legal = d.scale === 'skirmish' ? SKIRMISH_MARKERS : [1, 2, 3, 4, 5]
  const seen = new Set<number>()
  if (!Array.isArray(d.markers)) err('markers', 'must be an array')
  else d.markers.forEach((m, i) => {
    if (!legal.includes(m.n) || seen.has(m.n)) err(`markers[${i}].n`, `must be a unique marker of ${legal.join(', ')}`)
    seen.add(m.n)
    if (!(m.x >= 0 && m.x <= d.size.w && m.y >= 0 && m.y <= d.size.h)) err(`markers[${i}]`, 'must lie on the table')
  })
  if (!nonEmpty(d.cardVersion)) err('cardVersion', 'is required')
}

function checkKeywords(err: Err, file: unknown): Map<string, KeywordDef> {
  const map = new Map<string, KeywordDef>()
  if (!isObj(file) || !Array.isArray(file.keywords)) { err('keywords', 'must be an array of KeywordDef'); return map }
  file.keywords.forEach((k: unknown, i) => {
    const p = `keywords[${i}]`
    if (!isObj(k)) { err(p, 'must be an object'); return }
    if (!nonEmpty(k.id) || !KW_RE.test(k.id)) err(`${p}.id`, 'must be UPPER_SNAKE')
    else if (map.has(k.id)) err(`${p}.id`, `duplicate keyword "${k.id}"`)
    else map.set(k.id, k as unknown as KeywordDef)
    if (!nonEmpty(k.name)) err(`${p}.name`, 'is required')
    if (!KW_KINDS.includes(k.kind as string)) err(`${p}.kind`, `must be one of ${KW_KINDS.join(', ')}`)
    if (!Array.isArray(k.params) || k.params.some((x) => !KW_PARAMS.includes(x))) err(`${p}.params`, `must be a subset of ${KW_PARAMS.join(', ')}`)
    if (!['flag', 'max', 'perCharacteristicMax'].includes(k.stacking as string)) err(`${p}.stacking`, 'must be flag | max | perCharacteristicMax')
    if (!nonEmpty(k.spec)) err(`${p}.spec`, 'is required (e.g. "18 KW-028")')
    if (!nonEmpty(k.text)) err(`${p}.text`, 'is required')
    checkSource(err, k.source, `${p}.source`)
  })
  return map
}

function checkRules(err: Err, r: unknown): void {
  if (!isObj(r)) return
  for (const k of RULES_KEYS) {
    const v = r[k]
    if (!isObj(v) || v.value === undefined) err(k, 'is required as {value, source}')
    else checkSource(err, v.source, `${k}.source`)
  }
  const tokenIds = new Set<string>()
  checkTokens(err, 'tokens', r.tokens, tokenIds)
  const ft = isObj(r.factionTags) ? r.factionTags.value : undefined
  if (isObj(ft)) for (const k of Object.keys(ft)) if (!ID_RE.test(k)) err(`factionTags.${k}`, 'must be kebab-case')
}

// ---------------------------------------------------------------- costs
function checkCosts(c: Ctx, push: (file: string, id: string, path: string, msg: string, warning?: boolean) => void): void {
  const tables = new Map<string, CostTableDef[]>()
  for (const t of c.b.records.costs) {
    const file = c.b.origin[t.id] ?? `${c.b.edition}/costs/?`
    const err = (path: string, msg: string, w?: boolean) => push(file, t.id, path, msg, w)
    if (!nonEmpty(t.table)) err('table', 'is required (e.g. "ct-2026-10")')
    if (!nonEmpty(t.date) || !/^\d{4}-\d{2}-\d{2}$/.test(t.date)) err('date', 'must be YYYY-MM-DD')
    if (!isObj(t.units)) err('units', 'must be an object ({} when none)')
    if (!isObj(t.cards)) err('cards', 'must be an object ({} when none)')
    const list = tables.get(t.table) ?? []; list.push(t); tables.set(t.table, list)
    for (const [uid, row] of Object.entries(isObj(t.units) ? t.units : {})) {
      const p = `units.${uid}`
      if (!isObj(row) || !Array.isArray(row.compositions) || row.compositions.length === 0) { err(p, 'needs compositions'); continue }
      checkSource(err, row.source, `${p}.source`)
      const u = c.units.get(uid)
      if (!u) { err(p, 'CT row with no unit card in data (allowed for CT-only units)', true); continue }
      if (u.summoned) err(p, 'a summoned Unit has no CT row')
      row.compositions.forEach((cp, i) => {
        if (!isInt(cp.models, 1) || !isInt(cp.supply) || !isInt(cp.minerals, 1)) { err(`${p}.compositions[${i}]`, 'must be {models, supply, minerals}'); return }
        const br = Array.isArray(u.supplyProfile) ? u.supplyProfile.find((x) => cp.models >= x.min && cp.models <= x.max) : undefined
        if (!br) err(`${p}.compositions[${i}].models`, `${cp.models} models is outside the card's Supply Profile`)
        else if (br.supply !== cp.supply) err(`${p}.compositions[${i}].supply`, `CT says ${cp.supply}, the card bracket ${br.min}-${br.max} says ${br.supply}`)
      })
      const ups = new Set((u.upgrades ?? []).map((x) => x.id))
      for (const [upId, prices] of Object.entries(isObj(row.upgrades) ? row.upgrades : {})) {
        if (!ups.has(upId)) err(`${p}.upgrades.${upId}`, 'no such upgrade on the unit card')
        if (!Array.isArray(prices) || prices.length !== row.compositions.length || prices.some((x) => x !== null && !isInt(x)))
          err(`${p}.upgrades.${upId}`, 'needs one price (or null) per composition')
      }
      for (const upId of ups) if (!isObj(row.upgrades) || !(upId in row.upgrades)) err(`${p}.upgrades`, `upgrade "${upId}" has no CT price`)
    }
    for (const [cid, gas] of Object.entries(isObj(t.cards) ? t.cards : {})) {
      const card = c.cards.get(cid)
      if (!isInt(gas)) err(`cards.${cid}`, 'must be gas >= 0')
      if (!card) err(`cards.${cid}`, 'CT card with no card in data', true)
      else if (card.kind === 'faction') err(`cards.${cid}`, 'Faction Cards have no gas cost')
    }
  }
  if (tables.size === 0 && (c.units.size > 0 || c.cards.size > 0)) push(`${c.b.edition}/costs/`, '-', '', 'no cost table found')
  // the newest table (by date) must price every buyable thing
  const newest = [...tables.values()].sort((a, b) => (b[0]?.date ?? '').localeCompare(a[0]?.date ?? ''))[0] ?? []
  const pricedUnits = new Set(newest.flatMap((t) => Object.keys(isObj(t.units) ? t.units : {})))
  const pricedCards = new Set(newest.flatMap((t) => Object.keys(isObj(t.cards) ? t.cards : {})))
  for (const u of c.units.values()) if (!u.summoned && !pricedUnits.has(u.id)) push(c.b.origin[u.id] ?? '?', u.id, 'cost', 'has no row in the cost table')
  for (const k of c.cards.values()) if (k.kind !== 'faction' && !pricedCards.has(k.id)) push(c.b.origin[k.id] ?? '?', k.id, 'cost', 'has no gas price in the cost table')
}

// ---------------------------------------------------------------- entry points
const NAMELESS: readonly Kind[] = ['costs', 'hooks']

/** Validate one edition bundle. Returns every problem found (warnings carry severity 'warning'); none = valid. */
export function validateBundle(b: EditionBundle): ValidationError[] {
  const errs: ValidationError[] = []
  const push = (file: string, id: string, path: string, message: string, warning?: boolean) =>
    errs.push({ file, id, path, message, ...(warning ? { severity: 'warning' as const } : {}) })
  const counts = new Map<string, number>()
  const errFor = (rec: unknown, fallback: string): Err => {
    const id = isObj(rec) && typeof rec.id === 'string' ? rec.id : '(no id)'
    return (path, message, w) => push(b.origin[id] ?? fallback, id, path, message, w)
  }
  // generic: id, name, source, uniqueness
  for (const kind of KINDS) for (const rec of b.records[kind] as unknown[]) {
    const err = errFor(rec, `${b.edition}/${kind}/?`)
    if (!isObj(rec)) { err('', 'record must be an object'); continue }
    const id = rec.id
    if (!nonEmpty(id)) err('id', 'is required')
    else if (!ID_RE.test(id)) err('id', 'must be kebab-case (a-z, 0-9, single hyphens)')
    if (!NAMELESS.includes(kind) && !nonEmpty(rec.name)) err('name', 'is required')
    if (kind === 'hooks' && !nonEmpty(rec.text)) err('text', 'is required')
    checkSource(err, rec.source)
    const key = typeof id === 'string' ? id : '(no id)'
    counts.set(key, (counts.get(key) ?? 0) + 1)
  }
  for (const [name, rec] of Object.entries(b.singletons)) {
    const err = errFor(rec, `${b.edition}/${name}.json`)
    if (!isObj(rec) || rec.id !== name) push(`${b.edition}/${name}.json`, String(isObj(rec) ? rec.id : '-'), 'id', `must be "${name}"`)
    else checkSource(err, rec.source)
  }
  for (const [id, n] of counts) if (n > 1 && id !== '(no id)') push(b.origin[id] ?? b.edition, id, 'id', `duplicate id (${n} records)`)

  const rules = b.singletons.rules as RulesDef | undefined
  const hasContent = b.records.units.length + b.records.cards.length + b.records.missions.length > 0
  if (hasContent && !rules) push(`${b.edition}/rules.json`, 'rules', '', 'is missing')
  if (hasContent && !b.singletons.keywords) push(`${b.edition}/keywords.json`, 'keywords', '', 'is missing')
  if (rules) checkRules(errFor(rules, `${b.edition}/rules.json`), rules)
  const keywords = checkKeywords(errFor(b.singletons.keywords, `${b.edition}/keywords.json`), b.singletons.keywords ?? { keywords: [] })
  const c: Ctx = {
    b, keywords,
    statuses: new Set([...keywords.values()].filter((k) => k.kind === 'status').map((k) => k.id)),
    hooks: new Set(b.records.hooks.map((h) => h.id)),
    units: new Map(b.records.units.filter(isObj).map((u) => [u.id, u])),
    cards: new Map(b.records.cards.filter(isObj).map((k) => [k.id, k])),
    coreTokens: new Set((rules?.tokens ?? []).map((t: TokenDef) => t.id)),
    factionTags: new Set(Object.keys(rules?.factionTags?.value ?? {})),
  }
  for (const u of b.records.units) if (isObj(u)) checkUnit(c, errFor(u, '?'), u as UnitDef & Record<string, unknown>, b.origin[u.id] ?? '')
  for (const k of b.records.cards) if (isObj(k)) checkCard(c, errFor(k, '?'), k as CardDef & Record<string, unknown>)
  for (const m of b.records.missions) if (isObj(m)) checkMission(c, errFor(m, '?'), m as MissionDef & Record<string, unknown>)
  for (const d of b.records.deployments) if (isObj(d)) checkDeployment(errFor(d, '?'), d as DeploymentDef & Record<string, unknown>)
  for (const h of b.records.hooks) {
    const file = b.origin[h.id] ?? ''
    const area = file.split('/')[2]?.replace(/\.json$/, '')
    if (!HOOK_AREAS.includes(area as never)) push(file, h.id, '', `hooks live in hooks/<${HOOK_AREAS.join('|')}>.json`)
  }
  for (const p of b.records.presets) {
    const err = errFor(p, '?')
    const f = c.cards.get(p.faction)
    if (!f || f.kind !== 'faction') err('faction', `unknown faction card "${p.faction}"`)
    p.units?.forEach((x, i) => { if (!c.units.has(x.unit)) err(`units[${i}].unit`, `unknown unit "${x.unit}"`) })
    p.cards?.forEach((x, i) => { if (!c.cards.has(x)) err(`cards[${i}]`, `unknown card "${x}"`) })
  }
  if (hasContent || b.records.costs.length) checkCosts(c, push)
  return errs
}

/** Validate editions.json against the bundles found on disk. */
export function validateEditions(editions: unknown, found: string[]): ValidationError[] {
  const errs: ValidationError[] = []
  const e = (path: string, message: string) => errs.push({ file: 'editions.json', id: '-', path, message })
  if (!isObj(editions)) { e('', 'must be an object { default, editions }'); return errs }
  const ed = editions as unknown as EditionsFile
  if (!Array.isArray(ed.editions) || ed.editions.some((x) => typeof x !== 'string')) e('editions', 'must be a string array')
  else {
    if (!ed.editions.includes(ed.default)) e('default', `"${ed.default}" is not listed in editions`)
    for (const f of found) if (!ed.editions.includes(f)) e('editions', `folder data/${f}/ is not listed`)
    for (const f of ed.editions) if (!found.includes(f)) e('editions', `edition "${f}" has no folder data/${f}/`)
  }
  return errs
}

export const isWarning = (x: ValidationError) => x.severity === 'warning'
export function formatError(x: ValidationError): string {
  return `${x.severity === 'warning' ? 'warning: ' : ''}data/${x.file} [${x.id}] ${x.path || '(record)'}: ${x.message}`
}
