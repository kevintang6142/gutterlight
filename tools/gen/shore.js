#!/usr/bin/env node
// tools/gen/shore.js — builds the Ashen Shore rooms (sh_01..sh_04) with tools/lib/roomkit.js and emits
// src/data/regions/shore.js. Owner: region-shore_lastlight. Re-run after every change:
//   node tools/gen/shore.js [--print]
//
// The tutorial strip (design/world_plan.md "Ashen Shore"): every room teaches one thing by its layout.
//   sh_01  wake on the mound -> carving 1 (jump / hold to rise / drop through) -> 2-step, 4-tall rock,
//          then a broken pier whose far end butts against an undercut sea stack: the ONLY way on is to drop
//          through the planks (the lesson the Well in Lastlight relies on). Crack in the west cliff = secret.
//   sh_02  the first sconce on a dune crest -> carving 2 (strike / up / down-strike) -> two crawlers to practise
//          on; the petrified pillar at the east end is a grip promise (sh_hw1 on top), the road ducks under it.
//   sh_03  the Fallen Wick: walk in under the propped-up base of a colossal glazed candle, climb out through a
//          melted vent onto its flank and walk down to the buried wick; carving 3 (Kindle / rest / map) before
//          the thorn pit with ash flies. The crown (base end) is a wings promise: 7 tiles of glazed wax.
//   sh_04  Lastlight Road: lamp posts brightening toward the village; an optional dash gap from a rocky outcrop
//          to a ledge cantilevered off a glazed sea stack (sh_geo2).
'use strict';
const path = require('path');
const RK = require('../lib/roomkit');

// ---------------------------------------------------------------------------------------------------------
// small helpers
const decor = (r, kind, x, y, o = {}) => r.add(Object.assign({ type: 'decor', kind, x, y }, o));
const light = (r, x, y, rad, color, o = {}) => r.add(Object.assign({ type: 'light', x, y, r: rad, color }, o));
const enemy = (r, kind, x, y, o = {}) => r.add(Object.assign({ type: 'enemy', kind, x, y }, o));

// Fill a column range with a solid mass between per-column top/bottom rows (profile = [[col, top, bottom], ...]).
function mass(r, profile, ch = '#') {
  for (const [c, t, b] of profile) if (b >= t) r.fill(c, t, 1, b - t + 1, ch);
}

// =========================================================================================================
// sh_01 — Ashfall Strand (64x18). E1 rows 11-13. Ground top row 14.
function sh01() {
  const r = RK.room('sh_01');
  r.carve(6, 1, 57, 13);                       // the strand: air rows 1-13, ground rows 14-17
  // West: sheer ash cliff (cols 0-5, full height) with a lip leaning over the beach.
  r.fill(6, 1, 2, 4); r.fill(6, 5, 1, 3);
  // The first secret: a cracked section (B, cols 4-5, rows 11-13) hiding a 3x3 pocket with sh_geo1.
  r.carve(1, 11, 3, 3);
  r.fill(4, 11, 2, 3, 'B');
  // The ash mound the Wickling wakes on (cols 8-12, top row 13).
  r.fill(8, 13, 5, 1);
  // Lesson 1 (after the carving at col 18): a 2-tall step, then a 4-tall rock that needs a full (held) jump.
  r.fill(22, 12, 4, 2);                        // cols 22-25, top row 12
  r.fill(31, 10, 6, 4);                        // cols 31-36, top row 10
  r.fill(30, 13, 1, 1);                        // a little ash drift at the rock's foot
  // Lesson 1b: the broken pier (one-way planks, row 10) runs from the rock to the sea cliff (cols 46-63). Its face
  // is 6 tiles above the planks, so the only way on is DOWN through them, into the wave-cut cave under the cliff.
  r.platform(37, 10, 9);                       // cols 37-45
  mass(r, [
    [46, 4, 10], [47, 4, 10], [48, 4, 9], [49, 4, 8], [50, 3, 8], [51, 3, 8], [52, 3, 8], [53, 3, 8], [54, 3, 8],
    [55, 3, 8], [56, 2, 8], [57, 2, 8], [58, 2, 9], [59, 2, 10], [60, 1, 10], [61, 1, 10], [62, 1, 10],
  ]);
  r.fill(47, 3, 3, 1); r.fill(52, 2, 4, 1);    // a ragged crest on the cliff top
  r.fill(52, 13, 2, 1);                        // a hump of ash inside the cave
  r.fill(46, 13, 1, 1);                        // ...and a lip at its mouth: the crawler stays in the cave (cols 47-51),
                                               // so the drop through the pier never lands on it
  r.openExits();

  r.put(10, 12, { type: 'start' });
  r.put(18, 13, { type: 'lore', id: 'lore_sh_1' });
  r.put(2, 13, { type: 'geode', id: 'sh_geo1', amount: 45 });
  enemy(r, 'ash_crawler', 49, 13, { facing: 'right' });

  // dressing
  decor(r, 'rubble', 6, 13, { scale: 0.9 });               // crumbs at the foot of the cracked wall (hint)
  decor(r, 'reeds', 15, 13, { scale: 0.9 });
  decor(r, 'signpost', 13, 13);
  decor(r, 'grass_clump', 20, 13, { layer: 'front' });
  decor(r, 'wick_grave', 28, 13);
  decor(r, 'reeds', 26, 13, { scale: 0.8, flip: true });
  decor(r, 'wick_grave', 40, 13);          // under the pier, in the hollow
  decor(r, 'grass_clump', 43, 13, { layer: 'front', scale: 0.8 });
  decor(r, 'stalagmite', 56, 13, { scale: 0.7, dim: 0.3 });
  decor(r, 'grass_clump', 60, 13, { layer: 'front' });
  return r.toDef({ theme: { bg: 'sky' }, bgSeed: 1 });
}

