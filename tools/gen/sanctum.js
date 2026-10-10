#!/usr/bin/env node
// tools/gen/sanctum.js — generator for THE HEARTWICK SANCTUM (region builder: region-rime_sanctum).
// Builds the NON-arena rooms of region 'sanctum' (hs_01, hs_02) with tools/lib/roomkit.js exactly to
// design/world_plan.json and emits src/data/regions/sanctum.js. Never hand-edit the emitted file: edit this, re-run:
//   node tools/gen/sanctum.js [--print] [hs_01 ...]
// Coordinates: x = column, y = row (room-local, 0-based). Helpers take INCLUSIVE rectangles.
// The arena hs_03 (The Heartwick, Lucerne) lives in src/data/arenas/lucerne.js (boss builder).
// The Sanctum is solemn and quiet: no enemies, golden crystal architecture, the last sconce before Lucerne.
'use strict';
const path = require('path');
const RK = require('../lib/roomkit');

const box = (r, x0, y0, x1, y1, ch = '#') => r.fill(x0, y0, x1 - x0 + 1, y1 - y0 + 1, ch);
const air = (r, x0, y0, x1, y1) => box(r, x0, y0, x1, y1, '.');
const deco = (r, kind, x, y, o) => r.add(Object.assign({ type: 'decor', kind, x, y }, o || {}));
const light = (r, x, y, rad, color, intensity, flicker, extra) =>
  r.add(Object.assign({ type: 'light', x: Math.floor(x), y: Math.floor(y), r: rad, color, intensity, flicker: !!flicker }, extra || {}));

// palette (docs/ART_GUIDE.md §2, sanctum): gold, pale gold, white heart-light
const GOLD = '#ffd870', PALEGOLD = '#ffe8a8', WHITE = '#fff4d8', AMBER = '#e2c46c', CANDLE = '#ffc070';

const defs = [];
const CEILING = new Set(['banner', 'cage_hanging', 'chain', 'lantern_hanging', 'drip']);
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

// =====================================================================================================
// hs_01 — THE DESCENT OF LIGHT (32x36, shaft) below the Seal Door. N1 (cols 2-5) at the top: the player falls
// through slow golden light to the floor (top row 33); E1 (rows 30-32) to the Vestibule. The shaft is a funnel of
// crystal that only ever widens downward (cols 2-5 -> 2-11 -> 2-20 -> 2-30): every step is an overhang seen from below,
// so there is no ledge anywhere. The west face (col 1) runs straight and unbroken from the floor to N1: the climb back
// to the Rime is a wall-jump climb (Wax Grip). lore_hs_1 at col 8, the crystal cluster hs_geo1 at col 22.
// =====================================================================================================
function hs01() {
  const r = RK.room('hs_01');
  air(r, 2, 1, 5, 6);                            // the neck under the Seal Door's shaft
  air(r, 2, 7, 11, 13);
  air(r, 2, 14, 20, 21);
  air(r, 2, 22, 30, 32);                         // the floor hall
  r.openExits();
  // ---- contents
  r.put(8, 32, { type: 'lore', id: 'lore_hs_1' });
  r.put(22, 32, { type: 'geode', id: 'hs_geo1', amount: 100 });
  // ---- the landmark: golden light falling like slow rain through crystal
  deco(r, 'crystal', 4, 32, { color: GOLD }); deco(r, 'crystal', 13, 32, { color: PALEGOLD, dim: 0.2 });
  deco(r, 'crystal', 26, 32, { color: GOLD, flip: true }); deco(r, 'crystal', 29, 32, { color: AMBER, dim: 0.3 });
  deco(r, 'stained_window', 16, 32, { lit: true, dim: 0.35, layer: 'back' });
  deco(r, 'cage_bars', 11, 32, { dim: 0.5, layer: 'back' }); deco(r, 'cage_bars', 19, 32, { dim: 0.5, layer: 'back' });
  deco(r, 'candle_cluster', 6, 32, { lit: true }); deco(r, 'candle_cluster', 28, 32, { lit: true });
  deco(r, 'banner', 9, 7, { len: 120, color: '#c8a040' }); deco(r, 'banner', 15, 14, { len: 110, color: '#c8a040' });
  deco(r, 'banner', 25, 22, { len: 90, color: '#c8a040', torn: true });
  deco(r, 'chain', 22, 22, { len: 200, hook: true }); deco(r, 'chain', 29, 22, { len: 120 });
  light(r, 4, 3, 5, WHITE, 0.5);                 // light pouring down the neck
  light(r, 6, 10, 6, GOLD, 0.4); light(r, 11, 18, 7, GOLD, 0.35); light(r, 17, 26, 9, PALEGOLD, 0.35);
  light(r, 8, 30, 4, PALEGOLD, 0.45);            // the decree in gold
  light(r, 22, 31, 4, GOLD, 0.45);
  light(r, 6, 31, 2.5, CANDLE, 0.4, true); light(r, 28, 31, 2.5, CANDLE, 0.4, true);
  return done(r, { bgSeed: 201, theme: { bg: 'shaft', weather: [{ kind: 'light', count: 60 }], fog: 0.8 } });
}

