// Pure read helpers over an EditionBundle (no Vite, no fs): safe for the engine, the AI worker and Node tools.
import type { CostTableDef, CostUnitRow, EditionBundle } from './types'

/** The newest Cost Table (by date), with every costs/ file of that table merged. */
export function mergedCostTable(b: EditionBundle): { table: string; date: string; units: Record<string, CostUnitRow>; cards: Record<string, number> } | null {
  const parts = [...b.records.costs].sort((x: CostTableDef, y: CostTableDef) => y.date.localeCompare(x.date))
  const newest = parts[0]
  if (!newest) return null
  const same = parts.filter((t) => t.table === newest.table)
  return {
    table: newest.table, date: newest.date,
    units: Object.assign({}, ...same.map((t) => t.units)),
    cards: Object.assign({}, ...same.map((t) => t.cards)),
  }
}
