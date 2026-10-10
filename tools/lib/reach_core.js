// tools/lib/reach_core.js — physics-based reachability inside one room, driven by the REAL player motor
// (G.PlayerMotor + G.Physics loaded in Node). Used by tools/reach.js; see docs/api/tools.md.
//
// Model
//   Stable states (graph nodes):
//     ground  — a walkable floor segment {y, x0..x1} (found by walking the motor both ways; walking is free)
//     wall    — a wall cling on a face {dir, x} starting at yStart, sliding down to yBottom
//     swim    — a floating segment on a meltwater surface (oilcloak) {y, x0..x1}
//     air     — an airborne start state (room entries, falling off the bottom of a wall, post-break states)
//   Macro-actions (policies): input programs (frame → buttons) — jumps with several hold durations ×
//   horizontal intents incl. mid-air reversal, mid-air dash / double jump at several timings, combos,
//   walk-offs with coyote jumps, drop-throughs, ground dashes, plunges, wall-jump chains, swim jumps.
//   All policies of one start state are simulated together as a prefix-sharing trie (identical input
//   prefixes are simulated once) at 60 Hz until the next stable state, an exit, a hazard (= failure)
//   or a timeout.
//   Worlds: breakable ('B') and dive ('D') components form a lattice of room variants. B breaks from a
//   ground segment within Brand reach; D breaks only when a plunge lands on it. Closed gates are solid
//   unless the requirement tokens satisfy their `opens` condition (sealdoor: seals>=3; arena gates open).
//   A variant re-uses the intact world's simulations whose swept boxes never came near a changed tile.
//   Canonicalisation keeps the graph small: wall clings merge per face (pessimistic by <= WALL_TOL px), swim
//   states snap to the motor's float height, ground segments are found by walking.
//   Parallelism: closureGen() is a level-synchronous BFS; closureAsync() lets a driver run each frontier's
//   simulations (jobsFor) on worker threads first (tools/reach.js 'sim' workers) — results are identical.
//   Search-only fast paths (installFastPaths, makeCloner) touch only the tool's own vm instance of G.
'use strict';
const { evalWithTokens } = require('./conditions');
const PlanLib = require('./plan');

const TILE = 40;
const MAXF = 300;                 // max frames per macro (5 s)
const SAMPLE_DX = 100;             // interior ground sample spacing (px)
const SWIM_DX = 120;              // swim sample spacing (px)
const SWIM_TOL = 12;              // swim segment ends vary with the entry phase (climb-out point)
const WALL_DY = 32;               // wall sample spacing (px)
const WALL_MAX_SAMPLES = 28;
const WALL_TOL = 12;               // a cling this close below a known cling top is merged into that node (pessimistic by <= 12 px)
const ENTRY_FALL_VY = 450;        // falling speed when entering through a top opening (walked off a hole above)
const MAX_WORLDS = 32;
// Margin mode (tools/reach.js --margin): ground jumps/dashes never start closer than EDGE_INSET px to a ledge's drop-off
// edge (a human cannot stand on the exact last pixel of a ledge; walls are fine: the player can press into them).
let EDGE_INSET = 0;
function setEdgeInset(px) { EDGE_INSET = Math.max(0, +px || 0); }
const MAX_TOUCH = 30;

// input code bits
const B_L = 1, B_R = 2, B_DN = 4, B_JH = 8, B_JP = 16, B_DP = 32, B_PL = 64;
const NOIN = { left: false, right: false, up: false, down: false, jump: false, jumpPressed: false, dashPressed: false };
const INPUTS = [];
for (let c = 0; c < 128; c++) {
  INPUTS[c] = Object.freeze({ left: !!(c & B_L), right: !!(c & B_R), up: false, down: !!(c & B_DN), jump: !!(c & B_JH),
    jumpPressed: !!(c & B_JP), dashPressed: !!(c & B_DP) });
}

// Fast motor-state clone for the search (G.PlayerMotor.clone uses Object.assign, ~70x slower). Generated from
// the field list of PlayerMotor.create(); `events` starts empty (the motor clears it every step anyway).
function makeCloner(M, extraKeys) {
  const keys = Array.from(new Set(Object.keys(M.create(0, 0)).concat(extraKeys || [])));
  const body = 'return {' + keys.map((k) => (k === 'events' ? 'events: []' : k === 'lastSafe'
    ? 'lastSafe: s.lastSafe ? { x: s.lastSafe.x, y: s.lastSafe.y } : null' : JSON.stringify(k) + ': s[' + JSON.stringify(k) + ']')).join(', ') + '};';
  const fn = new Function('s', body); // eslint-disable-line no-new-func
  fn.keyCount = keys.length;
  fn.keys = keys;
  return fn;
}

// Search-only fast path, installed into the TOOL's own vm instance of G (never the game): the motor queries
// G.Physics.liquidDepth twice per step, which scans tiles even in rooms without that liquid. A body farther
// than one tile from the bounding box of all tiles of that liquid code provably gets {depth: 0, surface: null}
// from the original, so it is answered directly; everything else goes to the original function.
function installFastPaths(G) {
  const P = G.Physics;
  if (!P || P.__reachFast || typeof P.liquidDepth !== 'function') return;
  const orig = P.liquidDepth;
  const TILE_PX = G.CONST.TILE;
  const boxes = new WeakMap();
  const bbox = (room, code) => {
    let m = boxes.get(room);
    if (!m) { m = {}; boxes.set(room, m); }
    if (m[code] !== undefined) return m[code];
    let c0 = Infinity, r0 = Infinity, c1 = -Infinity, r1 = -Infinity;
    const t = room.tiles, cols = room.cols;
    for (let i = 0; i < t.length; i++) {
      if (t[i] !== code) continue;
      const c = i % cols, r = (i - c) / cols;
      if (c < c0) c0 = c; if (c > c1) c1 = c; if (r < r0) r0 = r; if (r > r1) r1 = r;
    }
    m[code] = c1 < 0 ? null : { x0: (c0 - 1) * TILE_PX, y0: (r0 - 1) * TILE_PX, x1: (c1 + 2) * TILE_PX, y1: (r1 + 2) * TILE_PX };
    return m[code];
  };
  P.liquidDepth = function (room, body, code) {
    if (room && room.tiles && room.cols && body) {
      const b = bbox(room, code);
      if (!b || body.x + body.w < b.x0 || body.x > b.x1 || body.y + body.h < b.y0 || body.y > b.y1) return { depth: 0, surface: null };
    }
    return orig.call(this, room, body, code);
  };
  Object.defineProperty(P, '__reachFast', { value: true });
}

// ------------------------------------------------------------------------------------------------ policies
const dirBits = (d) => (d < 0 ? B_L : d > 0 ? B_R : 0);
const dirName = (d) => (d < 0 ? 'L' : d > 0 ? 'R' : '0');

// spec: {dirs:[[f,d],...], jumps:[[f,hold],...], dash:f, plunge:f, down:[f0,f1]}
function makePolicy(name, spec) {
  const codes = new Uint8Array(MAXF);
  const dirs = (spec.dirs || [[0, 0]]).slice().sort((a, b) => a[0] - b[0]);
  let d = 0, di = 0;
  for (let f = 0; f < MAXF; f++) {
    while (di < dirs.length && dirs[di][0] <= f) d = dirs[di++][1];
    let c = dirBits(d);
    for (const [s, h] of spec.jumps || []) {
      if (f === s) c |= B_JP | B_JH;
      else if (f > s && f < s + h) c |= B_JH;
    }
    if (spec.dash === f) c |= B_DP;
    if (spec.plunge === f) c |= B_PL;
    if (spec.down && f >= spec.down[0] && f < spec.down[1]) c |= B_DN;
    codes[f] = c;
  }
  return { name, codes };
}
const H = (h) => (h >= 999 ? 'full' : h + 'f');

function dirPatterns(ks) {
  const out = [];
  for (const d of [-1, 0, 1]) out.push({ dirs: [[0, d]], n: dirName(d) });
  for (const k of ks) for (const a of [-1, 0, 1]) for (const b of [-1, 0, 1]) {
    if (a !== b) out.push({ dirs: [[0, a], [k, b]], n: dirName(a) + '>' + dirName(b) + '@' + k });
  }
  return out;
}

