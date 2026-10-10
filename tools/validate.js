#!/usr/bin/env node
// tools/validate.js — static validation of all room data (TECH_SPEC §7, §9.1, §17-19) in Node.
//
//   node tools/validate.js                   all non-dev rooms + world/plan/totals checks
//   node tools/validate.js --room gw_03      one room (the world is still loaded for neighbours/references)
//   node tools/validate.js --dev             include dev rooms (region 'test')
//   node tools/validate.js --json            machine-readable report on stdout
//   node tools/validate.js --complete        missing planned rooms and totals shortfalls are errors
//   node tools/validate.js --plan <file>     another plan (default design/world_plan.json; --no-plan to skip)
//   node tools/validate.js --data <file>     load an extra room data file after src/data (repeatable)
//   node tools/validate.js --data-only       with --data: skip the shipped room files (src/data/regions/<r>.js,
//                                            src/data/arenas/*.js) so fixture rooms are checked in isolation
//   node tools/validate.js --quiet           only errors + summary
//
// Exit code 1 when any error is found (warnings never fail). See tools/README.md for every check and how
// to fix the usual failures.
'use strict';
const path = require('path');
const { loadWorld, ROOT, rel } = require('./lib/game_data');
const PlanLib = require('./lib/plan');
const Cond = require('./lib/conditions');
const Reg = require('./lib/registry');

// ------------------------------------------------------------------------------------------------ args
function parseArgs(argv) {
  const a = { rooms: [], dev: false, json: false, complete: false, plan: null, noPlan: false, data: [], quiet: false };
  for (let i = 2; i < argv.length; i++) {
    const k = argv[i];
    const v = () => { if (i + 1 >= argv.length) { console.error('validate: ' + k + ' needs a value'); process.exit(2); } return argv[++i]; };
    if (k === '--room') a.rooms.push(...v().split(','));
    else if (k === '--dev') a.dev = true;
    else if (k === '--json') a.json = true;
    else if (k === '--complete') a.complete = true;
    else if (k === '--plan') a.plan = v();
    else if (k === '--no-plan') a.noPlan = true;
    else if (k === '--data') a.data.push(v());
    else if (k === '--data-only') { a.dataOnly = true; process.env.GUTTERLIGHT_DATA_ONLY = '1'; }
    else if (k === '--quiet' || k === '-q') a.quiet = true;
    else if (k === '--help' || k === '-h') a.help = true;
    else { console.error('validate: unknown argument ' + k); process.exit(2); }
  }
  return a;
}

// ------------------------------------------------------------------------------------------------ report
class Report {
  constructor() { this.items = []; }
  add(level, scope, code, msg) { this.items.push({ level, scope, code, msg }); }
  err(scope, code, msg) { this.add('error', scope, code, msg); }
  warn(scope, code, msg) { this.add('warning', scope, code, msg); }
  get errors() { return this.items.filter((x) => x.level === 'error'); }
  get warnings() { return this.items.filter((x) => x.level === 'warning'); }
}

const SOLID_CH = new Set(['#', 'X', 'B', 'D']);
const TILE_CH = new Set(['.', '#', 'X', '=', '^', '~', '%', 'B', 'D', ':']);
const isMarker = (ch) => /^[a-z0-9]$/.test(ch);
const isOpenCh = (ch) => ch !== '#' && ch !== 'X';
const ranges = (nums) => {
  const s = Array.from(new Set(nums)).sort((a, b) => a - b);
  const out = [];
  for (let i = 0; i < s.length; i++) {
    let j = i;
    while (j + 1 < s.length && s[j + 1] === s[j] + 1) j++;
    out.push(i === j ? String(s[i]) : s[i] + '-' + s[j]);
    i = j;
  }
  return out.join(',');
};
// ground-standing entity heights in tiles (headroom check) — from src/entities/interactables.js / npcs.js
const GROUND_TYPES = { sconce: 2, npc: 2, lanternway: 3, shrine: 2, lore: 2, geode: 1, start: 2, lever: 2, pickup: 1, sealdoor: 6 };

