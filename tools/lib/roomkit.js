// tools/lib/roomkit.js — helper for region/boss builders: build room tile grids that EXACTLY
// match design/world_plan.json (size, position, exits), then emit src/data/... files.
//
// Usage in a generator script (e.g. tools/gen/guttered.js):
//   const RK = require('../lib/roomkit');
//   const r = RK.room('gw_03');            // grid of '#' sized per plan; knows its exits
//   r.carve(1, 1, 62, 14);                 // open interior space   (x = column, y = row)
//   r.platform(10, 11, 5);                 // one-way platform '=' at row 11, cols 10..14
//   r.paste(20, 16, [                      // ASCII block; '?' keeps whatever is underneath
//     '..##..',
//     '..##..',
//   ]);
//   r.openExits();                         // carve every planned exit on the border (+1 tile inward)
//   r.put(30, 14, { type: 'lanternway', id: 'guttered' });   // entity marker on an EMPTY tile
//   r.add({ type: 'light', x: 30, y: 10, r: 4, color: '#ffb060' }); // entity via the entities list
//   const def = r.toDef({ theme: { bg: 'interior' }, bgSeed: 3 });
//   RK.emit('guttered', [def, ...], 'src/data/regions/guttered.js');
//
// CLI: node tools/lib/roomkit.js <roomId>   → prints the plan entry (exits with cell ranges, paths,
//                                             spots, contents, notes) in a builder-friendly form.
//      node tools/lib/roomkit.js --region <regionId> → lists that region's rooms.
'use strict';
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..', '..');
const PLAN_FILE = path.join(ROOT, 'design', 'world_plan.json');
const MARKERS = 'abcdefghijklmnopqrstuvwxyz0123456789';
const TILE_CHARS = new Set(['.', '#', 'X', '=', '^', '~', '%', 'B', 'D', ':']);
const SOLID_BORDER = new Set(['#', 'X']);

let _plan = null;
function loadPlan() {
  if (!_plan) _plan = JSON.parse(fs.readFileSync(PLAN_FILE, 'utf8'));
  return _plan;
}
function planRoom(id) {
  const r = loadPlan().rooms.find((x) => x.id === id);
  if (!r) throw new Error(`roomkit: room '${id}' is not in design/world_plan.json`);
  return r;
}

// Cells (x,y) occupied by an exit on the room border.
function exitCells(room, ex) {
  const cells = [];
  for (let i = 0; i < ex.size; i++) {
    const k = ex.pos + i;
    if (ex.side === 'W') cells.push([0, k]);
    else if (ex.side === 'E') cells.push([room.w - 1, k]);
    else if (ex.side === 'N') cells.push([k, 0]);
    else if (ex.side === 'S') cells.push([k, room.h - 1]);
  }
  return cells;
}

class RoomKit {
  constructor(plan) {
    this.plan = plan;
    this.id = plan.id;
    this.region = plan.region;
    this.w = plan.w;
    this.h = plan.h;
    this.g = Array.from({ length: this.h }, () => Array(this.w).fill('#'));
    this.legend = {};
    this.entities = [];
    this._m = 0;
  }

  inb(x, y) { return x >= 0 && y >= 0 && x < this.w && y < this.h; }
  _chk(x, y, what) {
    if (!Number.isInteger(x) || !Number.isInteger(y) || !this.inb(x, y)) {
      throw new Error(`${this.id}: ${what} out of bounds at (${x},${y}) — room is ${this.w}x${this.h}`);
    }
  }
  get(x, y) { return this.inb(x, y) ? this.g[y][x] : '#'; }
  set(x, y, ch) {
    this._chk(x, y, `set('${ch}')`);
    if (!TILE_CHARS.has(ch) && !MARKERS.includes(ch)) throw new Error(`${this.id}: unknown tile char '${ch}'`);
    this.g[y][x] = ch;
    return this;
  }
  /** Fill the rectangle (x, y, w, h) with ch (default '#'). Clipped to the room. */
  fill(x, y, w, h, ch = '#') {
    for (let yy = y; yy < y + h; yy++) for (let xx = x; xx < x + w; xx++) if (this.inb(xx, yy)) this.set(xx, yy, ch);
    return this;
  }
  carve(x, y, w, h) { return this.fill(x, y, w, h, '.'); }
  hline(x, y, len, ch = '#') { return this.fill(x, y, len, 1, ch); }
  vline(x, y, len, ch = '#') { return this.fill(x, y, 1, len, ch); }
  platform(x, y, len) { return this.hline(x, y, len, '='); }
  /** Paste an ASCII block with its top-left at (x, y). '?' keeps the existing tile. */
  paste(x, y, lines) {
    const w = lines[0].length;
    lines.forEach((ln, i) => {
      if (ln.length !== w) throw new Error(`${this.id}: paste block line ${i} has length ${ln.length}, expected ${w}`);
      for (let j = 0; j < ln.length; j++) {
        const ch = ln[j];
        if (ch === '?') continue;
        this.set(x + j, y + i, ch);
      }
    });
    return this;
  }

