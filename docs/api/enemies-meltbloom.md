# Meltbloom Gardens — enemies & set-piece events (module: enemies-meltbloom)

File: `src/entities/enemies/meltbloom.js` (G.Enemy framework, docs/api/enemies.md). Exposes
`G.MeltbloomEnemies = { BloomSpitter, ThornHopper, PollenMoth, VineLurker, BloomSeed, draw* }`.
Kinds are registered with `G.registerEnemy`; projectile `bloom_seed` with `G.registerProjectile`.
All sfx (`bloom_open seed_spit seed_pop pod_hop pod_land moth_swoop vine_rustle vine_burst vine_lash`)
are defined in the file via `G.Audio.defineSfx` unless the audio module already has them.

Brand hits to kill (lab, Brand L0 / L1 / L2 / L3): spitter 5/3/2/2 · hopper 4/3/2/2 · moth 4/2/2/2 ·
lurker 5/3/2/2. Every attack is telegraphed ≥ 0.45 s in silhouette + sound and followed by a ≥ 0.5 s
punish window. Damage is always 1. Every enemy waits ≥ ~0.8 s after the room loads before its first attack.

## Kinds

| kind | HP | body (px / tiles) | cinders | weight | placement marker |
|---|---|---|---|---|---|
| `bloom_spitter` | 22 | 36×58 (0.9×1.45) | [4,7] | 12 (rooted) | row directly above the floor |
| `thorn_hopper` | 20 | 34×30 (0.85×0.75) | [3,5] | 1 | row directly above the floor |
| `pollen_moth` | 18 | 32×28 (0.8×0.7), flying | [3,5] | 0.6 | centre tile of its hover spot |
| `vine_lurker` | 25 | 30×80 (0.75×2) when out | [4,7] | 12 (rooted) | floor: row above the floor · ceiling: row directly below the ceiling + `surface:'ceiling'` |

### bloom_spitter — rooted wax-flower turret
Closed cream bud on a leafy stem when idle (reads like garden decor). When the Wickling is in sight
(9.5 tiles, line of sight) the petals unfurl around a glowing gold throat (0.55 s telegraph, `bloom_open`),
then it lobs 1–3 seeds (`bloom_seed`, gravity arcs, destroyable by the Brand) — 1 seed when the player
is < 2.5 tiles away, 2 at < 5.5, else 3, spread ±0.7–1.15 tiles around the player — and closes again
(1.5–2.2 s cooldown). Never moves.
- Props: `facing` only. No range prop (it is stationary; its threat radius is its sight, 9.5 tiles).
- Placement: on solid floor or a ledge with ≥ 4 tiles of headroom above it (the arcs peak ~2–3 tiles
  above the line to the target; a low ceiling just pops the seeds early). Keep it ≥ 7 tiles from a
  doorway's landing zone or out of line of sight from it, so a player entering is not shot on arrival.
  Great on ledges overlooking thorn-strip platforming (forces the player to time jumps / cut seeds).

### thorn_hopper — thorny seed-pod
Crouches with bristling thorns (0.45 s, `enemy_windup`), then hops toward the Wickling in an arc
(up to 4.2 tiles per hop, apex 70–130 px), lands (0.5 s recovery), repeats. When it cannot see the
player it makes small 1.8-tile hops along its beat.
- Props: `range` (tiles, default 6) — the beat: it never lands farther than `range` tiles from its
  spawn x. Use it to keep the pod on its platform.
- Safety built in: every landing spot is checked (solid/one-way floor under the whole body, headroom,
  no thorns/lava/water at or beside the landing, no doorway zone, no wall in the arc, at most 2 rows
  up / 3 rows down). Knockback never pushes it off a ledge, onto hazards or into a doorway, and a
  committed hop is not bent by hits. Verified next to spike pits (dev_02) and an open chasm (dev_01).
- Placement: a floor run ≥ 4 tiles wide; ≥ 4 tiles from doorway landing zones.

