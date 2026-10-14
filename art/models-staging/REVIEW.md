# Figure batch review (MGSD gate, 2026-10-13)

Checked against `docs/KNOWLEDGE-BASE.md` 9.6 (MGSD: about 2-2.5 heads, head ~40% of height, stubby legs,
chunky feet), plus: single figure, base intact, footprint inside the base, no lettering/logos, no extra
limbs or duplicated weapons, mesh faithful to the concept, palette matches the faction's batch-1 look.
Inputs: `art/unit-concepts/<slug>.png` and `art/models-staging/contact-<slug>.png`.
Head ratios are measured by eye on the concept image (head or helmet top to chin, over figure height
without the base). Batch 2 used one ruler for every Terran figure: on it the shipped marine reads ~35%,
so Terran figures at 33-38% are judged against the marine, not against the 40% ideal.

## Batch 1

| Slug | Concept | Mesh (contact sheet) | Verdict |
|---|---|---|---|
| marine | helmet ~35-40%, ~2.5 heads, one rifle, clean | Shape faithful (helmet, pads, rifle, boots). Rifle and undersuit came out copper-brown instead of gunmetal | **ship** (optional: re-run paint only; the brown is a third hue the Terran hue-band recolour may not expect) |
| zergling | jaw/carapace dominates, ~2 heads, stubby legs, two scythe arms, wings | Faithful: carapace, jaw, two scythes, wings, tail, claws on base. Wings read as two dark slabs from straight on (edge-on) | **ship** (check `yaw` and quadruped `height` in the gallery) |
| kerrigan | head with dreads ~44%, ~2.3 heads, bone wings, no weapon | Faithful: head, wings, claws, feet on base | **ship** |
| zealot | head ~39% (halo extra), ~2.4 heads, one psi blade per arm | Faithful: halo, nerve-cord dreads, both blades, gold/blue kept | **ship** (blades overhang the base a lot; fine in play) |
| stalker | round body ~50%, stubby legs, single twin cannon | Re-finalized in batch 2: all four feet now stand on the 80mm base. Gold still pale cream, cannon blue-grey | **ship** (was "redo finalize"; optional paint re-run if the gold should hold) |

## Batch 2

| Slug | Concept | Mesh (contact sheet) | Verdict |
|---|---|---|---|
| raynor | Redone. Bare head ~37% (was ~32%), ~2.7 heads, head narrower than the pad span but on par with the marine. One bayonet rifle; the pistol now hangs from his left hand under the rifle grip (not holstered) | Faithful: face, hair, pads, rifle with bayonet, pistol by the leg. Feet on base; bayonet overhangs (fine) | **ship** (borderline on head size; a further concept pass is optional, not blocking) |
| marauder | helmet ~33%, ~3 heads by the strict ruler, same build as the marine; one grenade launcher per forearm (correct, not a duplicate), backpack, hoses | Faithful: helmet, both launchers, backpack, hoses. Joints and fists came out mauve-brown instead of gunmetal (same drift as the marine) | **ship** (same optional paint re-run as the marine) |
| medic | helmet ~37%, ~2.7 heads, one figure, backpack with hose, wrist injector and hand injector. Palette is off-white + steel blue, not the Terran steel blue + gunmetal | Not faithful: Hunyuan grew a long rifle-like rod from the right hand (no such weapon in the concept), the left-hand injector is ragged, and the backpack texture carries pseudo-glyphs ("8" and text-like marks) | **redo mesh** (new seed or a cleaner crop; reject any run with a long barrel). Owner call on palette: the white reads as a medic, but the Terran hue-band recolour may not tint it |
| goliath | walker: cockpit body is the SD "head" (~45%), stubby legs, one twin autocannon per arm and two shoulder missile pods (matches the unit) | Faithful: cockpit cage, amber glass, both cannons, both pods, legs on base. Joints mauve-brown; two tiny glyph marks on the cockpit plates (unreadable at play scale) | **ship** (split torso/legs per 9.6; optional paint re-run) |
| roach | carapace dominates, stubby clawed legs, bone tusks and spines, violet + bone matches the zergling | Faithful: shell, spines, tusks, scythe arms, claws on base. Tusk/scythe tips overhang the base edge (fine) | **ship** |

## Batch 3 (SDXL fallback concepts, 1024x1024)