// ------------------------------------------------------------------------------------------------ main
function main() {
  const A = parseArgs(process.argv);
  if (A.help) { console.log(require('fs').readFileSync(__filename, 'utf8').split('\n').slice(1, 15).join('\n')); return 0; }
  const R = new Report();
  const W = loadWorld({ extra: A.data });
  const G = W.G;
  const reg = Reg.scanRegistry();
  for (const e of W.loadErrors) R.err('load', 'load', e.file + ': ' + String(e.error).split('\n')[0]);
  for (const f of A.data) if (!require('fs').existsSync(path.resolve(ROOT, f))) R.err('load', 'load', 'data file not found: ' + f);

  const P = A.noPlan ? { plan: null, missing: true } : PlanLib.loadPlan(A.plan ? path.resolve(A.plan) : null);
  if (P.error) R.err('plan', 'plan', 'world plan ' + rel(P.file) + ': ' + P.error);
  const plan = P.plan;
  const planRooms = new Map(plan ? plan.rooms.map((r) => [r.id, r]) : []);

  // room defs (first definition wins in G.World; report duplicates)
  const seen = new Map();
  const allDefs = [];
  for (const d of W.defs) {
    const id = d.def && d.def.id;
    if (!id || typeof id !== 'string') { R.err('load', 'id', 'room without a string id in ' + d.file); continue; }
    if (seen.has(id)) { R.err(id, 'id', 'room id defined twice: ' + seen.get(id) + ' and ' + d.file); continue; }
    seen.set(id, d.file);
    allDefs.push(d);
  }
  const isDev = (def) => !!def.dev || def.region === 'test';
  const worldDefs = allDefs.filter((d) => A.dev || !isDev(d.def));
  const selected = A.rooms.length ? worldDefs.filter((d) => A.rooms.includes(d.def.id)) : worldDefs;
  for (const id of A.rooms) {
    if (!allDefs.some((d) => d.def.id === id)) R.err(id, 'room', 'room "' + id + '" is not defined' + (planRooms.has(id) ? ' (it is in the plan, not built yet)' : ''));
    else if (!worldDefs.some((d) => d.def.id === id)) R.warn(id, 'room', 'room "' + id + '" is a dev room — add --dev to validate it');
  }

  // ---- world-wide id indexes (non-dev world, or everything with --dev)
  const specsByRoom = new Map();
  for (const d of worldDefs) {
    let specs = [];
    try { specs = G.World.entitySpecsOf(d.def) || []; } catch (e) { R.err(d.def.id, 'entity', 'cannot read entities: ' + e.message); }
    specsByRoom.set(d.def.id, specs);
  }
  const idx = { lever: new Set(), pickup: new Set(), persistent: new Set(), gate: new Set() };
  for (const [, specs] of specsByRoom) for (const s of specs) {
    const p = s.props || {};
    if (p.type === 'lever' && p.id) idx.lever.add(p.id);
    if (p.type === 'pickup' && p.id) idx.pickup.add(p.id);
    if ((p.type === 'gate' || p.type === 'arena_gate') && p.id) idx.gate.add(p.id);
    if (p.type === 'enemy' && p.id) idx.persistent.add(p.id);
  }
  for (const s of (G.Items && G.Items.shops && G.Items.shops.pell) || []) if (s.id) idx.pickup.add(s.id);
  const planLevers = new Set();
  if (plan) for (const r of plan.rooms) for (const c of r.contents || []) { const pc = PlanLib.parseContent(c); if (pc.type === 'lever') planLevers.add(pc.id); }
  const npcTalks = new Map();
  for (const [k, v] of Object.entries((G.Text && G.Text.npcs) || {})) {
    const ids = new Set((v.talks || []).map((t) => t.id).filter(Boolean));
    npcTalks.set(k, ids);
    const base = k.replace(/_\d+$/, '');
    if (!npcTalks.has(base)) npcTalks.set(base, new Set());
    for (const i of ids) npcTalks.get(base).add(i);
  }
  const refCtx = {
    abilities: new Set(Reg.ABILITIES), bosses: new Set(Reg.BOSSES), regions: new Set(Object.keys(G.World.regions || {})),
    rooms: new Set(allDefs.map((d) => d.def.id).concat(Array.from(planRooms.keys()))),
    sigils: new Set(Object.keys((G.Items && G.Items.sigils) || {})), sparks: new Set(Object.keys((G.Text && G.Text.sparks) || {})),
    seals: new Set(Reg.SEALS), lanterns: new Set(Reg.LANTERNWAYS), levers: new Set([...idx.lever, ...planLevers]),
    pickups: idx.pickup, npcTalks, persistentIds: idx.persistent,
  };
  const checkCond = (scope, what, str) => {
    if (str == null || str === '') return;
    const parsed = Cond.parseCondition(str);
    const r = Cond.checkRefs(parsed, refCtx);
    for (const e of r.errors) R.err(scope, 'ref', what + ' condition "' + str + '": ' + e);
    for (const w of r.warnings) R.warn(scope, 'ref', what + ' condition "' + str + '": ' + w);
    for (const t of parsed.terms) if (t.kind === 'lever' && !idx.lever.has(t.arg) && planLevers.has(t.arg)) R.warn(scope, 'ref', what + ': lever "' + t.arg + '" is planned but its room is not built yet');
  };

  // ---- per-room checks
  const ctx = { G, R, reg, plan, planRooms, specsByRoom, checkCond, A, idx };
  for (const d of selected) {
    try { checkRoom(ctx, d.def, d.file); } catch (e) { R.err(d.def.id, 'internal', 'validator crashed on this room: ' + (e.stack || e).toString().split('\n').slice(0, 3).join(' | ')); }
  }

  // ---- world checks (skipped for --room)
  let coverage = null, totals = null;
  checkOverlaps(ctx, worldDefs, A.rooms.length ? new Set(selected.map((d) => d.def.id)) : null);
  if (!A.rooms.length) {
    checkUniqueIds(ctx, worldDefs);
    if (plan) coverage = checkCoverage(ctx, worldDefs);
    totals = checkTotals(ctx, worldDefs, coverage);
  }

  // ---- output
  const errors = R.errors, warnings = R.warnings;
  if (A.json) {
    console.log(JSON.stringify({ ok: errors.length === 0, rooms: selected.map((d) => d.def.id), errors, warnings, coverage, totals }, null, 1));
  } else {
    printReport(R, selected, A, plan, P, coverage, totals);
  }
  return errors.length ? 1 : 0;
}