### pollen_moth — gold-dusted swooping moth
Hovers with a soft bob; when the Wickling is within its leash it takes a perch ~3.5 tiles to the side
and ~2.6 tiles above the player, its pollen lantern flares and its wings rise (0.55 s, `enemy_windup`),
then it dives along a straight line through the player's position (540 px/s, `moth_swoop`, pollen
trail) and glides out of the dive, climbing slowly (0.85 s punish window). Light: big knockback.
- Props: `range` (tiles, default 7) — leash around its spawn point; it only engages a player within
  ~1.15 × range and returns home when dragged out past 1.25 × range.
- Doorways: its perch is never inside a doorway zone (3.5 tiles deep from each opening), it never
  dives at a player standing in a doorway zone, and a dive brakes hard before a doorway / room edge.
- Placement: in open air (≥ 4 tiles of clear space around the spawn) with the floor below reachable
  in a straight line. One-way platforms stop a dive (it bonks and recovers), which is fine but makes it
  harmless — avoid placing it above platform ladders. Keep the spawn ≥ 5 tiles from doorways.

### vine_lurker — ambush vine
Hidden: only a leaf tip shows in the floor (ceiling variant: a curled tendril under the ceiling),
untargetable and harmless. When the Wickling comes within 3.1 tiles horizontally (and 2.6 tiles
vertically; ceiling: anywhere below within its reach) and in line of sight, the leaf trembles and soil
spits (0.45 s, `vine_rustle`), then it bursts out (`vine_burst`, small shake; contact hurts), rears
back (0.45 s; 0.4 s for the second lash) and lashes a thorned whip 2.7 tiles in front of it
(`vine_lash`). After a 0.55 s recovery it lashes once more if the player is still close, then retracts
(1.3 s before it can ambush again). Hurtable only while out.
- Props: `surface: 'ceiling'` for the hanging variant (marker on the row directly below a solid
  ceiling, with 3–6 tiles of clear space down to the floor — the lash reach is measured at spawn).
- Placement: on a flat floor tile in a corridor or at a landing the player will cross; ≥ 5 tiles
  from doorways and never directly on a door landing; not on one-way platforms; leave ≥ 3 tiles of
  flat floor on both sides so the player can step back out of the whip. Hint it with flowers/leaf
  decor nearby (the leaf tip is deliberately subtle).

## Projectile
`bloom_seed` — r 7, gravity 1150, life 4 s, damage 1, destroyable (Brand cuts it), pops on terrain.

