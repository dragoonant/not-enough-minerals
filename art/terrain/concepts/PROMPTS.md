# Terrain concept prompts (Gemini, terrain pass v2)

Tool: Gemini (Pro) in Chrome, one chat for the outpost set, 2026-10-13. File name = terrain slug. Owner brief: "not in
love with the terrain - it's too simple and not shiny, we need more war-torn and hurried construction builds, like in
war time." Original designs; no publisher art, logos or markings.

Images: 1024 px wide; the aspect follows the requested base (572 high for 1.5:1 bases, 434 for 4:1 walls, 223 for the
10 in blast wall, 765 for small and round pieces, 1024 for square).

## First prompt (outpost-comm-tower; Gemini gave a square base, so it became the 5x5 piece)
Generate an image of ONE tabletop wargame terrain miniature: a battle-damaged two-storey sci-fi frontier military
command bunker built in a hurry during wartime. Scorched riveted steel plates, shell holes, scrap armour plates welded
over breaches, sandbag walls stacked around the doorway, steel scaffolding with a ladder on one side, yellow-black
hazard stripes. Painted and weathered like a premium resin model kit: gunmetal and olive drab with glossy metallic
highlights, rust streaks, soot. It stands on a thin flat rectangular base about 1.5 times wider than deep. Whole model in
frame, three-quarter view from above, plain white background, even soft lighting, no people, no figures, no text, no
logos.

## Follow-ups
Each started with: "Same style, paint scheme, camera angle, white background and lighting. ONE model only, whole model
in frame. Now a different piece: ..." and the piece text from `tools/models/terrain/pieces.json`, plus the base shape
(RECTANGULAR 1.5:1, SQUARE, a strip FOUR or EIGHT times longer than deep, or ROUND). Stating the base ratio in capitals
is what made Gemini match the rules footprints.

## Lessons
- SDXL base without the figure IP-Adapter reference could not make isolated terrain miniatures (photoreal interiors,
  deserts, skies); Gemini got 12 of 12 usable images on the first try.
- Check which Chrome is connected: two Windows browsers can be listed. Use the one with `onThisComputer: true`, or the
  local receiver (`tools/models/terrain/receiver.mjs`, http://127.0.0.1:8799) is unreachable. Chats sync across
  machines, so opening the same chat URL on the right PC recovers the images without regenerating.
- Older images in a reloaded chat are served from googleusercontent (tainted canvas): fetch `<src base>=s0?alr=yes` with
  credentials and post the blob as a data URL. Fresh images are `blob:` URLs and can be drawn to a canvas.
