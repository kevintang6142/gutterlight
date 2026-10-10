#!/usr/bin/env node
// tools/reach.js — physics-based reachability with the REAL player motor (G.PlayerMotor + G.Physics in Node).
// Verifies each built room against the world plan (TECH_SPEC §18, docs/api/world_plan.md):
//   (a) every plan path {from,to,requires} is possible with exactly `requires` (alternatives = several entries
//       with the same from/to: the traversal passes if ANY alternative works; failing alternatives warn)
//   (b) a gate holds: if `requires` contains a movement ability X, the traversal is NOT possible without X even
//       with the MAXIMAL ability set a player can own before X (union of the abilities preceding X in every feasible
//       acquisition order of the plan's progression simulation, tools/plan_check.js --orders-json; a plan may state
//       "abilityOrders" itself) (error for paths that cross into another region, warning otherwise; skipped when
//       that set still satisfies another listed alternative)
//   (c) every spot (content) is reachable from its exit with its requires, and the player can get back to that
//       exit afterwards (another exit only: warning; no exit at all: error = softlock)
//   (d) directions the plan omits are intentionally one-way: if one is possible (with every ability) → warning
//   --global: add every measured unplanned traversal to a copy of the plan and re-run tools/plan_check.js on it
//             (progression + no-trap simulation over the world as built)
//
//   node tools/reach.js                    all built rooms that are in the plan
//   node tools/reach.js --room gw_03       one room (comma list ok)       --all   all rooms (default)
//   node tools/reach.js --verbose          macro-action path dumps for every check (failures always get diagnostics)
//   node tools/reach.js --overlay          ASCII overlay of reachable stand positions per ability set
//   node tools/reach.js --json             machine-readable results
//   node tools/reach.js --jobs 8           worker threads (default: cores - 1)      --no-cache   ignore the cache
//   node tools/reach.js --plan f.json --data rooms.js --dev     other plan / extra data files / include dev rooms
//   node tools/reach.js --data rooms.js --data-only             skip the shipped room files (fixtures in isolation)
//   node tools/reach.js --expect           fixture mode: entries with "expect":"fail" must be impossible
//   node tools/reach.js --global           whole-world progression/no-trap check on the measured graph
//   node tools/reach.js --margin [H[,V]]   MARGIN check (default 12,4): re-run every plan path and spot with a handicapped
//                                          motor: runs/dashes/swims H px shorter per ~300 px (12 px = 0.3 tile) and every
//                                          jump/boost rises V px lower. A traversal that only works with the exact motor
//                                          needs a near-exact position/timing. V is small on purpose: a held full jump is
//                                          deterministic (needing max height is not a precision move), horizontal
//                                          position/timing is what a human cannot repeat exactly.
//                                          Also: no coyote time (",coyote" keeps it) and ground jumps start >= 2/3·H px
//                                          (8 px) inside a ledge edge (nobody stands on the exact last pixel).
//                                          Error on the intended critical path (plan_check routes), warning elsewhere.
// Exit code 1 on any error. Cache: test-output/tools/reach-cache/ (keyed by room data + engine/tool sources).
'use strict';
const fs = require('fs');
const os = require('os');
const path = require('path');
const crypto = require('crypto');
const { Worker, isMainThread, parentPort, workerData } = require('node:worker_threads');
const { loadWorld, hashFiles, ROOT, rel } = require('./lib/game_data');
const PlanLib = require('./lib/plan');
const Cond = require('./lib/conditions');

const MOVEMENT = PlanLib.MOVEMENT; // dash grip wings oilcloak plunge
const CACHE_DIR = path.join(ROOT, 'test-output', 'tools', 'reach-cache');
const ENGINE_FILES = ['src/core/namespace.js', 'src/core/util.js', 'src/engine/physics.js', 'src/engine/world.js', 'src/player/motor.js',
  'tools/lib/reach_core.js', 'tools/lib/plan.js', 'tools/lib/conditions.js', 'tools/lib/game_data.js', 'tools/reach.js'];

// ================================================================================================ worker side
// Two worker roles: 'task' workers analyse one (room, ability set) task at a time; for big tasks with spare
// cores they start 'sim' sub-workers that run the frontier's motor simulations in parallel (prefetch).
// Margin handicap: every jump rises `px` lower (each take-off speed v → v·sqrt((H−px)/H), H = its rise height) and
// horizontal speeds shrink by px per ~300 px of travel. Mutates the vm instance's G.PlayerMotor.C (tool-only copy).
const MARGIN_SPAN = 300;
function applyMargin(G, m) {
  const C = G.PlayerMotor.C;
  const px = m.v, hpx = m.h;
  const rise = (v, g) => v * v / (2 * g);
  const f = (v, g) => Math.sqrt(Math.max(0.05, (rise(v, g) - px) / rise(v, g)));
  C.JUMP_V *= f(C.JUMP_V, C.G_HOLD);
  C.WJ_V *= f(C.WJ_V, C.G_HOLD);
  C.DJ_V *= f(C.DJ_V, C.G_HOLD);
  C.EXIT_UP_VY *= f(C.EXIT_UP_VY, C.GRAVITY);
  const h = 1 - hpx / MARGIN_SPAN;
  C.RUN *= h; C.DASH_V *= h; C.SWIM_SPEED *= h;
  if (m.coyote === false) C.COYOTE = 0.5 / 60; // no coyote time: a jump that only works after walking off an edge is a 5-frame trick
  return C;
}

function workerMain() {
  if (workerData.role === 'sim') return simMain();
  const RC = require('./lib/reach_core');
  const W = loadWorld({ extra: workerData.data });
  if (workerData.margin) { applyMargin(W.G, workerData.margin); RC.setEdgeInset(workerData.margin.edge); }
  parentPort.on('message', async (task) => {
    let result;
    try { result = await runTask(W, RC, task); } catch (e) { result = { error: (e && e.stack) || String(e) }; }
    result.taskId = task.taskId;
    parentPort.postMessage(result);
  });
  parentPort.postMessage({ ready: true });
}

