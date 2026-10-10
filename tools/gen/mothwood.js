#!/usr/bin/env node
// tools/gen/mothwood.js — generator for THE MOTHWOOD (region builder: region-mothwood).
// Builds every NON-arena room of region 'mothwood' with tools/lib/roomkit.js exactly to design/world_plan.json
// and emits src/data/regions/mothwood.js. Never hand-edit the emitted file: edit this, then re-run:
//   node tools/gen/mothwood.js [--print] [mw_02 ...]     (--print dumps the listed rooms (or all) as ASCII)
// Coordinates: x = column, y = row (room-local, 0-based). Helpers take INCLUSIVE rectangles.
// The arena mw_04 (The Duchess's Bower) is built by the boss designer in src/data/arenas/vespertine.js.
//
// Region identity: a near-black forest of wick-reeds (tall stalks with dead wicks for heads), cocoons and silk.
// Darkness 0.7: violet moth-glow (cocoons, glow-caps, ember-tipped reeds) keeps every path readable.
//   mw_01 Reed Shallows     floodwater bank out of the Flooded Tunnel; first reeds; a maw in a dust mound.
//   mw_02 Wickreed Grove    THE HUB / landmark: a tall clearing between two underwood canopies; the reed-cap
//                           ladder (wings) climbs to the canopy; sconce under a ring of glowing cocoons.
//   mw_03 Mothward Gate     the barred grate up into Meltbloom; platform climb to lever mw_lv1.
//   mw_05 Cocoon Deep       stepped pit of cocoons; the fused giant cocoon (D) over spark_mw's chamber.
//   mw_06 Silk Galleries    canopy galleries before the Duchess; sconce b; banners of eye-spotted wings.
//   mw_07 Cocoon Hollow     the inside of one ancient hollow reed; zig-zag silk ledges; wings perch (mw_geo2).
//   mw_08 Dustfall Hollow   grey moth-dust falling like snow; low ceiling with a cracked alcove (Last Light).
//   mw_09 Silt Roots        roots in frozen silt; Wren's camp (+ B den with kiln glass); D floor into the Rime.
//   mw_10 Chrysalis Chapel  the Smokewing shrine inside an enormous empty chrysalis.
'use strict';
const path = require('path');
const RK = require('../lib/roomkit');

// ------------------------------------------------------------------ helpers
const box = (r, x0, y0, x1, y1, ch = '#') => r.fill(x0, y0, x1 - x0 + 1, y1 - y0 + 1, ch);
const air = (r, x0, y0, x1, y1) => box(r, x0, y0, x1, y1, '.');
const plat = (r, x0, x1, y) => r.platform(x0, y, x1 - x0 + 1);
/** Decor, snapped to its anchor: ceiling props move to the first air tile under solid rock (cocoons may also hang
 *  under a one-way cap), floor props onto the floor below. Warns when a prop has to move more than 2 rows. */
const CEIL_PROPS = new Set(['vine_curtain', 'cocoon', 'web', 'banner', 'chain', 'cage_hanging', 'lantern_hanging', 'drip']);
const isSolid = (r, x, y) => '#XBD'.includes(r.get(x, y));
function anchorY(r, kind, x, y) {
  let ny = y;
  if (CEIL_PROPS.has(kind)) {
    const hangs = (yy) => isSolid(r, x, yy - 1) || (kind === 'cocoon' && r.get(x, yy - 1) === '=');
    while (isSolid(r, x, ny) && ny < r.h - 1) ny++;
    while (!hangs(ny) && ny > 0) ny--;
  } else {
    const rests = (yy) => isSolid(r, x, yy + 1) || r.get(x, yy + 1) === '=';
    while (isSolid(r, x, ny) && ny > 0) ny--;
    while (!rests(ny) && ny < r.h - 1) ny++;
  }
  if (Math.abs(ny - y) > 2) console.warn(`  [decor] ${r.id} ${kind} at (${x},${y}) moved to row ${ny}`);
  return ny;
}
const deco = (r, kind, x, y, o) => r.add(Object.assign({ type: 'decor', kind, x, y: anchorY(r, kind, x, y) }, o || {}));
const light = (r, x, y, rad, color, intensity, flicker) => r.add({ type: 'light', x, y, r: rad, color, intensity, flicker: !!flicker });
const enemy = (r, kind, x, y, o) => r.put(x, y, Object.assign({ type: 'enemy', kind }, o || {}));
const respawn = (r, x, y, w, h) => r.add({ type: 'respawn', x, y, w, h: h || 4 });
/** Solid mass between per-column top/bottom rows: profile = [[col, top, bottom], ...]. */
function mass(r, profile, ch = '#') { for (const [c, t, b] of profile) if (b >= t) box(r, c, t, c, b, ch); }
/** A ceiling mass from row y0 whose bottom row per column is given by a run list [[c0, c1, bottom], ...]. */
function canopy(r, y0, runs, ch = '#') { for (const [a, b, bot] of runs) box(r, a, y0, b, bot, ch); }
/** Hanging silk strands (decor) from the ceiling tile above (x, y). */
const silk = (r, x, y, len, o) => deco(r, 'vine_curtain', x, y, Object.assign({ len, silk: true }, o || {}));
const cocoonDeco = (r, x, y, len, o) => deco(r, 'cocoon', x, y, Object.assign({ len }, o || {}));
function grass(r, y, cols, o) { for (const c of cols) deco(r, 'grass_clump', c, y, Object.assign({ layer: 'front' }, o || {})); }
function reeds(r, y, cols, o) { for (const c of cols) deco(r, 'reeds', c, y, Object.assign({ ember: true }, o || {})); }
function caps(r, list) { for (const [x, y, o] of list) deco(r, 'mushroom_glow', x, y, o); }

const VIOLET = '#b890ff', LILAC = '#c8a8ff', PALE = '#dacaf2', MOON = '#c8d8f0', BLUE = '#8fb8ff', EMBER = '#ffb070', FROST = '#bfe4ff';

const defs = [];
const done = (r, extra) => { defs.push(r.toDef(extra)); return r; };

