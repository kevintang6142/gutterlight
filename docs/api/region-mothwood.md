# The Mothwood: rooms (module: region-mothwood)

The generator `tools/gen/mothwood.js` uses roomkit to write `src/data/regions/mothwood.js`. It builds the 9 rooms that are
not arenas. Don't edit the output file by hand. Run `node tools/gen/mothwood.js [--print mw_02]` again after every change.
The arena `mw_04` is built by the boss designer (`tools/gen/arena_vespertine.js` → `src/data/arenas/vespertine.js`).
The enemies are in `src/entities/enemies/mothwood.js`; see `docs/api/enemies-mothwood.md`.

```sh
node tools/gen/mothwood.js && node tools/validate.js --room mw_01,mw_02,mw_03,mw_05,mw_06,mw_07,mw_08,mw_09,mw_10
node tools/reach.js --room mw_01,mw_02,mw_03,mw_05,mw_06,mw_07,mw_08,mw_09,mw_10
node tools/smoke.js --rooms-only --room mw_01,mw_02,mw_03,mw_05,mw_06,mw_07,mw_08,mw_09,mw_10
node test-output/region-mothwood/mosaic.js out.png 0.3 mw_02 mw_07   # whole-room overviews (camera zones stitched)
node test-output/region-mothwood/probe.js mw_02:60,32:600            # idle at a spot (god mode): enemy ranges, isSafeRoom
node test-output/region-mothwood/decor_check.js                      # decor anchoring (ceiling/floor props)
node test-output/region-mothwood/plat_check.js                       # one-way platforms with no visible support
node test-output/region-mothwood/enemy_dist.js                       # enemies: distance to doors / sconce / post / shrine / npc
node test-output/region-mothwood/engage.js mw_03:28,24               # real room: idle damage (no god), then auto-fight kills
node test-output/region-mothwood/walk.js mw_08:2,14:right            # hold a direction (god), hop when blocked: room reached
```

## Rooms

| room | identity / layout | contents |
|---|---|---|
| mw_01 Reed Shallows | Floodwater bank out of the Flooded Tunnel (dry walkway). Ragged wick-head canopy. S1 hole with dips. | lore_mw_1 (col 30), mw_geo3 between two root knuckles (col 8), dust_maw (col 22), 2 dusk_moths |
| mw_02 Wickreed Grove (hub) | Tall clearing between two low underwood canopies. The **reed-cap ladder** (wings): a GLAZED silk-wrapped reed (cols 45-46) hangs from the canopy down to row 28. Caps (one-way, cols 47-52, tops 27/21/15/9) grow from it, and the last cap (row 4, cols 47-54) sits under N1. Nothing grippable is within reach. | mw_sconce_a (col 44, under a ring of glowing cocoons), lanternway post (col 60), lore_mw_2 on a stump (col 70). West underwood: 2 cocoons (`leash 5`) and a moth. East underwood: a maw (col 81) and a moth. All of them are ≥ 19 tiles from the post. |
| mw_03 Mothward Gate | Gate shaft walls (west face col 12, east buttress cols 29-31) carry silk ledges (tops 20/16/12/8). The top ledge (row 5, cols 17-28 — at row 4 the player could not fit under the frame or the closed grate) sits under the grate mw_gate1 (row 2, cols 20-23, frame cols 18-19 / 24-25). Gold garden light falls through the bars. | lever mw_lv1 (27,4) on the top ledge, mw_geo1 in a cocoon husk (col 52), moth_knight (col 23, `range 4`), dusk_moth (east hall) |
| mw_05 Cocoon Deep | Upper floor (15) under the N1 ledges. Steps (18, 21) lead down to the lower floor (24) and E2. The E1 silk shelf (top 15, cols 54-62) is reached by ledges at 21/18 (the 18 ledge hangs from a root knot). The giant fused cocoon is the **D floor** (cols 8-13), over the sealed chamber that holds spark_mw. The way out of the chamber is two silk rungs (tops 20 and 18, cols 9-12) under the cocoon hole — no Smokewing needed (QA). | 2 cocoon_spawners (one on the west wall, one under the E1 shelf), moth_knight on the lower floor |
| mw_06 Silk Galleries | Silk floor (24); a solid silk wall on the west. A curtain arch leads to the Bower. Optional silk galleries (one-way, all supported) run from the west wall along the vault. | mw_sconce_b (col 40), lore_mw_3 (col 30), the Duchess's banners. **moth_knight `id mw_u1`, persistent** (cinders 28-40) holds the arch (col 55, `range 2`: patrol 53-57, ≥ 12 tiles from the sconce). 2 dusk_moths in the west galleries. |
| mw_07 Cocoon Hollow | The inside of a hollow reed. The N1 climb alternates between silk ledges on a hanging pith column (cols 33-35) and on the east wall (face col 48). The west wall is GLAZED. **Wings perch:** a tall GLAZED cocoon (cols 6-11, top 12, down to row 17) hanging from the ceiling by a glazed stalk (cols 6-7, rows 4-11), 7 rows above the highest west ledge (19); the row-25 ledge (cols 3-10) touches the west wall. | mw_geo2 on the perch (col 9), moth_knight (west floor), dust_maw (under the climb), cocoon on the pith column (`leash 4`) |
| mw_08 Dustfall Hollow | Grey moth-dust falls (ash weather). A root mound (steps 12, 9 on both sides) leads to the ledge (top 9, cols 28-32) by the **cracked face** (B, cols 34-35 rows 6-8) of the low ceiling. The alcove behind it (cols 36-44) holds the Last Light sigil (its own glow stays hidden by the veil until the wall breaks). | 2 dust_maws (col 39 under the mound, col 77), 2 dusk_moths. A faint gold light leaks out at the cracks (col 33). |
| mw_09 Silt Roots | W1 shelf + a one-way root bridge + the upper floor (15). Root shelves under the bridge (19/23/27/30) lead down to the lower floor (33) at W2. The **frozen D floor** (cols 38-45 rows 33-34) is over S1, a one-way drop into the Rime, with frost crystals. Wren's camp is east of the crack, and her den is behind a **cracked root wall** (B cols 55-56). | npc wren stage 3 (`requires: '!flag:wren_gift'`), so she has moved on once met in the Rime. mw_kg in the den, moth_knight on the upper floor, dusk_moth over the lower floor. |
| mw_10 Chrysalis Chapel | A high west balcony (6) with steps (9, 12, 15) and the N1 ledges. The split chrysalis shell hangs in ribs around its heart. | wings shrine (col 46, on a silk dais flanked by pale chrysalis crystals under three glowing husks, big pale light), lore_mw_4 (col 30), 2 dusk_moths (cols 22 / 77, ≥ 18 tiles from the shrine) |

