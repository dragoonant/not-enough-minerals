// Pure view helpers for the dice tray (no React, no store). The tray shows the working of an attack from the
// atk.stage payloads the engine logged (carried by attackStage cues); it never rolls or re-derives a rules number.
// Colouring uses the engine's own dice.succeeds (natural 6 wins, natural 1 fails, null TN fails), re-exported by the contract.
import { dieSucceeds, type AtkStageData, type CueOf, type RolledDie, type ShownRoll } from '../contract'

export interface DieView {
  key: string
  sides: number
  face: number
  /** Big text on the die. */
  text: string
  reroll: boolean
  /** Replaced by a later re-roll in the same roll. */
  superseded: boolean
}

export interface RollView {
  label: string
  dice: DieView[]
  rerolled: boolean
}

export function viewDice(dice: readonly RolledDie[]): DieView[] {
  const out: DieView[] = dice.map((d, i) => ({ key: `${d.rollId}:${i}`, sides: d.sides, face: d.face, text: String(d.face), reroll: d.reroll, superseded: false }))
  // A re-roll die replaces the earliest still-counting die rolled before it.
  out.forEach((d, i) => {
    if (!d.reroll) return
    const prev = out.find((p, j) => j < i && !p.reroll && !p.superseded)
    if (prev) prev.superseded = true
  })
  return out
}

export function viewRoll(cue: Pick<CueOf<'dice'>, 'dice'>, label: string): RollView {
  const dice = viewDice(cue.dice)
  return { label, dice, rerolled: dice.some((d) => d.reroll) }
}

// ---------------------------------------------------------------- the working of one attack (Batch)
type Stage<S extends AtkStageData['step']> = Extract<AtkStageData, { step: S }>
export interface PlainDie { key: string; face: number; /** Meets the printed TN. */ pass: boolean | null }

export interface HitGroupView { tn: number | null; dice: PlainDie[] }
export interface BatchView {
  batchId: string
  weaponId: string | null
  /** Attack Dice grouped by the Hit TN they were rolled against. */
  attack: { groups: HitGroupView[]; hits: number; precision: number } | null
  /** The Surge Die and what it did. */
  surge: { face: number | null; result: number; match: boolean | null; moved: number; crit: number; dodge: number } | null
  armour: { tn: number | null; dice: PlainDie[]; saved: number; tough: number; toDamage: number } | null
  evade: { eligible: false; reasons: string[] } | { eligible: true; tn: number | null; dice: PlainDie[]; evaded: number; remaining: number } | null
  /** Damage line: "marker + new = total". */
  damage: { dice: number; perDie: number | null; marker: number | null; newDamage: number | null; total: number } | null
  impact: { dice: PlainDie[]; passed: number } | null
  /** Totals strip, from the stage payloads only. */
  totals: { hits: number | null; saved: number | null; evaded: number | null; damage: number | null }
}

/** `neutral` leaves pass null (Impact dice: the payload gives only the count that passed). */
const plain = (key: string, faces: readonly number[], tn: number | null, neutral = false): PlainDie[] =>
  faces.map((face, i) => ({ key: `${key}:${i}`, face, pass: neutral ? null : dieSucceeds(face, tn) }))

/** "needs 4+" for a pool's target number; "automatic fail" when there is none. */
export const needsText = (tn: number | null): string => (tn === null ? 'no target number (every die fails)' : `needs ${tn}+`)

/** Rolls of one Batch that were shown up to and including `upTo`, folded into one view. */
export function buildBatchView(log: readonly ShownRoll[], upTo: ShownRoll, hideCurrent = false): BatchView | null {
  if (upTo.cue.kind !== 'attackStage') return null
  const batchId = upTo.cue.batchId
  const seen = new Set<number>()
  const rows: ShownRoll[] = []
  for (const r of [...log, upTo]) {
    if (r.id > upTo.id || (hideCurrent && r.id === upTo.id) || seen.has(r.id) || r.cue.kind !== 'attackStage' || r.cue.batchId !== batchId) continue
    seen.add(r.id); rows.push(r)
  }
  const v: BatchView = { batchId, weaponId: upTo.cue.weaponId, attack: null, surge: null, armour: null, evade: null, damage: null, impact: null, totals: { hits: null, saved: null, evaded: null, damage: null } }
  for (const r of rows) {
    const cue = r.cue as CueOf<'attackStage'>
    const d = cue.data
    const k = `${batchId}:${r.id}`
    switch (d.step) {
      case 'hit': {
        const s = d as Stage<'hit'>
        v.attack = { groups: s.groups.map((g, gi) => ({ tn: g.tn, dice: plain(`${k}:g${gi}`, g.faces, g.tn) })), hits: s.hits, precision: s.precision }
        v.surge = { face: s.surge.die, result: s.surge.result, match: null, moved: 0, crit: 0, dodge: 0 }
        v.totals.hits = s.hits
        break
      }
      case 'surge': {
        const s = d as Stage<'surge'>
        v.surge = { face: v.surge?.face ?? null, result: s.surgeResult, match: s.tagMatch, moved: s.surgeMoved, crit: s.critMoved, dodge: s.dodge }
        break
      }
      case 'armour': {
        const s = d as Stage<'armour'>
        v.armour = { tn: s.tn, dice: plain(`${k}:a`, s.dice, s.tn), saved: s.saved, tough: s.tough, toDamage: s.toDamage }
        v.totals.saved = s.saved
        break
      }
      case 'evade': {
        if (d.eligible) {
          const s = d as Extract<Stage<'evade'>, { eligible: true }>
          v.evade = { eligible: true, tn: s.tn, dice: plain(`${k}:e`, s.dice, s.tn), evaded: s.evaded, remaining: s.remaining }
          v.totals.evaded = s.evaded
        } else v.evade = { eligible: false, reasons: d.reasons }
        break
      }
      case 'damage': {
        const s = d as Stage<'damage'>
        v.damage = { dice: s.dice, perDie: s.perDie ?? null, marker: s.marker ?? null, newDamage: s.newDamage ?? null, total: s.total }
        v.totals.damage = s.total
        break
      }
      case 'impact': {
        const s = d as Stage<'impact'>
        v.impact = { dice: plain(`${k}:i`, s.dice, null, true), passed: s.passed }
        v.totals.hits = (v.totals.hits ?? 0) + s.passed
        break
      }
    }
  }
  return v
}

/** The damage line in words: "2 old + 3 new = 5". */
export function damageLine(d: NonNullable<BatchView['damage']>): string {
  if (d.total <= 0 && !d.dice) return 'No damage'
  if (d.marker !== null && d.newDamage !== null) return `${d.marker} marked + ${d.newDamage} new = ${d.total}`
  return `${d.total} damage`
}

/** Label for a plain roll: whose die it was ("Player 1: Roll-Off"), with what it needed when known. */
export function plainTitle(label: string, owner: string | null, needed: number | null): string {
  return `${owner ? `${owner}: ` : ''}${label}${needed !== null ? ` (needed ${needed})` : ''}`
}
