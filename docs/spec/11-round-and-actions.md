# 11 The round, activation and actions

Rule IDs in brackets map to `12-rules-test-checklist.md`. Citation format and terms: `10`. Geometry
(distances, Within, Engaged) is the single geometry module from `10` section 4. Movement internals (Gap
Clearance, terrain, elevation), attack resolution (pools, Surge, casualties) and keyword effects belong to
their own rules specs; this file owns the sequence: who acts, when, with which action, and what changes
state between steps. CL 10.2026 changes nothing here (CL p.2, costs only).

## 1. Game length and round structure (R p.56 8.1; R p.44 5.5; QS p.6)
- A game lasts the Mission Card's Game Length in Rounds: 5 on most cards, 4 on Divide and Conquer
  (both scales) and Supply Drop (Skirmish) (CS1-T p.11-13). R calls 5 the usual maximum. [RND-001]
- Each Round runs four Phases in fixed order: (1) Movement, (2) Assault, (3) Combat, (4) Scoring &
  Cleanup. No Phase is ever skipped; a Phase with no eligible Units ends at once with both players
  passing. [RND-002]
- The game can also end early in step 3 of any Scoring Phase (section 9.3). [RND-003]

**Engine notes.** `state.round` (1-based), `state.phase` in `{movement, assault, combat, scoring}`,
`state.gameLength` copied from the Mission record. One phase driver advances round/phase; Phases 1-3 share
the alternating-activation loop of section 5, parameterised by an `eligible(unit, phase)` predicate and an
`actions(unit, phase)` list.

## 2. Start of the Round (R p.58 8.4; R p.92 Part 11 STATIONARY; F p.2)
At the start of Phase 1 of every Round, in this order:
1. Mission start-of-round steps (e.g. Supply Drop activates a Mission Marker). These resolve before any
   initiative Roll-Off (F p.2: the marker roll comes before the "Priority Roll"). [RND-010]
2. Pending initiative Roll-Off, if any (Round 1: the pre-game Roll-Off of section 3; later Rounds: the
   tie Roll-Off of section 9.6). See RULING R11-1. [RND-011]
3. Every Unit gains STATIONARY (lost when any model moves, is moved or is PLACEd). [RND-012]
4. Supply Pool escalation (section 4). [RND-013]
5. All "Start of the Round" abilities: the First Player Marker holder resolves all of theirs first, then
   the opponent; each player orders their own; each resolves fully before the next. [RND-014]
6. Recompute Available Supply for both players. [RND-015]

**Engine notes.** A fixed `startOfRound` pipeline of hook points (`mission.startOfRound`, `initiative`,
`statuses`, `supply`, `abilities('startOfRound')`). Any choice (order of own effects, ability targets)
is a `PendingDecision` for the owning seat.

## 3. Initiative: the First Player Marker (R p.56 7.3.2; R p.57 8.2.1-8.2.2; R p.74 8.9.6; R p.87 Part 11)
- Pre-game: Roll-Off (both roll 2D6, higher total wins, re-roll ties; R p.33 3.2). The winner gives the
  marker to either player (themselves or the opponent) for Round 1. [INIT-001]
- The holder decides which player activates first at the start of each of Phases 1, 2 and 3; then
  players alternate. [INIT-002]
- First to Pass in Phase 1 takes the marker for Phase 2; first to Pass in Phase 2 takes it for Phase 3.
  Passing in Phase 3 does not move the marker (Part 11 entry limits the transfer to Phases 1 and 2; QS p.6
  describes Passing for Movement and Assault only). RULING R11-2. [INIT-003]
- Taking the marker happens at the moment of the first Pass; it governs the next Phase's first-activation
  choice. It also decides, from then on, who resolves first in any tie of simultaneous non-active
  effects (F p.4). [INIT-004]
- Phase 4: the holder initiates each step (R p.71 8.9). [INIT-005]
- End of Round (step 6 of Phase 4): fewer total VP takes the marker; tied VP -> Roll-Off, winner takes it.
  Taking it means holding it (the holder still chooses who goes first in each Phase). [INIT-006]

