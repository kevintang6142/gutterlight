# The Rime + the Heartwick Sanctum: rooms (module: region-rime_sanctum)

Generators: `tools/gen/rime.js` → `src/data/regions/rime.js` (ri_01–ri_06, ri_08) and `tools/gen/sanctum.js` →
`src/data/regions/sanctum.js` (hs_01, hs_02). Never hand-edit the emitted files; re-run the generator
(`--print [id]` dumps ASCII with row numbers). The arenas ri_07 (Sable 2) and hs_03 (Lucerne) belong to the boss builders.
Enemies and the `ri_icehole` set piece: `src/entities/enemies/rime.js` (`docs/api/enemies-rime_sanctum.md`).
Scratch tests: `test-output/region-rime_sanctum/` (`route.js` + `route2.js` real-input traversals (Frozen Fall, well,
lever + grate, plunge arrival → Causeway, seal door → hs_01 → hs_02), `trace.js` ad-hoc input traces, `enemies_inroom.js` per-enemy
behaviour in the real rooms, `grate_trap.js`, `pano.js` room panoramas, `sheet.js` contact sheets).

## Rooms

| room | what it is | key geometry |
|---|---|---|
| ri_01 The Frozen Stair | plunge arrival from dn_08 | GLAZED shaft (cols 10-17, X walls cols 9/18 rows 0-10); shelf top 15 cols 8-50; stair: ledge 18 (cols 1-5) → ribbon of ice steps east under the shelf (21, 24, 27) → slab 29 (cols 28-33) → floor 33 (W1); chute cols 52-55 (grippable walls 51/56) to ri_08 |
| ri_02 The Rime Causeway | causeway over a frozen chasm | deck top 15; gaps 32-34 / 57-60 / 76-80; shard bed on row 21 (floor top 22); X piers and chasm walls; 6 respawn points; FROZEN FALL = one-way ice skin (`=`) over a glazed chute (cols 122-125) to S1 |
| ri_03 The Long Cold | corridor with the frozen procession | N1 glazed shaft + snow drift (cols 36-47); wings shelf X block cols 1-14 top 8 (west wall X too) with ri_hw1 |
| ri_04 The Frozen Lake | landmark, Wren 4, Lanternway, sconce b | lake top 24 (X), N1 falls inside a hollow glazed column (cols 25-30, open at row 17); N2 hanging stack 20/16/12/8/4; wings wall X cols 15-22 top 17; far shore ledge A (cols 1-6, top 27) + pillar B (cols 9-14, top 21), all X |
| ri_05 The Icebound Stair | crossroads, ri_sconce_a | hanging ice stair 11/7/4 to N1 (warm light); S1 = frozen well cols 37-46: dips top 25 beside the hole, rungs 21/17 both sides; spitter terrace cols 51-58 top 12 |
| ri_06 The Glacier Gallery | corridor, secret Deep Kindle | N1 glazed shaft; drowned forges as dim background props; B snow wall cols 112-113 rows 12-14 → veiled cave cols 114-126 |
| ri_08 The Sanctum Gate | seal door, lever shortcut, Sable 2 | sealdoor marker (8,23); antechamber + S1 shaft cols 2-5 with east-wall niches at col 6 (rows 31-33 over floor 34, 27-29 over 30, rows 24-25 over 26); ri_gate1 (20,2) w4 h1 in a frame cols 18-19/24-25 rows 0-2; platforms 20/16/12/8 and 4 (split: cols 20-23 + 26-28); lever (27,3) |
| hs_01 The Descent of Light | golden shaft | funnel that only widens downward (no ledges); straight west face col 1 for the grip climb |
| hs_02 The Vestibule of Glass | last sconce (col 20) | crystal pier cols 49-59 hanging from the vault; sunken walk under it (floor 17, rows 14-16); shelf cols 40-48 top 12 → B wall cols 49-50 rows 9-11 → veiled alcove with hs_geo2 |

## Design decisions / deviations from the plan notes

- **ri_02 chasm floor at top row 22 (plan: 25)**: from the deck the camera shows rows ~4-22, so a bed at row 24 was
  out of view and the chasm read as a void. Raised so the shards are visible.
- **ri_02 Frozen Fall is a one-way ice skin, not an open 4-wide gap**: the hole starts one tile inside E1, so anyone
  walking in from ri_05 would have dropped to the lake by accident. Down+Jump breaks through (E1/W1→S1 still `[]`).
- **ri_04 N1 shaft continues as a hollow glazed column to row 17**: from an open ceiling a falling player could
  dash-steer from col 26 onto the wings wall top (reach GATE LEAK); now they leave the column below the wall top.
- **ri_05 S1**: the floor is 11 rows above the room's bottom, so "dips at row 16" would never catch the exit boost
  from ri_04. The hole is a well: dips at top row 25 (1 above the bottom edge) plus rungs 21/17.
- **ri_08 S1 east-wall niches** (QA; replaced the builder's three 1-wide crystal knobs): the plan path S1→E1 requires
  only `seals>=3` (no grip), so the shaft's east wall (col 6) has three niches — rows 31-33 over floor 34, rows 27-29
  over 30, rows 24-25 over 26 (baseline QA moved them one row down: the exit boost of a player rising from hs_01 cleared
  the old first floor 33 by only 3 px; now 44 px); dropping in is a clean fall. The old reach warning "spot sealdoor from S1 without seals" is
  gone: the plan lists the door in both zones (`['sealdoor', ['gate', 'door']]`), so from S1 its back needs nothing.
- **Lore**: `lore_ri_3` (the Wardens' oath, "Carved Above the Seal Door") is at the Seal Door in ri_08 (12,23, just east of the door);
  `lore_ri_4` (Sable's black-wax note) is on the Frozen Lake in ri_04 (66,23) — swapped by integration to match the
  text titles.
- **ri_08 top platform split**: a player standing on row 4 is 1.35 tiles tall and the grate frame reaches row 2, so
  row-4 tiles under the frame are unusable; the top platform is cols 20-23 (under the grate) and 26-28 (lever), reached
  by jumping up through them from platform 8 (cols 19-29).
- **hs_02**: the alcove (floor top 12) would otherwise cut the walkway; the way east dips under the pier instead.
- Enemies follow docs/api/enemies-rime_sanctum.md (≥ 8 tiles from doors/landings, ≥ 12 from sconces/posts,
  ≥ 10 from NPCs; respawn points outside husk sight). No enemies in ri_08, hs_01, hs_02.
- **ri_06 secret hint**: the B snow wall shows the art module's crack network, rubble and bones lie at its foot, and a
  faint flickering ember light (col 111) leaks warmth through it from the Deep Kindle cave.
- **Wall slide (engine behaviour)**: with grip, a player who drops into ri_08's S1 shaft hugging the west wall slides
  the whole way down (~4 tiles/s, ~8 s through hs_01) until they press away or jump; dropping through the middle is a
  normal 1.5 s fall.
