#!/usr/bin/env node
// tools/gen/nave.js — generator for THE DROWNED NAVE (region builder: region-nave).
// Builds every NON-arena room of region 'nave' with tools/lib/roomkit.js exactly to design/world_plan.json and
// emits src/data/regions/nave.js. Never hand-edit the emitted file: edit this, then re-run:
//   node tools/gen/nave.js [--print] [dn_02 ...]     (--print dumps the rooms as ASCII with row numbers)
// Coordinates: x = column, y = row (room-local, 0-based). Helpers take INCLUSIVE rectangles.
// The arena dn_07 (The Great Belfry) lives in src/data/arenas/tallowmere.js (boss builder).
// Region set pieces drawn by code (event scripts dn_*) live in src/entities/enemies/nave.js.
'use strict';
const path = require('path');
const RK = require('../lib/roomkit');

// ------------------------------------------------------------------ helpers
const box = (r, x0, y0, x1, y1, ch = '#') => r.fill(x0, y0, x1 - x0 + 1, y1 - y0 + 1, ch);
const air = (r, x0, y0, x1, y1) => box(r, x0, y0, x1, y1, '.');
const plat = (r, x0, x1, y) => r.platform(x0, y, x1 - x0 + 1);
const deco = (r, kind, x, y, o) => r.add(Object.assign({ type: 'decor', kind, x, y }, o || {}));
const light = (r, x, y, rad, color, intensity, flicker, extra) =>
  r.add(Object.assign({ type: 'light', x: Math.floor(x), y: Math.floor(y), r: rad, color, intensity, flicker: !!flicker }, extra || {}));
const enemy = (r, kind, x, y, o) => r.put(x, y, Object.assign({ type: 'enemy', kind }, o || {}));
const event = (r, script, x, y, o) => r.add(Object.assign({ type: 'event', script, x, y }, o || {}));
const respawn = (r, x, y, w, h) => r.add({ type: 'respawn', x, y, w, h });
// Secret pockets behind B walls / D floors are veiled automatically by the engine (G.World.hiddenPockets + art).

// palette (docs/ART_GUIDE.md §2, nave): gold glass light, candle, cold rain teal, ice blue
const GOLD = '#ecc878', GLASS = '#f2d890', CANDLE = '#ffc070', TEAL = '#a8c8d4', SEA = '#4f8fa3', ICE = '#9fd8ff';

const defs = [];
// (QA) Ceiling props hang from the TOP of their anchor tile: if the tile above is air (a vault bay, a throat), the prop
// floats. hangFix() re-anchors every ceiling prop to the underside of the solid (or one-way) tile above it, keeping the
// prop's lower end where it was (chain/lantern/bell/cage lengths grow; banners and drips just move up). Gaps > 3 tiles
// are reported instead (fix those by hand).
const CEILING = new Set(['banner', 'bell_great', 'bell_small', 'cage_hanging', 'chain', 'lantern_hanging', 'drip']);
const STRETCH = new Set(['bell_great', 'bell_small', 'cage_hanging', 'chain', 'lantern_hanging']);
const holds = (ch) => ch === '#' || ch === 'X' || ch === 'B' || ch === 'D' || ch === '=';
function hangFix(r) {
  for (const e of r.entities) {
    if (e.type !== 'decor' || !CEILING.has(e.kind)) continue;
    const cx = Math.floor(e.x + 0.5); let y = Math.round(e.y), gap = 0;
    while (y - gap - 1 >= 0 && !holds(r.get(cx, y - gap - 1))) gap++;
    if (gap === 0) continue;
    if (gap > 3 || y - gap - 1 < 0) { console.warn(`hangFix ${r.id}: ${e.kind}@${e.x},${e.y} has no ceiling within 3 tiles`); continue; }
    e.y = y - gap;
    if (STRETCH.has(e.kind)) e.len = (e.len != null ? e.len : (e.kind === 'bell_small' ? 16 : e.kind === 'cage_hanging' ? 30 : e.kind === 'bell_great' ? 0 : e.kind === 'chain' ? 120 : 40)) + gap * 40;
  }
}
const done = (r, extra) => { hangFix(r); defs.push(r.toDef(extra)); return r; };

// =====================================================================================================
// dn_01 — THE LONG DESCENT (32x36, shaft). The player drops in through N1 (cols 12-15) from the Descent Lip.
// The shaft's WEST FACE (col 11) runs sheer and unbroken from the floor corridor to the throat: the only way back up
// is Wax Grip (wall-jump the face, rise out through N1 into gw_10's pit). The east side steps out into a tall
// rain-washed bay above the floor (no ledges: every step is an overhang seen from below). W1 / E1 at the floor.
// =====================================================================================================
function dn01() {
  const r = RK.room('dn_01');
  air(r, 12, 0, 15, 6);                        // the throat under gw_10's pit
  air(r, 12, 7, 17, 10);                       // funnel (east side only: the west face stays flush)
  air(r, 12, 11, 22, 21);                      // the shaft
  air(r, 12, 22, 30, 32);                      // the bay at the bottom (rain sheets down its walls)
  air(r, 1, 30, 11, 32);                       // W1 passage under the west face (lore niche)
  r.openExits();
  // ---- contents
  r.put(7, 32, { type: 'lore', id: 'lore_dn_1' });
  // (QA) both jellies sit in the east half of the bay, out of sight (8.5 tiles) of the N1 landing (col 13.5) and of a
  // player stepping in at E1; with leash 3 neither drifts into the west-face climbing lane (col 12); 7 tiles apart.
  enemy(r, 'rain_jelly', 21, 27, { leash: 3 });
  enemy(r, 'rain_jelly', 27, 23, { leash: 3 });
  // ---- the landmark: water sheeting down the walls, a cold light from above, a far bell below
  event(r, 'dn_sheet', 11, 1, { c: 11, side: 'E', r0: 1, r1: 29, seed: 1 });          // down the west face
  event(r, 'dn_sheet', 22, 11, { c: 22, side: 'W', r0: 11, r1: 21, seed: 2 });        // down the shaft's east wall
  event(r, 'dn_sheet', 30, 22, { c: 30, side: 'W', r0: 22, r1: 29, seed: 3, a: 0.8 }); // the bay's east wall
  event(r, 'dn_bellfar', 16, 33, { every: 9 });
  light(r, 14, 3, 6, TEAL, 0.28);
  light(r, 17, 16, 7, SEA, 0.2);
  light(r, 21, 28, 8, TEAL, 0.18);
  deco(r, 'drip', 16, 7, { fall: 1000, color: TEAL });
  deco(r, 'drip', 21, 11, { fall: 820 });
  deco(r, 'drip', 26, 22, { fall: 400 });
  deco(r, 'chain', 20, 11, { len: 260, hook: true, layer: 'back' });
  deco(r, 'sconce_dead', 4, 32); deco(r, 'candle_cluster', 9, 32, { lit: true });
  light(r, 9, 32, 3, CANDLE, 0.45, true);
  deco(r, 'rubble', 18, 32); deco(r, 'column_broken', 25, 32, { h: 70, dim: 0.4, layer: 'back' });
  deco(r, 'statue_waxen', 28, 32, { variant: 1, dim: 0.35, layer: 'back', material: 'stone' });
  return done(r, { theme: { bg: 'shaft' }, bgSeed: 11, dark: 0.62 });
}

