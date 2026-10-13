# 19 Errata, changelog and FAQ map

Every change in the Changelog 10.2026 (CL, dated 09.10.2026, 2 pp) and every ruling in the FAQ v1.1 (F, dated
25.09.2026, 5 pp), each mapped to the Core Rules (R) section it changes or clarifies and to the spec that must carry
it. Page numbers are PDF pages (`=== PAGE n ===` markers); R's printed folio = PDF page - 2.

Precedence (owner + SC-SOURCES): CL and CT (Cost Table 10.2026) override R; F clarifies R; QS only summarises; card
text beats core rules where they conflict (R p.31 2.6.2). Organised Play (OP) rules apply only to tournaments.

## 0. Spec-home keys
s1-s3 write the other rules specs in parallel; their file names are not fixed when this file was written, so each row
names a topic key. Each owning spec must carry every row with its key, marked "(CL)" or "(F)" inline.

| Key | Topic | Expected home |
|---|---|---|
| TURN | rounds, phases, activation, passing, reactions, ability timing and limits, card resources | turn/activation spec (s1-s3) |
| MOVE | measuring, coherency, Leading Model, movement, gaps, elevation, terrain, LoS, cover | movement/terrain/LoS spec (s1-s3) |
| ATK | ranged and close combat pipeline, batches, casualties, templates | attack/damage spec (s1-s3) |
| SUP | supply, reserves, deployment, Entry Edges, ZoI, mission markers, scoring, missions, draft | supply/scoring/mission spec (s1-s3) |
| ARMY | army building, mineral and gas costs, upgrades, example armies | army-building spec + data schema; values live in data files with `source: "CT p.N"` |
| KW | keywords and statuses | `18-keywords.md` (done) |
| CARD | a specific unit/tactical card ability | M1 card data (`source` field) + `18-keywords.md` section 10 |

## 1. Changelog 10.2026: every change (CL p.2; values confirmed in CT)
CL contains cost changes only. No rule text, keyword, stat line or ability changes. Every row modifies R Part 12.10
"Units and Upgrade Points" (R p.96-109) or 12.11 "Tactical Card Points" (R p.109), and the data, so every row's home is
ARMY. The old value matches R's printed table (spot-checked: Goliath 190, Raynor 250, Artanis 250, Barracks 25 gas).
Two-value entries are the two Composition Options (smaller/larger squad).

| ID | Item | Old (R) | New (CL/CT) | CT p. |
|---|---|---|---|---|
| CL-01 | Marine minerals | 160/210 | 170/220 | 2 |
| CL-02 | Marauder minerals | 150/280 | 160/290 | 2 |
| CL-03 | Marauder upgrade Veteran of Tarsonis | 20/30 | 20/40 | 2 |
| CL-04 | Medic minerals | 110 | 120 | 2 |
| CL-05 | Medic upgrade Stabilizer Medpacks | 30 | 20 | 2 |
| CL-06 | Goliath minerals | 190 | 180 | 2 |
| CL-07 | Jim Raynor minerals | 250 | 280 | 2 |
| CL-08 | Barracks gas | 25 | 30 | 3 |
| CL-09 | Barracks (Tech Lab) gas | 45 | 40 | 3 |
| CL-10 | Academy gas | 35 | 40 | 3 |
| CL-11 | Dropship gas | 40 | 35 | 3 |
| CL-12 | Zergling minerals | 180/220 | 150/210 | 4 |
| CL-13 | Raptor (Zergling) minerals | 240/300 | 210/260 | 4 |
| CL-14 | Kerrigan Swarm Raptor (Zergling) minerals | 250 | 230 | 4 |
| CL-15 | Swarmling (Zergling) minerals | 260 | 210 | 4 |
| CL-16 | Roach upgrade Glial Reconstitution | 20 | 10 | 4 |
| CL-17 | Vile (Roach) minerals | 200 | 190 | 4 |
| CL-18 | Vile upgrade Glial Reconstitution | 20 | 10 | 4 |
| CL-19 | Corpser (Roach) minerals | 240 | 220 | 4 |
| CL-20 | Corpser upgrade Glial Reconstitution | 20 | 10 | 4 |
| CL-21 | Hydralisk upgrade Ancillary Carapace | 20/40 | 20/30 | 5 |
| CL-22 | Hydralisk upgrade Lurking | 10/20 | 10/10 | 5 |
| CL-23 | Hydralisk upgrade Grooved Spines | 20/40 | 20/30 | 5 |
| CL-24 | Queen minerals | 150 | 140 | 5 |
| CL-25 | Spawning Pool (Six Pool) gas | 40 | 35 | 6 |
| CL-26 | Hydralisk Den gas | 35 | 30 | 6 |
| CL-27 | Evolution Chamber gas | 30 | 25 | 6 |
| CL-28 | Zealot minerals | 160 | 170 | 7 |
| CL-29 | Praetor Guard (Zealot) minerals | 280 | 260 | 7 |
| CL-30 | Adept minerals | 150 | 160 | 7 |
| CL-31 | Sentry upgrade Solid-Field Projectors | 20 | 10 | 7 |
| CL-32 | Sentry upgrade Hallucination | 30 | 20 | 7 |
| CL-33 | Stalker minerals | 170/270 | 160/270 | 7 |
| CL-34 | Artanis minerals (CL prints the unit name as "Adept"; see D-01) | 250 | 270 | 7 |
| CL-35 | Nexus gas | 35 | 40 | 8 |
| CL-36 | Twilight Council gas | 45 | 40 | 8 |

