# 13 Dice, tests and the attack sequence

Covers the dice and tests rules (R Part 3), the full three-pool attack pipeline for ranged and close combat
(R 8.7.3-8.7.6, 8.8.1), casualty removal, Shield/HP/Damage Marker bookkeeping, Charge resolution (R 8.7.7)
and Close Ranks. Measuring, Line of Sight, terrain and coherency live in `14-measure-los-terrain.md`.

Citation key: **R p.N** = PDF page marker `=== PAGE N ===` in `StarCraft-TMG_EN.txt` (printed page + 2).
**QS** = Quick Start, **F** = FAQ v1.1 (25.09.2026), **CL** = Changelog 10.2026, **CS1/CS2** = card sheets.
CL 10.2026 changes only mineral and gas costs; it changes nothing in this file (checked CL p.1-2).
Rule IDs in brackets are for the rules checklist. All text is our own summary of the mechanics.

## 1. Dice (R p.33 3.1, 3.2; R p.34 3.8; QS p.3)
- Only six-sided dice. **D6** = one die, face value. [DICE-001]
- **D3** = roll a D6, halve, round up: 1-2 -> 1, 3-4 -> 2, 5-6 -> 3. [DICE-002]
- **nD6** (2D6, 3D6) = roll n dice and sum. [DICE-003]
- **Roll-Off**: each player rolls 2D6 and sums; higher total wins; on a tie both re-roll, repeated until
  someone wins. Used for first player (R 8.2.2), VP-tied initiative (R 8.9.6) and dispute resolution (R p.96 12.9). [DICE-004]
- Cocked dice (die not flat) are re-rolled. Physical only: the engine never produces one. [DICE-005]
- **Engine notes:** one seeded RNG service `rng.d6()`; `d3 = ceil(d6/2)`; `rollOff()` loops until
  unequal sums and logs every throw for the dice tray. Every roll goes through this service so the sim and
  replays are deterministic.

## 2. Re-rolls (R p.33 3.3; QS p.3)
- A re-roll picks the die up and rolls it again; the new result always replaces the old one, even if worse. [DICE-010]
- Unless the granting rule says otherwise, a re-roll affects exactly one die. A rule that re-rolls several
  dice follows its own text. [DICE-011]
- (QS) A die may be re-rolled at most once unless a rule says otherwise. R is silent; QS states it. [DICE-012]
- **Engine notes:** each die object carries `rerolled: boolean`; `reroll(die)` refuses when set. Re-roll
  offers are a `PendingDecision` for the player who owns the granting ability.

## 3. Modifiers, fixed additions, null values and automatic results (R p.33 3.4-3.6; R p.90 MODIFIER; QS p.3; F p.3)
- Modifiers change the **Target Number (TN)**, never the die. `+X` lowers TN by X (easier); `-X` raises it
  by X (harder). "+1 to Armour" = Armour TN down 1; "-1 to Hit" = Hit TN up 1. [DICE-020]
- All modifiers are applied **before** rolling. Modifiers from different named sources add up unless a rule
  says otherwise. [DICE-021]
- **Clamp:** the final TN is never below 2+ nor above 6+. So no modifier can make a test impossible or
  automatic (F p.3: ANTI-EVADE can only push Evade to 6+, never cancel the roll). [DICE-022]
- **Natural results:** a rolled 6 always succeeds and a rolled 1 always fails, whatever the TN. With the
  clamp this falls out naturally (TN 2..6). [DICE-023]
- **Null value "-"**: the capability does not exist. No modifier or ability can grant a roll against it.
  (QS) If a test would be made against a null value, it automatically fails. Evade "-": the unit never makes
  Evade Rolls, even when an ability grants one (R p.40 5.1.4). Speed "-": see `14` section 8. [DICE-024]
- **Fixed additions** ("D3+1") generate a value; they are not TN modifiers and are not clamped. [DICE-025]
- **Keywords never stack**: gaining the same keyword twice gives nothing extra; numeric keywords use only the
  highest value (R p.31 2.6.1; R p.84). BUFF/DEBUFF of the same characteristic are keywords, so two BUFF Speed
  do not stack, while unkeyworded modifiers from different named sources do (F p.4). A unit cannot be affected
  by two instances of the same-named Special Ability at once (R p.91). [DICE-026]
