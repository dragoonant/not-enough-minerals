# 14 Measuring, Line of Sight, terrain, movement and coherency

Covers distances, Within / Wholly Within, bases and stands, Size and Effective Size, terrain types, elevation and
ACCESS POINTS, Line of Sight and Cover, movement constraints, Gap Clearance, Engagement geometry, coherency and
Flying units. Dice and attacks are in `13-dice-and-attacks.md`.

Citation key: **R p.N** = PDF page marker `=== PAGE N ===` in `StarCraft-TMG_EN.txt` (printed page + 2).
**QS** = Quick Start, **F** = FAQ v1.1, **CL** = Changelog 10.2026 (cost-only; nothing here changes, CL p.1-2),
**CS1/CS2** = card sheets. Rule IDs in brackets are for the rules checklist. All text is our own summary.

## 1. Measuring distances (R p.35 4.1; QS p.3)
- All distances are inches. Pre-measuring is allowed at any time, by either player, for anything. [MEAS-001]
- **Model to model:** nearest point of one base to nearest point of the other. Overhanging weapons, wings,
  limbs and scenery are ignored. Touching bases are 0" apart (so also Within 1"). [MEAS-002]
- Model to terrain: nearest base point to the nearest edge of the terrain footprint. Tokens and markers:
  nearest physical edge. [MEAS-003]
- **Elevation:** distances between models at different heights are always horizontal (top-down); vertical
  difference never counts. This covers Range, Engagement Range and ability ranges, and distances inside one
  unit (coherency). Movement distance follows the action's own rule (section 8). [MEAS-004]
- A unit is always Within range of itself for its own abilities unless the rule says otherwise (F p.4). [MEAS-005]
- **Engine notes:** world units = inches; positions are 2D (x, y) plus an elevation tag. `dist(a, b) =
  max(0, |ca - cb| - ra - rb)` for circular bases; terrain/token distance uses polygon-to-circle distance.

## 2. Within and Wholly Within (R p.36 4.2; R p.93 WITHIN, WHOLLY WITHIN; QS p.2)
- **Within X":** any part of the model's base touches or enters the range. A unit is Within if at least one of
  its models is. [MEAS-010]
- **Wholly Within X":** the entire base is inside the range. A unit is Wholly Within only if every model is.
  Used by coherency, some ability areas and charge distance. [MEAS-011]
- **Engine notes:** for a circular base vs a range measured from a base: Within iff `dist <= X`; Wholly Within
  iff `dist + 2*r_model <= X` measured from the same source edge (i.e. far edge inside). Use a 1e-6 epsilon.

## 3. Bases, stands and base sizes (R p.30 2.3; R p.42 5.2 item 18; QS p.2; CS1/CS2)
- All rules see only the base: measuring, LoS, contact, overlap. Pose and scenic basing never matter; a Marine
  on a rubble base is no taller; a tall flight stand gives no extra Size. [BASE-001]
- Each model uses the base size printed on its Unit Card. [BASE-002]
- **No overlap:** bases may never overlap each other or impassable terrain; a model that cannot be set without
  overlap cannot go there. [BASE-003]
- **Flight stands:** the bottom of the stand is the base for all measuring and positioning. [BASE-004]
- **Wobbly models:** if a model cannot sit flat, it occupies the agreed position for all purposes. On HIGH
  GROUND too small for its base: the base centre must stay on the High Ground and the base may overhang the
  edge by the minimum needed (F p.2). [BASE-005]
- Base diameters seen on CS1/CS2 cards: 32, 40, 50, 80, 100, 150 mm (round). In inches (mm / 25.4): 1.26,
  1.575, 1.969, 3.150, 3.937, 5.906. Per-unit values belong in the unit data (M1), each with a `source`.
  GAP: the starter box listing mentions oval bases (SC-SOURCES, web only); no card sheet shows one. Treat all
  bases as circles until a card says otherwise.
- **Engine notes:** `Base = {radiusIn, shape:'circle'}`; Wobbly overhang is allowed only for the HIGH GROUND
  case: placement test = centre inside the surface polygon instead of full containment.

