# GUTTERLIGHT tools

Dev-only Node tooling (the game itself has zero dependencies; only `tools/` uses Playwright). Run everything
from the repo root. Exit code 1 = something must be fixed; warnings never fail a run.

| Command | What it does | Typical time |
|---|---|---|
| `node tools/test_all.js` | **the regression runner**: every self-test and tool below in sequence, summary table, exit 1 on any failure (`--quick` skips the slow steps) | ~18-35 min (`--quick` ~3 min) |
| `node tools/audit.js` | static contracts: index.html script list, syntax, no per-frame `shadowBlur`/`filter`, audio names and `G.Text` keys exist | ~8 s |
| `node tools/text_check.js` | `G.Text` / `G.Items` schemas, counts, conditions, page lengths, NPC talk reachability (`--transcript`) | < 1 s |
| `node tools/modes_check.js [contract] [wisp] [engine] [tele] [leap] [--shots]` | the difficulty modes: `?mode=`/defaults/save migration, the real "Choose a Trial" flow, Hardcore permadeath (broken at the instant of death, game over, Continue refused, quit/reload mid-death), the Gutterwisp after a death in every boss fight (spot chosen by `G.wispSpotFor`), and every boss seeded in easy/standard/hardcore (standard = hardcore frames, easy draws its explicit telegraphs; `--shots` = easy \| standard sheets in `test-output/modes_check/`); `engine`: real-storage edge cases (stale-tab hardcore death, refused Continue on a broken/erased slot returns to the title, quit mid-death empties Ember, old arena wisp moved on Continue); `leap`: the Effigy's off-screen leap keeps a subtle landing mark in standard/hardcore. test_all steps `modes` (contract + wisp + engine) and `modes_tele` (tele + leap, slow) | ~1.5 min + ~4 min |
| `node tools/e2e.js` | the real boot flow end to end (title → Choose a Trial (Standard) → intro → wake → every screen → death/wisp → save/quit/continue) | ~20 s |
| `node tools/input_check.js [--file dist/Gutterlight.html] [--shots]` | control rebinding with real browser keyboard/mouse events and a mocked gamepad: defaults, binding Attack to LMB via the Controls screen, move/swap/refuse-last notes, Esc/Delete during capture, lockout fallbacks (Enter/Esc/arrows), right-click menu suppression, labels in cards/tablets, Reset to Defaults, persistence and corrupt-storage fallback. test_all step `input` | ~5 s |
| `node tools/rebind_check.js [--file dist/Gutterlight.html]` | regressions of the rebinding QA round, three pages (`tools/rebind/engine_fixes.js`, `ui_fixes.js`, `notes.js`): a gameplay action on an arrow / pad A never confirms or closes menus, bound Alt/Ctrl block browser shortcuts, Meta refused, Pause always keeps a pad button, pad capture cancel/timeout, Enter refused, capture prompt by device, world prompt keycap, no urn count, Controls notes. Step `rebind` of test_all (about 5 s). |
| `node tools/playthrough.js [--from <step>] [--to <step>] [--list] [--verbose] [--shots] [--file f] [--mode standard\|easy]` | **the whole game played by a bot in the real build**, in the Trial picked at New Game (default Standard; `--mode easy` = the pre-modes run): New Game → every ability shrine, boss, lever, sconce rests, Lanternway travel, death + wisp, save/quit/continue → ending `undying` → title Continue on the finished save (rewound before Lucerne) → 6 sparks → ending `gutterlight`. Movement = `tools/lib/nav.js` (reach_core's macro search from the player's exact motor state, replayed frame by frame); routes from the world plan. Checkpoint per step in `test-output/qa-playthrough/checkpoints/` (`--from` resumes) | ~7 min |
| `node tools/validate.js` | static checks of all room data against TECH_SPEC §7/§9/§19 and `design/world_plan.json` | < 1 s |
| `node tools/reach.js --room <id>` | physics reachability with the real motor: plan paths, gates, spots, one-ways | 1–5 s per room |
| `node tools/reach.js` | every built room in the plan (parallel, cached) | minutes once, then cached |
| `node tools/smoke.js` | headless end-to-end: title → new game, save/continue, every room visited + screenshot | ~20 s + 2 s/room |
| `node tools/build.js` | single-file `dist/Gutterlight.html` (+ boot verification) | ~3 s |
| `node tools/fixtures/selftest.js` | regression test of validate/reach/build themselves (62 checks) | ~15 s |
| `node tools/plan_check.js` | world plan validator (architect) | |
| `node tools/shot.js --query … --eval … --out …` | one-off headless screenshot / script | |
| `node tools/engine_selftest.js`, `motor_metrics.js`, `*_selftest.js` | per-module self-tests (their owners) | |

