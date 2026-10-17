// Interaction owner I: the decision-kind table (spec 00 s3.2) and the pure classifiers the controllers share. No React, no
// three, no rules arithmetic: it only reads the shape of a PendingDecision (kind, context, option templates) and decides
// how the screen should let the player answer it. Everything here is unit-tested (tests/client/interaction.test.ts).
import type { Action, DecisionOption, ModelId, PendingDecision, UnitId } from '../../engine/types'

/** How a decision is answered on screen. */
export type Mode =
  | 'activate' // pick one of your squads, then an action from its menu (turn.activate)
  | 'path' // drag or click the Leading Model to a spot, preview, confirm (move.path, deploy.path, charge.path, move.place)
  | 'entry' // choose an Entry Edge or alternate entry (deploy.entry)
  | 'target' // click a highlighted enemy squad (shoot.batch, charge.targets, charge.impact, melee.split, ability target)
  | 'models' // click one of the highlighted models (atk.casualty, shoot.template, anything whose options name a model)
  | 'point' // click a spot on the table (ability spots)
  | 'list' // plain choices (setup.*, turn.first, melee.closeRanks, atk.*, ability.*, mission.*, score.order, anything unknown)

/** Every decision kind the engine raises or the spec reserves (00 s3.2). The test walks this list. */
export const DECISION_KINDS = [
  'setup.colour', 'setup.draftControl', 'setup.ban', 'setup.pick', 'setup.terrain', 'setup.firstPlayer',
  'turn.start', 'turn.first', 'turn.activate', 'turn.order', 'turn.over', 'turn.choose',
  'move.path', 'move.place',
  'deploy.entry', 'deploy.drop', 'deploy.path',
  'shoot.batch', 'shoot.template',
  'charge.targets', 'charge.impact', 'charge.path',
  'melee.closeRanks', 'melee.split', 'melee.keywords',
  'atk.reroll', 'atk.precision', 'atk.tough', 'atk.casualty',
  'ability.window', 'ability.target', 'ability.pay', 'ability.react',
  'mission.choose', 'mission.claim',
  'score.order',
] as const

export interface KindInfo { title: string; hint: string }

