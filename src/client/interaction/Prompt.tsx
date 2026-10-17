// The decision panel (DOM): one body per answer mode (spec 00 s3.2 kinds, spec 50 s5). It never decides legality: choices
// are the engine's own options, path answers are dry-run by the engine, odds come from the query hooks.
import { useLayoutEffect, useRef, useState, type ReactElement } from 'react'
import { HintStrip } from '../ui/HintStrip'
import { cardListWords, optionSkill, resourceInfo, weaponInfo, type SkillInfo } from '../ui/skillInfo'
import { SkillName, SkillTip } from '../ui/SkillTip'
import { panels, useHideAll, usePanelMin } from '../ui/panelStore'
import { Tip } from '../ui/Tooltip'
import {
  data, dataName, focus, getBundle, queries, useAttackPreview, useBoardGeometry, useChargeOdds, useFocus, useGame, useWaitingFor,
} from '../contract'
import type { DecisionOption, GameState, PendingDecision } from '../../engine/types'
import type { Resource } from '../../data/types'
import { answerOption, clickUnit, confirmPath, fireArmed, optionForTarget } from './actions'
import { attentionPoints, dockSide, midOf, sideName } from './attention'
import { activeWeapon } from './highlights'
import { useDraftFor } from './hooks'
import {
  activationMenu, batchMenu, chargeOptionFor, classify, hintFor, kindInfo, mentionedUnits, modelRef, pathPlan, sideOptions, verbOf, type Mode,
} from './kinds'
import { abilityHeading, firstChoiceWords, firstSentence, oneDp, payCardsWords, percent, poolLine, prettify, unitTag } from './text'
import { draft } from './store'

const HINT_KEY = 'nem.interaction.hints'
const readHints = (): boolean => { try { return localStorage.getItem(HINT_KEY) !== 'off' } catch { return true } }
const saveHints = (on: boolean): void => { try { localStorage.setItem(HINT_KEY, on ? 'on' : 'off') } catch { /* private mode: fine */ } }

function glow(ids: string[]): void { focus.hover(ids[0] ?? null) }

/** Name + cost chip for an option that uses an ability; the full explanation sits in the tooltip. */
function SkillLabel({ info }: { info: SkillInfo }): ReactElement {
  const cost = info.chips[2]
  const from = info.lines.find((l) => l.label === 'From')
  return <><span className="skill-name">{info.name}</span>{cost ? <span className="ix-cost">{cost}</span> : null}{from ? <span className="dim"> ({from.text})</span> : null}</>
}

/** Engine option label in player words: ids become names, card ids in payments become card names. */
function optionText(state: GameState | null, o: DecisionOption): string {
  if (o.action.type === 'ability.pay') {
    const cards = o.action['cards']
    return Array.isArray(cards) && state ? `Exhaust ${payCardsWords(state, state.pending.seat, cards.filter((x): x is string => typeof x === 'string'))}` : cardListWords(getBundle(), o.label)
  }
  if (o.action.type === 'turn.first' && typeof o.action['first'] === 'string' && state) return firstChoiceWords(state.pending.seat, o.action['first'])
  return prettify(state, o.label)
}

const EFFECT_KINDS = new Set(['ability.window', 'ability.react'])

/** One engine option as a button. Ability options show the ability name and cost, and explain it on hover. */
function OptionButton({ o, index, primary, suffix }: { o: DecisionOption; index?: number; primary?: boolean; suffix?: string }): ReactElement {
  const { state } = useGame()
  const skill = optionSkill(getBundle(), state, o.action)
  const effect = skill && state && EFFECT_KINDS.has(state.pending.kind) ? firstSentence(skill.text) : ''
  return (
    <SkillTip info={skill}>
      <button
        className={`ix-btn${primary ? ' primary' : ''}${effect ? ' has-effect' : ''}`} data-testid={`opt-${o.id}`}
        onMouseEnter={() => { draft.hoverOption(o.id); glow(mentionedUnits(o.action)) }}
        onMouseLeave={() => { draft.hoverOption(null); focus.hover(null) }}
        onClick={() => answerOption(o)}
      >
        {index !== undefined && <kbd>{index + 1}</kbd>}{skill ? <SkillLabel info={skill} /> : optionText(state, o)}{suffix ? <span className="dim"> ({suffix})</span> : null}{effect ? <span className="ix-effect" data-testid="ix-effect">{effect}</span> : null}
      </button>
    </SkillTip>
  )
}

