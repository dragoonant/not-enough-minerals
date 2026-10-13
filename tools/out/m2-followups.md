# M2 follow-ups (out of scope for the M2 final gate)

Gate result, 2026-10-13: typecheck clean, `npm test` 330/330 (31 files), `validate:data` ok (15 warnings by design),
build ok, `npm run sim -- --games 60`: 60 finished, 0 errors, max step 137 ms.

## Fixed at the gate
- `hook-wiring-4` (terran-starter vs protoss-starter) failed with "A Move must change position". After a Leg
  Enhancements `ability.target` answer, the afterAction guard in `hooks.ts` saw the answered decision (still
  `state.pending`) as a fresh passive-opened `ability.target` and reported `raised`, so turnflow stopped with no new
  decision. `apply()` now records the id it is answering (`pending.ts` `answeringId()`), and the guard ignores that id.

## Engine wiring still open
- `reposition()` / `arrive()` return `raised` + `pending`, but abilities execPoint / respawn / morph / summon,
  `charge.ts` and `melee.ts` still ignore `.raised`, and abilities do not pass `returnTo`. Abilities should call
  `reserves.raiseDeployNow` after `returnToReserves` + altEntry.
- `reserves.entryOptions` does not read the stored altEntry nonEntryEdge Effect (Armed and Ready); `arrive()` still
  accepts nonEntryEdge without that effect (kept for the DEP-004 test). The nominated hook is not dispatched for
  End-of-Round drop rows (`deploy.drop`).
- Creep Tumors: `scoring.ts` stepCleanup, `reserves.returnToReserves` and `squads.tokenBodies` must call
  `effects.tokenGrants(state, bundle, {defId, owner}, 'STAY_IN_PLAY' | 'DISPLACEMENT')`, or tumors are removed at
  every Cleanup.
- Smart Shells / Shaped Blast: `hooks.ts` redirect-attack returns no `redirectTo`, so a declare-time keyword cannot
  open a new target.
- `missions.ts` Divide and Conquer quarter totals read `supplyFor(..., 'vp')`, which drops the Commander / Domineering
  Presence `objectives` +1. The appended RULING says 'vp' + 1 per marker holder; reconcile code and ruling.
- ENG-OVER: `apply()` rejects every action once `phase` is 'over', so a listed `turn.over` is never accepted. Spec 00
  s3.1 needs an exception line, or apply should accept `turn.over` as a no-op.
- `geometry.ts` placeWithin keeps a literal default `opts.dist ?? 2` (unused base-project helper).

## Tests missing
- `shooting.ts` targetRestriction and coordinatedStrike reads; charge tests mock `movement.reposition`, so the
  planner is not exercised against real terrain.
- Per-card triggerUnit tests (Concussive Shells, Debilitating Saliva, Gravitic Boosters, Pneumatized Carapace) and a
  per-card Rapid Ingress delayed ctx test.
- Photon Overcharge raise path (DEP-015 covers only a clean resume). DEP-003 Leading Model search is a finite bearing
  sample, not a proof.

## Balance / AI
- The 100-game mirror sim for seat bias was not run. The 60-game mixed sim gave B 27, A 17, draws 16; check whether
  this is matchup order or seat bias before M4.

## DATA MISFITs (data is frozen; constants documented in code)
- rules.json: `longRangeHitMod` (R p.89; `attack.ts` LONG_RANGE_HIT_MOD), `templateDims` (R p.66; `shooting.ts`
  TEMPLATE_DIMS), a terrain-solid-size key (`terrain.ts` SOLID_TERRAIN_SIZE), `scales[x].maps` (TER-001 mapCount).
- accelerating-creep and malignant-creep grant STAY_IN_PLAY / DISPLACEMENT with `to: tokenArea` and no `token` field.
