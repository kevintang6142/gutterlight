#!/usr/bin/env node
// tools/gen/lastlight.js — builds the Lastlight rooms (ll_01..ll_03) with tools/lib/roomkit.js and emits
// src/data/regions/lastlight.js. Owner: region-shore_lastlight. Re-run after every change:
//   node tools/gen/lastlight.js [--print]
//
// The hub village (design/world_plan.md "Lastlight"): safe, warm, no enemies, no hazards.
//   ll_01  Lastlight Gate: the village gate arch between two candle-stub towers, Quill at her map table, the
//          founding stone, and the gatehouse stair whose cracked east face hides a crawlspace cellar (ll_geo1).
//   ll_02  The Last Brazier: the square. The Well (S1) is a stone basin with a plank hatch over the shaft — you
//          drop through it ({down}+{jump}, taught by the pier in sh_01); climbing out of the Well you rise through
//          the hatch and land on it. Thrum by the Brazier, the home sconce, Pell under his awning, the Lanternway
//          post by the east road; stilt houses with plank decks to climb around on for fun.
//   ll_03  Wickwright's Row: Bramm's forge under a lean-to, the smith-guild plaque, the forge chimney carried over
//          the street on a stone arch (grip promise, ll_geo2 on its cap), and the covered road east toward the Flue
//          shortcut gate (in sf_01).
// Stilt houses / Pell's awning: the art draws stilts under free deck ends in sky rooms (terrain platPosts).
'use strict';
const path = require('path');
const RK = require('../lib/roomkit');

const decor = (r, kind, x, y, o = {}) => r.add(Object.assign({ type: 'decor', kind, x, y }, o));
const light = (r, x, y, rad, color, o = {}) => r.add(Object.assign({ type: 'light', x, y, r: rad, color }, o));
function mass(r, profile, ch = '#') {
  for (const [c, t, b] of profile) if (b >= t) r.fill(c, t, 1, b - t + 1, ch);
}
const WARM = '#ffb868';

// =========================================================================================================
// ll_01 — Lastlight Gate (64x18). W1/E1 rows 11-13. Ground top row 14.
function ll01() {
  const r = RK.room('ll_01');
  r.carve(1, 1, 62, 13);
  // West: the outer wall over the road (continues from sh_04).
  mass(r, [[1, 1, 10], [2, 1, 10], [3, 3, 9], [4, 5, 8]]);
  // The gatehouse stair (cols 44-58): steps up from the west, a deck at row 11; its cracked east face (B, col 58,
  // rows 12-13) hides a 2-tall crawlspace cellar (cols 51-57) with ll_geo1.
  r.fill(44, 13, 1, 1);
  r.fill(45, 12, 1, 2);
  r.fill(46, 11, 13, 3);                       // cols 46-58, rows 11-13
  r.carve(51, 12, 7, 2);                       // the cellar
  r.fill(58, 12, 1, 2, 'B');
  // East: a tall house built over the road into the square (continues in ll_02).
  mass(r, [[60, 5, 8], [61, 1, 10], [62, 1, 10]]);
  r.openExits();

  r.put(22, 13, { type: 'npc', npc: 'quill' });
  r.put(34, 13, { type: 'lore', id: 'lore_ll_1' });
  r.put(53, 13, { type: 'geode', id: 'll_geo1', amount: 60 });

  // the gate: an arch between two leaning candle-stub towers
  decor(r, 'house_stub', 6, 13, { scale: 1.45, variant: 2, dim: 0.15 });
  decor(r, 'arch', 10, 13, { scale: 1.1 });
  decor(r, 'house_stub', 14, 13, { scale: 1.6, variant: 1, dim: 0.15, flip: true });
  // Quill's stall: lamp post, map table (crates) and ink pots
  decor(r, 'lamp_post', 20, 13, { h: 112 });
  decor(r, 'crate', 24, 13);
  decor(r, 'candle_cluster', 25, 13, { count: 3 });
  decor(r, 'bookshelf', 27, 13, { dim: 0.3 });
  // the founding stone
  decor(r, 'candelabra', 32, 13);
  decor(r, 'candelabra', 36, 13, { flip: true });
  decor(r, 'grass_clump', 30, 13, { layer: 'front' });
  decor(r, 'grass_clump', 40, 13, { layer: 'front' });
  // the gatehouse
  decor(r, 'house_stub', 50, 10, { variant: 0 });
  decor(r, 'lamp_post', 56, 10, { h: 100 });
  decor(r, 'rubble', 60, 13, { scale: 0.7 });              // crumbs under the cracked face (hint)
  decor(r, 'lantern_hanging', 61, 11, { len: 20 });
  light(r, 61, 12, 4, WARM, { intensity: 0.5, flicker: true });
  return r.toDef({ theme: { bg: 'sky', decor: false, landmark: false }, bgSeed: 11 });   // landmark:false: no parallax Last Brazier
}