// ------------------------------------------------------------------ activation (turn.activate)
function ActivateBody({ pending }: { pending: PendingDecision }): ReactElement {
  const { state } = useGame()
  const d = useDraftFor(pending.id)
  const menu = activationMenu(pending)
  const open = menu.units.find((u) => u.unitId === d.menuUnit) ?? null
  const [tip, setTip] = useState('')
  return (
    <div className="ix-body" data-testid="ix-activate">
      <div className="ix-chips" role="listbox" aria-label="Squads that can act">
        {menu.units.map((u, i) => (
          <button key={u.unitId} role="option" aria-selected={u.unitId === d.menuUnit} className={`ix-chip${u.unitId === d.menuUnit ? ' on' : ''}`}
            data-testid={`unit-chip-${u.unitId}`} onMouseEnter={() => focus.hover(u.unitId)} onMouseLeave={() => focus.hover(null)}
            onClick={() => clickUnit(pending, u.unitId)}>
            {!open && <kbd>{i + 1}</kbd>}{unitTag(state, u.unitId)}
          </button>
        ))}
      </div>
      {open ? (
        <div className="ix-menu" data-testid="action-menu" data-unit={open.unitId}>
          <div className="ix-menu-title">{unitTag(state, open.unitId)}: what should it do?</div>
          <div className="ix-row">
            {open.options.map((o, i) => {
              const v = verbOf(o)
              const skill = optionSkill(getBundle(), state, o.action)
              const reach = o.action.type === 'move.run' ? queries.reachOf(open.unitId) : null
              const hint = skill ? skill.text : reach && reach.run !== null ? `Move again, up to ${oneDp(reach.run)}" (the squad Speed).` : v.hint
              return (
                <SkillTip key={`${o.id}:${i}`} info={skill}>
                  <button className="ix-btn primary" data-testid={`act-${o.id}`} onMouseEnter={() => setTip(hint)} onMouseLeave={() => setTip('')}
                    onFocus={() => setTip(hint)} onBlur={() => setTip('')} onClick={() => answerOption(o)}>
                    <kbd>{i + 1}</kbd>{skill ? <SkillLabel info={skill} /> : v.label}
                  </button>
                </SkillTip>
              )
            })}
          </div>
          <div className="ix-tip" aria-live="polite">{tip}</div>
        </div>
      ) : (
        <div className="ix-note">{menu.units.some((u) => state?.units[u.unitId]?.location === 'table') ? 'Select a glowing squad to see what it can do.' : 'Select a squad above to see what it can do.'}</div>
      )}
      {menu.pass && <PassButton option={menu.pass} />}
    </div>
  )
}

function PassButton({ option }: { option: DecisionOption }): ReactElement {
  return <button className="ix-btn quiet" data-testid="act-pass" onClick={() => answerOption(option)}><kbd>P</kbd>Pass</button>
}

// ------------------------------------------------------------------ path (move / deploy / charge / place)
function PathBody({ pending }: { pending: PendingDecision }): ReactElement {
  const d = useDraftFor(pending.id)
  const plan = pathPlan(pending)
  const pv = d.preview
  const leaderOffTable = plan ? pending.kind === 'deploy.path' : false
  const over = pv && pv.limit !== null && pv.length > pv.limit + 1e-6
  const hasPath = d.waypoints.length > 0
  return (
    <div className="ix-body" data-testid="ix-path">
      <div className="ix-note">
        {leaderOffTable ? 'Click a spot inside the shaded entry band for the Leading Model.' : hasPath ? 'Click more points to bend the route, or confirm.' : 'Drag a model of the glowing squad, or click the table to send the Leading Model there.'}
      </div>
      {pv && (
        <div className={`ix-status${pv.ok ? ' ok' : ' bad'}`} data-testid="path-status" data-ok={pv.ok ? '1' : '0'}>
          {pv.limit !== null && pv.length > 0 && <b className={over ? 'bad' : ''} data-testid="path-ruler">{oneDp(pv.length)}&quot; of {oneDp(pv.limit)}&quot;</b>}{' '}
          {pv.text}
          {pv.red.length > 0 && <span className="bad"> Red marks show the models out of coherency.</span>}
        </div>
      )}
      <div className="ix-row">
        <button className="ix-btn primary" disabled={!pv?.ok || d.held} data-testid="path-confirm" onClick={() => confirmPath(pending)}><kbd>Enter</kbd>Confirm</button>
        <button className="ix-btn" disabled={!hasPath} data-testid="path-undo" onClick={() => draft.undoWaypoint()}><kbd>Bksp</kbd>Undo point</button>
        <button className="ix-btn" disabled={!hasPath && !d.held} data-testid="path-reset" onClick={() => draft.clearPath()}><kbd>Esc</kbd>Start over</button>
        {plan?.suggested && <button className="ix-btn" data-testid="path-suggested" onClick={() => answerOption(plan.suggested!)}>{pending.kind === 'charge.path' ? 'Take the first legal route' : 'Use a suggested spot'}</button>}
        {plan?.extras.map((o, i) => <OptionButton key={`${o.id}:${i}`} o={o} />)}
      </div>
    </div>
  )
}

