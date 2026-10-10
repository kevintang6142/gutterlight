#!/usr/bin/env node
// tools/gen/meltbloom.js — generator for Meltbloom Gardens (region builder: region-meltbloom).
// Builds every NON-arena room of region 'meltbloom' with tools/lib/roomkit.js exactly to design/world_plan.json
// and emits src/data/regions/meltbloom.js. Never hand-edit the emitted file: edit this, then re-run:
//   node tools/gen/meltbloom.js [--print] [mb_02 ...]     (--print dumps the listed rooms (or all) as ASCII)
// Coordinates: x = column, y = row (room-local, 0-based). Helpers take INCLUSIVE rectangles.
// The arena mb_07 (The Moonlit Lawn) is built by the boss designer in src/data/arenas/sable1.js.
//
// Region identity: sage-and-cream wax gardens. Thorns (^) are the signature hazard, giant wax flowers glow gold,
// vines and weeping strands hang from every overhang; more platforming than combat.
//   mb_01 Garden Gate      first garden room behind the Effigy; brick gives way to wax soil; ladder up to mb_03.
//   mb_02 Bloom Atrium     the hub: a cathedral-tall wax flower whose leaves are the stairs between four levels.
//   mb_03 Pollen Terraces  planter beds; a hanging seed pod 7 up (wings) holds mb_geo1.
//   mb_04 Cloister         ruined arcades; plunge through the cracked reliquary slab to spark_mb; B-wall pocket.
//   mb_05 Petal Bridge     DASH GATE: 9-tile gap over a thorn ravine; shaft down to the shrine.
//   mb_06 Shrine           the Flare Dash shrine (after Sable's first duel), quiet, no enemies.
//   mb_08 Thornwalk        one-way drop from the Atrium; thorn troughs; sconce before the lawn; hedge secret.
//   mb_09 Root Hollows     long root tunnel; barred shaft down to the Mothwood; oilcloak basin to mb_geo2.
//   mb_10 Weeping Arbor    weeping wax trees; a sheer trunk (grip) with mb_hw1 in its crown.
'use strict';
const path = require('path');
const RK = require('../lib/roomkit');

// ------------------------------------------------------------------ helpers
const box = (r, x0, y0, x1, y1, ch = '#') => r.fill(x0, y0, x1 - x0 + 1, y1 - y0 + 1, ch);
const air = (r, x0, y0, x1, y1) => box(r, x0, y0, x1, y1, '.');
const plat = (r, x0, x1, y) => r.platform(x0, y, x1 - x0 + 1);
const deco = (r, kind, x, y, o) => r.add(Object.assign({ type: 'decor', kind, x, y }, o || {}));
const light = (r, x, y, rad, color, intensity, flicker) => r.add({ type: 'light', x, y, r: rad, color, intensity, flicker: !!flicker });
const enemy = (r, kind, x, y, o) => r.put(x, y, Object.assign({ type: 'enemy', kind }, o || {}));
const respawn = (r, x, y, w, h) => r.add({ type: 'respawn', x, y, w, h: h || 4 });
/** Solid mass between per-column top/bottom rows: profile = [[col, top, bottom], ...]. */
function mass(r, profile, ch = '#') { for (const [c, t, b] of profile) if (b >= t) box(r, c, t, c, b, ch); }
/** Round off a rectangular cavity's corner with a diagonal of solid (size n). which: 'tl','tr','bl','br'. */
function corner(r, x, y, n, which) {
  for (let i = 0; i < n; i++) for (let j = 0; j < n - i; j++) {
    r.set(which[1] === 'l' ? x + j : x - j, which[0] === 't' ? y + i : y - i, '#');
  }
}
/** Hanging root/hedge lumps along a ceiling: list of [col0, col1, depth] below row y0. */
function lumps(r, y0, list) { for (const [a, b, d] of list) box(r, a, y0, b, y0 + d - 1); }
/** A vine curtain (decor) hanging from the ceiling tile above (x, y). */
const vines = (r, x, y, len, o) => deco(r, 'vine_curtain', x, y, Object.assign({ len }, o || {}));
/** Floor dressing: grass clumps in front, small wax-caps, reeds. */
function grass(r, y, cols, o) { for (const c of cols) deco(r, 'grass_clump', c, y, Object.assign({ layer: 'front' }, o || {})); }

const GOLD = '#ffd070', WARM = '#ffc070', PALE = '#f6e2a2', SAGE = '#b8d0a0', MOON = '#c8d8f0', VIOLET = '#b890ff';

const defs = [];
/** QA r2: decor must touch the geometry it belongs to (run on the finished grid, after openExits/carving).
 *  - Top-anchored props (vine_curtain, drip) snap UP to the first open row under the ceiling of their column; a drip
 *    keeps its splash point (gap added to fall), a vine curtain keeps its bottom (gap added to len, /scale because the
 *    prop is drawn scaled about its anchor).
 *  - A vine curtain's flat leaf mat (props.js: ellipse ±44*scale px wide, drawn behind the terrain) must not stick out
 *    into open air: in every column it spans, the tile ON the mat's row must be rock (mat hidden) or the tile ABOVE it
 *    must be rock (mat flush). On a sloped/notched ceiling the anchor is raised up to 5 rows while the column above
 *    stays solid (strands then emerge from the rock); failing that, the curtain moves one column (prefer toward the
 *    rock). Anything still unsettled throws, so no mat can float or read as a ledge.
 *  - Bottom-anchored decor must stand on a support tile (throws otherwise). */