function simMain() {
  const RC = require('./lib/reach_core');
  const W = loadWorld({ extra: workerData.data });
  if (workerData.margin) { applyMargin(W.G, workerData.margin); RC.setEdgeInset(workerData.margin.edge); }
  const an = new RC.RoomAnalyzer(W.G, W.G.World.getRoom(workerData.room), {});
  for (const id of workerData.spots) an.addTarget(id);
  parentPort.on('message', (m) => {
    try {
      const g = an.graph(m.g.worldKey, m.g.ab, new Set(m.g.tokens));
      const s0 = an.stats.steps, m0 = an.stats.macros;
      const results = g.simulate(m.job.st, an.policies(m.job.kind, g.ab, m.job.extra), m.job.mode, m.job.subset || undefined);
      parentPort.postMessage({ id: m.id, results, steps: an.stats.steps - s0, macros: an.stats.macros - m0 });
    } catch (e) {
      parentPort.postMessage({ id: m.id, error: (e && e.stack) || String(e) });
    }
  });
  parentPort.postMessage({ ready: true });
}

// A small pool of sim workers for one task. run(jobs, graph, stats) → Promise<results[] per job>.
function startSimPool(n, task, data) {
  const workers = [];
  let ready = 0;
  let readyResolve;
  const readyP = new Promise((r) => { readyResolve = r; });
  const pending = new Map();
  let seq = 0, failed = null;
  const idle = [];
  const queue = [];
  const pump = () => {
    while (idle.length && queue.length) {
      const w = idle.pop();
      const q = queue.shift();
      pending.set(q.id, q);
      w.postMessage({ id: q.id, g: q.g, job: q.job });
    }
  };
  for (let i = 0; i < n; i++) {
    const w = new Worker(__filename, { workerData: { role: 'sim', data, room: task.room, spots: task.spots, margin: workerData.margin || 0 } });
    workers.push(w);
    w.on('message', (m) => {
      if (m.ready) { ready++; idle.push(w); if (ready === n) readyResolve(); return; }
      const q = pending.get(m.id);
      pending.delete(m.id);
      idle.push(w);
      if (m.error) { failed = failed || new Error('sim worker: ' + m.error); q.reject(failed); }
      else q.resolve(m);
      pump();
    });
    w.on('error', (e) => { failed = failed || e; readyResolve(); for (const q of pending.values()) q.reject(e); });
  }
  return {
    async run(jobs, g, stats) {
      await readyP;
      if (failed) throw failed;
      const gw = { worldKey: g.worldKey, ab: g.ab, tokens: Array.from(g.tokens || []) };
      const ps = jobs.map((job) => new Promise((resolve, reject) => { queue.push({ id: seq++, g: gw, job, resolve, reject }); }));
      pump();
      const outs = await Promise.all(ps);
      for (const o of outs) { stats.steps += o.steps; stats.macros += o.macros; }
      return outs.map((o) => o.results);
    },
    close() { for (const w of workers) w.terminate(); },
  };
}

// task: {room, req:[tokens], entries:[analyzer exit ids], spots:[spot ids], overlay:bool, sub:int}
async function runTask(W, RC, task) {
  const G = W.G;
  const def = G.World.getRoom(task.room);
  if (!def) return { error: 'room ' + task.room + ' is not defined' };
  const t0 = Date.now();
  const an = new RC.RoomAnalyzer(G, def, {});
  const spotIdx = task.spots.map((id) => an.addTarget(id));
  const targets = spotIdx.map((i) => ({ ok: an.targets[i].ok, reason: an.targets[i].reason }));
  const { abilities, tokens } = PlanLib.splitRequires(task.req);
  const out = { room: task.room, req: task.req, entries: {}, targets, overlay: null, gates: an.gates.map((g) => ({ id: g.id, cond: g.cond, open: Cond.evalWithTokens(g.cond, tokens) })) };
  const pool = task.sub > 1 ? startSimPool(task.sub, task, workerData.data) : null;
  const runJobs = pool ? (jobs, g) => pool.run(jobs, g, an.stats) : null;
  let grid = null;
  try {
    for (const entry of task.entries) {
      const starts = an.entryStates(entry);
      if (!starts.length) { out.entries[entry] = { error: 'no such opening in the built room' }; continue; }
      const res = runJobs ? await an.closureAsync(starts, task.req, runJobs) : an.closure(starts, task.req);
      const e = { exits: {}, spots: {}, worlds: res.worlds, nodes: res.nodes.length };
      for (const [x, trace] of res.exits) e.exits[x] = RC.describePath(trace);
      task.spots.forEach((sid, k) => {
        const ti = spotIdx[k];
        const trace = res.spots.get(ti);
        if (!trace) return;
        e.spots[sid] = { path: RC.describePath(trace), escape: escapeExits(an, trace, abilities, tokens) };
      });
      out.entries[entry] = e;
      if (task.overlay) grid = mergeOverlay(grid, RC.overlay(an, res));
    }
  } finally {
    if (pool) pool.close();
  }
  out.overlay = grid;
  out.stats = Object.assign({ ms: Date.now() - t0, sub: task.sub || 1 }, an.stats);
  return out;
}

// Exits reachable after a spot was reached (forward search over the closure's graphs, following breaks).
function escapeExits(an, trace, abilities, tokens) {
  const found = new Set();
  const last = trace.last || {};
  if (last.exit) { found.add(last.exit); return Array.from(found); }
  let start = last.to || trace.node;
  const seen = new Set();
  const queue = [{ node: start, g: trace.g, world: trace.world || '' }];
  let guard = 0;
  while (queue.length && guard++ < 20000) {
    const { node, g, world } = queue.shift();
    if (!node || seen.has(g.key + '#' + node.idx)) continue;
    seen.add(g.key + '#' + node.idx);
    g.expand(node);
    for (const o of node.out) {
      if (o.exit) found.add(o.exit);
      else if (o.to) queue.push({ node: o.to, g, world });
      else if (o.brk) {
        const parts = (world ? world.split(';') : []).concat([o.brk.comp]).sort();
        const nk = Array.from(new Set(parts)).join(';');
        const g2 = an.graph(nk, abilities, tokens);
        queue.push({ node: g2.nodeForState(o.brk.state, 'after breaking ' + o.brk.comp), g: g2, world: nk });
      }
    }
  }
  void start;
  return Array.from(found).sort();
}

function mergeOverlay(a, b) {
  if (!a) return b.slice();
  return a.map((row, r) => row.split('').map((ch, c) => {
    const o = b[r][c];
    if (ch === o) return ch;
    const rank = (x) => ('*@|+'.indexOf(x) + 1);
    return rank(o) > rank(ch) ? o : ch;
  }).join(''));
}

