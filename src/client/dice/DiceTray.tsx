// Dice tray (spec 50 s6): a slim translucent DOM panel over the table. Every pool says what it needs ("Hit needs 4+")
// and each die is coloured as a success or failure. Working mode (default, so a first game explains itself) lays out
// the whole attack; Quick mode shows only the step just rolled with the same targets and colours. The attack is: Attack Dice against the Hit TN, the Surge Die with its
// match, dice moved by Surge or a critical hit, Armour, Evade, and the damage line "marked + new = total". Everything is
// read from the engine's atk.stage payloads; re-rolled dice are marked. It collapses to a small dice chip.
import { useEffect, useMemo, useRef, useState } from 'react'
import { dataName, directorNow, onCue, queries, rollLabel, seatLabel, useDiceLog, useShownRoll, type ShownRoll } from '../contract'
import './dice.css'
import { buildBatchView, damageLine, needsText, plainTitle, viewRoll, type BatchView, type DieView, type PlainDie, type RollView } from './diceView'

const PREF = 'nem.dice'
type Mode = 'quick' | 'full'
interface Pref { mode: Mode; collapsed: boolean }
function readPref(): Pref {
  try {
    const d = JSON.parse(localStorage.getItem(PREF) ?? '{}') as Partial<Pref>
    return { mode: d.mode === 'quick' ? 'quick' : 'full', collapsed: d.collapsed === true }
  } catch { return { mode: 'full', collapsed: false } }
}
function writePref(p: Pref): void { try { localStorage.setItem(PREF, JSON.stringify(p)) } catch { /* private mode */ } }

const labelOf = (r: ShownRoll): string => rollLabel(r.cue.kind === 'dice' ? r.cue.purpose : r.cue.step)

type Kind = 'plain' | 'attack' | 'surge' | 'armour' | 'evade'
function stageKind(step: string): Kind {
  return step === 'armour' ? 'armour' : step === 'evade' ? 'evade' : step === 'surge' ? 'surge' : 'attack'
}

function Die({ d, rolling, kind = 'plain', outcome = null }: { d: DieView; rolling: boolean; kind?: Kind; outcome?: 'succeeded' | 'failed' | null }) {
  const cls = ['die', `die-${kind}`, !rolling && outcome === 'succeeded' && 'die-pass', !rolling && outcome === 'failed' && 'die-fail', d.reroll && 'die-reroll', d.superseded && 'die-old', rolling && 'die-rolling'].filter(Boolean).join(' ')
  const title = [`d${d.sides} rolled ${d.face}`, d.reroll ? 're-roll' : '', d.superseded ? 'replaced' : ''].filter(Boolean).join(', ')
  return <span className={cls} role="img" aria-label={title} data-testid={`die-${d.key}`} data-face={d.face}><b>{d.text}</b></span>
}

