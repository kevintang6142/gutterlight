#!/usr/bin/env node
// tools/gen/flue.js — generator for THE SOOTFLUE (region builder: region-flue).
// Builds every NON-arena room of region 'flue' with tools/lib/roomkit.js exactly to design/world_plan.json and
// emits src/data/regions/flue.js. Never hand-edit the emitted file: edit this, then re-run:
//   node tools/gen/flue.js [--print] [sf_02 ...]     (--print dumps the rooms as ASCII with row numbers)
// Coordinates: x = column, y = row (room-local, 0-based). Helpers take INCLUSIVE rectangles.
// The arena sf_05 (The Matron's Den) lives in src/data/arenas/matron.js (boss builder).
// Region set pieces drawn by code (event scripts sf_*) live in src/entities/enemies/flue.js.
'use strict';
const path = require('path');
const RK = require('../lib/roomkit');

// ------------------------------------------------------------------ helpers
const box = (r, x0, y0, x1, y1, ch = '#') => r.fill(x0, y0, x1 - x0 + 1, y1 - y0 + 1, ch);
const air = (r, x0, y0, x1, y1) => box(r, x0, y0, x1, y1, '.');
const plat = (r, x0, x1, y) => r.platform(x0, y, x1 - x0 + 1);
const deco = (r, kind, x, y, o) => r.add(Object.assign({ type: 'decor', kind, x, y }, o || {}));
const light = (r, x, y, rad, color, intensity, flicker, extra) =>
  r.add(Object.assign({ type: 'light', x: Math.floor(x), y: Math.floor(y), r: rad, color, intensity, flicker: !!flicker }, extra || {}));   // centred on the tile
const enemy = (r, kind, x, y, o) => r.put(x, y, Object.assign({ type: 'enemy', kind }, o || {}));
const event = (r, script, x, y, o) => r.add(Object.assign({ type: 'event', script, x, y }, o || {}));
const respawn = (r, x, y, w, h) => r.add({ type: 'respawn', x, y, w, h });
// Secret pockets behind B walls / D floors are veiled automatically by the engine (G.World.hiddenPockets + art).

const EMBER = '#ff7a30', HOT = '#ffb060', RED = '#c8502c', CANDLE = '#ffc070', DUSK = '#e8a070', STEAM = '#d8c8b8';

const defs = [];
const done = (r, extra) => { defs.push(r.toDef(extra)); return r; };

