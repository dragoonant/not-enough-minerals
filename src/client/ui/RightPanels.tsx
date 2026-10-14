// Right rail panels: UnitCard (hover or selection, with keyword tooltips and figure glow), WeaponPanel (one Batch per
// weapon profile), OddsPanel (engine previews) and EventFeed (narrated log).
import { useEffect, useMemo, useRef, useState } from 'react'
import type { UnitDef, WeaponProfile } from '../../data/types'
import type { GameState } from '../../engine/types'
import {
  data, focus, getBundle, seatLabel, unitName, useAttackPreview, useChargeOdds, useCover, useFeed, useFocus, usePresented, usePresentedTurn,
  usePresentedUnit, useUnitDefOf, useViewerSeat,
} from '../contract'
import { sideColour } from '../theme'
import { Emblem, KeywordChip, PanelHead } from './bits'
import { feedLines, type FeedLine } from './feedView'
import { attackOddsRows, chargeOddsRows, prettyId, statusWords, tn, type OddsRow } from './hudView'
import { abilityInfo, findAbility, statusInfo, upgradeInfo, weaponInfo } from './skillInfo'
import { SkillName, SkillTip } from './SkillTip'
import { Tip } from './Tooltip'

const STAT_TIPS: Record<string, [string, string]> = {
  speed: ['Speed', 'How many inches the unit moves in one Move.'],
  armour: ['Armour', 'The face an Armour Roll needs to stop a hit.'],
  evade: ['Evade', 'The face an Evade Roll needs to dodge damage that got through.'],
  hp: ['HP', 'Hit points of each model.'],
  size: ['Size', 'How big the unit is for sight and movement.'],
  shield: ['Shield', 'Extra protection carried by the first model; it goes before HP.'],
}
function Stat({ k, v, tip }: { k: keyof typeof STAT_TIPS; v: string; tip?: string }) {
  const [title, base] = STAT_TIPS[k]!
  const body = tip ?? base
  return <Tip title={title} body={body}><span className="stat" tabIndex={0} data-testid={`stat-${k}`}><i>{title}</i><b>{v}</b></span></Tip>
}
const speedText = (s: UnitDef['stats']['speed']): string => (s === null ? '-' : Array.isArray(s) ? `${s[0]}/${s[1]}"` : `${s}"`)