// ------------------------------------------------------------------------------------------------ room checks
function checkRoom(ctx, def, file) {
  const { G, R, reg, planRooms } = ctx;
  const id = def.id;
  const S = (code, msg) => R.err(id, code, msg);
  const Wn = (code, msg) => R.warn(id, code, msg);
  const dev = !!def.dev || def.region === 'test';

  // ---- identity & region
  const region = G.World.regions && G.World.regions[def.region];
  if (!region) S('region', 'unknown region "' + def.region + '"');
  if (!dev) {
    if (!/^[a-z]{2}_\d{2}$/.test(id)) S('id', 'room id "' + id + '" must be <prefix>_<nn> (two digits)');
    else if (region && region.prefix && !id.startsWith(region.prefix + '_')) S('id', 'room id "' + id + '" does not use the region prefix "' + region.prefix + '_"');
  }

  // ---- tiles
  if (!Array.isArray(def.tiles) || !def.tiles.length || def.tiles.some((t) => typeof t !== 'string')) {
    S('tiles', '`tiles` must be a non-empty array of strings');
    return;
  }
  const lines = def.tiles;
  const rows = lines.length;
  const widths = new Map();
  for (const l of lines) widths.set(l.length, (widths.get(l.length) || 0) + 1);
  const cols = Array.from(widths.entries()).sort((a, b) => b[1] - a[1])[0][0];
  const bad = [];
  lines.forEach((l, r) => { if (l.length !== cols) bad.push(r + '(' + l.length + ')'); });
  if (bad.length) S('rows', 'row lengths differ (expected ' + cols + '): rows ' + bad.slice(0, 12).join(', ') + (bad.length > 12 ? ' …' : ''));
  if (cols % 16 || cols < 32) S('dims', 'width ' + cols + ' must be a multiple of 16 and >= 32');
  if (rows % 9 || rows < 18) S('dims', 'height ' + rows + ' must be a multiple of 9 and >= 18');
  if (!Number.isInteger(def.gx) || !Number.isInteger(def.gy)) S('grid', 'gx/gy must be integers (got ' + def.gx + ', ' + def.gy + ')');
  else if (def.gx % 16 || def.gy % 9) S('grid', 'gx=' + def.gx + ', gy=' + def.gy + ' must be multiples of 16 / 9 (map cell grid)');
  const ch = (c, r) => (r >= 0 && r < rows && c >= 0 && c < lines[r].length ? lines[r][c] : '#');

  // ---- characters & legend
  const legend = def.legend || {};
  const unknown = [];
  const usedMarkers = new Map();
  for (let r = 0; r < rows; r++) for (let c = 0; c < lines[r].length; c++) {
    const k = lines[r][c];
    if (TILE_CH.has(k)) continue;
    if (isMarker(k)) { if (!usedMarkers.has(k)) usedMarkers.set(k, []); usedMarkers.get(k).push([c, r]); continue; }
    unknown.push("'" + k + "' at (" + c + ',' + r + ')');
  }
  if (unknown.length) S('chars', 'unknown tile characters: ' + unknown.slice(0, 8).join(', ') + (unknown.length > 8 ? ' (+' + (unknown.length - 8) + ' more)' : ''));
  for (const [k, cells] of usedMarkers) {
    if (!legend[k]) S('legend', "marker '" + k + "' has no legend entry (at " + cells.slice(0, 4).map((x) => '(' + x + ')').join(' ') + ')');
    else if (legend[k] && legend[k].id && cells.length > 1) S('legend', "marker '" + k + "' has an id (" + legend[k].id + ') but appears ' + cells.length + ' times');
  }
  for (const k of Object.keys(legend)) {
    if (!isMarker(k)) S('legend', "legend key '" + k + "' must be a single a-z / 0-9 character");
    else if (!usedMarkers.has(k)) Wn('legend', "legend key '" + k + "' (" + ((legend[k] && legend[k].type) || '?') + ') is not used in the tiles');
    if (!legend[k] || typeof legend[k] !== 'object' || !legend[k].type) S('legend', "legend '" + k + "' has no `type`");
  }
  if (def.entities != null && !Array.isArray(def.entities)) S('entity', '`entities` must be an array');

  // ---- boundary: corners, B/D on the border, openings matched by the neighbour
  for (const [c, r] of [[0, 0], [cols - 1, 0], [0, rows - 1], [cols - 1, rows - 1]]) {
    if (isOpenCh(ch(c, r))) S('corner', 'corner tile (' + c + ',' + r + ") is '" + ch(c, r) + "' — openings must not touch corners");
  }
  const sides = [
    ['W', rows, (i) => [0, i], (i) => [def.gx - 1, def.gy + i]],
    ['E', rows, (i) => [cols - 1, i], (i) => [def.gx + cols, def.gy + i]],
    ['N', cols, (i) => [i, 0], (i) => [def.gx + i, def.gy - 1]],
    ['S', cols, (i) => [i, rows - 1], (i) => [def.gx + i, def.gy + rows]],
  ];
  if (Number.isInteger(def.gx) && Number.isInteger(def.gy)) {
    for (const [side, n, local, outside] of sides) {
      const noRoom = [], closed = new Map(), liquidMismatch = [], border = [];
      for (let i = 1; i < n - 1; i++) {
        const [c, r] = local(i);
        const k = ch(c, r);
        if (!isOpenCh(k)) continue;
        if (k === 'B' || k === 'D') border.push(i);
        const [ogx, ogy] = outside(i);
        const nb = G.World.roomAtGlobal(ogx + 0.5, ogy + 0.5);
        if (!nb || nb.id === id) { noRoom.push(i); continue; }
        const nc = ogx - nb.gx, nr = ogy - nb.gy;
        const nk = nb.tiles && nb.tiles[nr] ? nb.tiles[nr][nc] : undefined;
        if (nk === undefined || !isOpenCh(nk)) {
          if (!closed.has(nb.id)) closed.set(nb.id, []);
          closed.get(nb.id).push({ i, nc, nr, nk });
        } else if ((k === '~' || k === '%' || nk === '~' || nk === '%') && k !== nk) liquidMismatch.push(i + "('" + k + "'|'" + nk + "')");
      }
      const axis = side === 'W' || side === 'E' ? 'rows' : 'cols';
      const glob = (i) => { const [x, y] = outside(i); return side === 'W' ? (x + 1) + ',' + y : side === 'E' ? (x - 1) + ',' + y : side === 'N' ? x + ',' + (y + 1) : x + ',' + (y - 1); };
      if (border.length) S('opening', side + ' border ' + axis + ' ' + ranges(border) + ' are B/D tiles — the engine treats them as openings; use # or X on the border');
      // openings into a PLANNED room that is not built yet are expected while builders work in parallel
      const planned = (i) => { const [x, y] = outside(i); return ctx.plan && ctx.plan.rooms.find((q) => x >= q.gx && x < q.gx + q.w && y >= q.gy && y < q.gy + q.h && !G.World.getRoom(q.id)); };
      const pend = noRoom.filter((i) => planned(i));
      if (pend.length) Wn('opening', side + ' opening at ' + axis + ' ' + ranges(pend) + ' leads to planned room ' + planned(pend[0]).id + ' (not built yet: matching not checked)');
      noRoom.splice(0, noRoom.length, ...noRoom.filter((i) => !planned(i)));
      if (noRoom.length) {
        const markers = noRoom.filter((i) => isMarker(ch(...local(i))));
        S('opening', side + ' opening at ' + axis + ' ' + ranges(noRoom) + ' (global ' + glob(noRoom[0]) + (noRoom.length > 1 ? '..' + glob(noRoom[noRoom.length - 1]) : '') + ') leads to no room' +
          (markers.length ? ' — note: entity markers on the border (' + axis + ' ' + ranges(markers) + ') count as open tiles' : ''));
      }
      for (const [nbId, list] of closed) {
        const nb = G.World.getRoom(nbId);
        const nbCells = list.map((x) => '(' + x.nc + ',' + x.nr + ")='" + (x.nk == null ? '?' : x.nk) + "' [global " + (nb.gx + x.nc) + ',' + (nb.gy + x.nr) + ']');
        S('opening', side + ' opening at ' + axis + ' ' + ranges(list.map((x) => x.i)) + ' faces closed tiles of ' + nbId + ' ' + nbCells.slice(0, 4).join(' ') + (nbCells.length > 4 ? ' …' : '') + ' — both rooms must open the same global tiles');
      }
      if (liquidMismatch.length) Wn('liquid', side + ' opening ' + axis + ' ' + liquidMismatch.join(', ') + ': liquid does not continue into the neighbour');
    }
  }
  let room = null;
  try { room = G.World.createRoom(def, { tileOnly: true }); } catch (e) { S('tiles', 'G.World.createRoom failed: ' + e.message); }
  if (room) {
    for (const o of room.openings) {
      if ((o.side === 'W' || o.side === 'E')) {
        if (o.size < 3) Wn('exit-size', o.side + ' exit at rows ' + o.pos + '-' + (o.pos + o.size - 1) + ' is ' + o.size + ' tile(s) tall (horizontal exits should be >= 3)');
        const xi = o.side === 'W' ? 1 : cols - 2;
        const below = ch(xi, o.pos + o.size);
        if (!SOLID_CH.has(below) && below !== '=') Wn('exit-floor', o.side + ' exit rows ' + o.pos + '-' + (o.pos + o.size - 1) + ': no floor just inside at (' + xi + ',' + (o.pos + o.size) + ') — a player walking in falls');
      } else if (o.size < 3) Wn('exit-size', o.side + ' exit at cols ' + o.pos + '-' + (o.pos + o.size - 1) + ' is ' + o.size + ' tile(s) wide (vertical exits should be >= 3)');
    }
  }

  // ---- liquids: flat top, air above, contained
  checkLiquids(ctx, id, lines, cols, rows, ch);

  // ---- entities
  const specs = ctx.specsByRoom.get(id) || (() => { try { return G.World.entitySpecsOf(def) || []; } catch (e) { return []; } })();
  for (const s of specs) checkEntity(ctx, id, s, ch, cols, rows, dev);

  // ---- plan conformance
  const pr = planRooms.get(id);
  if (pr && room) checkPlanRoom(ctx, def, pr, room, specs);
  else if (ctx.plan && !pr && !dev) S('plan', 'room is not in the world plan (' + rel(PlanLib.DEFAULT_PLAN) + ') — every non-dev room must be planned');
  void file; void reg;
}

