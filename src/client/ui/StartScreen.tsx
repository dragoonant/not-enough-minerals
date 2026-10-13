// Start screen (start chunk: imports only store/launch.ts, store/settingsStore.ts, store/storage.ts and ui/start/*, no engine).
// Pick a matchup, a mission and deployment (or leave them to chance), who plays which side, and the bot tier; a briefing
// preview shows what the choice means before the game starts. Continue resumes the autosave.
import { useMemo, useState } from 'react'
import {
  DEFAULT_MATCHUP, MATCHUPS, RANDOM, continueGame, deploymentChoices, hasAutosave, launchGame, matchupOf, missionChoice, missionChoices,
  readAutosaveSummary, type MatchupId, type SeatController,
} from '../store/launch'
import { SPEED_PRESETS, useSettingsStore } from '../store/settingsStore'
import { readJson, writeJson } from '../store/storage'
import { readParams } from '../params'
import { BriefingPreview } from './start/BriefingPreview'
import { Emblem, RACE_LABEL } from './start/Emblems'
import './start/start.css'

const PREF_KEY = 'nem.start'
type PlayMode = 'bot' | 'hotseat' | 'watch'
const MODES: { id: PlayMode; label: string; blurb: string }[] = [
  { id: 'bot', label: 'Versus bot', blurb: 'You against the computer.' },
  { id: 'hotseat', label: 'Hot-seat', blurb: 'Two players, one screen.' },
  { id: 'watch', label: 'Watch bots', blurb: 'Two bots play each other.' },
]
const TIERS: { id: string; label: string; blurb: string }[] = [
  { id: 'random', label: 'Random', blurb: 'Picks any legal move.' },
  { id: 'easy', label: 'Easy', blurb: 'Goes for objectives, ignores enemy threats.' },
  { id: 'normal', label: 'Normal', blurb: 'Weighs threats, cover and tempo.' },
]
interface Prefs { mode: PlayMode; tier: string; matchup: MatchupId; mission: string; deployment: string; side: 0 | 1 }