## Set-piece events (`{ type: 'event', script, ... }`, see docs/api/interact.md)
| script | props (tiles) | draws |
|---|---|---|
| `mb_ravine` | `c0 c1 r0 r1`, `alpha` (0.9), use `z: -20` | a deadly chasm reads as a void: gradient from clear (row r0) to near-black (row r1) across cols c0..c1 |
| `mb_meltbloom` | `cx` (stem centre col), `r0` (cup rim row), `r1` (ground row), `cw` cup half-width, `sw` stem width, `petal` petal length; `z: -20` | THE Meltbloom: cathedral-tall wax flower with a breathing gold glow in its cup (cached canvas) |
| `mb_glassroof` | `c0 c1 r0 r1` (the solid roof rows); `z: -5` | leaded greenish glass panes over the roof rows, lit from above |
| `mb_grate` | `c0`, `w` (cols, 4), `r` (bottom row), `opens` (condition, e.g. `'lever:mw_lv1'`) | iron bars at the bottom of the shaft down to the Mothwood with violet light below; bars vanish once `opens` is true |
| `mb_pod` | `c0 c1 r0 r1` (pod tile rect, walkable top = r0), `top` (ceiling underside row the stalks hang from); `z: -5` | a ribbed wax seed pod over GLAZED pod tiles, split at the top, hung on vine stalks (mb_03's wings reward) |
| `mb_petals` | `spans [[c0, c1], ...]`, `row` (deck top row), `droop [cols]` (span ends over a drop) | the Petal Bridge deck: fallen wax petals whose upper edge is the walkable surface |
| `mb_leaves` | `leaves [[c0, c1, row, base], ...]` (base -1 = stem on the west end, 1 = east); `z: -5` | the Meltbloom's broad leaves over its one-way leaf platforms |
| `mb_thorns` | `auto` (true: every `^` run of the room), `climb [[col, r0, r1, side]]` | black hooked brambles with pale tips over the thorn hazards (tips stay within ~0.45 tile of the hazard tile), optional wall brambles in ravines |
| `mb_hedges` | `hedges [[c0, c1, topRow, floorRow]]`, `alpha` (0.9); `z < -10` | the Thornwalk's towering black thorn hedges behind the corridor |
| `mb_brick` | `c0 c1 r0 r1` (crumbles from the c0 side); `z < -10` | the Guttered Ways' old brick back wall crumbling into wax soil (mb_01's east end) |
| `mb_lip` | `c0 c1 r0 r1` (the X tiles), `bowl` (-1 / 1: side of the cup's bowl) | the Meltbloom cup's rolled wax lip painted over the glazed lip tiles (mb_02) |
| `mb_roots` | `c0 c1`, `every` (3), `len` (3.2), `skip [[a, b]]` | pale wax roots hanging from the ceiling (stop >= 3 tiles above the floor, never reach a platform) |

## Verification
- `node tools/enemy_selftest.js --kinds bloom_spitter,thorn_hopper,pollen_moth,vine_lurker --region meltbloom --out test-output/enemies-meltbloom`
- Scripted fights / edge cases: `test-output/enemies-meltbloom/fight.js`, `trace.js` (use with `tools/shot.js --evalFile`);
  in-game action sheet `test-output/enemies-meltbloom/sheet.js` → `enemies.png`; set pieces `events.js` → `events.png`.

## Telegraphs by mode (easy / standard / hardcore)

The difficulty modes (`G.game.difficulty()`; `G.telegraphsOn()` is true only in Easy) change only **explicit** telegraphs: drawn geometry that outlines where or
when damage lands (floor zones, landing marks, aim/trajectory lines, hitbox previews, danger tints). Those draw only
while `G.game.telegraphs()` (alias `G.telegraphsOn()` in enemy_base) is true, which means easy mode only. The
telegraph audit (module tele-enemies) found **no explicit marker on any of these enemies**. Every tell below is
**diegetic**: the attacker's own wind-up pose, a glow or glint on its body or weapon (`telegraph()` anchors it on the
body, weapon tip, lantern, bell or pot), its sound cue, the wind-up shake, particles it emits, or projectiles forming on
it and visible in flight. So all three modes look and play the same, with the same timing. Nothing was removed and
nothing was kept-subtle. Verified: `test-output/tele-enemies/sheet_meltbloom.png` shows easy and standard side by side
with seeded randomness and 0.00 % pixel difference at every wind-up. The lab self-test passes in all three modes
(`test-output/tele-enemies/run_all.sh`). **Rule for new attacks:** gate any explicit marker at draw time with
`G.telegraphsOn()` (or keep it with `keep: true` and document why), and keep a diegetic tell of at least 0.35 s.

| attack | easy | standard / hardcore | diegetic tell (lead time) |
|---|---|---|---|
| bloom_spitter: seed volley | no explicit marker | same as easy (nothing to remove) | **open** 0.55 s: the petals unfurl around a glowing gold throat, glint on the head, `bloom_open`, shake. The head tilts toward the aim |
| thorn_hopper: hop / chase leap | no explicit marker | same as easy (nothing to remove) | **crouch** 0.40 s (travel hop) / 0.45 s (chase leap): squats and shakes, glow pulse on the pod, plus `enemy_windup` on the chase leap |
| pollen_moth: dive | no explicit marker | same as easy (nothing to remove) | **charge** 0.55 s: brakes, wings raised, the gold abdomen pulses brighter, `enemy_windup`, shake; pollen trail in flight |
| vine_lurker: emerge | no explicit marker | same as easy (nothing to remove) | **stir** 0.45 s: the leaf trembles and soil spits at its own burrow (a faint glow there, no glint), `vine_rustle`. This is a natural precursor at the attacker and does not outline the 2.6-tile lash |
| vine_lurker: lash (1st / 2nd) | no explicit marker | same as easy (nothing to remove) | **windup** 0.45 s / 0.40 s: coils back away from the Wickling, jaw opens, glint, `enemy_windup` |
