#!/usr/bin/env node
// Validates design/world_plan.json against TECH_SPEC sections 7, 18, 19 and DESIGN section 4.
//
//   node tools/plan_check.js [plan.json] [--quiet] [--verbose]
//
// Checks: room geometry (grid alignment, sizes, overlaps), exits (corners, sizes, same-side overlap,
// reciprocity and global alignment), paths/spots/contents grammar, content counts and id conventions,
// region membership and room counts, graph connectivity, a progression simulation over
// (exit position x ability/flag set) proving completability and that every content spot is reachable,
// a no-trap check (every reachable state can return to the Lastlight sconce without the Lanternway),
// and quality metrics (loops, one-way shortcuts, secrets, backtracking rewards).
// Prints the intended critical path and the feasible alternative ability orders.
// Exit code 1 on any error.
'use strict';
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const args = process.argv.slice(2);
const QUIET = args.includes('--quiet');
const VERBOSE = args.includes('--verbose');
// --orders-json: print only {ok, orders} (the feasible ability acquisition orders of the progression simulation) as
// JSON and exit 0. Used by tools/reach.js to derive the maximal ability set a player can own before each ability.
const ORDERS_JSON = args.includes('--orders-json');
const planFile = args.find((a) => !a.startsWith('--')) || path.join(ROOT, 'design', 'world_plan.json');

const errors = [];
const warnings = [];
const err = (m) => errors.push(m);
const warn = (m) => warnings.push(m);
const out = (m = '') => { if (!QUIET) console.log(m); };

// ------------------------------------------------------------------ spec constants
const CELL_W = 16, CELL_H = 9;
const REGIONS = {
  shore: { prefix: 'sh', rooms: 4, sconces: 1, geodes: [2, 4] },
  lastlight: { prefix: 'll', rooms: 3, sconces: 1, geodes: [2, 4] },
  guttered: { prefix: 'gw', rooms: 12, sconces: 2, geodes: [2, 4] },
  meltbloom: { prefix: 'mb', rooms: 10, sconces: 2, geodes: [2, 4] },
  flue: { prefix: 'sf', rooms: 9, sconces: 2, geodes: [2, 4] },
  nave: { prefix: 'dn', rooms: 12, sconces: 2, geodes: [2, 4] },
  chandlery: { prefix: 'ch', rooms: 10, sconces: 2, geodes: [2, 4] },
  mothwood: { prefix: 'mw', rooms: 10, sconces: 2, geodes: [2, 4] },
  rime: { prefix: 'ri', rooms: 8, sconces: 2, geodes: [2, 4] },
  sanctum: { prefix: 'hs', rooms: 3, sconces: 1, geodes: [2, 4] },
};
const REGION_OF_PREFIX = Object.fromEntries(Object.entries(REGIONS).map(([r, v]) => [v.prefix, r]));
// order in which regions are first reached on the intended critical path (for "earlier region" metrics)
const REGION_ORDER = ['shore', 'lastlight', 'guttered', 'meltbloom', 'flue', 'nave', 'chandlery', 'mothwood', 'rime', 'sanctum'];
const ABILITIES = ['bolt', 'dash', 'grip', 'wings', 'oilcloak', 'plunge'];
const REQ_ABILITIES = ['dash', 'grip', 'wings', 'oilcloak', 'plunge'];
const BOSSES = ['effigy', 'sable1', 'matron', 'tallowmere', 'kilnmother', 'vespertine', 'sable2', 'lucerne'];
const KEEPERS = ['tallowmere', 'kilnmother', 'vespertine'];
const ARENAS = {
  effigy: { region: 'guttered', sizes: [[64, 18]] },
  sable1: { region: 'meltbloom', sizes: [[64, 18]] },
  matron: { region: 'flue', sizes: [[48, 27]] },
  tallowmere: { region: 'nave', sizes: [[64, 27]] },
  kilnmother: { region: 'chandlery', sizes: [[64, 18]] },
  vespertine: { region: 'mothwood', sizes: [[64, 27]] },
  sable2: { region: 'rime', sizes: [[64, 18]] },
  lucerne: { region: 'sanctum', sizes: [[64, 27], [64, 36]] },
};
const SHRINES = {
  bolt: { region: 'guttered', cond: '' },
  dash: { region: 'meltbloom', cond: 'boss:sable1' },
  grip: { region: 'flue', cond: 'boss:matron' },
  oilcloak: { region: 'nave', cond: '' },
  plunge: { region: 'chandlery', cond: '' },
  wings: { region: 'mothwood', cond: '' },
};
const LORE_COUNTS = { sh: 3, ll: 2, gw: 5, mb: 4, sf: 4, dn: 6, ch: 4, mw: 4, ri: 4, hs: 2 };
const SPARK_REGIONS = { spark_gw: 'guttered', spark_mb: 'meltbloom', spark_sf: 'flue', spark_dn: 'nave', spark_ch: 'chandlery', spark_mw: 'mothwood' };
const WORLD_SIGILS = ['swift_brand', 'heartwax', 'ember_thirst', 'flare_trail', 'bright_bolt', 'thorned_wax', 'last_light', 'deep_kindle'];
const SHARD_REGIONS = ['shore', 'guttered', 'meltbloom', 'flue', 'nave', 'rime', 'mothwood'];
const LANTERNWAY = { lastlight: 'lastlight', guttered: 'guttered', meltbloom: 'meltbloom', nave: 'nave', chandlery: 'chandlery', mothwood: 'mothwood', rime: 'rime' };
const ENEMY_KINDS = {
  shore: ['ash_crawler', 'ash_fly'],
  guttered: ['snuffed_walker', 'snuffed_lancer', 'drip_fly', 'wick_crawler'],
  meltbloom: ['bloom_spitter', 'thorn_hopper', 'pollen_moth', 'vine_lurker'],
  flue: ['soot_sprite', 'chimney_crawler', 'stoker', 'ash_bat'],
  nave: ['drowned_acolyte', 'rain_jelly', 'bell_sentry', 'drowned_knight'],
  chandlery: ['moldling', 'ladle_brute', 'drip_slime', 'forge_wisp'],
  mothwood: ['dusk_moth', 'cocoon_spawner', 'dust_maw', 'moth_knight'],
  rime: ['frost_husk', 'ice_spitter', 'rime_wraith', 'shard_crawler'],
};
const ALL_ENEMIES = new Set(Object.values(ENEMY_KINDS).flat());
const HOME = { room: 'll_02', spot: 'sconce:ll_sconce_a' };
const OPP = { N: 'S', S: 'N', W: 'E', E: 'W' };