// Families of policies per start kind and ability set. Returned arrays are cached per key by the analyzer.
// The variant lists were trimmed empirically (tools/README.md "reach internals"): variants that never produced a
// node no other variant reached, over the dev + fixture rooms with every ability, were dropped (e.g. ending a
// double jump / dash with "no input", wall-jumps that release toward nothing).
function buildPolicies(kind, ab, extra) {
  const P = [];
  const add = (name, spec) => P.push(makePolicy(name, spec));
  const dash = !!ab.dash, wings = !!ab.wings, plunge = !!ab.plunge;
  if (kind === 'ground' || kind === 'swim') {
    const holds = kind === 'swim' ? [999, 5] : [999, 10, 5, 1];
    const pats = dirPatterns(kind === 'swim' ? [8, 20] : [6, 14, 24, 36]);
    for (const h of holds) for (const p of pats) add('jump(' + H(h) + ') ' + p.n, { dirs: p.dirs, jumps: [[0, h]] });
    if (dash) {
      for (const h of [999, 5]) for (const te of [4, 10, 16, 22, 30, 40]) for (const D of [-1, 1]) for (const pre of [D, 0]) for (const after of [D, 0]) {
        if (pre === 0 && after === 0) continue;
        add('jump(' + H(h) + ') ' + dirName(pre) + ' dash' + dirName(D) + '@' + te + ' then ' + dirName(after),
          { dirs: [[0, pre], [te, D], [te + 11, after]], jumps: [[0, h]], dash: te });
      }
      // ground / surface dash, optionally followed by a double jump
      for (const D of [-1, 1]) for (const after of [D, -D]) {
        add('dash' + dirName(D) + ' then ' + dirName(after), { dirs: [[0, D], [11, after]], dash: 0 });
        if (wings) for (const te of [14, 24, 34]) add('dash' + dirName(D) + ' dj@' + te + ' ' + dirName(after), { dirs: [[0, D], [11, after]], dash: 0, jumps: [[te, 999]] });
      }
    }
    if (wings) {
      for (const h of [999, 5]) for (const d0 of [-1, 0, 1]) for (const te of [6, 12, 18, 24, 32, 42, 54]) for (const djh of (te === 12 || te === 24 ? [999, 6] : [999])) for (const after of [-1, 1]) {
        add('jump(' + H(h) + ') ' + dirName(d0) + ' dj(' + H(djh) + ')@' + te + ' ' + dirName(after),
          { dirs: [[0, d0], [te, after]], jumps: [[0, Math.min(h, te - 1)], [te, djh]] });
      }
    }
    if (dash && wings) {
      for (const D of [-1, 1]) {
        for (const [t1, t2] of [[10, 22], [20, 32], [30, 42], [40, 52]]) {
          add('jump ' + dirName(D) + ' dash@' + t1 + ' dj@' + t2 + ' ' + dirName(D), { dirs: [[0, D]], jumps: [[0, t1 - 1], [t2, 999]], dash: t1 });
        }
        for (const after of [D, 0]) for (const [t1, t2] of [[8, 16], [18, 26], [28, 36], [40, 48]]) {
          add('jump ' + dirName(D) + ' dj@' + t1 + ' dash@' + t2 + ' ' + dirName(after), { dirs: [[0, D], [t2 + 11, after]], jumps: [[0, t1 - 1], [t1, t2 - 1]], dash: t2 });
        }
      }
    }
    if (plunge && kind === 'ground') {
      for (const h of [999, 5, 1]) for (const d0 of [-1, 0, 1]) for (const te of [3, 8, 16, 26, 38]) {
        add('jump(' + H(h) + ') ' + dirName(d0) + ' plunge@' + te, { dirs: [[0, d0]], jumps: [[0, h]], plunge: te });
      }
    }
  } else if (kind === 'walkoff') {
    const D = extra.dir;
    add('walk-off ' + dirName(D), { dirs: [[0, D]] });
    for (const k of [4, 10, 20]) for (const b of [0, -D]) add('walk-off ' + dirName(D) + ' then ' + dirName(b) + '@' + k, { dirs: [[0, D], [k, b]] });
    for (const h of [999, 5]) {
      add('walk-off coyote-jump(' + H(h) + ') ' + dirName(D), { dirs: [[0, D]], jumps: [[2, h]] });
      add('walk-off coyote-jump(' + H(h) + ') ' + dirName(D) + '>0@12', { dirs: [[0, D], [12, 0]], jumps: [[2, h]] });
    }
    if (dash) {
      for (const te of [2, 8, 16, 26]) for (const after of [D, 0]) add('walk-off dash' + dirName(D) + '@' + te + ' ' + dirName(after), { dirs: [[0, D], [te + 11, after]], dash: te });
      for (const te of [8, 16]) add('walk-off dash' + dirName(-D) + '@' + te, { dirs: [[0, D], [te, -D]], dash: te });
      for (const te of [14, 24, 34]) add('walk-off coyote-jump dash@' + te, { dirs: [[0, D]], jumps: [[2, te - 1]], dash: te });
    }
    if (wings) {
      for (const te of [4, 10, 18, 28]) for (const after of [D, -D]) add('walk-off dj@' + te + ' ' + dirName(after), { dirs: [[0, D], [te, after]], jumps: [[te, 999]] });
      for (const te of [20, 34]) for (const after of [D, 0]) add('walk-off coyote-jump dj@' + te + ' ' + dirName(after), { dirs: [[0, D], [te, after]], jumps: [[2, te - 3], [te, 999]] });
    }
    if (dash && wings) {
      add('walk-off dash@4 dj@16', { dirs: [[0, D]], dash: 4, jumps: [[16, 999]] });
      add('walk-off coyote-jump dash@20 dj@32', { dirs: [[0, D]], jumps: [[2, 17], [32, 999]], dash: 20 });
    }
    if (plunge) for (const te of [2, 10]) add('walk-off plunge@' + te, { dirs: [[0, D]], plunge: te });
  } else if (kind === 'drop') {
    for (const p of dirPatterns([10, 20])) add('drop-through ' + p.n, { dirs: p.dirs, jumps: [[0, 2]], down: [0, 3] });
    if (dash) for (const D of [-1, 1]) for (const te of [8, 16]) add('drop-through dash' + dirName(D) + '@' + te, { dirs: [[0, D]], jumps: [[0, 2]], down: [0, 3], dash: te });
    if (wings) for (const d of [-1, 0, 1]) for (const te of [8, 18]) add('drop-through dj@' + te + ' ' + dirName(d), { dirs: [[0, d]], jumps: [[0, 2], [te, 999]], down: [0, 3] });
    if (plunge) add('drop-through plunge@6', { jumps: [[0, 2]], down: [0, 3], plunge: 6 });
  } else if (kind === 'air') {
    for (const p of dirPatterns([10, 24])) add('air ' + p.n, { dirs: p.dirs });
    if (dash) for (const te of [0, 6, 14, 24, 36]) for (const D of [-1, 1]) for (const after of [D, 0]) {
      add('air ' + dirName(D) + ' dash@' + te + ' ' + dirName(after), { dirs: [[0, D], [te + 11, after]], dash: te });
    }
    if (wings) for (const te of [0, 6, 14, 24, 36]) for (const djh of [999, 6]) for (const pre of [-1, 0, 1]) for (const after of [-1, 1]) {
      add('air ' + dirName(pre) + ' dj(' + H(djh) + ')@' + te + ' ' + dirName(after), { dirs: [[0, pre], [te, after]], jumps: [[te, djh]] });
    }
    if (dash && wings) for (const D of [-1, 1]) for (const [a, b] of [[0, 12], [12, 24], [24, 36]]) {
      add('air ' + dirName(D) + ' dash@' + a + ' dj@' + b, { dirs: [[0, D]], dash: a, jumps: [[b, 999]] });
      add('air ' + dirName(D) + ' dj@' + a + ' dash@' + (a + 8), { dirs: [[0, D]], jumps: [[a, 7]], dash: a + 8 });
    }
    if (plunge) for (const d of [-1, 0, 1]) for (const te of [0, 10, 25]) add('air ' + dirName(d) + ' plunge@' + te, { dirs: [[0, d]], plunge: te });
  } else if (kind === 'wall') {
    const W = extra.dir, A = -W; // wall side, away
    const pats = [{ dirs: [[0, A]], n: 'away' }];
    for (const k of [9, 14, 20, 28]) {
      pats.push({ dirs: [[0, A], [k, W]], n: 'away>toward@' + k });
      pats.push({ dirs: [[0, 0], [k, W]], n: 'none>toward@' + k });
    }
    for (const h of [999, 10, 5]) for (const p of pats) add('walljump(' + H(h) + ') ' + p.n, { dirs: p.dirs, jumps: [[0, h]] });
    if (wings) for (const te of [10, 18, 28]) for (const after of [A, W]) {
      add('walljump dj@' + te + ' ' + dirName(after), { dirs: [[0, A], [te, after]], jumps: [[0, te - 1], [te, 999]] });
    }
    if (dash) for (const te of [9, 16, 24]) for (const D of [-1, 1]) {
      add('walljump dash' + dirName(D) + '@' + te, { dirs: [[0, A], [te, D]], jumps: [[0, 999]], dash: te });
    }
    add('let go', { dirs: [[0, A]] });
    if (dash) add('wall dash ' + dirName(A), { dirs: [[0, A]], dash: 0 });
    if (wings) for (const te of [4, 12]) for (const after of [A, W]) add('let go dj@' + te + ' ' + dirName(after), { dirs: [[0, A], [te, after]], jumps: [[te, 999]] });
    if (plunge) add('let go plunge@3', { dirs: [[0, A]], plunge: 3 });
  }
  return P;
}

