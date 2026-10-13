# 10 Overview: components, terminology, rules priority, source index

Not Enough Minerals ports the StarCraft: Tabletop Miniatures Game core rules (Archon Studio, licensed
from Blizzard) to the browser as an unofficial fan project. Mechanics are 1:1; every sentence here is our
own wording, written from one-line mechanical summaries. Where the Changelog 10.2026 (CL) or Cost Table
10.2026 (CT) changes the Core Rules (R), the spec states the CL/CT value only and marks it "(CL)"; FAQ
clarifications are marked "(F)". Rule IDs in brackets map to `12-rules-test-checklist.md`.

## 1. Source keys and citation convention
| Key | File in `docs/sources/` (gitignored) | Cite as |
|---|---|---|
| R | StarCraft-TMG_EN.pdf (Core Rules, 128 PDF pages) | (R p.N s) where N is the PDF page (the `=== PAGE n ===` marker in `text/`), s the rule section. Printed page = N - 2. |
| QS | StarCraft-TMG-Quick-Start-Rules_EN.pdf | (QS p.N) PDF page |
| F | StarCraft-TMG-FAQ_EN.pdf, v1.1 dated 25.09.2026 | (F p.N) |
| CL | StarCraft-TMG-Changelog-10.2026_EN.pdf (dated 09.10.2026) | (CL p.N) |
| CT | StarCraft-TMG-Cost-Table-10.2026_EN.pdf | (CT p.N) |
| OP | StarCraft-TMG-Organised-Play_EN.pdf | (OP p.N); tournament-only rules, optional in our app |
| CS1-T/Z/P | Wave 1 card sheets, Terran / Zerg / Protoss | (CS1-T p.N) |
| CS2-T/Z/P | Wave 2 card sheets | (CS2-P p.N) |

Precedence (highest first): CL and CT, then the specific card text (unit, mission, deployment, tactical,
faction), then F, then R, then QS (a summary only) (R p.31 2.6.2; task brief). CL 10.2026 contains only
mineral and gas cost changes; it changes nothing in the round, setup or mission rules (CL p.2).

Leak guard (never a source): StarCraft II video game numbers; preview/beta rules from before June 2026;
R values superseded by CL/CT; Warhammer 40k or Mallet numbers (wound rolls, saves vs AP, OC, CP stratagems).

**Engine notes.** Every rule record in data and every spec bullet carries a `source` string in this
format. The engine never reads PDFs.

## 2. The game in one paragraph
Two players each command an army of Units bought with Minerals (units, upgrades) and Vespene Gas
(Tactical Cards). No Unit starts on the table: all begin in Reserves and arrive through a player's Entry
Edge, limited by a per-round Supply Pool that grows each round and becomes unlimited in the final round.
A game lasts the number of Rounds on the Mission Card (4 or 5 in every card found; R says "up to 5").
Each Round has four Phases: Movement, Assault, Combat, Scoring & Cleanup. In the first three, players
alternate activating one Unit at a time, one action each. Victory Points come from destroying enemy
Supply and from Mission Markers controlled by Supply totals (R p.56 8.1-8.2; R p.46 Part 6; QS p.6).
[GEN-001]

