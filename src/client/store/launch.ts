// Launch surface for the START CHUNK (App + StartScreen). No engine or full-data imports here: the game screen, engine
// and data load lazily when a game starts. StartScreen imports from this file, store/catalog.ts and store/settingsStore.ts,
// never from contract.ts.
import { create } from 'zustand'
import { readParams, type SeatController } from '../params'
import { CATALOG_EDITION, deploymentChoices, missionChoices, type Scale } from './catalog'
import { readJson } from './storage'

export type { SeatController }
export { deploymentChoices, missionChoices, missionChoice, deploymentChoice, type CardChoice, type Scale } from './catalog'

// ---------------------------------------------------------------- matchups
export type Race = 'terran' | 'zerg' | 'protoss'
export type MatchupId = 'founders' | 'tvz' | 'tvp' | 'zvp' | 'tvt' | 'zvz' | 'pvp'
  | 'tvz-x' | 'tvp-x' | 'zvp-x' | 'tvt-x' | 'zvz-x' | 'pvp-x' | 'first-battle'
export interface Matchup {
  id: MatchupId
  /** Short label, our words. */
  label: string
  blurb: string
  /** Race per seat (seat 0 = near edge). */
  races: [Race, Race]
  /** Army preset id per seat (data/<edition>/presets). */
  armies: [string, string]
  scale: Scale
  /** Engine set-up preset (spec 17 s9) when the matchup is the learning game. */
  preset?: 'first-battle'
}

export const MATCHUPS: readonly Matchup[] = [
  { id: 'founders', label: 'Terran vs Zerg (Founders Edition)', blurb: 'The two-player box: Raynor\'s Raiders against Kerrigan\'s Swarm.', races: ['terran', 'zerg'], armies: ['terran-founders', 'zerg-founders'], scale: 'skirmish' },
  { id: 'tvz', label: 'Terran vs Zerg', blurb: 'Starter forces: drilled infantry against the swarm.', races: ['terran', 'zerg'], armies: ['terran-starter', 'zerg-starter'], scale: 'skirmish' },
  { id: 'tvp', label: 'Terran vs Protoss', blurb: 'Starter forces: numbers and armour against shields and psionics.', races: ['terran', 'protoss'], armies: ['terran-starter', 'protoss-starter'], scale: 'skirmish' },
  { id: 'zvp', label: 'Zerg vs Protoss', blurb: 'Starter forces: a tide of claws against a few elite warriors.', races: ['zerg', 'protoss'], armies: ['zerg-starter', 'protoss-starter'], scale: 'skirmish' },
  { id: 'tvt', label: 'Terran mirror', blurb: 'Both players field the Terran starter force.', races: ['terran', 'terran'], armies: ['terran-starter', 'terran-starter'], scale: 'skirmish' },
  { id: 'zvz', label: 'Zerg mirror', blurb: 'Both players field the Zerg starter force.', races: ['zerg', 'zerg'], armies: ['zerg-starter', 'zerg-starter'], scale: 'skirmish' },
  { id: 'pvp', label: 'Protoss mirror', blurb: 'Both players field the Protoss starter force.', races: ['protoss', 'protoss'], armies: ['protoss-starter', 'protoss-starter'], scale: 'skirmish' },
  // Expanded (Wave 2) forces: the starter army plus that race's Wave 2 unit (Siege Tank, Ravager, Immortal and Zeratul).
  { id: 'tvz-x', label: 'Terran vs Zerg (Expanded)', blurb: 'Wave 2 forces: Siege Tanks against Ravagers.', races: ['terran', 'zerg'], armies: ['terran-expanded', 'zerg-expanded'], scale: 'skirmish' },
  { id: 'tvp-x', label: 'Terran vs Protoss (Expanded)', blurb: 'Wave 2 forces: Siege Tanks against Zeratul and an Immortal.', races: ['terran', 'protoss'], armies: ['terran-expanded', 'protoss-expanded'], scale: 'skirmish' },
  { id: 'zvp-x', label: 'Zerg vs Protoss (Expanded)', blurb: 'Wave 2 forces: Ravagers against Zeratul and an Immortal.', races: ['zerg', 'protoss'], armies: ['zerg-expanded', 'protoss-expanded'], scale: 'skirmish' },
  { id: 'tvt-x', label: 'Terran mirror (Expanded)', blurb: 'Both players field the Terran Wave 2 force.', races: ['terran', 'terran'], armies: ['terran-expanded', 'terran-expanded'], scale: 'skirmish' },
  { id: 'zvz-x', label: 'Zerg mirror (Expanded)', blurb: 'Both players field the Zerg Wave 2 force.', races: ['zerg', 'zerg'], armies: ['zerg-expanded', 'zerg-expanded'], scale: 'skirmish' },
  { id: 'pvp-x', label: 'Protoss mirror (Expanded)', blurb: 'Both players field the Protoss Wave 2 force.', races: ['protoss', 'protoss'], armies: ['protoss-expanded', 'protoss-expanded'], scale: 'skirmish' },
  { id: 'first-battle', label: 'First Battle (learning game)', blurb: 'Small fixed forces on a fixed mission: the gentlest start.', races: ['terran', 'zerg'], armies: ['first-battle-terran', 'first-battle-zerg'], scale: 'skirmish', preset: 'first-battle' },
]
export const DEFAULT_MATCHUP: MatchupId = 'founders'
export const matchupOf = (id: string | null | undefined): Matchup | undefined => MATCHUPS.find((m) => m.id === id)

