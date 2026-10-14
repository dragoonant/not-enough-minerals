# Unit concept prompts (Gemini, MGSD style)

Style: MGSD (super-deformed model kit), about 2-2.5 heads tall, per `docs/KNOWLEDGE-BASE.md` 9.6.
Tool: Gemini (Pro mode) in Chrome, one chat per faction, 2026-10-13. Every image is 1024x572.

Inputs to every first prompt of a faction chat:
- image 1: the approved MGSD style image (proportion/style reference only; kept outside the repo)
- image 2: a photo of the matching tabletop miniature (anatomy/part-shape reference only; kept outside the repo)

The second unit of each faction was made by editing the first image in the same chat, with a
photo of that unit attached as a shape reference.

Palettes (our own, two hues per faction so the GLB hue-band recolour works):
- Terran: steel blue + gunmetal
- Zerg: violet carapace + bone
- Protoss: gold + deep blue, cyan glow

| Slug | Base | Result | Measured on the image |
|---|---|---|---|
| marine | 32mm | pass | helmet ~40% of height, ~2.5 heads |
| raynor | 40mm | borderline | head ~34-36% of height, ~2.8 heads (3 regenerations; edits barely moved it) |
| zergling | 32mm | pass | head/jaw dominates, ~2 heads, stubby legs |
| kerrigan | 40mm | pass | head ~40%, ~2.5 heads |
| zealot | 40mm | pass | head ~42% with halo, ~2.4 heads |
| stalker | 80mm | pass | round body ~50% of height, stubby legs |

---

## Terran chat

### marine (final, fresh chat, attempt 3)
> Generate an image: a super-deformed SD Gundam style model kit figure (Bandai MGSD line) of a sci-fi
> space marine trooper in bulky powered combat armour, holding an oversized assault rifle in both fists.
> Copy the head-to-body ratio of the FIRST image exactly (it is the style and proportion reference only:
> do not copy its subject, colours, hood, cape or lettering). Use the SECOND image only for the armour
> shapes and rifle. Proportions: about 2 heads tall in total. The helmet is the biggest part of the
> figure: a huge rounded helmet with a wide dark visor, as wide as the whole shoulder span including both
> shoulder pads, and as tall as the torso and legs combined (about 45% of the figure height). Small torso,
> very short stubby legs with big chunky boots almost directly under the hips, short arms with big
> oversized fists, oversized chunky rifle. Crisp Master Grade hard-surface panel lines. Our own original
> colour scheme: a clean two-hue palette of steel blue armour plates and dark gunmetal joints, undersuit
> and rifle. No lettering or text on the model, no logos, no faction emblems, no symbols. Full body,
> neutral standing pose, front three-quarter view, standing on a plain round black base. Plain white
> background, even soft lighting. Exactly ONE single figure, centred.

Earlier attempts (rejected, ~3 heads, head narrower than shoulders): a first prompt that said "about 2
heads tall ... head about 40% of the total height" without "the helmet is the biggest part", then two
in-chat edits asking for a bigger head; Gemini returned an almost identical image each time.

### raynor (edit in the same chat, 3 tries)
Try 1 (with the hero photo attached):
> Generate an image: start from the previous image (the SD trooper you just made): keep the exact same
> super-deformed model kit style, proportions (about 2 to 2.5 heads tall, huge head, tiny stubby legs, big
> chunky boots), steel blue and gunmetal palette, round black base and plain white background. Change the
> subject to a veteran hero commander in the same heavy powered armour but with NO helmet: a big bare head
> with short messy brown hair, stubble and a confident grim expression, the head still enormous (as wide
> as the shoulder pads). Use the attached image only for the hero's armour and weapon shapes. He holds a
> long, oversized commando rifle with a bayonet under the barrel in both fists, and carries a big
> revolver-style pistol in a holster on his thigh. Slightly larger, more ornate shoulder pads to mark him
> as a hero on a 40mm base. No lettering or text on the model, no logos, no faction emblems. Front
> three-quarter view, neutral standing pose. Exactly ONE single figure, centred.

Try 2:
> Generate an image: start from the previous image and keep everything the same (pose, armour, rifle,
> pistol, palette, base, background), but make his bare head MUCH bigger, super-deformed like an SD Gundam
> figure: the head should be about 45% of the total figure height and as wide as the whole shoulder span
> including the shoulder pads, so the figure is only about 2 heads tall. Shorten the legs a little more so
> they are tiny and stubby with big chunky boots. No lettering, no logos, no emblems. Exactly ONE single
> figure, centred.

Try 3 (kept):
> Generate an image: better, but go further. Keep everything else identical, and enlarge only his head
> again by about one third, chibi style: the head (hair to chin) must be as tall as his torso and legs
> combined, and as wide as the full span across both shoulder pads, like the helmeted trooper you made
> earlier. Keep the long bayonet rifle and the holstered revolver oversized. No lettering, no logos, no
> emblems. Exactly ONE single figure, centred.

Note: he ended up holding the revolver in his left hand rather than holstered. Head still ~2.8 heads;
a fresh chat with "the head is the biggest part of the figure" up front is the likely fix.

## Zerg chat

