# World plan - guide for region and boss builders (module: world_plan)

`design/world_plan.json` is the binding room-level plan (TECH_SPEC section 18): every room's global rect, its exits,
the traversals it must allow, and where every piece of content goes. Build each room's tiles exactly to it;
`tools/validate.js` / `tools/reach.js` verify built rooms against it.

| File | What |
|---|---|
| `design/world_plan.json` | the plan (81 rooms). Generated - do not hand-edit |
| `design/world_plan.md` | readable version: region overviews, every room (exits, traversals, contents, layout notes), critical path, shortcuts, secrets, backtracking list |
| `design/world_map.png` | rendered map (regions, ids, doorways, gate badges, content icons, critical-path milestones 1-15) |
| `tools/plan_gen/regions/<region>.js` | the source DSL (one file per region); `tools/plan_gen/build.js` turns it into the JSON |
| `tools/plan_check.js` | validator (geometry, reciprocity, counts, progression simulation, no-trap, quality metrics); exit 1 on error |
| `tools/plan_render.js` | renders the map (`--crop x,y,w,h` for a close-up) |
| `tools/plan_gen/doc.js` | regenerates `design/world_plan.md` |

```sh
node tools/plan_check.js            # must print "OK: 0 errors"; --verbose lists every secret and ability order
node tools/plan_render.js           # design/world_map.png
node -e "const p=require('./design/world_plan.json');console.log(JSON.stringify(p.rooms.find(r=>r.id==='gw_05'),null,1))"
```
To change the plan (architect only): edit the DSL, then `node tools/plan_gen/build.js && node tools/plan_check.js && node tools/plan_render.js && node tools/plan_gen/doc.js`.
DSL content entries are `spec`, `[spec, zone]` or `[spec, zone, {secret}]`; `zone` may be a list (`['sealdoor', ['gate', 'door']]`)
for something usable from both sides of a zone boundary — its spot from each exit then needs the cheapest zone's requirements.

## Room fields

```json
{ "id": "gw_05", "region": "guttered", "name": "The Old Guard's Hall", "gx": 224, "gy": 45, "w": 64, "h": 18, "kind": "arena",
  "exits":  [ { "id": "W1", "side": "W", "pos": 12, "size": 3, "to": "mb_01", "toExit": "E1" }, ... ],
  "paths":  [ { "from": "E1", "to": "W1", "requires": ["boss:effigy"] }, ... ],
  "spots":  [ { "id": "arena:effigy", "from": "E1", "requires": [] }, ... ],
  "contents": [ "arena:effigy", "gate:gw_gate1?boss:effigy", "landmark:..." ],
  "notes": "layout for the builder" }
```
- `gx, gy, w, h` are in tiles: `G.World.defineRoom({ gx, gy, tiles })` with `tiles.length === h` and every row `w` chars.
- `name` -> use it as the room's `name` in `defineRoom`.
- `kind`: hub, hall, corridor, shaft, room, shrine, gate, arena, landmark, surface, village, secret (informational).
- Optional `secret` (room level): the room is a secret room (reached only through breakable walls).

## Exits

`side` W/E: `pos` = room-local row of the topmost open boundary tile, `size` = open rows. N/S: `pos` = column of the
leftmost open tile. Open = any non-`#`/`X` tile on the outermost row/column (`.`, `=`, liquids, markers).
Make **exactly** those boundary tiles open and every other boundary tile `#` or `X`; the neighbour room opens the same
global tiles (the plan guarantees alignment). Ids: side letter + index ordered by `pos` (`W1` is the upper of two west exits).

