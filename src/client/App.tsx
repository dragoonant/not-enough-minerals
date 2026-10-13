// App shell (start chunk). The game screen, engine and data load lazily on the first launch, so the start screen
// stays small. URL test hooks (?test=1, ?seats=, ?matchup=, ?mission=...) skip straight into a game.
import { lazy, Suspense, useEffect } from 'react'
import './ui/styles.css'
import { paramsLaunch, readParams } from './params'
import { launchGame, useLaunchStore } from './store/launch'
import { audio } from './audio/manager'
import { StartScreen } from './ui/StartScreen'

const GameScreen = lazy(() => import('./GameScreen').then((m) => ({ default: m.GameScreen })))

export function App() {
  const screen = useLaunchStore((s) => s.screen)
  useEffect(() => {
    audio.attachAutoUnlock()
    audio.setMood('calm')
    const p = readParams()
    if (p.autostart && !useLaunchStore.getState().launch) launchGame(paramsLaunch(p))
  }, [])
  if (screen === 'start') return <StartScreen />
  return (
    <Suspense fallback={<div className="start" data-testid="loading"><p className="tag">Setting up the table...</p></div>}>
      <GameScreen />
    </Suspense>
  )
}
