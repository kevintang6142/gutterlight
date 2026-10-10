#!/usr/bin/env node
// tools/gen/arena_sable.js — builds SABLE's two duel arenas with tools/lib/roomkit.js, per design/world_plan.json,
// and emits src/data/arenas/sable1.js (mb_07 "The Moonlit Lawn") and src/data/arenas/sable2.js (ri_07 "The Last Guard").
// Owner: boss-sable.
//   node tools/gen/arena_sable.js [--print]
//
// Plan notes (both rooms 64x18): floor top row 15 flat across cols 1-62 (rows 15-17 solid); ceiling solid rows 0-1;
// rows 2-14 open across the hall for her dives and the boomerang hook; W1/E1 rows 12-14 under solid lintels (row 10,
// cols 0-3 / 60-63) holding the arena gates (col 2 and col 61, h 4, rows 11-14); two one-way platforms;
// The west gate is a boss gate (`gate`, opens boss:sable1/2, like the Effigy's gw_gate1) so the way on is shut
// before the duel too (reach: no boss-token leak); the east one is an `arena_gate` (open, shuts behind the player).
// arena: bx 12, by 14 (she waits at the west end), trigger cols 24-40 rows 6-14 (the player walks in from the east).
//
// Deviation (reported): mb_07's petal platforms have their top on row 11 (4 tiles above the floor) instead of row 10.
// At duel 1 the player has no dash / wings and the motor's full-jump apex is 4.5 tiles (METRICS.maxLedge 4), so a
// row-10 platform (5 tiles up) could never be used as the "dodge option" the notes ask for. ri_07 keeps row 10
// (the player owns Smokewing by then).
'use strict';
const path = require('path');
const RK = require(path.join(__dirname, '..', 'lib', 'roomkit'));

/** The shared duel hall shell: hall cols 4-59 rows 2-14, door alcoves rows 11-14 under the lintels. */
function shell(id) {
  const r = RK.room(id);
  r.carve(4, 2, 56, 13);           // the hall (rows 2-14 open between the door frames)
  r.carve(1, 11, 3, 4);            // west door alcove (rows 11-14), lintel row 10 above it
  r.carve(60, 11, 3, 4);           // east door alcove
  r.openExits();
  return r;
}

// ------------------------------------------------------------------------------------------------ mb_07
function mb07() {
  const r = shell('mb_07');
  // two thin petal platforms (one-way)
  r.platform(14, 11, 6);
  r.platform(44, 11, 6);
  // gates + arena
  r.put(2, 14, { type: 'gate', id: 'mb_gate9', opens: 'boss:sable1', w: 1, h: 4 });   // west: the way to the dash shrine (shut until she is beaten)
  r.put(61, 14, { type: 'arena_gate', id: 'mb_ag2', w: 1, h: 4, side: 'left' });   // east: shuts behind the player
  r.add({ type: 'arena', boss: 'sable1', bx: 12, by: 14, trigger: [24, 6, 40, 14], x: 32, y: 8 });
  r.add({ type: 'event', script: 'sable_wait', boss: 'sable1', x: 12, y: 14, w: 1, h: 3, facing: 'right', z: -1 });   // she waits, facing the lawn

  // ---- dressing: a round lawn of pale wax grass under a cracked glass dome (greenhouse back wall), moonlight.
  // Vines hang from the dome ribs (the ceiling), clear of the platforms' air space.
  for (const [c, len] of [[6, 70], [24, 90], [33, 60], [40, 85], [56, 70]]) {
    r.add({ type: 'decor', kind: 'vine_curtain', x: c, y: 2, len, layer: 'back', dim: 0.35 });
  }
  // giant wax flowers ring the lawn (back layer, dimmed so they never read as ledges)
  for (const [c, h, dim] of [[8, 210, 0.7], [27, 250, 0.72], [52, 220, 0.7]]) {
    r.add({ type: 'decor', kind: 'flower_giant', x: c, y: 14, h, layer: 'back', dim, lit: true });
  }
  // the petals rest on wax blooms (QA: the region's wax shelves draw no supports of their own; the dome is too high
  // for hanging ropes) — one short bloom under each platform's middle, cupping it
  for (const c of [17, 47]) r.add({ type: 'decor', kind: 'flower_giant', x: c, y: 14, h: 80, layer: 'back', dim: 0.6, lit: true });
  r.add({ type: 'decor', kind: 'fountain', x: 32, y: 14, layer: 'back', dim: 0.45 });
  r.add({ type: 'decor', kind: 'statue_waxen', x: 5, y: 14, variant: 1, material: 'wax', dim: 0.5, layer: 'back' });
  r.add({ type: 'decor', kind: 'statue_waxen', x: 58, y: 14, variant: 0, material: 'wax', flip: true, dim: 0.5, layer: 'back' });
  for (const [c, cl] of [[10, '#cfd6b0'], [17, '#d9dcb8'], [26, '#cfd6b0'], [35, '#e0e2c0'], [42, '#cfd6b0'], [49, '#d9dcb8'], [55, '#cfd6b0']]) {
    r.add({ type: 'decor', kind: 'grass_clump', x: c, y: 14, color: cl, layer: 'front' });
  }
  r.add({ type: 'decor', kind: 'mushroom_glow', x: 15, y: 14, layer: 'back' });
  r.add({ type: 'decor', kind: 'mushroom_glow', x: 47, y: 14, layer: 'back' });
  r.add({ type: 'decor', kind: 'reeds', x: 4, y: 14, layer: 'back', dim: 0.4 });
  r.add({ type: 'decor', kind: 'reeds', x: 59, y: 14, layer: 'back', dim: 0.4 });
  // light: pale moonlight through the cracked dome, gold flower hearts low
  r.add({ type: 'light', x: 32, y: 3, r: 14, color: '#dfe8ff', intensity: 0.3 });
  r.add({ type: 'light', x: 14, y: 4, r: 9, color: '#dfe8ff', intensity: 0.22 });
  r.add({ type: 'light', x: 50, y: 4, r: 9, color: '#dfe8ff', intensity: 0.22 });
  r.add({ type: 'light', x: 27, y: 9, r: 4, color: '#ffd880', intensity: 0.35, flicker: true });
  r.add({ type: 'light', x: 12, y: 13, r: 5, color: '#e8e0ff', intensity: 0.25 });
  r.toDefWith = { theme: { bg: 'interior', fg: false, decor: 0.35 }, bgSeed: 7, dark: 0.62 };
  return r;
}

