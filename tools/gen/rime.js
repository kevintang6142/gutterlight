#!/usr/bin/env node
// tools/gen/rime.js — generator for THE RIME (region builder: region-rime_sanctum).
// Builds every NON-arena room of region 'rime' with tools/lib/roomkit.js exactly to design/world_plan.json and
// emits src/data/regions/rime.js. Never hand-edit the emitted file: edit this, then re-run:
//   node tools/gen/rime.js [--print] [ri_02 ...]     (--print dumps the rooms as ASCII with row numbers)
// Coordinates: x = column, y = row (room-local, 0-based). Helpers take INCLUSIVE rectangles.
// The arena ri_07 (The Last Guard, Sable's second duel) lives in src/data/arenas/sable2.js (boss builder).
// Enemies: src/entities/enemies/rime.js (docs/api/enemies-rime_sanctum.md). Event scripts ri_* live there too.
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

// palette (docs/ART_GUIDE.md §2, rime): ice cyan, pale frost, deep steel; the only warm colour is a faint draught
const ICE = '#9ae0ff', FROST = '#c8f0ff', PALE = '#eaf6ff', STEEL = '#6a8aa4', DEEP = '#4a7ca0', WARM = '#ffc888';

const defs = [];
// Ceiling props hang from the TOP of their anchor tile: re-anchor every ceiling prop to the underside of the solid
// (or one-way) tile above it so nothing floats (gaps > 3 tiles are reported).
const CEILING = new Set(['banner', 'cage_hanging', 'chain', 'lantern_hanging', 'drip', 'web']);
const STRETCH = new Set(['cage_hanging', 'chain', 'lantern_hanging']);
const holds = (ch) => ch === '#' || ch === 'X' || ch === 'B' || ch === 'D' || ch === '=';
function hangFix(r) {
  for (const e of r.entities) {
    if (e.type !== 'decor' || !CEILING.has(e.kind)) continue;
    const cx = Math.floor(e.x + 0.5); const y = Math.round(e.y); let gap = 0;
    while (y - gap - 1 >= 0 && !holds(r.get(cx, y - gap - 1))) gap++;
    if (gap === 0) continue;
    if (gap > 3 || y - gap - 1 < 0) { console.warn(`hangFix ${r.id}: ${e.kind}@${e.x},${e.y} has no ceiling within 3 tiles`); continue; }
    e.y = y - gap;
    if (STRETCH.has(e.kind)) e.len = (e.len != null ? e.len : (e.kind === 'cage_hanging' ? 30 : e.kind === 'chain' ? 120 : 40)) + gap * 40;
  }
}
// (QA) Standing props rest on the TOP of the tile below their anchor: fail the build if that tile is not solid,
// one-way or spikes (ri_08's candelabra once stood over the open S1 shaft). Wall/backdrop kinds are exempt.
const FREE = new Set(['stained_window', 'arch', 'cage_bars', 'pipe_v', 'light']);
function footCheck(r) {
  for (const e of r.entities) {
    if (e.type !== 'decor' || CEILING.has(e.kind) || FREE.has(e.kind)) continue;
    const ch = r.get(Math.floor(e.x + 0.5), Math.round(e.y) + 1);
    if (!holds(ch) && ch !== '^') throw new Error(`footCheck ${r.id}: ${e.kind}@${e.x},${e.y} stands on '${ch}' (no floor)`);
  }
}
const done = (r, extra) => { hangFix(r); footCheck(r); defs.push(r.toDef(extra)); return r; };
// frozen pilgrims (the region's motif): waxen sealed in ice, all walking the same way
const pilgrim = (r, x, y, o) => deco(r, 'frozen_waxen', x, y, Object.assign({ variant: (x * 7 + y) % 2 }, o || {}));