## 3. Components (logical; all art, emblems and card frames are our own)
| Component | Rules facts | Source |
|---|---|---|
| Model | One miniature on one base. All rules use the base only; pose, weapons, scenery and flight-stand height are ignored. A flight-stand model's base is the bottom of its stand. | R p.30 2.1, 2.3 |
| Unit | One or more models acting as one formation; model count comes from the chosen Composition Option. | R p.30 2.2; R p.76 9.1.6 |
| Base | Size printed on the Unit Card; bases never overlap each other or impassable terrain. | R p.30 2.3 |
| Unit Card | Characteristics, weapon profiles, Supply Profile (model count -> Current Supply Value), tags, abilities; reverse lists upgrades. | R p.40-41 5.1-5.2; QS p.4 |
| Faction Card | One per army; gives starting Army Slots and Faction Tags; can be Exhausted for its resource. | R p.43 5.4; R p.75 9.1.2 |
| Tactical Card | Bought with gas; adds Army Slots, abilities and resource generation; Ready or Exhausted. | R p.42 5.3; R p.83 10.5 |
| Mission Card | Name, Engagement Scale, Starting Supply, Supply Escalation, Game Length, Mission Parameters, Scoring Conditions, Additional Conditions (incl. special winning conditions). | R p.44 5.5 |
| Deployment Card | Name, Engagement Scale, table size, Entry Edges, Zone of Influence, Mission Marker coordinates. | R p.45 5.6 |
| Mission Markers | 5 numbered, 32 mm diameter, two faces (Activated / Deactivated). 1 and 3 Red, 2 and 4 Blue, 5 Neutral. No physical presence: never block movement or LoS. Treated as Size 0 for LoS to the marker. | R p.55 7.3.2; R p.71 8.9.1 |
| Activation Marker | Two-sided: Movement face, Assault face. | R p.55 7.3.2 |
| Faction Indicator | Marks who controls a Mission Marker; some abilities use them to mark an area. | R p.55 7.3.2 |
| Mode markers | Track modes such as SIEGE MODE, BURROWED; they have STAY IN PLAY. | R p.56 7.3.2 |
| Zone of Influence markers | L-shaped corner markers used only when an Entry Edge is not a full table edge. | R p.56 7.3.2 |
| First Player Marker | Initiative token; see `11` section 3. | R p.56 7.3.2 |
| Buff / Debuff markers | Blue = positive, Red = negative status effects. | R p.56 7.3.2 |
| Damage Marker | A D6 next to the Unit recording carried-over damage. | R p.64 8.7.4 |
| Tokens | Physical battlefield objects (Creep Tumor, Corrosive Bile, Shades): Size 0 terrain with their own base; models may cross but not end on them unless stated; removed at end of Round unless STAY IN PLAY; measure to nearest base edge. | R p.55 7.3.1 |
| Dice | D6 only. D3 = D6 halved, rounded up. Surge Die is one extra die of a different colour. | QS p.3; R p.64 8.7.4 |
| Templates | Blast Template (BT) and Flamer Template (FT). | R p.66 8.7.6 |
| Measuring | Inches; pre-measuring is allowed at any time. | R p.35 4.1 |
| Terrain | Pieces with a Size (0, 1, 2, 3+), Grass (Size 2 special), ACCESS POINTs, ramps. | R p.59 8.5.3; R p.80 9.3 |
| Battlefield | 36x36 in (Skirmish), 36x54 in (Standard), 36x72 in (Grand Offensive). | R p.75 9.1.1 |

Engagement Scale table (R p.75 9.1.1): Skirmish up to 1,000 Minerals, gas 10% of minerals, 36x36;
Standard up to 2,000, 10%, 36x54; Grand Offensive 2,001+, 10%, 36x72. [GEN-002]

**Engine notes.** Components become data records (`20` schemas). Markers are not table objects: the engine
stores activation state, statuses, damage and control as fields on Unit / Marker records, and the client
draws them. Tokens are table objects with a footprint and a Size (one generic "token" entity type).

