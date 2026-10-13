# 15 Supply system and army building

Rule IDs in brackets are proposed checklist IDs (SUP-*, ARMY-*). Sources: R = core rules
(StarCraft-TMG_EN), CL = Changelog 10.2026, CT = Cost Table 10.2026, F = FAQ v1.1, QS = Quick Start,
CS = faction card sheets. CL/CT override R; F clarifies; QS is a summary and loses every conflict.
Markers: "(CL)" / "(F)" = value or ruling changed or clarified by that document.

## 1. Supply values on a Unit (R p.44 6.1; R p.39 5.1 item 8; R p.89 SUPPLY VALUE, CURRENT SUPPLY VALUE)
1. Every Unit card carries a Supply Profile: a table of model-count brackets, each mapped to an integer
   Supply value (0 or more). [SUP-001]
2. Starting Supply = the bracket value for the model count of the Composition Option bought (section 8).
   It fixes how many Army Slots the Unit uses (section 9). [SUP-002]
3. Current Supply Value (CSV) = the bracket value for the models alive right now. Recompute the moment a
   casualty drops the count into a lower bracket, mid-attack included. Every Supply rule reads CSV. [SUP-003]
4. Worked bracket (R p.44): Marines at 9 models = 2, at 6 = 1, at 3 = 0. Roach card: 2-3 models = 1,
   1 model = 0 (CS Zerg p.3). Bracket tables are card data. GAP: the text extraction loses the bracket
   layout on most cards (we searched every "MODELS / SUPPLY" block in CS). M1 data entry must read each
   card's brackets and cross-check them against the BattleScribe files.
5. CSV can only go down through casualties. RESPAWN may return models only if the Unit stays in its
   current bracket. It can never raise CSV (R p.89 RESPAWN). HEAL never restores models (R p.86). [SUP-004]
6. Per-purpose overrides. Each one changes a single use of Supply and nothing else:
   - BURROWED: CSV counts as 0 in Disengage checks, on both sides of the comparison (section 5). Burrowed
     Units cannot contest at all (R p.82 BURROWED). [SUP-005]
   - STRUCTURE passive: CSV counts as 0 everywhere. The Unit never contests or controls, even when no
     enemy is present (CS Zerg p.3 STRUCTURE). [SUP-006]
   - Advanced Medic Facilities (Medic upgrade): the Unit counts as 0 against the Supply Pool only. It still
     uses its real CSV for control, Tactical Mass and VP (CS Terran p.4). [SUP-007]

Engine notes: give `Unit` two fields, `supplyProfile: {min,max,supply}[]` and `startingSupply`. Derive CSV
from the live model count; never store it. Expose one query, `supplyFor(unit, purpose)`, where purpose is
`pool | control | disengage | vp`. Every override in item 6 becomes a predicate on that query. No call
site should read a raw number.

## 2. Supply Pool and escalation (R p.42 5.5; R p.44 6.2; R p.55 8.3.1; R p.77 9.2.1; CS mission cards)
1. The Mission Card gives Starting Supply S, Supply Escalation E and Game Length L. [SUP-010]
2. Pool for round r: `S + (r-1)*E` for r < L. In round L (the final round) the Pool is unlimited. [SUP-011]
3. Apply escalation at the start of each round after round 1, during the start of the Movement Phase,
   after "Start of the Round" effects resolve. Then check Available Supply for both players
   (R p.56 8.4; QS p.6). [SUP-012]
4. Hard cap: a player's total on-table Supply (`supplyFor(u,'pool')` summed) may never exceed the Pool.
   The Pool never shrinks, so only an arrival can break the cap. Every arrival path is gated (section 3).
   [SUP-013]
5. Mission values from the CS mission cards (each card prints the same Escalation twice, once per player;
   the values are identical):