// =====================================================================================================
// ri_01 — THE FROZEN STAIR (64x36, room). Arrival from the Sunken Crypt: the plunge through dn_08's cracked floor
// falls down a GLAZED ice shaft (cols 10-17, walls X at cols 9 and 18, rows 0-10, no ledges: one-way) onto the ice
// shelf (floor top row 15, cols 8-50, then solid to E1 at rows 12-14). From the shelf's west lip a frozen stair of
// 3-tile steps winds down: a ledge against the west wall (top 18), then a ribbon of ice steps running back east under
// the shelf (tops 21, 24, 27) to a last slab (top 29) and the lower floor (top row 33, W1 rows 30-32 under the stair).
// The CHUTE: a 4-wide hole in the shelf (cols 52-55) between grippable ice walls (cols 51 and 56) straight down to S1
// and the Sanctum Gate (ri_08), barred there by ri_gate1 until the lever ri_lv1 is struck from below.
// =====================================================================================================
function ri01() {
  const r = RK.room('ri_01');
  // ---- the plunge shaft (glazed, ledgeless) and the hall above the shelf
  air(r, 10, 1, 17, 14);
  box(r, 9, 0, 9, 10, 'X'); box(r, 18, 0, 18, 10, 'X');
  box(r, 10, 0, 11, 0, 'X'); box(r, 16, 0, 17, 0, 'X');
  air(r, 1, 11, 62, 14);                         // the walk along the shelf
  air(r, 19, 6, 50, 10);                         // the hall rises east of the shaft ...
  air(r, 24, 4, 44, 5);                          // ... into an icicle vault
  air(r, 51, 8, 62, 10);
  box(r, 19, 6, 21, 8, 'X');                     // a glazed shoulder against the shaft (no grip toward the shaft)
  // ---- the shelf (2 thick) and the chute
  box(r, 8, 15, 50, 16);
  air(r, 52, 15, 55, 35);                        // the chute: walls col 51 / col 56 (rows 15-35, grippable, no ledges)
  // ---- the stair well (west) and the cavern under the shelf
  air(r, 1, 15, 7, 17);
  air(r, 1, 17, 50, 32);
  box(r, 1, 18, 5, 23);                          // ledge 18 (cols 1-5) sitting on the first flight
  box(r, 6, 21, 13, 23);                         // flight top 21 (cols 6-13)
  box(r, 13, 24, 20, 26);                        // flight top 24 (cols 14-20)
  box(r, 20, 27, 27, 28);                        // flight top 27 (cols 21-27)
  box(r, 27, 29, 33, 29);                        // last slab top 29 (cols 28-33), 3 rows of walkway under it
  // icicle teeth hanging under the flights (decorative, out of the walkway)
  box(r, 8, 24, 9, 24); box(r, 16, 27, 16, 27);
  // the lower floor: a frozen procession hall, a low ice mound in the east
  box(r, 40, 31, 46, 32); box(r, 42, 30, 44, 30);
  r.openExits();
  // ---- contents
  r.put(30, 14, { type: 'lore', id: 'lore_ri_1' });
  enemy(r, 'frost_husk', 17, 23, { range: 1, facing: 'left' });       // on the 24-step (cols 14-20)
  enemy(r, 'frost_husk', 31, 28, { range: 1, facing: 'left' });       // on the last slab (cols 28-33)
  enemy(r, 'shard_crawler', 16, 32, { surface: 'floor', range: 4 }); // under the stair, on the procession floor
  // ---- the landmark: frozen pilgrims on every step, all walking down
  pilgrim(r, 3, 17, { flip: true }); pilgrim(r, 11, 20, { dim: 0.2 }); pilgrim(r, 18, 23, { layer: 'back', dim: 0.35 });
  pilgrim(r, 24, 26, { layer: 'back', dim: 0.3 }); pilgrim(r, 29, 28, { layer: 'back', dim: 0.35 });
  pilgrim(r, 36, 14, { layer: 'back', dim: 0.4 }); pilgrim(r, 44, 14, { layer: 'back', dim: 0.45, variant: 1 });
  for (const c of [5, 22, 37, 48]) pilgrim(r, c, 32, { layer: 'back', dim: 0.45 + (c % 3) * 0.1 });
  deco(r, 'ice_spire', 39, 32, { layer: 'back', dim: 0.4 }); deco(r, 'ice_spire', 47, 32, { layer: 'back', dim: 0.3 });
  deco(r, 'crystal', 43, 29, { color: ICE }); deco(r, 'crystal', 34, 32, { color: FROST, dim: 0.2 });
  deco(r, 'bones', 26, 32); deco(r, 'rubble', 9, 32);
  deco(r, 'wick_grave', 58, 14); deco(r, 'sconce_dead', 49, 14);
  deco(r, 'stalagmite', 23, 14, { h: 40 }); deco(r, 'ice_spire', 60, 14, { layer: 'back', dim: 0.5 });
  for (const [c, y, f] of [[30, 4, 240], [37, 4, 300], [26, 6, 200], [47, 6, 220], [11, 1, 520], [57, 8, 160], [33, 17, 380], [44, 17, 420]]) {
    deco(r, 'drip', c, y, { fall: f, color: FROST });
  }
  light(r, 13, 3, 6, PALE, 0.3);                 // the cold daylight of the shaft
  light(r, 30, 12, 4, ICE, 0.35);                // the inscription
  light(r, 4, 16, 5, ICE, 0.3);
  light(r, 22, 26, 6, DEEP, 0.3);
  light(r, 43, 28, 4, ICE, 0.45);                // the crystal on the mound
  light(r, 53, 18, 4, STEEL, 0.25);              // down the chute
  light(r, 60, 12, 4, ICE, 0.25);
  return done(r, { bgSeed: 101, theme: { fog: 1.1 } });
}

