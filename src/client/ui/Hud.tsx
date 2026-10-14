// HUD shell. The table is the hero: a slim top bar (PhaseBar + tools), two translucent rails that collapse to icon tabs
// (left: objectives, Supply, Reserves; right: unit card, weapons, odds, feed), a first-turn hint strip, the generic
// banners (the decision panel itself is interaction/Prompt.tsx), the briefing, settings and the game-over screen.
import { useEffect, useState } from 'react'
import type { PendingDecision } from '../../engine/types'
import {
  focus, game, presentation, useBanner, useEpoch, useFatal, useGameResult, useNarration, usePending, usePresentationIdle, usePresentedTurn, useRejection,
  useSettings, useWaitingFor, type ClientRejection,
} from '../contract'
import { MinButton, Rail, RestoreTab } from './bits'
import { panels, useHideAll, usePanelLayout, usePanelMin } from './panelStore'
import { Briefing } from './Briefing'
import { GameOver } from './GameOver'
import { ObjectiveTracker, ReservesTray, SupplyHud } from './LeftPanels'
import { PhaseBar } from './PhaseBar'
import { EventFeed, OddsPanel, UnitCard, WeaponPanel } from './RightPanels'
import { SettingsPanel } from './SettingsPanel'
import { Tip } from './Tooltip'
import './hud.css'

function HideUiButton() {
  const hideAll = useHideAll()
  return (
    <Tip title={hideAll ? 'Show UI (H)' : 'Hide UI (H)'} body={hideAll ? 'Bring every box back exactly as it was.' : 'Shrink every box to this strip so the whole table is visible. Press again (or H) to restore.'} placement="bottom">
      <button data-testid="hide-ui" aria-pressed={hideAll} onClick={() => panels.toggleHideAll()}>{hideAll ? 'Show UI' : 'Hide UI'} <kbd className="kbd">H</kbd></button>
    </Tip>
  )
}

function TopBar({ onSettings }: { onSettings: () => void }) {
  const hideAll = useHideAll()
  const toolsMin = usePanelMin('tools')
  if (hideAll) {
    return (
      <header className="topbar topbar-min" data-testid="hud-topbar" data-hidden="1">
        <PhaseBar compact />
        <div className="topbar-tools"><HideUiButton /></div>
      </header>
    )
  }
  return (
    <header className="topbar" data-testid="hud-topbar">
      <PhaseBar />
      <div className="topbar-tools">
        {toolsMin ? <RestoreTab id="tools" label="Tools" placement="bottom">Tools</RestoreTab> : (
          <>
            <Tip title="Mission briefing" body="Read the scenario, how points are scored and the first-turn tips again.">
              <button data-testid="briefing-open" onClick={() => focus.openBriefing(true)}>Briefing</button>
            </Tip>
            <Tip title="Settings" body="Volume, animation speed and narration."><button data-testid="settings-open" onClick={onSettings}>Settings</button></Tip>
            <Tip title="Skip" body="Jump past the animation that is playing."><button data-testid="hud-skip" onClick={() => presentation.skipAll()}>Skip</button></Tip>
            <Tip title="Menu" body="Leave this game and go back to the start screen."><button data-testid="hud-menu-top" onClick={() => game.backToMenu()}>Menu</button></Tip>
            <MinButton id="tools" label="Tools" placement="bottom" />
          </>
        )}
        <HideUiButton />
      </div>
    </header>
  )
}

/** H toggles Hide UI (not while typing, not with modifiers). */
function useHideKey(): void {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement | null
      if (e.ctrlKey || e.metaKey || e.altKey || (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.tagName === 'SELECT' || t.isContentEditable))) return
      if (e.key === 'h' || e.key === 'H') panels.toggleHideAll()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])
}

function Ticker({ text }: { text: string }) {
  const min = usePanelMin('ticker')
  const hideAll = useHideAll()
  if (hideAll) return null
  if (min) return <div className="ticker ticker-min"><RestoreTab id="ticker" label="Narration" placement="bottom" /></div>
  return <div className="ticker" data-testid="hud-narration">{text} <MinButton id="ticker" label="Narration" placement="bottom" className="inline" /></div>
}

function Toast({ rejection }: { rejection: ClientRejection }) {
  return (
    <div className="toast" role="alert" data-testid="hud-rejection">
      {rejection.text} <Tip title="Dismiss" body="Close this message."><button className="quiet" data-testid="hud-rejection-dismiss" onClick={() => game.clearRejection()}>Dismiss</button></Tip>
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
  const hideAll = useHideAll()
  usePanelLayout()
  useHideKey()
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
      {lastLine && <Ticker text={lastLine} />}
      {banner && !hideAll && <div className={`banner banner-${banner.tone}`} data-testid="hud-banner">{banner.text}</div>}
      <div className="dock">
        {rejection && <Toast rejection={rejection} />}
        {fatal && <div className="toast" role="alert" data-testid="hud-fatal">The game hit a problem and stopped. Start a new game from the menu.</div>}
        {!result && !pending && waiting && !hideAll && (
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
