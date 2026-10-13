// Floating damage / miss / removed / condition words over a model, driven by the presentation director's pop list.
import { Anchored } from '../board/Anchored'
import { useDamagePops, type DamagePop } from '../contract'

const TONE: Record<DamagePop['tone'], string> = { damage: '#ff7a5c', miss: '#aeb9c4', removed: '#ffd166', condition: '#7fd1ec' }

export function Pops() {
  const pops = useDamagePops()
  return (
    <>
      {pops.map((p) => (
        <Anchored key={p.id} model={p.modelId} dy={1.8} rise={{ t0: p.startedAt, dur: p.durationMs }} testid="damage-pop">
          <div data-tone={p.tone} style={{ font: '800 15px/1 "Bahnschrift", "Segoe UI", system-ui, sans-serif', color: TONE[p.tone], textShadow: '0 1px 3px #000, 0 0 6px #000' }}>{p.text}</div>
        </Anchored>
      ))}
    </>
  )
}