| Mission | Scale | S | E | L | Pool by round |
|---|---|---|---|---|---|
| Supply Drop | Standard | 6 | +2 | 5 | 6, 8, 10, 12, unlimited |
| Hold Position | Standard | 6 | +2 | 5 | 6, 8, 10, 12, unlimited |
| Frontlines | Standard | 6 | +2 | 5 | 6, 8, 10, 12, unlimited |
| Gather the Resources | Standard | 6 | +2 | 5 | 6, 8, 10, 12, unlimited |
| Divide and Conquer | Standard | 8 | +2 | 4 | 8, 10, 12, unlimited |
| Artefact Hunt (W2) | Standard | 6 | +2 | 5 | 6, 8, 10, 12, unlimited |
| Supply Drop | Skirmish | 4 | +1 | 4 | 4, 5, 6, unlimited |
| Hold Position | Skirmish | 3 | +1 | 5 | 3, 4, 5, 6, unlimited |
| Frontlines | Skirmish | 3 | +1 | 5 | 3, 4, 5, 6, unlimited |
| Gather the Resources | Skirmish | 3 | +1 | 5 | 3, 4, 5, 6, unlimited |
| Divide and Conquer | Skirmish | 4 | +1 | 4 | 4, 5, 6, unlimited |
| Artefact Hunt (W2) | Skirmish | 3 | +1 | 5 | 3, 4, 5, 6, unlimited |

Engine notes: `poolFor(round) = round >= mission.length ? Infinity : S + (round-1)*E`. Keep it a pure
function of mission data and round. Do not keep a mutable counter.

## 3. Available Supply and every arrival (R p.44 6.2; R p.55 8.3.2-8.3.3; R p.58 8.5.5; R p.84 AVAILABLE SUPPLY)
1. `Available = Pool - sum(supplyFor(u,'pool') for friendly Units on the battlefield)`. Units in Reserves
   add nothing (R p.89 RESERVES). [SUP-020]
2. A Unit may arrive only if its CSV <= Available, checked when the arrival is declared. A CSV-0 Unit
   always fits. [SUP-021]
3. Casualties, Destroyed Units and Units returned to Reserves free Supply at once. The freed Supply can
   be used by the very next arrival in the same Phase. [SUP-022]
4. Gated arrivals. Every one of these uses the same check:
   - Deploy action from the Entry Edge in the Movement Phase (R p.58 8.5.5).
   - Deploys from a Faction Indicator at End of the Round: Ready for Dust-off, Ventral Sacs, Warp Conduit.
     These are Deploy actions (CS; F p.3).
   - Deploys through a friendly Entry Edge created by a Pylon or the Omega Worm (F p.3). Omega Network
     adds its own cap: Units deployed through the Worm in one round may total at most 2 Supply
     (CS Zerg p.3).
   - SUMMON: the Unit cannot be summoned if its CSV would push the total over the Pool
     (R p.90 SUMMON). [SUP-023]
   - MORPH (Unit) X: needs enough Available Supply (R p.87). See RULING R15-3 for when it is checked.
5. Final round: the Pool is unlimited, so the gate always passes. Units still deploy one per activation
   under normal alternation (R p.55 8.3.1). [SUP-024]
6. Deploy also has non-Supply limits: it cannot end inside the enemy Zone of Influence (6" in from their
   Entry Edge), and it must end In Coherency. The movement spec owns the movement itself. [SUP-025]
7. Pre-deploy abilities: a Unit in Reserves cannot use abilities or measure distances. There are two
   exceptions. The first is an ability that says it works in Reserves (for example Raiders Roll!). The
   second is an ability that itself deploys the Unit (for example Burrow Ambush, Phase Prism, Rapid
   Reinforcements). "Nominated to deploy" means the Unit is performing a Deploy action
   (F p.3). [SUP-026]

Engine notes: one function, `canArrive(player, unit) -> bool`, used by Deploy, SUMMON, MORPH and every
alternate entry. Recompute Available from board state on each call. Do not cache it.

## 4. Reserves and returning to Reserves (R p.55 8.3; R p.59; R p.88-89 RESERVES)
1. No Unit starts on the table. Every Unit on the army list (summoned Units excluded) starts in
   Reserves. [SUP-030]
2. A Unit in Reserves cannot be targeted, contests nothing and adds 0 to on-table Supply. Its Active,
   Passive and Reaction abilities exist but do nothing, unless the ability says it works in Reserves. It
   keeps its upgrades and weapon choices. [SUP-031]
