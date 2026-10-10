#!/usr/bin/env node
// tools/gen/chandlery.js — generator for THE CHANDLERY (region builder: region-chandlery).
// Builds every NON-arena room of region 'chandlery' with tools/lib/roomkit.js exactly to design/world_plan.json and
// emits src/data/regions/chandlery.js. Never hand-edit the emitted file: edit this, then re-run:
//   node tools/gen/chandlery.js [--print] [ch_02 ...]     (--print dumps the rooms as ASCII with row numbers)
// Coordinates: x = column, y = row (room-local, 0-based). Helpers take INCLUSIVE rectangles.
// The arena ch_09 (The Kiln Heart) lives in src/data/arenas/kilnmother.js (boss builder).
// Region set pieces drawn by code (event scripts ch_*) live in src/entities/enemies/chandlery.js.
// Notes / design decisions: docs/api/region-chandlery.md.
'use strict';
const path = require('path');
const RK = require('../lib/roomkit');

// ------------------------------------------------------------------ helpers
const box = (r, x0, y0, x1, y1, ch = '#') => r.fill(x0, y0, x1 - x0 + 1, y1 - y0 + 1, ch);
const air = (r, x0, y0, x1, y1) => box(r, x0, y0, x1, y1, '.');
const plat = (r, x0, x1, y) => r.platform(x0, y, x1 - x0 + 1);
const deco = (r, kind, x, y, o) => r.add(Object.assign({ type: 'decor', kind, x, y }, o || {}));
// QA: a pair of hanger chains threaded through an N1 platform ladder, from the shaft (row 0) to the lowest platform top
const ladderChains = (r, cols, yBottom) => { for (const x of cols) deco(r, 'chain', x, 0, { len: yBottom * 40 + 2, layer: 'back' }); };
const light = (r, x, y, rad, color, intensity, flicker, extra) =>
  r.add(Object.assign({ type: 'light', x: Math.floor(x), y: Math.floor(y), r: rad, color, intensity, flicker: !!flicker }, extra || {}));
const enemy = (r, kind, x, y, o) => r.put(x, y, Object.assign({ type: 'enemy', kind }, o || {}));
const event = (r, script, x, y, o) => r.add(Object.assign({ type: 'event', script, x, y }, o || {}));
// respawn: ground-stander at (x, y); trigger box w tiles wide centred on the column, h tall (feet row up)
const respawn = (r, x, y, w, h) => r.add({ type: 'respawn', x, y, w, h: h || 4 });
// Secret pockets behind B walls / D floors are veiled automatically by the engine (G.World.hiddenPockets + art).

const MOLTEN = '#ff8a24', HOT = '#ffb060', EMBER = '#ff6a1e', CANDLE = '#ffc070', FROST = '#9cc8ff', STEAM = '#e8d8c8';

const defs = [];
const done = (r, extra) => { defs.push(r.toDef(extra)); return r; };

/** Round off a cavity corner with a diagonal of solid (n tiles). which: 'tl','tr','bl','br'. */
function corner(r, x, y, n, which, ch = '#') {
  for (let i = 0; i < n; i++) for (let j = 0; j < n - i; j++) r.set(which[1] === 'l' ? x + j : x - j, which[0] === 't' ? y + i : y - i, ch);
}
/** Lower the ceiling: solid from row 0 down to row y (incl.) over cols x0..x1. */
const ceil = (r, x0, x1, y) => box(r, x0, 0, x1, y);

