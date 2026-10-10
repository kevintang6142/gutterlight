// tools/lib/nav.js — in-room navigation planner for the playthrough bot (tools/playthrough.js).
//
// Given a snapshot of the REAL game (room id, live tile array, live solids, the player's exact motor state, owned
// abilities) and a target (exit id, plan spot id, touch rect or stand zone), it runs tools/lib/reach_core's macro
// search from the player's ACTUAL state and returns the next executable action:
//   {type:'seq', codes:[...], pre, desc, expect:{kind, x, y, exit}, margin}   frame-by-frame input codes
//   {type:'walkout', dir, desc}          hold a direction until the room changes (walk/swim out of an opening)
//   {type:'hold', dir, frames, desc}     hold a direction (slide down a wall, climb out of water)
//   {type:'break', comp, codes, side, desc}  walk to a Brand position for breakable component `comp`
//   {type:'here', codes, desc}           already at a stand target: walk codes onto the spot
//   {type:'fail', reason, exits}
// The motor is the same deterministic code in Node and in the browser, so a sequence simulated here from the exact
// state reproduces exactly in the game (the executor compares the predicted end state with the real one).
// Input codes: bit 1 left, 2 right, 4 down, 8 jump held, 16 jump press (ignored: presses are derived from
// transitions, like G.input), 32 dash press, 64 plunge (spell press + down).
'use strict';
const { loadWorld } = require('./game_data');
const RC = require('./reach_core');
const PlanLib = require('./plan');

const TILE = 40;
const B_L = 1, B_R = 2, B_DN = 4, B_JH = 8, B_DP = 32, B_PL = 64;
const MOVEMENT = PlanLib.MOVEMENT;

function hashArr(a) {
  let h = 2166136261 >>> 0;
  for (let i = 0; i < a.length; i++) { h ^= a[i] & 255; h = Math.imul(h, 16777619) >>> 0; }
  return h.toString(36) + ':' + a.length;
}

class Nav {
  constructor() {
    this.W = loadWorld({});
    this.G = this.W.G;
    RC.installFastPaths(this.G);
    this.M = this.G.PlayerMotor;
    this.T = this.G.T;
    this.cache = new Map();    // analyzer per room/tiles/solids/abilities
    this.stats = { plans: 0, closures: 0, ms: 0 };
  }

  // ---- rooms -------------------------------------------------------------------------------------------
  baseRoom(snap) {
    const G = this.G, def = G.World.getRoom(snap.room);
    const r = G.World.createRoom(def, { tileOnly: true, flags: {} });
    if (snap.tiles) { if (snap.tiles.length !== r.tiles.length) throw new Error('tile array size mismatch for ' + snap.room); r.tiles.set(snap.tiles); }
    r.solids = (snap.solids || []).map((s) => ({ x: s.x, y: s.y, w: s.w, h: s.h, owner: null, oneWay: !!s.oneWay, noGrip: !!s.noGrip }));
    return r;
  }

  abilityList(ab) { return MOVEMENT.filter((a) => ab && ab[a]); }

  analyzer(snap) {
    const req = this.abilityList(snap.abilities);
    const key = snap.room + '|' + hashArr(snap.tiles || []) + '|' + JSON.stringify(snap.solids || []) + '|' + req.join(',');
    let e = this.cache.get(key);
    if (e) { this.stats.hits = (this.stats.hits || 0) + 1; return e; }
    this.stats.misses = (this.stats.misses || 0) + 1;
    (this.stats.missLog || (this.stats.missLog = [])).push(snap.room + ' solids=' + (snap.solids || []).length + ' key=' + key.slice(snap.room.length + 1, snap.room.length + 40));
    if (this.cache.size > 6) this.cache.clear();
    const G = this.G, def = G.World.getRoom(snap.room);
    if (!def) throw new Error('unknown room ' + snap.room);
    const an = new RC.RoomAnalyzer(G, def, { alts: 24 });
    an.gates = [];                                  // live solids (gates, doors) come from the snapshot
    const base = this.baseRoom(snap);
    const variants = new Map();
    const EMPTY = this.T.EMPTY;
    an.roomFor = (worldKey) => {
      let r = variants.get(worldKey);
      if (r) return r;
      r = this.baseRoom(snap);
      if (worldKey) for (const id of worldKey.split(';')) {
        const c = an.comps.find((x) => x.id === id);
        if (c) for (const [cc, rr] of c.tiles) r.tiles[rr * r.cols + cc] = EMPTY;
      }
      variants.set(worldKey, r);
      return r;
    };
    e = { an, base, req, key, targets: new Map() };
    this.cache.set(key, e);
    return e;
  }

