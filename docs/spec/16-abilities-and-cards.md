# 16 Special abilities, cards, Buff/Debuff and hidden-state mechanics

Rule IDs in brackets are proposed checklist IDs (ABL-*, CARD-*, MOD-*, VIS-*, XPORT-*). Sources as in
spec 15: R = core rules, F = FAQ v1.1, CL = Changelog 10.2026, QS = Quick Start, CS = card sheets.
"(F)" marks a rule the FAQ clarifies or changes. CL 10.2026 changes only costs, so no ability rules in
this spec carry "(CL)".

## 1. Ability anatomy and universal requirements (R p.29 2.7; R p.79 10.1; F p.4)
1. Each Special Ability has: Name; Phase limitation (Movement, Assault, Combat or Any Phase); Type
   (ACTIVE, PASSIVE or REACTION); optional Cost "N CP|BM|PE" (Cost 0 or no cost = free); and its effect
   text. [ABL-001]
2. Before an ability resolves, all of these must hold: [ABL-002]
   - the timing or trigger is right and the current phase matches the phase limitation;
   - the target is Within range and in LoS, unless the text says otherwise;
   - the full cost is paid first;
   - the using Unit is on the battlefield.
3. No named target means no LoS check. Setting a Token, Marker or Faction Indicator is not targeting:
   it needs no LoS and no target Unit (R p.79). [ABL-003]
4. A Unit is always within range of itself (F). "Select" and "target" mean the same thing (F). [ABL-004]
5. Same name never stacks. A Unit under two instances of one named ability applies only one of them.
   [ABL-005]
6. Keywords never stack. A numeric keyword uses the highest value it has from any source
   (R p.29 2.6.1; R p.82). [ABL-006]
7. Card text beats core rules, and specific beats general (R p.29 2.6.2). [ABL-007]
8. Units in Reserves: none of the three types works unless the text says it does (R p.89 RESERVES).
   Exceptions: abilities that say they work in Reserves (Raiders Roll!) and abilities that deploy the
   Unit (Burrow Ambush, Phase Prism, Rapid Reinforcements) may resolve when the Unit is nominated to
   deploy (F p.3). [ABL-008]
9. "While within" conditions are checked at the start and at the end of every action and every ability
   resolution in the round. They apply as soon as they are met (F p.5). [ABL-009]
10. "Once per Game" in an ability's text: one use per game per Unit or card instance (RULING R16-6).
    [ABL-010]

## 2. ACTIVE abilities (R p.29 2.7.1; R p.79 10.2; F p.4)
1. Usable only by the Unit currently Activated, and only in one of two windows: just before it declares
   its action, or just after that action fully resolves. Never during an action. [ABL-020]
2. Once per round per Unit per name. Two Units of the same type each get their own use. An ability
   granted by a Tactical Card is still once per round per Unit, however many copies of the card the
   player owns. [ABL-021]
3. REPEATABLE removes the once-per-round limit. The ability may be used again in the same round and in
   the same activation, as long as its cost and conditions are met each time (R p.88). [ABL-022]
4. Any number of actives with different names may be used in one activation, if each is paid for
   (F). [ABL-023]
5. An Active on a Tactical or Faction Card ("the active Unit ...") needs an activated friendly Unit on
   the battlefield, even if the effect does not touch that Unit (F). [ABL-024]
6. "Instead of performing an action" actives (Strap In!, Strategic Recall, Personal Transport,
   Ready for Pickup?) take the place of the action. The Unit then gets its Activation Marker as
   usual. [ABL-025]
7. Effects last until the End of the Round unless stated. They survive Scoring step 4 (End of the Round
   effects) and are removed in step 5 (Cleanup & Refresh). [ABL-026]

## 3. PASSIVE abilities (R p.30 2.7.2; R p.80 10.3)
1. Always on while the Unit is on the battlefield. No activation, no decision. Off while the Unit is in
   Reserves. [ABL-030]
2. Simultaneous passives: their controller picks the order. If both players have passives at the same
   moment, the active player's resolve first. [ABL-031]
3. Duration: permanent while the Unit is on the battlefield. [ABL-032]

## 4. REACTION abilities (R p.30 2.7.3; R p.80 10.4; F p.4-5)
1. Declare it at the exact moment the trigger happens. Once that window passes it is gone. A reaction
   may interrupt mid-sequence, at the trigger point. [ABL-040]