// =====================================================================================================
// ch_10 — THE SLAG GATE (64x18): the upper entrance from the Ashpit (W1). The floor (top 15) dips around the S1
// hole (cols 8-11) down to the Pouring Floor; east of it the great slag-crusted gate (a riveted header over cols
// 17-23, lore_ch_1 under it), then the hall to the slag-brick store. SECRET: B wall cols 50-51 rows 12-14 -> store
// cols 52-62 rows 11-14 with Kiln Glass ch_kg on a rack.
// =====================================================================================================
function ch10() {
  const r = RK.room('ch_10');
  air(r, 1, 6, 49, 14);                         // the hall
  air(r, 24, 4, 46, 5);                         // higher vault east of the gate
  ceil(r, 1, 4, 11);                            // the doorway passage from the Ashpit (rows 12-14)
  corner(r, 5, 6, 3, 'tl');
  air(r, 5, 15, 7, 15); air(r, 12, 15, 14, 15); // S1 dips (floor top 16)
  air(r, 8, 15, 11, 17);                        // S1 hole
  box(r, 17, 6, 23, 8);                         // the gate's riveted header (passage rows 9-14 under it)
  corner(r, 46, 4, 3, 'tr'); box(r, 47, 6, 49, 6); r.set(49, 7, '#');   // the vault's east shoulder
  box(r, 41, 14, 45, 14); box(r, 42, 13, 44, 13);   // a heap of cooled slag
  // the store
  box(r, 50, 12, 51, 14, 'B');
  air(r, 52, 11, 62, 14);
  r.openExits();
  // ---- contents
  r.put(20, 14, { type: 'lore', id: 'lore_ch_1' });
  r.put(58, 14, { type: 'pickup', item: 'kiln_glass', id: 'ch_kg' });
  enemy(r, 'moldling', 28, 14, { range: 4, facing: 'left' });
  enemy(r, 'moldling', 36, 14, { range: 4 });
  enemy(r, 'forge_wisp', 33, 9, { leash: 7 });
  // ---- dressing
  event(r, 'ch_gate', 17, 6, { c0: 17, c1: 23, r0: 6, r1: 8, r2: 15 });   // the riveted header + raised portcullis
  light(r, 20, 10, 5, EMBER, 0.45, true);
  deco(r, 'lantern_hanging', 13, 6, { len: 40, lit: true }); light(r, 13, 8, 4, CANDLE, 0.5, true);
  deco(r, 'lantern_hanging', 30, 4, { len: 60, lit: true }); light(r, 30, 7, 4, CANDLE, 0.45, true);
  deco(r, 'chain', 38, 4, { len: 150, hook: true, layer: 'back' });
  deco(r, 'chain', 42, 4, { len: 90, layer: 'back' });
  deco(r, 'grate_glow', 26, 14, { layer: 'back' }); light(r, 26, 14, 2.5, EMBER, 0.4, true);
  deco(r, 'grate_glow', 39, 14, { layer: 'back' }); light(r, 39, 14, 2.5, EMBER, 0.4, true);
  deco(r, 'crate', 47, 14); deco(r, 'crate', 48, 14, { variant: 1 }); deco(r, 'rubble', 46, 14, { layer: 'front' });
  deco(r, 'rubble', 2, 14); deco(r, 'cart', 33, 14, { layer: 'back' });
  light(r, 58, 12, 3, HOT, 0.35, true);         // the store (shows faintly through its veil: the hint)
  deco(r, 'mold_stack', 54, 14, { layer: 'back' }); deco(r, 'crate', 61, 14); deco(r, 'crate', 61, 13, { variant: 1 });
  return done(r, { theme: { bg: 'interior' }, bgSeed: 194 });   // QA: reseeded so the art's procedural decor stays out of the S holes, doorways and off the pickups
}

// =====================================================================================================
// ch_03 — THE POURING FLOOR (64x27): floor top 24 (W1/E1 rows 21-23). The molten channel (% rows 24-25) at cols
// 22-30, crossed on two iron grates (= top 21, cols 21-24 / 28-31). N1 (cols 40-43) from the Slag Gate: platform
// ladder (tops 21, 17, 13, 9, 5). East: a crate stack (top 21, hopped over) and a chain-hung mold rack shelf (= top
// 18, ch_geo2 at col 52); the ladle_brute patrols under the rack and guards the door to the Crucible Climb.
// =====================================================================================================
function ch03() {
  const r = RK.room('ch_03');
  air(r, 1, 4, 62, 23);
  air(r, 8, 3, 56, 3); air(r, 38, 1, 45, 2);   // vault + N1 neck
  ceil(r, 1, 3, 15); corner(r, 4, 15, 3, 'tl');  // west door hood
  ceil(r, 58, 62, 15); corner(r, 57, 15, 3, 'tr'); // east door hood
  corner(r, 37, 3, 2, 'tr'); corner(r, 46, 3, 2, 'tl');
  box(r, 22, 24, 30, 25, '%');                   // the molten channel
  plat(r, 21, 24, 21); plat(r, 28, 31, 21);      // iron grates
  for (const [y, x0, x1] of [[21, 38, 43], [17, 40, 45], [13, 38, 43], [9, 40, 45], [5, 39, 44]]) plat(r, x0, x1, y);
  ladderChains(r, [40, 43], 21);
  box(r, 47, 21, 48, 23);                        // crate stack (hopped over on the way to E1)
  plat(r, 50, 55, 18);                           // the mold rack shelf (chain-hung, 3 above the crates)
  r.openExits();
  // ---- contents
  r.put(52, 17, { type: 'geode', id: 'ch_geo2', amount: 60 });
  enemy(r, 'moldling', 12, 23, { range: 3 });     // QA: beat 9-15, clear of the W1 landing (was col 10)
  enemy(r, 'moldling', 17, 23, { range: 3, facing: 'left' });
  enemy(r, 'moldling', 34, 23, { range: 2 });
  enemy(r, 'ladle_brute', 52, 23, { range: 3, facing: 'left' });   // QA: beat 49-55 (was 52-58: hit players stepping in from E1)
  respawn(r, 15, 23, 13); respawn(r, 35, 23, 9);   // boxes end at the channel lips (cols 21 / 31)
  respawn(r, 22, 20, 5, 3); respawn(r, 29, 20, 5, 3);   // QA: the grates respawn at their centre, never on an end lip
  // ---- dressing
  light(r, 26, 24, 7, MOLTEN, 0.55, true);
  event(r, 'ch_pour', 24, 3, { c: 24, r0: 3, ry: 11, y1: 24 });   // the giant ladle tipping into the channel
  deco(r, 'ladle', 16, 3, { len: 190 }); deco(r, 'ladle', 33, 3, { len: 150 });
  deco(r, 'vat', 6, 23, { layer: 'back' }); light(r, 6, 22, 4, MOLTEN, 0.5, true);
  deco(r, 'mold_stack', 13, 23, { layer: 'back' }); deco(r, 'mold_stack', 36, 23, { layer: 'back' });
  // the rack shelf hangs on two chains from the vault (QA: the gear that sat in the E hood's rock corner is gone)
  deco(r, 'chain', 50, 3, { len: 604, layer: 'back' }); deco(r, 'chain', 55, 3, { len: 604, layer: 'back' });
  deco(r, 'crate', 60, 23); deco(r, 'anvil', 45, 23, { layer: 'back' });
  deco(r, 'lantern_hanging', 49, 3, { len: 160, lit: true }); light(r, 49, 8, 4, CANDLE, 0.5, true);
  deco(r, 'lantern_hanging', 8, 3, { len: 80, lit: true }); light(r, 8, 6, 4, CANDLE, 0.45, true);
  deco(r, 'chain', 26, 3, { len: 200, hook: true, layer: 'back' });
  return done(r, { theme: { bg: 'interior' }, bgSeed: 103 });
}