// =========================================================================================================
// sh_02 — Cinder Dunes (64x18). W1/E1 rows 11-13. Ground top row 14.
function sh02() {
  const r = RK.room('sh_02');
  r.carve(1, 1, 62, 13);
  // West: the cave from sh_01 opens onto the dunes (the cliff continues across the seam).
  mass(r, [[1, 1, 10], [2, 1, 10], [3, 2, 10], [4, 2, 9], [5, 3, 8], [6, 4, 6]]);
  // rolling dunes
  r.fill(9, 13, 3, 1);
  r.fill(15, 13, 10, 1);                       // the crest (cols 15-24) with the first sconce
  r.fill(17, 12, 6, 1);                        // crest top row 12 (cols 17-22)
  r.fill(33, 13, 2, 1);
  r.fill(42, 13, 2, 1);
  // GRIP GATE: the petrified-ash pillar (west face col 52, rows 4-11: 8 sheer tiles, no footholds). The road
  // ducks under it through a hollow in the dunes (floor dips to row 16 under the pillar, cols 52-58).
  r.fill(52, 4, 11, 7);                        // cols 52-62, rows 4-10
  r.fill(52, 11, 7, 1);                        // the pillar's foot reaches row 11 over the dip (cols 52-58)
  r.carve(52, 14, 7, 2);                       // the dip: floor top row 16 under the pillar
  mass(r, [[59, 3, 3], [60, 2, 3], [61, 1, 3], [62, 1, 3]]);   // the ridge climbs to the room edge
  r.openExits();

  r.put(20, 11, { type: 'sconce', id: 'sh_sconce_a' });
  r.put(28, 13, { type: 'lore', id: 'lore_sh_2' });
  r.put(54, 3, { type: 'pickup', item: 'heartwax', id: 'sh_hw1' });
  enemy(r, 'ash_crawler', 37, 13, { facing: 'left' });
  enemy(r, 'ash_crawler', 47, 13, { facing: 'right' });
  enemy(r, 'ash_fly', 45, 7);

  light(r, 20, 10, 5, '#ffcf8a', { intensity: 0.5, flicker: true });
  decor(r, 'wick_grave', 13, 13);
  decor(r, 'wick_grave', 25, 13, { scale: 0.9 });
  decor(r, 'candle_cluster', 23, 12, { lit: false });
  decor(r, 'column_broken', 31, 13, { dim: 0.35, h: 90 });
  decor(r, 'grass_clump', 8, 13, { layer: 'front' });
  decor(r, 'grass_clump', 35, 13, { layer: 'front' });
  decor(r, 'reeds', 49, 13);
  decor(r, 'stalagmite', 56, 15, { scale: 0.8, dim: 0.3 });
  return r.toDef({ theme: { bg: 'sky' }, bgSeed: 2 });
}