## 4. Terminology (one meaning each, used across all specs)
| Term | Exact meaning | Source |
|---|---|---|
| Model / Unit | Section 3. A Unit is Destroyed when its last model is removed; every effect on it ends at once, its non-STAY IN PLAY tokens are removed, effects it put on other Units stay; a Destroyed Unit never returns unless a rule says so (F confirms). | R p.56 7.4; F p.2 |
| Friendly / Enemy | Everything the controlling player (or a teammate) owns is Friendly; everything an opponent owns is Enemy. A Unit's own models are always Friendly to it. A Unit may never attack a Friendly Unit unless a rule says so. | R p.31 2.5; R p.86-87 Part 11 |
| Active Player | The player whose turn it is to act. | R p.31 2.5 |
| Controlling Player | Makes all decisions and rolls all dice for a Unit, model or Token; control can be transferred (e.g. Neural Parasite). | R p.31 2.5 |
| Within X" | A model is Within if any part of its base touches or crosses into the range. A Unit is Within if at least one model is. | R p.36 4.2 |
| Wholly Within X" | A model is Wholly Within only if its whole base is inside the range. A Unit is Wholly Within only if every model is. | R p.36 4.2 |
| Distance | Nearest base edge to nearest base edge, measured horizontally from above (vertical height ignored); touching bases are 0" apart and count as Within 1" ("Base-to-Base"). To terrain: nearest base point to nearest terrain edge. To tokens/markers: nearest physical edge. | R p.35 4.1; QS p.3 |
| Leading Model | The one model chosen by the controlling player whenever a Unit performs Move, Deploy, Run, Charge, Disengage, Close Ranks, or anything else that asks for one. It moves along a measured path; the rest are then set In Coherency around it. The nomination ends when the action resolves. It sets the Unit's Gap Clearance category. | R p.37 4.3; R p.88 Part 11 |
| In / Out of Coherency | At the end of every repositioning action, every model must be Wholly Within 3" of the Leading Model and trace a Coherency Link to it; otherwise the Unit is Out of Coherency until its next repositioning action. Casualties never change it (F confirms). | R p.37 4.4; F p.2 |
| Engagement Range | 1" horizontally from a model's base. | R p.55 7.2 |
| Engaged | Two Enemy models Within 1" are Engaged, only if: both are Ground (Flying models are never Engaged); no Size 2+ terrain lies between them (Size 0-1 does not stop it); not one on HIGH GROUND and the other at GROUND LEVEL; MID GROUND models engage HIGH GROUND or GROUND LEVEL models only if both are adjacent to the same ACCESS POINT linking the two levels. If any model of a Unit is Engaged with any model of an Enemy Unit, both whole Units are Engaged. | R p.55 7.2, 7.2.1; R p.86 Part 11 |
| Unengaged | A Ground Unit with no model Engaged. Flying Units are always Unengaged. | R p.93 Part 11 |
| Ground / Flying | Combat Tags. Ground models engage only Ground models. Flying: moves point to point ignoring terrain and models, never Engaged, cannot Charge or be Charged, cannot Contest or Control Mission Markers, does not fight in the Combat Phase, must end a move at least 1" from Enemy Flying Units, may end in base contact with Ground models. The **Ground** tag is not the same as GROUND LEVEL elevation: a Flying model on the mat is at GROUND LEVEL but is not Ground. | R p.31 2.4.2 note; R p.60 8.5.3; R p.87 Part 11 |
| Elevation | GROUND LEVEL (on the mat), MID GROUND (on horizontal terrain of Size 1-2; ramps are MID GROUND), HIGH GROUND (horizontal terrain of Size 3+). A base on several levels counts as the highest. Levels change only through ACCESS POINTs. | R p.59 8.5.3 |
| Visible | A valid LoS trace exists (cover rules may block it); HIDDEN models are not Visible beyond 4". | R p.93 Part 11 |
| Reserves | Off-table holding area. All Units start here. A Unit in Reserves cannot be targeted, uses no abilities unless stated, cannot contest markers and does not count against Supply on the table. | R p.90-91 Part 11; F p.3 |
| Supply Value / Current Supply Value | The Supply Profile value for the Unit's present model count; updated the instant a casualty drops it into a lower bracket. | R p.46 6.1; R p.85 Part 11 |
| Supply Pool / Available Supply | Pool: the cap on total Current Supply on the table this Round. Available = Pool minus the Current Supply of all Friendly Units on the table. | R p.57 8.3.1-8.3.2 |
| Tactical Mass | Current Supply greater than the combined Current Supply of all Enemy Units it is Engaged with. | R p.92 Part 11 |
| Entry Edge / Zone of Influence | Table-edge segment(s) a player deploys from; the area 6" inward from them. See `17`. | R p.45 5.6; R p.93 Part 11 |
| Activated | A Unit that has taken its action this Phase (has the Activation Marker for that Phase). | R p.58 8.4.1; R p.62 8.6.1 |
| Ready / Exhausted | Card states: face up / face down. All cards are Refreshed to Ready in Cleanup. | R p.83 10.5.2 |
| STAY IN PLAY | A token, marker or effect with it survives Cleanup & Refresh. | R p.92 Part 11 |
| Status | A keyword-state on a Unit (BURROWED, SIEGE MODE, STATIONARY...). Not removed in Cleanup unless stated. STATIONARY is gained by all Units at the Start of each Round and lost the moment any model moves, is moved or is PLACEd. | R p.92 Part 11 |
| Select / target | Synonyms (F). A Unit is always within range of itself for its own abilities (F). | F p.4 |
| Round / Phase / Turn | Round = 4 Phases. Turn = one player's opportunity to activate one Unit or Pass. | R p.56 8.1-8.2 |