function weaponOf(state: GameState | null, unitId: string | null, weaponId: string) {
  const u = unitId ? state?.units[unitId] : undefined
  const def = u ? data.unit(u.profileId) : undefined
  return def ? data.weapons(def).find((x) => x.id === weaponId) : undefined
}

// ------------------------------------------------------------------ targets (shoot.batch and friends)
const CHARGE_WHY: Record<string, string> = { outOfReach: 'Out of reach this turn.', noTarget: 'Pick at least one target.' }

function AttackOdds({ attacker, weaponId, target }: { attacker: string; weaponId: string; target: string }): ReactElement | null {
  const pv = useAttackPreview(attacker, weaponId, target)
  if (!pv) return null
  if (!pv.legal) return <div className="ix-odds bad" data-testid="ix-odds">{pv.reason ?? 'Cannot fire at that target.'}</div>
  const dice = pv.perModel.reduce((n, m) => n + m.dice, 0)
  const tn = [...new Set(pv.perModel.map((m) => m.hitTN).filter((x): x is number => x !== null))].sort().map((x) => `${x}+`).join(' / ')
  return (
    <div className="ix-odds" data-testid="ix-odds">
      <span>{dice} dice, hit on {tn || 'n/a'}</span>
      <span>Surge {pv.surge.dice ? (pv.surge.tagMatch ? 'matches' : 'no match') : 'none'}</span>
      <span>Armour {pv.armourTN !== null ? `${pv.armourTN}+` : 'none'}</span>
      <span>{pv.evadeTN !== null ? `Evade ${pv.evadeTN}+` : 'No Evade roll'}</span>
      <b>about {oneDp(pv.expectedDamage)} damage, {percent(pv.killChance)} to wipe it out</b>
    </div>
  )
}

function ChargeOddsLine({ unitId, picked }: { unitId: string | null; picked: string[] }): ReactElement | null {
  const odds = useChargeOdds(unitId, picked.length ? picked : null)
  if (!picked.length) return <div className="ix-note">Click the enemy squads to charge.</div>
  if (!odds) return null
  return (
    <div className={`ix-odds${odds.needed === null ? ' bad' : ''}`} data-testid="ix-odds">
      {odds.needed === null ? (CHARGE_WHY[odds.reason ?? ''] ?? 'That charge is not possible.') : <b>Needs {odds.needed}+ on the charge roll ({percent(odds.chance)})</b>}
    </div>
  )
}