  // target → target index (or exit id). target: {exit} | {spot, radius} | {rect:{x,y,w,h}} | {stand:{feetY0,feetY1,cx0,cx1}}
  targetIndex(e, target) {
    if (target.exit) return { exit: target.exit };
    const k = JSON.stringify(target);
    if (e.targets.has(k)) return { ti: e.targets.get(k) };
    const an = e.an;
    let ti;
    if (target.spot) ti = an.addTarget(target.spot, target.radius);
    else {
      // custom targets must exist before ground segments are created (stands are computed per new segment):
      // a custom stand target added later is checked against existing segments below.
      an.targets.push(target.rect ? { id: k, ok: true, kind: 'touch', rect: target.rect } : { id: k, ok: true, kind: 'stand', stand: target.stand });
      ti = an.targets.length - 1;
    }
    const t = an.targets[ti];
    if (!t.ok) throw new Error('target ' + k + ': ' + t.reason);
    if (t.kind === 'stand') {      // late target: mark existing segments
      for (const g of an.graphs.values()) for (const list of g.segs.values()) for (const seg of list) {
        const feet = seg.y + an.ph;
        if (feet < t.stand.feetY0 || feet > t.stand.feetY1) continue;
        const c0 = seg.x0 + an.pw / 2, c1 = seg.x1 + an.pw / 2;
        if (c1 >= t.stand.cx0 && c0 <= t.stand.cx1 && !seg.stands.includes(ti)) seg.stands.push(ti);
      }
    }
    if (t.kind === 'touch' && an.graphs.size) {
      // touch bits of cached simulations do not know a late target: drop the caches (rare: once per new touch target)
      for (const g of an.graphs.values()) { g.familyCache.clear(); for (const n of g.nodes) { n.expanded = false; n.out = []; } }
    }
    e.targets.set(k, ti);
    return { ti };
  }

  // ---- simulation (mirrors the browser: presses derive from transitions) ---------------------------------
  ctxFor(room, ab) { return { room, dt: 1 / 60, abilities: Object.assign({}, ab), mods: { noKnockback: false }, breakDive: null }; }

