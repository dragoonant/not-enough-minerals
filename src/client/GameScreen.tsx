// Game screen (lazy chunk: engine, data, three). Boots the client once, starts the game the launch asks for, and
// composes the slots (FINAL export names; each owner fills its own file and imports only from ./contract):
//   board/Board.tsx          Board            (P)  3D table: mat, terrain, Entry Edges, zones, control-zone rings, camera
//   figures/Figures.tsx      Figures          (P)  figures, status icons, card-hover glow (inside the Board canvas)
//   interaction/Interaction  InteractionScene (I)  in-canvas picking, drag ghosts, rulers (inside the Board canvas)
//                            Interaction      (I)  DOM overlay half
//   ui/Hud.tsx               Hud              (U)  rails, phase bar, Supply, reserves, objective tracker, briefing, prompts
//   dice/DiceTray.tsx        DiceTray         (D)  every roll, with the working
//   audio/AudioHost.tsx      AudioHost        (D)
// The start screen (ui/StartScreen.tsx, D) lives in the start chunk (App.tsx).
import { useEffect, useState } from 'react'
import { AudioHost } from './audio/AudioHost'
import { Board } from './board/Board'
import { bootClient, focus, startLaunch, useEpoch } from './contract'
import { DiceTray } from './dice/DiceTray'
import { Figures } from './figures/Figures'
import { Interaction, InteractionScene } from './interaction/Interaction'
import { readParams } from './params'
import { useStore, type CameraPreset } from './store'
import { useLaunchStore } from './store/launch'
import { Hud } from './ui/Hud'

const PRESET_LABELS: [CameraPreset, string][] = [['overview', 'Overview'], ['near', 'Near seat'], ['far', 'Far seat'], ['top', 'Top down']]

let startedLaunch = -1

export function GameScreen() {
  const launch = useLaunchStore((s) => s.launch)
  const epoch = useEpoch()
  const [error, setError] = useState<string | null>(null)
  const preset = useStore((s) => s.preset)
  const setPreset = useStore((s) => s.setPreset)
  // ?gallery: the figure line-up only (no HUD, prompts or dice over it).
  const gallery = readParams().gallery

  useEffect(() => {
    const params = readParams()
    bootClient(params)
    if (launch && launch.id !== startedLaunch) {
      startedLaunch = launch.id
      const r = startLaunch(launch, params)
      setError(r ? r.text : null)
    }
  }, [launch])

  // The briefing opens once per game (KB 9.5); URL-started e2e runs (?test=1 without ?menu=1) start with it closed.
  useEffect(() => { const p = readParams(); if (epoch > 0 && !p.gallery && (!p.test || p.menu)) focus.briefOnce(epoch) }, [epoch])

  return (
    <div className="game" data-testid="game-screen">
      <div className="hud cams">
        {PRESET_LABELS.map(([id, label]) => (
          <button key={id} aria-pressed={preset === id} data-testid={`cam-${id}`} onClick={() => setPreset(id)}>{label}</button>
        ))}
      </div>
      <Board>
        <Figures />
        {!gallery && <InteractionScene />}
      </Board>
      {!gallery && (
        <>
          <Interaction />
          <Hud />
          <DiceTray />
        </>
      )}
      <AudioHost />
      {error && <div data-testid="game-error" role="alert" className="game-error">{error}</div>}
    </div>
  )
}