// =====================================================================================================
// ch_04 — THE CRUCIBLE CLIMB (64x36): the Molten Plunge shrine behind GRIP + DASH (or grip + wings). Foot ledge
// (W1, top 24), stepping blocks (top 24) over the molten lake (% rows 32-34), the Crucible Wall (cols 30-33, a sheer
// grippable west face rows 10-20; its east face glazed) with a tunnel under it to the east ledge (dead end). From
// the wall top a 9-tile gap (cols 34-42) to the brim (cols 43-62, rows 10-12, glazed, D patch cols 46-49): the
// shrine at col 56. Way back: dash back, or plunge through the D patch onto the east ledge.
// =====================================================================================================
function ch04() {
  const r = RK.room('ch_04');
  air(r, 1, 2, 62, 31);
  box(r, 1, 24, 10, 35);                         // foot ledge
  box(r, 11, 32, 62, 34, '%');                   // the molten lake
  box(r, 15, 24, 18, 35); box(r, 24, 24, 27, 35);   // stepping blocks
  box(r, 30, 10, 33, 20); box(r, 30, 24, 33, 35);   // the Crucible Wall + tunnel floor
  box(r, 33, 10, 33, 20, 'X');                   // its east face is glazed (no climbing from the east ledge side)
  box(r, 34, 24, 52, 26); box(r, 41, 27, 44, 35);   // east ledge slab + its pier
  box(r, 43, 10, 62, 12, 'X');                   // the brim (glazed faces and underside)
  box(r, 46, 10, 49, 12, 'D');                   // its cracked patch
  ceil(r, 1, 62, 2); air(r, 20, 2, 54, 2);
  ceil(r, 1, 6, 4); corner(r, 7, 3, 2, 'tl'); corner(r, 1, 5, 2, 'tl');
  r.openExits();
  // ---- contents
  r.put(56, 9, { type: 'shrine', ability: 'plunge' });
  enemy(r, 'forge_wisp', 21, 18, { leash: 4 });
  enemy(r, 'forge_wisp', 48, 18, { leash: 5 });
  respawn(r, 6, 23, 9); respawn(r, 16, 23, 5); respawn(r, 25, 23, 5); respawn(r, 31, 23, 3); respawn(r, 47, 23, 11);   // boxes end at the lips
  // ---- dressing
  event(r, 'ch_crucible', 53, 10, { c0: 53, c1: 62, r0: 10, r1: 33 });   // the towering crucible under the brim
  deco(r, 'anvil', 59, 9);
  light(r, 56, 7, 6, '#7fb0ff', 0.45, true);
  for (const c of [13, 21, 29, 37, 48, 57]) light(r, c, 32, 6, MOLTEN, 0.5, true);
  deco(r, 'brazier', 4, 23); light(r, 4, 21, 4, CANDLE, 0.6, true);
  deco(r, 'chain', 12, 3, { len: 260, hook: true, layer: 'back' });
  deco(r, 'chain', 38, 2, { len: 200, layer: 'back' });
  // the Crucible Wall is an iron counterweight slab hung on two great chains (it does not float over its tunnel)
  deco(r, 'chain', 30, 2, { len: 330, layer: 'back', scale: 1.4 }); deco(r, 'chain', 33, 2, { len: 330, layer: 'back', scale: 1.4 });
  deco(r, 'lantern_hanging', 26, 2, { len: 220, lit: true }); light(r, 26, 8, 4, CANDLE, 0.45, true);
  deco(r, 'mold_stack', 36, 23, { layer: 'back' }); deco(r, 'rubble', 50, 23);
  return done(r, { theme: { bg: 'shaft' }, bgSeed: 160 });   // QA: reseeded so the art's procedural decor stays out of the S holes, doorways and off the pickups
}