Recommended loop for a region builder after every change to a room:

```sh
node tools/gen/<region>.js                    # your generator (roomkit) → src/data/regions/<region>.js
node tools/validate.js --room gw_03           # fix all ERRORs
node tools/reach.js --room gw_03              # fix all ERRORs, read the warnings
node tools/smoke.js --rooms-only --room gw_03 # look at test-output/rooms/gw_03.png
```
Before handing off: `node tools/test_all.js` (or at least `node tools/validate.js && node tools/reach.js && node tools/smoke.js && node tools/build.js`).

---

## validate.js

```
node tools/validate.js [--room id[,id]] [--dev] [--json] [--quiet] [--complete]
                       [--plan file | --no-plan] [--data extra_rooms.js ... [--data-only]]
```
Loads `src/data/**` in `index.html` order in Node (via `tools/lib/game_data.js`, which also records which file
defined each room). Output is grouped per room, then `PLAN` and `TOTALS`. Dev rooms (region `test`) are skipped
unless `--dev`. With `--room`, world-wide checks (duplicate ids, plan coverage, totals) are skipped but the whole
world is still loaded for neighbours and references.

| code | check | how to fix |
|---|---|---|
| `load` | a data file threw while loading (syntax error, bad call) | read the message; `node --check <file>` |
| `id` | room id format `<prefix>_<nn>` with the region prefix; a room defined twice; an entity id (sconce, lore, pickup, geode, lever, gate, enemy, …) used more than once in the world (pickup ids also clash with Pell's shop ids) | rename |
| `region` | unknown region | use one of `G.World.REGION_IDS` |
| `tiles` `rows` `dims` `grid` | tiles must be equal-length strings; width multiple of 16 ≥ 32, height multiple of 9 ≥ 18; `gx % 16 == 0`, `gy % 9 == 0` | build rooms with `tools/lib/roomkit.js`, which sizes them from the plan |
| `chars` | only `. # X = ^ ~ % B D :` and markers `a-z 0-9` | |
| `legend` | every marker used has a legend entry with a `type`; unused legend keys (warning); a marker whose props have an `id` used more than once | |
| `corner` | corner tiles must be `#`/`X` | |
| `opening` | every open boundary tile (anything but `#`/`X`) must face an open boundary tile of the neighbouring room at the same global tile. The message gives the side, rows/cols and global coordinates. Markers on the border count as open. Openings into a planned-but-unbuilt room are a warning. `B`/`D` on the border are errors (the engine treats them as open) | open/close tiles so both rooms agree; check the plan exit `pos`/`size` |
| `exit-size` `exit-floor` | (warnings) side exits < 3 tall / vertical exits < 3 wide; no floor just inside a side exit | |
| `liquid` | pools of `~`/`%`: flat top (air only above the top row; lower liquid tiles may only sit under solid ceilings), no liquid over air, solid rims (no liquid beside air), not fully enclosed, water never touching lava | |
| `entity` | known type (TECH_SPEC §9.1 + every `G.registerEntity` in src); required props (`sconce.id`, `lore.id`, `npc.npc`, `shrine.ability`, `pickup.id/item(/sigil/seal)`, `geode.id`, `lever.id`, `gate.id/opens`, `arena.boss/bx/by/trigger`, `enemy.kind`, …); inside the room; ground-standers (`sconce npc lanternway shrine lore geode start lever pickup sealdoor`, pickups unless `floating: true`) need `#`/`X`/`B`/`D`/`=` directly below the marker and must not stand inside rock (headroom overlap = warning); gate rect (bottom-LEFT anchored, `w`×`h` tiles) inside the room | put ground markers in the empty tile directly above the floor |
| `ref` | lore ids exist in `G.Text.lore`, spark ids in `G.Text.sparks`, npc text keys (`npc` / `npc_stage` / `key`) in `G.Text.npcs`, sigils in `G.Items.sigils`; every condition (`gate.opens`, `requires`) parses and references existing levers / bosses / sigils / rooms… (a lever planned in an unbuilt room is a warning) | |
| `plan` `plan-rect` `plan-exit` `plan-content` | the room must be in the plan with the same region and rect; its openings must equal the plan exits exactly (side, pos, size) — "unplanned opening", "planned exit … is closed", "must be rows …; built rows …"; every planned content item must exist (`gate` with the same `opens`, pickups with the same item/sigil); enemy counts and unplanned non-collectible content are warnings; unplanned collectibles are errors | rebuild with roomkit (`r.openExits()`), re-read `node tools/lib/roomkit.js <id>` |
| `plan-missing` | planned rooms not built: error inside regions that have at least one built room (or always with `--complete`), one warning per region nobody has started. Arena rooms (`kind: 'arena'`, built by the boss builders in `src/data/arenas/`) are only a warning until `--complete`, so a finished region is never blocked by its pending arena | |
| `overlap` | rooms must not overlap | |
| `totals` | TECH_SPEC §19 / `G.Items.totals`: every lore tablet and spark placed exactly once, all 7 Lanternways, sconces per region (2 in regions with ≥ 8 rooms, sanctum 1), heartwax/urn/kiln glass/notch pickups = totals minus shop and NPC sources, every sigil obtainable exactly once (shop + NPC gifts + pickups), one arena per boss, exactly one `start` and one `sealdoor`, all NPC stages, every enemy kind placed. Over-counts are always errors; shortfalls are one summary warning until the world is complete (or `--complete`) | |

## reach.js

```
node tools/reach.js [--room id[,id] | --all] [--verbose] [--overlay] [--json] [--jobs N] [--no-cache]
                    [--plan file] [--data extra_rooms.js ... [--data-only]] [--dev] [--expect] [--global] [--margin [H[,V]]]
```
For each built room that is in the plan, reach.js loads the real `G.PlayerMotor` and `G.Physics` in Node and
searches the motor's state space (see *Internals*). Checks, per room:

| check | meaning | level |
|---|---|---|
| path | each plan path `from → to` is possible with exactly its `requires`. Several entries with the same from/to are **alternatives**: the path passes if any works; an alternative that does not work is a warning | error if no alternative works |
| gate | for each movement ability X in a working alternative: the path must NOT be possible without X **even with the maximal ability set a player can own before X** (union of the abilities preceding X in the plan's feasible acquisition orders — `tools/plan_check.js --orders-json`; e.g. grip gates are tested with dash, wings gates with dash + grip + oilcloak + plunge; a plan may state `abilityOrders`) (skipped if that set still satisfies another listed alternative). Also checked, as warnings, for `lever:` / `boss:` / `seals>=` tokens (closed gates must really block) | error when the path leads into another region, else warning |
| spot | each spot (content) is reachable from its exit with its requires — "within ~1 tile": stand (grounded — these are used with Up) on the floor next to sconces/lore/npcs/lanternways/shrines/`tile:c,r`, touch a ±1 tile box around pickups, ±2 for levers/geodes (hit with the Brand) and the seal door, the arena trigger rect; Sable's stage-1 glimpse counts within 10 tiles — **and** you can get back to that exit afterwards (only another exit: warning; no exit: SOFTLOCK error). The same gate check runs for spots (warnings) | error |
| one-way | every exit pair the plan does NOT list is meant to be impossible; it is tested with every ability (and every token of the room) and reported if possible | warning |
| global (`--global`) | every measured unplanned traversal gets a minimal requirement list (greedy removal, re-measured), is added to a copy of the plan (`test-output/tools/augmented_plan.json`) and `tools/plan_check.js` re-runs its progression and no-trap simulation on it | error only if the augmented plan fails where the original passes |
| margin (`--margin [H[,V]]`, default 12,4) | plan paths + spots (+ the way back) re-run with a handicapped motor: run/dash/swim −H px per 300 px, jumps/boosts V px lower, no coyote time, ground jumps ≥ ⅔·H px inside a ledge edge (`reach_core.setEdgeInset`). Catches traversals that only work with a near-exact position/timing | error on the intended critical path (`plan_check` routes), warning elsewhere |

Entering a room: side exits = standing just inside on the floor of the opening; a top (N) opening = falling in at
three x positions; a bottom (S) opening = rising in with the engine's upward exit boost (`exitUpBoost`). Hazards
(spikes, lava, water without oilcloak) end a macro as a failure. Closed `gate`s / the `sealdoor` are solid unless
the requirement tokens satisfy their condition; `arena_gate`s are open. `B` components break when a ground/swim
position is within Brand reach (side, up or down slash); `D` components only break when a plunge lands on them.

Output: failures always print diagnostics (exits reachable with that set, closed gates, room variants explored);
`--verbose` prints the macro-action path for every check (e.g. `from x=487 of floor (0,14)..49 → jump R dash@40
dj@52 R`); `--overlay` prints, per ability set, the room with `*` on every reached standing position, `@`
swimming, `|` wall clings, `+` airborne start states — the fastest way to see why a ledge is not reached.

Caching: results are cached per (room data hash, ability set, entries, spots) in `test-output/tools/reach-cache/`
and invalidated whenever the motor, physics, world, core or tool sources change. `--no-cache` forces a rerun.

Parallelism: one worker thread per (room, ability set) task; when there are fewer tasks than cores, big tasks
start simulation sub-workers that pre-compute each BFS frontier in parallel (identical results; a 64×36 mixed room
with all its ability sets takes ~3 s on 16 cores, ~15 s on one).

### Fixing reach failures

| message | usual cause / fix |
|---|---|
| `path A→B is NOT possible with [...]` | run with `--overlay`: the last `*` row before the gap shows where the player gets stuck. Ledges must be ≤ 4 tiles above the floor without wings (≤ 7 with wings), gaps ≤ 6 (≤ 9 with dash), corridors ≥ 3 tall where a jump is needed, a landing within reach above every upward exit |
| `GATE LEAK: … possible WITHOUT dash` | the dump shows the trick: shorten a ledge, widen the gap to 9–10, deepen the pit (≥ 7) and make its far wall `X` so grip cannot climb out |
| `GATE LEAK: … WITHOUT grip` | a jumpable stair/platform near the climb (also within a dash-jump: grip gates are tested with dash), or a wall within reach of a wings jump; use `X` faces, remove footholds, keep platforms ≥ 6 tiles away and out of dash range |
| `GATE LEAK: … WITHOUT wings` | the ledge is ≤ 4 tiles up or a grippable wall is nearby — use 6–7 tile ledges and `X` / `=` |
| `GATE LEAK: … WITHOUT oilcloak` | pool narrower than 13, or enough headroom to dash + double-jump across: lower the ceiling to ≤ 3 tiles of air |
| `unplanned traversal A→B is possible` | the direction is meant to be one-way: block the way back (higher ledge, `X` lip/underside, nothing climbable within 6 tiles). If the plan should allow it, ask the architect |
| `spot … cannot get back to A` / `SOFTLOCK` | add a way out (platform, ladder, drop) from the content spot |
| `exit X is built at … instead of …` / `planned exit … is not open` | the room's openings differ from the plan: fix them first (validate.js) |
| `… closed with these requirements: gw_gate1 (opens "lever:…")` | the gate's `opens` does not match the plan token |

## smoke.js

```
node tools/smoke.js [--rooms-only | --flow-only] [--room id[,id]] [--dev] [--no-shots] [--file dist/Gutterlight.html]
                    [--frames 90] [--slow-update 4] [--slow-render 25]
```
1. Boots `index.html` normally (no test param): expects the title, presses Enter until play mode (title gate →
   menu → slot → intro), walks and jumps, checks the mode and `G.debug.errors`; screenshot `test-output/rooms/_newgame.png`.
2. Save → reload → title → Continue: a flag and the cinder count must survive.
3. `?test=1&paused=1`: god mode, teleport into every non-dev room (the dev rooms while no region room exists) at a
   safe spot (sconce, start, Lanternway, else just inside a side exit, else any floor ≥ 2 tiles from hazards),
   step 90 frames (the player must still be in that room and not in a hazard), screenshot
   `test-output/rooms/<id>.png`, then time `G.debug.step(120)` and 10 renders. Rooms above the thresholds are
   listed as slow (headless software rendering is several times slower than a real GPU — compare rooms with each
   other, not with 16.7 ms).
Any console error, page error, `G.debug.errors` entry or failed flow step → exit 1.

## build.js

`node tools/build.js [--no-verify] [--out dist/Gutterlight.html] [--frames 180]` — inlines every `<script src>` of
`index.html` in order (each as its own `<script>` element, `</script` and `<!--` escaped), keeps the rest of the
page verbatim, prints the size (and gzip size), then opens the result headless twice (test mode with 180 frames
stepped, and a normal title boot) and fails on any error or on a leftover external script. A missing script file
fails the build.

## Fixtures & self-test (`tools/fixtures/`)

| file | purpose |
|---|---|
| `reach_rooms.js` | dev rooms `fx_gap10` (10-tile glazed pit), `fx_climb` (glazed blocks 4/7/12 tall), `fx_dive` (D vault, B alcove), `fx_big` (64×36 mixed room, the performance case) |
| `reach_plan.json` | a synthetic plan over the engine dev rooms + those fixtures; entries with `"expect": "fail"` are known-impossible traversals (`--expect` mode). Spot ids may be `tile:<col>,<row>` (stand on that tile) |
| `gen_plan_rooms.js` | builds real plan rooms `sh_01 sh_02 mw_03 dn_12` with roomkit into `plan_rooms.js`; `--broken` also writes `plan_rooms_broken.js` with planted defects |
| `bad_rooms.js` | dev rooms with planted data defects for validate.js |
| `margin_rooms.js` | gw_10 as built before the baseline QA (S1 landing lip cleared by 3.3 px): the normal reach run passes, `--margin` must warn on S1→N1 |
| `selftest.js` | runs everything above and asserts each expected finding (`--quick`: no reach). Every fixture run passes `--data-only`, so the fixtures (which reuse the real ids `sh_01 sh_02 mw_03 dn_12`) never collide with the shipped rooms once those are built |

## Internals of reach (for maintainers)

`tools/lib/reach_core.js`. Graph nodes are *stable states*: ground segments (found by walking the motor both
ways), wall clings per face (a cling maps to a node whose top is at most 12 px BELOW it — it can slide down to it,
so the merge is pessimistic by < 12 px; new nodes start on a 12 px grid. Before the playthrough fix a cling was
merged into any higher node on the same face, which credited it with moves only possible from higher up), swim segments (snapped to the motor's float height) and airborne start states. From each node a
family of open-loop input programs ("policies": jumps with 4 hold lengths × direction changes, dash and double-jump
timings, combos, walk-offs with coyote jumps, drop-throughs, plunges when the room has `D`, wall-jump chains,
swim jumps) is simulated with the real motor at 60 Hz as a prefix-sharing trie until the next stable state, an
exit, a hazard or 300 frames. Ground samples: segment ends + every 100 px; wall samples: the cling top + a 32 px
grid. Variant worlds (broken `B`/`D`) re-simulate only the macros whose swept boxes came within 4 px of a changed
tile. The policy lists were trimmed empirically (variants that never reached a node no other variant reached
over the dev + fixture rooms with every ability were dropped). Known limits: pogo bounces off spikes/enemies,
knockback tricks and enemy-assisted movement are not modelled (reach under-approximates those), and a cling is
treated as reachable only where the motor actually grips (2 px contact). Performance is dominated by
`G.PlayerMotor.step` (~4–6 µs per step).
