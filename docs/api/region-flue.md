# The Sootflue — rooms (module: region-flue)

Generator: `tools/gen/flue.js` → `src/data/regions/flue.js` (never hand-edit the emitted file; re-run
`node tools/gen/flue.js [--print] [sf_02 …]`). Enemies + region set pieces: `src/entities/enemies/flue.js`
(enemy guide: `docs/api/enemies-flue.md`). The arena sf_05 (Matron's Den) lives in `src/data/arenas/matron.js`.

| room | size | role | key layout |
|---|---|---|---|
| sf_01 The Chimney Tops | 128×18 sky | landmark, Lastlight shortcut | gatehouse tower (cols 1-8, to the sky edge) with `sf_gate1` (col 6, rows 10-13) and `sf_lv1` (col 10, east side only); roofs at row 14 with 1-3 tile stubs; the glazed wings stack (cols 58-64, flat top row 7, `sf_geo1`) over an open hearth the roof walk passes through; the Great Flue's crown around S1 (rims cols 105-106 / 117-118, dips at row 15); `lore_sf_1` col 92 |
| sf_02 The Great Flue | 32×81 shaft | spine, landmark | a 16-wide chimney (cols 8-23); gantry at row 33 (`=` catwalk, gap cols 14-17 under N1) between the W1/E2 corridors; ABOVE: sheer brick (grip) tapering 2 tiles per step to the 4-wide throat under N1; loft landing at E1 (row 15) + iron balcony cols 19-23 (catches a drop from the crown); BELOW: rungs (W cols 8-13 / E cols 18-23, tops ≤ 4 apart) to the floor (row 78), E3 ledge row 51, E4 den door; `sf_sconce_b` col 8 in a rest nook; `lore_sf_2` col 6 on the gantry |
| sf_09 The Soot Lofts | 96×18 | grip-only loft | rafters at row 15 with 2-3 tile gaps (gap floor row 17), roof trusses, upper beams (`=`), soot-sacks, the kiln-glass cooling rack (`sf_kg`, col 50), stoker on the rafter cols 65-80 |
| sf_03 Bellows Hall | 96×18 | hall, first rest | `sf_sconce_a` col 18, `lore_sf_3` col 31; low brickwork cols 37-60 (rows 0-8); the bellows set piece (cols 41-55); SECRET: furnace plinth (cols 25-27, top 12) → cornice (cols 29-36, top 9) → B wall (cols 37-38, rows 6-8) → smithy (cols 39-46) with `sf_sig_swift_brand` |
| sf_04 The Ember Shaft | 32×54 shaft | grip / plunge rewards | top landing row 6 (W1) with an iron hatch-grate (cols 12-15) over half the climb and the B partition (cols 22-23) hiding `spark_sf`; 8-wide climb (cols 12-19, 18 sheer tiles); W2 landing row 24 → rungs 27/30/34/38 → W3 floor row 42; D floor cols 8-15 over the vault (`sf_hw1`), climb-out rungs 48/45 on both sides of the hole |
| sf_07 The Pipeworks | 96×27 | oilcloak reward | walkway row 15 (ceiling pipe runs, valve/pump housings to hop); iron grate over the stairwell (cols 6-11), steps 18/21 → lower level row 24; cistern (water cols 31-46, rows 22-23) under the giant pipe (underside row 19); valve room cols 48-58 with `sf_geo2`; hazard respawns on both sides |
| sf_06 Shrine of the Wax Grip | 48×27 | shrine, grip lesson | chapel (pedestal col 12 `requires boss:matron`, `lore_sf_4` col 6, apse arch, statue); the 8-tile sheer wall cols 22-25 (top 16); chute cols 26-46 with S1 (cols 36-39), dips to row 25 |
| sf_08 The Ashpit | 64×18 | way down to the Chandlery | ash floor row 15 with two low drifts; rungs 12/8/4 under N1; iron door frame at E1; SECRET: B wall cols 6-7 → niche cols 1-5 (`sf_geo3`) |

## Gates (all verified by `tools/reach.js` against the maximal pre-ability sets)
- **Grip:** sf_02 upper flue (gantry → loft/N1: 18+ sheer tiles), sf_04 climb (W2 → W1: 18 tiles), sf_06 wall (8 tiles,
  both faces). Nothing standable, no enemies within pogo range of these climbs.
- **Wings:** sf_01 stack top row 7 (7 above the roof), glazed faces, 7 wide so `sf_geo1` sits ≥ 3 tiles from either face;
  stubs within 10 cols are ≤ 2 high; flyers are leashed ≥ 12 tiles away (no pogo onto it).
- **Oilcloak:** sf_07 cistern 16 wide under a 3-tile ceiling.
- **Plunge:** sf_04 D floor (cols 8-15, rows 42-43).
- **Lever:** sf_gate1 (bars from the floor to the lintel under a tower that reaches the sky edge); the lever is 4 tiles
  beyond the bars (not reachable by the Brand or a bolt from the village side — `test-output/region-flue/play.js`).

## Set pieces (event scripts in `src/entities/enemies/flue.js`)
`sf_stack` (brick stack; part back/front, hearth arch, glaze sheens, smoke), `sf_crown` (the flue mouth's inner drum,
glow, smoke, embers), `sf_embers` (rising ember column), `sf_bellows` (two heaving bellows), `sf_sacks` (swaying
soot-sacks), `sf_rack` (kiln-glass cooling rack), `sf_pipe` (riveted pipe skin over solid tiles, condensate drips),
`sf_door` (heavy iron door frame with heat glow).
`sf_sky` (sf_01: the open dusk sky with clouds and an optional moon, drawn over the parallax background — the flue
art's sky recipe has no ceiling band since the wave-2 integration, see INTEGRATION_LOG #35).

## Geometry changed by the region QA (supersedes the room table above where they differ)
- **sf_01:** the crown dips to row 16 with 1-high rims; ash bats at (79,7) and (84,5), `perch:'air'`, `leash: 4`
  (they keep ≥ 11 tiles from the wings stack's face).
- **sf_02:** rungs W cols 8-14 / E cols 17-23, the E3 lip cols 17-23; the upper flue's west face is straight
  (cols 14-23 above the gantry; it steps in only on the east side).
- **sf_04:** catwalk at row 24 (cols 11-17); vault rungs at row 45 (cols 4-9 and 14-19).
- **sf_08:** middle rung at cols 20-24.
All cache their static parts on first draw and cull against the camera.

## Tests
```sh
node tools/gen/flue.js && node tools/validate.js --room sf_01,sf_02,sf_03,sf_04,sf_06,sf_07,sf_08,sf_09
node tools/reach.js --room sf_01,sf_02,sf_03,sf_04,sf_06,sf_07,sf_08,sf_09
node tools/smoke.js --rooms-only --room sf_01,sf_02,sf_03,sf_04,sf_06,sf_07,sf_08,sf_09
node test-output/region-flue/play.js [-v]   # one-way gate + lever, gantry drop, enemy soak per doorway (bounds with -v)
node test-output/region-flue/climb.js       # grip bot: sf_06 wall both ways, sf_02 gantry -> loft
node test-output/region-flue/views.js out.png 0.4 3 sf_01:12,13:400 sf_02:20,32 ...   # contact sheet
```