// =====================================================================================================
// ch_05 — THE COOLING CELLAR (64x18): floor top 15, E1 (rows 12-14) to the Quench Gate; N1 (cols 40-43) from the
// Mold Racks with a ladder (tops 12, 8, 4). SECRET + DASH: a B wall of stacked cold molds (cols 22-23, rows 4-14)
// hides the quench trough (% cols 11-20, flush, rows 15-16) and the far ledge (cols 1-10, its face glazed) with the
// Ember Urn ch_urn.
// =====================================================================================================
function ch05() {
  const r = RK.room('ch_05');
  air(r, 1, 4, 62, 14);
  air(r, 38, 1, 45, 3);                          // N1 neck
  box(r, 22, 4, 23, 14, 'B');                    // the wall of cold molds
  box(r, 11, 15, 20, 16, '%');                   // the quench trough
  box(r, 10, 15, 10, 16, 'X');                   // far ledge face
  ceil(r, 56, 62, 11); corner(r, 55, 4, 3, 'tr'); // E1 hood
  corner(r, 1, 4, 2, 'tl');
  for (const [y, x0, x1] of [[12, 38, 43], [8, 40, 45], [4, 39, 44]]) plat(r, x0, x1, y);
  ladderChains(r, [40, 43], 12);
  r.openExits();
  // ---- contents
  r.put(4, 14, { type: 'pickup', item: 'urn', id: 'ch_urn' });
  enemy(r, 'drip_slime', 30, 6);
  enemy(r, 'drip_slime', 51, 6);
  enemy(r, 'moldling', 34, 14, { range: 4 });
  respawn(r, 24, 14, 7); respawn(r, 5, 14, 9);   // boxes end at the trough lips (cols 21 / 10)
  // ---- dressing
  light(r, 15, 15, 5, MOLTEN, 0.5, true);
  light(r, 4, 12, 3, HOT, 0.4, true);
  event(r, 'ch_soldiers', 27, 7, { c0: 27, c1: 31, r0: 7, r1: 14, seed: 5 });   // cooling racks of fresh-poured figures
  event(r, 'ch_soldiers', 47, 8, { c0: 47, c1: 50, r0: 8, r1: 14, seed: 9 });
  event(r, 'ch_quench', 35, 15, { c0: 35, c1: 38, r: 15 });                     // quenching troughs, steaming
  event(r, 'ch_quench', 57, 15, { c0: 57, c1: 60, r: 15 });
  deco(r, 'mold_stack', 25, 14); deco(r, 'mold_stack', 26, 14, { flip: true, layer: 'back' });
  deco(r, 'candle_cluster', 33, 14, { layer: 'back' }); deco(r, 'candle_cluster', 47, 14, { layer: 'back' });
  deco(r, 'lantern_hanging', 36, 4, { len: 30, lit: true }); light(r, 36, 6, 4, CANDLE, 0.45, true);
  deco(r, 'lantern_hanging', 58, 12, { len: 10, lit: true }); light(r, 58, 13, 3, CANDLE, 0.4, true);
  deco(r, 'pipe_v', 54, 14, { len: 150, steam: true, layer: 'back' });
  deco(r, 'crate', 7, 14);
  return done(r, { theme: { bg: 'interior' }, bgSeed: 170 });   // QA: reseeded so the art's procedural decor stays out of the S holes, doorways and off the pickups
}