// =====================================================================================================
// sf_02 — THE GREAT FLUE (32x81): the region's spine. A brick chimney 16 wide (cols 8-23) from the crown (N1)
// to the floor (row 78), crossed at row 33 by the iron gantry (W1 Broken Bridge <-> E2 Bellows Hall) whose
// 4-wide gap (cols 14-17) sits right under the crown. ABOVE the gantry: sheer brick, nothing to stand on until
// the loft landing (row 15, E1) and the crown neck (N1) — Wax Grip only. BELOW: iron rungs zig-zag (tops <= 4
// rows apart) down to the floor, the Pipeworks ledge (E3, row 51) and the den door (E4, rows 75-77).
// =====================================================================================================
function sf02() {
  const r = RK.room('sf_02');
  // ---- upper flue (grip gate)
  // QA: the chimney used to taper 2 tiles per step on BOTH sides; every step was an overhang a wall-climber could
  // only pass from a 0.25-tile band of the wall (3 such hops to reach N1). Now the west face (x = col 14) runs
  // sheer and unbroken from the gantry hall to the crown, flush with the throat: climb it straight out through N1.
  // The east side still steps in toward the throat (the loft side; its overhangs are never on the climb).
  air(r, 14, 1, 17, 3);                       // throat under N1
  air(r, 14, 4, 19, 7);                       // neck
  air(r, 14, 8, 21, 11);                      // shoulders
  air(r, 14, 12, 23, 29);                     // the upper chimney
  air(r, 24, 12, 30, 14);                     // E1: the loft landing (floor top row 15)
  plat(r, 19, 23, 15);                        // its iron balcony over the flue (catches a drop from the crown)
  // ---- the gantry hall: W1 corridor, catwalk, E2 corridor
  air(r, 1, 30, 30, 32);
  plat(r, 8, 13, 33); plat(r, 18, 23, 33);    // the catwalk; the gap (cols 14-17) drops down the flue
  air(r, 14, 33, 17, 33);
  // ---- lower flue
  air(r, 8, 34, 23, 77);
  air(r, 24, 48, 30, 50);                     // E3: Pipeworks ledge (floor top row 51)
  plat(r, 17, 23, 51);                        // ... its iron lip into the flue (as wide as every E rung: QA, the 20-23 lip needed coyote edge-jumps)
  air(r, 24, 75, 30, 77);                     // E4: the den door
  air(r, 3, 73, 7, 77);                       // the rest nook (sf_sconce_b)
  // rungs (tops <= 4 rows apart): W cols 8-14, E cols 17-23. QA: with 6-wide rungs (8-13 / 18-23) every 4-up hop had
  // to cross a 4-tile gap (take-off window ~1.2 tiles at the very edge, a miss falls to the floor); 7 wide leaves a
  // 2-tile gap (window ~3 tiles, like the Ember Shaft) and still a clean 2-wide drop line under the crown (cols 15-16)
  for (const [y, side] of [[36, 'E'], [39, 'W'], [43, 'E'], [47, 'W'], [55, 'W'], [58, 'E'], [62, 'W'], [66, 'E'], [70, 'W'], [74, 'E']]) {
    if (side === 'W') plat(r, 8, 14, y); else plat(r, 17, 23, y);
  }
  r.openExits();
  // ---- contents
  r.put(6, 32, { type: 'lore', id: 'lore_sf_2' });
  r.put(8, 77, { type: 'sconce', id: 'sf_sconce_b' });
  // crawlers hold short stretches of the lower walls (between rungs, clear of the E3/E4 doorways); bats circle
  // mid-shaft over the rung gap; all >= 12 tiles from the sconce
  enemy(r, 'chimney_crawler', 23, 40, { surface: 'right', range: 2 });
  enemy(r, 'chimney_crawler', 8, 51, { surface: 'left', range: 3 });
  enemy(r, 'chimney_crawler', 23, 62, { surface: 'right', range: 3 });
  enemy(r, 'ash_bat', 16, 53, { perch: 'air', leash: 8 });
  enemy(r, 'ash_bat', 15, 63, { perch: 'air', leash: 7 });
  // ---- the landmark: embers streaming up the whole flue from the furnace grate under the floor
  event(r, 'sf_embers', 14, 1, { c0: 14, c1: 19, r0: 1, r1: 77, rate: 30, v0: 80, v1: 190 });
  for (const c of [12, 15, 18]) deco(r, 'grate_glow', c, 77, { layer: 'back' });
  light(r, 15.5, 77, 6, '#ff5a1a', 0.6, true);
  for (const y of [8, 20, 40, 52, 64]) light(r, 15.5, y, 6, RED, 0.22);
  // the crown's draught: chains and an ember cage hang in the upper flue (decor, no footholds)
  deco(r, 'chain', 20, 8, { len: 220, layer: 'back' });
  deco(r, 'chain', 22, 12, { len: 120, hook: true, layer: 'back' });
  deco(r, 'cage_hanging', 19, 4, { len: 70, ember: true, layer: 'back' });
  // the gantry: lamps fence the gap; the rail lore; grates in the corridor walls
  deco(r, 'lamp_post', 13, 32, { lit: true });
  deco(r, 'lamp_post', 18, 32, { lit: true, flip: true });
  light(r, 13, 30.4, 4, CANDLE, 0.55, true); light(r, 18, 29.6, 4, CANDLE, 0.55, true);
  deco(r, 'grate_glow', 3, 32, { layer: 'back' }); deco(r, 'grate_glow', 28, 32, { layer: 'back' });
  light(r, 3, 32, 2.5, EMBER, 0.35, true); light(r, 28, 32, 2.5, EMBER, 0.35, true);
  deco(r, 'rubble', 25, 32);
  // the loft landing (E1): a lantern and a crate
  deco(r, 'lantern_hanging', 27, 12, { len: 20, lit: true });
  light(r, 27, 13, 3.5, CANDLE, 0.45, true);
  deco(r, 'crate', 29, 14);
  // E3 ledge, E4 door, the rest nook
  deco(r, 'lantern_hanging', 27, 48, { len: 14, lit: true }); light(r, 27, 49, 3, CANDLE, 0.4, true);
  deco(r, 'brazier', 4, 77); light(r, 4, 76, 4.5, CANDLE, 0.6, true);
  deco(r, 'bones', 21, 77); deco(r, 'rubble', 26, 77);
  deco(r, 'chain', 28, 75, { len: 40, hook: true });
  return done(r, { theme: { bg: 'shaft' }, bgSeed: 21 });
}


/** Round off a rectangular cavity's corner with a diagonal of solid (n tiles). which: 'tl','tr','bl','br'. */
function corner(r, x, y, n, which, ch = '#') {
  for (let i = 0; i < n; i++) for (let j = 0; j < n - i; j++) {
    r.set(which[1] === 'l' ? x + j : x - j, which[0] === 't' ? y + i : y - i, ch);
  }
}