// ------------------------------------------------------------------------------------------------ analyzer
class RoomAnalyzer {
  // G: vm-context G; def: room definition; opts: {spots:[{id, ...parsed}], radius:{}}
  constructor(G, def, opts) {
    this.G = G;
    this.def = def;
    this.opts = opts || {};
    installFastPaths(G);
    this.M = G.PlayerMotor;
    this.clone = makeCloner(this.M);
    this.keyChecks = 0;
    this.Ph = G.Physics;
    this.T = G.T;
    this.C = this.M.C;
    this.base = G.World.createRoom(def, { tileOnly: true, flags: {} });
    this.cols = this.base.cols; this.rows = this.base.rows;
    this.W = this.base.widthPx; this.H = this.base.heightPx;
    this.pw = G.CONST.PLAYER_W; this.ph = G.CONST.PLAYER_H;
    this.exits = PlanLib.nameOpenings(this.base.openings);
    this.specs = G.World.entitySpecsOf(def) || [];
    this.comps = this.base.components.map((c) => ({ id: c.id, code: c.code, tiles: c.tiles, c0: c.c0, r0: c.r0, c1: c.c1, r1: c.r1 }));
    this.compIndex = this.base.compIndex;
    this.hasDive = this.comps.some((c) => c.code === G.T.DIVEFLOOR);
    this.gates = this._gates();
    this.targets = [];
    this.graphs = new Map();
    this.policyCache = new Map();
    this.rooms = new Map();
    this.stats = { steps: 0, macros: 0, nodes: 0, reused: 0 };
  }

  // ---- gates (closed gates are solid unless the tokens satisfy their condition)
  _gates() {
    const out = [];
    for (const s of this.specs) {
      const p = s.props;
      if (p.type !== 'gate' && p.type !== 'sealdoor') continue;
      // geometry mirrors src/entities/interactables.js: Gate = bottom-LEFT anchored at the marker tile
      // (w x h tiles, default 1x4; 'w4 h1' = horizontal grate); SealDoor = default Entity anchoring
      // (centered on the marker column, feet on the tile bottom), min 2x3, default 3x5. Both are noGrip.
      const isDoor = p.type === 'sealdoor';
      const wT = isDoor ? Math.max(2, +p.w || 3) : Math.max(1, +p.w || 1);
      const hT = isDoor ? Math.max(3, +p.h || 5) : Math.max(1, +p.h || 4);
      const w = wT * TILE, h = hT * TILE;
      const x = isDoor ? (s.tx + 0.5) * TILE - w / 2 : s.tx * TILE;
      const rect = this.opts.gateRect ? this.opts.gateRect(s) : { x, y: (s.ty + 1) * TILE - h, w, h };
      out.push({ id: p.id || p.type, type: p.type, cond: p.type === 'sealdoor' ? 'seals>=3' : (p.opens && String(p.opens).trim() ? p.opens : 'false'), rect, tx: s.tx, ty: s.ty });
    }
    return out;
  }
  gateKey(tokens) {
    return this.gates.map((g) => (evalWithTokens(g.cond, tokens) ? 'o' : 'c')).join('') || '-';
  }

  roomFor(worldKey, gateKey) {
    const k = worldKey + '|' + gateKey;
    let r = this.rooms.get(k);
    if (r) return r;
    const flags = {};
    if (worldKey) for (const id of worldKey.split(';')) flags['broken:' + id] = true;
    r = this.G.World.createRoom(this.def, { tileOnly: true, flags });
    r.solids = [];
    this.gates.forEach((g, i) => {
      if (gateKey[i] === 'c') r.solids.push({ x: g.rect.x, y: g.rect.y, w: g.rect.w, h: g.rect.h, owner: null, noGrip: true, oneWay: false, gate: g.id });
    });
    this.rooms.set(k, r);
    return r;
  }

  // ---- touch / stand targets (spots)
  // spot: {id, type, ...} from plan.parseSpotId / entity specs. Returns index.
  addTarget(spotId, radiusTiles) {
    const ex = this.targets.findIndex((t) => t.id === spotId);
    if (ex >= 0) return ex;
    const sp = PlanLib.parseSpotId(spotId);
    const t = { id: spotId, ok: true, kind: 'touch', rect: null, stand: null, reason: null };
    const spec = sp.type === 'tile' ? { tx: sp.tx, ty: sp.ty, props: { type: 'tile' } } : this.specs.find((s) => PlanLib.entityMatches(sp, s.props));
    if (!spec) { t.ok = false; t.reason = 'no matching entity in the room'; this.targets.push(t); return this.targets.length - 1; }
    t.tx = spec.tx; t.ty = spec.ty;
    const type = spec.props.type;
    const isGlimpse = type === 'npc' && spec.props.npc === 'sable' && (+spec.props.stage || 1) === 1;
    const r = radiusTiles != null ? radiusTiles : isGlimpse ? 10 : (type === 'lever' || type === 'geode' || type === 'sealdoor') ? 2 : 1;
    if (type === 'arena' && Array.isArray(spec.props.trigger) && spec.props.trigger.length === 4) {
      const [c1, r1, c2, r2] = spec.props.trigger.map(Number);
      t.rect = { x: Math.min(c1, c2) * TILE, y: Math.min(r1, r2) * TILE, w: (Math.abs(c2 - c1) + 1) * TILE, h: (Math.abs(r2 - r1) + 1) * TILE };
    } else if (!isGlimpse && ['sconce', 'lore', 'npc', 'lanternway', 'shrine', 'tile', 'start'].includes(type)) {
      t.kind = 'stand';
      t.stand = { feetY0: (spec.ty + 1) * TILE - r * TILE, feetY1: (spec.ty + 1) * TILE + (type === 'tile' ? 0.5 : r * TILE),
        cx0: spec.tx * TILE - r * TILE, cx1: (spec.tx + 1) * TILE + r * TILE };
      if (type === 'tile') t.stand.feetY0 = (spec.ty + 1) * TILE - 0.5;
    } else {
      t.rect = { x: (spec.tx - r) * TILE, y: (spec.ty - r) * TILE, w: (2 * r + 1) * TILE, h: (2 * r + 1) * TILE };
    }
    if (this.targets.length >= MAX_TOUCH) { t.ok = false; t.reason = 'too many spots in one room (max ' + MAX_TOUCH + ')'; }
    this.targets.push(t);
    return this.targets.length - 1;
  }

