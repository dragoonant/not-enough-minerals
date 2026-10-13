// File-backed music (ElevenLabs, tools/gen-music.ts -> public/audio/music/<id>.mp3). Tracks stream through <audio>
// elements into the music bus, so a 120 s loop is never decoded to PCM. A file that fails to load is remembered and
// the manager falls back to the synth mood (calm/battle) or the synth jingle (stingers): never broken, only plainer.

export type MusicScene = 'calm' | 'battle' | 'victory' | 'defeat'

/** Scene -> track id and whether it loops. 'calm' is the start/title screen. */
export const MUSIC_TRACKS: Record<MusicScene, { id: string; loop: boolean }> = {
  calm: { id: 'title', loop: true },
  battle: { id: 'battle-1', loop: true },
  victory: { id: 'victory', loop: false },
  defeat: { id: 'defeat', loop: false },
}

/** Per-track gain trims (<= 1) after listening; 1 = as generated. */
export const MUSIC_TRIMS: Record<string, number> = { title: 1, 'battle-1': 1, victory: 1, defeat: 1 }

export function musicUrl(id: string): string {
  const base = (import.meta as unknown as { env?: { BASE_URL?: string } }).env?.BASE_URL ?? '/'
  return `${base.endsWith('/') ? base : `${base}/`}audio/music/${id}.mp3`
}

/** One playing file: <audio> -> MediaElementSource -> fade gain -> music bus. */
export class MusicTrack {
  private el: HTMLAudioElement
  private node: MediaElementAudioSourceNode
  private gain: GainNode
  private done = false

  constructor(private ctx: AudioContext, dest: AudioNode, readonly id: string, loop: boolean, fadeIn: number, onError: () => void) {
    this.el = new Audio(musicUrl(id))
    this.el.loop = loop
    this.el.preload = 'auto'
    this.gain = ctx.createGain()
    this.gain.gain.value = 0
    this.node = ctx.createMediaElementSource(this.el)
    this.node.connect(this.gain).connect(dest)
    let failed = false
    const fail = () => { if (failed || this.done) return; failed = true; this.dispose(); onError() }
    this.el.addEventListener('error', fail, { once: true })
    void this.el.play().then(() => {
      if (this.done) return
      const t = ctx.currentTime
      this.gain.gain.setValueAtTime(0, t)
      this.gain.gain.linearRampToValueAtTime(MUSIC_TRIMS[id] ?? 1, t + fadeIn)
    }).catch((err: unknown) => {
      // NotAllowedError = autoplay refused (should not happen after unlock); anything else = treat as missing file
      if ((err as { name?: string } | null)?.name !== 'NotAllowedError') fail()
    })
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
    try { this.el.pause(); this.el.removeAttribute('src'); this.el.load(); this.node.disconnect(); this.gain.disconnect() } catch { /* already gone */ }
  }
}
