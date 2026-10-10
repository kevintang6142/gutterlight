#!/usr/bin/env node
// tools/gen/guttered.js — generator for the Guttered Ways (region builder: region-guttered).
// Builds every NON-arena room of region 'guttered' with tools/lib/roomkit.js exactly to design/world_plan.json
// and emits src/data/regions/guttered.js. Never hand-edit the emitted file: edit this, then re-run:
//   node tools/gen/guttered.js [--print]        (--print dumps every room as ASCII)
// Coordinates: x = column, y = row (room-local, 0-based). Helpers below take INCLUSIVE rectangles.
'use strict';
const path = require('path');
const RK = require('../lib/roomkit');
// Guard: roomkit's put() silently replaces whatever marker is already on the tile (an enemy once overwrote the
// gw_03 lore stone this way). Every marker must land on its own empty tile.
const _room = RK.room;
RK.room = function (id) {
  const r = _room.apply(this, arguments);
  const put = r.put.bind(r);
  r.put = (x, y, props) => {
    const ch = r.get(x, y);
    if (ch !== '.') throw new Error(id + ': marker ' + JSON.stringify(props) + ' at ' + x + ',' + y + ' lands on "' + ch + '" (occupied or solid)');
    return put(x, y, props);
  };
  return r;
};

// ------------------------------------------------------------------ helpers
const box = (r, x0, y0, x1, y1, ch = '#') => r.fill(x0, y0, x1 - x0 + 1, y1 - y0 + 1, ch);
const air = (r, x0, y0, x1, y1) => box(r, x0, y0, x1, y1, '.');
const plat = (r, x0, x1, y) => r.platform(x0, y, x1 - x0 + 1);
const deco = (r, kind, x, y, o) => r.add(Object.assign({ type: 'decor', kind, x, y }, o || {}));
const light = (r, x, y, rad, color, intensity, flicker) => r.add({ type: 'light', x, y, r: rad, color, intensity, flicker: !!flicker });
const enemy = (r, kind, x, y, o) => r.put(x, y, Object.assign({ type: 'enemy', kind }, o || {}));
// Secret pockets behind B walls / D floors are veiled automatically by the engine (G.World.hiddenPockets + art).
/** Round off a rectangular cavity's corners with a diagonal of solid (size n tiles). corner: 'tl','tr','bl','br'. */
function corner(r, x, y, n, which) {
  for (let i = 0; i < n; i++) {
    for (let j = 0; j < n - i; j++) {
      const cx = which[1] === 'l' ? x + j : x - j;
      const cy = which[0] === 't' ? y + i : y - i;
      r.set(cx, cy, '#');
    }
  }
}
const AMBER = '#ffb45a', DAY = '#d6dcea', CANDLE = '#ffc070', EMBER = '#ff7a30';

// Decor support self-check (QA regression: gw_02 lanterns / gw_07 bell hung 40 px under the rock, a gw_03 signpost
// stood over the S1 pit). Ceiling-anchored props (anchor 'top' in src/art/props.js) hang from the tile above their
// cell; every other prop stands on the tile below. Either way the prop's own cell must be open.
const HANGING = new Set(['banner', 'bell_great', 'bell_small', 'cage_hanging', 'chain', 'cocoon', 'vine_curtain',
  'lantern_hanging', 'web', 'drip', 'ladle']);
const SOLID = '#XBD:';
const badDecor = [];
function checkDecor(r) {
  const bad = badDecor;
  for (const e of r.entities) {
    if (e.type !== 'decor') continue;
    const here = r.get(e.x, e.y), hang = HANGING.has(e.kind);
    const sup = hang ? r.get(e.x, e.y - 1) : r.get(e.x, e.y + 1);
    if ('#XBD:=^~%'.includes(here)) bad.push(`${r.id}: ${e.kind} at ${e.x},${e.y} is buried in tile '${here}'`);
    else if (!(SOLID + '=').includes(sup)) bad.push(`${r.id}: ${e.kind} at ${e.x},${e.y} has no ${hang ? 'ceiling above' : 'floor below'} (tile '${sup}')`);
  }
}

const defs = [];
const done = (r, extra) => { checkDecor(r); defs.push(r.toDef(extra)); return r; };

