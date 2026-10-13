# 21 Data entry guide (for the entry batches)

Schema: spec 20 (frozen). Exemplar to copy: `data/sc-2026-10/units/terran/marine.json` and its CT row in
`data/sc-2026-10/costs/terran.json`. Check your work with `npm run validate:data` until it prints `ok`.

## Sources and what to read
- Read values from the card IMAGES, not the extracted text (columns interleave, brackets get lost). Render a
  card page with PyMuPDF (`python -I`, `page.get_pixmap(dpi=150)`; the top half of a unit page is upside down,
  rotate it 180) into the gitignored `docs/sources/png/`.
- Precedence: CT 10.2026 and CL 10.2026 over card and rulebook values; the FAQ clarifies. BattleScribe files are
  a cross-check only: never copy or cite them. Known BS faults: Protoss Size column, pre-CL costs.
- Leak list: never use StarCraft II game numbers, pre-June-2026 preview rules, or other wargames' numbers.

## Files you own (one batch never touches another batch's files)
| Batch | Files |
|---|---|
| Terran | `units/terran/<unit-id>.json`, `costs/terran.json`, `hooks/terran.json` |
| Zerg | `units/zerg/<unit-id>.json`, `costs/zerg.json`, `hooks/zerg.json` |
| Protoss | `units/protoss/<unit-id>.json`, `costs/protoss.json`, `hooks/protoss.json` |
| Cards | `cards/<card-id>.json` (faction, tactical, creep), `costs/cards.json`, `hooks/cards.json` |
| Core | `missions/`, `deployments/`, `presets/`, `keywords.json`, `rules.json`, `hooks/core.json` |
Need a new keyword, status, faction tag or effect op? Do not add it; report it in `issues`.

## Ids
- kebab-case of the printed name: `C-14 RIFLE` -> `c-14-rifle`, `"JUSTICE" REVOLVER` -> `justice-revolver`,
  `RAYNOR'S RAIDER (MARINE)` -> `raynors-raider` (drop the parent in brackets; set `variantOf: "marine"`),
  `READY FOR PICKUP?!` -> `ready-for-pickup`. Apostrophes and punctuation vanish.
- Upgrade id = its CT row name in kebab-case; a weapon or ability inside the upgrade uses the same id.
- A weapon name printed in both phases (Queen TALONS): the combat one gets `-cc` (`talons-cc`).
- Missions: `<mission>-<scale>` (`supply-drop-skirmish`); one record per printed card face.
- Cost files: `ct-2026-10-<owner>` with `"table": "ct-2026-10"`, `"date": "2026-10-09"`.

## Units and numbers
- Inches as plain numbers; `E` for close-combat range; `"4+"` -> `4`; printed `-` -> `null`.
- Speed `4/7` -> `[4, 7]`. Base `Ø 32MM` -> `32`; oval `40×100MM` -> `[40, 100]`.
- `supplyProfile`: every printed bracket, e.g. `1-3 / 0` -> `{"min": 1, "max": 3, "supply": 0}`.
- `factionTags`: every tag under the art, race first (`["zerg", "kerrigans-swarm"]`). `unique`: the UNIQUE banner.
- `slot`: printed ARMY SLOT in lower case; no slot printed -> `null` and `"summoned": true` (no CT row).
- `cardVersion`: `v 1.04.26` -> `"1.04.26"`. `source`: `["CS1-T p.1", "CT p.2"]` (+ `"CL p.2"` when CL changed it).
- Weapons: Surge type `-` -> `[]` and `"sDice": null`; `D3+1` stays a string; keywords as KwRef
  (`LONG RANGE (18")` -> `{"kw": "LONG_RANGE", "x": 18}`). `SIEGE MODE Status` in the Keyword column ->
  `"requiresStatus": "SIEGE_MODE"`. Blast template: `"roa": "BT+4"`, `"sDice": "BT"`, `"template": "BT"`.

## Abilities (spec 20 s2.2-2.3 lists every op and field)
- `type` from the coloured tag, `phase` from the box it sits in (`ANY PHASE` -> `"any"`), `cost` from the green
  tag (`1 CP` -> `{"res": "CP", "n": 1}`; `0 PE` is `n: 0`). `Once per Game/Round` -> `limit`; REPEATABLE ->
  `"repeatable": true`. Card abilities omit `cost`.
- Recurring abilities, always the same shape: Devastating Charge = passive, `trigger {event: chargeSucceeded}`,
  `impact x y`; Squadron = `coherency d 4`; Commander = `supplyOverride` control/contest/objectives/disengage
  +1; Structure / Indomitable / Large = `grantKeyword` STRUCTURE / INDOMITABLE / LARGE; Burrow Ambush = passive
  upgrade, `trigger nominatedToDeploy`, `endsActivation`, `place x 18 from entryEdge minEnemyDist 10`.
- Conditional passives use `when` on the effect (Slugthrower: `{attack: ranged, weapons: [c-14-rifle],
  targetWithin: 8}`, `duration: thisAttack`). "X, or Y if ON CREEP" = two effects with `when.onCreep` false/true.
- Reactions name who acts and who it happens to: `{event, who, subject, within}`.
- Tokens the card sets go in the record's `tokens[]`; "at the End of the Round set the Unit at the token" is a
  second effect `place from token ... at {event: endOfRound}`.
- Effects nothing in the table can say: one `{"op": "code", "code": "<hook-id>"}` and a line in your
  `hooks/<area>.json` (`{id, text, source}`). Keep hooks rare.
- Misprints: enter the corrected value and add `provenance` (`{"cost": "card prints 1 CP; Zerg pays BM"}`), and
  a RULING line in `docs/needs-rules-check.md` only if your prompt lets you edit it; otherwise report it.

## Text fields (IP rule)
- Every ability, option, token and mission `text` is OUR words: one line written from the mechanical summary
  of the effect, never a paraphrase of the card sentence. Short and plain ("Take 2 non-lethal damage to gain +3
  Speed and PRECISION 3 on rifles and melee weapons this Round."). The validator rejects any 8-word run that
  matches the card sheets. No art, no card scans, no extracted text in the repo.

## CT rows
- Copy compositions and upgrade prices from CT (one price per composition, small -> large; `-` -> `null`).
  Every upgrade on the card needs a price; every priced upgrade must exist on the card. Units in CT with no
  card in our sheets may get a row; the validator warns.