// =====================================================================================================
// hs_02 — THE VESTIBULE OF GLASS (64x18, room) before the final arena. Floor top row 15 (W1 / E1 rows 12-14).
// hs_sconce_a at col 20 (the last rest; strong warm light), lore_hs_2 at col 36. A great pier of golden crystal
// (cols 49-58) hangs from the vault; the way east passes beneath it through a sunken walk (floor top row 17, cols
// 40-60). SECRET: a raised crystal shelf (cols 40-48, top row 12, a 3-tile step up from the floor) runs into the pier
// and ends at a B crystal wall (cols 49-50, rows 9-11) that hides an alcove (cols 51-58, rows 9-11, floor top 12)
// with hs_geo2. E1 is the arch into the Heartwick; the white heart-light of the Everlantern pulses through it.
// =====================================================================================================
function hs02() {
  const r = RK.room('hs_02');
  air(r, 1, 3, 48, 14);                          // the vestibule
  air(r, 8, 2, 40, 2);                           // a shallow vault
  air(r, 40, 14, 60, 16);                        // the sunken walk under the pier (floor top row 17, 3 rows tall)
  box(r, 40, 15, 60, 16, ':');                   // QA: back the sunken walk with a recessed wall - through the open
                                                 // trench the background's near layer showed as black spikes on its floor
  air(r, 60, 6, 62, 14);                         // the arch toward the Heartwick (col 59 closes the alcove)
  box(r, 40, 12, 48, 12);                        // the crystal shelf (top 12), cantilevered from the pier
  box(r, 49, 9, 50, 11, 'B');                    // the crystal wall
  air(r, 51, 9, 58, 11);                         // the hidden alcove (floor top 12)
  r.openExits();
  // ---- contents
  r.put(20, 14, { type: 'sconce', id: 'hs_sconce_a' });
  r.put(36, 14, { type: 'lore', id: 'lore_hs_2' });
  r.put(55, 11, { type: 'geode', id: 'hs_geo2', amount: 120 });
  // ---- dressing: golden glass, a last warm rest, the white heart-light beyond
  deco(r, 'stained_window', 8, 14, { lit: true, dim: 0.3, layer: 'back' });
  deco(r, 'stained_window', 30, 14, { lit: true, dim: 0.3, layer: 'back' });
  deco(r, 'candelabra', 16, 14, { lit: true, material: 'gold', flame: 'gold' });
  deco(r, 'candelabra', 24, 14, { lit: true, material: 'gold', flame: 'gold' });
  deco(r, 'statue_waxen', 4, 14, { variant: 1, material: 'gold', dim: 0.25, layer: 'back' });
  deco(r, 'statue_waxen', 44, 11, { variant: 0, material: 'gold', dim: 0.3, layer: 'back' });
  deco(r, 'altar', 36, 14, { lit: true, layer: 'back', dim: 0.3 });
  deco(r, 'arch', 61, 14, { layer: 'back' });
  deco(r, 'crystal', 12, 14, { color: GOLD }); deco(r, 'crystal', 39, 14, { color: PALEGOLD, flip: true });
  deco(r, 'crystal', 52, 16, { color: GOLD, dim: 0.3 }); deco(r, 'crystal', 57, 11, { color: GOLD });
  deco(r, 'pew', 27, 14, { dim: 0.3, layer: 'back' });
  deco(r, 'banner', 12, 3, { len: 130, color: '#c8a040' }); deco(r, 'banner', 28, 3, { len: 130, color: '#c8a040' });
  deco(r, 'cage_hanging', 20, 3, { len: 60, ember: true });
  light(r, 20, 12, 7, CANDLE, 0.6, true);        // the last sconce: a strong warm light
  light(r, 16, 12, 3, GOLD, 0.4, true); light(r, 24, 12, 3, GOLD, 0.4, true);
  light(r, 36, 12, 4, PALEGOLD, 0.4);
  light(r, 55, 10, 3, GOLD, 0.45);               // the geode's glow (a hint through the veil)
  light(r, 61, 11, 7, WHITE, 0.6);               // the Everlantern's heart-light through the arch
  light(r, 52, 16, 4, GOLD, 0.3);
  light(r, 8, 9, 5, PALEGOLD, 0.3); light(r, 30, 9, 5, PALEGOLD, 0.3);
  // QA: no foreground silhouettes - in an 18-row room the bottom band of fg crystals covers the sunken walk (row 17),
  // where dark shards on the walking surface could be mistaken for spikes
  return done(r, { bgSeed: 211, theme: { bg: 'interior', weather: [{ kind: 'light', count: 30 }], fg: false } });
}

// =====================================================================================================
const builders = { hs01, hs02 };
const only = process.argv.slice(2).filter((a) => !a.startsWith('--'));
for (const [name, fn] of Object.entries(builders)) {
  const r = fn();
  if (process.argv.includes('--print') && (!only.length || only.includes(name) || only.includes(r.id))) {
    let hdr = '   '; for (let x = 0; x < r.w; x++) hdr += x % 10;
    console.log('\n' + r.id + '\n' + hdr + '\n' + r.ascii().split('\n').map((l, i) => String(i).padStart(2) + ' ' + l).join('\n'));
  }
}
const out = RK.emit('sanctum', defs, path.join('src', 'data', 'regions', 'sanctum.js'),
  'THE HEARTWICK SANCTUM (region builder: region-rime_sanctum). Arena hs_03 lives in src/data/arenas/lucerne.js');
console.log('wrote ' + path.relative(path.resolve(__dirname, '../..'), out) + ' (' + defs.length + ' rooms)');