export const RACES: readonly Race[] = ['terran', 'zerg', 'protoss']
export type Forces = 'starter' | 'expanded'
export const FORCES: readonly Forces[] = ['starter', 'expanded']
const suffixOf = (f: Forces) => (f === 'expanded' ? '-expanded' : '-starter')
const isForces = (m: Matchup, f: Forces) => !m.preset && m.armies.every((a) => a.endsWith(suffixOf(f)))
/** The matchup for a race pairing and a force choice (starter by default), and the seat the first race sits in (the start screen's pickers). */
export function matchupForRaces(mine: Race, theirs: Race, forces: Forces = 'starter'): { matchup: MatchupId; side: 0 | 1 } {
  const same = MATCHUPS.find((m) => isForces(m, forces) && m.races[0] === mine && m.races[1] === theirs)
  if (same) return { matchup: same.id, side: 0 }
  const flipped = MATCHUPS.find((m) => isForces(m, forces) && m.races[0] === theirs && m.races[1] === mine)
  return flipped ? { matchup: flipped.id, side: 1 } : { matchup: 'tvz', side: 0 }
}

// ---------------------------------------------------------------- options
/** Pick a card at random (seeded, so the same seed gives the same card). */
export const RANDOM = 'random'

/** What a new game needs. Seats are in seat order (index 0 = near edge, +z). */
export interface NewGameOptions {
  /** Army matchup (default DEFAULT_MATCHUP, the box-forces Terran vs Zerg). */
  matchup?: MatchupId
  /** Mission Card id, 'random', or omitted for the engine's default (Frontlines). */
  missionId?: string
  /** Deployment Card id, 'random', or omitted for the engine's default for the scale. */
  deploymentId?: string
  /** Run the Mission / Deployment draft as in-game decisions instead (spec 17 s4). */
  draft?: boolean
  /** Controller per seat, e.g. ['human','bot'] (vs bot, the default), ['human','human'] (hot-seat), ['bot','bot'] (watch). */
  seats?: SeatController[]
  /** Engine seed; random when omitted. */
  seed?: string
  /** Data edition (default from data/editions.json). */
  edition?: string
  /** Bot tier: random | easy | normal (default normal; every tier plays random until M4). */
  tier?: string
  /** The M0 placeholder table (tests and tools only). */
  demo?: boolean
}

/** A launch with every choice made: what the store builds the game from and what a save records. */
export interface ResolvedLaunch {
  matchup: MatchupId | null
  armies: [string, string] | null
  missionId: string | null
  deploymentId: string | null
  preset: 'first-battle' | null
  draft: boolean
  demo: boolean
  tier: string
  edition: string
}

