// DOM half of the figures: status icon rows (one per unit) and damage pops. Mounted in the Board's label layer.
import { usePresented, usePresentedUnits } from '../contract'
import { useFigureHeight } from './FigureBody'
import { Pops } from './Pops'
import { UnitStatusIcons } from './StatusIcons'

function UnitIcons({ unitId }: { unitId: string }) {
  const units = usePresentedUnits()
  const presented = usePresented()
  const u = units?.[unitId]
  const lead = u?.leadingModelId ? presented?.models[u.leadingModelId] : undefined
  const h = useFigureHeight(u?.profileId ?? '', lead?.base ?? 32)
  return <UnitStatusIcons unitId={unitId} height={h} />
}

export function FigureLabels() {
  const units = usePresentedUnits()
  return (
    <>
      {Object.keys(units ?? {}).map((id) => <UnitIcons key={id} unitId={id} />)}
      <Pops />
    </>
  )
}
