// Pure view helpers for the dice tray (no React, no store). M0 shows plain D6 rolls; M2 adds the attack verdict (hits,
// Surge, damage) from the attack cue that follows a roll, never by re-reading the dice itself.
import type { CueOf, RolledDie } from '../contract'

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

/** Our own pip glyphs for a D6 face (falls back to the number). */
export const D6_GLYPH = ['', '⚀', '⚁', '⚂', '⚃', '⚄', '⚅'] as const

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

export function viewRoll(cue: CueOf<'dice'>, label: string): RollView {
  const dice = viewDice(cue.dice)
  return { label, dice, rerolled: dice.some((d) => d.reroll) }
}
