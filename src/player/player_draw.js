// src/player/player_draw.js — G.PlayerDraw: the Wickling's procedural look & animation (DESIGN §3).
// A small ivory wax candle with tall black eye-slits, a black wick crowned by a blue flame, an ash-grey
// collar with a tattered verlet scarf tail, stubby dark legs, and the Brand (dark-iron rod, glowing tip).
// The body is rendered into an offscreen canvas each frame and composited, which gives a clean
// whole-silhouette white flash, uniform i-frame transparency and true-silhouette dash afterimages.
// Flames, glows, slash crescents and other additive effects are drawn directly in world space.
// Uses G.Art / G.Art.char helpers when present (with local fallbacks). Never uses shadowBlur/filter.
(function () {
  'use strict';
  const G = globalThis.G;
  const TAU = Math.PI * 2;
  const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
  const lerp = (a, b, t) => a + (b - a) * t;
  const sstep = (a, b, x) => { const t = clamp((x - a) / (b - a), 0, 1); return t * t * (3 - 2 * t); };
  const outBack = (t) => { const c1 = 1.70158, c3 = c1 + 1; return 1 + c3 * Math.pow(t - 1, 3) + c1 * Math.pow(t - 1, 2); };

  const COL = {
    wax: '#ece5d2', waxShade: '#9c917b', waxHi: '#fffaf0',
    outline: '#121016',
    leg: '#26222c', legHi: '#5a5466',
    cloak: '#67666f', cloakDark: '#45444d', cloakHi: '#8e8d97',
    iron: '#34333d', ironHi: '#7a7888', hot: '#ff9a50', hotCore: '#fff0d0',
    eye: '#0b090e', rim: '#cfeeff',
    slash: '#7fd0ff', slashCore: '#ffffff',
    flameGlow: '#3f8cff',
    after: '#3f9dff',
  };

  // Offscreen body canvas (logical px; internal resolution × res). Feet anchor at (AX, AY).
  const OFF_W = 150, OFF_H = 120, AX = 75, AY = 98;
  const ATTACK_ANIM = 0.26;
  let off = null;                 // {canvas, ctx, res}
  const afterPool = [];           // recycled afterimage canvases

  const Art = () => G.Art || null;
  const CH = () => (G.Art && G.Art.char) || null;

  function makeCanvas(w, h) {
    if (G.U && G.U.makeCanvas) return G.U.makeCanvas(w, h);
    const c = document.createElement('canvas'); c.width = w; c.height = h;
    return { canvas: c, ctx: c.getContext('2d') };
  }
  function getOff(res) {
    if (!off || off.res !== res) {
      const c = makeCanvas(Math.ceil(OFF_W * res), Math.ceil(OFF_H * res));
      off = { canvas: c.canvas, ctx: c.ctx, res };
      afterPool.length = 0;
    }
    return off;
  }
  function glow(ctx, x, y, r, color, a) {
    if (!(r > 0) || !(a > 0.003)) return;
    if (G.Art && G.Art.glow) G.Art.glow(ctx, x, y, r, color, a);
    else if (G.fx && G.fx.glowAt) G.fx.glowAt(ctx, x, y, r, color, a);
  }
  function flame(ctx, x, y, size, t, seed, opts) {
    if (!(size > 0.5)) return;
    if (G.Art && G.Art.flame) { G.Art.flame(ctx, x, y, size, 'blue', t, seed, opts); return; }
    // fallback teardrop
    glow(ctx, x, y - size * 0.4, size * 2.2, COL.flameGlow, 0.35);
    const sway = Math.sin(t * 9 + seed) * size * 0.12 + ((opts && opts.lean) || 0);
    const layer = (r, h, c) => {
      ctx.fillStyle = c; ctx.beginPath();
      ctx.moveTo(x + sway, y - h);
      ctx.quadraticCurveTo(x + r * 1.4, y - r, x, y + r * 0.2);
      ctx.quadraticCurveTo(x - r * 1.4, y - r, x + sway, y - h);
      ctx.fill();
    };
    layer(size * 0.24, size, '#1d3ad0'); layer(size * 0.18, size * 0.75, '#38b6ff'); layer(size * 0.11, size * 0.45, '#f2fbff');
  }

  // Tiny verlet rope for the scarf tail (n segments of seg px).
  const rope = {
    create(n, seg) { const k = n + 1; return { n: k, seg, x: new Float32Array(k), y: new Float32Array(k), px: new Float32Array(k), py: new Float32Array(k), init: false }; },
    reset(c) { c.init = false; },
    update(c, ax, ay, dt, gx, gy, damp) {
      if (!c.init) { for (let i = 0; i < c.n; i++) { c.x[i] = c.px[i] = ax - i * c.seg * 0.7; c.y[i] = c.py[i] = ay + i * c.seg * 0.7; } c.init = true; }
      dt = clamp(dt, 0, 1 / 30);
      c.x[0] = c.px[0] = ax; c.y[0] = c.py[0] = ay;
      for (let i = 1; i < c.n; i++) {
        const vx = (c.x[i] - c.px[i]) * damp, vy = (c.y[i] - c.py[i]) * damp;
        c.px[i] = c.x[i]; c.py[i] = c.y[i];
        c.x[i] += vx + gx * dt * dt; c.y[i] += vy + gy * dt * dt;
      }
      for (let it = 0; it < 4; it++) {
        for (let i = 1; i < c.n; i++) {
          const dx = c.x[i] - c.x[i - 1], dy = c.y[i] - c.y[i - 1];
          const d = Math.hypot(dx, dy) || 1e-4, diff = (d - c.seg) / d;
          if (i === 1) { c.x[i] -= dx * diff; c.y[i] -= dy * diff; }
          else { c.x[i] -= dx * diff * 0.5; c.y[i] -= dy * diff * 0.5; c.x[i - 1] += dx * diff * 0.5; c.y[i - 1] += dy * diff * 0.5; }
        }
        c.x[0] = ax; c.y[0] = ay;
      }
    },
  };

  // ===================================================================================== per-player state
  function ensure(p) {
    if (p.gfx) return p.gfx;
    p.gfx = {
      cloth: rope.create(3, 5.8),
      sq: 1, sqV: 0,             // squash & stretch spring (vertical scale)
      turnT: 0, lastFacing: p.facing || 1,
      after: [],                 // dash afterimages {x, y, life, max, img}
      afterStep: 0,
      ripples: [],               // swim ripples {x, y, t, max}
      rippleT: 0,
      kindleFlash: 0,
      clangT: 0,
      pogoT: 0,
      blinkSeed: 7,
      pose: {},
    };
    return p.gfx;
  }

  function reset(p) {
    const g = p.gfx;
    if (!g) return;
    if (g.cloth) rope.reset(g.cloth);
    g.sq = 1; g.sqV = 0; g.after.length = 0; g.ripples.length = 0; g.kindleFlash = 0; g.turnT = 0;
  }

  // Animation triggers from the controller (player.js).
  function onEvent(p, name, data) {
    const g = ensure(p);
    switch (name) {
      case 'land': g.sq = Math.min(g.sq, 1 - clamp((data || 0) / 960, 0.1, 1) * 0.24); g.sqV = 0; break;
      case 'hardland': g.sq = 0.64; g.sqV = 0; break;
      case 'jump': case 'walljump': g.sq = 1.2; g.sqV = 0; break;
      case 'doublejump': g.sq = 1.16; g.sqV = 0; break;
      case 'pogo': g.sq = 1.18; g.sqV = 0; g.pogoT = 0.15; break;
      case 'grip': g.sq = 0.9; g.sqV = 0; break;
      case 'plungeLand': g.sq = 0.6; g.sqV = 0; break;
      case 'kindleDone': g.kindleFlash = 0.22; break;
      case 'clang': g.clangT = 0.1; break;
      case 'splash': case 'ripple': addRipple(p, g, 1); break;
      case 'teleport': if (g.cloth) rope.reset(g.cloth); g.after.length = 0; g.ripples.length = 0; break;
      case 'dash': g.afterStep = 0; break;
      default: break;
    }
  }

  function addRipple(p, g, strong) {
    const m = p.motor || {};
    if (!m.inWater && !m.swimming) return;
    const y = m.surfaceY || (p.y + p.h);
    if (g.ripples.length > 8) g.ripples.shift();
    g.ripples.push({ x: p.x + p.w / 2 + (Math.random() - 0.5) * 6, y, t: 0, max: strong ? 0.9 : 0.7, s: strong ? 1 : 0.7 });
  }

  // Fixed-step update: springs, cloth, afterimages, ripples.
  function update(p, dt) {
    const g = ensure(p);
    const m = p.motor || {};
    const t = G.game ? G.game.t : 0;
    // squash spring
    g.sqV += (1 - g.sq) * 520 * dt;
    g.sqV *= Math.exp(-20 * dt);
    g.sq += g.sqV * dt;
    g.sq = clamp(g.sq, 0.5, 1.5);
    if ((p.facing || 1) !== g.lastFacing) { g.lastFacing = p.facing || 1; if (m.onGround) g.turnT = 0.09; }
    g.turnT = Math.max(0, g.turnT - dt);
    g.kindleFlash = Math.max(0, g.kindleFlash - dt);
    g.clangT = Math.max(0, g.clangT - dt);
    g.pogoT = Math.max(0, g.pogoT - dt);
    // afterimages while dashing (every 2nd step)
    if (m.dashTime > 0) {
      if ((g.afterStep++ % 2) === 0) {
        if (g.after.length >= 6) g.after.shift();
        g.after.push({ x: p.x + p.w / 2, y: p.y + p.h, life: 0.2, max: 0.2, img: null });
      }
    }
    for (let i = g.after.length - 1; i >= 0; i--) { g.after[i].life -= dt; if (g.after[i].life <= 0) { releaseAfter(g.after[i]); g.after.splice(i, 1); } }
    // ripples
    if (m.swimming) {
      g.rippleT -= dt;
      if (g.rippleT <= 0) { g.rippleT = Math.abs(m.vx) > 20 ? 0.18 : 0.7; addRipple(p, g, 0); }
    }
    for (let i = g.ripples.length - 1; i >= 0; i--) { const r = g.ripples[i]; r.t += dt; if (r.t >= r.max) g.ripples.splice(i, 1); }
    // scarf
    if (g.cloth) {
      const pose = poseFrom(p, t, g);
      const a = toWorld(pose, -10.4, -20.9);
      const vx = m.vx || 0;
      let wind = -vx * 7 - pose.facing * 140 + Math.sin(t * 7.3) * 160;
      let grav = 640;
      if (m.dashTime > 0) wind = -(m.dashDir || pose.facing) * 5200;
      if (m.plunging) { grav = -2600; wind *= 0.2; }
      else if (!m.onGround && !m.swimming && !m.wall) grav = 640 - clamp(m.vy || 0, -800, 960) * 1.4;
      if (m.swimming) { grav = 260; wind *= 0.5; }
      if (pose.state === 'rest') { grav = 700; wind = -pose.facing * 40; }
      rope.update(g.cloth, a.x, a.y, dt, wind, grav, 0.86);
      // keep the scarf off the floor (it rests on / slides along the ground instead of passing through)
      const c = g.cloth, floor = pose.y + pose.lift - 3;
      for (let i = 1; i < c.n; i++) if (c.y[i] > floor) { c.y[i] = floor; c.py[i] = floor; }
    }
  }

  function releaseAfter(a) { if (a.img && afterPool.length < 8) afterPool.push(a.img); a.img = null; }

  // ===================================================================================== pose
  // Local frame: feet at (0,0), +x = forward (facing), +y = down. World transform: translate(x, y + lift)
  // → scale(facing, 1) → rotate(rot) → scale(sx, sy).
  function toWorld(P, lx, ly) {
    const X = lx * P.sx, Y = ly * P.sy;
    const c = Math.cos(P.rot), s = Math.sin(P.rot);
    return { x: P.x + P.facing * (c * X - s * Y), y: P.y + P.lift + (s * X + c * Y) };
  }
  // Lowest local point after rotation → lift that keeps the shape on the ground (lying / getting up).
  function groundLift(rot, sx, sy) {
    const pts = [[-11, -7.5], [11, -7.5], [-10, -37.5], [10, -37.5], [-5, 0], [5, 0]];
    let maxY = -1e9;
    const c = Math.cos(rot), s = Math.sin(rot);
    for (const [x, y] of pts) maxY = Math.max(maxY, s * x * sx + c * y * sy);
    return -maxY;
  }

  function poseFrom(p, t, g) {
    const P = g.pose;
    const m = p.motor || {};
    const facing = p.facing || 1;
    const vx = m.vx || 0, vy = m.vy || 0;
    P.x = (m.x != null ? m.x : p.x) + p.w / 2;
    P.y = (m.y != null ? m.y : p.y) + p.h;
    P.facing = facing; P.rot = 0; P.sx = 1; P.sy = 1; P.lift = 0;
    P.state = 'idle'; P.legs = 'stand'; P.phase = 0; P.spread = 0;
    P.blink = CH() ? CH().blinkAt(t, g.blinkSeed, 3.2) : 0; P.look = 0; P.lookY = 0;
    P.flameSize = 15; P.flameLean = -vx * 0.018; P.flameGlow = 1; P.lit = 1;
    P.brand = 0.75; P.brandBehind = false; P.brandGlow = 0.8;
    P.flash = 0; P.alpha = 1; P.melt = 0; P.dead = false;
    P.slash = null; P.kindle = 0; P.wings = 0;
    P.streak = 0; P.plunge = false; P.ember = 0; P.smoke = 0; P.puddle = 0; P.armReach = 6.5;
    P.sit = 0; P.lying = 0;

    // ---------------------------------------------------------------- death (melt)
    if (p.dying) {
      const dT = (G.game && G.game.mode === 'dead' && G.game.player === p) ? G.game.deathTime : (p.deathT || 0);
      P.state = 'dead'; P.dead = true;
      const shock = sstep(0, 0.12, dT) * (1 - sstep(0.12, 0.3, dT));
      const melt = sstep(0.22, 1.05, dT);
      P.melt = melt;
      P.sy = (1 + 0.06 * shock) * (1 - 0.72 * melt);
      P.sx = 1 + 0.55 * melt;
      P.rot = -0.12 * shock + Math.sin(dT * 40) * 0.05 * shock;
      P.blink = 0.15 + 0.85 * sstep(0.3, 0.6, dT);
      P.lit = 1 - sstep(0.35, 0.55, dT);
      P.flameSize = 15 * (1 + 0.3 * Math.sin(dT * 60) * (1 - P.lit));
      P.flameLean = Math.sin(dT * 33) * 6;
      P.smoke = sstep(0.45, 0.6, dT) * (1 - sstep(2.2, 3, dT));
      P.puddle = sstep(0.35, 1.2, dT);
      P.legs = 'melt';
      P.brand = 1.9; P.brandBehind = false; P.brandGlow = 0.8 * (1 - melt);
      P.alpha = 1 - sstep(1.25, 1.6, dT) * 0.0;
      return P;
    }

    // ---------------------------------------------------------------- cinematics
    const cine = p.cine;
    if (cine && cine.kind === 'wake') {
      const ct = cine.t, IGN = 1.35;
      P.state = 'wake';
      const rise = outBack(sstep(1.85, 2.55, ct));
      const lie = 1 - rise;
      P.lying = lie;
      P.rot = -Math.PI / 2 * lie;
      P.lift = groundLift(P.rot, 1, 1);
      P.legs = lie > 0.5 ? 'lie' : 'stand';
      P.lit = sstep(IGN - 0.05, IGN + 0.25, ct);
      P.flameSize = 15 * (1 + 0.5 * Math.exp(-Math.max(0, ct - IGN) * 6) * P.lit);
      P.ember = ct < IGN ? 0.5 + 0.5 * Math.sin(ct * 5) : 0;
      P.blink = ct < IGN + 0.15 ? 1 : ct < IGN + 0.45 ? 1 - sstep(IGN + 0.15, IGN + 0.45, ct) : P.blink;
      if (ct > 2.6) { P.look = ct < 2.95 ? -2.5 * sstep(2.6, 2.75, ct) : 2.5 * sstep(2.95, 3.1, ct) - 2.5 * (1 - sstep(2.95, 3.1, ct)); }
      P.brand = lerp(Math.PI / 2, 0.75, rise); P.brandBehind = lie > 0.3;
      if (ct > 2.5 && ct < 2.8) { const k = (ct - 2.5) / 0.3; P.sy = 1 - 0.12 * Math.sin(k * Math.PI); P.sx = 1 / Math.sqrt(P.sy); }
      return P;
    }
    if (cine && cine.kind === 'pose') {
      const ct = cine.t, k = sstep(0, 0.35, ct) * (1 - sstep(cine.dur - 0.3, cine.dur, ct));
      P.state = 'pose';
      if (cine.name === 'ability') {
        P.sy = 1 + 0.06 * k; P.sx = 1 / Math.sqrt(P.sy);
        P.brand = lerp(0.75, -Math.PI / 2 - 0.15, k);
        P.lookY = -1.6 * k; P.look = -1 * k;
        P.flameSize = 15 + 9 * k + Math.sin(t * 18) * 1.5 * k;
        P.flameGlow = 1 + k;
        P.kindle = 0.6 * k;
        P.blink = 0;
      } else if (cine.name === 'kneel' || cine.name === 'bow') {
        P.rot = 0.22 * k; P.sy = 1 - 0.1 * k; P.blink = 0.6 * k; P.legs = 'kneel'; P.brand = lerp(0.75, 1.5, k);
      } else if (cine.name === 'look_up') {
        P.lookY = -1.8 * k; P.blink = 0;
      }
      return P;
    }

    // ---------------------------------------------------------------- resting at a sconce
    if (p.resting || p.standT > 0) {
      const k = p.resting ? 1 : clamp(p.standT / 0.16, 0, 1);
      P.state = 'rest';
      P.sit = k;
      P.lift = 6 * k;
      P.legs = 'sit';
      P.sy = 1 - 0.03 * k + Math.sin(t * 1.6) * 0.012 * k;
      P.rot = -0.05 * k;
      P.blink = p.resting ? 0.55 + 0.45 * sstep(-1, 1, Math.sin(t * 0.7)) : P.blink;
      P.flameSize = 13.5 + Math.sin(t * 2) * 0.4;
      // the Brand rests across the lap, its hot tip dipped into the ash in front (relaxed, not "aiming")
      P.brand = lerp(0.75, 1.02, k);
      P.brandGlow = 0.8 - 0.35 * k;
      return P;
    }

    // ---------------------------------------------------------------- locomotion
    if (m.hazard) {
      P.state = 'hurt'; P.rot = -0.2; P.blink = 0.75; P.brand = 2.3; P.brandBehind = true; P.legs = 'tuck';
    } else if (m.plunging) {
      P.state = 'plunge'; P.plunge = true; P.legs = 'tuck';
      P.sy = 1.14; P.sx = 0.88; P.flameSize = 22 + Math.sin(t * 30) * 2; P.flameLean = 0; P.streak = 1;
      P.brand = 1.62; P.blink = 0.35;
    } else if (p.plungeLandT > 0) {
      const k = p.plungeLandT / 0.28;
      P.state = 'plungeland'; P.legs = 'crouch'; P.spread = k; P.brand = 1.3; P.flameSize = 15 + 6 * k;
    } else if (m.dashTime > 0) {
      P.state = 'dash'; P.legs = 'trail';
      P.rot = 0.3; P.sx = 1.18; P.sy = 0.86; P.flameLean = -(m.dashDir || facing) * 13; P.flameSize = 17;
      P.brand = 2.75; P.brandBehind = true; P.blink = 0.2; P.streak = 1;
    } else if (m.swimming) {
      P.state = 'swim'; P.legs = 'swim'; P.phase = t * 9;
      P.lift = Math.sin(t * 3.4) * 1.4;
      P.rot = clamp(vx / 330, -1, 1) * facing * 0.1;
      P.brand = 0.35; P.flameLean = -vx * 0.02;
    } else if (m.wall) {
      P.state = 'wall'; P.legs = 'wall';
      P.rot = -0.07; P.sx = 0.92;
      P.brand = 0.62; P.flameLean = 0; P.flameSize = 15.5;
    } else if (!m.onGround) {
      if (p.djumpT > 0) { P.wings = clamp(1 - p.djumpT / 0.38, 0, 1); }
      if (vy < -140) {
        P.state = 'rise'; P.legs = 'tuck'; P.spread = 0.6;
        P.sy = 1 + 0.12 * clamp(-vy / 740, 0, 1); P.sx = 1 / Math.sqrt(P.sy);
        P.brand = 2.5; P.brandBehind = true; P.flameLean = -vx * 0.02; P.flameSize = 15 + clamp(-vy / 740, 0, 1) * 2;
      } else if (vy < 160) {
        P.state = 'apex'; P.legs = 'spread'; P.spread = 1; P.brand = 2.35; P.brandBehind = true;
      } else {
        P.state = 'fall'; P.legs = 'dangle';
        P.sy = 1 + 0.06 * clamp(vy / 960, 0, 1); P.sx = 1 / Math.sqrt(P.sy);
        P.brand = 2.45; P.brandBehind = true; P.flameSize = 15 + clamp(vy / 960, 0, 1) * 3; P.flameLean = -vx * 0.02;
      }
      if (P.wings > 0) { P.legs = 'tuck'; P.spread = 0.3; }
    } else if (Math.abs(vx) > 20) {
      P.state = 'run'; P.legs = 'run';
      P.phase = p.runPhase || 0;
      P.rot = 0.1;
      P.lift = -Math.abs(Math.sin(P.phase)) * 1.8;
      P.brand = 2.3; P.brandBehind = true;
    } else {
      P.state = 'idle';
      P.sy = 1 + Math.sin(t * 2.3) * 0.016; P.sx = 1 - Math.sin(t * 2.3) * 0.01;
      P.brand = 0.75 + Math.sin(t * 2.3) * 0.04;
      if (p.landT > 0) P.legs = 'crouch', P.spread = p.landT / 0.22;
    }

    // ---------------------------------------------------------------- actions overlaid on locomotion
    if (p.kindle) {
      const q = clamp(p.kindle.t / (p.kindle.dur || 0.9), 0, 1);
      P.state = 'kindle'; P.kindle = 0.35 + 0.65 * q;
      P.legs = 'crouch'; P.spread = 0.5;
      P.sy *= 0.95 + Math.sin(t * 14) * 0.01 * q; P.sx = 1 / Math.sqrt(P.sy);
      P.blink = 0.9; P.brand = 1.5; P.flameSize = 15 + 9 * q + Math.sin(t * 22) * 1.2 * q; P.flameGlow = 1 + q;
      P.flameLean = Math.sin(t * 6) * 1.5;
    } else if (p.castT > 0) {
      const k = 1 - p.castT / 0.3;
      const wind = sstep(0, 0.18, k), thrust = sstep(0.12, 0.35, k), back = sstep(0.55, 1, k);
      P.state = 'cast';
      P.rot += -0.14 * wind * (1 - thrust) + 0.16 * thrust * (1 - back);
      P.brand = lerp(lerp(2.4, -0.15, thrust), P.brand, back);
      P.brandBehind = thrust < 0.3;
      P.armReach = 6.5 + 4 * thrust * (1 - back);
      P.flameLean = P.facing * 7 * thrust * (1 - back);
      P.flameSize = 15 + 5 * thrust * (1 - back);
      P.blink = 0;
    } else if (p.slash) {
      const s = p.slash;
      const k = clamp(s.t / ATTACK_ANIM, 0, 1);
      const sw = sstep(0, 0.4, k), rec = sstep(0.45, 1, k);
      const rc = (p.reach && typeof p.reach === 'function') ? p.reach() : 1;
      P.slash = { dir: s.dir, k, alt: s.alt || 0, reach: rc, facing: s.facing || P.facing };
      P.blink = 0;
      let a0, a1, lean = 0;
      if (s.dir === 'up') { a0 = 0.9; a1 = -2.55; lean = -0.12; }
      else if (s.dir === 'down') { a0 = -1.1; a1 = 1.95; lean = 0.18; P.legs = 'tuck'; P.spread = 0.2; }
      else if (s.alt) { a0 = 1.95; a1 = -0.85; lean = 0.14; }
      else { a0 = -2.1; a1 = 1.05; lean = 0.14; }
      const a = lerp(a0, a1, sw);
      P.brand = lerp(a, P.brand, rec * 0.85);
      P.brandBehind = Math.cos(P.brand) < -0.35 && s.dir !== 'up';
      P.rot += lean * (sw < 1 ? sw : 1 - rec);
      P.armReach = 6.5 + 3.5 * sw * (1 - rec);
      P.brandGlow = 1;
    }
    if (p.hurtT > 0 && !m.hazard) {
      const k = p.hurtT / 0.3;
      P.state = P.state === 'idle' || P.state === 'run' ? 'hurt' : P.state;
      P.rot += -0.28 * k; P.blink = Math.max(P.blink, 0.7 * k);
      P.sy *= 1 - 0.06 * k;
    }
    // squash spring + turn squish
    P.sy *= g.sq; P.sx *= 1 / Math.sqrt(g.sq);
    if (g.turnT > 0) P.sx *= 1 - 0.14 * (g.turnT / 0.09);
    // white flash / i-frame flicker / re-ignite
    P.flash = Math.max(p.flashT > 0 ? clamp(p.flashT / 0.12, 0, 1) : 0, g.kindleFlash > 0 ? 0.5 * g.kindleFlash / 0.22 : 0);
    if (m.hazard) P.flash = Math.max(P.flash, 0.35 + 0.35 * Math.sin(t * 40));
    if (p.flickerT > 0 && !m.hazard) P.alpha = (Math.floor(t * 18) % 2 === 0) ? 0.38 : 0.92;
    if (p.respawnT > 0) { const k = 1 - p.respawnT / 0.6; P.lit = Math.min(P.lit, sstep(0, 0.6, k)); }
    return P;
  }

  // ===================================================================================== body rendering
  function drawLeg(ctx, hx, hy, fx, fy, front) {
    ctx.lineCap = 'round';
    ctx.strokeStyle = COL.outline; ctx.lineWidth = 6.6;
    ctx.beginPath(); ctx.moveTo(hx, hy); ctx.lineTo(fx, fy); ctx.stroke();
    ctx.strokeStyle = front ? COL.leg : '#1b1820'; ctx.lineWidth = 4.2;
    ctx.beginPath(); ctx.moveTo(hx, hy); ctx.lineTo(fx, fy); ctx.stroke();
    // foot nub (toe forward)
    ctx.fillStyle = COL.outline;
    ctx.beginPath(); ctx.ellipse(fx + 1.4, fy - 0.6, 3.6, 2.4, 0, 0, TAU); ctx.fill();
    ctx.fillStyle = front ? COL.leg : '#1b1820';
    ctx.beginPath(); ctx.ellipse(fx + 1.4, fy - 0.8, 2.5, 1.4, 0, 0, TAU); ctx.fill();
    if (front) { // rim highlight so legs read on dark backgrounds
      ctx.strokeStyle = COL.legHi; ctx.lineWidth = 1;
      ctx.beginPath(); ctx.moveTo(hx + 1.4, hy + 1); ctx.lineTo(fx + 1.4, fy - 1.5); ctx.stroke();
    }
  }

  function legTargets(P, t) {
    // returns [[hx,hy,fx,fy] back, [..] front] in local coords (feet at y=0)
    const hy = -10, L = 10;
    const B = [-3.5, hy], F = [3.5, hy];
    let bf, ff;
    switch (P.legs) {
      case 'run': {
        const ph = P.phase;
        const s1 = Math.sin(ph), s2 = Math.sin(ph + Math.PI);
        const leg = (h, s) => { const a = s * 0.75; const lift = Math.max(0, Math.cos(ph + (s === s1 ? 0 : Math.PI))) * 3.2; return [h[0] + Math.sin(a) * L, hy + Math.cos(a) * L - lift]; };
        bf = leg(B, s2); ff = leg(F, s1);
        break;
      }
      case 'tuck': { const sp = P.spread || 0; bf = [-4 - sp * 1.5, -3.5]; ff = [5 + sp * 1.5, -4.5]; break; }
      case 'spread': bf = [-6.5, -1.5]; ff = [6.5, -1.5]; break;
      case 'dangle': bf = [-5, 0.5]; ff = [3, 1]; break;
      case 'trail': bf = [-10, -3.5]; ff = [-6, -1.5]; break;
      case 'crouch': { const k = P.spread || 0; bf = [-5.5 - 2 * k, 0]; ff = [5.5 + 2 * k, 0]; break; }
      case 'wall': bf = [-8.5, -5]; ff = [-3, -1]; break;
      case 'sit': bf = [5, -2.2]; ff = [10, -2.2]; break;
      case 'kneel': bf = [-7, -1]; ff = [5, 0]; break;
      case 'swim': { const a = Math.sin(P.phase) * 0.6; bf = [-3.5 - Math.sin(a) * 5, 0]; ff = [3.5 + Math.sin(a) * 5, -1]; break; }
      case 'lie': bf = [-5, -1.2]; ff = [3, 0]; break;
      case 'melt': { const k = P.melt; bf = [-4 - 3 * k, 0]; ff = [4 + 3 * k, 0]; break; }
      default: bf = [-3.8, 0]; ff = [3.8, 0];
    }
    void t;
    return [[B[0], B[1], bf[0], bf[1]], [F[0], F[1], ff[0], ff[1]]];
  }

  // Ash-grey cowl wrapping the body just below the eyes (dips to a soft point in front), knot at the back.
  function drawCollar(ctx) {
    const y = -22.5;
    const p = new Path2D();
    p.moveTo(-11.6, y - 1.3);
    p.quadraticCurveTo(0, y + 2.3, 11.5, y - 1.1);
    p.lineTo(12.0, y + 3.2);
    p.lineTo(6.2, y + 5.2);
    p.lineTo(3.4, y + 8.6);
    p.lineTo(0.8, y + 5.6);
    p.quadraticCurveTo(-6, y + 6.3, -12.0, y + 3.3);
    p.closePath();
    ctx.lineJoin = 'round';
    ctx.strokeStyle = COL.outline; ctx.lineWidth = 2.8; ctx.stroke(p);
    ctx.fillStyle = COL.cloak; ctx.fill(p);
    ctx.save(); ctx.clip(p);
    ctx.strokeStyle = COL.cloakHi; ctx.lineWidth = 1.2;
    ctx.beginPath(); ctx.moveTo(-10, y + 0.3); ctx.quadraticCurveTo(0, y + 3.6, 10, y + 0.4); ctx.stroke();
    ctx.strokeStyle = 'rgba(0,0,0,0.32)'; ctx.lineWidth = 1.4;
    ctx.beginPath(); ctx.moveTo(-11, y + 4); ctx.quadraticCurveTo(-3, y + 6.4, 2.6, y + 7.4); ctx.stroke();
    ctx.restore();
    ctx.fillStyle = COL.outline; ctx.beginPath(); ctx.ellipse(-10.4, y + 1.6, 2.7, 2.6, 0, 0, TAU); ctx.fill();
    ctx.fillStyle = COL.cloakDark; ctx.beginPath(); ctx.ellipse(-10.4, y + 1.6, 1.6, 1.5, 0, 0, TAU); ctx.fill();
  }

  // The wax body: a short, slightly tapered candle with rounded shoulders, a melted rim, a side drip on the
  // back and two raised front drips. Lit from the front/top (its own flame), blue rim light from above.
  const BODY = { yb: -7.5, yt: -37.5, wb: 10.3, wt: 9.3, r: 5.5 };
  let bodyPath = null, dripPaths = null;
  function buildBody() {
    const { yb, yt, wb, wt, r } = BODY;
    const p = new Path2D();
    p.moveTo(-wb + 2.5, yb);
    p.quadraticCurveTo(-wb, yb, -wb + 0.1, yb - 2.5);
    p.lineTo(-wt, yt + r);
    p.quadraticCurveTo(-wt, yt, -wt + r, yt);
    p.bezierCurveTo(-3, yt + 1.7, 2, yt + 1.9, wt - r, yt + 0.2);
    p.quadraticCurveTo(wt, yt, wt, yt + r);
    p.lineTo(wb - 0.1, yb - 2.5);
    p.quadraticCurveTo(wb, yb, wb - 2.5, yb);
    p.quadraticCurveTo(0, yb + 1.3, -wb + 2.5, yb);
    p.closePath();
    // back-side drip bulging out of the silhouette (clockwise → unions with the body)
    p.moveTo(-10.6, -28.5); p.lineTo(-8.2, -28.5); p.lineTo(-8.2, -19.5);
    p.arc(-9.4, -19.5, 1.2, 0, Math.PI, false); p.closePath();
    bodyPath = p;
    dripPaths = [[4.6, 10.5, 1.7], [-2.6, 5.5, 1.35]].map(([x, len, w]) => {
      const d = new Path2D();
      d.moveTo(x - w, yt + 1); d.lineTo(x - w, yt + len); d.arc(x, yt + len, w, Math.PI, 0, true); d.lineTo(x + w, yt + 1); d.closePath();
      return { d, x, len, w };
    });
  }
  function drawWaxBody(ctx, P) {
    if (!bodyPath) buildBody();
    const { yb, yt, wb } = BODY;
    ctx.lineJoin = 'round';
    ctx.strokeStyle = COL.outline; ctx.lineWidth = 3; ctx.stroke(bodyPath);
    ctx.fillStyle = COL.wax; ctx.fill(bodyPath);
    ctx.save();
    ctx.clip(bodyPath);
    const gx = ctx.createLinearGradient(wb + 1, 0, -wb - 2, 0);
    gx.addColorStop(0, 'rgba(255,255,255,0.32)'); gx.addColorStop(0.35, 'rgba(255,255,255,0.04)');
    gx.addColorStop(0.65, 'rgba(58,48,64,0.06)'); gx.addColorStop(1, 'rgba(58,48,64,0.42)');
    ctx.fillStyle = gx; ctx.fillRect(-14, yt - 3, 28, yb - yt + 6);
    const gy = ctx.createLinearGradient(0, -17, 0, yb + 1);
    gy.addColorStop(0, 'rgba(40,30,40,0)'); gy.addColorStop(1, 'rgba(40,30,40,0.3)');
    ctx.fillStyle = gy; ctx.fillRect(-14, -17, 28, yb + 18);
    // melt pool on the rim
    ctx.fillStyle = 'rgba(70,60,60,0.16)';
    ctx.beginPath(); ctx.ellipse(0.5, yt + 1.6, 5.5, 1.3, 0, 0, TAU); ctx.fill();
    // raised front drips
    for (const q of dripPaths) {
      ctx.fillStyle = 'rgba(40,30,30,0.13)';
      ctx.beginPath(); ctx.ellipse(q.x + 0.6, yt + q.len + q.w + 0.6, q.w * 1.1, q.w * 0.8, 0, 0, TAU); ctx.fill();
      ctx.fillStyle = COL.waxHi; ctx.fill(q.d);
      ctx.fillStyle = 'rgba(255,255,255,0.6)'; ctx.fillRect(q.x - q.w * 0.5, yt + 1.5, 0.8, q.len * 0.7);
    }
    // blue rim light from the flame above
    const gr = ctx.createLinearGradient(0, yt - 1, 0, yt + 14);
    gr.addColorStop(0, 'rgba(207,238,255,0.85)'); gr.addColorStop(1, 'rgba(207,238,255,0)');
    ctx.strokeStyle = gr; ctx.lineWidth = 2.6; ctx.stroke(bodyPath);
    ctx.restore();
    void P;
    return { path: bodyPath };
  }

  // Scarf tail: a tapered ribbon along the verlet points with a swallowtail end (world coordinates).
  function drawScarf(ctx, c) {
    if (!c || !c.init) return;
    const n = c.n, L = [], R = [];
    for (let i = 0; i < n; i++) {
      const a = Math.max(0, i - 1), b = Math.min(n - 1, i + 1);
      let tx = c.x[b] - c.x[a], ty = c.y[b] - c.y[a];
      const tl = Math.hypot(tx, ty) || 1; tx /= tl; ty /= tl;
      const w = lerp(3.4, 2.3, i / (n - 1));
      L.push([c.x[i] - ty * w, c.y[i] + tx * w]); R.push([c.x[i] + ty * w, c.y[i] - tx * w]);
    }
    const ex = c.x[n - 1], ey = c.y[n - 1];
    let fx = ex - c.x[n - 2], fy = ey - c.y[n - 2];
    const fl = Math.hypot(fx, fy) || 1; fx /= fl; fy /= fl;
    const p = new Path2D();
    p.moveTo(L[0][0], L[0][1]);
    for (let i = 1; i < n; i++) p.lineTo(L[i][0], L[i][1]);
    p.lineTo(L[n - 1][0] + fx * 5, L[n - 1][1] + fy * 5);
    p.lineTo(ex + fx * 1.2, ey + fy * 1.2);
    p.lineTo(R[n - 1][0] + fx * 6.5, R[n - 1][1] + fy * 6.5);
    for (let i = n - 1; i >= 0; i--) p.lineTo(R[i][0], R[i][1]);
    p.closePath();
    ctx.lineJoin = 'round';
    ctx.strokeStyle = COL.outline; ctx.lineWidth = 2.6; ctx.stroke(p);
    ctx.fillStyle = COL.cloak; ctx.fill(p);
    ctx.strokeStyle = 'rgba(0,0,0,0.28)'; ctx.lineWidth = 1.2;
    ctx.beginPath(); ctx.moveTo(c.x[0], c.y[0]); for (let i = 1; i < n; i++) ctx.lineTo(c.x[i], c.y[i]); ctx.stroke();
  }

  // Tall black eye-slits (almond shaped), closing vertically when blinking.
  function drawEyes(ctx, x, y, blink) {
    const h = Math.max(1.1, 11.5 * (1 - clamp(blink, 0, 1))), w = 3.3;
    ctx.fillStyle = COL.eye;
    for (const ex of [x - 3.9, x + 3.9]) {
      const k = ex > x ? 1 : 0.92;           // far eye slightly narrower (3/4 view)
      ctx.beginPath();
      ctx.moveTo(ex, y - h / 2);
      ctx.bezierCurveTo(ex + w * 0.75 * k, y - h * 0.3, ex + w * 0.75 * k, y + h * 0.3, ex, y + h / 2);
      ctx.bezierCurveTo(ex - w * 0.75 * k, y + h * 0.3, ex - w * 0.75 * k, y - h * 0.3, ex, y - h / 2);
      ctx.fill();
      if (h > 6) { ctx.fillStyle = 'rgba(255,255,255,0.5)'; ctx.fillRect(ex - 0.9, y - h * 0.3, 0.9, h * 0.22); ctx.fillStyle = COL.eye; }
    }
  }

  function brandGeom(P) {
    const a = P.brand;
    const sx = 5, sy = -18;                       // front shoulder (under the collar)
    const hx = sx + Math.cos(a) * P.armReach, hy = sy + Math.sin(a) * P.armReach;
    const L = 20;
    return { a, sx, sy, hx, hy, tx: hx + Math.cos(a) * L, ty: hy + Math.sin(a) * L, bx: hx - Math.cos(a) * 3, by: hy - Math.sin(a) * 3 };
  }

  function drawBrand(ctx, P) {
    const b = brandGeom(P);
    ctx.lineCap = 'round';
    // rod
    ctx.strokeStyle = COL.outline; ctx.lineWidth = 4.6;
    ctx.beginPath(); ctx.moveTo(b.bx, b.by); ctx.lineTo(b.tx, b.ty); ctx.stroke();
    ctx.strokeStyle = COL.iron; ctx.lineWidth = 2.4;
    ctx.beginPath(); ctx.moveTo(b.bx, b.by); ctx.lineTo(b.tx, b.ty); ctx.stroke();
    ctx.strokeStyle = COL.ironHi; ctx.lineWidth = 0.9;
    const nx = -Math.sin(b.a) * 0.6, ny = Math.cos(b.a) * 0.6;
    ctx.beginPath(); ctx.moveTo(b.bx - nx, b.by - ny); ctx.lineTo(b.tx - nx - Math.cos(b.a) * 5, b.ty - ny - Math.sin(b.a) * 5); ctx.stroke();
    // hot tip
    const kx = b.tx - Math.cos(b.a) * 4.5, ky = b.ty - Math.sin(b.a) * 4.5;
    ctx.strokeStyle = COL.hot; ctx.lineWidth = 2.6;
    ctx.beginPath(); ctx.moveTo(kx, ky); ctx.lineTo(b.tx, b.ty); ctx.stroke();
    ctx.fillStyle = COL.hotCore; ctx.beginPath(); ctx.arc(b.tx, b.ty, 1.2, 0, TAU); ctx.fill();
    // guard ring near the grip
    ctx.fillStyle = COL.outline;
    const gx = b.hx + Math.cos(b.a) * 3.2, gy = b.hy + Math.sin(b.a) * 3.2;
    ctx.beginPath(); ctx.arc(gx, gy, 2.3, 0, TAU); ctx.fill();
    ctx.fillStyle = COL.ironHi; ctx.beginPath(); ctx.arc(gx, gy, 1.1, 0, TAU); ctx.fill();
  }

  function drawArm(ctx, P) {
    const b = brandGeom(P);
    ctx.lineCap = 'round';
    ctx.strokeStyle = COL.outline; ctx.lineWidth = 6;
    ctx.beginPath(); ctx.moveTo(b.sx, b.sy); ctx.lineTo(b.hx, b.hy); ctx.stroke();
    ctx.strokeStyle = COL.wax; ctx.lineWidth = 3.4;
    ctx.beginPath(); ctx.moveTo(b.sx, b.sy); ctx.lineTo(b.hx, b.hy); ctx.stroke();
    ctx.fillStyle = COL.outline; ctx.beginPath(); ctx.arc(b.hx, b.hy, 3.1, 0, TAU); ctx.fill();
    ctx.fillStyle = COL.wax; ctx.beginPath(); ctx.arc(b.hx, b.hy, 2.0, 0, TAU); ctx.fill();
  }

  // Smokewing: two smoky wings unfurl from the shoulders, beat down once and dissolve (world space).
  function drawWings(ctx, P, t) {
    const k = P.wings;
    if (!(k > 0)) return;
    const open = sstep(0, 0.22, k), fade = 1 - sstep(0.35, 1, k);
    if (fade <= 0.01) return;
    const base = toWorld(P, -1, -23);
    const flap = lerp(-0.35, 0.6, sstep(0.12, 0.7, k));
    const S = 10 + 20 * open;
    const pa = ctx.globalAlpha;
    for (const side of [-1, 1]) {
      ctx.save();
      ctx.translate(base.x + side * 3, base.y);
      ctx.scale(side, 1);
      ctx.rotate(flap);
      const p = new Path2D();
      p.moveTo(0, 2);
      p.bezierCurveTo(S * 0.25, -S * 0.7, S * 0.7, -S * 0.82, S, -S * 0.62);
      p.quadraticCurveTo(S * 0.98, -S * 0.36, S * 0.84, -S * 0.3);
      p.quadraticCurveTo(S * 0.8, -S * 0.08, S * 0.6, -S * 0.12);
      p.quadraticCurveTo(S * 0.52, S * 0.08, S * 0.34, -S * 0.02);
      p.quadraticCurveTo(S * 0.2, S * 0.14, 0, 5);
      p.closePath();
      const gr = ctx.createLinearGradient(0, 0, S, -S * 0.6);
      gr.addColorStop(0, 'rgba(40,41,52,0.95)'); gr.addColorStop(1, 'rgba(110,114,132,0.55)');
      ctx.globalAlpha = pa * fade;
      ctx.lineJoin = 'round';
      ctx.strokeStyle = 'rgba(18,16,22,0.8)'; ctx.lineWidth = 1.8; ctx.stroke(p);
      ctx.fillStyle = gr; ctx.fill(p);
      ctx.strokeStyle = 'rgba(170,176,198,0.55)'; ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(1, 1); ctx.quadraticCurveTo(S * 0.5, -S * 0.55, S * 0.9, -S * 0.5);
      ctx.moveTo(1, 2); ctx.quadraticCurveTo(S * 0.4, -S * 0.25, S * 0.62, -S * 0.15);
      ctx.stroke();
      // smoke wisps peeling off the trailing edge
      if (G.Art && G.Art.dotSprite) {
        const spr = G.Art.dotSprite('#4a4c5a');
        for (let j = 0; j < 4; j++) {
          const u = 0.35 + j * 0.2, r = 4 + 5 * (1 - fade) + j;
          ctx.globalAlpha = pa * fade * 0.6;
          ctx.drawImage(spr, S * u - r, -S * 0.1 + Math.sin(t * 9 + j) * 1.5 + (1 - fade) * 6 - r, r * 2, r * 2);
        }
      }
      ctx.restore();
    }
    ctx.globalAlpha = pa;
  }

  function renderBody(octx, P, g, t, res, fracX, fracY) {
    const ch = CH();
    octx.setTransform(1, 0, 0, 1, 0, 0);
    octx.globalAlpha = 1;
    octx.globalCompositeOperation = 'source-over';
    octx.clearRect(0, 0, octx.canvas.width, octx.canvas.height);
    octx.setTransform(res, 0, 0, res, 0, 0);
    octx.translate(AX + fracX, AY + fracY);
    // scarf (world-relative coordinates)
    if (g.cloth && !P.dead && P.lying < 0.5) {
      octx.save();
      octx.translate(-P.x, -P.y);
      drawScarf(octx, g.cloth);
      octx.restore();
    }
    octx.translate(0, P.lift);
    octx.scale(P.facing, 1);
    octx.rotate(P.rot);
    octx.scale(P.sx, P.sy);

    if (!P.dead || P.melt < 0.85) {
      if (P.brandBehind) { drawBrand(octx, P); drawArm(octx, P); }
      const legs = legTargets(P, t);
      drawLeg(octx, legs[0][0], legs[0][1], legs[0][2], legs[0][3], false);
      drawLeg(octx, legs[1][0], legs[1][1], legs[1][2], legs[1][3], true);
    }
    // wax body
    const b = drawWaxBody(octx, P);
    if (P.kindle > 0) { // warm inner glow while kindling
      octx.save(); octx.clip(b.path);
      octx.globalAlpha = 0.25 * P.kindle; octx.fillStyle = '#bfe8ff'; octx.fillRect(-14, -40, 28, 36);
      octx.restore();
    }
    // eyes
    const eyeY = -29.5 + P.lookY, eyeX = 2.4 + P.look;
    drawEyes(octx, eyeX, eyeY, P.blink);
    if (!P.dead || P.melt < 0.85) drawCollar(octx);
    if (!P.brandBehind && (!P.dead || P.melt < 0.7)) { drawArm(octx, P); drawBrand(octx, P); }
    // wick
    const wt = wickTip(P);
    octx.lineCap = 'round';
    octx.strokeStyle = COL.outline; octx.lineWidth = 2.4;
    octx.beginPath(); octx.moveTo(0.6, -35.8); octx.quadraticCurveTo(0.6, -39.5, wt.lx, wt.ly); octx.stroke();
    if (P.lit < 1 || P.ember > 0) {
      const e = Math.max(P.ember, (1 - P.lit) * (P.dead ? Math.max(0, 1 - P.melt * 1.6) : 0.6));
      if (e > 0.01) { octx.fillStyle = 'rgba(255,140,70,' + (0.6 * e).toFixed(3) + ')'; octx.beginPath(); octx.arc(wt.lx, wt.ly, 1.4, 0, TAU); octx.fill(); }
    }
    return b;
  }

  function wickTip(P) {
    const bend = -clamp(P.flameLean, -10, 10) * 0.12 - 0.6;
    return { lx: 0.6 + bend, ly: -42 };
  }

  // ===================================================================================== effects (world)
  function drawSlash(ctx, P, t) {
    const s = P.slash;
    if (!s || s.k > 0.62) return;
    const p = s.k / 0.62;
    const f = s.facing, rc = s.reach;
    const ch = CH();
    let cx, cy, r, ang, sx, sy, flip;
    if (s.dir === 'up') { cx = P.x + f * 2; cy = P.y - 34; r = 66 * rc; ang = -Math.PI / 2; sx = 0.56; sy = 1; flip = f < 0; }
    else if (s.dir === 'down') { cx = P.x; cy = P.y - 22; r = 66 * rc; ang = Math.PI / 2; sx = 0.56; sy = 1; flip = f > 0; }
    else { cx = P.x - f * 10; cy = P.y - 29; r = 76 * rc; ang = f > 0 ? 0 : Math.PI; sx = 1; sy = 0.52; flip = (s.alt ? 1 : 0) ^ (f < 0 ? 1 : 0); }
    ctx.save();
    ctx.translate(cx, cy);
    ctx.scale(sx, sy);
    if (ch && ch.slash) {
      const wdt = 26 * (s.dir === 'side' ? 1 : 0.8);
      ch.slash(ctx, 0, 0, r * 0.74, ang, Math.min(1, p * 1.15), { arc: 2.1, width: wdt * 0.45, color: '#3f8cff', core: '#9fdcff', alpha: 0.45, flip: !!flip });
      ch.slash(ctx, 0, 0, r, ang, p, { arc: 2.5, width: wdt, color: COL.slash, core: COL.slashCore, flip: !!flip });
    } else {
      ctx.globalCompositeOperation = 'lighter';
      ctx.globalAlpha = 1 - p;
      ctx.strokeStyle = COL.slash; ctx.lineWidth = 10;
      ctx.beginPath(); ctx.arc(0, 0, r - 6, ang - 1.1, ang + 1.1); ctx.stroke();
    }
    ctx.restore();
    // brand tip streak glow at the swing's leading edge
    if (p < 0.5) glow(ctx, P.x + (s.dir === 'side' ? f * r * 0.85 : 0), s.dir === 'up' ? P.y - 34 - r * 0.85 : s.dir === 'down' ? P.y - 22 + r * 0.85 : P.y - 30, 34, '#6ec8ff', 0.35 * (1 - p * 2));
    void t;
  }

  function drawStreak(ctx, P, t) {
    if (P.plunge) {
      // comet: elongated blue fire above the falling body
      const x = P.x, top = P.y - 54;
      for (let i = 0; i < 7; i++) {
        const k = i / 6;
        glow(ctx, x + Math.sin(t * 40 + i) * 1.5, top - k * 70, 30 - k * 14, i < 2 ? '#bfe8ff' : COL.flameGlow, 0.55 * (1 - k * 0.8));
      }
      ctx.save();
      ctx.globalCompositeOperation = 'lighter';
      const gr = ctx.createLinearGradient(0, top - 90, 0, P.y - 10);
      gr.addColorStop(0, 'rgba(60,140,255,0)'); gr.addColorStop(0.7, 'rgba(120,200,255,0.55)'); gr.addColorStop(1, 'rgba(230,248,255,0.9)');
      ctx.fillStyle = gr;
      ctx.beginPath(); ctx.moveTo(x - 9, P.y - 20); ctx.lineTo(x, top - 95); ctx.lineTo(x + 9, P.y - 20); ctx.closePath(); ctx.fill();
      ctx.restore();
    } else if (P.state === 'dash') {
      const back = -P.facing;
      glow(ctx, P.x + back * 18, P.y - 28, 44, COL.flameGlow, 0.45);
      ctx.save();
      ctx.globalCompositeOperation = 'lighter';
      const x0 = P.x + back * 70, x1 = P.x + back * 4;
      const gr = ctx.createLinearGradient(x0, 0, x1, 0);
      gr.addColorStop(0, 'rgba(60,140,255,0)'); gr.addColorStop(1, 'rgba(150,215,255,0.5)');
      ctx.fillStyle = gr;
      ctx.beginPath(); ctx.moveTo(x0, P.y - 28); ctx.quadraticCurveTo((x0 + x1) / 2, P.y - 44, x1, P.y - 40);
      ctx.lineTo(x1, P.y - 12); ctx.quadraticCurveTo((x0 + x1) / 2, P.y - 14, x0, P.y - 28); ctx.fill();
      ctx.restore();
    }
  }

  function drawRipples(ctx, g) {
    if (!g.ripples.length) return;
    ctx.save();
    ctx.lineWidth = 1.4;
    for (const r of g.ripples) {
      const k = r.t / r.max;
      const rx = (8 + 46 * k) * r.s, ry = Math.max(1, rx * 0.16);
      ctx.globalAlpha = (1 - k) * 0.55 * r.s + 0.05;
      ctx.strokeStyle = '#dff4ff';
      ctx.beginPath(); ctx.ellipse(r.x, r.y - 1, rx, ry, 0, Math.PI, TAU); ctx.stroke();
      ctx.globalAlpha *= 0.6;
      ctx.beginPath(); ctx.ellipse(r.x, r.y - 1, rx * 0.6, ry * 0.6, 0, Math.PI, TAU); ctx.stroke();
    }
    ctx.restore();
  }

  function drawDeathExtras(ctx, P, t) {
    const ch = CH();
    if (P.puddle > 0) {
      if (ch && ch.puddle) ch.puddle(ctx, P.x, P.y + 0.5, P.puddle, { w: 22, color: COL.wax, wick: P.melt > 0.85 });
    }
    if (P.smoke > 0 && ch && ch.pallSmoke) {
      const wt = toWorld(P, wickTip(P).lx, wickTip(P).ly);
      ch.pallSmoke(ctx, wt.x, wt.y, t, { count: 6, color: '#5a5d6c', alpha: 0.5 * P.smoke, height: 70, spread: 10, size: 4, speed: 0.6, seed: 3 });
    }
  }

  // ===================================================================================== main draw
  function draw(ctx, p, t) {
    const g = ensure(p);
    const P = poseFrom(p, t, g);
    if (p.hidden) return;
    let res = 1;
    if (ctx.getTransform) { const m = ctx.getTransform(); res = clamp(Math.round(Math.hypot(m.a, m.b) * 2) / 2, 1, 4); }
    const o = getOff(res);
    const ox = Math.floor(P.x), oy = Math.floor(P.y);
    const fracX = P.x - ox, fracY = P.y - oy;

    // 1. behind: puddle / streaks / kindle aura
    if (P.dead) drawDeathExtras(ctx, P, t);
    drawStreak(ctx, P, t);
    if (P.wings > 0) drawWings(ctx, P, t);
    if (P.kindle > 0) {
      const pulse = 0.85 + 0.15 * Math.sin(t * 12);
      glow(ctx, P.x, P.y - 26, 46 + 40 * P.kindle, '#3f8cff', 0.32 * P.kindle * pulse);
      if (CH() && CH().ring) {
        const ph = (t * 1.6) % 1;
        CH().ring(ctx, P.x, P.y - 24, 46, 1 - ph, { color: '#9fdcff', width: 2.5, alpha: 0.5 * P.kindle });
      }
    }

    // 2. body → offscreen
    const b = renderBody(o.ctx, P, g, t, res, fracX, fracY);
    const octx = o.ctx;
    if (P.flash > 0.01 && b) {
      octx.setTransform(1, 0, 0, 1, 0, 0);
      octx.globalCompositeOperation = 'source-atop';
      octx.globalAlpha = clamp(P.flash, 0, 1);
      octx.fillStyle = '#ffffff';
      octx.fillRect(0, 0, o.canvas.width, o.canvas.height);
      octx.globalCompositeOperation = 'source-over';
      octx.globalAlpha = 1;
    }

    // 3. dash afterimages (snapshot the current silhouette, tinted blue)
    if (g.after.length) {
      const pa = ctx.globalAlpha, po = ctx.globalCompositeOperation;
      for (const a of g.after) {
        if (!a.img) {
          let c = afterPool.pop();
          if (!c || c.width !== o.canvas.width) c = makeCanvas(o.canvas.width, o.canvas.height).canvas;
          const cx2 = c.getContext('2d');
          cx2.globalCompositeOperation = 'source-over'; cx2.globalAlpha = 1;
          cx2.clearRect(0, 0, c.width, c.height);
          cx2.drawImage(o.canvas, 0, 0);
          cx2.globalCompositeOperation = 'source-atop';
          cx2.fillStyle = COL.after; cx2.fillRect(0, 0, c.width, c.height);
          cx2.globalCompositeOperation = 'source-over';
          a.img = c;
        }
        ctx.globalCompositeOperation = 'lighter';
        ctx.globalAlpha = pa * 0.5 * (a.life / a.max);
        ctx.drawImage(a.img, Math.floor(a.x) - AX, Math.floor(a.y) - AY, OFF_W, OFF_H);
      }
      ctx.globalAlpha = pa; ctx.globalCompositeOperation = po;
    }

    // 4. composite the body
    const pa = ctx.globalAlpha;
    ctx.globalAlpha = pa * P.alpha;
    ctx.drawImage(o.canvas, ox - AX, oy - AY, OFF_W, OFF_H);

    // 5. flame (world space; always burns upward) + brand tip glow
    if (P.lit > 0.02) {
      const wt = wickTip(P);
      const w = toWorld(P, wt.lx, wt.ly);
      const size = P.flameSize * (0.25 + 0.75 * P.lit) * (P.dead ? 1 : 1);
      if (P.flameGlow > 1) glow(ctx, w.x, w.y - size * 0.4, size * 3.2, '#3f8cff', 0.25 * (P.flameGlow - 1));
      flame(ctx, w.x, w.y + 1, size, t, 3.7, { lean: clamp(P.flameLean, -16, 16), glow: P.lit });
    }
    if (P.brandGlow > 0 && (!P.dead || P.melt < 0.7) && P.lying < 0.6) {
      const bg = brandGeom(P);
      const tip = toWorld(P, bg.tx, bg.ty);
      glow(ctx, tip.x, tip.y, 9, '#ff9a50', 0.55 * P.brandGlow);
    }
    ctx.globalAlpha = pa;

    // 6. slash crescent, clang flash, ripples
    if (P.slash) drawSlash(ctx, P, t);
    drawRipples(ctx, g);
  }

  // ===================================================================================== bolt & trail
  function drawBolt(ctx, b, t) {
    const dir = b.dir || 1;
    if (b.burst) {
      const k = b.burst.t / 0.25;
      glow(ctx, b.burst.x, b.burst.y, 70 * (1 - k * 0.5), '#4fa8ff', 0.8 * (1 - k));
      if (CH() && CH().ring) CH().ring(ctx, b.burst.x, b.burst.y, 46, k, { color: '#bfe8ff', width: 5 });
      return;
    }
    const cx = b.cx, cy = b.cy;
    const tr = b.trail;
    // tail: fading glows along recent positions
    for (let i = 0; i + 1 < tr.length; i += 2) {
      const k = (i / 2 + 1) / (tr.length / 2);
      glow(ctx, tr[i], tr[i + 1], 10 + 18 * k, '#3f8cff', 0.35 * k);
    }
    glow(ctx, cx, cy, 58, '#3f8cff', 0.55);
    // body: a flame lying on its side, pointing backward
    ctx.save();
    ctx.translate(cx + dir * 10, cy);
    ctx.rotate(dir > 0 ? -Math.PI / 2 : Math.PI / 2);
    flame(ctx, 0, 0, 40 + Math.sin(t * 40 + b.age * 10) * 3, t * 1.7, 9.1 + b.attackId.length, { glow: 0.4, lean: Math.sin(t * 25) * 3 });
    ctx.restore();
    // hot core
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    ctx.fillStyle = 'rgba(120,200,255,0.75)';
    ctx.beginPath(); ctx.ellipse(cx + dir * 8, cy, 13, 9, 0, 0, TAU); ctx.fill();
    ctx.fillStyle = 'rgba(240,250,255,0.95)';
    ctx.beginPath(); ctx.ellipse(cx + dir * 10, cy, 7, 5, 0, 0, TAU); ctx.fill();
    ctx.restore();
  }

  function drawTrail(ctx, s, t) {
    const k = clamp(s.life / s.max, 0, 1);
    const base = s.y + s.h;
    glow(ctx, s.cx, base - 10, 34 * k + 8, '#3f8cff', 0.45 * k);
    for (let i = 0; i < 3; i++) {
      const x = s.x + 8 + i * ((s.w - 16) / 2);
      const sz = (12 + 8 * Math.sin(s.seed + i * 2.1) * 0.5) * (0.35 + 0.65 * k) * (1 - Math.pow(1 - k, 3) * 0.3);
      flame(ctx, x, base - 2, sz, t, s.seed + i, { glow: 0.35 * k });
    }
  }

  G.PlayerDraw = {
    COLORS: COL,
    ensure, reset, onEvent, update, draw, drawBolt, drawTrail,
    poseFrom: (p, t) => poseFrom(p, t == null ? (G.game ? G.game.t : 0) : t, ensure(p)),
    toWorld,
    OFF: { W: OFF_W, H: OFF_H, AX, AY },
  };
})();