2. Once per round per Unit per name, across every phase and activation. Different Units may each use
   the same-named reaction. [ABL-041]
3. Each player may resolve at most one reaction per activation, counting all of that player's Units and
   cards. Example: a Zealot Unit under attack uses either Zealous Round or Ground Armour, not both. If a
   Marine Unit used Infantry Armor, the Medic cannot use Life Support in that enemy
   activation. [ABL-042]
4. Both players reacting to one trigger inside an activation: the active player resolves first
   (R 10.4). [ABL-043]
5. Outside any activation (Scoring Phase, End of the Round effects and similar), reactions are still
   allowed. Each player gets at most one reaction per trigger in that phase. If both react, the First
   Player Marker holder resolves first (F). [ABL-044]
6. A REPEATABLE reaction can be used in several activations in one round, but still only once per
   activation. Outside activations it is once per trigger (F). [ABL-045]
7. INSTANT weapon: enemies may not declare or resolve reactions to attacks made with it (R p.86).
   [ABL-046]
8. Effects last until the End of the Round unless stated (same timing as section 2 item 7).

Engine notes (sections 1-4): one `Ability` record of the form
`{name, type, phase, cost:{res,n}|null, repeatable, oncePerGame, trigger?, effect}`.
- Usage ledger, keyed `(unitId|cardId, name, round)`, plus `oncePerGame` keys.
- Reaction budget, keyed `(player, activationId | phaseTriggerKey)`.
- Activation flow: one `PendingDecision` window before the action and one after it (offer the legal
  actives), then the action. Reactions come from trigger hooks that the attack and movement pipelines
  raise (`onTargeted`, `onChargeDeclared`, `onChargeRoll`, `beforeArmourRoll`, `beforeEvadeRoll`,
  `onArrive`, `onLoseHidden`, ...). Order: active player first, or the First Player Marker holder
  outside activations.
Passives are pure modifiers, read on demand. They hold no state.

## 5. Tactical Cards, Faction Cards and resources (R p.40-41 5.3-5.4; R p.81 10.5; R p.72 8.9.5; R p.88 READY; F p.3-4; QS p.5)
1. Resources by race: Terran = CP, Zerg = BM, Protoss = PE. Each Tactical Card and Faction Card prints a
   resource value. On current cards it is 1, and a few Terran and Zerg cards print 2 (CS). Creep Cards
   print no resource and cannot be exhausted to pay. [CARD-001]
2. Two states: Ready (face up) and Exhausted (face down). Every card is Ready at the start of each
   round. [CARD-002]