// ================================================================================================ main side
function parseArgs(argv) {
  const a = { rooms: [], all: false, verbose: false, overlay: false, json: false, jobs: 0, cache: true, plan: null, data: [], dev: false, expect: false, global: false };
  for (let i = 2; i < argv.length; i++) {
    const k = argv[i];
    const v = () => { if (i + 1 >= argv.length) { console.error('reach: ' + k + ' needs a value'); process.exit(2); } return argv[++i]; };
    if (k === '--room') a.rooms.push(...v().split(','));
    else if (k === '--all') a.all = true;
    else if (k === '--verbose' || k === '-v') a.verbose = true;
    else if (k === '--overlay') a.overlay = true;
    else if (k === '--json') a.json = true;
    else if (k === '--jobs' || k === '-j') a.jobs = Math.max(1, parseInt(v(), 10) || 1);
    else if (k === '--no-cache') a.cache = false;
    else if (k === '--plan') a.plan = v();
    else if (k === '--data') a.data.push(v());
    else if (k === '--data-only') { a.dataOnly = true; process.env.GUTTERLIGHT_DATA_ONLY = '1'; }
    else if (k === '--dev') a.dev = true;
    else if (k === '--expect') a.expect = true;
    else if (k === '--global') a.global = true;
    else if (k === '--margin') {
      a.margin = { h: 12, v: 4, coyote: false, edge: 8 };
      if (i + 1 < argv.length && /^\d+(\.\d+)?(,\d+(\.\d+)?)?(,coyote)?$/.test(argv[i + 1])) {
        const parts = argv[++i].split(',');
        const [h, v] = parts.filter((x) => x !== 'coyote').map(Number);
        a.margin = { h, v: v == null ? Math.min(h, 4) : v, coyote: parts.includes('coyote'), edge: Math.round(h * 2 / 3) };
      }
    }
    else if (k === '--help' || k === '-h') a.help = true;
    else { console.error('reach: unknown argument ' + k); process.exit(2); }
  }
  return a;
}

let MARGIN_PX = 0; // {h, v} set by main() from --margin (passed to the workers); 0 = off
const keyOf = (req) => PlanLib.reqKey(req);
const sortReq = (req) => Array.from(new Set(req || [])).sort();
const minus = (req, x) => req.filter((t) => t !== x);
const isSuperset = (a, b) => b.every((t) => a.includes(t));
// Requirements a gate on `x` must hold against: the alternative minus `x`, plus (for movement abilities) the MAXIMAL
// ability set a player can own before `x` while holding the alternative's other abilities (plan progression,
// PlanLib.maxBefore). Without usable orders (partial plans) or when no order has them before `x`: just minus `x`.
function gateReq(alt, x, orders) {
  const b = minus(alt, x);
  if (!MOVEMENT.includes(x) || !orders || !orders.length) return { req: b, extra: [] };
  const mb = PlanLib.maxBefore(orders, x, alt);
  if (!mb.orders) return { req: b, extra: [] };
  const extra = mb.set.filter((t) => !b.includes(t));
  return { req: sortReq(b.concat(extra)), extra };
}
const fmtReq = (req) => '[' + (req.length ? req.join(', ') : '') + ']';

// Map plan exit ids → analyzer (built) exit ids: exact side/pos/size, else the overlapping opening on that side.
function mapExits(pr, openings) {
  const named = PlanLib.nameOpenings(openings);
  const map = {}, problems = [];
  for (const e of pr.exits || []) {
    let o = named.find((x) => x.side === e.side && x.pos === e.pos && x.size === e.size);
    if (!o) {
      o = named.find((x) => x.side === e.side && x.pos < e.pos + e.size && e.pos < x.pos + x.size);
      if (o) problems.push('exit ' + e.id + ' is built at ' + o.side + ' ' + o.pos + '+' + o.size + ' instead of ' + e.side + ' ' + e.pos + '+' + e.size + ' (run tools/validate.js)');
      else problems.push('planned exit ' + e.id + ' (' + e.side + ' ' + e.pos + '+' + e.size + ') is not open in the built room');
    }
    if (o) map[e.id] = o.id;
  }
  const back = {};
  for (const [p, b] of Object.entries(map)) back[b] = p;
  return { map, back, named, problems };
}

// Everything the room needs: sets → entries, plus the check list.
function planRoomChecks(pr, def, G, opts) {
  const specs = G.World.entitySpecsOf(def) || [];
  const tileRoom = G.World.createRoom(def, { tileOnly: true });
  const ex = mapExits(pr, tileRoom.openings);
  const sets = new Map(); // key → {req, entries:Set}
  const need = (req, planExit) => {
    const r = sortReq(req);
    const k = keyOf(r);
    if (!sets.has(k)) sets.set(k, { req: r, entries: new Set() });
    if (ex.map[planExit]) sets.get(k).entries.add(ex.map[planExit]);
    return k;
  };
  const checks = [];
  // FULL: every movement ability + every non-ability token of this room (paths, spots, gate conditions)
  const full = new Set(MOVEMENT);
  for (const p of (pr.paths || []).concat(pr.spots || [])) for (const t of p.requires || []) full.add(t);
  for (const s of specs) {
    const p = s.props || {};
    const cond = p.type === 'gate' ? p.opens : p.type === 'sealdoor' ? 'seals>=3' : null;
    for (const t of Cond.parseCondition(cond).terms) if (!t.neg) full.add(t.kind === 'counter' ? t.raw : t.kind === 'ability' ? t.arg : t.raw);
  }
  const FULL = sortReq(Array.from(full));
  const regionOf = (roomId) => { const q = opts.planRooms.get(roomId); return q ? q.region : null; };
  const exitInter = (exitId) => { const e = (pr.exits || []).find((x) => x.id === exitId); return !!(e && regionOf(e.to) && regionOf(e.to) !== pr.region); };
  // (a) + (b): paths grouped by from→to
  const groups = new Map();
  for (const p of pr.paths || []) {
    const k = p.from + '>' + p.to + (p.expect === 'fail' ? '#fail' : '');
    if (!groups.has(k)) groups.set(k, { from: p.from, to: p.to, alts: [] });
    groups.get(k).alts.push({ req: sortReq(p.requires), expect: p.expect || 'pass' });
  }
  for (const g of groups.values()) {
    const alts = g.alts.map((a) => Object.assign(a, { key: need(a.req, g.from) }));
    const inter = exitInter(g.from) || exitInter(g.to);
    checks.push({ kind: 'path', from: g.from, to: g.to, alts, inter });
    for (const a of alts) {
      if (a.expect === 'fail') continue;
      // movement abilities (TECH_SPEC gate rule) and, as warnings, lever/boss/seal tokens (closed gates)
      for (const x of a.req.filter((t) => MOVEMENT.includes(t) || /^(lever:|boss:|seals>=)/.test(t))) {
        const { req: b, extra } = gateReq(a.req, x, opts.orders);
        if (alts.some((o) => o !== a && isSuperset(b, o.req))) continue;
        checks.push({ kind: 'gate', from: g.from, to: g.to, alt: a.req, without: x, req: b, extra, key: need(b, g.from), inter, token: !MOVEMENT.includes(x) });
      }
    }
  }
  // (c) spots grouped by id+from
  const sgroups = new Map();
  for (const s of pr.spots || []) {
    const k = s.id + '@' + s.from + (s.expect === 'fail' ? '#fail' : '');
    if (!sgroups.has(k)) sgroups.set(k, { id: s.id, from: s.from, secret: !!s.secret, alts: [] });
    sgroups.get(k).alts.push({ req: sortReq(s.requires), expect: s.expect || 'pass' });
  }
  for (const g of sgroups.values()) {
    const alts = g.alts.map((a) => Object.assign(a, { key: need(a.req, g.from) }));
    checks.push({ kind: 'spot', id: g.id, from: g.from, alts, secret: g.secret });
    for (const a of alts) {
      if (a.expect === 'fail') continue;
      for (const x of a.req.filter((t) => MOVEMENT.includes(t) || /^(lever:|boss:|seals>=)/.test(t))) {
        const { req: b, extra } = gateReq(a.req, x, opts.orders);
        if (alts.some((o) => o !== a && isSuperset(b, o.req))) continue;
        checks.push({ kind: 'spotgate', id: g.id, from: g.from, alt: a.req, without: x, req: b, extra, key: need(b, g.from) });
      }
    }
  }
  // (d) omitted directions, checked with FULL
  const planned = new Set((pr.paths || []).map((p) => p.from + '>' + p.to));
  const fullKey = keyOf(FULL);
  for (const a of pr.exits || []) for (const b of pr.exits || []) {
    if (a.id === b.id || planned.has(a.id + '>' + b.id)) continue;
    need(FULL, a.id);
    checks.push({ kind: 'oneway', from: a.id, to: b.id, req: FULL, key: fullKey });
  }
  if (opts.overlay) need(FULL, (pr.exits || [])[0] && pr.exits[0].id);
  const spotIds = Array.from(new Set((pr.spots || []).map((s) => s.id)));
  return { sets, checks, ex, spotIds, FULL };
}