// =====================================================================================================
// dn_02 — THE FLOODED AISLE (128x18, corridor). The cathedral's long side aisle under broken clerestory windows;
// rain falls through them in silver curtains. Floor top row 15 everywhere (puddles are decor). S1 (cols 40-43): the
// broken floor down into the great nave, rimmed by dips (top row 16, cols 37-39 / 44-46) that catch climbers.
// Wren shelters under a dry arch at col 84; the lore column at col 60; dn_geo1 in a pew alcove up on a rubble heap
// at col 104. A broken gallery (triforium) runs above the west half for a second line.
// =====================================================================================================
function dn02() {
  const r = RK.room('dn_02');
  air(r, 1, 4, 126, 14);                       // the aisle
  // vault bays: pointed recesses into the ceiling between the ribs (every 16 cols), clerestory gaps
  for (let c = 4; c <= 112; c += 16) {
    air(r, c + 2, 3, c + 11, 3);
    air(r, c + 4, 2, c + 9, 2);
    air(r, c + 6, 1, c + 7, 1);
  }
  // S1: the broken floor and its dips
  air(r, 37, 15, 46, 15);
  air(r, 40, 16, 43, 17);
  // fallen masonry on the floor (hops), the rubble heap with the pew alcove
  box(r, 16, 14, 19, 14);                      // a fallen capital (1 up)
  box(r, 27, 13, 30, 14);                      // a toppled pier (2 up)
  box(r, 98, 13, 110, 14);                     // the collapsed pews: a heap 2 up ...
  box(r, 101, 11, 107, 12);                    // ... with the alcove shelf on top (4 up from the floor)
  air(r, 102, 8, 106, 10);                     // the alcove itself
  // Wren's dry arch: a deep canopy out of the vault (low ceiling row 9 over cols 80-88)
  box(r, 79, 4, 89, 8);
  event(r, 'dn_masonry', 79, 4, { c0: 79, c1: 89, r0: 4, r1: 8, seed: 7, arches: 3.6 });   // (QA) built stone, not a black slab
  // the gallery (one-way) above the west half, broken in places
  plat(r, 50, 56, 11); plat(r, 61, 69, 8);
  event(r, 'dn_posts', 55, 11, { posts: [[50.5, 11, 15], [56.5, 11, 15], [61.5, 8, 15], [69.5, 8, 15]] });
  r.openExits();
  // ---- contents
  r.put(84, 14, { type: 'npc', npc: 'wren', stage: 2, requires: '!flag:wren_met_3' });   // (QA) she moves on once met in the Mothwood (text.md)
  r.put(60, 14, { type: 'lore', id: 'lore_dn_2' });
  r.put(104, 10, { type: 'geode', id: 'dn_geo1', amount: 70 });
  enemy(r, 'drowned_acolyte', 22, 14, { range: 4 });
  enemy(r, 'drowned_acolyte', 70, 14, { range: 3 });
  enemy(r, 'drowned_acolyte', 115, 14, { range: 3, facing: 'left' });
  enemy(r, 'rain_jelly', 28, 9, { leash: 4 });   // (QA) was 33 (leash 5): it hovered over the S1 landing dip (cols 37-39)
  enemy(r, 'rain_jelly', 94, 8, { leash: 5 });
  // ---- atmosphere: rain curtains through the clerestory gaps, stained light, the aisle furniture
  for (const [c, s] of [[10, 1], [26, 2], [58, 3], [74, 4], [106, 5]]) event(r, 'dn_curtain', c, 1, { c0: c - 1, c1: c + 2, r0: 1, r1: c === 106 ? 10 : 14, seed: s });   // (QA) 106 splashes on the rubble heap; no curtain under solid vault
  for (const c of [12, 44, 76, 108]) deco(r, 'stained_window', c - 1, 9, { scale: 1.3, dim: 0.35, layer: 'back' });
  for (const c of [12, 44, 76, 108]) light(r, c, 6, 6, GLASS, 0.22);
  for (const c of [4, 36, 52, 68, 92, 124]) deco(r, 'column_broken', c, 14, { h: 120, dim: 0.5, layer: 'back' });
  deco(r, 'pew', 6, 14, { dim: 0.3, layer: 'back' }); deco(r, 'pew', 48, 14, { dim: 0.3, layer: 'back', flip: true });
  deco(r, 'pew', 64, 14, { dim: 0.3, layer: 'back' }); deco(r, 'pew', 118, 14, { dim: 0.3, layer: 'back' });
  deco(r, 'pew', 102, 10, { dim: 0.2, layer: 'back', flip: true });
  deco(r, 'arch', 83, 14, { scale: 1.3, layer: 'back', dim: 0.25 });
  deco(r, 'candle_cluster', 86, 14, { lit: true }); light(r, 84, 12, 5, CANDLE, 0.55, true);
  deco(r, 'rubble', 18, 13); deco(r, 'rubble', 30, 12); deco(r, 'rubble', 47, 14); deco(r, 'rubble', 96, 14);
  deco(r, 'banner', 34, 4, { len: 110, torn: true }); deco(r, 'banner', 96, 4, { len: 90, torn: true });
  deco(r, 'lantern_hanging', 104, 2, { len: 230, lit: true });  // (QA) was floating at row 8 light(r, 104, 9, 3.5, CANDLE, 0.5, true);
  deco(r, 'drip', 41, 4, { fall: 420 }); deco(r, 'drip', 88, 9, { fall: 200 }); deco(r, 'drip', 115, 4, { fall: 400 });
  return done(r, { theme: { bg: 'interior' }, bgSeed: 22, dark: 0.55 });
}