Knock-on effects (home ARMY):
- CL-K1: R 12.12 Example Armies (R p.110-115, Terran/Zerg/Protoss "Starter" and "Founders Edition Starter") are
  priced with the old costs; totals no longer hold. Recompute from CT before using them as bot presets.
- CL-K2: R 9.1 army-building example (R p.77: 185 gas of Tactical Cards for Raynor's Raiders) is 195 gas under CL
  (Barracks 30, Academy 40). Still under the 200-gas Standard cap.
- CL-K3: CT 10.2026 also lists units and cards outside our slice (e.g. Nova, Tassadar, Templar Archives, Vanadium
  Plating, Overcharged Nexus 35, Warp Prism 35, Power Field 40). Use CT, never R 12.10/12.11, for every price.

## 2. FAQ v1.1: every ruling
Kind: **Clarify** (R already implies it), **Extend** (adds a rule R does not state), **Override** (changes or narrows
R's literal wording). F says changes since the previous FAQ are highlighted in magenta; the text extraction loses
colour, so which rows are new in v1.1 is a GAP.

### 2.1 Units and characteristics (F p.2)
| ID | Ruling (our words) | R section | Kind | Home |
|---|---|---|---|---|
| F-01 | Shield is added to the first model's HP (Zealot 4 + 3 = 7); lost HP from that pool heals normally. | R p.91 SHIELDED; R p.40 5.1 | Clarify | ATK, KW |
| F-02 | SHIELDED ends when Total Damage exceeds the Shield (Shield 3: at 4+), checked after damage is assigned, so pre-assignment reductions can save it; or when the first model is removed. Healing never restores it. | R p.91 SHIELDED | Clarify | ATK, KW |
| F-03 | NON-LETHAL DAMAGE counts toward Total Damage and strips SHIELDED like normal damage. | R p.90 NLD; p.91 | Clarify | KW |
| F-04 | A Destroyed Unit never returns unless a mission or rule says so. | R p.56 7.4 | Clarify | SUP |

### 2.2 Measuring and movement (F p.2)
| ID | Ruling | R section | Kind | Home |
|---|---|---|---|---|
| F-05 | Coherency for contesting markers is the result of the Unit's last movement check; later casualties never break it. | R p.37 4.4; p.71 8.9.1 | Clarify | MOVE, SUP |
| F-06 | Gap Clearance applies to gaps between models as well as terrain. | R p.39 4.6 | Clarify | MOVE |
| F-07 | In a Charge or Close Ranks, models may be set on the far side of an Engaged enemy if there is room; Coherency Links may cross Enemy models the Unit is Engaged with. | R p.37 4.4; p.68 8.7.7; p.69 8.8.1 | Clarify | MOVE, ATK |
| F-08 | A Coherency Link may cross anything the Leading Model may legally cross (Raptors: Impassable terrain). | R p.37 4.4 | Extend | MOVE |
| F-09 | Models may be set onto High Ground through an Access Point by Coherency alone; only the Leading Model travels a path. | R p.37 4.4; p.59 8.5.3 | Clarify | MOVE |
| F-10 | A Move or Run must change position; 0" is a Hold. | R p.58 8.5.2; p.62 8.7.1 | Extend | MOVE, TURN |
| F-11 | "Directly towards/away" moves must use the full possible distance. | R p.39 4.5 | Clarify | MOVE |
| F-12 | A model that cannot fit on High Ground uses Wobbly Model Syndrome: base centre on the terrain, minimum overhang. | R p.30 2.3; p.59 8.5.3 | Extend | MOVE |
| F-13 | A High Ground edge counts as Impassable for Gap Clearance: 1" gaps for Size <= 2, 3" for Size 3+ (a Siege Tank climbs a ramp only if its edges are 3"+ apart, and may overhang at the top). | R p.39 4.6 | Extend | MOVE |
| F-14 | Ground Units move between High Grounds only where they connect. | R p.59 8.5.3 | Clarify | MOVE |

### 2.3 The battlefield (F p.2)
| ID | Ruling | R section | Kind | Home |
|---|---|---|---|---|
| F-15 | Direct Cover: Within 1" of ANY part of the terrain piece the trace passes through, not only the blocking part. | R p.47-48 7.1.1; p.88 LoS | Clarify | MOVE, KW |
| F-16 | Deactivated Mission Markers can still be Controlled. | R p.71-72 8.9.1; p.89 MISSION MARKERS | Clarify | SUP |
| F-17 | Draft blocking removes one physical card, not every copy of that name. | R p.79 9.2 | Clarify | SUP |
| F-18 | Long walls on official layouts are several independent terrain pieces (each judged alone for Cover). | R p.48 7.1.1; p.80 9.3 | Clarify | MOVE |
| F-19 | Flying and BURROWED Units may CLAIM a Controlled marker in Artefact Hunt. | R p.84-87 BURROWED/FLYING; CS2-P p.5 | Override (narrows "cannot Control or Contest") | SUP, KW |
| F-20 | Supply Drop: roll for which marker activates before the priority/First Player roll. | Mission card (CS1-T p.11); R p.58 8.4 | Extend | SUP |

### 2.4 Deployment, Entry Edges and Zone of Influence (F p.3)
| ID | Ruling | R section | Kind | Home |
|---|---|---|---|---|
| F-21 | High Ground touching your Entry Edge may be deployed onto directly (legal, In Coherency). | R p.60 8.5.5 | Clarify | SUP, MOVE |
| F-22 | Deploying from an Omega Worm or Pylon base never changes elevation: High Ground touching the base cannot be deployed onto. | R p.60 8.5.5; CS1-Z p.3, CS1-P p.4 | Extend | SUP |
| F-23 | Omega Worm and Pylon bases are Friendly Entry Edges of their placer (Burrow Ambush may start there; Photon Overcharge cannot hit Units arriving there). Forward-deploy cards and transports (Barracks (Proxy), Warp Prism) are not Entry Edges, only exceptions. | R p.86 ENTRY EDGE | Extend | SUP, CARD |
| F-24 | Deploying through a Pylon uses the whole activation: Activation Marker at once, no more actions or Active abilities that Phase. | CS1-P p.4 Warp Conduit; R p.58 8.4.1 | Clarify | SUP, TURN |
| F-25 | Omega Network makes no Zone of Influence; ZoI comes only from the Deployment Card's primary Entry Edges, marked at setup. | R p.93 ZoI | Clarify | SUP |
| F-26 | End-of-Round deployments from a marker (Ventral Sacs, Ready for Dust-off, Warp Conduit): Leading Model in base contact with the marker, rest In Coherency, all outside Enemy Engagement Range; otherwise the ability is wasted. | R p.74 8.9.4; cards | Extend | SUP, CARD |
| F-27 | Abilities do not work in Reserves (no pre-deploy Stimpack); only abilities that say so (Raiders Roll!) or that deploy the Unit (Armed and Ready, Phase Prism) do. | R p.31-32 2.7; p.90 RESERVES | Clarify | TURN, KW |
| F-28 | "Nominated to deploy" = the Unit is performing a Deploy action from any source. | R p.60 8.5.5 | Clarify | SUP |
| F-29 | No Creep speed bonus during a Deploy move; a Unit in Reserves is never ON CREEP. | R p.90 ON CREEP; p.60 8.5.5 | Clarify | SUP, KW |

### 2.5 Attack sequence (F p.3)
| ID | Ruling | R section | Kind | Home |
|---|---|---|---|---|
| F-30 | Evade works against Surge damage: Surge skips only the Armour Roll. | R p.63-64 8.7.4 | Clarify | ATK |
| F-31 | No modifier can remove a roll; Target Numbers stay 2+..6+ (ANTI-EVADE caps at 6+). | R p.33 3.4; p.90 MODIFIER | Clarify | ATK, KW |
| F-32 | Casualties are limited by visibility, not range: any target model Visible to at least one attacker may be removed, even out of range. | R p.64 8.7.4 step 5 | Clarify | ATK |
| F-33 | Close Ranks is impossible when every model is already in base contact (the Leading Model must end closer). | R p.69 8.8.1 step 1 | Clarify | ATK, MOVE |
| F-34 | Fighting several Enemy Units: at Priority 2/3 you may not remove a model whose loss breaks engagement with any one of them while another valid casualty exists. | R p.65 8.7.5 | Clarify | ATK |
| F-35 | Targets are declared one weapon Batch at a time, each resolved before the next is declared. | R p.63 8.7.3 step 2 | Clarify | ATK |
| F-36 | Blast Template Batches resolve in any order; Spillover gets no modifiers. | R p.66 8.7.6 | Clarify | ATK, KW |

### 2.6 Abilities and Tactical Cards (F p.3-4)
| ID | Ruling | R section | Kind | Home |
|---|---|---|---|---|
| F-37 | Pay CP/BM/PE by exhausting Ready cards of that type; surplus is lost (2 CP card for a 1 CP cost wastes 1). | R p.83 10.5.1 | Clarify | TURN |
| F-38 | A Unit is always within range of itself. | R p.81 10.1 | Extend | TURN |
| F-39 | Any Tactical Card Active needs an activated Unit on the battlefield, even if the card does not affect it. | R p.81-83 10.2, 10.5 | Clarify | TURN |
| F-40 | Any number of differently named Actives/Tactical Card abilities per activation if paid; still one Reaction per activation; one use per name per Unit per Round (no double Go! Go! Go!). | R p.81-82 10.2 | Clarify | TURN |
| F-41 | Concussive Shells needs LoS only to the Friendly Unit being charged (Within 8"). | R p.81 10.1; CS1-T p.2 | Clarify | CARD |
| F-42 | Raptor IMPACT Hit Roll modifiers from Malignant Creep, Evolution Chamber and Adrenal Overload stack (+3). | R p.33 3.4; p.88 IMPACT | Clarify | KW |
| F-43 | Flat Speed bonuses (Accelerating Creep, Creep Speed) stack with each other and with BUFF Speed; two BUFF Speed grants (Wild Mutation, Glial Reconstitution) do not. | R p.31 2.6.1; p.84 BUFF | Clarify | KW |
| F-44 | Opponents may stand on a deployment Faction Indicator; if blocked, it stays to End of Round and is removed with no deployment. | R p.55 7.3.2; cards | Extend | SUP, CARD |
| F-45 | Phase Prism's PLACE (0): set Artanis in base contact with a model of the chosen Unit. | R p.90 PLACE; CS1-P p.2 | Clarify | KW, CARD |
| F-46 | Damage reduction acts on Total Damage (existing + new): Life Support can clear a Marauder Unit's 2 old + 1 new. | R p.64 8.7.4 step 5 | Clarify | ATK |
| F-47 | Tunneling Claws pass through Units only, not terrain; a Force Field is terrain. | CS1-Z p.6; CS1-P p.5 | Clarify | CARD, MOVE |
| F-48 | A PLACE never removes a Force Field (not a movement). | R p.90 PLACE; CS1-P p.5 | Clarify | KW |
| F-49 | Raptors (Size 1) cannot cross Force Fields despite Raptor Strain. | CS1-Z p.11; CS1-P p.5 | Clarify | CARD, MOVE |
| F-50 | ON CREEP for Accelerating Creep's speed is checked at the start of the move and lasts the whole move. | R p.90 ON CREEP | Extend | KW, MOVE |
| F-51 | An Exhausted Tactical Card's printed abilities (e.g. Academy's Advanced Training) are unusable until Refreshed in Phase 4. | R p.83 10.5.2 | Clarify | TURN |
| F-52 | Reactions may fire outside activations: then one Reaction per trigger Phase (Unit's named limit still applies), and if both players react the First Player Marker holder goes first. | R p.32 2.7.3; p.82 10.4 | Extend | TURN |
| F-53 | Structures can be affected by abilities that target an area or the Unit as a whole; they are excluded only by an ability's own targeting limits. | Structure (CS1-T p.5 etc.) | Clarify | CARD, KW |
| F-54 | "Select" and "target" mean the same. | R p.81 10.1 | Clarify | TURN |
| F-55 | Adepts carrying an Artefact Hunt marker cannot Psionic Transfer. | CS1-P p.1; CS2-P p.5 | Extend | CARD, SUP |
| F-56 | Rapid Reinforcements cannot PLACE from a Structure. | CS1-T p.6 | Extend | CARD |
| F-57 | Combat Shield gives an Evade Roll against NON-LETHAL DAMAGE, Psionic Storm and Plague. | CS1-T p.1 | Clarify | CARD, KW |

### 2.7 Keywords (F p.4-5)
| ID | Ruling | R section | Kind | Home |
|---|---|---|---|---|
| F-58 | PINPOINT lets you shoot into a melee, not out of one. | R p.90 PINPOINT | Clarify | KW, ATK |
| F-59 | PLACE never removes a Creep Tumor; Creep Removal needs a Move, Deploy, Run, Charge or Disengage ending Within 1". | CS1-Z p.14-15; R p.90 PLACE | Clarify | KW, CARD |
| F-60 | LOCKED IN checks the TARGET's Stationary status. | R p.89 LOCKED IN | Clarify | KW |
| F-61 | INDIRECT FIRE with some target models Visible: no Evade, and hidden-from-view models may still be removed. | R p.88 INDIRECT FIRE | Clarify | KW, ATK |
| F-62 | Detection abilities (Scanner Sweep, Oversight Mode, Surveillance) place a Faction Indicator with a 6" area; not targeting, so HIDDEN's 4" limit does not apply. | R p.88 HIDDEN | Clarify | KW |
| F-63 | "While within" conditions are checked at the start and end of every action or ability and apply at once. | R p.81 10.1 | Extend | TURN, KW |
| F-64 | A REPEATABLE Reaction is still one per activation; outside activations, once per trigger. | R p.90 REPEATABLE | Override (narrows "multiple times per Activation" for Reactions) | KW, TURN |
| F-65 | PRECISION, Surge and CRITICAL HIT act on the whole weapon Batch pool; models are separate only for range, visibility and per-model modifiers. | R p.63 8.7.3-8.7.4 | Clarify | ATK, KW |
| F-66 | A melee Batch split over several Units is one Batch; keyword effects may go to either pool or be split. | R p.70 8.8.1 step 4 | Extend | ATK, KW |
| F-67 | Any drop in a Unit's Current Supply, Morph included, gives the opponent VP equal to the Supply lost. | R p.46 6.2; p.74 8.9.2; p.90 MORPH | Extend | SUP, KW |
| F-68 | A Morphed Unit gives VP for Supply lost like any other Unit. | R p.90 MORPH | Clarify | SUP, KW |
| F-69 | A SPECIALIST weapon cannot be passed to another model or kept by removing a different model. | R p.91 SPECIALIST; p.77 9.1.7 | Extend | KW, ATK |
| F-70 | Psionic Transfer may set Adepts within Engagement Range. | CS1-P p.1 | Clarify | CARD, KW |

### 2.8 Templates and Spillover (F p.5)
| ID | Ruling | R section | Kind | Home |
|---|---|---|---|---|
| F-71 | Templates with no target (Psionic Storm, Plague): the using Unit is the attacker; template centre is Target Point and Primary target; no tag matching for Spillover; same elevation still required; Flying Units count at their base's level for these. | R p.66 8.7.6 | Extend | ATK |
| F-72 | Spillover needs just one shared Combat Tag plus the same elevation (Zerglings to Roaches via Ground); Ground-level templates never hit Flying (no template elevation). | R p.66 8.7.6 step 2; p.91 SPILLOVER | Override (R reads "same Combat Tag") | ATK, KW |
| F-73 | Guardian Shield removes 1 die from each Batch aimed at the protected Unit, Spillover Batches included. | CS1-P p.5; R p.66 | Clarify | CARD, ATK |
| F-74 | Weapon keywords (PRECISION, CRITICAL HIT, ...) apply only to the Main target pool, never to Spillover. | R p.91 SPILLOVER | Clarify | ATK, KW |

## 3. Discrepancies found between sources (no official errata; our handling)
| ID | Where | Issue | Our handling | Status |
|---|---|---|---|---|
| D-01 | CL p.2 | Artanis paragraph lists "Adept 250 -> 270"; Adept's real change is CL-30 (150 -> 160). | Artanis = 270 (CT p.7 confirms; R p.108 had Artanis 250). | Corrected |
| D-02 | CS1-Z p.6, p.7 vs p.9 | Glial Reconstitution costs "1 CP" on Roach and Corpser, "1 BM" on Vile. Zerg pays BM (R p.83 10.5.1). | 1 BM for all three. | Unsourced |
| D-03 | R p.75 9.1.2 vs CS1-Z p.14 | R's example gives Kerrigan's Swarm 3 Core, 1 Hero, 2 Support; the Faction Card prints 3 Core, 2 Elite, 1 Hero. | Card wins (R p.31 2.6.2). | Corrected |
| D-04 | R p.32 2.7.3 vs F p.4 | R: Active Player reacts first; F: outside an activation the First Player Marker holder reacts first. | Inside an activation use R; outside use F. | Confirmed |
| D-05 | OP p.8 vs R p.79 9.2 | OP gives draft priority to whoever spent less gas, then minerals, then Roll-Off; R uses a Roll-Off. OP also fixes Standard 2000 / 200 gas, Skirmish 1000 / 100 gas, 2 h 30 min rounds. | Use R for normal games; OP only for a tournament mode. | Confirmed |
| D-06 | CS1-T p.1 | "FOR C-14 RIFFLE" typo on AGG-12. | Read as C-14 Rifle. | Corrected |
| D-07 | CS1-P p.4 | Pylon tag "ARMORED". | Armoured. | Corrected |
| D-08 | CS2-T p.1 | Large says "Impassible". | Impassable. | Corrected |
| D-09 | CS1-P p.8 | Gate Chronoboosted and Warp Prism print card version v1.03.26; the rest v1.04.26. | Use the printed text; flag for re-check if a newer sheet appears. | Unsourced |
| D-10 | F p.1 | FAQ v1.1 marks new answers in magenta; colour is lost in extraction. | Treat every row as current. | GAP |