// =====================================================================================================
// ri_02 — THE RIME CAUSEWAY (128x27, corridor). An ice causeway (floor top row 15, 2 thick) on glazed piers over a
// frozen chasm (cols 20-110, rows 16-21; its floor top row 22 bristles with ice shards on row 21; GLAZED walls at cols
// 19 / 111). Three small gaps (3, 4, 5 tiles) give the crossing its rhythm; a respawn point sits a few tiles back from
// every lip. Two low parapets carry the ice_spitters. THE FROZEN FALL: near the east end the causeway is only a
// skin of thin ice (one-way platform, cols 122-125) over a glazed chute straight down through S1 onto the Frozen
// Lake: walking over it is safe, Down+Jump breaks through (no climbing back: the chute walls are X).
// =====================================================================================================
function ri02() {
  const r = RK.room('ri_02');
  air(r, 1, 4, 126, 14);                         // the cavern above the causeway
  air(r, 30, 3, 50, 3); air(r, 58, 2, 74, 3); air(r, 84, 3, 100, 3);   // vault pockets
  box(r, 8, 4, 18, 6); box(r, 10, 7, 16, 7);                           // overhang above the west approach
  box(r, 52, 4, 55, 7); box(r, 53, 8, 54, 8);                          // an ice fang over gap B (high, harmless)
  box(r, 108, 4, 120, 8);                                              // low overhang: the crawler's ceiling (row 8)
  // ---- the chasm under the causeway
  // (the shard bed is raised to top row 22 from the plan's 25 so that it is in view from the deck: the chasm must
  // read as deadly, not as a void or a lower floor)
  air(r, 20, 16, 110, 21);
  box(r, 20, 21, 110, 21, '^');                  // ice shards on the chasm floor (floor top row 22)
  box(r, 19, 17, 19, 21, 'X'); box(r, 111, 17, 111, 21, 'X');         // glazed chasm walls (QA: below the deck only -
                                                                       // reaching row 15 they drew a glossy slot in the deck)
  box(r, 20, 15, 110, 16);                       // the causeway deck
  for (const c of [26, 44, 67, 89, 104]) box(r, c, 17, c + 1, 21, 'X');  // glazed piers down to the chasm floor
  air(r, 32, 15, 34, 16); air(r, 57, 15, 60, 16); air(r, 76, 15, 80, 16);  // the three gaps (3, 4, 5)
  box(r, 45, 14, 46, 14);                        // parapet (spitter A)
  box(r, 102, 14, 103, 14);                      // parapet (spitter B, the geode frozen into its west face)
  // ---- the Frozen Fall: a skin of thin ice over a glazed chute
  air(r, 122, 15, 125, 26);
  box(r, 121, 16, 121, 26, 'X'); box(r, 126, 16, 126, 26, 'X');
  plat(r, 122, 125, 15);
  r.openExits();
  // ---- contents
  r.put(66, 14, { type: 'lore', id: 'lore_ri_2' });
  r.put(101, 14, { type: 'geode', id: 'ri_geo1', amount: 90 });
  enemy(r, 'frost_husk', 14, 14, { range: 2, reach: 7, facing: 'right' });
  enemy(r, 'frost_husk', 94, 14, { range: 2, reach: 7, facing: 'left' });
  enemy(r, 'ice_spitter', 45, 13, { surface: 'floor' });
  enemy(r, 'ice_spitter', 102, 13, { surface: 'floor' });
  enemy(r, 'shard_crawler', 115, 9, { surface: 'ceiling', range: 3, facing: 'left' });
  // fair hazard respawns: a few tiles back from every lip, trigger boxes ending at the lips
  respawn(r, 28, 14, 7, 3); respawn(r, 38, 14, 7, 3);
  respawn(r, 53, 14, 7, 3); respawn(r, 64, 14, 7, 3);
  respawn(r, 72, 14, 7, 3); respawn(r, 84, 14, 7, 3);
  // ---- the landmark: waxen statues sealed in clear ice along the causeway, the chasm glittering below
  for (const c of [5, 23, 37, 51, 62, 71, 83, 98, 108]) pilgrim(r, c, 14, { layer: 'back', dim: 0.35 + (c % 4) * 0.05 });
  for (const c of [29, 41, 54, 64, 87, 96]) deco(r, 'column_broken', c, 14, { h: 70 + (c % 3) * 20, dim: 0.45, layer: 'back' });
  for (const c of [24, 49, 73, 93]) deco(r, 'ice_spire', c, 20, { dim: 0.55, layer: 'back' });
  deco(r, 'signpost', 118, 14); deco(r, 'sconce_dead', 3, 14); deco(r, 'rubble', 112, 14);
  deco(r, 'crystal', 20, 14, { color: ICE, dim: 0.2 }); deco(r, 'crystal', 110, 14, { color: FROST, dim: 0.2 });
  for (const [c, y, f] of [[12, 8, 240], [36, 3, 420], [53, 9, 200], [66, 2, 460], [92, 3, 420], [114, 9, 180], [123, 16, 380]]) {
    deco(r, 'drip', c, y, { fall: f, color: FROST });
  }
  light(r, 66, 12, 4, ICE, 0.4);                 // the marker in the ice
  light(r, 101, 13, 3, ICE, 0.3);
  light(r, 45, 19, 7, DEEP, 0.3); light(r, 95, 19, 7, DEEP, 0.3);   // the chasm glows faintly
  light(r, 123, 20, 4, FROST, 0.35);             // cold light up the Frozen Fall
  light(r, 14, 9, 5, STEEL, 0.25); light(r, 84, 8, 6, STEEL, 0.2);
  return done(r, { bgSeed: 113, theme: { fog: 1.2 } });
}

