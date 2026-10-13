// Start-chunk catalog (no engine, no full data bundle): the Mission and Deployment Cards of the default edition by id,
// name and scale, so the start screen can list them and resolveLaunch() can pick one at random. The full records (text,
// scoring, entry edges) are read in game through contract.ts (useMission / useDeployment).
const editionsFile = (import.meta.glob('../../../data/editions.json', { eager: true, import: 'default' }) as Record<string, { default?: string }>)
const missionFiles = import.meta.glob('../../../data/*/missions/*.json', { eager: true, import: 'default' }) as Record<string, unknown>
const deploymentFiles = import.meta.glob('../../../data/*/deployments/*.json', { eager: true, import: 'default' }) as Record<string, unknown>

export type Scale = 'skirmish' | 'standard' | 'grand-offensive'
export interface CardChoice { id: string; name: string; scale: Scale; /** Missions only: number of Rounds. */ gameLength?: number }

export const CATALOG_EDITION: string = Object.values(editionsFile)[0]?.default ?? 'sc-2026-10'

function collect(files: Record<string, unknown>, edition: string): CardChoice[] {
  const out: CardChoice[] = []
  for (const [path, json] of Object.entries(files)) {
    if (!path.includes(`/data/${edition}/`)) continue
    for (const r of (Array.isArray(json) ? json : [json]) as Partial<CardChoice>[]) {
      if (r && typeof r.id === 'string' && typeof r.name === 'string') {
        out.push({ id: r.id, name: r.name, scale: (r.scale ?? 'skirmish') as Scale, ...(typeof r.gameLength === 'number' ? { gameLength: r.gameLength } : {}) })
      }
    }
  }
  return out.sort((a, b) => a.name.localeCompare(b.name) || a.id.localeCompare(b.id))
}

const MISSIONS = collect(missionFiles, CATALOG_EDITION)
const DEPLOYMENTS = collect(deploymentFiles, CATALOG_EDITION)

/** Mission Cards for a scale (default skirmish), sorted by name. */
export const missionChoices = (scale: Scale = 'skirmish'): readonly CardChoice[] => MISSIONS.filter((m) => m.scale === scale)
/** Deployment Cards for a scale (default skirmish), sorted by name. */
export const deploymentChoices = (scale: Scale = 'skirmish'): readonly CardChoice[] => DEPLOYMENTS.filter((d) => d.scale === scale)
export const missionChoice = (id: string | null | undefined): CardChoice | undefined => MISSIONS.find((m) => m.id === id)
export const deploymentChoice = (id: string | null | undefined): CardChoice | undefined => DEPLOYMENTS.find((d) => d.id === id)