  // run codes from state s (cloned). Stop rule like reach_core.runPolicies once the policy part (from frame `pre`)
  // runs. prevCode: the input code held on the frame before. Returns {s, f, kind, exit, touch}.
  simulate(e, room, A, codes, opts) {
    const o = opts || {};
    const M = this.M, an = e.an;
    const s = an.clone(A);
    s.events = [];
    const ab = {};
    for (const a of e.req) ab[a] = true;
    const ctx = this.ctxFor(room, ab);
    let dive = false;
    ctx.breakDive = (rm, c, r) => { const comp = an.base.componentAt(c, r); dive = comp ? comp.id : true; return false; };
    const pre = o.pre || 0;
    let prev = o.prevCode || 0;
    let air = !!o.air, offWall = o.offWall !== false, offSwim = o.offSwim !== false;
    const W = an.W, H = an.H;
    let touch = 0;
    const tr = o.touchRect;
    for (let f = 0; f < codes.length; f++) {
      const c = codes[f];
      const inp = { left: !!(c & B_L), right: !!(c & B_R), up: false, down: !!(c & (B_DN | B_PL)), jump: !!(c & B_JH),
        jumpPressed: !!(c & B_JH) && !(prev & B_JH), dashPressed: !!(c & B_DP) && !(prev & B_DP) };
      if ((c & B_PL) && !(prev & B_PL) && !s.onGround && !s.swimming && !s.plunging && !(s.dashTime > 0) && ab.plunge) M.startPlunge(s);
      prev = c;
      dive = false;
      M.step(s, inp, ctx);
      if (s.hazard) return { s, f: f + 1, kind: 'hazard', touch };
      if (tr && s.x < tr.x + tr.w && s.x + s.w > tr.x && s.y < tr.y + tr.h && s.y + s.h > tr.y) touch = 1;
      if (dive) return { s, f: f + 1, kind: 'break', comp: dive, touch };
      const cx = s.x + s.w / 2, cy = s.y + s.h / 2;
      if (cx < 0 || cx >= W || cy < 0 || cy >= H) return { s, f: f + 1, kind: 'exit', exit: an.exitAt(cx, cy), touch };
      if (f < pre) continue;
      const pf = f - pre + 1;
      if (!s.onGround) air = true;
      if (s.wall === 0) offWall = true;
      if (!s.swimming) offSwim = true;
      if (s.swimming && (offSwim || (pf >= 14 && s.dashTime <= 0))) return { s, f: f + 1, kind: 'swim', touch };
      if (s.wall !== 0 && (offWall || pf >= 14)) return { s, f: f + 1, kind: 'wall', touch };
      if (s.onGround && !s.plunging && (air || (pf >= 12 && s.dashTime <= 0))) return { s, f: f + 1, kind: 'ground', touch };
    }
    return { s, f: codes.length, kind: 'timeout', touch };
  }

  // frames of walking (dir) from a grounded state that bring x closest to tx without leaving the ground
  walkTo(e, room, A, tx) {
    const M = this.M, s = e.an.clone(A);
    s.events = [];
    const dir = tx > s.x ? 1 : -1;
    const ab = {};
    for (const a of e.req) ab[a] = true;
    const ctx = this.ctxFor(room, ab);
    let best = { k: 0, d: Math.abs(s.x - tx), x: s.x };
    const inp = { left: dir < 0, right: dir > 0, up: false, down: false, jump: false, jumpPressed: false, dashPressed: false };
    for (let k = 1; k < 2000; k++) {
      M.step(s, inp, ctx);
      if ((A.swimming ? !s.swimming : !s.onGround) || s.hazard) break;
      const cx = s.x + s.w / 2;
      if (cx < 0 || cx >= e.an.W) break;
      const d = Math.abs(s.x - tx);
      if (d < best.d) best = { k, d, x: s.x };
      if ((dir > 0 && s.x > tx + 6) || (dir < 0 && s.x < tx - 6)) break;
    }
    return { dir, k: best.k, x: best.x, codes: new Array(best.k).fill(dir > 0 ? B_R : B_L) };
  }

  // frames of sliding down a wall (holding toward it) that bring y closest to ty
  slideTo(e, room, A, ty) {
    const M = this.M, s = e.an.clone(A);
    s.events = [];
    const ab = {};
    for (const a of e.req) ab[a] = true;
    const ctx = this.ctxFor(room, ab);
    const dir = A.wall;
    const code = dir < 0 ? B_L : B_R;
    const inp = { left: dir < 0, right: dir > 0, up: false, down: false, jump: false, jumpPressed: false, dashPressed: false };
    let best = { k: 0, d: Math.abs(s.y - ty), y: s.y };
    for (let k = 1; k < 900; k++) {
      M.step(s, inp, ctx);
      if (s.wall !== dir || s.hazard || s.onGround) break;
      const d = Math.abs(s.y - ty);
      if (d < best.d) best = { k, d, y: s.y };
      if (s.y > ty + 8) break;
    }
    return { dir: dir < 0 ? -1 : 1, k: best.k, y: best.y, codes: new Array(best.k).fill(code), slide: true };
  }