// =====================================================================================================
// dn_03 — THE DROWNED NAVE (96x36, hub, landmark). The vast cathedral hall: main floor top row 33 with drowned
// pews; the rose window over dn_sconce_a (col 28); the Lanternway post at col 52 and the lectern (lore_dn_3, col 46)
// beside the one-way platform column that climbs to N1 (tops 29/25/21/17/13/9/5). S1 (cols 60-63): the broken
// floor down to the Sunken Crypt (dips to row 34 around it). East: the choir step (top row 24) by 3-tile steps,
// with E1 to the Choir Loft. Rain pours through the shattered vault. Hostiles stay >= 12 tiles from the post:
// the knight + an acolyte on the west floor, the bell sentry + an acolyte on the choir step.
// =====================================================================================================
function dn03() {
  const r = RK.room('dn_03');
  air(r, 1, 4, 94, 32);                        // the hall
  air(r, 40, 0, 43, 3);                        // N1 throat (the broken aisle floor above)
  air(r, 37, 3, 46, 3); air(r, 39, 2, 44, 2);  // ... flaring into a bay: head room to walk off the top platform (row 5)
  // the shattered vault: pointed bays between the ribs + broken gaps where the rain pours in
  for (const c of [3, 19, 51, 67, 83]) { air(r, c + 1, 3, c + 9, 3); air(r, c + 3, 2, c + 7, 2); air(r, c + 4, 1, c + 6, 1); }
  air(r, 28, 3, 36, 3); air(r, 30, 2, 34, 2);  // the bay over the rose window (shallow)
  // S1 and its dips
  air(r, 57, 33, 66, 33);
  air(r, 60, 34, 63, 35);
  // the choir step: 3-tile steps up from the floor
  box(r, 67, 30, 69, 32);
  box(r, 70, 27, 72, 32);
  box(r, 73, 24, 94, 32);
  // the platform column under N1 (stone corbels on a slender pier behind them)
  for (const [y, x0] of [[29, 38], [25, 42], [21, 38], [17, 42], [13, 38], [9, 42], [5, 40]]) plat(r, x0, x0 + 3, y);
  event(r, 'dn_posts', 42, 5, { posts: [[42, 5, 33, 0.9]] });
  r.openExits();
  // ---- contents
  r.put(28, 32, { type: 'sconce', id: 'dn_sconce_a' });
  r.put(52, 32, { type: 'lanternway', id: 'nave' });
  r.put(47, 32, { type: 'lore', id: 'lore_dn_3' });
  // (QA) the acolyte's beat ends >= 10 tiles from dn_sconce_a (col 28): at col 19 it lobbed flames at a resting player
  // (fling reach 9 tiles). The knight keeps its beat west of it.
  enemy(r, 'drowned_knight', 10, 32, { range: 3, facing: 'left' });
  enemy(r, 'drowned_acolyte', 17, 32, { range: 1, facing: 'left' });
  enemy(r, 'bell_sentry', 77, 23, { facing: 'left' });
  enemy(r, 'drowned_acolyte', 85, 23, { range: 2, facing: 'left' });   // beat 83-87: >= 8 tiles from E1
  // ---- THE ROSE WINDOW and its god-rays; rain through the broken vault
  event(r, 'dn_rose', 28, 13, { cx: 28.5, cy: 13, rad: 5.2, rays: [[22, 33, 3.2], [31, 33, 2.6], [40, 33, 2.2]] });
  light(r, 28, 13, 10, GLASS, 0.5);
  light(r, 28, 30, 7, GOLD, 0.3);
  for (const [c, s] of [[8, 1], [24, 2], [56, 3], [72, 4], [88, 5]]) event(r, 'dn_curtain', c, 1, { c0: c - 1, c1: c + 2, r0: 1, r1: c >= 72 ? (c >= 73 ? 23 : 26) : 32, seed: s });
  // tall lancets down the nave walls (back), the arcade piers
  for (const c of [8, 48, 64, 88]) { deco(r, 'stained_window', c, 17, { scale: 2.2, dim: 0.35, layer: 'back' }); light(r, c + 1, 12, 5, GLASS, 0.18); }
  for (const c of [3, 16, 36, 55, 80, 93]) deco(r, 'column_broken', c, c > 72 ? 23 : 32, { h: 260, dim: 0.55, layer: 'back' });
  // drowned pews (rows of them, west and centre)
  for (const c of [5, 9, 13, 21, 33]) deco(r, 'pew', c, 32, { dim: 0.25, layer: 'back', seed: c });
  deco(r, 'pew', 25, 32, { layer: 'back', flip: true, dim: 0.15 });
  // the sconce under the window, the lectern, the post
  deco(r, 'candelabra', 25, 32, { lit: true }); light(r, 25, 30, 4, CANDLE, 0.5, true);
  deco(r, 'candelabra', 31, 32, { lit: true, flip: true }); light(r, 31, 30, 4, CANDLE, 0.5, true);
  deco(r, 'candle_cluster', 49, 32, { lit: true }); light(r, 49, 32, 3, CANDLE, 0.45, true);
  deco(r, 'banner', 36, 4, { len: 200, torn: true }); deco(r, 'banner', 48, 4, { len: 160 });
  // the choir step: altar, candelabras, a small bell
  deco(r, 'altar', 91, 23, { lit: true }); light(r, 91, 22, 4, CANDLE, 0.5, true);
  deco(r, 'candelabra', 74, 23, { lit: true }); light(r, 74, 21, 3.5, CANDLE, 0.45, true);
  deco(r, 'bell_small', 82, 4, { len: 300, layer: 'back' });
  deco(r, 'statue_waxen', 71, 26, { variant: 1, dim: 0.3, layer: 'back' });   // (QA) on the 2nd step, not over the 1st
  // hanging chains + lanterns from the vault, debris and puddles of the flood on the floor
  deco(r, 'lantern_hanging', 14, 4, { len: 260, lit: true }); light(r, 14, 11, 3.5, CANDLE, 0.45, true);
  deco(r, 'lantern_hanging', 66, 4, { len: 300, lit: true }); light(r, 66, 12, 3.5, CANDLE, 0.45, true);
  deco(r, 'chain', 46, 4, { len: 420, hook: true, layer: 'back' }); deco(r, 'chain', 60, 4, { len: 520, layer: 'back' });
  deco(r, 'rubble', 2, 32); deco(r, 'rubble', 37, 32); deco(r, 'rubble', 56, 32); deco(r, 'bones', 66, 33);
  deco(r, 'drip', 30, 4, { fall: 1100 }); deco(r, 'drip', 44, 4, { fall: 1100 }); deco(r, 'drip', 78, 4, { fall: 760 });
  return done(r, { theme: { bg: 'interior' }, bgSeed: 33, dark: 0.5 });
}