const TOP_DECOR = new Set(['vine_curtain', 'drip']);
const SUPPORT = new Set(['#', 'X', '=', '^', 'B', 'D', ':', '~', '%']);
function settleDecor(r) {
  const bad = [];
  const solid = (x, y) => SUPPORT.has(r.get(x, y));
  const ceilTop = (x, y) => { if (solid(x, y)) return -1; while (y > 0 && !solid(x, y - 1)) y--; return y; };
  const matOk = (e, x, y) => {
    const s = e.scale || 1, cx = (x + 0.5) * 40;
    for (let c = Math.floor((cx - 44 * s) / 40); c <= Math.floor((cx + 44 * s - 1) / 40); c++) if (!solid(c, y) && !solid(c, y - 1)) return false;
    return true;
  };
  const move = (e, x, y) => {
    const dy = e.y - y;
    if (e.kind === 'vine_curtain') e.len = Math.round((e.len || 120) + dy * 40 / (e.scale || 1));
    else e.fall = (e.fall || 120) + dy * 40;
    e.x = x; e.y = y;
  };
  for (const e of r.entities) {
    if (e.type !== 'decor') continue;
    if (!TOP_DECOR.has(e.kind)) {
      if (!solid(e.x, e.y + 1)) bad.push(`${e.kind} (${e.x},${e.y}) floats: tile below is '${r.get(e.x, e.y + 1)}'`);
      continue;
    }
    if (solid(e.x, e.y) && (e.kind === 'drip' || matOk(e, e.x, e.y))) continue;   // anchored inside rock: hidden mat
    const y0 = ceilTop(e.x, e.y);
    if (y0 <= 0) { bad.push(`${e.kind} (${e.x},${e.y}) is inside rock or has no ceiling above`); continue; }
    if (e.kind === 'drip' || matOk(e, e.x, y0)) { move(e, e.x, y0); continue; }
    let to = null;
    for (let y = y0 - 1; y >= Math.max(1, y0 - 5) && solid(e.x, y); y--) if (matOk(e, e.x, y)) { to = [e.x, y]; break; }
    if (!to) {
      const dirs = solid(e.x - 1, y0) || solid(e.x - 1, y0 - 1) ? [-1, 1] : [1, -1];
      for (const d of dirs) { const y = ceilTop(e.x + d, e.y); if (y > 0 && Math.abs(y - y0) <= 1 && matOk(e, e.x + d, y)) { to = [e.x + d, y]; break; } }
    }
    if (to) move(e, to[0], to[1]);
    else bad.push(`vine_curtain (${e.x},${e.y}): leaf mat overhangs open air (move it by hand)`);
  }
  if (bad.length) throw new Error(`${r.id}: decor placement:\n  ` + bad.join('\n  '));
}
const done = (r, extra) => { settleDecor(r); defs.push(r.toDef(extra)); return r; };

// =====================================================================================================
// mb_01 — Garden Gate (64x18). Floor top 15. E1 (from the Effigy) / W1 (Atrium east terrace) rows 12-14.
// N1 cols 48-51: one-way wax shelves tops 12, 8, 4 (last spans 47-52 under N1). S1 cols 8-11: hole to the
// Arbor, landing dips (top row 16) cols 5-7 / 12-14. The east end is still the Guttered Ways' brick (rubble,
// dead sconces); westward the soil turns to cream wax and the first giant flower glows behind col 40.
// =====================================================================================================
function mb01() {
  const r = RK.room('mb_01');
  air(r, 1, 2, 62, 14);
  box(r, 1, 2, 2, 11); box(r, 61, 2, 62, 11);              // door lintels: 3-deep doorways
  corner(r, 3, 2, 3, 'tl'); corner(r, 60, 2, 3, 'tr');
  lumps(r, 2, [[9, 13, 1], [20, 23, 2], [21, 22, 3], [30, 33, 1], [37, 40, 1], [56, 58, 1]]);
  // S1 hole + landing dips (top row 16)
  air(r, 5, 15, 14, 15); air(r, 8, 15, 11, 17);
  // a soft rise of wax soil mid-room (the flower bed) and the brick threshold at the east end
  box(r, 29, 14, 32, 14);
  // N1 ladder: wax shelves under the skylight, strung on old vines
  plat(r, 50, 55, 12); plat(r, 44, 49, 8); plat(r, 47, 52, 4);
  air(r, 48, 0, 51, 1);                                   // N1 neck through the ceiling
  r.openExits();
  // contents
  r.put(26, 14, { type: 'lore', id: 'lore_mb_1' });
  enemy(r, 'bloom_spitter', 36, 14, { facing: 1 });
  enemy(r, 'pollen_moth', 15, 7, { range: 6 });
  enemy(r, 'pollen_moth', 33, 6, { range: 5 });
  // the first giant wax flower (background, col 40) and its gold light
  deco(r, 'flower_giant', 40, 14, { lit: true, h: 330, dim: 0.35, layer: 'back' });
  light(r, 40, 6, 7, GOLD, 0.55);
  deco(r, 'flower_giant', 19, 14, { lit: true, h: 210, dim: 0.5, layer: 'back', flip: true });
  light(r, 19, 9, 4.5, GOLD, 0.35);
  // east threshold: the Guttered Ways' rubble and dead sconces, soil creeping over them
  r.add({ type: 'event', script: 'mb_brick', x: 50, y: 14, z: -20, c0: 50, c1: 62, r0: 4, r1: 14 });   // QA: the Guttered brick showing through
  deco(r, 'rubble', 59, 14); deco(r, 'rubble', 53, 14);
  deco(r, 'sconce_dead', 57, 14); deco(r, 'column_broken', 55, 14, { h: 70, dim: 0.2 });
  deco(r, 'mushroom_glow', 50, 14); deco(r, 'reeds', 43, 14);
  deco(r, 'reeds', 23, 14); deco(r, 'mushroom_glow', 16, 14);
  vines(r, 11, 3, 70); vines(r, 22, 5, 60); vines(r, 31, 3, 90); vines(r, 57, 3, 50);
  vines(r, 44, 2, 250, { scale: 0.7 }); vines(r, 55, 2, 400, { scale: 0.7, flip: true });
  light(r, 49, 1, 5, PALE, 0.4);                                   // daylight from the terraces above
  grass(r, 14, [4, 17, 24, 34, 42, 47]);
  deco(r, 'statue_waxen', 6, 15, { variant: 1, material: 'wax', dim: 0.35, layer: 'back' }); // QA r2: in the c5-7 dip (row-16 floor), not over the S1 hole
  light(r, 9, 12, 3.5, WARM, 0.3);
  return done(r, { bgSeed: 11 });
}

