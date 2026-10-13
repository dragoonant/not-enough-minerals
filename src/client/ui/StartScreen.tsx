// Start screen (start chunk: imports only store/launch.ts, store/settingsStore.ts, store/storage.ts, no engine).
// M0: the demo table only. M3 adds the scenario list, faction picks, briefings and the opponent tiers from the AI.
import { useMemo, useState } from 'react'
import { continueGame, hasAutosave, launchGame, readAutosaveSummary, type SeatController } from '../store/launch'
import { SPEED_PRESETS, useSettingsStore } from '../store/settingsStore'
import { readJson, writeJson } from '../store/storage'
import './start/start.css'

const PREF_KEY = 'nem.start'
type PlayMode = 'bot' | 'hotseat' | 'watch'
const MODES: { id: PlayMode; label: string; blurb: string; seats: SeatController[] }[] = [
  { id: 'bot', label: 'Versus bot', blurb: 'You take the near edge.', seats: ['human', 'bot'] },
  { id: 'hotseat', label: 'Hot-seat', blurb: 'Two players, one screen.', seats: ['human', 'human'] },
  { id: 'watch', label: 'Watch bots', blurb: 'Two bots play each other.', seats: ['bot', 'bot'] },
]
const TIERS: { id: string; label: string; blurb: string }[] = [
  { id: 'random', label: 'Random', blurb: 'Picks any legal choice.' },
  { id: 'easy', label: 'Easy', blurb: 'Placeholder until the AI lands.' },
  { id: 'normal', label: 'Normal', blurb: 'Placeholder until the AI lands.' },
]
interface Prefs { mode: PlayMode; tier: string }

function ageLabel(iso: string): string {
  const ms = Date.now() - Date.parse(iso)
  if (!Number.isFinite(ms) || ms < 0) return ''
  const min = Math.round(ms / 60000)
  return min < 1 ? 'just now' : min < 60 ? `${min} min ago` : min < 1440 ? `${Math.round(min / 60)} h ago` : `${Math.round(min / 1440)} d ago`
}

export function StartScreen() {
  const saved = useMemo(() => readJson<Partial<Prefs>>(PREF_KEY) ?? {}, [])
  const [mode, setMode] = useState<PlayMode>(MODES.some((m) => m.id === saved.mode) ? saved.mode! : 'bot')
  const [tier, setTier] = useState<string>(TIERS.some((t) => t.id === saved.tier) ? saved.tier! : 'normal')
  const [seed, setSeed] = useState('')
  const speed = useSettingsStore((s) => s.speed)
  const setSettings = useSettingsStore((s) => s.set)
  const autosave = hasAutosave() ? readAutosaveSummary() : null

  const start = () => {
    writeJson(PREF_KEY, { mode, tier })
    const seats = MODES.find((m) => m.id === mode)!.seats
    launchGame({ seats, tier, ...(seed.trim() ? { seed: seed.trim() } : {}) })
  }

  return (
    <main className="start" data-testid="start-screen">
      <div className="start-card sc">
        <p className="eyebrow">An unofficial fan project</p>
        <h1>Not Enough Minerals</h1>
        <p className="subtitle">Tabletop Miniatures Game</p>
        <p className="tag">A 3D skirmish on a 3 by 3 foot table. Early build: a placeholder table with stand-in figures.</p>

        <section className="sc-sec" aria-label="Mode">
          <h2 className="sc-h">Mode</h2>
          <div className="sc-row">
            {MODES.map((m) => (
              <button key={m.id} className="sc-chip" aria-pressed={m.id === mode} data-testid={`mode-${m.id}`} onClick={() => setMode(m.id)}>
                {m.label}<small>{m.blurb}</small>
              </button>
            ))}
          </div>
        </section>

        {mode !== 'hotseat' && (
          <section className="sc-sec" aria-label="Opponent">
            <h2 className="sc-h">Bot</h2>
            <div className="sc-row" data-testid="opponent-tier">
              {TIERS.map((o) => (
                <button key={o.id} className="sc-chip" aria-pressed={o.id === tier} data-testid={`opponent-${o.id}`} onClick={() => setTier(o.id)}>
                  {o.label}<small>{o.blurb}</small>
                </button>
              ))}
            </div>
          </section>
        )}

        <section className="sc-sec" aria-label="Options">
          <h2 className="sc-h">Speed</h2>
          <div className="sc-row">
            {SPEED_PRESETS.map((p) => (
              <button key={p.id} className="sc-chip" aria-pressed={p.speed === speed} data-testid={`speed-${p.id}`} onClick={() => setSettings({ speed: p.speed })}>{p.label}</button>
            ))}
          </div>
          <h2 className="sc-h" style={{ marginTop: 14 }}><label htmlFor="seed">Seed</label></h2>
          <input id="seed" type="text" data-testid="seed-input" placeholder="random" value={seed} maxLength={40} onChange={(e) => setSeed(e.target.value)} />
          <p className="sc-note">Same seed, same dice. Leave it blank for a fresh game.</p>
        </section>

        <div className="sc-actions">
          <button className="go" data-testid="start-button" onClick={start}>Deploy to the table</button>
          {autosave && (
            <button className="go alt" data-testid="continue-button" onClick={() => continueGame()}>
              Continue (round {autosave.round}{autosave.savedAt ? `, ${ageLabel(autosave.savedAt)}` : ''})
            </button>
          )}
        </div>

        <p className="fine" data-testid="disclaimer">
          Unofficial fan project, not affiliated with Archon Studio or Blizzard Entertainment. By evilgouki.
        </p>
      </div>
    </main>
  )
}