// ------------------------------------------------------------------ load
let plan;
try { plan = JSON.parse(fs.readFileSync(planFile, 'utf8')); } catch (e) {
  console.error(`cannot read/parse ${planFile}: ${e.message}`);
  process.exit(1);
}
if (!plan.cell || plan.cell.w !== CELL_W || plan.cell.h !== CELL_H) err(`plan.cell must be {w:${CELL_W}, h:${CELL_H}}`);
if (!Array.isArray(plan.rooms)) { console.error('plan.rooms missing'); process.exit(1); }
const rooms = plan.rooms;
const byId = new Map();

// ------------------------------------------------------------------ 1. rooms: ids, regions, geometry
const isInt = (v) => Number.isInteger(v);
for (const r of rooms) {
  const tag = r && r.id ? r.id : JSON.stringify(r).slice(0, 40);
  if (!r || typeof r.id !== 'string' || !/^(sh|ll|gw|mb|sf|dn|ch|mw|ri|hs)_\d\d$/.test(r.id)) { err(`${tag}: bad room id`); continue; }
  if (byId.has(r.id)) { err(`${r.id}: duplicate room id`); continue; }
  byId.set(r.id, r);
  const reg = REGIONS[r.region];
  if (!reg) err(`${r.id}: unknown region '${r.region}'`);
  else if (!r.id.startsWith(reg.prefix + '_')) err(`${r.id}: prefix does not match region ${r.region} (${reg.prefix})`);
  for (const k of ['gx', 'gy', 'w', 'h']) if (!isInt(r[k])) err(`${r.id}: ${k} must be an integer`);
  if (r.gx < 0 || r.gy < 0) err(`${r.id}: negative coordinates`);
  if (r.gx % CELL_W) err(`${r.id}: gx ${r.gx} not a multiple of ${CELL_W}`);
  if (r.gy % CELL_H) err(`${r.id}: gy ${r.gy} not a multiple of ${CELL_H}`);
  if (r.w % CELL_W || r.w < 32) err(`${r.id}: width ${r.w} must be a multiple of 16 and >= 32`);
  if (r.h % CELL_H || r.h < 18) err(`${r.id}: height ${r.h} must be a multiple of 9 and >= 18`);
  if (typeof r.kind !== 'string' || !r.kind) err(`${r.id}: missing kind`);
  for (const k of ['exits', 'paths', 'spots', 'contents']) if (!Array.isArray(r[k])) { err(`${r.id}: ${k} must be an array`); r[k] = []; }
  if (typeof r.notes !== 'string' || r.notes.length < 40) err(`${r.id}: notes missing or too short`);
}
// overlaps (cell occupancy)
const cellOwner = new Map();
for (const r of byId.values()) {
  for (let cy = r.gy / CELL_H; cy < (r.gy + r.h) / CELL_H; cy++) for (let cx = r.gx / CELL_W; cx < (r.gx + r.w) / CELL_W; cx++) {
    const k = cx + ',' + cy;
    if (cellOwner.has(k)) err(`${r.id} overlaps ${cellOwner.get(k)} at cell ${k}`);
    else cellOwner.set(k, r.id);
  }
}
// region room counts
const regionRooms = {};
for (const r of byId.values()) (regionRooms[r.region] = regionRooms[r.region] || []).push(r);
for (const [reg, spec] of Object.entries(REGIONS)) {
  const n = (regionRooms[reg] || []).length;
  if (n !== spec.rooms) err(`region ${reg}: ${n} rooms, expected ${spec.rooms}`);
}

// ------------------------------------------------------------------ 2. exits
function sideLen(r, side) { return side === 'W' || side === 'E' ? r.h : r.w; }
function exitGlobal(r, e) {
  // boundary line coordinate + start of the open span along the edge (global tiles)
  if (e.side === 'W') return { line: r.gx, a: r.gy + e.pos };
  if (e.side === 'E') return { line: r.gx + r.w, a: r.gy + e.pos };
  if (e.side === 'N') return { line: r.gy, a: r.gx + e.pos };
  return { line: r.gy + r.h, a: r.gx + e.pos };
}
const exitOf = (r, id) => r.exits.find((e) => e.id === id);
for (const r of byId.values()) {
  const ids = new Set();
  for (const e of r.exits) {
    const t = `${r.id}.${e.id}`;
    if (!e || typeof e.id !== 'string' || !/^[NSWE]\d+$/.test(e.id)) { err(`${t}: bad exit id`); continue; }
    if (ids.has(e.id)) err(`${t}: duplicate exit id`);
    ids.add(e.id);
    if (e.side !== e.id[0]) err(`${t}: side '${e.side}' does not match id`);
    if (!isInt(e.pos) || !isInt(e.size)) { err(`${t}: pos/size must be integers`); continue; }
    if (e.size < 3) err(`${t}: size ${e.size} < 3`);
    if (e.size > 6) warn(`${t}: unusually large opening (${e.size})`);
    const len = sideLen(r, e.side);
    if (e.pos < 2 || e.pos + e.size > len - 2) err(`${t}: opening ${e.pos}..${e.pos + e.size - 1} is within 2 tiles of a corner (edge length ${len})`);
    // reciprocity
    const b = byId.get(e.to);
    if (!b) { err(`${t}: target room ${e.to} does not exist`); continue; }
    const be = exitOf(b, e.toExit);
    if (!be) { err(`${t}: target exit ${e.to}.${e.toExit} does not exist`); continue; }
    if (be.to !== r.id || be.toExit !== e.id) err(`${t}: not reciprocal (${e.to}.${e.toExit} points to ${be.to}.${be.toExit})`);
    if (be.side !== OPP[e.side]) err(`${t}: side ${e.side} faces ${e.to}.${be.id} side ${be.side}`);
    if (be.size !== e.size) err(`${t}: size ${e.size} != ${e.to}.${be.id} size ${be.size}`);
    const A = exitGlobal(r, e), B = exitGlobal(b, be);
    if (A.line !== B.line) err(`${t}: rooms ${r.id} and ${b.id} are not adjacent on that side`);
    if (A.a !== B.a) err(`${t}: misaligned with ${e.to}.${be.id} (global ${A.a} vs ${B.a})`);
  }
  // same-side openings must be separated by at least one solid tile
  for (const side of ['N', 'S', 'W', 'E']) {
    const es = r.exits.filter((e) => e.side === side && isInt(e.pos)).sort((a, b) => a.pos - b.pos);
    for (let i = 1; i < es.length; i++) if (es[i].pos < es[i - 1].pos + es[i - 1].size + 1) err(`${r.id}: exits ${es[i - 1].id} and ${es[i].id} overlap or touch`);
  }
}