// =====================================================================================================
// sf_01 — THE CHIMNEY TOPS (128x18, sky): Ash Ridge. West: the gatehouse tower (attached to the sky edge) with
// the one-way portcullis sf_gate1 (col 6) and the lever sf_lv1 (col 10) on its east side. East: ash-crusted roofs
// (floor top row 14) with 1-3 tile chimney stubs; the tallest stack (cols 60-63, glazed, flat top row 7) carries
// sf_geo1 - wings only; its base is an open hearth (bg wall) the roof walk passes through. S1 (cols 110-113) is
// the Great Flue's mouth inside a brick crown (dips to row 15 beside it). lore_sf_1 at col 92.
// =====================================================================================================
function sf01() {
  const r = RK.room('sf_01');
  air(r, 1, 1, 126, 13);                      // sky over the roofs (row 0 stays: invisible lid, openTop)
  // the gatehouse: a brick tower from the sky edge down to the lintel (row 9); corridor rows 10-13
  box(r, 1, 1, 8, 9);
  corner(r, 8, 9, 2, 'br', '.');              // a chamfer under the tower's east corner
  r.set(8, 9, '#');
  // roof line: 1-tile gutters (visual breaks) and chimney stubs (1-3 tiles; low ones only near the wings stack)
  for (const c of [29, 53, 69, 101]) r.set(c, 14, '.');
  for (const [x0, x1, h] of [[16, 17, 2], [24, 26, 1], [34, 35, 3], [42, 43, 2], [49, 50, 1], [74, 75, 1], [80, 81, 2], [87, 88, 3], [96, 97, 2]]) {
    box(r, x0, 14 - h, x1, 13);
  }
  // THE TALLEST STACK (wings reward): glazed crown rows 7-10 over an open hearth (bg wall rows 11-13)
  box(r, 58, 7, 64, 10, 'X');                 // 7 wide so the geode sits >= 3 tiles from either face
  // (its hearth, rows 11-13, is open air painted by the sf_stack set piece behind the terrain)
  // the Great Flue's crown around S1: rim (top row 12), bowl dipping to row 15 beside the mouth
  // QA: the ledges beside the mouth were at top row 15 - exactly the apex of the engine's upward exit boost
  // (exitUpRise 3.03 tiles above the bottom edge), so a climber leaving the flue could barely land. Now they are at
  // top row 16 (2 above the edge, like sf_06's S1); the rims drop to 1 tile so the climb out of the bowl stays 3.
  box(r, 105, 13, 106, 13); box(r, 117, 13, 118, 13);
  air(r, 107, 14, 116, 15);
  // the east end: a giant ruined stack against the sky edge
  box(r, 121, 3, 126, 13); corner(r, 121, 3, 2, 'tl', '.');
  r.openExits();
  air(r, 110, 16, 113, 16);
  // ---- contents
  r.put(6, 13, { type: 'gate', id: 'sf_gate1', opens: 'lever:sf_lv1', w: 1, h: 4 });
  r.put(10, 13, { type: 'lever', id: 'sf_lv1' });
  r.put(92, 13, { type: 'lore', id: 'lore_sf_1' });
  r.put(61, 6, { type: 'geode', id: 'sf_geo1', amount: 90 });
  // ash bats circle the stacks east of the wings stack (leashed >= 12 tiles clear of it: no pogo onto its top);
  // a pair of soot sprites bobs over the western roofs (>= 8 tiles from the gate and lever)
  // QA: the bats used to bracket lore_sf_1 (homes 84 / 97, leash 8) and swooped a player reading the plaque; now both
  // hold the stacks between the wings stack and the plaque, short leashes (>= 11 tiles from the stack's face)
  enemy(r, 'ash_bat', 79, 7, { perch: 'air', leash: 4 });
  enemy(r, 'ash_bat', 84, 5, { perch: 'air', leash: 4 });
  enemy(r, 'soot_sprite', 30, 10, { leash: 9 });
  enemy(r, 'soot_sprite', 32, 9, { leash: 9 });
  // ---- set pieces: the open dusk sky (QA: the region backdrop closes every room with a soot ceiling), the glazed
  // stack, ruined stacks smoking behind the roofs, the Great Flue's crown
  event(r, 'sf_sky', 0, 0, { z: -30, h: 0.45, moon: [0.72, 0.17] });
  const stack = { c0: 58, c1: 64, top: 7, base: 13, hearth: [11, 13], front: [7, 10], glaze: true, seed: 5 };
  event(r, 'sf_stack', 58, 7, Object.assign({ z: -15, smoke: true }, stack));
  event(r, 'sf_stack', 58, 8, Object.assign({ z: -5, part: 'front' }, stack));
  event(r, 'sf_crown', 107, 10, { z: -15, c0: 107, c1: 116, top: 10, floor: 15, mouth: [110, 113] });
  light(r, 111.5, 15, 8, '#ff5a1a', 0.55, true);
  light(r, 61, 13, 3.5, EMBER, 0.45, true);                  // the banked hearth under the stack
  // the gatehouse: a lamp by the lever, a sign of the stokers' road
  deco(r, 'lamp_post', 13, 13, { lit: true });
  light(r, 13, 10.6, 4, CANDLE, 0.5, true);
  deco(r, 'crate', 3, 13); deco(r, 'crate', 4, 13, { variant: 1 });
  // roof clutter: vent pipes, rubble, a coal cart, bones of a sweep who sat down
  deco(r, 'pipe_v', 27, 13, { len: 110, steam: true, layer: 'back' });
  deco(r, 'pipe_v', 71, 13, { len: 90, steam: true, layer: 'back' });
  deco(r, 'pipe_v', 103, 13, { len: 70, layer: 'back' });
  deco(r, 'cart', 39, 13, { layer: 'back' });
  deco(r, 'rubble', 22, 13); deco(r, 'rubble', 56, 13); deco(r, 'rubble', 84, 13); deco(r, 'rubble', 123, 13);
  deco(r, 'bones', 90, 13);
  deco(r, 'grate_glow', 66, 13, { layer: 'back' });
  light(r, 66, 13, 2.5, EMBER, 0.35, true);
  deco(r, 'lamp_post', 95, 13, { lit: true, layer: 'back' });
  light(r, 95, 10.6, 4, CANDLE, 0.45, true);
  return done(r, { theme: { bg: 'sky' }, bgSeed: 11 });
}