// ---- worker pool
async function runPool(tasks, jobs, data, onDone) {
  if (!tasks.length) return;
  const n = Math.min(jobs, tasks.length);
  const queue = tasks.slice();
  await new Promise((resolve, reject) => {
    let active = 0, finished = 0;
    const workers = [];
    const feed = (w) => {
      const t = queue.shift();
      if (!t) { w.terminate(); return; }
      active++;
      w.postMessage(t);
    };
    for (let i = 0; i < n; i++) {
      const w = new Worker(__filename, { workerData: { role: 'task', data, margin: MARGIN_PX } });
      workers.push(w);
      w.on('message', (m) => {
        if (m.ready) { feed(w); return; }
        active--; finished++;
        onDone(m);
        if (finished === tasks.length) { workers.forEach((x) => x.terminate()); resolve(); } else feed(w);
      });
      w.on('error', (e) => { workers.forEach((x) => x.terminate()); reject(e); });
    }
    void active;
  });
}

// Runs tasks through the cache and the worker pool. → Map(taskId → result)
function makeExecutor(A, jobs, log) {
  return async function exec(tasks, label) {
    const out = new Map();
    const pending = [];
    let cached = 0;
    for (const t of tasks) {
      const f = path.join(CACHE_DIR, t.room + '-' + t.hash.slice(0, 16) + '.json');
      if (A.cache && fs.existsSync(f)) {
        try { out.set(t.taskId, JSON.parse(fs.readFileSync(f, 'utf8'))); cached++; continue; } catch (e) { /* recompute */ }
      }
      pending.push(t);
    }
    log(label + tasks.length + ' ability-set task(s) (' + cached + ' cached), ' + Math.min(jobs, Math.max(1, pending.length)) + ' worker(s)');
    // biggest first (better packing)
    const weight = (t) => t.req.filter((x) => MOVEMENT.includes(x)).length * 10 + t.entries.length;
    pending.sort((a, b) => weight(b) - weight(a));
    // spare cores go to the heaviest tasks as simulation sub-workers (parallel frontier prefetch)
    const spare = Math.max(0, jobs - pending.length);
    const tw = pending.map((t) => Math.max(1, weight(t)));
    const sum = tw.reduce((x, y) => x + y, 0);
    pending.forEach((t, i) => { const k = 1 + Math.floor(spare * tw[i] / sum); t.sub = k >= 3 ? Math.min(12, k) : 1; });
    const byId = new Map(pending.map((t) => [t.taskId, t]));
    let n = 0;
    await runPool(pending, jobs, A.data, (res) => {
      const t = byId.get(res.taskId);
      n++;
      if (!res.error) {
        fs.mkdirSync(CACHE_DIR, { recursive: true });
        fs.writeFileSync(path.join(CACHE_DIR, t.room + '-' + t.hash.slice(0, 16) + '.json'), JSON.stringify(res));
      }
      out.set(t.taskId, res);
      log('  [' + n + '/' + pending.length + '] ' + t.room + ' ' + fmtReq(t.req) + (res.error ? ' ERROR ' + res.error.split('\n')[0] : ' ' + res.stats.ms + ' ms'));
    });
    return out;
  };
}

function makeTask(id, room, req, entries, spots, overlay, engineHash, rh) {
  const task = { taskId: id, room, req: sortReq(req), setKey: keyOf(req), entries: Array.from(entries).sort(), spots, overlay: !!overlay };
  task.hash = crypto.createHash('sha1').update(engineHash + '|' + rh + '|' + JSON.stringify([task.req, task.entries, task.spots, task.overlay])).digest('hex');
  return task;
}

function roomHash(def) {
  return crypto.createHash('sha1').update(JSON.stringify({ id: def.id, gx: def.gx, gy: def.gy, tiles: def.tiles, legend: def.legend || {}, entities: def.entities || [] })).digest('hex');
}