/** Our own words. `hint` is the first-turn help line shown under the title. */
export const KIND_INFO: Record<string, KindInfo> = {
  'setup.colour': { title: 'Pick your colour', hint: 'Red and Blue decide which table edge and which markers lean your way. Choose the side you want to play.' },
  'setup.draftControl': { title: 'Choose which draft you steer', hint: 'You pick the card from the draft you control; your opponent strikes cards from it first.' },
  'setup.ban': { title: 'Strike a card', hint: 'Remove one card from the row. Whatever is left may be picked.' },
  'setup.pick': { title: 'Pick a card', hint: 'Choose the card that will be played this game.' },
  'setup.terrain': { title: 'Choose the map', hint: 'Pick which terrain layout the table uses.' },
  'setup.firstPlayer': { title: 'Give out the First Player Marker', hint: 'You won the roll-off. Hand the marker to either side; its holder opens the first Phase.' },
  'turn.start': { title: 'Start of the turn', hint: 'Pick how this turn begins.' },
  'turn.first': { title: 'Who activates first?', hint: 'Name the side that takes the first turn of this Phase. Turns alternate after that.' },
  'turn.activate': { title: 'Your turn: activate a squad', hint: 'Click one of your glowing squads on the table (or pick it below), then choose what it does. Pass when you are finished.' },
  'turn.order': { title: 'Order your effects', hint: 'Several of your effects trigger together. Choose which resolves first.' },
  'turn.over': { title: 'Game over', hint: 'The game has ended.' },
  'turn.choose': { title: 'Take your turn', hint: 'Roll a test die or pass.' },
  'move.path': { title: 'Move the squad', hint: 'Drag any model of the squad to where it should end, or click a spot. The rest follow into formation. Hover the ghosts, then confirm.' },
  'move.place': { title: 'Place the squad', hint: 'Drag a model to the new spot (within the shown range), then confirm.' },
  'deploy.entry': { title: 'Choose an entry point', hint: 'Pick the table edge the squad arrives through. Hover a choice to light it up on the table.' },
  'deploy.drop': { title: 'Drop a squad in', hint: 'An arrival lets you bring a squad out of Reserves. Pick one, or skip.' },
  'deploy.path': { title: 'Place the arriving squad', hint: 'Click a spot just inside the entry edge for the Leading Model. The ghosts show where the rest settle.' },
  'shoot.batch': { title: 'Choose a weapon and a target', hint: 'Pick a weapon, then click a red-ringed enemy. Hover one to see the odds; click again (or press Enter) to fire. Stop when this squad is done.' },
  'shoot.template': { title: 'Aim the template', hint: 'Click one of the highlighted models to centre the template on it.' },
  'charge.targets': { title: 'Declare charge targets', hint: 'Click the enemy squads you want to charge, then confirm. The roll you need is shown for the pick.' },
  'charge.impact': { title: 'Aim the impact dice', hint: 'Split the impact dice evenly, or throw them all at one enemy squad.' },
  'charge.path': { title: 'Charge into contact', hint: 'Drag a model toward the enemy, or let the game take the first legal route.' },
  'melee.closeRanks': { title: 'Close ranks?', hint: 'Step the squad up against the enemy before fighting, or hold the line.' },
  'melee.split': { title: 'Fight: aim the Surge Die', hint: 'Click the enemy squad that should receive the Surge Die for this fight.' },
  'melee.keywords': { title: 'Share out a keyword bonus', hint: 'The fight is split between enemy squads, so choose where this keyword bonus lands.' },
  'atk.reroll': { title: 'Re-roll dice?', hint: 'An effect lets you re-roll. Choose what to re-roll, or decline.' },
  'atk.precision': { title: 'Precision: pick a model', hint: 'Choose which model takes the damage.' },
  'atk.tough': { title: 'Toughness', hint: 'Choose how to apply the effect.' },
  'atk.casualty': { title: 'Choose a casualty', hint: 'Your squad took damage. Pick which model is removed: click it on the table or use the list.' },
  'ability.window': { title: 'Use an ability?', hint: 'Abilities and cards can be used here. Pick one, or press Done to move on.' },
  'ability.target': { title: 'Choose a target', hint: 'Pick what the ability affects.' },
  'ability.pay': { title: 'Pay the cost', hint: 'Choose which cards to spend.' },
  'ability.react': { title: 'Reaction?', hint: 'An opponent action opened a reaction for you. Use one, or decline.' },
  'mission.choose': { title: 'Mission choice', hint: 'The Mission Card asks you to pick an option.' },
  'mission.claim': { title: 'Claim a marker?', hint: 'A squad in position can claim a Mission Marker. Pick one, or decline.' },
  'score.order': { title: 'Order scoring effects', hint: 'Choose which end-of-round effect resolves first.' },
}

export function kindInfo(kind: string): KindInfo {
  const hit = KIND_INFO[kind]
  if (hit) return hit
  const ns = kind.split('.')[0] ?? ''
  const label = ns ? ns[0]!.toUpperCase() + ns.slice(1) : 'Decision'
  return { title: `${label}: your choice`, hint: 'Pick one of the choices below.' }
}

