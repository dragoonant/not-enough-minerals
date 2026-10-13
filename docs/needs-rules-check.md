# Needs rules check

Rules ambiguities never block work. Each line records one decision:

`RULING: <rule> | <what we did> | <why> | <Status> | <source>`

Status words: **Confirmed** (a free official source settles it), **Corrected** (the Changelog, Cost Table or
card text changed the rulebook; we follow the correction), **Unsourced** (no source; our engineering or
design choice), **Fan-source** (from a fan/third-party summary, not official text). Source keys and the
citation format are in `docs/spec/10-overview.md` (R p.N = PDF page marker). Revisit Unsourced and
Fan-source lines when new sources appear (a newer FAQ, Changelog or card sheet). Each ruling is tested by
the checklist line marked "(RULING)" in `docs/spec/12-rules-test-checklist.md`.

## Round, scoring and end of game
- RULING: Initiative Roll-Off timing | all initiative Roll-Offs resolve at Start of Round after mission start steps | F p.2 and worked example R p.16 put it there | Unsourced | R p.74 8.9.6; F p.2
- RULING: Phase 3 passing | does not transfer First Player Marker | Part 11 entry and QS limit the transfer to Phases 1-2 | Unsourced | R p.87; QS p.6
- RULING: Return to Reserves | releases Supply but scores no Supply-destroyed VP | Unit is not Destroyed | Unsourced | R p.61; F p.5
- RULING: Special win (lead N+ VP) | checked only at Scoring step 3 | 8.9.3 places it there | Unsourced | R p.74
- RULING: Game ends at step 3 | steps 4-6 skipped; elimination +10 then compare VP | literal 8.9.3/8.10 | Unsourced | R p.74
- RULING: Reserves eligibility in Phase 1 | only if Supply fits and a legal Deploy exists | keeps legalActions honest | Unsourced | R p.58
- RULING: Any enemy CSV drop, including friendly fire | scores VP | FAQ says 'anytime' | Confirmed | F p.5
- RULING: Summoned Units' supply losses | give no VP | R 9.1.9 excludes them from the Final Score, and the specific rule beats the FAQ's general one | Unsourced | R p.76
- RULING: Reserves counted as Destroyed | only when the game ends at the round limit | R 8.10 is scoped that way | Unsourced | R p.72

## Missions and setup
- RULING: Supply Drop | Sticky-controlled Activated marker scores with no Unit near | literal card text | Unsourced | CS1-T p.11
- RULING: Gather action | needs only Unengaged + Within 3" of a marker you control; no LoS/Coherency; any number of Units | literal | Unsourced | CS1-T p.12
- RULING: Divide and Conquer | quarters by centre lines; 'Unit controls marker' = player controls it and Unit could contest; +1 once per Unit; Flying counts | Unsourced | CS1-T p.13
- RULING: Artefact Hunt | CLAIMs between Scoring steps 1 and 2, marker holder first; dropped marker keeps its controller | Unsourced | CS2-P p.5
- RULING: Proving Grounds Blue edge | x 18-36, measured from card art (not dimensioned) | Unsourced | CS1-T p.14
- RULING: Draft cards | must match the agreed Engagement Scale; card frame never mirrored or rotated | Unsourced | R p.79 9.2