// =========================================================================================================
// ll_02 — The Last Brazier (96x27). W1/E1 rows 20-22, S1 cols 14-17. Floor top row 23.
function ll02() {
  const r = RK.room('ll_02');
  r.carve(1, 1, 94, 22);                       // dusk sky + square: air rows 1-22, floor rows 23-26
  // West: the house over the road from ll_01.
  mass(r, [[1, 10, 19], [2, 10, 19], [3, 11, 19], [4, 13, 18]]);
  // THE WELL: the square dips into a 2-deep stone basin (ring floor top row 25, cols 10-21) around the shaft
  // (cols 14-17, open to S1). A one-way plank hatch (row 25) covers the shaft: drop through it to go down; rising
  // out of the Well you pass up through it and land on it, then hop 2 up to the square.
  r.carve(10, 23, 12, 2);
  r.carve(14, 25, 4, 2);
  r.platform(14, 25, 4);
  // The Last Brazier's stone dais (cols 43-51, 1 tile).
  r.fill(43, 22, 9, 1);
  // Stilt houses with plank decks (one-way) to climb around on — west cluster
  r.platform(25, 19, 6);                       // deck 1 (cols 25-30, row 19)
  r.platform(32, 15, 6);                       // deck 2 (cols 32-37, row 15)
  r.platform(25, 11, 5);                       // the lookout (cols 25-29, row 11)
  // Pell's awning (cols 61-67, row 19) and the east cluster
  r.platform(61, 19, 7);
  r.platform(70, 16, 5);                       // deck (cols 70-74, row 16)
  r.platform(84, 19, 5);                       // deck (cols 84-88, row 19)
  // East: the house over the road to ll_03.
  mass(r, [[91, 13, 18], [92, 11, 19], [93, 10, 19], [94, 10, 19]]);
  r.openExits();

  r.put(41, 22, { type: 'npc', npc: 'thrum' });
  r.put(55, 22, { type: 'sconce', id: 'll_sconce_a' });
  r.put(64, 22, { type: 'npc', npc: 'pell' });
  r.put(78, 22, { type: 'lanternway', id: 'lastlight' });

  // the Well
  decor(r, 'well_frame', 15, 24, { scale: 1.35 });
  decor(r, 'lamp_post', 8, 22, { h: 118 });
  decor(r, 'signpost', 23, 22);
  // the west houses
  decor(r, 'house_stub', 27, 18, { variant: 0 });
  decor(r, 'house_stub', 34, 14, { variant: 1, flip: true });
  decor(r, 'house_stub', 30, 22, { variant: 2, scale: 1.15, dim: 0.2 });
  decor(r, 'bell_small', 26, 11, { len: 26 });             // hangs under the lookout planks
  decor(r, 'lantern_hanging', 28, 11, { len: 18 });
  decor(r, 'crate', 36, 22);
  // the Last Brazier
  decor(r, 'brazier', 47, 21, { scale: 3.2 });
  light(r, 47, 17, 9, '#ffa040', { intensity: 0.85, flicker: true });
  decor(r, 'candle_cluster', 44, 21, { count: 4 });
  decor(r, 'candle_cluster', 51, 21, { count: 5 });
  // the sconce + Pell
  decor(r, 'cart', 59, 22);
  decor(r, 'crate', 67, 22);
  decor(r, 'crate', 67, 21, { variant: 1 });
  decor(r, 'lantern_hanging', 63, 20, { len: 10 });
  decor(r, 'lantern_hanging', 66, 20, { len: 10 });
  // the east houses
  decor(r, 'house_stub', 72, 15, { variant: 2 });
  decor(r, 'house_stub', 86, 18, { variant: 0, flip: true });
  decor(r, 'house_stub', 73, 22, { variant: 1, scale: 1.2, dim: 0.2 });
  decor(r, 'lamp_post', 81, 22, { h: 118 });
  decor(r, 'grass_clump', 6, 22, { layer: 'front' });
  decor(r, 'grass_clump', 39, 22, { layer: 'front' });
  decor(r, 'grass_clump', 86, 22, { layer: 'front' });
  return r.toDef({ theme: { bg: 'sky', decor: false, landmark: false }, bgSeed: 12 });   // the real brazier stands here
}

