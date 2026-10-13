// Pure view helpers for the HUD (testable without React). Text here is our own wording. Nothing in this file decides a
// rules outcome: it formats numbers the engine produced (query results, cue payloads) and prints data records.
import type { MissionDef, ScoringRule } from '../../data/types'
import type { AttackPreview, ChargeOdds, Cue, FeedEntry } from '../contract'

export const pct = (p: number): string => `${Math.round(Math.min(1, Math.max(0, p)) * 100)}%`
export const fix1 = (n: number): string => (Math.round(n * 10) / 10).toString()
export const tn = (n: number | null | undefined): string => (n === null || n === undefined ? '-' : `${n}+`)

// ---------- briefing ----------
const rounds = (r: number[]): string => (r.length === 1 ? `Round ${r[0]}` : `Rounds ${r.join(', ')}`)

/** One plain-language line per scoring rule of the mission (our words; amounts come from the data). */
export function scoringLines(rules: readonly ScoringRule[]): string[] {
  const out: string[] = []
  for (const r of rules) {
    switch (r.kind) {
      case 'supplyDestroyed': out.push('Every point of Supply you strip from the enemy this Round is worth 1 VP at the end of it.'); break
      case 'perControlledMarker': {
        const parts = ([[r.vp.own, 'on your colour'], [r.vp.neutral, 'on the neutral one'], [r.vp.opponent, 'on the enemy colour']] as const).filter(([v]) => v > 0).map(([v, w]) => `${v} VP ${w}`)
        if (parts.length) out.push(`From Round ${r.fromRound}, each marker you control scores: ${parts.join(', ')}.`)
        break
      }
      case 'retakeBonus': out.push(`From Round ${r.fromRound}, taking back a marker you had lost scores ${r.vp} bonus VP.`); break
      case 'activatedMarkerCash': out.push(`From Round ${r.fromRound}, controlling a lit-up marker (shown as Activated) cashes it in for VP equal to the Round it lit up, and it leaves the table.`); break
      case 'quarters': out.push(`From Round ${r.fromRound}, each table quarter you hold scores ${r.vp} VP, plus ${r.controlBonus} more if you also control its marker.`); break
      case 'markerControlled': out.push(`From Round ${r.fromRound}, holding marker ${r.marker} scores ${r.vp} VP each Round.`); break
      case 'claimCarriedInZone': out.push(`${rounds(r.rounds)}: each carried marker standing in its carrier's own zone scores ${r.vp} VP.`); break
      case 'ownMarkersNotClaimed': out.push(`${rounds(r.rounds)}: each of your colour's markers that nobody has carried off scores ${r.vp} VP.`); break
      case 'code': out.push('This mission has a special scoring rule. The tracker shows what you would score right now.'); break
    }
  }
  return out
}

/** One line per Phase of a Round, for the briefing. */
export const PHASE_LINES: string[] = [
  'Movement: bring squads in from Reserves and move them across the table.',
  'Assault: squads move again, run, and charge into melee.',
  'Combat: squads shoot and fight.',
  'Scoring: markers are counted, Victory Points are awarded and the next Round begins.',
]

export interface BriefingModel {
  missionName: string
  deploymentName: string
  summary: string
  gameLength: number
  startSupply: number
  escalation: number
  scoring: string[]
  winLead: number | null
  markersStart: string
  phases: string[]
}
export function briefingModel(m: MissionDef, deploymentName: string): BriefingModel {
  return {
    missionName: m.name, deploymentName, summary: m.text, gameLength: m.gameLength, startSupply: m.startSupply, escalation: m.escalation,
    scoring: scoringLines(m.scoring), winLead: m.specialWinLead,
    markersStart: m.markerStart === 'activated' ? 'Every marker starts lit up (the game calls this Activated), so each one is worth taking from the first Round.' : 'Markers start dark; some light up (the game calls this Activated) as the game goes on.',
    phases: PHASE_LINES,
  }
}

/** The pool text. The exact figure per Round is the engine's (the Supply panel shows this Round's and the next). */
export function poolText(b: Pick<BriefingModel, 'startSupply' | 'escalation'>): string {
  return `Your Supply pool starts at ${b.startSupply} and grows by ${b.escalation} each Round. It is the most army you may have on the table at once.`
}