- BUFF [char] (X): TN characteristic down X, value characteristic up X, until End of Round. DEBUFF [char] (X):
  TN up X, value down X (value minimum 0) (R p.84 BUFF; R p.85 DEBUFF). [DICE-027]
- **Engine notes:** `finalTN(base, mods[]) = clamp(base - sum(mods), 2, 6)`; `null` base -> test not made
  (auto-fail) or roll not granted. Modifier records carry `sourceName` and `keyword?` so the stacking filter
  is one function: drop duplicate keywords (keep max X), drop duplicate same-named ability instances, sum
  the rest.

## 4. Tests vs value generation (R p.33-34 3.7)
- A **Test** rolls against a TN: Hit Roll, Armour Roll, Evade Roll. Characteristic Tests use the unit's own
  profile (Armour, Evade); Attribute Tests use a weapon or rule value (Hit). Success = die >= final TN. [DICE-030]
- **Value generation** has no TN: the Charge Roll (D6 + Speed), a D3 damage result, a D3/D6 Surge Die.
  Modifiers do not apply; fixed additions do. [DICE-031]
- **Engine notes:** `test(dieCount, tn) -> {successes[], failures[]}` is the single primitive that the hit,
  armour and evade steps all call. Dice with different TNs inside one Batch (e.g. LONG RANGE models) are
  rolled as separate groups but stay one Batch (R p.64 designer's note; R p.89 LONG RANGE). [DICE-032]

## 5. Ranged Attack: target eligibility and Batches (R p.62 8.7.3; R p.63; QS p.7; F p.3, p.5)
### 5.1 Who can shoot
- Assault Phase action. The unit must not have Disengaged in the previous Movement Phase unless it had
  Tactical Mass (R p.60 8.5.4). [ATK-001]
- Each model may fire **one** of its Assault Phase weapons, plus every SIDEARM weapon it carries (section 10). [ATK-002]
- BULKY weapons cannot fire while the unit is Engaged (R p.84). Weapons tied to SIEGE MODE follow that status (R p.91). [ATK-003]

### 5.2 Target eligibility (per Batch)
A target Unit is valid for a weapon only if all hold: [ATK-010]
1. At least one model of the target is **Visible** (`14` section 6) to, and **Within** the weapon's Range of,
   at least one firing model. Range is measured base to base, horizontally (`14` section 1).
2. The target's Combat Tags match the weapon's **Target**: `Ground` (needs Ground tag), `Flying` (needs Flying
   tag), `All` (either). (R p.41 5.1 item 10)
3. **Engagement status:** an Unengaged attacker cannot target an Engaged unit (exceptions: template Spillover,
   section 9; PINPOINT, R p.90; unit abilities such as INDOMITABLE, CS2). An Engaged attacker may target only
   unit(s) it is Engaged with. PINPOINT lets a shooter target Engaged enemies; it does not let an Engaged
   shooter fire out of its combat (F p.4). [ATK-011]
4. Friendly units are never valid targets unless a rule says so (R p.86 ENEMY). [ATK-012]
5. Units in Reserves cannot be targeted (R p.91 RESERVES). HIDDEN units cannot be targeted by a Ranged
   Attack unless the acting model is Within 4" (R p.88 HIDDEN). [ATK-013]
- INDIRECT FIRE: may ignore LoS for target selection and for damage resolution; the target must still be in
  Range. If the target is out of LoS it gains an Evade Roll. If at least one target model is Visible, the
  target counts as in LoS: no Evade, and non-Visible models may still be removed (R p.88; F p.5). [ATK-014]

### 5.3 Contributing models
- Only firing models that are Within Range of at least one Visible model of the target add dice
  (R p.62). Each model is measured on its own; LONG RANGE (X) extends that model's Range to X" at -1 to Hit
  for that model's dice (R p.89). [ATK-020]
- RULING: "Visible" for a contributing model means Visible from that model (not merely from any model of
  the unit).

### 5.4 Batches
- A **Batch** = all models firing the same weapon profile at the same target. All models using one profile
  must fire at the same target; a profile's fire is never split. Different profiles may go at different
  targets, each as its own Batch (R p.63 8.7.3 step 2). [ATK-030]
- **Sequence:** declare the target of one Batch, resolve it completely, then declare the next. Targets are
  not pre-declared (R p.63; F p.3). If a Batch destroys the unit the shooter was Engaged with, the shooter is
  immediately Unengaged (unless still Engaged with another) and later Batches may target freely (R p.63
  designer's note). [ATK-031]
- Batch-level keywords (PRECISION, CRITICAL HIT, Surge) act on the whole Batch pool, not per model; models are
  tracked individually only for Range, visibility and per-model Hit modifiers (F p.5). [ATK-032]
- When an ability removes dice from a Batch, the player controlling that ability picks which dice (R p.63). [ATK-033]
- **Engine notes:** `planBatches(unit, phase)` returns candidate (weaponProfile, eligibleTargets[]) pairs;
  the seat picks one, the pipeline in section 6 runs, then the planner is re-run on the survivors. A batch
  record holds `{weapon, attackerModels[], target, dieGroups[{count, hitTN}], surgeDie?}`.

## 6. Attack resolution: the three pools (R p.63-64 8.7.4; QS p.7; F p.3)
Dice move Attack Pool -> Armour Pool -> Damage Pool. The same pipeline serves ranged attacks, close combat
(section 8), HITS, IMPACT and templates (each enters at a stated step).

### Step 1 Roll to Hit [ATK-040]
- For each contributing model add dice equal to the weapon's **RoA** (after RoA modifiers: BURST FIRE Y" (X)
  if the target is Within Y" of that model, LOCKED IN (X) if the target has Stationary status, card buffs;
  R p.85, p.89). These are **Attack Dice**.
- If the weapon has an **S Dice** value (D3 or D6), add exactly **one Surge Die** for the Batch, rolled
  alongside but tracked separately (different colour). No S Dice ("-") = Surge Result 0. Surge Die results
  are value generation, not hits. [ATK-041]
- Roll the Attack Dice against the weapon's **Hit** TN (with modifiers, clamped). Successes go to the Armour
  Pool; failures are discarded.
- PRECISION (X): after the Hit roll, move up to X failed Attack Dice into the Armour Pool; they count as hits
  for everything, Surge included (R p.90). [ATK-042]

### Step 2 Resolve Surge [ATK-050]
- If the target unit has **any** Combat Tag listed in the weapon's **Surge Type** (a profile may list several,
  e.g. "Light, Armoured" on CS1 Zergling Claws), move dice equal to the Surge Result from the Armour Pool
  straight to the Damage Pool; they skip the Armour Roll. Never move more dice than the Armour Pool holds.