async function main() {
  const A = parseArgs(process.argv);
  if (A.help) { { const L = fs.readFileSync(__filename, 'utf8').split('\n'); console.log(L.slice(1, L.findIndex((l) => l.startsWith("'use strict'"))).join('\n')); } return 0; }
  const log = A.json ? () => {} : (m) => process.stderr.write(m + '\n');
  MARGIN_PX = A.margin || 0;
  if (MARGIN_PX) A.global = false;
  const W = loadWorld({ extra: A.data });
  const G = W.G;
  const loadErrors = W.loadErrors;
  const P = PlanLib.loadPlan(A.plan ? path.resolve(A.plan) : null);
  const report = { rooms: {}, errors: 0, warnings: 0, skipped: [], loadErrors: loadErrors.map((e) => e.file + ': ' + String(e.error).split('\n')[0]) };
  if (!P.plan) {
    const msg = P.missing ? 'no world plan at ' + rel(P.file) : 'world plan ' + rel(P.file) + ': ' + P.error;
    if (A.json) console.log(JSON.stringify({ ok: false, error: msg })); else console.error('reach: ' + msg);
    return 1;
  }
  const planRooms = new Map(P.plan.rooms.map((r) => [r.id, r]));
  // feasible ability acquisition orders (plan_check progression simulation) → maximal pre-ability sets for gate checks
  const ORD = PlanLib.abilityOrders(P.file, P.plan);
  report.abilityOrders = { source: ORD.source, count: ORD.orders.length,
    before: Object.fromEntries(MOVEMENT.map((x) => [x, PlanLib.maxBefore(ORD.orders, x, []).set])) };
  // rooms to analyze
  let ids = A.rooms.length ? A.rooms : P.plan.rooms.map((r) => r.id);
  const todo = [];
  const explicit = A.rooms.length > 0;
  for (const id of ids) {
    const pr = planRooms.get(id);
    const def = G.World.getRoom(id);
    const why = !pr ? 'not in the plan' : !def ? 'not built' : ((def.dev || def.region === 'test') && !A.dev) ? 'dev room: use --dev' : null;
    if (why) {
      report.skipped.push({ id, why });
      if (explicit) { report.rooms[id] = { fatal: 'cannot analyse ' + id + ': ' + why, items: [] }; }
      continue;
    }
    todo.push({ id, pr, def });
  }
  const engineHash = hashFiles(ENGINE_FILES) + (MARGIN_PX ? '|margin' + MARGIN_PX.h + ',' + MARGIN_PX.v + (MARGIN_PX.coyote ? ',coyote' : '') + ',edge' + MARGIN_PX.edge : '');
  const critical = MARGIN_PX ? criticalChecks(P, planRooms) : null;
  if (critical) report.margin = { h: MARGIN_PX.h, v: MARGIN_PX.v, critical: critical.list };
  const jobs = A.jobs || Math.max(1, Math.min(16, os.cpus().length - 1));
  // build tasks
  const tasks = [];
  const roomPlans = new Map();
  for (const r of todo) {
    let rp;
    try { rp = planRoomChecks(r.pr, r.def, G, { planRooms, overlay: A.overlay, orders: ORD.orders }); } catch (e) { report.rooms[r.id] = { fatal: 'cannot prepare checks: ' + e.message, items: [] }; continue; }
    if (MARGIN_PX) marginChecks(rp);
    roomPlans.set(r.id, rp);
    const rh = roomHash(r.def);
    rp.roomHash = rh;
    for (const s of rp.sets.values()) tasks.push(makeTask(tasks.length, r.id, s.req, s.entries, rp.spotIds, A.overlay, engineHash, rh));
  }
  const t0 = Date.now();
  const exec = makeExecutor(A, jobs, log);
  const results = new Map(); // room → setKey → result
  const done = await exec(tasks, 'reach: ' + todo.length + ' room(s), ');
  for (const t of tasks) {
    if (!results.has(t.room)) results.set(t.room, new Map());
    results.get(t.room).set(t.setKey, done.get(t.taskId));
  }
  const elapsed = Date.now() - t0;
  // assemble
  for (const r of todo) {
    const rp = roomPlans.get(r.id);
    if (!rp) continue;
    report.rooms[r.id] = MARGIN_PX ? assembleMargin(r, rp, results.get(r.id) || new Map(), A, critical)
      : assemble(r, rp, results.get(r.id) || new Map(), A);
  }
  for (const rr of Object.values(report.rooms)) for (const it of rr.items || []) { if (it.level === 'error') report.errors++; else if (it.level === 'warning') report.warnings++; }
  for (const rr of Object.values(report.rooms)) if (rr.fatal) report.errors++;
  if (loadErrors.length) report.errors += loadErrors.length;
  report.elapsedMs = elapsed;
  // global
  if (A.global) report.global = await runGlobal(P, report, roomPlans, todo, A, exec, engineHash);
  if (report.global && !report.global.ok) report.errors++;
  if (A.json) console.log(JSON.stringify(report, null, 1));
  else printReport(report, A, todo);
  return report.errors ? 1 : 0;
}

