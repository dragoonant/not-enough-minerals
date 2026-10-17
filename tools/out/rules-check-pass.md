# Rules-check pass (2026-10-16)

Scope: every RULING line in `docs/needs-rules-check.md` that was not already Confirmed was checked
against the free official sources in `docs/sources/text/` (CL and CT first, then R, F, QS, card sheets).
The 14 lines already marked Confirmed were also re-checked as the spot check.

## Counts (142 rulings)

| Status | Count | Notes |
|---|---|---|
| Confirmed | 83 | 14 already Confirmed (all still hold) plus 69 newly confirmed with a cite |
| Corrected-needed | 9 | table below |
| Unsourced | 50 | no governing text; the literal reading is kept. 5 carry a "tension" note |
| Fan-source | 0 | |

The four old "Corrected" lines (CL Artanis, Kerrigan's Swarm slots, Round 2 initiative 2D6, Roach IMPACT)
now read Confirmed: CT p.7, CS1-Z p.14, R p.33 3.2 and CS1-Z p.5 all agree with what we did.
The non-standard words ("settled", "DATA MISFIT") were replaced by a status word. The DATA MISFIT note is kept.

### Spot check of the existing Confirmed rulings
All 14 hold (CSV drop VP F p.5; Shield first model F p.2; one re-roll QS p.3; Evade "-" R p.40 5.1 and
R p.33 3.4; setup order R p.80 9.3; Raynor TERRAN-only CS1-T p.4; Pylon tag; Psionic Transfer with a CLAIM
F p.4; faction tags CS1-P p.9 and CS1-Z p.14; Dae'uhl floor CS1-P p.9; Protoss Starter adds up to 980
using CT p.7 (Zealot 170+20+10+20, Adept 160+20+20, Sentry 130+10+20, two Stalkers 160+20+20 each);
CLAIM in the Scoring Phase CS2-P p.5; Morph VP F p.5; BURROWED Close Combat R p.85). One cite slip: the
Evade "-" line cites R p.33 3.4, but the Null Evade rule is on R p.40 5.1.

## Corrected-needed

| Rule | Cite | What the code does now | What it should do | Likely file |
|---|---|---|---|---|
| Summoned Units' Supply losses | F p.5; R p.78 9.1.9 | Supply drops of summoned units score no VP | Score them like any other drop. F p.5 says VP are scored any time Supply drops, and 9.1.9 treats summoned units as Friendly Units for all purposes, only leaving them out of the 8.10 Final Score tally. *This one is a judgment call; the owner may keep the old reading* | `src/engine/supply.ts` (around l.63-66), `scoring.ts` |
| Orders: CRITICAL HIT option | R p.81 10.2; CS1-T p.4 | Grant expires at endOfActivation | Raynor's Orders is used in the Movement Phase on another unit, so the grant must last until End of Round (the 10.2 default) and be used up by the first weapon | `data/sc-2026-10/units/terran/jim-raynor.json` (crit option duration); `src/engine/effects.ts` |
| First-weapon grants | R p.81 10.2; CS1-Z p.14 | endOfActivation | Last until End of Round, used up on first use. Wild Mutation can be used in any Phase, so a grant made in Movement must still be there in Assault | `data/.../cards/kerrigans-swarm.json` (wild-mutation), `src/engine/effects.ts` |
| Coherency link past enemies | R p.37 4.4; F p.2 | A link may pass any enemy within 1" of either linked model | A link may pass only through models of enemy units this unit is actually Engaged with (or its declared Charge targets). An enemy across a Size 2+ wall or on another elevation is within 1" but not Engaged, so it must block the link | `src/engine/squads.ts` `linkValid` (l.209-222) |
| Split melee Batch keywords | F p.5; R p.70 8.8.1 step 4 | PRECISION and CRITICAL HIT always go to the pool of the unit that gets the Surge Die | Only the Surge Die is locked to its declared target. The attacker chooses whether PRECISION and CRITICAL HIT go all to one pool or are split | `src/engine/melee.ts` `launch` (l.198-203) |
| IMPACT split | R p.88 IMPACT | The ruling says "even, no decision". The code now offers "even" or "all on one target" | The controlling player may split each model's dice. Update the ruling text; optionally offer a per-model split (the `split` map already exists) | `src/engine/charge.ts` `impactStep` (l.340) |
| Advanced Training | CS1-T p.8; R p.82 10.4 | Applied automatically, using up the player's Reaction for that Activation | It is a Reaction: the player chooses whether to use it, and it takes the one Reaction per Activation, so applying it automatically can block Life Support or Infantry Armor. Offer it as an optional choice | `src/engine/abilities.ts` `costOf` (l.240-262) |
| RESPAWN placement | R p.91 RESPAWN; CS1-Z p.12 | The formation placer sets returned models around the Leading Model. The ruling says no placement rule is printed | The rule is printed: each returned model goes in base contact with an existing model of the unit and not within Engagement Range of an enemy. A model with no legal spot does not return. The Supply-bracket cap is already right | `src/engine/abilities.ts` `respawnStep` (l.782) |
| MORPH | R p.90 MORPH; CS2-Z p.2 | Each of X models becomes its own one-model unit, placed where the old model stood | MORPH (Name) X: place ONE new model in base contact with a model of the unit (not within 1" of an enemy), then remove X models. Supply check first (already done). The new unit cannot activate this Round (already done) | `src/engine/abilities.ts` `morphStep` (l.817) |

## Unsourced lines with a tension note (not corrections, but worth a look)
- HIDDEN/BURROWED Evade in Close Combat: R p.70 8.8.1 step 3 allows Evade in melee only when an ability explicitly grants it against Close Combat.
- BURROWED Supply 0 for Disengage, on the disengager's side: a Disengage removes BURROWED at once (R p.85).
- Detection removes HIDDEN once: F p.5 re-checks "while within" effects at the start and end of every action.
- Queued loseHidden Reaction: R p.82 10.4 says a Reaction must be declared at the trigger, and a missed window cannot be used later.
- Initiative timing (now Confirmed by F p.2 and R p.16): R p.74 8.9.6 still lists the tie Roll-Off as Phase 4 step 6.

## Open source gaps (PLAN.md)

| Gap | Where the sources define it |
|---|---|
| Detection | The core rules have no Detection keyword. It exists only on cards: the Detection passive (CS1-Z p.3, enemies within 6" of the unit lose HIDDEN), Scanner Sweep (CS1-T p.9), Surveillance (CS1-P p.10) and Oversight Mode (CS1-Z p.13), each a Faction Indicator with a 6" area. F p.5 says these target a location, so HIDDEN's 4" limit does not apply, and "while within" is checked at the start and end of every action. HIDDEN itself is defined at R p.88 and R p.93 Visible |
| Transports | There is no embark/carry rule. Forward-deploy cards cover it: Ventral Sacs (CS1-Z p.14), Ready for Dust-off (CS1-T p.9) and Warp Conduit (CS1-P p.8) each set a Faction Indicator more than 10" from enemies, and a unit deploys in base contact with it at End of Round. Personal Transport (CS2-P p.4) returns a unit to Reserves, then it Deploys. Also: R p.57 8.3.3 (any arrival, transports included, respects the Zone of Influence) and F p.3 (transports create no Entry Edge; placing from a marker) |
| Game length | On each Mission Card ("GAME LENGTH: 5"; the Supply Drop Skirmish card says 4). Also R p.79 9.2.1 ("usually 5 rounds"), R p.74 8.9.3 and 8.10 (end at the round limit), R p.57 8.3.1 (unlimited Supply in the final Round), QS p.6 and p.9 |
| Morale | Absent. No morale, battle-shock or rout rule appears in R, QS, F, CL, CT, OP or any card sheet. Do not invent one |
