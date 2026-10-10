// src/entities/enemies/rime.js — The Rime enemies (module: enemies-rime_sanctum; placement guide: docs/api/enemies-rime_sanctum.md):
//   frost_husk    — a huge, slow Snuffed sealed in a glacier shell, crystals jutting from its hump, fists like ice
//                   boulders. Lumbers along its beat; when the Wickling is in front of it, it heaves both fists over
//                   its head (0.6 s, ice creaks, eyes warm) and slams the ground: the fists hit hard right in front
//                   (2 damage) and a line of ice spikes erupts along the floor toward the Wickling (projectile
//                   'frost_spikes'; jump it). The fists stay stuck in the ice ~0.85 s (punish). hp 80.
//   ice_spitter   — a crystal growth on a floor, wall or ceiling, grown out of the crown of a Snuffed buried in the
//                   ice (its eyes still glow inside). Watches the Wickling; aims its great crystal (0.7 s: the crystal
//                   tracks, then locks, glints and fills with light) and fires two icicles along the locked line
//                   (projectile 'icicle', destroyable). hp 50.
//   rime_wraith   — a pale smoky ghost of a frozen pilgrim, a hood with no face and long frost talons. Drifts
//                   through ice and stone; dissolves, a frost shimmer gathers beside the Wickling (0.6 s, the ghost's
//                   outline forms there with its talons raised), it appears there and slashes, lingers (punish), then
//                   blinks away. hp 60.
//   shard_crawler — an armoured ice beetle crawling on floors, walls and ceilings, its back bristling with ice
//                   shards. Periodically bristles (0.55 s: the shards rise and glow) and fires 3 shards outward from
//                   its back in a fan (projectile 'rime_shard', arcs under gravity, destroyable). hp 55.
// All four respect exit zones (never step/steer into the 3.5 tiles inside a doorway; no attack starts while the
// Wickling stands in one), beats/leashes (`range` / `leash` props), ledges and hazard tiles.
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
  const ease = (k) => k * k * (3 - 2 * k);
  const wrapA = (a) => { while (a > Math.PI) a -= TAU; while (a < -Math.PI) a += TAU; return a; };
  const glow = (ctx, x, y, r, c, a) => { if (G.fx && G.fx.glowAt && a > 0.004) G.fx.glowAt(ctx, x, y, r, c, a); };
  const CH = () => (G.Art && G.Art.char) || null;
  const burst = (k, x, y, o) => { if (G.fx) G.fx.burst(k, x, y, o); };
  const shake = (px, s) => { if (G.game && typeof G.game.shake === 'function') G.game.shake(px, s); };
  const sfx = (name, x, o) => { if (typeof G.sfxAt === 'function') G.sfxAt(name, x, o); };
  const pCenter = (p) => ({ x: p.x + p.w / 2, y: p.y + p.h / 2 });

  // ------------------------------------------------------------------ sfx (defined only if the audio module lacks them)
  (function defineSfx() {
    const A = G.Audio;
    if (!A || typeof A.defineSfx !== 'function') return;
    const have = typeof A.sfxNames === 'function' ? A.sfxNames() : [];
    const def = (name, o) => { if (have.indexOf(name) < 0) A.defineSfx(name, o); };
    def('husk_groan', {       // the husk heaving its fists up: a frozen throat groaning + ice creaking and cracking
      vol: 3, reverb: 0.4,
      play(k) {
        const v = k.r(0.93, 1.05);
        k.tone({ f: 74 * v, f1: 58 * v, glide: 0.5, type: 'sawtooth', lp: 360, a: 0.09, hold: 0.22, d: 0.35, g: 0.12, vib: { rate: 5, depth: 35 } });
        k.noise({ color: 'brown', lp: 480 * v, a: 0.06, hold: 0.2, d: 0.3, g: 0.08 });
        k.noise({ bp: 2400 * v, bp1: 4300 * v, Q: 4, a: 0.03, hold: 0.28, d: 0.15, g: 0.045, sweep: 0.45, at: 0.08 });
        for (let i = 0; i < 4; i++) k.tone({ f: (2100 + i * 410) * v, type: 'triangle', a: 0.001, d: 0.04, g: 0.022, at: 0.12 + i * 0.1 });
      },
    });
    def('husk_slam', {        // ice fists on the ground: a deep thud + a crunch of breaking ice
      vol: 3.6, reverb: 0.35,
      play(k) {
        const v = k.r(0.94, 1.04);
        k.noise({ color: 'brown', lp: 420 * v, a: 0.002, d: 0.45, g: 0.5 });
        k.tone({ f: 88 * v, f1: 38 * v, glide: 0.25, type: 'sine', a: 0.002, d: 0.5, g: 0.34 });
        k.noise({ hp: 2800 * v, a: 0.001, d: 0.16, g: 0.12 });
        for (let i = 0; i < 5; i++) k.tone({ f: (2500 + i * 530) * v * k.r(0.9, 1.1), type: 'triangle', a: 0.001, d: 0.07, g: 0.024, at: 0.02 + i * 0.035 });
      },
    });
    def('ice_spikes', {       // a line of ice spikes bursting out of the floor: a rapid crystalline crackle
      vol: 2.6, reverb: 0.25,
      play(k) {
        const v = k.r(0.95, 1.05);
        k.noise({ hp: 1800 * v, a: 0.004, hold: 0.25, d: 0.25, g: 0.06 });
        for (let i = 0; i < 9; i++) {
          const f = (1500 + (i % 3) * 700) * v * k.r(0.85, 1.15);
          k.tone({ f, f1: f * 0.7, glide: 0.05, type: 'triangle', a: 0.001, d: 0.06, g: 0.03, at: i * 0.055 });
          k.noise({ color: 'pink', bp: 3000 * v, Q: 2, a: 0.001, d: 0.04, g: 0.05, at: i * 0.055 });
        }
      },
    });
    def('spitter_charge', {   // the crystal filling with light: a glassy rising shimmer
      vol: 2.4, reverb: 0.4,
      play(k) {
        const v = k.r(0.96, 1.04);
        k.tone({ f: 1320 * v, f1: 2640 * v, glide: 0.55, wave: 'glass', a: 0.1, hold: 0.35, d: 0.2, g: 0.035, vib: { rate: 11, depth: 25 } });
        k.tone({ f: 1980 * v, f1: 3520 * v, glide: 0.55, type: 'sine', a: 0.15, hold: 0.3, d: 0.15, g: 0.02 });
        k.noise({ bp: 5000 * v, Q: 3, a: 0.2, hold: 0.25, d: 0.1, g: 0.02 });
      },
    });
    def('icicle_shot', {      // an icicle loosed: a crisp crack + glassy whistle
      vol: 2.8, reverb: 0.2,
      play(k) {
        const v = k.r(0.93, 1.07);
        k.noise({ hp: 3200 * v, a: 0.001, d: 0.06, g: 0.16 });
        k.tone({ f: 2400 * v, f1: 1500 * v, glide: 0.16, type: 'sine', a: 0.003, d: 0.18, g: 0.05 });
        k.noise({ bp: 1400 * v, bp1: 2600 * v, Q: 1.4, a: 0.01, d: 0.16, g: 0.07, sweep: 0.15 });
      },
    });
    def('ice_shatter', {      // a small icicle breaking: bright tinkles
      vol: 2.2, reverb: 0.25,
      play(k) {
        const v = k.r(0.88, 1.12);
        k.noise({ hp: 3600 * v, a: 0.001, d: 0.08, g: 0.1 });
        for (let i = 0; i < 4; i++) k.tone({ f: (2800 + i * 650) * v * k.r(0.9, 1.1), type: 'triangle', a: 0.001, d: 0.09, g: 0.022, at: i * 0.025 });
      },
    });
    def('wraith_shimmer', {   // frost gathering beside the Wickling: a cold whisper rising into a glassy shimmer
      vol: 2.6, reverb: 0.55,
      play(k) {
        const v = k.r(0.95, 1.05);
        k.noise({ color: 'pink', bp: 900 * v, bp1: 3800 * v, Q: 1.6, a: 0.2, hold: 0.25, d: 0.2, g: 0.08, sweep: 0.55 });
        k.tone({ f: 660 * v, f1: 1320 * v, glide: 0.55, wave: 'glass', a: 0.15, hold: 0.25, d: 0.25, g: 0.03, vib: { rate: 7, depth: 40 } });
        k.tone({ f: 990 * v, f1: 1760 * v, glide: 0.55, type: 'sine', a: 0.2, hold: 0.2, d: 0.2, g: 0.018 });
      },
    });
    def('wraith_slash', {     // frost talons through the air: a sharp icy swish
      vol: 3, reverb: 0.25,
      play(k) {
        const v = k.r(0.94, 1.06);
        k.noise({ bp: 1800 * v, bp1: 4600 * v, Q: 1.5, a: 0.008, d: 0.16, g: 0.17, sweep: 0.12 });
        k.tone({ f: 1900 * v, f1: 900 * v, glide: 0.12, type: 'sine', a: 0.004, d: 0.12, g: 0.03 });
      },
    });
    def('wraith_blink', {     // the ghost unravelling into frost smoke: a soft falling breath
      vol: 2.2, reverb: 0.5,
      play(k) {
        const v = k.r(0.92, 1.08);
        k.noise({ color: 'pink', bp: 2600 * v, bp1: 700 * v, Q: 1.2, a: 0.02, d: 0.35, g: 0.07, sweep: 0.3 });
        k.tone({ f: 1500 * v, f1: 700 * v, glide: 0.3, wave: 'glass', a: 0.01, d: 0.3, g: 0.016 });
      },
    });
    def('crawler_bristle', {  // the shards rising on the crawler's back: a dry crystalline rattle
      vol: 2.4, reverb: 0.2,
      play(k) {
        const v = k.r(0.94, 1.06);
        for (let i = 0; i < 7; i++) k.tone({ f: (1700 + (i % 4) * 380) * v * k.r(0.92, 1.08), type: 'triangle', a: 0.001, d: 0.05, g: 0.02, at: i * 0.06 });
        k.noise({ bp: 2600 * v, Q: 3, a: 0.05, hold: 0.3, d: 0.1, g: 0.03 });
      },
    });
    def('shard_volley', {     // three shards fired: a crack + a spray of whistles
      vol: 2.8, reverb: 0.25,
      play(k) {
        const v = k.r(0.94, 1.06);
        k.noise({ hp: 2600 * v, a: 0.001, d: 0.08, g: 0.16 });
        k.noise({ color: 'brown', lp: 600, a: 0.001, d: 0.08, g: 0.1 });
        for (let i = 0; i < 3; i++) k.tone({ f: (1900 + i * 420) * v, f1: (1200 + i * 300) * v, glide: 0.14, type: 'sine', a: 0.003, d: 0.14, g: 0.025, at: i * 0.02 });
      },
    });
  })();

  // Region creature colours: pale cyan glacier ice with white facets over grey-blue Snuffed wax, steel-blue shells, pale
  // smoky ghosts; deep ink outlines so they read against the bright aurora backgrounds; warm white for telegraphs.
  const RI = {
    outline: '#0a1018',
    ice: '#a6d6ea', iceHi: '#effaff', iceMid: '#74abc6', iceDeep: '#3e6a86', iceDark: '#1f3547',
    frost: '#dcf2fc', snow: '#e6f3fa',
    wax: '#7c889a', waxShade: '#4c5768', waxHi: '#b2becd',
    shell: '#2b4054', shellHi: '#62849e', shellDark: '#15212c',
    ghost: '#d4e9f3', ghostMid: '#9cbfd2', ghostDark: '#4b687d', ghostVoid: '#0b151e',
    eye: '#f2fbff', cyan: '#9ae0ff', tele: '#ffe6b0', teleHot: '#fff6dc',
  };

  // ------------------------------------------------------------------ shared: exit zones, beats, hazards
  const zoneCache = new WeakMap();
  /** Exit zones of a room: each opening's run (±1 tile) and 3.5 tiles inward (wide N openings = open sky are skipped;
   *  S openings = pits are kept, so nothing wanders over a chasm). */
  function exitZones(room) {
    if (!room) return [];
    let out = zoneCache.get(room);
    if (out) return out;
    out = [];
    const W = room.widthPx, H = room.heightPx, D = 3.5 * TILE;
    for (const o of room.openings || []) {
      if (o.side === 'N' && o.size > 8) continue;
      const a = (o.pos - 1) * TILE, b = (o.pos + o.size + 1) * TILE;
      if (o.side === 'W') out.push({ side: 'W', x0: -1, y0: a, x1: D, y1: b });
      else if (o.side === 'E') out.push({ side: 'E', x0: W - D, y0: a, x1: W + 1, y1: b });
      else if (o.side === 'N') out.push({ side: 'N', x0: a, y0: -1, x1: b, y1: D });
      else out.push({ side: 'S', x0: a, y0: H - D, x1: b, y1: H + 1 });
    }
    zoneCache.set(room, out);
    return out;
  }
  function inZone(room, x, y) {
    for (const z of exitZones(room)) if (x > z.x0 && x < z.x1 && y > z.y0 && y < z.y1) return z;
    return null;
  }
  function playerInZone(e) {
    const p = e.player;
    return !!p && !!inZone(e.room, p.x + p.w / 2, p.y + p.h / 2);
  }
  function propTiles(e, name, def) { const v = +e.props[name]; return (v > 0 ? v : def) * TILE; }
  function hazardAt(room, x, y) { return !!room && G.Physics.isHazardTile(room.tileAt(Math.floor(x / TILE), Math.floor(y / TILE))); }
  /** Ground walkers: may it take a step in dir (inside its beat, not into an exit zone, no wall/ledge/hazard)? */
  function canStep(e, dir, beat) {
    const ax = e.cx + dir * (e.w / 2 + 14);
    if (inZone(e.room, ax, e.y + e.h - 20)) return false;
    if (e.home && Math.abs(ax - e.home.x) > beat + e.w / 2) return false;
    return !e.blockedAhead(dir);
  }
  /** Rect (centre x,y, size w,h) free of solid terrain and inside the room with a margin. */
  function spotFree(room, x, y, w, h) {
    if (!room) return false;
    if (x - w / 2 < TILE * 0.6 || x + w / 2 > room.widthPx - TILE * 0.6 || y - h / 2 < TILE * 0.4 || y + h / 2 > room.heightPx - TILE * 0.4) return false;
    return !G.Physics.rectSolid(room, x - w / 2, y - h / 2, w, h);
  }

  // ------------------------------------------------------------------ drawing kit
  function pathOf(pts) {
    const p = new Path2D();
    p.moveTo(pts[0], pts[1]);
    for (let i = 2; i < pts.length; i += 2) p.lineTo(pts[i], pts[i + 1]);
    p.closePath();
    return p;
  }
  function fillOut(ctx, path, fill, lw) {
    ctx.lineJoin = 'round';
    ctx.strokeStyle = RI.outline; ctx.lineWidth = (lw == null ? 2 : lw) * 2;
    ctx.stroke(path);
    ctx.fillStyle = fill; ctx.fill(path);
  }
  /**
   * An ice crystal growing from (x, y) toward angle `ang` (0 = up, + = clockwise), length len, width wid.
   * o: {fill, lit, dark, lw, glow (0..1 inner light), glowColor, outline (false = none)}
   */
  function prism(ctx, x, y, ang, len, wid, o) {
    o = o || {};
    if (len < 1) return;
    const hw = wid / 2, sh = len * 0.7;
    ctx.save();
    ctx.translate(x, y); ctx.rotate(ang);
    ctx.beginPath();
    ctx.moveTo(-hw, 2); ctx.lineTo(-hw, -sh); ctx.lineTo(0, -len); ctx.lineTo(hw, -sh); ctx.lineTo(hw, 2); ctx.closePath();
    ctx.lineJoin = 'round';
    if (o.outline !== false) { ctx.strokeStyle = RI.outline; ctx.lineWidth = (o.lw || 1.6) * 2; ctx.stroke(); }
    ctx.fillStyle = o.fill || RI.ice; ctx.fill();
    // lit facet (left) and shaded facet (right)
    ctx.fillStyle = o.lit || RI.iceHi; ctx.globalAlpha *= 0.55;
    ctx.beginPath(); ctx.moveTo(-hw, 2); ctx.lineTo(-hw, -sh); ctx.lineTo(0, -len); ctx.lineTo(-hw * 0.15, 2); ctx.closePath(); ctx.fill();
    ctx.globalAlpha /= 0.55;
    ctx.fillStyle = o.dark || RI.iceMid; ctx.globalAlpha *= 0.5;
    ctx.beginPath(); ctx.moveTo(hw * 0.35, 2); ctx.lineTo(hw * 0.35, -sh * 0.95); ctx.lineTo(0, -len); ctx.lineTo(hw, -sh); ctx.lineTo(hw, 2); ctx.closePath(); ctx.fill();
    ctx.globalAlpha /= 0.5;
    ctx.strokeStyle = 'rgba(255,255,255,0.75)'; ctx.lineWidth = 1;
    ctx.beginPath(); ctx.moveTo(-hw * 0.55, -sh * 0.25); ctx.lineTo(-hw * 0.55, -sh * 0.95); ctx.lineTo(-hw * 0.1, -len * 0.9); ctx.stroke();
    ctx.restore();
    if (o.glow > 0) {
      const ca = Math.sin(ang), cb = -Math.cos(ang);
      glow(ctx, x + ca * len * 0.55, y + cb * len * 0.55, len * 0.9, o.glowColor || RI.cyan, 0.45 * o.glow);
    }
  }
  /** Frozen-smoke curl (a Snuffed's pall frozen in place) from (x, y), rising. */
  function frozenCurl(ctx, x, y, s, flip) {
    ctx.save();
    ctx.translate(x, y); ctx.scale(flip || 1, 1);
    ctx.lineCap = 'round';
    ctx.strokeStyle = RI.outline; ctx.lineWidth = 4.5 * s;
    const curl = () => { ctx.beginPath(); ctx.moveTo(0, 0); ctx.bezierCurveTo(-5 * s, -6 * s, 5 * s, -10 * s, 1 * s, -15 * s); ctx.bezierCurveTo(-3 * s, -19 * s, 3 * s, -23 * s, 6 * s, -21 * s); ctx.stroke(); };
    curl();
    ctx.strokeStyle = RI.frost; ctx.lineWidth = 2.2 * s; curl();
    ctx.restore();
  }

  // =====================================================================================================
  // Projectiles
  // =====================================================================================================
  const WaveBase = (G.Projectile && G.Projectile.Wave) || G.Projectile;
  const PLATFORM = G.T ? G.T.PLATFORM : -1;
  const SPIKE_RISE = 0.07, SPIKE_HOLD = 0.2, SPIKE_FALL = 0.3, SPIKE_LIFE = SPIKE_RISE + SPIKE_HOLD + SPIKE_FALL, SPIKE_GAP = 17;

  /** A line of ice spikes erupting along the floor (frost_husk). props: x (start centre), y (floor), dir, speed, reach px. */
  class FrostSpikes extends WaveBase {
    constructor(props) {
      const p = Object.assign({ w: 30, h: 40, speed: 340 }, props || {});
      super(p);
      this.reach = p.reach || 8 * TILE;
      this.travel = 0; this.stopped = false;
      this.spikes = []; this.nextSpike = 0;
      this.x0 = this.cx;
      this.life = 8;
      this.color = RI.cyan;
    }
    hitBox() { return { x: this.x + 3, y: this.y + this.h - 32, w: this.w - 6, h: 32 }; }
    stop(why) {
      if (this.stopped) return;
      this.stopped = true;
      const fx = this.cx + this.dir * this.w * 0.3, fy = this.y + this.h;
      if (why !== 'reach') burst('shard', fx, fy - 10, { count: 5, color: RI.ice, speed: 200, angle: -Math.PI / 2 - this.dir * 0.8, spread: 1.2 });
    }
    update(dt) {
      this.age += dt;
      const room = this.room;
      if (!room) return;
      if (!this.stopped) {
        const step = this.vx * dt;
        const nx = this.x + step;
        const front = this.dir > 0 ? nx + this.w : nx;
        const blocked = G.Physics.rectSolid(room, nx, this.y, this.w, this.h - 2);
        const footC = Math.floor(front / TILE), footR = Math.floor((this.y + this.h + 2) / TILE);
        const tile = room.tileAt(footC, footR);
        const floor = G.Physics.isSolidTile(tile) || tile === PLATFORM;
        if (blocked || !floor) this.stop('terrain');
        else if (inZone(room, front, this.y + this.h - 12)) this.stop('zone');
        else if (this.travel >= this.reach) this.stop('reach');
        else { this.x = nx; this.travel += Math.abs(step); }
      }
      if (!this.stopped) {
        while (this.travel >= this.nextSpike) {
          const i = this.spikes.length;
          this.spikes.push({ x: this.x0 + this.dir * this.nextSpike, t: this.age, s: 0.72 + h01(i, this.seed) * 0.5, lean: (h01(i + 7, this.seed) - 0.5) * 0.5, n: 2 + (h01(i + 3, this.seed) > 0.55 ? 1 : 0) });
          this.nextSpike += SPIKE_GAP;
          if (i % 3 === 0) burst('snow', this.x0 + this.dir * (this.nextSpike - SPIKE_GAP), this.y + this.h - 4, { count: 2, color: RI.snow, speed: 90, angle: -Math.PI / 2, spread: 1.4 });
        }
        if (this.team === 'enemy') this.touchPlayer();
        if (this.light && G.lighting) G.lighting.add({ x: this.cx, y: this.y + this.h * 0.6, r: 90, color: RI.cyan, intensity: 0.45 });
      }
      const last = this.spikes.length ? this.spikes[this.spikes.length - 1].t : this.age - SPIKE_LIFE;
      if ((this.stopped && this.age - last > SPIKE_LIFE + 0.02) || this.age > this.life) this.remove();
    }
    draw(ctx, t) {
      const fy = this.y + this.h;
      for (const s of this.spikes) {
        const a = this.age - s.t;
        if (a < 0 || a > SPIKE_LIFE) continue;
        let k;
        if (a < SPIKE_RISE) k = ease(a / SPIKE_RISE);
        else if (a < SPIKE_RISE + SPIKE_HOLD) k = 1;
        else k = 1 - (a - SPIKE_RISE - SPIKE_HOLD) / SPIKE_FALL;
        const H = 38 * s.s * (a < SPIKE_RISE ? k : 1) * (a > SPIKE_RISE + SPIKE_HOLD ? 0.35 + 0.65 * k : 1);
        const pa = ctx.globalAlpha;
        ctx.globalAlpha = pa * (a > SPIKE_RISE + SPIKE_HOLD ? clamp(k * 1.4, 0, 1) : 1);
        if (a < SPIKE_RISE + 0.12) glow(ctx, s.x, fy - H * 0.4, 30, RI.cyan, 0.35 * (1 - a / (SPIKE_RISE + 0.12)));
        prism(ctx, s.x - this.dir * 4, fy + 3, s.lean - this.dir * 0.35, H * 0.62, 9, { lw: 1.3 });
        prism(ctx, s.x + this.dir * 5, fy + 3, s.lean + this.dir * 0.3, H * 0.5, 8, { lw: 1.3 });
        prism(ctx, s.x, fy + 3, s.lean * 0.6, H, 11, { lw: 1.5 });
        ctx.globalAlpha = pa;
      }
      // snow spray at the moving front
      if (!this.stopped) {
        const fx = this.cx + this.dir * this.w * 0.35;
        glow(ctx, fx, fy - 14, 34, RI.frost, 0.3);
      }
      void t;
    }
    burstFx(why) {
      if (why === 'clear') burst('shard', this.cx, this.y + this.h - 12, { count: 6, color: RI.ice, speed: 220 });
    }
  }

  /** Icicle (ice_spitter): a long glassy spike flying point-first. */
  class Icicle extends G.Projectile {
    draw(ctx, t) {
      const a = Math.atan2(this.vy, this.vx);
      const tr = this.trail;
      for (let i = 0; i < tr.length; i += 2) glow(ctx, tr[i], tr[i + 1], 9, RI.cyan, 0.05 + 0.12 * i / tr.length);
      glow(ctx, this.cx, this.cy, 26, RI.cyan, 0.38);
      ctx.save();
      ctx.translate(this.cx, this.cy); ctx.rotate(a);
      ctx.beginPath(); ctx.moveTo(15, 0); ctx.lineTo(-3, -4.2); ctx.lineTo(-15, -1.5); ctx.lineTo(-17, 0); ctx.lineTo(-15, 1.5); ctx.lineTo(-3, 4.2); ctx.closePath();
      ctx.lineJoin = 'round'; ctx.strokeStyle = RI.outline; ctx.lineWidth = 3; ctx.stroke();
      ctx.fillStyle = RI.ice; ctx.fill();
      ctx.fillStyle = RI.iceHi;
      ctx.beginPath(); ctx.moveTo(14, 0); ctx.lineTo(-3, -3.6); ctx.lineTo(-13, -0.6); ctx.lineTo(-3, -0.4); ctx.closePath(); ctx.fill();
      ctx.fillStyle = RI.iceMid;
      ctx.beginPath(); ctx.moveTo(12, 0.6); ctx.lineTo(-3, 3.6); ctx.lineTo(-12, 1); ctx.closePath(); ctx.fill();
      ctx.restore();
      void t;
    }
    burstFx(why) {
      if (why === 'expire') { burst('snow', this.cx, this.cy, { count: 3, color: RI.snow, speed: 60 }); return; }
      const a = Math.atan2(-this.vy, -this.vx);
      burst('shard', this.cx, this.cy, { count: 6, color: RI.ice, speed: 240, angle: a, spread: 2.2 });
      burst('flash', this.cx, this.cy, { r: 22, color: RI.frost, life: 0.1 });
      if (why !== 'clear') sfx('ice_shatter', this.cx, { vol: 0.5 });
    }
  }

  /** Rime shard (shard_crawler): a short faceted shard tumbling under light gravity. */
  class RimeShard extends G.Projectile {
    draw(ctx, t) {
      const a = Math.atan2(this.vy, this.vx);
      const tr = this.trail;
      for (let i = 0; i < tr.length; i += 4) glow(ctx, tr[i], tr[i + 1], 8, RI.cyan, 0.04 + 0.1 * i / tr.length);
      glow(ctx, this.cx, this.cy, 22, RI.cyan, 0.32);
      ctx.save();
      ctx.translate(this.cx, this.cy); ctx.rotate(a);
      ctx.beginPath(); ctx.moveTo(11, 0); ctx.lineTo(2, -4.5); ctx.lineTo(-9, -3); ctx.lineTo(-7, 0); ctx.lineTo(-9, 3); ctx.lineTo(2, 4.5); ctx.closePath();
      ctx.lineJoin = 'round'; ctx.strokeStyle = RI.outline; ctx.lineWidth = 3; ctx.stroke();
      ctx.fillStyle = RI.ice; ctx.fill();
      ctx.fillStyle = RI.iceHi;
      ctx.beginPath(); ctx.moveTo(10, 0); ctx.lineTo(2, -4); ctx.lineTo(-6, -2.2); ctx.lineTo(1, -0.4); ctx.closePath(); ctx.fill();
      ctx.restore();
      void t;
    }
    burstFx(why) {
      if (why === 'expire') { burst('snow', this.cx, this.cy, { count: 3, color: RI.snow, speed: 60 }); return; }
      burst('shard', this.cx, this.cy, { count: 5, color: RI.ice, speed: 200 });
      burst('flash', this.cx, this.cy, { r: 18, color: RI.frost, life: 0.1 });
      if (why !== 'clear') sfx('ice_shatter', this.cx, { vol: 0.4, pitch: 1.15 });
    }
  }

  if (G.registerProjectile) {
    G.registerProjectile('frost_spikes', FrostSpikes, { r: 14, gravity: 0, life: 8, color: RI.cyan, damage: 1 });
    G.registerProjectile('icicle', Icicle, { r: 7, gravity: 0, life: 3, color: RI.cyan, damage: 1 });
    G.registerProjectile('rime_shard', RimeShard, { r: 6, gravity: 520, life: 3, color: RI.cyan, damage: 1 });
  }

  // =====================================================================================================
  // frost_husk
  // =====================================================================================================
  // local feet space (+x forward, -y up); the art is shifted HUSK_OX so the hurtbox sits over the bulk of the body
  const HUSK_OX = -4;
  const HUSK_SHOULDER = { x: 15, y: -64 }, HUSK_SHOULDER_FAR = { x: 1, y: -68 };
  /** Fist centre for arm pose a (-1 slammed … 0 hanging … 1 raised) from shoulder (sx, sy), local feet space (+x forward). */
  function huskFist(a, sx, sy) {
    let ang, len;
    if (a >= 0) { const k = ease(a); ang = lerp(1.3, -1.8, k); len = lerp(52, 58, k); }
    else { const k = -a; ang = lerp(1.3, 0.83, k); len = lerp(52, 59, k); }
    return { x: sx + Math.cos(ang) * len, y: sy + Math.sin(ang) * len, ang };
  }

  class FrostHusk extends G.Enemy {
    constructor(props) {
      super(props, {
        hp: 80, w: 54, h: 86, cinders: [14, 20], weight: 3, knockback: 300, sight: 9 * TILE,
        colors: { body: RI.wax, dark: RI.iceDark, hit: '#e6f7ff', smoke: '#b9d6e6', puddle: '#58778c', tele: RI.tele },
        light: { r: 80, color: RI.cyan, intensity: 0.2, dy: -16 },
        meltTime: 0.8, puddleW: 36,
      });
      this.speed = +this.props.speed > 0 ? +this.props.speed : 26;
      this.arm = 0; this.walkPh = Math.random() * TAU; this.breathT = rnd(1, 3); this.hurtT = 0;
    }
    init() { super.init(); this.setState('patrol'); this.cooldown('slam', rnd(0.5, 1.1)); }
    reachPx() { return propTiles(this, 'reach', 9); }
    eye() { return { x: this.cx + this.facing * 20, y: this.y + this.h * 0.32 }; }
    /** Shoulder (near arm) in local feet space after the posture transform. */
    shoulder(far) {
      const up = Math.max(0, this.arm), dn = Math.max(0, -this.arm);
      const sq = 1 + up * 0.05 - dn * 0.1, lean = -up * 4 + dn * 7;
      const S = far ? HUSK_SHOULDER_FAR : HUSK_SHOULDER;
      return { x: S.x - (lean / 86) * S.y, y: S.y * sq };
    }
    fistWorld(a) {
      const S = this.shoulder(false), F = huskFist(a == null ? this.arm : a, S.x, S.y);
      return { x: this.cx + this.facing * (F.x + HUSK_OX), y: this.y + this.h + F.y };
    }
    /** Slam hitbox: from the front of the body to the far edge of the fists (≈ 1.9 tiles from the centre), 1.15 tiles tall. */
    fistRect() { const w = 66, h = 46; return { x: this.facing > 0 ? this.cx + 10 : this.cx - 10 - w, y: this.y + this.h - h, w, h }; }
    sees(p) {
      if (!this.targetable(p)) return false;
      const dy = (p.y + p.h) - (this.y + this.h);
      if (dy < -2.6 * TILE || dy > 1.2 * TILE) return false;
      if (Math.abs(this.dx(p)) > this.reachPx()) return false;
      return this.canSee(p, this.reachPx() + TILE);
    }
    think(dt) {
      const p = this.player, beat = propTiles(this, 'range', 3);
      if (this.hurtT > 0) this.hurtT -= dt;
      switch (this.state) {
        case 'patrol': {
          const d = this.stateData;
          let engaged = false;
          if (this.grounded && this.sees(p)) {
            const dx = this.dx(p);
            if (dx * this.facing > 0 || Math.abs(dx) < 6) {
              engaged = true;
              if (this.ready('slam') && !playerInZone(this)) { this.vx = 0; this.setState('raise'); break; }
              this.vx = (Math.abs(dx) > 2.4 * TILE && canStep(this, this.facing, beat)) ? this.facing * this.speed : 0;
            } else if (Math.abs(dx) < 7 * TILE) { this.vx = 0; this.setState('turn'); break; }
          }
          if (!engaged) {
            if (d.pause > 0) { d.pause -= dt; this.vx = 0; if (d.pause <= 0) this.facing = -this.facing; }
            else if (canStep(this, this.facing, beat)) this.vx = this.facing * this.speed;
            else { this.vx = 0; d.pause = rnd(0.8, 1.4); }
          }
          break;
        }
        case 'turn':                                        // a slow, heavy turn (0.45 s) — the window to strike its back
          this.vx = 0;
          if (this.stateTime >= 0.45) { this.facing = -this.facing; this.setState('patrol'); }
          break;
        case 'raise':                                       // TELEGRAPH: both fists heaved overhead, ice creaks, eyes warm
          this.vx = 0;
          if (this.once('tele')) { const f = this.fistWorld(1); this.stateData.w = this.telegraph(0.6, { x: f.x, y: f.y, shake: 1.2, sound: 'husk_groan', vol: 0.9 }); }
          if (this.stateTime >= this.stateData.w) this.setState('slam');
          break;
        case 'slam':                                        // fists come down: 2 damage right in front + spike line
          this.vx = 0;
          if (this.stateTime >= 0.06 && this.once('impact')) this.impact();
          if (this.stateTime >= 0.06 && this.stateTime < 0.16) this.strike(this.fistRect(), { damage: 2, dir: { x: this.facing, y: -0.4 } });
          if (this.stateTime >= 0.2) this.setState('stuck');
          break;
        case 'stuck':                                       // recovery: fists frozen into the floor (punish)
          this.vx = 0;
          if (this.stateTime >= 0.85) this.setState('pull');
          break;
        case 'pull':
          this.vx = 0;
          if (this.stateTime >= 0.4) { this.cooldown('slam', rnd(1.3, 1.9)); this.setState('patrol'); }
          break;
        default: this.setState('patrol');
      }
      // posture
      const tgt = this.is('raise') ? 1 : (this.is('slam') || this.is('stuck')) ? -1 : 0;
      const rate = this.is('slam') ? 30 : this.is('raise') ? 1 / Math.max(0.2, (this.stateData.w || 0.6) * 0.7) : this.is('pull') ? 2.6 : 3;
      this.arm = toward(this.arm, tgt, dt * rate);
      if (Math.abs(this.vx) > 1) this.walkPh += dt * this.speed * 0.12;
      // frosty breath
      this.breathT -= dt;
      if (this.breathT <= 0) {
        this.breathT = rnd(2.2, 3.6);
        const e = this.eye();
        if (!G.camera || !G.camera.visible || G.camera.visible(this.x - 40, this.y - 40, this.w + 80, this.h + 80, 0)) {
          burst('smoke', e.x + this.facing * 8, e.y + 8, { count: 2, color: RI.frost, alpha: 0.22, size: 6, speed: 30, angle: this.facing > 0 ? -0.3 : Math.PI + 0.3, spread: 0.6 });
        }
      }
    }
    impact() {
      const f = this.facing, fy = this.y + this.h;
      const ix = this.cx + f * 58;
      shake(5, 0.28);
      sfx('husk_slam', this.cx, { vol: 1 });
      burst('dust', ix, fy, { count: 12, color: RI.snow, speed: 240, angle: -Math.PI / 2, spread: 2.6 });
      burst('shard', ix, fy - 8, { count: 9, color: RI.ice, speed: 280, angle: -Math.PI / 2, spread: 1.9 });
      burst('ring', ix, fy - 4, { r: 46, color: RI.frost, width: 4, life: 0.25 });
      if (this.room) {
        G.spawnProjectile(this.room, 'frost_spikes', { x: this.cx + f * 78, y: fy, dir: f, owner: this, reach: Math.max(TILE, this.reachPx() - 78), speed: 340 });
        sfx('ice_spikes', this.cx + f * 120, { vol: 0.9 });
      }
    }
    onHurt(hit) {
      this.hurtT = 0.2;
      burst('shard', this.cx, this.cy - 10, { count: 4, color: RI.ice, speed: 220 });
      if (this.is('patrol') && hit && hit.source && this.dirTo(hit.source) !== this.facing) this.setState('turn');
    }
    onDeath() {
      burst('shard', this.cx, this.cy - 10, { count: 18, color: RI.ice, speed: 320, spread: TAU });
      burst('snow', this.cx, this.cy, { count: 12, color: RI.snow, speed: 140 });
      sfx('ice_shatter', this.cx, { vol: 0.9, pitch: 0.8 });
    }
    drawBounds() { return { x: this.x - 84, y: this.y - 68, w: this.w + 168, h: this.h + 82 }; }
    drawBody(ctx, t) { drawHusk(ctx, this, t, false); }
    drawCorpse(ctx, t) { drawHusk(ctx, this, t, true); }
  }

  /** A tapered limb segment polygon from (x0,y0) (half-width w0) to (x1,y1) (half-width w1). */
  function limb(x0, y0, x1, y1, w0, w1) {
    const dx = x1 - x0, dy = y1 - y0, l = Math.hypot(dx, dy) || 1, px = -dy / l, py = dx / l;
    return pathOf([x0 + px * w0, y0 + py * w0, x1 + px * w1, y1 + py * w1, x1 - px * w1, y1 - py * w1, x0 - px * w0, y0 - py * w0]);
  }
  function drawHuskArm(ctx, S, F, far, dead) {
    const dx = F.x - S.x, dy = F.y - S.y, L = Math.hypot(dx, dy) || 1;
    // the elbow bends back when the arm hangs, forward when the fists are overhead
    const Ex = (S.x + F.x) / 2 - (dy / L) * 8, Ey = (S.y + F.y) / 2 + (dx / L) * 8;
    const wax = far ? RI.waxShade : RI.wax;
    // upper arm: a heavy tapered wax limb
    fillOut(ctx, limb(S.x, S.y, Ex, Ey, 11, 8), wax, 2);
    ctx.fillStyle = wax; ctx.beginPath(); ctx.arc(S.x, S.y, 10, 0, TAU); ctx.fill();          // round the shoulder into the body
    ctx.fillStyle = far ? RI.wax : RI.waxHi; ctx.globalAlpha *= 0.35;
    ctx.fill(limb(S.x - 2, S.y - 3, Ex - 2, Ey - 2, 4, 2.5));
    ctx.globalAlpha /= 0.35;
    // forearm sheathed in faceted ice, widening toward the fist
    const ice = far ? RI.iceMid : RI.ice;
    fillOut(ctx, limb(Ex, Ey, F.x, F.y, 9, 12), ice, 2);
    const ux = F.x - Ex, uy = F.y - Ey, ul = Math.hypot(ux, uy) || 1, px = -uy / ul, py = ux / ul;
    ctx.fillStyle = far ? RI.iceDeep : RI.iceMid; ctx.globalAlpha *= 0.7;           // shaded facet
    ctx.fill(pathOf([Ex + px * 9, Ey + py * 9, F.x + px * 12, F.y + py * 12, F.x + px * 3, F.y + py * 3, Ex + px * 2, Ey + py * 2]));
    ctx.globalAlpha /= 0.7;
    if (!far) {
      ctx.strokeStyle = RI.iceHi; ctx.lineWidth = 2; ctx.globalAlpha *= 0.8;
      ctx.beginPath(); ctx.moveTo(Ex - px * 6, Ey - py * 6); ctx.lineTo(lerp(Ex, F.x, 0.75) - px * 8, lerp(Ey, F.y, 0.75) - py * 8); ctx.stroke();
      ctx.globalAlpha /= 0.8;
    }
    // the fist: a faceted ice boulder around a wax hand, knuckle shards pointing along the arm
    const a = Math.atan2(uy, ux);
    ctx.save();
    ctx.translate(F.x, F.y); ctx.rotate(a);
    fillOut(ctx, pathOf([-13, -13, 2, -16, 14, -12, 18, 0, 14, 12, 1, 16, -13, 12, -17, 0]), ice, 2);
    ctx.fillStyle = far ? RI.iceDeep : RI.iceMid; ctx.globalAlpha *= 0.75;
    ctx.beginPath(); ctx.moveTo(-13, 12); ctx.lineTo(1, 16); ctx.lineTo(14, 12); ctx.lineTo(5, 4); ctx.lineTo(-8, 5); ctx.closePath(); ctx.fill();
    ctx.globalAlpha /= 0.75;
    if (!far) {
      ctx.fillStyle = RI.iceHi; ctx.globalAlpha *= 0.85;
      ctx.beginPath(); ctx.moveTo(-11, -11); ctx.lineTo(2, -14); ctx.lineTo(11, -10); ctx.lineTo(-2, -6); ctx.closePath(); ctx.fill();
      ctx.globalAlpha /= 0.85;
      ctx.fillStyle = RI.waxShade; ctx.globalAlpha *= 0.5;          // the wax hand inside the ice
      ctx.beginPath(); ctx.ellipse(-2, 1, 8, 6, 0, 0, TAU); ctx.fill();
      ctx.globalAlpha /= 0.5;
    }
    ctx.restore();
    if (!dead) {
      for (let i = -1; i <= 1; i++) {
        const ox = F.x + Math.cos(a) * 15 + Math.cos(a + Math.PI / 2) * i * 9, oy = F.y + Math.sin(a) * 15 + Math.sin(a + Math.PI / 2) * i * 9;
        prism(ctx, ox, oy, a + Math.PI / 2 + i * 0.35, i === 0 ? 12 : 9, 7, { lw: 1.2, fill: ice });
      }
    }
  }

  function drawHusk(ctx, e, t, dead) {
    const ch = CH();
    const f = e.facing, fx = e.cx, fy = e.y + e.h;
    const a = dead ? 0 : e.arm;
    const tele = !dead && e.telegraphing;
    const crack = clamp(1 - e.hp / Math.max(1, e.maxHp), 0, 1);
    const moving = !dead && Math.abs(e.vx) > 1;
    const walk = Math.sin(e.walkPh || 0);
    const up = Math.max(0, a), dn = Math.max(0, -a);
    const sq = 1 + up * 0.05 - dn * 0.1 - (dead ? 0.06 : 0);
    const lean = -up * 4 + dn * 7 + (dead ? 8 : 0) + (e.is && e.is('turn') ? -3 : 0);
    const bob = moving ? Math.abs(walk) * 2 : 0;
    const strain = e.is && e.is('stuck') && e.stateTime > 0.45 ? Math.sin(t * 70) * 1.2 : 0;
    if (ch) ch.shadow(ctx, fx, fy, 40, 0.5);
    if (!dead) glow(ctx, fx, fy - 48, 70, RI.cyan, 0.1);
    ctx.save();
    ctx.translate(fx, fy); ctx.scale(f, 1); ctx.translate(HUSK_OX, 0);
    // legs (not skewed): stumps of wax in boots of ice
    for (const side of [-1, 1]) {
      const lift = moving ? Math.max(0, side * walk) * 4 : 0;
      const lx = side < 0 ? -15 : 10, sx = moving ? side * walk * 2.5 : 0;
      fillOut(ctx, pathOf([lx - 9 + sx, -28, lx + 9 + sx, -28, lx + 10 + sx, -7 - lift, lx - 10 + sx, -7 - lift]), side < 0 ? RI.waxShade : RI.wax, 2);
      fillOut(ctx, pathOf([lx - 12 + sx, -11 - lift, lx + 11 + sx, -12 - lift, lx + 15 + sx, -lift, lx - 13 + sx, -lift]), side < 0 ? RI.iceMid : RI.ice, 2);
      ctx.fillStyle = RI.iceHi; ctx.globalAlpha *= 0.6;
      ctx.fillRect(lx - 10 + sx, -11 - lift, 18, 2);
      ctx.globalAlpha /= 0.6;
    }
    // far arm (behind the body)
    {
      const S = e.shoulder ? e.shoulder(true) : HUSK_SHOULDER_FAR;
      const F = huskFist(clamp(a + (a > 0 ? -0.04 : 0.04), -1, 1), S.x, S.y);
      drawHuskArm(ctx, { x: S.x, y: S.y - bob }, { x: F.x - 8, y: F.y - (a < -0.5 ? 0 : 3) - bob * 0.5 }, true, dead);
    }
    // torso (skewed for lean, squashed for crouch)
    ctx.save();
    ctx.transform(1, 0, -lean / 86, sq, strain, -bob);
    const body = pathOf([-24, -20, -31, -42, -29, -66, -14, -84, 4, -90, 20, -84, 30, -70, 31, -50, 25, -32, 12, -20]);
    if (ch && ch.shape) ch.shape(ctx, body, { fill: RI.wax, light: -f, lw: 2, outline: RI.outline, box: [-31, -90, 31, -20], shade: 0.45, rim: RI.frost, rimWidth: 2 });
    else fillOut(ctx, body, RI.wax, 2);
    // wax drips down the chest
    ctx.fillStyle = RI.waxHi; ctx.globalAlpha *= 0.5;
    ctx.beginPath(); ctx.moveTo(18, -44); ctx.quadraticCurveTo(21, -34, 19, -28); ctx.quadraticCurveTo(16, -34, 15, -44); ctx.closePath(); ctx.fill();
    ctx.globalAlpha /= 0.5;
    // head jutting forward under the ice brow
    const hx = 33, hy = -52;
    const head = pathOf([22, -63, 36, -65, 45, -57, 45, -45, 36, -38, 24, -41]);
    if (ch && ch.shape) ch.shape(ctx, head, { fill: RI.waxShade, light: -f, lw: 2, outline: RI.outline, box: [22, -65, 45, -38], shade: 0.35, rim: RI.frost, rimWidth: 1.5 });
    else fillOut(ctx, head, RI.waxShade, 2);
    ctx.fillStyle = RI.ghostVoid; ctx.globalAlpha *= 0.55;                // the shadow under the brow
    ctx.beginPath(); ctx.ellipse(hx + 4, hy - 4, 10, 5, 0, 0, TAU); ctx.fill();
    ctx.globalAlpha /= 0.55;
    // glacier shell over hump, shoulders and brow
    const shell = pathOf([-33, -38, -35, -64, -22, -88, -2, -99, 18, -95, 34, -82, 47, -66, 40, -61, 30, -67, 14, -71, -4, -66, -18, -52, -25, -38]);
    if (ch && ch.shape) ch.shape(ctx, shell, { fill: RI.ice, light: -f, lw: 2, outline: RI.outline, box: [-35, -99, 47, -38], shade: 0.5, shadeColor: '#16324a', hi: 0.3, rim: RI.iceHi, rimWidth: 2.5 });
    else fillOut(ctx, shell, RI.ice, 2);
    // the Snuffed's waxen back dimly visible inside the ice, facets
    ctx.fillStyle = RI.waxShade; ctx.globalAlpha *= 0.32;
    ctx.beginPath(); ctx.ellipse(-12, -66, 13, 18, -0.45, 0, TAU); ctx.fill();
    ctx.globalAlpha /= 0.32;
    ctx.strokeStyle = RI.iceMid; ctx.lineWidth = 1.3; ctx.globalAlpha *= 0.85;
    ctx.beginPath();
    ctx.moveTo(-31, -60); ctx.lineTo(-16, -68); ctx.lineTo(-4, -94);
    ctx.moveTo(-16, -68); ctx.lineTo(8, -76); ctx.lineTo(30, -76);
    ctx.moveTo(-26, -44); ctx.lineTo(-16, -68);
    ctx.stroke();
    ctx.globalAlpha /= 0.85;
    ctx.strokeStyle = RI.iceHi; ctx.lineWidth = 2; ctx.globalAlpha *= 0.7;           // brow highlight
    ctx.beginPath(); ctx.moveTo(20, -88); ctx.lineTo(34, -79); ctx.lineTo(44, -67); ctx.stroke();
    ctx.globalAlpha /= 0.7;
    // cracks (grow with damage)
    if (crack > 0.15) {
      ctx.strokeStyle = RI.iceHi; ctx.lineWidth = 1.4;
      ctx.beginPath();
      ctx.moveTo(-22, -84); ctx.lineTo(-16, -76); ctx.lineTo(-20, -67); ctx.lineTo(-12, -58);
      if (crack > 0.45) { ctx.moveTo(10, -94); ctx.lineTo(5, -84); ctx.lineTo(12, -77); ctx.moveTo(-16, -76); ctx.lineTo(-28, -72); }
      if (crack > 0.7) { ctx.moveTo(-30, -52); ctx.lineTo(-21, -48); ctx.lineTo(-23, -40); ctx.moveTo(30, -80); ctx.lineTo(24, -73); ctx.lineTo(27, -68); }
      ctx.stroke();
    }
    // a ridge of crystals along the hump — the husk's signature silhouette
    const tg = tele ? 0.6 + 0.4 * Math.sin(t * 30) : 0;
    prism(ctx, -29, -64, -1.2, 26, 12, { glow: tg * 0.5 });
    prism(ctx, -17, -84, -0.78, 38, 15, { glow: tg * 0.7 });
    prism(ctx, 1, -95, -0.3, 30, 13, { glow: tg * 0.6 });
    prism(ctx, -33, -46, -1.55, 14, 8, {});
    prism(ctx, 17, -92, 0.15, 14, 8, {});
    // dead wick poking out of the brow, its pall frozen into an ice curl
    ctx.strokeStyle = RI.outline; ctx.lineWidth = 3.2; ctx.lineCap = 'round';
    ctx.beginPath(); ctx.moveTo(29, -84); ctx.lineTo(32, -92); ctx.stroke();
    frozenCurl(ctx, 32, -92, 0.7, 1);
    // icicles hanging from the brow and the belly
    for (const [ix, iy, il] of [[31, -64, 6], [37, -63, 9], [43, -64, 6], [-22, -36, 6], [-28, -37, 9]]) {
      ctx.fillStyle = RI.outline;
      ctx.beginPath(); ctx.moveTo(ix - 3, iy); ctx.lineTo(ix + 3, iy); ctx.lineTo(ix, iy + il + 1.5); ctx.closePath(); ctx.fill();
      ctx.fillStyle = RI.iceHi;
      ctx.beginPath(); ctx.moveTo(ix - 1.8, iy); ctx.lineTo(ix + 1.8, iy); ctx.lineTo(ix, iy + il); ctx.closePath(); ctx.fill();
    }
    // eyes: two cold pinpricks in the shadow under the brow; warm while heaving
    if (ch && ch.eyes) {
      if (!dead) ch.eyes(ctx, hx + 4, hy - 3, { kind: 'pinprick', size: 15, gap: 10, color: tele ? RI.tele : RI.eye, blink: tele ? 0 : ch.blinkAt(t, e.seed, 5) });
      else { ctx.strokeStyle = RI.outline; ctx.lineWidth = 1.6; ctx.beginPath(); ctx.moveTo(hx - 3, hy - 3); ctx.lineTo(hx + 1, hy - 3); ctx.moveTo(hx + 7, hy - 3); ctx.lineTo(hx + 11, hy - 3); ctx.stroke(); }
    }
    if (tele) glow(ctx, hx + 4, hy - 3, 24, RI.tele, 0.35);
    ctx.restore();
    // near arm (in front)
    {
      const S0 = e.shoulder ? e.shoulder(false) : HUSK_SHOULDER;
      const S = { x: S0.x, y: S0.y - bob };
      const F = huskFist(a, S.x, S.y);
      drawHuskArm(ctx, S, { x: F.x, y: F.y - (moving ? Math.abs(walk) * 2 : 0) }, false, dead);
      if (tele) glow(ctx, F.x, F.y, 32, RI.tele, 0.3 + 0.2 * Math.sin(t * 28));
      if (!dead && e.is && (e.is('stuck') || e.is('slam'))) {
        for (let i = 0; i < 4; i++) prism(ctx, F.x - 16 + i * 10, 2, -0.6 + i * 0.4, 7 + (i % 2) * 5, 6, { lw: 1 });   // ice heaved up around the fists
      }
    }
    ctx.restore();
  }

  // =====================================================================================================
  // ice_spitter
  // =====================================================================================================
  const MOUNTS = {
    floor: { n: { x: 0, y: -1 }, rot: 0 },
    ceiling: { n: { x: 0, y: 1 }, rot: Math.PI },
    left: { n: { x: 1, y: 0 }, rot: Math.PI / 2 },     // wall on its left, it grows rightward
    right: { n: { x: -1, y: 0 }, rot: -Math.PI / 2 },
  };
  const SPIT_ROOT = 14, SPIT_LEN = 30, SPIT_MAXAIM = 1.5;

  class IceSpitter extends G.Enemy {
    constructor(props) {
      super(props, {
        hp: 50, w: 36, h: 36, cinders: [6, 9], weight: 12, gravity: 0, physics: 'manual', anchor: 'center', sight: 9 * TILE,
        colors: { body: RI.ice, dark: RI.iceDeep, hit: '#e6f7ff', smoke: '#c4e0ee', puddle: '#58778c', tele: RI.tele },
        light: { r: 70, color: RI.cyan, intensity: 0.28 },
        meltTime: 0.6, puddleW: 22,
      });
      this.mount = 'floor';
      this.aimRel = 0; this.aimLock = null; this.grow = 1; this.charge = 0; this.recoil = 0;
      this.puddleWick = false;
    }
    init() {
      super.init();
      this.attach();
      this.setState('watch');
      this.cooldown('shot', rnd(0.8, 1.6));
    }
    /** Find the surface it grows from (props.surface or the first solid side: floor, ceiling, left, right) and sit flush on it. */
    attach() {
      const room = this.room;
      const c = Math.floor(this.cx / TILE), r = Math.floor(this.cy / TILE);
      const solid = (cc, rr) => !!room && G.Physics.isSolidTile(room.tileAt(cc, rr));
      let m = this.props.surface;
      if (!MOUNTS[m]) m = solid(c, r + 1) ? 'floor' : solid(c, r - 1) ? 'ceiling' : solid(c - 1, r) ? 'left' : solid(c + 1, r) ? 'right' : 'floor';
      this.mount = m;
      if (m === 'floor') this.y = (r + 1) * TILE - this.h;
      else if (m === 'ceiling') this.y = r * TILE;
      else if (m === 'left') this.x = c * TILE;
      else this.x = (c + 1) * TILE - this.w;
      this.vx = this.vy = 0;
      this.home = { x: this.cx, y: this.cy };
    }
    normal() { return MOUNTS[this.mount].n; }
    /** Base point on the surface (local origin of the drawing). */
    base() { const n = this.normal(); return { x: this.cx - n.x * this.h / 2, y: this.cy - n.y * this.h / 2 }; }
    toWorld(lx, ly) {
      const b = this.base(), a = MOUNTS[this.mount].rot, ca = Math.cos(a), sa = Math.sin(a);
      return { x: b.x + lx * ca - ly * sa, y: b.y + lx * sa + ly * ca };
    }
    muzzle(lenK) {
      const L = SPIT_LEN * (lenK == null ? 1 : lenK);
      return this.toWorld(Math.sin(this.aimRel) * L, -SPIT_ROOT - Math.cos(this.aimRel) * L);
    }
    eye() { return this.muzzle(0.6); }
    /** Aim (relative to the surface normal) toward the Wickling, clamped to the half-space in front of the surface. */
    wantAim(p) {
      const m = this.muzzle(0), pc = pCenter(p);
      const phi = Math.atan2(pc.y - m.y, pc.x - m.x);
      return clamp(wrapA(phi - (MOUNTS[this.mount].rot - Math.PI / 2)), -SPIT_MAXAIM, SPIT_MAXAIM);
    }
    seesTarget() {
      const p = this.player;
      if (!this.targetable(p)) return false;
      const n = this.normal(), b = this.base(), pc = pCenter(p);
      const vx = pc.x - b.x, vy = pc.y - b.y, d = Math.hypot(vx, vy) || 1;
      if ((vx * n.x + vy * n.y) / d < 0.06) return false;               // never at a target behind its own surface
      return this.canSee(p, this.sight);
    }
    think(dt) {
      const p = this.player;
      if (this.recoil > 0) this.recoil = Math.max(0, this.recoil - dt * 4);
      this.grow = toward(this.grow, 1, dt * 1.1);
      switch (this.state) {
        case 'watch': {
          const sees = this.seesTarget();
          // it slowly turns its crystal after the Wickling (creepy watching), else sways back to rest
          const goal = sees ? this.wantAim(p) * 0.6 : Math.sin(this.t * 0.7 + this.seed) * 0.12;
          this.aimRel = toward(this.aimRel, goal, dt * 0.9);
          if (sees && this.ready('shot') && this.grow > 0.95 && !playerInZone(this)) this.setState('aim');
          break;
        }
        case 'aim': {                                      // TELEGRAPH 0.7 s: tracks 0.45 s, then locks and glints
          if (this.once('tele')) {
            const m = this.muzzle();
            this.stateData.w = this.telegraph(0.7, { x: m.x, y: m.y, shake: 0.6, sound: 'spitter_charge', vol: 0.8 });
          }
          const w = this.stateData.w || 0.7;
          if (this.stateTime < w - 0.25 && this.targetable(p)) this.aimRel = toward(this.aimRel, this.wantAim(p), dt * 4.5);
          else if (this.aimLock == null) this.aimLock = this.aimRel;
          if (this.tele) { const m = this.muzzle(); this.tele.x = m.x; this.tele.y = m.y; }
          this.charge = clamp(this.stateTime / w, 0, 1);
          if (this.stateTime >= w) this.setState('fire');
          break;
        }
        case 'fire':                                       // two icicles along the locked line
          if (this.aimLock != null) this.aimRel = this.aimLock;
          if (this.once('s1')) this.shoot();
          if (this.at(0.2)) this.shoot();
          if (this.stateTime >= 0.24) this.setState('recover');
          break;
        case 'recover':                                    // punish window; the crystal tip regrows
          this.charge = toward(this.charge, 0, dt * 3);
          if (this.stateTime >= 0.6) { this.aimLock = null; this.cooldown('shot', rnd(2.2, 3)); this.setState('watch'); }
          break;
        default: this.setState('watch');
      }
      if (!this.is('aim') && !this.is('fire')) this.charge = toward(this.charge, 0, dt * 3);
    }
    shoot() {
      const m = this.muzzle(1), a = MOUNTS[this.mount].rot - Math.PI / 2 + this.aimRel, s = 360;
      this.fire('icicle', { x: m.x, y: m.y, vx: Math.cos(a) * s, vy: Math.sin(a) * s, destroyable: true, color: RI.cyan, sound: false });
      sfx('icicle_shot', m.x, { vol: 0.85 });
      burst('shard', m.x, m.y, { count: 4, color: RI.iceHi, speed: 160, angle: a, spread: 1.4 });
      burst('flash', m.x, m.y, { r: 20, color: RI.frost, life: 0.08 });
      this.recoil = 1;
      this.grow = 0.45;
    }
    onDeath() {
      if (this.mount !== 'floor') { this.meltStarted = false; this.vx = 0; this.vy = 40; }   // wall/ceiling growths break off and fall
      burst('shard', this.cx, this.cy, { count: 16, color: RI.ice, speed: 300, spread: TAU });
      sfx('ice_shatter', this.cx, { vol: 0.9, pitch: 0.9 });
    }
    drawBounds() { return { x: this.x - 40, y: this.y - 40, w: this.w + 80, h: this.h + 80 }; }
    drawBody(ctx, t) { drawSpitter(ctx, this, t, false); }
    drawCorpse(ctx, t) { drawSpitter(ctx, this, t, true); }
  }

  function drawSpitter(ctx, e, t, dead) {
    const ch = CH();
    const b = e.base ? e.base() : { x: e.cx, y: e.y + e.h };
    const rot = (MOUNTS[e.mount] || MOUNTS.floor).rot;
    const tele = !dead && e.telegraphing;
    const chg = dead ? 0 : e.charge || 0;
    const pulse = 0.5 + 0.5 * Math.sin(t * 2.2 + (e.seed || 0));
    ctx.save();
    ctx.translate(b.x, b.y); ctx.rotate(rot);
    if (!dead) glow(ctx, 0, -20, 46, RI.cyan, 0.14 + 0.06 * pulse + 0.3 * chg);
    // base: the crown of a Snuffed buried in the ice, frost-capped; the crystals grow out of its skull
    const mound = pathOf([-28, 2, -26, -6, -19, -13, -8, -17, 8, -17, 19, -13, 26, -6, 29, 2]);
    if (ch && ch.shape) ch.shape(ctx, mound, { fill: RI.wax, light: -1, lw: 2, outline: RI.outline, box: [-28, -17, 29, 2], shade: 0.45, rim: RI.frost, rimWidth: 1.8 });
    else fillOut(ctx, mound, RI.wax, 2);
    ctx.fillStyle = RI.frost; ctx.globalAlpha *= 0.8;                         // frost cap
    ctx.fill(pathOf([-19, -13, -8, -17, 8, -17, 19, -13, 12, -12, 4, -14, -6, -13, -13, -11]));
    ctx.globalAlpha /= 0.8;
    ctx.fillStyle = RI.ghostVoid; ctx.globalAlpha *= 0.9;                     // sockets (QA: darker so the face reads among decor crystals)
    ctx.beginPath(); ctx.ellipse(-6, -7, 5, 3.6, 0, 0, TAU); ctx.ellipse(6, -7, 5, 3.6, 0, 0, TAU); ctx.fill();
    ctx.globalAlpha /= 0.9;
    ctx.fillStyle = RI.ghostVoid;                                               // a frozen, gaping mouth
    ctx.beginPath(); ctx.ellipse(0, -0.5, 2.6, 2.1, 0, 0, TAU); ctx.fill();
    // eyes: they stare at the Wickling and burn warm while it aims
    if (ch && ch.eyes && !dead) ch.eyes(ctx, Math.sin(e.aimRel || 0) * 1.5, -6.5, { kind: 'pinprick', size: 21, gap: 12, color: tele ? RI.tele : RI.eye, blink: tele ? 0 : ch.blinkAt(t, e.seed || 1, 6) });
    // side crystals
    const sideGlow = chg > 0 ? chg * 0.6 : 0;
    prism(ctx, -23, -4, -1.3, 10, 6, { lw: 1.2 });
    prism(ctx, 24, -3, 1.25, 8, 5, { lw: 1.2 });
    prism(ctx, -15, -12, -0.85, 18, 8, { glow: sideGlow * 0.7 });
    prism(ctx, 16, -11, 0.75, 15, 7, { glow: sideGlow * 0.7 });
    // the great crystal (the spitter) — recoils and regrows its tip
    const ar = e.aimRel || 0, rec = (e.recoil || 0) * 4;
    const L = SPIT_LEN * (dead ? 0.6 : (e.grow == null ? 1 : e.grow));
    const rx = -Math.sin(ar) * rec, ry = Math.cos(ar) * rec;
    prism(ctx, rx, -SPIT_ROOT + ry, ar, L, 14, { lw: 1.8, glow: 0.25 + chg * 0.9, fill: chg > 0.6 ? RI.frost : RI.ice });
    // charge: light gathering in the crystal core + motes spiralling into the tip
    if (chg > 0) {
      const tx = rx + Math.sin(ar) * L, ty = -SPIT_ROOT + ry - Math.cos(ar) * L;
      ctx.strokeStyle = RI.teleHot; ctx.globalAlpha *= 0.85 * chg; ctx.lineWidth = 2;
      ctx.beginPath(); ctx.moveTo(rx + Math.sin(ar) * 4, -SPIT_ROOT + ry - Math.cos(ar) * 4); ctx.lineTo(tx, ty); ctx.stroke();
      ctx.globalAlpha /= 0.85 * chg;
      ctx.fillStyle = RI.frost;
      for (let i = 0; i < 6; i++) {
        const fr = ((e.stateTime || 0) * 1.7 + i / 6) % 1, rr = 30 * (1 - fr), aa = i * 1.05 + fr * 3;
        ctx.globalAlpha = clamp(fr * 2, 0, 1) * chg;
        ctx.beginPath(); ctx.arc(tx + Math.cos(aa) * rr, ty + Math.sin(aa) * rr, 1.6, 0, TAU); ctx.fill();
      }
      ctx.globalAlpha = 1;
      glow(ctx, tx, ty, 18 + 10 * chg, RI.tele, 0.25 + 0.4 * chg);
    }
    ctx.restore();
  }

  // =====================================================================================================
  // rime_wraith
  // =====================================================================================================
  const WR_FADE = 0.28, WR_SHIMMER = 0.6, WR_SLASH = 0.24, WR_LINGER = 0.55, WR_VANISH = 0.28, WR_REFORM = 0.3, WR_SIDE = 1.5;

  class RimeWraith extends G.Enemy {
    constructor(props) {
      super(props, {
        hp: 60, w: 34, h: 50, flying: true, weight: 0.8, knockback: 300, cinders: [8, 14], sight: 9 * TILE,
        colors: { body: RI.ghost, dark: RI.ghostDark, hit: '#ffffff', smoke: RI.ghostMid, puddle: '#6e8ea3', tele: '#dff6ff' },
        light: { r: 80, color: '#bfeaff', intensity: 0.3 },
        meltTime: 0.75, puddleTime: 0.9,
      });
      this.vis = 1; this.claw = 0; this.inWall = 0; this.lostT = 0; this.strikeAt = null; this.trailT = 0;
    }
    init() { super.init(); this.setState('drift'); this.cooldown('blink', rnd(0.8, 1.4)); }
    leashPx() { return propTiles(this, 'leash', 8); }
    /** Ghost movement: velocity (and knockback) integrated straight through terrain; keepInRoom() bounds it. */
    physicsStep(dt) {
      let vx = this.vx, vy = this.vy;
      if (this.kbTime > 0) { const k = clamp(this.kbTime / 0.14, 0, 1); vx = this.kbVx * (0.35 + 0.65 * k); vy = this.kbVy * (0.35 + 0.65 * k); this.kbTime -= dt; }
      this.x += vx * dt; this.y += vy * dt;
      this.wallHit = 0; this.ceilHit = false; this.grounded = false;
    }
    /** Clamp a steering target to the leash (around home), out of exit zones and inside the room. */
    tether(x, y) {
      const h = this.home, L = this.leashPx();
      x = clamp(x, h.x - L, h.x + L); y = clamp(y, h.y - L * 0.6, h.y + L * 0.6);
      const room = this.room;
      for (let i = 0; i < 3; i++) {
        const z = inZone(room, x, y);
        if (!z) break;
        if (z.side === 'W') x = z.x1 + 30; else if (z.side === 'E') x = z.x0 - 30; else if (z.side === 'N') y = z.y1 + 30; else y = z.y0 - 30;
      }
      if (room) { x = clamp(x, TILE, room.widthPx - TILE); y = clamp(y, TILE, room.heightPx - TILE); }
      return { x, y };
    }
    engageable(p) {
      if (!this.targetable(p)) return false;
      const pc = pCenter(p), L = this.leashPx();
      return Math.abs(pc.x - this.home.x) < L + 3 * TILE && Math.abs(pc.y - this.home.y) < L * 0.6 + 3 * TILE;
    }
    /** A free spot right beside the Wickling with a clear line to it (prefers the side the wraith is on). */
    strikeSpot(p) {
      const pc = pCenter(p), room = this.room;
      const side0 = this.cx < pc.x ? -1 : 1;
      for (const side of [side0, -side0]) {
        for (const k of [WR_SIDE, WR_SIDE + 0.3, WR_SIDE - 0.25]) {
          const x = pc.x + side * k * TILE, y = pc.y - 6;
          if (!spotFree(room, x, y, this.w + 6, this.h + 6) || inZone(room, x, y)) continue;
          if (G.Physics.raycast(room, x, y, pc.x, pc.y).hit) continue;
          return { x, y, face: -side };
        }
      }
      return null;
    }
    retreatSpot(p) {
      const pc = p ? pCenter(p) : { x: this.cx, y: this.cy };
      const room = this.room, s0 = Math.random() < 0.5 ? -1 : 1;
      for (let i = 0; i < 10; i++) {
        const side = i % 2 ? -s0 : s0, dist = (4.2 + (i >> 1) * 0.5) * TILE, up = (1 + (i % 3) * 0.7) * TILE;
        const q = this.tether(pc.x + side * dist, pc.y - up);
        if (Math.abs(q.x - pc.x) < 3 * TILE) continue;
        if (spotFree(room, q.x, q.y, this.w + 8, this.h + 8)) return q;
      }
      return null;
    }
    moveTo(x, y) { this.x = x - this.w / 2; this.y = y - this.h / 2; this.vx = this.vy = 0; this.kbTime = 0; }
    think(dt) {
      const p = this.player;
      const room = this.room;
      this.inWall = toward(this.inWall, room && G.Physics.rectSolid(room, this.x + 6, this.y + 6, this.w - 12, this.h - 12) ? 1 : 0, dt * 4);
      switch (this.state) {
        case 'drift': {                                   // hovers near home, drifting through ice and stone
          this.vis = toward(this.vis, 1, dt * 3);
          this.claw = toward(this.claw, 0, dt * 3);
          this.hover(null, null, dt, { amp: 18, freq: 0.32, speed: 45, avoid: 0 });
          if (this.engageable(p) && this.canSee(p, this.sight)) { this.lostT = 0; this.setState('stalk'); }
          break;
        }
        case 'stalk': {                                   // keeps beside and above the Wickling, then blinks in
          this.vis = toward(this.vis, 1, dt * 3);
          this.claw = toward(this.claw, 0, dt * 3);
          if (!this.engageable(p)) { this.setState('drift'); break; }
          this.lostT = this.canSee(p, this.sight * 1.2) ? 0 : this.lostT + dt;
          if (this.lostT > 3) { this.setState('drift'); break; }
          const pc = pCenter(p), side = this.cx < pc.x ? -1 : 1;
          const q = this.tether(pc.x + side * 3.4 * TILE, pc.y - 1.3 * TILE + this.bob(10, 0.6));
          this.flyTo(q.x, q.y, 85, dt, { accel: 320, avoid: 0 });
          this.face(p);
          if (this.ready('blink') && this.stateTime > 0.7 && this.dist(p) < 7.5 * TILE && !playerInZone(this)) this.setState('fade');
          break;
        }
        case 'fade':                                      // dissolves where it is (still hurtable)
          this.vx *= 0.9; this.vy *= 0.9;
          if (this.once('fx')) { sfx('wraith_blink', this.cx, { vol: 0.7 }); burst('smoke', this.cx, this.cy, { count: 5, color: RI.ghostMid, alpha: 0.35, size: 10, speed: 40 }); }
          this.vis = clamp(1 - this.stateTime / WR_FADE, 0, 1);
          if (this.stateTime >= WR_FADE) {
            const s = this.targetable(p) ? this.strikeSpot(p) : null;
            if (!s) { this.cooldown('blink', 0.8); this.setState('reform'); break; }
            this.moveTo(s.x, s.y); this.facing = s.face; this.strikeAt = s;
            this.hidden = true;
            this.setState('shimmer');
          }
          break;
        case 'shimmer':                                   // TELEGRAPH 0.6 s at the destination: frost gathers, outline forms
          this.vx = this.vy = 0;
          if (this.once('tele')) this.stateData.w = this.telegraph(WR_SHIMMER, { x: this.cx, y: this.cy - 4, shake: 0, color: '#e8f8ff', sound: 'wraith_shimmer', vol: 0.9 });
          this.claw = toward(this.claw, 1, dt * 3);
          if (this.every(0.07)) burst('snow', this.cx + rnd(-26, 26), this.cy + rnd(-30, 30), { count: 1, color: RI.snow, speed: 40, angle: Math.random() * TAU });
          if (this.stateTime >= (this.stateData.w || WR_SHIMMER)) {
            this.hidden = false; this.vis = 1;
            burst('smoke', this.cx, this.cy, { count: 6, color: RI.ghost, alpha: 0.4, size: 10, speed: 70 });
            this.setState('slash');
          }
          break;
        case 'slash': {                                   // appears and rakes its talons
          this.claw = toward(this.claw, 2, dt * 14);
          if (this.once('sfx')) sfx('wraith_slash', this.cx, { vol: 1 });
          if (this.stateTime >= 0.04 && this.stateTime < 0.17) this.strike(this.slashRect(), { damage: 1 });
          if (this.stateTime >= WR_SLASH) this.setState('linger');
          break;
        }
        case 'linger':                                    // recovery: hangs there, talons low (punish window)
          this.claw = toward(this.claw, 0, dt * 2.5);
          this.vx = toward(this.vx, -this.facing * 25, dt * 200); this.vy = toward(this.vy, -12, dt * 200);
          if (this.stateTime >= WR_LINGER) this.setState('vanish');
          break;
        case 'vanish':                                    // blinks away to a spot a few tiles off
          this.vx *= 0.9; this.vy *= 0.9;
          if (this.once('fx')) { sfx('wraith_blink', this.cx, { vol: 0.6 }); }
          this.vis = clamp(1 - this.stateTime / WR_VANISH, 0, 1);
          if (this.stateTime >= WR_VANISH) {
            burst('smoke', this.cx, this.cy, { count: 5, color: RI.ghostMid, alpha: 0.35, size: 10, speed: 50 });
            const q = this.retreatSpot(this.targetable(p) ? p : null);
            if (q) this.moveTo(q.x, q.y);
            this.cooldown('blink', rnd(2.2, 3.1));
            this.setState('reform');
          }
          break;
        case 'reform':
          this.vis = clamp(this.stateTime / WR_REFORM, 0, 1);
          this.hidden = false;
          if (this.stateTime >= WR_REFORM) this.setState(this.engageable(p) ? 'stalk' : 'drift');
          break;
        default: this.setState('drift');
      }
      // a thin trail of frost smoke
      this.trailT -= dt;
      if (this.trailT <= 0 && !this.hidden && this.vis > 0.5) {
        this.trailT = 0.16;
        burst('smoke', this.cx - this.facing * 4 + rnd(-4, 4), this.y + this.h - 4, { count: 1, color: RI.ghostMid, alpha: 0.18 * this.vis, size: rnd(5, 8), speed: 14, angle: Math.PI / 2 });
      }
    }
    slashRect() { const w = 74, h = 62; return { x: this.facing > 0 ? this.cx - 8 : this.cx + 8 - w, y: this.cy - 34, w, h }; }
    onHurt() { if (this.is('drift')) this.setState('stalk'); }
    onDeath() {
      this.meltStarted = true; this.meltT0 = 0; this.vx = 0; this.vy = 0; this.hidden = false;
      burst('smoke', this.cx, this.cy, { count: 10, color: RI.ghost, alpha: 0.4, size: 12, speed: 90 });
      burst('snow', this.cx, this.cy, { count: 12, color: RI.snow, speed: 150 });
    }
    /** Death: the ghost unravels upward into frost smoke and leaves a few drifting motes (no puddle). */
    drawDeath(ctx, t) {
      const m = this.melt || 0;
      ctx.save();
      ctx.globalAlpha *= this.fade == null ? 1 : this.fade;
      if (m < 1) {
        ctx.save();
        ctx.globalAlpha *= 1 - m;
        ctx.translate(this.cx, this.cy - m * 26); ctx.scale(1 - m * 0.45, 1 + m * 0.7); ctx.translate(-this.cx, -this.cy);
        if (this.flashT > 0) this.drawFlashed(ctx, t, this.flashT / 0.12); else this.drawCorpse(ctx, t);
        ctx.restore();
      }
      const k = clamp(((this.deathT || 0) - (this.meltT0 || 0)) / (this.cfg.meltTime + this.cfg.puddleTime), 0, 1);
      ctx.fillStyle = RI.frost;
      for (let i = 0; i < 8; i++) {
        const a = h01(i, this.seed) * TAU, r = 10 + 30 * k * (0.6 + h01(i + 9, this.seed));
        ctx.globalAlpha = (1 - k) * 0.8 * (this.fade == null ? 1 : this.fade);
        ctx.beginPath(); ctx.arc(this.cx + Math.cos(a) * r, this.cy + Math.sin(a) * r * 0.6 - k * 40 * h01(i + 3, this.seed), 1.7, 0, TAU); ctx.fill();
      }
      glow(ctx, this.cx, this.cy - k * 20, 40, RI.cyan, 0.25 * (1 - k));
      ctx.restore();
    }
    drawBounds() { return { x: this.x - 56, y: this.y - 46, w: this.w + 112, h: this.h + 92 }; }
    drawBody(ctx, t) {
      if (this.hidden) { drawShimmer(ctx, this, t); return; }
      drawWraith(ctx, this, t, this.vis * (1 - 0.5 * this.inWall), false);
    }
    drawCorpse(ctx, t) { drawWraith(ctx, this, t, 1, true); }
  }

  /** Wraith arm: a ragged smoke sleeve, a bone-thin wrist and three long frost talons; claw pose c (0 rest … 1 raised …
   *  2 slashed through), mirrored centre space. */
  function wraithArm(ctx, sx, sy, c, far, t, seed) {
    let hx, hy, ta;
    if (c <= 1) { const k = ease(clamp(c, 0, 1)); hx = lerp(18, -4, k); hy = lerp(17, -32, k); ta = lerp(1.65, -2.0, k); }
    else { const k = ease(clamp(c - 1, 0, 1)); hx = lerp(-4, 28, k); hy = lerp(-32, 12, k); ta = lerp(-2.0, 0.85, k); }
    hx += Math.sin(t * 2 + seed) * 1.5; hy += Math.cos(t * 2.3 + seed) * 1.5;
    if (far) { hx -= 8; hy -= 3; }
    const dx = hx - sx, dy = hy - sy, L = Math.hypot(dx, dy) || 1;
    const ex = sx + dx * 0.62 - (dy / L) * 3, ey = sy + dy * 0.62 + (dx / L) * 3;
    ctx.lineCap = 'round'; ctx.lineJoin = 'round';
    // a thin smoky arm reaching out of the shroud (no sleeve: the shroud itself is the robe)
    fillOut(ctx, limb(sx, sy, ex, ey, 3.4, 2.4), far ? RI.ghostDark : RI.ghostMid, 1.2);
    fillOut(ctx, limb(ex, ey, hx, hy, 2.4, 1.6), far ? RI.ghostDark : RI.ghostMid, 1.2);
    ctx.strokeStyle = far ? RI.ghostMid : RI.ghost; ctx.lineWidth = 1.4; ctx.globalAlpha *= 0.7;  // smoke unravelling off the forearm
    const wv = Math.sin(t * 5 + seed) * 2;
    ctx.beginPath(); ctx.moveTo(ex, ey); ctx.quadraticCurveTo(ex - 5, ey + 5 + wv, ex - 9, ey + 4 + wv); ctx.stroke();
    ctx.globalAlpha /= 0.7;
    // three long frost talons
    for (let i = -1; i <= 1; i++) {
      const a = ta + i * 0.3, Lt = 16 - Math.abs(i) * 3.5;
      const tx = hx + Math.cos(a) * Lt, ty = hy + Math.sin(a) * Lt;
      const mx = hx + Math.cos(a - 0.28) * Lt * 0.55, my = hy + Math.sin(a - 0.28) * Lt * 0.55;
      ctx.strokeStyle = RI.outline; ctx.lineWidth = 4;
      ctx.beginPath(); ctx.moveTo(hx, hy); ctx.quadraticCurveTo(mx, my, tx, ty); ctx.stroke();
      ctx.strokeStyle = far ? RI.iceMid : RI.iceHi; ctx.lineWidth = 1.9;
      ctx.beginPath(); ctx.moveTo(hx, hy); ctx.quadraticCurveTo(mx, my, tx, ty); ctx.stroke();
    }
    return { x: hx, y: hy };
  }

  function drawWraith(ctx, e, t, alpha, dead) {
    if (alpha <= 0.01) return;
    const ch = CH();
    const f = e.facing, x = e.cx, y = e.cy;
    const sd = e.seed || 0;
    const wave = Math.sin(t * 2.6 + sd), wave2 = Math.sin(t * 3.7 + sd * 1.3);
    const claw = dead ? 0.2 : e.claw || 0;
    ctx.save();
    ctx.globalAlpha *= alpha;
    glow(ctx, x, y - 4, 56, RI.cyan, 0.18);
    ctx.translate(x, y); ctx.scale(f, 1);
    // far arm behind the shroud
    wraithArm(ctx, -2, -8, claw, true, t, sd);
    // tattered smoke trailing from the hem
    ctx.lineCap = 'round';
    for (let i = 0; i < 4; i++) {
      const bx = -12 + i * 6, w2 = Math.sin(t * 3 + i * 1.7 + sd);
      ctx.strokeStyle = i % 2 ? RI.ghostMid : RI.ghost; ctx.lineWidth = 3.2 - i * 0.5; ctx.globalAlpha *= 0.55;
      ctx.beginPath(); ctx.moveTo(bx, 12); ctx.quadraticCurveTo(bx - 7 + w2 * 4, 24, bx - 15 + w2 * 6, 31 + i * 3); ctx.stroke();
      ctx.globalAlpha /= 0.55;
    }
    // the shroud: a hood whose point falls back, narrowing into a long curling smoke tail
    const tl = wave * 6, tl2 = wave2 * 3;
    const P = new Path2D();
    P.moveTo(-19, -31);
    P.quadraticCurveTo(-6, -38, 6, -32);
    P.quadraticCurveTo(16, -26, 17, -13);
    P.quadraticCurveTo(18, 0, 12, 9);
    P.quadraticCurveTo(6, 18, 1 + tl * 0.3, 25);
    P.quadraticCurveTo(-5 + tl * 0.6, 34, -17 + tl, 42 + tl2);
    P.quadraticCurveTo(-11 + tl * 0.4, 30, -14, 18);
    P.quadraticCurveTo(-18, 6, -15, -8);
    P.quadraticCurveTo(-14, -20, -19, -31);
    P.closePath();
    const pa = ctx.globalAlpha;
    ctx.globalAlpha = pa * 0.9;
    if (ch && ch.shape) ch.shape(ctx, P, { fill: RI.ghost, light: -f, lw: 1.8, outline: RI.outline, box: [-19, -38, 18, 42], shade: 0.55, shadeColor: '#1c3448', hi: 0.25, rim: '#ffffff', rimWidth: 2 });
    else fillOut(ctx, P, RI.ghost, 2);
    ctx.globalAlpha = pa;
    // smoke folds
    ctx.strokeStyle = RI.ghostMid; ctx.lineWidth = 1.6; ctx.globalAlpha *= 0.85;
    ctx.beginPath();
    ctx.moveTo(-10, -12); ctx.quadraticCurveTo(-13, 6, -9 + tl * 0.4, 22);
    ctx.moveTo(-2, 0); ctx.quadraticCurveTo(-4, 14, -4 + tl * 0.5, 26);
    ctx.moveTo(-17, -29); ctx.quadraticCurveTo(-8, -31, -2, -27);
    ctx.stroke();
    ctx.globalAlpha /= 0.85;
    // the hood's opening: no face, a void with two cold lights
    ctx.fillStyle = RI.ghostVoid;
    ctx.beginPath(); ctx.ellipse(7.5, -15, 7.5, 10, 0.15, 0, TAU); ctx.fill();
    ctx.strokeStyle = RI.ghostMid; ctx.lineWidth = 2;
    ctx.beginPath(); ctx.ellipse(7.5, -15, 8.2, 10.6, 0.15, Math.PI * 1.05, Math.PI * 1.95); ctx.stroke();
    if (ch && ch.eyes && !dead) ch.eyes(ctx, 8.5, -15, { kind: 'pinprick', size: 14, gap: 7, color: e.telegraphing ? RI.tele : RI.cyan, blink: ch.blinkAt(t, sd, 7) });
    else if (dead) { ctx.strokeStyle = RI.ghostMid; ctx.lineWidth = 1.2; ctx.beginPath(); ctx.moveTo(3.5, -15); ctx.lineTo(6.5, -15); ctx.moveTo(10.5, -15); ctx.lineTo(13.5, -15); ctx.stroke(); }
    // frozen tears: icicles hanging from the hood's rim
    for (const [ix, il] of [[2, 6], [7, 9], [12, 5]]) {
      const iy = -25 + Math.abs(ix - 7) * 0.35;
      ctx.fillStyle = RI.outline;
      ctx.beginPath(); ctx.moveTo(ix - 2.4, iy); ctx.lineTo(ix + 2.4, iy); ctx.lineTo(ix, iy + il + 1.4); ctx.closePath(); ctx.fill();
      ctx.fillStyle = RI.iceHi;
      ctx.beginPath(); ctx.moveTo(ix - 1.4, iy); ctx.lineTo(ix + 1.4, iy); ctx.lineTo(ix, iy + il); ctx.closePath(); ctx.fill();
    }
    // near arm with talons
    wraithArm(ctx, 8, -3, claw, false, t, sd + 1);
    ctx.restore();
    // wisps rising off the hood
    if (ch && ch.pallSmoke && !dead) ch.pallSmoke(ctx, x - f * 14, y - 30, t, { count: 3, color: RI.ghostMid, alpha: 0.22 * alpha, height: 30, spread: 8, size: 5, seed: sd });
    // the slash itself
    if (!dead && e.is && e.is('slash') && ch && ch.slash) {
      const p = clamp(e.stateTime / 0.2, 0, 1);
      ch.slash(ctx, x + f * 12, y - 2, 42, f > 0 ? 0.35 : Math.PI - 0.35, p, { arc: 2.6, width: 18, color: '#9fdcff', core: '#ffffff', flip: f < 0 });
    }
  }

  /** The blink telegraph: frost gathering into the wraith's outline at the destination (talons raised). */
  function drawShimmer(ctx, e, t) {
    if (!e.is || !e.is('shimmer')) return;
    const w = (e.stateData && e.stateData.w) || WR_SHIMMER;
    const k = clamp(e.stateTime / w, 0, 1);
    const x = e.cx, y = e.cy;
    glow(ctx, x, y, 34 + 22 * k, RI.frost, 0.18 + 0.32 * k);
    // a vertical column of frost light
    ctx.save();
    ctx.globalAlpha *= 0.25 + 0.35 * k;
    ctx.fillStyle = RI.frost;
    ctx.beginPath(); ctx.ellipse(x, y, 3 + 8 * k, 34 + 6 * k, 0, 0, TAU); ctx.fill();
    ctx.restore();
    // motes spiralling in
    ctx.save();
    ctx.fillStyle = '#ffffff';
    for (let i = 0; i < 10; i++) {
      const fr = (e.stateTime * 1.6 + i / 10) % 1, r = 42 * (1 - fr), a = i * 0.63 + fr * 4 + (e.seed || 0);
      ctx.globalAlpha = clamp(fr * 1.6, 0, 1) * (0.5 + 0.5 * k);
      ctx.beginPath(); ctx.arc(x + Math.cos(a) * r, y + Math.sin(a) * r * 0.9, 1.8, 0, TAU); ctx.fill();
    }
    ctx.restore();
    // the outline forming, talons up — shows where and which way it will strike
    drawWraith(ctx, e, t, 0.12 + 0.45 * k * k, false);
  }

  // =====================================================================================================
  // shard_crawler
  // =====================================================================================================
  // big back shards in local crawl space (centre origin, +y toward the surface, +x = forward after mirroring)
  const SHARDS = [{ x: -9, y: -8, a: -0.78, L: 16 }, { x: 0, y: -11, a: 0, L: 20 }, { x: 9, y: -8, a: 0.72, L: 15 }];
  class ShardCrawler extends G.Enemy {
    constructor(props) {
      super(props, {
        hp: 55, w: 34, h: 34, physics: 'manual', cinders: [8, 12], weight: 1.5, sight: 8 * TILE,
        colors: { body: RI.shell, dark: RI.shellDark, hit: '#e6f7ff', smoke: '#9db8c8', puddle: '#3e5568', tele: RI.tele },
        light: { r: 50, color: RI.cyan, intensity: 0.18 },
        meltTime: 0.6, puddleW: 20,
      });
      this.puddleWick = false;
      this.speed = +this.props.speed > 0 ? +this.props.speed : 38;
      this.walk = Math.random() * TAU;
      this.bristle = 0; this.regrow = 1; this.hurtT = 0;
    }
    init() { super.init(); this.crawlDir = this.facing; this.setState('crawl'); this.cooldown('volley', rnd(1.2, 2.2)); }
    normal() { const s = this.surf || { x: 0, y: 1 }; return { x: -s.x, y: -s.y }; }
    /** World position of a local crawl-space point (lx mirrored by facing). */
    toWorld(lx, ly) {
      const a = this.crawlAngle || 0, ca = Math.cos(a), sa = Math.sin(a);
      const vx = (this.crawlVis && this.crawlVis.x) || 0, vy = (this.crawlVis && this.crawlVis.y) || 0;
      const X = lx * this.facing;
      return { x: this.cx + vx + X * ca - ly * sa, y: this.cy + vy + X * sa + ly * ca };
    }
    toWorldDir(ang) {        // local shard angle (0 = away from the surface, + = forward) → world unit vector
      const lx = Math.sin(ang) * this.facing, ly = -Math.cos(ang);
      const a = this.crawlAngle || 0, ca = Math.cos(a), sa = Math.sin(a);
      return { x: lx * ca - ly * sa, y: lx * sa + ly * ca };
    }
    eye() { const n = this.normal(); return { x: this.cx + n.x * 12, y: this.cy + n.y * 12 }; }
    offLimits() {
      if (inZone(this.room, this.cx, this.cy)) return true;
      const rg = +this.props.range;
      if (rg > 0 && this.home && (Math.abs(this.cx - this.home.x) > rg * TILE || Math.abs(this.cy - this.home.y) > rg * TILE)) return true;
      return hazardAt(this.room, this.cx, this.cy);
    }
    /** A hazard tile half a body ahead along its surface? */
    hazardNext() {
      const d = this.surf;
      if (!d) return false;
      const k = this.w / 2 + 6, tx = d.y * this.crawlDir, ty = -d.x * this.crawlDir;
      return hazardAt(this.room, this.cx + tx * k, this.cy + ty * k);
    }
    seesTarget() {
      const p = this.player;
      if (!this.targetable(p) || !this.surf) return false;
      const n = this.normal(), e = this.eye(), pc = pCenter(p);
      const vx = pc.x - e.x, vy = pc.y - e.y, d = Math.hypot(vx, vy) || 1;
      if (d > 6.5 * TILE) return false;
      if ((vx * n.x + vy * n.y) / d < -0.1) return false;
      return this.canSee(p, this.sight);
    }
    think(dt) {
      if (this.hurtT > 0) this.hurtT -= dt;
      switch (this.state) {
        case 'crawl': {
          if (this.surf && this.hazardNext()) { this.crawlDir = -this.crawlDir; this.facing = this.localFacing(); }
          const px = this.x, py = this.y, ps = this.surf, was = this.surf ? this.offLimits() : true;
          this.crawl(this.speed, dt);
          if (!was && this.surf && ps && (this.offLimits() || this.hazardNext())) {     // leash / doorway / hazard: step back and turn around
            this.x = px; this.y = py; this.surf = ps; this.crawlDir = -this.crawlDir;
            this.facing = this.localFacing();
          }
          this.walk += this.speed * dt * 0.3;
          if (this.ready('volley') && this.stateTime > 0.5 && this.surf && this.regrow > 0.98 && !playerInZone(this) && this.seesTarget()) this.setState('bristle');
          break;
        }
        case 'bristle': {                                    // TELEGRAPH 0.55 s: stops, shards rise and glow, body shivers
          if (this.once('tele')) { const w = this.toWorld(0, -24); this.stateData.w = this.telegraph(0.55, { x: w.x, y: w.y, shake: 1.4, sound: 'crawler_bristle', vol: 0.8 }); }
          if (this.every(0.1)) { const w = this.toWorld(rnd(-12, 12), -14); burst('snow', w.x, w.y, { count: 1, color: RI.snow, speed: 30 }); }
          if (this.stateTime >= this.stateData.w) this.volley();
          break;
        }
        case 'spent':                                        // recovery: stumps where the shards were (punish)
          if (this.stateTime >= 0.6) { this.cooldown('volley', rnd(2.6, 3.4)); this.setState('crawl'); }
          break;
        default: this.setState('crawl');
      }
      this.bristle = toward(this.bristle, this.is('bristle') ? 1 : 0, dt * (this.is('bristle') ? 2.2 : 8));
      if (!this.is('bristle')) this.regrow = toward(this.regrow, 1, dt * 0.85);
    }
    volley() {
      const s = 300;
      for (const sh of SHARDS) {
        const ang = sh.a * 1.15;
        const d = this.toWorldDir(ang);
        const L = sh.L * 1.3;
        const o = this.toWorld(sh.x + Math.sin(ang) * L * 0.6, sh.y - Math.cos(ang) * L * 0.6);
        this.fire('rime_shard', { x: o.x, y: o.y, vx: d.x * s, vy: d.y * s, destroyable: true, color: RI.cyan, sound: false });
      }
      const c = this.toWorld(0, -14);
      sfx('shard_volley', c.x, { vol: 0.9 });
      burst('shard', c.x, c.y, { count: 6, color: RI.iceHi, speed: 200 });
      this.regrow = 0; this.bristle = 0;
      this.setState('spent');
    }
    onHurt() { this.hurtT = 0.2; }
    drawBounds() { return { x: this.x - 40, y: this.y - 40, w: this.w + 80, h: this.h + 80 }; }
    drawBody(ctx, t) { drawCrawler(ctx, this, t, false); }
    drawCorpse(ctx, t) { drawCrawler(ctx, this, t, true); }
  }

  function drawCrawler(ctx, e, t, dead) {
    const ch = CH();
    const br = dead ? 0 : e.bristle || 0;
    const rg = dead ? 0.3 : (e.regrow == null ? 1 : e.regrow);
    const tele = !dead && e.telegraphing;
    const moving = !dead && e.is && e.is('crawl');
    const wk = e.walk || 0;
    ctx.save();
    if (e.crawlTransform) e.crawlTransform(ctx); else ctx.translate(e.cx, e.cy);
    ctx.scale(e.facing || 1, 1);
    if (dead) ctx.scale(1, -1);
    glow(ctx, 0, -6, 34, RI.cyan, 0.1 + 0.3 * br);
    const legs = (far) => {
      ctx.lineCap = 'round'; ctx.lineJoin = 'round';
      for (let i = 0; i < 3; i++) {
        const bx = -9 + i * 9 + (far ? 2 : 0), ph = wk * 2 + i * 2.1 + (far ? Math.PI : 0);
        const lift = moving ? Math.max(0, Math.sin(ph)) * 3 : 0, sw = moving ? Math.cos(ph) * 2.5 : 0;
        const spread = (i - 1);                                           // back legs reach back, front legs forward
        const kx = bx + spread * 10 + (spread ? 0 : -4) + sw * 0.5, ky = 6 - lift + (far ? 1 : 0);
        const tx = bx + spread * 16 + (spread ? 0 : -6) + sw, ty = 17 - lift * 0.4;
        ctx.strokeStyle = RI.outline; ctx.lineWidth = 4;
        ctx.beginPath(); ctx.moveTo(bx, 9); ctx.lineTo(kx, ky); ctx.lineTo(tx, ty); ctx.stroke();
        ctx.strokeStyle = far ? RI.shellDark : RI.shellHi; ctx.lineWidth = 1.8;
        ctx.beginPath(); ctx.moveTo(bx, 9); ctx.lineTo(kx, ky); ctx.lineTo(tx, ty); ctx.stroke();
        ctx.fillStyle = far ? RI.iceMid : RI.ice;                          // frosted knee
        ctx.beginPath(); ctx.arc(kx, ky, 1.6, 0, TAU); ctx.fill();
      }
    };
    legs(true);
    // shell: a low armoured dome
    const shell = pathOf([-20, 10, -22, 2, -17, -6, -7, -11, 6, -11, 15, -7, 20, 0, 21, 8, 10, 12, -8, 12]);
    if (ch && ch.shape) ch.shape(ctx, shell, { fill: RI.shell, light: -(e.facing || 1), lw: 2, outline: RI.outline, box: [-22, -11, 21, 12], shade: 0.45, rim: RI.frost, rimWidth: 2 });
    else fillOut(ctx, shell, RI.shell, 2);
    // plate seams + frost crust
    ctx.strokeStyle = RI.shellDark; ctx.lineWidth = 1.4;
    ctx.beginPath(); ctx.moveTo(-12, -8); ctx.quadraticCurveTo(-9, 2, -12, 10); ctx.moveTo(3, -11); ctx.quadraticCurveTo(6, 0, 3, 11); ctx.stroke();
    ctx.fillStyle = RI.frost; ctx.globalAlpha *= 0.55;
    ctx.beginPath(); ctx.ellipse(-4, -9, 10, 2.2, -0.05, 0, TAU); ctx.fill();
    ctx.globalAlpha /= 0.55;
    // head: a small waxen face peering from under the shell, two pinpricks, mandibles
    fillOut(ctx, pathOf([15, -4, 24, -3, 27, 3, 25, 9, 17, 10, 14, 4]), RI.waxShade, 1.8);
    if (ch && ch.eyes) {
      if (!dead) ch.eyes(ctx, 22, 1, { kind: 'pinprick', size: 10, gap: 5, color: tele ? RI.tele : RI.eye, blink: tele ? 0 : ch.blinkAt(t, e.seed || 2, 5) });
    }
    ctx.strokeStyle = RI.outline; ctx.lineWidth = 2.2; ctx.lineCap = 'round';
    const mand = moving ? Math.sin(t * 9 + (e.seed || 0)) * 0.8 : 0;
    ctx.beginPath(); ctx.moveTo(25, 7); ctx.quadraticCurveTo(30, 8 + mand, 28, 12); ctx.moveTo(23, 9); ctx.quadraticCurveTo(26, 12 - mand, 23, 14); ctx.stroke();
    legs(false);
    // small crystals on the shell
    prism(ctx, -16, -4, -1.15, 7, 5, { lw: 1 });
    prism(ctx, 15, -5, 1.0, 6, 4, { lw: 1 });
    prism(ctx, -4, -10, -0.35, 8, 5, { lw: 1 });
    prism(ctx, 5, -10, 0.38, 7, 4, { lw: 1 });
    // the three great shards: rise and fan out when bristling, gone after a volley and regrowing
    for (const sh of SHARDS) {
      const ang = sh.a * (1 + 0.15 * br);
      const L = sh.L * (1 + 0.3 * br) * Math.max(0.18, rg);
      const lift = br * 3;
      prism(ctx, sh.x + Math.sin(ang) * lift, sh.y - Math.cos(ang) * lift, ang, L, 7.5, { lw: 1.4, glow: br * 0.8 + (tele ? 0.2 : 0), fill: br > 0.6 ? RI.frost : RI.ice });
    }
    if (br > 0) glow(ctx, 0, -20, 26, RI.tele, 0.3 * br);
    ctx.restore();
  }

  // =====================================================================================================
  // ri_icehole — set piece (rooms builder): Wren's fishing hole in the Frozen Lake (ri_04). Purely decorative and
  // flush with the ice (the floor stays solid, it is not a hazard): an oval of black water in a rim of broken ice,
  // a slow glint on the water, a float bobbing on a line. Props: w (tiles, default 2). Placed with anchor 'ground'
  // on the tile above the ice; drawn behind the player.
  if (G.Events) {
    G.Events.ri_icehole = G.Events.ri_icehole || {
      init(e) { e.z = -6; },
      draw(e, ctx, t) {
        const cx = e.x + e.w / 2, top = e.y + e.h, rx = e.w * 0.46, ry = 6.5;
        if (G.camera && G.camera.visible && !G.camera.visible(cx - rx - 8, top - 12, rx * 2 + 16, 30, 20)) return;
        ctx.save();
        // broken-ice rim and chips
        ctx.fillStyle = 'rgba(200,240,255,0.55)';
        ctx.beginPath(); ctx.ellipse(cx, top + 2, rx + 6, ry + 3, 0, 0, Math.PI * 2); ctx.fill();
        for (let i = 0; i < 5; i++) {
          const a = i * 1.3 + 0.4, d = rx + 10 + (i % 2) * 5;
          ctx.fillRect(cx + Math.cos(a) * d - 2, top - 1 + (i % 3) - 1, 4 + (i % 2) * 2, 2);
        }
        // the dark water
        ctx.fillStyle = '#071420';
        ctx.beginPath(); ctx.ellipse(cx, top + 2, rx, ry, 0, 0, Math.PI * 2); ctx.fill();
        ctx.fillStyle = '#0f2a3c';
        ctx.beginPath(); ctx.ellipse(cx, top + 3.5, rx * 0.8, ry * 0.55, 0, 0, Math.PI * 2); ctx.fill();
        // a slow glint sliding across
        const g = (t * 0.12) % 1, gx = cx - rx * 0.7 + g * rx * 1.4;
        ctx.strokeStyle = 'rgba(200,240,255,' + (0.5 * Math.sin(g * Math.PI)).toFixed(3) + ')';
        ctx.lineWidth = 1.5;
        ctx.beginPath(); ctx.moveTo(gx - 6, top + 1); ctx.lineTo(gx + 6, top + 1); ctx.stroke();
        // the float on its line
        const bob = Math.sin(t * 1.7) * 1.2, fx = cx + rx * 0.25;
        ctx.strokeStyle = 'rgba(220,235,245,0.5)'; ctx.lineWidth = 1;
        ctx.beginPath(); ctx.moveTo(fx, top + bob - 1); ctx.lineTo(fx - 3, top - 26); ctx.stroke();
        ctx.fillStyle = '#d8604a'; ctx.fillRect(fx - 1.5, top + bob - 2, 3, 3);
        ctx.restore();
      },
    };
  }

  // =====================================================================================================
  G.registerEnemy('frost_husk', FrostHusk);
  G.registerEnemy('ice_spitter', IceSpitter);
  G.registerEnemy('rime_wraith', RimeWraith);
  G.registerEnemy('shard_crawler', ShardCrawler);
  // Test hooks (lab sheets, scripted fights)
  G.RimeEnemies = { FrostHusk, IceSpitter, RimeWraith, ShardCrawler, FrostSpikes, Icicle, RimeShard, RI, MOUNTS, SHARDS, exitZones, inZone };
})();