// =====================================================================================================
// mb_03 — Pollen Terraces (64x18). Floor top 15 with raised planter beds; W1 rows 12-14 (Atrium canopy),
// S1 cols 48-51 (down to the Garden Gate; landing dips top row 16 at cols 45-47 / 52-54). The glass roof of the
// Atrium continues over the terraces. WINGS REWARD: a seed pod hanging on vines, GLAZED, top row 8 (7 above the
// floor), cols 24-30; nothing standable within 6 tiles that is higher than 1 tile; mb_geo1 sits in the pod.
// =====================================================================================================
function mb03() {
  const r = RK.room('mb_03');
  air(r, 1, 2, 62, 14);
  box(r, 1, 2, 2, 11); corner(r, 3, 2, 2, 'tl');                 // W1 lintel
  box(r, 61, 2, 62, 14); corner(r, 60, 2, 3, 'tr');              // east end wall
  // planter beds (1-2 tile bumps); the 2-tall bed with the spitter keeps 6 cols clear of the pod
  box(r, 6, 14, 10, 14);                     // low bed near W1
  box(r, 14, 14, 17, 14);                    // low bed
  box(r, 36, 13, 41, 14);                    // the spitter's bed (top row 13)
  box(r, 57, 14, 60, 14);                    // bed by the east wall
  // S1 hole + landing dips
  air(r, 45, 15, 54, 15); air(r, 48, 15, 51, 17);
  // the seed pod (GLAZED: no grip), rounded underside
  box(r, 24, 8, 30, 8, 'X'); box(r, 25, 9, 29, 9, 'X'); box(r, 26, 10, 28, 10, 'X');
  r.openExits();
  r.put(27, 7, { type: 'geode', id: 'mb_geo1', amount: 90 });
  enemy(r, 'bloom_spitter', 38, 12, { facing: -1 });
  enemy(r, 'pollen_moth', 38, 5, { range: 4 });            // QA: away from the pod (no moth-pogo shortcut onto the wings reward)
  enemy(r, 'pollen_moth', 12, 8, { range: 4 });
  // the pod hangs from the glass roof on vines
  r.add({ type: 'event', script: 'mb_pod', x: 27, y: 8, z: -5, c0: 24, c1: 30, r0: 8, r1: 10, top: 2 });
  light(r, 27, 7, 3.5, GOLD, 0.45);
  r.add({ type: 'event', script: 'mb_glassroof', x: 1, y: 0, z: -5, c0: 0, c1: 63, r0: 0, r1: 1 });
  for (const c of [9, 22, 33, 44, 56]) light(r, c, 3, 4, PALE, 0.25);       // daylight through the glass
  deco(r, 'flower_giant', 8, 13, { lit: true, h: 170, dim: 0.3 });
  deco(r, 'flower_giant', 16, 13, { lit: true, h: 140, dim: 0.3, flip: true });
  deco(r, 'flower_giant', 34, 14, { lit: true, h: 260, dim: 0.5, layer: 'back' });
  deco(r, 'flower_giant', 58, 13, { lit: true, h: 180, dim: 0.3, flip: true });
  deco(r, 'mushroom_glow', 40, 12); deco(r, 'reeds', 43, 14); deco(r, 'reeds', 21, 14);
  grass(r, 14, [4, 12, 19, 23, 31, 44, 55]); grass(r, 13, [7, 15, 58]); grass(r, 12, [37]);
  vines(r, 6, 2, 80); vines(r, 46, 2, 60); vines(r, 57, 2, 90);
  return done(r, { theme: { weather: [{ kind: 'pollen', count: 90 }, { kind: 'motes', count: 30 }], fog: 1.3 }, bgSeed: 23 });
}

// =====================================================================================================
// mb_06 — Shrine of the Flare (64x18). Quiet chapel of white wax petals beyond Sable's lawn; no enemies.
// E1 rows 12-14 (the arena's west door). Shrine (dash, requires boss:sable1) at col 30 in a petal apse;
// lore_mb_4 on a petal plinth at col 49. N1 cols 10-13: wax shelves tops 12, 8, 4 up to the Petal Bridge.
// S1 cols 40-43: hole down to the Root Hollows (landing dips top row 16 at cols 37-39 / 44-46).
// =====================================================================================================
function mb06() {
  const r = RK.room('mb_06');
  air(r, 3, 2, 61, 14);
  box(r, 3, 2, 5, 14); corner(r, 6, 2, 3, 'tl');                 // thick west wall (the shelves bracket into it)
  box(r, 61, 2, 62, 11); corner(r, 60, 2, 3, 'tr');              // E1 lintel
  air(r, 61, 12, 62, 14);
  air(r, 9, 1, 15, 1); air(r, 10, 0, 13, 0);                     // N1 neck + headroom over the top shelf
  // the shrine's dais (two low wax steps)
  box(r, 25, 14, 35, 14); box(r, 28, 13, 32, 13);
  // S1 hole + landing dips
  air(r, 37, 15, 46, 15); air(r, 40, 15, 43, 17);
  // the plinth for the lore
  box(r, 48, 14, 50, 14);
  plat(r, 12, 16, 12); plat(r, 6, 11, 8); plat(r, 9, 14, 4);
  r.openExits();
  r.put(30, 12, { type: 'shrine', ability: 'dash', requires: 'boss:sable1' });
  r.put(49, 13, { type: 'lore', id: 'lore_mb_4' });
  deco(r, 'statue_waxen', 26, 13, { variant: 1, material: 'wax', dim: 0.15 });
  deco(r, 'statue_waxen', 34, 13, { variant: 1, material: 'wax', dim: 0.15, flip: true });
  deco(r, 'flower_giant', 30, 12, { lit: true, h: 300, dim: 0.55, layer: 'back' });
  deco(r, 'flower_giant', 54, 14, { lit: true, h: 200, dim: 0.35, flip: true });
  deco(r, 'flower_giant', 19, 14, { lit: true, h: 180, dim: 0.35 });
  light(r, 30, 8, 7, PALE, 0.45); light(r, 30, 12, 3, '#9fd0ff', 0.35);
  light(r, 54, 8, 4, GOLD, 0.35); light(r, 19, 9, 4, GOLD, 0.3);
  light(r, 61, 13, 3.5, MOON, 0.35);                             // moonlight from the lawn
  vines(r, 18, 2, 80); vines(r, 47, 2, 90); vines(r, 57, 2, 60);
  deco(r, 'mushroom_glow', 52, 14); deco(r, 'reeds', 57, 14); deco(r, 'reeds', 8, 14);
  grass(r, 14, [15, 20, 23, 36, 52, 55, 59]); grass(r, 13, [26, 34]);
  return done(r, { theme: { bg: 'interior', weather: [{ kind: 'pollen', count: 40 }, { kind: 'light', count: 10 }] }, bgSeed: 61, dark: 0.3 });
}