// =====================================================================================================
// sf_09 — THE SOOT LOFTS (96x18): old rafters (floor top row 15) with 2-3 tile gaps (floor of the gaps row 17)
// under a pitched loft roof; soot-sacks hang from the beams; Kiln Glass sf_kg on a cooling rack (col 50); a
// stoker shovels on the rafter at col 70. Reached only by wall-climbing (Great Flue E1 / Ember Shaft W1).
// =====================================================================================================
function sf09() {
  const r = RK.room('sf_09');
  air(r, 1, 3, 94, 14);
  for (let c = 8; c <= 88; c += 16) { box(r, c - 2, 3, c + 2, 3); box(r, c - 1, 4, c + 1, 4); } // roof trusses (hang)
  for (const [x0, x1] of [[11, 12], [23, 25], [37, 38], [57, 59], [63, 64], [81, 83]]) air(r, x0, 15, x1, 16);
  plat(r, 26, 33, 10); plat(r, 42, 47, 9); plat(r, 85, 90, 10);      // upper beams (one-way)
  r.openExits();
  r.put(50, 13, { type: 'pickup', item: 'kiln_glass', id: 'sf_kg', floating: true });
  enemy(r, 'soot_sprite', 33, 12, { leash: 9 });
  enemy(r, 'soot_sprite', 35, 11, { leash: 9 });
  enemy(r, 'soot_sprite', 37, 12, { leash: 9 });
  enemy(r, 'stoker', 70, 14, { range: 5, facing: 'left' });   // its rafter: cols 65-80
  // soot-sacks from the trusses and the roof; the cooling rack; lanterns on the beams
  event(r, 'sf_sacks', 30, 3, { z: -15, sacks: [[7, 4, 30], [9, 4, 56, 0.9], [23, 4, 40], [25, 4, 22, 0.8], [31, 2, 70, 1.1], [35, 2, 96], [39, 4, 46],
    [41, 4, 26, 0.9], [55, 4, 34], [57, 4, 60], [64, 2, 84, 1.1], [71, 4, 24, 0.8], [73, 4, 52], [87, 4, 38], [89, 4, 20, 0.8]] });
  event(r, 'sf_rack', 50, 14, { z: -15 });
  light(r, 50, 12.5, 4, HOT, 0.5, true);
  deco(r, 'lantern_hanging', 16, 3, { len: 70, lit: true }); light(r, 16, 5.5, 4, CANDLE, 0.45, true);
  deco(r, 'lantern_hanging', 80, 3, { len: 60, lit: true }); light(r, 80, 5.2, 4, CANDLE, 0.45, true);
  deco(r, 'crate', 4, 14); deco(r, 'crate', 46, 14); deco(r, 'crate', 47, 14, { variant: 1 }); deco(r, 'crate', 92, 14);
  deco(r, 'rubble', 19, 14); deco(r, 'bones', 61, 14);
  for (const c of [12, 24, 38, 58, 82]) light(r, c, 16, 2.2, EMBER, 0.3, true);   // the warm floor below the rafters
  return done(r, { theme: { bg: 'interior' }, bgSeed: 9 });
}

