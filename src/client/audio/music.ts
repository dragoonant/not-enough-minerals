// File-backed music (ElevenLabs, tools/gen-music.ts -> public/audio/music/<id>.mp3) and the music director.
// Loops are decoded AudioBuffers played by a looping AudioBufferSourceNode (loopStart/loopEnd, so no <audio loop> gap
// at the seam). Only the active file is kept decoded (one-entry cache in the manager, ~10 MB PCM for the title,
// ~21 MB for the battle loop); everything else is fetched on demand. A file that fails to load falls back to the synth.

export type MusicScene = 'calm' | 'battle' | 'tense' | 'victory' | 'defeat'

export interface SceneSpec { id: string; loop: boolean; /** playbackRate (tense = battle loop a little faster) */ rate: number }

/** Scene -> file. 'calm' is the start/title screen; 'tense' reuses the battle loop faster (no extra credits spent). */
export const MUSIC_TRACKS: Record<MusicScene, SceneSpec> = {
  calm: { id: 'title', loop: true, rate: 1 },
  battle: { id: 'battle-1', loop: true, rate: 1 },
  tense: { id: 'battle-1', loop: true, rate: 1.07 },
  victory: { id: 'victory', loop: false, rate: 1 },
  defeat: { id: 'defeat', loop: false, rate: 1 },
}

/** Per-track gain trims from `npx tsx tools/measure-audio.ts` (RMS 0.20/0.22/0.14/0.19 aimed at ~0.16). */
export const MUSIC_TRIMS: Record<string, number> = { title: 0.8, 'battle-1': 0.73, victory: 1, defeat: 0.84 }

/** Extra per-scene trim (tense sits a touch louder than the plain battle loop). */
export const SCENE_TRIMS: Record<MusicScene, number> = { calm: 1, battle: 1, tense: 1.08, victory: 1, defeat: 1 }

/** Seconds trimmed from each end of the loop window to hide MP3 encoder padding. */
export const LOOP_TRIM_START = 0.026
export const LOOP_TRIM_END = 0.012

export const sceneGain = (m: MusicScene): number => (MUSIC_TRIMS[MUSIC_TRACKS[m].id] ?? 1) * SCENE_TRIMS[m]

export function loopWindow(duration: number): { start: number; end: number } {
  return { start: Math.min(LOOP_TRIM_START, duration / 4), end: Math.max(duration - LOOP_TRIM_END, duration * 0.75) }
}

export function musicUrl(id: string): string {
  const base = (import.meta as unknown as { env?: { BASE_URL?: string } }).env?.BASE_URL ?? '/'
  return `${base.endsWith('/') ? base : `${base}/`}audio/music/${id}.mp3`
}

// ---------------------------------------------------------------- director (pure)

export interface DirectorInput {
  /** 'title' = start screen; 'game' = a match is on the table. */
  screen: 'title' | 'game'
  over?: boolean
  humanWon?: boolean
  round?: number
  maxRounds?: number | null
  /** VP of the listening seat minus the best opposing seat (negative = behind). */
  vpLead?: number
  /** Scene currently playing, for hysteresis. */
  prev?: MusicScene | null
}

export const TENSE_ENTER_BEHIND = 3
export const TENSE_LEAVE_BEHIND = 1

/** Chooses the music scene from game state. Tense: 3+ VP behind (until back within 1) or the last round. */
export function directScene(i: DirectorInput): MusicScene {
  if (i.screen === 'title') return 'calm'
  if (i.over) return i.humanWon ? 'victory' : 'defeat'
  const behind = -(i.vpLead ?? 0)
  const lastRound = i.maxRounds != null && (i.round ?? 0) > 0 && (i.round ?? 0) >= i.maxRounds
  const threshold = i.prev === 'tense' ? TENSE_LEAVE_BEHIND + 1 : TENSE_ENTER_BEHIND
  return lastRound || behind >= threshold ? 'tense' : 'battle'
}

/** VP lead of `seat` over the best other seat. */
export function vpLeadOf(seats: Record<string, { vp: number }>, seat: string): number {
  const mine = seats[seat]?.vp ?? 0
  let best = -Infinity
  for (const [id, s] of Object.entries(seats)) if (id !== seat) best = Math.max(best, s.vp)
  return best === -Infinity ? 0 : mine - best
}

// ---------------------------------------------------------------- playback

/** One playing scene: (decoded buffer) -> looping source -> fade gain -> music bus. */
export class MusicTrack {
  private src: AudioBufferSourceNode | null = null
  private gain: GainNode
  private done = false

  constructor(private ctx: AudioContext, dest: AudioNode, readonly scene: MusicScene, load: (id: string) => Promise<AudioBuffer>, fadeIn: number, onError: () => void) {
    this.gain = ctx.createGain()
    this.gain.gain.value = 0
    this.gain.connect(dest)
    const spec = MUSIC_TRACKS[scene]
    load(spec.id).then((buf) => {
      if (this.done) return
      const src = ctx.createBufferSource()
      src.buffer = buf
      src.playbackRate.value = spec.rate
      const w = loopWindow(buf.duration)
      if (spec.loop) { src.loop = true; src.loopStart = w.start; src.loopEnd = w.end }
      src.connect(this.gain)
      src.start(0, spec.loop ? w.start : 0)
      this.src = src
      const t = ctx.currentTime
      this.gain.gain.setValueAtTime(0, t)
      this.gain.gain.linearRampToValueAtTime(sceneGain(scene), t + fadeIn)
    }).catch(() => { if (!this.done) { this.dispose(); onError() } })
  }

  fadeOut(seconds: number): void {
    if (this.done) return
    this.done = true
    const t = this.ctx.currentTime
    this.gain.gain.cancelScheduledValues(t)
    this.gain.gain.setValueAtTime(this.gain.gain.value, t)
    this.gain.gain.linearRampToValueAtTime(0, t + seconds)
    setTimeout(() => this.dispose(), seconds * 1000 + 150)
  }

  private dispose(): void {
    this.done = true
    try { this.src?.stop(); this.src?.disconnect(); this.gain.disconnect() } catch { /* already gone */ }
    this.src = null
  }
}