// =====================================================================================================
// mb_10 — Weeping Arbor (64x18). Floor top 15. N1 cols 8-11 (up to the Garden Gate): wax shelves tops 12, 8, 4.
// S1 cols 44-47 (down to the Thornwalk; landing dips top row 16 at cols 41-43 / 48-50). Two weeping wax trees
// hang their canopies from the ceiling (trunks are back wall); vine lurkers wait in their strands. GRIP REWARD:
// the sheer trunk at the east end (cols 56-58, plain #, 9 tiles from the floor to its top at row 6) — its crown
// hollow (cols 56-61, rows 3-5) holds mb_hw1. The east side of the trunk is fused with the room wall.
// =====================================================================================================
function mb10() {
  const r = RK.room('mb_10');
  air(r, 1, 2, 62, 14);
  box(r, 1, 2, 2, 14); corner(r, 3, 2, 2, 'tl');
  air(r, 5, 1, 14, 1); air(r, 8, 0, 11, 0);                      // N1 neck
  // weeping tree canopies (ceiling masses) with back-wall trunks
  mass(r, [[17, 2, 4], [18, 2, 6], [19, 2, 7], [20, 2, 8], [21, 2, 8], [22, 2, 8], [23, 2, 8], [24, 2, 8], [25, 2, 7], [26, 2, 6], [27, 2, 4]]);
  box(r, 21, 9, 22, 14, ':');
  mass(r, [[31, 2, 3], [32, 2, 5], [33, 2, 7], [34, 2, 8], [35, 2, 8], [36, 2, 8], [37, 2, 8], [38, 2, 7], [39, 2, 5], [40, 2, 3]]);
  box(r, 35, 9, 36, 14, ':');
  // S1 hole + landing dips
  air(r, 41, 15, 50, 15); air(r, 44, 15, 47, 17);
  // the sheer trunk + its crown (GRIP REWARD)
  box(r, 56, 6, 62, 14);                     // trunk (west face col 56 is the 9-tile climb) fused with the east wall
  box(r, 52, 2, 62, 2); box(r, 53, 3, 55, 3); box(r, 62, 3, 62, 5); // the crown's underside, lip, back
  plat(r, 11, 16, 12); plat(r, 3, 10, 8); plat(r, 7, 12, 4);
  r.openExits();
  r.put(59, 5, { type: 'pickup', item: 'heartwax', id: 'mb_hw1' });
  enemy(r, 'vine_lurker', 23, 9, { surface: 'ceiling' });
  enemy(r, 'vine_lurker', 37, 9, { surface: 'ceiling' });
  enemy(r, 'pollen_moth', 30, 11, { range: 4 });           // QA: between the canopies, clear of both landings
  // weeping strands
  for (const [c, l] of [[18, 140], [20, 210], [22, 150], [24, 220], [26, 130], [32, 150], [34, 220], [37, 170], [39, 120]]) vines(r, c, c < 30 ? 9 : 9, l, { scale: 0.9 });
  vines(r, 54, 4, 90); vines(r, 57, 3, 40, { scale: 0.6 });
  light(r, 59, 4, 3, GOLD, 0.5);
  light(r, 23, 10, 3.5, PALE, 0.25); light(r, 36, 10, 3.5, PALE, 0.25);
  deco(r, 'flower_giant', 30, 14, { lit: true, h: 160, dim: 0.35 });
  deco(r, 'flower_giant', 14, 14, { lit: true, h: 230, dim: 0.45, layer: 'back', flip: true });
  light(r, 30, 11, 4, GOLD, 0.35); light(r, 14, 9, 4, GOLD, 0.3);
  deco(r, 'mushroom_glow', 53, 14); deco(r, 'reeds', 51, 14); deco(r, 'reeds', 5, 14);
  grass(r, 14, [7, 17, 26, 29, 33, 39, 54]);
  return done(r, { theme: { fog: 1.2 }, bgSeed: 103, dark: 0.42 });
}

// =====================================================================================================
// mb_05 — The Petal Bridge (64x27). DASH GATE. Petal decks top row 15: east cols 35-63 (E1 rows 12-14 from the
// Atrium's west terrace), west cols 2-25. The middle has fallen: a 9-tile gap at equal height (cols 26-34) over a
// 9-deep ravine with a thorn bed (^ row 24); ravine walls (cols 25 / 35, rows 15-23) GLAZED. S1 cols 10-13: shaft
// from the west deck down to the shrine, wax shelves tops 18, 21, 25. Two moths over the ravine (never required).
// =====================================================================================================
function mb05() {
  const r = RK.room('mb_05');
  air(r, 2, 3, 62, 14);
  box(r, 2, 3, 3, 10); corner(r, 4, 3, 3, 'tl');                 // west wall bulge (the deck's far end)
  box(r, 61, 3, 62, 11); corner(r, 60, 3, 3, 'tr');              // E1 lintel
  air(r, 14, 1, 48, 2);                                          // the high vault over the ravine
  corner(r, 14, 1, 3, 'tl'); corner(r, 48, 1, 3, 'tr');
  lumps(r, 3, [[7, 9, 1], [52, 55, 2], [53, 54, 3]]);
  lumps(r, 1, [[22, 24, 2], [38, 40, 2], [39, 39, 3]]);
  // the ravine
  air(r, 26, 15, 34, 23);
  box(r, 26, 24, 34, 24, '^');
  box(r, 25, 15, 25, 23, 'X'); box(r, 35, 15, 35, 23, 'X');
  r.add({ type: 'event', script: 'mb_ravine', x: 26, y: 15, z: -20, c0: 26, c1: 34, r0: 15, r1: 18, alpha: 0.97 });
  // QA: the thorn bed and brambles climbing the glazed ravine walls (the chasm reads as thorn-choked from the deck)
  r.add({ type: 'event', script: 'mb_thorns', x: 26, y: 24, climb: [[26, 15, 23, -1], [34, 15, 23, 1]], span: [[26, 34, 17, 1.2], [26, 34, 20, 0.8]] });
  // the shaft down to the Shrine of the Flare
  air(r, 10, 15, 13, 26);
  plat(r, 10, 13, 18); plat(r, 10, 13, 21); plat(r, 10, 13, 25);
  r.openExits();
  enemy(r, 'pollen_moth', 28, 8, { range: 4 });
  enemy(r, 'pollen_moth', 33, 5, { range: 4 });
  // hazard respawns: boxes end exactly at the lips (cols 25 / 35), points 4 tiles back
  respawn(r, 21, 14, 9); respawn(r, 39, 14, 9);
  // the bridge: fallen petals, the broken ends, wax drips into the ravine
  r.add({ type: 'event', script: 'mb_petals', x: 2, y: 15, z: -5, spans: [[2, 9], [14, 25], [35, 62]], droop: [25, 35, 9, 14], row: 15 });
  deco(r, 'flower_giant', 44, 14, { lit: true, h: 380, dim: 0.5, layer: 'back' });
  deco(r, 'flower_giant', 18, 14, { lit: true, h: 300, dim: 0.5, layer: 'back', flip: true });
  deco(r, 'flower_giant', 55, 14, { lit: true, h: 200, dim: 0.3, flip: true });
  deco(r, 'flower_giant', 6, 14, { lit: true, h: 170, dim: 0.3 });
  light(r, 44, 5, 7, GOLD, 0.45); light(r, 18, 6, 6, GOLD, 0.4);
  light(r, 55, 10, 4, GOLD, 0.3); light(r, 6, 11, 4, GOLD, 0.3);
  deco(r, 'drip', 30, 3, { fall: 760, color: '#ece3c2' }); deco(r, 'drip', 33, 3, { fall: 760, color: '#ece3c2' });
  vines(r, 23, 3, 120); vines(r, 39, 4, 110, { flip: true }); vines(r, 31, 3, 80); vines(r, 9, 4, 70); vines(r, 53, 5, 60);
  deco(r, 'reeds', 22, 14); deco(r, 'reeds', 38, 14); deco(r, 'mushroom_glow', 4, 14); deco(r, 'mushroom_glow', 58, 14);
  grass(r, 14, [3, 7, 16, 20, 24, 36, 41, 47, 50, 59]);
  light(r, 30, 22, 4, '#7a3020', 0.25);                          // a faint ember-red at the thorn bed (danger)
  return done(r, { bgSeed: 57, theme: { weather: [{ kind: 'pollen', count: 50 }, { kind: 'motes', count: 30 }] } });
}

