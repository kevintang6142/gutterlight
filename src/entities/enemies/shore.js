// src/entities/enemies/shore.js — Ashen Shore enemies (reference implementations of the G.Enemy API):
//   ash_crawler — a slow, low mound of ash-caked grey wax that patrols and turns at ledges.
//   ash_fly     — a small fluttering ash-moth that hovers, then drifts toward the player in sight.
(function () {
  'use strict';
  const G = globalThis.G;
  if (!G.Enemy) return;
  const TILE = G.CONST.TILE;
  const TAU = Math.PI * 2;
  const rnd = (a, b) => a + Math.random() * (b - a);

  // A soft wing flutter (fallback only if the audio module does not define it).
  (function () {
    const A = G.Audio;
    if (!A || typeof A.defineSfx !== 'function') return;
    const have = typeof A.sfxNames === 'function' ? A.sfxNames() : [];
    if (have.indexOf('moth_flutter') >= 0) return;
    A.defineSfx('moth_flutter', {
      vol: 3.5, reverb: 0.1,
      play(k) {
        const v = k.r(0.9, 1.1);
        for (let i = 0; i < 5; i++) k.noise({ bp: 900 * v + i * 60, Q: 1.4, a: 0.004, d: 0.03, g: 0.09 * (1 - i * 0.12), at: i * 0.034 });
      },
    });
  })();

  // Small deterministic hash → [0,1)
  const h01 = (i, s) => { const x = Math.sin(i * 127.1 + s * 311.7) * 43758.5453; return x - Math.floor(x); };

  // =====================================================================================================
  // ash_crawler
  // =====================================================================================================
  const CRAWLER_COL = { body: '#9aa0aa', dark: '#4b505b', crust: '#5c616c', ash: '#d9dbdf', hit: '#c9ced6', smoke: '#7e879a', puddle: '#8d939e' };

  class AshCrawler extends G.Enemy {
    constructor(props) {
      super(props, {
        hp: 10, w: 46, h: 26,
        cinders: [2, 4],
        weight: 1,
        colors: { body: CRAWLER_COL.body, dark: CRAWLER_COL.dark, hit: CRAWLER_COL.hit, smoke: CRAWLER_COL.smoke, puddle: CRAWLER_COL.puddle },
        puddleW: 30,
      });
      this.speed = props.speed || 42;
      this.walk = Math.random() * TAU;   // gait phase
      this.turnT = 0;                     // squash after turning
      this.stepAcc = 0;
    }
    init() { super.init(); this.setState('patrol'); }
    think(dt) {
      if (this.turnT > 0) this.turnT -= dt;
      // the base handles gravity/collisions; patrol turns at walls, ledges, hazards and room edges
      this.patrol(this.speed, { pause: 0.35 });
      this.walk += Math.abs(this.vx) * dt * 0.22;
      if (Math.abs(this.vx) > 1) this.footsteps(dt);
    }
    onTurn() { this.turnT = 0.3; }
    onHurt() { this.turnT = 0.15; }
    footsteps(dt) {
      this.stepAcc += dt;
      if (this.stepAcc < 0.55) return;
      this.stepAcc = 0;
      const p = this.player;
      if (p && Math.abs(this.dx(p)) < 6 * TILE && Math.abs(this.dy(p)) < 3 * TILE) G.sfxAt('step', this.cx, { vol: 0.18, pitch: rnd(0.45, 0.55) });
    }
    drawBounds() { return { x: this.x - 30, y: this.y - 70, w: this.w + 60, h: this.h + 80 }; }
    drawBody(ctx, t) { drawCrawler(ctx, this.cx, this.y + this.h, this.facing, this.walk, t, this.seed, this.turnT, !!this.dying); }
  }

  /** Shared crawler art: feet centre (fx, fy). Exposed for contact sheets / other builders. */
  function drawCrawler(ctx, fx, fy, f, walk, t, seed, turnT, dead) {
    const ch = G.Art && G.Art.char;
    const sq = turnT > 0 ? 1 - Math.sin((turnT / 0.3) * Math.PI) * 0.1 : 1;
    if (ch) ch.shadow(ctx, fx, fy, 26, 0.5);
    // legs: three visible pairs, alternating
    ctx.strokeStyle = '#1b1a20'; ctx.lineCap = 'round'; ctx.lineWidth = 3.2;
    for (let i = 0; i < 3; i++) {
      const lx = fx + f * (-13 + i * 11);
      for (const side of [0, 1]) {
        const ph = walk * 2 + i * 2.1 + side * Math.PI;
        const lift = dead ? 0 : Math.max(0, Math.sin(ph)) * 2.6;
        const sw = dead ? 0 : Math.cos(ph) * 3.2;
        ctx.globalAlpha = side ? 0.65 : 1;
        ctx.beginPath(); ctx.moveTo(lx + f * side * 2, fy - 7); ctx.quadraticCurveTo(lx + f * (sw + 3), fy - 4 - lift, lx + f * sw + f * side * 2, fy - lift); ctx.stroke();
        ctx.globalAlpha = 1;
      }
    }
    // body: four humps (tail → head) carried by a travelling wave
    const humps = [[-17, 8, 7.5], [-6, 12, 11], [6, 11.5, 11.5], [16, 8.5, 8]]; // [x offset, rx, ry]
    const body = new Path2D();
    const top = [];
    for (let i = 0; i < humps.length; i++) {
      const [ox, rx, ry] = humps[i];
      const wave = dead ? 0 : Math.sin(walk * 2 - i * 1.15) * 1.6;
      const x = fx + f * ox, ryy = (ry + wave * 0.6) * sq, y = fy - 5 - ryy * 0.82;
      const rxx = rx * (2 - sq);
      body.moveTo(x + rxx, y);
      body.ellipse(x, y, rxx, ryy, 0, 0, TAU);
      top.push([x, y - ryy, rx, ryy, y]);
    }
    const box = [fx - 30, fy - 30, fx + 30, fy];
    if (ch) ch.shape(ctx, body, { fill: CRAWLER_COL.body, box, light: -1, shade: 0.42, hi: 0.2, rim: '#e4e6ea', rimWidth: 1.6, lw: 2 });
    else { ctx.fillStyle = '#141218'; ctx.lineWidth = 4; ctx.strokeStyle = '#141218'; ctx.stroke(body); ctx.fillStyle = CRAWLER_COL.body; ctx.fill(body); }
    // ash crust plates, segment grooves and speckles (clipped to the body)
    ctx.save();
    ctx.clip(body);
    for (let i = 0; i < top.length; i++) {
      const [x, ty, rx, ry, cy] = top[i];
      // ash cake: irregular darker flakes over the upper surface, lit along their top edge
      for (let k = 0; k < 3; k++) {
        const a = Math.PI * (1.12 + 0.76 * h01(i * 5 + k, seed));
        const px = x + Math.cos(a) * rx * 0.5, py = cy + Math.sin(a) * ry * 0.55;
        const r = 2.6 + 2.2 * h01(k * 3 + i, seed + 1);
        ctx.beginPath();
        for (let v = 0; v < 6; v++) {
          const va = (v / 6) * TAU, vr = r * (0.65 + 0.5 * h01(v + k * 7 + i * 13, seed));
          if (v) ctx.lineTo(px + Math.cos(va) * vr * 1.3, py + Math.sin(va) * vr * 0.8);
          else ctx.moveTo(px + Math.cos(va) * vr * 1.3, py + Math.sin(va) * vr * 0.8);
        }
        ctx.closePath();
        ctx.fillStyle = CRAWLER_COL.crust; ctx.globalAlpha = 0.6; ctx.fill();
        ctx.strokeStyle = '#c4c8cf'; ctx.globalAlpha = 0.35; ctx.lineWidth = 0.8;
        ctx.beginPath(); ctx.moveTo(px - r * 1.1, py - r * 0.5); ctx.lineTo(px + r * 0.9, py - r * 0.7); ctx.stroke();
      }
      ctx.globalAlpha = 1;
      if (i > 0) { // groove between humps
        ctx.strokeStyle = 'rgba(20,18,24,0.38)'; ctx.lineWidth = 1.1;
        const gx = x - f * rx * 0.82;
        ctx.beginPath(); ctx.moveTo(gx + f * 1.5, ty + ry * 0.25); ctx.quadraticCurveTo(gx - f * 1.5, cy, gx + f * 1, cy + ry); ctx.stroke();
      }
      ctx.fillStyle = CRAWLER_COL.ash;
      for (let k = 0; k < 3; k++) {
        const a = Math.PI * (1.1 + 0.8 * h01(i * 11 + k, seed + 2));
        ctx.globalAlpha = 0.35 + 0.25 * h01(k, i);
        ctx.beginPath(); ctx.arc(x + Math.cos(a) * rx * 0.75, cy + Math.sin(a) * ry * 0.72, 0.9, 0, TAU); ctx.fill();
      }
      ctx.globalAlpha = 1;
    }
    ctx.restore();
    // head (front hump): white pinprick eyes and two little wax mandibles
    const head = top[3];
    const hx = head[0] + f * 2.5, hy = head[4] - 1;
    ctx.strokeStyle = '#2a2830'; ctx.lineWidth = 1.6; ctx.lineCap = 'round';
    const nib = dead ? 0 : Math.sin(walk * 4) * 0.8;
    ctx.beginPath();
    ctx.moveTo(head[0] + f * 6, fy - 6); ctx.quadraticCurveTo(head[0] + f * 10, fy - 4, head[0] + f * (9 + nib), fy - 1.5);
    ctx.moveTo(head[0] + f * 3, fy - 5.5); ctx.quadraticCurveTo(head[0] + f * 6, fy - 3, head[0] + f * (5 - nib), fy - 1);
    ctx.stroke();
    if (!dead) {
      if (ch) ch.eyes(ctx, hx, hy, { kind: 'pinprick', size: 9, gap: 7, blink: ch.blinkAt(t, seed | 0, 4.2) });
      else { ctx.fillStyle = '#f4f8ff'; ctx.fillRect(hx - 4, hy - 1, 2, 2); ctx.fillRect(hx + 2, hy - 1, 2, 2); }
    }
    // snuffed wick on the back with a thread of Pall smoke
    const back = top[1];
    const wx = back[0] - f * 2, wy = back[1] + 2;
    let tip = [wx - f * 5, wy - 8];
    if (ch) tip = ch.wick(ctx, wx, wy, { len: 9, bend: -f * 5, width: 2.4, curl: -f * 2 });
    if (ch && !dead) ch.pallSmoke(ctx, tip[0], tip[1], t, { count: 4, height: 42, spread: 8, size: 4, alpha: 0.3, seed, drift: -f * 6 });
  }

  G.registerEnemy('ash_crawler', AshCrawler);

  // =====================================================================================================
  // ash_fly
  // =====================================================================================================
  const FLY_COL = { body: '#8a837c', fuzz: '#b9b1a6', wing: '#c3bcb0', wingDark: '#6f685f', vein: '#8d867c', eye: '#eaf2ff', smoke: '#8a8580', puddle: '#9b958c' };

  class AshFly extends G.Enemy {
    constructor(props) {
      super(props, {
        hp: 8, w: 30, h: 26,
        flying: true,
        cinders: [2, 4],
        weight: 0.6,
        sight: 6.5 * TILE,
        colors: { body: FLY_COL.body, dark: '#4c4742', hit: FLY_COL.wing, smoke: FLY_COL.smoke, puddle: FLY_COL.puddle },
        light: { r: 46, color: '#cfe0ff', intensity: 0.35, dy: -4 },
        puddleW: 16,
      });
      this.flap = Math.random() * TAU;
      this.lostT = 0;
      this.jitter = { x: 0, y: 0, t: 0 };
    }
    init() { super.init(); this.setState('hover'); }
    think(dt) {
      this.flap += dt * (this.state === 'chase' ? 58 : 48);
      this.updateJitter(dt);
      const p = this.player;
      switch (this.state) {
        case 'hover':
          this.hover(null, null, dt, { amp: 16, freq: 0.45, speed: 60, accel: 260 });
          if (this.stateTime > 0.4 && this.canSee(p)) this.setState('notice');
          break;
        case 'notice': // a startled flutter upward, then drift in
          if (this.once('cue')) { G.sfxAt('moth_flutter', this.cx, { vol: 0.7 }); this.vy = -90; this.face(p); }
          this.vx *= 0.9;
          if (this.stateTime > 0.35) this.setState('chase');
          break;
        case 'chase': {
          if (!p) { this.setState('return'); break; }
          this.face(p);
          const tx = p.x + p.w / 2, ty = p.y + p.h * 0.35 + this.bob(14, 0.9);
          this.flyTo(tx + this.jitter.x, ty + this.jitter.y, 88, dt, { accel: 200, arrive: 30, look: 50 });
          if (this.canSee(p, this.sight * 1.6)) this.lostT = 0; else this.lostT += dt;
          if (this.lostT > 2.2 || !this.targetable(p)) this.setState('return');
          break;
        }
        case 'return': {
          const d = this.flyTo(this.home.x, this.home.y, 70, dt, { accel: 220, arrive: 50 });
          if (Math.abs(this.vx) > 8) this.facing = this.vx > 0 ? 1 : -1;
          if (this.stateTime > 0.6 && this.canSee(p)) this.setState('notice');
          else if (d < 12 || this.stateTime > 6) this.setState('hover');
          break;
        }
        default: this.setState('hover');
      }
      if (G.fx && Math.random() < dt * 1.6) G.fx.burst('ash', this.cx + rnd(-8, 8), this.cy + 4, { count: 1, color: '#cfc8bc' });
    }
    // erratic little flutters on top of the steering
    updateJitter(dt) {
      const j = this.jitter;
      j.t -= dt;
      if (j.t <= 0) { j.t = rnd(0.25, 0.6); j.tx = rnd(-22, 22); j.ty = rnd(-16, 16); }
      j.x += ((j.tx || 0) - j.x) * Math.min(1, dt * 5);
      j.y += ((j.ty || 0) - j.y) * Math.min(1, dt * 5);
    }
    whileStunned() { this.flap += G.CONST.DT * 30; }
    drawBounds() { return { x: this.x - 34, y: this.y - 34, w: this.w + 68, h: this.h + 60 }; }
    drawBody(ctx, t) {
      const lean = Math.max(-0.35, Math.min(0.35, this.vx / 260));
      drawFlyCached(ctx, this.cx, this.cy, this.facing, this.flap, lean);
      void t;
    }
    drawCorpse(ctx, t) { drawFly(ctx, this.cx, this.cy, this.facing, 1.2, t, this.seed, 0, true); }
  }

  function wingPath(len, wid, fore) {
    const p = new Path2D();
    p.moveTo(0, 0);
    if (fore) {
      p.bezierCurveTo(len * 0.25, -wid * 0.9, len * 0.8, -wid * 1.05, len, -wid * 0.55);
      p.quadraticCurveTo(len * 1.04, -wid * 0.1, len * 0.82, wid * 0.12);
      p.bezierCurveTo(len * 0.55, wid * 0.35, len * 0.25, wid * 0.3, 0, 0);
    } else {
      p.bezierCurveTo(len * 0.2, wid * 0.2, len * 0.65, wid * 0.15, len * 0.8, wid * 0.55);
      p.quadraticCurveTo(len * 0.75, wid * 1.05, len * 0.42, wid * 0.95);
      p.bezierCurveTo(len * 0.2, wid * 0.8, len * 0.05, wid * 0.4, 0, 0);
    }
    p.closePath();
    return p;
  }
  const WINGS = { fore: null, hind: null };

  /** Shared ash-moth art centred at (x, y). */
  function drawFly(ctx, x, y, f, flap, t, seed, lean, dead) {
    const ch = G.Art && G.Art.char;
    if (!WINGS.fore) { WINGS.fore = wingPath(26, 15, true); WINGS.hind = wingPath(19, 13, false); }
    const beat = Math.cos(flap);               // 1 = wings up, -1 = down
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(lean * f * 0.6);
    // wings: hind behind fore, both sides; vertical squash simulates the flap
    for (const layer of ['hind', 'fore']) {
      for (const side of [-1, 1]) {
        ctx.save();
        const far = side === -f; // the wing on the far side is dimmer and smaller
        ctx.translate(side * 3, layer === 'fore' ? -3 : 2);
        const base = layer === 'fore' ? -0.35 : 0.25;
        const ang = dead ? 0.5 : base - beat * (layer === 'fore' ? 0.75 : 0.55);
        ctx.scale(side * (far ? 0.82 : 1), 1);
        ctx.rotate(ang);
        ctx.scale(1, dead ? 0.7 : 0.55 + 0.45 * Math.abs(Math.sin(flap + 0.3)));
        const path = WINGS[layer];
        ctx.globalAlpha = far ? 0.75 : 0.95;
        if (ch) ch.shape(ctx, path, { fill: layer === 'fore' ? FLY_COL.wing : '#aea79b', box: [0, -16, 26, 14], light: -1, shade: 0.4, hi: 0.25, lw: 1.5 });
        else { ctx.fillStyle = FLY_COL.wing; ctx.fill(path); }
        ctx.save();
        ctx.clip(path);
        // dark outer band + veins + an eye-spot on the forewing
        ctx.strokeStyle = FLY_COL.wingDark; ctx.globalAlpha *= 0.55; ctx.lineWidth = 4;
        ctx.stroke(path);
        ctx.lineWidth = 0.9; ctx.strokeStyle = FLY_COL.vein;
        ctx.beginPath();
        for (let k = 0; k < 3; k++) { ctx.moveTo(1, 0); ctx.quadraticCurveTo(10, (k - 1) * 5 - (layer === 'fore' ? 4 : -3), 24, (k - 1) * 8 - (layer === 'fore' ? 6 : -6)); }
        ctx.stroke();
        if (layer === 'fore') {
          ctx.globalAlpha = far ? 0.6 : 0.85;
          ctx.fillStyle = '#4a443e'; ctx.beginPath(); ctx.arc(17, -6, 3.4, 0, TAU); ctx.fill();
          ctx.fillStyle = '#e8e2d6'; ctx.beginPath(); ctx.arc(17.4, -6.4, 1.4, 0, TAU); ctx.fill();
        }
        ctx.restore();
        ctx.restore();
      }
    }
    ctx.globalAlpha = 1;
    // body: furry thorax + tapered abdomen
    const body = new Path2D();
    body.moveTo(6.5, -1);
    body.ellipse(0, -1, 6.5, 8, 0, 0, TAU);
    body.moveTo(-f + 4.6 * Math.cos(f * 0.25), 9 + 4.6 * Math.sin(f * 0.25));
    body.ellipse(-f, 9, 4.6, 8.5, f * 0.25, 0, TAU);
    if (ch) ch.shape(ctx, body, { fill: FLY_COL.body, box: [-8, -10, 8, 18], light: -1, shade: 0.45, lw: 1.8, rim: '#d8d2c6', rimWidth: 1.2 });
    else { ctx.fillStyle = FLY_COL.body; ctx.fill(body); }
    ctx.strokeStyle = 'rgba(30,26,24,0.45)'; ctx.lineWidth = 1;
    ctx.beginPath(); ctx.moveTo(-f * 1 - 4, 9); ctx.lineTo(-f * 1 + 4, 9); ctx.moveTo(-f * 1 - 3.5, 12.5); ctx.lineTo(-f * 1 + 3.5, 12.5); ctx.stroke();
    // fuzz
    ctx.fillStyle = FLY_COL.fuzz;
    for (let k = 0; k < 16; k++) {
      const a = (k / 16) * TAU + h01(k, seed) * 0.4;
      ctx.globalAlpha = 0.35 + 0.25 * h01(k, 3);
      ctx.beginPath(); ctx.arc(Math.cos(a) * 6.2, -1.5 + Math.sin(a) * 7.4, 0.9 + 0.5 * h01(k, 5), 0, TAU); ctx.fill();
    }
    ctx.globalAlpha = 1;
    // head, feathered antennae, glowing eyes
    const hx = f * 4, hy = -8;
    ctx.fillStyle = '#6f6862'; ctx.strokeStyle = '#141218'; ctx.lineWidth = 1.5;
    ctx.beginPath(); ctx.arc(hx, hy, 4.4, 0, TAU); ctx.stroke(); ctx.fill();
    ctx.strokeStyle = '#3a3532'; ctx.lineWidth = 1.2;
    for (const side of [-1, 1]) {
      const sway = dead ? 0 : Math.sin(t * 3 + side + seed) * 1.5;
      const ax = hx + side * 2, ay = hy - 3;
      const ex = ax + side * 7 + f * 3 + sway, ey = ay - 10;
      ctx.beginPath(); ctx.moveTo(ax, ay); ctx.quadraticCurveTo(ax + side * 2, ay - 7, ex, ey); ctx.stroke();
      ctx.beginPath();
      for (let k = 1; k <= 4; k++) {
        const q = k / 5, px = ax + (ex - ax) * q, py = ay + (ey - ay) * q;
        ctx.moveTo(px, py); ctx.lineTo(px + side * 2.4, py + 1.2);
      }
      ctx.stroke();
    }
    if (!dead) {
      if (ch) ch.eyes(ctx, hx + f * 1, hy, { kind: 'pinprick', size: 8, gap: 5, color: FLY_COL.eye });
      else { ctx.fillStyle = FLY_COL.eye; ctx.fillRect(hx - 2, hy - 1, 1.5, 1.5); ctx.fillRect(hx + 1, hy - 1, 1.5, 1.5); }
    } else {
      ctx.strokeStyle = '#141218'; ctx.lineWidth = 1;
      ctx.beginPath(); ctx.moveTo(hx - 2, hy - 1); ctx.lineTo(hx, hy + 1); ctx.moveTo(hx, hy - 1); ctx.lineTo(hx - 2, hy + 1); ctx.stroke();
    }
    ctx.restore();
  }

  // The moth is detailed (many clipped, shaded paths), so living flies blit pre-rendered flap frames
  // (16 per facing, 2× resolution) instead of redrawing every frame.
  const FLY_FRAMES = 16, FLY_SPR = 88, FLY_RES = 2;
  const flyCache = new Map();
  function flyFrame(f, i) {
    const key = f + '|' + i;
    let c = flyCache.get(key);
    if (c) return c;
    const mc = G.U.makeCanvas(FLY_SPR * FLY_RES, FLY_SPR * FLY_RES);
    mc.ctx.scale(FLY_RES, FLY_RES);
    drawFly(mc.ctx, FLY_SPR / 2, FLY_SPR / 2, f, (i / FLY_FRAMES) * TAU, i * 0.13, 7, 0, false);
    c = mc.canvas;
    flyCache.set(key, c);
    return c;
  }
  function drawFlyCached(ctx, x, y, f, flap, lean) {
    const ph = ((flap % TAU) + TAU) % TAU;
    const spr = flyFrame(f, Math.floor((ph / TAU) * FLY_FRAMES) % FLY_FRAMES);
    ctx.save();
    ctx.translate(x, y);
    if (lean) ctx.rotate(lean * f * 0.6);
    ctx.drawImage(spr, -FLY_SPR / 2, -FLY_SPR / 2, FLY_SPR, FLY_SPR);
    ctx.restore();
  }

  G.registerEnemy('ash_fly', AshFly);

  G.ShoreEnemies = { AshCrawler, AshFly, drawCrawler, drawFly, drawFlyCached };
})();