// =====================================================================================================
// gw_01 — The Well (32x36): brick shaft down from Lastlight; zig-zag one-way platforms (climbable with no
// abilities); round bottom chamber (W1 -> Bolt shrine, E2 -> Hall); SECRET ledge + B wall -> E1 (Alcove).
// =====================================================================================================
function gw01() {
  const r = RK.room('gw_01');
  air(r, 4, 1, 27, 23);                  // the shaft
  corner(r, 4, 1, 3, 'tl'); corner(r, 27, 1, 3, 'tr');
  air(r, 11, 0, 20, 0); box(r, 11, 0, 13, 0); box(r, 18, 0, 20, 0);   // neck under N1 (N1 itself opened below)
  air(r, 1, 24, 30, 32);                 // the round bottom chamber, floor top row 33
  corner(r, 1, 24, 3, 'tl'); corner(r, 30, 24, 3, 'tr');
  box(r, 1, 23, 3, 23); box(r, 28, 23, 30, 23);
  // shaft lip where it meets the chamber (masonry ring)
  box(r, 4, 23, 5, 23); box(r, 26, 23, 27, 23);
  // SECRET: ledge in front of a cracked wall hiding E1 (-> The Chandler's Alcove)
  box(r, 22, 15, 27, 16);                // the ledge (top row 15, cols 22-30 incl. the recess floor)
  air(r, 28, 12, 28, 14);                // shallow recess
  box(r, 29, 12, 30, 14, 'B');           // breakable wall
  // zig-zag one-way platforms (<= 4 rows between tops)
  plat(r, 19, 25, 30);
  plat(r, 9, 15, 26);
  plat(r, 16, 22, 22);
  plat(r, 11, 17, 18);
  plat(r, 5, 10, 14);
  plat(r, 12, 17, 10);
  plat(r, 6, 11, 7);
  plat(r, 13, 18, 4);                    // directly under N1: a full jump carries the player up and out
  r.openExits();
  // contents
  r.put(7, 32, { type: 'lore', id: 'lore_gw_1' });
  enemy(r, 'drip_fly', 24, 25);
  enemy(r, 'drip_fly', 7, 20);
  // dressing: daylight falling from Lastlight, the chamber's candles and bones
  for (const y of [2, 9, 16, 24, 31]) light(r, 15, y, 4.5, DAY, 0.28);
  deco(r, 'candle_cluster', 4, 32, { lit: true });
  deco(r, 'wick_grave', 11, 32);
  deco(r, 'bones', 21, 32);
  deco(r, 'signpost', 26, 32, { flip: true });
  deco(r, 'chain', 8, 1, { len: 150, hook: true, layer: 'back' });
  deco(r, 'chain', 23, 1, { len: 220, layer: 'back' });
  deco(r, 'rubble', 25, 14);
  light(r, 4, 31, 3, CANDLE, 0.5, true);
  return done(r, { theme: { bg: 'shaft' }, bgSeed: 1 });
}

// =====================================================================================================
// gw_02 — Hall of Dead Sconces (96x18): the region's signature hall. Vaulted ceiling with arch springers every
// 12 cols, rows of dead sconces, three walkers and a drip fly. N1 is a ceiling hole 12+ tiles up (one-way drop
// from the secret Alcove, unreachable from here). S1 drops to the Drip Galleries (landing dips at row 16).
// =====================================================================================================
function gw02() {
  const r = RK.room('gw_02');
  air(r, 1, 3, 94, 14);
  for (let c = 12; c <= 84; c += 12) {         // arch springers hanging from the vault
    box(r, c - 3, 3, c + 2, 3); box(r, c - 1, 4, c, 4);   // short: nothing grippable within wings reach of N1
  }
  air(r, 40, 0, 43, 2);                        // N1: the Alcove's floor hole above
  // geode alcove sunk into the floor near col 20
  air(r, 18, 15, 22, 16);
  // S1 hole + landing dips (floor top row 16 for 3 cols each side)
  air(r, 73, 15, 82, 15); air(r, 76, 15, 79, 17);
  r.openExits();
  r.put(20, 16, { type: 'geode', id: 'gw_geo1', amount: 60 });
  r.put(60, 14, { type: 'lore', id: 'lore_gw_2' });
  enemy(r, 'snuffed_walker', 30, 14, { facing: 'left' });
  enemy(r, 'snuffed_walker', 51, 14);
  enemy(r, 'snuffed_walker', 66, 14, { facing: 'left' });
  enemy(r, 'drip_fly', 24, 8);                 // clear of the N1 drop column (players fall 15 tiles from the Alcove at cols 40-43)
  // two rows of dead sconces: iron posts along the floor, dead lanterns hanging from each springer
  for (let c = 6; c <= 90; c += 6) {
    if ((c >= 17 && c <= 23) || (c >= 72 && c <= 83) || c === 60) continue;
    deco(r, 'sconce_dead', c, 14, { lit: c === 54 });
  }
  // ... and the second row behind it, set back in the gloom (smaller, dimmer, between the front posts)
  for (let c = 9; c <= 87; c += 6) {
    if ((c >= 16 && c <= 24) || (c >= 71 && c <= 84) || (c >= 58 && c <= 62)) continue;
    deco(r, 'sconce_dead', c, 14, { layer: 'back', scale: 0.78, dim: 0.45 });
  }
  // dead lanterns chained to the springer knuckles (knuckle bottom = top of row 5; len 58 keeps the cage at y 258)
  for (let c = 12; c <= 84; c += 12) deco(r, 'lantern_hanging', c, 5, { lit: false, len: 58 });
  for (const c of [18, 30, 66, 90]) deco(r, 'banner', c, 3, { torn: true, len: 120, dim: 0.25 });
  deco(r, 'statue_waxen', 36, 14, { variant: 1, dim: 0.35 });
  deco(r, 'candle_cluster', 58, 14, { lit: true });
  deco(r, 'candle_cluster', 62, 14, { lit: false });
  deco(r, 'bones', 25, 14);
  deco(r, 'rubble', 70, 14);
  light(r, 54, 13, 3.5, CANDLE, 0.55, true);
  light(r, 60, 12, 3, CANDLE, 0.45, true);
  light(r, 41, 1, 3.5, DAY, 0.18);
  return done(r, { theme: { bg: 'interior' }, bgSeed: 2 });
}