function checkLiquids(ctx, id, lines, cols, rows, ch) {
  const R = ctx.R;
  const seen = new Set();
  for (let r = 0; r < rows; r++) for (let c = 0; c < cols; c++) {
    const k = ch(c, r);
    if ((k !== '~' && k !== '%') || seen.has(c + ',' + r)) continue;
    // flood the pool
    const cells = [];
    const stack = [[c, r]];
    seen.add(c + ',' + r);
    let mixed = false;
    while (stack.length) {
      const [x, y] = stack.pop();
      cells.push([x, y]);
      for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        const nx = x + dx, ny = y + dy;
        if (nx < 0 || ny < 0 || nx >= cols || ny >= rows) continue;
        const nk = ch(nx, ny);
        if (nk === k && !seen.has(nx + ',' + ny)) { seen.add(nx + ',' + ny); stack.push([nx, ny]); }
        else if ((nk === '~' || nk === '%') && nk !== k) mixed = true;
      }
    }
    const top = Math.min(...cells.map((x) => x[1]));
    const name = (k === '~' ? 'water' : 'lava') + ' pool at (' + c + ',' + r + ')';
    if (mixed) R.err(id, 'liquid', name + ' touches the other liquid directly');
    const steps = [], floating = [], leaks = [];
    for (const [x, y] of cells) {
      const up = ch(x, y - 1);
      if (up !== k) {
        if (y === top) { if (SOLID_CH.has(up) && y - 1 >= 0) { /* submerged under a ceiling at surface level: fine */ } }
        else if (!SOLID_CH.has(up)) steps.push('(' + x + ',' + y + ')');
      }
      const down = y + 1 >= rows ? '#' : ch(x, y + 1);
      if (down !== k && !SOLID_CH.has(down) && !(y + 1 >= rows)) floating.push('(' + x + ',' + (y + 1) + ')');
      for (const dx of [-1, 1]) {
        const nx = x + dx;
        if (nx < 0 || nx >= cols) continue; // border openings are checked against the neighbour
        const sk = ch(nx, y);
        if (sk !== k && !SOLID_CH.has(sk) && sk !== '~' && sk !== '%') leaks.push('(' + nx + ',' + y + ')');
      }
    }
    if (steps.length) R.err(id, 'liquid', name + ': surface is not flat (top row ' + top + '; air above lower liquid tiles at ' + steps.slice(0, 6).join(' ') + ')');
    if (floating.length) R.err(id, 'liquid', name + ': liquid floats over non-solid tiles ' + floating.slice(0, 6).join(' '));
    if (leaks.length) R.err(id, 'liquid', name + ': open side walls (liquid next to air) at ' + leaks.slice(0, 6).join(' ') + ' — pools need solid rims');
    const airAbove = cells.filter(([x, y]) => y === top && !SOLID_CH.has(ch(x, y - 1)) && y > 0).length;
    if (!airAbove) R.err(id, 'liquid', name + ': no air above the surface anywhere (fully enclosed liquid)');
  }
}