## Terrain, movement, LoS and coherency
- RULING: Evade from HIGH GROUND | standing on it with any part of the base qualifies | R p.51 rule text wins over the R p.53 summary table, which says Wholly Within | Unsourced | R p.51 7.1.3
- RULING: Charge success | Leading Model Within 1" of each declared target is enough (literal), even if terrain then prevents Engagement; 'undeclared enemy' means Ground units only | literal R, and Flying units are never Engaged | Unsourced | R p.68 8.7.7
- RULING: Close Ranks | Leading Model must be a model not already in base contact; 'closer' means its shortest distance to any Engaged enemy model goes down; the 1" end ban is waived only for units already Engaged | otherwise the move is impossible | Unsourced | R p.69, F p.3
- RULING: Fighting Rank needs a pair that could legally be Engaged (terrain and elevation rules apply) | 1" across a Size 2 wall does not count | Unsourced | R p.55 7.2.1
- RULING: Close Quarters exempts only the shared terrain piece; Full Cover is still checked | the 'standard trace' includes Full Cover | Unsourced | R p.48 7.1.1
- RULING: Grass blocks Engagement (Size 2, literal) and PLACE does not destroy Grass | follows the F rulings for Force Field and Creep | Unsourced | R p.55, F p.4-5
- RULING: Coherency Link segments have no length limit beyond the 3" Wholly Within test; a segment is valid if a straight line between the two bases avoids blockers | no length is stated | Unsourced | R p.37 4.4
- RULING: PLACE and Grass | PLACE never destroys Grass | Grass is destroyed only by the listed movement actions | Unsourced | R p.87, F p.4-5

## Dice, attacks and damage
- RULING: removing casualties from an Engaged unit | pick from the lowest tier among models whose removal keeps every Engagement; if none qualifies, pick from the lowest tier of all models | matches the R p.65 example and F p.3 | Unsourced | R p.65 8.7.5
- RULING: Shield's 'first model' | model index 0 as mustered; Shielded is lost once Total Damage after damage reduction exceeds the Shield value | the FAQ example is a single first model and the check runs after reductions | Confirmed | F p.2
- RULING: Visible models for removal | snapshot the visible set when the Batch target is declared | the worked example agrees visibility before rolling | Unsourced | R p.22, F p.3
- RULING: Damage left after every Visible model is removed | discard all of it, including the old Damage Marker value | literal reading of 'discard remaining Total Damage' | Unsourced | R p.64 step 5
- RULING: CRITICAL HIT timing | resolved in the Surge step after Surge; DODGE is one shared budget spent on Surge first | DODGE puts both in the Surge step | Unsourced | R p.85-86
- RULING: QS says a die may be re-rolled only once; adopted because R is silent | Confirmed | QS p.3
- RULING: Surge vs CRITICAL HIT order, DODGE | Surge first, then CRITICAL HIT, then one DODGE X reduction across both | DODGE says it applies in the Resolve Surge step | Unsourced | R p.63, p.86
- RULING: IMPACT/HITS steps | both run Armour, Evade (if eligible) and Damage; casualties ignore Visibility; Engaged priority applies | R names only Armour Rolls for IMPACT | Unsourced | R p.88, p.65
- RULING: Evade '-' units | never roll Evade even when an ability grants one (Indomitable, HIDDEN) | Null Value rule | Confirmed | R p.33 3.4

## Keywords, abilities and cards
- RULING: HIDDEN and BURROWED ('every attack') grant Evade in close combat too | the keyword text says every attack | Unsourced | R p.85, p.88
- RULING: BURROWED Supply 0 in Disengage | applies on both sides, so a burrowed Unit that Disengages never has Tactical Mass | literal keyword text | Unsourced | R p.82
- RULING: MORPH supply check | Available Supply is checked before the models (e.g. the Roach) are removed | literal order of the MORPH text, read as a precondition | Unsourced | R p.87, p.90
- RULING: Passives printed on an Exhausted card | are off | literal reading of 'its abilities can not be used' | Unsourced | R p.81 10.5.2, F p.4
- RULING: Detection | removes HIDDEN once and does not suppress it; it returns only from a source (e.g. BURROWED at the next round start) | text says 'lose', and Might of the Nerazim treats the loss as an event | Unsourced | CS, F p.5
- RULING: Detection vs HIDDEN | a Unit inside a detection area cannot hold HIDDEN, and leaving the area does not restore it | F says 'while within' is checked at every action boundary | Unsourced | F p.5, CS1-Z p.3
- RULING: HIDDEN | does not stop Charges; Indirect Fire still cannot target beyond 4"; Hold does not end 'until another action' | literal R text | Unsourced | R p.86, p.92, 8.5.1
- RULING: INDIRECT FIRE vs HIDDEN | INDIRECT FIRE does not bypass HIDDEN's 4" limit | HIDDEN blocks selecting the target by distance, not by LoS | Unsourced | R p.88
- RULING: BUFF/DEBUFF duration | lasts to End of Round even when granted 'for this roll' (Potent Bile) | the keyword definition sets the duration | Unsourced | R p.84-85
- RULING: Sieged Siege Tank in melee | it activates but makes no attack | SIEGE MODE bars all non-siege weapons | Unsourced | R p.91, CS2-T p.1
- RULING: Omega Worm | it is a Summoned-type Unit (no CT cost) entering via Omega Network | R 9.1.9 says 'such as' | Unsourced | R p.78, CS1-Z p.3, p.14