// ---------- first-turn hints ----------
export const GENERAL_HINTS: readonly string[] = [
  'Hover any unit to read its datasheet; click to keep it on screen.',
  "The glowing rings on the table show each marker's control zone. Stand inside one to contest it.",
  'The left panel keeps score: markers, Supply, and units waiting in Reserves.',
  'Choose Pass when you have nothing more worth doing; Hold keeps a unit in place.',
  "Drag a unit's Leading Model to move it. The ruler and the ghost formation show where everyone will stand.",
  'Hover an enemy while attacking to see the odds before you commit.',
]
const HINT_BY_KIND: Record<string, string> = {
  'turn.activate': 'Your turn to act: click a squad on the table (or bring one in from Reserves in the left panel), then choose what it does. Pass if you are done for this Phase.',
  'turn.first': 'You hold the First Player Marker, so you choose who takes the first turn this Phase.',
  'turn.choose': 'Choose how the Round continues.',
  'setup.firstPlayer': 'The roll-off winner decides who acts first. Going first lets you grab markers early; going second lets you answer.',
  'deploy.entry': 'Pick the edge segment where this unit comes on. Reserves arrive from your Entry Edge.',
  'deploy.path': 'Click a spot inside the shaded band to bring the unit on. It must fit inside the movement shown.',
  'move.path': "Drag the highlighted Leading Model. Stay in coherency, and mind the enemy's Engagement Range.",
  'move.place': 'Place the unit on the table; the ghost shows where the rest of the squad will stand.',
  'shoot.batch': 'Pick a weapon, then a target. Hover a target to read the odds first.',
  'charge.targets': 'Pick the enemy unit to charge. The panel shows the roll you need and your chance.',
  'melee.split': 'Split your attacks between the enemy units you are fighting.',
  'atk.casualty': 'Choose which models are removed from the damaged unit.',
}
export const hintFor = (kind: string | null | undefined): string | null => (kind ? HINT_BY_KIND[kind] ?? null : null)

// ---------- odds ----------
const EVADE_WORDS: Record<string, string> = {
  noEvade: 'this unit has no Evade',
  engagedRanged: 'engaged in melee and shot at',
  hiddenOrBurrowed: 'hidden or burrowed',
  indirectNoLos: 'shot without a line of sight',
  indomitable: 'shot by an Indomitable unit',
  highGround: 'attacker is on high ground',
  granted: 'granted by an ability',
}
/** Plain words for an engine Evade reason code (unknown codes pass through, tidied). */
export const evadeWords = (code: string): string => EVADE_WORDS[code] ?? prettyId(code).toLowerCase()

export interface OddsRow { label: string; value: string; hint?: string; tone?: 'good' | 'bad' | 'dim' }
export function attackOddsRows(p: AttackPreview): OddsRow[] {
  if (!p.legal) return [{ label: 'Cannot shoot', value: p.reason ?? 'Not a legal target', tone: 'bad' }]
  const dice = p.perModel.reduce((a, m) => a + m.dice, 0)
  const tns = [...new Set(p.perModel.map((m) => m.hitTN))]
  const rows: OddsRow[] = [
    { label: 'Attack dice', value: String(dice), hint: 'Total dice rolled by the models in this Batch.' },
    { label: 'Hit on', value: tns.map(tn).join(' / '), hint: 'The face each Attack Die needs to hit, after every modifier.' },
  ]
  if (p.surge.dice) rows.push({ label: 'Surge', value: `${p.surge.dice}, ${p.surge.tagMatch ? 'tag matches' : 'no tag match'}, about ${fix1(p.surge.expected)} dice move`, hint: 'The Surge Die moves dice into the Damage Pool when the target carries a matching tag.', tone: p.surge.tagMatch ? 'good' : 'dim' })
  rows.push({ label: 'Armour', value: p.armourTN === null ? 'no Armour roll' : tn(p.armourTN), hint: 'The face the target needs to save each hit.' })
  rows.push(p.evadeTN === null
    ? { label: 'Evade', value: p.evadeReason === 'noEvade' ? 'Never rolls Evade (structures have none)' : `No Evade roll${p.evadeReason ? ` (${evadeWords(p.evadeReason)})` : ''}`, tone: 'dim' }
    : { label: 'Evade', value: `${tn(p.evadeTN)}${p.evadeReason ? ` (${evadeWords(p.evadeReason)})` : ''}`, hint: 'The face the target needs to dodge what Armour did not stop.' })
  rows.push({ label: 'Expected damage', value: fix1(p.expectedDamage), hint: "Average damage added to the target's existing Damage Marker." })
  rows.push({ label: 'Kill chance', value: pct(p.killChance), tone: p.killChance >= 0.5 ? 'good' : undefined })
  rows.push({ label: 'Expected Supply removed', value: fix1(p.expectedSupplyRemoved), hint: 'Supply the enemy loses on average; in some missions it is also your VP.' })
  return rows
}
export function chargeOddsRows(c: ChargeOdds): OddsRow[] {
  if (c.needed === null) return [{ label: 'Cannot charge', value: c.reason === 'outOfReach' ? 'Out of reach' : (c.reason ?? 'No target'), tone: 'bad' }]
  return [
    { label: 'Roll needed', value: `${c.needed}+ on the charge roll`, hint: 'The Charge die must reach this to close the distance.' },
    { label: 'Chance', value: pct(c.chance), tone: c.chance >= 0.5 ? 'good' : 'bad' },
  ]
}