// =====================================================================================================
// sf_03 — BELLOWS HALL (96x18): long hall, floor top row 15. Between cols 37 and 60 the brickwork hangs low
// (solid rows 0-8; 0-9 over the smithy). The giant bellows heave in the background (cols 40-56). SECRET: a
// furnace plinth (top row 12) -> brick cornice (top row 9) -> cracked wall (B, cols 37-38, rows 6-8) -> the
// smithy (cols 39-46, rows 6-8) with the Quickwick sigil on an anvil.
// =====================================================================================================
function sf03() {
  const r = RK.room('sf_03');
  air(r, 1, 3, 94, 14);
  corner(r, 1, 3, 2, 'tl'); corner(r, 94, 3, 2, 'tr');
  box(r, 37, 3, 60, 8);                        // the low brickwork
  box(r, 37, 9, 46, 9);                        // ... deeper over the smithy (its floor)
  air(r, 39, 6, 46, 8);                        // the smithy
  box(r, 37, 6, 38, 8, 'B');                   // its cracked wall
  box(r, 29, 9, 36, 9); r.set(36, 10, '#');    // brick cornice + corbel
  box(r, 25, 12, 27, 14);                      // furnace plinth (climb aid)
  r.openExits();
  r.put(18, 14, { type: 'sconce', id: 'sf_sconce_a' });
  r.put(31, 14, { type: 'lore', id: 'lore_sf_3' });
  r.put(43, 8, { type: 'pickup', item: 'sigil', sigil: 'swift_brand', id: 'sf_sig_swift_brand' });
  enemy(r, 'stoker', 50, 14, { range: 5, facing: 'left' });
  enemy(r, 'stoker', 73, 14, { range: 5 });
  enemy(r, 'soot_sprite', 64, 10, { leash: 8 });
  // the bellows (landmark), the rest, the plinth, the smithy (its forge glow seeps through the veil: the hint)
  event(r, 'sf_bellows', 48, 14, { z: -15, cx: 48, base: 14, span: 6.5, ceil: 9 });
  light(r, 48, 13, 5, EMBER, 0.4, true);
  deco(r, 'brazier', 15, 14); light(r, 15, 12.8, 4.5, CANDLE, 0.6, true);
  deco(r, 'grate_glow', 24, 14, { layer: 'back' }); light(r, 24, 14, 2.5, EMBER, 0.4, true);
  deco(r, 'crate', 26, 11); deco(r, 'rubble', 33, 8);
  deco(r, 'anvil', 41, 8); deco(r, 'grate_glow', 45, 8, { layer: 'back' }); light(r, 43, 7, 3.5, EMBER, 0.5, true);
  deco(r, 'lantern_hanging', 8, 3, { len: 40, lit: true }); light(r, 8, 4.5, 3.5, CANDLE, 0.4, true);
  deco(r, 'lantern_hanging', 66, 3, { len: 60, lit: true }); light(r, 66, 5, 4, CANDLE, 0.4, true);
  deco(r, 'lantern_hanging', 84, 3, { len: 50, lit: true }); light(r, 84, 4.8, 4, CANDLE, 0.4, true);
  deco(r, 'chain', 30, 3, { len: 90, hook: true, layer: 'back' }); deco(r, 'chain', 77, 3, { len: 150, layer: 'back' });
  deco(r, 'pipe_v', 4, 14, { len: 200, steam: true, layer: 'back' }); deco(r, 'pipe_v', 91, 14, { len: 200, layer: 'back' });
  deco(r, 'gear', 62, 14, { layer: 'back' });
  deco(r, 'cart', 82, 14, { layer: 'back' }); deco(r, 'rubble', 57, 14); deco(r, 'bones', 88, 14);
  return done(r, { theme: { bg: 'interior' }, bgSeed: 3 });
}