**Engine notes.** `state.firstPlayer` (seat). `state.firstPasser[phase]` records who passed first; on
phase change, Phases 1->2 and 2->3 copy it to `firstPlayer` (if anyone passed; see R11-3), 3->4 does not.
"Who goes first" is a `PendingDecision{seat: firstPlayer, kind: 'chooseFirstActivator'}` at the start of
Phases 1, 2 and 3.

## 4. Supply Pool and Available Supply (R p.46 6.2; R p.57 8.3; QS p.5-6)
- Round 1 Pool = Mission Starting Supply. Each later Round adds the Supply Escalation value at the start
  of the Round: Pool(r) = Start + Escalation x (r - 1). [SUP-001]
- Final Round (r = Game Length): the Pool is unlimited; every Unit left in Reserves may Deploy with no
  Supply check, still one per turn by alternating activation. [SUP-002]
- Available Supply = Pool - sum of Current Supply Value of the player's Units on the table, recomputed
  after every action and every casualty. Units in Reserves count 0. [SUP-003]
- A Unit may Deploy only if its Current Supply Value <= Available Supply (a Supply 0 Unit can always
  pass this check). [SUP-004]
- Hard cap: the on-table total may never exceed the Pool (outside the final Round). SUMMON and every other
  arrival obey the same check (R p.92 Part 11 SUMMON). [SUP-005]
- Casualties and destroyed Units free Supply immediately. A Unit returned to Reserves releases its
  Supply at that moment (R p.61 8.5.5). [SUP-006]
- Worked check (R p.11, p.18): Frontlines Skirmish (Start 3, +1): Round 1 Pool 3, Round 2 Pool 4; a
  player with 3 Supply on the table has 1 Available in Round 2.

**Engine notes.** `supplyPool(state, seat)` is derived, never stored: `round === gameLength ? Infinity :
start + esc * (round - 1)`. Pool modifiers from cards (if any) are additive hooks on this function.

## 5. Alternating activation and passing (all of Phases 1-3) (R p.56 8.2; R p.57 8.2.1)
1. The player chosen by the marker holder becomes Active Player. [ACT-001]
2. On a turn the Active Player either activates exactly one eligible Unit, which performs exactly one
   action from that Phase's list, or Passes. [ACT-002]
3. A player may Pass even with eligible Units left (Phases 1-2). A player with no eligible Unit must
   Pass. [ACT-003]
4. Once a player has Passed they activate nothing more this Phase; the opponent keeps taking turns until
   they too Pass (or have nothing eligible). The Phase ends when both have Passed. [ACT-004]
5. Turns alternate strictly while both are still in: A, B, A, B... [ACT-005]
6. Active abilities are used only by the activated Unit, immediately before declaring its action or right
   after the action fully resolves (R p.81 10.2). Reactions follow `10` section 6. [ACT-006]
7. A Unit activated this Phase that is returned to Reserves stays Activated for this Phase
   (R p.61 8.5.5). [ACT-007]

**Engine notes.** `PendingDecision{seat: active, kind: 'activate', options: [...eligibleUnits x actions,
'pass']}`. `legalActions` is never empty: 'pass' is always present in Phases 1-2, and in Phase 3 'pass' is
the only option exactly when no eligible Unit exists. `state.passed[seat]` booleans reset per Phase.

## 6. Phase 1: Movement (R p.58-61 8.4-8.5; QS p.6-7; R p.94 12.3)
### 6.1 Eligibility and markers [PH1-001..004]
- Eligible: (a) any of the player's Units on the table with no Activation Marker; (b) any Unit in
  Reserves with no Activation Marker that can legally Deploy now (Supply fits and some legal placement
  exists; RULING R11-4).
- After the action, the Unit gets an Activation Marker, Movement face up.
- When a player Passes, every one of their on-table Units without a marker gets a Movement-face marker.
  Units still in Reserves get none and simply stay in Reserves.
- First to Pass takes the First Player Marker for Phase 2 (section 3).