// =====================================================================================================
// mw_01 — The Reed Shallows (64x18). Floor top 15. E1 (Flooded Tunnel) / W1 (Grove) rows 12-14.
// S1 cols 44-47: hole to the Silt Roots; landing dips (top row 16) cols 41-43 / 48-50.
// The tunnel's floodwater drains into the reed roots at the east end (decor only — dry walkway).
// =====================================================================================================
function mw01() {
  const r = RK.room('mw_01');
  air(r, 1, 3, 62, 14);
  // doorways: 3-deep lintels, rounded inner corners
  box(r, 1, 3, 2, 10); box(r, 61, 3, 62, 10);
  box(r, 3, 3, 3, 7); box(r, 60, 3, 60, 7); box(r, 4, 3, 4, 5); box(r, 59, 3, 59, 4);
  // ragged canopy of dead wick-heads
  canopy(r, 3, [[9, 12, 3], [10, 11, 4], [17, 20, 3], [26, 28, 4], [27, 27, 5], [35, 38, 3], [36, 37, 4],
    [44, 47, 3], [52, 55, 4], [53, 54, 5]]);
  // reed roots: the geode sits in a hollow between two root knuckles (col 8)
  box(r, 5, 14, 6, 14); box(r, 10, 14, 11, 14);
  // a low root bar mid-room and the lore stone's plinth of silt
  box(r, 34, 14, 36, 14);
  // S1 hole + landing dips (top row 16)
  air(r, 41, 15, 50, 15); air(r, 44, 15, 47, 17);
  r.openExits();
  // contents
  r.put(8, 14, { type: 'geode', id: 'mw_geo3', amount: 70 });
  r.put(30, 14, { type: 'lore', id: 'lore_mw_1' });
  enemy(r, 'dust_maw', 22, 14, { range: 3 });
  enemy(r, 'dusk_moth', 16, 9, { range: 6 });
  enemy(r, 'dusk_moth', 34, 8, { range: 5 });   // QA: was (46,9) r6 - its leash covered the S1 hole + landing dips
  // lights: moth-glow, sparingly — the lore stone, the hole, the bank
  light(r, 30, 12, 4, LILAC, 0.45);
  light(r, 45, 13, 4, VIOLET, 0.35);
  light(r, 57, 12, 5, MOON, 0.3);
  light(r, 8, 12, 3, EMBER, 0.3);
  // dressing: reeds frame the room; silk and cocoons hang from the wick canopy; drowned bank to the east
  reeds(r, 14, [3, 7, 13, 18, 25, 33, 38, 52, 55, 58]);
  deco(r, 'reeds', 9, 13, { ember: true, scale: 0.8, layer: 'front' });
  caps(r, [[12, 14], [39, 14], [51, 15], [56, 14]]);
  deco(r, 'bones', 24, 14); deco(r, 'bones', 20, 14, { flip: true });
  deco(r, 'stalagmite', 27, 14, { h: 40 });
  deco(r, 'wick_grave', 32, 14, { variant: 1 });
  cocoonDeco(r, 11, 5, 30); cocoonDeco(r, 27, 6, 18); cocoonDeco(r, 36, 5, 40); cocoonDeco(r, 54, 6, 24);
  silk(r, 18, 4, 90); silk(r, 45, 4, 120); silk(r, 6, 3, 60);
  deco(r, 'web', 59, 5); deco(r, 'web', 4, 6, { flip: true });
  grass(r, 14, [2, 15, 19, 29, 31, 40, 53, 57, 60]);
  return done(r, { bgSeed: 5, theme: { weather: [{ kind: 'silk', count: 30 }, { kind: 'motes', count: 40, color: LILAC }], fog: 1.2 } });
}

// =====================================================================================================
// mw_02 — The Wickreed Grove (hub, 96x36). Forest floor top row 33 with low roots. E1/W1 rows 30-32,
// S1 cols 20-23 (dips top row 34 at cols 17-19 / 24-26), N1 cols 50-53.
// A tall clearing (cols ~33-68) between two low underwood canopies; the reed-cap ladder rises in it:
// caps (one-way, 6 wide) tops 27, 21, 15, 9 and the last at row 4 (cols 47-54) under N1 — wings only.
// Sconce col 44 under the lowest cap (ring of glowing cocoons), Lanternway post col 60, lore on a stump col 70.
// Hostiles: underwood west (cocoons, moth) and east (maw, moth) — all >= 12 tiles from the post.
// =====================================================================================================
function mw02() {
  const r = RK.room('mw_02');
  air(r, 1, 2, 94, 32);
  // west underwood canopy (cols 1-31) — ragged dead-wick heads hanging into the floor space
  canopy(r, 2, [[1, 31, 14], [1, 4, 29], [5, 6, 22], [7, 9, 18], [10, 12, 21], [13, 16, 17], [17, 19, 16],
    [20, 24, 18], [25, 27, 16], [28, 30, 21], [31, 31, 13], [32, 32, 9], [33, 33, 5], [34, 35, 3], [3, 3, 26]]);
  // east underwood canopy (cols 70-94)
  canopy(r, 2, [[69, 94, 14], [69, 70, 15], [64, 65, 3], [66, 66, 5], [67, 67, 8], [68, 68, 11], [71, 74, 17], [75, 78, 20], [79, 83, 18], [84, 87, 21], [88, 90, 19],
    [91, 94, 29], [90, 90, 24]]);
  // forest floor: low roots (1-2 tile bumps), the lore stump, S1 hole and dips
  box(r, 8, 32, 9, 32); box(r, 33, 32, 35, 32); box(r, 34, 31, 34, 31); box(r, 64, 32, 66, 32);
  box(r, 69, 31, 71, 32); box(r, 88, 32, 89, 32);
  air(r, 17, 33, 26, 33); air(r, 20, 33, 23, 35);
  // the reed-cap ladder (wings): a tower-tall GLAZED silk-wrapped wick-reed (cols 45-46) hangs from the canopy
  // down to row 28; four caps (one-way, 6 wide, cols 47-52) grow from its east side 6 rows apart, the last cap
  // (row 4, cols 47-54) sits under N1. Nothing grippable within reach — only Smokewing climbs it.
  for (const y of [27, 21, 15, 9]) plat(r, 47, 52, y);
  plat(r, 47, 54, 4);
  box(r, 45, 2, 46, 28, 'X');
  air(r, 50, 0, 53, 1);                                    // N1 neck through the canopy
  r.openExits();
  // contents
  r.put(44, 32, { type: 'sconce', id: 'mw_sconce_a' });
  r.put(60, 32, { type: 'lanternway', id: 'mothwood' });
  r.put(70, 30, { type: 'lore', id: 'lore_mw_2' });
  enemy(r, 'cocoon_spawner', 11, 27, { range: 8, leash: 5, attach: 'ceiling' });
  enemy(r, 'cocoon_spawner', 31, 27, { range: 7, leash: 3, max: 2, attach: 'ceiling' });   // QA: was (29,27) r8 l5 - mothlings camped the S1 east dip
  enemy(r, 'dusk_moth', 9, 26, { range: 4 });    // QA: was (15,28) r5 - hovered over the S1 landing dips
  enemy(r, 'dusk_moth', 83, 28, { range: 5 });
  enemy(r, 'dust_maw', 81, 32, { range: 3 });
  // lights: the sconce's ring of glowing cocoons, the post, the caps, both underwoods (dim)
  light(r, 44, 29, 6, LILAC, 0.6);
  light(r, 60, 30, 5, PALE, 0.4);
  light(r, 50, 23, 5, VIOLET, 0.35); light(r, 50, 17, 5, VIOLET, 0.35); light(r, 50, 11, 5, VIOLET, 0.35); light(r, 51, 3, 6, PALE, 0.4);
  light(r, 14, 26, 5, VIOLET, 0.3); light(r, 80, 27, 5, VIOLET, 0.3); light(r, 70, 28, 3, LILAC, 0.4);
  // the ring of cocoons under the lowest cap, and giant silver cocoons hung from the high canopy
  for (const [x, y, l] of [[45, 29, 14], [46, 29, 34], [47, 28, 20], [48, 28, 40], [50, 28, 12]]) cocoonDeco(r, x, y, l);
  silk(r, 45, 29, 70);
  for (const [x, y, l] of [[48, 22, 16], [51, 22, 28], [49, 16, 26], [52, 16, 12], [48, 10, 20], [51, 10, 14]]) cocoonDeco(r, x, y, l, { scale: 0.8 });
  for (const [x, y, l] of [[36, 2, 160], [58, 2, 110], [62, 2, 220], [33, 2, 90], [66, 2, 140], [44, 2, 60]]) cocoonDeco(r, x, y, l, { scale: 1.6 });
  for (const [x, y] of [[6, 23], [12, 22], [26, 17], [77, 21], [86, 22]]) cocoonDeco(r, x, y, 18);
  silk(r, 15, 18, 110); silk(r, 22, 19, 90); silk(r, 73, 18, 130); silk(r, 85, 22, 80); silk(r, 33, 2, 200); silk(r, 67, 2, 260);
  deco(r, 'web', 30, 22); deco(r, 'web', 69, 16, { flip: true });
  reeds(r, 32, [2, 6, 13, 27, 31, 37, 56, 63, 74, 78, 86, 92]);
  reeds(r, 30, [70], { scale: 0.7 });
  caps(r, [[16, 33], [36, 31], [49, 32], [57, 32], [67, 32], [84, 32]]);
  deco(r, 'bones', 79, 32); deco(r, 'stalagmite', 85, 32, { h: 44 });
  grass(r, 32, [3, 10, 14, 28, 38, 46, 52, 58, 62, 68, 76, 90, 93]);
  return done(r, { bgSeed: 17, theme: { weather: [{ kind: 'silk', count: 50 }, { kind: 'motes', count: 70, color: LILAC }], fog: 1.3 } });
}