function assemble(r, rp, res, A) {
  const items = [];
  const add = (level, check, msg, detail) => {
    if (level !== 'pass' && items.some((x) => x.level === level && x.msg === msg)) return null; // e.g. one task error seen by many checks
    const it = { level, kind: check.kind, msg, detail: detail || [] };
    items.push(it);
    return it;
  };
  for (const p of rp.ex.problems) items.push({ level: 'error', kind: 'exit', msg: p, detail: [] });
  const get = (key, planExit) => {
    const s = res.get(key);
    if (!s) return { error: 'missing result' };
    if (s.error) return { error: s.error.split('\n')[0] };
    const e = s.entries[rp.ex.map[planExit]];
    if (!e) return { error: 'exit ' + planExit + ' not available' };
    if (e.error) return { error: e.error };
    return e;
  };
  const reached = (e) => Object.keys(e.exits || {}).map((b) => rp.ex.back[b] || b + '(unplanned)').sort();
  const exitsOf = (e, planTo) => e.exits && e.exits[rp.ex.map[planTo]];
  const overlayFor = (key) => { const s = res.get(key); return s && s.overlay ? s.overlay : null; };
  const diag = (e, key, req) => {
    const d = ['reachable exits from here with ' + fmtReq(req) + ': ' + (reached(e).join(' ') || '(none)')];
    if (e.worlds && e.worlds.length > 1) d.push('room variants explored: ' + e.worlds.join(' | '));
    const st = res.get(key);
    const closed = st && st.gates ? st.gates.filter((g) => !g.open) : [];
    if (closed.length) d.push('closed with these requirements: ' + closed.map((g) => g.id + ' (opens "' + g.cond + '")').join(', '));
    const ov = overlayFor(key);
    if (ov && (A.verbose || A.overlay)) { d.push('overlay (* stand, @ swim, | wall, + air):'); for (const l of ov) d.push('  ' + l); }
    return d;
  };
  for (const c of rp.checks) {
    if (c.kind === 'path') {
      const outcomes = c.alts.map((a) => { const e = get(a.key, c.from); return { a, e, ok: !e.error && !!exitsOf(e, c.to) }; });
      const errs = outcomes.filter((o) => o.e.error);
      for (const o of errs) add('error', c, c.from + '→' + c.to + ' ' + fmtReq(o.a.req) + ': ' + o.e.error);
      if (A.expect && c.alts.every((a) => a.expect === 'fail')) {
        const any = outcomes.find((o) => o.ok);
        if (any) add('error', c, 'EXPECTED IMPOSSIBLE but possible: ' + c.from + '→' + c.to + ' ' + fmtReq(any.a.req), any.e.exits[rp.ex.map[c.to]]);
        else add('pass', c, 'impossible as expected: ' + c.from + '→' + c.to + ' ' + c.alts.map((a) => fmtReq(a.req)).join(' | '));
        continue;
      }
      const ok = outcomes.filter((o) => o.ok);
      if (!ok.length) {
        const o = outcomes.find((x) => !x.e.error);
        add('error', c, 'path ' + c.from + '→' + c.to + ' is NOT possible with ' + c.alts.map((a) => fmtReq(a.req)).join(' or '), o ? diag(o.e, o.a.key, o.a.req) : []);
      } else {
        add('pass', c, 'path ' + c.from + '→' + c.to + ' ' + ok.map((o) => fmtReq(o.a.req)).join(' | '), A.verbose ? exitsOf(ok[0].e, c.to) : []);
        for (const o of outcomes) if (!o.ok && !o.e.error && o.a.expect !== 'fail') add('warning', c, 'alternative ' + c.from + '→' + c.to + ' ' + fmtReq(o.a.req) + ' does not work (the path still works with ' + fmtReq(ok[0].a.req) + ')', diag(o.e, o.a.key, o.a.req));
      }
    } else if (c.kind === 'gate' || c.kind === 'spotgate') {
      const e = get(c.key, c.from);
      if (e.error) { add('error', c, (c.kind === 'gate' ? c.from + '→' + c.to : c.id) + ' without ' + c.without + ': ' + e.error); continue; }
      const leak = c.kind === 'gate' ? exitsOf(e, c.to) : e.spots && e.spots[c.id] && e.spots[c.id].path;
      const what = c.kind === 'gate' ? 'path ' + c.from + '→' + c.to : 'spot ' + c.id + ' from ' + c.from;
      if (leak) add(c.kind === 'gate' && c.inter && !c.token ? 'error' : 'warning', c, 'GATE LEAK: ' + what + ' needs ' + fmtReq(c.alt) + ' but is possible WITHOUT ' + c.without + ' (with ' + fmtReq(c.req) + ')' + (c.kind === 'gate' && c.inter ? ' — inter-region gate' : ''), leak);
      else add('pass', c, what + ' blocked without ' + c.without + (c.extra && c.extra.length ? ' (even with ' + c.extra.join(', ') + ')' : ''));
    } else if (c.kind === 'spot') {
      const outcomes = c.alts.map((a) => { const e = get(a.key, c.from); return { a, e, s: !e.error && e.spots && e.spots[c.id] }; });
      for (const o of outcomes) if (o.e.error) add('error', c, 'spot ' + c.id + ' ' + fmtReq(o.a.req) + ': ' + o.e.error);
      const st = (res.values().next().value || {}).targets;
      const ti = rp.spotIds.indexOf(c.id);
      if (st && st[ti] && !st[ti].ok) {
        if (!items.some((x) => x.msg === 'spot ' + c.id + ': ' + st[ti].reason)) add('error', c, 'spot ' + c.id + ': ' + st[ti].reason);
        continue;
      }
      if (A.expect && c.alts.every((a) => a.expect === 'fail')) {
        const any = outcomes.find((o) => o.s);
        if (any) add('error', c, 'EXPECTED UNREACHABLE but reachable: spot ' + c.id + ' from ' + c.from + ' ' + fmtReq(any.a.req), any.s.path);
        else add('pass', c, 'unreachable as expected: spot ' + c.id + ' from ' + c.from + ' ' + c.alts.map((a) => fmtReq(a.req)).join(' | '));
        continue;
      }
      const ok = outcomes.filter((o) => o.s);
      if (!ok.length) {
        const o = outcomes.find((x) => !x.e.error);
        add('error', c, 'spot ' + c.id + ' is NOT reachable from ' + c.from + ' with ' + c.alts.map((a) => fmtReq(a.req)).join(' or '), o ? diag(o.e, o.a.key, o.a.req) : []);
        continue;
      }
      const best = ok[0];
      const esc = (best.s.escape || []).map((b) => rp.ex.back[b] || b);
      if (esc.includes(c.from)) add('pass', c, 'spot ' + c.id + ' from ' + c.from + ' ' + ok.map((o) => fmtReq(o.a.req)).join(' | ') + ' (and back)', A.verbose ? best.s.path : []);
      else if (esc.length) add('warning', c, 'spot ' + c.id + ' is reachable from ' + c.from + ' ' + fmtReq(best.a.req) + ' but you cannot get back to ' + c.from + ' (only to ' + esc.join(' ') + ')', best.s.path);
      else add('error', c, 'SOFTLOCK: after reaching spot ' + c.id + ' (from ' + c.from + ' ' + fmtReq(best.a.req) + ') no exit is reachable', best.s.path);
      for (const o of outcomes) if (!o.s && !o.e.error && o.a.expect !== 'fail') add('warning', c, 'alternative for spot ' + c.id + ' from ' + c.from + ' ' + fmtReq(o.a.req) + ' does not work', diag(o.e, o.a.key, o.a.req));
    } else if (c.kind === 'oneway') {
      const e = get(c.key, c.from);
      if (e.error) continue; // the entry problem is reported by the planned checks / exit mapping
      const t = exitsOf(e, c.to);
      if (t) {
        const it = add('warning', c, 'unplanned traversal ' + c.from + '→' + c.to + ' is possible (with every ability: ' + fmtReq(c.req) + ') — the plan treats this direction as impossible (one-way)', t);
        if (it) Object.assign(it, { from: c.from, to: c.to });
      }
    }
  }
  const stats = { ms: 0, steps: 0, sets: res.size };
  for (const s of res.values()) if (s && s.stats) { stats.ms += s.stats.ms; stats.steps += s.stats.steps; }
  const overlays = A.overlay ? Array.from(res.values()).filter((s) => s && s.overlay).map((s) => ({ req: s.req, grid: s.overlay })) : [];
  return { items, stats, overlays, file: null, full: rp.FULL };
}