  // ---- entry states per exit id (room entered through that opening)
  entryStates(exitId) {
    const e = this.exits.find((x) => x.id === exitId);
    if (!e) return [];
    const M = this.M, w = this.pw, h = this.ph;
    const out = [];
    if (e.side === 'W' || e.side === 'E') {
      const x = e.side === 'W' ? 2 : this.W - w - 2;
      const s = M.create(x, (e.pos + e.size) * TILE - h - 0.5);
      s.facing = e.side === 'W' ? 1 : -1;
      out.push({ s, label: exitId + ' (walk in)' });
    } else {
      const xs = [];
      const lo = e.pos * TILE + 2, hi = (e.pos + e.size) * TILE - w - 2;
      if (hi <= lo) xs.push((e.pos + e.size / 2) * TILE - w / 2);
      else xs.push(lo, (lo + hi) / 2, hi);
      for (const x of xs) {
        if (e.side === 'N') {
          const s = M.create(x, 2);
          s.vy = ENTRY_FALL_VY;
          out.push({ s, label: exitId + ' (fall in @x=' + Math.round(x) + ')' });
        } else {
          const s = M.create(x, this.H - h - 2);
          M.exitUpBoost(s);
          out.push({ s, label: exitId + ' (rise in @x=' + Math.round(x) + ')' });
        }
      }
    }
    return out;
  }

  exitAt(cx, cy) {
    let side, coord;
    if (cx < 0) { side = 'W'; coord = Math.floor(cy / TILE); }
    else if (cx >= this.W) { side = 'E'; coord = Math.floor(cy / TILE); }
    else if (cy < 0) { side = 'N'; coord = Math.floor(cx / TILE); }
    else { side = 'S'; coord = Math.floor(cx / TILE); }
    let best = null, bd = 1e9;
    for (const e of this.exits) {
      if (e.side !== side) continue;
      const d = coord < e.pos ? e.pos - coord : coord >= e.pos + e.size ? coord - (e.pos + e.size - 1) : 0;
      if (d < bd) { bd = d; best = e; }
    }
    return best ? best.id : side + '?';
  }

  policies(kind, abIn, extra) {
    // plunge policies only matter where a plunge can do something a fall cannot: break a D floor
    const ab = abIn.plunge && !this.hasDive ? Object.assign({}, abIn, { plunge: false }) : abIn;
    const k = kind + '|' + (ab.dash ? 'd' : '') + (ab.wings ? 'w' : '') + (ab.plunge ? 'p' : '') + '|' + (extra ? JSON.stringify(extra) : '');
    let p = this.policyCache.get(k);
    if (!p) { p = buildPolicies(kind, ab, extra); this.policyCache.set(k, p); }
    return p;
  }

  graph(worldKey, ab, tokens) {
    const abKey = ['dash', 'grip', 'wings', 'oilcloak', 'plunge'].filter((a) => ab[a]).join(',');
    const gk = this.gateKey(tokens);
    const key = worldKey + '|' + abKey + '|' + gk;
    let g = this.graphs.get(key);
    if (!g) {
      g = new Graph(this, this.roomFor(worldKey, gk), ab, worldKey, key);
      g.tokens = tokens;
      if (worldKey) {
        g.baseGraph = this.graph('', ab, tokens);
        const pad = 4;
        for (const id of worldKey.split(';')) {
          const c = this.comps.find((x) => x.id === id);
          if (c) g.changed.push({ x0: c.c0 * TILE - pad, y0: c.r0 * TILE - pad, x1: (c.c1 + 1) * TILE + pad, y1: (c.r1 + 1) * TILE + pad });
        }
      }
      this.graphs.set(key, g);
    }
    return g;
  }

  // ---- closure: everything reachable from start states with abilities/tokens (+ world lattice)
  // starts: [{s, label}]; returns {exits: Map(id → trace), spots: Map(targetIndex → trace), worlds, nodes:[...], graphs}
  // Level-synchronous BFS written as a generator: before each frontier is expanded it yields {g, nodes} so an
  // async driver can pre-compute the frontier's simulations in parallel (closureAsync + prefetch).
  * closureGen(starts, req) {
    const { abilities, tokens } = PlanLib.splitRequires(req);
    const worlds = new Map();
    worlds.set('', { key: '', broken: [], starts: starts.map((x) => ({ s: x.s, label: x.label, via: null })), done: false });
    const res = { exits: new Map(), spots: new Map(), worlds: [], nodes: [], graphs: [] };
    for (let guard = 0; guard < MAX_WORLDS; guard++) {
      let w = null;
      for (const cand of worlds.values()) if (!cand.done && (!w || cand.broken.length < w.broken.length)) w = cand;
      if (!w) break;
      w.done = true;
      res.worlds.push(w.key || '(intact)');
      const g = this.graph(w.key, abilities, tokens);
      res.graphs.push(g);
      const parent = new Map();
      let queue = [];
      const visit = (node, from, out, startLabel, prev) => {
        if (!node || parent.has(node)) return;
        parent.set(node, { from, out, startLabel, world: w, prev: prev || null });
        queue.push(node);
      };
      for (const st of w.starts) visit(g.nodeForState(st.s, st.label), null, st.via, st.label, st.prev);
      const trace = (node, last) => ({ world: w.key, node, last, parent, g });
      while (queue.length) {
        const frontier = queue;
        queue = [];
        if (frontier.some((n) => !n.expanded)) yield { g, nodes: frontier };
        for (const node of frontier) {
          res.nodes.push({ node, g });
          g.expand(node);
          for (const ti of node.stands) if (!res.spots.has(ti)) res.spots.set(ti, trace(node, { desc: 'stand on ' + node.label }));
          for (const o of node.out) {
            if (o.touch) for (let i = 0; i < this.targets.length; i++) if ((o.touch & (1 << i)) && !res.spots.has(i)) res.spots.set(i, trace(node, o));
            if (o.exit) { if (!res.exits.has(o.exit)) res.exits.set(o.exit, trace(node, o)); continue; }
            if (o.brk) {
              const keyParts = w.broken.concat([o.brk.comp]).sort();
              const nk = keyParts.join(';');
              if (!worlds.has(nk)) worlds.set(nk, { key: nk, broken: keyParts, starts: [], done: false });
              const nw = worlds.get(nk);
              if (!nw.done && nw.starts.length < 24) nw.starts.push({ s: o.brk.state, label: 'after breaking ' + o.brk.comp, via: o, prev: trace(node, o) });
              continue;
            }
            if (o.to) visit(o.to, node, o);
          }
        }
      }
    }
    return res;
  }

  closure(starts, req) {
    const it = this.closureGen(starts, req);
    let r = it.next();
    while (!r.done) r = it.next();
    return r.value;
  }

  // runJobs(jobs) → Promise<results[]> (one results array per job, see Graph.prefetchJobs)
  async closureAsync(starts, req, runJobs) {
    const it = this.closureGen(starts, req);
    let r = it.next();
    while (!r.done) {
      if (runJobs) await r.value.g.prefetch(r.value.nodes, runJobs);
      r = it.next();
    }
    return r.value;
  }
}

// ------------------------------------------------------------------------------------------------ graph
class Graph {
  constructor(an, room, ab, worldKey, key) {
    this.an = an; this.room = room; this.ab = ab; this.worldKey = worldKey; this.key = key;
    this.M = an.M; this.Ph = an.Ph; this.T = an.T;
    this.ctx = { room, dt: 1 / 60, abilities: ab, mods: {}, breakDive: null };
    this.nodes = [];
    this.segs = new Map();     // yKey → [ground seg]
    this.swims = new Map();
    this.walls = new Map();    // node key → wall node
    this.airs = new Map();
    this.familyCache = new Map();
    this.baseGraph = null;     // intact-world graph with the same abilities/gates (set by the analyzer)
    this.changed = [];         // inflated px rects of the tiles that differ from the intact world
    this._dive = null;
    this.ctx.breakDive = (rm, c, r) => {
      const comp = this.an.base.componentAt(c, r);
      if (comp && !this._dive) this._dive = comp.id;
      return false;
    };
  }

