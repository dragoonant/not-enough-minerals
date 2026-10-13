// Mission Card and Deployment Card records for the start-screen briefing preview. Reads the data JSON directly (no engine,
// no bundle): the in-game briefing reads the same cards through contract.ts.
const missionFiles = import.meta.glob('../../../../data/*/missions/*.json', { eager: true, import: 'default' }) as Record<string, unknown>
const deploymentFiles = import.meta.glob('../../../../data/*/deployments/*.json', { eager: true, import: 'default' }) as Record<string, unknown>

export interface MissionPreview { id: string; name: string; gameLength: number; text: string; startSupply: number }
export interface SegmentPreview { edge: 'N' | 'S' | 'E' | 'W'; from: number; to: number }
export interface DeploymentPreview {
  id: string; name: string; size: { w: number; h: number }
  entryEdges: { red: SegmentPreview[]; blue: SegmentPreview[] }
  markers: { n: number; x: number; y: number }[]
}

function records<T extends { id: string }>(files: Record<string, unknown>): T[] {
  const out: T[] = []
  for (const json of Object.values(files)) for (const r of (Array.isArray(json) ? json : [json]) as Partial<T>[]) if (r && typeof r.id === 'string') out.push(r as T)
  return out
}
const MISSIONS = records<MissionPreview>(missionFiles)
const DEPLOYMENTS = records<DeploymentPreview>(deploymentFiles)

export const missionPreview = (id: string | null | undefined): MissionPreview | undefined => MISSIONS.find((m) => m.id === id)
export const deploymentPreview = (id: string | null | undefined): DeploymentPreview | undefined => DEPLOYMENTS.find((d) => d.id === id)