// ---- margin mode (--margin px): only the positive checks (plan paths, spots + the way back) are re-run with the
// handicapped motor; gates/one-way checks are about impossibility and stay with the exact motor (normal run).
function marginChecks(rp) {
  rp.checks = rp.checks.filter((c) => c.kind === 'path' || c.kind === 'spot');
  const keep = new Set();
  for (const c of rp.checks) for (const a of c.alts) if (a.expect !== 'fail') keep.add(a.key);
  for (const k of Array.from(rp.sets.keys())) if (!keep.has(k)) rp.sets.delete(k);
}

// The intended critical path (tools/plan_check.js): every room on a step's route must be crossed from the exit toward
// the previous room to the exit toward the next one; the step's goal (shrine / arena / lever) from the arrival exit.
function criticalChecks(P) {
  const cp = require('child_process').spawnSync(process.execPath, [path.join(ROOT, 'tools', 'plan_check.js'), P.file], { encoding: 'utf8' });
  const rooms = new Map(P.plan.rooms.map((r) => [r.id, r]));
  const paths = new Set(), spots = new Set(), list = [];
  const exitTo = (room, to) => { const r = rooms.get(room); const e = r && (r.exits || []).find((x) => x.to === to); return e ? e.id : null; };
  for (const line of (cp.stdout || '').split('\n')) {
    const m = /^\s*\d+\.\s+(\S+)\s+@\s+(\S+)\s+route:\s+(.+)$/.exec(line);
    if (!m) continue;
    const route = m[3].split('>').map((x) => x.trim()).filter(Boolean);
    for (let i = 1; i < route.length - 1; i++) {
      const a = exitTo(route[i], route[i - 1]), b = exitTo(route[i], route[i + 1]);
      if (a && b) { paths.add(route[i] + ' ' + a + '>' + b); list.push(route[i] + ' ' + a + '→' + b); }
    }
    const goal = m[1], room = route[route.length - 1];
    const spot = goal.startsWith('boss:') ? 'arena:' + goal.slice(5) : goal.startsWith('lever:') ? goal : 'shrine:' + goal;
    const from = route.length > 1 ? exitTo(room, route[route.length - 2]) : null;
    if (from) { spots.add(room + ' ' + spot + '@' + from); list.push(room + ' ' + spot + ' from ' + from); }
  }
  return { paths, spots, list };
}

function assembleMargin(r, rp, res, A, critical) {
  const items = [];
  const tag = 'MARGIN (' + MARGIN_PX.h + ',' + MARGIN_PX.v + ' px): ';
  const add = (level, check, msg, detail) => { items.push({ level, kind: 'margin', msg, detail: detail || [] }); };
  for (const p of rp.ex.problems) items.push({ level: 'error', kind: 'exit', msg: p, detail: [] });
  const get = (key, planExit) => {
    const s = res.get(key);
    if (!s) return { error: 'missing result' };
    if (s.error) return { error: s.error.split('\n')[0] };
    const e = s.entries[rp.ex.map[planExit]];
    if (!e) return { error: 'exit ' + planExit + ' not available' };
    if (e.error) return { error: e.error };
    return e;
  };
  const reached = (e) => Object.keys(e.exits || {}).map((b) => rp.ex.back[b] || b + '(unplanned)').sort();
  for (const c of rp.checks) {
    const alts = c.alts.filter((a) => a.expect !== 'fail');
    if (!alts.length) continue;
    if (c.kind === 'path') {
      const crit = critical.paths.has(r.id + ' ' + c.from + '>' + c.to);
      const outs = alts.map((a) => { const e = get(a.key, c.from); return { a, e, ok: !e.error && !!(e.exits && e.exits[rp.ex.map[c.to]]) }; });
      for (const o of outs) if (o.e.error) add('error', c, c.from + '→' + c.to + ' ' + fmtReq(o.a.req) + ': ' + o.e.error);
      if (outs.some((o) => o.ok)) { add('pass', c, 'path ' + c.from + '→' + c.to + ' has margin'); continue; }
      const o = outs.find((x) => !x.e.error);
      if (!o) continue;
      add(crit ? 'error' : 'warning', c, tag + 'path ' + c.from + '→' + c.to + ' ' + alts.map((a) => fmtReq(a.req)).join(' or ') + ' only works with a near-exact move' + (crit ? ' — CRITICAL PATH' : ''),
        ['with the handicapped motor, reachable exits: ' + (reached(o.e).join(' ') || '(none)')]);
    } else if (c.kind === 'spot') {
      const crit = critical.spots.has(r.id + ' ' + c.id + '@' + c.from);
      const outs = alts.map((a) => { const e = get(a.key, c.from); return { a, e, s: !e.error && e.spots && e.spots[c.id] }; });
      const ok = outs.filter((o) => o.s);
      if (!ok.length) {
        if (outs.every((o) => o.e.error)) continue;
        add(crit ? 'error' : 'warning', c, tag + 'spot ' + c.id + ' from ' + c.from + ' ' + alts.map((a) => fmtReq(a.req)).join(' or ') + ' only reachable with a near-exact move' + (crit ? ' — CRITICAL PATH' : ''));
        continue;
      }
      const esc = (ok[0].s.escape || []).map((b) => rp.ex.back[b] || b);
      if (esc.includes(c.from)) add('pass', c, 'spot ' + c.id + ' from ' + c.from + ' (and back) has margin');
      else add('warning', c, tag + 'spot ' + c.id + ' from ' + c.from + ': the way back to ' + c.from + ' only works with a near-exact move (with margin only to: ' + (esc.join(' ') || 'no exit') + ')', ok[0].s.path.slice(-12));
    }
  }
  const stats = { ms: 0, steps: 0, sets: res.size };
  for (const s of res.values()) if (s && s.stats) { stats.ms += s.stats.ms; stats.steps += s.stats.steps; }
  return { items, stats, overlays: [], file: null, full: rp.FULL };
}