// =====================================================================================================
// ri_03 — THE LONG COLD (160x18, corridor) under the Mothwood. Floor top row 15 (E1 rows 12-14 to the Frozen Stair).
// N1 (cols 40-43): the one-way drop from the Silt Roots lands on a snow drift; the shaft above is GLAZED with no
// ledges. A whole procession of waxen pilgrims stands frozen mid-step along the tunnel, every one walking east, down
// toward the Frozen Stair. WINGS REWARD at the west end: an ice shelf (cols 1-14, top row 8 = 7 tiles above the floor,
// GLAZED faces, attached to the west wall, a flat ceiling at row 3 and nothing grippable within reach) holds ri_hw1.
// =====================================================================================================
function ri03() {
  const r = RK.room('ri_03');
  air(r, 1, 4, 158, 14);                         // the tunnel
  // ceiling relief (rows 2-8): vaults, ice fangs, the low run of the crawler's ceiling
  air(r, 48, 3, 70, 3); air(r, 76, 2, 104, 3); air(r, 82, 1, 98, 1); air(r, 145, 3, 156, 3);
  box(r, 24, 4, 32, 5); box(r, 26, 6, 30, 6);    // a fang well east of the shelf (> 9 cols away, bottom row 6)
  box(r, 108, 4, 112, 6); box(r, 109, 7, 111, 7);
  box(r, 127, 4, 143, 8);                        // low ceiling (row 8): the ceiling crawler's run
  // N1: the glazed drop shaft and the snow drift under it
  air(r, 40, 0, 43, 3);
  box(r, 39, 0, 39, 4, 'X'); box(r, 44, 0, 44, 4, 'X');
  box(r, 36, 14, 47, 14); box(r, 38, 13, 45, 13); // the drift (2 high, steps of 1)
  // WINGS: the glazed ice shelf at the west end
  box(r, 1, 8, 14, 14, 'X');
  box(r, 0, 3, 0, 14, 'X');                      // the west wall beside it glazed too
  // floor relief: low frozen ridges between the husk beats
  box(r, 50, 14, 52, 14); box(r, 74, 14, 77, 14); box(r, 100, 14, 103, 14); box(r, 125, 14, 127, 14);
  // the geode's niche in the ice (a dip in the floor at col 80)
  air(r, 79, 15, 81, 15);
  r.openExits();
  // ---- contents
  r.put(6, 7, { type: 'pickup', item: 'heartwax', id: 'ri_hw1' });
  r.put(80, 15, { type: 'geode', id: 'ri_geo2', amount: 80 });
  enemy(r, 'frost_husk', 62, 14, { range: 3, facing: 'left' });
  enemy(r, 'frost_husk', 115, 14, { range: 3, facing: 'left' });
  enemy(r, 'rime_wraith', 90, 10, { leash: 6 });
  enemy(r, 'shard_crawler', 25, 14, { surface: 'floor', range: 5 });
  enemy(r, 'shard_crawler', 135, 9, { surface: 'ceiling', range: 6 });
  // ---- the landmark: the frozen procession, all walking east (down)
  for (let c = 18, k = 0; c < 156; c += 5 + (k * 3) % 4, k++) {
    if ((c >= 36 && c <= 47) || (c >= 78 && c <= 82)) continue;
    pilgrim(r, c, 14, { layer: 'back', dim: 0.25 + (k % 4) * 0.08, variant: k % 2 });
  }
  pilgrim(r, 9, 7, { variant: 1, dim: 0.15 });   // one pilgrim reached the shelf
  for (const c of [33, 57, 96, 121, 150]) deco(r, 'ice_spire', c, 14, { layer: 'back', dim: 0.4 });
  deco(r, 'crystal', 47, 13, { color: ICE }); deco(r, 'crystal', 82, 14, { color: FROST }); deco(r, 'crystal', 3, 7, { color: ICE, dim: 0.3 });
  deco(r, 'bones', 70, 14); deco(r, 'wick_grave', 106, 14); deco(r, 'sconce_dead', 155, 14); deco(r, 'rubble', 140, 14);
  for (const [c, y, f] of [[28, 7, 260], [60, 3, 420], [90, 1, 520], [110, 8, 240], [135, 9, 200], [150, 3, 420]]) {
    deco(r, 'drip', c, y, { fall: f, color: FROST });
  }
  light(r, 41, 2, 5, PALE, 0.3);                 // daylight-grey from the Silt Roots above
  light(r, 6, 6, 4, ICE, 0.35);                  // the heartwax glints up on the shelf
  light(r, 80, 13, 3, ICE, 0.35);
  light(r, 90, 6, 7, STEEL, 0.25); light(r, 125, 11, 5, DEEP, 0.25); light(r, 154, 12, 4, ICE, 0.3);
  return done(r, { bgSeed: 131, theme: { weatherDensity: 0.7 } });
}

// =====================================================================================================
// ri_05 — THE ICEBOUND STAIR (64x27, room): the crossroads of the Rime and its first sconce (col 34). Floor top
// row 15 (W1 / E1 rows 12-14). THE WAY HOME: a hanging stair of one-way ice platforms (tops 11, 7, 4; the top one
// directly under N1) climbs into an alcove under N1 (cols 20-23), the foot of the Reliquary's Ice Stair; a warm
// draught and a faint gold light fall from above. S1 (cols 40-43): a frozen well in the floor (cols 37-46) down to
// the Frozen Lake; its bottom dips to top row 25 beside the hole (cols 37-39 / 44-46) and ice rungs (tops 21, 17) on
// both sides climb back to the rim, so the boost out of ri_04's platform stack always lands. The ice_spitter holds a
// low terrace in the east (cols 51-58, top 12).
// =====================================================================================================
function ri05() {
  const r = RK.room('ri_05');
  air(r, 1, 4, 62, 14);                          // the crossroads
  air(r, 15, 1, 28, 3);                          // the alcove under the Ice Stair
  air(r, 36, 3, 46, 3); air(r, 6, 3, 11, 3); air(r, 52, 3, 60, 3);
  box(r, 31, 4, 33, 6); box(r, 32, 7, 32, 7);    // ice fangs
  box(r, 47, 4, 49, 5);
  // the hanging ice stair to N1
  plat(r, 17, 21, 11); plat(r, 23, 27, 7); plat(r, 19, 24, 4);
  // S1: the frozen well
  air(r, 37, 15, 46, 24);
  air(r, 40, 25, 43, 26);
  plat(r, 37, 39, 21); plat(r, 44, 46, 21);
  plat(r, 37, 39, 17); plat(r, 44, 46, 17);
  // the east terrace
  box(r, 51, 12, 58, 14);
  r.openExits();
  // ---- contents
  r.put(34, 14, { type: 'sconce', id: 'ri_sconce_a' });
  enemy(r, 'ice_spitter', 55, 11, { surface: 'floor' });
  // ---- dressing: frost-rimmed stair, a warm draught, the well's cold breath
  deco(r, 'chain', 19, 1, { len: 120 }); deco(r, 'chain', 24, 1, { len: 120 });           // the top step
  deco(r, 'chain', 27, 1, { len: 240 }); deco(r, 'chain', 23, 5, { len: 80 });            // the middle step
  deco(r, 'chain', 17, 1, { len: 400 }); deco(r, 'chain', 21, 8, { len: 120 });           // the bottom step
  deco(r, 'signpost', 13, 14);
  deco(r, 'lamp_post', 30, 14, { lit: true, flame: 'blue' });
  deco(r, 'crystal', 38, 24, { color: ICE }); deco(r, 'crystal', 45, 24, { color: FROST, flip: true });
  pilgrim(r, 8, 14, { layer: 'back', dim: 0.4 }); pilgrim(r, 60, 14, { layer: 'back', dim: 0.4, flip: true });
  pilgrim(r, 53, 11, { layer: 'back', dim: 0.45 });
  deco(r, 'ice_spire', 4, 14, { layer: 'back', dim: 0.4 }); deco(r, 'ice_spire', 49, 14, { layer: 'back', dim: 0.35 });
  deco(r, 'wick_grave', 11, 14); deco(r, 'rubble', 61, 14);
  for (const [c, y, f] of [[8, 3, 360], [32, 8, 220], [41, 3, 700], [48, 6, 300], [56, 3, 320]]) deco(r, 'drip', c, y, { fall: f, color: FROST });
  light(r, 21, 1, 6, WARM, 0.5, true);           // the faint warm draught from the Nave above
  light(r, 22, 6, 4, WARM, 0.15);
  light(r, 34, 12, 6, '#ffd6a0', 0.55, true);    // the sconce
  light(r, 30, 11, 3, ICE, 0.35);
  light(r, 41, 22, 6, DEEP, 0.35);               // the well
  light(r, 55, 9, 4, ICE, 0.25);
  return done(r, { bgSeed: 151, theme: { fog: 1.1 } });
}