  // ---- outcome → node in the start world's graph
  nodeOf(g, r) {
    if (r.kind === 'ground') return g.groundAt(r.s.x, r.s.y);
    if (r.kind === 'wall') return g.wallAt(r.s);
    if (r.kind === 'swim') return g.swimAt(r.s);
    return null;
  }

  // ---- plan ------------------------------------------------------------------------------------------------
  plan(snap, target, opts) {
    const t0 = Date.now();
    this.stats.plans++;
    const o = opts || {};
    const e = this.analyzer(snap);
    const an = e.an;
    const tg = this.targetIndex(e, target);
    const A = Object.assign({}, snap.motor);
    A.lastSafe = A.lastSafe ? { x: A.lastSafe.x, y: A.lastSafe.y } : { x: A.x, y: A.y };
    A.events = [];
    A.locked = false;
    if (A.hazard) return { type: 'fail', reason: 'player in a hazard state' };
    if (tg.ti != null) {          // already touching a touch target
      const t = an.targets[tg.ti];
      const r = t.rect;
      if (t.kind === 'touch' && r && A.x < r.x + r.w && A.x + A.w > r.x && A.y < r.y + r.h && A.y + A.h > r.y) {
        this.stats.ms += Date.now() - t0;
        return { type: 'here', codes: [], desc: 'already touching the target' };
      }
    }
    // a clinging / swimming start must expand with the wall / swim macro families (reach_core maps an exact
    // non-ground state to an 'air' node): start from the wall / swim node, macros are then tried from the exact state
    const sp = PlanLib.splitRequires(e.req);
    const g0p = an.graph('', sp.abilities, sp.tokens);
    if (!g0p.__navPatched) {
      const orig = g0p.nodeForState.bind(g0p);
      g0p.nodeForState = (st, label) => {
        if (label === 'now' && !st.hazard && !st.plunging) {
          if (st.wall && !st.swimming && !st.onGround) {
            // wall nodes are merged by dominance (a higher cling covers lower ones): the player cannot climb back
            // up to a higher sample, so the start gets its own node whose slide begins at the actual height
            const n = g0p.wallAt(st);
            if (n.yTop >= st.y - 2) return n;
            const own = g0p.newNode({ kind: 'wall', dir: n.dir, x: n.x, yTop: st.y, yBot: n.yBot, end: n.end });
            own.label = 'wall cling ' + (n.dir > 0 ? 'right' : 'left') + ' ' + g0p.tileStr(n.x + an.pw / 2, st.y + an.ph) + '..row ' + Math.floor((n.yBot + an.ph) / 40) + ' (now)';
            return own;
          }
          if (st.swimming) { const n = g0p.swimAt(st); if (n) return n; }
        }
        return orig(st, label);
      };
      g0p.__navPatched = true;
    }
    const res = an.closure([{ s: A, label: 'now' }], e.req);
    this.stats.closures++;
    const tr = tg.exit ? res.exits.get(tg.exit) : res.spots.get(tg.ti);
    if (!tr) {
      this.stats.ms += Date.now() - t0;
      return { type: 'fail', reason: 'target ' + JSON.stringify(target) + ' not reachable from the current state (' + this.describeState(A) + ')',
        exits: [...res.exits.keys()], spots: [...res.spots.keys()].map((i) => an.targets[i].id) };
    }
    // split the trace into world parts (root world first)
    const parts = [];
    let cur = tr;
    for (let guard = 0; cur && guard < 20; guard++) {
      const chain = [];
      let node = cur.node, prev = null;
      for (let k = 0; node && k < 500; k++) {
        const p = cur.parent.get(node);
        if (!p) break;
        chain.push({ node, via: p.out });
        if (!p.from) prev = p.prev;
        node = p.from;
      }
      chain.reverse();
      parts.unshift({ world: cur.world, chain, last: cur.last, g: cur.g });
      cur = prev;
    }
    const root = parts[0];
    const g0 = root.g;
    const start = root.chain[0].node;
    const edges = root.chain.slice(1).map((c) => c.via).concat(root.last ? [root.last] : []);
    const first = edges[0];
    const final = parts.length === 1;
    const goal = final ? (tg.exit ? { exit: tg.exit } : { ti: tg.ti }) : { brk: root.last && root.last.brk ? root.last.brk.comp : null };
    const room = an.roomFor(g0.worldKey);
    const pathDesc = RC.describePath(tr).slice(0, 60);
    const out = this.firstAction(e, g0, room, A, start, first, goal, res, o);
    out.path = pathDesc;
    out.parts = parts.length;
    this.stats.ms += Date.now() - t0;
    return out;
  }