// =====================================================================================================
// ch_06 — THE QUENCH GATE (64x27): floor top 24. N1 (cols 20-23) from the Foundry: ladder (tops 21..5). W1 (rows
// 12-14) a raised doorway on a ledge (cols 1-8, top 15) up 3-tile steps (tops 21 / 18). PLUNGE GATE: frosted cracked
// floor (D cols 12-19, rows 24-25) over S1 (cols 14-17) into the Rime. DASH REWARD: a stepped pillar (tops 21, 18,
// 15, flat top 12 at cols 37-39) and, across a 10-tile gap (cols 40-49), the glazed high ledge with Flare Trail.
// =====================================================================================================
function ch06() {
  const r = RK.room('ch_06');
  air(r, 1, 3, 62, 23);
  air(r, 18, 1, 25, 2);                          // N1 neck
  box(r, 1, 15, 8, 23);                          // W1 ledge
  box(r, 9, 18, 10, 23); box(r, 11, 21, 11, 23); // steps (tops 18, 21)
  ceil(r, 1, 8, 8); corner(r, 9, 3, 3, 'tl');
  box(r, 12, 24, 19, 25, 'D');                   // the frosted cracked floor
  air(r, 14, 26, 17, 26);                        // (S1 opening under it)
  // the stepped pillar
  // the stepped pillar: an iron shelf (= top 21) bolted to its west side, steps 18 / 15, flat top 12 (cols 37-39); the
  // floor passes under it through a tunnel (rows 21-23) so E1 <-> W1/N1 stay free
  plat(r, 29, 32, 21);
  box(r, 33, 18, 34, 20); box(r, 35, 15, 36, 20); box(r, 37, 12, 39, 20);
  box(r, 39, 12, 39, 20, 'X');                   // its east face (glazed)
  box(r, 50, 12, 62, 14, 'X');                   // the high ledge (glazed faces and underside)
  ceil(r, 56, 62, 5); corner(r, 55, 3, 3, 'tr');
  for (const [y, x0, x1] of [[21, 19, 24], [17, 20, 25], [13, 18, 23], [9, 20, 25], [5, 19, 24]]) plat(r, x0, x1, y);
  ladderChains(r, [20, 23], 21);
  r.openExits();
  // ---- contents
  r.put(55, 11, { type: 'pickup', item: 'sigil', sigil: 'flare_trail', id: 'ch_sig_flare_trail' });
  enemy(r, 'forge_wisp', 30, 9, { leash: 6 });
  enemy(r, 'forge_wisp', 46, 19, { leash: 6 });
  enemy(r, 'moldling', 46, 23, { range: 4 });
  // ---- dressing
  event(r, 'ch_frost', 12, 24, { c0: 12, c1: 19, r: 24 });                    // the Rime breathing up through the cracks
  event(r, 'ch_quench', 41, 24, { c0: 41, c1: 45, r: 24 });                   // a quenching trough of ice water
  // the stepped casting frame hangs on two great chains (the floor passes under it)
  deco(r, 'chain', 37, 3, { len: 364, layer: 'back', scale: 1.4 }); deco(r, 'chain', 39, 3, { len: 364, layer: 'back', scale: 1.4 });
  light(r, 15, 24, 5, FROST, 0.45, true);
  light(r, 55, 9, 4, HOT, 0.45, true);
  deco(r, 'lantern_hanging', 5, 9, { len: 20, lit: true }); light(r, 5, 10, 3.5, CANDLE, 0.45, true);
  deco(r, 'vat', 55, 23, { layer: 'back' }); light(r, 55, 22, 4, MOLTEN, 0.45, true);
  deco(r, 'pipe_v', 58, 23, { len: 140, steam: true, layer: 'back' });
  deco(r, 'chain', 44, 3, { len: 120, hook: true, layer: 'back' });
  deco(r, 'lantern_hanging', 33, 3, { len: 90, lit: true }); light(r, 33, 6, 4, CANDLE, 0.4, true);
  deco(r, 'rubble', 27, 23); deco(r, 'crate', 52, 23);
  return done(r, { theme: { bg: 'interior' }, bgSeed: 134 });   // QA: reseeded so the art's procedural decor stays out of the S holes, doorways and off the pickups
}

// =====================================================================================================
// ch_07 — THE MOLD RACKS (64x27): floor top 24. N1 (cols 20-23) from the Gallery Gate: ladder (tops 21..5). E1 (rows
// 21-23) to the Foundry's lower floor. S1 (cols 40-43) a hole to the Cooling Cellar, dips (top 25) at 37-39 / 44-46.
// Racks of soldier molds with one-way rack platforms (tops 20 / 16). PLUNGE REWARD: the casting block (cols 49-57,
// top 18; 3-tile steps west 47-48 / east 58-59 at top 21) with a cracked lid (D cols 51-55, rows 18-19) over the
// sealed casting pit (cols 50-56, rows 20-23) holding Chandler's Spark; a platform (top 21) under the lid climbs out.
// DEVIATION: the plan put the block at cols 50-62 — that sealed E1 (rows 21-23); it sits west of a door corridor.
// =====================================================================================================
function ch07() {
  const r = RK.room('ch_07');
  air(r, 1, 3, 62, 23);
  air(r, 18, 1, 25, 2);                          // N1 neck
  ceil(r, 32, 38, 10); corner(r, 31, 3, 3, 'tr'); corner(r, 39, 3, 3, 'tl'); corner(r, 32, 11, 2, 'tl'); corner(r, 38, 11, 2, 'tr');
  ceil(r, 1, 6, 5); corner(r, 7, 3, 3, 'tl');
  air(r, 37, 24, 39, 24); air(r, 44, 24, 46, 24); air(r, 40, 24, 43, 26);   // S1 dips + hole
  box(r, 47, 21, 48, 23);                        // west step
  box(r, 49, 18, 57, 23);                        // casting block
  air(r, 50, 20, 56, 23);                        // the sealed casting pit
  box(r, 51, 18, 55, 19, 'D');                   // its cracked lid
  plat(r, 54, 55, 21);                           // climb-out platform under the lid
  box(r, 58, 21, 59, 23);                        // east step
  // rack platforms (fun)
  plat(r, 6, 12, 20); plat(r, 9, 14, 16); plat(r, 27, 33, 20); plat(r, 29, 34, 16);
  for (const [y, x0, x1] of [[21, 19, 24], [17, 20, 25], [13, 18, 23], [9, 20, 25], [5, 19, 24]]) plat(r, x0, x1, y);
  ladderChains(r, [20, 23], 21);
  r.openExits();
  // ---- contents
  r.put(10, 23, { type: 'lore', id: 'lore_ch_3' });
  r.put(51, 23, { type: 'pickup', item: 'spark', id: 'spark_ch' });
  enemy(r, 'moldling', 9, 19, { range: 2 });
  enemy(r, 'moldling', 31, 15, { range: 2, facing: 'left' });
  enemy(r, 'moldling', 30, 23, { range: 4 });
  enemy(r, 'drip_slime', 35, 13);
  // ---- dressing
  // the landmark: tall racks of half-formed wax soldiers behind the rack platforms, row upon row, none of them lit
  event(r, 'ch_soldiers', 6, 11, { c0: 6, c1: 13, r0: 11, r1: 23, seed: 2 });
  event(r, 'ch_soldiers', 26, 13, { c0: 26, c1: 34, r0: 13, r1: 23, seed: 7 });
  event(r, 'ch_soldiers', 1, 15, { c0: 1, c1: 4, r0: 15, r1: 23, seed: 11 });
  light(r, 53, 21, 3, HOT, 0.4, true);          // the spark's glow seeps through the cracked lid
  deco(r, 'lantern_hanging', 14, 3, { len: 140, lit: true }); light(r, 14, 7, 4, CANDLE, 0.45, true);
  deco(r, 'lantern_hanging', 45, 3, { len: 100, lit: true }); light(r, 45, 6, 4, CANDLE, 0.45, true);
  deco(r, 'mold_stack', 16, 23, { layer: 'back' }); deco(r, 'mold_stack', 25, 23, { layer: 'back' });
  deco(r, 'vat', 61, 23, { layer: 'back' }); light(r, 61, 22, 3.5, MOLTEN, 0.45, true);
  deco(r, 'chain', 52, 3, { len: 140, hook: true, layer: 'back' });
  return done(r, { theme: { bg: 'interior' }, bgSeed: 107 });
}