// ------------------------------------------------------------------------------------------------ ri_07
function ri07() {
  const r = shell('ri_07');
  r.platform(12, 10, 7);
  r.platform(45, 10, 7);
  r.put(2, 14, { type: 'gate', id: 'ri_gate9', opens: 'boss:sable2', w: 1, h: 4 });   // west: toward the Seal Door (shut until she yields)
  r.put(61, 14, { type: 'arena_gate', id: 'ri_ag2', w: 1, h: 4, side: 'left' });   // east: behind the player
  r.add({ type: 'arena', boss: 'sable2', bx: 12, by: 14, trigger: [24, 6, 40, 14], x: 32, y: 8 });
  r.add({ type: 'event', script: 'sable_wait', boss: 'sable2', x: 12, y: 14, w: 1, h: 3, facing: 'right', z: -1 });   // in the falling snow, scarf frozen stiff

  // ---- dressing: a frozen hall before the Sanctum stair; falling snow (region weather); frozen guards.
  for (const [c, v, flip] of [[8, 0, false], [27, 1, true], [38, 0, false], [55, 1, true]]) {
    r.add({ type: 'decor', kind: 'frozen_waxen', x: c, y: 14, variant: v, flip, dim: 0.55, layer: 'back' });
  }
  for (const [c, h] of [[5, 130], [21, 110], [33, 150], [43, 100], [58, 140]]) {
    r.add({ type: 'decor', kind: 'column_broken', x: c, y: 14, h, dim: 0.5, layer: 'back' });
  }
  // the ice shelves rest on two fluted columns each (QA: the ice platform style draws no supports of its own); the
  // broken tops end behind the slab
  for (const c of [13, 17, 46, 50]) r.add({ type: 'decor', kind: 'column_broken', x: c, y: 14, h: 184, dim: 0.62, layer: 'back' });
  r.add({ type: 'decor', kind: 'ice_spire', x: 16, y: 14, dim: 0.5, layer: 'back' });
  r.add({ type: 'decor', kind: 'ice_spire', x: 49, y: 14, dim: 0.5, layer: 'back' });
  r.add({ type: 'decor', kind: 'crystal', x: 24, y: 14, color: '#9ae0ff', layer: 'back' });
  r.add({ type: 'decor', kind: 'crystal', x: 41, y: 14, color: '#9ae0ff', layer: 'back' });
  r.add({ type: 'decor', kind: 'sconce_dead', x: 10, y: 14, layer: 'back' });
  r.add({ type: 'decor', kind: 'sconce_dead', x: 53, y: 14, layer: 'back' });
  r.add({ type: 'decor', kind: 'wick_grave', x: 30, y: 14, layer: 'back' });
  r.add({ type: 'decor', kind: 'rubble', x: 36, y: 14, layer: 'back' });
  for (const [c, f] of [[7, 110], [19, 90], [30, 130], [40, 100], [52, 120]]) r.add({ type: 'decor', kind: 'drip', x: c, y: 2, fall: f, color: '#cfeaff', layer: 'back' });
  // light: cold cyan from the crystals, a faint gold leak from the west (the Seal Door beyond)
  r.add({ type: 'light', x: 24, y: 13, r: 4, color: '#9ae0ff', intensity: 0.45, flicker: true });
  r.add({ type: 'light', x: 41, y: 13, r: 4, color: '#9ae0ff', intensity: 0.45, flicker: true });
  r.add({ type: 'light', x: 32, y: 5, r: 13, color: '#c8f0ff', intensity: 0.22 });
  r.add({ type: 'light', x: 4, y: 12, r: 6, color: '#ffd890', intensity: 0.35 });
  r.add({ type: 'light', x: 12, y: 12, r: 5, color: '#e8f6ff', intensity: 0.22 });
  r.toDefWith = { theme: { bg: 'interior', fg: false, decor: 0.45 }, bgSeed: 11, dark: 0.5 };
  return r;
}

let failed = false;
for (const [fn, region, file, title] of [
  [mb07, 'meltbloom', 'src/data/arenas/sable1.js', 'arena mb_07 (SABLE, duel 1) — generated by tools/gen/arena_sable.js'],
  [ri07, 'rime', 'src/data/arenas/sable2.js', 'arena ri_07 (SABLE, duel 2) — generated by tools/gen/arena_sable.js'],
]) {
  const r = fn();
  const { errors, warnings } = r.check();
  for (const w of warnings) console.log(r.plan.id + ' warning: ' + w);
  if (errors.length) { console.error(r.plan.id + ':\n' + errors.join('\n')); failed = true; continue; }
  const def = r.toDef(r.toDefWith);
  const out = RK.emit(region, [def], file, title);
  console.log('wrote ' + path.relative(path.join(__dirname, '..', '..'), out));
  if (process.argv.includes('--print')) console.log(r.ascii());
}
if (failed) process.exit(1);