Rules on keywords: BOLD CAPS keywords mean the same everywhere; the same keyword gained twice gives
nothing extra; a numeric keyword uses only its highest value (R p.31 2.6.1). Numeric modifiers from
differently named sources stack unless they share the BUFF keyword (F p.4). Target numbers are clamped to
2+..6+; natural 6 always succeeds, natural 1 always fails (QS p.3; F p.3). [GEN-003..005]

**Engine notes.** One geometry module answers `within(a, b, d)`, `whollyWithin(a, region, d)`,
`distance(a, b)` and `engaged(modelA, modelB)` (with the tag, terrain and elevation gates in one function);
everything else (contest, ZoI, charge, coherency) calls these. Unit-level Within/Wholly Within are
`some`/`every` over models.

## 5. Rules priority (resolution order for conflicts)
1. CL/CT values replace R values (cost data only in 10.2026). [GEN-006]
2. Specific beats general: text on a Unit Card, Mission Card or Special Ability that contradicts the
   Core Rules wins (R p.31 2.6.2; QS p.2). Deployment and Tactical Card text is treated the same way
   (RULING in `17`).
3. F answers are binding clarifications of R.
4. Within R, a specific section beats a general one (e.g. Part 11 FIRST PLAYER MARKER limits the
   "first to Pass takes the marker" rule to Phases 1 and 2; see `11` section 3).
5. Simultaneous triggers: same player's effects in the order that player chooses; across players the
   Active Player first (Passive and Reaction abilities, R p.82 10.3-10.4); Start/End of Round effects:
   First Player Marker holder first (R p.58 8.4, R p.74 8.9.4); reactions outside any activation: First
   Player Marker holder first (F p.4).
6. Dispute fallback (table play only): Roll-Off, winner decides this instance (R p.96 12.9). Our engine
   never needs it: every ambiguity has a logged RULING.

**Engine notes.** Card text is data (abilities DSL in `16`/`20`); core rules are code. Overrides are expressed
as declarative hooks that the core consults (e.g. `canContest(unit)` asks status and tag modifiers),
never as special cases inside the core loop.

## 6. Ability types (summary; full rules in the abilities spec)
- Active: only while the Unit is Activated, immediately before declaring its action or immediately after
  it fully resolves, never mid-action; once per Round per Unit per named ability unless REPEATABLE;
  effects end at the End of the Round unless stated (R p.31 2.7.1; R p.81 10.2). Any number of differently
  named Active abilities and Tactical Cards per activation if costs are paid (F p.4).
- Passive: always on while the Unit is on the table; off in Reserves (R p.32 2.7.2).
- Reaction: declared at the exact trigger moment; each player resolves at most one Reaction per
  activation; once per Round per Unit per named Reaction (REPEATABLE lifts the per-round limit only, never
  the one-per-activation limit, F p.5); Active Player first when both react (R p.32 2.7.3; F p.4).
- "End of the Round" effects last through step 4 of the Scoring Phase and are removed in Cleanup (R p.81 10.1).
- Costs (CP Terran, BM Zerg, PE Protoss) are paid by Exhausting matching Ready cards; excess is lost
  (R p.83 10.5.1; F p.3). A card's Active Ability needs an active Unit on the table (F p.4).

## 7. Out of scope for the first slice (noted so nothing is silently dropped)
- Team games (R p.78 9.1.8), Grand Offensive scale (no Grand Offensive Mission or Deployment Card exists
  in our sources: GAP, searched all CS1/CS2 sheets and R Part 9), Organised Play clocks (OP p.6).