// ---- global: measured unplanned traversals → augmented plan → plan_check (progression + no-trap)
// Each unplanned traversal (found with every ability) gets a minimal requirement list by greedy removal
// (one ability/token at a time, re-measured), then is added to a copy of the plan as a path.
async function runGlobal(P, report, roomPlans, todo, A, exec, engineHash) {
  const items = [];
  for (const r of todo) {
    const rr = report.rooms[r.id];
    if (!rr || !rr.items) continue;
    for (const it of rr.items) {
      if (it.kind !== 'oneway' || it.level !== 'warning' || !it.from) continue;
      items.push({ room: r.id, from: it.from, to: it.to, cur: rr.full.slice() });
    }
  }
  const order = [];
  for (const it of items) for (const t of it.cur) if (!order.includes(t)) order.push(t);
  order.sort((a, b) => (MOVEMENT.indexOf(b) - MOVEMENT.indexOf(a)) || a.localeCompare(b));
  let id = 0;
  for (const x of order) {
    const tasks = [];
    const map = [];
    for (const it of items) {
      if (!it.cur.includes(x)) continue;
      const rp = roomPlans.get(it.room);
      const t = makeTask(id++, it.room, minus(it.cur, x), [rp.ex.map[it.from]], rp.spotIds, false, engineHash, rp.roomHash);
      tasks.push(t); map.push(it);
    }
    if (!tasks.length) continue;
    const res = await exec(tasks, 'global: minimise unplanned traversals without ' + x + ': ');
    tasks.forEach((t, i) => {
      const r = res.get(t.taskId);
      const rp = roomPlans.get(t.room);
      const e = r && r.entries && r.entries[rp.ex.map[map[i].from]];
      if (e && e.exits && e.exits[rp.ex.map[map[i].to]]) map[i].cur = t.req;
    });
  }
  const aug = JSON.parse(JSON.stringify(P.plan));
  for (const it of items) aug.rooms.find((x) => x.id === it.room).paths.push({ from: it.from, to: it.to, requires: it.cur, measured: true });
  const built = new Set(todo.map((r) => r.id));
  const complete = P.plan.rooms.every((r) => built.has(r.id));
  const f = path.join(ROOT, 'test-output', 'tools', 'augmented_plan.json');
  fs.mkdirSync(path.dirname(f), { recursive: true });
  fs.writeFileSync(f, JSON.stringify(aug, null, 1));
  const run = (file) => require('child_process').spawnSync(process.execPath, [path.join(ROOT, 'tools', 'plan_check.js'), file, '--quiet'], { encoding: 'utf8' });
  const cp = run(f);
  const base = items.length ? run(P.file) : cp;
  const lines = ((cp.stdout || '') + (cp.stderr || '')).trim().split('\n');
  return {
    ok: cp.status === 0 || base.status !== 0, // only NEW plan_check failures caused by measured traversals count
    planOk: base.status === 0, augmentedOk: cp.status === 0, complete, file: rel(f),
    added: items.map((it) => it.room + ' ' + it.from + '→' + it.to + ' ' + fmtReq(it.cur)),
    output: lines.slice(-30),
  };
}

function printReport(report, A, todo) {
  const L = [];
  L.push('GUTTERLIGHT reach' + (report.margin ? ' MARGIN ' + report.margin.h + ' px horizontal / ' + report.margin.v + ' px vertical (handicapped motor; critical path: ' + report.margin.critical.length + ' room crossings/goals)' : '') + ' — ' + todo.length + ' room(s)' + (report.elapsedMs != null ? ' in ' + (report.elapsedMs / 1000).toFixed(1) + ' s' : ''));
  for (const e of report.loadErrors) L.push('  ERROR load: ' + e);
  const ao = report.abilityOrders;
  if (ao) L.push('gates hold against the maximal ability set owned before the gated ability (' + ao.count + ' feasible orders, ' + ao.source + '): ' +
    Object.entries(ao.before).map(([x, s]) => x + ' ← [' + s.join(',') + ']').join('  '));
  for (const [id, rr] of Object.entries(report.rooms)) {
    L.push('');
    if (rr.fatal) { L.push('── ' + id + ': ERROR ' + rr.fatal); continue; }
    const ne = rr.items.filter((x) => x.level === 'error').length, nw = rr.items.filter((x) => x.level === 'warning').length;
    const np = rr.items.filter((x) => x.level === 'pass').length;
    L.push('── ' + id + '  ' + np + ' ok, ' + ne + ' error(s), ' + nw + ' warning(s)  [' + rr.stats.sets + ' ability sets, ' + (rr.stats.ms / 1000).toFixed(1) + ' s cpu]');
    for (const it of rr.items) {
      if (it.level === 'pass' && !A.verbose) continue;
      const tag = it.level === 'error' ? '  ERROR ' : it.level === 'warning' ? '  warn  ' : '  ok    ';
      L.push(tag + it.msg);
      const show = it.level === 'error' || A.verbose || (it.level === 'warning' && it.kind !== 'oneway');
      if (show) for (const d of (it.detail || []).slice(0, 80)) L.push('        ' + d);
    }
    for (const o of rr.overlays || []) {
      L.push('  overlay ' + fmtReq(o.req) + ' (* stand, @ swim, | wall cling, + airborne start):');
      for (const l of o.grid) L.push('    ' + l);
    }
  }
  if (report.skipped.length) {
    const by = new Map();
    for (const k of report.skipped) { if (!by.has(k.why)) by.set(k.why, []); by.get(k.why).push(k.id); }
    L.push('');
    for (const [why, list] of by) L.push('skipped (' + why + '): ' + list.length + ' room(s)' + (list.length <= 12 || A.verbose ? ': ' + list.join(' ') : ': ' + list.slice(0, 12).join(' ') + ' …'));
  }
  if (report.global) {
    const g = report.global;
    L.push('');
    L.push('GLOBAL: ' + g.added.length + ' measured unplanned traversal(s) added to ' + g.file + (g.complete ? '' : ' (world incomplete: unbuilt rooms keep their planned paths)'));
    for (const a of g.added) L.push('  + ' + a);
    L.push('  plan_check on the original plan: ' + (g.planOk ? 'OK' : 'FAIL') + '; on the augmented plan: ' + (g.augmentedOk ? 'OK' : 'FAIL') + (g.ok ? '' : '  ← the measured traversals break progression / no-trap'));
    if (!g.augmentedOk || A.verbose) for (const l of g.output) L.push('    ' + l);
  }
  L.push('');
  L.push((report.errors ? 'FAIL' : 'OK') + ': ' + report.errors + ' error(s), ' + report.warnings + ' warning(s)');
  console.log(L.join('\n'));
}

if (isMainThread) {
  main().then((code) => process.exit(code), (e) => { console.error(e && e.stack || e); process.exit(3); });
} else {
  workerMain();
}
