// src/core/util.js — math/color/easing helpers (G.U) and a seeded RNG (G.RNG). Node-loadable.
(function () {
  'use strict';
  const G = globalThis.G;

  const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
  const lerp = (a, b, t) => a + (b - a) * t;

  // ---- colors (results cached: art code calls these a lot) ----
  const rgbCache = new Map();
  function hexToRgb(hex) {
    let c = rgbCache.get(hex);
    if (c) return c;
    let h = String(hex || '#000').trim();
    if (h[0] === '#') h = h.slice(1);
    if (h.length === 3 || h.length === 4) h = h.split('').map((ch) => ch + ch).join('');
    const n = parseInt(h.slice(0, 6), 16);
    c = isNaN(n) ? { r: 0, g: 0, b: 0 } : { r: (n >> 16) & 255, g: (n >> 8) & 255, b: n & 255 };
    if (rgbCache.size > 4000) rgbCache.clear();
    rgbCache.set(hex, c);
    return c;
  }
  const hex2 = (v) => {
    const s = clamp(Math.round(v), 0, 255).toString(16);
    return s.length < 2 ? '0' + s : s;
  };
  const rgbToHex = (r, g, b) => '#' + hex2(r) + hex2(g) + hex2(b);
  const rgbaCache = new Map();
  function rgba(hex, a) {
    const al = Math.round(clamp(a === undefined ? 1 : a, 0, 1) * 1000) / 1000;
    const key = hex + '|' + al;
    let s = rgbaCache.get(key);
    if (s) return s;
    const c = hexToRgb(hex);
    s = 'rgba(' + c.r + ',' + c.g + ',' + c.b + ',' + al + ')';
    if (rgbaCache.size > 6000) rgbaCache.clear();
    rgbaCache.set(key, s);
    return s;
  }
  function mix(a, b, t) {
    const x = hexToRgb(a), y = hexToRgb(b);
    return rgbToHex(lerp(x.r, y.r, t), lerp(x.g, y.g, t), lerp(x.b, y.b, t));
  }
  // amt in [-1, 1]: negative darkens toward black, positive lightens toward white.
  function shade(hex, amt) {
    return amt < 0 ? mix(hex, '#000000', -amt) : mix(hex, '#ffffff', amt);
  }

  const ease = {
    linear: (t) => t,
    inQuad: (t) => t * t,
    outQuad: (t) => t * (2 - t),
    inOutQuad: (t) => (t < 0.5 ? 2 * t * t : -1 + (4 - 2 * t) * t),
    inCubic: (t) => t * t * t,
    outCubic: (t) => { const u = t - 1; return u * u * u + 1; },
    inOutCubic: (t) => (t < 0.5 ? 4 * t * t * t : (t - 1) * (2 * t - 2) * (2 * t - 2) + 1),
    inSine: (t) => 1 - Math.cos((t * Math.PI) / 2),
    outSine: (t) => Math.sin((t * Math.PI) / 2),
    inOutSine: (t) => -(Math.cos(Math.PI * t) - 1) / 2,
    inBack: (t) => { const s = 1.70158; return t * t * ((s + 1) * t - s); },
    outBack: (t) => { const s = 1.70158, u = t - 1; return u * u * ((s + 1) * u + s) + 1; },
    outElastic: (t) => (t === 0 || t === 1 ? t : Math.pow(2, -10 * t) * Math.sin(((t * 10 - 0.75) * 2 * Math.PI) / 3) + 1),
    outBounce: (t) => {
      const n = 7.5625, d = 2.75;
      if (t < 1 / d) return n * t * t;
      if (t < 2 / d) { t -= 1.5 / d; return n * t * t + 0.75; }
      if (t < 2.5 / d) { t -= 2.25 / d; return n * t * t + 0.9375; }
      t -= 2.625 / d; return n * t * t + 0.984375;
    },
  };

  // FNV-1a 32-bit
  function hash(str) {
    const s = String(str);
    let h = 0x811c9dc5;
    for (let i = 0; i < s.length; i++) {
      h ^= s.charCodeAt(i);
      h = Math.imul(h, 0x01000193);
    }
    return h >>> 0;
  }

  function makeCanvas(w, h) {
    w = Math.max(1, Math.ceil(w)); h = Math.max(1, Math.ceil(h));
    let canvas;
    if (typeof document !== 'undefined' && document.createElement) {
      canvas = document.createElement('canvas');
      canvas.width = w; canvas.height = h;
    } else if (typeof OffscreenCanvas !== 'undefined') {
      canvas = new OffscreenCanvas(w, h);
    } else {
      throw new Error('G.U.makeCanvas: no canvas implementation available');
    }
    return { canvas, ctx: canvas.getContext('2d') };
  }

  const now = (typeof performance !== 'undefined' && performance.now) ? () => performance.now() : () => Date.now();

  function formatTime(sec) {
    sec = Math.max(0, Math.floor(sec || 0));
    const h = Math.floor(sec / 3600), m = Math.floor((sec % 3600) / 60), s = sec % 60;
    const mm = (m < 10 ? '0' : '') + m, ss = (s < 10 ? '0' : '') + s;
    return h > 0 ? h + ':' + mm + ':' + ss : m + ':' + ss;
  }

  G.U = {
    clamp, lerp,
    clamp01: (v) => clamp(v, 0, 1),
    invLerp: (a, b, v) => (a === b ? 0 : (v - a) / (b - a)),
    remap: (v, a, b, c, d) => lerp(c, d, a === b ? 0 : (v - a) / (b - a)),
    approach(cur, target, delta) {
      if (cur < target) return Math.min(cur + delta, target);
      if (cur > target) return Math.max(cur - delta, target);
      return target;
    },
    // frame-rate independent exponential smoothing: rate ~ 1/seconds
    damp: (cur, target, rate, dt) => lerp(cur, target, 1 - Math.exp(-rate * dt)),
    sign: (v) => (v > 0 ? 1 : v < 0 ? -1 : 0),
    smoothstep: (a, b, v) => { const t = clamp((v - a) / (b - a), 0, 1); return t * t * (3 - 2 * t); },
    fract: (v) => v - Math.floor(v),
    wrap: (v, n) => ((v % n) + n) % n,
    rand: (a, b) => a + Math.random() * (b - a),
    randInt: (a, b) => a + Math.floor(Math.random() * (b - a + 1)),
    choose: (arr) => arr[Math.floor(Math.random() * arr.length)],
    hash,
    dist: (x1, y1, x2, y2) => Math.hypot(x2 - x1, y2 - y1),
    angle: (x1, y1, x2, y2) => Math.atan2(y2 - y1, x2 - x1),
    lerpAngle(a, b, t) {
      let d = (b - a) % (Math.PI * 2);
      if (d > Math.PI) d -= Math.PI * 2; else if (d < -Math.PI) d += Math.PI * 2;
      return a + d * t;
    },
    aabb: (a, b) => a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y,
    pointInRect: (px, py, r) => px >= r.x && px < r.x + r.w && py >= r.y && py < r.y + r.h,
    ease,
    hexToRgb, rgbToHex, rgba, mix, shade,
    makeCanvas, now, formatTime,
  };

  // Seeded PRNG (mulberry32). Seed: number or string.
  class RNG {
    constructor(seed) {
      this.s = (typeof seed === 'string' ? hash(seed) : (seed >>> 0)) || 0x9e3779b9;
    }
    next() {
      let t = (this.s = (this.s + 0x6d2b79f5) >>> 0);
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    }
    range(a, b) { return a + this.next() * (b - a); }
    int(a, b) { return a + Math.floor(this.next() * (b - a + 1)); } // inclusive
    pick(arr) { return arr[Math.floor(this.next() * arr.length)]; }
    chance(p) { return this.next() < p; }
    sign() { return this.next() < 0.5 ? -1 : 1; }
    shuffle(arr) {
      for (let i = arr.length - 1; i > 0; i--) {
        const j = Math.floor(this.next() * (i + 1));
        const t = arr[i]; arr[i] = arr[j]; arr[j] = t;
      }
      return arr;
    }
  }
  G.RNG = RNG;
})();
