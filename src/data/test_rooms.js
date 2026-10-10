// src/data/test_rooms.js — dev test rooms (region 'test', dev:true), far below the real world (gy >= 900).
// They exercise every engine feature: transitions in all 4 directions, ledges 1..7, gaps 4..12, a grippable
// shaft, a glazed wall, one-way platforms, spikes, water (wide pool + low tunnel), lava, B walls, a D floor,
// and markers for the common entity types. Start with ?test=1&testrooms=1 (or ?room=dev_01).
// ?region=<id> renders these rooms as that region (art/music/darkness previews).
//
// Global layout (tile coords; cells are 16×9):
//
//                 [ dev_shaft 32×36 @ 64,918 ]
//   [ dev_water ] [ dev_01   80×18 @ 64,954  ] [ dev_02 96×27 @ 144,954 ]
//   [ 64×27 @0,954][ dev_below 80×18 @ 64,972 ]
//
// Node-loadable (pure data built by small helpers).
(function () {
  'use strict';
  const G = globalThis.G;

  // ---- tiny grid builder (rows of chars; c/r are room-local tile coords, ranges inclusive) ----
  function grid(cols, rows, ch) {
    const g = [];
    for (let r = 0; r < rows; r++) g.push(new Array(cols).fill(ch || '.'));
    return g;
  }
  function fill(g, c0, r0, c1, r1, ch) {
    for (let r = r0; r <= r1; r++) for (let c = c0; c <= c1; c++) if (g[r] && c >= 0 && c < g[r].length) g[r][c] = ch;
  }
  function frame(g) { // solid border
    const rows = g.length, cols = g[0].length;
    fill(g, 0, 0, cols - 1, 0, '#'); fill(g, 0, rows - 1, cols - 1, rows - 1, '#');
    fill(g, 0, 0, 0, rows - 1, '#'); fill(g, cols - 1, 0, cols - 1, rows - 1, '#');
  }
  const put = (g, c, r, ch) => { g[r][c] = ch; };
  const lines = (g) => g.map((row) => row.join(''));

  const rooms = [];

  // ===================================================================== dev_01 — run, ledges, hub
  // Start room. W → dev_water, E → dev_02, N (via one-way platforms) → dev_shaft, S (pit) → dev_below.
  {
    const g = grid(80, 18);
    frame(g);
    fill(g, 0, 16, 79, 17, '#');                 // floor (surface at row 16)
    fill(g, 0, 13, 0, 15, '.');                  // W opening rows 13..15
    fill(g, 79, 13, 79, 15, '.');                // E opening rows 13..15
    fill(g, 4, 0, 7, 0, '.');                    // N opening cols 4..7
    for (const r of [12, 8, 4]) fill(g, 2, r, 9, r, '='); // one-way platform ladder up to the N exit
    // Ledges 1..7 tiles above the floor, 3 wide, 3 apart. h1/h2 are solid steps; h>=3 are floating slabs
    // (walk underneath). Tops at row 16-h.
    for (let h = 1; h <= 7; h++) {
      const c0 = 28 + (h - 1) * 6;
      if (h <= 2) fill(g, c0, 16 - h, c0 + 2, 15, '#');
      else fill(g, c0, 16 - h, c0 + 2, 16 - h, '#');
    }
    fill(g, 70, 16, 73, 17, '.');                // S pit / opening cols 70..73
    put(g, 14, 15, 's');                         // sconce
    put(g, 18, 15, 'l');                         // lore tablet
    put(g, 22, 15, 'n');                         // npc thrum
    put(g, 25, 15, 'h');                         // shrine
    put(g, 65, 8, 'p');                          // pickup on top of the 7-tile ledge (wings reward)
    put(g, 76, 15, 'e');                         // enemy (beyond the pit, guarding the E exit)
    rooms.push({
      id: 'dev_01', region: 'test', dev: true, name: 'Dev — Run & Ledges',
      gx: 64, gy: 954, tiles: lines(g),
      spawn: { tx: 12, ty: 15 },
      legend: {
        s: { type: 'sconce', id: 'dev_sconce' },
        l: { type: 'lore', id: 'lore_dev_1', text: 'lore_sh_1' },   // dev-only id (lore_sh_1 is placed in sh_01)
        n: { type: 'npc', npc: 'thrum' },
        h: { type: 'shrine', ability: 'dash' },
        p: { type: 'pickup', id: 'dev_hw1', item: 'heartwax' },
        e: { type: 'enemy', kind: 'ash_crawler' },
      },
      entities: [{ type: 'light', x: 14, y: 13, r: 5, color: '#ffc070', intensity: 0.8, flicker: true }],
    });
  }

  // ===================================================================== dev_02 — gaps 4/6/9/12, spikes, platforms
  {
    const g = grid(96, 27);
    frame(g);
    fill(g, 0, 16, 95, 26, '#');                 // plateau (surface at row 16)
    fill(g, 0, 13, 0, 15, '.');                  // W opening rows 13..15 (← dev_01)
    // Gaps: pits down to row 21 with spikes at the bottom (row 21), solid below.
    const gaps = [[10, 4], [20, 6], [32, 9], [47, 12]];   // [first column, width]
    for (const [c, w] of gaps) {
      fill(g, c, 16, c + w - 1, 21, '.');
      fill(g, c, 21, c + w - 1, 21, '^');
    }
    // East part: one-way platforms above a spike strip (pogo practice), and a high shelf.
    fill(g, 66, 12, 72, 12, '=');
    fill(g, 74, 9, 80, 9, '=');
    fill(g, 82, 6, 88, 6, '=');
    fill(g, 68, 15, 78, 15, '^');                // floor spikes on the plateau
    put(g, 90, 15, 'e');
    rooms.push({
      id: 'dev_02', region: 'test', dev: true, name: 'Dev — Gaps',
      gx: 144, gy: 954, tiles: lines(g),
      legend: { e: { type: 'enemy', kind: 'ash_crawler' } },
    });
  }

  // ===================================================================== dev_water — pool, low tunnel, lava
  {
    const g = grid(64, 27);
    frame(g);
    fill(g, 0, 16, 63, 26, '#');                 // floor (surface at row 16)
    fill(g, 63, 13, 63, 15, '.');                // E opening rows 13..15 (→ dev_01)
    fill(g, 50, 16, 53, 18, '%');                // lava pool, 4 wide (jumpable)
    fill(g, 28, 16, 45, 20, '~');                // wide meltwater pool, 18 wide (flush rims)
    fill(g, 8, 16, 24, 20, '~');                 // tunnel water
    fill(g, 10, 1, 22, 13, '#');                 // low ceiling: only rows 14..15 (2 tiles) of air above the water
    put(g, 4, 15, 'p');
    rooms.push({
      id: 'dev_water', region: 'test', dev: true, name: 'Dev — Water & Lava',
      gx: 0, gy: 954, tiles: lines(g),
      legend: { p: { type: 'pickup', id: 'dev_urn', item: 'urn' } },
    });
  }

  // ===================================================================== dev_shaft — grip shaft & glazed wall
  {
    const g = grid(32, 36);
    frame(g);
    fill(g, 4, 35, 7, 35, '.');                  // S opening cols 4..7 (→ dev_01); floor row 35 beside it
    fill(g, 14, 6, 15, 34, '#');                 // grippable pillar (29 tiles): single-wall climb on its faces
    fill(g, 22, 6, 23, 34, 'X');                 // glazed pillar: cannot be gripped
    fill(g, 25, 28, 30, 28, '=');                // one-way shelves in the east bay
    fill(g, 25, 22, 30, 22, '=');
    fill(g, 25, 16, 30, 16, '=');
    fill(g, 25, 10, 30, 10, '=');
    rooms.push({
      id: 'dev_shaft', region: 'test', dev: true, name: 'Dev — Shaft',
      gx: 64, gy: 918, tiles: lines(g),
    });
  }

  // ===================================================================== dev_below — B wall, D floor, lever/gate
  {
    const g = grid(80, 18);
    frame(g);
    fill(g, 0, 16, 79, 17, '#');                 // floor (surface at row 16)
    fill(g, 70, 0, 73, 0, '.');                  // N opening cols 70..73 (→ dev_01 pit)
    for (const r of [12, 8, 4]) fill(g, 68, r, 75, r, '=');   // ladder back up
    fill(g, 58, 1, 59, 15, 'B');                 // breakable wall (full height)
    // Floating shelf with a cracked dive floor in the middle (plunge through it).
    fill(g, 18, 10, 25, 11, '#');
    fill(g, 26, 10, 33, 11, 'D');
    fill(g, 34, 10, 41, 11, '#');
    fill(g, 13, 13, 16, 13, '=');                // step up to the shelf
    put(g, 44, 15, 'v');                         // lever
    put(g, 48, 15, 'q');                         // gate opened by the lever
    put(g, 52, 15, 'e');                         // enemy
    rooms.push({
      id: 'dev_below', region: 'test', dev: true, name: 'Dev — Breakables',
      gx: 64, gy: 972, tiles: lines(g),
      legend: {
        v: { type: 'lever', id: 'dev_lv1' },
        q: { type: 'gate', id: 'dev_gate1', opens: 'lever:dev_lv1', h: 4 },
        e: { type: 'enemy', kind: 'ash_crawler' },
      },
    });
  }

  for (const r of rooms) G.World.defineRoom(r);
})();