- No tag match: ignore and discard the Surge Die; nothing moves.
- CRITICAL HIT (X): move X dice Armour Pool -> Damage Pool, never more than the pool holds (R p.85).
  RULING: resolved in this step, after Surge (DODGE says both are handled in the Surge step).
- DODGE (X) on the target: reduce the number of dice moved by Surge and/or CRITICAL HIT by X, minimum 0,
  applied in this step (R p.86). RULING: DODGE's X is one budget shared across Surge and CRITICAL HIT, spent
  on Surge first.

### Step 3 Armour Rolls [ATK-060]
- The **defender** rolls every die left in the Armour Pool against the target unit's **Armour** (modified,
  clamped). Success = discarded. Failure = moved to the Damage Pool. Armour "-" = all fail (section 3).
- TOUGH (X) on the defender: change up to X failed Armour results into successes (R p.92-93).
- Reaction abilities that replace or augment the Armour Roll (e.g. CS1 "Infantry Armour") hook here; one
  Reaction per player per Activation (R p.32 2.7.3).

### Step 4 Evade Rolls (only if eligible) [ATK-070]
- Eligible when any applies: a Special Ability or keyword grants it; the target is **Engaged and taking damage
  from a Ranged Attack** (R p.64); HIGH GROUND Cover vs a ranged attack from lower elevation (`14` section 7.4);
  HIDDEN or BURROWED (every attack, R p.85, p.88); INDIRECT FIRE with the target out of LoS (R p.88).
