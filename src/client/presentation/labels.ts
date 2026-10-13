// Player-facing names and narration (our words). Names of units come from data records. gameStore sets the context.
import type { EditionBundle } from '../../data/types'
import type { GameEvent, GameState, ModelId, SeatId } from '../../engine/types'
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

/** Unit name for a model (data record name), falling back to its profile id. */
export function modelName(state: GameState | null, id: ModelId | null | undefined): string {
  if (!id) return 'someone'
  const m = state?.models[id]
  if (!m) return id
  const rec = ctx.bundle?.records.units.find((u) => u.id === m.profileId)
  return rec?.name ?? m.profileId
}

/** Record name for any data id, falling back to the id. */
export function dataName(id: string | null | undefined): string {
  if (!id) return ''
  const b = ctx.bundle
  if (b) for (const list of Object.values(b.records)) {
    const r = (list as { id: string; name?: string }[]).find((x) => x.id === id)
    if (r?.name) return r.name
  }
  return id
}

/** One feed line per cue (null = nothing worth a line). */
export function narrate(state: GameState | null, cue: Cue): string | null {
  const n = (id: string | undefined) => modelName(state, id)
  switch (cue.kind) {
    case 'banner': return cue.text
    case 'move': return `${n(cue.modelId)} moves.`
    case 'dice': return `${rollLabel(cue.purpose)}: ${cue.dice.map((d) => d.face).join(', ')}.`
    case 'attack': return `${n(cue.attackerId)} attacks ${n(cue.targetId)} with ${dataName(cue.weaponId)}: ${cue.success ? 'hit' : 'miss'}.`
    case 'damage':
      if (cue.applied <= 0) return `${n(cue.targetId)} takes no damage.`
      return `${n(cue.targetId)} takes ${cue.applied} damage${cue.removed ? ' and is removed' : ''}.`
    case 'removed': return `${n(cue.modelId)} is removed from the table.`
    case 'condition': return `${n(cue.modelId)} ${cue.added ? 'gains' : 'loses'} ${conditionWord(cue.condition)}.`
    case 'note': return noteLine(cue.event)
  }
}

/** Condition ids to words (M2 fills this from the rules spec). */
const CONDITION_WORDS: Record<string, string> = {}
export const conditionWord = (c: string): string => CONDITION_WORDS[c] ?? c

function noteLine(event: GameEvent): string | null {
  const ev = event as { type: string; [k: string]: unknown }
  switch (ev.type) {
    case 'passed': return `${seatLabel(typeof ev.seat === 'string' ? ev.seat : null)} passes.`
    default: return null
  }
}

/** Roll purpose to a short label for the dice tray. */
export function rollLabel(purpose: string): string {
  const head = purpose.split(':')[0] ?? purpose
  const words: Record<string, string> = { test: 'Test roll', hit: 'Hit roll', damage: 'Damage roll', surge: 'Surge' }
  return words[head] ?? head.charAt(0).toUpperCase() + head.slice(1)
}
