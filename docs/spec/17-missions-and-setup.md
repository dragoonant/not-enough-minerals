# 17 Missions, deployments and game setup

Each Mission Card and Deployment Card becomes a JSON record (`20` MissionDef / DeploymentDef). All
summaries are mechanical and in our own words. Citation format and terms: `10`. Round/scoring sequence:
`11`. CL 10.2026 changes nothing in this file (CL p.2, costs only). Rule IDs map to
`12-rules-test-checklist.md`.

## 1. Pre-game sequence (R p.75-80 Part 9; R p.94 12.1; R p.57 8.2.2)
1. Agree the Engagement Scale (Skirmish <= 1,000 Minerals / 36x36; Standard <= 2,000 / 36x54; Grand
   Offensive 2,001+ / 36x72; gas = 10% of the mineral limit) and build armies (forces spec). [SET-001]
2. Mission and Deployment draft (section 4). [SET-002]
3. Battlefield setup in this exact order (R p.80 9.3): (a) confirm table size from the Deployment Card;
   (b) assign Entry Edges; (c) set Zone of Influence markers at the corners of any Entry Edge that is not a
   full table edge; (d) set terrain (section 3); (e) set Mission Markers at the card coordinates. [SET-003]
4. Pre-game initiative Roll-Off: the winner gives the First Player Marker to either player for Round 1
   (resolved at Round 1 Start of Round, after mission start steps, `11` RULING R11-1). [SET-004]
5. All Units start in Reserves; all Tactical and Faction Cards are face up (Ready) (R p.57 8.3; R p.76
   9.1.5). Round 1 begins (`11`). [SET-005]
R 12.1 lists markers before terrain; the full rule 9.3 (terrain first, then markers) wins (RULING R17-1).

**Engine notes.** `setupGame(config, seed)` runs steps 2-5 as a scripted sequence of `PendingDecision`s
(`draftColour`, `draftControl`, `draftBan`, `draftPick`, `terrainChoice`, `firstPlayerAssign`). The bot
and the human use the same decisions.

## 2. Battlefield and coordinates
- Sizes: Skirmish 36" x 36", Standard 54" x 36" (written 36x54 in R, 54x36 on cards), Grand Offensive
  72" x 36" (R p.75 9.1.1; QS p.3). [BF-001]
- Our frame (used by every record below): the Deployment Card as printed, text upright. Origin at the
  bottom-left corner; x to the right (0..W, W = 36 or 54), y up (0..36). Edges: N (y = 36), S (y = 0),
  W (x = 0), E (x = W). [BF-002]
- Marker coordinates are to the Marker centre. Checked by measuring the printed cards: the dimension
  lines end at the Marker's centre (e.g. Abandoned Camp Marker 1: 6" from W edge to centre). Range
  checks to a Marker still use its nearest edge (32 mm diameter = 1.26", radius 0.63") (R p.35 4.1;
  R p.55 7.3.2). [BF-003]
- The card frame is never mirrored or rotated in our app (RULING R17-2).

**Engine notes.** `DeploymentDef = {id, name, scale, size:{w,h}, entryEdges:{red:[Segment], blue:[Segment]},
zones:{red:[Rect], blue:[Rect]}, markers:[{n, x, y}], version, source}`; `Segment = {edge:'N'|'S'|'W'|'E',
from, to}` (x range for N/S, y range for W/E). Zones are derived (section 6) but stored for clarity.

## 3. Terrain (R p.59 8.5.3; R p.80 9.3; R p.94 12.1; R p.117-126 Map Layouts; F p.2; OP p.4-5)
- Either (a) pick or roll one official map: roll D6 among the 6 Standard maps (R p.118-123) or D3 among
  the 3 Skirmish maps (R p.124-126); or (b) players alternate placing one piece at a time, Red Player
  first, following the density guide. [TER-001]
