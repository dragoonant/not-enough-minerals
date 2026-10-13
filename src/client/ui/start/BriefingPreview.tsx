// Start-screen briefing preview: what the chosen mission asks, how long it runs, and a small map of the deployment
// (entry edges and Mission Markers). Our own wording around the card text; no rules number is computed here.
import { deploymentPreview, missionPreview, type DeploymentPreview, type SegmentPreview } from './scenarioPreview'

function segRect(s: SegmentPreview, w: number, h: number): { x: number; y: number; w: number; h: number } {
  const t = 1.6
  // Card frame: origin bottom-left, y up. SVG y runs down, so flip.
  switch (s.edge) {
    case 'N': return { x: s.from, y: 0, w: s.to - s.from, h: t }
    case 'S': return { x: s.from, y: h - t, w: s.to - s.from, h: t }
    case 'W': return { x: 0, y: h - s.to, w: t, h: s.to - s.from }
    default: return { x: w - t, y: h - s.to, w: t, h: s.to - s.from }
  }
}

export function DeploymentMap({ d }: { d: DeploymentPreview }) {
  const { w, h } = d.size
  return (
    <svg className="bp-map" data-testid="briefing-map" viewBox={`-1 -1 ${w + 2} ${h + 2}`} role="img" aria-label={`Map of the ${d.name} deployment`}>
      <rect x="0" y="0" width={w} height={h} fill="#10171f" stroke="#46515c" strokeWidth="0.4" />
      {(['red', 'blue'] as const).flatMap((side) => d.entryEdges[side].map((s, i) => {
        const r = segRect(s, w, h)
        return <rect key={`${side}${i}`} {...r} fill={side === 'red' ? '#e0a03a' : '#59b8d6'} opacity="0.9" />
      }))}
      {d.markers.map((m) => (
        <g key={m.n} transform={`translate(${m.x} ${h - m.y})`}>
          <circle r="2.6" fill="#1b232d" stroke={m.n === 5 ? '#dfe6ee' : m.n % 2 ? '#e0a03a' : '#59b8d6'} strokeWidth="0.6" />
          <text textAnchor="middle" dy="1.1" fontSize="3.2" fill="#dfe6ee">{m.n}</text>
        </g>
      ))}
    </svg>
  )
}

export function BriefingPreview({ missionId, deploymentId, locked }: { missionId: string | null; deploymentId: string | null; locked?: boolean }) {
  const mission = missionPreview(missionId)
  const dep = deploymentPreview(deploymentId)
  return (
    <div className="bp" data-testid="briefing-preview">
      {locked && <p className="bp-note">The learning game uses a fixed mission and map.</p>}
      {!locked && !mission && <p className="bp-note" data-testid="briefing-random">Left to chance: the mission is drawn when you deploy, and the briefing opens at the table.</p>}
      {mission && (
        <>
          <h3 className="bp-title" data-testid="briefing-mission">{mission.name}</h3>
          <p className="bp-meta">{mission.gameLength} rounds. Start with {mission.startSupply} Supply on the table.</p>
          <p className="bp-text">{mission.text}</p>
        </>
      )}
      {dep && (
        <div className="bp-dep">
          <DeploymentMap d={dep} />
          <div>
            <h3 className="bp-title">{dep.name}</h3>
            <p className="bp-meta"><span className="bp-key bp-red" />Red edges <span className="bp-key bp-blue" />Blue edges, numbered rings are Mission Markers.</p>
          </div>
        </div>
      )}
      {!locked && !dep && deploymentId === null && <p className="bp-note">The deployment map is drawn when you deploy.</p>}
    </div>
  )
}
