// Event feed view model (pure). The presentation layer logs one terse line per cue; this turns the cue stream into what a
// first-time player needs to read: header lines per Round and Phase, one narrated line per unit action with its result,
// labelled roll-offs, and no empty save lines. It restates cue payloads only; no rules number is computed here.
import type { GameState } from '../../engine/types'
import type { Cue } from '../presentation/cues'
import type { FeedEntry } from '../presentation/presentedStore'
import { abilityNote, dataName, phaseLabel, seatLabel, unitName } from '../presentation/labels'

/** `skill`: the line names an ability (the feed shows its name with a tooltip). */
export interface FeedLine { id: number; text: string; head?: boolean; skill?: { abilityId: string; source: string | null; name: string; before: string; after: string } }

const entryWords = (cue: Extract<Cue, { kind: 'arrival' }>): string => {
  const e = cue.entry
  if (!e) return 'onto the table'
  switch (e.kind) {
    case 'edge': return typeof e.segment === 'number' ? `from Entry Edge ${e.segment + 1}` : 'from an Entry Edge'
    case 'friendlyEdge': return 'from its own table edge'
    case 'nonEntryEdge': return 'from a table edge that is not an Entry Edge'
    case 'indicator': return e.ref ? `through ${dataName(e.ref)}` : 'through an indicator'
    case 'place': return e.ref ? `onto ${/^\d+$/.test(e.ref) ? `marker ${e.ref}` : dataName(e.ref)}` : 'onto the table'
  }
}

const faces = (dice: { face: number }[]): string => dice.map((d) => d.face).join(', ')

/** Lines for the feed, oldest first. `fallback` is the stock narration for cues this view does not rewrite. */
export function feedLines(feed: readonly FeedEntry[], state: GameState | null): FeedLine[] {
  const out: FeedLine[] = []
  let head = ''
  const moved = new Set<string>()
  const un = (id: string | null | undefined) => unitName(state, id)
  const header = (id: number, round: number, phase: string | null): void => {
    const key = `${round}:${phase ?? ''}`
    if (key === head) return
    head = key
    out.push({ id, head: true, text: phase ? `Round ${round}: ${phaseLabel(phase as never)}` : `Round ${round}` })
  }
  for (const f of feed) {
    const c = f.cue
    switch (c.kind) {
      case 'banner':
        if (c.tone === 'phase') header(f.id, c.round, c.phase)
        else if (c.tone === 'round') continue
        else if (c.tone !== 'turn' && f.text) out.push({ id: f.id, text: f.text })
        continue
      case 'score':
        if (c.source === 'round') {
          header(f.id, c.round, 'scoring')
          out.push({ id: f.id, text: c.vp > 0 ? `${seatLabel(c.seat)} scores ${c.vp} VP for Round ${c.round}.` : `${seatLabel(c.seat)} scores nothing this Round.` })
        } else if (f.text) out.push({ id: f.id, text: f.text })
        continue
      case 'activation':
        moved.clear()
        out.push({ id: f.id, text: `${seatLabel(c.seat)} activates ${un(c.unitId)}.` })
        continue
      case 'move': {
        const u = c.unitId
        if (u && !moved.has(u)) { moved.add(u); out.push({ id: f.id, text: `${un(u)} moves.` }) }
        continue
      }
      case 'arrival':
        if (c.stage === 'arrived') out.push({ id: f.id, text: `${un(c.unitId)} deploys ${entryWords(c)}.` })
        else if (f.text) out.push({ id: f.id, text: f.text })
        continue
      case 'dice':
        if (c.purpose.startsWith('initiative')) out.push({ id: f.id, text: `Roll-Off for who goes first (highest wins): ${faces(c.dice)}.` })
        else if (c.purpose.startsWith('draft')) out.push({ id: f.id, text: `Draft Roll-Off: ${faces(c.dice)}.` })
        else if (f.text) out.push({ id: f.id, text: f.text })
        continue
      case 'initiative':
        if (!c.seat) continue
        out.push({ id: f.id, text: c.why === 'rollOff' ? `${seatLabel(c.seat)} wins the Roll-Off.` : `${seatLabel(c.seat)} takes the First Player Marker.` })
        continue
      case 'attackStage': {
        const d = c.data
        if (d.step === 'armour' && d.saved === 0) continue
        if (d.step === 'evade' && d.eligible && d.evaded === 0) continue
        if (f.text) out.push({ id: f.id, text: f.text })
        continue
      }
      case 'note': {
        const n = abilityNote(state, c.event)
        if (n) out.push({ id: f.id, text: n.text, skill: { abilityId: n.abilityId, source: n.source, name: n.name, before: n.before, after: n.after } })
        else if (f.text) out.push({ id: f.id, text: f.text })
        continue
      }
      default:
        if (f.text) out.push({ id: f.id, text: f.text })
    }
  }
  return out
}
