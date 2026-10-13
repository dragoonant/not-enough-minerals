# Figure batch review (MGSD gate, 2026-10-13)

Checked against `docs/KNOWLEDGE-BASE.md` 9.6 (MGSD: about 2-2.5 heads, head ~40% of height, stubby legs,
chunky feet), plus: single figure, base intact, no lettering/logos, no extra limbs or duplicated weapons,
mesh faithful to the concept. Inputs: `art/unit-concepts/<slug>.png` and `art/models-staging/contact-<slug>.png`.
Head ratios are measured by eye on the concept image (head or helmet top to chin, over figure height
without the base).

| Slug | Concept | Mesh (contact sheet) | Verdict |
|---|---|---|---|
| marine | helmet ~40%, ~2.3 heads, one rifle, clean | Shape faithful (helmet, pads, rifle, boots). Rifle and undersuit came out copper-brown instead of gunmetal | **ship** (optional: re-run paint only; the brown is a third hue the Terran hue-band recolour may not expect) |
| raynor | head ~32% of height, ~3 heads; shoulder pads wider than the head | not built (no GLB) | **redo concept**: fails MGSD ratio. Fresh Terran chat, "the head is the biggest part of the figure" up front, start from the marine image. Also decide: revolver in hand or holstered (it is in his left hand now, with an empty thigh holster) |
| zergling | jaw/carapace dominates, ~2 heads, stubby legs, two scythe arms, wings | Faithful: carapace, jaw, two scythes, wings, tail, claws on base. Wings read as two dark slabs from straight on (edge-on) | **ship** (check `yaw` and quadruped `height` in the gallery) |
| kerrigan | head with dreads ~44%, ~2.3 heads, bone wings, no weapon | Faithful: head, wings, claws, feet on base | **ship** |
| zealot | head ~39% (halo extra), ~2.4 heads, one psi blade per arm | Faithful: halo, nerve-cord dreads, both blades, gold/blue kept | **ship** (blades overhang the base a lot; fine in play) |
| stalker | round body ~50%, stubby legs, single twin cannon | Shape faithful, but the leg span is far wider than the base disc: feet stand well outside the 80mm base. Gold washed to pale cream, cannon painted blue-grey | **redo finalize**: scale or size so the feet land on the base (no new concept or shape needed); re-run paint if the gold should hold |

## Veto list
- **raynor**: concept off-model (about 3 heads). Do not run Hunyuan3D on the current image.
- **stalker**: do not wire the current GLB; the feet overhang the base. Re-finalize first.

No lettering, logos, duplicate figures or extra limbs found in any image. All concept bases are round, black
and uncropped.