### zergling (final, fresh chat, attempt 3)
> Generate an image: a super-deformed SD Gundam style model kit figure (Bandai MGSD line) of a small,
> fierce alien swarm beast, in chibi big-head proportions like the FIRST image (that image is the style
> and proportion reference only: do not copy its subject, colours or lettering). Use the SECOND image only
> for the creature's anatomy. The creature: a crouching four-legged clawed beast with two curved
> scythe-blade forearms, a few bony back spines, two small membrane wings and a short tail. SD
> proportions: the head is HUGE, as big as the whole rest of the body combined (about 45% of the figure
> height), a big rounded armoured skull with a wide fanged jaw; the body is a tiny compact rounded lump;
> the four legs are very short, thick and stubby with big chunky clawed feet; the two scythe blades are
> oversized. Fewer, bigger, simpler shapes, toy-like and chunky, but fierce, not cute. Crisp Master Grade
> sculpted chitin plates. Our own original colour scheme: a clean two-hue palette of violet carapace and
> pale bone-coloured blades, claws, spines and teeth. No lettering or text, no logos, no faction emblems,
> no symbols. Full body, neutral standing pose on all four legs, front three-quarter view, on a plain
> round black base. Plain white background, even soft lighting. Exactly ONE single creature, centred.

Earlier attempt (rejected, realistic creature proportions): the same idea phrased as "head about 40% of
the figure height ... short chunky stubby legs", then one in-chat edit; the edit barely changed it.

### kerrigan (edit in the same chat, try 1, kept)
> Generate an image: start from the previous image (the SD swarm beast you just made): keep the exact
> same super-deformed model kit style, chunky big-head proportions, violet carapace and pale bone palette,
> round black base and plain white background. Change the subject to the swarm's hero queen: a slender
> psionic alien-humanoid woman standing upright on two legs, with a HUGE head (about 40 to 45% of the
> figure height, so she is only about 2 to 2.5 heads tall), a fierce face with glowing eyes, long thick
> spiny tendril hair like segmented dreadlocks, a small torso covered in violet chitin carapace plates,
> tiny stubby legs ending in big chunky clawed feet, short arms with big clawed hands, and four large bony
> wing-spines rising from her back, each ending in a hooked claw (the wing-spines are oversized, like the
> scythe blades of the beast). Use the attached image only for her anatomy and wing-spine shapes. Hero
> figure for a 40mm base. No lettering or text, no logos, no faction emblems. Front three-quarter view,
> neutral standing pose. Exactly ONE single figure, centred.

## Protoss chat

### zealot (try 1; Gemini offered two drafts, kept "Choice B")
> Generate an image: a super-deformed SD Gundam style model kit figure (Bandai MGSD line) of a tall alien
> templar warrior in ornate armour, with a glowing energy blade projecting forward from a gauntlet on each
> wrist. Copy the chibi big-head proportions of the FIRST image (it is the style and proportion reference
> only: do not copy its subject, colours, hood, cape or lettering). Use the SECOND image only for the
> warrior's armour shapes, head and wrist blades. Proportions: about 2 heads tall in total. The head is
> enormous, about 45% of the figure height and as wide as the shoulder pads: a smooth alien head with
> large glowing eyes, no mouth, and thick nerve-cord tendrils swept back from the back of the skull. Small
> torso with big curved shoulder plates, very short stubby legs with big chunky armoured feet, short arms
> with big oversized gauntlets, and oversized curved energy blades. Crisp Master Grade hard-surface panel
> lines. Our own original colour scheme: a clean two-hue palette of polished gold armour plates and deep
> blue under-armour and cloth, with cyan glowing energy blades, eyes and small gem lights. No lettering or
> text on the model, no logos, no faction emblems, no symbols. Full body, neutral standing pose, front
> three-quarter view, standing on a plain round black base. Plain white background, even soft lighting.
> Exactly ONE single figure, centred.

### stalker (edit in the same chat, try 1, kept)
> Generate an image: start from the previous image (the SD templar warrior you just made): keep the exact
> same super-deformed model kit style, polished gold and deep blue palette with cyan glow, round black
> base and plain white background. Change the subject to a four-legged robotic walker of the same alien
> race, a large unit for an 80mm base: a big round egg-shaped armoured body (the body is the SD 'head':
> enormous, about half the figure height) with a single glowing cyan eye-lens on the front, a
> twin-barrelled energy blaster mounted under the front of the body, and four short, chunky, stubby
> jointed legs with big chunky armoured feet (legs much shorter and thicker than a realistic walker, SD
> style). Use the attached image only for the walker's anatomy and part shapes. Gold armour plates over a
> deep blue frame, cyan glowing lights. No lettering or text, no logos, no faction emblems. Front
> three-quarter view, neutral standing pose on all four legs. Exactly ONE single figure, centred.

## Lessons for the next batch
- In-chat edits that only ask for "a bigger head" return a near-identical image. Put "the head is the
  biggest part of the figure, as wide as the whole shoulder span" in the FIRST prompt of a fresh chat.
- Subject-swap edits ("start from the previous image ... change the subject to ...") kept the style well
  (kerrigan, stalker).
- Before typing, focus the prompt box with `element.focus()` and check `document.activeElement`. A click
  that misses the box can land on a suggestion chip, and every space typed then re-sends that chip.
- Extraction without a download: draw the `<img>` to a canvas, open a small local receiver page with
  `window.open` from a real click, and `postMessage` the data URLs to it (a direct `fetch` to localhost
  is blocked on gemini.google.com).

