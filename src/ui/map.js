// src/ui/map.js — the world map. Visited rooms are drawn as silhouettes of their real terrain (minimap canvases
// prerendered from tiles, in region colors); rooms of charted regions not yet visited are faint; the current
// room is highlighted and a blue-flame marker shows the player's real position. Icons mark sconces, Lanternway
// posts, merchants/travelers, the Seal Door and the Gutterwisp in visited rooms; with the Waymoth sigil, moths mark
// uncollected pickups in visited/charted rooms. Region labels, pan (arrows/stick), zoom, centered on open.
(function () {
  'use strict';
  const G = globalThis.G;
  const UI = G.UI;
  const C = UI.C;
  const W = UI.W, H = UI.H;
  const TAU = Math.PI * 2;
  const TILE = G.CONST.TILE;
  const MS = 4;                         // minimap px per tile (prerender resolution)
  const ZOOMS = [1.3, 2.1, 3.3, 5.0];   // screen px per tile
  const SHOPS = { pell: 1, quill: 1, bramm: 1 };
  // the map content (rooms, icons, labels, player) lives between the title band and the footer: it is drawn on a
  // layer that fades out over VIEW_TOP-FADE..VIEW_TOP (top) and viewBot..viewBot+FADE (bottom), so nothing runs
  // through the title/flourish (y < ~90) or the legend/hint rows. The footer is one row (legend left, hints right)
  // or, when both do not fit side by side, two rows (legend above the hints) with a higher content bottom.
  const FADE = 36, VIEW_TOP = 90 + FADE;
  const FOOT1 = { legY: H - 30, hintY: H - 30, viewBot: H - 52 - FADE };
  const FOOT2 = { legY: H - 60, hintY: H - 28, viewBot: H - 82 - FADE };

  const cache = new Map();              // roomId → {key, canvas, cols, rows}
  let paper = null;
  let layer = null;
  const masks = new Map();   // viewBot → mask canvas

  function P() { return (G.game && G.game.progress) || null; }
  function regionColor(regionId) {
    let c = null;
    try { if (G.Art && typeof G.Art.mapColor === 'function') c = G.Art.mapColor(regionId); } catch (e) { c = null; }
    if (!c) { const r = G.World && G.World.regions && G.World.regions[regionId]; c = r && r.mapColor; }
    return c || '#8a8f9c';
  }

  // ------------------------------------------------------------------ minimap prerender
  function brokenKey(flags, roomId) {
    if (!flags) return '';
    const pre = 'broken:' + roomId + ':';
    let k = '';
    for (const f in flags) if (f.charCodeAt(0) === 98 && f.indexOf(pre) === 0 && flags[f]) k += f.slice(pre.length) + ';';
    return k;
  }
  function roomCanvas(def, flags) {
    const key = def.id + '|' + brokenKey(flags, def.id);
    const hit = cache.get(def.id);
    if (hit && hit.key === key) return hit;
    let tr;
    try { tr = G.World.instantiate(def.id, { tileOnly: true, flags: flags || {} }); } catch (e) { G.reportError(e, 'map.room ' + def.id); return null; }
    const cols = tr.cols, rows = tr.rows;
    const T = G.T;
    const { canvas, ctx } = G.U.makeCanvas(cols * MS, rows * MS);
    const col = regionColor(def.region);
    // secret pockets (G.World.hiddenPockets) stay off the map until a wall/floor next to them is broken
    let hidden = null;
    const hp = G.World.hiddenPockets ? G.World.hiddenPockets(def) : null;
    if (hp && hp.cols === cols && hp.rows === rows) {
      for (const pk of hp.pockets) {
        if (G.World.pocketRevealed(pk, tr)) continue;
        hidden = hidden || new Uint8Array(cols * rows);
        for (const i of pk.tiles) hidden[i] = 1;
      }
    }
    const solid = (c, r) => {
      if (c < 0 || r < 0 || c >= cols || r >= rows) return true;
      if (hidden && hidden[r * cols + c]) return true;
      const k = tr.tiles[r * cols + c];
      return k === T.SOLID || k === T.GLAZED || k === T.BREAKABLE || k === T.DIVEFLOOR;
    };
    // interior air
    ctx.fillStyle = G.U.rgba(col, 0.22);
    for (let r = 0; r < rows; r++) {
      let start = -1;
      for (let c = 0; c <= cols; c++) {
        const air = c < cols && !solid(c, r);
        if (air && start < 0) start = c;
        if (!air && start >= 0) { ctx.fillRect(start * MS, r * MS, (c - start) * MS, MS); start = -1; }
      }
    }
    // liquids, platforms, spikes
    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        const k = hidden && hidden[r * cols + c] ? T.SOLID : tr.tiles[r * cols + c];
        if (k === T.WATER) { ctx.fillStyle = 'rgba(90,150,210,0.45)'; ctx.fillRect(c * MS, r * MS, MS, MS); } else if (k === T.LAVA) { ctx.fillStyle = 'rgba(230,110,50,0.55)'; ctx.fillRect(c * MS, r * MS, MS, MS); } else if (k === T.PLATFORM) { ctx.fillStyle = G.U.rgba(col, 0.75); ctx.fillRect(c * MS, r * MS, MS, 1.2); } else if (k === T.SPIKES) { ctx.fillStyle = 'rgba(210,120,100,0.6)'; ctx.fillRect(c * MS + 1, r * MS + MS * 0.45, MS - 2, MS * 0.55); }
      }
    }
    // terrain edges (solid next to air)
    ctx.fillStyle = col;
    const E = 1.4;
    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        if (!solid(c, r)) continue;
        const x = c * MS, y = r * MS;
        if (r > 0 && !solid(c, r - 1)) ctx.fillRect(x, y, MS, E);
        if (r < rows - 1 && !solid(c, r + 1)) ctx.fillRect(x, y + MS - E, MS, E);
        if (c > 0 && !solid(c - 1, r)) ctx.fillRect(x, y, E, MS);
        if (c < cols - 1 && !solid(c + 1, r)) ctx.fillRect(x + MS - E, y, E, MS);
      }
    }
    const out = { key, canvas, cols, rows };
    cache.set(def.id, out);
    return out;
  }
  function buildPaper() {
    const { canvas, ctx } = G.U.makeCanvas(W, H);
    const g = ctx.createRadialGradient(W / 2, H / 2, 60, W / 2, H / 2, W * 0.7);
    g.addColorStop(0, '#12131a'); g.addColorStop(1, '#050609');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, W, H);
    const rng = new G.RNG(99);
    for (let i = 0; i < 2600; i++) {
      ctx.fillStyle = rng.chance(0.5) ? 'rgba(255,240,210,0.018)' : 'rgba(0,0,0,0.05)';
      ctx.fillRect(rng.range(0, W), rng.range(0, H), rng.range(1, 3), rng.range(1, 3));
    }
    paper = canvas;
  }
  function maskFor(viewBot) {
    let m = masks.get(viewBot);
    if (!m) { m = buildMask(viewBot); masks.set(viewBot, m); }
    return m;
  }
  function buildMask(viewBot) {
    const { canvas, ctx } = G.U.makeCanvas(W, H);
    const g = ctx.createLinearGradient(0, 0, 0, H);
    g.addColorStop(0, 'rgba(0,0,0,0)');
    g.addColorStop((VIEW_TOP - FADE) / H, 'rgba(0,0,0,0)');
    g.addColorStop(VIEW_TOP / H, 'rgba(0,0,0,1)');
    g.addColorStop(viewBot / H, 'rgba(0,0,0,1)');
    g.addColorStop((viewBot + FADE) / H, 'rgba(0,0,0,0)');
    g.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, W, H);
    return canvas;
  }
  /** World-tile centre that frames the bounds b inside the visible band at zoom z, or null if they do not fit. */
  function frameCenter(b, z, viewBot) {
    const vb = viewBot || FOOT1.viewBot;
    if (!(b.x1 > b.x0) || (b.x1 - b.x0) * z > W - 40 || (b.y1 - b.y0) * z > vb - VIEW_TOP + FADE) return null;
    return { x: (b.x0 + b.x1) / 2, y: (b.y0 + b.y1) / 2 - ((VIEW_TOP + vb) / 2 - H / 2) / z };
  }
  UI.mapFrameCenter = frameCenter;

  // ------------------------------------------------------------------ data
  function collectRooms() {
    const p = P() || {};
    const visited = p.visited || {}, charts = p.charts || {};
    const list = [];
    const ids = G.World && G.World.listRooms ? G.World.listRooms({ dev: false }) : [];
    for (const id of ids) {
      const def = G.World.getRoom(id);
      if (!def || def.dev) continue;
      const v = !!visited[id], ch = !!charts[def.region];
      if (!v && !ch) continue;
      if (def.secret && !v) continue;       // a chart never gives away a secret room (gw_12) before it is found
      const info = G.World.roomInfo(id);
      if (!info) continue;
      list.push({ id, def, region: def.region, visited: v, gx: info.gx, gy: info.gy, cols: info.cols, rows: info.rows });
    }
    return list;
  }
  function isCollected(props, p) {
    if (!props || !p) return true;
    if (props.item === 'spark' && props.id && (p.sparks || []).indexOf(props.id) >= 0) return true;
    if (props.id && p.flags && p.flags['item:' + props.id]) return true;
    if (props.item === 'sigil' && props.sigil && (p.sigils || []).indexOf(props.sigil) >= 0 && !props.id) return true;
    return false;
  }
  // Whether the NPC of a spec stands in its room right now: the class's own present() (props.requires plus the
  // per-character rules: Wren is only ever in one place, Sable's glimpses vanish, her stage 2 waits for the duel)
  // run on a stub carrying the same props/stage the entity constructor would set.
  function npcPresent(pr) {
    try {
      const N = G.NPCs, name = String(pr.npc || '').toLowerCase();
      const Cls = (N && N.classes && N.classes[name]) || G.NPC;
      if (!Cls || typeof Cls.prototype.present !== 'function') return true;
      const stub = Object.create(Cls.prototype);
      stub.props = pr; stub.npc = name;
      stub.stage = pr.stage != null && pr.stage !== '' ? (pr.stage | 0) : 0;
      return !!Cls.prototype.present.call(stub);
    } catch (e) { G.reportError(e, 'map.npcPresent ' + pr.npc); return true; }
  }
  UI.mapNpcPresent = npcPresent;
  function markersFor(room, p, waymoth) {
    const out = [];
    let specs = [];
    try { specs = G.World.entitySpecsOf(room.def) || []; } catch (e) { specs = []; }
    for (const s of specs) {
      const pr = s.props || {};
      const gx = room.gx + s.tx + 0.5, gy = room.gy + s.ty + 0.5;
      if (room.visited) {
        if (pr.type === 'sconce') out.push({ kind: 'sconce', gx, gy });
        else if (pr.type === 'lanternway') out.push({ kind: 'lanternway', gx, gy, lit: !!(p.lanterns && p.lanterns[pr.id]) });
        else if (pr.type === 'npc') { if (npcPresent(pr)) out.push({ kind: SHOPS[pr.npc] ? 'shop' : 'npc', gx, gy }); }
        else if (pr.type === 'sealdoor') out.push({ kind: 'door', gx, gy });
      }
      if (waymoth && pr.type === 'pickup' && pr.item !== 'cinders' && !isCollected(pr, p)) out.push({ kind: 'relic', gx, gy });
    }
    return out;
  }

  // ------------------------------------------------------------------ icons
  function drawMarker(ctx, m, x, y, t, s) {
    switch (m.kind) {
      case 'sconce': {
        ctx.fillStyle = '#cfc4a8';
        ctx.fillRect(x - 5 * s, y + 3 * s, 10 * s, 2 * s);
        ctx.fillRect(x - 1.5 * s, y - 2 * s, 3 * s, 5 * s);
        UI.flame(ctx, x, y - 2 * s, 9 * s, 'gold', t, 2, { glow: 0.5 });
        break;
      }
      case 'lanternway': {
        ctx.save(); ctx.translate(x, y); ctx.scale(0.55 * s, 0.55 * s);
        UI.lanternGlyph(ctx, 0, 0, m.lit !== false, t, 4);
        ctx.restore();
        break;
      }
      case 'shop': {
        ctx.fillStyle = '#d9b860';
        ctx.beginPath(); ctx.ellipse(x, y + 3 * s, 6 * s, 2.4 * s, 0, 0, TAU); ctx.fill();
        ctx.fillStyle = '#ecd27c';
        ctx.beginPath(); ctx.ellipse(x, y, 6 * s, 2.4 * s, 0, 0, TAU); ctx.fill();
        ctx.fillStyle = '#b8963c';
        ctx.beginPath(); ctx.ellipse(x, y - 3 * s, 6 * s, 2.4 * s, 0, 0, TAU); ctx.fill();
        ctx.fillStyle = '#f4e3a4';
        ctx.beginPath(); ctx.ellipse(x, y - 3.4 * s, 4 * s, 1.4 * s, 0, 0, TAU); ctx.fill();
        break;
      }
      case 'npc': {
        ctx.fillStyle = '#d9cdb0';
        ctx.beginPath(); ctx.moveTo(x - 5 * s, y + 6 * s); ctx.quadraticCurveTo(x - 4 * s, y - 3 * s, x, y - 3 * s); ctx.quadraticCurveTo(x + 4 * s, y - 3 * s, x + 5 * s, y + 6 * s); ctx.closePath(); ctx.fill();
        UI.flame(ctx, x, y - 3 * s, 7 * s, 'orange', t, 5, { glow: 0.4 });
        break;
      }
      case 'door': {
        ctx.strokeStyle = '#e2c46c'; ctx.lineWidth = 1.5;
        ctx.beginPath(); ctx.moveTo(x - 5 * s, y + 6 * s); ctx.lineTo(x - 5 * s, y - 1 * s); ctx.arc(x, y - 1 * s, 5 * s, Math.PI, 0); ctx.lineTo(x + 5 * s, y + 6 * s); ctx.stroke();
        ctx.fillStyle = '#e2c46c';
        for (let i = 0; i < 3; i++) { ctx.beginPath(); ctx.arc(x - 2.5 * s + i * 2.5 * s, y + 1 * s, 0.9 * s, 0, TAU); ctx.fill(); }
        break;
      }
      case 'relic': {
        const k = 0.75 + 0.25 * Math.sin(t * 3 + x * 0.1);
        UI.glow(ctx, x, y, 14 * s, '#b49cff', 0.4 * k);
        if (UI.icons && UI.icons.moth) UI.icons.moth(ctx, x, y, 6 * s, '#d8c8ff', t);
        break;
      }
      case 'wisp': {
        UI.glow(ctx, x, y - 3, 14 * s, '#9aa0a8', 0.35);
        UI.flame(ctx, x, y + 5 * s, 14 * s, 'pale', t, 6, { glow: 0.5 });
        break;
      }
      case 'you': {
        UI.flame(ctx, x, y + 6 * s, 16 * s, 'blue', t, 7, { glow: 1 });
        break;
      }
    }
  }
  UI.mapMarker = drawMarker;

  // ------------------------------------------------------------------ screen
  UI.openMap = function () {
    if (UI.isOpen('map')) return UI.find('map');
    const p = P() || {};
    const rooms = collectRooms();
    const waymoth = !!(G.game && G.game.isEquipped && G.game.isEquipped('waymoth'));
    const flags = p.flags || {};
    // per-room render data
    for (const r of rooms) {
      r.img = roomCanvas(r.def, flags);
      r.color = regionColor(r.region);
      r.markers = markersFor(r, p, waymoth);
    }
    // bounds
    let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
    for (const r of rooms) { x0 = Math.min(x0, r.gx); y0 = Math.min(y0, r.gy); x1 = Math.max(x1, r.gx + r.cols); y1 = Math.max(y1, r.gy + r.rows); }
    // region labels (bounding box of visible rooms, label placed at its top center)
    const regions = new Map();
    for (const r of rooms) {
      let b = regions.get(r.region);
      if (!b) { b = { x0: Infinity, y0: Infinity, x1: -Infinity, y1: -Infinity, sx: 0, sy: 0, n: 0 }; regions.set(r.region, b); }
      b.x0 = Math.min(b.x0, r.gx); b.y0 = Math.min(b.y0, r.gy); b.x1 = Math.max(b.x1, r.gx + r.cols); b.y1 = Math.max(b.y1, r.gy + r.rows);
      b.sx += (r.gx + r.cols / 2) * r.cols * r.rows; b.sy += (r.gy + r.rows / 2) * r.cols * r.rows; b.n += r.cols * r.rows;
    }
    // player position (global tiles)
    let you = null, curId = null;
    const g = G.game;
    if (g && g.room && !(g.room.def && g.room.def.dev)) {
      curId = g.room.id;
      const pl = g.player;
      const cx = pl ? (pl.x + (pl.w || 26) / 2) : g.room.widthPx / 2, cy = pl ? (pl.y + (pl.h || 54) / 2) : g.room.heightPx / 2;
      you = { gx: g.room.gx + cx / TILE, gy: g.room.gy + cy / TILE, region: g.room.regionId };
    }
    const wisp = p.wisp && G.World.getRoom(p.wisp.room) && !G.World.getRoom(p.wisp.room).dev ? (() => { const info = G.World.roomInfo(p.wisp.room); return info ? { gx: info.gx + p.wisp.x / TILE, gy: info.gy + p.wisp.y / TILE } : null; })() : null;
    const center = you ? { x: you.gx, y: you.gy } : rooms.length ? { x: (x0 + x1) / 2, y: (y0 + y1) / 2 } : { x: 0, y: 0 };
    UI.sfx('map_open');
    return UI.push({
      name: 'map', fadeIn: 0.22, fadeOut: 0.18, hideHud: true,
      rooms, regions, you, curId, wisp, waymoth, bounds: { x0, y0, x1, y1 },
      cx: center.x, cy: center.y, zi: 1, zoom: ZOOMS[1], goal: null, framed: false,
      update(dt, active) {
        this.zoom += (ZOOMS[this.zi] - this.zoom) * Math.min(1, dt * 10);
        if (!active) return;
        // Back closes, but not when the same press is attack/spell (keyboard X, pad B): those re-centre below
        if (UI.pressedAny(['map', 'pause']) | UI.pressedBack(['attack', 'spell'])) { UI.sfx('menu_back'); UI.close(this); return; }
        const inp = G.input;
        const sp = 520 / this.zoom * dt;
        let pan = false;
        if (inp.down('left')) { this.cx -= sp; pan = true; }
        if (inp.down('right')) { this.cx += sp; pan = true; }
        if (inp.down('up')) { this.cy -= sp; pan = true; }
        if (inp.down('down')) { this.cy += sp; pan = true; }
        for (const d of ['left', 'right', 'up', 'down', 'interact']) inp.consume(d);
        if (pan) { this.goal = null; this.framed = false; }
        if (this.rooms.length) {
          const b = this.bounds, m = 20;
          this.cx = Math.max(b.x0 - m, Math.min(b.x1 + m, this.cx));
          this.cy = Math.max(b.y0 - m, Math.min(b.y1 + m, this.cy));
        }
        const zi0 = this.zi;
        if (UI.pressedAny(['jump', 'confirm'])) { this.zi = (this.zi + 1) % ZOOMS.length; UI.sfx('menu_move'); }
        if (UI.pressedAny(['dash'])) { this.zi = (this.zi + ZOOMS.length - 1) % ZOOMS.length; UI.sfx('menu_move'); }
        if (this.zi !== zi0 && this.rooms.length) {
          // a zoom at which the whole world fits frames it (glides to the bounds centre); zooming back in from
          // such an unpanned overview returns to the player
          const f = frameCenter(this.bounds, ZOOMS[this.zi], this.foot && this.foot.viewBot);
          if (f) { this.goal = f; this.framed = true; }
          else if (this.framed) { this.goal = this.you ? { x: this.you.gx, y: this.you.gy } : null; this.framed = false; }
        }
        if (UI.pressedAny(['attack', 'spell'])) { if (this.you) { this.cx = this.you.gx; this.cy = this.you.gy; this.goal = null; this.framed = false; UI.sfx('menu_move', { pitch: 1.2 }); } }
        if (this.goal) {
          const k = Math.min(1, dt * 9);
          this.cx += (this.goal.x - this.cx) * k; this.cy += (this.goal.y - this.cy) * k;
          if (Math.abs(this.goal.x - this.cx) < 0.05 && Math.abs(this.goal.y - this.cy) < 0.05) { this.cx = this.goal.x; this.cy = this.goal.y; this.goal = null; }
        }
      },
      draw(ctx, a) { drawMap(ctx, this); },
    });
  };

  function drawMap(ctx, s) {
    const out = ctx;
    const t = UI.t;
    if (!paper) buildPaper();
    ctx.drawImage(paper, 0, 0);
    const z = s.zoom;
    const ox = W / 2 - s.cx * z, oy = H / 2 - s.cy * z;
    const toX = (gx) => ox + gx * z, toY = (gy) => oy + gy * z;
    if (!s.rooms.length) {
      ctx.font = UI.font(24, 'italic');
      ctx.fillStyle = C.dim;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(UI.text('ui.mapEmpty', 'You have not yet walked or charted this place.'), W / 2, H / 2);
    }
    // footer layout, then the content layer (masked to the band between title and footer, see VIEW_TOP/FOOT*)
    const hints = [['up', UI.text('ui.mapPan', 'Pan'), '←↑→↓'], ['jump', UI.text('ui.zoom', 'Zoom')], ['dash', UI.text('ui.zoomOut', 'Zoom Out')]];
    if (s.you) hints.push(['attack', UI.text('ui.recenter', 'Recenter')]);
    hints.push(['map', UI.text('ui.close', 'Close')]);
    const hintW = UI.hintsWidth(ctx, hints, { size: 15 });
    const foot = s.foot = 40 + drawLegend(ctx, s, t, 0, true) + 30 <= W - 36 - hintW ? FOOT1 : FOOT2;
    if (!layer) layer = G.U.makeCanvas(W, H);
    ctx = layer.ctx;
    ctx.save();
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.globalAlpha = 1;
    ctx.globalCompositeOperation = 'source-over';
    ctx.clearRect(0, 0, W, H);
    ctx.imageSmoothingEnabled = true;
    // rooms
    for (const r of s.rooms) {
      const x = toX(r.gx), y = toY(r.gy), w = r.cols * z, h = r.rows * z;
      if (x > W || y > H || x + w < 0 || y + h < 0 || !r.img) continue;
      ctx.globalAlpha = r.visited ? 1 : 0.3;
      ctx.drawImage(r.img.canvas, x, y, w, h);
    }
    ctx.globalAlpha = 1;
    // current room highlight
    const cur = s.rooms.find((r) => r.id === s.curId);
    if (cur) {
      const x = toX(cur.gx), y = toY(cur.gy), w = cur.cols * z, h = cur.rows * z;
      const k = 0.55 + 0.25 * Math.sin(t * 2.4);
      ctx.fillStyle = 'rgba(140,200,255,' + (0.07 * k).toFixed(3) + ')';
      ctx.fillRect(x, y, w, h);
      ctx.strokeStyle = 'rgba(170,215,255,' + (0.6 * k).toFixed(3) + ')';
      ctx.lineWidth = 1.5;
      ctx.strokeRect(x - 2.5, y - 2.5, w + 5, h + 5);
    }
    // markers
    const ms = z < 1.8 ? 0.8 : z > 4 ? 1.15 : 1;
    for (const r of s.rooms) {
      for (const m of r.markers) {
        const x = toX(m.gx), y = toY(m.gy);
        if (x < -20 || y < -20 || x > W + 20 || y > H + 20) continue;
        ctx.globalAlpha = r.visited || m.kind === 'relic' ? 1 : 0.6;
        drawMarker(ctx, m, x, y, t, ms);
      }
    }
    ctx.globalAlpha = 1;
    if (s.wisp) drawMarker(ctx, { kind: 'wisp' }, toX(s.wisp.gx), toY(s.wisp.gy), t, ms);
    // region labels: centered on each region's area-weighted centroid (HK-style, over the rooms) with a dark halo
    // for legibility; overlapping labels are nudged apart vertically
    ctx.font = UI.font(z >= 3 ? 20 : 17, 'italic');
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    const placed = [];
    for (const [id, b] of s.regions) {
      const name = UI.regionName(id);
      if (!name || !b.n) continue;
      const lx = toX(b.sx / b.n);
      let ly = toY(b.sy / b.n);
      const hw = ctx.measureText(name).width / 2 + 6, hh = 13;
      for (let k = 1; k < 12; k++) {
        if (!placed.some((q) => Math.abs(q.x - lx) < q.hw + hw && Math.abs(q.y - ly) < q.hh + hh)) break;
        ly += (k % 2 ? 1 : -1) * k * hh;
      }
      placed.push({ x: lx, y: ly, hw, hh });
      if (lx < -hw || lx > W + hw || ly < -40 || ly > H + 40) continue;
      ctx.lineJoin = 'round';
      ctx.lineWidth = 5;
      ctx.strokeStyle = 'rgba(4,5,9,0.78)';
      ctx.strokeText(name, lx, ly);
      ctx.fillStyle = G.U.mix(regionColor(id), '#ece4cf', 0.6);
      ctx.fillText(name, lx, ly);
    }
    // player
    if (s.you) {
      const x = toX(s.you.gx), y = toY(s.you.gy);
      const ring = (t * 0.8) % 1;
      ctx.strokeStyle = 'rgba(150,210,255,' + (0.5 * (1 - ring)).toFixed(3) + ')';
      ctx.lineWidth = 1.5;
      ctx.beginPath(); ctx.arc(x, y, 6 + ring * 18, 0, TAU); ctx.stroke();
      drawMarker(ctx, { kind: 'you' }, x, y, t, 1);
    }
    ctx.globalAlpha = 1;
    ctx.globalCompositeOperation = 'destination-in';
    ctx.drawImage(maskFor(foot.viewBot), 0, 0);
    ctx.restore();
    ctx = out;
    ctx.drawImage(layer.canvas, 0, 0);
    // chrome: header, legend, hints
    const hg = ctx.createLinearGradient(0, 0, 0, 110);
    hg.addColorStop(0, 'rgba(4,5,8,0.92)'); hg.addColorStop(1, 'rgba(4,5,8,0)');
    ctx.fillStyle = hg;
    ctx.fillRect(0, 0, W, 110);
    const fg = ctx.createLinearGradient(0, H - 90, 0, H);
    fg.addColorStop(0, 'rgba(4,5,8,0)'); fg.addColorStop(1, 'rgba(4,5,8,0.95)');
    ctx.fillStyle = fg;
    ctx.fillRect(0, H - 90, W, 90);
    const title = s.you && s.you.region && s.you.region !== 'test' ? UI.regionName(s.you.region) : UI.text('ui.map', 'Map');
    ctx.font = UI.font(32);
    ctx.fillStyle = C.cream;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    UI.spacedText(ctx, title, W / 2, 44, 3, 'center');
    UI.flourish(ctx, W / 2, 78, 160, { alpha: 0.55 });
    drawLegend(ctx, s, t, foot.legY, false);
    UI.hints(ctx, hints, W - 36, foot.hintY, 'right', { alpha: 0.6, size: 15 });
    UI.vignette(ctx, 0.5);
  }

  /** Legend row at y (left-aligned from x=40); with measure, draws nothing. Returns the row width. */
  function drawLegend(ctx, s, t, y, measure) {
    const L = (k, fb) => UI.text('ui.mapLegend.' + k, fb);
    const items = [['you', L('you', 'You')], ['sconce', L('sconce', 'Sconce')], ['lanternway', L('lanternway', 'Lanternway')], ['shop', L('shop', 'Merchant')], ['npc', L('npc', 'Traveler')]];
    if (s.waymoth) items.push(['relic', L('relic', 'Unclaimed Relic')]);
    if (s.rooms.some((r) => r.markers.some((m) => m.kind === 'door'))) items.push(['door', L('door', 'Seal Door')]);
    if (s.wisp) items.push(['wisp', L('wisp', 'Gutterwisp')]);
    let x = 40;
    ctx.font = UI.font(15);
    if (measure) {
      for (const [, label] of items) x += 22 + ctx.measureText(label).width + 26;
      return x - 26 - 40;
    }
    for (const [kind, label] of items) {
      drawMarker(ctx, { kind, lit: true }, x + 8, y - (kind === 'you' ? 4 : 0), t, 0.9);
      ctx.fillStyle = C.creamDim;
      ctx.textAlign = 'left';
      ctx.textBaseline = 'middle';
      ctx.font = UI.font(15);
      ctx.fillText(label, x + 22, y + 1);
      x += 22 + ctx.measureText(label).width + 26;
    }
  }

  /** Drop cached minimaps (e.g. after rooms are redefined by tools). */
  UI.clearMapCache = () => cache.clear();
})();