function TargetBody({ pending }: { pending: PendingDecision }): ReactElement {
  const { state } = useGame()
  const d = useDraftFor(pending.id)
  const hover = useFocus((f) => f.hoverUnitId)
  const side = sideOptions(pending)
  if (pending.kind === 'shoot.batch') {
    const menu = batchMenu(pending)
    const w = activeWeapon(menu, d.weaponId)
    const row = menu.rows.find((r) => r.weaponId === w)
    const shown = d.armed?.unitId ?? (hover && row?.targets.includes(hover) ? hover : null)
    return (
      <div className="ix-body" data-testid="ix-target">
        <div className="ix-chips" aria-label="Weapons">
          {menu.rows.map((r) => {
            const wd = weaponOf(state, menu.unitId, r.weaponId)
            return (
              <SkillTip key={r.weaponId} info={wd ? weaponInfo(wd, getBundle()) : null}>
                <button className={`ix-chip${r.weaponId === w ? ' on' : ''}`} data-testid={`weapon-${r.weaponId}`} onClick={() => draft.setWeapon(r.weaponId)}>
                  <span className={wd ? 'skill-name' : ''}>{dataName(r.weaponId)}</span> <span className="dim">({r.targets.length} {r.targets.length === 1 ? 'target' : 'targets'})</span>
                </button>
              </SkillTip>
            )
          })}
        </div>
        <div className="ix-row">
          {row?.targets.map((t) => (
            <button key={t} className={`ix-btn${d.armed?.unitId === t ? ' primary' : ''}`} data-testid={`target-${t}`}
              onMouseEnter={() => focus.hover(t)} onMouseLeave={() => focus.hover(null)} onClick={() => clickUnit(pending, t)}>
              {unitTag(state, t)}
            </button>
          ))}
        </div>
        <div className="ix-slot" data-testid="ix-slot">
          {shown && w && menu.unitId ? <AttackOdds attacker={menu.unitId} weaponId={w} target={shown} /> : <div className="ix-note">{d.armed ? 'Press Fire, or click the target again.' : 'Hover a target to see the odds; click it to arm the shot.'}</div>}
        </div>
        <div className="ix-row">
          <button className="ix-btn primary" disabled={!d.armed} data-testid="fire-confirm" onClick={() => fireArmed(pending)}><kbd>Enter</kbd>Fire</button>
          {side.map((o, i) => <OptionButton key={`${o.id}:${i}`} o={o} />)}
        </div>
      </div>
    )
  }
  if (pending.kind === 'charge.targets') {
    const me = typeof pending.context['unitId'] === 'string' ? (pending.context['unitId'] as string) : null
    const match = chargeOptionFor(pending, d.picked)
    const ids = [...new Set(pending.options.flatMap((o) => (Array.isArray(o.action['targetIds']) ? (o.action['targetIds'] as string[]) : [])))]
    const why = !d.picked.length ? 'Pick at least one enemy squad.' : match ? '' : 'The rules do not offer those squads as one charge. Clear the picks and choose again.'
    return (
      <div className="ix-body" data-testid="ix-target">
        <div className="ix-chips">
          {ids.map((t) => {
            const o = me ? queries.chargeOdds(me, [t]) : null
            const far = !o || o.needed === null
            return (
              <button key={t} className={`ix-chip${d.picked.includes(t) ? ' on' : ''}${far ? ' off' : ''}`} data-testid={`target-${t}`} data-reach={far ? 'out' : 'in'}
                onMouseEnter={() => focus.hover(t)} onMouseLeave={() => focus.hover(null)} onClick={() => clickUnit(pending, t)}>
                {unitTag(state, t)} <span className="dim">{far ? 'out of reach' : `needs ${o!.needed}+`}</span>
              </button>
            )
          })}
        </div>
        <div className="ix-slot" data-testid="ix-slot">
          <ChargeOddsLine unitId={me} picked={d.picked} />
        </div>
        <div className="ix-row">
          <button className="ix-btn primary" disabled={!match} aria-describedby="charge-why" data-testid="charge-confirm" onClick={() => fireArmed(pending)}><kbd>Enter</kbd>Declare charge</button>
          {d.picked.length > 0 && <button className="ix-btn" data-testid="charge-clear" onClick={() => draft.setPicked([])}><kbd>Esc</kbd>Clear picks</button>}
          {side.map((o, i) => <OptionButton key={`${o.id}:${i}`} o={o} />)}
        </div>
        {!match && <div className="ix-note" id="charge-why" data-testid="charge-why">{why}</div>}
      </div>
    )
  }
  // melee.split, charge.impact, ability target: one button per target, plus the table
  const armedOpt = d.armed ? optionForTarget(pending, d.armed.unitId, null) : null
  return (
    <div className="ix-body" data-testid="ix-target">
      <div className="ix-row">
        {pending.options.map((o, i) => <OptionButton key={`${o.id}:${i}`} o={o} index={i} />)}
      </div>
      <div className="ix-row">
        <button className="ix-btn primary" disabled={!armedOpt} data-testid="fire-confirm" onClick={() => fireArmed(pending)}><kbd>Enter</kbd>Confirm pick</button>
      </div>
    </div>
  )
}

// ------------------------------------------------------------------ lists, entry, models, points
function ListBody({ pending, mode }: { pending: PendingDecision; mode: Mode }): ReactElement {
  const geo = useBoardGeometry()
  const edgeOf = (o: DecisionOption): string | undefined => {
    const en = o.action['entry'] as { kind?: string; segment?: number } | undefined
    if (mode !== 'entry' || !geo || !en || en.kind !== 'edge' || typeof en.segment !== 'number') return undefined
    const seg = (geo.edges.find((e) => e.seat === pending.seat) ?? geo.edges[0])?.segments[en.segment]
    return seg ? `${sideName(midOf(seg), geo.table)} edge` : undefined
  }
  const opts = mode === 'list' || mode === 'entry' ? pending.options : sideOptions(pending)
  return (
    <div className="ix-body" data-testid={mode === 'list' ? 'ix-list' : `ix-${mode}`}>
      <div className="ix-row ix-wrap">
        {opts.map((o, i) => <OptionButton key={`${o.id}:${i}`} o={o} index={i < 9 ? i : undefined} suffix={edgeOf(o)} primary={pending.kind !== 'turn.first' && o.id !== 'pass' && o.id !== 'skip' && o.id !== 'decline' && o.id !== 'done'} />)}
      </div>
    </div>
  )
}

