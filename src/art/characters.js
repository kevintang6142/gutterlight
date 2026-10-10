// src/art/characters.js — shared character drawing helpers (G.Art.char): wax bodies with drips,
// eyes (slit/round/pinprick/ember/hollow, blink), wicks, flames, Pall smoke (stateless wisps and
// stateful trails), outline / rim-light / shaded shapes, verlet cloth & scarves, slash crescents,
// hit sparks, shockwave rings, glows, contact shadows and melt puddles.
// Conventions: x,y are world px (caller's transform); sizes in px; `t` in seconds; nothing here
// allocates per frame except small Path2D objects; no shadowBlur/filter.
(function () {
  'use strict';
  const G = globalThis.G;
  const Art = G.Art;
  const U = Art.util;
  const { clamp, lerp, h01, noise1, mix, rgba, shade, makeCanvas } = U;
  const TAU = Math.PI * 2;

  const COLORS = {
    ivory: '#ece5d2', ivoryShade: '#b5aa92', ivoryHi: '#fffaf0',
    snuffed: '#8f99a8', snuffedShade: '#5d6575', snuffedHi: '#c4ccd8',
    blackWax: '#2b2832', blackShade: '#141218', blackHi: '#5a5466',
    gold: '#f2dc96', goldShade: '#b89a50', goldHi: '#fff8e0',
    outline: '#141218', pall: '#7e879a', scarf: '#5c5e68', scarfShade: '#3c3d46',
    iron: '#3a3a44', brandHot: '#ffb070', eye: '#0d0b10', eyeGlow: '#f4f8ff',
  };

  // ---------------------------------------------------------------------------------------------
  // Generic shape helpers
  /** Outline + fill in one go: the stroke is drawn first at 2×lw so only the outer half shows. */
  function outlineFill(ctx, path, fill, outline, lw) {
    ctx.lineJoin = 'round'; ctx.lineCap = 'round';
    if (lw > 0) { ctx.strokeStyle = outline || COLORS.outline; ctx.lineWidth = lw * 2; ctx.stroke(path); }
    ctx.fillStyle = fill; ctx.fill(path);
  }
  /**
   * Rim light: an inner band along the outline on the lit side, faded out toward the other side
   * with a gradient (no winding tricks, cheap). o: {color, box:[x0,y0,x1,y1], light (-1 left | 1 right),
   * width (px, 2.5), alpha (0.85), top (0..1 extra on upper edges, 0.5)}
   */
  function rim(ctx, path, o) {
    o = o || {};
    const b = o.box;
    if (!b) return;
    const w = o.width || 2.5, L = o.light === undefined ? -1 : o.light;
    const xl = L < 0 ? b[0] : b[2], xr = L < 0 ? b[2] : b[0];
    const g = ctx.createLinearGradient(xl, b[1] - (b[3] - b[1]) * (o.top === undefined ? 0.5 : o.top), xr, b[3]);
    const c = o.color || '#ffffff';
    g.addColorStop(0, rgba(c, 1)); g.addColorStop(0.42, rgba(c, 0.35)); g.addColorStop(0.62, rgba(c, 0));
    ctx.save();
    ctx.clip(path);
    ctx.globalAlpha *= o.alpha === undefined ? 0.85 : o.alpha;
    ctx.strokeStyle = g; ctx.lineWidth = w * 2; ctx.lineJoin = 'round';
    ctx.stroke(path);
    ctx.restore();
  }
  /**
   * Draw a shaded character shape. o: {fill, outline, lw (default 2), light (-1 left | 1 right,
   * default -1), shade (0..1, default 0.35), rim (color|null), rimWidth, hi (highlight alpha), box:[x0,y0,x1,y1]}
   */
  function shape(ctx, path, o) {
    o = o || {};
    const fill = o.fill || COLORS.ivory;
    outlineFill(ctx, path, fill, o.outline, o.lw === undefined ? 2 : o.lw);
    const b = o.box;
    if (b) {
      const L = o.light === undefined ? -1 : o.light;
      ctx.save();
      ctx.clip(path);
      const x0 = L < 0 ? b[0] : b[2], x1 = L < 0 ? b[2] : b[0];
      const g = ctx.createLinearGradient(x0, b[1], x1, b[3]);
      g.addColorStop(0, rgba('#ffffff', o.hi === undefined ? 0.18 : o.hi));
      g.addColorStop(0.45, 'rgba(0,0,0,0)');
      g.addColorStop(1, rgba(o.shadeColor || '#000000', o.shade === undefined ? 0.35 : o.shade));
      ctx.fillStyle = g;
      ctx.fillRect(b[0] - 4, b[1] - 4, b[2] - b[0] + 8, b[3] - b[1] + 8);
      ctx.restore();
    }
    if (o.rim && b) rim(ctx, path, { color: o.rim, box: b, light: o.light, width: o.rimWidth || 2, alpha: o.rimAlpha });
  }

  // ---------------------------------------------------------------------------------------------
  // Wax body: x,y = bottom centre. Returns {top, topW, cx} for placing eyes/wick.
  const VARIANTS = {
    candle: { taper: 0.84, shoulder: 0.32, melt: 0.5 },
    stub: { taper: 0.92, shoulder: 0.25, melt: 0.9 },
    taper: { taper: 0.62, shoulder: 0.4, melt: 0.3 },
    pillar: { taper: 0.97, shoulder: 0.18, melt: 0.6 },
    slumped: { taper: 0.78, shoulder: 0.45, melt: 1.0, sag: 0.18 },
    round: { taper: 0.7, shoulder: 0.5, melt: 0.4, belly: 0.16 },
  };
  /**
   * opts: {variant: candle|stub|taper|pillar|slumped|round, color, shade, hi, outline, lw, drips (0..5),
   *        seed, lean (px top offset), squash (y scale, 1 = normal), light (-1|1), rim (color),
   *        taper, melt (0..1)}
   */
  function waxBody(ctx, x, y, w, h, o) {
    o = o || {};
    const V = VARIANTS[o.variant] || VARIANTS.candle;
    const sq = o.squash || 1;
    const hh = h * sq, ww = w / Math.sqrt(sq);
    const taper = o.taper || V.taper, topW = ww * taper;
    const lean = o.lean || 0, seed = o.seed || 0;
    const sh = Math.min(topW * V.shoulder, hh * 0.4);
    const top = y - hh, melt = (o.melt === undefined ? V.melt : o.melt);
    const L = o.light === undefined ? -1 : o.light;
    const color = o.color || COLORS.ivory;
    const p = new Path2D();
    const belly = (V.belly || 0) * ww, sag = (V.sag || 0) * ww;
    // left side up
    p.moveTo(x - ww / 2, y);
    p.bezierCurveTo(x - ww / 2 - belly - sag, y - hh * 0.35, x - topW / 2 + lean - belly * 0.5, top + sh * 1.6, x - topW / 2 + lean, top + sh);
    p.quadraticCurveTo(x - topW / 2 + lean, top, x - topW / 2 + lean + sh, top);
    // melted rim: a shallow dip with a lip
    const dip = melt * topW * 0.08;
    p.bezierCurveTo(x + lean - topW * 0.2, top + dip, x + lean + topW * 0.2, top + dip * 1.2, x + topW / 2 + lean - sh, top + dip * 0.2);
    p.quadraticCurveTo(x + topW / 2 + lean, top, x + topW / 2 + lean, top + sh);
    p.bezierCurveTo(x + topW / 2 + lean + belly * 0.5, top + sh * 1.6, x + ww / 2 + belly + sag, y - hh * 0.35, x + ww / 2, y);
    p.closePath();
    // drips: rounded runs from the rim. Side drips bulge out of the silhouette (clockwise subpaths so
    // nonzero filling unions them with the body); front drips are drawn later as raised highlights.
    const nd = o.drips === undefined ? 2 : o.drips;
    const front = [];
    for (let i = 0; i < nd; i++) {
      const dl = hh * (0.16 + 0.34 * h01(i, seed, 3)), dw = Math.max(1.6, ww * (0.06 + 0.05 * h01(i, seed, 4)));
      if (i % 2 === 1 || nd === 1) { // side drip
        const side = h01(i, seed, 1) < 0.5 ? -1 : 1;
        const yTop = top + sh * 0.8;
        const tY = clamp((dl + sh * 0.8) / hh, 0, 1);
        const edgeX = (yy) => { const f = clamp((yy - top) / hh, 0, 1); return lerp(topW / 2, ww / 2, f); };
        const dx = x + lean * 0.8 + side * (edgeX(yTop + dl * 0.5) - dw * 0.35);
        const yEnd = yTop + dl;
        p.moveTo(dx + dw, yTop);
        p.lineTo(dx + dw, yEnd - dw);
        p.arc(dx, yEnd - dw, dw, 0, Math.PI, false);
        p.lineTo(dx - dw, yTop);
        p.closePath();
        void tY;
      } else front.push([x + lean * 0.9 + (h01(i, seed, 2) - 0.5) * topW * 0.6, top + 1, dl * 0.8, dw]);
    }
    outlineFill(ctx, p, color, o.outline, o.lw === undefined ? 2 : o.lw);
    // form shading (lit side → shadow side) and bottom occlusion
    ctx.save();
    ctx.clip(p);
    const x0 = x - ww / 2 - 2, x1 = x + ww / 2 + 2;
    const g = ctx.createLinearGradient(L < 0 ? x0 : x1, 0, L < 0 ? x1 : x0, 0);
    g.addColorStop(0, rgba(o.hi || '#ffffff', 0.32));
    g.addColorStop(0.35, rgba(o.hi || '#ffffff', 0.04));
    g.addColorStop(0.62, rgba(o.shade || '#000000', 0.05));
    g.addColorStop(1, rgba(o.shade || '#000000', o.shadeAmt === undefined ? 0.42 : o.shadeAmt));
    ctx.fillStyle = g;
    ctx.fillRect(x0 - 10, top - 4, x1 - x0 + 20, hh + 8);
    const v = ctx.createLinearGradient(0, y - hh * 0.35, 0, y);
    v.addColorStop(0, 'rgba(0,0,0,0)'); v.addColorStop(1, rgba('#000000', 0.22));
    ctx.fillStyle = v; ctx.fillRect(x0 - 10, y - hh * 0.35, x1 - x0 + 20, hh * 0.35 + 2);
    // melt pool at the top
    ctx.fillStyle = rgba(o.shade || '#000000', 0.16);
    ctx.beginPath(); ctx.ellipse(x + lean, top + dip * 0.9 + 1.5, topW * 0.32, Math.max(1.2, topW * 0.06), 0, 0, TAU); ctx.fill();
    // front drips: raised runs (light body, soft shadow under the bead)
    for (const [dx, dy, dl, dw] of front) {
      ctx.fillStyle = rgba('#000000', 0.12);
      ctx.beginPath(); ctx.ellipse(dx + 0.8, dy + dl + 1.2, dw * 1.05, dw * 0.8, 0, 0, TAU); ctx.fill();
      ctx.fillStyle = mix(color, '#ffffff', 0.18);
      ctx.beginPath(); ctx.moveTo(dx - dw * 0.8, dy); ctx.lineTo(dx - dw * 0.8, dy + dl - dw); ctx.arc(dx, dy + dl - dw, dw * 0.85, Math.PI, 0, true); ctx.lineTo(dx + dw * 0.8, dy); ctx.closePath(); ctx.fill();
      ctx.fillStyle = rgba('#ffffff', 0.35);
      ctx.fillRect(dx - dw * 0.45, dy + 1, Math.max(0.8, dw * 0.35), dl * 0.6);
    }
    ctx.restore();
    if (o.rim) rim(ctx, p, { color: o.rim, box: [x0, top, x1, y], light: L, width: o.rimWidth || 1.8, alpha: o.rimAlpha });
    return { top, topW, cx: x + lean, w: ww, h: hh, path: p };
  }

  // ---------------------------------------------------------------------------------------------
  /**
   * Eyes centred at x,y. opts: {kind: slit|round|pinprick|ember|hollow, size (px, default 9), gap (px between
   * centres, default 9), color, blink (0..1), look (px dx), tilt (rad), glow (bool), alpha}
   */
  function eyes(ctx, x, y, o) {
    o = o || {};
    const kind = o.kind || 'slit', s = o.size || 9, gap = o.gap === undefined ? 9 : o.gap;
    const blink = clamp(o.blink || 0, 0, 1), look = o.look || 0, tilt = o.tilt || 0;
    const a = o.alpha === undefined ? 1 : o.alpha;
    const pa = ctx.globalAlpha;
    ctx.globalAlpha = pa * a;
    for (const side of [-1, 1]) {
      const ex = x + side * gap / 2 + look, ey = y;
      ctx.save();
      ctx.translate(ex, ey);
      ctx.rotate(tilt * side);
      if (kind === 'slit' || kind === 'ember') {
        const ew = s * 0.36, eh = Math.max(s * 0.08, s * (1 - blink));
        ctx.fillStyle = o.color || (kind === 'ember' ? '#ff8a3a' : COLORS.eye);
        ctx.beginPath(); ctx.ellipse(0, 0, ew / 2, eh / 2, 0, 0, TAU); ctx.fill();
        if (kind === 'ember' && o.glow !== false) { ctx.restore(); Art.glow(ctx, ex, ey, s * 1.8, o.color || '#ff8a3a', 0.45 * (1 - blink)); continue; }
        if (kind === 'slit' && blink < 0.6 && o.shine !== false) { ctx.fillStyle = rgba('#ffffff', 0.55 * (1 - blink)); ctx.beginPath(); ctx.ellipse(-ew * 0.12, -eh * 0.22, ew * 0.14, eh * 0.12, 0, 0, TAU); ctx.fill(); }
      } else if (kind === 'round') {
        const r = s * 0.32;
        ctx.fillStyle = o.color || COLORS.eye;
        ctx.beginPath(); ctx.ellipse(0, 0, r, Math.max(r * 0.15, r * (1 - blink)), 0, 0, TAU); ctx.fill();
        if (blink < 0.6) { ctx.fillStyle = rgba('#ffffff', 0.6); ctx.beginPath(); ctx.arc(-r * 0.3, -r * 0.3, r * 0.28, 0, TAU); ctx.fill(); }
      } else if (kind === 'pinprick') {
        const r = Math.max(1, s * 0.13) * (1 - blink * 0.8);
        ctx.fillStyle = o.color || COLORS.eyeGlow;
        ctx.beginPath(); ctx.arc(0, 0, r, 0, TAU); ctx.fill();
        ctx.restore();
        if (o.glow !== false) Art.glow(ctx, ex, ey, s * 1.2, o.color || COLORS.eyeGlow, 0.5 * (1 - blink));
        continue;
      } else if (kind === 'hollow') {
        const r = s * 0.38;
        ctx.fillStyle = o.color || COLORS.eye;
        ctx.beginPath(); ctx.ellipse(0, 0, r, Math.max(r * 0.1, r * 1.15 * (1 - blink)), 0, 0, TAU); ctx.fill();
        if (blink < 0.5) { ctx.fillStyle = o.pupil || '#d8d0c0'; ctx.beginPath(); ctx.arc(look * 0.15, r * 0.2, Math.max(0.8, r * 0.18), 0, TAU); ctx.fill(); }
      }
      ctx.restore();
    }
    ctx.globalAlpha = pa;
  }
  /** Natural blink amount for time t (seconds); seed decorrelates characters. */
  function blinkAt(t, seed, every) {
    const per = (every || 3.4) + h01(seed | 0, 3, 9) * 1.6;
    const q = U.fract(t / per + h01(seed | 0, 5, 9));
    const d = 0.13 / per; // blink length (fraction of the period)
    if (q > d) return 0;
    return Math.sin((q / d) * Math.PI);
  }

  /** Wick from the body top (x,y). opts: {len (7), bend (px), width (2), color, ember (glowing tip), curl}. Returns [tipX, tipY]. */
  function wick(ctx, x, y, o) {
    o = o || {};
    const len = o.len === undefined ? 7 : o.len, bend = o.bend || 0, w = o.width || 2.2;
    const tx = x + bend, ty = y - len;
    ctx.strokeStyle = o.color || '#141016'; ctx.lineWidth = w; ctx.lineCap = 'round';
    ctx.beginPath(); ctx.moveTo(x, y + 1); ctx.quadraticCurveTo(x, y - len * 0.6, tx, ty);
    if (o.curl) ctx.quadraticCurveTo(tx + bend * 0.6 + o.curl, ty - 2, tx + o.curl, ty + 1.5);
    ctx.stroke();
    if (o.ember) {
      ctx.fillStyle = '#ff7a30'; ctx.beginPath(); ctx.arc(tx, ty, w * 0.7, 0, TAU); ctx.fill();
      Art.glow(ctx, tx, ty, 8, '#ff7a30', 0.5);
    }
    return [tx, ty];
  }

  // ---------------------------------------------------------------------------------------------
  // Pall smoke
  /** Stateless rising wisps from (x,y). opts: {count 5, color, alpha 0.35, height 60, spread 14, size 6, speed 0.5, seed, drift (px/s sideways)} */
  function pallSmoke(ctx, x, y, t, o) {
    o = o || {};
    const n = o.count || 5, col = o.color || COLORS.pall, H = o.height || 60, sp = o.spread || 14, sz = o.size || 6;
    const spr = Art.dotSprite(col);
    const pa = ctx.globalAlpha;
    for (let i = 0; i < n; i++) {
      const ph = U.fract(t * (o.speed || 0.5) + i / n + (o.seed || 0) * 0.137);
      const px = x + Math.sin(ph * 3 + i * 2.1 + (o.seed || 0)) * sp * ph + (o.drift || 0) * ph;
      const py = y - ph * H;
      const r = sz * (0.6 + ph * 1.8);
      ctx.globalAlpha = pa * (o.alpha === undefined ? 0.35 : o.alpha) * Math.sin(ph * Math.PI);
      ctx.drawImage(spr, px - r, py - r, r * 2, r * 2);
    }
    ctx.globalAlpha = pa;
  }
  /** Stateful smoke trail (for moving bodies): create(max), emit(tr, x, y, opts), update(tr, dt), draw(ctx, tr). */
  const smokeTrail = {
    create(max) { const n = max || 24; return { n, i: 0, x: new Float32Array(n), y: new Float32Array(n), vx: new Float32Array(n), vy: new Float32Array(n), age: new Float32Array(n).fill(9), life: new Float32Array(n), r: new Float32Array(n), color: COLORS.pall, alpha: 0.35 }; },
    emit(tr, x, y, o) {
      o = o || {};
      const k = tr.i; tr.i = (tr.i + 1) % tr.n;
      tr.x[k] = x + (Math.random() - 0.5) * (o.jitter || 4); tr.y[k] = y;
      tr.vx[k] = (o.vx || 0) + (Math.random() - 0.5) * 12; tr.vy[k] = -(o.rise === undefined ? 24 : o.rise) - Math.random() * 10;
      tr.age[k] = 0; tr.life[k] = o.life || 1.2; tr.r[k] = o.size || 5;
      if (o.color) tr.color = o.color; if (o.alpha !== undefined) tr.alpha = o.alpha;
    },
    update(tr, dt) { for (let k = 0; k < tr.n; k++) { if (tr.age[k] >= tr.life[k]) continue; tr.age[k] += dt; tr.x[k] += tr.vx[k] * dt; tr.y[k] += tr.vy[k] * dt; tr.vx[k] *= 0.97; } },
    draw(ctx, tr) {
      const spr = Art.dotSprite(tr.color), pa = ctx.globalAlpha;
      for (let k = 0; k < tr.n; k++) {
        if (tr.age[k] >= tr.life[k]) continue;
        const q = tr.age[k] / tr.life[k], r = tr.r[k] * (0.7 + q * 2);
        ctx.globalAlpha = pa * tr.alpha * Math.sin(Math.min(1, q * 1.2) * Math.PI);
        ctx.drawImage(spr, tr.x[k] - r, tr.y[k] - r, r * 2, r * 2);
      }
      ctx.globalAlpha = pa;
    },
  };

  // ---------------------------------------------------------------------------------------------
  // Verlet cloth / scarf
  const cloth = {
    /** n segments of segLen px. */
    create(n, segLen) {
      const k = (n || 4) + 1;
      return { n: k, seg: segLen || 8, x: new Float32Array(k), y: new Float32Array(k), px: new Float32Array(k), py: new Float32Array(k), init: false };
    },
    /** Anchor at (ax, ay). opts: {gravity 520, wind (px/s² sideways), damping 0.9, iterations 3, lift (up bias)} */
    update(c, ax, ay, dt, o) {
      o = o || {};
      dt = clamp(dt || 1 / 60, 0, 1 / 30);
      if (!c.init) { for (let i = 0; i < c.n; i++) { c.x[i] = c.px[i] = ax; c.y[i] = c.py[i] = ay + i * c.seg; } c.init = true; }
      const gx = (o.wind || 0), gy = (o.gravity === undefined ? 520 : o.gravity) - (o.lift || 0), damp = o.damping === undefined ? 0.9 : o.damping;
      c.x[0] = c.px[0] = ax; c.y[0] = c.py[0] = ay;
      for (let i = 1; i < c.n; i++) {
        const vx = (c.x[i] - c.px[i]) * damp, vy = (c.y[i] - c.py[i]) * damp;
        c.px[i] = c.x[i]; c.py[i] = c.y[i];
        c.x[i] += vx + gx * dt * dt; c.y[i] += vy + gy * dt * dt;
      }
      const it = o.iterations || 3;
      for (let k = 0; k < it; k++) {
        for (let i = 1; i < c.n; i++) {
          const dx = c.x[i] - c.x[i - 1], dy = c.y[i] - c.y[i - 1];
          const d = Math.hypot(dx, dy) || 1e-4, diff = (d - c.seg) / d;
          if (i === 1) { c.x[i] -= dx * diff; c.y[i] -= dy * diff; }
          else { c.x[i] -= dx * diff * 0.5; c.y[i] -= dy * diff * 0.5; c.x[i - 1] += dx * diff * 0.5; c.y[i - 1] += dy * diff * 0.5; }
        }
        c.x[0] = ax; c.y[0] = ay;
      }
    },
    /** Teleport (e.g. on room change) so the cloth does not stretch across the screen. */
    reset(c) { c.init = false; },
    /** opts: {width 10, tip 0.55 (tip width ratio), color, shade, outline, lw 2, tatter true, wave (px, 1.2)} */
    draw(ctx, c, o) {
      if (!c.init) return;
      o = o || {};
      const n = c.n, W = o.width || 10, tip = o.tip === undefined ? 0.55 : o.tip, wave = o.wave === undefined ? 1.2 : o.wave;
      const lx = [], ly = [], rx = [], ry = [];
      for (let i = 0; i < n; i++) {
        const a = Math.max(0, i - 1), b = Math.min(n - 1, i + 1);
        let tx = c.x[b] - c.x[a], ty = c.y[b] - c.y[a];
        const tl = Math.hypot(tx, ty) || 1; tx /= tl; ty /= tl;
        const f = i / (n - 1);
        const w = (W / 2) * lerp(1, tip, f) * (1 + Math.sin(i * 2.3) * 0.12 * f);
        const wv = Math.sin(i * 1.7 + c.x[i] * 0.05) * wave * f;
        lx.push(c.x[i] - ty * (w + wv)); ly.push(c.y[i] + tx * (w + wv));
        rx.push(c.x[i] + ty * (w - wv)); ry.push(c.y[i] - tx * (w - wv));
      }
      const p = new Path2D();
      p.moveTo(lx[0], ly[0]);
      for (let i = 1; i < n; i++) p.lineTo(lx[i], ly[i]);
      if (o.tatter !== false) { // ragged end: three uneven tails
        const ex = c.x[n - 1], ey = c.y[n - 1];
        const dx = c.x[n - 1] - c.x[n - 2], dy = c.y[n - 1] - c.y[n - 2], dl = Math.hypot(dx, dy) || 1;
        const fx = dx / dl, fy = dy / dl, hw = (W / 2) * tip;
        const px = -fy, py = fx; // across
        p.lineTo(ex + fx * 7 + px * hw * 0.9, ey + fy * 7 + py * hw * 0.9);
        p.lineTo(ex + fx * 2 + px * hw * 0.3, ey + fy * 2 + py * hw * 0.3);
        p.lineTo(ex + fx * 9 - px * hw * 0.05, ey + fy * 9 - py * hw * 0.05);
        p.lineTo(ex + fx * 1.5 - px * hw * 0.45, ey + fy * 1.5 - py * hw * 0.45);
        p.lineTo(ex + fx * 5 - px * hw * 1.0, ey + fy * 5 - py * hw * 1.0);
      }
      for (let i = n - 1; i >= 0; i--) p.lineTo(rx[i], ry[i]);
      p.closePath();
      outlineFill(ctx, p, o.color || COLORS.scarf, o.outline, o.lw === undefined ? 2 : o.lw);
      if (o.shade !== false) { // fold shading along the length
        ctx.save(); ctx.clip(p);
        ctx.strokeStyle = rgba(o.shadeColor || '#000000', 0.25); ctx.lineWidth = Math.max(1, W * 0.28);
        ctx.beginPath(); ctx.moveTo(c.x[0], c.y[0]); for (let i = 1; i < n; i++) ctx.lineTo((c.x[i] + rx[i]) / 2, (c.y[i] + ry[i]) / 2); ctx.stroke();
        ctx.strokeStyle = rgba('#ffffff', 0.12); ctx.lineWidth = Math.max(1, W * 0.15);
        ctx.beginPath(); ctx.moveTo((c.x[0] + lx[0]) / 2, (c.y[0] + ly[0]) / 2); for (let i = 1; i < n; i++) ctx.lineTo((c.x[i] + lx[i]) / 2, (c.y[i] + ly[i]) / 2); ctx.stroke();
        ctx.restore();
      }
    },
  };

  // ---------------------------------------------------------------------------------------------
  // Effects
  /**
   * Slash crescent around (x,y): radius r, centred on `angle` (rad; 0 = right, -PI/2 = up), progress p 0..1.
   * opts: {arc (rad, 2.5), width (px, 14), color ('#8fd8ff'), core ('#ffffff'), alpha 1, flip (bool: sweep direction)}
   */
  function slash(ctx, x, y, r, angle, p, o) {
    o = o || {};
    p = clamp(p, 0, 1);
    const arc = o.arc || 2.5, W = o.width || 14;
    const grow = clamp(p / 0.32, 0, 1), fade = p < 0.45 ? 1 : 1 - (p - 0.45) / 0.55;
    if (fade <= 0) return;
    const dir = o.flip ? -1 : 1;
    const a0 = angle - (arc / 2) * dir, span = arc * grow;
    const n = 18;
    const build = (thick, shrink) => {
      const path = new Path2D();
      for (let i = 0; i <= n; i++) {
        const s = i / n, a = a0 + span * s * dir;
        const ox = x + Math.cos(a) * r, oy = y + Math.sin(a) * r;
        if (i === 0) path.moveTo(ox, oy); else path.lineTo(ox, oy);
      }
      for (let i = n; i >= 0; i--) {
        const s = i / n, a = a0 + span * s * dir, th = thick * Math.pow(Math.sin(Math.PI * (0.08 + 0.84 * s)), 0.8) * (0.3 + 0.7 * s) * shrink;
        path.lineTo(x + Math.cos(a) * (r - th), y + Math.sin(a) * (r - th));
      }
      path.closePath();
      return path;
    };
    const pa = ctx.globalAlpha, po = ctx.globalCompositeOperation;
    const A = (o.alpha === undefined ? 1 : o.alpha) * fade;
    ctx.globalCompositeOperation = 'lighter';
    ctx.globalAlpha = pa * A * 0.5;
    ctx.fillStyle = o.color || '#6ec8ff';
    ctx.fill(build(W * 1.5, 1));
    ctx.globalCompositeOperation = po;
    ctx.globalAlpha = pa * A;
    ctx.fillStyle = o.color || '#8fd8ff';
    ctx.fill(build(W, 1 - p * 0.4));
    ctx.fillStyle = o.core || '#ffffff';
    ctx.fill(build(W * 0.5, 1 - p * 0.6));
    ctx.globalAlpha = pa;
  }
  /** Hit spark burst at (x,y), progress p 0..1. opts: {size 26, color '#ffffff', tint '#9ad8ff', rays 7, seed, angle (bias)} */
  function hitSpark(ctx, x, y, p, o) {
    o = o || {};
    p = clamp(p, 0, 1);
    if (p >= 1) return;
    const s = o.size || 26, n = o.rays || 7, seed = o.seed || 0;
    const pa = ctx.globalAlpha, po = ctx.globalCompositeOperation;
    ctx.globalCompositeOperation = 'lighter';
    Art.glow(ctx, x, y, s * (1.2 + p), o.tint || '#9ad8ff', 0.6 * (1 - p));
    ctx.globalAlpha = pa * (1 - p * p);
    ctx.strokeStyle = o.color || '#ffffff'; ctx.lineCap = 'round';
    for (let i = 0; i < n; i++) {
      const a = (i / n) * TAU + h01(i, seed, 1) * 0.8 + (o.angle || 0);
      const L = s * (0.5 + 0.7 * h01(i, seed, 2)) * (0.4 + p * 0.9);
      const r0 = s * 0.15 + p * s * 0.5;
      ctx.lineWidth = Math.max(0.8, 3.2 * (1 - p));
      ctx.beginPath(); ctx.moveTo(x + Math.cos(a) * r0, y + Math.sin(a) * r0); ctx.lineTo(x + Math.cos(a) * (r0 + L), y + Math.sin(a) * (r0 + L)); ctx.stroke();
    }
    ctx.fillStyle = o.color || '#ffffff';
    ctx.beginPath(); ctx.arc(x, y, s * 0.28 * (1 - p), 0, TAU); ctx.fill();
    ctx.globalAlpha = pa; ctx.globalCompositeOperation = po;
  }
  /** Shockwave ring. r = final radius; p 0..1. opts: {width 6, color '#cfe8ff', alpha 1, fill (inner flash alpha)} */
  function ring(ctx, x, y, r, p, o) {
    o = o || {};
    p = clamp(p, 0, 1);
    if (p >= 1) return;
    const e = 1 - Math.pow(1 - p, 3);
    const rr = Math.max(0.5, r * e), w = (o.width || 6) * (1 - p * 0.8);
    const pa = ctx.globalAlpha, po = ctx.globalCompositeOperation;
    ctx.globalCompositeOperation = 'lighter';
    ctx.globalAlpha = pa * (o.alpha === undefined ? 1 : o.alpha) * (1 - p);
    ctx.strokeStyle = o.color || '#cfe8ff'; ctx.lineWidth = w;
    ctx.beginPath(); ctx.ellipse(x, y, rr, rr * (o.squash || 1), 0, 0, TAU); ctx.stroke();
    ctx.globalAlpha = pa * 0.35 * (1 - p);
    ctx.lineWidth = w * 3;
    ctx.stroke();
    if (o.fill) { ctx.globalAlpha = pa * o.fill * (1 - p) * (1 - p); ctx.fillStyle = o.color || '#cfe8ff'; ctx.fill(); }
    ctx.globalAlpha = pa; ctx.globalCompositeOperation = po;
  }
  let shadowSpr = null;
  /** Soft contact shadow ellipse under feet at (x,y), half-width w. */
  function shadow(ctx, x, y, w, alpha) {
    if (!shadowSpr) {
      const mc = makeCanvas(64, 32), g = mc.ctx.createRadialGradient(32, 16, 0, 32, 16, 32);
      g.addColorStop(0, 'rgba(0,0,0,0.7)'); g.addColorStop(0.6, 'rgba(0,0,0,0.3)'); g.addColorStop(1, 'rgba(0,0,0,0)');
      mc.ctx.fillStyle = g; mc.ctx.save(); mc.ctx.scale(1, 0.5); mc.ctx.fillRect(0, 0, 64, 64); mc.ctx.restore();
      shadowSpr = mc.canvas;
    }
    const pa = ctx.globalAlpha;
    ctx.globalAlpha = pa * (alpha === undefined ? 0.6 : alpha);
    ctx.drawImage(shadowSpr, x - w * 1.3, y - w * 0.32, w * 2.6, w * 0.64);
    ctx.globalAlpha = pa;
  }
  /** Melt puddle (death): grows with p 0..1 at (x,y) floor point. opts: {color, w (max half-width, 24), wick (bool)} */
  function puddle(ctx, x, y, p, o) {
    o = o || {};
    p = clamp(p, 0, 1);
    const w = (o.w || 24) * (0.35 + 0.65 * (1 - Math.pow(1 - p, 2))), h = Math.max(1.5, w * 0.18);
    const c = o.color || COLORS.ivory;
    const path = new Path2D();
    path.ellipse(x, y - h * 0.4, w, h, 0, 0, TAU);
    outlineFill(ctx, path, c, o.outline, 1.5);
    ctx.fillStyle = rgba('#ffffff', 0.35); ctx.beginPath(); ctx.ellipse(x - w * 0.3, y - h * 0.7, w * 0.35, h * 0.3, 0, 0, TAU); ctx.fill();
    if (o.wick) { ctx.strokeStyle = '#141016'; ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(x + w * 0.1, y - h * 0.5); ctx.quadraticCurveTo(x + w * 0.3, y - h * 0.5 - 4, x + w * 0.4, y - h * 0.4); ctx.stroke(); }
  }
  /** A falling wax droplet (for drip-trailing bodies). */
  function drip(ctx, x, y, len, o) {
    o = o || {};
    ctx.fillStyle = o.color || COLORS.ivory;
    ctx.beginPath(); ctx.moveTo(x - 2, y); ctx.quadraticCurveTo(x - 2.4, y + len * 0.7, x, y + len); ctx.quadraticCurveTo(x + 2.4, y + len * 0.7, x + 2, y); ctx.closePath(); ctx.fill();
  }

  /**
   * Convenience: a complete standing waxen (body + eyes + wick + flame) at feet x,y (body h px).
   * opts: waxBody opts + {eyes: eyes opts | false, flame: kind | null, flameSize, wickLen, t, facing (1|-1), lit}
   */
  function waxen(ctx, x, y, w, h, o, t) {
    o = o || {};
    const facing = o.facing || 1;
    const b = waxBody(ctx, x, y, w, h, Object.assign({ light: -facing }, o));
    if (o.eyes !== false) {
      const eo = Object.assign({ kind: 'slit', size: w * 0.34, gap: w * 0.34, blink: blinkAt(t || 0, o.seed || 0) }, o.eyes || {});
      eyes(ctx, b.cx + facing * w * 0.06, b.top + b.h * 0.28, eo);
    }
    const tip = wick(ctx, b.cx, b.top + 2, { len: o.wickLen === undefined ? Math.max(4, h * 0.14) : o.wickLen, bend: -facing * 1.2, ember: o.ember });
    if (o.flame && o.lit !== false) Art.flame(ctx, tip[0], tip[1] + 1, o.flameSize || Math.max(8, h * 0.42), o.flame, t || 0, o.seed || 0);
    return b;
  }

  Art.char = {
    COLORS, VARIANTS,
    waxBody, eyes, blinkAt, wick, waxen,
    flame: (...a) => Art.flame(...a),
    glow: (...a) => Art.glow(...a),
    pallSmoke, smokeTrail, cloth,
    outlineFill, rim, shape,
    slash, hitSpark, ring, shadow, puddle, drip,
  };
})();