// =========================================================================================================
// sh_03 — The Fallen Wick (64x27). W1/E1 rows 20-22. Ground top row 23.
function topOf(c) {             // the candle flank: 1-tile steps descending east from row 15 to row 22
  if (c <= 16) return 15;
  if (c <= 28) return 16 + Math.floor((c - 17) / 4);
  if (c <= 36) return 19;      // a long step (cols 29-36) carrying the thorn strip with 3 safe tiles on each side
  return Math.min(22, 20 + Math.floor((c - 37) / 4));
}
function sh03() {
  const r = RK.room('sh_03');
  r.carve(1, 1, 62, 22);                       // air rows 1-22, ground rows 23-26
  // West: an ash cliff the candle's base end leans on.
  mass(r, [[1, 2, 18], [2, 4, 18]]);
  // The crown (the candle's flat base end): glazed wax, top row 8, propped over the hollow (rows 19-22).
  r.fill(3, 8, 10, 11, 'X');                   // cols 3-12, rows 8-18
  r.carve(6, 8, 3, 1);                         // the dead wick-cup (cols 6-8, floor row 9)
  // The body: a glazed band (4 thick) lying on the dunes, descending east to the buried wick end at col ~44.
  for (let c = 13; c <= 44; c++) {
    const t = topOf(c), b = Math.min(22, t + 3);
    r.fill(c, t, 1, b - t + 1, 'X');
    if (22 - b <= 1 && b < 22) r.fill(c, b + 1, 1, 22 - b, '#');   // ash drifted under the low end
  }
  // The melted vent through the flank (cols 19-23) and the ash mound under it inside the hollow.
  for (let c = 19; c <= 23; c++) { const t = topOf(c); r.carve(c, t, 1, t + 3 - t + 1); }
  r.fill(19, 22, 1, 1);                        // step (top row 22)
  r.fill(20, 21, 4, 2);                        // mound (cols 20-23, top row 21)
  r.fill(24, 21, 1, 2);                        // close the crawl nook under col 24
  // The wick end sinks into an ash dune.
  mass(r, [[43, 21, 22], [44, 20, 22], [45, 21, 22], [46, 21, 22], [47, 22, 22]]);
  // ...and its black wick still pokes out of the ash at the very end: a thin stub to hop over (3 up either side).
  r.fill(45, 18, 1, 3);
  // A short thorn strip on the candle's flank (cols 32-33 in the middle of the long row-19 step).
  r.fill(32, 18, 2, 1, '^');
  // The thorn pit (cols 51-55, 2 deep, thorns at the bottom).
  r.carve(51, 23, 5, 2);
  r.fill(51, 25, 5, 1, '^');
  // East: the dune cliff over the road out (passage rows 20-22).
  mass(r, [[57, 13, 18], [58, 9, 19], [59, 6, 19], [60, 4, 19], [61, 1, 19], [62, 1, 19]]);
  r.openExits();

  r.put(7, 8, { type: 'pickup', item: 'sigil', sigil: 'heartwax', id: 'sh_sig_heartwax' });
  r.put(48, 22, { type: 'lore', id: 'lore_sh_3' });
  // hazard respawn points a few tiles back from the thorns (the motor alone would respawn on the pit lip / 2 tiles
  // from the strip, so a held direction walks straight back in)
  r.add({ type: 'respawn', x: 48, y: 22, w: 5, h: 3 });
  r.add({ type: 'respawn', x: 58, y: 22, w: 5, h: 3 });
  r.add({ type: 'respawn', x: 29, y: 18, w: 3, h: 3 });
  r.add({ type: 'respawn', x: 36, y: 18, w: 3, h: 3 });
  enemy(r, 'ash_crawler', 39, 19, { facing: 'right' });
  enemy(r, 'ash_fly', 53, 18);
  enemy(r, 'ash_fly', 46, 14);

  // wax that dripped off the propped-up base has grown into pale stalagmites in the hollow beneath it
  decor(r, 'stalagmite', 6, 22, { h: 50, dim: 0.1 });
  decor(r, 'stalagmite', 14, 22, { h: 40, dim: 0.1 });
  for (const [c, row] of [[5, 19], [10, 19], [14, 19], [17, 20]]) decor(r, 'drip', c, row, { color: '#e8dcc4', fall: 150 });
  decor(r, 'reeds', 3, 22, { scale: 0.9 });
  decor(r, 'wick_grave', 10, 22);
  decor(r, 'rubble', 16, 22, { scale: 0.8 });
  decor(r, 'grass_clump', 58, 22, { layer: 'front' });
  decor(r, 'reeds', 61, 22, { scale: 0.9 });
  decor(r, 'column_broken', 50, 22, { dim: 0.4, h: 80 });
  return r.toDef({ theme: { bg: 'sky', decor: false, landmark: false }, bgSeed: 3 });   // the real Fallen Wick: no horizon copy
}