// =====================================================================================================
// mb_08 — The Thornwalk (96x18). Floor top 15; W1 rows 12-14 = the Moonlit Lawn's east door. N1 cols 10-13: the
// ONE-WAY drop from the Atrium lands on a moss mound; its shaft is lined with GLAZED wax and opens 7 rows below the
// ceiling under a hanging hedge mass (no platforms, nothing grippable: no way back up). N2 cols 76-79: wax shelves
// tops 12, 8, 4 up to the Weeping Arbor. Thorn troughs (^, 1 deep, 5 wide) at cols 30-34 and 52-56; hoppers between
// them, spitters on two low hedges, a vine lurker under a hanging hedge at col 44. mb_sconce_b at col 6 (the rest
// before the duel). SECRET: the dense hedge at the east end (cols 84-95, full height) has a cracked west face
// (B, cols 84-85, rows 12-14) hiding a niche (cols 86-93) with the Thorned Wax sigil.
// =====================================================================================================
function mb08() {
  const r = RK.room('mb_08');
  air(r, 3, 3, 83, 14);
  box(r, 1, 3, 2, 11, 'X');                                      // above the lawn door: glazed (no climbing up)
  air(r, 1, 12, 2, 14);                                          // the lawn door
  // the hanging hedge mass around the N1 shaft (glazed lining)
  mass(r, [[3, 3, 6], [4, 3, 6], [5, 3, 6], [6, 3, 6], [7, 3, 6], [8, 3, 6], [15, 3, 6], [16, 3, 6], [17, 3, 6], [18, 3, 5], [19, 3, 4], [20, 3, 3]]);
  box(r, 9, 0, 9, 6, 'X'); box(r, 14, 0, 14, 6, 'X'); air(r, 10, 0, 13, 6);
  box(r, 8, 14, 15, 14); box(r, 10, 13, 13, 13);                // the moss mound
  lumps(r, 3, [[25, 28, 1], [34, 36, 1], [57, 60, 2], [58, 59, 3], [68, 70, 1]]);
  // thorn troughs
  box(r, 30, 15, 34, 15, '^'); box(r, 52, 15, 56, 15, '^');
  // thorn fringes under the hedge ceiling (out of reach of any jump without wings; they read the corridor)
  box(r, 29, 3, 33, 3, '^'); box(r, 50, 3, 56, 3, '^'); box(r, 61, 3, 66, 3, '^');
  // low hedges (spitters) and the hanging hedge (lurker)
  box(r, 20, 13, 25, 14); box(r, 62, 13, 67, 14);
  mass(r, [[41, 3, 6], [42, 3, 8], [43, 3, 9], [44, 3, 9], [45, 3, 9], [46, 3, 8], [47, 3, 6]]);
  // N2: headroom over the top shelf, neck, shelves
  air(r, 72, 1, 82, 2); air(r, 76, 0, 79, 0);
  plat(r, 70, 74, 12); plat(r, 76, 81, 8); plat(r, 75, 80, 4);
  // SECRET niche behind the cracked hedge face
  box(r, 84, 3, 85, 14);                                          // (the hedge is solid already; keep it explicit)
  box(r, 84, 12, 85, 14, 'B'); air(r, 86, 12, 93, 14);
  r.openExits();
  r.put(6, 14, { type: 'sconce', id: 'mb_sconce_b' });
  r.put(90, 14, { type: 'pickup', item: 'sigil', sigil: 'thorned_wax', id: 'mb_sig_thorned_wax' });
  enemy(r, 'bloom_spitter', 24, 12, { facing: 1 });
  enemy(r, 'bloom_spitter', 63, 12, { facing: -1 });
  enemy(r, 'thorn_hopper', 41, 14, { range: 1 });             // QA: beats 40-42 / 45-47 keep both mid respawns (36, 50) clear
  enemy(r, 'thorn_hopper', 46, 14, { range: 1 });
  enemy(r, 'vine_lurker', 44, 10, { surface: 'ceiling' });
  respawn(r, 27, 14, 5); respawn(r, 36, 14, 3); respawn(r, 50, 14, 3); respawn(r, 58, 14, 3);   // boxes end at the trough lips
  // light: the sconce's warmth, moonlight from the lawn, the flowers' gold, the niche's hidden glimmer
  light(r, 6, 12, 5, WARM, 0.5, true);
  light(r, 2, 12, 5, MOON, 0.45); light(r, 12, 9, 3, MOON, 0.2);
  deco(r, 'flower_giant', 34, 14, { lit: true, h: 260, dim: 0.5, layer: 'back' });
  deco(r, 'flower_giant', 72, 14, { lit: true, h: 220, dim: 0.45, layer: 'back', flip: true });
  light(r, 34, 8, 5, GOLD, 0.35); light(r, 72, 9, 5, GOLD, 0.35);
  for (const [c, l] of [[21, 70], [27, 60], [43, 50], [45, 40], [58, 90], [69, 60], [82, 120]]) vines(r, c, c === 43 || c === 45 ? 10 : (c === 58 ? 5 : 4), l);
  deco(r, 'mushroom_glow', 81, 14); deco(r, 'mushroom_glow', 89, 14); deco(r, 'reeds', 87, 14); deco(r, 'reeds', 93, 14, { flip: true });
  deco(r, 'reeds', 17, 14); deco(r, 'reeds', 50, 14); deco(r, 'reeds', 69, 14);
  grass(r, 14, [4, 16, 19, 28, 36, 40, 46, 58, 70, 78, 82]); grass(r, 12, [10, 13, 21, 66]);
  // QA: the black thorn hedges behind the corridor, and readable thorn troughs / fringes
  r.add({ type: 'event', script: 'mb_hedges', x: 16, y: 14, z: -20, hedges: [[16, 29, 8, 15], [36, 51, 9, 15], [57, 69, 7, 15]], alpha: 0.85 });
  r.add({ type: 'event', script: 'mb_thorns', x: 30, y: 15 });
  return done(r, { bgSeed: 89, dark: 0.45, theme: { fg: 1.4, weather: [{ kind: 'pollen', count: 30 }, { kind: 'motes', count: 30 }] } });
}