export function seatsFor(mode: PlayMode, side: 0 | 1): SeatController[] {
  if (mode === 'hotseat') return ['human', 'human']
  if (mode === 'watch') return ['bot', 'bot']
  return side === 0 ? ['human', 'bot'] : ['bot', 'human']
}

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
  const [matchupId, setMatchupId] = useState<MatchupId>(matchupOf(saved.matchup)?.id ?? DEFAULT_MATCHUP)
  const [side, setSide] = useState<0 | 1>(saved.side === 1 ? 1 : 0)
  const [mission, setMission] = useState<string>(saved.mission ?? RANDOM)
  const [deployment, setDeployment] = useState<string>(saved.deployment ?? RANDOM)
  const [draft, setDraft] = useState(false)
  const [seed, setSeed] = useState(() => readParams().seed ?? '')
  const speed = useSettingsStore((s) => s.speed)
  const setSettings = useSettingsStore((s) => s.set)
  const autosave = hasAutosave() ? readAutosaveSummary() : null

  const matchup = matchupOf(matchupId) ?? matchupOf(DEFAULT_MATCHUP)!
  const missions = missionChoices(matchup.scale)
  const deployments = deploymentChoices(matchup.scale)
  const missionId = missions.some((m) => m.id === mission) ? mission : RANDOM
  const deploymentId = deployments.some((d) => d.id === deployment) ? deployment : RANDOM
  const fixed = !!matchup.preset
  const picks = !fixed && !draft

  const start = () => {
    writeJson(PREF_KEY, { mode, tier, matchup: matchup.id, mission: missionId, deployment: deploymentId, side })
    launchGame({
      matchup: matchup.id, seats: seatsFor(mode, side), tier,
      ...(fixed ? {} : draft ? { draft: true } : { missionId, deploymentId }),
      ...(seed.trim() ? { seed: seed.trim() } : {}),
    })
  }

  return (
    <main className="start" data-testid="start-screen">
      <div className="start-card sc">
        <header className="sc-head">
          <p className="eyebrow">An unofficial fan project</p>
          <h1>Not Enough Minerals</h1>
          <p className="subtitle">Tabletop Miniatures Game</p>
        </header>

        <div className="sc-cols">
         <div className="sc-col">
          <section className="sc-sec" aria-label="Matchup">
            <h2 className="sc-h">Who fights</h2>
            <div className="sc-matchups" data-testid="matchup-picker" role="radiogroup" aria-label="Matchup">
              {MATCHUPS.map((m) => (
                <button key={m.id} className="sc-match" role="radio" aria-checked={m.id === matchup.id} aria-pressed={m.id === matchup.id} data-testid={`matchup-${m.id}`} onClick={() => setMatchupId(m.id)}>
                  <span className="sc-emb"><Emblem race={m.races[0]} size={26} /><i>v</i><Emblem race={m.races[1]} size={26} /></span>
                  <span className="sc-mt">{m.label}</span>
                  <small>{m.blurb}</small>
                </button>
              ))}
            </div>
          </section>
          <section className="sc-sec" aria-label="Bot">
            {mode !== 'hotseat' && (
              <>
                <h2 className="sc-h ">Bot</h2>
                <div className="sc-row" data-testid="opponent-tier">
                  {TIERS.map((o) => (
                    <button key={o.id} className="sc-chip" aria-pressed={o.id === tier} data-testid={`opponent-${o.id}`} onClick={() => setTier(o.id)}>
                      {o.label}<small>{o.blurb}</small>
                    </button>
                  ))}
                </div>
              </>
            )}
          </section>
          <section className="sc-sec sc-tight" aria-label="Options">
            <h2 className="sc-h">Speed</h2>
            <div className="sc-row">
              {SPEED_PRESETS.map((p) => (
                <button key={p.id} className="sc-chip sc-chip-sm" aria-pressed={p.speed === speed} data-testid={`speed-${p.id}`} onClick={() => setSettings({ speed: p.speed })}>{p.label}</button>
              ))}
            </div>
            <div className="sc-seed"><h2 className="sc-h"><label htmlFor="seed">Seed</label></h2><input id="seed" type="text" data-testid="seed-input" placeholder="random" value={seed} maxLength={40} onChange={(e) => setSeed(e.target.value)} /></div>
          </section>
         </div>
         <div className="sc-col">
          <section className="sc-sec" aria-label="Scenario">
            <h2 className="sc-h">Where and why</h2>
            {fixed ? (
              <p className="sc-note">The learning game plays a fixed mission on a fixed map.</p>
            ) : (
              <>
                <label className="sc-lab" htmlFor="mission-select">Mission</label>
                <select id="mission-select" data-testid="mission-select" value={missionId} disabled={draft} onChange={(e) => setMission(e.target.value)}>
                  <option value={RANDOM}>Random mission</option>
                  {missions.map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}
                </select>
                <label className="sc-lab" htmlFor="deployment-select">Deployment</label>
                <select id="deployment-select" data-testid="deployment-select" value={deploymentId} disabled={draft} onChange={(e) => setDeployment(e.target.value)}>
                  <option value={RANDOM}>Random deployment</option>
                  {deployments.map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}
                </select>
                <label className="sc-check"><input type="checkbox" data-testid="draft-toggle" checked={draft} onChange={(e) => setDraft(e.target.checked)} /> Draft them in play (advanced)</label>
              </>
            )}
            <BriefingPreview missionId={picks && missionId !== RANDOM ? missionId : null} deploymentId={picks && deploymentId !== RANDOM ? deploymentId : null} locked={fixed} />
          </section>
          <section className="sc-sec" aria-label="Players">
            <h2 className="sc-h">Players</h2>
            <div className="sc-row">
              {MODES.map((m) => (
                <button key={m.id} className="sc-chip" aria-pressed={m.id === mode} data-testid={`mode-${m.id}`} onClick={() => setMode(m.id)}>
                  {m.label}<small>{m.blurb}</small>
                </button>
              ))}
            </div>
            {mode === 'bot' && (
              <div className="sc-row sc-gap" data-testid="side-picker" role="radiogroup" aria-label="Your side">
                {([0, 1] as const).map((s) => (
                  <button key={s} className="sc-chip" role="radio" aria-checked={side === s} aria-pressed={side === s} data-testid={`side-${s}`} onClick={() => setSide(s)}>
                    <span className="sc-sidel"><Emblem race={matchup.races[s]} size={18} /> Play {RACE_LABEL[matchup.races[s]]}</span>
                    <small>{s === 0 ? 'Near edge, moves from the bottom.' : 'Far edge, moves from the top.'}</small>
                  </button>
                ))}
              </div>
            )}
          </section>
         </div>
        </div>

        <div className="sc-actions">
          <button className="go" data-testid="start-button" onClick={start}>Deploy to the table</button>
          {autosave && (
            <button className="go alt" data-testid="continue-button" onClick={() => continueGame()}>
              Continue (round {autosave.round}{autosave.savedAt ? `, ${ageLabel(autosave.savedAt)}` : ''}
              {autosave.missionId ? `, ${missionChoice(autosave.missionId)?.name ?? 'saved game'}` : ''})
            </button>
          )}
          <p className="fine" data-testid="fan-notice">
            Unofficial fan project, not affiliated with Archon Studio or Blizzard Entertainment. Made by evilgouki.
          </p>
        </div>
      </div>
    </main>
  )
}