// =====================================================================================================
// gw_03 — Lantern Crossroads (64x27): HUB. Upper road (row 15: W1 Hall <-> E1 Bridge) under a huge dead
// lantern-frame; a drop hole in the middle leads to the lower road (row 24: W2 Drip Galleries, S1 Wren's
// Hollow). One-way platforms under the hole climb back up; a west stair (rows 11, 7, 4) rises to N1.
// =====================================================================================================
function gw03() {
  const r = RK.room('gw_03');
  air(r, 1, 1, 62, 14);                          // upper hall
  corner(r, 1, 1, 3, 'tl'); corner(r, 62, 1, 4, 'tr');
  air(r, 6, 0, 9, 0);
  air(r, 1, 17, 62, 23);                         // lower road
  corner(r, 1, 17, 2, 'tl'); corner(r, 62, 17, 2, 'tr');
  air(r, 36, 15, 40, 16);                        // the drop hole through the upper road
  air(r, 31, 16, 40, 16);                        // the slab thins to one row west of it: 2 tiles of headroom over row 18
  plat(r, 33, 40, 18); plat(r, 27, 31, 21);      // climb back up through it; walk off the upper one westward
                                                 // (its east end is shut by the slab: S1's hole lies just east)
  air(r, 41, 24, 50, 24); air(r, 44, 24, 47, 26); // S1 hole + landing dips (floor top row 25)
  // west stair to N1 (Sable's Perch)
  plat(r, 3, 8, 11); plat(r, 10, 14, 7); plat(r, 5, 10, 4);
  r.openExits();
  r.put(29, 14, { type: 'lanternway', id: 'guttered' });
  r.put(19, 14, { type: 'lore', id: 'lore_gw_3' });
  // Both hub enemies stay on the upper road within sight of the Lanternway post, and their patrols stay >= 13 tiles
  // from it: travel is refused with a hostile within 12 tiles (baseline QA: the crawler used to patrol cols 15-21 and
  // came within 10 tiles of a player standing at the post).
  enemy(r, 'snuffed_lancer', 46, 14, { facing: 'left', range: 3 });
  enemy(r, 'wick_crawler', 12, 14, { range: 3 });
  // the landmark: a colossal dead lantern-frame hanging over the crossroads; signposts at the fork
  deco(r, 'lantern_hanging', 33, 1, { lit: false, scale: 3, len: 60 });
  deco(r, 'chain', 27, 1, { len: 150, layer: 'back' });
  deco(r, 'chain', 39, 1, { len: 150, layer: 'back' });
  deco(r, 'signpost', 24, 14);
  deco(r, 'signpost', 39, 23, { flip: true });   // on the road at the brink of the S1 dip (cols 41-50)
  deco(r, 'sconce_dead', 15, 14); deco(r, 'sconce_dead', 46, 14); deco(r, 'sconce_dead', 57, 14);
  deco(r, 'candle_cluster', 32, 14, { lit: true });
  deco(r, 'cart', 10, 23);
  deco(r, 'rubble', 55, 23); deco(r, 'bones', 28, 23);
  deco(r, 'column_broken', 4, 23, { dim: 0.3 });
  light(r, 29, 12, 5, AMBER, 0.45, true);
  light(r, 32, 13, 3, CANDLE, 0.4, true);
  return done(r, { theme: { bg: 'open' }, bgSeed: 3 });
}

