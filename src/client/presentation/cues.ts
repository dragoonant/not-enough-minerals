// Presentation cues (FROZEN client contract at M3). Each beat the director plays carries exactly one Cue. The dice tray,
// figures, VFX, audio and the event feed subscribe to cues (contract: onCue / useCurrentBeat / useShownRoll / useFeed).
// Cues only restate what the engine already resolved (event payloads, before/after states); they carry no rules number
// the engine did not compute.
import type { DiceRolled } from '../../engine/rng'
import type { ArrivalEntry, AttackStep, GameEvent, Id, ModelId, RoundPhase, SeatId, UnitId, Vec2 } from '../../engine/types'

/** An engine event with its 1-based index in GameState.events. */
export interface SeqEvent { seq: number; event: GameEvent }

/** One die shown in the tray. */
export interface RolledDie {
  sides: number
  /** Face rolled (1-based). */
  face: number
  /** Part of a re-roll of an earlier die. */
  reroll: boolean
  rollId: string
  /** Roll purpose without the ':reroll' tag: 'hit', 'surge', 'armour', 'evade', 'impact', 'charge', 'initiative'... */
  purpose?: string
}

/** What kind of move a path answer was (the engine's `kind`): lets cues, sounds and narration tell Run from Move. */
export type MoveHow = 'move' | 'run' | 'disengage' | 'deploy' | 'charge' | 'place' | 'other'

export type BannerTone = 'round' | 'phase' | 'turn' | 'gameOver'

/** The atk.stage payload per step (spec 00 s6), as the engine logged it. */
export type AtkStageData =
  | { step: 'hit'; groups: { count: number; tn: number | null; faces: number[] }[]; hits: number; precision: number; surge: { die: number | null; result: number }; armourPool: number }
  | { step: 'surge'; tagMatch: boolean; surgeResult: number; surgeMoved: number; critMoved: number; dodge: number }
  | { step: 'armour'; tn: number | null; dice: number[]; saved: number; tough: number; toDamage: number }
  | { step: 'evade'; eligible: false; reasons: string[]; base: number | null }
  | { step: 'evade'; eligible: true; reasons: string[]; tn: number | null; dice: number[]; evaded: number; remaining: number }
  | { step: 'damage'; dice: number; perDie?: number; newDamage?: number; marker?: number; total: number }
  | { step: 'impact'; dice: number[]; passed: number }

export type Cue =
  /** Big centred text: a new Round, a new Phase, the turn passing to another seat, game over. */
  | { kind: 'banner'; tone: BannerTone; text: string; round: number; phase: RoundPhase | null; seat: SeatId | null; winner?: SeatId | null }
  /** A figure slides along `points` (first = start, last = engine end position). */
  | { kind: 'move'; modelId: ModelId; points: Vec2[]; unitId?: UnitId; how?: MoveHow; lead?: boolean }
  /** A roll outside an attack (charge, initiative Roll-Off, map, draft...), grouped by purpose and owner. */
  | { kind: 'dice'; purpose: string; ownerId?: string; dice: RolledDie[]; rolls: DiceRolled[] }
  /** A Batch is fired: attacker and target are each unit's Leading Model (for tracers and sounds). `success` is always
   *  true here (the outcome arrives in attackStage cues); `result` is null. */
  | { kind: 'attack'; attackerId: ModelId; targetId: ModelId; weaponId: string; ns: string; success: boolean; result: unknown; attackerUnitId?: UnitId; targetUnitId?: UnitId }
  /** One attack step with its dice (merged from the DiceRolled events that preceded the atk.stage event). */
  | { kind: 'attackStage'; batchId: Id; step: AttackStep | 'impact'; data: AtkStageData; dice: RolledDie[]; rolls: DiceRolled[]; attackerUnitId: UnitId | null; targetUnitId: UnitId | null; weaponId: Id | null }
  /** Models removed from one unit (damage, a failed test, a Morph...); destroyed = the unit is gone. */
  | { kind: 'casualties'; unitId: UnitId; modelIds: ModelId[]; cause: string; destroyed: boolean }
  /** A charge step. */
  | { kind: 'charge'; unitId: UnitId; stage: 'declared' | 'rolled' | 'succeeded' | 'failed' | 'impact'; targets: UnitId[]; roll?: number; distance?: number; why?: string }
  /** A unit is nominated to arrive, arrives on the table, or goes back to Reserves. */
  | { kind: 'arrival'; unitId: UnitId; stage: 'nominated' | 'arrived' | 'returned'; entry?: ArrivalEntry }
  /** A unit starts its activation. */
  | { kind: 'activation'; unitId: UnitId; seat: SeatId | null }
  | { kind: 'passed'; seat: SeatId; phase: RoundPhase | null }
  /** Who holds the First Player Marker: after the Roll-Off, assigned by the winner, the first to pass, or next Round. */
  | { kind: 'initiative'; seat: SeatId; why: 'rollOff' | 'assigned' | 'firstPass' | 'nextRound' }
  /** A Mission Marker changes controller, is claimed or dropped. */
  | { kind: 'marker'; n: number; change: 'control' | 'claimed' | 'dropped'; from?: SeatId | null; to?: SeatId | null; unitId?: UnitId; totals?: Record<SeatId, number> }
  /** VP: `source` 'round' is the End of Round total (with the scoring lines); anything else is a single award. */
  | { kind: 'score'; seat: SeatId; vp: number; source: string; round: number; lines?: unknown }
  /** Anything else the engine logged. */
  | { kind: 'note'; event: GameEvent }

export type CueKind = Cue['kind']
export type CueOf<K extends CueKind> = Extract<Cue, { kind: K }>
