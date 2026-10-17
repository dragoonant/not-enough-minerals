// Player-facing names and narration (our words). Names of units, weapons and cards come from data records. gameStore
// sets the context. No rules numbers are computed here: narration only restates cue payloads.
import type { EditionBundle } from '../../data/types'
import { allWeapons } from '../../engine/edition'
import type { GameEvent, GameState, ModelId, RoundPhase, SeatId, UnitId } from '../../engine/types'
import type { Cue } from './cues'
import { findAbility } from '../ui/skillInfo'

export type SeatControllerLabel = 'human' | 'bot'
interface LabelContext { bundle: EditionBundle | null; controllers: Record<SeatId, SeatControllerLabel>; seatOrder: SeatId[] }
let ctx: LabelContext = { bundle: null, controllers: {}, seatOrder: [] }

export function setLabelContext(c: Partial<LabelContext>): void { ctx = { ...ctx, ...c } }

/** "Player 1", "Player 2 (bot)". */
export function seatLabel(seat: SeatId | null | undefined): string {
  if (!seat) return 'Nobody'
  const i = ctx.seatOrder.indexOf(seat)
  const base = `Player ${i >= 0 ? i + 1 : seat}`
  return ctx.controllers[seat] === 'bot' ? `${base} (bot)` : base
}

const PHASES: Record<RoundPhase, string> = { movement: 'Movement Phase', assault: 'Assault Phase', combat: 'Combat Phase', scoring: 'Scoring Phase' }
/** "Movement Phase". */
export const phaseLabel = (p: RoundPhase | null | undefined): string => (p ? PHASES[p] : 'Set-up')

/** Unit name for a model (data record name), falling back to its profile id. */
export function modelName(state: GameState | null, id: ModelId | null | undefined): string {
  if (!id) return 'someone'
  const m = state?.models[id]
  if (!m) return id
  return dataName(m.profileId) || m.profileId
}

/** Unit name from its profile (data record name), falling back to its id. */
export function unitName(state: GameState | null, id: UnitId | null | undefined): string {
  if (!id) return 'a unit'
  const u = state?.units[id]
  return u ? dataName(u.profileId) || u.profileId : id
}

/** Record name for any data id (units, cards, missions, deployments, weapons inside units), falling back to the id. */
export function dataName(id: string | null | undefined): string {
  if (!id) return ''
  const b = ctx.bundle
  if (b) {
    for (const list of Object.values(b.records)) {
      const r = (list as { id: string; name?: string }[]).find((x) => x.id === id)
      if (r?.name) return r.name
    }
    for (const u of b.records.units) {
      const w = allWeapons(u).find((x) => x.id === id)
      if (w?.name) return w.name
    }
  }
  return id
}

const CAUSES: Record<string, string> = { attack: '', coherency: ' (out of coherency)', reserveSweep: ' (left in Reserves)', ability: ' (an ability)', morph: ' (morphing)', other: '' }

