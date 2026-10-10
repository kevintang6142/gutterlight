# The Guttered Ways — region notes (module: region-guttered)

Files: `tools/gen/guttered.js` (generator, roomkit) → `src/data/regions/guttered.js` (emitted, never hand-edit);
`src/entities/enemies/guttered.js` (4 enemy kinds + the `wax_drip` projectile + 3 set-piece event scripts).
Arena `gw_05` (The Old Guard's Hall) belongs to the Effigy builder (`src/data/arenas/effigy.js`).

```sh
node tools/gen/guttered.js [gw10 --print]        # regenerate (and print a room's ASCII with row numbers)
node tools/validate.js --room gw_01,...,gw_12    # 0 errors
node tools/reach.js    --room gw_01,...,gw_12    # 0 errors (2 benign warnings in gw_12, see below)
node tools/enemy_selftest.js --kinds snuffed_walker,snuffed_lancer,drip_fly,wick_crawler --region guttered --out test-output/region-guttered
node test-output/region-guttered/fight.js        # scripted 1:1 fights (aggression, damage, Brand hits to kill)
node test-output/region-guttered/roomsim.js      # every room × side entry: enemies' spawn distance, movement, bounds
node test-output/region-guttered/tour.js [ids]   # screenshots → test-output/region-guttered/tour/
node test-output/region-guttered/sheet.js        # pose contact sheet → enemies.png
```

## Rooms

| id | name | identity / gates |
|---|---|---|
| gw_01 | The Well | brick shaft from Lastlight; zig-zag one-way platforms (free climb); bottom chamber W1 → Bolt shrine, E2 → Hall; secret ledge + `B` wall → E1 (Alcove). 2 drip_fly |
| gw_02 | Hall of Dead Sconces | signature hall: arches every 12 cols, rows of dead sconces, banners, statues; N1 ceiling hole (one-way drop from the Alcove, unreachable from here); S1 to Drip Galleries with landing dips; gw_geo1 alcove, lore_gw_2 at col 60. 3 walkers, 1 drip_fly |
| gw_03 | Lantern Crossroads | HUB: Lanternway post (col 29) under a colossal dead lantern-frame, signposts, lore_gw_3; drop hole between upper (row 15) and lower (row 24) roads with platforms back up; west stair to N1. 1 lancer, 1 crawler |
| gw_04 | Shrine of the Kindled Bolt | chapel, no enemies; Ember Bolt shrine under a skylight, gw_sconce_a; stone arch east into gw_05; S1 hole to the tunnels |
| gw_06 | The Broken Bridge | DASH/WINGS gate to the Sootflue: deck on arched piers, 9-tile collapse (cols 26-34), 9-deep chasm, spike bed, glazed chasm walls; ember light from the east. 2 drip_fly over the gap (per plan; never required) |
| gw_07 | Sable's Perch | broken belfry top, great bell; Sable stage 1 glimpse on an unreachable beam; lore_gw_4; WINGS ledge (glazed) with gw_geo3; secret `B` wall → W1 (Alcove). 2 lancers |
| gw_08 | Drip Galleries | cave junction, 5 exits all ability-free; OILCLOAK pool under a 2-tile vault → gw_geo2 pocket. 2 drip_fly, 2 crawlers |
| gw_09 | Wren's Hollow | camp: Wren's tent (event `gw_tent`) and fire, gw_sconce_b; secret `B` niche with the Ember Thirst sigil; DASH/WINGS crack (10 wide, glazed, spikes 10 down) to gw_hw1. 1 crawler |
| gw_10 | The Descent Lip | GRIP gate to the Nave: 10-tile sheer `#` face (col 31) under poured wax (event `gw_waxwall`), plateau, pit to S1 (rain beyond); free climb out of the pit for players rising from the Nave (landing ledges beside S1 at top row 16 — baseline QA lowered them from 15: the exit boost cleared row 15 by only 3 px). 1 walker |
| gw_11 | Wickworm Tunnels | 160-wide ribbed tunnel; PLUNGE `D` floor over the spark_gw vault; DASH/WINGS wormhole gallery to gw_geo4; platform stack under N1. 3 crawlers, 2 walkers |
| gw_12 | The Chandler's Alcove | SECRET room: the many-handed maker mural (event `gw_mural`), Wax Notch on a plinth; S1 fenced hole = one-way drop into gw_02 |

Design decisions / deviations
- **gw_09 secret niche**: the plan puts the `B` wall at "west wall cols 2-3, rows 12-14", which are exactly the W1
  exit rows. The niche (6×3, sigil `gw_sig_ember_thirst`) sits directly above instead (rows 8-10, `B` at cols 8-9),
  reached from a 4-up shelf over the W1 doorway — still "behind the tent", same reward, same requirements.
- **gw_12 reach warnings** (S1→E1, S1→W1 possible): S1 can only be entered by rising out of gw_02's N1, which reach
  proves unreachable inside gw_02 (15-tile ceiling hole, no planned or measured path to N1). Harmless.
- Lanternway hub (gw_03): both hub enemies stay on the upper road within sight of the post: the crawler at col 18
  (`range: 3`), the lancer at col 46 (`range: 3`, east of the drop hole). Deviation (QA): the plan puts the crawler on
  the lower road; it was moved when the post refused travel while ANY enemy in the room lived. Since integration
  wave 1 the rule is radius-based (`G.game.isSafeRoom`: no hostile within 12 tiles, not hurt/attacked for 3 s), so
  the placement is no longer required, only kept.
- Enemies are ≥ 8 tiles from every side entrance (roomsim: 0 flags).
- gw_03 drop hole: the upper road's slab thins to one row west of the hole (cols 31-40, row 16) so the one-way
  platform under it (row 18, cols 33-40) has 2 tiles of headroom - players who drop in walk off it westward. Its
  east end is shut by the slab on purpose: S1's hole (cols 44-47) lies just east and would swallow them.
- gw_09: the wick_crawler has a beat (`range: 5.5` around col 42): the crack's lip and west wall, ≥ 6 tiles from
  gw_sconce_b, never into the camp.
- gw_06 dash gap: 9 tiles since integration wave 1 (critical-path rule; was 10). Measured with real inputs
  (`test-output/integration/w1/gapsweep9.js`): jump + air-dash crosses from take-off positions 24.6-26.8 (player
  centre, lip at 26.0; ≈ 2.2 tiles incl. coyote, was ≈ 1) with the dash 18-42 frames after the jump; impossible
  without dash (reach, also against the maximal pre-dash ability set = none).
- Secrets are hidden by the engine's automatic secret-pocket veil (`G.World.hiddenPockets` + art; was the QA's
  per-room `gw_veil` event, removed): the Ember Thirst niche (gw_09), the spark vault under the cracked floor (gw_11)
  and the doorway slots behind the Alcove's cracked walls (gw_01 col 31, gw_07 cols 0-1 — openings into the secret
  room gw_12, `secret: true`, do not count as openings) render as solid rock until the `B`/`D` breaks (or while the
  player is inside the slot). Only the crack network and a faint glow/embers of the hidden item give them away.
