// src/entities/enemies/meltbloom.js — Meltbloom Gardens enemies (region builder: region-meltbloom):
//   bloom_spitter — a rooted wax flower. Idle it is a closed cream bud on a stem (reads like a garden flower);
//                   when the Wickling is in sight its petals unfurl around a glowing gold throat (0.55 s) and it
//                   spits 1-3 seeds in arcs (projectile 'bloom_seed', destroyable), then closes again.
//   thorn_hopper  — a thorny seed-pod on two root feet. Crouches with bristling thorns (0.45 s), then hops toward
//                   the Wickling in an arc; it never hops off ledges, into hazards, doorways or beyond its beat.
//   pollen_moth   — a plump gold-dusted moth. Hovers, takes a perch above the Wickling, its pollen lantern glows
//                   brighter (0.55 s), then it swoops along a straight dive line and recovers slowly upward.
//   vine_lurker   — an ambush vine. Hidden: only a leaf tip shows in the floor (or a curled tendril under a
//                   ceiling with surface:'ceiling'). Trembles (0.45 s) when the Wickling comes near, bursts out,
//                   rears back (0.45 s) and lashes a thorned whip once or twice, then retracts.
// + event scripts for the region's set pieces: mb_ravine (chasm fade), mb_meltbloom (the Atrium's giant flower),
//   mb_glassroof (the Atrium's glass roof), mb_grate (the barred shaft down to the Mothwood, seen from above).
//   mb_pod / mb_petals / mb_leaves (region builder); QA additions: mb_thorns (readable thorn hazards, ravine brambles),
//   mb_hedges (Thornwalk hedge backdrop), mb_brick (Guttered brick at mb_01), mb_lip (Atrium cup lip), mb_roots (root mat).
(function () {
  'use strict';
  const G = globalThis.G;
  if (!G.Enemy) return;
  const TILE = G.CONST.TILE;
  const TAU = Math.PI * 2;
  const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
  const lerp = (a, b, k) => a + (b - a) * k;
  const toward = (v, target, step) => (v < target ? Math.min(target, v + step) : Math.max(target, v - step));
  const h01 = (i, s) => { const x = Math.sin(i * 127.1 + s * 311.7) * 43758.5453; return x - Math.floor(x); };
  const rnd = (a, b) => a + Math.random() * (b - a);
  const ease = (k) => k * k * (3 - 2 * k);
  const glow = (ctx, x, y, r, c, a) => { if (G.fx && G.fx.glowAt) G.fx.glowAt(ctx, x, y, r, c, a); };
  const CH = () => (G.Art && G.Art.char) || null;

  // ------------------------------------------------------------------ sfx (defined only if the audio module lacks them)
  (function defineSfx() {
    const A = G.Audio;
    if (!A || typeof A.defineSfx !== 'function') return;
    const have = typeof A.sfxNames === 'function' ? A.sfxNames() : [];
    const def = (name, o) => { if (have.indexOf(name) < 0) A.defineSfx(name, o); };
    def('bloom_open', {      // petals peeling open: a soft waxy creak rising into a breathy hum
      vol: 3.2, reverb: 0.2,
      play(k) {
        const v = k.r(0.94, 1.06);
        k.noise({ color: 'pink', bp: 700 * v, bp1: 1900 * v, Q: 2.2, a: 0.08, d: 0.45, g: 0.09, sweep: 0.45 });
        k.tone({ f: 220 * v, f1: 330 * v, glide: 0.4, type: 'triangle', a: 0.12, d: 0.4, g: 0.035, vib: { rate: 7, depth: 18 } });
      },
    });
    def('seed_spit', {       // a wet "pft": short low thump + a puff
      vol: 3.4, reverb: 0.1,
      play(k) {
        const v = k.r(0.9, 1.12);
        k.tone({ f: 260 * v, f1: 120 * v, glide: 0.06, type: 'sine', a: 0.002, d: 0.09, g: 0.18 });
        k.noise({ color: 'pink', bp: 1500 * v, Q: 1.5, a: 0.002, d: 0.08, g: 0.12 });
      },
    });
    def('seed_pop', {        // a seed bursting into pollen on the ground
      vol: 3, reverb: 0.15,
      play(k) {
        const v = k.r(0.9, 1.1);
        k.noise({ bp: 2600 * v, Q: 1.8, a: 0.002, d: 0.12, g: 0.1 });
        k.tone({ f: 520 * v, f1: 300 * v, glide: 0.05, type: 'triangle', a: 0.001, d: 0.05, g: 0.05 });
      },
    });
    def('pod_hop', {         // a springy rustle as the pod leaves the ground
      vol: 3, reverb: 0.08,
      play(k) {
        const v = k.r(0.9, 1.1);
        k.noise({ color: 'pink', bp: 900 * v, bp1: 2400 * v, Q: 1.6, a: 0.005, d: 0.14, g: 0.11, sweep: 0.12 });
        k.tone({ f: 140 * v, f1: 230 * v, glide: 0.08, type: 'sine', a: 0.004, d: 0.1, g: 0.08 });
      },
    });
    def('pod_land', {        // a dull woody thud with a thorny crackle
      vol: 3.2, reverb: 0.1,
      play(k) {
        const v = k.r(0.9, 1.1);
        k.tone({ f: 110 * v, f1: 60 * v, glide: 0.1, type: 'sine', a: 0.002, d: 0.16, g: 0.2 });
        k.noise({ bp: 3200 * v, Q: 3, a: 0.002, d: 0.07, g: 0.06, at: 0.01 });
      },
    });
    def('moth_swoop', {      // a dusty whoosh
      vol: 3.2, reverb: 0.15,
      play(k) {
        const v = k.r(0.92, 1.08);
        k.noise({ color: 'pink', bp: 500 * v, bp1: 2200 * v, Q: 1.1, a: 0.05, d: 0.32, g: 0.15, sweep: 0.3 });
        for (let i = 0; i < 4; i++) k.noise({ bp: 1100 * v + i * 90, Q: 1.4, a: 0.004, d: 0.03, g: 0.05, at: 0.05 + i * 0.05 });
      },
    });
    def('vine_rustle', {     // leaves stirring in the soil (the lurker's tell)
      vol: 3, reverb: 0.12,
      play(k) {
        const v = k.r(0.9, 1.1);
        for (let i = 0; i < 6; i++) k.noise({ color: 'pink', bp: (1400 + i * 170) * v, Q: 2, a: 0.004, d: 0.05, g: 0.06, at: i * 0.055 });
        k.tone({ f: 70 * v, type: 'sine', a: 0.05, d: 0.3, g: 0.05 });
      },
    });
    def('vine_burst', {      // soil tearing open
      vol: 3.4, reverb: 0.15,
      play(k) {
        const v = k.r(0.92, 1.08);
        k.noise({ color: 'brown', lp: 900 * v, a: 0.005, d: 0.3, g: 0.3 });
        k.noise({ bp: 1800 * v, bp1: 600 * v, Q: 1.2, a: 0.004, d: 0.2, g: 0.1, sweep: 0.2 });
        k.tone({ f: 90 * v, f1: 55 * v, glide: 0.2, type: 'sine', a: 0.004, d: 0.25, g: 0.14 });
      },
    });
    def('vine_lash', {       // a whip crack
      vol: 3.4, reverb: 0.12,
      play(k) {
        const v = k.r(0.94, 1.06);
        k.noise({ bp: 900 * v, bp1: 3800 * v, Q: 1.4, a: 0.03, d: 0.12, g: 0.12, sweep: 0.1 });
        k.noise({ hp: 3000 * v, a: 0.001, d: 0.05, g: 0.12, at: 0.1 });
        k.tone({ f: 1500 * v, f1: 700 * v, glide: 0.04, type: 'triangle', a: 0.001, d: 0.04, g: 0.04, at: 0.1 });
      },
    });
  })();

  // ------------------------------------------------------------------ palette (sage, cream wax, gold — ART_GUIDE §2)
  const MB = {
    wax: '#ece3c2', waxShade: '#a99d76', waxHi: '#fffbea', waxDeep: '#7c7254',
    leaf: '#56703f', leafDark: '#2c3a20', leafLight: '#93ad6c', vein: '#c4d49a',
    stem: '#5d7142', stemDark: '#323f22',
    gold: '#ffd070', goldHot: '#fff2b8', goldDeep: '#c88a2a', throat: '#4a2416',
    pod: '#7a6a3c', podDark: '#3d331b', podHi: '#c2b07a', thorn: '#f1e6c0', thornBase: '#4a3e22',
    vine: '#3c5229', vineDark: '#1f2c15', vineHi: '#7d9a58',
    outline: '#14160f', tele: '#ffe2a8', smoke: '#9aa486',
  };
  const DOOR_DEPTH = 3.5 * TILE;

  /** Doorway zones of a room (px rects: each opening run, 1 tile to each side, DOOR_DEPTH inward). Cached per room. */
  function doorZones(room) {
    if (!room) return [];
    if (room._mbDoorZones) return room._mbDoorZones;
    const W = room.widthPx, H = room.heightPx;
    const zs = (room.openings || []).map((o) => {
      const a = (o.pos - 1) * TILE, b = (o.pos + o.size + 1) * TILE;
      if (o.side === 'W') return [0, a, DOOR_DEPTH, b];
      if (o.side === 'E') return [W - DOOR_DEPTH, a, W, b];
      if (o.side === 'N') return [a, 0, b, DOOR_DEPTH];
      return [a, H - DOOR_DEPTH, b, H];
    });
    room._mbDoorZones = zs;
    return zs;
  }
  function inDoorZone(room, x, y) {
    for (const z of doorZones(room)) if (x > z[0] && x < z[2] && y > z[1] && y < z[3]) return true;
    return false;
  }
  /** A leaf blade from (0,0) along +y-up: length len, half-width wid. */
  function leafPath(len, wid, curl) {
    const p = new Path2D();
    const c = curl || 0;
    p.moveTo(0, 0);
    p.bezierCurveTo(-wid * 1.1, -len * 0.25, -wid * 0.9 + c, -len * 0.75, c * 1.6, -len);
    p.bezierCurveTo(wid * 0.9 + c, -len * 0.75, wid * 1.1, -len * 0.25, 0, 0);
    p.closePath();
    return p;
  }
  function drawLeaf(ctx, x, y, ang, len, wid, o) {
    o = o || {};
    const ch = CH();
    ctx.save();
    ctx.translate(x, y); ctx.rotate(ang);
    const p = leafPath(len, wid, o.curl || 0);
    if (ch) ch.shape(ctx, p, { fill: o.fill || MB.leaf, box: [-wid, -len, wid, 0], light: -1, shade: 0.45, hi: 0.18, lw: o.lw == null ? 1.6 : o.lw });
    else { ctx.fillStyle = o.fill || MB.leaf; ctx.fill(p); }
    ctx.strokeStyle = o.vein || 'rgba(196,212,154,0.45)'; ctx.lineWidth = 0.9;
    ctx.beginPath(); ctx.moveTo(0, -1); ctx.quadraticCurveTo((o.curl || 0) * 0.5, -len * 0.5, (o.curl || 0) * 1.4, -len * 0.92); ctx.stroke();
    ctx.restore();
  }
  /** Small thorn triangle at (x,y) pointing along angle a. */
  function thorn(ctx, x, y, a, len, w, col) {
    const ca = Math.cos(a), sa = Math.sin(a);
    ctx.beginPath();
    ctx.moveTo(x - sa * w, y + ca * w);
    ctx.lineTo(x + ca * len, y + sa * len);
    ctx.lineTo(x + sa * w, y - ca * w);
    ctx.closePath();
    ctx.fillStyle = MB.outline; ctx.fill();
    ctx.beginPath();
    ctx.moveTo(x - sa * w * 0.55, y + ca * w * 0.55);
    ctx.lineTo(x + ca * (len - 1.2), y + sa * (len - 1.2));
    ctx.lineTo(x + sa * w * 0.55, y - ca * w * 0.55);
    ctx.closePath();
    ctx.fillStyle = col || MB.thorn; ctx.fill();
  }

  // =====================================================================================================
  // bloom_seed — the spitter's projectile: a spinning wax seed with a pollen tail
  // =====================================================================================================
  class BloomSeed extends G.Projectile {
    update(dt) {
      super.update(dt);
      this.spin = (this.spin || 0) + dt * 14 * (this.vx >= 0 ? 1 : -1);
      if (!this.dead && G.fx && Math.random() < dt * 22) G.fx.burst('pollen', this.cx, this.cy, { count: 1, color: '#ffe08a' });
    }
    draw(ctx, t) {
      const x = this.cx, y = this.cy;
      glow(ctx, x, y, 20, MB.gold, 0.4);
      ctx.save();
      ctx.translate(x, y); ctx.rotate(this.spin || 0);
      ctx.fillStyle = MB.outline;
      ctx.beginPath(); ctx.ellipse(0, 0, 8.5, 6, 0, 0, TAU); ctx.fill();
      ctx.fillStyle = '#8a6a34';
      ctx.beginPath(); ctx.ellipse(0, 0, 7, 4.6, 0, 0, TAU); ctx.fill();
      ctx.fillStyle = MB.wax;
      ctx.beginPath(); ctx.ellipse(2.5, -0.8, 3.6, 2.4, 0, 0, TAU); ctx.fill();
      ctx.fillStyle = MB.goldHot;
      ctx.beginPath(); ctx.arc(-3.2, 0.6, 1.4, 0, TAU); ctx.fill();
      ctx.restore();
      void t;
    }
    burstFx(why) {
      super.burstFx(why);
      if (G.fx) {
        G.fx.burst('pollen', this.cx, this.cy, { count: 10, color: '#ffe08a' });
        G.fx.burst('dust', this.cx, this.cy, { count: 4, color: '#c8b070' });
      }
      if (why === 'terrain') G.sfxAt('seed_pop', this.cx, { vol: 0.5 });
    }
  }
  if (G.registerProjectile) G.registerProjectile('bloom_seed', BloomSeed, { r: 7, gravity: 1150, life: 4, color: MB.gold, damage: 1, destroyable: true });

  // =====================================================================================================
  // bloom_spitter
  // =====================================================================================================
  class BloomSpitter extends G.Enemy {
    constructor(props) {
      super(props, {
        hp: 22, w: 36, h: 58,
        cinders: [4, 7],
        weight: 12, hitStun: 0,
        sight: 9.5 * TILE,
        colors: { body: MB.wax, dark: MB.leafDark, hit: MB.waxHi, smoke: MB.smoke, puddle: '#cfc6a0', tele: MB.gold },
        puddleW: 24,
      });
      this.openK = 0;       // 0 closed bud .. 1 fully open
      this.aim = 0;         // head tilt (rad, + = toward facing)
      this.pulse = 0;       // spit recoil 1 → 0
      this.hurtT = 0;
      this.sway = Math.random() * TAU;
    }
    init() { super.init(); this.setState('closed'); this.cooldown('spit', rnd(0.8, 1.3)); }   // entry grace
    headPos() {
      const s = Math.sin(this.sway) * 3 * (1 - this.openK);
      return { x: this.cx + s + this.facing * (2 + this.aim * 10), y: this.y + 16 + this.pulse * 3 };
    }
    eye() { const h = this.headPos(); return { x: h.x + this.facing * Math.sin(this.aim) * 6, y: h.y - 6 }; }
    teleAnchor() { return this.eye(); }
    think(dt) {
      this.sway += dt * 1.3;
      if (this.hurtT > 0) this.hurtT -= dt;
      this.pulse = Math.max(0, this.pulse - dt * 5);
      const p = this.player;
      const tgtOpen = this.is('closed') || this.is('close') ? 0 : 1;
      this.openK = toward(this.openK, tgtOpen, dt * (tgtOpen ? 2.3 : 2.6));
      // the head turns to track the Wickling while open
      let aimT = 0;
      if (this.openK > 0.05 && this.targetable(p)) {
        this.face(p);
        const dx = Math.abs(this.dx(p)), dy = this.dy(p);
        aimT = clamp(Math.atan2(-dy, dx + 1) * 0.5, -0.35, 0.75);
      }
      this.aim = toward(this.aim, aimT, dt * 2.5);
      switch (this.state) {
        case 'closed':
          if (this.ready('spit') && this.canSee(p)) this.setState('open');
          break;
        case 'open': {
          if (this.once('tele')) {
            const e = this.eye();
            this.stateData.w = this.telegraph(0.55, { sound: 'bloom_open', vol: 0.9, color: MB.gold, x: e.x, y: e.y, shake: 1.2 });
            const d = this.targetable(p) ? Math.abs(this.dx(p)) : 9 * TILE;
            this.stateData.n = d < 2.5 * TILE ? 1 : d < 5.5 * TILE ? 2 : 3;
            if (Math.random() < 0.2) this.stateData.n = Math.max(1, this.stateData.n - 1);
          }
          if (this.stateTime >= this.stateData.w) this.setState('spit', { n: this.stateData.n });
          break;
        }
        case 'spit': {
          const n = this.stateData.n || 2;
          for (let i = 0; i < n; i++) if (this.at(i * 0.17)) this.spit(i, n);
          if (this.stateTime > (n - 1) * 0.17 + 0.5) this.setState('close');
          break;
        }
        case 'close':
          if (this.openK <= 0.02) { this.cooldown('spit', rnd(1.5, 2.2)); this.setState('closed'); }
          if (this.stateTime > 1.2) this.setState('closed');
          break;
        default: this.setState('closed');
      }
    }
    spit(i, n) {
      const p = this.player;
      if (!this.targetable(p)) return;
      const off = n === 1 ? 0 : n === 2 ? (i ? 0.7 : -0.7) * TILE : (i - 1) * 1.15 * TILE;
      const pc = { x: p.x + p.w / 2 + off + (p.vx || 0) * 0.15, y: p.y + p.h * 0.5 };
      const e = this.eye();
      const dist = Math.hypot(pc.x - e.x, pc.y - e.y);
      const time = clamp(dist / 430, 0.62, 1.15) + i * 0.04;
      this.lob('bloom_seed', { x: pc.x, y: pc.y, w: 0, h: 0 }, { time, sound: 'seed_spit', vol: 0.8 });
      this.pulse = 1;
      if (G.fx) G.fx.burst('pollen', e.x, e.y, { count: 6, color: '#ffe08a' });
    }
    onHurt() { this.hurtT = 0.22; }
    drawBounds() { return { x: this.x - 46, y: this.y - 40, w: this.w + 92, h: this.h + 50 }; }
    drawBody(ctx, t) {
      const h = this.headPos();
      drawSpitter(ctx, this.cx, this.y + this.h, h.x, h.y, this.facing, t, {
        open: this.openK, aim: this.aim, pulse: this.pulse, hurt: this.hurtT, seed: this.seed, tele: this.telegraphing, dead: !!this.dying,
      });
      if (!this.dying && G.lighting && this.openK > 0.1) {
        const e = this.eye();
        G.lighting.add({ x: e.x, y: e.y, r: 70 + 50 * this.openK, color: '#ffd880', intensity: 0.25 + 0.4 * this.openK, flicker: false });
      }
    }
    drawCorpse(ctx, t) {
      drawSpitter(ctx, this.cx, this.y + this.h, this.cx, this.y + 22, this.facing, t, { open: 0.25, aim: -0.6, pulse: 0, hurt: 0, seed: this.seed, dead: true });
    }
  }

  /** Spitter art: feet centre (fx, fy), head base (hx, hy). s: {open, aim, pulse, hurt, seed, tele, dead}. */
  function drawSpitter(ctx, fx, fy, hx, hy, f, t, s) {
    const ch = CH();
    const k = ease(clamp(s.open, 0, 1));
    if (ch) ch.shadow(ctx, fx, fy, 24, 0.5);
    // root leaves splayed on the soil
    drawLeaf(ctx, fx - 4, fy - 1, -1.25, 26, 7, { curl: -3 });
    drawLeaf(ctx, fx + 4, fy - 1, 1.2, 28, 7.5, { curl: 3 });
    drawLeaf(ctx, fx - f * 2, fy, -f * 0.45, 20, 6, { fill: MB.leafLight, curl: f * 2 });
    // stem: a thick curved stalk with an outline
    const jerk = s.hurt > 0 ? Math.sin(s.hurt * 40) * 3 : 0;
    const hxx = hx + jerk;
    ctx.lineCap = 'round';
    const stem = () => { ctx.beginPath(); ctx.moveTo(fx, fy - 2); ctx.bezierCurveTo(fx - f * 6, fy - 18, hxx - f * 8, hy + 18, hxx, hy + 2); };
    stem(); ctx.strokeStyle = MB.outline; ctx.lineWidth = 10; ctx.stroke();
    stem(); ctx.strokeStyle = MB.stem; ctx.lineWidth = 6.5; ctx.stroke();
    stem(); ctx.strokeStyle = 'rgba(190,210,140,0.35)'; ctx.lineWidth = 1.6; ctx.stroke();
    // a stem leaf
    drawLeaf(ctx, lerp(fx, hxx, 0.55) - f * 3, lerp(fy, hy, 0.55), -f * 0.9, 17, 5.5, { curl: -f * 2 });
    // head
    ctx.save();
    ctx.translate(hxx, hy);
    ctx.rotate(f * (s.aim || 0) * 0.9);
    if (f < 0) ctx.scale(-1, 1);
    const sc = 1 + (s.pulse || 0) * 0.12;
    ctx.scale(sc, 2 - sc);
    // sepals
    drawLeaf(ctx, -2, 2, -0.9 - k * 0.3, 12, 4.5, { fill: MB.leafDark, lw: 1.4 });
    drawLeaf(ctx, 2, 2, 0.9 + k * 0.3, 12, 4.5, { fill: MB.leafDark, lw: 1.4 });
    const L = 30, W = 9.5;
    const petal = (ang, len, wid, fill, sh) => {
      ctx.save(); ctx.rotate(ang);
      const p = leafPath(len, wid, 0);
      if (ch) ch.shape(ctx, p, { fill, box: [-wid, -len, wid, 0], light: -1, shade: sh, hi: 0.3, lw: 1.8, rim: MB.waxHi, rimWidth: 1.2 });
      else { ctx.fillStyle = fill; ctx.fill(p); }
      // wax drip on the petal edge
      ctx.fillStyle = 'rgba(255,251,234,0.5)';
      ctx.beginPath(); ctx.ellipse(-wid * 0.35, -len * 0.55, 1.2, 3, 0, 0, TAU); ctx.fill();
      ctx.restore();
    };
    // back petals (behind the throat)
    petal(lerp(-0.24, -1.05, k), L * lerp(1, 0.92, k), W, MB.waxShade, 0.5);
    petal(lerp(0.24, 1.05, k), L * lerp(1, 0.92, k), W, MB.waxShade, 0.5);
    petal(lerp(0, 0, k), L * lerp(1.04, 0.7, k), W * 1.05, '#d8ceaa', 0.45);
    // throat (visible as it opens)
    if (k > 0.04) {
      const cy = -10 - 4 * k, rx = 13 * k, ry = 10 * k;
      ctx.fillStyle = MB.outline;
      ctx.beginPath(); ctx.ellipse(0, cy, rx + 1.8, ry + 1.8, 0, 0, TAU); ctx.fill();
      ctx.fillStyle = MB.throat;
      ctx.beginPath(); ctx.ellipse(0, cy, rx, ry, 0, 0, TAU); ctx.fill();
      const gl = s.dead ? 0.15 : (0.55 + 0.45 * k) * (s.tele ? 0.8 + 0.2 * Math.sin(t * 30) : 0.85);
      ctx.fillStyle = MB.gold; ctx.globalAlpha = gl;
      ctx.beginPath(); ctx.ellipse(0, cy, rx * 0.72, ry * 0.68, 0, 0, TAU); ctx.fill();
      ctx.globalAlpha = 1;
      // stamen teeth around the mouth
      for (let i = 0; i < 9; i++) {
        const a = (i / 9) * TAU + 0.2;
        thorn(ctx, Math.cos(a) * rx * 0.86, cy + Math.sin(a) * ry * 0.86, a + Math.PI, 4.5 * k, 1.3, MB.waxHi);
      }
      // the mouth and three tiny ember eyes above it
      ctx.fillStyle = '#1a0c06';
      ctx.beginPath(); ctx.ellipse(0, cy + 1, 4 * k + (s.pulse || 0) * 2, 3.2 * k + (s.pulse || 0) * 2, 0, 0, TAU); ctx.fill();
      if (!s.dead) {
        ctx.fillStyle = '#fff6d0';
        for (const [ex, ey] of [[-5.5, -4.5], [0, -6.8], [5.5, -4.5]]) { ctx.beginPath(); ctx.arc(ex * k, cy + ey * k, 1.3, 0, TAU); ctx.fill(); }
      }
      if (!s.dead) glow(ctx, 0, cy, 26 * k, MB.gold, 0.5 * k);
    }
    // front petals: wrap the bud when closed, fold down to the sides when open
    petal(lerp(-0.12, -1.75, k), L * lerp(0.98, 0.85, k), W * 1.08, MB.wax, 0.38);
    petal(lerp(0.12, 1.75, k), L * lerp(0.98, 0.85, k), W * 1.08, MB.wax, 0.32);
    // closed: a faint gold seam glows between the wrapped petals
    if (k < 0.5 && !s.dead) {
      const a = (0.18 + 0.12 * Math.sin(t * 1.7 + (s.seed || 0))) * (1 - k * 2);
      ctx.strokeStyle = 'rgba(255,214,120,' + a.toFixed(3) + ')'; ctx.lineWidth = 1.3;
      ctx.beginPath(); ctx.moveTo(0, -4); ctx.quadraticCurveTo(1.5, -16, 0, -27); ctx.stroke();
    }
    ctx.restore();
  }

  G.registerEnemy('bloom_spitter', BloomSpitter);

  // =====================================================================================================
  // thorn_hopper
  // =====================================================================================================
  class ThornHopper extends G.Enemy {
    constructor(props) {
      super(props, {
        hp: 20, w: 34, h: 30,
        cinders: [3, 5],                          // small (enemies.md §8.4: meltbloom small [3,5])
        weight: 1,
        sight: 8 * TILE,
        colors: { body: MB.pod, dark: MB.podDark, hit: MB.podHi, smoke: MB.smoke, puddle: '#8a7a4c', tele: MB.tele },
        puddleW: 20,
      });
      this.range = (+props.range || 6) * TILE;    // beat: tiles left/right of the spawn point
      this.squash = 0;                            // + = crouched, - = stretched
      this.bristle = 0;
      this.roll = 0;
      this.hurtT = 0;
      this.wob = Math.random() * TAU;
    }
    init() { super.init(); this.setState('idle'); this.cooldown('hop', rnd(0.7, 1.2)); }   // entry grace
    /** Knockback never pushes the pod off a ledge / onto thorns, nor bends a committed hop off its safe landing. */
    guardKnockback() {
      if (!(this.kbTime > 0) || !this.kbVx) return;
      const d = this.kbVx > 0 ? 1 : -1;
      if (this.airborne || this.ledgeAhead(d, 6) || this.hazardAhead(d, 6) || inDoorZone(this.room, this.cx + d * TILE, this.cy)) this.kbVx = 0;
    }
    whileStunned() { this.guardKnockback(); }
    think(dt) {
      this.guardKnockback();
      this.wob += dt * 3;
      if (this.hurtT > 0) this.hurtT -= dt;
      const p = this.player;
      const tgtSq = this.is('crouch') ? 0.28 : this.is('land') ? Math.max(0, 0.32 - this.stateTime) : this.airborne ? -0.16 : 0;
      this.squash = toward(this.squash, tgtSq, dt * (this.is('crouch') ? 1.2 : 3.5));
      this.bristle = toward(this.bristle, this.is('crouch') ? 1 : 0, dt * 4);
      if (this.airborne) this.roll += this.vx * dt * 0.02;
      else this.roll = toward(this.roll, Math.round(this.roll / TAU) * TAU, dt * 6);
      switch (this.state) {
        case 'idle': {
          this.stop(1800);
          if (!this.grounded) break;
          const sees = this.canSee(p) && Math.abs(this.dy(p)) < 4 * TILE;
          if (sees && this.ready('hop')) { this.face(p); this.setState('crouch', { chase: true }); }
          else if (!sees && this.ready('hop') && this.stateTime > rnd(1.4, 2.6)) {
            // wander: a small hop along its beat
            const dir = Math.abs(this.cx - this.home.x) > this.range * 0.5 ? (this.home.x > this.cx ? 1 : -1) : (Math.random() < 0.5 ? -1 : 1);
            this.facing = dir;
            this.setState('crouch', { chase: false });
          }
          break;
        }
        case 'crouch':
          this.stop(2400);
          if (this.once('tele')) this.stateData.w = this.telegraph(this.stateData.chase ? 0.45 : 0.4, { shake: 1.4, sound: this.stateData.chase ? 'enemy_windup' : false, vol: 0.6 });
          if (this.stateData.chase && this.targetable(p)) this.face(p);
          if (this.stateTime >= this.stateData.w) this.leap(!!this.stateData.chase);
          break;
        case 'air':
          if (this.grounded && this.stateTime > 0.08) {
            this.vx = 0;
            G.sfxAt('pod_land', this.cx, { vol: 0.75 });
            if (G.fx) G.fx.burst('dust', this.cx, this.bottom, { count: 7, color: '#b8a878' });
            this.setState('land');
          } else if (this.stateTime > 2.5) this.setState('land');
          break;
        case 'land':
          this.stop();
          if (this.stateTime > 0.5) { this.cooldown('hop', 0.15); this.setState('idle'); }
          break;
        default: this.setState('idle');
      }
    }
    /** Pick a landing spot toward the target (or along the beat), clamped to safe floor; then jump. */
    leap(chase) {
      const p = this.player;
      const maxD = (chase ? 4.2 : 1.8) * TILE;
      let want = chase && this.targetable(p) ? this.dx(p) : this.facing * maxD;
      want = clamp(want, -maxD, maxD);
      if (Math.abs(want) < 0.6 * TILE) want = (want >= 0 ? 1 : -1) * 0.6 * TILE;
      const land = this.findLanding(want);
      const dx = land ? land.x - this.cx : 0;
      const footY = land ? land.y : this.bottom;
      const apex = chase ? 70 + Math.min(60, Math.abs(dx) * 0.25) : 36;
      this.leapTo(this.cx + dx, footY, apex);
      if (Math.abs(dx) < 2) this.vx = 0;
      G.sfxAt('pod_hop', this.cx, { vol: 0.7 });
      if (G.fx) G.fx.burst('dust', this.cx, this.bottom, { count: 4, color: '#b8a878' });
      this.cooldown('hop', chase ? 0.2 : 0.8);
      this.setState('air');
    }
    /** Safe landing x (feet) within want px; shrinks toward the current spot. Returns {x, y} or null. */
    findLanding(want) {
      const room = this.room;
      const dir = want >= 0 ? 1 : -1;
      const r0 = Math.floor((this.bottom - 2) / TILE);
      for (let d = Math.abs(want); d >= 0.5 * TILE; d -= TILE * 0.25) {
        const x = this.cx + dir * d;
        if (Math.abs(x - this.home.x) > this.range) continue;
        if (x - this.w / 2 < TILE || x + this.w / 2 > room.widthPx - TILE) continue;
        // feet must land on solid/platform ground at most 2 rows up or 3 rows down, with headroom
        let ok = null;
        for (let dr = -2; dr <= 3 && !ok; dr++) {
          const r = r0 + dr;
          const fl = room.tileAt(Math.floor(x / TILE), r + 1);
          const l = room.tileAt(Math.floor((x - this.w / 2 + 2) / TILE), r + 1), rr = room.tileAt(Math.floor((x + this.w / 2 - 2) / TILE), r + 1);
          const solid = (c) => G.Physics.isSolidTile(c) || c === G.T.PLATFORM;
          if (!solid(fl) || !solid(l) || !solid(rr)) continue;
          if (G.Physics.rectSolid(room, x - this.w / 2, (r + 1) * TILE - this.h - 2, this.w, this.h)) continue;
          const y = (r + 1) * TILE;
          if (inDoorZone(room, x, y - this.h / 2)) continue;
          // no hazard tiles at the landing or right beside it
          let haz = false;
          for (let c = Math.floor((x - this.w / 2) / TILE) - 1; c <= Math.floor((x + this.w / 2) / TILE) + 1; c++) {
            if (G.Physics.isHazardTile(room.tileAt(c, r)) || G.Physics.isHazardTile(room.tileAt(c, r + 1))) haz = true;
          }
          if (haz) continue;
          // the arc must not cross a wall: sample the straight line at mid-body height
          let blocked = false;
          for (let q = 0.2; q <= 1; q += 0.2) {
            const sx = lerp(this.cx, x, q), sy = lerp(this.cy, y - this.h / 2, q) - 30 * Math.sin(q * Math.PI);
            if (G.Physics.rectSolid(room, sx - this.w / 2 + 3, sy - this.h / 2 + 3, this.w - 6, this.h - 6)) blocked = true;
          }
          if (!blocked) ok = { x, y };
        }
        if (ok) return ok;
      }
      return null;
    }
    onHurt(hit) {
      this.hurtT = 0.2;
      if (this.is('idle') && hit && hit.source) this.face(hit.source);
    }
    drawBounds() { return { x: this.x - 30, y: this.y - 34, w: this.w + 60, h: this.h + 44 }; }
    drawBody(ctx, t) {
      drawHopper(ctx, this.cx, this.y + this.h, this.facing, t, {
        squash: this.squash, bristle: this.bristle, roll: this.roll, air: this.airborne, hurt: this.hurtT, seed: this.seed, wob: this.wob,
        tele: this.telegraphing, dead: !!this.dying, vx: this.vx,
      });
    }
  }

  /** Hopper art: feet centre (fx, fy). */
  function drawHopper(ctx, fx, fy, f, t, s) {
    const ch = CH();
    const sq = s.squash || 0;
    const sx = 1 + sq * 0.45, sy = 1 - sq * 0.55;
    const air = !!s.air;
    if (ch) ch.shadow(ctx, fx, fy, 19 * sx, air ? 0.25 : 0.5);
    const rx = 16.5 * sx, ry = 13.5 * sy;
    const legH = air ? 2 : 5 * sy;
    const cy = fy - legH - ry;
    // root feet
    ctx.strokeStyle = MB.outline; ctx.lineCap = 'round'; ctx.lineWidth = 5.5;
    for (const side of [-1, 1]) {
      const lx = fx + side * 7 * sx;
      ctx.beginPath(); ctx.moveTo(lx, cy + ry * 0.6); ctx.quadraticCurveTo(lx + side * 3, fy - 2, lx + side * 6, air ? fy - 3 : fy - 1); ctx.stroke();
    }
    ctx.strokeStyle = '#4a3c20'; ctx.lineWidth = 3;
    for (const side of [-1, 1]) {
      const lx = fx + side * 7 * sx;
      ctx.beginPath(); ctx.moveTo(lx, cy + ry * 0.6); ctx.quadraticCurveTo(lx + side * 3, fy - 2, lx + side * 6, air ? fy - 3 : fy - 1); ctx.stroke();
    }
    ctx.save();
    ctx.translate(fx, cy);
    ctx.rotate((s.roll || 0) * 0.35 + Math.sin(s.wob || 0) * 0.03);
    // thorns behind the rim (drawn first so the body overlaps their bases)
    const nT = 11, tl = 6.5 + (s.bristle || 0) * 4.5 + (s.dead ? -3 : 0);
    for (let i = 0; i < nT; i++) {
      const a = Math.PI * (0.92 + (i / (nT - 1)) * 1.16) + Math.sin(i * 2.3 + (s.seed || 0)) * 0.05;
      const px = Math.cos(a) * rx * 0.92, py = Math.sin(a) * ry * 0.92;
      thorn(ctx, px, py, a, tl + h01(i, 3) * 2.5, 2.6, MB.thorn);
    }
    // the pod
    const body = new Path2D();
    body.ellipse(0, 0, rx, ry, 0, 0, TAU);
    if (ch) ch.shape(ctx, body, { fill: MB.pod, box: [-rx, -ry, rx, ry], light: -1, shade: 0.5, hi: 0.22, lw: 2, rim: MB.podHi, rimWidth: 1.4 });
    else { ctx.fillStyle = MB.pod; ctx.fill(body); }
    ctx.save();
    ctx.clip(body);
    // seed-pod seams
    ctx.strokeStyle = 'rgba(40,32,16,0.5)'; ctx.lineWidth = 1.2;
    for (const k of [-0.55, 0, 0.55]) { ctx.beginPath(); ctx.moveTo(k * rx * 0.6, -ry); ctx.quadraticCurveTo(k * rx * 1.25, 0, k * rx * 0.6, ry); ctx.stroke(); }
    // wax speckles
    ctx.fillStyle = 'rgba(241,230,192,0.35)';
    for (let i = 0; i < 7; i++) { ctx.beginPath(); ctx.arc((h01(i, 7) - 0.5) * rx * 1.5, (h01(i, 9) - 0.6) * ry * 1.4, 0.9 + h01(i, 4), 0, TAU); ctx.fill(); }
    ctx.restore();
    // the face: a crack across the front, glowing gold, with two pinprick eyes
    const open = s.dead ? 0.15 : 0.35 + (s.bristle || 0) * 0.65 + (s.hurt > 0 ? 0.3 : 0);
    const fxo = f * rx * 0.28;
    ctx.fillStyle = MB.outline;
    ctx.beginPath();
    ctx.moveTo(fxo - 10, 1); ctx.quadraticCurveTo(fxo, 1 - 3.5 * open, fxo + 10, 1); ctx.quadraticCurveTo(fxo, 1 + 4.5 * open, fxo - 10, 1);
    ctx.fill();
    if (!s.dead) {
      glow(ctx, fxo, 1, 12 + 8 * open, MB.gold, 0.25 + 0.4 * open);
      ctx.fillStyle = s.tele ? MB.goldHot : MB.gold;
      const er = 1.2 + open * 0.8;
      ctx.beginPath(); ctx.arc(fxo - 3.5, 1, er, 0, TAU); ctx.arc(fxo + 3.5, 1, er, 0, TAU); ctx.fill();
    }
    // a little sprout on top
    const sw = Math.sin((t || 0) * 2 + (s.seed || 0)) * 0.15 - f * (s.vx || 0) * 0.0006;
    drawLeaf(ctx, -1, -ry + 2, -0.5 + sw, 10, 3.5, { fill: MB.leafLight, lw: 1.3 });
    drawLeaf(ctx, 1, -ry + 2, 0.55 + sw, 8, 3, { fill: MB.leaf, lw: 1.3 });
    ctx.restore();
  }

  G.registerEnemy('thorn_hopper', ThornHopper);

  // =====================================================================================================
  // pollen_moth
  // =====================================================================================================
  const PM = { body: '#e6d6a4', bodyDark: '#8c7a4c', fuzz: '#fff3cc', wing: '#d2d2a2', wingHind: '#ebe2b8', wingDark: '#68704a', vein: '#9a9a6c', spot: '#c88a2a', eye: '#1c1a12' };

  class PollenMoth extends G.Enemy {
    constructor(props) {
      super(props, {
        hp: 18, w: 32, h: 28,
        flying: true,
        cinders: [3, 5],
        weight: 0.6,
        sight: 8.5 * TILE,
        colors: { body: PM.body, dark: PM.bodyDark, hit: '#fff8e0', smoke: MB.smoke, puddle: '#d8c890', tele: MB.gold },
        puddleW: 18,
      });
      this.flap = Math.random() * TAU;
      this.glowK = 0.35;
      this.range = (+props.range || 7) * TILE;     // leash: never further than this from home
      this.lean = 0;
    }
    init() { super.init(); this.setState('hover'); this.cooldown('swoop', rnd(0.9, 1.5)); }   // entry grace
    think(dt) {
      const p = this.player;
      const tgtGlow = this.is('charge') ? 1 : this.is('swoop') ? 0.85 : 0.35;
      this.glowK = toward(this.glowK, tgtGlow, dt * (this.is('charge') ? 1.8 : 2.5));
      this.flap += dt * (this.is('swoop') ? 30 : this.is('charge') ? 62 : 44);
      this.lean = toward(this.lean, clamp(this.vx / 300, -0.5, 0.5), dt * 3);
      const h = this.home;
      switch (this.state) {
        case 'hover':
          this.hover(null, null, dt, { amp: 18, freq: 0.4, speed: 60, accel: 240 });
          if (Math.abs(this.vx) > 10) this.facing = this.vx > 0 ? 1 : -1;
          if (this.stateTime > 0.3 && this.ready('swoop') && this.canSee(p) && this.inLeash(p.x + p.w / 2, p.y)) this.setState('stalk');
          break;
        case 'stalk': {
          // take a perch ~3.5 tiles to the side of and 3 tiles above the Wickling, inside the leash
          if (!this.targetable(p)) { this.setState('return'); break; }
          this.face(p);
          const side = this.cx < p.x + p.w / 2 ? -1 : 1;
          let tx = p.x + p.w / 2 + side * 3.5 * TILE, ty = p.y - 2.6 * TILE + this.bob(6, 0.7);
          tx = clamp(tx, h.x - this.range, h.x + this.range);
          ty = clamp(ty, h.y - this.range * 0.6, h.y + this.range * 0.6);
          if (inDoorZone(this.room, tx, ty)) tx = clamp(p.x + p.w / 2 - side * 3.5 * TILE, h.x - this.range, h.x + this.range);
          if (this.room) { tx = clamp(tx, 1.5 * TILE, this.room.widthPx - 1.5 * TILE); ty = clamp(ty, 1.5 * TILE, this.room.heightPx - 1.5 * TILE); }
          const d = this.flyTo(tx, ty, 120, dt, { accel: 420, arrive: 50 });
          // never dives at a Wickling standing in a doorway (room to react on entry): hold the perch
          const pDoor = inDoorZone(this.room, p.x + p.w / 2, p.y + p.h / 2);
          if (pDoor && this.stateTime > 4) { this.setState('return'); break; }
          if (!pDoor && ((d < 40 && this.stateTime > 0.4) || this.stateTime > 1.6)) {
            if (this.canSee(p)) this.setState('charge'); else this.setState('return');
          }
          break;
        }
        case 'charge': {
          this.vx *= 0.9; this.vy *= 0.9;
          if (this.targetable(p)) this.face(p);
          if (this.once('tele')) this.stateData.w = this.telegraph(0.55, { color: MB.gold, sound: 'enemy_windup', vol: 0.7, shake: 1.2 });
          if (this.stateTime >= this.stateData.w) {
            if (!this.targetable(p)) { this.setState('return'); break; }
            const tx = p.x + p.w / 2 + (p.vx || 0) * 0.12, ty = p.y + p.h * 0.55;
            const dx = tx - this.cx, dy = ty - this.cy, d = Math.max(1, Math.hypot(dx, dy));
            this.setState('swoop', { dx: dx / d, dy: dy / d, len: d + 1.5 * TILE, x0: this.cx, y0: this.cy });
            G.sfxAt('moth_swoop', this.cx, { vol: 0.85 });
          }
          break;
        }
        case 'swoop': {
          const sd = this.stateData;
          const sp = 540;
          this.vx = sd.dx * sp; this.vy = sd.dy * sp;
          if (Math.abs(sd.dx) > 0.1) this.facing = sd.dx > 0 ? 1 : -1;
          if (G.fx && this.every(0.03)) G.fx.burst('pollen', this.cx - sd.dx * 10, this.cy - sd.dy * 10, { count: 2, color: '#ffe08a' });
          const gone = Math.hypot(this.cx - sd.x0, this.cy - sd.y0);
          const ahead = { x: this.cx + sd.dx * 20, y: this.cy + sd.dy * 20 };
          const edge = this.room && (ahead.x < TILE || ahead.x > this.room.widthPx - TILE || ahead.y < TILE || ahead.y > this.room.heightPx - TILE);
          if (edge || (this.stateTime > 0.1 && inDoorZone(this.room, ahead.x, ahead.y)) || gone > sd.len || this.stateTime > 0.75 || (this.stateTime > 0.06 && (this.wallHit || this.grounded || this.ceilHit))) this.setState('recover');
          break;
        }
        case 'recover':
          // brake, then climb slowly — the punish window
          {
            // glide out of the dive, braking hard before a doorway or the room's edge
            const ax = this.cx + Math.sign(this.vx) * 2 * TILE, ay = this.cy + Math.sign(this.vy) * TILE;
            const wall = this.room && (ax < 1.5 * TILE || ax > this.room.widthPx - 1.5 * TILE);
            const br = wall || inDoorZone(this.room, ax, ay) ? 3200 : 1300;
            this.vx = toward(this.vx, 0, br * dt);
            this.vy = toward(this.vy, -70, br * dt);
          }
          if (this.stateTime > 0.85) { this.cooldown('swoop', rnd(1.2, 1.8)); this.setState(this.canSee(p) && this.inLeash(this.cx, this.cy) ? 'stalk' : 'return'); }
          break;
        case 'return': {
          const d = this.flyTo(h.x, h.y, 90, dt, { accel: 260, arrive: 50 });
          if (Math.abs(this.vx) > 10) this.facing = this.vx > 0 ? 1 : -1;
          if (d < 20 || this.stateTime > 5) this.setState('hover');
          else if (this.stateTime > 0.8 && this.ready('swoop') && this.canSee(p) && this.inLeash(p.x + p.w / 2, p.y)) this.setState('stalk');
          break;
        }
        default: this.setState('hover');
      }
      if (this.state !== 'swoop' && this.state !== 'recover' && !this.inLeash(this.cx, this.cy, 1.25) && this.state !== 'return') this.setState('return');
    }
    inLeash(x, y, mul) {
      const h = this.home, r = this.range * (mul || 1.15);
      return Math.abs(x - h.x) < r && Math.abs(y - h.y) < r;
    }
    whileStunned() { this.flap += G.CONST.DT * 30; }
    drawBounds() { return { x: this.x - 40, y: this.y - 40, w: this.w + 80, h: this.h + 72 }; }
    drawBody(ctx, t) {
      const k = this.glowK * (this.telegraphing ? 0.85 + 0.15 * Math.sin(t * 28) : 1);
      const ab = this.abdomen();
      glow(ctx, ab.x, ab.y, 18 + 26 * k, MB.gold, 0.25 + 0.45 * k);
      drawMothCached(ctx, this.cx, this.cy, this.facing, this.flap, this.lean, this.is('charge') ? 1 : 0);
      glow(ctx, ab.x, ab.y, 8 + 6 * k, MB.goldHot, 0.35 + 0.5 * k);
      if (G.lighting) G.lighting.add({ x: ab.x, y: ab.y, r: 50 + 60 * k, color: '#ffd880', intensity: 0.2 + 0.35 * k, flicker: false });
    }
    abdomen() {
      const a = this.lean * this.facing * 0.6;
      const ox = -this.facing * 1, oy = 10;
      return { x: this.cx + ox * Math.cos(a) - oy * Math.sin(a), y: this.cy + ox * Math.sin(a) + oy * Math.cos(a) };
    }
    drawCorpse(ctx, t) { drawMoth(ctx, this.cx, this.cy, this.facing, 1.2, t, this.seed, 0, true, 0); }
  }

  function mothWing(len, wid, fore) {
    const p = new Path2D();
    p.moveTo(0, 0);
    if (fore) {
      p.bezierCurveTo(len * 0.2, -wid * 1.0, len * 0.75, -wid * 1.2, len * 0.98, -wid * 0.6);
      p.bezierCurveTo(len * 1.1, -wid * 0.1, len * 0.9, wid * 0.35, len * 0.62, wid * 0.32);
      p.bezierCurveTo(len * 0.38, wid * 0.3, len * 0.15, wid * 0.22, 0, 0);
    } else {
      p.bezierCurveTo(len * 0.25, wid * 0.15, len * 0.7, wid * 0.1, len * 0.86, wid * 0.55);
      p.bezierCurveTo(len * 0.92, wid * 1.05, len * 0.5, wid * 1.15, len * 0.3, wid * 0.9);
      p.bezierCurveTo(len * 0.12, wid * 0.7, len * 0.03, wid * 0.35, 0, 0);
    }
    p.closePath();
    return p;
  }
  const MW = { fore: null, hind: null };

  /** Pollen moth art centred at (x, y). raise 0..1 lifts the wings (charge pose). */
  function drawMoth(ctx, x, y, f, flap, t, seed, lean, dead, raise) {
    const ch = CH();
    if (!MW.fore) { MW.fore = mothWing(30, 17, true); MW.hind = mothWing(22, 15, false); }
    const beat = Math.cos(flap);
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(lean * f * 0.6);
    for (const layer of ['hind', 'fore']) {
      for (const side of [-1, 1]) {
        ctx.save();
        const far = side === -f;
        ctx.translate(side * 3, layer === 'fore' ? -4 : 2);
        const base = layer === 'fore' ? -0.4 - raise * 0.5 : 0.25 - raise * 0.3;
        const amp = (layer === 'fore' ? 0.7 : 0.5) * (1 - raise * 0.6);
        const ang = dead ? 0.6 : base - beat * amp;
        ctx.scale(side * (far ? 0.8 : 1), 1);
        ctx.rotate(ang);
        ctx.scale(1, dead ? 0.7 : 0.6 + 0.4 * Math.abs(Math.sin(flap + 0.3)));
        const path = MW[layer];
        ctx.globalAlpha = far ? 0.78 : 1;
        const fill = layer === 'fore' ? PM.wing : PM.wingHind;
        if (ch) ch.shape(ctx, path, { fill, box: [0, -18, 30, 16], light: -1, shade: 0.4, hi: 0.3, lw: 1.6 });
        else { ctx.fillStyle = fill; ctx.fill(path); }
        ctx.save();
        ctx.clip(path);
        ctx.strokeStyle = PM.wingDark; ctx.globalAlpha *= 0.6; ctx.lineWidth = 5;
        ctx.stroke(path);
        ctx.lineWidth = 0.9; ctx.strokeStyle = PM.vein;
        ctx.beginPath();
        for (let k = 0; k < 4; k++) { ctx.moveTo(1, 0); ctx.quadraticCurveTo(11, (k - 1.5) * 4 - (layer === 'fore' ? 5 : -4), 28, (k - 1.5) * 7 - (layer === 'fore' ? 7 : -7)); }
        ctx.stroke();
        // gold-dusted eye-spots
        ctx.globalAlpha = far ? 0.65 : 0.95;
        if (layer === 'fore') {
          ctx.fillStyle = PM.spot; ctx.beginPath(); ctx.arc(19, -7, 4.6, 0, TAU); ctx.fill();
          ctx.fillStyle = '#3a2c14'; ctx.beginPath(); ctx.arc(19.4, -7.2, 2.4, 0, TAU); ctx.fill();
          ctx.fillStyle = MB.goldHot; ctx.beginPath(); ctx.arc(18.6, -8, 1, 0, TAU); ctx.fill();
        } else {
          ctx.fillStyle = 'rgba(200,138,42,0.5)'; ctx.beginPath(); ctx.arc(13, 8, 3.2, 0, TAU); ctx.fill();
        }
        // pollen dust speckles
        ctx.fillStyle = 'rgba(255,230,150,0.55)';
        for (let k = 0; k < 6; k++) { ctx.beginPath(); ctx.arc(6 + h01(k, layer === 'fore' ? 2 : 5) * 20, (h01(k, 8) - 0.5) * 18, 0.8, 0, TAU); ctx.fill(); }
        ctx.restore();
        ctx.restore();
      }
    }
    ctx.globalAlpha = 1;
    // body: plump furry thorax + banded glowing abdomen
    const body = new Path2D();
    body.moveTo(7.5, -2);
    body.ellipse(0, -2, 7.5, 8.5, 0, 0, TAU);
    body.moveTo(-f + 6 * Math.cos(f * 0.2), 9 + 6 * Math.sin(f * 0.2));
    body.ellipse(-f, 9, 6, 9.5, f * 0.2, 0, TAU);
    if (ch) ch.shape(ctx, body, { fill: PM.body, box: [-9, -11, 9, 19], light: -1, shade: 0.45, lw: 1.8, rim: '#fff6d8', rimWidth: 1.2 });
    else { ctx.fillStyle = PM.body; ctx.fill(body); }
    // gold bands on the abdomen
    ctx.strokeStyle = MB.goldDeep; ctx.lineWidth = 1.6;
    for (const yy of [7, 11, 15]) { ctx.beginPath(); ctx.moveTo(-f - 5, yy); ctx.quadraticCurveTo(-f, yy + 1.5, -f + 5, yy); ctx.stroke(); }
    ctx.fillStyle = PM.fuzz;
    for (let k = 0; k < 16; k++) {
      const a = (k / 16) * TAU + h01(k, seed) * 0.4;
      ctx.globalAlpha = 0.4 + 0.3 * h01(k, 3);
      ctx.beginPath(); ctx.arc(Math.cos(a) * 7.2, -2.5 + Math.sin(a) * 8, 1 + 0.6 * h01(k, 5), 0, TAU); ctx.fill();
    }
    ctx.globalAlpha = 1;
    // head, plumed antennae, big dark eyes with a gold glint
    const hx = f * 4.5, hy = -9.5;
    ctx.fillStyle = '#b8a674'; ctx.strokeStyle = MB.outline; ctx.lineWidth = 1.5;
    ctx.beginPath(); ctx.arc(hx, hy, 5, 0, TAU); ctx.stroke(); ctx.fill();
    ctx.strokeStyle = '#5a4a28'; ctx.lineWidth = 1.2;
    for (const side of [-1, 1]) {
      const sway = dead ? 0 : Math.sin(t * 2.6 + side + seed) * 1.6;
      const ax = hx + side * 2, ay = hy - 3.5;
      const ex = ax + side * 8 + f * 4 + sway, ey = ay - 11;
      ctx.beginPath(); ctx.moveTo(ax, ay); ctx.quadraticCurveTo(ax + side * 2, ay - 8, ex, ey); ctx.stroke();
      ctx.beginPath();
      for (let k = 1; k <= 5; k++) {
        const q = k / 6, px = ax + (ex - ax) * q, py = ay + (ey - ay) * q;
        ctx.moveTo(px, py); ctx.lineTo(px + side * 3, py + 1.4);
        ctx.moveTo(px, py); ctx.lineTo(px - side * 1.2, py - 1.8);
      }
      ctx.stroke();
    }
    if (!dead) {
      ctx.fillStyle = PM.eye;
      ctx.beginPath(); ctx.ellipse(hx + f * 2.2, hy + 0.5, 2.6, 3, 0, 0, TAU); ctx.fill();
      ctx.beginPath(); ctx.ellipse(hx - f * 2.2, hy + 0.5, 2, 2.6, 0, 0, TAU); ctx.fill();
      ctx.fillStyle = MB.goldHot;
      ctx.beginPath(); ctx.arc(hx + f * 1.5, hy - 0.6, 0.9, 0, TAU); ctx.fill();
    } else {
      ctx.strokeStyle = MB.outline; ctx.lineWidth = 1;
      ctx.beginPath(); ctx.moveTo(hx - 2, hy - 1); ctx.lineTo(hx + 1, hy + 2); ctx.moveTo(hx + 1, hy - 1); ctx.lineTo(hx - 2, hy + 2); ctx.stroke();
    }
    ctx.restore();
  }

  // pre-rendered flap frames (16 per facing per pose, 2x resolution)
  const MOTH_FRAMES = 16, MOTH_SPR = 96, MOTH_RES = 2;
  const mothCache = new Map();
  function mothFrame(f, i, raise) {
    const key = f + '|' + i + '|' + raise;
    let c = mothCache.get(key);
    if (c) return c;
    const mc = G.U.makeCanvas(MOTH_SPR * MOTH_RES, MOTH_SPR * MOTH_RES);
    mc.ctx.scale(MOTH_RES, MOTH_RES);
    drawMoth(mc.ctx, MOTH_SPR / 2, MOTH_SPR / 2, f, (i / MOTH_FRAMES) * TAU, i * 0.13, 7, 0, false, raise);
    c = mc.canvas;
    mothCache.set(key, c);
    return c;
  }
  function drawMothCached(ctx, x, y, f, flap, lean, raise) {
    const ph = ((flap % TAU) + TAU) % TAU;
    const spr = mothFrame(f, Math.floor((ph / TAU) * MOTH_FRAMES) % MOTH_FRAMES, raise ? 1 : 0);
    ctx.save();
    ctx.translate(x, y);
    if (lean) ctx.rotate(lean * f * 0.6);
    ctx.drawImage(spr, -MOTH_SPR / 2, -MOTH_SPR / 2, MOTH_SPR, MOTH_SPR);
    ctx.restore();
  }

  G.registerEnemy('pollen_moth', PollenMoth);

  // =====================================================================================================
  // vine_lurker
  // =====================================================================================================
  const LURK_H = 80;

  class VineLurker extends G.Enemy {
    constructor(props) {
      const ceil = props.surface === 'ceiling';
      super(props, {
        hp: 25, w: 30, h: LURK_H,
        cinders: [4, 7],
        weight: 12, hitStun: 0.06,
        physics: 'manual',
        anchor: ceil ? 'top' : 'ground',
        noSpawnShift: true,
        sight: 7 * TILE,
        colors: { body: MB.vine, dark: MB.vineDark, hit: MB.vineHi, smoke: MB.smoke, puddle: '#4a5c34', tele: MB.tele },
        puddleW: 22,
      });
      this.ceil = ceil;
      this.emerge = 0;          // 0 hidden .. 1 fully out
      this.lashP = 0;           // whip progress
      this.rear = 0;            // rear-back amount (telegraph pose)
      this.lashes = 0;
      this.hurtT = 0;
      this.sway = Math.random() * TAU;
      this.tremble = 0;
      this.reachY = 0;          // ceiling: px from the attach point down to the floor (measured at init)
    }
    init() {
      super.init();
      this.hide();
      this.setState('lurk');
      this.cooldown('ambush', 0.6);
      if (this.ceil && this.room) {
        const r = G.Physics.raycast(this.room, this.cx, this.y + 4, this.cx, this.y + 8 * TILE);
        this.reachY = clamp((r.hit ? r.y : this.y + 5 * TILE) - this.y, 3 * TILE, 6 * TILE);
      }
    }
    /** The point where the vine roots (floor: its feet; ceiling: its top). */
    get ax() { return this.cx; }
    get ay() { return this.ceil ? this.y : this.y + this.h; }
    eye() { const v = this.ceil ? 1 : -1; return { x: this.cx, y: this.ay + v * LURK_H * 0.85 * Math.max(0.3, this.emerge) }; }
    teleAnchor() { return this.eye(); }
    think(dt) {
      this.sway += dt * 1.6;
      if (this.hurtT > 0) this.hurtT -= dt;
      this.tremble = Math.max(0, this.tremble - dt);
      const p = this.player;
      // revealed from outside (scripts/tests) while lurking → come out
      if (!this.hidden && this.is('lurk')) this.setState('burst');
      const vr = this.ceil ? Math.max(5.5 * TILE, this.reachY + TILE) : 2.6 * TILE;
      switch (this.state) {
        case 'lurk': {
          this.emerge = toward(this.emerge, 0, dt * 3);
          if (!this.ready('ambush') || !this.targetable(p)) break;
          const dx = Math.abs(this.dx(p)), dy = this.dy(p);
          const near = dx < 3.1 * TILE && (this.ceil ? dy > 0 && dy < vr : Math.abs(dy) < vr);
          if (near && this.canSee(p, 6 * TILE)) this.setState('stir');
          break;
        }
        case 'stir':                         // the tell: the leaf trembles, soil spits (0.45 s)
          if (this.once('tele')) {
            this.stateData.w = this.telegraph(0.45, { sound: 'vine_rustle', vol: 0.9, shake: 0, glint: false, x: this.ax, y: this.ay + (this.ceil ? 6 : -6) });
            if (this.targetable(p)) this.face(p);
          }
          this.tremble = 0.1;
          if (G.fx && this.every(0.08)) G.fx.burst('dust', this.ax + rnd(-8, 8), this.ay, { count: 2, color: this.ceil ? '#6a7a50' : '#a89c70' });
          if (this.stateTime >= this.stateData.w) this.setState('burst');
          break;
        case 'burst':
          if (this.once('out')) {
            this.reveal();
            G.sfxAt('vine_burst', this.cx, { vol: 0.9 });
            if (G.game && G.game.shake) G.game.shake(1.5, 0.12);
            if (G.fx) { G.fx.burst('dust', this.ax, this.ay, { count: 12, color: '#8a8a5a' }); G.fx.burst('wax', this.ax, this.ay, { count: 5, color: MB.leaf, speed: 220 }); }
            this.lashes = 0;
          }
          this.emerge = toward(this.emerge, 1, dt * 4.5);
          if (this.emerge >= 1 && this.stateTime > 0.3) this.setState('windup');
          break;
        case 'windup':                       // rears back away from the Wickling (0.45 s, 0.4 s for the second lash)
          if (this.once('tele')) {
            if (this.targetable(p)) this.face(p);
            this.stateData.w = this.telegraph(this.lashes ? 0.4 : 0.45, { sound: 'enemy_windup', vol: 0.7, color: MB.tele });
          }
          this.rear = toward(this.rear, 1, dt * 4);
          this.lashP = 0;
          if (this.stateTime >= this.stateData.w) { this.setState('lash'); G.sfxAt('vine_lash', this.cx, { vol: 0.9 }); }
          break;
        case 'lash': {
          const s = this.stateTime;
          this.lashP = clamp(s / 0.2, 0, 1);
          this.rear = toward(this.rear, 0, dt * 10);
          if (this.lashP > 0.3 && s < 0.32) this.strike(this.lashRect(), { damage: 1 });
          if (s > 0.34) { this.lashes++; this.setState('recover'); }
          break;
        }
        case 'recover':                      // the whip lies out, slowly coiling back (punish window)
          this.lashP = clamp(1 - this.stateTime / 0.55, 0, 1);
          if (this.stateTime > 0.55) {
            const close = this.targetable(p) && Math.abs(this.dx(p)) < 3.8 * TILE && Math.abs(this.dy(p)) < (this.ceil ? vr : 3 * TILE);
            if (this.lashes < 2 && close) this.setState('windup'); else this.setState('retract');
          }
          break;
        case 'retract':
          this.lashP = 0; this.rear = toward(this.rear, 0, dt * 6);
          this.emerge = toward(this.emerge, 0, dt * 2.6);
          if (this.emerge <= 0.15 && !this.hidden) this.hide();
          if (this.emerge <= 0) { this.cooldown('ambush', 1.3); this.setState('lurk'); }
          break;
        default: this.setState('lurk');
      }
    }
    /** The whip's hitbox: in front of the vine, covering a standing Wickling. */
    lashRect() {
      const f = this.facing, w = 2.7 * TILE;
      const x = f > 0 ? this.cx + 6 : this.cx - 6 - w;
      if (!this.ceil) return { x, y: this.ay - 70, w, h: 64 };
      return { x, y: this.ay + 50, w, h: Math.max(60, this.reachY - 52) };
    }
    /** Visible stalk rect (hurt/contact): grows with the emergence. */
    stalkRect() {
      const hgt = LURK_H * this.emerge;
      if (hgt < 8) return null;
      return { x: this.x + 3, y: this.ceil ? this.y : this.y + this.h - hgt, w: this.w - 6, h: hgt };
    }
    hurtRect() { if (this.hidden || this.dying) return null; return this.stalkRect(); }
    contactRect() {
      if (this.dying || this.hidden || this.contactGrace) return null;
      const r = this.stalkRect();
      return r ? { x: r.x + 3, y: r.y + 3, w: r.w - 6, h: r.h - 6 } : null;
    }
    onHurt() { this.hurtT = 0.2; }
    onDeath() {
      this.lashP = 0; this.rear = 0;
      if (this.ceil) { this.meltStarted = false; this.corpseSpin *= 0.25; this.vy = 0; }
    }
    drawBounds() {
      if (this.ceil) return { x: this.x - 150, y: this.y - 20, w: this.w + 300, h: Math.max(this.h, this.reachY) + 60 };
      return { x: this.x - 150, y: this.y - 50, w: this.w + 300, h: this.h + 60 };
    }
    pose() {
      const f = this.facing, k = this.emerge, sw = Math.sin(this.sway) * (1 - this.rear) * (1 - this.lashP);
      const len = LURK_H * k;
      // rest: an S-curve standing up; rear: coiled away from the Wickling; lash: flung out toward it
      let mx = sw * 7, my = -len * 0.55, hx = sw * 5 + f * 4 * k, hy = -len * 0.95;
      if (this.rear > 0) {
        const r = ease(this.rear);
        mx = lerp(mx, -f * 12, r); my = lerp(my, -len * 0.5, r);
        hx = lerp(hx, -f * 24, r); hy = lerp(hy, -len * 0.86, r);
      }
      if (this.lashP > 0) {
        const q = ease(this.lashP);
        const tipY = this.ceil ? -(this.reachY - 34) : -32;
        const midY = this.ceil ? -this.reachY * 0.45 : -len * 0.78;
        mx = lerp(mx, f * 46, q); my = lerp(my, midY, q);
        hx = lerp(hx, f * 104, q); hy = lerp(hy, tipY, q);
      }
      if (this.tremble > 0) { hx += Math.sin(this.t * 90) * 1.5; }
      return { mx, my, hx, hy, len };
    }
    drawBody(ctx, t) {
      ctx.save();
      ctx.translate(this.ax, this.ay);
      if (this.ceil) ctx.scale(1, -1);
      drawLurker(ctx, this.facing, t, this.pose(), {
        emerge: this.emerge, hidden: this.hidden && this.emerge < 0.05, tele: this.telegraphing, jaw: Math.max(this.rear, this.lashP), hurt: this.hurtT,
        seed: this.seed, stir: this.is('stir') ? this.stateTime : -1, dead: !!this.dying, ceil: this.ceil,
      });
      ctx.restore();
    }
    drawCorpse(ctx, t) {
      ctx.save();
      ctx.translate(this.cx, this.ceil ? this.y + this.h * 0.5 : this.y + this.h);
      if (this.ceil) ctx.translate(0, this.h * 0.5);
      drawLurker(ctx, this.facing, t, { mx: 8, my: -LURK_H * 0.5, hx: this.facing * 10, hy: -LURK_H * 0.9, len: LURK_H }, { emerge: 1, jaw: 0.3, dead: true, seed: this.seed });
      ctx.restore();
    }
  }

  /** Lurker art in its local frame: root at (0,0), growing toward -y. p = pose {mx,my,hx,hy,len}. */
  function drawLurker(ctx, f, t, p, s) {
    const ch = CH();
    if (s.hidden) {
      // only a curled leaf tip and two thorns poke out of the soil
      const tr = s.stir >= 0 ? Math.sin(t * 70) * 2.2 : Math.sin(t * 1.3 + (s.seed || 0)) * 0.6;
      const up = s.stir >= 0 ? 3 + s.stir * 10 : 0;
      ctx.save();
      ctx.translate(tr, 0);
      drawLeaf(ctx, -2, 2, -0.35, 13 + up, 4.5, { fill: MB.leaf, curl: 3, lw: 1.4 });
      drawLeaf(ctx, 3, 2, 0.5, 9 + up * 0.6, 3.5, { fill: MB.leafDark, curl: -2, lw: 1.3 });
      thorn(ctx, -7, 1, -Math.PI * 0.62, 6 + up * 0.3, 1.6, MB.thorn);
      thorn(ctx, 7, 1, -Math.PI * 0.4, 5 + up * 0.3, 1.5, MB.thorn);
      ctx.restore();
      // soil mound
      ctx.fillStyle = 'rgba(30,36,22,0.85)';
      ctx.beginPath(); ctx.ellipse(0, 1, 13, 4, 0, Math.PI, TAU); ctx.fill();
      return;
    }
    const k = clamp(s.emerge, 0, 1);
    // base leaves splayed on the ground
    drawLeaf(ctx, -5, 0, -1.2, 22 * k + 6, 6.5, { curl: -3 });
    drawLeaf(ctx, 5, 0, 1.25, 24 * k + 6, 7, { curl: 3 });
    // stalk: a tapered quadratic through the mid point to the head, outlined, with thorns along it
    const N = 14;
    const pts = [];
    for (let i = 0; i <= N; i++) {
      const q = i / N;
      // quadratic through (0,0) -> control -> head where the control makes the curve pass near (mx,my)
      const cx = 2 * p.mx - (p.hx) * 0.5, cy = 2 * p.my - (p.hy) * 0.5;
      const x = (1 - q) * (1 - q) * 0 + 2 * (1 - q) * q * cx + q * q * p.hx;
      const y = (1 - q) * (1 - q) * 0 + 2 * (1 - q) * q * cy + q * q * p.hy;
      pts.push([x, y]);
    }
    const wAt = (q) => lerp(12, 6, q);
    ctx.lineCap = 'round'; ctx.lineJoin = 'round';
    for (let pass = 0; pass < 3; pass++) {
      for (let i = 0; i < N; i++) {
        const q = i / N;
        ctx.beginPath(); ctx.moveTo(pts[i][0], pts[i][1]); ctx.lineTo(pts[i + 1][0], pts[i + 1][1]);
        if (pass === 0) { ctx.strokeStyle = MB.outline; ctx.lineWidth = wAt(q) + 3.5; }
        else if (pass === 1) { ctx.strokeStyle = MB.vine; ctx.lineWidth = wAt(q); }
        else { ctx.strokeStyle = 'rgba(125,154,88,0.55)'; ctx.lineWidth = Math.max(1, wAt(q) * 0.22); }
        ctx.stroke();
      }
    }
    // thorns alternating sides along the stalk
    for (let i = 2; i < N - 1; i += 2) {
      const a = Math.atan2(pts[i + 1][1] - pts[i][1], pts[i + 1][0] - pts[i][0]);
      const side = (i / 2) % 2 ? 1 : -1;
      const n = a + side * Math.PI / 2 - side * 0.5;
      const w = wAt(i / N) * 0.5;
      thorn(ctx, pts[i][0] + Math.cos(a + side * Math.PI / 2) * w, pts[i][1] + Math.sin(a + side * Math.PI / 2) * w, n, 6.5, 1.8, MB.thorn);
    }
    // a couple of leaves on the stalk
    for (const i of [4, 9]) {
      const a = Math.atan2(pts[i + 1][1] - pts[i][1], pts[i + 1][0] - pts[i][0]);
      const side = i === 4 ? -1 : 1;
      drawLeaf(ctx, pts[i][0], pts[i][1], a + Math.PI / 2 + side * 1.1, 14, 4.5, { curl: side * 2, lw: 1.3 });
    }
    // the head: a thorny pod-jaw at the tip, oriented along the stalk
    const hx = p.hx, hy = p.hy;
    const a = Math.atan2(pts[N][1] - pts[N - 2][1], pts[N][0] - pts[N - 2][0]);
    ctx.save();
    ctx.translate(hx, hy);
    ctx.rotate(a + Math.PI / 2);   // local -y = forward along the stalk
    const jaw = clamp(s.jaw || 0, 0, 1) * (s.dead ? 0.3 : 1);
    const L = 22, Wd = 11;
    for (const side of [-1, 1]) {
      ctx.save();
      ctx.rotate(side * jaw * 0.45);
      const hp = new Path2D();
      hp.moveTo(0, 2);
      hp.bezierCurveTo(side * Wd * 1.3, -2, side * Wd * 1.1, -L * 0.75, side * 1.5, -L);
      hp.lineTo(0, -L * 0.2);
      hp.closePath();
      if (ch) ch.shape(ctx, hp, { fill: side < 0 ? '#4a6432' : MB.vine, box: [-Wd, -L, Wd, 2], light: -1, shade: 0.5, hi: 0.2, lw: 1.8, rim: MB.vineHi, rimWidth: 1.1 });
      else { ctx.fillStyle = MB.vine; ctx.fill(hp); }
      // teeth along the inner edge
      for (let i = 1; i <= 4; i++) {
        const q = i / 5;
        thorn(ctx, side * 1.5, -L * (0.2 + q * 0.7), side < 0 ? 0 : Math.PI, 3.2 + jaw * 2, 1.1, MB.waxHi);
      }
      // outer spines
      thorn(ctx, side * Wd * 1.05, -L * 0.45, side < 0 ? Math.PI * 1.1 : -Math.PI * 0.1, 6, 1.6, MB.thorn);
      ctx.restore();
    }
    // gold maw glow + three pinprick eyes
    if (!s.dead) {
      glow(ctx, 0, -L * 0.5, 10 + 14 * jaw, MB.gold, 0.25 + 0.45 * jaw);
      ctx.fillStyle = s.tele ? MB.goldHot : MB.gold;
      for (const [ex, ey] of [[-5, -6], [5, -6], [0, -3]]) { ctx.beginPath(); ctx.arc(ex * (1 + jaw * 0.4), ey, 1.25, 0, TAU); ctx.fill(); }
    }
    ctx.restore();
    void f;
  }

  G.registerEnemy('vine_lurker', VineLurker);

  // =====================================================================================================
  // Event scripts — set pieces of the region's rooms (drawn from cached canvases)
  // =====================================================================================================
  function sprite(key, w, h, fn) {
    const H = G.Interact;
    // G.Interact.sprite draws with (ctx, meta) and returns {canvas, ...} (null if painting failed)
    if (H && H.sprite) { const sp = H.sprite(key, w, h, 0, 0, (c) => fn(c, w, h)); return sp ? sp.canvas : null; }
    const c = G.U.makeCanvas(w, h);
    fn(c.ctx, w, h);
    return c.canvas;
  }

  // mb_ravine — a deadly chasm reads as a void: a vertical gradient (z < -10, before the terrain) from clear at row r0 to
  // near-black at row r1 across cols c0..c1, and solid below it down to the thorn bed. Props: c0 c1 r0 r1, alpha (0.9).
  G.Events.mb_ravine = G.Events.mb_ravine || {
    init(e) {
      const p = e.props;
      e.data.r = { x: p.c0 * TILE, y: p.r0 * TILE, w: (p.c1 - p.c0 + 1) * TILE, h: (p.r1 - p.r0 + 1) * TILE };
      e.data.a = p.alpha != null ? +p.alpha : 0.9;
    },
    draw(e, ctx) {
      const r = e.data.r, a = e.data.a;
      if (G.camera && G.camera.visible && !G.camera.visible(r.x, r.y, r.w, r.h + TILE * 6, 8)) return;
      if (!e.data.g) {
        const g = ctx.createLinearGradient(0, r.y, 0, r.y + r.h);
        g.addColorStop(0, 'rgba(3,6,3,0)');
        g.addColorStop(0.5, 'rgba(3,6,3,' + (a * 0.6).toFixed(3) + ')');
        g.addColorStop(1, 'rgba(3,6,3,' + a + ')');
        e.data.g = g;
      }
      ctx.fillStyle = e.data.g;
      ctx.fillRect(r.x, r.y, r.w, r.h);
      ctx.fillStyle = 'rgba(3,6,3,' + a + ')';
      ctx.fillRect(r.x, r.y + r.h, r.w, TILE * 6);
    },
  };

  // mb_meltbloom — THE MELTBLOOM: a cathedral-tall wax flower behind the Atrium's leaf platforms. Props (tiles):
  // stem column cx (centre col), base row r1 (ground), cup row r0 (rim), cup half-width cw (tiles), stem width sw (tiles).
  // Drawn before the terrain (z < -10): the stem, leaf bracts, and huge cream petals opening above the cup, with a gold
  // glow in the cup ("its cup glows like a lamp").
  function paintMeltbloom(ctx, W, H, o) {
    const cx = W / 2, base = H, rim = o.rimY, sw = o.sw;
    const ch = CH();
    // stem: two slightly curving fluted walls of pale-green wax
    const stem = new Path2D();
    stem.moveTo(cx - sw * 0.62, base);
    stem.bezierCurveTo(cx - sw * 0.5, base - (base - rim) * 0.35, cx - sw * 0.62, rim + (base - rim) * 0.3, cx - sw * 0.42, rim + 60);
    stem.lineTo(cx + sw * 0.42, rim + 60);
    stem.bezierCurveTo(cx + sw * 0.6, rim + (base - rim) * 0.3, cx + sw * 0.48, base - (base - rim) * 0.35, cx + sw * 0.62, base);
    stem.closePath();
    const sg = ctx.createLinearGradient(cx - sw * 0.6, 0, cx + sw * 0.6, 0);
    sg.addColorStop(0, '#2c3a22'); sg.addColorStop(0.3, '#55683e'); sg.addColorStop(0.55, '#6a7e4c'); sg.addColorStop(1, '#1c2616');
    ctx.fillStyle = sg; ctx.fill(stem);
    ctx.save(); ctx.clip(stem);
    ctx.strokeStyle = 'rgba(200,214,160,0.16)'; ctx.lineWidth = 3;
    for (let k = -3; k <= 3; k++) { ctx.beginPath(); ctx.moveTo(cx + k * sw * 0.13, base); ctx.bezierCurveTo(cx + k * sw * 0.11, base * 0.6, cx + k * sw * 0.14, rim + 200, cx + k * sw * 0.09, rim); ctx.stroke(); }
    ctx.fillStyle = 'rgba(236,227,194,0.12)';
    for (let i = 0; i < 26; i++) { ctx.beginPath(); ctx.ellipse(cx + (h01(i, 2) - 0.5) * sw * 0.9, rim + 80 + h01(i, 5) * (base - rim - 100), 2.5, 9 + h01(i, 8) * 16, 0, 0, TAU); ctx.fill(); }
    ctx.restore();
    ctx.strokeStyle = 'rgba(10,14,8,0.8)'; ctx.lineWidth = 4; ctx.stroke(stem);
    // the cup: a broad calyx bowl just under the rim
    const cw = o.cw;
    const cup = new Path2D();
    cup.moveTo(cx - cw, rim + 8);
    cup.bezierCurveTo(cx - cw * 0.8, rim + 120, cx - sw * 0.6, rim + 130, cx - sw * 0.42, rim + 150);
    cup.lineTo(cx + sw * 0.42, rim + 150);
    cup.bezierCurveTo(cx + sw * 0.6, rim + 130, cx + cw * 0.8, rim + 120, cx + cw, rim + 8);
    cup.quadraticCurveTo(cx, rim - 46, cx - cw, rim + 8);              // the bowl's far lip: a soft arc, not a ruler line
    cup.closePath();
    const cg = ctx.createLinearGradient(0, rim, 0, rim + 150);
    cg.addColorStop(0, '#b8ae86'); cg.addColorStop(0.4, '#7e7a56'); cg.addColorStop(1, '#3e4a2c');
    ctx.fillStyle = cg; ctx.fill(cup);
    ctx.strokeStyle = 'rgba(10,14,8,0.8)'; ctx.lineWidth = 4; ctx.stroke(cup);
    // calyx sepals curling down from the cup
    for (const side of [-1, 1]) {
      for (let i = 0; i < 3; i++) {
        const sx = cx + side * (cw * (0.35 + i * 0.25)), sy = rim + 50 + i * 18;
        const sp = new Path2D();
        sp.moveTo(sx, sy);
        sp.bezierCurveTo(sx + side * 30, sy + 30, sx + side * 50, sy + 90, sx + side * (30 + i * 10), sy + 150 + i * 30);
        sp.bezierCurveTo(sx + side * 20, sy + 90, sx + side * 4, sy + 40, sx - side * 14, sy + 6);
        sp.closePath();
        if (ch) ch.shape(ctx, sp, { fill: i === 1 ? '#4c6236' : '#3e5230', box: [sx - 60, sy, sx + 60, sy + 200], light: -1, shade: 0.5, hi: 0.15, lw: 3 });
      }
    }
    // giant petals rising above the cup (behind the play space; dim and hazy, never ledge-like)
    const petals = [[-1.05, 0.95], [-0.62, 1.08], [-0.2, 1.15], [0.22, 1.12], [0.64, 1.05], [1.08, 0.92]];
    for (let i = 0; i < petals.length; i++) {
      const [ang, ln] = petals[i];
      const L = o.petalL * ln, Wp = cw * 0.42;
      ctx.save();
      ctx.translate(cx + ang * cw * 0.55, rim + 20);
      ctx.rotate(ang * 0.55);
      const pp = new Path2D();
      pp.moveTo(-Wp * 0.3, 0);
      pp.bezierCurveTo(-Wp * 1.05, -L * 0.3, -Wp * 0.9, -L * 0.82, Math.sin(ang) * 30, -L);
      pp.bezierCurveTo(Wp * 0.9, -L * 0.82, Wp * 1.05, -L * 0.3, Wp * 0.3, 0);
      pp.closePath();
      const pg = ctx.createLinearGradient(0, 0, 0, -L);
      pg.addColorStop(0, '#d8cfa8'); pg.addColorStop(0.5, '#bdb48c'); pg.addColorStop(1, '#8e8a68');
      ctx.globalAlpha = 0.78;
      ctx.fillStyle = pg; ctx.fill(pp);
      ctx.globalAlpha = 1;
      ctx.strokeStyle = 'rgba(30,34,22,0.55)'; ctx.lineWidth = 3; ctx.stroke(pp);
      ctx.save(); ctx.clip(pp);
      ctx.strokeStyle = 'rgba(255,248,220,0.18)'; ctx.lineWidth = 2;
      for (let k = -2; k <= 2; k++) { ctx.beginPath(); ctx.moveTo(k * 6, 0); ctx.quadraticCurveTo(k * Wp * 0.3, -L * 0.5, k * 4, -L * 0.95); ctx.stroke(); }
      // wax drips hanging off the petal edge
      ctx.fillStyle = 'rgba(255,250,228,0.25)';
      for (let k = 0; k < 4; k++) { ctx.beginPath(); ctx.ellipse((h01(k + i * 4, 3) - 0.5) * Wp, -L * (0.2 + h01(k + i * 4, 6) * 0.6), 3, 12, 0, 0, TAU); ctx.fill(); }
      ctx.restore();
      ctx.restore();
    }
    void H;
  }
  G.Events.mb_meltbloom = G.Events.mb_meltbloom || {
    init(e) {
      const p = e.props;
      const sw = (p.sw || 8) * TILE, cw = (p.cw || 16) * TILE;
      const rimY = (p.r0 || 15) * TILE, baseY = ((p.r1 || 51) + 1) * TILE;
      const petalL = (p.petal || 11) * TILE;
      const W = cw * 2 + 260, top = rimY - petalL - 40;
      e.data.box = { x: (p.cx + 0.5) * TILE - W / 2, y: top, w: W, h: baseY - top };
      e.data.o = { rimY: rimY - top, sw, cw, petalL };
      e.data.cup = { x: (p.cx + 0.5) * TILE, y: rimY + 30 };
      e.data.k = 'mb_meltbloom:' + [p.cx, p.r0, p.r1, p.cw, p.sw, p.petal].join(',');
    },
    update(e) {
      if (!G.lighting) return;
      const c = e.data.cup, t = (G.game && G.game.time) || 0;
      G.lighting.add({ x: c.x, y: c.y - 30, r: 9 * TILE, color: '#ffd880', intensity: 0.55, flicker: false });
      G.lighting.add({ x: c.x, y: c.y + 6 * TILE, r: 7 * TILE, color: '#ffe0a0', intensity: 0.3 + 0.03 * Math.sin(t), flicker: false });
    },
    draw(e, ctx, t) {
      const b = e.data.box;
      if (G.camera && G.camera.visible && !G.camera.visible(b.x, b.y, b.w, b.h, 40)) return;
      const img = sprite(e.data.k, Math.ceil(b.w), Math.ceil(b.h), (c, w, h) => paintMeltbloom(c, w, h, e.data.o));
      if (img) ctx.drawImage(img, b.x, b.y);
      // the cup's lamp-glow, breathing slowly
      const c = e.data.cup;
      const k = 0.85 + 0.15 * Math.sin((t || 0) * 0.9);
      glow(ctx, c.x, c.y - 40, 7 * TILE, '#ffd070', 0.38 * k);
      glow(ctx, c.x, c.y - 20, 3 * TILE, '#fff0b0', 0.4 * k);
    },
  };

  // mb_glassroof — the Atrium's glass roof: leaded panes of greenish glass over the solid roof rows, lit from above.
  // Props (tiles): c0 c1 (cols), r0 r1 (rows, inclusive). Drawn after the terrain (z -5).
  function paintGlassRoof(ctx, W, H) {
    const pane = 80;
    const g = ctx.createLinearGradient(0, 0, 0, H);
    g.addColorStop(0, 'rgba(210,226,170,0.55)'); g.addColorStop(1, 'rgba(120,140,96,0.42)');
    ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
    // diagonal sheen bands
    ctx.fillStyle = 'rgba(255,252,230,0.10)';
    for (let x = -H; x < W; x += 260) { ctx.beginPath(); ctx.moveTo(x, H); ctx.lineTo(x + 70, H); ctx.lineTo(x + 70 + H, 0); ctx.lineTo(x + H, 0); ctx.closePath(); ctx.fill(); }
    // iron lead lines
    ctx.strokeStyle = '#1a2014'; ctx.lineWidth = 5;
    for (let x = 0; x <= W; x += pane) { ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, H); ctx.stroke(); }
    ctx.lineWidth = 3;
    for (let y = 0; y <= H; y += 40) { ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(W, y); ctx.stroke(); }
    ctx.strokeStyle = 'rgba(255,240,190,0.25)'; ctx.lineWidth = 1;
    for (let x = 2; x <= W; x += pane) { ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, H); ctx.stroke(); }
    // a heavy iron rib along the bottom edge
    ctx.fillStyle = '#20281a'; ctx.fillRect(0, H - 10, W, 10);
    ctx.fillStyle = 'rgba(240,234,200,0.35)'; ctx.fillRect(0, H - 10, W, 2);
  }
  G.Events.mb_glassroof = G.Events.mb_glassroof || {
    init(e) {
      const p = e.props;
      e.data.box = { x: p.c0 * TILE, y: p.r0 * TILE, w: (p.c1 - p.c0 + 1) * TILE, h: (p.r1 - p.r0 + 1) * TILE };
      e.data.k = 'mb_glassroof:' + e.data.box.w + 'x' + e.data.box.h;
    },
    draw(e, ctx, t) {
      const b = e.data.box;
      if (G.camera && G.camera.visible && !G.camera.visible(b.x, b.y, b.w, b.h, 20)) return;
      const img = sprite(e.data.k, b.w, b.h, paintGlassRoof);
      if (img) ctx.drawImage(img, b.x, b.y);
      void t;
    },
  };

  // mb_grate — the shaft down to the Mothwood seen from above: iron bars at the bottom of the hole with violet
  // moth-light glimmering below, until the Mothwood lever opens the grate (props: c0, cols w, row r (bottom row),
  // opens condition). Drawn after the terrain.
  G.Events.mb_grate = G.Events.mb_grate || {
    init(e) {
      const p = e.props;
      e.data.box = { x: p.c0 * TILE, y: p.r * TILE, w: (p.w || 4) * TILE, h: TILE };
    },
    update(e) {
      const b = e.data.box;
      if (G.lighting) G.lighting.add({ x: b.x + b.w / 2, y: b.y + b.h, r: 3.5 * TILE, color: '#b890ff', intensity: 0.45, flicker: true });
    },
    draw(e, ctx, t) {
      const b = e.data.box;
      const open = e.props.opens && G.game && G.game.evalCondition ? G.game.evalCondition(e.props.opens) : false;
      const k = 0.75 + 0.25 * Math.sin((t || 0) * 1.7);
      glow(ctx, b.x + b.w / 2, b.y + b.h + 6, b.w * 0.9, '#9a70e8', 0.5 * k);
      glow(ctx, b.x + b.w * 0.3, b.y + b.h, 26, '#d8c0ff', 0.35 * k);
      if (open) return;
      // the real grate (mw_03's mw_gate1, drawn exactly like the gate entity) seen from above at the shaft's bottom
      if (G.Interact && G.Interact.drawGrate) { G.Interact.drawGrate(ctx, e.props.region || 'mothwood', b.x, b.y, b.w, b.h); return; }
      // fallback: plain bars (a horizontal grate seen from above, just below the room's edge)
      const y = b.y + b.h - 8;
      ctx.fillStyle = '#16121c'; ctx.fillRect(b.x - 6, y - 3, b.w + 12, 9);
      ctx.fillStyle = '#4a4058'; ctx.fillRect(b.x - 6, y - 3, b.w + 12, 2);
      for (let x = b.x + 6; x < b.x + b.w - 2; x += 14) {
        ctx.fillStyle = '#100c16'; ctx.fillRect(x, y - 26, 6, 30);
        ctx.fillStyle = '#5c5070'; ctx.fillRect(x, y - 26, 2, 30);
      }
      ctx.fillStyle = '#16121c'; ctx.fillRect(b.x - 6, y - 30, b.w + 12, 7);
      ctx.fillStyle = '#4a4058'; ctx.fillRect(b.x - 6, y - 30, b.w + 12, 2);
    },
  };

  // mb_pod — a hanging seed pod painted over GLAZED pod tiles (mb_03's wings reward): a ribbed waxy husk, split at
  // the top where the reward sits, hanging on vine stalks from the ceiling. Props (tiles): c0 c1 r0 r1 (pod tile
  // rect, inclusive; the walkable top is row r0), top (row of the ceiling's underside the stalks hang from). z -5.
  function paintPod(ctx, W, H, o) {
    const pw = o.pw, ph = o.ph, x0 = (W - pw) / 2, y0 = H - ph - 30;
    // stalks: three twisted vines from the ceiling to the husk's shoulders
    for (const [sx, ex, wd] of [[0.18, 0.08, 5], [0.55, 0.5, 6.5], [0.86, 0.94, 5]]) {
      const ax = x0 + pw * sx, bx = x0 + pw * ex;
      ctx.strokeStyle = MB.vineDark; ctx.lineWidth = wd + 2; ctx.lineCap = 'round';
      ctx.beginPath(); ctx.moveTo(ax, 0); ctx.bezierCurveTo(ax - 14, y0 * 0.35, bx + 16, y0 * 0.7, bx, y0 + 6); ctx.stroke();
      ctx.strokeStyle = MB.vine; ctx.lineWidth = wd;
      ctx.beginPath(); ctx.moveTo(ax, 0); ctx.bezierCurveTo(ax - 14, y0 * 0.35, bx + 16, y0 * 0.7, bx, y0 + 6); ctx.stroke();
      ctx.strokeStyle = MB.vineHi; ctx.lineWidth = 1.2;
      ctx.beginPath(); ctx.moveTo(ax - 1.5, 0); ctx.bezierCurveTo(ax - 15.5, y0 * 0.35, bx + 14.5, y0 * 0.7, bx - 1.5, y0 + 6); ctx.stroke();
      for (let k = 1; k < 5; k++) {                       // little leaves along the stalk
        const t = k / 5, lx = (1 - t) * (1 - t) * (1 - t) * ax + 3 * (1 - t) * (1 - t) * t * (ax - 14) + 3 * (1 - t) * t * t * (bx + 16) + t * t * t * bx;
        const ly = 3 * (1 - t) * (1 - t) * t * y0 * 0.35 + 3 * (1 - t) * t * t * y0 * 0.7 + t * t * t * (y0 + 6);
        const sd = k % 2 ? 1 : -1;
        ctx.fillStyle = k % 2 ? MB.leaf : MB.leafDark;
        ctx.beginPath(); ctx.ellipse(lx + sd * 7, ly, 8, 3.2, sd * 0.6, 0, TAU); ctx.fill();
      }
    }
    // the husk: flat-ish top (the walkable lip), belly tapering to a drip point
    const husk = new Path2D();
    husk.moveTo(x0 - 6, y0 + 4);
    husk.quadraticCurveTo(x0 + pw / 2, y0 - 6, x0 + pw + 6, y0 + 4);
    // (the belly stays wide enough to hide the stepped glazed tiles under it: QA fix, their corners poked out)
    husk.bezierCurveTo(x0 + pw + 12, y0 + ph * 0.6, x0 + pw * 0.86, y0 + ph * 1.02, x0 + pw / 2, y0 + ph + 22);
    husk.bezierCurveTo(x0 + pw * 0.14, y0 + ph * 1.02, x0 - 12, y0 + ph * 0.6, x0 - 6, y0 + 4);
    husk.closePath();
    const g = ctx.createLinearGradient(x0, y0, x0 + pw, y0 + ph);
    g.addColorStop(0, MB.podHi); g.addColorStop(0.45, MB.pod); g.addColorStop(1, MB.podDark);
    ctx.strokeStyle = MB.outline; ctx.lineWidth = 4; ctx.stroke(husk);
    ctx.fillStyle = g; ctx.fill(husk);
    ctx.save(); ctx.clip(husk);
    for (let i = 1; i < 7; i++) {                          // ribs converging on the drip point
      const rx = x0 + pw * i / 7;
      ctx.strokeStyle = i % 2 ? 'rgba(40,32,14,0.45)' : 'rgba(236,227,194,0.22)'; ctx.lineWidth = i % 2 ? 2.2 : 1.4;
      ctx.beginPath(); ctx.moveTo(rx, y0); ctx.quadraticCurveTo(rx + (rx - (x0 + pw / 2)) * 0.25, y0 + ph * 0.6, x0 + pw / 2, y0 + ph + 12); ctx.stroke();
    }
    ctx.fillStyle = 'rgba(255,251,234,0.18)';
    ctx.beginPath(); ctx.ellipse(x0 + pw * 0.3, y0 + ph * 0.3, pw * 0.16, ph * 0.22, -0.5, 0, TAU); ctx.fill();
    ctx.restore();
    // the split lip with a gold glow inside
    ctx.fillStyle = MB.podDark;
    ctx.beginPath(); ctx.ellipse(x0 + pw / 2, y0 + 3, pw * 0.38, 6, 0, 0, TAU); ctx.fill();
    ctx.fillStyle = 'rgba(255,208,112,0.55)';
    ctx.beginPath(); ctx.ellipse(x0 + pw / 2, y0 + 2, pw * 0.3, 3, 0, 0, TAU); ctx.fill();
    ctx.fillStyle = MB.waxHi; ctx.fillRect(x0 + 4, y0 - 1, pw - 8, 1.6);
    // a wax drip hanging from the point
    ctx.fillStyle = MB.wax;
    ctx.beginPath(); ctx.ellipse(x0 + pw / 2, y0 + ph + 16, 3.2, 5, 0, 0, TAU); ctx.fill();
  }
  G.Events.mb_pod = G.Events.mb_pod || {
    init(e) {
      const p = e.props;
      const top = (p.top != null ? p.top : 0) * TILE;
      const pw = (p.c1 - p.c0 + 1) * TILE, ph = (p.r1 - p.r0 + 1) * TILE;
      const W = pw + 60, yb = (p.r1 + 1) * TILE + 30;
      e.data.box = { x: p.c0 * TILE - 30, y: top, w: W, h: yb - top };
      e.data.o = { pw, ph };
      e.data.k = 'mb_pod:' + [p.c0, p.c1, p.r0, p.r1, p.top].join(',');
      e.data.gl = { x: (p.c0 + p.c1 + 1) / 2 * TILE, y: p.r0 * TILE };
    },
    draw(e, ctx, t) {
      const b = e.data.box;
      if (G.camera && G.camera.visible && !G.camera.visible(b.x, b.y, b.w, b.h, 20)) return;
      const img = sprite(e.data.k, Math.ceil(b.w), Math.ceil(b.h), (c, w, h) => paintPod(c, w, h, e.data.o));
      if (img) ctx.drawImage(img, b.x, b.y);
      glow(ctx, e.data.gl.x, e.data.gl.y, 46, MB.gold, 0.18 + 0.05 * Math.sin((t || 0) * 1.3));
    },
  };

  // mb_petals — the Petal Bridge's deck: enormous fallen wax petals lying over the deck tiles (their upper edge is
  // the walkable surface; nothing is drawn above it except a soft rim). Props: spans [[c0, c1], ...] (cols,
  // inclusive), row (the deck's top row), droop: [cols] span ends that hang over a drop (petal tips curl down).
  function paintPetals(ctx, W, H, o) {
    const rnd = (i) => { const x = Math.sin(i * 127.1 + o.seed * 311.7) * 43758.5453; return x - Math.floor(x); };
    const top = 8;                                         // the surface line inside the sprite
    let x = -10, i = 0;
    while (x < W - 30) {
      const L = 110 + rnd(i) * 70, th = 20 + rnd(i + 7) * 10, tilt = (rnd(i + 3) - 0.5) * 0.05;
      const x0 = Math.max(-6, x), x1 = Math.min(W + 6, x + L);
      const pth = new Path2D();
      pth.moveTo(x0, top + 2);
      pth.bezierCurveTo(x0 + (x1 - x0) * 0.3, top - 3, x0 + (x1 - x0) * 0.7, top - 3, x1, top + 2 + tilt * 40);
      pth.bezierCurveTo(x1 - 8, top + th * 0.8, x0 + (x1 - x0) * 0.55, top + th, x0 + (x1 - x0) * 0.4, top + th * 0.95);
      pth.bezierCurveTo(x0 + 10, top + th * 0.85, x0 - 4, top + th * 0.4, x0, top + 2);
      const g = ctx.createLinearGradient(0, top - 3, 0, top + th);
      g.addColorStop(0, MB.waxHi); g.addColorStop(0.25, MB.wax); g.addColorStop(1, MB.waxDeep);
      ctx.fillStyle = 'rgba(10,12,8,0.5)'; ctx.save(); ctx.translate(0, 3); ctx.fill(pth); ctx.restore();
      ctx.fillStyle = g; ctx.fill(pth);
      ctx.strokeStyle = 'rgba(124,114,84,0.55)'; ctx.lineWidth = 1;
      for (let k = 1; k < 4; k++) {                        // veins
        ctx.beginPath(); ctx.moveTo(x0 + 8, top + 3 + k * 2);
        ctx.quadraticCurveTo(x0 + (x1 - x0) * 0.5, top + 3 + k * th * 0.2, x1 - 10, top + 3 + k * 1.5); ctx.stroke();
      }
      ctx.fillStyle = 'rgba(255,208,112,0.35)'; ctx.fillRect(x0 + 6, top - 1, x1 - x0 - 12, 1.4);
      x += L * (0.62 + rnd(i + 11) * 0.2); i++;
    }
    // drooping tips over the drops
    for (const side of o.droop) {
      const ex = side < 0 ? 6 : W - 6, d = side < 0 ? -1 : 1;
      const p = new Path2D();
      p.moveTo(ex - d * 34, top);
      p.bezierCurveTo(ex + d * 8, top - 4, ex + d * 22, top + 20, ex + d * 12, top + 62);
      p.bezierCurveTo(ex + d * 6, top + 44, ex - d * 6, top + 22, ex - d * 30, top + 18);
      p.closePath();
      const g = ctx.createLinearGradient(0, top, 0, top + 62);
      g.addColorStop(0, MB.wax); g.addColorStop(1, MB.waxDeep);
      ctx.fillStyle = g; ctx.fill(p);
      ctx.fillStyle = MB.wax; ctx.beginPath(); ctx.ellipse(ex + d * 12, top + 68, 2.6, 4.5, 0, 0, TAU); ctx.fill();
    }
  }
  G.Events.mb_petals = G.Events.mb_petals || {
    init(e) {
      const p = e.props;
      e.data.items = (p.spans || []).map(([c0, c1], k) => ({
        x: c0 * TILE - 8, y: p.row * TILE - 8, w: (c1 - c0 + 1) * TILE + 16, h: 110,
        o: { seed: c0 + k * 7, droop: (p.droop || []).filter((d) => d === c0 || d === c1).map((d) => (d === c0 ? -1 : 1)) },
        k: 'mb_petals:' + [c0, c1, p.row, (p.droop || []).join('.')].join(','),
      }));
    },
    draw(e, ctx) {
      for (const it of e.data.items) {
        if (G.camera && G.camera.visible && !G.camera.visible(it.x, it.y, it.w, it.h, 20)) continue;
        const img = sprite(it.k, Math.ceil(it.w), it.h, (c, w, h) => paintPetals(c, w, h, it.o));
        if (img) ctx.drawImage(img, it.x, it.y);
      }
    },
  };

  // mb_leaves — the Meltbloom's broad leaves painted over its leaf platforms (one-way wax tiles): each leaf grows
  // from the stem side (base) to a drooping tip, its upper edge on the platform's top. Props: leaves [[c0, c1, row,
  // base], ...] where base = -1 (stem on the left / west end) or 1 (stem on the east end). z -5.
  function paintLeaf(ctx, W, H, o) {
    const top = 10, L = W - 16, d = o.base;                  // d = 1: base on the right
    const bx = d > 0 ? W - 6 : 6, tx = d > 0 ? 10 : W - 10;
    const p = new Path2D();
    p.moveTo(bx, top + 2);
    p.bezierCurveTo(bx - d * L * 0.35, top - 4, tx + d * L * 0.25, top - 4, tx, top + 6);       // upper edge (walkable)
    p.bezierCurveTo(tx + d * L * 0.25, top + 26, bx - d * L * 0.3, top + 40, bx, top + 20);      // belly
    p.closePath();
    const g = ctx.createLinearGradient(0, top - 4, 0, top + 30);
    g.addColorStop(0, MB.leafLight); g.addColorStop(0.35, MB.leaf); g.addColorStop(1, MB.leafDark);
    ctx.fillStyle = 'rgba(8,10,6,0.45)'; ctx.save(); ctx.translate(0, 4); ctx.fill(p); ctx.restore();
    ctx.fillStyle = g; ctx.fill(p);
    ctx.strokeStyle = MB.outline; ctx.lineWidth = 1.5; ctx.stroke(p);
    // midrib + veins
    ctx.strokeStyle = MB.vein; ctx.lineWidth = 2;
    ctx.beginPath(); ctx.moveTo(bx, top + 8); ctx.quadraticCurveTo((bx + tx) / 2, top + 10, tx + d * 6, top + 6); ctx.stroke();
    ctx.lineWidth = 1; ctx.strokeStyle = 'rgba(196,212,154,0.6)';
    for (let i = 1; i < 7; i++) {
      const x = bx - d * L * i / 7.5;
      ctx.beginPath(); ctx.moveTo(x, top + 9); ctx.lineTo(x - d * 14, top + 1.5); ctx.moveTo(x, top + 9); ctx.lineTo(x - d * 12, top + 19 - i); ctx.stroke();
    }
    ctx.fillStyle = 'rgba(236,227,194,0.55)'; ctx.fillRect(Math.min(bx, tx) + 10, top - 1, L - 24, 1.5);   // wax sheen
    // the leaf's stalk joining the stem
    ctx.fillStyle = MB.stem; ctx.beginPath(); ctx.ellipse(bx, top + 9, 7, 9, 0, 0, TAU); ctx.fill();
  }
  G.Events.mb_leaves = G.Events.mb_leaves || {
    init(e) {
      e.data.items = (e.props.leaves || []).map(([c0, c1, row, base]) => ({
        x: c0 * TILE - 8, y: row * TILE - 10, w: (c1 - c0 + 1) * TILE + 16, h: 64,
        o: { base: base || 1 }, k: 'mb_leaf:' + [c0, c1, base].join(','),
      }));
    },
    draw(e, ctx) {
      for (const it of e.data.items) {
        if (G.camera && G.camera.visible && !G.camera.visible(it.x, it.y, it.w, it.h, 20)) continue;
        const img = sprite(it.k, Math.ceil(it.w), it.h, (c, w, h) => paintLeaf(c, w, h, it.o));
        if (img) ctx.drawImage(img, it.x, it.y);
      }
    },
  };

  // mb_thorns — makes the region's thorn hazards (^) read as deadly: a cached bramble of black hooked thorns with
  // pale bone tips over every ^ run of the room (pointing away from the solid side; tips rise ~0.45 tile past the
  // hazard tile, never further), plus optional climbing brambles on walls (ravines) so a chasm reads as thorn-choked
  // from above. Props: auto (default true: scan the room's ^ runs), climb [[col, r0, r1, side]] (col = the air
  // column against a wall, side -1 = wall on the west, 1 = wall on the east; the bramble fades out toward r0).
  // Drawn after the terrain. QA (qa-region-meltbloom) addition.
  const BR = { dark: '#0e0d08', stem: '#221d12', stem2: '#30291a', rim: '#6d6446', tip: '#efe2b4', tipHot: '#fff6d6' };
  const rnd01 = (i, s) => { const x = Math.sin(i * 127.1 + s * 311.7) * 43758.5453; return x - Math.floor(x); };
  function thorn(ctx, x, y, ang, len, w, seed) {
    const ca = Math.cos(ang), sa = Math.sin(ang), nx = -sa, ny = ca;
    const tx = x + ca * len, ty = y + sa * len, hook = (rnd01(seed, 5) - 0.5) * len * 0.35;
    ctx.fillStyle = BR.dark;
    ctx.beginPath();
    ctx.moveTo(x + nx * w, y + ny * w);
    ctx.quadraticCurveTo(x + ca * len * 0.55 + nx * (w * 0.3 + hook), y + sa * len * 0.55 + ny * (w * 0.3 + hook), tx, ty);
    ctx.quadraticCurveTo(x + ca * len * 0.5 - nx * w * 0.2, y + sa * len * 0.5 - ny * w * 0.2, x - nx * w, y - ny * w);
    ctx.closePath(); ctx.fill();
    // a pale bone edge on the lit side and a bright point: the thorns catch the garden's light
    ctx.strokeStyle = BR.tip; ctx.lineWidth = 1.1; ctx.globalAlpha = 0.85;
    ctx.beginPath(); ctx.moveTo(x + ca * len * 0.45 + nx * w * 0.45, y + sa * len * 0.45 + ny * w * 0.45); ctx.lineTo(tx, ty); ctx.stroke();
    ctx.globalAlpha = 1; ctx.fillStyle = BR.tipHot;
    ctx.beginPath(); ctx.arc(tx, ty, 1.2, 0, TAU); ctx.fill();
  }
  // a horizontal bramble: base line at y = H (the hazard tile's bottom), solid side below; tips toward y = 0
  function paintBramble(ctx, W, H, o) {
    const pad = o.pad, L = W - 2 * pad, s = o.seed, top = H - TILE;           // top = the hazard tile's top edge
    ctx.lineCap = 'round'; ctx.lineJoin = 'round';
    // dark tangle filling the tile (no gap shows between the stems)
    ctx.fillStyle = BR.dark;
    ctx.beginPath(); ctx.moveTo(pad - 4, H);
    for (let x = pad - 4; x <= pad + L + 4; x += 6) {
      const end = Math.max(0, 1 - Math.min(x - pad + 4, pad + L + 4 - x) / 22);   // rounded ends, no hard box corners
      ctx.lineTo(x, top + 12 + Math.sin(x * 0.11 + s) * 4 + rnd01(x, s) * 4 + end * end * 24);
    }
    ctx.lineTo(pad + L + 4, H); ctx.closePath(); ctx.fill();
    const stems = [];
    for (let k = 0; k < 3; k++) {
      const pts = [];
      for (let x = pad - 6; x <= pad + L + 6; x += 5) pts.push([x, top + 10 + k * 7 + Math.sin(x * (0.07 + k * 0.03) + s + k * 2) * (5 + k) + Math.sin(x * 0.21 + k) * 1.5]);
      stems.push(pts);
      ctx.strokeStyle = k === 0 ? BR.stem2 : BR.stem; ctx.lineWidth = 5 - k;
      ctx.beginPath(); pts.forEach(([x, y], i) => (i ? ctx.lineTo(x, y) : ctx.moveTo(x, y))); ctx.stroke();
      ctx.strokeStyle = BR.rim; ctx.lineWidth = 1; ctx.globalAlpha = 0.45;
      ctx.beginPath(); pts.forEach(([x, y], i) => (i ? ctx.lineTo(x, y - 2) : ctx.moveTo(x, y - 2))); ctx.stroke();
      ctx.globalAlpha = 1;
    }
    // small thorns all along the stems, then the tall crowning thorns (the silhouette that says "do not step here")
    let i = 0;
    for (const pts of stems) for (let j = 1; j < pts.length - 1; j += 2) {
      const [x, y] = pts[j], r = rnd01(++i, s);
      if (x < pad || x > pad + L) continue;
      thorn(ctx, x, y, -Math.PI / 2 + (r - 0.5) * 2.4, 7 + r * 7, 2.6, i + s);
    }
    const n = Math.max(2, Math.round(L / 13));
    for (let k = 0; k < n; k++) {
      const r = rnd01(k + 50, s), x = pad + ((k + 0.5) / n) * L + (r - 0.5) * 6;
      const len = 20 + rnd01(k + 80, s) * 12, ang = -Math.PI / 2 + (rnd01(k + 90, s) - 0.5) * 0.9;
      thorn(ctx, x, top + 16, ang, len, 3.6, k + 200 + s);
    }
  }
  // a vertical climbing bramble against a wall (side -1: wall on the left of the sprite, 1: on the right)
  function paintClimber(ctx, W, H, o) {
    const s = o.seed, wx = o.side < 0 ? 4 : W - 4, out = -o.side;          // out: direction into the air
    ctx.lineCap = 'round'; ctx.lineJoin = 'round';
    const stems = [];
    for (let k = 0; k < 3; k++) {
      const pts = [];
      for (let y = H + 4; y >= 0; y -= 5) pts.push([wx + out * (3 + k * 7 + Math.abs(Math.sin(y * (0.035 + k * 0.012) + s + k * 1.7)) * (16 - k * 4)), y]);
      stems.push(pts);
      ctx.strokeStyle = k === 1 ? BR.stem : BR.stem2; ctx.lineWidth = 6 - k * 1.5;
      ctx.beginPath(); pts.forEach(([x, y], i) => (i ? ctx.lineTo(x, y) : ctx.moveTo(x, y))); ctx.stroke();
      ctx.strokeStyle = BR.rim; ctx.lineWidth = 1; ctx.globalAlpha = 0.4;
      ctx.beginPath(); pts.forEach(([x, y], i) => (i ? ctx.lineTo(x, y) : ctx.moveTo(x, y))); ctx.stroke();
    }
    let i = 0;
    for (const pts of stems) for (let j = 1; j < pts.length - 1; j += 2) {
      const [x, y] = pts[j], r = rnd01(++i, s);
      const ang = (out > 0 ? 0 : Math.PI) + (r - 0.5) * 2.2;
      thorn(ctx, x, y, ang, 9 + r * 12, 3, i + s);
    }
    // fade out toward the top (the vine disappears up into the light; paint-time only)
    ctx.globalCompositeOperation = 'destination-in';
    const g = ctx.createLinearGradient(0, 0, 0, H);
    g.addColorStop(0, 'rgba(0,0,0,0)'); g.addColorStop(0.12, 'rgba(0,0,0,1)'); g.addColorStop(1, 'rgba(0,0,0,1)');
    ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
    ctx.globalCompositeOperation = 'source-over';
  }
  // a sagging thorny vine strung across a chasm (wall to wall), visual only
  function paintSpan(ctx, W, H, o) {
    const s = o.seed;
    ctx.lineCap = 'round';
    for (let k = 0; k < 2; k++) {
      const pts = [];
      for (let x = 0; x <= W; x += 5) { const t = x / W; pts.push([x, 10 + k * 5 + 4 * t * (1 - t) * (o.sag - 8 - k * 6) + Math.sin(x * 0.08 + s + k) * 2]); }
      ctx.strokeStyle = k ? BR.stem : BR.stem2; ctx.lineWidth = 4 - k * 1.5;
      ctx.beginPath(); pts.forEach(([x, y], i) => (i ? ctx.lineTo(x, y) : ctx.moveTo(x, y))); ctx.stroke();
      for (let j = 2; j < pts.length - 2; j += 2) {
        const [x, y] = pts[j], r = rnd01(j + k * 50, s);
        thorn(ctx, x, y, (r < 0.5 ? -1 : 1) * Math.PI / 2 + (r - 0.5) * 1.2, 6 + r * 8, 2.4, j + s);
      }
    }
  }
  G.Events.mb_thorns = G.Events.mb_thorns || {
    init(e) {
      const p = e.props, R = e.room, items = [], PAD = 14;
      if (p.auto !== false && R && R.tileAt) {
        for (let r = 0; r < R.rows; r++) {
          let c = 0;
          while (c < R.cols) {
            if (R.tileAt(c, r) !== G.T.SPIKES) { c++; continue; }
            const c0 = c; while (c < R.cols && R.tileAt(c, r) === G.T.SPIKES) c++;
            const c1 = c - 1;
            const below = R.tileAt(c0, r + 1), above = R.tileAt(c0, r - 1);
            const solid = (k) => k === G.T.SOLID || k === G.T.GLAZED;
            const down = solid(above) && !solid(below);
            const w = (c1 - c0 + 1) * TILE + 2 * PAD, h = Math.round(TILE * 1.6);
            items.push({ x: c0 * TILE - PAD, y: down ? r * TILE : (r + 1) * TILE - h, w, h, flip: down,
              k: 'mb_thorns:' + [w, h, c0 + r * 7].join(','), paint: (c, W, H) => paintBramble(c, W, H, { pad: PAD, seed: c0 * 3.1 + r }) });
          }
        }
      }
      for (const [col, r0, r1, side] of p.climb || []) {
        const w = TILE + 24, h = (r1 - r0 + 1) * TILE;
        items.push({ x: col * TILE - (side < 0 ? 4 : 20), y: r0 * TILE, w, h, flip: false,
          k: 'mb_climb:' + [w, h, side, col].join(','), paint: (c, W, H) => paintClimber(c, W, H, { side, seed: col * 1.7 + r0 }) });
      }
      for (const [c0, c1, row, sag] of p.span || []) {
        const w = (c1 - c0 + 1) * TILE, h = Math.round((sag || 1) * TILE + 30);
        items.push({ x: c0 * TILE, y: row * TILE - 10, w, h, flip: false,
          k: 'mb_span:' + [w, h, c0, row].join(','), paint: (c, W, H) => paintSpan(c, W, H, { sag: (sag || 1) * TILE, seed: c0 + row * 2.3 }) });
      }
      e.data.items = items;
    },
    draw(e, ctx) {
      for (const it of e.data.items) {
        if (G.camera && G.camera.visible && !G.camera.visible(it.x, it.y, it.w, it.h, 20)) continue;
        const img = sprite(it.k, it.w, it.h, it.paint);
        if (!img) continue;
        if (it.flip) { ctx.save(); ctx.translate(0, it.y * 2 + it.h); ctx.scale(1, -1); ctx.drawImage(img, it.x, it.y); ctx.restore(); }
        else ctx.drawImage(img, it.x, it.y);
      }
    },
  };

  // mb_hedges — the Thornwalk's black thorn hedges "taller than houses": dark bramble walls behind the corridor
  // (z < -10, before the terrain), rooted on the floor row, ragged thorny crowns catching moonlight on top.
  // Props: hedges [[c0, c1, topRow, floorRow]], alpha (0.9). QA (qa-region-meltbloom) addition.
  function paintHedge(ctx, W, H, o) {
    const s = o.seed, crown = 22;
    // silhouette = union of bushy lobes: a row along the crown, smaller ones stepping down both flanks, a trunk body
    const lobes = [];
    const n = Math.max(2, Math.round(W / 70));
    for (let k = 0; k < n; k++) {
      const r = 34 + rnd01(k, s) * 22, x = 40 + ((W - 80) * (k + 0.5)) / n + (rnd01(k + 3, s) - 0.5) * 20;
      lobes.push([x, crown + r + rnd01(k + 6, s) * 18, r]);
    }
    for (const side of [0, 1]) {
      for (let k = 0; k < 4; k++) {
        const r = 26 + rnd01(k + 20 + side * 9, s) * 14, y = crown + 60 + k * ((H - crown - 60) / 3.2);
        lobes.push([side ? W - r - 2 - k * 3 : r + 2 + k * 3, y, r]);
      }
    }
    const body = new Path2D();
    for (const [x, y, r] of lobes) { body.moveTo(x + r, y); body.arc(x, y, r, 0, TAU); }
    body.rect(28, crown + 50, W - 56, H - crown - 50);
    // rim (moonlight on the upper edges): the union in a pale tone, then the body 2 px lower over it
    ctx.fillStyle = 'rgba(170,190,206,0.38)'; ctx.fill(body);
    ctx.save(); ctx.translate(0, 2.5);
    const g = ctx.createLinearGradient(0, 0, 0, H);
    g.addColorStop(0, '#1d2617'); g.addColorStop(0.3, '#10160d'); g.addColorStop(1, '#080b06');
    ctx.fillStyle = g; ctx.fill(body);
    // inner tangle: arching dark branches with faint rims
    ctx.clip(body);
    ctx.lineCap = 'round';
    for (let k = 0; k < Math.round(W / 12); k++) {
      const x0 = rnd01(k, s) * W, y0 = H - rnd01(k + 3, s) * H * 0.2, x1 = x0 + (rnd01(k + 5, s) - 0.5) * 160, y1 = crown + rnd01(k + 7, s) * H * 0.7;
      ctx.strokeStyle = k % 3 ? 'rgba(46,58,34,0.5)' : 'rgba(84,98,64,0.32)'; ctx.lineWidth = 1.5 + rnd01(k + 9, s) * 3;
      ctx.beginPath(); ctx.moveTo(x0, y0); ctx.quadraticCurveTo((x0 + x1) / 2 + 30, (y0 + y1) / 2, x1, y1); ctx.stroke();
    }
    ctx.restore();
    // thorns bristling from the crown (top edge sampled from the lobes)
    const topAt = (x) => { let y = Infinity; for (const [cx, cy, r] of lobes) { const d = x - cx; if (Math.abs(d) < r) y = Math.min(y, cy - Math.sqrt(r * r - d * d)); } return y; };
    let i = 0;
    for (let x = 6; x < W - 6; x += 7) {
      const y = topAt(x), r = rnd01(++i + 40, s);
      if (!isFinite(y) || r < 0.3) continue;
      const ang = -Math.PI / 2 + (rnd01(i + 60, s) - 0.5) * 2.2, len = 5 + r * 9;
      ctx.fillStyle = '#121a0e';
      ctx.beginPath(); ctx.moveTo(x - 2.5, y + 3); ctx.lineTo(x + Math.cos(ang) * len, y + Math.sin(ang) * len); ctx.lineTo(x + 2.5, y + 3); ctx.closePath(); ctx.fill();
      ctx.fillStyle = 'rgba(214,220,200,0.6)';
      ctx.beginPath(); ctx.arc(x + Math.cos(ang) * len, y + Math.sin(ang) * len, 0.9, 0, TAU); ctx.fill();
    }
  }
  G.Events.mb_hedges = G.Events.mb_hedges || {
    init(e) {
      const p = e.props;
      e.data.a = p.alpha != null ? +p.alpha : 0.9;
      e.data.items = (p.hedges || []).map(([c0, c1, top, floor]) => {
        const x = c0 * TILE, y = top * TILE - 30, w = (c1 - c0 + 1) * TILE, h = (floor - top) * TILE + 30;
        return { x, y, w, h, k: 'mb_hedge:' + [w, h, c0].join(','), paint: (c, W, H) => paintHedge(c, W, H, { seed: c0 * 0.37 }) };
      });
    },
    draw(e, ctx) {
      for (const it of e.data.items) {
        if (G.camera && G.camera.visible && !G.camera.visible(it.x, it.y, it.w, it.h, 20)) continue;
        const img = sprite(it.k, it.w, it.h, it.paint);
        if (!img) continue;
        ctx.globalAlpha = e.data.a; ctx.drawImage(img, it.x, it.y); ctx.globalAlpha = 1;
      }
    },
  };

  // mb_brick — the Guttered Ways' old brick showing through at the gardens' threshold (mb_01's east end): a ruined
  // brick back wall (z < -10, before the terrain) that crumbles away westward into wax soil, with wax runs and moss
  // over it. Props: c0 c1 r0 r1 (tiles; the wall crumbles from the c0 side). QA (qa-region-meltbloom) addition.
  function paintBrick(ctx, W, H, o) {
    const s = o.seed, bw = 30, bh = 14;
    for (let row = 0; row * bh < H; row++) {
      const y = H - (row + 1) * bh, off = row % 2 ? bw / 2 : 0;
      for (let x = -off; x < W; x += bw) {
        const k = row * 97 + Math.round(x);
        const t = Math.max(0, Math.min(1, (x + bw / 2) / W));              // 0 at the crumbling west edge
        const keep = t * 1.35 - (1 - (y / H)) * 0.35 + (rnd01(k, s) - 0.5) * 0.5;
        if (keep < 0.35) continue;                                          // missing brick
        const shade = 0.75 + rnd01(k + 1, s) * 0.35;
        const r = Math.round(58 * shade), g = Math.round(50 * shade), b = Math.round(44 * shade);
        ctx.fillStyle = '#16120e'; ctx.fillRect(x, y, bw, bh);
        ctx.fillStyle = 'rgb(' + r + ',' + g + ',' + b + ')'; ctx.fillRect(x + 1.5, y + 1.5, bw - 3, bh - 3);
        ctx.fillStyle = 'rgba(255,236,200,0.08)'; ctx.fillRect(x + 1.5, y + 1.5, bw - 3, 2);
        if (rnd01(k + 2, s) < 0.18) { ctx.strokeStyle = 'rgba(10,8,6,0.7)'; ctx.lineWidth = 1; ctx.beginPath(); ctx.moveTo(x + 6, y + 2); ctx.lineTo(x + 12, y + bh - 3); ctx.lineTo(x + 18, y + 5); ctx.stroke(); }
      }
    }
    // wax runs creeping down over the brick, and moss along the top courses
    for (let k = 0; k < Math.round(W / 26); k++) {
      const x = W * (0.3 + 0.7 * rnd01(k + 300, s)), len = 8 + rnd01(k + 301, s) * 26, y0 = Math.floor(rnd01(k + 302, s) * 6) * bh;
      const gr = ctx.createLinearGradient(0, y0, 0, y0 + len);
      gr.addColorStop(0, 'rgba(226,214,176,0.5)'); gr.addColorStop(1, 'rgba(226,214,176,0.12)');
      ctx.fillStyle = gr;
      ctx.beginPath(); ctx.moveTo(x - 4, y0); ctx.lineTo(x + 4, y0); ctx.lineTo(x + 1.5, y0 + len); ctx.arc(x, y0 + len, 1.6, 0, Math.PI); ctx.closePath(); ctx.fill();
    }
    for (let x = 0; x < W; x += 6) {
      const y = rnd01(x + 500, s) * 10;
      ctx.fillStyle = rnd01(x + 501, s) < 0.5 ? 'rgba(86,112,63,0.7)' : 'rgba(60,82,41,0.75)';
      ctx.beginPath(); ctx.arc(x, y + 4, 4 + rnd01(x + 502, s) * 4, 0, TAU); ctx.fill();
    }
    // fade the whole wall toward the crumbling edge and at the top (it sits back in the gloom)
    ctx.globalCompositeOperation = 'destination-in';
    const g = ctx.createLinearGradient(0, 0, W, 0);
    g.addColorStop(0, 'rgba(0,0,0,0)'); g.addColorStop(0.35, 'rgba(0,0,0,0.75)'); g.addColorStop(1, 'rgba(0,0,0,0.9)');
    ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
    ctx.globalCompositeOperation = 'source-over';
  }
  G.Events.mb_brick = G.Events.mb_brick || {
    init(e) {
      const p = e.props;
      e.data.it = { x: p.c0 * TILE, y: p.r0 * TILE, w: (p.c1 - p.c0 + 1) * TILE, h: (p.r1 - p.r0 + 1) * TILE };
      e.data.k = 'mb_brick:' + [p.c0, p.c1, p.r0, p.r1].join(',');
    },
    draw(e, ctx) {
      const it = e.data.it;
      if (G.camera && G.camera.visible && !G.camera.visible(it.x, it.y, it.w, it.h, 20)) return;
      const img = sprite(e.data.k, it.w, it.h, (c, W, H) => paintBrick(c, W, H, { seed: 7 }));
      if (img) ctx.drawImage(img, it.x, it.y);
    },
  };

  // mb_lip — the Meltbloom cup's rolled wax lip painted over the glazed lip-tip tiles (mb_02), so the canopy walkway
  // reads as the flower's rim instead of a glass block. Props: c0 c1 r0 r1 (the X tiles), bowl (-1 / 1: the side the
  // cup's bowl is on; that face is shaded). Drawn after the terrain. QA (qa-region-meltbloom) addition.
  function paintLip(ctx, W, H, o) {
    const pad = 8, x0 = pad, x1 = W - pad, top = 12, s = o.seed;
    const body = new Path2D();
    body.moveTo(x0, top + 10);
    body.bezierCurveTo(x0 - 2, H * 0.55, x0 + 6, H - 18, x0 + 14, H - 4);
    body.quadraticCurveTo((x0 + x1) / 2, H + 4, x1 - 14, H - 4);
    body.bezierCurveTo(x1 - 6, H - 18, x1 + 2, H * 0.55, x1, top + 10);
    body.closePath();
    const g = ctx.createLinearGradient(o.bowl > 0 ? x0 : x1, 0, o.bowl > 0 ? x1 : x0, 0);
    g.addColorStop(0, '#d9cfa6'); g.addColorStop(0.55, '#b3a67c'); g.addColorStop(1, '#6e6646');
    ctx.fillStyle = 'rgba(8,10,6,0.4)'; ctx.save(); ctx.translate(3, 4); ctx.fill(body); ctx.restore();
    ctx.fillStyle = g; ctx.fill(body);
    ctx.strokeStyle = MB.outline; ctx.lineWidth = 2; ctx.stroke(body);
    // fluting (the petal's veins running down) and wax runs
    ctx.save(); ctx.clip(body);
    ctx.strokeStyle = 'rgba(255,248,220,0.22)'; ctx.lineWidth = 1.5;
    for (let k = 1; k < 4; k++) { const x = x0 + ((x1 - x0) * k) / 4; ctx.beginPath(); ctx.moveTo(x, top + 12); ctx.quadraticCurveTo(x + 3, H * 0.6, x - 2, H - 6); ctx.stroke(); }
    for (let k = 0; k < 3; k++) {
      const x = x0 + 8 + rnd01(k, s) * (x1 - x0 - 16), len = 18 + rnd01(k + 4, s) * H * 0.45;
      ctx.fillStyle = 'rgba(255,250,228,0.4)';
      ctx.beginPath(); ctx.ellipse(x, top + 14 + len / 2, 3, len / 2, 0, 0, TAU); ctx.fill();
    }
    ctx.restore();
    // the rolled rim on top
    const rg = ctx.createLinearGradient(0, top - 10, 0, top + 14);
    rg.addColorStop(0, MB.waxHi); rg.addColorStop(0.6, MB.wax); rg.addColorStop(1, MB.waxShade);
    ctx.fillStyle = rg; ctx.beginPath(); ctx.ellipse(W / 2, top + 4, (x1 - x0) / 2 + 5, 10, 0, 0, TAU); ctx.fill();
    ctx.strokeStyle = MB.outline; ctx.lineWidth = 2; ctx.stroke();
    ctx.fillStyle = 'rgba(255,255,255,0.5)'; ctx.beginPath(); ctx.ellipse(W / 2 - 4, top, (x1 - x0) / 2 - 6, 3, 0, 0, TAU); ctx.fill();
  }
  G.Events.mb_lip = G.Events.mb_lip || {
    init(e) {
      const p = e.props;
      e.data.it = { x: p.c0 * TILE - 8, y: p.r0 * TILE - 12, w: (p.c1 - p.c0 + 1) * TILE + 16, h: (p.r1 - p.r0 + 1) * TILE + 16 };
      e.data.k = 'mb_lip:' + [p.c0, p.c1, p.r0, p.r1, p.bowl].join(',');
    },
    draw(e, ctx) {
      const it = e.data.it;
      if (G.camera && G.camera.visible && !G.camera.visible(it.x, it.y, it.w, it.h, 20)) return;
      const img = sprite(e.data.k, it.w, it.h, (c, W, H) => paintLip(c, W, H, { bowl: e.props.bowl || 1, seed: e.props.c0 }));
      if (img) ctx.drawImage(img, it.x, it.y);
    },
  };

  // mb_roots — the Root Hollows' root mat: pale gnarled wax roots hanging from the ceiling's underside (found from
  // the room's tiles), each with a branch or two and fine rootlets. They stop >= 3 tiles above the floor and never
  // reach a platform, so they never read as something to stand on or climb. Drawn after the terrain, emerging from
  // the ceiling's edge. Props: c0 c1 (cols), every (avg spacing in tiles, 3), len (max tiles, 3.2), skip [[a,b]].
  // QA (qa-region-meltbloom) addition.
  function paintRoot(ctx, rt) {
    ctx.translate(-rt.x0, -rt.y0);
    ctx.lineCap = 'round'; ctx.lineJoin = 'round';
    const pts = rt.pts, n = pts.length;
    // tapered main strand: three passes (dark outline, body, pale rim)
    for (const [col, wmul, off] of [['#1a160e', 1.3, 0], ['#8a7b5a', 1, 0], ['rgba(232,218,178,0.55)', 0.3, -2]]) {
      ctx.strokeStyle = col;
      for (let k = 0; k < n - 1; k++) {
        ctx.lineWidth = Math.max(0.8, rt.w * wmul * (1 - k / n));
        ctx.beginPath(); ctx.moveTo(pts[k][0] + off, pts[k][1]); ctx.lineTo(pts[k + 1][0] + off, pts[k + 1][1]); ctx.stroke();
      }
    }
    ctx.strokeStyle = '#6a5d43'; ctx.lineWidth = 3;
    for (const [ax, ay, bx, by] of rt.br) { ctx.beginPath(); ctx.moveTo(ax, ay); ctx.quadraticCurveTo(bx, ay + 4, bx, by); ctx.stroke(); }
    ctx.strokeStyle = 'rgba(200,184,140,0.35)'; ctx.lineWidth = 0.8;                // rootlets at the tip
    const [tx, ty] = pts[n - 1];
    for (let k = -1; k <= 1; k++) { ctx.beginPath(); ctx.moveTo(tx, ty - 6); ctx.lineTo(tx + k * 5, ty + 6 - Math.abs(k) * 2); ctx.stroke(); }
  }
  G.Events.mb_roots = G.Events.mb_roots || {
    init(e) {
      const p = e.props, R = e.room, out = [];
      if (!R || !R.tileAt) { e.data.roots = out; return; }
      const solid = (c, r) => { const k = R.tileAt(c, r); return k !== G.T.EMPTY && k !== G.T.WATER && k !== G.T.SPIKES; };
      const every = p.every || 3, maxLen = p.len || 3.2;
      const skip = (c) => (p.skip || []).some(([a, b]) => c >= a && c <= b);
      let c = p.c0 || 1, i = 0;
      while (c <= (p.c1 || R.cols - 2)) {
        i++;
        if (!skip(c)) {
          let r = 1; while (r < R.rows - 1 && solid(c, r)) r++;            // first air row under the ceiling
          let f = r; while (f < R.rows - 1 && R.tileAt(c, f) === G.T.EMPTY) f++;  // floor, platform or water below
          const room = f - r - 3;                                          // keep 3 tiles clear above the floor
          if (r > 1 && room > 0.8) {
            const len = Math.min(room, 1.2 + rnd01(i, c) * (maxLen - 1.2)) * TILE;
            const x = (c + 0.2 + rnd01(i + 1, c) * 0.6) * TILE, y = r * TILE - 4;
            const pts = [], br = [];
            for (let k = 0; k <= 10; k++) { const t = k / 10; pts.push([x + Math.sin(t * 5 + c) * 5 * t + (rnd01(i + k, c) - 0.5) * 3, y + t * len]); }
            for (let b = 0; b < 1 + (rnd01(i + 7, c) < 0.5 ? 1 : 0); b++) {
              const k0 = 3 + Math.floor(rnd01(i + 9 + b, c) * 4), [bx, by] = pts[k0], d = rnd01(i + 11 + b, c) < 0.5 ? -1 : 1;
              br.push([bx, by, bx + d * (10 + rnd01(i + 13 + b, c) * 14), by + 14 + rnd01(i + 15 + b, c) * 22]);
            }
            out.push({ pts, br, w: 9 + rnd01(i + 3, c) * 6, x0: x - 30, y0: y, x1: x + 30, y1: y + len + 10 });
          }
        }
        c += Math.max(2, Math.round(every * (0.6 + rnd01(i + 20, 3) * 0.9)));
      }
      e.data.roots = out;
    },
    draw(e, ctx) {
      const roots = e.data.roots, rid = (e.room && e.room.id) || '';
      for (let i = 0; i < roots.length; i++) {
        const rt = roots[i];
        if (G.camera && G.camera.visible && !G.camera.visible(rt.x0, rt.y0, rt.x1 - rt.x0, rt.y1 - rt.y0, 10)) continue;
        const w = Math.ceil(rt.x1 - rt.x0), h = Math.ceil(rt.y1 - rt.y0 + 4);
        const img = sprite('mb_root:' + rid + ':' + i + ':' + w + 'x' + h, w, h, (c) => paintRoot(c, rt));
        if (img) ctx.drawImage(img, rt.x0, rt.y0);
      }
    },
  };

  G.MeltbloomEnemies = { BloomSpitter, ThornHopper, PollenMoth, VineLurker, BloomSeed, drawSpitter, drawHopper, drawMoth, drawLurker };
})();