// =====================================================================================================
// sf_04 — THE EMBER SHAFT (32x54): W2 landing (row 24) -> zig-zag one-way platforms (27, 30, 34, 38) -> W3
// floor (row 42). ABOVE W2: an 8-wide brick shaft, sheer for 18 tiles (Wax Grip) to the top landing (row 6, W1)
// whose B partition (cols 22-23) hides spark_sf. PLUNGE: D floor (cols 8-15, rows 42-43) over a sealed vault
// (rows 44-50, floor 51) holding sf_hw1; rungs at rows 48/45 (cols 16-19) climb back out.
// =====================================================================================================
function sf04() {
  const r = RK.room('sf_04');
  air(r, 1, 1, 21, 5); corner(r, 1, 1, 2, 'tl'); // top landing (floor row 6)
  box(r, 22, 3, 23, 5, 'B'); air(r, 24, 3, 30, 5);   // partition + the spark cubby
  air(r, 12, 6, 19, 20);                       // the climb (grip gate)
  plat(r, 12, 15, 6);                          // an iron hatch-grate over half the climb (walk W1 -> cubby)
  air(r, 1, 21, 10, 23);                       // W2 landing (floor row 24)
  air(r, 11, 21, 26, 41);                      // the ember shaft proper
  corner(r, 26, 21, 3, 'tr');
  air(r, 1, 39, 10, 41);                       // W3 corridor (floor row 42)
  plat(r, 13, 17, 27); plat(r, 20, 25, 30); plat(r, 12, 17, 34); plat(r, 20, 25, 38);
  // QA: the climb's faces end at row 20 and the W2 landing has a 3-tile ceiling, so the only way onto them was a
  // jump from the last 5 px of the landing's lip. An iron catwalk continues the landing under the climb: jump
  // straight up from it and catch either face (no-grip players gain nothing: 18 sheer tiles above).
  plat(r, 11, 17, 24);
  // the plunge vault
  box(r, 8, 42, 15, 43, 'D');
  air(r, 4, 44, 26, 50);
  air(r, 16, 43, 19, 43); air(r, 4, 43, 7, 43);
  // rungs back out on both sides of the hole. QA: the upper rungs reach 2 tiles in under the broken floor - with
  // rungs only under the intact floor (cols 4-7 / 16-19) the way out was a coyote jump off the rung's edge
  plat(r, 16, 19, 48); plat(r, 14, 19, 45);
  plat(r, 4, 7, 48); plat(r, 4, 9, 45);
  r.openExits();
  r.put(28, 5, { type: 'pickup', item: 'spark', id: 'spark_sf' });
  r.put(6, 50, { type: 'pickup', item: 'heartwax', id: 'sf_hw1' });
  enemy(r, 'ash_bat', 17, 32, { perch: 'air', leash: 6 });
  enemy(r, 'ash_bat', 22, 36, { perch: 'air', leash: 6 });
  enemy(r, 'chimney_crawler', 26, 33, { surface: 'right', range: 3 });
  // the ember stream rises from the furnace grates on the shaft floor up through the climb
  event(r, 'sf_embers', 12, 6, { c0: 12, c1: 25, r0: 6, r1: 41, rate: 14 });
  for (const c of [18, 21, 24]) deco(r, 'grate_glow', c, 41, { layer: 'back' });
  light(r, 21, 41, 5, '#ff5a1a', 0.55, true);
  for (const y of [10, 18, 30]) light(r, 16, y, 5, RED, 0.22);
  deco(r, 'lantern_hanging', 5, 1, { len: 40, lit: true }); light(r, 5, 3, 3.5, CANDLE, 0.45, true);
  // QA: the far half of the top landing (the open climb, the ledge at cols 20-21, the cracked partition) was pitch
  // black - a lamp over the hole's far lip shows the hop and the cracks; the climb's lips catch the ember glow
  deco(r, 'lantern_hanging', 20, 1, { len: 50, lit: true }); light(r, 20, 3.4, 4.5, CANDLE, 0.5, true);
  light(r, 17.5, 7, 3.5, EMBER, 0.3, true);
  deco(r, 'crate', 2, 5); deco(r, 'rubble', 20, 5); deco(r, 'bones', 25, 5);
  deco(r, 'lantern_hanging', 5, 21, { len: 14, lit: true }); light(r, 5, 22, 3, CANDLE, 0.4, true);
  deco(r, 'chain', 14, 6, { len: 160, layer: 'back' });
  deco(r, 'rubble', 4, 41);
  deco(r, 'bones', 10, 50); deco(r, 'rubble', 22, 50); light(r, 6, 49, 3, HOT, 0.4, true);
  return done(r, { theme: { bg: 'shaft' }, bgSeed: 4 });
}

