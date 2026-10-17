// Engine step -> timed beats. Pure. A beat carries one Cue, the events it shows, a base duration (scaled by speed) and
// an optional display patch that advances the presented state. Patches only copy engine results (after-state fields or
// event payloads); anything else waits for the batch-end snap to the true state, so the screen lags but never lies.
import type { DiceRolled } from '../../engine/rng'
import type { Action, AttackBatch, GameState, ModelId, ModelState, RoundPhase, SeatId, UnitId, Vec2 } from '../../engine/types'
import type { AtkStageData, Cue, MoveHow, RolledDie, SeqEvent } from './cues'
import { phaseLabel, seatLabel } from './labels'

export interface Beat {
  cue: Cue
  baseMs: number
  events: SeqEvent[]
  /** Display patch (moves apply at the end, after the tween; everything else at the start). */
  patch?: (s: GameState) => GameState
  applyAt: 'start' | 'end'
}

export const BEAT_MS = {
  round: 1600, phase: 1100, turn: 700, gameOver: 2400, moveBase: 420, movePerInch: 70, moveMax: 1600, dice: 1000,
  attack: 450, attackStage: 1000, casualties: 800, charge: 650, arrival: 600, activation: 250, passed: 450,
  initiative: 900, marker: 700, score: 1000, note: 0,
} as const

// ---------------------------------------------------------------- patch helpers (copy from the after-state only)
function withModel(s: GameState, id: ModelId, f: (m: ModelState) => ModelState): GameState {
  const m = s.models[id]
  return m ? { ...s, models: { ...s.models, [id]: f(m) } } : s
}
/** Copy a unit and the listed models (all its models when omitted) from the after-state. */
const copyUnit = (after: GameState, unitId: UnitId, modelIds?: readonly ModelId[]) => (s: GameState): GameState => {
  const u = after.units[unitId]
  if (!u) return s
  const models = { ...s.models }
  for (const id of modelIds ?? u.modelIds) { const a = after.models[id]; if (a) models[id] = a }
  return { ...s, units: { ...s.units, [unitId]: u }, models }
}
const copyFields = <K extends keyof GameState>(after: GameState, keys: K[]) => (s: GameState): GameState => {
  const out = { ...s }
  for (const k of keys) out[k] = after[k]
  return out
}
const copySeat = (after: GameState, seat: SeatId) => (s: GameState): GameState =>
  (after.seats[seat] ? { ...s, seats: { ...s.seats, [seat]: after.seats[seat]! } } : s)

/** Split a roll purpose: 'hit:reroll' -> base 'hit', reroll true. */
export function parsePurpose(purpose: string): { base: string; reroll: boolean } {
  const parts = purpose.split(':')
  const reroll = parts.includes('reroll')
  return { base: parts.filter((p) => p !== 'reroll').join(':') || purpose, reroll }
}

function diceOf(ev: DiceRolled): RolledDie[] {
  const p = parsePurpose(ev.purpose)
  return ev.dice.map((face) => ({ sides: ev.sides, face, reroll: p.reroll, rollId: ev.rollId, purpose: p.base }))
}

const dist = (a: Vec2, b: Vec2) => Math.hypot(a.x - b.x, a.z - b.z)
const pathLen = (pts: Vec2[]) => pts.reduce((acc, p, i) => (i ? acc + dist(pts[i - 1]!, p) : 0), 0)
const isVec = (p: unknown): p is Vec2 => !!p && typeof (p as Vec2).x === 'number' && typeof (p as Vec2).z === 'number'

/** The Leading Model (else the first live model) of a unit, for cues that point at a unit. */
export function anchorModel(s: GameState, unitId: UnitId | null | undefined): ModelId {
  const u = unitId ? s.units[unitId] : undefined
  if (!u) return ''
  if (u.leadingModelId && s.models[u.leadingModelId]?.life === 'active') return u.leadingModelId
  return u.modelIds.find((id) => s.models[id]?.life === 'active') ?? u.modelIds[0] ?? ''
}

// ---------------------------------------------------------------- moves (models that stayed on the table)
/** The move kind an answer carries: move.path has kind move/run/disengage; other answer types name it themselves. */
export function moveHowOf(action: Action | null): MoveHow {
  const t = typeof action?.type === 'string' ? action.type : ''
  const k = action?.['kind']
  if (t === 'move.path' && (k === 'move' || k === 'run' || k === 'disengage')) return k
  if (t === 'move.run') return 'run'
  if (t === 'move.go') return 'move'
  if (t === 'move.disengage') return 'disengage'
  if (t.startsWith('deploy.')) return 'deploy'
  if (t.startsWith('charge.')) return 'charge'
  if (t === 'move.place') return 'place'
  return 'other'
}

