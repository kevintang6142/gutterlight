// src/art/background.js — parallax backgrounds (Art.BG + silhouette toolkit Art.BG.kit),
// foreground framing silhouettes (Art.FG) and screen-space atmosphere (Art.Atmos: weather
// particles, rain splashes, fog bands, vignette & colour grade).
(function () {
  'use strict';
  const G = globalThis.G;
  const Art = G.Art;
  const U = Art.util;
  const { clamp, lerp, smooth, hashInt, h01, noise1, fbm1p, mix, rgba, shade, makeCanvas, freeCanvas, mod } = U;
  const T = Art.TILE, VW = Art.VIEW_W, VH = Art.VIEW_H;
  const TAU = Math.PI * 2;

  // =============================================================================================
  // Silhouette toolkit. All helpers draw in layer-canvas coordinates; `w` is the horizontal tiling
  // period — elements crossing the edges are drawn twice so layers tile seamlessly.
  const K = {};
  K.wrap = function (w, x, half, fn) {
    fn(x);
    if (x - half < 0) fn(x + w);
    if (x + half > w) fn(x - w);
  };
  K.grad = function (ctx, x0, y0, x1, y1, stops) {
    const g = ctx.createLinearGradient(x0, y0, x1, y1);
    for (const [o, c] of stops) g.addColorStop(clamp(o, 0, 1), c);
    return g;
  };
  /** Periodic noise ridge filled down to the bottom. o: {base, amp, scale, oct, color, seed, sharp} */
  K.ridge = function (ctx, w, h, o) {
    const scale = o.scale || 260, per = Math.max(1, Math.round(w / scale)), s = w / per;
    ctx.fillStyle = o.color || '#000';
    ctx.beginPath();
    ctx.moveTo(0, h + 2);
    const step = o.step || 6;
    for (let x = 0; x <= w + 0.1; x += step) {
      let n = fbm1p(x / s, per, o.seed || 1, o.oct || 4);
      if (o.sharp) n = 1 - Math.abs(n) * 2;
      ctx.lineTo(x, (o.base || h * 0.7) - n * (o.amp || 60));
    }
    ctx.lineTo(w, h + 2);
    ctx.closePath();
    ctx.fill();
  };
  K.ridgeY = function (w, x, o) { // y of a ridge at x (for placing things on it)
    const scale = o.scale || 260, per = Math.max(1, Math.round(w / scale)), s = w / per;
    let n = fbm1p(mod(x, w) / s, per, o.seed || 1, o.oct || 4);
    if (o.sharp) n = 1 - Math.abs(n) * 2;
    return (o.base || 0) - n * (o.amp || 60);
  };
  K.rect = (ctx, x, y, w, h, c) => { ctx.fillStyle = c; ctx.fillRect(x, y, w, h); };
  /** Classical column. o: {color, lite, broken (0..1 fraction missing), capital, base} */
  K.pillar = function (ctx, x, yb, pw, ph, o) {
    o = o || {};
    const c = o.color || '#222', top = yb - ph;
    ctx.fillStyle = c;
    if (o.base !== false) ctx.fillRect(x - pw * 0.7, yb - pw * 0.45, pw * 1.4, pw * 0.45);
    if (o.broken) {
      const bh = ph * (1 - o.broken), by = yb - bh;
      ctx.beginPath();
      ctx.moveTo(x - pw / 2, yb); ctx.lineTo(x - pw / 2, by + pw * 0.2);
      ctx.lineTo(x - pw * 0.15, by - pw * 0.25); ctx.lineTo(x + pw * 0.05, by + pw * 0.1); ctx.lineTo(x + pw * 0.3, by - pw * 0.4);
      ctx.lineTo(x + pw / 2, by); ctx.lineTo(x + pw / 2, yb); ctx.closePath(); ctx.fill();
    } else {
      ctx.fillRect(x - pw / 2, top, pw, ph);
      if (o.capital !== false) { ctx.fillRect(x - pw * 0.75, top - pw * 0.25, pw * 1.5, pw * 0.4); ctx.fillRect(x - pw * 0.6, top + pw * 0.15, pw * 1.2, pw * 0.2); }
    }
    if (o.lite) { ctx.fillStyle = o.lite; ctx.fillRect(x - pw / 2, o.broken ? yb - ph * (1 - o.broken) + pw * 0.2 : top, Math.max(1, pw * 0.12), o.broken ? ph * (1 - o.broken) : ph); }
    if (o.flutes) { ctx.fillStyle = 'rgba(0,0,0,0.25)'; for (let k = 1; k < 4; k++) ctx.fillRect(x - pw / 2 + (pw * k) / 4, o.broken ? yb - ph * (1 - o.broken) + pw : top + pw * 0.4, 1, (o.broken ? ph * (1 - o.broken) : ph) - pw); }
  };
  /** Arcade / aqueduct: row of round arches between x0..x1. o: {span, pier, h, deck, color, tiers} */
  K.arches = function (ctx, x0, x1, yb, o) {
    const span = o.span || 120, pier = o.pier || 22, hh = o.h || 200, deck = o.deck || 30;
    const tiers = o.tiers || 1;
    ctx.fillStyle = o.color || '#222';
    let y = yb;
    for (let t = 0; t < tiers; t++) {
      const th = hh / tiers * (t === 0 ? 1.15 : 0.85);
      const sp = span / (t === 0 ? 1 : 2);
      const p = new Path2D();
      p.rect(x0, y - th - deck * (t === tiers - 1 ? 1 : 0.5), x1 - x0, th + deck * (t === tiers - 1 ? 1 : 0.5));
      for (let x = x0 + pier; x + sp - pier <= x1 + 0.1; x += sp) {
        const aw = sp - pier, r = aw / 2, ah = th - r - (t === tiers - 1 ? 0 : 0);
        p.moveTo(x, y); p.lineTo(x, y - ah); p.arc(x + r, y - ah, r, Math.PI, 0); p.lineTo(x + aw, y); p.closePath();
      }
      ctx.fill(p, 'evenodd');
      y -= th + deck * 0.5;
    }
  };
  /** Gothic spire / tower. o: {color, window (color), pinnacles} */
  K.spire = function (ctx, x, yb, sw, sh, o) {
    o = o || {};
    ctx.fillStyle = o.color || '#222';
    const bodyH = sh * 0.55, top = yb - sh;
    ctx.fillRect(x - sw / 2, yb - bodyH, sw, bodyH);
    ctx.beginPath(); ctx.moveTo(x - sw / 2 - sw * 0.08, yb - bodyH); ctx.lineTo(x, top); ctx.lineTo(x + sw / 2 + sw * 0.08, yb - bodyH); ctx.closePath(); ctx.fill();
    if (o.pinnacles !== false) for (const s of [-1, 1]) {
      const px = x + s * sw * 0.5;
      ctx.beginPath(); ctx.moveTo(px - sw * 0.1, yb - bodyH + 2); ctx.lineTo(px, yb - bodyH - sw * 0.7); ctx.lineTo(px + sw * 0.1, yb - bodyH + 2); ctx.closePath(); ctx.fill();
    }
    ctx.fillRect(x - 1, top - sw * 0.25, 2, sw * 0.3);
    if (o.window) {
      ctx.fillStyle = o.window;
      const ww = sw * 0.28, wh = bodyH * 0.35, wy = yb - bodyH * 0.8;
      ctx.beginPath(); ctx.moveTo(x - ww / 2, wy + wh); ctx.lineTo(x - ww / 2, wy + ww / 2); ctx.arc(x, wy + ww / 2, ww / 2, Math.PI, 0); ctx.lineTo(x + ww / 2, wy + wh); ctx.closePath(); ctx.fill();
    }
  };
  /** Rose window with radial tracery. o: {glass, frame, petals} */
  K.roseWindow = function (ctx, x, y, r, o) {
    o = o || {};
    ctx.fillStyle = o.frame || '#111';
    ctx.beginPath(); ctx.arc(x, y, r * 1.12, 0, TAU); ctx.fill();
    const g = ctx.createRadialGradient(x, y, 0, x, y, r);
    g.addColorStop(0, o.core || '#fff6d0'); g.addColorStop(0.5, o.glass || '#e0c070'); g.addColorStop(1, o.edge || mix(o.glass || '#e0c070', '#000000', 0.4));
    ctx.fillStyle = g; ctx.beginPath(); ctx.arc(x, y, r, 0, TAU); ctx.fill();
    ctx.strokeStyle = o.frame || '#111'; ctx.lineWidth = Math.max(1.5, r * 0.07);
    const n = o.petals || 12;
    for (let i = 0; i < n; i++) {
      const a = (i / n) * TAU;
      ctx.beginPath(); ctx.moveTo(x + Math.cos(a) * r * 0.22, y + Math.sin(a) * r * 0.22); ctx.lineTo(x + Math.cos(a) * r, y + Math.sin(a) * r); ctx.stroke();
      ctx.beginPath(); ctx.arc(x + Math.cos(a + Math.PI / n) * r * 0.66, y + Math.sin(a + Math.PI / n) * r * 0.66, r * 0.2, 0, TAU); ctx.stroke();
    }
    ctx.beginPath(); ctx.arc(x, y, r * 0.22, 0, TAU); ctx.stroke();
    ctx.beginPath(); ctx.arc(x, y, r, 0, TAU); ctx.stroke();
  };
  /** Candle-stub house: melted cylinder body, drippy rim, small roof, warm windows. */
  K.house = function (ctx, x, yb, hw, hh, o) {
    o = o || {};
    const c = o.color || '#222', rng = o.rng;
    ctx.fillStyle = c;
    const top = yb - hh;
    ctx.beginPath();
    ctx.moveTo(x - hw / 2, yb);
    ctx.lineTo(x - hw / 2, top + hw * 0.12);
    // melted rim with drips
    const n = 5;
    for (let i = 0; i <= n; i++) {
      const px = x - hw / 2 + (hw * i) / n;
      const dy = (rng ? rng.range(-0.06, 0.08) : 0) * hw;
      ctx.lineTo(px, top + dy);
    }
    ctx.lineTo(x + hw / 2, yb);
    ctx.closePath(); ctx.fill();
    for (let i = 0; i < 3; i++) { // drips down the sides
      const dx = x - hw / 2 + (rng ? rng.range(0.1, 0.9) : 0.3 + i * 0.2) * hw, dl = (rng ? rng.range(0.15, 0.4) : 0.25) * hh;
      ctx.beginPath(); ctx.ellipse(dx, top + dl * 0.5, hw * 0.05, dl * 0.5, 0, 0, TAU); ctx.fill();
    }
    if (o.roof) { // conical snuffer roof
      ctx.beginPath(); ctx.moveTo(x - hw * 0.62, top + hw * 0.08); ctx.lineTo(x + (o.roofLean || 0), top - hw * 0.75); ctx.lineTo(x + hw * 0.62, top + hw * 0.08); ctx.closePath(); ctx.fill();
    }
    if (o.chimney) ctx.fillRect(x + hw * 0.18, top - hw * 0.55, hw * 0.12, hw * 0.4);
    if (o.window) {
      const ww = hw * 0.2, wh = hh * 0.2;
      const spots = o.windows || [[0, 0.45]];
      for (const [fx, fy] of spots) {
        const wx = x + fx * hw, wy = top + fy * hh;
        ctx.fillStyle = o.window;
        ctx.beginPath(); ctx.moveTo(wx - ww / 2, wy + wh / 2); ctx.lineTo(wx - ww / 2, wy - wh / 2 + ww / 2); ctx.arc(wx, wy - wh / 2 + ww / 2, ww / 2, Math.PI, 0); ctx.lineTo(wx + ww / 2, wy + wh / 2); ctx.closePath(); ctx.fill();
        ctx.fillStyle = c; ctx.fillRect(wx - 0.75, wy - wh / 2, 1.5, wh); ctx.fillRect(wx - ww / 2, wy, ww, 1.5);
        if (o.addGlow) o.addGlow(wx, wy, ww * 3.2, o.window, 0.5);
      }
    }
    if (o.door) { ctx.fillStyle = o.door; const dw = hw * 0.22, dh = hh * 0.28; ctx.beginPath(); ctx.moveTo(x - dw / 2 + hw * 0.18, yb); ctx.lineTo(x - dw / 2 + hw * 0.18, yb - dh + dw / 2); ctx.arc(x + hw * 0.18, yb - dh + dw / 2, dw / 2, Math.PI, 0); ctx.lineTo(x + dw / 2 + hw * 0.18, yb); ctx.closePath(); ctx.fill(); }
  };
  /** Brick chimney stack with flared cap. */
  K.chimney = function (ctx, x, yb, cw, ch, o) {
    o = o || {};
    ctx.fillStyle = o.color || '#222';
    const top = yb - ch;
    ctx.beginPath();
    ctx.moveTo(x - cw / 2 - cw * 0.08, yb); ctx.lineTo(x - cw / 2, top + cw * 0.3); ctx.lineTo(x - cw * 0.62, top + cw * 0.3); ctx.lineTo(x - cw * 0.62, top);
    ctx.lineTo(x + cw * 0.62, top); ctx.lineTo(x + cw * 0.62, top + cw * 0.3); ctx.lineTo(x + cw / 2, top + cw * 0.3); ctx.lineTo(x + cw / 2 + cw * 0.08, yb); ctx.closePath(); ctx.fill();
    if (o.bricks) {
      ctx.fillStyle = o.bricks;
      for (let y = top + cw * 0.5; y < yb; y += cw * 0.22) ctx.fillRect(x - cw / 2, y, cw, Math.max(1, cw * 0.025));
    }
    if (o.glow) { ctx.fillStyle = o.glow; ctx.fillRect(x - cw * 0.45, top, cw * 0.9, Math.max(1.5, cw * 0.06)); if (o.addGlow) o.addGlow(x, top, cw * 1.6, o.glow, 0.45); }
    if (o.bands) { ctx.fillStyle = o.bands; for (let y = top + ch * 0.25; y < yb; y += ch * 0.3) ctx.fillRect(x - cw * 0.55, y, cw * 1.1, cw * 0.08); }
  };
  /** Pipe along polyline points with joints. */
  K.pipe = function (ctx, pts, pw, o) {
    o = o || {};
    ctx.strokeStyle = o.color || '#222'; ctx.lineWidth = pw; ctx.lineJoin = 'round'; ctx.lineCap = 'butt';
    ctx.beginPath(); ctx.moveTo(pts[0][0], pts[0][1]); for (let i = 1; i < pts.length; i++) ctx.lineTo(pts[i][0], pts[i][1]); ctx.stroke();
    if (o.lite) { ctx.strokeStyle = o.lite; ctx.lineWidth = Math.max(1, pw * 0.14); ctx.beginPath(); ctx.moveTo(pts[0][0] - pw * 0.25, pts[0][1] - pw * 0.25); for (let i = 1; i < pts.length; i++) ctx.lineTo(pts[i][0] - pw * 0.25, pts[i][1] - pw * 0.25); ctx.stroke(); }
    ctx.fillStyle = o.color || '#222';
    for (let i = 0; i < pts.length - 1; i++) {
      const [ax, ay] = pts[i], [bx, by] = pts[i + 1];
      const len = Math.hypot(bx - ax, by - ay), n = Math.floor(len / (o.jointEvery || 90));
      for (let k = 0; k <= n; k++) {
        const t = n ? k / n : 0, jx = ax + (bx - ax) * t, jy = ay + (by - ay) * t;
        ctx.save(); ctx.translate(jx, jy); ctx.rotate(Math.atan2(by - ay, bx - ax)); ctx.fillRect(-pw * 0.18, -pw * 0.68, pw * 0.36, pw * 1.36); ctx.restore();
      }
    }
  };
  K.chain = function (ctx, x, y0, y1, o) {
    o = o || {};
    const link = o.link || 8;
    ctx.strokeStyle = o.color || '#222'; ctx.lineWidth = o.width || 2;
    for (let y = y0, i = 0; y < y1; y += link * 0.82, i++) {
      ctx.beginPath();
      if (i % 2) { ctx.moveTo(x, y); ctx.lineTo(x, y + link); } else ctx.ellipse(x, y + link / 2, link * 0.32, link / 2, 0, 0, TAU);
      ctx.stroke();
    }
  };
  /** Large vat/cauldron. */
  K.vat = function (ctx, x, yb, vw, vh, o) {
    o = o || {};
    ctx.fillStyle = o.color || '#222';
    ctx.beginPath();
    ctx.moveTo(x - vw * 0.42, yb); ctx.quadraticCurveTo(x - vw * 0.56, yb - vh * 0.5, x - vw * 0.5, yb - vh);
    ctx.lineTo(x + vw * 0.5, yb - vh); ctx.quadraticCurveTo(x + vw * 0.56, yb - vh * 0.5, x + vw * 0.42, yb); ctx.closePath(); ctx.fill();
    ctx.fillRect(x - vw * 0.56, yb - vh - vw * 0.06, vw * 1.12, vw * 0.08);
    for (const s of [-0.36, 0.36]) ctx.fillRect(x + s * vw - vw * 0.04, yb - vh * 0.08, vw * 0.08, vh * 0.08 + 4);
    if (o.bands) { ctx.fillStyle = o.bands; ctx.fillRect(x - vw * 0.53, yb - vh * 0.7, vw * 1.06, vw * 0.04); ctx.fillRect(x - vw * 0.5, yb - vh * 0.35, vw, vw * 0.04); }
    if (o.glow) {
      ctx.fillStyle = o.glow; ctx.fillRect(x - vw * 0.46, yb - vh - vw * 0.02, vw * 0.92, Math.max(2, vw * 0.035));
      if (o.addGlow) o.addGlow(x, yb - vh, vw * 0.9, o.glow, 0.55);
    }
  };
  /** Tall wick-reed: thin stalk with a dark wick tip, optional ember. */
  K.reed = function (ctx, x, yb, rh, o) {
    o = o || {};
    const lean = o.lean || 0, wd = o.width || 3;
    ctx.strokeStyle = o.color || '#222'; ctx.lineWidth = wd; ctx.lineCap = 'round';
    ctx.beginPath(); ctx.moveTo(x, yb); ctx.quadraticCurveTo(x + lean * 0.3, yb - rh * 0.5, x + lean, yb - rh); ctx.stroke();
    ctx.fillStyle = o.color || '#222';
    ctx.beginPath(); ctx.ellipse(x + lean, yb - rh - wd * 2.5, wd * 1.1, wd * 3.2, lean * 0.004, 0, TAU); ctx.fill();
    if (o.leaves) for (let k = 0; k < o.leaves; k++) {
      const t = 0.25 + k * 0.18, lx = x + lean * t * t, ly = yb - rh * t, d = k % 2 ? 1 : -1;
      ctx.beginPath(); ctx.moveTo(lx, ly); ctx.quadraticCurveTo(lx + d * rh * 0.08, ly - rh * 0.04, lx + d * rh * 0.14, ly + rh * 0.03); ctx.quadraticCurveTo(lx + d * rh * 0.06, ly + rh * 0.01, lx, ly); ctx.fill();
    }
    if (o.ember) { ctx.fillStyle = o.ember; ctx.beginPath(); ctx.arc(x + lean, yb - rh - wd * 5.2, wd * 0.7, 0, TAU); ctx.fill(); if (o.addGlow) o.addGlow(x + lean, yb - rh - wd * 5, wd * 6, o.ember, 0.5); }
  };
  /** Giant wax flower on a stem. o: {petal, stem, heart, open} */
  K.flower = function (ctx, x, yb, fh, o) {
    o = o || {};
    const lean = o.lean || 0, r = o.r || fh * 0.16;
    const fx = x + lean, fy = yb - fh;
    ctx.strokeStyle = o.stem || '#222'; ctx.lineWidth = Math.max(2, r * 0.18); ctx.lineCap = 'round';
    ctx.beginPath(); ctx.moveTo(x, yb); ctx.bezierCurveTo(x, yb - fh * 0.4, fx - lean * 0.6, fy + fh * 0.3, fx, fy + r * 0.3); ctx.stroke();
    if (o.leaf !== false) { // leaves on the stem
      ctx.fillStyle = o.stem || '#222';
      for (const [t, d] of [[0.3, -1], [0.55, 1]]) {
        const lx = x + lean * t * 0.5, ly = yb - fh * t;
        ctx.beginPath(); ctx.moveTo(lx, ly); ctx.quadraticCurveTo(lx + d * r * 1.4, ly - r * 1.0, lx + d * r * 2.2, ly - r * 0.2); ctx.quadraticCurveTo(lx + d * r, ly + r * 0.1, lx, ly); ctx.fill();
      }
    }
    const n = o.petals || 6, open = o.open === undefined ? 0.7 : o.open;
    ctx.fillStyle = o.petal || '#ddd';
    for (let i = 0; i < n; i++) {
      const a = -Math.PI / 2 + (i - (n - 1) / 2) * (0.38 + open * 0.3);
      ctx.save(); ctx.translate(fx, fy); ctx.rotate(a + Math.PI / 2);
      ctx.beginPath(); ctx.moveTo(0, 0); ctx.bezierCurveTo(-r * 0.6, -r * 0.4, -r * 0.55, -r * 1.3, 0, -r * 1.55); ctx.bezierCurveTo(r * 0.55, -r * 1.3, r * 0.6, -r * 0.4, 0, 0); ctx.fill();
      ctx.restore();
    }
    if (o.heart) { ctx.fillStyle = o.heart; ctx.beginPath(); ctx.arc(fx, fy - r * 0.15, r * 0.32, 0, TAU); ctx.fill(); if (o.addGlow) o.addGlow(fx, fy - r * 0.2, r * 3.5, o.heart, 0.55); }
  };
  K.frond = function (ctx, x, yb, len, ang, o) {
    o = o || {};
    ctx.fillStyle = o.color || '#222';
    ctx.save(); ctx.translate(x, yb); ctx.rotate(ang);
    const wdt = len * (o.width || 0.12);
    ctx.beginPath(); ctx.moveTo(0, 0);
    ctx.bezierCurveTo(wdt, -len * 0.3, wdt * 1.2, -len * 0.7, len * (o.curl || 0.15), -len);
    ctx.bezierCurveTo(-wdt * 0.2, -len * 0.7, -wdt * 0.6, -len * 0.3, 0, 0);
    ctx.fill();
    if (o.ribs) { ctx.strokeStyle = o.ribs; ctx.lineWidth = 1; for (let k = 1; k < 7; k++) { const t = k / 7; ctx.beginPath(); ctx.moveTo(len * 0.02 * t, -len * t); ctx.lineTo(wdt * 0.9, -len * t + wdt * 0.6); ctx.stroke(); } }
    ctx.restore();
  };
  K.cocoon = function (ctx, x, yt, len, o) {
    o = o || {};
    ctx.strokeStyle = o.silk || '#555'; ctx.lineWidth = 1;
    ctx.beginPath(); ctx.moveTo(x, yt); ctx.lineTo(x, yt + len * 0.35); ctx.stroke();
    ctx.fillStyle = o.color || '#333';
    const cy = yt + len * 0.35 + len * 0.32, rw = len * 0.16, rh = len * 0.32;
    ctx.beginPath(); ctx.ellipse(x, cy, rw, rh, 0, 0, TAU); ctx.fill();
    if (o.wraps) { ctx.strokeStyle = o.wraps; ctx.lineWidth = 1; for (let k = -2; k <= 2; k++) { ctx.beginPath(); ctx.ellipse(x, cy + k * rh * 0.32, rw * 0.95, rh * 0.12, 0.25, 0, Math.PI); ctx.stroke(); } }
    if (o.glow) { ctx.fillStyle = o.glow; ctx.globalAlpha = 0.6; ctx.beginPath(); ctx.ellipse(x, cy + rh * 0.1, rw * 0.45, rh * 0.5, 0, 0, TAU); ctx.fill(); ctx.globalAlpha = 1; if (o.addGlow) o.addGlow(x, cy, rh * 2.2, o.glow, 0.4); }
  };
  K.iceSpire = function (ctx, x, yb, sw, sh, o) {
    o = o || {};
    const lean = o.lean || 0;
    ctx.fillStyle = o.color || '#888';
    ctx.beginPath(); ctx.moveTo(x - sw / 2, yb); ctx.lineTo(x - sw * 0.2, yb - sh * 0.55); ctx.lineTo(x + lean, yb - sh); ctx.lineTo(x + sw * 0.25, yb - sh * 0.45); ctx.lineTo(x + sw / 2, yb); ctx.closePath(); ctx.fill();
    if (o.hi) { ctx.fillStyle = o.hi; ctx.beginPath(); ctx.moveTo(x - sw * 0.2, yb - sh * 0.55); ctx.lineTo(x + lean, yb - sh); ctx.lineTo(x - sw * 0.02, yb - sh * 0.3); ctx.lineTo(x - sw * 0.3, yb); ctx.lineTo(x - sw * 0.45, yb); ctx.closePath(); ctx.fill(); }
  };
  /** Robed waxen statue (candle-folk) with optional raised arm/staff. */
  K.statue = function (ctx, x, yb, sh, o) {
    o = o || {};
    const c = o.color || '#222', wdt = sh * 0.34;
    ctx.fillStyle = c;
    if (o.plinth !== false) ctx.fillRect(x - wdt * 0.75, yb - sh * 0.12, wdt * 1.5, sh * 0.12);
    const by = yb - sh * 0.12;
    ctx.beginPath(); // robe
    ctx.moveTo(x - wdt * 0.62, by); ctx.quadraticCurveTo(x - wdt * 0.55, by - sh * 0.45, x - wdt * 0.38, by - sh * 0.62);
    ctx.quadraticCurveTo(x, by - sh * 0.7, x + wdt * 0.38, by - sh * 0.62); ctx.quadraticCurveTo(x + wdt * 0.55, by - sh * 0.45, x + wdt * 0.62, by); ctx.closePath(); ctx.fill();
    ctx.beginPath(); ctx.ellipse(x, by - sh * 0.72, wdt * 0.3, sh * 0.13, 0, 0, TAU); ctx.fill(); // head (candle top)
    ctx.fillRect(x - 1, by - sh * 0.88, 2, sh * 0.06); // wick
    if (o.staff) { ctx.fillRect(x + wdt * 0.48, by - sh * 0.95, Math.max(2, sh * 0.025), sh * 0.95); ctx.beginPath(); ctx.arc(x + wdt * 0.49, by - sh * 0.97, sh * 0.05, 0, TAU); ctx.fill(); }
    if (o.eyes) { ctx.fillStyle = o.eyes; ctx.fillRect(x - wdt * 0.13, by - sh * 0.75, Math.max(1, sh * 0.02), sh * 0.05); ctx.fillRect(x + wdt * 0.08, by - sh * 0.75, Math.max(1, sh * 0.02), sh * 0.05); }
  };
  K.cageBars = function (ctx, cx, yTop, yBot, o) {
    o = o || {};
    const n = o.n || 9, spread = o.spread || 400, topSpread = o.topSpread || spread * 0.25;
    ctx.strokeStyle = o.color || '#c8a040'; ctx.lineWidth = o.width || 6; ctx.lineCap = 'round';
    for (let i = 0; i < n; i++) {
      const t = n === 1 ? 0.5 : i / (n - 1), xb = cx + (t - 0.5) * spread, xt = cx + (t - 0.5) * topSpread;
      ctx.beginPath(); ctx.moveTo(xt, yTop); ctx.quadraticCurveTo(lerp(xt, xb, 0.9), lerp(yTop, yBot, 0.45), xb, yBot); ctx.stroke();
    }
    if (o.rings) for (let k = 1; k <= o.rings; k++) {
      const t = k / (o.rings + 1), y = lerp(yTop, yBot, t), sp = lerp(topSpread, spread, 1 - (1 - t) * (1 - t));
      ctx.lineWidth = (o.width || 6) * 0.7;
      ctx.beginPath(); ctx.ellipse(cx, y, sp / 2, sp * 0.06, 0, 0, TAU); ctx.stroke();
    }
  };
  K.crystal = function (ctx, x, yb, cw, chh, o) {
    o = o || {};
    const lean = o.lean || 0;
    ctx.fillStyle = o.color || '#888';
    ctx.beginPath(); ctx.moveTo(x - cw / 2, yb); ctx.lineTo(x - cw * 0.45, yb - chh * 0.7); ctx.lineTo(x + lean, yb - chh); ctx.lineTo(x + cw * 0.45, yb - chh * 0.72); ctx.lineTo(x + cw / 2, yb); ctx.closePath(); ctx.fill();
    if (o.hi) { ctx.fillStyle = o.hi; ctx.beginPath(); ctx.moveTo(x - cw * 0.05, yb); ctx.lineTo(x - cw * 0.1, yb - chh * 0.72); ctx.lineTo(x + lean, yb - chh); ctx.lineTo(x + cw * 0.45, yb - chh * 0.72); ctx.lineTo(x + cw / 2, yb); ctx.closePath(); ctx.fill(); }
  };
  /** Hanging stalactites along the top edge (y = yTop): organic curved spikes, a few long ones. */
  K.stalactites = function (ctx, w, yTop, o) {
    o = o || {};
    const rng = o.rng || new U.Rng(7);
    ctx.fillStyle = o.color || '#222';
    const band = o.band === undefined ? 10 : o.band;
    ctx.fillRect(0, yTop - 4, w, band + 4);
    let x = -rng.range(0, 20);
    while (x < w + 20) {
      const sw = rng.range(o.minW || 18, o.maxW || 60);
      let sl = rng.range(o.minL || 10, o.maxL || 90);
      if (rng.chance(0.14)) sl *= 1.8;
      const tipX = x + sw * rng.range(0.35, 0.65), lean = rng.range(-0.15, 0.15) * sw;
      K.wrap(w, x + sw / 2, sw, (cx) => {
        const dx = cx - (x + sw / 2);
        ctx.beginPath();
        ctx.moveTo(x + dx - 2, yTop + band - 1);
        ctx.quadraticCurveTo(x + dx + sw * 0.2, yTop + band + sl * 0.45, tipX + dx + lean, yTop + band + sl);
        ctx.quadraticCurveTo(x + dx + sw * 0.85, yTop + band + sl * 0.4, x + dx + sw + 2, yTop + band - 1);
        ctx.closePath(); ctx.fill();
        if (o.drip && rng.chance(0.3)) { ctx.beginPath(); ctx.arc(tipX + dx + lean, yTop + band + sl + 5, 1.8, 0, TAU); ctx.fill(); }
      });
      x += sw * rng.range(0.55, 1.0);
    }
  };
  /** Ruined arcade wall: a run of arches with a broken top edge and faint brick courses. */
  K.arcade = function (ctx, x0, x1, yb, o) {
    o = o || {};
    const rng = o.rng || new U.Rng(11);
    const span = o.span || 110, pier = o.pier || 24, ah = o.archH || 150, wallH = o.h || ah + 70;
    const p = new Path2D();
    // broken top edge
    p.moveTo(x0, yb);
    p.lineTo(x0, yb - wallH * rng.range(0.6, 0.9));
    for (let x = x0; x < x1; x += rng.range(14, 34)) p.lineTo(x, yb - wallH + rng.range(0, 1) * (o.ragged || 26) * (rng.chance(0.12) ? 3 : 1));
    p.lineTo(x1, yb - wallH * rng.range(0.6, 0.9));
    p.lineTo(x1, yb); p.closePath();
    for (let x = x0 + pier; x + span - pier <= x1 + 0.1; x += span) {
      const aw = span - pier, r = aw / 2;
      p.moveTo(x, yb); p.lineTo(x, yb - ah + r); p.arc(x + r, yb - ah + r, r, Math.PI, 0); p.lineTo(x + aw, yb); p.closePath();
    }
    ctx.fillStyle = o.color || '#222';
    ctx.fill(p, 'evenodd');
    if (o.courses) {
      ctx.save(); ctx.clip(p, 'evenodd');
      ctx.fillStyle = o.courses;
      for (let y = yb - 4; y > yb - wallH - 40; y -= o.courseH || 14) {
        ctx.fillRect(x0, y, x1 - x0, 1);
        const off = Math.round((yb - y) / (o.courseH || 14)) % 2 ? 0 : 14;
        for (let x = x0 + off; x < x1; x += 28) ctx.fillRect(x, y - (o.courseH || 14), 1, o.courseH || 14);
      }
      ctx.restore();
    }
    if (o.keystones) { // pale keystone blocks above each arch
      ctx.fillStyle = o.keystones;
      for (let x = x0 + pier; x + span - pier <= x1 + 0.1; x += span) { const aw = span - pier; ctx.fillRect(x + aw / 2 - 4, yb - ah - 2, 8, 12); }
    }
  };
  /** Vertical form shading on everything drawn so far (source-atop): lighter top, darker bottom. */
  K.shade = function (ctx, w, h, top, bottom, y0, y1) {
    ctx.save();
    ctx.globalCompositeOperation = 'source-atop';
    const g = ctx.createLinearGradient(0, y0 === undefined ? 0 : y0, 0, y1 === undefined ? h : y1);
    g.addColorStop(0, top); g.addColorStop(1, bottom);
    ctx.fillStyle = g; ctx.fillRect(0, 0, w, h);
    ctx.restore();
  };
  /** Rim light on the upper edges of every silhouette in the canvas (prerender only). */
  K.rimLight = function (ctx, w, h, color, alpha, width, dx) {
    const src = ctx.canvas;
    const mc = makeCanvas(w, h), c = mc.ctx;
    c.drawImage(src, 0, 0);
    c.globalCompositeOperation = 'source-in';
    c.fillStyle = color; c.fillRect(0, 0, w, h);
    c.globalCompositeOperation = 'destination-out';
    c.drawImage(src, dx || 0, width || 3);
    ctx.save();
    ctx.globalCompositeOperation = 'source-atop';
    ctx.globalAlpha = alpha === undefined ? 0.6 : alpha;
    ctx.drawImage(mc.canvas, 0, 0);
    ctx.restore();
    freeCanvas(mc.canvas);
  };
  K.glowSpot = function (ctx, x, y, r, color, a) {
    const g = ctx.createRadialGradient(x, y, 0, x, y, r);
    g.addColorStop(0, rgba(color, a)); g.addColorStop(0.35, rgba(color, a * 0.45)); g.addColorStop(1, rgba(color, 0));
    ctx.fillStyle = g; ctx.fillRect(x - r, y - r, r * 2, r * 2);
  };
  K.moon = function (ctx, x, y, r, o) {
    o = o || {};
    K.glowSpot(ctx, x, y, r * 6, o.halo || '#c8d0e0', 0.22);
    K.glowSpot(ctx, x, y, r * 2.2, o.halo || '#c8d0e0', 0.3);
    ctx.fillStyle = o.color || '#e8e4d8'; ctx.beginPath(); ctx.arc(x, y, r, 0, TAU); ctx.fill();
    ctx.fillStyle = rgba('#000000', 0.08);
    for (const [dx, dy, rr] of [[-0.3, -0.2, 0.22], [0.25, 0.15, 0.18], [0.05, 0.4, 0.12], [-0.35, 0.3, 0.1]]) { ctx.beginPath(); ctx.arc(x + dx * r, y + dy * r, rr * r, 0, TAU); ctx.fill(); }
  };
  K.stars = function (ctx, w, h, n, color, rng) {
    for (let i = 0; i < n; i++) {
      const a = rng.range(0.15, 0.7) * (1 - (i % 7) * 0.05);
      ctx.fillStyle = rgba(color, a);
      const s = rng.chance(0.08) ? 2 : 1;
      ctx.fillRect(rng.next() * w, rng.next() * h, s, s);
    }
  };
  /** Light shaft polygon (prerendered). Slanted beam from the top. */
  K.shaft = function (ctx, x, top, bottom, w0, w1, slant, color, a) {
    const g = ctx.createLinearGradient(0, top, 0, bottom);
    g.addColorStop(0, rgba(color, a)); g.addColorStop(0.6, rgba(color, a * 0.35)); g.addColorStop(1, rgba(color, 0));
    ctx.fillStyle = g;
    ctx.beginPath(); ctx.moveTo(x - w0 / 2, top); ctx.lineTo(x + w0 / 2, top); ctx.lineTo(x + slant + w1 / 2, bottom); ctx.lineTo(x + slant - w1 / 2, bottom); ctx.closePath(); ctx.fill();
  };
  /** Apply atmospheric haze + ground fog to everything drawn so far in the layer (source-atop). */
  K.haze = function (ctx, w, h, color, alpha, fog) {
    ctx.save();
    ctx.globalCompositeOperation = 'source-atop';
    if (alpha > 0) { ctx.fillStyle = rgba(color, alpha); ctx.fillRect(0, 0, w, h); }
    if (fog && fog.alpha > 0) {
      const y0 = h * (1 - (fog.h || 0.35));
      const g = ctx.createLinearGradient(0, y0, 0, h);
      g.addColorStop(0, rgba(fog.color || color, 0)); g.addColorStop(1, rgba(fog.color || color, fog.alpha));
      ctx.fillStyle = g; ctx.fillRect(0, y0, w, h - y0);
    }
    if (fog && fog.top > 0) {
      const y1 = h * (fog.topH || 0.3);
      const g = ctx.createLinearGradient(0, 0, 0, y1);
      g.addColorStop(0, rgba(fog.color || color, fog.top)); g.addColorStop(1, rgba(fog.color || color, 0));
      ctx.fillStyle = g; ctx.fillRect(0, 0, w, y1);
    }
    ctx.restore();
  };
  /** Rocky cave wall texture band (for 'interior'/'shaft' backdrops). */
  K.rockWall = function (ctx, x, y, w, h, o) {
    o = o || {};
    const rng = o.rng || new U.Rng(3);
    ctx.fillStyle = o.color || '#222'; ctx.fillRect(x, y, w, h);
    for (let i = 0; i < (o.blobs || 60); i++) {
      ctx.fillStyle = rgba(rng.chance(0.5) ? (o.lite || '#ffffff') : '#000000', rng.range(0.03, 0.08));
      ctx.beginPath(); ctx.ellipse(x + rng.next() * w, y + rng.next() * h, rng.range(10, 60), rng.range(6, 30), rng.range(0, 3), 0, TAU); ctx.fill();
    }
  };
  K.brickWall = function (ctx, x, y, w, h, o) {
    o = o || {};
    const bw = o.bw || 34, bh = o.bh || 16, rng = o.rng || new U.Rng(5);
    ctx.fillStyle = o.color || '#222'; ctx.fillRect(x, y, w, h);
    for (let yy = y, r = 0; yy < y + h; yy += bh, r++) {
      for (let xx = x - (r % 2) * bw * 0.5; xx < x + w; xx += bw) {
        ctx.fillStyle = rgba(rng.chance(0.5) ? (o.lite || '#ffffff') : '#000000', rng.range(0.02, 0.07));
        ctx.fillRect(xx + 1, yy + 1, bw - 2, bh - 2);
      }
      ctx.fillStyle = rgba('#000000', 0.25); ctx.fillRect(x, yy, w, 1.2);
    }
  };

  // =============================================================================================
  // Background build / draw
  const BG = (Art.BG = { kit: K });
  // Global memo for region-independent sprites (shafts, fog bands, overlays).
  const memoMap = new Map();
  function memo(key, fn) { let v = memoMap.get(key); if (!v) { v = fn(); memoMap.set(key, v); if (memoMap.size > 64) memoMap.delete(memoMap.keys().next().value); } return v; }
  const PMAX = 2048; // max layer period (wider rooms tile the layer; > 1.5 views so no visible repeat)

  function bgInfo(room, cache) {
    const W = cache.W, H = cache.H;
    return {
      pal: cache.pal, mat: cache.mat, theme: cache.theme, cfg: cache.cfg, W, H, cols: room.cols, rows: room.rows,
      seed: cache.seed, roomId: room.id, kit: K, util: U, VW, VH,
      // fraction of the room width/height that is "sky" (for 'sky' rooms: rows above the highest floor)
    };
  }
  /**
   * Combined atmospheric post-process in ONE source-atop gradient pass: form shading (shade.top →
   * shade.bottom), uniform haze, ground fog (bottom) and ceiling fog (top). Equivalent to stacking the
   * three overlays; sampled at 12 stops.
   */
  K.atmos = function (ctx, w, h, L, pal) {
    const hazeC = U.rgb(L.hazeColor || pal.fog), haze = L.haze || 0, fog = L.fog || null, sh = L.shade || null;
    if (!haze && !fog && !sh) return;
    const parse = (c) => { // 'rgba(r,g,b,a)' | hex → [r,g,b,a]
      if (!c) return [0, 0, 0, 0];
      const m = String(c).match(/rgba?\(([^)]+)\)/i);
      if (m) { const q = m[1].split(',').map(parseFloat); return [q[0], q[1], q[2], q.length > 3 ? q[3] : 1]; }
      const v = U.rgb(c); return [v[0], v[1], v[2], 1];
    };
    const s0 = sh ? parse(sh.top || 'rgba(255,255,255,0.08)') : null, s1 = sh ? parse(sh.bottom || 'rgba(0,0,0,0.2)') : null;
    const fogC = fog ? U.rgb(fog.color || L.hazeColor || pal.fog) : null;
    const g = ctx.createLinearGradient(0, 0, 0, h);
    const N = 12;
    for (let i = 0; i <= N; i++) {
      const t = i / N, y = t * h;
      const layers = [];
      if (sh) { const a = lerp(s0[3], s1[3], t); layers.push([lerp(s0[0], s1[0], t), lerp(s0[1], s1[1], t), lerp(s0[2], s1[2], t), a]); }
      if (haze) layers.push([hazeC[0], hazeC[1], hazeC[2], haze]);
      if (fog) {
        let a = 0;
        if (fog.alpha) { const y0 = h * (1 - (fog.h || 0.35)); if (y > y0) a = fog.alpha * smooth(y0, h, y); }
        if (fog.top) { const y1 = h * (fog.topH || 0.3); if (y < y1) a = 1 - (1 - a) * (1 - fog.top * (1 - smooth(0, y1, y))); }
        if (a > 0) layers.push([fogC[0], fogC[1], fogC[2], a]);
      }
      let A = 0, R = 0, Gc = 0, B = 0; // composite of successive overlays
      for (const [r, gg, b, a] of layers) { R = R * (1 - a) + r * a; Gc = Gc * (1 - a) + gg * a; B = B * (1 - a) + b * a; A = 1 - (1 - A) * (1 - a); }
      const k = A > 1e-4 ? 1 / A : 0;
      // R,Gc,B accumulated premultiplied-by-coverage; divide by total coverage for the straight colour
      g.addColorStop(t, 'rgba(' + Math.round(R * k) + ',' + Math.round(Gc * k) + ',' + Math.round(B * k) + ',' + A.toFixed(3) + ')');
    }
    ctx.save();
    ctx.globalCompositeOperation = 'source-atop';
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, w, h);
    ctx.restore();
  };

  // Shared per-region/size caches for the backdrop are not used: every room gets its own (seeded) art.
  BG.build = function (room, cache) {
    const cfg = cache.cfg, th = cache.theme || {};
    const info = bgInfo(room, cache);
    const bg = (cache.bg = { layers: [], backdrop: null, shafts: [], skyGlows: [] });
    const recipe = (cfg.bg && typeof cfg.bg.recipe === 'function') ? cfg.bg.recipe : genericRecipe;
    let spec;
    try { spec = recipe(th, info) || genericRecipe(th, info); } catch (e) { Art.report(e, 'bg.recipe:' + cfg.id); spec = genericRecipe(th, info); }
    const layers = (spec.layers || []).filter((L) => L && typeof L.draw === 'function');
    // --- backdrop: sky + the near-static far layers, one opaque canvas with a little parallax slack
    const slackX = Math.min(120, Math.round(Math.max(0, cache.W - VW) * 0.05));
    const slackY = Math.min(80, Math.round(Math.max(0, cache.H - VH) * 0.05));
    const BW = VW + slackX, BH = VH + slackY;
    const bd = makeCanvas(BW, BH);
    try {
      const rng = new U.Rng(cache.seed ^ 0x51ed);
      if (typeof spec.sky === 'function') spec.sky(bd.ctx, BW, BH, rng, info);
      else defaultSky(bd.ctx, BW, BH, rng, info, spec.sky || {});
    } catch (e) { Art.report(e, 'bg.sky:' + cfg.id); defaultSky(bd.ctx, BW, BH, new U.Rng(1), info, {}); }
    // sky glows (screen-fraction coords) are baked into the backdrop too: their flicker is negligible
    bg.skyGlows = [];
    const backdropGlows = [];
    const tm = cache.timing || (cache.timing = {});
    layers.forEach((L, li) => {
      const far = L.backdrop !== undefined ? L.backdrop : (L.f === undefined ? 0.3 : L.f) <= 0.08;
      if (!far) return;
      const tl0 = U.now();
      const lr = clamp(L.lowres || 1, 0.25, 1);
      const mc = makeCanvas(Math.ceil(BW * lr), Math.ceil(BH * lr));
      const linfo = Object.assign({}, info, { f: 0, layerIndex: li, period: BW, height: BH, backdrop: true,
        addGlow: (x, y, r, color, a, flicker) => backdropGlows.push({ x, y, r, color, a: a === undefined ? 0.5 : a, flicker: flicker === undefined ? 0.2 : flicker }) });
      try {
        mc.ctx.save(); mc.ctx.scale(lr, lr);
        L.draw(mc.ctx, BW, BH, new U.Rng(hashInt(cache.seed, li, 0xbeef)), linfo);
        postProcess(mc.ctx, BW, BH, L, cache, undefined, undefined, lr);
        mc.ctx.restore();
      } catch (e) { Art.report(e, 'bg.layer:' + cfg.id + ':' + li); }
      bd.ctx.imageSmoothingEnabled = true; bd.ctx.imageSmoothingQuality = 'high';
      bd.ctx.drawImage(mc.canvas, 0, 0, BW, BH);
      freeCanvas(mc.canvas);
      L._done = true;
      tm['bg.L' + li] = +(U.now() - tl0).toFixed(1);
    });
    // Far glows barely flicker perceptibly: bake them into the opaque backdrop (zero per-frame cost).
    for (const g of spec.skyGlows || []) backdropGlows.push({ x: g.x * VW, y: g.y * VH, r: g.r, color: g.color, a: g.a });
    bakeGlows(bd.ctx, backdropGlows, 0, BH, 0);
    bg.backdrop = { canvas: bd.canvas, sx: slackX, sy: slackY, glows: [] };
    // --- parallax layers, cropped to their declared content bands
    layers.forEach((L, li) => {
      if (L._done) { delete L._done; return; }
      const tl0 = U.now();
      const f = clamp(L.f === undefined ? 0.3 : L.f, 0, 1.5);
      const need = Math.ceil(VW + Math.max(0, cache.W - VW) * f) + 2;
      const P = clamp(L.period || need, VW + 64, L.maxPeriod || PMAX);
      const Hl = Math.ceil(VH + Math.max(0, cache.H - VH) * f) + 2;
      const glows = [];
      const linfo = Object.assign({}, info, {
        f, layerIndex: li, period: P, height: Hl,
        addGlow: (x, y, r, color, a, flicker) => glows.push({ x, y, r, color, a: a === undefined ? 0.5 : a, flicker: flicker === undefined ? 0.2 : flicker }),
      });
      const lr = clamp(L.lowres || 1, 0.25, 1);
      const mc = makeCanvas(Math.ceil(P * lr), Math.ceil(Hl * lr));
      mc.ctx.save(); mc.ctx.scale(lr, lr);
      try { L.draw(mc.ctx, P, Hl, new U.Rng(hashInt(cache.seed, li, 0xbeef)), linfo); } catch (e) { Art.report(e, 'bg.layer:' + cfg.id + ':' + li); }
      mc.ctx.restore();
      // bands: declared fractions of the layer height (default: whole layer)
      const decl = L.bands || [[0, 1]];
      const bands = [];
      for (const [a, b] of decl) {
        const y0 = clamp(Math.floor(a * Hl), 0, Hl), y1 = clamp(Math.ceil(b * Hl), 0, Hl);
        if (y1 - y0 < 2) continue;
        if (lr < 1) { // post-process at low resolution, then upscale once into the 1:1 band canvas
          const sy0 = Math.floor(y0 * lr), sy1 = Math.min(mc.canvas.height, Math.ceil(y1 * lr));
          const lc = makeCanvas(mc.canvas.width, Math.max(1, sy1 - sy0));
          lc.ctx.drawImage(mc.canvas, 0, -sy0);
          lc.ctx.save(); lc.ctx.translate(0, -sy0); lc.ctx.scale(lr, lr);
          try { postProcess(lc.ctx, P, Hl, L, cache, y0, y1, lr); } catch (e) { Art.report(e, 'bg.post:' + cfg.id + ':' + li); }
          lc.ctx.restore();
          const bc = makeCanvas(P, y1 - y0);
          bc.ctx.imageSmoothingEnabled = true; bc.ctx.imageSmoothingQuality = 'high';
          bc.ctx.drawImage(lc.canvas, 0, (y0 * lr - sy0) * -1 / lr, P, (lc.canvas.height) / lr);
          freeCanvas(lc.canvas);
          bands.push({ canvas: bc.canvas, ctx: bc.ctx, y0, y1 });
        } else {
          const bc = makeCanvas(P, y1 - y0);
          bc.ctx.drawImage(mc.canvas, 0, y0, P, y1 - y0, 0, 0, P, y1 - y0);
          bc.ctx.save(); bc.ctx.translate(0, -y0);
          try { postProcess(bc.ctx, P, Hl, L, cache, y0, y1, 1); } catch (e) { Art.report(e, 'bg.post:' + cfg.id + ':' + li); }
          bc.ctx.restore();
          bands.push({ canvas: bc.canvas, ctx: bc.ctx, y0, y1 });
        }
      }
      freeCanvas(mc.canvas);
      // Large glows (and every glow on far layers, where flicker is imperceptible) are baked into the
      // band canvases when fully inside one band (so no hard cut); the rest stay animated (cheap).
      const live = [];
      for (const g of glows) {
        const band = (g.r > GLOW_BAKE_R || f < 0.2) ? bands.find((b) => g.y - g.r >= b.y0 && g.y + g.r <= b.y1) : null;
        if (band) bakeGlows(band.ctx, [g], band.y0, band.y1, P); else live.push(g);
      }
      for (const b of bands) delete b.ctx;
      tm['bg.L' + li] = +(U.now() - tl0).toFixed(1);
      bg.layers.push({ bands, f, fy: L.fy === undefined ? f : L.fy, P, H: Hl, glows: live, alpha: L.alpha === undefined ? 1 : L.alpha, additive: !!L.additive, anim: L.anim || null, drift: L.drift || 0 });
    });
    // --- shafts (animated additive beams, drawn after the layer index `after`)
    for (const sp of spec.shafts || []) {
      const h = Math.round(sp.h || VH * 1.1), w = Math.round(Math.max(sp.w0 || 80, sp.w1 || 220) + Math.abs(sp.slant || 0) + 20);
      const color = sp.color || cache.pal.light;
      const canvas = memo(['shaft', w, h, sp.w0, sp.w1, sp.slant, color].join(':'), () => {
        const mc = makeCanvas(w, h);
        K.shaft(mc.ctx, w / 2 - (sp.slant || 0) / 2, 0, h, sp.w0 || 80, sp.w1 || 220, sp.slant || 0, color, 1);
        U.blurCanvas(mc.canvas, 6);
        return mc.canvas;
      });
      bg.shafts.push({ canvas, shared: true, x: sp.x, y: sp.y || 0, f: sp.f === undefined ? 0.35 : sp.f, a: sp.alpha || 0.12, after: sp.after === undefined ? 1 : sp.after, speed: sp.speed || 0.3, phase: sp.phase || 0, w, h });
    }
  };
  const GLOW_BAKE_R = 56; // px: glows larger than this are baked (each costs a large additive blit)
  /** Additively bake glows into a canvas whose top edge is at layer-y `y0`; `P` > 0 also bakes the
   *  horizontally wrapped copies (tiling layers). */
  function bakeGlows(ctx, glows, y0, y1, P) {
    if (!glows.length) return;
    ctx.save(); ctx.setTransform(1, 0, 0, 1, 0, 0);
    for (const g of glows) {
      const xs = P ? [g.x - P, g.x, g.x + P] : [g.x];
      for (const x of xs) {
        if (x + g.r < 0 || x - g.r > ctx.canvas.width) continue;
        Art.glow(ctx, x, g.y - y0, g.r, g.color, g.a);
      }
    }
    ctx.restore();
    void y1;
  }
  // Post-processing of a layer canvas (ctx may be translated so y spans the full layer height h).
  function postProcess(ctx, w, h, L, cache, y0, y1, lr) {
    lr = lr || 1;
    K.atmos(ctx, w, h, L, cache.pal);
    if (L.rim) { // operates in canvas pixel space
      ctx.save(); ctx.setTransform(1, 0, 0, 1, 0, 0);
      K.rimLight(ctx, ctx.canvas.width, ctx.canvas.height, L.rim.color || cache.pal.highlight, L.rim.alpha, Math.max(1, (L.rim.width || 3) * lr), (L.rim.dx || 0) * lr);
      ctx.restore();
    }
    if (L.blur) U.blurCanvas(ctx.canvas, L.blur * lr);
    if (L.post) L.post(ctx, w, h, L);
  }

  function defaultSky(ctx, w, h, rng, info, o) {
    const pal = info.pal;
    ctx.fillStyle = K.grad(ctx, 0, 0, 0, h, [[0, o.top || pal.skyTop], [1, o.bottom || pal.skyBottom]]);
    ctx.fillRect(0, 0, w, h);
    if (o.glow !== false) K.glowSpot(ctx, w * (o.gx || 0.5), h * (o.gy || 0.8), w * (o.gr || 0.6), o.glowColor || pal.fog, o.glowA || 0.35);
  }

  // Generic recipe (used for regions without a recipe and for themes a recipe doesn't handle).
  function genericRecipe(th, info) {
    const pal = info.pal, bgk = th.bg || 'open';
    const far = pal.far, mid = pal.mid, near = pal.near;
    if (bgk === 'none') return { sky: { glow: false }, layers: [] };
    if (bgk === 'sky') {
      return {
        sky: { gy: 0.85 },
        layers: [
          { f: 0.08, draw: (ctx, w, h, rng) => K.ridge(ctx, w, h, { base: h * 0.78, amp: 70, scale: 380, color: far, seed: rng.int(1, 1e6) }), haze: 0.25, fog: { alpha: 0.4, h: 0.25 } },
          { f: 0.25, draw: (ctx, w, h, rng) => K.ridge(ctx, w, h, { base: h * 0.86, amp: 60, scale: 240, color: mid, seed: rng.int(1, 1e6) }), haze: 0.1, fog: { alpha: 0.35, h: 0.2 } },
          { f: 0.5, draw: (ctx, w, h, rng) => K.ridge(ctx, w, h, { base: h * 0.95, amp: 50, scale: 170, color: near, seed: rng.int(1, 1e6) }), fog: { alpha: 0.25, h: 0.15 } },
        ],
      };
    }
    return {
      sky: { gy: 0.55, gr: 0.7, glowA: 0.3 },
      layers: [
        { f: 0.1, draw: (ctx, w, h, rng) => { K.ridge(ctx, w, h, { base: h * 0.75, amp: 90, scale: 300, color: far, seed: rng.int(1, 1e6) }); K.stalactites(ctx, w, 0, { color: far, rng, maxL: h * 0.2 }); }, haze: 0.2, fog: { alpha: 0.35, h: 0.3 } },
        { f: 0.3, draw: (ctx, w, h, rng) => { for (let x = rng.range(0, 200); x < w; x += rng.range(220, 420)) K.wrap(w, x, 30, (xx) => K.pillar(ctx, xx, h, rng.range(26, 40), h * rng.range(0.4, 0.7), { color: mid, broken: rng.chance(0.4) ? rng.range(0.2, 0.5) : 0 })); }, haze: 0.08, fog: { alpha: 0.3, h: 0.35 } },
        { f: 0.55, draw: (ctx, w, h, rng) => { K.ridge(ctx, w, h, { base: h * 0.97, amp: 40, scale: 160, color: near, seed: rng.int(1, 1e6) }); K.stalactites(ctx, w, 0, { color: near, rng, maxL: 70 }); }, fog: { alpha: 0.2, h: 0.2 } },
      ],
    };
  }
  BG.genericRecipe = genericRecipe;

  BG.draw = function (ctx, room, cache, cam, t) {
    const bg = cache.bg;
    if (!bg) return;
    const B = bg.backdrop;
    const fx = cache.W > VW ? clamp(cam.x / (cache.W - VW), 0, 1) : 0.5, fy = cache.H > VH ? clamp(cam.y / (cache.H - VH), 0, 1) : 0.5;
    const bx = -Math.round(B.sx * fx), by = -Math.round(B.sy * fy);
    ctx.drawImage(B.canvas, bx, by);
    for (const g of B.glows) Art.glow(ctx, bx + g.x, by + g.y, g.r, g.color, g.a * (1 + g.flicker * noise1(t * 2.3 + g.x * 0.3, 3)));
    for (const g of bg.skyGlows) Art.glow(ctx, g.x * VW, g.y * VH, g.r, g.color, g.a * (1 + (g.flicker || 0) * noise1(t * 2 + g.x * 9, 3)));
    const n = bg.layers.length;
    for (const s of bg.shafts) if (s.after < 0) drawShaft(ctx, s, cam, t);
    for (let i = 0; i < n; i++) {
      drawLayer(ctx, bg.layers[i], cam, t);
      for (const s of bg.shafts) if (s.after === i) drawShaft(ctx, s, cam, t);
    }
    for (const s of bg.shafts) if (s.after >= n) drawShaft(ctx, s, cam, t);
  };
  function drawLayer(ctx, L, cam, t) {
    const ox = -cam.x * L.f - (L.drift ? t * L.drift : 0), oy = -cam.y * L.fy;
    const oyi = Math.round(oy);
    if (L.alpha !== 1) ctx.globalAlpha = L.alpha;
    if (L.additive) ctx.globalCompositeOperation = 'lighter';
    const x00 = Math.round(mod(ox, L.P)) - L.P;
    for (const b of L.bands) {
      const y0 = Math.max(b.y0, -oyi), y1 = Math.min(b.y1, VH - oyi);
      if (y1 <= y0) continue;
      for (let x = x00; x < VW; x += L.P) {
        const sx0 = Math.max(0, -x), sx1 = Math.min(L.P, VW - x);
        if (sx1 <= sx0) continue;
        ctx.drawImage(b.canvas, sx0, y0 - b.y0, sx1 - sx0, y1 - y0, x + sx0, oyi + y0, sx1 - sx0, y1 - y0);
      }
    }
    if (L.alpha !== 1) ctx.globalAlpha = 1;
    if (L.additive) ctx.globalCompositeOperation = 'source-over';
    if (L.glows.length) {
      for (const g of L.glows) {
        const fl = 1 + g.flicker * (noise1(t * 3.1 + g.x * 0.37, 5) * 0.7 + noise1(t * 9 + g.y, 9) * 0.3);
        for (let x2 = x00 + g.x; x2 - g.r < VW; x2 += L.P) {
          if (x2 + g.r < 0) continue;
          const y = oyi + g.y;
          if (y + g.r < 0 || y - g.r > VH) continue;
          Art.glow(ctx, x2, y, g.r, g.color, g.a * fl);
        }
      }
    }
    if (L.anim) { try { L.anim(ctx, ox, oyi, t, L); } catch (e) { Art.report(e, 'bg.anim'); } }
  }
  function drawShaft(ctx, s, cam, t) {
    const a = s.a * (0.65 + 0.35 * Math.sin(t * s.speed + s.phase));
    if (a <= 0.003) return;
    const P = Math.max(VW + s.w, 2000);
    let x = mod(s.x - cam.x * s.f, P) - s.w / 2;
    if (x > VW) x -= P;
    const y = Math.round(s.y - cam.y * s.f * 0.5);
    ctx.globalCompositeOperation = 'lighter';
    ctx.globalAlpha = a;
    ctx.drawImage(s.canvas, Math.round(x), y);
    ctx.globalAlpha = 1;
    ctx.globalCompositeOperation = 'source-over';
  }

  // =============================================================================================
  // Foreground framing silhouettes (screen space, parallax 1.35, fade out of the central view).
  const FG = (Art.FG = {});
  const FG_PAR = 1.35;
  const FG_KINDS = (FG.kinds = {});
  // Each kind draws a dark silhouette into a canvas; anchor at (ax, ay) in the sprite.
  // side: 'bottom' (rises from below), 'top' (hangs from above), 'left'/'right' (from the edge).
  FG_KINDS.grass = { side: 'bottom', w: 300, h: 190, draw(ctx, w, h, rng, c) {
    ctx.strokeStyle = c; ctx.lineCap = 'round';
    for (let i = 0; i < 70; i++) { const x = rng.range(10, w - 10), hh = rng.range(h * 0.3, h * 0.95), lean = rng.range(-50, 50); ctx.lineWidth = rng.range(2, 6); ctx.beginPath(); ctx.moveTo(x, h + 4); ctx.quadraticCurveTo(x + lean * 0.2, h - hh * 0.6, x + lean, h - hh); ctx.stroke(); }
    ctx.fillStyle = c; ctx.beginPath(); ctx.ellipse(w / 2, h, w * 0.48, h * 0.18, 0, 0, TAU); ctx.fill();
  } };
  FG_KINDS.rock = { side: 'bottom', w: 360, h: 170, draw(ctx, w, h, rng, c) {
    ctx.fillStyle = c; ctx.beginPath(); ctx.moveTo(0, h);
    for (let x = 0; x <= w; x += 20) ctx.lineTo(x, h - Math.sin((x / w) * Math.PI) * h * (0.75 + 0.25 * rng.next()));
    ctx.lineTo(w, h); ctx.closePath(); ctx.fill();
  } };
  FG_KINDS.pillar = { side: 'left', w: 150, h: 760, draw(ctx, w, h, rng, c) {
    ctx.fillStyle = c; ctx.fillRect(w * 0.18, 0, w * 0.64, h);
    ctx.fillRect(w * 0.05, h * 0.12, w * 0.9, 26); ctx.fillRect(w * 0.08, h * 0.12 + 30, w * 0.84, 10);
    ctx.fillRect(w * 0.05, h * 0.78, w * 0.9, 30);
  } };
  FG_KINDS.chain = { side: 'top', w: 70, h: 520, draw(ctx, w, h, rng, c) {
    K.chain(ctx, w / 2, 0, h - 60, { color: c, link: 26, width: 8 });
    ctx.fillStyle = c; ctx.beginPath(); ctx.moveTo(w / 2 - 12, h - 70); ctx.lineTo(w / 2 + 12, h - 70); ctx.lineTo(w / 2 + 4, h); ctx.lineTo(w / 2 - 4, h); ctx.closePath(); ctx.fill();
  } };
  FG_KINDS.vines = { side: 'top', w: 260, h: 380, draw(ctx, w, h, rng, c) {
    ctx.strokeStyle = c; ctx.fillStyle = c; ctx.lineCap = 'round';
    for (let i = 0; i < 9; i++) {
      const x = rng.range(20, w - 20), l = rng.range(h * 0.4, h), sw = rng.range(-30, 30);
      ctx.lineWidth = rng.range(3, 7);
      ctx.beginPath(); ctx.moveTo(x, -4); ctx.bezierCurveTo(x + sw, l * 0.3, x - sw, l * 0.7, x + sw * 0.5, l); ctx.stroke();
      for (let k = 0; k < 6; k++) { const t = rng.range(0.2, 1), lx = x + sw * 0.3 * t, ly = l * t, d = rng.chance(0.5) ? 1 : -1; ctx.beginPath(); ctx.ellipse(lx + d * 8, ly, 10, 4, d * 0.5, 0, TAU); ctx.fill(); }
    }
    ctx.beginPath(); ctx.ellipse(w / 2, 0, w * 0.5, 24, 0, 0, TAU); ctx.fill();
  } };
  FG_KINDS.reeds = { side: 'bottom', w: 260, h: 520, draw(ctx, w, h, rng, c) {
    for (let i = 0; i < 9; i++) K.reed(ctx, rng.range(20, w - 20), h + 4, rng.range(h * 0.5, h * 0.95), { color: c, width: rng.range(4, 8), lean: rng.range(-40, 40), leaves: 2 });
  } };
  FG_KINDS.pipe = { side: 'right', w: 220, h: 600, draw(ctx, w, h, rng, c) {
    K.pipe(ctx, [[w - 10, -10], [w - 10, h * 0.45], [w * 0.4, h * 0.45], [w * 0.4, h + 10]], 46, { color: c, jointEvery: 140 });
  } };
  FG_KINDS.icicles = { side: 'top', w: 380, h: 240, draw(ctx, w, h, rng, c) {
    ctx.fillStyle = c; ctx.beginPath(); ctx.moveTo(0, -2);
    for (let x = 0; x < w;) { const sw = rng.range(14, 40), l = rng.range(h * 0.25, h); ctx.lineTo(x, 10); ctx.lineTo(x + sw / 2, l); x += sw; }
    ctx.lineTo(w, 10); ctx.lineTo(w, -2); ctx.closePath(); ctx.fill();
  } };
  FG_KINDS.crystal = { side: 'bottom', w: 300, h: 300, draw(ctx, w, h, rng, c) {
    for (let i = 0; i < 6; i++) K.crystal(ctx, rng.range(40, w - 40), h + 4, rng.range(30, 70), rng.range(h * 0.4, h), { color: c, lean: rng.range(-30, 30) });
  } };
  FG_KINDS.flower = { side: 'bottom', w: 320, h: 460, draw(ctx, w, h, rng, c) {
    K.flower(ctx, w * 0.5, h + 4, h * 0.82, { petal: c, stem: c, r: 54, lean: rng.range(-50, 50) });
    for (let i = 0; i < 5; i++) K.frond(ctx, rng.range(30, w - 30), h + 4, rng.range(h * 0.3, h * 0.6), rng.range(-0.6, 0.6), { color: c });
  } };
  FG_KINDS.beam = { side: 'top', w: 700, h: 160, draw(ctx, w, h, rng, c) {
    ctx.fillStyle = c; ctx.fillRect(0, 20, w, 46);
    ctx.beginPath(); ctx.moveTo(w * 0.2, 60); ctx.lineTo(w * 0.28, 60); ctx.lineTo(w * 0.12, h); ctx.lineTo(w * 0.06, h); ctx.closePath(); ctx.fill();
    K.chain(ctx, w * 0.7, 60, h, { color: c, link: 22, width: 6 });
  } };
  FG_KINDS.silk = { side: 'top', w: 420, h: 360, draw(ctx, w, h, rng, c) {
    ctx.strokeStyle = c; ctx.lineWidth = 3;
    for (let i = 0; i < 7; i++) { ctx.beginPath(); ctx.moveTo(rng.range(0, w), 0); ctx.quadraticCurveTo(rng.range(0, w), h * 0.6, rng.range(0, w), rng.range(h * 0.4, h)); ctx.stroke(); }
    K.cocoon(ctx, w * 0.6, 0, h * 0.9, { color: c, silk: c });
  } };

  FG.build = function (room, cache) {
    const cfg = cache.cfg, th = cache.theme || {};
    const fgc = cfg.fg || {};
    const dens = th.fg === false ? 0 : (typeof th.fg === 'number' ? th.fg : 1) * (fgc.density === undefined ? 1 : fgc.density);
    const items = (cache.fg = []);
    if (dens <= 0) return;
    const kinds = (fgc.kinds || ['rock']).filter((k) => FG_KINDS[k] || typeof k === 'object');
    if (!kinds.length) return;
    const rng = new U.Rng(cache.seed ^ 0xf00d);
    const color = fgc.color || mix(cache.pal.fillDeep, '#000000', 0.35);
    const spriteCache = new Map();
    const sprite = (kind, variant) => {
      const key = (typeof kind === 'string' ? kind : 'custom') + ':' + variant;
      if (spriteCache.has(key)) return spriteCache.get(key);
      const def = typeof kind === 'string' ? FG_KINDS[kind] : kind;
      const mc = makeCanvas(def.w, def.h);
      try { def.draw(mc.ctx, def.w, def.h, new U.Rng(hashInt(cache.seed, variant, 99)), color); } catch (e) { Art.report(e, 'fg.draw'); }
      U.blurCanvas(mc.canvas, 2.2);
      const s = { canvas: mc.canvas, w: def.w, h: def.h, side: def.side };
      spriteCache.set(key, s);
      return s;
    };
    const W = cache.W, H = cache.H;
    // candidates along the room edges
    const per = Math.max(700, 1100 / dens);
    const cands = [];
    for (let x = rng.range(100, per * 0.6); x < W; x += per * rng.range(0.7, 1.3)) { cands.push(['bottom', x, H]); if (rng.chance(0.6)) cands.push(['top', x + per * 0.4, 0]); }
    for (let y = rng.range(100, 400); y < H; y += per * rng.range(0.8, 1.4)) { cands.push(['left', 0, y]); cands.push(['right', W, y]); }
    for (const [side, x, y] of cands) {
      const opts = kinds.filter((k) => (typeof k === 'string' ? FG_KINDS[k].side : k.side) === side || (side === 'right' && (typeof k === 'string' ? FG_KINDS[k].side : k.side) === 'left') || (side === 'left' && (typeof k === 'string' ? FG_KINDS[k].side : k.side) === 'right'));
      if (!opts.length || !rng.chance(0.75)) continue;
      const kind = rng.pick(opts);
      const s = sprite(kind, rng.int(0, 2));
      const sc = rng.range(0.85, 1.25);
      items.push({ s, side, x, y, sc, flip: side === 'right' || (side !== 'left' && rng.chance(0.5)) });
    }
  };
  FG.draw = function (ctx, room, cache, cam) {
    const items = cache.fg;
    if (!items || !items.length) return;
    const ccx = cam.x + (cam.w || VW) / 2, ccy = cam.y + (cam.h || VH) / 2;
    for (const it of items) {
      const sx = (it.x - ccx) * FG_PAR + VW / 2, sy = (it.y - ccy) * FG_PAR + VH / 2;
      const w = it.s.w * it.sc, h = it.s.h * it.sc;
      let x0, y0;
      if (it.side === 'bottom') { x0 = sx - w / 2; y0 = sy - h + 30; }
      else if (it.side === 'top') { x0 = sx - w / 2; y0 = sy - 30; }
      else if (it.side === 'left') { x0 = sx - w + 40; y0 = sy - h / 2; }
      else { x0 = sx - 40; y0 = sy - h / 2; }
      if (x0 > VW || y0 > VH || x0 + w < 0 || y0 + h < 0) continue;
      // fade when intruding into the central gameplay area
      const ix0 = Math.max(x0, VW * 0.2), iy0 = Math.max(y0, VH * 0.22), ix1 = Math.min(x0 + w, VW * 0.8), iy1 = Math.min(y0 + h, VH * 0.78);
      let a = 1;
      if (ix1 > ix0 && iy1 > iy0) a = clamp(1 - (((ix1 - ix0) * (iy1 - iy0)) / (w * h)) * 2.2, 0, 1);
      if (a <= 0.02) continue;
      ctx.globalAlpha = a * 0.96;
      if (it.flip) { ctx.save(); ctx.translate(Math.round(x0 + w), Math.round(y0)); ctx.scale(-1, 1); ctx.drawImage(it.s.canvas, 0, 0, w, h); ctx.restore(); }
      else ctx.drawImage(it.s.canvas, Math.round(x0), Math.round(y0), w, h);
    }
    ctx.globalAlpha = 1;
  };

  // =============================================================================================
  // Atmosphere: weather particles (parallax-wrapped screen space), rain + splashes, fog bands,
  // vignette + colour grade overlay.
  const Atmos = (Art.Atmos = {});
  const PAD = 80, DW = VW + PAD * 2, DH = VH + PAD * 2;
  const WEATHER = (Atmos.kinds = {
    // count, size [min,max], speed (vx, vy ranges), depth range, colors, sprite style, motion
    ash: { count: 90, size: [1.2, 3.4], vx: [-25, 5], vy: [18, 46], z: [0.4, 1.4], sway: 16, alpha: [0.35, 0.8], sprite: 'flake' },
    motes: { count: 60, size: [1, 2.6], vx: [-6, 6], vy: [-7, 5], z: [0.4, 1.3], sway: 10, alpha: [0.25, 0.75], twinkle: 1.4, sprite: 'dot', glow: 0.5 },
    pollen: { count: 70, size: [1.4, 3.2], vx: [-8, 10], vy: [-12, 3], z: [0.5, 1.4], sway: 18, alpha: [0.35, 0.9], twinkle: 0.8, sprite: 'dot', glow: 0.8 },
    embers: { count: 70, size: [1, 2.8], vx: [-14, 14], vy: [-70, -25], z: [0.5, 1.4], sway: 22, alpha: [0.5, 1], twinkle: 3, sprite: 'dot', glow: 1, life: [2, 5], additive: true },
    rain: { count: 150, size: [1, 1.6], vx: [-170, -130], vy: [950, 1250], z: [0.6, 1.4], alpha: [0.18, 0.4], sprite: 'streak' },
    silk: { count: 70, size: [1.2, 2.8], vx: [-10, 10], vy: [-6, 10], z: [0.4, 1.3], sway: 14, alpha: [0.3, 0.85], twinkle: 2.2, sprite: 'scale', glow: 0.6 },
    snow: { count: 110, size: [1.4, 3.8], vx: [-20, 12], vy: [26, 70], z: [0.4, 1.5], sway: 22, alpha: [0.5, 0.95], sprite: 'dot' },
    light: { count: 60, size: [1.4, 3.4], vx: [-6, 6], vy: [-30, -10], z: [0.5, 1.4], sway: 10, alpha: [0.35, 0.95], twinkle: 1.6, sprite: 'dot', glow: 1, life: [3, 7], additive: true },
    soot: { count: 50, size: [1.4, 3.6], vx: [-14, 14], vy: [8, 26], z: [0.5, 1.3], sway: 12, alpha: [0.35, 0.75], sprite: 'flake' },
  });

  function flakeSprite(color) {
    const key = 'flake:' + color;
    let c = spriteMemo.get(key);
    if (c) return c;
    const S = 16, mc = makeCanvas(S, S), ctx = mc.ctx;
    ctx.fillStyle = color;
    ctx.beginPath(); ctx.moveTo(3, 7); ctx.lineTo(8, 3); ctx.lineTo(13, 6); ctx.lineTo(11, 12); ctx.lineTo(5, 13); ctx.closePath(); ctx.fill();
    U.blurCanvas(mc.canvas, 1);
    spriteMemo.set(key, mc.canvas);
    return mc.canvas;
  }
  function scaleSprite(color) {
    const key = 'scale:' + color;
    let c = spriteMemo.get(key);
    if (c) return c;
    const S = 16, mc = makeCanvas(S, S), ctx = mc.ctx;
    ctx.fillStyle = color;
    ctx.beginPath(); ctx.ellipse(8, 8, 6, 3.2, 0.5, 0, TAU); ctx.fill();
    ctx.fillStyle = 'rgba(255,255,255,0.7)'; ctx.beginPath(); ctx.ellipse(6.5, 7, 2.5, 1.2, 0.5, 0, TAU); ctx.fill();
    spriteMemo.set(key, mc.canvas);
    return mc.canvas;
  }
  const spriteMemo = new Map();

  function makeSystem(spec, cache, rng) {
    const base = WEATHER[spec.kind];
    if (!base) return null;
    const k = Object.assign({}, base, spec);
    const dens = (cache.theme && typeof cache.theme.weatherDensity === 'number') ? cache.theme.weatherDensity : 1;
    const n = Math.round((spec.count || base.count) * dens);
    if (n <= 0) return null;
    const sys = { k, n, x: new Float32Array(n), y: new Float32Array(n), z: new Float32Array(n), vx: new Float32Array(n), vy: new Float32Array(n),
      s: new Float32Array(n), a: new Float32Array(n), ph: new Float32Array(n), life: new Float32Array(n), age: new Float32Array(n) };
    for (let i = 0; i < n; i++) spawn(sys, i, rng, true);
    const color = k.color || cache.pal.particle;
    sys.color = color;
    sys.sprite = k.sprite === 'flake' ? flakeSprite(color) : k.sprite === 'scale' ? scaleSprite(color) : Art.dotSprite(color, k.sprite === 'dot' && !k.glow);
    sys.glowColor = k.glowColor || color;
    return sys;
  }
  function spawn(sys, i, rng, initial) {
    const k = sys.k;
    sys.x[i] = rng.next() * DW;
    sys.y[i] = initial ? rng.next() * DH : (k.vy[1] < 0 ? DH : k.vy[0] > 200 ? -20 : rng.next() * DH);
    if (!initial && k.vy[0] > 0 && k.vy[0] < 200) sys.y[i] = -10;
    sys.z[i] = rng.range(k.z[0], k.z[1]);
    sys.vx[i] = rng.range(k.vx[0], k.vx[1]);
    sys.vy[i] = rng.range(k.vy[0], k.vy[1]);
    sys.s[i] = rng.range(k.size[0], k.size[1]) * (0.6 + 0.4 * sys.z[i]);
    sys.a[i] = rng.range(k.alpha[0], k.alpha[1]);
    sys.ph[i] = rng.next() * TAU;
    sys.life[i] = k.life ? rng.range(k.life[0], k.life[1]) : 0;
    sys.age[i] = initial && k.life ? rng.next() * sys.life[i] : 0;
  }

  Atmos.init = function (room, cache) {
    const cfg = cache.cfg, th = cache.theme || {};
    const A = (cache.atmos = { systems: [], t: 0, lastUpdate: -1, frame: 0, splashes: [], floorPts: null, rng: new U.Rng(cache.seed ^ 0xa7a7), camX: 0, camY: 0, init: false });
    let weather = cfg.weather || [];
    if (th.weather === 'none' || th.weather === false) weather = [];
    else if (typeof th.weather === 'string') weather = [{ kind: th.weather }];
    else if (Array.isArray(th.weather)) weather = th.weather;
    for (const w of weather) { const s = makeSystem(w, cache, A.rng); if (s) A.systems.push(s); }
    // rain splash sites: floor points with open air above
    if (A.systems.some((s) => s.k.sprite === 'streak') && cache.terrain) {
      const pts = [];
      Art.Terrain.walkSurface(cache.terrain, -1e9, -1e9, 1e9, 1e9, 0, 24, 5, (x, y) => pts.push(x, y));
      A.floorPts = new Float32Array(pts);
    }
    // fog bands & vignette/grade overlay (screen-sized)
    const fog = Object.assign({ alpha: 0.18, color: cache.pal.fog }, cfg.fog || {});
    if (typeof th.fog === 'number') fog.alpha *= th.fog;
    A.fog = fog;
    A.fogSprite = fog.alpha > 0 ? memo('fog:' + fog.color, () => fogBand(fog.color, 1234)) : null;
    A.overlay = memo('ov:' + cfg.id + ':' + (th.vignette === undefined ? '' : th.vignette), () => buildOverlay(cache));
  };
  function fogBand(color, seed) {
    const w = 1024, h = 220, mc = makeCanvas(w, h), ctx = mc.ctx;
    const per = 8;
    for (let i = 0; i < 26; i++) {
      const x = h01(i, seed, 1) * w, y = h * (0.35 + 0.3 * h01(i, seed, 2)), rx = 80 + h01(i, seed, 3) * 160, ry = 26 + h01(i, seed, 4) * 40;
      for (const ox of [-w, 0, w]) {
        const g = ctx.createRadialGradient(x + ox, y, 0, x + ox, y, rx);
        g.addColorStop(0, rgba(color, 0.55)); g.addColorStop(1, rgba(color, 0));
        ctx.fillStyle = g;
        ctx.save(); ctx.translate(x + ox, y); ctx.scale(1, ry / rx); ctx.translate(-(x + ox), -y);
        ctx.fillRect(x + ox - rx, y - rx, rx * 2, rx * 2); ctx.restore();
      }
    }
    void per;
    return mc.canvas;
  }
  function buildOverlay(cache) {
    const cfg = cache.cfg, th = cache.theme || {};
    const vig = (typeof th.vignette === 'number' ? th.vignette : cfg.vignette === undefined ? 0.55 : cfg.vignette);
    const grade = cfg.grade;
    const w = VW, h = VH, mc = makeCanvas(w, h), ctx = mc.ctx;
    if (grade) { // vertical tint: subtle colour grading
      const g = ctx.createLinearGradient(0, 0, 0, h);
      g.addColorStop(0, rgba(grade.top || grade.color || '#000000', grade.topA === undefined ? (grade.alpha || 0.08) : grade.topA));
      g.addColorStop(1, rgba(grade.bottom || grade.color || '#000000', grade.bottomA === undefined ? (grade.alpha || 0.08) : grade.bottomA));
      ctx.fillStyle = g; ctx.fillRect(0, 0, w, h);
    }
    if (vig > 0) {
      const g = ctx.createRadialGradient(w / 2, h * 0.48, h * 0.32, w / 2, h * 0.5, w * 0.72);
      const vc = cfg.vignetteColor || '#000000';
      g.addColorStop(0, rgba(vc, 0)); g.addColorStop(0.55, rgba(vc, vig * 0.35)); g.addColorStop(1, rgba(vc, vig));
      ctx.fillStyle = g; ctx.fillRect(0, 0, w, h);
    }
    return mc.canvas;
  }

  Atmos.update = function (room, cache, cam, dt) {
    const A = cache.atmos;
    if (!A) return;
    dt = clamp(+dt || 0, 0, 0.1);
    A.t += dt;
    A.lastUpdate = A.frame;
    const rng = A.rng;
    // camera motion → parallax (particles drift opposite to camera movement by depth)
    const dcx = A.init ? cam.x - A.camX : 0, dcy = A.init ? cam.y - A.camY : 0;
    A.camX = cam.x; A.camY = cam.y; A.init = true;
    const jump = Math.abs(dcx) > 400 || Math.abs(dcy) > 400;
    for (const sys of A.systems) {
      const k = sys.k;
      for (let i = 0; i < sys.n; i++) {
        const z = sys.z[i];
        let x = sys.x[i] + sys.vx[i] * dt * z - (jump ? 0 : dcx * z);
        let y = sys.y[i] + sys.vy[i] * dt * z - (jump ? 0 : dcy * z);
        if (k.sway) x += Math.sin(A.t * 0.9 + sys.ph[i]) * k.sway * dt * 0.8;
        if (k.life) { sys.age[i] += dt; if (sys.age[i] > sys.life[i]) { spawn(sys, i, rng, false); sys.x[i] = rng.next() * DW; sys.y[i] = rng.next() * DH; continue; } }
        x = mod(x, DW); y = mod(y, DH);
        sys.x[i] = x; sys.y[i] = y;
      }
      // rain splashes on floors within view
      if (k.sprite === 'streak' && A.floorPts && A.floorPts.length) {
        const rate = (k.splashRate || 26) * dt;
        let nsp = Math.floor(rate) + (rng.next() < rate % 1 ? 1 : 0);
        const fp = A.floorPts, np = fp.length / 2;
        let tries = 0;
        while (nsp > 0 && tries++ < 40) {
          const j = (rng.next() * np) | 0, px = fp[j * 2], py = fp[j * 2 + 1];
          if (px < cam.x || px > cam.x + VW || py < cam.y || py > cam.y + VH) continue;
          if (A.splashes.length < 40) A.splashes.push({ x: px + rng.range(-10, 10), y: py, t: 0 });
          nsp--;
        }
      }
    }
    for (let i = A.splashes.length - 1; i >= 0; i--) { A.splashes[i].t += dt; if (A.splashes[i].t > 0.32) A.splashes.splice(i, 1); }
  };

  Atmos.draw = function (ctx, room, cache, cam, t) {
    const A = cache.atmos;
    if (!A) return;
    A.frame++;
    // self-drive if the engine does not call updateAtmosphere
    if (A.frame - A.lastUpdate > 2) {
      const dt = A.lastT === undefined ? 1 / 60 : clamp(t - A.lastT, 0, 0.1);
      Atmos.update(room, cache, cam, dt || 1 / 60);
    }
    A.lastT = t;
    // fog bands: ground mist tied to the room bottom + faint drifting haze
    if (A.fogSprite) {
      const fa = A.fog.alpha;
      const yb = Math.round(cache.H - cam.y - 150);
      if (yb < VH + 20 && yb > -220) drawBand(ctx, A.fogSprite, -cam.x * 1.0 - t * 9, yb, fa);
      drawBand(ctx, A.fogSprite, -cam.x * 0.6 + t * 6, Math.round(VH * 0.18 - cam.y * 0.15 % 60), fa * 0.45);
    }
    for (const sys of A.systems) drawSystem(ctx, sys, A, t);
    // splashes
    if (A.splashes.length) {
      ctx.strokeStyle = rgba(cache.pal.particle, 0.55); ctx.lineWidth = 1;
      for (const s of A.splashes) {
        const q = s.t / 0.32, x = s.x - cam.x, y = s.y - cam.y;
        ctx.globalAlpha = 1 - q;
        ctx.beginPath(); ctx.ellipse(x, y, 2 + q * 9, 1 + q * 2.2, 0, Math.PI, TAU); ctx.stroke();
        ctx.beginPath(); ctx.moveTo(x - 2, y - 1); ctx.lineTo(x - 4 - q * 4, y - 3 - q * 7 + q * q * 9); ctx.moveTo(x + 2, y - 1); ctx.lineTo(x + 4 + q * 4, y - 3 - q * 7 + q * q * 9); ctx.stroke();
      }
      ctx.globalAlpha = 1;
    }
    if (A.overlay) ctx.drawImage(A.overlay, 0, 0);
  };
  function drawBand(ctx, spr, ox, y, a) {
    if (a <= 0.003) return;
    ctx.globalAlpha = a;
    let x = Math.round(mod(ox, spr.width)) - spr.width;
    for (; x < VW; x += spr.width) ctx.drawImage(spr, x, y);
    ctx.globalAlpha = 1;
  }
  function drawSystem(ctx, sys, A, t) {
    const k = sys.k, n = sys.n;
    if (k.sprite === 'streak') {
      ctx.strokeStyle = rgba(sys.color, 0.32); ctx.lineWidth = 1.1; ctx.lineCap = 'round';
      ctx.beginPath();
      for (let i = 0; i < n; i++) {
        const x = sys.x[i] - PAD, y = sys.y[i] - PAD, z = sys.z[i];
        const len = 0.022 * z;
        ctx.moveTo(x, y); ctx.lineTo(x - sys.vx[i] * len, y - sys.vy[i] * len);
      }
      ctx.stroke();
      return;
    }
    if (k.additive) ctx.globalCompositeOperation = 'lighter';
    const spr = sys.sprite;
    for (let i = 0; i < n; i++) {
      const x = sys.x[i] - PAD, y = sys.y[i] - PAD;
      if (x < -10 || y < -10 || x > VW + 10 || y > VH + 10) continue;
      let a = sys.a[i];
      if (k.twinkle) a *= 0.55 + 0.45 * Math.sin(t * k.twinkle * (0.7 + sys.z[i] * 0.3) + sys.ph[i]);
      if (k.life) { const q = sys.age[i] / sys.life[i]; a *= Math.min(1, q * 5) * Math.min(1, (1 - q) * 3); }
      if (a <= 0.01) continue;
      const s = sys.s[i] * 2.6;
      ctx.globalAlpha = a;
      ctx.drawImage(spr, x - s / 2, y - s / 2, s, s);
    }
    ctx.globalAlpha = 1;
    if (k.glow) { // a few soft halos on the nearest particles
      for (let i = 0; i < n; i += 3) {
        if (sys.z[i] < 1) continue;
        const x = sys.x[i] - PAD, y = sys.y[i] - PAD;
        if (x < -20 || y < -20 || x > VW + 20 || y > VH + 20) continue;
        Art.glow(ctx, x, y, sys.s[i] * 7, sys.glowColor, 0.18 * k.glow * sys.a[i]);
      }
    }
    if (k.additive) ctx.globalCompositeOperation = 'source-over';
  }
})();