| Slug | Concept | Mesh (contact sheet) | Verdict |
|---|---|---|---|
| hydralisk | head with hood crest ~45%, ~2.2 heads, stubby legs (the unit has a serpent tail, not legs), claw hands rather than scythe arms. A black segmented whip hangs from the left claw as well as the real tail. Violet + bone matches the zergling/kerrigan | Head, hood, jaw, tail and legs are faithful, but the whip came out as a **loose floating island** beside the left arm (front view) and a second loose fragment floats off the right arm (back view). Feet on base | **redo finalize** (drop the disconnected islands, keep the largest component; or new seed). Concept anatomy is a known SDXL miss; a Gemini edit pass is optional |
| queen | head + crest ~50%, ~2 heads, upright, stubby legs, two talon arms plus four dark spindly back limbs (fits a multi-limbed broodmother). Bone skull face, violet carapace: matches batch 1 | Faithful: skull face, crest spines, carapace sacs, back limbs, talons. Back limbs came out thin and noisy; one trails along the base and past its edge (side view) | **ship** (borderline: noisy limbs; 80mm base hides the overhang) |
| adept | head ~45%, ~2.2 heads, one double-ended glaive held across the body (one weapon; replaces the forearm cannon the prompt asked for). Tiny pseudo-lettering engraved on the gold butt cap (unreadable at play scale). Gold + cyan, but the under-armour is gunmetal-black rather than the zealot's deep blue | Faithful: helmet, horns, cyan eyes, glaive. Gold drifted to tan/bronze; blue is mottled on arms and legs; back of the head is plain brown with stray paint lines. Glaive overhangs the 40mm base; feet on base. Butt-cap glyphs did not survive into the mesh | **ship** (optional paint re-run for gold; weapon swap to an arm cannon is an owner call) |
| sentry | orb ~60%, crystal and two horn-prongs on top, two claw arms plus two short lower legs (prompt said no legs). Sits over a raised ring pedestal, not a plain flat base. Gold + cyan matches the stalker | Faithful: orb, crystal, prongs, arms, lower legs. The ring pedestal became a navy torus on top of the black base (a second base); the orb floats above it. Claw tips overhang the 50mm base | **ship** (borderline; optional finalize to paint the ring black or cut it) |
| medic (re-mesh) | unchanged concept (see batch 2) | **Still not faithful.** The wrist injector on the right forearm grew into a long twin-barrel gun as long as the forearm (side view); the left-hand injector is still a ragged spiky blob. Backpack glyphs are gone but a pale rectangular label patch and a chevron mark remain on the back | **redo mesh** again: a crop that masks or shortens the wrist injector, or a Gemini edit to a compact wrist-mounted injector, before the next seed |

## Batch 4 (Gemini, 1024x572 / 1024x687; redo of batch 3 plus seven new units)

All 12 concepts: one figure, round black uncropped base, no lettering or logos, MGSD proportions held (the
faction anchor was uploaded as image 2). Mesh bounds checked in the GLBs: every figure starts at the base top
(y 0.12 in), so no blade or claw dips below the table.

