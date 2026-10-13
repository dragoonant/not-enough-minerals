// dice.ts: the one dice service (spec 13 s1-4; spec 00 s4 "Dice"). Every die comes from rng.roll(); every Test (Hit,
// Armour, Evade, Impact) goes through test(); every die carries `rerolled`. Also the exact-odds helpers query.ts and the
// AI use (never sampled). Checklist groups: DICE (DICE-001..032), MOD-004 (clamp), part of ATK-040 / CHG-003.
import type { DiceExpr, EditionBundle } from '../data/types'
import { rule } from './edition'
import { reject } from './errors'
import { roll, type DiceRolled } from './rng'
import type { Die, GameState, Id, Mod, Rejection, RollPurpose, SeatId } from './types'

// ---------------------------------------------------------------- target numbers
/** Clamp a TN to rules.json tnClamp ([2, 6]): no modifier makes a test impossible or automatic (DICE-022). */
export function clampTN(b: EditionBundle, tn: number): number {
  const [lo, hi] = rule(b, 'tnClamp')
  return Math.min(hi, Math.max(lo, tn))
}

/** Final TN = clamp(base - sum(mods)) (DICE-020/021). A modifier value > 0 makes the roll easier ("+1 to Hit").
 *  A Mod with mode 'set' replaces the base first. Base null ("-") -> null: no roll is possible (DICE-024).
 *  Stacking (keywords keep the highest X, same-named sources once) is effects.statOf's job, before this. */
export function finalTN(b: EditionBundle, base: number | null, mods: readonly (number | Mod)[] = []): number | null {
  if (base === null) return null
  let tn = base
  for (const m of mods) if (typeof m !== 'number' && m.mode === 'set') tn = m.value
  for (const m of mods) tn -= typeof m === 'number' ? m : m.mode === 'add' ? m.value : 0
  return clampTN(b, tn)
}

/** Natural 6 always succeeds, natural 1 always fails (DICE-023); otherwise face >= TN. TN null always fails. */
export function succeeds(face: number, tn: number | null): boolean {
  if (tn === null) return false
  if (face >= 6) return true
  if (face <= 1) return false
  return face >= tn
}

// ---------------------------------------------------------------- rolling
export interface Rolled { state: GameState; dice: Die[]; event: DiceRolled }

/** Roll `count` D6 as Die objects (ids `<rollId>.<i>`). count <= 0 rolls nothing and returns `event: null`. */
export function rollDice(state: GameState, count: number, purpose: RollPurpose, ownerId?: Id, group?: number): { state: GameState; dice: Die[]; event: DiceRolled | null } {
  if (count <= 0) return { state, dice: [], event: null }
  const r = roll(state, { count, sides: 6, purpose, ownerId })
  const dice = r.event.dice.map((face, i): Die => ({ id: `${r.event.rollId}.${i}`, face, rerolled: false, ...(group !== undefined ? { group } : {}) }))
  return { state: r.state, dice, event: r.event }
}

export interface TestSpec {
  count: number
  /** Final TN (from finalTN); null = the characteristic is "-": no dice are rolled and every die fails. */
  tn: number | null
  purpose: RollPurpose
  ownerId?: Id
  group?: number
}
export interface TestResult {
  state: GameState
  dice: Die[]
  successes: Die[]
  failures: Die[]
  /** Number of failed dice (equals `count` on an automatic failure, where no dice exist). */
  failCount: number
  successCount: number
  autoFail: boolean
  event: DiceRolled | null
}

/** THE test primitive (DICE-030/032): roll `count` dice against `tn`. The hit, armour, evade and impact steps all call
 *  it; dice with different TNs inside one Batch are separate calls (one per DieGroup). */
export function test(state: GameState, b: EditionBundle, spec: TestSpec): TestResult {
  if (spec.tn === null || spec.count <= 0) {
    return { state, dice: [], successes: [], failures: [], failCount: spec.tn === null ? Math.max(0, spec.count) : 0, successCount: 0, autoFail: spec.tn === null, event: null }
  }
  const tn = clampTN(b, spec.tn)
  const r = rollDice(state, spec.count, spec.purpose, spec.ownerId, spec.group)
  const successes = r.dice.filter((d) => succeeds(d.face, tn))
  const failures = r.dice.filter((d) => !succeeds(d.face, tn))
  return { state: r.state, dice: r.dice, successes, failures, failCount: failures.length, successCount: successes.length, autoFail: false, event: r.event }
}

/** Re-roll one die (DICE-010/011/012): the new face always replaces the old. A die already re-rolled the rules.json
 *  maxRerollsPerDie times is refused with E_USED. The returned die keeps its id and has `rerolled: true`. */
export function reroll(state: GameState, b: EditionBundle, die: Die, purpose: RollPurpose, ownerId?: Id): { state: GameState; die: Die; event: DiceRolled } | Rejection {
  if (die.rerolled && rule(b, 'maxRerollsPerDie') <= 1) return reject('E_USED', `Die ${die.id} was already re-rolled.`)
  const r = roll(state, { count: 1, sides: 6, purpose, ownerId })
  return { state: r.state, die: { ...die, face: r.event.dice[0]!, rerolled: true }, event: r.event }
}