function Pip({ d, kind }: { d: PlainDie; kind: Kind }) {
  const cls = ['die', 'die-sm', `die-${kind}`, d.pass === true && 'die-pass', d.pass === false && 'die-fail'].filter(Boolean).join(' ')
  return <span className={cls} data-face={d.face} data-pass={d.pass === null ? undefined : String(d.pass)} data-testid={`pip-${d.key}`} aria-label={`${d.face}${d.pass === null ? '' : d.pass ? ', success' : ', failure'}`}><b>{d.face}</b></span>
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

const num = (n: number | null | undefined): string => (n === null || n === undefined ? '-' : String(n))

function Totals({ t }: { t: BatchView['totals'] }) {
  const cells: [string, number | null][] = [['Hits', t.hits], ['Saved', t.saved], ['Evaded', t.evaded], ['Damage', t.damage]]
  return (
    <div className="dt-totals" data-testid="dice-totals">
      {cells.map(([k, v]) => <span key={k} className={v === null ? 'dt-tot dt-tot-off' : 'dt-tot'}><small>{k}</small><b>{num(v)}</b></span>)}
    </div>
  )
}

function Row({ title, testid, children }: { title: string; testid: string; children: React.ReactNode }) {
  return <div className="dt-row" data-testid={testid}><span className="dt-rt">{title}</span><div className="dt-rb">{children}</div></div>
}

/** The whole attack, step by step. Each section appears when its beat has played. */
const SECTIONS: Record<string, string[]> = { hit: ['attack', 'surge'], surge: ['surge'], armour: ['armour'], evade: ['evade'], impact: ['impact'], damage: ['damage'] }
export function Working({ v, step }: { v: BatchView; step?: string }) {
  const only = step ? SECTIONS[step] ?? [] : null
  const show = (id: string) => !only || only.includes(id)
  return (
    <div className="dt-work" data-testid="dice-working">
      {show('attack') && v.attack && (
        <Row title="Attack dice" testid="dice-attack">
          {v.attack.groups.map((g, i) => (
            <div key={i} className="dt-grp">
              <span className="dt-tn">{`Hit ${needsText(g.tn)}`}</span>
              <div className="dt-dice">{g.dice.map((d) => <Pip key={d.key} d={d} kind="attack" />)}</div>
            </div>
          ))}
          <span className="dt-sum">{v.attack.hits} hit{v.attack.hits === 1 ? '' : 's'}{v.attack.precision ? `, ${v.attack.precision} by precision` : ''}</span>
        </Row>
      )}
      {show('surge') && v.surge && (
        <Row title="Surge die" testid="dice-surge">
          {v.surge.face !== null ? <span className="die die-sm die-surge"><b>{v.surge.face}</b></span> : <span className="dt-sum">none</span>}
          <span className="dt-sum" data-testid="dice-surge-match">
            {v.surge.match === null ? '' : v.surge.match ? 'Matched a tag.' : 'No match.'}
            {v.surge.moved ? ` ${v.surge.moved} die moved to damage.` : ''}
            {v.surge.crit ? ` ${v.surge.crit} critical.` : ''}
            {v.surge.dodge ? ` ${v.surge.dodge} dodged.` : ''}
          </span>
        </Row>
      )}
      {show('armour') && v.armour && (
        <Row title="Armour" testid="dice-armour">
          <span className="dt-tn">{`Save ${needsText(v.armour.tn)}`}</span>
          <div className="dt-dice">{v.armour.dice.map((d) => <Pip key={d.key} d={d} kind="armour" />)}</div>
          <span className="dt-sum">{v.armour.saved} saved{v.armour.tough ? `, TOUGH ${v.armour.tough}` : ''}; {v.armour.toDamage} to damage</span>
        </Row>
      )}
      {show('evade') && v.evade && (
        <Row title="Evade" testid="dice-evade">
          {v.evade.eligible ? (
            <>
              <span className="dt-tn">{`Evade ${needsText(v.evade.tn)}`}</span>
              <div className="dt-dice">{v.evade.dice.map((d) => <Pip key={d.key} d={d} kind="evade" />)}</div>
              <span className="dt-sum">{v.evade.evaded} evaded; {v.evade.remaining} left</span>
            </>
          ) : <span className="dt-sum">Cannot evade{v.evade.reasons.length ? `: ${v.evade.reasons.join(', ').replace(/_/g, ' ')}` : ''}</span>}
        </Row>
      )}
      {show('impact') && v.impact && (
        <Row title="Impact" testid="dice-impact">
          <div className="dt-dice">{v.impact.dice.map((d) => <Pip key={d.key} d={d} kind="attack" />)}</div>
          <span className="dt-sum">{v.impact.passed} hit{v.impact.passed === 1 ? '' : 's'}</span>
        </Row>
      )}
      {show('damage') && v.damage && (
        <Row title="Damage" testid="dice-damage">
          <span className="dt-dmg" data-testid="dice-damage-line">{damageLine(v.damage)}</span>
          {v.damage.perDie !== null && v.damage.dice > 0 && <span className="dt-sum">{v.damage.dice} dice x {v.damage.perDie}</span>}
        </Row>
      )}
    </div>
  )
}

interface ChargeNote { needed: number | null; outcome: 'succeeded' | 'failed' | null }

/** Charge context from the charge cues: the roll needed (an engine query at the declaration) and the outcome. */
function useChargeNote(): ChargeNote | null {
  const [note, setNote] = useState<ChargeNote | null>(null)
  useEffect(() => onCue((cue) => {
    if (cue.kind !== 'charge') return
    if (cue.stage === 'declared') setNote({ needed: queries.chargeOdds(cue.unitId, cue.targets)?.needed ?? null, outcome: null })
    else if (cue.stage === 'succeeded' || cue.stage === 'failed') setNote((n) => ({ needed: n?.needed ?? null, outcome: cue.stage as 'succeeded' | 'failed' }))
  }), [])
  return note
}

/** Whose die it was, when the cue names a seat. */
const ownerOf = (r: ShownRoll): string | null => {
  if (r.cue.kind !== 'dice' || !r.cue.ownerId) return null
  const l = seatLabel(r.cue.ownerId)
  return l === `Player ${r.cue.ownerId}` ? null : l // an id that is not a seat is not named
}

export function DiceTray() {
  const roll = useShownRoll()
  const log = useDiceLog()
  const rolling = useRolling(roll)
  const [pref, setPref] = useState<Pref>(readPref)
  const [open, setOpen] = useState(false)
  const charge = useChargeNote()
  // What a charge roll needed, kept per shown roll so the log can say it too.
  const needed = useRef(new Map<number, number | null>())
  if (roll && roll.cue.kind === 'dice' && roll.cue.purpose.split(':')[0] === 'charge' && !needed.current.has(roll.id)) needed.current.set(roll.id, charge?.needed ?? null)
  const view = useMemo<RollView | null>(() => (roll ? viewRoll(roll.cue, labelOf(roll)) : null), [roll])
  const batch = useMemo(() => (roll ? buildBatchView(log, roll, rolling) : null), [log, roll, rolling])
  if (!roll || !view) return null
  const set = (p: Partial<Pref>) => setPref((cur) => { const n = { ...cur, ...p }; writePref(n); return n })
  const attack = roll.cue.kind === 'attackStage'
  const kind: Kind = roll.cue.kind === 'attackStage' ? stageKind(roll.cue.step) : 'plain'
  const isCharge = roll.cue.kind === 'dice' && roll.cue.purpose.split(':')[0] === 'charge'
  const need = needed.current.get(roll.id) ?? null
  const title = attack && batch?.weaponId ? `${dataName(batch.weaponId)}: ${view.label}` : plainTitle(view.label, ownerOf(roll), isCharge ? need : null)
  const outcome = isCharge ? charge?.outcome ?? null : null

  if (pref.collapsed) {
    return (
      <button className="dt-chip" data-testid="dice-tray" data-collapsed="true" aria-label="Show the dice tray" onClick={() => set({ collapsed: false })}>
        Dice{rolling ? '' : ` ${view.dice.map((d) => d.text).join(' ')}`}
      </button>
    )
  }
  const settledAttack = attack && !rolling && batch
  return (
    <div className="dt" data-testid="dice-tray" data-mode={pref.mode} data-collapsed="false">
      <div className="dt-head">
        <span className="dt-label" data-testid="dice-label">{title}</span>
        <span className="dt-btns">
          {attack && <button className="dt-mini" data-testid="dice-mode" aria-pressed={pref.mode === 'full'} onClick={() => set({ mode: pref.mode === 'full' ? 'quick' : 'full' })}>{pref.mode === 'full' ? 'Quick' : 'Working'}</button>}
          <button className="dt-mini" data-testid="dice-collapse" aria-label="Hide the dice tray" onClick={() => set({ collapsed: true })}>&#8211;</button>
        </span>
      </div>
      {(!attack || rolling) && (
        <div className="dt-dice">{view.dice.map((d) => <Die key={d.key} d={d} rolling={rolling} kind={kind} outcome={outcome} />)}</div>
      )}
      {!attack && !rolling && isCharge && <div className="dt-meta" data-testid="dice-charge-note">{need !== null ? `Needed ${need}` : 'Needed value not shown'}{outcome ? (outcome === 'succeeded' ? ': charge connects.' : ': charge falls short.') : ''}</div>}
      {!rolling && view.rerolled && <div className="dt-meta"><span className="dt-tag" data-testid="dice-reroll">Re-rolled</span></div>}
      {settledAttack && roll.cue.kind === 'attackStage' && <Working v={batch} {...(pref.mode === 'quick' ? { step: roll.cue.step } : {})} />}
      {attack && batch && <Totals t={batch.totals} />}
      {log.length > 1 && (
        <>
          <button className="dt-toggle" data-testid="dice-log-toggle" aria-expanded={open} onClick={() => setOpen((o) => !o)}>{open ? 'Hide log' : `Dice log (${log.length})`}</button>
          {open && <DiceLog log={log} needed={needed.current} />}
        </>
      )}
    </div>
  )
}

/** History of recent rolls this game, newest first: who rolled, what for, and what was needed when known. */
export function DiceLog({ log, needed }: { log: ShownRoll[]; needed?: ReadonlyMap<number, number | null> }) {
  const rows: { id: number; text: string; faces: string }[] = useMemo(() => log.slice(-40).reverse().map((r) => {
    const v = viewRoll(r.cue, labelOf(r))
    return { id: r.id, text: plainTitle(v.label, ownerOf(r), needed?.get(r.id) ?? null), faces: v.dice.map((d) => d.text).join(' ') }
  }), [log, needed])
  return (
    <ul className="dtl" data-testid="dice-log">
      {rows.map(({ id, text, faces }) => <li key={id}><span>{text}</span><span className="dtl-faces">{faces}</span></li>)}
    </ul>
  )
}