- Hazard respawns (QA): `respawn` entities a few tiles back from both lips of the Broken Bridge (gw_06) and of Wren's
  crack (gw_09). Their trigger boxes end exactly at the lip, so a fall can never respawn the player on the far side.
  The chasms fade to black (`gw_abyss`) so they read as deadly voids even though the spike beds sit below the view.
- gw_10: no rain particles inside the cave; the room's `ambience` is `rain` (the Nave's rain heard from the pit).
- gw_02: drip_fly at col 24 (clear of the N1 drop column); a second, dimmer back row of dead sconces.
- `tools/gen/guttered.js` guards `put()`: a marker may only land on an empty tile (roomkit silently replaces markers).
- `test-output/region-guttered/route.js` drives the main road with real inputs (gw_04 → gw_01 → gw_02 → gw_03 →
  gw_06 incl. the dash; gw_03 drop hole → lower road → gw_08): all OK, 0 errors.

## Enemies (`G.registerEnemy`)

| kind | HP | cinders | Brand hits lv0/1/2/3 | behaviour (telegraph) |
|---|---|---|---|---|
| snuffed_walker | 18 | 3-6 | 4/2/2/2 | slow patrol (turns at ledges/walls, 0.7 s pause); player close in front → rears up (0.45 s, eyes flare) → lunges ~4 tiles → 0.75 s slump (punish) |
| snuffed_lancer | 22 | 4-7 | 5/3/2/2 | marches; turns slowly (0.85 s) if you're behind; in front ≤ 6 tiles → levels the lance (0.3 s) → plants with tip glint (0.5 s) → long thrust-charge (stops at walls/ledges) → 0.95 s recovery |
| drip_fly | 12 | 2-4 | 3/2/1/1 | flying; stalks to ~2.7 tiles above your head; swells (0.5 s, hot drop beneath) → drops `wax_drip` (destroyable projectile, splashes on ground) → recoils, 1.7 s cooldown |
| wick_crawler | 15 | 2-4 | 3/2/2/1 | surface crawler (floor/wall/ceiling, `surface:'ceiling'` prop); contact damage only. Leash: turns back before any doorway (open boundary run + 3.5 tiles inward), before spikes/lava, and beyond `range` tiles of its spawn if given |

Event scripts (also in the enemy file, drawn from cached canvases built on first draw):
`gw_tent` (gw_09), `gw_mural` (gw_12), `gw_waxwall` (gw_10; props `faceW`, `faceH` in tiles; marker in the air tile
at the foot of the face, west of it), `gw_abyss` (props `c0 c1 r0 r1`, `alpha`; z −15 gradient to black over a chasm).
QA scripts: `test-output/qa-region-guttered/{transitions,secrets,hazards,skills,fights,gapsweep,vaultsweep}.js`.
