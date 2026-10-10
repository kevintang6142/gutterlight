// src/art/art.js — G.Art core: utilities, region/palette registry, glow & flame, room caches, public API.
// Sub-systems live in terrain.js (Art.Terrain), background.js (Art.BG, Art.FG, Art.Atmos),
// props.js (Art.Decor + prop catalog), characters.js (Art.char) and regions/*.js (Art.defineRegion).
(function () {
  'use strict';
  const G = globalThis.G;
  const Art = (G.Art = G.Art || {});

  const C = G.CONST || {};
  const TILE = C.TILE || 40;
  const VIEW_W = C.VIEW_W || 1280;
  const VIEW_H = C.VIEW_H || 720;
  // Tile codes are fixed by TECH_SPEC §7.3 (mirrors G.T).
  const TC = { EMPTY: 0, SOLID: 1, GLAZED: 2, PLATFORM: 3, SPIKES: 4, WATER: 5, LAVA: 6, BREAKABLE: 7, DIVEFLOOR: 8, BGWALL: 9 };
  Art.TILE = TILE;
  Art.VIEW_W = VIEW_W;
  Art.VIEW_H = VIEW_H;
  Art.TC = TC;

  // ---------------------------------------------------------------------------------------------
  // Error reporting (once per unique message; never throws)
  const reported = new Set();
  function report(err, where) {
    const msg = (where || 'art') + ': ' + (err && err.message ? err.message : String(err));
    if (reported.has(msg)) return;
    reported.add(msg);
    try {
      if (typeof G.reportError === 'function') { G.reportError(err, where); return; }
    } catch (e) { /* fall through to console */ }
    if (typeof console !== 'undefined') console.error('[art] ' + msg + (err && err.stack ? '\n' + err.stack : ''));
  }
  Art.report = report;

  // ---------------------------------------------------------------------------------------------
  // Math / hashing / noise
  const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
  const lerp = (a, b, t) => a + (b - a) * t;
  const smooth = (e0, e1, x) => { const t = clamp((x - e0) / (e1 - e0), 0, 1); return t * t * (3 - 2 * t); };
  const fract = (x) => x - Math.floor(x);
  const mod = (a, n) => ((a % n) + n) % n;

  function hashStr(s) { // FNV-1a
    s = String(s);
    let h = 0x811c9dc5;
    for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 0x01000193); }
    return h >>> 0;
  }
  function hashInt(a, b, c) { // 3 ints → uint32 (well mixed)
    let h = Math.imul((a | 0) ^ 0x2c1b3c6d, 0x297a2d39) ^ Math.imul((b | 0) ^ 0x6c3d1f9a, 0x165667b1) ^ Math.imul((c | 0) ^ 0x5bd1e995, 0x27d4eb2d);
    h = Math.imul(h ^ (h >>> 15), 0x85ebca77);
    h = Math.imul(h ^ (h >>> 13), 0xc2b2ae3d);
    return (h ^ (h >>> 16)) >>> 0;
  }
  const h01 = (a, b, c) => hashInt(a, b, c) / 4294967296;

  class Rng {
    constructor(seed) { this.s = (seed >>> 0) || 0x9e3779b9; }
    next() { // mulberry32
      let t = (this.s = (this.s + 0x6d2b79f5) >>> 0);
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    }
    range(a, b) { return a + (b - a) * this.next(); }
    int(a, b) { return a + Math.floor(this.next() * (b - a + 1)); }
    pick(arr) { return arr[Math.floor(this.next() * arr.length)]; }
    chance(p) { return this.next() < p; }
    fork(salt) { return new Rng(hashInt(this.s, hashStr(salt), 77)); }
  }

  function noise1(x, seed) { // value noise in [-1,1]
    const i = Math.floor(x), f = x - i, u = f * f * (3 - 2 * f);
    const a = h01(i, seed, 11), b = h01(i + 1, seed, 11);
    return (a + (b - a) * u) * 2 - 1;
  }
  function noise1p(x, period, seed) { // periodic value noise (period in lattice units, integer)
    const i = Math.floor(x), f = x - i, u = f * f * (3 - 2 * f);
    const a = h01(mod(i, period), seed, 11), b = h01(mod(i + 1, period), seed, 11);
    return (a + (b - a) * u) * 2 - 1;
  }
  function fbm1(x, seed, oct) {
    let s = 0, a = 1, n = 0, f = 1;
    for (let o = 0; o < (oct || 3); o++) { s += a * noise1(x * f, seed + o * 101); n += a; a *= 0.5; f *= 2.03; }
    return s / n;
  }
  function fbm1p(x, period, seed, oct) { // periodic fbm: period doubles per octave so it still tiles
    let s = 0, a = 1, n = 0, f = 1;
    for (let o = 0; o < (oct || 3); o++) { s += a * noise1p(x * f, period * f, seed + o * 101); n += a; a *= 0.5; f *= 2; }
    return s / n;
  }
  function noise2(x, y, seed, px, py) { // value noise [-1,1]; optional integer periods for tiling
    const ix = Math.floor(x), iy = Math.floor(y), fx = x - ix, fy = y - iy;
    const ux = fx * fx * (3 - 2 * fx), uy = fy * fy * (3 - 2 * fy);
    let x0 = ix, x1 = ix + 1, y0 = iy, y1 = iy + 1;
    if (px) { x0 = mod(x0, px); x1 = mod(x1, px); }
    if (py) { y0 = mod(y0, py); y1 = mod(y1, py); }
    const a = h01(x0, y0, seed), b = h01(x1, y0, seed), c = h01(x0, y1, seed), d = h01(x1, y1, seed);
    return (lerp(lerp(a, b, ux), lerp(c, d, ux), uy)) * 2 - 1;
  }
  function fbm2(x, y, seed, oct, px, py) {
    let s = 0, a = 1, n = 0, f = 1;
    for (let o = 0; o < (oct || 4); o++) {
      s += a * noise2(x * f, y * f, seed + o * 131, px ? px * f : 0, py ? py * f : 0);
      n += a; a *= 0.5; f *= 2;
    }
    return s / n;
  }

  // ---------------------------------------------------------------------------------------------
  // Colors (hex '#rgb'/'#rrggbb' or 'rgb()/rgba()' strings)
  const rgbCache = new Map();
  function rgb(c) {
    let v = rgbCache.get(c);
    if (v) return v;
    const s = String(c || '#ff00ff').trim();
    if (s[0] === '#') {
      let h = s.slice(1);
      if (h.length === 3 || h.length === 4) h = h[0] + h[0] + h[1] + h[1] + h[2] + h[2];
      const n = parseInt(h.slice(0, 6), 16);
      v = isNaN(n) ? [255, 0, 255] : [(n >> 16) & 255, (n >> 8) & 255, n & 255];
    } else {
      const m = s.match(/rgba?\(([^)]+)\)/i);
      if (m) { const p = m[1].split(',').map((q) => parseFloat(q)); v = [p[0] | 0, p[1] | 0, p[2] | 0]; } else v = [255, 0, 255];
    }
    if (rgbCache.size > 4096) rgbCache.clear();
    rgbCache.set(c, v);
    return v;
  }
  const c255 = (x) => (x < 0 ? 0 : x > 255 ? 255 : Math.round(x));
  function hex(r, g, b) { return '#' + ((1 << 24) | (c255(r) << 16) | (c255(g) << 8) | c255(b)).toString(16).slice(1); }
  function mix(a, b, t) {
    const A = rgb(a), B = rgb(b);
    return hex(A[0] + (B[0] - A[0]) * t, A[1] + (B[1] - A[1]) * t, A[2] + (B[2] - A[2]) * t);
  }
  function shade(c, amt) { return amt >= 0 ? mix(c, '#ffffff', amt) : mix(c, '#000000', -amt); }
  function rgba(c, a) { const v = rgb(c); return 'rgba(' + v[0] + ',' + v[1] + ',' + v[2] + ',' + (+a).toFixed(3) + ')'; }
  function lum(c) { const v = rgb(c); return (0.2126 * v[0] + 0.7152 * v[1] + 0.0722 * v[2]) / 255; }
  function saturate(c, amt) { // amt -1..1
    const v = rgb(c), l = (v[0] + v[1] + v[2]) / 3, k = 1 + amt;
    return hex(l + (v[0] - l) * k, l + (v[1] - l) * k, l + (v[2] - l) * k);
  }

  // ---------------------------------------------------------------------------------------------
  // Canvas helpers
  let canvasPixels = 0; // rough accounting of live cache pixels (for the LRU budget)
  function makeCanvas(w, h) {
    w = Math.max(1, Math.ceil(w)); h = Math.max(1, Math.ceil(h));
    let r = null;
    if (G.U && typeof G.U.makeCanvas === 'function') {
      try { r = G.U.makeCanvas(w, h); } catch (e) { r = null; }
    }
    if (!r || !r.canvas || !r.ctx) {
      const canvas = document.createElement('canvas');
      canvas.width = w; canvas.height = h;
      r = { canvas, ctx: canvas.getContext('2d') };
    }
    if (r.canvas.width !== w) r.canvas.width = w;
    if (r.canvas.height !== h) r.canvas.height = h;
    return r;
  }
  function freeCanvas(c) { if (c) { try { c.width = 0; c.height = 0; } catch (e) { /* ignore */ } } }

  // Portable soft blur for prerendered canvases (no ctx.filter): repeated down/up-sampling.
  function blurCanvas(src, radius) {
    if (!(radius > 0.5)) return src;
    const w = src.width, h = src.height;
    const f = clamp(1 / Math.max(1, radius * 0.55), 0.06, 1);
    const sw = Math.max(1, Math.round(w * f)), sh = Math.max(1, Math.round(h * f));
    const a = makeCanvas(sw, sh);
    a.ctx.imageSmoothingEnabled = true;
    a.ctx.imageSmoothingQuality = 'high';
    a.ctx.drawImage(src, 0, 0, sw, sh);
    const ctx = src.getContext('2d');
    ctx.save();
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.globalCompositeOperation = 'copy';
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = 'high';
    ctx.drawImage(a.canvas, 0, 0, w, h);
    ctx.restore();
    freeCanvas(a.canvas);
    return src;
  }

  Art.util = {
    clamp, lerp, smooth, fract, mod, hashStr, hashInt, h01, Rng, noise1, noise1p, fbm1, fbm1p, noise2, fbm2,
    rgb, hex, mix, shade, rgba, lum, saturate, makeCanvas, freeCanvas, blurCanvas,
    now: () => (typeof performance !== 'undefined' ? performance.now() : Date.now()),
  };
  const U = Art.util;

  // ---------------------------------------------------------------------------------------------
  // Region registry & palettes. Region files call Art.defineRegion(cfg) at load time.
  const regions = Object.create(null);
  const PALETTE_KEYS = ['skyTop', 'skyBottom', 'far', 'mid', 'near', 'fill', 'fillDeep', 'edge', 'highlight',
    'accent', 'light', 'fog', 'particle', 'mapColor'];
  const BASE_PALETTE = {
    skyTop: '#0e1016', skyBottom: '#2a2f3a', far: '#2c313c', mid: '#20242d', near: '#171a21',
    fill: '#121419', fillDeep: '#06070a', edge: '#4a505c', highlight: '#b8bcc6', accent: '#d0b070',
    light: '#ffd8a0', fog: '#3a404c', particle: '#c8ccd4', mapColor: '#8a8f9c',
  };
  function completePalette(p) {
    const q = Object.assign({}, BASE_PALETTE, p || {});
    // Derived colors (region files may override any of them).
    if (!q.outline) q.outline = mix(q.fillDeep, '#000000', 0.5);
    if (!q.darkness) q.darkness = mix(q.fillDeep, '#000000', 0.45); // used by G.lighting for the darkness map
    if (!q.glaze) q.glaze = mix(q.edge, q.highlight, 0.35);
    if (!q.glazeDeep) q.glazeDeep = mix(q.fill, q.edge, 0.4);
    if (!q.bgwall) q.bgwall = mix(q.mid, q.fill, 0.35);
    if (!q.water) q.water = mix(q.fog, '#6aa0b8', 0.5);
    if (!q.waterDeep) q.waterDeep = mix(q.fillDeep, q.water, 0.35);
    if (!q.waterHi) q.waterHi = mix(q.water, '#ffffff', 0.55);
    if (!q.lava) q.lava = '#ff7a20';
    if (!q.lavaHot) q.lavaHot = '#ffe27a';
    if (!q.lavaDeep) q.lavaDeep = '#a8240c';
    if (!q.crack) q.crack = mix(q.fillDeep, '#000000', 0.4);
    if (!q.fissure) q.fissure = q.light;
    return q;
  }
  const BASE_REGION = {
    id: 'test', name: 'Test',
    palette: completePalette({}),
    theme: { bg: 'open' },
    terrain: {},
    liquids: {},
    bg: {},
    decor: [],
    weather: [{ kind: 'motes', count: 40 }],
    fog: { alpha: 0.18 },
    vignette: 0.55,
    grade: null,
    fg: { kinds: ['rock'], density: 0.6 },
    materials: null,
  };
  function defaultMaterials(p) {
    return {
      stone: mix(p.mid, p.edge, 0.35), stoneDark: mix(p.near, p.fill, 0.4), stoneLight: mix(p.edge, p.highlight, 0.3),
      wood: mix('#4a3424', p.mid, 0.35), woodDark: mix('#24180f', p.fill, 0.3), woodLight: mix('#7a5a3a', p.highlight, 0.2),
      iron: mix('#2a2a30', p.near, 0.3), ironLight: mix('#5a5a66', p.edge, 0.4), rust: mix('#6a3a22', p.mid, 0.25),
      wax: mix('#d8cfb8', p.highlight, 0.25), waxShade: mix('#8a8270', p.mid, 0.35), waxDark: mix('#4a4438', p.fill, 0.3),
      cloth: mix('#5a2a2a', p.mid, 0.35), clothDark: mix('#2a1414', p.fill, 0.3),
      gold: mix('#c8a040', p.accent, 0.3), goldLight: mix('#ffe8a0', p.highlight, 0.2),
      glass: mix(p.light, p.accent, 0.4), leaf: mix('#4a5a3a', p.mid, 0.35), leafLight: mix('#8aa070', p.highlight, 0.3),
      bone: mix('#cfc6b0', p.highlight, 0.3), ice: mix('#a8d8f0', p.highlight, 0.3), crystal: mix('#fff0c0', p.accent, 0.3),
      silk: mix('#d8d0e8', p.highlight, 0.3), soot: mix('#141010', p.fill, 0.3),
    };
  }
  Art.defineRegion = function (cfg) {
    try {
      if (!cfg || !cfg.id) throw new Error('defineRegion: missing id');
      const r = Object.assign({}, BASE_REGION, cfg);
      r.palette = completePalette(cfg.palette);
      r.theme = Object.assign({}, BASE_REGION.theme, cfg.theme || {});
      r.terrain = Object.assign({}, cfg.terrain || {});
      r.liquids = Object.assign({}, cfg.liquids || {});
      r.bg = Object.assign({}, cfg.bg || {});
      r.materials = Object.assign(defaultMaterials(r.palette), cfg.materials || {});
      regions[r.id] = r;
      return r;
    } catch (e) { report(e, 'Art.defineRegion'); return null; }
  };
  Art.region = function (id) {
    return regions[id] || regions.test || regions.guttered || (regions.test = Art.defineRegion({ id: 'test' }));
  };
  Art.hasRegion = (id) => !!regions[id];
  Art.regionIds = () => Object.keys(regions);
  Art.palette = function (regionId) {
    try { return Art.region(regionId).palette; } catch (e) { report(e, 'Art.palette'); return completePalette({}); }
  };
  Art.materials = function (regionId) {
    try { return Art.region(regionId).materials; } catch (e) { report(e, 'Art.materials'); return defaultMaterials(completePalette({})); }
  };
  Art.mapColor = function (regionId) {
    try { return Art.region(regionId).palette.mapColor; } catch (e) { report(e, 'Art.mapColor'); return '#8a8f9c'; }
  };
  Art.PALETTE_KEYS = PALETTE_KEYS;

  // The neutral dev/test region (dev rooms; region builders' rooms always use their own).
  Art.defineRegion({
    id: 'test', name: 'Test',
    palette: {
      skyTop: '#0f1218', skyBottom: '#2c323e', far: '#323846', mid: '#252a35', near: '#1a1e27',
      fill: '#13161c', fillDeep: '#06070a', edge: '#56607a', highlight: '#c4cad8', accent: '#d8b878',
      light: '#ffd8a0', fog: '#3e4656', particle: '#c8d0dc', mapColor: '#8a8f9c',
    },
    theme: { bg: 'open' },
  });

  // ---------------------------------------------------------------------------------------------
  // Glow sprites (cached radial falloff, drawn additively) & soft dots
  const glowCache = new Map();
  const GLOW_SIZE = 128;
  function glowSprite(color) {
    let spr = glowCache.get(color);
    if (spr) return spr;
    const S = GLOW_SIZE;
    const { canvas, ctx } = makeCanvas(S, S);
    const img = ctx.createImageData(S, S);
    const d = img.data, [r, g, b] = rgb(color);
    const half = S / 2;
    for (let y = 0; y < S; y++) {
      for (let x = 0; x < S; x++) {
        const dx = (x + 0.5 - half) / half, dy = (y + 0.5 - half) / half;
        const q = Math.sqrt(dx * dx + dy * dy);
        if (q >= 1) continue;
        // soft core + long tail, reaching exactly 0 at the edge; tiny dither against banding
        const fall = Math.exp(-q * q * 5.2) * 0.82 + Math.exp(-q * q * 1.6) * 0.18;
        let a = fall * (1 - q) * (1 - q) * (1 + q * 0.6);
        a = a * 255 + (h01(x, y, 7) - 0.5);
        const i = (y * S + x) * 4;
        d[i] = r; d[i + 1] = g; d[i + 2] = b; d[i + 3] = c255(a);
      }
    }
    ctx.putImageData(img, 0, 0);
    if (glowCache.size > 96) { const k = glowCache.keys().next().value; glowCache.delete(k); }
    glowCache.set(color, canvas);
    return canvas;
  }
  Art.glowSprite = glowSprite;

  /** Additive soft glow. radius in px; alpha 0..1 (multiplied with ctx.globalAlpha). */
  Art.glow = function (ctx, x, y, radius, color, alpha) {
    if (!(radius > 0)) return;
    const a = alpha === undefined ? 1 : alpha;
    if (!(a > 0.002)) return;
    try {
      const spr = glowSprite(color || '#ffffff');
      const pa = ctx.globalAlpha, po = ctx.globalCompositeOperation;
      ctx.globalCompositeOperation = 'lighter';
      ctx.globalAlpha = pa * Math.min(1, a);
      ctx.drawImage(spr, x - radius, y - radius, radius * 2, radius * 2);
      ctx.globalAlpha = pa;
      ctx.globalCompositeOperation = po;
    } catch (e) { report(e, 'Art.glow'); }
  };

  // Small soft dot sprites (particles): tinted, pre-blurred, 32 px.
  const dotCache = new Map();
  Art.dotSprite = function (color, hard) {
    const key = color + (hard ? '|h' : '');
    let spr = dotCache.get(key);
    if (spr) return spr;
    const S = 32, { canvas, ctx } = makeCanvas(S, S);
    const g = ctx.createRadialGradient(S / 2, S / 2, 0, S / 2, S / 2, S / 2);
    g.addColorStop(0, rgba(color, 1));
    g.addColorStop(hard ? 0.45 : 0.25, rgba(color, hard ? 0.95 : 0.7));
    g.addColorStop(hard ? 0.62 : 0.6, rgba(color, hard ? 0.25 : 0.18));
    g.addColorStop(1, rgba(color, 0));
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, S, S);
    if (dotCache.size > 64) dotCache.delete(dotCache.keys().next().value);
    dotCache.set(key, canvas);
    return canvas;
  };

  // ---------------------------------------------------------------------------------------------
  // Flames. x,y = base of the flame (wick tip); size = flame height in px.
  const FLAMES = {
    blue: { outer: '#1d3ad0', mid: '#38b6ff', core: '#f2fbff', glow: '#3f8cff' },
    orange: { outer: '#c33a16', mid: '#ff9a2c', core: '#fff0c2', glow: '#ff8236' },
    red: { outer: '#8a1010', mid: '#ee3e26', core: '#ffd0a0', glow: '#ff3c2a' },
    white: { outer: '#8aa0c2', mid: '#dfe9ff', core: '#ffffff', glow: '#c8dcff' },
    violet: { outer: '#4618aa', mid: '#a468ff', core: '#f6e8ff', glow: '#9060ff' },
    gold: { outer: '#b2720c', mid: '#ffc838', core: '#fffbe0', glow: '#ffc850' },
    pale: { outer: '#646c78', mid: '#c0c6d0', core: '#f4f4ec', glow: '#aab4c4' },
  };
  Art.FLAMES = FLAMES;
  function teardrop(ctx, x, y, r, h, sway) {
    const tx = x + sway, ty = y - h;
    ctx.beginPath();
    ctx.moveTo(tx, ty);
    ctx.bezierCurveTo(x + sway * 0.45 + r * 0.25, y - h * 0.55, x + r * 1.02, y - r * 2.1, x + r, y - r);
    ctx.arc(x, y - r, r, 0, Math.PI, false);
    ctx.bezierCurveTo(x - r * 1.02, y - r * 2.1, x + sway * 0.45 - r * 0.25, y - h * 0.55, tx, ty);
    ctx.closePath();
  }
  /**
   * Animated flame. kind: blue|orange|red|white|violet|gold|pale. opts (optional 8th arg):
   * {glow: 0..1 (default 1), lean: px horizontal lean (e.g. from velocity), noGlow: bool}
   */
  Art.flame = function (ctx, x, y, size, kind, t, seed, opts) {
    if (!(size > 0)) return;
    try {
      const k = FLAMES[kind] || FLAMES.orange;
      t = t || 0; seed = seed || 0;
      const o = opts || {};
      const s1 = noise1(t * 7.1 + seed * 13.37, 17), s2 = noise1(t * 2.9 + seed * 5.71, 29), s3 = noise1(t * 13.3 + seed * 3.1, 41);
      const h = size * (1 + 0.13 * s1 + 0.05 * s3);
      const r = size * 0.21 * (1 - 0.05 * s1);
      const sway = size * 0.2 * s2 + (o.lean || 0);
      const ga = o.noGlow ? 0 : (o.glow === undefined ? 1 : o.glow);
      if (ga > 0) {
        Art.glow(ctx, x + sway * 0.3, y - h * 0.38, size * 2.4, k.glow, (0.3 + 0.05 * s3) * ga);
        Art.glow(ctx, x + sway * 0.2, y - h * 0.3, size * 0.9, k.mid, 0.35 * ga);
      }
      const pf = ctx.fillStyle;
      ctx.fillStyle = k.outer; teardrop(ctx, x, y, r, h, sway); ctx.fill();
      ctx.fillStyle = k.mid; teardrop(ctx, x, y + r * 0.05, r * 0.74, h * 0.74, sway * 0.72); ctx.fill();
      ctx.fillStyle = k.core; teardrop(ctx, x, y + r * 0.1, r * 0.46, h * 0.44, sway * 0.45); ctx.fill();
      ctx.fillStyle = pf;
    } catch (e) { report(e, 'Art.flame'); }
  };

  // ---------------------------------------------------------------------------------------------
  // Room caches (LRU by room id) & public API
  const LRU = new Map(); // roomId → cache
  const LRU_MAX = 6;
  const PIXEL_BUDGET = 64e6; // ~256 MB of RGBA across cached rooms (current room always kept)

  function regionIdOf(room) { return room.regionId || (room.region && room.region.id) || (room.def && room.def.region) || 'test'; }
  function themeOf(room, cfg) {
    const th = Object.assign({}, cfg.theme || {});
    const d = room.def && room.def.theme;
    if (d && typeof d === 'object') Object.assign(th, d);
    return th;
  }
  function keyOf(room) {
    const d = room.def || {};
    let th = '';
    try { th = d.theme ? JSON.stringify(d.theme) : ''; } catch (e) { th = ''; }
    return [room.id, regionIdOf(room), room.cols, room.rows, d.bgSeed || 0, th].join('|');
  }
  function cachePixels(cache) {
    let n = 0;
    const add = (c) => { if (c) n += c.width * c.height; };
    if (cache.terrain) {
      for (const ch of cache.terrain.chunks || []) if (ch) add(ch.canvas);
      for (const ch of cache.terrain.bgChunks || []) if (ch) add(ch.canvas);
    }
    if (cache.veil && cache.veil.sprites) for (const s of cache.veil.sprites) add(s.canvas);
    if (cache.bg) {
      if (cache.bg.backdrop) add(cache.bg.backdrop.canvas);
      for (const l of cache.bg.layers || []) for (const b of l.bands || []) add(b.canvas);
    }
    return n;
  }
  function disposeCache(cache) {
    if (!cache || cache.disposed) return;
    cache.disposed = true;
    try {
      if (cache.terrain) {
        for (const ch of cache.terrain.chunks || []) if (ch) freeCanvas(ch.canvas);
        for (const ch of cache.terrain.bgChunks || []) if (ch) freeCanvas(ch.canvas);
        for (const b of cache.terrain.breakSprites || []) if (b) { freeCanvas(b.canvas); freeCanvas(b.hit1); freeCanvas(b.hit2); }
      }
      if (cache.veil && Art.Terrain && Art.Terrain.disposeVeil) Art.Terrain.disposeVeil(cache);
      if (cache.bg) {
        if (cache.bg.backdrop) freeCanvas(cache.bg.backdrop.canvas);
        for (const l of cache.bg.layers || []) for (const b of l.bands || []) freeCanvas(b.canvas);
      }
      if (cache.fg) for (const it of cache.fg) if (it.s && it.s.own) freeCanvas(it.s.canvas);
    } catch (e) { report(e, 'Art.dispose'); }
  }
  function touch(id, cache) {
    LRU.delete(id);
    LRU.set(id, cache);
    // Evict oldest beyond count/pixel budget (never the most recent one).
    let total = 0;
    for (const c of LRU.values()) total += c.pixels || 0;
    while (LRU.size > 1 && (LRU.size > LRU_MAX || total > PIXEL_BUDGET)) {
      const [oid, oc] = LRU.entries().next().value;
      LRU.delete(oid);
      total -= oc.pixels || 0;
      disposeCache(oc);
    }
  }

  function pristineTiles(room) {
    // Original tiles from the definition (so procedural placement is identical whether or not
    // breakables were already broken). Falls back to the live tiles.
    const d = room.def;
    const n = room.cols * room.rows;
    const out = new Uint8Array(n);
    out.set(room.tiles.subarray ? room.tiles.subarray(0, n) : room.tiles);
    if (d && Array.isArray(d.tiles) && d.tiles.length === room.rows) {
      const map = G.TILE_CHARS || { '.': 0, '#': 1, X: 2, '=': 3, '^': 4, '~': 5, '%': 6, B: 7, D: 8, ':': 9 };
      for (let r = 0; r < room.rows; r++) {
        const s = d.tiles[r];
        if (typeof s !== 'string' || s.length !== room.cols) return out;
        for (let c = 0; c < room.cols; c++) {
          const code = map[s[c]];
          out[r * room.cols + c] = code === undefined ? 0 : code;
        }
      }
    }
    return out;
  }

  function build(room, key) {
    const t0 = U.now();
    const cfg = Art.region(regionIdOf(room));
    const theme = themeOf(room, cfg);
    const d = room.def || {};
    const cache = {
      __art: key, id: room.id, regionId: regionIdOf(room), cfg, pal: cfg.palette, mat: cfg.materials, theme,
      seed: hashStr(room.id + ':' + (d.bgSeed || 0)),
      cols: room.cols, rows: room.rows,
      W: room.widthPx || room.cols * TILE, H: room.heightPx || room.rows * TILE,
      tilesCopy: new Uint8Array(room.tiles), pristine: pristineTiles(room),
      lights: [], timing: {}, pixels: 0,
    };
    const step = (name, fn) => {
      const a = U.now();
      try { fn(); } catch (e) { report(e, 'Art.prepareRoom.' + name); }
      cache.timing[name] = +(U.now() - a).toFixed(2);
    };
    step('terrain', () => Art.Terrain && Art.Terrain.build(room, cache));
    step('decor', () => Art.Decor && Art.Decor.build(room, cache));
    step('bg', () => Art.BG && Art.BG.build(room, cache));
    step('fg', () => Art.FG && Art.FG.build(room, cache));
    step('atmos', () => Art.Atmos && Art.Atmos.init(room, cache));
    step('chunks', () => Art.Terrain && Art.Terrain.renderInitial(room, cache));
    const lights = [];
    if (cache.terrain && cache.terrain.lights) lights.push(...cache.terrain.lights);
    if (cache.decor && cache.decor.lights) lights.push(...cache.decor.lights);
    cache.lights = lights;
    cache.pixels = cachePixels(cache);
    cache.timing.total = +(U.now() - t0).toFixed(2);
    return cache;
  }

  function prepare(room) {
    if (!room || !room.tiles || !(room.cols > 0) || !(room.rows > 0)) return null;
    const key = keyOf(room);
    let cache = room.artCache && room.artCache.__art === key && !room.artCache.disposed ? room.artCache : null;
    if (!cache) {
      const old = LRU.get(room.id);
      if (old && old.__art === key && !old.disposed) cache = old;
      else if (old) { LRU.delete(room.id); disposeCache(old); }
    }
    if (cache) syncTiles(room, cache);
    else cache = build(room, key);
    room.artCache = cache;
    touch(room.id, cache);
    return cache;
  }

  // Detect tile edits that bypassed onTilesChanged (robustness) and rebuild what changed.
  function syncTiles(room, cache) {
    const a = room.tiles, b = cache.tilesCopy, n = Math.min(a.length, b.length);
    let c0 = 1e9, r0 = 1e9, c1 = -1, r1 = -1;
    for (let i = 0; i < n; i++) {
      if (a[i] !== b[i]) {
        const c = i % room.cols, r = (i / room.cols) | 0;
        if (c < c0) c0 = c; if (c > c1) c1 = c; if (r < r0) r0 = r; if (r > r1) r1 = r;
      }
    }
    if (c1 >= 0) tilesChanged(room, cache, c0, r0, c1, r1);
  }
  function tilesChanged(room, cache, c0, r0, c1, r1) {
    cache.tilesCopy.set(room.tiles.subarray ? room.tiles.subarray(0, cache.tilesCopy.length) : room.tiles);
    if (Art.Terrain) Art.Terrain.tilesChanged(room, cache, c0, r0, c1, r1);
    cache.pixels = cachePixels(cache);
  }

  function ensure(room) {
    if (!room) return null;
    const c = room.artCache;
    if (c && c.__art && c.id === room.id && !c.disposed) return c;
    return prepare(room);
  }
  Art.cacheOf = ensure;

  Art.prepareRoom = function (room) {
    try { return prepare(room); } catch (e) { report(e, 'Art.prepareRoom'); return null; }
  };
  Art.onTilesChanged = function (room, c0, r0, c1, r1) {
    try {
      const cache = ensure(room);
      if (!cache) return;
      const cols = room.cols, rows = room.rows;
      c0 = clamp(Math.floor(c0 === undefined ? 0 : c0), 0, cols - 1);
      r0 = clamp(Math.floor(r0 === undefined ? 0 : r0), 0, rows - 1);
      c1 = clamp(Math.floor(c1 === undefined ? cols - 1 : c1), 0, cols - 1);
      r1 = clamp(Math.floor(r1 === undefined ? rows - 1 : r1), 0, rows - 1);
      if (c1 < c0) { const s = c0; c0 = c1; c1 = s; }
      if (r1 < r0) { const s = r0; r0 = r1; r1 = s; }
      tilesChanged(room, cache, c0, r0, c1, r1);
    } catch (e) { report(e, 'Art.onTilesChanged'); }
  };
  /** Drop all cached art (e.g. on quit to title). */
  Art.clearCaches = function () {
    for (const c of LRU.values()) disposeCache(c);
    LRU.clear();
  };
  Art.cacheStats = function () {
    let px = 0;
    for (const c of LRU.values()) px += c.pixels || 0;
    return { rooms: LRU.size, megapixels: +(px / 1e6).toFixed(2), ids: Array.from(LRU.keys()) };
  };

  function camOf(cam) {
    if (!cam) return { x: 0, y: 0, w: VIEW_W, h: VIEW_H };
    return cam;
  }
  // Wrap each drawing entry point: guarantees ctx state hygiene and never throws.
  function drawEntry(name, fn) {
    return function (ctx, room, cam, t) {
      if (!ctx || !room) return;
      const cache = ensure(room);
      if (!cache) return;
      ctx.save();
      try { fn(ctx, room, cache, camOf(cam), t || 0); } catch (e) { report(e, 'Art.' + name); }
      ctx.restore();
    };
  }
  const sub = (mod, fn) => (ctx, room, cache, cam, t) => { const M = Art[mod]; if (M && M[fn]) M[fn](ctx, room, cache, cam, t); };
  Art.drawBackground = drawEntry('drawBackground', (ctx, room, cache, cam, t) => {
    Art.current = cache;
    sub('BG', 'draw')(ctx, room, cache, cam, t);
  });
  Art.drawBackDecor = drawEntry('drawBackDecor', (ctx, room, cache, cam, t) => {
    sub('Terrain', 'drawBgWalls')(ctx, room, cache, cam, t);
    sub('Decor', 'drawBack')(ctx, room, cache, cam, t);
  });
  Art.drawTerrain = drawEntry('drawTerrain', (ctx, room, cache, cam, t) => {
    syncTiles(room, cache);
    sub('Terrain', 'draw')(ctx, room, cache, cam, t);
    sub('Terrain', 'drawVeils')(ctx, room, cache, cam, t);   // secret pockets (G.World.hiddenPockets) drawn as rock
  });
  /** Veil opacity 0..1 over world point (x, y) of the room: things anchored inside a veiled secret pocket are hidden
   *  by this much (render.js fades entities with it). 0 when the room has no veiled pocket there. */
  Art.veilAlphaAt = function (room, x, y) {
    const cache = room && room.artCache;
    if (!cache || !cache.veil || cache.disposed || !Art.Terrain) return 0;
    try { return Art.Terrain.veilAlphaAt(room, cache, x, y); } catch (e) { report(e, 'Art.veilAlphaAt'); return 0; }
  };
  Art.drawBreakables = drawEntry('drawBreakables', sub('Terrain', 'drawBreakables'));
  Art.drawLiquids = drawEntry('drawLiquids', sub('Terrain', 'drawLiquids'));
  Art.drawFrontDecor = drawEntry('drawFrontDecor', sub('Decor', 'drawFront'));
  Art.drawForeground = drawEntry('drawForeground', sub('FG', 'draw'));
  Art.drawAtmosphere = drawEntry('drawAtmosphere', sub('Atmos', 'draw'));
  Art.updateAtmosphere = function (room, cam, dt) {
    try {
      const cache = ensure(room);
      if (cache && Art.Atmos) Art.Atmos.update(room, cache, camOf(cam), dt);
      if (cache && cache.veil && Art.Terrain && Art.Terrain.updateVeil) Art.Terrain.updateVeil(room, cache, dt);
    } catch (e) { report(e, 'Art.updateAtmosphere'); }
  };
  /** Static lights for the room (world px): [{x, y, r, color, intensity, flicker}]. Read-only array. */
  Art.staticLights = function (room) {
    try {
      const cache = ensure(room);
      return cache ? cache.lights : [];
    } catch (e) { report(e, 'Art.staticLights'); return []; }
  };
})();