// =====================================================================================================
// gw_04 — Shrine of the Kindled Bolt (64x18): a small brick chapel, sanctuary before the Effigy (no enemies).
// Bolt shrine under a skylight at col 34, gw_sconce_a at col 46, a heavy stone arch west into the Old Guard's
// Hall, S1 hole down to the Wickworm Tunnels (landing ledges at row 16).
// =====================================================================================================
function gw04() {
  const r = RK.room('gw_04');
  air(r, 5, 4, 58, 14);                          // the chapel
  corner(r, 5, 4, 3, 'tl'); corner(r, 58, 4, 3, 'tr');
  air(r, 31, 1, 37, 3); corner(r, 31, 1, 2, 'tl'); corner(r, 37, 1, 2, 'tr');   // skylight shaft
  air(r, 1, 11, 4, 14);                          // west doorway: heavy arch into the Old Guard's Hall
  r.set(4, 11, '#');
  air(r, 59, 11, 62, 14); r.set(59, 11, '#');    // east door to the Well
  air(r, 21, 15, 30, 15); air(r, 24, 15, 27, 17);   // S1 hole + landing dips
  r.openExits();
  r.put(34, 14, { type: 'shrine', ability: 'bolt' });
  r.put(46, 14, { type: 'sconce', id: 'gw_sconce_a' });
  light(r, 46, 12, 4, CANDLE, 0.5, true);
  light(r, 34, 2, 4, DAY, 0.4);
  light(r, 34, 8, 4, '#bfe4ff', 0.25);
  deco(r, 'candelabra', 31, 14, { lit: true }); deco(r, 'candelabra', 37, 14, { lit: true, flip: true });   // col 30 is over the S1 dip
  deco(r, 'candle_cluster', 32, 14, { lit: true }); deco(r, 'candle_cluster', 36, 14, { lit: true, count: 4 });
  deco(r, 'statue_waxen', 15, 14, { variant: 1, dim: 0.3 });
  deco(r, 'statue_waxen', 53, 14, { variant: 0, dim: 0.3, flip: true });
  deco(r, 'banner', 10, 4, { len: 110, dim: 0.2 }); deco(r, 'banner', 53, 4, { len: 110, dim: 0.2 });   // mirrors col 10 (col 56 is inside the vault corner)
  deco(r, 'arch', 3, 14, { layer: 'back', dim: 0.2 });
  deco(r, 'sconce_dead', 42, 14); deco(r, 'sconce_dead', 50, 14);
  return done(r, { theme: { bg: 'interior' }, bgSeed: 4 });
}

// =====================================================================================================
// gw_06 — The Broken Bridge (64x27): DASH GATE to the Sootflue. Deck top row 15 (rows 15-17) on arched piers;
// collapsed between cols 26 and 34: a 9-tile gap at equal height over a 9-deep chasm with a spike bed (row
// 24). Chasm walls GLAZED. The arches under the deck are sealed voids (scenery only).
// =====================================================================================================
function gw06() {
  const r = RK.room('gw_06');
  air(r, 1, 3, 62, 14);                          // the cavern over the bridge
  air(r, 8, 1, 55, 2);                           // high vault
  corner(r, 1, 3, 3, 'tl'); corner(r, 62, 3, 3, 'tr');
  for (const [c, h] of [[12, 2], [18, 1], [44, 2], [50, 1]]) box(r, c, 3, c + 1, 2 + h);   // stalactite knuckles
  // chasm
  air(r, 26, 15, 34, 23);                       // 9-tile gap (critical path: dash gaps are 9, 10 only for optional rewards)
  box(r, 26, 24, 34, 24, '^');
  box(r, 25, 15, 25, 23, 'X'); box(r, 35, 15, 35, 23, 'X');
  r.add({ type: 'event', script: 'gw_abyss', x: 26, y: 15, z: -15, c0: 26, c1: 34, r0: 15, r1: 21 });   // reads as a void
  // sealed arches under the deck (scenery: the bridge reads as a bridge)
  for (const [x0, x1] of [[3, 10], [14, 22], [39, 47], [51, 59]]) {
    air(r, x0, 19, x1, 23); air(r, x0 + 1, 18, x1 - 1, 18);
  }
  r.openExits();
  enemy(r, 'drip_fly', 28, 8);
  enemy(r, 'drip_fly', 33, 10);
  // hazard respawns a few tiles back from each lip (trigger boxes end exactly at the deck ends, so a fall can
  // never put the player on the far side): a failed jump restarts on solid footing, not half over the chasm
  r.add({ type: 'respawn', x: 21, y: 14, w: 9, h: 4 });
  r.add({ type: 'respawn', x: 39, y: 14, w: 9, h: 4 });
  // broken balustrade / rubble at the broken ends, the Flue's ember glow from the east
  deco(r, 'column_broken', 23, 14, { h: 70 }); deco(r, 'column_broken', 38, 14, { h: 55, flip: true });
  deco(r, 'rubble', 20, 14); deco(r, 'rubble', 40, 14);
  deco(r, 'sconce_dead', 6, 14); deco(r, 'sconce_dead', 14, 14); deco(r, 'sconce_dead', 46, 14); deco(r, 'sconce_dead', 54, 14);
  deco(r, 'brazier', 59, 14, { lit: true });
  light(r, 62, 12, 9, EMBER, 0.45, true);
  light(r, 50, 6, 7, EMBER, 0.18, true);
  light(r, 31, 22, 5, '#ff9a50', 0.12, true);
  return done(r, { theme: { bg: 'open', fog: 1.3 }, bgSeed: 6 });
}