## 8. Glossary index of all R parts
Owner column: spec file that implements the part ("rules spec" = another rules spec in this folder; see
`00-architecture.md` for the final file map).

| R part / section | PDF pages | Content | Owner |
|---|---|---|---|
| Part 1 Learn to Play (worked example, Rounds 1-2) | 7-29 | Terran vs Zerg, Frontlines + Abandoned Camp | `17` section 9 (setup); golden-test spec |
| Part 2 Core Concepts 2.1-2.7 | 30-32 | models, units, bases, tags, player roles, keywords, priority, ability types | `10` |
| Part 3 Dice 3.1-3.8 | 33-34 | D6/D3, Roll-Off (2D6, re-roll ties), re-rolls, modifiers, fixed additions, auto results, tests, cocked dice | dice spec; Roll-Off used by `11`/`17` |
| Part 4 Measuring 4.1-4.6 | 35-39 | distances, Within/Wholly Within, Leading Model, Coherency, directly towards/away, Gap Clearance | `10` section 4 (terms); movement spec |
| Part 5 Cards 5.1-5.6 | 40-45 | Unit, upgrade, Tactical, Faction, Mission, Deployment cards | cards spec; 5.5-5.6 in `17` |
| Part 6 Supply 6.1-6.2 | 46 | Supply Profile, deployment cap, marker control by Supply, Tactical Mass, Supply-based VP | `11` sections 4, 8; `17` |
| Part 7 Battlefield 7.1-7.4 | 47-56 | LoS, cover, verticality, high ground, flying cover; engagement; tokens/markers; destroyed Units | LoS/terrain spec; 7.2-7.4 in `10`/`11` |
| Part 8 Game Sequence 8.1-8.10 | 56-74 | rounds, activation, passing, first player, reserves, the four phases and their actions, scoring, final score | `11` (sequence); action internals: movement, attack and combat specs |
| Part 9 Preparing 9.1-9.3 | 75-81 | army building (9.1), Mission draft (9.2), battlefield setup (9.3) | 9.1 forces spec; 9.2-9.3 `17` |
| Part 10 Advanced 10.1-10.5 | 81-83 | ability rules in full, card resources and states | abilities/cards spec; summary `10` section 6 |
| Part 11 Keyword Glossary | 84-94 | every keyword and defined term | keyword spec; terms used here in `10` section 4 |
| Part 12 Quick Reference 12.1-12.12 | 94-115 | pre-game protocol, round sequence, phase summaries, casualty removal, templates, dispute rule, unit and card points (costs superseded by CT), example armies | `11`, `17`; costs: data from CT |
| Index | 116 | | n/a |
| Map Layouts | 117-126 | terrain key; 6 Standard maps (p.118-123), 3 Skirmish maps (p.124-126) | `17` section 3 |

R section numbers inside Part 8 (for cross-reference): 8.1 rounds and phases; 8.2 activation (8.2.1
passing and initiative, 8.2.2 first player); 8.3 deployment and reserves (8.3.1 Supply Pool, 8.3.2
Available Supply, 8.3.3 deployment restrictions); 8.4 Movement Phase (8.4.1 activations, 8.4.2 passing);
8.5 Movement actions (8.5.1 Hold, 8.5.2 Move, 8.5.3 resolving a move, 8.5.4 Disengage, 8.5.5 Deploy);
8.6 Assault Phase (8.6.1, 8.6.2); 8.7 Assault actions (8.7.1 Run, 8.7.2 Hold, 8.7.3 Ranged Attack, 8.7.4
resolution, 8.7.5 removing models from Engaged Units, 8.7.6 templates, 8.7.7 Charge); 8.8 Combat Phase
(8.8.1 Close Combat Attack); 8.9 Scoring & Cleanup (8.9.1 marker control, 8.9.2 VP, 8.9.3 end-of-game
check, 8.9.4 end-of-round effects, 8.9.5 cleanup and refresh, 8.9.6 initiative); 8.10 final score.