- Density guide for 36x54 (scale proportionally for other sizes): 8-12 pieces: 0-2 of Size 0
  (scatter); 2-4 of Size 1 (barricades, low walls, crates: cover for infantry, no LoS block for models
  above Size 1); 6-8 of Size 2 (ruins, bunkers, wrecks: the LoS backbone); 1-2 of Size 3+ if available
  (HIGH GROUND, block LoS for almost everything); 4-6 Grass (Size 2 special: blocks LoS, not movement,
  removed when crossed). Each table quarter holds at least 2 pieces of Size 2+; no empty quarter; at least
  one significant piece Within 6" of the centre; at least 2 clear fire lanes 6"+ wide running roughly
  from one Entry Edge toward the other; every standable Size 3+ piece has an ACCESS POINT reachable from
  GROUND LEVEL without crossing other Size 2+ terrain; keep at least 3" between major structures
  (R p.94 12.1). [TER-002]
- Terrain key for the official maps: Head Statue, Statue Shard, Vespene Geyser, Shrubs A, Shrubs B,
  Protoss Banner, Temple Obelisk, Wall Sets 1-6, Lost Temple Ramp. A Standard map uses 2 of each (4 of
  each Shrubs); a Skirmish map uses 1 of each (2 of each Shrubs). Long walls on the official maps are
  several independent pieces (F p.2). [TER-003]
- Gaps, windows and open interiors inside a piece's footprint block LoS unless agreed at setup (R p.89
  Part 11 LoS). Players agree each piece's Size and rules before the draft (OP p.4). [TER-004]
- Mission Markers may sit on MID or HIGH GROUND, never on impassable terrain. If a coordinate lands on
  impassable terrain, move the terrain (never the Marker) to the nearest position that clears it (R p.80
  9.3). OP adds: the player whose colour is not that Marker's colour chooses how it moves (and the
  direction when several are equally near); for Marker 5, Roll-Off (OP p.5). [TER-005]