---

## Batch 2 (Gemini, 2026-10-13)

The exact Gemini text for batch 2 was not logged at the time. The prompts below restate it in our own
words from the kept images and the batch-1 lessons (fresh chat with "the head is the biggest part" up
front, then subject-swap edits). Use them as the starting wording for any redo.

| Slug | Base | Result | Measured on the image |
|---|---|---|---|
| raynor (redo) | 40mm | ship (borderline) | bare head ~37%, ~2.7 heads |
| marauder | 40mm | ship | helmet ~33%, ~3 heads by the strict Terran ruler |
| medic | 32mm | concept ok, mesh on the veto list | helmet ~37%, ~2.7 heads |
| goliath | 60mm | ship | cockpit body ~45% (the SD "head") |
| roach | 40mm | ship | carapace dominates, stubby legs |

### raynor (redo, fresh Terran chat)
> Generate an image: a super-deformed SD Gundam style model kit figure (Bandai MGSD line) of a veteran
> hero commander in heavy powered armour with no helmet. The head is the biggest part of the figure: a big
> bare head with short messy brown hair, stubble and a grim, confident look, as wide as the whole span
> across both shoulder pads and as tall as the torso and legs combined. Copy the head-to-body ratio of the
> FIRST image (style and proportion reference only, do not copy its subject or colours); use the SECOND
> image only for armour and weapon shapes. Small torso, ornate oversized shoulder pads, tiny stubby legs
> with big chunky boots, short arms with big fists holding one long oversized rifle with an under-barrel
> bayonet, and a big revolver pistol. Steel blue armour plates and dark gunmetal joints. Crisp Master Grade
> panel lines. No lettering or text on the model, no logos, no emblems. Full body, neutral standing pose,
> front three-quarter view, on a plain round black base. Plain white background, even soft lighting.
> Exactly ONE single figure, centred.

### marauder (edit in the same chat)
> Generate an image: start from the previous image and keep the exact same MGSD style, huge-head
> proportions, steel blue and gunmetal palette, round black base and white background. Change the subject
> to a heavy assault trooper in even bulkier armour with a huge rounded helmet and a narrow dark visor, a
> large backpack with hoses, and one stubby oversized grenade launcher built onto each forearm instead of
> a hand-held weapon. Use the attached image only for armour and launcher shapes. Rank-and-file trooper
> for a 40mm base. No lettering or text, no logos, no emblems. Exactly ONE single figure, centred.

### medic (edit in the same chat)
> Generate an image: start from the previous image and keep the same MGSD style, huge rounded helmet with
> a wide visor, tiny stubby legs and chunky boots, round black base and white background. Change the
> subject to a field medic in lighter armour: a compact backpack with a hose, an injector built into one
> wrist and a small hand-held injector in the other hand, no gun. Use the attached image only for the
> armour and gear shapes. Small 32mm trooper. No lettering, crosses, text, logos or emblems. Exactly ONE
> single figure, centred.

### goliath (edit in the same chat)
> Generate an image: start from the previous image and keep the same MGSD style, steel blue and gunmetal
> palette, round black base and white background. Change the subject to a two-legged combat walker for a
> 60mm base: an enormous boxy cockpit body with an amber glass canopy (the cockpit is the SD "head", about
> 45% of the figure height), one twin autocannon on each arm, a missile pod on each shoulder, and short,
> thick, stubby jointed legs with big flat feet. Use the attached image only for the walker's part shapes.
> No lettering, numbers, text or logos. Exactly ONE single figure, centred.

### roach (edit in the Zerg chat, from the zergling image)
> Generate an image: start from the previous image (the SD swarm beast) and keep the same MGSD style,
> chunky toy-like shapes, violet carapace and pale bone palette, round black base and white background.
> Change the subject to a squat armoured burrowing beast for a 40mm base: a huge domed shell carapace that
> makes up most of the figure, a low wide head with bone tusks, a row of bone spines along the back, two
> short scythe forearms and short stubby clawed legs. Use the attached image only for anatomy. Fierce, not
> cute. No lettering or text, no logos. Exactly ONE single creature, centred.

---

## Batch 3 (local SDXL fallback, 2026-10-13)

Gemini was not usable (the Chrome tab reported `visibilityState=hidden`), so batch 3 used the local SDXL
script (`concepts_sdxl.py` in the Hunyuan3D-2 folder; a copy with a custom negative prompt) with
IP-Adapter style-only injection from a batch-1 anchor. Images are 1024x1024, not 1024x572.
Settings: 30 steps, guidance 6.5, `--style 0.6`; Zerg anchor `kerrigan.png` with `--avoid "blue, gold"`;
Protoss anchors `zealot.png` (adept) and `stalker.png` (sentry) with `--avoid purple`. 8 seeds per round,
three rounds. CLIP reads only 77 tokens, so the framing words go first and the subject stays short.

Prefix (all units; sentry without "huge head, tiny stubby legs"):
> chibi super-deformed SD model kit figure, huge head, tiny stubby legs, standing on a round black base,
> white background, single figure, full body,

Negative:
> funko pop, cute, kawaii, realistic proportions, tall, long legs, long neck, human, multiple figures, two
> figures, collage, multiple views, grid, text, letters, watermark, logo, cropped, cut off, scenery, rocks,
> grey background, blurry (+ queen: black background, wings, green; sentry: black background, legs, feet,
> humanoid, walking)

