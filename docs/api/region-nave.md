# The Drowned Nave — rooms (module: region-nave)

Generator: `tools/gen/nave.js` → `src/data/regions/nave.js`. Never hand-edit the emitted file. Re-run
`node tools/gen/nave.js [--print] [dn_02 …]`. Enemies and region set pieces (event scripts `dn_*`) live in
`src/entities/enemies/nave.js`; the enemy guide is `docs/api/enemies-nave.md`. The arena dn_07 (The Great Belfry)
lives in `src/data/arenas/tallowmere.js`.

| room | size | role | key layout |
|---|---|---|---|
| dn_01 The Long Descent | 32×36 shaft | entry from gw_10 | the drop from N1 (cols 12-15) to the floor (top row 33); the west face (col 11) is sheer from the floor corridor to the throat, so going back up needs grip; the east side steps out into a rain bay (all overhangs, no ledges); `lore_dn_1` col 7 |
| dn_02 The Flooded Aisle | 128×18 corridor | aisle, Wren | floor row 15; S1 hole (cols 40-43) into the nave with dips (row 16) on each side; Wren stage 2 under the dry arch (col 84); `lore_dn_2` col 60; `dn_geo1` on the rubble heap (col 104); a broken triforium over the west half |
| dn_03 The Drowned Nave | 96×36 hub | landmark, Lanternway | floor row 33 with pews; rose window over `dn_sconce_a` (col 28); post `nave` col 52; `lore_dn_3` col 47; the platform column under N1 (tops 29…5 on a pier; the throat flares at rows 2-3 so you can walk off the top platform); S1 (cols 60-63) to the crypt; the choir step (top row 24, 3-tile steps) to E1 |
| dn_04 The Bell Tower | 32×54 shaft | grip challenge | base floor row 33 (E1) with the fallen bell; the 6-wide throat (cols 13-18), 18 tiles of pure wall-jumping with glazed stretches and a spike strip that make you switch faces; west landing (row 15, W1, bell sentry col 7); east ledge with B wall (cols 24-25) → `dn_geo3`; lower shaft rungs 38/42/46/50 down to S1 |
| dn_05 Shrine of the Oilcloak | 32×18 shrine | ability | pedestal col 18; practice basin (cols 3-9) west of it; `lore_dn_4` col 26; no enemies |
| dn_06 The Choir Loft | 64×27 | rest, boss approach | floor row 24; S1 (cols 20-23) to the Baptistery; dais (top row 22) with bell sentry → stall tier (row 18) → organ gallery (row 15) with `lore_dn_5`; `dn_sconce_b` col 42 by the belfry door (E1 → dn_07) |
| dn_08 The Sunken Crypt | 96×18 | plunge gate (one-way) | floor row 15; rungs 12/8/4 under N1 (on a pier); frosted D floor (cols 10-17) over S1 → the Rime; B wall (cols 6-7) → niche with `dn_sig_bright_bolt`; E1 high doorway on a ledge (row 6) reached by 3-tile steps |
| dn_09 Gallery of Saints | 96×18 | dash + grip gate | west floor row 15; grip pier (cols 41-48, 8 tiles sheer, gateway arch under it is the way back west); 9-tile dash gap (cols 49-57) to the far mass (glazed west face); WINGS: the tallest saint (cols 18-23, glazed) holds `dn_hw1` |
| dn_10 The Flooded Tunnel | 96×18 | oilcloak gate | water cols 8-58 (51 wide) under a low vault (3 tiles of air); dry east hall with `dn_geo2`; rungs 12/8/4 under N1 (Bell Tower foot); W1 to the Mothwood |
| dn_11 The Baptistery | 64×18 | lore | floor row 15; the frozen font (col 34); `lore_dn_6` col 44; rungs 12/8/4 under N1 |
| dn_12 The Reliquary | 64×27 | Ice Stair arrival, plunge reward | hall floor row 15; shelves (cols 5-10 row 9, cols 14-19 row 11); the ice pillar (cols 50-57) with the stair shaft (cols 52-55) up from S1 to the ledge (top row 5, cols 40-57); glazed lip, underside and pillar face; D floor (cols 8-13) → vault with `spark_dn` |

## Gates (all verified by `tools/reach.js` against the maximal pre-ability sets)
- **Grip:** dn_01 (N1 is 30+ tiles above the floor, sheer face), dn_04 climb (E1/S1 → W1), dn_09 pier (W1 → E1, with
  the 9-tile dash gap or wings), dn_12 stair shaft (S1 → W1).
- **Dash:** dn_09 gap, 9 tiles at equal height (top row 7). A player who falls lands on the west floor, and the
  gateway arch under the pier leads back west.
- **Wings:** dn_09 saint top (`dn_hw1`). It is glazed and nothing grippable is near it.
- **Oilcloak:** dn_10, 51 tiles of water under 3 tiles of air.
- **Plunge (one-way):** dn_08 D floor → ri_01; dn_12 D floor → the sealed vault (climb out with the one-way shelf at row 19).
- **Ice Stair:** dn_12 W1 → S1 is impossible with every ability (`node test-output/region-nave/oneway.js`). The ledge is
  10 tiles up, its lip, underside and the pillar face are glazed, and every shelf is 20+ columns away.

## Notes
- Enemy placements follow `docs/api/enemies-nave.md`. Every hostile in dn_03 is ≥ 12 tiles from the post and every
  hostile in dn_06 is ≥ 12 tiles from `dn_sconce_b`. No enemy reaches within ~6 tiles of a floor doorway, and none
  hurts a player who has just stepped out of a doorway (`test-output/region-nave/entry.js`).
- Rungs and platforms always stand on piers or posts or hang from chains (`dn_posts` event). Throats above a top rung
  are flared so the player (54 px tall) can walk off the rung.
- The secret pockets (dn_04 niche, dn_08 niche, dn_12 vault) are auto-veiled. No light entities or lit decor are
  placed inside them, because lights shine through the veil.
- Set pieces (`src/entities/enemies/nave.js`): `dn_sheet` (water down walls), `dn_curtain` (rain through vault gaps),
  `dn_bellfar`, `dn_rose` (rose window and god-rays), `dn_organ`, `dn_saint`, `dn_flow`, `dn_font`, `dn_frost`,
  `dn_masonry` (ashlar paint over solid masses; `wash` = water-light), `dn_pier`, `dn_posts`.
