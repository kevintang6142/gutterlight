#!/usr/bin/env node
// tools/gen/arena_tallowmere.js — builds dn_07 "The Great Belfry" (ABBOT TALLOWMERE's arena) with tools/lib/roomkit.js,
// exactly per design/world_plan.json, and emits src/data/arenas/tallowmere.js. Owner: boss-tallowmere.
//   node tools/gen/arena_tallowmere.js [--print]
//
// Plan notes (dn_07, 64x27): single entrance W1 (col 0, rows 21-23). Floor top row 24 (rows 24-26 solid), flat across
// cols 1-62 (clean for the bell rings). Two one-way platforms at cols 12-19 and 44-51 to hop rings and dodge the belly
// slam. Ceiling solid rows 0-2; the giant bell (decor) hangs at cols 28-35, rows 3-8 (not solid). No tile hazards.
// arena_gate (w1,h4) at col 2 rows 20-23 under a solid lintel at row 19. arena: boss tallowmere, bx 46, by 23, trigger
// cols 10-30 rows 14-23 (built: bx 38, trigger cols 17-30 — see the QA deviation below). Phase-2 acolytes rise in the east (cols 55-60). Reward: Seal of the Bell + 300 cinders
// (both automatic in G.Boss), then the gate reopens.
//
// DEVIATION (reported): the plan puts the platform tops at row 18, i.e. 6 tiles above the floor top (row 24) — out of
// reach of a full jump (apex 4.4-4.8 tiles, TECH_SPEC §8.2) for a player without Smokewing (Tallowmere comes before
// it). They are built at row 20 (4 tiles: "reliably reachable"), which is what "hop rings and dodge the slam" needs.
'use strict';
const path = require('path');
const RK = require(path.join(__dirname, '..', 'lib', 'roomkit'));

const PLAT_ROW = 20;