// =====================================================================================================
// ri_04 — THE FROZEN LAKE (96x36, landmark). A vast sheet of glazed ice (floor top row 24, cols 23-95) under a
// cavern sky of icicles. N1 (cols 26-29) is the bottom of the Frozen Fall: players drop onto the lake (one-way). N2
// (cols 72-75) from the Icebound Stair: a hanging stack of one-way ice platforms (tops 20, 16, 12, 8, 4; the top one
// directly under N2 in an alcove) climbs back up. Wren (stage 4) sits at the lake edge at col 56 by her fishing hole;
// lore_ri_4 (Sable's black-wax note) at col 66; the Lanternway post 'rime' at col 84. WINGS GATE: at the lake's west end a sheer GLAZED ice
// wall (cols 15-22) rises to top row 17, exactly 7 above the lake, nothing grippable within 6 tiles. West of it the
// ground falls away to the FAR SHORE (cols 1-14, floor top row 33, W1 rows 30-32 to Sable's second duel), where
// ri_sconce_b rests at col 8 at the foot of two GLAZED steps, each 6 rows above the last: ledge A (cols 1-6, top 27,
// the lintel over W1) and pillar B (cols 9-14, top 21) - then a 4-row hop to the wall top. Only Smokewing climbs it.
// =====================================================================================================
function ri04() {
  const r = RK.room('ri_04');
  air(r, 1, 3, 94, 23);                          // the great cavern over the lake and the far shore
  air(r, 1, 24, 14, 32);                         // the far shore drops away west of the wall
  // the cavern sky: vault pockets and icicle fangs (all high, none near N1 or the wall)
  air(r, 36, 2, 62, 2); air(r, 40, 1, 58, 1); air(r, 80, 2, 85, 2);
  box(r, 48, 3, 51, 6); box(r, 49, 7, 50, 8);    // a great fang over the middle of the lake
  box(r, 86, 3, 94, 5);
  // N1 (the Frozen Fall) and the N2 alcove with its hanging stair
  air(r, 26, 0, 29, 2);
  box(r, 26, 1, 29, 17, ':');                    // the hollow inside the frozen waterfall (back wall)
  // the Frozen Fall comes down inside a hollow column of glazed ice (a frozen waterfall) that opens 7 rows above the
  // lake: a player falling from N1 cannot drift onto the wall top (measured: from an open ceiling, a dash steers a
  // falling player from col 26 onto the wall - gate leak)
  box(r, 25, 0, 25, 17, 'X'); box(r, 30, 0, 30, 17, 'X');
  air(r, 68, 1, 79, 2);
  plat(r, 77, 81, 20); plat(r, 70, 74, 16); plat(r, 77, 81, 12); plat(r, 70, 74, 8); plat(r, 71, 76, 4);
  // the lake: two rows of glazed ice over the deep
  box(r, 23, 24, 95, 25, 'X');
  // WINGS GATE: the sheer glazed wall and the far shore's glazed steps
  box(r, 15, 17, 22, 35, 'X');
  box(r, 1, 27, 6, 29, 'X');                     // ledge A (top 27), the lintel over W1
  box(r, 0, 3, 0, 29, 'X');                      // the far shore's west wall: glazed
  box(r, 9, 21, 14, 32, 'X');                    // pillar B (top 21)
  r.openExits();
  // ---- contents
  r.put(56, 23, { type: 'npc', npc: 'wren', stage: 4 });
  r.put(66, 23, { type: 'lore', id: 'lore_ri_4' });
  r.put(84, 23, { type: 'lanternway', id: 'rime' });
  r.put(8, 32, { type: 'sconce', id: 'ri_sconce_b' });
  enemy(r, 'frost_husk', 41, 23, { range: 2, facing: 'left' });
  enemy(r, 'rime_wraith', 39, 18, { leash: 3 });   // QA: >= 10 tiles from the N1 landing (sight 9)
  enemy(r, 'rime_wraith', 45, 19, { leash: 3 });   // QA: 11 tiles from Wren
  // ---- dressing
  event(r, 'ri_icehole', 58, 23, { w: 2 });     // Wren's fishing hole (drawn flush with the ice; not a hazard)
  deco(r, 'chain', 71, 1, { len: 120 }); deco(r, 'chain', 76, 1, { len: 120 });           // p4
  deco(r, 'chain', 70, 3, { len: 200 }); deco(r, 'chain', 74, 5, { len: 120 });           // p8
  deco(r, 'chain', 79, 3, { len: 360 }); deco(r, 'chain', 81, 3, { len: 360 });           // p12
  deco(r, 'chain', 70, 9, { len: 280 }); deco(r, 'chain', 74, 9, { len: 280 });           // p16
  deco(r, 'chain', 77, 13, { len: 280 }); deco(r, 'chain', 81, 13, { len: 280 });         // p20
  for (const c of [31, 45, 62, 71, 90]) deco(r, 'ice_spire', c, 23, { layer: 'back', dim: 0.35 + (c % 3) * 0.1 });
  for (const c of [35, 52, 78, 93]) pilgrim(r, c, 23, { layer: 'back', dim: 0.5 });
  deco(r, 'crystal', 24, 23, { color: ICE, dim: 0.2 }); deco(r, 'crystal', 88, 23, { color: FROST });
  deco(r, 'crystal', 12, 20, { color: ICE }); deco(r, 'crystal', 3, 26, { color: FROST, dim: 0.2 });
  deco(r, 'bones', 60, 23); deco(r, 'lamp_post', 93, 23, { lit: true, flame: 'blue' });   // QA: not beside the Lanternway post
  deco(r, 'wick_grave', 3, 32); deco(r, 'ice_spire', 13, 32, { dim: 0.4, layer: 'back' });
  for (const [c, y, f] of [[33, 3, 760], [44, 2, 820], [55, 2, 820], [60, 3, 760], [84, 3, 680], [10, 3, 660]]) deco(r, 'drip', c, y, { fall: f, color: FROST });
  light(r, 56, 21, 3, '#9fc8e8', 0.4);           // Wren's last cold flame
  light(r, 58, 23, 3, DEEP, 0.4);                // the hole's dark water
  light(r, 66, 22, 3, ICE, 0.35);
  light(r, 84, 21, 5, ICE, 0.4);
  light(r, 8, 30, 6, '#ffd6a0', 0.5, true);      // the sconce on the far shore
  light(r, 27, 4, 6, PALE, 0.3);                 // grey light down the Frozen Fall
  light(r, 74, 3, 5, PALE, 0.25);
  light(r, 40, 12, 12, STEEL, 0.25); light(r, 70, 14, 10, STEEL, 0.2);   // the cavern sky
  // QA: bgSeed 141 -> 150: with 141 the region's auto-decor stood a dark stalagmite on the wings-wall top (the only landing
  // of the Smokewing jump), where it read as a spike; 150 keeps the wall, pillar, ledge, sconce and Wren clear
  return done(r, { bgSeed: 150, theme: { fog: 1.3, weatherDensity: 1.2 } });
}

