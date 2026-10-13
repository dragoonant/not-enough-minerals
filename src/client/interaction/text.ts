// Player-facing text helpers for the interaction layer: engine option labels carry raw ids ("Fire gauss-rifle at A3"); the
// screen shows record names with a short tag so two squads of one kind stay distinguishable.
import { data, dataName, seatLabel, unitName } from '../contract'
import type { GameState, UnitId } from '../../engine/types'

/** "Marine (A3)". */
export function unitTag(state: GameState | null, id: UnitId): string {
  const n = unitName(state, id)
  return n === id ? id : `${n} (${id})`
}

const esc = (s: string): string => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')

/** Swap model, unit and weapon ids inside an engine label for names. Longest ids first so "A1.2" wins over "A1". */
export function prettify(state: GameState | null, text: string): string {
  if (!state) return text
  let out = text
  const swap = (ids: string[], name: (id: string) => string) => {
    for (const id of ids.sort((a, b) => b.length - a.length)) {
      if (!out.includes(id)) continue
      out = out.replace(new RegExp(`(?<![\\w.-])${esc(id)}(?![\\w-]|\\.\\d)`, 'g'), name(id))
    }
  }
  swap(Object.keys(state.models), (id) => `a ${unitName(state, state.models[id]?.unitId)} model`.replace(/^a (?=[AEIOU])/, 'an '))
  swap(Object.keys(state.units), (id) => unitTag(state, id))
  const weapons = new Set<string>()
  for (const m of Object.values(state.models)) for (const w of m.weapons) weapons.add(w)
  swap([...weapons], (id) => dataName(id))
  // Seat ids ("A activates first"): only a bare seat id followed by a lower-case word, so the article "A Marine" stays.
  for (const seat of state.seatOrder) out = out.replace(new RegExp(`(^|[ (])${esc(seat)}(?= [a-z])`, 'g'), (_m, pre: string) => `${pre}${seatLabel(seat)}`)
  return out
}

/** Round a displayed expectation to one decimal, dropping a trailing .0. */
export const oneDp = (n: number): string => (Math.round(n * 10) / 10).toString()
export const percent = (p: number): string => `${Math.round(p * 100)}%`

/** Turn an engine rejection into a reason with numbers and names. `edge` names the entry edge for a deploy ("top edge"). */
export function explainRejection(state: GameState | null, code: string, text: string, detail: string, edge: string | null): string {
  const m = /path ([\d.]+)"? exceeds ([\d.]+)"/.exec(detail)
  if (code === 'E_TOO_FAR' && m) {
    const len = oneDp(Number(m[1])), max = oneDp(Number(m[2]))
    return edge ? `Too far: ${len}" from the ${edge}, the most allowed is ${max}".` : `Too far: that route is ${len}" and the most allowed is ${max}".`
  }
  const blocker = /blocked by ([\w.-]+)|(?:beside|past) ([\w.-]+)|^([\w.-]+) blocks/.exec(detail)
  if (code === 'E_PATH_BLOCKED' && blocker) {
    const id = blocker[1] ?? blocker[2] ?? blocker[3] ?? ''
    return `The way is blocked by ${state?.units[id] ? unitTag(state, id) : state?.models[id] ? 'a model of ' + unitTag(state, state.models[id]!.unitId) : id}.`
  }
  if (code === 'E_BASE_OVERLAP') return `Bases would overlap there. ${prettify(state, detail)}`.trim()
  const d = prettify(state, detail).trim()
  return d && d !== text ? `${text} ${d}` : text
}

/** For a decision opened by an ability (ability.target): the ability's name and its first sentence, or null. */
export function abilityHeading(state: GameState | null, context: Record<string, unknown>): { name: string; line: string } | null {
  const cont = context['cont'] as { ctx?: { sourceId?: string; unitId?: string | null }; flow?: { abilityId?: string; unitId?: string | null } } | undefined
  const src = cont?.flow?.abilityId ?? cont?.ctx?.sourceId
  const uid = cont?.flow?.unitId ?? cont?.ctx?.unitId
  const unit = uid ? state?.units[uid] : undefined
  const def = unit ? data.unit(unit.profileId) : undefined
  const a = def && src ? data.abilities(def).find((x) => x.id === src) : undefined
  if (!a) return typeof context['prompt'] === 'string' ? { name: context['prompt'] as string, line: '' } : null
  const first = a.text.split(/(?<=[.!?])\s/)[0] ?? ''
  return { name: a.name, line: first.length > 140 ? `${first.slice(0, 137)}...` : first }
}
