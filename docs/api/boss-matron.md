# THE SOOT MATRON — Brood-Mother of the Flue (module `boss-matron`)

Third boss (Sootflue). A bloated soot-mother on eight spidery legs: a huge sooty abdomen glowing with coal-red eggs, a
cluster of ember eyes, ember-tipped fangs. She clings to the walls of her den (the player cannot yet), lobs soot, lays
eggs that hatch into brood sprites and, in her second phase, belly-slams so the chimneys rain burning soot.
Arena `sf_05` "The Matron's Den". Her defeat (`boss:matron`) opens the east gate `sf_gate9` to `sf_06`, where the
Wax Grip shrine (`requires: boss:matron`, region-flue) wakes.

| File | What |
|---|---|
| `src/entities/bosses/matron.js` | boss class (`G.Boss.register('matron', Matron)` → entity `boss_matron`), minion kind `matron_brood` (eggs + sprites), projectiles `matron_soot` / `matron_ash`, warning marks (entity type `telegraph`), defeat flourish entity `matron_lastbrood`, 17 sfx (`matron_*`, `brood_*`), room event script `matron_nest`; test hooks on `G.Matron` |
| `src/data/arenas/matron.js` | room `sf_05` — **generated**, do not edit by hand |
| `tools/gen/arena_matron.js` | the generator (`node tools/gen/arena_matron.js [--print]`) |
| `test-output/boss-matron/test.js` | fairness & robustness tests + contact sheets |

## Numbers

| | |
|---|---|
| HP | 320 (DESIGN §5.3). Expected Brand level **1** (9 dmg): 36 plain hits; L0 (5): 64; L2 25; L3 19. Ember Bolt (15) works normally. Measured (bot, no god mode): L1 ≈ 30 hits / 55–85 s, L0 ≈ 58 hits / 125 s |
| Phases | phase 2 at 50 % (`ignite` transition, uninterruptible; `G.Audio.musicLayer(1)`) |
| Stagger | after 120 damage (not during `ignite`): she falls from wherever she is onto her back, belly up, for 2.1 s; the soft underside takes **×1.5** (L1: 14 per hit); no contact damage while staggered |
| Damage | 1 for everything (body, stab, soot balls, falling soot, shockwaves, brood) |
| Body | 150×100 px standing (100×150 clinging), contact inset 12. Contact grace: after her body hurts the player, contact pauses for the i-frames + 0.45 s (0.75 s when she rolls back up from a stagger with the player on her) so they can always walk out; standing inside her is never safe (QA: it used to be a free face-tank) |
| Rest | 0.42–0.85 s between attacks (×0.78 in phase 2) |
| Music / reward | `boss` (automatic), no cinders (DESIGN: the reward is the Grip shrine), stinger `boss_defeated` |
| Brood | `matron_brood`: HP 5 (one hit at L0), flying, contact 1, no drops; cap **3** alive; eggs hatch after 1.1 s (pop them first, no contact while an egg); sprites drift beside/above the player keeping ≥ 90 px clear, **one dart at a time across the brood, and only while she is between attacks** (idle / skitter / brood / stagger, with none of her soot, ash, shockwaves or marks live, so a dart never stacks on another attack) (chirp 0.45 s → straight dart to where the player was +50 px, 430 px/s), then pull up and away; she in turn waits (stays idle) while a sprite aims / darts and 0.35 s after, so her next attack never lands on a dart; after ~14 s a sprite flies back up into the flues |

## Attacks (all wind-ups ≥ 0.45 s except combo follow-ups)

