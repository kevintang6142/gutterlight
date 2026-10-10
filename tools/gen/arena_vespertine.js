#!/usr/bin/env node
// tools/gen/arena_vespertine.js — builds mw_04 "The Duchess's Bower" (DUCHESS VESPERTINE's arena) with
// tools/lib/roomkit.js, exactly per design/world_plan.json, and emits src/data/arenas/vespertine.js.
// Owner: boss-vespertine.
//   node tools/gen/arena_vespertine.js [--print]
//
// Plan notes (mw_04, 64x27): single entrance W1 (col 0, rows 21-23) from mw_06.E1. Floor top row 24 (rows 24-26
// solid), flat across cols 1-62. Rows 3-23 open over the whole width (she flies); ceiling rows 0-2 solid (the silk
// vault). Three one-way silk platforms: tops at row 18 (cols 10-17 and 46-53) and row 13 (cols 28-35). No tile
// hazards. arena_gate (w1,h4) at col 2 rows 20-23 under a solid lintel at row 19. arena: boss vespertine, bx 46,
// by 10 (rests on the cocoon throne at the east end, airborne), trigger cols 10-30 rows 14-23.
// The lintel spans cols 1-2 so the doorway pocket behind the gate (col 1, rows 20-23) is closed from above: with
// the gate shut nobody can fly over it and out through W1.
'use strict';
const path = require('path');
const RK = require(path.join(__dirname, '..', 'lib', 'roomkit'));