/** Small stable string hash (FNV-1a) for seeded picks outside the engine RNG. */
export function hashString(s: string): number {
  let h = 0x811c9dc5
  for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 0x01000193) >>> 0 }
  return h >>> 0
}
function pick<T>(list: readonly T[], key: string): T | undefined {
  return list.length ? list[hashString(key) % list.length] : undefined
}

/** Fill every choice: matchup default, 'random' cards picked from the seed (pure; same seed, same cards). */
export function resolveLaunch(opts: NewGameOptions, seed: string): ResolvedLaunch {
  const tier = opts.tier ?? 'normal'
  const edition = opts.edition ?? CATALOG_EDITION
  if (opts.demo) return { matchup: null, armies: null, missionId: null, deploymentId: null, preset: null, draft: false, demo: true, tier, edition }
  const m = matchupOf(opts.matchup) ?? matchupOf(DEFAULT_MATCHUP)!
  const draft = !!opts.draft
  const missionId = draft ? null : opts.missionId === RANDOM ? pick(missionChoices(m.scale), `${seed}:mission`)?.id ?? null : opts.missionId ?? null
  const deploymentId = draft ? null : opts.deploymentId === RANDOM ? pick(deploymentChoices(m.scale), `${seed}:deployment`)?.id ?? null : opts.deploymentId ?? null
  return { matchup: m.id, armies: [...m.armies], missionId, deploymentId, preset: m.preset ?? null, draft, demo: false, tier, edition }
}

// ---------------------------------------------------------------- screens
export type Launch =
  | { id: number; mode: 'new'; opts: NewGameOptions }
  | { id: number; mode: 'continue' }

interface LaunchStore {
  screen: 'start' | 'game'
  launch: Launch | null
}

export const useLaunchStore = create<LaunchStore>(() => ({ screen: 'start', launch: null }))

let launchSeq = 0
/** Start a new game: switches to the (lazy) game screen, which creates the game. */
export function launchGame(opts: NewGameOptions = {}): void {
  // The menu path honours ?seed= so bug reports reproduce (an explicit seed from the start screen wins).
  if (!opts.seed) { const s = readParams().seed; if (s) opts = { ...opts, seed: s } }
  useLaunchStore.setState({ screen: 'game', launch: { id: ++launchSeq, mode: 'new', opts } })
}
/** Resume the autosave (check hasAutosave() first). */
export function continueGame(): void {
  useLaunchStore.setState({ screen: 'game', launch: { id: ++launchSeq, mode: 'continue' } })
}
/** Back to the start screen (the game stays in memory; Continue resumes from the autosave). */
export function backToMenu(): void {
  useLaunchStore.setState({ screen: 'start' })
}

// ---------------------------------------------------------------- autosave summary
export const AUTOSAVE_KEY = 'nem.save.auto'
export const SAVE_KIND = 'nem-save'
export const SAVE_VERSION = 2

/** Summary of the autosave, readable without the engine. */
export interface AutosaveSummary {
  savedAt: string; round: number; seats: SeatController[]; seed: string
  matchup: MatchupId | null; missionId: string | null; deploymentId: string | null
}

export function readAutosaveSummary(): AutosaveSummary | null {
  const d = readJson<{ kind?: string; v?: number; savedAt?: string; round?: number; seats?: SeatController[]; seed?: string; launch?: Partial<ResolvedLaunch> }>(AUTOSAVE_KEY)
  if (!d || d.kind !== SAVE_KIND || d.v !== SAVE_VERSION) return null
  return {
    savedAt: d.savedAt ?? '', round: d.round ?? 0, seats: d.seats ?? [], seed: d.seed ?? '',
    matchup: d.launch?.matchup ?? null, missionId: d.launch?.missionId ?? null, deploymentId: d.launch?.deploymentId ?? null,
  }
}
export const hasAutosave = (): boolean => readAutosaveSummary() !== null