// =====================================================================================================
// dn_04 — THE BELL TOWER (32x54, shaft, landmark). WALL-CLIMBING CHALLENGE to the Oilcloak. E1 enters onto the
// base floor (top row 33); the base floor's hole (cols 14-17) drops down the lower shaft (one-way rungs tops 50/46/
// 42/38, dips to row 34 beside the hole) to S1 / the Flooded Tunnel. THE CLIMB (grip only): an 18-tile, 6-wide
// throat (cols 13-18) between the west landing's mass (face col 12) and the east ledge's mass (face col 19): pure
// wall-jumping with glazed (X) stretches and short spike strips that force switches; no footholds anywhere. The
// throat opens into the hollow belfry (rows 3-14): the west landing (top row 15, W1 to the shrine) with a bell
// sentry, the east ledge where the empty bell frame hangs; behind it a cracked B wall (cols 24-25) hides dn_geo3.
// The great bell itself lies broken on the base floor.
// =====================================================================================================
function dn04() {
  const r = RK.room('dn_04');
  air(r, 1, 3, 23, 14);                        // the belfry (above the landings)
  air(r, 3, 2, 21, 2); air(r, 7, 1, 17, 1);    // its broken spire roof
  air(r, 26, 12, 30, 14);                      // the niche (dn_geo3) ...
  box(r, 24, 12, 25, 14, 'B');                 // ... behind the cracked wall
  air(r, 13, 15, 18, 32);                      // THE CLIMB: the throat
  air(r, 19, 30, 30, 32);                      // E1 passage onto the base
  // the climb faces: west face col 12 (rows 15-32), east face col 19 (rows 15-29). Route: west face up to ~row 25
  // (glazed above) -> east face rows 22-25 (spikes above) -> west face rows 15-20 -> over the lip onto the landing.
  box(r, 12, 21, 12, 24, 'X');                 // west: glazed stretch (switch east)
  box(r, 19, 26, 19, 29, 'X');                 // east: glazed foot (start on the west face)
  box(r, 19, 19, 19, 21, '^');                 // east: a spike strip (switch back west)
  // the base floor (rows 33-35), the hole and its dips
  air(r, 13, 33, 13, 33); air(r, 18, 33, 20, 33);
  air(r, 14, 33, 17, 35);
  // the lower shaft (cols 11-20) down to S1
  air(r, 11, 36, 20, 52);
  for (const [y, x0, x1] of [[50, 13, 18], [46, 11, 15], [42, 16, 20], [38, 13, 18]]) plat(r, x0, x1, y);  // (QA) top rung to col 18 so its east chain hangs from the base, not the hole
  event(r, 'dn_posts', 16, 50, { posts: [[13.5, 50, 53, 0.35], [18.5, 50, 53, 0.35]] });   // the lowest rung on stubby posts
  for (const c of [13, 18]) deco(r, 'chain', c, 36, { len: 80, layer: 'back' });          // the top rung hangs from the base
  r.openExits();
  // ---- contents
  r.put(28, 14, { type: 'geode', id: 'dn_geo3', amount: 90 });
  // (QA) the sentry at col 9 (range 6) tolled as soon as a climber reached the lip (col 12) and its wave knocked them
  // back down the 18-tile throat. Now it only tolls for a player within 3 tiles of it (cols 4.5-10.5): the lip is calm,
  // W1's exit zone (cols 0-4.5) is never threatened, and the jelly hovers over the sentry (it cannot
  // see a player at either end of the landing, only one in its middle).
  enemy(r, 'bell_sentry', 7, 14, { facing: 'right', range: 3 });
  enemy(r, 'rain_jelly', 7, 6, { leash: 3 });
  enemy(r, 'rain_jelly', 16, 45, { leash: 3 });
  respawn(r, 25, 32, 8, 3);                    // the base floor (spikes on the climb send you here)
  respawn(r, 4, 14, 6, 3);                     // the west landing
  // ---- atmosphere: rain down the throat, the empty bell frame, the fallen bell
  event(r, 'dn_curtain', 13, 1, { c0: 11, c1: 19, r0: 1, r1: 32, seed: 4, a: 0.8 });
  event(r, 'dn_sheet', 12, 15, { c: 12, side: 'E', r0: 15, r1: 32, seed: 5, a: 0.6 });
  event(r, 'dn_sheet', 19, 15, { c: 19, side: 'W', r0: 15, r1: 29, seed: 6, a: 0.6 });
  deco(r, 'chain', 20, 3, { len: 300, hook: true }); deco(r, 'chain', 23, 3, { len: 300, hook: true });
  deco(r, 'bell_small', 4, 3, { len: 120, layer: 'back' });
  deco(r, 'bell_great', 23, 30, { scale: 1.3, dim: 0.15, layer: 'back' });    // the great bell, fallen on the base
  deco(r, 'rubble', 21, 32); deco(r, 'rubble', 29, 32);
  deco(r, 'lantern_hanging', 27, 30, { len: 8, lit: true }); light(r, 27, 31, 3.5, CANDLE, 0.5, true);
  deco(r, 'candle_cluster', 2, 14, { lit: true }); light(r, 2, 13, 3, CANDLE, 0.45, true);
  deco(r, 'stained_window', 15, 8, { scale: 1.6, dim: 0.35, layer: 'back' }); light(r, 16, 5, 6, GLASS, 0.25);
  deco(r, 'cage_hanging', 21, 3, { len: 140, ember: true });
  light(r, 15, 24, 5, TEAL, 0.18); light(r, 16, 44, 6, SEA, 0.2);
  deco(r, 'drip', 12, 36, { fall: 600 }); deco(r, 'drip', 19, 36, { fall: 600 });
  return done(r, { theme: { bg: 'shaft' }, bgSeed: 44, dark: 0.58 });
}

