// src/engine/world.js — G.World: region & room definitions (with validation warnings), global lookup,
// opening detection and the tile-level runtime room (TileRoom; G.Room in room.js extends it).
// Node-loadable: tools use G.World.instantiate()/createRoom() to get TileRooms without any browser code.
(function () {
  'use strict';
  const G = globalThis.G;
  const T = G.T;
  const TILE = G.CONST.TILE;
  const CW = G.CONST.CELL_W, CH = G.CONST.CELL_H;
  const MARKER_RE = /^[a-z0-9]$/;

  const regions = Object.create(null);
  const rooms = Object.create(null);     // id → def (the original object)
  const info = Object.create(null);      // id → {cols, rows, gx, gy, specs?}
  const cellMap = new Map();             // 'cx,cy' → room id
  const warnings = [];

  function warn(msg) {
    warnings.push(msg);
    try { console.warn('[World] ' + msg); } catch (e) { /* ignore */ }
  }

  // ---------------------------------------------------------------- regions
  function defineRegion(r) {
    if (!r || typeof r.id !== 'string' || !r.id) { warn('defineRegion: missing id'); return null; }
    if (regions[r.id]) warn('defineRegion: region "' + r.id + '" defined twice (replacing)');
    const reg = Object.assign({ name: r.id, prefix: '', music: null, ambience: null, dark: 0.3, mapColor: '#888888' }, r);
    if (typeof reg.dark !== 'number' || reg.dark < 0 || reg.dark > 1) { warn('region ' + r.id + ': dark must be 0..1'); reg.dark = 0.3; }
    regions[r.id] = reg;
    return reg;
  }

  // ---------------------------------------------------------------- rooms
  // Normalizes the tile rows of a definition: returns {cols, rows, lines} (ragged rows padded with '#').
  function normalizeTiles(def, report) {
    const tiles = def.tiles;
    if (!Array.isArray(tiles) || !tiles.length) { report('tiles must be a non-empty array of strings'); return null; }
    const lines = tiles.map((l) => (typeof l === 'string' ? l : String(l == null ? '' : l)));
    let cols = 0;
    const counts = {};
    for (const l of lines) { counts[l.length] = (counts[l.length] || 0) + 1; cols = Math.max(cols, l.length); }
    const lengths = Object.keys(counts);
    if (lengths.length > 1) {
      // choose the most common width and pad/truncate the others so the game keeps running
      let best = cols, bestN = -1;
      for (const k of lengths) if (counts[k] > bestN) { bestN = counts[k]; best = +k; }
      cols = best;
      report('rows have unequal lengths (' + lengths.join(', ') + '); normalized to ' + cols + ' columns');
      for (let i = 0; i < lines.length; i++) {
        if (lines[i].length < cols) lines[i] = lines[i] + '#'.repeat(cols - lines[i].length);
        else if (lines[i].length > cols) lines[i] = lines[i].slice(0, cols);
      }
    }
    if (!cols) { report('tiles rows are empty'); return null; }
    return { cols, rows: lines.length, lines };
  }

  // Entity spawn specs from legend markers + the entities list. → [{props, tx, ty, marker?}]
  function entitySpecsOf(def, lines) {
    const out = [];
    const legend = def.legend || {};
    if (lines) {
      for (let r = 0; r < lines.length; r++) {
        const line = lines[r];
        for (let c = 0; c < line.length; c++) {
          const ch = line[c];
          if (MARKER_RE.test(ch) && legend[ch]) out.push({ props: Object.assign({}, legend[ch]), tx: c, ty: r, marker: ch });
        }
      }
    }
    if (Array.isArray(def.entities)) {
      for (const e of def.entities) {
        if (!e || typeof e !== 'object') continue;
        const props = Object.assign({}, e);
        const tx = props.x, ty = props.y;
        delete props.x; delete props.y;
        out.push({ props, tx: +tx || 0, ty: +ty || 0 });
      }
    }
    return out;
  }

  // Openings per side from boundary tiles that are not #/X (corners excluded).
  // → [{side:'W'|'E'|'N'|'S', pos, size}] (pos = first row for W/E, first column for N/S; room-local)
  function openingsFromCodes(cols, rows, codeAt) {
    const out = [];
    const isOpen = (c, r) => { const k = codeAt(c, r); return k !== T.SOLID && k !== T.GLAZED; };
    const scan = (side, n, fn) => {
      let start = -1;
      for (let i = 1; i < n - 1; i++) {
        const open = fn(i);
        if (open && start < 0) start = i;
        if ((!open || i === n - 2) && start >= 0) {
          const end = open ? i : i - 1;
          out.push({ side, pos: start, size: end - start + 1 });
          start = -1;
        }
      }
    };
    scan('W', rows, (r) => isOpen(0, r));
    scan('E', rows, (r) => isOpen(cols - 1, r));
    scan('N', cols, (c) => isOpen(c, 0));
    scan('S', cols, (c) => isOpen(c, rows - 1));
    return out;
  }
  function charCode(ch) {
    const k = G.TILE_CHARS[ch];
    return k === undefined ? T.EMPTY : k;
  }
  function openingsOf(defOrId) {
    const def = typeof defOrId === 'string' ? rooms[defOrId] : defOrId;
    if (!def) return [];
    const n = normalizeTiles(def, () => {});
    if (!n) return [];
    return openingsFromCodes(n.cols, n.rows, (c, r) => charCode(n.lines[r][c]));
  }

  function cellKey(cx, cy) { return cx + ',' + cy; }

  function defineRoom(def) {
    if (!def || typeof def !== 'object') { warn('defineRoom: definition must be an object'); return null; }
    const id = def.id;
    const report = (m) => warn('room ' + (id || '?') + ': ' + m);
    if (typeof id !== 'string' || !id) { report('missing id'); return null; }
    if (!def.dev && !/^[a-z]{2}_\d{2}$/.test(id)) report('id should look like "<prefix>_<nn>"');
    if (rooms[id]) report('defined twice (replacing the earlier definition)');
    if (!regions[def.region]) report('unknown region "' + def.region + '"');
    else if (!def.dev && regions[def.region].prefix && id.indexOf(regions[def.region].prefix + '_') !== 0) report('id prefix does not match region prefix "' + regions[def.region].prefix + '"');
    if (!Number.isFinite(def.gx) || !Number.isFinite(def.gy)) { report('gx/gy must be numbers'); return null; }
    if (def.gx % CW !== 0 || def.gy % CH !== 0) report('gx must be a multiple of ' + CW + ' and gy of ' + CH + ' (got ' + def.gx + ',' + def.gy + ')');
    const n = normalizeTiles(def, report);
    if (!n) return null;
    if (n.cols % CW !== 0 || n.cols < 32) report('width ' + n.cols + ' must be a multiple of ' + CW + ' and >= 32');
    if (n.rows % CH !== 0 || n.rows < 18) report('height ' + n.rows + ' must be a multiple of ' + CH + ' and >= 18');

    const legend = def.legend || {};
    for (const k of Object.keys(legend)) {
      if (!MARKER_RE.test(k)) report('legend key "' + k + '" must be a single char a-z or 0-9');
      else if (!legend[k] || typeof legend[k].type !== 'string') report('legend "' + k + '" needs a type');
    }
    const badChars = new Set(), missing = new Set(), markerCount = {};
    for (const line of n.lines) {
      for (const ch of line) {
        if (G.TILE_CHARS[ch] !== undefined) continue;
        if (MARKER_RE.test(ch)) {
          if (!legend[ch]) missing.add(ch);
          else markerCount[ch] = (markerCount[ch] || 0) + 1;
        } else badChars.add(ch);
      }
    }
    if (badChars.size) report('unknown tile chars: ' + JSON.stringify([...badChars].join('')) + ' (treated as empty)');
    if (missing.size) report('markers without legend entry: ' + [...missing].join(' ') + ' (treated as empty)');
    for (const ch in markerCount) if (markerCount[ch] > 1 && legend[ch] && legend[ch].id) report('marker "' + ch + '" has id "' + legend[ch].id + '" but appears ' + markerCount[ch] + ' times');

    // overlap with other rooms (cell granularity)
    const cx0 = Math.floor(def.gx / CW), cy0 = Math.floor(def.gy / CH);
    const cx1 = Math.floor((def.gx + n.cols - 1) / CW), cy1 = Math.floor((def.gy + n.rows - 1) / CH);
    if (rooms[id]) unindex(id);
    const overlaps = new Set();
    for (let cy = cy0; cy <= cy1; cy++) for (let cx = cx0; cx <= cx1; cx++) {
      const k = cellKey(cx, cy);
      const other = cellMap.get(k);
      if (other && other !== id) overlaps.add(other);
      else cellMap.set(k, id);
    }
    if (overlaps.size) report('overlaps room(s) ' + [...overlaps].join(', '));

    rooms[id] = def;
    info[id] = { cols: n.cols, rows: n.rows, gx: def.gx, gy: def.gy, lines: n.lines, specs: null };
    return def;
  }

  function unindex(id) {
    for (const [k, v] of cellMap) if (v === id) cellMap.delete(k);
  }

  // Tests/tools only: forget a registered room (definition, info and cell index). → true if it existed.
  function removeRoom(id) {
    if (!rooms[id]) return false;
    unindex(id);
    delete rooms[id];
    delete info[id];
    return true;
  }

  function getRoom(id) { return rooms[id] || null; }
  function roomInfo(id) { return info[id] || null; }

  // Room definition containing global tile (gtx, gty) (fractions allowed), or null.
  function roomAtGlobal(gtx, gty) {
    const id = cellMap.get(cellKey(Math.floor(gtx / CW), Math.floor(gty / CH)));
    if (!id) return null;
    const i = info[id];
    if (gtx < i.gx || gty < i.gy || gtx >= i.gx + i.cols || gty >= i.gy + i.rows) return null;
    return rooms[id];
  }

  function specsFor(id) {
    const i = info[id];
    if (!i) return [];
    if (!i.specs) i.specs = entitySpecsOf(rooms[id], i.lines);
    return i.specs;
  }

  // Search all room definitions for entity specs. pred(props, spec, roomId) → [{roomId, props, tx, ty}]
  function findEntitySpecs(pred) {
    const out = [];
    for (const id in rooms) {
      for (const s of specsFor(id)) {
        if (pred(s.props, s, id)) out.push({ roomId: id, props: s.props, tx: s.tx, ty: s.ty });
      }
    }
    return out;
  }

  function listRooms(opts) {
    const o = opts || {};
    return Object.keys(rooms).filter((id) => {
      const d = rooms[id];
      if (o.dev === true && !d.dev) return false;
      if (o.dev === false && d.dev) return false;
      if (o.region && d.region !== o.region) return false;
      return true;
    });
  }

  // ---------------------------------------------------------------- hidden pockets (secrets)
  // A hidden pocket is a 4-connected set of non-solid tiles (B and D count as walls) that is connected to no
  // opening of the room and touches at least one B/D tile: a secret behind a breakable wall or dive floor.
  // Openings that lead into a room marked `secret: true` do not count (the doorway slot behind a cracked wall
  // that leads into a secret room is part of the secret). Computed from the definition's tiles (never from
  // live, partly broken tiles) and cached per definition object. A room without any counted opening has none.
  // → { cols, rows, index: Int16Array (tile → pocket index | -1),
  //     pockets: [{ id, tiles: [tileIndex...], c0, r0, c1, r1, comps: [[c, r]...] (one tile per adjacent B/D component) }] }
  // `revealed(pocket, room)` → true once any adjacent B/D component is broken in that (live) room.
  const pocketCache = new WeakMap();
  const isWallCode = (k) => k === T.SOLID || k === T.GLAZED || k === T.BREAKABLE || k === T.DIVEFLOOR;
  function hiddenPockets(defOrId) {
    const def = typeof defOrId === 'string' ? rooms[defOrId] : defOrId;
    if (!def || typeof def !== 'object') return null;
    const hit = pocketCache.get(def);
    if (hit) return hit;
    const n = def.id && info[def.id] && rooms[def.id] === def ? info[def.id] : normalizeTiles(def, () => {});
    if (!n) return null;
    const cols = n.cols, rows = n.rows, N = cols * rows;
    const t = new Uint8Array(N);
    for (let r = 0; r < rows; r++) { const line = n.lines[r]; for (let c = 0; c < cols; c++) t[r * cols + c] = charCode(line[c]); }
    // components of non-solid tiles
    const comp = new Int32Array(N).fill(-1);
    const members = [];
    for (let i = 0; i < N; i++) {
      if (comp[i] >= 0 || isWallCode(t[i])) continue;
      const id = members.length, list = [i], st = [i];
      comp[i] = id;
      while (st.length) {
        const j = st.pop(), c = j % cols, r = (j / cols) | 0;
        const nb = [c > 0 ? j - 1 : -1, c < cols - 1 ? j + 1 : -1, r > 0 ? j - cols : -1, r < rows - 1 ? j + cols : -1];
        for (const k of nb) if (k >= 0 && comp[k] < 0 && !isWallCode(t[k])) { comp[k] = id; list.push(k); st.push(k); }
      }
      members.push(list);
    }
    // components reached from a counted opening (boundary tile whose outside neighbour is not in a secret room)
    const open = new Uint8Array(members.length);
    const gx = +def.gx || 0, gy = +def.gy || 0;
    const counts = (x, y) => { const d = roomAtGlobal(x, y); return !(d && d !== def && d.secret); };
    const seed = (c, r, x, y) => { const k = comp[r * cols + c]; if (k >= 0 && !open[k] && counts(x, y)) open[k] = 1; };
    for (let r = 0; r < rows; r++) { seed(0, r, gx - 1, gy + r); seed(cols - 1, r, gx + cols, gy + r); }
    for (let c = 0; c < cols; c++) { seed(c, 0, gx + c, gy - 1); seed(c, rows - 1, gx + c, gy + rows); }
    const anyOpen = open.some((v) => v === 1);
    const index = new Int16Array(N).fill(-1);
    const pockets = [];
    if (anyOpen) {
      const seenBD = new Uint8Array(N);
      for (let k = 0; k < members.length; k++) {
        if (open[k]) continue;
        const list = members[k], comps = [];
        let c0 = 1e9, r0 = 1e9, c1 = -1, r1 = -1;
        for (const i of list) {
          const c = i % cols, r = (i / cols) | 0;
          if (c < c0) c0 = c; if (c > c1) c1 = c; if (r < r0) r0 = r; if (r > r1) r1 = r;
          const nb = [c > 0 ? i - 1 : -1, c < cols - 1 ? i + 1 : -1, r > 0 ? i - cols : -1, r < rows - 1 ? i + cols : -1];
          for (const j of nb) {
            if (j < 0 || seenBD[j] || (t[j] !== T.BREAKABLE && t[j] !== T.DIVEFLOOR)) continue;
            comps.push([j % cols, (j / cols) | 0]);         // one tile per B/D component: flood-mark the rest
            const code = t[j], st = [j];
            seenBD[j] = 1;
            while (st.length) {
              const q = st.pop(), qc = q % cols, qr = (q / cols) | 0;
              const nq = [qc > 0 ? q - 1 : -1, qc < cols - 1 ? q + 1 : -1, qr > 0 ? q - cols : -1, qr < rows - 1 ? q + cols : -1];
              for (const s of nq) if (s >= 0 && !seenBD[s] && t[s] === code) { seenBD[s] = 1; st.push(s); }
            }
          }
        }
        if (!comps.length) continue;   // a sealed cavity without a breakable: not a secret, left as built
        const pi = pockets.length;
        for (const i of list) index[i] = pi;
        pockets.push({ id: (def.id || '?') + ':pocket:' + c0 + ',' + r0, tiles: list, c0, r0, c1, r1, comps });
      }
    }
    const res = { cols, rows, index, pockets };
    pocketCache.set(def, res);
    return res;
  }
  function pocketRevealed(pocket, room) {
    if (!pocket || !room || !room.tiles) return false;
    for (const [c, r] of pocket.comps) {
      const k = room.tiles[r * room.cols + c];
      if (k !== T.BREAKABLE && k !== T.DIVEFLOOR) return true;
    }
    return false;
  }

  // ---------------------------------------------------------------- runtime tile room
  class TileRoom {
    constructor(def, opts) {
      const o = opts || {};
      let n = def.id && info[def.id] && rooms[def.id] === def ? { cols: info[def.id].cols, rows: info[def.id].rows, lines: info[def.id].lines } : null;
      if (!n) n = normalizeTiles(def, (m) => warn('room ' + (def.id || '?') + ': ' + m));
      if (!n) throw new Error('room "' + def.id + '" has no valid tiles');
      this.id = def.id;
      this.def = def;
      let regionId = def.region;
      if (def.dev && o.regionOverride !== false) {
        const want = o.regionId || (G.params && G.params.region);
        if (want && regions[want]) regionId = want;
      } else if (o.regionId && regions[o.regionId]) regionId = o.regionId;
      this.regionId = regionId;
      this.region = regions[regionId] || regions.test || { id: regionId, name: regionId, dark: 0.3, mapColor: '#888888' };
      this.cols = n.cols; this.rows = n.rows;
      this.widthPx = n.cols * TILE; this.heightPx = n.rows * TILE;
      this.gx = def.gx || 0; this.gy = def.gy || 0;
      this.tiles = new Uint8Array(n.cols * n.rows);
      for (let r = 0; r < n.rows; r++) {
        const line = n.lines[r];
        for (let c = 0; c < n.cols; c++) this.tiles[r * n.cols + c] = charCode(line[c]);
      }
      // dark: room override > region (if a dev room previews a region, use that region's darkness)
      const regionDark = this.region && typeof this.region.dark === 'number' ? this.region.dark : 0.3;
      this.dark = (typeof def.dark === 'number' && !(def.dev && regionId !== def.region)) ? def.dark : regionDark;
      this.entitySpecs = (def.id && rooms[def.id] === def) ? specsFor(def.id) : entitySpecsOf(def, n.lines);
      this.entities = [];
      this.solids = [];
      this.openings = openingsFromCodes(this.cols, this.rows, (c, r) => this.tiles[r * this.cols + c]);
      this._buildComponents(o.flags || (G.game && G.game.progress ? G.game.progress.flags : null));
    }

    inBounds(c, r) { return c >= 0 && r >= 0 && c < this.cols && r < this.rows; }

    tileAt(c, r) {
      const cols = this.cols, rows = this.rows;
      if (c >= 0 && r >= 0 && c < cols && r < rows) return this.tiles[r * cols + c];
      let bc, br;
      if (c < 0 || c >= cols) {
        if (r < 0 || r >= rows) return T.SOLID;
        bc = c < 0 ? 0 : cols - 1; br = r;
      } else { bc = c; br = r < 0 ? 0 : rows - 1; }
      const b = this.tiles[br * cols + bc];
      return (b === T.SOLID || b === T.GLAZED) ? T.SOLID : T.EMPTY;
    }

    setTile(c, r, code) {
      if (!this.inBounds(c, r)) return;
      this.tiles[r * this.cols + c] = code;
    }

    // Breakable ('B') and dive-floor ('D') connected components (4-connected, same code).
    _buildComponents(flags) {
      const cols = this.cols, rows = this.rows;
      this.components = [];
      this.compIndex = new Int32Array(cols * rows).fill(-1);
      for (let r = 0; r < rows; r++) {
        for (let c = 0; c < cols; c++) {
          const i = r * cols + c, code = this.tiles[i];
          if ((code !== T.BREAKABLE && code !== T.DIVEFLOOR) || this.compIndex[i] >= 0) continue;
          const idx = this.components.length;
          const tiles = [];
          let minC = c, minR = r, maxC = c, maxR = r;
          const stack = [c, r];
          this.compIndex[i] = idx;
          while (stack.length) {
            const rr = stack.pop(), cc = stack.pop();
            tiles.push([cc, rr]);
            if (cc < minC) minC = cc; if (cc > maxC) maxC = cc;
            if (rr < minR) minR = rr; if (rr > maxR) maxR = rr;
            const nb = [[cc + 1, rr], [cc - 1, rr], [cc, rr + 1], [cc, rr - 1]];
            for (const [nc, nr] of nb) {
              if (nc < 0 || nr < 0 || nc >= cols || nr >= rows) continue;
              const j = nr * cols + nc;
              if (this.tiles[j] === code && this.compIndex[j] < 0) { this.compIndex[j] = idx; stack.push(nc, nr); }
            }
          }
          // id uses the min column and min row of the component's bounding box
          const comp = { id: this.id + ':' + minC + ',' + minR, code, tiles, broken: false, hits: 0,
            c0: minC, r0: minR, c1: maxC, r1: maxR };
          this.components.push(comp);
          if (flags && flags['broken:' + comp.id]) this._clearComponent(comp);
        }
      }
    }
    _clearComponent(comp) {
      comp.broken = true;
      for (const [c, r] of comp.tiles) this.tiles[r * this.cols + c] = T.EMPTY;
    }
    componentAt(c, r) {
      if (!this.inBounds(c, r)) return null;
      const i = this.compIndex[r * this.cols + c];
      return i >= 0 ? this.components[i] : null;
    }
    // Pure version (no persistence/effects); G.Room overrides with the full behaviour.
    breakComponentAt(c, r) {
      const comp = this.componentAt(c, r);
      if (!comp || comp.broken) return false;
      this._clearComponent(comp);
      return true;
    }
    liquidSurface(c, r) { return G.Physics ? G.Physics.liquidSurface(this, c, r) : null; }
  }

  // Runtime room from a registered id (G.Room in the browser, TileRoom in Node tools).
  function instantiate(id, opts) {
    const def = rooms[id];
    if (!def) throw new Error('G.World.instantiate: unknown room "' + id + '"');
    return createRoom(def, opts);
  }
  // Runtime room from any definition object (need not be registered; used by tools/tests).
  function createRoom(def, opts) {
    const Cls = (opts && opts.tileOnly) ? TileRoom : (G.Room || TileRoom);
    return new Cls(def, opts);
  }

  G.World = {
    regions, rooms, warnings,
    defineRegion, defineRoom, removeRoom, getRoom, roomInfo, roomAtGlobal, listRooms, hiddenPockets, pocketRevealed,
    roomsInRegion: (regionId) => listRooms({ region: regionId }),
    instantiate, createRoom,
    openingsOf, entitySpecsOf: (def) => (def && def.id && rooms[def.id] === def ? specsFor(def.id) : entitySpecsOf(def, (normalizeTiles(def, () => {}) || {}).lines)),
    findEntitySpecs,
    firstDevRoom() { const l = listRooms({ dev: true }); return l.length ? l[0] : null; },
    TileRoom,
  };
})();
