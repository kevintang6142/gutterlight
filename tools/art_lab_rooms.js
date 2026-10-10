// tools/art_lab_rooms.js — sample rooms for the art lab (tools/art_lab.html). Every tile type
// (SOLID, GLAZED, PLATFORM, SPIKES, WATER, LAVA, BREAKABLE, DIVEFLOOR, BGWALL) and a variety of
// shapes (caves, shafts, ledges, ceilings, pillars, open halls, low tunnels, surface).
// Rooms are generated with small carving helpers so pools are always flat-topped.
(function () {
  'use strict';
  function grid(cols, rows, ch) { return Array.from({ length: rows }, () => Array(cols).fill(ch || '#')); }
  function rect(g, x, y, w, h, ch) {
    for (let r = y; r < y + h; r++) for (let c = x; c < x + w; c++) if (r >= 0 && r < g.length && c >= 0 && c < g[0].length) g[r][c] = ch;
  }
  function ellipse(g, cx, cy, rx, ry, ch) {
    for (let r = Math.floor(cy - ry); r <= Math.ceil(cy + ry); r++) for (let c = Math.floor(cx - rx); c <= Math.ceil(cx + rx); c++) {
      const dx = (c + 0.5 - cx) / rx, dy = (r + 0.5 - cy) / ry;
      if (dx * dx + dy * dy <= 1 && r >= 0 && r < g.length && c >= 0 && c < g[0].length) g[r][c] = ch;
    }
  }
  function set(g, x, y, ch) { if (y >= 0 && y < g.length && x >= 0 && x < g[0].length) g[y][x] = ch; }
  // ceiling roughness: lower the ceiling by a deterministic noise per column within [x0,x1)
  function roughCeil(g, x0, x1, top, amp, seed) {
    for (let c = x0; c < x1; c++) {
      const n = Math.abs(Math.sin(c * 0.73 + seed) * Math.cos(c * 0.31 + seed * 2));
      const d = Math.round(n * amp);
      rect(g, c, top, 1, d, '#');
    }
  }
  const str = (g) => g.map((r) => r.join(''));

  // ---- Room A: great hall (64 x 27) --------------------------------------------------------------
  function hall() {
    const g = grid(64, 27);
    ellipse(g, 32, 14, 31, 11, '.');
    rect(g, 3, 6, 58, 17, '.');
    rect(g, 0, 0, 64, 4, '#');
    roughCeil(g, 3, 61, 4, 3, 1.7);
    rect(g, 3, 23, 58, 4, '#');              // floor
    rect(g, 0, 15, 3, 3, '.');               // west exit (rows 15-17), floor at 18
    rect(g, 3, 18, 6, 5, '#');               // west floor shelf
    // water basin (flat top at row 20, air above)
    rect(g, 9, 20, 12, 3, '#'); rect(g, 10, 20, 10, 3, '~');
    // rock outcrop with overhang and hanging spikes beneath
    ellipse(g, 26, 12, 6, 3.2, '#'); rect(g, 22, 12, 9, 2, '#');
    rect(g, 24, 15, 4, 1, '^');
    // pillar arch with a spiked gap
    rect(g, 34, 8, 2, 15, '#'); rect(g, 38, 8, 2, 15, '#'); rect(g, 34, 8, 6, 2, '#');
    rect(g, 36, 22, 2, 1, '^');
    // spikes bed on the floor
    rect(g, 41, 22, 4, 1, '^');
    // glazed wall (cannot grip)
    rect(g, 46, 9, 2, 14, 'X');
    // block with a breakable wall hiding the passage to the east exit
    rect(g, 52, 12, 9, 11, '#'); rect(g, 54, 18, 7, 3, '.'); rect(g, 52, 18, 2, 3, 'B');
    rect(g, 61, 18, 3, 3, '.');              // east exit (rows 18-20)
    // background wall region
    rect(g, 49, 6, 11, 6, ':'); rect(g, 48, 12, 3, 6, ':');
    // cracked dive floor over a hidden cavity
    rect(g, 24, 23, 6, 1, 'D'); rect(g, 22, 24, 10, 2, '.');
    // one-way platforms
    rect(g, 8, 10, 5, 1, '='); rect(g, 15, 16, 4, 1, '='); rect(g, 42, 15, 3, 1, '='); rect(g, 56, 8, 4, 1, '=');
    return str(g);
  }

  // ---- Room B: vertical shaft (32 x 45) with lava at the bottom -----------------------------------
  function shaft() {
    const g = grid(32, 45);
    rect(g, 6, 2, 20, 41, '.');              // open cols 6..25, rows 2..42
    rect(g, 14, 0, 4, 2, '.');               // top exit
    rect(g, 0, 20, 6, 3, '.');               // west exit rows 20-22
    rect(g, 6, 4, 2, 14, 'X');               // glazed wall section
    rect(g, 18, 8, 8, 2, '#');               // east ledge
    rect(g, 8, 14, 5, 1, '=');
    rect(g, 19, 19, 7, 1, '=');
    rect(g, 6, 23, 8, 2, '#');               // west ledge (floor of the exit)
    rect(g, 16, 29, 5, 1, '=');
    rect(g, 22, 33, 4, 3, '#');
    rect(g, 25, 12, 1, 3, '^');              // wall spikes pointing left
    rect(g, 6, 30, 1, 3, '^');               // wall spikes pointing right
    rect(g, 6, 37, 2, 6, '#'); rect(g, 24, 37, 2, 6, '#');
    rect(g, 8, 39, 16, 4, '%');              // lava pool (flat top at row 39)
    rect(g, 12, 36, 2, 7, '#'); rect(g, 18, 35, 2, 8, '#');   // stone columns out of the lava
    return str(g);
  }

  // ---- Room C: low flooded tunnel (48 x 18) --------------------------------------------------------
  function tunnel() {
    const g = grid(48, 18);
    rect(g, 2, 4, 44, 11, '.');
    roughCeil(g, 2, 46, 4, 2, 4.1);
    rect(g, 0, 10, 2, 3, '.'); rect(g, 46, 6, 2, 3, '.');
    rect(g, 0, 13, 2, 5, '#'); rect(g, 46, 9, 2, 9, '#');
    // floor & low ceiling flooded section
    rect(g, 2, 13, 44, 5, '#');
    rect(g, 14, 4, 18, 4, '#');                                   // low ceiling
    rect(g, 13, 11, 20, 2, '~'); rect(g, 13, 13, 20, 2, '~');      // pool rows 11-14 (top row 11 → air rows 8-10)
    rect(g, 12, 11, 1, 4, '#'); rect(g, 33, 11, 1, 4, '#');
    // ceiling spikes (down) and a dive floor
    rect(g, 35, 4, 6, 2, '#'); rect(g, 36, 6, 4, 1, '^');           // ceiling spikes pointing down
    rect(g, 5, 13, 4, 1, 'D'); rect(g, 4, 14, 6, 2, '.');
    rect(g, 38, 9, 4, 1, '=');
    // bg wall alcove
    rect(g, 40, 5, 5, 4, ':');
    return str(g);
  }

  // ---- Room D: surface (64 x 18), open top (row 0 is an invisible lid) ----------------------------
  function surface() {
    const g = grid(64, 18, '.');
    rect(g, 0, 0, 64, 1, '#');                                     // lid (renders as sky with theme.openTop)
    for (let c = 0; c < 64; c++) {
      const h = Math.round(3 + Math.sin(c * 0.17) * 1.4 + Math.sin(c * 0.41 + 1) * 0.8);
      rect(g, c, 18 - h, 1, h, '#');
    }
    rect(g, 0, 10, 1, 4, '.'); rect(g, 63, 10, 1, 4, '.');          // side exits
    rect(g, 18, 13, 9, 5, '#'); rect(g, 19, 13, 7, 1, '~'); rect(g, 19, 14, 7, 1, '~');  // small pond (rows 13-14)
    rect(g, 18, 12, 1, 1, '.'); rect(g, 26, 12, 1, 1, '.');
    rect(g, 34, 9, 6, 6, '#'); rect(g, 35, 8, 4, 1, '#');           // rock with a ledge
    rect(g, 44, 10, 4, 1, '=');
    rect(g, 50, 13, 3, 1, '^');
    rect(g, 8, 8, 3, 1, '=');
    return str(g);
  }

  // Ensure no stray markers & that rows are equal length.
  function check(id, rows) {
    const w = rows[0].length;
    for (const r of rows) if (r.length !== w) throw new Error('lab room ' + id + ' ragged');
    return rows;
  }

  globalThis.ART_LAB_ROOMS = [
    { id: 'lab_hall', tiles: check('hall', hall()), cams: [[0, 280, 6, 17], [1280, 360, 50, 22], [640, 200, 30, 22]] },
    { id: 'lab_shaft', tiles: check('shaft', shaft()), cams: [[0, 720, 10, 23], [0, 1080, 15, 34]] },
    { id: 'lab_tunnel', tiles: check('tunnel', tunnel()), cams: [[0, 0, 6, 12], [640, 0, 36, 12]] },
    { id: 'lab_surface', tiles: check('surface', surface()), theme: { bg: 'sky' }, cams: [[0, 0, 12, 13], [1280, 0, 46, 9]] },
  ];
})();