| Slug | Concept | Mesh (contact sheet) | Verdict |
|---|---|---|---|
| medic (redo 3) | helmet ~38%, ~2.6 heads, empty hands, small forearm injector stub, boxy backpack. White + steel blue (as before) | Shape faithful: no gun, no rod, stub injector only. **Paint invented a text-like label on the backpack back** (a dark panel with a pseudo-word and readout lines, clearly text-like up close) | **redo paint only** (new paint seed, then finalize; reject any run with a label on the back). Owner may accept as is: the label is on the back of a 1.6" figure |
| siege-tank | squat hull, fat tracks, round turret ~45% of height, ONE short thick cannon; steel blue + gunmetal | Faithful: hull, turret, single cannon, road wheels. Tracks and barrel sleeve came out brown (same Terran gunmetal drift). Footprint 2.6 x 3.5 in on the 150mm base, well inside | **ship** (split turret per 9.6; optional paint re-run) |
| raynors-raider | marine edit: helmet ~36%, ~2.7 heads, one rifle, leather-brown trim and helmet stripe | Faithful: stripe, trim, rifle, pads. Trim reads orange-tan. Rifle overhangs the 32mm base (like the marine) | **ship** |
| hydralisk (redo) | no legs, coiled tail, hood + head ~45%, two bone scythes, violet + bone | Faithful: hood, jaw, scythes, coil sits on the base. No floating islands this time | **ship** (replaces the vetoed v1) |
| queen (redo) | crested head ~50%, two scythe talons + small arms, stubby legs, abdomen, no back limbs | Faithful: crest, talons, legs, abdomen. Abdomen tip trails slightly past the 80mm base edge (back view) | **ship** (replaces the wired batch-3 GLB; new height 1.97 in) |
| ravager | roach body, tall bone crest cradling a glowing bile sac, tusks, stubby legs | Faithful: carapace, crest, bile sac, tusks, claws. Body length 3.2 in on a 50mm base (overhangs like the roach). A mottled painted disc sits on the base top | **ship** (check `yaw` and quadruped height in the gallery) |
| sentry (redo) | orb ~75%, centred crystal, two small arms, no legs, one thin stand, flat base | Faithful: orb, crystal, arms, single stand; no ring. The crystal is mirrored onto the back. Gold pale tan | **ship** (replaces the wired batch-3 GLB) |
| adept (redo) | head ~43%, ~2.3 heads, twin-prong glaive on the right forearm, deep blue under-armour, empty fists | Faithful: head, tendrils, glaive, blue under-armour. Gold pale tan (as the stalker) | **ship** (replaces the wired batch-3 GLB) |
| immortal | domed body ~55%, exactly two side cannons, four stubby legs, cyan lens | Faithful: dome, halo arch, both cannons, four legs inside the 100mm base. Back of the dome got an invented eye-like panel (no text) | **ship** |
| zeratul | hooded head ~42%, ~2.4 heads, one green warp blade, violet-black with gold trim | Faithful: hood, scarf, green eyes, one blade, empty left fist. Back: tendrils and a short ragged cloth panel (in the concept silhouette) | **ship** |
| artanis | head + gold crest ~45%, two wrist blades, no cape | Faithful: crest, swept pads, both blades. Unseen back of the head became a gold crest slab (reads fine) | **ship** |
| praetor-guard | zealot edit: head ~40%, ~2.5 heads, heavier gold, two wrist blades | Faithful: head, tendrils, both blades, ornate plates, blue tabard | **ship** |

Protoss gold drifted to pale tan in every batch-4 Protoss mesh, matching the shipped stalker, so the faction
reads consistently; a paint re-run is optional for the whole faction, not per unit.

## Batch 5 (Gemini concepts, 1024x572; variants and structures that were still procedural)

Concepts: all ten are one figure on a round black uncropped base, with no lettering, logos or glyphs, and the faction palette holds.
Meshes landed 2026-10-13 (Hunyuan stages 2-5). Every contact sheet (`contact-<slug>.png`, front view in
`contact-batch5.png`) was checked against its concept. No mesh has text marks, extra figures or invented weapons.
GLB bounds: every figure starts at y 0 (base bottom), so nothing dips below the table. Optimised copies are wired at
`public/models/<slug>.glb` with the measured height (bounding-box height, base included) and yaw 0. In the `?gallery`
close-ups (front and side) all ten stand upright on their bases and face +z, so no yaw fix was needed.