function ModelsBody({ pending }: { pending: PendingDecision }): ReactElement {
  const { state } = useGame()
  const picks = pending.options.filter((o) => modelRef(o.action) !== null)
  const rest = sideOptions(pending)
  return (
    <div className="ix-body" data-testid="ix-models">
      <div className="ix-note">Click a ringed model on the table, or choose below.</div>
      <div className="ix-row ix-wrap">
        {picks.map((o, i) => {
          const id = modelRef(o.action)!
          return (
            <button key={o.id} className="ix-btn" data-testid={`opt-${o.id}`} onMouseEnter={() => glow([state?.models[id]?.unitId ?? ''])} onMouseLeave={() => focus.hover(null)} onClick={() => answerOption(o)}>
              {i < 9 && <kbd>{i + 1}</kbd>}{prettify(state, o.label)}
            </button>
          )
        })}
        {rest.map((o, i) => <OptionButton key={`${o.id}:${i}`} o={o} />)}
      </div>
    </div>
  )
}

function PointBody({ pending }: { pending: PendingDecision }): ReactElement {
  const rest = sideOptions(pending)
  return (
    <div className="ix-body" data-testid="ix-point">
      <div className="ix-note">Click one of the marked spots on the table (the nearest one is used).</div>
      <div className="ix-row">{rest.map((o, i) => <OptionButton key={`${o.id}:${i}`} o={o} />)}</div>
    </div>
  )
}

// ------------------------------------------------------------------ ability prompts: what is asked, what it costs, what you hold
function AbilityStatus({ pending }: { pending: PendingDecision }): ReactElement | null {
  const { state } = useGame()
  if (!state || (pending.kind !== 'ability.window' && pending.kind !== 'ability.react' && pending.kind !== 'ability.pay')) return null
  const ctx = pending.context
  let lead = ''
  if (pending.kind === 'ability.window') {
    const u = typeof ctx['unitId'] === 'string' ? unitTag(state, ctx['unitId']) : 'the squad'
    lead = ctx['window'] === 'before' ? `Before ${u} acts.` : `After ${u} has acted.`
  } else if (pending.kind === 'ability.react') {
    lead = 'Something just happened that one of your abilities can answer.'
  } else {
    lead = typeof ctx['n'] === 'number' && typeof ctx['res'] === 'string' ? `This costs ${ctx['n']} ${ctx['res']}. Pick which cards to exhaust; any surplus is lost.` : ''
  }
  const only = pending.kind === 'ability.pay' && typeof ctx['res'] === 'string' ? (ctx['res'] as Resource) : undefined
  return <p className="ix-status-line" data-testid="ix-ability-status">{lead} {poolLine(state, pending.seat, only)}</p>
}

// ------------------------------------------------------------------ the panel
/** One line the header keeps visible when the panel is collapsed: path status and ruler, or the armed shot. */
function Summary({ pending }: { pending: PendingDecision }): ReactElement | null {
  const d = useDraftFor(pending.id)
  const pv = d.preview
  if (!pv) return null
  return (
    <span className={`ix-sum${pv.ok ? '' : ' bad'}`} data-testid="ix-summary">
      {pv.limit !== null && pv.length > 0 ? `${oneDp(pv.length)}" of ${oneDp(pv.limit)}". ` : ''}{pv.text}
    </span>
  )
}