## 4. Size, Effective Size and terrain types (R p.41 5.1 item 7; R p.50 7.1.2; R p.59 8.5.3; R p.80 9.3; R p.84 BLOCKING TERRAIN; R p.86 EFFECTIVE SIZE; R p.88 IMPASSABLE; R p.87 GRASS; R p.54 table)
### 4.1 Model Size
- **Size** = a model's vertical height category, used for LoS and terrain interaction. Cards in CS1/CS2 show
  Size 1, 2 and 3. BURROWED models count as Size 0 for all purposes (R p.84). [SIZE-001]
- **Effective Size (ES)** = model Size + Size of the terrain it stands on. At GROUND LEVEL, ES = Size. Terrain
  set on MID or HIGH GROUND stacks the same way (terrain ES = own Size + Size of what it stands on). [SIZE-002]
- Flying models: for Cover, ES counts as higher than any terrain piece on the table; terrain never adds to a
  Flying model's ES (R p.51 7.1.4; R p.87 FLYING). [SIZE-003]
- RULING: a base resting on several pieces uses the highest piece (matches the elevation rule, section 5).

### 4.2 Terrain Size categories
| Terrain Size | Typical pieces (R p.80) | Movement | LoS |
|---|---|---|---|
| 0 | scatter; Tokens are Size 0 terrain with their own base (R p.55 7.3.1) | pass through freely; cannot end overlapping the footprint | never Blocking at GROUND LEVEL (ES 0); stacked on raised terrain its ES rises |
| 1 | barricades, low walls, crates; ramps (MID GROUND) | pass through freely; cannot end overlapping, except standing on it via ACCESS POINTS (ramps) | Blocking Terrain (ES >= 1) |
| 2 | ruins, bunkers, wrecks | cannot move through | Blocking Terrain |
| 2 GRASS | grass patches | does not block movement; destroyed on contact (section 8.4) | Blocking Terrain |
| 3+ | HIGH GROUND structures | cannot move through; may climb only via ACCESS POINTS | Blocking Terrain |
- **Blocking Terrain** = any piece with ES >= 1; whether it actually blocks a trace is decided by Cover
  (section 6). Whether a model may cross it is decided separately by movement rules. [TERR-001]
- **IMPASSABLE TERRAIN** = a piece with no ACCESS POINT linking it to an adjacent elevation. Models cannot move
  through, onto or across it, nor end overlapping it; Size 0 and 1 pieces can still be moved through. [TERR-002]
- Long walls on official layouts are several independent pieces (F p.2). [TERR-003]
- Unit abilities alter these: e.g. CS1 Raptor Strain (move through Impassable terrain of Size 4 or less and
  change elevation without ACCESS POINTS), CS2 LARGE (3" gaps; removes Size 0-1 Impassable pieces it crosses or
  ends on, Tokens excepted), Force Field tokens (Size 2 or lower cannot cross; Size 3+ may cross and remove it;
  PLACE does not remove it, F p.4). [TERR-004]
- **Engine notes:** `TerrainPiece = {id, footprint: Polygon, size, kind: 'solid'|'grass'|'ramp'|'token',
  standsOn?: pieceId, walkableTop: boolean, accessPoints: Segment[], openings: {segment, width, losOpen:false}[]}`.
  `effSize(piece) = size + effSize(standsOn)`. Maps are authored data; the density guide (section 12) is a
  validator for generated maps.

## 5. Elevation and ACCESS POINTS (R p.59 8.5.3; R p.86 ELEVATION LEVEL; R p.84 ACCESS POINT; R p.87-89 GROUND LEVEL, HIGH GROUND, MID GROUND; F p.2-3)
- Three levels: **GROUND LEVEL** (on the playmat), **MID GROUND** (on horizontal terrain of Size 1-2),
  **HIGH GROUND** (on horizontal terrain of Size 3+). A base spanning levels counts as the highest. [ELEV-001]
- Ground (Combat Tag) and GROUND LEVEL (elevation) are different: a Flying unit on the mat is at GROUND LEVEL
  but is not Ground (R p.31 note). [ELEV-002]
- Models change elevation **only** by moving through an ACCESS POINT (ladder, portal, door, ramp end). Coherency
  links may pass through ACCESS POINTS, so non-leading models may be set onto High Ground from an ACCESS POINT
  without their own move (F p.2). [ELEV-003]
