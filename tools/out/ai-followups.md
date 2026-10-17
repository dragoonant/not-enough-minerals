# AI follow-ups (2026-10-16)

Engine-side (not fixable in src/ai):
- `ability.react` / `ability.skipReaction` answers were rejected with `E_TODO` (abilities resume) for several Protoss and Terran games
  earlier in the day; the bench counts these as `engineBlocked`. Re-run the all-matchup bench after the engine lands them.
- zerg-expanded games stalled with a Reaction decision (`brood-instinct`, ids like d:223) that stays open after an accepted answer;
  the random tier used to repeat the same pick forever (fixed: random now never repeats an answer for one decision id), the engine
  still keeps the decision open. Bench class `ENGINE-STUCK`.
- `ability.pay` offers cost combinations the host refuses (`E_COST`) in protoss-mirror-x and tp-x; the bot now prefers combos the dry run
  accepts, but when every offered combo is refused no answer works.
- `charge.path` was offered for an Engaged unit once (`E_ENGAGED`) in a random-tier game.

Contract notes:
- `melee.keywords` is not in the frozen `DECISION_KINDS`; the bot answers it through the `melee.*` namespace entry. Added policies:
  melee.keywords (PRECISION/CRIT on the most valuable, most wounded target), ability.target for costReaction (use the Reaction),
  MORPH removal (least casualty cost) and RESPAWN spots (never skip when a spot exists). charge.impact `custom` is never chosen
  (even/all-at-one only).
- `AGG` knobs in `src/ai/moves.ts` (env `AI_AGG`, node only) hold the tuned values; defaults are the shipped ones.

Open AI work:
- Normal vs easy is 0.82 to 0.84 on rotated Missions; objective play against a careful opponent is untested (random baseline only).
- Zerg-mirror and other swarm boards cost about 1.4 ms per work unit; a per-model cost term in previewCost would tighten the tail.
- Hold/expanded armies with Siege Tanks (long range, tank mode) have no special policy.