// =====================================================================================================
// mw_03 — The Mothward Gate (64x27). Floor top 24. S1 cols 40-43 (hole to the Cocoon Hollow; dips top row 25 at
// cols 37-39 / 44-46). N1 cols 20-23: the neck up to Meltbloom's Root Hollows, barred by mw_gate1 (horizontal
// grate w4 h1 at row 2, cols 20-23) in a frame of solid cols 18-19 / 24-25 (rows 0-2). One-way silk ledges tops
// 20, 16, 12, 8 zig-zag up to the top ledge (row 5, cols 17-28); lever mw_lv1 on it at col 27 (headroom niche
// cols 26-29). Through the bars the gardens' gold light falls into the violet dark.
// =====================================================================================================
function mw03() {
  const r = RK.room('mw_03');
  // the gate shaft (cols 8-33, open to row 1 around the frame) and the low east hall (ceiling ~row 11)
  air(r, 8, 1, 33, 23); air(r, 34, 9, 62, 23); air(r, 1, 12, 7, 23);
  box(r, 18, 0, 19, 2); box(r, 24, 0, 25, 2);              // grate frame
  air(r, 20, 0, 23, 1);                                    // the neck above the grate
  // shaft walls: ragged silk-bound rock, sloping into the east hall's ceiling
  canopy(r, 1, [[8, 9, 6], [10, 11, 3], [12, 13, 1], [30, 31, 1], [32, 33, 4]]);
  canopy(r, 9, [[34, 36, 1 + 9], [37, 40, 9], [44, 47, 10], [48, 49, 11], [52, 55, 9], [58, 62, 12], [61, 62, 15]]);
  canopy(r, 12, [[1, 4, 13], [1, 2, 15]]);
  mass(r, [[1, 21, 23], [2, 22, 23], [62, 22, 23]]);
  // the shaft's inner walls carry the silk ledges: west face col 12 (rows 5-19), east buttress cols 29-31 (rows 3-17)
  box(r, 8, 5, 12, 20); box(r, 29, 3, 31, 17); box(r, 29, 1, 33, 2); box(r, 32, 3, 33, 6);
  // west pocket of roots
  box(r, 5, 23, 7, 23);
  // the climb: zig-zag silk ledges to the top ledge under the grate
  plat(r, 13, 18, 20); plat(r, 20, 28, 16); plat(r, 13, 18, 12); plat(r, 22, 28, 8); plat(r, 17, 28, 5);   // top ledge row 5: 2 rows of headroom under the frame/closed grate (QA)
  // S1 hole + landing dips
  air(r, 37, 24, 46, 24); air(r, 40, 24, 43, 26);
  r.openExits();
  // contents
  r.put(20, 2, { type: 'gate', id: 'mw_gate1', opens: 'lever:mw_lv1', w: 4, h: 1, slide: 'right' });
  r.put(27, 4, { type: 'lever', id: 'mw_lv1' });
  r.put(52, 23, { type: 'geode', id: 'mw_geo1', amount: 80 });
  enemy(r, 'moth_knight', 23, 23, { range: 4, facing: 'right' });
  enemy(r, 'dusk_moth', 35, 13, { range: 5 });
  // lights: the gardens' gold through the bars, moth-glow on the climb, the husk with the geode
  light(r, 21, 0, 5, '#ffd070', 0.7, true); light(r, 21, 4, 4, '#ffc070', 0.35);
  light(r, 27, 2, 3, PALE, 0.4);
  light(r, 16, 15, 5, VIOLET, 0.35); light(r, 24, 10, 4, VIOLET, 0.3);
  light(r, 52, 21, 5, LILAC, 0.45); light(r, 41, 22, 4, VIOLET, 0.3);
  // dressing: chains and cages from the old iron ward, webs on the frame, a split cocoon husk around the geode
  deco(r, 'chain', 18, 3, { len: 70 }); deco(r, 'chain', 25, 3, { len: 50, hook: true });
  deco(r, 'cage_hanging', 11, 4, { len: 60, ember: true }); deco(r, 'lantern_hanging', 31, 2, { len: 80, lit: true, flame: 'violet' });
  deco(r, 'web', 17, 1, { flip: true }); deco(r, 'web', 26, 1);
  for (const [x, y, l] of [[38, 10, 30], [46, 11, 20], [56, 10, 40], [60, 13, 16], [10, 7, 40], [33, 5, 60]]) cocoonDeco(r, x, y, l);
  silk(r, 44, 11, 80); silk(r, 54, 10, 60); silk(r, 12, 4, 120); silk(r, 3, 14, 70);
  deco(r, 'web', 50, 21, { scale: 1.3 }); deco(r, 'bones', 49, 23); deco(r, 'bones', 55, 23, { flip: true });
  reeds(r, 23, [3, 9, 31, 34, 47, 58, 61]);
  caps(r, [[6, 22], [12, 23], [36, 23], [54, 23], [60, 23]]);
  deco(r, 'wick_grave', 29, 23);
  grass(r, 23, [4, 10, 15, 19, 27, 33, 48, 57]);
  return done(r, { bgSeed: 29, theme: { weather: [{ kind: 'silk', count: 30 }, { kind: 'motes', count: 40, color: LILAC }] } });
}

