#!/usr/bin/env node
// tools/gen/arena_matron.js — builds sf_05 "The Matron's Den" (THE SOOT MATRON's arena) with tools/lib/roomkit.js,
// exactly per design/world_plan.json, and emits src/data/arenas/matron.js. Owner: boss-matron.
//   node tools/gen/arena_matron.js [--print]
//
// Plan notes (sf_05, 48x27): floor top row 24 (rows 24-26 solid) across cols 1-46. W1 (rows 12-14) enters onto a
// west ledge (cols 1-5, top row 15) high above the den; a stair leads down: a solid step (cols 6-9, top row 18) and
// a one-way platform (cols 10-14, row 21) - also the way back out (24 -> 21 -> 18 -> 15). Centre one-way platform
// (cols 20-28, row 17) and east one-way platform (cols 33-38, row 21). Both side walls plain #. E1 (rows 21-23) at
// floor level. arena_gates (w1,h4): col 1 rows 11-14 under a lintel at row 10; col 46 rows 20-23 under a lintel at
// row 19. arena: boss matron, bx 30, by 6 (hangs from the ceiling, then drops), trigger cols 10-38 rows 16-23.
// No tile hazards. After victory both gates open; the Grip shrine is through E1 (sf_06).
'use strict';
const path = require('path');
const RK = require(path.join(__dirname, '..', 'lib', 'roomkit'));