// ---------- VP breakdown for the end screen (from score cues in the feed) ----------
export interface VpLine { rule: string; vp: number }
export interface VpRound { round: number; vp: number; lines: VpLine[] }
const RULE_WORDS: Record<string, string> = {
  supplyDestroyed: 'Supply destroyed', perControlledMarker: 'Markers held', retakeBonus: 'Markers retaken', activatedMarkerCash: 'Activated markers cashed',
  quarters: 'Quarters held', markerControlled: 'Key marker held', claimCarriedInZone: 'Carried markers home', ownMarkersNotClaimed: 'Own markers kept', code: 'Special',
}
export const ruleWord = (r: string): string => RULE_WORDS[r] ?? r
function asLines(x: unknown): VpLine[] {
  if (!Array.isArray(x)) return []
  return x.filter((l): l is VpLine => !!l && typeof (l as VpLine).rule === 'string' && typeof (l as VpLine).vp === 'number').map((l) => ({ rule: l.rule, vp: l.vp }))
}
/** Per seat, per Round VP totals taken from the End of Round score cues. */
export function vpBreakdown(feed: readonly FeedEntry[]): Record<string, VpRound[]> {
  const out: Record<string, VpRound[]> = {}
  for (const f of feed) {
    const c: Cue = f.cue
    if (c.kind !== 'score' || c.source !== 'round') continue
    const list = (out[c.seat] ??= [])
    const lines = asLines(c.lines)
    const hit = list.find((r) => r.round === c.round)
    if (hit) { hit.vp += c.vp; hit.lines.push(...lines) } else list.push({ round: c.round, vp: c.vp, lines })
  }
  return out
}

// ---------- unit status words ----------
export interface UnitLike { effects: { kind: string; status?: string; stat?: string; x?: number }[]; shielded: boolean; inCoherency: boolean; activation: string | null; location?: string }
export const prettyId = (s: string): string => s.toLowerCase().replace(/_/g, ' ').replace(/^./, (c) => c.toUpperCase())
/** Status chips for the unit card. Units off the table carry none (Reserves and wrecks have no position to describe), and
 *  the Activation Marker only counts while its own Phase is running: `phase` undefined keeps the raw marker word. */
export function statusWords(u: UnitLike, phase?: string | null): string[] {
  if (u.location !== undefined && u.location !== 'table') return []
  const out: string[] = []
  if (u.activation && (phase === undefined || phase === u.activation)) out.push(phase === undefined ? `Activated (${u.activation})` : 'Activated this Phase')
  if (u.shielded) out.push('Shielded')
  if (!u.inCoherency) out.push('Out of coherency')
  for (const e of u.effects) {
    if (e.kind === 'status' && e.status) out.push(prettyId(e.status))
    else if ((e.kind === 'buff' || e.kind === 'debuff') && e.stat) out.push(`${e.kind === 'buff' ? 'Buff' : 'Debuff'} ${e.stat}${e.x !== undefined ? ` ${e.x}` : ''}`)
  }
  return [...new Set(out)]
}

// ---------- end screen rosters ----------
/** Model counts lost to the reserve sweep (never deployed) per unit, from casualty cues in the feed. */
export function neverDeployed(feed: readonly FeedEntry[]): Record<string, number> {
  const out: Record<string, number> = {}
  for (const f of feed) if (f.cue.kind === 'casualties' && f.cue.cause === 'reserveSweep') out[f.cue.unitId] = (out[f.cue.unitId] ?? 0) + f.cue.modelIds.length
  return out
}
/** One roster line: split what was destroyed from what never arrived. */
export function rosterLine(u: { location: string; damage: number }, total: number, alive: number, never: number): string {
  if (u.location === 'reserves') return 'never deployed (still in Reserves)'
  const lost = Math.max(0, total - alive - never)
  const bits: string[] = []
  if (lost > 0) bits.push(`${lost} destroyed`)
  if (never > 0) bits.push(`${never} never deployed`)
  if (u.location === 'destroyed') return bits.length ? `wiped out (${bits.join(', ')})` : 'wiped out'
  return `${alive} of ${total} models standing${bits.length ? ` (${bits.join(', ')})` : ''}, damage ${u.damage}`
}
