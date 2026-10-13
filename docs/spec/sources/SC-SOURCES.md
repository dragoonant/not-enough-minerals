# StarCraft TMG source map

First pass 2026-10-13 from web search; second pass 2026-10-13 after downloading and extracting every free official
PDF. Rules PDFs, card sheets and community data live in gitignored `docs/sources/` (PDFs) and
`docs/sources/text/*.txt` (PyMuPDF text, `=== PAGE n ===` markers) and are never committed. Every data value cites
one of these sources. **Page numbers in all specs are PDF pages**; R's printed folio is the PDF page minus 2.
`(?)` = still unconfirmed.

## Primary (official, free): Archon Studio, licensed from Blizzard
Index: https://starcraft-tmg.com/downloads. Site: https://starcraft-tmg.com. All 12 PDFs below were downloaded on
2026-10-13 (the per-unit PDFs U and set manuals M were not; nothing in them is needed so far).

| Tag | Document | File (prefix `https://starcraft-tmg.com/files/downloads/`) | Pages | Version / date |
|---|---|---|---|---|
| R | Core rules, full (15.7 MB) | `StarCraft-TMG_EN.pdf` | 128 | posted around 1-2 Jun 2026; no version string in the text |
| QS | Quick Start rules | `StarCraft-TMG-Quick-Start-Rules_EN.pdf` | 10 | 2025-11-03 (per listing); summary only |
| F | FAQ | `StarCraft-TMG-FAQ_EN.pdf` | 5 | v1.1, 25.09.2026 (74 rulings, mapped in `../19-errata-and-faq.md`) |
| CL | Changelog 10.2026 (overrides R) | `StarCraft-TMG-Changelog-10.2026_EN.pdf` | 2 | dated 09.10.2026; 36 cost changes, no rule-text changes |
| CT | Cost Table 10.2026 (overrides R 12.10-12.11) | `StarCraft-TMG-Cost-Table-10.2026_EN.pdf` | 8 | dated 09.10.2026; also prices units outside our slice |
| OP | Organised Play guide | `StarCraft-TMG-Organised-Play_EN.pdf` | 11 | tournament rules only (army sizes, timing, draft priority) |
| CS1-T | Card sheets wave 1, Terran | `StarCraft-Terran-P2P-Card-Sheets-A4_EN.pdf` | 14 | May 2026 v1.0; cards v1.04.26 |
| CS1-Z | Card sheets wave 1, Zerg | `StarCraft-Zerg-P2P-Card-Sheets-A4_EN.pdf` | 20 | May 2026 v1.0 |
| CS1-P | Card sheets wave 1, Protoss | `StarCraft-Protoss-P2P-Card-Sheets-A4_EN.pdf` | 14 | May 2026 v1.0; two cards still v1.03.26 |
| CS2-T | Card sheets wave 2, Terran | `StarCraft-Terran-P2P-W2-Card-Sheets-A4_EN.pdf` | 2 | September 2026 v1.0 (Siege Tank, Factory (Tech Lab)) |
| CS2-Z | Card sheets wave 2, Zerg | `StarCraft-Zerg-P2P-W2-Card-Sheets-A4_EN.pdf` | 2 | September 2026 v1.0 (Ravager, Cocoon) |
| CS2-P | Card sheets wave 2, Protoss | `StarCraft-Protoss-P2P-W2-Card-Sheets-A4_EN.pdf` | 5 | September 2026 v1.0 (Immortal, Zeratul, Nerazim Watchers, Nerazim cards, Artefact Hunt) |
| U | Per-unit PDFs (Marine ... Zeratul) | linked from the downloads page | - | not downloaded |
| M | Set manuals, Lost Temple and Ramp terrain, Zeratul promo | linked from the downloads page | - | not downloaded |

Where things are in R (PDF pages): Part 1 worked example p.7-29 (golden test source), Part 2 core concepts p.30-32,
Part 3 dice p.33-34, Part 4 measuring/movement p.35-39, Part 5 cards p.40-45, Part 6 supply p.46, Part 7 battlefield
p.47-56, Part 8 game sequence p.56-74, Part 9 army building/draft/setup p.75-80, Part 10 abilities and cards p.81-83,
Part 11 keyword glossary p.84-93, Part 12 quick reference p.94-115 (12.10 costs p.96-109 and 12.11 card costs p.109,
both superseded by CT; 12.12 example armies p.110-115), index p.116+.

- Rules news post (31 Mar 2026; web beta before that): https://starcraft-tmg.com/news/rules/starcraft-tabletop-miniatures-game-rules
- Official app "Command Center": https://sc.starcraft-tmg.com. Login-gated beta. No public JSON found. Stop rule: we do
  not create accounts. Nothing has needed it so far.
- How-to-play video: https://www.youtube.com/watch?v=EDBsIPVIOHw
- `docs/sources/downloads.html` is a saved Cloudflare challenge page, not the real index; ignore it.

