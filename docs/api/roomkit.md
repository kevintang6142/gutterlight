# roomkit — building rooms that exactly match the world plan

`tools/lib/roomkit.js` builds room tile grids sized and positioned exactly per
`design/world_plan.json`, carves the planned exits at their exact coordinates, places entity
markers, self-checks against the plan, and emits a Node-loadable `src/data/...` file.
Recommended workflow for region and arena builders: write a generator script
`tools/gen/<region>.js` (you own it) that builds every room with the kit and emits
`src/data/regions/<region>.js` (or `src/data/arenas/<boss>.js`). Re-run it after every change.

```bash
node tools/lib/roomkit.js --region guttered   # list rooms of a region (id, size, kind, name)
node tools/lib/roomkit.js gw_03               # full plan entry: exits with exact cell ranges, paths, spots, contents, notes
```

```js
const RK = require('../lib/roomkit');
const r = RK.room('gw_03');           // w×h grid of '#', knows its plan entry (r.plan) and exits
r.carve(1, 1, 62, 14);                // open space: carve(x, y, w, h)   (x = column, y = row)
r.fill(10, 20, 5, 2, '^');            // any tile char: . # X = ^ ~ % B D :
r.platform(10, 11, 5);                // '=' one-way platform, row 11, cols 10..14
r.paste(20, 16, [                     // ASCII block, top-left at (20,16); '?' keeps what is there
  '..##..',
  '?.##.?',
]);
r.openExits();                        // carve every planned exit (border cell + 1 tile inward)
r.openExit('W1', 3);                  // or one exit, 3 tiles deep
r.exit('W1')                          // → {id, side, pos, size, to, toExit, cells:[[x,y],...]}
r.put(30, 14, { type: 'lanternway', id: 'guttered' }); // entity marker on that tile (tile becomes EMPTY)
r.put(20, 14, { type: 'enemy', kind: 'snuffed_lancer' }); // identical id-less props reuse one marker char
r.add({ type: 'light', x: 30, y: 10, r: 4, color: '#ffb060' }); // via the room's entities list instead
r.check()                             // → {errors, warnings}: unplanned/blocked openings, missing floors at side exits, duplicate ids, unplaced legend
console.log(r.ascii());               // print the grid
const def = r.toDef({ theme: { bg: 'interior' }, bgSeed: 3, dark: 0.6 }); // throws if check() has errors
RK.emit('guttered', [def /*, ...*/], 'src/data/regions/guttered.js');
```

Notes
- Marker anchoring follows TECH_SPEC §7.5: a ground-standing entity's marker goes in the EMPTY tile
  directly above a solid tile (its feet land on that solid tile's top).
- 36 marker characters per room (a–z, 0–9). Use `add()` for more, or for entities placed on
  non-empty tiles (e.g. something floating over water).
- The kit only knows the plan's geometry. Traversal correctness (jump heights, gates) is verified by
  `tools/reach.js`; full validation by `tools/validate.js`; visuals with `tools/shot.js` / `tools/smoke.js`.