function sf05() {
  const r = RK.room('sf_05');                    // 48x27; W1 col 0 rows 12-14, E1 col 47 rows 21-23
  // The den: air rows 3-23 across cols 1-46 (ceiling rows 0-2, floor rows 24-26 stay solid).
  r.carve(1, 3, 46, 21);
  // Chimney throats in the vault (dark dead-end notches the soot pours from; nothing to stand in).
  for (const [c, w] of [[8, 3], [17, 2], [29, 3], [40, 2]]) r.carve(c, 1, w, 2);
  // West ledge (cols 1-5, top row 15) and the solid step (cols 6-9, top row 18).
  r.fill(1, 15, 5, 9);
  r.fill(6, 18, 4, 6);
  // West door: lintel over the arena gate (row 10, col 1; the gate stands in col 1, rows 11-14). With the gate shut,
  // lintel + bars form one flat face (x = 80, rows 10-14) that she clings to above the ledge.
  r.fill(1, 10, 1, 1);
  // East door: lintel over the arena gate (row 19, col 46; the gate stands in col 46, rows 20-23).
  r.fill(46, 19, 1, 1);
  r.openExits();
  // One-way platforms: the stair's lower tread, the centre perch and the east perch.
  r.platform(10, 21, 5);
  r.platform(20, 17, 9);
  r.platform(33, 21, 6);

  // ---- encounter
  r.put(1, 14, { type: 'arena_gate', id: 'sf_ag1', w: 1, h: 4, side: 'right' });   // west: shuts behind the player
  // East: the way on to the Grip shrine stays barred until she is dead (a boss gate, like the Effigy's gw_gate1: it is
  // shut before, during and after a lost fight, opens for good on boss:matron — so reach can verify the gating).
  r.put(46, 23, { type: 'gate', id: 'sf_gate9', opens: 'boss:matron', w: 1, h: 4 });
  r.add({ type: 'arena', boss: 'matron', bx: 30, by: 6, trigger: [10, 16, 38, 23], x: 24, y: 12 });
  // The nest and the egg-sacs crusting the walls (drawn by boss-matron's event script; the sacs smoulder before
  // the fight, flare in her second phase and go cold-grey after her defeat; her curled husk stays in the nest).
  r.add({ type: 'event', script: 'matron_nest', x: 30, y: 23, w: 1, h: 1, z: -6, sacs: [
    [1, 5, 'l', 4], [1, 8, 'l', 3], [6, 16, 'l', 2], [10, 19, 'l', 2],              // west wall, ledge and step faces
    [46, 5, 'r', 4], [46, 9, 'r', 3], [46, 13, 'r', 3], [46, 17, 'r', 2],           // east wall (her cling spot)
    [12, 3, 'u', 3], [22, 3, 'u', 4], [34, 3, 'u', 3], [44, 3, 'u', 3],            // the vault, between the throats
  ] });

  // ---- dressing (back layer only; nothing that reads as a ledge or a hazard)
  r.add({ type: 'decor', kind: 'chain', x: 13, y: 3, len: 170, layer: 'back' });
  r.add({ type: 'decor', kind: 'chain', x: 36, y: 3, len: 130, hook: true, layer: 'back' });
  r.add({ type: 'decor', kind: 'cage_hanging', x: 24, y: 3, len: 90, ember: true, layer: 'back' });
  r.add({ type: 'decor', kind: 'pipe_v', x: 16, y: 23, len: 200, steam: true, dim: 0.5, layer: 'back' });
  r.add({ type: 'decor', kind: 'pipe_v', x: 43, y: 23, len: 240, dim: 0.5, layer: 'back' });
  // iron stanchions under the free-standing grates (centre and east), so they read as built, not floating
  r.add({ type: 'decor', kind: 'pipe_v', x: 21, y: 23, len: 268, dim: 0.6, layer: 'back' });
  r.add({ type: 'decor', kind: 'pipe_v', x: 27, y: 23, len: 268, dim: 0.6, layer: 'back' });
  r.add({ type: 'decor', kind: 'pipe_v', x: 34, y: 23, len: 108, dim: 0.6, layer: 'back' });
  r.add({ type: 'decor', kind: 'pipe_v', x: 37, y: 23, len: 108, dim: 0.6, layer: 'back' });
  r.add({ type: 'decor', kind: 'grate_glow', x: 22, y: 23, layer: 'back' });
  r.add({ type: 'decor', kind: 'grate_glow', x: 39, y: 23, layer: 'back' });
  r.add({ type: 'decor', kind: 'bones', x: 12, y: 23, layer: 'back' });
  r.add({ type: 'decor', kind: 'bones', x: 41, y: 23, flip: true, layer: 'back' });
  r.add({ type: 'decor', kind: 'rubble', x: 18, y: 23, layer: 'back' });
  r.add({ type: 'decor', kind: 'rubble', x: 44, y: 23, layer: 'back' });
  r.add({ type: 'decor', kind: 'rubble', x: 3, y: 14, layer: 'back' });
  r.add({ type: 'decor', kind: 'brazier', x: 5, y: 14, layer: 'back' });
  // lights: the doors, the ember grates, a dull red wash from the chimney throats
  r.add({ type: 'light', x: 5, y: 13, r: 4, color: '#ff9a50', intensity: 0.5, flicker: true });
  r.add({ type: 'light', x: 22, y: 22, r: 4, color: '#ff7a3a', intensity: 0.45, flicker: true });
  r.add({ type: 'light', x: 39, y: 22, r: 4, color: '#ff7a3a', intensity: 0.45, flicker: true });
  r.add({ type: 'light', x: 44, y: 21, r: 4, color: '#ffa060', intensity: 0.35, flicker: true });
  r.add({ type: 'light', x: 30, y: 5, r: 9, color: '#c8502c', intensity: 0.28 });
  r.add({ type: 'light', x: 12, y: 6, r: 7, color: '#c8502c', intensity: 0.2 });
  r.add({ type: 'light', x: 30, y: 15, r: 10, color: '#e08a5a', intensity: 0.16 });
  return r;
}

const r = sf05();
const { errors, warnings } = r.check();
for (const w of warnings) console.log('warning: ' + w);
if (errors.length) { console.error(errors.join('\n')); process.exit(1); }
const def = r.toDef({ theme: { bg: 'shaft', decor: 0.6 }, bgSeed: 7, dark: 0.5 });
const out = RK.emit('flue', [def], 'src/data/arenas/matron.js', "arena sf_05 (THE SOOT MATRON) — generated by tools/gen/arena_matron.js");
console.log('wrote ' + path.relative(path.join(__dirname, '..', '..'), out));
if (process.argv.includes('--print')) console.log(r.ascii());