// =====================================================================================================
// ch_08 — THE KILN ANTECHAMBER (64x27): floor top 24 (W1 rows 21-23 from the Quench Gate). N1 (cols 16-19) from the
// Foundry: ladder (tops 21..5) inside an iron flue hood whose glazed skirt (cols 13-14, rows 3-20) keeps the ladder
// from reaching the cage. E1 (rows 12-14) the furnace door, on a raised ledge (cols 50-62, top 15) up 3-tile steps
// (tops 21, 18). ch_sconce_b at col 27, lore_ch_4 at col 22. WINGS REWARD: the chain-hung cage perch (cols 6-11,
// top 17, 7 above the floor, glazed; the west wall is glazed too) with ch_geo3.
// =====================================================================================================
function ch08() {
  const r = RK.room('ch_08');
  air(r, 1, 3, 62, 23);
  air(r, 16, 1, 19, 2);                          // N1 neck
  box(r, 0, 0, 0, 20, 'X');                      // west wall glazed above W1
  box(r, 6, 17, 11, 18, 'X');                    // the cage perch
  box(r, 13, 3, 14, 20, 'X');                    // the flue hood's skirt
  box(r, 46, 21, 47, 23); box(r, 48, 18, 49, 23); box(r, 50, 15, 62, 23);   // steps + furnace ledge
  ceil(r, 54, 62, 8); corner(r, 53, 3, 3, 'tr');
  ceil(r, 24, 40, 3); corner(r, 23, 3, 2, 'tr'); corner(r, 41, 3, 2, 'tl');
  for (const [y, x0, x1] of [[21, 15, 20], [17, 16, 21], [13, 15, 20], [9, 16, 21], [5, 15, 20]]) plat(r, x0, x1, y);
  ladderChains(r, [16, 19], 21);
  r.openExits();
  // ---- contents
  r.put(27, 23, { type: 'sconce', id: 'ch_sconce_b' });
  r.put(22, 23, { type: 'lore', id: 'lore_ch_4' });
  r.put(9, 16, { type: 'geode', id: 'ch_geo3', amount: 90 });
  enemy(r, 'ladle_brute', 42, 23, { range: 3, facing: 'left' });
  enemy(r, 'forge_wisp', 8, 11, { leash: 5 });     // guards the cage: engages only around the perch, not at W1
  // ---- dressing
  light(r, 27, 21, 6, CANDLE, 0.7, true);
  deco(r, 'brazier', 30, 23); light(r, 30, 21, 4, CANDLE, 0.5, true);
  event(r, 'ch_furnace', 62, 12, { c: 62, r: 12.4, rad: 2.6 });             // the furnace door that beats like a heart
  event(r, 'ch_cage', 6, 17, { c0: 6, c1: 11, r: 17, h: 4 });                 // the chain-hung cage around the perch
  light(r, 61, 13, 6, EMBER, 0.6, true);
  deco(r, 'chain', 7, 3, { len: 560, layer: 'back' }); deco(r, 'chain', 10, 3, { len: 560, layer: 'back' });
  light(r, 9, 15, 3, HOT, 0.35, true);
  deco(r, 'grate_glow', 36, 23, { layer: 'back' }); light(r, 36, 23, 2.5, EMBER, 0.4, true);
  deco(r, 'anvil', 55, 14, { layer: 'back' }); deco(r, 'rubble', 4, 23);
  return done(r, { theme: { bg: 'interior' }, bgSeed: 180 });   // QA: reseeded so the art's procedural decor stays out of the S holes, doorways and off the pickups
}

