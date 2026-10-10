# Meltbloom Gardens: region rooms (module: region-meltbloom)

Generator: `tools/gen/meltbloom.js` (roomkit) writes `src/data/regions/meltbloom.js`. Do not edit the emitted file.
Re-run with `node tools/gen/meltbloom.js [--print mb_02 ...]`.
The arena mb_07 (The Moonlit Lawn) belongs to the boss designer (`src/data/arenas/sable1.js`). Its seams with mb_06 E1 and mb_08 W1 validate cleanly.
Enemies and set-piece event scripts are in `src/entities/enemies/meltbloom.js` (`docs/api/enemies-meltbloom.md`).

## Rooms

| room | what | gates / secrets |
|---|---|---|
| mb_01 Garden Gate | First garden room behind the Effigy. Brick rubble and dead sconces at the east door give way to wax soil and a giant flower. `lore_mb_1`, 1 spitter, 2 moths. A wax-shelf ladder (12/8/4) leads up through a skylight to mb_03, and a hole drops to mb_10. | none |
| mb_02 Bloom Atrium (hub) | A glass roof (`mb_glassroof`) over THE MELTBLOOM (`mb_meltbloom`, stem cols 42-53, cup rim row 15). Its leaves are one-way platforms painted by `mb_leaves`, at tops 47 R, 43 L, 39 R, 35 L, 31 R, 27 L, 23 R and 19 (outer E), and they join all four levels without abilities. The canopy level is made of walkways, one-way petal bridges, two glazed lip-tips and a one-way bowl at row 17. Lanternway at col 24, `mb_sconce_a` at col 58, `lore_mb_2` on the planter at col 39. 3 moths, 2 hoppers (terraces), 1 spitter (east terrace). | S1 is the one-way drop to mb_08: 1-tile lips, then a wax shelf at row 52 inside the hole (Down+Jump to drop) |
| mb_03 Pollen Terraces | Planter beds under the glass roof with dense pollen. 1 spitter, 2 moths. | WINGS: glazed seed pod at cols 24-30, top row 8, painted by `mb_pod`, with `mb_geo1` on it. The nearest bed above 1 tile is 6 columns away. |
| mb_04 Overgrown Cloister | A roofed east gallery steps 3 down into a courtyard with two ruined arcades (the lurkers hang under them) and a collapsed bay that lights the slab. `lore_mb_3`, 1 hopper. | PLUNGE: D slab at cols 20-25, rows 18-19, over a crypt with `spark_mb` on a bier. The way out is a shelf at row 21 (cols 17-21) under and beside the hole. SECRET: B wall at cols 6-7 hides `mb_geo3`. |
| mb_05 Petal Bridge | Petal decks (`mb_petals`) and a shaft (shelves 18/21/25) down to mb_06. 2 moths over the ravine. | DASH: 9-tile gap (cols 26-34) over a 9-deep glazed ravine (`mb_ravine`) with thorns at row 24. Respawn boxes end at both lips. |
| mb_06 Shrine of the Flare | Quiet chapel with a dais. Dash shrine (`requires boss:sable1`) at col 30, `lore_mb_4` on a plinth at col 49. No enemies. | none |
| mb_08 Thornwalk | The mound under N1, `mb_sconce_b` at col 6, thorn troughs at 30-34 and 52-56, thorn fringes under the ceiling, 2 spitters on low hedges, 2 hoppers, a lurker under a hanging hedge at col 44, and shelves (12/8/4) up to mb_10. | N1 is one-way: glazed shaft, nothing climbable, glazed wall above W1. SECRET: B face at cols 84-85, rows 12-14, hides the Thorned Wax sigil. |
| mb_09 Root Hollows | A long root tunnel with shelves (12/8/4) up to mb_06. The S1 shaft shows bars and violet light (`mb_grate`, opens `lever:mw_lv1`; the real grate is `mw_gate1` in mw_03). 2 lurkers, 1 hopper, 1 moth. | OILCLOAK: 22-wide meltwater at cols 76-97 under a root ceiling (3 tiles of air), then a dry grotto with `mb_geo2` |
| mb_10 Weeping Arbor | Two weeping wax trees whose canopies hang from the ceiling, with back-wall trunks and strands. 2 lurkers, 1 moth. Shelves (12/8/4) lead up to mb_01. | GRIP: sheer trunk at col 56 (9 tiles, rows 6-14) fused with the east wall. The crown hollow holds `mb_hw1`. |

## Design decisions
- **The Atrium's S1 has a shelf inside the hole.** The plan lists S1->E1/E2/W1/W2 as free, but it also asks for 1-tile lips around the hole. A player rising out of the hole could never clear the lips. The fix is a one-way wax shelf at row 52 inside the hole. Going up, the player passes through it and lands on it. From the hub, the player hops the lip onto the shelf and drops with Down+Jump. The drop stays one-way from the mb_08 side: its glazed shaft is impossible with every ability (checked with `test-output/region-meltbloom/oneway.js`).
- **The Atrium's cup** is two glazed lip-tips (cols 30-31 and 64-65, rows 15-18) with a one-way bowl at row 17 between them. You cannot fall out of the bowl, and you hop 2 tiles up to leave it. The flower, cup and petals are drawn behind by `mb_meltbloom`.
- **mb_04's way-out shelf** spans cols 17-21 at row 21, and row 19 above cols 16-19 is carved. The plan's 3-tile shelf at cols 17-19 under a 2-thick floor gave no headroom, so the crypt was a softlock.
- **mb_09's grotto** ends at col 121. The plan's zone is cols 98-124.
- **Lanternway calm:** `G.game.isSafeRoom()` is true at the post for 10 s. The west-terrace hopper's beat stays more than 12 tiles from the post.
- **Visual set pieces I added to `src/entities/enemies/meltbloom.js`** (event scripts, cached sprites, no per-frame allocation):
  - `mb_pod {c0,c1,r0,r1,top}`: a ribbed seed husk on vine stalks, drawn over the glazed pod tiles.
  - `mb_petals {spans:[[c0,c1]...], row, droop:[cols]}`: fallen petals lying on deck tiles, with tips curling over drops.
  - `mb_leaves {leaves:[[c0,c1,row,base]...]}`: broad leaves over one-way leaf platforms (base -1 means the stem is to the west, 1 to the east).

## Verification (scratch scripts in `test-output/region-meltbloom/`)
- `node tools/validate.js --room mb_01,...,mb_10`: 0 errors. `node tools/reach.js --room <all mb>`: everything OK, with gates checked against the maximal pre-ability sets.
- `gapsweep.js`: mb_05 jump-then-dash take-off window is about 2.2 tiles in both directions (same as gw_06).
- `route.js`: every exit was driven with real inputs (doors, drops, upward exits with steering, the Atrium drop, gw_05 and mb_07 seams).
- `enemies_rooms.js`: 20 s walk-throughs per room. No enemy on a hazard or in a doorway, none left the room.
- `pano.js <ids> [scale]`: stitched full-room panoramas. Parallax seams at the 1280-px window borders come from stitching and are not in the game. `sheet.js` makes contact sheets.