- The defender rolls **every** die in the Damage Pool, Surge and CRITICAL HIT dice included (F p.3), against
  the unit's **Evade** (modified, clamped). Success = removed. ANTI-EVADE (X) gives -X to that roll (R p.84).
- Several grants never give more than one Evade Roll per die. Evade "-" = never eligible.
- Close combat: Evade only if an ability or keyword explicitly grants it against close combat attacks
  (R p.70 8.8.1 note). RULING: HIDDEN/BURROWED ("every attack targeting them") count as such a grant.

### Step 5 Resolve Damage and casualties [ATK-080]
- Empty Damage Pool: skip.
- **New Damage** = dice in Damage Pool x weapon **DMG**. PIERCE [TAG] X: DMG becomes X against a target with
  that tag (R p.90). Card effects that set DMG (e.g. CS2 Aftershock Rounds: DMG = target Size, min 1) apply here.
  GAP: no weapon in CS1/CS2 was seen with a dice-valued DMG; if one appears, roll it once per Damage die.
- **Total Damage** = New Damage + the unit's existing Damage Marker value.
- Apply abilities that reduce Total Damage (e.g. CS1 Transfusion, Life Support). They may also eat damage
  already on the marker (F p.4: a Marauder unit with 2 + 1 new damage can have all 3 removed).
- Remove casualties per section 7 (Unengaged target) or section 7.3 (Engaged target).
- **Engine notes:** `resolveBatch(batch)` = `[hit, surge, armour, evade, damage]` stage functions over a
  `{attackPool, armourPool, damagePool}` record; each stage emits a `PendingDecision` only where a player
  choice exists (PRECISION dice, TOUGH dice, reaction windows, casualty picks). Entry points: HITS/IMPACT
  start at step 3 (section 11); templates start at step 1 with a computed die count (section 9).

## 7. Damage allocation, carry-over, Shield and HP (R p.64 step 5; R p.65 8.7.5; R p.40 5.1; R p.91 SHIELDED; R p.95 12.7; F p.2-3; QS p.4, p.7)
### 7.1 Unengaged target (Visibility-limited removal)
- The **defending (controlling) player** removes models one at a time. [DMG-001]
- Eligible casualties = target models **Visible to at least one model of the attacking unit**, even if
  outside the weapon's Range (F p.3). RULING: the eligible set is snapshotted when the Batch's target is
  declared (R p.22 worked example agrees Visible models before rolling). [DMG-002]
- Loop: while some eligible model has HP <= Total Damage, the defender picks one such model, removes it and
  subtracts that model's HP. The attack can never remove more models than the eligible set holds. [DMG-003]
- If every eligible model is removed, **discard** all remaining Total Damage, including what came from the
  old marker; it never passes to non-Visible models. The marker becomes 0. [DMG-004]
- Otherwise the remainder (less than the HP of every eligible model) becomes the unit's new Damage Marker
  value (tracked on a D6 at the table; the engine stores an integer with no cap). [DMG-005]
- CONCENTRATED FIRE (X): at most X models removed by that attack; after the X-th, discard the rest; it is not
  recorded (R p.85). [DMG-006]
- RULING: with mixed HP in one unit (e.g. Shield on the first model), the defender may pick any eligible model
  whose HP fits in the remaining Total Damage; removal stops only when no eligible model fits.

### 7.2 HP, Shield and Shielded status
- HP = damage one model absorbs before removal. The Damage Marker is **per unit**, not per model. [DMG-010]
- Shield (optional stat): added to the HP of the unit's **first model** (F p.2: Zealot 4 HP + Shield 3 = 7 HP
  first model). Damage to that combined pool can be healed normally. [DMG-011]