- GAP: piece-by-piece positions and Sizes of the 9 official map layouts are only in page images
  (R p.118-126, with a 6" grid). Searched: R text, QS, F, OP, card sheets. Action: digitise from the page
  images in a data task (render with PyMuPDF, read against the 6" grid) and record a Size per piece
  (Sizes are not printed in the terrain key either).

**Engine notes.** Terrain is data (`TerrainPiece = {id, kind, size, footprint polygon, elevation,
accessPoints, grass}`); a map is a list of placed pieces. The density guide doubles as a validator for a
procedural map generator (our fallback until the official maps are digitised).

## 4. Mission and Deployment draft (R p.79 9.2; R p.44-45 5.5-5.6; F p.2; OP p.8)
1. Each player brings 2 Mission Cards and 2 Deployment Cards of the agreed scale (RULING R17-3); no
   duplicate inside one player's set, but both players may bring the same cards. Lay all 4 Mission
   Cards face up in row 1 and all 4 Deployment Cards in row 2. [DRF-001]
2. Roll-Off. The winner chooses, in order: (a) colour: Red or Blue Player (fixes Entry Edge, Zone of
   Influence and Marker affinity for the game); (b) draft control: Mission Draft or Deployment Draft.
   The opponent controls the other draft. [DRF-002]
3. Mission Draft: the player without Mission control removes any 2 Mission Cards; the controller picks 1
   of the 2 left; the last is discarded. [DRF-003]
4. Deployment Draft: same procedure with the Deployment Cards. [DRF-004]
5. Removing a card removes that physical copy only; a duplicate copy brought by the other player stays a
   legal choice (F p.2). [DRF-005]
6. Marker affinity: Markers 1 and 3 Red, 2 and 4 Blue, 5 Neutral. Affinity never grants control. [DRF-006]
- OP variant (tournament only, optional toggle): priority is not rolled: the player who spent less gas,
  then fewer minerals, then a Roll-Off, takes priority and makes the two choices; the other player picks
  the table side (perspective). A judge randomises an overrun draft (OP p.8). [DRF-007]
- Casual alternative seen in R: players may simply agree a Mission and Deployment (R p.7 worked
  example). [DRF-008]

**Engine notes.** Draft state = `{rows:{mission:[cardRef x4], deployment:[cardRef x4]}, colour:{seat->red|blue},
control:{mission:seat, deployment:seat}, step}`. For a bot game the bot's 2+2 cards come from its army
preset (data) or are drawn at random from the scale's pool.

## 5. Mission Markers in play (R p.55 7.3.2; R p.71-73 8.9.1; R p.89 Part 11; F p.2)
- Five Markers exist on every Standard card; Skirmish cards use only Markers 1, 2 and 5. [MM-001]
- Each Marker is Activated or Deactivated (Mission Parameters set the start state). Both kinds can be
  controlled; only the Mission text decides what Activated means for scoring. [MM-002]
- Control, contesting and Sticky Control: `11` section 9.1. Flying and BURROWED Units never contest or
  control. [MM-003]
- A Marker has no physical presence: models may move over and stand on it; it never blocks LoS or
  movement; for LoS to it, it is Size 0. [MM-004]
- A Marker "removed" or "CLAIMed" by a Mission is off the table: it cannot be contested or controlled
  while off. [MM-005]

**Engine notes.** `MarkerState = {n, x, y, elevation, active: bool, onTable: bool, controller: seat|null,
controlledSinceRound, claimedBy: unitId|null, activatedRound: number|null}`.

## 6. Entry Edges and Zones of Influence (R p.45 5.6; R p.57 8.3.3; R p.79 9.2.1; R p.93 Part 11; F p.3)
- Entry Edge: the coloured table-edge segment(s) a player's Units Deploy from. A player can have several
  segments (e.g. Breach: one full edge; Acropolis: two separate 18" segments). [ZOI-001]
- Zone of Influence: the area extending 6" inward from each of the player's Entry Edge segments, i.e. one
  rectangle per segment: segment length x 6" deep. For a corner L-shaped edge it is the union of the two
  rectangles. Where a segment is not a full edge, the L-shaped corner markers show the zone. [ZOI-002]
- Effect: an arriving Unit (Deploy, transport, SUMMON, any arrival) may not end its arrival activation
  with any model Within the opponent's Zone of Influence (`11` section 6.3). It never limits Units
  already on the table, never blocks movement or LoS. [ZOI-003]
- Only Deployment Card edges create a Zone of Influence; alternate entry points (Omega Worm, Pylon) do
  not (F p.3). [ZOI-004]
- Artefact Hunt also scores Units "Wholly Within" their own Zone of Influence (section 7.6). [ZOI-005]

**Engine notes.** `zoneRects(segment) = N: {x:[from,to], y:[30,36]}; S: {y:[0,6]}; W: {x:[0,6],
y:[from,to]}; E: {x:[W-6,W]}`. "Within the zone" for a model = base circle intersects any rect;
"Wholly Within" = base circle inside the union.

## 7. Mission Cards (CS1-T/Z/P p.11-13 identical on all three Wave 1 sheets; CS2-P p.5)
Common to every mission found: all score "VP equal to Enemy Supply destroyed this Round" in every
Round's Scoring Phase (`11` section 9.2); none prints a tiebreaker (so a VP tie is a Draw, R p.74 8.10).
"From the start of Round N" means the condition scores in the Scoring Phase of Round N and every later
Round.

| Mission | Scale | Start Supply | Escalation / Round | Rounds | Special win (lead of) | Markers start |
|---|---|---|---|---|---|---|
| Supply Drop | Standard | 6 | +2 | 5 | 12+ VP | all Deactivated |
| Supply Drop | Skirmish | 4 | +1 | 4 | 8+ VP | all Deactivated |
| Hold Position | Standard | 6 | +2 | 5 | 10+ VP | all Activated |
| Hold Position | Skirmish | 3 | +1 | 5 | 8+ VP | all Activated |
| Frontlines | Standard | 6 | +2 | 5 | 10+ VP | all Activated |
| Frontlines | Skirmish | 3 | +1 | 5 | 8+ VP | all Activated |
| Gather the Resources | Standard | 6 | +2 | 5 | 10+ VP | all Activated |
| Gather the Resources | Skirmish | 3 | +1 | 5 | 8+ VP | all Activated |
| Divide and Conquer | Standard | 8 | +2 | 4 | 10+ VP | all Activated |
| Divide and Conquer | Skirmish | 4 | +1 | 4 | 8+ VP | all Activated |
| Artefact Hunt (Wave 2) | Standard | 6 | +2 | 5 | none | all Activated |
| Artefact Hunt (Wave 2) | Skirmish | 3 | +1 | 5 | none | all Activated |
Supply Pool per Round (`11` section 4): e.g. Supply Drop Standard 6, 8, 10, 12, unlimited; Divide and
Conquer Standard 8, 10, 12, unlimited; Frontlines Skirmish 3, 4, 5, 6, unlimited. [MSN-001]

### 7.1 Supply Drop (CS1-T p.11)
- Setup: every Marker starts Deactivated.
- Standard: Start of Rounds 1-4: pick one Deactivated Marker among 1-4 at random and flip it to
  Activated. Start of Round 5: Marker 5 becomes Activated automatically.
- Skirmish: Start of Rounds 2-4: pick one Deactivated Marker among 1, 2, 5 at random and activate it.
  (No Round 1 activation; game is 4 Rounds.)
- Marker activation resolves before any initiative Roll-Off that Round (F p.2).
- Scoring: Supply destroyed, plus from Round 1 (Standard) or Round 2 (Skirmish): for every Activated
  Marker you control after step 1, gain VP equal to the Round number in which that Marker was
  Activated, then remove that Marker from the table.
- Sticky control applies: a Marker you controlled while Deactivated scores for you as soon as it is
  Activated and still yours at a Scoring Phase, even with no Unit near it (RULING R17-4).
[MSN-010..014]

### 7.2 Hold Position (CS1-T p.11)
- All Markers Activated. From Round 2: 1 VP per Marker you control that is Neutral (5) or of your own
  colour; 2 VP per Marker you control of the opponent's colour. [MSN-020]

### 7.3 Frontlines (CS1-T p.12)
- All Markers Activated. From Round 2: 1 VP per Marker you control, plus 2 VP more for each Marker whose
  control you took from the opponent in this Round's step 1 (it was the opponent's before step 1 and is
  yours after). Taking a Marker that was never held gives no bonus. [MSN-030]

### 7.4 Gather the Resources (CS1-T p.12)
- All Markers Activated. From Round 2: 2 VP per Marker you control of the opponent's colour (own-colour
  and Neutral Markers score nothing at the end of the Round).
- Gather action (Assault Phase): an Unengaged Unit Within 3" of a Marker that you control and that is
  Neutral or of the opponent's colour may take the Gather action instead of a standard action: gain 1 VP
  at once. Marker control only exists after a Scoring Phase, so in practice from Round 2. Several Units
  may Gather at the same Marker in one Round. Contest conditions (LoS, elevation, Coherency) are not
  required, only Within 3"; Flying and BURROWED Units may Gather if Unengaged (literal reading; RULING
  R17-5). The Disengage penalty does not forbid Gather. [MSN-040..042]

