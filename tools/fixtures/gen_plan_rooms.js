#!/usr/bin/env node
// tools/fixtures/gen_plan_rooms.js — builds four REAL plan rooms (sh_01, sh_02, mw_03, dn_12) with tools/lib/roomkit.js
// into tools/fixtures/plan_rooms.js (NOT src/data: these are test fixtures for validate.js / reach.js, not the
// shipped rooms). They exercise plan conformance (rects, exits, contents), opening matching between two real
// neighbours (sh_01.E1 <-> sh_02.W1), a grip gate (sh_02's pillar) and a horizontal lever grate (mw_03).
//
//   node tools/fixtures/gen_plan_rooms.js            (re)generate the fixture file
//   node tools/fixtures/gen_plan_rooms.js --broken   also write plan_rooms_broken.js: copies with planted defects
'use strict';
const path = require('path');
const RK = require('../lib/roomkit');

function sh01() {
  const r = RK.room('sh_01');
  r.carve(1, 1, 62, 13);                       // open strand, floor top row 14
  r.fill(1, 12, 6, 2);                         // a wall of ash on the far west
  r.fill(30, 13, 8, 1);                        // low dune
  r.openExits();
  r.put(4, 11, { type: 'start' });             // on the ash wall top (row 12)
  r.put(44, 13, { type: 'enemy', kind: 'ash_crawler' });
  r.put(20, 13, { type: 'lore', id: 'lore_sh_1' });
  r.put(34, 12, { type: 'geode', id: 'sh_geo1', amount: 40 });
  return r.toDef({ theme: {}, bgSeed: 1 });
}

function sh02() {
  const r = RK.room('sh_02');
  r.carve(1, 1, 62, 13);                       // dunes, ground top row 14
  r.fill(8, 13, 6, 1);                         // small dune
  r.fill(17, 13, 8, 1);                        // crest with the sconce
  r.fill(52, 4, 9, 6);                         // GRIP GATE: sheer pillar cols 52-60, top row 4, underside row 9
  // the walkway to E1 passes under the pillar (rows 10-13 = 4-tall tunnel)
  r.openExits();
  r.put(20, 12, { type: 'sconce', id: 'sh_sconce_a' });
  r.put(28, 13, { type: 'lore', id: 'lore_sh_2' });
  r.put(56, 3, { type: 'pickup', item: 'heartwax', id: 'sh_hw1' });
  r.put(34, 13, { type: 'enemy', kind: 'ash_crawler' });
  r.put(42, 13, { type: 'enemy', kind: 'ash_crawler' });
  r.put(47, 8, { type: 'enemy', kind: 'ash_fly' });
  r.add({ type: 'light', x: 20, y: 11, r: 5, color: '#ffc070', intensity: 0.8, flicker: true });
  return r.toDef({ theme: {}, bgSeed: 2 });
}

function mw03() {
  const r = RK.room('mw_03');
  r.carve(1, 1, 62, 23);                       // hall, floor top row 24
  r.fill(18, 0, 2, 3); r.fill(24, 0, 2, 3);    // grate frame cols 18-19 and 24-25, rows 0-2
  r.carve(20, 1, 4, 2);                        // shaft above the grate
  r.carve(37, 24, 10, 1);                      // floor dips to top row 25 beside the S1 hole
  r.openExits(3);                              // N1 cols 20-23, S1 cols 40-43 (hole through rows 24-26)
  r.platform(14, 20, 6);
  r.platform(22, 16, 6);
  r.platform(14, 12, 6);
  r.platform(22, 8, 6);
  r.platform(17, 4, 12);                       // top platform cols 17-28
  r.put(20, 2, { type: 'gate', id: 'mw_gate1', opens: 'lever:mw_lv1', w: 4, h: 1 });
  r.put(27, 3, { type: 'lever', id: 'mw_lv1' });
  r.put(52, 23, { type: 'geode', id: 'mw_geo1', amount: 60 });
  r.put(32, 23, { type: 'enemy', kind: 'moth_knight' });
  r.put(30, 8, { type: 'enemy', kind: 'dusk_moth' });
  return r.toDef({ theme: {}, bgSeed: 3, dark: 0.7 });
}

