#!/usr/bin/env node
// tools/gen/arena_effigy.js — builds gw_05 "The Old Guard's Hall" (THE EFFIGY's arena) with tools/lib/roomkit.js,
// exactly per design/world_plan.json, and emits src/data/arenas/effigy.js. Owner: boss-effigy.
//   node tools/gen/arena_effigy.js [--print]
//
// Plan notes (gw_05): flat floor top row 15 across cols 1-62 (rows 15-17 solid); ceiling rows 0-2 with cracked
// stalactite clusters on row 3 (debris-fall spawn points); W1/E1 rows 12-14 with door alcoves (rows 11-14 open for
// 3 cols, solid header on row 10) holding gw_gate1 (col 2, opens boss:effigy) and the arena gate (col 61);
// arena: boss effigy, bx 18, by 14, trigger cols 26-50 rows 6-14; no platforms, no hazards.
'use strict';
const path = require('path');
const RK = require(path.join(__dirname, '..', 'lib', 'roomkit'));

function gw05() {
  const r = RK.room('gw_05');                    // 64x18 at gx 224, gy 45; W1/E1 rows 12-14
  // The hall: air rows 3-14 between the door frames (cols 4-59); the floor (rows 15-17) stays solid.
  r.carve(4, 3, 56, 12);
  // Door alcoves just inside both exits: rows 11-14 open for 3 cols under a solid header (row 10).
  r.carve(1, 11, 3, 4);
  r.carve(60, 11, 3, 4);
  r.openExits();
  // Cracked stalactite clusters hanging from the ceiling (row 3, a few reach row 4): the debris falls from here.
  // All stay >= 6 rows above anything the player can stand on; the Effigy's leap apex clears them.
  for (const [c, w, deep] of [[9, 2, 0], [16, 1, 1], [23, 2, 0], [31, 3, 1], [40, 2, 0], [47, 1, 1], [54, 2, 0]]) {
    r.fill(c, 3, w, 1);
    if (deep) r.fill(c + (w > 1 ? 1 : 0), 4, 1, 1);
  }
  // Corbels under the ceiling at the door frames (soften the corners above the alcoves).
  r.fill(4, 3, 1, 2); r.fill(59, 3, 1, 2);

  // ---- encounter
  r.put(2, 14, { type: 'gate', id: 'gw_gate1', opens: 'boss:effigy', w: 1, h: 4 });   // west: the way to Meltbloom
  r.put(61, 14, { type: 'arena_gate', id: 'gw_ag1', w: 1, h: 4, side: 'left' });        // east: shuts behind the player
  r.add({ type: 'arena', boss: 'effigy', bx: 18, by: 14, trigger: [26, 6, 50, 14], x: 38, y: 8 });
  // The landmark: the kneeling statue before the fight, its broken shell after (drawn by boss-effigy's event script).
  r.add({ type: 'event', script: 'effigy_statue', x: 18, y: 14, w: 3, h: 4, z: -3 });

  // ---- dressing (back layer only; nothing that reads as a ledge or a hazard)
  // the Old Guard's banners hang in a row under the vault
  for (const [c, len] of [[7, 120], [13, 150], [27, 120], [35, 150], [44, 120], [51, 150], [57, 120]]) {
    r.add({ type: 'decor', kind: 'banner', x: c, y: 3, len, color: '#5e3530', torn: true, layer: 'back' });
  }
  r.add({ type: 'decor', kind: 'chain', x: 20, y: 3, len: 190, layer: 'back' });
  r.add({ type: 'decor', kind: 'chain', x: 38, y: 3, len: 150, hook: true, layer: 'back' });
  // ranks of lesser Guard statues and broken columns along the back of the hall
  for (const [c, v, flip] of [[29, 0, true], [37, 2, true], [45, 0, true], [53, 1, true]]) {
    r.add({ type: 'decor', kind: 'statue_waxen', x: c, y: 14, variant: v, material: 'stone', flip, dim: 0.55, layer: 'back' });
  }
  r.add({ type: 'decor', kind: 'column_broken', x: 33, y: 14, h: 120, dim: 0.5, layer: 'back' });
  r.add({ type: 'decor', kind: 'column_broken', x: 49, y: 14, h: 90, dim: 0.5, layer: 'back' });
  r.add({ type: 'decor', kind: 'column_broken', x: 8, y: 14, h: 140, dim: 0.5, layer: 'back' });
  // votive candles still burn at the Effigy's knees (someone remembers the Old Guard)
  r.add({ type: 'decor', kind: 'candle_cluster', x: 12, y: 14, count: 5, layer: 'back' });
  r.add({ type: 'decor', kind: 'candle_cluster', x: 23, y: 14, count: 4, layer: 'back' });
  r.add({ type: 'decor', kind: 'sconce_dead', x: 41, y: 14, layer: 'back' });
  r.add({ type: 'decor', kind: 'sconce_dead', x: 56, y: 14, layer: 'back' });
  r.add({ type: 'decor', kind: 'rubble', x: 5, y: 14, layer: 'back' });
  r.add({ type: 'decor', kind: 'rubble', x: 58, y: 14, layer: 'back' });
  r.add({ type: 'decor', kind: 'bones', x: 26, y: 14, layer: 'back' });
  // light: the votive candles, a cold glow over the statue, braziers by the doors
  r.add({ type: 'light', x: 12, y: 13, r: 3.5, color: '#ffb45a', intensity: 0.55, flicker: true });
  r.add({ type: 'light', x: 23, y: 13, r: 3, color: '#ffb45a', intensity: 0.5, flicker: true });
  r.add({ type: 'light', x: 18, y: 9, r: 6, color: '#c9c2b4', intensity: 0.3 });
  r.add({ type: 'light', x: 32, y: 8, r: 9, color: '#d8b888', intensity: 0.22 });
  r.add({ type: 'light', x: 47, y: 9, r: 7, color: '#d8b888', intensity: 0.18 });
  r.add({ type: 'decor', kind: 'brazier', x: 6, y: 14, layer: 'back' });
  r.add({ type: 'decor', kind: 'brazier', x: 57, y: 14, layer: 'back' });
  return r;
}

const r = gw05();
const { errors, warnings } = r.check();
for (const w of warnings) console.log('warning: ' + w);
if (errors.length) { console.error(errors.join('\n')); process.exit(1); }
const def = r.toDef({ theme: { bg: 'interior', fg: false, decor: 0.55 }, bgSeed: 5, dark: 0.5 });
const out = RK.emit('guttered', [def], 'src/data/arenas/effigy.js', "arena gw_05 (THE EFFIGY) — generated by tools/gen/arena_effigy.js");
console.log('wrote ' + path.relative(path.join(__dirname, '..', '..'), out));
if (process.argv.includes('--print')) console.log(r.ascii());