  newNode(n) {
    n.idx = this.nodes.length;
    n.out = [];
    n.stands = [];
    n.expanded = false;
    this.nodes.push(n);
    this.an.stats.nodes++;
    return n;
  }

  // ---- resolve an arbitrary motor state to a node
  nodeForState(s, label) {
    const M = this.M;
    if (Object.keys(s).length !== this.an.clone.keyCount) this.an.clone = makeCloner(this.M, Object.keys(s)); // motor grew a field
    const st = this.an.clone(s);
    if (st.hazard) return null;
    if (!st.plunging && !st.swimming && st.wall === 0 && st.vy === 0 && this.Ph.onGround(this.room, st)) return this.groundAt(st.x, st.y);
    const key = 'air:' + (label || '') + ':' + st.x.toFixed(2) + ',' + st.y.toFixed(2) + ',' + st.vy.toFixed(1) + ',' + (st.plunging ? 'p' : '');
    let n = this.airs.get(key);
    if (!n) {
      n = this.newNode({ kind: 'air', state: st, akey: key, label: 'airborne ' + (label || '') + ' at ' + this.tileStr(st.x + st.w / 2, st.y + st.h) });
      this.airs.set(key, n);
    }
    return n;
  }

  tileStr(px, py) { return '(' + Math.floor(px / TILE) + ',' + Math.floor(py / TILE - 0.001) + ')'; }

  canonGround(x, y) {
    const s = this.M.create(x, y);
    this.M.step(s, NOIN, this.ctx);
    this.an.stats.steps++;
    if (!s.onGround || s.hazard || Math.abs(s.y - y) > 1.01) return null;
    return s;
  }

  findSeg(map, x, y, tol) {
    const list = map.get(Math.round(y * 4));
    if (!list) return null;
    const t = tol || 0.75;
    for (const seg of list) if (x >= seg.x0 - t && x <= seg.x1 + t) return seg;
    return null;
  }

  // ground segment containing (x, y), built by walking the motor both ways
  groundAt(x, y) {
    const hit = this.findSeg(this.segs, x, y);
    if (hit) return hit;
    const s0 = this.canonGround(x, y);
    if (!s0) return null;
    const hit2 = this.findSeg(this.segs, s0.x, s0.y);
    if (hit2) return hit2;
    y = s0.y;
    const ends = {};
    for (const dir of [-1, 1]) ends[dir] = this.walk(s0, dir);
    const seg = this.newNode({ kind: 'ground', y, x0: ends[-1].x, x1: ends[1].x, ends });
    seg.label = 'floor ' + this.tileStr(seg.x0 + this.an.pw / 2, y + this.an.ph) + '..' + Math.floor((seg.x1 + this.an.pw / 2) / TILE);
    const k = Math.round(y * 4);
    if (!this.segs.has(k)) this.segs.set(k, []);
    this.segs.get(k).push(seg);
    // stand targets
    this.an.targets.forEach((t, i) => {
      if (!t.ok || t.kind !== 'stand') return;
      const feet = y + this.an.ph;
      if (feet < t.stand.feetY0 || feet > t.stand.feetY1) return;
      const c0 = seg.x0 + this.an.pw / 2, c1 = seg.x1 + this.an.pw / 2;
      if (c1 >= t.stand.cx0 && c0 <= t.stand.cx1) seg.stands.push(i);
    });
    return seg;
  }

  // walk from a canonical ground state; → {x (last grounded x), reason:'wall'|'edge'|'hazard'|'exit', exit?}
  walk(s0, dir) {
    const M = this.M, s = this.an.clone(s0);
    const inp = INPUTS[dirBits(dir)];
    let lastX = s.x;
    const maxF = Math.ceil(this.an.W / 5) + 20;
    for (let f = 0; f < maxF; f++) {
      M.step(s, inp, this.ctx);
      this.an.stats.steps++;
      const cx = s.x + s.w / 2, cy = s.y + s.h / 2;
      if (cx < 0 || cx >= this.an.W || cy < 0 || cy >= this.an.H) return { x: lastX, reason: 'exit', exit: this.an.exitAt(cx, cy) };
      if (s.hazard) return { x: lastX, reason: 'hazard' };
      if (!s.onGround) return { x: this.refineEdge(lastX, s0.y, dir), reason: 'edge' };
      if (Math.abs(s.x - lastX) < 0.01) return { x: lastX, reason: 'wall' };
      lastX = s.x;
    }
    return { x: lastX, reason: 'wall' };
  }

  refineEdge(x, y, dir) {
    let good = x, bad = x + dir * 6;
    for (let i = 0; i < 18; i++) {
      const mid = (good + bad) / 2;
      if (this.canonGround(mid, y)) good = mid; else bad = mid;
    }
    return good;
  }

  swimAt(state) {
    const M = this.M, s = this.an.clone(state);
    const floatY = () => s.surfaceY - (1 - this.an.C.FLOAT_SUBMERGED) * s.h;
    for (let f = 0; f < 150; f++) {
      if (s.swimming && Math.abs(s.vy) < 2 && Math.abs(s.y - floatY()) < 1 && f > 4) break;
      M.step(s, NOIN, this.ctx);
      this.an.stats.steps++;
      if (s.hazard) return null;
      if (!s.swimming && s.onGround) return this.groundAt(s.x, s.y);
    }
    if (!s.swimming) return null;
    // canonical floating state: exactly at the motor's float target (it approaches it exponentially)
    s.vx = 0; s.vy = 0;
    const fy = floatY();
    if (Math.abs(fy - s.y) < 6 && !this.Ph.rectSolid(this.room, s.x, fy, s.w, s.h)) s.y = fy;
    const hit = this.findSeg(this.swims, s.x, s.y, SWIM_TOL);
    if (hit) return hit;
    const ends = {};
    for (const dir of [-1, 1]) {
      const t = this.an.clone(s);
      const inp = INPUTS[dirBits(dir)];
      let lastX = t.x, still = 0;
      ends[dir] = { x: lastX, reason: 'wall' };
      for (let f = 0; f < Math.ceil(this.an.W / 3) + 20; f++) {
        M.step(t, inp, this.ctx);
        this.an.stats.steps++;
        const cx = t.x + t.w / 2, cy = t.y + t.h / 2;
        if (cx < 0 || cx >= this.an.W || cy < 0 || cy >= this.an.H) { ends[dir] = { x: lastX, reason: 'exit', exit: this.an.exitAt(cx, cy) }; break; }
        if (t.hazard) { ends[dir] = { x: lastX, reason: 'hazard' }; break; }
        if (!t.swimming) { ends[dir] = { x: lastX, reason: 'out', state: this.an.clone(t) }; break; }
        if (Math.abs(t.x - lastX) < 0.01) { if (++still > 2) { ends[dir] = { x: lastX, reason: 'wall' }; break; } } else still = 0;
        lastX = t.x;
      }
    }
    const seg = this.newNode({ kind: 'swim', y: s.y, x0: ends[-1].x, x1: ends[1].x, ends, state: s });
    seg.label = 'swimming ' + this.tileStr(seg.x0 + this.an.pw / 2, s.y + this.an.ph * 0.6) + '..' + Math.floor((seg.x1 + this.an.pw / 2) / TILE);
    const k = Math.round(s.y * 4);
    if (!this.swims.has(k)) this.swims.set(k, []);
    this.swims.get(k).push(seg);
    return seg;
  }

  makeCling(x, y, dir) {
    const s = this.M.create(x, y);
    s.wall = dir; s.facing = -dir; s.vy = this.an.C.WALL_SLIDE; s.onGround = false; s.airTime = 0.2; s.fallStartY = y;
    return s;
  }