- **Ramps** are Size 1 MID GROUND terrain with two ACCESS POINTS (bottom, top). A model anywhere on a ramp is at
  MID GROUND. Models cannot cross a ramp freely: they enter and leave only through its two ACCESS POINTS, and
  may end on it. [ELEV-004]
- Ground units cannot move directly between unconnected High Grounds (F p.2). The edge of a High Ground piece
  counts as Impassable for Gap Clearance (F p.2). [ELEV-005]
- Deploying: a unit may deploy straight onto High Ground that touches its Entry Edge (legal and in coherency),
  but never onto a different elevation than an Omega Worm/Pylon base it deploys from (F p.3). [ELEV-006]
- Flying units ignore elevation and never use ACCESS POINTS (R p.87). [ELEV-007]
- **Engine notes:** the walkable world is a graph of surfaces (mat + each `walkableTop` piece); edges between
  surfaces exist only at `accessPoints`. A model's elevation = level of the highest surface under its base.

## 6. Line of Sight (R p.47 7.1; R p.88-89 LINE OF SIGHT; R p.93 VISIBLE; QS p.7)
- 2D top-down system. Model A sees model B if **some** straight line from any part of A's base to any part of
  B's base avoids every terrain piece that blocks under Cover (section 7). If a trace crosses no Blocking
  Terrain at all, B is Visible with no further check. [LOS-001]
- Terrain crossed by a trace that meets neither Full Cover nor Direct Cover does not block. [LOS-002]
- LoS is mutual: if A sees B, B sees A by the same trace. [LOS-003]
- Footprint = the piece's physical base, or its outermost solid edges from above if it has no base. Gaps,
  windows, doorways and open interiors inside the footprint **block** LoS unless agreed at setup; an opening may
  be passable for movement yet closed for LoS. [LOS-004]
- Only terrain that rises between the two positions can block; the surface a model stands on never blocks its
  own traces (R p.50 7.1.2). [LOS-005]
- Models never block LoS. GAP: searched R 7.1, Part 11 (LINE OF SIGHT, VISIBLE, BLOCKING TERRAIN) and QS;
  no rule makes models block, so none do.
- HIDDEN units are not Visible to any model more than 4" away, whatever the LoS (R p.93 VISIBLE). [LOS-006]
- Mission Markers: for LoS treat the marker as Size 0 (R p.71 8.9.1). Markers otherwise have no physical presence
  and never block LoS or movement (R p.55 7.3.2). [LOS-007]
- **Engine notes:** `visible(a, b)`: (1) HIDDEN 4" filter; (2) if Elevation Dead Zone applies (section 7.3) ->
  false; (3) build `S` = pieces that qualify for Full or Direct Cover against this pair (minus pieces either model
  stands on, minus Close Quarters exemptions); (4) return true iff some segment from disc A to disc B misses every
  polygon in `S`. Step 4 samples K points on each base rim plus centres (K = 16 default) and also tests the two
  outer tangent lines; cache per (pair, terrain version). Grass removal bumps the terrain version.

