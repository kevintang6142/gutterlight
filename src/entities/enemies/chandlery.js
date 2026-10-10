// src/entities/enemies/chandlery.js — The Chandlery enemies (module: enemies-chandlery; placement guide:
// docs/api/enemies-chandlery.md):
//   moldling    — a half-formed hopping blob of raw, never-lit wax with no wick, still bearing the seam of its
//                 soldier-mold and the stub of a helmet brim. Bobs toward the Wickling in short hops; up close it
//                 crouches while molten light cracks through its skin (0.45 s) and belly-flops onto it, then lies
//                 splatted (0.6 s). Splatters on death (no split). hp 30.
//   ladle_brute — a hulking forge worker in a riveted bucket helm with a slit of furnace light, a molten pail on its
//                 hip and a huge iron ladle. Dips the ladle into the pail (0.55 s, bowl glows) and flings 1-2 molten
//                 blobs in arcs (projectile 'ladle_blob', destroyable) that leave short-lived burning puddles
//                 ('ladle_puddle', ~1.5 s); up close it hunches behind the bowl (0.45 s) and shoves. hp 65.
//   drip_slime  — a gob of hot amber wax with beady black eyes clinging to a ceiling (it drips: the hint). When the
//                 Wickling passes below it trembles and stretches (0.5 s), drops, splats, then crawls the floor and
//                 rears up (0.45 s) to lunge. Knocked off by a hit it falls harmlessly. No ceiling above → floor. hp 35.
//   forge_wisp  — a living flame around a charred coal heart. Drifts near its spot; when it sees the Wickling it
//                 circles it at ~3.6 tiles, flares white-hot (0.5 s) and dashes straight through where the Wickling
//                 was, then gutters (0.6 s) and resumes circling. hp 32.
// All four respect exit zones (never move/attack into the 3.5 tiles inside a doorway, never start an attack while the
// Wickling stands in one), beats (`range` / `leash` props), ledges and hazard tiles.
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
  const glow = (ctx, x, y, r, c, a) => { if (a > 0.003 && G.fx && G.fx.glowAt) G.fx.glowAt(ctx, x, y, r, c, a); };
  const CH = () => (G.Art && G.Art.char) || null;
  const burst = (k, x, y, o) => { if (G.fx) G.fx.burst(k, x, y, o); };
  const sfx = (name, x, o) => { if (G.sfxAt) G.sfxAt(name, x, o); };

  // ------------------------------------------------------------------ sfx (defined only if the audio module lacks them)
  (function defineSfx() {
    const A = G.Audio;
    if (!A || typeof A.defineSfx !== 'function') return;
    const have = typeof A.sfxNames === 'function' ? A.sfxNames() : [];
    const def = (name, o) => { if (have.indexOf(name) < 0) A.defineSfx(name, o); };
    def('mold_squelch', {     // a soft wet wax "plap" as a moldling hops / lands
      vol: 2.6, reverb: 0.12,
      play(k) {
        const v = k.r(0.88, 1.14);
        k.tone({ f: 210 * v, f1: 120 * v, glide: 0.08, type: 'sine', a: 0.003, d: 0.12, g: 0.16 });
        k.noise({ color: 'brown', lp: 900 * v, a: 0.002, d: 0.09, g: 0.2 });
        k.noise({ color: 'pink', bp: 1400 * v, bp1: 700 * v, Q: 2, a: 0.004, d: 0.1, g: 0.05, sweep: 0.08 });
      },
    });
    def('mold_splat', {       // a heavy belly-flop of soft wax: thump + wet spatter
      vol: 3.2, reverb: 0.18,
      play(k) {
        const v = k.r(0.9, 1.1);
        k.tone({ f: 130 * v, f1: 58 * v, glide: 0.14, a: 0.002, d: 0.24, g: 0.24 });
        k.noise({ color: 'brown', lp: 1200 * v, a: 0.002, d: 0.22, g: 0.3 });
        k.noise({ color: 'pink', bp: 2600 * v, bp1: 1200 * v, Q: 1.4, a: 0.01, d: 0.26, g: 0.08, sweep: 0.2 });
      },
    });
    def('ladle_scoop', {      // iron ladle dipped into molten wax: a low slosh + scrape + bubbling
      vol: 3, reverb: 0.2,
      play(k) {
        const v = k.r(0.94, 1.06);
        k.noise({ color: 'brown', lp: 700 * v, lp1: 1500 * v, a: 0.05, d: 0.4, g: 0.26, sweep: 0.3 });
        k.noise({ bp: 1900 * v, Q: 6, a: 0.02, d: 0.22, g: 0.04 });
        for (let i = 0; i < 4; i++) k.tone({ f: 260 * v * k.r(0.8, 1.3), f1: 520 * v, glide: 0.05, type: 'sine', a: 0.002, d: 0.06, g: 0.05, at: 0.12 + i * 0.07 });
      },
    });
    def('ladle_fling', {      // the ladle swung over the head: a heavy whoosh with a molten gloop
      vol: 3.2, reverb: 0.15,
      play(k) {
        const v = k.r(0.94, 1.06);
        k.noise({ bp: 380 * v, bp1: 1500 * v, Q: 1.1, a: 0.02, d: 0.28, g: 0.18, sweep: 0.22 });
        k.tone({ f: 170 * v, f1: 330 * v, glide: 0.1, type: 'sine', a: 0.004, d: 0.12, g: 0.1, at: 0.08 });
      },
    });
    def('wax_sizzle', {       // molten wax on stone: a hot crackling hiss
      vol: 2.8, reverb: 0.12,
      play(k) {
        const v = k.r(0.9, 1.1);
        k.noise({ hp: 2600 * v, a: 0.004, hold: 0.06, d: 0.5, g: 0.09 });
        k.noise({ bp: 4200 * v, bp1: 2600 * v, Q: 1.2, a: 0.003, d: 0.35, g: 0.07, sweep: 0.3 });
        k.noise({ color: 'brown', lp: 800, a: 0.001, d: 0.1, g: 0.18 });
      },
    });
    def('slime_gurgle', {     // a wet, bubbling tremble (drip slime about to fall / rear)
      vol: 2.6, reverb: 0.2,
      play(k) {
        const v = k.r(0.9, 1.1);
        k.tone({ f: 150 * v, f1: 95 * v, glide: 0.35, type: 'triangle', a: 0.03, d: 0.4, g: 0.08, vib: { rate: 18, depth: 160 } });
        for (let i = 0; i < 5; i++) k.tone({ f: 320 * v * k.r(0.8, 1.4), f1: 640 * v, glide: 0.04, type: 'sine', a: 0.002, d: 0.05, g: 0.045, at: 0.05 + i * 0.07 });
        k.noise({ color: 'brown', lp: 600, a: 0.04, d: 0.35, g: 0.08 });
      },
    });
    def('wisp_flare', {       // a flame flaring up: rising roar ("whumm")
      vol: 3, reverb: 0.2,
      play(k) {
        const v = k.r(0.95, 1.05);
        k.noise({ color: 'pink', bp: 500 * v, bp1: 2200 * v, Q: 0.9, a: 0.25, hold: 0.12, d: 0.3, g: 0.2, sweep: 0.45 });
        k.noise({ color: 'brown', lp: 500 * v, lp1: 1200 * v, a: 0.2, d: 0.35, g: 0.18, sweep: 0.4 });
        k.tone({ f: 90 * v, f1: 150 * v, glide: 0.45, type: 'triangle', a: 0.2, d: 0.25, g: 0.07 });
      },
    });
    def('wisp_dash', {        // a fast fiery rush
      vol: 3, reverb: 0.15,
      play(k) {
        const v = k.r(0.94, 1.08);
        k.noise({ bp: 1600 * v, bp1: 500 * v, Q: 1, a: 0.01, d: 0.32, g: 0.22, sweep: 0.3 });
        k.noise({ color: 'brown', lp: 900, a: 0.005, d: 0.25, g: 0.14 });
      },
    });
  })();

  // Region creature colours: the forges are rust & iron with bright molten orange; each kind reads against the dark
  // rust-brown by a different value: moldlings by pale raw wax, brutes by grimy tallow + a lit visor and a glowing
  // bowl, drip slimes by glowing amber, wisps by being living flame.
  const CL = {
    outline: '#0d0806', tele: '#ffc070', molten: '#ff8a20', moltenHot: '#ffc35a', moltenCore: '#fff0c4',
    ash: '#5a4a40', soot: '#2a1d17',
  };

  // ------------------------------------------------------------------ shared: exit zones, beats, hazards, landings
  /** Exit zones of the enemy's room: each opening's boundary run (±1 tile) and 3.5 tiles inward (wide N openings =
   *  open sky are skipped; wide S openings = pits are kept, so nothing wanders over a chasm). */
  function exitZones(e) {
    const room = e.room;
    if (e._zones && e._zonesRoom === room) return e._zones;
    const out = [];
    if (room) {
      const W = room.widthPx, H = room.heightPx, D = 3.5 * TILE;
      const pad = e.flying ? 2 * TILE : 0;                 // flyers also keep clear of the air above/beside a doorway
      for (const o of room.openings || []) {
        if (o.side === 'N' && o.size > 8) continue;
        const a = (o.pos - 1) * TILE - pad, b = (o.pos + o.size + 1) * TILE + pad;
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
  const pCenter = (p) => ({ x: p.x + p.w / 2, y: p.y + p.h / 2 });
  /** The Wickling stands in an exit zone (just came in / about to leave): no attacks that would follow it there. */
  function playerInZone(e) {
    const p = e.player;
    if (!p) return false;
    const c = pCenter(p);
    return !!inZone(e, c.x, c.y);
  }
  function propTiles(e, name, def) { const v = +e.props[name]; return (v > 0 ? v : def) * TILE; }
  const tileAt = (room, c, r) => (room ? room.tileAt(c, r) : 0);
  const isSolid = (code) => G.Physics.isSolidTile(code);
  const isHaz = (code) => G.Physics.isHazardTile(code);
  const standable = (code) => isSolid(code) || code === G.T.PLATFORM;

  /**
   * Safe landing for a hopping ground body: feet x within `want` px (shrinks toward the current spot), on solid or
   * platform floor at most 2 rows up / 3 rows down, inside the beat (home ± range), not in an exit zone, no hazard
   * tile at or beside the landing, the straight arc clear of walls. Returns {x, y (feet)} or null.
   */
  function findLanding(e, want, range, minD) {
    const room = e.room;
    if (!room) return null;
    const dir = want >= 0 ? 1 : -1;
    const r0 = Math.floor((e.bottom - 2) / TILE);
    const lo = minD == null ? 0.5 * TILE : minD;
    for (let d = Math.abs(want); d >= lo; d -= TILE * 0.25) {
      const x = e.cx + dir * d;
      if (e.home && Math.abs(x - e.home.x) > range) continue;
      if (x - e.w / 2 < TILE * 0.5 || x + e.w / 2 > room.widthPx - TILE * 0.5) continue;
      for (let dr = -2; dr <= 3; dr++) {
        const r = r0 + dr;
        const cl = Math.floor((x - e.w / 2 + 3) / TILE), cr = Math.floor((x + e.w / 2 - 3) / TILE), cm = Math.floor(x / TILE);
        if (!standable(tileAt(room, cm, r + 1)) || !standable(tileAt(room, cl, r + 1)) || !standable(tileAt(room, cr, r + 1))) continue;
        const y = (r + 1) * TILE;
        if (G.Physics.rectSolid(room, x - e.w / 2, y - e.h - 2, e.w, e.h)) continue;
        if (inZone(e, x, y - e.h / 2) || inZone(e, x - e.w / 2, y - e.h / 2) || inZone(e, x + e.w / 2, y - e.h / 2)) continue;
        let haz = false;
        for (let c = cl - 1; c <= cr + 1 && !haz; c++) if (isHaz(tileAt(room, c, r)) || isHaz(tileAt(room, c, r + 1))) haz = true;
        if (haz) continue;
        let blocked = false;
        for (let q = 0.2; q <= 1.001 && !blocked; q += 0.2) {
          const sx = lerp(e.cx, x, q), sy = lerp(e.cy, y - e.h / 2, q) - 30 * Math.sin(q * Math.PI);
          if (G.Physics.rectSolid(room, sx - e.w / 2 + 3, sy - e.h / 2 + 3, e.w - 6, e.h - 6)) blocked = true;
        }
        if (!blocked) return { x, y };
        break;
      }
    }
    return null;
  }
  /** Knockback never pushes a ground body off a ledge, onto a hazard or into an exit zone. */
  function guardKnockback(e) {
    if (!(e.kbTime > 0) || !e.kbVx || e.flying) return;
    const d = e.kbVx > 0 ? 1 : -1;
    if (!e.grounded || e.ledgeAhead(d, 6) || e.hazardAhead(d, 6) || inZone(e, e.cx + d * TILE, e.cy)) e.kbVx = 0;
  }
  /** Can a ground body take a step in dir: inside its beat, out of exit zones, no wall/ledge/hazard ahead. */
  function canStep(e, dir, beat, homeX) {
    const ax = e.cx + dir * (e.w / 2 + 12);
    if (inZone(e, ax, e.cy)) return false;
    const room = e.room, c = Math.floor(ax / TILE);
    if (room && (isHaz(tileAt(room, c, Math.floor((e.bottom + 2) / TILE))) || isHaz(tileAt(room, c, Math.floor((e.bottom - 4) / TILE))))) return false;
    const hx = homeX == null ? (e.home ? e.home.x : e.cx) : homeX;
    if (Math.abs(ax - hx) > beat + TILE * 0.5 && (ax - hx) * dir > 0) return false;
    return !e.blockedAhead(dir);
  }

  /** Spatters of wax on the floor around (x, y): little flattened drops (death / belly-flop remains). */
  function spatter(ctx, x, y, n, spread, seed, color, a) {
    ctx.save(); ctx.globalAlpha *= a == null ? 1 : a;
    for (let i = 0; i < n; i++) {
      const dx = (h01(i, seed) - 0.5) * 2 * spread, r = 1.6 + h01(i + 9, seed) * 3;
      ctx.fillStyle = 'rgba(13,8,6,0.55)';
      ctx.beginPath(); ctx.ellipse(x + dx, y - r * 0.25, r + 0.8, r * 0.45 + 0.6, 0, 0, TAU); ctx.fill();
      ctx.fillStyle = color;
      ctx.beginPath(); ctx.ellipse(x + dx, y - r * 0.3, r, r * 0.5, 0, 0, TAU); ctx.fill();
    }
    ctx.restore();
  }

  // =====================================================================================================
  // moldling
  // =====================================================================================================
  const MO_SCALE = 1.13;                                    // art drawn at 34x30, scaled up around the feet
  const MO = { wax: '#cbb48b', waxHi: '#f1e1bb', waxDark: '#7d6649', seam: '#6a5238', rim: '#ffb46a', inner: '#ff8a2a', puddle: '#b39c74' };

  class Moldling extends G.Enemy {
    constructor(props) {
      super(props, {
        hp: 30, w: 38, h: 34,
        cinders: [5, 8],
        weight: 0.8,
        sight: 8 * TILE,
        colors: { body: MO.wax, dark: MO.waxDark, hit: '#fff4dc', smoke: '#6a5a4a', puddle: MO.puddle, tele: CL.tele },
        puddleW: 22,
      });
      this.squash = 0;           // + crouched, - stretched
      this.heat = 0;             // molten light cracking through (telegraph)
      this.splat = 0;            // flattened after a belly-flop
      this.wob = Math.random() * TAU;
      this.hurtT = 0;
      this.lean = 0;
    }
    init() {
      super.init();
      this.setState('idle');
      this.cooldown('hop', rnd(0.6, 1.1));                 // entry grace
      this.cooldown('pounce', rnd(1.2, 1.8));
      if (this.props.aggro) this.aggro = true;
    }
    beat() { return this.aggro ? 40 * TILE : propTiles(this, 'range', 6); }
    sees(p) {
      if (!this.targetable(p)) return false;
      if (this.aggro) return true;
      return this.canSee(p) && Math.abs(this.dy(p)) < 4 * TILE;
    }
    whileStunned() { guardKnockback(this); }
    think(dt) {
      guardKnockback(this);
      const p = this.player;
      this.wob += dt * (this.is('windup') ? 14 : 3);
      if (this.hurtT > 0) this.hurtT -= dt;
      const air = this.airborne || !this.grounded;
      let tgtSq = 0;
      if (this.is('squat')) tgtSq = 0.22;
      else if (this.is('windup')) tgtSq = 0.42;
      else if (air) tgtSq = this.vy < 0 ? -0.2 : -0.08;
      this.squash = toward(this.squash, tgtSq, dt * (this.is('windup') ? 1.6 : 4.5));
      this.heat = toward(this.heat, this.is('windup') ? 1 : 0, dt * (this.is('windup') ? 2.6 : 1.6));
      this.splat = toward(this.splat, this.is('splat') && this.stateTime < 0.45 ? 1 : 0, dt * (this.is('splat') ? 9 : 2.4));
      this.lean = toward(this.lean, air ? clamp(this.vx / 260, -1, 1) : 0, dt * 5);
      switch (this.state) {
        case 'idle': {
          this.stop(1800);
          if (!this.grounded) break;
          const sees = this.sees(p);
          if (sees) {
            this.face(p);
            const adx = Math.abs(this.dx(p));
            if (adx < 3.8 * TILE && this.ready('pounce') && !playerInZone(this) && this.dy(p) > -3 * TILE) {
              if (findLanding(this, this.pounceWant(), this.beat() + TILE, 0.9 * TILE)) { this.setState('windup'); break; }
            }
            if (this.ready('hop') && adx > 1.2 * TILE) {
              const want = this.facing * rnd(1.0, 1.6) * TILE;
              const land = findLanding(this, want, this.beat(), 0.6 * TILE);
              if (land) this.setState('squat', { land, chase: true });
              else this.cooldown('hop', 0.5);
            }
          } else if (this.ready('hop') && this.stateTime > 1.2) {
            const off = this.cx - this.home.x;
            const dir = Math.abs(off) > this.beat() * 0.5 ? (off > 0 ? -1 : 1) : (Math.random() < 0.5 ? -1 : 1);
            this.facing = dir;
            const land = findLanding(this, dir * rnd(0.8, 1.2) * TILE, this.beat(), 0.6 * TILE);
            if (land) this.setState('squat', { land, chase: false });
            else this.cooldown('hop', 1.2);
          }
          break;
        }
        case 'squat':                                       // a quick anticipation before a travelling hop
          this.stop(2400);
          if (this.stateTime > 0.16) {
            const L = this.stateData.land;
            this.leapTo(L.x, L.y, 26 + Math.random() * 10);
            sfx('mold_squelch', this.cx, { vol: 0.5, pitch: rnd(1.0, 1.25) });
            this.cooldown('hop', this.stateData.chase ? rnd(0.18, 0.32) : rnd(1.3, 2.4));
            this.setState('hop');
          }
          break;
        case 'hop':
          if (this.grounded && this.stateTime > 0.06) {
            this.vx = 0;
            sfx('mold_squelch', this.cx, { vol: 0.45, pitch: rnd(0.8, 0.95) });
            burst('wax', this.cx, this.bottom - 2, { count: 2, color: MO.wax, speed: 80 });
            this.squash = 0.2;
            this.setState('idle');
          } else if (this.stateTime > 2) this.setState('idle');
          break;
        case 'windup': {                                    // TELEGRAPH: crouches low, molten light cracks through
          this.stop(2400);
          if (this.once('tele')) this.stateData.w = this.telegraph(0.45, { color: CL.tele, shake: 1.5, vol: 0.6, y: this.y + 6 });
          if (this.targetable(p) && this.stateTime < this.stateData.w * 0.6) this.face(p);
          if (this.stateTime >= this.stateData.w) this.pounce();
          break;
        }
        case 'pounce':
          if (this.grounded && this.stateTime > 0.08) {
            this.vx = 0;
            sfx('mold_splat', this.cx, { vol: 0.85 });
            burst('wax', this.cx, this.bottom - 3, { count: 7, color: MO.wax, speed: 170 });
            burst('dust', this.cx, this.bottom, { count: 5, color: '#5a4436' });
            this.setState('splat');
          } else if (this.stateTime > 2.2) this.setState('splat');
          break;
        case 'splat':                                        // recovery: flattened, punishable
          this.stop();
          if (this.stateTime > 0.62) { this.cooldown('pounce', rnd(1.5, 2.2)); this.cooldown('hop', 0.25); this.setState('idle'); }
          break;
        default: this.setState('idle');
      }
    }
    /** Belly-flop target offset: onto the Wickling (a little past it when close), 1.1..4 tiles. */
    pounceWant() {
      const p = this.player;
      if (!this.targetable(p)) return this.facing * 2 * TILE;
      const dx = this.dx(p), d = dx === 0 ? this.facing : Math.sign(dx);
      return d * clamp(Math.abs(dx) + 0.3 * TILE, 1.1 * TILE, 4 * TILE);
    }
    pounce() {
      const land = findLanding(this, this.pounceWant(), this.beat() + TILE, 0.5 * TILE);
      const dx = land ? land.x - this.cx : 0;
      this.leapTo(this.cx + dx, land ? land.y : this.bottom, 78 + Math.min(40, Math.abs(dx) * 0.2));
      if (Math.abs(dx) < 2) this.vx = 0;
      sfx('mold_squelch', this.cx, { vol: 0.8, pitch: 0.75 });
      burst('wax', this.cx, this.bottom - 2, { count: 3, color: MO.wax, speed: 120 });
      this.setState('pounce');
    }
    onHurt(hit) {
      this.hurtT = 0.2;
      if (this.is('idle') && hit && hit.source) this.face(hit.source);
    }
    drawPuddle(ctx, x, y, p) {                               // raw wax, no wick: a puddle ringed by spatters
      this.puddleWick = false;
      super.drawPuddle(ctx, x, y, p);
      spatter(ctx, x, y, 5, 24 + 10 * p, this.seed, MO.wax, Math.min(1, p * 1.5));
    }
    onDeath() {
      // splatters: a wet burst of raw wax (the base melts the rest into a puddle)
      burst('wax', this.cx, this.cy, { count: 14, color: MO.wax, speed: 240 });
      burst('wax', this.cx, this.cy, { count: 6, color: MO.waxHi, speed: 160 });
      sfx('mold_splat', this.cx, { vol: 0.9, pitch: 1.15 });
    }
    drawBounds() { return { x: this.x - 26, y: this.y - 30, w: this.w + 52, h: this.h + 36 }; }
    drawBody(ctx, t) {
      const fx = this.cx, fy = this.y + this.h;
      ctx.save(); ctx.translate(fx, fy); ctx.scale(MO_SCALE, MO_SCALE); ctx.translate(-fx, -fy);
      drawMoldling(ctx, this.cx, this.y + this.h, this.facing, t, {
        squash: this.squash, heat: this.heat, splat: this.splat, wob: this.wob, hurt: this.hurtT, seed: this.seed,
        air: !this.grounded, lean: this.lean, tele: this.telegraphing,
      });
      ctx.restore();
    }
    drawCorpse(ctx, t) {
      const fx = this.cx, fy = this.y + this.h;
      ctx.save(); ctx.translate(fx, fy); ctx.scale(MO_SCALE, MO_SCALE); ctx.translate(-fx, -fy);
      drawMoldling(ctx, this.cx, this.y + this.h, this.facing, t, { squash: 0.3, splat: 1, wob: 0, seed: this.seed, dead: true });
      ctx.restore();
    }
  }

  /** Moldling art: feet centre (fx, fy), facing f. */
  function drawMoldling(ctx, fx, fy, f, t, s) {
    const ch = CH();
    const sq = s.squash || 0, sp = s.splat || 0;
    const sx = 1 + sq * 0.42 + sp * 0.5, sy = 1 - sq * 0.5 - sp * 0.45;
    const wob = Math.sin(s.wob || 0);
    const rx = 17 * sx * (1 + wob * 0.03), ry = 26 * sy * (1 - wob * 0.035);
    const seed = s.seed || 0;
    const lean = (s.lean || 0) * 6;
    if (ch) ch.shadow(ctx, fx, fy, 20 * sx, s.air ? 0.25 : 0.5);
    if (!ch) { ctx.fillStyle = MO.wax; ctx.fillRect(fx - rx, fy - ry, rx * 2, ry); return; }
    // body: a soft lopsided dome (its crown slumps toward the back) on a spreading foot of wax
    const pts = [];
    const N = 14, top = fy - ry;
    for (let i = 0; i <= N; i++) {
      const k = i / N, a = Math.PI + k * Math.PI;
      const lump = 1 + (h01(i, seed) - 0.5) * 0.07;
      let lx = Math.cos(a) * rx * lump, ly = Math.sin(a) * ry * lump;
      ly *= 1 - 0.12 * Math.pow(Math.cos(a), 4);                       // fuller shoulders
      lx -= f * 3 * Math.max(0, -Math.sin(a)) * Math.max(0, -Math.sin(a));   // crown slumps back
      pts.push([fx + lx + lean * (-ly / ry), fy + ly]);
    }
    const path = new Path2D();
    const footL = fx - rx - 4 * sx, footR = fx + rx + 4 * sx;
    path.moveTo(footL, fy);
    path.quadraticCurveTo(pts[0][0] + 1, fy - 2, (pts[0][0] + pts[1][0]) / 2, (pts[0][1] + pts[1][1]) / 2 - 2);
    for (let i = 1; i < N; i++) path.quadraticCurveTo(pts[i][0], pts[i][1], (pts[i][0] + pts[i + 1][0]) / 2, (pts[i][1] + pts[i + 1][1]) / 2);
    path.quadraticCurveTo(pts[N][0] - 1, fy - 2, footR, fy);
    path.quadraticCurveTo(fx, fy + 2, footL, fy);
    path.closePath();
    // casting flash: a thin ragged fin of wax left along the mold seam over the crown (behind the body)
    if (sp < 0.7) {
      const fin = new Path2D();
      const n = 8, rim = (k, out) => {
        const a = Math.PI * (1.26 + 0.5 * k), sn = Math.sin(a);
        const bx = fx + Math.cos(a) * rx * 0.985 - f * 3 * sn * sn + lean * (-sn), byy = fy + sn * ry * 0.975 * (1 - 0.12 * Math.pow(Math.cos(a), 4));
        return [bx + Math.cos(a) * out, byy + sn * out];
      };
      for (let i = 0; i <= n; i++) {
        const out = (i === 0 || i === n) ? 0 : (i % 2 ? 2.4 + 2.8 * h01(i + 20, seed) : 1.2);
        const q = rim(i / n, out);
        if (i === 0) fin.moveTo(q[0], q[1]); else fin.lineTo(q[0], q[1]);
      }
      for (let i = n; i >= 0; i--) { const q = rim(i / n, -1.5); fin.lineTo(q[0], q[1]); }
      fin.closePath();
      ctx.lineJoin = 'round';
      ctx.strokeStyle = CL.outline; ctx.lineWidth = 2; ctx.stroke(fin);
      ctx.fillStyle = '#e2cfa4'; ctx.fill(fin);
    }
    const box = [fx - rx - 4, top - 2, fx + rx + 4, fy];
    ch.shape(ctx, path, { fill: MO.wax, box, rim: MO.rim, rimWidth: 2.2, shade: 0.42, hi: 0.22, shadeColor: '#2a1608' });
    ctx.save();
    ctx.clip(path);
    // mold seam: a raised ridge running over the crown, front of centre
    const seamX = fx + f * rx * 0.18 + lean * 0.5;
    ctx.strokeStyle = MO.seam; ctx.lineWidth = 2;
    ctx.beginPath(); ctx.moveTo(seamX - f * 3, top - 2); ctx.quadraticCurveTo(seamX + f * 3, fy - ry * 0.5, seamX - f * 1, fy + 2); ctx.stroke();
    ctx.strokeStyle = 'rgba(255,240,210,0.45)'; ctx.lineWidth = 1;
    ctx.beginPath(); ctx.moveTo(seamX - f * 3 - 1.6, top - 2); ctx.quadraticCurveTo(seamX + f * 3 - 1.6, fy - ry * 0.5, seamX - f * 1 - 1.6, fy + 2); ctx.stroke();
    // pooled foot: the wax that ran down and set darker around its base
    ctx.fillStyle = 'rgba(70,40,20,0.35)';
    ctx.beginPath(); ctx.ellipse(fx, fy + 1, rx + 6, 4.5, 0, 0, TAU); ctx.fill();
    // molten light cracking through (telegraph / heat)
    const heat = s.heat || 0;
    if (heat > 0.02) {
      glow(ctx, fx, fy - ry * 0.45, rx * 1.4, CL.molten, 0.55 * heat);
      ctx.strokeStyle = heat > 0.6 ? CL.moltenHot : CL.molten; ctx.lineWidth = 1.2 + heat * 1.2; ctx.lineCap = 'round';
      ctx.globalAlpha = Math.min(1, heat * 1.3);
      for (let i = 0; i < 4; i++) {
        const a0 = -Math.PI * (0.15 + 0.23 * i) - 0.2 * h01(i, seed);
        const x0 = fx + Math.cos(a0) * rx * 0.25, y0 = fy - ry * 0.4 + Math.sin(a0) * ry * 0.2;
        const x1 = fx + Math.cos(a0) * rx * 0.95, y1 = fy - ry * 0.4 + Math.sin(a0) * ry * 0.75;
        ctx.beginPath(); ctx.moveTo(x0, y0); ctx.lineTo(lerp(x0, x1, 0.5) + 2, lerp(y0, y1, 0.5) - 1); ctx.lineTo(x1, y1); ctx.stroke();
      }
      ctx.globalAlpha = 1;
    }
    // drips running down the flanks
    for (let i = 0; i < 2; i++) {
      const side = i ? -1 : 1, dx = fx + side * rx * (0.62 + 0.1 * h01(i + 3, seed));
      const len = 5 + 4 * h01(i + 5, seed);
      ctx.fillStyle = MO.waxHi; ctx.globalAlpha = 0.5;
      ctx.beginPath(); ctx.ellipse(dx, fy - ry * 0.45 + len * 0.5, 1.6, len * 0.6, 0, 0, TAU); ctx.fill();
      ctx.globalAlpha = 1;
    }
    ctx.restore();
    // stub of an arm, half-formed, growing out of the front flank
    if (sp < 0.6) {
      const ax = fx + f * (rx * 0.74), ay = fy - ry * 0.32;
      const ap = new Path2D();
      ap.ellipse(ax + f * 2, ay + (s.air ? -3 : 1.5), 5.5, 3.6, f * (s.air ? -0.7 : 0.55), 0, TAU);
      ch.shape(ctx, ap, { fill: MO.wax, lw: 1.6, box: [ax - 4, ay - 5, ax + 7, ay + 5], shade: 0.45, shadeColor: '#2a1608' });
      ctx.fillStyle = MO.wax;                                  // blend the joint into the body
      ctx.beginPath(); ctx.ellipse(ax - f * 1.5, ay + 1, 3.6, 3.2, 0, 0, TAU); ctx.fill();
    }
    // face: lopsided ember eyes pressed into unfinished wax (one larger), no mouth
    if (!s.dead) {
      const ey = fy - ry * 0.42, ex = fx + f * rx * 0.36 + lean * 0.4;
      const blink = ch.blinkAt ? ch.blinkAt(t, seed, 3.4) : 0;
      const hurt = (s.hurt || 0) > 0;
      // sockets
      ctx.fillStyle = 'rgba(60,36,20,0.55)';
      ctx.beginPath(); ctx.ellipse(ex - f * 5.5, ey, 4.4, 4, 0, 0, TAU); ctx.fill();
      ctx.beginPath(); ctx.ellipse(ex + f * 4, ey + 1, 3.4, 3.1, 0, 0, TAU); ctx.fill();
      const col = s.tele ? CL.moltenCore : '#ff9a3a';
      ch.eyes(ctx, ex - f * 5.5, ey, { kind: 'ember', size: hurt ? 3.2 : 5.2, gap: 0, blink: hurt ? 0.7 : blink, color: col });
      ch.eyes(ctx, ex + f * 4, ey + 1, { kind: 'ember', size: hurt ? 2.4 : 3.8, gap: 0, blink: hurt ? 0.7 : blink, color: col });
      // a mouth that was never finished: a little pressed-in hole, gaping in the wind-up
      const mo = (s.heat || 0) * 1.6 + (hurt ? 1 : 0);
      ctx.fillStyle = 'rgba(48,26,14,0.85)';
      ctx.beginPath(); ctx.ellipse(ex - f * 0.5, ey + 7 + mo * 0.5, 2 + mo * 0.5, 1.3 + mo, 0, 0, TAU); ctx.fill();
    } else {
      ctx.strokeStyle = 'rgba(60,36,20,0.7)'; ctx.lineWidth = 1.4;
      const ey = fy - ry * 0.45;
      ctx.beginPath(); ctx.moveTo(fx - 7, ey); ctx.lineTo(fx - 2, ey); ctx.moveTo(fx + 3, ey + 1); ctx.lineTo(fx + 7, ey + 1); ctx.stroke();
    }
    if (sp > 0.05) spatter(ctx, fx, fy, 5, rx + 10, seed + 2, MO.wax, sp);
  }
  G.registerEnemy('moldling', Moldling);

  // =====================================================================================================
  // drip_slime
  // =====================================================================================================
  const DS = { body: '#c85a1c', mid: '#ef8a2c', core: '#ffc25a', hi: '#fff0c0', crust: '#4a2614', crustHi: '#7a4024', eye: '#160a05', puddle: '#b4561e' };

  class DripSlime extends G.Enemy {
    constructor(props) {
      super(props, {
        hp: 35, w: 34, h: 26,
        cinders: [5, 8],
        weight: 0.9,
        sight: 8 * TILE,
        colors: { body: DS.mid, dark: DS.crust, hit: '#fff2d8', smoke: '#5a3a2a', puddle: DS.puddle, tele: CL.tele },
        light: { r: 58, color: '#ff8a30', intensity: 0.32, dx: 0, dy: 0, flicker: false },
        puddleW: 22,
      });
      this.hanging = false;
      this.stretch = 0;          // hanging: droplet stretching down (telegraph); floor: rearing up
      this.flat = 0;             // splatted after a fall / lunge
      this.crawlPh = Math.random() * TAU;
      this.hurtT = 0;
      this.dripT = rnd(0.6, 2);
    }
    init() {
      super.init();
      const surf = this.props.surface || 'auto';
      if (surf !== 'floor') {
        const reach = +this.props.reach > 0 ? +this.props.reach : 10;
        const room = this.room;
        const c0 = Math.floor((this.x + 2) / TILE), c1 = Math.floor((this.x + this.w - 3) / TILE);
        const rTop = Math.floor((this.y - 1) / TILE);
        for (let r = rTop + 1; r >= rTop - reach && r >= -1; r--) {
          let solid = r < 0;
          for (let c = c0; c <= c1 && !solid; c++) if (isSolid(tileAt(room, c, r))) solid = true;
          if (solid) {
            const ceil = (r + 1) * TILE;
            if (ceil <= this.y + this.h) { this.y = ceil; this.hanging = true; }
            break;
          }
        }
      }
      if (this.hanging) { this.gravityScale = 0; this.vx = this.vy = 0; this.setState('hang'); }
      else this.setState('crawl');
      this.beatX = this.cx;
      this.cooldown('lunge', rnd(0.8, 1.4));
      this.cooldown('drop', 0.6);
    }
    beat() { return propTiles(this, 'range', 5); }
    /** Lunge target offset: through the Wickling's position (at least 1.2 tiles, at most 2.8). */
    lungeWant() {
      const p = this.player;
      if (!this.targetable(p)) return this.facing * 2 * TILE;
      const dx = this.dx(p), d = dx === 0 ? this.facing : Math.sign(dx);
      return d * clamp(Math.abs(dx) + 0.6 * TILE, 1.2 * TILE, 2.8 * TILE);
    }
    /** Feet y of the floor straight below the hanging body, or null when the drop would land on a hazard, in an exit
     *  zone or fall out of the room. */
    dropLanding() {
      const room = this.room;
      if (!room) return null;
      const c0 = Math.floor((this.x + 3) / TILE), c1 = Math.floor((this.x + this.w - 4) / TILE);
      for (let r = Math.floor(this.bottom / TILE); r < room.rows; r++) {
        let stand = false;
        for (let c = c0; c <= c1; c++) {
          const code = tileAt(room, c, r);
          if (isHaz(code)) return null;
          if (standable(code)) stand = true;
        }
        if (stand) {
          const y = r * TILE;
          if (inZone(this, this.cx, y - this.h / 2)) return null;
          for (let c = c0 - 1; c <= c1 + 1; c++) if (isHaz(tileAt(room, c, r)) || isHaz(tileAt(room, c, r - 1))) return null;
          return y;
        }
      }
      return null;
    }
    letGo(harmless) {
      this.hanging = false;
      this.gravityScale = 1;
      this.vy = 40; this.vx = 0;
      if (harmless) this.contactDamage = 0;
      this.setState('drop', { harmless: !!harmless });
    }
    whileStunned(dt) {
      if (this.hanging) { this.kbTime = 0; this.vx = this.vy = 0; }
      guardKnockback(this);
      void dt;
    }
    think(dt) {
      const p = this.player;
      if (this.hurtT > 0) this.hurtT -= dt;
      if (this.hanging) { this.kbTime = 0; this.vx = 0; this.vy = 0; }
      else guardKnockback(this);
      const air = !this.hanging && !this.grounded;
      let tgtStretch = 0;
      if (this.is('tremble')) tgtStretch = 1;
      else if (this.is('rear')) tgtStretch = 1;
      else if (air) tgtStretch = 0.6;
      this.stretch = toward(this.stretch, tgtStretch, dt * (this.is('tremble') || this.is('rear') ? 2.4 : 5));
      this.flat = toward(this.flat, this.is('splat') && this.stateTime < 0.35 ? 1 : 0, dt * (this.is('splat') ? 10 : 2.6));
      if (Math.abs(this.vx) > 4 && this.grounded) this.crawlPh += dt * Math.abs(this.vx) * 0.12;
      else this.crawlPh += dt * 1.5;
      switch (this.state) {
        case 'hang': {
          this.dripT -= dt;
          if (this.dripT <= 0) {
            this.dripT = rnd(1.2, 2.4);
            burst('drip', this.cx + rnd(-6, 6), this.bottom + 2, { count: 1, color: DS.mid });
          }
          if (!this.ready('drop') || !this.targetable(p)) break;
          const pc = pCenter(p);
          const pdy = pc.y - this.bottom;
          const lead = clamp(p.vx || 0, -400, 400) * 0.3;
          const hx = Math.abs(pc.x + lead - this.cx), trig = (+this.props.trigger > 0 ? +this.props.trigger : 1.5) * TILE;
          if (pdy > 0 && pdy < 15 * TILE && (hx < trig || Math.abs(pc.x - this.cx) < trig * 0.7) && !playerInZone(this) && this.canSee(p, 16 * TILE)) {
            if (this.dropLanding() != null) this.setState('tremble');
            else this.cooldown('drop', 1);
          }
          break;
        }
        case 'tremble': {                                   // TELEGRAPH: shivers, the droplet under it stretches
          if (this.once('tele')) {
            this.stateData.w = this.telegraph(0.5, { color: CL.tele, shake: 2, vol: 0.55, y: this.bottom - 4 });
            sfx('slime_gurgle', this.cx, { vol: 0.75 });
          }
          if (this.every(0.12)) burst('drip', this.cx + rnd(-8, 8), this.bottom + 4, { count: 1, color: DS.mid });
          if (this.stateTime >= this.stateData.w) this.letGo(false);
          break;
        }
        case 'drop':
          if (this.grounded && this.stateTime > 0.04) {
            const harmless = !!this.stateData.harmless;
            if (!harmless) this.contactDamage = this.baseContact;
            this.vx = 0;
            this.beatX = this.cx; if (this.home) this.home.x = this.cx;
            sfx('mold_splat', this.cx, { vol: 0.75, pitch: 1.25 });
            burst('wax', this.cx, this.bottom - 3, { count: 8, color: DS.mid, speed: 170 });
            burst('ember', this.cx, this.bottom - 4, { count: 3, color: CL.molten, speed: 90 });
            this.setState('splat', { t: 0.55, harmless });
          } else if (this.stateTime > 4) { this.contactDamage = this.baseContact; this.setState('crawl'); }
          break;
        case 'splat':                                        // recovery (knocked loose: harmless for 0.35 s more)
          this.stop();
          if (this.stateData.harmless && this.stateTime > 0.35) { this.contactDamage = this.baseContact; this.stateData.harmless = false; }
          if (this.stateTime > (this.stateData.t || 0.55)) { this.contactDamage = this.baseContact; this.setState('crawl'); }
          break;
        case 'crawl': {
          if (!this.grounded) { this.stop(); break; }
          const sees = this.targetable(p) && this.canSee(p) && Math.abs(this.dy(p)) < 3 * TILE;
          if (sees) {
            this.face(p);
            const adx = Math.abs(this.dx(p));
            if (adx < 2.8 * TILE && Math.abs(this.dy(p)) < 1.2 * TILE && this.ready('lunge') && !playerInZone(this) &&
                findLanding(this, this.lungeWant(), this.beat() + 1.5 * TILE, 0.8 * TILE)) { this.setState('rear'); break; }
            if (adx > 0.9 * TILE && canStep(this, this.facing, this.beat(), this.beatX)) this.vx = this.facing * 50 * (0.75 + 0.35 * Math.max(0, Math.sin(this.crawlPh)));
            else this.stop(900);
          } else {
            if (!canStep(this, this.facing, this.beat(), this.beatX)) {
              this.stop(900);
              if (this.stateTime > 0.5) { this.facing = -this.facing; this.stateTime = 0; }
            } else this.vx = this.facing * 24 * (0.6 + 0.5 * Math.max(0, Math.sin(this.crawlPh)));
          }
          break;
        }
        case 'rear': {                                      // TELEGRAPH: rears up tall, quivering
          this.stop(2000);
          if (this.once('tele')) {
            this.stateData.w = this.telegraph(0.45, { color: CL.tele, shake: 1.6, vol: 0.55 });
            sfx('slime_gurgle', this.cx, { vol: 0.6, pitch: 1.2 });
          }
          if (this.targetable(p) && this.stateTime < this.stateData.w * 0.6) this.face(p);
          if (this.stateTime >= this.stateData.w) {
            const land = findLanding(this, this.lungeWant(), this.beat() + 1.5 * TILE, 0.6 * TILE);
            const dx = land ? land.x - this.cx : 0;
            this.leapTo(this.cx + dx, land ? land.y : this.bottom, 34);
            sfx('mold_squelch', this.cx, { vol: 0.7, pitch: 1.3 });
            this.setState('lunge');
          }
          break;
        }
        case 'lunge':
          if (this.grounded && this.stateTime > 0.06) {
            this.vx = 0;
            sfx('mold_squelch', this.cx, { vol: 0.6, pitch: 0.9 });
            burst('wax', this.cx, this.bottom - 3, { count: 4, color: DS.mid, speed: 110 });
            this.cooldown('lunge', rnd(1.6, 2.4));
            this.setState('splat', { t: 0.5 });
          } else if (this.stateTime > 2) this.setState('crawl');
          break;
        default: this.setState(this.hanging ? 'hang' : 'crawl');
      }
    }
    onHurt(hit) {
      this.hurtT = 0.2;
      if (this.hanging && !this.dying) { this.letGo(true); burst('drip', this.cx, this.y + 4, { count: 3, color: DS.mid }); }
      else if (this.is('crawl') && hit && hit.source) this.face(hit.source);
    }
    onDeath() {
      burst('wax', this.cx, this.cy, { count: 12, color: DS.mid, speed: 220 });
      burst('ember', this.cx, this.cy, { count: 5, color: CL.molten, speed: 140 });
      sfx('wax_sizzle', this.cx, { vol: 0.6 });
      if (this.hanging) { this.hanging = false; this.gravityScale = 1; }
    }
    drawPuddle(ctx, x, y, p) {                               // hot amber, cooling: the glow dies as it spreads
      this.puddleWick = false;
      super.drawPuddle(ctx, x, y, p);
      glow(ctx, x, y - 2, 26, '#ff8a30', 0.35 * (1 - p * 0.8));
      ctx.fillStyle = DS.core; ctx.globalAlpha = 1 - p * 0.7;
      ctx.beginPath(); ctx.ellipse(x - 3, y - 2.2, 7 * (0.5 + p * 0.5), 1.3, 0, 0, TAU); ctx.fill();
      ctx.globalAlpha = 1;
    }
    drawBounds() { return { x: this.x - 22, y: this.y - 34, w: this.w + 44, h: this.h + 62 }; }
    drawBody(ctx, t) {
      const s = { stretch: this.stretch, flat: this.flat, ph: this.crawlPh, hurt: this.hurtT, seed: this.seed, tele: this.telegraphing, air: !this.grounded && !this.hanging, rear: this.is('rear') };
      if (this.hanging) drawSlimeHang(ctx, this.cx, this.y, this.facing, t, s);
      else drawSlimeFloor(ctx, this.cx, this.y + this.h, this.facing, t, s);
    }
    drawCorpse(ctx, t) {
      drawSlimeFloor(ctx, this.cx, this.y + this.h, this.facing, t, { flat: 1, seed: this.seed, dead: true, ph: 0 });
    }
  }

  /** The slime's glowing jelly: fill + inner molten core + specular, clipped to the path; box = [x0, y0, x1, y1]. */
  function slimeJelly(ctx, path, box, coreX, coreY, coreR, s) {
    const ch = CH();
    if (ch) ch.outlineFill(ctx, path, DS.body, CL.outline, 2); else { ctx.fillStyle = DS.body; ctx.fill(path); }
    ctx.save();
    ctx.clip(path);
    const g = ctx.createRadialGradient(coreX, coreY, 1, coreX, coreY, coreR);
    const hot = s.tele ? 1 : 0;
    g.addColorStop(0, hot ? DS.hi : DS.core);
    g.addColorStop(0.45, hot ? DS.core : DS.mid);
    g.addColorStop(1, 'rgba(200,90,28,0)');
    ctx.fillStyle = g;
    ctx.fillRect(box[0] - 4, box[1] - 4, box[2] - box[0] + 8, box[3] - box[1] + 8);
    // bubbles drifting in the jelly
    const ph = s.ph || 0, seed = s.seed || 0;
    for (let i = 0; i < 4; i++) {
      const u = (ph * 0.13 + h01(i, seed)) % 1;
      const bx = lerp(box[0] + 6, box[2] - 6, h01(i + 4, seed)), by = lerp(box[3] - 3, box[1] + 4, u);
      ctx.strokeStyle = 'rgba(255,230,170,0.55)'; ctx.lineWidth = 1;
      ctx.beginPath(); ctx.arc(bx, by, 1.2 + 1.3 * h01(i + 8, seed), 0, TAU); ctx.stroke();
    }
    ctx.restore();
    if (ch) ch.rim(ctx, path, { color: '#ffd890', box, light: -1, width: 2, alpha: 0.7 });
  }
  /** Two beady black eyes with a glint. look = {x, y} px. */
  function beadyEyes(ctx, x, y, gap, r, look, blink, hurt) {
    for (const sd of [-1, 1]) {
      const ex = x + sd * gap / 2, ey = y;
      ctx.fillStyle = DS.eye;
      if (hurt) { ctx.strokeStyle = DS.eye; ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(ex - r, ey - r * 0.6); ctx.lineTo(ex + r, ey); ctx.lineTo(ex - r, ey + r * 0.6); ctx.stroke(); continue; }
      ctx.beginPath(); ctx.ellipse(ex, ey, r, Math.max(0.6, r * (1 - 0.9 * blink)), 0, 0, TAU); ctx.fill();
      if (blink < 0.5) {
        ctx.fillStyle = '#fff6e0';
        ctx.beginPath(); ctx.arc(ex + look.x * 0.5 - r * 0.32, ey + look.y * 0.5 - r * 0.35, r * 0.34, 0, TAU); ctx.fill();
      }
    }
  }
  /** Hanging pose: attached to the ceiling at (cx, topY), sagging down; s.stretch 0..1 pulls a droplet down. */
  function drawSlimeHang(ctx, cx, topY, f, t, s) {
    const st = s.stretch || 0, seed = s.seed || 0;
    const sh = s.tele ? Math.sin(t * 70) * 1.2 : 0;
    const w = 19 + Math.sin(t * 2.2 + seed) * 0.8, belly = 21 + st * 7;
    const x = cx + sh;
    const path = new Path2D();
    path.moveTo(x - w - 3, topY);
    path.lineTo(x + w + 3, topY);
    path.bezierCurveTo(x + w + 1, topY + belly * 0.45, x + w * 0.75, topY + belly, x + 6, topY + belly + 1);
    // droplet / stalk
    const dl = 4 + st * 13 + Math.sin(t * 3 + seed) * 1.5, dr = 4 + st * 2;
    path.quadraticCurveTo(x + 3, topY + belly + dl * 0.5, x + dr, topY + belly + dl);
    path.arc(x, topY + belly + dl, dr, 0, Math.PI, false);
    path.quadraticCurveTo(x - 3, topY + belly + dl * 0.5, x - 6, topY + belly + 1);
    path.bezierCurveTo(x - w * 0.75, topY + belly, x - w - 1, topY + belly * 0.45, x - w - 3, topY);
    path.closePath();
    const box = [x - w - 3, topY, x + w + 3, topY + belly + dl + dr];
    glow(ctx, x, topY + belly * 0.6, 38, '#ff8a30', 0.22 + st * 0.2);
    slimeJelly(ctx, path, box, x - 3, topY + belly * 0.55, w * 1.2, s);
    // the cooled crust where it clings
    ctx.save(); ctx.clip(path);
    ctx.fillStyle = DS.crust;
    ctx.beginPath(); ctx.moveTo(x - w - 4, topY - 1);
    for (let i = 0; i <= 6; i++) { const k = i / 6; ctx.lineTo(x - w - 4 + k * (w * 2 + 8), topY + 5 + 2.4 * h01(i, seed + 3)); }
    ctx.lineTo(x + w + 4, topY - 1); ctx.closePath(); ctx.fill();
    ctx.restore();
    // eyes looking down
    const blink = CH() && CH().blinkAt ? CH().blinkAt(t, seed, 4) : 0;
    beadyEyes(ctx, x + f * 2, topY + belly * 0.62, 11, 3, { x: f * 1, y: 2.5 }, s.tele ? 0 : blink, (s.hurt || 0) > 0);
  }
  /** Floor pose: feet centre (cx, fy). s.stretch = rearing up (telegraph) or airborne stretch; s.flat = splatted. */
  function drawSlimeFloor(ctx, cx, fy, f, t, s) {
    const ch = CH();
    const st = s.stretch || 0, fl = s.flat || 0, ph = s.ph || 0, seed = s.seed || 0;
    const sh = s.tele ? Math.sin(t * 70) * 1 : 0;
    const crawl = Math.sin(ph) * 0.08;
    const w = 19 * (1 + crawl + fl * 0.45 - st * 0.2), h = 24 * (1 - crawl * 0.6 - fl * 0.55 + st * 0.5);
    const x = cx + sh;
    const lean = s.rear ? -f * 4 * st : (s.air ? f * 5 : f * 2 * Math.sin(ph));
    if (ch) ch.shadow(ctx, cx, fy, w + 4, s.air ? 0.25 : 0.5);
    const path = new Path2D();
    path.moveTo(x - w - 4, fy);
    path.bezierCurveTo(x - w - 1, fy - h * 0.55, x - w * 0.55 + lean, fy - h, x + lean, fy - h);
    path.bezierCurveTo(x + w * 0.55 + lean, fy - h, x + w + 1, fy - h * 0.55, x + w + 4, fy);
    // a little front lip that oozes forward when crawling
    path.quadraticCurveTo(x, fy + 1.5, x - w - 4, fy);
    path.closePath();
    const box = [x - w - 4, fy - h, x + w + 4, fy];
    if (!s.dead) glow(ctx, x, fy - h * 0.5, 40, '#ff8a30', 0.2 + st * 0.15);
    slimeJelly(ctx, path, box, x - 3 + lean * 0.5, fy - h * 0.45, w * 1.15, s);
    // cooled crust patches on the crown
    ctx.save(); ctx.clip(path);
    ctx.fillStyle = s.dead ? '#5a3020' : DS.crust;
    ctx.globalAlpha = 0.85;
    for (let i = 0; i < 3; i++) {
      const px = x + lean * 0.8 + (i - 1) * w * 0.5 + (h01(i, seed) - 0.5) * 6, py = fy - h + 2 + Math.abs(i - 1) * h * 0.18;
      ctx.beginPath(); ctx.ellipse(px, py, 3.5 + 2.5 * h01(i + 2, seed), 2 + 1.2 * h01(i + 5, seed), (i - 1) * 0.5, 0, TAU); ctx.fill();
    }
    ctx.fillStyle = DS.crustHi;
    ctx.beginPath(); ctx.ellipse(x + lean * 0.8 - 3, fy - h + 2, 3, 1.2, 0, 0, TAU); ctx.fill();
    ctx.globalAlpha = 1;
    ctx.restore();
    if (s.dead) return;
    const blink = ch && ch.blinkAt ? ch.blinkAt(t, seed, 4) : 0;
    beadyEyes(ctx, x + f * w * 0.3 + lean * 0.7, fy - h * 0.55, 10, 3, { x: f * 2, y: 0 }, s.tele ? 0 : blink, (s.hurt || 0) > 0);
    if (fl > 0.05) spatter(ctx, cx, fy, 5, w + 12, seed + 4, DS.mid, fl);
  }
  G.registerEnemy('drip_slime', DripSlime);

  // =====================================================================================================
  // forge_wisp
  // =====================================================================================================
  const FW = { outer: '#c8361a', mid: '#ff7a22', inner: '#ffc24a', core: '#fff3cf', coal: '#24100a', coalHi: '#4a2416', crack: '#ff9a3a', eye: '#fff1c2', ash: '#3e322c' };

  class ForgeWisp extends G.Enemy {
    constructor(props) {
      super(props, {
        hp: 32, w: 28, h: 28,
        flying: true,
        cinders: [7, 12],
        weight: 0.6,
        sight: 8 * TILE,
        colors: { body: FW.mid, dark: FW.coal, hit: '#fff8e8', smoke: '#4a3a32', puddle: FW.ash, tele: '#fff0c0' },
        light: { r: 96, color: '#ff9a40', intensity: 0.55, dx: 0, dy: -4, flicker: true },
        puddleW: 14,
        meltTime: 0.45,
      });
      this.flare = 0;
      this.dim = 0;
      this.ang = Math.random() * TAU;
      this.orbitDir = Math.random() < 0.5 ? -1 : 1;
      this.lostT = 0;
      this.hurtT = 0;
      this.trailT = 0;
      this.dashing = 0;
    }
    init() {
      super.init();
      this.setState('drift');
      this.cooldown('flare', rnd(1.2, 1.8));
      if (this.props.aggro) this.aggro = true;
    }
    leash() { return this.aggro ? 60 * TILE : propTiles(this, 'leash', 9); }
    orbitR() { return propTiles(this, 'orbit', 3.6); }
    fromHome(x, y) { return Math.hypot(x - this.home.x, y - this.home.y); }
    playerNearHome(p) { const c = pCenter(p); return this.fromHome(c.x, c.y) < this.leash() + 2 * TILE; }
    /** Clamp a steering point into the leash circle around home, out of exit zones. */
    steer(x, y) {
      const L = this.leash(), d = this.fromHome(x, y);
      if (d > L) { x = this.home.x + (x - this.home.x) * L / d; y = this.home.y + (y - this.home.y) * L / d; }
      return keepOut(this, x, y, 34);
    }
    /** A hazard tile (spikes, lava, water) at or just below the point: flames keep a tile of air above them. */
    hazardNear(x, y) {
      const r = this.room, c = Math.floor(x / TILE), rr = Math.floor(y / TILE);
      return !!r && (isHaz(tileAt(r, c, rr)) || isHaz(tileAt(r, c, rr + 1)));
    }
    /** Never drift into an exit zone (steering detours can try): cancel the velocity into it, or push out. */
    zoneGuard() {
      const k = 0.12;
      if (inZone(this, this.cx, this.cy)) {
        const o = keepOut(this, this.cx, this.cy, 34);
        const dx = o.x - this.cx, dy = o.y - this.cy, L = Math.max(1, Math.hypot(dx, dy));
        this.vx = dx / L * 120; this.vy = dy / L * 120;
        return;
      }
      const hw = this.w / 2;
      if (inZone(this, this.cx + this.vx * k + Math.sign(this.vx) * hw, this.cy)) this.vx = 0;
      if (inZone(this, this.cx, this.cy + this.vy * k + Math.sign(this.vy) * hw)) this.vy = 0;
    }
    think(dt) {
      const p = this.player;
      if (this.hurtT > 0) this.hurtT -= dt;
      this.flare = toward(this.flare, this.is('flare') ? 1 : this.is('dash') ? 0.7 : 0, dt * (this.is('flare') ? 2.2 : 3));
      this.dim = toward(this.dim, this.is('gutter') ? 1 : 0, dt * (this.is('gutter') ? 5 : 1.6));
      this.dashing = this.is('dash') ? 1 : 0;
      if (Math.abs(this.vx) > 8) this.facing = this.vx > 0 ? 1 : -1;
      if (this.flare > 0.05 && G.lighting) G.lighting.add({ x: this.cx, y: this.cy, r: 110 + 90 * this.flare, color: '#ffe0a0', intensity: 0.5 * this.flare });
      // embers shed while moving
      this.trailT -= dt;
      if (this.trailT <= 0) {
        this.trailT = this.is('dash') ? 0.02 : 0.16;
        burst('ember', this.cx + rnd(-5, 5), this.cy + rnd(-4, 6), { count: 1, color: this.is('dash') ? FW.inner : FW.mid, speed: this.is('dash') ? 40 : 30 });
      }
      switch (this.state) {
        case 'drift': {
          this.hover(this.home.x, this.home.y, dt, { amp: 16, freq: 0.45, speed: 60 });
          this.zoneGuard();
          if (this.targetable(p) && this.playerNearHome(p) && this.canSee(p) && this.stateTime > 0.3) { this.face(p); this.setState('circle'); }
          break;
        }
        case 'circle': {
          if (!this.targetable(p) || !this.playerNearHome(p)) { this.setState('return'); break; }
          if (this.canSee(p, this.sight * 1.3)) this.lostT = 0; else this.lostT += dt;
          if (this.lostT > 2.5) { this.setState('return'); break; }
          const pc = pCenter(p), R = this.orbitR();
          this.ang += this.orbitDir * dt * 1.05;
          const tgt = this.steer(pc.x + Math.cos(this.ang) * R, Math.min(pc.y, pc.y - 1.1 * TILE + Math.sin(this.ang) * R * 0.55) + this.bob(8, 1.3));
          for (let i = 0; i < 4 && this.hazardNear(tgt.x, tgt.y); i++) tgt.y -= TILE;      // hover above pits of spikes / lava
          this.flyTo(tgt.x, tgt.y, 175, dt, { accel: 520, arrive: 50 });
          this.zoneGuard();
          if (this.wallHit || this.ceilHit) this.orbitDir = -this.orbitDir;
          const d = this.dist();
          if (this.ready('flare') && this.stateTime > 0.9 && d < 6.5 * TILE && d > 1.4 * TILE && !playerInZone(this) && this.canSee(p)) this.setState('flare');
          break;
        }
        case 'flare': {                                     // TELEGRAPH: stops and flares white-hot
          this.vx = toward(this.vx, 0, 900 * dt); this.vy = toward(this.vy, 0, 900 * dt);
          if (this.once('tele')) this.stateData.w = this.telegraph(0.5, { color: '#fff0c0', shake: 1.3, sound: 'wisp_flare', vol: 0.8 });
          if (this.targetable(p)) this.face(p);
          if (this.stateTime >= this.stateData.w) {
            if (!this.targetable(p)) { this.setState('gutter'); break; }
            const pc = pCenter(p), dx = pc.x - this.cx, dy = pc.y - this.cy, L = Math.max(1, Math.hypot(dx, dy));
            this.stateData.dir = { x: dx / L, y: dy / L };
            this.setState('dash', { dir: { x: dx / L, y: dy / L }, x0: this.cx, y0: this.cy, max: Math.min(8 * TILE, L + 2.5 * TILE) });
            sfx('wisp_dash', this.cx, { vol: 0.9 });
            burst('flash', this.cx, this.cy, { r: 40, color: '#ffe0a0', life: 0.12 });
          }
          break;
        }
        case 'dash': {
          const D = this.stateData, sp = 600;
          this.vx = D.dir.x * sp; this.vy = D.dir.y * sp;
          const nx = this.cx + this.vx * dt * 3, ny = this.cy + this.vy * dt * 3;
          const travelled = Math.hypot(this.cx - D.x0, this.cy - D.y0);
          const blocked = this.stateTime > 0.03 && (this.wallHit || this.ceilHit || this.grounded);
          if (blocked) { burst('spark', this.cx + D.dir.x * 14, this.cy + D.dir.y * 14, { count: 8, color: FW.inner, speed: 220 }); sfx('slash_wall', this.cx, { vol: 0.35, pitch: 0.7 }); }
          if (blocked || travelled >= D.max || this.hazardNear(nx, ny) || this.stateTime > 0.6 || inZone(this, nx, ny) || this.fromHome(nx, ny) > this.leash() + 3 * TILE) {
            this.vx *= 0.35; this.vy *= 0.35;
            this.setState('gutter');
          }
          break;
        }
        case 'gutter': {                                    // recovery: the flame gutters low, drifts, punishable
          this.vx = toward(this.vx, 0, 700 * dt); this.vy = toward(this.vy, -30, 700 * dt);
          if (this.once('fizz')) { burst('smoke', this.cx, this.cy - 6, { count: 3, color: '#4a3a32', alpha: 0.45, size: 8 }); }
          if (this.stateTime > 0.62) { this.cooldown('flare', rnd(1.7, 2.5)); this.orbitDir = Math.random() < 0.5 ? -1 : 1; if (this.targetable(p)) this.ang = Math.atan2((this.cy - pCenter(p).y + 1.1 * TILE) / 0.55, this.cx - pCenter(p).x); this.setState('circle'); }
          break;
        }
        case 'return': {
          const tg = keepOut(this, this.home.x, this.home.y, 34);
          const d = this.flyTo(tg.x, tg.y, 130, dt, { arrive: 50 });
          this.zoneGuard();
          if (d < 24 || this.stateTime > 6) this.setState('drift');
          else if (this.stateTime > 0.8 && this.targetable(p) && this.playerNearHome(p) && this.canSee(p)) this.setState('circle');
          break;
        }
        default: this.setState('drift');
      }
    }
    onHurt() { this.hurtT = 0.2; }
    onDeath() {
      burst('smoke', this.cx, this.cy, { count: 6, color: '#3a2e28', alpha: 0.55, size: 10 });
      burst('ember', this.cx, this.cy, { count: 10, color: FW.mid, speed: 200 });
      burst('flash', this.cx, this.cy, { r: 46, color: '#ffb060', life: 0.15 });
      sfx('wax_sizzle', this.cx, { vol: 0.7, pitch: 0.8 });
    }
    drawBounds() { return { x: this.x - 34, y: this.y - 52, w: this.w + 68, h: this.h + 72 }; }
    drawBody(ctx, t) {
      drawWisp(ctx, this.cx, this.cy, this.facing, t, { flare: this.flare, dim: this.dim, vx: this.vx, vy: this.vy, seed: this.seed, hurt: this.hurtT, tele: this.telegraphing, dashing: this.dashing });
    }
    drawPuddle(ctx, x, y, p) {                               // a smear of ash with the dead coal heart in it
      const w = 12 + 6 * p;
      ctx.fillStyle = 'rgba(13,8,6,0.8)';
      ctx.beginPath(); ctx.ellipse(x, y - 1.5, w + 1.5, 3.5, 0, 0, TAU); ctx.fill();
      ctx.fillStyle = FW.ash;
      ctx.beginPath(); ctx.ellipse(x, y - 1.8, w, 2.4, 0, 0, TAU); ctx.fill();
      drawCoal(ctx, x + 2, y - 5, 0.55, this.seed, 0, 0.35 * (1 - p), null);
    }
    drawCorpse(ctx, t) {
      // the flame is out: a charred coal heart, still smoking
      const x = this.cx, y = this.cy;
      const ch = CH();
      if (ch) ch.pallSmoke(ctx, x, y - 6, t, { count: 3, color: '#4a3a32', alpha: 0.3, height: 34, spread: 6, size: 4, seed: this.seed });
      drawCoal(ctx, x, y + 2, 0.85, this.seed, t, 0.25, null);
    }
  }

  /** The wisp's charred coal heart; eyes = {f, flare, hurt} or null (dead). */
  function drawCoal(ctx, x, y, sc, seed, t, crack, eyes) {
    const path = new Path2D();
    const n = 9;
    for (let i = 0; i <= n; i++) {
      const a = (i / n) * TAU, r = (8 + 2 * h01(i % n, seed)) * sc;
      const px = x + Math.cos(a) * r * 1.05, py = y + Math.sin(a) * r * 0.9;
      if (i === 0) path.moveTo(px, py); else path.lineTo(px, py);
    }
    path.closePath();
    const ch = CH();
    if (ch) ch.outlineFill(ctx, path, FW.coal, CL.outline, 1.5); else { ctx.fillStyle = FW.coal; ctx.fill(path); }
    ctx.save(); ctx.clip(path);
    ctx.fillStyle = FW.coalHi;
    ctx.beginPath(); ctx.ellipse(x - 3 * sc, y - 4 * sc, 5 * sc, 3 * sc, -0.3, 0, TAU); ctx.fill();
    // glowing cracks
    ctx.strokeStyle = FW.crack; ctx.lineWidth = 1.1; ctx.globalAlpha = clamp(crack, 0, 1);
    ctx.beginPath();
    ctx.moveTo(x - 7 * sc, y + 3 * sc); ctx.lineTo(x - 2 * sc, y + 1 * sc); ctx.lineTo(x + 1 * sc, y + 6 * sc);
    ctx.moveTo(x + 6 * sc, y - 2 * sc); ctx.lineTo(x + 2 * sc, y + 1 * sc);
    ctx.stroke(); ctx.globalAlpha = 1;
    ctx.restore();
    if (!eyes) return;
    const f = eyes.f, fl = eyes.flare || 0;
    const ex = x + f * 2.2 * sc, ey = y - 1 * sc;
    for (const sd of [-1, 1]) {
      const px = ex + sd * 3.6 * sc, big = sd === f ? 1.1 : 0.9;
      glow(ctx, px, ey, 7 * sc, '#ffd080', 0.5);
      ctx.fillStyle = fl > 0.5 ? '#ffffff' : FW.eye;
      ctx.beginPath();
      if (eyes.hurt) { ctx.ellipse(px, ey, 2.4 * sc, 0.8 * sc, 0, 0, TAU); }
      else {                                               // angled slits: angry brows built into the shape
        ctx.moveTo(px - 2.6 * sc * big, ey - 1.6 * sc * (sd === f ? 0.2 : 1));
        ctx.lineTo(px + 2.6 * sc * big, ey - 1.6 * sc * (sd === f ? 1 : 0.2));
        ctx.lineTo(px + 1.8 * sc * big * sd * 0 + 1.8 * sc, ey + 1.6 * sc);
        ctx.lineTo(px - 1.8 * sc, ey + 1.6 * sc);
        ctx.closePath();
      }
      ctx.fill();
    }
  }
  /** One flame layer: a teardrop from a round base (x, y, radius r) to a flickering tip (tx, ty). */
  function flameLayer(ctx, x, y, r, tx, ty, t, ph, wob, color) {
    const dx = tx - x, dy = ty - y, L = Math.max(1, Math.hypot(dx, dy));
    const nx = -dy / L, ny = dx / L;                       // side normal
    const s1 = Math.sin(t * 9 + ph) * wob, s2 = Math.sin(t * 13 + ph * 1.7) * wob;
    const ax = -dx / L, ay = -dy / L;                       // toward the base
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.moveTo(x + nx * r, y + ny * r);
    ctx.bezierCurveTo(x + nx * r + dx * 0.35 + nx * s1, y + ny * r + dy * 0.35 + ny * s1, tx + nx * (r * 0.35 + s2), ty + ny * (r * 0.35 + s2) - dy * 0.25, tx, ty);
    ctx.bezierCurveTo(tx - nx * (r * 0.35 - s1) - dx * 0.25, ty - ny * (r * 0.35 - s1) - dy * 0.25, x - nx * r + dx * 0.35 - nx * s2, y - ny * r + dy * 0.35 - ny * s2, x - nx * r, y - ny * r);
    ctx.bezierCurveTo(x - nx * r + ax * r * 1.3, y - ny * r + ay * r * 1.3, x + nx * r + ax * r * 1.3, y + ny * r + ay * r * 1.3, x + nx * r, y + ny * r);
    ctx.closePath();
    ctx.fill();
  }
  /** Forge wisp art centred at (x, y). */
  function drawWisp(ctx, x, y, f, t, s) {
    const fl = s.flare || 0, dim = s.dim || 0, seed = s.seed || 0;
    const vx = s.vx || 0, vy = s.vy || 0;
    const R = 12 * (1 + fl * 0.3) * (1 - dim * 0.3);
    // the flame streams up and away from the motion
    let tx = -vx * 0.055, ty = -(30 + fl * 10) * (1 - dim * 0.35) - vy * 0.04;
    const tl = Math.hypot(tx, ty), maxL = 30 + fl * 22 + (s.dashing ? 18 : 0);
    if (tl > maxL) { tx *= maxL / tl; ty *= maxL / tl; }
    if (ty > -8) ty = -8;
    const by = y + 3;
    glow(ctx, x, y - 6, 54 + fl * 30, '#ff7a20', 0.42 + fl * 0.35 - dim * 0.2);
    if (fl > 0.2) glow(ctx, x, y - 4, 36 + fl * 20, '#fff0c0', 0.35 * fl);
    // dash streak
    if (s.dashing) {                                        // afterimages streaming behind
      for (let i = 3; i >= 1; i--) {
        const k = i * 0.028, gx = x - vx * k, gy = by - vy * k;
        ctx.save(); ctx.globalAlpha = 0.42 - i * 0.1;
        flameLayer(ctx, gx, gy, R * (1 - i * 0.12), gx + tx * 0.7, gy + ty * 0.7, t, seed + i, 2, i > 1 ? FW.outer : FW.mid);
        ctx.restore();
      }
    }
    const hot = fl > 0.55;
    ctx.save(); ctx.globalAlpha = 0.92;
    flameLayer(ctx, x, by, R + 2.5, x + tx * 1.08, by + ty * 1.08, t, seed, 3.2, CL.outline);
    ctx.globalAlpha = 1;
    flameLayer(ctx, x, by, R + 1, x + tx, by + ty, t, seed, 3, hot ? FW.mid : FW.outer);
    flameLayer(ctx, x, by + 1, R * 0.8, x + tx * 0.78, by + ty * 0.8, t, seed + 2, 2.4, hot ? FW.inner : FW.mid);
    flameLayer(ctx, x, by + 2, R * 0.55, x + tx * 0.55, by + ty * 0.55, t, seed + 4, 1.6, hot ? FW.core : FW.inner);
    ctx.restore();
    // two small side tongues licking up
    for (const sd of [-1, 1]) {
      const ph = t * 6 + seed + sd * 2, k = 0.5 + 0.5 * Math.sin(ph);
      ctx.save(); ctx.globalAlpha = 0.85 * (1 - dim * 0.6);
      flameLayer(ctx, x + sd * R * 0.7, by - 2, R * 0.28, x + sd * R * (0.9 + 0.3 * k) + tx * 0.2, by - R * (1.2 + 0.6 * k) + ty * 0.25, t, ph, 1, hot ? FW.inner : FW.mid);
      ctx.restore();
    }
    // flare rays
    if (fl > 0.3 && s.tele) {
      ctx.save(); ctx.strokeStyle = '#fff4d8'; ctx.lineCap = 'round'; ctx.globalAlpha = (fl - 0.3) * 1.2;
      for (let i = 0; i < 8; i++) {
        const a = i / 8 * TAU + t * 1.5, r0 = R + 6, r1 = R + 10 + 6 * fl + 3 * Math.sin(t * 20 + i);
        ctx.lineWidth = i % 2 ? 1.2 : 2;
        ctx.beginPath(); ctx.moveTo(x + Math.cos(a) * r0, y + Math.sin(a) * r0); ctx.lineTo(x + Math.cos(a) * r1, y + Math.sin(a) * r1); ctx.stroke();
      }
      ctx.restore();
    }
    drawCoal(ctx, x, y + 2, 1 - dim * 0.1, seed, t, 0.6 + 0.4 * Math.sin(t * 5 + seed), { f, flare: fl, hurt: (s.hurt || 0) > 0 });
  }
  G.registerEnemy('forge_wisp', ForgeWisp);

  // =====================================================================================================
  // ladle_brute  (+ projectiles 'ladle_blob', 'ladle_puddle')
  // =====================================================================================================
  const LB = {
    wax: '#a39072', waxHi: '#cdbb98', waxDark: '#5c4c3a', apron: '#3c2418', apronHi: '#5c3a26', stitch: '#8a6040',
    iron: '#34302f', ironHi: '#6b625c', ironDark: '#1c1918', rust: '#7a3c1e', boot: '#1a1412', visor: '#ffb040',
  };
  // Ladle poses: hands (hx, hy) feet-relative (facing right, y up negative), handle angle a (0 = forward, + = down),
  // crouch 0..1, lean -1..1 (+ = forward).
  const BPOSE = {
    carry: { hx: 18, hy: -40, a: 0.42, crouch: 0, lean: 0 },
    scoop: { hx: 22, hy: -50, a: -2.78, crouch: 0.3, lean: -0.45 },     // reaching over the shoulder into the back crucible
    fling: { hx: 20, hy: -74, a: -0.78, crouch: 0, lean: 0.5 },         // swung over the head, bowl high in front
    brace: { hx: 8, hy: -42, a: 0.1, crouch: 0.55, lean: -0.4 },        // hunched behind the bowl like a ram
    shove: { hx: 32, hy: -42, a: 0.02, crouch: 0.15, lean: 0.65 },
  };
  const LADLE = 56;                                         // handle length (hands → bowl centre)

  class LadleBrute extends G.Enemy {
    constructor(props) {
      super(props, {
        hp: 65, w: 52, h: 76,
        cinders: [12, 18],
        weight: 3,
        knockback: 300,
        sight: 9 * TILE,
        colors: { body: LB.wax, dark: LB.waxDark, hit: '#fff0dc', smoke: '#4a403a', puddle: '#7e6c54', tele: CL.tele },
        light: { r: 80, color: '#ff8a30', intensity: 0.36, dx: 34, dy: 26, flicker: true },
        puddleW: 32,
        meltTime: 0.7,
      });
      this.pose = Object.assign({}, BPOSE.carry);
      this.walk = Math.random() * TAU;
      this.fill = 0.3;
      this.lostT = 0;
      this.hurtT = 0;
    }
    init() { super.init(); this.setState('patrol'); this.cooldown('fling', rnd(0.8, 1.4)); this.cooldown('shove', 0.6); }
    beat() { return propTiles(this, 'range', 5); }
    sees(p) {
      if (!this.canSee(p)) return false;
      const dy = pCenter(p).y - this.cy;
      return dy > -5 * TILE && dy < 4 * TILE;
    }
    whileStunned() { this.kbGuard(); }
    kbGuard() {
      if (!(this.kbTime > 0) || !this.kbVx) return;
      const d = this.kbVx > 0 ? 1 : -1;
      if (!canStep(this, d, this.beat() + TILE)) this.kbVx = 0;
    }
    /** Bowl centre in world space. */
    bowlPos() {
      const P = this.pose, f = this.facing;
      return { x: this.cx + f * (P.hx + Math.cos(P.a) * LADLE), y: this.y + this.h + P.hy + Math.sin(P.a) * LADLE };
    }
    think(dt) {
      const p = this.player;
      this.kbGuard();
      if (this.hurtT > 0) this.hurtT -= dt;
      let target = BPOSE.carry, rate = 6;
      switch (this.state) {
        case 'patrol': {
          if (this.grounded && !canStep(this, this.facing, this.beat()) && !this.blockedAhead(this.facing)) { this.facing = -this.facing; this.vx = 0; }
          this.patrol(28, { range: this.beat(), pause: 1 });
          if (this.stateTime > 0.4 && this.targetable(p) && this.sees(p)) this.setState('notice');
          break;
        }
        case 'notice':
          this.stop(); this.face(p);
          if (this.once('grunt')) sfx('enemy_windup', this.cx, { vol: 0.35, pitch: 0.55 });
          if (this.stateTime > 0.45) this.setState('engage');
          break;
        case 'engage': {
          if (!this.targetable(p)) { this.setState('patrol'); break; }
          this.face(p);
          const adx = Math.abs(this.dx()), ady = this.dy();
          if (this.canSee(p, this.sight * 1.3)) this.lostT = 0; else this.lostT += dt;
          if (this.lostT > 3) { this.setState('patrol'); break; }
          if (adx < 2.5 * TILE && Math.abs(ady) < 1.7 * TILE && this.ready('shove') && !playerInZone(this)) { this.setState('brace'); break; }
          if (this.ready('fling') && adx > 2.2 * TILE && adx < 10 * TILE && ady > -6 * TILE && ady < 4 * TILE && !playerInZone(this) && this.canSee(p, 11 * TILE)) { this.setState('scoop'); break; }
          if (adx > 1.9 * TILE && this.grounded && canStep(this, this.facing, this.beat())) this.vx = this.facing * 34;
          else this.stop();
          break;
        }
        case 'scoop': {                                       // TELEGRAPH: reaches over its shoulder into the crucible
          this.stop();
          target = BPOSE.scoop; rate = 8;
          if (this.once('tele')) {
            this.stateData.w = this.telegraph(0.6, { shake: 1.4, color: CL.tele, vol: 0.75, x: this.cx - this.facing * 30, y: this.y + 6 });
            sfx('ladle_scoop', this.cx, { vol: 0.8 });
          }
          const w = this.stateData.w;
          if (this.telegraphing && this.every(0.09)) burst('ember', this.cx - this.facing * 30, this.y + 8, { count: 1, color: CL.molten, speed: 70, angle: -Math.PI / 2, spread: 1 });
          if (this.stateTime >= w) { target = BPOSE.fling; rate = 20; }
          if (this.at(w)) sfx('ladle_fling', this.cx, { vol: 0.85 });
          if (this.at(w + 0.11)) this.throwBlobs();
          if (this.stateTime > w + 0.8) { this.cooldown('fling', rnd(2.6, 3.4)); this.cooldown('shove', 0.3); this.setState('engage'); }
          break;
        }
        case 'brace': {                                       // TELEGRAPH: hunches low behind the bowl, then shoves
          if (this.once('tele')) this.stateData.w = this.telegraph(0.48, { shake: 1.8, color: CL.tele, vol: 0.85 });
          const w = this.stateData.w;
          target = BPOSE.brace; rate = 9;
          if (this.stateTime < w) this.stop();
          else {
            target = BPOSE.shove; rate = 26;
            if (this.at(w)) sfx('shovel_swing', this.cx, { vol: 0.7, pitch: 0.75 });
            if (this.stateTime < w + 0.2 && this.grounded && canStep(this, this.facing, this.beat() + TILE)) this.vx = this.facing * 250;
            else this.stop(1600);
            if (this.stateTime >= w + 0.03 && this.stateTime < w + 0.22) {
              const f = this.facing, x0 = f > 0 ? this.cx : this.cx - 2.3 * TILE;
              this.strike({ x: x0, y: this.y + 8, w: 2.3 * TILE, h: this.h - 10 }, { dir: { x: f, y: -0.35 } });
            }
            if (this.at(w + 0.12)) { burst('dust', this.cx + this.facing * 30, this.y + this.h, { count: 6, color: '#5a4436' }); }
          }
          if (this.stateTime > w + 0.95) { this.cooldown('shove', 1.4); this.cooldown('fling', Math.max(this.cds.fling || 0, 0.7)); this.setState('engage'); }
          break;
        }
        default: this.setState('patrol');
      }
      const P = this.pose, k = Math.min(1, dt * rate);
      for (const key of ['hx', 'hy', 'a', 'crouch', 'lean']) P[key] = lerp(P[key], target[key], k);
      if (Math.abs(this.vx) > 5 && this.grounded) {
        const before = Math.sin(this.walk);
        this.walk += Math.abs(this.vx) * dt * 0.085;
        if ((before < 0) !== (Math.sin(this.walk) < 0)) { sfx('step', this.cx, { vol: 0.55, pitch: 0.5 }); burst('dust', this.cx, this.y + this.h, { count: 2, color: '#4a3a30' }); }
      }
      const tele = this.is('scoop') && this.stateTime < (this.stateData.w || 0.6);
      this.fill = toward(this.fill, tele ? 1 : this.is('scoop') ? 0 : 0.3, dt * (tele ? 2.2 : this.is('scoop') ? 8 : 0.25));
    }
    throwBlobs() {
      const p = this.player;
      if (!this.targetable(p)) return;
      const b = this.bowlPos(), pc = pCenter(p);
      const far = Math.abs(this.dx()) > 4.5 * TILE;
      const offs = far ? [-0.75, 0.75] : [0];
      offs.forEach((o, i) => {
        const tx = pc.x + o * TILE * this.facing, time = 0.82 + i * 0.16 + Math.abs(this.dx()) / TILE * 0.012;
        this.lob('ladle_blob', { x: tx - 1, y: pc.y + 10, w: 2, h: 2 }, { time, x: b.x, y: b.y, destroyable: true, sound: false });
      });
      burst('ember', b.x, b.y, { count: 6, color: CL.moltenHot, speed: 200, angle: -Math.PI / 2 + this.facing * 0.5, spread: 0.9 });
      this.fill = 0;
    }
    onHurt() { this.hurtT = 0.18; }
    onDeath() { sfx('wax_sizzle', this.cx, { vol: 0.5, pitch: 0.7 }); }
    drawPuddle(ctx, x, y, p) {                               // its tallow puddle, the ladle and the helm left in it
      this.puddleWick = false;
      super.drawPuddle(ctx, x, y, p);
      const f = this.facing, ch = CH();
      // ladle
      ctx.lineCap = 'round';
      ctx.strokeStyle = CL.outline; ctx.lineWidth = 5.5;
      ctx.beginPath(); ctx.moveTo(x - f * 30, y - 3); ctx.lineTo(x + f * 22, y - 2); ctx.stroke();
      ctx.strokeStyle = LB.iron; ctx.lineWidth = 3; ctx.stroke();
      const bowl = new Path2D(); bowl.ellipse(x + f * 30, y - 5, 11, 6, 0, 0, TAU);
      if (ch) ch.shape(ctx, bowl, { fill: LB.iron, box: [x + f * 30 - 11, y - 11, x + f * 30 + 11, y + 1], shade: 0.35, lw: 1.6 });
      // helm on its side, visor dark
      ctx.save(); ctx.translate(x - f * 8, y - 8); ctx.rotate(f * 1.35);
      const helm = new Path2D();
      helm.moveTo(-11, 9); helm.lineTo(-11, -7); helm.bezierCurveTo(-11, -17, 11, -17, 12, -5); helm.lineTo(13, 9); helm.closePath();
      if (ch) ch.shape(ctx, helm, { fill: LB.iron, box: [-11, -16, 13, 9], shade: 0.4, hi: 0.15, lw: 1.8 });
      ctx.fillStyle = '#0a0605'; ctx.fillRect(-2, -4, 14, 3);
      ctx.restore();
    }
    drawBounds() { return { x: this.x - 90, y: this.y - 80, w: this.w + 180, h: this.h + 92 }; }
    drawBody(ctx, t) { drawBrute(ctx, this.cx, this.y + this.h, this.facing, t, this, false); }
    drawCorpse(ctx, t) { drawBrute(ctx, this.cx, this.y + this.h, this.facing, t, this, true); }
  }

  /** Ladle brute art: feet centre (fx, fy), facing f; e = the enemy (pose, walk, fill, telegraphing, hurtT, vx, state). */
  function drawBrute(ctx, fx, fy, f, t, e, dead) {
    const ch = CH();
    const P = e.pose || BPOSE.carry;
    const cr = P.crouch || 0, lean = P.lean || 0;
    const moving = Math.abs(e.vx || 0) > 5 && !dead;
    const wk = e.walk || 0;
    const bob = moving ? Math.abs(Math.sin(wk)) * 2.5 : Math.sin(t * 1.6 + (e.seed || 0)) * 0.8;
    if (ch) ch.shadow(ctx, fx, fy, 34, 0.55);
    if (!ch) { ctx.fillStyle = LB.wax; ctx.fillRect(fx - 26, fy - 76, 52, 76); return; }
    ctx.save();
    ctx.translate(fx, fy);
    ctx.scale(f, 1);
    const S = 1.08; ctx.scale(S, S);
    const hip = -24 + cr * 6;
    const top = -84 + cr * 12 + bob;
    const lx = lean * 8;                                     // shoulders shift forward with lean
    // ---- legs (stumpy, iron-shod)
    for (const side of [-1, 1]) {
      const ph = wk + (side > 0 ? 0 : Math.PI);
      const lift = moving ? Math.max(0, Math.sin(ph)) * 4 : 0, step = moving ? Math.cos(ph) * 5 : 0;
      const x = side * 10 + step;
      const leg = new Path2D();
      leg.moveTo(x - 7, hip); leg.lineTo(x + 7, hip); leg.lineTo(x + 7, -9 - lift); leg.lineTo(x - 7, -9 - lift); leg.closePath();
      ch.shape(ctx, leg, { fill: side > 0 ? LB.wax : LB.waxDark, box: [x - 7, hip, x + 7, 0], shade: 0.4, lw: 2 });
      const boot = new Path2D();
      boot.moveTo(x - 8, -11 - lift); boot.lineTo(x + 8, -11 - lift); boot.quadraticCurveTo(x + 14, -9 - lift, x + 13, -lift); boot.lineTo(x - 8, -lift); boot.closePath();
      ch.shape(ctx, boot, { fill: LB.boot, box: [x - 8, -12, x + 14, 0], shade: 0.2, hi: 0.12, lw: 2 });
      ctx.fillStyle = LB.ironHi; ctx.fillRect(x - 6, -10 - lift, 13, 1.6);
    }
    // ---- back arm (behind the body) reaching to the rear hand on the handle
    const hx = P.hx, hy = P.hy + cr * 4, a = P.a;
    const dx = Math.cos(a), dy = Math.sin(a);
    const rearX = hx - dx * 16, rearY = hy - dy * 16;
    arm(ctx, -4 + lx, top + 20, rearX, rearY, LB.waxDark, 9);
    // ---- crucible strapped to its back: a wide, shallow, riveted vat brimming with molten wax
    {
      const cx = -30 + lx * 0.5, cy = top + 22;
      const pot = new Path2D();
      pot.moveTo(cx - 15, cy - 6); pot.lineTo(cx + 15, cy - 6); pot.lineTo(cx + 12, cy + 9); pot.quadraticCurveTo(cx, cy + 14, cx - 12, cy + 9); pot.closePath();
      ch.shape(ctx, pot, { fill: LB.iron, box: [cx - 15, cy - 6, cx + 15, cy + 14], shade: 0.4, hi: 0.15, rim: '#ff9a50', rimWidth: 1.5, light: 1 });
      ctx.fillStyle = LB.rust; ctx.fillRect(cx - 13, cy + 1, 26, 2.5);
      ctx.fillStyle = LB.ironHi; for (let i = -1; i <= 1; i++) { ctx.beginPath(); ctx.arc(cx + i * 9, cy + 2.2, 1.1, 0, TAU); ctx.fill(); }
      // lugs
      ctx.strokeStyle = CL.outline; ctx.lineWidth = 2.2;
      ctx.beginPath(); ctx.arc(cx - 16, cy - 2, 3, Math.PI * 0.5, Math.PI * 1.5); ctx.stroke();
      const hot = dead ? 0 : 0.55 + 0.45 * (e.telegraphing && e.is('scoop') ? 1 : 0);
      if (hot > 0) {
        glow(ctx, cx, cy - 8, 30, CL.molten, 0.4 * hot);
        ctx.fillStyle = CL.molten; ctx.beginPath(); ctx.ellipse(cx, cy - 6, 14, 3.4, 0, 0, TAU); ctx.fill();
        ctx.fillStyle = CL.moltenHot; ctx.beginPath(); ctx.ellipse(cx - 3, cy - 6.6, 8, 1.6, 0, 0, TAU); ctx.fill();
        const ph = (t * 1.3 + (e.seed || 0)) % 1;
        ctx.strokeStyle = CL.moltenCore; ctx.lineWidth = 1; ctx.globalAlpha = 1 - ph;
        ctx.beginPath(); ctx.arc(cx + 5, cy - 6.5, 1 + ph * 2.2, Math.PI, TAU); ctx.stroke(); ctx.globalAlpha = 1;
      } else { ctx.fillStyle = '#2a1a12'; ctx.beginPath(); ctx.ellipse(cx, cy - 6, 14, 3.4, 0, 0, TAU); ctx.fill(); }
      ctx.strokeStyle = CL.outline; ctx.lineWidth = 2; ctx.beginPath(); ctx.ellipse(cx, cy - 6, 15, 3.8, 0, 0, TAU); ctx.stroke();
      // strap over the shoulder
      ctx.strokeStyle = LB.apron; ctx.lineWidth = 4;
      ctx.beginPath(); ctx.moveTo(cx + 12, cy - 2); ctx.quadraticCurveTo(4 + lx, top - 2, 20 + lx, top + 30); ctx.stroke();
    }
    // ---- torso: a hunched mass of grimy tallow
    const body = new Path2D();
    body.moveTo(-20, hip + 4);
    body.bezierCurveTo(-30, hip - 12, -32 + lx * 0.4, top + 22, -22 + lx * 0.6, top + 8);
    body.bezierCurveTo(-14 + lx, top - 2, 10 + lx, top - 3, 22 + lx, top + 8);
    body.bezierCurveTo(30 + lx, top + 16, 28 + lx * 0.6, top + 30, 26, top + 38);
    body.bezierCurveTo(32, hip - 12, 28, hip - 2, 18, hip + 4);
    body.quadraticCurveTo(0, hip + 9, -20, hip + 4);
    body.closePath();
    const bbox = [-34, top - 4, 32 + lx, hip + 9];
    ch.shape(ctx, body, { fill: LB.wax, box: bbox, shade: 0.45, hi: 0.2, rim: '#ffb070', rimWidth: 2.2, shadeColor: '#1a0c06' });
    // wax drips + soot
    ctx.save(); ctx.clip(body);
    ctx.fillStyle = LB.waxHi; ctx.globalAlpha = 0.3;
    for (let i = 0; i < 3; i++) { const x = -18 + i * 12 + lx * 0.6; ctx.beginPath(); ctx.ellipse(x, top + 10 + i * 3, 1.8, 5 + i * 2, 0, 0, TAU); ctx.fill(); }
    ctx.globalAlpha = 1;
    // a wide leather belt, sagging under the belly
    ctx.strokeStyle = CL.outline; ctx.lineWidth = 7;
    ctx.beginPath(); ctx.moveTo(-34, hip - 9); ctx.quadraticCurveTo(0, hip - 2, 34, hip - 12); ctx.stroke();
    ctx.strokeStyle = LB.apron; ctx.lineWidth = 4.5; ctx.stroke();
    ctx.fillStyle = 'rgba(20,12,8,0.35)';
    ctx.beginPath(); ctx.ellipse(-20, hip - 6, 14, 10, 0.4, 0, TAU); ctx.fill();
    // leather apron over the belly
    const ap = new Path2D();
    ap.moveTo(-2 + lx * 0.8, top + 28); ap.lineTo(28 + lx * 0.6, top + 26); ap.quadraticCurveTo(32, hip - 8, 26, hip + 8); ap.lineTo(-6, hip + 8); ap.closePath();
    ctx.fillStyle = LB.apron; ctx.fill(ap);
    ctx.fillStyle = LB.apronHi; ctx.fillRect(2 + lx * 0.8, top + 30, 20, 2);
    ctx.strokeStyle = LB.stitch; ctx.lineWidth = 1; ctx.setLineDash([2, 2.5]);
    ctx.beginPath(); ctx.moveTo(1 + lx * 0.8, top + 32); ctx.lineTo(-2, hip + 6); ctx.stroke(); ctx.setLineDash([]);
    ctx.fillStyle = 'rgba(10,6,4,0.55)';                     // scorch marks
    ctx.beginPath(); ctx.ellipse(16, hip - 12, 5, 3.5, 0.6, 0, TAU); ctx.ellipse(8, hip - 2, 3, 2, 0, 0, TAU); ctx.fill();
    ctx.restore();
    ctx.strokeStyle = CL.outline; ctx.lineWidth = 1.5; ctx.stroke(ap);
    ctx.fillStyle = LB.ironHi; ctx.strokeStyle = CL.outline; ctx.lineWidth = 1.2;
    ctx.beginPath(); ctx.rect(-4, hip - 9, 7, 6); ctx.fill(); ctx.stroke();
    // ---- head: a riveted bucket helm sunk between the shoulders, one slit of furnace light
    {
      const hx0 = 24 + lx * 1.25, hy0 = top + 14 + cr * 3;
      const helm = new Path2D();
      helm.moveTo(hx0 - 12, hy0 + 9); helm.lineTo(hx0 - 12, hy0 - 8); helm.bezierCurveTo(hx0 - 12, hy0 - 19, hx0 + 12, hy0 - 19, hx0 + 13, hy0 - 6); helm.lineTo(hx0 + 14, hy0 + 9); helm.closePath();
      ch.shape(ctx, helm, { fill: LB.iron, box: [hx0 - 12, hy0 - 18, hx0 + 14, hy0 + 9], shade: 0.35, hi: 0.22, rim: '#ff9a50', rimWidth: 1.6, light: 1 });
      // crest ridge with rivets
      ctx.strokeStyle = LB.ironDark; ctx.lineWidth = 2.4;
      ctx.beginPath(); ctx.moveTo(hx0 - 10, hy0 - 13); ctx.quadraticCurveTo(hx0, hy0 - 19.5, hx0 + 11, hy0 - 10); ctx.stroke();
      ctx.fillStyle = LB.rust; ctx.globalAlpha = 0.7; ctx.fillRect(hx0 - 11, hy0 + 4, 24, 2.5); ctx.globalAlpha = 1;
      ctx.fillStyle = LB.ironHi; for (const rx of [-8, -1, 6]) { ctx.beginPath(); ctx.arc(hx0 + rx, hy0 + 6.5, 1, 0, TAU); ctx.fill(); }
      const lit = dead ? 0 : (e.telegraphing ? 1 : 0.75), hurt = (e.hurtT || 0) > 0;
      if (lit > 0) {
        glow(ctx, hx0 + 6, hy0 - 3, 16, '#ff9a30', 0.55 * lit);
        ctx.fillStyle = hurt ? '#fff2d0' : LB.visor;
        ctx.fillRect(hx0 - 2, hy0 - 4.5, 16, hurt ? 1.5 : 3.2);
        ctx.fillStyle = '#fff2d0'; ctx.fillRect(hx0 + 6, hy0 - 4, 5, hurt ? 1 : 2.2);
      } else { ctx.fillStyle = '#0a0605'; ctx.fillRect(hx0 - 1, hy0 - 4.5, 13, 3); }
      // tallow oozing from under the helm rim
      ctx.fillStyle = LB.wax; ctx.beginPath(); ctx.ellipse(hx0 + 8, hy0 + 9, 2, 3.5, 0, 0, TAU); ctx.fill();
    }
    // ---- the ladle
    {
      const bx = hx + dx * LADLE, by = hy + dy * LADLE;
      ctx.lineCap = 'round';
      ctx.strokeStyle = CL.outline; ctx.lineWidth = 6.5;
      ctx.beginPath(); ctx.moveTo(rearX - dx * 4, rearY - dy * 4); ctx.lineTo(bx - dx * 10, by - dy * 10); ctx.stroke();
      ctx.strokeStyle = LB.iron; ctx.lineWidth = 3.6; ctx.stroke();
      ctx.strokeStyle = LB.ironHi; ctx.lineWidth = 1.1;
      ctx.beginPath(); ctx.moveTo(rearX - dx * 3, rearY - dy * 3 - 1); ctx.lineTo(bx - dx * 11, by - dy * 11 - 1); ctx.stroke();
      // bowl: rim along the handle direction, the cup hanging below the rim (rotated with the handle)
      ctx.save();
      ctx.translate(bx, by); ctx.rotate(a);
      const cup = new Path2D();
      cup.moveTo(-13, 0); cup.lineTo(13, 0); cup.bezierCurveTo(13, 10, 7, 14, 0, 14); cup.bezierCurveTo(-7, 14, -13, 10, -13, 0); cup.closePath();
      ch.shape(ctx, cup, { fill: LB.iron, box: [-13, 0, 13, 14], shade: 0.35, hi: 0.18, rim: '#ff9a50', rimWidth: 1.4 });
      ctx.fillStyle = LB.rust; ctx.globalAlpha = 0.6; ctx.fillRect(-11, 4, 22, 2); ctx.globalAlpha = 1;
      const fill = dead ? 0 : (e.fill || 0);
      if (fill > 0.02) {
        glow(ctx, 0, -2, 22 + 14 * fill, CL.molten, 0.25 + 0.4 * fill);
        ctx.fillStyle = CL.molten; ctx.beginPath(); ctx.ellipse(0, 0, 12.5, 2.4 + 2.2 * fill, 0, Math.PI, TAU); ctx.fill();
        ctx.fillStyle = CL.moltenHot; ctx.beginPath(); ctx.ellipse(-1, -0.6 - 1.4 * fill, 8, 1 + 1.2 * fill, 0, 0, TAU); ctx.fill();
        if (fill > 0.6) { ctx.fillStyle = CL.moltenCore; ctx.beginPath(); ctx.ellipse(-2, -1.5 - fill, 3.5, 0.9, 0, 0, TAU); ctx.fill(); }
      } else {
        ctx.fillStyle = '#120a08'; ctx.beginPath(); ctx.ellipse(0, 0, 12, 2.2, 0, 0, TAU); ctx.fill();
      }
      ctx.strokeStyle = CL.outline; ctx.lineWidth = 1.6; ctx.beginPath(); ctx.ellipse(0, 0, 13, 2.6 + 2 * fill, 0, 0, TAU); ctx.stroke();
      ctx.restore();
    }
    // ---- front arm, over the body and the ladle, gripping near the hands
    arm(ctx, 18 + lx, top + 22, hx, hy, LB.wax, 10);
    ctx.restore();
  }
  /** A thick tallow arm from the shoulder (sx, sy) to the hand (hx, hy): upper arm + forearm with the elbow bent
   *  backward/down, a leather bracer and a fist. */
  function arm(ctx, sx, sy, hx, hy, color, w) {
    const dx = hx - sx, dy = hy - sy, d = Math.max(1, Math.hypot(dx, dy));
    const seg = 19, half = Math.min(d / 2, seg - 0.5);
    const bend = Math.sqrt(Math.max(0, seg * seg - half * half));
    let nx = -dy / d, ny = dx / d;
    if (nx > 0 || (Math.abs(nx) < 0.2 && ny < 0)) { nx = -nx; ny = -ny; }   // elbow points back (and down)
    const ex = sx + dx / 2 + nx * bend, ey = sy + dy / 2 + ny * bend;
    ctx.lineCap = 'round'; ctx.lineJoin = 'round';
    ctx.strokeStyle = CL.outline; ctx.lineWidth = w + 4;
    ctx.beginPath(); ctx.moveTo(sx, sy); ctx.lineTo(ex, ey); ctx.lineTo(hx, hy); ctx.stroke();
    ctx.strokeStyle = color; ctx.lineWidth = w + 1;
    ctx.beginPath(); ctx.moveTo(sx, sy); ctx.lineTo(ex, ey); ctx.stroke();
    ctx.lineWidth = w - 1;
    ctx.beginPath(); ctx.moveTo(ex, ey); ctx.lineTo(hx, hy); ctx.stroke();
    // bracer on the forearm
    const bx = lerp(ex, hx, 0.62), by = lerp(ey, hy, 0.62);
    ctx.strokeStyle = CL.outline; ctx.lineWidth = w + 3.5;
    ctx.beginPath(); ctx.moveTo(lerp(ex, hx, 0.45), lerp(ey, hy, 0.45)); ctx.lineTo(bx, by); ctx.stroke();
    ctx.strokeStyle = LB.apron; ctx.lineWidth = w + 0.5; ctx.stroke();
    // fist
    ctx.fillStyle = CL.outline; ctx.beginPath(); ctx.arc(hx, hy, w * 0.62 + 1.8, 0, TAU); ctx.fill();
    ctx.fillStyle = color; ctx.beginPath(); ctx.arc(hx, hy, w * 0.62, 0, TAU); ctx.fill();
  }

  // ---- projectile: a molten wax blob (arcs; on the floor it leaves a burning puddle)
  class LadleBlob extends G.Projectile {
    draw(ctx, t) {
      const tr = this.trail, r = this.r;
      for (let i = 0; i < tr.length; i += 2) {
        const k = i / tr.length;
        glow(ctx, tr[i], tr[i + 1], r * (0.5 + k), CL.molten, 0.05 + 0.2 * k);
      }
      glow(ctx, this.cx, this.cy, r * 3.6, CL.molten, 0.55);
      const sp = Math.hypot(this.vx, this.vy), ang = Math.atan2(this.vy, this.vx);
      const st = clamp(sp / 700, 0, 0.45);
      ctx.save();
      ctx.translate(this.cx, this.cy); ctx.rotate(ang);
      ctx.fillStyle = CL.outline;
      ctx.beginPath(); ctx.ellipse(-r * st, 0, r * (1 + st) + 1.6, r * (1 - st * 0.4) + 1.6, 0, 0, TAU); ctx.fill();
      ctx.fillStyle = '#d0501a';
      ctx.beginPath(); ctx.ellipse(-r * st, 0, r * (1 + st), r * (1 - st * 0.4), 0, 0, TAU); ctx.fill();
      ctx.fillStyle = CL.molten;
      ctx.beginPath(); ctx.ellipse(-r * st * 0.5, -r * 0.1, r * 0.8 * (1 + st), r * 0.7, 0, 0, TAU); ctx.fill();
      ctx.fillStyle = CL.moltenHot;
      ctx.beginPath(); ctx.ellipse(r * 0.15, -r * 0.25, r * 0.45, r * 0.35, 0, 0, TAU); ctx.fill();
      ctx.fillStyle = CL.moltenCore;
      ctx.beginPath(); ctx.arc(r * 0.3, -r * 0.3, r * 0.18, 0, TAU); ctx.fill();
      // a dark cooling fleck or two
      ctx.fillStyle = 'rgba(60,24,10,0.8)';
      ctx.beginPath(); ctx.arc(-r * 0.6, r * 0.35, r * 0.2, 0, TAU); ctx.arc(-r * 0.1, r * 0.55, r * 0.13, 0, TAU); ctx.fill();
      ctx.restore();
      void t;
    }
    update(dt) {
      super.update(dt);
      if (!this.dead && Math.random() < dt * 14) burst('ember', this.cx, this.cy, { count: 1, color: CL.molten, speed: 30 });
    }
    burstFx(why) {
      if (!G.fx) return;
      if (why === 'expire' || why === 'clear') { burst('smoke', this.cx, this.cy, { count: 2, color: '#4a3a32', alpha: 0.35, size: 6 }); return; }
      burst('wax', this.cx, this.cy, { count: 7, color: CL.molten, speed: 180 });
      burst('spark', this.cx, this.cy, { count: 6, color: CL.moltenHot, speed: 220, angle: -Math.PI / 2, spread: 2.4 });
      burst('flash', this.cx, this.cy, { r: this.r * 3, color: CL.molten, life: 0.1 });
      sfx('wax_sizzle', this.cx, { vol: 0.55 });
      if (why === 'terrain') spawnPuddle(this.room || this._room, this.cx, this.cy);
    }
  }
  /** A burning puddle on the floor under (x, y) if there is flat, non-hazard floor there (not in a doorway zone). */
  function spawnPuddle(room, x, y) {
    if (!room || !G.spawnProjectile) return;
    const c = Math.floor(x / TILE);
    let floorY = null;
    for (let r = Math.floor((y - 10) / TILE); r <= Math.floor((y + 16) / TILE) + 1; r++) {
      const below = tileAt(room, c, r), here = tileAt(room, c, r - 1);
      if (standable(below) && !isSolid(here) && here !== G.T.PLATFORM && !isHaz(here)) { floorY = r * TILE; break; }
    }
    if (floorY == null || Math.abs(floorY - y) > 30) return;
    const fr = floorY / TILE;
    const okCol = (cc) => standable(tileAt(room, cc, fr)) && !isSolid(tileAt(room, cc, fr - 1)) && !isHaz(tileAt(room, cc, fr - 1)) && !isHaz(tileAt(room, cc, fr));
    let hwL = 26, hwR = 26;
    if (!okCol(Math.floor((x - 22) / TILE))) hwL = Math.max(6, x - c * TILE - 2);
    if (!okCol(Math.floor((x + 22) / TILE))) hwR = Math.max(6, (c + 1) * TILE - x - 2);
    if (hwL + hwR < 22) return;
    const probe = { room };
    if (inZone(probe, x, floorY - 20)) return;
    G.spawnProjectile(room, 'ladle_puddle', { x: x + (hwR - hwL) / 2, y: floorY - 6, hw: (hwL + hwR) / 2 });
  }
  // ---- the burning puddle: harmless for its first 0.1 s and its last 0.35 s (it crusts over), ~1.5 s total
  class LadlePuddle extends G.Projectile {
    constructor(props) {
      super(Object.assign({}, props, { r: 6 }));
      this.hw = (props && props.hw) || 26;
      this.light = false;
      this.terrain = false;
    }
    get floorY() { return this.cy + this.r; }
    hot() { return this.age > 0.1 && this.age < this.life - 0.35; }
    hitBox() { return { x: this.cx - this.hw + 3, y: this.floorY - 12, w: this.hw * 2 - 6, h: 12 }; }
    hurtRect() { return null; }
    update(dt) {
      this.age += dt;
      if (this.age >= this.life) { this.remove(); return; }
      const p = G.game && G.game.player;
      if (this.hot() && p && !p.dead) {
        const b = this.hitBox();
        if (p.x < b.x + b.w && p.x + p.w > b.x && p.y < b.y + b.h && p.y + p.h > b.y) G.Combat.hurtPlayer(this.damage, this);
      }
      if (this.hot() && Math.random() < dt * 9) burst('ember', this.cx + rnd(-this.hw, this.hw) * 0.8, this.floorY - 3, { count: 1, color: CL.molten, speed: 40, angle: -Math.PI / 2, spread: 0.6 });
      const k = this.hot() ? 1 : 0.4;
      if (G.lighting) G.lighting.add({ x: this.cx, y: this.floorY - 8, r: 60 + this.hw, color: '#ff8a30', intensity: 0.4 * k * (1 - this.age / this.life * 0.5) });
    }
    burstFx() { burst('smoke', this.cx, this.floorY - 4, { count: 2, color: '#4a3a32', alpha: 0.3, size: 6 }); }
    draw(ctx, t) {
      const x = this.cx, y = this.floorY, hw = this.hw;
      const grow = clamp(this.age / 0.12, 0, 1), left = this.life - this.age;
      const cool = clamp(1 - left / 0.45, 0, 1);              // crusting over at the end
      const fade = clamp(left / 0.2, 0, 1);
      const w = hw * (0.5 + 0.5 * grow);
      ctx.save(); ctx.globalAlpha *= fade;
      if (cool < 1) glow(ctx, x, y - 4, w * 1.6, CL.molten, 0.5 * (1 - cool));
      ctx.fillStyle = CL.outline;
      ctx.beginPath(); ctx.ellipse(x, y - 2, w + 1.5, 5.5, 0, 0, TAU); ctx.fill();
      ctx.fillStyle = cool > 0.5 ? '#4a2614' : '#c4471a';
      ctx.beginPath(); ctx.ellipse(x, y - 2.2, w, 4.2, 0, 0, TAU); ctx.fill();
      if (cool < 0.9) {
        ctx.globalAlpha *= 1 - cool;
        ctx.fillStyle = CL.molten; ctx.beginPath(); ctx.ellipse(x, y - 2.8, w * 0.82, 3, 0, 0, TAU); ctx.fill();
        ctx.fillStyle = CL.moltenHot; ctx.beginPath(); ctx.ellipse(x - w * 0.15, y - 3.4, w * 0.45, 1.6, 0, 0, TAU); ctx.fill();
        // licking flames
        if (G.Art && G.Art.flame && grow >= 1) {
          for (let i = 0; i < 3; i++) {
            const fx = x + (i - 1) * w * 0.55 + Math.sin(t * 3 + i * 2 + this.seed) * 2;
            G.Art.flame(ctx, fx, y - 3, 10 + 5 * Math.sin(t * 5 + i * 1.7 + this.seed) * 0.5 + (i === 1 ? 5 : 0), 'orange', t, this.seed + i);
          }
        }
        // bubbles popping
        const ph = (t * 1.6 + this.seed) % 1;
        ctx.strokeStyle = CL.moltenCore; ctx.lineWidth = 1;
        ctx.beginPath(); ctx.arc(x + w * 0.35, y - 3.5, 1 + ph * 2, Math.PI, TAU); ctx.stroke();
      }
      ctx.restore();
    }
  }
  if (G.registerProjectile) {
    G.registerProjectile('ladle_blob', LadleBlob, { r: 8, gravity: 1250, life: 4, color: CL.molten, damage: 1, destroyable: true });
    G.registerProjectile('ladle_puddle', LadlePuddle, { r: 6, gravity: 0, life: 1.55, color: CL.molten, damage: 1, destroyable: false });
  }
  G.registerEnemy('ladle_brute', LadleBrute);

  G.Events = G.Events || {};


  // =====================================================================================================
  // REGION SET PIECES (module region-chandlery): event scripts placed by tools/gen/chandlery.js. All art is painted
  // once into cached canvases; per frame only drawImage + a few additive glows / rects / particles.
  //   ch_knightmold  the colossal hanging knight-mold of the Great Foundry (ch_02)       props c, r0, r1, w
  //   ch_pour        a giant tilted ladle on a chain pouring a molten stream              props c, r0, ry, y1, flip
  //   ch_gate        the Slag Gate's riveted header, raised portcullis and slag-crusted jambs props c0, c1, r0, r1, r2
  //   ch_furnace     the round furnace door that glows like a heart (ch_08 -> Kiln Heart) props c, r, rad
  //   ch_cage        the chain-hung cage around the wings perch (ch_08)                   props c0, c1, r, h
  //   ch_frost       frost breathing up through the Quench Gate's cracked floor (ch_06)   props c0, c1, r
  //   ch_quench      a quenching trough with steam (ch_05, ch_06)                         props c0, c1, r, water
  //   ch_plates      riveted iron plates over the back wall (ch_01's stone-to-iron seam)  props c0, c1, r0, r1, fade
  //   ch_soldiers    a rack of half-formed wax soldiers in their molds (ch_07, ch_05)      props c0, c1, r0, r1, seed
  //   ch_crucible    the towering crucible under the Plunge shrine's brim (ch_04)          props c0, c1, r0, r1
  //   ch_truss       riveted iron trestles under a gantry/walkway (ch_02)                 props cols[], r0, r1
  // Coordinates are tiles (cols/rows); anchors as noted per script.
  // =====================================================================================================
  const chSprites = new Map();
  function chSprite(key, w, h, fn) {
    let c = chSprites.get(key);
    if (!c) {
      const mc = G.U.makeCanvas(Math.max(1, Math.ceil(w)), Math.max(1, Math.ceil(h)));
      fn(mc.ctx, mc.canvas.width, mc.canvas.height); c = mc.canvas; chSprites.set(key, c);
    }
    return c;
  }
  const seen = (x, y, w, h, m) => !G.camera || !G.camera.visible || G.camera.visible(x, y, w, h, m == null ? 80 : m);
  const IRON = { dark: '#140d0a', base: '#2c1e17', mid: '#45302a', lite: '#6e4c3a', rim: 'rgba(242,180,130,0.55)', rivet: '#5e4234' };
  const MOLT = { a: '#ff8a24', b: '#ffb050', c: '#fff0b8', deep: '#c8400e' };
  const hx = (hex, a) => {
    const n = parseInt(hex.slice(1), 16);
    return 'rgba(' + ((n >> 16) & 255) + ',' + ((n >> 8) & 255) + ',' + (n & 255) + ',' + a + ')';
  };
  function rivetRow(x, x0, x1, y, step, r) {
    for (let px = x0; px <= x1; px += step) {
      x.fillStyle = IRON.dark; x.beginPath(); x.arc(px + 0.6, y + 0.8, r, 0, TAU); x.fill();
      x.fillStyle = IRON.rivet; x.beginPath(); x.arc(px, y, r, 0, TAU); x.fill();
      x.fillStyle = 'rgba(255,200,160,0.35)'; x.fillRect(px - r * 0.5, y - r * 0.6, r * 0.6, r * 0.5);
    }
  }
  function chainLinks(x, cx, y0, y1, link, wid, col) {
    x.lineWidth = wid;
    for (let y = y0, i = 0; y < y1; y += link * 0.8, i++) {
      x.strokeStyle = IRON.dark;
      if (i % 2) { x.beginPath(); x.moveTo(cx, y); x.lineTo(cx, Math.min(y1, y + link)); x.stroke(); }
      else { x.beginPath(); x.ellipse(cx, y + link * 0.5, link * 0.28, link * 0.5, 0, 0, TAU); x.stroke(); }
      x.strokeStyle = col || IRON.lite; x.lineWidth = wid * 0.45;
      x.beginPath(); x.moveTo(cx - link * 0.2, y + link * 0.2); x.lineTo(cx - link * 0.2, y + link * 0.7); x.stroke();
      x.lineWidth = wid;
    }
  }
  function plateFill(x, x0, y0, w, h, seed) {
    const g = x.createLinearGradient(x0, y0, x0, y0 + h);
    g.addColorStop(0, IRON.mid); g.addColorStop(0.5, IRON.base); g.addColorStop(1, '#20150f');
    x.fillStyle = g; x.fillRect(x0, y0, w, h);
    for (let k = 0; k < (w * h) / 2400; k++) {            // rust streaks and scuffs
      const px = x0 + h01(k, seed) * w, py = y0 + h01(k, seed + 1) * h;
      x.fillStyle = 'rgba(120,58,26,' + (0.08 + h01(k, seed + 2) * 0.14).toFixed(3) + ')';
      x.fillRect(px, py, 2 + h01(k, seed + 3) * 4, 6 + h01(k, seed + 4) * 26);
    }
    x.fillStyle = 'rgba(255,190,140,0.10)'; x.fillRect(x0, y0, w, 2);
    x.fillStyle = 'rgba(0,0,0,0.35)'; x.fillRect(x0, y0 + h - 2, w, 2);
  }
  const fxSpawn = (o) => { if (G.fx && G.fx.spawn) G.fx.spawn(o); };
  const addLight = (x, y, r, color, intensity, flicker) => { if (G.lighting) G.lighting.add({ x, y, r, color, intensity, flicker: !!flicker }); };

  // ---------------------------------------------------------------- ch_knightmold
  // Anchor: c = centre column (fractional ok), r0 = the ceiling row the chains hang from (their top = top of row r0+1),
  // r1 = the row the mold's feet end on (bottom of that row), w = width in tiles (default 10). z < -10 (behind terrain).
  function moldPath(u) {
    // right half outline (x from the centre line, y down from the mold's top), mirrored for the left half
    const R = [[0.42, 0.9], [1.2, 1.1], [1.62, 1.9], [1.6, 2.9], [1.18, 3.3], [2.6, 3.3], [3.9, 3.6], [4.75, 4.4], [4.85, 5.3],
      [4.2, 5.8], [3.45, 5.75], [3.2, 7.4], [2.45, 8.3], [3.05, 9.5], [2.55, 10.05], [2.05, 10.3], [1.75, 12.4], [2.2, 12.95],
      [0.4, 12.95], [0.42, 10.45], [0, 10.25]];
    const p = new Path2D();
    p.moveTo(0, 0.9 * u);
    for (const [px, py] of R) p.lineTo(px * u, py * u);
    for (let i = R.length - 1; i >= 0; i--) p.lineTo(-R[i][0] * u, R[i][1] * u);
    p.closePath();
    return p;
  }
  function paintKnightMold(x, W, H, o) {
    const u = o.u, cx = W / 2, top = o.chain;      // mold top (y) inside the sprite
    // chains from the ceiling (sprite top) to the pauldrons and the sprue
    for (const ax of [-3.9, 3.9]) chainLinks(x, cx + ax * u, 0, top + 4.0 * u, 18, 5);
    chainLinks(x, cx, 0, top + 0.2 * u, 16, 4);
    x.save(); x.translate(cx, top);
    const path = moldPath(u);
    // the two halves; the left one hangs a hand's breadth ajar and the cold interior shows a last ember of wax
    const gap = 7;
    x.save(); x.beginPath(); x.rect(0, -10, W, H); x.clip();
    const gi = x.createLinearGradient(-gap, 0, gap, 0);
    gi.addColorStop(0, 'rgba(255,120,40,0)'); gi.addColorStop(0.5, 'rgba(255,150,70,0.55)'); gi.addColorStop(1, 'rgba(255,120,40,0)');
    x.fillStyle = gi; x.fillRect(-gap - 2, 1.0 * u, gap * 2 + 4, 9.2 * u);
    x.restore();
    for (const side of [-1, 1]) {
      x.save();
      x.translate(side < 0 ? -gap : 0, side < 0 ? 3 : 0);
      x.beginPath(); x.rect(side < 0 ? -W : 0, -10, W, H + 20); x.clip();
      // body
      const g = x.createLinearGradient(-5 * u, 0, 5 * u, 0);
      g.addColorStop(0, '#3a2a22'); g.addColorStop(0.3, IRON.base); g.addColorStop(0.62, '#241812'); g.addColorStop(1, '#1a110d');
      x.fillStyle = g; x.fill(path);
      x.save(); x.clip(path);
      // under-glow from the foundry floor far below
      const gb = x.createLinearGradient(0, 8 * u, 0, 13 * u);
      gb.addColorStop(0, 'rgba(255,120,40,0)'); gb.addColorStop(1, 'rgba(255,130,50,0.22)');
      x.fillStyle = gb; x.fillRect(-5 * u, 8 * u, 10 * u, 5 * u);
      // riveted straps: shoulders, waist, knees
      for (const [yy, hh] of [[3.35, 0.3], [5.55, 0.22], [8.2, 0.3], [11.3, 0.26]]) {
        x.fillStyle = '#1a110d'; x.fillRect(-5 * u, yy * u, 10 * u, hh * u);
        x.fillStyle = 'rgba(255,190,140,0.16)'; x.fillRect(-5 * u, yy * u, 10 * u, 1.5);
        rivetRow(x, -5 * u + 6, 5 * u, (yy + hh / 2) * u, 0.55 * u, 2.6);
      }
      // plate lines (pauldron lames, breastplate ridge)
      x.strokeStyle = 'rgba(0,0,0,0.45)'; x.lineWidth = 2;
      for (const yy of [4.15, 4.75]) { x.beginPath(); x.moveTo(1.4 * u * side, (yy - 0.3) * u); x.quadraticCurveTo(3.2 * u * side, (yy - 0.1) * u, 4.7 * u * side, (yy + 0.45) * u); x.stroke(); }
      x.beginPath(); x.moveTo(0.8 * u * side, 6.1 * u); x.quadraticCurveTo(2.1 * u * side, 6.9 * u, 2.6 * u * side, 8.1 * u); x.stroke();
      // rust and drips of old wax down the casting
      for (let k = 0; k < 26; k++) {
        const px = side * (0.3 + h01(k, 9 + side) * 4.2) * u, py = (1 + h01(k, 12 + side) * 11) * u;
        x.fillStyle = 'rgba(120,56,24,' + (0.12 + h01(k, 5) * 0.16).toFixed(3) + ')';
        x.fillRect(px, py, 2 + h01(k, 6) * 3, 10 + h01(k, 7) * 30);
      }
      for (let k = 0; k < 9; k++) {
        const px = side * (0.5 + h01(k, 21 + side) * 3.6) * u, py = (3.3 + h01(k, 23) * 7) * u, len = 12 + h01(k, 24) * 34;
        x.fillStyle = 'rgba(232,196,150,0.30)'; x.fillRect(px, py, 3, len);
        x.beginPath(); x.arc(px + 1.5, py + len, 2.6, 0, TAU); x.fill();
      }
      x.restore();
      // rim light (the forge glow catching the edges)
      x.strokeStyle = side < 0 ? 'rgba(242,180,130,0.5)' : 'rgba(242,180,130,0.22)'; x.lineWidth = 2.2; x.stroke(path);
      x.strokeStyle = 'rgba(0,0,0,0.6)'; x.lineWidth = 1; x.stroke(path);
      x.restore();
    }
    // visor slit with the last heat inside, and the sprue funnel on the crown
    x.fillStyle = '#0a0605'; x.fillRect(-1.15 * u, 2.05 * u, 2.3 * u, 0.24 * u);
    x.fillStyle = 'rgba(255,140,60,0.55)'; x.fillRect(-1.0 * u, 2.13 * u, 2.0 * u, 0.07 * u);
    x.fillStyle = '#0a0605'; for (let k = -2; k <= 2; k++) x.fillRect(k * 0.36 * u - 2, 2.4 * u, 4, 0.5 * u);
    const fn = new Path2D(); fn.moveTo(-0.95 * u, 0); fn.lineTo(0.95 * u, 0); fn.lineTo(0.42 * u, 0.95 * u); fn.lineTo(-0.42 * u, 0.95 * u); fn.closePath();
    x.fillStyle = '#2a1c15'; x.fill(fn); x.strokeStyle = 'rgba(242,180,130,0.45)'; x.lineWidth = 2; x.stroke(fn);
    x.fillStyle = '#120a07'; x.fillRect(-0.7 * u, 0, 1.4 * u, 0.14 * u);
    // seam clamps
    for (let yy = 1.4; yy < 10; yy += 1.25) {
      x.fillStyle = '#120b08'; x.fillRect(-0.42 * u, yy * u, 0.84 * u, 0.2 * u);
      x.fillStyle = IRON.lite; x.fillRect(-0.42 * u, yy * u, 0.84 * u, 2);
      rivetRow(x, -0.3 * u, 0.3 * u + 1, (yy + 0.1) * u, 0.6 * u, 2.4);
    }
    x.restore();
  }
  G.Events.ch_knightmold = G.Events.ch_knightmold || {
    init(e) {
      e.cull = false; e.z = e.props.z != null ? e.props.z : -15;
      const p = e.props, w = p.w || 10, u = (w * TILE) / 10;
      const ceilY = (p.r0 + 1) * TILE, bot = (p.r1 + 1) * TILE, moldH = 13 * u;
      const chain = Math.max(20, bot - ceilY - moldH);
      e.data.o = { u, chain, W: Math.ceil(w * TILE + 2 * u), H: Math.ceil(chain + moldH + 8) };
      e.data.x = p.c * TILE - e.data.o.W / 2; e.data.y = ceilY; e.data.acc = 0;
    },
    update(e, dt) {
      const d = e.data, o = d.o;
      if (!seen(d.x, d.y, o.W, o.H)) return;
      d.acc += dt;
      if (d.acc > 0.55) {                       // old wax still weeps from the feet and the open seam
        d.acc = 0;
        const fx = d.x + o.W / 2 + (Math.random() < 0.5 ? -1 : 1) * (0.6 + Math.random() * 1.4) * o.u;
        fxSpawn({ x: fx, y: d.y + o.chain + 12.9 * o.u, vx: 0, vy: 20, gravity: 700, life: 1.4, size: 2.2, color: '#e8b070', alpha: 0.75, shape: 'drop' });
      }
      addLight(d.x + o.W / 2 - 4, d.y + o.chain + 5 * o.u, 4 * o.u, '#ff8a3a', 0.18, true);
    },
    draw(e, ctx, t) {
      const d = e.data, o = d.o;
      if (!seen(d.x, d.y, o.W, o.H)) return;
      const img = chSprite('ch_knightmold:' + o.W + 'x' + o.H, o.W, o.H, (x, w, h) => paintKnightMold(x, w, h, o));
      const sw = Math.sin(t * 0.35) * 0.006;     // a colossal, slow sway on its chains
      ctx.save(); ctx.translate(d.x + o.W / 2, d.y); ctx.rotate(sw); ctx.drawImage(img, -o.W / 2, 0); ctx.restore();
      glow(ctx, d.x + o.W / 2 - 4, d.y + o.chain + 5.5 * o.u, o.u * 2.2, '#ff7a30', 0.12 + 0.05 * Math.sin(t * 1.3));
    },
  };

  // ---------------------------------------------------------------- ch_pour
  // A giant ladle on a chain, tipped, pouring a molten stream. c = pivot column (centre), r0 = ceiling row (chain top =
  // bottom of r0), ry = the row of the ladle bowl, y1 = the row the stream ends on (its top), flip = pour to the left.
  function paintLadle(x, W, H) {
    const cx = W / 2, cy = H / 2;
    x.translate(cx, cy);
    // handle up to the chain ring
    x.strokeStyle = IRON.dark; x.lineWidth = 9; x.beginPath(); x.moveTo(-6, -8); x.lineTo(-30, -62); x.stroke();
    x.strokeStyle = IRON.mid; x.lineWidth = 5; x.stroke();
    x.strokeStyle = IRON.lite; x.lineWidth = 3; x.beginPath(); x.arc(-32, -66, 7, 0, TAU); x.stroke();
    // the bowl
    const b = new Path2D(); b.moveTo(-46, -6); b.lineTo(46, -6); b.quadraticCurveTo(44, 38, 0, 40); b.quadraticCurveTo(-44, 38, -46, -6); b.closePath();
    const g = x.createLinearGradient(-46, 0, 46, 0); g.addColorStop(0, IRON.lite); g.addColorStop(0.4, IRON.base); g.addColorStop(1, IRON.dark);
    x.fillStyle = g; x.fill(b); x.strokeStyle = 'rgba(0,0,0,0.6)'; x.lineWidth = 2; x.stroke(b);
    for (const yy of [6, 22]) { x.fillStyle = 'rgba(0,0,0,0.35)'; x.fillRect(-44, yy, 88, 3); }
    rivetRow(x, -38, 38, 7.5, 12, 2.2);
    // molten surface and the lip it spills over
    x.fillStyle = MOLT.a; x.beginPath(); x.ellipse(0, -6, 45, 7, 0, 0, TAU); x.fill();
    x.fillStyle = MOLT.c; x.beginPath(); x.ellipse(8, -7, 26, 3, 0, 0, TAU); x.fill();
    x.fillStyle = '#2a1a12'; x.beginPath(); x.moveTo(42, -10); x.lineTo(58, -4); x.lineTo(44, 2); x.closePath(); x.fill();
  }
  G.Events.ch_pour = G.Events.ch_pour || {
    init(e) {
      e.cull = false; e.z = e.props.z != null ? e.props.z : -15;
      const p = e.props;
      e.data.px = (p.c + 0.5) * TILE; e.data.py = (p.ry + 0.5) * TILE; e.data.top = (p.r0 + 1) * TILE;
      e.data.y1 = p.y1 * TILE; e.data.dir = p.flip ? -1 : 1; e.data.acc = 0; e.data.seed = (p.c * 7 + p.ry) % 13;
    },
    lip(e, t) {
      const d = e.data, a = (0.42 + 0.04 * Math.sin(t * 0.8 + d.seed)) * d.dir;
      // the lip in ladle space is (56, -4): rotate by a
      return { x: d.px + (56 * Math.cos(a) * d.dir + 4 * Math.sin(a)) , y: d.py + 56 * Math.sin(Math.abs(a)) - 4 * Math.cos(a), a };
    },
    update(e, dt) {
      const d = e.data;
      if (!seen(d.px - 120, d.top, 240, d.y1 - d.top + 20)) return;
      const L = G.Events.ch_pour.lip(e, G.game ? G.game.t : 0);
      d.acc += dt;
      if (d.acc > 0.07) {
        d.acc = 0;
        fxSpawn({ x: L.x + 6 * d.dir, y: d.y1 - 2, vx: (Math.random() - 0.5) * 140, vy: -80 - Math.random() * 120, gravity: 700, life: 0.45 + Math.random() * 0.3, size: 1.6, color: '#ffd080', add: true });
      }
      addLight(L.x + 6 * d.dir, (L.y + d.y1) / 2, (d.y1 - L.y) * 0.6 + 60, MOLT.a, 0.35, true);
    },
    draw(e, ctx, t) {
      const d = e.data;
      if (!seen(d.px - 120, d.top, 240, d.y1 - d.top + 20)) return;
      const L = G.Events.ch_pour.lip(e, t);
      // chain from the ceiling to the handle ring
      const ring = { x: d.px + (-32 * Math.cos(L.a) * d.dir + 66 * Math.sin(L.a)), y: d.py + (-32 * Math.sin(Math.abs(L.a))) - 66 * Math.cos(L.a) };
      const ck = 'ch_chain:' + Math.round(ring.y - d.top);
      const chain = chSprite(ck, 16, Math.max(8, ring.y - d.top), (x, w, h) => chainLinks(x, 8, 0, h, 16, 4));
      ctx.drawImage(chain, ring.x - 8, d.top);
      // the stream (wobbling column with a bright core) and its splash
      const sx = L.x + 6 * d.dir, h = d.y1 - L.y;
      if (h > 0) {
        ctx.fillStyle = MOLT.a;
        for (let y = 0; y < h; y += 14) {
          const wob = Math.sin(t * 11 + y * 0.07) * 1.4, w = 8 + (y < 30 ? (30 - y) * 0.12 : 0);
          ctx.fillRect(sx + wob - w / 2, L.y + y, w, Math.min(15, h - y));
        }
        ctx.fillStyle = MOLT.c;
        for (let y = 0; y < h; y += 14) ctx.fillRect(sx + Math.sin(t * 11 + y * 0.07) * 1.4 - 1.5, L.y + y, 3, Math.min(15, h - y));
        glow(ctx, sx, L.y + h * 0.5, Math.max(40, h * 0.45), MOLT.a, 0.22);
        glow(ctx, sx, d.y1, 46, MOLT.b, 0.5 + 0.1 * Math.sin(t * 9));
      }
      const img = chSprite('ch_ladle', 140, 150, paintLadle);
      ctx.save(); ctx.translate(d.px, d.py); ctx.rotate(L.a); if (d.dir < 0) ctx.scale(-1, 1);
      ctx.drawImage(img, -70, -75); ctx.restore();
      glow(ctx, d.px + 8 * d.dir, d.py - 4, 50, MOLT.a, 0.3);
    },
  };

  // ---------------------------------------------------------------- ch_gate
  // The Slag Gate: c0..c1 = the header's columns, r0..r1 = its rows (solid tiles), r2 = the floor-top row of the
  // passage under it. Plates over the header, the raised portcullis' teeth, iron jambs crusted with slag. z -5.
  function paintGate(x, W, H, o) {
    const hh = o.hh;                                        // header height (px)
    // header plates
    const pw = W / Math.max(2, Math.round(W / 70));
    for (let px = 0; px < W - 1; px += pw) {
      plateFill(x, px + 1, 0, pw - 2, hh - 4, 3 + px);
      rivetRow(x, px + 7, px + pw - 6, 7, 12, 2.3); rivetRow(x, px + 7, px + pw - 6, hh - 12, 12, 2.3);
    }
    // the raised portcullis: plate bottoms with iron teeth showing under the header
    for (let k = 0; k < W / 22; k++) {
      const tx = 10 + k * 22;
      x.fillStyle = IRON.dark; x.beginPath(); x.moveTo(tx - 6, hh - 6); x.lineTo(tx + 6, hh - 6); x.lineTo(tx, hh + 14); x.closePath(); x.fill();
      x.fillStyle = 'rgba(242,180,130,0.25)'; x.fillRect(tx - 5, hh - 6, 2, 10);
    }
    x.fillStyle = '#100907'; x.fillRect(0, hh - 8, W, 5);
    // jambs: riveted iron posts down to the floor
    for (const jx of [0, W - 22]) {
      plateFill(x, jx, hh - 4, 22, H - hh + 4, 7 + jx);
      rivetRow(x, jx + 11, jx + 11, hh + 10, 1, 2.4);
      for (let yy = hh + 26; yy < H - 8; yy += 26) rivetRow(x, jx + 6, jx + 17, yy, 11, 2.2);
    }
    // old slag crusting the plates (dark glassy lumps with ember cracks)
    for (let k = 0; k < 22; k++) {
      const onJamb = k > 13, jx = (k % 2) ? 0 : W - 22;
      const px = onJamb ? jx + h01(k, 41) * 22 : h01(k, 41) * W, py = onJamb ? hh + h01(k, 42) * (H - hh - 20) : hh * (0.45 + h01(k, 42) * 0.55);
      const r = 5 + h01(k, 43) * 9;
      x.fillStyle = '#1c120e'; x.beginPath(); x.ellipse(px, py, r * 1.2, r, 0, 0, TAU); x.fill();
      x.fillStyle = 'rgba(90,52,32,0.8)'; x.beginPath(); x.ellipse(px - r * 0.3, py - r * 0.35, r * 0.6, r * 0.35, 0, 0, TAU); x.fill();
      x.strokeStyle = 'rgba(255,120,40,0.55)'; x.lineWidth = 1.2;
      x.beginPath(); x.moveTo(px - r * 0.6, py); x.lineTo(px, py + r * 0.3); x.lineTo(px + r * 0.5, py - r * 0.2); x.stroke();
    }
  }
  G.Events.ch_gate = G.Events.ch_gate || {
    init(e) {
      e.cull = false; e.z = e.props.z != null ? e.props.z : -5;
      const p = e.props;
      e.data.r = { x: p.c0 * TILE - 14, y: p.r0 * TILE, w: (p.c1 - p.c0 + 1) * TILE + 28, h: (p.r2 - p.r0) * TILE };
      e.data.hh = (p.r1 - p.r0 + 1) * TILE;
    },
    draw(e, ctx, t) {
      const r = e.data.r;
      if (!seen(r.x, r.y, r.w, r.h)) return;
      const o = { hh: e.data.hh };
      ctx.drawImage(chSprite('ch_gate:' + r.w + 'x' + r.h + ':' + o.hh, r.w, r.h, (x, w, h) => paintGate(x, w, h, o)), r.x, r.y);
      glow(ctx, r.x + r.w / 2, r.y + o.hh * 0.6, r.w * 0.45, '#ff6a20', 0.07 + 0.03 * Math.sin(t * 1.7));
    },
  };

  // ---------------------------------------------------------------- ch_furnace
  // The round furnace door before the Kiln Heart: c = centre column, r = centre row (fractional ok), rad = radius in
  // tiles. A riveted ring around the doorway; the hatch swung open on its hinge; the glow beats like a heart. z -5.
  function paintFurnaceRing(x, S, rad) {
    const c = S / 2, R0 = rad, R1 = rad - 26;
    const g = x.createRadialGradient(c, c, R1, c, c, R0);
    g.addColorStop(0, '#120b08'); g.addColorStop(0.35, IRON.mid); g.addColorStop(0.7, IRON.base); g.addColorStop(1, '#100907');
    x.fillStyle = g; x.beginPath(); x.arc(c, c, R0, 0, TAU); x.arc(c, c, R1, 0, TAU, true); x.fill('evenodd');
    x.strokeStyle = 'rgba(242,180,130,0.45)'; x.lineWidth = 2; x.beginPath(); x.arc(c, c, R0 - 2, Math.PI * 0.9, Math.PI * 1.6); x.stroke();
    x.strokeStyle = 'rgba(255,140,60,0.5)'; x.lineWidth = 2; x.beginPath(); x.arc(c, c, R1 + 1, 0, TAU); x.stroke();
    for (let k = 0; k < 20; k++) {                         // rivets around the ring
      const a = (k / 20) * TAU, rr = (R0 + R1) / 2;
      rivetRow(x, c + Math.cos(a) * rr, c + Math.cos(a) * rr, c + Math.sin(a) * rr, 1, 3);
    }
    for (let k = 0; k < 4; k++) {                          // bolted clamps
      const a = Math.PI * 0.25 + (k / 4) * TAU;
      x.save(); x.translate(c + Math.cos(a) * (R0 - 13), c + Math.sin(a) * (R0 - 13)); x.rotate(a);
      x.fillStyle = '#0e0806'; x.fillRect(-16, -9, 32, 18); x.fillStyle = IRON.lite; x.fillRect(-16, -9, 32, 2); x.restore();
    }
  }
  function paintHatch(x, W, H) {
    // the open round hatch, seen nearly edge-on (an ellipse), hinged at its right edge
    const g = x.createLinearGradient(0, 0, W, 0); g.addColorStop(0, IRON.dark); g.addColorStop(0.5, IRON.mid); g.addColorStop(1, IRON.base);
    x.fillStyle = g; x.beginPath(); x.ellipse(W / 2, H / 2, W / 2 - 1, H / 2 - 1, 0, 0, TAU); x.fill();
    x.strokeStyle = 'rgba(0,0,0,0.6)'; x.lineWidth = 2; x.stroke();
    x.fillStyle = 'rgba(255,150,80,0.35)'; x.beginPath(); x.ellipse(W / 2 + 3, H / 2, W / 2 - 7, H / 2 - 12, 0, 0, TAU); x.fill();
    x.fillStyle = IRON.dark; for (let y = 18; y < H - 10; y += 22) x.fillRect(W / 2 - 6, y, 12, 6);
  }
  const heart = (t) => { const ph = (t * 0.9) % 1; return Math.exp(-((ph - 0.08) ** 2) / 0.0035) + 0.6 * Math.exp(-((ph - 0.26) ** 2) / 0.004); };
  G.Events.ch_furnace = G.Events.ch_furnace || {
    init(e) {
      e.cull = false; e.z = e.props.z != null ? e.props.z : -5;
      const p = e.props;
      e.data.cx = p.c * TILE; e.data.cy = p.r * TILE; e.data.R = (p.rad || 3) * TILE;
    },
    update(e) {
      const d = e.data, t = G.game ? G.game.t : 0;
      if (!seen(d.cx - d.R, d.cy - d.R, d.R * 2, d.R * 2)) return;
      addLight(d.cx + 10, d.cy, d.R * 2.2, '#ff5a1a', 0.35 + 0.35 * heart(t), false);
    },
    draw(e, ctx, t) {
      const d = e.data, S = Math.ceil(d.R * 2 + 8);
      if (!seen(d.cx - d.R, d.cy - d.R, d.R * 2, d.R * 2)) return;
      const hb = heart(t);
      glow(ctx, d.cx + d.R * 0.3, d.cy, d.R * 1.4, '#ff5a1a', 0.28 + 0.4 * hb);
      glow(ctx, d.cx + d.R * 0.5, d.cy + 6, d.R * 0.8, '#ffc070', 0.15 + 0.35 * hb);
      ctx.drawImage(chSprite('ch_furnace:' + S, S, S, (x, w) => paintFurnaceRing(x, w, d.R)), d.cx - S / 2, d.cy - S / 2);
      const hw = 30, hh = Math.round(d.R * 1.7);
      ctx.drawImage(chSprite('ch_hatch:' + hh, hw, hh, paintHatch), d.cx - d.R - hw + 8, d.cy - hh / 2);
    },
  };

  // ---------------------------------------------------------------- ch_cage
  // A chain-hung birdcage built around a perch: c0..c1 = the perch's columns, r = its top row (the cage floor), h =
  // cage height in tiles. Back bars + dome + the door swung open on the east side. z -5 (the player stands in front).
  function paintCage(x, W, H, o) {
    const cx = W / 2, base = H - 4, rx = W / 2 - 6, dome = H * 0.28;
    x.lineCap = 'round';
    const bars = 9;
    for (let k = 0; k <= bars; k++) {
      const f = k / bars, bx = 6 + f * (W - 12);
      if (f > 0.72 && f < 0.98) continue;                    // the open door
      const top = base - (H - dome) + dome * (1 - Math.sqrt(Math.max(0, 1 - ((bx - cx) / rx) ** 2)));
      x.strokeStyle = IRON.dark; x.lineWidth = 5; x.beginPath(); x.moveTo(bx, base); x.lineTo(bx, top); x.quadraticCurveTo(bx, 6, cx, 6); x.stroke();
      x.strokeStyle = (k === 0 || k === bars) ? IRON.lite : IRON.mid; x.lineWidth = 2.5; x.stroke();
    }
    for (const yy of [base - 4, base - (H - dome) * 0.55]) {
      x.strokeStyle = IRON.dark; x.lineWidth = 6; x.beginPath(); x.moveTo(6, yy); x.lineTo(W - 6, yy); x.stroke();
      x.strokeStyle = IRON.lite; x.lineWidth = 2; x.stroke();
    }
    x.strokeStyle = IRON.lite; x.lineWidth = 4; x.beginPath(); x.arc(cx, 6, 6, 0, TAU); x.stroke();
    // the door, swung outward on its hinge
    const dx = 6 + 0.98 * (W - 12);
    x.strokeStyle = IRON.mid; x.lineWidth = 3;
    for (let k = 0; k < 3; k++) { x.beginPath(); x.moveTo(dx + 4 + k * 9, base - 6); x.lineTo(dx + 4 + k * 9, base - (H - dome) * 0.75); x.stroke(); }
    x.beginPath(); x.moveTo(dx + 2, base - 6); x.lineTo(dx + 24, base - 6); x.moveTo(dx + 2, base - (H - dome) * 0.75); x.lineTo(dx + 24, base - (H - dome) * 0.75); x.stroke();
  }
  G.Events.ch_cage = G.Events.ch_cage || {
    init(e) {
      e.cull = false; e.z = e.props.z != null ? e.props.z : -5;
      const p = e.props, w = (p.c1 - p.c0 + 1) * TILE + 8, h = (p.h || 4) * TILE;
      e.data.r = { x: p.c0 * TILE - 4, y: p.r * TILE - h, w, h };
    },
    draw(e, ctx) {
      const r = e.data.r;
      if (!seen(r.x, r.y, r.w + 40, r.h)) return;
      ctx.drawImage(chSprite('ch_cage:' + r.w + 'x' + r.h, r.w + 32, r.h, (x, w, h) => paintCage(x, w - 32, h, {})), r.x, r.y);
    },
  };

  // ---------------------------------------------------------------- ch_frost
  // Cold breath of the Rime through a cracked floor: c0..c1 = columns, r = the floor-top row. Blue glow + rising frost.
  G.Events.ch_frost = G.Events.ch_frost || {
    init(e) { e.cull = false; e.z = e.props.z != null ? e.props.z : -5; e.data.acc = 0; },
    update(e, dt) {
      const p = e.props, x0 = p.c0 * TILE, x1 = (p.c1 + 1) * TILE, y = p.r * TILE;
      if (!seen(x0, y - 200, x1 - x0, 240)) return;
      e.data.acc += dt * (p.rate || 9);
      while (e.data.acc > 1) {
        e.data.acc -= 1;
        fxSpawn({ x: x0 + Math.random() * (x1 - x0), y: y - 2, vx: (Math.random() - 0.5) * 14, vy: -18 - Math.random() * 26, drag: 0.4, life: 1.6 + Math.random() * 1.4, size: 3 + Math.random() * 4, size2: 9, color: '#bcd8ff', alpha: 0.22 });
        if (Math.random() < 0.3) fxSpawn({ x: x0 + Math.random() * (x1 - x0), y: y - 4, vx: 0, vy: -30 - Math.random() * 30, life: 1.2, size: 1.2, color: '#e8f4ff', alpha: 0.8, add: true });
      }
      addLight((x0 + x1) / 2, y - 10, (x1 - x0) * 0.8, '#7fb4ff', 0.3, true);
    },
    draw(e, ctx, t) {
      const p = e.props, x0 = p.c0 * TILE, x1 = (p.c1 + 1) * TILE, y = p.r * TILE;
      if (!seen(x0, y - 120, x1 - x0, 160)) return;
      for (let k = 0; k < 3; k++) glow(ctx, x0 + (x1 - x0) * (0.2 + 0.3 * k), y + 6, 46, '#8fc0ff', 0.22 + 0.06 * Math.sin(t * 1.6 + k * 2));
    },
  };

  // ---------------------------------------------------------------- ch_quench
  // A quenching trough standing on the floor: c0..c1 = columns, r = the floor-top row it stands on; water (default
  // true): dark water with hissing steam; false: molten wax. Behind terrain and characters (z -15).
  function paintTrough(x, W, H, water) {
    const g = x.createLinearGradient(0, 0, 0, H); g.addColorStop(0, IRON.mid); g.addColorStop(1, IRON.dark);
    x.fillStyle = g; x.fillRect(4, 10, W - 8, H - 10);
    x.fillStyle = IRON.dark; x.fillRect(0, 6, W, 8); x.fillStyle = 'rgba(242,180,130,0.4)'; x.fillRect(0, 6, W, 2);
    for (const fx of [10, W - 22]) { x.fillStyle = IRON.dark; x.fillRect(fx, H - 6, 12, 6); }
    rivetRow(x, 12, W - 12, 22, 16, 2.2);
    x.fillStyle = water ? '#2a3a44' : MOLT.a; x.fillRect(6, 9, W - 12, 4);
    x.fillStyle = water ? 'rgba(180,220,255,0.35)' : MOLT.c; x.fillRect(10, 9, W * 0.4, 1.5);
    // fresh candles cooling in the trough
    // (QA: varied heights, rounded tops and a soft shade so the row reads as candles, not as a spike strip)
    for (let k = 0; k < (W - 30) / 14; k++) {
      const cx = 16 + k * 14, ch = 6 + Math.round(h01(k, 37) * 4), top = 10 - ch;
      x.fillStyle = '#d9c39a'; x.fillRect(cx, top + 2, 7, ch - 2);
      x.beginPath(); x.ellipse(cx + 3.5, top + 2, 3.5, 2, 0, 0, TAU); x.fill();
      x.fillStyle = 'rgba(255,240,210,0.55)'; x.fillRect(cx + 1, top + 2, 1.5, ch - 3);
      x.fillStyle = 'rgba(60,36,20,0.35)'; x.fillRect(cx + 5, top + 2, 2, ch - 2);
      x.fillStyle = '#3a2a20'; x.fillRect(cx + 3, top - 2, 1.5, 3);
    }
  }
  G.Events.ch_quench = G.Events.ch_quench || {
    init(e) {
      e.cull = false; e.z = e.props.z != null ? e.props.z : -15; e.data.acc = 0;
      const p = e.props; e.data.r = { x: p.c0 * TILE, y: p.r * TILE - 34, w: (p.c1 - p.c0 + 1) * TILE, h: 34 };
    },
    update(e, dt) {
      const r = e.data.r;
      if (!seen(r.x, r.y - 120, r.w, 160)) return;
      e.data.acc += dt * (r.w / 40) * 1.1;
      while (e.data.acc > 1) {
        e.data.acc -= 1;
        fxSpawn({ x: r.x + 10 + Math.random() * (r.w - 20), y: r.y + 6, vx: (Math.random() - 0.5) * 16, vy: -26 - Math.random() * 30, drag: 0.5, life: 1.8 + Math.random(), size: 4, size2: 14, color: '#d8ccc0', alpha: 0.16 });
      }
    },
    draw(e, ctx) {
      const r = e.data.r, water = e.props.water !== false;
      if (!seen(r.x, r.y, r.w, r.h)) return;
      ctx.drawImage(chSprite('ch_trough:' + r.w + ':' + water, r.w, r.h + 2, (x, w, h) => { x.translate(0, 2); paintTrough(x, w, h - 2, water); }), r.x, r.y - 2);
      if (!water) glow(ctx, r.x + r.w / 2, r.y + 10, r.w * 0.5, MOLT.a, 0.25);
    },
  };

  // ---------------------------------------------------------------- ch_plates
  // Riveted iron plates bolted over the back wall: c0..c1, r0..r1 (tiles, inclusive). fade: 'left' fades the west edge
  // into the stone (the Gallery Gate's seam). Behind terrain (z -15).
  function paintPlates(x, W, H, fade) {
    const pw = 120, ph = 80;
    for (let py = 0; py < H; py += ph) {
      for (let px = -((py / ph) % 2) * pw * 0.5; px < W; px += pw) {
        plateFill(x, px + 2, py + 2, pw - 4, ph - 4, 11 + px * 0.1 + py);
        rivetRow(x, px + 10, px + pw - 10, py + 9, 14, 2.4);
        rivetRow(x, px + 10, px + pw - 10, py + ph - 10, 14, 2.4);
      }
    }
    x.fillStyle = 'rgba(10,6,4,0.35)'; x.fillRect(0, 0, W, H);
    if (fade === 'left') {
      x.globalCompositeOperation = 'destination-out';
      const g = x.createLinearGradient(0, 0, Math.min(W, 260), 0);
      g.addColorStop(0, 'rgba(0,0,0,1)'); g.addColorStop(1, 'rgba(0,0,0,0)');
      x.fillStyle = g; x.fillRect(0, 0, Math.min(W, 260), H);
      // ragged bolted edge where the plating stops
      for (let k = 0; k < H / 30; k++) x.fillRect(0, k * 30, 40 + h01(k, 61) * 90, 18);
      x.globalCompositeOperation = 'source-over';
    }
  }
  G.Events.ch_plates = G.Events.ch_plates || {
    init(e) {
      e.cull = false; e.z = e.props.z != null ? e.props.z : -15;
      const p = e.props; e.data.r = { x: p.c0 * TILE, y: p.r0 * TILE, w: (p.c1 - p.c0 + 1) * TILE, h: (p.r1 - p.r0 + 1) * TILE };
    },
    draw(e, ctx) {
      const r = e.data.r;
      if (!seen(r.x, r.y, r.w, r.h)) return;
      ctx.drawImage(chSprite('ch_plates:' + r.w + 'x' + r.h + ':' + (e.props.fade || ''), r.w, r.h, (x, w, h) => paintPlates(x, w, h, e.props.fade)), r.x, r.y);
    },
  };

  // ---------------------------------------------------------------- ch_soldiers
  // A tall iron rack of soldier molds: half-formed wax soldiers (pale, never lit, no wicks) in open molds on shelves.
  // c0..c1, r0..r1 (tiles, inclusive; stands on the floor under r1). seed varies the figures. z -15 (back).
  function paintSoldier(x, cx, base, s, k, seed) {
    const half = h01(k, seed) < 0.45;                      // only half poured: the lower body, a ragged top
    const g = x.createLinearGradient(cx - 9 * s, 0, cx + 9 * s, 0);
    g.addColorStop(0, '#e6d4b4'); g.addColorStop(1, '#a8906e');
    x.fillStyle = g;
    x.beginPath();
    x.moveTo(cx - 7 * s, base); x.lineTo(cx - 6 * s, base - 22 * s); x.lineTo(cx - 9 * s, base - 30 * s);
    if (half) { x.lineTo(cx - 5 * s, base - 34 * s); x.lineTo(cx, base - 31 * s); x.lineTo(cx + 4 * s, base - 35 * s); x.lineTo(cx + 9 * s, base - 30 * s); }
    else {
      x.lineTo(cx - 8 * s, base - 38 * s); x.lineTo(cx - 5 * s, base - 39 * s);
      x.arc(cx, base - 44 * s, 5.5 * s, Math.PI * 0.85, Math.PI * 0.15, false);
      x.lineTo(cx + 8 * s, base - 38 * s); x.lineTo(cx + 9 * s, base - 30 * s);
    }
    x.lineTo(cx + 6 * s, base - 22 * s); x.lineTo(cx + 7 * s, base); x.closePath(); x.fill();
    if (!half) { x.fillStyle = 'rgba(60,40,28,0.7)'; x.fillRect(cx - 4 * s, base - 45 * s, 8 * s, 1.6 * s); }   // a blank visor line; no eyes, no wick
    x.fillStyle = 'rgba(80,56,40,0.35)'; x.fillRect(cx - 0.6, base - 38 * s, 1.2, 36 * s);                        // mold seam
    // the open mold half behind it
    x.strokeStyle = '#2a1c15'; x.lineWidth = 3; x.beginPath(); x.moveTo(cx - 11 * s, base); x.lineTo(cx - 12 * s, base - 46 * s); x.lineTo(cx - 3 * s, base - 51 * s); x.stroke();
  }
  function paintRack(x, W, H, seed) {
    const shelves = Math.max(2, Math.round(H / 90)), sh = H / shelves;
    for (const px of [4, W - 12]) { x.fillStyle = IRON.dark; x.fillRect(px, 0, 8, H); x.fillStyle = 'rgba(242,180,130,0.18)'; x.fillRect(px, 0, 2, H); }
    for (let i = 0; i < shelves; i++) {
      const base = sh * (i + 1) - 6, n = Math.max(2, Math.floor((W - 24) / 30));
      for (let k = 0; k < n; k++) paintSoldier(x, 22 + k * ((W - 40) / Math.max(1, n - 1)), base, 0.95 + h01(k + i * 7, seed) * 0.12, k + i * 7, seed);
      x.fillStyle = IRON.dark; x.fillRect(0, base, W, 7); x.fillStyle = 'rgba(242,180,130,0.25)'; x.fillRect(0, base, W, 1.5);
      rivetRow(x, 8, W - 8, base + 3.5, 20, 1.8);
    }
    x.fillStyle = 'rgba(14,8,6,0.32)'; x.fillRect(0, 0, W, H);
  }
  G.Events.ch_soldiers = G.Events.ch_soldiers || {
    init(e) {
      e.cull = false; e.z = e.props.z != null ? e.props.z : -15;
      const p = e.props; e.data.r = { x: p.c0 * TILE, y: p.r0 * TILE, w: (p.c1 - p.c0 + 1) * TILE, h: (p.r1 - p.r0 + 1) * TILE };
    },
    draw(e, ctx) {
      const r = e.data.r, s = e.props.seed || 1;
      if (!seen(r.x, r.y, r.w, r.h)) return;
      ctx.drawImage(chSprite('ch_rack:' + r.w + 'x' + r.h + ':' + s, r.w, r.h, (x, w, h) => paintRack(x, w, h, s)), r.x, r.y);
    },
  };

  // ---------------------------------------------------------------- ch_crucible
  // The towering crucible under the brim: c0..c1 (tiles), r0 = the brim's top row (the crucible's lip), r1 = the row it
  // stands in (the lava). A riveted iron vessel behind the terrain, white-hot where its belly meets the lake; a chimney
  // of heat shimmer above the lip. z -15.
  function paintCrucible(x, W, H) {
    const g = x.createLinearGradient(0, 0, W, 0);
    g.addColorStop(0, '#3a2820'); g.addColorStop(0.25, IRON.base); g.addColorStop(0.7, '#1c120e'); g.addColorStop(1, '#120b08');
    x.fillStyle = g;
    x.beginPath(); x.moveTo(0, 0); x.lineTo(W, 0); x.lineTo(W - 10, H * 0.7); x.quadraticCurveTo(W - 30, H, W / 2, H); x.quadraticCurveTo(30, H, 10, H * 0.7); x.closePath(); x.fill();
    const gb = x.createLinearGradient(0, H * 0.5, 0, H);
    gb.addColorStop(0, 'rgba(255,110,30,0)'); gb.addColorStop(1, 'rgba(255,140,50,0.55)');
    x.fillStyle = gb; x.fill();
    for (const yy of [0.12, 0.38, 0.64]) {
      x.fillStyle = 'rgba(0,0,0,0.4)'; x.fillRect(4, H * yy, W - 8, 10);
      x.fillStyle = 'rgba(242,180,130,0.18)'; x.fillRect(4, H * yy, W - 8, 1.5);
      rivetRow(x, 14, W - 14, H * yy + 5, 18, 2.4);
    }
    for (let k = 0; k < 7; k++) {                           // glowing seams where molten wax weeps through
      const px = 20 + h01(k, 77) * (W - 40), py = H * (0.2 + h01(k, 78) * 0.6);
      x.strokeStyle = 'rgba(255,140,50,0.6)'; x.lineWidth = 2;
      x.beginPath(); x.moveTo(px, py); x.lineTo(px + 4, py + 20 + h01(k, 79) * 30); x.stroke();
    }
  }
  // The Plunge shrine stands on a dead-end brim whose cracked patch teaches the new spell at once: a Wickling who takes
  // the Molten Plunge in ch_04 with less than one cast of Ember is topped up to one cast (the blue ember's last spark),
  // so the lesson never fails silently. Hooked once, lazily (no events at load time).
  let chPlungeHooked = false;
  function hookPlungeEmber() {
    if (chPlungeHooked || !G.events || !G.events.on) return;
    chPlungeHooked = true;
    G.events.on('abilityGet', (d) => {
      const g = G.game, room = g && g.room, pr = g && g.progress;
      if (!d || d.id !== 'plunge' || !room || room.id !== 'ch_04' || !pr || !g.addEmber) return;
      const need = 33 - (pr.ember || 0);
      if (need > 0) g.addEmber(need);
    });
  }
  G.Events.ch_crucible = G.Events.ch_crucible || {
    init(e) {
      hookPlungeEmber();
      e.cull = false; e.z = e.props.z != null ? e.props.z : -15; e.data.acc = 0;
      const p = e.props; e.data.r = { x: p.c0 * TILE, y: p.r0 * TILE, w: (p.c1 - p.c0 + 1) * TILE, h: (p.r1 - p.r0 + 1) * TILE };
    },
    update(e, dt) {
      const r = e.data.r;
      if (!seen(r.x, r.y - 300, r.w, r.h + 300)) return;
      e.data.acc += dt * 5;
      while (e.data.acc > 1) {                               // heat motes rising from the lip
        e.data.acc -= 1;
        fxSpawn({ x: r.x + Math.random() * r.w, y: r.y - 4, vx: (Math.random() - 0.5) * 20, vy: -40 - Math.random() * 50, life: 1.6 + Math.random(), size: 1.4, color: '#ffc070', alpha: 0.8, add: true });
      }
    },
    draw(e, ctx, t) {
      const r = e.data.r;
      if (!seen(r.x, r.y, r.w, r.h)) return;
      ctx.drawImage(chSprite('ch_crucible:' + r.w + 'x' + r.h, r.w, r.h, paintCrucible), r.x, r.y);
      glow(ctx, r.x + r.w / 2, r.y + r.h - 20, r.w * 0.55, MOLT.a, 0.3 + 0.05 * Math.sin(t * 2));
    },
  };



  // ---------------------------------------------------------------- ch_truss
  // Riveted iron trestles holding up a gantry/walkway: posts at the listed columns (cols: [c, ...], each post centred
  // on its column) from the top of row r0 (the walkway's underside) down to the top of row r1 (the floor they stand
  // on), a header girder under the walkway and X-bracing between neighbouring posts <= 12 tiles apart. Behind terrain
  // and characters (z -15): the floor under a walkway stays readable as walkable space.
  function paintTruss(x, W, H, o) {
    const pw = 16, hd = 12;
    // header girder under the walkway
    plateFill(x, 0, 0, W, hd, 5);
    rivetRow(x, 6, W - 6, hd * 0.5, 22, 1.6);
    for (let i = 0; i < o.xs.length; i++) {
      const px = o.xs[i];
      // X-bracing to the next post
      if (i + 1 < o.xs.length && o.xs[i + 1] - px <= 12 * TILE) {
        const qx = o.xs[i + 1];
        x.strokeStyle = IRON.dark; x.lineWidth = 6;
        x.beginPath(); x.moveTo(px, hd); x.lineTo(qx, H - 6); x.moveTo(qx, hd); x.lineTo(px, H - 6); x.stroke();
        x.strokeStyle = IRON.base; x.lineWidth = 3.5;
        x.beginPath(); x.moveTo(px, hd); x.lineTo(qx, H - 6); x.moveTo(qx, hd); x.lineTo(px, H - 6); x.stroke();
        x.fillStyle = IRON.rivet; x.beginPath(); x.arc((px + qx) / 2, (hd + H - 6) / 2, 3.2, 0, TAU); x.fill();
      }
      // the post: an I-beam with flanges, rivet lines and a foot plate
      plateFill(x, px - pw / 2, hd, pw, H - hd, 9 + i);
      x.fillStyle = IRON.dark; x.fillRect(px - pw / 2, hd, 3, H - hd); x.fillRect(px + pw / 2 - 3, hd, 3, H - hd);
      x.fillStyle = 'rgba(255,190,140,0.14)'; x.fillRect(px - pw / 2 + 3, hd, 2, H - hd);
      for (let y = hd + 14; y < H - 10; y += 26) { x.fillStyle = IRON.rivet; x.fillRect(px - 1.5, y, 3, 3); }
      x.fillStyle = IRON.mid; x.fillRect(px - pw / 2 - 5, H - 7, pw + 10, 7);
      x.fillStyle = IRON.dark; x.fillRect(px - pw / 2 - 5, H - 2, pw + 10, 2);
      // knee braces into the header
      x.strokeStyle = IRON.base; x.lineWidth = 4;
      x.beginPath(); x.moveTo(px - pw / 2, hd + 26); x.lineTo(px - pw / 2 - 22, hd); x.moveTo(px + pw / 2, hd + 26); x.lineTo(px + pw / 2 + 22, hd); x.stroke();
    }
  }
  G.Events.ch_truss = G.Events.ch_truss || {
    init(e) {
      e.cull = false; e.z = e.props.z != null ? e.props.z : -15;
      const p = e.props, cols = (p.cols || []).slice().sort((a, b) => a - b);
      const x0 = (cols[0] + 0.5) * TILE - 40, x1 = (cols[cols.length - 1] + 0.5) * TILE + 40;
      e.data.r = { x: x0, y: p.r0 * TILE, w: x1 - x0, h: (p.r1 - p.r0) * TILE };
      e.data.o = { xs: cols.map((c) => (c + 0.5) * TILE - x0) };
      e.data.key = 'ch_truss:' + cols.join(',') + ':' + p.r0 + '-' + p.r1;
    },
    draw(e, ctx) {
      const r = e.data.r;
      if (!r.w || !seen(r.x, r.y, r.w, r.h)) return;
      ctx.drawImage(chSprite(e.data.key, r.w, r.h, (x, w, h) => paintTruss(x, w, h, e.data.o)), r.x, r.y);
    },
  };
  G.ChandleryEnemies = { Moldling, DripSlime, ForgeWisp, LadleBrute, LadleBlob, LadlePuddle, BPOSE, findLanding, exitZones, inZone };
})();