// =========================================================================================================
// sh_04 — Lastlight Road (64x18). W1/E1 rows 11-13. Ground top row 14.
function sh04() {
  const r = RK.room('sh_04');
  r.carve(1, 1, 62, 13);
  // West: the dune cliff from sh_03 (the road comes out from under it).
  mass(r, [[1, 1, 10], [2, 1, 10], [3, 3, 9], [4, 5, 8]]);
  // The rocky outcrop: two 3-tile steps to a flat top at row 8 (cols 16-21). Coming back from the village the road
  // climbs it from the east over a low boulder (cols 22-23) that sits well below the dash gap.
  r.fill(16, 11, 3, 3);
  r.fill(19, 8, 3, 6);
  r.fill(22, 11, 2, 3);
  // DASH GATE: 10-tile gap (cols 22-31) to a glazed ledge (cols 32-36, top row 8) cantilevered off a glazed sea
  // stack that rises out of sight (cols 37-40); the road passes under both.
  r.fill(32, 8, 5, 2, 'X');
  r.fill(37, 1, 4, 9, 'X');
  r.fill(41, 1, 1, 3, 'X');
  r.fill(30, 13, 1, 1);
  r.fill(45, 13, 3, 1);
  r.fill(56, 13, 2, 1);                        // an ash drift: keeps the east crawler away from the E1 doorway
  // East: the village's outer wall over the road (continues in ll_01).
  mass(r, [[59, 3, 8], [60, 1, 10], [61, 1, 10], [62, 1, 10]]);
  r.openExits();

  r.put(34, 7, { type: 'geode', id: 'sh_geo2', amount: 80 });
  enemy(r, 'ash_crawler', 29, 13, { facing: 'left' });
  enemy(r, 'ash_crawler', 52, 13, { facing: 'right' });
  enemy(r, 'ash_fly', 46, 8);

  // lamp posts every ~8 cols: snuffed and half-buried in the west, lit nearer the village
  decor(r, 'lamp_post', 7, 13, { lit: false, h: 90 });
  decor(r, 'lamp_post', 13, 13, { lit: false, h: 104 });
  decor(r, 'lamp_post', 28, 13, { lit: false, h: 112 });
  decor(r, 'lamp_post', 43, 13, { lit: true, h: 118 });
  decor(r, 'lamp_post', 50, 13, { lit: true, h: 118 });
  decor(r, 'lamp_post', 58, 13, { lit: true, h: 118 });
  light(r, 61, 11, 10, '#ffb868', { intensity: 0.35 });
  decor(r, 'signpost', 55, 13, { flip: true });
  decor(r, 'rubble', 26, 13);
  decor(r, 'wick_grave', 10, 13);
  decor(r, 'grass_clump', 34, 13, { layer: 'front' });
  decor(r, 'grass_clump', 48, 13, { layer: 'front' });
  return r.toDef({ theme: { bg: 'sky' }, bgSeed: 4 });
}

// =========================================================================================================
const defs = [sh01(), sh02(), sh03(), sh04()];
const out = RK.emit('shore', defs, 'src/data/regions/shore.js', 'Ashen Shore rooms (sh_01..sh_04)');
console.log('wrote ' + path.relative(path.resolve(__dirname, '../..'), out));
if (process.argv.includes('--print')) for (const d of defs) console.log('\n' + d.id + '\n' + d.tiles.join('\n'));
