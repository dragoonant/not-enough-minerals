// Web Audio manager. Buses: sfx -> master; music -> master (MUSIC_DB under sfx at equal sliders). Unlocked on the first
// click, tap or key. Volumes and mute persist in localStorage (try/catch). Throttling: retrigger gap and a concurrency cap
// per sound id, plus a little random pitch jitter. SFX are synthesized (synth.ts). Music plays the generated files
// (music.ts: title, battle loop, victory/defeat stingers) with 1.8 s crossfades; a missing file falls back to the synth mood.
import { RECIPES, MoodPlayer } from './synth'
import { MUSIC_TRACKS, MusicTrack, type MusicScene } from './music'
import { SFX, SFX_BY_ID, sfxUrl } from './sfx'

export type Mood = MusicScene

export const MUSIC_DB = -14
const dbToGain = (db: number): number => Math.pow(10, db / 20)
const KEY = 'nem.audio.v1'
const MAX_CONCURRENT = 4
const MIN_RETRIGGER_MS = 35
const GAP_MS: Record<string, number> = { death: 600, 'death-terran': 500, 'death-zerg': 500, 'death-protoss': 500, 'arrive-warp': 400, 'arrive-drop': 400, 'arrive-burrow': 400, 'round-start': 800, victory: 2000, defeat: 2000 }
const JITTER_CENTS = 35
const CROSSFADE_S = 1.8

export interface AudioSettings { master: number; sfx: number; music: number; muted: boolean }
const DEFAULTS: AudioSettings = { master: 0.8, sfx: 1, music: 0.8, muted: false }
const clamp01 = (n: number): number => Math.min(1, Math.max(0, n))

export function loadAudioSettings(): AudioSettings {
  try {
    const raw = localStorage.getItem(KEY)
    if (!raw) return { ...DEFAULTS }
    const d = JSON.parse(raw) as Partial<AudioSettings>
    return {
      master: typeof d.master === 'number' ? clamp01(d.master) : DEFAULTS.master,
      sfx: typeof d.sfx === 'number' ? clamp01(d.sfx) : DEFAULTS.sfx,
      music: typeof d.music === 'number' ? clamp01(d.music) : DEFAULTS.music,
      muted: d.muted === true,
    }
  } catch { return { ...DEFAULTS } }
}
function saveAudioSettings(s: AudioSettings): void { try { localStorage.setItem(KEY, JSON.stringify(s)) } catch { /* private mode */ } }

const nowMs = (): number => (typeof performance !== 'undefined' ? performance.now() : Date.now())

export class AudioManager {
  private ctx: AudioContext | null = null
  private master: GainNode | null = null
  private sfxBus: GainNode | null = null
  private musicBus: GainNode | null = null
  private settings: AudioSettings = loadAudioSettings()
  private listeners = new Set<(s: AudioSettings) => void>()
  private throttle = new Map<string, { active: number; last: number }>()
  private attached = false
  private unlocked = false
  private mood: Mood | null = null
  private wantMood: Mood | null = null
  private players: MoodPlayer[] = []
  private track: MusicTrack | null = null
  private missingMusic = new Set<string>()
  private buffers = new Map<string, AudioBuffer>()
  private sfxLoading = false
  private timer: ReturnType<typeof setInterval> | null = null
  readonly stats = { played: {} as Record<string, number>, mood: '' as string, track: '' as string }

  /** False once the scene's music file failed to load (callers then use the synth jingle instead). */
  hasMusicFile(m: Mood): boolean { return !this.missingMusic.has(MUSIC_TRACKS[m].id) }

  get isUnlocked(): boolean { return this.unlocked }
  get currentMood(): Mood | null { return this.mood }
  getSettings(): AudioSettings { return { ...this.settings } }
  subscribe(fn: (s: AudioSettings) => void): () => void { this.listeners.add(fn); return () => { this.listeners.delete(fn) } }

  set(patch: Partial<AudioSettings>): void {
    this.settings = { ...this.settings, ...patch }
    for (const k of ['master', 'sfx', 'music'] as const) this.settings[k] = clamp01(this.settings[k])
    saveAudioSettings(this.settings)
    this.applyGains()
    for (const fn of this.listeners) fn(this.getSettings())
  }

  private applyGains(): void {
    if (!this.ctx || !this.master || !this.sfxBus || !this.musicBus) return
    const t = this.ctx.currentTime
    const s = this.settings
    this.master.gain.setTargetAtTime(s.muted ? 0 : s.master, t, 0.03)
    this.sfxBus.gain.setTargetAtTime(s.sfx, t, 0.03)
    this.musicBus.gain.setTargetAtTime(s.music * dbToGain(MUSIC_DB), t, 0.03)
  }

  /** One-time listeners: the first pointer, key or touch unlocks audio. Safe to call repeatedly. */
  attachAutoUnlock(): void {
    if (this.attached || typeof window === 'undefined') return
    this.attached = true
    const handler = () => {
      window.removeEventListener('pointerdown', handler, true)
      window.removeEventListener('keydown', handler, true)
      window.removeEventListener('touchstart', handler, true)
      void this.unlock()
    }
    window.addEventListener('pointerdown', handler, true)
    window.addEventListener('keydown', handler, true)
    window.addEventListener('touchstart', handler, true)
    window.addEventListener('pointerdown', (e) => {
      const t = e.target as Element | null
      if (this.unlocked && t?.closest?.('button') && !t.closest('[data-testid="audio-toggle"], [data-testid="audio-panel"]')) this.play('ui-click', { volume: 0.5 })
    })
  }