| Slug | Base | Seed | Result | Measured on the image |
|---|---|---|---|---|
| hydralisk | 50mm display (40x100 oval) | 20 | pass | head with hood crest ~45%, ~2.2 heads, stubby legs, tail, claw arms |
| queen | 80mm | 35 | pass | head + crest ~50%, upright, talon arms, stubby legs |
| adept | 40mm | 20 | pass | head ~45%, ~2.2 heads; glaive held in hand rather than an arm cannon |
| sentry | 50mm | 37 | pass (borderline) | orb ~60%, crystal on top, two claw arms; hovers over a ring base |

### hydralisk
> fierce alien cobra serpent monster, enormous hooded head with wide fanged jaw, tiny upright coiled body,
> two big bone scythe arms, back spines, violet carapace, bone

### queen
> alien insect queen standing upright on two legs, enormous head with tall bony crest crown, two big bone
> talon arms, violet carapace, bone

### adept
> fierce alien warrior, enormous smooth grey alien head, glowing cyan eyes, swept-back head tendrils, gold
> armour, big glowing cyan crescent cannon on forearm, stubby legs, gold and deep blue

### sentry
> hovering alien robot orb, big round gold sphere with a large glowing cyan crystal core, two small claw
> arms, no legs, floating on a thin stem

Notes: without "chibi ... huge head" first, SDXL drifted to realistic proportions; "photo of" lost the SD
look; "MGSD" alone means nothing to SDXL. About 1 seed in 4 was a collage or had a grey/dark background:
reject those. SDXL skips small details (the hydralisk got legs, the adept's arm cannon became a hand-held
glaive); a Gemini edit pass can fix these later if the owner wants.

### Gemini wording for batch 3 (when Gemini is available; first prompt of each faction chat as above)
- hydralisk: "... of an upright alien serpent warrior: no legs, a thick coiled snake tail under the body,
  an enormous hooded head (a wide bony cobra hood around a fanged jaw) that is the biggest part of the
  figure, two long bone scythe arms, and a ridge of spines on the back that it fires like a launcher.
  Violet carapace and pale bone. 50mm round base."
- queen: "... of the swarm's broodmother: a crested creature standing upright on two short stubby legs,
  an enormous head with a tall swept-back bony crest, two big hooked talon arms and two smaller arms under
  them. Violet carapace and pale bone. 80mm base."
- adept: "... of a light, agile alien warrior of the templar race: enormous smooth head with glowing eyes
  and swept-back nerve-cord tendrils, light gold armour, and a crescent-shaped glaive cannon built onto one
  forearm, glowing cyan. Gold and deep blue. 40mm base."
- sentry: "... of a small hovering robot of the same race: a big round gold orb body with a glowing cyan
  crystal core set in its front, two small jointed arms, no legs, floating on a thin clear stem above the
  base. Gold and deep blue frame, cyan glow. 50mm base."

---

## Batch 4 (Gemini, 2026-10-13, owner at the PC)

Redo of the batch-3 SDXL concepts per `art/models-staging/REVIEW.md`, plus seven new units. One fresh
Gemini chat per faction (Pro mode). First prompt of each chat uploads three images: the MGSD style image,
the faction anchor (`marine.png`, `zergling.png`, `zealot.png`) and a photo of the real miniature.
Later units are subject-swap edits in the same chat. No miniature photos were found locally for the new
units (siege tank, immortal, zeratul, artanis, ravager, raider, praetor guard), so those used our own
approved concepts as the shape anchor instead (`roach.png` for the ravager, `stalker.png` for the
immortal). Every unit came out right on the first try. Old redo images kept as `<slug>-v1.png`.
Images are 1024x572 (Terran, Zerg, immortal) or 1024x687 (other Protoss).

| Slug | Base | Result | Measured on the image |
|---|---|---|---|
| medic (redo) | 32mm | pass | helmet ~38%, ~2.6 heads; white + steel blue, empty hands, tiny forearm injector stub, no gun |
| siege-tank (new) | 150mm | pass | squat hull on stubby tracks, round turret ~45% of height, one short siege cannon |
| raynors-raider (new) | 32mm | pass | marine edit: helmet ~36%, ~2.7 heads, leather trim + helmet stripe, one rifle |
| hydralisk (redo) | 50mm | pass | coiled serpent tail, no legs, hood + head ~45%, two scythe arms, compact |
| queen (redo) | 80mm | pass | crested head ~50%, two talons + small arms, stubby legs, no back limbs |
| ravager (new) | 50mm | pass | roach body, tall bone crest cradling a glowing bile sac, stubby legs |
| sentry (redo) | 50mm | pass | orb ~75% of height, crystal centred, two small arms, no legs, one thin stand on a flat base |
| adept (redo) | 40mm | pass | head ~43%, ~2.3 heads; twin-prong glaive on the right forearm, empty fists, deep blue under-armour |
| immortal (new) | 100mm | pass | domed body ~55%, exactly two side cannons, four stubby legs on the base (cannon tips overhang) |
| zeratul (new) | 40mm | pass | hooded head ~42%, ~2.4 heads, one green warp blade, dark violet-black with gold trim |
| artanis (new) | 50mm | pass | head + gold crest ~45%, two wrist blades, no cape |
| praetor-guard (new) | 40mm | pass | zealot edit: head ~40%, ~2.5 heads, heavier gold plates, two wrist blades |