### 6.2 Actions
| Action | Who | Effect | Source |
|---|---|---|---|
| Move | Unengaged Unit on the table | Leading Model moves up to Speed along a measured path; the rest are set In Coherency. Must actually change position (0" is not allowed; a 0" Move counts as Hold, F). | R p.58 8.5.2-8.5.3; F p.2 |
| Disengage | Engaged Unit | Move with standard rules; see 6.4. | R p.60 8.5.4 |
| Deploy | Unit in Reserves | See 6.3. | R p.60 8.5.5 |
| Hold | Any Unit on the table | Nothing happens; the Unit counts as Activated. | R p.58 8.5.1 |
An Engaged Unit cannot Move: its only choices are Disengage or Hold (R p.86 Part 11 ENGAGED). [PH1-010]

Move constraints (summary; full rules in the movement spec, R p.58-60 8.5.3): the Leading Model may pass
through its own Unit's models but not Enemy models or other Friendly Units (Ground and Flying ignore each
other's bases); never through Size 2+ terrain (Grass excepted: crossing or ending on it removes it,
Flying only on ending); Gap Clearance applies; elevation changes only via ACCESS POINTs; may not end
overlapping terrain or bases, partly off the table, or Within 1" of an Enemy Ground Unit; no point of its
base travels more than Speed. Other models are set (not moved) In Coherency, in legal spots, not Within 1"
of an Enemy Unit. Flying Units move point to point and must end at least 1" from Enemy Flying Units.
[PH1-011]

### 6.3 Deploy (R p.57 8.3.3; R p.60 8.5.5; F p.3; QS p.6)
1. Check Current Supply Value <= Available Supply (skip in the final Round). [DEP-001]
2. Nominate a Leading Model; it starts off the table with its base touching the player's Entry Edge (a
   coloured segment from the Deployment Card) and moves onto the table up to the Unit's printed Speed
   with standard Move rules. Abilities and terrain bonuses do not apply (no Creep bonus, no Stimpack:
   Units in Reserves have no working abilities, F p.3). [DEP-002]
3. Set the rest of the Unit In Coherency. The Unit may never end a Deploy Out of Coherency; if not every
   model can be placed legally In Coherency, that placement is illegal (choose another or another
   action). [DEP-003]
4. No model of the Unit may end Within the opponent's Zone of Influence, and the Unit may not end its
   activation there (so later abilities in the same activation cannot put it there either). This applies
   to every kind of arrival: edge, transport, SUMMON. [DEP-004]