## Product line (for the first slice)
- **Two-Player Starter Set, Founders Edition: Terran vs Zerg**
  (https://www.miniaturemarket.com/StarCraft-Two-Player-Starter-Set-Founders-Edition/ASSCMG0002)
  - Box contents per the retail listing (not restated in any official PDF): Terran 12 Marines, 2 Marauders, 3 Medics,
    Jim Raynor, Point Defense Drone; Zerg 24 Zerglings, 3 Roaches, Queen, Kerrigan, Omega Worm; 43x32 mm, 5x50 mm and
    2x80 mm bases, 15 terrain pieces, 48 cards, 20 D6, ruler, mat.
  - Corrected from R 12.12 "Founders Edition Starter" example armies (R p.111 Terran, p.113 Zerg) and the card sheets:
    - Terran list: 6 Marines (AGG-12 + Rocket Launcher), 6 Raynor's Raiders (Marine), 2 Marauders (Kinetic Foam),
      3 Medics (Stabilizer Medpacks), Jim Raynor; Faction Card Raynor's Raiders; Tactical Cards Academy, Barracks,
      Orbital Command. The 12 Marine models split into a Marine Unit and a Raynor's Raiders (Marine) Unit.
    - The Point Defense Drone is not bought: it has no CT cost, so it is a Summoned Unit (R p.78 9.1.9) put on the
      table by Orbital Command's Rapid Ingress (CS1-T p.9).
    - Zerg list: 12 Zerglings, 6 Kerrigan Swarm Raptors (Zergling), 3 Roaches, Queen, Kerrigan; Faction Card
      Kerrigan's Swarm; Creep Card Malignant Creep; Tactical Cards Evolution Chamber, Spawning Pool, Overseer. The
      example uses 18 of the 24 Zergling models.
    - Omega Worm (was `(?)`): confirmed. Its card carries the Kerrigan's Swarm tag (CS1-Z p.3), has no CT cost
      (Summoned-type Unit, Supply 0, Structure) and enters through Kerrigan's Swarm's Omega Network ability (CS1-Z p.14).
  - R 12.12 also has a Protoss "Founders Edition Starter" list (R p.115): 3 Zealots, 4 Adepts, 3 Praetor Guard
    (Zealot), 2 Sentries, Artanis; Khalai; Warp Prism, Gateway, Observer. Whether a boxed Protoss Founders product
    exists is not stated (?).
- Faction starters, each a 1,000-mineral army, released 31 Aug 2026 (R 12.12 "Starter" lists agree):
  - Terran: 9 Marines, 4 Marauders (two Units of 2), 3 Medics, Goliath (R p.110)
  - Zerg: 18 Zerglings (as Swarmlings), 4 Hydralisks, 3 Roaches (as Corpser, which summons the 3 Roachlings), Queen
    (R p.112)
  - Protoss: Zealots, 4 Adepts (Adept Shade = the Shade token), 2 Sentries (2 Force Field tokens), 2 Stalkers (two Units
    of 1) (R p.114). The list fields 3 Zealots; the retail box says 6 (?).
- Wave 2 (pre-orders 28 Aug 2026): Zeratul, Ravager, Immortal (100 mm), Siege Tank (150 mm), Lost Temple Ramp
  (https://starcraft-tmg.com/news/featured/pre-orders-for-starcraft-tabletop-miniatures-game-wave-2-are-now-open).
  Card data: CS2-T/Z/P (also Nerazim Watchers (Adept), Cocoon, Factory (Tech Lab), Nerazim faction, Void Seeker,
  Robotics Facility, Artefact Hunt mission, Meeting Engagement and Green Valleys deployments).
- All prices: CT 10.2026, never R 12.10/12.11 or the retail listing.

## Mechanics as previewed, now checked against R + CL + F
Sources of the first pass: https://www.wargamer.com/starcraft-tabletop-miniatures-game/how-to-play,
https://nodicenoglory.com/?p=36850, https://frontlinegaming.org/2026/02/27/starcraft-tabletop-game-first-impressions/,
https://rulespal.com/starcraft-tabletop-miniatures-game/rulebook
- Round of Movement, Assault, Combat, Scoring phases with alternating one-Unit activations: **Confirmed** (R p.56
  8.1-8.2). First to Pass in Phase 1 or 2 takes the First Player Marker for the next Phase; after Scoring it goes to
  the player with fewer VP (R p.57 8.2.1, p.74 8.9.6).
- D6 only; Hit, then Armour, then Evade, then Damage; leftover damage carries on a Damage Marker (a D6): **Confirmed**
  (R p.63-64 8.7.4).
- Surge: **Corrected**. It is not bonus hits. One extra Surge die is rolled; if the target has a Combat Tag listed in
  the weapon's Surge Type, that many already-successful hits skip the Armour Roll (they can still be Evaded, F p.3).
- Inches; Coherency = every model Wholly Within 3" of the Leading Model with a valid link; Engagement 1": **Confirmed**
  (R p.37 4.4, p.86).
- Army building: Skirmish up to 1,000 minerals / 100 gas, Standard 2,000 / 200 (gas = 10%): **Confirmed** (R p.75-77
  9.1.1-9.1.4; OP p.4). R also names a Grand Offensive scale (values in an image table, not extracted (?)).
- Supply: all Units start in Reserves; Supply Pool = Mission start value + escalation per Round; final Round unlimited;
  marker Control by highest total Current Supply in range, sticky, ties keep the holder: **Confirmed** (R p.46 6.2,
  p.57 8.3.1, p.71-72 8.9.1).
- Missions picked by a draft: **Confirmed** (R p.79 9.2: each player brings 2 Mission + 2 Deployment Cards, Roll-Off
  winner picks colour and which draft to control). OP replaces the Roll-Off with "less gas spent" priority (tournaments).
- Burrowed/Hidden "can't be targeted": **Corrected**. HIDDEN blocks Ranged Attacks and LoS abilities only from more
  than 4" away; Charges, close combat and area effects still reach it (R p.88; see `../18-keywords.md` ST-002).
  Zeratul's "cloak" = HIDDEN via One With the Shadows (CS2-P p.2).
- **Detection** (was `(?)`): **Confirmed**. No detector unit type; detection is "Enemy Units Within 6" lose HIDDEN"
  from Omega Worm's Detection (CS1-Z p.3), Scanner Sweep (Orbital Command), Oversight Mode (Overseer), Surveillance
  (Observer), Nerazim Farsight (Nerazim Watchers' Shade). The indicator-based ones bypass the 4" rule (F p.5).
- **Transports** (was `(?)`): **Corrected**. There is no embark/transport-capacity rule anywhere (R uses the word once,
  in Zone of Influence, p.93). "Transport" effects are card abilities that return a Unit to Reserves and/or redeploy or
  PLACE it: Strap In!, Ready for Dust-off, Ready for Pickup? (Dropship), Phase and Warp Conduit (Warp Prism), Ventral
  Sacs (Overlord), Personal Transport (Void Seeker), Omega Network, Strategic/Mass Recall. The engine needs no
  transport container; HANDOFF's "one transport container" should become "return-to-Reserves + redeploy".
- **Game length** (was `(?)`): **Confirmed**. Mission Card GAME LENGTH, usually 5 Rounds (R p.44 5.5, p.56 8.1 "up to 5
  Rounds"); our sheets print 5 except Supply Drop (Skirmish) and Divide and Conquer at 4. Early end: a Special Winning
  Condition (lead by 8+/10+/12+ VP depending on the card) or one player with no models on the table and none in
  Reserves (survivor +10 VP) (R p.74 8.9.3). At the end everything still in Reserves counts as Destroyed (R p.74 8.10).
- **Morale** (was `(?)`): **Confirmed absent**. No morale, break, rout or leadership test in R, QS, F, CL or the cards
  (searched morale, break, leadership, flee, rout). Attrition works through Supply: fewer models -> lower Supply ->
  weaker Control, Disengage and VP.
- Table 36x36" (Skirmish) and 54x36" (Standard): **Confirmed** (Deployment Cards, CS1-T p.13-14).
- **Solo / AI / co-op mode** (was `(?)`): **Confirmed absent** in all 12 PDFs (searched solo, single player, AI,
  co-op). R covers team games (R p.78 9.1.8) only. Our bot is the only opponent.

## Community (cross-check only, never committed)
- BattleScribe data (Terran, Zerg, Protoss .gst/.cat): https://github.com/stemlerm/starcraft-tmg (no official BSData repo)
- Roster builder (Vite/TS, likely unit JSON) + simulator: https://github.com/Andrea4595/StarcraftTMG,
  https://github.com/Andrea4595/StarcraftTMG_Simulator
- TTS mod source: https://github.com/gavrilikhin-d/tts-sc-tmg
- Dice odds: https://github.com/phannawich/starcraft-tmg-dice
- Other helpers: GenadiKrigan/Starcraft-TMG-Tracker, xCriticalStrikex/SC-TMG-Companion,
  kylecaulfield/StarcraftTMGHelper, loicmusy/StarcraftTMG-NR, keranjan/starcraft-tmg-fin (Finnish rules)
- Reviews: https://taleofpainters.com/?p=44368,
  https://taleofpainters.com/2026/04/review-starcraft-zerg-expansion-set-hydralisk/,
  https://frontlinegaming.org/2026/02/11/starcraft-tabletop-wargame-demo-archon-studios-first-look-at-koprulu-combat/
- Hub: https://www.wargamer.com/starcraft-tabletop-miniatures-game
- Not found: Vassal module, TTS Workshop page, fan wiki, dedicated subreddit.

## Leak list (put in every rules prompt)
| Wrong source | Leaks |
|---|---|
| StarCraft II video game | HP/shield numbers, build times, upgrade trees, real-time micro, energy regen |
| Preview/beta rules (wargamer how-to-play, demo reviews before Jun 2026) | stale costs, stats, phase details; "Surge = bonus hits"; "Hidden = untargetable" |
| R alone | superseded values: CL 10.2026 and CT override R (all of R 12.10-12.11 prices, R 12.12 example army totals); F clarifies |
| R 9.1.2 example text | Kerrigan's Swarm slots (3 Core, 1 Hero, 2 Support) disagree with the card (3 Core, 2 Elite, 1 Hero); card wins |
| Warhammer 40k / Mallet code | wound rolls, saves vs AP, OC numbers, stratagem CP: copy the code shape, not the numbers |
