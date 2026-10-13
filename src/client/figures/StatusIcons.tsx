// Status icons over each unit (spec 50 s3): Activation Marker face, BURROWED, HIDDEN, STATIONARY, SIEGE MODE, SHIELDED,
// BUFF/DEBUFF, Out of Coherency and the damage marker value. Our own simple glyphs. The layout is stable: slots follow one
// fixed order, so an icon never jumps when another appears (the row only grows to the right). Reads unit state only; it
// computes no rules number (damage is the unit's Damage Marker).
import type { ReactElement } from 'react'
import { Anchored } from '../board/Anchored'
import { usePresentedUnit, unitName, usePresented, useDetectedUnits } from '../contract'
import { Tip } from '../ui/Tooltip'
import type { UnitState } from '../../engine/types'

export type StatusKind = 'activated-move' | 'activated-assault' | 'burrowed' | 'hidden' | 'detected' | 'stationary' | 'siege' | 'shielded' | 'buff' | 'debuff' | 'coherency' | 'damage'

/** Fixed slot order; the layout of a unit is the filter of this list by what it currently holds. */
export const STATUS_ORDER: StatusKind[] = ['activated-move', 'activated-assault', 'damage', 'shielded', 'burrowed', 'hidden', 'detected', 'siege', 'stationary', 'buff', 'debuff', 'coherency']

/** `detected`: the unit sits inside an enemy detector area (engine query detectedUnits). */
export function statusesOf(u: UnitState, detected = false): StatusKind[] {
  const held = new Set<StatusKind>()
  if (u.activation === 'movement') held.add('activated-move')
  if (u.activation === 'assault') held.add('activated-assault')
  if (u.damage > 0) held.add('damage')
  if (u.shielded) held.add('shielded')
  for (const e of u.effects) {
    if (e.kind === 'status') {
      if (e.status === 'BURROWED') held.add('burrowed')
      else if (e.status === 'HIDDEN') held.add('hidden')
      else if (e.status === 'STATIONARY') held.add('stationary')
      else if (e.status === 'SIEGE_MODE') held.add('siege')
    } else if (e.kind === 'buff') held.add('buff')
    else if (e.kind === 'debuff') held.add('debuff')
  }
  if (u.location === 'table' && !u.inCoherency) held.add('coherency')
  if (detected) held.add('detected')
  return STATUS_ORDER.filter((k) => held.has(k))
}

const LABEL: Record<StatusKind, string> = {
  'activated-move': 'Activated: Movement face', 'activated-assault': 'Activated: Assault face', burrowed: 'Burrowed', hidden: 'Hidden', detected: 'Detected: an enemy detector sees it',
  stationary: 'Stationary', siege: 'Siege mode', shielded: 'Shielded', buff: 'Buffed', debuff: 'Debuffed', coherency: 'Out of Coherency', damage: 'Damage marker',
}
const TINT: Record<StatusKind, string> = {
  'activated-move': '#59b8d6', 'activated-assault': '#e0a03a', burrowed: '#a0865a', hidden: '#9aa7b4', detected: '#e0603f', stationary: '#7fd1a0', siege: '#e0a03a',
  shielded: '#59b8d6', buff: '#7fd1a0', debuff: '#e0603f', coherency: '#e0603f', damage: '#e0603f',
}

function Glyph({ kind, damage }: { kind: StatusKind; damage: number }): ReactElement {
  const p = { width: 14, height: 14, viewBox: '0 0 14 14', fill: 'none', stroke: 'currentColor', strokeWidth: 1.6, strokeLinecap: 'round' as const, strokeLinejoin: 'round' as const }
  switch (kind) {
    case 'activated-move': return <svg {...p}><path d="M3 3l5 4-5 4M8 3l4 4-4 4" /></svg>
    case 'activated-assault': return <svg {...p}><circle cx="7" cy="7" r="4" /><path d="M7 1v3M7 10v3M1 7h3M10 7h3" /></svg>
    case 'burrowed': return <svg {...p}><path d="M2 5h10M3.5 8h7M5 11h4" /></svg>
    case 'hidden': return <svg {...p}><path d="M1 7c2-3.5 10-3.5 12 0-2 3.5-10 3.5-12 0z" /><path d="M2 12L12 2" /></svg>
    case 'detected': return <svg {...p}><circle cx="7" cy="7" r="5" /><circle cx="7" cy="7" r="1.6" /><path d="M7 0.5v2M7 11.5v2M0.5 7h2M11.5 7h2" /></svg>
    case 'stationary': return <svg {...p}><rect x="3" y="3" width="8" height="8" rx="1" /></svg>
    case 'siege': return <svg {...p}><path d="M7 2l5 9H2z" /></svg>
    case 'shielded': return <svg {...p}><path d="M7 1.5l5 2v3.5c0 3-2.2 4.7-5 5.5-2.8-.8-5-2.5-5-5.5V3.5z" /></svg>
    case 'buff': return <svg {...p}><path d="M7 12V3M3.5 6.5L7 3l3.5 3.5" /></svg>
    case 'debuff': return <svg {...p}><path d="M7 2v9M3.5 7.5L7 11l3.5-3.5" /></svg>
    case 'coherency': return <svg {...p}><path d="M5 9a2.5 2.5 0 010-4l1-1M9 5a2.5 2.5 0 010 4l-1 1M2 12l10-10" /></svg>
    case 'damage': return <span style={{ font: '700 11px/14px "Segoe UI", system-ui, sans-serif' }}>{damage}</span>
  }
}

const chip = (kind: StatusKind): React.CSSProperties => ({
  minWidth: 20, height: 20, padding: '0 3px', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', boxSizing: 'border-box',
  borderRadius: 4, border: `1px solid ${TINT[kind]}`, color: TINT[kind], background: 'rgba(15,20,27,0.8)',
})

/** Icon row over a unit's Leading Model (or its first model on the table). One component per unit. */
export function UnitStatusIcons({ unitId, height }: { unitId: string; height: number }) {
  const unit = usePresentedUnit(unitId)
  const presented = usePresented()
  const detected = useDetectedUnits()
  const live = (id: string | null | undefined) => { const m = id ? presented?.models[id] : undefined; return !!m && m.life !== 'dead' && !m.offTable }
  const lead = unit && live(unit.leadingModelId) ? unit.leadingModelId : unit?.modelIds.find(live)
  if (!unit || unit.location !== 'table' || !lead) return null
  const kinds = statusesOf(unit, !!detected?.includes(unitId))
  if (!kinds.length) return null
  return (
    <Anchored model={lead} dy={height + 0.5} testid={`status-${unitId}`}>
      <div data-kinds={kinds.join(',')} aria-label={`${unitName(presented, unitId)}: ${kinds.map((k) => LABEL[k]).join(', ')}`} style={{ display: 'flex', gap: 2 }}>
        {kinds.map((k) => (
          <Tip key={k} title={LABEL[k]}><span data-status={k} style={{ ...chip(k), pointerEvents: 'auto' }}><Glyph kind={k} damage={unit.damage} /></span></Tip>
        ))}
      </div>
    </Anchored>
  )
}
