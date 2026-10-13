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