  async unlock(): Promise<void> {
    if (this.unlocked || typeof window === 'undefined') return
    const AC = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext
    if (!AC) return
    try {
      const ctx = new AC()
      this.ctx = ctx
      this.master = ctx.createGain(); this.sfxBus = ctx.createGain(); this.musicBus = ctx.createGain()
      const comp = ctx.createDynamicsCompressor()
      this.sfxBus.connect(this.master); this.musicBus.connect(this.master); this.master.connect(comp); comp.connect(ctx.destination)
      this.applyGains()
      if (ctx.state === 'suspended') await ctx.resume()
      this.unlocked = true
      void this.loadSfx()
      if (this.wantMood) this.setMood(this.wantMood)
    } catch { /* audio unavailable: stay silent */ }
  }

  /** Fetches and decodes every generated SFX file once; a file that fails to load keeps its synth stand-in. */
  async loadSfx(): Promise<void> {
    const ctx = this.ctx
    if (!ctx || this.sfxLoading) return
    this.sfxLoading = true
    await Promise.all(SFX.map(async (spec) => {
      try {
        const res = await fetch(sfxUrl(spec.id))
        if (!res.ok) return
        this.buffers.set(spec.id, await ctx.decodeAudioData(await res.arrayBuffer()))
      } catch { /* missing or undecodable: synth stand-in */ }
    }))
  }

  /** True once a generated file (not the synth stand-in) will play for this id. */
  hasSfxFile(id: string): boolean { return this.buffers.has(id) }

  play(id: string, opts: { volume?: number; delayMs?: number; detune?: number } = {}): void {
    const spec = SFX_BY_ID[id]
    const buffer = this.buffers.get(id)
    const recipe = RECIPES[spec && !buffer ? spec.synth : id] ?? RECIPES[id]
    const ctx = this.ctx
    if ((!recipe && !buffer) || !ctx || !this.sfxBus || !this.unlocked || this.settings.muted) return
    const th = this.throttle.get(id) ?? { active: 0, last: -1e9 }
    const n = nowMs()
    if (n - th.last < (GAP_MS[id] ?? MIN_RETRIGGER_MS) || th.active >= MAX_CONCURRENT) return
    th.last = n; th.active++
    this.throttle.set(id, th)
    const jitter = opts.detune ?? JITTER_CENTS
    const p = Math.pow(2, ((Math.random() * 2 - 1) * jitter) / 1200)
    const when = ctx.currentTime + 0.01 + (opts.delayMs ?? 0) / 1000
    try {
      if (buffer) {
        const src = ctx.createBufferSource()
        const g = ctx.createGain()
        src.buffer = buffer
        src.playbackRate.value = p
        g.gain.value = (spec?.trim ?? 1) * (opts.volume ?? 1)
        src.connect(g); g.connect(this.sfxBus)
        src.start(when)
      } else recipe!({ ctx, out: this.sfxBus, t: when, p, v: opts.volume ?? 1 })
    } catch { /* ignore */ }
    this.stats.played[id] = (this.stats.played[id] ?? 0) + 1
    setTimeout(() => { th.active = Math.max(0, th.active - 1) }, 400 + (opts.delayMs ?? 0))
  }

  /** Crossfades to a music scene (1.8 s): calm = title theme, battle = battle loop, victory/defeat = one-shot
   *  stingers. Remembered until audio unlocks. */
  setMood(m: Mood | null): void {
    this.wantMood = m
    if (!this.ctx || !this.musicBus || !this.unlocked || m === this.mood) return
    for (const old of this.players) old.fadeOut(CROSSFADE_S)
    this.players = []
    this.track?.fadeOut(CROSSFADE_S)
    this.track = null
    this.mood = m
    this.stats.mood = m ?? ''
    this.stats.track = ''
    if (!m) return
    const spec = MUSIC_TRACKS[m]
    if (!this.missingMusic.has(spec.id)) {
      const t = new MusicTrack(this.ctx, this.musicBus, spec.id, spec.loop, CROSSFADE_S, () => {
        this.missingMusic.add(spec.id)
        if (this.track === t) { this.track = null; this.stats.track = ''; this.startSynth(m) }
      })
      this.track = t
      this.stats.track = spec.id
      return
    }
    this.startSynth(m)
  }

  private startSynth(m: Mood): void {
    if (!this.ctx || !this.musicBus || this.mood !== m) return
    if (m !== 'calm' && m !== 'battle') return // stingers fall back to the synth jingle SFX instead
    this.players.push(new MoodPlayer(this.ctx, this.musicBus, m, CROSSFADE_S))
    if (!this.timer) this.timer = setInterval(() => this.pump(), 120)
  }

  private pump(): void {
    if (!this.ctx) return
    for (const p of this.players) p.tick(this.ctx.currentTime + 0.5)
  }
}

export const audio = new AudioManager()
