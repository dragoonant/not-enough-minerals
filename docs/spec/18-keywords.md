# 18 Keywords and statuses

Every BOLD CAPS keyword in the Core Rules Part 11 glossary, every keyword printed on the Founders Edition,
faction-starter and wave 2 card sheets, the recurring named card abilities that behave like keywords, and every
status. Rule IDs in brackets (`KW-nnn`, `ST-nnn`, `CA-nnn`) feed the rules checklist.

Source tags: R = Core Rules (StarCraft-TMG_EN, 128 pp), F = FAQ v1.1 (25.09.2026), CL = Changelog 10.2026 (dated
09.10.2026), CT = Cost Table 10.2026, QS = Quick Start. Card sheets: CS1-T / CS1-Z / CS1-P = wave 1 Terran / Zerg /
Protoss, CS2-T / CS2-Z / CS2-P = wave 2. **Page numbers are PDF pages** (the `=== PAGE n ===` markers in
`docs/sources/text/`); R's printed folio is the PDF page minus 2 (Part 11 = R p.84-93, printed 82-91).

CL 10.2026 changes costs only (unit, upgrade and Tactical Card prices). It changes no keyword text or value.
Every keyword below is therefore R Part 11 plus FAQ clarifications marked (F). See `19-errata-and-faq.md`.

## 0. General keyword rules (R p.31 2.6.1-2.6.2; R p.84 Part 11 intro; F p.4)
1. A keyword means the same thing wherever it appears. [KW-001]
2. Keywords do not stack. Gaining a keyword you already have does nothing. For a numeric keyword, only the
   highest value counts: PRECISION (1) + PRECISION (2) = PRECISION (2). [KW-002]
3. Modifiers (+X/-X to a Target Number) and flat characteristic changes ("increase Speed by 2") are NOT keywords:
   they stack when they come from differently named sources (R p.33 3.4). Two BUFF Speed grants do not stack with
   each other, but either one stacks with flat Speed bonuses (F p.4: Wild Mutation and Glial Reconstitution both
   grant BUFF Speed, so only the higher applies; Accelerating Creep and Creep Speed are flat and stack). Three
   +1 IMPACT Hit Roll modifiers from Malignant Creep, Evolution Chamber and Adrenal Overload stack to +3 (F p.4). [KW-003]
4. A Unit is never under two instances of the same-named Special Ability at once; only one applies
   (R p.81 10.1; R p.91 SPECIAL ABILITY). [KW-004]
5. Priority: card or ability text beats the Core Rules when they conflict (R p.31 2.6.2). [KW-005]
6. Weapon keywords (PRECISION, CRITICAL HIT, Surge and the like) act on the whole Batch dice pool, not per model.
   Models are tracked separately only for Range, visibility and per-model modifiers such as the LONG RANGE -1 (F p.5). [KW-006]
7. When one Batch is split between several Enemy Units in close combat, it is still one Batch; the attacker may
   assign keyword effects (e.g. PRECISION dice) to either pool or split them (F p.5). [KW-007]
8. Weapon keywords never carry into Spillover Batches; Spillover is resolved as a bare attack with no modifiers
   (F p.5; R p.92 SPILLOVER). Effects that act on the target side per Batch (Guardian Shield: -1 die) DO apply to
   every Spillover Batch separately (F p.5). [KW-008]
9. Target Numbers clamp to 2+..6+. Natural 6 always succeeds, natural 1 always fails (R p.33 3.4, 3.6). A modifier
   can therefore never cancel a roll entirely; ANTI-EVADE can at worst push Evade to 6+ (F p.3). [KW-009]
10. A Null characteristic (`-`) means the capability does not exist; nothing can grant a roll against it
    (R p.33 3.4). A Unit with Evade `-` never makes an Evade Roll, even when HIDDEN, BURROWED, INDOMITABLE,
    INDIRECT FIRE or an ability "grants" one. A Unit with Speed `-` cannot be moved or repositioned by any means,
    including PLACE (R p.40 5.1), except DISPLACEMENT granted by its own card (see KW-042). [KW-010]
- Engine notes: one `keywords(entity, phaseCtx)` resolver returns a map `name -> value|true` built from base card
  data, upgrades, and active Effects; numeric keywords reduce with `max`. Modifiers live in a separate list of
  `{sourceName, target: 'hit'|'armour'|'evade'|'impactHit'|..., delta}` deduplicated by `sourceName` then summed,
  then clamped 2..6 at roll time. Null characteristics are `null` in data and short-circuit every "grant".

## 1. The attack pipeline hooks (R p.63-64 8.7.4; R p.66 8.7.6; F p.3, p.5)
Every weapon keyword hooks into one step of the three-pool pipeline. One function runs it for Ranged Attacks,
Close Combat Attacks (R p.70 8.8.1 step 3), and (from step 3) HITS and IMPACT.

| Step | What happens | Keywords / effects that act here |
|---|---|---|
| 0 Target | eligibility, Batch forming | PINPOINT, BULKY, INDIRECT FIRE, HIDDEN, BURROWED (via HIDDEN), INDOMITABLE, FLYING, Target tag, SIDEARM, SPECIALIST, LONG RANGE (range), BUFF/DEBUFF Range |
| 1 Roll to Hit | RoA dice per in-range model, +1 Surge die if S Dice present | BURST FIRE, LOCKED IN, BUFF/DEBUFF RoA, BUFF/DEBUFF Hit, LONG RANGE (-1 for far models), die removal (Guardian Shield, Point Defense Laser) |
| 1b after Hit roll | failed dice may be promoted | PRECISION |
| 2 Resolve Surge | Surge die (if tag matches) then CRITICAL HIT move dice Armour Pool -> Damage Pool | Surge, CRITICAL HIT, DODGE (reduces both) |
| 3 Armour Rolls | defender rolls Armour Pool | TOUGH, BUFF/DEBUFF Armour |
| 4 Evade Rolls | only if eligible | ANTI-EVADE, HIDDEN, BURROWED, INDIRECT FIRE (no LoS), Engaged-vs-Ranged, granted Evades |
| 5 Damage | dice x Damage, add carried Damage, reductions, casualties | PIERCE, Damage setters (Titan Killers, Aftershock Rounds), caps (Improved Barrier), CONCENTRATED FIRE, damage reduction reactions, Visibility limit |

- Reactions that fire on "declares/targets/receives Damage" are blocked when the weapon has INSTANT (KW-026).
- Engine notes: `resolveBatch(ctx)` with named hook points `onTarget, onHitPool, afterHit, onSurge, onArmour,
  onEvade, onDamage, onCasualties`; every keyword below registers on exactly one hook. HITS and IMPACT enter at
  `onArmour` with a synthetic weapon `{damage: Y|1, surge: none, keywords: {}}`.

## 2. Weapon keywords