function mw04() {
  const r = RK.room('mw_04');                    // 64x27; W1 col 0 rows 21-23
  r.carve(1, 3, 62, 21);                         // the bower: rows 3-23, cols 1-62 (vault rows 0-2, floor 24-26)
  r.fill(1, 19, 2, 1);                           // lintel over the arena gate (cols 1-2, row 19)
  r.openExits();
  // the three one-way silk platforms (silk ropes from the vault are drawn by the bower event)
  r.platform(10, 18, 8);
  r.platform(46, 18, 8);
  r.platform(28, 13, 8);

  // ---- encounter
  r.put(2, 23, { type: 'arena_gate', id: 'mw_ag1', w: 1, h: 4, side: 'right' });   // shuts behind the player
  r.add({ type: 'arena', boss: 'vespertine', bx: 46, by: 10, trigger: [10, 14, 30, 23], x: 20, y: 20 });
  // The bower (boss-vespertine's event script): the cocoon throne at the east end with the sleeping Duchess before
  // the fight, the silk ropes holding the three platforms, the moonbeam, and her dust-imprint after the victory.
  r.add({ type: 'event', script: 'vespertine_bower', x: 46, y: 10, w: 1, h: 1, z: -8,
    ropes: [[10, 18], [17, 18], [46, 18], [53, 18], [28, 13], [35, 13]] });

  // ---- dressing (back layer; nothing that reads as a ledge or a hazard)
  const C = (x, len, glow) => r.add({ type: 'decor', kind: 'cocoon', x, y: 3, len, glow: glow !== false, layer: 'back' });
  C(5, 30); C(8, 70, false); C(14, 40); C(20, 96); C(23, 34, false); C(31, 26); C(38, 60); C(41, 110, false); C(58, 44); C(61, 80);
  r.add({ type: 'decor', kind: 'web', x: 2, y: 3, layer: 'back' });
  r.add({ type: 'decor', kind: 'web', x: 60, y: 3, flip: true, layer: 'back' });
  r.add({ type: 'decor', kind: 'web', x: 25, y: 3, layer: 'back', dim: 0.4 });
  r.add({ type: 'decor', kind: 'vine_curtain', x: 4, y: 3, len: 150, silk: true, layer: 'back', dim: 0.3 });
  r.add({ type: 'decor', kind: 'vine_curtain', x: 56, y: 3, len: 120, silk: true, layer: 'back', dim: 0.3 });
  r.add({ type: 'decor', kind: 'vine_curtain', x: 37, y: 3, len: 90, silk: true, layer: 'back', dim: 0.45 });
  // the floor: wick-reeds against the walls, glowing wax-caps, crystals, the husks of earlier challengers
  r.add({ type: 'decor', kind: 'reeds', x: 4, y: 23, ember: true, layer: 'back' });
  r.add({ type: 'decor', kind: 'reeds', x: 61, y: 23, ember: true, layer: 'back' });
  r.add({ type: 'decor', kind: 'reeds', x: 59, y: 23, layer: 'back', dim: 0.3 });
  r.add({ type: 'decor', kind: 'reeds', x: 6, y: 23, layer: 'back', dim: 0.3 });
  r.add({ type: 'decor', kind: 'mushroom_glow', x: 8, y: 23, layer: 'back' });
  r.add({ type: 'decor', kind: 'mushroom_glow', x: 24, y: 23, layer: 'back' });
  r.add({ type: 'decor', kind: 'mushroom_glow', x: 41, y: 23, layer: 'back' });
  r.add({ type: 'decor', kind: 'mushroom_glow', x: 56, y: 23, layer: 'back' });
  r.add({ type: 'decor', kind: 'crystal', x: 33, y: 23, color: '#b890ff', layer: 'back', dim: 0.35 });
  r.add({ type: 'decor', kind: 'crystal', x: 52, y: 23, color: '#c8a8ff', layer: 'back', dim: 0.35 });
  r.add({ type: 'decor', kind: 'bones', x: 18, y: 23, layer: 'back' });
  r.add({ type: 'decor', kind: 'bones', x: 44, y: 23, flip: true, layer: 'back' });
  r.add({ type: 'decor', kind: 'wick_grave', x: 12, y: 23, layer: 'back', dim: 0.35 });
  r.add({ type: 'decor', kind: 'grass_clump', x: 3, y: 23, layer: 'front', color: '#5c4c7e' });
  r.add({ type: 'decor', kind: 'grass_clump', x: 62, y: 23, layer: 'front', color: '#5c4c7e' });
  // lights: lavender pools under the platforms, the wax-caps, the throne; the moonbeam is the event's
  r.add({ type: 'light', x: 13, y: 20, r: 5, color: '#b890ff', intensity: 0.42 });
  r.add({ type: 'light', x: 50, y: 20, r: 5, color: '#b890ff', intensity: 0.42 });
  r.add({ type: 'light', x: 31, y: 15, r: 5, color: '#c8a8ff', intensity: 0.4 });
  r.add({ type: 'light', x: 8, y: 22, r: 3, color: '#a070ff', intensity: 0.45, flicker: true });
  r.add({ type: 'light', x: 24, y: 22, r: 3, color: '#a070ff', intensity: 0.45, flicker: true });
  r.add({ type: 'light', x: 41, y: 22, r: 3, color: '#a070ff', intensity: 0.45, flicker: true });
  r.add({ type: 'light', x: 56, y: 22, r: 3, color: '#a070ff', intensity: 0.45, flicker: true });
  r.add({ type: 'light', x: 4, y: 21, r: 4, color: '#c8a8ff', intensity: 0.4 });            // the doorway
  r.add({ type: 'light', x: 32, y: 8, r: 11, color: '#7b6ab4', intensity: 0.22 });          // the vault
  return r;
}

const r = mw04();
const { errors, warnings } = r.check();
for (const w of warnings) console.log('warning: ' + w);
if (errors.length) { console.error(errors.join('\n')); process.exit(1); }
// bg 'shaft': the mothwood backdrop then omits its giant resting moth (it would double the Duchess; the mothwood
// theme ignores landmark:false)
const def = r.toDef({ theme: { fg: false, decor: 0.5, weatherDensity: 0.7, landmark: false, bg: 'shaft' }, bgSeed: 11, dark: 0.55 });
const out = RK.emit('mothwood', [def], 'src/data/arenas/vespertine.js', "arena mw_04 (DUCHESS VESPERTINE) — generated by tools/gen/arena_vespertine.js");
console.log('wrote ' + path.relative(path.join(__dirname, '..', '..'), out));
if (process.argv.includes('--print')) console.log(r.ascii());