  exit(id) {
    const ex = this.plan.exits.find((e) => e.id === id);
    if (!ex) throw new Error(`${this.id}: no exit '${id}' (has ${this.plan.exits.map((e) => e.id).join(', ')})`);
    return Object.assign({ cells: exitCells(this.plan, ex) }, ex);
  }
  /** Carve one planned exit: the border cells plus `depth` tiles inward (default 1). */
  openExit(id, depth = 1) {
    const ex = this.exit(id);
    for (const [cx, cy] of ex.cells) {
      for (let d = 0; d < depth; d++) {
        const x = ex.side === 'W' ? cx + d : ex.side === 'E' ? cx - d : cx;
        const y = ex.side === 'N' ? cy + d : ex.side === 'S' ? cy - d : cy;
        if (this.inb(x, y)) this.set(x, y, '.');
      }
    }
    return this;
  }
  openExits(depth = 1) { for (const e of this.plan.exits) this.openExit(e.id, depth); return this; }

  /** Place an entity marker on tile (x, y) (the tile becomes EMPTY for collision). */
  put(x, y, props) {
    this._chk(x, y, `put(${props && props.type})`);
    if (!props || !props.type) throw new Error(`${this.id}: put() needs props.type`);
    const cur = this.g[y][x];
    if (cur !== '.' && cur !== ':' && !props.force) {
      const what = MARKERS.includes(cur) ? `another marker '${cur}' (${this.legend[cur] && this.legend[cur].type})` : `tile '${cur}'`;
      throw new Error(`${this.id}: put(${props.type}) at (${x},${y}) would overwrite ${what} — carve the tile first or pass force:true`);
    }
    let ch = props.char;
    const p = Object.assign({}, props);
    delete p.char;
    delete p.force;
    if (!ch) {
      // reuse a marker for identical prop sets without an id (e.g. several of the same enemy)
      const key = JSON.stringify(p);
      if (!p.id) for (const [k, v] of Object.entries(this.legend)) if (JSON.stringify(v) === key) { ch = k; break; }
      if (!ch) {
        while (this._m < MARKERS.length && this.legend[MARKERS[this._m]]) this._m++;
        if (this._m >= MARKERS.length) throw new Error(`${this.id}: out of marker characters (36) — use add() for extra entities`);
        ch = MARKERS[this._m++];
      }
    }
    if (!MARKERS.includes(ch)) throw new Error(`${this.id}: marker '${ch}' must be a-z or 0-9`);
    if (this.legend[ch] && JSON.stringify(this.legend[ch]) !== JSON.stringify(p)) throw new Error(`${this.id}: marker '${ch}' already used for different props`);
    this.legend[ch] = p;
    this.g[y][x] = ch;
    return this;
  }
  /** Add an entity through the room's `entities` list (x = column, y = row). Tile is unchanged. */
  add(props) {
    if (!props || !props.type) throw new Error(`${this.id}: add() needs props.type`);
    this._chk(props.x, props.y, `add(${props.type})`);
    this.entities.push(Object.assign({}, props));
    return this;
  }

  /** Lightweight self-check against the plan. Returns { errors, warnings }. */
  check() {
    const errors = [], warnings = [];
    const open = new Set();
    for (const e of this.plan.exits) for (const [x, y] of exitCells(this.plan, e)) open.add(x + ',' + y);
    for (let y = 0; y < this.h; y++) {
      for (let x = 0; x < this.w; x++) {
        const border = x === 0 || y === 0 || x === this.w - 1 || y === this.h - 1;
        if (!border) continue;
        const ch = this.g[y][x];
        const k = x + ',' + y;
        if (open.has(k)) {
          if (SOLID_BORDER.has(ch) || ch === 'B' || ch === 'D') errors.push(`exit cell (${x},${y}) is '${ch}' but the plan has an opening there`);
        } else if (!SOLID_BORDER.has(ch)) {
          errors.push(`unplanned opening at border (${x},${y}) '${ch}'`);
        }
      }
    }
    for (const e of this.plan.exits) {
      if (e.side === 'W' || e.side === 'E') {
        const x = e.side === 'W' ? 0 : this.w - 1;
        const below = this.get(x, e.pos + e.size);
        if (!SOLID_BORDER.has(below)) warnings.push(`exit ${e.id}: tile under the opening (${x},${e.pos + e.size}) is not solid`);
        const xi = e.side === 'W' ? 1 : this.w - 2;
        const floorIn = this.get(xi, e.pos + e.size);
        if (floorIn === '.' ) warnings.push(`exit ${e.id}: no floor just inside the opening at (${xi},${e.pos + e.size}) — players walking in will fall`);
      }
    }
    const ids = new Set();
    for (const p of [...Object.values(this.legend), ...this.entities]) {
      if (p.id) {
        const k = p.type + ':' + p.id;
        if (ids.has(k)) errors.push(`duplicate entity id ${k}`);
        ids.add(k);
      }
    }
    const used = new Set();
    for (const row of this.g) for (const ch of row) if (MARKERS.includes(ch)) used.add(ch);
    for (const k of Object.keys(this.legend)) if (!used.has(k)) warnings.push(`legend '${k}' (${this.legend[k].type}) is not placed in the grid`);
    for (const p of Object.values(this.legend)) if (p.id && [...this.g.flat()].filter((c) => this.legend[c] === p).length > 1) errors.push(`marker with id ${p.id} appears more than once`);
    return { errors, warnings };
  }

