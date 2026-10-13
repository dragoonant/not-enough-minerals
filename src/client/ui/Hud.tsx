// HUD shell. The table is the hero: a slim top bar (PhaseBar + tools), two translucent rails that collapse to icon tabs
// (left: objectives, Supply, Reserves; right: unit card, weapons, odds, feed), a first-turn hint strip, the generic
// banners (the decision panel itself is interaction/Prompt.tsx), the briefing, settings and the game-over screen.
import { useState } from 'react'
import type { PendingDecision } from '../../engine/types'
import {
  focus, game, presentation, useBanner, useEpoch, useFatal, useGameResult, useNarration, usePending, usePresentationIdle, usePresentedTurn, useRejection,
  useSettings, useWaitingFor, type ClientRejection,
} from '../contract'
import { Rail } from './bits'
import { Briefing } from './Briefing'
import { GameOver } from './GameOver'
import { ObjectiveTracker, ReservesTray, SupplyHud } from './LeftPanels'
import { PhaseBar } from './PhaseBar'
import { EventFeed, OddsPanel, UnitCard, WeaponPanel } from './RightPanels'
import { SettingsPanel } from './SettingsPanel'
import { Tip } from './Tooltip'
import './hud.css'

function TopBar({ onSettings }: { onSettings: () => void }) {
  return (
    <header className="topbar" data-testid="hud-topbar">
      <PhaseBar />
      <div className="topbar-tools">
        <Tip title="Mission briefing" body="Read the scenario, how points are scored and the first-turn tips again.">
          <button data-testid="briefing-open" onClick={() => focus.openBriefing(true)}>Briefing</button>
        </Tip>
        <Tip title="Settings" body="Volume, animation speed and narration."><button data-testid="settings-open" onClick={onSettings}>Settings</button></Tip>
        <Tip title="Skip" body="Jump past the animation that is playing."><button data-testid="hud-skip" onClick={() => presentation.skipAll()}>Skip</button></Tip>
        <button data-testid="hud-menu-top" onClick={() => game.backToMenu()}>Menu</button>
      </div>
    </header>
  )
}

function Toast({ rejection }: { rejection: ClientRejection }) {
  return (
    <div className="toast" role="alert" data-testid="hud-rejection">
      {rejection.text} <button className="quiet" data-testid="hud-rejection-dismiss" onClick={() => game.clearRejection()}>Dismiss</button>
    </div>
  )
}

export function Hud() {
  const banner = useBanner()
  const pending = usePending()
  const waiting = useWaitingFor()
  const idle = usePresentationIdle()
  const rejection = useRejection()
  const result = useGameResult()
  const fatal = useFatal()
  const narration = useNarration()
  const { narration: narrationOn } = useSettings()
  const [settingsOpen, setSettingsOpen] = useState(false)
  const lastLine = narrationOn ? narration[narration.length - 1]?.text : null
  return (
    <div className="hud-root" data-testid="hud">
      <TopBar onSettings={() => setSettingsOpen(true)} />
      <Rail id="left" side="left" testid="rail-left" sections={[
        { id: 'objectives', label: 'Objectives', icon: 'objectives', node: <ObjectiveTracker /> },
        { id: 'supply', label: 'Supply', icon: 'supply', node: <SupplyHud /> },
        { id: 'reserves', label: 'Reserves', icon: 'reserves', node: <ReservesTray /> },
      ]} />
      <Rail id="right" side="right" testid="rail-right" sections={[
        { id: 'odds', label: 'Odds', icon: 'odds', node: <OddsPanel /> },
        { id: 'unit', label: 'Unit card', icon: 'unit', node: <UnitCard /> },
        { id: 'weapons', label: 'Weapons', icon: 'weapons', node: <WeaponPanel /> },
        { id: 'feed', label: 'What happened', icon: 'feed', node: <EventFeed /> },
      ]} />
      {lastLine && <div className="ticker" data-testid="hud-narration">{lastLine}</div>}
      {banner && <div className={`banner banner-${banner.tone}`} data-testid="hud-banner">{banner.text}</div>}
      <div className="dock">
        {rejection && <Toast rejection={rejection} />}
        {fatal && <div className="toast" role="alert" data-testid="hud-fatal">The game hit a problem and stopped. Start a new game from the menu.</div>}
        {!result && !pending && waiting && (
          <div className="panel waiting" data-testid="hud-thinking">
            {!idle ? 'Resolving...' : waiting.controller !== 'human' ? `${waiting.label} is thinking...` : `Waiting for ${waiting.label}...`}
          </div>
        )}
      </div>
      <Briefing />
      {settingsOpen && <SettingsPanel onClose={() => setSettingsOpen(false)} />}
      <GameOver />
    </div>
  )
}