3. Returned to Reserves (Strap In!, Strategic Recall, Personal Transport and similar effects): the Unit
   is not Destroyed. It does not count as Supply destroyed (no VP; RULING R15-1). [SUP-032]
   - Its CSV leaves the on-table total at once.
   - Its Damage Marker stays with it.
   - Its timed effects keep counting down and still expire at Cleanup.
   - Its Tokens and Markers on the table are removed, except those with STAY IN PLAY.
   - It loses SIEGE MODE (R p.89).
   - If it had already activated this Phase, it stays activated for the rest of the Phase.
4. When it deploys again it pays its current CSV. Personal Transport returns the Unit and then
   immediately performs a Deploy, so the freed Supply covers that Deploy (CS Protoss W2). [SUP-033]
5. Summoned Units (Roachling, Point Defence Drone, Pylon, Omega Worm and similar) cost nothing, use no
   slots and never sit in Reserves. They enter only through the ability that creates them. Once on the
   table, their CSV counts toward on-table Supply (R p.76 9.1.9). [SUP-034]

## 5. Tactical Mass and the Disengage penalty (R p.44 6.2; R p.58 8.5.4; R p.90 TACTICAL MASS; QS p.5)
1. A Unit that Disengages in the Movement Phase may not Ranged Attack or Charge in the Assault Phase of
   the same round. [SUP-040]
2. Exception: no penalty if, when the Disengage is declared, the Unit's
   `supplyFor('disengage')` is strictly greater than the sum of `supplyFor('disengage')` over every enemy
   Unit it is Engaged with. Equal values mean the penalty applies. If both sides are 0, the penalty
   applies. [SUP-041]
3. BURROWED Units count 0 on both sides of the comparison. A Unit that declares Disengage while
   BURROWED therefore never has Tactical Mass (RULING R15-2). [SUP-042]
4. Read the comparison when the Disengage is declared. Models lost during the Disengage itself do not
   change the result. [SUP-043]

Engine notes: when the Disengage is declared, store `noShootNoCharge: phaseAssault, round` on the Unit
(or store nothing). Assault Phase action legality reads that flag. Clear it at Cleanup.

## 6. Mission Marker control by Supply (R p.44 6.2; R p.69-71 8.9.1; R p.87 MISSION MARKERS; F p.2)
The full marker rules belong to the scoring spec. The Supply side is below.
1. Eligible contester: on the battlefield, In Coherency at its last coherency check (F: casualties after
   that check do not break it), and at least one model Within 3" of the marker, with LoS to it (treat
   the marker as Size 0) and on the same elevation. [SUP-050]
2. Never eligible: Flying Units, BURROWED Units, Out-of-Coherency Units, Units in Reserves, STRUCTURE
   Units. [SUP-051]
3. Each player adds up `supplyFor('control')` of their eligible Units at the marker. The higher total
   takes control. A tie changes nothing. A player whose only contesters are CSV 0 takes control if the
   opponent has no eligible contester there. If both sides are at 0, it is a tie. [SUP-052]
4. Control is sticky. It lasts until the opponent ends a Scoring Phase with a higher total, and a marker
   that has been controlled never returns to neutral. QS p.8 says "neither controls" on a tie. That
   conflicts with R, and R wins. [SUP-053]

## 7. Supply-based Victory Points and the end of the game (R p.44 6.2; R p.72 8.9.3, 8.10; R p.89 RESERVES; F p.5; QS p.5)
1. Missions whose card reads "Score VPs equal to Enemy Supply destroyed this Round" (all CS missions)
   award, in Scoring step 2, the total drop in enemy CSV during that round. [SUP-060]
2. Every drop counts, whatever the cause (F p.5): casualties, failed-Disengage removals, MORPH removals,
   and friendly fire or Spillover from the owner's own weapons (RULING R15-4). A Marine Unit that goes
   9 -> 6 -> 3 -> 0 models gives 1 + 1 + 0 = 2 VP, which equals its starting Supply. [SUP-061]
3. A Unit returned to Reserves gives no VP (its CSV is set aside, not reduced). Advanced Medic Facilities
   does not change the VP a Medic Unit is worth. [SUP-062]