  describeState(s) {
    return 'x=' + s.x.toFixed(1) + ' y=' + s.y.toFixed(1) + ' tile(' + Math.floor((s.x + s.w / 2) / TILE) + ',' + Math.floor((s.y + s.h - 1) / TILE) + ')' +
      (s.onGround ? ' ground' : '') + (s.wall ? ' wall' + s.wall : '') + (s.swimming ? ' swim' : '') + ' vy=' + s.vy.toFixed(0);
  }

  // reverse distances inside the root world's graph: 0 = goal satisfied by standing on the node, 1 = one macro away
  distances(g, goal, res) {
    const nodes = res.nodes.filter((x) => x.g === g).map((x) => x.node);
    const dist = new Map();
    const rev = new Map();
    const q = [];
    for (const n of nodes) {
      if (goal.ti != null && n.stands && n.stands.includes(goal.ti)) { dist.set(n, 0); q.push(n); continue; }
      for (const o of n.out) {
        if (o.bad) continue;
        if ((goal.exit && o.exit === goal.exit) || (goal.ti != null && (o.touch & (1 << goal.ti))) || (goal.brk && o.brk && o.brk.comp === goal.brk)) {
          if (!dist.has(n)) { dist.set(n, 1); q.push(n); }
        }
        if (o.to) { if (!rev.has(o.to)) rev.set(o.to, []); rev.get(o.to).push(n); }
      }
    }
    q.sort((a, b) => dist.get(a) - dist.get(b));
    for (let i = 0; i < q.length; i++) {
      const n = q[i], d = dist.get(n);
      for (const p of rev.get(n) || []) if (!dist.has(p)) { dist.set(p, d + 1); q.push(p); }
    }
    return dist;
  }

  isGoal(r, goal, e) {
    if (goal.exit && r.kind === 'exit' && r.exit === goal.exit) return true;
    if (goal.brk && r.kind === 'break' && r.comp === goal.brk) return true;
    if (goal.ti != null) {
      const t = e.an.targets[goal.ti];
      if (t.kind === 'touch' && r.touch) return true;
    }
    return false;
  }