  // Wall faces are canonicalized with dominance: clinging higher on the same face (same dir & x) and then sliding
  // covers every lower cling point, so a cling at y maps to an existing node whose top lies within WALL_TOL px below
  // it (y <= yTop <= y + WALL_TOL); any other cling height creates its own node (its samples: its top, then the
  // shared global grid).
  wallAt(state) {
    const dir = state.wall, y = state.y;
    // grip contact tolerates a 2 px gap; holding toward the wall closes it, so snap flush to the face
    let x = state.x;
    const fx = dir < 0 ? Math.round(x / TILE) * TILE : Math.round((x + this.an.pw) / TILE) * TILE - this.an.pw;
    if (Math.abs(fx - x) <= 2.5 && !this.Ph.rectSolid(this.room, fx, y, this.an.pw, this.an.ph)) x = fx;
    const fk = dir + ':' + x.toFixed(1);
    let face = this.walls.get(fk);
    if (!face) { face = []; this.walls.set(fk, face); }
    // merge only into a node whose top is at or at most WALL_TOL px BELOW this cling (the cling slides down to it, so
    // the node can do no more than this cling: pessimistic). Merging into a HIGHER top would credit this cling with
    // the moves of a higher one (optimistic by up to the wall height — found by tools/playthrough.js in hs_01).
    for (const n of face) if (n.yTop >= y - 0.01 && n.yTop <= y + WALL_TOL && y <= n.yBot + 1) return n;
    const yq = Math.ceil((y - 0.01) / WALL_TOL) * WALL_TOL;   // see the quantization below
    for (const n of face) if (Math.abs(n.yTop - yq) < 0.01) return n;
    // slide down holding toward the wall
    const M = this.M, s = this.makeCling(x, y, dir);
    const inp = INPUTS[dirBits(dir)];
    let yb = y, end = null;
    for (let f = 0; f < 900; f++) {
      M.step(s, inp, this.ctx);
      this.an.stats.steps++;
      if (s.hazard) { end = { reason: 'hazard' }; break; }
      const cx = s.x + s.w / 2, cy = s.y + s.h / 2;
      if (cx < 0 || cx >= this.an.W || cy < 0 || cy >= this.an.H) { end = { reason: 'exit', exit: this.an.exitAt(cx, cy) }; break; }
      if (s.wall !== dir) { end = s.onGround ? { reason: 'ground', x: s.x, y: s.y } : { reason: 'fall', state: this.an.clone(s) }; break; }
      yb = s.y;
    }
    // the node's top is quantized DOWN to the WALL_TOL grid when the slide passes it (pessimistic by < WALL_TOL px),
    // so a face holds at most one node per WALL_TOL px of height
    const top = yq > y && yq <= yb ? yq : y;
    const n = this.newNode({ kind: 'wall', dir, x, yTop: top, yBot: yb, end: end || { reason: 'timeout' } });
    n.label = 'wall cling ' + (dir > 0 ? 'right' : 'left') + ' ' + this.tileStr(x + this.an.pw / 2, top + this.an.ph) + '..row ' + Math.floor((yb + this.an.ph) / TILE);
    face.push(n);
    return n;
  }

  // ---- simulate a policy set from a start state (prefix-sharing trie)
  // onResult(policyIdxList, outcome) where outcome = {kind, s?, exit?, comp?, touch, f}
  runPolicies(start, policies, mode, onResult) {
    const M = this.M, an = this.an, targets = an.targets;
    const tcount = Math.min(targets.length, MAX_TOUCH);
    const W = an.W, Hh = an.H;
    const stack = [{ s: this.an.clone(start), list: policies.map((_, i) => i), f: 0, air: mode.air, offWall: mode.offWall, offSwim: mode.offSwim, touch: 0,
      bb: [start.x, start.y, start.x + start.w, start.y + start.h] }];
    const groups = new Map();
    while (stack.length) {
      const fr = stack.pop();
      let s = fr.s, list = fr.list, f = fr.f, air = fr.air, offWall = fr.offWall, offSwim = fr.offSwim, touch = fr.touch;
      // swept bounding box of the body along this branch (world-variant reuse, see runFamily)
      let bx0 = fr.bb[0], by0 = fr.bb[1], bx1 = fr.bb[2], by1 = fr.bb[3];
      const res = (o) => {
        // safety net for the generated cloner: if the motor ever adds a state field at run time, regenerate it
        if (an.keyChecks < 400) { an.keyChecks++; if (Object.keys(s).length !== an.clone.keyCount) an.clone = makeCloner(M, Object.keys(s)); }
        o.bbox = [bx0, by0, bx1, by1];
        onResult(list, o);
      };
      for (;;) {
        if (f >= MAXF) { res({ kind: 'timeout', touch, f }); break; }
        // split by input code at frame f
        const c0 = policies[list[0]].codes[f];
        let same = true;
        for (let i = 1; i < list.length; i++) if (policies[list[i]].codes[f] !== c0) { same = false; break; }
        let code = c0;
        if (!same) {
          groups.clear();
          for (const i of list) {
            const c = policies[i].codes[f];
            let g = groups.get(c);
            if (!g) { g = []; groups.set(c, g); }
            g.push(i);
          }
          let first = true;
          for (const [c, g] of groups) {
            if (first) { first = false; code = c; list = g; continue; }
            stack.push({ s: this.an.clone(s), list: g, f, air, offWall, offSwim, touch, bb: [bx0, by0, bx1, by1] });
          }
        }
        // step
        if ((code & B_PL) && !s.onGround && !s.plunging && !s.swimming && this.ab.plunge) M.startPlunge(s);
        this._dive = null;
        M.step(s, INPUTS[code & 63], this.ctx);
        an.stats.steps++;
        f++;
        if (s.x < bx0) bx0 = s.x; if (s.y < by0) by0 = s.y;
        if (s.x + s.w > bx1) bx1 = s.x + s.w; if (s.y + s.h > by1) by1 = s.y + s.h;
        if (s.hazard) { res({ kind: 'hazard', touch, f }); break; }
        for (let i = 0; i < tcount; i++) {
          const t = targets[i];
          if (!t.rect || !t.ok) continue;
          const r = t.rect;
          if (s.x < r.x + r.w && s.x + s.w > r.x && s.y < r.y + r.h && s.y + s.h > r.y) touch |= (1 << i);
        }
        if (this._dive) {
          const st = this.an.clone(s);
          st.plunging = true; st.vy = an.C.PLUNGE_V; st.onGround = false; st.events = [];
          res({ kind: 'break', comp: this._dive, s: st, touch, f });
          break;
        }
        const cx = s.x + s.w / 2, cy = s.y + s.h / 2;
        if (cx < 0 || cx >= W || cy < 0 || cy >= Hh) { res({ kind: 'exit', exit: an.exitAt(cx, cy), touch, f }); break; }
        if (!s.onGround) air = true;
        if (s.wall === 0) offWall = true;
        if (!s.swimming) offSwim = true;
        if (s.swimming && (offSwim || (f >= 14 && s.dashTime <= 0))) { res({ kind: 'swim', s: this.an.clone(s), touch, f }); break; }
        if (s.wall !== 0 && (offWall || f >= 14)) { res({ kind: 'wall', s: this.an.clone(s), touch, f }); break; }
        if (s.onGround && !s.plunging && (air || (f >= 12 && s.dashTime <= 0))) { res({ kind: 'ground', s: this.an.clone(s), touch, f }); break; }
      }
    }
  }