### Terran chat (images: style, marine.png, medic photo)
medic (first prompt):
> Generate an image: an SD Gundam style model kit figure (Bandai MGSD line) of a sci-fi combat field medic
> in light powered armour. Match the style, proportions, palette and framing of the SECOND image (our
> trooper): the huge rounded helmet with a wide dark visor is the biggest part, as wide as the shoulder span
> and as tall as torso plus legs (about 2 heads tall). FIRST image = style and proportion reference only;
> THIRD image = armour and backpack shapes only. White armour plates, steel blue trim and joints, a compact
> boxy medical backpack with plain smooth panels, big gloved hands EMPTY and relaxed, one small stubby
> injector cuff flat on the left forearm, no longer than the hand. NO gun, rifle, pistol, rods, tubes,
> barrels or hoses, nothing in the hands. Stubby legs, chunky boots, Master Grade panel lines. No
> lettering, crosses, logos or emblems. Front three-quarter view, plain round black base (32mm), white
> background. Exactly ONE single figure, centred.

siege-tank (edit):
> Generate an image: start from the SECOND image I uploaded and keep the same SD model kit style, steel
> blue and gunmetal palette, panel lines, round black base and white background. Change the subject to a
> heavy tracked siege tank for a 150mm base, chunky and toy-like: a short, squat, wide hull on two fat
> stubby tracks; on top a HUGE rounded turret (the SD "head", about 45% of the height) with ONE big, thick,
> short siege cannon. Not a realistic tank. No crew, lettering, numbers or logos. Front three-quarter view,
> whole vehicle inside one round black base. Exactly ONE single vehicle, centred.

raynors-raider (edit of the uploaded marine):
> Generate an image: start from the SECOND image I uploaded (the SD trooper with a rifle) and keep
> EVERYTHING the same (pose, huge helmet, proportions, rifle, steel blue and gunmetal, base, background).
> Change only the paint trim: worn leather-brown trim on the shoulder pad edges, belt and knee pads, and one
> plain leather-brown stripe front to back over the helmet like a bandana. Slightly battered edges. No
> lettering, numbers, logos or emblems. 32mm trooper. Exactly ONE single figure, centred.

### Zerg chat (images: style, zergling.png, hydralisk photo)
hydralisk (first prompt):
> Generate an image: an SD Gundam style model kit figure (Bandai MGSD line) of an upright alien serpent
> warrior beast. Match the style, chunky shapes, violet carapace and pale bone palette and framing of the
> SECOND image (our swarm beast); FIRST image = style reference only; THIRD image = anatomy only. NO legs:
> the lower body is one thick, short snake tail resting in a compact coil on the base. The head is the
> biggest part (about 40-45%): a huge armoured skull with a wide flared bony cobra hood and a fanged jaw.
> Two big curved bone scythe arms held forward, a short ridge of back spines. Compact so it fits a 50mm
> base. Fierce, not cute. No lettering or logos. Front three-quarter view, round black base, white
> background. Exactly ONE single creature, centred.

queen (edit, queen photo attached):
> Generate an image: start from the previous image and keep the same style, palette, base and background.
> Change the subject to the swarm's broodmother for an 80mm base, standing upright on two very short thick
> legs with clawed feet. The head is the biggest part (about 40-45%): a huge skull with a tall swept-back
> bony crest and a fanged jaw. Two big hooked talon arms in front, two smaller clawed arms under them, a
> plump abdomen behind. NO long thin back limbs, no spindly legs, no wings; compact, well inside the
> base. Attached image = anatomy only. No lettering or logos. Exactly ONE single creature, centred.

ravager (edit, roach.png attached):
> Generate an image: start from the attached image (our SD armoured burrowing beast) and keep the same
> style, palette, base and background. Change the subject to its evolved artillery form for a 50mm base:
> the same squat body on stubby clawed legs, but the domed carapace rises at the back into a tall upright
> bony crest of curved bone plates cradling a glowing orange-green bile sac, like a living mortar. Low wide
> head with bone tusks. Compact. No lettering or logos. Exactly ONE single creature, centred.

### Protoss chat (images: style, zealot.png, sentry photo)
sentry (first prompt):
> Generate an image: an SD Gundam style model kit figure (Bandai MGSD line) of a small hovering alien
> support robot. Match the style, gold and deep blue palette with cyan glow, panel lines and framing of the
> SECOND image; FIRST image = style reference only; THIRD image = part shapes only. One big round gold orb
> body (about 60% of the height) with a large glowing cyan crystal core in the CENTRE of its front face,
> two small short jointed arms with little claws, NO legs or feet, nothing below the orb. The orb hovers on
> ONE small thin stand rising from the centre of a plain flat round black base (50mm). No rings, pedestal or
> second base. No lettering or logos. Front three-quarter view, white background. Exactly ONE single robot.

adept (edit, adept photo attached):
> Generate an image: start from the SECOND image I uploaded (the SD templar warrior) and keep the same
> style, huge head (biggest part, about 40-45%, as wide as the shoulders), stubby legs, base and
> background. Change the subject to a lighter, agile warrior for a 40mm base: sleeker light gold plates
> over DEEP ROYAL BLUE under-armour (blue, not black or grey), the same head, eyes and tendrils, and ONE
> crescent glaive cannon built onto the right forearm like a bracer, glowing cyan, reaching past the fist.
> Both hands empty fists, nothing held, no blade on the left arm. Attached image = armour and weapon shapes
> only. No lettering or logos. Exactly ONE single figure, centred.