4. Summoned Units' Supply losses give no VP (R p.76: summoned Units are left out of the Final Score;
   RULING R15-5). [SUP-063]
5. Final round: at the start of its Scoring Phase, before Marker Control, every Unit still in Reserves
   counts as Destroyed. The opponent scores each such Unit's CSV under the mission's destroyed-enemy
   condition in step 2 of that Phase. This step applies only when the game reaches its round limit
   (R p.72 8.10). It does not apply after a Special Winning Condition (RULING R15-6). [SUP-064]
6. Scoring step 3 ends the game immediately when a player has no models on the battlefield and no Units
   in Reserves. The other player gains +10 VP. Summoned Units and STRUCTURE Units count as models
   for this check. [SUP-065]

Engine notes: for each player, keep `supplyLostThisRound` and add `oldCSV - newCSV` on every bracket
drop. Use one hook, `onModelsRemoved(unit)`, for every removal path. Reset it in Cleanup. A summoned
Unit's loss is not added to the counter. The final-round reserve sweep goes through the same counter.

## 8. Engagement scales and resources (R p.73-74 9.1.1-9.1.4; R p.75)
| Scale | Mineral limit | Vespene limit | Table |
|---|---|---|---|
| Skirmish | up to 1000 | 10% of minerals = 100 | 36" x 36" |
| Standard | up to 2000 | 10% = 200 | 36" x 54" |
| Grand Offensive | 2001+ (agreed) | 10% of the agreed limit | 36" x 72" |
1. Minerals pay for Units and Upgrades. Vespene Gas pays only for Tactical Cards (and Creep Cards).
   Neither converts into the other. Unspent resources are lost. [ARMY-001]
2. Our first slice is Skirmish 1000/100 on 36x36 (HANDOFF). Team games (R p.76 9.1.8) are out of scope
   while multiplayer is on hold.

## 9. Army list construction (R p.73-77 9.1.2-9.1.7; R p.84 ARMY SLOT, FACTION TAGS; R p.39-41 5.2-5.4)
Do these steps in order:
1. Faction Card: pick a race, then exactly one Faction Card. It grants the starting Army Slots and the
   faction resource (section 1 of spec 16). [ARMY-010]