// =====================================================================================================
// dn_05 — SHRINE OF THE OILCLOAK (32x18, shrine). A tiny vaulted chapel at the top of the tower, off the belfry's
// west landing. Floor top row 15; the Oilcloak pedestal at col 18; WEST of it a small practice basin of meltwater
// (cols 3-9, rows 15-16; a hazard until the cloak is taken) reflecting the floating blue ember; lore_dn_4 at col 26.
// =====================================================================================================
function dn05() {
  const r = RK.room('dn_05');
  air(r, 1, 5, 30, 14);
  air(r, 4, 4, 27, 4); air(r, 7, 3, 24, 3); air(r, 11, 2, 20, 2);   // the pointed vault
  box(r, 3, 15, 9, 16, '~');                   // the practice basin
  r.openExits();
  r.put(18, 14, { type: 'shrine', ability: 'oilcloak' });
  r.put(26, 14, { type: 'lore', id: 'lore_dn_4' });
  respawn(r, 13, 14, 5, 3);
  deco(r, 'stained_window', 17, 10, { scale: 1.5, dim: 0.2, layer: 'back', color: '#8ad0e0' }); light(r, 18, 7, 6, TEAL, 0.35);
  deco(r, 'stained_window', 5, 12, { scale: 1.1, dim: 0.35, layer: 'back' }); deco(r, 'stained_window', 27, 12, { scale: 1.1, dim: 0.35, layer: 'back' });
  deco(r, 'candelabra', 14, 14, { lit: true, flame: 'blue' }); deco(r, 'candelabra', 22, 14, { lit: true, flame: 'blue', flip: true });
  light(r, 14, 12, 3.5, ICE, 0.45, true); light(r, 22, 12, 3.5, ICE, 0.45, true);
  deco(r, 'fountain', 6, 14, { dim: 0.45, layer: 'back' });
  light(r, 6, 15, 4, SEA, 0.35);
  deco(r, 'bell_small', 18, 2, { len: 40 });
  deco(r, 'candle_cluster', 29, 14, { lit: true }); deco(r, 'banner', 10, 5, { len: 90 }); deco(r, 'banner', 25, 5, { len: 90 });
  return done(r, { theme: { bg: 'interior', weather: 'none' }, bgSeed: 55, dark: 0.45 });
}

// =====================================================================================================
// dn_06 — THE CHOIR LOFT (64x27). Floor top row 24 (W1 / E1 rows 21-23). S1 (cols 20-23) is the hole down to the
// Baptistery (dips to row 25). The raised choir stall (dais, top row 22, cols 27-35) spans the floor, guarded by a bell
// sentry (its waves die at the dais lips); from the dais a stall tier (row 18) climbs to the organ gallery (row 15,
// cols 23-34) under the silent pipes, where the hymn sheet lore_dn_5 lies on the console. dn_sconce_b at col 42
// beside the great bronze belfry door (E1 -> Tallowmere).
// =====================================================================================================
function dn06() {
  const r = RK.room('dn_06');
  air(r, 1, 5, 62, 23);
  for (const c of [2, 42]) { air(r, c + 1, 4, c + 15, 4); air(r, c + 4, 3, c + 12, 3); }
  air(r, 48, 2, 51, 2); air(r, 49, 1, 50, 1);   // (QA) the broken vault gap the rain curtain falls through
  // S1 and its dips
  air(r, 17, 24, 26, 24);
  air(r, 20, 25, 23, 26);
  // the dais, the stall tier, the organ gallery
  box(r, 27, 22, 35, 23);
  plat(r, 36, 40, 19);
  plat(r, 23, 34, 15);
  r.openExits();
  // ---- contents
  r.put(42, 23, { type: 'sconce', id: 'dn_sconce_b' });
  r.put(30, 14, { type: 'lore', id: 'lore_dn_5' });
  enemy(r, 'bell_sentry', 29, 21, { facing: 'right', range: 6 });
  enemy(r, 'drowned_acolyte', 11, 23, { range: 3 });
  enemy(r, 'drowned_acolyte', 26, 14, { range: 2, facing: 'right' });
  // ---- the organ, the stalls, the belfry door
  event(r, 'dn_organ', 22, 3, { c0: 22, c1: 35, top: 4, base: 15 });
  for (const c of [5, 10, 14, 45, 50]) deco(r, 'pew', c, 23, { dim: 0.3, layer: 'back', seed: c });
  deco(r, 'pew', 31, 21, { dim: 0.2, layer: 'back' });
  deco(r, 'candelabra', 28, 14, { lit: true }); light(r, 28, 12, 3.5, CANDLE, 0.45, true);
  deco(r, 'candelabra', 33, 21, { lit: true, flip: true }); light(r, 33, 19, 3.5, CANDLE, 0.45, true);
  deco(r, 'arch', 59, 23, { scale: 1.4, layer: 'back', dim: 0.1 });
  deco(r, 'bell_small', 60, 5, { len: 150 });
  deco(r, 'brazier', 46, 23); light(r, 46, 22, 5, CANDLE, 0.55, true);
  light(r, 60, 21, 5, GOLD, 0.35, true);
  event(r, 'dn_bellfar', 58, 23, { every: 6, vol: 0.16 });
  for (const c of [8, 52]) { deco(r, 'stained_window', c, 16, { scale: 1.8, dim: 0.35, layer: 'back' }); light(r, c + 1, 11, 5, GLASS, 0.2); }
  deco(r, 'banner', 38, 5, { len: 160, torn: true }); deco(r, 'banner', 18, 5, { len: 140 });
  event(r, 'dn_posts', 30, 16, { posts: [[23.5, 15, 24], [33.5, 15, 22], [36.4, 19, 22], [40.5, 19, 24]] });   // the tier's hangers
  event(r, 'dn_curtain', 49, 1, { c0: 48, c1: 51, r0: 1, r1: 23, seed: 7, a: 0.7 });
  deco(r, 'rubble', 3, 23); deco(r, 'drip', 12, 5, { fall: 700 });
  return done(r, { theme: { bg: 'interior' }, bgSeed: 66, dark: 0.5 });
}