  firstAction(e, g0, room, A, start, first, goal, res, o) {
    const an = e.an;
    // already standing on a stand target's segment: walk onto the spot
    if (goal.ti != null && an.targets[goal.ti].kind === 'stand' && start.kind === 'ground' && start.stands.includes(goal.ti)) {
      const t = an.targets[goal.ti];
      const want = Math.min(Math.max((t.stand.cx0 + t.stand.cx1) / 2 - an.pw / 2, start.x0), start.x1);
      const w = this.walkTo(e, room, A, want);
      return { type: 'here', codes: w.codes, desc: 'walk onto the target (x ' + A.x.toFixed(0) + ' → ' + w.x.toFixed(0) + ')' };
    }
    if (!first) return { type: 'fail', reason: 'empty path' };
    if (first.brk && !first.codes) {
      const st = first.brk.state;
      const comp = an.comps.find((c) => c.id === first.brk.comp);
      const w = start.kind === 'ground' ? this.walkTo(e, room, A, st.x) : { codes: [], x: A.x };
      return { type: 'break', comp: first.brk.comp, tiles: comp ? comp.tiles : [], codes: w.codes, x: w.x, desc: first.desc };
    }
    if (!first.codes) {
      // walk/swim out of the room, climb out, slide down
      const m = /^(walk|swim) ([LR])/.exec(first.desc || '');
      if (first.exit && m) {
        return { type: 'walkout', dir: m[2] === 'L' ? -1 : 1, exit: first.exit, desc: first.desc };
      }
      if (m) return { type: 'hold', dir: m[2] === 'L' ? -1 : 1, frames: 240, desc: first.desc };
      if (/^slide/.test(first.desc || '')) return { type: 'hold', dir: start.dir || A.wall || 0, frames: 600, desc: first.desc, slide: true };
      return { type: 'fail', reason: 'cannot execute edge: ' + first.desc };
    }
    // macro edge. Candidates: the planned macro and the start node's other improving edges (+ their alternatives:
    // other samples / policies to the same destination), each replayed from the ACTUAL state after a pre-roll
    // (walk / swim / slide toward the edge's sampled start, +-3 frames); then every policy of the family. The best
    // outcome wins (goal first, then fewer remaining macros); among equally good candidates the one with the widest
    // start tolerance (margin) is preferred, like a human picking a safe take-off. Edges that cannot be reproduced
    // from the actual state are marked bad (fragile: they only work from reach's exact sample) and the distances are
    // recomputed without them.
    const touchRect = goal.ti != null && an.targets[goal.ti].kind === 'touch' ? an.targets[goal.ti].rect : null;
    const fragile = [];
    let dist, dStart, cands, edges, sideways = [];
    for (let attempt = 0; attempt < 8; attempt++) {
      dist = this.distances(g0, goal, res);
      dStart = dist.has(start) ? dist.get(start) : Infinity;
      if (dStart === Infinity) break;
      const evalWith = (mode, expectNode) => (pre, codes) => {
        const r = this.simulate(e, room, A, pre.concat(Array.from(codes)), { pre: pre.length, air: mode.air, offWall: mode.offWall, offSwim: mode.offSwim, touchRect });
        let score;
        if (this.isGoal(r, goal, e)) score = -1;
        else if (r.kind === 'exit' || r.kind === 'hazard' || r.kind === 'timeout') score = Infinity;
        else if (r.kind === 'break') score = goal.brk ? Infinity : (dStart > 0 ? dStart - 0.5 : Infinity); // a dive break moves on
        else {
          const n = this.nodeOf(g0, r);
          score = !n ? Infinity : dist.has(n) ? dist.get(n) : (n === expectNode ? dStart - 0.5 : Infinity);
          if (goal.ti != null && n && n.stands && n.stands.includes(goal.ti)) score = Math.min(score, 0);
          r.node = n;
        }
        return { r, score };
      };
      const preRoll = (st) => {
        let info = null;
        if (start.kind === 'ground' || start.kind === 'swim') info = this.walkTo(e, room, A, st.x);
        else if (start.kind === 'wall' && A.wall && st.y > A.y + 2) info = this.slideTo(e, room, A, st.y);
        const out = [];
        if (!info) { out.push([]); return out; }
        const dirCode = info.dir > 0 ? B_R : B_L;
        out.push(info.codes);
        for (let k = 1; k <= 3; k++) {
          if (info.codes.length - k >= 0) out.push(info.codes.slice(0, info.codes.length - k));
          out.push(info.codes.concat(new Array(k).fill(dirCode)));
        }
        return out;
      };
      cands = [];
      sideways = [];
      const tried = new Set();
      const tryOne = (pre, codes, label, mode, expectNode, edge) => {
        const key = pre.length + ':' + (pre[0] || 0) + ':' + label;
        if (tried.has(key)) return null;
        tried.add(key);
        const ev = evalWith(mode, expectNode);
        const c = ev(pre, codes);
        c.pre = pre; c.codes = codes; c.label = label; c.ev = ev; c.edge = edge;
        if (c.score < dStart) cands.push(c);
        else if (c.score === dStart && c.r.node && c.r.node !== start) sideways.push(c);
        return c;
      };
      const improving = (o2) => !o2.bad && o2.codes && o2.job && ((goal.exit && o2.exit === goal.exit) || (goal.ti != null && (o2.touch & (1 << goal.ti))) ||
        (goal.brk && o2.brk && o2.brk.comp === goal.brk) || (o2.to && dist.has(o2.to) && dist.get(o2.to) < dStart));
      const dOf = (o2) => (o2.exit || o2.brk || o2.touch ? 0 : o2.to && dist.has(o2.to) ? dist.get(o2.to) : 99);
      // staged (cheap first): the planned edge; if it is missing or tight (< 6 px), the other improving edges; if still
      // nothing, the alternatives (other samples/policies) of all of them
      const all = (start.out || []).filter(improving).sort((a, b) => (a === first ? -1 : b === first ? 1 : dOf(a) - dOf(b))).slice(0, 32);
      const alts = [];
      for (const o2 of all) for (const alt of o2.alts || []) if (alt.job && alt.codes && !alt.bad) alts.push(alt);
      const runEdges = (list) => list.forEach((o2) => {
        for (const pre of preRoll(o2.job.st)) tryOne(pre, o2.codes, o2 === first ? 'planned' : 'edge:' + o2.desc, o2.job.mode, o2.to || null, o2);
      });
      runEdges(all.filter((o2) => o2 === first));
      const tight = () => {
        if (!cands.length) return true;
        if (o.margin === false) return false;
        const b0 = cands.reduce((m, c) => (c.score < m.score ? c : m), cands[0]);
        b0.margin = b0.margin || this.margin(e, room, A, b0, b0.ev);
        return b0.margin.px < 12;
      };
      if (tight()) runEdges(all.filter((o2) => o2 !== first));
      if (tight() && start.kind === 'ground' && cands.length) {
        // still a precision move: every ground policy from where the player stands (often a plain jump is tolerant)
        const pols = an.policies('ground', Object.fromEntries(e.req.map((a) => [a, true])), null);
        for (const p of pols) tryOne([], p.codes, p.name + ' (here)', { air: false, offWall: true, offSwim: true }, null, null);
      }
      if (!cands.length) runEdges(alts);
      edges = all.concat(alts);
      if (cands.length) break;
      // none reproducible from here: these edges are fragile from the actual state — drop them and re-plan
      if (!edges.length) break;
      for (const o2 of edges) { o2.bad = true; fragile.push(o2.desc); }
    }
    if (!cands || !cands.length) {
      // last resort: every policy of the planned family, then every ground policy from the actual spot
      cands = [];
      for (const n of g0.nodes) for (const o2 of n.out) o2.bad = false;
      dist = this.distances(g0, goal, res);
      dStart = dist.has(start) ? dist.get(start) : Infinity;
      const ev = (mode) => (pre, codes) => {
        const r = this.simulate(e, room, A, pre.concat(Array.from(codes)), { pre: pre.length, air: mode.air, offWall: mode.offWall, offSwim: mode.offSwim, touchRect });
        let score = Infinity;
        if (this.isGoal(r, goal, e)) score = -1;
        else if (r.kind === 'ground' || r.kind === 'wall' || r.kind === 'swim') { const n = this.nodeOf(g0, r); score = n && dist.has(n) ? dist.get(n) : Infinity; }
        return { r, score };
      };
      const fams = [[first.job.kind, first.job.extra, first.job.mode]];
      if (start.kind === 'ground') fams.push(['ground', null, { air: false, offWall: true, offSwim: true }]);
      for (const [kind, extra, mode] of fams) {
        const pols = an.policies(kind, Object.fromEntries(e.req.map((a) => [a, true])), extra);
        const f = ev(mode);
        for (const p of pols) { const c = f([], p.codes); if (c.score < dStart) { c.pre = []; c.codes = p.codes; c.label = p.name + ' (any)'; c.ev = f; cands.push(c); } }
        if (cands.length) break;
      }
    }
    if (!cands.length) return { type: 'fail', reason: 'no macro from the actual state reproduces "' + first.desc + '" or another improving edge (dStart ' + dStart + ')', fragile };
    cands.sort((a, b) => a.score - b.score || (a.label === 'planned' ? 0 : 1) - (b.label === 'planned' ? 0 : 1) || a.pre.length - b.pre.length);
    // prefer a tolerant take-off among the best-scoring candidates
    let best = cands[0];
    const wantMargin = o.margin !== false;
    if (wantMargin) {
      const top = cands.filter((c) => c.score === cands[0].score).slice(0, 8);
      let bm = null;
      for (const c of top) {
        c.margin = c.margin || this.margin(e, room, A, c, c.ev);
        if (!bm || c.margin.px > bm.margin.px) bm = c;
        if (c.margin.px >= 24) break;
      }
      best = bm;
      if (best.margin.px < 8) {
        // every best-scoring macro is a precision move: accept one more macro for a tolerant one (a human would)
        // (score -1 = reaches the goal now, 1 = lands one macro from it: +2 is "one more macro")
        const more = cands.filter((c) => c.score > cands[0].score && c.score <= cands[0].score + 2).slice(0, 8);
        for (const c of more) {
          c.margin = c.margin || this.margin(e, room, A, c, c.ev);
          if (c.margin.px >= 8 && c.margin.px > best.margin.px) { best = c; break; }
        }
      }
      if (best.margin.px < 8) {
        // or a tolerant move to a node from which the goal is a plain walk (walk out / stand on it)
        const walkable = (n) => n && ((goal.exit && n.out.some((x) => x.exit === goal.exit)) || (goal.ti != null && n.stands && n.stands.includes(goal.ti)));
        for (const c of sideways.filter((c2) => walkable(c2.r.node)).slice(0, 8)) {
          c.margin = c.margin || this.margin(e, room, A, c, c.ev);
          if (c.margin.px >= 8 && c.margin.px > best.margin.px) { best = c; best.detour = true; break; }
        }
      }
    }
    const seq = best.pre.concat(Array.from(best.codes).slice(0, best.r.f - best.pre.length));
    const label = best.label === 'planned' ? first.desc : best.label.startsWith('edge:') ? best.label.slice(5) : first.desc + ' [alt: ' + best.label + ']';
    return { type: 'seq', codes: seq, pre: best.pre.length, desc: label,
      expect: { kind: best.r.kind, exit: best.r.exit, x: best.r.s.x, y: best.r.s.y, f: best.r.f }, score: best.score, dStart, margin: best.margin || null,
      cands: cands.length, fragile };
  }