// ------------------------------------------------------------------ 3. requirement tokens, paths
const TOKEN_RE = /^(dash|grip|wings|oilcloak|plunge|boss:[a-z0-9]+|lever:[a-z]{2}_lv\d+|seals>=3)$/;
function checkReq(where, req) {
  if (!Array.isArray(req)) { err(`${where}: requires must be an array`); return false; }
  let ok = true;
  for (const t of req) {
    if (typeof t !== 'string' || !TOKEN_RE.test(t)) { err(`${where}: bad requirement token '${t}'`); ok = false; continue; }
    if (t.startsWith('boss:') && !BOSSES.includes(t.slice(5))) { err(`${where}: unknown boss in '${t}'`); ok = false; }
  }
  if (new Set(req).size !== req.length) warn(`${where}: duplicate requirement tokens`);
  return ok;
}
const subset = (a, b) => a.every((x) => b.includes(x));
for (const r of byId.values()) {
  const seen = [];
  for (const p of r.paths) {
    const t = `${r.id} path ${p.from}->${p.to}`;
    if (!exitOf(r, p.from) || !exitOf(r, p.to)) { err(`${t}: unknown exit`); continue; }
    if (p.from === p.to) err(`${t}: from == to`);
    checkReq(t, p.requires);
    for (const q of seen) if (q.from === p.from && q.to === p.to && Array.isArray(q.requires) && Array.isArray(p.requires) && (subset(q.requires, p.requires) || subset(p.requires, q.requires))) warn(`${t}: requirement sets are not minimal alternatives`);
    seen.push(p);
  }
  if (r.exits.length > 1) for (const e of r.exits) {
    if (!r.paths.some((p) => p.from === e.id || p.to === e.id)) err(`${r.id}.${e.id}: exit takes part in no path`);
  }
}

