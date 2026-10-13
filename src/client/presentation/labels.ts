// Player-facing names and narration (our words). Names of units, weapons and cards come from data records. gameStore
// sets the context. No rules numbers are computed here: narration only restates cue payloads.
import type { EditionBundle } from '../../data/types'
import { allWeapons } from '../../engine/edition'
import type { GameEvent, GameState, ModelId, RoundPhase, SeatId, UnitId } from '../../engine/types'
import type { Cue } from './cues'

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
    case 'move': return null // one line per unit comes from the activation; per-model moves would flood the feed
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
    case 'note': return noteLine(cue.event)
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

function noteLine(_event: GameEvent): string | null {
  return null
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
