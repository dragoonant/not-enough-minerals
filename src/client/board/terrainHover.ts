// Terrain hover card: what a piece is under the rules (type, height, footprint, cover and line-of-sight notes), read from the
// engine's own traits so the card can never disagree with the rules. The card is one plain DOM element inside the board
// (the Canvas cannot render DOM), moved with the pointer; the exact footprint outline is drawn by Terrain.tsx.
import { terrainTraits } from '../../engine/terrain'
import type { TerrainInstance, TerrainRulesType } from '../../engine/types'

const TYPE_LABEL: Record<TerrainRulesType, string> = {
  obstacle: 'Obstacle', obstruction: 'Obstruction', building: 'Building', hill: 'Hill', forest: 'Forest', shallowWater: 'Shallow water',
  deepWater: 'Deep water', rough: 'Rough ground', rubble: 'Rubble', trench: 'Trench', hazard: 'Hazard', scenarioTerrain: 'Scenario terrain',
}

export interface TerrainInfo { title: string; lines: string[] }

const inch = (n: number): string => `${Math.round(n * 100) / 100}"`

/** Card text for a piece: title, then short rules lines. Pure. */
export function terrainInfo(t: TerrainInstance): TerrainInfo {
  const tr = terrainTraits(t)
  const f = t.footprint
  const shape = 'circle' in f ? `round, radius ${inch(f.circle.r)}` : 'rect' in f ? `${inch(f.rect.w)} x ${inch(f.rect.d)}` : `${f.polygon.length}-sided`
  const lines = [`Height ${inch(t.height)}, footprint ${shape}`]
  lines.push(tr.move === 'impassable' ? 'Impassable to ground models' : tr.move === 'obstacle' ? 'Obstacle: crossing follows the Terrain rules' : tr.rough ? 'Rough ground' : 'Open ground')
  if (tr.forest) lines.push(`Forest: sight reaches ${inch(tr.losThrough)} in`)
  else if (tr.blocksLos) lines.push('Blocks line of sight by height')
  else lines.push('Does not block line of sight')
  if (tr.cover !== 'none') lines.push(`Gives ${tr.cover} within 1" along a line`)
  if (tr.insideCover !== 'none') lines.push(`Gives ${tr.insideCover} to models completely inside`)
  if (tr.elevation > 0) lines.push(`Models on top stand ${inch(tr.elevation)} up`)
  if (tr.hazard) lines.push('Hazard')
  return { title: TYPE_LABEL[tr.type] ?? tr.type, lines }
}

let card: HTMLDivElement | null = null

function ensure(): HTMLDivElement | null {
  if (typeof document === 'undefined') return null
  if (card?.isConnected) return card
  const host = document.querySelector('[data-testid="board"]')
  if (!host) return null
  card = document.createElement('div')
  card.setAttribute('data-testid', 'terrain-card')
  card.setAttribute('role', 'status')
  card.style.cssText = ['position:absolute', 'left:0', 'top:0', 'z-index:5', 'pointer-events:none', 'display:none', 'max-width:260px',
    'padding:8px 10px', 'border-radius:6px', 'background:rgba(20,17,13,0.92)', 'border:1px solid #6a5a3c', 'color:#eadfca',
    'font:12px/1.4 system-ui,sans-serif', 'box-shadow:0 4px 14px rgba(0,0,0,0.5)'].join(';')
  host.appendChild(card)
  return card
}

/** Show (or move) the card for `info` at client coordinates (x, y). */
export function showTerrainCard(info: TerrainInfo, clientX: number, clientY: number): void {
  const el = ensure()
  if (!el) return
  const host = el.parentElement!.getBoundingClientRect()
  if (el.dataset['title'] !== info.title + info.lines.join('|')) {
    el.dataset['title'] = info.title + info.lines.join('|')
    el.replaceChildren()
    const h = document.createElement('div')
    h.style.cssText = 'font-weight:600;color:#ffe08a;margin-bottom:2px'
    h.textContent = info.title
    el.appendChild(h)
    for (const l of info.lines) { const d = document.createElement('div'); d.textContent = l; el.appendChild(d) }
  }
  el.style.display = 'block'
  const w = el.offsetWidth, hgt = el.offsetHeight
  const x = Math.min(Math.max(8, clientX - host.left + 16), host.width - w - 8)
  const y = Math.min(Math.max(8, clientY - host.top + 16), host.height - hgt - 8)
  el.style.transform = `translate(${x}px, ${y}px)`
}

export function hideTerrainCard(): void {
  if (card) card.style.display = 'none'
}