// ------------------------------------------------------------------ 4. contents grammar & inventory
const items = []; // {room, region, kind, id, spec, spotId, grant, cond, extra}
const CONTENT_RULES = [
  [/^start$/, (m) => ({ kind: 'start', spotId: 'start' })],
  [/^sconce:([a-z]{2}_sconce_[ab])$/, (m) => ({ kind: 'sconce', id: m[1], spotId: 'sconce:' + m[1] })],
  [/^lanternway:([a-z]+)$/, (m) => ({ kind: 'lanternway', id: m[1], spotId: 'lanternway:' + m[1] })],
  [/^lore:(lore_[a-z]{2}_\d+)$/, (m) => ({ kind: 'lore', id: m[1], spotId: 'lore:' + m[1] })],
  [/^npc:(thrum|pell|quill|bramm|wren|sable)(?::(\d))?$/, (m) => ({ kind: 'npc', id: m[1], stage: m[2] ? +m[2] : null, spotId: 'npc:' + m[1] + (m[2] ? ':' + m[2] : '') })],
  [/^shrine:(bolt|dash|grip|oilcloak|plunge|wings)(?:\?(.+))?$/, (m) => ({ kind: 'shrine', id: m[1], cond: m[2] || '', spotId: 'shrine:' + m[1], grant: m[1] })],
  [/^pickup:(heartwax|urn|kiln_glass|spark|notch|sigil:([a-z_]+))#([a-z0-9_]+)$/, (m) => ({ kind: 'pickup', item: m[2] ? 'sigil' : m[1], sigil: m[2] || null, id: m[3], spotId: 'pickup:' + m[3] })],
  [/^geode:([a-z]{2}_geo\d+)$/, (m) => ({ kind: 'geode', id: m[1], spotId: 'geode:' + m[1] })],
  [/^lever:([a-z]{2}_lv\d+)$/, (m) => ({ kind: 'lever', id: m[1], spotId: 'lever:' + m[1], grant: 'lever:' + m[1] })],
  [/^gate:([a-z]{2}_gate\d+)\?(.+)$/, (m) => ({ kind: 'gate', id: m[1], cond: m[2] })],
  [/^arena:([a-z0-9]+)$/, (m) => ({ kind: 'arena', id: m[1], spotId: 'arena:' + m[1], grant: 'boss:' + m[1] })],
  [/^sealdoor$/, (m) => ({ kind: 'sealdoor', spotId: 'sealdoor' })],
  [/^enemy:([a-z_]+)\*(\d+)$/, (m) => ({ kind: 'enemy', id: m[1], n: +m[2] })],
  [/^landmark:.{8,}$/, (m) => ({ kind: 'landmark' })],
];
for (const r of byId.values()) {
  for (const spec of r.contents) {
    let it = null;
    for (const [re, fn] of CONTENT_RULES) { const m = re.exec(spec); if (m) { it = fn(m); break; } }
    if (!it) { err(`${r.id}: unparseable content '${spec}'`); continue; }
    Object.assign(it, { room: r.id, region: r.region, spec });
    items.push(it);
  }
}
const itemsOf = (kind) => items.filter((i) => i.kind === kind);
const prefixOf = (roomId) => roomId.slice(0, 2);

// spots grammar and coverage
for (const r of byId.values()) {
  const roomSpotIds = new Set(items.filter((i) => i.room === r.id && i.spotId).map((i) => i.spotId));
  for (const s of r.spots) {
    const t = `${r.id} spot ${s.id}`;
    if (!roomSpotIds.has(s.id)) err(`${t}: no matching content in this room`);
    if (!exitOf(r, s.from)) err(`${t}: unknown from-exit ${s.from}`);
    checkReq(t, s.requires);
  }
  for (const sid of roomSpotIds) if (!r.spots.some((s) => s.id === sid)) err(`${r.id}: content ${sid} has no spot entry`);
}

// ------------------------------------------------------------------ 5. content counts and id conventions
function expectSet(label, actual, expected) {
  const a = new Set(actual), e = new Set(expected);
  for (const x of e) if (!a.has(x)) err(`${label}: missing ${x}`);
  for (const x of a) if (!e.has(x)) err(`${label}: unexpected ${x}`);
  if (actual.length !== a.size) err(`${label}: duplicates (${actual.length} entries, ${a.size} unique)`);
}
// unique ids across all id-carrying content
{
  const seen = new Map();
  for (const i of items) {
    if (!i.id || ['enemy', 'npc'].includes(i.kind)) continue;
    const k = i.kind + ':' + i.id;
    if (i.kind === 'pickup' || i.kind === 'lore' || i.kind === 'sconce' || i.kind === 'geode' || i.kind === 'lever' || i.kind === 'gate' || i.kind === 'lanternway' || i.kind === 'arena' || i.kind === 'shrine') {
      if (seen.has(k)) err(`${k} appears in ${seen.get(k)} and ${i.room}`); else seen.set(k, i.room);
    }
  }
  const pickIds = itemsOf('pickup').map((i) => i.id);
  if (new Set(pickIds).size !== pickIds.length) err('pickup ids are not unique');
}
// start
{
  const s = itemsOf('start');
  if (s.length !== 1 || s[0].room !== 'sh_01') err(`'start' must appear exactly once, in sh_01 (found ${s.map((x) => x.room).join(',') || 'none'})`);
}
// lore
{
  const expected = [];
  for (const [p, n] of Object.entries(LORE_COUNTS)) for (let k = 1; k <= n; k++) expected.push(`lore_${p}_${k}`);
  const lore = itemsOf('lore');
  expectSet('lore', lore.map((i) => i.id), expected);
  for (const i of lore) if (i.id.slice(5, 7) !== prefixOf(i.room)) err(`${i.room}: ${i.id} placed outside its region`);
}
// sconces
{
  const sc = itemsOf('sconce');
  for (const i of sc) if (prefixOf(i.id) !== prefixOf(i.room)) err(`${i.room}: sconce ${i.id} prefix mismatch`);
  for (const [reg, spec] of Object.entries(REGIONS)) {
    const ids = sc.filter((i) => i.region === reg).map((i) => i.id).sort();
    const want = spec.sconces === 2 ? [`${spec.prefix}_sconce_a`, `${spec.prefix}_sconce_b`] : [`${spec.prefix}_sconce_a`];
    if (ids.join() !== want.join()) err(`region ${reg}: sconces ${ids.join(',') || 'none'}, expected ${want.join(',')}`);
  }
}
// lanternway
{
  const lw = itemsOf('lanternway');
  expectSet('lanternway', lw.map((i) => i.id), Object.values(LANTERNWAY));
  for (const i of lw) if (LANTERNWAY[i.region] !== i.id) err(`${i.room}: lanternway ${i.id} is not in region ${i.id}`);
}
// pickups
{
  const pk = itemsOf('pickup');
  for (const i of pk) if (prefixOf(i.id) !== prefixOf(i.room) && i.item !== 'spark') err(`${i.room}: pickup id ${i.id} prefix does not match the room's region`);
  const sparks = pk.filter((i) => i.item === 'spark');
  expectSet('sparks', sparks.map((i) => i.id), Object.keys(SPARK_REGIONS));
  for (const i of sparks) if (SPARK_REGIONS[i.id] !== i.region) err(`${i.room}: ${i.id} must be in ${SPARK_REGIONS[i.id]}`);
  const shards = pk.filter((i) => i.item === 'heartwax');
  if (shards.length !== 6) err(`heartwax shards in the world: ${shards.length}, expected 6`);
  for (const i of shards) {
    if (!/^[a-z]{2}_hw\d+$/.test(i.id)) err(`${i.room}: heartwax id ${i.id} should be <prefix>_hw<n>`);
    if (!SHARD_REGIONS.includes(i.region)) err(`${i.room}: heartwax shard in region ${i.region} (allowed: ${SHARD_REGIONS.join(' ')})`);
  }
  const urns = pk.filter((i) => i.item === 'urn');
  if (urns.length !== 1 || urns[0].region !== 'chandlery' || urns[0].id !== 'ch_urn') err(`ember urn: expected exactly ch_urn in the chandlery (found ${urns.map((u) => u.id + '@' + u.room).join(',')})`);
  const kg = pk.filter((i) => i.item === 'kiln_glass');
  expectSet('kiln glass', kg.map((i) => i.id), ['sf_kg', 'ch_kg', 'mw_kg']);
  const notch = pk.filter((i) => i.item === 'notch');
  if (notch.length !== 1 || notch[0].id !== 'gw_notch') err(`wax notch: expected exactly gw_notch in the Guttered Ways`);
  const sig = pk.filter((i) => i.item === 'sigil');
  expectSet('world sigils', sig.map((i) => i.sigil), WORLD_SIGILS);
  for (const i of sig) if (i.id !== `${prefixOf(i.room)}_sig_${i.sigil}`) err(`${i.room}: sigil pickup id ${i.id} should be ${prefixOf(i.room)}_sig_${i.sigil}`);
}
// npcs
{
  const npcs = itemsOf('npc');
  for (const n of ['thrum', 'pell', 'quill', 'bramm']) {
    const f = npcs.filter((i) => i.id === n);
    if (f.length !== 1 || f[0].region !== 'lastlight') err(`npc ${n}: expected exactly once in Lastlight`);
  }
  const wrenReg = { 1: 'guttered', 2: 'nave', 3: 'mothwood', 4: 'rime' };
  for (const [st, reg] of Object.entries(wrenReg)) {
    const f = npcs.filter((i) => i.id === 'wren' && i.stage === +st);
    if (f.length !== 1 || f[0].region !== reg) err(`npc wren:${st}: expected exactly once in ${reg}`);
  }
  const s1 = npcs.filter((i) => i.id === 'sable' && i.stage === 1);
  if (s1.length !== 1 || s1[0].region !== 'guttered') err('npc sable:1: expected exactly once in the Guttered Ways');
  const s2 = npcs.filter((i) => i.id === 'sable' && i.stage === 2);
  if (s2.length !== 1 || s2[0].region !== 'rime') err('npc sable:2: expected exactly once in the Rime');
  for (const i of npcs) if (!['thrum', 'pell', 'quill', 'bramm', 'wren', 'sable'].includes(i.id) || (['wren', 'sable'].includes(i.id) && !i.stage)) err(`${i.room}: bad npc ${i.spec}`);
}
// geodes
{
  const g = itemsOf('geode');
  for (const i of g) if (prefixOf(i.id) !== prefixOf(i.room)) err(`${i.room}: geode ${i.id} prefix mismatch`);
  for (const [reg, spec] of Object.entries(REGIONS)) {
    const n = g.filter((i) => i.region === reg).length;
    if (n < spec.geodes[0] || n > spec.geodes[1]) err(`region ${reg}: ${n} geodes (expected ${spec.geodes[0]}-${spec.geodes[1]})`);
  }
}
// arenas
{
  const ar = itemsOf('arena');
  expectSet('arenas', ar.map((i) => i.id), BOSSES);
  for (const i of ar) {
    const spec = ARENAS[i.id];
    const r = byId.get(i.room);
    if (!spec || !r) continue;
    if (spec.region !== i.region) err(`arena ${i.id} must be in ${spec.region} (is in ${i.region})`);
    if (r.kind !== 'arena') err(`${r.id}: arena room must have kind 'arena'`);
    if (!spec.sizes.some(([w, h]) => r.w === w && r.h === h)) err(`${r.id}: arena ${i.id} is ${r.w}x${r.h}, expected ${spec.sizes.map((s) => s.join('x')).join(' or ')}`);
    if (items.filter((x) => x.room === r.id && x.kind === 'arena').length !== 1) err(`${r.id}: more than one arena`);
  }
  for (const r of byId.values()) if (r.kind === 'arena' && !ar.some((i) => i.room === r.id)) err(`${r.id}: kind 'arena' without an arena content`);
  // effigy: its west exit is gated by boss:effigy
  const eff = ar.find((i) => i.id === 'effigy');
  if (eff) {
    const r = byId.get(eff.room);
    const w = r.exits.find((e) => e.side === 'W');
    if (!w) err(`${r.id}: effigy arena needs a west exit`);
    else {
      const into = r.paths.filter((p) => p.to === w.id);
      if (!into.length || into.some((p) => !p.requires.includes('boss:effigy'))) err(`${r.id}: every path to the west exit must require boss:effigy`);
      const g = itemsOf('gate').find((x) => x.room === r.id && x.cond === 'boss:effigy');
      if (!g) err(`${r.id}: expected a gate opened by boss:effigy`);
      const wr = byId.get(w.to);
      if (wr && wr.region !== 'meltbloom') err(`${r.id}: effigy's west exit must lead to Meltbloom`);
    }
  }
}
// shrines
{
  const sh = itemsOf('shrine');
  expectSet('shrines', sh.map((i) => i.id), ABILITIES);
  for (const i of sh) {
    const spec = SHRINES[i.id];
    if (spec.region !== i.region) err(`shrine ${i.id} must be in ${spec.region} (is in ${i.region})`);
    if ((i.cond || '') !== spec.cond) err(`shrine ${i.id}: condition '${i.cond}' (expected '${spec.cond}')`);
  }
}
// sealdoor, levers & gates
{
  const sd = itemsOf('sealdoor');
  if (sd.length !== 1 || sd[0].region !== 'rime') err('sealdoor: expected exactly one, in the Rime');
  const levers = itemsOf('lever'), gates = itemsOf('gate');
  for (const l of levers) if (prefixOf(l.id) !== prefixOf(l.room)) err(`${l.room}: lever ${l.id} prefix mismatch`);
  for (const g of gates) {
    if (prefixOf(g.id) !== prefixOf(g.room)) err(`${g.room}: gate ${g.id} prefix mismatch`);
    const m = /^lever:([a-z]{2}_lv\d+)$/.exec(g.cond);
    if (m) {
      if (!levers.some((l) => l.id === m[1])) err(`${g.room}: gate ${g.id} opens on missing lever ${m[1]}`);
      if (g.id.replace('gate', 'lv') !== m[1]) warn(`${g.room}: gate ${g.id} / lever ${m[1]} numbering differs`);
    } else if (!/^boss:[a-z0-9]+$/.test(g.cond) && g.cond !== 'seals>=3') err(`${g.room}: gate ${g.id} has unsupported condition '${g.cond}'`);
  }
  for (const l of levers) if (!gates.some((g) => g.cond === 'lever:' + l.id)) err(`lever ${l.id} opens no gate`);
}
// enemies
for (const i of itemsOf('enemy')) {
  if (!ALL_ENEMIES.has(i.id)) err(`${i.room}: unknown enemy kind ${i.id}`);
  if (i.n < 1 || i.n > 8) err(`${i.room}: enemy count ${i.n} out of range`);
  if (['lastlight', 'sanctum'].includes(i.region)) err(`${i.room}: no regular enemies allowed in ${i.region}`);
  else if (ENEMY_KINDS[i.region] && !ENEMY_KINDS[i.region].includes(i.id)) warn(`${i.room}: ${i.id} is not a ${i.region} enemy`);
}
for (const r of byId.values()) {
  if (r.kind === 'arena') continue;
  if (!items.some((i) => i.room === r.id && i.kind === 'landmark')) warn(`${r.id}: no landmark description`);
}

// notes must not contradict the exits: "W1 (rows 12-14)", "S1 cols 40-43" ...
for (const r of byId.values()) {
  const re = /\b([NSWE]\d) \(?(rows|cols) (\d+)-(\d+)/g;
  let m;
  while ((m = re.exec(r.notes || ''))) {
    const e = exitOf(r, m[1]);
    if (!e) { err(`${r.id}: notes mention ${m[1]} but the room has no such exit`); continue; }
    const want = e.side === 'W' || e.side === 'E' ? 'rows' : 'cols';
    if (m[2] !== want || +m[3] !== e.pos || +m[4] !== e.pos + e.size - 1) err(`${r.id}: notes say "${m[0]}" but ${e.id} is ${want} ${e.pos}-${e.pos + e.size - 1}`);
  }
}

// ------------------------------------------------------------------ 6. graph connectivity (ignoring requirements)
{
  const seen = new Set(['sh_01']);
  const q = ['sh_01'];
  while (q.length) { const id = q.shift(); for (const e of (byId.get(id) || { exits: [] }).exits) if (byId.has(e.to) && !seen.has(e.to)) { seen.add(e.to); q.push(e.to); } }
  for (const id of byId.keys()) if (!seen.has(id)) err(`${id}: not connected to the rest of the world`);
}

// ------------------------------------------------------------------ 7. progression simulation
// State = bitmask of acquired flags (abilities, boss:<id>, lever:<id>). Nodes = (room, exit).
const FLAG_NAMES = [...REQ_ABILITIES, 'bolt', ...BOSSES.map((b) => 'boss:' + b), ...itemsOf('lever').map((l) => 'lever:' + l.id)];
const BIT = new Map(FLAG_NAMES.map((f, i) => [f, 2 ** i]));
const SEALS_BIT = 2 ** FLAG_NAMES.length;
const KEEPER_BITS = KEEPERS.map((k) => BIT.get('boss:' + k));
const NBITS = FLAG_NAMES.length;
const bitOf = (t) => (t === 'seals>=3' ? SEALS_BIT : BIT.get(t));
function reqMask(req) { let m = 0; for (const t of req || []) { const b = bitOf(t); if (b === undefined) return null; m |= b; } return m; }
function eff(mask) { let n = 0; for (const b of KEEPER_BITS) if (mask & b) n++; return n >= 3 ? (mask | SEALS_BIT) : mask; }
const has = (mask, bits) => (mask & bits) === bits; // all flags fit in 30 bits (checked below)
if (NBITS + 1 > 30) err(`too many progression flags (${NBITS}) for the bitmask simulation`);
function condMask(cond) {
  if (!cond) return 0;
  let m = 0;
  for (const term of cond.split('&').map((s) => s.trim())) {
    const t = term.startsWith('ability:') ? term.slice(8) : term;
    const b = bitOf(t);
    if (b === undefined) { err(`unsupported condition term '${term}'`); return null; }
    m |= b;
  }
  return m;
}

const nodes = [];
const nodeIdx = new Map();
for (const r of byId.values()) for (const e of r.exits) { nodeIdx.set(r.id + '.' + e.id, nodes.length); nodes.push({ room: r.id, exit: e.id, region: r.region }); }
const fwd = nodes.map(() => []);
const rev = nodes.map(() => []);
function addEdge(a, b, m) { fwd[a].push([b, m]); rev[b].push([a, m]); }
for (const r of byId.values()) {
  for (const e of r.exits) {
    const a = nodeIdx.get(r.id + '.' + e.id), b = nodeIdx.get(e.to + '.' + e.toExit);
    if (a !== undefined && b !== undefined) addEdge(a, b, 0); // stepping through a doorway is free
  }
  for (const p of r.paths) {
    const a = nodeIdx.get(r.id + '.' + p.from), b = nodeIdx.get(r.id + '.' + p.to);
    const m = reqMask(p.requires);
    if (a !== undefined && b !== undefined && m !== null) addEdge(a, b, m);
  }
}
// spots: {room, spotId, node, mask, grantBit, condMask, item}
const spots = [];
for (const r of byId.values()) for (const s of r.spots) {
  const it = items.find((i) => i.room === r.id && i.spotId === s.id);
  const node = nodeIdx.get(r.id + '.' + s.from);
  const m = reqMask(s.requires);
  if (!it || node === undefined || m === null) continue;
  spots.push({ room: r.id, region: r.region, spotId: s.id, node, mask: m, grantBit: it.grant ? BIT.get(it.grant) : 0, grant: it.grant || null, cond: it.kind === 'shrine' ? condMask(it.cond) : 0, item: it, secret: s.secret || null });
}
const startSpots = spots.filter((s) => s.spotId === 'start');
const homeSpots = spots.filter((s) => s.room === HOME.room && s.spotId === HOME.spot);
if (!startSpots.length) err('no start spot');
if (!homeSpots.length) err(`no spot for the home sconce ${HOME.spot} in ${HOME.room}`);

function reach(mask) {
  const e = eff(mask);
  const seen = new Uint8Array(nodes.length);
  const q = [];
  for (const s of startSpots) if (has(e, s.mask) && !seen[s.node]) { seen[s.node] = 1; q.push(s.node); }
  while (q.length) { const a = q.pop(); for (const [b, m] of fwd[a]) if (!seen[b] && has(e, m)) { seen[b] = 1; q.push(b); } }
  return seen;
}
function canReturn(mask) {
  const e = eff(mask);
  const seen = new Uint8Array(nodes.length);
  const q = [];
  for (const s of homeSpots) if (has(e, s.mask) && !seen[s.node]) { seen[s.node] = 1; q.push(s.node); }
  while (q.length) { const b = q.pop(); for (const [a, m] of rev[b]) if (!seen[a] && has(e, m)) { seen[a] = 1; q.push(a); } }
  return seen;
}
function available(mask, R) {
  const e = eff(mask);
  const out2 = [];
  for (const s of spots) if (s.grantBit && !has(mask, s.grantBit) && R[s.node] && has(e, s.mask) && has(e, s.cond)) out2.push(s);
  return out2;
}
function closureBlocking(blockBits, mask = 0) {
  for (;;) { const av = available(mask, reach(mask)).filter((s) => !(s.grantBit & blockBits)); if (!av.length) return mask; for (const s of av) mask |= s.grantBit; }
}
function closure(mask) { for (;;) { const av = available(mask, reach(mask)); if (!av.length) return mask; for (const s of av) mask |= s.grantBit; } }
const describe = (mask) => FLAG_NAMES.filter((f) => has(mask, BIT.get(f))).join(' ') || '(nothing)';

const stateSeen = new Map(); // mask -> true
const stateQ = [0];
stateSeen.set(0, true);
const spotReached = new Set();
const nodeReached = new Uint8Array(nodes.length);
const trapReports = new Map(); // true traps
const leverReturns = new Map(); // returns that need a lever found on the player's own side (strictly a state change)
const LEVER_BITS = itemsOf('lever').map((l) => BIT.get('lever:' + l.id));
function reachFrom(mask, startNodes) {
  const e = eff(mask);
  const seen = new Uint8Array(nodes.length);
  const q = [...startNodes];
  for (const n of q) seen[n] = 1;
  while (q.length) { const a = q.pop(); for (const [b, m] of fwd[a]) if (!seen[b] && has(e, m)) { seen[b] = 1; q.push(b); } }
  return seen;
}
// From node n under mask: strike every lever reachable from n (iterating), then test the return home.
// Returns the levers needed, or null if the position is a true trap.
function localLeverReturn(mask, n) {
  let m = mask;
  for (;;) {
    const R = reachFrom(m, [n]);
    if (homeSpots.some((h) => R[h.node] && has(eff(m), h.mask))) return m & ~mask;
    const e = eff(m);
    let grew = false;
    for (const sp of spots) if (LEVER_BITS.includes(sp.grantBit) && !has(m, sp.grantBit) && R[sp.node] && has(e, sp.mask)) { m |= sp.grantBit; grew = true; }
    if (!grew) return null;
  }
}
let fullMask = 0;
for (const f of FLAG_NAMES) fullMask |= BIT.get(f);
const t0 = Date.now();
while (stateQ.length) {
  const mask = stateQ.shift();
  const R = reach(mask);
  const H = canReturn(mask);
  const e = eff(mask);
  for (let i = 0; i < nodes.length; i++) if (R[i]) {
    nodeReached[i] = 1;
    if (!H[i]) {
      const k = nodes[i].room + '.' + nodes[i].exit;
      const lv = localLeverReturn(mask, i);
      if (lv === null) { if (!trapReports.has(k)) trapReports.set(k, describe(mask)); }
      else if (!leverReturns.has(k)) leverReturns.set(k, { state: describe(mask), levers: describe(lv) });
    }
  }
  for (const s of spots) if (R[s.node] && has(e, s.mask)) spotReached.add(s.room + '|' + s.spotId);
  for (const s of available(mask, R)) {
    const nm = mask | s.grantBit;
    if (!stateSeen.has(nm)) { stateSeen.set(nm, true); stateQ.push(nm); }
  }
}
const simMs = Date.now() - t0;
for (const [k, st] of trapReports) err(`NO-TRAP: ${k} is reachable but cannot return to ${HOME.room} (${HOME.spot}) with [${st}], not even after striking the levers within reach`);
// strict rule (task contract): the return must work under the SAME state, i.e. without a lever found on the way back
for (const [k, v] of leverReturns) err(`NO-TRAP (strict): ${k} is reachable with [${v.state}] but returning home first needs ${v.levers}`);
// completability
const finalMask = closure(0);
if (finalMask !== fullMask) err(`progression incomplete: never obtainable: ${FLAG_NAMES.filter((f) => !has(finalMask, BIT.get(f))).join(', ')}`);
// every state can still finish (monotone world, but verify)
let stuck = 0;
for (const m of stateSeen.keys()) if (closure(m) !== finalMask) { if (stuck++ < 5) err(`state [${describe(m)}] cannot reach the full completion state`); }
// every content spot reachable at some point
for (const i of items) {
  if (!i.spotId) continue;
  if (!spotReached.has(i.room + '|' + i.spotId)) err(`${i.room}: content ${i.spotId} is never reachable`);
}
for (let i = 0; i < nodes.length; i++) if (!nodeReached[i]) err(`${nodes[i].room}.${nodes[i].exit}: exit never reachable`);
for (const r of byId.values()) if (!r.exits.some((e) => nodeReached[nodeIdx.get(r.id + '.' + e.id)])) err(`${r.id}: room never reachable`);
// sanctum & lucerne
{
  const R = reach(finalMask);
  const sanct = nodes.some((n, i) => R[i] && n.region === 'sanctum');
  if (!sanct) err('the Sanctum is never reachable');
  const luc = spots.find((s) => s.spotId === 'arena:lucerne');
  if (!luc || !R[luc.node]) err('Lucerne\'s arena is never reachable');
  // the Sanctum must be gated by the seal door (all three keepers) and by Sable's second duel:
  // with everything else obtainable but one of these bosses withheld, no Sanctum room may be reachable
  for (const k of [...KEEPERS, 'sable2']) {
    const m = closureBlocking(BIT.get('boss:' + k));
    const R2 = reach(m);
    if (nodes.some((n, i) => R2[i] && n.region === 'sanctum')) err(`the Sanctum is reachable without boss:${k}`);
  }
}

// ------------------------------------------------------------------ 8. gating sanity: what each grant needs
// minimal ability sets (with any bosses/levers obtainable under them) under which each grant becomes available
function closureWithAbilities(abMask) {
  // grant only non-ability flags plus the given abilities; never grant abilities outside abMask
  let mask = abMask;
  for (;;) {
    const R = reach(mask);
    const av = available(mask, R).filter((s) => !ABILITIES.includes(s.grant) || has(abMask, s.grantBit));
    let changed = false;
    for (const s of av) if (!has(mask, s.grantBit)) { mask |= s.grantBit; changed = true; }
    if (!changed) return mask;
  }
}
const abilityBits = REQ_ABILITIES.map((a) => BIT.get(a));
const minSets = {}; // grant -> list of minimal ability-name arrays
for (let sub = 0; sub < 1 << REQ_ABILITIES.length; sub++) {
  let abMask = BIT.get('bolt');
  const names = [];
  REQ_ABILITIES.forEach((a, i) => { if (sub & (1 << i)) { abMask |= abilityBits[i]; names.push(a); } });
  const m = closureWithAbilities(abMask);
  for (const f of FLAG_NAMES) if (has(m, BIT.get(f))) {
    const list = (minSets[f] = minSets[f] || []);
    if (!list.some((s) => subset(s, names))) { for (let i = list.length - 1; i >= 0; i--) if (subset(names, list[i])) list.splice(i, 1); list.push(names); }
  }
}

// ------------------------------------------------------------------ 9. quality metrics
const report = [];
// loops per region (cycle rank of the intra-region room graph, counting each doorway once)
const loopsBy = {};
for (const [reg, list] of Object.entries(regionRooms)) {
  const ids = new Set(list.map((r) => r.id));
  let E = 0;
  for (const r of list) for (const e of r.exits) if (ids.has(e.to) && r.id < e.to) E++;
  // components
  const seen = new Set(); let C = 0;
  for (const r of list) if (!seen.has(r.id)) { C++; const q = [r.id]; seen.add(r.id); while (q.length) { const x = q.pop(); for (const e of byId.get(x).exits) if (ids.has(e.to) && !seen.has(e.to)) { seen.add(e.to); q.push(e.to); } } }
  loopsBy[reg] = E - list.length + C;
  if (C > 1) warn(`region ${reg}: its rooms form ${C} separate clusters`);
}
for (const reg of ['guttered', 'meltbloom', 'flue', 'nave', 'chandlery', 'mothwood', 'rime']) if ((loopsBy[reg] || 0) < 2) err(`region ${reg}: only ${loopsBy[reg] || 0} loop(s), need >= 2`);
// one-way shortcuts: lever gates + inter-room drops (a doorway passable in one direction only)
const oneWays = [];
for (const g of itemsOf('gate')) if (g.cond.startsWith('lever:')) oneWays.push(`${g.room}: lever gate ${g.id} (${g.cond})`);
function canLeave(r, e) { return r.paths.some((p) => p.to === e.id) || (r.exits.length === 1 && r.spots.some((s) => s.from === e.id)); }
function canEnter(r, e) { return r.paths.some((p) => p.from === e.id) || r.spots.some((s) => s.from === e.id); }
for (const r of byId.values()) for (const e of r.exits) {
  const b = byId.get(e.to); if (!b || r.id > b.id) continue;
  const be = exitOf(b, e.toExit); if (!be) continue;
  const ab = canLeave(r, e) && canEnter(b, be);
  const ba = canLeave(b, be) && canEnter(r, e);
  if (ab !== ba) oneWays.push(`${ab ? r.id + ' -> ' + b.id : b.id + ' -> ' + r.id} (one-way passage)`);
}
if (oneWays.length < 6) err(`only ${oneWays.length} one-way shortcuts (need >= 6)`);
// secrets
const secretSpots = new Map();
for (const r of byId.values()) {
  if (r.secret) secretSpots.set(r.id, `room ${r.id}: ${r.secret}`);
  for (const s of r.spots) if (s.secret && !secretSpots.has(r.id + s.id)) secretSpots.set(r.id + s.id, `${r.id} ${s.id}: ${s.secret}`);
}
if (secretSpots.size < 10) err(`only ${secretSpots.size} secret areas behind breakable walls (need >= 10)`);
// backtracking: optional rewards in earlier regions that a later ability unlocks
const abilityRegion = {};
for (const i of itemsOf('shrine')) abilityRegion[i.id] = i.region;
const backtrack = {};
for (const a of REQ_ABILITIES) {
  const ar = REGION_ORDER.indexOf(abilityRegion[a]);
  const found = new Set();
  for (const r of byId.values()) {
    if (REGION_ORDER.indexOf(r.region) >= ar) continue;
    const byspot = {};
    for (const s of r.spots) (byspot[s.id] = byspot[s.id] || []).push(s.requires);
    for (const [sid, reqs] of Object.entries(byspot)) {
      if (sid.startsWith('shrine') || sid.startsWith('arena') || sid.startsWith('lever')) continue;
      // gated by the ability: every way to it needs some ability, and some way uses this one
      if (reqs.every((q) => q.some((t) => REQ_ABILITIES.includes(t))) && reqs.some((q) => q.includes(a))) found.add(`${r.id} ${sid}`);
    }
  }
  backtrack[a] = [...found];
  if (found.size < 3) err(`ability ${a}: only ${found.size} optional rewards in earlier regions (need >= 3)`);
}
// a sconce in or next to every arena
for (const i of itemsOf('arena')) {
  const r = byId.get(i.room);
  const near = [r.id, ...r.exits.map((e) => e.to)];
  if (!itemsOf('sconce').some((s) => near.includes(s.room))) err(`arena ${i.id} (${r.id}): no sconce in an adjacent room`);
}

// ------------------------------------------------------------------ 10. critical path and alternatives
const INTENDED = ['bolt', 'boss:effigy', 'boss:sable1', 'dash', 'boss:matron', 'grip', 'lever:sf_lv1', 'oilcloak', 'boss:tallowmere',
  'plunge', 'boss:kilnmother', 'wings', 'boss:vespertine', 'lever:mw_lv1', 'boss:sable2', 'lever:ri_lv1', 'boss:lucerne'];
function routeRooms(mask, fromNodes, targetNode) {
  const e = eff(mask);
  const prev = new Int32Array(nodes.length).fill(-2);
  const q = [];
  for (const n of fromNodes) { prev[n] = -1; q.push(n); }
  for (let h = 0; h < q.length; h++) {
    const a = q[h];
    if (a === targetNode) break;
    for (const [b, m] of fwd[a]) if (prev[b] === -2 && has(e, m)) { prev[b] = a; q.push(b); }
  }
  if (prev[targetNode] === -2) return null;
  const seq = [];
  for (let n = targetNode; n !== -1; n = prev[n]) seq.push(nodes[n].room);
  seq.reverse();
  return seq.filter((x, k) => k === 0 || x !== seq[k - 1]);
}
const critical = [];
{
  let mask = 0;
  let here = startSpots.map((s) => s.node);
  for (const g of INTENDED) {
    if (!BIT.has(g)) { err(`intended step ${g} is not a known flag`); continue; }
    const R = reach(mask);
    const s = available(mask, R).find((x) => x.grant === g);
    if (!s) { err(`critical path: ${g} is not obtainable after [${describe(mask)}]`); continue; }
    const route = routeRooms(mask, here, s.node) || [];
    critical.push({ step: g, room: s.room, route });
    mask |= s.grantBit;
    here = [s.node];
  }
}
// feasible ability orders (greedy with all non-ability grants is exact because the world is monotone)
function orderFeasible(order) {
  let mask = 0;
  for (const a of order) {
    mask = closureWithAbilities(mask); // every boss/lever obtainable with the abilities held so far
    if (!available(mask, reach(mask)).some((s) => s.grant === a)) return false;
    mask |= BIT.get(a);
  }
  return true;
}
function perms(a) { if (a.length <= 1) return [a]; const r = []; a.forEach((x, i) => perms(a.slice(0, i).concat(a.slice(i + 1))).forEach((p) => r.push([x, ...p]))); return r; }
const orders = perms(ABILITIES).filter(orderFeasible);
// keeper orders
const keeperOrders = perms(KEEPERS).filter((ord) => {
  let mask = 0;
  for (const k of ord) {
    // everything except the other not-yet-beaten keepers (and things that need their seals)
    const blocked = KEEPERS.filter((x) => !ord.slice(0, ord.indexOf(k) + 1).includes(x)).map((x) => BIT.get('boss:' + x));
    for (;;) {
      const av = available(mask, reach(mask)).filter((s) => !blocked.includes(s.grantBit));
      const before = mask;
      for (const s of av) mask |= s.grantBit;
      if (mask === before) break;
    }
    if (!has(mask, BIT.get('boss:' + k))) return false;
  }
  return true;
});

if (ORDERS_JSON) {
  console.log(JSON.stringify({ ok: !errors.length, errors: errors.length, orders }));
  process.exit(0);
}

// ------------------------------------------------------------------ output
out(`GUTTERLIGHT world plan check: ${path.relative(ROOT, planFile)}`);
out(`rooms ${byId.size}; exits ${nodes.length}; paths ${rooms.reduce((n, r) => n + r.paths.length, 0)}; spots ${rooms.reduce((n, r) => n + r.spots.length, 0)}; contents ${items.length}`);
out(`regions: ${Object.entries(REGIONS).map(([k]) => `${k} ${(regionRooms[k] || []).length}`).join(', ')}`);
out(`progression: ${stateSeen.size} reachable ability/flag states explored in ${simMs} ms; final state = all ${NBITS} flags: ${finalMask === fullMask ? 'yes' : 'NO'}`);
out('');
out('INTENDED CRITICAL PATH');
critical.forEach((c, k) => out(`  ${String(k + 1).padStart(2)}. ${c.step.padEnd(16)} @ ${c.room}   route: ${c.route.join(' > ')}`));
out('');
out(`ALTERNATIVE ORDERS: ${orders.length} feasible ability acquisition orders (of 720), e.g.`);
for (const o of orders.slice(0, VERBOSE ? orders.length : 6)) out(`  ${o.join(' > ')}`);
out(`  keeper (seal) orders feasible: ${keeperOrders.map((o) => o.join(' > ')).join(' | ')}`);
out('');
out('GATING TABLE (minimal ability sets that make each grant obtainable)');
for (const f of FLAG_NAMES) out(`  ${f.padEnd(16)} ${(minSets[f] || [['IMPOSSIBLE']]).map((s) => '[' + s.join(',') + ']').join(' or ')}`);
out('');
out(`NO-TRAP: checked in all ${stateSeen.size} states: ${trapReports.size} trapped positions; ${leverReturns.size} positions whose only way home needs a lever on the player's own side (both must be 0).`);
{
  const byLever = {};
  for (const [k, v] of leverReturns) (byLever[v.levers] = byLever[v.levers] || []).push(k);
  for (const [lv, ks] of Object.entries(byLever)) out(`  via ${lv}: ${ks.length} positions (${ks.slice(0, 8).join(', ')}${ks.length > 8 ? ', ...' : ''})`);
}
out('');
out(`LOOPS per region (cycle rank): ${Object.entries(loopsBy).map(([k, v]) => `${k} ${v}`).join(', ')}`);
out(`ONE-WAY SHORTCUTS (${oneWays.length}):`);
for (const s of oneWays) out(`  ${s}`);
out(`SECRETS behind breakable walls (${secretSpots.size}):`);
if (VERBOSE) for (const s of secretSpots.values()) out(`  ${s}`);
out('BACKTRACKING REWARDS (optional rewards in earlier regions unlocked by each later ability):');
for (const [a, list] of Object.entries(backtrack)) out(`  ${a.padEnd(8)} (${abilityRegion[a]}): ${list.length}  ${list.join('; ')}`);
out('');
for (const w of warnings) out(`WARN  ${w}`);
for (const e of errors) console.log(`ERROR ${e}`);
console.log(errors.length ? `\nFAIL: ${errors.length} error(s), ${warnings.length} warning(s)` : `\nOK: 0 errors, ${warnings.length} warning(s)`);
process.exit(errors.length ? 1 : 0);