### KW-020 ANTI-EVADE (X) (R p.84; F p.3)
- Against Enemy Units, the target's Evade Roll for this attack gets a -X modifier (Target Number +X, max 6+).
- Only matters if the target is eligible to Evade at all (step 4). Never removes the roll (F p.3).
- Prophetic Vision (Zeratul) fixes Evade at 4+ "cannot be modified", so ANTI-EVADE has no effect on it (CS2-P p.2).
- Used: Slugthrower (+1 within 8", Marine CS1-T p.1, Raynor's Raider p.6), "Justice" Revolver (2) (Raynor p.4),
  Hellfire Missiles (1) (Goliath p.7), Let's Have a Blast! (1) (Barracks (Proxy) p.10), Glaive Cannon (1) and
  Guidance (2) (Adept CS1-P p.1; Nerazim Watchers CS2-P p.3).
- Engine: `onEvade` modifier `{target:'evade', delta:-X}` sourced from the weapon.

### KW-021 BULKY (R p.84)
- The weapon cannot make a Ranged Attack while its Unit is Engaged. Other weapons of the Unit are unaffected.
- Used: Commando Rifle (Raynor CS1-T p.4).
- Engine: `onTarget` filter: drop weapon if `unit.engaged`.

### KW-022 BURST FIRE Y" (X) (R p.85)
- When the target is Within Y" of the attacking model, that model's RoA for this weapon is +X. Checked per model.
- Used: C-14 Rifle upgrade for Commando Rifle, BURST FIRE 8" (3) (Raynor CS1-T p.4).
- Engine: `onHitPool` per-model RoA add when `dist(model, targetUnit) <= Y`.

### KW-023 CONCENTRATED FIRE (X) (R p.85)
- An attack with this weapon removes at most X models. After X removals the rest of Total Damage is discarded;
  it is not written to the Damage Marker and does not carry over.
- Applies per Batch; a SIDEARM copy of the weapon is its own Batch with its own cap.
- Edge: carried-over Damage already on the Unit's marker is part of Total Damage; if the cap is hit, that portion
  is discarded too (literal reading: "discard any remaining Total Damage"). RULING logged.
- Used: Left/Right Photon Disruptor (1) (Immortal CS2-P p.1).
- Engine: `onCasualties` cap counter; when reached set `totalDamage = 0` and skip marker write.

### KW-024 CRITICAL HIT (X) (R p.85; R p.63 8.7.4; F p.5)
- Move X dice from the Armour Pool straight to the Damage Pool, skipping Armour. Never more than the Armour Pool holds.
- Resolved in step 2 after Surge (R p.63 says both Surge and CRITICAL HIT bypass the Armour Roll; DODGE is applied
  "during the Resolve Surge step", which fixes CRITICAL HIT there too). RULING logged (order Surge then CRITICAL HIT).
- Per Batch; not on Spillover (F p.5).
- Used: Blades (2) (Kerrigan CS1-Z p.2), Orders 1 CP option (2) (Raynor CS1-T p.4), Infantry Weapons (1)
  (Engineering Bay CS1-T p.8), Vehicle Weapons (1) (Barracks (Tech Lab) p.10), Ground Weapons (1) (Forge CS1-P p.10),
  Fury Unyielding (1) (Immortal CS2-P p.1), Sentenced to Death (2) (Zeratul CS2-P p.2), Might of the Nerazim (2)
  (Nerazim faction CS2-P p.4).
- Engine: `onSurge` after Surge: `moved = min(X, armourPool.length)`.

### KW-025 INDIRECT FIRE (R p.88; F p.5)
- Ranged Attacks may ignore Line of Sight for picking the target and for resolving Damage. Range still applies.
- If the target Unit has no model in the attacker's LoS, the target gets an Evade Roll against this attack.
- If at least one target model is Visible, the Unit counts as in LoS: no Evade from this rule, and non-Visible
  models CAN be removed as casualties (F p.5).
- If no model is Visible, casualty removal ignores LoS, so any model may be removed (literal R: "ignore LoS ...
  resolving Damage").
- Does NOT bypass HIDDEN: HIDDEN forbids selecting the Unit beyond 4" regardless of LoS (ST-002). RULING logged.
- Used: Rocket Launcher (Marine CS1-T p.1), Scatter Missiles (Goliath p.7), Smart Shells grant (Siege Tank CS2-T p.1).
- Engine: `onTarget` sets `ctx.losRequired = false`; `ctx.indirectNoLos = !anyVisible`; `onEvade` grants Evade
  when `indirectNoLos`; casualty filter uses `visibleOnly = !(indirect)` only when no model is Visible.

### KW-026 INSTANT (R p.88)
- Enemy Units may not declare or resolve Reaction abilities in response to an attack with this weapon.
- Scope (RULING): blocks every opposing Reaction whose trigger is that attack or a step inside it (targeted,
  declared, Armour Roll, receives Damage), whether printed on a Unit Card or a Tactical/Faction Card used for
  the target. Passive abilities still work unless they name INSTANT (Point Defense Laser does: CS1-T p.5).
- Used: Disruption Beam (Sentry CS1-P p.5), Claws (Kerrigan Swarm Raptor CS1-Z p.4), Master Warp Blade (Zeratul
  CS2-P p.2); granted by Fury of the Nerazim (Stalker vs already-Activated target, CS1-P p.6), Ancient Pride (Nexus
  CS1-P p.10), Predation (Lair CS1-Z p.15).
- Engine: `ctx.instant = true`; reaction window builder skips the defending side for triggers raised inside ctx.

### KW-027 LOCKED IN (X) (R p.89; F p.5)
- +X RoA for this weapon when the TARGET Unit has STATIONARY status (F p.5: the target, not the shooter).
- Used: Scatter Missiles (6) (Goliath CS1-T p.7); Shaped Blast grants (4) in SIEGE MODE (Siege Tank CS2-T p.1).
- Engine: `onHitPool` RoA add if `target.status.has('STATIONARY')`. For a template weapon, add to the RoA modifier.

### KW-028 LONG RANGE (X) (R p.89; F p.5)
- Maximum Range becomes X". Each model measures separately: within the printed Range -> normal; beyond it but
  Within X" -> -1 to Hit for that model's dice.
- A Batch with both groups is one Batch: build all dice, roll the two groups separately (R p.89; R p.64 designer note).
- Optical Flare (Medic) stops the target Unit's weapons benefiting from LONG RANGE (CS1-T p.3).
- BUFF/DEBUFF Range changes the printed Range only; it never changes X (RULING).
- Used: AGG-12 (18"), Rocket Launcher (18"), Autocannon (18"), Scatter Missiles (24") (CS1-T p.1, p.7); Laser
  Targeting Systems (16") (Marauder p.2); Grooved Spines (16") (Hydralisk CS1-Z p.1); Photon/Phase Disruptors (16)
  (Immortal CS2-P p.1); Smart Shells (24) (Siege Tank CS2-T p.1). Values printed without the inch mark mean inches.
- Engine: `onTarget` range check uses `max(range, longRange)`; `onHitPool` tags far models' dice with `hitDelta:-1`.

### KW-029 PIERCE [TAG] (X) (R p.90)
- Against a Unit with the named Combat Tag, the weapon's Damage is X. Cards print it `PIERCE Armoured (2)`.
- Damage-setting order (RULING): PIERCE and other "Damage is treated as" setters first (Titan Killers = 2 vs Size 3+;
  Aftershock Rounds = target Size, min 1); if two setters apply, the attacker picks; caps last (Improved Barrier:
  max 1 while the target is Shielded).
- Used: Quad K12 Armoured (2) (Marauder CS1-T p.2), Commando Rifle Armoured (3) (Raynor p.4), Haywire Missiles
  Armoured (3) (Goliath p.7), Twin Cannon Armoured (2) (Siege Tank CS2-T p.1), Glaive Strike Light (2) (Adept CS1-P
  p.1), Left/Right Phase Disruptor Armoured (3) (Immortal CS2-P p.1).
- Engine: `onDamage` `damage = setters.reduce(...)` then `caps`.

### KW-030 PINPOINT (R p.90; F p.4)
- Ranged Attacks with this weapon may target an Enemy Unit that is Engaged (overrides R p.62 8.7.3 step 1).
- It does NOT let an Engaged shooter fire at Units it is not Engaged with (F p.4: shoot into combat, not out of it).
- Casualties on the Engaged target follow the Engaged priority order (R p.65 8.7.5).
- Used: "Justice" Revolver (Raynor CS1-T p.4), Underbelly Machine Gun (Goliath p.7), Glaive Cannon (Nerazim
  Watchers CS2-P p.3); Shaped Blast grants it in SIEGE MODE (Siege Tank CS2-T p.1).
- Engine: `onTarget` relaxes only the "target is Engaged" filter.

### KW-031 PRECISION (X) (R p.90; F p.5)
- After the Hit roll, move up to X FAILED Attack Dice into the Armour Pool; they count as hits for everything,
  including the Surge step (they enlarge the pool Surge can draw from).
- Per Batch (F p.5); not on Spillover (F p.5); may be split across targets of one split melee Batch (F p.5).
- Used: Stimpack (3) Marine/Raynor's Raider, Stimpack (2) Marauder (CS1-T p.1, p.2, p.6); Ares-Class Targeting
  (1) (Goliath p.7); Adrenal Glands (2) (Zergling, Raptor CS1-Z p.10-11); Missile Attacks (1) (Hydralisk Den p.14);
  Wild Mutation (1) (Kerrigan's Swarm p.14); Feral Rage (2) (Spawning Pool, Six Pool p.15-16); Psionic Presence (1)
  (Adept Shade CS1-P p.1); We Stand As One (2) (Zealot p.7); Quick Strikes (2) (Gateway, Gate Chronoboosted, Warp
  Gate p.8-9); For the Ancients (1) (Immortal CS2-P p.1); Pound 'Em Flat! (2) (Factory (Tech Lab) CS2-T p.2).
- Engine: `afterHit` move `min(X, failed)` dice.

### KW-032 SIDEARM (R p.91; R p.63 8.7.3)
- Models carrying it may fire/strike with it in addition to their one normal weapon, in Ranged and Close Combat
  Attacks. A model with several SIDEARMs uses all of them in the same activation.
- Each SIDEARM profile is its own Batch and may target a different Enemy Unit (normal eligibility). All models
  firing the same SIDEARM profile pick the same target.
- Used: Rocket Launcher (Marine CS1-T p.1), "Justice" Revolver (Raynor p.4), Scatter/Haywire/Hellfire Missiles and
  Underbelly MG (Goliath p.7), Right Photon/Phase Disruptor (Immortal CS2-P p.1).
- Engine: weapon list split into `primary` (pick one per model) and `sidearms[]` (all); each yields its own Batch.

### KW-034 SPECIALIST (R p.91; R p.77 9.1.7; F p.5)
- Army building: at most one model in the Unit carries that weapon/upgrade; the Unit may not buy the same SPECIALIST
  upgrade twice but may buy different ones (each on one model).
- When the carrier is removed, the weapon is gone; it cannot be moved to another model, and you cannot remove a
  different model to keep it (F p.5). Casualty choice is otherwise free (unless Engaged priority or visibility bind).
- Used: AGG-12, Rocket Launcher (Marine CS1-T p.1).
- Engine: per-model `loadout`; validator enforces count <= 1 per SPECIALIST entry; removal deletes the loadout.

### KW-035 SPILLOVER and templates (R p.91-92; R p.66 8.7.6; F p.3, p.5)
- Template weapons (Blast Template BT, Flamer Template FT) hit every covered model on the Target Point's elevation
  with an unblocked trace (Size 2+ terrain blocks). Models of the Primary target Unit are the Main target; every
  other covered Unit (Friendly or Enemy) is a separate Spillover Batch if it shares at least one Combat Tag with the
  Primary target and its elevation (F p.5: one shared tag suffices, e.g. Ground).
- Main target dice = affected models + weapon RoA modifiers; Surge result = affected models (no Surge die) and
  applies only if the Surge Type matches. Spillover dice = affected models only; no RoA modifiers, no Surge, no weapon
  keywords (F p.5). Batches may be resolved in any order (F p.3).
- Flying models have no elevation for templates; a GROUND LEVEL template never hits them unless the weapon is
  Target: All/Flying (R p.66). Abilities that drop a template without a target (Psionic Storm, Plague; none in our
  slice): the using Unit is the attacker, the template centre is Target Point and Primary target, no tag matching,
  and Flying Units count at their base's level (F p.5).
- Used: Shock Cannon, BT, printed RoA "BT+4" = affected models +4 dice (Siege Tank CS2-T p.1).
- Engine: `templateHits(template, point) -> {main: models[], spill: Map<unitId, models[]>}`; each entry becomes a
  `resolveBatch` with `bare = true` for spillover.

### KW-036 Target / Surge tags (R p.85 COMBAT TAGS; R p.63-64)
- Weapon `Target` column (Ground / Flying / All) filters eligible targets. Surge Type lists tags; Surge only fires if
  the target has one listed tag. Effects can add Surge Types and change S Dice (Target Lock: Light, Armoured, D3+1;
  Hydriodic Bile: Light, D3+1; Grenades - Frag: S Dice D6 within 8").

## 3. Effect keywords (things abilities "resolve")

### KW-040 BUFF [Characteristic] (X) / KW-041 DEBUFF [Characteristic] (X) (R p.84, p.85; F p.4)
- BUFF: until the End of the Round, Target-Number characteristics (Hit, Armour, Evade) improve by X (number goes
  down); value characteristics (Speed, RoA, Range) go up by X.
- DEBUFF: the reverse; value characteristics never drop below 0. Target Numbers still clamp 2+..6+.
- Same-keyword rule: one BUFF Speed at a time (highest X). BUFF and DEBUFF of the same characteristic both apply.
- Duration is End of the Round even when the granting text says "for this roll" or "before an Armour Roll"
  (Potent Bile DEBUFF Armour (1) lasts the Round). RULING logged (literal keyword definition).
- Effects that end "at the End of the Round" survive all End of the Round effects and are removed in Cleanup
  (R p.81 10.1; R p.74 8.9.5). They keep running on a Unit returned to Reserves and still expire on schedule (R p.61).
- Split Speed (e.g. 4/7): the buff applies to whichever value is in use (R p.40 5.1: second value only for a
  single-model Unit). Speed changes feed Move, Run, Deploy and Charge (Speed + D6).
- Removal: Restoration (Medic, Queen, Sentry) removes ALL DEBUFFs from the Unit when it receives one.
- Used: BUFF Speed (3) Stimpack; BUFF Speed (1)/(2) Glial Reconstitution (on Creep (2)); BUFF Speed (1) Wild
  Mutation; BUFF Speed (2) Zealous Charge, Might of the Nerazim; BUFF RoA (1) Resonating Glaives; BUFF Range (4)
  Weapons of the Firstborn; DEBUFF Speed (2) Concussive Shells, Void Prison (while Within 2" of the indicator);
  DEBUFF Range (4) Optical Flare; DEBUFF Hit (1) Debilitating Saliva; DEBUFF Armour (1) Potent Bile.
- Engine: an Effect `{kind:'buff'|'debuff', stat, x, expires:'endOfRound'}` keyed by `kind+stat` with max-reduce;
  tracked as blue/red markers in the UI (R p.92 STATUS).

### KW-042 DISPLACEMENT (R p.85-86)
- A Leading Model may end any Move, Deploy, Run, Charge, Disengage, Close Ranks or ability-move overlapping this
  Token or model. The Leading Model's controller then sets the displaced Token/model in base contact with the
  Leading Model, or as close as possible.
- Used: Shade token (Adept, Nerazim Watchers), Ravager Burrow token (Ravager CS2-Z p.1), Creep Tumor tokens with
  Living Glob of Tissue (both Creep Cards CS1-Z p.14-15), Point Defense Drone (Gliding, CS1-T p.5).
- Point Defense Drone has Speed `-`; its own Gliding text lets it be displaced (card beats core rule, R p.31 2.6.2).
- Engine: movement end-validator treats DISPLACEMENT entities as non-blocking, then runs `relocateAdjacent(entity,
  leadingModel)`; the relocation is not a move (no Creep Removal, no Stationary loss for a token).

### KW-043 HEAL (X) (R p.88; F p.2, p.4)
- Remove X points from the Unit's accumulated Damage. Never returns models (see RESPAWN). Never restores SHIELDED.
- Shield points are part of the first model's HP pool and are healed like any HP (F p.2).
- Used: Medpack HEAL (X = models of the Medic Unit Within 4" of the target; Stabilizer Medpacks +1 model)
  (CS1-T p.3); Field Repair HEAL (2) (Factory CS1-T p.10, Factory (Tech Lab) CS2-T p.2); Regeneration HEAL (2) on
  activation if Burrowed (Roach, Corpser, Vile); Veil of Shadows HEAL (2) after a PLACE (Twilight Council CS1-P p.9).
- Engine: `unit.damage = max(0, unit.damage - X)`.

### KW-044 HITS X (Y) (R p.88)
- The Unit takes X automatic hits: X dice go straight into its Armour Pool, then Armour Rolls and the rest of the
  pipeline (steps 3-5, so Evade if eligible). Damage per die is Y. No Surge.
- No attacking weapon exists, so weapon keywords never apply; target-side effects (TOUGH, DEBUFF Armour, damage
  reduction reactions) do.
- Casualties (RULING): no attacking model, so the Visibility limit is ignored; if the Unit is Engaged use the
  Engaged priority order (R p.65 8.7.5 "from any source").
- Used: Photon Overcharge HITS 3 (1) (Overcharged Nexus CS1-P p.9), Shadow Strike HITS 4 (1) to every Enemy Unit
  Engaged with Zeratul (CS2-P p.2), Corrosive Bile HITS 5 (1) per token Within 1" at End of Assault Phase (Ravager
  CS2-Z p.1; Potent Bile adds DEBUFF Armour (1) first).
- Engine: `resolveBatch({entry:'armour', dice:X, damage:Y, weapon:null})`.

### KW-045 IMPACT (X) Y (R p.88; F p.4; CS1-P p.2)
- Right after this Unit completes a successful Charge, each of its models in the Fighting Rank or Supporting Rank
  generates X Impact Dice. A model ranked against one Enemy Unit sends all its dice there; a model ranked against
  several may split them.
- Roll each target Unit's dice separately (Impact Hit Roll): each result >= Y puts 1 die in that Unit's Armour Pool;
  then Armour Rolls and on (steps 3-5). No Surge; Damage 1.
- Impact Hit Roll modifiers stack across named sources: Adrenal Overload +1, Extended Claws +1, Malevolent
  Matriarch +1 (if the Charge was declared ON CREEP) = up to +3, Y clamped to 2+ (F p.4).
- My Life for Aiur: +1 Impact die per eligible model (Zealot CS1-P p.7).
- HIDDEN Units are immune (R p.88 HIDDEN). Flying Units cannot be Charged, so never take IMPACT.
- In our sets IMPACT always comes from the Devastating Charge ability (CA-001). Lightning Dash's second Charge does
  not trigger it again (Artanis CS1-P p.2).
- Engine: post-Charge hook `impact(unit)`; per model compute ranks vs each target; a decision `splitImpact` only when a
  model touches 2+ targets.

### KW-046 MORPH (Unit Name) X (R p.90; F p.5)
- Needs enough Available Supply (checked before the swap, literal reading; RULING). Set one model of the named Unit
  in base contact with a model of the active Unit, then remove X models of the active Unit. The new model is a new
  Unit, may not be set Within 1" of any Enemy Unit, gets an Activation Marker and cannot activate again this Round.
- The opponent scores VP for every point of Supply the original Unit loses, as for casualties (F p.5); a Morphed Unit
  later yields VP like any other Unit (F p.5).
- If X removes the last model, the original Unit is gone (RULING: treated as Destroyed for scoring; Supply 0 at one
  Roach model means 0 VP).
- Used: Ravager Morph, once per game, active friendly Roach Unit, MORPH (Ravager) 1 (Cocoon CS2-Z p.2).
- Engine: atomic `morph(activeUnit, unitDefId, x)`; new Unit enters with `activatedThisRound = true`.

### KW-047 NON-LETHAL DAMAGE (X) (R p.90; F p.2, p.4)
- Add X to the Unit's Damage Marker without removing models, however large Total Damage gets. The next standard
  Damage adds on top and removes casualties normally from the combined total.
- Strips SHIELDED exactly like standard damage (F p.2).
- Combat Shield grants an Evade Roll against it (F p.4). RULING: the X points are rolled as X Evade dice of 1 Damage each.
- Used: Stimpack NON-LETHAL DAMAGE (2) (Marine, Marauder, Raynor's Raider CS1-T).
- Engine: `unit.damage += X` with `suppressCasualties = true`.

### KW-048 PLACE (X) (R p.90; R p.55 7.2; F p.3-5)
- Pick a Leading Model, lift it and set it Wholly Within X" of where it started; then lift and reset the rest In
  Coherency. Ignores Gap Clearance and elevation rules; not a path. Must end legal and not Within Engagement Range of
  an Enemy model, EXCEPT in the Assault Phase, where it may end in Engagement Range (the Unit becomes Engaged), unless
  the granting card forbids it (Blink, Ready for Pickup?, Rapid Reinforcements "8"", Burrow Ambush "10"").
- A PLACE is not a movement action: it does not trigger Creep Removal (F p.5), cannot remove a Force Field (F p.4),
  and does not destroy Grass (Grass removal lists only movement actions; RULING). It does end STATIONARY (R p.92).
- PLACE (0) (Artanis' Phase Prism): set Artanis in base contact with a model of the chosen Friendly Unit (F p.4).
- "Resolve PLACE (X) from another Friendly Unit / from the Entry Edge": the start point is that Unit or edge
  (Rapid Reinforcements, Burrow Ambush, Phase Prism). A Structure cannot be that Unit for Rapid Reinforcements (F p.4).
- Psionic Transfer (a SET at the Shade token) may set the Adepts within Engagement Range (F p.5).
- A Unit carrying an Artefact Hunt marker must DROP it before any PLACE; Adepts may not Psionic Transfer while carrying
  (F p.4; CS2-P p.5).
- Speed `-` Units can never be PLACEd (R p.40).
- Coherency is checked after a PLACE (R p.37 4.4).
- Used: PLACE (18) Burrow Ambush (all Zerg ground units), PLACE (10) Rapid Reinforcements, PLACE (12) Ready for
  Pickup?, PLACE (6) Leaping Strike / Blink / Void Blink, PLACE (3) Phase (Warp Prism), PLACE (0) Phase Prism.
- Engine: `place(unit, origin, radius, opts:{allowEngage, minEnemyDist})` sharing the legal-position validator with
  Deploy; emits `placed` (not `moved`) events.

### KW-049 RESPAWN (X) (R p.91)
- Return up to X Destroyed models. A return that would raise the Unit's Supply bracket is not allowed (stop one short).
- Each returned model is set in base contact with a model of the Unit, not Within Engagement Range of any Enemy Unit;
  a model that cannot be set legally is not returned. Cannot exceed the Unit's starting model count.
- Used: Zergling Reconstitution RESPAWN (2), or (3) ON CREEP (Swarmling CS1-Z p.12); Spawn Larva RESPAWN (2) for a
  non-Unique Biological Size 1 Unit (Cocoon CS2-Z p.2).
- Engine: `respawn(unit, x)` loops `while n<x && bracket(models+1)==bracket(models) && placeable`.

### KW-050 SUMMON (Unit Name) (R p.92; R p.78 9.1.9)
- Set the named Unit's Leading Model in base contact with the Parent Unit, the rest In Coherency, none Within
  Engagement Range of an Enemy Unit, none Within the opponent's Zone of Influence.
- Needs Available Supply for its Current Supply Value. Gets an Activation Marker; cannot activate in the Phase it
  arrives. In later Phases it must activate immediately after its Parent's activation, before the opponent's next
  activation; if the Parent is off the battlefield it activates normally.
- Summoned Units (Roachling, Point Defense Drone, Pylon) cost no minerals, take no Army Slots, never start in Reserves,
  enter only by an ability, count toward Total Current Supply, and are ignored for The Final Score (R p.78 9.1.9).
- Used: Roachling Infestation, once per game, 2 BM (Corpser CS1-Z p.7).
- Engine: Unit field `parentId`; activation picker forces the child immediately after the parent.

## 4. Defensive keywords

### KW-060 DODGE (X) (R p.86)
- When this Unit is targeted, reduce by X (min 0) the dice that Surge and CRITICAL HIT move from the Armour Pool to
  the Damage Pool, during the Resolve Surge step. RULING: X is one total reduction across Surge + CRITICAL HIT;
  undone dice stay in the Armour Pool and are rolled normally.
- Used: Guardian Shell DODGE (2) (Power Field CS1-P p.10), Plasma Shields DODGE (1) if Shielded (Robotics Facility CS2-P p.4).
- Engine: `onSurge` final pass `moved = max(0, moved - X)`.

### KW-061 TOUGH (X) (R p.92-93)
- On an Armour Roll, turn up to X failed results into successes (discarded, not moved to Damage).
- Used: Infantry Armor / Vehicle Plating / Carapace / Ground Armor TOUGH (1) "for this roll" (Reactions); Ancillary
  Carapace TOUGH (1) first Armour Roll each Activation (Hydralisk); Heavy Plating TOUGH (1) unless SIEGE MODE (Siege
  Tank); Shield Overcharge TOUGH (2) first Armour Roll each Round (Praetor Guard, Passive) or Reaction if Shielded
  (Immortal); Plasma Shields TOUGH (1) if Shielded.
- Two TOUGH grants on one roll do not add (highest only).
- Engine: `onArmour` flip `min(X, fails)`.

## 5. Statuses (R p.92 STATUS; R p.55-56 7.3.2)
A Status is a keyword describing a mode or condition of a Unit. Unless a rule says otherwise it survives Cleanup and
stays until something removes it. Modes (SIEGE MODE, BURROWED) use plastic markers; other statuses use blue (buff) or
red (debuff) markers; all these markers are STAY IN PLAY. [ST-000]

### ST-001 BURROWED (R p.84-85; F p.2; CS1-Z)
1. Gaining BURROWED also gives HIDDEN. At the Start of each Round a BURROWED Unit gains HIDDEN again. Losing
   BURROWED also removes HIDDEN.
2. Size counts as 0 for every purpose (LoS/Effective Size, Gap Clearance, Titan Killers, Aftershock Rounds -> Damage 1).
3. Current Supply Value counts as 0 for Disengage checks (Tactical Mass), both when it disengages and when an enemy
   disengages from it.
4. Cannot Control or Contest Mission Markers (may still CLAIM in Artefact Hunt, F p.2).
5. Allowed actions: Deploy, Move, Disengage, Run, Hold, Close Ranks. Doing any of them except Hold removes BURROWED
   immediately (Tunneling Claws: Move and Run keep it). So no Ranged Attack and no Charge while BURROWED.
6. Special Abilities still work unless stated.
7. Evade Roll against every attack (if Evade is not `-`).
8. Other models may move through its models but may not end Within its Engagement Range (overrides R p.59 8.5.3).
   It still engages normally (Ground, 1").
9. Engaged at the start of the Combat Phase: it must activate; it cannot strike while BURROWED; it may Close Ranks as
   its first step (removes BURROWED) and then attack normally; if it cannot or does not Close Ranks it does not attack.
   A Unit whose models are all already in base contact cannot Close Ranks (F p.3). Enemies attack it normally.
- Sources: Burrow (2 BM, Unengaged, any Phase: toggle; Roach, Corpser, Vile); Lie in Wait (Hatchery: active Unengaged
  Ground Unit); Rapid Burrowing (Zerg Swarm: any Friendly Unengaged Ground Zerg Unit, even if already Activated).
  Removal: Nasty Surprise (Roach Warren). Roachling can never gain it (Underdeveloped Claws).
- Returning to Reserves: R is silent on BURROWED; the later Deploy action removes it (rule 5). RULING.
- Engine: `status.burrowed` drives: `sizeFor(unit)=0`, `actionsAllowed`, `canContest=false`, `passThroughBy=others`,
  and a status hook adding HIDDEN; Combat-Phase activation offers only `closeRanks|pass`.

### ST-002 HIDDEN (R p.88, p.93 VISIBLE; F p.5; CS cards)
1. Cannot be selected as the target of a Ranged Attack or of any Special Ability that needs LoS unless the acting
   model is Within 4". Its models are not Visible to any model more than 4" away, whatever the LoS.
2. Immune to IMPACT.
3. Evade Roll against every attack (unless Evade `-`).
4. Casualties from a Ranged Attack: only models Visible to at least one attacking model can be removed (R p.64; F p.3),
   so only HIDDEN models Within 4" of an attacker. Engaged targets ignore Visibility (R p.65 8.7.5).
5. Not blocked: Charges (no LoS needed, R p.67), close combat, HITS, abilities that target an area or set a token
   (F p.5: Scanner Sweep, Oversight Mode, Surveillance place a Faction Indicator and are not "targeting" the Unit).
6. INDIRECT FIRE does not lift the 4" limit (RULING, see KW-025).
7. Detection: while an Enemy Unit is Within 6" of a detector (Omega Worm's Detection; Scanner Sweep / Oversight Mode /
   Surveillance indicator; Nerazim Farsight around the Shade token) it loses HIDDEN. "While within" is checked at the
   start and end of every action or ability (F p.5) and when HIDDEN would be gained (RULING: a Unit inside a detection
   area cannot hold HIDDEN). Leaving the area does not give it back; only a new grant does (BURROWED at Start of
   Round, One With the Shadows after Zeratul's next action, etc.).
- Sources: BURROWED; Path of Shadows / Anakh Su'n "until it performs another action"; Darkness Descends "until the
  End of the Round"; One With the Shadows (Zeratul gains it after every action). Might of the Nerazim reacts to
  losing it.
- Engine: one `canTarget(actor, target, {needsLos})` and one `isVisible(model, observer)` that both apply
  `hidden && dist > 4`; detection is an aura evaluated by the status engine at every action boundary.

### ST-003 SIEGE MODE (R p.91; CS2-T p.1)
1. No Move, Disengage, Run, Charge or Close Ranks actions.
2. Weapons marked "SIEGE MODE Status" in the Keyword column work only in SIEGE MODE; all other weapons are unusable
   while in it (so an Engaged sieged tank makes no Close Combat Attack: it activates and does nothing; RULING).
3. Lost when the Unit is returned to Reserves.
4. Card rules (Siege Tank): toggle via Mode Transformation (Active, 1 CP); Size treated as 3 while sieged; Heavy
   Plating off while sieged; Point Blank: cannot target Units it is Engaged with while sieged (overrides Indomitable for
   that case); Aftershock Rounds: Damage = target Size (min 1) while sieged; Shaped Blast / Smart Shells (Reactions,
   0 CP, once per game each) need SIEGE MODE.
- Engine: `status.siege` filters the action menu and the weapon list; `sizeFor(unit)` returns 3.

### ST-004 STATIONARY (R p.92; F p.5)
- Every Unit gains it at the Start of the Round. Lost immediately if any model moves, is moved, or is PLACEd for any
  reason (DISPLACEMENT relocation of the Unit's own model counts as being moved; RULING).
- Read by LOCKED IN (target), Lurking (Hydralisk evade), Pound 'Em Flat! (Factory (Tech Lab)).
- Engine: set in `startOfRound`; any `moved|placed` event on a model clears it for that Unit.

### ST-005 SHIELDED (R p.91; F p.2)
1. A Unit with a Shield value adds it to the HP of its first model and starts SHIELDED. Example: Zealot 4 HP +
   Shield 3: the first casualty needs 7 Damage (F p.2).
2. SHIELDED is lost when Total Damage on the Unit exceeds the Shield value (Shield 3: lost at 4+, not at 3), checked
   after damage is assigned, so reductions applied before assignment can keep it (F p.2); or when the first model is
   removed.
3. Losing it does not remove HP; it only switches off effects that need SHIELDED (Improved Barrier, Shield Overcharge
   (Immortal), Plasma Shields). HEAL never restores it (F p.2). NON-LETHAL DAMAGE strips it like any damage (F p.2).
- Engine: `unit.shieldPool` applies to the first casualty; `shielded = !firstRemoved && damage <= shield`.

### ST-006 BUFF / DEBUFF markers. See KW-040/041.

### ST-007 ON CREEP (R p.90; F p.3, p.5; CS1-Z p.3, p.13-15)
- A Friendly OR Enemy Ground Zerg Unit is ON CREEP while Within 6" of any Creep Tumor token or a Source of Creep model
  (Omega Worm). It is a keyword state, checked like any "while within" condition (start and end of each action).
- For movement bonuses it is checked at the start of the move and lasts the whole move (F p.5).
- Units in Reserves are never ON CREEP; a Deploy uses base Speed (F p.3).
- Creep Tumors: tokens (Size 0, removed at end of Round unless STAY IN PLAY; both Creep Cards give STAY IN PLAY and
  DISPLACEMENT). Creep Removal: an Enemy Unit ending a Move, Deploy, Run, Charge or Disengage Within 1" of a Friendly
  tumor removes it; PLACE does not (F p.5). Spawn: Spawn Creep Tumor (Queen, base contact), Creep Spread (Hatchery,
  Lair) / Excrete Creep (Overlord): Within 6" of a Friendly Entry Edge or existing tumor, no LoS.
- Read by: Glial Reconstitution, Lurking, Creep Speed, Speed on Creep, Malevolent Matriarch, Wild Mutation, Zergling
  Reconstitution.
- Engine: derived flag recomputed by the aura pass; movement captures it at move start.

### ST-008 Other unit states (not called Status in R but tracked the same way)
- Engaged / Unengaged (R p.86, p.93; R p.55 7.2): Ground vs Ground only, Within 1" horizontally, no Size 2+ terrain
  between, elevation rules. One Engaged model makes the whole Unit Engaged. Flying is always Unengaged.
- Activated (Activation Marker, Movement side then Assault side; R p.55 7.3.2). Removed after a Combat Phase attack.
- In Reserves (R p.90-91 RESERVES): untargetable, abilities off unless stated, no contesting, no Supply on table, keeps
  upgrades and Damage; final Round: anything still in Reserves is Destroyed for scoring (R p.74 8.10).
- Destroyed (R p.56 7.4): every effect on it ends; its Tokens are removed unless STAY IN PLAY; effects it put on others
  remain. Never returns (F p.2) unless a mission says so.
- Carrying (Artefact Hunt CLAIM, CS2-P p.5): see KW-099.
- Engine: all states are fields of `UnitState`; Effects carry `expires` of `endOfRound | untilAction | permanent |
  whileWithin(aura)`.

## 6. Ability and timing keywords

### KW-070 REPEATABLE (R p.90; R p.81 10.2; F p.5)
- Exempts an ability from Once per Round: usable several times per Round and per Activation if costs and triggers are
  met each time.
- A REPEATABLE Reaction is still limited to one Reaction per player per Activation, and outside activations to once
  per trigger (F p.5).
- Used: Orders (Raynor CS1-T p.4: pay 1/1/2 CP per use), Prophetic Vision (Zeratul CS2-P p.2).
- Engine: usage counter key `(unitId, abilityName, round)` skipped when REPEATABLE; reaction limiter unchanged.

### KW-071 SPECIAL ABILITY (R p.91; R p.31-32 2.7; R p.81-83 Part 10; F p.3-4)
- Every named ability is Active, Passive or Reaction.
- Active: only while the Unit is Activated, immediately before declaring or right after resolving an action, never
  mid-action; once per Round per Unit per name unless REPEATABLE; effects end at End of Round unless stated. A Unit
  may use any number of differently named Actives and Tactical Card abilities in one activation if it can pay (F p.4).
  Using a Tactical Card's Active needs an active Unit on the battlefield even if it does not affect that Unit (F p.4).
- Passive: always on while on the battlefield. Simultaneous Passives: controller orders them; Active Player first.
- Reaction: declared at the exact trigger moment; one Reaction per player per Activation; once per Round per Unit per
  name; may fire outside an activation (then one per trigger Phase, and the First Player Marker holder resolves
  first if both react) (F p.4). Inside an activation the Active Player resolves first (R p.32 2.7.3).
- All three are off in Reserves unless stated (F p.3: only abilities saying so, like Raiders Roll!, or ones that
  deploy the Unit, like Armed and Ready or Phase Prism, work before deployment).
- "Select" and "target" are the same thing (F p.4). A Unit is within range of itself (F p.4).
- Costs: exhaust Ready cards of the matching resource (CP Terran, BM Zerg, PE Protoss); surplus is lost (F p.3; R p.83 10.5.1).
  An Exhausted card's printed abilities are unusable until Refreshed (F p.4).
- Engine: ability descriptors `{type, phases, cost, oncePer:'round'|'game'|null, repeatable, trigger}` checked by one
  `canUse()`.

### KW-072 READY (R p.90; R p.83 10.5.2)
- Default face-up card state; Exhausted cards flip back in Cleanup & Refresh.

### KW-073 STAY IN PLAY (R p.92; R p.74 8.9.5)
- The Token, Marker or effect survives Cleanup & Refresh and stays until its own end condition. Also survives its
  creator being Destroyed or returned to Reserves (R p.56 7.4; R p.61).
- Used: Creep Tumors under Living Glob of Tissue (CS1-Z p.14-15); all Status markers (R p.92).
- Engine: token flag `persist`; cleanup filter.

### KW-074 Duration phrases on cards (R p.81 10.1; F p.4)
- "Until the End of the Round" survives End-of-Round effects, removed at Cleanup. "Until it performs another action":
  ends when the Unit next starts an action. "While within": checked at start and end of each action/ability and
  applied immediately (F p.5). "Once per Game": one use per game per Unit (card text).

## 7. Movement, terrain and elevation terms (R p.84-89)
- KW-080 ACCESS POINT: the only way to change elevation; Coherency Links may run through one (F p.2: you may set models
  onto High Ground through an Access Point by Coherency alone). Raptor Strain ignores Access Points.
- KW-081 BLOCKING TERRAIN: any piece with Effective Size >= 1; whether it blocks LoS is decided by the Cover tests
  (see LINE OF SIGHT). Moving through it is separate (Size, Access Points, Gap Clearance).
- KW-082 EFFECTIVE SIZE: model Size + Size of the terrain it stands on (stacks through stacked terrain). Flying models
  count as taller than every terrain piece and never add terrain. BURROWED = Size 0; SIEGE MODE = Size 3.
- KW-083 ELEVATION LEVEL / GROUND LEVEL / MID GROUND / HIGH GROUND: playmat; horizontal terrain Size 1-2; Size 3+.
  A base on several levels counts as the highest. GROUND <-> HIGH never Engage; MID engages either only if both models
  touch the same Access Point linking their levels.
- KW-084 FLYING (Combat Tag): ignores terrain for movement (point to point, horizontal measure); passes through and is
  passed through by other models; never Engaged; must end 1"+ from Enemy Flying; ignores Full Cover but not Direct Cover
  or the Elevation Dead Zone; no HIGH GROUND Cover; cannot Control/Contest markers; cannot Charge or be Charged; never in
  the Combat Phase; ignores elevation and Access Points; moving over Grass does not destroy it but ending on it does.
  Used: Point Defense Drone.
- KW-085 GRASS: Size 2 that blocks LoS but not movement; destroyed when a Leading Model's path crosses it or any model
  ends on it during Move, Deploy, Run, Charge, Disengage or Close Ranks. Gone for good.
- KW-086 IMPASSABLE TERRAIN: a piece with no Access Point to its neighbouring level; nothing moves through, onto or over
  it or ends on it. Size 0-1 terrain can still be moved through. Raptor Strain: Raptors pass Impassable Size <= 4 and
  change elevation freely; Coherency Links follow anything the Leading Model may cross (F p.2). Force Fields are terrain:
  Size <= 2 Units cannot cross them even with Raptor Strain or Tunneling Claws (F p.4); Size 3+ models may cross and
  remove them by movement only (not PLACE, F p.4). Large (Siege Tank): gaps < 3" never passable; crossing or ending on
  Size 0-1 Impassable terrain (not tokens) removes it.
- KW-087 LEADING MODEL: the one model that travels a measured path in Move, Deploy, Run, Charge, Disengage, Close Ranks
  or any "nominate a Leading Model" action; the rest are set In Coherency around it. Its Size sets Gap Clearance. A
  Move/Run of 0" is not allowed (counts as Hold, F p.2). "Directly towards/away" moves must go the maximum distance (F p.2).
- KW-088 LINE OF SIGHT / VISIBLE: 2D top-down trace from any part of base to any part of base. No Blocking Terrain on
  the trace -> Visible. Otherwise blocked only by one piece that alone meets Full Cover (terrain ES >= both models' ES),
  Direct Cover (either model Within 1" of that piece and terrain ES >= that model's ES; the 1" may be to any part of the
  piece, F p.2) or the Elevation Dead Zone (High Ground vs Ground Level model Within 1" of the same piece's base). Close
  Quarters: both Within 1" of the same piece and Within 3" of each other -> trace normally. Pieces never combine. Gaps
  inside a footprint block unless agreed. LoS is mutual. Long walls in official layouts are several pieces (F p.2).
  HIDDEN overrides beyond 4".
- Engine: one geometry module owns `effectiveSize`, `los`, `engaged`, `canEndAt`; statuses feed it via `sizeFor`.

## 8. Supply, army and player terms (R p.84-93)
- KW-090 ACTIVE PLAYER: whose turn it is. CONTROLLING PLAYER: commands the Unit/Token, makes all decisions and rolls;
  a control transfer makes the new controller treat it fully as their own. ENEMY / FRIENDLY: opposite sides; you never
  attack a Friendly Unit unless a rule says so; your own models are Friendly.
- KW-091 ARMY SLOT: Core, Elite, Support, Air, Hero; a Unit fills slots of its type equal to its starting Supply;
  Faction Card gives the base pool, Tactical Cards add more; unused slots are lost.
- KW-092 AVAILABLE SUPPLY: Supply Pool minus Total Current Supply on the battlefield; deploy only if the Unit's Current
  Supply fits; on-table total may never exceed the Pool; final Round: Pool unlimited.
- KW-093 CURRENT SUPPLY VALUE / SUPPLY VALUE: from the Supply Profile bracket for the current model count, updated the
  moment a casualty drops the bracket; used for deployment, marker control, Tactical Mass, Supply VP. Starting Supply =
  composition chosen at army building = Army Slots taken.
- KW-094 TACTICAL MASS: Current Supply greater than the combined Current Supply of all Enemy Units it is Engaged with
  (measured when the Disengage is declared, R p.46 6.2) -> no Disengage penalty (may shoot/Charge next Assault Phase).
  BURROWED counts 0; Commander counts +1.
- KW-095 FACTION TAGS: Race and Sub-Faction tags; a Unit/Tactical Card is legal only if every one of its tags is on the
  Faction Card.
- KW-096 COMBAT TAGS: Armoured, Biological, Light, Mechanical, Psionic, Flying, Ground; drive weapon Target, Surge
  Type and conditional keywords. Ground (tag) is not GROUND LEVEL (elevation).
- KW-097 FIRST PLAYER MARKER: Roll-Off winner gives it for Round 1; holder picks who activates first each Phase; first
  to Pass in Phase 1 or 2 takes it for the next Phase; after Phase 4 it goes to the player with fewer VP (Roll-Off on a tie).
- KW-098 RESERVES: see ST-008. ENTRY EDGE: the Deployment Card's edge for your arrivals. ZONE OF INFLUENCE: 6" in from
  your Entry Edge (corner markers when the edge is partial); no arrival (deploy, transport-style ability, SUMMON) may
  end Within the opponent's ZoI; no other effect. Omega Worm and Pylon bases count as Friendly Entry Edges (Burrow
  Ambush may start there; immune to Photon Overcharge) but make no ZoI; forward-deploy cards (Barracks (Proxy), Warp
  Prism) are exceptions, not Entry Edges (F p.3).
- KW-099 MISSION MARKERS: 32 mm, Activated/Deactivated; 1 & 3 Red, 2 & 4 Blue, 5 Neutral. Contest: on the battlefield,
  In Coherency (as of its last move, F p.2), a model Within 3" with LoS on the marker's elevation (marker Size 0).
  Control: higher total Current Supply; ties never transfer; sticky; Supply 0 controls if uncontested. Flying,
  BURROWED and Structures never contest. Deactivated markers can be controlled (F p.2).
- Artefact Hunt CLAIM / DROP (CS2-P p.5): from Round 2, in the Scoring Phase a Unit Within 3" of a Controlled Neutral or
  opponent-colour marker may CLAIM it (marker goes on its card; one at a time). It must DROP it when its Current Supply
  drops, before any PLACE, when Engaged with enemies of greater combined Supply, or when it leaves the battlefield; the
  opponent then sets the marker Within 2". Flying and BURROWED Units may claim (F p.2); Psionic Transfer forbidden while
  carrying (F p.4).

## 9. Measurement and combat-rank terms
- KW-100 WITHIN: any part of the base inside the distance; a Unit is Within if one model is. WHOLLY WITHIN: whole base
  inside; for a Unit, every model. All horizontal (R p.35 4.1).
- KW-101 ENGAGEMENT RANGE: 1" horizontally from a base; melee weapons have Range `E`.
- KW-102 FIGHTING RANK: model Within 1" of an Enemy model. SUPPORTING RANK: in base contact with a same-Unit model in
  the Fighting Rank, not itself Within 1" of an enemy. Both strike in the Combat Phase and both generate IMPACT dice.
- KW-103 MODIFIER: see section 0 rule 9; distinct from fixed additions such as D3+1 (R p.33 3.5).

## 10. Recurring card abilities that work like keywords (card sheets)
- CA-001 Devastating Charge (Passive): after a successful Charge, resolve IMPACT (X) Y as printed. Values: Kerrigan
  (4) 4+; Kerrigan Swarm Raptor (2) 5+; Queen (4) 3+; Roach (2) 4+; Corpser (3) 4+; Vile (1) 4+; Zergling, Raptor,
  Swarmling (1) 5+; Ravager (2) 4+; Goliath, Siege Tank, Immortal (4) 3+; Artanis (6) 4+; Zealot, Praetor Guard (3) 4+;
  Zeratul (4) 4+.
- CA-002 Burrow Ambush (Passive upgrade): when nominated to deploy, may PLACE (18) from its own Entry Edge (or a Friendly
  Entry Edge such as the Omega Worm, F p.3); no model Within 10" of an Enemy model; activation ends. Still a Deploy:
  needs Available Supply; ZoI applies. (Hydralisk, Roach, Corpser, Vile, Zergling, Raptor, Swarmling, Ravager.)
- CA-003 Structure (Passive; Point Defense Drone, Omega Worm, Pylon): never activates or acts; Current Supply 0; never
  Controls or Contests, even uncontested (no Zero Supply exception); cannot be the target of an ability unless the
  ability says so (Transfusion does). Area effects and abilities aimed at the Unit as a whole still reach it; it is
  excluded only where an ability's own targeting excludes it (F p.4). It can be attacked and Charged (Ground ones).
- CA-004 Detection (Omega Worm): Enemy Units Within 6" lose HIDDEN (see ST-002 rule 7). Same mechanic as Scanner Sweep,
  Oversight Mode, Surveillance (6" around a Faction Indicator) and Nerazim Farsight (6" around the Shade token).
- CA-005 Source of Creep (Omega Worm): Ground Zerg Units Within 6" are ON CREEP.
- CA-006 Squadron (Hydralisk, Raptor, Zergling, Swarmling, Kerrigan Swarm Raptor, Ravager, Stalker): Horizontal
  Coherency 4" instead of 3".
- CA-007 Indomitable (Goliath, Siege Tank, Immortal): while Engaged, may shoot at and be shot by Unengaged Enemy Units;
  the defender of such an attack gets an Evade Roll (none for Evade `-` Units).
- CA-008 Gliding (Point Defense Drone): has DISPLACEMENT. Point Defense Laser: when another Friendly Unit Within 4" is
  targeted by a non-INSTANT Ranged Attack, remove up to 2 dice from the Attack Pool, then remove the drone.
- CA-009 Large (Siege Tank): see KW-086.
- CA-010 Commander (Raynor, Kerrigan, Artanis): Supply +1 for Control, Contest, objectives and Disengage checks.
- CA-011 Regeneration (Roach, Corpser, Vile): on becoming Activated while BURROWED, HEAL (2).
- CA-012 "X: Activation ends" deploy abilities (Rapid Reinforcements, Burrow Ambush, Phase Prism, Warp Conduit (Pylon)):
  the deploying Unit gets its Activation Marker and does nothing else that Phase (F p.3).
- CA-013 End-of-Round deployment from an indicator or token (Ready for Dust-off, Ventral Sacs, Warp Conduit (Warp Prism),
  Psionic Transfer, Deep Tunnel): Leading Model in base contact with the marker, rest In Coherency, all outside Enemy
  Engagement Range; if impossible the ability is wasted. Opponents may stand on the indicator to block it; a blocked
  indicator is removed at End of Round with no deployment (F p.3-4).
- Engine: these are data-driven ability descriptors built from the generic keyword effects above; no per-unit code.

## 11. Keyword inventory by card (where each keyword appears)
| Keyword | Cards (sheet p.) |
|---|---|
| ANTI-EVADE | Marine, Raynor's Raider (Slugthrower) CS1-T p.1, p.6; Raynor p.4; Goliath p.7; Barracks (Proxy) p.10; Adept CS1-P p.1; Nerazim Watchers CS2-P p.3 |
| BULKY | Raynor CS1-T p.4 |
| BURST FIRE | Raynor CS1-T p.4 |
| CONCENTRATED FIRE | Immortal CS2-P p.1 |
| CRITICAL HIT | Raynor CS1-T p.4; Engineering Bay p.8; Barracks (Tech Lab) p.10; Kerrigan CS1-Z p.2; Forge CS1-P p.10; Immortal, Zeratul, Nerazim CS2-P p.1, p.2, p.4 |
| DISPLACEMENT | PDD CS1-T p.5; Creep Cards CS1-Z p.14-15; Adept CS1-P p.1; Ravager CS2-Z p.1; Nerazim Watchers CS2-P p.3 |
| DODGE | Power Field CS1-P p.10; Robotics Facility CS2-P p.4 |
| HEAL | Medic CS1-T p.3; Factory p.10; Factory (Tech Lab) CS2-T p.2; Roach, Corpser, Vile CS1-Z p.6, 7, 9; Twilight Council CS1-P p.9 |
| HIDDEN | Orbital Command CS1-T p.9; Omega Worm CS1-Z p.3; Overseer p.13; Stalker CS1-P p.6; Observer p.10; Zeratul, Nerazim Watchers, Nerazim, Void Seeker CS2-P p.2-4 |
| BURROWED | Roach, Corpser, Roachling, Vile CS1-Z p.6-9; Hatchery, Zerg Swarm p.13; Roach Warren p.15 |
| HITS | Overcharged Nexus CS1-P p.9; Ravager CS2-Z p.1; Zeratul CS2-P p.2 |
| IMPACT | every Devastating Charge (CA-001); Raptor/Kerrigan Swarm Raptor (Adrenal Overload); Evolution Chamber, Malignant Creep CS1-Z p.13-14; Zealot (My Life for Aiur) CS1-P p.7 |
| INDIRECT FIRE | Marine CS1-T p.1; Goliath p.7; Siege Tank CS2-T p.1 |
| INSTANT | PDD (reference) CS1-T p.5; Kerrigan Swarm Raptor CS1-Z p.4; Lair p.15; Sentry, Stalker CS1-P p.5-6; Nexus p.10; Zeratul CS2-P p.2 |
| LOCKED IN | Goliath CS1-T p.7; Siege Tank CS2-T p.1 |
| LONG RANGE | Marine, Marauder, Goliath, Medic (denial) CS1-T; Siege Tank CS2-T; Hydralisk CS1-Z p.1; Immortal CS2-P p.1 |
| MORPH | Cocoon CS2-Z p.2 |
| NON-LETHAL DAMAGE | Marine, Marauder, Raynor's Raider CS1-T |
| ON CREEP | Hydralisk, Omega Worm, Queen, Roach, Corpser, Vile, Swarmling, Kerrigan's Swarm, Malignant Creep, Accelerating Creep CS1-Z |
| PIERCE | Marauder, Raynor, Goliath CS1-T; Siege Tank CS2-T; Adept CS1-P; Immortal CS2-P |
| PINPOINT | Raynor, Goliath CS1-T; Siege Tank CS2-T; Nerazim Watchers CS2-P |
| PLACE | Raynor's Raider, Dropship CS1-T; Kerrigan, all Burrow Ambush units CS1-Z, CS2-Z; Artanis, Stalker, Warp Prism, Twilight Council CS1-P; Zeratul CS2-P; Artefact Hunt mission |
| PRECISION | see KW-031 |
| REPEATABLE | Raynor CS1-T p.4; Zeratul CS2-P p.2 |
| RESPAWN | Swarmling CS1-Z p.12; Cocoon CS2-Z p.2 |
| SHIELDED | Immortal, Robotics Facility CS2-P; every Protoss Shield value |
| SIDEARM | Marine, Raynor, Goliath CS1-T; Immortal CS2-P |
| SIEGE MODE | Siege Tank CS2-T p.1 |
| SPECIALIST | Marine CS1-T p.1 |
| STATIONARY | Hydralisk CS1-Z p.1; Factory (Tech Lab) CS2-T p.2 (and LOCKED IN) |
| STAY IN PLAY | Malignant Creep, Accelerating Creep CS1-Z p.14-15 |
| SUMMON | Corpser CS1-Z p.7 |
| TOUGH | Engineering Bay, Barracks (Tech Lab) CS1-T; Siege Tank CS2-T; Hydralisk, Evolution Chamber CS1-Z; Praetor Guard, Forge CS1-P; Immortal, Robotics Facility CS2-P |
| BUFF / DEBUFF | see KW-040/041 |
| ACCESS POINTS, IMPASSABLE TERRAIN | Raptor Strain CS1-Z p.4, p.11 |
| GROUND LEVEL | Omega Network (Kerrigan's Swarm) CS1-Z p.14; Pylon Warp-In (Khalai) CS1-P p.8 |
| Part 11 keywords on no card in our slice | GRASS, ELEVATION terms (terrain only), SPILLOVER (only via BT), FLYING (PDD tag only) |

## 12. GAPs
- GAP: CRITICAL HIT's step in the pipeline is not stated in its own entry; inferred from DODGE ("Resolve Surge step")
  and R p.63. Searched R Part 11, 8.7.4, F Attack Sequence/Keywords.
- GAP: Whether IMPACT counts as an "attack" for abilities that grant Evade "against all attacks" (Precognition, HIDDEN,
  BURROWED). R IMPACT says only "proceed to Armour Rolls". We run steps 3-5 including Evade when eligible (RULING).
  Searched R p.88, p.64, F p.3-5.
- GAP: How HIDDEN interacts with a Unit leaving a detection area (re-gain or not). R/F silent; ruling in ST-002.
- GAP: BURROWED/HIDDEN on return to Reserves. R p.61 lists only timed effects and SIEGE MODE (p.91). Ruling in ST-001.
- GAP: Roach and Corpser print Glial Reconstitution as "1 CP" (a Terran resource) while Vile prints "1 BM"
  (CS1-Z p.6, p.7, p.9). We use 1 BM for all three (RULING, see 19).
- GAP: Pylon Combat Tags print "ARMORED" (US spelling, CS1-P p.4); treated as Armoured.