// =====================================================================================================
// dn_08 — THE SUNKEN CRYPT (96x18). Floor top row 15 under a low ribbed vault. N1 (cols 60-63): one-way rungs (tops 12,
// 8, 4) climb back into the nave. E1 (rows 3-5): a high doorway on a ledge (top row 6, cols 84-94) reached by 3-tile
// steps (tops 12, 9). PLUNGE GATE: the frosted cracked floor (D, cols 10-17, rows 15-16) over S1 (cols 12-15): a
// Molten Plunge breaks through into the Rime (one-way). SECRET: a cracked B wall (cols 6-7, rows 12-14) at the west
// end hides a burial niche (cols 1-5) with the White-hot Core sigil.
// =====================================================================================================
function dn08() {
  const r = RK.room('dn_08');
  air(r, 8, 3, 94, 14);
  air(r, 60, 0, 63, 2);                        // N1 throat (the nave's broken floor)
  air(r, 58, 2, 65, 2);                        // ... flared: head room to walk off the top rung (row 4)
  for (const c of [12, 28, 44, 68]) { air(r, c, 2, c + 9, 2); air(r, c + 2, 1, c + 7, 1); }   // vault bays
  box(r, 6, 12, 7, 14, 'B'); air(r, 1, 12, 5, 14);   // the burial niche behind the cracked wall
  box(r, 10, 15, 17, 16, 'D');                 // the frosted cracked floor ...
  air(r, 12, 17, 15, 17);                      // ... over S1
  box(r, 78, 12, 94, 14); box(r, 81, 9, 94, 11); box(r, 84, 6, 94, 8);   // steps up to the E1 ledge
  for (const y of [12, 8, 4]) plat(r, 59, 64, y);
  event(r, 'dn_posts', 62, 4, { posts: [[62, 4, 15, 0.7]] });   // the rungs are corbels on a slender pier
  r.openExits();
  // ---- contents
  r.put(3, 14, { type: 'pickup', item: 'sigil', sigil: 'bright_bolt', id: 'dn_sig_bright_bolt' });
  enemy(r, 'drowned_knight', 40, 14, { range: 4 });
  enemy(r, 'drowned_acolyte', 25, 14, { range: 3 });
  enemy(r, 'drowned_acolyte', 72, 14, { range: 3, facing: 'left' });
  // ---- frost through the cracks, burial niches, candles of the dead
  event(r, 'dn_frost', 10, 15, { c0: 9, c1: 18, row: 15, seed: 2 });
  light(r, 13, 15, 5, ICE, 0.45, true);
  deco(r, 'rubble', 8, 14); deco(r, 'bones', 4, 14); deco(r, 'candle_cluster', 2, 14);   // unlit: lights in a veiled pocket shine through the rock
  for (const c of [22, 34, 50, 58, 76]) deco(r, 'arch', c, 14, { scale: 1.2, dim: 0.45, layer: 'back' });
  deco(r, 'wick_grave', 20, 14); deco(r, 'wick_grave', 31, 14, { variant: 1 }); deco(r, 'wick_grave', 47, 14); deco(r, 'wick_grave', 55, 14, { variant: 1 });
  deco(r, 'statue_waxen', 66, 14, { variant: 2, dim: 0.3, layer: 'back' });
  deco(r, 'altar', 88, 5, { lit: true }); light(r, 88, 4, 4, CANDLE, 0.5, true);
  deco(r, 'candle_cluster', 36, 14, { lit: true }); light(r, 36, 13, 3, CANDLE, 0.4, true);
  deco(r, 'candle_cluster', 52, 14, { lit: true }); light(r, 52, 13, 3, CANDLE, 0.4, true);
  deco(r, 'lantern_hanging', 30, 3, { len: 40, lit: true }); light(r, 30, 5, 3.5, CANDLE, 0.4, true);
  deco(r, 'lantern_hanging', 80, 3, { len: 60, lit: true }); light(r, 80, 5, 3.5, CANDLE, 0.4, true);
  light(r, 61, 3, 5, TEAL, 0.3);
  deco(r, 'drip', 57, 3, { fall: 420 }); deco(r, 'drip', 24, 3, { fall: 420 });   // (QA) was in the open N1 throat
  return done(r, { theme: { bg: 'interior', weather: 'none' }, bgSeed: 88, dark: 0.62 });
}

// =====================================================================================================
// dn_09 — GALLERY OF SAINTS (96x18, gate). W1 from the Long Descent; the west floor (top row 15, cols 1-57) under the
// colossal saints. GRIP: the sheer pillar (cols 41-48) rises 8 tiles to the near ledge (top row 7). DASH: the 9-tile
// gap (cols 49-57, equal height) to the far ledge (top row 7, cols 58-70) on a solid mass whose west face is GLAZED, so
// a faller lands on the west floor and cannot climb out east. East the path steps down (tops 10, 13, 15) to E1 toward
// the forge-glow of the Chandlery. WINGS: the tallest saint (cols 18-23, glazed, flat head at row 8) holds dn_hw1.
// =====================================================================================================
function dn09() {
  const r = RK.room('dn_09');
  air(r, 1, 1, 94, 14);
  box(r, 41, 7, 48, 11);                       // the grip pier (sheer, grippable) over a gateway arch (rows 12-14):
                                               // the free way back west from the gap (the gap floor is a dead end)
  box(r, 58, 7, 70, 14); box(r, 58, 7, 58, 14, 'X');    // the far mass, glazed west face
  box(r, 71, 10, 76, 14); box(r, 77, 13, 82, 14);       // steps down east
  box(r, 18, 8, 23, 11, 'X');                  // the tallest saint (glazed; the walkway passes between its feet)
  r.openExits();
  // ---- contents
  r.put(20, 7, { type: 'pickup', item: 'heartwax', id: 'dn_hw1' });
  enemy(r, 'drowned_knight', 30, 14, { range: 4, facing: 'left' });
  enemy(r, 'rain_jelly', 76, 5, { leash: 3 });
  enemy(r, 'rain_jelly', 84, 6, { leash: 3 });    // leash keeps it >= 8 tiles from E1
  // ---- the saints, the forge-glow at the end
  event(r, 'dn_pier', 41, 12, { c0: 41, c1: 48, r: 12, base: 15 });
  event(r, 'dn_masonry', 41, 7, { c0: 41, c1: 48, r0: 7, r1: 11, seed: 3, cornice: true });
  event(r, 'dn_masonry', 59, 8, { c0: 59, c1: 70, r0: 8, r1: 14, seed: 4, arches: 4 });
  event(r, 'dn_saint', 18, 8, { c0: 18, c1: 23, top: 8, body: 12, base: 15 });
  for (const [c, v] of [[8, 1], [33, 0], [52, 1], [64, 0], [86, 1]]) deco(r, 'statue_waxen', c, c > 57 && c < 71 ? 6 : c > 70 && c < 83 ? 9 : 14, { variant: v, scale: c === 64 ? 1.3 : 2.2, dim: 0.5, layer: 'back', material: 'stone' });   // (QA) 64 stands on the far mass: kept under the vault
  light(r, 20, 6, 5, GOLD, 0.35);
  light(r, 93, 12, 7, '#ff7a40', 0.45, true); light(r, 90, 9, 9, '#ff9a50', 0.18, true);
  deco(r, 'candle_cluster', 13, 14, { lit: true }); light(r, 13, 13, 3, CANDLE, 0.4, true);
  deco(r, 'candle_cluster', 37, 14, { lit: true }); light(r, 37, 13, 3, CANDLE, 0.4, true);
  deco(r, 'candle_cluster', 67, 6, { lit: true }); light(r, 67, 5, 3, CANDLE, 0.4, true);
  for (const c of [10, 44, 74]) { deco(r, 'stained_window', c, 9, { scale: 1.4, dim: 0.35, layer: 'back' }); light(r, c + 1, 5, 5, GLASS, 0.2); }
  deco(r, 'rubble', 53, 14); deco(r, 'rubble', 2, 14); deco(r, 'bones', 55, 14);
  deco(r, 'banner', 26, 1, { len: 120, torn: true }); deco(r, 'banner', 36, 1, { len: 150 });
  for (const [c, sd] of [[34, 1], [80, 2]]) event(r, 'dn_curtain', c, 1, { c0: c - 1, c1: c + 2, r0: 1, r1: c > 70 ? 12 : 14, seed: sd, a: 0.7 });
  return done(r, { theme: { bg: 'interior' }, bgSeed: 99, dark: 0.55 });
}