### 7.5 Divide and Conquer (CS1-T p.13)
- All Markers Activated. The table is split into four quarters by its two centre lines (the dotted lines
  on every Deployment Card). Applies from Round 1:
- Per quarter, each player sums the Current Supply of their Units Wholly Within that quarter (a Unit
  straddling a line counts nowhere). A Unit that controls a Mission Marker counts +1 Supply for this
  check. Gain 1 VP for each quarter where your total is strictly higher than the opponent's (0 vs 0 or a
  tie scores nothing).
- Gain 2 VP if you control Marker 5.
- "A Unit controls a Marker" = its player controls that Marker after step 1 and the Unit is eligible to
  contest it (Within 3", LoS, same elevation, In Coherency, not Flying/BURROWED). The +1 applies once per
  Unit however many Markers it holds. Flying Units count toward quarters (no bonus). (RULING R17-6)
[MSN-050..053]

### 7.6 Artefact Hunt (CS2-P p.5; F p.2, p.4)
- All Markers Activated. No special winning condition.
- CLAIM (Scoring Phase, from Round 2): a Unit Within 3" of a Marker that you control and that is Neutral
  or of the opponent's colour may CLAIM it: the Marker leaves the table and rides on that Unit. A Unit
  carries at most one Marker. Flying and BURROWED Units may CLAIM (F p.2). Timing: after step 1
  (control) and before step 2 (VP); marker holder makes all their claims first, then the opponent
  (RULING R17-7).
- DROP: the carrier must drop its Marker when (a) its Current Supply Value is reduced, (b) just before
  it resolves any PLACE effect (so an Adept cannot Psionic Transfer while carrying, F p.4), (c) it is
  Engaged with Enemies whose combined Current Supply is greater than its own, or (d) it is Destroyed,
  removed from the table or returned to Reserves. The opponent then places the Marker Within 2" of the
  Unit (or of its last removed model). A dropped Marker keeps its current controller (Sticky) until
  retaken (RULING R17-8). Check (c) whenever Engagement or Supply changes.
- Scoring at the end of Round 5 only (plus Supply destroyed every Round): Standard 4 VP (Skirmish 3)
  for each of your Units carrying a Marker and Wholly Within your own Zone of Influence; Standard 2 VP
  (Skirmish 1) for each Marker of your own colour that no Enemy Unit is carrying (Red counts 1 and 3,
  Blue 2 and 4; Skirmish has only 1 and 2; Marker 5 counts for no one). [MSN-060..066]

**Engine notes.** Missions are data: `MissionDef = {id, name, scale, startSupply, escalation, gameLength,
specialWinLead|null, markerStart:'active'|'inactive', startOfRound:[MarkerActivation], scoring:[Rule],
actions:[MissionAction], tiebreaker:null, version, source}`. Scoring rules use a small fixed vocabulary
(`supplyDestroyed`, `perControlledMarker{filter, vp, fromRound}`, `retakeBonus`, `quarters`,
`markerControlled{n, vp}`, `activatedMarkerCash`, `claimCarriedInZone`, `ownMarkersNotClaimed`), each
one engine function, so a new card is a data edit.

## 8. Deployment Cards (CS1-T p.13-14, identical on all Wave 1 sheets; CS2-P p.4)
Coordinates in our frame (section 2). Zones = 6" rectangles inward from each listed segment (section 6).

### 8.1 Skirmish (36 x 36)
| Card | Red Entry Edge | Blue Entry Edge | Markers (x, y) |
|---|---|---|---|
| Abandoned Camp | S full (x 0-36) | N full (x 0-36) | 1 (6, 18); 2 (30, 18); 5 (18, 18) |
| Agria Valley | N x 0-12 + W y 24-36 (corner L) | S x 24-36 + E y 0-12 (corner L) | 1 (6, 6); 2 (30, 30); 5 (18, 18) |
| Dirt Side | N x 0-12 + W y 24-36 | S x 24-36 + E y 0-12 | 1 (6, 18); 2 (30, 18); 5 (18, 18) |
| Char Plains | S x 18-36 | N x 18-36 | 1 (6, 6); 2 (6, 30); 5 (24, 18) |
| Frontier | N x 12-24 and S x 12-24 | W y 12-24 and E y 12-24 | 1 (6, 6); 2 (30, 30); 5 (18, 18) |
| Green Valleys (Wave 2) | W y 30-36 and E y 12-24 | W y 12-24 and E y 0-6 | 1 (12, 6); 2 (24, 30); 5 (18, 18) |

### 8.2 Standard (54 x 36)
| Card | Red Entry Edge | Blue Entry Edge | Markers (x, y) |
|---|---|---|---|
| Gauntlet | N full (x 0-54) | S full | 1 (12, 24); 2 (42, 12); 3 (36, 24); 4 (18, 12); 5 (27, 18) |
| Typhoon | N x 30-54 + E y 18-36 (corner L) | S x 0-24 + W y 0-18 (corner L) | 1 (18, 24); 2 (6, 30); 3 (48, 6); 4 (36, 12); 5 (27, 18) |
| Acropolis | N x 0-18 and S x 36-54 | N x 36-54 and S x 0-18 | 1 (12, 24); 2 (42, 24); 3 (42, 12); 4 (12, 12); 5 (27, 18) |
| Proving Grounds | W full (y 0-36) and E full | N x 18-36 | 1 (12, 24); 2 (36, 12); 3 (42, 24); 4 (18, 12); 5 (27, 24) |
| Breach | E full (y 0-36) | W full | 1 (18, 30); 2 (36, 30); 3 (36, 6); 4 (18, 6); 5 (27, 18) |
| Meeting Engagement (Wave 2) | S x 18-36 and E y 12-24 | N x 18-36 and W y 12-24 | 1 (12, 24); 2 (42, 12); 3 (42, 24); 4 (12, 12); 5 (27, 18) |
Notes: Proving Grounds' blue segment is drawn centred but not dimensioned; x 18-36 is measured from the
card art (RULING R17-9). Marker 5 sits off the table centre on only two cards: Proving Grounds (y 24)
and Char Plains (x 24). [DEPL-001..012]

Worked zone examples: Agria Valley Red zone = rect x 0-12, y 30-36 plus rect x 0-6, y 24-36. Typhoon
Blue zone = x 0-24, y 0-6 plus x 0-6, y 0-18. Frontier Blue zone = x 0-6, y 12-24 plus x 30-36,
y 12-24.

## 9. First battle setup (R p.7-29 Part 1 worked example; HANDOFF first slice)
The rulebook's learn-to-play battle (and our default "First Battle" preset and golden test):
- Mission Frontlines, Deployment Abandoned Camp, chosen by agreement (no draft). Scale Skirmish (36x36):
  the Round 1 limit of 3 Supply and Round 2's 1 extra Available Supply match Frontlines Skirmish
  (Start 3, +1) (R p.11, p.18). Terrain placed by agreement (Grass, a Size 1 statue head and walls
  appear in the narrative, R p.19-20, p.24).
- Terran: 6 Marines with AGG-12 (replaces one C-14) and Rocket Launcher (SIDEARM, added to a C-14
  model); 6 Marines; 2 Marauders; 3 Medics; Tactical Card Barracks; Faction Card Terran Armed Forces.
- Zerg: 12 Zerglings with Shredding Claws (all models); 12 Zerglings; 3 Roaches with Burrow Ambush;
  1 Queen; Tactical Card Roach Warren; Faction Card Zerg Swarm; special card Accelerating Creep.
- Roll-Off for the First Player Marker (Zerg wins 7 vs 5 and gives it to Terran, R p.8).
- Colours are not stated in the example: our preset lets the draft Roll-Off pick them (RULING R17-10).
- GAP: no separate starter-set or Quick Start first-battle scenario was found. Searched: QS (all 10
  pages), R Part 1 and Part 9, OP, F, all card sheets. The Founders Edition set manual is not in
  `docs/sources/` (the saved downloads page is the 22,770-byte waiting-room page). Unit stats and costs
  for the preset come from the card sheets and CT, never from this narrative.

## 10. Rulings and gaps
- R17-1: Setup order follows 9.3 (terrain, then Markers), not the 12.1 summary (Confirmed by R p.80 9.3).
- R17-2: Card geometry is used exactly as printed; no rotation or mirroring; OP's "perspective" choice is
  only a seat choice and has no digital effect (Unsourced).
- R17-3: Draft cards must match the agreed Engagement Scale (each card prints its scale) (Unsourced).
- R17-4: Supply Drop scores any Activated Marker you control by Sticky Control, even with no Unit near
  (literal card text plus R p.71 8.9.1) (Unsourced).
- R17-5: Gather needs only "Unengaged" and "Within 3" of a Marker you control"; no LoS, elevation or
  Coherency test; any number of Units may Gather (literal card text) (Unsourced).
- R17-6: Divide and Conquer quarters use the centre lines; a Unit "controls" a Marker when its player
  controls it and the Unit could contest it; +1 once per Unit; Flying Units count Supply in quarters
  (Unsourced).
- R17-7: Artefact Hunt CLAIMs happen between Scoring steps 1 and 2, marker holder first (Unsourced).
- R17-8: A dropped Artefact Hunt Marker keeps its last controller until retaken (Sticky Control)
  (Unsourced).
- R17-9: Proving Grounds Blue edge x 18-36 measured from the card art (Unsourced).
- R17-10: First Battle preset colours come from the draft Roll-Off (Unsourced).
- GAP: Grand Offensive Mission/Deployment Cards (none in any source).
- GAP: official map terrain positions (section 3).