// =====================================================================================================
// mw_05 — The Cocoon Deep (64x27). Upper floor top 15 (cols 1-38) under N1 (cols 20-23; one-way ledges tops 12,
// 8, 4). The room steps down east (tops 18 at cols 39-41, 21 at cols 42-44) to the lower floor top 24 (cols 45-62)
// at E2 (rows 21-23). E1 (rows 12-14) sits on a silk shelf (top 15, cols 54-62) reached by one-way ledges tops 21
// and 18 from the steps. PLUNGE REWARD: the giant fused cocoon is a D floor (cols 8-13, rows 15-16) over a sealed
// chamber (cols 4-30, air rows 17-21, floor top 22) holding spark_mw; out by silk rungs tops 20 and 18 (cols 9-12) under the hole.
// =====================================================================================================
function mw05() {
  const r = RK.room('mw_05');
  air(r, 1, 2, 38, 14); air(r, 39, 4, 62, 23);
  air(r, 20, 0, 23, 1);                                    // N1 neck
  // ceiling: hanging cocoon-clusters; the east cavern vaults higher
  canopy(r, 2, [[1, 5, 3], [6, 9, 2], [12, 16, 4], [13, 15, 5], [17, 19, 2], [24, 26, 2], [29, 33, 5], [30, 32, 6], [36, 38, 3]]);
  canopy(r, 4, [[39, 41, 4], [42, 46, 7], [43, 45, 9], [52, 56, 5], [60, 62, 8]]);
  // steps down east and the lower floor
  box(r, 39, 18, 41, 23); box(r, 42, 21, 44, 23);
  // E1 shelf (rows 15-16) on the east wall, its underside drips silk
  box(r, 54, 15, 62, 16); box(r, 57, 17, 62, 17);
  plat(r, 45, 48, 21); plat(r, 49, 52, 18);
  canopy(r, 4, [[49, 51, 11], [50, 50, 12]]);              // a root knot the upper ledge hangs from
  // N1 ledges
  plat(r, 24, 29, 12); plat(r, 15, 20, 8); plat(r, 19, 24, 4);
  // PLUNGE: the fused cocoon over the sealed chamber
  box(r, 8, 15, 13, 16, 'D');
  air(r, 4, 17, 30, 21);
  // the way out: two silk rungs right UNDER the broken cocoon (QA: the old ledge at cols 14-16 sat under 2 rows of
  // solid shell - every jump bonked). Plunge can come before Smokewing, so a plain jump must clear the rim: 22 -> 20 ->
  // 18 -> out (feet ~13.4, rim 15).
  plat(r, 9, 12, 20); plat(r, 9, 12, 18);
  r.openExits();
  // contents
  r.put(23, 21, { type: 'pickup', item: 'spark', id: 'spark_mw' });
  enemy(r, 'cocoon_spawner', 2, 11, { attach: 'left', range: 8, leash: 6 });
  enemy(r, 'cocoon_spawner', 55, 19, { attach: 'ceiling', range: 8, leash: 6, max: 2 });
  enemy(r, 'moth_knight', 50, 23, { range: 3, facing: 'right' });
  // lights
  light(r, 10, 13, 4, LILAC, 0.5, true);                  // the fissures of the fused cocoon
  light(r, 23, 19, 5, BLUE, 0.55, true);                  // the spark below (veiled until the floor breaks)
  light(r, 22, 6, 4, VIOLET, 0.3); light(r, 34, 12, 4, VIOLET, 0.3);
  light(r, 50, 20, 5, VIOLET, 0.35); light(r, 59, 12, 4, PALE, 0.35); light(r, 58, 21, 4, LILAC, 0.3);
  // dressing: a pit packed with sealed cocoons
  for (const [x, y, l] of [[7, 4, 30], [10, 3, 50], [11, 3, 20], [18, 3, 26], [27, 3, 40], [35, 4, 24], [40, 5, 30], [48, 5, 60],
    [50, 5, 20], [58, 9, 14], [61, 9, 30], [47, 10, 16], [44, 10, 30]]) cocoonDeco(r, x, y, l);
  cocoonDeco(r, 10, 3, 140, { scale: 2.2 });             // the giant one, fused down onto the floor
  silk(r, 9, 3, 150); silk(r, 13, 6, 120); silk(r, 31, 7, 90); silk(r, 56, 17, 60); silk(r, 60, 18, 50);
  deco(r, 'web', 2, 4); deco(r, 'web', 37, 4, { flip: true }); deco(r, 'web', 62, 18, { flip: true });
  reeds(r, 14, [3, 16, 27, 33, 37]); reeds(r, 23, [46, 56, 61]);
  caps(r, [[6, 14], [15, 14], [26, 14], [36, 14], [40, 17], [47, 23], [59, 23], [58, 14]]);
  deco(r, 'bones', 30, 14); deco(r, 'bones', 53, 23, { flip: true });
  // inside the chamber (veiled until the floor breaks): husks and a blue-lit crystal by the spark
  deco(r, 'crystal', 26, 21, { color: '#9cc0ff' }); deco(r, 'bones', 18, 21); caps(r, [[7, 21], [12, 21]]);
  grass(r, 14, [2, 5, 18, 24, 29, 34]); grass(r, 23, [48, 52, 57, 60]);
  return done(r, { bgSeed: 41, theme: { weather: [{ kind: 'silk', count: 40 }, { kind: 'motes', count: 40, color: LILAC }] } });
}