  // ---- the simulations a node's expansion needs: [{key, st, kind, extra, mode, desc}] (single source of truth
  // for expand() and the parallel prefetch)
  jobsFor(node) {
    const jobs = [];
    if (node.kind === 'ground') {
      for (const smp of this.groundSamples(node)) {
        const key = 'g:' + Math.round(node.y * 4) + ':' + smp.x.toFixed(2);
        const s0 = this.canonGround(smp.x, node.y);
        if (!s0) continue;
        const mode = { air: false, offWall: true, offSwim: true };
        const desc = 'from x=' + Math.round(smp.x) + ' of ' + node.label;
        jobs.push({ key: key + '|g', st: s0, kind: 'ground', extra: null, mode, desc });
        if (smp.edgeL) jobs.push({ key: key + '|wl', st: s0, kind: 'walkoff', extra: { dir: -1 }, mode, desc });
        if (smp.edgeR) jobs.push({ key: key + '|wr', st: s0, kind: 'walkoff', extra: { dir: 1 }, mode, desc });
        const gi = this.Ph.groundInfo(this.room, s0);
        if (gi.platform && !gi.entity && gi.tiles.every((c) => c === this.T.PLATFORM)) jobs.push({ key: key + '|d', st: s0, kind: 'drop', extra: null, mode, desc });
      }
    } else if (node.kind === 'swim') {
      for (const x of this.spread(node.x0, node.x1, SWIM_DX)) {
        const st = this.an.clone(node.state); st.x = x; st.vx = 0;
        jobs.push({ key: 's:' + Math.round(node.y * 4) + ':' + x.toFixed(2), st, kind: 'swim', extra: null, mode: { air: true, offWall: true, offSwim: false }, desc: 'from x=' + Math.round(x) + ' ' + node.label });
      }
    } else if (node.kind === 'wall') {
      for (const y of this.wallSamples(node)) {
        jobs.push({ key: 'w:' + node.dir + ':' + node.x.toFixed(2) + ':' + y.toFixed(2), st: this.makeCling(node.x, y, node.dir), kind: 'wall', extra: { dir: node.dir },
          mode: { air: true, offWall: false, offSwim: true }, desc: 'from ' + node.label + ' at y=' + Math.round(y) });
      }
    } else if (node.kind === 'air') {
      jobs.push({ key: 'a:' + node.akey, st: node.state, kind: 'air', extra: null, mode: { air: false, offWall: node.state.wall === 0, offSwim: true }, desc: node.label });
    }
    return jobs;
  }

  // ---- expand a node: compute its outcomes (simulations cached per job key)
  expand(node) {
    if (node.expanded) return;
    node.expanded = true;
    const seen = new Map();
    const addOut = (o) => {
      const k = (o.to ? 'n' + o.to.idx : '') + '|' + (o.exit || '') + '|' + (o.brk ? o.brk.comp + '@' + Math.round(o.brk.state.x) + ',' + Math.round(o.brk.state.y) : '');
      const prev = seen.get(k);
      // an outcome that touches targets the kept one does not is kept as its own edge, so a path to a touch
      // target names the macro that really touches it (tools/lib/nav.js replays that macro)
      if (prev) {
        // opts.alts (tools/lib/nav.js): keep up to N alternative macros per destination (other samples/policies)
        const na = this.an.opts.alts;
        if (na && o.codes && prev.codes && (!prev.alts || prev.alts.length < na)) (prev.alts || (prev.alts = [])).push(o);
        if (!((o.touch || 0) & ~prev.touch) || seen.has(k + '|t' + o.touch)) return;
        seen.set(k + '|t' + o.touch, o); node.out.push(o); return;
      }
      if (!o.to && !o.exit && !o.brk && !o.touch) return;
      seen.set(k, o);
      node.out.push(o);
    };
    // job/codes: the start state and input program of the macro (tools/lib/nav.js replays them in the real game)
    const absorb = (results, desc, job, pols) => {
      for (const r of results) {
        const o = { touch: r.touch || 0, desc: desc + ' → ' + r.name, f: r.f, job, codes: pols && r.pols ? pols[r.pols[0]].codes : null };
        if (r.kind === 'exit') o.exit = r.exit;
        else if (r.kind === 'break') o.brk = { comp: r.comp, state: r.s };
        else if (r.kind === 'ground') { o.to = this.groundAt(r.s.x, r.s.y); if (!o.to) continue; }
        else if (r.kind === 'wall') o.to = this.wallAt(r.s);
        else if (r.kind === 'swim') { o.to = this.swimAt(r.s); if (!o.to) continue; }
        else if (r.kind === 'fall') o.to = this.nodeForState(r.s, 'fall');
        else if (r.kind !== 'timeout' && r.kind !== 'hazard') continue;
        if (r.kind === 'timeout' || r.kind === 'hazard') { if (o.touch) addOut(o); continue; }
        addOut(o);
      }
    };
    if (node.kind === 'ground' || node.kind === 'swim') {
      for (const dir of [-1, 1]) {
        const e = node.ends[dir];
        if (e.reason === 'exit') addOut({ exit: e.exit, touch: 0, desc: (node.kind === 'ground' ? 'walk ' : 'swim ') + dirName(dir) + ' out of the room' });
        if (node.kind === 'swim' && e.reason === 'out' && e.state) {
          const st = e.state;
          const to = st.onGround ? this.groundAt(st.x, st.y) : this.nodeForState(st, 'climb-out');
          if (to) addOut({ to, touch: 0, desc: 'swim ' + dirName(dir) + ' and climb out' });
        }
      }
      for (const b of this.breakableFrom(node)) addOut(b);
    } else if (node.kind === 'wall') {
      const end = node.end;
      if (end.reason === 'ground') { const to = this.groundAt(end.x, end.y); if (to) addOut({ to, touch: 0, desc: 'slide down ' + node.label }); }
      else if (end.reason === 'fall') { const to = this.nodeForState(end.state, 'slid off'); if (to) addOut({ to, touch: 0, desc: 'slide off the bottom of ' + node.label }); }
      else if (end.reason === 'exit') addOut({ exit: end.exit, touch: 0, desc: 'slide out of the room' });
    }
    for (const j of this.jobsFor(node)) {
      const pols = this.an.policies(j.kind, this.ab, j.extra);
      absorb(this.runFamily(j.key, j.st, pols, j.mode), j.desc, j, pols);
    }
  }

  // ---- parallel prefetch: run the frontier's missing simulations through runJobs (worker threads) and store
  // them exactly as runFamily would. Job wire format: {key, st, kind, extra, mode, subset|null}.
  async prefetch(nodes, runJobs) {
    const wire = [], meta = [];
    const queued = new Set();
    for (const node of nodes) {
      if (node.expanded) continue;
      for (const j of this.jobsFor(node)) {
        if (queued.has(j.key) || this.ownResult(j.key, j.st)) continue;
        queued.add(j.key);
        const pols = this.an.policies(j.kind, this.ab, j.extra);
        const plan = this.reusePlan(j.key, j.st, pols);
        if (plan && !plan.redo.length) { this.familyCache.set(j.key, { x: j.st.x, y: j.st.y, n: pols.length, results: plan.keep }); continue; }
        wire.push({ key: j.key, st: j.st, kind: j.kind, extra: j.extra, mode: j.mode, subset: plan ? plan.redo : null });
        meta.push({ j, pols, keep: plan ? plan.keep : [] });
      }
    }
    if (!wire.length) return;
    const out = await runJobs(wire, this);
    out.forEach((results, i) => {
      const m = meta[i];
      this.familyCache.set(m.j.key, { x: m.j.st.x, y: m.j.st.y, n: m.pols.length, results: m.keep.concat(results) });
    });
  }

  spread(a, b, dx) {
    const xs = [a];
    if (b - a > 1) {
      const n = Math.floor((b - a) / dx);
      for (let i = 1; i <= n; i++) { const x = a + (b - a) * i / (n + 1); if (x - a > 4 && b - x > 4) xs.push(x); }
      xs.push(b);
    }
    return xs;
  }

  groundSamples(node) {
    let a = node.x0, b = node.x1;
    const eL = node.ends[-1].reason === 'edge', eR = node.ends[1].reason === 'edge';
    if (EDGE_INSET) {
      const need = (eL ? EDGE_INSET : 0) + (eR ? EDGE_INSET : 0);
      if (b - a > need) { if (eL) a += EDGE_INSET; if (eR) b -= EDGE_INSET; } else { a = b = (a + b) / 2; }
    }
    const xs = this.spread(a, b, SAMPLE_DX);
    return xs.map((x) => ({
      x,
      edgeL: Math.abs(x - a) < 0.01 && eL,
      edgeR: Math.abs(x - b) < 0.01 && eR,
    }));
  }

  // cling samples: the exact top, then a fixed global grid (shared via the sample cache by every node of the
  // same face), then the bottom of the slide
  wallSamples(node) {
    const ys = [node.yTop];
    const span = node.yBot - node.yTop;
    if (span > 4) {
      let dy = WALL_DY;
      while (span / dy > WALL_MAX_SAMPLES) dy *= 2;
      for (let y = Math.ceil((node.yTop + 8) / dy) * dy; y < node.yBot - 4; y += dy) ys.push(y);
      // the bottom of the slide matters over air (slab corners); above a floor the last grid sample covers it
      if (node.end.reason !== 'ground' || node.yBot - ys[ys.length - 1] > dy / 2) ys.push(node.yBot);
    }
    return ys;
  }