5. Normal move restrictions apply (not Within 1" of Enemy Ground Units, etc.). [DEP-005]
6. If the Entry Edge touches HIGH GROUND, models may deploy straight onto it (F p.3). [DEP-006]
7. Place the Movement-face Activation Marker. [DEP-007]
- Deploy is a movement action for Grass, Creep removal and similar triggers (R p.88 Part 11 GRASS; F p.5).
- Units in Reserves cannot use abilities before deploying except abilities that say they work in
  Reserves or that themselves deploy the Unit (F p.3). "Nominated to deploy" means performing a Deploy
  action by any means (F p.3).
- Alternative arrival points (Omega Worm, Pylon base) count as Friendly Entry Edges but create no Zone of
  Influence; forward-deploy cards and transports only grant an exception to deploy without an edge.
  Deploying through a Pylon ends the activation at once (F p.3). Details: abilities spec.

### 6.4 Disengage (R p.46 6.2; R p.60 8.5.4; QS p.6) [DIS-001..005]
1. At declaration, record Tactical Mass: Unit's Current Supply > combined Current Supply of all Enemy
   Units it is Engaged with.
2. Move with standard Move rules (including the ban on ending Within 1" of Enemy Ground Units).
3. If the Leading Model cannot end strictly outside the Engagement Range of every Enemy Unit, the
   Disengage fails: the Unit does not move, the Leading Model is removed as a casualty, the activation
   ends.
4. Otherwise every other model that cannot be set strictly outside all Enemy Engagement Ranges is
   removed and counts as Destroyed; the rest stay.
5. Without Tactical Mass, the Unit may not Ranged Attack or Charge in this Round's Assault Phase (Run and
   Hold remain legal).
- Removals in steps 3-4 are casualties: they can lower Current Supply and score Supply-destroyed VP for
  the opponent.

### 6.5 Units returned to Reserves (R p.61 8.5.5)
Not Destroyed; Supply released at once; keeps equipment and its Damage Marker; timed effects keep
running and still expire in Cleanup; abilities inert; its non-STAY IN PLAY tokens/markers on the table are
removed; if it was Activated this Phase it stays Activated. It may Deploy again later normally. [RES-001..003]

**Engine notes.** Deploy, Move, Run, Disengage, Charge and Close Ranks are one `reposition(unit, spec)`
procedure with per-action options (`fromEdge`, `maxDistance`, `mustEndOutsideER`, `mustEngage`,
`mustEndCloser`, `allowNewEngagement`). Coherency and ZoI checks run once at the end of it.

## 7. Phase 2: Assault (R p.61-68 8.6-8.7; QS p.7-8; R p.94 12.4)
### 7.1 Eligibility and markers [PH2-001..004]
- Eligible: the player's on-table Units whose marker shows the Movement face. Units in Reserves cannot
  act; there is no Deploy in Phase 2.
- After the action, flip the marker to the Assault face.
- When a player Passes, every one of their Units still showing the Movement face is flipped to Assault.
- First to Pass takes the First Player Marker for Phase 3.

### 7.2 Actions
| Action | Who | Effect | Source |
|---|---|---|---|
| Ranged Attack | Any eligible Unit with an Assault-Phase weapon, not barred by the Disengage penalty | Batches per weapon profile; see 7.3. | R p.62-64 8.7.3-8.7.4 |
| Charge | Unengaged Ground Unit, not barred by the Disengage penalty | See 7.4. | R p.67-68 8.7.7 |
| Run | Unengaged Unit | Identical to a Movement-Phase Move (Leading Model up to Speed, rest In Coherency, all restrictions); must change position (0" = Hold, F). | R p.62 8.7.1; F p.2 |
| Hold | Any eligible Unit | Nothing; flip the marker. | R p.62 8.7.2 |
| Mission actions | As the Mission Card says (e.g. Gather, `17`) | Replace the standard action. | CS1-T p.12 |
An Engaged Unit may Ranged Attack (only at Units it is Engaged with) or Hold; it cannot Run or Charge.
[PH2-010]

### 7.3 Ranged Attack sequence (sequence only; dice pipeline in the attack spec)
1. Pick a weapon profile and a target (one Batch). Target valid if: at least one Visible model of it is
   Within the weapon's Range of an attacking model; the target's Combat Tag fits the weapon's Target
   (Ground / Flying / All); an Unengaged attacker may not pick an Engaged target (template Spillover
   excepted); an Engaged attacker may pick only Units it is Engaged with. [RA-001]
2. Every model using the same profile fires it at the same target (SIDEARM profiles likewise, but may
   choose a different target from the Unit's other weapons). Each model fires one Assault-Phase weapon.
   [RA-002]
3. Resolve that Batch fully, then declare the next Batch (no up-front declaration of all targets, F p.3).
   If a Batch destroys the only Enemy the attacker was Engaged with, the attacker becomes Unengaged and
   later Batches may target freely (R p.63 note). [RA-003]
4. Only models Within Range of a Visible target model add dice; casualties may be any Visible model even
   out of range (F p.3); Engaged targets use the Engaged casualty priority (R p.65 8.7.5); an Engaged
   target hit by a Ranged Attack gets an Evade Roll (R p.64 8.7.4 step 4). [RA-004]

### 7.4 Charge sequence (R p.67-68 8.7.7; QS p.8)
1. Declare every target Unit up front: each must be an Enemy Ground Unit. Flying Units never Charge or
   get Charged. No Line of Sight needed. [CHG-001]
2. Choose the Leading Model and nominate one model in each target Unit as its Charge target. Roll 1D6;
   Charge Roll Distance = Speed + roll, measured along the real path around impassable obstacles, with
   Gap Clearance. Reactions to the Charge (e.g. distance reductions) apply here. [CHG-002]
3. Success only if the Leading Model can be legally set: Wholly Within the Charge Roll Distance of its
   start (path-measured), Within 1" of every declared target, not overlapping bases or impassable terrain,
   and not Within 1" of any Enemy Unit that was not declared. Otherwise the Charge fails: the Unit does
   not move and its activation ends (marker flipped). [CHG-003]
4. On success set the Leading Model in base contact with the target(s) if possible, else as close as
   possible inside 1". Set the other models In Coherency (links may pass through Enemy models now
   Engaged), never Within 1" of an undeclared Unit, by priority: A base contact with declared targets
   whenever possible, B inside Engagement Range of targets, C as close to the Leading Model as possible.
   [CHG-004]
5. On-charge abilities (e.g. IMPACT) resolve after the move (R p.13 worked example). [CHG-005]

**Engine notes.** Each Batch is a separate attack call; the Ranged Attack action is a loop of
`PendingDecision{kind:'chooseBatch'}` until the Unit has fired every profile it wants or says done. The
Disengage penalty is a per-Round flag `noShootChargeRound = round` set on the Unit when Disengage without
Tactical Mass resolves.

## 8. Phase 3: Combat (R p.69-70 8.8; QS p.8; R p.95 12.5)
### 8.1 Eligibility, activation, passing [PH3-001..007]
- Only Engaged Units may activate, and every Engaged Unit must. Flying Units never take part, cannot
  Close Ranks and cannot be targeted by Close Combat Attacks.
- The marker holder chooses who activates first; then players alternate, one Engaged Unit per turn.
- A player Passes only when they have no eligible Unit left; the opponent then activates all of theirs
  in a row. The Phase ends when both have Passed.
- A Unit that has fought removes its Activation Marker. So eligible = Engaged AND still carrying an
  Activation Marker.
- A Unit freed from combat before it activated (its enemies died or left) is no longer required to
  fight and cannot act this Phase (it effectively Passes), unless a Reaction or specific trigger lets it.
- A BURROWED Unit Engaged at the start of the Phase must activate; it attacks only if it Close Ranks
  first (which ends BURROWED); otherwise it does not attack. Enemies may attack it normally
  (R p.85 Part 11 BURROWED).
- Passing in Phase 3 does not transfer the First Player Marker (section 3, RULING R11-2).

### 8.2 Close Combat Attack (the only action) (R p.69-70 8.8.1) [CC-001..008]
1. Close Ranks (optional): Leading Model moves up to 3" with standard Move rules; it must end closer to
   the Unit(s) it is Engaged with than it started; it may not create Engagement with Enemy Units not
   already Engaged with it at the start of this Phase; it cannot be used to Disengage from any Enemy Unit.
   Models already in base contact at the start of this step do not move (pinned). Re-set the others In
   Coherency (links may pass through Engaged Enemy models): base contact with Enemy models wherever
   possible, otherwise base contact with same-Unit Friendly models that are inside Engagement Range. A
   Unit whose models are all in base contact cannot Close Ranks (F p.3).
2. Declare attackers: Fighting Rank = Within 1" of an Enemy model; Supporting Rank = in base contact
   with a same-Unit model that is in the Fighting Rank. No LoS needed. They strike the Enemy Unit as a
   whole.
3. Roll attacks with the ranged three-pool sequence, using only Combat-Phase weapons; a model with
   several picks one. No Evade unless an ability grants Evade against close combat.
4. Several Enemy Units: a model may attack an Enemy Unit only if it is in that Unit's Fighting Rank or
   supports a model that is. Declare which target gets the Surge Die before rolling; it cannot be split.
   Keyword effects across split targets may be allocated as they resolve (F p.5).
5. Casualties: Engaged priority (R p.65 8.7.5): models not in any Enemy Engagement Range first, then
   inside Engagement Range but not in base contact, then base contact; a removal that would end
   Engagement with a specific Enemy Unit is forbidden while any other valid casualty exists (F p.3).
6. Post-combat: any Unit (attacker or defender) with no model Within 1" of an Enemy becomes Unengaged
   at once (see 8.1 for the freed-Unit rule).

**Engine notes.** Combat eligibility is the same `eligible(unit, phase)` predicate (`engaged(unit) &&
unit.activationMarker != null`). Removing the marker on completion makes the Phase terminate naturally
when no carrier of a marker is Engaged.

## 9. Phase 4: Scoring & Cleanup (R p.71-74 8.9; QS p.8; R p.95 12.6)
The First Player Marker holder initiates each step, in this order. [PH4-001]

### 9.1 Determine Mission Marker control (R p.46 6.2; R p.71-73 8.9.1; F p.2) [CTL-001..009]
- A Unit contests a Marker only if all hold: it is on the table; at least one model is Within 3" of the
  Marker, has LoS to it (Marker treated as Size 0) and is on the Marker's elevation; the Unit is In
  Coherency (as of its last repositioning action, F p.2).
- Never contest or control: Flying Units, BURROWED Units, Units in Reserves, Units Out of Coherency.
- Per Marker, each player sums the Current Supply of their contesting Units. Higher sum takes control.
  Equal sums (including 0 vs 0 with Units of both sides present) = Contested: control does not change.
- A Supply 0 Unit can take an uncontested Marker (only one player has contesting Units, even if their
  sum is 0), but never wins a contest.
- Sticky control: a Marker stays with its controller, even with no Units near, until the opponent ends a
  Scoring Phase with a strictly higher contesting total. Once controlled it never becomes neutral again.
  Place/move the Faction Indicator to show it.
- Deactivated Markers are controlled normally (F p.2). Only Markers on the table are checked (a removed
  or CLAIMed Marker is not on the table, `17`).
- Marker affinity (colour) never grants starting control.

### 9.2 Score Victory Points (R p.74 8.9.2) [VP-001..003]
Both players tally VP at the same time from the Mission Card's Scoring Conditions (`17`). Every mission
found scores "VP equal to Enemy Supply destroyed this Round": the total drop in Current Supply Value of
the opponent's Units during this Round, counting bracket drops from casualties and Units destroyed
(their remaining Supply at death), and any other reduction including a Morph (F p.5). A Unit returned to
Reserves is not a drop (RULING R11-5).

### 9.3 End of Game Check (R p.74 8.9.3) [END-001..004]
The game ends at once if any is true:
1. A Mission special winning condition is met (e.g. "a player leads by 10+ VP"): that player wins
   outright, whatever else.
2. A player has no models on the table and no Units in Reserves: the other player gains +10 VP; go to
   section 11.
3. This is the final Round (Round = Game Length): go to section 11.
When the game ends here, steps 4-6 are not resolved (RULING R11-6).

### 9.4 End of the Round effects (R p.74 8.9.4; R p.81 10.1)
All "End of the Round" abilities: marker holder resolves all of theirs first, each player orders their
own, each fully resolves before the next. Effects that last "until the End of the Round" are still active
during this step. [EOR-001]

### 9.5 Cleanup & Refresh (R p.74 8.9.5; R p.92 Part 11) [CLN-001..004]
- Remove all Tokens and Markers except: anything with STAY IN PLAY (all Mode and Buff/Debuff status
  markers have it), Damage Markers, Mission Markers, and the Faction Indicators showing Marker control.
- Activation Markers are removed here (any still present after Phase 3).
- Expire every "until the End of the Round" effect, including on Units in Reserves.
- Flip every Exhausted Tactical and Faction Card to Ready.
- Statuses stay unless their own rule removes them (STATIONARY is re-granted at the next Start of Round).

### 9.6 Determine Initiative (R p.74 8.9.6)
Fewer VP takes the First Player Marker; tie -> Roll-Off, winner takes it. The tie Roll-Off is recorded
as pending and rolled at step 2 of the next Start of the Round, after mission start-of-round steps
(RULING R11-1). Then start the next Round's Phase 1 (section 2). [INIT-006]

**Engine notes.** Phase 4 is a fixed pipeline of six pure functions over state; only Roll-Offs and
"order your own effects" create `PendingDecision`s. Control is computed by the engine (`query.control`)
and stored as `marker.controller` (null = never held); the client only draws it.

## 10. Activation Marker lifecycle (summary) [MRK-001..005]
| When | Marker state |
|---|---|
| Start of Round | No Unit has a marker. |
| Phase 1 action or Pass | On-table Units get Movement face; Units that Deployed get Movement face; Reserves get none. |
| Phase 2 action or Pass | Movement face -> Assault face (all on-table Units by end of Phase 2). |
| Phase 3 Close Combat Attack done | Marker removed. |
| Phase 4 Cleanup | All remaining Activation Markers removed. |
A SUMMONed Unit gets a marker when it arrives and cannot act in that Phase; in later Phases it must
activate immediately after its Parent Unit's activation, before the opponent's next activation, unless
the Parent is gone (R p.92 Part 11 SUMMON).

**Engine notes.** `unit.activation: null | 'movement' | 'assault'` and `removedThisCombat` derived from
`null` in Phase 3.

## 11. End of game and victory (R p.74 8.10; QS p.8)
1. If the game ends by Round limit: at the start of the final Scoring Phase (before step 1), every Unit
   still in Reserves is Destroyed; each player scores those enemy Units as the Mission scores destroyed
   enemy Units (their Current Supply Value counts as Supply destroyed this Round). [FIN-001]
2. Final score = all VP earned. Highest total wins. [FIN-002]
3. Tie: apply the Mission Card's tiebreaker; no card found has one, so the game is a Draw. [FIN-003]
4. A special winning condition (9.3 item 1) overrides VP totals. [FIN-004]

**Engine notes.** `state.result = {winner: seat | null, reason: 'special' | 'vp' | 'draw', vp: {...}}`.

## 12. Rulings (logged to `docs/needs-rules-check.md`)
- R11-1: Initiative Roll-Off timing. R puts the tie Roll-Off in 8.9.6; the worked example (R p.16) and
  F p.2 (Supply Drop marker roll comes before the "Priority Roll") place it at the start of the next
  Round. We resolve every initiative Roll-Off (pre-game and VP ties) at Start of Round step 2, after the
  mission's start-of-round steps. No decision happens in between, so outcomes match R (Unsourced; F p.2).
- R11-2: Passing in Phase 3 does not hand over the First Player Marker (Part 11 FIRST PLAYER MARKER and QS
  p.6 override the general 8.2.1) (Unsourced).
- R11-3: A forced Pass counts. A player with nothing eligible Passes on their first turn of the Phase;
  if they were chosen to act first, they are the first to Pass and take the marker (Phases 1-2 only)
  (literal 8.2.1; R p.11 worked example: both players forced to Pass) (Unsourced).
- R11-4: A Reserves Unit is eligible in Phase 1 only if Supply fits and at least one legal Deploy exists
  (Unsourced; keeps `legalActions` honest).
- R11-5: Returning a Unit to Reserves releases Supply but scores no Supply-destroyed VP (R p.61 says the
  Unit is not Destroyed; F p.5 only counts reductions of Current Supply) (Unsourced).
- R11-6: When the game ends in step 3, steps 4-6 are skipped (Unsourced; R p.74 says the game ends
  immediately).
- R11-7: Special winning conditions ("leads by N+ VP") are checked only in step 3, not at the moment a
  mid-Round VP (Gather) creates the lead (R p.74 8.9.3 lists it inside step 3) (Unsourced).
- R11-8: Elimination +10 VP then compares totals; the eliminated player can still win on VP (literal
  8.9.3 + 8.10). If both players are eliminated at once, nobody gains +10 (Unsourced).
- R11-9: "Start of the Round" ties: "the first player" in R p.58 means the marker holder (matches R p.74
  8.9.4) (Unsourced).