| Attack | Where | Telegraph | Active | Dodge | Punish |
|---|---|---|---|---|---|
| `pounce` | any perch | crouch + hiss 0.58 s (P2 0.5 s) | leaps onto the surface the player stands on; **landing mark** (bracketed glowing seam) for the whole flight (≥ 0.66 s); near-vertical take-off and landing; P2: shockwaves both ways on landing (mark widened over their birth) and 40 % of the time a quick second pounce (0.34 s crouch, combo follow-up) | run/dash out of the mark (under her if cornered: she is ≥ 140 px up mid-flight); P2: jump as she touches down | 0.62 s (P2 0.5 s) on landing |
| `spit` | any perch (walls: favourite) | rears, throat glows + gurgle 0.56 s (P2 0.5 s) | 3 (P2 5) soot balls lobbed around the player (130/140 px apart, ~1 s flight); a **landing ring** marks each spot from the moment it is spat + a moving shadow; balls fly past one-way planks unless aimed at one | stand in a gap or leave the spread | 0.62 s |
| `swipe` | standing, player ≤ 230 px on her surface, never with the player cornered (< 190 px behind on the floor) | both foreleg pairs raised + rasp 0.5 s (P2 0.44 s) | lunge 34 px and stab down in front (reach ≈ 120 px beyond her body); P2: second stab after a 0.3 s re-raise | back off (or jump over her) | 0.6 s |
| `brood` | any perch, < 3 brood alive, cooldown 12 s | abdomen swells and pulses, squelch 0.6 s | 2 eggs from the spinneret | pop eggs; sidestep / dash / jump the chirped darts | 0.7 s |
| `skitter` | floor | crouch + clicking 0.45 s | leaps to a wall cling (west: the shut gate + lintel above the ledge, centre row 13; east: above the door) or a raised platform ≥ 280 px from the player | — (repositioning; near-vertical take-off) | — |
| `ashfall` | P2, floor, cooldown 7.5 s | rears fully up, howl 0.7 s | belly-slam: shockwaves both ways + 5 warned soot columns (0.8 s, one on the player, 310 px apart; each lane stays lit until its clump has landed), then 4 more between them 0.95 s later | jump the waves, walk out of the lanes | ~1.9 s (she shakes off the ash) |
| `ignite` | P2 transition | screech | climbs to the vault, hangs on a soot strand (hurtable), the den's egg-sacs flare, then a 0.7 s crouch + **landing mark** and a drop with shockwaves | leave the mark, jump the waves | 0.8 s |

After 2 attacks from a wall/platform she always pounces back down. A phase change cuts the current attack (her
mark is put out) and starts `ignite` at once; a stagger runs out first. Stagger/defeat put out her own marks; ash
columns already warned still fall (the vault was struck).

Fight flow: the den is empty (sacs smoulder on the walls, the nest on the floor). Reaching the den floor (trigger cols
10–38 rows 16–23) shuts the west arena gate (the east gate `sf_gate9` is shut until her defeat). She lowers herself on a
soot strand from the vault over the nest (never right above the player), the camera glides up to her and the player is
held until she screeches (card, music, `bossStart`); she cuts the strand and drops. Defeat (custom style): slow-mo →
she rolls onto her back, legs curling, eyes going out one by one → one last brood sprite crawls out of her and flutters
up into the chimneys → soot burst, victory recorded, gates open; her curled husk stays in the den for good (flags
`matron_rest_x/_y/_f`, drawn by `matron_nest`; the sacs keep a dim glow — her brood lives on).

## Fight camera (QA)

The den (48 tiles) is wider than the screen (32). While the fight runs, the camera follows a stand-in for the player
(`_fightCam`, getters over `G.game.player`) leaned toward her: her centre is kept 170 px inside the view, the player
never more than 440 px off the view centre (>= ~190 px from the edge); when she is perched high (west cling, strand)
the view also lifts a little (her centre >= 230 px below the top edge, clear of the HUD). Wall clings more than 900 px
from the player are not chosen and spit/brood are rare from there, so she never attacks from off-screen (measured:
0 of 76 wind-ups off-screen, was 8 of 92). The plain player is followed again when she is removed / on room change.
At the end of the intro the lean starts at its full value (the view eases from the intro shot straight to the fight
framing; max camera move 11.5 px/step, was a 45 px/step swing back to the player); the upward lift starts with the
leap to a high perch, not after it.
Her husk never rests on the entry ledge / step or within 260 px of the east door: a body that would, tumbles onto the
den floor during the slow-motion.
Pending ash-column warnings are removed at the killing blow (nothing can hurt the player after it).

