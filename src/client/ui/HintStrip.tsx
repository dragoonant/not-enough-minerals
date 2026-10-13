// First-turn tip for the decision in front of a new player (Round 1 only), dismissible per decision kind. Rendered inside
// the decision panel (interaction/Prompt.tsx) so it never floats over the table or under the panel.
import { useState } from 'react'
import type { PendingDecision } from '../../engine/types'
import { useEpoch, usePresentedTurn } from '../contract'
import { hintFor } from './hudView'

/** Kinds dismissed this game (module state: the panel remounts per decision). */
const dismissed: { epoch: number; kinds: string[] } = { epoch: -1, kinds: [] }

/** One dismissible tip for the decision in front of a new player (Round 1 only). */
export function HintStrip({ pending }: { pending: PendingDecision | null }) {
  const turn = usePresentedTurn()
  const epoch = useEpoch()
  const [, bump] = useState(0)
  if (dismissed.epoch !== epoch) { dismissed.epoch = epoch; dismissed.kinds = [] }
  const kinds = dismissed.kinds
  const text = pending && turn.round <= 1 && !kinds.includes(pending.kind) ? hintFor(pending.kind) : null
  if (!text || !pending) return null
  return (
    <div className="hint" data-testid="first-turn-hint" role="note">
      <span>{text}</span>
      <button className="quiet mini" aria-label="Dismiss tip" data-testid="hint-dismiss" onClick={() => { dismissed.kinds = [...kinds, pending.kind]; bump((n) => n + 1) }}>Got it</button>
    </div>
  )
}