// =====================================================================================================
// ri_06 — THE GLACIER GALLERY (128x18, corridor) under the Chandlery. Floor top row 15 (W1 rows 12-14 to the
// Icebound Stair). N1 (cols 78-81): the one-way drop from the Quench Gate lands here; the shaft above is GLAZED with
// no ledges. The gallery is cut through a glacier whose ice is so clear that drowned forges (vats, anvils, gears)
// and moldlings can be seen frozen inside it. SECRET: at the east end a B wall of packed snow (cols 112-113, rows
// 12-14) hides an ice cave (cols 114-126, rows 10-14, floor top 15) where the Deep Kindle sigil lies beside a frozen
// waxen who died kindling. The pocket is veiled automatically; cracks and a faint ember glow hint at it.
// =====================================================================================================
function ri06() {
  const r = RK.room('ri_06');
  air(r, 1, 4, 111, 14);                         // the gallery
  air(r, 10, 3, 34, 3); air(r, 86, 3, 106, 3); air(r, 90, 2, 102, 2);
  box(r, 50, 4, 68, 8);                          // low glacier ceiling (row 8): the ceiling crawler's run
  box(r, 45, 4, 49, 6); box(r, 69, 4, 72, 6);
  box(r, 104, 4, 111, 9);                        // the gallery narrows toward the snow wall
  // N1: the glazed drop shaft
  air(r, 78, 0, 81, 3);
  box(r, 77, 0, 77, 3, 'X'); box(r, 82, 0, 82, 3, 'X');
  // floor relief: frozen spill ridges
  box(r, 16, 14, 18, 14); box(r, 37, 14, 38, 14); box(r, 88, 14, 91, 14); box(r, 96, 13, 98, 14);
  // SECRET: the packed-snow wall and the ice cave behind it
  box(r, 112, 12, 113, 14, 'B');
  air(r, 114, 10, 126, 14);
  r.openExits();
  // ---- contents
  r.put(122, 14, { type: 'pickup', item: 'sigil', sigil: 'deep_kindle', id: 'ri_sig_deep_kindle' });
  enemy(r, 'rime_wraith', 40, 11, { leash: 5 });
  enemy(r, 'rime_wraith', 100, 10, { leash: 5 });
  enemy(r, 'shard_crawler', 25, 14, { surface: 'floor', range: 5 });
  enemy(r, 'shard_crawler', 60, 9, { surface: 'ceiling', range: 6 });
  // ---- the landmark: drowned forges frozen in the glacier (background, dimmed as if seen through ice)
  deco(r, 'vat', 12, 14, { lit: false, dim: 0.6, layer: 'back' });
  deco(r, 'anvil', 21, 14, { dim: 0.55, layer: 'back' });
  deco(r, 'gear', 31, 14, { spin: false, dim: 0.6, layer: 'back' });
  deco(r, 'mold_stack', 44, 14, { dim: 0.55, layer: 'back' });
  deco(r, 'vat', 57, 14, { lit: false, dim: 0.6, layer: 'back', flip: true });
  deco(r, 'pipe_v', 66, 14, { len: 200, steam: false, dim: 0.6, layer: 'back' });
  deco(r, 'gear', 86, 14, { spin: false, dim: 0.6, layer: 'back', scale: 1.3 });
  deco(r, 'anvil', 94, 14, { dim: 0.5, layer: 'back' });
  deco(r, 'cart', 106, 14, { dim: 0.55, layer: 'back' });
  for (const c of [8, 28, 50, 73, 84, 102]) pilgrim(r, c, 14, { layer: 'back', dim: 0.45 + (c % 3) * 0.08 });
  for (const c of [4, 35, 63, 93, 109]) deco(r, 'ice_spire', c, 14, { layer: 'back', dim: 0.35 });
  deco(r, 'crystal', 15, 14, { color: ICE }); deco(r, 'crystal', 76, 14, { color: FROST }); deco(r, 'crystal', 97, 12, { color: ICE });
  deco(r, 'rubble', 110, 14); deco(r, 'bones', 108, 14);           // drifted snow and remains at the snow wall
  // the secret cave: the kindler, frozen with her hands to a dead wick
  pilgrim(r, 124, 14, { variant: 1, flip: true });
  deco(r, 'candle_cluster', 120, 14, { lit: false }); deco(r, 'crystal', 116, 14, { color: '#ffb070', dim: 0.2 });
  for (const [c, y, f] of [[22, 3, 420], [58, 9, 220], [75, 4, 400], [96, 2, 460], [107, 10, 160]]) deco(r, 'drip', c, y, { fall: f, color: FROST });
  light(r, 122, 12, 4, '#ffa860', 0.45, true);   // the sigil's ember (inside the veiled cave)
  light(r, 111, 13, 3, '#ffa860', 0.6, true);   // ...and a faint warmth leaking through the snow wall (the hint)
  light(r, 80, 2, 5, PALE, 0.3);
  light(r, 24, 9, 7, DEEP, 0.25); light(r, 60, 12, 6, ICE, 0.2); light(r, 96, 8, 7, DEEP, 0.25);
  light(r, 5, 12, 4, ICE, 0.3);
  return done(r, { bgSeed: 161, theme: { bg: 'interior', fog: 1.2, weatherDensity: 0.6 } });
}