  // simulate a policy family; results carry {name, pols (indices), bbox}
  simulate(st, pols, mode, subset) {
    const results = [];
    const list = subset ? subset.map((i) => pols[i]) : pols;
    this.runPolicies(st, list, mode, (idx, out) => {
      out.pols = subset ? idx.map((i) => subset[i]) : idx.slice();
      out.name = pols[out.pols[0]].name;
      results.push(out);
    });
    this.an.stats.macros += list.length;
    return results;
  }

  // World variants (broken B/D components) only ADD free space. A macro whose swept box stays clear of every
  // changed tile behaves identically in the variant, so the intact world's results are reused and only the
  // policies whose trajectories came near a changed tile are re-simulated.
  ownResult(key, st) {
    const own = this.familyCache.get(key);
    return own && Math.abs(own.x - st.x) < 1e-6 && Math.abs(own.y - st.y) < 1e-6 ? own : null;
  }

  reusePlan(key, st, pols) {
    const base = this.baseGraph;
    const prev = base && base.familyCache.get(key);
    if (!prev || Math.abs(prev.x - st.x) > 1e-6 || Math.abs(prev.y - st.y) > 1e-6 || prev.n !== pols.length) return null;
    const keep = [], redo = [];
    for (const r of prev.results) { if (this.touchesChanged(r.bbox)) redo.push(...r.pols); else keep.push(r); }
    this.an.stats.reused += keep.length;
    return { keep, redo: redo.sort((p, q) => p - q) };
  }

  runFamily(key, st, pols, mode) {
    const own = this.ownResult(key, st);
    if (own) return own.results;
    const plan = this.reusePlan(key, st, pols);
    const results = plan ? (plan.redo.length ? plan.keep.concat(this.simulate(st, pols, mode, plan.redo)) : plan.keep) : this.simulate(st, pols, mode);
    this.familyCache.set(key, { x: st.x, y: st.y, n: pols.length, results });
    return results;
  }

  touchesChanged(bb) {
    for (const r of this.changed) if (bb[0] < r.x1 && bb[2] > r.x0 && bb[1] < r.y1 && bb[3] > r.y0) return true;
    return false;
  }

  // B components hittable with the Brand from a ground/swim segment (side, up, and jump+up slashes; down-slash on B underfoot)
  breakableFrom(node) {
    const an = this.an, out = [];
    const room = this.room, T = this.T;
    const y = node.y, w = an.pw, h = an.ph;
    const SIDE = 72, UP = 70;
    const jumpRise = node.kind === 'ground' ? 4.4 * TILE : 0.5 * TILE;
    for (const comp of an.comps) {
      if (comp.code !== T.BREAKABLE) continue;
      if (room.tiles[comp.tiles[0][1] * room.cols + comp.tiles[0][0]] !== T.BREAKABLE) continue; // broken in this world
      let bestX = null;
      for (const [c, r] of comp.tiles) {
        const tx0 = c * TILE, tx1 = tx0 + TILE, ty0 = r * TILE, ty1 = ty0 + TILE;
        // side slash: rect [x+w-6, x+w+SIDE] or [x-SIDE, x+6] × [y+2, y+h]
        if (ty1 > y + 2 && ty0 < y + h) {
          if (tx0 < node.x1 + w + SIDE && tx1 > node.x0 + w - 6) bestX = Math.min(Math.max(tx0 - w, node.x0), node.x1);
          else if (tx1 > node.x0 - SIDE && tx0 < node.x1 + 6) bestX = Math.min(Math.max(tx1, node.x0), node.x1);
        }
        // up slash (standing or at the top of a jump)
        if (bestX == null && tx1 > node.x0 + w / 2 - 40 && tx0 < node.x1 + w / 2 + 40 && ty1 > y - jumpRise - UP && ty1 <= y + 1) {
          bestX = Math.min(Math.max(tx0 + TILE / 2 - w / 2, node.x0), node.x1);
        }
        // down slash on B underfoot (hop + down-slash)
        if (bestX == null && node.kind === 'ground' && Math.abs(ty0 - (y + h)) < 1 && tx1 > node.x0 && tx0 < node.x1 + w) {
          bestX = Math.min(Math.max(tx0, node.x0), node.x1);
        }
        if (bestX != null) break;
      }
      if (bestX == null) continue;
      const st = node.kind === 'ground' ? this.canonGround(bestX, y) : Object.assign(this.an.clone(node.state), { x: bestX, events: [] });
      if (!st) continue;
      out.push({ brk: { comp: comp.id, state: st }, touch: 0, desc: 'break ' + comp.id + ' with the Brand from ' + node.label });
    }
    return out;
  }
}

// ------------------------------------------------------------------------------------------------ helpers
const depthOk = (d) => (d || 0) < 8;
function describePath(trace, depth) {
  if (!trace) return [];
  const lines = [];
  const chain = [];
  let node = trace.node;
  let guard = 0, prev = null;
  while (node && guard++ < 200) {
    const p = trace.parent.get(node);
    if (!p) break;
    chain.push({ node, via: p.out, start: p.startLabel });
    if (!p.from) prev = p.prev;
    node = p.from;
  }
  chain.reverse();
  // a path in a broken-wall variant starts where the breaking macro ended: show how the player got there first
  if (prev && depthOk(depth)) {
    for (const l of describePath(prev, (depth || 0) + 1)) lines.push(l);
  }
  if (trace.world) lines.push('  [now in variant: broken ' + trace.world + ']');
  chain.forEach((c, i) => {
    if (i === 0 && prev && depthOk(depth)) { /* the breaking macro was the last line of the previous part */ }
    else if (c.via && c.via.desc) lines.push('  ' + c.via.desc);
    else if (c.start) lines.push('  start: ' + c.start);
    lines.push('    = ' + (c.node.label || c.node.kind));
  });
  if (trace.last && trace.last.desc) lines.push('  ' + trace.last.desc + (trace.last.exit ? '  => exit ' + trace.last.exit : ''));
  return lines;
}

// ASCII overlay of a closure: '*' feet positions on reached floors, '@' swimming, '|' wall clings, '+' airborne starts.
function overlay(an, res) {
  const grid = an.base.def.tiles.map((l) => l.split(''));
  const rows = grid.length;
  const put = (c, r, ch) => { if (r >= 0 && r < rows && c >= 0 && c < grid[r].length) { const cur = grid[r][c]; if (cur === '.' || cur === ':' || /[a-z0-9]/.test(cur) || cur === '~' || ch === '|') grid[r][c] = ch; } };
  for (const { node } of res.nodes) {
    if (node.kind === 'ground' || node.kind === 'swim') {
      const r = Math.floor((node.y + an.ph) / TILE - 0.001) - (node.kind === 'swim' ? 0 : 0);
      const c0 = Math.floor((node.x0 + an.pw / 2) / TILE), c1 = Math.floor((node.x1 + an.pw / 2) / TILE);
      for (let c = c0; c <= c1; c++) put(c, node.kind === 'swim' ? Math.floor((node.y + an.ph * 0.6) / TILE) - 1 : r, node.kind === 'swim' ? '@' : '*');
    } else if (node.kind === 'wall') {
      const c = Math.floor((node.x + an.pw / 2) / TILE);
      for (let r = Math.floor((node.yTop + an.ph / 2) / TILE); r <= Math.floor((node.yBot + an.ph / 2) / TILE); r++) put(c, r, '|');
    } else if (node.kind === 'air') {
      put(Math.floor((node.state.x + an.pw / 2) / TILE), Math.floor((node.state.y + an.ph / 2) / TILE), '+');
    }
  }
  return grid.map((r) => r.join(''));
}

module.exports = { installFastPaths, makeCloner, RoomAnalyzer, Graph, buildPolicies, makePolicy, describePath, overlay, setEdgeInset, TILE, MAXF };