// =====================================================================================================
// mw_06 — The Silk Galleries (64x27), high in the canopy (Smokewing only). Floor top 24 of thick silk; the west
// side is a solid silk wall. S1 cols 18-21 opens down into the Grove (dips top row 25 at cols 15-17 / 22-24).
// E1 rows 21-23 through a silk curtain arch to the Duchess's Bower. Sconce b col 40 (the rest before the
// Warden), lore_mw_3 on a banner at col 30. The Duchess's last knight (unique, stays dead) holds the arch;
// dusk_moths drift in the west galleries. Silk galleries (one-way decks) tier the vault overhead.
// =====================================================================================================
function mw06() {
  const r = RK.room('mw_06');
  air(r, 4, 3, 62, 23);
  // west silk wall (bulging), vaulted ceiling with hanging silk swags
  mass(r, [[4, 3, 14], [5, 3, 9], [6, 3, 6], [7, 3, 4], [4, 21, 23], [5, 22, 23]]);
  canopy(r, 3, [[8, 12, 3], [16, 22, 4], [17, 21, 5], [27, 33, 3], [36, 44, 4], [38, 42, 5], [48, 52, 3], [55, 62, 5]]);
  // the curtain arch over E1
  box(r, 59, 6, 62, 17); box(r, 60, 18, 62, 20); box(r, 57, 6, 58, 12); box(r, 58, 13, 58, 15);
  // the galleries: tiers of silk decks (optional climbing, a view over the Grove's canopy)
  plat(r, 4, 9, 20); plat(r, 4, 9, 16); plat(r, 5, 11, 12); plat(r, 15, 21, 9); plat(r, 24, 30, 9); plat(r, 34, 40, 11); plat(r, 47, 53, 10);
  // S1 hole + landing dips
  air(r, 15, 24, 24, 24); air(r, 18, 24, 21, 26);
  r.openExits();
  // contents
  r.put(40, 23, { type: 'sconce', id: 'mw_sconce_b' });
  r.put(30, 23, { type: 'lore', id: 'lore_mw_3' });
  enemy(r, 'moth_knight', 55, 23, { range: 2, facing: 'left', id: 'mw_u1', persistent: true, cinders: [28, 40] });
  enemy(r, 'dusk_moth', 11, 18, { range: 5 });
  enemy(r, 'dusk_moth', 27, 12, { range: 5 });
  // lights
  light(r, 40, 20, 6, LILAC, 0.6);                        // moth-glow over the rest
  light(r, 30, 20, 4, PALE, 0.4);
  light(r, 19, 22, 4, VIOLET, 0.35); light(r, 55, 20, 5, VIOLET, 0.35); light(r, 61, 22, 4, PALE, 0.3);
  light(r, 12, 15, 4, VIOLET, 0.3); light(r, 38, 9, 4, VIOLET, 0.3); light(r, 50, 12, 4, VIOLET, 0.3);
  // the Duchess's banners of eye-spotted wings
  for (const [x, y, l, c] of [[30, 6, 150, '#5a3a7a'], [24, 5, 110, '#4a3466'], [34, 4, 120, '#4a3466'], [45, 4, 140, '#5a3a7a'],
    [51, 4, 100, '#4a3466'], [14, 4, 130, '#5a3a7a']]) deco(r, 'banner', x, y, { len: l, color: c, torn: true });
  for (const [x, y, l] of [[38, 6, 30], [40, 6, 60], [42, 6, 24], [19, 6, 40], [10, 4, 20], [55, 8, 30], [60, 21, 0]]) cocoonDeco(r, x, y, l);
  silk(r, 58, 16, 120); silk(r, 61, 21, 60, { scale: 0.8 }); silk(r, 20, 6, 90); silk(r, 50, 4, 130); silk(r, 7, 5, 80);
  deco(r, 'web', 8, 15); deco(r, 'web', 56, 9, { flip: true });
  caps(r, [[8, 23], [13, 23], [26, 23], [35, 23], [46, 23], [58, 23]]);
  reeds(r, 23, [6, 11, 33, 44, 50]);
  grass(r, 23, [9, 25, 28, 37, 43, 48, 52, 57]);
  return done(r, { bgSeed: 53, dark: 0.6, theme: { weather: [{ kind: 'silk', count: 70 }, { kind: 'motes', count: 40, color: LILAC }] } });
}

