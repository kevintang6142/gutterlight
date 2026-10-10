# tools — validation, reachability, smoke test, build (module: tools)

Node-only QA tooling. Full guide with every check and a fixing cookbook: **`tools/README.md`**.
Self-test of the tools: `node tools/fixtures/selftest.js` (62 checks).

## Commands (exit 1 = must fix; warnings never fail)

```sh
node tools/test_all.js [--quick] [--only a,b] [--skip a,b] [--from step] [--list]   # EVERYTHING below + all self-tests
node tools/audit.js                     # static contracts: index.html scripts, syntax, canvas rules, audio names, text keys
node tools/e2e.js [--file dist/Gutterlight.html]   # the real boot flow end to end (title … death/wisp … continue)
node tools/playthrough.js [--from step] [--to step] [--list] [--verbose] [--shots] [--file f]
                                        # the WHOLE critical path played in the real game, New Game → both endings (~7 min)
node tools/validate.js [--room gw_03,gw_04] [--dev] [--json] [--quiet] [--complete] [--plan f.json | --no-plan] [--data extra.js [--data-only]]
node tools/plan_check.js [plan.json] [--verbose | --orders-json]   # world plan check; --orders-json: feasible ability orders as JSON
node tools/reach.js    [--room gw_03 | --all] [--verbose] [--overlay] [--json] [--jobs N] [--no-cache]
                       [--plan f.json] [--data extra.js [--data-only]] [--dev] [--expect] [--global] [--margin [H[,V]]]
# --data-only: skip the shipped room files (src/data/regions/<region>.js, src/data/arenas/*.js) so extra/fixture rooms
#              are checked in isolation (the fixtures reuse the real ids sh_01 sh_02 mw_03 dn_12).
node tools/smoke.js    [--rooms-only | --flow-only] [--room id,...] [--dev] [--no-shots] [--file dist/Gutterlight.html]
node tools/build.js    [--no-verify] [--out dist/Gutterlight.html]
```

- **validate** — static data checks (dimensions, grid, characters, legend, ids, overlaps, openings matched by the
  neighbour at the same global tile, corners, liquids, entity props/positions/ground, text & item references,
  conditions, exact conformance with `design/world_plan.json`, TECH_SPEC §19 totals). Error codes: `load id region
  tiles rows dims grid chars legend corner opening liquid entity ref plan plan-rect plan-exit plan-content
  plan-missing overlap totals` (+ warnings `exit-size exit-floor`).
