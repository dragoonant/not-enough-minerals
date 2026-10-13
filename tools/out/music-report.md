# Music report (ElevenLabs Music, 2026-10-13)

Generator: `tools/gen-music.ts` (idempotent; reads `tools/audio-manifest.json`, writes `public/audio/music/<id>.mp3`;
pre-call estimate 12.5 credits/s against `MUSIC_BUDGET`, default 2800; a failed call counts as charged and is retried
at most once). Model `music_v1`, `force_instrumental: true`, `mp3_44100_128`. Prompts are original mood/instrumentation
text: frontier-western slide/baritone guitar, low organic pulsing bass, industrial percussion, ethereal synth pads,
no vocals or choir; no franchise, studio, composer or track names.

| id | file | length | loop | size | credits |
|---|---|---|---|---|---|
| title | public/audio/music/title.mp3 | 60.1 s | yes | 0.96 MB | 750 |
| battle-1 | public/audio/music/battle-1.mp3 | 120.0 s | yes | 1.92 MB | 1500 |
| victory | public/audio/music/victory.mp3 | 10.0 s | no | 0.16 MB | 125 |
| defeat | public/audio/music/defeat.mp3 | 10.0 s | no | 0.16 MB | 125 |

**Credits used: 2,500 of the 2,800 task budget** (account counter 45,682 -> 48,182 of 59,062; no failed calls, no
retries). The counter lags music charges by a few minutes, so the generator budgets on the estimate, which matched
exactly. Remaining under the owner's 5,000 audio cap for SFX: 2,500.

## Wiring (done, `src/client/audio/`)
- `music.ts`: scene -> track map (`calm` = title, `battle` = battle-1 loop, `victory`/`defeat` = one-shot stingers),
  `MUSIC_TRIMS` (all 1 until auditioned), `MusicTrack` streams an `<audio>` element through the music bus.
- `manager.ts`: `setMood()` now plays the files with 1.8 s crossfades on the existing music bus (MUSIC_DB = -14 dB
  under SFX); if a file fails to load it is remembered and the old synth mood plays instead (stingers fall back to
  the synth jingle). `stats.track` shows the playing id.
- Title: `App.tsx` already calls `setMood('calm')` on the start screen (unchanged). Battle: `AudioHost` sets
  `battle` when the game screen mounts. Game over: `AudioHost` now sets `victory`/`defeat` (human winner or not)
  and skips the synth jingle when the stinger file is present; leaving the game returns to the title theme.
- Test AUD-004 checks every scene has a manifest item and a shipped file.

## Notes / follow-ups
- Not auditioned by the owner yet; untested in a real browser by this task (typecheck + 26 unit tests pass).
- `<audio loop>` on MP3 can leave a tiny gap at the loop seam; if audible, trim the files or switch the loops to
  decoded buffers (title ~10 MB PCM, battle ~21 MB PCM) or crossfade two elements near the end.
- Alternate battle loop later: add `battle-2` to the manifest (~1500 credits at 120 s) and alternate in `music.ts`.
- A `public/sounds.html` audition page (KB 3.3) does not exist yet.
