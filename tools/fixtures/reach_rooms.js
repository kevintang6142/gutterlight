// tools/fixtures/reach_rooms.js — FIXTURE rooms for the reach.js self-test (region 'test', dev:true, gy >= 1899,
// far from the real world). Loaded only by tools (`--data tools/fixtures/reach_rooms.js`), never by the game.
// Their traversal expectations live in tools/fixtures/reach_plan.json.
//   fx_gap10  64x27  a 10-tile pit with glazed sides and spikes: dash (or wings) needed both ways
//   fx_climb  96x27  glazed blocks 4 / 7 / 12 tall, far apart (no chaining)
//   fx_dive   64x27  a D floor over a closed chamber (plunge only) and a B wall hiding an alcove
//   fx_big    64x36  a realistic mixed room (platform ladder, grip wall, pool, spikes, B alcove) for timing
//   fx_order  64x27  a grip pillar that a dash-jump from a glazed step reaches: holds against [] but LEAKS against
//                    the maximal pre-grip ability set [dash] (reach_plan.json "abilityOrders")
(function () {
  'use strict';
  const G = globalThis.G;
  function grid(cols, rows) { const g = []; for (let r = 0; r < rows; r++) g.push(new Array(cols).fill('#')); return g; }
  function fill(g, c0, r0, c1, r1, ch) { for (let r = r0; r <= r1; r++) for (let c = c0; c <= c1; c++) g[r][c] = ch; }
  const lines = (g) => g.map((row) => row.join(''));

  // ---------------------------------------------------------------- fx_gap10
  {
    const g = grid(64, 27);
    fill(g, 1, 1, 62, 13, '.');                  // air; floor top row 14
    fill(g, 0, 11, 0, 13, '.');                  // W1 rows 11-13
    fill(g, 63, 11, 63, 13, '.');                // E1 rows 11-13
    fill(g, 24, 14, 26, 25, 'X');                // glazed pit sides (no grip escape)
    fill(g, 37, 14, 39, 25, 'X');
    fill(g, 27, 14, 36, 24, '.');                // the 10-wide pit, 11 deep
    fill(g, 27, 25, 36, 25, '^');                // spikes at the bottom
    G.World.defineRoom({ id: 'fx_gap10', region: 'test', dev: true, name: 'Fixture — 10-tile gap', gx: 0, gy: 1899, tiles: lines(g) });
  }

  // ---------------------------------------------------------------- fx_climb
  // Glazed blocks 4 / 7 / 12 tall, spaced so no block can be reached from another (or from a grippable room
  // wall): 18+ columns apart, the 12-tall tower 30+ columns from the east wall.
  {
    const g = grid(96, 27);
    fill(g, 1, 1, 94, 22, '.');                  // air; floor top row 23
    fill(g, 0, 20, 0, 22, '.');                  // W1 rows 20-22
    fill(g, 8, 19, 11, 22, 'X');                 // 4 tall: no abilities
    fill(g, 30, 16, 33, 22, 'X');                // 7 tall: wings
    fill(g, 60, 11, 63, 22, 'X');                // 12 tall: unreachable, even with grip
    G.World.defineRoom({ id: 'fx_climb', region: 'test', dev: true, name: 'Fixture — glazed blocks', gx: 64, gy: 1899, tiles: lines(g) });
  }

  // ---------------------------------------------------------------- fx_dive
  {
    const g = grid(64, 27);
    fill(g, 1, 1, 62, 13, '.');                  // air; floor top row 14
    fill(g, 0, 11, 0, 13, '.');                  // W1 rows 11-13
    fill(g, 30, 14, 35, 15, 'D');                // cracked dive floor over the chamber
    fill(g, 28, 16, 37, 24, '.');                // sealed chamber (floor top row 25)
    fill(g, 29, 21, 31, 21, '=');                // a way back up once the D floor is broken
    fill(g, 33, 18, 35, 18, '=');
    fill(g, 45, 9, 46, 13, 'B');                 // breakable wall …
    fill(g, 47, 9, 55, 13, '.');                 // … hiding an alcove
    fill(g, 47, 8, 55, 8, '#');
    fill(g, 56, 8, 62, 13, '#');
    G.World.defineRoom({ id: 'fx_dive', region: 'test', dev: true, name: 'Fixture — dive floor & breakable', gx: 160, gy: 1899, tiles: lines(g),
      legend: {}, entities: [{ type: 'geode', id: 'fx_geo_b', x: 51, y: 13 }] });
  }

  // ---------------------------------------------------------------- fx_big
  {
    const g = grid(64, 36);
    fill(g, 1, 1, 62, 32, '.');                  // air; floor top row 33
    fill(g, 0, 30, 0, 32, '.');                  // W1 rows 30-32
    fill(g, 30, 0, 33, 0, '.');                  // N1 cols 30-33
    fill(g, 63, 8, 63, 10, '.');                 // E1 rows 8-10 on a high ledge
    fill(g, 52, 11, 62, 12, '#');                // the E ledge (top row 11)
    fill(g, 50, 12, 51, 28, '#');                // grippable climbing wall under the ledge; walk under it (rows 29-32)
    fill(g, 22, 33, 26, 34, '~');                // small pool (5 wide)
    fill(g, 36, 32, 40, 32, '^');                // spike strip
    fill(g, 44, 30, 45, 32, 'X');                // low glazed block (jump over)
    fill(g, 56, 29, 57, 32, 'B');                // breakable wall → secret alcove
    fill(g, 58, 28, 62, 28, '#');
    // one-way platform ladder up to N1 (tops 4 / 3 rows apart)
    for (const [r, c0, c1] of [[29, 8, 14], [25, 16, 22], [21, 8, 14], [17, 16, 22], [13, 24, 30], [10, 18, 24], [7, 22, 27], [4, 28, 35]]) fill(g, c0, r, c1, r, '=');
    G.World.defineRoom({ id: 'fx_big', region: 'test', dev: true, name: 'Fixture — big mixed room', gx: 224, gy: 1899, tiles: lines(g),
      entities: [{ type: 'geode', id: 'fx_geo1', x: 60, y: 32 }] });
  }

  // ---------------------------------------------------------------- fx_order
  {
    const g = grid(64, 27);
    fill(g, 1, 1, 62, 22, '.');                  // air; floor top row 23
    fill(g, 0, 20, 0, 22, '.');                  // W1 rows 20-22
    fill(g, 26, 19, 29, 22, 'X');                // 4-tall glazed step (no abilities)
    fill(g, 37, 16, 40, 22, '#');                // 7-tall grippable pillar, 7 columns beyond the step, 3 rows higher
    G.World.defineRoom({ id: 'fx_order', region: 'test', dev: true, name: 'Fixture — grip gate vs dash', gx: 288, gy: 1899, tiles: lines(g) });
  }
})();