function checkEntity(ctx, id, s, ch, cols, rows, dev) {
  const { R, reg, G, checkCond } = ctx;
  const p = s.props || {};
  const where = (p.type || '?') + (p.id ? ' "' + p.id + '"' : p.kind ? ' ' + p.kind : '') + ' at (' + s.tx + ',' + s.ty + ')';
  const E = (msg) => R.err(id, 'entity', where + ': ' + msg);
  const Wn = (msg) => R.warn(id, 'entity', where + ': ' + msg);
  if (!p.type) { E('no type'); return; }
  if (!Number.isFinite(+s.tx) || !Number.isFinite(+s.ty)) { E('position is not numeric'); return; }
  if (s.tx < 0 || s.ty < 0 || s.tx >= cols || s.ty >= rows) { E('outside the room (' + cols + 'x' + rows + ')'); return; }
  if (!reg.knownType(p.type)) { E('unknown entity type "' + p.type + '"'); return; }
  if (!Reg.SPEC_TYPES.includes(p.type) && !reg.entityTypes.has(p.type)) Wn('type is not registered by any src file yet');
  const need = (k) => { if (p[k] == null || p[k] === '') { E('missing required prop `' + k + '`'); return false; } return true; };
  const T = G.Text || {}, I = G.Items || {};
  switch (p.type) {
    case 'sconce': need('id'); break;
    case 'lanternway': if (need('id') && !Reg.LANTERNWAYS.includes(p.id)) E('lanternway id must be one of ' + Reg.LANTERNWAYS.join(' ')); break;
    case 'lore': if (need('id') && !(T.lore && T.lore[p.text || p.id])) E('lore id "' + (p.text || p.id) + '" not found in G.Text.lore'); break;
    case 'npc': {
      if (!need('npc')) break;
      if (!Reg.NPCS.includes(p.npc)) Wn('unknown npc "' + p.npc + '" (known: ' + Reg.NPCS.join(' ') + ')');
      const key = p.key || (p.stage != null ? p.npc + '_' + p.stage : p.npc);
      if (!(T.npcs && T.npcs[key])) {
        if (T.npcs && T.npcs[p.npc]) Wn('text key "' + key + '" missing in G.Text.npcs (falls back to "' + p.npc + '")');
        else E('no text for npc: G.Text.npcs["' + key + '"] does not exist');
      }
      checkCond(id, where, p.requires);
      break;
    }
    case 'shrine': if (need('ability') && !Reg.ABILITIES.includes(p.ability)) E('unknown ability "' + p.ability + '"'); checkCond(id, where, p.requires); break;
    case 'pickup': {
      need('id');
      if (p.give) break;
      if (!need('item')) break;
      if (!Reg.PICKUP_ITEMS.includes(p.item)) { E('unknown item "' + p.item + '" (items: ' + Reg.PICKUP_ITEMS.join(' ') + ')'); break; }
      if (p.item === 'sigil' && need('sigil') && !(I.sigils && I.sigils[p.sigil])) E('sigil "' + p.sigil + '" not in G.Items.sigils');
      if (p.item === 'seal' && need('seal') && !Reg.SEALS.includes(p.seal)) E('unknown seal "' + p.seal + '"');
      if (p.item === 'spark') { const sid = p.spark || p.id; if (!(T.sparks && T.sparks[sid])) E('spark id "' + sid + '" not in G.Text.sparks'); }
      if (p.item === 'cinders' && p.amount != null && !(+p.amount > 0)) E('cinders amount must be > 0');
      checkCond(id, where, p.requires);
      break;
    }
    case 'geode': need('id'); if (p.amount != null && !(+p.amount > 0)) E('amount must be a positive number'); break;
    case 'lever': need('id'); break;
    case 'gate': case 'arena_gate': {
      need('id');
      const w = p.w == null ? 1 : +p.w, h = p.h == null ? 4 : +p.h;
      if (!(w >= 1 && h >= 1) || !Number.isInteger(w) || !Number.isInteger(h)) { E('w/h must be positive integers (tiles)'); break; }
      const c0 = s.tx, c1 = s.tx + w - 1, r0 = s.ty - h + 1, r1 = s.ty;
      if (c1 >= cols || r0 < 0) E('gate rect cols ' + c0 + '-' + c1 + ' rows ' + r0 + '-' + r1 + ' leaves the room (the marker is the bottom-LEFT tile)');
      else {
        const solid = [];
        for (let r = r0; r <= r1; r++) for (let c = c0; c <= c1; c++) if (SOLID_CH.has(ch(c, r))) solid.push('(' + c + ',' + r + ')');
        if (solid.length) Wn('gate rect cols ' + c0 + '-' + c1 + ' rows ' + r0 + '-' + r1 + ' overlaps solid tiles ' + solid.slice(0, 4).join(' ') + ' (marker = bottom-left tile)');
      }
      if (p.type === 'gate') { if (need('opens')) checkCond(id, where, p.opens); }
      break;
    }
    case 'sealdoor': need('id'); break;
    case 'arena': {
      if (need('boss') && !Reg.BOSSES.includes(p.boss)) E('unknown boss "' + p.boss + '" (bosses: ' + Reg.BOSSES.join(' ') + ')');
      else if (p.boss && !reg.bosses.has(p.boss)) Wn('boss "' + p.boss + '" is not registered yet (G.Boss.register) — the arena would spawn the placeholder');
      if (need('bx') && need('by') && (+p.bx < 0 || +p.by < 0 || +p.bx >= cols || +p.by >= rows)) E('boss spawn (' + p.bx + ',' + p.by + ') is outside the room');
      if (!Array.isArray(p.trigger) || p.trigger.length !== 4 || p.trigger.some((v) => !Number.isFinite(+v))) E('trigger must be [c1, r1, c2, r2] (tiles)');
      else if (p.trigger.some((v, i) => +v < 0 || +v >= (i % 2 ? rows : cols))) E('trigger [' + p.trigger + '] leaves the room');
      checkCond(id, where, p.requires);
      break;
    }
    case 'enemy': {
      if (!need('kind')) break;
      if (!reg.enemyKinds.has(p.kind)) {
        if (reg.specEnemyKinds.has(p.kind)) Wn('enemy kind "' + p.kind + '" is not registered yet (registerEnemy in src/entities/enemies/)');
        else E('unknown enemy kind "' + p.kind + '"');
      }
      if (p.persistent && !p.id) E('persistent enemy needs an id');
      break;
    }
    case 'light': if (p.r != null && !(+p.r > 0)) E('r must be a positive number (tiles)'); break;
    case 'decor': if (need('kind') && reg.decor.size && !reg.decor.has(p.kind)) Wn('unknown decor prop "' + p.kind + '" (see docs/ART_GUIDE.md)'); break;
    case 'event': if (need('script') && !reg.events.has(p.script)) Wn('event script "' + p.script + '" is not registered by any src file (G.Events.' + p.script + ' = ...)'); break;
    case 'start': if (!dev && id !== 'sh_01') Wn('the start entity belongs in sh_01'); break;
    default: break;
  }
  // ground-standers: floor beneath, not embedded
  let h = GROUND_TYPES[p.type];
  if (h && !(p.type === 'pickup' && p.floating)) {
    if (p.type === 'sealdoor' && p.h != null) h = Math.max(3, +p.h || 6);
    const wHalf = p.type === 'sealdoor' ? Math.floor(Math.max(2, +p.w || 3) / 2) : 0;
    const here = ch(s.tx, s.ty);
    if (SOLID_CH.has(here) || here === '^' || here === '~' || here === '%') E("stands inside '" + here + "' — place it in the empty tile above the floor");
    else {
      const below = s.ty + 1 >= rows ? '#' : ch(s.tx, s.ty + 1);
      if (!SOLID_CH.has(below) && below !== '=') {
        // allow standing on a closed horizontal gate / grate directly beneath
        E("has no floor beneath (tile (" + s.tx + ',' + (s.ty + 1) + ") is '" + below + "') — ground-standers sit on the tile below their marker" + (p.type === 'pickup' ? ' (or set floating:true)' : ''));
      } else if (below === 'B' || below === 'D') Wn('stands on a breakable ' + below + ' tile');
      const blocked = [];
      for (let r = s.ty - h + 1; r <= s.ty; r++) for (let c = s.tx - wHalf; c <= s.tx + wHalf; c++) if (SOLID_CH.has(ch(c, r)) || r < 0) blocked.push('(' + c + ',' + r + ')');
      if (blocked.length) Wn('body (' + h + ' tiles tall) overlaps solid tiles ' + blocked.slice(0, 4).join(' '));
    }
  }
}