function Weapons({ def, bought }: { def: UnitDef; bought: string[] }) {
  const ws = data.weapons(def).filter((w) => def.weapons.some((d) => d.id === w.id) || def.upgrades.some((u) => u.weapon?.id === w.id && bought.includes(u.id)))
  return (
    <table className="mini-table weapons" data-testid="card-weapons">
      <thead><tr><th>Weapon</th><th>Rng</th><th>ROA</th><th>Hit</th><th>Surge</th><th>Dmg</th></tr></thead>
      <tbody>
        {ws.map((w) => (
          <tr key={w.id}>
            <td colSpan={6} className="wrow">
              <div className="wline"><b><SkillName info={weaponInfo(w, getBundle())} testid={`weapon-name-${w.id}`} /></b><span>{w.range === 'E' ? 'Engaged' : `${w.range}"`}</span><span>{String(w.roa)}</span><span>{tn(w.hit)}</span><span>{w.sDice ?? '-'}</span><span>{w.dmg}</span></div>
              <div className="chips">
                <span className="chip dim">{w.phase === 'assault' ? 'Assault' : 'Combat'}</span>
                {w.keywords.map((k, i) => <KeywordChip key={i} kw={k} />)}
              </div>
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  )
}

export function UnitCard() {
  const unitId = useFocus((f) => f.cardHoverUnitId ?? f.hoverUnitId ?? f.selectedUnitId)
  const unit = usePresentedUnit(unitId)
  const def = useUnitDefOf(unitId)
  const state = usePresented()
  const viewer = useViewerSeat()
  const phase = usePresentedTurn().roundPhase
  if (!unit || !def || !state) {
    return <section className="panel-sec" data-testid="unit-card-empty"><PanelHead>Unit</PanelHead><p className="dim small">Hover or click a unit on the table to read its datasheet.</p></section>
  }
  const alive = unit.modelIds.filter((id) => state.models[id]?.life !== 'dead').length
  const bought = unit.upgrades.map((u) => u.id)
  const abilities = data.abilities(def, bought)
  const colour = sideColour(state.seats[unit.owner]?.colour)
  const status = statusWords({ ...unit, location: unit.location }, phase)
  const b = getBundle()
  return (
    <section className="panel-sec unit-card" data-testid="unit-card" data-unit={unit.id} onMouseEnter={() => focus.cardHover(unit.id)} onMouseLeave={() => focus.cardHover(null)}>
      <div className="uc-head" style={{ borderColor: colour }}>
        <span style={{ color: colour }}><Emblem race={def.race} size={26} /></span>
        <div>
          <h3 data-testid="unit-card-name">{def.name}</h3>
          <div className="small dim">{unit.owner === viewer ? 'Yours' : seatLabel(unit.owner)} / {def.role}{unit.slot ? ` / ${unit.slot}` : ''}{unit.location === 'reserves' ? ' / in Reserves' : unit.location === 'destroyed' ? ' / destroyed' : ''}</div>
        </div>
      </div>
      <div className="stats">
        <Stat k="speed" v={speedText(def.stats.speed)} tip={Array.isArray(def.stats.speed) ? `Inches per action: ${def.stats.speed[0]}" for a Move, ${def.stats.speed[1]}" for a Run. Some Phases limit this; the prompt shows the reach that applies.` : undefined} />
        <Stat k="armour" v={tn(def.stats.armour)} />
        <Stat k="evade" v={tn(def.stats.evade)} />
        <Stat k="hp" v={String(def.stats.hp)} />
        <Stat k="size" v={def.stats.size === null ? '-' : String(def.stats.size)} />
        {def.stats.shield !== null && <Stat k="shield" v={String(def.stats.shield)} />}
      </div>
      <div className="small uc-live" data-testid="unit-card-live">
        <span>Models {alive}/{unit.modelIds.length}</span>
        <Tip title="Damage Marker" body="Damage carried over on this unit. It stays until the unit heals."><span tabIndex={0}>Damage {unit.damage}</span></Tip>
        {status.map((s) => <SkillTip key={s} info={statusInfo(s, getBundle())}><span className="chip warn skill-name" tabIndex={0} data-testid="status-chip">{s}</span></SkillTip>)}
      </div>
      <Weapons def={def} bought={bought} />
      {abilities.length > 0 && (
        <div className="abils" data-testid="card-abilities">
          <h4>Abilities</h4>
          <ul className="abil-list">
            {abilities.map((a) => {
              const info = abilityInfo(a, b)
              return (
                <li key={a.id} data-testid={`ability-${a.id}`}>
                  <SkillName info={info} testid={`ability-name-${a.id}`} />
                  {info.chips.map((c, i) => <span key={i} className={`chip dim${i === 0 ? ` ty-${a.type}` : ''}`}>{c}</span>)}
                </li>
              )
            })}
          </ul>
        </div>
      )}
      {unit.upgrades.length > 0 && (
        <div className="small abils" data-testid="card-upgrades">
          <h4>Upgrades</h4>
          <div className="chips">
            {unit.upgrades.map((u) => {
              const ud = def.upgrades.find((x) => x.id === u.id)
              return ud
                ? <SkillName key={u.id} info={upgradeInfo(ud, def, b)} className="chip" testid={`upgrade-${u.id}`} />
                : <span key={u.id} className="chip">{prettyId(u.id)}</span>
            })}
          </div>
        </div>
      )}
      <p className="small dim" data-testid="card-supply">Supply: {def.supplyProfile.map((b) => `${b.min === b.max ? b.min : `${b.min}-${b.max}`} models = ${b.supply}`).join('; ')}</p>
    </section>
  )
}

// ---------- weapon panel ----------
// Legality per target is asked lazily: a weapon row only runs its previews once the player opens it (hover, focus or click),
// and then on the PRESENTED state through the same hook as the odds panel, so the panel never mixes in the true state.
interface Row { weaponId: string; name: string; carriers: number; def?: WeaponProfile }

function TargetChip({ attackerId, weaponId, targetId }: { attackerId: string; weaponId: string; targetId: string }) {
  const p = useAttackPreview(attackerId, weaponId, targetId)
  const state = usePresented()
  const target = useFocus((f) => f.target)
  const legal = !!p?.legal
  const set = () => focus.setTarget({ kind: 'attack', attackerUnitId: attackerId, weaponId, targetUnitId: targetId })
  return (
    <Tip title={unitName(state, targetId)} body={legal ? 'Can be targeted with this weapon.' : (p?.reason ?? 'Cannot be targeted.')}>
      <button className={`chip pick${legal ? '' : ' off'}${target?.kind === 'attack' && target.weaponId === weaponId && target.targetUnitId === targetId ? ' on' : ''}`}
        onMouseEnter={set} onMouseLeave={() => focus.setTarget(null)} onFocus={set} onBlur={() => focus.setTarget(null)}>
        {unitName(state, targetId)}
      </button>
    </Tip>
  )
}

function WeaponRowView({ row, attackerId, foes }: { row: Row; attackerId: string; foes: string[] }) {
  const [open, setOpen] = useState(false)
  return (
    <div className="wp-row" data-testid={`weapon-row-${row.weaponId}`} onMouseEnter={() => setOpen(true)} onFocus={() => setOpen(true)}>
      {row.def ? <b><SkillName info={weaponInfo(row.def, getBundle())} /></b> : <b>{row.name}</b>} <span className="chip">{row.carriers} model{row.carriers === 1 ? '' : 's'}</span>
      <div className="chips">
        {foes.length === 0 && <span className="dim small">No enemy on the table.</span>}
        {open
          ? foes.map((id) => <TargetChip key={id} attackerId={attackerId} weaponId={row.weaponId} targetId={id} />)
          : foes.length > 0 && <button className="chip pick" data-testid={`weapon-open-${row.weaponId}`} onClick={() => setOpen(true)}>Show targets</button>}
      </div>
    </div>
  )
}

export function WeaponPanel() {
  const sel = useFocus((f) => f.selectedUnitId)
  const unit = usePresentedUnit(sel)
  const def = useUnitDefOf(sel)
  const state = usePresented()
  const viewer = useViewerSeat()
  const mine = !!unit && unit.owner === viewer && unit.location === 'table'
  const rows: Row[] = useMemo(() => {
    if (!mine || !unit || !def || !state) return []
    const carried = new Map<string, number>()
    for (const id of unit.modelIds) {
      const m = state.models[id]
      if (!m || m.life === 'dead') continue
      for (const w of m.weapons) carried.set(w, (carried.get(w) ?? 0) + 1)
    }
    return [...carried.entries()].map(([weaponId, n]) => { const w = data.weapons(def).find((x) => x.id === weaponId); return { weaponId, name: w?.name ?? weaponId, carriers: n, def: w } })
  }, [mine, unit, def, state])
  const foes = useMemo(() => (unit && state ? Object.values(state.units).filter((u) => u.owner !== unit.owner && u.location === 'table').map((u) => u.id) : []), [unit, state])
  if (!mine || !unit || rows.length < 2) return null
  return (
    <section className="panel-sec" data-testid="weapon-panel">
      <PanelHead>Weapons</PanelHead>
      <p className="dim small">Each profile is its own Batch. Hover a weapon to list its targets, then a target to preview it.</p>
      {rows.map((r) => <WeaponRowView key={`${unit.id}:${r.weaponId}`} row={r} attackerId={unit.id} foes={foes} />)}
    </section>
  )
}

// ---------- odds panel ----------
function Rows({ rows }: { rows: OddsRow[] }) {
  return (
    <dl className="odds">
      {rows.map((r) => (
        <div key={r.label} className={`orow ${r.tone ?? ''}`}>
          <dt>{r.hint ? <Tip title={r.label} body={r.hint}><span tabIndex={0}>{r.label}</span></Tip> : r.label}</dt>
          <dd>{r.value}</dd>
        </div>
      ))}
    </dl>
  )
}
function AttackOdds({ a, w, t }: { a: string; w: string; t: string }) {
  const p = useAttackPreview(a, w, t)
  const cover = useCover(a, t)
  const state = usePresented()
  if (!p) return null
  const rows = attackOddsRows(p)
  if (cover && cover !== 'none') rows.splice(Math.min(2, rows.length), 0, { label: 'Target cover', value: cover === 'highGround' ? 'high ground' : cover, hint: 'Cover the target gets against this attacker.' })
  return (
    <>
      <p className="small"><b>{unitName(state, a)}</b> with {weaponName(state, a, w)} {'->'} <b>{unitName(state, t)}</b></p>
      <Rows rows={rows} />
      {p.modelsRemoved.length > 1 && (
        <div className="small dim" data-testid="odds-removed">Models removed: {p.modelsRemoved.map((q, k) => (q >= 0.005 ? `${k}: ${Math.round(q * 100)}%` : null)).filter(Boolean).join(', ')}</div>
      )}
    </>
  )
}
function ChargeOddsView({ u, ts }: { u: string; ts: string[] }) {
  const c = useChargeOdds(u, ts)
  const state = usePresented()
  if (!c) return null
  return (
    <>
      <p className="small"><b>{unitName(state, u)}</b> charges {ts.map((t) => unitName(state, t)).join(', ')}</p>
      <Rows rows={chargeOddsRows(c)} />
    </>
  )
}
export function OddsPanel() {
  const target = useFocus((f) => f.target)
  if (!target) return null
  return (
    <section className="panel-sec odds-panel" data-testid="odds-panel">
      <PanelHead>Odds</PanelHead>
      {target.kind === 'attack'
        ? <AttackOdds a={target.attackerUnitId} w={target.weaponId} t={target.targetUnitId} />
        : <ChargeOddsView u={target.unitId} ts={target.targetIds} />}
    </section>
  )
}

// ---------- event feed ----------
function FeedSkill({ line, state }: { line: FeedLine; state: GameState | null }) {
  const sk = line.skill!
  const b = getBundle()
  const hit = findAbility(b, state, sk.abilityId, sk.source)
  return <>{sk.before}{hit ? <SkillName info={abilityInfo(hit.ability, b, { cardName: hit.cardName })} testid="feed-skill" /> : sk.name}{sk.after}</>
}

export function EventFeed() {
  const feed = useFeed()
  const state = usePresented()
  const box = useRef<HTMLDivElement>(null)
  const lines = useMemo(() => feedLines(feed, state).slice(-120), [feed, state])
  const last = lines[lines.length - 1]?.id
  // follow the newest line (the list is capped, so the length alone cannot be the trigger)
  useEffect(() => { const el = box.current; if (el) el.scrollTop = el.scrollHeight }, [last, lines.length])
  return (
    <section className="panel-sec" data-testid="event-feed">
      <PanelHead>What happened</PanelHead>
      <div className="feed" ref={box} role="log" aria-live="polite">
        {lines.length === 0 && <p className="dim small">Nothing yet.</p>}
        {lines.map((f, i) => <p key={`${f.id}:${i}`} className={f.head ? 'head' : 'small'}>{f.skill ? <FeedSkill line={f} state={state} /> : f.text}</p>)}
      </div>
    </section>
  )
}


function weaponName(state: GameState | null, unitId: string, weaponId: string): string {
  const u = state?.units[unitId]
  const def = u ? data.unit(u.profileId) : undefined
  return (def ? data.weapons(def).find((x) => x.id === weaponId)?.name : undefined) ?? weaponId
}