// =====================================================================================================
// sf_07 — THE PIPEWORKS (96x27): upper walkway (floor top row 15) W1 <-> E1 under ceiling pipe runs; an iron
// grate over a stairwell (cols 6-11) leads down 3-tile steps to the lower level (floor top row 24). OILCLOAK: the
// cooling cistern (meltwater cols 31-46, rows 22-23) under the giant pipe (underside row 19: 3 tiles of air);
// beyond it the dry valve room (cols 48-58) holds sf_geo2.
// =====================================================================================================
function sf07() {
  const r = RK.room('sf_07');
  air(r, 1, 5, 94, 14);
  corner(r, 1, 5, 2, 'tl'); corner(r, 94, 5, 2, 'tr');
  box(r, 18, 5, 33, 6); box(r, 62, 5, 77, 6);  // ceiling pipe runs (crawlers)
  box(r, 40, 14, 41, 14);                      // valve housing on the walkway (hop)
  box(r, 66, 13, 67, 14);                      // a pump housing (2 high)
  // stairwell + lower level
  air(r, 6, 15, 11, 23); plat(r, 6, 11, 15);
  box(r, 6, 18, 8, 23); box(r, 9, 21, 11, 23);
  air(r, 12, 19, 58, 23);
  box(r, 30, 22, 30, 23); box(r, 47, 22, 47, 23);   // cistern rims
  box(r, 31, 22, 46, 23, '~');                 // the cooling cistern
  r.openExits();
  r.put(53, 23, { type: 'geode', id: 'sf_geo2', amount: 100 });
  enemy(r, 'chimney_crawler', 25, 7, { surface: 'ceiling', range: 6 });
  enemy(r, 'chimney_crawler', 70, 7, { surface: 'ceiling', range: 6 });
  enemy(r, 'stoker', 50, 14, { range: 5 });
  enemy(r, 'ash_bat', 57, 8);
  // the giant cistern pipe and the ceiling runs (iron skins over the solid tiles), steam vents, valves, gears
  event(r, 'sf_pipe', 29, 16, { z: -5, c0: 29, c1: 48, r0: 16, r1: 18, flange: 5, drip: true });
  event(r, 'sf_pipe', 18, 5, { z: -5, c0: 18, c1: 33, r0: 5, r1: 6, flange: 4 });
  event(r, 'sf_pipe', 62, 5, { z: -5, c0: 62, c1: 77, r0: 5, r1: 6, flange: 4 });
  for (const c of [14, 36, 58, 84]) deco(r, 'pipe_v', c, 14, { len: 230, steam: c !== 58, layer: 'back' });
  deco(r, 'gear', 20, 23, { layer: 'back' }); deco(r, 'gear', 55, 23, { layer: 'back' });
  deco(r, 'pipe_v', 50, 23, { len: 150, steam: true, layer: 'back' });
  deco(r, 'grate_glow', 90, 14, { layer: 'back' }); light(r, 90, 14, 2.5, EMBER, 0.4, true);
  deco(r, 'lantern_hanging', 8, 5, { len: 60, lit: true }); light(r, 8, 7, 4, CANDLE, 0.45, true);
  deco(r, 'lantern_hanging', 47, 5, { len: 70, lit: true }); light(r, 47, 7.2, 4, CANDLE, 0.45, true);
  deco(r, 'lantern_hanging', 88, 5, { len: 50, lit: true }); light(r, 88, 6.8, 4, CANDLE, 0.45, true);
  deco(r, 'crate', 16, 23); deco(r, 'rubble', 26, 23); deco(r, 'bones', 57, 23);
  light(r, 38.5, 21, 5, '#8ab0c8', 0.22);                     // the cool meltwater
  light(r, 53, 21, 3.5, HOT, 0.4, true);
  respawn(r, 25, 23, 9, 4);                    // box cols 20.5-29.5: ends at the west rim
  respawn(r, 52, 23, 9, 4);                    // box cols 47.5-56.5: valve room side
  return done(r, { theme: { bg: 'interior' }, bgSeed: 7 });
}

// =====================================================================================================
// sf_06 — SHRINE OF THE WAX GRIP (48x27): soot-streaked chapel (floor top row 24); the Grip pedestal (col 12),
// lore_sf_4 (col 6). East: a sheer 8-tile brick wall (cols 22-25, top row 16) - the grip lesson and gate - and
// beyond it the chute (cols 26-46) with S1 (cols 36-39) dropping into the Ashpit (dips to row 25 beside it).
// =====================================================================================================
function sf06() {
  const r = RK.room('sf_06');
  air(r, 1, 6, 46, 23);
  corner(r, 1, 6, 4, 'tl'); corner(r, 46, 6, 3, 'tr');
  air(r, 28, 2, 44, 5); corner(r, 28, 2, 2, 'tl'); corner(r, 44, 2, 2, 'tr');   // the chute rises into soot
  box(r, 22, 16, 25, 23);                      // THE WALL
  air(r, 33, 24, 42, 24);                      // dips beside the mouth
  r.openExits();
  air(r, 36, 24, 39, 25);
  r.put(12, 23, { type: 'shrine', ability: 'grip', requires: 'boss:matron' });
  r.put(6, 23, { type: 'lore', id: 'lore_sf_4' });
  // candles at the pedestal, the Ashpit's red glow over the wall, embers drifting up the chute
  deco(r, 'candle_cluster', 9, 23, { lit: true }); deco(r, 'candle_cluster', 15, 23, { lit: true, count: 4 });
  light(r, 12, 22, 5, CANDLE, 0.55, true);
  deco(r, 'brazier', 3, 23); light(r, 3, 22, 4, CANDLE, 0.5, true);
  deco(r, 'arch', 12, 23, { layer: 'back', dim: 0.45, scale: 1.4 });          // the apse framing the pedestal
  deco(r, 'statue_waxen', 18, 23, { variant: 1, flip: true, dim: 0.5, layer: 'back' });
  deco(r, 'chain', 12, 6, { len: 150, layer: 'back' }); deco(r, 'cage_hanging', 18, 6, { len: 110, ember: true, layer: 'back' });
  light(r, 37.5, 22, 7, '#ff4a14', 0.6, true); light(r, 36, 9, 8, RED, 0.3);
  event(r, 'sf_embers', 30, 6, { c0: 30, c1: 44, r0: 6, r1: 23, rate: 6, v0: 40, v1: 90 });
  deco(r, 'rubble', 28, 23); deco(r, 'rubble', 44, 23); deco(r, 'bones', 31, 23);
  return done(r, { theme: { bg: 'interior' }, bgSeed: 6 });
}