/** One feed line per cue (null = nothing worth a line). */
export function narrate(state: GameState | null, cue: Cue): string | null {
  const un = (id: UnitId | null | undefined) => unitName(state, id)
  switch (cue.kind) {
    case 'banner': return cue.text
    case 'move': { // one line per unit (its first moving model); Move, Run and Disengage read differently, others stay quiet
      if (!cue.lead) return null
      const verb = cue.how === 'run' ? 'runs' : cue.how === 'disengage' ? 'breaks away' : cue.how === 'move' ? 'advances' : null
      return verb ? `${un(cue.unitId)} ${verb}.` : null
    }
    case 'dice': return `${rollLabel(cue.purpose)}: ${cue.dice.map((d) => d.face).join(', ')}.`
    case 'attack': return `${un(cue.attackerUnitId)} fires ${dataName(cue.weaponId)} at ${un(cue.targetUnitId)}.`
    case 'attackStage': return stageLine(cue)
    case 'casualties': {
      const n = cue.modelIds.length
      return `${un(cue.unitId)} loses ${n} model${n === 1 ? '' : 's'}${CAUSES[cue.cause] ?? ''}${cue.destroyed ? ' and is destroyed' : ''}.`
    }
    case 'charge':
      switch (cue.stage) {
        case 'declared': return `${un(cue.unitId)} declares a charge on ${cue.targets.map(un).join(' and ')}.`
        case 'rolled': return cue.distance !== undefined ? `${un(cue.unitId)} can charge up to ${cue.distance}".` : null
        case 'succeeded': return `${un(cue.unitId)} crashes into combat.`
        case 'failed': return `${un(cue.unitId)}'s charge falls short.`
        case 'impact': return `${un(cue.unitId)} hits with impact.`
      }
      return null
    case 'arrival':
      return cue.stage === 'arrived' ? `${un(cue.unitId)} arrives on the table.` : cue.stage === 'returned' ? `${un(cue.unitId)} returns to Reserves.` : null
    case 'activation': return `${seatLabel(cue.seat)} activates ${un(cue.unitId)}.`
    case 'passed': return `${seatLabel(cue.seat)} passes.`
    case 'initiative':
      return cue.why === 'rollOff' ? `${seatLabel(cue.seat)} wins the Roll-Off.` : `${seatLabel(cue.seat)} takes the First Player Marker.`
    case 'marker':
      if (cue.change === 'control') return cue.to ? `${seatLabel(cue.to)} controls marker ${cue.n}.` : `Marker ${cue.n} is no longer controlled.`
      return `${un(cue.unitId)} ${cue.change === 'claimed' ? 'claims' : 'drops'} marker ${cue.n}.`
    case 'score':
      return cue.source === 'round' ? `${seatLabel(cue.seat)} scores ${cue.vp} VP this round.` : `${seatLabel(cue.seat)} gains ${cue.vp} VP.`
    case 'note': return noteLine(state, cue.event)
  }
}

function stageLine(cue: Extract<Cue, { kind: 'attackStage' }>): string | null {
  const d = cue.data
  switch (d.step) {
    case 'hit': return `${d.hits} hit${d.hits === 1 ? '' : 's'}${d.precision ? ` (+${d.precision} by precision)` : ''}.`
    case 'surge': return d.tagMatch ? `Surge! ${d.surgeMoved} die moved to damage${d.critMoved ? `, ${d.critMoved} critical` : ''}.` : null
    case 'armour': return d.tn === null ? null : `Armour saves ${d.saved}.`
    case 'evade': return d.eligible ? `Evades ${d.evaded}.` : null
    case 'damage': return d.total > 0 ? `${d.newDamage ?? d.total} damage.` : 'No damage.'
    case 'impact': return `Impact: ${d.passed} hit${d.passed === 1 ? '' : 's'}.`
  }
}

/** Condition and status ids to words. */
export const conditionWord = (c: string): string => c.replace(/_/g, ' ')

/** Ability-use notes: tolerant of the event shape (type 'ability.use' / 'ability.action' / 'abilityUsed', ability id under
 *  abilityId, ability or id; holder under source, unitId or cardId). Anything else stays quiet. */
function noteLine(state: GameState | null, event: GameEvent): string | null {
  const e = event as Record<string, unknown>
  const type = typeof e['type'] === 'string' ? (e['type'] as string) : ''
  if (!/^(ability[.:_]?(use|used|action)|abilityUsed|usesAbility)/i.test(type)) return null
  const str = (...ks: string[]): string | null => { for (const k of ks) if (typeof e[k] === 'string' && e[k]) return e[k] as string; return null }
  const abilityId = str('abilityId', 'ability', 'id')
  if (!abilityId) return null
  const holder = str('source', 'unitId', 'cardId', 'holder')
  const hit = ctx.bundle ? findAbility(ctx.bundle, state, abilityId, holder) : null
  const name = hit?.ability.name ?? dataName(abilityId)
  if (holder && state?.units[holder]) return `${unitName(state, holder)} uses ${name}.`
  return hit?.cardName ? `${hit.cardName}: ${name}.` : `${name} is used.`
}

/** Roll purpose to a short label for the dice tray. */
export function rollLabel(purpose: string): string {
  const head = purpose.split(':')[0] ?? purpose
  const words: Record<string, string> = {
    test: 'Test roll', hit: 'Attack roll', surge: 'Surge die', armour: 'Armour roll', evade: 'Evade roll', impact: 'Impact roll',
    charge: 'Charge roll', initiative: 'Roll-Off', map: 'Map roll', draft: 'Draft Roll-Off', draftCard: 'Draft card',
  }
  return words[head] ?? head.charAt(0).toUpperCase() + head.slice(1)
}
