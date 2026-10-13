# M3 follow-ups (out of scope for the M3 final gate)

Gate result, 2026-10-13: typecheck clean, `npm test` 397/397 (40 files), `validate:data` ok (15 warnings by design),
build ok, `npm run sim -- --games 30`: 30 finished, 0 errors, avg 4.63 rounds, max step 134 ms (B 14, A 8, draws 8),
`npm run e2e` 11/11. Screenshots: `screenshots/m3-{start,briefing,board,dice,gallery,gameover,rings}.png` (1280x800).

## Fixed at the gate
- Briefing never opened (3 e2e failures): `ui/Briefing.tsx` called `useBoardGeometry()` after the `if (!open)` early
  return, so the hook count changed when the briefing opened and React threw. The hook now runs before the return.
- Briefing opened scrolled to the bottom (focusing "To the table" scrolled the modal); it now focuses with
  `preventScroll`. Mini-map Entry Edge labels on side edges clipped off the map; they now run along the edge inside it.
- Deploy hint now says "Click a spot inside the shaded band"; bot tier blurbs say Easy and Normal play at random for
  now; the start screen Seed box is pre-filled from `?seed=`.
- Gallery e2e waited only 5 s for the lazy canvas under 4 workers; now 30 s.

## Engine / query additions for the integrator (engine and data were frozen in M3)
- `contract.ts` should expose `query.shootOptions` (types ShootOptions, ShotWeapon, ShotTarget); the weapon panel and
  action menu should grey out entries with its `text`, and the odds row should explain TN changes with `hitNotes`.
- Rings should read `ObjectiveStatus.contestRadius`, `markerRadius`, `contested` instead of computing them in
  `contract.ts useBoardGeometry` and `board/Objectives.tsx`.
- Coherency lines read `coherencyPreview.links`; the client is wired but nothing draws until links reach the client.
- Placement-aware `canSee` / `coverFor` / `engaged` (taking a dry-run placement) so the move preview can mark
  visibility, cover and Engagement Range.
- `query.detectorAreas` wrapper so self-centred detectors from passive abilities show on the detection overlay.
- Per-die `pass[]` on `atk.stage` payloads (or a `dice.succeeds` export); then delete `dice/diceView.ts faceMeets`.
- `needed` on the charge cue payload; the tray still calls `chargeOdds` on true state ("Needed value not shown").
- A cancel option after `charge.go` (charge.targets has `canPass: false`), so "Back to actions" can exist.
- `shootOptions` reasons are rebuilt in `query.ts` and can drift from `shooting.ts checkTarget`; Point Blank and
  Coordinated Strike spotter cases show as noLos/outOfRange. Export checkTarget's reason for exact text.

## Client work still open
- `interaction/Prompt.tsx`, `kinds.ts`: ability.window / react / pay prompts lack effect line, cost and CP status and
  use raw ids ("Exhaust academy"); "Click one of your glowing squads" shows when every unit is in Reserves; the
  action helper says "see the rules card" instead of the Run cost; `turn.first` defaults to "Always me".
- `store/settingsStore.ts`: a "skip ability windows automatically" setting; native `title=` on a Prompt button (UI-021).
- Presentation: Run vs Move indistinguishable in cues; ability-use narration depends on the `note` event shape.
- Board: instancing of base rings, status icons and pips (386-562 draw calls); edge labels can sit under a rail.
- Gallery: long names overlap ("Nerazim Watchers (Adept)" runs into "Praetor Guard (Zealot)").
- Prompt docking, the fixed odds slot and the entry band were not checked by hand with a real mouse; add a
  Playwright test that hovers then clicks a target with `page.mouse`.
- Mission text for Gather the Resources names a "Gather" action no UI exposes: expose it or amend the data text.
- Every bot tier still plays random until the M4 policies land.