// =====================================================================================================
// ri_08 — THE SANCTUM GATE (64x36, gate). E1 (rows 21-23) from Sable's arena; floor top row 24 across cols 10-62.
// THE SEAL DOOR (sealdoor, 3x6, marker col 8 / row 23 -> cols 7-9, rows 18-23) in a solid gold-and-glass frame
// (cols 6-10, rows 0-17); it opens with all three Warden Seals. Behind it a small antechamber (cols 1-6) over the
// S1 shaft (cols 2-5, rows 24-35) down into the Sanctum: dropping in is free; three crystal niches cut into the EAST
// wall (col 6: rows 31-33 over floor 34, rows 27-29 over floor 30, rows 24-25 over floor 26) let a returning player climb
// back without Wax Grip (plan path S1->E1 needs only the seals). QA: they replaced 1-wide knobs in the shaft, which
// caught every player dropping in (holding left lands on a west knob, releasing lands on an east one); a niche in the
// east wall is only entered on purpose (holding right). ONE-WAY SHORTCUT: N1 (cols 20-23) leads up into the Frozen Stair's chute; ri_gate1 (horizontal grate w4 h1,
// opens lever:ri_lv1) at row 2, cols 20-23, framed by solid tiles at cols 18-19 / 24-25 (rows 0-2). Under it one-way
// platforms (tops 20, 16, 12, 8 and 4); the top one is split by the frame (cols 20-23 under the grate, cols 26-28 for
// the lever ri_lv1 at col 27) because a player standing on row 4 is 1.35 tiles tall and the frame reaches down to row
// 2. npc sable stage 2 (only after boss:sable2) at col 30; lore_ri_3 (the Wardens' oath, 'Carved Above the Seal Door') at col 12,
// just east of the door (QA: was at col 36, far from the door its title names; col 12 keeps its Read zone clear of the
// door's Examine zone, cols 6-10). The antechamber's light is a lantern hung from its ceiling (QA: a standing
// candelabra at col 4 stood over the open S1 shaft). No enemies.
// =====================================================================================================
function ri08() {
  const r = RK.room('ri_08');
  air(r, 11, 3, 62, 23);                         // the gate hall
  air(r, 11, 1, 17, 2); air(r, 26, 1, 46, 2);    // the vault (rows 1-2) beside the grate's frame
  air(r, 20, 0, 23, 2);                          // N1 and the grate's slot (the gate entity fills row 2)
  box(r, 47, 3, 62, 5); box(r, 52, 6, 62, 8);    // the vault steps down toward E1
  box(r, 57, 9, 62, 17);                         // ... a heavy lintel block over the east door (rows 9-17)
  // THE SEAL DOOR: frame cols 6-10 rows 0-17 stays solid; the door opening and the antechamber behind it
  air(r, 6, 18, 10, 23);
  air(r, 1, 18, 5, 23);
  air(r, 2, 24, 5, 35);                          // S1: the shaft down into the Sanctum (walls cols 1 / 6, grippable)
  // crystal niches in the east wall (no-grip climb back): floors 34, 30, 26. Baseline QA: one row lower than before
  // (floors 33/29/25) - a player rising in from hs_01 cleared the first niche floor by only 3 px (reach --margin).
  air(r, 6, 31, 6, 33); air(r, 6, 27, 6, 29); air(r, 6, 24, 6, 25);
  // the lever stair: one-way platforms 20, 16, 12, 8, 4
  plat(r, 26, 31, 20); plat(r, 19, 24, 16); plat(r, 26, 31, 12); plat(r, 19, 29, 8);
  plat(r, 20, 23, 4); plat(r, 26, 28, 4);
  r.openExits();
  // ---- contents
  r.put(8, 23, { type: 'sealdoor', id: 'sealdoor' });
  r.put(20, 2, { type: 'gate', id: 'ri_gate1', opens: 'lever:ri_lv1', w: 4, h: 1 });
  r.put(27, 3, { type: 'lever', id: 'ri_lv1' });
  r.put(30, 23, { type: 'npc', npc: 'sable', stage: 2, requires: 'boss:sable2', flip: true });
  r.put(12, 23, { type: 'lore', id: 'lore_ri_3' });   // beside the Seal Door it speaks of
  // ---- dressing: the cold hall of the Rime meets the gold of the Sanctum at the door
  deco(r, 'candelabra', 14, 23, { lit: true, material: 'gold', flame: 'gold' });
  deco(r, 'lantern_hanging', 5, 18, { lit: true, flame: 'gold', len: 40 });   // antechamber: its floor is the S1 shaft
  deco(r, 'statue_waxen', 16, 23, { variant: 1, material: 'gold', dim: 0.2 });
  deco(r, 'banner', 13, 3, { len: 150, color: '#c8a040' }); deco(r, 'banner', 3, 18, { len: 70, color: '#c8a040' });
  for (const c of [42, 49, 55]) pilgrim(r, c, 23, { layer: 'back', dim: 0.4 });
  for (const c of [39, 46, 60]) deco(r, 'ice_spire', c, 23, { layer: 'back', dim: 0.35 });
  deco(r, 'crystal', 33, 23, { color: '#ffd870', dim: 0.15 }); deco(r, 'crystal', 52, 23, { color: ICE });
  deco(r, 'column_broken', 44, 23, { h: 140, dim: 0.4, layer: 'back' });
  deco(r, 'chain', 26, 1, { len: 120 }); deco(r, 'chain', 28, 1, { len: 120 });           // the lever step
  deco(r, 'chain', 29, 1, { len: 280 }); deco(r, 'chain', 17, 1, { len: 280 });           // p8
  deco(r, 'chain', 31, 1, { len: 440 }); deco(r, 'chain', 26, 9, { len: 120 });           // p12
  deco(r, 'chain', 19, 9, { len: 280 }); deco(r, 'chain', 24, 9, { len: 280 });           // p16
  deco(r, 'chain', 31, 13, { len: 280 }); deco(r, 'chain', 26, 13, { len: 280 });         // p20
  for (const [c, y, f] of [[36, 1, 820], [50, 6, 640], [58, 18, 200]]) deco(r, 'drip', c, y, { fall: f, color: FROST });
  light(r, 8, 20, 6, '#ffe6a0', 0.55);           // light leaking around the seal door
  light(r, 3, 28, 5, '#ffd870', 0.5);            // gold light rising from the Sanctum shaft
  light(r, 14, 21, 3, '#ffd870', 0.4, true); light(r, 5, 20, 3, '#ffd870', 0.4, true);
  light(r, 22, 2, 4, PALE, 0.25);                // the cold of the chute above the grate
  light(r, 27, 2, 3, ICE, 0.3);                  // the lever
  light(r, 36, 21, 3, ICE, 0.3);                 // cold glow over the hall (by the gold crystal at 33)
  light(r, 50, 16, 8, STEEL, 0.25);
  return done(r, { bgSeed: 181, theme: { bg: 'interior', fog: 1.0 }, dark: 0.5 });
}

// =====================================================================================================
const builders = { ri01, ri02, ri03, ri04, ri05, ri06, ri08 };
const only = process.argv.slice(2).filter((a) => !a.startsWith('--'));
for (const [name, fn] of Object.entries(builders)) {
  const r = fn();
  if (process.argv.includes('--print') && (!only.length || only.includes(name) || only.includes(r.id))) {
    let hdr = '   '; for (let x = 0; x < r.w; x++) hdr += x % 10;
    console.log('\n' + r.id + '\n' + hdr + '\n' + r.ascii().split('\n').map((l, i) => String(i).padStart(2) + ' ' + l).join('\n'));
  }
}
const out = RK.emit('rime', defs, path.join('src', 'data', 'regions', 'rime.js'),
  'THE RIME (region builder: region-rime_sanctum). Arena ri_07 lives in src/data/arenas/sable2.js');
console.log('wrote ' + path.relative(path.resolve(__dirname, '../..'), out) + ' (' + defs.length + ' rooms)');