// =====================================================================================================
// dn_10 — THE FLOODED TUNNEL (96x18, gate). The drain of the Nave. East (cols 60-94) dry, floor top row 15, E1 from the
// great nave; N1 (cols 78-81) is the foot of the Bell Tower shaft (rungs tops 12/8/4). dn_geo2 at col 66. OILCLOAK:
// from col 59 west the tunnel floods - meltwater cols 8-58 (51 wide, rows 15-16) under a low vault (solid to row 11:
// 3 tiles of air) all the way to the west bank (cols 1-7) and W1 to the Mothwood.
// =====================================================================================================
function dn10() {
  const r = RK.room('dn_10');
  air(r, 1, 12, 94, 14);
  air(r, 61, 3, 94, 11);                       // the dry east hall (taller; the low vault runs to col 60)
  air(r, 78, 0, 81, 2);                        // N1: the Bell Tower's foot
  air(r, 76, 2, 83, 2);                        // ... flared: head room to walk off the top rung (row 4)
  air(r, 66, 2, 74, 2); air(r, 86, 2, 92, 2);  // vault bays
  box(r, 8, 15, 58, 16, '~');                  // the flood
  for (const y of [12, 8, 4]) plat(r, 77, 82, y);
  event(r, 'dn_posts', 80, 4, { posts: [[80, 4, 15, 0.7]] });   // the rungs are corbels on a slender pier
  r.openExits();
  // ---- contents
  r.put(66, 14, { type: 'geode', id: 'dn_geo2', amount: 80 });
  enemy(r, 'rain_jelly', 70, 9, { leash: 4 });
  enemy(r, 'rain_jelly', 86, 9, { leash: 3 });    // east of the rungs, >= 6 tiles from E1
  respawn(r, 63, 14, 6, 3);                    // east bank (box ends at the water's lip, col 60)
  respawn(r, 3, 14, 5, 3);                     // west bank
  // ---- the drain: water running west into the dark, a grate at the far end
  event(r, 'dn_flow', 8, 15, { c0: 8, c1: 58, row: 15 });
  for (const c of [14, 26, 38, 50]) { deco(r, 'drip', c, 12, { fall: 100 }); }
  deco(r, 'arch', 61, 14, { scale: 1.2, dim: 0.3, layer: 'back' });
  deco(r, 'lamp_post', 63, 14, { lit: true }); light(r, 63, 11, 4, CANDLE, 0.5, true);
  deco(r, 'sconce_dead', 3, 14); light(r, 2, 13, 3, TEAL, 0.3);
  deco(r, 'rubble', 72, 14); deco(r, 'rubble', 92, 14); deco(r, 'bones', 85, 14);
  deco(r, 'chain', 84, 3, { len: 200, hook: true, layer: 'back' });
  light(r, 80, 3, 6, TEAL, 0.3); light(r, 33, 13, 8, SEA, 0.22); light(r, 12, 13, 6, SEA, 0.15);
  event(r, 'dn_curtain', 79, 0, { c0: 78, c1: 81, r0: 0, r1: 14, seed: 9, a: 0.6 });
  event(r, 'dn_masonry', 1, 1, { c0: 1, c1: 60, r0: 1, r1: 11, seed: 6, arches: 6, wash: 1 });
  return done(r, { theme: { bg: 'interior', weather: 'none' }, bgSeed: 10, dark: 0.66 });
}

