// src/engine/particles.js — G.fx: pooled particles (cap 650), preset bursts per kind, additive glows via
// cached sprites (never shadowBlur). World-space drawing (camera transform already applied).
(function () {
  'use strict';
  const G = globalThis.G;
  const MAX = 650;
  const TAU = Math.PI * 2;

  // shapes
  const S_CIRCLE = 0, S_LINE = 1, S_TRI = 2, S_RING = 3, S_ARC = 4, S_GLOW = 5, S_DROP = 6, S_BUBBLE = 7, S_RECT = 8;

  const pool = [];
  for (let i = 0; i < MAX; i++) pool.push({});
  let count = 0;

  const rnd = (a, b) => a + Math.random() * (b - a);

  // ---- cached glow sprites (radial gradient, white core → color → transparent) ----
  const glowCache = new Map();
  function glowSprite(color) {
    let c = glowCache.get(color);
    if (c) return c;
    const size = 64;
    const { canvas, ctx } = G.U.makeCanvas(size, size);
    const g = ctx.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
    g.addColorStop(0, G.U.rgba(G.U.mix(color, '#ffffff', 0.55), 1));
    g.addColorStop(0.25, G.U.rgba(color, 0.75));
    g.addColorStop(0.6, G.U.rgba(color, 0.22));
    g.addColorStop(1, G.U.rgba(color, 0));
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, size, size);
    if (glowCache.size > 128) glowCache.clear();
    glowCache.set(color, canvas);
    return canvas;
  }
  // Additive glow at a point (helper for entities): r = radius in px.
  function glowAt(ctx, x, y, r, color, alpha) {
    if (!(r > 0) || !(alpha > 0)) return;
    const img = glowSprite(color || '#ffffff');
    const op = ctx.globalCompositeOperation, ga = ctx.globalAlpha;
    ctx.globalCompositeOperation = 'lighter';
    ctx.globalAlpha = Math.min(1, alpha);
    ctx.drawImage(img, x - r, y - r, r * 2, r * 2);
    ctx.globalCompositeOperation = op;
    ctx.globalAlpha = ga;
  }

  function alloc() {
    if (count >= MAX) return null;
    const p = pool[count++];
    p.x = 0; p.y = 0; p.vx = 0; p.vy = 0; p.life = 1; p.max = 1;
    p.size = 3; p.size2 = 3; p.color = '#ffffff'; p.alpha = 1;
    p.gravity = 0; p.drag = 0; p.rot = 0; p.vrot = 0;
    p.add = false; p.shape = S_CIRCLE; p.a0 = 0; p.span = 0; p.wob = 0; p.wobF = 0; p.flick = false; p.lw = 2;
    return p;
  }

  // Direct spawn: fields as in the pool objects (x,y,vx,vy,life,size,size2,color,alpha,gravity,drag,
  // rot,vrot,add,shape:'circle'|'line'|'tri'|'ring'|'arc'|'glow'|'drop'|'bubble'|'rect').
  const SHAPES = { circle: S_CIRCLE, line: S_LINE, tri: S_TRI, ring: S_RING, arc: S_ARC, glow: S_GLOW, drop: S_DROP, bubble: S_BUBBLE, rect: S_RECT };
  function spawn(o) {
    const p = alloc();
    if (!p) return null;
    for (const k in o) if (k !== 'shape') p[k] = o[k];
    p.shape = typeof o.shape === 'string' ? (SHAPES[o.shape] || S_CIRCLE) : (o.shape || S_CIRCLE);
    if (o.size2 === undefined) p.size2 = p.size;
    p.max = p.life;
    return p;
  }

  function dirVel(angle, spread, speed) {
    const a = angle + (Math.random() - 0.5) * spread;
    return [Math.cos(a) * speed, Math.sin(a) * speed];
  }

  // Preset bursts. opts: count, color, speed (max speed), angle (rad), spread (rad), size, life, vx, vy,
  // gravity, r (ring/flash/slash radius), width, additive, alpha.
  const PRESETS = {
    spark(x, y, o) {
      const n = o.count != null ? o.count : 8, sp = o.speed || 420;
      for (let i = 0; i < n; i++) {
        const p = alloc(); if (!p) return;
        const [vx, vy] = dirVel(o.angle != null ? o.angle : -Math.PI / 2, o.spread != null ? o.spread : TAU, rnd(sp * 0.4, sp));
        Object.assign(p, { x, y, vx: vx + (o.vx || 0), vy: vy + (o.vy || 0), life: rnd(0.12, 0.32), size: o.size || rnd(1.5, 2.6),
          color: o.color || '#ffe7a8', gravity: o.gravity != null ? o.gravity : 700, drag: 2.5, add: true, shape: S_LINE });
        p.size2 = p.size * 0.5; p.max = p.life;
      }
    },
    ember(x, y, o) {
      const n = o.count != null ? o.count : 6, sp = o.speed || 80;
      for (let i = 0; i < n; i++) {
        const p = alloc(); if (!p) return;
        Object.assign(p, { x: x + rnd(-6, 6), y: y + rnd(-6, 6), vx: rnd(-sp, sp) * 0.6 + (o.vx || 0), vy: -rnd(sp * 0.3, sp) + (o.vy || 0),
          life: o.life || rnd(0.7, 1.5), size: o.size || rnd(1.6, 3.2), color: o.color || '#ff9a4a', gravity: o.gravity != null ? o.gravity : -50,
          drag: 1.2, add: true, shape: S_GLOW, flick: true, wob: rnd(10, 30), wobF: rnd(2, 5), a0: rnd(0, TAU) });
        p.size2 = p.size * 0.3; p.max = p.life;
      }
    },
    smoke(x, y, o) {
      const n = o.count != null ? o.count : 6, sp = o.speed || 50;
      for (let i = 0; i < n; i++) {
        const p = alloc(); if (!p) return;
        const s = o.size || rnd(8, 14);
        Object.assign(p, { x: x + rnd(-8, 8), y: y + rnd(-8, 8), vx: rnd(-sp, sp) + (o.vx || 0), vy: rnd(-sp, sp * 0.3) + (o.vy || 0),
          life: o.life || rnd(0.8, 1.5), size: s, size2: s * 2.4, color: o.color || '#4b4a55', alpha: o.alpha || 0.45,
          gravity: o.gravity != null ? o.gravity : -40, drag: 1.4, shape: S_CIRCLE });
        p.max = p.life;
      }
    },
    dust(x, y, o) {
      const n = o.count != null ? o.count : 6, sp = o.speed || 110;
      for (let i = 0; i < n; i++) {
        const p = alloc(); if (!p) return;
        const s = o.size || rnd(3, 6);
        const ang = o.angle != null ? o.angle : (Math.random() < 0.5 ? Math.PI : 0);
        const [vx, vy] = dirVel(ang, o.spread != null ? o.spread : 0.9, rnd(sp * 0.3, sp));
        Object.assign(p, { x: x + rnd(-6, 6), y: y + rnd(-3, 3), vx: vx + (o.vx || 0), vy: vy - rnd(10, 40) + (o.vy || 0),
          life: o.life || rnd(0.35, 0.65), size: s, size2: s * 2.2, color: o.color || '#b9ab93', alpha: o.alpha || 0.55,
          gravity: -30, drag: 3.2, shape: S_CIRCLE });
        p.max = p.life;
      }
    },
    drip(x, y, o) {
      const n = o.count != null ? o.count : 1;
      for (let i = 0; i < n; i++) {
        const p = alloc(); if (!p) return;
        Object.assign(p, { x, y, vx: o.vx || 0, vy: o.vy != null ? o.vy : rnd(0, 40), life: o.life || 1.4, size: o.size || rnd(2, 3),
          color: o.color || '#e9dcc0', gravity: o.gravity != null ? o.gravity : 1300, shape: S_DROP, alpha: o.alpha || 0.9 });
        p.max = p.life;
      }
    },
    shard(x, y, o) {
      const n = o.count != null ? o.count : 6, sp = o.speed || 300;
      for (let i = 0; i < n; i++) {
        const p = alloc(); if (!p) return;
        const [vx, vy] = dirVel(o.angle != null ? o.angle : -Math.PI / 2, o.spread != null ? o.spread : 2.4, rnd(sp * 0.35, sp));
        Object.assign(p, { x: x + rnd(-6, 6), y: y + rnd(-6, 6), vx: vx + (o.vx || 0), vy: vy + (o.vy || 0), life: o.life || rnd(0.5, 0.95),
          size: o.size || rnd(3, 6.5), color: o.color || '#cfc3ad', gravity: o.gravity != null ? o.gravity : 1400, drag: 0.4,
          rot: rnd(0, TAU), vrot: rnd(-14, 14), shape: S_TRI });
        p.size2 = p.size * 0.6; p.max = p.life;
      }
    },
    wax(x, y, o) {
      const n = o.count != null ? o.count : 8, sp = o.speed || 300;
      for (let i = 0; i < n; i++) {
        const p = alloc(); if (!p) return;
        const [vx, vy] = dirVel(o.angle != null ? o.angle : -Math.PI / 2, o.spread != null ? o.spread : 2.6, rnd(sp * 0.3, sp));
        Object.assign(p, { x: x + rnd(-5, 5), y: y + rnd(-5, 5), vx: vx + (o.vx || 0), vy: vy + (o.vy || 0), life: o.life || rnd(0.6, 1.1),
          size: o.size || rnd(2.5, 5.5), color: o.color || '#efe5cf', gravity: o.gravity != null ? o.gravity : 1500, drag: 0.6, shape: S_CIRCLE });
        p.size2 = p.size * 0.7; p.max = p.life;
      }
    },
    ring(x, y, o) {
      const p = alloc(); if (!p) return;
      Object.assign(p, { x, y, life: o.life || 0.35, size: o.size || 8, size2: o.r || 90, color: o.color || '#cfefff',
        add: o.additive !== false, shape: S_RING, lw: o.width || 4, alpha: o.alpha || 0.9 });
      p.max = p.life;
    },
    slash(x, y, o) {
      const p = alloc(); if (!p) return;
      Object.assign(p, { x, y, life: o.life || 0.13, size: o.r || 60, size2: (o.r || 60) * 1.08, color: o.color || '#e2f6ff',
        add: true, shape: S_ARC, a0: o.angle || 0, span: o.span || 2.2, lw: o.width || 12, alpha: o.alpha || 0.95 });
      p.max = p.life;
    },
    flash(x, y, o) {
      const p = alloc(); if (!p) return;
      Object.assign(p, { x, y, life: o.life || 0.16, size: o.r || 70, size2: (o.r || 70) * 1.25, color: o.color || '#ffffff',
        add: true, shape: S_GLOW, alpha: o.alpha || 0.9 });
      p.max = p.life;
    },
    splash(x, y, o) {
      const n = o.count != null ? o.count : 10, sp = o.speed || 320;
      for (let i = 0; i < n; i++) {
        const p = alloc(); if (!p) return;
        const [vx, vy] = dirVel(-Math.PI / 2, o.spread != null ? o.spread : 1.6, rnd(sp * 0.35, sp));
        Object.assign(p, { x: x + rnd(-10, 10), y, vx: vx + (o.vx || 0), vy: vy + (o.vy || 0), life: o.life || rnd(0.45, 0.8),
          size: o.size || rnd(1.8, 3.6), color: o.color || '#9fd8ff', gravity: 1400, drag: 0.3, shape: S_CIRCLE, alpha: 0.9 });
        p.size2 = p.size * 0.6; p.max = p.life;
      }
    },
    bubble(x, y, o) {
      const n = o.count != null ? o.count : 4;
      for (let i = 0; i < n; i++) {
        const p = alloc(); if (!p) return;
        Object.assign(p, { x: x + rnd(-10, 10), y: y + rnd(-6, 6), vx: 0, vy: -rnd(40, 90), life: o.life || rnd(0.7, 1.5),
          size: o.size || rnd(1.8, 3.8), color: o.color || '#cdeeff', shape: S_BUBBLE, wob: rnd(6, 14), wobF: rnd(3, 6), a0: rnd(0, TAU), alpha: 0.8 });
        p.max = p.life;
      }
    },
    snow(x, y, o) {
      const n = o.count != null ? o.count : 1;
      for (let i = 0; i < n; i++) {
        const p = alloc(); if (!p) return;
        Object.assign(p, { x, y, vx: o.vx != null ? o.vx : rnd(-15, 15), vy: o.vy != null ? o.vy : rnd(30, 60), life: o.life || rnd(4, 7),
          size: o.size || rnd(1.2, 2.8), color: o.color || '#f0f7ff', alpha: o.alpha || 0.85, wob: rnd(8, 22), wobF: rnd(0.6, 1.4), a0: rnd(0, TAU), shape: S_CIRCLE });
        p.max = p.life;
      }
    },
    ash(x, y, o) {
      const n = o.count != null ? o.count : 1;
      for (let i = 0; i < n; i++) {
        const p = alloc(); if (!p) return;
        Object.assign(p, { x, y, vx: o.vx != null ? o.vx : rnd(-10, 25), vy: o.vy != null ? o.vy : rnd(18, 45), life: o.life || rnd(4, 8),
          size: o.size || rnd(1.2, 2.6), color: o.color || '#a7a3a0', alpha: o.alpha || 0.7, wob: rnd(6, 18), wobF: rnd(0.5, 1.2), a0: rnd(0, TAU),
          rot: rnd(0, TAU), vrot: rnd(-2, 2), shape: S_RECT });
        p.max = p.life;
      }
    },
    pollen(x, y, o) {
      const n = o.count != null ? o.count : 1;
      for (let i = 0; i < n; i++) {
        const p = alloc(); if (!p) return;
        Object.assign(p, { x, y, vx: o.vx != null ? o.vx : rnd(-12, 12), vy: o.vy != null ? o.vy : rnd(-18, 6), life: o.life || rnd(3, 6),
          size: o.size || rnd(1.2, 2.4), color: o.color || '#ffe9a0', alpha: o.alpha || 0.9, wob: rnd(8, 20), wobF: rnd(0.7, 1.6), a0: rnd(0, TAU),
          add: true, shape: S_GLOW, flick: true });
        p.max = p.life;
      }
    },
  };

  function burst(kind, x, y, opts) {
    const fn = PRESETS[kind];
    if (!fn) { G.warnOnce('fxkind:' + kind, 'G.fx.burst: unknown kind "' + kind + '"'); return; }
    fn(x, y, opts || {});
  }

  function update(dt) {
    let i = 0;
    while (i < count) {
      const p = pool[i];
      p.life -= dt;
      if (p.life <= 0) {
        // swap-remove
        count--;
        pool[i] = pool[count];
        pool[count] = p;
        continue;
      }
      if (p.drag) { const k = Math.max(0, 1 - p.drag * dt); p.vx *= k; p.vy *= k; }
      p.vy += p.gravity * dt;
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      if (p.wob) p.a0 += p.wobF * dt;
      if (p.vrot) p.rot += p.vrot * dt;
      i++;
    }
  }

  function drawOne(ctx, p) {
    const k = 1 - p.life / p.max; // 0 → 1 over lifetime
    const size = p.size + (p.size2 - p.size) * k;
    let a = p.alpha * (p.shape === S_RING || p.shape === S_ARC ? (1 - k) : Math.min(1, (p.life / p.max) * 1.6));
    if (p.flick) a *= 0.7 + 0.3 * Math.sin(p.life * 23 + p.a0 * 3);
    if (a <= 0.004) return;
    const x = p.wob ? p.x + Math.sin(p.a0) * p.wob * 0.15 : p.x;
    const y = p.y;
    ctx.globalAlpha = a;
    switch (p.shape) {
      case S_CIRCLE:
        ctx.fillStyle = p.color;
        ctx.beginPath(); ctx.arc(x, y, Math.max(0.3, size), 0, TAU); ctx.fill();
        break;
      case S_RECT:
        ctx.fillStyle = p.color;
        ctx.save(); ctx.translate(x, y); ctx.rotate(p.rot);
        ctx.fillRect(-size, -size * 0.6, size * 2, size * 1.2);
        ctx.restore();
        break;
      case S_LINE: {
        ctx.strokeStyle = p.color; ctx.lineWidth = Math.max(0.5, size);
        const len = 0.035;
        ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x - p.vx * len, y - p.vy * len); ctx.stroke();
        break;
      }
      case S_TRI:
        ctx.fillStyle = p.color;
        ctx.save(); ctx.translate(x, y); ctx.rotate(p.rot);
        ctx.beginPath(); ctx.moveTo(0, -size); ctx.lineTo(size * 0.8, size * 0.7); ctx.lineTo(-size * 0.8, size * 0.5); ctx.closePath(); ctx.fill();
        ctx.restore();
        break;
      case S_RING:
        ctx.strokeStyle = p.color; ctx.lineWidth = Math.max(0.5, p.lw * (1 - k));
        ctx.beginPath(); ctx.arc(x, y, Math.max(0.5, size), 0, TAU); ctx.stroke();
        break;
      case S_ARC: {
        // crescent: thick at the middle, tapering ends
        const r = size, w = p.lw * (1 - k * 0.6);
        const a0 = p.a0 - p.span / 2, a1 = p.a0 + p.span / 2;
        ctx.fillStyle = p.color;
        ctx.beginPath();
        ctx.arc(x, y, r, a0, a1);
        // inner edge: same-size circle pushed back along the middle direction → tapered crescent
        ctx.arc(x - Math.cos(p.a0) * w, y - Math.sin(p.a0) * w, r + w * 0.15, a1, a0, true);
        ctx.closePath();
        ctx.fill();
        break;
      }
      case S_GLOW: {
        const img = glowSprite(p.color);
        const r = Math.max(1, size * (p.size2 > 20 ? 1 : 3));
        ctx.drawImage(img, x - r, y - r, r * 2, r * 2);
        break;
      }
      case S_DROP:
        ctx.fillStyle = p.color;
        ctx.beginPath(); ctx.ellipse(x, y, size * 0.7, size * (1 + Math.min(1.5, Math.abs(p.vy) / 500)), 0, 0, TAU); ctx.fill();
        break;
      case S_BUBBLE:
        ctx.strokeStyle = p.color; ctx.lineWidth = 1;
        ctx.beginPath(); ctx.arc(x + Math.sin(p.a0) * 2, y, Math.max(0.5, size), 0, TAU); ctx.stroke();
        break;
    }
  }

  function draw(ctx) {
    if (!count) return;
    const cam = G.camera;
    const x0 = cam ? cam.x - 120 : -1e9, y0 = cam ? cam.y - 120 : -1e9;
    const x1 = cam ? cam.x + cam.w + 120 : 1e9, y1 = cam ? cam.y + cam.h + 120 : 1e9;
    const ga = ctx.globalAlpha, op = ctx.globalCompositeOperation;
    // normal pass
    for (let i = 0; i < count; i++) {
      const p = pool[i];
      if (p.add || p.x < x0 || p.x > x1 || p.y < y0 || p.y > y1) continue;
      drawOne(ctx, p);
    }
    // additive pass
    ctx.globalCompositeOperation = 'lighter';
    for (let i = 0; i < count; i++) {
      const p = pool[i];
      if (!p.add || p.x < x0 || p.x > x1 || p.y < y0 || p.y > y1) continue;
      drawOne(ctx, p);
    }
    ctx.globalCompositeOperation = op;
    ctx.globalAlpha = ga;
  }

  function clear() { count = 0; }

  G.fx = {
    MAX, burst, spawn, update, draw, clear, glowSprite, glowAt,
    kinds: Object.keys(PRESETS),
    get count() { return count; },
  };
})();
