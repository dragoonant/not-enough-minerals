// Dice tray: a DOM overlay with the latest roll (D6 faces), re-roll marks, and a toggleable dice log. Dice tumble until
// the beat ends. M2 adds the attack verdict line (hits, Surge, damage) from the attack cue.
import { useEffect, useMemo, useState } from 'react'
import { directorNow, rollLabel, useDiceLog, useShownRoll, type ShownRoll } from '../contract'
import './dice.css'
import { viewRoll, type DieView, type RollView } from './diceView'

function Die({ d, rolling }: { d: DieView; rolling: boolean }) {
  const cls = ['die', d.reroll && 'die-reroll', d.superseded && 'die-old', rolling && 'die-rolling'].filter(Boolean).join(' ')
  const title = [`d${d.sides} rolled ${d.face}`, d.reroll ? 're-roll' : '', d.superseded ? 'replaced' : ''].filter(Boolean).join(', ')
  return (
    <span className={cls} title={title} aria-label={title} data-testid={`die-${d.key}`} data-face={d.face}>
      <b>{d.text}</b>
    </span>
  )
}

/** True while the roll's tumble plays; ticks once when it ends so the dice settle. */
function useRolling(roll: ShownRoll | null): boolean {
  const [, bump] = useState(0)
  const left = roll ? roll.startedAt + roll.durationMs - directorNow() : 0
  useEffect(() => {
    if (!roll || left <= 0) return
    const t = setTimeout(() => bump((n) => n + 1), left + 20)
    return () => clearTimeout(t)
  }, [roll, left])
  return left > 0
}

export function DiceTray() {
  const roll = useShownRoll()
  const log = useDiceLog()
  const rolling = useRolling(roll)
  const [open, setOpen] = useState(false)
  const view = useMemo(() => (roll ? viewRoll(roll.cue, rollLabel(roll.cue.purpose)) : null), [roll])
  if (!roll || !view) return null
  return (
    <div className="dt" data-testid="dice-tray">
      <div className="dt-head"><span className="dt-label" data-testid="dice-label">{view.label}</span></div>
      <div className="dt-dice">{view.dice.map((d) => <Die key={d.key} d={d} rolling={rolling} />)}</div>
      {!rolling && view.rerolled && <div className="dt-meta"><span className="dt-tag" data-testid="dice-reroll">Re-rolled</span></div>}
      {log.length > 1 && (
        <>
          <button className="dt-toggle" data-testid="dice-log-toggle" aria-expanded={open} onClick={() => setOpen((o) => !o)}>{open ? 'Hide log' : `Dice log (${log.length})`}</button>
          {open && <DiceLog log={log} />}
        </>
      )}
    </div>
  )
}

/** History of recent rolls this game, newest first. */
export function DiceLog({ log }: { log: ShownRoll[] }) {
  const rows: { id: number; v: RollView }[] = useMemo(() => log.slice(-40).reverse().map((r) => ({ id: r.id, v: viewRoll(r.cue, rollLabel(r.cue.purpose)) })), [log])
  return (
    <ul className="dtl" data-testid="dice-log">
      {rows.map(({ id, v }) => (
        <li key={id}><span>{v.label}</span><span className="dtl-faces">{v.dice.map((d) => d.text).join(' ')}</span></li>
      ))}
    </ul>
  )
}
