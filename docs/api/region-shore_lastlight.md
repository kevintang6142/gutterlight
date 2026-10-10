# Region notes — Ashen Shore + Lastlight (module: region-shore_lastlight)

Generators (never hand-edit the emitted files):
```sh
node tools/gen/shore.js [--print]       # -> src/data/regions/shore.js      (sh_01..sh_04)
node tools/gen/lastlight.js [--print]   # -> src/data/regions/lastlight.js  (ll_01..ll_03)
```
Verification: `validate --room <id>` 0/0 for all 7 rooms (ll_03: 1 expected warning while sf_01 is unbuilt),
`reach --room <id>` all paths/spots/gates OK, `smoke --rooms-only --room <id>` OK. Scratch tools in
`test-output/region-shore_lastlight/`: `shots.js` (39 screenshots), `route.js` (input-bot traversal of the main route
both ways + Well down/up), `tiles.js` (ad-hoc `tile:x,y` reachability), `perf.js` (frame cost per room).

## Rooms

| room | teaches / purpose | contents | enemies |
|---|---|---|---|
| sh_01 Ashfall Strand | wake on the mound (start, col 10) → carving 1 (col 18: move/jump) → 2-tall step, 4-tall rock (full jump) → broken pier (one-way, row 10) ends at a sea cliff 6 tiles high: the only way on is **{down}+{jump} through the planks** (the move the Well needs). Cracked `B` cliff (cols 4-5) with crumbs at its foot hides `sh_geo1` (the pocket is veiled as rock by the engine's auto-veil until the wall breaks; the crack network and the geode's faint glow are the hint). A 1-tile ash lip at col 46 (row 13) keeps the cave crawler (cols 47-51) inside. | start, lore_sh_1, sh_geo1 | 1 crawler (col 49, in the cave under the cliff) |
| sh_02 Cinder Dunes | first sconce on a dune crest (col 20, warm light) → carving 2 (col 28: attack) → two crawlers to practise on. **Grip gate**: petrified-ash overhang, plain-`#` west face col 52 rows 4-11 (8 sheer), `sh_hw1` on its top (row 3), visible from the sconce. The road dips under it (floor row 16, cols 52-58). | sh_sconce_a, lore_sh_2, sh_hw1 | 2 crawlers (37, 47), 1 fly (45,7) |
| sh_03 The Fallen Wick | landmark. Walk in under the propped-up glazed base (wax stalagmites), climb the ash mound through a melted vent onto the candle's flank, walk down its 1-tile steps to the black wick stub (col 45, hop over), carving 3 (col 48: pogo) before the 5-wide thorn pit (cols 51-55, 2 deep). Short thorn strip (cols 32-33) in the middle of an 8-wide flank step (3 safe tiles each side). **Wings gate**: crown top row 8, 7 above the highest reachable surface (row 15), all `X`; `sh_sig_heartwax` in the wick-cup. Four invisible `respawn` triggers (cols 48, 58 by the pit; 29, 36 by the flank thorns) set fair hazard respawns. `theme.landmark:false` (no horizon fallen candle). | lore_sh_3, sh_sig_heartwax | 1 crawler (39,19 on the flank), 2 flies (over the pit / flank) |
| sh_04 Lastlight Road | lamp posts lit progressively toward the village, warm light at the east edge. Rocky outcrop: 3-tile steps up from the west (cols 16-18 top 11, cols 19-21 top 8) and a 2-wide boulder on the east (cols 22-23, top 11) so the road climbs over it both ways. **Dash gate**: 10-tile gap (cols 22-31) at row 8 to the glazed ledge (cols 32-36) cantilevered off a glazed stack → `sh_geo2`. Measured margin: the boulder lip leaks only at gap ≤ 6 (current 8). A 2-wide ash drift (cols 56-57, row 13) keeps the east crawler off the E1 doorway. | sh_geo2 | 2 crawlers (29, 52), 1 fly (46,8) |
| ll_01 Lastlight Gate | gate arch between two candle-stub houses, Quill at her stall (col 22: lamp post, crate table, ink candles, bookshelf), founding stone (col 34) between candelabra, gatehouse (stairs from col 44, deck row 11) with a house on it; its cracked east face (`B` col 58) hides a 2-tall cellar with `ll_geo1` (auto-veiled until broken). | npc quill, lore_ll_1, ll_geo1 | none |
| ll_02 The Last Brazier | the square. **The Well** (S1 cols 14-17): 2-deep stone basin (ring floor row 25, cols 10-21) with a one-way plank hatch over the shaft — drop through ({down}+{jump}); rising out of gw_01 you pass up through it and land on it, then hop 2 to the square. Brazier dais (cols 43-51) with the big brazier + r9 warm light, Thrum (41), home sconce (55), Pell under his awning (64), Lanternway post (78). Stilt-house decks (rows 19/15/11 west, 19/16/19 east), all reachable (verified with `tile:` targets); the art draws their stilts (sky-room platform posts; the earlier unlit `lamp_post` stilts were removed). | sconce ll_sconce_a, lanternway lastlight, npc thrum, npc pell | none |
| ll_03 Wickwright's Row | Bramm at the anvil (col 21 anvil, Bramm col 19) under a plank lean-to (one-way roof row 10, cols 13-21, on stilts) with chains, forge grate glow (red light, col 23), mold stack (col 14); smith-guild plaque (col 30). **Grip reward**: forge chimney stack cols 36-38, rows 4-9, carried over the continuous street (air rows 10-13) on a stone arch (decor); its west face is 6 sheer tiles above the archway; `ll_geo2` on the cap. The lean-to roof ends ≥ 3 cols short of col 24 (from there jump + dash would reach the geode without grip). East: the road ducks under the first chimney-tops (air rows 10-13) toward sf_01's gate. | npc bramm, lore_ll_2, ll_geo2 | none |

Themes: all rooms `bg:'sky'` (lastlight rooms and sh_03 with `decor:false`, hand-placed props only; ll_01-ll_03 and sh_03 with `landmark:false`: no parallax Last Brazier / horizon candle duplicating the real props); bgSeed 1-4 (shore),
11-13 (lastlight). Shops come from the NPC text entries (`G.Text.npcs.<npc>.shop`), no entity props needed.

## Design decisions / deviations from the plan text
- sh_03: the thorn pit sits at cols 51-55 (plan: "around 34-38") because the candle body occupies cols 13-44 on the
  floor line; lore_sh_3 (col 48) is still directly before it.
- ll_01: the cellar's `B` face is the gatehouse's **east** face (col 58), cellar cols 51-57 under the deck; the plan's
  "B face at col 50 / cellar 51-58" would be internal to the block.
- ll_02: a one-way hatch covers the Well shaft (plan: open hole) so rising players land on it per the plan's intent;
  `{down}+{jump}` is taught by the pier in sh_01.
- sh_02: the grip pillar stands over a dip so the road can pass under it; ll_03: the chimney stack is carried over
  the street on an arch (6 sheer tiles = the TECH_SPEC grip minimum; reach: grip needed even with dash).
- Lore titles (integration wave 1): `lore_ll_1` = "The Founding Stone of Lastlight" (ll_01), `lore_ll_2` = "Plaque
  of the Wickwrights' Guild" (ll_03), matching their plan placement.