function dn07() {
  const r = RK.room('dn_07');                    // 64x27; W1 col 0 rows 21-23
  // The belfry: air rows 3-23 across cols 3-62 (west wall cols 0-2 stays solid above the door).
  r.carve(3, 3, 60, 21);
  // West door: corridor cols 0-1 rows 21-23 (openExits), the gate column 2 rows 20-23 under the wall's lintel (row 19).
  r.openExits();
  r.carve(0, 21, 3, 3);
  r.carve(2, 20, 1, 1);
  // The broken roof: gaps in the vault the rain pours through (dead-end notches, nothing to stand in).
  for (const [c, w] of [[9, 3], [20, 2], [41, 3], [53, 2]]) r.carve(c, 1, w, 2);
  // Choir lofts: the two one-way platforms (hung from the vault on chains, see dressing).
  r.platform(12, PLAT_ROW, 8);
  r.platform(44, PLAT_ROW, 8);

  // ---- encounter
  r.put(2, 23, { type: 'arena_gate', id: 'dn_ag1', w: 1, h: 4, side: 'right' });   // shuts behind the player
  // QA deviation (qa-boss-tallowmere): the plan's spawn bx 46 lies under the east choir loft (cols 44-51), whose deck
  // cut through the kneeling Abbot's hood, and with the plan's trigger from col 10 he was 36 tiles away, off screen
  // through his intro lines, title card and first attacks. He now kneels at col 38, just east of his great bell and
  // clear of both lofts, and the fight starts from col 17 (inside the plan's trigger cols 10-30), so the fight camera
  // frames both of them from the first toll.
  r.add({ type: 'arena', boss: 'tallowmere', bx: 38, by: 23, trigger: [17, 14, 30, 23], x: 20, y: 12 });
  // The great bell + the flood film + his remains after the defeat (drawn by boss-tallowmere's event scripts).
  // the bell's yoke hangs on chains from the vault (row 3) so its lip shows at the top of the fight view
  r.add({ type: 'event', script: 'tallowmere_bell', x: 28, y: 3, w: 8, h: 9, z: -6, anchor: 'top', bell: [28, 6, 8, 6], vault: 3 });
  r.add({ type: 'event', script: 'tallowmere_flood', x: 1, y: 23, w: 62, h: 1, z: 4, floor: 24, c0: 1, c1: 62 });

  // ---- dressing (back layer only; nothing that reads as a ledge or a hazard)
  // chains from the vault carrying the choir lofts (both ends of each)
  const chainLen = (PLAT_ROW - 3) * 40 + 4;
  for (const c of [12, 19, 44, 51]) r.add({ type: 'decor', kind: 'chain', x: c, y: 3, len: chainLen, layer: 'back' });
  // tall lancet windows of pale-gold glass between the buttresses, and the arcade
  r.add({ type: 'decor', kind: 'stained_window', x: 7, y: 15, scale: 1.6, dim: 0.35, layer: 'back' });
  r.add({ type: 'decor', kind: 'stained_window', x: 24, y: 13, scale: 1.4, dim: 0.45, layer: 'back' });
  r.add({ type: 'decor', kind: 'stained_window', x: 40, y: 13, scale: 1.4, dim: 0.45, layer: 'back' });
  r.add({ type: 'decor', kind: 'stained_window', x: 57, y: 15, scale: 1.6, dim: 0.35, layer: 'back' });
  r.add({ type: 'decor', kind: 'arch', x: 16, y: 23, scale: 1.5, dim: 0.55, broken: true, layer: 'back' });
  r.add({ type: 'decor', kind: 'arch', x: 48, y: 23, scale: 1.5, dim: 0.55, layer: 'back' });
  // the drowned congregation: pews and candles in the flood
  r.add({ type: 'decor', kind: 'pew', x: 9, y: 23, dim: 0.4, layer: 'back' });
  r.add({ type: 'decor', kind: 'pew', x: 22, y: 23, dim: 0.45, flip: true, layer: 'back' });
  r.add({ type: 'decor', kind: 'pew', x: 38, y: 23, dim: 0.45, layer: 'back' });
  r.add({ type: 'decor', kind: 'column_broken', x: 30, y: 23, dim: 0.5, h: 70, layer: 'back' });
  r.add({ type: 'decor', kind: 'candelabra', x: 5, y: 23, layer: 'back' });
  r.add({ type: 'decor', kind: 'candle_cluster', x: 34, y: 23, layer: 'back' });
  r.add({ type: 'decor', kind: 'candelabra', x: 60, y: 23, flip: true, layer: 'back' });
  r.add({ type: 'decor', kind: 'rubble', x: 27, y: 23, layer: 'back' });
  r.add({ type: 'decor', kind: 'rubble', x: 55, y: 23, layer: 'back' });
  r.add({ type: 'decor', kind: 'bell_small', x: 15, y: 3, len: 60, layer: 'back' });
  r.add({ type: 'decor', kind: 'bell_small', x: 48, y: 3, len: 90, layer: 'back' });
  r.add({ type: 'decor', kind: 'drip', x: 6, y: 3, fall: 820, layer: 'back' });
  r.add({ type: 'decor', kind: 'drip', x: 58, y: 3, fall: 820, layer: 'back' });
  // lights: the door, the candelabra, the windows' cold gold, the bell
  r.add({ type: 'light', x: 4, y: 21, r: 4, color: '#ffc070', intensity: 0.45, flicker: true });
  r.add({ type: 'light', x: 60, y: 21, r: 4, color: '#ffc070', intensity: 0.4, flicker: true });
  r.add({ type: 'light', x: 7, y: 12, r: 6, color: '#ecc878', intensity: 0.22 });
  r.add({ type: 'light', x: 57, y: 12, r: 6, color: '#ecc878', intensity: 0.22 });
  r.add({ type: 'light', x: 32, y: 14, r: 12, color: '#a8c8d4', intensity: 0.2 });
  return r;
}

const r = dn07();
const { errors, warnings } = r.check();
for (const w of warnings) console.log('warning: ' + w);
if (errors.length) { console.error(errors.join('\n')); process.exit(1); }
const def = r.toDef({ theme: { bg: 'interior', fg: false, decor: 0.5 }, bgSeed: 21, dark: 0.45 });
const out = RK.emit('nave', [def], 'src/data/arenas/tallowmere.js', "arena dn_07 (ABBOT TALLOWMERE) — generated by tools/gen/arena_tallowmere.js");
console.log('wrote ' + path.relative(path.join(__dirname, '..', '..'), out));
if (process.argv.includes('--print')) console.log(r.ascii());
