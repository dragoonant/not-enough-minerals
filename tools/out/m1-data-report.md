# M1 data report (edition `sc-2026-10`)

Gate run 2026-10-13. `npm run validate:data` ok (15 warnings, all expected CT-only rows), `npm run typecheck` clean,
`npm test` 31/31, `npm run build` ok, `npm run sim -- --games 5` 5 finished, 0 errors.

## Counts

| Faction | Units (summoned) | Upgrades | Abilities | Weapons | Cards (faction / tactical / creep) | CT unit rows | Hooks |
|---|---|---|---|---|---|---|---|
| Terran | 8 (1) | 20 | 27 | 17 | 13 (2 / 11 / 0) | 11 | 1 |
| Zerg | 13 (2) | 28 | 49 | 20 | 14 (2 / 10 / 2) | 15 | 2 |
| Protoss | 10 (1) | 16 | 36 | 16 | 15 (3 / 12 / 0) | 12 | 2 |
| Core | - | - | - | - | - | 39 card gas prices | 0 core + 15 cards |
| **Total** | **31** | **64** | **112** | **53** | **42** | **38** | **20** |

Missions: 6 files x 2 scales = 12 Mission Cards. Deployments: 12. Presets: 6 (terran-starter, terran-founders,
zerg-founders, protoss-starter, first-battle-terran, first-battle-zerg). Keywords: 39 (14 weapon, 11 effect, 6 status,
5 ability, 2 defensive, 1 term). No batch asked for a new KEYWORD, so keywords.json is unchanged.

Summoned units with no CT row: Point Defense Drone, Roachling, Omega Worm, Pylon.

## Gate fixes
- `src/data/data.test.ts` COST-002 used `records.costs[0]` as the Terran table; with four cost files the order is
  alphabetical (cards first). It now looks the record up by id `ct-2026-10-terran`.
- `costs/zerg.json` cited CL p.4/p.5 and `costs/protoss.json` CL p.7; the Changelog has 2 pages. All now CL p.2.
- `src/data/types.ts` comment renamed Ready for Pickup?! to Ready for Pickup? (matches the card record).
- `docs/needs-rules-check.md`: merged three duplicate pairs (Artanis CL line, Return to Reserves VP, MORPH supply
  check) and appended 23 RULING lines from the batches.

## Refuted findings
- Zerg: hydralisk.json ancillary-carapace needs no `who`; its subject `self` already names the Hydralisk's own roll.
- Protoss 7: Immortal Indomitable needs no new ruling; Evade '-' units never roll Evade is already recorded
  (R p.33 3.4, Confirmed).
- Core: the verifier's claim-timing concern needed no data fix; `rules.json` now carries `claimTiming`.
- Terran 7 and Zerg/Cards CT-only rows: intentional, warn only (Nova x2, Spec-Ops Marauder, Raven, Zagara, Vileling,
  Bile Launcher, Defiler, Tassadar, Twilight Templar, High Templar; cards Vanadium Plating, Defiler Mound, Reactive
  Creep, Templar Archives).

## Open misfits (engine or schema owner)
- Schema keys the frozen schema lacks, carried in text or a code hook for now:
  - `setToken` has no `minEnemyDist`; the 10" clearance uses hook `forward-deploy-clearance`.
  - `damageReduce` has no `min`; Dae'uhl uses hook `damage-reduce-min-one`.
  - Coherency has no axis key; Squadron's Horizontal Coherency is in text only.
  - `TokenDef` has no `terrain` / `removedBy`; Force Field sets them, but types.ts and spec 20 do not define them
    and the validator does not check token extras.
  - `ClaimRule` has no phase/controlled field; the rule lives in `rules.json` `claimTiming`.
  - Condition has no Army Slot test; uses hook `unit-slot-support`.
  - abilityMod/costMod have no `optional` key, so Raiders Roll! is not marked optional.
- Missing trigger events: lose-HIDDEN (Nerazim, Twilight Council use `actionResolved` + hook `lost-hidden-status`),
  arrival (Photon Overcharge uses `nominatedToDeploy` + `arrival-off-entry-edge`), PLACE resolved
  (`resolved-place-effect`).
- Engine contracts to implement: `altEntry.kind` values `indicator`, `nonEntryEdge`, `deployNow`; field
  `usableInReserves` (Raiders Roll!); `damageSuffered` resolves before allocation and `damageReduce.n` takes a
  ValueExpr (Life Support); `cost {CP, n:0}` means no exhaust (Advanced Training); preset upgrade `model` is a
  0-based index; `who` defaults when `subject` is set need one convention across factions.
- Hooks the engine must implement (20): terran coordinated-strike; zerg omega-network-recall,
  transfusion-allows-structure; protoss redirect-attack, not-carrying-claimed-marker; cards deny-deploy-edge,
  claim-first-player-marker, forward-deploy-clearance, forward-deploy-once-per-round, creep-tumor-spawn,
  creep-tumor-removal, zerg-creep-army-building, dormant-summoned-structure, bound-by-the-khala, mass-recall,
  damage-reduce-min-one and the condition hooks unit-slot-support, lost-hidden-status, resolved-place-effect,
  arrival-off-entry-edge.
- Token sizes null: Creep Tumor, Ravager Burrow, Corrosive Bile, Shade, Adept Shade, Force Field.
- Coverage gaps: CT prices units and cards with no card in our sheets (listed under Refuted above).
- Re-check debt: the Zerg entry reused dry-run encodings without re-rendering card images; the Terran and Cards fix
  passes trusted the verifier's renders.

## BattleScribe disagreements (cross-check only; the official sheets win)
Unit mineral costs compared against CT 10.2026. The community files carry pre-10.2026 prices:

| Unit | BattleScribe | CT 10.2026 (ours) |
|---|---|---|
| Marine | 160 / 210 | 170 / 220 (CL) |
| Marauder | 150 / 280 | 160 / 290 (CL) |
| Goliath | 190 | 180 |
| Jim Raynor | 250 | 280 |
| Medic | 110 | 120 |
| Zergling | 180 / 220 | 150 / 210 (CL) |
| Raptor | 240 / 300 | 210 / 260 (CL) |
| Swarmling | 260 | 210 |
| Kerrigan Swarm Raptor | 250 | 230 |
| Vile | 200 | 190 |
| Corpser | 240 | 220 |
| Queen | 150 | 140 |
| Zealot | 160 | 170 |
| Praetor Guard | 280 | 260 |
| Adept | 150 | 160 |
| Stalker | 2 models 170 / 3 models 270 | 1 model 160 / 2 models 270 (CT p.7, CL) |
| Artanis | 250 | 270 (CL) |

Hydralisk, Roach and Kerrigan agree. The Cards batch also found pre-CL gas prices, missing Air 1 slots, CP labels on
cards that print other resources, and no wave-2 cards in the community files. No data was changed for any of these.
