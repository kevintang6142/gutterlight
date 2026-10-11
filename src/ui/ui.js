// src/ui/ui.js — G.UI core: screen stack (fades, input routing, blocking), overlay layers, and the shared
// presentation kit used by every UI file: fonts, text lookup/format/tokens, wrapping (with key-cap tokens),
// ornaments (flourishes, filigree corners, panels), menus, key caps, hints, glows/flames and UI particles.
// The other src/ui/*.js files attach their screens to G.UI. No DOM access at load time.
(function () {
  'use strict';
  const G = globalThis.G;
  const W = G.CONST.VIEW_W, H = G.CONST.VIEW_H;
  const TAU = Math.PI * 2;

  const UI = {};
  G.UI = UI;
  UI.W = W; UI.H = H;

  // ------------------------------------------------------------------ palette & fonts
  const FONT_STACK = "'Palatino Linotype', 'Book Antiqua', Palatino, Georgia, serif";
  const C = {
    cream: '#ece4cf', creamHi: '#fbf6e8', creamDim: '#b9b09a', dim: '#857e6e', faint: '#4d4a43',
    gold: '#dcc283', goldDim: '#9c8758', blue: '#8fd3ff', blueHi: '#e2f6ff', blueDeep: '#3f8cff',
    red: '#e08a78', ink: '#05060a', panelTop: 'rgba(12,13,20,0.93)', panelBot: 'rgba(5,6,10,0.93)',
    veil: 'rgba(3,4,8,0.74)',
  };
  UI.FONT_STACK = FONT_STACK;
  UI.C = C;

  const fontCache = new Map();
  /** CSS font string in the UI serif stack. style: '' | 'italic' | 'bold' | 'italic bold'. */
  UI.font = function (size, style) {
    const key = size + '|' + (style || '');
    let f = fontCache.get(key);
    if (!f) { f = (style ? style + ' ' : '') + Math.round(size) + 'px ' + FONT_STACK; fontCache.set(key, f); }
    return f;
  };

  let measureCtx = null;
  /** Small offscreen 2D context for text measurement outside draw() (layout in update). Lazy; never at load. */
  UI.measureCtx = function () {
    if (!measureCtx) measureCtx = G.U.makeCanvas(8, 8).ctx;
    return measureCtx;
  };

  const safe = (fn, where) => { try { return fn(); } catch (err) { G.reportError(err, where); return undefined; } };
  UI.safe = safe;

  // ------------------------------------------------------------------ text lookup, format, tokens
  function lookup(path) {
    let o = G.Text;
    const parts = String(path).split('.');
    for (let i = 0; i < parts.length; i++) { if (o == null) return undefined; o = o[parts[i]]; }
    return o;
  }
  /** String from G.Text by dotted path ('ui.resume'), or the fallback when missing. */
  UI.text = function (path, fallback) {
    const v = lookup(path);
    return typeof v === 'string' ? v : (fallback !== undefined ? fallback : '');
  };
  /** Object/array from G.Text by dotted path, or null. */
  UI.textObj = function (path) { const v = lookup(path); return v && typeof v === 'object' ? v : null; };
  /** Fill {name} placeholders from vars; unknown placeholders (e.g. input tokens) stay. */
  UI.fmt = function (str, vars) {
    return String(str == null ? '' : str).replace(/\{(\w+)\}/g, (m, k) => (vars && vars[k] !== undefined && vars[k] !== null ? String(vars[k]) : m));
  };
  function actionList() { return (G.input && G.input.ACTIONS) || []; }
  function isAction(a) { return actionList().indexOf(a) >= 0; }
  /** Input label for an action ('Z', 'A', '↑', ...) based on the last used device. */
  UI.keyLabel = function (action) {
    try { return (G.input && G.input.label) ? G.input.label(action) : action; } catch (e) { return action; }
  };
  /** Replace {jump} {attack} ... tokens with plain key labels. */
  UI.tokens = function (str) {
    return String(str == null ? '' : str).replace(/\{(\w+)\}/g, (m, k) => (isAction(k) ? UI.keyLabel(k) : m));
  };
  /** Region display name. */
  UI.regionName = function (id) {
    const a = lookup('areas.' + id + '.name');
    if (typeof a === 'string') return a;
    const r = G.World && G.World.regions && G.World.regions[id];
    return (r && r.name) || '';
  };
  const PREFIX_REGION = { sh: 'shore', ll: 'lastlight', gw: 'guttered', mb: 'meltbloom', sf: 'flue', dn: 'nave',
    ch: 'chandlery', mw: 'mothwood', ri: 'rime', hs: 'sanctum' };
  /** Region id of a room: from G.World when the room is defined, else from its id prefix (TECH_SPEC §19). */
  UI.regionOfRoom = function (roomId) {
    if (!roomId) return null;
    try { const d = G.World && G.World.getRoom && G.World.getRoom(roomId); if (d && d.region) return d.region; } catch (e) { /* fall through */ }
    return PREFIX_REGION[String(roomId).split('_')[0]] || null;
  };
  UI.sfx = function (name, opts) {
    if (G.sfx) { safe(() => G.sfx(name, opts), 'UI.sfx'); return; }
    if (G.Audio && typeof G.Audio.sfx === 'function') safe(() => G.Audio.sfx(name, opts), 'UI.sfx');
  };
  UI.stinger = function (name, opts) {
    if (G.Audio && typeof G.Audio.stinger === 'function') safe(() => G.Audio.stinger(name, opts), 'UI.stinger');
  };
  UI.music = function (id, opts) {
    if (G.Audio && typeof G.Audio.music === 'function') safe(() => G.Audio.music(id, opts), 'UI.music');
  };

  // ------------------------------------------------------------------ text wrapping (plain + rich)
  const wrapCache = new Map();
  function cachePut(key, val) {
    if (wrapCache.size > 400) wrapCache.delete(wrapCache.keys().next().value);
    wrapCache.set(key, val);
    return val;
  }
  /** Wrap text to maxW with the ctx's current font. Honors '\n'. Returns an array of lines (cached). */
  UI.wrap = function (ctx, text, maxW) {
    const s = String(text == null ? '' : text);
    const key = 'p|' + ctx.font + '|' + maxW + '|' + s;
    const hit = wrapCache.get(key);
    if (hit) return hit;
    const out = [];
    for (const para of s.split('\n')) {
      const words = para.split(/ +/);
      let line = '';
      for (let w of words) {
        if (!w) continue;
        // hard-break words longer than the line
        while (ctx.measureText(w).width > maxW && w.length > 1) {
          let n = w.length - 1;
          while (n > 1 && ctx.measureText(w.slice(0, n)).width > maxW) n--;
          if (line) { out.push(line); line = ''; }
          out.push(w.slice(0, n));
          w = w.slice(n);
        }
        const test = line ? line + ' ' + w : w;
        if (line && ctx.measureText(test).width > maxW) { out.push(line); line = w; } else line = test;
      }
      out.push(line);
    }
    return cachePut(key, out);
  };
  /**
   * Like wrap, but evens out line lengths (no lone last word): the narrowest width (≥ 55% of maxW) that keeps
   * the same number of lines. For centered prose (verse, ending pages). Cached.
   */
  UI.wrapBalanced = function (ctx, text, maxW) {
    const s = String(text == null ? '' : text);
    const key = 'b|' + ctx.font + '|' + maxW + '|' + s;
    const hit = wrapCache.get(key);
    if (hit) return hit;
    const base = UI.wrap(ctx, s, maxW);
    if (base.length < 2) return cachePut(key, base);
    let lo = maxW * 0.55, hi = maxW;
    for (let i = 0; i < 9; i++) {
      const mid = (lo + hi) / 2;
      if (UI.wrap(ctx, s, mid).length > base.length) lo = mid; else hi = mid;
    }
    return cachePut(key, UI.wrap(ctx, s, Math.ceil(hi)));
  };

  /**
   * Rich layout: like wrap, but {action} tokens become key caps. size = font px (ctx.font must be set).
   * Returns {lines:[{w, parts:[{text, w} | {key, w}]}], lineH}.
   */
  UI.layoutRich = function (ctx, text, maxW, size) {
    const s = String(text == null ? '' : text);
    const dev = (G.input && G.input.lastDevice) || 'keyboard';
    // labelsVersion: key caps follow rebinding and learned keyboard layouts
    const key = 'r|' + ctx.font + '|' + maxW + '|' + dev + '|' + ((G.input && G.input.labelsVersion) || 0) + '|' + s;
    const hit = wrapCache.get(key);
    if (hit) return hit;
    const font = ctx.font;
    const spaceW = ctx.measureText(' ').width;
    const lines = [];
    for (const para of s.split('\n')) {
      let cur = { w: 0, parts: [] };
      const groups = para.split(/ +/).filter((g) => g.length);
      for (const grp of groups) {
        const parts = [];
        let gw = 0;
        for (const piece of grp.split(/(\{\w+\})/)) {
          if (!piece) continue;
          const m = /^\{(\w+)\}$/.exec(piece);
          if (m && isAction(m[1])) {
            const label = UI.keyLabel(m[1]);
            const kw = keycapWidth(ctx, label, size);
            ctx.font = font;
            parts.push({ key: label, w: kw });
            gw += kw;
          } else {
            const w = ctx.measureText(piece).width;
            parts.push({ text: piece, w });
            gw += w;
          }
        }
        if (cur.parts.length && cur.w + spaceW + gw > maxW) { lines.push(cur); cur = { w: 0, parts: [] }; }
        if (cur.parts.length) { cur.parts.push({ text: ' ', w: spaceW }); cur.w += spaceW; }
        for (const p of parts) cur.parts.push(p);
        cur.w += gw;
      }
      lines.push(cur);
    }
    return cachePut(key, { lines, size });
  };
  /** Draw a rich layout. align: 'left'|'center'|'right' relative to x; y = baseline of the first line. */
  UI.drawRich = function (ctx, layout, x, y, lineH, align, color) {
    const size = layout.size;
    const font = ctx.font;
    ctx.textAlign = 'left';
    ctx.textBaseline = 'alphabetic';
    for (let i = 0; i < layout.lines.length; i++) {
      const ln = layout.lines[i];
      let lx = align === 'center' ? x - ln.w / 2 : align === 'right' ? x - ln.w : x;
      const ly = y + i * lineH;
      for (const p of ln.parts) {
        if (p.key !== undefined) {
          UI.keycap(ctx, p.key, lx + p.w / 2, ly - size * 0.34, size * 1.08, { color });
          ctx.font = font;
          ctx.textAlign = 'left';
          ctx.textBaseline = 'alphabetic';
        } else {
          if (color) ctx.fillStyle = color;
          ctx.fillText(p.text, lx, ly);
        }
        lx += p.w;
      }
    }
  };

  // ------------------------------------------------------------------ glows, flames
  /** Additive soft glow (G.Art.glow → G.fx.glowAt → gradient fallback). */
  UI.glow = function (ctx, x, y, r, color, alpha) {
    if (!(r > 0) || !(alpha > 0.003)) return;
    if (G.Art && typeof G.Art.glow === 'function') { G.Art.glow(ctx, x, y, r, color, alpha); return; }
    if (G.fx && typeof G.fx.glowAt === 'function') { G.fx.glowAt(ctx, x, y, r, color, alpha); return; }
    const po = ctx.globalCompositeOperation, pa = ctx.globalAlpha;
    ctx.globalCompositeOperation = 'lighter';
    ctx.globalAlpha = pa * Math.min(1, alpha);
    const g = ctx.createRadialGradient(x, y, 0, x, y, r);
    g.addColorStop(0, color); g.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = g;
    ctx.fillRect(x - r, y - r, r * 2, r * 2);
    ctx.globalAlpha = pa; ctx.globalCompositeOperation = po;
  };
  const FALLBACK_FLAME = { blue: ['#1d3ad0', '#38b6ff', '#f2fbff'], gold: ['#b2720c', '#ffc838', '#fffbe0'], orange: ['#c33a16', '#ff9a2c', '#fff0c2'],
    white: ['#8aa0c2', '#dfe9ff', '#ffffff'], pale: ['#646c78', '#c0c6d0', '#f4f4ec'], red: ['#8a1010', '#ee3e26', '#ffd0a0'], violet: ['#4618aa', '#a468ff', '#f6e8ff'] };
  /** Animated flame; x,y = base (wick tip), size = height px. kind: blue|orange|red|white|violet|gold|pale. */
  UI.flame = function (ctx, x, y, size, kind, t, seed, opts) {
    if (!(size > 0.5)) return;
    if (G.Art && typeof G.Art.flame === 'function') { G.Art.flame(ctx, x, y, size, kind, t, seed, opts); return; }
    const k = FALLBACK_FLAME[kind] || FALLBACK_FLAME.orange;
    const s1 = Math.sin(t * 9 + (seed || 0) * 3.1), s2 = Math.sin(t * 3.3 + (seed || 0));
    const h = size * (1 + 0.1 * s1), r = size * 0.21, sway = size * 0.15 * s2;
    if (!(opts && opts.noGlow)) UI.glow(ctx, x, y - h * 0.35, size * 2.2, k[1], 0.35);
    for (let i = 0; i < 3; i++) {
      const sc = [1, 0.72, 0.45][i];
      ctx.fillStyle = k[i];
      teardrop(ctx, x, y + r * 0.05 * i, r * sc, h * sc, sway * sc);
      ctx.fill();
    }
  };
  function teardrop(ctx, x, y, r, h, sway) {
    const tx = x + sway, ty = y - h;
    ctx.beginPath();
    ctx.moveTo(tx, ty);
    ctx.bezierCurveTo(x + sway * 0.45 + r * 0.25, y - h * 0.55, x + r * 1.02, y - r * 2.1, x + r, y - r);
    ctx.arc(x, y - r, r, 0, Math.PI, false);
    ctx.bezierCurveTo(x - r * 1.02, y - r * 2.1, x + sway * 0.45 - r * 0.25, y - h * 0.55, tx, ty);
    ctx.closePath();
  }
  UI.teardrop = teardrop;

  // ------------------------------------------------------------------ ornaments
  /** Horizontal flourish divider centered at (cx, y), half-width hw. opts: {color, alpha, size(1)} */
  UI.flourish = function (ctx, cx, y, hw, opts) {
    const o = opts || {};
    const col = o.color || C.cream;
    const s = o.size || 1;
    const pa = ctx.globalAlpha;
    ctx.globalAlpha = pa * (o.alpha === undefined ? 0.85 : o.alpha);
    ctx.fillStyle = col;
    ctx.strokeStyle = col;
    // tapered arms
    const gap = 17 * s;
    for (const d of [-1, 1]) {
      ctx.beginPath();
      ctx.moveTo(cx + d * gap, y - 1.1 * s);
      ctx.lineTo(cx + d * hw, y);
      ctx.lineTo(cx + d * gap, y + 1.1 * s);
      ctx.closePath();
      ctx.fill();
      // small curls beside the center diamond
      ctx.lineWidth = 1.1 * s;
      ctx.beginPath();
      ctx.moveTo(cx + d * 7 * s, y);
      ctx.bezierCurveTo(cx + d * 11 * s, y - 7 * s, cx + d * 18 * s, y - 7 * s, cx + d * 19 * s, y - 3 * s);
      ctx.bezierCurveTo(cx + d * 20 * s, y - 0.5 * s, cx + d * 17 * s, y + 0.5 * s, cx + d * 15.5 * s, y - 1.5 * s);
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(cx + d * 7 * s, y);
      ctx.bezierCurveTo(cx + d * 10 * s, y + 5 * s, cx + d * 14 * s, y + 5.5 * s, cx + d * 16 * s, y + 3 * s);
      ctx.stroke();
      // end beads
      ctx.beginPath();
      ctx.arc(cx + d * (hw + 5 * s), y, 1.5 * s, 0, TAU);
      ctx.fill();
    }
    // center diamond
    ctx.beginPath();
    ctx.moveTo(cx, y - 5 * s); ctx.lineTo(cx + 4 * s, y); ctx.lineTo(cx, y + 5 * s); ctx.lineTo(cx - 4 * s, y);
    ctx.closePath();
    ctx.fill();
    ctx.globalAlpha = pa;
  };
  /** Simple tapered rule (no center ornament). */
  UI.rule = function (ctx, cx, y, hw, color, alpha) {
    const pa = ctx.globalAlpha;
    ctx.globalAlpha = pa * (alpha === undefined ? 0.5 : alpha);
    ctx.fillStyle = color || C.cream;
    ctx.beginPath();
    ctx.moveTo(cx - hw, y); ctx.lineTo(cx, y - 0.8); ctx.lineTo(cx + hw, y); ctx.lineTo(cx, y + 0.8);
    ctx.closePath();
    ctx.fill();
    ctx.globalAlpha = pa;
  };
  /** Filigree corner at (x, y); sx/sy = +1/-1 point the ornament into the panel. */
  UI.corner = function (ctx, x, y, size, sx, sy, color, alpha) {
    const pa = ctx.globalAlpha;
    ctx.globalAlpha = pa * (alpha === undefined ? 0.7 : alpha);
    ctx.save();
    ctx.translate(x, y);
    ctx.scale(sx, sy);
    ctx.strokeStyle = color || C.cream;
    ctx.fillStyle = color || C.cream;
    ctx.lineWidth = 1.2;
    const s = size;
    ctx.beginPath();
    ctx.moveTo(s * 1.25, 0); ctx.lineTo(0, 0); ctx.lineTo(0, s * 1.25);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(s * 0.32, s * 0.95);
    ctx.bezierCurveTo(s * 0.32, s * 0.45, s * 0.45, s * 0.32, s * 0.95, s * 0.32);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(s * 0.32, s * 0.32);
    ctx.bezierCurveTo(s * 0.6, s * 0.32, s * 0.62, s * 0.62, s * 0.42, s * 0.6);
    ctx.stroke();
    ctx.beginPath();
    ctx.arc(s * 0.16, s * 0.16, 1.7, 0, TAU);
    ctx.fill();
    ctx.restore();
    ctx.globalAlpha = pa;
  };
  function roundRect(ctx, x, y, w, h, r) {
    const rr = Math.max(0, Math.min(r, w / 2, h / 2));
    ctx.beginPath();
    ctx.moveTo(x + rr, y);
    ctx.lineTo(x + w - rr, y); ctx.quadraticCurveTo(x + w, y, x + w, y + rr);
    ctx.lineTo(x + w, y + h - rr); ctx.quadraticCurveTo(x + w, y + h, x + w - rr, y + h);
    ctx.lineTo(x + rr, y + h); ctx.quadraticCurveTo(x, y + h, x, y + h - rr);
    ctx.lineTo(x, y + rr); ctx.quadraticCurveTo(x, y, x + rr, y);
    ctx.closePath();
  }
  UI.roundRect = roundRect;
  /** Dark translucent panel with a thin border and filigree corners. opts: {alpha, corners, radius, border, fill, glow} */
  UI.panel = function (ctx, x, y, w, h, opts) {
    const o = opts || {};
    const pa = ctx.globalAlpha;
    ctx.globalAlpha = pa * (o.alpha === undefined ? 1 : o.alpha);
    const r = o.radius === undefined ? 6 : o.radius;
    if (o.fill) ctx.fillStyle = o.fill;
    else {
      const g = ctx.createLinearGradient(0, y, 0, y + h);
      g.addColorStop(0, C.panelTop); g.addColorStop(1, C.panelBot);
      ctx.fillStyle = g;
    }
    roundRect(ctx, x, y, w, h, r);
    ctx.fill();
    ctx.lineWidth = 1;
    ctx.strokeStyle = o.border || 'rgba(236,228,207,0.24)';
    roundRect(ctx, x + 0.5, y + 0.5, w - 1, h - 1, r);
    ctx.stroke();
    ctx.strokeStyle = 'rgba(236,228,207,0.07)';
    roundRect(ctx, x + 5.5, y + 5.5, w - 11, h - 11, Math.max(0, r - 3));
    ctx.stroke();
    if (o.corners !== false) {
      const cs = o.cornerSize || 16;
      const ca = o.cornerAlpha === undefined ? 0.55 : o.cornerAlpha;
      UI.corner(ctx, x + 9, y + 9, cs, 1, 1, o.cornerColor, ca);
      UI.corner(ctx, x + w - 9, y + 9, cs, -1, 1, o.cornerColor, ca);
      UI.corner(ctx, x + 9, y + h - 9, cs, 1, -1, o.cornerColor, ca);
      UI.corner(ctx, x + w - 9, y + h - 9, cs, -1, -1, o.cornerColor, ca);
    }
    ctx.globalAlpha = pa;
  };
  /** Full-screen veil (dims what is behind a screen). */
  UI.veil = function (ctx, alpha, color) {
    const pa = ctx.globalAlpha;
    ctx.globalAlpha = pa * (alpha === undefined ? 1 : alpha);
    ctx.fillStyle = color || C.veil;
    ctx.fillRect(0, 0, W, H);
    ctx.globalAlpha = pa;
  };
  // cached vignette (screen-edge darkening) for full-screen menus
  let vignetteCanvas = null;
  UI.vignette = function (ctx, alpha) {
    if (!vignetteCanvas) {
      const c = G.U.makeCanvas(W / 4, H / 4);
      const g = c.ctx.createRadialGradient(W / 8, H / 8, H * 0.06, W / 8, H / 8, W * 0.15);
      g.addColorStop(0, 'rgba(0,0,0,0)'); g.addColorStop(1, 'rgba(0,0,0,0.85)');
      c.ctx.fillStyle = g;
      c.ctx.fillRect(0, 0, W / 4, H / 4);
      vignetteCanvas = c.canvas;
    }
    const pa = ctx.globalAlpha;
    ctx.globalAlpha = pa * (alpha === undefined ? 1 : alpha);
    ctx.drawImage(vignetteCanvas, 0, 0, W, H);
    ctx.globalAlpha = pa;
  };

  /** Text with letter spacing (manual, cross-browser). align: left|center|right. Returns the drawn width. */
  UI.spacedText = function (ctx, str, x, y, spacing, align) {
    const s = String(str);
    let total = 0;
    const widths = [];
    for (let i = 0; i < s.length; i++) { const w = ctx.measureText(s[i]).width; widths.push(w); total += w + (i < s.length - 1 ? spacing : 0); }
    let cx = align === 'center' ? x - total / 2 : align === 'right' ? x - total : x;
    const pa = ctx.textAlign;
    ctx.textAlign = 'left';
    for (let i = 0; i < s.length; i++) { ctx.fillText(s[i], cx, y); cx += widths[i] + spacing; }
    ctx.textAlign = pa;
    return total;
  };
  UI.spacedWidth = function (ctx, str, spacing) {
    const s = String(str);
    let total = 0;
    for (let i = 0; i < s.length; i++) total += ctx.measureText(s[i]).width + (i < s.length - 1 ? spacing : 0);
    return total;
  };

  /** Key cap centered at (cx, cy) with height h. Returns its width. opts: {color, alpha} */
  function keycapWidth(ctx, label, h) {
    const fs = Math.max(9, Math.round(h * 0.6));
    ctx.font = UI.font(fs, 'bold');
    const tw = ctx.measureText(label).width;
    return Math.max(h * 1.15, tw + h * 0.62) + 4;
  }
  UI.keycapWidth = function (ctx, label, h) { const f = ctx.font; const w = keycapWidth(ctx, label, h); ctx.font = f; return w; };
  UI.keycap = function (ctx, label, cx, cy, h, opts) {
    const o = opts || {};
    const f = ctx.font, ta = ctx.textAlign, tb = ctx.textBaseline;   // restored on exit (callers draw inline text)
    const w = keycapWidth(ctx, label, h) - 4;
    const x = cx - w / 2, y = cy - h / 2;
    const pa = ctx.globalAlpha;
    ctx.globalAlpha = pa * (o.alpha === undefined ? 1 : o.alpha);
    ctx.fillStyle = 'rgba(236,228,207,0.08)';
    roundRect(ctx, x, y, w, h, h * 0.22);
    ctx.fill();
    ctx.strokeStyle = 'rgba(236,228,207,0.55)';
    ctx.lineWidth = 1;
    roundRect(ctx, x + 0.5, y + 0.5, w - 1, h - 1, h * 0.22);
    ctx.stroke();
    ctx.fillStyle = o.color || C.cream;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(label, cx, cy + 1);
    ctx.globalAlpha = pa;
    ctx.font = f; ctx.textAlign = ta; ctx.textBaseline = tb;
    return w + 4;
  };
  /**
   * Footer hints: list of [action, text, keyOverride?] → "[Z] Select   [Esc] Back". x,y = anchor (center line).
   * align 'center'|'right'|'left'. Returns total width. Hidden (returns 0) when the player turned
   * "Show Control Hints" off (G.settings.hints === false), unless opts.force.
   */
  function hintItems(ctx, list, size) {
    ctx.font = UI.font(size);
    const items = [];
    let total = 0;
    for (const [action, label, override] of list) {
      const key = override || UI.keyLabel(action);
      const kw = UI.keycapWidth(ctx, key, size + 6);
      ctx.font = UI.font(size);
      const tw = ctx.measureText(label).width;
      items.push({ key, kw, label, tw });
      total += kw + 6 + tw;
    }
    total += Math.max(0, items.length - 1) * 28;
    return { items, total };
  }
  /** Width UI.hints would draw for list/opts (0 when hidden by the setting); draws nothing (sets ctx.font). */
  UI.hintsWidth = function (ctx, list, opts) {
    const o = opts || {};
    if (!o.force && G.settings && G.settings.hints === false) return 0;
    return hintItems(ctx, list, o.size || 17).total;
  };
  UI.hints = function (ctx, list, x, y, align, opts) {
    const o = opts || {};
    if (!o.force && G.settings && G.settings.hints === false) return 0;
    const size = o.size || 17;
    const { items, total } = hintItems(ctx, list, size);
    let cx = align === 'center' ? x - total / 2 : align === 'right' ? x - total : x;
    const pa = ctx.globalAlpha;
    ctx.globalAlpha = pa * (o.alpha === undefined ? 0.8 : o.alpha);
    for (const it of items) {
      UI.keycap(ctx, it.key, cx + it.kw / 2, y, size + 6, {});
      cx += it.kw + 6;
      ctx.font = UI.font(size);
      ctx.fillStyle = C.creamDim;
      ctx.textAlign = 'left';
      ctx.textBaseline = 'middle';
      ctx.fillText(it.label, cx, y + 1);
      cx += it.tw + 28;
    }
    ctx.globalAlpha = pa;
    return total;
  };

  /** Selection pips: small blue flames left and right of a centered item. */
  UI.pips = function (ctx, cx, cy, halfW, t, alpha) {
    const pa = ctx.globalAlpha;
    ctx.globalAlpha = pa * (alpha === undefined ? 1 : alpha);
    const bob = Math.sin(t * 3) * 1.5;
    UI.flame(ctx, cx - halfW - 18 + bob, cy + 7, 15, 'blue', t, 1);
    UI.flame(ctx, cx + halfW + 18 - bob, cy + 7, 15, 'blue', t, 2);
    ctx.globalAlpha = pa;
  };
  /**
   * Vertical centered menu. items: [{label, disabled?, value?}]; sel = index; y = first item center.
   * opts: {size, gap, t, alpha, color}. Returns nothing.
   */
  UI.drawMenu = function (ctx, items, sel, cx, y, opts) {
    const o = opts || {};
    const size = o.size || 28;
    const gap = o.gap || size * 1.7;
    const t = o.t === undefined ? UI.t : o.t;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    for (let i = 0; i < items.length; i++) {
      const it = items[i];
      const iy = y + i * gap;
      const on = i === sel;
      ctx.font = UI.font(size);
      const label = String(it.label);
      if (on && !it.disabled) {
        const tw = ctx.measureText(label).width;
        // soft band
        const pa = ctx.globalAlpha;
        ctx.globalAlpha = pa * 0.5;
        const g = ctx.createLinearGradient(cx - tw / 2 - 90, 0, cx + tw / 2 + 90, 0);
        g.addColorStop(0, 'rgba(120,180,255,0)'); g.addColorStop(0.5, 'rgba(120,180,255,0.13)'); g.addColorStop(1, 'rgba(120,180,255,0)');
        ctx.fillStyle = g;
        ctx.fillRect(cx - tw / 2 - 90, iy - size * 0.72, tw + 180, size * 1.44);
        ctx.globalAlpha = pa;
        UI.pips(ctx, cx, iy, tw / 2, t);
      }
      ctx.fillStyle = it.disabled ? C.faint : on ? C.creamHi : C.creamDim;
      ctx.fillText(label, cx, iy + 1);
    }
  };

  // ------------------------------------------------------------------ UI particles (pooled)
  /** Small pooled particle system for UI effects (screen space). */
  class Particles {
    constructor(max) { this.max = max || 120; this.list = []; this.free = []; }
    spawn(p) {
      if (this.list.length >= this.max) return null;
      const o = this.free.pop() || {};
      o.x = p.x; o.y = p.y; o.vx = p.vx || 0; o.vy = p.vy || 0; o.life = p.life || 1; o.age = 0;
      o.size = p.size || 2; o.size2 = p.size2 === undefined ? o.size : p.size2; o.color = p.color || C.cream;
      o.alpha = p.alpha === undefined ? 1 : p.alpha; o.gravity = p.gravity || 0; o.drag = p.drag || 0;
      o.glow = !!p.glow; o.wobble = p.wobble || 0; o.seed = Math.random() * 10; o.kind = p.kind || 'dot';
      o.rot = p.rot || 0; o.vrot = p.vrot || 0;
      this.list.push(o);
      return o;
    }
    update(dt) {
      const L = this.list;
      for (let i = L.length - 1; i >= 0; i--) {
        const p = L[i];
        p.age += dt;
        if (p.age >= p.life) { L[i] = L[L.length - 1]; L.pop(); this.free.push(p); continue; }
        p.vy += p.gravity * dt;
        if (p.drag) { const k = Math.max(0, 1 - p.drag * dt); p.vx *= k; p.vy *= k; }
        p.x += (p.vx + (p.wobble ? Math.sin(p.age * 2.3 + p.seed) * p.wobble : 0)) * dt;
        p.y += p.vy * dt;
        p.rot += p.vrot * dt;
      }
    }
    draw(ctx, alphaMul) {
      const am = alphaMul === undefined ? 1 : alphaMul;
      const pa = ctx.globalAlpha;
      for (const p of this.list) {
        const k = p.age / p.life;
        const fade = k < 0.15 ? k / 0.15 : 1 - (k - 0.15) / 0.85;
        const a = Math.max(0, fade) * p.alpha * am;
        if (a <= 0.004) continue;
        const s = p.size + (p.size2 - p.size) * k;
        if (p.glow) { ctx.globalAlpha = pa; UI.glow(ctx, p.x, p.y, s * 4, p.color, a * 0.8); }
        ctx.globalAlpha = pa * a;
        ctx.fillStyle = p.color;
        if (p.kind === 'flake') {
          ctx.save();
          ctx.translate(p.x, p.y); ctx.rotate(p.rot);
          ctx.fillRect(-s, -s * 0.45, s * 2, s * 0.9);
          ctx.restore();
        } else {
          ctx.beginPath();
          ctx.arc(p.x, p.y, Math.max(0.3, s), 0, TAU);
          ctx.fill();
        }
      }
      ctx.globalAlpha = pa;
    }
    clear() { while (this.list.length) this.free.push(this.list.pop()); }
  }
  UI.Particles = Particles;

  // ------------------------------------------------------------------ input routing helpers
  let stepCount = 0;
  UI.t = 0;
  const NAV = ['up', 'down', 'left', 'right'];
  const navState = {};
  for (const d of NAV) navState[d] = { t: 0, fire: false, next: 0 };
  const REPEAT_DELAY = 0.36, REPEAT_RATE = 0.075;
  function updateNav(dt) {
    const inp = G.input;
    for (const d of NAV) {
      const s = navState[d];
      s.fire = false;
      if (!inp || !inp.down(d)) { s.t = 0; continue; }
      if (inp.pressed(d)) { s.t = 0; s.next = REPEAT_DELAY; s.fire = true; continue; }
      s.t += dt;
      if (s.t >= s.next) { s.fire = true; s.next += REPEAT_RATE; }
    }
    // a tap shorter than a step (latched) is down only via pressed
    for (const d of NAV) if (inp && inp.pressed(d) && !navState[d].fire) { navState[d].fire = true; navState[d].t = 0; navState[d].next = REPEAT_DELAY; }
  }
  /** Direction pressed this step (with auto-repeat while held); consumes it. */
  UI.nav = function (dir) {
    const s = navState[dir];
    if (!s || !s.fire) return false;
    s.fire = false;
    if (G.input) G.input.consume(dir);
    return true;
  };
  UI.navX = () => (UI.nav('left') ? -1 : 0) + (UI.nav('right') ? 1 : 0);
  UI.navY = () => (UI.nav('up') ? -1 : 0) + (UI.nav('down') ? 1 : 0);
  /** True if the action was pressed this step; consumes it. */
  UI.pressed = function (action) {
    const inp = G.input;
    if (!inp || !inp.pressed(action)) return false;
    inp.consume(action);
    return true;
  };
  /** True if any of the actions was pressed; consumes all of them (Z = jump + confirm, etc.). */
  UI.pressedAny = function (actions) {
    let any = false;
    for (const a of actions) if (UI.pressed(a)) any = true;
    return any;
  };
  /**
   * A deliberate "back" press: 'cancel' that was not the same key as one of `shared` (default ['attack']).
   * Keyboard X is both cancel and attack, and pad B is both cancel and spell, so a screen that treats attack
   * (or spell) as a positive action must not also read that press as Back. Consumes 'cancel' only.
   */
  UI.pressedBack = function (shared) {
    const inp = G.input;
    if (!inp || !inp.pressed('cancel')) return false;
    inp.consume('cancel');
    for (const a of (shared || ['attack'])) if (inp.pressed(a)) return false;
    return true;
  };
  /**
   * A "close this menu" press: 'cancel', or one of `actions` (pause / inventory / map...) that was NOT also a
   * confirm press. Enter / pad A are lockout confirm inputs, but they can also be bound to Pause or Inventory;
   * confirm must win in menus or a pad player could never press A on "Controls" (lockout protection).
   * Consumes the close actions (never 'confirm', so a following UI.pressedAny(UI.CONFIRM) still sees it).
   */
  UI.pressedClose = function (actions) {
    const inp = G.input;
    if (!inp) return false;
    const conf = !!inp.pressed('confirm');
    let close = false;
    for (const a of actions) {
      if (a === 'confirm' || !inp.pressed(a)) continue;
      if (a === 'cancel' || !conf) close = true;
      inp.consume(a);
    }
    return close;
  };
  UI.CONFIRM = ['confirm'];
  UI.ADVANCE = ['confirm', 'attack', 'jump'];
  UI.BACK = ['cancel'];
  let pointerTap = false;
  UI.pointerTapped = function () { const v = pointerTap; pointerTap = false; return v; };

  // ------------------------------------------------------------------ screen stack
  const stack = [];
  const layers = [];
  UI.stack = stack;

  /**
   * Open a screen. screen: {name, blocking=true, input=true, fadeIn=0.22, fadeOut=0.18, hideHud,
   *   open(), update(dt, active), draw(ctx, alpha), onClose()}. Returns the screen.
   * `active` is true only for the topmost input screen, from the step after it was opened.
   */
  UI.push = function (screen) {
    const s = screen;
    s.name = s.name || 'screen';
    if (s.blocking === undefined) s.blocking = true;
    if (s.input === undefined) s.input = true;
    if (s.fadeIn === undefined) s.fadeIn = 0.22;
    if (s.fadeOut === undefined) s.fadeOut = 0.18;
    s.alpha = s.fadeIn > 0 ? 0 : 1;
    s.state = s.fadeIn > 0 ? 'in' : 'open';
    s.t = 0;
    s.born = stepCount;
    s._cbs = [];
    s._drawErrors = 0;
    stack.push(s);
    if (typeof s.open === 'function') safe(() => s.open(), 'UI.open ' + s.name);
    return s;
  };
  /** Close a screen with its fade-out; cb (and screen.onClose) run once it is removed. */
  UI.close = function (s, cb) {
    if (!s || s.state === 'dead') return;
    if (cb) s._cbs.push(cb);
    if (s.state === 'out') return;
    s.state = 'out';
    if (!(s.fadeOut > 0)) finalize(s);
  };
  function finalize(s) {
    const i = stack.indexOf(s);
    if (i >= 0) stack.splice(i, 1);
    if (s.state === 'dead') return;
    s.state = 'dead';
    s.alpha = 0;
    if (typeof s.onClose === 'function') safe(() => s.onClose(), 'UI.onClose ' + s.name);
    for (const cb of s._cbs) safe(cb, 'UI.close callback ' + s.name);
    s._cbs.length = 0;
    if (!UI.isBlocking() && G.input) G.input.consumeAll();
  }
  /** Remove a screen and every screen above it immediately, without fades or callbacks (e.g. the title when the
   *  engine starts play by itself). */
  UI.dismiss = function (s) {
    const i = stack.indexOf(s);
    if (i < 0) return;
    for (const x of stack.splice(i)) x.state = 'dead';
  };
  /** Remove every screen immediately (no callbacks unless runCallbacks). */
  UI.closeAll = function (runCallbacks) {
    const list = stack.slice();
    stack.length = 0;
    for (const s of list) {
      if (runCallbacks) { s.state = 'out'; stack.push(s); finalize(s); } else s.state = 'dead';
    }
  };
  UI.top = () => (stack.length ? stack[stack.length - 1] : null);
  UI.find = (name) => { for (let i = stack.length - 1; i >= 0; i--) if (stack[i].name === name && stack[i].state !== 'dead') return stack[i]; return null; };
  UI.isOpen = (name) => !!UI.find(name);
  UI.screenNames = () => stack.map((s) => s.name);
  UI.isBlocking = function () {
    for (let i = 0; i < stack.length; i++) if (stack[i].blocking && stack[i].state !== 'dead') return true;
    return false;
  };
  function activeScreen() {
    for (let i = stack.length - 1; i >= 0; i--) {
      const s = stack[i];
      if (s.state === 'out' || s.state === 'dead' || !s.input) continue;
      return stepCount > s.born ? s : null;
    }
    return null;
  }
  UI.isActive = (s) => activeScreen() === s;

  /** Register an always-on layer (HUD, prompts, cards, toasts): {name, z, update(dt), draw(ctx)}. */
  UI.addLayer = function (layer) {
    layers.push(layer);
    layers.sort((a, b) => (a.z || 0) - (b.z || 0));
    return layer;
  };
  UI.layers = layers;

  // ------------------------------------------------------------------ HUD visibility (shared by hud.js & cards)
  const hudHide = new Set();
  /** Hide the HUD for a reason (cutscenes); stackable by reason. */
  UI.hideHud = (reason) => { hudHide.add(reason || 'default'); };
  UI.showHud = (reason) => { hudHide.delete(reason || 'default'); };
  /** Whether the HUD should currently be shown (play modes, no hiding screen/reason). */
  UI.hudWanted = function () {
    const g = G.game;
    if (!g || !g.progress) return false;
    if (g.mode !== 'play' && g.mode !== 'transition' && g.mode !== 'dead') return false;
    if (hudHide.size) return false;
    for (const s of stack) if (s.hideHud && s.state !== 'dead') return false;
    return true;
  };

  /** How much the open hideHud screens cover the playfield (max alpha of those screens, 0..1). Cutscene
   *  hideHud reasons do not count — only screens on the stack (inventory, map, shop, dialogue, ...). */
  UI.hudCover = function () {
    let c = 0;
    for (const s of stack) if (s.hideHud && s.state !== 'dead') c = Math.max(c, s.alpha || 0);
    return c;
  };

  /** How much any open blocking screen covers the playfield (max alpha of non-dead blocking screens, 0..1):
   *  hideHud screens plus Pause, Options, Controls, lore, item cards and confirms. Area/boss title cards hide
   *  and wait under these. */
  UI.blockCover = function () {
    let c = 0;
    for (const s of stack) if ((s.blocking || s.hideHud) && s.state !== 'dead') c = Math.max(c, s.alpha || 0);
    return c;
  };

  // ------------------------------------------------------------------ engine hooks
  UI.update = function (dt) {
    stepCount++;
    UI.step = stepCount;
    UI.t += dt;
    updateNav(dt);
    const active = activeScreen();
    const list = stack.slice();
    for (const s of list) {
      if (s.state === 'dead') continue;
      if (s.state === 'in') { s.alpha = Math.min(1, s.alpha + dt / s.fadeIn); if (s.alpha >= 1) s.state = 'open'; }
      else if (s.state === 'out') s.alpha = Math.max(0, s.alpha - dt / s.fadeOut);
      s.t += dt;
      if (typeof s.update === 'function') {
        try { s.update(dt, s === active); } catch (err) {
          G.reportError(err, 'UI.update ' + s.name);
          UI.close(s);
          s.alpha = Math.min(s.alpha, 0.01);
        }
      }
    }
    for (const s of stack.slice()) if (s.state === 'out' && s.alpha <= 0) finalize(s);
    for (const l of layers) if (typeof l.update === 'function') safe(() => l.update(dt), 'UI.layer ' + l.name);
  };

  UI.draw = function (ctx) {
    ctx.save();
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.globalAlpha = 1;
    ctx.globalCompositeOperation = 'source-over';
    for (const l of layers) {
      if (typeof l.draw !== 'function') continue;
      ctx.save();
      try { l.draw(ctx); } catch (err) { G.reportError(err, 'UI.layer.draw ' + l.name); }
      ctx.restore();
    }
    for (const s of stack.slice()) {
      if (s.state === 'dead' || !(s.alpha > 0) || typeof s.draw !== 'function') continue;
      ctx.save();
      ctx.globalAlpha = s.alpha;
      ctx.globalCompositeOperation = 'source-over';
      try { s.draw(ctx, s.alpha); s._drawErrors = 0; } catch (err) {
        G.reportError(err, 'UI.draw ' + s.name);
        if (++s._drawErrors >= 3) UI.close(s);
      }
      ctx.restore();
    }
    ctx.restore();
  };

  /** Called once at boot by main.js. */
  UI.init = function (canvas) {
    if (canvas && canvas.addEventListener) canvas.addEventListener('pointerdown', () => { pointerTap = true; });
    for (const f of UI._inits) safe(() => f(canvas), 'UI.init');
  };
  UI._inits = [];

  // ------------------------------------------------------------------ generic confirm dialog
  /**
   * Modal Yes/No question. opts: {text, yes, no, onYes, onNo, defaultNo=true, name}.
   * Cancel = No. Returns the screen.
   */
  UI.confirm = function (opts) {
    const o = opts || {};
    const s = {
      name: o.name || 'confirm',
      sel: o.defaultNo === false ? 0 : 1,
      fadeIn: 0.16, fadeOut: 0.14,
      update(dt, active) {
        if (!active) return;
        const dx = UI.navX() + UI.navY();
        if (dx) { this.sel = this.sel ? 0 : 1; UI.sfx('menu_move'); }
        if (UI.pressedAny(UI.CONFIRM)) {
          UI.sfx(this.sel === 0 ? 'menu_select' : 'menu_back');
          const yes = this.sel === 0;
          UI.close(this, () => { if (yes && o.onYes) o.onYes(); if (!yes && o.onNo) o.onNo(); });
        } else if (UI.pressedAny(UI.BACK)) {
          UI.sfx('menu_back');
          UI.close(this, () => { if (o.onNo) o.onNo(); });
        }
      },
      draw(ctx) {
        UI.veil(ctx, 0.55);
        const pw = 640;
        ctx.font = UI.font(24);
        const lines = UI.wrapBalanced(ctx, o.text || '', pw - 100);
        const ph = 150 + lines.length * 34;
        const px = (W - pw) / 2, py = (H - ph) / 2;
        UI.panel(ctx, px, py, pw, ph);
        ctx.fillStyle = C.cream;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'alphabetic';
        for (let i = 0; i < lines.length; i++) ctx.fillText(lines[i], W / 2, py + 62 + i * 34);
        UI.flourish(ctx, W / 2, py + 62 + lines.length * 34 - 6, 120, { alpha: 0.5 });
        const by = py + ph - 46;
        const labels = [o.yes || UI.text('ui.yes', 'Yes'), o.no || UI.text('ui.no', 'No')];
        for (let i = 0; i < 2; i++) {
          const bx = W / 2 + (i === 0 ? -110 : 110);
          ctx.font = UI.font(26);
          ctx.textAlign = 'center';
          ctx.textBaseline = 'middle';
          ctx.fillStyle = i === this.sel ? C.creamHi : C.creamDim;
          ctx.fillText(labels[i], bx, by);
          if (i === this.sel) UI.pips(ctx, bx, by, ctx.measureText(labels[i]).width / 2, UI.t);
        }
      },
    };
    return UI.push(s);
  };

  // ------------------------------------------------------------------ misc helpers
  UI.ease = {
    outCubic: (k) => 1 - Math.pow(1 - k, 3),
    inOutSine: (k) => -(Math.cos(Math.PI * k) - 1) / 2,
    outBack: (k) => { const c1 = 1.70158, c3 = c1 + 1; return 1 + c3 * Math.pow(k - 1, 3) + c1 * Math.pow(k - 1, 2); },
  };
  UI.clamp01 = (v) => (v < 0 ? 0 : v > 1 ? 1 : v);
  /** Fade envelope: 0→1 over fin, hold, 1→0 over fout (t in seconds, total duration dur). */
  UI.envelope = function (t, dur, fin, fout) {
    if (t <= 0 || t >= dur) return 0;
    if (t < fin) return UI.ease.inOutSine(t / fin);
    if (t > dur - fout) return UI.ease.inOutSine((dur - t) / fout);
    return 1;
  };
  UI.progress = () => (G.game && G.game.progress) || null;
  /** Text block helper: draws wrapped plain text; returns the number of lines. */
  UI.paragraph = function (ctx, text, x, y, maxW, lineH, align) {
    const lines = UI.wrap(ctx, text, maxW);
    ctx.textAlign = align || 'left';
    ctx.textBaseline = 'alphabetic';
    for (let i = 0; i < lines.length; i++) ctx.fillText(lines[i], x, y + i * lineH);
    return lines.length;
  };
})();