function checkPlanRoom(ctx, def, pr, room, specs) {
  const { R } = ctx;
  const id = def.id;
  if (pr.region !== def.region) R.err(id, 'plan-rect', 'region "' + def.region + '" differs from the plan ("' + pr.region + '")');
  if (pr.gx !== def.gx || pr.gy !== def.gy || pr.w !== room.cols || pr.h !== room.rows) {
    R.err(id, 'plan-rect', 'rect differs from the plan: built gx=' + def.gx + ' gy=' + def.gy + ' ' + room.cols + 'x' + room.rows + ', plan gx=' + pr.gx + ' gy=' + pr.gy + ' ' + pr.w + 'x' + pr.h);
  }
  // exits
  const built = room.openings.map((o) => Object.assign({ used: false }, o));
  const span = (side, pos, size) => (side === 'W' || side === 'E' ? 'rows ' : 'cols ') + pos + '-' + (pos + size - 1);
  for (const e of pr.exits || []) {
    const exact = built.find((o) => !o.used && o.side === e.side && o.pos === e.pos && o.size === e.size);
    if (exact) { exact.used = true; continue; }
    const near = built.find((o) => !o.used && o.side === e.side && o.pos < e.pos + e.size && e.pos < o.pos + o.size);
    if (near) { near.used = true; R.err(id, 'plan-exit', 'exit ' + e.id + ' (' + e.side + ') must be ' + span(e.side, e.pos, e.size) + ' (-> ' + e.to + '); built ' + span(near.side, near.pos, near.size)); }
    else R.err(id, 'plan-exit', 'planned exit ' + e.id + ' (' + e.side + ' ' + span(e.side, e.pos, e.size) + ' -> ' + e.to + '.' + e.toExit + ') is closed');
  }
  for (const o of built) if (!o.used) R.err(id, 'plan-exit', 'unplanned opening ' + o.side + ' ' + span(o.side, o.pos, o.size) + ' (the plan has no exit there)');
  // contents
  const props = specs.map((s) => s.props || {});
  const matched = new Set();
  for (const c of pr.contents || []) {
    const pc = PlanLib.parseContent(c);
    if (pc.type === 'landmark') continue;
    if (pc.type === 'unknown') { R.warn(id, 'plan-content', 'cannot parse planned content "' + c + '"'); continue; }
    const hits = props.filter((p) => PlanLib.entityMatches(pc, p));
    hits.forEach((p) => matched.add(p));
    if (pc.type === 'enemy') {
      if (hits.length !== pc.count) R.warn(id, 'plan-content', 'planned ' + pc.count + 'x enemy ' + pc.kind + ', found ' + hits.length + ' (counts are guides)');
      continue;
    }
    if (!hits.length) { R.err(id, 'plan-content', 'planned content "' + c + '" is missing'); continue; }
    const p = hits[0];
    if (pc.type === 'gate' && pc.cond != null && String(p.opens || '').replace(/\s+/g, '') !== pc.cond.replace(/\s+/g, '')) R.err(id, 'plan-content', 'gate ' + pc.id + ' opens "' + p.opens + '" but the plan says "' + pc.cond + '"');
    if (pc.type === 'shrine' && (pc.cond || '') !== String(p.requires || '')) R.warn(id, 'plan-content', 'shrine ' + pc.ability + ' requires "' + (p.requires || '') + '" but the plan says "' + (pc.cond || '') + '"');
    if (pc.type === 'pickup' && pc.item && (p.item !== pc.item || (pc.sigil && p.sigil !== pc.sigil))) R.err(id, 'plan-content', 'pickup ' + pc.id + ' is item "' + p.item + (p.sigil ? ':' + p.sigil : '') + '" but the plan says "' + pc.item + (pc.sigil ? ':' + pc.sigil : '') + '"');
    if (hits.length > 1 && pc.type !== 'decor' && pc.type !== 'light') R.warn(id, 'plan-content', 'planned content "' + c + '" matches ' + hits.length + ' entities');
  }
  const CONTENT_TYPES = ['start', 'sconce', 'lanternway', 'lore', 'npc', 'shrine', 'pickup', 'geode', 'lever', 'gate', 'sealdoor', 'arena'];
  for (const p of props) {
    if (!CONTENT_TYPES.includes(p.type) || matched.has(p)) continue;
    const what = p.type + (p.id ? ':' + p.id : p.npc ? ':' + p.npc : p.ability ? ':' + p.ability : p.boss ? ':' + p.boss : '');
    if (p.type === 'pickup' && p.item !== 'cinders') R.err(id, 'plan-content', 'unplanned pickup ' + what + ' (' + p.item + ') — collectibles must follow the plan');
    else R.warn(id, 'plan-content', 'unplanned content ' + what);
  }
}

// ------------------------------------------------------------------------------------------------ world checks
function checkOverlaps(ctx, defs, only) {
  const rects = defs.filter((d) => Array.isArray(d.def.tiles) && d.def.tiles.length).map((d) => ({ id: d.def.id, x: d.def.gx, y: d.def.gy, w: Math.max(...d.def.tiles.map((t) => t.length)), h: d.def.tiles.length }));
  for (let i = 0; i < rects.length; i++) for (let j = i + 1; j < rects.length; j++) {
    const a = rects[i], b = rects[j];
    if (only && !only.has(a.id) && !only.has(b.id)) continue;
    if (a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h) {
      const x0 = Math.max(a.x, b.x), y0 = Math.max(a.y, b.y), x1 = Math.min(a.x + a.w, b.x + b.w) - 1, y1 = Math.min(a.y + a.h, b.y + b.h) - 1;
      ctx.R.err(a.id, 'overlap', 'overlaps room ' + b.id + ' (global tiles x ' + x0 + '-' + x1 + ', y ' + y0 + '-' + y1 + ')');
    }
  }
}

function checkUniqueIds(ctx, defs) {
  const ns = new Map(); // namespace:id → [rooms]
  const add = (k, room) => { if (!ns.has(k)) ns.set(k, []); ns.get(k).push(room); };
  for (const d of defs) for (const s of ctx.specsByRoom.get(d.def.id) || []) {
    const p = s.props || {};
    if (!p.id) continue;
    const space = p.type === 'arena_gate' ? 'gate' : p.type === 'enemy' ? 'enemy' : p.type;
    if (['sconce', 'lanternway', 'lore', 'pickup', 'geode', 'lever', 'gate', 'enemy', 'sealdoor', 'event'].includes(space)) add(space + ':' + p.id, d.def.id);
  }
  for (const s of (ctx.G.Items && ctx.G.Items.shops && ctx.G.Items.shops.pell) || []) if (s.id) add('pickup:' + s.id, 'shop:pell');
  for (const [k, rooms] of ns) if (rooms.length > 1) ctx.R.err(rooms[0], 'id', k + ' is used ' + rooms.length + ' times (' + rooms.join(', ') + ') — ids must be unique');
}