// =====================================================================================================
// gw_07 — Sable's Perch (96x18): the broken top of an old belfry. Sable glimpse on a high beam (row 4, cols
// 70-76). WINGS reward: a glazed ledge (cols 84-94, top row 8, 7 up) with gw_geo3. SECRET: B wall (cols 2-3)
// hides W1 -> the Chandler's Alcove. S1 hole down to the Crossroads (landing dips at row 16).
// =====================================================================================================
function gw07() {
  const r = RK.room('gw_07');
  air(r, 4, 2, 94, 14);
  air(r, 1, 12, 3, 14);
  box(r, 2, 12, 3, 14, 'B');
  for (const [c, w, d] of [[14, 3, 1], [30, 2, 2], [47, 4, 1], [63, 2, 1], [80, 3, 2]]) box(r, c, 2, c + w - 1, 1 + d);   // broken roof
  air(r, 66, 1, 79, 1);                          // the roof is open over the beam (a crack of sky)
  // broken masonry floor: 1-tile bumps (none near the wings ledge)
  for (const [c, w] of [[9, 3], [26, 2], [57, 4]]) box(r, c, 14, c + w - 1, 14);
  // S1 + landing dips
  air(r, 35, 15, 44, 15); air(r, 38, 15, 41, 17);
  // Sable's beam (unreachable): a wooden crossbeam slung from the roof
  plat(r, 70, 76, 4);
  // WINGS reward ledge: glazed west face, attached to the east wall
  box(r, 84, 8, 94, 14); box(r, 84, 8, 84, 14, 'X');
  r.openExits();
  r.put(73, 3, { type: 'npc', npc: 'sable', stage: 1, range: 10 });
  r.put(52, 14, { type: 'lore', id: 'lore_gw_4' });
  r.put(88, 7, { type: 'geode', id: 'gw_geo3', amount: 90 });
  enemy(r, 'snuffed_lancer', 20, 14, { facing: 'right', range: 4 });
  enemy(r, 'snuffed_lancer', 66, 14, { facing: 'left', range: 4 });
  deco(r, 'bell_great', 47, 3, { len: 40 });   // chained to the roof knuckle (cols 47-50, bottom = top of row 3)
  deco(r, 'chain', 30, 4, { len: 90 }); deco(r, 'chain', 63, 3, { len: 70, hook: true });
  deco(r, 'arch', 34, 14, { layer: 'back', broken: true, dim: 0.35 });
  deco(r, 'arch', 78, 14, { layer: 'back', broken: true, dim: 0.35, flip: true });
  deco(r, 'column_broken', 6, 14, { h: 80 }); deco(r, 'rubble', 15, 14); deco(r, 'rubble', 48, 14); deco(r, 'bones', 72, 14);
  deco(r, 'sconce_dead', 45, 14); deco(r, 'sconce_dead', 61, 14);   // col 44 is over the S1 dip
  deco(r, 'statue_waxen', 92, 7, { variant: 2, dim: 0.2, flip: true });
  light(r, 73, 1, 6, DAY, 0.35);
  light(r, 73, 6, 3, DAY, 0.2);
  light(r, 88, 6, 3, AMBER, 0.3, true);
  return done(r, { theme: { bg: 'open' }, bgSeed: 7 });
}