## 7. Cover (R p.48-49 7.1.1; R p.50 7.1.2; R p.51 7.1.3-7.1.4; R p.52-54 tables; F p.2)
Each terrain piece is judged alone: pieces never add their sizes or proximity together. If no single piece meets
Full or Direct Cover, LoS is not blocked however many pieces the trace crosses. [COV-001]
### 7.1 Full Cover
- A piece blocks LoS if its ES >= the ES of **both** models. [COV-010]
### 7.2 Direct Cover
- A piece blocks LoS if the trace crosses it **and** either model is Within 1" of it **and** the piece's ES >=
  the ES of **that** model (the one Within 1"). [COV-020]
- The model only needs to be Within 1" of any part of the piece, not of the part the trace crosses (F p.2). [COV-021]
### 7.3 Elevation Dead Zone
- A model on HIGH GROUND (Size 3+) and a model at GROUND LEVEL Within 1" of the base of **the same** terrain piece
  the first stands on cannot see each other (both directions). [COV-030]
### 7.4 Close Quarters
- If both models are Within 1" of the same terrain piece **and** Within 3" of each other, Direct Cover and the
  Dead Zone are ignored; resolve LoS by the standard trace. [COV-040]
- RULING: the exemption applies only to that shared piece; Full Cover is still checked (it is part of the
  standard trace). Other pieces are judged normally.
### 7.5 Flying models
- Any check to or from a Flying model ignores Full Cover. Direct Cover and the Dead Zone still apply. A Flying
  model's ES beats any terrain, so it never gets Direct Cover as the model Within 1"; but the other (ground)
  model's Direct Cover or Dead Zone still blocks the pair. [COV-050]
### 7.6 HIGH GROUND Cover (Evade)
- If **every** model of a unit stands on HIGH GROUND (Size 3+) with any part of its base, the unit may make an
  Evade Roll against **Ranged Attacks from a lower elevation**. An attack comes from lower elevation if at least
  one model of the attacking unit is not standing on HIGH GROUND with any part of its base. [COV-060]
- Flying units never get this cover, and attacks made by Flying units never count as from lower elevation. [COV-061]
- RULING: the R p.53 summary table says "Wholly Within HIGH GROUND"; the R p.51 rule text says "any part of their
  bases". We follow the rule text (it also matches the base-on-several-levels rule). Status Unsourced.
- RULING: "attacking unit" means all of its models on the table, not just the Batch's firing models (literal).
- **Engine notes:** `coverQualifies(piece, a, b)` returns `full | direct | none` given ES values and Within-1"
  checks; Dead Zone and Close Quarters are pair-level predicates evaluated first. HIGH GROUND Cover is a separate
  `evadeGrant` source consumed by `13` step 4.

## 8. Movement constraints (R p.58-60 8.5.3; R p.37-39 4.3, 4.5, 4.6; R p.41 5.1 item 2; F p.2)
### 8.1 Speed
- Speed = maximum distance the Leading Model travels in a standard Move. Split value "4/7": use the second only
  when the unit is down to one model or started with one. Speed "-": the unit cannot move or be repositioned by
  any means (PLACE and involuntary moves included). [MOVE-001]
- A Move or Run must actually change position; 0" counts as a Hold instead (F p.2). [MOVE-002]
### 8.2 Leading Model (step 1)
- Nominate a Leading Model for any Move, Deploy, Run, Charge, Disengage, Close Ranks or other repositioning
  rule; it moves first along a measured path; its nomination ends when the action resolves. Its unit's Size sets
  Gap Clearance. [MOVE-010]
- Up to Speed along the actual path; no part of its base may travel more than Speed. [MOVE-011]
- May pass through models of its own unit; may not pass through enemy models or other friendly units' models.
  Ground models pass through Flying bases and vice versa as if absent. [MOVE-012]
- Cannot move through terrain of Size 2+ (Grass excepted); obeys Gap Clearance; changes elevation only through
  ACCESS POINTS. [MOVE-013]
- Must end with its whole base on the battlefield, not overlapping terrain or another base, and not Within 1"
  of an enemy Ground unit (Charge and abilities may override). [MOVE-014]
- RULING: "through" Size 2+ terrain means crossing its footprint below its top surface; a model standing on a
  walkable top moves across that surface freely, with the surface edge acting as Impassable except at ACCESS POINTS.
### 8.3 Other models (step 2)
- Pick up the rest and **set** them In Coherency (section 10). Being set, not moved, they may ignore obstacles in
  between, but each must end legally: no overlap, whole base on the table, not Within 1" of an enemy unit. [MOVE-020]
- RULING: "enemy unit" in 8.2/8.3 means enemy **Ground** units for Ground movers; Flying movers instead must
  end at least 1" from enemy Flying units (section 11).
### 8.4 Terrain interactions [MOVE-030]
- Size 0 and 1: pass through freely, cannot end overlapping (unless standing on a walkable top reached via an
  ACCESS POINT).
- GRASS (Size 2): passable. If the Leading Model's path crosses it, or any model of the unit ends on it, during
  Move, Deploy, Run, Charge, Disengage or Close Ranks, the piece is removed for the rest of the game (never
  restored). Flying units passing over do not destroy it; a Flying model ending on it does (R p.87 GRASS).
  RULING: PLACE is not movement and does not destroy Grass (by analogy with F p.4 Force Field and F p.5 Creep).
- Size 2+: cannot move through.
### 8.5 Gap Clearance (R p.39 4.6; F p.2)
- A gap is any space between terrain pieces **or models** that the path goes through. Leading Model of a unit of
  Size 2 or lower needs a gap of at least **1"**; Size 3+ needs at least **3"**. Applies to Move, Run, Charge,
  Disengage and Close Ranks. [MOVE-040]
- Openings in terrain (arches, doors, breaches) are gaps if agreed passable at setup, even inside Size 2+ pieces;
  width must suit the Size. [MOVE-041]
- Clearance governs passing through only: a model still cannot be set where its base does not physically fit. [MOVE-042]
- Flying units ignore Gap Clearance (point to point) but must end where the base or stand fits without
  overlapping another model's base/stand or terrain. [MOVE-043]
### 8.6 Directly towards / directly away (R p.39 4.5; F p.2)
- Follow the line from the acting model's base centre through the target base centre; go round blockers by the
  shortest route then resume the line (ties: controlling player picks). Towards: may not end further away than
  it started; away: may not end closer. The Leading Model must move the full possible distance (F p.2). [MOVE-050]
- Multi-model unit: Leading Model = the model with the shortest route to the target; others set as close to
  (towards) or far from (away) the target as coherency allows. Target unit with several models: aim at the
  closest (towards) or furthest (away) model. [MOVE-051]
- Any involuntary move that would leave the table stops in contact with the table edge. [MOVE-052]
### 8.7 PLACE, Stationary
- PLACE (X): the Leading Model is lifted and set Wholly Within X" of its start, ignoring Gap Clearance and
  elevation; others reset in coherency; must end legal and outside enemy Engagement Range, except PLACE in the
  Assault Phase may end inside it (unit becomes Engaged) (R p.90). [MOVE-060]
- Any move, being moved or PLACE removes Stationary status (R p.92). [MOVE-061]
- **Engine notes:** one `moveUnit(unit, opts)` serves Move/Run/Deploy/Disengage/Charge/Close Ranks/forced moves.
  Path search runs on the base centre over the current surface graph; obstacles (Size 2+ footprints, surface
  edges, foreign bases) are inflated by `clearance/2` (0.5" or 1.5") for transit, and the end pose is checked with
  full-radius inflation, so a gap of width w is passable iff w >= clearance. Path length of the centre = distance
  travelled by every base point. Grass hit test uses the swept path plus end poses.

## 9. Engagement geometry (R p.55 7.2, 7.2.1; R p.86 ENGAGED, ENGAGEMENT RANGE; R p.93 UNENGAGED)
- Engagement Range = 1" horizontally from a base. Two enemy models Within 1" are Engaged only if all hold:
  both Ground (Flying are never Engaged); no Size 2+ terrain between them (Size 0-1 does not block); not one on
  HIGH GROUND and the other at GROUND LEVEL; a MID GROUND model engages a HIGH GROUND or GROUND LEVEL model only
  if both are adjacent to the same ACCESS POINT joining their levels. [ENG-001]
- If any model of a unit is Engaged with any model of an enemy unit, both units are Engaged. [ENG-002]
- Unless a rule says otherwise, no unit may end movement or be PLACEd Within an enemy model's Engagement
  Range. [ENG-003]
- RULING: "between" = the shortest segment joining the two bases crosses the piece's footprint; Grass, being
  Size 2, blocks Engagement until removed (literal); "adjacent" to an ACCESS POINT = Within 1" of it.
- **Engine notes:** `engagedPairs()` is recomputed after every reposition or removal and cached; unit-level
  `engagedWith: Set<unitId>` derives from it and feeds targeting (`13` 5.2), casualty priority (`13` 7.3) and the
  Combat Phase loop.

## 10. Coherency (R p.37-38 4.3, 4.4; R p.60 8.5.5; F p.2; QS p.5)
- Checked at the **end** of every repositioning action: Move, Deploy, Charge, Disengage, Close Ranks, Run,
  PLACE, SUMMON. [COH-001]
- **In Coherency** = every model Wholly Within **3"** of the Leading Model **and** able to trace a valid
  Coherency Link to it. Unit abilities may change the distance (e.g. CS1 Squadron: 4"). [COH-002]
- **Setting:** place the Leading Model first, then each other model one at a time (controlling player's order and
  positions) Wholly Within 3" and linked. If terrain or crowding prevents a 3" spot, set the model as close as
  possible to the Leading Model, still linked: the unit is then **Out of Coherency**. [COH-003]
- A model that cannot be set anywhere legal **with** a valid link is removed as a casualty immediately. [COH-004]
- **Coherency Link** = a chain of imaginary lines model to model through models of the same unit. It cannot
  pass through other units' models, terrain, or gaps the Leading Model could not pass; it may pass through enemy
  models the unit is currently Engaged with and through ACCESS POINTS. It may pass through anything the Leading
  Model can legally traverse (F p.2: Raptors link through Impassable terrain). Flying units' links ignore terrain
  and other units' models. [COH-005]
- Status persists: a unit In Coherency stays so until its next repositioning action; casualties never trigger a
  check or break coherency (F p.2). Out of Coherency only if the last repositioning action failed the test. Out of
  Coherency units cannot control or contest Mission Markers. [COH-006]
- Deploy may never end Out of Coherency: if every model cannot be placed legally and coherent, the unit cannot
  deploy there (R p.57 8.3.3; R p.60 8.5.5). [COH-007]
- RULING: a link segment between two same-unit models is valid if some straight line between their bases avoids
  every blocker listed above; there is no per-segment length limit beyond the 3" Wholly Within test (none stated).
- **Engine notes:** `coherencyState(unit)` = BFS over same-unit models from the Leading Model using the
  segment-validity test; stored as `unit.inCoherency` at the end of the action only. The placer for step 2 is a
  greedy ring search around the Leading Model that prefers spots satisfying the action's priority list (Charge:
  base-to-base > in range > close; Close Ranks: enemy contact > friend contact in range).

## 11. Flying units (R p.60 FLYING MOVE; R p.87 FLYING; R p.51 7.1.4; R p.66 8.7.6; R p.69 8.8)
- Move point to point, measured horizontally, ignoring terrain and models in between; no Gap Clearance; no
  elevation, no ACCESS POINTS; links ignore terrain and other units. [FLY-001]
- Never Engaged; may end in base-to-base contact with Ground units with no effect; must end at least 1" from
  every enemy Flying unit. Cannot Charge or be Charged; no Combat Phase; cannot contest or control Mission
  Markers. [FLY-002]
- LoS/Cover per section 7.5; no HIGH GROUND Cover; their attacks never count as from lower elevation. [FLY-003]
- Templates: Flying models have no elevation level (see `13` section 9). Grass: see section 8.4. [FLY-004]
- **Engine notes:** a `flying` flag switches the path search to a straight segment and swaps the end-pose
  checks; everything else reads the flag through the same predicates.

## 12. Tokens, markers and the battlefield (R p.55-56 7.3; R p.80 9.3; R p.94 12.1; QS p.3)
- **Tokens** (Creep Tumor, Corrosive Bile, Shades, Force Field): Size 0 terrain with their own base; models move
  through but cannot end overlapping unless stated; removed at End of Round unless STAY IN PLAY; measure to their
  nearest base edge. DISPLACEMENT tokens/models may be overlapped and are then pushed into base contact (R p.85-86). [TOK-001]
- **Markers** have no physical presence. Mission Markers are 32 mm across (Activated/Deactivated sides); may sit
  on MID or HIGH GROUND but never on Impassable terrain (terrain is shifted off the coordinates). [TOK-002]
- Table: 36" x 36" (Skirmish) or 36" x 54" (Standard) (QS p.3). [TABLE-001]
- Terrain setup: pick or roll a pre-made map (D6 Standard, D3 Skirmish) or alternate placement. Density guide for
  a Standard table (scale for others): 8-12 pieces: 0-2 Size 0, 2-4 Size 1, 6-8 Size 2, 1-2 Size 3+ if available,
  4-6 Grass; each quarter at least 2 pieces of Size 2+; at least one significant piece Within 6" of centre; at
  least two clear fire lanes 6"+ wide edge to edge; every standable Size 3+ piece has an ACCESS POINT reachable
  from GROUND LEVEL without crossing other Size 2+ terrain; R p.94 also asks for at least 3" between major
  structures. [TABLE-002]
- GAP: pre-made map layouts sit on the last pages of R as images; coordinates are not in the extracted text
  (searched R p.80, tail pages). Author our maps as data and validate them with TABLE-002.
- **Engine notes:** `validateMap(map)` implements TABLE-002 as warnings; Mission Marker placement shifts
  overlapping Impassable pieces as R p.80 says.