- **reach** — physics reachability with the real `G.PlayerMotor`: plan paths (alternatives = same from/to),
  gates, spots (+ the way back), omitted directions = one-way (warning if possible), `--global` = plan_check on the
  plan + measured unplanned traversals. Results cached in `test-output/tools/reach-cache/`.
  **Gates hold against the MAXIMAL pre-ability set**: a path/spot that requires movement ability X must be impossible
  without X even with every other movement ability a player can own before X — the union of the abilities that
  precede X in every feasible acquisition order (plan progression simulation: `node tools/plan_check.js --orders-json`,
  restricted to orders where the alternative's other abilities also come before X). For the world plan:
  `dash ← []`, `grip ← [dash]`, `oilcloak ← [dash, grip, plunge]`, `wings ← [dash, grip, oilcloak, plunge]`,
  `plunge ← [dash, grip, oilcloak, wings]` (printed in reach's header). A plan may state `"abilityOrders": [[...]]`
  itself (fixtures). Lever/boss/seal tokens: requires-minus-token, as warnings. Leak level: error for inter-region
  paths, warning otherwise — fix both.
- **reach --margin [H[,V]]** (default `12,4`; test_all step `reach_margin`) — the positive checks (plan paths, spots and
  the way back) re-run with a **handicapped motor**: run/dash/swim speeds −H px per 300 px (12 px = 0.3 tile), every
  jump / double jump / wall-jump / upward exit boost rises V px lower, **no coyote time**, and ground jumps start ≥ ⅔·H px
  (8 px) inside a ledge's drop-off edge (walls are fine: the player can press into them). A traversal that passes the
  normal run but fails here only works with a near-exact position/timing (the zero-margin moves found by the Mothwood
  QA). V is small on purpose: a held full jump is deterministic, so "needs the full jump height" is not a precision
  move. **Error** for a crossing of the intended critical path (each room of every `plan_check` route: exit toward the
  previous room → exit toward the next one, plus the step's shrine/arena/lever from the arrival exit), warning elsewhere.
  Gates and one-way checks are not repeated (they are about impossibility; the normal run covers them). Cached
  separately. Baseline QA run: 0 errors, 0 warnings at `12,4` and `24,4`; at `40,8` only the "full jump straight up
  into an N exit from a platform at row 5" rooms (dn_03 ch_03 ch_06 ch_07 ch_08 mw_03 mw_07: ≈ 10 px of height to
  spare, deterministic) fail.
- **smoke** — title → new game → play, save/continue round trip, every room visited (screenshots
  `test-output/rooms/<id>.png`, per-room errors and timings).
- **build** — `dist/Gutterlight.html` with every script inlined in `index.html` order; verified headless.

## JSON output

`validate --json` → `{ ok, rooms:[ids], errors:[{level, scope, code, msg}], warnings:[…], coverage:{planned, built,
complete, regions}, totals:{…} }` (`scope` = room id, `load`, `plan` or `totals`).

`reach --json` → `{ rooms: { <id>: { items:[{level:'pass'|'warning'|'error', kind:'path'|'gate'|'spot'|'spotgate'|
'oneway'|'exit', msg, detail:[path dump or diagnostics lines], from?, to?}], stats:{ms, steps, sets}, full:[tokens],
overlays:[{req, grid}] } }, errors, warnings, skipped:[…], global?: {ok, planOk, augmentedOk, added:[…], output} }`.

## Plan entries understood by reach (TECH_SPEC §18 + extensions)

- `paths: [{from, to, requires}]` — tokens: `dash grip wings oilcloak plunge`, `boss:<id>`, `lever:<id>`, `seals>=3`.
- `spots: [{id, from, requires}]` — ids `start sealdoor sconce:<id> lanternway:<id> lore:<id> npc:<npc>[:<stage>]
  shrine:<ability> pickup:<pickupId> geode:<id> lever:<id> arena:<boss>`, plus **`tile:<col>,<row>`** (stand on that
  tile; for tests and ad-hoc checks).
- Extension for fixtures: `"expect": "fail"` on a path/spot = known-impossible; with `--expect` it must be impossible.
- Plan-level `"abilityOrders": [["dash","grip",...], ...]` overrides the simulated acquisition orders (fixtures).

## Library modules (`tools/lib/`, CommonJS)

```js
const { loadWorld } = require('./tools/lib/game_data');
const W = loadWorld({ extra: ['tools/fixtures/plan_rooms.js'] }); // core + src/data/** (index.html order) + extras
// loadWorld({ extra, dataOnly: true }) (or env GUTTERLIGHT_DATA_ONLY=1) skips the shipped region/arena room files
W.G; W.defs /* [{def, file}] every defineRoom call, duplicates included */; W.loadErrors /* [{file, error}] */

const Plan = require('./tools/lib/plan');
Plan.loadPlan()                        // {plan, file, error, missing}
Plan.parseContent('pickup:sigil:ember_thirst#gw_sig_ember_thirst') // {type:'pickup', item:'sigil', sigil, id, spotId}
Plan.entityMatches(parsed, props)      // does an entity spec satisfy a planned content item / spot?
Plan.nameOpenings(room.openings)       // [{side, pos, size, id:'W1'…}] — the plan's exit naming
Plan.abilityOrders(planFile?, plan?)   // {orders:[[ability…]…], source} feasible acquisition orders (plan_check --orders-json)
Plan.maxBefore(orders, 'wings', ['grip']) // {set:['dash','grip','oilcloak','plunge'], orders:n} maximal set owned before X

const Cond = require('./tools/lib/conditions');
Cond.parseCondition('lever:gw_lv1 & !boss:effigy')  // {terms, errors}
Cond.evalWithTokens('seals>=3', new Set(['seals>=3'])) // true

require('./tools/lib/registry').scanRegistry()      // entity types, enemy kinds, bosses, decor props, event scripts found in src/

// Reachability inside one room (what reach.js runs per room × ability set):
const RC = require('./tools/lib/reach_core');
const an = new RC.RoomAnalyzer(W.G, W.G.World.getRoom('gw_03'), {});
const spot = an.addTarget('pickup:gw_hw1');          // or 'tile:12,15'
const res = an.closure(an.entryStates('W1'), ['dash', 'lever:gw_lv1']);  // exit ids = Plan.nameOpenings naming
res.exits.has('E1'); res.spots.has(spot);
console.log(RC.describePath(res.exits.get('E1')).join('\n'));  // macro-action path
console.log(RC.overlay(an, res).join('\n'));                   // ASCII: * stand, @ swim, | cling, + air
```
In-room navigation for bots (`tools/playthrough.js`): `const { Nav } = require('./tools/lib/nav'); const nav = new Nav();
nav.plan(snap, target)` with `snap = {room, tiles, solids, motor, abilities}` read from the live game and `target` =
`{exit:'E1'} | {spot:'shrine:dash'} | {rect:{x,y,w,h}} | {stand:{feetY0,feetY1,cx0,cx1}}` → the next action
(`seq` input codes replayed frame by frame, `walkout`, `hold`, `break`, `here`, `fail`) planned from the player's exact
state; `plan.margin` = the start tolerance (px) of the chosen macro, `plan.fragile` = reach edges that only work from
reach's exact sample. `RoomAnalyzer(G, def, {alts: N})` keeps N alternative macros per destination for it.
`tools/lib/roomkit.js` (world_plan module) builds rooms that match the plan; `tools/lib/browser.js` opens the game
headless (`openGame({query, file, waitFor})`).

## Notes for content builders

- Build rooms with roomkit, then: `validate --room <id>` → `reach --room <id>` → `smoke --rooms-only --room <id>`.
- Openings into planned rooms that are not built yet are warnings; they become errors once the neighbour exists
  and does not match.
- reach does not model pogo bounces, knockback or enemy-assisted movement: a traversal that needs a pogo is reported
  as impossible (design rule: required paths must not depend on pogo).
- Measured fact worth knowing: a one-way platform 6 tiles below and 9 tiles beside a ledge lets dash + wings reach
  it (found while building the `dn_12` fixture) — keep "unreachable" ledges well clear of anything standable.