// =====================================================================================================
// sf_08 — THE ASHPIT (64x18): bed of warm ash (floor top row 15); one-way platforms (12, 8, 4) under N1 up into the
// shrine's chute; E1 through a heavy iron door frame to the Chandlery. SECRET: compacted-ash wall (B, cols 6-7,
// rows 12-14) hides a niche (cols 1-5) with sf_geo3.
// =====================================================================================================
function sf08() {
  const r = RK.room('sf_08');
  air(r, 8, 3, 62, 14);
  air(r, 18, 1, 25, 2);                        // the chute's throat under N1
  box(r, 56, 3, 62, 11);                       // the door wall over E1
  corner(r, 55, 3, 3, 'tr', '#');
  box(r, 6, 12, 7, 14, 'B'); air(r, 1, 12, 5, 14);
  plat(r, 14, 18, 12); plat(r, 20, 24, 8); plat(r, 19, 24, 4);   // QA: row 8 was cols 23-27 (4-up over a 4-gap: ~0.5-tile take-off window)
  box(r, 29, 14, 32, 14); box(r, 30, 13, 31, 13);   // a drift of compacted ash (hop)
  box(r, 52, 14, 54, 14);
  r.openExits();
  r.put(3, 14, { type: 'geode', id: 'sf_geo3', amount: 70 });
  enemy(r, 'chimney_crawler', 34, 14, { surface: 'floor', range: 5 });
  enemy(r, 'chimney_crawler', 46, 14, { surface: 'floor', range: 5, facing: 'left' });
  enemy(r, 'ash_bat', 40, 6);
  // the door to the Chandlery, warm ash glowing, chains and a cart of slag
  event(r, 'sf_door', 59, 12, { z: -5, c: 59, r0: 12, r1: 14 });
  light(r, 62, 13, 5, '#ff6a2a', 0.6, true);
  for (const c of [12, 30, 41, 50]) { deco(r, 'grate_glow', c, 14, { layer: 'back' }); light(r, c, 14, 2.5, EMBER, 0.4, true); }
  event(r, 'sf_embers', 9, 4, { c0: 9, c1: 54, r0: 4, r1: 14, rate: 5, v0: 20, v1: 60 });
  deco(r, 'lantern_hanging', 37, 3, { len: 30, lit: true }); light(r, 37, 4.4, 4, CANDLE, 0.4, true);
  deco(r, 'cart', 52, 14, { layer: 'back' }); deco(r, 'rubble', 9, 14); deco(r, 'bones', 27, 14); deco(r, 'rubble', 44, 14);
  deco(r, 'chain', 31, 3, { len: 120, hook: true, layer: 'back' });
  return done(r, { theme: { bg: 'interior' }, bgSeed: 8 });
}

// =====================================================================================================
const builders = { sf01, sf02, sf09, sf03, sf04, sf07, sf06, sf08 };
const only = process.argv.slice(2).filter((a) => !a.startsWith('--'));
for (const [name, fn] of Object.entries(builders)) {
  const r = fn();
  if (process.argv.includes('--print') && (!only.length || only.includes(name) || only.includes(r.id))) {
    console.log('\n' + r.id + '\n' + r.ascii().split('\n').map((l, i) => String(i).padStart(2) + ' ' + l).join('\n'));
  }
}
const out = RK.emit('flue', defs, path.join('src', 'data', 'regions', 'flue.js'),
  'THE SOOTFLUE (region builder: region-flue). Arena sf_05 lives in src/data/arenas/matron.js');
console.log('wrote ' + path.relative(path.resolve(__dirname, '../..'), out) + ' (' + defs.length + ' rooms)');
