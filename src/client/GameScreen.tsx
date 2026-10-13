// Game screen (lazy chunk: engine, data, three). Boots the client once, starts the game the launch asks for, and
// composes the slots: Board (3D table, figures), Hud (prompts, banners, game over), DiceTray, AudioHost.
// M3 adds the interaction layer (select, drag move with ruler, targeting) beside these.
import { useEffect, useState } from 'react'
import { AudioHost } from './audio/AudioHost'
import { Board } from './board/Board'
import { bootClient, startLaunch } from './contract'
import { DiceTray } from './dice/DiceTray'
import { readParams } from './params'
import { useStore, type CameraPreset } from './store'
import { useLaunchStore } from './store/launch'
import { Hud } from './ui/Hud'

const PRESET_LABELS: [CameraPreset, string][] = [['overview', 'Overview'], ['near', 'Near seat'], ['far', 'Far seat'], ['top', 'Top down']]

let startedLaunch = -1

export function GameScreen() {
  const launch = useLaunchStore((s) => s.launch)
  const [error, setError] = useState<string | null>(null)
  const preset = useStore((s) => s.preset)
  const setPreset = useStore((s) => s.setPreset)

  useEffect(() => {
    const params = readParams()
    bootClient(params)
    if (launch && launch.id !== startedLaunch) {
      startedLaunch = launch.id
      const r = startLaunch(launch, params)
      setError(r ? r.text : null)
    }
  }, [launch])

  return (
    <div className="game" data-testid="game-screen">
      <div className="hud cams">
        {PRESET_LABELS.map(([id, label]) => (
          <button key={id} aria-pressed={preset === id} data-testid={`cam-${id}`} onClick={() => setPreset(id)}>{label}</button>
        ))}
      </div>
      <Board />
      <Hud />
      <DiceTray />
      <AudioHost />
      {error && <div data-testid="game-error" role="alert" className="game-error">{error}</div>}
    </div>
  )
}
