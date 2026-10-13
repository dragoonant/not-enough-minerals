// Presentation cues (FROZEN client contract after M3). Each beat the director plays carries exactly one Cue. The dice
// tray, figures, VFX, audio and the event feed subscribe to cues (contract: onCue / useCurrentBeat / useShownRoll /
// useFeed). Cues only restate what the engine already resolved (event payloads, before/after positions); no rules numbers.
import type { DiceRolled } from '../../engine/rng'
import type { GameEvent, ModelId, SeatId, Vec2 } from '../../engine/types'

/** An engine event with its 1-based index in GameState.events. */
export interface SeqEvent { seq: number; event: GameEvent }

/** One die shown in the tray: a plain D6 at M0. M2 may tag roles (hit roll, damage roll, Surge) via the roll purpose. */
export interface RolledDie {
  sides: number
  /** 1-based face rolled. */
  face: number
  /** Part of a re-roll of an earlier die in the same roll. */
  reroll: boolean
  rollId: string
}

export type BannerTone = 'round' | 'turn' | 'gameOver'

export type Cue =
  /** Big centred text: a new round, the turn passing to another seat, game over. */
  | { kind: 'banner'; tone: BannerTone; text: string; round: number; seat: SeatId | null; winner?: SeatId | null }
  /** A figure slides along `points` (first = start, last = engine end position). */
  | { kind: 'move'; modelId: ModelId; points: Vec2[] }
  /** One roll, grouped by purpose (and owner). */
  | { kind: 'dice'; purpose: string; ownerId?: ModelId; dice: RolledDie[]; rolls: DiceRolled[] }
  /** An attack resolved (M2 fills the payload from its attack event). */
  | { kind: 'attack'; attackerId: ModelId; targetId: ModelId; weaponId: string; ns: string; success: boolean; result: unknown }
  /** Damage applied to a model. */
  | { kind: 'damage'; targetId: ModelId; attackerId?: ModelId; applied: number; removed: boolean; reason?: string }
  | { kind: 'removed'; modelId: ModelId; reason: string }
  | { kind: 'condition'; modelId: ModelId; condition: string; added: boolean }
  /** Anything else the engine logged. */
  | { kind: 'note'; event: GameEvent }

export type CueKind = Cue['kind']
export type CueOf<K extends CueKind> = Extract<Cue, { kind: K }>
