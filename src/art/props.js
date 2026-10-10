// src/art/props.js — decor prop catalog (G.Art.drawDecorProp, G.Art.propInfo, G.Art.defineProp)
// and the procedural decor placer (Art.Decor: per-room deterministic placement from tile context,
// back/front layers, sway & flicker animation, static lights).
(function () {
  'use strict';
  const G = globalThis.G;
  const Art = G.Art;
  const U = Art.util;
  const { clamp, lerp, h01, hashInt, noise1, mix, rgba, shade, makeCanvas } = U;
  const T = Art.TILE;
  const TAU = Math.PI * 2;
  const { EMPTY, SOLID, GLAZED, PLATFORM, SPIKES, WATER, LAVA, BREAKABLE, DIVEFLOOR, BGWALL } = Art.TC;

  // =============================================================================================
  // Drawing helpers (local frame: anchor at 0,0; y up is negative)
  const OUT = 'rgba(10,8,12,0.92)';
  function poly(pts) { const p = new Path2D(); p.moveTo(pts[0], pts[1]); for (let i = 2; i < pts.length; i += 2) p.lineTo(pts[i], pts[i + 1]); p.closePath(); return p; }
  function rrect(x, y, w, h, r) {
    const p = new Path2D(); r = Math.min(r, w / 2, h / 2);
    p.moveTo(x + r, y); p.lineTo(x + w - r, y); p.quadraticCurveTo(x + w, y, x + w, y + r); p.lineTo(x + w, y + h - r);
    p.quadraticCurveTo(x + w, y + h, x + w - r, y + h); p.lineTo(x + r, y + h); p.quadraticCurveTo(x, y + h, x, y + h - r);
    p.lineTo(x, y + r); p.quadraticCurveTo(x, y, x + r, y); p.closePath(); return p;
  }
  function ellipseP(cx, cy, rx, ry, rot) { const p = new Path2D(); p.ellipse(cx, cy, rx, ry, rot || 0, 0, TAU); return p; }
  /** Fill with lit (upper-left) / shadow (lower-right) form shading and a dark outline. */
  function shaded(ctx, path, base, box, o) {
    o = o || {};
    ctx.fillStyle = base; ctx.fill(path);
    if (box) {
      ctx.save(); ctx.clip(path);
      const g = ctx.createLinearGradient(box[0], box[1], box[2], box[3]);
      g.addColorStop(0, rgba('#ffffff', o.light === undefined ? 0.14 : o.light));
      g.addColorStop(0.45, 'rgba(0,0,0,0)');
      g.addColorStop(1, rgba('#000000', o.shadow === undefined ? 0.4 : o.shadow));
      ctx.fillStyle = g; ctx.fillRect(Math.min(box[0], box[2]) - 200, Math.min(box[1], box[3]) - 200, 600, 600);
      ctx.restore();
    }
    if (o.outline !== false) { ctx.strokeStyle = o.oc || OUT; ctx.lineWidth = o.lw || 1.6; ctx.lineJoin = 'round'; ctx.stroke(path); }
  }
  function line(ctx, pts, color, w) {
    ctx.strokeStyle = color; ctx.lineWidth = w || 1.5; ctx.lineCap = 'round'; ctx.lineJoin = 'round';
    ctx.beginPath(); ctx.moveTo(pts[0], pts[1]); for (let i = 2; i < pts.length; i += 2) ctx.lineTo(pts[i], pts[i + 1]); ctx.stroke();
  }
  function chainLinks(ctx, x, y0, y1, color, link) {
    link = link || 8;
    ctx.strokeStyle = OUT; ctx.lineWidth = 3.2;
    for (let y = y0, i = 0; y < y1 - 1; y += link * 0.8, i++) { ctx.beginPath(); if (i % 2) { ctx.moveTo(x, y); ctx.lineTo(x, y + link); } else ctx.ellipse(x, y + link / 2, link * 0.3, link / 2, 0, 0, TAU); ctx.stroke(); }
    ctx.strokeStyle = color; ctx.lineWidth = 1.6;
    for (let y = y0, i = 0; y < y1 - 1; y += link * 0.8, i++) { ctx.beginPath(); if (i % 2) { ctx.moveTo(x, y); ctx.lineTo(x, y + link); } else ctx.ellipse(x, y + link / 2, link * 0.3, link / 2, 0, 0, TAU); ctx.stroke(); }
  }
  /** Melted candle (static body); returns the wick-tip position. */
  function candle(ctx, x, yb, w, h, o, R) {
    const m = o.mat;
    const body = new Path2D();
    body.moveTo(x - w / 2, yb); body.lineTo(x - w / 2, yb - h + w * 0.25);
    body.quadraticCurveTo(x - w / 2, yb - h - w * 0.05, x - w * 0.15, yb - h);
    body.lineTo(x + w * 0.2, yb - h + w * 0.12); body.quadraticCurveTo(x + w / 2, yb - h + w * 0.1, x + w / 2, yb - h + w * 0.35);
    body.lineTo(x + w / 2, yb); body.closePath();
    shaded(ctx, body, o.waxColor || m.wax, [x - w, yb - h, x + w, yb], { lw: 1.2, light: 0.2, shadow: 0.35 });
    const nd = R ? Math.floor(R.range(0, 2.5)) : 1;
    ctx.fillStyle = o.waxColor || m.wax;
    for (let k = 0; k < nd; k++) {
      const dx = x + (R ? R.range(-0.4, 0.4) : 0.2) * w, dl = (R ? R.range(0.15, 0.5) : 0.3) * h;
      ctx.beginPath(); ctx.ellipse(dx, yb - h + dl * 0.55, Math.max(1, w * 0.13), dl * 0.5, 0, 0, TAU); ctx.fill();
    }
    ctx.strokeStyle = '#120e0c'; ctx.lineWidth = Math.max(1, w * 0.12);
    ctx.beginPath(); ctx.moveTo(x, yb - h + 1); ctx.quadraticCurveTo(x + 1, yb - h - 3, x + 0.5, yb - h - Math.max(4, w * 0.5)); ctx.stroke();
    return [x + 0.5, yb - h - Math.max(4, w * 0.5)];
  }
  function flameAt(ctx, o, t, x, y, size, i) {
    if (!o.lit) { // snuffed: a curl of pale smoke
      ctx.strokeStyle = rgba('#b0b0b8', 0.25); ctx.lineWidth = 1;
      const s = Math.sin(t * 1.3 + i) * 2;
      ctx.beginPath(); ctx.moveTo(x, y); ctx.bezierCurveTo(x + 3 + s, y - 6, x - 3 - s, y - 10, x + s, y - 16); ctx.stroke();
      return;
    }
    Art.flame(ctx, x, y + 1, size, o.flame, t, (o.seed % 97) + i * 7.3);
  }
  Art.propHelpers = { poly, rrect, ellipseP, shaded, line, chainLinks, candle, OUT };

  // =============================================================================================
  // Catalog
  const PROPS = Object.create(null);
  /** Register a prop. def: {size:[w,h] tiles, anchor:'bottom'|'top', bounds:[x0,y0,x1,y1] px,
   *  regions, desc, opts, draw(ctx,o,R), anim?(ctx,o,t), light?(o)→[{dx,dy,r,color,intensity,flicker}],
   *  sway?:{amp,speed}, lit?:bool (default lit state), flame?:kind} */
  Art.defineProp = function (kind, def) { PROPS[kind] = Object.assign({ anchor: 'bottom', size: [1, 1], bounds: [-30, -60, 30, 4] }, def); };
  const boundsOf = (def, o) => (typeof def.bounds === 'function' ? def.bounds(o) : def.bounds);
  Art.propKinds = () => Object.keys(PROPS);
  Art.propInfo = function (kind) {
    const d = PROPS[kind];
    if (!d) return null;
    return { kind, size: d.size.slice(), anchor: d.anchor, regions: (d.regions || []).slice(), desc: d.desc || '', opts: d.opts || '', lit: !!d.lit, light: !!d.light };
  };
  const P = Art.defineProp;

  P('statue_waxen', { size: [2, 4], bounds: [-46, -168, 46, 4], regions: ['shore', 'guttered', 'nave', 'meltbloom', 'sanctum'], desc: 'Robed waxen statue on a plinth, staff raised; melted at the shoulders.', opts: 'variant 0..2 (0 staff, 1 praying, 2 headless), material "stone"|"wax"|"gold"',
    draw(ctx, o, R) {
      const m = o.mat, c = o.material === 'gold' ? m.gold : o.material === 'wax' ? m.waxShade : m.stone;
      shaded(ctx, rrect(-40, -26, 80, 26, 3), m.stoneDark, [-40, -26, 40, 0]);
      shaded(ctx, rrect(-34, -34, 68, 10, 2), m.stone, [-34, -34, 34, -24]);
      const robe = new Path2D();
      robe.moveTo(-28, -34); robe.quadraticCurveTo(-26, -90, -17, -118); robe.quadraticCurveTo(0, -128, 17, -118); robe.quadraticCurveTo(26, -90, 28, -34); robe.closePath();
      shaded(ctx, robe, c, [-28, -128, 28, -34]);
      ctx.strokeStyle = rgba('#000000', 0.3); ctx.lineWidth = 1.4;
      for (const x of [-12, 0, 11]) { ctx.beginPath(); ctx.moveTo(x, -40); ctx.quadraticCurveTo(x + 2, -80, x * 0.5, -112); ctx.stroke(); }
      if (o.variant !== 2) {
        shaded(ctx, ellipseP(0, -132, 13, 17), c, [-13, -149, 13, -115]);
        ctx.fillStyle = '#0c0a0c'; ctx.fillRect(-6, -138, 3, 9); ctx.fillRect(3, -138, 3, 9);
        line(ctx, [0, -148, 1, -156], '#14100e', 2);
        for (let k = 0; k < 3; k++) { const dx = R.range(-11, 11); ctx.fillStyle = c; ctx.beginPath(); ctx.ellipse(dx, -122 + R.range(0, 6), 2, R.range(4, 9), 0, 0, TAU); ctx.fill(); }
      } else {
        ctx.fillStyle = shade(c, -0.25); ctx.beginPath(); ctx.moveTo(-14, -117); ctx.lineTo(-6, -124); ctx.lineTo(2, -119); ctx.lineTo(9, -126); ctx.lineTo(15, -117); ctx.closePath(); ctx.fill();
      }
      if (o.variant === 0) { shaded(ctx, rrect(24, -160, 5, 128, 2), m.iron, [24, -160, 29, -30], { lw: 1.2 }); shaded(ctx, ellipseP(26.5, -162, 7, 7), m.iron, [20, -169, 33, -155]); }
      else if (o.variant === 1) { shaded(ctx, ellipseP(0, -88, 11, 14), shade(c, 0.08), [-11, -102, 11, -74], { lw: 1.2 }); }
    } });

  P('banner', { anchor: 'top', size: [1, 3], bounds: (o) => [-22, -4, 22, (o.len || 110) + 4], regions: ['guttered', 'nave', 'lastlight', 'sanctum'], sway: { amp: 0.035, speed: 0.9 }, desc: 'Hanging cloth banner on a rod with a candle-flame sigil; tattered hem.', opts: 'len (px, default 110), color (hex), torn (bool)',
    draw(ctx, o, R) {
      const m = o.mat, len = o.len || 110, c = o.color || m.cloth;
      shaded(ctx, rrect(-22, -3, 44, 6, 3), m.woodDark, [-22, -3, 22, 3], { lw: 1.2 });
      const cl = new Path2D();
      cl.moveTo(-17, 2); cl.lineTo(17, 2); cl.lineTo(17, len - 14);
      const n = 5;
      for (let i = 0; i <= n; i++) { const x = 17 - (34 * i) / n; cl.lineTo(x, len - (i % 2 ? 2 : 16) - (o.torn ? R.range(0, 18) : 0)); }
      cl.lineTo(-17, len - 14); cl.closePath();
      shaded(ctx, cl, c, [-17, 0, 17, len], { light: 0.1, shadow: 0.45 });
      ctx.strokeStyle = rgba(m.gold, 0.85); ctx.lineWidth = 1.4;
      ctx.strokeRect(-12, 8, 24, len * 0.55);
      const cx = 0, cy = 8 + len * 0.3;
      ctx.fillStyle = rgba(m.gold, 0.9);
      ctx.beginPath(); ctx.moveTo(cx, cy - 14); ctx.bezierCurveTo(cx + 9, cy - 4, cx + 6, cy + 6, cx, cy + 8); ctx.bezierCurveTo(cx - 6, cy + 6, cx - 9, cy - 4, cx, cy - 14); ctx.fill();
      ctx.fillStyle = rgba(c, 1); ctx.beginPath(); ctx.ellipse(cx, cy + 2, 2.5, 4, 0, 0, TAU); ctx.fill();
    } });

  P('bell_great', { anchor: 'top', size: [3, 3], bounds: (o) => [-62, -4, 62, (o.len || 0) + 126], regions: ['nave', 'guttered'], sway: { amp: 0.012, speed: 0.5 }, desc: 'Colossal bronze bell on a yoke with a heavy clapper (the Bell-Warden\'s motif).', opts: 'len (chain px above the yoke, default 0)',
    draw(ctx, o) {
      const m = o.mat, top = o.len || 0, bronze = mix(m.gold, m.rust, 0.45);
      if (top) chainLinks(ctx, 0, 0, top, m.iron, 12);
      shaded(ctx, rrect(-30, top - 2, 60, 12, 4), m.woodDark, [-30, top, 30, top + 10]);
      const b = new Path2D();
      b.moveTo(-14, top + 10); b.quadraticCurveTo(-32, top + 18, -38, top + 64); b.quadraticCurveTo(-42, top + 92, -58, top + 104);
      b.lineTo(58, top + 104); b.quadraticCurveTo(42, top + 92, 38, top + 64); b.quadraticCurveTo(32, top + 18, 14, top + 10); b.closePath();
      shaded(ctx, b, bronze, [-58, top, 58, top + 104], { light: 0.2, shadow: 0.5 });
      ctx.strokeStyle = rgba(m.goldLight, 0.5); ctx.lineWidth = 2;
      for (const y of [top + 40, top + 88]) { ctx.beginPath(); ctx.moveTo(-36 - (y - top - 40) * 0.3, y); ctx.lineTo(36 + (y - top - 40) * 0.3, y); ctx.stroke(); }
      shaded(ctx, ellipseP(0, top + 114, 9, 9), m.iron, [-9, top + 105, 9, top + 123]);
      line(ctx, [0, top + 98, 0, top + 106], m.iron, 4);
    } });

  P('bell_small', { anchor: 'top', size: [1, 1.2], bounds: (o) => [-17, -2, 17, (o.len || 16) + 40], regions: ['nave', 'lastlight', 'guttered'], sway: { amp: 0.08, speed: 1.6 }, desc: 'Small hand bell on a short chain.', opts: 'len (chain px, default 16)',
    draw(ctx, o) {
      const m = o.mat, len = o.len || 16, bronze = mix(m.gold, m.rust, 0.3);
      chainLinks(ctx, 0, 0, len, m.iron, 7);
      const b = new Path2D();
      b.moveTo(-5, len); b.quadraticCurveTo(-12, len + 6, -12, len + 20); b.quadraticCurveTo(-13, len + 27, -16, len + 30); b.lineTo(16, len + 30); b.quadraticCurveTo(13, len + 27, 12, len + 20); b.quadraticCurveTo(12, len + 6, 5, len); b.closePath();
      shaded(ctx, b, bronze, [-16, len, 16, len + 30], { light: 0.25, shadow: 0.5 });
      shaded(ctx, ellipseP(0, len + 34, 3.5, 3.5), m.iron, null);
    } });

  P('brazier', { size: [1, 1.6], bounds: [-26, -60, 26, 4], lit: true, flame: 'orange', regions: ['lastlight', 'guttered', 'flue', 'chandlery', 'nave'], desc: 'Iron fire bowl on a tripod; burning coals and a tall flame.', opts: 'lit (default true), flame kind',
    draw(ctx, o) {
      const m = o.mat;
      for (const [x0, x1] of [[-18, -6], [18, 6], [0, 0]]) line(ctx, [x0, 0, x1, -34], OUT, 5), line(ctx, [x0, 0, x1, -34], m.iron, 3);
      const bowl = new Path2D();
      bowl.moveTo(-24, -52); bowl.lineTo(24, -52); bowl.quadraticCurveTo(20, -32, 0, -32); bowl.quadraticCurveTo(-20, -32, -24, -52); bowl.closePath();
      shaded(ctx, bowl, m.iron, [-24, -52, 24, -32], { light: 0.22 });
      ctx.fillStyle = shade(m.ironLight, 0.1); ctx.fillRect(-25, -54, 50, 3);
      if (o.lit) { ctx.fillStyle = '#ff7a2a'; for (let i = -3; i <= 3; i++) { ctx.beginPath(); ctx.arc(i * 6, -53, 3.2, 0, TAU); ctx.fill(); } }
      else { ctx.fillStyle = '#2a2420'; for (let i = -3; i <= 3; i++) { ctx.beginPath(); ctx.arc(i * 6, -53, 3, 0, TAU); ctx.fill(); } }
    },
    anim(ctx, o, t) {
      if (!o.lit) return;
      Art.flame(ctx, -7, -53, 26, o.flame, t, o.seed % 31);
      Art.flame(ctx, 7, -53, 22, o.flame, t + 0.37, (o.seed % 31) + 5);
      Art.flame(ctx, 0, -54, 34, o.flame, t + 0.71, (o.seed % 31) + 9);
    },
    light(o) { return o.lit ? [{ dx: 0, dy: -70, r: 300, color: Art.FLAMES[o.flame].glow, intensity: 0.95, flicker: true }] : []; } });

  P('candelabra', { size: [1, 2], bounds: [-30, -92, 30, 4], lit: true, flame: 'orange', regions: ['nave', 'sanctum', 'lastlight', 'guttered'], desc: 'Three-armed standing candelabrum with melting candles.', opts: 'lit, flame, material "iron"|"gold"',
    draw(ctx, o, R) {
      const m = o.mat, metal = o.material === 'gold' ? m.gold : m.iron;
      shaded(ctx, poly([-14, 0, 14, 0, 6, -8, -6, -8]), metal, [-14, -8, 14, 0]);
      shaded(ctx, rrect(-2.5, -66, 5, 60, 2), metal, [-2.5, -66, 2.5, -6], { lw: 1.2 });
      ctx.strokeStyle = OUT; ctx.lineWidth = 5; ctx.beginPath(); ctx.moveTo(-24, -58); ctx.quadraticCurveTo(-22, -46, 0, -46); ctx.quadraticCurveTo(22, -46, 24, -58); ctx.stroke();
      ctx.strokeStyle = metal; ctx.lineWidth = 3; ctx.stroke();
      for (const x of [-24, 0, 24]) shaded(ctx, rrect(x - 6, x ? -62 : -70, 12, 5, 2), metal, null, { lw: 1 });
      o._tips = [candle(ctx, -24, -61, 7, 14 + R.range(0, 8), o, R), candle(ctx, 0, -69, 8, 18 + R.range(0, 6), o, R), candle(ctx, 24, -61, 7, 12 + R.range(0, 8), o, R)];
    },
    anim(ctx, o, t) { const tips = o._tips || []; for (let i = 0; i < tips.length; i++) flameAt(ctx, o, t, tips[i][0], tips[i][1], 12, i); },
    light(o) { return o.lit ? [{ dx: 0, dy: -86, r: 220, color: Art.FLAMES[o.flame].glow, intensity: 0.8, flicker: true }] : []; } });

  P('candle_cluster', { size: [1, 0.7], bounds: [-26, -40, 26, 4], lit: true, flame: 'orange', regions: ['guttered', 'lastlight', 'nave', 'shore', 'chandlery', 'sanctum'], desc: 'A puddle of fused candles of varied heights; some lit.', opts: 'lit (all), count (3..6)',
    draw(ctx, o, R) {
      const m = o.mat, n = o.count || R.int(3, 5);
      shaded(ctx, ellipseP(0, -2, 25, 5), m.waxShade, [-25, -7, 25, 3], { lw: 1.2 });
      const tips = [];
      for (let i = 0; i < n; i++) {
        const x = lerp(-17, 17, n === 1 ? 0.5 : i / (n - 1)) + R.range(-3, 3);
        tips.push(candle(ctx, x, -2, R.range(5, 8), R.range(8, 30), o, R));
      }
      o._tips = tips;
      o._litMask = tips.map(() => R.chance(0.75));
    },
    anim(ctx, o, t) { const tips = o._tips || []; for (let i = 0; i < tips.length; i++) { if (o.lit && o._litMask && !o._litMask[i]) continue; flameAt(ctx, o, t, tips[i][0], tips[i][1], 10, i); } },
    light(o) { return o.lit ? [{ dx: 0, dy: -30, r: 170, color: Art.FLAMES[o.flame].glow, intensity: 0.75, flicker: true }] : []; } });

  P('sconce_dead', { size: [0.6, 1.4], bounds: [-18, -62, 18, 4], lit: false, flame: 'orange', regions: ['guttered', 'nave', 'shore', 'rime'], desc: 'A street sconce post with a snuffed candle (the Guttered Ways\' rows of dead lights).', opts: 'lit (default false — a lit one is a rare sign of life)',
    draw(ctx, o, R) {
      const m = o.mat;
      shaded(ctx, rrect(-2.5, -46, 5, 46, 2), m.iron, [-3, -46, 3, 0], { lw: 1.2 });
      shaded(ctx, poly([-10, 0, 10, 0, 6, -5, -6, -5]), m.iron, null);
      shaded(ctx, poly([-14, -48, 14, -48, 8, -40, -8, -40]), m.iron, [-14, -48, 14, -40]);
      o._tips = [candle(ctx, 0, -48, 8, R.range(6, 12), o, R)];
    },
    anim(ctx, o, t) { const tp = o._tips && o._tips[0]; if (tp) flameAt(ctx, o, t, tp[0], tp[1], 11, 0); },
    light(o) { return o.lit ? [{ dx: 0, dy: -60, r: 160, color: Art.FLAMES[o.flame].glow, intensity: 0.7, flicker: true }] : []; } });

  P('cage_hanging', { anchor: 'top', size: [1, 2], bounds: (o) => [-23, -2, 23, (o.len || 30) + 66], regions: ['guttered', 'flue', 'chandlery', 'mothwood', 'sanctum'], sway: { amp: 0.05, speed: 0.7 }, desc: 'Domed birdcage on a chain; empty, or holding a dim ember.', opts: 'len (chain px, default 30), ember (bool)',
    draw(ctx, o) {
      const m = o.mat, len = o.len || 30, metal = o.material === 'gold' ? m.gold : m.iron;
      chainLinks(ctx, 0, 0, len, metal, 8);
      const top = len, bot = len + 58;
      ctx.lineWidth = 3.2; ctx.strokeStyle = OUT;
      const bars = () => { for (let i = -3; i <= 3; i++) { ctx.beginPath(); ctx.moveTo(i * 2.2, top + 4); ctx.quadraticCurveTo(i * 6.5, top + 8, i * 5.5, bot); ctx.stroke(); } };
      bars(); ctx.lineWidth = 1.5; ctx.strokeStyle = metal; bars();
      shaded(ctx, ellipseP(0, top + 4, 6, 4), metal, null, { lw: 1 });
      shaded(ctx, rrect(-21, bot - 2, 42, 6, 2), metal, [-21, bot - 2, 21, bot + 4]);
      shaded(ctx, rrect(-19, top + 22, 38, 3, 1), metal, null, { lw: 1 });
      if (o.ember) { ctx.fillStyle = '#ffb060'; ctx.beginPath(); ctx.arc(0, bot - 8, 3, 0, TAU); ctx.fill(); }
    },
    anim(ctx, o, t) { if (o.ember) Art.glow(ctx, 0, (o.len || 30) + 50, 20, '#ff9a40', 0.5 + 0.2 * Math.sin(t * 3)); } });

  P('chain', { anchor: 'top', size: [0.3, 3], bounds: (o) => [-9, -2, 9, (o.len || 120) + 6], regions: ['guttered', 'flue', 'chandlery', 'nave', 'sanctum'], sway: { amp: 0.03, speed: 0.6 }, desc: 'A hanging iron chain, optionally ending in a hook.', opts: 'len (px, default 120), hook (bool)',
    draw(ctx, o) {
      const m = o.mat, len = o.len || 120;
      chainLinks(ctx, 0, 0, len - (o.hook ? 10 : 0), o.material === 'gold' ? m.gold : m.iron, 10);
      if (o.hook) { ctx.strokeStyle = OUT; ctx.lineWidth = 4.5; ctx.beginPath(); ctx.arc(0, len - 4, 6, -Math.PI / 2, Math.PI * 0.9); ctx.stroke(); ctx.strokeStyle = m.iron; ctx.lineWidth = 2.5; ctx.stroke(); }
    } });

  P('cocoon', { anchor: 'top', size: [1, 2], bounds: (o) => [-17, -2, 17, (o.len || 22) + 66], regions: ['mothwood'], sway: { amp: 0.06, speed: 0.55 }, desc: 'Silk cocoon hanging from a thread; a faint violet pulse inside.', opts: 'len (thread px, default 22), glow (bool, default true)',
    draw(ctx, o) {
      const m = o.mat, len = o.len || 22;
      line(ctx, [0, 0, 0, len + 4], rgba(m.silk, 0.7), 1.2);
      const c = new Path2D();
      c.moveTo(0, len); c.bezierCurveTo(16, len + 6, 16, len + 50, 2, len + 62); c.bezierCurveTo(-14, len + 50, -15, len + 8, 0, len);
      shaded(ctx, c, mix(m.silk, '#3a3048', 0.35), [-15, len, 15, len + 62], { light: 0.25 });
      ctx.strokeStyle = rgba(m.silk, 0.55); ctx.lineWidth = 1;
      for (let k = 0; k < 6; k++) { const y = len + 8 + k * 9; ctx.beginPath(); ctx.moveTo(-12 + k * 0.5, y); ctx.quadraticCurveTo(0, y + 5, 12 - k, y - 2); ctx.stroke(); }
    },
    anim(ctx, o, t) { if (o.glow !== false) Art.glow(ctx, 0, (o.len || 22) + 32, 22, '#b07aff', 0.32 + 0.18 * Math.sin(t * 1.7 + o.seed)); },
    light(o) { return o.glow !== false ? [{ dx: 0, dy: (o.len || 22) + 32, r: 110, color: '#a070ff', intensity: 0.4, flicker: false }] : []; } });

  P('mold_stack', { size: [1.2, 1.2], bounds: [-28, -50, 28, 4], regions: ['chandlery', 'lastlight'], desc: 'Stacked iron candle molds, wax-splattered.', opts: '-',
    draw(ctx, o, R) {
      const m = o.mat;
      const rows = [[-20, -14, 3], [-14, -28, 2], [-8, -42, 1]];
      for (const [x0, y, n] of rows) for (let i = 0; i < n; i++) {
        const x = x0 + i * 14;
        shaded(ctx, rrect(x - 0.5, y, 13, 14, 2), m.iron, [x, y, x + 13, y + 14], { lw: 1.2 });
        ctx.fillStyle = m.wax; ctx.beginPath(); ctx.ellipse(x + 6, y + 2, 4.2, 1.6, 0, 0, TAU); ctx.fill();
      }
      ctx.fillStyle = m.wax;
      for (let k = 0; k < 5; k++) { ctx.beginPath(); ctx.ellipse(R.range(-20, 20), R.range(-40, -2), 1.5, R.range(2, 5), 0, 0, TAU); ctx.fill(); }
    } });

  P('vat', { size: [3, 2.5], bounds: [-64, -104, 64, 4], lit: true, regions: ['chandlery', 'flue'], desc: 'Great iron vat of molten wax with a glowing rim, riveted bands and a spout.', opts: 'lit (molten glow, default true)',
    draw(ctx, o) {
      const m = o.mat;
      for (const x of [-42, 42]) shaded(ctx, rrect(x - 6, -20, 12, 20, 2), m.iron, null);
      const v = new Path2D();
      v.moveTo(-52, -16); v.quadraticCurveTo(-62, -60, -56, -92); v.lineTo(56, -92); v.quadraticCurveTo(62, -60, 52, -16); v.quadraticCurveTo(0, -6, -52, -16); v.closePath();
      shaded(ctx, v, m.iron, [-60, -92, 60, -10], { light: 0.18, shadow: 0.5 });
      ctx.strokeStyle = rgba(m.ironLight, 0.6); ctx.lineWidth = 3;
      for (const y of [-74, -40]) { ctx.beginPath(); ctx.moveTo(-58, y); ctx.quadraticCurveTo(0, y + 6, 58, y); ctx.stroke(); }
      ctx.fillStyle = rgba(m.ironLight, 0.8);
      for (let x = -48; x <= 48; x += 16) for (const y of [-74, -40]) { ctx.beginPath(); ctx.arc(x, y + 2 - Math.abs(x) * 0.02, 1.8, 0, TAU); ctx.fill(); }
      shaded(ctx, rrect(-62, -98, 124, 10, 4), m.iron, [-62, -98, 62, -88]);
      shaded(ctx, poly([56, -86, 74, -80, 72, -74, 54, -76]), m.iron, null);
      if (o.lit) { ctx.fillStyle = '#ffd070'; ctx.fillRect(-56, -99, 112, 3); ctx.fillStyle = '#ff9a30'; ctx.beginPath(); ctx.ellipse(73, -72, 2.5, 6, 0, 0, TAU); ctx.fill(); }
    },
    anim(ctx, o, t) { if (!o.lit) return; Art.glow(ctx, 0, -100, 80, '#ff9a30', 0.45 + 0.08 * Math.sin(t * 2.3)); Art.glow(ctx, 73, -66, 16, '#ffb040', 0.5); },
    light(o) { return o.lit ? [{ dx: 0, dy: -110, r: 280, color: '#ff9030', intensity: 0.9, flicker: true }] : []; } });

  P('pipe_v', { size: [0.8, 4], bounds: (o) => [-20, -(o.len || 160) - 4, 26, 4], regions: ['flue', 'chandlery'], desc: 'Vertical iron pipe with flanges and a valve wheel; leaks a little steam.', opts: 'len (px, default 160), steam (bool)',
    draw(ctx, o) {
      const m = o.mat, len = o.len || 160;
      shaded(ctx, rrect(-11, -len, 22, len, 3), m.iron, [-11, -len, 11, 0], { light: 0.2 });
      for (let y = -len + 10; y < -4; y += 52) shaded(ctx, rrect(-15, y, 30, 7, 2), m.iron, [-15, y, 15, y + 7]);
      ctx.strokeStyle = OUT; ctx.lineWidth = 5; ctx.beginPath(); ctx.arc(14, -len * 0.45, 9, 0, TAU); ctx.stroke();
      ctx.strokeStyle = m.rust; ctx.lineWidth = 2.5; ctx.stroke();
      line(ctx, [5, -len * 0.45, 23, -len * 0.45], m.rust, 2); line(ctx, [14, -len * 0.45 - 9, 14, -len * 0.45 + 9], m.rust, 2);
    },
    anim(ctx, o, t) {
      if (!o.steam) return;
      for (let i = 0; i < 4; i++) { const q = U.fract(t * 0.5 + i / 4); ctx.fillStyle = rgba('#c8c8d0', 0.22 * (1 - q)); ctx.beginPath(); ctx.arc(-14 - q * 20, -(o.len || 160) * 0.7 - q * 30, 4 + q * 10, 0, TAU); ctx.fill(); }
    } });

  P('crystal', { size: [1.2, 1.5], bounds: [-30, -66, 30, 4], regions: ['sanctum', 'rime', 'mothwood'], desc: 'Cluster of faceted crystals with an inner glow.', opts: 'color (hex), glow (default true)',
    draw(ctx, o, R) {
      const m = o.mat, c = o.color || m.crystal;
      const shards = [[-14, 30, -0.35, 9], [0, 58, 0.05, 12], [14, 40, 0.3, 9], [-24, 18, -0.6, 6], [24, 20, 0.6, 6]];
      for (const [x, h, a, w] of shards) {
        const tx = x + Math.sin(a) * h, ty = -Math.cos(a) * h;
        const sh = new Path2D();
        sh.moveTo(x - w, 0); sh.lineTo(x - w * 0.9 + Math.sin(a) * h * 0.7, ty * 0.7); sh.lineTo(tx, ty); sh.lineTo(x + w * 0.9 + Math.sin(a) * h * 0.7, ty * 0.72); sh.lineTo(x + w, 0); sh.closePath();
        shaded(ctx, sh, mix(c, '#000000', 0.15), [x - w, ty, x + w, 0], { light: 0.35, shadow: 0.45, lw: 1.2 });
        ctx.fillStyle = rgba('#ffffff', 0.45);
        ctx.beginPath(); ctx.moveTo(x - w * 0.1, 0); ctx.lineTo(tx, ty); ctx.lineTo(x - w * 0.55 + Math.sin(a) * h * 0.7, ty * 0.7); ctx.closePath(); ctx.fill();
      }
    },
    anim(ctx, o, t) { if (o.glow !== false) Art.glow(ctx, 0, -30, 46, o.color || o.mat.crystal, 0.3 + 0.08 * Math.sin(t * 1.3 + o.seed)); },
    light(o) { return o.glow !== false ? [{ dx: 0, dy: -30, r: 150, color: o.color || o.mat.crystal, intensity: 0.55, flicker: false }] : []; } });

  P('frozen_waxen', { size: [1.5, 2.5], bounds: [-36, -104, 36, 4], regions: ['rime'], desc: 'A waxen frozen mid-step inside a block of ice; its wick is dark.', opts: 'variant 0..1 (pose)',
    draw(ctx, o) {
      const m = o.mat;
      const body = new Path2D();
      body.moveTo(-12, -8); body.lineTo(-14, -52); body.quadraticCurveTo(-14, -66, 0, -68); body.quadraticCurveTo(14, -66, 14, -52); body.lineTo(12, -8); body.closePath();
      shaded(ctx, body, mix(m.wax, '#9ab0c0', 0.4), [-14, -68, 14, -8]);
      ctx.fillStyle = '#10141a'; ctx.fillRect(-6, -58, 3, 8); ctx.fillRect(3, -58, 3, 8);
      line(ctx, [0, -68, -2, -76], '#141820', 2);
      if (o.variant === 1) line(ctx, [12, -46, 26, -62], mix(m.wax, '#9ab0c0', 0.4), 6);
      const ice = new Path2D();
      ice.moveTo(-34, 0); ice.lineTo(-30, -70); ice.lineTo(-12, -100); ice.lineTo(16, -94); ice.lineTo(32, -60); ice.lineTo(34, 0); ice.closePath();
      ctx.fillStyle = rgba(m.ice, 0.42); ctx.fill(ice);
      ctx.save(); ctx.clip(ice);
      ctx.fillStyle = rgba('#ffffff', 0.25); ctx.beginPath(); ctx.moveTo(-30, -70); ctx.lineTo(-12, -100); ctx.lineTo(-4, -96); ctx.lineTo(-22, -10); ctx.lineTo(-30, -10); ctx.closePath(); ctx.fill();
      ctx.restore();
      ctx.strokeStyle = rgba('#e8f8ff', 0.8); ctx.lineWidth = 1.5; ctx.stroke(ice);
      ctx.strokeStyle = rgba('#ffffff', 0.35); ctx.lineWidth = 1;
      ctx.beginPath(); ctx.moveTo(-10, -86); ctx.lineTo(4, -60); ctx.lineTo(-2, -40); ctx.moveTo(18, -70); ctx.lineTo(10, -50); ctx.stroke();
    } });

  P('stained_window', { size: [2, 4], bounds: [-42, -170, 42, 4], lit: true, regions: ['nave', 'sanctum'], desc: 'Tall lancet window of pale-gold stained glass depicting a flame; glows.', opts: 'lit (default true), color (glass hex)',
    draw(ctx, o) {
      const m = o.mat, glass = o.color || m.glass;
      const fr = new Path2D();
      fr.moveTo(-40, 0); fr.lineTo(-40, -110); fr.quadraticCurveTo(-40, -164, 0, -170); fr.quadraticCurveTo(40, -164, 40, -110); fr.lineTo(40, 0); fr.closePath();
      shaded(ctx, fr, m.stoneDark, [-40, -170, 40, 0]);
      const gl = new Path2D();
      gl.moveTo(-30, -8); gl.lineTo(-30, -108); gl.quadraticCurveTo(-30, -152, 0, -158); gl.quadraticCurveTo(30, -152, 30, -108); gl.lineTo(30, -8); gl.closePath();
      const g = ctx.createLinearGradient(0, -158, 0, -8);
      g.addColorStop(0, o.lit ? shade(glass, 0.35) : mix(glass, '#000000', 0.6)); g.addColorStop(1, o.lit ? mix(glass, '#000000', 0.25) : mix(glass, '#000000', 0.75));
      ctx.fillStyle = g; ctx.fill(gl);
      ctx.save(); ctx.clip(gl);
      const cols = [mix(glass, '#d06040', 0.4), mix(glass, '#4a80b0', 0.5), mix(glass, '#ffffff', 0.3), mix(glass, '#6a9a50', 0.4)];
      for (let y = -150, k = 0; y < -8; y += 22, k++) for (let x = -30, j = 0; x < 30; x += 15, j++) { ctx.fillStyle = rgba(cols[(k + j * 3) % 4], 0.35); ctx.fillRect(x, y, 15, 22); }
      ctx.fillStyle = rgba('#fff6d0', o.lit ? 0.85 : 0.3);
      ctx.beginPath(); ctx.moveTo(0, -128); ctx.bezierCurveTo(14, -104, 10, -84, 0, -76); ctx.bezierCurveTo(-10, -84, -14, -104, 0, -128); ctx.fill();
      ctx.restore();
      ctx.strokeStyle = OUT; ctx.lineWidth = 2;
      ctx.beginPath(); for (let y = -136; y < -8; y += 22) { ctx.moveTo(-30, y); ctx.lineTo(30, y); } ctx.moveTo(-15, -150); ctx.lineTo(-15, -8); ctx.moveTo(15, -150); ctx.lineTo(15, -8); ctx.stroke();
      ctx.lineWidth = 3; ctx.stroke(gl);
    },
    anim(ctx, o, t) { if (o.lit) Art.glow(ctx, 0, -90, 90, o.color || o.mat.glass, 0.18 + 0.04 * Math.sin(t * 0.8 + o.seed)); },
    light(o) { return o.lit ? [{ dx: 0, dy: -90, r: 260, color: o.color || o.mat.glass, intensity: 0.6, flicker: false }] : []; } });

  P('lamp_post', { size: [0.6, 3], bounds: (o) => [-16, -(o.h || 118) - 8, 16, 4], lit: true, flame: 'orange', regions: ['lastlight', 'shore', 'flue', 'nave', 'rime'], desc: 'Iron lamp post with a caged candle lantern.', opts: 'lit (default true), flame, h (px, default 118)',
    draw(ctx, o) {
      const m = o.mat, h = o.h || 118;
      shaded(ctx, poly([-10, 0, 10, 0, 5, -10, -5, -10]), m.iron, null);
      shaded(ctx, rrect(-2.5, -h + 18, 5, h - 26, 2), m.iron, [-3, -h, 3, 0], { lw: 1.2 });
      const top = -h;
      shaded(ctx, poly([-12, top + 4, 12, top + 4, 8, top - 4, -8, top - 4]), m.iron, null);
      ctx.fillStyle = o.lit ? rgba('#ffd890', 0.85) : rgba('#3a3530', 0.9);
      ctx.fillRect(-9, top + 4, 18, 18);
      ctx.strokeStyle = OUT; ctx.lineWidth = 2; ctx.strokeRect(-9, top + 4, 18, 18);
      ctx.strokeStyle = m.iron; ctx.lineWidth = 1.2; ctx.beginPath(); ctx.moveTo(0, top + 4); ctx.lineTo(0, top + 22); ctx.stroke();
      shaded(ctx, poly([-11, top + 22, 11, top + 22, 7, top + 27, -7, top + 27]), m.iron, null);
    },
    anim(ctx, o, t) { if (o.lit) { const h = o.h || 118; Art.flame(ctx, 0, -h + 20, 9, o.flame, t, o.seed % 41, { glow: 0.6 }); Art.glow(ctx, 0, -h + 12, 40, Art.FLAMES[o.flame].glow, 0.35); } },
    light(o) { return o.lit ? [{ dx: 0, dy: -(o.h || 118) + 12, r: 240, color: Art.FLAMES[o.flame].glow, intensity: 0.85, flicker: true }] : []; } });

  P('house_stub', { size: [3, 4], bounds: [-66, -176, 66, 4], lit: true, regions: ['lastlight'], desc: 'A candle-stub house: a squat melted candle hollowed into a home, with a snuffer-cap roof and warm windows.', opts: 'lit (windows, default true), variant 0..2',
    draw(ctx, o, R) {
      const m = o.mat, wax = mix(m.wax, m.waxShade, 0.35);
      const w = 108, h = 112 + (o.variant || 0) * 14;
      const b = new Path2D();
      b.moveTo(-w / 2, 0); b.lineTo(-w / 2, -h + 10);
      for (let i = 0; i <= 8; i++) b.lineTo(-w / 2 + (w * i) / 8, -h + (i % 2 ? 4 : -2) + R.range(-3, 3));
      b.lineTo(w / 2, 0); b.closePath();
      shaded(ctx, b, wax, [-w / 2, -h, w / 2, 0], { light: 0.18, shadow: 0.45 });
      ctx.fillStyle = wax;
      for (let k = 0; k < 4; k++) { const x = R.range(-w / 2 + 6, w / 2 - 6), dl = R.range(14, 40); ctx.beginPath(); ctx.ellipse(x, -h + dl / 2 + 2, 3.5, dl / 2, 0, 0, TAU); ctx.fill(); }
      const roof = new Path2D();
      const lean = R.range(-10, 10);
      roof.moveTo(-w / 2 - 12, -h + 4); roof.quadraticCurveTo(lean * 0.5, -h - 30, lean, -h - 62); roof.quadraticCurveTo(lean * 0.5 + 6, -h - 26, w / 2 + 12, -h + 4); roof.closePath();
      shaded(ctx, roof, m.iron, [-w / 2, -h - 62, w / 2, -h], { light: 0.16 });
      shaded(ctx, rrect(20, -h - 44, 10, 26, 2), m.stoneDark, null);
      const win = (x, y, ww, hh) => {
        const p = new Path2D(); p.moveTo(x - ww / 2, y + hh / 2); p.lineTo(x - ww / 2, y - hh / 2 + ww / 2); p.arc(x, y - hh / 2 + ww / 2, ww / 2, Math.PI, 0); p.lineTo(x + ww / 2, y + hh / 2); p.closePath();
        ctx.fillStyle = o.lit ? '#ffc46a' : '#2a2018'; ctx.fill(p);
        if (o.lit) { ctx.fillStyle = rgba('#fff0c0', 0.6); ctx.fillRect(x - ww / 2 + 2, y - 2, ww - 4, hh / 2); }
        ctx.strokeStyle = OUT; ctx.lineWidth = 2.5; ctx.stroke(p);
        ctx.fillStyle = OUT; ctx.fillRect(x - 1, y - hh / 2, 2, hh); ctx.fillRect(x - ww / 2, y, ww, 2);
      };
      win(-22, -h * 0.55, 20, 28);
      if (R.chance(0.6)) win(24, -h * 0.72, 16, 22);
      const door = new Path2D();
      door.moveTo(8, 0); door.lineTo(8, -34); door.arc(22, -34, 14, Math.PI, 0); door.lineTo(36, 0); door.closePath();
      shaded(ctx, door, m.woodDark, [8, -48, 36, 0]);
      ctx.fillStyle = m.gold; ctx.beginPath(); ctx.arc(31, -20, 1.8, 0, TAU); ctx.fill();
      o._win = [[-22, -h * 0.55]];
    },
    anim(ctx, o, t) { if (o.lit) Art.glow(ctx, -22, -(112 + (o.variant || 0) * 14) * 0.55, 46, '#ffaa50', 0.3 + 0.06 * noise1(t * 2 + o.seed, 3)); },
    light(o) { return o.lit ? [{ dx: -22, dy: -(112 + (o.variant || 0) * 14) * 0.55, r: 200, color: '#ffaa50', intensity: 0.7, flicker: true }] : []; } });

  P('well_frame', { size: [3, 3], bounds: [-64, -124, 64, 4], regions: ['lastlight', 'shore'], desc: 'A stone well with a wooden crossbeam, crank and a hanging bucket (the Well down to the Guttered Ways).', opts: '-',
    draw(ctx, o) {
      const m = o.mat;
      shaded(ctx, rrect(-58, -40, 116, 40, 6), m.stone, [-58, -40, 58, 0]);
      ctx.strokeStyle = rgba('#000000', 0.35); ctx.lineWidth = 1.2;
      for (let y = -28; y < 0; y += 13) { ctx.beginPath(); ctx.moveTo(-56, y); ctx.lineTo(56, y); ctx.stroke(); }
      for (let x = -44, i = 0; x < 58; x += 22, i++) { ctx.beginPath(); ctx.moveTo(x + (i % 2) * 11, -40); ctx.lineTo(x + (i % 2) * 11, 0); ctx.stroke(); }
      shaded(ctx, rrect(-62, -46, 124, 8, 3), m.stoneLight, [-62, -46, 62, -38]);
      for (const x of [-50, 50]) shaded(ctx, rrect(x - 5, -118, 10, 74, 2), m.wood, [x - 5, -118, x + 5, -44]);
      shaded(ctx, rrect(-58, -120, 116, 9, 3), m.woodDark, [-58, -120, 58, -111]);
      line(ctx, [0, -111, 0, -74], rgba(m.woodLight, 0.9), 1.4);
      shaded(ctx, poly([-9, -74, 9, -74, 7, -60, -7, -60]), m.wood, null, { lw: 1.2 });
      line(ctx, [50, -96, 64, -96, 64, -86], m.iron, 2.5);
    } });

  P('signpost', { size: [1, 2], bounds: [-36, -84, 36, 4], regions: ['shore', 'lastlight', 'guttered', 'rime'], desc: 'Leaning wooden signpost with two arrow boards (blank runes).', opts: '-',
    draw(ctx, o, R) {
      const m = o.mat;
      ctx.save(); ctx.rotate(R.range(-0.06, 0.06));
      shaded(ctx, rrect(-3.5, -80, 7, 80, 2), m.wood, [-4, -80, 4, 0]);
      const b1 = poly([-4, -74, 30, -74, 36, -66, 30, -58, -4, -58]), b2 = poly([4, -50, -28, -50, -34, -42, -28, -34, 4, -34]);
      shaded(ctx, b1, m.wood, [-4, -74, 36, -58]); shaded(ctx, b2, m.wood, [-34, -50, 4, -34]);
      ctx.fillStyle = rgba('#000000', 0.45);
      for (let k = 0; k < 4; k++) { ctx.fillRect(4 + k * 6, -69, 3, 6); ctx.fillRect(-24 + k * 6, -45, 3, 6); }
      ctx.restore();
    } });

  P('wick_grave', { size: [0.8, 1.2], bounds: [-20, -52, 20, 4], regions: ['shore', 'guttered', 'rime', 'mothwood'], desc: 'Grave marker of the waxen: a stone slab with a snuffed iron wick-stake.', opts: 'variant 0..1',
    draw(ctx, o, R) {
      const m = o.mat;
      ctx.save(); ctx.rotate(R.range(-0.08, 0.08));
      if (o.variant === 1) {
        shaded(ctx, rrect(-2, -48, 4, 48, 1), m.iron, null, { lw: 1.2 });
        shaded(ctx, poly([-9, -42, 9, -42, 0, -30]), m.iron, null, { lw: 1.2 });
        ctx.fillStyle = m.waxShade; ctx.beginPath(); ctx.ellipse(0, -1, 14, 4, 0, 0, TAU); ctx.fill();
      } else {
        const s = new Path2D(); s.moveTo(-14, 0); s.lineTo(-14, -30); s.quadraticCurveTo(-14, -44, 0, -44); s.quadraticCurveTo(14, -44, 14, -30); s.lineTo(14, 0); s.closePath();
        shaded(ctx, s, m.stone, [-14, -44, 14, 0]);
        ctx.strokeStyle = rgba('#000000', 0.5); ctx.lineWidth = 1.6;
        ctx.beginPath(); ctx.moveTo(0, -36); ctx.lineTo(0, -14); ctx.moveTo(-6, -26); ctx.bezierCurveTo(-2, -34, 2, -34, 6, -26); ctx.stroke();
      }
      ctx.restore();
    } });

  P('flower_giant', { size: [2, 5], bounds: (o) => [-92, -(o.h || 190) - 72, 92, 4], lit: true, regions: ['meltbloom'], sway: { amp: 0.02, speed: 0.5, pivot: 'bottom' }, desc: 'Giant wax flower on a curved stem; its heart glows gold.', opts: 'lit (heart glow), h (px, default 190)',
    draw(ctx, o, R) {
      const m = o.mat, h = o.h || 190, lean = R.range(-24, 24);
      const fx = lean, fy = -h;
      ctx.strokeStyle = OUT; ctx.lineWidth = 9; ctx.lineCap = 'round';
      ctx.beginPath(); ctx.moveTo(0, 0); ctx.bezierCurveTo(0, -h * 0.4, fx - lean * 0.6, fy + h * 0.3, fx, fy + 10); ctx.stroke();
      ctx.strokeStyle = m.leaf; ctx.lineWidth = 6; ctx.stroke();
      for (const [t, d] of [[0.28, -1], [0.5, 1]]) {
        const lx = lean * t * 0.6, ly = -h * t;
        const lf = new Path2D(); lf.moveTo(lx, ly); lf.quadraticCurveTo(lx + d * 30, ly - 28, lx + d * 52, ly - 6); lf.quadraticCurveTo(lx + d * 24, ly + 4, lx, ly);
        shaded(ctx, lf, m.leaf, [lx, ly - 28, lx + d * 52, ly + 4], { lw: 1.4 });
      }
      const petals = 7;
      for (let i = 0; i < petals; i++) {
        const a = -Math.PI / 2 + (i - (petals - 1) / 2) * 0.42;
        ctx.save(); ctx.translate(fx, fy); ctx.rotate(a + Math.PI / 2);
        const p = new Path2D(); p.moveTo(0, 0); p.bezierCurveTo(-24, -14, -20, -56, 0, -64); p.bezierCurveTo(20, -56, 24, -14, 0, 0);
        shaded(ctx, p, i % 2 ? m.wax : shade(m.wax, -0.08), [-24, -64, 24, 0], { light: 0.2, shadow: 0.3 });
        ctx.strokeStyle = rgba(m.waxShade, 0.6); ctx.lineWidth = 1; ctx.beginPath(); ctx.moveTo(0, -6); ctx.lineTo(0, -54); ctx.stroke();
        ctx.restore();
      }
      shaded(ctx, ellipseP(fx, fy - 4, 13, 11), o.lit ? '#ffd860' : m.waxShade, null, { lw: 1.4 });
      o._heart = [fx, fy - 4];
    },
    anim(ctx, o, t) { if (o.lit && o._heart) Art.glow(ctx, o._heart[0], o._heart[1], 60, '#ffd060', 0.42 + 0.1 * Math.sin(t * 1.4 + o.seed)); },
    light(o) { return o.lit ? [{ dx: 0, dy: -(o.h || 190), r: 220, color: '#ffd060', intensity: 0.7, flicker: false }] : []; } });

  P('vine_curtain', { anchor: 'top', size: [2, 3], bounds: (o) => [-52, -2, 52, (o.len || 120) + 10], regions: ['meltbloom', 'mothwood', 'nave'], sway: { amp: 0.03, speed: 0.7 }, desc: 'A curtain of hanging vines with leaves (silk strands in the Mothwood).', opts: 'len (px, default 120), silk (bool)',
    draw(ctx, o, R) {
      const m = o.mat, len = o.len || 120, c = o.silk ? rgba(m.silk, 0.7) : m.leaf;
      for (let i = 0; i < 9; i++) {
        const x = -40 + i * 10 + R.range(-3, 3), l = len * R.range(0.45, 1), sw = R.range(-10, 10);
        ctx.strokeStyle = OUT; ctx.lineWidth = o.silk ? 1.6 : 3.2; ctx.beginPath(); ctx.moveTo(x, 0); ctx.bezierCurveTo(x + sw, l * 0.3, x - sw, l * 0.7, x + sw * 0.4, l); ctx.stroke();
        ctx.strokeStyle = c; ctx.lineWidth = o.silk ? 0.8 : 1.8; ctx.stroke();
        if (!o.silk) for (let k = 0; k < 5; k++) {
          const t = R.range(0.15, 1), lx = x + sw * 0.25 * t, ly = l * t, d = R.chance(0.5) ? 1 : -1;
          shaded(ctx, ellipseP(lx + d * 5, ly, 6, 2.6, d * 0.6), k % 2 ? m.leaf : m.leafLight, null, { lw: 1 });
        } else if (R.chance(0.5)) { ctx.fillStyle = rgba('#e0d8ff', 0.7); ctx.beginPath(); ctx.arc(x + sw * 0.4, l + 2, 1.8, 0, TAU); ctx.fill(); }
      }
      shaded(ctx, ellipseP(0, 2, 44, 7), o.silk ? rgba(m.silk, 0.6) : m.leaf, null, { lw: 1.2 });
    } });

  P('anvil', { size: [1.2, 1], bounds: [-32, -42, 32, 4], regions: ['lastlight', 'chandlery', 'flue'], desc: 'Smith\'s anvil on a tree-stump block.', opts: '-',
    draw(ctx, o) {
      const m = o.mat;
      shaded(ctx, poly([-16, 0, 16, 0, 13, -20, -13, -20]), m.woodDark, [-16, -20, 16, 0]);
      ctx.strokeStyle = rgba('#000000', 0.35); ctx.lineWidth = 1; ctx.beginPath(); ctx.ellipse(0, -20, 12, 2.5, 0, 0, TAU); ctx.stroke();
      const a = new Path2D();
      a.moveTo(-28, -36); a.lineTo(18, -36); a.quadraticCurveTo(30, -36, 31, -31); a.lineTo(14, -29); a.lineTo(9, -24); a.lineTo(10, -20); a.lineTo(-10, -20); a.lineTo(-9, -24); a.lineTo(-16, -30); a.lineTo(-28, -30); a.closePath();
      shaded(ctx, a, m.iron, [-28, -36, 31, -20], { light: 0.25 });
      ctx.fillStyle = shade(m.ironLight, 0.25); ctx.fillRect(-26, -37, 44, 2);
    } });

  P('cart', { size: [3, 1.8], bounds: [-66, -78, 66, 4], regions: ['lastlight', 'chandlery', 'flue', 'guttered'], desc: 'Two-wheeled hand cart loaded with wax blocks.', opts: '-',
    draw(ctx, o, R) {
      const m = o.mat;
      shaded(ctx, rrect(-52, -44, 92, 12, 2), m.wood, [-52, -44, 40, -32]);
      for (let k = 0; k < 4; k++) shaded(ctx, rrect(-48 + k * 22, -68 + (k % 2) * 6, 20, 24 - (k % 2) * 6, 3), mix(m.wax, m.waxShade, R.range(0, 0.5)), [-48 + k * 22, -68, -28 + k * 22, -44], { lw: 1.2 });
      line(ctx, [38, -38, 64, -60], OUT, 6); line(ctx, [38, -38, 64, -60], m.wood, 3.5);
      for (const x of [-30, 16]) {
        ctx.strokeStyle = OUT; ctx.lineWidth = 6; ctx.beginPath(); ctx.arc(x, -16, 15, 0, TAU); ctx.stroke();
        ctx.strokeStyle = m.woodDark; ctx.lineWidth = 3.5; ctx.stroke();
        ctx.lineWidth = 2; for (let k = 0; k < 6; k++) { const a = k * Math.PI / 3; ctx.beginPath(); ctx.moveTo(x, -16); ctx.lineTo(x + Math.cos(a) * 14, -16 + Math.sin(a) * 14); ctx.stroke(); }
        shaded(ctx, ellipseP(x, -16, 3, 3), m.iron, null, { lw: 1 });
      }
    } });

  P('bookshelf', { size: [2, 3], bounds: [-44, -124, 44, 4], regions: ['lastlight', 'nave', 'sanctum'], desc: 'Tall shelf of tomes, scrolls and a stray candle.', opts: '-',
    draw(ctx, o, R) {
      const m = o.mat;
      shaded(ctx, rrect(-42, -120, 84, 120, 3), m.woodDark, [-42, -120, 42, 0]);
      const books = [mix(m.cloth, '#000000', 0.1), mix(m.leaf, '#000000', 0.2), mix('#3a4a6a', m.mid || '#333', 0.3), m.waxShade, mix(m.gold, '#000000', 0.4)];
      for (let sh = 0; sh < 4; sh++) {
        const y = -112 + sh * 28;
        ctx.fillStyle = shade(m.woodDark, -0.35); ctx.fillRect(-36, y, 72, 24);
        let x = -35;
        while (x < 30) {
          const bw = R.range(4, 9), bh = R.range(14, 22);
          if (R.chance(0.1)) { x += bw + 4; continue; }
          ctx.fillStyle = R.pick(books); ctx.fillRect(x, y + 24 - bh, bw, bh);
          ctx.fillStyle = rgba('#ffffff', 0.12); ctx.fillRect(x, y + 24 - bh, 1.2, bh);
          x += bw + 0.8;
        }
        shaded(ctx, rrect(-40, y + 24, 80, 4, 1), m.wood, null, { lw: 1 });
      }
    } });

  P('fountain', { size: [3, 3], bounds: [-66, -128, 66, 4], regions: ['nave', 'meltbloom', 'lastlight', 'sanctum'], desc: 'Basin fountain with a weeping waxen figure; trickles of water.', opts: '-',
    draw(ctx, o) {
      const m = o.mat;
      const basin = new Path2D(); basin.moveTo(-62, -30); basin.lineTo(62, -30); basin.quadraticCurveTo(56, 0, 40, 0); basin.lineTo(-40, 0); basin.quadraticCurveTo(-56, 0, -62, -30); basin.closePath();
      shaded(ctx, basin, m.stone, [-62, -30, 62, 0]);
      ctx.fillStyle = rgba(mix('#6a9ab0', m.stone, 0.3), 0.85); ctx.beginPath(); ctx.ellipse(0, -30, 58, 5, 0, 0, TAU); ctx.fill();
      shaded(ctx, rrect(-8, -70, 16, 40, 3), m.stone, [-8, -70, 8, -30]);
      const fig = new Path2D(); fig.moveTo(-14, -70); fig.quadraticCurveTo(-16, -100, -6, -112); fig.quadraticCurveTo(0, -116, 6, -112); fig.quadraticCurveTo(16, -100, 14, -70); fig.closePath();
      shaded(ctx, fig, m.stoneLight, [-16, -116, 16, -70]);
      shaded(ctx, ellipseP(0, -120, 8, 9), m.stoneLight, null);
    },
    anim(ctx, o, t) {
      ctx.strokeStyle = rgba('#b8e0f0', 0.55); ctx.lineWidth = 1.2;
      for (const s of [-1, 1]) { ctx.beginPath(); ctx.moveTo(s * 5, -112); ctx.quadraticCurveTo(s * 22, -100, s * 30, -34); ctx.stroke(); }
      for (let i = 0; i < 3; i++) { const q = U.fract(t * 0.9 + i / 3); ctx.strokeStyle = rgba('#d0f0ff', 0.4 * (1 - q)); ctx.beginPath(); ctx.ellipse(28 * (i % 2 ? 1 : -1), -31, 3 + q * 10, 1 + q * 2, 0, 0, TAU); ctx.stroke(); }
    } });

  P('arch', { size: [3, 4], bounds: [-70, -170, 70, 4], regions: ['nave', 'guttered', 'sanctum', 'shore'], desc: 'Freestanding stone archway with keystone (background architecture; use layer "back").', opts: 'broken (bool)',
    draw(ctx, o, R) {
      const m = o.mat;
      const a = new Path2D();
      a.moveTo(-66, 0); a.lineTo(-66, -110); a.arc(0, -110, 66, Math.PI, 0); a.lineTo(66, 0); a.lineTo(42, 0); a.lineTo(42, -110); a.arc(0, -110, 42, 0, Math.PI, true); a.lineTo(-42, 0); a.closePath();
      shaded(ctx, a, m.stone, [-66, -176, 66, 0]);
      ctx.strokeStyle = rgba('#000000', 0.35); ctx.lineWidth = 1.2;
      for (let k = 1; k < 9; k++) { const an = Math.PI + (k / 9) * Math.PI; ctx.beginPath(); ctx.moveTo(Math.cos(an) * 42, -110 + Math.sin(an) * 42); ctx.lineTo(Math.cos(an) * 66, -110 + Math.sin(an) * 66); ctx.stroke(); }
      for (let y = -96; y < 0; y += 24) { ctx.beginPath(); ctx.moveTo(-66, y); ctx.lineTo(-42, y); ctx.moveTo(42, y); ctx.lineTo(66, y); ctx.stroke(); }
      shaded(ctx, poly([-9, -174, 9, -174, 6, -150, -6, -150]), m.stoneLight, null);
      if (o.broken) { ctx.globalCompositeOperation = 'destination-out'; ctx.beginPath(); ctx.moveTo(20, -190); ctx.lineTo(80, -190); ctx.lineTo(80, -80); ctx.lineTo(50, -100); ctx.lineTo(44, -140); ctx.lineTo(24, -150); ctx.closePath(); ctx.fill(); ctx.globalCompositeOperation = 'source-over'; }
    } });

  P('rubble', { size: [1.5, 0.6], bounds: [-36, -26, 36, 4], regions: ['shore', 'guttered', 'nave', 'flue', 'chandlery', 'rime', 'lastlight'], desc: 'A low pile of broken bricks and stone.', opts: '-',
    draw(ctx, o, R) {
      const m = o.mat;
      for (let k = 0; k < 9; k++) {
        const x = R.range(-28, 28), y = -R.range(2, 14) * (1 - Math.abs(x) / 36), w = R.range(8, 16), h = R.range(5, 10), a = R.range(-0.5, 0.5);
        ctx.save(); ctx.translate(x, y); ctx.rotate(a);
        shaded(ctx, rrect(-w / 2, -h / 2, w, h, 2), R.chance(0.5) ? m.stone : m.stoneDark, [-w / 2, -h / 2, w / 2, h / 2], { lw: 1.2 });
        ctx.restore();
      }
    } });

  P('lantern_hanging', { anchor: 'top', size: [0.6, 2], bounds: (o) => [-13, -2, 13, (o.len || 40) + 36], lit: true, flame: 'orange', regions: ['lastlight', 'guttered', 'chandlery', 'mothwood', 'nave', 'flue'], sway: { amp: 0.06, speed: 0.9 }, desc: 'Caged lantern on a chain.', opts: 'len (chain px, default 40), lit, flame',
    draw(ctx, o) {
      const m = o.mat, len = o.len || 40;
      chainLinks(ctx, 0, 0, len, m.iron, 8);
      shaded(ctx, poly([-6, len, 6, len, 11, len + 7, -11, len + 7]), m.iron, null, { lw: 1.2 });
      ctx.fillStyle = o.lit ? rgba('#ffd890', 0.8) : rgba('#30302c', 0.9); ctx.fillRect(-9, len + 7, 18, 22);
      ctx.strokeStyle = OUT; ctx.lineWidth = 2; ctx.strokeRect(-9, len + 7, 18, 22);
      ctx.strokeStyle = m.iron; ctx.lineWidth = 1.3; ctx.beginPath(); ctx.moveTo(-3, len + 7); ctx.lineTo(-3, len + 29); ctx.moveTo(3, len + 7); ctx.lineTo(3, len + 29); ctx.stroke();
      shaded(ctx, poly([-11, len + 29, 11, len + 29, 6, len + 34, -6, len + 34]), m.iron, null, { lw: 1.2 });
    },
    anim(ctx, o, t) { if (o.lit) { const len = o.len || 40; Art.flame(ctx, 0, len + 26, 11, o.flame, t, o.seed % 37, { glow: 0.5 }); Art.glow(ctx, 0, len + 18, 46, Art.FLAMES[o.flame].glow, 0.3); } },
    light(o) { return o.lit ? [{ dx: 0, dy: (o.len || 40) + 18, r: 220, color: Art.FLAMES[o.flame].glow, intensity: 0.8, flicker: true }] : []; } });

  P('grate_glow', { size: [1.5, 1], bounds: [-34, -44, 34, 4], lit: true, regions: ['flue', 'chandlery'], desc: 'Furnace vent grate in a brick frame, ember light seeping out.', opts: 'lit (default true)',
    draw(ctx, o) {
      const m = o.mat;
      shaded(ctx, rrect(-32, -42, 64, 42, 4), m.stoneDark, [-32, -42, 32, 0]);
      const inner = rrect(-24, -34, 48, 28, 3);
      ctx.fillStyle = o.lit ? '#ff6a24' : '#1a1210'; ctx.fill(inner);
      if (o.lit) { const g = ctx.createLinearGradient(0, -34, 0, -6); g.addColorStop(0, '#ffd070'); g.addColorStop(1, '#c03010'); ctx.fillStyle = g; ctx.fill(inner); }
      ctx.fillStyle = OUT;
      for (let x = -20; x <= 20; x += 8) ctx.fillRect(x - 1.5, -34, 3, 28);
      ctx.fillRect(-24, -22, 48, 3);
    },
    anim(ctx, o, t) { if (o.lit) Art.glow(ctx, 0, -20, 50, '#ff7030', 0.38 + 0.12 * noise1(t * 2.5 + o.seed, 7)); },
    light(o) { return o.lit ? [{ dx: 0, dy: -20, r: 200, color: '#ff6a2a', intensity: 0.8, flicker: true }] : []; } });

  P('pew', { size: [3, 1.2], bounds: [-64, -50, 64, 4], regions: ['nave', 'sanctum'], desc: 'Long wooden pew with a carved end.', opts: '-',
    draw(ctx, o) {
      const m = o.mat;
      shaded(ctx, rrect(-58, -22, 116, 7, 2), m.wood, [-58, -22, 58, -15]);
      shaded(ctx, rrect(-56, -46, 112, 18, 2), m.woodDark, [-56, -46, 56, -28]);
      for (const x of [-60, 52]) { const e = new Path2D(); e.moveTo(x, 0); e.lineTo(x, -40); e.quadraticCurveTo(x + 4, -50, x + 8, -40); e.lineTo(x + 8, 0); e.closePath(); shaded(ctx, e, m.wood, [x, -50, x + 8, 0]); }
      for (const x of [-30, 0, 30]) shaded(ctx, rrect(x - 3, -15, 6, 15, 1), m.woodDark, null, { lw: 1 });
    } });

  P('column_broken', { size: [1, 3], bounds: (o) => [-28, -(o.h || 100) - 14, 34, 4], regions: ['shore', 'guttered', 'nave', 'rime', 'sanctum'], desc: 'Broken fluted column on a square base.', opts: 'h (px, default 100)',
    draw(ctx, o, R) {
      const m = o.mat, h = o.h || 100;
      shaded(ctx, rrect(-26, -14, 52, 14, 2), m.stoneDark, [-26, -14, 26, 0]);
      const c = new Path2D();
      c.moveTo(-17, -14); c.lineTo(-17, -h + 10); c.lineTo(-9, -h - 4); c.lineTo(-2, -h + 6); c.lineTo(6, -h - 10); c.lineTo(12, -h + 2); c.lineTo(17, -h + 8); c.lineTo(17, -14); c.closePath();
      shaded(ctx, c, m.stone, [-17, -h, 17, -14]);
      ctx.strokeStyle = rgba('#000000', 0.3); ctx.lineWidth = 1.2;
      for (const x of [-9, 0, 9]) { ctx.beginPath(); ctx.moveTo(x, -16); ctx.lineTo(x, -h + 14); ctx.stroke(); }
      for (let k = 0; k < 3; k++) shaded(ctx, rrect(R.range(18, 30), -R.range(4, 10), R.range(8, 12), R.range(5, 8), 2), m.stone, null, { lw: 1 });
    } });

  P('crate', { size: [1, 1], bounds: [-22, -42, 22, 4], regions: ['lastlight', 'flue', 'chandlery', 'guttered'], desc: 'Wooden crate with iron corners (stack two with variant 1).', opts: 'variant 0..1',
    draw(ctx, o) {
      const m = o.mat;
      const box = (x, y, s) => {
        shaded(ctx, rrect(x - s / 2, y - s, s, s, 2), m.wood, [x - s / 2, y - s, x + s / 2, y]);
        ctx.strokeStyle = rgba('#000000', 0.4); ctx.lineWidth = 1.4;
        ctx.beginPath(); ctx.moveTo(x - s / 2 + 3, y - s + 3); ctx.lineTo(x + s / 2 - 3, y - 3); ctx.moveTo(x - s / 2 + 3, y - s / 2); ctx.lineTo(x + s / 2 - 3, y - s / 2); ctx.stroke();
        ctx.fillStyle = m.iron; for (const [cx, cy] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) ctx.fillRect(x + cx * (s / 2 - 3) - 3, y - s / 2 + cy * (s / 2 - 3) - 3, 6, 6);
      };
      box(0, 0, 38);
      if (o.variant === 1) box(4, -38, 28);
    } });

  P('reeds', { size: [1, 2.5], bounds: [-30, -112, 30, 4], regions: ['mothwood', 'meltbloom', 'shore'], sway: { amp: 0.05, speed: 0.8, pivot: 'bottom' }, desc: 'Clump of tall wick-reeds with dark seed-wicks (ember tips in the Mothwood).', opts: 'ember (bool)',
    draw(ctx, o, R) {
      const m = o.mat;
      for (let i = 0; i < 6; i++) {
        const x = R.range(-18, 18), h = R.range(60, 104), lean = R.range(-14, 14);
        ctx.strokeStyle = OUT; ctx.lineWidth = 4; ctx.lineCap = 'round';
        ctx.beginPath(); ctx.moveTo(x, 2); ctx.quadraticCurveTo(x + lean * 0.3, -h * 0.5, x + lean, -h); ctx.stroke();
        ctx.strokeStyle = m.leaf; ctx.lineWidth = 2.2; ctx.stroke();
        shaded(ctx, ellipseP(x + lean, -h - 7, 3, 8, lean * 0.01), m.woodDark, null, { lw: 1 });
        if (o.ember && R.chance(0.5)) { ctx.fillStyle = '#ff9a50'; ctx.beginPath(); ctx.arc(x + lean, -h - 15, 1.6, 0, TAU); ctx.fill(); }
      }
    } });

  P('mushroom_glow', { size: [0.8, 0.7], bounds: [-22, -32, 22, 4], lit: true, regions: ['mothwood', 'guttered', 'meltbloom', 'nave'], desc: 'Cluster of glowing wax-caps (violet in the Mothwood, amber elsewhere).', opts: 'color (glow hex)',
    draw(ctx, o, R) {
      const m = o.mat, c = o.color || m.glowCap || '#c8a0ff';
      for (let i = 0; i < 4; i++) {
        const x = R.range(-14, 14), h = R.range(8, 22), r = R.range(5, 10);
        line(ctx, [x, 0, x + R.range(-2, 2), -h], mix(m.silk, '#000000', 0.3), 2.2);
        const cap = new Path2D(); cap.moveTo(x - r, -h + 2); cap.quadraticCurveTo(x - r, -h - r * 0.9, x, -h - r * 0.9); cap.quadraticCurveTo(x + r, -h - r * 0.9, x + r, -h + 2); cap.closePath();
        shaded(ctx, cap, mix(c, '#ffffff', 0.25), [x - r, -h - r, x + r, -h], { lw: 1.2, light: 0.3 });
        ctx.fillStyle = rgba('#ffffff', 0.5); ctx.beginPath(); ctx.arc(x - r * 0.3, -h - r * 0.45, r * 0.18, 0, TAU); ctx.fill();
      }
    },
    anim(ctx, o, t) { Art.glow(ctx, 0, -18, 34, o.color || o.mat.glowCap || '#c8a0ff', 0.32 + 0.1 * Math.sin(t * 1.5 + o.seed)); },
    light(o) { return [{ dx: 0, dy: -16, r: 120, color: o.color || o.mat.glowCap || '#c8a0ff', intensity: 0.55, flicker: false }]; } });

  P('grass_clump', { size: [0.6, 0.4], bounds: [-20, -26, 20, 4], regions: ['meltbloom', 'shore', 'lastlight', 'mothwood', 'guttered', 'nave'], sway: { amp: 0.14, speed: 1.2, pivot: 'bottom', shear: true }, desc: 'Small clump of grass / wax fibers (use layer "front" for foreground sway).', opts: 'color (hex), h (px)',
    draw(ctx, o, R) {
      const m = o.mat, c = o.color || m.leaf, h = o.h || 22;
      ctx.lineCap = 'round';
      for (let i = 0; i < 12; i++) {
        const x = R.range(-14, 14), hh = R.range(h * 0.45, h), lean = R.range(-8, 8);
        ctx.strokeStyle = i % 3 ? c : shade(c, 0.25); ctx.lineWidth = R.range(1.2, 2.2);
        ctx.beginPath(); ctx.moveTo(x, 2); ctx.quadraticCurveTo(x + lean * 0.2, -hh * 0.6, x + lean, -hh); ctx.stroke();
      }
    } });

  P('ice_spire', { size: [1, 2.5], bounds: [-26, -104, 26, 4], regions: ['rime'], desc: 'Standing spire of blue ice with a pale core.', opts: '-',
    draw(ctx, o, R) {
      const m = o.mat;
      const parts = [[-6, 96, 0.04, 14], [10, 60, 0.18, 10], [-16, 44, -0.25, 9]];
      for (const [x, h, a, w] of parts) {
        const tx = x + Math.sin(a) * h, ty = -h;
        const p = poly([x - w, 0, x - w * 0.5, ty * 0.6, tx, ty, x + w * 0.6, ty * 0.5, x + w, 0]);
        ctx.fillStyle = rgba(m.ice, 0.8); ctx.fill(p);
        ctx.fillStyle = rgba('#ffffff', 0.4); ctx.beginPath(); ctx.moveTo(x - w * 0.5, ty * 0.6); ctx.lineTo(tx, ty); ctx.lineTo(x - w * 0.1, 0); ctx.lineTo(x - w * 0.6, 0); ctx.closePath(); ctx.fill();
        ctx.strokeStyle = rgba('#f0fbff', 0.85); ctx.lineWidth = 1.3; ctx.stroke(p);
      }
    } });

  P('bones', { size: [1.2, 0.5], bounds: [-30, -22, 30, 4], regions: ['shore', 'guttered', 'mothwood', 'rime', 'flue'], desc: 'Remains of a guttered waxen: a melted puddle, a slumped husk and a black wick.', opts: '-',
    draw(ctx, o, R) {
      const m = o.mat;
      shaded(ctx, ellipseP(0, -2, 28, 5), m.waxShade, [-28, -7, 28, 3], { lw: 1.2 });
      const h = new Path2D(); h.moveTo(-14, -3); h.quadraticCurveTo(-12, -18, 0, -19); h.quadraticCurveTo(12, -18, 14, -3); h.closePath();
      shaded(ctx, h, mix(m.wax, m.waxShade, 0.4), [-14, -19, 14, -3], { lw: 1.2 });
      ctx.fillStyle = '#0c0a0a'; ctx.fillRect(-6, -14, 2.5, 5); ctx.fillRect(2, -13, 2.5, 4);
      line(ctx, [4, -19, 9, -24, 13, -22], '#111', 1.6);
    } });

  P('stalagmite', { size: [0.8, 1.6], bounds: (o) => [-22, -(o.h || 60) - 6, 22, 4], regions: ['guttered', 'rime', 'mothwood', 'shore'], desc: 'Dripping wax stalagmite rising from the floor.', opts: 'h (px, default 60)',
    draw(ctx, o, R) {
      const m = o.mat, h = o.h || 60;
      const p = new Path2D(); p.moveTo(-18, 0); p.quadraticCurveTo(-10, -h * 0.4, -2, -h); p.quadraticCurveTo(2, -h - 2, 4, -h + 3); p.quadraticCurveTo(10, -h * 0.4, 18, 0); p.closePath();
      shaded(ctx, p, mix(m.waxShade, m.stone, 0.4), [-18, -h, 18, 0], { light: 0.22 });
      ctx.strokeStyle = rgba('#ffffff', 0.15); ctx.lineWidth = 1.2;
      for (let k = 0; k < 3; k++) { const y = -h * (0.2 + k * 0.22); ctx.beginPath(); ctx.moveTo(-14 + k * 4, y + 3); ctx.quadraticCurveTo(0, y, 14 - k * 4, y + 3); ctx.stroke(); }
    } });

  P('web', { anchor: 'top', size: [1.5, 1.5], bounds: [-62, -2, 62, 64], regions: ['mothwood', 'guttered', 'rime'], desc: 'Silk web strung beneath a ceiling (anchor at the ceiling).', opts: '-',
    draw(ctx, o, R) {
      const m = o.mat, c = rgba(m.silk, 0.42);
      ctx.strokeStyle = c; ctx.lineWidth = 0.9;
      const spokes = 7, cx = 0, cy = 0;
      const pts = [];
      for (let i = 0; i < spokes; i++) { const a = Math.PI * (0.05 + 0.9 * (i / (spokes - 1))); pts.push([Math.cos(a) * -60, Math.sin(a) * 58]); }
      for (const [x, y] of pts) { ctx.beginPath(); ctx.moveTo(cx, cy); ctx.lineTo(x, y); ctx.stroke(); }
      for (let r = 0.2; r <= 1; r += 0.16) { ctx.beginPath(); for (let i = 0; i < pts.length; i++) { const [x, y] = pts[i]; const sag = i ? 3 * r : 0; if (!i) ctx.moveTo(x * r, y * r); else ctx.quadraticCurveTo((x * r + pts[i - 1][0] * r) / 2, (y * r + pts[i - 1][1] * r) / 2 - sag, x * r, y * r); } ctx.stroke(); }
      ctx.fillStyle = rgba('#ffffff', 0.5); for (let k = 0; k < 5; k++) { const [x, y] = R.pick(pts); const q = R.range(0.3, 0.9); ctx.beginPath(); ctx.arc(x * q, y * q, 1.2, 0, TAU); ctx.fill(); }
    } });

  P('drip', { anchor: 'top', size: [0.2, 2], bounds: [-6, -2, 6, 20], regions: ['guttered', 'nave', 'rime', 'chandlery', 'meltbloom'], desc: 'Animated falling drop from a ceiling (water/wax); fall distance opts.fall.', opts: 'fall (px, default 120), color (hex)',
    draw(ctx, o) { const c = o.color || o.mat.wax; ctx.fillStyle = c; ctx.beginPath(); ctx.moveTo(-3, 0); ctx.quadraticCurveTo(-2, 8, 0, 10); ctx.quadraticCurveTo(2, 8, 3, 0); ctx.closePath(); ctx.fill(); },
    anim(ctx, o, t) {
      const per = 2.2 + (o.seed % 13) * 0.1, q = U.fract(t / per + (o.seed % 7) / 7), fall = o.fall || 120, c = o.color || o.mat.wax;
      if (q < 0.55) { const s = q / 0.55; ctx.fillStyle = c; ctx.beginPath(); ctx.arc(0, 10 + s * 2, 1.4 + s * 1.6, 0, TAU); ctx.fill(); }
      else if (q < 0.85) { const s = (q - 0.55) / 0.3; ctx.fillStyle = c; ctx.beginPath(); ctx.ellipse(0, 12 + s * s * fall, 1.6, 3.5, 0, 0, TAU); ctx.fill(); }
      else { const s = (q - 0.85) / 0.15; ctx.strokeStyle = rgba(c, 0.6 * (1 - s)); ctx.lineWidth = 1; ctx.beginPath(); ctx.ellipse(0, 12 + fall, 2 + s * 7, 1 + s * 1.5, 0, Math.PI, TAU); ctx.stroke(); }
    } });

  P('gear', { size: [2, 2], bounds: [-46, -92, 46, 4], regions: ['chandlery', 'flue'], desc: 'Large cog on an iron mount (slowly turning).', opts: 'spin (bool, default true)',
    draw(ctx, o) { const m = o.mat; shaded(ctx, poly([-8, 0, 8, 0, 4, -46, -4, -46]), m.iron, null); },
    anim(ctx, o, t) {
      const m = o.mat;
      ctx.save(); ctx.translate(0, -46); ctx.rotate(o.spin === false ? 0.2 : t * 0.25);
      const g = new Path2D();
      for (let i = 0; i < 12; i++) { const a0 = (i / 12) * TAU, a1 = a0 + TAU / 24; g.lineTo(Math.cos(a0) * 42, Math.sin(a0) * 42); g.lineTo(Math.cos(a0 + 0.08) * 46, Math.sin(a0 + 0.08) * 46); g.lineTo(Math.cos(a1 - 0.08) * 46, Math.sin(a1 - 0.08) * 46); g.lineTo(Math.cos(a1) * 42, Math.sin(a1) * 42); }
      g.closePath(); g.moveTo(14, 0); g.arc(0, 0, 14, 0, TAU, true);
      ctx.fillStyle = m.iron; ctx.fill(g, 'evenodd'); ctx.strokeStyle = OUT; ctx.lineWidth = 1.6; ctx.stroke(g);
      ctx.strokeStyle = rgba(m.ironLight, 0.6); ctx.lineWidth = 3; for (let i = 0; i < 4; i++) { const a = i * Math.PI / 2; ctx.beginPath(); ctx.moveTo(Math.cos(a) * 14, Math.sin(a) * 14); ctx.lineTo(Math.cos(a) * 38, Math.sin(a) * 38); ctx.stroke(); }
      ctx.restore();
    } });

  P('ladle', { anchor: 'top', size: [1, 3], bounds: (o) => [-30, -2, 30, (o.len || 50) + 84], regions: ['chandlery'], sway: { amp: 0.025, speed: 0.6 }, desc: 'Giant pouring ladle hanging from a chain, dripping molten wax.', opts: 'len (chain px, default 50)',
    draw(ctx, o) {
      const m = o.mat, len = o.len || 50;
      chainLinks(ctx, 0, 0, len, m.iron, 10);
      line(ctx, [0, len, 0, len + 50], OUT, 7); line(ctx, [0, len, 0, len + 50], m.iron, 4);
      const cup = new Path2D(); cup.moveTo(-26, len + 50); cup.lineTo(26, len + 50); cup.quadraticCurveTo(24, len + 80, 0, len + 80); cup.quadraticCurveTo(-24, len + 80, -26, len + 50); cup.closePath();
      shaded(ctx, cup, m.iron, [-26, len + 50, 26, len + 80]);
      ctx.fillStyle = '#ffb040'; ctx.fillRect(-23, len + 49, 46, 3);
    },
    anim(ctx, o, t) { const len = o.len || 50; Art.glow(ctx, 0, len + 50, 30, '#ff9a30', 0.35); const q = U.fract(t * 0.7 + (o.seed % 5) / 5); ctx.fillStyle = rgba('#ffb040', 1 - q); ctx.beginPath(); ctx.ellipse(22, len + 82 + q * q * 60, 1.8, 3.5, 0, 0, TAU); ctx.fill(); } });

  P('cage_bars', { size: [2, 5], bounds: [-50, -206, 50, 4], regions: ['sanctum'], desc: 'Section of the Everlantern\'s golden cage: curved bars with a ring.', opts: '-',
    draw(ctx, o) {
      const m = o.mat;
      for (let i = -3; i <= 3; i++) {
        ctx.strokeStyle = OUT; ctx.lineWidth = 8; ctx.beginPath(); ctx.moveTo(i * 13, 0); ctx.quadraticCurveTo(i * 15, -120, i * 5, -200); ctx.stroke();
        ctx.strokeStyle = m.gold; ctx.lineWidth = 5; ctx.stroke();
        ctx.strokeStyle = rgba(m.goldLight, 0.6); ctx.lineWidth = 1.5; ctx.beginPath(); ctx.moveTo(i * 13 - 1.5, 0); ctx.quadraticCurveTo(i * 15 - 1.5, -120, i * 5 - 1.5, -200); ctx.stroke();
      }
      for (const y of [-60, -150]) { const w = y === -60 ? 46 : 34; shaded(ctx, ellipseP(0, y, w, 6), m.gold, [-w, y - 6, w, y + 6], { light: 0.3 }); }
    },
    anim(ctx, o, t) { Art.glow(ctx, 0, -100, 70, '#ffd860', 0.12 + 0.05 * Math.sin(t + o.seed)); } });

  P('altar', { size: [2, 1.5], bounds: [-46, -66, 46, 4], lit: true, flame: 'gold', regions: ['sanctum', 'nave', 'lastlight'], desc: 'Draped stone altar crowded with votive candles.', opts: 'lit, flame',
    draw(ctx, o, R) {
      const m = o.mat;
      shaded(ctx, rrect(-42, -34, 84, 34, 3), m.stone, [-42, -34, 42, 0]);
      const cl = new Path2D(); cl.moveTo(-44, -36); cl.lineTo(44, -36); cl.lineTo(40, -14); cl.lineTo(24, -20); cl.lineTo(8, -12); cl.lineTo(-10, -20); cl.lineTo(-26, -12); cl.lineTo(-40, -18); cl.closePath();
      shaded(ctx, cl, m.cloth, [-44, -36, 44, -12], { light: 0.12 });
      const tips = [];
      for (let i = 0; i < 6; i++) tips.push(candle(ctx, -34 + i * 13.6 + R.range(-2, 2), -36, R.range(5, 7), R.range(8, 22), o, R));
      o._tips = tips;
    },
    anim(ctx, o, t) { const tips = o._tips || []; for (let i = 0; i < tips.length; i++) flameAt(ctx, o, t, tips[i][0], tips[i][1], 9, i); },
    light(o) { return o.lit ? [{ dx: 0, dy: -56, r: 220, color: Art.FLAMES[o.flame].glow, intensity: 0.8, flicker: true }] : []; } });

  // =============================================================================================
  // Rendering: cached static sprites + per-frame animation
  const spriteCache = new Map();
  const SPRITE_MAX = 400;
  const warned = new Set();
  function resolveOpts(kind, def, opts) {
    const o = Object.assign({}, opts || {});
    const region = o.region || (Art.current && Art.current.regionId) || 'test';
    o.region = region;
    o.mat = opts && opts.mat ? Object.assign({}, Art.materials(region), opts.mat) : Art.materials(region);
    o.pal = Art.palette(region);
    o.seed = (o.seed === undefined ? 0 : o.seed | 0) >>> 0;
    o.scale = o.scale > 0 ? o.scale : 1;
    o.variant = o.variant | 0;
    if (o.lit === undefined) o.lit = !!def.lit;
    o.flame = Art.FLAMES[o.flame] ? o.flame : (def.flame || 'orange');
    o.dim = clamp(+o.dim || 0, 0, 1);
    return o;
  }
  function spriteKey(kind, o) {
    const extra = [];
    for (const k of Object.keys(o)) {
      if (k === 'mat' || k === 'pal' || k === 'scale' || k === 'flip' || k === 'layer' || k === 'anim' || k[0] === '_') continue;
      const v = o[k];
      if (v === undefined || typeof v === 'function' || (typeof v === 'object' && v !== null)) continue;
      extra.push(k + '=' + v);
    }
    const res = clamp(Math.round(o.scale * 4) / 4, 0.5, 3);
    return kind + '|' + extra.sort().join(',') + '|' + res;
  }
  function getSprite(kind, def, o, key) {
    key = key || spriteKey(kind, o);
    let s = spriteCache.get(key);
    if (s) { if (s.meta) Object.assign(o, s.meta); return s; }
    const res = clamp(Math.round(o.scale * 4) / 4, 0.5, 3);
    const b = boundsOf(def, o);
    const pad = 4;
    const w = Math.ceil((b[2] - b[0] + pad * 2) * res), h = Math.ceil((b[3] - b[1] + pad * 2) * res);
    const mc = makeCanvas(w, h);
    const ctx = mc.ctx;
    ctx.scale(res, res);
    ctx.translate(-b[0] + pad, -b[1] + pad);
    const before = Object.keys(o);
    try { def.draw(ctx, o, new U.Rng(hashInt(U.hashStr(kind), o.seed, o.variant))); } catch (e) { Art.report(e, 'prop.draw:' + kind); }
    if (o.dim > 0) { // recede into the background: tint toward the fog colour
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.globalCompositeOperation = 'source-atop';
      ctx.fillStyle = rgba(mix(o.pal.fog, o.pal.fillDeep, 0.35), o.dim);
      ctx.fillRect(0, 0, w, h);
      ctx.globalCompositeOperation = 'source-over';
    }
    // metadata computed during draw (e.g. flame tips) is cached with the sprite
    const meta = {};
    for (const k of Object.keys(o)) if (k[0] === '_' && !before.includes(k)) meta[k] = o[k];
    s = { canvas: mc.canvas, x0: b[0] - pad, y0: b[1] - pad, w: (b[2] - b[0] + pad * 2), h: (b[3] - b[1] + pad * 2), meta };
    spriteCache.set(key, s);
    if (spriteCache.size > SPRITE_MAX) { const k = spriteCache.keys().next().value; const old = spriteCache.get(k); spriteCache.delete(k); U.freeCanvas(old.canvas); }
    return s;
  }
  function swayAngle(def, o, t) {
    const sw = def.sway;
    if (!sw || o.sway === false) return 0;
    const ph = (o.seed % 1000) * 0.0137;
    return (Math.sin(t * sw.speed * 2 + ph) * 0.7 + Math.sin(t * sw.speed * 3.3 + ph * 2) * 0.3) * sw.amp * (o.swayAmp === undefined ? 1 : o.swayAmp);
  }
  function drawPlaceholder(ctx, x, y) {
    ctx.save(); ctx.fillStyle = 'rgba(255,0,255,0.6)'; ctx.fillRect(x - 6, y - 12, 12, 12); ctx.restore();
  }
  /**
   * Draw a catalog prop. x,y = foot position (anchor 'bottom') or ceiling attach point (anchor 'top').
   * opts: {flip, scale, seed, variant, lit, flame, dim (0..1 back-layer tint), region, len, h, ...}
   */
  function prepare(kind, def, opts) {
    const o = resolveOpts(kind, def, opts);
    return { kind, def, o, key: spriteKey(kind, o) };
  }
  Art.drawDecorProp = function (ctx, kind, x, y, opts, t) {
    const def = PROPS[kind];
    if (!def) {
      if (!warned.has(kind)) { warned.add(kind); Art.report(new Error('unknown decor prop "' + kind + '"'), 'Art.drawDecorProp'); }
      drawPlaceholder(ctx, x, y);
      return;
    }
    drawPrepared(ctx, prepare(kind, def, opts), x, y, t);
  };
  function drawPrepared(ctx, pp, x, y, t) {
    const def = pp.def, o = pp.o, kind = pp.kind;
    try {
      const spr = getSprite(kind, def, o, pp.key);
      ctx.save();
      ctx.translate(x, y);
      if (o.scale !== 1) ctx.scale(o.scale, o.scale);
      if (o.flip) ctx.scale(-1, 1);
      const a = swayAngle(def, o, t || 0);
      if (a) {
        if (def.sway.shear) ctx.transform(1, 0, -a * 2.2, 1, 0, 0);
        else ctx.rotate(def.anchor === 'top' ? a : -a);
      }
      ctx.drawImage(spr.canvas, spr.x0, spr.y0, spr.w, spr.h);
      if (def.anim && o.anim !== false && !(o.dim > 0.85)) {
        if (o.dim > 0) ctx.globalAlpha *= 1 - o.dim * 0.7;
        def.anim(ctx, o, t || 0);
      }
      ctx.restore();
    } catch (e) { Art.report(e, 'Art.drawDecorProp:' + kind); }
  }
  /** World-space lights for a prop instance (used by the decor placer; content can use it too). */
  Art.propLights = function (kind, x, y, opts) {
    const def = PROPS[kind];
    if (!def || !def.light) return [];
    try {
      const o = resolveOpts(kind, def, opts);
      getSprite(kind, def, o); // ensures metadata like flame tips is available
      const s = o.scale, f = o.flip ? -1 : 1;
      return (def.light(o) || []).map((L) => ({ x: x + L.dx * s * f, y: y + L.dy * s, r: L.r * Math.sqrt(s), color: L.color, intensity: L.intensity, flicker: !!L.flicker }));
    } catch (e) { Art.report(e, 'Art.propLights:' + kind); return []; }
  };

  // =============================================================================================
  // Procedural decor placement
  const Decor = (Art.Decor = {});
  const isSolid = (v) => v === SOLID || v === GLAZED || v === BREAKABLE || v === DIVEFLOOR;
  const isSupport = (v) => v === SOLID || v === GLAZED; // never rest decor on breakables
  Decor.build = function (room, cache) {
    const D = (cache.decor = { back: [], front: [], lights: [] });
    const rules = cache.cfg.decor || [];
    const th = cache.theme || {};
    const dens = th.decor === false ? 0 : typeof th.decor === 'number' ? th.decor : 1;
    if (!rules.length || dens <= 0) return;
    const cols = room.cols, rows = room.rows, tl = cache.pristine;
    const tile = (c, r) => (c < 0 || r < 0 || c >= cols || r >= rows ? SOLID : tl[r * cols + c]);
    const free = (c, r) => { const v = tile(c, r); return v === EMPTY || v === BGWALL; };
    const nearHazard = (c, r, rad) => {
      for (let y = r - rad; y <= r + rad; y++) for (let x = c - rad; x <= c + rad; x++) { const v = tile(x, y); if (v === SPIKES || v === WATER || v === LAVA || v === PLATFORM || v === BREAKABLE || v === DIVEFLOOR) return true; }
      return false;
    };
    const taken = new Uint8Array(cols * rows); // one decor per tile per layer class
    const placedByKind = new Map();
    const farEnough = (kind, x, y, gap) => {
      const list = placedByKind.get(kind);
      if (!list) return true;
      for (const [px, py] of list) if (Math.abs(px - x) < gap * T && Math.abs(py - y) < gap * T * 1.5) return false;
      return true;
    };
    rules.forEach((rule, ri) => {
      const rng = new U.Rng(hashInt(cache.seed, ri, 0xdec0));
      const kinds = Array.isArray(rule.kind) ? rule.kind : [rule.kind];
      const where = rule.where || 'floor';
      const wT = Math.max(1, Math.ceil(rule.width || 1)), hT = Math.max(1, Math.ceil(rule.height || 1));
      const chance = (rule.chance === undefined ? 0.05 : rule.chance) * dens;
      const gap = rule.gap === undefined ? 3 : rule.gap;
      let count = 0;
      const max = rule.max === undefined ? 999 : rule.max;
      // candidate spots in a deterministic shuffled order
      const spots = [];
      for (let r = 0; r < rows; r++) for (let c = 0; c < cols; c++) {
        if (!free(c, r)) continue;
        if (where === 'floor') {
          let ok = true;
          for (let k = 0; k < wT && ok; k++) { if (!free(c + k, r) || !isSupport(tile(c + k, r + 1))) ok = false; for (let hh = 1; hh < hT && ok; hh++) if (!free(c + k, r - hh)) ok = false; }
          if (ok) spots.push([c, r]);
        } else if (where === 'ceiling') {
          let ok = isSupport(tile(c, r - 1));
          for (let hh = 1; hh < hT && ok; hh++) if (!free(c, r + hh)) ok = false;
          if (ok) spots.push([c, r]);
        } else if (where === 'wallL' || where === 'wallR' || where === 'wall') {
          if ((where !== 'wallR' && isSupport(tile(c - 1, r)) && isSupport(tile(c - 1, r - 1)) && isSupport(tile(c - 1, r + 1))) ||
              (where !== 'wallL' && isSupport(tile(c + 1, r)) && isSupport(tile(c + 1, r - 1)) && isSupport(tile(c + 1, r + 1)))) spots.push([c, r]);
        } else if (where === 'bgwall') {
          if (tile(c, r) === BGWALL && tile(c, r - 1) === BGWALL && tile(c, r + 1) !== EMPTY) spots.push([c, r]);
        } else if (where === 'air') {
          spots.push([c, r]);
        }
      }
      for (let i = spots.length - 1; i > 0; i--) { const j = Math.floor(rng.next() * (i + 1)); const tmp = spots[i]; spots[i] = spots[j]; spots[j] = tmp; }
      for (const [c, r] of spots) {
        if (count >= max) break;
        if (!rng.chance(chance)) continue;
        if (rule.avoidHazards !== false && nearHazard(c, r, 1)) continue;
        // Out of bounds counts as SOLID for the shape tests above, so a spot can rest on the outside of an exit
        // hole (floor at the bottom of an S hole, ceiling over an N hole, wall beside a W/E hole). Such a prop is
        // still "placed" as a phantom (same rng draws, gap and count) but never drawn, so every other prop keeps
        // its layout (rooms tuned their bgSeed against it).
        const outside = (where === 'floor' && r + 1 >= rows) || (where === 'ceiling' && r === 0) ||
          ((where === 'wallL' || where === 'wallR' || where === 'wall') && (c === 0 || (c === cols - 1 && !isSupport(tile(c - 1, r)))));
        if (rule.minY !== undefined && r < rule.minY) continue;
        if (rule.test && !rule.test(tile, c, r, room)) continue;
        const layerBit = rule.layer === 'front' ? 2 : 1;
        if (taken[r * cols + c] & layerBit) continue;
        const kind = rng.pick(kinds);
        const def = PROPS[kind];
        if (!def) continue;
        let x = (c + wT / 2) * T, y;
        if (where === 'ceiling') y = r * T - 10; // start inside the (smoothed) ceiling so nothing floats
        else if (where === 'floor') y = (r + 1) * T;
        else if (where === 'bgwall') y = (r + 1) * T;
        else if (where === 'air') y = (r + 0.5) * T;
        else { // walls: hug the wall side
          const left = isSupport(tile(c - 1, r));
          x = left ? c * T + (rule.inset || 10) : (c + 1) * T - (rule.inset || 10);
          y = (r + 1) * T;
        }
        x += (rule.jitter === undefined ? 0.3 : rule.jitter) * T * (rng.next() - 0.5);
        if (!farEnough(kind, x, y, gap)) continue;
        const sc = Array.isArray(rule.scale) ? rng.range(rule.scale[0], rule.scale[1]) : (rule.scale || 1);
        let opts = typeof rule.opts === 'function' ? rule.opts(rng, c, r, tile) : Object.assign({}, rule.opts || {});
        opts = Object.assign({ seed: rng.int(0, 1e6), scale: sc, flip: rule.flip === false ? false : rng.chance(0.5), region: cache.regionId, dim: rule.dim || 0 }, opts);
        // hanging props: stretch the chain/thread to the available headroom
        if (def.anchor === 'top' && rule.fitLen) {
          let free2 = 0; while (free(c, r + free2 + 1) && free2 < 12) free2++;
          const maxLen = (free2 + 1) * T * rule.fitLen[1];
          opts.len = 10 + Math.max(rule.fitLen[0], Math.min(maxLen, rng.range(rule.fitLen[0], Math.max(rule.fitLen[0], maxLen))));
        }
        const pp = prepare(kind, def, opts);
        const b = boundsOf(def, pp.o), s = pp.o.scale;
        const inst = { kind, x, y, pp, bbox: [x + Math.min(b[0], -b[2]) * s - 60, y + b[1] * s - 60, x + Math.max(b[2], -b[0]) * s + 60, y + (b[3] + (opts.fall || 0)) * s + 60] };
        if (cache.veil && cache.veil.index[r * cols + c] >= 0) inst.pocket = cache.veil.index[r * cols + c];   // faded with its veil
        if (!outside) {
          (rule.layer === 'front' ? D.front : D.back).push(inst);
          if (rule.lights !== false && def.light) for (const L of Art.propLights(kind, x, y, opts)) D.lights.push(L);
        }
        for (let k = 0; k < wT; k++) if (c + k < cols) taken[r * cols + c + k] |= layerBit;
        if (!placedByKind.has(kind)) placedByKind.set(kind, []);
        placedByKind.get(kind).push([x, y]);
        count++;
      }
    });
    // stable draw order: back layer by kind order then y (big props first)
    D.back.sort((a, b) => (b.pp.o.dim || 0) - (a.pp.o.dim || 0) || a.y - b.y);
  };
  function drawList(ctx, list, cam, t, veil) {
    if (!list || !list.length) return;
    const x0 = cam.x, y0 = cam.y, x1 = cam.x + (cam.w || Art.VIEW_W), y1 = cam.y + (cam.h || Art.VIEW_H);
    for (const it of list) {
      const b = it.bbox;
      if (b[2] < x0 || b[0] > x1 || b[3] < y0 || b[1] > y1) continue;
      const va = veil && it.pocket !== undefined ? veil.alpha[it.pocket] || 0 : 0;   // inside a veiled secret pocket
      if (va >= 0.997) continue;
      if (va > 0) { ctx.save(); ctx.globalAlpha *= 1 - va; drawPrepared(ctx, it.pp, it.x, it.y, t); ctx.restore(); continue; }
      drawPrepared(ctx, it.pp, it.x, it.y, t);
    }
  }
  Decor.drawBack = function (ctx, room, cache, cam, t) { if (cache.decor) drawList(ctx, cache.decor.back, cam, t, null); };
  Decor.drawFront = function (ctx, room, cache, cam, t) { if (cache.decor) drawList(ctx, cache.decor.front, cam, t, cache.veil); };
})();