// =====================================================================================================
// mb_09 — Root Hollows (128x18). A long tunnel through the garden's root mat. Floor top 15. N1 cols 40-43 (from the
// shrine): wax shelves tops 12, 8, 4. S1 cols 20-23: the barred shaft down to the Mothwood (the grate itself is
// mw_gate1 inside mw_03; here the bars and the violet moth-light are drawn by the mb_grate event); landing dips
// top row 16 at cols 17-19 / 24-26. OILCLOAK REWARD: cols 76-97 the floor sinks into meltwater (rows 15-16 over
// the basin floor row 17), the root ceiling hangs down over the whole basin (air rows 12-14 only), beyond it a dry
// grotto (cols 98-124, sealed at the east end) holds mb_geo2.
// =====================================================================================================
function mb09() {
  const r = RK.room('mb_09');
  air(r, 7, 4, 124, 14);
  // west dead end: a tangle of roots sloping into the wall
  mass(r, [[7, 4, 9], [8, 4, 7], [9, 4, 5], [7, 13, 14]]);
  // root-mat ceiling: uneven, with hanging root knots (two of them shelter the lurkers)
  lumps(r, 4, [[12, 15, 1], [27, 29, 4], [28, 29, 5], [30, 33, 6], [31, 32, 6], [50, 53, 1], [60, 62, 6], [61, 61, 6], [63, 64, 3], [70, 72, 2]]);
  // N1: headroom over the top shelf and the neck
  air(r, 36, 2, 47, 3); air(r, 40, 0, 43, 1);
  plat(r, 44, 48, 12); plat(r, 37, 42, 8); plat(r, 39, 44, 4);
  // S1 + landing dips; the bars and the moth-light below
  air(r, 17, 15, 26, 15); air(r, 20, 15, 23, 17);
  r.add({ type: 'event', script: 'mb_grate', x: 20, y: 17, c0: 20, w: 4, r: 17, opens: 'lever:mw_lv1' });
  // a root step or two along the dry stretch
  box(r, 55, 14, 58, 14); box(r, 66, 14, 67, 14);
  // the meltwater basin under a low root ceiling (3 tiles of air)
  box(r, 74, 4, 99, 11);
  mass(r, [[73, 4, 9], [72, 4, 7], [100, 4, 9], [101, 4, 7]]);
  box(r, 76, 15, 97, 16, '~');
  // the dry grotto, sealed at the east end
  mass(r, [[122, 4, 14], [123, 4, 14], [124, 4, 14], [121, 4, 8], [120, 4, 6], [121, 13, 14]]);
  lumps(r, 4, [[106, 109, 2], [114, 116, 1]]);
  r.openExits();
  r.put(116, 14, { type: 'geode', id: 'mb_geo2', amount: 110 });
  enemy(r, 'vine_lurker', 31, 10, { surface: 'ceiling' });
  enemy(r, 'vine_lurker', 61, 10, { surface: 'ceiling' });
  enemy(r, 'thorn_hopper', 61, 14, { range: 3 });          // QA: off the N1 ladder's foot
  enemy(r, 'pollen_moth', 56, 7, { range: 4 });
  respawn(r, 72, 14, 7);                                         // box ends at the basin lip (col 75)
  // light: the violet moth-light from below, glow-caps along the roots, the grotto's gold
  light(r, 21, 15, 4, VIOLET, 0.4, true); light(r, 21, 11, 3, VIOLET, 0.2);
  light(r, 41, 3, 4, PALE, 0.35);                                 // the shrine's light falling through N1
  light(r, 112, 10, 6, GOLD, 0.4); light(r, 86, 13, 5, '#a8d0b0', 0.3);
  for (const c of [11, 35, 48, 57, 66, 104, 110, 119]) deco(r, 'mushroom_glow', c, 14);
  deco(r, 'mushroom_glow', 25, 15);                                // QA r2: on the lower floor (row 16) beside the step
  deco(r, 'flower_giant', 112, 14, { lit: true, h: 150, dim: 0.3 });
  deco(r, 'reeds', 99, 14); deco(r, 'reeds', 102, 14, { flip: true }); deco(r, 'reeds', 74, 14);
  for (const [c, y, l] of [[14, 5, 70], [29, 9, 40], [32, 10, 30], [46, 4, 60], [51, 5, 70], [62, 10, 30], [71, 6, 60], [80, 12, 30], [88, 12, 30], [95, 12, 30], [107, 6, 70], [115, 5, 80]]) vines(r, c, y, l, { scale: 0.8 });
  deco(r, 'drip', 84, 12, { fall: 80, color: '#a8c8b0' }); deco(r, 'drip', 92, 12, { fall: 80, color: '#a8c8b0' });
  grass(r, 14, [9, 16, 28, 38, 46, 54, 63, 70, 100, 105, 118]);
  // QA: the root mat (gnarled wax roots hanging from the ceiling; kept clear of the N1 ladder, the S1 shaft and the lurkers)
  r.add({ type: 'event', script: 'mb_roots', x: 8, y: 4, c0: 8, c1: 120, every: 3, len: 3.2, skip: [[18, 25], [29, 33], [36, 48], [59, 63]] });
  return done(r, { bgSeed: 131, dark: 0.55, theme: { bg: 'interior', weatherDensity: 0.6, fog: 0.8 } });
}