// =====================================================================================================
// mw_07 — The Cocoon Hollow (shaft, 64x36): the inside of one ancient hollow reed, lined with cocoons. Floor top 33.
// E1 (rows 30-32) through the reed's east wall from the Grove. S1 cols 20-23 (dips top row 34 at cols 17-19 /
// 24-26). N1 cols 40-43: free zig-zag of silk ledges tops 29, 25, 21, 17, 13, 9, 5 (alternating cols 36-40 /
// 43-47; the top one under N1). West: ledges tops 29, 25, 22, 19 (none higher) and, 7 rows above the last, a
// GLAZED cocoon perch (cols 6-11, top row 12, hanging down to row 17) hung from the ceiling by a glazed stalk (cols 6-7), holding mw_geo2 at col 9 (wings). The west wall is GLAZED.
// =====================================================================================================
function mw07() {
  const r = RK.room('mw_07');
  air(r, 3, 3, 53, 32);
  air(r, 40, 0, 43, 2);                                    // N1 neck
  air(r, 54, 30, 62, 32);                                  // E1 tunnel through the reed wall
  // the reed's inner walls: glazed silk-lacquer on the west (no grip near the perch), fibrous on the east
  box(r, 1, 1, 2, 32, 'X'); box(r, 3, 3, 3, 9, 'X'); box(r, 3, 28, 4, 32, 'X');
  // the reed's east wall (face col 48) and a hanging pith column (cols 33-35, down to row 29): the climb's silk
  // ledges grow from both, alternating sides; the Wickling walks under the column's frayed foot
  box(r, 48, 3, 53, 29); mass(r, [[47, 3, 6], [46, 3, 3], [47, 27, 29]]);
  box(r, 33, 3, 35, 29); mass(r, [[32, 3, 8], [36, 3, 6]]);
  canopy(r, 3, [[4, 8, 3], [12, 18, 3], [14, 16, 4], [24, 30, 4], [26, 28, 5], [34, 38, 3], [45, 50, 3]]);
  // floor roots
  box(r, 10, 32, 11, 32); box(r, 27, 32, 28, 32); box(r, 52, 32, 53, 32);
  // N1 climb
  const ys = [29, 25, 21, 17, 13, 9];
  ys.forEach((y, i) => (i % 2 ? plat(r, 43, 47, y) : plat(r, 36, 40, y)));
  plat(r, 39, 44, 5);
  // west ledges (tops >= 19) and the glazed cocoon perch 7 rows above the last
  plat(r, 13, 17, 29); plat(r, 3, 10, 25); plat(r, 13, 17, 22); plat(r, 14, 18, 19);
  // (QA: the 25 ledge now grows from the glazed west wall; the others hang on silk — they floated)
  r.add({ type: 'decor', kind: 'vine_curtain', x: 17, y: 4, len: 600, silk: true });
  r.add({ type: 'decor', kind: 'vine_curtain', x: 15, y: 19, len: 130, silk: true, flip: true });
  r.add({ type: 'decor', kind: 'vine_curtain', x: 15, y: 22, len: 290, silk: true });
  // (a tall hanging cocoon: its glazed flanks and underside keep a no-wings jump from the platforms below out of reach)
  box(r, 6, 12, 11, 14, 'X'); box(r, 7, 15, 10, 16, 'X'); box(r, 8, 17, 9, 17, 'X');
  // QA: the cocoon hangs from the trunk's ceiling by a glazed silk stalk (it read as a floating block); the stalk
  // grows from its west shoulder so the geode keeps the centre of the top
  box(r, 6, 4, 7, 11, 'X');
  // S1 hole + landing dips
  air(r, 17, 33, 26, 33); air(r, 20, 33, 23, 35);
  r.openExits();
  // contents
  r.put(9, 11, { type: 'geode', id: 'mw_geo2', amount: 110 });
  enemy(r, 'moth_knight', 8, 32, { range: 4, facing: 'right' });
  enemy(r, 'dust_maw', 46, 32, { range: 3 });
  enemy(r, 'cocoon_spawner', 32, 28, { attach: 'right', range: 6, leash: 4, max: 2 });
  // lights: cocoons glowing up the whole trunk; the perch's own glow; the doorway
  light(r, 9, 10, 5, LILAC, 0.55, true);
  for (const [x, y] of [[38, 27], [45, 19], [38, 11], [42, 4], [15, 23], [8, 28]]) light(r, x, y, 4, VIOLET, 0.32);
  light(r, 58, 30, 4, PALE, 0.35); light(r, 22, 31, 4, VIOLET, 0.3);
  // dressing: the hollow is lined with cocoons from top to bottom
  // (QA: cocoons/silk/web that snapped under the pith column or the east wall into the walkway/E1 tunnel removed)
  for (const [x, y, l] of [[5, 4, 16], [10, 4, 40], [19, 3, 30], [22, 3, 60], [31, 4, 20], [47, 4, 24],
    [44, 6, 18], [26, 6, 90], [29, 6, 40], [16, 5, 120], [12, 3, 200]]) cocoonDeco(r, x, y, l);
  silk(r, 9, 3, 180, { flip: true });                       // loose silk beside the perch's stalk
  silk(r, 24, 5, 160); silk(r, 35, 4, 140); silk(r, 28, 6, 220);
  deco(r, 'web', 4, 4);
  reeds(r, 32, [6, 14, 28, 35, 41, 52, 58]);
  caps(r, [[12, 32], [16, 33], [29, 32], [38, 32], [56, 32], [60, 32]]);
  deco(r, 'bones', 44, 32); deco(r, 'bones', 49, 32, { flip: true }); deco(r, 'stalagmite', 34, 32, { h: 40 });
  grass(r, 32, [5, 13, 27, 30, 37, 43, 55, 61]);
  return done(r, { bgSeed: 67, theme: { bg: 'shaft', weather: [{ kind: 'silk', count: 50 }, { kind: 'motes', count: 50, color: LILAC }] } });
}

// =====================================================================================================
// mw_08 — The Dustfall Hollow (corridor, 96x18). Floor top 15 (W1/E1 rows 12-14). N1 cols 20-23 up to the Grove
// (one-way ledges tops 12, 8, 4). S1 cols 60-63 down to the Chapel (dips top row 16 at cols 57-59 / 64-66).
// SECRET: the ceiling hangs low over cols 34-50 (solid rows 0-8, air 9-14); its west face (cols 34-35, rows 6-8)
// is cracked (B), reached from a root ledge (cols 28-32, top row 9) climbed by root steps (tops 12 and 9):
// behind it the alcove (cols 36-44, rows 6-8, floor top 9) holds the Last Light sigil. Moth-dust falls like snow.
// =====================================================================================================
function mw08() {
  const r = RK.room('mw_08');
  air(r, 1, 3, 94, 14);
  air(r, 20, 0, 23, 2);                                    // N1 neck
  box(r, 1, 3, 2, 9); box(r, 93, 3, 94, 9); box(r, 3, 3, 3, 6); box(r, 92, 3, 92, 6);   // door lintels
  // ragged ceiling, higher over the root ledge (air from row 5) and the N1 climb
  canopy(r, 3, [[4, 8, 4], [9, 13, 3], [14, 18, 4], [26, 27, 3], [51, 54, 5], [55, 58, 3], [67, 71, 4], [68, 70, 6],
    [76, 80, 3], [84, 88, 5], [85, 87, 6]]);
  canopy(r, 3, [[30, 33, 4]]);
  // the low ceiling (cols 34-50) with the cracked face and the sealed alcove (floor top 9)
  box(r, 34, 3, 50, 8); box(r, 36, 9, 44, 9); box(r, 45, 9, 47, 9);
  box(r, 34, 6, 35, 8, 'B');
  air(r, 36, 6, 44, 8);
  // root steps up to the ledge (tops 12 and 9)
  box(r, 25, 12, 27, 14); box(r, 28, 9, 32, 14); box(r, 33, 12, 33, 14);   // (east step too: the mound is crossable both ways)
  // N1 ledges
  plat(r, 15, 20, 12); plat(r, 22, 26, 8); plat(r, 19, 24, 4);
  // floor roots elsewhere
  box(r, 9, 14, 10, 14); box(r, 52, 14, 53, 14); box(r, 84, 14, 86, 14);
  // S1 hole + landing dips
  air(r, 57, 15, 66, 15); air(r, 60, 15, 63, 17);
  r.openExits();
  // contents
  r.put(40, 8, { type: 'pickup', item: 'sigil', sigil: 'last_light', id: 'mw_sig_last_light' });
  enemy(r, 'dust_maw', 39, 14, { range: 3 });
  enemy(r, 'dust_maw', 77, 14, { range: 3 });
  enemy(r, 'dusk_moth', 12, 9, { range: 5 });
  enemy(r, 'dusk_moth', 82, 9, { range: 5 });
  // lights: dim, grey-violet; the alcove's sigil glows through the cracks
  light(r, 40, 7, 4, '#ffe0a0', 0.55, true);
  light(r, 33, 7, 2, '#ffe0a0', 0.3, true);               // ...and leaks out through the cracked face (hint)
  light(r, 30, 7, 3, VIOLET, 0.35); light(r, 21, 9, 4, VIOLET, 0.3);
  light(r, 61, 13, 4, VIOLET, 0.35); light(r, 8, 12, 4, PALE, 0.3); light(r, 90, 12, 4, PALE, 0.3);
  light(r, 42, 12, 4, LILAC, 0.3); light(r, 76, 11, 4, LILAC, 0.3);
  // dressing: dust heaps (bones), drifting silk, cocoons gone grey with dust
  for (const [x, y, l] of [[6, 5, 20], [11, 4, 40], [16, 5, 16], [37, 10, 10], [42, 10, 22], [48, 9, 14], [56, 4, 50], [69, 7, 16],
    [73, 3, 30], [78, 4, 24], [86, 7, 12], [90, 3, 40]]) cocoonDeco(r, x, y, l, { glow: x % 3 === 0 });
  silk(r, 46, 9, 70); silk(r, 64, 3, 110); silk(r, 82, 3, 90); silk(r, 31, 5, 50);
  deco(r, 'web', 33, 5, { flip: true }); deco(r, 'web', 50, 9); deco(r, 'web', 4, 7);
  for (const x of [17, 36, 41, 47, 70, 74, 80]) deco(r, 'bones', x, 14, { flip: x % 2 === 0 });
  reeds(r, 14, [5, 13, 24, 49, 55, 68, 89]);
  caps(r, [[11, 14], [26, 11], [31, 8], [54, 14], [67, 15], [88, 14]]);
  deco(r, 'stalagmite', 45, 14, { h: 34 }); deco(r, 'stalagmite', 83, 14, { h: 50 });
  grass(r, 14, [3, 7, 14, 19, 34, 51, 56, 72, 79, 91]);
  return done(r, { bgSeed: 79, dark: 0.72, theme: { weather: [{ kind: 'ash', count: 160, color: '#a8a0b8' }, { kind: 'silk', count: 20 }], fog: 1.4 } });
}

