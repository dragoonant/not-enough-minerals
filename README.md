# Not Enough Minerals - Tabletop Miniatures Game

A 3D browser version of a tabletop sci-fi skirmish wargame, played against a bot or hot-seat on a 3 by 3 foot
table. Built by **evilgouki**.

**Unofficial fan project, not affiliated with Archon Studio or Blizzard Entertainment.** The game mechanics follow
StarCraft: Tabletop Miniatures Game, published by Archon Studio under licence from Blizzard Entertainment. All text,
figures, markings and art in this repository are our own; no publisher art, logos or rules text is included. Get the
official rules free from the publisher's site.

## Status
Early build (M0): a start screen and a placeholder 3D table with stand-in figures and a placeholder turn loop. See
`STATUS.md` for what exists and `PLAN.md` for the milestones.

## Run it
Needs Node 22 or newer.

```
npm install
npm run dev -- --port 5201 --strictPort   # http://localhost:5201/
npm run typecheck
npm test
npm run build                             # production build under /not-enough-minerals/
npm run e2e                               # Playwright (builds and previews on port 5202)
npm run sim -- --games 20 --seed s        # headless bot-vs-bot games with engine invariants
npm run bench:ai -- --games 10            # AI tier vs tier
npm run validate:data                     # data files against the schema
```

URL hooks: `?test=1` (skip the start screen, expose `window.__game`), `?seats=human,bot`, `?seed=<word>`,
`?tier=random|easy|normal`, `?speed=instant|fast|normal|slow`, `?fps`.
