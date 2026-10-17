// URL test hooks (spec 00 s8, spec 50 s7, KNOWLEDGE-BASE 1.5). Parsing only: this file stays in the start chunk (no
// engine imports).
//   ?test=1              skip the start screen and expose window.__game (installed by store/testHooks.ts at boot):
//                        { getState, view(seat), pending, legalActions, submit(action), pauseBots(bool), setSpeed(n), params }
//   ?seats=human,bot     one controller per seat in seat order: human,bot | bot,bot | human,human (hot-seat)
//   ?seed=<word>         repeatable games; put the seed in every bug report
//   ?matchup=<id>        founders (default) | tvz | tvp | zvp | tvt | zvz | pvp | first-battle | demo (M0 placeholder table)
//   ?mission=<id|random> Mission Card id (e.g. frontlines-skirmish) or random;  ?deployment=<id|random> likewise
//   ?map=sunken-shrine   use the original Sunken Shrine temple map instead of the rules' map roll (default roll)
//   ?draft=1             run the Mission / Deployment draft as decisions
//   ?speed=fast          animation speed: instant | fast | normal | slow | <number> (0 = instant)
//   ?tier=random|easy|normal  bot tier;  ?fps  frame-rate meter;  ?gallery  figure gallery
//   ?menu=1              stay on the start screen even with ?test=1 (e2e drives the menu; the briefing then opens)
// Any of test/seats/matchup/mission/deployment/draft/gallery also skips the start screen (unless ?menu=1).
import type { NewGameOptions } from './store/launch'

export type SeatController = 'human' | 'bot'

export interface Params {
  test: boolean
  /** Controllers in seat order (seat 0 is the near edge). */
  seats: SeatController[]
  /** True when ?seats was given explicitly. */
  seatsGiven: boolean
  seed: string | null
  /** ?matchup (a MatchupId or 'demo'), or null for the default. */
  matchup: string | null
  mission: string | null
  deployment: string | null
  draft: boolean
  /** ?map=sunken-shrine, or null for the rolled map. */
  map: 'sunken-shrine' | null
  /** Bot tier from ?tier (random | easy | normal), or null for the default. */
  tier: string | null
  /** Speed multiplier from ?speed, or null to keep the saved setting. */
  speed: number | null
  gallery: boolean
  fps: boolean
  /** ?menu=1: keep the start screen (test hooks still install). */
  menu: boolean
  /** Start straight into a game. */
  autostart: boolean
}

export const SPEED_WORDS: Record<string, number> = { instant: 0, fast: 3, normal: 1, slow: 0.5 }

export function parseSpeed(v: string | null): number | null {
  if (v === null || v === '') return null
  if (v in SPEED_WORDS) return SPEED_WORDS[v]!
  const n = Number(v)
  return Number.isFinite(n) && n >= 0 ? n : null
}

export function readParams(search = typeof location === 'undefined' ? '' : location.search): Params {
  const q = new URLSearchParams(search)
  const seatsRaw = q.get('seats')
  const seats = (seatsRaw ?? 'human,bot').split(',').map((s) => s.trim().toLowerCase())
    .filter(Boolean).map((s): SeatController => (s === 'bot' || s === 'ai' ? 'bot' : 'human'))
  const test = q.get('test') === '1'
  const draft = q.get('draft') === '1'
  return {
    test,
    seats: seats.length >= 2 ? seats : ['human', 'bot'],
    seatsGiven: seatsRaw !== null,
    seed: q.get('seed'),
    matchup: q.get('matchup'),
    mission: q.get('mission'),
    deployment: q.get('deployment'),
    draft,
    map: q.get('map') === 'sunken-shrine' ? 'sunken-shrine' : null,
    tier: q.get('tier'),
    speed: parseSpeed(q.get('speed')),
    gallery: q.has('gallery'),
    fps: q.has('fps'),
    menu: q.get('menu') === '1',
    autostart: q.get('menu') !== '1' && (test || seatsRaw !== null || q.has('matchup') || q.has('mission') || q.has('deployment') || q.has('map') || draft || q.has('gallery')),
  }
}

/** The new-game options the URL asks for (used when ?test / ?seats / ?matchup... skip the start screen). */
export function paramsLaunch(p: Params = readParams()): NewGameOptions {
  return {
    seats: p.seats,
    ...(p.seed ? { seed: p.seed } : {}),
    ...(p.matchup === 'demo' ? { demo: true } : p.matchup ? { matchup: p.matchup as NewGameOptions['matchup'] } : {}),
    ...(p.mission ? { missionId: p.mission } : {}),
    ...(p.deployment ? { deploymentId: p.deployment } : {}),
    ...(p.draft ? { draft: true } : {}),
    ...(p.map ? { map: p.map } : {}),
    ...(p.tier ? { tier: p.tier } : {}),
  }
}