function moveBeats(before: GameState, after: GameState, action: Action | null): Beat[] {
  const out: Beat[] = []
  const how = moveHowOf(action)
  const led = new Set<string>()
  const leader = typeof action?.['leaderId'] === 'string' ? (action['leaderId'] as string) : null
  const path = Array.isArray(action?.['path']) ? (action!['path'] as unknown[]).filter(isVec) : null
  for (const [id, a] of Object.entries(after.models)) {
    const b = before.models[id]
    if (!b || b.offTable || a.offTable || a.life !== 'active' || dist(b.pos, a.pos) < 0.01) continue
    let points: Vec2[] = [b.pos, a.pos]
    if (path && path.length && id === leader) points = [b.pos, ...path.slice(0, -1), a.pos]
    const ms = Math.min(BEAT_MS.moveMax, BEAT_MS.moveBase + BEAT_MS.movePerInch * pathLen(points))
    const firstOfUnit = !led.has(a.unitId)
    led.add(a.unitId)
    out.push({
      cue: { kind: 'move', modelId: id, points, unitId: a.unitId, how, lead: firstOfUnit }, baseMs: ms, events: [], applyAt: 'end',
      patch: (s) => withModel(s, id, (m) => ({ ...m, pos: a.pos, elev: a.elev })),
    })
  }
  return out
}

// ---------------------------------------------------------------- events
interface BatchInfo { attackerUnitId: UnitId | null; targetUnitId: UnitId | null; weaponId: string | null }

function batchInfo(before: GameState, after: GameState, batchId: string, lastFire: BatchInfo | null): BatchInfo {
  const fromBatch = (b: AttackBatch | undefined): BatchInfo | null =>
    (b && b.id === batchId ? { attackerUnitId: b.attackerUnitId, targetUnitId: b.targetUnitId, weaponId: b.weaponId } : null)
  return fromBatch(after.attack?.batch) ?? fromBatch(before.attack?.batch)
    ?? fromBatch(after.attack?.queue.find((q) => q.id === batchId)) ?? lastFire ?? { attackerUnitId: null, targetUnitId: null, weaponId: null }
}

const ATTACK_STAGES = new Set(['hit', 'surge', 'armour', 'evade', 'damage', 'impact'])