/** One line saying what the current choice means, for the prompts whose option labels alone are terse. '' when there is nothing to add. */
export function stepLine(p: PendingDecision): string {
  const c = p.context
  if (p.kind === 'melee.keywords') {
    const kw = typeof c['kw'] === 'string' ? (c['kw'] as string).replace(/_/g, ' ').toLowerCase() : 'keyword'
    const x = typeof c['x'] === 'number' ? c['x'] : null
    return `${x !== null ? `${kw} (${x})` : kw} applies once for this fight: put all of it against one enemy squad, or share it out as evenly as possible.`
  }
  if (p.kind === 'charge.impact') {
    const x = typeof c['x'] === 'number' ? c['x'] : null
    return `Each charging model with IMPACT rolls ${x ?? 'its'} dice. Send them all one way, share them evenly, or place each model's dice yourself.`
  }
  if (p.kind !== 'ability.target') return ''
  const cont = c['cont'] as { k?: string; op?: string; ids?: unknown[]; pts?: unknown[]; removed?: unknown[]; x?: number } | undefined
  if (!cont) return ''
  if (cont.k === 'costReact') return 'Using this Reaction makes the cost cheaper but spends your Reaction for this activation. Paying in full keeps the Reaction.'
  if (cont.k === 'newModel' && cont.op === 'respawn') {
    const total = cont.ids?.length ?? 0, placed = cont.pts?.length ?? 0
    return `RESPAWN: click a marked spot touching the squad to bring back a model (${Math.min(placed + 1, total)} of up to ${total}). You may stop early.`
  }
  if (cont.k === 'newModel' && cont.op === 'morph') {
    if (!cont.pts?.length) return 'MORPH: click a marked spot touching the squad for the new model. Models are removed afterwards.'
    const left = (cont.x ?? 1) - (cont.removed?.length ?? 0)
    return `MORPH: pick ${left} model${left === 1 ? '' : 's'} of the squad to remove in exchange for the new one.`
  }
  return ''
}

export const PATH_KINDS = ['move.path', 'deploy.path', 'charge.path', 'move.place'] as const
export const isPathKind = (kind: string): boolean => (PATH_KINDS as readonly string[]).includes(kind)

// ---------- the action menu of an activated squad ----------
export interface Verb { label: string; hint: string }
const VERBS: Record<string, Verb> = {
  'move.go': { label: 'Move', hint: 'Advance the squad up to its Speed.' },
  'move.run': { label: 'Run', hint: 'Move again in the Assault Phase, up to the squad Speed.' },
  'move.disengage': { label: 'Disengage', hint: 'Break away from an enemy squad in contact.' },
  'deploy.go': { label: 'Deploy', hint: 'Bring this squad in from Reserves.' },
  'shoot.go': { label: 'Ranged Attack', hint: 'Fire the squad weapons at enemies in sight.' },
  'charge.go': { label: 'Charge', hint: 'Rush an enemy squad and close for combat.' },
  'melee.go': { label: 'Fight', hint: 'Fight the enemy squads in contact.' },
  'turn.hold': { label: 'Hold', hint: 'Stand fast; the squad is activated without moving.' },
}
export function verbOf(opt: DecisionOption): Verb {
  const hit = VERBS[opt.action.type]
  if (hit) return hit
  // Mission actions (mission.gather...) are the mission's own action, offered when the squad stands at a qualifying marker.
  if (opt.action.type.startsWith('mission.')) return { label: opt.label, hint: 'A Mission action the squad can take at this marker. It uses the squad action.' }
  return { label: opt.label, hint: '' }
}

/** The help line under the title. When every squad that can act is still in Reserves, the glowing-squad advice would be
 *  wrong (nothing glows on the table), so the line points at the list instead. */
export function hintFor(p: PendingDecision, onTable: (id: UnitId) => boolean): string {
  const base = kindInfo(p.kind).hint
  if (p.kind !== 'turn.activate') return base
  const units = activationMenu(p).units
  if (units.length > 0 && !units.some((u) => onTable(u.unitId))) return 'All of your squads are in Reserves. Pick one from the list below to bring it onto the table, or Pass.'
  return base
}

export interface ActivationUnit { unitId: UnitId; options: DecisionOption[] }
export interface ActivationMenu { units: ActivationUnit[]; pass: DecisionOption | null }
/** turn.activate options grouped by the squad they belong to (Pass is separate). */
export function activationMenu(p: PendingDecision): ActivationMenu {
  const byUnit = new Map<UnitId, DecisionOption[]>()
  let pass: DecisionOption | null = null
  for (const o of p.options) {
    if (o.action.type === 'turn.pass') { pass = o; continue }
    const u = o.action['unitId']
    if (typeof u !== 'string') continue
    const list = byUnit.get(u) ?? []
    list.push(o)
    byUnit.set(u, list)
  }
  return { units: [...byUnit].map(([unitId, options]) => ({ unitId, options })), pass }
}

