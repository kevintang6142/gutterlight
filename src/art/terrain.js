// src/art/terrain.js — terrain beautifier: smooth organic contours traced from the tile grid,
// exact distance-field shading (edge band, directional rim light, depth), region textures and
// surface dressing, spikes, one-way platforms, glazed walls, BG walls, liquids and breakables.
// Static parts are prerendered into 512 px chunk canvases (blitted at snapped integer offsets).
(function () {
  'use strict';
  const G = globalThis.G;
  const Art = G.Art;
  const U = Art.util;
  const { clamp, lerp, smooth, hashInt, h01, noise1, noise2, fbm2, mix, rgba, rgb, makeCanvas, freeCanvas } = U;
  const T = Art.TILE;
  const { EMPTY, SOLID, GLAZED, PLATFORM, SPIKES, WATER, LAVA, BREAKABLE, DIVEFLOOR, BGWALL } = Art.TC;
  const CHUNK = 512;
  const M = 3; // extended-grid margin in tiles (outside the room: clamped tiles)
  const FC = 5; // distance-field cell size in px
  const CM = 64; // chunk overdraw margin in px
  const INIT_BUDGET_MS = 30; // prepareRoom chunk budget (~20 chunks, > a full view + margin); the rest renders lazily
  const isSolid = (v) => v === SOLID || v === GLAZED || v === BREAKABLE || v === DIVEFLOOR;
  const DX = [1, 0, -1, 0], DY = [0, 1, 0, -1];
  const NX = [0, 1, 0, -1], NY = [-1, 0, 1, 0]; // outward (air-side) normal per walking direction

  const Terrain = (Art.Terrain = {});

  // ---------------------------------------------------------------------------------------------
  // Style
  const DEFAULT_STYLE = {
    texture: { type: 'noise' },
    texStrength: 1,
    bandWidth: 16, // px: lighter edge band fading into the fill
    rimWidth: 9, rim: 0.85, rimSide: 0.22, rimBottom: 0.06, light: [0, -1],
    deep: 0.86, deepStart: 14, deepEnd: 120, blotch: 0.14, blotchScale: 70,
    amp: { floor: 1.1, wall: 2.6, ceil: 4 },
    radius: { convex: 19, concave: 15, floorConvex: 7, floorConcave: 5, glazed: 9 },
    maxDev: { wall: 6, ceil: 12 }, smooth: 18,
    topLine: { alpha: 0.8, width: 2 },
    sideLine: { alpha: 0.22, width: 1.2 },
    aura: { alpha: 0.38, width: 30, floor: 0.2 },
    floor: [], ceiling: [], wall: [],
    spikes: 'iron', platform: 'wood',
    glaze: {}, lavaGlow: 0.6, breakable: {}, dive: {},
  };
  function styleOf(cache) {
    const s = Object.assign({}, DEFAULT_STYLE, cache.cfg.terrain || {});
    s.amp = Object.assign({}, DEFAULT_STYLE.amp, (cache.cfg.terrain || {}).amp || {});
    s.radius = Object.assign({}, DEFAULT_STYLE.radius, (cache.cfg.terrain || {}).radius || {});
    s.maxDev = Object.assign({}, DEFAULT_STYLE.maxDev, (cache.cfg.terrain || {}).maxDev || {});
    s.topLine = Object.assign({}, DEFAULT_STYLE.topLine, (cache.cfg.terrain || {}).topLine || {});
    s.sideLine = Object.assign({}, DEFAULT_STYLE.sideLine, (cache.cfg.terrain || {}).sideLine || {});
    s.aura = Object.assign({}, DEFAULT_STYLE.aura, (cache.cfg.terrain || {}).aura || {});
    const th = cache.theme || {};
    if (th.dressing === 0 || th.dressing === false) { s.floor = []; s.ceiling = []; s.wall = []; }
    return s;
  }

  // ---------------------------------------------------------------------------------------------
  // Textures: grayscale tiles centred on mid-grey, applied with 'overlay' (modulates luminance in
  // proportion to the base, so deep fill stays dark and the lit edge band shows the texture).
  const texCache = new Map();
  const TEX = (Terrain.tex = {});
  function texBase(ctx, S) { ctx.fillStyle = '#808080'; ctx.fillRect(0, 0, S, S); }
  function noiseLayer(ctx, S, seed, scale, amp, oct) {
    const img = ctx.getImageData(0, 0, S, S), d = img.data;
    const p = Math.max(1, Math.round(S / scale));
    for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) {
      const n = fbm2((x / S) * p, (y / S) * p, seed, oct || 4, p, p);
      const i = (y * S + x) * 4, v = n * amp * 255;
      d[i] = clamp(d[i] + v, 0, 255); d[i + 1] = clamp(d[i + 1] + v, 0, 255); d[i + 2] = clamp(d[i + 2] + v, 0, 255);
    }
    ctx.putImageData(img, 0, 0);
  }
  // Draw something at (x,y) and its wrapped copies so the tile is seamless.
  function wrapDraw(S, x, y, r, fn) {
    for (let ox = -S; ox <= S; ox += S) for (let oy = -S; oy <= S; oy += S) {
      if (x + ox + r < 0 || x + ox - r > S || y + oy + r < 0 || y + oy - r > S) continue;
      fn(x + ox, y + oy);
    }
  }
  TEX.noise = function (ctx, S, rng, o) {
    texBase(ctx, S);
    noiseLayer(ctx, S, rng.int(1, 1e6), o.scale || 48, o.amp || 0.22, 4);
    speckle(ctx, S, rng, o.speckle === undefined ? 260 : o.speckle);
  };
  function speckle(ctx, S, rng, n) {
    for (let i = 0; i < n; i++) {
      const x = rng.next() * S, y = rng.next() * S, r = rng.range(0.6, 2.2);
      ctx.fillStyle = rng.chance(0.5) ? 'rgba(255,255,255,0.18)' : 'rgba(0,0,0,0.25)';
      wrapDraw(S, x, y, r, (px, py) => { ctx.beginPath(); ctx.arc(px, py, r, 0, Math.PI * 2); ctx.fill(); });
    }
  }
  TEX.bricks = function (ctx, S, rng, o) {
    texBase(ctx, S);
    const bw = o.w || 40, bh = o.h || 20, mortar = o.mortar === undefined ? 2 : o.mortar;
    const rows = Math.round(S / bh), cols = Math.round(S / bw);
    for (let r = 0; r < rows; r++) {
      const off = (r % 2) * bw * 0.5 + (o.jitter ? rng.range(-4, 4) : 0);
      for (let c = 0; c <= cols; c++) {
        const x = c * bw + off, y = r * bh;
        const v = rng.range(-0.16, 0.16) + (rng.chance(0.08) ? -0.2 : 0);
        const g = clamp(128 + v * 255, 0, 255) | 0;
        ctx.fillStyle = 'rgb(' + g + ',' + g + ',' + g + ')';
        const w = bw - mortar, h = bh - mortar;
        wrapDraw(S, x + w / 2, y + h / 2, bw, (px, py) => {
          const x0 = px - w / 2, y0 = py - h / 2;
          ctx.fillRect(x0, y0, w, h);
          ctx.fillStyle = 'rgba(255,255,255,0.20)'; ctx.fillRect(x0, y0, w, 1.5);
          ctx.fillStyle = 'rgba(0,0,0,0.22)'; ctx.fillRect(x0, y0 + h - 1.5, w, 1.5);
          ctx.fillStyle = 'rgb(' + g + ',' + g + ',' + g + ')';
        });
        if (rng.chance(o.chips === undefined ? 0.25 : o.chips)) { // chipped corner
          ctx.fillStyle = 'rgba(0,0,0,0.35)';
          const cx = x + (rng.chance(0.5) ? 0 : w), cy = y + (rng.chance(0.5) ? 0 : h);
          wrapDraw(S, cx, cy, 6, (px, py) => { ctx.beginPath(); ctx.arc(px, py, rng.range(2, 5), 0, Math.PI * 2); ctx.fill(); });
        }
      }
    }
    // mortar darker
    ctx.globalCompositeOperation = 'destination-over';
    ctx.fillStyle = '#3c3c3c'; ctx.fillRect(0, 0, S, S);
    ctx.globalCompositeOperation = 'source-over';
    noiseLayer(ctx, S, rng.int(1, 1e6), o.noiseScale || 40, o.noise || 0.12, 3);
    speckle(ctx, S, rng, 120);
  };
  TEX.rock = function (ctx, S, rng, o) { // fractured stone: blotches, strata hints, cracks, pits
    texBase(ctx, S);
    noiseLayer(ctx, S, rng.int(1, 1e6), o.scale || 64, o.amp || 0.2, 4);
    for (let i = 0; i < (o.blobs || 40); i++) {
      const x = rng.next() * S, y = rng.next() * S, rx = rng.range(8, 30), ry = rx * rng.range(0.35, 0.8), a = rng.range(-0.4, 0.4);
      ctx.fillStyle = rng.chance(0.5) ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.12)';
      wrapDraw(S, x, y, rx, (px, py) => { ctx.beginPath(); ctx.ellipse(px, py, rx, ry, a, 0, Math.PI * 2); ctx.fill(); });
    }
    crackLines(ctx, S, rng, o.cracks === undefined ? 18 : o.cracks, 'rgba(0,0,0,0.42)');
    crackLines(ctx, S, rng, Math.round((o.cracks === undefined ? 18 : o.cracks) * 0.5), 'rgba(255,255,255,0.14)');
    speckle(ctx, S, rng, o.speckle === undefined ? 200 : o.speckle);
    if (o.courses) { // faint masonry courses
      ctx.fillStyle = 'rgba(0,0,0,' + o.courses + ')';
      for (let y = 0; y < S; y += o.courseH || 20) {
        ctx.fillRect(0, y, S, 1.2);
        const bw = o.courseW || 40, off = ((y / (o.courseH || 20)) % 2) * bw * 0.5;
        for (let x = off; x < S; x += bw) ctx.fillRect(x, y, 1.2, o.courseH || 20);
      }
    }
  };
  TEX.blocks = function (ctx, S, rng, o) { // large ashlar blocks with bevels
    texBase(ctx, S);
    const bh = o.h || 40;
    const rows = Math.round(S / bh);
    for (let r = 0; r < rows; r++) {
      let x = rng.range(0, 30);
      const y = r * bh;
      const start = x;
      while (x < S + start) {
        const w = rng.range(o.minW || 50, o.maxW || 110);
        const ww = Math.min(w, S + start - x);
        const g = (128 + rng.range(-22, 22)) | 0;
        wrapDraw(S, x + ww / 2, y + bh / 2, Math.max(ww, bh), (px, py) => {
          const x0 = px - ww / 2, y0 = py - bh / 2;
          ctx.fillStyle = 'rgb(' + g + ',' + g + ',' + g + ')'; ctx.fillRect(x0 + 1, y0 + 1, ww - 2, bh - 2);
          ctx.fillStyle = 'rgba(255,255,255,0.22)'; ctx.fillRect(x0 + 1, y0 + 1, ww - 2, 2);
          ctx.fillStyle = 'rgba(255,255,255,0.10)'; ctx.fillRect(x0 + 1, y0 + 1, 2, bh - 2);
          ctx.fillStyle = 'rgba(0,0,0,0.28)'; ctx.fillRect(x0 + 1, y0 + bh - 3, ww - 2, 2);
        });
        x += w;
      }
    }
    ctx.globalCompositeOperation = 'destination-over';
    ctx.fillStyle = '#383838'; ctx.fillRect(0, 0, S, S);
    ctx.globalCompositeOperation = 'source-over';
    noiseLayer(ctx, S, rng.int(1, 1e6), 32, o.noise || 0.1, 3);
    crackLines(ctx, S, rng, o.cracks === undefined ? 6 : o.cracks, 'rgba(0,0,0,0.3)');
  };
  TEX.plates = function (ctx, S, rng, o) { // riveted metal plates
    texBase(ctx, S);
    const pw = o.w || 80, ph = o.h || 60;
    for (let y = 0; y < S; y += ph) for (let x = 0; x < S; x += pw) {
      const g = (128 + rng.range(-18, 18)) | 0;
      ctx.fillStyle = 'rgb(' + g + ',' + g + ',' + g + ')';
      ctx.fillRect(x + 1, y + 1, pw - 2, ph - 2);
      ctx.fillStyle = 'rgba(255,255,255,0.2)'; ctx.fillRect(x + 1, y + 1, pw - 2, 1.5);
      ctx.fillStyle = 'rgba(0,0,0,0.3)'; ctx.fillRect(x + 1, y + ph - 2.5, pw - 2, 1.5);
      for (const [rx, ry] of [[6, 6], [pw - 6, 6], [6, ph - 6], [pw - 6, ph - 6], [pw / 2, 6], [pw / 2, ph - 6]]) {
        ctx.fillStyle = 'rgba(0,0,0,0.35)'; ctx.beginPath(); ctx.arc(x + rx + 0.6, y + ry + 0.6, 2.3, 0, 7); ctx.fill();
        ctx.fillStyle = 'rgba(255,255,255,0.35)'; ctx.beginPath(); ctx.arc(x + rx - 0.4, y + ry - 0.4, 1.6, 0, 7); ctx.fill();
      }
      // rust streaks
      for (let k = 0; k < 3; k++) {
        if (!rng.chance(0.5)) continue;
        const sx = x + rng.range(8, pw - 8), sy = y + rng.range(4, ph * 0.5);
        const grd = ctx.createLinearGradient(sx, sy, sx, sy + ph * 0.6);
        grd.addColorStop(0, 'rgba(0,0,0,0.25)'); grd.addColorStop(1, 'rgba(0,0,0,0)');
        ctx.fillStyle = grd; ctx.fillRect(sx, sy, rng.range(2, 5), ph * 0.6);
      }
    }
    ctx.globalCompositeOperation = 'destination-over';
    ctx.fillStyle = '#2c2c2c'; ctx.fillRect(0, 0, S, S);
    ctx.globalCompositeOperation = 'source-over';
    noiseLayer(ctx, S, rng.int(1, 1e6), 24, o.noise || 0.1, 3);
  };
  TEX.strata = function (ctx, S, rng, o) { // horizontal sediment bands (ash/soot/silt)
    texBase(ctx, S);
    const img = ctx.getImageData(0, 0, S, S), d = img.data;
    const seed = rng.int(1, 1e6), p = Math.round(S / 64);
    const bands = o.bands || 9;
    for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) {
      const warp = fbm2((x / S) * p, (y / S) * p, seed, 3, p, p) * (o.warp || 0.9);
      const b = Math.sin(((y / S) + warp * 0.12) * Math.PI * 2 * bands);
      const n = fbm2((x / S) * p * 4, (y / S) * p * 8, seed + 7, 3, p * 4, p * 8);
      const v = (b * 0.13 + n * 0.12) * 255;
      const i = (y * S + x) * 4;
      d[i] = d[i + 1] = d[i + 2] = clamp(128 + v, 0, 255);
    }
    ctx.putImageData(img, 0, 0);
    speckle(ctx, S, rng, o.speckle === undefined ? 300 : o.speckle);
  };
  TEX.fibers = function (ctx, S, rng, o) { // vertical fibrous grain (bark, silk, reeds)
    texBase(ctx, S);
    noiseLayer(ctx, S, rng.int(1, 1e6), 64, 0.1, 3);
    for (let i = 0; i < (o.count || 220); i++) {
      const x = rng.next() * S, y = rng.next() * S, len = rng.range(20, 90), w = rng.range(0.6, 1.8);
      ctx.strokeStyle = rng.chance(0.5) ? 'rgba(255,255,255,0.16)' : 'rgba(0,0,0,0.24)';
      ctx.lineWidth = w;
      const bend = rng.range(-6, 6);
      wrapDraw(S, x, y, len, (px, py) => {
        ctx.beginPath(); ctx.moveTo(px, py); ctx.quadraticCurveTo(px + bend, py + len / 2, px + bend * 0.3, py + len); ctx.stroke();
      });
    }
  };
  TEX.facets = function (ctx, S, rng, o) { // crystal facets (Voronoi-ish shards)
    texBase(ctx, S);
    const n = o.count || 34, pts = [];
    for (let i = 0; i < n; i++) pts.push([rng.next() * S, rng.next() * S, rng.range(-0.25, 0.25)]);
    const img = ctx.getImageData(0, 0, S, S), d = img.data;
    for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) {
      let b1 = 1e9, b2 = 1e9, bi = 0;
      for (let k = 0; k < n; k++) {
        let dx = Math.abs(x - pts[k][0]), dy = Math.abs(y - pts[k][1]);
        if (dx > S / 2) dx = S - dx; if (dy > S / 2) dy = S - dy;
        const q = dx * dx + dy * dy;
        if (q < b1) { b2 = b1; b1 = q; bi = k; } else if (q < b2) b2 = q;
      }
      const edge = Math.sqrt(b2) - Math.sqrt(b1);
      let v = pts[bi][2] * 255 + (x - pts[bi][0]) * 0.25;
      if (edge < 1.6) v += 70; else if (edge < 3) v -= 30;
      const i = (y * S + x) * 4;
      d[i] = d[i + 1] = d[i + 2] = clamp(128 + v, 0, 255);
    }
    ctx.putImageData(img, 0, 0);
  };
  TEX.ice = function (ctx, S, rng, o) {
    texBase(ctx, S);
    noiseLayer(ctx, S, rng.int(1, 1e6), 90, 0.16, 3);
    crackLines(ctx, S, rng, o.cracks || 14, 'rgba(255,255,255,0.35)');
    for (let i = 0; i < 40; i++) { // trapped bubbles
      const x = rng.next() * S, y = rng.next() * S, r = rng.range(1, 3.5);
      ctx.strokeStyle = 'rgba(255,255,255,0.3)'; ctx.lineWidth = 0.8;
      wrapDraw(S, x, y, r, (px, py) => { ctx.beginPath(); ctx.arc(px, py, r, 0, 7); ctx.stroke(); });
    }
  };
  TEX.wax = function (ctx, S, rng, o) { // smooth wax with drip veins & pocks
    texBase(ctx, S);
    noiseLayer(ctx, S, rng.int(1, 1e6), 80, 0.14, 3);
    for (let i = 0; i < (o.veins || 40); i++) {
      const x = rng.next() * S, y = rng.next() * S, len = rng.range(16, 60), w = rng.range(2, 6);
      wrapDraw(S, x, y, len + w, (px, py) => {
        const g = ctx.createLinearGradient(px, py, px, py + len);
        g.addColorStop(0, 'rgba(255,255,255,0.14)'); g.addColorStop(1, 'rgba(255,255,255,0)');
        ctx.fillStyle = g;
        ctx.beginPath(); ctx.moveTo(px - w / 2, py); ctx.lineTo(px + w / 2, py);
        ctx.quadraticCurveTo(px + w * 0.4, py + len * 0.8, px, py + len); ctx.quadraticCurveTo(px - w * 0.4, py + len * 0.8, px - w / 2, py);
        ctx.fill();
      });
    }
    speckle(ctx, S, rng, 160);
  };
  TEX.cobble = function (ctx, S, rng, o) { // rounded stones
    texBase(ctx, S);
    ctx.fillStyle = '#4a4a4a'; ctx.fillRect(0, 0, S, S);
    const n = o.count || 70;
    for (let i = 0; i < n; i++) {
      const x = rng.next() * S, y = rng.next() * S, rx = rng.range(10, 22), ry = rx * rng.range(0.6, 0.9);
      const g = (120 + rng.range(-20, 25)) | 0;
      wrapDraw(S, x, y, rx + 2, (px, py) => {
        ctx.fillStyle = 'rgb(' + g + ',' + g + ',' + g + ')';
        ctx.beginPath(); ctx.ellipse(px, py, rx, ry, rng.range(-0.3, 0.3), 0, 7); ctx.fill();
        ctx.fillStyle = 'rgba(255,255,255,0.18)';
        ctx.beginPath(); ctx.ellipse(px - rx * 0.2, py - ry * 0.35, rx * 0.6, ry * 0.35, 0, 0, 7); ctx.fill();
      });
    }
    noiseLayer(ctx, S, rng.int(1, 1e6), 32, 0.08, 3);
  };
  function crackLines(ctx, S, rng, n, color) {
    ctx.strokeStyle = color; ctx.lineCap = 'round';
    for (let i = 0; i < n; i++) {
      let x = rng.next() * S, y = rng.next() * S, a = rng.range(0, Math.PI * 2);
      const segs = rng.int(3, 7);
      ctx.lineWidth = rng.range(0.7, 1.5);
      const pts = [[x, y]];
      for (let k = 0; k < segs; k++) { a += rng.range(-0.8, 0.8); x += Math.cos(a) * rng.range(5, 14); y += Math.sin(a) * rng.range(5, 14); pts.push([x, y]); }
      for (let ox = -S; ox <= S; ox += S) for (let oy = -S; oy <= S; oy += S) {
        ctx.beginPath(); ctx.moveTo(pts[0][0] + ox, pts[0][1] + oy);
        for (let k = 1; k < pts.length; k++) ctx.lineTo(pts[k][0] + ox, pts[k][1] + oy);
        ctx.stroke();
      }
    }
  }
  Terrain.crackLines = crackLines;
  function textureFor(cache) {
    const cfg = cache.cfg, spec = (cfg.terrain && cfg.terrain.texture) || { type: 'noise' };
    const key = cfg.id;
    let t = texCache.get(key);
    if (t) return t;
    const S = spec.size || 256;
    const { canvas, ctx } = makeCanvas(S, S);
    const rng = new U.Rng(U.hashStr('tex:' + cfg.id));
    try {
      if (typeof spec === 'function') { texBase(ctx, S); spec(ctx, S, rng, U); }
      else (TEX[spec.type] || TEX.noise)(ctx, S, rng, spec);
      if (spec.extra) spec.extra(ctx, S, rng, U);
    } catch (e) { Art.report(e, 'terrain.texture:' + cfg.id); texBase(ctx, S); }
    t = { canvas, pattern: ctx.createPattern(canvas, 'repeat') };
    texCache.set(key, t);
    return t;
  }

  // ---------------------------------------------------------------------------------------------
  // Grid (extended by M tiles on every side; outside tiles are clamped copies of the edge tiles).
  function buildGrid(room, cache) {
    const cols = room.cols, rows = room.rows, ex = cols + 2 * M, ey = rows + 2 * M;
    const code = new Uint8Array(ex * ey);
    const tiles = room.tiles;
    const th = cache.theme || {};
    const openTop = th.openTop !== undefined ? !!th.openTop : th.bg === 'sky';
    const lid = new Uint8Array(cols);
    if (openTop && rows > 1) for (let c = 0; c < cols; c++) lid[c] = isSolid(tiles[c]) && !isSolid(tiles[cols + c]) ? 1 : 0;
    for (let y = 0; y < ey; y++) {
      const r = clamp(y - M, 0, rows - 1);
      for (let x = 0; x < ex; x++) {
        const c = clamp(x - M, 0, cols - 1);
        let v = tiles[r * cols + c];
        if (v > 9) v = EMPTY;
        if (openTop && y - M <= 0 && lid[c]) v = EMPTY;
        code[y * ex + x] = v;
      }
    }
    return { ex, ey, cols, rows, code };
  }
  const gcode = (g, x, y) => (x < 0 || y < 0 || x >= g.ex || y >= g.ey ? EMPTY : g.code[y * g.ex + x]);

  // ---------------------------------------------------------------------------------------------
  // Contours: trace tile-edge loops (solid on the right), then round corners and add gentle noise.
  function traceLoops(mask, ex, ey) {
    const W = ex + 1;
    const has = new Uint8Array(W * (ey + 1) * 4);
    const S = (x, y) => x >= 0 && y >= 0 && x < ex && y < ey && mask[y * ex + x] === 1;
    for (let y = 0; y < ey; y++) for (let x = 0; x < ex; x++) {
      if (mask[y * ex + x] !== 1) continue;
      if (!S(x, y - 1)) has[(y * W + x) * 4] = 1;
      if (!S(x + 1, y)) has[(y * W + x + 1) * 4 + 1] = 1;
      if (!S(x, y + 1)) has[((y + 1) * W + x + 1) * 4 + 2] = 1;
      if (!S(x - 1, y)) has[((y + 1) * W + x) * 4 + 3] = 1;
    }
    const loops = [];
    for (let e = 0; e < has.length; e++) {
      if (!has[e]) continue;
      const sv = e >> 2, sd = e & 3;
      const vx = [], vy = [], dir = [];
      let v = sv, d = sd, guard = has.length;
      has[e] = 0;
      while (guard-- > 0) {
        const x = v % W, y = (v / W) | 0;
        vx.push(x); vy.push(y); dir.push(d);
        const nv = (y + DY[d]) * W + (x + DX[d]);
        let nd = -1;
        for (const turn of [1, 0, 3]) { // right turn first → 4-connected solids
          const cd = (d + turn) & 3;
          if (has[nv * 4 + cd] || (nv === sv && cd === sd)) { nd = cd; break; }
        }
        if (nd < 0) break;
        if (nv === sv && nd === sd) break; // closed
        has[nv * 4 + nd] = 0;
        v = nv; d = nd;
      }
      if (vx.length >= 4) loops.push({ vx, vy, dir });
    }
    return loops;
  }

  // Solid and air tile codes on either side of a unit edge (in extended-grid coords).
  function edgeCells(x, y, d) {
    switch (d) {
      case 0: return [x, y, x, y - 1];
      case 1: return [x - 1, y, x, y];
      case 2: return [x - 1, y - 1, x - 1, y];
      default: return [x, y - 1, x - 1, y - 1];
    }
  }

  function flattenLoop(raw, g, st, seed) {
    const n = raw.vx.length;
    // rotate so the loop starts at a corner
    let s0 = 0;
    for (let i = 0; i < n; i++) if (raw.dir[i] !== raw.dir[(i + n - 1) % n]) { s0 = i; break; }
    const vx = new Int32Array(n), vy = new Int32Array(n), dir = new Uint8Array(n), mat = new Uint8Array(n), adj = new Uint8Array(n);
    for (let i = 0; i < n; i++) {
      const k = (i + s0) % n;
      vx[i] = raw.vx[k]; vy[i] = raw.vy[k]; dir[i] = raw.dir[k];
      const ec = edgeCells(vx[i], vy[i], dir[i]);
      mat[i] = gcode(g, ec[0], ec[1]);
      adj[i] = gcode(g, ec[2], ec[3]);
    }
    const segs = [];
    for (let i = 0; i < n;) {
      let j = i;
      while (j + 1 < n && dir[j + 1] === dir[i]) j++;
      segs.push({ i0: i, cnt: j - i + 1, d: dir[i] });
      i = j + 1;
    }
    const ns = segs.length;
    const off = -M * T;
    // ---- 1. cornered polyline (no noise). pin: 1 = must not move (walkable floors, glazed faces)
    const P = { x: [], y: [], nx: [], ny: [], mat: [], adj: [], pin: [], dev: [] };
    const push = (x, y, nx, ny, m, a, pin, dev) => { P.x.push(x); P.y.push(y); P.nx.push(nx); P.ny.push(ny); P.mat.push(m); P.adj.push(a); P.pin.push(pin); P.dev.push(dev); };
    const DEV = [0, st.maxDev.wall, st.maxDev.ceil, st.maxDev.wall];
    const rIn = new Float32Array(ns), rOut = new Float32Array(ns);
    const legFor = (seg, convex, glazed, h) => {
      if (glazed) return convex ? st.radius.glazed : 4;
      if (seg.d === 0) return convex ? st.radius.floorConvex : st.radius.floorConcave;
      return (convex ? st.radius.convex : st.radius.concave) * (0.8 + 0.4 * h);
    };
    for (let s = 0; s < ns; s++) {
      const prev = segs[(s + ns - 1) % ns], cur = segs[s];
      const convex = cur.d === ((prev.d + 1) & 3);
      const glazed = mat[cur.i0] === GLAZED || mat[prev.i0 + prev.cnt - 1] === GLAZED;
      const h = h01(vx[cur.i0], vy[cur.i0], seed + 5);
      rIn[s] = legFor(prev, convex, glazed, h);
      rOut[s] = legFor(cur, convex, glazed, h);
    }
    for (let s = 0; s < ns; s++) { // neighbouring corners never overlap
      const L = segs[s].cnt * T, nxt = (s + 1) % ns, a = rOut[s], b = rIn[nxt];
      if (a + b > L - 1) { const k = (L - 1) / (a + b); rOut[s] = a * k; rIn[nxt] = b * k; }
    }
    for (let s = 0; s < ns; s++) {
      const prev = segs[(s + ns - 1) % ns], cur = segs[s];
      const px = vx[cur.i0] * T + off, py = vy[cur.i0] * T + off;
      const dIn = prev.d, dOut = cur.d, ri = rIn[s], ro = rOut[s];
      const ax = px - DX[dIn] * ri, ay = py - DY[dIn] * ri, bx = px + DX[dOut] * ro, by = py + DY[dOut] * ro;
      const big = Math.max(ri, ro);
      const steps = big > 12 ? 6 : big > 6 ? 4 : big > 1 ? 2 : 1;
      const mA = mat[prev.i0 + prev.cnt - 1], aA = adj[prev.i0 + prev.cnt - 1], mB = mat[cur.i0], aB = adj[cur.i0];
      const gA = mA === GLAZED, gB = mB === GLAZED;
      for (let k = 0; k <= steps; k++) {
        if (big <= 0.01 && k > 0) break;
        const t = k / steps, it = 1 - t;
        const x = it * it * ax + 2 * it * t * px + t * t * bx, y = it * it * ay + 2 * it * t * py + t * t * by;
        let tx = 2 * it * (px - ax) + 2 * t * (bx - px), ty = 2 * it * (py - ay) + 2 * t * (by - py);
        const tl = Math.hypot(tx, ty);
        if (tl < 1e-6) { tx = DX[dOut]; ty = DY[dOut]; } else { tx /= tl; ty /= tl; }
        const useB = t > 0.5;
        const pin = Math.max(dIn === 0 ? 1 - t : 0, dOut === 0 ? t : 0, (gA && !useB) || (gB && useB) ? 1 : 0);
        push(x, y, ty, -tx, useB ? mB : mA, useB ? aB : aA, pin, Math.min(DEV[dIn], DEV[dOut]) || Math.max(DEV[dIn], DEV[dOut]));
      }
      const L = cur.cnt * T, sA = ro, sB = L - rIn[(s + 1) % ns], len = sB - sA;
      if (len > 2) {
        const nSteps = Math.max(1, Math.round(len / 8));
        const d = cur.d;
        for (let k = 1; k < nSteps; k++) {
          const sPos = sA + (len * k) / nSteps;
          const ui = clamp(Math.floor(sPos / T), 0, cur.cnt - 1);
          const m = mat[cur.i0 + ui];
          push(px + DX[d] * sPos, py + DY[d] * sPos, NX[d], NY[d], m, adj[cur.i0 + ui], d === 0 || m === GLAZED ? 1 : 0, DEV[d]);
        }
      }
    }
    const cnt = P.x.length;
    const xs = new Float32Array(P.x), ys = new Float32Array(P.y), nxs = new Float32Array(P.nx), nys = new Float32Array(P.ny);
    const pin = new Float32Array(P.pin), dev = new Float32Array(P.dev);
    // soften pins outward along the polyline so floor ends blend into smoothed walls
    for (let pass = 0; pass < 2; pass++) {
      const cp = Float32Array.from(pin);
      for (let i = 0; i < cnt; i++) {
        const a = cp[(i + cnt - 1) % cnt], b = cp[(i + 1) % cnt];
        pin[i] = Math.max(cp[i], Math.max(a, b) * 0.6);
      }
    }
    // ---- 2. constrained Laplacian smoothing: staircases on walls/ceilings become organic curves
    const ox = Float32Array.from(xs), oy = Float32Array.from(ys);
    const tx = new Float32Array(cnt), ty = new Float32Array(cnt);
    const iters = st.smooth;
    for (let it = 0; it < iters; it++) {
      for (let i = 0; i < cnt; i++) {
        const a = (i + cnt - 1) % cnt, b = (i + 1) % cnt;
        const w = (1 - pin[i]) * 0.5;
        tx[i] = xs[i] + w * ((xs[a] + xs[b]) * 0.5 - xs[i]);
        ty[i] = ys[i] + w * ((ys[a] + ys[b]) * 0.5 - ys[i]);
      }
      for (let i = 0; i < cnt; i++) {
        let dx = tx[i] - ox[i], dy = ty[i] - oy[i];
        const dl = Math.hypot(dx, dy), md = dev[i] * (1 - pin[i]);
        if (dl > md) { const k = md / (dl || 1); dx *= k; dy *= k; }
        xs[i] = ox[i] + dx; ys[i] = oy[i] + dy;
      }
    }
    // ---- 3. normals from geometry (except pinned floor runs, which stay exactly up)
    for (let i = 0; i < cnt; i++) {
      if (pin[i] >= 0.999 && nys[i] < -0.99) continue;
      const a = (i + cnt - 1) % cnt, b = (i + 1) % cnt;
      let ttx = xs[b] - xs[a], tty = ys[b] - ys[a];
      const tl = Math.hypot(ttx, tty);
      if (tl < 1e-6) continue;
      ttx /= tl; tty /= tl;
      nxs[i] = tty; nys[i] = -ttx;
    }
    // ---- 4. organic noise along the normal (continuous 2D field; floors only a whisper)
    for (let i = 0; i < cnt; i++) {
      if (P.mat[i] === GLAZED) continue;
      const x = ox[i], y = oy[i], ny = nys[i];
      const n = noise2(x / 38, y / 38, seed) * 0.72 + noise2(x / 14, y / 14, seed + 1) * 0.28;
      let amp;
      if (pin[i] >= 0.999) amp = st.amp.floor;
      else amp = (ny < 0 ? lerp(st.amp.wall, st.amp.floor, -ny) : lerp(st.amp.wall, st.amp.ceil, ny)) * (1 - pin[i] * 0.85);
      let disp = n * amp;
      if (ny < -0.9) disp = clamp(disp, -2.5, 1.2);
      xs[i] += nxs[i] * disp; ys[i] += nys[i] * disp;
    }
    const loop = { n: cnt, xs, ys, nx: nxs, ny: nys, mat: new Uint8Array(P.mat), adj: new Uint8Array(P.adj), x0: 1e9, y0: 1e9, x1: -1e9, y1: -1e9 };
    for (let i = 0; i < cnt; i++) {
      const x = xs[i], y = ys[i];
      if (x < loop.x0) loop.x0 = x; if (x > loop.x1) loop.x1 = x;
      if (y < loop.y0) loop.y0 = y; if (y > loop.y1) loop.y1 = y;
    }
    return loop;
  }

  function buildContours(g, st, seed, pred) {
    const mask = new Uint8Array(g.ex * g.ey);
    for (let i = 0; i < mask.length; i++) mask[i] = pred(g.code[i]) ? 1 : 0;
    return traceLoops(mask, g.ex, g.ey).map((raw) => flattenLoop(raw, g, st, seed)).filter((l) => l.n >= 3);
  }

  // ---------------------------------------------------------------------------------------------
  // Paths
  const clipA = { x: [], y: [] }, clipB = { x: [], y: [] };
  function clipPoly(xs, ys, n, rx0, ry0, rx1, ry1) {
    let inp = clipA, out = clipB;
    inp.x.length = 0; inp.y.length = 0;
    for (let i = 0; i < n; i++) { inp.x.push(xs[i]); inp.y.push(ys[i]); }
    for (let plane = 0; plane < 4; plane++) {
      out.x.length = 0; out.y.length = 0;
      const m = inp.x.length;
      if (!m) break;
      const inside = (x, y) => (plane === 0 ? x >= rx0 : plane === 1 ? x <= rx1 : plane === 2 ? y >= ry0 : y <= ry1);
      const isect = (ax, ay, bx, by) => {
        let t;
        if (plane === 0) t = (rx0 - ax) / (bx - ax); else if (plane === 1) t = (rx1 - ax) / (bx - ax);
        else if (plane === 2) t = (ry0 - ay) / (by - ay); else t = (ry1 - ay) / (by - ay);
        out.x.push(ax + (bx - ax) * t); out.y.push(ay + (by - ay) * t);
      };
      let sx = inp.x[m - 1], sy = inp.y[m - 1], sIn = inside(sx, sy);
      for (let i = 0; i < m; i++) {
        const ex2 = inp.x[i], ey2 = inp.y[i], eIn = inside(ex2, ey2);
        if (eIn) { if (!sIn) isect(sx, sy, ex2, ey2); out.x.push(ex2); out.y.push(ey2); }
        else if (sIn) isect(sx, sy, ex2, ey2);
        sx = ex2; sy = ey2; sIn = eIn;
      }
      const tmp = inp; inp = out; out = tmp;
    }
    return inp;
  }
  function addPoly(p, xs, ys, n) {
    p.moveTo(xs[0], ys[0]);
    for (let i = 1; i < n; i++) p.lineTo(xs[i], ys[i]);
    p.closePath();
  }
  const bboxOut = (L, rx0, ry0, rx1, ry1) => L.x1 < rx0 || L.x0 > rx1 || L.y1 < ry0 || L.y0 > ry1;
  function regionPath(loops, rx0, ry0, rx1, ry1) {
    const p = new Path2D();
    let any = false;
    for (const L of loops) {
      if (bboxOut(L, rx0, ry0, rx1, ry1)) continue;
      if (L.x0 >= rx0 && L.x1 <= rx1 && L.y0 >= ry0 && L.y1 <= ry1) { addPoly(p, L.xs, L.ys, L.n); any = true; continue; }
      const c = clipPoly(L.xs, L.ys, L.n, rx0, ry0, rx1, ry1);
      if (c.x.length >= 3) { addPoly(p, c.x, c.y, c.x.length); any = true; }
    }
    return any ? p : null;
  }
  function fullPath(loops) {
    const p = new Path2D();
    for (const L of loops) addPoly(p, L.xs, L.ys, L.n);
    return p;
  }
  // Open polylines through loop points satisfying pred (inside the rect), optionally offset inward.
  function linePath(loops, rx0, ry0, rx1, ry1, pred, inset) {
    const p = new Path2D();
    let any = false;
    const ins = inset || 0;
    for (const L of loops) {
      if (bboxOut(L, rx0, ry0, rx1, ry1)) continue;
      let open = false, cnt = 0;
      for (let i = 0; i <= L.n; i++) {
        const k = i % L.n;
        const x = L.xs[k] - L.nx[k] * ins, y = L.ys[k] - L.ny[k] * ins;
        const ok = x >= rx0 && x <= rx1 && y >= ry0 && y <= ry1 && pred(L, k);
        if (ok) {
          if (!open) { p.moveTo(x, y); open = true; cnt = 1; } else { p.lineTo(x, y); cnt++; if (cnt === 2) any = true; }
        } else open = false;
      }
    }
    return any ? p : null;
  }
  Terrain.linePath = linePath;

  // ---------------------------------------------------------------------------------------------
  // Exact Euclidean distance transform (Felzenszwalb–Huttenlocher), in cells.
  const INF = 1e20;
  function edt(mask, w, h, target) { // distance of each cell to the nearest cell with mask === target
    const g = new Float64Array(w * h);
    for (let i = 0; i < w * h; i++) g[i] = mask[i] === target ? 0 : INF;
    const n = Math.max(w, h);
    const f = new Float64Array(n), d = new Float64Array(n), v = new Int32Array(n), z = new Float64Array(n + 1);
    const pass = (len) => {
      let k = 0; v[0] = 0; z[0] = -INF; z[1] = INF;
      for (let q = 1; q < len; q++) {
        let s = ((f[q] + q * q) - (f[v[k]] + v[k] * v[k])) / (2 * q - 2 * v[k]);
        while (s <= z[k]) { k--; s = ((f[q] + q * q) - (f[v[k]] + v[k] * v[k])) / (2 * q - 2 * v[k]); }
        k++; v[k] = q; z[k] = s; z[k + 1] = INF;
      }
      k = 0;
      for (let q = 0; q < len; q++) { while (z[k + 1] < q) k++; const dq = q - v[k]; d[q] = dq * dq + f[v[k]]; }
    };
    for (let x = 0; x < w; x++) {
      for (let y = 0; y < h; y++) f[y] = g[y * w + x];
      pass(h);
      for (let y = 0; y < h; y++) g[y * w + x] = d[y];
    }
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) f[x] = g[y * w + x];
      pass(w);
      for (let x = 0; x < w; x++) g[y * w + x] = d[x];
    }
    const out = new Float32Array(w * h);
    for (let i = 0; i < w * h; i++) out[i] = g[i] >= INF * 0.5 ? 1e4 : Math.sqrt(g[i]);
    return out;
  }

  // Periodic fbm noise table (sampled bilinearly) — much cheaper than evaluating fbm per cell.
  const NT = 128;
  let noiseTable = null;
  function blotchNoise(x, y) {
    if (!noiseTable) {
      noiseTable = new Float32Array(NT * NT);
      for (let j = 0; j < NT; j++) for (let i = 0; i < NT; i++) noiseTable[j * NT + i] = fbm2(i / 16, j / 16, 4242, 3, NT / 16, NT / 16);
    }
    const fx = x - Math.floor(x / NT) * NT, fy = y - Math.floor(y / NT) * NT;
    const ix = fx | 0, iy = fy | 0, tx = fx - ix, ty = fy - iy;
    const ix1 = (ix + 1) & (NT - 1), iy1 = (iy + 1) & (NT - 1);
    const a = noiseTable[iy * NT + ix], b = noiseTable[iy * NT + ix1], c = noiseTable[iy1 * NT + ix], d = noiseTable[iy1 * NT + ix1];
    return (a + (b - a) * tx) + ((c + (d - c) * tx) - (a + (b - a) * tx)) * ty;
  }
  Terrain.blotchNoise = blotchNoise;

  // Shading images: body colour ramp (edge band → fill → deep, directional rim, blotches, glaze,
  // lava warmth) and the soft outside aura. One pixel per FC×FC cell; upscaled while blitting.
  // win (optional, world px [x0, y0, x1, y1]): only the terrain inside win changed (tilesChanged) - recompute
  // just the field cells whose shading can differ (win + the distance horizon) into the existing canvases, from
  // distance fields over that area + the horizon again. Every distance the shading reads saturates within the
  // horizon, and a windowed EDT is exact for distances below the window margin, so the result matches a full
  // rebuild. Returns the world-px rect that was rewritten (null = everything / nothing).
  function buildShading(TR, cache, win) {
    const g = TR.grid, st = TR.style, pal = cache.pal;
    const dw = Math.ceil((g.ex * T) / FC), dh = Math.ceil((g.ey * T) / FC);
    const RAMP0 = st.ramp || [[0, 'edge'], [st.bandWidth, 'fill']];
    const lastRamp = RAMP0[RAMP0.length - 1][0];
    // beyond this depth the colour is (almost) the constant deep fill
    const deepFast = Math.max(st.deepEnd + 2, lastRamp + 2, st.rimWidth + 2);
    // output cells [oi0, oi1) x [oj0, oj1); distance fields over the input cells [ii0, ii1) x [ij0, ij1)
    let oi0 = 0, oj0 = 0, oi1 = dw, oj1 = dh, ii0 = 0, ij0 = 0, ii1 = dw, ij1 = dh;
    if (win && TR.dfCanvas && TR.auraCanvas) {
      const horizon = Math.max(deepFast, st.bandWidth || 0, st.aura.width, st.glaze.width || 34, TR.hasLava ? 110 : 0) + 3 * FC;
      const mc = Math.ceil(horizon / FC);
      oi0 = clamp(Math.floor((win[0] + M * T) / FC) - mc, 0, dw); oi1 = clamp(Math.ceil((win[2] + M * T) / FC) + mc, 0, dw);
      oj0 = clamp(Math.floor((win[1] + M * T) / FC) - mc, 0, dh); oj1 = clamp(Math.ceil((win[3] + M * T) / FC) + mc, 0, dh);
      ii0 = clamp(oi0 - mc, 0, dw); ii1 = clamp(oi1 + mc, 0, dw); ij0 = clamp(oj0 - mc, 0, dh); ij1 = clamp(oj1 + mc, 0, dh);
      if ((ii1 - ii0) * (ij1 - ij0) > 0.6 * dw * dh) { oi0 = oj0 = ii0 = ij0 = 0; oi1 = ii1 = dw; oj1 = ij1 = dh; win = null; }
      else if (oi1 <= oi0 || oj1 <= oj0) return null;
    } else win = null;
    const iw = ii1 - ii0, ih = ij1 - ij0, ow = oi1 - oi0, oh = oj1 - oj0;
    const mk = makeCanvas(iw, ih);
    const mctx = mk.ctx;
    mctx.setTransform(1 / FC, 0, 0, 1 / FC, (M * T) / FC - ii0, (M * T) / FC - ij0);
    mctx.fillStyle = '#fff';
    if (win) {
      // loops reaching the input area only (whole loops: same rasterisation as the full path)
      const bx0 = ii0 * FC - M * T, by0 = ij0 * FC - M * T, bx1 = ii1 * FC - M * T, by1 = ij1 * FC - M * T;
      const p = new Path2D();
      for (const L of TR.loops) if (!bboxOut(L, bx0, by0, bx1, by1)) addPoly(p, L.xs, L.ys, L.n);
      mctx.fill(p);
    } else mctx.fill(fullPath(TR.loops));
    const md = mctx.getImageData(0, 0, iw, ih).data;
    const n = iw * ih;
    const inside = new Uint8Array(n);
    for (let i = 0; i < n; i++) inside[i] = md[i * 4 + 3] >= 128 ? 1 : 0;
    const dIn = edt(inside, iw, ih, 0); // inside cells → distance to air
    const dOut = edt(inside, iw, ih, 1); // air cells → distance to terrain
    // lava proximity (warm glow on nearby terrain)
    let dLava = null;
    if (TR.hasLava) {
      const lm = new Uint8Array(n);
      for (let j = 0; j < ih; j++) for (let i = 0; i < iw; i++) {
        const gx = Math.floor(((ii0 + i + 0.5) * FC) / T), gy = Math.floor(((ij0 + j + 0.5) * FC) / T);
        lm[j * iw + i] = gcode(g, gx, gy) === LAVA ? 1 : 0;
      }
      dLava = edt(lm, iw, ih, 1);
    }
    const E = rgb(pal.edge), F = rgb(pal.fill), D = rgb(pal.fillDeep), H = rgb(st.rimColor || pal.highlight);
    const GZ = rgb(st.glaze.color || pal.glaze), GD = rgb(st.glaze.deep || pal.glazeDeep), LV = rgb(pal.lava);
    const BK = rgb(st.breakable.tint || mix(pal.edge, pal.fill, 0.5));
    const lx = st.light[0], ly = st.light[1];
    const colorOf = (c) => rgb(pal[c] || c);
    const RAMP = RAMP0.map(([dd, c]) => [dd, colorOf(c)]);
    if (RAMP.length < 2) RAMP.push([st.bandWidth, F]);
    const img = mctx.createImageData(ow, oh), o = img.data;
    const aimg = mctx.createImageData(ow, oh), ao = aimg.data;
    const AU = rgb(st.aura.color || pal.fillDeep);
    const bs = st.blotchScale;
    const ppc = FC; // px per cell
    const FL = RAMP[RAMP.length - 1][1];
    const DEEP = [lerp(FL[0], D[0], st.deep), lerp(FL[1], D[1], st.deep), lerp(FL[2], D[2], st.deep)];
    // (i, j: input-local cell; the input area's edges are the field's edges or lie >= the horizon away)
    for (let j = oj0 - ij0; j < oj1 - ij0; j++) {
      for (let i = oi0 - ii0; i < oi1 - ii0; i++) {
        const k = j * iw + i, p = ((j + ij0 - oj0) * ow + i + ii0 - oi0) * 4;
        const wx = (ii0 + i + 0.5) * ppc - M * T, wy = (ij0 + j + 0.5) * ppc - M * T;
        if (!inside[k]) {
          o[p] = E[0]; o[p + 1] = E[1]; o[p + 2] = E[2]; o[p + 3] = 255;
          // aura
          const dd = dOut[k] * ppc;
          if (dd >= st.aura.width) { ao[p + 3] = 0; continue; }
          let a = st.aura.alpha * (1 - smooth(0, st.aura.width, dd));
          if (a > 0.003) {
            const gx = (i + 1 < iw ? dOut[k + 1] : dOut[k]) - (i > 0 ? dOut[k - 1] : dOut[k]);
            const gy = (j + 1 < ih ? dOut[k + iw] : dOut[k]) - (j > 0 ? dOut[k - iw] : dOut[k]);
            const gl = Math.hypot(gx, gy) || 1;
            const towardY = -gy / gl; // >0 when the terrain is below (cell sits above a floor)
            a *= 1 - (1 - st.aura.floor) * Math.max(0, towardY);
          }
          ao[p] = AU[0]; ao[p + 1] = AU[1]; ao[p + 2] = AU[2]; ao[p + 3] = clamp(a * 255, 0, 255);
          continue;
        }
        ao[p + 3] = 0;
        const d = Math.max(0, dIn[k] * ppc - ppc * 0.5);
        const gxl = Math.floor((wx + M * T) / T), gyl = Math.floor((wy + M * T) / T);
        let m = gcode(g, gxl, gyl);
        if (!isSolid(m)) m = SOLID;
        if (d > deepFast && m === SOLID && !dLava) { // fast path: deep interior
          const nb = 1 + st.blotch * blotchNoise(wx / bs * 16, wy / bs * 16) * (1 - st.deep);
          o[p] = clamp(DEEP[0] * nb, 0, 255); o[p + 1] = clamp(DEEP[1] * nb, 0, 255); o[p + 2] = clamp(DEEP[2] * nb, 0, 255); o[p + 3] = 255;
          continue;
        }
        // gradient → outward normal
        const gx = (i + 1 < iw ? dIn[k + 1] : dIn[k]) - (i > 0 ? dIn[k - 1] : dIn[k]);
        const gy = (j + 1 < ih ? dIn[k + iw] : dIn[k]) - (j > 0 ? dIn[k - iw] : dIn[k]);
        const gl = Math.hypot(gx, gy) || 1;
        const ox = -gx / gl, oy = -gy / gl;
        const facing = ox * lx + oy * ly;
        let r, gg, b;
        if (m === GLAZED) {
          const t = smooth(0, st.glaze.width || 34, d);
          r = lerp(GZ[0], GD[0], t); gg = lerp(GZ[1], GD[1], t); b = lerp(GZ[2], GD[2], t);
        } else {
          // colour ramp by depth (stops in px)
          let k0 = 0;
          while (k0 < RAMP.length - 2 && d > RAMP[k0 + 1][0]) k0++;
          const A = RAMP[k0], B = RAMP[k0 + 1];
          const t = smooth(A[0], B[0], d);
          r = lerp(A[1][0], B[1][0], t); gg = lerp(A[1][1], B[1][1], t); b = lerp(A[1][2], B[1][2], t);
          if (m === BREAKABLE || m === DIVEFLOOR) { const q = 0.22; r = lerp(r, BK[0], q); gg = lerp(gg, BK[1], q); b = lerp(b, BK[2], q); }
        }
        // directional rim light near the edge
        let rim = st.rim * Math.pow(Math.max(0, facing), 1.6) + st.rimSide * Math.abs(ox * ly - oy * lx) * 0.8 + st.rimBottom * Math.max(0, -facing);
        rim *= 1 - smooth(st.rimWidth * 0.3, st.rimWidth, d);
        if (m === GLAZED) rim *= 0.6;
        if (rim > 0) { const q = clamp(rim, 0, 1) * 0.85; r = lerp(r, H[0], q); gg = lerp(gg, H[1], q); b = lerp(b, H[2], q); }
        // organic blotches
        if (st.blotch > 0 && m !== GLAZED) {
          const nb = 1 + st.blotch * blotchNoise(wx / bs * 16, wy / bs * 16);
          r *= nb; gg *= nb; b *= nb;
        }
        // depth
        let deep = st.deep * smooth(st.deepStart, st.deepEnd, d);
        if (m === BREAKABLE || m === DIVEFLOOR) deep *= 0.55;
        r = lerp(r, D[0], deep); gg = lerp(gg, D[1], deep); b = lerp(b, D[2], deep);
        // warm lava light
        if (dLava) {
          const dl = dLava[k] * ppc;
          if (dl < 110) { const q = Math.pow(1 - dl / 110, 2) * st.lavaGlow * (1 - deep * 0.7); r = lerp(r, LV[0], q); gg = lerp(gg, LV[1], q); b = lerp(b, LV[2], q); }
        }
        o[p] = clamp(r, 0, 255); o[p + 1] = clamp(gg, 0, 255); o[p + 2] = clamp(b, 0, 255); o[p + 3] = 255;
      }
    }
    if (win) {
      freeCanvas(mk.canvas);
      TR.dfCanvas.getContext('2d').putImageData(img, oi0, oj0);
      TR.auraCanvas.getContext('2d').putImageData(aimg, oi0, oj0);
      return [oi0 * FC - M * T, oj0 * FC - M * T, oi1 * FC - M * T, oj1 * FC - M * T];
    }
    mctx.setTransform(1, 0, 0, 1, 0, 0);
    mctx.putImageData(img, 0, 0);
    const au = makeCanvas(dw, dh);
    au.ctx.putImageData(aimg, 0, 0);
    if (TR.dfCanvas) freeCanvas(TR.dfCanvas);
    if (TR.auraCanvas) freeCanvas(TR.auraCanvas);
    TR.dfCanvas = mk.canvas; TR.auraCanvas = au.canvas;
    TR.dfX = -M * T; TR.dfY = -M * T; TR.dfW = dw * FC; TR.dfH = dh * FC;
    // flat colour for fully-interior chunks
    TR.flatColor = U.hex(DEEP[0], DEEP[1], DEEP[2]);
    return null;
  }

  // ---------------------------------------------------------------------------------------------
  // Spikes & platforms (runs), liquids, breakable components
  function spikeOrient(g, x, y) {
    // a vertical spike strip set into a wall face (spikes above/below, solid on exactly one side, open air on
    // the other) points out of the wall along its whole length - else its end tiles would take the floor/ceiling
    // orientation and the strip would read as a toothed recess (dn_04 east wall).
    if (gcode(g, x, y - 1) === SPIKES || gcode(g, x, y + 1) === SPIKES) {
      const l = gcode(g, x - 1, y), r = gcode(g, x + 1, y);
      if (isSolid(l) && !isSolid(r) && r !== SPIKES) return 1; // right
      if (isSolid(r) && !isSolid(l) && l !== SPIKES) return 3; // left
    }
    if (isSolid(gcode(g, x, y + 1))) return 0; // up
    if (isSolid(gcode(g, x, y - 1))) return 2; // down
    if (isSolid(gcode(g, x - 1, y))) return 1; // right
    if (isSolid(gcode(g, x + 1, y))) return 3; // left
    return 0;
  }
  function buildRuns(room, TR) {
    const g = TR.grid, cols = room.cols, rows = room.rows;
    const spikes = [], plats = [];
    // spikes: horizontal runs for up/down, vertical runs for left/right
    const used = new Uint8Array(cols * rows);
    for (let r = 0; r < rows; r++) for (let c = 0; c < cols; c++) {
      const i = r * cols + c;
      if (used[i] || g.code[(r + M) * g.ex + c + M] !== SPIKES) continue;
      const o = spikeOrient(g, c + M, r + M);
      let len = 1;
      if (o === 0 || o === 2) {
        while (c + len < cols && g.code[(r + M) * g.ex + c + len + M] === SPIKES && spikeOrient(g, c + len + M, r + M) === o) len++;
        for (let k = 0; k < len; k++) used[i + k] = 1;
      } else {
        while (r + len < rows && g.code[(r + len + M) * g.ex + c + M] === SPIKES && spikeOrient(g, c + M, r + len + M) === o) len++;
        for (let k = 0; k < len; k++) used[i + k * cols] = 1;
      }
      spikes.push({ c, r, len, o, x0: c * T - 8, y0: r * T - 8, x1: (c + ((o & 1) ? 1 : len)) * T + 8, y1: (r + ((o & 1) ? len : 1)) * T + 8 });
    }
    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        if (g.code[(r + M) * g.ex + c + M] !== PLATFORM) continue;
        let len = 1;
        while (c + len < cols && g.code[(r + M) * g.ex + c + len + M] === PLATFORM) len++;
        const left = isSolid(gcode(g, c - 1 + M, r + M)), right = isSolid(gcode(g, c + len + M, r + M));
        // free hanging support: distance up to the ceiling
        const up = (cc) => { for (let k = 1; k <= 10; k++) { const v = gcode(g, cc + M, r - k + M); if (isSolid(v)) return k; if (v === PLATFORM) return 0; } return 0; };
        const down = (cc) => { for (let k = 1; k <= 4; k++) { const v = gcode(g, cc + M, r + k + M); if (isSolid(v)) return k; if (v !== EMPTY && v !== BGWALL) return 0; } return 0; };
        // stilt support: distance down to ground or a lower deck (≤ 10 tiles; nothing else in between)
        const ground = (cc) => { for (let k = 1; k <= 10; k++) { const v = gcode(g, cc + M, r + k + M); if (isSolid(v) || v === PLATFORM) return k; if (v !== EMPTY && v !== BGWALL) return 0; } return 0; };
        const postL = ground(c), postR = ground(c + len - 1), postM = len >= 8 ? ground(c + (len >> 1)) : 0;
        plats.push({ c, r, len, left, right, upL: up(c), upR: up(c + len - 1), downL: down(c), downR: down(c + len - 1), postL, postR, postM,
          x0: c * T - 30, y0: r * T - 10 * T, x1: (c + len) * T + 30, y1: (r + Math.max(5, postL + 1, postR + 1, postM + 1)) * T });
        c += len - 1;
      }
    }
    TR.spikes = spikes; TR.plats = plats;
  }

  function buildLiquids(room, TR, cache) {
    const cols = room.cols, rows = room.rows, tiles = cache.pristine;
    const surf = [];
    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        const v = tiles[r * cols + c];
        if (v !== WATER && v !== LAVA) continue;
        const above = r > 0 ? tiles[(r - 1) * cols + c] : (v === WATER || v === LAVA ? EMPTY : EMPTY);
        if (above === v) continue;
        let len = 1;
        while (c + len < cols && tiles[r * cols + c + len] === v && (r === 0 || tiles[(r - 1) * cols + c + len] !== v)) len++;
        // body depth per column → rects
        const rects = [];
        for (let k = 0; k < len; k++) {
          let d = 1;
          while (r + d < rows && tiles[(r + d) * cols + c + k] === v) d++;
          const last = rects[rects.length - 1];
          if (last && last.d === d) last.n++; else rects.push({ c: c + k, n: 1, d });
        }
        surf.push({ type: v, c, r, len, x0: c * T, x1: (c + len) * T, y: r * T, rects, maxD: Math.max(...rects.map((q) => q.d)),
          seed: hashInt(c, r, cache.seed) });
        c += len - 1;
      }
    }
    TR.liquids = surf;
    TR.hasLava = surf.some((s) => s.type === LAVA);
    // lights along lava surfaces
    const lights = [];
    const lavaCol = cache.cfg.liquids && cache.cfg.liquids.lavaLight || cache.pal.lava;
    for (const s of surf) {
      if (s.type !== LAVA) continue;
      const w = s.x1 - s.x0, n = Math.max(1, Math.round(w / (T * 3.5)));
      for (let k = 0; k < n; k++) lights.push({ x: s.x0 + (w * (k + 0.5)) / n, y: s.y - 6, r: 190 + Math.min(80, w / n * 0.4), color: lavaCol, intensity: 0.85, flicker: true });
    }
    TR.lights = lights;
  }

  function buildComponents(room, TR, cache) {
    const cols = room.cols, rows = room.rows, tiles = cache.pristine;
    const seen = new Uint8Array(cols * rows), comps = [];
    for (let i = 0; i < cols * rows; i++) {
      const v = tiles[i];
      if (seen[i] || (v !== BREAKABLE && v !== DIVEFLOOR)) continue;
      const list = [], st = [i];
      seen[i] = 1;
      let c0 = 1e9, r0 = 1e9, c1 = -1, r1 = -1;
      while (st.length) {
        const j = st.pop(), c = j % cols, r = (j / cols) | 0;
        list.push([c, r]);
        if (c < c0) c0 = c; if (c > c1) c1 = c; if (r < r0) r0 = r; if (r > r1) r1 = r;
        for (const [dc, dr] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
          const nc = c + dc, nr = r + dr;
          if (nc < 0 || nr < 0 || nc >= cols || nr >= rows) continue;
          const nj = nr * cols + nc;
          if (!seen[nj] && tiles[nj] === v) { seen[nj] = 1; st.push(nj); }
        }
      }
      let minC = 1e9, minR = 1e9;
      for (const [c, r] of list) { if (r < minR || (r === minR && c < minC)) { minR = r; minC = c; } }
      // TECH_SPEC id: <roomId>:<minCol>,<minRow>
      let mc = 1e9; for (const [c] of list) if (c < mc) mc = c;
      let mr = 1e9; for (const [, r] of list) if (r < mr) mr = r;
      comps.push({ id: room.id + ':' + mc + ',' + mr, code: v, tiles: list, c0, r0, c1, r1 });
    }
    TR.comps = comps;
  }

  // ---------------------------------------------------------------------------------------------
  // Dressing: deterministic, position-keyed surface details (identical across chunk rebuilds).
  // Walks loop points facing `side` (0 floor, 1 ceiling, 2 wall) and calls fn at quantized steps.
  function walkSurface(TR, rx0, ry0, rx1, ry1, side, step, salt, fn) {
    for (const L of TR.loops) {
      if (bboxOut(L, rx0, ry0, rx1, ry1)) continue;
      const n = L.n;
      for (let i = 0; i < n; i++) {
        const j = i + 1 < n ? i + 1 : 0;
        const ax = L.xs[i], ay = L.ys[i], bx = L.xs[j], by = L.ys[j];
        if ((ax < rx0 && bx < rx0) || (ax > rx1 && bx > rx1) || (ay < ry0 && by < ry0) || (ay > ry1 && by > ry1)) continue;
        const ma = L.mat[i], aa = L.adj[i];
        if (ma === GLAZED || L.mat[j] === GLAZED) continue;
        if (!(aa === EMPTY || aa === BGWALL) || !(L.adj[j] === EMPTY || L.adj[j] === BGWALL)) continue;
        let ok;
        if (side === 0) ok = L.ny[i] < -0.92 && L.ny[j] < -0.92;
        else if (side === 1) ok = L.ny[i] > 0.92 && L.ny[j] > 0.92;
        else ok = Math.abs(L.nx[i]) > 0.92 && Math.abs(L.nx[j]) > 0.92;
        if (!ok) continue;
        if (side !== 2) {
          const lo = Math.min(ax, bx), hi = Math.max(ax, bx);
          if (hi - lo < 0.5) continue;
          const line = Math.round(((ay + by) * 0.5) / T);
          for (let q = Math.ceil(lo / step); q * step < hi; q++) {
            const x = q * step, t = (x - ax) / (bx - ax), y = ay + (by - ay) * t;
            if (x < rx0 || x > rx1) continue;
            fn(x, y, L.nx[i], L.ny[i], hashInt(q, line, salt), ma);
          }
        } else {
          const lo = Math.min(ay, by), hi = Math.max(ay, by);
          if (hi - lo < 0.5) continue;
          const line = Math.round(((ax + bx) * 0.5) / T) * (L.nx[i] > 0 ? 1 : -1);
          for (let q = Math.ceil(lo / step); q * step < hi; q++) {
            const y = q * step, t = (y - ay) / (by - ay), x = ax + (bx - ax) * t;
            if (y < ry0 || y > ry1) continue;
            fn(x, y, L.nx[i], L.ny[i], hashInt(q, line, salt), ma);
          }
        }
      }
    }
  }
  Terrain.walkSurface = walkSurface;
  const hf = (h, k) => ((Math.imul(h ^ (k * 0x9e3779b1), 0x85ebca77) >>> 0) % 100000) / 100000; // derive [0,1) from a hash

  // Dressing renderers. Each: (ctx, TR, rect, spec, salt, cache). Colors default from palette.
  const DRESS = (Terrain.dress = {});
  function gate(spec, x, y, salt) { // clustering: noise-gated density
    if (!spec.cluster) return 1;
    const n = noise1(x / (spec.clusterScale || 90) + y * 0.013, salt + 99);
    return smooth(spec.cluster - 0.35, spec.cluster + 0.25, n * 0.5 + 0.5);
  }
  DRESS.grass = function (ctx, TR, R, s, salt, cache) { // thin blades (wax fibers, grass, reeds)
    const step = s.step || 3, dens = s.density === undefined ? 0.5 : s.density;
    const hmin = s.h ? s.h[0] : 5, hmax = s.h ? s.h[1] : 13;
    const paths = [new Path2D(), new Path2D()];
    walkSurface(TR, R[0], R[1], R[2], R[3], 0, step, salt, (x, y, nx, ny, h) => {
      if (hf(h, 1) > dens * gate(s, x, y, salt)) return;
      const len = lerp(hmin, hmax, Math.pow(hf(h, 2), 1.5));
      const lean = (hf(h, 3) - 0.5) * (s.lean || 7) + (s.wind || 0);
      const p = paths[hf(h, 4) < (s.tipRatio || 0.35) ? 1 : 0];
      const bx = x + (hf(h, 5) - 0.5) * step;
      p.moveTo(bx, y + 2);
      p.quadraticCurveTo(bx + lean * 0.2, y - len * 0.6, bx + lean, y - len);
    });
    ctx.lineCap = 'round';
    ctx.lineWidth = s.width || 1.3;
    ctx.strokeStyle = s.color || cache.pal.edge; ctx.stroke(paths[0]);
    ctx.strokeStyle = s.color2 || s.color || cache.pal.highlight; ctx.stroke(paths[1]);
  };
  DRESS.tufts = function (ctx, TR, R, s, salt, cache) { // clustered fuzzy clumps (moss, fungus)
    const step = s.step || 6;
    const p = new Path2D(), q = new Path2D();
    walkSurface(TR, R[0], R[1], R[2], R[3], s.side || 0, step, salt, (x, y, nx, ny, h) => {
      if (hf(h, 1) > (s.density || 0.4) * gate(s, x, y, salt)) return;
      const r = lerp(s.r ? s.r[0] : 2, s.r ? s.r[1] : 5, hf(h, 2));
      const cx = x + nx * r * 0.3, cy = y + ny * r * 0.3;
      p.moveTo(cx + r, cy); p.arc(cx, cy, r, 0, Math.PI * 2);
      if (hf(h, 3) < 0.6) { const r2 = r * 0.45; q.moveTo(cx + nx * r * 0.35 + r2 - 0.5, cy + ny * r * 0.35 - 0.5); q.arc(cx + nx * r * 0.35 - 0.5, cy + ny * r * 0.35 - 0.5, r2, 0, 7); }
    });
    ctx.fillStyle = s.color || cache.pal.edge; ctx.fill(p);
    ctx.fillStyle = s.color2 || cache.pal.highlight; ctx.globalAlpha = s.alpha2 || 0.55; ctx.fill(q); ctx.globalAlpha = 1;
    if (s.glow) { // glowing fungus dots
      walkSurface(TR, R[0], R[1], R[2], R[3], s.side || 0, step, salt, (x, y, nx, ny, h) => {
        if (hf(h, 1) > (s.density || 0.4) * gate(s, x, y, salt) || hf(h, 6) > s.glow) return;
        Art.glow(ctx, x + nx * 3, y + ny * 3, 10 + hf(h, 7) * 8, s.glowColor || cache.pal.accent, 0.35);
      });
    }
  };
  DRESS.pebbles = function (ctx, TR, R, s, salt, cache) {
    const p = new Path2D(), hl = new Path2D();
    walkSurface(TR, R[0], R[1], R[2], R[3], 0, s.step || 7, salt, (x, y, nx, ny, h) => {
      if (hf(h, 1) > (s.density || 0.25) * gate(s, x, y, salt)) return;
      const rx = lerp(1.5, s.size || 4, hf(h, 2)), ry = rx * 0.65;
      p.moveTo(x + rx, y - ry * 0.4); p.ellipse(x, y - ry * 0.4, rx, ry, 0, 0, Math.PI * 2);
      hl.moveTo(x + rx * 0.5, y - ry * 0.9); hl.ellipse(x - rx * 0.15, y - ry * 0.9, rx * 0.5, ry * 0.3, 0, 0, Math.PI * 2);
    });
    ctx.fillStyle = s.color || cache.pal.fill; ctx.fill(p);
    ctx.fillStyle = s.color2 || cache.pal.edge; ctx.fill(hl);
  };
  DRESS.drift = function (ctx, TR, R, s, salt, cache) { // soft mounds (ash, snow, soot) hugging floors
    const step = 4, H = s.h || 3.2;
    const top = new Path2D(), lit = new Path2D();
    let started = false, lastX = -1e9, lastY = 0, pts = [];
    const flush = () => {
      if (pts.length > 2) {
        top.moveTo(pts[0][0], pts[0][1] + 6);
        for (const q of pts) top.lineTo(q[0], q[1] - q[2]);
        top.lineTo(pts[pts.length - 1][0], pts[pts.length - 1][1] + 6);
        top.closePath();
        lit.moveTo(pts[0][0], pts[0][1] - pts[0][2]);
        for (const q of pts) lit.lineTo(q[0], q[1] - q[2]);
      }
      pts = []; started = false;
    };
    walkSurface(TR, R[0], R[1], R[2], R[3], 0, step, salt, (x, y) => {
      // split on any discontinuity (gap, backwards step onto another loop, step up/down)
      if (started && (x - lastX > step * 1.5 || x - lastX < step * 0.5 || Math.abs(y - lastY) > 8)) flush();
      const n = noise1(x / (s.scale || 70), salt) * 0.5 + 0.5;
      const hh = Math.max(0, (n - (s.threshold || 0.35)) / (1 - (s.threshold || 0.35))) * H;
      pts.push([x, y, hh]); started = true; lastX = x; lastY = y;
    });
    flush();
    ctx.fillStyle = s.color || cache.pal.highlight;
    ctx.globalAlpha = s.alpha || 0.9; ctx.fill(top); ctx.globalAlpha = 1;
    if (s.line !== false) { ctx.strokeStyle = s.color2 || U.shade(s.color || cache.pal.highlight, 0.25); ctx.lineWidth = 1.2; ctx.stroke(lit); }
  };
  DRESS.flowers = function (ctx, TR, R, s, salt, cache) { // small wax flowers with glowing hearts
    walkSurface(TR, R[0], R[1], R[2], R[3], 0, s.step || 9, salt, (x, y, nx, ny, h) => {
      if (hf(h, 1) > (s.density || 0.12) * gate(s, x, y, salt)) return;
      const stem = lerp(4, s.h || 12, hf(h, 2)), lean = (hf(h, 3) - 0.5) * 6;
      const fx = x + lean, fy = y - stem;
      ctx.strokeStyle = s.stem || cache.pal.edge; ctx.lineWidth = 1.2;
      ctx.beginPath(); ctx.moveTo(x, y + 1); ctx.quadraticCurveTo(x + lean * 0.2, y - stem * 0.5, fx, fy); ctx.stroke();
      const pr = lerp(2, s.r || 3.6, hf(h, 4)), np = 5;
      ctx.fillStyle = s.color || cache.pal.highlight;
      for (let k = 0; k < np; k++) {
        const a = (k / np) * Math.PI * 2 + hf(h, 5) * 2;
        ctx.beginPath(); ctx.ellipse(fx + Math.cos(a) * pr * 0.75, fy + Math.sin(a) * pr * 0.55, pr * 0.62, pr * 0.42, a, 0, 7); ctx.fill();
      }
      ctx.fillStyle = s.heart || cache.pal.accent;
      ctx.beginPath(); ctx.arc(fx, fy, pr * 0.38, 0, 7); ctx.fill();
      if (s.glow !== false) Art.glow(ctx, fx, fy, pr * 4.5, s.heart || cache.pal.accent, 0.28);
    });
  };
  DRESS.crystals = function (ctx, TR, R, s, salt, cache) { // sprouting shards (floor or ceiling)
    const side = s.side || 0;
    walkSurface(TR, R[0], R[1], R[2], R[3], side, s.step || 8, salt, (x, y, nx, ny, h) => {
      if (hf(h, 1) > (s.density || 0.15) * gate(s, x, y, salt)) return;
      const n = 1 + Math.floor(hf(h, 2) * 3);
      for (let k = 0; k < n; k++) {
        const len = lerp(s.h ? s.h[0] : 4, s.h ? s.h[1] : 12, hf(h, 3 + k)), w = len * 0.28 + 1;
        const a = (hf(h, 7 + k) - 0.5) * 0.9;
        const dx = Math.sin(a) * len, dy = -Math.cos(a) * len * (side === 1 ? -1 : 1);
        const bx = x + (k - (n - 1) / 2) * w * 1.3;
        ctx.fillStyle = s.color || cache.pal.highlight;
        ctx.beginPath(); ctx.moveTo(bx - w, y + 1 * (side === 1 ? -1 : 1)); ctx.lineTo(bx + dx, y + dy); ctx.lineTo(bx + w, y); ctx.closePath(); ctx.fill();
        ctx.fillStyle = s.color2 || 'rgba(255,255,255,0.55)';
        ctx.beginPath(); ctx.moveTo(bx - w * 0.2, y); ctx.lineTo(bx + dx, y + dy); ctx.lineTo(bx + w, y); ctx.closePath(); ctx.fill();
        if (s.glow) Art.glow(ctx, bx + dx * 0.6, y + dy * 0.6, len * 1.6, s.glowColor || s.color || cache.pal.accent, s.glow);
      }
    });
  };
  DRESS.drips = function (ctx, TR, R, s, salt, cache) { // hanging wax drips / stalactites / icicles
    const col = s.color || cache.pal.edge, col2 = s.color2 || cache.pal.highlight;
    const body = new Path2D(), shine = new Path2D(), beads = new Path2D();
    walkSurface(TR, R[0], R[1], R[2], R[3], 1, s.step || 6, salt, (x, y, nx, ny, h) => {
      if (hf(h, 1) > (s.density || 0.3) * gate(s, x, y, salt)) return;
      let len = lerp(s.len ? s.len[0] : 4, s.len ? s.len[1] : 18, Math.pow(hf(h, 2), 2.2));
      if (hf(h, 8) < (s.longChance || 0.06)) len *= 2;
      const w = lerp(s.w ? s.w[0] : 2.5, s.w ? s.w[1] : 6, hf(h, 3)) * (s.pointy ? 1.2 : 1);
      const yy = y - 2;
      body.moveTo(x - w, yy);
      if (s.pointy) { body.lineTo(x - w * 0.15, yy + len * 0.85); body.lineTo(x, yy + len); body.lineTo(x + w * 0.15, yy + len * 0.85); body.lineTo(x + w, yy); }
      else {
        body.quadraticCurveTo(x - w * 0.35, yy + len * 0.5, x - w * 0.3, yy + len);
        body.arc(x, yy + len, w * 0.3, Math.PI, 0, true);
        body.quadraticCurveTo(x + w * 0.35, yy + len * 0.5, x + w, yy);
        if (s.beads !== false && hf(h, 4) < 0.35) { const br = w * 0.42; beads.moveTo(x + br, yy + len + br * 2.6); beads.arc(x, yy + len + br * 2.6, br, 0, 7); }
      }
      body.closePath();
      shine.moveTo(x - w * 0.45, yy + 2); shine.lineTo(x - w * 0.2, yy + len * 0.75);
    });
    ctx.fillStyle = col; ctx.fill(body); ctx.fill(beads);
    ctx.strokeStyle = col2; ctx.globalAlpha = s.shine === undefined ? 0.5 : s.shine; ctx.lineWidth = 1; ctx.lineCap = 'round'; ctx.stroke(shine); ctx.globalAlpha = 1;
  };
  DRESS.roots = function (ctx, TR, R, s, salt, cache) { // hanging roots / silk threads / chains of moss
    const p = new Path2D(), leaves = new Path2D();
    walkSurface(TR, R[0], R[1], R[2], R[3], 1, s.step || 9, salt, (x, y, nx, ny, h) => {
      if (hf(h, 1) > (s.density || 0.2) * gate(s, x, y, salt)) return;
      const len = lerp(s.len ? s.len[0] : 10, s.len ? s.len[1] : 46, Math.pow(hf(h, 2), 1.6));
      const sway = (hf(h, 3) - 0.5) * 14;
      p.moveTo(x, y - 2);
      p.bezierCurveTo(x + sway * 0.3, y + len * 0.35, x - sway * 0.6, y + len * 0.65, x + sway * 0.4, y + len);
      if (s.leaves) {
        for (let k = 1; k < 4; k++) {
          if (hf(h, 10 + k) > s.leaves) continue;
          const t = k / 4, lx = x + sway * (0.3 * t), ly = y + len * t;
          const dir = hf(h, 20 + k) < 0.5 ? -1 : 1;
          leaves.moveTo(lx, ly); leaves.quadraticCurveTo(lx + dir * 5, ly - 1, lx + dir * 6, ly + 3); leaves.quadraticCurveTo(lx + dir * 2, ly + 3, lx, ly);
        }
      }
    });
    ctx.strokeStyle = s.color || cache.pal.edge; ctx.lineWidth = s.width || 1.4; ctx.lineCap = 'round';
    ctx.globalAlpha = s.alpha || 1; ctx.stroke(p); ctx.globalAlpha = 1;
    ctx.fillStyle = s.color2 || s.color || cache.pal.edge; ctx.fill(leaves);
  };
  DRESS.streaks = function (ctx, TR, R, s, salt, cache) { // vertical stains/soot below ledges (on walls, inside terrain)
    walkSurface(TR, R[0], R[1], R[2], R[3], 2, s.step || 10, salt, (x, y, nx, ny, h) => {
      if (hf(h, 1) > (s.density || 0.18)) return;
      const len = lerp(10, s.len || 60, hf(h, 2)), w = lerp(1.5, 4, hf(h, 3));
      const ix = x - nx * lerp(2, 9, hf(h, 4));
      const g = ctx.createLinearGradient(ix, y, ix, y + len);
      g.addColorStop(0, rgba(s.color || '#000000', s.alpha || 0.35)); g.addColorStop(1, rgba(s.color || '#000000', 0));
      ctx.fillStyle = g; ctx.fillRect(ix - w / 2, y, w, len);
    });
  };
  DRESS.frost = function (ctx, TR, R, s, salt, cache) { // frost feathers on any surface
    const p = new Path2D();
    for (const side of [0, 1, 2]) {
      walkSurface(TR, R[0], R[1], R[2], R[3], side, s.step || 7, salt + side, (x, y, nx, ny, h) => {
        if (hf(h, 1) > (s.density || 0.3)) return;
        const len = lerp(3, s.len || 9, hf(h, 2));
        const a = Math.atan2(ny, nx) + (hf(h, 3) - 0.5) * 1.2;
        const ex = x + Math.cos(a) * len, ey = y + Math.sin(a) * len;
        p.moveTo(x, y); p.lineTo(ex, ey);
        const b = len * 0.45, mx = (x + ex) / 2, my = (y + ey) / 2;
        p.moveTo(mx, my); p.lineTo(mx + Math.cos(a + 0.7) * b, my + Math.sin(a + 0.7) * b);
        p.moveTo(mx, my); p.lineTo(mx + Math.cos(a - 0.7) * b, my + Math.sin(a - 0.7) * b);
      });
    }
    ctx.strokeStyle = s.color || cache.pal.highlight; ctx.globalAlpha = s.alpha || 0.7; ctx.lineWidth = 1; ctx.stroke(p); ctx.globalAlpha = 1;
  };
  DRESS.rivets = function (ctx, TR, R, s, salt, cache) { // metal studs along edges (inside terrain)
    for (const side of [0, 1, 2]) {
      walkSurface(TR, R[0], R[1], R[2], R[3], side, s.step || 20, salt + side, (x, y, nx, ny, h) => {
        if (hf(h, 1) > (s.density || 0.8)) return;
        const ix = x - nx * (s.inset || 7), iy = y - ny * (s.inset || 7);
        ctx.fillStyle = 'rgba(0,0,0,0.5)'; ctx.beginPath(); ctx.arc(ix + 0.7, iy + 0.7, 2.2, 0, 7); ctx.fill();
        ctx.fillStyle = s.color || cache.pal.highlight; ctx.globalAlpha = s.alpha || 0.65; ctx.beginPath(); ctx.arc(ix - 0.3, iy - 0.3, 1.6, 0, 7); ctx.fill(); ctx.globalAlpha = 1;
      });
    }
  };
  DRESS.vines = function (ctx, TR, R, s, salt, cache) { // creeping vines along walls & under ledges
    const p = new Path2D(), lf = new Path2D();
    for (const side of [1, 2]) {
      walkSurface(TR, R[0], R[1], R[2], R[3], side, s.step || 14, salt + side, (x, y, nx, ny, h) => {
        if (hf(h, 1) > (s.density || 0.15) * gate(s, x, y, salt)) return;
        const len = lerp(14, s.len || 60, hf(h, 2));
        const amp = 4 + hf(h, 3) * 4, dir = side === 1 ? 1 : 1;
        let px = x + nx * 1.5, py = y + ny * 1.5;
        p.moveTo(px, py);
        const segs = 6;
        for (let k = 1; k <= segs; k++) {
          const t = k / segs;
          const qx = x + nx * (1.5 + Math.sin(t * 6 + hf(h, 4) * 6) * amp * 0.5) + (side === 1 ? Math.sin(t * 5) * amp : 0);
          const qy = y + (side === 1 ? len * t : len * t * dir);
          p.lineTo(qx, qy);
          if (hf(h, 30 + k) < 0.55) {
            const d = hf(h, 40 + k) < 0.5 ? -1 : 1;
            lf.moveTo(qx, qy); lf.quadraticCurveTo(qx + d * 5, qy - 3, qx + d * 7, qy + 2); lf.quadraticCurveTo(qx + d * 3, qy + 3, qx, qy);
          }
          px = qx; py = qy;
        }
      });
    }
    ctx.strokeStyle = s.color || cache.pal.edge; ctx.lineWidth = s.width || 1.6; ctx.lineJoin = 'round'; ctx.stroke(p);
    ctx.fillStyle = s.color2 || s.color || cache.pal.edge; ctx.fill(lf);
  };
  DRESS.candles = function (ctx, TR, R, s, salt, cache) { // tiny melted candle stubs (unlit, wax)
    walkSurface(TR, R[0], R[1], R[2], R[3], 0, s.step || 11, salt, (x, y, nx, ny, h) => {
      if (hf(h, 1) > (s.density || 0.05) * gate(s, x, y, salt)) return;
      const n = 1 + Math.floor(hf(h, 2) * 3);
      for (let k = 0; k < n; k++) {
        const w = lerp(3, 6, hf(h, 3 + k)), hh = lerp(4, 14, hf(h, 6 + k));
        const bx = x + (k - (n - 1) / 2) * 6;
        ctx.fillStyle = s.color || cache.mat.wax;
        ctx.fillRect(bx - w / 2, y - hh, w, hh + 1);
        ctx.fillStyle = s.shade || cache.mat.waxShade; ctx.fillRect(bx + w * 0.15, y - hh, w * 0.35, hh + 1);
        ctx.fillStyle = s.color || cache.mat.wax;
        ctx.beginPath(); ctx.ellipse(bx, y + 0.5, w * 0.9, 1.6, 0, 0, 7); ctx.fill();
        ctx.strokeStyle = '#140f0c'; ctx.lineWidth = 1; ctx.beginPath(); ctx.moveTo(bx, y - hh); ctx.lineTo(bx + 0.5, y - hh - 2.5); ctx.stroke();
      }
    });
  };
  DRESS.custom = function (ctx, TR, R, s, salt, cache) { if (typeof s.fn === 'function') s.fn(ctx, TR, R, s, salt, cache, Terrain); };

  function drawDressing(ctx, TR, cache, R) {
    const st = TR.style;
    const lists = [st.wall, st.ceiling, st.floor];
    let salt = 1000;
    for (const list of lists) {
      if (!list) continue;
      for (const spec of list) {
        salt += 37;
        const fn = DRESS[spec.type];
        if (!fn) continue;
        ctx.save();
        try { fn(ctx, TR, R, spec, cache.seed + salt, cache); } catch (e) { Art.report(e, 'terrain.dress.' + spec.type); }
        ctx.restore();
      }
    }
  }

  // ---------------------------------------------------------------------------------------------
  // Spikes (styles). Local frame: base along +x from 0..len at y=0, points toward -y. Height ≈ 0.8 T.
  const SPIKES_STYLE = (Terrain.spikes = {});
  function spikeRow(len, h, per, fn) {
    const n = Math.max(1, Math.round((len / T) * per));
    for (let i = 0; i < n; i++) fn(((i + 0.5) / n) * len, i, n);
  }
  SPIKES_STYLE.iron = function (ctx, len, h0, cache, seed, o) {
    const m = cache.mat, pal = cache.pal;
    const iron = o.color || mix(m.iron, '#000000', 0.15), lite = o.color2 || mix(m.ironLight, pal.highlight, 0.45);
    ctx.fillStyle = 'rgba(0,0,0,0.6)'; ctx.fillRect(-3, -9, len + 6, 11);
    ctx.fillStyle = mix(iron, '#000000', 0.25); ctx.fillRect(-2, -8, len + 4, 9);
    ctx.fillStyle = lite; ctx.globalAlpha = 0.6; ctx.fillRect(-2, -8, len + 4, 1.6); ctx.globalAlpha = 1;
    spikeRow(len, h0, 3, (x, i) => {
      const h = h0 * (0.86 + 0.14 * h01(i, seed, 3)), w = 7.5;
      ctx.fillStyle = 'rgba(0,0,0,0.55)'; // outline for separation from the background
      ctx.beginPath(); ctx.moveTo(x - w - 1.5, -5); ctx.lineTo(x, -h - 2.5); ctx.lineTo(x + w + 1.5, -5); ctx.closePath(); ctx.fill();
      ctx.fillStyle = iron;
      ctx.beginPath(); ctx.moveTo(x - w, -5); ctx.lineTo(x, -h); ctx.lineTo(x + w, -5); ctx.closePath(); ctx.fill();
      ctx.fillStyle = lite;
      ctx.beginPath(); ctx.moveTo(x - w * 0.1, -5); ctx.lineTo(x, -h); ctx.lineTo(x - w * 0.8, -5); ctx.closePath(); ctx.fill();
      ctx.fillStyle = o.tip || '#ffffff'; ctx.globalAlpha = 0.85;
      ctx.beginPath(); ctx.moveTo(x - 1.6, -h + 7); ctx.lineTo(x, -h); ctx.lineTo(x + 1.1, -h + 7); ctx.closePath(); ctx.fill(); ctx.globalAlpha = 1;
    });
  };
  SPIKES_STYLE.thorns = function (ctx, len, h0, cache, seed, o) {
    const pal = cache.pal, vine = o.color || mix(cache.mat.leaf, '#000000', 0.45), tip = o.tip || pal.highlight;
    ctx.lineCap = 'round'; ctx.lineJoin = 'round';
    for (let s = 0; s < 3; s++) { // twisted stems
      ctx.strokeStyle = s === 2 ? mix(vine, pal.edge, 0.4) : vine; ctx.lineWidth = 4.5 - s;
      ctx.beginPath();
      for (let x = -4; x <= len + 4; x += 4) {
        const y = -6 - s * 4 - Math.sin(x * 0.09 + s * 2 + seed) * (5 + s * 2) - Math.sin(x * 0.23 + s) * 2;
        if (x === -4) ctx.moveTo(x, y); else ctx.lineTo(x, y);
      }
      ctx.stroke();
    }
    spikeRow(len, h0, 4.5, (x, i) => { // hooked thorns
      const r = h01(i, seed, 9), a = (r - 0.5) * 1.3, h = h0 * (0.55 + 0.45 * h01(i, seed, 4));
      const by = -8 - r * 10;
      const tx = x + Math.sin(a) * h * 0.5, ty = -h;
      ctx.fillStyle = vine;
      ctx.beginPath(); ctx.moveTo(x - 4, by + 3); ctx.quadraticCurveTo(x - 1, by - h * 0.4, tx, ty); ctx.quadraticCurveTo(x + 1.5, by - h * 0.3, x + 4, by + 3); ctx.closePath(); ctx.fill();
      ctx.strokeStyle = tip; ctx.lineWidth = 1.2; ctx.globalAlpha = 0.8;
      ctx.beginPath(); ctx.moveTo(tx, ty); ctx.quadraticCurveTo(x + 0.5, by - h * 0.4, x + 0.5, by - h * 0.15); ctx.stroke(); ctx.globalAlpha = 1;
    });
  };
  SPIKES_STYLE.ice = function (ctx, len, h0, cache, seed, o) {
    const ice = o.color || cache.mat.ice, pal = cache.pal;
    ctx.fillStyle = mix(ice, pal.fill, 0.5); ctx.fillRect(-2, -6, len + 4, 8);
    spikeRow(len, h0, 3.2, (x, i) => {
      const h = h0 * (0.6 + 0.4 * h01(i, seed, 3)), w = 4.5 + 4 * h01(i, seed, 5), lean = (h01(i, seed, 6) - 0.5) * 10;
      ctx.fillStyle = rgba(ice, 0.85);
      ctx.beginPath(); ctx.moveTo(x - w, -3); ctx.lineTo(x + lean, -h); ctx.lineTo(x + w, -3); ctx.closePath(); ctx.fill();
      ctx.fillStyle = rgba('#ffffff', 0.55);
      ctx.beginPath(); ctx.moveTo(x - w * 0.6, -3); ctx.lineTo(x + lean, -h); ctx.lineTo(x - w * 0.05, -3); ctx.closePath(); ctx.fill();
      ctx.strokeStyle = rgba('#ffffff', 0.8); ctx.lineWidth = 1;
      ctx.beginPath(); ctx.moveTo(x + lean, -h); ctx.lineTo(x + w * 0.9, -3); ctx.stroke();
    });
  };
  SPIKES_STYLE.crystal = function (ctx, len, h0, cache, seed, o) {
    const c1 = o.color || cache.mat.crystal, pal = cache.pal;
    spikeRow(len, h0, 2.6, (x, i) => {
      const h = h0 * (0.65 + 0.35 * h01(i, seed, 3)), w = 6 + 3 * h01(i, seed, 5), lean = (h01(i, seed, 6) - 0.5) * 8;
      ctx.fillStyle = mix(c1, '#000000', 0.35);
      ctx.beginPath(); ctx.moveTo(x - w, 0); ctx.lineTo(x - w * 0.8, -h * 0.65); ctx.lineTo(x + lean, -h); ctx.lineTo(x + w * 0.8, -h * 0.65); ctx.lineTo(x + w, 0); ctx.closePath(); ctx.fill();
      ctx.fillStyle = c1;
      ctx.beginPath(); ctx.moveTo(x - w * 0.2, 0); ctx.lineTo(x - w * 0.3, -h * 0.68); ctx.lineTo(x + lean, -h); ctx.lineTo(x + w * 0.8, -h * 0.65); ctx.lineTo(x + w, 0); ctx.closePath(); ctx.fill();
      ctx.fillStyle = 'rgba(255,255,255,0.7)';
      ctx.beginPath(); ctx.moveTo(x - w * 0.3, -h * 0.68); ctx.lineTo(x + lean, -h); ctx.lineTo(x + lean * 0.4, -h * 0.55); ctx.closePath(); ctx.fill();
      Art.glow(ctx, x + lean * 0.5, -h * 0.6, h * 0.9, o.glow || pal.accent, 0.25);
    });
  };
  SPIKES_STYLE.shards = function (ctx, len, h0, cache, seed, o) { // jagged slag / obsidian
    const c1 = o.color || mix(cache.pal.fill, '#000000', 0.2), edge = o.tip || cache.pal.highlight;
    ctx.fillStyle = c1; ctx.fillRect(-2, -6, len + 4, 8);
    spikeRow(len, h0, 3.4, (x, i) => {
      const h = h0 * (0.55 + 0.45 * h01(i, seed, 3)), w = 5 + 4 * h01(i, seed, 5), lean = (h01(i, seed, 6) - 0.5) * 12;
      ctx.fillStyle = c1;
      ctx.beginPath(); ctx.moveTo(x - w, -2); ctx.lineTo(x - w * 0.3, -h * 0.55); ctx.lineTo(x + lean, -h); ctx.lineTo(x + w * 0.4, -h * 0.4); ctx.lineTo(x + w, -2); ctx.closePath(); ctx.fill();
      ctx.strokeStyle = edge; ctx.lineWidth = 1.3; ctx.globalAlpha = 0.85;
      ctx.beginPath(); ctx.moveTo(x - w * 0.3, -h * 0.55); ctx.lineTo(x + lean, -h); ctx.lineTo(x + w * 0.4, -h * 0.4); ctx.stroke(); ctx.globalAlpha = 1;
    });
  };
  function drawSpikes(ctx, TR, cache, R) {
    const st = TR.style;
    const spec = typeof st.spikes === 'string' ? { type: st.spikes } : (st.spikes || { type: 'iron' });
    const fn = typeof spec === 'function' ? spec : (SPIKES_STYLE[spec.type] || SPIKES_STYLE.iron);
    for (const s of TR.spikes) {
      if (s.x1 < R[0] || s.x0 > R[2] || s.y1 < R[1] || s.y0 > R[3]) continue;
      ctx.save();
      const L = s.len * T;
      if (s.o === 0) ctx.translate(s.c * T, (s.r + 1) * T);
      else if (s.o === 2) { ctx.translate((s.c + s.len) * T, s.r * T); ctx.rotate(Math.PI); }
      else if (s.o === 1) { ctx.translate(s.c * T, s.r * T); ctx.rotate(Math.PI / 2); }
      else { ctx.translate((s.c + 1) * T, (s.r + s.len) * T); ctx.rotate(-Math.PI / 2); }
      try { fn(ctx, L, T * 0.82, cache, hashInt(s.c, s.r, cache.seed), spec); } catch (e) { Art.report(e, 'terrain.spikes'); }
      ctx.restore();
    }
  }

  // Platforms. Local frame: top surface at y=0 from x=0..len (px).
  const PLAT = (Terrain.platforms = {});
  // Stilts for free deck ends without a ceiling to hang from (sky rooms: theme bg 'sky'/openTop, or
  // terrain.platform.posts / theme.posts true; false disables): a post down to the ground or a lower deck.
  function postsOn(cache) {
    const th = cache.theme || {}, pl = (cache.cfg.terrain || {}).platform;
    if (th.posts !== undefined) return !!th.posts;
    if (pl && typeof pl === 'object' && pl.posts !== undefined) return !!pl.posts;
    return th.bg === 'sky' || !!th.openTop;
  }
  function platPosts(ctx, p, len, cache, mat) {
    if (!postsOn(cache)) return;
    const m = cache.mat, iron = mat === 'iron';
    const base = iron ? m.iron : mix(m.woodDark, '#000000', 0.15), side = mix(base, '#000000', 0.45), hi = iron ? m.ironLight : m.wood;
    const w = iron ? 5 : 7;
    const stilt = (x, k) => {
      const y1 = k * T + 4;                                // a little into the ground / onto the lower deck
      ctx.fillStyle = 'rgba(0,0,0,0.35)'; ctx.fillRect(x - w / 2 - 1, 8, w + 2, y1 - 8);   // separation from the sky
      ctx.fillStyle = base; ctx.fillRect(x - w / 2, 8, w, y1 - 8);
      ctx.fillStyle = side; ctx.fillRect(x + w / 2 - 2, 8, 2, y1 - 8);
      ctx.fillStyle = rgba(hi, 0.5); ctx.fillRect(x - w / 2, 8, 1.2, y1 - 8);
      ctx.fillStyle = side; ctx.fillRect(x - w / 2 - 2, y1 - 5, w + 4, 4);   // foot
      if (k >= 2) { // knee brace under the deck
        const dir = x < len / 2 ? 1 : -1;
        ctx.strokeStyle = base; ctx.lineWidth = iron ? 2 : 3; ctx.lineCap = 'round';
        ctx.beginPath(); ctx.moveTo(x, 34); ctx.lineTo(x + dir * 22, 11); ctx.stroke();
      }
    };
    const hangs = (up) => up && up < 9;
    if (!p.left && !hangs(p.upL) && p.postL) stilt(10, p.postL);
    if (!p.right && !hangs(p.upR) && p.postR) stilt(len - 10, p.postR);
    if (p.postM && !hangs(p.upL) && !hangs(p.upR)) stilt(Math.round(len / 2), p.postM);
  }
  function platSupports(ctx, p, len, cache, color, kind) {
    // chains/ropes to the ceiling for free ends; diagonal brackets into walls
    ctx.strokeStyle = color; ctx.lineWidth = kind === 'rope' ? 1.6 : 2;
    const hang = (x, up) => {
      if (!up) return;
      const top = -up * T + 2;
      if (kind === 'chain') {
        for (let y = -6; y > top; y -= 7) { ctx.beginPath(); ctx.ellipse(x, y - 3.5, 1.8, 3.6, 0, 0, 7); ctx.stroke(); }
      } else { ctx.beginPath(); ctx.moveTo(x, -4); ctx.lineTo(x, top); ctx.stroke(); }
    };
    if (!p.left && p.upL && p.upL < 9) hang(10, p.upL);
    if (!p.right && p.upR && p.upR < 9) hang(len - 10, p.upR);
    if (p.left) { ctx.beginPath(); ctx.moveTo(0, 18); ctx.lineTo(16, 6); ctx.stroke(); }
    if (p.right) { ctx.beginPath(); ctx.moveTo(len, 18); ctx.lineTo(len - 16, 6); ctx.stroke(); }
  }
  PLAT.wood = function (ctx, p, len, cache, seed, o) {
    const m = cache.mat, pal = cache.pal;
    platPosts(ctx, p, len, cache, 'wood');
    platSupports(ctx, p, len, cache, o.support || mix(m.woodDark, '#000000', 0.2), o.hang || 'rope');
    const th = 13;
    ctx.fillStyle = 'rgba(0,0,0,0.5)'; ctx.fillRect(-4, 3, len + 8, th);
    ctx.fillStyle = m.woodDark; ctx.fillRect(-3, 0, len + 6, th);
    ctx.fillStyle = m.wood; ctx.fillRect(-3, 2, len + 6, th - 6);
    let x = 0, i = 0;
    while (x < len) { // plank seams, grain, nails
      const w = 34 + h01(i, seed, 1) * 40, xe = Math.min(len, x + w);
      ctx.fillStyle = 'rgba(0,0,0,0.5)'; ctx.fillRect(xe, 1, 1.6, th - 2);
      ctx.fillStyle = 'rgba(0,0,0,0.22)'; ctx.fillRect(x + 4, 5 + h01(i, seed, 2) * 3, (xe - x) * 0.6, 1);
      ctx.fillStyle = 'rgba(255,255,255,0.08)'; ctx.fillRect(x + 8, 3, (xe - x) * 0.4, 1);
      ctx.fillStyle = 'rgba(0,0,0,0.65)'; ctx.fillRect(x + 4, 4, 2, 2); ctx.fillRect(xe - 5, 4, 2, 2);
      x += w; i++;
    }
    ctx.fillStyle = o.top || mix(m.woodLight, pal.highlight, 0.45); ctx.fillRect(-3, 0, len + 6, 2.4);
    ctx.fillStyle = 'rgba(0,0,0,0.55)'; ctx.fillRect(-3, th - 2, len + 6, 2);
    ctx.fillStyle = m.woodDark; // ragged ends
    if (!p.left) { ctx.beginPath(); ctx.moveTo(-3, 0); ctx.lineTo(-8, 4); ctx.lineTo(-4, th); ctx.closePath(); ctx.fill(); }
    if (!p.right) { ctx.beginPath(); ctx.moveTo(len + 3, 0); ctx.lineTo(len + 8, 5); ctx.lineTo(len + 4, th); ctx.closePath(); ctx.fill(); }
  };
  PLAT.iron = function (ctx, p, len, cache, seed, o) {
    const m = cache.mat, pal = cache.pal;
    platPosts(ctx, p, len, cache, 'iron');
    platSupports(ctx, p, len, cache, o.support || m.iron, 'chain');
    ctx.fillStyle = 'rgba(0,0,0,0.55)'; ctx.fillRect(-4, -1, len + 8, 19); // separation from busy backgrounds
    ctx.fillStyle = m.iron; ctx.fillRect(-2, 0, len + 4, 7);
    ctx.strokeStyle = m.iron; ctx.lineWidth = 2;
    ctx.beginPath(); // truss
    for (let x = 0; x <= len; x += 16) { ctx.moveTo(x, 6); ctx.lineTo(x + 8, 14); ctx.lineTo(x + 16, 6); }
    ctx.stroke();
    ctx.fillRect(-2, 13, len + 4, 3);
    ctx.fillStyle = o.top || mix(m.ironLight, pal.highlight, 0.35); ctx.fillRect(-2, 0, len + 4, 2.2);
    for (let x = 6; x < len; x += 20) { ctx.fillStyle = 'rgba(0,0,0,0.6)'; ctx.beginPath(); ctx.arc(x, 4, 1.6, 0, 7); ctx.fill(); ctx.fillStyle = m.ironLight; ctx.beginPath(); ctx.arc(x - 0.4, 3.6, 0.9, 0, 7); ctx.fill(); }
    if (o.glow) { ctx.fillStyle = rgba(o.glow, 0.5); ctx.fillRect(0, 15, len, 1); }
  };
  PLAT.stone = function (ctx, p, len, cache, seed, o) {
    const m = cache.mat;
    platPosts(ctx, p, len, cache, 'iron');
    platSupports(ctx, p, len, cache, o.support || m.iron, o.hang || 'chain');
    ctx.fillStyle = 'rgba(0,0,0,0.5)'; ctx.fillRect(-4, -1, len + 8, 17);
    ctx.fillStyle = m.stoneDark; ctx.fillRect(-2, 0, len + 4, 14);
    ctx.fillStyle = m.stone; ctx.fillRect(-2, 0, len + 4, 9);
    ctx.fillStyle = 'rgba(0,0,0,0.35)'; ctx.fillRect(-2, 9, len + 4, 1.5);
    for (let x = 0, i = 0; x < len; i++) { const w = 50 + h01(i, seed, 1) * 40; ctx.fillStyle = 'rgba(0,0,0,0.4)'; ctx.fillRect(Math.min(len - 1, x + w), 0, 1.2, 14); x += w; }
    ctx.fillStyle = o.top || mix(m.stoneLight, cache.pal.highlight, 0.3); ctx.fillRect(-2, 0, len + 4, 2.2);
    if (o.trim) { ctx.fillStyle = o.trim; ctx.fillRect(-2, 11, len + 4, 1.2); }
    if (p.left) { ctx.fillStyle = m.stoneDark; ctx.beginPath(); ctx.moveTo(0, 14); ctx.lineTo(14, 14); ctx.lineTo(0, 28); ctx.closePath(); ctx.fill(); }
    if (p.right) { ctx.fillStyle = m.stoneDark; ctx.beginPath(); ctx.moveTo(len, 14); ctx.lineTo(len - 14, 14); ctx.lineTo(len, 28); ctx.closePath(); ctx.fill(); }
  };
  PLAT.wax = function (ctx, p, len, cache, seed, o) {
    const m = cache.mat;
    platPosts(ctx, p, len, cache, o.posts || 'wood');   // sky rooms / theme.posts only (no-op elsewhere)
    const c = o.color || m.wax, sh = o.shade || m.waxShade;
    ctx.fillStyle = sh;
    ctx.beginPath(); ctx.moveTo(-4, 2);
    ctx.quadraticCurveTo(-6, 12, 2, 12);
    for (let x = 6; x < len; x += 9) {
      const d = h01(x, seed, 2), dl = d < 0.3 ? 6 + d * 30 : 2 + d * 3;
      ctx.lineTo(x - 2.5, 12); ctx.quadraticCurveTo(x - 2, 12 + dl, x, 12 + dl); ctx.quadraticCurveTo(x + 2, 12 + dl, x + 2.5, 12);
    }
    ctx.lineTo(len - 2, 12); ctx.quadraticCurveTo(len + 6, 12, len + 4, 2); ctx.closePath(); ctx.fill();
    ctx.fillStyle = c;
    ctx.beginPath(); ctx.moveTo(-4, 1); ctx.quadraticCurveTo(-5, 8, 2, 8); ctx.lineTo(len - 2, 8); ctx.quadraticCurveTo(len + 5, 8, len + 4, 1); ctx.quadraticCurveTo(len / 2, -1.5, -4, 1); ctx.fill();
    ctx.fillStyle = 'rgba(255,255,255,0.55)'; ctx.fillRect(0, 0, len, 1.4);
  };
  PLAT.ice = function (ctx, p, len, cache, seed, o) {
    const ice = o.color || cache.mat.ice;
    platPosts(ctx, p, len, cache, o.posts || 'iron');   // sky rooms / theme.posts only (no-op elsewhere)
    ctx.fillStyle = rgba(ice, 0.85); ctx.fillRect(-3, 0, len + 6, 10);
    for (let x = 4; x < len; x += 7) {
      const d = h01(x, seed, 2); if (d > 0.55) continue;
      const l = 4 + d * 24;
      ctx.fillStyle = rgba(ice, 0.75); ctx.beginPath(); ctx.moveTo(x - 3, 9); ctx.lineTo(x, 9 + l); ctx.lineTo(x + 3, 9); ctx.closePath(); ctx.fill();
    }
    ctx.fillStyle = 'rgba(255,255,255,0.85)'; ctx.fillRect(-3, 0, len + 6, 2);
    ctx.fillStyle = 'rgba(255,255,255,0.3)'; ctx.fillRect(4, 4, len - 8, 1);
  };
  PLAT.branch = function (ctx, p, len, cache, seed, o) {
    const m = cache.mat, c = o.color || m.woodDark, silk = o.silk || m.silk;
    platSupports(ctx, p, len, cache, rgba(silk, 0.5), 'rope');
    const body = new Path2D();
    body.moveTo(-6, 3);
    for (let x = 0; x <= len; x += 10) body.lineTo(x, -0.5 + Math.sin(x * 0.2 + seed) * 0.5);
    body.lineTo(len + 6, 3); body.lineTo(len + 2, 12);
    for (let x = len; x >= 0; x -= 10) body.lineTo(x, 12 + Math.sin(x * 0.13) * 1.5);
    body.closePath();
    ctx.strokeStyle = 'rgba(0,0,0,0.6)'; ctx.lineWidth = 3; ctx.lineJoin = 'round'; ctx.stroke(body); // separation outline
    ctx.fillStyle = c; ctx.fill(body);
    ctx.fillStyle = rgba(m.woodLight, 0.35); ctx.fillRect(0, 3, len, 2); // bark grain
    ctx.fillStyle = o.top || mix(m.woodLight, cache.pal.highlight, 0.4); ctx.fillRect(-2, -0.5, len + 4, 2.2);
    ctx.strokeStyle = rgba(silk, 0.55); ctx.lineWidth = 1;
    for (let x = 12; x < len; x += 26 + h01(x, seed, 4) * 20) { for (let k = 0; k < 3; k++) { ctx.beginPath(); ctx.moveTo(x + k * 2, 0); ctx.lineTo(x + k * 2 + 4, 11); ctx.stroke(); } }
  };
  PLAT.gold = function (ctx, p, len, cache, seed, o) {
    const m = cache.mat, pal = cache.pal;
    platPosts(ctx, p, len, cache, 'iron');
    platSupports(ctx, p, len, cache, o.support || rgba(m.gold, 0.7), 'chain');
    ctx.fillStyle = 'rgba(0,0,0,0.55)'; ctx.fillRect(-4, -1, len + 8, 16);
    ctx.fillStyle = mix(pal.fill, '#000000', 0.2); ctx.fillRect(-2, 0, len + 4, 13);
    ctx.fillStyle = m.gold; ctx.fillRect(-2, 0, len + 4, 3); ctx.fillRect(-2, 11, len + 4, 1.4);
    for (let x = 10; x < len - 4; x += 24) { ctx.fillStyle = m.gold; ctx.beginPath(); ctx.moveTo(x, 4); ctx.lineTo(x + 3, 6.5); ctx.lineTo(x, 9); ctx.lineTo(x - 3, 6.5); ctx.closePath(); ctx.fill(); }
    ctx.fillStyle = m.goldLight; ctx.fillRect(-2, 0, len + 4, 1.4);
    for (let x = 20; x < len; x += 60) Art.glow(ctx, x, 1, 22, pal.accent, 0.3);
  };
  function drawPlatforms(ctx, TR, cache, R) {
    const st = TR.style;
    const spec = typeof st.platform === 'string' ? { type: st.platform } : (st.platform || { type: 'wood' });
    const fn = typeof spec === 'function' ? spec : (PLAT[spec.type] || PLAT.wood);
    for (const p of TR.plats) {
      if (p.x1 < R[0] || p.x0 > R[2] || p.y1 < R[1] || p.y0 > R[3]) continue;
      ctx.save();
      ctx.translate(p.c * T, p.r * T);
      try { fn(ctx, p, p.len * T, cache, hashInt(p.c, p.r, cache.seed), spec); } catch (e) { Art.report(e, 'terrain.platform'); }
      ctx.restore();
    }
  }

  // ---------------------------------------------------------------------------------------------
  // Chunks
  function tileRectPath(g, code, rx0, ry0, rx1, ry1, pred) {
    const c0 = Math.max(0, Math.floor(rx0 / T) + M), c1 = Math.min(g.ex - 1, Math.floor(rx1 / T) + M);
    const r0 = Math.max(0, Math.floor(ry0 / T) + M), r1 = Math.min(g.ey - 1, Math.floor(ry1 / T) + M);
    const p = new Path2D();
    let any = false;
    for (let y = r0; y <= r1; y++) {
      for (let x = c0; x <= c1; x++) {
        if (!pred(code[y * g.ex + x])) continue;
        let x2 = x;
        while (x2 + 1 <= c1 && pred(code[y * g.ex + x2 + 1])) x2++;
        p.rect((x - M) * T, (y - M) * T, (x2 - x + 1) * T, T);
        any = true;
        x = x2;
      }
    }
    return any ? p : null;
  }

  function chunkHasContent(TR, ch) {
    const g = TR.grid;
    const c0 = Math.floor(ch.x / T) - 1 + M, c1 = Math.floor((ch.x + ch.w) / T) + 1 + M;
    const r0 = Math.floor(ch.y / T) - 1 + M, r1 = Math.floor((ch.y + ch.h) / T) + 1 + M;
    let solid = 0, total = 0, other = 0;
    for (let y = Math.max(0, r0); y <= Math.min(g.ey - 1, r1); y++) for (let x = Math.max(0, c0); x <= Math.min(g.ex - 1, c1); x++) {
      const v = g.code[y * g.ex + x];
      total++;
      if (isSolid(v)) solid++; else if (v === SPIKES || v === PLATFORM) other++;
    }
    if (!solid && !other) return 0; // empty
    // fully interior: every tile within 3 tiles is solid → flat fill
    if (solid === total) {
      let deep = true;
      for (let y = Math.max(0, r0 - 2); y <= Math.min(g.ey - 1, r1 + 2) && deep; y++) for (let x = Math.max(0, c0 - 2); x <= Math.min(g.ex - 1, c1 + 2); x++) {
        if (!isSolid(g.code[y * g.ex + x])) { deep = false; break; }
      }
      if (deep) return 2;
    }
    // platforms need room above for supports; plain content
    return 1;
  }

  function renderChunk(cache, ch) {
    const TR = cache.terrain, st = TR.style;
    if (!ch.canvas) { const mc = makeCanvas(ch.w, ch.h); ch.canvas = mc.canvas; ch.ctx = mc.ctx; }
    const ctx = ch.ctx;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.globalAlpha = 1; ctx.globalCompositeOperation = 'source-over';
    ctx.clearRect(0, 0, ch.w, ch.h);
    // the body sets line state (lineJoin/lineCap...) outside save(): restore it so a re-render (wall broken)
    // starts from the same context state as the first one and draws the same pixels
    ctx.save();
    ctx.translate(-ch.x, -ch.y);
    ctx.imageSmoothingEnabled = true;
    const rx0 = ch.x - CM, ry0 = ch.y - CM, rx1 = ch.x + ch.w + CM, ry1 = ch.y + ch.h + CM;
    const R = [rx0, ry0, rx1, ry1];
    const body = regionPath(TR.loops, rx0, ry0, rx1, ry1);
    // soft dark aura outside the terrain (separates it from the background)
    if (st.aura.alpha > 0) ctx.drawImage(TR.auraCanvas, TR.dfX, TR.dfY, TR.dfW, TR.dfH);
    if (body) {
      ctx.save();
      ctx.clip(body);
      ctx.drawImage(TR.dfCanvas, TR.dfX, TR.dfY, TR.dfW, TR.dfH);
      // texture (luminance modulation), skipped on glazed areas
      const xr = tileRectPath(TR.grid, TR.grid.code, rx0, ry0, rx1, ry1, (v) => v === GLAZED);
      ctx.save();
      if (xr) { const ex = new Path2D(); ex.addPath(body); ex.addPath(xr); ctx.clip(ex, 'evenodd'); }
      ctx.globalCompositeOperation = 'overlay';
      ctx.globalAlpha = st.texStrength;
      ctx.fillStyle = TR.tex.pattern;
      ctx.fillRect(ch.x, ch.y, ch.w, ch.h);
      ctx.restore();
      if (st.interior) { try { st.interior(ctx, TR, R, cache, Terrain); } catch (e) { Art.report(e, 'terrain.interior'); } }
      // glazed sheen: soft bloom + crisp specular lines just inside the face
      if (xr) {
        ctx.save();
        ctx.clip(xr);
        const gl = (L, k) => L.mat[k] === GLAZED;
        const face = linePath(TR.loops, rx0, ry0, rx1, ry1, gl, 0);
        if (face) {
          ctx.lineJoin = 'round';
          ctx.strokeStyle = rgba(st.glaze.sheen || '#ffffff', 0.10); ctx.lineWidth = 30; ctx.stroke(face);
          ctx.strokeStyle = rgba(st.glaze.sheen || '#ffffff', 0.12); ctx.lineWidth = 12; ctx.stroke(face);
          const s1 = linePath(TR.loops, rx0, ry0, rx1, ry1, gl, 4.5), s2 = linePath(TR.loops, rx0, ry0, rx1, ry1, gl, 10);
          if (s1) { ctx.strokeStyle = rgba(st.glaze.sheen || '#ffffff', 0.55); ctx.lineWidth = 1.6; ctx.stroke(s1); }
          if (s2) { ctx.strokeStyle = rgba(st.glaze.sheen || '#ffffff', 0.18); ctx.lineWidth = 3; ctx.stroke(s2); }
        }
        // diagonal glints across glazed faces
        const g = TR.grid;
        ctx.fillStyle = rgba(st.glaze.sheen || '#ffffff', 0.07);
        for (let y = Math.max(0, Math.floor(ry0 / T) + M); y <= Math.min(g.ey - 1, Math.floor(ry1 / T) + M); y++) {
          for (let x = Math.max(0, Math.floor(rx0 / T) + M); x <= Math.min(g.ex - 1, Math.floor(rx1 / T) + M); x++) {
            if (g.code[y * g.ex + x] !== GLAZED || h01(x, y, cache.seed + 77) > 0.35) continue;
            const wx = (x - M) * T, wy = (y - M) * T, o2 = h01(x, y, 5) * T;
            ctx.beginPath(); ctx.moveTo(wx, wy + o2 + 14); ctx.lineTo(wx + T, wy + o2 - 6); ctx.lineTo(wx + T, wy + o2 + 2); ctx.lineTo(wx, wy + o2 + 22); ctx.closePath(); ctx.fill();
          }
        }
        ctx.restore();
      }
      ctx.restore();
      // crisp lit line along top surfaces (not under liquids/spikes)
      const top = linePath(TR.loops, rx0, ry0, rx1, ry1, (L, k) => L.ny[k] < -0.5 && L.mat[k] !== GLAZED && (L.adj[k] === EMPTY || L.adj[k] === BGWALL || L.adj[k] === PLATFORM), 0.6);
      if (top && st.topLine.alpha > 0) {
        ctx.lineJoin = 'round'; ctx.lineCap = 'round';
        ctx.strokeStyle = rgba(st.topLine.color || cache.pal.highlight, st.topLine.alpha);
        ctx.lineWidth = st.topLine.width; ctx.stroke(top);
      }
      if (st.sideLine.alpha > 0) {
        const side = linePath(TR.loops, rx0, ry0, rx1, ry1, (L, k) => L.ny[k] >= -0.5 && L.mat[k] !== GLAZED, 0.5);
        if (side) { ctx.strokeStyle = rgba(st.sideLine.color || cache.pal.edge, st.sideLine.alpha); ctx.lineWidth = st.sideLine.width; ctx.stroke(side); }
      }
      // glazed outline: bright & even (reads as smooth/glossy)
      const gface = linePath(TR.loops, rx0, ry0, rx1, ry1, (L, k) => L.mat[k] === GLAZED, 0.8);
      if (gface) { ctx.strokeStyle = rgba(st.glaze.line || st.glaze.sheen || '#ffffff', st.glaze.lineAlpha || 0.5); ctx.lineWidth = 1.5; ctx.stroke(gface); }
    }
    drawDressing(ctx, TR, cache, R);
    if (TR.spikes.length) drawSpikes(ctx, TR, cache, R);
    if (TR.plats.length) drawPlatforms(ctx, TR, cache, R);
    ctx.restore();
    ch.state = 2;
  }

  function makeChunks(TR, cache) {
    const W = cache.W, H = cache.H;
    const nx = Math.ceil(W / CHUNK), ny = Math.ceil(H / CHUNK);
    const chunks = new Array(nx * ny);
    for (let j = 0; j < ny; j++) for (let i = 0; i < nx; i++) {
      const ch = { i, j, x: i * CHUNK, y: j * CHUNK, w: Math.min(CHUNK, W - i * CHUNK), h: Math.min(CHUNK, H - j * CHUNK), canvas: null, ctx: null, state: 0, kind: 0 };
      ch.kind = chunkHasContent(TR, ch); // 0 empty, 1 render, 2 flat
      chunks[j * nx + i] = ch;
    }
    TR.nx = nx; TR.ny = ny; TR.chunks = chunks;
  }

  // ---------------------------------------------------------------------------------------------
  // BG walls (':'): dim interior walls drawn behind everything in the world layer.
  function buildBgWalls(room, TR, cache) {
    TR.bgLoops = null; TR.bgChunks = [];
    const g = TR.grid;
    let any = false;
    for (let i = 0; i < g.code.length; i++) if (g.code[i] === BGWALL) { any = true; break; }
    if (!any) return;
    // (radius must keep the floor/glazed keys: a partial object made every floor corner NaN and the walls vanished)
    TR.bgLoops = buildContours(g, Object.assign({}, TR.style, { amp: { floor: 4, wall: 5, ceil: 5 }, radius: Object.assign({}, TR.style.radius, { convex: 16, concave: 6 }) }), cache.seed + 9, (v) => v === BGWALL || isSolid(v));
    for (const ch of TR.chunks) {
      const c0 = Math.floor(ch.x / T) + M, c1 = Math.floor((ch.x + ch.w - 1) / T) + M, r0 = Math.floor(ch.y / T) + M, r1 = Math.floor((ch.y + ch.h - 1) / T) + M;
      let has = false;
      for (let y = r0; y <= r1 && !has; y++) for (let x = c0; x <= c1; x++) if (g.code[y * g.ex + x] === BGWALL) { has = true; break; }
      TR.bgChunks.push(has ? { x: ch.x, y: ch.y, w: ch.w, h: ch.h, canvas: null, state: 1 } : null);
    }
  }
  function renderBgChunk(cache, bc) {
    const TR = cache.terrain, pal = cache.pal, st = TR.style;
    if (!bc.canvas) { const mc = makeCanvas(bc.w, bc.h); bc.canvas = mc.canvas; bc.ctx = mc.ctx; }
    const ctx = bc.ctx;
    ctx.setTransform(1, 0, 0, 1, 0, 0); ctx.clearRect(0, 0, bc.w, bc.h);
    ctx.translate(-bc.x, -bc.y);
    const rx0 = bc.x - CM, ry0 = bc.y - CM, rx1 = bc.x + bc.w + CM, ry1 = bc.y + bc.h + CM;
    const path = regionPath(TR.bgLoops, rx0, ry0, rx1, ry1);
    if (!path) { bc.state = 2; return; }
    ctx.save();
    ctx.clip(path);
    const base = st.bgwall || pal.bgwall;
    ctx.fillStyle = base; ctx.fillRect(bc.x, bc.y, bc.w, bc.h);
    ctx.globalCompositeOperation = 'overlay';
    ctx.globalAlpha = Math.min(1, st.bgwallTex === undefined ? 0.8 : st.bgwallTex);
    ctx.fillStyle = (TR.bgTex || TR.tex).pattern; ctx.fillRect(bc.x, bc.y, bc.w, bc.h);
    ctx.globalAlpha = 1; ctx.globalCompositeOperation = 'source-over';
    // gloom toward the top + contact shadow along the terrain
    const gr = ctx.createLinearGradient(0, bc.y, 0, bc.y + bc.h);
    gr.addColorStop(0, rgba(pal.fillDeep, 0.22)); gr.addColorStop(1, rgba(pal.fillDeep, 0.04));
    ctx.fillStyle = gr; ctx.fillRect(bc.x, bc.y, bc.w, bc.h);
    ctx.globalAlpha = 0.8;
    ctx.drawImage(TR.auraCanvas, TR.dfX, TR.dfY, TR.dfW, TR.dfH);
    ctx.globalAlpha = 1;
    if (st.bgwallDecor) { try { st.bgwallDecor(ctx, TR, [rx0, ry0, rx1, ry1], cache, Terrain); } catch (e) { Art.report(e, 'terrain.bgwallDecor'); } }
    ctx.restore();
    // feather the edges where the wall ends in open air (reads as recessed, never as solid)
    ctx.save();
    ctx.lineJoin = 'round';
    ctx.globalCompositeOperation = 'destination-out';
    ctx.strokeStyle = 'rgba(0,0,0,0.35)'; ctx.lineWidth = 22; ctx.stroke(path);
    ctx.strokeStyle = 'rgba(0,0,0,0.55)'; ctx.lineWidth = 10; ctx.stroke(path);
    ctx.restore();
    bc.state = 2;
  }

  // ---------------------------------------------------------------------------------------------
  // Breakable sprites (cracks for 'B', glowing fissures for 'D')
  function buildBreakSprites(room, TR, cache) {
    const sprites = [];
    const pal = cache.pal, st = TR.style;
    for (const comp of TR.comps) {
      const x0 = comp.c0 * T - 6, y0 = comp.r0 * T - 6, w = (comp.c1 - comp.c0 + 1) * T + 12, h = (comp.r1 - comp.r0 + 1) * T + 12;
      const rng = new U.Rng(U.hashStr(comp.id) ^ cache.seed);
      const clip = new Path2D();
      for (const [c, r] of comp.tiles) clip.rect(c * T, r * T, T, T);
      const body = regionPath(TR.loops, x0 - 8, y0 - 8, x0 + w + 8, y0 + h + 8);
      const mkLayer = (fn) => {
        const mc = makeCanvas(w, h);
        const ctx = mc.ctx;
        ctx.translate(-x0, -y0);
        ctx.save();
        ctx.clip(clip);
        if (body) ctx.clip(body);
        fn(ctx);
        ctx.restore();
        return mc.canvas;
      };
      const cracks = (ctx, n, width, alpha) => {
        for (let i = 0; i < n; i++) {
          const [c, r] = comp.tiles[rng.int(0, comp.tiles.length - 1)];
          let x = (c + rng.range(0.15, 0.85)) * T, y = (r + rng.range(0.15, 0.85)) * T;
          let a = rng.range(0, Math.PI * 2);
          const pts = [[x, y]];
          const segs = rng.int(3, 6);
          for (let k = 0; k < segs; k++) { a += rng.range(-0.9, 0.9); const l = rng.range(6, 15); x += Math.cos(a) * l; y += Math.sin(a) * l; pts.push([x, y]); }
          const draw = (dx, dy, col, wd) => {
            ctx.strokeStyle = col; ctx.lineWidth = wd; ctx.lineJoin = 'miter'; ctx.lineCap = 'round';
            ctx.beginPath(); ctx.moveTo(pts[0][0] + dx, pts[0][1] + dy);
            for (let k = 1; k < pts.length; k++) ctx.lineTo(pts[k][0] + dx, pts[k][1] + dy);
            ctx.stroke();
          };
          draw(1, 1, rgba(st.breakable.chip || pal.edge, 0.55 * alpha), width * 0.7);
          draw(0, 0, rgba(st.breakable.crack || pal.crack, alpha), width);
          if (rng.chance(0.5)) { // branch
            const [bx, by] = pts[rng.int(1, pts.length - 1)], ba = a + rng.range(-1.6, 1.6), bl = rng.range(6, 12);
            ctx.lineWidth = width * 0.6; ctx.strokeStyle = rgba(st.breakable.crack || pal.crack, alpha);
            ctx.beginPath(); ctx.moveTo(bx, by); ctx.lineTo(bx + Math.cos(ba) * bl, by + Math.sin(ba) * bl); ctx.stroke();
          }
        }
      };
      const spr = { id: comp.id, code: comp.code, comp, x0, y0, w, h, canvas: null, hit1: null, hit2: null, glow: null };
      if (comp.code === BREAKABLE) {
        const per = comp.tiles.length;
        spr.canvas = mkLayer((ctx) => {
          // mottled chips: slightly lighter patches give attentive players a hint
          for (const [c, r] of comp.tiles) {
            for (let k = 0; k < 3; k++) {
              ctx.fillStyle = rgba(pal.edge, rng.range(0.05, 0.13));
              ctx.beginPath(); ctx.ellipse((c + rng.next()) * T, (r + rng.next()) * T, rng.range(5, 12), rng.range(3, 8), rng.range(0, 3), 0, 7); ctx.fill();
            }
          }
          cracks(ctx, Math.max(2, Math.round(per * 1.3)), 1.6, 0.85);
        });
        spr.hit1 = mkLayer((ctx) => cracks(ctx, Math.max(2, Math.round(per * 1.4)), 2.2, 0.95));
        spr.hit2 = mkLayer((ctx) => {
          cracks(ctx, Math.max(3, Math.round(per * 2)), 2.8, 1);
          for (let k = 0; k < per; k++) { // missing chunks
            const [c, r] = comp.tiles[rng.int(0, per - 1)];
            ctx.fillStyle = rgba(pal.fillDeep, 0.85);
            ctx.beginPath(); const cx = (c + rng.range(0.2, 0.8)) * T, cy = (r + rng.range(0.2, 0.8)) * T, rr = rng.range(3, 6);
            ctx.moveTo(cx - rr, cy); ctx.lineTo(cx, cy - rr * 0.8); ctx.lineTo(cx + rr, cy + rr * 0.2); ctx.lineTo(cx - rr * 0.2, cy + rr); ctx.closePath(); ctx.fill();
          }
        });
      } else {
        // fissures: jagged lines mostly across the top surface, branching downward
        const lines = [];
        const tops = comp.tiles.filter(([c, r]) => !comp.tiles.some(([c2, r2]) => c2 === c && r2 === r - 1));
        const nLines = Math.max(2, Math.round(tops.length * 1.2));
        for (let i = 0; i < nLines; i++) {
          const [c, r] = tops[rng.int(0, tops.length - 1)];
          let x = (c + rng.range(0.1, 0.9)) * T, y = r * T + rng.range(1, 4);
          const pts = [[x, y]];
          let a = Math.PI / 2 + rng.range(-0.9, 0.9);
          const segs = rng.int(3, 6);
          for (let k = 0; k < segs; k++) { a += rng.range(-0.8, 0.8); a = clamp(a, 0.2, Math.PI - 0.2); const l = rng.range(5, 12); x += Math.cos(a) * l; y += Math.sin(a) * l; pts.push([x, y]); }
          lines.push(pts);
        }
        // a zigzag seam across the top
        for (const [c, r] of tops) {
          const pts = [];
          for (let k = 0; k <= 4; k++) pts.push([(c + k / 4) * T, r * T + 3 + rng.range(0, 6)]);
          lines.push(pts);
        }
        const stroke = (ctx, col, wd) => {
          ctx.strokeStyle = col; ctx.lineWidth = wd; ctx.lineJoin = 'round'; ctx.lineCap = 'round';
          for (const pts of lines) { ctx.beginPath(); ctx.moveTo(pts[0][0], pts[0][1]); for (let k = 1; k < pts.length; k++) ctx.lineTo(pts[k][0], pts[k][1]); ctx.stroke(); }
        };
        const fis = st.dive.glow || pal.fissure;
        spr.canvas = mkLayer((ctx) => { stroke(ctx, rgba(pal.fillDeep, 0.9), 4); stroke(ctx, rgba(mix(fis, '#000000', 0.45), 0.9), 2); });
        spr.glow = mkLayer((ctx) => { stroke(ctx, rgba(fis, 0.35), 7); stroke(ctx, rgba(fis, 0.9), 1.8); stroke(ctx, rgba('#ffffff', 0.7), 0.7); });
        spr.fis = fis;
        spr.topX = tops.map(([c, r]) => [(c + 0.5) * T, r * T]);
      }
      sprites.push(spr);
    }
    TR.breakSprites = sprites;
  }

  // ---------------------------------------------------------------------------------------------
  // Build / rebuild
  Terrain.build = function (room, cache) {
    const TR = (cache.terrain = { style: styleOf(cache) });
    const tm = cache.timing;
    let t0 = U.now();
    const lap = (k) => { const t1 = U.now(); tm['t.' + k] = +(t1 - t0).toFixed(1); t0 = t1; };
    TR.grid = buildGrid(room, cache);
    TR.tex = textureFor(cache); lap('tex');
    buildLiquids(room, TR, cache);
    TR.loops = buildContours(TR.grid, TR.style, cache.seed, isSolid); lap('contours');
    buildShading(TR, cache); lap('shading');
    buildRuns(room, TR);
    makeChunks(TR, cache);
    buildBgWalls(room, TR, cache); lap('runs+bgwalls');
    buildComponents(room, TR, cache);
    buildBreakSprites(room, TR, cache); lap('breakables');
    initVeil(room, cache);
  };

  function focusPoint(room, cache) {
    try {
      const p = G.game && G.game.player;
      if (p && (p.room === room || (p.room && p.room.id === room.id))) return [p.x + (p.w || 0) / 2, p.y + (p.h || 0) / 2];
    } catch (e) { /* ignore */ }
    return [cache.W / 2, cache.H / 2];
  }
  Terrain.renderInitial = function (room, cache) {
    const TR = cache.terrain;
    if (!TR) return;
    const [fx, fy] = focusPoint(room, cache);
    const order = TR.chunks.filter((c) => c.kind === 1).sort((a, b) =>
      Math.hypot(a.x + a.w / 2 - fx, a.y + a.h / 2 - fy) - Math.hypot(b.x + b.w / 2 - fx, b.y + b.h / 2 - fy));
    const t0 = U.now();
    let done = 0;
    for (const ch of order) {
      if (U.now() - t0 > INIT_BUDGET_MS && done > 0) break;
      renderChunk(cache, ch); done++;
    }
    // BG-wall chunks share the budget (nearest first); the rest render lazily / via prefetch.
    const bgOrder = TR.bgChunks.filter(Boolean).sort((a, b) =>
      Math.hypot(a.x + a.w / 2 - fx, a.y + a.h / 2 - fy) - Math.hypot(b.x + b.w / 2 - fx, b.y + b.h / 2 - fy));
    let bgDone = 0;
    for (const bc of bgOrder) {
      if (U.now() - t0 > INIT_BUDGET_MS && bgDone > 0) break;
      renderBgChunk(cache, bc); bgDone++;
    }
    TR.bgPending = bgOrder.length - bgDone;
    TR.pending = order.length - done;
    // secret-pocket veils are needed on the first frame the pocket is seen: build them now (room load, behind the fade)
    if (cache.veil && !cache.veil.sprites) { try { buildVeilSprites(room, cache); } catch (e) { Art.report(e, 'terrain.veil'); } }
    cache.timing.chunksRendered = done; cache.timing.chunksPending = TR.pending;
  };

  // Grow box [x0, y0, x1, y1] over every contour segment that differs between two loop sets (a broken wall can
  // move points far along a straight run: corner subdivision depends on the run's length).
  const F32 = new Float32Array(6), I32 = new Int32Array(F32.buffer);
  function loopsDiffBox(A, B, box) {
    // segment key: two 32-bit hashes of the float bits (point, normal, material, next point) -> one 53-bit number
    const key = (L, i) => {
      const j = (i + 1) % L.n;
      F32[0] = L.xs[i]; F32[1] = L.ys[i]; F32[2] = L.nx[i]; F32[3] = L.ny[i]; F32[4] = L.xs[j]; F32[5] = L.ys[j];
      let h1 = 0x811c9dc5 ^ (L.mat[i] | (L.adj[i] << 8)), h2 = 0x2545f491;
      for (let k = 0; k < 6; k++) { h1 = Math.imul(h1 ^ I32[k], 0x01000193); h2 = Math.imul(h2 ^ I32[k], 0x5bd1e995); h2 ^= h2 >>> 15; }
      return (h1 >>> 0) * 0x200000 + (h2 >>> 11);
    };
    const grow = (L, i) => {
      for (let d = -1; d <= 2; d++) {
        const k = (i + d + L.n) % L.n, x = L.xs[k], y = L.ys[k];
        if (x < box[0]) box[0] = x; if (y < box[1]) box[1] = y; if (x > box[2]) box[2] = x; if (y > box[3]) box[3] = y;
      }
    };
    // loops present unchanged in both sets are skipped (cheap typed-array compare); points of the rest are diffed
    const same = (L, K) => {
      if (L.n !== K.n || L.x0 !== K.x0 || L.y0 !== K.y0 || L.x1 !== K.x1 || L.y1 !== K.y1) return false;
      for (let i = 0; i < L.n; i++) if (L.xs[i] !== K.xs[i] || L.ys[i] !== K.ys[i] || L.nx[i] !== K.nx[i] || L.ny[i] !== K.ny[i] || L.mat[i] !== K.mat[i] || L.adj[i] !== K.adj[i]) return false;
      return true;
    };
    const P = (A || []).slice(), Q = [];
    for (const L of B || []) {
      const k = P.findIndex((K) => same(L, K));
      if (k >= 0) P.splice(k, 1); else Q.push(L);
    }
    const one = (X, Y) => {
      const set = new Set();
      for (const L of X) for (let i = 0; i < L.n; i++) set.add(key(L, i));
      for (const L of Y) for (let i = 0; i < L.n; i++) if (!set.has(key(L, i))) grow(L, i);
    };
    one(P, Q); one(Q, P);
    return box;
  }
  function runsDiffBox(A, B, box) {
    const key = (o) => JSON.stringify(o);
    const one = (P, Q) => {
      const set = new Set(P.map(key));
      for (const o of Q) if (!set.has(key(o))) { box[0] = Math.min(box[0], o.x0); box[1] = Math.min(box[1], o.y0); box[2] = Math.max(box[2], o.x1); box[3] = Math.max(box[3], o.y1); }
    };
    one(A, B); one(B, A);
    return box;
  }

  // Tiles in (c0..c1, r0..r1) changed (a wall broke). Contours / runs / bg loops are cheap and rebuilt whole;
  // the shading field is recomputed only where the contours changed (+ its distance horizon), and only the fg /
  // bg chunks whose art can differ are marked stale: visible ones re-render on the next draw, the rest via the
  // per-frame prefetch (never a synchronous full-room redo). Terrain.fullRebuildOnChange = true forces the full
  // rebuild (reference for the self-check test-output/qa-fix-art-r1/brk_equiv.js).
  Terrain.tilesChanged = function (room, cache, c0, r0, c1, r1) {
    const TR = cache.terrain;
    if (!TR) return;
    const tm = cache.timing || (cache.timing = {});
    let t0 = U.now();
    const lap = (k) => { const t1 = U.now(); tm['tc.' + k] = +(t1 - t0).toFixed(1); t0 = t1; };
    const full = !!Terrain.fullRebuildOnChange;
    const oldLoops = TR.loops, oldBg = TR.bgLoops, oldRuns = (TR.spikes || []).concat(TR.plats || []);
    // D0: the changed tiles + 3 (where the wall visibly goes: re-rendered on the very next draw).
    // D: everything whose art can differ (+ changed contour segments, shading horizon, spike/platform runs);
    // outside D0 the differences are subtle (sub-pixel contour shifts, aura falloff), so those chunks keep
    // showing their old canvas (state 3) until the per-frame prefetch re-renders them, one per frame.
    const D0 = full ? [-1e9, -1e9, 1e9, 1e9] : [(c0 - 3) * T, (r0 - 3) * T, (c1 + 4) * T, (r1 + 4) * T];
    const D = D0.slice();
    TR.grid = buildGrid(room, cache);
    TR.loops = buildContours(TR.grid, TR.style, cache.seed, isSolid); lap('contours');
    if (!full) loopsDiffBox(oldLoops, TR.loops, D);
    lap('diff');
    const S = buildShading(TR, cache, full ? null : D.slice());
    if (full || !S) { D[0] = D[1] = -1e9; D[2] = D[3] = 1e9; } // (S null: the whole field was rebuilt)
    else { D[0] = Math.min(D[0], S[0]); D[1] = Math.min(D[1], S[1]); D[2] = Math.max(D[2], S[2]); D[3] = Math.max(D[3], S[3]); }
    lap('shading'); tm['tc.localShade'] = S ? 1 : 0;
    buildRuns(room, TR);
    runsDiffBox(oldRuns, TR.spikes.concat(TR.plats), D);
    lap('runs');
    // a chunk draws everything within CM of its bounds (R in renderChunk / renderBgChunk)
    const hit = (o, B) => !(o.x + o.w + CM < B[0] || o.x - CM > B[2] || o.y + o.h + CM < B[1] || o.y - CM > B[3]);
    for (const ch of TR.chunks) {
      if (!hit(ch, D)) continue;
      const k = chunkHasContent(TR, ch), was = ch.kind;
      ch.kind = k;
      if (k === 1) {
        if (ch.state === 2 || ch.state === 3) ch.state = was === 1 && ch.canvas && !hit(ch, D0) ? 3 : 0;
      } else if (ch.canvas) { freeCanvas(ch.canvas); ch.canvas = null; ch.ctx = null; ch.state = 0; }
    }
    // exact prefetch counts (the per-frame prefetch stops at 0 and stale state-3 chunks must not be stranded)
    TR.pending = 0;
    for (const ch of TR.chunks) if (ch.kind === 1 && ch.state !== 2) TR.pending++;
    lap('chunks');
    if (TR.bgLoops) {
      const old = TR.bgChunks;
      buildBgWalls(room, TR, cache);
      const Db = full ? D : loopsDiffBox(oldBg, TR.bgLoops, D.slice());
      // keep the untouched bg chunks (and their canvases); re-use / free the canvases of the touched ones
      for (let i = 0; i < TR.bgChunks.length; i++) {
        const nb = TR.bgChunks[i], ob = old[i];
        if (!hit(TR.chunks[i], Db)) { TR.bgChunks[i] = ob || null; continue; }
        if (ob && ob.canvas) {
          if (nb) { nb.canvas = ob.canvas; nb.ctx = ob.ctx; if ((ob.state === 2 || ob.state === 3) && !hit(TR.chunks[i], D0)) nb.state = 3; }
          else freeCanvas(ob.canvas);
        }
      }
      TR.bgPending = 0;
      for (const bc of TR.bgChunks) if (bc && bc.state !== 2) TR.bgPending++;
      lap('bg');
    }
  };

  // ---------------------------------------------------------------------------------------------
  // Per-frame drawing
  function snapper(ctx) {
    let tx = 0, ty = 0, ok = false;
    if (ctx.getTransform) {
      const m = ctx.getTransform();
      if (m.a === 1 && m.b === 0 && m.c === 0 && m.d === 1) { tx = m.e; ty = m.f; ok = true; }
    }
    return ok ? (v, o) => Math.round(v + o) - o : null;
  }
  Terrain.snapper = snapper;

  function visRange(TR, cam) {
    const pad = 48;
    const i0 = clamp(Math.floor((cam.x - pad) / CHUNK), 0, TR.nx - 1), i1 = clamp(Math.floor((cam.x + (cam.w || Art.VIEW_W) + pad) / CHUNK), 0, TR.nx - 1);
    const j0 = clamp(Math.floor((cam.y - pad) / CHUNK), 0, TR.ny - 1), j1 = clamp(Math.floor((cam.y + (cam.h || Art.VIEW_H) + pad) / CHUNK), 0, TR.ny - 1);
    return [i0, i1, j0, j1];
  }

  Terrain.draw = function (ctx, room, cache, cam) {
    const TR = cache.terrain;
    if (!TR) return;
    const [i0, i1, j0, j1] = visRange(TR, cam);
    let tx = 0, ty = 0, snap = false;
    if (ctx.getTransform) { const m = ctx.getTransform(); if (m.a === 1 && m.d === 1 && !m.b && !m.c) { tx = m.e; ty = m.f; snap = true; } }
    let rendered = 0;
    for (let j = j0; j <= j1; j++) for (let i = i0; i <= i1; i++) {
      const ch = TR.chunks[j * TR.nx + i];
      if (!ch || ch.kind === 0) continue;
      if (ch.kind === 2) {
        ctx.fillStyle = TR.flatColor;
        const x = snap ? Math.round(ch.x + tx) - tx : ch.x, y = snap ? Math.round(ch.y + ty) - ty : ch.y;
        ctx.fillRect(x, y, ch.w, ch.h);
        continue;
      }
      if (ch.state !== 2 && !(ch.state === 3 && ch.canvas)) { renderChunk(cache, ch); rendered++; if (TR.pending > 0) TR.pending--; }
      const x = snap ? Math.round(ch.x + tx) - tx : ch.x, y = snap ? Math.round(ch.y + ty) - ty : ch.y;
      ctx.drawImage(ch.canvas, x, y);
    }
    // background prefetch of one pending chunk per frame (closest to the view)
    if (TR.pending > 0 && rendered === 0) {
      const cx = cam.x + (cam.w || Art.VIEW_W) / 2, cy = cam.y + (cam.h || Art.VIEW_H) / 2;
      let best = null, bd = 1e18;
      for (const ch of TR.chunks) {
        if (ch.kind !== 1 || ch.state === 2) continue;
        const d = Math.hypot(ch.x + ch.w / 2 - cx, ch.y + ch.h / 2 - cy);
        if (d < bd) { bd = d; best = ch; }
      }
      if (best) { renderChunk(cache, best); TR.pending--; } else TR.pending = 0;
    } else if (TR.bgPending > 0 && rendered === 0) {
      const cx = cam.x + (cam.w || Art.VIEW_W) / 2, cy = cam.y + (cam.h || Art.VIEW_H) / 2;
      let best = null, bd = 1e18;
      for (const bc of TR.bgChunks) {
        if (!bc || bc.state === 2) continue;
        const d = Math.hypot(bc.x + bc.w / 2 - cx, bc.y + bc.h / 2 - cy);
        if (d < bd) { bd = d; best = bc; }
      }
      if (best) { renderBgChunk(cache, best); TR.bgPending--; } else TR.bgPending = 0;
    }
  };

  Terrain.drawBgWalls = function (ctx, room, cache, cam) {
    const TR = cache.terrain;
    if (!TR || !TR.bgLoops) return;
    const [i0, i1, j0, j1] = visRange(TR, cam);
    let tx = 0, ty = 0, snap = false;
    if (ctx.getTransform) { const m = ctx.getTransform(); if (m.a === 1 && m.d === 1 && !m.b && !m.c) { tx = m.e; ty = m.f; snap = true; } }
    for (let j = j0; j <= j1; j++) for (let i = i0; i <= i1; i++) {
      const bc = TR.bgChunks[j * TR.nx + i];
      if (!bc) continue;
      if (bc.state !== 2 && !(bc.state === 3 && bc.canvas)) renderBgChunk(cache, bc);
      const x = snap ? Math.round(bc.x + tx) - tx : bc.x, y = snap ? Math.round(bc.y + ty) - ty : bc.y;
      ctx.drawImage(bc.canvas, x, y);
    }
  };

  function liveComponents(room, TR) {
    // Prefer the engine's live components (hits/broken); fall back to our own analysis.
    const out = [];
    const rc = Array.isArray(room.components) ? room.components : null;
    const byId = rc ? new Map(rc.map((c) => [c.id, c])) : null;
    for (const spr of TR.breakSprites) {
      const live = byId ? byId.get(spr.id) : null;
      let broken = live ? !!live.broken : false;
      if (!broken) { // tile check (robust to missing flags)
        const [c, r] = spr.comp.tiles[0];
        const v = room.tiles[r * room.cols + c];
        if (v !== spr.code) broken = true;
      }
      out.push([spr, broken, live ? live.hits | 0 : 0]);
    }
    return out;
  }
  Terrain.drawBreakables = function (ctx, room, cache, cam, t) {
    const TR = cache.terrain;
    if (!TR || !TR.breakSprites || !TR.breakSprites.length) return;
    const vx0 = cam.x - 64, vy0 = cam.y - 64, vx1 = cam.x + (cam.w || Art.VIEW_W) + 64, vy1 = cam.y + (cam.h || Art.VIEW_H) + 64;
    for (const [spr, broken, hits] of liveComponents(room, TR)) {
      if (broken) continue;
      if (spr.x0 > vx1 || spr.x0 + spr.w < vx0 || spr.y0 > vy1 || spr.y0 + spr.h < vy0) continue;
      ctx.drawImage(spr.canvas, spr.x0, spr.y0);
      if (spr.code === BREAKABLE) {
        if (hits >= 1 && spr.hit1) ctx.drawImage(spr.hit1, spr.x0, spr.y0);
        if (hits >= 2 && spr.hit2) ctx.drawImage(spr.hit2, spr.x0, spr.y0);
      } else if (spr.glow) {
        const pulse = 0.55 + 0.3 * Math.sin(t * 2.2 + spr.x0 * 0.01) + 0.15 * noise1(t * 3 + spr.y0, 5);
        ctx.save();
        ctx.globalCompositeOperation = 'lighter';
        ctx.globalAlpha = clamp(pulse, 0, 1);
        ctx.drawImage(spr.glow, spr.x0, spr.y0);
        ctx.restore();
        for (const [x, y] of spr.topX) Art.glow(ctx, x, y, 34, spr.fis, 0.16 * pulse);
      }
    }
  };

  // Liquids (animated per frame; drawn over entities so they look submerged).
  function waveY(s, x, t, a1, a2) {
    return s.y + Math.sin(x * 0.045 + t * 2.1 + s.seed * 1e-9) * a1 + Math.sin(x * 0.11 - t * 3.3 + (s.seed % 97)) * a2;
  }
  Terrain.drawLiquids = function (ctx, room, cache, cam, t) {
    const TR = cache.terrain;
    if (!TR || !TR.liquids.length) return;
    const pal = cache.pal, L = cache.cfg.liquids || {};
    const vx0 = cam.x - 40, vy0 = cam.y - 40, vx1 = cam.x + (cam.w || Art.VIEW_W) + 40, vy1 = cam.y + (cam.h || Art.VIEW_H) + 40;
    for (const s of TR.liquids) {
      if (s.x1 < vx0 || s.x0 > vx1 || s.y - 20 > vy1 || s.y + s.maxD * T < vy0) continue;
      // still present? (liquids never change, but be robust)
      if (room.tiles[s.r * room.cols + s.c] !== s.type) continue;
      const va = cache.veil ? Terrain.veilAlphaAt(room, cache, s.x0 + T / 2, s.y + T / 2) : 0;   // liquid inside a veiled pocket
      if (va >= 0.997) continue;
      if (va > 0) { ctx.save(); ctx.globalAlpha *= 1 - va; }
      if (s.type === WATER) drawWater(ctx, s, cache, t, L.water || {}, vx0, vx1);
      else drawLava(ctx, s, cache, t, L.lava || {}, vx0, vx1);
      if (va > 0) ctx.restore();
    }
  };
  function bodyPath(s, top) {
    const p = new Path2D();
    for (const q of s.rects) p.rect(q.c * T, top, q.n * T, s.y + q.d * T - top);
    return p;
  }
  function drawWater(ctx, s, cache, t, o, vx0, vx1) {
    const pal = cache.pal;
    if (!s.grad) {
      const g = ctx.createLinearGradient(0, s.y, 0, s.y + s.maxD * T);
      g.addColorStop(0, rgba(o.top || pal.water, o.alphaTop || 0.5));
      g.addColorStop(Math.min(1, 2.5 / s.maxD), rgba(o.mid || mix(pal.water, pal.waterDeep, 0.5), o.alphaMid || 0.66));
      g.addColorStop(1, rgba(o.deep || pal.waterDeep, o.alphaDeep || 0.82));
      s.grad = g; s.body = bodyPath(s, s.y + 4);
    }
    const x0 = Math.max(s.x0, vx0), x1 = Math.min(s.x1, vx1);
    ctx.fillStyle = s.grad;
    ctx.fill(s.body);
    // surface band following the wave
    const step = 8, a1 = o.wave || 1.6, a2 = (o.wave || 1.6) * 0.55;
    ctx.beginPath();
    ctx.moveTo(x0, s.y + 4);
    for (let x = x0; x <= x1 + step; x += step) { const xx = Math.min(x, x1); ctx.lineTo(xx, waveY(s, xx, t, a1, a2)); if (xx === x1) break; }
    ctx.lineTo(x1, s.y + 4); ctx.closePath();
    ctx.fillStyle = rgba(o.top || pal.water, (o.alphaTop || 0.5) + 0.06);
    ctx.fill();
    // caustic light bands inside the body (additive)
    ctx.save();
    ctx.clip(s.body);
    ctx.globalCompositeOperation = 'lighter';
    ctx.strokeStyle = rgba(o.caustic || pal.waterHi, 0.07);
    ctx.lineWidth = 2;
    for (let k = 0; k < 3; k++) {
      const yy = s.y + 10 + k * 13;
      ctx.beginPath();
      for (let x = x0; x <= x1; x += 12) {
        const y = yy + Math.sin(x * 0.03 + t * (1.2 + k * 0.4) + k * 2) * 4 + Math.sin(x * 0.071 - t * 1.7) * 2;
        if (x === x0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
      }
      ctx.stroke();
    }
    ctx.restore();
    // bright surface line + glints
    ctx.strokeStyle = rgba(o.line || pal.waterHi, 0.75);
    ctx.lineWidth = 1.4;
    ctx.beginPath();
    for (let x = x0; x <= x1 + step; x += step) { const xx = Math.min(x, x1); const y = waveY(s, xx, t, a1, a2); if (x === x0) ctx.moveTo(xx, y); else ctx.lineTo(xx, y); if (xx === x1) break; }
    ctx.stroke();
    const w = s.x1 - s.x0, ng = Math.max(1, Math.round(w / 70));
    for (let k = 0; k < ng; k++) {
      const ph = U.fract(t * 0.23 + h01(k, s.seed, 2));
      const gx = s.x0 + U.fract(h01(k, s.seed, 1) + t * 0.02 * (k % 2 ? 1 : -1)) * w;
      if (gx < x0 || gx > x1) continue;
      const a = Math.sin(ph * Math.PI);
      ctx.fillStyle = rgba('#ffffff', 0.55 * a);
      ctx.fillRect(gx - 5, waveY(s, gx, t, a1, a2) - 0.5, 10 * a + 2, 1.2);
    }
  }
  const crustCache = new Map();
  function crustPattern(ctx, color, seed) {
    const key = color + seed;
    let c = crustCache.get(key);
    if (c) return c;
    const S = 160, mc = makeCanvas(S, S), x = mc.ctx;
    const rng = new U.Rng(seed);
    const pts = [];
    for (let i = 0; i < 22; i++) pts.push([rng.next() * S, rng.next() * S]);
    const img = x.createImageData(S, S), d = img.data, cc = rgb(color);
    for (let yy = 0; yy < S; yy++) for (let xx = 0; xx < S; xx++) {
      let b1 = 1e9, b2 = 1e9;
      for (const [px, py] of pts) {
        let dx = Math.abs(xx - px), dy = Math.abs(yy - py);
        if (dx > S / 2) dx = S - dx; if (dy > S / 2) dy = S - dy;
        const q = dx * dx + dy * dy;
        if (q < b1) { b2 = b1; b1 = q; } else if (q < b2) b2 = q;
      }
      const e = Math.sqrt(b2) - Math.sqrt(b1); // distance to the cell border
      const a = smooth(2, 7, e) * (0.75 + 0.25 * fbm2(xx / 20, yy / 20, seed, 2, S / 20, S / 20));
      const i = (yy * S + xx) * 4;
      d[i] = cc[0]; d[i + 1] = cc[1]; d[i + 2] = cc[2]; d[i + 3] = clamp(a * 255, 0, 255);
    }
    x.putImageData(img, 0, 0);
    c = { canvas: mc.canvas, pattern: ctx.createPattern(mc.canvas, 'repeat') };
    crustCache.set(key, c);
    return c;
  }
  function drawLava(ctx, s, cache, t, o, vx0, vx1) {
    const pal = cache.pal;
    if (!s.grad) {
      const g = ctx.createLinearGradient(0, s.y, 0, s.y + s.maxD * T);
      g.addColorStop(0, o.hot || pal.lavaHot);
      g.addColorStop(Math.min(1, 0.45 / s.maxD), o.color || pal.lava);
      g.addColorStop(1, o.deep || pal.lavaDeep);
      s.grad = g; s.body = bodyPath(s, s.y + 3);
    }
    const x0 = Math.max(s.x0, vx0), x1 = Math.min(s.x1, vx1);
    ctx.fillStyle = s.grad; ctx.fill(s.body);
    // drifting dark crust plates with glowing seams (integer scroll keeps it a cheap blit)
    const cr = crustPattern(ctx, o.crust || pal.lavaDeep, 77);
    ctx.save();
    ctx.clip(s.body);
    ctx.translate(Math.round(t * 6), 0);
    ctx.globalAlpha = o.crustAlpha || 0.62;
    ctx.fillStyle = cr.pattern;
    ctx.fillRect(x0 - Math.round(t * 6), s.y + 6, x1 - x0, s.maxD * T);
    ctx.restore();
    // hot gradient over the crust near the surface
    const hg = ctx.createLinearGradient(0, s.y, 0, s.y + 22);
    hg.addColorStop(0, rgba(o.hot || pal.lavaHot, 0.95)); hg.addColorStop(1, rgba(o.hot || pal.lavaHot, 0));
    ctx.fillStyle = hg; ctx.fillRect(x0, s.y, x1 - x0, 22);
    // glowing surface
    const step = 8, a1 = o.wave || 1.1, a2 = 0.6;
    ctx.beginPath();
    ctx.moveTo(x0, s.y + 6);
    for (let x = x0; x <= x1 + step; x += step) { const xx = Math.min(x, x1); ctx.lineTo(xx, waveY(s, xx, t * 0.6, a1, a2)); if (xx === x1) break; }
    ctx.lineTo(x1, s.y + 6); ctx.closePath();
    ctx.fillStyle = o.hot || pal.lavaHot; ctx.fill();
    ctx.strokeStyle = rgba('#fff8dc', 0.95); ctx.lineWidth = 1.6;
    ctx.beginPath();
    for (let x = x0; x <= x1 + step; x += step) { const xx = Math.min(x, x1); const y = waveY(s, xx, t * 0.6, a1, a2); if (x === x0) ctx.moveTo(xx, y); else ctx.lineTo(xx, y); if (xx === x1) break; }
    ctx.stroke();
    // bubbles
    const w = s.x1 - s.x0;
    const nb = Math.max(1, Math.round(w / 45));
    for (let k = 0; k < nb; k++) {
      const per = 1.6 + h01(k, s.seed, 8) * 2.2;
      const cyc = Math.floor(t / per + h01(k, s.seed, 9));
      const ph = U.fract(t / per + h01(k, s.seed, 9));
      const bx = s.x0 + 6 + h01(k, s.seed, cyc + 10) * (w - 12);
      if (bx < x0 || bx > x1) continue;
      const by = s.y + 2;
      if (ph < 0.8) {
        const r = 1.5 + ph * 5;
        ctx.fillStyle = o.hot || pal.lavaHot;
        ctx.beginPath(); ctx.arc(bx, by - r * 0.4, r, Math.PI, 0); ctx.fill();
        ctx.strokeStyle = rgba('#fff4c0', 0.85); ctx.lineWidth = 1; ctx.beginPath(); ctx.arc(bx, by - r * 0.4, r, Math.PI * 1.1, Math.PI * 1.6); ctx.stroke();
      } else {
        const q = (ph - 0.8) / 0.2;
        ctx.strokeStyle = rgba('#fff0b0', 0.7 * (1 - q)); ctx.lineWidth = 1.2;
        ctx.beginPath(); ctx.arc(bx, by - 3 - q * 8, 2 + q * 6, Math.PI * 1.15, Math.PI * 1.85); ctx.stroke();
      }
    }
    // heat glow above
    const ng = Math.max(1, Math.round(w / 90));
    for (let k = 0; k < ng; k++) {
      const gx = s.x0 + (w * (k + 0.5)) / ng;
      if (gx < x0 - 80 || gx > x1 + 80) continue;
      Art.glow(ctx, gx, s.y, 80 + 10 * Math.sin(t * 2 + k), o.glow || pal.lava, 0.34 + 0.08 * noise1(t * 2 + k * 5, 3));
    }
  }

  // ---------------------------------------------------------------------------------------------
  // Secret pockets (auto-veil). The chunks draw every carved cavity, so a secret behind a breakable wall / dive
  // floor would be in plain view. G.World.hiddenPockets(def) finds them (non-solid tiles connected to no opening,
  // touching a B/D tile); each pocket gets a veil sprite: the terrain of the area re-rendered with the pocket
  // filled (same room seed and style, so it matches), kept only over rock and the pocket itself (air, platforms,
  // liquids outside the pocket are cut away), fully opaque within VEIL_CORE px of the pocket and feathered into the
  // real terrain over the next ~deepEnd px (where the cavity's lit band and depth ramp fade out). It is drawn right
  // after the chunks (before breakables, entities and liquids). Entities, liquids and front decor whose anchor lies
  // in a veiled pocket are faded with it (Art.veilAlphaAt). A veil fades out while the player is inside the pocket
  // and for good once an adjacent B/D component breaks (broken components persist, so revisits start revealed).
  // Opt out per room with `def.veil: false`.
  const VEIL_CORE = 24;
  function initVeil(room, cache) {
    cache.veil = null;
    const d = room.def;
    if (!d || d.veil === false || !G.World || typeof G.World.hiddenPockets !== 'function') return;
    const hp = G.World.hiddenPockets(d);
    if (!hp || !hp.pockets.length || hp.cols !== room.cols || hp.rows !== room.rows) return;
    cache.veil = { hp, index: hp.index, pockets: hp.pockets, alpha: hp.pockets.map(() => 1), gone: hp.pockets.map(() => false),
      sprites: null, room: null };
  }
  Terrain.initVeil = initVeil;
  function veilWanted(room, V, k) {
    if (!V.gone[k] && G.World.pocketRevealed(V.pockets[k], room)) V.gone[k] = true;
    if (V.gone[k]) return 0;
    const p = G.game && G.game.player;
    if (!p || !(p.room === room || (p.room && p.room.id === room.id))) return 1;
    const c0 = Math.floor((p.x - 2) / T), c1 = Math.floor((p.x + p.w + 2) / T), r0 = Math.floor((p.y - 2) / T), r1 = Math.floor((p.y + p.h + 2) / T);
    for (let r = Math.max(0, r0); r <= Math.min(room.rows - 1, r1); r++) {
      for (let c = Math.max(0, c0); c <= Math.min(room.cols - 1, c1); c++) if (V.index[r * room.cols + c] === k) return 0;
    }
    return 1;
  }
  // Advanced per game step by Art.updateAtmosphere(room, cam, dt); a new room instance (room entry) snaps.
  function updateVeil(room, cache, dt) {
    const V = cache.veil;
    if (!V) return;
    const fresh = V.room !== room;
    V.room = room;
    dt = Math.max(0, Math.min(0.1, dt || 0));
    for (let k = 0; k < V.pockets.length; k++) {
      if (fresh) V.gone[k] = false;   // the cache may outlive a session (new game): re-read this room's tiles
      const want = veilWanted(room, V, k);
      if (fresh) { V.alpha[k] = want; continue; }
      const a = V.alpha[k], rate = want ? 2.5 : V.gone[k] ? 1.6 : 4;
      V.alpha[k] = a < want ? Math.min(want, a + dt * rate) : Math.max(want, a - dt * rate);
    }
  }
  // Render every pocket's veil sprite (one terrain build with all pockets filled; tiles far from them are filled too).
  function buildVeilSprites(room, cache) {
    const V = cache.veil;
    if (!V || V.sprites) return;
    V.sprites = [];
    const t0 = U.now();
    const cols = room.cols, rows = room.rows, src = cache.pristine;
    const st = styleOf(cache);
    const pad = Math.max(64, Math.ceil((st.deepEnd || 120) + 8));
    const win = Math.ceil(pad / T) + M + 1;
    const tiles = new Uint8Array(src.length);
    for (let r = 0; r < rows; r++) for (let c = 0; c < cols; c++) {
      const i = r * cols + c;
      let near = false;
      for (const pk of V.pockets) if (c >= pk.c0 - win && c <= pk.c1 + win && r >= pk.r0 - win && r <= pk.r1 + win) { near = true; break; }
      tiles[i] = !near || V.index[i] >= 0 ? SOLID : src[i];
    }
    const fake = { id: room.id, def: room.def, cols, rows, tiles, widthPx: cache.W, heightPx: cache.H };
    const fc = Object.assign({}, cache, { pristine: tiles, terrain: null, timing: {} });
    const TR = (fc.terrain = { style: st });
    TR.grid = buildGrid(fake, fc);
    TR.tex = textureFor(fc);
    buildLiquids(fake, TR, fc);
    TR.loops = buildContours(TR.grid, TR.style, fc.seed, isSolid);
    buildShading(TR, fc);
    buildRuns(fake, TR);
    const wall = (v) => isSolid(v);
    V.pockets.forEach((pk, k) => {
      const bx0 = pk.c0 * T, by0 = pk.r0 * T, bx1 = (pk.c1 + 1) * T, by1 = (pk.r1 + 1) * T;
      const x0 = Math.max(0, bx0 - pad), y0 = Math.max(0, by0 - pad), x1 = Math.min(cache.W, bx1 + pad), y1 = Math.min(cache.H, by1 + pad);
      const ch = { x: x0, y: y0, w: x1 - x0, h: y1 - y0, canvas: null, ctx: null, state: 0 };
      try {
        renderChunk(fc, ch);
        const ctx = ch.ctx;
        ctx.setTransform(1, 0, 0, 1, 0, 0);
        const img = ctx.getImageData(0, 0, ch.w, ch.h), px = img.data;
        const fw = pad - VEIL_CORE;
        for (let j = 0; j < ch.h; j++) {
          const wy = y0 + j + 0.5, r = Math.min(rows - 1, Math.floor(wy / T));
          const dy = wy < by0 ? by0 - wy : wy > by1 ? wy - by1 : 0;
          for (let i = 0; i < ch.w; i++) {
            const o = (j * ch.w + i) * 4 + 3;
            if (!px[o]) continue;
            const wx = x0 + i + 0.5, c = Math.min(cols - 1, Math.floor(wx / T)), ti = r * cols + c;
            if (V.index[ti] !== k && !wall(src[ti])) { px[o] = 0; continue; }   // keep rock + this pocket only
            const dx = wx < bx0 ? bx0 - wx : wx > bx1 ? wx - bx1 : 0;
            const d = dx || dy ? Math.hypot(dx, dy) : 0;
            if (d <= VEIL_CORE) continue;
            const q = Math.min(1, (d - VEIL_CORE) / fw);
            px[o] = px[o] * (1 - q * q * (3 - 2 * q));
          }
        }
        ctx.putImageData(img, 0, 0);
        V.sprites.push({ x: x0, y: y0, w: ch.w, h: ch.h, canvas: ch.canvas });
      } catch (e) {
        Art.report(e, 'terrain.veil');
        if (ch.canvas) freeCanvas(ch.canvas);
        // fallback: a flat deep-fill block over the pocket (functional, less seamless)
        const mc = makeCanvas(bx1 - bx0, by1 - by0);
        mc.ctx.fillStyle = TR.flatColor || cache.pal.fillDeep; mc.ctx.fillRect(0, 0, bx1 - bx0, by1 - by0);
        V.sprites.push({ x: bx0, y: by0, w: bx1 - bx0, h: by1 - by0, canvas: mc.canvas });
      }
    });
    if (TR.dfCanvas) freeCanvas(TR.dfCanvas);
    if (TR.auraCanvas) freeCanvas(TR.auraCanvas);
    cache.timing.veil = +(U.now() - t0).toFixed(1);
  }
  Terrain.buildVeils = buildVeilSprites;
  Terrain.updateVeil = updateVeil;
  Terrain.drawVeils = function (ctx, room, cache, cam) {
    const V = cache.veil;
    if (!V) return;
    if (V.room !== room) updateVeil(room, cache, 0);   // not stepped yet in this room instance (or a lab): snap
    let any = false;
    for (const a of V.alpha) if (a > 0.003) { any = true; break; }
    if (!any) return;
    if (!V.sprites) buildVeilSprites(room, cache);
    let tx = 0, ty = 0, snap = false;
    if (ctx.getTransform) { const m = ctx.getTransform(); if (m.a === 1 && m.d === 1 && !m.b && !m.c) { tx = m.e; ty = m.f; snap = true; } }
    const vx0 = cam.x, vy0 = cam.y, vx1 = cam.x + (cam.w || Art.VIEW_W), vy1 = cam.y + (cam.h || Art.VIEW_H);
    for (let k = 0; k < V.sprites.length; k++) {
      const s = V.sprites[k], a = V.alpha[k];
      if (!(a > 0.003) || s.x > vx1 || s.x + s.w < vx0 || s.y > vy1 || s.y + s.h < vy0) continue;
      ctx.globalAlpha = Math.min(1, a);
      ctx.drawImage(s.canvas, snap ? Math.round(s.x + tx) - tx : s.x, snap ? Math.round(s.y + ty) - ty : s.y);
    }
    ctx.globalAlpha = 1;
  };
  // Veil opacity (0..1) over world point (x, y): what share of something anchored there is hidden.
  Terrain.veilAlphaAt = function (room, cache, x, y) {
    const V = cache && cache.veil;
    if (!V) return 0;
    const c = Math.floor(x / T), r = Math.floor(y / T);
    if (c < 0 || r < 0 || c >= room.cols || r >= room.rows) return 0;
    const k = V.index[r * room.cols + c];
    return k >= 0 ? V.alpha[k] : 0;
  };
  Terrain.disposeVeil = function (cache) {
    const V = cache && cache.veil;
    if (V && V.sprites) for (const s of V.sprites) freeCanvas(s.canvas);
    if (V) V.sprites = null;
  };

  Terrain.isSolid = isSolid;
  Terrain.CHUNK = CHUNK;
})();
