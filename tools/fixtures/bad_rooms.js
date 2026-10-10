// tools/fixtures/bad_rooms.js — FIXTURE: dev rooms (region 'test') with planted data defects. Loaded only by
// tools/fixtures/selftest.js (`node tools/validate.js --dev --no-plan --data tools/fixtures/bad_rooms.js`),
// never by the game. Each room's comment lists the defects validate.js must report.
// Global placement: gy >= 1800, far away from the real world and from src/data/test_rooms.js.
(function () {
  'use strict';
  const G = globalThis.G;
  const row = (s, n) => s.repeat(n);
  const box = (w, h, inner) => {
    const t = [];
    for (let r = 0; r < h; r++) t.push(r === 0 || r === h - 1 ? row('#', w) : '#' + row(inner || '.', w - 2) + '#');
    return t;
  };
  const set = (t, c, r, s) => { t[r] = t[r].slice(0, c) + s + t[r].slice(c + s.length); };

  // fx_bad1: ragged row (row 8 one char short), unknown char '?', marker without legend ('q'),
  // unused legend key 'z', a corner opening (0,0), an opening (E rows 4-6) with no neighbour,
  // gx not on the 16-grid.
  {
    const t = box(32, 18);
    for (let r = 14; r < 17; r++) t[r] = '#' + row('#', 30) + '#';
    t[8] = t[8].slice(0, 31);
    set(t, 10, 13, '?');
    set(t, 12, 13, 'q');
    set(t, 0, 0, '.');
    for (let r = 4; r <= 6; r++) set(t, 31, r, '.');
    G.World.defineRoom({ id: 'fx_bad1', region: 'test', dev: true, gx: 3, gy: 1800, tiles: t, legend: { z: { type: 'light' } } });
  }

  // fx_bad2: width 40 (not a multiple of 16), floating lava, lava next to water, entity errors:
  // unknown type, sconce without id, lore id missing from G.Text, npc without text, shrine with a bad ability,
  // sigil pickup with an unknown sigil, gate with an unparsable condition, arena with an unknown boss and a
  // trigger outside the room, sconce embedded in rock, a lanternway with no floor, unknown enemy kind.
  {
    const t = box(40, 18);
    for (let r = 14; r < 17; r++) t[r] = '#' + row('#', 38) + '#';
    set(t, 5, 8, '%%%');                       // floating lava (air below, air beside)
    set(t, 20, 14, '~~~%%%');                  // water touching lava in the floor
    G.World.defineRoom({ id: 'fx_bad2', region: 'test', dev: true, gx: 0, gy: 1818, tiles: t, entities: [
      { type: 'teleporter', x: 2, y: 13 },
      { type: 'sconce', x: 4, y: 13 },
      { type: 'lore', id: 'lore_nope_1', x: 6, y: 13 },
      { type: 'npc', npc: 'wren', stage: 9, x: 8, y: 13 },
      { type: 'shrine', ability: 'teleport', x: 10, y: 13 },
      { type: 'pickup', id: 'fx_sig', item: 'sigil', sigil: 'no_such_sigil', x: 12, y: 13 },
      { type: 'gate', id: 'fx_gate', opens: 'lever:fx_nolever & ??', x: 14, y: 13 },
      { type: 'arena', boss: 'dragon', bx: 20, by: 13, trigger: [0, 0, 99, 17], x: 16, y: 13 },
      { type: 'sconce', id: 'fx_sconce_rock', x: 18, y: 15 },
      { type: 'lanternway', id: 'guttered', x: 30, y: 5 },
      { type: 'enemy', kind: 'space_goblin', x: 32, y: 13 },
    ] });
  }

  // fx_bad3 / fx_bad4: neighbours whose openings do not line up (fx_bad3 E rows 12-14, fx_bad4 W rows 13-14),
  // fx_bad5 overlapping fx_bad4 (and defined a second time), one pickup id used in two rooms.
  {
    const a = box(32, 18), b = box(32, 18);
    for (let r = 15; r < 17; r++) { a[r] = row('#', 32); b[r] = row('#', 32); }
    for (let r = 12; r <= 14; r++) set(a, 31, r, '.');
    for (let r = 12; r <= 14; r++) set(a, 30, r, '.');
    for (let r = 13; r <= 14; r++) set(b, 0, r, '.');
    // the same pickup id in two rooms (world mode: duplicate ids), and fx_bad5 defined twice
    G.World.defineRoom({ id: 'fx_bad3', region: 'test', dev: true, gx: 64, gy: 1800, tiles: a, entities: [{ type: 'pickup', id: 'fx_dup', item: 'urn', x: 5, y: 14 }] });
    G.World.defineRoom({ id: 'fx_bad4', region: 'test', dev: true, gx: 96, gy: 1800, tiles: b, entities: [{ type: 'pickup', id: 'fx_dup', item: 'urn', x: 5, y: 14 }] });
    G.World.defineRoom({ id: 'fx_bad5', region: 'test', dev: true, gx: 112, gy: 1809, tiles: box(32, 18) });
    G.World.defineRoom({ id: 'fx_bad5', region: 'test', dev: true, gx: 400, gy: 1809, tiles: box(32, 18) });
  }
})();