- The unit is **Shielded** until either: Total Damage assigned to it **exceeds** the Shield value (Shield 3 is
  lost at 4+, not 3; checked after damage resolves and after damage-reduction abilities, F p.2), or its first
  model is removed. NON-LETHAL DAMAGE also counts (F p.2). Lost Shielded status never returns (HEAL cannot
  restore it). Losing it removes no HP; it only switches off Shielded-dependent effects. [DMG-012]
- (F) overrides QS p.4 ("until it receives damage equal to Shield").
- RULING: "first model" = model index 0 of the unit as mustered; the check compares the Total Damage computed
  in step 5 (after reductions, before casualties) and the marker after NON-LETHAL against the Shield value.
- HEAL (X): reduce the Damage Marker by X; never returns removed models (R p.88). RESPAWN returns models
  under its own limits (R p.91). NON-LETHAL DAMAGE (X): add X to the marker, remove no models even if it
  exceeds HP; the next standard damage uses the combined total (R p.90). [DMG-013]
- After any removal update the unit's Current Supply Value immediately (R p.41 item 8). Last model removed ->
  unit Destroyed, all its effects end, its tokens go unless STAY IN PLAY (R p.56 7.4). [DMG-014]

### 7.3 Engaged target: priority removal (R p.65 8.7.5; F p.3)
- Whenever an **Engaged** unit loses models **from any source**, ignore Visibility entirely (every model is
  eligible) and remove in strict priority: [DMG-020]
  1. Models not Within Engagement Range of any enemy unit.
  2. Models Within Engagement Range but not in base-to-base contact.
  3. Models in base-to-base contact with an enemy model.
- At priority 2 or 3 the defender may not pick a model whose removal would end the unit's Engagement with
  **any specific** enemy unit, as long as another valid casualty exists in any tier (F p.3: keep Engagement
  with all enemy units). [DMG-021]
- Leftover damage is recorded on the marker as usual (no Visibility discard while engaged).
- RULING (algorithm): candidates = models whose removal breaks no engagement; pick from the lowest non-empty
  tier among them. If no such model exists, pick from the lowest non-empty tier of all models (matches the
  R p.65 Zealot/Hydralisk example). QS p.8 phrases tiers by Fighting/Supporting rank; R wins.
- **Engine notes:** `allocateDamage(unit, total, mode, eligibleIds?, cap?)` is the one allocator for every
  damage source; it returns the removal order (as defender decisions) and the new marker value. `mode` =
  `visible` | `engaged`. Supply recompute and Shielded check run once at the end.

## 8. Close Combat Attack (R p.69-70 8.8, 8.8.1; QS p.8; F p.3, p.5)
- Combat Phase. Only Engaged Ground units activate; every Engaged unit **must** activate; Flying units never
  take part and cannot be attacked in close combat. Players alternate; a player passes only when no Engaged
  units remain. After the attack, remove the unit's Activation Marker. [CC-001]
### Step 1 Close Ranks (optional) [CC-010]
- Choose a Leading Model and move it up to **3"** by the standard Move rules (`14` section 8) with:
  it must end **closer** to the unit(s) it is Engaged with than it started; it may not bring the unit into
  Engagement with any enemy unit that was not Engaged with it at the **start of this Phase**; it cannot be
  used to Disengage from any enemy unit.
- Models already in base-to-base contact with an enemy at the start of this step are pinned and do not move.
  If every model is already base-to-base, Close Ranks is impossible (F p.3).
- Set the other (unpinned) models In Coherency; links may pass through enemy models the unit is Engaged with.
  Placement preference: base-to-base with enemy models wherever possible; otherwise base-to-base with a
  friendly same-unit model that is Within Engagement Range.
- RULING: the Leading Model must be an unpinned model; "closer" = its shortest base-to-base distance to any
  model of any unit it is Engaged with strictly decreases; the standard "cannot end Within 1" of an enemy"
  restriction is waived only for enemy units already Engaged with it.