immortal (edit, stalker.png attached):
> Generate an image: start from the attached image (our SD gold four-legged walker) and keep the same
> style, palette, base and background. Change the subject to a heavier assault walker for a 100mm base: a
> large rounded DOMED body (the SD "head", about half the height) with a cyan lens, TWO big chunky cannons,
> one on each side, pointing forward (exactly two), four short thick stubby legs with chunky feet inside
> the base. No lettering or logos. Exactly ONE single walker, centred.

zeratul (edit of the uploaded zealot):
> Generate an image: start from the SECOND image I uploaded and keep the same style, huge head, stubby
> legs, base and background. Change the subject to a shadowy hero assassin for a 40mm base: a big deep
> hood and short wrapped scarf over the head, two glowing green eyes in the shadow, sleek deep
> violet-black armour with small muted gold trims and green glow lights, ONE long curved green warp blade
> from the right wrist. Left hand an empty fist, no second blade, no cape. No lettering or logos. Exactly
> ONE single figure, centred.

artanis (edit of the uploaded zealot):
> Generate an image: start from the SECOND image I uploaded and keep the same style, huge head, stubby
> legs, base and background. Change the subject to the race's hero commander for a 50mm base: grander
> ornate polished gold armour, tall swept-up gold shoulder plates, a gold crest-like headpiece framing the
> head, deep blue under-armour, one long cyan blade from each wrist (two in total). NO cape, cloak or
> banner. No lettering or logos. Exactly ONE single figure, centred.

praetor-guard (edit of the uploaded zealot):
> Generate an image: start from the SECOND image I uploaded and keep EVERYTHING the same (pose, head,
> proportions, both wrist blades, deep blue under-armour, base, background). Change only the armour to an
> elite honour guard version for a 40mm base: heavier, thicker, more ornate gold plates, bigger layered
> shoulder plates, a gold gorget, thicker greaves, a few small cyan gems. No cape, lettering or logos.
> Exactly ONE single figure, centred.

### Lessons (batch 4)
- Uploading the approved faction anchor as image 2 and saying "match the SECOND image" held the MGSD look
  on the first try for all 12 units; later edits that name "the SECOND image I uploaded" reuse the anchor.
- Negative wording fixed the old misses: "NO legs", "no long thin back limbs", "nothing held in the
  hands", "ONE single small stand ... no rings, no pedestal".
- The Gemini tab often reports `visibilityState=hidden` while the window is visible; the "+" menu then
  needs a second click (or a screenshot first) before the file inputs appear. Generation and canvas
  extraction still work while hidden.
- Receiver page: open the popup from a real click, then `postMessage` canvas data URLs to a local
  127.0.0.1 page that POSTs them to a small local server. Keep JS inside a Python bytes literal free of
  backslash escapes (a raw newline broke the first receiver).

---

## Batch 5 (Gemini, 2026-10-13): variants and structures that were still procedural

Ten units with no concept yet. One fresh Gemini chat per faction (Pro mode). Reference photos of the
real miniatures came from a retailer's public product images (kept in `refs-local/`, outside the repo):
the zergling and roach sets (the roach set shows the Corpser and Vile variants and the roachling tokens),
the Kerrigan & Omega Worm set, the adept set, the Raynor & Point Defense Drone set, and a small pylon
crop from the Protoss founders box. Raptor and Swarmling share the zergling kit. All images 1024x572.

| Slug | Base | Result | Measured on the image |
|---|---|---|---|
| raptor | 32mm | pass | zergling build, head + crest ~40%, two big bone bat wings, two scythes, stubby legs |
| swarmling | 32mm | pass (try 2) | one head ~45%, crest, no wings, slim scythes. Try 1 grew a second fanged head on the back |
| kerrigan-swarm-raptor | 32mm | pass | raptor edit: glossier violet, tall quill crest, glowing violet eyes and wing veins, no rider |
| corpser | 50mm | pass | roach body, bone-ribbed pink corpse-sac on the back, purple crystal spikes, shovel claws |
| vile | 50mm | pass | roach body, green acid glands between plates, green crystal spines, acid drool |
| roachling | 32mm | pass | round pill-bug shell ~65% of height, blunt head, tiny tusks, stubby legs |
| omega-worm | 80mm | pass | squat worm from a spiked flesh mound; toothed round mouth ~half the height, one side tendril |
| nerazim-watchers | 40mm | pass | adept edit: hood ~38%, ~2.6 heads, green eyes, violet-black + gold trim, green forearm glaive |
| pylon | 80mm | pass (try 2) | floating cyan crystal ~half the height in four gold ribs on a plinth. Try 1 had a small emblem on a blue panel |
| point-defense-drone | 32mm | pass | domed saucer ~55%, dish + two antennae, front laser turret, stubby fins, one thin clear stand |