function checkCoverage(ctx, defs) {
  const { R, plan, A } = ctx;
  const built = new Set(defs.map((d) => d.def.id));
  const missing = plan.rooms.filter((r) => !built.has(r.id));
  const byRegion = new Map();
  for (const r of plan.rooms) {
    if (!byRegion.has(r.region)) byRegion.set(r.region, { planned: 0, built: 0, builtRooms: 0, missing: [] });
    const g = byRegion.get(r.region);
    g.planned++;
    // builtRooms counts only the region builder's rooms: an arena built early by a boss builder does not mean the
    // region's builder has started (otherwise its unbuilt rooms would turn into an error)
    if (built.has(r.id)) { g.built++; if (r.kind !== 'arena') g.builtRooms++; }
    else if (r.kind === 'arena') g.arenas = (g.arenas || []).concat(r.id);   // built by boss builders (src/data/arenas)
    else g.missing.push(r.id);
  }
  for (const [region, g] of byRegion) {
    // Arena rooms come from the boss builders (src/data/arenas/<boss>.js), who work in parallel with the region
    // builders: a missing arena is a warning until --complete, so it never blocks a finished region.
    if (g.arenas && g.arenas.length) {
      if (A.complete) R.err('plan', 'plan-missing', region + ': arena room(s) not built: ' + g.arenas.join(' '));
      else if (g.built > 0) R.warn('plan', 'plan-missing', region + ': arena room(s) not built yet (boss builders, src/data/arenas): ' + g.arenas.join(' '));
    }
    if (!g.missing.length) continue;
    if (A.complete || g.builtRooms > 0) R.err('plan', 'plan-missing', region + ': planned room(s) not built: ' + g.missing.join(' '));
    else {
      const na = (g.arenas || []).length;
      const ba = g.built - g.builtRooms;   // arenas already built by the boss builder
      R.warn('plan', 'plan-missing', region + ': no rooms built yet (' + g.missing.length + ' planned' + (na ? ' + ' + na + ' arena' : '') + (ba ? '; arena built: ' + ba : '') + ')');
    }
  }
  return { planned: plan.rooms.length, built: plan.rooms.length - missing.length, complete: missing.length === 0,
    regions: Object.fromEntries(Array.from(byRegion.entries()).map(([k, g]) => [k, { planned: g.planned, built: g.built }])) };
}

function checkTotals(ctx, defs, coverage) {
  const { R, G, A } = ctx;
  const complete = A.complete || !!(coverage && coverage.complete);
  // while the world is incomplete, shortfalls are expected: summarise them in one warning (details with --complete)
  const pending = [];
  const shortfall = (code, msg) => (complete ? R.err('totals', code, msg) : pending.push(msg));
  const all = [];
  for (const d of defs) for (const s of ctx.specsByRoom.get(d.def.id) || []) all.push({ room: d.def.id, region: d.def.region, p: s.props || {} });
  const nonDev = all.filter((x) => x.region !== 'test');
  const ofType = (t) => nonDev.filter((x) => x.p.type === t);
  const T = G.Text || {}, I = G.Items || {};
  const totals = {};
  // lore: every G.Text.lore id exactly once; per-prefix counts per TECH_SPEC §19
  const loreIds = Object.keys(T.lore || {});
  const lorePlaced = ofType('lore').map((x) => x.p.id);
  const loreMissing = loreIds.filter((k) => !lorePlaced.includes(k));
  totals.lore = { expected: loreIds.length, placed: new Set(lorePlaced).size };
  if (loreMissing.length) shortfall('totals', 'lore tablets not placed: ' + loreMissing.length + ' (' + loreMissing.slice(0, 8).join(' ') + (loreMissing.length > 8 ? ' …' : '') + ')');
  for (const [pre, n] of Object.entries(Reg.LORE_COUNTS)) {
    const have = loreIds.filter((k) => k.startsWith('lore_' + pre + '_')).length;
    if (have !== n) R.warn('totals', 'totals', 'G.Text.lore has ' + have + ' lore_' + pre + '_* entries; TECH_SPEC §19 says ' + n);
  }
  // sparks
  const sparkIds = Object.keys(T.sparks || {});
  const sparkPlaced = ofType('pickup').filter((x) => x.p.item === 'spark').map((x) => x.p.spark || x.p.id);
  totals.sparks = { expected: sparkIds.length, placed: sparkPlaced.length };
  for (const s of sparkIds) if (!sparkPlaced.includes(s)) shortfall('totals', 'spark ' + s + ' is not placed');
  // lanternways
  const lw = ofType('lanternway').map((x) => x.p.id);
  totals.lanternways = { expected: Reg.LANTERNWAYS.length, placed: lw.length };
  for (const l of Reg.LANTERNWAYS) if (!lw.includes(l)) shortfall('totals', 'lanternway ' + l + ' is not placed');
  // sconces per region (>=1; 2 in regions with >= 8 rooms; sanctum 1)
  const roomsPerRegion = new Map();
  if (ctx.plan) for (const r of ctx.plan.rooms) roomsPerRegion.set(r.region, (roomsPerRegion.get(r.region) || 0) + 1);
  else for (const d of defs) roomsPerRegion.set(d.def.region, (roomsPerRegion.get(d.def.region) || 0) + 1);
  totals.sconces = {};
  for (const [region, n] of roomsPerRegion) {
    if (region === 'test') continue;
    const want = region === 'sanctum' ? 1 : n >= 8 ? 2 : 1;
    const have = ofType('sconce').filter((x) => x.region === region).length;
    totals.sconces[region] = { expected: want, placed: have };
    if (have < want) shortfall('totals', region + ': ' + have + ' sconce(s), expected ' + want);
    else if (have > want) R.warn('totals', 'totals', region + ': ' + have + ' sconces (TECH_SPEC §19 expects ' + want + ')');
  }
  // collectibles: world pickups = totals - shop stock - NPC gifts - starting values
  const shop = (I.shops && I.shops.pell) || [];
  const npcGives = [];
  for (const v of Object.values(T.npcs || {})) for (const t of v.talks || []) if (t.give) npcGives.push(String(t.give));
  const tot = I.totals || {};
  const countWorld = (item) => ofType('pickup').filter((x) => x.p.item === item).length;
  const expectWorld = {
    heartwax: (tot.heartwax || 0) - shop.filter((s) => s.item === 'heartwax').length - npcGives.filter((g) => g === 'heartwax').length,
    urn: (tot.urns || 0) - shop.filter((s) => s.item === 'urn').length - npcGives.filter((g) => g === 'urn').length,
    kiln_glass: (tot.kilnGlass || 0) - npcGives.filter((g) => g === 'kiln_glass').length,
    notch: (tot.notches || 0) - (I.notchesStart || 0) - shop.filter((s) => s.item === 'notch').length - npcGives.filter((g) => g === 'notch').length,
  };
  totals.pickups = {};
  for (const [item, want] of Object.entries(expectWorld)) {
    const have = countWorld(item);
    totals.pickups[item] = { expected: want, placed: have };
    if (have > want) R.err('totals', 'totals', have + ' ' + item + ' pickups placed; only ' + want + ' exist in the world (G.Items.totals minus shop/NPC sources)');
    else if (have < want) shortfall('totals', have + '/' + want + ' ' + item + ' pickups placed');
  }
  // sigils: each sigil obtainable exactly once (shop + NPC gifts + world pickups)
  const sigilSources = new Map();
  const addSig = (sid, src) => { if (!sigilSources.has(sid)) sigilSources.set(sid, []); sigilSources.get(sid).push(src); };
  for (const s of shop) if (s.item === 'sigil') addSig(s.sigil, 'shop');
  for (const g of npcGives) if (g.startsWith('sigil:')) addSig(g.slice(6), 'npc');
  for (const x of ofType('pickup')) if (x.p.item === 'sigil') addSig(x.p.sigil, x.room);
  const sigilIds = Object.keys(I.sigils || {});
  totals.sigils = { expected: sigilIds.length, sources: sigilSources.size };
  for (const [sid, src] of sigilSources) if (src.length > 1) R.err('totals', 'totals', 'sigil ' + sid + ' is obtainable ' + src.length + ' times (' + src.join(', ') + ')');
  for (const sid of sigilIds) if (!sigilSources.has(sid)) shortfall('totals', 'sigil ' + sid + ' has no source (shop / NPC / pickup)');
  // bosses (arenas), unique entities
  const arenas = ofType('arena').map((x) => x.p.boss);
  totals.bosses = { expected: Reg.BOSSES.length, placed: new Set(arenas).size };
  for (const b of Reg.BOSSES) {
    const n = arenas.filter((x) => x === b).length;
    if (!n) shortfall('totals', 'no arena for boss ' + b);
    else if (n > 1) R.err('totals', 'totals', 'boss ' + b + ' has ' + n + ' arenas');
  }
  const once = (type, label) => {
    const n = ofType(type).length;
    if (n > 1) R.err('totals', 'totals', n + ' ' + label + ' entities (exactly one allowed): ' + ofType(type).map((x) => x.room).join(' '));
    else if (!n) shortfall('totals', 'no ' + label + ' entity');
  };
  once('start', 'start');
  once('sealdoor', 'sealdoor');
  // NPCs
  const npcSeen = ofType('npc').map((x) => x.p.npc + (x.p.stage != null ? '_' + x.p.stage : ''));
  for (const n of ['thrum', 'pell', 'quill', 'bramm', 'wren_1', 'wren_2', 'wren_3', 'wren_4', 'sable_1', 'sable_2']) {
    const k = npcSeen.filter((x) => x === n || (n.indexOf('_') < 0 && x === n)).length;
    if (!k) shortfall('totals', 'npc ' + n + ' is not placed');
    else if (k > 1) R.warn('totals', 'totals', 'npc ' + n + ' is placed ' + k + ' times');
  }
  // enemy kinds: every TECH_SPEC kind placed somewhere
  const kinds = new Set(ofType('enemy').map((x) => x.p.kind));
  const unplaced = Array.from(ctx.reg.specEnemyKinds).filter((k) => !kinds.has(k));
  totals.enemyKinds = { expected: ctx.reg.specEnemyKinds.size, placed: ctx.reg.specEnemyKinds.size - unplaced.length };
  if (unplaced.length) {
    if (complete) R.warn('totals', 'totals', 'enemy kinds never placed: ' + unplaced.join(' '));
    else pending.push('enemy kinds never placed: ' + unplaced.length);
  }
  if (pending.length) {
    R.warn('totals', 'totals', 'world incomplete: ' + pending.length + ' totals shortfall(s) (expected while rooms are missing; --complete lists them as errors). First: ' + pending.slice(0, 3).join('; '));
  }
  totals.pendingShortfalls = pending;
  return totals;
}