export function Prompt({ pending }: { pending: PendingDecision }): ReactElement {
  const mode = classify(pending)
  const info = kindInfo(pending.kind)
  const waiting = useWaitingFor()
  const { state } = useGame()
  const geo = useBoardGeometry()
  const d = useDraftFor(pending.id)
  const [hints, setHints] = useState(readHints)
  const collapsed = usePanelMin('prompt')
  const hideAll = useHideAll()
  const setCollapsed = (c: boolean) => { if (!c && hideAll) panels.setHideAll(false); panels.setMin('prompt', c) }
  const passOpt = pending.options.find((o) => o.action.type === 'turn.pass') ?? null
  const ability = pending.kind === 'ability.target' ? abilityHeading(state, pending.context) : null
  const payRes = pending.context['res']
  const pay = pending.kind === 'ability.pay' && typeof payRes === 'string' && ['CP', 'BM', 'PE'].includes(payRes) && typeof pending.context['n'] === 'number'
    ? { res: payRes as Resource, n: pending.context['n'] as number } : null
  // Dock on the side of the table away from the active squad, the entry edge and the offered spots.
  const pts = attentionPoints(pending, state, geo, d.menuUnit)
  const side = dockSide(pts)
  const dock = 'bottom'
  const ref = useRef<HTMLElement>(null)
  // Publish the panel's height on narrow screens (where it spans the width) so the HUD dock sits above it, never under it.
  useLayoutEffect(() => {
    const el = ref.current
    const root = document.documentElement
    const set = () => root.style.setProperty('--ix-prompt-bottom', el && window.matchMedia?.('(max-width: 900px)').matches ? `${el.offsetHeight + 8}px` : '0px')
    set()
    const ro = typeof ResizeObserver !== 'undefined' && el ? new ResizeObserver(set) : null
    if (ro && el) ro.observe(el)
    return () => { ro?.disconnect(); root.style.setProperty('--ix-prompt-bottom', '0px') }
  }, [])
  return (
    <section ref={ref} className={`ix-prompt${collapsed ? ' collapsed' : ''}`} data-testid="interaction-prompt" data-kind={pending.kind} data-mode={mode} data-dock={dock} data-side={side} aria-live="polite">
      <header className="ix-head">
        {collapsed && <span className="ix-yourmove" data-testid="ix-your-move">Your move</span>}
        {!collapsed && <h3>{ability ? (ability.info ? <SkillName info={ability.info} testid="ix-ability-name" /> : ability.name) : pay ? <>Pay {pay.n} <SkillName info={resourceInfo(pay.res)} testid="ix-pay-res">{pay.res}</SkillName></> : info.title}{waiting?.hotSeat ? <span className="dim"> ({waiting.label})</span> : null}</h3>}
        {collapsed && <span className="ix-sum">{ability ? ability.name : info.title}</span>}
        {collapsed && <Summary pending={pending} />}
        {collapsed && passOpt && (
          <Tip title="Pass" body="Give up your remaining activations for this Phase." placement="top">
            <button className="ix-btn quiet" data-testid="ix-pass-min" onClick={() => answerOption(passOpt)}>Pass</button>
          </Tip>
        )}
        <div className="ix-head-tools">
          {!collapsed && (
            <Tip title={hints ? 'Hide hints' : 'Show hints'} body="Toggle the one-line help under the title." placement="top">
              <button className="ix-icon" aria-pressed={hints} aria-label="Show hints" data-testid="ix-hints-toggle" onClick={() => { setHints(!hints); saveHints(!hints) }}>?</button>
            </Tip>
          )}
          <Tip title={collapsed ? 'Show the decision panel' : 'Minimise the decision panel'} body={collapsed ? (hideAll ? 'Brings back the whole layout (same as H).' : 'Bring the full choices back.') : 'Shrink it to a small Your move tab; Pass stays reachable.'} placement="top">
            <button className="ix-icon" aria-expanded={!collapsed} aria-label={collapsed ? 'Expand panel' : 'Collapse panel'} data-testid="ix-collapse" onClick={() => setCollapsed(!collapsed)}>{collapsed ? '+' : '-'}</button>
          </Tip>
        </div>
      </header>
      {!collapsed && (
        <>
          {ability && ability.line && <p className="ix-hint" data-testid="ix-ability">{ability.line}</p>}
          {hints && !ability && <p className="ix-hint" data-testid="ix-hint">{hintFor(pending, (id) => state?.units[id]?.location === 'table')}</p>}
          <AbilityStatus pending={pending} />
          <HintStrip pending={pending} />
          {mode === 'activate' ? <ActivateBody pending={pending} />
            : mode === 'path' ? <PathBody pending={pending} />
              : mode === 'target' ? <TargetBody pending={pending} />
                : mode === 'models' ? <ModelsBody pending={pending} />
                  : mode === 'point' ? <PointBody pending={pending} />
                    : <ListBody pending={pending} mode={mode} />}
        </>
      )}
    </section>
  )
}