function eventBeats(before: GameState, after: GameState, events: SeqEvent[]): Beat[] {
  const out: Beat[] = []
  let dice: { base: string; ownerId?: string; events: SeqEvent[] } | null = null
  let lastFire: BatchInfo | null = null
  const flushDice = () => {
    if (!dice) return
    const rolls = dice.events.map((e) => e.event as DiceRolled)
    out.push({ cue: { kind: 'dice', purpose: dice.base, ...(dice.ownerId ? { ownerId: dice.ownerId } : {}), dice: rolls.flatMap(diceOf), rolls }, baseMs: BEAT_MS.dice, events: dice.events, applyAt: 'start' })
    dice = null
  }
  // Dice rolled since the last non-dice event: an atk.stage takes them all (hit + Surge die, armour, evade...).
  let attackDice: SeqEvent[] = []

  for (const se of events) {
    const ev = se.event
    if (ev.type === 'DiceRolled') {
      const r = ev as DiceRolled
      const base = parsePurpose(r.purpose).base
      if (ATTACK_STAGES.has(base) || base === 'surge') { attackDice.push(se); continue }
      if (dice && (dice.base !== base || dice.ownerId !== r.ownerId)) flushDice()
      dice ??= { base, ...(r.ownerId ? { ownerId: r.ownerId } : {}), events: [] }
      dice.events.push(se)
      continue
    }
    flushDice()
    const e = ev as { type: string; [k: string]: unknown }
    const str = (k: string) => (typeof e[k] === 'string' ? (e[k] as string) : '')
    const num = (k: string) => (typeof e[k] === 'number' ? (e[k] as number) : undefined)
    const ids = (k: string) => (Array.isArray(e[k]) ? (e[k] as unknown[]).filter((x): x is string => typeof x === 'string') : [])
    const one = (cue: Cue, baseMs: number, patch?: Beat['patch'], evs: SeqEvent[] = [se]) =>
      out.push({ cue, baseMs, events: evs, applyAt: 'start', ...(patch ? { patch } : {}) })
    switch (e.type) {
      case 'shoot.fire': {
        const info: BatchInfo = { attackerUnitId: str('unitId') || null, targetUnitId: str('targetUnitId') || null, weaponId: str('weaponId') || null }
        lastFire = info
        one({
          kind: 'attack', attackerId: anchorModel(after, info.attackerUnitId), targetId: anchorModel(before, info.targetUnitId), weaponId: info.weaponId ?? '',
          ns: 'shoot', success: true, result: null, ...(info.attackerUnitId ? { attackerUnitId: info.attackerUnitId } : {}), ...(info.targetUnitId ? { targetUnitId: info.targetUnitId } : {}),
        }, BEAT_MS.attack)
        break
      }
      case 'atk.stage': {
        const batchId = str('batchId')
        const step = str('step') as AtkStageData['step']
        const info = batchInfo(before, after, batchId, lastFire)
        const rolls = attackDice.map((x) => x.event as DiceRolled)
        const evs = [...attackDice, se]
        attackDice = []
        const { type: _t, batchId: _b, ...rest } = e
        const data = { ...rest, step } as AtkStageData
        const patch = step === 'damage' && info.targetUnitId ? copyUnit(after, info.targetUnitId, []) : undefined
        one({ kind: 'attackStage', batchId, step, data, dice: rolls.flatMap(diceOf), rolls, ...info }, BEAT_MS.attackStage, patch, evs)
        break
      }
      case 'atk.removed': {
        const unitId = str('unitId'), modelIds = ids('modelIds')
        const destroyed = after.units[unitId]?.location === 'destroyed'
        one({ kind: 'casualties', unitId, modelIds, cause: str('cause'), destroyed }, BEAT_MS.casualties, copyUnit(after, unitId, modelIds))
        break
      }
      case 'unitDestroyed': break // folded into the casualties cue (destroyed: true)
      case 'charge.declared': one({ kind: 'charge', unitId: str('unitId'), stage: 'declared', targets: ids('targets') }, BEAT_MS.charge); break
      case 'charge.rolled': {
        const roll = num('roll'), distance = num('distance')
        one({ kind: 'charge', unitId: str('unitId'), stage: 'rolled', targets: [], ...(roll !== undefined ? { roll } : {}), ...(distance !== undefined ? { distance } : {}) }, BEAT_MS.charge)
        break
      }
      case 'charge.distance': break // the rolled cue already carries the distance; a hook change shows in the path
      case 'charge.succeeded': one({ kind: 'charge', unitId: str('unitId'), stage: 'succeeded', targets: ids('targets') }, BEAT_MS.charge); break
      case 'charge.failed': one({ kind: 'charge', unitId: str('unitId'), stage: 'failed', targets: [], why: str('why') }, BEAT_MS.charge); break
      case 'charge.impact': one({ kind: 'charge', unitId: str('unitId'), stage: 'impact', targets: [] }, BEAT_MS.charge); break
      case 'deploy.stage': {
        const unitId = str('unitId'), stage = str('stage') === 'arrived' ? 'arrived' : 'nominated'
        const entry = e['entry'] as CueOf_arrival['entry']
        one({ kind: 'arrival', unitId, stage, ...(entry ? { entry } : {}) }, BEAT_MS.arrival, stage === 'arrived' ? copyUnit(after, unitId) : undefined)
        break
      }
      case 'returnedToReserves': { const unitId = str('unitId'); one({ kind: 'arrival', unitId, stage: 'returned' }, BEAT_MS.arrival, copyUnit(after, unitId)); break }
      case 'turn.begin': {
        const unitId = str('unitId')
        one({ kind: 'activation', unitId, seat: after.units[unitId]?.owner ?? null }, BEAT_MS.activation, copyFields(after, ['activeUnit']))
        break
      }
      case 'passed': {
        const seat = str('seat'), phase = (e['phase'] as RoundPhase | undefined) ?? before.roundPhase
        one({ kind: 'passed', seat, phase: phase ?? null }, BEAT_MS.passed, (s) => (s.passed.includes(seat) ? s : { ...s, passed: [...s.passed, seat] }))
        break
      }
      case 'initiative': one({ kind: 'initiative', seat: str('winner'), why: 'rollOff' }, BEAT_MS.initiative); break
      case 'firstPlayer': {
        const seat = str('seat')
        one({ kind: 'initiative', seat, why: e['phase'] ? 'firstPass' : 'assigned' }, BEAT_MS.initiative, (s) => ({ ...s, firstPlayer: seat }))
        break
      }
      case 'initiativeSet': { const seat = str('seat'); one({ kind: 'initiative', seat, why: 'nextRound' }, BEAT_MS.initiative, (s) => ({ ...s, firstPlayer: seat })); break }
      case 'markerControl': {
        const totals = e['totals'] as Record<SeatId, number> | undefined
        one({ kind: 'marker', n: num('n') ?? 0, change: 'control', from: (e['from'] as SeatId | null) ?? null, to: (e['to'] as SeatId | null) ?? null, ...(totals ? { totals } : {}) }, BEAT_MS.marker, copyFields(after, ['markers']))
        break
      }
      case 'markerClaimed':
      case 'markerDropped':
        one({ kind: 'marker', n: num('n') ?? 0, change: e.type === 'markerClaimed' ? 'claimed' : 'dropped', unitId: str('unitId') }, BEAT_MS.marker, copyFields(after, ['markers']))
        break
      case 'vpScored': {
        const seat = str('seat')
        one({ kind: 'score', seat, vp: num('vp') ?? 0, source: 'round', round: num('round') ?? after.round, lines: e['lines'] }, BEAT_MS.score, copySeat(after, seat))
        break
      }
      case 'vp': {
        const seat = str('seat')
        one({ kind: 'score', seat, vp: num('n') ?? 0, source: str('source') || 'mission', round: num('round') ?? after.round }, BEAT_MS.score, copySeat(after, seat))
        break
      }
      case 'gameOver': {
        const winner = (e['winner'] as string | null) ?? null
        one({ kind: 'banner', tone: 'gameOver', text: winner ? `${seatLabel(winner)} wins` : 'The game ends in a draw', round: after.round, phase: after.roundPhase, seat: null, winner }, BEAT_MS.gameOver)
        break
      }
      default: one({ kind: 'note', event: ev }, BEAT_MS.note)
    }
  }
  flushDice()
  if (attackDice.length) { // dice with no stage event yet (an attack paused for a decision): show them as a plain roll
    const rolls = attackDice.map((x) => x.event as DiceRolled)
    out.push({ cue: { kind: 'dice', purpose: parsePurpose(rolls[0]!.purpose).base, dice: rolls.flatMap(diceOf), rolls }, baseMs: BEAT_MS.dice, events: attackDice, applyAt: 'start' })
  }
  return out
}
type CueOf_arrival = Extract<Cue, { kind: 'arrival' }>