## Room `sf_05` (per the plan notes)

48×27, floor top row 24 (cols 1–46), vault rows 0–2 with four chimney throats (dead-end notches). West ledge cols 1–5
(top 15) with the arena gate `sf_ag1` (col 1, rows 11–14, lintel row 10, `side: 'right'`), solid step cols 6–9 (top 18),
one-way platforms cols 10–14 row 21, cols 20–28 row 17, cols 33–38 row 21. East door: **`gate` `sf_gate9`
(`opens: 'boss:matron'`)** at col 46 rows 20–23 under a lintel at row 19. `arena {boss:'matron', bx:30, by:6,
trigger:[10,16,38,23]}`. Event `matron_nest` at (30,23) with `sacs` (12 egg-sac clusters on the walls and vault).
Back-layer dressing only (chains, a hanging cage, pipes, ember grates, bones, rubble, a brazier on the ledge) + lights.
`theme {bg:'shaft'}`, `dark 0.5`. No hazards.

`validate --room sf_05`: 0 errors, 1 warning (`plan-content: unplanned gate:sf_gate9`, see below). `reach --room sf_05`:
7 ok, 0 warnings.

**Deviation:** the plan names an `arena_gate` at col 46; it is a boss gate (`gate`, opens `boss:matron`) instead, the way
the Effigy's `gw_gate1` works. Same behaviour in play (shut during the fight, open after the victory), but it is also
shut *before* the fight, which lets `reach` verify the plan's `boss:matron` requirements (with an arena gate, reach
reports three false GATE LEAKs, because it cannot model the fight trigger). Suggested plan entry:
`gate:sf_gate9?boss:matron`.

## Testing

```sh
node tools/gen/arena_matron.js && node tools/validate.js --room sf_05 && node tools/reach.js --room sf_05
node tools/enemy_selftest.js --boss matron --room sf_05 --out test-output/boss-matron/lab
node test-output/boss-matron/test.js [hit dodge defeat chaos flow sheet attacks]   # dodge:pounce,... runs a subset
```
`test.js` (42 checks, real arena, real player motor, dash only): (a) every attack (both phases, floor/wall/platform
perches) hurts an idle player for 1; (b) a reactive bot that sees only what is on screen (marks, lanes, landing rings /
balls in flight, wind-up poses after 0.2 s, waves, brood chirps) and uses left/right/jump/dash avoids every attack in
every configuration (215 configurations; those the scheduler would never pick are skipped); (c) dodge-and-strike bot fights
without god mode: L1 4/4 won, L0 3/3 won (5 masks); (d) 3 minutes of random input (half dash only, half all abilities)
with the boss chipped through both phases and re-fought after each defeat: no errors, never leaves the den, never
freezes, brood ≤ 3, every attack used; (e) arena flow from the west ledge through intro, card, music, defeat, gates,
stinger, husk, inert re-entry. Contact sheets: `sheet_poses.png`, `sheet_attacks.png`, `sheet_details.png`.

## Notes for other modules

- **[text]** `G.Text.bosses.matron` has only `name`/`sub`. She is a beast; if the text owner adds `intro` / `defeat`
  lines, `G.Boss` shows them automatically (intro at her screech, before the card; defeat after the slow-mo).
- Tests can drive her with `G.Matron` (`POSES`, `pose`, `drawMatron(ctx, pose, opts)`, `buildArena(room)`,
  `surfaceBelow`, constants) and the instance methods `leap`, `fall`, `arrive`, `swipeZone()`, `perchOptions()`.
- `buildArena` works in any room (surfaces from the tiles, gates as walls); wall clings are tuned for `sf_05` and fall
  back to the room's inner faces elsewhere.