// =====================================================================================================
// gw_08 — Drip Galleries (64x27): cave junction of wax stalactites and pale pools, five exits on many
// levels, all connected without abilities. OILCLOAK reward: a meltwater pool under a 2-tile vault (cols 18-31)
// leads to a dry pocket with gw_geo2.
// =====================================================================================================
function gw08() {
  const r = RK.room('gw_08');
  air(r, 17, 1, 62, 17);                         // the main cavern (above the vault plateau, row 18)
  air(r, 1, 10, 16, 14);                         // W1 corridor (ledge top row 15, cols 1-8)
  air(r, 9, 15, 16, 24); air(r, 7, 19, 8, 24);   // the S1 shaft (floor top row 25 around the hole)
  air(r, 10, 25, 13, 26);
  plat(r, 12, 15, 18); plat(r, 9, 12, 21);       // shaft climb: row 25 -> 21 -> 18 -> ledge 15 / plateau 18
  // the oil pool under a low vault, the dry pocket behind it
  air(r, 17, 20, 35, 21);
  box(r, 18, 22, 31, 24, '~');
  // east lower floor (E2) + a step back up to the plateau
  air(r, 38, 18, 62, 23); box(r, 38, 21, 40, 23);
  // east climb: bottom 24 -> 20 -> 16 -> 12 -> 9 -> E1 shelf 6 -> N1 platform 4
  box(r, 42, 20, 46, 20); plat(r, 48, 52, 16); box(r, 42, 12, 46, 12); plat(r, 48, 51, 9);
  box(r, 53, 6, 62, 8);
  plat(r, 43, 48, 4);
  // wax stalactites from the cavern roof
  for (const [c, d] of [[21, 2], [27, 3], [33, 1], [38, 2], [56, 2]]) box(r, c, 1, c, d);
  r.openExits();
  r.put(33, 21, { type: 'geode', id: 'gw_geo2', amount: 100 });
  enemy(r, 'drip_fly', 30, 9);
  enemy(r, 'drip_fly', 40, 6);
  enemy(r, 'wick_crawler', 52, 23);
  enemy(r, 'wick_crawler', 26, 17);
  deco(r, 'stalagmite', 20, 17, { h: 50 }); deco(r, 'stalagmite', 35, 17, { h: 70 }); deco(r, 'stalagmite', 58, 23, { h: 40 });
  for (const c of [19, 23, 28, 30]) deco(r, 'drip', c, 20, { fall: 60, color: '#d8c4a0' });
  deco(r, 'mushroom_glow', 33, 21, { color: '#eaa84a' });
  deco(r, 'mushroom_glow', 44, 23); deco(r, 'mushroom_glow', 15, 24);
  deco(r, 'bones', 49, 23); deco(r, 'web', 12, 10);   // under the W1 corridor ceiling
  light(r, 25, 21, 4, '#b8d8a0', 0.25);
  light(r, 34, 20, 2.5, AMBER, 0.35, true);
  light(r, 12, 24, 3, '#9fc8d8', 0.2);
  return done(r, { theme: { bg: 'open' }, bgSeed: 8 });
}

// =====================================================================================================
// gw_09 — Wren's Hollow (64x27): a sheltered camp. Wren (stage 1) by her fire, gw_sconce_b. N1 drop-in with a
// platform at row 4 and ledges down. SECRET: a cracked wall above the tent's overhang hides the Ember Thirst
// niche. DASH reward: across a 10-tile glazed crack with spikes 10 down, gw_hw1 on a ledge under the rock.
// =====================================================================================================
function gw09() {
  const r = RK.room('gw_09');
  air(r, 10, 3, 47, 14);                         // the hollow
  corner(r, 10, 3, 3, 'tl');
  air(r, 44, 0, 47, 2);                          // N1 chimney
  air(r, 1, 12, 9, 14);                          // W1 corridor
  box(r, 10, 11, 15, 11);                        // rock overhang continuing the corridor roof (top row 11)
  air(r, 2, 8, 7, 10); box(r, 8, 8, 9, 10, 'B'); // SECRET niche (6x3) behind a breakable wall
  air(r, 10, 8, 10, 10);
  // platforms from N1 down to the camp
  plat(r, 41, 47, 4); plat(r, 39, 42, 8); box(r, 33, 12, 37, 12);
  // the crack (DASH gap) and the heartwax ledge under the overhanging rock (rock bottom row 9)
  air(r, 47, 8, 61, 14);                         // rock bottom row 7: headroom for the dash-jump arc
  air(r, 47, 15, 56, 24); box(r, 47, 25, 56, 25, '^');
  box(r, 46, 15, 46, 24, 'X'); box(r, 57, 15, 57, 24, 'X');
  r.add({ type: 'event', script: 'gw_abyss', x: 47, y: 15, z: -15, c0: 47, c1: 56, r0: 15, r1: 22 });
  r.openExits();
  r.put(20, 14, { type: 'npc', npc: 'wren', stage: 1, requires: '!flag:wren_met_2' });   // (baseline QA) she moves on once met in the Nave (text.md)
  r.put(30, 14, { type: 'sconce', id: 'gw_sconce_b' });
  r.put(4, 10, { type: 'pickup', item: 'sigil', sigil: 'ember_thirst', id: 'gw_sig_ember_thirst' });
  r.put(59, 14, { type: 'pickup', item: 'heartwax', id: 'gw_hw1' });
  enemy(r, 'wick_crawler', 42, 14, { facing: 'right', range: 5.5 });
  r.add({ type: 'respawn', x: 41, y: 14, w: 11, h: 4 });   // camp side: box ends at the lip (col 46)
  r.add({ type: 'respawn', x: 59, y: 14, w: 5, h: 4 });    // ledge side: box starts at the ledge (col 57)   // guards the crack's lip (beat cols 37-47 + the crack wall)
  r.add({ type: 'event', script: 'gw_tent', x: 13, y: 14, z: -6 });
  light(r, 17, 14, 4.5, '#ffa850', 0.75, true);
  r.add({ type: 'light', x: 17, y: 14, r: 0.5, color: '#ffa850', intensity: 0, flame: 'orange', size: 18 });
  light(r, 30, 12, 3.5, CANDLE, 0.45, true);
  deco(r, 'crate', 24, 14); deco(r, 'crate', 25, 14, { variant: 1 });
  deco(r, 'candle_cluster', 35, 14, { lit: true });
  deco(r, 'mushroom_glow', 44, 14); deco(r, 'mushroom_glow', 12, 10);
  deco(r, 'bones', 5, 10);
  light(r, 59, 13, 3, '#ffb0b0', 0.3);
  return done(r, { theme: { bg: 'open' }, bgSeed: 9 });
}