- Close Ranks is a repositioning action: coherency check, Stationary lost, Grass destroyed (`14`).
### Step 2 Declare attackers [CC-020]
- **Fighting Rank**: model Within Engagement Range (1") of an enemy model.
- **Supporting Rank**: not itself Within 1" of an enemy, but in base-to-base contact with a same-unit model
  that is in the Fighting Rank (R p.92 SUPPORTING RANK).
- No LoS needed. Both ranks strike the enemy unit as a whole.
- RULING: Fighting Rank needs a pair that could legally be Engaged (`14` section 9: Ground vs Ground, no Size
  2+ terrain between, compatible elevations); 1" alone across a wall does not count.
### Step 3 Roll attacks [CC-030]
- Same pipeline as section 6 using only **Combat Phase** weapons (Range E). A model with several picks one,
  plus any SIDEARM Combat Phase weapons.
- Evade only if explicitly granted against close combat (section 6 step 4).
### Step 4 Multiple enemy units [CC-040]
- A model may attack an enemy unit only if it is in the Fighting Rank with a model of that unit, or Supporting
  a friendly model that is. The attacking player assigns each eligible model to one target (R p.23 worked
  example).
- Declare which target gets the Surge Die **before rolling**; it cannot be split. The other target's dice have
  Surge Result 0.
- Splitting is one Batch: Batch keywords such as PRECISION may be allocated wholly to one target pool or split
  (F p.5).
### Step 5 Casualties: engaged priority (section 7.3). [CC-050]
### Step 6 Post-combat [CC-060]
- If none of the unit's models is Within 1" of an enemy, it is Unengaged at once. A unit freed this way that
  has not yet activated this Phase effectively passes (no mandatory activation) and acts normally next Round,
  unless a Reaction or trigger lets it act.
- **Engine notes:** Combat Phase = loop `while engagedUnits(seat)` forcing `activate(unit)`; Close Ranks reuses
  the generic `moveUnit(unit, {maxDist:3, mustCloseOn:engagedSet, noNewEngagement:phaseStartSet})`.

## 9. Template weapons (R p.66 8.7.6; R p.96 12.8; F p.3, p.5; QS p.7)
- Range "FT" or S Dice/RoA shown as "BT" / "BT+N" marks a template weapon (CS2 Siege Tank). [TPL-001]
- **Alignment.** BT: placed to cover as much of the target model's base as possible; the target base centre
  is the Target Point. FT: narrow end flush with the attacker's base edge, aimed at the target; Target Point =
  target base centre. Templates affect only models at the Target Point's elevation. Flying models have no
  elevation for templates: a template never affects them unless the weapon is Target All/Flying. [TPL-002]
- **Targets.** Pick one enemy unit as Primary by normal eligibility; its covered models are the Main target.
  Every other covered model (friendly or enemy) is **Spillover** if it shares the elevation and at least one
  Combat Tag with the Primary (F p.5). Spillover ignores the "no shooting Engaged units" rule. [TPL-003]
- **Affected** = base partly or fully covered, same elevation as Target Point, a line from the target model's
  base (BT) or attacker's base (FT) to it not blocked by Size 2+ terrain, and a legal target type. [TPL-004]
- **Dice.** Main: Attack Dice = affected models in the Primary + RoA modifiers (e.g. "BT+4" adds 4). No Surge
  Die: Surge Result = number of affected Primary models, applied only on a Surge Type tag match. Spillover:
  one separate Batch per unit, dice = its affected models, no RoA modifiers, no Surge, no weapon keywords
  (F p.5). Batches may be resolved in any order (F p.3). Per-batch defender effects such as Guardian Shield
  apply to each Batch (F p.5). [TPL-005]
- Ability templates with no Primary (Psionic Storm, Plague): the caster is the attacker, the point under the
  template centre is the Target Point and Primary; no tag match needed; Flying models count at the elevation of
  their physical base (F p.5). [TPL-006]
- GAP: template dimensions (BT diameter, FT length/widths) are not in the extracted text (diagram only;
  searched R p.66-67, p.96, QS, F, CS2). Keep them as config constants until confirmed.
- RULING: casualty eligibility for template Batches uses the normal rules (Visible models, or engaged priority),
  not just the affected models.

## 10. Multi-weapon units, SIDEARM, SPECIALIST (R p.63; R p.91 SIDEARM, SPECIALIST; R p.41; QS p.7; F p.5)
- Weapons belong to one phase (Assault or Combat) and are usable only in that phase. [WPN-001]
- Normal limit: one weapon per model per attack action. **SIDEARM** weapons ignore that limit: a model may use
  its SIDEARM weapon(s) as well as its normal weapon, all of them if it has several. Each SIDEARM profile is its
  own Batch and may target a different unit (all models firing that SIDEARM profile still share one target). [WPN-002]
- SPECIALIST: only one model per unit may carry that weapon; if that model is removed the weapon is gone (it
  cannot be moved to another model) (F p.5). [WPN-003]
- "FOR [weapon]" upgrades replace the named weapon entirely (R p.41 5.2). [WPN-004]

## 11. Automatic hits and other entry points (R p.88 HITS, IMPACT)
- HITS X (Y): put X dice straight into the Armour Pool; DMG = Y; no Surge; continue at step 3. [ATK-090]
- IMPACT (X) Y: immediately after a successful Charge, each model in the Fighting or Supporting Rank makes X
  Impact Dice; a model ranked against several enemy units may split its dice among them. Roll per target unit;
  each result >= Y puts 1 die into that unit's Armour Pool; DMG 1; no Surge; continue at step 3. [ATK-091]
- RULING: Impact Hit Rolls are Tests (TN Y), so the 2+..6+ clamp and natural 1/6 apply.

## 12. Charge (R p.67-68 8.7.7; R p.94 12.4; QS p.8)
- Assault Phase action by an **Unengaged Ground** unit. Flying units never Charge or are Charged. A unit that
  Disengaged last Movement Phase cannot Charge unless it had Tactical Mass (R p.60). [CHG-001]
- **1 Declare.** Declare every target unit (all must be Ground) before rolling. No LoS needed (HIDDEN units can
  therefore be Charged). [CHG-002]
- **2 Distance.** Choose the Leading Model and nominate one model per target unit as its Charge target. Roll
  1D6 + the unit's current Speed = **Charge Roll Distance** (value generation). Measure along the actual path,
  going around impassable obstacles, obeying Gap Clearance and all standard Move restrictions except the
  ban on ending near the declared targets (`14` section 8). [CHG-003]
- **3 Success test.** The Charge succeeds only if the Leading Model can legally end: Wholly Within the Charge
  Roll Distance of its start (path length <= distance); Within 1" of **every** declared target; not overlapping
  any base or impassable terrain; not Within 1" of any enemy unit that was **not** declared. Otherwise the Charge
  fails: the unit does not move and its activation ends. [CHG-004]
- **4 Move.** Put the Leading Model there, base-to-base with the nominated Charge target model(s) if possible,
  else as close as possible inside 1". Set the rest In Coherency (links may pass through enemy models now
  Engaged). None may end Within 1" of an undeclared enemy unit. Placement priority per model: A base-to-base
  with a declared target model; B Within 1" of a target; C as close as possible to the Leading Model. [CHG-005]
- Then IMPACT if the unit has it (section 11). Both sides are now Engaged where 7.2.1 allows (`14` section 9).
- RULING: "Enemy Unit not declared" in step 3/4 means enemy **Ground** units (Flying units are never Engaged and
  ground models may end touching them, R p.60).
- RULING: success needs the Leading Model Within 1" of at least one model of each declared unit (literal R);
  if terrain/elevation then prevents a legal Engagement (`14` 9), the charge still "succeeds" but no Engagement
  forms with that unit.
- **Engine notes:** `chargePlan(unit, targets, roll)` reuses the path-finder from `14` with `maxDist = speed +
  roll` and an end-region constraint (within 1" of each target, outside 1" of others); the AI previews odds by
  computing the minimum roll needed (`needed = ceil(pathLen - speed)`, P = (7 - needed)/6 clamped 0..1).