// =====================================================================================================
// ch_01 — THE GALLERY GATE (64x18): the western entrance from the Gallery of Saints (W1). Floor top 15; E1 onto the
// Foundry's upper gantry. S1 (cols 20-23) down to the Mold Racks, dips (top 16) at 17-19 / 24-26. Stone (west)
// gives way to riveted iron (east). ch_geo1 on a slag heap at col 44.
// =====================================================================================================
function ch01() {
  const r = RK.room('ch_01');
  air(r, 1, 4, 62, 14);
  ceil(r, 1, 4, 8); corner(r, 5, 4, 3, 'tl');     // nave-stone doorway
  ceil(r, 58, 62, 8); corner(r, 57, 4, 3, 'tr');  // iron doorway to the Foundry
  ceil(r, 28, 31, 5);
  air(r, 17, 15, 19, 15); air(r, 24, 15, 26, 15); air(r, 20, 15, 23, 17);   // S1 dips + hole
  box(r, 42, 14, 46, 14); box(r, 43, 13, 45, 13);   // slag heap
  r.openExits();
  // ---- contents
  r.put(44, 12, { type: 'geode', id: 'ch_geo1', amount: 50 });
  enemy(r, 'moldling', 31, 14, { range: 4 });
  enemy(r, 'moldling', 36, 14, { range: 4, facing: 'left' });
  enemy(r, 'drip_slime', 51, 6);
  // ---- dressing
  event(r, 'ch_plates', 22, 4, { c0: 22, c1: 62, r0: 4, r1: 14, fade: 'left' });   // the stone gives way to riveted iron
  deco(r, 'arch', 10, 14, { layer: 'back', dim: 0.3 });
  deco(r, 'column_broken', 15, 14, { layer: 'back', region: 'nave' });
  deco(r, 'lantern_hanging', 12, 4, { len: 40, lit: true }); light(r, 12, 6, 4, CANDLE, 0.5, true);
  deco(r, 'pipe_v', 33, 14, { len: 200, steam: true, layer: 'back' });
  deco(r, 'gear', 40, 14, { layer: 'back' });
  deco(r, 'grate_glow', 49, 14, { layer: 'back' }); light(r, 49, 14, 2.5, EMBER, 0.4, true);
  deco(r, 'lantern_hanging', 55, 5, { len: 170, lit: true }); light(r, 55, 10, 4, CANDLE, 0.45, true);
  light(r, 44, 12, 3, HOT, 0.3, true);
  deco(r, 'rubble', 27, 14); deco(r, 'crate', 53, 14);
  return done(r, { theme: { bg: 'interior' }, bgSeed: 140 });   // QA: reseeded so the art's procedural decor stays out of the S holes, doorways and off the pickups
}