3. A Ready card can be Exhausted for exactly one of these: [CARD-003]
   - to use one Active or Reaction ability printed on that card (the exhaust is the whole price unless
     the ability also prints a cost); or
   - to produce its resource for a cost somewhere else (a Unit ability, or another card's printed cost).
4. Paying a cost of N: exhaust Ready cards of the matching resource whose values add up to at least N.
   If you cannot reach N, you cannot use the ability. Any surplus is lost at once. Resources cannot be
   saved or split across two abilities. Example: a 2-CP card spent on a 1-CP cost wastes 1 CP
   (F p.3). [CARD-004]
5. An Exhausted card gives no resource and none of its printed abilities can be used until Refresh.
   Example: the Academy's Advanced Training reaction is unusable once the Academy is exhausted
   (F p.4). [CARD-005]
6. Passive abilities printed on a card are off while the card is Exhausted (RULING R16-1). Passives that
   only matter at army building (Zerg Creep) are unaffected. [CARD-006]
7. Refresh: in Scoring step 5 (Cleanup & Refresh) every Exhausted card flips back to Ready. [CARD-007]
8. Cost modifiers change the cost before payment, with a floor of 0. Examples: Psionic Link -1; Raiders
   Roll! -1 to a minimum of 0. A cost of 0 needs no exhaust. [CARD-008]
9. The once-per-round-per-Unit rule (section 2) applies to card actives on top of the exhaust rule. Two
   copies of a non-UNIQUE card let the player use its active on two different Units in one round, not
   twice on the same Unit. [CARD-009]
10. Tactical and Faction Cards are always public (R p.76 9.1.10). [CARD-010]

Engine notes: `cards: {id, def, exhausted:boolean}[]` per player. Payment goes through one solver,
`pay(player, res, n) -> cardIds[] | null`. The bot and the UI both take its choice set: every subset of
Ready matching cards with sum >= n, ranked by least waste, then by the lowest opportunity cost of the
card's own abilities. A card-printed ability is offered only while its card is Ready.

## 6. Buff/Debuff markers, Statuses and modifiers (R p.31 3.4; R p.53-54 7.3.2; R p.82-83 BUFF, DEBUFF; R p.88 MODIFIER; R p.90 STATUS, STAY IN PLAY; F p.4)
1. BUFF [Characteristic] (X), lasting until the End of the Round:
   - Target-number characteristics (Hit, Armour, Evade): -X, so the roll gets easier.
   - Value characteristics (Speed, RoA, and similar): +X.
   It is tracked with a blue marker. [MOD-001]
2. DEBUFF [Characteristic] (X), lasting until the End of the Round:
   - Target-number characteristics: +X.
   - Value characteristics: -X, with a floor of 0.
   It is tracked with a red marker. [MOD-002]
3. BUFF and DEBUFF are keywords. Two BUFF Speed effects do not stack and the higher X wins (Wild Mutation
   + Glial Reconstitution give the higher one only, F). Flat modifiers from differently named sources
   with no keyword stack (Accelerating Creep + Queen Creep Speed, F; IMPACT +1s from Malignant Creep,
   Evolution Chamber and Adrenal Overload stack to +3, F). [MOD-003]
4. A target number after modifiers is clamped to the range 2+ to 6+. A natural 6 always succeeds and a
   natural 1 always fails. An ANTI-EVADE-type modifier can worsen a roll only to 6+, never cancel it
   (F). [MOD-004]
5. Statuses (BURROWED, HIDDEN, SIEGE MODE, STATIONARY, SHIELDED, and so on) stay through Cleanup unless
   something removes them. Status markers have STAY IN PLAY. A BUFF or DEBUFF still ends at the End of
   the Round because its keyword says so, even though its marker stays in play. [MOD-005]
6. STATIONARY: every Unit gains it at the Start of the Round, and loses it the moment any of its models
   moves, is moved or is PLACEd (R p.90). [MOD-006]
7. Effects on a Unit returned to Reserves keep their clocks running (spec 15 section 4). On a Destroyed
   Unit, its own effects end and its tokens go (STAY IN PLAY tokens excepted). Effects it put on other
   Units stay (R p.54 7.4). [MOD-007]

Engine notes: one `Effect {source, key, kind: buff|debuff|status|flat, stat?, x?, expires: endOfRound|
untilAction|permanent|whileCondition}` list per Unit. Characteristic reads fold the list as follows:
group BUFF/DEBUFF by `(kind, stat)` and take the max X per group, sum the flat modifiers, then clamp.
Statuses are boolean keys in the same list.

## 7. The visibility mechanism: HIDDEN, BURROWED, detection (R p.82-83 BURROWED; R p.86 HIDDEN; R p.91 VISIBLE; R p.69-71 8.9.1; F p.2, p.5; CS)
### 7.1 HIDDEN (Status)
While a Unit is HIDDEN: [VIS-001..005]
1. It cannot be chosen as the target of a Ranged Attack, or of any ability that needs LoS, unless the
   acting model is Within 4" of it.
2. It is not Visible to any model more than 4" away, whatever the LoS. This also limits casualty
   removal (only Visible models can be removed) and Spillover LoS (RULING R16-3).
3. It is immune to IMPACT.
4. It may make an Evade Roll against every attack that targets it. A Unit whose Evade is "-" still
   cannot evade.
5. Charges need no LoS and are not Ranged Attacks, so HIDDEN does not stop a Charge (RULING R16-4).
   INDIRECT FIRE skips LoS but still targets, so it is still blocked beyond 4" (RULING R16-5).

### 7.2 Sources of HIDDEN (CS)
- BURROWED: gives HIDDEN when gained and again at every Start of the Round. Losing BURROWED also removes
  HIDDEN.
- Path of Shadows (Stalker or Nerazim Watchers upgrade, Active, 1 PE) and Anakh Su'n (Void Seeker card):
  HIDDEN "until it performs another action". Hold does not end it, because R 8.5.1 defines Hold as
  performing no action (RULING R16-2).
- One with the Shadows (Zeratul, Passive): gains HIDDEN after each fully resolved action.
- Darkness Descends (Nerazim card, Active): the active Biological Unit is HIDDEN until the End of the
  Round.

### 7.3 Losing HIDDEN: detection (CS; F p.5)
1. Every detector is an area: "enemy Units Within 6" of X lose HIDDEN". [VIS-010]
   X is one of:
   - a detector Unit with the DETECTION passive (centred on that Unit);
   - a Faction Indicator placed by Scanner Sweep (Orbital Command), Oversight Mode (Overseer) or
     Surveillance (Observer);
   - a Shade token, via Nerazim Farsight.
2. A Faction Indicator placed for detection targets a point, not a Unit, so the 4" HIDDEN targeting
   limit does not apply to it (F p.5). It still needs no LoS (section 1 item 3). [VIS-011]
3. Losing HIDDEN removes the status. Leaving the area does not bring it back. Only a source in 7.2
   re-grants it, for example a BURROWED Unit at the next Start of the Round (RULING R16-7). Check at the
   start and end of each action or ability (section 1 item 9), and when the area is created.
   [VIS-012]
4. A loss of HIDDEN is an event. It can trigger Might of the Nerazim. [VIS-013]
5. Detection removes HIDDEN only. A detected BURROWED Unit stays BURROWED, with all of 7.4. [VIS-014]
6. Detector areas (Faction Indicators, Shade tokens) are removed in Cleanup unless they have STAY IN
   PLAY.

### 7.4 BURROWED (Status, a Mode; R p.82-83)
1. Gaining it also grants HIDDEN, and at each Start of the Round the Unit gains HIDDEN again. Losing it
   removes HIDDEN. [VIS-020]
2. Size counts as 0 for every purpose: LoS, cover, gap clearance. [VIS-021]
3. CSV counts as 0 in Disengage checks. The Unit can never contest or control Mission Markers. It may
   still claim markers in Artefact Hunt (F p.2). [VIS-022]
4. Legal actions: Deploy, Move, Disengage, Run, Hold, Close Ranks. Any of them except Hold removes
   BURROWED at once. So no Ranged Attack and no Charge while burrowed. [VIS-023]
5. The Unit may still use Special Abilities, and may Evade every attack that targets it. [VIS-024]
6. Other models may move through its models but may not end within its Engagement Range. [VIS-025]
7. Engaged at the start of the Combat Phase: it must activate and cannot attack while burrowed. It may
   Close Ranks first, which un-burrows it, and then attack normally. Without Close Ranks it does not
   attack. Enemies attack it normally. [VIS-026]
8. Card sources: [VIS-027]
   - Burrow (Roach line, Active 2 BM, any phase): if the Unit is Unengaged, it gains or loses BURROWED.
   - Lie in Wait (Hatchery card): the active Unengaged Ground Unit gains BURROWED.
   - Rapid Burrowing (Zerg Swarm): one friendly Unengaged Ground Zerg Unit gains BURROWED, even if it has
     already activated.
   - Nasty Surprise (Roach Warren) removes BURROWED.
   - Tunneling Claws: Move and Run no longer remove BURROWED, and the Unit may pass through other Units'
     bases (not terrain or Force Fields, F).
   - Regeneration: HEAL (2) on activation while BURROWED.
   - Underdeveloped Claws: the Unit can never gain BURROWED.

### 7.5 CLOAK and DETECTION keywords
GAP: there is no CLOAK keyword and no DETECTION keyword in R Part 11, F, QS or CL. We grepped every
source for "cloak", "detect", "stealth". Stealth is modelled entirely with HIDDEN. "Detection" exists
only as the unit passive and the card abilities in 7.3. Nova Stealth Mode's card was not in the
extracted sheets (GAP; enter it in M1 from the card image).

Engine notes: there is one visibility mechanism. A `hidden` status on the Unit, plus one predicate,
`canSee(actor, target) = losClear(actor,target) && (!target.hidden || dist(actor,target) <= 4)`. Every
targeting, casualty-visibility and Spillover check calls it. Detection is a list of `DetectorArea
{owner, centre: unitId|tokenId|point, radius:6}`; at each check point, enemy Units inside an area lose
`hidden` (emit `onLoseHidden`). BURROWED is a second status that the action-legality, size, supply and
contest queries read. Hidden-giving effects are entries in the Effect list (section 6) with
`expires: untilAction | endOfRound | burrowLinked`.

## 8. The transport mechanism: Reserves plus alternate entry (R p.55 8.3.3; R p.59; R p.92 ZONE OF INFLUENCE; F p.3-4; CS)
GAP: no embark, disembark, capacity or "transported" rules exist in any source. We grepped for
"embark", "transport", "capacity", "Medivac" and "Dropship". Transports are cards that move Units
through Reserves. The generic mechanism has two primitives:
1. ReturnToReserves(unit). Used by Strap In! (Dropship), Strategic Recall, and Personal Transport
   (Void Seeker; return then Deploy at once). The Unit must be Unengaged, and Ground where the text says
   so. Effects as in spec 15 section 4. [XPORT-001]
2. AltEntry(point|edge). Every alternate entry follows the Deploy rules, including the Available Supply
   gate and the Zone of Influence ban. [XPORT-002]
   - Faction-Indicator drop (Ready for Dust-off, Ventral Sacs, Warp Conduit):
     - Placing it is an Active in the Movement Phase, anywhere more than 10" from every enemy model.
     - At End of the Round (Scoring step 4, First Player Marker holder first), the owner may Deploy
       one Ground Unit from Reserves: Leading Model in base contact with the indicator, the rest In
       Coherency, all outside enemy Engagement Range.
     - If the Leading Model cannot be placed legally (for example, enemies stand on the indicator), the
       drop is wasted and the indicator is removed at Cleanup (F p.3-4).
   - Friendly Entry Edges: the Pylon's base and the Omega Worm's base are Entry Edges owned by their
     placer. They create no Zone of Influence. A Unit deploys only onto the same elevation as the base
     (F p.3). Deploying through a Pylon ends the Unit's activation; it gets its Activation Marker and
     uses no abilities that Phase (F p.3). Omega Network allows at most 2 combined Supply per round.
   - PLACE-from-deploy (Burrow Ambush PLACE (18) from the Entry Edge, no model within 10" of an enemy;
     Rapid Reinforcements PLACE (10) from another friendly Unit, none within 8"; Phase Prism): each
     resolves when the Unit is nominated to deploy, and its activation then ends.
   - Proxy Barracks and Warp Prism do not create Entry Edges; they only grant an exception that lets a
     Unit deploy without one (F p.3).
3. Arrival reactions read the entry type. Photon Overcharge fires on an enemy that arrives anywhere
   other than its own Entry Edge, so it does not fire on a Pylon or Omega edge, which are that enemy's
   own friendly edges (F p.3). Comsat Station closes one non-Entry table edge to enemy Deploys until the
   End of the Round. [XPORT-003]
4. In the final round, End of the Round drops never happen. Scoring step 3 ends the game before step 4,
   and Units in Reserves have already been swept as Destroyed. [XPORT-004]
5. Ready for Pickup? (Raynor's Raiders): once per game, PLACE (12), not into enemy Engagement Range,
   instead of an action. It is a reposition, not a Reserves trip, and it frees no Supply. [XPORT-005]

Engine notes: there is no container entity. Reserves is the container. `arrive(unit, entry: {kind:
edge|friendlyEdge|indicator|place, ref})` runs `canArrive` (spec 15) and the Zone of Influence check,
places the models, raises `onArrive{entryKind}` for reactions, and ends the activation where the source
says so.

## RULINGS (Unsourced unless noted)
- R16-1: Passive abilities printed on a card are off while that card is Exhausted. We read R 10.5.2 ("its
  abilities can not be used") and F p.4 literally.
- R16-2: Hold does not end "until it performs another action" effects. R 8.5.1 says a Holding Unit
  performs no action.
- R16-3: A HIDDEN model more than 4" from the viewer is not Visible, for casualty removal and for
  Spillover LoS. The VISIBLE keyword is unconditional.
- R16-4: HIDDEN does not prevent Charges. Charge targeting needs no LoS (R 12.4) and is not a Ranged
  Attack.
- R16-5: INDIRECT FIRE cannot target a HIDDEN Unit beyond 4". It skips only the LoS requirement, and
  HIDDEN forbids the targeting itself.
- R16-6: "Once per Game" is tracked per Unit for a unit ability and per card instance for a card ability.
  This mirrors the once-per-round scoping in R 10.2.
- R16-7: Detection removes HIDDEN as a one-time loss, not a suppression that lifts when the Unit leaves
  the area. "Lose" is the text's verb, and Might of the Nerazim treats the loss as an event.