## Design decisions and deviations

- **mw_02 ladder stem.** The ladder's reed hangs from the canopy and ends 4 rows above the floor. A stem rooted in the floor would
  block the free E1↔W1 floor path. A root hollow under a floor-rooted stem looked like a pillar hovering over a pit.
- **mw_07 perch.** The perch is a tall glazed cocoon (rows 12-17), not a thin slab. For geodes, reach counts a spot as reached
  when the player comes within 2 tiles. With a thin slab, a jump without wings from the row-19 ledge got the player's head
  within range of the geode (GATE LEAK). The perch's underside and flanks now keep that jump out of range.
- **mw_09 den.** The plan puts the den in the west wall at rows 30-32. That is the same place as the W2 doorway, so the den is
  at the east end instead, still right behind Wren's camp. Its B wall is at cols 55-56 and the den is cols 57-62.
- **mw_06 knight.** It is unique and persistent. It can't be both ≥ 12 tiles from the sconce and ≥ 8 tiles from the S1 landing
  anywhere else. Making it unique means it stays dead and doesn't wear players down on retries of the Duchess.
- **mw_08 root mound.** It has a step on its east side too (col 33). Without it, the 6-tall ledge face can't be climbed from
  the east, which would block E1→W1.
- **Decor anchoring.** Hand-placed decor snaps to its anchor (`anchorY` in the generator). Ceiling props go under rock (cocoons
  may also hang under a cap). Floor props go on the floor. The generator logs any prop that moved more than 2 rows.
- **Unsupported one-way ledges.** A few remain in enclosed caves: mw_07's west ledges (13-18), mw_09's root shelves under the
  bridge, and the N1 ledges where the plan prescribes stacked ladders (ropes stop at the ledge above). `plat_check.js` lists them.
- **mw_02 west cocoon (col 31, `leash 3`).** Its mothlings can come within 10 tiles of the sconce (col 44), but not within
  12 tiles of the Lanternway post (col 60). Sconces don't check for nearby enemies, and the cocoon only hatches when the
  Wickling is within 7 tiles of it, so a player resting at the sconce never wakes it (`probe.js mw_02:44,32`: 0 threat).
  Moving it west would put the mothlings back over the S1 landing dip.