### Zerg chat (images: style, zergling.png, zergling set photo)
raptor (first prompt):
> Generate an image: an SD Gundam style model kit figure (Bandai MGSD line) of a Raptor strain swarm beast,
> an evolved leaping variant of our small swarm beast. Match the style, chunky toy-like shapes, violet
> carapace and pale bone palette, proportions and framing of the SECOND image (our swarm beast) closely;
> FIRST image = style reference only; THIRD image = anatomy only (use the winged beasts in it). The head is
> the biggest part of the figure (about 40-45%): a huge rounded armoured skull with a wide fanged jaw and a
> tall swept-back bony crest on top of the head. Two big curved bone scythe blade forearms, a tiny compact
> body, four short thick stubby legs with big chunky clawed feet, crouched low ready to leap. Two BIG bony
> membrane wings spread up and back from the shoulders (much larger than the SECOND image's small wings,
> like a gliding bat-wing frame of bone struts with violet membrane). Short tail. Fierce, not cute. Crisp
> Master Grade sculpted chitin plates. No lettering or text, no logos, no emblems. Front three-quarter
> view, plain round black base (32mm), white background, even soft lighting. Exactly ONE single creature,
> centred.

swarmling (try 2, kept; try 1 asked for "smaller, faster, sleeker ... running crouch" and grew a second head):
> Generate an image: that one has a second head growing on its back, which is wrong. Start again from the
> SECOND image I uploaded (our SD swarm beast) and keep its MGSD style, violet and pale bone palette, base
> and background. Make the Swarmling strain: a SMALLER, slimmer, sleeker beast for a 32mm base, with exactly
> ONE head at the front: the huge armoured skull with the wide fanged jaw is the biggest part (about 45% of
> the figure height). Behind the head only a short, smooth, streamlined body with swept-back carapace plates
> and a short thin whip tail with NO face, jaw or teeth on it. Two slim curved bone scythe forearms, four
> short stubby legs with chunky clawed feet, NO wings. Compact, the whole creature well inside the base.
> Fierce, not cute. No lettering or logos. Front three-quarter view. Exactly ONE single creature with ONE
> head, centred.

kerrigan-swarm-raptor (edit, kerrigan.png attached):
> Generate an image: start from the FIRST image you generated in this chat (the winged Raptor beast with the
> bone crest) and keep EVERYTHING the same: MGSD style, huge head, crouched leaping pose, two big bony wings,
> two scythe forearms, stubby legs, round black base, white background, exactly one head. Make it the hero
> queen's personal Raptor for a 32mm base, using the attached image (our SD hero queen) only for her colours
> and accents: a brighter, glossier royal violet carapace, her pale bone spines, and a tall swept-back crest
> of spiny tendril-like bone quills on the head echoing her segmented dreadlock hair, with glowing
> violet-pink eyes and a few small glowing violet vein lights along the wing struts and back. Slightly more
> ornate and elegant than a normal Raptor, still fierce, not cute. Do NOT add the woman herself, no rider.
> No lettering or logos. Front three-quarter view. Exactly ONE single creature, centred.

corpser (edit, roach.png + Corpser photo attached):
> Generate an image: start from the FIRST attached image (our SD armoured burrowing beast) and keep its MGSD
> style, squat chunky toy-like shapes, violet carapace and pale bone palette, round black base and white
> background. Change the subject to the Corpser strain for a 50mm base: the same squat beast with a low wide
> head with bone tusks, but its back carries a big swollen, bulging corpse-sac (a fleshy, lumpy egg-sac
> blister in dark violet and mottled pink, bound by bone ribs) where the domed shell was, plus a few tall
> purple crystal-like chitin spikes; its front legs end in big heavy shovel-like burrowing claws. Short
> stubby legs. SECOND attached image = anatomy and spike shapes only. Compact, inside the base. Fierce, not
> cute, not gory. No lettering or logos. Front three-quarter view. Exactly ONE single creature, centred.

vile (edit, roach.png + Vile photo attached):
> Generate an image: start from the FIRST attached image (our SD armoured burrowing beast) and keep its MGSD
> style, squat chunky toy-like shapes, violet carapace and pale bone palette, domed shell, round black base
> and white background. Change the subject to the Vile strain for a 50mm base: the same squat beast with a
> low wide head and bone tusks, but with big glowing toxic-green acid glands bulging between the shell
> plates, a cluster of translucent green crystal-like acid spines on top of the shell dripping green slime,
> and green acid drooling from its fanged jaw. Short stubby clawed legs, two short scythe forearms. SECOND
> attached image = anatomy and gland shapes only. Compact, inside the base. Fierce, not cute. No lettering
> or logos. Front three-quarter view. Exactly ONE single creature, centred.

roachling (edit, refers back to the attached roach.png):
> Generate an image: start from the armoured burrowing beast image I attached with my last message (our SD
> roach, not the green one you just made) and keep its MGSD style, violet carapace and pale bone palette,
> round black base and white background. Change the subject to a Roachling: a tiny newborn baby of that beast
> for a 32mm base, VERY chunky and round, like a little armoured pill bug. A big round domed shell that is
> most of the figure, a big blunt head with two tiny bone tusks and a small fanged jaw, four very short
> stubby clawed legs, two tiny stubby scythe nubs, a few small rounded bone spines. No green, no acid, no
> crystals. Toy-like and chunky but still a fierce little beast, not cute. No lettering or logos. Front
> three-quarter view. Exactly ONE single creature, centred on the base.