// =====================================================================================================
// mb_04 — Overgrown Cloister (64x27). Optional dead end off the Atrium canopy. E1 rows 12-14 enters onto a roofed
// east gallery (floor top 15, cols 40-63) that steps down 3 tiles to the courtyard (floor top 18, cols 8-39; rows
// 18-26 solid except the crypt). Two ruined arcades (roof slabs rows 10-11, back-wall pillars) with vine lurkers;
// the collapsed bay between them (cols 20-25) lets the light fall onto the cracked reliquary slab: D at cols 20-25,
// rows 18-19. PLUNGE REWARD: the crypt below (cols 12-36, air rows 20-23, floor top 24) holds spark_mb on a bier;
// way out: a wax shelf (top 21, cols 17-21) beside and under the hole. SECRET: B wall cols 6-7 rows 15-17 hides a pocket
// (cols 1-5) with mb_geo3; lore_mb_3 on a fallen arcade pillar at col 30.
// =====================================================================================================
function mb04() {
  const r = RK.room('mb_04');
  air(r, 8, 3, 62, 17);
  corner(r, 8, 3, 4, 'tl');
  lumps(r, 3, [[14, 17, 1], [29, 33, 1], [30, 32, 2]]);
  // the roofed east gallery (the cloister's upper storey) and its floor
  box(r, 44, 3, 62, 8); mass(r, [[43, 3, 6], [42, 3, 4], [41, 3, 3]]);
  box(r, 40, 15, 62, 17);
  air(r, 61, 12, 62, 14);
  // arcades: roof slabs on back-wall pillars
  box(r, 8, 10, 19, 11); box(r, 26, 10, 38, 11);
  for (const c of [11, 16]) box(r, c, 12, c, 17, ':');
  for (const c of [29, 35]) box(r, c, 12, c, 17, ':');
  box(r, 44, 9, 44, 14, ':'); box(r, 52, 9, 52, 14, ':');         // gallery pillars
  // SECRET pocket behind the cracked wall
  air(r, 1, 15, 5, 17); box(r, 6, 15, 7, 17, 'B');
  // the reliquary slab and the crypt
  box(r, 20, 18, 25, 19, 'D');
  air(r, 12, 20, 36, 23);
  corner(r, 12, 20, 2, 'tl'); corner(r, 36, 20, 2, 'tr');
  air(r, 16, 19, 19, 19);                                         // headroom over the way-out shelf
  plat(r, 17, 21, 21);                                            // the way out: shelf beside / under the broken slab
  box(r, 29, 23, 33, 23);                                         // the bier
  r.openExits();
  r.put(31, 22, { type: 'pickup', item: 'spark', id: 'spark_mb' });
  r.put(3, 17, { type: 'geode', id: 'mb_geo3', amount: 70 });
  r.put(30, 17, { type: 'lore', id: 'lore_mb_3' });
  enemy(r, 'vine_lurker', 13, 12, { surface: 'ceiling' });
  enemy(r, 'vine_lurker', 36, 12, { surface: 'ceiling' });
  enemy(r, 'thorn_hopper', 15, 17, { range: 2 });          // QA: off the D slab (it fell into the crypt)
  // dressing: light through the collapsed bay, the crypt's spark glow, candles of the old gardeners
  light(r, 22, 6, 6, PALE, 0.4); light(r, 22, 15, 4, PALE, 0.3);
  light(r, 31, 21, 4, GOLD, 0.45); light(r, 24, 22, 3, WARM, 0.2);
  deco(r, 'statue_waxen', 26, 23, { variant: 1, material: 'wax', dim: 0.2 });
  deco(r, 'statue_waxen', 35, 23, { variant: 2, material: 'stone', dim: 0.3, flip: true });
  deco(r, 'column_broken', 30, 17, { h: 50, dim: 0.1 });
  deco(r, 'column_broken', 9, 17, { h: 80, dim: 0.3 }); deco(r, 'rubble', 18, 17); deco(r, 'rubble', 38, 17);
  deco(r, 'fountain', 57, 14, { dim: 0.2 });
  deco(r, 'statue_waxen', 48, 14, { variant: 0, material: 'wax', dim: 0.3 });
  deco(r, 'flower_giant', 22, 17, { lit: true, h: 260, dim: 0.5, layer: 'back' });
  light(r, 22, 12, 4, GOLD, 0.3);
  for (const [c, y, l] of [[9, 12, 90], [18, 12, 70], [27, 12, 80], [33, 12, 50], [38, 12, 90], [13, 4, 160], [36, 4, 120], [47, 9, 50], [58, 9, 60]]) vines(r, c, y, l);
  deco(r, 'mushroom_glow', 14, 23); deco(r, 'mushroom_glow', 9, 17); deco(r, 'reeds', 39, 17); // QA r2: rising from the pit floor (row 18) by the step face
  grass(r, 17, [10, 14, 19, 27, 33, 37]); grass(r, 14, [42, 46, 50, 55, 60]);
  return done(r, { bgSeed: 7, dark: 0.45, theme: { bg: 'interior', weather: [{ kind: 'motes', count: 40 }, { kind: 'pollen', count: 20 }] } });
}