// ------------------------------------------------------------------------------------------------ output
function printReport(R, selected, A, plan, P, coverage, totals) {
  const out = [];
  const errs = R.errors, warns = R.warnings;
  out.push('GUTTERLIGHT validate — ' + selected.length + ' room(s)' + (A.dev ? ' incl. dev rooms' : '') +
    (plan ? ' · plan ' + rel(P.file) + ' (' + plan.rooms.length + ' rooms)' : A.noPlan ? ' · plan skipped' : ' · no world plan'));
  const scopes = [];
  for (const it of R.items) if (!scopes.includes(it.scope)) scopes.push(it.scope);
  const order = (s) => (s === 'load' ? 0 : s === 'plan' ? 2 : s === 'totals' ? 3 : 1);
  scopes.sort((a, b) => order(a) - order(b));
  for (const s of scopes) {
    const items = R.items.filter((x) => x.scope === s && (!A.quiet || x.level === 'error'));
    if (!items.length) continue;
    const ne = items.filter((x) => x.level === 'error').length, nw = items.length - ne;
    out.push('');
    out.push('── ' + (s === 'load' || s === 'plan' || s === 'totals' ? s.toUpperCase() : 'room ' + s) + '  (' + ne + ' error' + (ne === 1 ? '' : 's') + ', ' + nw + ' warning' + (nw === 1 ? '' : 's') + ')');
    for (const it of items.filter((x) => x.level === 'error')) out.push('  ERROR [' + it.code + '] ' + it.msg);
    for (const it of items.filter((x) => x.level !== 'error')) out.push('  warn  [' + it.code + '] ' + it.msg);
  }
  const clean = selected.filter((d) => !R.items.some((x) => x.scope === d.def.id)).map((d) => d.def.id);
  if (clean.length && !A.quiet) { out.push(''); out.push('clean rooms (' + clean.length + '): ' + clean.join(' ')); }
  if (coverage) out.push('plan coverage: ' + coverage.built + '/' + coverage.planned + ' rooms built' + (coverage.complete ? ' (complete)' : ''));
  if (totals && !A.quiet && totals.pickups) {
    const t = totals;
    out.push('totals: lore ' + t.lore.placed + '/' + t.lore.expected + ' · sparks ' + t.sparks.placed + '/' + t.sparks.expected +
      ' · lanternways ' + t.lanternways.placed + '/' + t.lanternways.expected + ' · arenas ' + t.bosses.placed + '/' + t.bosses.expected +
      ' · ' + Object.entries(t.pickups).map(([k, v]) => k + ' ' + v.placed + '/' + v.expected).join(' · ') +
      ' · sigil sources ' + t.sigils.sources + '/' + t.sigils.expected + ' · enemy kinds placed ' + t.enemyKinds.placed + '/' + t.enemyKinds.expected);
  }
  out.push('');
  out.push((errs.length ? 'FAIL' : 'OK') + ': ' + errs.length + ' error' + (errs.length === 1 ? '' : 's') + ', ' + warns.length + ' warning' + (warns.length === 1 ? '' : 's'));
  console.log(out.join('\n'));
}

if (require.main === module) process.exit(main());
module.exports = { main };
