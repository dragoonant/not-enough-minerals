// HUD shell: top bar (round, turn, speed, skip, menu), narration ticker, banner, the prompt for the open human decision
// (one button per option), rejection toast, "thinking" indicator and the game-over recap. M3 adds rails, the unit card,
// the activation panel, odds, the briefing and the objective tracker on top of this shell.
import {
  SPEED_PRESETS, game, presentation, seatLabel, useBanner, useFatal, useGame, useGameResult, useNarration, usePending,
  usePresented, usePresentedTurn, useRejection, useSettings, useWaitingFor, type ClientRejection,
} from '../contract'
import type { PendingDecision } from '../../engine/types'
import { GameOver } from './GameOver'
import './hud.css'

function TopBar() {
  const turn = usePresentedTurn()
  const state = usePresented()
  const waiting = useWaitingFor()
  const g = useGame()
  const { speed } = useSettings()
  return (
    <header className="topbar" data-testid="hud-topbar">
      <div className="topbar-main">
        <b data-testid="hud-round">Round {turn.round}{state?.maxRounds ? ` of ${state.maxRounds}` : ''}</b>
        <span data-testid="hud-turn">{turn.seat ? `${seatLabel(turn.seat)} to act` : 'Setting up'}</span>
        {waiting && <span className="dim" data-testid="hud-waiting">{waiting.controller !== 'human' ? `${waiting.label} is thinking` : waiting.hotSeat ? `${waiting.label}: your decision` : 'Your decision'}</span>}
      </div>
      <div className="topbar-seats">
        {g.seatOrder.map((seat) => (
          <span key={seat} className={`seatpill${turn.seat === seat ? ' on' : ''}`} data-testid={`seat-${seat}`}>
            {seatLabel(seat)}: score {state?.seats[seat]?.score ?? 0}
          </span>
        ))}
      </div>
      <div className="topbar-tools">
        <select aria-label="Animation speed" data-testid="hud-speed" value={String(speed)} onChange={(e) => presentation.setSpeed(Number(e.target.value))}>
          {SPEED_PRESETS.map((p) => <option key={p.id} value={String(p.speed)}>{p.label}</option>)}
        </select>
        <button data-testid="hud-skip" onClick={() => presentation.skipAll()}>Skip</button>
        <button data-testid="hud-menu-top" onClick={() => game.backToMenu()}>Menu</button>
      </div>
    </header>
  )
}

/** Generic prompt: the decision kind's options as buttons (option labels come from the engine). */
function Prompt({ pending }: { pending: PendingDecision }) {
  return (
    <div className="panel prompt" data-testid="hud-prompt" data-kind={pending.kind}>
      <div className="options">
        {pending.options.map((o) => (
          <button key={o.id} data-testid={`option-${o.id}`} className={o.id === 'pass' ? 'quiet' : 'primary'} onClick={() => game.choose(o.id)}>{o.label}</button>
        ))}
      </div>
    </div>
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
  const rejection = useRejection()
  const result = useGameResult()
  const fatal = useFatal()
  const narration = useNarration()
  const { narration: narrationOn } = useSettings()
  const lastLine = narrationOn ? narration[narration.length - 1]?.text : null
  return (
    <div className="hud-root" data-testid="hud">
      <TopBar />
      {lastLine && <div className="ticker" data-testid="hud-narration">{lastLine}</div>}
      {banner && <div className={`banner banner-${banner.tone}`} data-testid="hud-banner">{banner.text}</div>}
      <div className="dock">
        {rejection && <Toast rejection={rejection} />}
        {fatal && <div className="toast" role="alert" data-testid="hud-fatal">The game hit a problem and stopped. Start a new game from the menu.</div>}
        {!result && pending && <Prompt pending={pending} />}
        {!result && !pending && waiting && (
          <div className="panel waiting" data-testid="hud-thinking">
            {waiting.controller !== 'human' ? `${waiting.label} is thinking...` : `Waiting for ${waiting.label}...`}
          </div>
        )}
      </div>
      <GameOver />
    </div>
  )
}
