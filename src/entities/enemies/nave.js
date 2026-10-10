// src/entities/enemies/nave.js — The Drowned Nave enemies (module: enemies-nave; placement guide: docs/api/enemies-nave.md):
//   drowned_acolyte — a drenched Snuffed cleric in a sodden cowl, a dead wick through its hood, carrying a gold-lit
//                     lantern on a crook. Shuffles its beat; up close it hoists the lantern high behind its head
//                     (0.5 s) and sweeps it down in a wide burning arc in front; at range it swings the lantern back
//                     low, the flame swells (0.55 s) and it flings a lantern-flame (projectile 'acolyte_flame',
//                     destroyable). hp 38.
//   rain_jelly      — a translucent bell of rainwater with a pale little flame for a heart, trailing tentacles.
//                     Drifts slowly near its spot and follows the Wickling at a distance; every few seconds it swells
//                     (0.62 s, the droplets bead visibly on its rim where they will fly) and bursts a ring of 8
//                     droplets (projectile 'jelly_drop', destroyable; the ring alternates its offset). hp 30.
//   bell_sentry     — a squat verdigris-armoured waxen whose head is a cracked bronze bell. Stationary (immovable);
//                     when the Wickling comes near it heaves its mallet high (0.62 s) and strikes its own head: the
//                     toll sends a ground shockwave along the floor both ways (projectile 'bell_wave'; jump it),
//                     then it stands dazed ~1 s. hp 45.
//   drowned_knight  — a tall knight in waterlogged plate behind a tower shield. Its shield stops Brand blows struck at
//                     its front (clang, sparks, no damage, the Wickling recoils) while it guards; it is open from
//                     behind (it turns slowly), from above (pogo), to spells, and while attacking: wind-up (0.55 s,
//                     sword drawn back, shield swung aside) → 2-3 lunging stabs (each follow-up pulled back 0.36 s) →
//                     0.85 s recovery with the point in the floor. hp 54.
// All four respect exit zones (never step/steer into the 3.5 tiles inside a doorway; no attacks while the Wickling
// stands in one), beats (`range` / `leash` props), ledges and hazard tiles (water is a hazard here).
(function () {
  'use strict';
  const G = globalThis.G;
  if (!G || !G.Enemy) return;
  const TILE = G.CONST.TILE;
  const TAU = Math.PI * 2;
  const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
  const lerp = (a, b, k) => a + (b - a) * k;
  const toward = (v, target, step) => (v < target ? Math.min(target, v + step) : Math.max(target, v - step));
  const h01 = (i, s) => { const x = Math.sin(i * 127.1 + s * 311.7) * 43758.5453; return x - Math.floor(x); };
  const rnd = (a, b) => a + Math.random() * (b - a);
  const glow = (ctx, x, y, r, c, a) => { if (G.fx && G.fx.glowAt) G.fx.glowAt(ctx, x, y, r, c, a); };
  const CH = () => (G.Art && G.Art.char) || null;
  const burst = (k, x, y, o) => { if (G.fx) G.fx.burst(k, x, y, o); };
  const shake = (px, s) => { if (G.game && typeof G.game.shake === 'function') G.game.shake(px, s); };
  const flame = (ctx, x, y, size, kind, t, seed, o) => { if (G.Art && G.Art.flame) G.Art.flame(ctx, x, y, size, kind, t, seed, o); };

  // ------------------------------------------------------------------ sfx (defined only if the audio module lacks them)
  (function defineSfx() {
    const A = G.Audio;
    if (!A || typeof A.defineSfx !== 'function') return;
    const have = typeof A.sfxNames === 'function' ? A.sfxNames() : [];
    const def = (name, o) => { if (have.indexOf(name) < 0) A.defineSfx(name, o); };
    def('lantern_swing', {    // a heavy lantern swung on its chain: air whoosh, chain tinks, a flame "whuff"
      vol: 3.2, reverb: 0.15,
      play(k) {
        const v = k.r(0.94, 1.06);
        k.noise({ bp: 480 * v, bp1: 1700 * v, Q: 1.1, a: 0.04, d: 0.32, g: 0.16, sweep: 0.28 });
        k.noise({ color: 'pink', bp: 850 * v, Q: 0.8, a: 0.02, d: 0.3, g: 0.07, at: 0.05 });
        k.tone({ f: 2900 * v, type: 'triangle', a: 0.001, d: 0.12, g: 0.02, at: 0.04 });
        k.tone({ f: 3650 * v, type: 'triangle', a: 0.001, d: 0.1, g: 0.016, at: 0.1 });
      },
    });
    def('flame_fling', {      // a lantern flame thrown: soft woof + rising crackle
      vol: 3, reverb: 0.2,
      play(k) {
        const v = k.r(0.92, 1.08);
        k.noise({ color: 'brown', lp: 900 * v, a: 0.01, d: 0.25, g: 0.22 });
        k.noise({ bp: 1400 * v, bp1: 3000 * v, Q: 1, a: 0.02, d: 0.3, g: 0.08, sweep: 0.25 });
        k.tone({ f: 180 * v, f1: 320 * v, glide: 0.15, type: 'triangle', a: 0.01, d: 0.18, g: 0.05 });
      },
    });
    def('flame_hiss', {       // a flame dying in the wet: short hiss + soft thud
      vol: 2.8, reverb: 0.15,
      play(k) {
        const v = k.r(0.9, 1.1);
        k.noise({ hp: 2400 * v, a: 0.004, d: 0.35, g: 0.08 });
        k.noise({ color: 'brown', lp: 700 * v, a: 0.002, d: 0.1, g: 0.12 });
      },
    });
    def('jelly_swell', {      // a wet, rising, wobbling "bloop" as the jelly inflates
      vol: 2.6, reverb: 0.3,
      play(k) {
        const v = k.r(0.94, 1.06);
        k.tone({ f: 210 * v, f1: 520 * v, glide: 0.5, type: 'sine', a: 0.08, hold: 0.3, d: 0.25, g: 0.07, vib: { rate: 9, depth: 45 } });
        k.noise({ color: 'pink', bp: 600 * v, bp1: 1500 * v, Q: 3, a: 0.15, d: 0.45, g: 0.04, sweep: 0.5 });
      },
    });
    def('jelly_burst', {      // the droplet ring bursting out: watery pop + a spray of small plinks
      vol: 3, reverb: 0.25,
      play(k) {
        const v = k.r(0.92, 1.08);
        k.tone({ f: 900 * v, f1: 260 * v, glide: 0.09, type: 'sine', a: 0.002, d: 0.14, g: 0.12 });
        k.noise({ bp: 2200 * v, Q: 1.4, a: 0.002, d: 0.2, g: 0.14 });
        for (let i = 0; i < 3; i++) k.tone({ f: (1200 + i * 450) * v, f1: (1600 + i * 500) * v, glide: 0.05, type: 'sine', a: 0.002, d: 0.06, g: 0.03, at: 0.04 + i * 0.045 });
      },
    });
    def('drip_splat', {       // one droplet splashing on stone
      vol: 2.2, reverb: 0.2,
      play(k) {
        const v = k.r(0.85, 1.2);
        k.tone({ f: 1500 * v, f1: 700 * v, glide: 0.05, type: 'sine', a: 0.001, d: 0.06, g: 0.05 });
        k.noise({ bp: 3200 * v, Q: 1.5, a: 0.001, d: 0.08, g: 0.06 });
      },
    });
    def('sentry_bell', {      // the sentry's cracked head tolled by its mallet: thud + a sour bronze bell
      vol: 3.2, reverb: 0.45,
      play(k) {
        const v = k.r(0.97, 1.03);
        k.noise({ color: 'brown', lp: 1200, a: 0.001, d: 0.12, g: 0.22 });
        k.inst('bell', 'D3', 2.2, 0.9);
        k.tone({ f: 1187 * v, type: 'triangle', a: 0.001, d: 0.7, g: 0.04 });
        k.tone({ f: 1262 * v, type: 'sine', a: 0.001, d: 0.9, g: 0.03 });          // the crack: a beating partial
      },
    });
    def('shield_clang', {     // Brand on a tower shield: bright inharmonic clang
      vol: 3.4, reverb: 0.2,
      play(k) {
        const v = k.r(0.95, 1.05);
        k.tone({ f: 1530 * v, type: 'triangle', a: 0.001, d: 0.45, g: 0.06 });
        k.tone({ f: 2310 * v, type: 'triangle', a: 0.001, d: 0.35, g: 0.045 });
        k.tone({ f: 3470 * v, type: 'sine', a: 0.001, d: 0.25, g: 0.035 });
        k.noise({ hp: 2500 * v, a: 0.001, d: 0.09, g: 0.16 });
        k.noise({ color: 'brown', lp: 700, a: 0.001, d: 0.08, g: 0.12 });
      },
    });
    def('knight_stab', {      // a sword thrust: sharp rising swish
      vol: 3, reverb: 0.12,
      play(k) {
        const v = k.r(0.94, 1.08);
        k.noise({ bp: 1200 * v, bp1: 3400 * v, Q: 1.6, a: 0.01, d: 0.14, g: 0.16, sweep: 0.1 });
        k.tone({ f: 640 * v, f1: 1300 * v, glide: 0.08, type: 'sawtooth', lp: 2500, a: 0.005, d: 0.09, g: 0.02 });
      },
    });
  })();

  // Region creature colours: drowned teal-slate cloth, verdigris bronze and plate, grey-blue Snuffed wax, lit by
  // pale-gold lantern/stained-glass light; everything reads against the dark teal nave by its pale rims and gold glows.
  const NV = {
    outline: '#0a1114', rim: '#a8c8d4', tele: '#f2d890', gold: '#ffc850', goldHot: '#fff0b8',
    water: '#9fd4e0', waterHi: '#e2f6fa', waterDeep: '#3d7584', wax: '#8f99a8', waxShade: '#5d6575', waxHi: '#c4ccd8',
  };

  // ------------------------------------------------------------------ shared: exit zones, beats, hazards
  /** Exit zones of the enemy's room: each opening's run (±1 tile) and 3.5 tiles inward (wide N openings = open sky are
   *  skipped; S openings = pits are kept, so nothing wanders over a chasm). */
  function exitZones(e) {
    const room = e.room;
    if (e._zones && e._zonesRoom === room) return e._zones;
    const out = [];
    if (room) {
      const W = room.widthPx, H = room.heightPx, D = 3.5 * TILE;
      for (const o of room.openings || []) {
        if (o.side === 'N' && o.size > 8) continue;
        const a = (o.pos - 1) * TILE, b = (o.pos + o.size + 1) * TILE;
        if (o.side === 'W') out.push({ side: 'W', x0: -1, y0: a, x1: D, y1: b });
        else if (o.side === 'E') out.push({ side: 'E', x0: W - D, y0: a, x1: W + 1, y1: b });
        else if (o.side === 'N') out.push({ side: 'N', x0: a, y0: -1, x1: b, y1: D });
        else out.push({ side: 'S', x0: a, y0: H - D, x1: b, y1: H + 1 });
      }
    }
    e._zones = out; e._zonesRoom = room;
    return out;
  }
  function inZone(e, x, y) {
    for (const z of exitZones(e)) if (x > z.x0 && x < z.x1 && y > z.y0 && y < z.y1) return z;
    return null;
  }
  /** Move a steering target out of any exit zone (toward the room interior) and inside the room. */
  function keepOut(e, x, y, margin) {
    const m = margin == null ? 30 : margin;
    for (let i = 0; i < 3; i++) {
      let z = inZone(e, x, y);
      if (!z) z = inZone(e, x - m, y) || inZone(e, x + m, y) || inZone(e, x, y - m) || inZone(e, x, y + m);
      if (!z) break;
      if (z.side === 'W') x = z.x1 + m; else if (z.side === 'E') x = z.x0 - m; else if (z.side === 'N') y = z.y1 + m; else y = z.y0 - m;
    }
    const room = e.room;
    if (room) { x = clamp(x, TILE, room.widthPx - TILE); y = clamp(y, TILE, room.heightPx - TILE); }
    return { x, y };
  }
  function playerInZone(e) {
    const p = e.player;
    return !!p && !!inZone(e, p.x + p.w / 2, p.y + p.h / 2);
  }
  function propTiles(e, name, def) { const v = +e.props[name]; return (v > 0 ? v : def) * TILE; }
  const pCenter = (p) => ({ x: p.x + p.w / 2, y: p.y + p.h / 2 });
  /** Ground walkers: may it take a step in dir (inside its beat, not into an exit zone, no wall/ledge/hazard)? */
  function canStep(e, dir, beat) {
    const ax = e.cx + dir * (e.w / 2 + 14);
    if (inZone(e, ax, e.cy)) return false;
    if (e.home && Math.abs(ax - e.home.x) > beat + TILE) return false;
    return !e.blockedAhead(dir);
  }
  /** Stroke helpers in a mirrored feet space: X(x) = fx + f·x, Y(y) = fy + y. */
  function painter(ctx, fx, fy, f) {
    const X = (x) => fx + f * x, Y = (y) => fy + y;
    const stroke = (pts, w, col) => {
      ctx.strokeStyle = col; ctx.lineWidth = w;
      ctx.beginPath(); ctx.moveTo(X(pts[0].x), Y(pts[0].y));
      for (let i = 1; i < pts.length; i++) ctx.lineTo(X(pts[i].x), Y(pts[i].y));
      ctx.stroke();
    };
    /** Two-segment limb from s to h; the elbow bends away from the facing (down/back). */
    const limb = (s, h, w, col, col2, bendSign) => {
      const dx = h.x - s.x, dy = h.y - s.y, d = Math.hypot(dx, dy) || 1;
      let px = -dy / d, py = dx / d;
      if ((bendSign || 1) * px > 0 || (Math.abs(px) < 0.2 && py < 0)) { px = -px; py = -py; }
      const bend = Math.max(2, 28 - d) * 0.5;
      const el = { x: (s.x + h.x) / 2 + px * bend, y: (s.y + h.y) / 2 + py * bend };
      stroke([s, el, h], w + 3.5, NV.outline);
      stroke([s, el], w, col);
      stroke([el, h], w - 0.5, col2 || col);
      return el;
    };
    return { X, Y, stroke, limb };
  }
  /** A falling drip along a body: a small teardrop that slides down `len` px from (x, y), period ~p s. */
  function drip(ctx, x, y, len, t, seed, p) {
    const k = ((t / (p || 1.3)) + h01(3, seed)) % 1;
    const yy = y + k * k * len, a = k < 0.85 ? 0.75 : (1 - k) / 0.15 * 0.75;
    ctx.fillStyle = 'rgba(190,232,242,' + a.toFixed(3) + ')';
    ctx.beginPath(); ctx.moveTo(x, yy - 3.2); ctx.quadraticCurveTo(x + 1.8, yy, x, yy + 1.6); ctx.quadraticCurveTo(x - 1.8, yy, x, yy - 3.2); ctx.fill();
  }

  // ==================================================================================================================
  // drowned_acolyte
  // ==================================================================================================================
  const AC = {
    robe: '#34494f', robeDark: '#1f2e33', robeHi: '#58767c', hem: 'rgba(16,30,28,0.55)', algae: '#3f6a52', algaeHi: '#6a9a74',
    rope: '#6e5d3e', ropeHi: '#9c865a', face: '#071012', wood: '#3a2b20', woodHi: '#6a5034',
    iron: '#1b2326', ironHi: '#55666b', glass: '#ffd77a',
  };
  // Staff poses: hand (hx, hy) feet-relative (facing right, y up negative), staff angle a (direction hand → crook).
  const APOSE = {
    carry: { hx: 9, hy: -31, a: -1.0, lean: 0 },
    alert: { hx: 11, hy: -38, a: -1.15, lean: -0.1 },
    raise: { hx: -3, hy: -48, a: -2.25, lean: -0.4 },
    sweep: { hx: 16, hy: -31, a: 0.25, lean: 0.6 },
    recover: { hx: 13, hy: -31, a: 0.35, lean: 0.4 },
    wind: { hx: -6, hy: -30, a: -2.75, lean: -0.3 },
    fling: { hx: 12, hy: -41, a: -0.9, lean: 0.25 },
  };
  const STAFF = 34, STAFF_BACK = 15, CHAIN = 12;

  class DrownedAcolyte extends G.Enemy {
    constructor(props) {
      super(props, {
        hp: 38, w: 30, h: 58,
        cinders: [6, 10],
        weight: 1,
        sight: 8 * TILE,
        colors: { body: AC.robe, dark: AC.robeDark, hit: '#dbe8ea', smoke: '#56656c', puddle: '#3a4b51', tele: NV.tele },
        light: { r: 86, color: NV.gold, intensity: 0.42, dx: 24, dy: -8, flicker: true },
        puddleW: 24,
      });
      this.pose = Object.assign({}, APOSE.carry);
      this.walk = Math.random() * TAU;
      this.th = 0; this.om = 0; this.hookPrev = null; this.hookV = null; this._pf = 0;
      this.flare = 0;
      this.lostT = 0;
      this.dripT = Math.random();
    }
    init() { super.init(); this.setState('patrol'); this.cooldown('fling', rnd(0.8, 1.6)); }
    beat() { return propTiles(this, 'range', 5); }
    canStep(dir) { return canStep(this, dir, this.beat()); }
    sees(p) {
      if (!this.canSee(p)) return false;
      const dy = pCenter(p).y - this.cy;
      return dy > -5 * TILE && dy < 3 * TILE;
    }
    hand() { const P = this.pose; return { x: P.hx + P.lean * 4, y: P.hy }; }
    hookLocal() { const P = this.pose, h = this.hand(); return { x: h.x + Math.cos(P.a) * STAFF, y: h.y + Math.sin(P.a) * STAFF }; }
    hookWorld() { const h = this.hookLocal(); return { x: this.cx + this.facing * h.x, y: this.y + this.h + h.y }; }
    lanternWorld() {
      const hk = this.hookWorld();
      return { x: hk.x + Math.sin(this.th) * CHAIN, y: Math.min(hk.y + Math.cos(this.th) * CHAIN, this.y + this.h - 20) };
    }
    think(dt) {
      const p = this.player;
      let target = APOSE.carry, rate = 7, flare = 0;
      switch (this.state) {
        case 'patrol': {
          if (this.grounded && !this.canStep(this.facing) && !this.blockedAhead(this.facing)) { this.facing = -this.facing; this.vx = 0; }
          this.patrol(26, { range: this.beat(), pause: 1.1 });
          if (this.stateTime > 0.4 && this.sees(p)) this.setState('notice');
          break;
        }
        case 'notice':
          this.stop(); this.face(p); target = APOSE.alert;
          if (this.once('hiss')) G.sfxAt('enemy_windup', this.cx, { vol: 0.3, pitch: 0.8 });
          if (this.stateTime > 0.45) this.setState('engage');
          break;
        case 'engage': {
          if (!this.targetable(p)) { this.setState('patrol'); break; }
          this.face(p);
          target = APOSE.alert;
          const adx = Math.abs(this.dx()), ady = this.dy();
          if (this.canSee(p, this.sight * 1.3)) this.lostT = 0; else this.lostT += dt;
          if (this.lostT > 3) { this.setState('patrol'); break; }
          const zone = playerInZone(this);
          if (!zone && adx < 2.2 * TILE && Math.abs(ady) < 1.6 * TILE && this.ready('swing')) { this.setState('raise'); break; }
          if (!zone && this.ready('fling') && adx > 2.4 * TILE && adx < 9 * TILE && ady > -5 * TILE && ady < 3 * TILE && this.canSee(p, 10 * TILE)) { this.setState('wind'); break; }
          if (adx > 1.4 * TILE && this.grounded && this.canStep(this.facing)) this.vx = this.facing * 50;
          else this.stop();
          break;
        }
        case 'raise': {                                        // TELEGRAPH: hoists the lantern high behind its head
          this.stop();
          target = APOSE.raise; rate = 8;
          if (this.once('tele')) { const L = this.lanternWorld(); this.stateData.w = this.telegraph(0.5, { x: L.x, y: L.y, shake: 1.4, color: NV.tele }); }
          const w = this.stateData.w;
          flare = this.stateTime < w ? 0.6 : 0.3;
          if (this.stateTime >= w) { target = APOSE.sweep; rate = 26; }
          if (this.at(w)) G.sfxAt('lantern_swing', this.cx, { vol: 0.9 });
          if (this.stateTime >= w + 0.03 && this.stateTime < w + 0.18) {
            const f = this.facing, x0 = f > 0 ? this.cx - 6 : this.cx - 2.3 * TILE + 6;
            this.strike({ x: x0, y: this.y + this.h - 2 * TILE, w: 2.3 * TILE, h: 2 * TILE }, { dir: { x: f, y: -0.2 } });
          }
          if (this.at(w + 0.12)) { const L = this.lanternWorld(); burst('ember', L.x, L.y, { count: 7, color: NV.gold, speed: 190 }); }
          if (this.stateTime >= w + 0.2) { target = APOSE.recover; rate = 6; }
          if (this.stateTime > w + 0.8) { this.cooldown('swing', rnd(1.1, 1.5)); this.cooldown('fling', Math.max(0.8, this.cds.fling || 0)); this.setState('engage'); }
          break;
        }
        case 'wind': {                                         // TELEGRAPH: swings the lantern back low; flame swells
          this.stop();
          target = APOSE.wind; rate = 7;
          if (this.once('tele')) { const L = this.lanternWorld(); this.stateData.w = this.telegraph(0.55, { x: L.x, y: L.y, shake: 1.2, color: NV.tele }); }
          const w = this.stateData.w;
          flare = this.stateTime < w ? clamp(this.stateTime / w, 0, 1) : 0;
          if (this.telegraphing && this.every(0.09)) { const L = this.lanternWorld(); burst('ember', L.x, L.y + 6, { count: 1, color: NV.gold, speed: 50, angle: -Math.PI / 2, spread: 1 }); }
          if (this.stateTime >= w) { target = APOSE.fling; rate = 24; }
          if (this.at(w + 0.07)) this.flingFlame();
          if (this.stateTime > w + 0.65) { this.cooldown('fling', rnd(3.6, 5)); this.cooldown('swing', 0.4); this.setState('engage'); }
          break;
        }
        default: this.setState('patrol');
      }
      // pose follows the state (smoothed)
      const P = this.pose, k = Math.min(1, dt * rate);
      for (const key of ['hx', 'hy', 'a', 'lean']) P[key] = lerp(P[key], target[key], k);
      this.flare = toward(this.flare, flare, dt * 4);
      if (Math.abs(this.vx) > 5 && this.grounded) this.walk += Math.abs(this.vx) * dt * 0.13;
      this.swingLantern(dt);
      const L = this.lanternWorld();
      this.cfg.light.dx = (L.x - this.cx) * this.facing; this.cfg.light.dy = L.y + 8 - this.cy;
      this.cfg.light.intensity = 0.42 + this.flare * 0.3;
      this.dripT -= dt;
      if (this.dripT <= 0) { this.dripT = rnd(0.35, 0.8); burst('drip', this.cx + rnd(-12, 12), this.y + this.h - 4, { count: 1, color: NV.water }); }
    }
    /** Lantern pendulum on its chain, driven by the crook's motion (purely visual). */
    swingLantern(dt) {
      const hk = this.hookWorld();
      if (this.hookPrev && this._pf === this.facing && dt > 0) {
        const vx = (hk.x - this.hookPrev.x) / dt, vy = (hk.y - this.hookPrev.y) / dt;
        let ax = 0, ay = 0;
        if (this.hookV) { ax = clamp((vx - this.hookV.x) / dt, -6000, 6000); ay = clamp((vy - this.hookV.y) / dt, -6000, 6000); }
        this.hookV = { x: vx, y: vy };
        const acc = -((1500 + ay) * Math.sin(this.th) + ax * Math.cos(this.th)) / 34;
        this.om = (this.om + acc * dt) * Math.max(0, 1 - 2.6 * dt);
        this.th = clamp(this.th + this.om * dt, -2.3, 2.3);
      } else { this.hookV = null; this.th *= -0.5; this.om = 0; }
      this.hookPrev = hk; this._pf = this.facing;
    }
    flingFlame() {
      const p = this.player;
      if (!this.targetable(p)) return;
      const L = this.lanternWorld(), pc = pCenter(p);
      const adx = Math.abs(pc.x - L.x);
      this.lob('acolyte_flame', { x: pc.x - 1, y: pc.y - 1, w: 2, h: 2 }, { time: clamp(0.42 + adx / TILE * 0.075, 0.55, 1.05), gravity: 1100, x: L.x, y: L.y, destroyable: true, sound: false });
      G.sfxAt('flame_fling', L.x, { vol: 0.9 });
      burst('ember', L.x, L.y, { count: 6, color: NV.goldHot, speed: 200, angle: -Math.PI / 2 + this.facing * 0.6, spread: 1 });
      this.flare = 0;
    }
    drawBounds() { return { x: this.x - 70, y: this.y - 60, w: this.w + 140, h: this.h + 70 }; }
    drawBody(ctx, t) { drawAcolyte(ctx, this, t, false); }
    drawCorpse(ctx, t) { drawAcolyte(ctx, this, t, true); }
  }

  function drawAcolyte(ctx, e, t, dead) {
    const C = CH();
    const f = e.facing, fx = e.cx, fy = e.y + e.h, seed = e.seed || 0;
    const P = e.pose;
    const moving = Math.abs(e.vx) > 5 && !dead;
    const wk = e.walk || 0;
    const bob = moving ? Math.abs(Math.sin(wk)) * 1.6 : Math.sin(t * 1.3 + seed) * 0.7;
    const L = P.lean * 6, by = -bob;
    const { X, Y, stroke } = painter(ctx, fx, fy, f);
    ctx.lineCap = 'round'; ctx.lineJoin = 'round';
    if (C && C.shadow) C.shadow(ctx, fx, fy, 18, 0.4);
    const hand = { x: P.hx + P.lean * 4, y: P.hy + by * 0.5 };
    const dir = { x: Math.cos(P.a), y: Math.sin(P.a) };
    const hookL = { x: hand.x + dir.x * STAFF, y: hand.y + dir.y * STAFF };
    const behind = hookL.x < 2;
    // ---- staff + lantern
    const drawStaff = () => {
      const butt = { x: hand.x - dir.x * STAFF_BACK, y: hand.y - dir.y * STAFF_BACK };
      stroke([butt, hookL], 6, NV.outline);
      stroke([butt, hookL], 3.4, AC.wood);
      stroke([{ x: butt.x + dir.x * 4, y: butt.y + dir.y * 4 - 0.8 }, { x: hookL.x - dir.x * 3, y: hookL.y - dir.y * 3 - 0.8 }], 1.2, AC.woodHi);
      // crook: a small curl at the top end, bending forward
      const cx0 = X(hookL.x), cy0 = Y(hookL.y);
      ctx.strokeStyle = NV.outline; ctx.lineWidth = 5.5;
      ctx.beginPath(); ctx.moveTo(cx0, cy0); ctx.quadraticCurveTo(cx0 + f * 7, cy0 - 6, cx0 + f * 8, cy0 + 1); ctx.stroke();
      ctx.strokeStyle = AC.wood; ctx.lineWidth = 3;
      ctx.beginPath(); ctx.moveTo(cx0, cy0); ctx.quadraticCurveTo(cx0 + f * 7, cy0 - 6, cx0 + f * 8, cy0 + 1); ctx.stroke();
      // chain + lantern (world-space pendulum)
      const hx = cx0 + f * 7.5, hy = cy0 + 1;
      const th = e.th || 0;
      let lx = hx + Math.sin(th) * CHAIN, ly = hy + Math.cos(th) * CHAIN;
      if (ly > fy - 20) ly = fy - 20;
      ctx.strokeStyle = '#2b3438'; ctx.lineWidth = 1.6;
      ctx.setLineDash([2.2, 1.6]);
      ctx.beginPath(); ctx.moveTo(hx, hy); ctx.lineTo(lx, ly); ctx.stroke();
      ctx.setLineDash([]);
      const lit = !dead, fl = e.flare || 0;
      if (lit) glow(ctx, lx, ly + 11, 34 + fl * 30, NV.gold, 0.38 + fl * 0.3);
      ctx.save(); ctx.translate(lx, ly); ctx.rotate(-th * 0.85);
      // cap
      ctx.fillStyle = NV.outline;
      ctx.beginPath(); ctx.moveTo(-8, 6); ctx.lineTo(0, -1.5); ctx.lineTo(8, 6); ctx.closePath(); ctx.fill();
      ctx.fillStyle = AC.iron;
      ctx.beginPath(); ctx.moveTo(-6.5, 5); ctx.lineTo(0, 0.2); ctx.lineTo(6.5, 5); ctx.closePath(); ctx.fill();
      // glass body
      ctx.fillStyle = NV.outline; ctx.fillRect(-7.5, 4, 15, 16.5);
      ctx.fillStyle = lit ? 'rgba(255,214,120,' + (0.55 + fl * 0.35).toFixed(3) + ')' : '#2c3236';
      ctx.fillRect(-6, 5.5, 12, 13.5);
      if (lit) flame(ctx, 0, 17, 9 + fl * 9, 'gold', t, seed, { noGlow: true });
      ctx.strokeStyle = AC.iron; ctx.lineWidth = 1.6;
      ctx.beginPath(); ctx.moveTo(0, 5.5); ctx.lineTo(0, 19); ctx.stroke();
      ctx.strokeStyle = AC.ironHi; ctx.lineWidth = 1;
      ctx.strokeRect(-6, 5.5, 12, 13.5);
      // base
      ctx.fillStyle = NV.outline; ctx.fillRect(-8.5, 18.5, 17, 4.5);
      ctx.fillStyle = AC.iron; ctx.fillRect(-7.5, 19.2, 15, 2.8);
      ctx.restore();
      // water dripping from the lantern base
      if (!dead) drip(ctx, lx, ly + 23, 14, t, seed + 4, 0.9);
    };
    // ---- sweep trail (a burning crescent) during the strike
    if (!dead && e.state === 'raise' && e.stateData && e.stateData.w != null) {
      const s = e.stateTime - e.stateData.w;
      if (s >= 0 && s < 0.3 && C && C.slash) {
        const ang = f > 0 ? -0.75 : Math.PI + 0.75;
        C.slash(ctx, X(2), Y(-36), 52, ang, s / 0.3, { arc: 2.7, width: 16, color: '#ffbf4a', core: '#fff3c8', flip: f < 0 });
      }
    }
    if (behind) drawStaff();
    // ---- robe (sodden cowl and habit)
    const sway = moving ? Math.sin(wk) * 2 : Math.sin(t * 1.1 + seed) * 0.8;
    const rp = new Path2D();
    rp.moveTo(X(17 + sway), Y(-1));
    rp.bezierCurveTo(X(15 + L * 0.3), Y(-16 + by), X(12 + L * 0.7), Y(-28 + by), X(11 + L * 0.8), Y(-38 + by));
    rp.quadraticCurveTo(X(13 + L), Y(-44 + by), X(12.5 + L), Y(-51 + by));                     // hood front edge
    rp.bezierCurveTo(X(12 + L), Y(-57 + by), X(10 + L), Y(-60 + by), X(8 + L), Y(-61 + by));     // drooping cowl tip
    rp.bezierCurveTo(X(4 + L), Y(-66 + by), X(-8 + L * 0.6), Y(-63 + by), X(-11 + L * 0.5), Y(-54 + by));
    rp.bezierCurveTo(X(-14 + L * 0.4), Y(-46 + by), X(-12 + L * 0.3), Y(-40 + by), X(-13 + L * 0.2), Y(-34 + by));
    rp.bezierCurveTo(X(-16), Y(-22 + by), X(-17 + sway), Y(-10), X(-17 + sway), Y(-1));
    for (let i = 1; i <= 7; i++) {                                                               // ragged wet hem
      const hx = -17 + i * (34 / 7) + sway, hy = (i % 2 ? 1.5 : -3) + h01(i, seed) * 1.5;
      rp.lineTo(X(hx), Y(hy));
    }
    rp.closePath();
    const bx0 = Math.min(X(-18), X(18)), bx1 = Math.max(X(-18), X(18));
    if (C && C.shape) C.shape(ctx, rp, { fill: dead ? '#2c3d42' : AC.robe, box: [bx0, fy - 66, bx1, fy], light: -1, rim: NV.rim, rimWidth: 2.2, shade: 0.45, hi: 0.1 });
    else { ctx.fillStyle = AC.robe; ctx.fill(rp); }
    ctx.save(); ctx.clip(rp);
    // soaked lower habit with algae
    ctx.fillStyle = AC.hem; ctx.fillRect(bx0 - 2, fy - 13, bx1 - bx0 + 4, 14);
    ctx.fillStyle = AC.algae;
    for (let i = 0; i < 5; i++) {
      const ax = -15 + i * 7.5 + h01(i + 7, seed) * 3, ah = 4 + h01(i + 2, seed) * 6;
      ctx.beginPath(); ctx.ellipse(X(ax + sway * 0.8), Y(-1 - ah * 0.4), 2.6, ah * 0.6, 0, 0, TAU); ctx.fill();
    }
    // long wet sheen streaks
    ctx.strokeStyle = 'rgba(170,210,220,0.22)'; ctx.lineWidth = 1.4;
    for (let i = 0; i < 3; i++) {
      const sx = -8 + i * 7 + L * 0.3;
      ctx.beginPath(); ctx.moveTo(X(sx), Y(-44 + by + i * 3)); ctx.quadraticCurveTo(X(sx - 1.5), Y(-24), X(sx - 2 + sway * 0.5), Y(-6)); ctx.stroke();
    }
    // fold shadows
    ctx.strokeStyle = 'rgba(8,16,18,0.45)'; ctx.lineWidth = 1.6;
    ctx.beginPath(); ctx.moveTo(X(-4 + L * 0.3), Y(-30 + by)); ctx.quadraticCurveTo(X(-6), Y(-14), X(-7 + sway), Y(-2)); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(X(6 + L * 0.5), Y(-28 + by)); ctx.quadraticCurveTo(X(7), Y(-14), X(9 + sway), Y(-2)); ctx.stroke();
    ctx.restore();
    // rope belt with a hanging knot
    ctx.strokeStyle = NV.outline; ctx.lineWidth = 4;
    ctx.beginPath(); ctx.moveTo(X(-13 + L * 0.2), Y(-29 + by)); ctx.quadraticCurveTo(X(0 + L * 0.4), Y(-26.5 + by), X(12 + L * 0.6), Y(-29.5 + by)); ctx.stroke();
    ctx.strokeStyle = AC.rope; ctx.lineWidth = 2.4; ctx.stroke();
    stroke([{ x: 6 + L * 0.5, y: -28 + by }, { x: 7 + L * 0.5 + sway * 0.3, y: -17 + by }], 2.2, AC.rope);
    ctx.fillStyle = AC.ropeHi; ctx.beginPath(); ctx.arc(X(6 + L * 0.5), Y(-28 + by), 2, 0, TAU); ctx.fill();
    // hood opening: a dark hollow with the Snuffed's pinprick eyes and a sliver of grey wax chin
    const hx = 6 + L, hy = -48 + by;
    ctx.fillStyle = AC.face;
    ctx.beginPath(); ctx.ellipse(X(hx), Y(hy), 5.6, 8, f * 0.12, 0, TAU); ctx.fill();
    ctx.strokeStyle = 'rgba(120,160,170,0.35)'; ctx.lineWidth = 1.2;
    ctx.beginPath(); ctx.ellipse(X(hx - 0.6), Y(hy), 5.6, 8, f * 0.12, f > 0 ? 1.9 : -1.2, f > 0 ? 4.2 : 1.2); ctx.stroke();
    ctx.fillStyle = NV.waxShade;
    ctx.beginPath(); ctx.ellipse(X(hx + 1), Y(hy + 6), 3.4, 1.7, 0, 0, Math.PI); ctx.fill();
    if (C && C.eyes) {
      if (dead) { ctx.strokeStyle = '#6a7680'; ctx.lineWidth = 1.2; ctx.beginPath(); ctx.moveTo(X(hx - 2.5), Y(hy - 1)); ctx.lineTo(X(hx - 0.5), Y(hy - 1)); ctx.moveTo(X(hx + 2), Y(hy - 1)); ctx.lineTo(X(hx + 4), Y(hy - 1)); ctx.stroke(); }
      else C.eyes(ctx, X(hx + 1), Y(hy - 1.2), { kind: 'pinprick', size: 4.4, gap: 5.2, glow: true, blink: C.blinkAt ? C.blinkAt(t, seed) : 0, look: f * 0.8 });
    }
    // dead wick poking through the cowl tip, a thin damp smoke
    if (C && C.wick) {
      const tip = C.wick(ctx, X(5 + L), Y(-62 + by), { len: 6, bend: -f * 1.6 });
      if (!dead && C.pallSmoke) C.pallSmoke(ctx, tip[0], tip[1], t, { count: 3, height: 30, alpha: 0.22, seed, size: 4 });
    }
    if (!dead) { drip(ctx, X(10 + L), Y(-58 + by), 22, t, seed, 1.4); drip(ctx, X(-15 + sway), Y(-6), 8, t, seed + 9, 1.1); }
    if (!behind) drawStaff();
    // near arm: a sodden sleeve to the hand on the staff
    const sh = { x: 3 + L * 0.7, y: -39 + by };
    const d = Math.hypot(hand.x - sh.x, hand.y - sh.y) || 1;
    const el = { x: (sh.x + hand.x) / 2 - 3, y: (sh.y + hand.y) / 2 + Math.max(2, 22 - d) * 0.5 };
    stroke([sh, el, hand], 11, NV.outline);
    stroke([sh, el, { x: hand.x - (hand.x - el.x) * 0.2, y: hand.y - (hand.y - el.y) * 0.2 }], 7.5, dead ? '#2c3d42' : AC.robeHi);
    ctx.fillStyle = NV.outline; ctx.beginPath(); ctx.arc(X(hand.x), Y(hand.y), 4.8, 0, TAU); ctx.fill();
    ctx.fillStyle = NV.wax; ctx.beginPath(); ctx.arc(X(hand.x), Y(hand.y), 3.4, 0, TAU); ctx.fill();
  }

  /** The acolyte's flung lantern-flame: an arcing gold flame that gutters out in a hiss of embers. */
  class AcolyteFlame extends G.Projectile {
    update(dt) {
      super.update(dt);
      if (!this.dead && Math.random() < dt * 24) burst('ember', this.cx, this.cy, { count: 1, color: NV.gold, speed: 40 });
    }
    draw(ctx, t) {
      const a = Math.atan2(this.vy, this.vx);
      for (let i = 0; i < this.trail.length; i += 2) glow(ctx, this.trail[i], this.trail[i + 1], this.r * (0.8 + i / this.trail.length), NV.gold, 0.1 + 0.18 * i / this.trail.length);
      glow(ctx, this.cx, this.cy, this.r * 4, NV.gold, 0.5);
      ctx.save();
      ctx.translate(this.cx, this.cy); ctx.rotate(a - Math.PI / 2);
      flame(ctx, 0, this.r * 0.7, 26, 'gold', t, this.seed, { noGlow: true });
      ctx.restore();
      ctx.fillStyle = NV.goldHot;
      ctx.beginPath(); ctx.arc(this.cx, this.cy, this.r * 0.55, 0, TAU); ctx.fill();
    }
    burstFx(why) {
      if (why === 'expire') return super.burstFx(why);
      burst('flash', this.cx, this.cy, { r: 30, color: NV.gold, life: 0.12 });
      burst('ember', this.cx, this.cy, { count: 9, color: NV.gold, speed: 220, angle: -Math.PI / 2, spread: 2.4 });
      burst('smoke', this.cx, this.cy, { count: 2, color: '#5f6a70', alpha: 0.35 });
      G.sfxAt('flame_hiss', this.cx, { vol: 0.6 });
    }
  }
  if (G.registerProjectile) G.registerProjectile('acolyte_flame', AcolyteFlame, { r: 8, gravity: 1100, life: 3, color: NV.gold, damage: 1, destroyable: true });
  G.registerEnemy('drowned_acolyte', DrownedAcolyte);

  // ==================================================================================================================
  // rain_jelly
  // ==================================================================================================================
  const RING_N = 8;
  class RainJelly extends G.Enemy {
    constructor(props) {
      super(props, {
        hp: 30, w: 34, h: 34,
        flying: true, gravity: 0,
        cinders: [4, 6],
        weight: 0.6,
        sight: 8.5 * TILE,
        colors: { body: '#7fbfcc', dark: '#3d6f7c', hit: '#e6fbff', smoke: '#9cc8d2', puddle: '#4f8ea0', tele: '#d8f4ff' },
        light: { r: 74, color: '#9fe0ee', intensity: 0.3 },
        puddleW: 20, meltTime: 0.45,
      });
      this.swell = 0;
      this.pulse = Math.random() * TAU;
      this.ringOff = Math.random() < 0.5 ? 0 : Math.PI / RING_N;
      this.lostT = 0;
      this.look = { x: 0, y: 0 };
    }
    init() { super.init(); this.setState('drift'); this.cooldown('ring', rnd(1.2, 2.2)); }
    leash() { return propTiles(this, 'leash', 7); }
    sees(p) { return this.canSee(p) && Math.abs(pCenter(p).x - this.home.x) < this.leash() + 6 * TILE; }
    think(dt) {
      const p = this.player;
      let swellT = 0;
      switch (this.state) {
        case 'drift': {
          const h = keepOut(this, this.home.x, this.home.y);
          this.hover(h.x, h.y, dt, { amp: 16, freq: 0.32, speed: 38 });
          if (this.stateTime > 0.3 && this.sees(p)) this.setState('follow');
          break;
        }
        case 'follow': {
          if (!this.targetable(p)) { this.setState('drift'); break; }
          if (this.canSee(p, this.sight * 1.3)) this.lostT = 0; else this.lostT += dt;
          if (this.lostT > 2.5) { this.setState('drift'); break; }
          const pc = pCenter(p), Lr = this.leash();
          const side = this.cx > pc.x ? 1 : -1;
          const tx = clamp(pc.x + side * 2.6 * TILE, this.home.x - Lr, this.home.x + Lr);
          const ty = clamp(pc.y - 2.8 * TILE, this.home.y - Lr * 0.6, this.home.y + Lr * 0.6);
          const k = keepOut(this, tx, ty);
          this.flyTo(k.x, k.y + this.bob(10, 0.45), 44, dt, { accel: 170, arrive: 60 });
          if (this.ready('ring') && this.dist() < 8 * TILE && !playerInZone(this) && this.canSee(p)) this.setState('swell');
          break;
        }
        case 'swell': {                                        // TELEGRAPH: inflates, droplets bead on the rim
          this.vx *= Math.max(0, 1 - 5 * dt); this.vy *= Math.max(0, 1 - 5 * dt);
          if (this.once('tele')) this.stateData.w = this.telegraph(0.62, { x: this.cx, y: this.cy - 2, shake: 1.2, color: '#d8f4ff', sound: 'jelly_swell', vol: 0.8 });
          const w = this.stateData.w;
          swellT = this.stateTime < w ? clamp(this.stateTime / w, 0, 1) : -0.45 * Math.max(0, 1 - (this.stateTime - w) / 0.45);
          if (this.at(w)) this.fireRing();
          if (this.stateTime > w + 0.75) { this.cooldown('ring', rnd(3, 4)); this.setState(this.targetable(p) ? 'follow' : 'drift'); }
          break;
        }
        default: this.setState('drift');
      }
      this.swell = this.is('swell') ? swellT : toward(this.swell, 0, dt * 3);
      this.pulse += dt * (this.is('swell') ? 0.6 : 2.3);
      if (this.targetable(p)) {
        const pc = pCenter(p), d = Math.hypot(pc.x - this.cx, pc.y - this.cy) || 1;
        this.look.x = lerp(this.look.x, (pc.x - this.cx) / d, Math.min(1, dt * 4)); this.look.y = lerp(this.look.y, (pc.y - this.cy) / d, Math.min(1, dt * 4));
      }
      // far from home (knocked away / chased too far): drift back
      if (this.home && Math.hypot(this.cx - this.home.x, this.cy - this.home.y) > this.leash() + 3 * TILE && this.is('follow')) this.setState('drift');
      this.cfg.light.intensity = 0.3 + Math.max(0, this.swell) * 0.35;
    }
    ringPoint(i, s) {
      const a = this.ringOff + i * TAU / RING_N, R = 17 * (1 + 0.3 * s);
      return { x: this.cx + Math.cos(a) * R, y: this.cy - 2 + Math.sin(a) * R * 0.85, a };
    }
    fireRing() {
      for (let i = 0; i < RING_N; i++) {
        const q = this.ringPoint(i, 1);
        this.fire('jelly_drop', { x: q.x, y: q.y, vx: Math.cos(q.a) * 165, vy: Math.sin(q.a) * 165, destroyable: true, sound: false });
      }
      this.ringOff = this.ringOff ? 0 : Math.PI / RING_N;
      G.sfxAt('jelly_burst', this.cx, { vol: 0.9 });
      burst('splash', this.cx, this.cy, { count: 10, color: NV.water, speed: 160 });
      burst('flash', this.cx, this.cy - 2, { r: 34, color: '#cdeff6', life: 0.1 });
    }
    drawBounds() { return { x: this.x - 40, y: this.y - 34, w: this.w + 80, h: this.h + 84 }; }
    drawBody(ctx, t) { drawJelly(ctx, this.cx, this.cy - 2, t, this, false); }
    drawCorpse(ctx, t) { drawJelly(ctx, this.cx, this.cy - 2, t, this, true); }
  }

  function drawJelly(ctx, x, y, t, e, dead) {
    const seed = e.seed || 0;
    const s = dead ? -0.5 : (e.swell || 0);
    const pul = dead ? 0 : Math.sin(e.pulse || 0);
    const sx = 1 + Math.max(0, s) * 0.32 - Math.min(0, s) * 0.18, sy = 1 + Math.max(0, s) * 0.3 + Math.min(0, s) * 0.3;
    const rx = 19 * (1 + 0.07 * pul) * sx, ry = 15 * (1 - 0.08 * pul) * sy;
    const rimY = y + ry * 0.38, topY = y - ry;
    ctx.lineCap = 'round'; ctx.lineJoin = 'round';
    // tentacles (behind the bell): thin trailing threads with droplets at their tips
    for (let i = 0; i < 6; i++) {
      const bx = x + (-0.78 + i * 0.312) * rx, len = (dead ? 10 : 20) + h01(i, seed) * 16 + Math.max(0, -pul) * 4;
      const w1 = Math.sin(t * 2.1 + i * 1.3 + seed) * 4.5, w2 = Math.sin(t * 2.1 + i * 1.3 + seed - 1.4) * 6;
      ctx.strokeStyle = 'rgba(150,210,224,0.55)'; ctx.lineWidth = 1.6;
      ctx.beginPath(); ctx.moveTo(bx, rimY - 1); ctx.quadraticCurveTo(bx + w1, rimY + len * 0.5, bx + w2, rimY + len); ctx.stroke();
      ctx.fillStyle = 'rgba(214,244,250,0.75)';
      ctx.beginPath(); ctx.arc(bx + w2, rimY + len + 1, 1.5, 0, TAU); ctx.fill();
    }
    // two frilled oral arms
    for (let j = 0; j < 2; j++) {
      const bx = x + (j ? 4 : -4), len = (dead ? 8 : 18) + j * 4;
      ctx.strokeStyle = 'rgba(186,230,240,0.42)'; ctx.lineWidth = 4.2;
      ctx.beginPath(); ctx.moveTo(bx, rimY - 2);
      for (let k = 1; k <= 4; k++) ctx.lineTo(bx + Math.sin(t * 2.6 + k * 1.1 + j * 2 + seed) * 3.2, rimY - 2 + len * k / 4);
      ctx.stroke();
    }
    // inner glow + the pale heart-flame
    glow(ctx, x, y + 1, 30 + Math.max(0, s) * 26, '#9fe0ee', (dead ? 0.08 : 0.26) + Math.max(0, s) * 0.36);
    // bell
    const bell = new Path2D();
    bell.moveTo(x - rx, rimY);
    bell.bezierCurveTo(x - rx * 1.05, y - ry * 0.55, x - rx * 0.62, topY, x, topY);
    bell.bezierCurveTo(x + rx * 0.62, topY, x + rx * 1.05, y - ry * 0.55, x + rx, rimY);
    for (let i = 5; i >= 0; i--) {                                                               // scalloped margin
      const xa = x - rx + (i + 0.5) * (2 * rx / 6), xb = x - rx + i * (2 * rx / 6);
      bell.quadraticCurveTo(xa, rimY + 4.2 + Math.sin(t * 3 + i) * 0.8, xb, rimY);
    }
    bell.closePath();
    ctx.fillStyle = dead ? 'rgba(110,160,172,0.35)' : 'rgba(120,192,208,0.42)';
    ctx.fill(bell);
    ctx.save(); ctx.clip(bell);
    ctx.fillStyle = 'rgba(200,240,248,0.22)';
    ctx.beginPath(); ctx.ellipse(x, rimY + 2, rx * 0.8, ry * 0.42, 0, 0, TAU); ctx.fill();               // subumbrella
    ctx.fillStyle = 'rgba(236,252,255,0.32)';
    ctx.beginPath(); ctx.ellipse(x - rx * 0.36, topY + ry * 0.42, rx * 0.3, ry * 0.2, -0.5, 0, TAU); ctx.fill();
    // radial canals
    ctx.strokeStyle = 'rgba(210,244,250,0.22)'; ctx.lineWidth = 1;
    for (let i = 0; i < 4; i++) {
      const xx = x + (-0.6 + i * 0.4) * rx;
      ctx.beginPath(); ctx.moveTo(x, y - ry * 0.2); ctx.quadraticCurveTo(xx, y - ry * 0.5, xx * 1 + (xx - x) * 0.2, rimY); ctx.stroke();
    }
    ctx.restore();
    if (!dead) flame(ctx, x, y + 4, 9 + Math.max(0, s) * 7, 'pale', t, seed, { glow: 0.5 });
    else { ctx.fillStyle = 'rgba(80,90,100,0.6)'; ctx.beginPath(); ctx.arc(x, y + 3, 2.2, 0, TAU); ctx.fill(); }
    // outline + rim light
    ctx.strokeStyle = 'rgba(8,28,34,0.8)'; ctx.lineWidth = 1.8; ctx.stroke(bell);
    ctx.strokeStyle = 'rgba(226,248,252,0.75)'; ctx.lineWidth = 1.4;
    ctx.beginPath(); ctx.ellipse(x, y + ry * 0.05, rx * 0.93, ry * 0.95, 0, Math.PI * 1.08, Math.PI * 1.62); ctx.stroke();
    // eyes: two small dark beads with a glint, looking at the Wickling
    const lx = (e.look && e.look.x) || 0, ly = (e.look && e.look.y) || 0;
    for (const sgn of [-1, 1]) {
      const ex = x + sgn * 5.2 + lx * 2, ey = y - ry * 0.32 + ly * 1.5;
      if (dead) {
        ctx.strokeStyle = 'rgba(10,24,30,0.85)'; ctx.lineWidth = 1.3;
        ctx.beginPath(); ctx.moveTo(ex - 2, ey - 2); ctx.lineTo(ex + 2, ey + 2); ctx.moveTo(ex + 2, ey - 2); ctx.lineTo(ex - 2, ey + 2); ctx.stroke();
      } else {
        ctx.fillStyle = '#0b1c22'; ctx.beginPath(); ctx.ellipse(ex, ey, 2.4, 3, 0, 0, TAU); ctx.fill();
        ctx.fillStyle = '#f2fbff'; ctx.beginPath(); ctx.arc(ex - 0.8, ey - 1.1, 0.9, 0, TAU); ctx.fill();
      }
    }
    // beaded raindrops; during the swell the ring's droplets grow where they will fly
    ctx.fillStyle = 'rgba(236,252,255,0.8)';
    for (let i = 0; i < 3; i++) { const a = -2.4 + i * 0.75; ctx.beginPath(); ctx.arc(x + Math.cos(a) * rx * 0.8, y + Math.sin(a) * ry * 0.8, 1.2, 0, TAU); ctx.fill(); }
    if (!dead && s > 0) {
      for (let i = 0; i < RING_N; i++) {
        const a = (e.ringOff || 0) + i * TAU / RING_N, R = 17 * (1 + 0.3 * s);
        const px = x + Math.cos(a) * R, py = y + Math.sin(a) * R * 0.85, r = 1 + s * 3.6;
        glow(ctx, px, py, r * 3, '#cfefff', 0.35 * s);
        ctx.fillStyle = 'rgba(10,30,36,0.7)'; ctx.beginPath(); ctx.arc(px, py, r + 1, 0, TAU); ctx.fill();
        ctx.fillStyle = '#d9f5fb'; ctx.beginPath(); ctx.arc(px, py, r, 0, TAU); ctx.fill();
      }
    }
  }

  /** A rain droplet (rain_jelly's ring): small teardrop along its flight, splashes on stone. */
  class JellyDrop extends G.Projectile {
    draw(ctx, t) {
      void t;
      const a = Math.atan2(this.vy, this.vx), r = this.r;
      glow(ctx, this.cx, this.cy, r * 3, '#a8e4f0', 0.32);
      ctx.save(); ctx.translate(this.cx, this.cy); ctx.rotate(a);
      const p = new Path2D();
      p.moveTo(-r * 2.6, 0);
      p.quadraticCurveTo(-r * 0.6, -r * 1.05, r * 0.2, -r);
      p.arc(r * 0.2, 0, r, -Math.PI / 2, Math.PI / 2);
      p.quadraticCurveTo(-r * 0.6, r * 1.05, -r * 2.6, 0);
      ctx.fillStyle = 'rgba(8,30,38,0.85)'; ctx.lineWidth = 3; ctx.strokeStyle = 'rgba(8,30,38,0.85)'; ctx.stroke(p);
      ctx.fillStyle = 'rgba(150,214,230,0.92)'; ctx.fill(p);
      ctx.fillStyle = 'rgba(245,253,255,0.9)';
      ctx.beginPath(); ctx.ellipse(r * 0.35, -r * 0.4, r * 0.38, r * 0.24, 0, 0, TAU); ctx.fill();
      ctx.restore();
    }
    burstFx(why) {
      if (why === 'expire') { burst('splash', this.cx, this.cy, { count: 2, color: NV.water, speed: 60 }); return; }
      burst('splash', this.cx, this.cy, { count: 5, color: NV.water, speed: 140 });
      if (why !== 'terrain' || Math.random() < 0.3) G.sfxAt('drip_splat', this.cx, { vol: 0.5 });
    }
  }
  if (G.registerProjectile) G.registerProjectile('jelly_drop', JellyDrop, { r: 6, gravity: 90, life: 2.6, color: '#a8e4f0', damage: 1, destroyable: true });
  G.registerEnemy('rain_jelly', RainJelly);

  // ==================================================================================================================
  // bell_sentry
  // ==================================================================================================================
  const BS = {
    plate: '#3d5a54', plateDark: '#1f302c', plateHi: '#86ab9c', bronze: '#86703f', bronzeDark: '#4a3b22', bronzeHi: '#d8c084',
    verd: '#5d9a86', verdHi: '#8cc4ae', haft: '#3a2b20', haftHi: '#6a5034', iron: '#2a3034', ironHi: '#66757a', slit: '#05090b',
  };
  // Mallet poses: hand (hx, hy) feet-relative (facing right), mallet angle a (hand → head).
  const HPOSE = {
    rest: { hx: 21, hy: -30, a: 1.3, lean: 0 },
    raise: { hx: 12, hy: -86, a: -2.0, lean: -0.35 },
    strike: { hx: 34, hy: -62, a: -2.45, lean: 0.25 },
    dazed: { hx: 23, hy: -33, a: 1.05, lean: 0.12 },
  };
  const MALLET = 30;
  const BELL_PIVOT = -54;

  class BellSentry extends G.Enemy {
    constructor(props) {
      super(props, {
        hp: 45, w: 44, h: 76,
        cinders: [6, 10],
        weight: 12, knockback: 0, hitStun: 0,
        sight: 9 * TILE,
        colors: { body: BS.plate, dark: BS.plateDark, hit: '#e8f0ea', smoke: '#5c6a66', puddle: '#46524f', tele: NV.tele },
        puddleW: 30,
      });
      this.pose = Object.assign({}, HPOSE.rest);
      this.ringT = -1;
      this.bellA = 0; this.bellV = 0;
      this.hum = 0;
    }
    init() { super.init(); this.setState('watch'); this.cooldown('ring', 0.6); }
    near(p) {
      if (!this.targetable(p)) return false;
      const pc = pCenter(p), dx = pc.x - this.cx, dy = pc.y - this.cy;
      const rx = propTiles(this, 'range', 7.5);
      return Math.abs(dx) < rx && dy > -3.5 * TILE && dy < 2.5 * TILE && this.canSee(p, rx + TILE);
    }
    bellCenter() { return { x: this.cx + Math.sin(this.bellA) * 18, y: this.y + this.h + BELL_PIVOT - 18 }; }
    think(dt) {
      const p = this.player;
      let target = HPOSE.rest, rate = 5;
      this.stop();
      switch (this.state) {
        case 'watch':
          if (this.stateTime > 0.25 && this.near(p)) {
            this.face(p);
            if (this.ready('ring') && !playerInZone(this)) this.setState('ring');
          }
          break;
        case 'ring': {                                         // TELEGRAPH: heaves the mallet high over its bell
          target = HPOSE.raise; rate = 6;
          if (this.once('tele')) { const b = this.bellCenter(); this.stateData.w = this.telegraph(0.62, { x: b.x, y: b.y, shake: 1.2, color: NV.tele }); }
          const w = this.stateData.w;
          this.hum = this.stateTime < w ? this.stateTime / w : 0;
          if (this.stateTime >= w) { target = HPOSE.strike; rate = 34; }
          if (this.at(w + 0.05)) this.toll();
          if (this.stateTime > w + 0.14) { target = HPOSE.dazed; rate = 4; }
          if (this.stateTime > w + 1.1) { this.cooldown('ring', rnd(1.5, 2.1)); this.setState('watch'); }
          break;
        }
        default: this.setState('watch');
      }
      const P = this.pose, k = Math.min(1, dt * rate);
      for (const key of ['hx', 'hy', 'a', 'lean']) P[key] = lerp(P[key], target[key], k);
      // bell head on a spring (idle sway; rings after the toll)
      const idle = Math.sin(this.t * 0.9 + this.seed) * 0.03;
      this.bellV += (-(this.bellA - idle) * 90 - this.bellV * 3.2) * dt;
      this.bellA += this.bellV * dt;
      if (this.ringT >= 0) { this.ringT += dt; if (this.ringT > 0.9) this.ringT = -1; }
    }
    toll() {
      this.ringT = 0;
      this.bellV += -this.facing * 2.6;
      const b = this.bellCenter();
      G.sfxAt('sentry_bell', this.cx, { vol: 1 });
      shake(4, 0.25);
      burst('flash', b.x, b.y, { r: 46, color: NV.tele, life: 0.14 });
      burst('spark', b.x + this.facing * 14, b.y, { count: 8, color: NV.goldHot, speed: 260 });
      burst('ring', b.x, b.y, { color: NV.tele });
      const fy = this.y + this.h;
      for (const d of [-1, 1]) {
        G.spawnProjectile(this.room, 'bell_wave', { x: this.cx + d * (this.w / 2 + 6), y: fy, dir: d, speed: 300, owner: this });
        burst('splash', this.cx + d * (this.w / 2 + 6), fy - 2, { count: 6, color: NV.water, speed: 180, angle: -Math.PI / 2 + d * 0.5, spread: 0.8 });
      }
    }
    drawBounds() { return { x: this.x - 70, y: this.y - 64, w: this.w + 140, h: this.h + 70 }; }
    drawBody(ctx, t) { drawSentry(ctx, this, t, false); }
    drawCorpse(ctx, t) { drawSentry(ctx, this, t, true); }
  }

  function drawSentry(ctx, e, t, dead) {
    const C = CH();
    const f = e.facing, fx = e.cx, fy = e.y + e.h, seed = e.seed || 0;
    const P = e.pose;
    const L = P.lean * 5;
    const { X, Y, stroke, limb } = painter(ctx, fx, fy, f);
    ctx.lineCap = 'round'; ctx.lineJoin = 'round';
    if (C && C.shadow) C.shadow(ctx, fx, fy, 27, 0.45);
    const shapeOf = (path, fill, box, rim) => {
      if (C && C.shape) C.shape(ctx, path, { fill, box, light: -1, rim: rim || NV.rim, rimWidth: 2, shade: 0.45, hi: 0.1 });
      else { ctx.fillStyle = fill; ctx.fill(path); }
    };
    // far arm: a grey wax arm in a plated vambrace, hanging, fist clenched
    limb({ x: -15 + L * 0.5, y: -49 }, { x: -20, y: -24 }, 8, NV.waxShade, BS.plateDark, -1);
    // legs: stubby plated greaves with broad sabatons
    for (const [lx, col] of [[-10, BS.plateDark], [10, BS.plate]]) {
      const lp = new Path2D();
      lp.moveTo(X(lx - 6), Y(-18)); lp.lineTo(X(lx + 6), Y(-18)); lp.lineTo(X(lx + 6.5), Y(-5)); lp.lineTo(X(lx + 11), Y(-3));
      lp.quadraticCurveTo(X(lx + 12), Y(0.5), X(lx + 8), Y(0.5)); lp.lineTo(X(lx - 7), Y(0.5)); lp.lineTo(X(lx - 7), Y(-5)); lp.closePath();
      shapeOf(lp, col, [X(lx - 8), fy - 18, X(lx + 12), fy]);
      ctx.strokeStyle = 'rgba(8,14,14,0.6)'; ctx.lineWidth = 1.2;
      ctx.beginPath(); ctx.moveTo(X(lx - 6), Y(-10)); ctx.lineTo(X(lx + 6), Y(-10)); ctx.stroke();
    }
    // tassets (plate skirt)
    const tp = new Path2D();
    tp.moveTo(X(-17), Y(-30)); tp.lineTo(X(17), Y(-30)); tp.lineTo(X(20), Y(-15)); tp.lineTo(X(-20), Y(-15)); tp.closePath();
    shapeOf(tp, BS.plateDark, [X(-20), fy - 30, X(20), fy - 15]);
    ctx.strokeStyle = 'rgba(134,171,156,0.45)'; ctx.lineWidth = 1.2;
    for (const yy of [-25, -20]) { ctx.beginPath(); ctx.moveTo(X(-18), Y(yy)); ctx.lineTo(X(18), Y(yy)); ctx.stroke(); }
    // cuirass: a broad barrel
    const cp = new Path2D();
    cp.moveTo(X(-16 + L * 0.3), Y(-28));
    cp.bezierCurveTo(X(-22 + L * 0.5), Y(-36), X(-24 + L), Y(-48), X(-20 + L), Y(-55));
    cp.lineTo(X(20 + L), Y(-55));
    cp.bezierCurveTo(X(24 + L), Y(-48), X(22 + L * 0.5), Y(-36), X(16 + L * 0.3), Y(-28));
    cp.quadraticCurveTo(X(0), Y(-24), X(-16 + L * 0.3), Y(-28));
    cp.closePath();
    shapeOf(cp, dead ? '#33473f' : BS.plate, [X(-24), fy - 56, X(24), fy - 24]);
    ctx.save(); ctx.clip(cp);
    ctx.strokeStyle = 'rgba(10,18,16,0.55)'; ctx.lineWidth = 1.5;                       // centre ridge
    ctx.beginPath(); ctx.moveTo(X(2 + L), Y(-55)); ctx.quadraticCurveTo(X(4 + L * 0.6), Y(-40), X(2), Y(-26)); ctx.stroke();
    ctx.fillStyle = 'rgba(93,154,134,0.45)';                                          // verdigris bloom
    ctx.beginPath(); ctx.ellipse(X(-10 + L), Y(-36), 7, 10, 0.3, 0, TAU); ctx.fill();
    ctx.fillStyle = 'rgba(12,22,20,0.4)';                                             // water stain runs
    for (let i = 0; i < 3; i++) ctx.fillRect(Math.min(X(-14 + i * 11 + L), X(-12 + i * 11 + L)), fy - 52 + i * 2, 2, 18 + h01(i, seed) * 10);
    ctx.restore();
    // gold flame emblem on the breast
    ctx.fillStyle = dead ? '#6c5c3a' : '#c9a95a';
    ctx.beginPath(); ctx.moveTo(X(9 + L), Y(-47)); ctx.quadraticCurveTo(X(13 + L), Y(-41), X(9 + L), Y(-37)); ctx.quadraticCurveTo(X(5 + L), Y(-41), X(9 + L), Y(-47)); ctx.fill();
    // rivets
    ctx.fillStyle = BS.plateHi;
    for (const [rx, ry] of [[-16, -50], [16, -50], [-14, -32], [14, -32]]) { ctx.beginPath(); ctx.arc(X(rx + L * 0.7), Y(ry), 1.3, 0, TAU); ctx.fill(); }
    // waxen neck: grey wax swelling under the bell, dripping onto the plate
    ctx.fillStyle = NV.outline; ctx.beginPath(); ctx.ellipse(X(L), Y(BELL_PIVOT - 1), 13, 5.5, 0, 0, TAU); ctx.fill();
    ctx.fillStyle = NV.wax; ctx.beginPath(); ctx.ellipse(X(L), Y(BELL_PIVOT - 1), 11.5, 4.2, 0, 0, TAU); ctx.fill();
    ctx.fillStyle = NV.wax;
    for (const [dx, len] of [[-7, 6], [2, 9], [8, 5]]) { ctx.beginPath(); ctx.moveTo(X(L + dx - 1.6), Y(BELL_PIVOT)); ctx.lineTo(X(L + dx + 1.6), Y(BELL_PIVOT)); ctx.lineTo(X(L + dx), Y(BELL_PIVOT + len)); ctx.closePath(); ctx.fill(); }
    // pauldrons
    for (const [px, col] of [[-19, BS.plateDark], [19, BS.plate]]) {
      const pp = new Path2D();
      pp.moveTo(X(px + L - 11), Y(-46)); pp.quadraticCurveTo(X(px + L - 11), Y(-60), X(px + L), Y(-60)); pp.quadraticCurveTo(X(px + L + 11), Y(-60), X(px + L + 11), Y(-46)); pp.closePath();
      shapeOf(pp, col, [X(px + L - 11), fy - 60, X(px + L + 11), fy - 46]);
      ctx.strokeStyle = 'rgba(8,14,14,0.6)'; ctx.lineWidth = 1.2;
      ctx.beginPath(); ctx.moveTo(X(px + L - 10), Y(-51)); ctx.quadraticCurveTo(X(px + L), Y(-55), X(px + L + 10), Y(-51)); ctx.stroke();
    }
    // ---- the bell head (pivot on the neck; sways and rings)
    ctx.save();
    ctx.translate(X(L), Y(BELL_PIVOT));
    ctx.rotate(e.bellA || 0);
    ctx.scale(f, 1);
    const bp = new Path2D();
    bp.moveTo(-18, 0);
    bp.quadraticCurveTo(-13.5, -3, -12.5, -12);
    bp.bezierCurveTo(-12.5, -24, -11.5, -32, 0, -33);
    bp.bezierCurveTo(11.5, -32, 12.5, -24, 12.5, -12);
    bp.quadraticCurveTo(13.5, -3, 18, 0);
    bp.quadraticCurveTo(0, 3.5, -18, 0);
    bp.closePath();
    // canon loop on the crown
    ctx.strokeStyle = NV.outline; ctx.lineWidth = 5.5; ctx.beginPath(); ctx.arc(0, -36, 5, Math.PI * 0.95, Math.PI * 2.05); ctx.stroke();
    ctx.strokeStyle = BS.bronzeDark; ctx.lineWidth = 3; ctx.stroke();
    if (C && C.shape) C.shape(ctx, bp, { fill: dead ? '#5a4c30' : BS.bronze, box: [-18, -33, 18, 3], light: -f, rim: '#f0d890', rimWidth: 2.2, shade: 0.5, hi: 0.18 });
    else { ctx.fillStyle = BS.bronze; ctx.fill(bp); }
    ctx.save(); ctx.clip(bp);
    ctx.fillStyle = 'rgba(93,154,134,0.75)';                                          // verdigris patches
    ctx.beginPath(); ctx.ellipse(-8, -26, 6, 5, 0.4, 0, TAU); ctx.fill();
    ctx.beginPath(); ctx.ellipse(10, -5, 8, 3.2, 0, 0, TAU); ctx.fill();
    ctx.beginPath(); ctx.ellipse(-13, -6, 4, 6, 0, 0, TAU); ctx.fill();
    ctx.fillStyle = 'rgba(140,196,174,0.5)';
    ctx.beginPath(); ctx.ellipse(-9, -27, 2.5, 2, 0, 0, TAU); ctx.fill();
    ctx.strokeStyle = 'rgba(40,28,14,0.75)'; ctx.lineWidth = 1.6;                      // cast bands
    ctx.beginPath(); ctx.moveTo(-16, -4); ctx.quadraticCurveTo(0, -1.5, 16, -4); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(-12.5, -25); ctx.quadraticCurveTo(0, -23, 12.5, -25); ctx.stroke();
    ctx.strokeStyle = 'rgba(232,206,140,0.45)'; ctx.lineWidth = 1;
    ctx.beginPath(); ctx.moveTo(-16, -5.6); ctx.quadraticCurveTo(0, -3, 16, -5.6); ctx.stroke();
    ctx.restore();
    // the crack, from the lip up the back
    ctx.strokeStyle = 'rgba(14,10,6,0.9)'; ctx.lineWidth = 1.4;
    ctx.beginPath(); ctx.moveTo(-14, 0); ctx.lineTo(-12, -6); ctx.lineTo(-13.5, -10); ctx.lineTo(-10.5, -16); ctx.stroke();
    // visor slit with pinprick eyes (looking out of the bell)
    ctx.fillStyle = NV.outline;
    ctx.beginPath(); ctx.moveTo(-5, -17); ctx.lineTo(12.5, -18); ctx.lineTo(12.5, -12.5); ctx.lineTo(-5, -12); ctx.closePath(); ctx.fill();
    ctx.fillStyle = BS.slit;
    ctx.beginPath(); ctx.moveTo(-4, -16.2); ctx.lineTo(12, -17); ctx.lineTo(12, -13.4); ctx.lineTo(-4, -12.9); ctx.closePath(); ctx.fill();
    if (!dead) {
      const tele = e.telegraphing || e.ringT >= 0;
      const ec = tele ? '#fff2c0' : NV.waxHi;
      glow(ctx, 5, -14.8, 9, tele ? NV.tele : '#dfe8f4', tele ? 0.7 : 0.4);
      ctx.fillStyle = ec;
      ctx.beginPath(); ctx.arc(2.5, -14.8, 1.5, 0, TAU); ctx.arc(8.5, -15, 1.5, 0, TAU); ctx.fill();
    }
    // toll: the bronze flashes and rings radiate
    if (!dead && e.ringT >= 0) {
      const k = e.ringT / 0.9;
      ctx.globalAlpha = Math.max(0, 1 - k * 2.2);
      ctx.fillStyle = 'rgba(255,236,170,0.6)'; ctx.fill(bp);
      ctx.globalAlpha = 1;
    } else if (!dead && e.hum > 0) {
      ctx.globalAlpha = e.hum * 0.4; ctx.fillStyle = 'rgba(255,230,160,0.5)'; ctx.fill(bp); ctx.globalAlpha = 1;
    }
    ctx.restore();
    if (!dead && e.ringT >= 0 && C && C.ring) {
      const b = { x: X(L) + Math.sin(e.bellA || 0) * 16, y: Y(BELL_PIVOT - 16) };
      const k = e.ringT / 0.9;
      C.ring(ctx, b.x, b.y, 24 + k * 120, k, { width: 6, color: '#f2d890' });
      if (k > 0.15) C.ring(ctx, b.x, b.y, 18 + (k - 0.15) * 110, (k - 0.15) / 0.85, { width: 4, color: '#cfe8ec' });
    }
    // near arm + mallet
    const hand = { x: P.hx + L, y: P.hy };
    const dir = { x: Math.cos(P.a), y: Math.sin(P.a) };
    const head = { x: hand.x + dir.x * MALLET, y: hand.y + dir.y * MALLET };
    const butt = { x: hand.x - dir.x * 7, y: hand.y - dir.y * 7 };
    stroke([butt, head], 6.5, NV.outline);
    stroke([butt, head], 3.8, BS.haft);
    stroke([{ x: butt.x + 1, y: butt.y - 0.8 }, { x: head.x - dir.x * 4, y: head.y - dir.y * 4 - 0.8 }], 1.1, BS.haftHi);
    ctx.save(); ctx.translate(X(head.x), Y(head.y)); ctx.rotate(f > 0 ? P.a : Math.PI - P.a);
    ctx.fillStyle = NV.outline; ctx.fillRect(-6.5, -10.5, 13, 21);
    ctx.fillStyle = BS.iron; ctx.fillRect(-5, -9, 10, 18);
    ctx.fillStyle = BS.bronze; ctx.fillRect(-5, -9, 10, 3); ctx.fillRect(-5, 6, 10, 3);
    ctx.fillStyle = BS.ironHi; ctx.fillRect(-4, -5.5, 2, 11);
    ctx.restore();
    limb({ x: 15 + L, y: -50 }, hand, 9, NV.wax, BS.plate, 1);
    ctx.fillStyle = NV.outline; ctx.beginPath(); ctx.arc(X(hand.x), Y(hand.y), 5.6, 0, TAU); ctx.fill();
    ctx.fillStyle = BS.plateDark; ctx.beginPath(); ctx.arc(X(hand.x), Y(hand.y), 4.2, 0, TAU); ctx.fill();
    if (!dead) { drip(ctx, X(-20 + L), Y(-46), 30, t, seed, 1.6); drip(ctx, X(12 + L), Y(-28), 18, t, seed + 5, 1.2); }
  }

  /** The sentry's toll: a crest of water and gold sound-rings racing along the floor (a G.Projectile.Wave). */
  const WaveBase = (G.Projectile && G.Projectile.Wave) || G.Projectile;
  class BellWave extends WaveBase {
    constructor(props) {
      const p = Object.assign({ w: 32, h: 40 }, props || {});
      super(p);
      if (!p.color) this.color = '#f2d890';
    }
    update(dt) {
      super.update(dt);
      if (!this.dead && Math.random() < dt * 14) burst('splash', this.cx, this.y + this.h - 2, { count: 1, color: NV.water, speed: 120, angle: -Math.PI / 2 - this.dir * 0.5, spread: 0.6 });
    }
    draw(ctx, t) {
      const bx = this.cx, by = this.y + this.h, d = this.dir || 1, H = this.h, W = this.w;
      const life = clamp(1 - Math.max(0, this.age - this.life + 0.3) / 0.3, 0, 1);
      const flick = 0.9 + 0.1 * Math.sin(t * 30 + this.seed);
      glow(ctx, bx, by - H * 0.4, H * 1.15, '#f2d890', 0.4 * life);
      ctx.save();
      ctx.globalAlpha *= life;
      // water crest: a curling sheet leaning into the direction of travel
      const crest = (k, col) => {
        const h = H * k * flick;
        ctx.fillStyle = col;
        ctx.beginPath();
        ctx.moveTo(bx - d * W * 1.0, by);
        ctx.quadraticCurveTo(bx - d * W * 0.3, by - h * 0.25, bx + d * W * 0.05, by - h * 0.85);
        ctx.quadraticCurveTo(bx + d * W * 0.3, by - h * 1.05, bx + d * W * 0.55, by - h * 0.7);
        ctx.quadraticCurveTo(bx + d * W * 0.38, by - h * 0.62, bx + d * W * 0.42, by - h * 0.42);
        ctx.quadraticCurveTo(bx + d * W * 0.55, by - h * 0.15, bx + d * W * 0.62, by);
        ctx.closePath(); ctx.fill();
      };
      crest(1, 'rgba(8,30,36,0.55)');
      crest(0.94, 'rgba(120,196,214,0.8)');
      crest(0.62, 'rgba(226,246,250,0.85)');
      // gold sound rings ahead of the crest
      ctx.strokeStyle = '#ffe6a0'; ctx.lineCap = 'round';
      for (let i = 0; i < 3; i++) {
        const ph = ((t * 3 + i / 3 + this.seed) % 1);
        ctx.globalAlpha = life * (1 - ph) * 0.9;
        ctx.lineWidth = 2.6 - ph;
        const r = H * (0.35 + ph * 0.5);
        const a0 = d > 0 ? -1.0 : Math.PI - 0.15, a1 = d > 0 ? 0.15 : Math.PI + 1.0;
        ctx.beginPath(); ctx.arc(bx + d * W * 0.1, by - 2, r, a0, a1); ctx.stroke();
      }
      ctx.globalAlpha = life * 0.8;
      ctx.fillStyle = '#e2f6fa';
      ctx.fillRect(bx - W * 1.1, by - 2, W * 2.2, 2);
      ctx.restore();
    }
    burstFx(why) {
      burst('splash', this.cx, this.y + this.h - 6, { count: 6, color: NV.water, speed: 150 });
      if (why !== 'expire') burst('flash', this.cx, this.y + this.h * 0.5, { r: 24, color: '#f2d890', life: 0.1 });
    }
  }
  if (G.registerProjectile) G.registerProjectile('bell_wave', BellWave, { r: 14, gravity: 0, life: 3.2, color: '#f2d890', damage: 1 });
  G.registerEnemy('bell_sentry', BellSentry);

  // ==================================================================================================================
  // drowned_knight
  // ==================================================================================================================
  const DK = {
    plate: '#4c5e62', plateDark: '#263236', plateHi: '#9db4b6', cloth: '#25474a', clothDark: '#163033', clothHi: '#3f6b6c',
    gold: '#c9a95a', goldHi: '#f2d890', shield: '#2c4c52', shieldHi: '#4d7478', shieldRim: '#1a2326', shieldRimHi: '#8a9fa1',
    blade: '#aebfc2', bladeHi: '#eef6f6', hilt: '#5a4630', plume: '#244038', plumeHi: '#3f6650', slit: '#04080a',
  };
  // Sword poses: hand (sx, sy) feet-relative (facing right), blade angle a; sh = shield raised (1) .. lowered (0).
  const KPOSE = {
    guard: { sx: 4, sy: -44, a: -0.62, sh: 1, lean: 0 },
    windup: { sx: -12, sy: -66, a: 0.2, sh: 0, lean: -0.5 },
    stab: { sx: 27, sy: -41, a: 0, sh: 0.1, lean: 0.6 },
    pull: { sx: -6, sy: -50, a: 0.1, sh: 0.1, lean: -0.25 },
    recover: { sx: 12, sy: -27, a: 0.72, sh: 0, lean: 0.35 },
  };
  const BLADE = 46;
  const GUARD_STATES = { patrol: 1, notice: 1, engage: 1 };

  class DrownedKnight extends G.Enemy {
    constructor(props) {
      super(props, {
        hp: 54, w: 40, h: 68,
        cinders: [10, 16],
        weight: 3, knockback: 300,
        sight: 8 * TILE,
        colors: { body: DK.plate, dark: DK.plateDark, hit: '#e8f2f2', smoke: '#56666a', puddle: '#3e4c50', tele: NV.tele },
        puddleW: 30,
      });
      this.pose = Object.assign({}, KPOSE.guard);
      this.walk = Math.random() * TAU;
      this.behindT = 0; this.quickTurn = false;
      this.shieldFlash = 0; this.blocks = 0; this.blockT = 0;
      this.lostT = 0; this.combo = 2;
    }
    init() { super.init(); this.setState('patrol'); this.cooldown('stab', 0.5); }
    beat() { return propTiles(this, 'range', 4); }
    canStep(dir) { return canStep(this, dir, this.beat()); }
    sees(p) {
      if (!this.canSee(p)) return false;
      const dy = pCenter(p).y - this.cy;
      return dy > -4 * TILE && dy < 3 * TILE;
    }
    /** Shield raised and facing the attacker? (guarding states only; pogo/plunge/spells always land). */
    guarding() { return !this.dying && !!GUARD_STATES[this.state]; }
    modifyDamage(dmg, hit) {
      if (!this.guarding() || !hit || hit.kind !== 'nail') return dmg;
      if (hit.pogo || (hit.dir && hit.dir.y > 0.5)) return dmg;
      const src = hit.source;
      if (!src) return dmg;
      const sx = src.x + (src.w || 0) / 2, dx = sx - this.cx;
      if (Math.abs(dx) < 6 || Math.abs(dx) > 4 * TILE) return dmg;          // a blow struck at it, within reach
      if (Math.sign(dx) !== this.facing) return dmg;                         // from behind
      const sy = src.y + (src.h || 0) / 2;
      if (sy < this.y - 0.6 * TILE) return dmg;                              // from above the shield's rim
      return 0;
    }
    deflect(hit, src) {
      void src;
      const f = this.facing, sx = this.cx + f * (this.w / 2 + 6), sy = this.y + this.h * 0.45;
      burst('spark', sx, sy, { count: 11, color: '#fff2c8', speed: 420, angle: f > 0 ? 0 : Math.PI, spread: 1.7 });
      burst('flash', sx, sy, { r: 30, color: '#e8f6ff', life: 0.09 });
      G.sfxAt('shield_clang', this.cx, { vol: 1 });
      this.shieldFlash = 0.2;
      this.blocks++; this.blockT = 1.6;
      // the Wickling is knocked back from the shield (side slashes recoil anyway; this also covers up-slashes and Steadfast)
      const pl = G.game && G.game.player;
      if (pl && pl.motor && G.PlayerMotor && G.PlayerMotor.recoil && hit && hit.source === pl) G.PlayerMotor.recoil(pl.motor, f, false);
      if (this.blocks >= 2 && this.is('engage')) this.cooldown('stab', 0);   // riposte after a second blocked blow
    }
    onHurt(hit) {
      const src = hit && hit.source;
      if (src && this.guarding()) {
        const dx = (src.x + (src.w || 0) / 2) - this.cx;
        if (Math.sign(dx) === -this.facing) this.quickTurn = true;
      }
    }
    tipLocal() { const P = this.pose; return { x: P.sx + Math.cos(P.a) * BLADE, y: P.sy + Math.sin(P.a) * BLADE }; }
    tipWorld() { const q = this.tipLocal(); return { x: this.cx + this.facing * q.x, y: this.y + this.h + q.y }; }
    think(dt) {
      const p = this.player;
      let target = KPOSE.guard, rate = 7;
      if (this.shieldFlash > 0) this.shieldFlash -= dt;
      if (this.blockT > 0) { this.blockT -= dt; if (this.blockT <= 0) this.blocks = 0; }
      switch (this.state) {
        case 'patrol': {
          if (this.grounded && !this.canStep(this.facing) && !this.blockedAhead(this.facing)) { this.facing = -this.facing; this.vx = 0; }
          this.patrol(28, { range: this.beat(), pause: 1.0 });
          if (this.stateTime > 0.4 && this.sees(p)) this.setState('notice');
          if (this.quickTurn) { this.quickTurn = false; this.face(p); this.setState('notice'); }
          break;
        }
        case 'notice':
          this.stop(); this.face(p);
          if (this.once('grunt')) G.sfxAt('enemy_windup', this.cx, { vol: 0.3, pitch: 0.55 });
          if (this.stateTime > 0.4) this.setState('engage');
          break;
        case 'engage': {
          if (!this.targetable(p)) { this.setState('patrol'); break; }
          const dx = this.dx(), adx = Math.abs(dx), ady = this.dy();
          if (this.canSee(p, this.sight * 1.3)) this.lostT = 0; else this.lostT += dt;
          if (this.lostT > 3) { this.setState('patrol'); break; }
          // slow to turn: the Wickling behind it gets a window
          if (adx > 8 && Math.sign(dx) !== this.facing) {
            this.behindT += dt; this.stop();
            if (this.behindT > (this.quickTurn ? 0.3 : 0.45)) {
              this.facing = -this.facing; this.behindT = 0; this.quickTurn = false;
              G.sfxAt('step', this.cx, { vol: 0.6, pitch: 0.5 });
            }
            break;
          }
          this.behindT = 0;
          if (!playerInZone(this) && adx < 2.3 * TILE && Math.abs(ady) < 1.5 * TILE && this.ready('stab')) { this.setState('windup'); break; }
          if (adx > 1.9 * TILE && this.grounded && this.canStep(this.facing)) this.vx = this.facing * 52;
          else if (adx < 1.1 * TILE && this.grounded && this.canStep(-this.facing)) this.vx = -this.facing * 30;
          else this.stop();
          break;
        }
        case 'windup': {                                       // TELEGRAPH: sword drawn back, shield swung aside
          this.stop();
          target = KPOSE.windup; rate = 8;
          if (this.once('tele')) {
            const tip = this.tipWorld();
            this.stateData.w = this.telegraph(0.55, { x: tip.x, y: tip.y, shake: 1.6, color: NV.tele });
            this.combo = Math.random() < 0.45 ? 3 : 2;
          }
          if (this.stateTime >= this.stateData.w) this.setState('stab', { n: 1 });
          break;
        }
        case 'stab': {
          target = KPOSE.stab; rate = 30;
          const f = this.facing;
          if (this.once('go')) {
            G.sfxAt('knight_stab', this.cx, { vol: 0.9 });
            if (this.grounded && this.canStep(f)) this.vx = f * 230; else this.stop();
          }
          if (this.stateTime > 0.12 || !this.canStep(f)) this.vx *= 0.7;
          if (this.stateTime >= 0.02 && this.stateTime < 0.16) {
            const x0 = f > 0 ? this.cx + 4 : this.cx - 4 - 2.1 * TILE;
            this.strike({ x: x0, y: this.y + this.h - 56, w: 2.1 * TILE, h: 32 }, { dir: { x: f, y: -0.1 } });
          }
          if (this.at(0.06)) { const tip = this.tipWorld(); burst('spark', tip.x, tip.y, { count: 3, color: '#e8f6ff', speed: 160, angle: f > 0 ? 0 : Math.PI, spread: 0.6 }); }
          if (this.stateTime > 0.26) {
            const n = this.stateData.n || 1;
            const front = this.targetable(p) && Math.sign(this.dx()) === f && Math.abs(this.dx()) < 3.4 * TILE && Math.abs(this.dy()) < 2 * TILE;
            if (n < this.combo && front) this.setState('pull', { n });
            else this.setState('recover');
          }
          break;
        }
        case 'pull': {                                         // TELEGRAPH (follow-up): pulls the sword back again
          this.stop();
          target = KPOSE.pull; rate = 14;
          if (this.once('tele')) { const tip = this.tipWorld(); this.stateData.w = this.telegraph(0.36, { x: tip.x, y: tip.y, shake: 1, color: NV.tele, vol: 0.5 }); }
          if (this.stateTime >= this.stateData.w) this.setState('stab', { n: (this.stateData.n || 1) + 1 });
          break;
        }
        case 'recover': {                                      // punish window: point in the floor, shield down
          this.stop();
          target = KPOSE.recover; rate = 6;
          if (this.at(0.12)) { const tip = this.tipWorld(); burst('dust', tip.x, this.y + this.h, { count: 4, color: '#5a6a6c' }); G.sfxAt('slash_wall', tip.x, { vol: 0.25, pitch: 0.7 }); }
          if (this.stateTime > 0.85) { this.cooldown('stab', rnd(1.3, 1.9)); this.blocks = 0; this.setState('engage'); }
          break;
        }
        default: this.setState('patrol');
      }
      const P = this.pose, k = Math.min(1, dt * rate);
      for (const key of ['sx', 'sy', 'a', 'sh', 'lean']) P[key] = lerp(P[key], target[key], k);
      if (Math.abs(this.vx) > 5 && this.grounded) {
        const before = Math.sin(this.walk);
        this.walk += Math.abs(this.vx) * dt * 0.1;
        if ((before < 0) !== (Math.sin(this.walk) < 0) && !this.is('stab')) G.sfxAt('step', this.cx, { vol: 0.45, pitch: 0.6 });
      }
    }
    drawBounds() { return { x: this.x - 80, y: this.y - 50, w: this.w + 160, h: this.h + 60 }; }
    drawBody(ctx, t) { drawKnight(ctx, this, t, false); }
    drawCorpse(ctx, t) { drawKnight(ctx, this, t, true); }
  }

  function drawKnight(ctx, e, t, dead) {
    const C = CH();
    const f = e.facing, fx = e.cx, fy = e.y + e.h, seed = e.seed || 0;
    const P = e.pose;
    const moving = Math.abs(e.vx) > 5 && !dead;
    const wk = e.walk || 0;
    const bob = moving ? Math.abs(Math.sin(wk)) * 1.5 : Math.sin(t * 1.2 + seed) * 0.5;
    const L = P.lean * 6, by = -bob;
    const { X, Y, stroke, limb } = painter(ctx, fx, fy, f);
    ctx.lineCap = 'round'; ctx.lineJoin = 'round';
    if (C && C.shadow) C.shadow(ctx, fx, fy, 24, 0.45);
    const shapeOf = (path, fill, box, o) => {
      if (C && C.shape) C.shape(ctx, path, Object.assign({ fill, box, light: -1, rim: NV.rim, rimWidth: 2, shade: 0.45, hi: 0.12 }, o || {}));
      else { ctx.fillStyle = fill; ctx.fill(path); }
    };
    // plume: sodden weed-like strands trailing from the helm crest
    const hcx = 1 + L, htop = -76 + by;
    for (let i = 0; i < 4; i++) {
      const wv = dead ? 0 : Math.sin(t * 1.6 + i * 0.9 + seed) * 2.5;
      const len = 18 + i * 5 + h01(i, seed) * 6;
      const pts = [{ x: hcx - 1, y: htop + 1 }, { x: hcx - 9 - i * 2.5, y: htop + 2 + len * 0.3 }, { x: hcx - 13 - i * 2 + wv, y: htop + 4 + len }];
      stroke(pts, 4.6, NV.outline);
      stroke(pts, 2.6, i % 2 ? DK.plumeHi : DK.plume);
    }
    // far arm (behind the body); the sword itself is drawn over the body (before the shield) so it always reads
    const hand = { x: P.sx + L * 0.6, y: P.sy + by * 0.5 };
    limb({ x: -7 + L, y: -55 + by }, hand, 8, DK.plateDark, DK.plateDark, -1);
    // legs: plate greaves with knee cops, stepping
    const step = moving ? Math.sin(wk) * 6 : 0;
    const stance = e.is && (e.is('stab') || e.is('windup')) ? 1 : 0;
    for (const [lx, sgn, col] of [[-8, 1, DK.plateDark], [8, -1, DK.plate]]) {
      const footX = lx + step * sgn + stance * sgn * -4;
      const pts = [{ x: lx * 0.6 + L * 0.3, y: -27 + by }, { x: footX + 2, y: -13 }, { x: footX, y: -4 }];
      stroke(pts, 12.5, NV.outline);
      stroke(pts, 9, col);
      ctx.fillStyle = DK.plateHi; ctx.beginPath(); ctx.arc(X(footX + 2.5), Y(-13), 3, 0, TAU); ctx.fill();
      ctx.fillStyle = NV.outline;
      ctx.beginPath(); ctx.moveTo(X(footX - 6), Y(0.5)); ctx.lineTo(X(footX - 6), Y(-7.5)); ctx.lineTo(X(footX + 5), Y(-7.5)); ctx.quadraticCurveTo(X(footX + 12), Y(-5), X(footX + 12), Y(0.5)); ctx.closePath(); ctx.fill();
      ctx.fillStyle = col;
      ctx.beginPath(); ctx.moveTo(X(footX - 4.6), Y(-1)); ctx.lineTo(X(footX - 4.6), Y(-6.2)); ctx.lineTo(X(footX + 4.6), Y(-6.2)); ctx.quadraticCurveTo(X(footX + 10.4), Y(-4.4), X(footX + 10.4), Y(-1)); ctx.closePath(); ctx.fill();
    }
    // breastplate
    const tp = new Path2D();
    tp.moveTo(X(-12 + L * 0.4), Y(-26 + by));
    tp.bezierCurveTo(X(-16 + L * 0.6), Y(-38 + by), X(-17 + L), Y(-50 + by), X(-13 + L), Y(-57 + by));
    tp.lineTo(X(13 + L), Y(-57 + by));
    tp.bezierCurveTo(X(18 + L), Y(-50 + by), X(17 + L * 0.6), Y(-37 + by), X(12 + L * 0.4), Y(-26 + by));
    tp.closePath();
    shapeOf(tp, dead ? '#3c4a4e' : DK.plate, [X(-17), fy - 58, X(18), fy - 26]);
    // tabard: drowned teal cloth over the plate, gold flame, tattered and dripping
    const sway = moving ? Math.sin(wk) * 1.6 : Math.sin(t * 1.4 + seed) * 0.6;
    const cp = new Path2D();
    cp.moveTo(X(-8 + L), Y(-55 + by)); cp.lineTo(X(9 + L), Y(-55 + by));
    cp.quadraticCurveTo(X(11 + L * 0.6), Y(-36 + by), X(10 + sway), Y(-12));
    for (let i = 1; i <= 5; i++) cp.lineTo(X(10 + sway - i * 4), Y(i % 2 ? -16 : -10.5 - h01(i, seed) * 2));
    cp.quadraticCurveTo(X(-9 + L * 0.6), Y(-36 + by), X(-8 + L), Y(-55 + by));
    cp.closePath();
    ctx.fillStyle = dead ? '#1e3436' : DK.cloth; ctx.fill(cp);
    ctx.strokeStyle = NV.outline; ctx.lineWidth = 1.8; ctx.stroke(cp);
    ctx.strokeStyle = 'rgba(120,170,170,0.3)'; ctx.lineWidth = 1.2;
    ctx.beginPath(); ctx.moveTo(X(7 + L), Y(-52 + by)); ctx.quadraticCurveTo(X(8.5 + L * 0.6), Y(-34 + by), X(8 + sway), Y(-15)); ctx.stroke();
    ctx.fillStyle = dead ? '#6c5c3a' : DK.gold;
    const ex = 1 + L * 0.8, ey = -42 + by;
    ctx.beginPath(); ctx.moveTo(X(ex), Y(ey - 7)); ctx.quadraticCurveTo(X(ex + 5), Y(ey), X(ex), Y(ey + 5)); ctx.quadraticCurveTo(X(ex - 5), Y(ey), X(ex), Y(ey - 7)); ctx.fill();
    ctx.fillStyle = 'rgba(255,240,190,0.5)'; ctx.beginPath(); ctx.ellipse(X(ex), Y(ey + 1.5), 1.4, 2.2, 0, 0, TAU); ctx.fill();
    // sword belt
    stroke([{ x: -11 + L * 0.5, y: -28 + by }, { x: 11 + L * 0.5, y: -29 + by }], 4.5, NV.outline);
    stroke([{ x: -10 + L * 0.5, y: -28 + by }, { x: 10 + L * 0.5, y: -29 + by }], 2.6, '#3a2c20');
    // helm: a great helm with a cross visor; pale pinprick eyes in the slit
    const hp = new Path2D();
    hp.moveTo(X(hcx - 10), Y(-55 + by));
    hp.lineTo(X(hcx - 11), Y(-70 + by));
    hp.quadraticCurveTo(X(hcx - 10), Y(htop), X(hcx), Y(htop));
    hp.quadraticCurveTo(X(hcx + 11), Y(htop), X(hcx + 11.5), Y(-69 + by));
    hp.lineTo(X(hcx + 12), Y(-57 + by));
    hp.quadraticCurveTo(X(hcx + 4), Y(-53 + by), X(hcx - 10), Y(-55 + by));
    hp.closePath();
    shapeOf(hp, dead ? '#3c4a4e' : DK.plate, [X(hcx - 11), fy + htop, X(hcx + 12), fy - 53 + by], { hi: 0.2 });
    ctx.fillStyle = DK.slit;
    ctx.beginPath(); ctx.moveTo(X(hcx - 4), Y(-67.5 + by)); ctx.lineTo(X(hcx + 12), Y(-67.5 + by)); ctx.lineTo(X(hcx + 12), Y(-64.5 + by)); ctx.lineTo(X(hcx - 4), Y(-64.5 + by)); ctx.closePath(); ctx.fill();
    ctx.beginPath(); ctx.moveTo(X(hcx + 5.5), Y(-67 + by)); ctx.lineTo(X(hcx + 8), Y(-67 + by)); ctx.lineTo(X(hcx + 8), Y(-57 + by)); ctx.lineTo(X(hcx + 5.5), Y(-57 + by)); ctx.closePath(); ctx.fill();
    ctx.fillStyle = 'rgba(160,200,200,0.55)';                                      // breath holes
    for (let i = 0; i < 3; i++) { ctx.beginPath(); ctx.arc(X(hcx + 1.5), Y(-61 + by + i * 2.4), 0.8, 0, TAU); ctx.fill(); }
    if (!dead) {
      const hot = e.telegraphing || e.is('stab');
      glow(ctx, X(hcx + 6), Y(-66 + by), 9, hot ? NV.tele : '#dfe8f4', hot ? 0.8 : 0.45);
      ctx.fillStyle = hot ? '#fff2c0' : '#e8f0f8';
      ctx.beginPath(); ctx.arc(X(hcx + 3.5), Y(-66 + by), 1.4, 0, TAU); ctx.arc(X(hcx + 9.5), Y(-66 + by), 1.4, 0, TAU); ctx.fill();
    }
    ctx.strokeStyle = 'rgba(10,16,18,0.6)'; ctx.lineWidth = 1.2;                       // crest ridge
    ctx.beginPath(); ctx.moveTo(X(hcx), Y(htop + 1)); ctx.lineTo(X(hcx + 1), Y(-68 + by)); ctx.stroke();
    // near pauldron
    const pp = new Path2D();
    pp.moveTo(X(1 + L), Y(-50 + by)); pp.quadraticCurveTo(X(2 + L), Y(-61 + by), X(11 + L), Y(-60 + by)); pp.quadraticCurveTo(X(19 + L), Y(-58 + by), X(18 + L), Y(-49 + by)); pp.closePath();
    shapeOf(pp, dead ? '#3c4a4e' : DK.plate, [X(1 + L), fy - 61 + by, X(19 + L), fy - 49 + by]);
    // ---- sword and sword hand
    const dir = { x: Math.cos(P.a), y: Math.sin(P.a) };
    const tip = { x: hand.x + dir.x * BLADE, y: hand.y + dir.y * BLADE };
    const guardP = { x: hand.x + dir.x * 7, y: hand.y + dir.y * 7 };
    const pommel = { x: hand.x - dir.x * 6, y: hand.y - dir.y * 6 };
    const nx = -dir.y, ny = dir.x;
    const blade = new Path2D();
    blade.moveTo(X(guardP.x + nx * 2.6), Y(guardP.y + ny * 2.6));
    blade.lineTo(X(tip.x - dir.x * 6 + nx * 2), Y(tip.y - dir.y * 6 + ny * 2));
    blade.lineTo(X(tip.x), Y(tip.y));
    blade.lineTo(X(tip.x - dir.x * 6 - nx * 2), Y(tip.y - dir.y * 6 - ny * 2));
    blade.lineTo(X(guardP.x - nx * 2.6), Y(guardP.y - ny * 2.6));
    blade.closePath();
    ctx.strokeStyle = NV.outline; ctx.lineWidth = 3.5; ctx.stroke(blade);
    ctx.fillStyle = dead ? '#6c787a' : DK.blade; ctx.fill(blade);
    stroke([guardP, { x: tip.x - dir.x * 5, y: tip.y - dir.y * 5 }], 1, dead ? '#8a9698' : DK.bladeHi);
    if (!dead && (e.telegraphing || e.is('stab'))) glow(ctx, X(tip.x), Y(tip.y), 18, '#e8f6ff', 0.45);
    // rust bloom on the blade
    ctx.fillStyle = 'rgba(110,74,50,0.6)';
    ctx.beginPath(); ctx.arc(X(guardP.x + dir.x * 16 + nx), Y(guardP.y + dir.y * 16 + ny), 1.8, 0, TAU); ctx.fill();
    stroke([{ x: guardP.x + nx * 7, y: guardP.y + ny * 7 }, { x: guardP.x - nx * 7, y: guardP.y - ny * 7 }], 5.5, NV.outline);
    stroke([{ x: guardP.x + nx * 6, y: guardP.y + ny * 6 }, { x: guardP.x - nx * 6, y: guardP.y - ny * 6 }], 3, DK.gold);
    stroke([pommel, guardP], 5, NV.outline); stroke([pommel, guardP], 3, DK.hilt);
    ctx.fillStyle = DK.gold; ctx.beginPath(); ctx.arc(X(pommel.x), Y(pommel.y), 2.4, 0, TAU); ctx.fill();
    ctx.fillStyle = NV.outline; ctx.beginPath(); ctx.arc(X(hand.x), Y(hand.y), 5, 0, TAU); ctx.fill();
    ctx.fillStyle = DK.plate; ctx.beginPath(); ctx.arc(X(hand.x), Y(hand.y), 3.6, 0, TAU); ctx.fill();
    // ---- tower shield on the near arm: raised in front (guard) or swung low aside (attacking)
    const s = clamp(P.sh, 0, 1);
    const scx = lerp(-7 + L * 0.5, 20 + L * 0.6, s), scy = lerp(-21, -38 + by, s), rot = lerp(-0.55, 0, s);
    ctx.save();
    ctx.translate(X(scx), Y(scy)); ctx.scale(f, 1); ctx.rotate(rot);
    const sp = new Path2D();
    sp.moveTo(-10, -22); sp.quadraticCurveTo(0, -26, 10, -22);
    sp.lineTo(10, 8); sp.quadraticCurveTo(9, 18, 0, 25); sp.quadraticCurveTo(-9, 18, -10, 8); sp.closePath();
    ctx.lineWidth = 7; ctx.strokeStyle = NV.outline; ctx.stroke(sp);
    ctx.lineWidth = 4; ctx.strokeStyle = DK.shieldRim; ctx.stroke(sp);
    if (C && C.shape) C.shape(ctx, sp, { fill: dead ? '#22383c' : DK.shield, box: [-10, -26, 10, 25], light: -f, rim: NV.rim, rimWidth: 1.6, shade: 0.4, hi: 0.15, lw: 0.01 });
    else { ctx.fillStyle = DK.shield; ctx.fill(sp); }
    ctx.save(); ctx.clip(sp);
    ctx.fillStyle = 'rgba(77,116,120,0.45)'; ctx.fillRect(-10, -26, 6, 52);        // enamel sheen band
    ctx.fillStyle = 'rgba(40,74,54,0.75)';                                        // weed and algae on the lower point
    ctx.beginPath(); ctx.ellipse(-3, 21, 9, 6, 0.2, 0, TAU); ctx.fill();
    ctx.fillStyle = 'rgba(106,154,116,0.6)'; ctx.beginPath(); ctx.ellipse(-5, 18, 3, 2, 0, 0, TAU); ctx.fill();
    ctx.restore();
    // gold flame device
    ctx.fillStyle = dead ? '#6c5c3a' : DK.gold;
    ctx.beginPath(); ctx.moveTo(0, -15); ctx.bezierCurveTo(7, -6, 6, 4, 0, 8); ctx.bezierCurveTo(-6, 4, -7, -6, 0, -15); ctx.fill();
    ctx.fillStyle = dead ? '#3a3226' : DK.shield;
    ctx.beginPath(); ctx.moveTo(0, -5); ctx.bezierCurveTo(3, 0, 3, 4, 0, 6); ctx.bezierCurveTo(-3, 4, -3, 0, 0, -5); ctx.fill();
    ctx.strokeStyle = 'rgba(242,216,144,0.6)'; ctx.lineWidth = 1;
    ctx.beginPath(); ctx.moveTo(-1.5, -11); ctx.quadraticCurveTo(-4.5, -4, -2.5, 3); ctx.stroke();
    // rivets on the rim + a dent
    ctx.fillStyle = DK.shieldRimHi;
    for (const [rx, ry] of [[-7.5, -19], [7.5, -19], [-7.5, 6], [7.5, 6], [0, 20]]) { ctx.beginPath(); ctx.arc(rx, ry, 1.1, 0, TAU); ctx.fill(); }
    ctx.strokeStyle = 'rgba(8,12,14,0.6)'; ctx.lineWidth = 1;
    ctx.beginPath(); ctx.arc(5, 12, 3, 3.6, 5.6); ctx.stroke();
    if (e.shieldFlash > 0 && !dead) {
      ctx.globalAlpha = clamp(e.shieldFlash / 0.2, 0, 1);
      ctx.lineWidth = 3; ctx.strokeStyle = '#fff6dc'; ctx.stroke(sp);
      ctx.fillStyle = 'rgba(255,246,220,0.35)'; ctx.fill(sp);
      ctx.globalAlpha = 1;
    }
    ctx.restore();
    // near gauntlet gripping the shield's back edge
    ctx.fillStyle = NV.outline; ctx.beginPath(); ctx.arc(X(scx - 8 * (1 - s) - 9 * s), Y(scy + 2), 4.6, 0, TAU); ctx.fill();
    ctx.fillStyle = DK.plate; ctx.beginPath(); ctx.arc(X(scx - 8 * (1 - s) - 9 * s), Y(scy + 2), 3.2, 0, TAU); ctx.fill();
    if (!dead) { drip(ctx, X(scx + 2), Y(scy + 24), 14, t, seed, 1.3); drip(ctx, X(-12 + L), Y(-30 + by), 22, t, seed + 3, 1.7); }
  }

  G.registerEnemy('drowned_knight', DrownedKnight);

  // Test hooks (contact sheet, fight scripts).
  G.NaveEnemies = { DrownedAcolyte, RainJelly, BellSentry, DrownedKnight, AcolyteFlame, JellyDrop, BellWave, APOSE, HPOSE, KPOSE };

  // ==================================================================================================================
  // REGION SET PIECES (module: region-nave; placed by tools/gen/nave.js). Event scripts drawn by code, all cached:
  //   dn_sheet    — rainwater sheeting down a wall face (props side 'E'|'W' = which face of tile col x, r0, r1, a)
  //   dn_curtain  — a silver rain curtain falling through a broken clerestory/vault gap (c0, c1, r0, r1 incl., a)
  //   dn_bellfar  — the far bell: a low, distant toll every few seconds (every)
  //   dn_rose     — THE ROSE WINDOW of the great nave: pale-gold glass, stone tracery, broken panes, god-rays (cx, cy
  //                 in tiles (centre), rad tiles, rays: [[x0col, floorRow, spread], ...])
  //   dn_organ    — the silent organ of the Choir Loft: ranks of tin pipes on a carved case (c0, c1, base row, top row)
  //   dn_font     — the Baptistery's frozen font (c = centre col, base = floor row the font stands on)
  //   dn_frost    — frost creeping up through floor cracks, cold blue light and rising mist (c0, c1, row = floor top)
  // ==================================================================================================================
  const dnSprites = new Map();
  function dnSprite(key, w, h, fn) {
    let c = dnSprites.get(key);
    if (!c) { const mc = G.U.makeCanvas(w, h); fn(mc.ctx, w, h); c = mc.canvas; dnSprites.set(key, c); }
    return c;
  }
  const seen = (x, y, w, h, m) => !G.camera || !G.camera.visible || G.camera.visible(x, y, w, h, m == null ? 60 : m);
  const fxSpawn = (o) => { if (G.fx && G.fx.spawn) G.fx.spawn(o); };
  const STONE = '#16242b', STONE_HI = '#3c5a64', STONE_DK = '#0a1216', GLASS_C = '#e8c870', GLASS_CORE = '#fff4cc';
  const RAIN = 'rgba(196,222,228,', ICEC = '#bfe6ff';

  // ---- dn_sheet
  G.Events.dn_sheet = G.Events.dn_sheet || {
    init(e) {
      const p = e.props;
      const col = p.c != null ? +p.c : +p.x;
      const fx = p.side === 'W' ? col * TILE : (col + 1) * TILE;
      e.data.r = { x: fx - (p.side === 'W' ? 7 : 0), y: p.r0 * TILE, w: 7, h: (p.r1 - p.r0 + 1) * TILE, fx, dir: p.side === 'W' ? -1 : 1 };
      e.data.acc = 0;
      e.z = -4;
    },
    update(e, dt) {
      const r = e.data.r;
      if (!seen(r.x, r.y + r.h - 40, 20, 60, 0)) return;
      e.data.acc += dt * 5;
      while (e.data.acc > 1) {
        e.data.acc -= 1;
        fxSpawn({ x: r.fx + r.dir * (2 + Math.random() * 5), y: r.y + r.h - 3, vx: r.dir * rnd(10, 40), vy: -rnd(30, 80), life: rnd(0.3, 0.55),
          size: rnd(1.2, 2.2), size2: 0.6, color: '#bcdce2', alpha: 0.55, gravity: 600, shape: 'circle' });
      }
    },
    draw(e, ctx, t) {
      const r = e.data.r, a = e.props.a == null ? 1 : +e.props.a, s = e.props.seed || 1;
      if (!seen(r.x, r.y, 12, r.h)) return;
      const x0 = r.dir > 0 ? r.fx : r.fx - 5;
      ctx.fillStyle = RAIN + (0.09 * a).toFixed(3) + ')';
      ctx.fillRect(x0, r.y, 5, r.h);
      ctx.fillStyle = RAIN + (0.16 * a).toFixed(3) + ')';
      ctx.fillRect(r.dir > 0 ? r.fx : r.fx - 2, r.y, 2, r.h);
      // running highlights
      const n = Math.max(3, Math.round(r.h / 46));
      ctx.fillStyle = RAIN + (0.38 * a).toFixed(3) + ')';
      for (let k = 0; k < n; k++) {
        const sp = 170 + h01(k, s) * 140, len = 14 + h01(k, s + 2) * 22;
        const y = r.y + ((h01(k, s + 1) * r.h + t * sp) % r.h);
        const off = h01(k, s + 3) * 3;
        ctx.fillRect(r.dir > 0 ? r.fx + off : r.fx - off - 1.5, y, 1.5, Math.min(len, r.y + r.h - y));
      }
    },
  };

  // ---- dn_curtain
  function shaftSprite(w, h, a) {
    return dnSprite('shaft' + w + 'x' + h + ':' + a, w, h, (x, W, H) => {
      const g = x.createLinearGradient(0, 0, 0, H);
      g.addColorStop(0, 'rgba(200,226,232,' + (0.13 * a).toFixed(3) + ')');
      g.addColorStop(0.6, 'rgba(170,205,214,' + (0.06 * a).toFixed(3) + ')');
      g.addColorStop(1, 'rgba(170,205,214,0)');
      x.fillStyle = g;
      x.beginPath(); x.moveTo(W * 0.18, 0); x.lineTo(W * 0.82, 0); x.lineTo(W, H); x.lineTo(0, H); x.closePath(); x.fill();
    });
  }
  G.Events.dn_curtain = G.Events.dn_curtain || {
    init(e) {
      const p = e.props;
      e.data.r = { x: p.c0 * TILE, y: p.r0 * TILE, w: (p.c1 - p.c0 + 1) * TILE, h: (p.r1 - p.r0 + 1) * TILE };
      e.data.acc = 0;
      e.z = -5;
    },
    update(e, dt) {
      const r = e.data.r;
      if (!seen(r.x, r.y + r.h - 40, r.w, 80, 0)) return;
      e.data.acc += dt * r.w / 40 * 3.2;
      while (e.data.acc > 1) {
        e.data.acc -= 1;
        fxSpawn({ x: r.x + Math.random() * r.w, y: r.y + r.h - 2, vx: rnd(-40, 40), vy: -rnd(50, 120), life: rnd(0.25, 0.5),
          size: rnd(1.2, 2.4), size2: 0.5, color: '#cfe6ea', alpha: 0.6, gravity: 700, shape: 'circle' });
      }
    },
    draw(e, ctx, t) {
      const r = e.data.r, s = e.props.seed || 1, a = e.props.a == null ? 1 : +e.props.a;
      if (!seen(r.x - 40, r.y, r.w + 80, r.h)) return;
      ctx.drawImage(shaftSprite(Math.round(r.w + 40), Math.round(r.h), a), r.x - 20, r.y);
      const n = Math.round(r.w / 40 * 7);
      ctx.strokeStyle = RAIN + (0.34 * a).toFixed(3) + ')';
      ctx.lineWidth = 1.2;
      ctx.beginPath();
      for (let i = 0; i < n; i++) {
        const sp = 760 + h01(i, s) * 260, len = 18 + h01(i, s + 1) * 18;
        const y = r.y - 30 + ((h01(i, s + 2) * (r.h + 30) + t * sp) % (r.h + 30));
        const x = r.x + h01(i, s + 3) * r.w + (y - r.y) * 0.04;
        const y2 = Math.min(y + len, r.y + r.h);
        if (y2 <= y) continue;
        ctx.moveTo(x, Math.max(y, r.y)); ctx.lineTo(x + (y2 - y) * 0.04, y2);
      }
      ctx.stroke();
    },
  };

  // ---- dn_bellfar
  G.Events.dn_bellfar = G.Events.dn_bellfar || {
    init(e) { e.data.t = 2 + Math.random() * 3; },
    update(e, dt) {
      e.data.t -= dt;
      if (e.data.t > 0) return;
      e.data.t = (+e.props.every || 9) * (0.8 + Math.random() * 0.5);
      if (G.Audio && G.Audio.sfx && (!G.game || !G.game.paused)) G.Audio.sfx('sentry_bell', { vol: +e.props.vol || 0.12, pitch: 0.42 });
    },
  };

  // ---- dn_rose
  function roseSprite(R) {
    const S = Math.ceil(R * 2.7);
    return dnSprite('rose' + R, S, S, (x, W) => {
      const c = W / 2;
      // stone surround: an outer moulding with crockets and a pointed hood
      x.fillStyle = STONE_DK; x.beginPath(); x.arc(c, c, R * 1.3, 0, TAU); x.fill();
      x.fillStyle = STONE; x.beginPath(); x.arc(c, c, R * 1.22, 0, TAU); x.fill();
      x.strokeStyle = STONE_HI; x.lineWidth = 2; x.beginPath(); x.arc(c, c, R * 1.22, Math.PI * 1.05, Math.PI * 1.95); x.stroke();
      for (let i = 0; i < 24; i++) {
        const a = (i / 24) * TAU;
        x.fillStyle = i % 2 ? STONE_HI : '#24363e';
        x.beginPath(); x.arc(c + Math.cos(a) * R * 1.16, c + Math.sin(a) * R * 1.16, R * 0.035, 0, TAU); x.fill();
      }
      K().roseWindow(x, c, c, R, { frame: '#101a1f', glass: GLASS_C, core: GLASS_CORE, edge: '#7a6a3a', petals: 16 });
      // coloured panes in the petals (teal/rose/amber), some broken out (dark)
      for (let i = 0; i < 16; i++) {
        const a = ((i + 0.5) / 16) * TAU, px = c + Math.cos(a) * R * 0.66, py = c + Math.sin(a) * R * 0.66;
        const v = h01(i, 7);
        x.fillStyle = v < 0.2 ? 'rgba(6,12,16,0.85)' : v < 0.45 ? 'rgba(90,170,170,0.45)' : v < 0.6 ? 'rgba(220,120,90,0.35)' : 'rgba(255,230,160,0.25)';
        x.beginPath(); x.arc(px, py, R * 0.17, 0, TAU); x.fill();
      }
      // a broken wedge where the rain gets in (lower right)
      x.fillStyle = 'rgba(6,12,16,0.8)';
      x.beginPath(); x.moveTo(c, c); x.arc(c, c, R * 0.97, 0.35, 0.62); x.closePath(); x.fill();
      x.strokeStyle = '#101a1f'; x.lineWidth = 3;
      x.beginPath(); x.moveTo(c + Math.cos(0.35) * R * 0.3, c + Math.sin(0.35) * R * 0.3); x.lineTo(c + Math.cos(0.5) * R * 0.97, c + Math.sin(0.5) * R * 0.97); x.stroke();
      // centre boss: a flame
      x.fillStyle = '#fff8e0'; x.beginPath(); x.ellipse(c, c + R * 0.03, R * 0.07, R * 0.12, 0, 0, TAU); x.fill();
    });
  }
  function raySprite(w, h) {
    return dnSprite('ray' + w + 'x' + h, w, h, (x, W, H) => {
      const g = x.createLinearGradient(0, 0, 0, H);
      g.addColorStop(0, 'rgba(255,232,170,0.16)'); g.addColorStop(0.7, 'rgba(240,210,140,0.05)'); g.addColorStop(1, 'rgba(240,210,140,0)');
      x.fillStyle = g; x.fillRect(0, 0, W, H);
    });
  }
  const K = () => (G.Art && G.Art.BG && G.Art.BG.kit) || { roseWindow() {} };
  G.Events.dn_rose = G.Events.dn_rose || {
    init(e) {
      const p = e.props;
      e.data.R = Math.round((+p.rad || 5) * TILE);
      e.data.cx = (+p.cx) * TILE; e.data.cy = (+p.cy) * TILE;
      e.z = -30;
    },
    draw(e, ctx, t) {
      const d = e.data, R = d.R, p = e.props;
      // god-rays: skewed bands of light from the window down to the floor
      for (const [i, ray] of (p.rays || []).entries()) {
        const fx = ray[0] * TILE, fy = ray[1] * TILE, wid = (ray[2] || 3) * TILE;
        const h = fy - d.cy;
        if (h <= 0 || !seen(Math.min(d.cx, fx) - wid, d.cy, Math.abs(fx - d.cx) + wid * 2, h)) continue;
        const spr = raySprite(Math.round(wid), Math.round(h));
        const pulse = 0.75 + 0.25 * Math.sin(t * 0.6 + i * 1.7);
        ctx.save();
        ctx.globalAlpha = pulse;
        const k = (fx - d.cx) / h;
        ctx.transform(1, 0, k, 1, -k * d.cy, 0);
        ctx.drawImage(spr, d.cx - wid / 2, d.cy);
        ctx.restore();
      }
      if (!seen(d.cx - R * 1.4, d.cy - R * 1.4, R * 2.8, R * 2.8)) return;
      const spr = roseSprite(R);
      ctx.drawImage(spr, d.cx - spr.width / 2, d.cy - spr.height / 2);
      glow(ctx, d.cx, d.cy, R * 1.9, GLASS_C, 0.16 + 0.04 * Math.sin(t * 0.9));
    },
  };

  // ---- dn_organ
  G.Events.dn_organ = G.Events.dn_organ || {
    init(e) {
      const p = e.props;
      e.data.r = { x: p.c0 * TILE, y: p.top * TILE, w: (p.c1 - p.c0 + 1) * TILE, h: (p.base - p.top) * TILE };
      e.z = -25;
    },
    draw(e, ctx) {
      const r = e.data.r;
      if (!seen(r.x, r.y, r.w, r.h)) return;
      const spr = dnSprite('organ' + r.w + 'x' + r.h, r.w, r.h, (x, W, H) => {
        const caseH = 34, baseY = H - caseH;
        // the pipe ranks: three towers (centre tallest) and flats between them, pipes 18 px with gaps
        const pw = 18, n = Math.floor((W - 16) / pw), x0 = (W - n * pw) / 2;
        for (let i = 0; i < n; i++) {
          const u = (i + 0.5) / n;
          const towers = Math.max(Math.exp(-Math.pow((u - 0.5) / 0.09, 2)), 0.78 * Math.exp(-Math.pow((u - 0.13) / 0.07, 2)), 0.78 * Math.exp(-Math.pow((u - 0.87) / 0.07, 2)));
          const flat = 0.42 + 0.12 * Math.abs(Math.sin(u * Math.PI * 7));
          const ph = (baseY - 6) * Math.max(flat, towers * 0.98);
          const px = x0 + i * pw, py = baseY - ph;
          const g = x.createLinearGradient(px, 0, px + pw, 0);
          g.addColorStop(0, '#1a2a30'); g.addColorStop(0.3, '#5e7880'); g.addColorStop(0.55, '#38505a'); g.addColorStop(1, '#14222a');
          x.fillStyle = g; x.fillRect(px + 2, py, pw - 4, ph);
          // rounded cap, the mouth, a highlight and green runs
          x.fillStyle = '#4c6670'; x.beginPath(); x.ellipse(px + pw / 2, py, pw / 2 - 2, 3, 0, 0, TAU); x.fill();
          const my = baseY - Math.min(ph * 0.25, 40);
          x.fillStyle = '#070d10'; x.beginPath(); x.moveTo(px + 3, my + 8); x.lineTo(px + pw / 2, my); x.lineTo(px + pw - 3, my + 8); x.lineTo(px + pw - 3, my + 11); x.lineTo(px + 3, my + 11); x.fill();
          x.fillStyle = 'rgba(190,220,220,0.22)'; x.fillRect(px + pw * 0.32, py + 4, 2, ph - 8);
          x.fillStyle = 'rgba(80,150,120,0.3)'; x.fillRect(px + pw * 0.6, py + 6, 2, ph * (0.15 + h01(i, 9) * 0.4));
        }
        // the carved case below the pipes (a rail with tracery)
        x.fillStyle = '#101c22'; x.fillRect(0, baseY, W, caseH);
        x.fillStyle = '#2a3e46'; x.fillRect(0, baseY, W, 4);
        for (let k = 10; k < W - 14; k += 22) { x.fillStyle = '#0a1418'; x.beginPath(); x.moveTo(k, H - 4); x.lineTo(k, baseY + 16); x.arc(k + 7, baseY + 16, 7, Math.PI, 0); x.lineTo(k + 14, H - 4); x.fill(); }
      });
      ctx.drawImage(spr, r.x, r.y);
    },
  };

  // ---- dn_saint: a colossal stone saint drawn over its glazed block (c0..c1, top..body rows = the solid robe; the
  // walkway passes between its feet down to base): robe folds, the bowed hooded head behind the open hands that form
  // the flat top (where the Heartwax rests), the hem parting over the walkway (drawn darker, behind the Wickling)
  G.Events.dn_saint = G.Events.dn_saint || {
    init(e) {
      const p = e.props;
      e.data.r = { x: p.c0 * TILE, y: p.top * TILE, w: (p.c1 - p.c0 + 1) * TILE, h: (p.base - p.top) * TILE, body: (p.body - p.top) * TILE };
      e.z = -6;
    },
    draw(e, ctx) {
      const r = e.data.r, HEAD = 96;
      if (!seen(r.x - 30, r.y - HEAD, r.w + 60, r.h + HEAD)) return;
      const spr = dnSprite('saint' + r.w + 'x' + r.h + ':' + r.body, r.w + 60, r.h + HEAD, (x, W, H) => {
        const L = 30, R = W - 30, top = HEAD, c = W / 2, bodyY = top + r.body;
        const stone = x.createLinearGradient(L, 0, R, 0);
        stone.addColorStop(0, '#1c2c33'); stone.addColorStop(0.35, '#3e5660'); stone.addColorStop(0.7, '#2a3e46'); stone.addColorStop(1, '#16242a');
        // the hem and feet below the solid robe (receding: darker), the dark gateway between them
        x.fillStyle = '#0a1418';
        x.beginPath(); x.moveTo(L + 18, H); x.lineTo(L + 18, bodyY + 30); x.quadraticCurveTo(c, bodyY - 6, R - 18, bodyY + 30); x.lineTo(R - 18, H); x.fill();
        x.fillStyle = '#1a2a30';
        x.beginPath(); x.moveTo(L - 8, H); x.lineTo(L - 2, bodyY); x.lineTo(L + 26, bodyY); x.quadraticCurveTo(L + 20, bodyY + 60, L + 22, H); x.fill();
        x.beginPath(); x.moveTo(R + 8, H); x.lineTo(R + 2, bodyY); x.lineTo(R - 26, bodyY); x.quadraticCurveTo(R - 20, bodyY + 60, R - 22, H); x.fill();
        x.fillStyle = '#26383f'; x.fillRect(L - 14, H - 14, 40, 14); x.fillRect(R - 26, H - 14, 40, 14);            // the feet's plinths
        x.fillStyle = '#3c5660'; x.fillRect(L - 14, H - 14, 40, 2); x.fillRect(R - 26, H - 14, 40, 2);
        // (QA) the figure above the hands: sloped, rounded shoulders (never flat: nothing up here may read as a ledge),
        // then the bowed hood with a pale stone face, closed eyes and water-stain tears, rim-lit from the windows
        const sh = x.createLinearGradient(0, top - 46, 0, top + 6);
        sh.addColorStop(0, '#344c55'); sh.addColorStop(1, '#1e3036');
        x.fillStyle = sh;
        x.beginPath(); x.moveTo(L - 2, top + 6); x.quadraticCurveTo(L + 26, top - 30, c - 34, top - 42); x.quadraticCurveTo(c, top - 50, c + 34, top - 42);
        x.quadraticCurveTo(R - 26, top - 30, R + 2, top + 6); x.closePath(); x.fill();
        x.strokeStyle = 'rgba(170,205,212,0.26)'; x.lineWidth = 2;
        x.beginPath(); x.moveTo(L - 1, top + 3); x.quadraticCurveTo(L + 26, top - 29, c - 34, top - 41); x.stroke();
        x.strokeStyle = 'rgba(170,205,212,0.12)';
        x.beginPath(); x.moveTo(R + 1, top + 3); x.quadraticCurveTo(R - 26, top - 29, c + 34, top - 41); x.stroke();
        x.fillStyle = stone;
        x.beginPath(); x.moveTo(c - 50, top - 14); x.quadraticCurveTo(c - 54, top - 70, c + 2, top - HEAD + 4); x.quadraticCurveTo(c + 56, top - 66, c + 48, top - 14);
        x.quadraticCurveTo(c, top - 4, c - 50, top - 14); x.fill();
        x.fillStyle = '#0c161a'; x.beginPath(); x.ellipse(c + 4, top - 40, 25, 30, 0.15, 0, TAU); x.fill();          // the hood's hollow
        const fg = x.createLinearGradient(c - 16, top - 62, c + 18, top - 18);
        fg.addColorStop(0, '#9fb4b6'); fg.addColorStop(0.55, '#6f878b'); fg.addColorStop(1, '#3e5458');
        x.fillStyle = fg; x.beginPath(); x.ellipse(c + 6, top - 34, 15, 21, 0.18, 0, TAU); x.fill();               // the face, bowed
        x.fillStyle = 'rgba(8,16,20,0.55)'; x.beginPath(); x.ellipse(c + 2, top - 52, 19, 9, 0.18, 0, TAU); x.fill();  // hood shadow on the brow
        x.strokeStyle = 'rgba(20,34,38,0.85)'; x.lineWidth = 2;
        x.beginPath(); x.arc(c - 2, top - 40, 4.5, 0.25, Math.PI - 0.25); x.stroke();                                   // closed eyes
        x.beginPath(); x.arc(c + 12, top - 38, 4.5, 0.25, Math.PI - 0.25); x.stroke();
        x.beginPath(); x.moveTo(c + 6, top - 37); x.lineTo(c + 4, top - 28); x.stroke();                                  // nose
        x.fillStyle = 'rgba(40,70,76,0.5)'; x.fillRect(c - 3, top - 36, 2, 20); x.fillRect(c + 12, top - 34, 2, 16);    // tear stains
        x.strokeStyle = 'rgba(180,215,220,0.35)'; x.lineWidth = 2.5;
        x.beginPath(); x.moveTo(c - 48, top - 18); x.quadraticCurveTo(c - 52, top - 68, c + 2, top - HEAD + 6); x.stroke();     // rim light
        // the robe (the solid block)
        x.fillStyle = stone; x.fillRect(L, top, R - L, bodyY - top);
        x.beginPath(); x.moveTo(L, bodyY); x.quadraticCurveTo(c, bodyY + 22, R, bodyY); x.lineTo(R, bodyY - 2); x.lineTo(L, bodyY - 2); x.fill();
        for (let k = 0; k < 7; k++) {
          const fx = L + 14 + k * (R - L - 28) / 6;
          x.fillStyle = 'rgba(6,12,16,0.45)'; x.fillRect(fx, top + 26 + (k % 2) * 14, 4, bodyY - top - 30 - (k % 2) * 14);
          x.fillStyle = 'rgba(170,205,210,0.12)'; x.fillRect(fx + 5, top + 30 + (k % 2) * 14, 2, bodyY - top - 36 - (k % 2) * 14);
        }
        // the open hands: a broad flat cup across the top, fingertips, forearms
        x.fillStyle = '#46606a'; x.fillRect(L - 4, top - 2, R - L + 8, 16);
        x.fillStyle = '#5c7882'; x.fillRect(L - 4, top - 2, R - L + 8, 3);
        x.fillStyle = '#344a52';
        for (let k = 0; k < 4; k++) { x.beginPath(); x.ellipse(L + 6 + k * 9, top + 15, 4, 6, 0, 0, TAU); x.fill(); x.beginPath(); x.ellipse(R - 6 - k * 9, top + 15, 4, 6, 0, 0, TAU); x.fill(); }
        x.fillStyle = '#26383f'; x.fillRect(L + 8, top + 14, 30, 22); x.fillRect(R - 38, top + 14, 30, 22);
        // weathering: a long water stain and moss
        x.fillStyle = 'rgba(20,40,40,0.4)'; x.fillRect(c + 18, top + 16, 10, bodyY - top - 20);
        x.fillStyle = 'rgba(70,120,100,0.35)'; for (let k = 0; k < 14; k++) x.fillRect(L + h01(k, 3) * (R - L), top + 14 + h01(k, 4) * (bodyY - top - 24), 3 + h01(k, 5) * 5, 2);
      });
      ctx.drawImage(spr, r.x - 30, r.y - HEAD);
    },
  };

  // ---- dn_masonry: ashlar courses painted over a SOLID rect (c0..c1, r0..r1 incl.) so big masses read as built
  // stone; optional blind arcade (arches: span in tiles), a top cornice (cornice: true) and wash (0..1: cold light thrown up the face by water below). Never place over air.
  G.Events.dn_masonry = G.Events.dn_masonry || {
    init(e) {
      const p = e.props;
      e.data.r = { x: p.c0 * TILE, y: p.r0 * TILE, w: (p.c1 - p.c0 + 1) * TILE, h: (p.r1 - p.r0 + 1) * TILE };
      e.z = -9;
    },
    draw(e, ctx) {
      const r = e.data.r, p = e.props, sd = p.seed || 1;
      if (!seen(r.x, r.y, r.w, r.h)) return;
      const spr = dnSprite('mas' + r.w + 'x' + r.h + ':' + sd + ':' + (p.arches || 0) + (p.cornice ? 'c' : '') + (p.wash || ''), r.w, r.h, (x, W, H) => {
        const ch = 20;
        if (p.wash) {   // cold light thrown up the vault face by the water below (bottom bright, fading upward)
          const g = x.createLinearGradient(0, H, 0, 0);
          g.addColorStop(0, 'rgba(90,150,165,' + (0.34 * p.wash).toFixed(3) + ')'); g.addColorStop(0.45, 'rgba(70,120,135,' + (0.12 * p.wash).toFixed(3) + ')'); g.addColorStop(1, 'rgba(60,100,110,0)');
          x.fillStyle = g; x.fillRect(0, 0, W, H);
        }
        for (let row = 0, y = 0; y < H; y += ch, row++) {
          let bx = -h01(row, sd) * 40;
          for (let k = 0; bx < W; k++) {
            const bw = 34 + h01(row * 31 + k, sd + 1) * 30, v = h01(row * 17 + k, sd + 2);
            x.fillStyle = v < 0.5 ? 'rgba(120,160,170,' + (0.03 + v * 0.06).toFixed(3) + ')' : 'rgba(0,0,0,' + (0.05 + (v - 0.5) * 0.18).toFixed(3) + ')';
            x.fillRect(bx + 1, y + 1, bw - 2, ch - 2);
            x.fillStyle = 'rgba(0,0,0,0.35)'; x.fillRect(bx, y, 1.5, ch);
            bx += bw;
          }
          x.fillStyle = 'rgba(0,0,0,0.38)'; x.fillRect(0, y, W, 1.5);
          x.fillStyle = 'rgba(150,190,200,0.05)'; x.fillRect(0, y + 1.5, W, 1);
        }
        if (p.arches) {
          const span = p.arches * TILE, aw = span * 0.62;
          for (let ax = span / 2; ax < W; ax += span) {
            const yb = H - 12, ah = Math.min(H - 30, aw * 1.5);
            x.fillStyle = 'rgba(2,6,8,0.55)';
            x.beginPath(); x.moveTo(ax - aw / 2, yb); x.lineTo(ax - aw / 2, yb - ah + aw / 2); x.quadraticCurveTo(ax - aw / 2, yb - ah, ax, yb - ah - aw * 0.12);
            x.quadraticCurveTo(ax + aw / 2, yb - ah, ax + aw / 2, yb - ah + aw / 2); x.lineTo(ax + aw / 2, yb); x.fill();
            x.strokeStyle = 'rgba(120,160,170,0.18)'; x.lineWidth = 3; x.stroke();
            x.fillStyle = 'rgba(0,0,0,0.3)'; x.fillRect(ax + aw / 2 + (span - aw) / 2 - 6, 0, 12, H);    // pilaster shadow
            x.fillStyle = 'rgba(140,180,190,0.07)'; x.fillRect(ax + aw / 2 + (span - aw) / 2 - 6, 0, 3, H);
          }
        }
        if (p.cornice) { x.fillStyle = 'rgba(150,190,200,0.12)'; x.fillRect(0, 4, W, 3); x.fillStyle = 'rgba(0,0,0,0.4)'; x.fillRect(0, 7, W, 6); }
      });
      ctx.drawImage(spr, r.x, r.y);
    },
  };

  // ---- dn_pier: the colonnettes and arch under a hanging pier (c0..c1 cols, r = first open row under it, base = floor
  // row): drawn darker, behind the Wickling, so the pier reads as a gateway, not a floating block
  G.Events.dn_pier = G.Events.dn_pier || {
    init(e) {
      const p = e.props;
      e.data.r = { x: p.c0 * TILE, y: p.r * TILE, w: (p.c1 - p.c0 + 1) * TILE, h: (p.base - p.r) * TILE };
      e.z = -7;
    },
    draw(e, ctx) {
      const r = e.data.r;
      if (!seen(r.x - 20, r.y, r.w + 40, r.h)) return;
      const spr = dnSprite('pier' + r.w + 'x' + r.h, r.w + 40, r.h, (x, W, H) => {
        const L = 20, R = W - 20, cw = 16;
        x.fillStyle = 'rgba(4,8,10,0.55)';                                   // the gateway's shadowed depth
        x.beginPath(); x.moveTo(L + cw, H); x.lineTo(L + cw, 30); x.quadraticCurveTo(W / 2, -6, R - cw, 30); x.lineTo(R - cw, H); x.fill();
        for (const cx of [L + cw / 2, R - cw / 2]) {                         // colonnettes with capitals and bases
          const g = x.createLinearGradient(cx - cw / 2, 0, cx + cw / 2, 0);
          g.addColorStop(0, '#16242a'); g.addColorStop(0.4, '#3a525c'); g.addColorStop(1, '#14222a');
          x.fillStyle = g; x.fillRect(cx - cw / 2 + 2, 8, cw - 4, H - 16);
          x.fillStyle = '#2c424a'; x.fillRect(cx - cw / 2 - 3, 0, cw + 6, 10); x.fillRect(cx - cw / 2 - 3, H - 10, cw + 6, 10);
          x.fillStyle = 'rgba(160,200,205,0.2)'; x.fillRect(cx - cw / 2 - 3, 0, cw + 6, 2);
        }
        x.strokeStyle = '#2c424a'; x.lineWidth = 6;                          // the arch ring
        x.beginPath(); x.moveTo(L + cw, 34); x.quadraticCurveTo(W / 2, -2, R - cw, 34); x.stroke();
      });
      ctx.drawImage(spr, r.x - 20, r.y);
    },
  };

  // ---- dn_posts: stone colonnettes behind the terrain carrying one-way decks (posts: [[col, topRow, bottomRow, w?], ...]
  // col may be fractional = centre; top = the deck's row (capital tucked under it), bottom = the floor row it stands on)
  G.Events.dn_posts = G.Events.dn_posts || {
    init(e) { e.z = -20; },
    draw(e, ctx) {
      for (const [col, top, bot, wt] of e.props.posts || []) {
        const w = (wt || 0.4) * TILE, cx = col * TILE, y0 = top * TILE + 12, y1 = bot * TILE;
        if (!seen(cx - w, y0, w * 2, y1 - y0)) continue;
        const spr = dnSprite('post' + Math.round(w) + 'x' + Math.round(y1 - y0), Math.round(w) + 16, Math.round(y1 - y0), (x, W, H) => {
          const g = x.createLinearGradient(8, 0, W - 8, 0);
          g.addColorStop(0, '#111c21'); g.addColorStop(0.4, '#2e444c'); g.addColorStop(1, '#0e181c');
          x.fillStyle = g; x.fillRect(8, 6, W - 16, H - 12);
          x.fillStyle = '#26383f'; x.fillRect(0, 0, W, 8); x.fillRect(2, H - 8, W - 4, 8);          // capital + base
          x.fillStyle = 'rgba(160,200,205,0.18)'; x.fillRect(0, 0, W, 2);
          x.fillStyle = 'rgba(0,0,0,0.3)'; for (let y = 30; y < H - 10; y += 34) x.fillRect(8, y, W - 16, 2);   // drums
        });
        ctx.drawImage(spr, cx - spr.width / 2, y0);
      }
    },
  };

  // ---- dn_flow: the floodwater running west (light streaks drifting along the surface); c0, c1, row (surface top)
  G.Events.dn_flow = G.Events.dn_flow || {
    init(e) { const p = e.props; e.data.r = { x: p.c0 * TILE, y: p.row * TILE, w: (p.c1 - p.c0 + 1) * TILE }; e.z = 5; },
    draw(e, ctx, t) {
      const r = e.data.r;
      if (!seen(r.x, r.y - 10, r.w, 30)) return;
      const n = Math.round(r.w / 40 * 1.6);
      ctx.fillStyle = 'rgba(190,226,232,0.32)';
      for (let i = 0; i < n; i++) {
        const sp = 40 + h01(i, 3) * 50, len = 14 + h01(i, 4) * 30;
        const x = r.x + r.w - ((h01(i, 5) * r.w + t * sp) % r.w);
        const y = r.y + 3 + h01(i, 6) * 18;
        ctx.fillRect(x, y, Math.min(len, r.x + r.w - x), 1.5);
      }
    },
  };

  // ---- dn_font
  G.Events.dn_font = G.Events.dn_font || {
    init(e) {
      const p = e.props;
      e.data.x = (p.c + 0.5) * TILE; e.data.y = p.base * TILE; e.data.acc = 0;
      e.z = -8;
    },
    update(e, dt) {
      const d = e.data;
      if (!seen(d.x - 120, d.y - 160, 240, 160, 0)) return;
      d.acc += dt * 4;
      while (d.acc > 1) {
        d.acc -= 1;
        fxSpawn({ x: d.x + rnd(-90, 90), y: d.y - 98, vx: rnd(-8, 8), vy: -rnd(8, 22), life: rnd(1.8, 3), size: rnd(5, 8), size2: rnd(16, 24),
          color: '#cfe8f0', alpha: rnd(0.05, 0.1), drag: 0.3, shape: 'circle' });
      }
    },
    draw(e, ctx, t) {
      const d = e.data;
      if (!seen(d.x - 140, d.y - 170, 280, 180)) return;
      const spr = dnSprite('font', 280, 170, (x, W, H) => {
        const c = W / 2, b = H;
        // octagonal pedestal and stepped base
        x.fillStyle = STONE_DK; x.fillRect(c - 110, b - 14, 220, 14);
        x.fillStyle = STONE; x.fillRect(c - 96, b - 26, 192, 12);
        x.fillStyle = '#1e3038'; x.fillRect(c - 30, b - 84, 60, 58);
        x.fillStyle = STONE_HI; x.fillRect(c - 30, b - 84, 4, 58); x.fillRect(c - 96, b - 26, 192, 2);
        // the bowl
        x.fillStyle = '#22363e';
        x.beginPath(); x.moveTo(c - 112, b - 112); x.lineTo(c + 112, b - 112); x.quadraticCurveTo(c + 100, b - 80, c + 34, b - 80);
        x.lineTo(c - 34, b - 80); x.quadraticCurveTo(c - 100, b - 80, c - 112, b - 112); x.fill();
        x.fillStyle = STONE_HI; x.fillRect(c - 116, b - 118, 232, 7);
        // carved band of flames
        for (let k = -4; k <= 4; k++) { x.fillStyle = '#132228'; x.beginPath(); x.ellipse(c + k * 22, b - 98, 5, 9, 0, 0, TAU); x.fill(); }
        // frozen surface, heaved ice and icicles
        const ig = x.createLinearGradient(0, b - 132, 0, b - 112);
        ig.addColorStop(0, '#e8f6ff'); ig.addColorStop(1, '#7ab8d8');
        x.fillStyle = ig;
        x.beginPath(); x.moveTo(c - 112, b - 116); x.lineTo(c - 80, b - 124); x.lineTo(c - 52, b - 120); x.lineTo(c - 20, b - 138); x.lineTo(c + 4, b - 122);
        x.lineTo(c + 40, b - 128); x.lineTo(c + 76, b - 120); x.lineTo(c + 112, b - 116); x.closePath(); x.fill();
        x.strokeStyle = 'rgba(255,255,255,0.6)'; x.lineWidth = 1.5;
        x.beginPath(); x.moveTo(c - 20, b - 138); x.lineTo(c - 8, b - 118); x.moveTo(c + 40, b - 128); x.lineTo(c + 30, b - 117); x.stroke();
        for (let k = 0; k < 11; k++) {
          const ix = c - 104 + k * 21 + h01(k, 3) * 6, il = 8 + h01(k, 5) * 20;
          x.fillStyle = 'rgba(200,236,255,0.85)';
          x.beginPath(); x.moveTo(ix - 3, b - 111); x.lineTo(ix + 3, b - 111); x.lineTo(ix, b - 111 + il); x.fill();
        }
        // frost on the base
        x.fillStyle = 'rgba(210,240,255,0.5)'; for (let k = 0; k < 18; k++) x.fillRect(c - 108 + h01(k, 8) * 216, b - 16 - h01(k, 9) * 6, 3, 2);
      });
      ctx.drawImage(spr, d.x - spr.width / 2, d.y - spr.height);
      glow(ctx, d.x, d.y - 124, 120, ICEC, 0.14 + 0.03 * Math.sin(t * 1.3));
    },
  };

  // ---- dn_frost
  G.Events.dn_frost = G.Events.dn_frost || {
    init(e) {
      const p = e.props;
      e.data.r = { x: p.c0 * TILE, y: p.row * TILE, w: (p.c1 - p.c0 + 1) * TILE };
      e.data.acc = 0;
      e.z = 2;
    },
    update(e, dt) {
      const r = e.data.r;
      if (!seen(r.x, r.y - 80, r.w, 100, 0)) return;
      e.data.acc += dt * r.w / 40 * 0.7;
      while (e.data.acc > 1) {
        e.data.acc -= 1;
        fxSpawn({ x: r.x + Math.random() * r.w, y: r.y - 2, vx: rnd(-6, 6), vy: -rnd(10, 26), life: rnd(1.4, 2.4), size: rnd(4, 7), size2: rnd(12, 20),
          color: '#d8f0ff', alpha: rnd(0.06, 0.12), drag: 0.3, shape: 'circle' });
      }
    },
    draw(e, ctx, t) {
      const r = e.data.r, s = e.props.seed || 1;
      if (!seen(r.x - 40, r.y - 60, r.w + 80, 100)) return;
      const spr = dnSprite('frost' + r.w + ':' + s, r.w + 80, 70, (x, W, H) => {
        const by = 46;
        // rime crust on the floor surface
        x.fillStyle = 'rgba(200,236,255,0.55)';
        for (let k = 0; k < W / 5; k++) { const fx = h01(k, s) * W, fh = 2 + h01(k, s + 1) * 5 * (1 - Math.abs(fx / W - 0.5) * 1.6); if (fh > 0) x.fillRect(fx, by - fh, 2.5, fh + 2); }
        // frost ferns climbing from the cracks
        x.strokeStyle = 'rgba(214,242,255,0.7)'; x.lineWidth = 1.2;
        for (let k = 0; k < Math.max(3, W / 60); k++) {
          const fx = 40 + h01(k, s + 5) * (W - 80), hgt = 14 + h01(k, s + 6) * 26;
          x.beginPath(); x.moveTo(fx, by); x.lineTo(fx + (h01(k, s + 7) - 0.5) * 10, by - hgt);
          for (let j = 1; j < 5; j++) { const yy = by - hgt * j / 5, ln = (1 - j / 5) * 8 + 2; x.moveTo(fx, yy); x.lineTo(fx - ln, yy - ln * 0.6); x.moveTo(fx, yy); x.lineTo(fx + ln, yy - ln * 0.6); }
          x.stroke();
        }
        // the cold glow seeping from the cracks (below the surface line)
        x.fillStyle = 'rgba(150,215,255,0.35)';
        for (let k = 0; k < W / 30; k++) x.fillRect(40 + h01(k, s + 9) * (W - 80), by + 1, 10 + h01(k, s + 10) * 18, 2);
      });
      ctx.drawImage(spr, r.x - 40, r.y - 46);
      glow(ctx, r.x + r.w / 2, r.y + 6, Math.max(60, r.w * 0.6), ICEC, 0.1 + 0.04 * Math.sin(t * 1.7 + s));
    },
  };
})();