// =====================================================================================================
// ch_02 — THE GREAT FOUNDRY (96x36): REGION HUB. (1) upper gantry (top 6) from W1 east to col 40; (2) middle
// walkway (top 24, solid, rows 24-25) from col 5 to E1; (3) lower floor (top 33) with W2, S1 (cols 20-23) and S2
// (cols 80-83), dips (top 34) beside both. Chain-hung platforms (3 rows apart) climb from the walkway to the gantry
// (cols 34-46); hatches (= in the walkway) with platform pairs link the walkway and the lower floor (cols 6-12 and
// 70-77). ch_sconce_a col 30 and the Lanternway post col 62 on the walkway; lore_ch_2 at col 12 on the lower floor.
// The colossal hanging knight-mold in the centre (cols ~48-60).
// =====================================================================================================
function ch02() {
  const r = RK.room('ch_02');
  air(r, 1, 3, 94, 32);
  ceil(r, 1, 94, 2);
  ceil(r, 1, 3, 2);
  box(r, 1, 6, 6, 8);                            // the W1 landing (iron block)
  corner(r, 1, 9, 3, 'tl');
  plat(r, 7, 40, 6);                             // the upper gantry
  // chain-hung platforms: walkway (24) -> 21 -> 18 -> 15 -> 12 -> 9 -> gantry (6)
  for (const [y, x0, x1] of [[21, 35, 39], [18, 41, 45], [15, 35, 39], [12, 41, 45], [9, 37, 41]]) plat(r, x0, x1, y);
  // QA: the hangers themselves (open room: the ladder floated) - chains from the vault (row 3) to the platform ends
  for (const [x, y] of [[35, 21], [39, 21], [41, 18], [45, 18], [37, 9]]) deco(r, 'chain', x, 3, { len: (y - 3) * 40 + 2, layer: 'back' });
  // the middle walkway
  box(r, 1, 24, 94, 25);                        // (QA: runs to the west wall; a loose 2x2 stub floated at cols 5-6)
  plat(r, 7, 10, 24); air(r, 7, 25, 10, 25);     // west hatch
  plat(r, 72, 75, 24); air(r, 72, 25, 75, 25);   // east hatch
  plat(r, 4, 8, 30); plat(r, 9, 13, 27);         // west link
  plat(r, 69, 73, 30); plat(r, 74, 78, 27);      // east link
  for (const x of [11, 13, 76, 78]) deco(r, 'chain', x, 26, { len: 42, layer: 'back' });   // QA: hangers for the row-27 links
  // the lower floor
  box(r, 1, 33, 94, 35);
  air(r, 17, 33, 26, 33); air(r, 20, 34, 23, 35);   // S1 dips + hole
  air(r, 77, 33, 86, 33); air(r, 80, 34, 83, 35);   // S2 dips + hole
  // ceiling relief
  ceil(r, 60, 94, 3); corner(r, 59, 3, 1, 'tr');
  ceil(r, 84, 94, 6); corner(r, 83, 4, 3, 'tr');
  r.openExits();
  // ---- contents
  r.put(30, 23, { type: 'sconce', id: 'ch_sconce_a' });
  r.put(62, 23, { type: 'lanternway', id: 'chandlery' });
  r.put(12, 32, { type: 'lore', id: 'lore_ch_2' });
  enemy(r, 'ladle_brute', 45, 23, { range: 3 });
  enemy(r, 'moldling', 38, 32, { range: 4 });
  enemy(r, 'moldling', 46, 32, { range: 4, facing: 'left' });
  enemy(r, 'drip_slime', 31, 27);
  enemy(r, 'drip_slime', 48, 27);
  // ---- dressing
  // the landmark: a colossal empty mold in the shape of a knight hangs on chains over the hall
  event(r, 'ch_knightmold', 56, 2, { c: 56, r0: 2, r1: 20, w: 10 });
  // iron trestles carry the middle walkway over the lower floor; a giant ladle pours into the walkway's vat
  event(r, 'ch_truss', 14, 26, { cols: [14, 27, 38, 49, 60, 67], r0: 26, r1: 33 });
  event(r, 'ch_truss', 89, 26, { cols: [89], r0: 26, r1: 33 });
  event(r, 'ch_pour', 80, 3, { c: 80, r0: 3, ry: 14, y1: 22 });
  light(r, 30, 21, 6, CANDLE, 0.65, true);
  deco(r, 'lantern_hanging', 3, 3, { len: 40, lit: true }); light(r, 3, 5, 4, CANDLE, 0.5, true);
  deco(r, 'vat', 82, 23, { layer: 'back' }); light(r, 82, 22, 5, MOLTEN, 0.55, true);
  deco(r, 'vat', 57, 32, { layer: 'back' }); light(r, 57, 31, 5, MOLTEN, 0.5, true);
  deco(r, 'gear', 20, 23, { layer: 'back' });
  deco(r, 'cart', 89, 32, { layer: 'back' }); deco(r, 'mold_stack', 65, 32); deco(r, 'crate', 92, 32);
  deco(r, 'grate_glow', 28, 32, { layer: 'back' }); light(r, 28, 32, 2.5, EMBER, 0.4, true);
  deco(r, 'grate_glow', 90, 23, { layer: 'back' }); light(r, 90, 23, 2.5, EMBER, 0.4, true);
  deco(r, 'chain', 70, 4, { len: 280, hook: true, layer: 'back' });
  deco(r, 'chain', 26, 3, { len: 100, hook: true, layer: 'back' });
  deco(r, 'lantern_hanging', 76, 4, { len: 120, lit: true }); light(r, 76, 7, 4, CANDLE, 0.45, true);
  deco(r, 'anvil', 15, 23, { layer: 'back' });
  return done(r, { theme: { bg: 'open' }, bgSeed: 150 });   // QA: reseeded so the art's procedural decor stays out of the S holes, doorways and off the pickups
}

// =====================================================================================================
const builders = { ch01, ch02, ch03, ch04, ch05, ch06, ch07, ch08, ch10 };
const only = process.argv.slice(2).filter((a) => !a.startsWith('--'));
for (const [name, fn] of Object.entries(builders)) {
  const r = fn();
  if (process.argv.includes('--print') && (!only.length || only.includes(name) || only.includes(r.id))) {
    console.log('\n' + r.id + '\n' + r.ascii().split('\n').map((l, i) => String(i).padStart(2) + ' ' + l).join('\n'));
  }
}
const out = RK.emit('chandlery', defs, path.join('src', 'data', 'regions', 'chandlery.js'),
  'THE CHANDLERY (region builder: region-chandlery). Arena ch_09 lives in src/data/arenas/kilnmother.js');
console.log('wrote ' + path.relative(path.resolve(__dirname, '../..'), out) + ' (' + defs.length + ' rooms)');