| Slug | Concept | Mesh (contact sheet) | Verdict |
|---|---|---|---|
| raptor | zergling build, head + crest ~40%, two scythes, two big bone bat wings, stubby legs | Faithful: crest, scythes, tail, claws on base. The wings came out as full membranes, not edge-on slabs, and there are no floating fragments. Wingspan 2.4 in overhangs the base (as in the concept) | **ship** (height 1.359) |
| kerrigan-swarm-raptor | raptor edit: royal violet, tall quill crest, vein lights, no rider | Faithful: quill crest, wings with membranes, glossier violet than the raptor. Vein lights read as pale dots only. No rider | **ship** (height 1.399) |
| swarmling | one head ~45%, crest, slim scythes, no wings, short tail with no face | Faithful: one head, crest, back spines, tail. The scythe tips stand slightly apart from the forearms in the front view, but they are attached, not floating | **ship** (minor; a re-roll is optional; height 1.52) |
| corpser | roach body, pink corpse-sac in bone ribs, purple crystal spikes, scythe arms with claw tips | Faithful: pink sac, ribs, crystal spikes (solid, not blobs), scythe arms. The base was not auto-cut ('no base found'), so a grey mottled patch shows on the base top around the feet | **ship** (cosmetic patch, like the ravager's disc; height 2.22) |
| vile | roach body, green acid glands, green crystal spines, acid drool | Faithful: green spines and glands, tusks. The drool fused into the jaw instead of becoming floating islands | **ship** (height 2.22) |
| roachling | pill-bug shell ~65%, blunt head, tiny tusks, stubby legs | Faithful: shell, back nubs, short legs, tusks. No invented parts. The shell overhangs its small base front to back (as in the concept) | **ship** (height 1.62) |
| nerazim-watchers | hood ~38%, ~2.6 heads, green eyes, violet-black + gold trim, green glaive in the right fist | Faithful: hood, mask, green eyes, gold trim, glaive gripped in the right fist. No extra weapon or head. Back: green gland lights | **ship** (height 2.02) |
| omega-worm | worm from a spiked flesh mound, toothed round mouth, one side tendril | Faithful: the toothed mouth stayed open and the one side tendril is intact. The mound covers most of the base | **ship** (structure; height 3.12) |
| pylon | cyan crystal in gold ribs on a plinth, plain blue panels | Faithful: the crystal is fused inside the gold ribs and nothing floats. Gold reads tan, as on the other Protoss meshes | **ship** (structure; height 3.12) |
| point-defense-drone | domed saucer, dish + two antennae, front turret, four fins, one thin clear stand | Faithful: dome, dish, antennae, turret, fins. The clear stand survived the cutout and is visible, so no solid post was added | **ship** (height 1.92) |

All ten replace their batch-4 manifest aliases. The seven variants no longer borrow the zergling, roach or adept GLB,
and the three structures/drones are no longer procedural.

## Veto list (all batches, current)
- **medic** (`medic.glb`, batch 4): hold until a paint re-run removes the text-like label on the backpack back.
  The shape passes; only stage_paint + finalize are needed. Owner may override and ship it as is.
- **All `*-v1.glb` files** (adept, hydralisk, medic, queen, sentry): superseded batch-3 meshes; never wire them.

Cleared: raynor and stalker (batch 2); hydralisk (batch 4 redo, no floating islands); medic gun/rod defect
(batch 4 redo; now held only for the paint label).

## Ship list (staging slug -> data unit id)

| Staging GLB | Unit id | Status |
|---|---|---|
| marine | marine | ship (wired) |
| raynor | jim-raynor | ship (wired as jim-raynor.glb) |
| raynors-raider | raynors-raider | ship (new) |
| marauder | marauder | ship (wired) |
| medic | medic | wired in commit aa590e7 (public/models/medic.glb); the staging GLB here is the held batch-4 mesh |
| goliath | goliath | ship (wired) |
| siege-tank | siege-tank | ship (new) |
| zergling | zergling | ship (wired) |
| roach | roach | ship (wired) |
| hydralisk | hydralisk | ship (new; batch-4 redo) |
| queen | queen | ship (replace the wired batch-3 GLB) |
| kerrigan | kerrigan | ship (wired) |
| ravager | ravager | ship (new) |
| zealot | zealot | ship (wired) |
| praetor-guard | praetor-guard | ship (new) |
| adept | adept | ship (replace the wired batch-3 GLB) |
| sentry | sentry | ship (replace the wired batch-3 GLB) |
| stalker | stalker | ship (wired) |
| immortal | immortal | ship (new) |
| zeratul | zeratul | ship (new) |
| artanis | artanis | ship (new) |
| raptor | raptor | ship (new, batch 5) |
| swarmling | swarmling | ship (new, batch 5) |
| kerrigan-swarm-raptor | kerrigan-swarm-raptor | ship (new, batch 5) |
| corpser | corpser | ship (new, batch 5) |
| vile | vile | ship (new, batch 5) |
| roachling | roachling | ship (new, batch 5) |
| nerazim-watchers | nerazim-watchers | ship (new, batch 5) |
| omega-worm | omega-worm | ship (new, batch 5) |
| pylon | pylon | ship (new, batch 5) |
| point-defense-drone | point-defense-drone | ship (new, batch 5) |

Use each GLB's own figure top as the manifest `height` (queen is now 1.969, not 2.513). Check quadruped
`yaw` (zergling, roach, ravager, immortal, stalker) and the `?gallery` front/side close-ups before pushing.

## Earlier notes

Batches 1-2: no duplicate figures, extra limbs or real lettering/logos found in any concept. All concept bases
are round, black and uncropped; all mesh footprints except overhanging blades/tusks sit inside their bases.

No duplicate figures or real lettering/logos in any batch-3 concept (the adept butt-cap glyphs are
sub-millimetre at play scale and absent from the mesh). All batch-3 concepts are single figures on uncropped
bases; the sentry's base is a ring pedestal rather than a flat disc.
