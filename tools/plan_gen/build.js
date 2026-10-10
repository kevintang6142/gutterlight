// Builds design/world_plan.json from the compact region DSL in ./regions/*.js
// Each region file: module.exports = (R) => { R('gw_01', {...}); ... }
// Room DSL:
//   name, region, cell:[cx,cy,cw,ch], kind
//   exits: [[side, neighborId, localPos, size, ref?]]   (declared once; mirrored onto the neighbor)
//   zones: { zoneName: [exitRef, ...] }   exitRef = neighbor id (or explicit ref)
//   moves: { 'a>b': req, 'a<>b': req }    req = [] | ['grip'] | [['dash'],['wings']] (alternatives)
//   content: [[spec, zone?, {secret}?]]
//   notes, secret (room-level)
'use strict';
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..', '..');
const CELL_W = 16, CELL_H = 9;
const REGION_ORDER = ['shore', 'lastlight', 'guttered', 'meltbloom', 'flue', 'nave', 'chandlery', 'mothwood', 'rime', 'sanctum'];
const PREFIX = { shore: 'sh', lastlight: 'll', guttered: 'gw', meltbloom: 'mb', flue: 'sf', nave: 'dn', chandlery: 'ch', mothwood: 'mw', rime: 'ri', sanctum: 'hs' };

const defs = [];
const errors = [];
const warnings = [];
function err(m) { errors.push(m); }

for (const region of REGION_ORDER) {
  const f = path.join(__dirname, 'regions', region + '.js');
  if (!fs.existsSync(f)) continue;
  require(f)((id, d) => { d.id = id; d.region = region; defs.push(d); });
}
const byId = new Map(defs.map((d) => [d.id, d]));

// ---------- geometry ----------
for (const d of defs) {
  const [cx, cy, cw, ch] = d.cell;
  d.gx = cx * CELL_W; d.gy = cy * CELL_H; d.w = cw * CELL_W; d.h = ch * CELL_H;
  d._exits = [];
  if (!d.id.startsWith(PREFIX[d.region] + '_')) err(`${d.id}: prefix does not match region ${d.region}`);
}

function sideInfo(d, side) {
  // returns the global coordinate of the boundary line and the axis range
  if (side === 'W') return { line: d.gx, lo: d.gy, len: d.h, horiz: true };
  if (side === 'E') return { line: d.gx + d.w, lo: d.gy, len: d.h, horiz: true };
  if (side === 'N') return { line: d.gy, lo: d.gx, len: d.w, horiz: false };
  return { line: d.gy + d.h, lo: d.gx, len: d.w, horiz: false };
}
const OPP = { W: 'E', E: 'W', N: 'S', S: 'N' };

function addExit(d, ex) {
  const dup = d._exits.find((e) => e.ref === ex.ref);
  if (dup) {
    if (dup.side !== ex.side || dup.pos !== ex.pos || dup.size !== ex.size || dup.to !== ex.to) err(`${d.id}: exit ref '${ex.ref}' declared inconsistently (${JSON.stringify(dup)} vs ${JSON.stringify(ex)})`);
    dup.declaredTwice = true;
    return dup;
  }
  d._exits.push(ex);
  return ex;
}

for (const d of defs) {
  for (const x of d.exits || []) {
    const [side, nb, pos, size, ref] = x;
    const b = byId.get(nb);
    if (!b) { err(`${d.id}: exit to unknown room ${nb}`); continue; }
    const A = sideInfo(d, side), B = sideInfo(b, OPP[side]);
    if (A.line !== B.line) { err(`${d.id} ${side} -> ${nb}: rooms are not adjacent on that side`); continue; }
    const g0 = A.lo + pos;
    const bpos = g0 - B.lo;
    if (bpos < 0 || bpos + size > B.len) { err(`${d.id} ${side}${pos} -> ${nb}: opening outside neighbor edge`); continue; }
    const ra = { side, pos, size, to: nb, ref: ref || nb, g0 };
    const rb = { side: OPP[side], pos: bpos, size, to: d.id, ref: d.id + (ref ? '#' + ref : ''), g0 };
    ra.mirror = rb; rb.mirror = ra;
    addExit(d, ra);
    // the neighbor may have declared it too: then it must match
    const pre = b._exits.find((e) => e.to === d.id && e.side === rb.side && e.pos === rb.pos);
    if (pre) { pre.mirror = ra; ra.mirror = pre; } else addExit(b, rb);
  }
}

