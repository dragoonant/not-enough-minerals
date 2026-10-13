// Mount once inside GameScreen: unlocks audio on first click, plays sounds from presentation cues, sets the music scene
// (battle loop in game, victory/defeat stinger on game over, title theme again on leaving),
// and shows the sound toggle + volume popover (data-testid audio-toggle).
import { useEffect, useState } from 'react'
import { onCue } from '../presentation/director'
import { useGameStore } from '../store/gameStore'
import { audio, type AudioSettings } from './manager'
import { soundsForCue } from './cueSounds'

const box: React.CSSProperties = { position: 'fixed', right: 12, bottom: 12, zIndex: 6, display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 6 }
const panel: React.CSSProperties = { background: 'rgba(15,20,27,.94)', border: '1px solid #46515c', borderRadius: 4, padding: '8px 10px', fontSize: 12, color: '#dfe6ee', display: 'grid', gridTemplateColumns: 'auto 110px', gap: '6px 8px', alignItems: 'center' }

export function AudioHost() {
  const [s, setS] = useState<AudioSettings>(() => audio.getSettings())
  const [open, setOpen] = useState(false)

  useEffect(() => {
    audio.attachAutoUnlock()
    audio.setMood('battle')
    const offSettings = audio.subscribe(setS)
    const offCue = onCue((cue, beat) => {
      let humanWon = false
      const gameOver = cue.kind === 'banner' && cue.tone === 'gameOver'
      if (gameOver && cue.winner) humanWon = useGameStore.getState().controllers[cue.winner] === 'human'
      const sting = humanWon ? 'victory' : 'defeat'
      // The music stinger replaces the synth jingle unless its file failed to load.
      const fileSting = gameOver && audio.hasMusicFile(sting)
      if (gameOver) audio.setMood(sting)
      for (const c of soundsForCue(cue, beat.durationMs, humanWon)) if (!(fileSting && c.id === sting)) audio.play(c.id, { volume: c.volume, delayMs: c.delayMs })
    })
    return () => { offCue(); offSettings(); audio.setMood('calm') }
  }, [])

  const slider = (label: string, key: 'master' | 'sfx' | 'music') => (
    <>
      <label htmlFor={`aud-${key}`}>{label}</label>
      <input id={`aud-${key}`} data-testid={`audio-${key}`} type="range" min={0} max={1} step={0.05} value={s[key]} onChange={(e) => audio.set({ [key]: Number(e.target.value) })} />
    </>
  )

  return (
    <div style={box}>
      {open && (
        <div style={panel} data-testid="audio-panel">
          {slider('Master', 'master')}
          {slider('Effects', 'sfx')}
          {slider('Music', 'music')}
        </div>
      )}
      <div style={{ display: 'flex', gap: 6 }}>
        <button data-testid="audio-toggle" aria-pressed={!s.muted} aria-label={s.muted ? 'Unmute sound' : 'Mute sound'} title={s.muted ? 'Sound off' : 'Sound on'} onClick={() => audio.set({ muted: !s.muted })}>
          {s.muted ? 'Sound off' : 'Sound on'}
        </button>
        <button data-testid="audio-volume" aria-expanded={open} aria-label="Volume" onClick={() => setOpen((o) => !o)}>Vol</button>
      </div>
    </div>
  )
}