// =====================================================================================================
// dn_11 — THE BAPTISTERY (64x18). A round chapel under a dome; floor top row 15. N1 (cols 20-23): rungs (tops 12/8/4)
// climb back to the Choir Loft. The frozen font at col 34 (frost rim, cold mist); lore_dn_6 at col 44; a cold draught
// and blue light from the east (E1 to the Reliquary); W1 to the crypt's high doorway.
// =====================================================================================================
function dn11() {
  const r = RK.room('dn_11');
  air(r, 1, 4, 62, 14);
  air(r, 20, 0, 23, 3);                        // N1 throat
  air(r, 18, 2, 25, 3);                        // ... flared: head room to walk off the top rung (row 4)
  air(r, 26, 3, 42, 3); air(r, 28, 2, 40, 2); air(r, 31, 1, 37, 1);    // the dome over the font
  for (const y of [12, 8, 4]) plat(r, 19, 24, y);
  event(r, 'dn_posts', 22, 4, { posts: [[22, 4, 15, 0.7]] });   // the rungs are corbels on a slender pier
  r.openExits();
  r.put(44, 14, { type: 'lore', id: 'lore_dn_6' });
  enemy(r, 'drowned_acolyte', 12, 14, { range: 3 });
  enemy(r, 'drowned_acolyte', 51, 14, { range: 3, facing: 'left' });
  enemy(r, 'rain_jelly', 34, 8, { leash: 4 });
  event(r, 'dn_font', 34, 15, { c: 34, base: 15 });
  event(r, 'dn_frost', 46, 15, { c0: 46, c1: 62, row: 15, seed: 5 });
  light(r, 34, 11, 7, ICE, 0.35); light(r, 60, 13, 6, ICE, 0.35);
  for (const c of [28, 40]) deco(r, 'column_broken', c, 14, { h: 200, dim: 0.4, layer: 'back' });
  for (const c of [6, 56]) { deco(r, 'stained_window', c, 12, { scale: 1.6, dim: 0.35, layer: 'back' }); light(r, c + 1, 8, 5, GLASS, 0.2); }
  deco(r, 'candelabra', 30, 14, { lit: true }); deco(r, 'candelabra', 38, 14, { lit: true, flip: true });
  light(r, 30, 12, 3.5, CANDLE, 0.45, true); light(r, 38, 12, 3.5, CANDLE, 0.45, true);
  deco(r, 'bell_small', 34, 1, { len: 30 });
  deco(r, 'rubble', 2, 14); deco(r, 'pew', 16, 14, { dim: 0.3, layer: 'back' }); deco(r, 'pew', 47, 14, { dim: 0.3, layer: 'back', flip: true });
  return done(r, { theme: { bg: 'interior', weather: 'none' }, bgSeed: 111, dark: 0.55 });
}

// =====================================================================================================
// dn_12 — THE RELIQUARY (64x27). Hall floor top row 15 (cols 1-49), W1 rows 12-14. Shelves of reliquaries along the back
// (decor + a few one-way shelves, all in cols 4-19, none above row 9: far from the stair ledge). THE ICE STAIR (up-only
// from the Rime): S1 (cols 52-55) is the foot of a 4-wide shaft inside the solid ice pillar (cols 50-57, rows 6-26;
// inner walls # for grip, no ledges) emerging onto the high ledge (top row 5, rows 5-6, cols 40-57); from its west lip
// the player drops 10 tiles to the hall. The ledge lip/underside and the pillar's hall face are GLAZED and nothing
// standable lies within 20 columns: the ledge can never be reached from the hall. PLUNGE: a cracked reliquary floor (D,
// cols 8-13, rows 15-16) over a sealed vault (cols 4-24, air rows 17-21, floor top row 22) with spark_dn; climb out by
// the one-way shelf (top row 19) under the hole.
// =====================================================================================================
function dn12() {
  const r = RK.room('dn_12');
  air(r, 1, 2, 49, 14);                        // the hall
  air(r, 40, 1, 57, 4);                        // headroom over the stair ledge
  box(r, 40, 5, 49, 6, 'X');                   // the ledge's overhang over the hall (glazed lip + underside)
  box(r, 50, 5, 57, 26);                       // the ice pillar ...
  box(r, 50, 5, 50, 14, 'X');                  // ... its hall face glazed
  air(r, 52, 5, 55, 26);                       // ... and the shaft inside it (walls # cols 51 / 56)
  box(r, 8, 15, 13, 16, 'D');                  // the cracked reliquary floor
  air(r, 4, 17, 24, 21);                       // the sealed vault
  plat(r, 11, 15, 19);                         // climb out: 22 -> 19 -> 15
  plat(r, 5, 10, 9); plat(r, 14, 19, 11);      // reliquary shelves (one-way, far from the ledge)
  event(r, 'dn_posts', 10, 9, { posts: [[5.5, 9, 15], [10.5, 9, 15], [14.5, 11, 15], [19.5, 11, 15]] });
  r.openExits();
  // ---- contents
  r.put(20, 21, { type: 'pickup', item: 'spark', id: 'spark_dn' });
  enemy(r, 'drowned_knight', 24, 14, { range: 3 });
  // ---- the shelves, the vault, the ice stair's blue light
  for (const c of [3, 7, 15, 19, 27, 31]) deco(r, 'bookshelf', c, 14, { dim: 0.35, layer: 'back', seed: c });
  deco(r, 'altar', 20, 21); deco(r, 'bones', 7, 21); deco(r, 'candle_cluster', 23, 21);   // unlit (veiled vault: lights shine through rock)
  event(r, 'dn_frost', 40, 5, { c0: 40, c1: 57, row: 5, seed: 7 });
  light(r, 53, 3, 7, ICE, 0.45); light(r, 53, 18, 6, ICE, 0.35); light(r, 45, 10, 6, ICE, 0.2);
  event(r, 'dn_frost', 34, 15, { c0: 34, c1: 49, row: 15, seed: 8 });
  deco(r, 'candelabra', 36, 14, { lit: true }); light(r, 36, 12, 3.5, CANDLE, 0.45, true);
  deco(r, 'lantern_hanging', 12, 2, { len: 40, lit: true }); light(r, 12, 4, 3.5, CANDLE, 0.4, true);
  deco(r, 'statue_waxen', 44, 14, { variant: 1, dim: 0.3, layer: 'back' });
  return done(r, { theme: { bg: 'interior', weather: 'none' }, bgSeed: 121, dark: 0.58 });
}

// =====================================================================================================
const builders = { dn01, dn02, dn03, dn04, dn05, dn06, dn08, dn09, dn10, dn11, dn12 };
const only = process.argv.slice(2).filter((a) => !a.startsWith('--'));
for (const [name, fn] of Object.entries(builders)) {
  const r = fn();
  if (process.argv.includes('--print') && (!only.length || only.includes(name) || only.includes(r.id))) {
    console.log('\n' + r.id + '\n' + r.ascii().split('\n').map((l, i) => String(i).padStart(2) + ' ' + l).join('\n'));
  }
}
const out = RK.emit('nave', defs, path.join('src', 'data', 'regions', 'nave.js'),
  'THE DROWNED NAVE (region builder: region-nave). Arena dn_07 lives in src/data/arenas/tallowmere.js');
console.log('wrote ' + path.relative(path.resolve(__dirname, '../..'), out) + ' (' + defs.length + ' rooms)');