omega-worm (new subject in the same chat, Omega Worm photo attached):
> Generate an image: keep the same SD model kit (MGSD) style, chunky toy-like shapes, violet carapace and
> pale bone palette, plain round black base and white background as the swarm beasts in this chat. New
> subject: the swarm's giant tunnel worm, a living burrow structure for a big 80mm base. A huge, thick,
> squat segmented worm rising straight up out of a low lumpy burrow mound of violet flesh and bone ridges
> that covers the base; the top of the worm is the SD 'head' (about half the figure height): one enormous
> round open mouth facing forward, ringed with rows of pale bone teeth, with a dark throat. Two short thick
> tendril-jaws curl up beside it, smaller than the main mouth. Thick bony plates and pale bone spikes around
> the mound. Squat, wide and chunky, not tall and thin. Attached image = anatomy only. Fierce, not cute, not
> gory. No lettering or logos. Front three-quarter view, whole worm and mound inside the round black base.
> Exactly ONE single creature, centred.

### Protoss chat (images: style, adept.png, adept set photo)
nerazim-watchers (first prompt):
> Generate an image: an SD Gundam style model kit figure (Bandai MGSD line) of a Nerazim Watcher, a shadowy
> dark templar variant of our light agile alien warrior. Match the style, huge-head proportions (the head is
> the biggest part, about 40-45% of the height, as wide as the shoulders), stubby legs, crescent glaive on
> the right forearm, panel lines and framing of the SECOND image (our warrior) closely; FIRST image = style
> reference only; THIRD image = armour and weapon shapes only. Changes: a big deep hood and short wrapped
> scarf over the head, two glowing green eyes in the shadow of the hood, sleek DARK VIOLET-black armour
> plates with small muted gold trims, and the crescent warp glaive on the right forearm glowing green instead
> of cyan, reaching past the fist. Both hands empty fists, nothing held, no blade on the left arm, no cape.
> No lettering or logos. Front three-quarter view, plain round black base (40mm), white background. Exactly
> ONE single figure, centred.

pylon (try 1, pylon crop attached):
> Generate an image: use the SECOND image I uploaded in my first message (our SD gold warrior) only for the
> model kit style, polished gold and deep royal blue palette with cyan glow, and Master Grade panel lines;
> keep the plain round black base and white background. New subject: an alien crystal energy pylon, a power
> structure for a big 80mm base, chunky and toy-like (SD model kit style, squat and wide, not tall and thin).
> A low wide ornate gold frame of four curved upright gold claw-ribs with deep blue panels and small cyan gem
> lights, standing on a short round gold plinth, cradling one big faceted glowing blue-cyan energy crystal
> that floats in the middle of the frame, its pointed tip rising above the ribs. The crystal is the SD
> 'head': about half the height. Attached image = part shapes only. No figure, no creature, no people. No
> lettering, glyphs or logos. Front three-quarter view, whole structure inside the round black base. Exactly
> ONE single structure, centred.

pylon (try 2, kept):
> Generate an image: start from the previous image (the gold pylon) and keep EVERYTHING the same (the
> floating crystal, the curved gold ribs, the ring, the plinth, the palette, the base, the background), but
> make it a little squatter and wider, and remove every symbol: the deep blue panels on the ribs must be
> plain and smooth, with only a small round cyan gem, and NO emblems, arcs, icons, glyphs, engraved marks,
> lettering or logos anywhere. Exactly ONE single structure, centred.

### Terran chat (images: style, goliath.png, drone photo)
point-defense-drone (first prompt):
> Generate an image: an SD Gundam style model kit figure (Bandai MGSD line) of a small hovering
> point-defense drone. Match the style, steel blue and dark gunmetal palette, chunky toy-like shapes, Master
> Grade panel lines and framing of the SECOND image (our walker) closely; FIRST image = style reference only;
> THIRD image = part shapes only. A squat round domed saucer body (the SD 'head', about half the figure
> height, big and chunky) with a small round sensor dish on top and two short antennae, a small chunky laser
> turret with a short barrel under the front edge, and three short stubby landing fins below. It hovers on
> ONE thin clear stand rising from the centre of a plain flat round black base (32mm); a small soft cyan
> thruster glow under the body, no flames, no smoke. No crew, no lettering, numbers, stripes or logos. Front
> three-quarter view, white background, even soft lighting. Exactly ONE single drone, centred.

### Lessons (batch 5)
- Retailer Shopify feeds (`/collections/<x>/products.json`) list every product photo; one curl gave the
  miniature shots for variants that have no product page of their own.
- A variant edit can grow a second head on the back of a quadruped (swarmling try 1). For small beasts say
  "exactly ONE head ... a tail with NO face, jaw or teeth" up front.
- Structures pick up faction-like emblems on flat panels even with "no logos" in the prompt; a follow-up
  edit naming the panel ("plain and smooth, only a small round gem, NO emblems, arcs, icons") fixed it.
- In this Gemini build a click on "+" can land on the generated image and open its sketch editor. Use
  `find` for the "Upload & tools" button and click it by ref, take a screenshot, hover "Upload files", then
  tag the `accept="image/*"` input with an aria-label so `find` returns exactly one ref.
- An image served from an `lh3 ... gg-dl` URL cannot be drawn to a canvas directly: `fetch(src + '?alr=yes')`
  returns a text body holding the real URL, and fetching that returns the image blob.