// ---------- what an option points at ----------
/** Units an option names as its target (for table picks and hover glow). The shooter's own `unitId` is NOT a target. */
export function targetRefs(kind: string, a: Action): UnitId[] {
  const strs = (v: unknown): UnitId[] => (Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string') : typeof v === 'string' ? [v] : [])
  switch (kind) {
    case 'shoot.batch': case 'shoot.template': return strs(a['targetUnitId'])
    case 'charge.targets': return strs(a['targetIds'])
    case 'charge.impact': return strs(a['all'])
    case 'melee.split': return strs(a['surgeTarget'])
    case 'ability.target': return a['mode'] === 'unit' ? strs(a['unitId']) : []
    default: return []
  }
}
export const modelRef = (a: Action): ModelId | null => (typeof a['modelId'] === 'string' ? (a['modelId'] as string) : null)

/** Every unit id an option mentions (hover on a list button lights these on the table). */
export function mentionedUnits(a: Action): UnitId[] {
  const out: UnitId[] = []
  for (const k of ['unitId', 'targetUnitId', 'surgeTarget', 'all', 'to']) if (typeof a[k] === 'string') out.push(a[k] as string)
  for (const k of ['targetIds']) if (Array.isArray(a[k])) for (const x of a[k] as unknown[]) if (typeof x === 'string') out.push(x)
  return [...new Set(out)]
}

const isPointOption = (o: DecisionOption): boolean => o.action['mode'] === 'point'

/** The answer mode of a decision, from its kind first and its option shapes second. */
export function classify(p: PendingDecision): Mode {
  if (p.kind === 'turn.activate') return 'activate'
  if (isPathKind(p.kind)) return 'path'
  if (p.kind === 'deploy.entry') return 'entry'
  if (p.kind === 'shoot.batch' || p.kind === 'charge.targets' || p.kind === 'charge.impact' || p.kind === 'melee.split') return 'target'
  if (p.kind === 'shoot.template' || p.kind === 'atk.casualty') return 'models'
  if (p.kind === 'ability.target') {
    if (p.options.some(isPointOption)) return 'point'
    if (p.options.some((o) => targetRefs(p.kind, o.action).length > 0)) return 'target'
    return 'list'
  }
  if (p.options.some((o) => modelRef(o.action) !== null)) return 'models'
  if (p.options.some(isPointOption)) return 'point'
  return 'list'
}

// ---------- shoot.batch ----------
export interface BatchRow { weaponId: string; targets: UnitId[]; options: Record<UnitId, DecisionOption> }
export interface BatchMenu { unitId: UnitId | null; rows: BatchRow[]; done: DecisionOption | null }
/** shoot.batch options grouped by weapon profile (one Batch each), with the Stop option apart. */
export function batchMenu(p: PendingDecision): BatchMenu {
  const rows = new Map<string, BatchRow>()
  let done: DecisionOption | null = null
  let unitId: UnitId | null = null
  for (const o of p.options) {
    if (typeof o.action['unitId'] === 'string') unitId = o.action['unitId'] as string
    if (o.action['done'] === true) { done = o; continue }
    const w = o.action['weaponId'], t = o.action['targetUnitId']
    if (typeof w !== 'string' || typeof t !== 'string') continue
    const row = rows.get(w) ?? { weaponId: w, targets: [], options: {} }
    row.targets.push(t)
    row.options[t] = o
    rows.set(w, row)
  }
  return { unitId, rows: [...rows.values()], done }
}

// ---------- charge.targets ----------
const sameSet = (a: readonly string[], b: readonly string[]): boolean => a.length === b.length && a.every((x) => b.includes(x))
/** The charge.targets option whose target set equals `picked` (order free), or null. */
export function chargeOptionFor(p: PendingDecision, picked: readonly UnitId[]): DecisionOption | null {
  return p.options.find((o) => sameSet(targetRefs(p.kind, o.action), picked)) ?? null
}
/** Units a click may add to the picked set. */
export function chargePickable(p: PendingDecision): UnitId[] {
  const ctx = p.context['targets']
  return Array.isArray(ctx) ? ctx.filter((x): x is string => typeof x === 'string') : [...new Set(p.options.flatMap((o) => targetRefs(p.kind, o.action)))]
}

// ---------- path decisions ----------
const STRIP = new Set(['type', 'decisionId', 'seat', 'auto', 'leaderId', 'path', 'dest', 'placement'])
export interface PathPlan {
  /** Action type to send. */
  type: string
  /** Fixed template fields (unitId, kind, entry, rowId, x, source...). */
  fields: Record<string, unknown>
  unitId: UnitId
  /** How the destination is written: a waypoint list or one `dest` point (move.place). */
  shape: 'path' | 'dest'
  /** Ready one-click options (suggested routes, auto, hold, skip), never the open template. */
  extras: DecisionOption[]
  /** The first ready route, if any (the "suggested route" button). */
  suggested: DecisionOption | null
  /** Default Leading Model. */
  leaderId: ModelId | null
}
/** Describe a path decision so a drag can be turned into a full answer. Null when the options carry no unit. */
export function pathPlan(p: PendingDecision): PathPlan | null {
  if (!isPathKind(p.kind)) return null
  const tmpl = p.options.find((o) => o.id === 'path' || o.id === 'place') ?? p.options.find((o) => o.action.type === p.kind && typeof o.action['path'] === 'undefined' && typeof o.action['leaderId'] === 'undefined' && o.action['auto'] !== true)
  const base = tmpl ?? p.options.find((o) => o.action.type === p.kind)
  const ctxUnit = p.context['unitId']
  const unitId = (typeof base?.action['unitId'] === 'string' ? base.action['unitId'] : typeof ctxUnit === 'string' ? ctxUnit : null) as UnitId | null
  if (!base || !unitId) return null
  const fields: Record<string, unknown> = {}
  for (const [k, v] of Object.entries(base.action)) if (!STRIP.has(k)) fields[k] = v
  const ready = (o: DecisionOption) => o.action.type === p.kind && (Array.isArray(o.action['path']) || o.action['auto'] === true || o.id.startsWith('plan:') || o.id.startsWith('path:'))
  const suggested = p.options.find((o) => o.id === 'auto') ?? p.options.find((o) => o.id.startsWith('path:') || o.id.startsWith('plan:')) ?? null
  const extras = p.options.filter((o) => o !== tmpl && !ready(o))
  const leader = p.context['leaderId']
  return {
    type: p.kind === 'move.place' ? 'move.place' : p.kind, fields, unitId, shape: p.kind === 'move.place' ? 'dest' : 'path',
    extras, suggested, leaderId: typeof leader === 'string' ? leader : null,
  }
}

/** The payload (no decisionId/seat; game.answer fills them) that answers a path decision with a Leading Model and waypoints. */
export function pathPayload(plan: PathPlan, leaderId: ModelId, waypoints: readonly { x: number; z: number }[], placement?: Record<ModelId, { x: number; z: number }>): { type: string; [k: string]: unknown } {
  const end = waypoints[waypoints.length - 1]!
  const body = plan.shape === 'dest' ? { dest: { x: end.x, z: end.z } } : { path: waypoints.map((w) => ({ x: w.x, z: w.z })) }
  return { ...plan.fields, type: plan.type, leaderId, ...body, ...(placement ? { placement } : {}) }
}

/** Which option kinds expose a ready one-click choice even in table modes (Stop, Done, Decline, Skip...). */
export function sideOptions(p: PendingDecision): DecisionOption[] {
  const mode = classify(p)
  if (mode === 'list') return p.options
  if (mode === 'entry') return p.options
  if (mode === 'activate') return p.options.filter((o) => o.action.type === 'turn.pass')
  if (mode === 'path') return pathPlan(p)?.extras ?? p.options
  if (mode === 'target') {
    if (p.kind === 'shoot.batch') return p.options.filter((o) => o.action['done'] === true)
    return p.options.filter((o) => targetRefs(p.kind, o.action).length === 0)
  }
  if (mode === 'models') return p.options.filter((o) => modelRef(o.action) === null)
  return p.options.filter((o) => !isPointOption(o))
}