2. Tag eligibility: a Unit or Tactical Card is legal only if every Faction Tag on it also appears on the
   Faction Card. Having fewer tags is fine. One foreign tag makes it illegal. Example: Zerg Swarm (tag
   Zerg) cannot take Kerrigan Swarm Raptor (tags Zerg + Kerrigan's Swarm). [ARMY-011]
3. Tactical Cards: buy them with Vespene Gas. Each one adds its printed slots. A UNIQUE card is limited
   to 1 copy. A non-UNIQUE card may be bought more than once (RULING R15-7). Every Tactical Card and the
   Faction Card are placed face up and public. [ARMY-012]
4. Creep Cards: the Zerg Creep passive (on Zerg Swarm and on Kerrigan's Swarm) requires exactly one Creep
   Card, paid in gas: Accelerating Creep 0, Malignant Creep 10 (tags Zerg + Kerrigan's Swarm), Reactive
   Creep 10 (CT). Creep Cards give no slots and no resource. [ARMY-013]
5. Army Slots: there are five types, Core, Elite, Support, Air and Hero. Total = Faction Card slots plus
   the sum over Tactical Cards. A Unit uses slots of its card's slot type equal to its starting Supply.
   Slots cannot move between types and are not carried over. Unused slots are lost. [ARMY-014]
6. Muster: for each Unit pick exactly one Composition Option (model count and mineral cost) from CT.
   Other model counts are illegal. [ARMY-015]
7. Upgrades (section 11). [ARMY-016]
8. Totals: minerals spent <= the scale limit, and gas spent <= 10% of the limit. [ARMY-017]
9. Units whose card carries the UNIQUE mark (for example Jim Raynor, Kerrigan, Zeratul): at most 1
   copy of each. GAP: R has no rule text on UNIQUE Unit cards. We searched R Parts 2, 5, 9 and 11, F and
   CL. Only the Tactical-Card UNIQUE rule exists (R p.40 5.3; p.81 10.5). We apply it to Units (RULING
   R15-8). Hero-slot Units still use their starting Supply in Hero slots. [ARMY-018]
10. Roster visibility: Open Lists are the default (R p.76 9.1.10). Closed Lists are optional, but cards
    stay public and a Unit's upgrades are revealed on deployment. The bot plays Open Lists. [ARMY-019]

Faction Cards (CS):
| Faction Card | Race | Starting slots |
|---|---|---|
| Raynor's Raiders | Terran | 3 Core, 1 Hero, 1 Support, 1 Air |
| Terran Armed Forces | Terran | 3 Core, 1 Elite, 1 Support, 1 Air |
| Zerg Swarm | Zerg | 3 Core, 1 Elite, 1 Support, 1 Air |
| Kerrigan's Swarm | Zerg | 3 Core, 2 Elite, 1 Hero |
| Khalai | Protoss | 3 Core, 2 Elite, 1 Hero |
| Nerazim | Protoss | 2 Core, 3 Elite, 1 Hero |
| Daelaam | Protoss | 3 Core, 1 Elite, 1 Support, 1 Air |

Engine notes: `validateArmy(list, scale) -> Error[]` is a pure function and runs every step above. The
army builder UI and the bot's list generator both call it. A slot ledger is a map from slot type to
granted and used counts.

## 10. Costs: 10.2026 Cost Table (CT; CL p.2). These supersede R 12.10-12.11 entirely.
Composition is written "models = Supply / minerals". Two-column upgrade costs follow the small/large
composition.

Terran Units:
| Unit | Compositions | Upgrades (small/large) |
|---|---|---|
| Marine (CL) | 6=1/170; 9=2/220 | AGG-12 SPECIALIST FOR C-14 Rifle 10/10; Bayonet FOR Strike 20/30; Combat Shield 20/30; Grenades-Frag 10/10; Rocket Launcher SPECIALIST 40/40; Slugthrower 10/20 |
| Marauder (CL) | 2=1/160; 4=2/290 | Kinetic Foam 20/40; Laser Targeting Systems 20/40; Veteran of Tarsonis 20/40 (CL) |
| Medic (CL) | 3=1/120 | A-13 Flash Grenade Launcher 20; Advanced Medic Facilities 60; Stabilizer Medpacks 20 (CL) |
| Goliath (CL) | 1=2/180 | Ares-Class Targeting System 20; Haywire Missiles FOR Hellfire Missiles 40; Scatter Missiles FOR Hellfire Missiles 30 |
| Jim Raynor (CL) | 1=1/280 | C-14 Rifle FOR Commando Rifle 0 |
| Raynor's Raiders (Marine) | 6=1/230 | - |
| Siege Tank | 1=2/220 | Mode Transformation 20; Coordinated Strike 20; Shaped Blast 10; Smart Shells 10 |
| Nova Stealth Mode | 1=1/240 | - |
| Nova Assault Mode | 1=1/260 | - |
| Spec Ops Marauder (Marauder) | 2=1/230 | - |
| Raven | 1=1/170 | Corvid Reactor 30; Internal Tech Module 20; Seeker Missile 20; Explosive Shrapnel Shells 10 |

Zerg Units:
| Unit | Compositions | Upgrades |
|---|---|---|
| Zergling (CL) | 12=1/150; 18=2/210 | Adrenal Glands 20/20; Burrow Ambush 20/30; Shredding Claws FOR Claws 10/10 |
| Raptor (Zergling) (CL) | 12=1/210; 18=2/260 | as Zergling |
| Swarmling (Zergling) (CL) | 18=1/210 | Burrow Ambush 20 |
| Kerrigan Swarm Raptor (Zergling) (CL) | 6=1/230 | - |
| Vileling (Zergling) | 18=2/180 | - |
| Roach | 3=1/170 | Burrow Ambush 20; Glial Reconstitution 10 (CL); Hydriodic Bile 10; Tunneling Claws 10 |
| Vile (Roach) (CL) | 3=1/190 | as Roach |
| Corpser (Roach) (CL) | 3=1/220 | as Roach |
| Hydralisk | 2=2/140; 4=3/260 | Ancillary Carapace 20/30 (CL); Burrow Ambush 20/40; Grooved Spines 20/30 (CL); Lurking 10/10 (CL) |
| Queen (CL) | 1=1/140 | Creep Speed 10; Domineering Presence 10 |
| Ravager | 1=1/160; 2=2/270 | Bloated Bile Ducts 20/40; Burrow Ambush 20/40; Potent Bile 20/40 |
| Defiler | 1=1/130 | Burrow Ambush 20; Plague 20; Cancerous Bite 20 |
| Bile Launcher | 1=1/150 | - |
| Kerrigan | 1=1/250 | - |
| Zagara | 1=1/250 | - |

Protoss Units:
| Unit | Compositions | Upgrades |
|---|---|---|
| Zealot (CL) | 3=2/170 | Leg Enhancements 20; My Life for Aiur 10; We Stand as One 20; Zealous Round 10 |
| Praetor Guard (Zealot) (CL) | 3=2/260 | - |
| Adept (CL) | 4=1/160 | Glaive Strike FOR Strike 20; Guidance 10; Resonating Glaives 20 |
| Nerazim Watchers (Adept) | 4=1/210 | - |
| Sentry | 2=1/130 | Hallucination 20 (CL); Solid-Field Projectors 10 (CL) |
| Stalker (CL) | 1=1/160; 2=2/270 | Fury of the Nerazim 20/30; Path of Shadows 20/40 |
| Immortal | 1=2/280 | Shield Overcharge 20; Left Phase Disruptor FOR Left Photon Disruptor 20; Right Phase Disruptor FOR Right Photon Disruptor 20; Fury Unyielding 20; For the Ancients 20 |
| High Templar | 2=1/130; 4=2/200 | Psionic Storm 20/30; Farsight 20/20 |
| Twilight Templar (High Templar) | 2=1/230 | - |
| Artanis (CL) | 1=1/270 | - |
| Zeratul | 1=1/230 | - |
| Tassadar | 1=1/230 | - |

Tactical Card gas costs (CT; (CL) = changed):
- Terran: Barracks 30 (CL), Barracks (Proxy) 40, Barracks (Tech Lab) 40 (CL), Supply Depot 40, Factory 35,
  Engineering Bay 25, Armory 30, Academy 40 (CL), Orbital Command 25, Dropship 35 (CL),
  Factory (Tech Lab) 40, Vanadium Plating 25.
- Zerg: Spawning Pool 25, Spawning Pool (Six Pool) 35 (CL), Roach Warren 25, Hydralisk Den 30 (CL),
  Evolution Chamber 25 (CL), Hatchery 30, Lair 35, Overseer 25, Overlord 35, Cocoon 30, Defiler Mound 35.
  Creep Cards: Accelerating 0, Malignant 10, Reactive 10.
- Protoss: Gateway 25, Warp Gate 40, Gate Chronoboosted 35, Observer 25, Nexus 40 (CL),
  Overcharged Nexus 35, Power Field 40, Forge 30, Warp Prism 35, Twilight Council 40 (CL),
  Robotics Facility 35, Void Seeker 40, Templar Archives 40.

Tactical Card slots (CS): Barracks 1 Core; Barracks (Proxy) 2 Core (U); Barracks (Tech Lab) 1 Core + 1 Elite
(U); Supply Depot 1 Core + 1 Elite + 1 Hero (U); Factory 2 Elite; Factory (Tech Lab) 2 Elite (U);
Engineering Bay 1 Core; Armory 1 Elite; Academy 2 Support (U); Orbital Command 1 Core (U); Dropship 1 Core +
1 Support (U); Spawning Pool 1 Core; Spawning Pool (Six Pool) 2 Core (U); Roach Warren 1 Core; Hydralisk
Den 2 Elite; Evolution Chamber 1 Core; Hatchery 1 Support; Lair 1 Core + 1 Elite (U); Overseer 1 Support (U);
Overlord 1 Core + 1 Elite + 1 Hero (U); Cocoon 1 Elite (U); Gateway 1 Core; Warp Gate 2 Core (U); Gate
Chronoboosted 1 Core + 1 Elite (U); Observer 1 Support (U); Nexus 2 Core (U); Overcharged Nexus 1 Core +
1 Elite (U); Power Field 1 Core + 1 Elite + 1 Hero (U); Forge 1 Elite; Warp Prism 2 Core (U); Twilight
Council 1 Support + 1 Elite (U); Robotics Facility 2 Elite; Void Seeker 1 Core (U). (U) = UNIQUE.
GAP: the slots and UNIQUE flags for Vanadium Plating, Defiler Mound and Templar Archives did not survive
text extraction (we searched every CS file by card name). Enter them from card images in M1.

Golden test, the R p.75 example re-costed under CL/CT. Raynor's Raiders, Standard:
- Gas: Barracks 30 + Barracks (Proxy) 40 + Factory 35 + Orbital Command 25 + Academy 40 +
  Engineering Bay 25 = 195. R printed 185 with old costs. 5 gas is left over and lost.
- Units: Marine 9 (220) x2 + Marine 6 (170) + Marauder 4 (290) + Marauder 2 (160) + Raynor (280) +
  Medic (120) x2 + Goliath (180) = 1760 minerals. R printed 1670.
- Slots used: Core 8/8 (3+1+2+1+1), Elite 2/2, Support 2/3, Hero 1/1, Air 0/1. Valid.

## 11. Upgrades, SPECIALIST and FOR (R p.75 9.1.7; R p.89 SPECIALIST; F p.5)
1. A Unit may buy any number of different upgrade entries from its card, but each entry at most once.
   Pay the CT cost for the chosen composition. [ARMY-020]
2. Default upgrade: every model in the Unit gains it. [ARMY-021]
3. "FOR [Weapon]": a replacement. Every model that carries that weapon loses it and gains the new
   one. [ARMY-022]
4. SPECIALIST: only one model gets it, and the player names that model at list building. The same
   SPECIALIST entry cannot be bought twice. Different SPECIALIST entries must go on different models.
   SPECIALIST + FOR: only the named model swaps its weapon. Example: 6 Marines with Rocket Launcher and
   AGG-12 = one Marine with C-14 + Rocket Launcher, one with AGG-12 only, four with C-14. [ARMY-023]
5. A model carrying a different weapon resolves that weapon as its own Batch (see the attack spec). [ARMY-024]
6. When a SPECIALIST model dies, its weapon is gone. It cannot pass to another model, and the player
   may not remove a different model to keep it (F p.5). Casualty choice must allow the specialist to be
   removed like any other model. [ARMY-025]

Engine notes: store loadout per model, `model.weapons[]`, built once from the list at game start. Every
attack groups models into Batches by weapon profile. SPECIALIST needs no other code path.

## RULINGS (Unsourced unless noted)
- R15-1: Returning a Unit to Reserves is not a Supply loss and gives no VP. R treats it as "not
  Destroyed", and F's VP rule talks about CSV being reduced, which does not happen here.
- R15-2: BURROWED counts as 0 Supply in every Disengage check, on both sides. The keyword text says
  "for Disengage checks" without limiting it to one side, so we take it literally.
- R15-3: MORPH checks Available Supply before the X models are removed, as a precondition. We read
  "must have sufficient Available Supply" as a precondition of performing the ability.
- R15-4: Any drop in an enemy Unit's CSV scores, including drops caused by its owner's own weapons.
  F p.5 says "anytime a Unit's Current Supply Value is reduced". Status: Confirmed (F).
- R15-5: A summoned Unit's Supply losses give no VP. R 9.1.9 is specific to summoned Units and wins over
  the general F rule.
- R15-6: The reserve sweep runs only when the game ends at the round limit. R 8.10 is scoped "if the game
  ends by the Round Limit".
- R15-7: Tactical Cards without the UNIQUE mark may be bought more than once. The UNIQUE rule implies it,
  and R 10.2 mentions "copies of that card".
- R15-8: UNIQUE Unit cards are limited to one copy. We extend the Tactical Card rule to Units.
- R15-9: The CL line "Adept 250 -> 270" under the Artanis heading is a typo for Artanis. CT confirms
  Artanis 270 and Adept 160. Status: Corrected (CT).
