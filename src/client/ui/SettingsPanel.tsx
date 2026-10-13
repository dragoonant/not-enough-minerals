// SettingsPanel: volume, dice mode, animation speed, narration. Opens from the top bar.
import { useEffect, useState } from 'react'
import { audio, type AudioSettings } from '../audio/manager'
import { SPEED_PRESETS, presentation, settings, useSettings } from '../contract'
import { ModalLayer } from './ModalLayer'
import { Tip } from './Tooltip'

export function SettingsPanel({ onClose }: { onClose: () => void }) {
  const { speed, narration } = useSettings()
  const [a, setA] = useState<AudioSettings>(() => audio.getSettings())
  useEffect(() => audio.subscribe(setA), [])
  useEffect(() => {
    const k = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', k)
    return () => window.removeEventListener('keydown', k)
  }, [onClose])
  const slider = (key: 'master' | 'sfx' | 'music', label: string) => (
    <label className="srow"><span>{label}</span>
      <input type="range" min={0} max={1} step={0.05} value={a[key]} data-testid={`settings-${key}`} onChange={(e) => audio.set({ [key]: Number(e.target.value) })} />
    </label>
  )
  return (
    <ModalLayer><div className="modal-back" onClick={(e) => { if (e.target === e.currentTarget) onClose() }}>
      <div className="modal settings" role="dialog" aria-modal="true" aria-label="Settings" data-testid="settings-panel">
        <h2>Settings</h2>
        <h4>Sound</h4>
        {slider('master', 'Volume')}
        {slider('sfx', 'Effects')}
        {slider('music', 'Music')}
        <label className="srow"><span>Mute everything</span><input type="checkbox" checked={a.muted} data-testid="settings-mute" onChange={(e) => audio.set({ muted: e.target.checked })} /></label>
        <h4>Pace</h4>
        <label className="srow"><span>Animation speed</span>
          <select value={String(speed)} data-testid="settings-speed" onChange={(e) => presentation.setSpeed(Number(e.target.value))}>
            {SPEED_PRESETS.map((p) => <option key={p.id} value={String(p.speed)}>{p.label}</option>)}
          </select>
        </label>
        <label className="srow"><span>Narration lines</span><input type="checkbox" checked={narration} data-testid="settings-narration" onChange={(e) => settings.set({ narration: e.target.checked })} /></label>
        <h4>Dice</h4>
        <fieldset className="srow dice-mode" data-testid="settings-dice-mode">
          <label><input type="radio" name="dice" defaultChecked /> Quick tray</label>
          <Tip title="3D throw" body="Dice thrown across the table. Arrives with the art pass."><label className="off"><input type="radio" name="dice" disabled /> 3D throw</label></Tip>
          <Tip title="Dice on the battlefield" body="Dice rolled where the fight is. Arrives with the art pass."><label className="off"><input type="radio" name="dice" disabled /> On the table</label></Tip>
        </fieldset>
        <div className="bf-foot"><button className="primary" data-testid="settings-close" onClick={onClose}>Done</button></div>
      </div>
    </div></ModalLayer>
  )
}