/** D3 from a D6 face: 1-2 -> 1, 3-4 -> 2, 5-6 -> 3 (DICE-002). */
export const d3 = (face: number): number => Math.ceil(face / 2)

/** Parse a printed dice expression: "D3", "D6", "2D6", "D3+1". Null when malformed. */
export function parseDice(expr: DiceExpr): { n: number; sides: 3 | 6; plus: number } | null {
  const m = /^([1-9]?)D(3|6)(?:\+([1-9]))?$/.exec(expr)
  if (!m) return null
  return { n: m[1] ? Number(m[1]) : 1, sides: m[2] === '3' ? 3 : 6, plus: m[3] ? Number(m[3]) : 0 }
}

/** Generate a value from a dice expression (DICE-003/025, Surge Dice, damage): fixed additions are not clamped and no
 *  modifiers apply (DICE-031). A D3 is a halved D6, so the event shows the D6 faces. */
export function rollExpr(state: GameState, expr: DiceExpr, purpose: RollPurpose, ownerId?: Id): { state: GameState; value: number; dice: Die[]; event: DiceRolled } | Rejection {
  const p = parseDice(expr)
  if (!p) return reject('E_BAD_PARAM', `Bad dice expression "${expr}".`)
  const r = roll(state, { count: p.n, sides: 6, purpose, ownerId })
  const dice = r.event.dice.map((face, i): Die => ({ id: `${r.event.rollId}.${i}`, face, rerolled: false }))
  const value = dice.reduce((s, d) => s + (p.sides === 3 ? d3(d.face) : d.face), 0) + p.plus
  return { state: r.state, value, dice, event: r.event }
}

/** Roll-Off (DICE-004): each seat rolls 2D6; the higher total wins; ties roll again until someone wins. Every throw is
 *  returned for the dice tray. Not a decision (spec 00 s3.1). */
export function rollOff(state: GameState, seats: readonly [SeatId, SeatId], purpose: RollPurpose): { state: GameState; winner: SeatId; events: DiceRolled[] } {
  let s = state
  const events: DiceRolled[] = []
  for (;;) {
    const a = roll(s, { count: 2, sides: 6, purpose, ownerId: seats[0] }); s = a.state
    const c = roll(s, { count: 2, sides: 6, purpose, ownerId: seats[1] }); s = c.state
    events.push(a.event, c.event)
    if (a.event.total !== c.event.total) return { state: s, winner: a.event.total > c.event.total ? seats[0] : seats[1], events }
  }
}

// ---------------------------------------------------------------- exact odds (query.ts, AI)
/** P(one die passes a test at `tn`), natural 1/6 included. tn null -> 0. */
export function pSuccess(tn: number | null): number {
  if (tn === null) return 0
  let n = 0
  for (let f = 1; f <= 6; f++) if (succeeds(f, tn)) n++
  return n / 6
}

/** P(one D6 shows at least `need`) for value generation (Charge Roll): no natural 1/6 rule. */
export const pAtLeast = (need: number): number => (need <= 1 ? 1 : need > 6 ? 0 : (7 - need) / 6)

/** Distribution (index = value) of the number of successes among n independent dice with success chance p. */
export function binomial(n: number, p: number): number[] {
  let dist = [1]
  for (let i = 0; i < n; i++) dist = convolve(dist, [1 - p, p])
  return dist
}

/** Distribution of a sum of two independent variables (index = value). */
export function convolve(a: readonly number[], b: readonly number[]): number[] {
  const out = new Array<number>(a.length + b.length - 1).fill(0)
  for (let i = 0; i < a.length; i++) for (let j = 0; j < b.length; j++) out[i + j]! += a[i]! * b[j]!
  return out
}

/** Distribution (index = value) of a dice expression ("D3", "2D6", "D3+1"). Null when malformed. */
export function exprDistribution(expr: DiceExpr): number[] | null {
  const p = parseDice(expr)
  if (!p) return null
  const one = new Array<number>(p.sides + 1).fill(0)
  for (let f = 1; f <= 6; f++) one[p.sides === 3 ? d3(f) : f]! += 1 / 6
  let dist = [1]
  for (let i = 0; i < p.n; i++) dist = convolve(dist, one)
  return [...new Array<number>(p.plus).fill(0), ...dist]
}

/** Distribution of min(X, cap) (e.g. Surge moves never more dice than the Armour Pool holds). */
export function capAt(dist: readonly number[], cap: number): number[] {
  const out = new Array<number>(Math.max(0, cap) + 1).fill(0)
  dist.forEach((p, v) => { out[Math.min(v, cap)]! += p })
  return out
}

/** Mean of a distribution. */
export const mean = (dist: readonly number[]): number => dist.reduce((s, p, v) => s + p * v, 0)
/** P(X >= k). */
export const atLeastP = (dist: readonly number[], k: number): number => dist.reduce((s, p, v) => (v >= k ? s + p : s), 0)
