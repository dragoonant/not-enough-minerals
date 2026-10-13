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

## Veto list
- **medic**: do not wire the current GLB (re-mesh 2 still grows a long gun barrel from the wrist injector).
- **hydralisk**: do not wire until the loose floating whip/arm fragments are removed (re-finalize).

Cleared from the veto list in batch 2: raynor (new concept passes), stalker (feet now on the base).
Batch 3 ships: queen, adept, sentry.

Batches 1-2: no duplicate figures, extra limbs or real lettering/logos found in any concept. All concept bases
are round, black and uncropped; all mesh footprints except overhanging blades/tusks sit inside their bases.

No duplicate figures or real lettering/logos in any batch-3 concept (the adept butt-cap glyphs are
sub-millimetre at play scale and absent from the mesh). All batch-3 concepts are single figures on uncropped
bases; the sentry's base is a ring pedestal rather than a flat disc.