// =========================================================================================================
// ll_03 — Wickwright's Row (64x18). W1/E1 rows 11-13. Ground top row 14.
function ll03() {
  const r = RK.room('ll_03');
  r.carve(1, 1, 62, 13);
  // West: the house over the road from ll_02.
  mass(r, [[1, 1, 10], [2, 1, 10], [3, 2, 9], [4, 4, 7]]);
  // Bramm's lean-to roof (one-way planks, row 10, cols 13-21). Its east end must stay >= 3 cols short of col 24:
  // from a roof ending at col 24 a jump + dash reaches ll_geo2 without grip (measured with reach_core).
  r.platform(13, 10, 9);
  // GRIP REWARD: the forge chimney, a sheer brick stack (cols 36-38, rows 4-9) carried over the street on a stone
  // arch (decor below): the road runs on under it (air rows 10-13). Its west face is 6 sheer tiles above the
  // 4-tall archway, 10 above the street; nothing standable within dash range (the lean-to roof is low and far).
  r.fill(36, 4, 3, 6);
  // East: the road ducks under the first chimney-tops (air rows 10-13, ceiling row 9) toward the Flue gate.
  mass(r, [[55, 6, 8], [56, 3, 9], [57, 2, 9], [58, 1, 9], [59, 1, 9], [60, 1, 9], [61, 1, 9], [62, 1, 9]]);
  r.openExits();

  r.put(19, 13, { type: 'npc', npc: 'bramm' });
  r.put(30, 13, { type: 'lore', id: 'lore_ll_2' });
  r.put(37, 3, { type: 'geode', id: 'll_geo2', amount: 90 });

  decor(r, 'house_stub', 8, 13, { variant: 1, dim: 0.15 });
  decor(r, 'lamp_post', 12, 13, { h: 112 });
  // the forge
  decor(r, 'anvil', 21, 13);
  decor(r, 'grate_glow', 23, 13);
  light(r, 23, 12, 5, '#ff5a2a', { intensity: 0.8, flicker: true });
  decor(r, 'mold_stack', 14, 13);
  decor(r, 'chain', 15, 11, { len: 60, hook: true });
  decor(r, 'chain', 17, 11, { len: 40, hook: true });
  decor(r, 'lantern_hanging', 20, 11, { len: 12 });
  decor(r, 'crate', 26, 13);
  // the arch carrying the chimney over the street (walk-through background architecture)
  decor(r, 'arch', 37, 13, { scale: 1.1, layer: 'back' });
  // the row
  decor(r, 'candelabra', 32, 13);
  decor(r, 'house_stub', 44, 13, { variant: 2 });
  decor(r, 'cart', 49, 13);
  decor(r, 'lamp_post', 53, 13, { h: 118 });
  decor(r, 'lantern_hanging', 58, 10, { len: 8 });
  decor(r, 'lantern_hanging', 61, 10, { len: 8 });
  light(r, 59, 11, 4, WARM, { intensity: 0.5 });
  decor(r, 'grass_clump', 28, 13, { layer: 'front' });
  decor(r, 'grass_clump', 46, 13, { layer: 'front' });
  return r.toDef({ theme: { bg: 'sky', decor: false, landmark: false }, bgSeed: 13 });   // landmark:false: no parallax Last Brazier
}

// =========================================================================================================
const defs = [ll01(), ll02(), ll03()];
const out = RK.emit('lastlight', defs, 'src/data/regions/lastlight.js', 'Lastlight rooms (ll_01..ll_03)');
console.log('wrote ' + path.relative(path.resolve(__dirname, '../..'), out));
if (process.argv.includes('--print')) for (const d of defs) console.log('\n' + d.id + '\n' + d.tiles.join('\n'));