// =====================================================================================================
// mw_09 — The Silt Roots (64x36). Upper level top 15: the W1 shelf (cols 1-11), a one-way root bridge (cols 12-27)
// and the upper floor (cols 28-62; one-way ledges tops 12, 8, 4 up to N1 cols 44-47). Under the bridge the room
// steps down in one-way root shelves (tops 19, 23, 27, 30) to the lower floor top 33 at W2 (rows 30-32).
// PLUNGE GATE: frozen cracked floor D (cols 38-45, rows 33-34) over S1 (cols 40-43): one way into the Rime.
// Wren (stage 3) camps east of the crack by a tiny fire; behind her a cracked root wall (B, cols 55-56, rows
// 30-32) hides her den (cols 57-62) with Kiln Glass mw_kg. (Plan deviation: the plan's west-wall den would
// coincide with the W2 doorway at rows 30-32, so the den is at the east end, still right behind her camp.)
// =====================================================================================================
function mw09() {
  const r = RK.room('mw_09');
  air(r, 1, 3, 62, 14);                                    // upper level air
  air(r, 1, 20, 62, 32);                                   // lower cavern
  air(r, 12, 15, 27, 19);                                  // the drop under the root bridge
  air(r, 44, 0, 47, 2);                                    // N1 neck
  // upper ceiling: hanging roots
  canopy(r, 3, [[1, 6, 4], [1, 2, 9], [3, 3, 7], [9, 14, 3], [20, 25, 4], [22, 24, 6], [31, 36, 3], [37, 39, 4], [52, 56, 4], [58, 62, 6], [60, 62, 9]]);
  // root bridge (one-way) across the drop
  plat(r, 12, 27, 15);
  // the upper floor shelf's underside: roots knotted down into the cavern
  canopy(r, 20, [[28, 31, 22], [29, 30, 24], [36, 39, 21], [47, 50, 22], [48, 49, 23], [57, 62, 21], [1, 3, 22]]);
  canopy(r, 15, [[1, 11, 19], [1, 4, 21]]);
  // root shelves down (one-way)
  // (QA: the 19 shelf grows out of the W1 shelf's root mass (col 11), the 23 shelf out of the root knot (col 29); the
  //  27 and 30 shelves hang on silk from the shelf above — they floated)
  plat(r, 12, 17, 19); plat(r, 20, 28, 23); plat(r, 13, 17, 27); plat(r, 20, 24, 30);
  r.add({ type: 'decor', kind: 'vine_curtain', x: 15, y: 19, len: 330, silk: true });
  r.add({ type: 'decor', kind: 'vine_curtain', x: 22, y: 23, len: 290, silk: true, flip: true });
  // N1 ledges
  plat(r, 37, 42, 12); plat(r, 44, 49, 8); plat(r, 43, 48, 4);
  // frozen cracked floor over S1, the den wall
  box(r, 38, 33, 45, 34, 'D');
  box(r, 55, 30, 56, 32, 'B'); box(r, 55, 26, 62, 29);
  r.openExits();
  // contents
  r.put(49, 32, { type: 'npc', npc: 'wren', stage: 3, requires: '!flag:wren_gift' });
  r.put(60, 32, { type: 'pickup', item: 'kiln_glass', id: 'mw_kg' });
  enemy(r, 'moth_knight', 56, 14, { range: 3, facing: 'left' });
  enemy(r, 'dusk_moth', 27, 28, { range: 5 });
  // lights: Wren's tiny fire, frost breathing up through the cracks, moth-glow on the roots
  deco(r, 'candle_cluster', 51, 32, { lit: true, count: 3 }); light(r, 51, 31, 4, EMBER, 0.55, true);
  light(r, 42, 32, 5, FROST, 0.5); light(r, 41, 34, 3, FROST, 0.4);
  light(r, 60, 31, 3, '#ffb070', 0.35, true);             // the kiln glass glints through the cracks
  light(r, 20, 12, 4, VIOLET, 0.3); light(r, 45, 6, 4, PALE, 0.35); light(r, 15, 24, 4, VIOLET, 0.3); light(r, 6, 30, 4, PALE, 0.3);
  light(r, 34, 12, 4, LILAC, 0.3);
  // dressing: roots plunging into frozen silt; frost crystals at the crack
  deco(r, 'crystal', 37, 32, { color: '#bfe4ff' }); deco(r, 'crystal', 46, 32, { color: '#bfe4ff', flip: true });
  deco(r, 'stalagmite', 33, 32, { h: 50 }); deco(r, 'bones', 27, 32);
  for (const [x, y, l] of [[8, 5, 30], [16, 4, 50], [27, 4, 24], [39, 3, 40], [57, 5, 20], [30, 23, 16], [49, 24, 20], [37, 22, 12]]) cocoonDeco(r, x, y, l);
  silk(r, 33, 20, 60); silk(r, 53, 20, 80);
  deco(r, 'web', 4, 22); deco(r, 'web', 61, 22, { flip: true }); deco(r, 'web', 62, 10, { flip: true });
  reeds(r, 14, [3, 9, 30, 35, 51, 61]); reeds(r, 32, [5, 11, 29, 53]);
  caps(r, [[7, 14], [33, 14], [59, 14], [8, 32], [25, 32], [35, 32]]);
  grass(r, 14, [2, 6, 29, 32, 40, 53, 58]); grass(r, 32, [3, 7, 14, 22, 31, 47]);
  return done(r, { bgSeed: 97, theme: { weather: [{ kind: 'motes', count: 50, color: LILAC }, { kind: 'snow', count: 40, color: '#d8e8ff' }], fog: 1.2 } });
}