// =====================================================================================================
// gw_10 — The Descent Lip (64x18): GRIP GATE to the Drowned Nave. West floor (row 15) under N1's stair; a
// SHEER 10-tile wall (col 31) up to a plateau (top row 5); beyond it a pit (cols 41-50) down to S1. Free climb
// out of the pit (side platforms) for players rising from the Nave; a hanging rock shields the plateau.
// =====================================================================================================
function gw10() {
  const r = RK.room('gw_10');
  air(r, 1, 1, 30, 14);                          // west hall
  corner(r, 1, 1, 3, 'tl');
  box(r, 19, 1, 22, 8); box(r, 20, 9, 21, 9);   // hanging rock (shields the plateau from the N1 stair)
  air(r, 23, 1, 50, 4);                          // headroom over the plateau
  air(r, 41, 5, 50, 16);                         // the pit
  // pit floor: landing ledges (top row 16) each side of S1. Baseline QA: they were at top row 15 (3 rows above the
  // bottom edge), where the exit boost of a player rising from the Nave cleared the lip by only 3 px (reach --margin).
  box(r, 41, 16, 43, 16); box(r, 48, 16, 50, 16); air(r, 44, 15, 47, 16);
  plat(r, 47, 50, 12); plat(r, 41, 44, 9);       // free climb out of the pit
  // N1 stair: floor 15 -> 12 -> 8 -> 4 (under N1)
  plat(r, 13, 17, 12); plat(r, 5, 10, 8); plat(r, 9, 14, 4);
  r.openExits();
  r.put(27, 14, { type: 'lore', id: 'lore_gw_5' });
  r.add({ type: 'event', script: 'gw_waxwall', x: 30, y: 14, z: -5, faceW: 10, faceH: 10 });   // the landmark: wax poured over the sheer face
  enemy(r, 'snuffed_walker', 16, 14, { facing: 'right' });
  for (const c of [32, 35, 38]) deco(r, 'drip', c, 1, { fall: 150, color: '#d8c4a0' });
  deco(r, 'wick_grave', 24, 14); deco(r, 'bones', 7, 14); deco(r, 'rubble', 29, 14);
  deco(r, 'chain', 44, 1, { len: 120, hook: true, layer: 'back' });
  light(r, 45, 14, 5, '#7fb8c8', 0.3);
  light(r, 36, 3, 3, '#7fb8c8', 0.15);
  light(r, 30, 9, 4, '#f0c890', 0.22, true);           // warm glint on the wax face
  // no rain particles inside the cave: the Nave's rain is heard rising out of the pit (ambience), not seen
  return done(r, { theme: { bg: 'open', weather: [{ kind: 'motes', count: 50, color: '#f0d098' }] }, bgSeed: 10, ambience: 'rain' });
}