// =====================================================================================================
// mb_02 — The Bloom Atrium (96x54). REGION HUB and landmark: a glass-roofed hall around THE MELTBLOOM, a wax flower
// as tall as a cathedral (event mb_meltbloom: stem cols 42-53, cup rim row 15). Four levels, all joined by the
// flower and climbable without abilities:
//   (1) CANOPY row 15: W walkway cols 0-20 (W1 rows 12-14), E walkway cols 75-95 (E1 rows 12-14), joined by petal
//       bridges (one-way, row 15) and the rim of the cup: two glazed lip-tips (cols 30-31 / 64-65, top row 15) with
//       the shallow bowl between them (one-way, row 17).
//   (2) EAST TERRACE top 33, cols 72-95 (E2 rows 30-32, from the Garden Gate).
//   (3) WEST TERRACE top 42, cols 0-24 (W2 rows 39-41, toward the Petal Bridge).
//   (4) GROUND top 51 (rows 51-53) with the flower's planter (cols 41-54, top 49), the Lanternway at col 24, the
//       sconce at col 58 under the flower, lore_mb_2 on the planter's west face (col 39).
// Leaves (one-way, alternating sides, never > 4 rows apart): 47 R, 43 L, 39 R, 35 L, 31 R, 27 L, 23 R, 19 (outer E).
// S1 cols 74-77: the ONE-WAY drop into the Thornwalk, fenced by 1-tile lips.
// =====================================================================================================
function mb02() {
  const r = RK.room('mb_02');
  air(r, 1, 4, 94, 50);
  // walls and door lintels
  box(r, 1, 4, 2, 11); corner(r, 3, 4, 3, 'tl');
  box(r, 93, 4, 94, 11); corner(r, 92, 4, 3, 'tr');
  box(r, 1, 18, 3, 38); box(r, 4, 18, 4, 30); box(r, 5, 18, 5, 22);
  box(r, 92, 18, 94, 29); box(r, 91, 18, 91, 24); box(r, 90, 18, 90, 20);
  box(r, 1, 44, 1, 50);
  // (1) canopy walkways (with tapered undersides)
  box(r, 1, 15, 20, 17); mass(r, [[6, 18, 19], [7, 18, 18], [8, 18, 18], [9, 18, 18]]);
  box(r, 75, 15, 94, 17); mass(r, [[86, 18, 19], [87, 18, 19], [88, 18, 18], [89, 18, 18]]);
  plat(r, 21, 29, 15); plat(r, 66, 74, 15);                         // petal bridges
  box(r, 30, 15, 31, 18, 'X'); box(r, 64, 15, 65, 18, 'X');         // the cup's glazed lip-tips
  plat(r, 32, 63, 17);                                              // the shallow bowl
  // (2) east terrace, (3) west terrace
  box(r, 72, 33, 94, 35); mass(r, [[72, 36, 36], [73, 36, 36], [80, 36, 37], [81, 36, 37], [82, 36, 36]]);
  box(r, 1, 42, 24, 43); mass(r, [[1, 44, 44], [2, 44, 44]]);
  // (4) ground floor: the planter, the drop with its lips
  box(r, 41, 49, 54, 50);
  air(r, 74, 51, 77, 53); r.set(73, 50, '#'); r.set(78, 50, '#');
  plat(r, 74, 77, 52);   // a wax shelf just inside the drop: hop the lip, stand over the dark, Down+Jump to drop
  // the Meltbloom's leaves
  const leaves = [[48, 62, 47, -1], [28, 47, 43, 1], [48, 62, 39, -1], [33, 47, 35, 1], [48, 66, 31, -1], [33, 47, 27, 1], [48, 66, 23, -1], [66, 72, 19, -1]];
  for (const [a, b, y] of leaves) plat(r, a, b, y);
  r.openExits();
  // contents
  r.put(24, 50, { type: 'lanternway', id: 'meltbloom' });
  r.put(58, 50, { type: 'sconce', id: 'mb_sconce_a' });
  r.put(39, 50, { type: 'lore', id: 'lore_mb_2' });
  enemy(r, 'pollen_moth', 20, 8, { range: 5 });
  enemy(r, 'pollen_moth', 14, 35, { range: 6 });
  enemy(r, 'pollen_moth', 84, 26, { range: 6 });
  enemy(r, 'thorn_hopper', 12, 41, { range: 2 });          // QA: beat 10-14: >= 9 tiles from W2, > 13 from the post
  enemy(r, 'thorn_hopper', 82, 32, { range: 3 });          // QA: beat 79-85, >= 8 tiles from the E2 arrival
  enemy(r, 'bloom_spitter', 76, 32, { facing: -1 });
  // set pieces: the glass roof, the flower, its leaves
  r.add({ type: 'event', script: 'mb_glassroof', x: 1, y: 0, z: -5, c0: 0, c1: 95, r0: 0, r1: 3 });
  r.add({ type: 'event', script: 'mb_meltbloom', x: 47, y: 50, z: -20, cx: 47, r0: 15, r1: 50, cw: 18, sw: 10, petal: 10 });
  // QA: the glazed lip-tips drawn as the cup's rolled wax lip (they read as glass blocks otherwise)
  r.add({ type: 'event', script: 'mb_lip', x: 30, y: 15, c0: 30, c1: 31, r0: 15, r1: 18, bowl: 1 });
  r.add({ type: 'event', script: 'mb_lip', x: 64, y: 15, c0: 64, c1: 65, r0: 15, r1: 18, bowl: -1 });
  r.add({ type: 'event', script: 'mb_leaves', x: 47, y: 30, z: -5, leaves: leaves.map(([a, b, y, d]) => [a, b, y, d]) });
  // light: gold shafts through the glass, the sconce, the post, the drop's cold breath
  for (const c of [8, 22, 36, 60, 74, 88]) light(r, c, 5, 6, PALE, 0.3);
  light(r, 58, 47, 7, WARM, 0.55, true); light(r, 24, 47, 4, '#ffcf80', 0.35);
  light(r, 75, 49, 3, MOON, 0.3);
  light(r, 47, 40, 8, GOLD, 0.25); light(r, 47, 28, 8, GOLD, 0.25);
  // dressing
  deco(r, 'fountain', 32, 50, { dim: 0.1 });
  deco(r, 'statue_waxen', 66, 50, { variant: 0, material: 'wax', dim: 0.15, flip: true });
  deco(r, 'statue_waxen', 12, 50, { variant: 1, material: 'wax', dim: 0.3 });
  deco(r, 'flower_giant', 86, 50, { lit: true, h: 220, dim: 0.3, flip: true });
  deco(r, 'flower_giant', 6, 41, { lit: true, h: 150, dim: 0.3 });
  deco(r, 'flower_giant', 90, 32, { lit: true, h: 160, dim: 0.3, flip: true });
  deco(r, 'flower_giant', 12, 14, { lit: true, h: 180, dim: 0.35 });
  deco(r, 'flower_giant', 84, 14, { lit: true, h: 180, dim: 0.35, flip: true });
  for (const [x, y] of [[16, 41], [70, 50], [62, 50], [5, 14], [90, 14], [86, 32]]) deco(r, 'mushroom_glow', x, y);
  for (const [x, y] of [[20, 50], [36, 50], [80, 50], [22, 41], [79, 32], [17, 14], [78, 14]]) deco(r, 'reeds', x, y, { flip: x > 48 });
  for (const [c, y, l] of [[8, 18, 120], [87, 18, 140], [12, 44, 90], [20, 44, 70], [76, 36, 120], [88, 36, 100], [5, 23, 160], [91, 25, 140]]) vines(r, c, y, l);
  grass(r, 50, [5, 9, 15, 28, 35, 45, 52, 61, 67, 72, 81, 86, 91]);
  grass(r, 41, [3, 11, 19, 23]); grass(r, 32, [74, 82, 88, 92]); grass(r, 14, [3, 9, 15, 19, 77, 82, 88, 92]);
  return done(r, { bgSeed: 2, dark: 0.25, theme: { landmark: false, weather: [{ kind: 'pollen', count: 120 }, { kind: 'light', count: 16 }, { kind: 'motes', count: 40 }] } });
}

// =====================================================================================================
const builders = { mb01, mb02, mb03, mb04, mb05, mb06, mb08, mb09, mb10 };
const only = process.argv.slice(2).filter((a) => !a.startsWith('--'));
for (const [name, fn] of Object.entries(builders)) {
  const r = fn();
  if (process.argv.includes('--print') && (!only.length || only.includes(name) || only.includes(r.id))) {
    console.log('\n' + r.id + '\n' + r.ascii().split('\n').map((l, i) => String(i).padStart(2) + ' ' + l).join('\n'));
  }
}
const out = RK.emit('meltbloom', defs, path.join('src', 'data', 'regions', 'meltbloom.js'),
  'Meltbloom Gardens (region builder: region-meltbloom). Arena mb_07 lives in src/data/arenas/sable1.js');
console.log('wrote ' + path.relative(path.resolve(__dirname, '../..'), out) + ' (' + defs.length + ' rooms)');