Conventions used in all notes (rows/cols are room-local, 0-based):
- "floor top row N" = row N is the first solid row under the walkable air; a W/E exit at rows N-3..N-1 sits on it.
- Every upward exit has a landing in the room above: either "the floor dips to top row R for 3 cols each side" of a
  hole in a floor (R = 1-2 rows above the room's bottom edge, so the exit boost of ~3 tiles lands you there), or a
  platform stack in the lower room ending "directly under" the exit (tops at most 4 rows apart, last one at row 3-4).
- "one-way platforms" = `=` tiles; "GLAZED (X)" = `X` tiles (not grippable) - used wherever a wall must not be climbable.
- Ledge/gap numbers follow the motor (TECH_SPEC 8.2, `node tools/motor_metrics.js`): jump <= 4 tiles up, gaps <= 6 without
  dash; dash gates are 9-10 tile gaps at equal height (max dash+jump is ~11.7; required traversals / the critical path use
  9, 10 only for optional rewards); grip gates are >= 6 sheer tiles (we use 8-10+);
  wings gates are ledges 6-7 up with no grippable wall within 6 tiles; oilcloak gates are meltwater >= 13 wide and/or under a
  3-tile ceiling; plunge gates are `D` floors. Dash-gap pits are deep (>= 7 tiles) so spikes cannot be pogo-chained across,
  and their far walls are `X` so grip cannot climb out on the far side.

## Paths (traversals) - what `tools/reach.js` checks

Each entry is one directional traversal from exit `from` to exit `to` and its minimal `requires` list. Alternatives are
separate entries (e.g. `E1->W1 [dash]` and `E1->W1 [wings]`). A direction that is **absent is meant to be impossible**
(one-way drops, up-only climbs, lever gates seen from the wrong side) - do not make it possible. A gate requirement
(e.g. `[dash]`) means: possible with dash, impossible without it. Tokens: `dash grip wings oilcloak plunge`,
`boss:<id>`, `lever:<id>`, `seals>=3`. `requires: []` = no abilities.

## Spots - content placement and reachability

`{ id, from, requires }`: the content `id` must be reachable from exit `from` with `requires` **and** the player must be
able to get back to that exit afterwards. Spot ids: `start`, `sealdoor`, `sconce:<id>`, `lanternway:<id>`, `lore:<id>`,
`npc:<npc>[:<stage>]`, `shrine:<ability>`, `pickup:<pickupId>`, `geode:<id>`, `lever:<id>`, `arena:<boss>`.
`secret` on a spot = it sits behind a breakable wall (`B`, describe it as in the text).

## Contents -> entities (TECH_SPEC 9.1)

| content string | entity |
|---|---|
| `start` | `{type:'start'}` (sh_01 only) |
| `sconce:gw_sconce_a` | `{type:'sconce', id:'gw_sconce_a'}` (+ a `light`) |
| `lanternway:guttered` | `{type:'lanternway', id:'guttered'}` |
| `lore:lore_gw_2` | `{type:'lore', id:'lore_gw_2'}` |
| `npc:thrum` / `npc:wren:2` | `{type:'npc', npc:'thrum'}` / `{type:'npc', npc:'wren', stage:2}` |
| `shrine:dash?boss:sable1` | `{type:'shrine', ability:'dash', requires:'boss:sable1'}` |
| `pickup:heartwax#gw_hw1` | `{type:'pickup', item:'heartwax', id:'gw_hw1'}` |
| `pickup:sigil:ember_thirst#gw_sig_ember_thirst` | `{type:'pickup', item:'sigil', sigil:'ember_thirst', id:'gw_sig_ember_thirst'}` |
| `pickup:spark#spark_gw`, `pickup:urn#ch_urn`, `pickup:kiln_glass#sf_kg`, `pickup:notch#gw_notch` | `item` spark / urn / kiln_glass / notch, `id` as given |
| `geode:gw_geo1` | `{type:'geode', id:'gw_geo1', amount: 30-120}` |
| `lever:sf_lv1` | `{type:'lever', id:'sf_lv1'}` |
| `gate:sf_gate1?lever:sf_lv1` | `{type:'gate', id:'sf_gate1', opens:'lever:sf_lv1', w, h}` (position/size in the notes; `w4 h1` = horizontal grate) |
| `gate:gw_gate1?boss:effigy` | `{type:'gate', id:'gw_gate1', opens:'boss:effigy'}` |
| `arena:effigy` | `{type:'arena', boss:'effigy', bx, by, trigger}` + `arena_gate`s - all given in the arena room's notes |
| `sealdoor` | `{type:'sealdoor', id:'sealdoor'}` (ri_08) |
| `enemy:snuffed_walker*3` | three `{type:'enemy', kind:'snuffed_walker'}` placed as the notes describe |
| `landmark:...` | the room's signature image - build/decorate around it |

`npc:sable:2` must only appear after `boss:sable2` (she is in ri_08, which is behind that arena anyway; if the npc
entity supports a condition, give it `boss:sable2`). Sable stage 1 in gw_07 is a glimpse event on an unreachable beam.

## Region builders: checklist per room

1. Rect and exits exactly as in the JSON; landings for every upward exit; no other openings.
2. Every listed path possible with its `requires`; every gate impossible without it (use `X` faces, deep pits, ceilings);
   absent directions impossible.
3. Every spot reachable and escapable as listed; secrets behind `B` walls as described.
4. Contents placed at the columns the notes give (they are suggestions where they say "at col N"; keep them in the stated zone).
5. Enemies as listed (counts are guides; keep their placement away from required precision jumps).

## Boss builders

Arena rooms: gw_05 effigy, mb_07 sable1, sf_05 matron, dn_07 tallowmere, ch_09 kilnmother, mw_04 vespertine,
ri_07 sable2, hs_03 lucerne. Each arena's notes give floor row, platforms, hazards, gate columns/rows, `bx/by` and the
trigger rect. Exits of arenas are closed by `arena_gate`s during the fight; the Effigy's west exit additionally has
`gw_gate1` (opens `boss:effigy`). A sconce is always in the arena room's neighbour.

## Things that look odd but are intended

- The Rime has no way back up through its three cracked floors; its only exits upward are the up-only Ice Stair
  (ri_05 -> dn_12, grip) and, after Sable's second duel, the ri_lv1 chute (ri_08 -> ri_01). dn_12's stair-top ledge
  must stay unreachable from the Reliquary floor (10 tiles, glazed).
- mb_02 -> mb_08 and gw_12 -> gw_02 are one-way drops (no climbing back).
- The Gallery of Saints (dn_09) is grip + dash eastward but a free drop westward.
- The Bolt shrine is in the room before the Effigy; skipping it is possible but not useful.