// =====================================================================================================
// gw_11 — Wickworm Tunnels (160x18): long low tunnels bored by wickworms. Main floor row 15. West end: steps up
// to a shelf (row 9) whose cracked D floor hides the spark_gw vault (PLUNGE). East: a wormhole gallery with a
// 10-tile gap from a ledge (row 9) to a glazed shelf holding gw_geo4 (DASH / WINGS).
// =====================================================================================================
function gw11() {
  const r = RK.room('gw_11');
  air(r, 30, 10, 158, 14);                       // the main tunnel (ceiling row 9)
  // undulation: ceiling bulges and floor bumps
  for (const [c, w] of [[38, 4], [70, 3], [88, 5], [146, 4]]) box(r, c, 10, c + w - 1, 10);
  for (const [c, w] of [[44, 3], [78, 4], [134, 3]]) box(r, c, 14, c + w - 1, 14);
  // west end: steps up to the shelf; the sealed vault beneath
  air(r, 1, 3, 29, 8); air(r, 26, 9, 29, 11);
  box(r, 26, 12, 29, 14);                        // 3-tile step (top row 12)
  air(r, 3, 11, 20, 15);                         // the vault (floor top row 16)
  box(r, 8, 9, 13, 10, 'D');                     // cracked floor (PLUNGE)
  plat(r, 12, 15, 13);                           // climb-out platform beside the hole
  corner(r, 1, 3, 2, 'tl');
  // N1 shaft up to the Bolt shrine: platforms tops rows 12, 8, 4 (the last under N1)
  air(r, 51, 1, 63, 9);
  plat(r, 51, 55, 12); plat(r, 58, 62, 8); plat(r, 55, 60, 4);
  // wormhole gallery (cols 96-140): step, ledge (row 9), 10-tile gap, glazed shelf (row 9) with gw_geo4
  air(r, 96, 2, 140, 9); corner(r, 96, 2, 3, 'tl'); corner(r, 140, 2, 3, 'tr');
  box(r, 98, 12, 101, 14);                       // 3-tile step
  box(r, 104, 9, 108, 10); box(r, 108, 9, 108, 10, 'X');
  box(r, 119, 9, 124, 10); box(r, 119, 9, 119, 10, 'X'); box(r, 124, 9, 124, 10, 'X');
  r.openExits();
  r.put(5, 15, { type: 'pickup', item: 'spark', id: 'spark_gw' });
  r.put(121, 8, { type: 'geode', id: 'gw_geo4', amount: 110 });
  enemy(r, 'wick_crawler', 40, 13);
  enemy(r, 'wick_crawler', 75, 10, { surface: 'ceiling' });
  enemy(r, 'wick_crawler', 128, 14);
  enemy(r, 'snuffed_walker', 86, 14);
  enemy(r, 'snuffed_walker', 141, 14, { facing: 'left' });
  deco(r, 'altar', 5, 15, { lit: true, flame: 'blue' });
  light(r, 5, 13, 3.5, '#9fd8ff', 0.4, true);
  deco(r, 'bones', 17, 15);
  light(r, 10, 8, 2.5, AMBER, 0.25, true);
  for (const c of [36, 67, 143]) deco(r, 'web', c, 10);     // under the tunnel ceiling (row 9)
  deco(r, 'web', 90, 11); deco(r, 'web', 106, 11);       // under the col 88-92 bulge and the col 104-108 ledge
  for (const c of [48, 66, 104, 115, 138, 152]) deco(r, 'stalagmite', c, 14, { h: 40 });
  deco(r, 'mushroom_glow', 58, 14); deco(r, 'mushroom_glow', 99, 11); deco(r, 'mushroom_glow', 121, 8, { dim: 0.2 });
  deco(r, 'candle_cluster', 22, 8, { lit: true });
  light(r, 22, 7, 3, CANDLE, 0.4, true);
  light(r, 57, 3, 3.5, DAY, 0.2);
  light(r, 114, 4, 6, AMBER, 0.15);
  return done(r, { theme: { bg: 'interior', weatherDensity: 0.5 }, bgSeed: 11 });
}

// =====================================================================================================
// gw_12 — The Chandler's Alcove (64x18): SECRET room. A faded mural of the many-handed maker; the hidden Wax
// Notch on a plinth (col 30); a fenced floor hole (S1) drops into the Hall of Dead Sconces (one-way).
// =====================================================================================================
function gw12() {
  const r = RK.room('gw_12');
  air(r, 1, 5, 62, 14);
  air(r, 8, 2, 44, 4); corner(r, 8, 2, 3, 'tl'); corner(r, 44, 2, 3, 'tr');   // vault over the mural
  box(r, 29, 14, 31, 14);                        // the plinth
  box(r, 38, 14, 38, 14); box(r, 45, 14, 45, 14);   // low lips fencing the hole
  air(r, 40, 15, 43, 17);
  r.openExits();
  r.put(30, 13, { type: 'pickup', item: 'notch', id: 'gw_notch' });
  r.add({ type: 'event', script: 'gw_mural', x: 25, y: 13, z: -30 });
  r.add({ type: 'light', x: 32, y: 13, r: 4.5, color: CANDLE, intensity: 0.7, flicker: true, flame: 'orange', size: 12 });
  deco(r, 'candle_cluster', 27, 14, { lit: false });
  deco(r, 'bones', 52, 14); deco(r, 'rubble', 10, 14);
  return done(r, { theme: { bg: 'interior', weatherDensity: 0.6 }, bgSeed: 12 });
}

// =====================================================================================================
const builders = { gw01, gw02, gw03, gw04, gw06, gw07, gw08, gw09, gw10, gw11, gw12 };
const only = process.argv.slice(2).filter((a) => !a.startsWith('--'));
for (const [name, fn] of Object.entries(builders)) {
  const r = fn();
  if (process.argv.includes('--print') && (!only.length || only.includes(name) || only.includes(r.id))) {
    console.log('\n' + r.id + '\n' + r.ascii().split('\n').map((l, i) => String(i).padStart(2) + ' ' + l).join('\n'));
  }
}
if (badDecor.length) throw new Error('unsupported decor (nothing written):\n  ' + badDecor.join('\n  '));
const out = RK.emit('guttered', defs, path.join('src', 'data', 'regions', 'guttered.js'),
  'The Guttered Ways (region builder: region-guttered). Arena gw_05 lives in src/data/arenas/effigy.js');
console.log('wrote ' + path.relative(path.resolve(__dirname, '../..'), out) + ' (' + defs.length + ' rooms)');