// dn_12 (The Reliquary): a one-way room (S1->W1 needs grip; W1->S1 must stay impossible), a D vault, glazed lip.
function dn12() {
  const r = RK.room('dn_12');
  r.carve(1, 1, 49, 14);                       // hall, floor top row 15 (cols 1-49)
  r.carve(50, 1, 12, 4);                       // air above the ice pillar and ledge (rows 1-4)
  r.fill(40, 5, 18, 2, '#');                   // the high ledge, top row 5, rows 5-6, cols 40-57
  r.fill(40, 5, 10, 2, 'X');                   // its overhang over the hall (lip + underside) is glazed
  r.fill(50, 7, 1, 8, 'X');                    // the pillar's west face toward the hall (rows 7-14) is glazed
  r.carve(52, 5, 4, 22);                       // the Ice Stair shaft (cols 52-55), plain # walls, up to the ledge
  // shelves "for fun". NOTE: the plan allows them up to row 9 / col 36, but reach.js showed that a shelf at
  // row 11, cols 26-30 already lets dash + wings reach the ledge (6 up, 9 across) - so they stay far west.
  r.platform(14, 11, 5);
  r.platform(4, 9, 5);
  r.fill(8, 15, 6, 2, 'D');                    // cracked reliquary floor over the vault
  r.carve(4, 17, 21, 5);                       // the vault: air rows 17-21, floor top row 22
  r.platform(14, 19, 3);                       // climb-out platform beside the hole (22 -> 19 -> 15)
  r.openExits();
  r.put(18, 21, { type: 'pickup', item: 'spark', id: 'spark_dn' });
  r.put(30, 14, { type: 'enemy', kind: 'drowned_knight' });
  return r.toDef({ theme: {}, bgSeed: 12 });
}

// Broken copies (ids re-used: load this file INSTEAD of plan_rooms.js) — each defect must be reported.
function broken(defs) {
  const out = JSON.parse(JSON.stringify(defs));
  const sh02b = out.find((d) => d.id === 'sh_02');
  // 1) E1 shifted one row up (rows 10-12 instead of 11-13): plan-exit error + unmatched opening
  sh02b.tiles = sh02b.tiles.map((row, y) => (y === 10 ? row.slice(0, 63) + '.' : y === 13 ? row.slice(0, 63) + '#' : row));
  // 2) lore id that does not exist, 3) pickup floating in the air
  sh02b.legend = Object.assign({}, sh02b.legend);
  for (const k of Object.keys(sh02b.legend)) {
    if (sh02b.legend[k].type === 'lore') sh02b.legend[k] = { type: 'lore', id: 'lore_sh_99' };
  }
  sh02b.entities = sh02b.entities.concat([{ type: 'pickup', item: 'heartwax', id: 'sh_hw_extra', x: 40, y: 5 }]);
  // 4) floating water (pool over air) in mw_03 + 5) gate opening on an unknown lever
  // 6) sh_02: platforms beside the grip pillar make sh_hw1 reachable without grip (GATE LEAK)
  sh02b.tiles = sh02b.tiles.map((row, y) => (y === 10 ? row.slice(0, 44) + '=====' + row.slice(49) : y === 6 ? row.slice(0, 46) + '=====' + row.slice(51) : row));
  // 7) dn_12: a platform stair to the high ledge makes the one-way W1->S1 possible (unplanned traversal)
  const dn = out.find((d) => d.id === 'dn_12');
  dn.tiles = dn.tiles.map((row, y) => (y === 12 ? row.slice(0, 34) + '====' + row.slice(38) : y === 8 ? row.slice(0, 36) + '===' + row.slice(39) : row));
  const mw = out.find((d) => d.id === 'mw_03');
  mw.tiles = mw.tiles.map((row, y) => (y === 18 ? row.slice(0, 40) + '~~~~' + row.slice(44) : row));
  for (const k of Object.keys(mw.legend)) if (mw.legend[k].type === 'gate') mw.legend[k] = Object.assign({}, mw.legend[k], { opens: 'lever:mw_lv9' });
  return out;
}

if (require.main === module) {
  const defs = [sh01(), sh02(), mw03(), dn12()];
  const file = path.join('tools', 'fixtures', 'plan_rooms.js');
  RK.emit('fixtures', defs, file, 'FIXTURE copies of plan rooms sh_01, sh_02, mw_03, dn_12 (tests for validate/reach; not game data)');
  console.log('wrote ' + file);
  if (process.argv.includes('--broken')) {
    const bf = path.join('tools', 'fixtures', 'plan_rooms_broken.js');
    RK.emit('fixtures', broken(defs), bf, 'FIXTURE with planted defects (validate.js must report them)');
    console.log('wrote ' + bf);
  }
  for (const d of defs) { console.log('\n' + d.id); console.log(d.tiles.join('\n')); }
}
module.exports = { sh01, sh02, mw03, dn12, broken };