## Army building and costs
- RULING: CL Artanis line | CL prints 'Adept 250->270' under Artanis; we set Artanis 270, Adept 160 | CT p.7 shows Artanis 270, Adept 160 | Corrected | CL p.2, CT p.7
- RULING: UNIQUE unit cards | max 1 copy per army | R only states the rule for Tactical Cards | Unsourced | R p.40 5.3
- RULING: Non-UNIQUE Tactical Cards | may be bought more than once | implied by the UNIQUE rule and R 10.2 'copies' | Unsourced | R p.79 10.2
- RULING: Glial Reconstitution cost | Roach/Corpser print 1 CP, Vile prints 1 BM; we use 1 BM for all | Zerg pays in BM (R p.83 10.5.1) | Unsourced | CS1-Z p.6,7,9
- RULING: Kerrigan's Swarm army slots | use card 3 Core, 2 Elite, 1 Hero, not R example 3 Core, 1 Hero, 2 Support | card beats core rules | Corrected | R p.75 9.1.2, CS1-Z p.14, R p.31 2.6.2

## Additional rulings found in specs 11-18 (logged by the checklist writer)
- RULING: Forced Pass | a player with nothing eligible Passes; if first, they take the First Player Marker (Phases 1-2) | literal 8.2.1 and the R p.11 example where both are forced to Pass | Unsourced | R p.57 8.2.1; R p.11
- RULING: Both players eliminated at once | nobody gains the +10 VP | the bonus needs a surviving opponent | Unsourced | R p.74 8.9.3
- RULING: "First player" for Start of Round effects | means the First Player Marker holder | matches the End of Round wording | Unsourced | R p.58 8.4; R p.74 8.9.4
- RULING: Contributing models | a model adds dice only if a target model is Visible from that model itself | Range and visibility are per model | Unsourced | R p.62 8.7.3; F p.5
- RULING: Mixed HP in one Unit | the defender may remove any eligible model whose HP fits the remaining damage | removal stops only when no eligible model fits | Unsourced | R p.64 step 5
- RULING: Impact Hit Rolls | are Tests, so the 2+..6+ clamp and natural 1/6 apply | they roll against a Target Number | Unsourced | R p.88 IMPACT
- RULING: Template casualties | use the normal Visible or Engaged-priority rules, not only the covered models | R gives no template-specific removal rule | Unsourced | R p.66 8.7.6
- RULING: Template dimensions | BT and FT sizes are config constants until a source gives them | only a diagram exists | Unsourced | R p.66, p.96
- RULING: HIGH GROUND attacker | "attacking unit" means all its models on the table, not just the firing ones | literal | Unsourced | R p.51 7.1.3
- RULING: Base on several terrain pieces | Effective Size uses the highest piece | matches the elevation rule | Unsourced | R p.59 8.5.3
- RULING: Moving "through" Size 2+ terrain | means crossing its footprint below its top; a walkable top is crossed freely with its edge Impassable except at ACCESS POINTs | needed for High Ground movement | Unsourced | R p.59 8.5.3; F p.2
- RULING: Move-end "Enemy Unit" | means Enemy Ground Units for Ground movers; Flying movers end 1"+ from Enemy Flying | Flying are never Engaged | Unsourced | R p.59-60
- RULING: Engagement geometry | "between" = the shortest segment joining the bases crosses the footprint; "adjacent" to an ACCESS POINT = Within 1" | no definition printed | Unsourced | R p.55 7.2.1
- RULING: Setup order | terrain before Mission Markers (9.3), not the 12.1 summary order | full rule beats the summary | Confirmed | R p.80 9.3
- RULING: First Battle preset colours | come from the draft Roll-Off | the worked example does not state colours | Unsourced | R p.7-29
- RULING: Once per Game | tracked per Unit for a unit ability and per card instance for a card ability | mirrors R 10.2 scoping | Unsourced | R p.81 10.2
- RULING: CONCENTRATED FIRE | carried-over Damage on the marker is discarded too once the cap is hit | literal "discard any remaining Total Damage" | Unsourced | R p.85
- RULING: INSTANT scope | blocks every opposing Reaction triggered by that attack or a step inside it, from unit or card; Passives still work | literal | Unsourced | R p.88
- RULING: LONG RANGE vs BUFF Range | BUFF/DEBUFF Range changes the printed Range only, never X | X is a separate value | Unsourced | R p.89
- RULING: Damage setters | PIERCE and "treated as" setters first, attacker picks between two, caps last | needed for Titan Killers/Aftershock/Improved Barrier | Unsourced | R p.90; CS
- RULING: NON-LETHAL vs Combat Shield | the X points are rolled as X Evade dice of 1 Damage each | F grants the Evade but gives no dice count | Unsourced | F p.4
- RULING: MORPH removing the last model | the original Unit counts as Destroyed for scoring | it leaves the table with no models | Unsourced | R p.90
- RULING: DISPLACEMENT | relocating a Unit's own model counts as being moved (STATIONARY lost) but is not a move for Creep Removal | R p.92 "is moved" | Unsourced | R p.85-86, p.92
- RULING: BURROWED on return to Reserves | the status stays until the next Deploy removes it | R is silent; Deploy ends BURROWED | Unsourced | R p.61; R p.85
- RULING: Hydralisk base | the card prints 40x100 mm (oval); the schema supports oval bases and M1 confirms from the card image | `14` assumed circles only | Unsourced | CS1-Z p.1
- RULING: Veteran of Tarsonis armour | encoded as rollMod armour delta +1 (lowers the Armour TN by 1, i.e. 4+ becomes 3+) | R 3.4: +1 to Armour improves the save | Unsourced | CS1-T p.2; R 3.4
- RULING: Target Lock duration | endOfRound | the card prints no duration; most literal reading, same as BUFF | Unsourced | CS1-T p.3
- RULING: Orders Critical Hit option duration | grant on the first used weapon, lasting endOfActivation (consumed on first use) | card says next weapon used, no duration printed | Unsourced | CS1-T p.1
- RULING: Life Support timing | engine requirement: damageSuffered reaction resolves before damage is allocated, and damageReduce.n accepts a ValueExpr | card reduces damage before allocation | Unsourced | CS1-T p.3