  // positional tolerance of the chosen move: shift the start x by ±dx px and check the outcome stays as good
  margin(e, room, A, best, evalCand) {
    // (a wall cling is shifted along the wall, i.e. in y; anything else in x)
    const key = A.wall && !A.onGround ? 'y' : 'x';
    const ok = (dx) => {
      const S = Object.assign({}, A, { [key]: A[key] + dx });
      if (this.G.Physics.rectSolid(room, S.x, S.y, S.w, S.h)) return 'wall';   // cannot stand there: not a precision limit
      const save = A[key];
      A[key] = S[key];
      const c = evalCand(best.pre, best.codes);
      A[key] = save;
      return c.score <= best.score;
    };
    // window = the contiguous start interval (±16 px scanned) in which the macro still works; a side bounded by a
    // wall counts as open. px = the window width a player must hit (32 = at least as wide as scanned).
    let lo = 0, hi = 0, wl = false, wh = false;
    for (let d = 1; d <= 16; d++) { const r = ok(-d); if (r === 'wall') { wl = true; break; } if (!r) break; lo = -d; }
    for (let d = 1; d <= 16; d++) { const r = ok(d); if (r === 'wall') { wh = true; break; } if (!r) break; hi = d; }
    const width = (wl ? 16 : -lo) + (wh ? 16 : hi);
    return { lo: wl ? 'wall' : lo, hi: wh ? 'wall' : hi, px: width, axis: key };
  }
}

module.exports = { Nav, TILE, codes: { B_L, B_R, B_DN, B_JH, B_DP, B_PL } };