// ---------------------------------------------------------------- round, phase and turn banners
function turnBeats(before: GameState, after: GameState): Beat[] {
  if (after.phase === 'over') return []
  const out: Beat[] = []
  const seat = after.active ?? after.turn?.seat ?? null
  if (after.round > 0 && after.round !== before.round) {
    out.push({ cue: { kind: 'banner', tone: 'round', text: `Round ${after.round}`, round: after.round, phase: after.roundPhase, seat }, baseMs: BEAT_MS.round, events: [], applyAt: 'start', patch: copyFields(after, ['round', 'maxRounds']) })
  }
  if (after.roundPhase && after.roundPhase !== before.roundPhase) {
    out.push({ cue: { kind: 'banner', tone: 'phase', text: phaseLabel(after.roundPhase), round: after.round, phase: after.roundPhase, seat }, baseMs: BEAT_MS.phase, events: [], applyAt: 'start', patch: copyFields(after, ['roundPhase', 'passed']) })
  } else if (seat && seat !== (before.active ?? before.turn?.seat ?? null)) {
    out.push({ cue: { kind: 'banner', tone: 'turn', text: `${seatLabel(seat)} to act`, round: after.round, phase: after.roundPhase, seat }, baseMs: BEAT_MS.turn, events: [], applyAt: 'start', patch: copyFields(after, ['active']) })
  }
  return out
}

/** Beats for one accepted engine step. Moves first for move/charge/deploy answers, after the events otherwise. */
export function buildBeats(before: GameState, after: GameState, events: SeqEvent[], action: Action | null): Beat[] {
  const moves = moveBeats(before, after, action)
  const evs = eventBeats(before, after, events)
  const t = action?.type ?? ''
  const movesFirst = t.startsWith('move.') || t.startsWith('charge.path') || t.startsWith('deploy.')
  return [...(movesFirst ? [...moves, ...evs] : [...evs, ...moves]), ...turnBeats(before, after)]
}