## M1 data entry (unit, card and core batches)
- RULING: Stimpack PRECISION grant duration | endOfRound on Marine, Marauder and Raynor's Raider | the card prints no duration; matches BUFF | Unsourced | CS1-T p.1, p.2, p.6
- RULING: Raiders Roll! | lets Stimpack be used while in Reserves at 1 less cost; the cost cut is not optional | the card gives no choice | Unsourced | CS1-T p.6
- RULING: Jim Raynor faction tags | TERRAN only | his card prints only TERRAN; the Raynor's Raiders card names him directly | Confirmed | CS1-T p.4
- RULING: Token sizes with no printed base (Creep Tumor, Ravager Burrow, Corrosive Bile, Shade, Adept Shade, Force Field) | baseMm null; the engine treats them as points until a source gives a size | no card or R value found; R 7.3.1 may imply 0 for Force Field | Unsourced | CS1-Z, CS2-Z p.1, CS1-P p.1, p.5, CS2-P p.3; R 7.3.1
- RULING: Transfusion | may target a friendly Structure (code hook transfusion-allows-structure) | card text names Structures as legal | Unsourced | CS1-Z p.5
- RULING: Pylon combat tag | printed ARMORED entered as armoured | spelling normalised to our tag set | Confirmed | CS1-P p.4
- RULING: Psionic Transfer | not usable while the Unit carries a CLAIMed marker (Adept, Nerazim Watchers) | FAQ Artefact Hunt answer | Confirmed | CS1-P p.1, CS2-P p.3; F (Psionic Transfer, Artefact Hunt)
- RULING: Hierarch's Stand | redirects a declared ranged attack onto Artanis only if Artanis is a legal target for it | redirect cannot create an illegal attack | Unsourced | CS1-P p.2
- RULING: Psionic Presence (Adept) | a passive on the Unit granting its keyword to friendlies Within 4" of its Shade, not an aura of the Adept | card measures from the Shade | Unsourced | CS1-P p.1
- RULING: Force Field | counts as terrain, removed only by movement actions; PLACE does not remove it | matches the F rulings for Grass and Creep | Unsourced | CS1-P p.5, F p.4-5
- RULING: Squadron coherency | Horizontal Coherency (stated in text; no schema axis key yet) | card wording | Unsourced | CS2-P p.3
- RULING: Timing Push 'Zergling Unit' | includes Raptor, Swarmling and Kerrigan Swarm Raptor (variants print '(Zergling)') | variant reading | Unsourced | CS1-Z, CT p.4
- RULING: Ravager Morph 'Roach Unit' | includes Vile and Corpser (variants print '(Roach)') | variant reading | Unsourced | CS1-Z, CT p.5
- RULING: Faction tags on faction and creep cards | Daelaam: PROTOSS only; Accelerating Creep: ZERG; Malignant Creep: ZERG + KERRIGAN'S SWARM | tags as printed under the art | Confirmed | CS1-P p.9, CS1-Z p.14-15
- RULING: First-weapon grants (Infantry Weapons, Missile Attacks and similar) | last endOfActivation, consumed on first use | the card gives no duration | Unsourced | CS1-T, CS1-Z, CS1-P
- RULING: Cocoon resource | 1 BM | the card prints no resource box; Zerg pays in BM | Unsourced | CS2-Z p.2; R p.83 10.5.1
- RULING: Additional Supply Depots duration | endOfRound | the card gives none | Unsourced | CS1-T p.9
- RULING: Losing HIDDEN trigger (Might of the Nerazim, Twilight Council) | fires on any loss of HIDDEN, from any cause or actor | the card names the event, not the cause | Unsourced | CS1-P p.9, CS2-P p.4
- RULING: Dae'uhl damage reduction | 2, to a minimum of 1 (code hook damage-reduce-min-one) | printed floor | Confirmed | CS1-P p.9
- RULING: Forward-deploy clearance (Ready for Dust-off, Ventral Sacs, Warp Conduit, Timing Push, Armed and Ready, Warp In) | Faction Indicator or arrival point more than 10" from enemies; once per Round only where printed (Barracks Proxy, Warp Gate) | literal card text | Unsourced | CS1-T, CS1-Z, CS1-P
- RULING: Protoss Starter preset | 3 Zealots, 4 Adepts, 2 Sentries, 2 Stalkers (980 minerals under CT 10.2026) | follows the R 12.12 example list | Confirmed | R p.108-113, CT p.7
- RULING: Preset upgrade 'model' index | 0-based model index as mustered | ArmyListDef does not say; matches Shield's 'first model' = index 0 | Unsourced | R p.108-113
- RULING: Artefact Hunt CLAIM | happens in the Scoring Phase, only on a Controlled marker (rules.json claimTiming) | card text | Confirmed | CS2-P p.5