// assign exit ids: side + index ordered by pos
for (const d of defs) {
  for (const side of ['N', 'S', 'W', 'E']) {
    d._exits.filter((e) => e.side === side).sort((a, b) => a.pos - b.pos).forEach((e, i) => { e.id = side + (i + 1); });
  }
}

// ---------- requirement sets ----------
const key = (s) => s.slice().sort().join('+');
function norm(s) { return Array.from(new Set(s)).sort(); }
function subset(a, b) { return a.every((x) => b.includes(x)); }
function addMin(list, s) {
  s = norm(s);
  for (const t of list) if (subset(t, s)) return false;
  for (let i = list.length - 1; i >= 0; i--) if (subset(s, list[i])) list.splice(i, 1);
  list.push(s);
  return true;
}
function alts(req) {
  if (!Array.isArray(req)) throw new Error('bad req ' + JSON.stringify(req));
  if (req.length && Array.isArray(req[0])) return req.map(norm);
  return [norm(req)];
}

function grants(spec) {
  let m;
  if ((m = /^shrine:(\w+)/.exec(spec))) return [m[1]];
  if ((m = /^arena:(\w+)/.exec(spec))) return ['boss:' + m[1]];
  if ((m = /^lever:(\w+)/.exec(spec))) return ['lever:' + m[1]];
  return [];
}
function spotId(spec) {
  let m;
  if (spec === 'start' || spec === 'sealdoor') return spec;
  if ((m = /^(sconce|lanternway|lore|geode|lever|arena):([\w]+)$/.exec(spec))) return `${m[1]}:${m[2]}`;
  if ((m = /^npc:(\w+)(?::(\d))?$/.exec(spec))) return m[2] ? `npc:${m[1]}:${m[2]}` : `npc:${m[1]}`;
  if ((m = /^shrine:(\w+)(\?.*)?$/.exec(spec))) return `shrine:${m[1]}`;
  if ((m = /^pickup:[\w:]+#(\w+)$/.exec(spec))) return `pickup:${m[1]}`;
  return null;
}

const out = [];
for (const d of defs) {
  const zones = d.zones || { main: d._exits.map((e) => e.ref) };
  const zoneOf = new Map();
  for (const [z, refs] of Object.entries(zones)) for (const r of refs) {
    const e = d._exits.find((x) => x.ref === r);
    if (!e) { err(`${d.id}: zone ${z} references unknown exit '${r}' (exits: ${d._exits.map((x) => x.ref).join(', ')})`); continue; }
    if (zoneOf.has(e)) err(`${d.id}: exit ${r} in two zones`);
    zoneOf.set(e, z);
  }
  for (const e of d._exits) if (!zoneOf.has(e)) err(`${d.id}: exit ${e.ref} (${e.id}) not in any zone`);
  const zn = Object.keys(zones);
  const moves = [];
  for (const [k, req] of Object.entries(d.moves || {})) {
    const both = k.includes('<>');
    const [a, b] = k.split(both ? '<>' : '>');
    if (!zn.includes(a) || !zn.includes(b)) { err(`${d.id}: move ${k} uses unknown zone`); continue; }
    moves.push([a, b, alts(req)]);
    if (both) moves.push([b, a, alts(req)]);
  }
  // reach[a][b] = antichain of requirement sets
  const reach = {};
  for (const a of zn) { reach[a] = {}; for (const b of zn) reach[a][b] = []; reach[a][a].push([]); }
  let changed = true, guard = 0;
  while (changed && guard++ < 100) {
    changed = false;
    for (const [a, b, al] of moves) for (const z of zn) for (const r of reach[z][a].slice()) for (const s of al) {
      if (addMin(reach[z][b], r.concat(s))) changed = true;
    }
  }
  const exits = d._exits.slice().sort((a, b) => a.id.localeCompare(b.id));
  const paths = [];
  for (const e1 of exits) for (const e2 of exits) {
    if (e1 === e2) continue;
    for (const s of reach[zoneOf.get(e1)][zoneOf.get(e2)]) paths.push({ from: e1.id, to: e2.id, requires: s });
  }
  for (const e1 of exits) {
    // an exit that is neither an entry nor a departure for any traversal is suspicious (one-way exits are fine)
    const out = exits.some((e2) => e2 !== e1 && reach[zoneOf.get(e1)][zoneOf.get(e2)].length);
    const inn = exits.some((e2) => e2 !== e1 && reach[zoneOf.get(e2)][zoneOf.get(e1)].length);
    if (exits.length > 1 && !out && !inn) warnings.push(`${d.id}: exit ${e1.id} is isolated (no traversal from or to it)`);
  }
  const contents = [], spots = [];
  for (const c of d.content || []) {
    const [spec, z, opts] = Array.isArray(c) ? c : [c];
    contents.push(spec);
    const sid = spotId(spec);
    if (!sid) continue;
    // z may list several zones for content standing on a zone boundary (e.g. a door usable from both sides):
    // the spot is reached from an exit by the cheapest of its zones
    const zs = Array.isArray(z) ? z : [z || zn[0]];
    const unknown = zs.filter((q) => !zn.includes(q));
    if (unknown.length) { err(`${d.id}: content ${spec} in unknown zone ${unknown.join(',')}`); continue; }
    const zz = zs.join('|');
    const g = grants(spec);
    let n = 0;
    for (const e of exits) {
      const cands = [];
      for (const q of zs) for (const r of reach[zoneOf.get(e)][q]) {
        if (reach[q][zoneOf.get(e)].some((s) => subset(s, r.concat(g)))) cands.push(r);
      }
      // keep only the minimal requirement sets (drop duplicates and supersets)
      const keep = cands.filter((r, i) => !cands.some((o, j) => j !== i && subset(o, r) && (!subset(r, o) || j < i)));
      for (const r of keep) {
        const sp = { id: sid, from: e.id, requires: r };
        if (opts && opts.secret) sp.secret = opts.secret;
        spots.push(sp); n++;
      }
    }
    if (!n) err(`${d.id}: content ${spec} (zone ${zz}) has no valid spot entry (unreachable or no return)`);
  }
  const room = {
    id: d.id, region: d.region, name: d.name, gx: d.gx, gy: d.gy, w: d.w, h: d.h, kind: d.kind || 'room',
    exits: exits.map((e) => ({ id: e.id, side: e.side, pos: e.pos, size: e.size, to: e.to, toExit: e.mirror.id })),
    paths, spots, contents,
  };
  if (d.secret) room.secret = d.secret;
  room.notes = d.notes || '';
  out.push(room);
}

const plan = {
  version: 1,
  cell: { w: CELL_W, h: CELL_H },
  generatedBy: 'world_plan architect generator (exits mirrored; paths/spots derived from intra-room zone graphs)',
  rooms: out,
};
if (process.argv.includes('--extra')) Object.assign(plan, require('./extra.js'));
for (const w of warnings) console.log('WARN', w);
if (errors.length) { for (const e of errors) console.log('ERROR', e); process.exit(1); }
const dest = process.argv.includes('--out') ? process.argv[process.argv.indexOf('--out') + 1] : path.join(ROOT, 'design', 'world_plan.json');
fs.writeFileSync(dest, JSON.stringify(plan, null, 1));
console.log(`wrote ${out.length} rooms -> ${dest}`);
