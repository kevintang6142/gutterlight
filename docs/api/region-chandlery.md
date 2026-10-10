# The Chandlery: room notes (module region-chandlery)

The rooms are generated. Do not hand-edit `src/data/regions/chandlery.js`; edit `tools/gen/chandlery.js` instead and
re-run it:

```sh
node tools/gen/chandlery.js [--print] [ch_02 ...]
```

The arena ch_09 (Kiln Heart) belongs to the boss builder and lives in `src/data/arenas/kilnmother.js`. The region's
set pieces are code-drawn event scripts. They live in `src/entities/enemies/chandlery.js`, after the enemy kinds.

## Rooms

| room | role | key layout |
|---|---|---|
| ch_10 Slag Gate | entrance from sf_08 | Flat hall under a riveted gate header (`ch_gate`). The S1 hole drops to ch_03, with dips at row 16. The **secret** slag-brick store sits behind the B wall at cols 50-51 and holds Kiln Glass `ch_kg`. |
| ch_01 Gallery Gate | entrance from dn_09 | Nave stone in the west gives way to riveted iron plates (`ch_plates`, fading). The S1 hole leads to ch_07. `ch_geo1` sits on a slag heap. |
| ch_02 Great Foundry | **hub** | Three levels: the gantry (row 6), the walkway (row 24) and the floor (row 33). Chain-hung platforms and hatches link the levels, and no abilities are needed anywhere. The colossal hanging knight-mold (`ch_knightmold`) is in the centre. Iron trestles (`ch_truss`) carry the walkway, and a giant ladle (`ch_pour`) pours into the walkway vat. The sconce is at col 30 and the Lanternway post at col 62. The brute's beat is cols 42-48, so it stays at least 12 tiles from the post. |
| ch_03 Pouring Floor | room | A molten channel (cols 22-30) is crossed on two grates with normal jumps. The giant ladle pours into the channel. The N1 platform ladder leads up to ch_10. A crate stack and rack shelf carry `ch_geo2`. The brute guards E1. |
| ch_04 Crucible Climb | **plunge shrine** | Stepping blocks cross the molten lake. The Crucible Wall is a counterweight slab hung on chains, with its west face grippable and its east face glazed. A 9-tile dash gap leads to the glazed brim, which holds the shrine. The D patch in the brim drops onto the east ledge, and the tunnel under the wall leads back west. `ch_crucible` sits under the brim. Respawn boxes end at every lip. |
| ch_05 Cooling Cellar | room | Cooling racks (`ch_soldiers`) and steaming troughs (`ch_quench`). The **secret** B wall of molds at cols 22-23 hides a molten trough 10 wide and the Ember Urn ledge (optional dash or wings). |
| ch_06 Quench Gate | room | The W1 ledge is reached by steps. The frosted D floor (`ch_frost`) over S1 is a one-way plunge into the Rime. A stepped casting frame hangs on chains, with the floor passing under it. The 10-tile dash to the glazed Flare Trail ledge is optional. |
| ch_07 Mold Racks | room / landmark | Three tall racks of unlit wax soldiers (`ch_soldiers`) stand behind the rack platforms. The casting block has a cracked lid that you plunge through to reach Chandler's Spark in a veiled pit; a climb-out platform leads back up. |
| ch_08 Kiln Antechamber | sconce before the boss | The furnace door (`ch_furnace`, heartbeat glow) is on the E1 ledge, up steps. A glazed flue skirt keeps the N1 ladder away from the chain-hung cage perch (`ch_cage`), which needs wings and holds `ch_geo3`. |

## Design decisions and deviations from the plan

- **ch_07 casting block:** it spans cols 49-57 rather than the planned 50-62, so E1 (rows 21-23) stays open. An east step (cols 58-59, top 21) leads onto it. The D lid is at cols 51-55, and the climb-out platform is at cols 54-55 (top 21).
- **ch_08 sconce:** it is at col 27, not col 30. The brute's beat (cols 39-45) is at least 12 tiles away, so the rest spot stays calm. The ch_08 wisp guards the cage at (8,11) with `leash: 5`, so it does not engage at W1.
- **ch_06 sigil ledge:** it reaches the east wall (cols 50-62). Its X underside means the wall cannot be climbed to it. A gate matrix (`test-output/region-chandlery/matrix.js`) checks that the sigil stays out of reach with grip, oilcloak and plunge.
- **ch_02 molten river:** the plan wants it only in the parallax. That is region background art, so no lava tiles are used in the hub.

## Verification scripts (`test-output/region-chandlery/`)

- `matrix.js`: ability-subset gate matrix.
- `s1up.js`: shows that ch_06 S1 stays one-way even after the D floor is broken.
- `dashwin.js`: measures dash take-off windows in the real game.
- `soak.js`: doorway safety, wandering play, enemies on hazards, and the Lanternway post's safety.
- `pano.js` (full-room panoramas, with `CROP=c0,r0,c1,r1`) and `contact.js` (sheets of in-game shots).
- `islands.js` (floating solids) and `decorcheck.js` (decor anchoring).