// =====================================================================================================
// mw_10 — The Chrysalis Chapel (shrine, 96x18). Main floor top 15 (E1 rows 12-14). W1 (rows 3-5) onto a high
// west balcony (cols 1-14, top 6) that steps down in 3-tile steps (tops 9, 12, 15). N1 cols 60-63 (one-way
// ledges tops 12, 8, 4 under it). The chapel is the inside of an enormous empty chrysalis: its split shell hangs
// in ribs from the vault (cols 33-58); at its heart (col 46) the Smokewing shrine under a big pale light.
// lore_mw_4 at col 30. Two dusk_moths outside the inner shell, none within 12 tiles of the shrine.
// =====================================================================================================
function mw10() {
  const r = RK.room('mw_10');
  air(r, 1, 3, 94, 14);
  air(r, 60, 0, 63, 2);                                    // N1 neck
  // west balcony and its steps
  box(r, 1, 6, 14, 14); box(r, 15, 9, 17, 14); box(r, 18, 12, 20, 14);
  box(r, 93, 3, 94, 9); box(r, 92, 3, 92, 6);              // E1 lintel
  // the vault and the chrysalis shell: ribs curving down around the heart, open below row 9
  canopy(r, 3, [[21, 26, 3], [27, 30, 4], [31, 32, 5], [33, 34, 8], [35, 36, 6], [37, 38, 4], [53, 54, 4], [55, 56, 6], [57, 58, 8],
    [59, 59, 5], [66, 70, 4], [71, 74, 3], [80, 84, 4], [81, 83, 5], [88, 91, 3]]);
  box(r, 34, 9, 34, 9); box(r, 57, 9, 57, 9);             // rib tips
  // N1 ledges
  plat(r, 64, 69, 12); plat(r, 58, 63, 8); plat(r, 60, 65, 4);
  // a low dais of chrysalis-silk under the shrine
  box(r, 43, 14, 49, 14);
  r.openExits();
  // contents
  r.put(46, 13, { type: 'shrine', ability: 'wings' });
  r.put(30, 14, { type: 'lore', id: 'lore_mw_4' });
  enemy(r, 'dusk_moth', 22, 9, { range: 6 });
  enemy(r, 'dusk_moth', 77, 9, { range: 6 });
  // lights: the heart (big pale light), the shell's inner glow, the lore stone, the doors
  light(r, 46, 9, 9, PALE, 0.75); light(r, 46, 12, 4, BLUE, 0.5, true);
  light(r, 37, 8, 5, LILAC, 0.35); light(r, 55, 8, 5, LILAC, 0.35);
  light(r, 30, 12, 4, LILAC, 0.4); light(r, 7, 4, 4, PALE, 0.3); light(r, 90, 12, 4, PALE, 0.3); light(r, 62, 6, 4, VIOLET, 0.3);
  light(r, 20, 10, 4, VIOLET, 0.3); light(r, 78, 11, 4, VIOLET, 0.3);
  // dressing: silk curtains along the shell, grey wing-scales drifting, cocoon husks outside
  for (const [x, y, l] of [[35, 9, 60], [36, 7, 90], [38, 5, 120], [54, 5, 120], [55, 7, 90], [56, 9, 60], [41, 3, 150], [51, 3, 150]]) silk(r, x, y, l);
  for (const [x, y, l] of [[24, 4, 30], [29, 5, 20], [68, 5, 40], [73, 4, 18], [82, 6, 24], [86, 3, 50], [90, 3, 20], [12, 3, 16]]) cocoonDeco(r, x, y, l);
  deco(r, 'web', 31, 6); deco(r, 'web', 59, 6, { flip: true });
  caps(r, [[16, 8], [19, 11], [26, 14], [40, 14], [52, 14], [70, 14], [85, 14]]);
  reeds(r, 14, [23, 28, 66, 74, 81, 89]); reeds(r, 5, [3, 9]);
  deco(r, 'wick_grave', 33, 14, { variant: 0 }); deco(r, 'bones', 71, 14);
  // the heart: pale crystals of hardened chrysalis-silk flank the dais; glowing husks hang in the shell's mouth
  deco(r, 'crystal', 42, 14, { color: PALE }); deco(r, 'crystal', 50, 14, { color: PALE, flip: true });
  for (const [x, y, l] of [[44, 3, 70], [48, 3, 54], [46, 3, 110]]) cocoonDeco(r, x, y, l, { glow: true });
  grass(r, 14, [22, 25, 32, 38, 54, 63, 68, 79, 87, 91]); grass(r, 5, [2, 6, 11]);
  return done(r, { bgSeed: 113, dark: 0.62, theme: { bg: 'interior', weather: [{ kind: 'ash', count: 70, color: '#b8b0c8' }, { kind: 'motes', count: 50, color: PALE }] } });
}

// =====================================================================================================
const builders = { mw01, mw02, mw03, mw05, mw06, mw07, mw08, mw09, mw10 };
const only = process.argv.slice(2).filter((a) => !a.startsWith('--'));
for (const [name, fn] of Object.entries(builders)) {
  const r = fn();
  if (process.argv.includes('--print') && (!only.length || only.includes(name) || only.includes(r.id))) {
    console.log('\n' + r.id + '\n' + r.ascii().split('\n').map((l, i) => String(i).padStart(2) + ' ' + l).join('\n'));
  }
}
const out = RK.emit('mothwood', defs, path.join('src', 'data', 'regions', 'mothwood.js'),
  'The Mothwood (region builder: region-mothwood). Arena mw_04 lives in src/data/arenas/vespertine.js');
console.log('wrote ' + path.relative(path.resolve(__dirname, '../..'), out) + ' (' + defs.length + ' rooms)');