  ascii() { return this.g.map((r) => r.join('')).join('\n'); }

  /** Build the G.World.defineRoom object. `extra` may hold dark, music, ambience, bgSeed, theme, name. */
  toDef(extra = {}) {
    const { errors } = this.check();
    if (errors.length) throw new Error(`${this.id}: roomkit check failed:\n  ` + errors.join('\n  '));
    const def = {
      id: this.id,
      region: this.region,
      name: this.plan.name,
      gx: this.plan.gx,
      gy: this.plan.gy,
      tiles: this.g.map((r) => r.join('')),
      legend: this.legend,
      entities: this.entities,
    };
    // secret rooms (plan `secret`): openings into them do not count as openings of the neighbour, so the doorway
    // slot behind the neighbour's breakable wall is veiled as a hidden pocket (G.World.hiddenPockets)
    if (this.plan.secret || this.plan.kind === 'secret') def.secret = true;
    return Object.assign(def, extra);
  }
}

function room(id) { return new RoomKit(planRoom(id)); }

/**
 * Write a data file that defines the given rooms. `file` is relative to the repo root.
 * The output is a Node-loadable IIFE (TECH_SPEC §1) with one tile row per line.
 */
function emit(regionId, defs, file, banner) {
  const out = [];
  out.push(`// ${file} — ${banner || `rooms of region '${regionId}'`}`);
  out.push('// GENERATED by a tools/gen script via tools/lib/roomkit.js — edit the generator, then re-run it.');
  out.push('(function () {');
  out.push("  'use strict';");
  out.push('  const G = globalThis.G;');
  out.push('  const R = (def) => G.World.defineRoom(def);');
  for (const d of defs) {
    const { tiles, ...rest } = d;
    out.push('');
    out.push(`  R(Object.assign(${JSON.stringify(rest)}, { tiles: [`);
    for (const t of tiles) out.push(`    '${t}',`);
    out.push('  ] }));');
  }
  out.push('})();');
  out.push('');
  const abs = path.isAbsolute(file) ? file : path.join(ROOT, file);
  fs.mkdirSync(path.dirname(abs), { recursive: true });
  fs.writeFileSync(abs, out.join('\n'));
  return abs;
}

function describe(id) {
  const r = planRoom(id);
  const lines = [];
  lines.push(`${r.id} "${r.name}"  region=${r.region} kind=${r.kind}  gx=${r.gx} gy=${r.gy}  size=${r.w}x${r.h} tiles`);
  lines.push('EXITS:');
  for (const e of r.exits) {
    const range = (e.side === 'W' || e.side === 'E')
      ? `col ${e.side === 'W' ? 0 : r.w - 1}, rows ${e.pos}-${e.pos + e.size - 1}`
      : `row ${e.side === 'N' ? 0 : r.h - 1}, cols ${e.pos}-${e.pos + e.size - 1}`;
    lines.push(`  ${e.id.padEnd(3)} ${e.side} ${range.padEnd(26)} -> ${e.to}.${e.toExit}`);
  }
  lines.push('PATHS (from -> to : requires):');
  for (const p of r.paths || []) lines.push(`  ${p.from} -> ${p.to} : [${(p.requires || []).join(', ')}]`);
  lines.push('SPOTS:');
  const spots = {};
  for (const s of r.spots || []) (spots[s.id] = spots[s.id] || []).push(`${s.from}[${(s.requires || []).join(',')}]`);
  for (const [k, v] of Object.entries(spots)) lines.push(`  ${k}: from ${v.join(' | ')}`);
  lines.push('CONTENTS:');
  for (const c of r.contents || []) lines.push('  ' + c);
  lines.push('NOTES:');
  lines.push('  ' + (r.notes || ''));
  return lines.join('\n');
}

module.exports = { loadPlan, planRoom, room, emit, exitCells, describe, RoomKit, MARKERS };

if (require.main === module) {
  const a = process.argv.slice(2);
  if (a[0] === '--region') {
    for (const r of loadPlan().rooms.filter((x) => x.region === a[1])) console.log(`${r.id.padEnd(6)} ${String(r.w + 'x' + r.h).padEnd(7)} ${r.kind.padEnd(10)} ${r.name}`);
  } else if (a[0]) {
    console.log(describe(a[0]));
  } else {
    console.log('usage: node tools/lib/roomkit.js <roomId> | --region <regionId>');
  }
}
