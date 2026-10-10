// src/entities/enemies/flue.js — The Sootflue enemies (module: enemies-flue; placement guide: docs/api/enemies-flue.md):
//   soot_sprite     — a tiny boiling puff of soot with two slanted ember eyes. Drifts near its spot; when it sees
//                     the Wickling it jitters erratically toward it, swells up glowing (0.42 s) and darts ~3 tiles,
//                     then sags and drifts back up. Meant for small groups (2-3); bursts into ash. hp 10.
//   chimney_crawler — a brick-soot beetle with a little chimney pot on its back. Crawls floors, walls and ceilings;
//                     every few seconds it stops, its mortar glows and it swells (0.55 s), then coughs an ash ball
//                     at the Wickling out of the pot (projectile 'crawler_ash', destroyable). hp 26.
//   stoker          — a hulking soot-stained waxen with a coal shovel. Plods its beat; scoops embers (0.55 s, coals
//                     glow on the blade) and lobs 2-3 burning coals in arcs (projectile 'stoker_coal', destroyable);
//                     up close it heaves the shovel high over its head (0.62 s) and slams it down in front. hp 40.
//   ash_bat         — a pale ash-furred bat. Hangs asleep from a ceiling, wings wrapped; when the Wickling passes
//                     below it screeches (0.45 s), drops and swoops through the Wickling's position in an arc, then
//                     flutters above it and swoops again (0.42 s screech each time). With no ceiling above (open
//                     sky, tall shafts) it circles its spot instead. hp 18.
// All four respect exit zones (never steer into the 3.5 tiles inside a doorway), beats (`range` / `leash` props) and
// hazard tiles. See docs/api/enemies-flue.md.
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
  const glow = (ctx, x, y, r, c, a) => { if (G.fx && G.fx.glowAt) G.fx.glowAt(ctx, x, y, r, c, a); };
  const CH = () => (G.Art && G.Art.char) || null;
  const burst = (k, x, y, o) => { if (G.fx) G.fx.burst(k, x, y, o); };
  const shake = (px, s) => { if (G.game && typeof G.game.shake === 'function') G.game.shake(px, s); };

  // ------------------------------------------------------------------ sfx (defined only if the audio module lacks them)
  (function defineSfx() {
    const A = G.Audio;
    if (!A || typeof A.defineSfx !== 'function') return;
    const have = typeof A.sfxNames === 'function' ? A.sfxNames() : [];
    const def = (name, o) => { if (have.indexOf(name) < 0) A.defineSfx(name, o); };
    def('soot_puff', {        // a soft sooty "fff" as a sprite darts: breathy pink noise rising
      vol: 3, reverb: 0.15,
      play(k) {
        const v = k.r(0.9, 1.12);
        k.noise({ color: 'pink', bp: 700 * v, bp1: 2300 * v, Q: 1.1, a: 0.01, d: 0.22, g: 0.12, sweep: 0.18 });
        k.tone({ f: 330 * v, f1: 520 * v, glide: 0.12, type: 'triangle', a: 0.005, d: 0.1, g: 0.025 });
      },
    });
    def('ash_spit', {         // a chimney cough: dull puff + low throat knock
      vol: 3.4, reverb: 0.15,
      play(k) {
        const v = k.r(0.92, 1.08);
        k.noise({ color: 'brown', lp: 1400 * v, a: 0.004, d: 0.22, g: 0.3 });
        k.noise({ color: 'pink', bp: 900 * v, bp1: 400 * v, Q: 1.5, a: 0.006, d: 0.3, g: 0.12, sweep: 0.25 });
        k.tone({ f: 150 * v, f1: 80 * v, glide: 0.12, a: 0.003, d: 0.14, g: 0.12 });
      },
    });
    def('shovel_swing', {     // a heavy iron shovel heaved through the air
      vol: 3.4, reverb: 0.12,
      play(k) {
        const v = k.r(0.94, 1.05);
        k.noise({ bp: 320 * v, bp1: 1300 * v, Q: 1.2, a: 0.03, d: 0.3, g: 0.17, sweep: 0.26 });
        k.tone({ f: 95 * v, f1: 60 * v, glide: 0.25, a: 0.01, d: 0.25, g: 0.1 });
      },
    });
    def('shovel_slam', {      // blade into brick: thump, iron clang, gravel
      vol: 3.6, reverb: 0.2,
      play(k) {
        const v = k.r(0.94, 1.05);
        k.tone({ f: 72 * v, f1: 40 * v, glide: 0.2, a: 0.002, d: 0.32, g: 0.26 });
        k.noise({ color: 'brown', lp: 900 * v, a: 0.002, d: 0.32, g: 0.32 });
        k.noise({ bp: 2700 * v, Q: 9, a: 0.001, d: 0.3, g: 0.07 });
        k.tone({ f: 1240 * v, a: 0.001, d: 0.35, g: 0.025, type: 'triangle' });
      },
    });
    def('coal_hiss', {        // a burning coal hitting stone: crackle + short hiss
      vol: 3, reverb: 0.15,
      play(k) {
        const v = k.r(0.9, 1.1);
        k.noise({ bp: 3600 * v, bp1: 2200 * v, Q: 1.3, a: 0.003, d: 0.32, g: 0.09, sweep: 0.3 });
        k.noise({ color: 'brown', lp: 1100 * v, a: 0.001, d: 0.08, g: 0.16 });
      },
    });
    def('bat_screech', {      // thin rasping screech, two quick chirps
      vol: 2.6, reverb: 0.25,
      play(k) {
        const v = k.r(0.94, 1.08);
        k.tone({ f: 2300 * v, f1: 3100 * v, glide: 0.08, type: 'sawtooth', lp: 4200, a: 0.004, hold: 0.05, d: 0.12, g: 0.03, vib: { rate: 38, depth: 90 } });
        k.tone({ f: 2600 * v, f1: 1900 * v, glide: 0.18, type: 'sawtooth', lp: 3800, a: 0.004, hold: 0.08, d: 0.2, g: 0.032, vib: { rate: 42, depth: 110 }, at: 0.12 });
        k.noise({ hp: 3000, a: 0.004, d: 0.22, g: 0.03 });
      },
    });
  })();

  // Region creature colours: soot black + ember orange (read against the charcoal flue through glowing eyes,
  // ember rims, pale ash fur and brick red).
  const SF = {
    outline: '#0c0807', soot: '#231a17', sootMid: '#33261f', sootHi: '#4f3e36',
    ash: '#8c8078', ashHi: '#c3b6ab', ashDark: '#5a4f49',
    ember: '#ff7a2e', emberHot: '#ffbe6a', emberCore: '#fff0c8', rim: '#ff8a40', tele: '#ffb060',
  };

  // ------------------------------------------------------------------ shared: exit zones, beats, hazards
  /** Exit zones of the enemy's room: each opening's boundary run (±1 tile) and 3.5 tiles inward (wide N openings =
   *  open sky are skipped; wide S openings = pits are kept, so nothing wanders over a chasm). */
  function exitZones(e) {
    const room = e.room;
    if (e._zones && e._zonesRoom === room) return e._zones;
    const out = [];
    if (room) {
      const W = room.widthPx, H = room.heightPx, D = 3.5 * TILE;
      for (const o of room.openings || []) {
        if (o.side === 'N' && o.size > 8) continue;           // open sky over a surface room, not a doorway
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
    const m = margin == null ? 30 : margin;               // flyers jitter: aim well clear of the zone edge
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
  /** The Wickling stands in an exit zone (just came in / about to leave): no attacks that would follow it there. */
  function playerInZone(e) {
    const p = e.player;
    return !!p && !!inZone(e, p.x + p.w / 2, p.y + p.h / 2);
  }
  function hazardAt(e, x, y) {
    const r = e.room;
    return !!r && G.Physics.isHazardTile(r.tileAt(Math.floor(x / TILE), Math.floor(y / TILE)));
  }
  function propTiles(e, name, def) { const v = +e.props[name]; return (v > 0 ? v : def) * TILE; }
  const pCenter = (p) => ({ x: p.x + p.w / 2, y: p.y + p.h / 2 });

  /** A low heap of ash (death remains of soot creatures), dome on the floor at (x, y); p 0..1 spreads it. */
  function ashHeap(ctx, x, y, p, w, seed, o) {
    o = o || {};
    const ww = w * (0.45 + 0.55 * p), hh = Math.max(2, ww * 0.34);
    ctx.fillStyle = SF.outline;
    ctx.beginPath(); ctx.ellipse(x, y, ww + 1.5, hh + 1.5, 0, Math.PI, TAU); ctx.fill();
    ctx.fillStyle = o.color || SF.ashDark;
    ctx.beginPath(); ctx.ellipse(x, y, ww, hh, 0, Math.PI, TAU); ctx.fill();
    ctx.fillStyle = o.hi || SF.ash;
    ctx.beginPath(); ctx.ellipse(x - ww * 0.2, y - hh * 0.55, ww * 0.55, hh * 0.38, 0, 0, TAU); ctx.fill();
    // lumps
    for (let i = 0; i < 4; i++) {
      const lx = x + (h01(i, seed) - 0.5) * ww * 1.4, lr = 1.5 + h01(i + 7, seed) * 2.5;
      ctx.fillStyle = i % 2 ? SF.ashDark : SF.ash;
      ctx.beginPath(); ctx.arc(lx, y - 0.5, lr, Math.PI, TAU); ctx.fill();
    }
    // dying embers
    const ea = (o.embers == null ? 1 : o.embers) * (1 - p * 0.6);
    if (ea > 0.05) {
      for (let i = 0; i < 3; i++) {
        const ex = x + (h01(i + 3, seed) - 0.5) * ww * 1.1, ey = y - hh * (0.15 + 0.4 * h01(i + 5, seed));
        ctx.fillStyle = SF.emberHot;
        ctx.beginPath(); ctx.arc(ex, ey, 1.2, 0, TAU); ctx.fill();
        glow(ctx, ex, ey, 6, SF.ember, 0.4 * ea);
      }
    }
  }

  /** Two round ember eyes with an angry soot brow cutting their inner tops. look = horizontal pupil shift (px). */
  function emberEyes(ctx, x, y, gap, r, o) {
    o = o || {};
    const blink = o.blink || 0, col = o.color || '#ff8a3a', look = o.look || 0;
    for (const sd of [-1, 1]) {
      const ex = x + sd * gap / 2, ey = y;
      glow(ctx, ex, ey, r * 2.6, SF.ember, 0.45 * (1 - blink));
      ctx.fillStyle = col;
      ctx.beginPath(); ctx.ellipse(ex, ey, r, Math.max(0.5, r * (1 - blink * 0.9)), 0, 0, TAU); ctx.fill();
      if (blink < 0.6) {
        ctx.fillStyle = SF.emberCore;
        ctx.beginPath(); ctx.arc(ex + look * 0.4, ey + r * 0.1, r * 0.42, 0, TAU); ctx.fill();
      }
      if (o.brow) {
        ctx.fillStyle = o.brow;
        ctx.beginPath();
        ctx.moveTo(ex - sd * (r + 1.5), ey - r * 0.05);
        ctx.lineTo(ex + sd * (r + 1.5), ey - r * (1.15 + (o.angry || 0.4)));
        ctx.lineTo(ex + sd * (r + 1.5), ey - r - 3);
        ctx.lineTo(ex - sd * (r + 1.5), ey - r - 3);
        ctx.closePath(); ctx.fill();
      }
    }
  }

  // =====================================================================================================
  // soot_sprite
  // =====================================================================================================
  class SootSprite extends G.Enemy {
    constructor(props) {
      super(props, {
        hp: 10, w: 22, h: 22,
        flying: true,
        cinders: [3, 5],
        weight: 0.5,
        sight: 7 * TILE,
        colors: { body: SF.soot, dark: SF.outline, hit: '#ffe6d0', smoke: '#3a302c', puddle: SF.ashDark, tele: SF.tele },
        light: { r: 46, color: SF.ember, intensity: 0.32, flicker: true },
        puddleW: 11,
        meltTime: 0.35, puddleTime: 1.6,
        deathSound: 'enemy_die',
      });
      this.puddleWick = false;
      this.puff = 0;
      this.jT = 0;
      this.lostT = 0;
      this.orbit = rnd(1.5, 2.3);
      this.look = { x: 0, y: 0 };
    }
    init() { super.init(); this.setState(this.props.aggro ? 'chase' : 'drift'); }
    jitter(amt) {
      this.jT -= G.CONST.DT;
      if (this.jT <= 0) {
        this.jT = rnd(0.1, 0.28);
        this.vx += rnd(-1, 1) * amt; this.vy += rnd(-1, 1) * amt * 0.8;
      }
    }
    /** Keep a little space from other sprites so a group never stacks into one blob. */
    separate(dt) {
      const list = this.room ? this.room.entities : [];
      for (const o of list) {
        if (o === this || o.kind !== 'soot_sprite' || o.dying || o.dead) continue;
        const dx = this.cx - o.cx, dy = this.cy - o.cy, d = Math.hypot(dx, dy);
        if (d > 0.01 && d < 34) { const k = (34 - d) * 14 * dt; this.vx += (dx / d) * k; this.vy += (dy / d) * k; }
      }
    }
    homeDist() { return Math.hypot(this.cx - this.home.x, this.cy - this.home.y); }
    think(dt) {
      const p = this.player;
      const leash = propTiles(this, 'leash', 10);
      switch (this.state) {
        case 'drift':
          this.hover(null, null, dt, { amp: 10, freq: 0.7, speed: 40, accel: 240, arrive: 30, look: 30 });
          this.jitter(30);
          if ((this.stateTime > 0.3 && this.canSee(p)) || (this.props.aggro && this.targetable(p))) this.setState('chase');
          break;
        case 'chase': {
          if (!this.targetable(p)) { this.setState('return'); break; }
          const pc = pCenter(p);
          const side = this.cx < pc.x ? -1 : 1;
          const k = keepOut(this, pc.x + side * this.orbit * TILE + Math.sin(this.t * 1.7 + this.seed) * 22, pc.y - 0.8 * TILE + this.bob(16, 0.9));
          this.flyTo(k.x, k.y, 118, dt, { accel: 520, arrive: 40, look: 40 });
          this.jitter(105);
          this.separate(dt);
          this.face(p);
          if (this.canSee(p, this.sight * 1.4)) this.lostT = 0; else this.lostT += dt;
          if (!this.props.aggro && (this.lostT > 2.5 || this.homeDist() > leash)) { this.setState('return'); break; }
          if (this.ready('dart') && this.stateTime > 0.5 && this.dist() < 3.6 * TILE && this.canSee(p) && !inZone(this, this.cx, this.cy) && !playerInZone(this)) this.setState('puff');
          break;
        }
        case 'puff': {                                         // TELEGRAPH: swells, embers glow through the soot
          if (this.once('tele')) this.stateData.w = this.telegraph(0.42, { shake: 1.2, color: SF.tele, vol: 0.5 });
          const back = this.targetable(p) ? -this.dirTo(p) * 26 : 0;
          this.vx = toward(this.vx, back, 700 * dt); this.vy = toward(this.vy, -8, 700 * dt);
          if (this.targetable(p)) this.face(p);
          if (this.stateTime >= this.stateData.w) {
            if (!this.targetable(p) || playerInZone(this)) { this.cooldown('dart', 0.6); this.setState('chase'); break; }
            const a = this.aimAt(p, 340, { x: this.cx, y: this.cy });
            this.setState('dart', { vx: a.vx, vy: a.vy });
          }
          break;
        }
        case 'dart': {
          const d = this.stateData;
          if (this.once('fx')) {
            G.sfxAt('soot_puff', this.cx, { vol: 0.7 });
            burst('smoke', this.cx, this.cy, { count: 3, color: '#2a2220', alpha: 0.45, size: 7 });
          }
          this.vx = d.vx; this.vy = d.vy;
          if (inZone(this, this.cx + d.vx * 0.05, this.cy + d.vy * 0.05)) { this.vx = 0; this.vy = 0; this.cooldown('dart', rnd(1.7, 2.5)); this.setState('recover'); break; }
          if (Math.random() < 0.5) burst('ash', this.cx - d.vx * 0.03, this.cy - d.vy * 0.03, { count: 1, color: SF.ash });
          if (this.stateTime > 0.36 || this.wallHit || this.ceilHit || this.grounded) {
            this.cooldown('dart', rnd(1.7, 2.5));
            this.setState('recover');
          }
          break;
        }
        case 'recover':                                        // punishable: sags, slows, drifts up
          this.vx = toward(this.vx, 0, 650 * dt); this.vy = toward(this.vy, -24, 650 * dt);
          if (this.stateTime > 0.55) this.setState('chase');
          break;
        case 'return': {
          const d = this.flyTo(this.home.x, this.home.y, 80, dt, { accel: 300, arrive: 40 });
          this.jitter(30);
          if (Math.abs(this.vx) > 8) this.facing = this.vx > 0 ? 1 : -1;
          if (this.stateTime > 0.8 && this.homeDist() < leash * 0.7 && this.canSee(p)) this.setState('chase');
          else if (d < 14 || this.stateTime > 6) this.setState('drift');
          break;
        }
        default: this.setState('drift');
      }
      this.puff = toward(this.puff, this.is('puff') ? 1 : this.is('dart') ? 0.55 : 0, dt * (this.is('puff') ? 2.6 : 4));
      if (this.targetable(p)) {
        const dx = p.x + p.w / 2 - this.cx, dy = p.y + p.h / 2 - this.cy, d = Math.hypot(dx, dy) || 1;
        this.look.x = lerp(this.look.x, dx / d, 0.15); this.look.y = lerp(this.look.y, dy / d, 0.15);
      }
      if (Math.random() < dt * 1.2) burst('ash', this.cx + rnd(-6, 6), this.cy + 6, { count: 1, color: SF.ash });
    }
    deathFx(hit) {
      const d = (hit && hit.dir) || { x: 0, y: -1 };
      const ang = Math.atan2(d.y || -0.6, d.x || 0);
      burst('flash', this.cx, this.cy, { r: 30, color: SF.emberHot, life: 0.12 });
      burst('ash', this.cx, this.cy, { count: 18, color: SF.ash, speed: 200 });
      burst('smoke', this.cx, this.cy, { count: 7, color: '#2a2220', alpha: 0.55, size: 9 });
      burst('ember', this.cx, this.cy, { count: 7, color: SF.ember, speed: 240, angle: ang, spread: 2.6 });
    }
    drawBounds() { return { x: this.x - 34, y: this.y - 30, w: this.w + 68, h: this.h + 60 }; }
    drawBody(ctx, t) { drawSprite(ctx, this.cx, this.cy, this.facing, t, { puff: this.puff, seed: this.seed, vx: this.vx, vy: this.vy, look: this.look, tele: this.telegraphing }); }
    drawCorpse(ctx, t) { drawSprite(ctx, this.cx, this.cy, this.facing, t, { puff: 0, seed: this.seed, vx: 0, vy: 0, look: this.look, dead: Math.min(1, (this.deathT || 0) * 1.6) }); }
    drawPuddle(ctx, x, y, p) { ashHeap(ctx, x, y, p, 10, this.seed, { embers: 0.8 }); }
  }

  /** Soot sprite at centre (x, y). s: {puff 0..1, seed, vx, vy, look {x,y}, dead 0..1}. */
  function drawSprite(ctx, x, y, f, t, s) {
    const C = CH();
    const dead = s.dead || 0, puff = s.puff || 0, seed = s.seed || 0;
    const sc = (1 + puff * 0.34 + Math.sin(t * 9 + seed) * 0.03) * (1 - dead * 0.45);
    const R = 10.5 * sc;
    const body = dead ? '#3a302c' : SF.soot;
    // trailing wisps opposite to the motion
    const sp = Math.hypot(s.vx || 0, s.vy || 0);
    const tx = sp > 20 ? -s.vx / sp : 0, ty = sp > 20 ? -s.vy / sp : 0.5;
    const tl = 0.35 + Math.min(1, sp / 160) * 0.65;
    for (let i = 3; i >= 1; i--) {
      const d = R * (0.55 + i * 0.6) * tl, wob = Math.sin(t * 7 + i * 1.9 + seed) * 2.5;
      ctx.globalAlpha = (0.55 - i * 0.12) * (1 - dead);
      ctx.fillStyle = body;
      ctx.beginPath(); ctx.arc(x + tx * d - ty * wob, y + ty * d + tx * wob, R * (0.62 - i * 0.12), 0, TAU); ctx.fill();
    }
    ctx.globalAlpha = 1;
    // inner ember glow (behind the fluff, shows through the gaps)
    if (!dead) glow(ctx, x, y + R * 0.2, R * (1.6 + puff * 1.1), SF.ember, 0.16 + puff * 0.42);
    // boiling fluff lobes
    const N = 9, L = [];
    for (let i = 0; i < N; i++) {
      const a = (i / N) * TAU + Math.sin(t * 2.6 + i * 1.3 + seed) * 0.16;
      const dd = R * 0.55 * (0.82 + 0.34 * h01(i, seed));
      const r = R * (0.5 + 0.2 * h01(i + 9, seed)) * (1 + 0.1 * Math.sin(t * 8 + i * 1.7 + seed));
      L.push(x + Math.cos(a) * dd, y + Math.sin(a) * dd * 0.92, r, a);
    }
    ctx.fillStyle = SF.outline;
    for (let i = 0; i < L.length; i += 4) { ctx.beginPath(); ctx.arc(L[i], L[i + 1], L[i + 2] + 1.8, 0, TAU); ctx.fill(); }
    ctx.fillStyle = body;
    for (let i = 0; i < L.length; i += 4) { ctx.beginPath(); ctx.arc(L[i], L[i + 1], L[i + 2], 0, TAU); ctx.fill(); }
    ctx.beginPath(); ctx.arc(x, y, R * 0.78, 0, TAU); ctx.fill();
    // soft top highlight (light from above-left) and ember underglow on the lower lobes
    for (let i = 0; i < L.length; i += 4) {
      const a = L[i + 3], r = L[i + 2], sy = Math.sin(a), cxa = Math.cos(a);
      if (sy < -0.15 && cxa < 0.6) {
        ctx.fillStyle = dead ? '#5c524d' : SF.sootHi;
        ctx.beginPath(); ctx.arc(L[i] - r * 0.22, L[i + 1] - r * 0.3, r * 0.5, 0, TAU); ctx.fill();
      } else if (sy > 0.35 && !dead) {
        ctx.fillStyle = 'rgba(255,122,46,' + (0.22 + puff * 0.45).toFixed(3) + ')';
        ctx.beginPath(); ctx.arc(L[i] + r * 0.1, L[i + 1] + r * 0.35, r * 0.45, 0, Math.PI); ctx.fill();
      }
    }
    // embers glowing through cracks while it swells
    if (puff > 0.05 && !dead) {
      ctx.fillStyle = SF.emberHot;
      for (let i = 0; i < 5; i++) {
        const a = h01(i + 20, seed) * TAU + t * 0.8, d = R * (0.35 + 0.45 * h01(i + 30, seed));
        ctx.globalAlpha = puff * (0.5 + 0.5 * Math.sin(t * 20 + i * 2));
        ctx.beginPath(); ctx.arc(x + Math.cos(a) * d, y + Math.sin(a) * d, 1.2 + puff, 0, TAU); ctx.fill();
      }
      ctx.globalAlpha = 1;
    }
    // orbiting ember specks
    if (!dead) {
      for (let i = 0; i < 2; i++) {
        const a = t * (2.2 + i * 0.7) + seed + i * 3;
        const ex = x + Math.cos(a) * R * 1.35, ey = y + Math.sin(a) * R * 0.9 - 2;
        ctx.fillStyle = SF.emberHot;
        ctx.beginPath(); ctx.arc(ex, ey, 1.1, 0, TAU); ctx.fill();
        glow(ctx, ex, ey, 5, SF.ember, 0.35);
      }
    }
    // eyes: two slanted ember slits (angry), looking toward the Wickling
    const lk = s.look || { x: 0, y: 0 };
    const ex = x + lk.x * 2.6 + f * 0.8, ey = y - R * 0.1 + lk.y * 1.8;
    if (dead) {
      ctx.strokeStyle = SF.outline; ctx.lineWidth = 1.5;
      for (const sd of [-1, 1]) { ctx.beginPath(); ctx.moveTo(ex + sd * 4.5 - 2, ey - 1); ctx.lineTo(ex + sd * 4.5 + 2, ey + 1); ctx.stroke(); }
    } else {
      emberEyes(ctx, ex, ey, 9.5 * sc, 3.1 * sc, { color: puff > 0.5 ? '#ffd890' : '#ff8a3a', blink: C && C.blinkAt ? C.blinkAt(t, seed) : 0, look: lk.x * 2, brow: body, angry: 0.35 + puff * 0.3 });
    }
  }
  G.registerEnemy('soot_sprite', SootSprite);

  // =====================================================================================================
  // chimney_crawler  (+ projectile 'crawler_ash')
  // =====================================================================================================
  const CC = { brick: '#5c2b20', brickB: '#6e3626', brickC: '#4a221a', mortar: '#160d0b', soot: 'rgba(18,12,10,0.62)', pot: '#4a2b22', potHi: '#7a4a38', potBand: '#2a1814', leg: '#1d1411', legNear: '#2c1f1a', head: '#1f1714' };

  class ChimneyCrawler extends G.Enemy {
    constructor(props) {
      super(props, {
        hp: 26, w: 30, h: 30,
        physics: 'manual',
        cinders: [5, 8],
        weight: 1.5,
        sight: 9 * TILE,
        colors: { body: CC.brick, dark: CC.mortar, hit: '#ffe2cc', smoke: '#3a302c', puddle: SF.ashDark, tele: SF.tele },
        light: { r: 40, color: SF.ember, intensity: 0.22, flicker: true },
        puddleW: 18,
      });
      this.puddleWick = false;
      this.speed = props.speed || 44;
      this.walk = Math.random() * TAU;
      this.hurtT = 0;
      this.inflate = 0;
      this.recoil = 0;
    }
    init() { super.init(); this.crawlDir = this.facing; this.setState('crawl'); this.cooldown('spit', rnd(1, 2)); }
    /** Outward surface normal (away from the surface it clings to). */
    normal() { const s = this.surf || { x: 0, y: 1 }; return { x: -s.x, y: -s.y }; }
    eye() { const n = this.normal(); return { x: this.cx + n.x * 12, y: this.cy + n.y * 12 }; }
    /** World position of a point in the crawler's local drawing frame (centre origin, +y toward the surface). */
    toWorld(lx, ly) {
      const a = this.crawlAngle || 0, ca = Math.cos(a), sa = Math.sin(a);
      const vx = (this.crawlVis && this.crawlVis.x) || 0, vy = (this.crawlVis && this.crawlVis.y) || 0;
      return { x: this.cx + vx + lx * ca - ly * sa, y: this.cy + vy + lx * sa + ly * ca };
    }
    potMouth() { return this.toWorld(-4 * this.facing, -21 - this.inflate * 3); }
    /** Exit zones, beat (props.range tiles from home on either axis) and hazard tiles are off limits. */
    offLimits() {
      if (inZone(this, this.cx, this.cy)) return true;
      const rg = +this.props.range;
      if (rg > 0 && this.home && (Math.abs(this.cx - this.home.x) > rg * TILE || Math.abs(this.cy - this.home.y) > rg * TILE)) return true;
      return hazardAt(this, this.cx, this.cy);
    }
    /** The Wickling is in the half-space in front of the surface (not behind the wall it clings to) and in sight. */
    seesTarget() {
      const p = this.player;
      if (!this.targetable(p) || !this.surf) return false;
      const n = this.normal(), e = this.eye(), pc = pCenter(p);
      const vx = pc.x - e.x, vy = pc.y - e.y, d = Math.hypot(vx, vy) || 1;
      if ((vx * n.x + vy * n.y) / d < -0.05) return false;           // never at a target behind its own surface
      return this.canSee(p, this.sight);
    }
    think(dt) {
      if (this.hurtT > 0) this.hurtT -= dt;
      if (this.recoil > 0) this.recoil = Math.max(0, this.recoil - dt * 3);
      const p = this.player;
      switch (this.state) {
        case 'crawl': {
          const px = this.x, py = this.y, ps = this.surf, was = this.surf ? this.offLimits() : true;
          this.crawl(this.speed, dt);
          if (!was && this.surf && ps && this.offLimits()) {     // leash: step back and turn around
            this.x = px; this.y = py; this.surf = ps; this.crawlDir = -this.crawlDir;
            this.facing = this.localFacing();
          }
          this.walk += this.speed * dt * 0.26;
          if (this.ready('spit') && this.stateTime > 0.6 && this.surf && !playerInZone(this) && this.seesTarget()) this.setState('inflate');
          break;
        }
        case 'inflate': {                                      // TELEGRAPH: stops, mortar glows, shell swells, pot smokes
          if (this.once('tele')) { const m = this.potMouth(); this.stateData.w = this.telegraph(0.55, { x: m.x, y: m.y, shake: 1.4, color: SF.tele, vol: 0.7 }); }
          if (this.every(0.12)) { const m = this.potMouth(); burst('smoke', m.x, m.y, { count: 1, color: '#2a2220', alpha: 0.4, size: 5 }); }
          if (this.stateTime >= this.stateData.w) {
            const m = this.potMouth();
            if (this.targetable(p)) {
              this.shootAt('crawler_ash', p, { speed: 255, x: m.x, y: m.y, destroyable: true, sound: false });
              G.sfxAt('ash_spit', this.cx, { vol: 0.8 });
              const n = this.normal();
              burst('ash', m.x, m.y, { count: 8, color: SF.ash, speed: 160, angle: Math.atan2(n.y, n.x), spread: 1.2 });
              burst('smoke', m.x, m.y, { count: 3, color: '#2a2220', alpha: 0.5, size: 8 });
            }
            this.recoil = 1;
            this.cooldown('spit', rnd(2.8, 3.6));
            this.setState('spat');
          }
          break;
        }
        case 'spat':                                           // recovery: punishable, deflates
          if (this.stateTime > 0.55) this.setState('crawl');
          break;
        default: this.setState('crawl');
      }
      this.inflate = toward(this.inflate, this.is('inflate') ? 1 : 0, dt * (this.is('inflate') ? 2.2 : 5));
    }
    onHurt() { this.hurtT = 0.2; }
    deathFx(hit) {
      const d = (hit && hit.dir) || { x: 0, y: -1 };
      const ang = Math.atan2(d.y || -0.6, d.x || 0);
      burst('flash', this.cx, this.cy, { r: 40, color: SF.emberHot, life: 0.12 });
      burst('shard', this.cx, this.cy, { count: 8, color: CC.brickB, speed: 300, angle: ang, spread: 2.4 });
      burst('ash', this.cx, this.cy, { count: 14, color: SF.ash, speed: 200 });
      burst('smoke', this.cx, this.cy, { count: 7, color: '#2a2220', alpha: 0.5, size: 10 });
      burst('ember', this.cx, this.cy, { count: 6, color: SF.ember, speed: 220 });
    }
    drawBounds() { return { x: this.x - 34, y: this.y - 44, w: this.w + 68, h: this.h + 88 }; }
    drawBody(ctx, t) {
      ctx.save();
      const c = this.crawlTransform(ctx);
      const tip = drawCrawler(ctx, this.facing, t, { walk: this.walk, hurt: this.hurtT, inflate: this.inflate, recoil: this.recoil, seed: this.seed, dead: !!this.dying, tele: this.telegraphing });
      ctx.restore();
      if (!this.dying && tip && CH()) {                       // smoke rises in world space from the pot
        const a = this.crawlAngle, ca = Math.cos(a), sa = Math.sin(a);
        CH().pallSmoke(ctx, c.x + tip[0] * ca - tip[1] * sa, c.y + tip[0] * sa + tip[1] * ca, t, { count: 3, height: 30 + this.inflate * 20, spread: 5, size: 4, alpha: 0.3 + this.inflate * 0.2, seed: this.seed, color: '#3a302c', drift: 0 });
      }
    }
    drawPuddle(ctx, x, y, p) {
      ashHeap(ctx, x, y, p, 17, this.seed, { embers: 0.6 });
      // a few broken bricks and the cracked pot in the ash
      for (let i = 0; i < 3; i++) {
        const bx = x + (h01(i + 40, this.seed) - 0.5) * 26 * (0.5 + p * 0.5), by = y - 2;
        ctx.save(); ctx.translate(bx, by); ctx.rotate((h01(i + 50, this.seed) - 0.5) * 0.8);
        ctx.fillStyle = SF.outline; ctx.fillRect(-5, -4, 10, 5);
        ctx.fillStyle = i === 1 ? CC.pot : CC.brickB; ctx.fillRect(-4, -3, 8, 3);
        ctx.restore();
      }
    }
  }

  /** Crawler art in its local frame: centre (0,0), local floor at +15, facing f along +x. Returns the pot tip [x,y]. */
  function drawCrawler(ctx, f, t, s) {
    const inf = s.inflate || 0, dead = s.dead, seed = s.seed || 0;
    const pulse = inf > 0 ? Math.sin(t * 26) * 0.03 * inf : 0;
    const sq = 1 + inf * 0.2 + pulse - (s.recoil || 0) * 0.12 - (s.hurt > 0 ? 0.08 : 0);
    const wid = 17 * (1 + inf * 0.1 + (s.hurt > 0 ? 0.06 : 0));
    const base = 9, top = base - 25 * sq;
    ctx.save();
    ctx.scale(f, 1);
    ctx.lineCap = 'round'; ctx.lineJoin = 'round';
    // legs: three pairs, far ones first (darker), jointed, stepping
    const walk = dead ? 0 : s.walk || 0;
    for (let pass = 0; pass < 2; pass++) {
      for (let i = 0; i < 3; i++) {
        const bx = -9 + i * 9 + (pass ? 2 : -2);
        const ph = walk * 2 + i * 2.1 + pass * Math.PI;
        const lift = dead ? 0 : Math.max(0, Math.sin(ph)) * 3.5;
        const fx = bx + 6 + Math.cos(ph) * 3.5, fy = 15 - lift;
        const kx = bx + 9 + (pass ? 1 : 0), ky = base - 3 - lift * 0.5;
        ctx.strokeStyle = SF.outline; ctx.lineWidth = 5;
        ctx.beginPath(); ctx.moveTo(bx, base - 2); ctx.lineTo(kx, ky); ctx.lineTo(fx, fy); ctx.stroke();
        ctx.strokeStyle = pass ? CC.legNear : CC.leg; ctx.lineWidth = 2.6;
        ctx.beginPath(); ctx.moveTo(bx, base - 2); ctx.lineTo(kx, ky); ctx.lineTo(fx, fy); ctx.stroke();
        if (pass) { ctx.fillStyle = '#6a4a3c'; ctx.beginPath(); ctx.arc(kx, ky, 1.1, 0, TAU); ctx.fill(); }
      }
    }
    // head peeking from under the front of the shell: soot-black, ember eyes, little mandibles
    const hx = wid + 1, hy = base - 3;
    ctx.fillStyle = SF.outline;
    ctx.beginPath(); ctx.ellipse(hx, hy, 10.5, 8.5, 0, 0, TAU); ctx.fill();
    ctx.fillStyle = CC.head;
    ctx.beginPath(); ctx.ellipse(hx, hy, 9, 7, 0, 0, TAU); ctx.fill();
    ctx.fillStyle = '#3a2c26';
    ctx.beginPath(); ctx.ellipse(hx - 1, hy - 3.5, 5.5, 2.4, 0, 0, TAU); ctx.fill();
    ctx.strokeStyle = SF.outline; ctx.lineWidth = 2;
    const mo = dead ? 0 : (inf > 0.2 ? 1 : 0.4 + 0.3 * Math.sin(t * 6 + seed));
    ctx.beginPath(); ctx.moveTo(hx + 7, hy + 2); ctx.quadraticCurveTo(hx + 13, hy + 2 + mo, hx + 10, hy + 7 + mo * 2); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(hx + 4, hy + 4); ctx.quadraticCurveTo(hx + 9, hy + 6 + mo, hx + 5, hy + 10 + mo * 2); ctx.stroke();
    // shell: a dome of soot-black bricks
    const path = new Path2D();
    path.moveTo(-wid - 1, base + 1);
    path.ellipse(0, base, wid, base - top, 0, Math.PI, TAU);
    path.lineTo(wid + 1, base + 1);
    path.quadraticCurveTo(0, base + 4, -wid - 1, base + 1);
    path.closePath();
    ctx.fillStyle = CC.brick; ctx.fill(path);
    ctx.save();
    ctx.clip(path);
    const rowH = 5.5, bw = 9;
    let row = 0;
    for (let y = base; y > top - rowH; y -= rowH, row++) {
      const off = (row % 2) * bw * 0.5;
      for (let x = -wid - bw; x < wid + bw; x += bw) {
        const k = h01(row * 13 + Math.round(x), seed);
        ctx.fillStyle = k < 0.33 ? CC.brickB : k < 0.66 ? CC.brick : CC.brickC;
        ctx.fillRect(x + off + 0.6, y - rowH + 0.6, bw - 1.2, rowH - 1.2);
      }
    }
    // mortar glows hot while it inflates
    ctx.fillStyle = inf > 0.02 ? 'rgba(255,' + Math.round(110 + inf * 70) + ',50,' + (0.25 + inf * 0.6).toFixed(3) + ')' : CC.mortar;
    row = 0;
    for (let y = base; y > top - rowH; y -= rowH, row++) {
      ctx.fillRect(-wid - 2, y - 0.7, wid * 2 + 4, 1.4);
      const off = (row % 2) * bw * 0.5;
      for (let x = -wid - bw; x < wid + bw; x += bw) ctx.fillRect(x + off - 0.6, y - rowH, 1.2, rowH);
    }
    // soot crust darkening the crown (gets blacker toward the pot)
    ctx.fillStyle = 'rgba(18,12,10,0.38)';
    ctx.beginPath(); ctx.ellipse(-3, top + 2, wid * 0.85, (base - top) * 0.5, 0, 0, TAU); ctx.fill();
    ctx.fillStyle = 'rgba(12,8,7,0.42)';
    ctx.beginPath(); ctx.ellipse(-4, top - 1, wid * 0.45, (base - top) * 0.28, 0, 0, TAU); ctx.fill();
    // ember-lit underside rim
    ctx.fillStyle = 'rgba(255,120,50,' + (0.16 + inf * 0.25).toFixed(3) + ')';
    ctx.fillRect(-wid, base - 3, wid * 2, 3);
    ctx.restore();
    ctx.strokeStyle = SF.outline; ctx.lineWidth = 2; ctx.stroke(path);
    // rim light on the upper-back of the dome (warm, from the region's glow)
    ctx.strokeStyle = 'rgba(232,150,104,0.6)'; ctx.lineWidth = 1.6;
    ctx.beginPath(); ctx.ellipse(0, base, wid - 1.8, base - top - 1.8, 0, Math.PI * 1.06, Math.PI * 1.94); ctx.stroke();
    // eyes
    const C = CH();
    if (dead) {
      ctx.strokeStyle = '#5a3a2c'; ctx.lineWidth = 1.4;
      ctx.beginPath(); ctx.moveTo(hx + 1, hy - 2); ctx.lineTo(hx + 5, hy - 1); ctx.stroke();
    } else if (C && C.eyes) {
      emberEyes(ctx, hx + 3, hy - 0.5, 7, 2.1 + inf * 0.5, { color: inf > 0.5 ? '#ffd890' : '#ff8a3a', blink: C.blinkAt ? C.blinkAt(t, seed + 3) : 0, look: 1, brow: CC.head, angry: 0.5 });
    }
    // chimney pot on its back (slightly behind the crown), flared lip, ember mouth
    const px = -4, pb = top + 5, ph = 10 + inf * 2, pw = 5.2;
    const pt = pb - ph;
    ctx.fillStyle = SF.outline;
    ctx.beginPath();
    ctx.moveTo(px - pw - 1.5, pb + 1); ctx.lineTo(px - pw + 0.5 - 1.5, pt + 2); ctx.lineTo(px - pw - 3, pt); ctx.lineTo(px - pw - 3, pt - 4.5);
    ctx.lineTo(px + pw + 3, pt - 4.5); ctx.lineTo(px + pw + 3, pt); ctx.lineTo(px + pw - 0.5 + 1.5, pt + 2); ctx.lineTo(px + pw + 1.5, pb + 1);
    ctx.closePath(); ctx.fill();
    ctx.fillStyle = CC.pot;
    ctx.beginPath();
    ctx.moveTo(px - pw, pb); ctx.lineTo(px - pw + 0.8, pt + 1.5); ctx.lineTo(px - pw - 1.6, pt); ctx.lineTo(px - pw - 1.6, pt - 3);
    ctx.lineTo(px + pw + 1.6, pt - 3); ctx.lineTo(px + pw + 1.6, pt); ctx.lineTo(px + pw - 0.8, pt + 1.5); ctx.lineTo(px + pw, pb);
    ctx.closePath(); ctx.fill();
    ctx.fillStyle = CC.potHi; ctx.fillRect(px - pw + 1, pt + 2, 1.6, ph - 3);
    ctx.fillStyle = CC.potBand; ctx.fillRect(px - pw, pt + ph * 0.55, pw * 2, 1.6);
    // mouth: dark with ember glow, hot when inflated
    ctx.fillStyle = '#0a0605';
    ctx.beginPath(); ctx.ellipse(px, pt - 3, pw + 0.6, 1.8, 0, 0, TAU); ctx.fill();
    if (!dead) {
      ctx.fillStyle = inf > 0.3 ? SF.emberHot : SF.ember;
      ctx.beginPath(); ctx.ellipse(px, pt - 2.6, (pw - 1) * (0.5 + inf * 0.5), 1, 0, 0, TAU); ctx.fill();
      glow(ctx, px * f, pt - 3, 10 + inf * 16, SF.ember, 0.25 + inf * 0.5);
    }
    ctx.restore();
    return [px * f, pt - 5];
  }

  /** Ash ball: a clot of soot with an ember heart and a smoky trail. The Brand can pop it. */
  class CrawlerAsh extends G.Projectile {
    draw(ctx, t) {
      const tr = this.trail, r = this.r;
      for (let i = 0; i < tr.length; i += 2) {
        const k = i / tr.length;
        ctx.globalAlpha = 0.08 + 0.3 * k;
        ctx.fillStyle = '#4a3e38';
        ctx.beginPath(); ctx.arc(tr[i], tr[i + 1], r * (0.4 + 0.6 * k), 0, TAU); ctx.fill();
      }
      ctx.globalAlpha = 1;
      glow(ctx, this.cx, this.cy, r * 3.2, SF.ember, 0.45);
      const sp = this.seed || 0;
      ctx.fillStyle = SF.outline;
      ctx.beginPath(); ctx.arc(this.cx, this.cy, r + 1.8, 0, TAU); ctx.fill();
      for (let i = 0; i < 6; i++) {
        const a = (i / 6) * TAU + t * 3 + sp, rr = r * (0.42 + 0.12 * Math.sin(t * 11 + i * 2 + sp));
        ctx.fillStyle = i % 2 ? '#3a302c' : '#2a221f';
        ctx.beginPath(); ctx.arc(this.cx + Math.cos(a) * r * 0.5, this.cy + Math.sin(a) * r * 0.5, rr + 1.6, 0, TAU); ctx.fill();
      }
      ctx.fillStyle = '#7a6c64';
      ctx.beginPath(); ctx.arc(this.cx - r * 0.35, this.cy - r * 0.4, r * 0.35, 0, TAU); ctx.fill();
      ctx.fillStyle = SF.emberHot;
      ctx.beginPath(); ctx.arc(this.cx + r * 0.1, this.cy + r * 0.1, r * 0.32, 0, TAU); ctx.fill();
    }
    burstFx(why) {
      if (!G.fx) return;
      if (why === 'expire') return super.burstFx(why);
      burst('ash', this.cx, this.cy, { count: 12, color: SF.ash, speed: 200 });
      burst('smoke', this.cx, this.cy, { count: 3, color: '#2a2220', alpha: 0.5, size: 8 });
      burst('ember', this.cx, this.cy, { count: 3, color: SF.ember, speed: 160 });
      G.sfxAt('ash_spit', this.cx, { vol: 0.35, pitch: 1.4 });
    }
  }
  if (G.registerProjectile) G.registerProjectile('crawler_ash', CrawlerAsh, { r: 7, gravity: 0, life: 4, color: SF.ember, damage: 1, destroyable: true });
  G.registerEnemy('chimney_crawler', ChimneyCrawler);

  // =====================================================================================================
  // stoker  (+ projectile 'stoker_coal')
  // =====================================================================================================
  const SK = { wax: '#5f544d', waxHi: '#8c7f75', waxDark: '#2e2622', soot: 'rgba(16,11,9,0.6)', apron: '#3e2619', apronHi: '#5e3a26', stitch: '#8a6040', boot: '#1b1412', handle: '#5a3f2c', handleHi: '#86603f', iron: '#2d2b30', ironHi: '#5b5660', mask: '#251c19' };
  // Shovel poses: rear-hand grip (gx, gy) feet-relative (facing right, y up negative) and shaft angle a (0 = forward, + = down).
  const POSE = {
    carry: { gx: -1, gy: -31, a: 0.36, crouch: 0, lean: 0 },
    scoop: { gx: -8, gy: -24, a: 0.3, crouch: 1, lean: 0.4 },
    throw: { gx: 2, gy: -42, a: -1.05, crouch: 0, lean: -0.2 },
    raise: { gx: 2, gy: -52, a: -2.45, crouch: 0.25, lean: -0.55 },
    slam: { gx: 8, gy: -30, a: 0.42, crouch: 0.75, lean: 0.75 },
  };
  const SHAFT = 70, BLADE0 = 50;
  const SK_SCALE = 1.12;                                     // art drawn in the pose space, scaled up around the feet

  class Stoker extends G.Enemy {
    constructor(props) {
      super(props, {
        hp: 40, w: 48, h: 70,
        cinders: [8, 13],
        weight: 2.6,
        knockback: 300,
        sight: 9 * TILE,
        colors: { body: SK.wax, dark: SK.waxDark, hit: '#ffe8d8', smoke: '#4a403a', puddle: '#4e4540', tele: SF.tele },
        light: { r: 72, color: SF.ember, intensity: 0.34, dx: 30, dy: 26, flicker: true },
        puddleW: 30,
      });
      this.pose = Object.assign({}, POSE.carry);
      this.walk = Math.random() * TAU;
      this.coals = 0.25;
      this.lostT = 0;
      this.hurtT = 0;
    }
    init() { super.init(); this.setState('patrol'); this.cooldown('lob', rnd(0.6, 1.4)); }
    beat() { return propTiles(this, 'range', 5); }
    /** Can it take a step in dir: inside its beat, not into an exit zone (ledges/hazards/walls via blockedAhead). */
    canStep(dir) {
      const ax = this.cx + dir * (this.w / 2 + 14);
      if (inZone(this, ax, this.cy)) return false;
      if (this.home && Math.abs(ax - this.home.x) > this.beat() + TILE) return false;
      return !this.blockedAhead(dir);
    }
    sees(p) {
      if (!this.canSee(p)) return false;
      const dy = pCenter(p).y - this.cy;
      return dy > -5 * TILE && dy < 4 * TILE;
    }
    bladePos() {
      const P = this.pose, f = this.facing;
      const a = P.a, d = SHAFT - 8;
      return { x: this.cx + f * (P.gx + Math.cos(a) * d) * SK_SCALE, y: this.y + this.h + (P.gy + Math.sin(a) * d) * SK_SCALE };
    }
    think(dt) {
      const p = this.player;
      if (this.hurtT > 0) this.hurtT -= dt;
      let target = POSE.carry, rate = 6;
      switch (this.state) {
        case 'patrol': {
          if (this.grounded && !this.canStep(this.facing) && !this.blockedAhead(this.facing)) { this.facing = -this.facing; this.vx = 0; }
          this.patrol(30, { range: this.beat(), pause: 0.9 });
          if (this.stateTime > 0.4 && this.sees(p)) this.setState('notice');
          break;
        }
        case 'notice':
          this.stop(); this.face(p);
          if (this.once('grunt')) G.sfxAt('enemy_windup', this.cx, { vol: 0.35, pitch: 0.6 });
          if (this.stateTime > 0.4) this.setState('engage');
          break;
        case 'engage': {
          if (!this.targetable(p)) { this.setState('patrol'); break; }
          this.face(p);
          const adx = Math.abs(this.dx()), ady = this.dy();
          if (this.canSee(p, this.sight * 1.3)) this.lostT = 0; else this.lostT += dt;
          if (this.lostT > 3) { this.setState('patrol'); break; }
          if (adx < 2.5 * TILE && Math.abs(ady) < 1.9 * TILE && this.ready('swing')) { this.setState('swing'); break; }
          if (this.ready('lob') && (adx > 2.4 * TILE || ady < -2 * TILE) && adx < 10 * TILE && ady > -6 * TILE && ady < 4 * TILE && !playerInZone(this) && this.canSee(p, 11 * TILE)) { this.setState('scoop'); break; }
          if (adx > 1.7 * TILE && this.grounded && this.canStep(this.facing)) this.vx = this.facing * 36;
          else this.stop();
          break;
        }
        case 'scoop': {                                        // TELEGRAPH: crouches, digs the blade in, coals glow
          this.stop();
          target = POSE.scoop; rate = 9;
          if (this.once('tele')) {
            const b = this.bladePos();
            this.stateData.w = this.telegraph(0.55, { x: b.x, y: b.y - 8, shake: 1.6, color: SF.tele, vol: 0.75 });
            G.sfxAt('coal_hiss', b.x, { vol: 0.4, pitch: 0.7 });
          }
          if (this.telegraphing && this.every(0.1)) { const b = this.bladePos(); burst('ember', b.x, b.y - 6, { count: 1, color: SF.ember, speed: 60, angle: -Math.PI / 2, spread: 1 }); }
          const w = this.stateData.w;
          if (this.stateTime >= w) { target = POSE.throw; rate = 22; }
          if (this.at(w + 0.08)) this.throwCoals();
          if (this.stateTime > w + 0.7) { this.cooldown('lob', rnd(2.4, 3.2)); this.cooldown('swing', 0.3); this.setState('engage'); }
          break;
        }
        case 'swing': {                                        // TELEGRAPH: heaves the shovel high behind its head
          this.stop();
          if (this.once('tele')) this.stateData.w = this.telegraph(0.62, { shake: 2, color: SF.tele, vol: 0.9 });
          const w = this.stateData.w;
          target = POSE.raise; rate = 7;
          if (this.stateTime >= w) { target = POSE.slam; rate = 40; }
          if (this.at(w)) G.sfxAt('shovel_swing', this.cx, { vol: 0.9 });
          if (this.stateTime >= w + 0.04 && this.stateTime < w + 0.17) {
            const f = this.facing, x0 = f > 0 ? this.cx - 8 : this.cx - 2.4 * TILE + 8;
            this.strike({ x: x0, y: this.y - 0.4 * TILE, w: 2.4 * TILE, h: this.h + 0.4 * TILE }, { dir: { x: f, y: -0.3 } });
          }
          if (this.at(w + 0.1)) {
            const b = this.bladePos();
            G.sfxAt('shovel_slam', b.x, { vol: 1 });
            shake(5, 0.2);
            burst('dust', b.x, this.y + this.h, { count: 10, color: '#5a4a42' });
            burst('spark', b.x, this.y + this.h - 4, { count: 8, color: SF.emberHot, speed: 300, angle: -Math.PI / 2, spread: 2 });
            burst('ember', b.x, this.y + this.h - 6, { count: 5, color: SF.ember, speed: 200 });
          }
          if (this.stateTime > w + 0.1) { target = POSE.slam; rate = 40; }
          if (this.stateTime > w + 0.95) { this.cooldown('swing', 1.1); this.cooldown('lob', 0.8); this.setState('engage'); }
          break;
        }
        default: this.setState('patrol');
      }
      // pose follows the state (smoothed)
      const P = this.pose, k = Math.min(1, dt * rate);
      for (const key of ['gx', 'gy', 'a', 'crouch', 'lean']) P[key] = lerp(P[key], target[key], k);
      if (Math.abs(this.vx) > 5 && this.grounded) {
        const before = Math.sin(this.walk);
        this.walk += Math.abs(this.vx) * dt * 0.09;
        if ((before < 0) !== (Math.sin(this.walk) < 0)) { G.sfxAt('step', this.cx, { vol: 0.5, pitch: 0.55 }); burst('dust', this.cx, this.y + this.h, { count: 2, color: '#4a3e38' }); }
      }
      this.coals = toward(this.coals, this.is('scoop') && this.stateTime < (this.stateData.w || 0.55) ? 1 : (this.is('scoop') ? 0 : 0.25), dt * 3);
    }
    throwCoals() {
      const p = this.player;
      if (!this.targetable(p)) return;
      const b = this.bladePos(), pc = pCenter(p);
      const close = Math.abs(this.dx()) < 4 * TILE;
      const offs = close ? [-0.6, 0.6] : [-1.1, 0, 1.1];
      offs.forEach((o, i) => {
        const tx = pc.x + o * TILE * this.facing, time = 0.78 + i * 0.13;
        this.lob('stoker_coal', { x: tx - 1, y: pc.y - 1, w: 2, h: 2 }, { time, x: b.x, y: b.y - 8, destroyable: true, sound: false });
      });
      G.sfxAt('shovel_swing', this.cx, { vol: 0.55, pitch: 1.35 });
      burst('ember', b.x, b.y - 6, { count: 6, color: SF.emberHot, speed: 220, angle: -Math.PI / 2 - this.facing * 0.5, spread: 0.9 });
      this.coals = 0;
    }
    onHurt() { this.hurtT = 0.18; }
    drawBounds() { return { x: this.x - 80, y: this.y - 80, w: this.w + 160, h: this.h + 96 }; }
    drawBody(ctx, t) { this.drawScaled(ctx, t, false); }
    drawCorpse(ctx, t) { this.drawScaled(ctx, t, true); }
    drawScaled(ctx, t, dead) {
      const fx = this.cx, fy = this.y + this.h;
      ctx.save(); ctx.translate(fx, fy); ctx.scale(SK_SCALE, SK_SCALE); ctx.translate(-fx, -fy);
      drawStoker(ctx, fx, fy, this.facing, t, this, dead);
      ctx.restore();
    }
  }

  /** Stoker art: feet at (fx, fy), facing f. e = the enemy (pose, walk, coals, telegraphing, hurtT, vx, state). */
  function drawStoker(ctx, fx, fy, f, t, e, dead) {
    const C = CH();
    const P = e.pose, seed = e.seed || 0;
    const moving = Math.abs(e.vx) > 5 && !dead;
    const wk = e.walk || 0;
    const bob = moving ? Math.abs(Math.sin(wk)) * 2.2 : Math.sin(t * 1.6 + seed) * 0.8;
    const cr = P.crouch * 7, L = P.lean * 6;
    const hurt = e.hurtT > 0;
    const X = (x) => fx + f * x, Y = (y) => fy + y;
    const by = -bob * 0.5 + cr;                              // body drop (walk bob, crouch)
    ctx.lineCap = 'round'; ctx.lineJoin = 'round';
    const stroke = (pts, w, col) => {
      ctx.strokeStyle = col; ctx.lineWidth = w;
      ctx.beginPath(); ctx.moveTo(X(pts[0].x), Y(pts[0].y));
      for (let i = 1; i < pts.length; i++) ctx.lineTo(X(pts[i].x), Y(pts[i].y));
      ctx.stroke();
    };
    /** Two-segment limb; the elbow bends backward/down, away from the facing. */
    const limb = (s, h, w, col, glove) => {
      const dx = h.x - s.x, dy = h.y - s.y, d = Math.hypot(dx, dy) || 1;
      let px = -dy / d, py = dx / d;
      if (px > 0 || (Math.abs(px) < 0.2 && py < 0)) { px = -px; py = -py; }
      const bend = Math.max(2, 30 - d) * 0.55;
      const el = { x: (s.x + h.x) / 2 + px * bend, y: (s.y + h.y) / 2 + py * bend };
      stroke([s, el, h], w + 3.5, SF.outline);
      stroke([s, el], w, col);
      stroke([el, h], w - 1, glove);
      const cx = el.x + (h.x - el.x) * 0.3, cy = el.y + (h.y - el.y) * 0.3;  // glove cuff
      stroke([{ x: cx, y: cy }, { x: cx + (h.x - el.x) * 0.08, y: cy + (h.y - el.y) * 0.08 }], w + 1.5, '#4a3a30');
      return el;
    };
    if (C && C.shadow) C.shadow(ctx, fx, fy, 28, 0.45);
    const g = { x: P.gx, y: P.gy + by * 0.6 }, a = P.a, ca = Math.cos(a), sa = Math.sin(a);
    const at = (d) => ({ x: g.x + ca * d, y: g.y + sa * d });
    const hand2 = at(20);
    const shF = { x: -5 + L * 0.5, y: -53 + by }, shN = { x: 8 + L, y: -51 + by };
    // far arm (mostly hidden behind the hulk)
    limb(shF, g, 9, SK.waxDark, '#1c1512');
    // legs: short, thick, bowed; heavy boots
    const step = moving ? Math.sin(wk) * 5 : 0;
    for (const [lx, sgn] of [[-9, 1], [9, -1]]) {
      const footX = lx + step * sgn, kneeY = -12 + cr * 0.6;
      const pts = [{ x: lx * 0.7, y: -20 + by }, { x: footX + 2, y: kneeY }, { x: footX, y: -4 }];
      stroke(pts, 14, SF.outline);
      stroke(pts, 10.5, sgn > 0 ? SK.waxDark : '#3e342f');
      ctx.fillStyle = SF.outline;
      ctx.beginPath(); ctx.moveTo(X(footX - 7), Y(0.5)); ctx.lineTo(X(footX - 6.5), Y(-8.5)); ctx.lineTo(X(footX + 6), Y(-8.5)); ctx.quadraticCurveTo(X(footX + 12), Y(-7), X(footX + 12), Y(0.5)); ctx.closePath(); ctx.fill();
      ctx.fillStyle = SK.boot;
      ctx.beginPath(); ctx.moveTo(X(footX - 5.5), Y(-1)); ctx.lineTo(X(footX - 5), Y(-7)); ctx.lineTo(X(footX + 5.5), Y(-7)); ctx.quadraticCurveTo(X(footX + 10.5), Y(-5.5), X(footX + 10.5), Y(-1)); ctx.closePath(); ctx.fill();
    }
    // torso: a gorilla hunch - hump high behind, shoulders thrust forward, a heavy belly
    const tp = new Path2D();
    tp.moveTo(X(-15), Y(-16 + by));
    tp.bezierCurveTo(X(-27), Y(-28 + by), X(-28 - L * 0.3), Y(-52 + by), X(-16 + L * 0.3), Y(-62 + by));
    tp.bezierCurveTo(X(-8 + L * 0.6), Y(-70 + by), X(6 + L), Y(-68 + by), X(12 + L), Y(-60 + by));
    tp.bezierCurveTo(X(19 + L), Y(-55 + by), X(21 + L * 0.7), Y(-44 + by), X(20 + L * 0.5), Y(-36 + by));
    tp.bezierCurveTo(X(24), Y(-28 + by), X(22), Y(-17 + by), X(14), Y(-13 + by));
    tp.quadraticCurveTo(X(0), Y(-8 + by), X(-15), Y(-16 + by));
    tp.closePath();
    const bx0 = Math.min(X(-28), X(24)), bx1 = Math.max(X(-28), X(24));
    if (C && C.shape) C.shape(ctx, tp, { fill: hurt ? '#776a62' : SK.wax, box: [bx0, fy - 70 + by, bx1, fy - 10 + by], light: f, rim: SF.rim, rimWidth: 2.4, shade: 0.5, hi: 0.12 });
    else { ctx.fillStyle = SK.wax; ctx.fill(tp); }
    ctx.save(); ctx.clip(tp);
    // soot caked over the hump; pale wax rubbed through on the shoulder; wax drips running down the back
    ctx.fillStyle = SK.soot;
    ctx.beginPath(); ctx.ellipse(X(-14 + L * 0.3), Y(-58 + by), 17, 13, 0, 0, TAU); ctx.fill();
    ctx.beginPath(); ctx.ellipse(X(-20), Y(-34 + by), 8, 16, 0, 0, TAU); ctx.fill();
    ctx.fillStyle = 'rgba(176,160,146,0.35)';
    ctx.beginPath(); ctx.ellipse(X(4 + L), Y(-60 + by), 7, 4, f * -0.3, 0, TAU); ctx.fill();
    ctx.strokeStyle = 'rgba(150,136,124,0.32)'; ctx.lineWidth = 1.8;
    for (let i = 0; i < 2; i++) {
      const sx = -21 + i * 8, y0 = -60 + by + i * 2, len = 9 + h01(i, seed) * 12;
      ctx.beginPath(); ctx.moveTo(X(sx), Y(y0)); ctx.lineTo(X(sx - 0.5), Y(y0 + len)); ctx.stroke();
      ctx.fillStyle = 'rgba(150,136,124,0.4)';
      ctx.beginPath(); ctx.arc(X(sx - 0.5), Y(y0 + len + 1), 1.8, 0, TAU); ctx.fill();
    }
    ctx.restore();
    // apron: stiff leather from a neck strap down past the belly; a stitched pocket
    const swing = moving ? Math.sin(wk) * 1.5 : 0;
    const ap = new Path2D();
    ap.moveTo(X(6 + L * 0.7), Y(-45 + by));
    ap.lineTo(X(19 + L * 0.6), Y(-43 + by));
    ap.quadraticCurveTo(X(25), Y(-26 + by), X(22 + swing), Y(-7 + cr * 0.3));
    ap.lineTo(X(2 + swing * 0.5), Y(-8 + cr * 0.3));
    ap.quadraticCurveTo(X(3), Y(-28 + by), X(6 + L * 0.7), Y(-45 + by));
    ap.closePath();
    ctx.fillStyle = SK.apron; ctx.fill(ap);
    ctx.strokeStyle = SF.outline; ctx.lineWidth = 2; ctx.stroke(ap);
    ctx.strokeStyle = SK.apronHi; ctx.lineWidth = 1.3;
    ctx.beginPath(); ctx.moveTo(X(18.5 + L * 0.6), Y(-41 + by)); ctx.quadraticCurveTo(X(23), Y(-26 + by), X(20.5 + swing), Y(-10 + cr * 0.3)); ctx.stroke();
    ctx.setLineDash([2, 2.5]); ctx.strokeStyle = SK.stitch; ctx.lineWidth = 1;
    ctx.beginPath(); ctx.moveTo(X(3), Y(-10.5 + cr * 0.3)); ctx.lineTo(X(20), Y(-9.5 + cr * 0.3)); ctx.stroke();
    ctx.setLineDash([]);
    ctx.strokeStyle = SK.apron; ctx.lineWidth = 2.4;                   // neck strap
    ctx.beginPath(); ctx.moveTo(X(7 + L * 0.7), Y(-44 + by)); ctx.lineTo(X(11 + L), Y(-57 + by)); ctx.stroke();
    // head: a melted candle stub jutting forward under the hump, soot-rag mask, slanted ember eyes, charred wick
    const hx = 20 + L * 1.1, hy = -49 + by + P.crouch * 3;
    const hp = new Path2D();
    hp.moveTo(X(hx - 9), Y(hy + 8));
    hp.lineTo(X(hx - 9.5), Y(hy - 4));
    hp.quadraticCurveTo(X(hx - 9), Y(hy - 10), X(hx - 1), Y(hy - 10.5));
    hp.quadraticCurveTo(X(hx + 6), Y(hy - 11), X(hx + 8), Y(hy - 7.5));
    hp.lineTo(X(hx + 9.5), Y(hy - 4));
    hp.lineTo(X(hx + 9.5), Y(hy + 8));
    hp.closePath();
    if (C && C.shape) C.shape(ctx, hp, { fill: dead ? '#55504c' : '#857870', box: [Math.min(X(hx - 9.5), X(hx + 9.5)), Y(hy - 11), Math.max(X(hx - 9.5), X(hx + 9.5)), Y(hy + 8)], light: f, shade: 0.45, rim: SF.rim, rimWidth: 1.6 });
    else { ctx.fillStyle = '#857870'; ctx.fill(hp); }
    // a wax drip down the brow
    ctx.fillStyle = '#9a8c82';
    ctx.beginPath(); ctx.ellipse(X(hx - 4), Y(hy - 6), 1.6, 3.5, 0, 0, TAU); ctx.fill();
    ctx.fillStyle = SK.mask;
    ctx.beginPath(); ctx.moveTo(X(hx - 10), Y(hy + 1.5)); ctx.lineTo(X(hx + 10.5), Y(hy - 0.5)); ctx.lineTo(X(hx + 11), Y(hy + 9)); ctx.lineTo(X(hx - 10), Y(hy + 9)); ctx.closePath(); ctx.fill();
    ctx.strokeStyle = SF.outline; ctx.lineWidth = 1.6; ctx.stroke();
    ctx.strokeStyle = '#3e3029'; ctx.lineWidth = 1;
    ctx.beginPath(); ctx.moveTo(X(hx - 7), Y(hy + 4.5)); ctx.lineTo(X(hx + 9), Y(hy + 3)); ctx.moveTo(X(hx - 4), Y(hy + 7)); ctx.lineTo(X(hx + 9), Y(hy + 6)); ctx.stroke();
    ctx.fillStyle = SF.outline;                                          // heavy brow
    ctx.beginPath(); ctx.moveTo(X(hx - 4), Y(hy - 6.5)); ctx.lineTo(X(hx + 10.5), Y(hy - 3.5)); ctx.lineTo(X(hx + 10.5), Y(hy - 1.5)); ctx.lineTo(X(hx - 3), Y(hy - 4)); ctx.closePath(); ctx.fill();
    if (dead) {
      ctx.strokeStyle = '#3a2c26'; ctx.lineWidth = 1.6;
      ctx.beginPath(); ctx.moveTo(X(hx), Y(hy - 2)); ctx.lineTo(X(hx + 7), Y(hy - 1)); ctx.stroke();
    } else if (C && C.eyes) {
      C.eyes(ctx, X(hx + 3), Y(hy - 2), { kind: 'ember', size: 7.5 + (e.telegraphing ? 1.5 : 0), gap: 7, color: e.telegraphing ? '#ffd890' : '#ff8a3a', blink: C.blinkAt ? C.blinkAt(t, seed) : 0, tilt: 0.3 });
    }
    const wx = X(hx - 3), wy = Y(hy - 10.5);
    let tip = [wx + f * 6, wy - 7];
    if (C && C.wick) tip = C.wick(ctx, wx, wy, { len: 9, bend: f * 4, width: 3, color: '#151010', ember: !dead });
    if (!dead) {
      glow(ctx, tip[0], tip[1], 8, SF.ember, 0.5 + 0.2 * Math.sin(t * 7 + seed));
      if (C && C.pallSmoke) C.pallSmoke(ctx, tip[0], tip[1], t, { count: 3, height: 36, spread: 7, size: 4, alpha: 0.28, seed, color: '#3a302c' });
    }
    // the shovel: long ash-wood shaft, D-grip, broad iron scoop hot at the edge
    const s0 = at(-9), s1 = at(BLADE0 + 2);
    stroke([s0, s1], 7, SF.outline);
    stroke([s0, s1], 4.2, SK.handle);
    ctx.strokeStyle = SK.handleHi; ctx.lineWidth = 1.1;
    ctx.beginPath(); ctx.moveTo(X(s0.x), Y(s0.y - 1)); ctx.lineTo(X(s1.x), Y(s1.y - 1)); ctx.stroke();
    const nx = -sa, ny = ca;
    const b0 = at(BLADE0), b1 = at(SHAFT), bw = 11;
    const bp = new Path2D();
    bp.moveTo(X(b0.x + nx * bw * 0.6), Y(b0.y + ny * bw * 0.6));
    bp.lineTo(X(b1.x + nx * bw), Y(b1.y + ny * bw));
    bp.quadraticCurveTo(X(b1.x + ca * 5), Y(b1.y + sa * 5), X(b1.x - nx * bw), Y(b1.y - ny * bw));
    bp.lineTo(X(b0.x - nx * bw * 0.6), Y(b0.y - ny * bw * 0.6));
    bp.closePath();
    ctx.fillStyle = SK.iron; ctx.fill(bp);
    ctx.strokeStyle = SF.outline; ctx.lineWidth = 2.2; ctx.stroke(bp);
    ctx.strokeStyle = SK.ironHi; ctx.lineWidth = 1.3;
    ctx.beginPath(); ctx.moveTo(X(b0.x - nx * bw * 0.4), Y(b0.y - ny * bw * 0.4)); ctx.lineTo(X(b1.x - nx * bw * 0.75), Y(b1.y - ny * bw * 0.75)); ctx.stroke();
    ctx.fillStyle = SK.ironHi;                                           // rivets on the socket
    for (const k of [-0.35, 0.35]) { ctx.beginPath(); ctx.arc(X(b0.x + ca * 3 + nx * bw * k), Y(b0.y + sa * 3 + ny * bw * k), 1.1, 0, TAU); ctx.fill(); }
    ctx.strokeStyle = 'rgba(255,120,50,' + (0.4 + e.coals * 0.45).toFixed(3) + ')'; ctx.lineWidth = 2;
    ctx.beginPath(); ctx.moveTo(X(b1.x + nx * bw * 0.9), Y(b1.y + ny * bw * 0.9)); ctx.quadraticCurveTo(X(b1.x + ca * 5), Y(b1.y + sa * 5), X(b1.x - nx * bw * 0.9), Y(b1.y - ny * bw * 0.9)); ctx.stroke();
    if (!dead && e.coals > 0.05) {
      const n = Math.max(1, Math.round(e.coals * 5));
      const up = ny < 0 ? { x: nx, y: ny } : { x: -nx, y: -ny };
      for (let i = 0; i < n; i++) {
        const d = BLADE0 + 4 + (i / Math.max(1, n - 1)) * 13, q = at(d), o = 3 + (i % 2) * 2.5;
        const cx = X(q.x + up.x * o), cy = Y(q.y + up.y * o);
        ctx.fillStyle = '#1a0e0a';
        ctx.beginPath(); ctx.arc(cx, cy, 3.8, 0, TAU); ctx.fill();
        ctx.fillStyle = i % 2 ? SF.ember : SF.emberHot;
        ctx.beginPath(); ctx.arc(cx, cy, 2.3, 0, TAU); ctx.fill();
      }
      const mid = at(BLADE0 + 10);
      glow(ctx, X(mid.x), Y(mid.y) - 4, 18 + e.coals * 18, SF.ember, 0.3 + e.coals * 0.45);
    }
    // near arm over the shaft; fists
    limb(shN, hand2, 11, hurt ? '#7e7169' : SK.wax, '#2e2420');
    for (const h of [g, hand2]) {
      ctx.fillStyle = SF.outline; ctx.beginPath(); ctx.arc(X(h.x), Y(h.y), 6, 0, TAU); ctx.fill();
      ctx.fillStyle = h === g ? '#1c1512' : '#3a2e28'; ctx.beginPath(); ctx.arc(X(h.x), Y(h.y), 4.3, 0, TAU); ctx.fill();
    }
    // the slam's arc
    if (e.state === 'swing' && e.stateData && e.stateData.w != null) {
      const k = (e.stateTime - e.stateData.w) / 0.16;
      if (k > 0 && k < 1 && C && C.slash) C.slash(ctx, X(g.x), Y(g.y), SHAFT - 4, f > 0 ? -0.9 : Math.PI + 0.9, k, { arc: 2.2, width: 11, color: '#ffb070', core: '#fff0d0', alpha: 0.6, flip: f < 0 });
    }
  }

  /** A burning coal: tumbling black lump with glowing cracks; bursts into sparks. The Brand can pop it. */
  class StokerCoal extends G.Projectile {
    draw(ctx, t) {
      const tr = this.trail, r = this.r;
      for (let i = 0; i < tr.length; i += 2) {
        const k = i / tr.length;
        glow(ctx, tr[i], tr[i + 1], r * (0.6 + k), SF.ember, 0.05 + 0.18 * k);
      }
      glow(ctx, this.cx, this.cy, r * 3.4, SF.ember, 0.5);
      const rot = (this.age || 0) * 9 + (this.seed || 0);
      ctx.save();
      ctx.translate(this.cx, this.cy); ctx.rotate(rot);
      const pts = 7;
      ctx.beginPath();
      for (let i = 0; i < pts; i++) {
        const a = (i / pts) * TAU, rr = r * (0.82 + 0.3 * h01(i, this.seed || 0)) + 1.6;
        if (i) ctx.lineTo(Math.cos(a) * rr, Math.sin(a) * rr); else ctx.moveTo(Math.cos(a) * rr, Math.sin(a) * rr);
      }
      ctx.closePath();
      ctx.fillStyle = SF.outline; ctx.fill();
      ctx.scale(0.78, 0.78);
      ctx.fillStyle = '#2a1a14'; ctx.fill();
      ctx.strokeStyle = SF.emberHot; ctx.lineWidth = 1.4;
      ctx.beginPath(); ctx.moveTo(-r * 0.6, -r * 0.1); ctx.lineTo(0, r * 0.15); ctx.lineTo(r * 0.5, -r * 0.4); ctx.moveTo(0, r * 0.15); ctx.lineTo(r * 0.1, r * 0.7); ctx.stroke();
      ctx.restore();
      void t;
    }
    burstFx(why) {
      if (!G.fx) return;
      if (why === 'expire') return super.burstFx(why);
      burst('spark', this.cx, this.cy, { count: 9, color: SF.emberHot, speed: 260, angle: -Math.PI / 2, spread: 2.6 });
      burst('ember', this.cx, this.cy, { count: 5, color: SF.ember, speed: 160 });
      burst('smoke', this.cx, this.cy - 4, { count: 2, color: '#3a302c', alpha: 0.4, size: 7 });
      burst('flash', this.cx, this.cy, { r: this.r * 3, color: SF.ember, life: 0.1 });
      G.sfxAt('coal_hiss', this.cx, { vol: 0.6 });
    }
  }
  if (G.registerProjectile) G.registerProjectile('stoker_coal', StokerCoal, { r: 7, gravity: 1250, life: 4, color: SF.ember, damage: 1, destroyable: true });
  G.registerEnemy('stoker', Stoker);

  // =====================================================================================================
  // ash_bat
  // =====================================================================================================
  const AB = { fur: '#a0948c', furHi: '#cfc3b8', furDark: '#5e534d', wing: '#362d2a', wingFar: '#2a2220', bone: '#8a7c72', ear: '#7a6c64', earIn: '#b0604a', mouth: '#2a0f0a', fang: '#efe4d6' };

  class AshBat extends G.Enemy {
    constructor(props) {
      super(props, {
        hp: 18, w: 30, h: 26,
        flying: true,
        cinders: [3, 5],
        weight: 0.6,
        sight: 7 * TILE,
        colors: { body: AB.fur, dark: AB.furDark, hit: '#fff0e4', smoke: '#5a504a', puddle: SF.ashDark, tele: SF.tele },
        puddleW: 13,
      });
      this.puddleWick = false;
      this.flap = Math.random() * TAU;
      this.spread = 0;
      this.scream = 0;
      this.lostT = 0;
      this.tilt = 0;
      this.perched = false;
    }
    init() {
      super.init();
      const mode = this.props.perch || 'auto';
      let ceil = null;
      if (mode !== 'air' && this.room) {
        const maxUp = (mode === 'ceiling' ? 20 : 12) * TILE;
        const r = G.Physics.raycast(this.room, this.cx, this.cy, this.cx, this.cy - maxUp);
        if (r && r.hit) ceil = r.ty != null ? (r.ty + 1) * TILE : r.y;
      }
      if (ceil != null && ceil > 0) {
        this.y = ceil + 1;
        this.perched = true;
        this.home = { x: this.cx, y: this.cy };
        this.setState('roost');
      } else {
        this.setState('circle');
      }
    }
    homeDist() { return Math.hypot(this.cx - this.home.x, this.cy - this.home.y); }
    leash() { return propTiles(this, 'leash', 14); }
    wakeCheck() {
      const p = this.player;
      if (!this.targetable(p)) return false;
      const pc = pCenter(p), dx = pc.x - this.cx, dy = pc.y - this.cy;
      const below = Math.abs(dx) < 3.2 * TILE && dy > 0.5 * TILE && dy < 14 * TILE;
      const near = Math.hypot(dx, dy) < 2.6 * TILE;
      return (below || near) && this.canSee(p, 15 * TILE);
    }
    startSwoop() {
      const p = this.player;
      if (!this.targetable(p)) { this.setState('return'); return; }
      const P0 = { x: this.cx, y: this.cy };
      const pc = pCenter(p);
      const M = { x: pc.x, y: pc.y - 4 };
      let dir = Math.abs(M.x - P0.x) > 12 ? (M.x > P0.x ? 1 : -1) : this.facing;
      const run = Math.max(Math.abs(M.x - P0.x), 2 * TILE);
      let P2 = keepOut(this, M.x + dir * clamp(run * 0.9, 2.5 * TILE, 5 * TILE), M.y - clamp((M.y - P0.y) * 0.6, 1.8 * TILE, 4 * TILE));
      // segment A: P0 → M, tangent horizontal at M (the bottom of the arc), segment B: M → P2
      const C1 = { x: M.x - dir * clamp(run * 0.55, 1.2 * TILE, 3 * TILE), y: M.y };
      const C2 = { x: M.x + dir * clamp(Math.abs(P2.x - M.x) * 0.55, 1 * TILE, 3 * TILE), y: M.y };
      const lenA = Math.hypot(C1.x - P0.x, C1.y - P0.y) + Math.hypot(M.x - C1.x, M.y - C1.y);
      const lenB = Math.hypot(C2.x - M.x, C2.y - M.y) + Math.hypot(P2.x - C2.x, P2.y - C2.y);
      const TA = clamp(lenA / 430, 0.45, 1.2), TB = clamp(lenB / 380, 0.4, 0.9);
      this.facing = dir;
      this.setState('swoop', { P0, C1, M, C2, P2, TA, TB });
      G.sfxAt('dash', this.cx, { vol: 0.3, pitch: 1.6 });
    }
    think(dt) {
      const p = this.player;
      let flapRate = 15, spreadT = 1;
      switch (this.state) {
        case 'roost':
          this.vx = 0; this.vy = 0;
          spreadT = 0; flapRate = 0;
          if (this.home) { this.x = this.home.x - this.w / 2; this.y = this.home.y - this.h / 2; }
          if (this.stateTime > 0.3 && this.wakeCheck()) this.setState('wake');
          break;
        case 'wake': {                                         // TELEGRAPH: eyes snap open, wings unfurl, screech
          if (this.once('tele')) this.stateData.w = this.telegraph(this.stateData.quick ? 0.38 : 0.45, { shake: 1.2, color: SF.tele, sound: 'bat_screech', vol: 0.8 });
          if (this.targetable(p)) this.face(p);
          this.vx = 0; this.vy = toward(this.vy, 45, 400 * dt);
          spreadT = ease(clamp(this.stateTime / 0.3, 0, 1)); flapRate = 20;
          this.scream = 1;
          if (this.stateTime >= this.stateData.w) { if (playerInZone(this)) this.setState('flutter', { dur: 1 }); else this.startSwoop(); }
          break;
        }
        case 'swoop': {
          const d = this.stateData, s = this.stateTime;
          let q;
          if (s < d.TA) { const u = s / d.TA; q = bez(d.P0, d.C1, d.M, u); }
          else { const u = Math.min(1, (s - d.TA) / d.TB); q = bez(d.M, d.C2, d.P2, u); }
          let vx = (q.x - this.cx) / dt, vy = (q.y - this.cy) / dt;
          const sp = Math.hypot(vx, vy);
          if (sp > 900) { vx *= 900 / sp; vy *= 900 / sp; }
          this.vx = vx; this.vy = vy;
          spreadT = 0.55; flapRate = 4;
          this.tilt = clamp(Math.atan2(vy, Math.abs(vx) + 1) * 0.6, -0.6, 0.6);
          const done = s >= d.TA + d.TB;
          const blocked = (s > 0.08 && (this.wallHit || this.ceilHit || (this.grounded && s > d.TA * 0.5))) || inZone(this, this.cx + this.vx * 0.05, this.cy + this.vy * 0.05);
          if (done || blocked || s > 2.6) { this.cooldown('swoop', rnd(1.0, 1.6)); this.setState('flutter', { dur: rnd(1.1, 1.8) }); }
          break;
        }
        case 'flutter': {                                      // erratic hover above-beside the Wickling (recovery)
          if (!this.targetable(p)) { this.setState('return'); break; }
          const pc = pCenter(p);
          const side = this.cx < pc.x ? -1 : 1;
          const k = keepOut(this, pc.x + side * 2.6 * TILE + Math.sin(this.t * 2.1 + this.seed) * 18, pc.y - 3 * TILE + this.bob(14, 1.3));
          this.flyTo(k.x, k.y, this.stateTime < 0.5 ? 90 : 150, dt, { accel: 480, arrive: 50, look: 50 });
          if (this.every(0.3)) { this.vx += rnd(-60, 60); this.vy += rnd(-50, 50); }
          this.face(p);
          if (this.canSee(p, this.sight * 1.5)) this.lostT = 0; else this.lostT += dt;
          if (this.lostT > 3 || this.homeDist() > this.leash()) { this.setState('return'); break; }
          if (this.stateTime > (this.stateData.dur || 1.4) && this.ready('swoop') && this.canSee(p) && !inZone(this, this.cx, this.cy) && !playerInZone(this)) this.setState('aim');
          break;
        }
        case 'aim': {                                          // TELEGRAPH: rears back, wings high, screech
          if (this.once('tele')) this.stateData.w = this.telegraph(0.42, { shake: 1.1, color: SF.tele, sound: 'bat_screech', vol: 0.7 });
          this.vx = toward(this.vx, 0, 500 * dt); this.vy = toward(this.vy, -20, 500 * dt);
          if (this.targetable(p)) this.face(p);
          flapRate = 22; this.scream = 1;
          if (this.stateTime >= this.stateData.w) { if (playerInZone(this)) this.setState('flutter', { dur: 1 }); else this.startSwoop(); }
          break;
        }
        case 'return': {
          const hd = this.homeDist();
          // final approach to a roost: straight in (the wall feelers would keep it off the ceiling)
          const d = this.perched && hd < 2.5 * TILE ? this.flyTo(this.home.x, this.home.y, 90, dt, { accel: 500, arrive: 30, avoid: 0 }) : this.flyTo(this.home.x, this.home.y, 120, dt, { accel: 360, arrive: 40 });
          if (Math.abs(this.vx) > 8) this.facing = this.vx > 0 ? 1 : -1;
          if (this.stateTime > 0.8 && this.homeDist() < this.leash() * 0.7 && this.canSee(p) && this.ready('swoop') && !playerInZone(this)) { this.setState('aim'); break; }
          if (d < 8 || this.stateTime > 8) {
            if (this.perched && d < 10) { this.vx = 0; this.vy = 0; this.setState('roost'); } else this.setState('circle');
          }
          break;
        }
        case 'circle': {                                       // open air: lazy figure-8 around its spot
          const ph = this.t * 1.1 + this.seed;
          this.flyTo(this.home.x + Math.cos(ph) * 1.6 * TILE, this.home.y + Math.sin(ph * 2) * 0.5 * TILE, 85, dt, { accel: 260, arrive: 30 });
          if (Math.abs(this.vx) > 8) this.facing = this.vx > 0 ? 1 : -1;
          if (this.stateTime > 0.5 && this.ready('swoop') && this.canSee(p, 6.5 * TILE) && !inZone(this, this.cx, this.cy) && !playerInZone(this)) this.setState('aim');
          else if (this.perched && this.stateTime > 4) this.setState('return');
          break;
        }
        default: this.setState(this.perched ? 'return' : 'circle');
      }
      if (!this.is('swoop')) this.tilt = toward(this.tilt, 0, dt * 3);
      this.flap += dt * flapRate;
      this.spread = toward(this.spread, spreadT, dt * 5);
      this.scream = toward(this.scream, 0, dt * 3);
      if (!this.is('roost') && Math.random() < dt * 1.5) burst('ash', this.cx + rnd(-8, 8), this.cy + 4, { count: 1, color: SF.ash });
    }
    whileStunned() { this.flap += G.CONST.DT * 18; }
    onHurt() {
      if (this.is('roost')) this.setState('wake', { quick: true });
      else if (this.is('swoop')) { this.cooldown('swoop', 1.2); this.setState('flutter', { dur: 1.2 }); }
    }
    deathFx(hit) {
      const d = (hit && hit.dir) || { x: 0, y: -1 };
      const ang = Math.atan2(d.y || -0.6, d.x || 0);
      burst('flash', this.cx, this.cy, { r: 34, color: '#ffe0c0', life: 0.12 });
      burst('ash', this.cx, this.cy, { count: 20, color: SF.ashHi, speed: 240, angle: ang, spread: 2.6 });
      burst('smoke', this.cx, this.cy, { count: 6, color: '#5a504a', alpha: 0.45, size: 9 });
      burst('ember', this.cx, this.cy, { count: 4, color: SF.ember, speed: 160 });
    }
    drawBounds() { return { x: this.x - 34, y: this.y - 30, w: this.w + 68, h: this.h + 56 }; }
    drawBody(ctx, t) {
      if (this.is('roost') || (this.is('wake') && this.spread < 0.35)) drawBatRoost(ctx, this.cx, this.y, this.facing, t, { seed: this.seed, wake: this.is('wake') ? this.spread / 0.35 : 0 });
      else drawBat(ctx, this.cx, this.cy, this.facing, t, { flap: this.flap, spread: this.spread, scream: this.scream, tilt: this.tilt, seed: this.seed, tele: this.telegraphing, swoop: this.is('swoop') });
    }
    drawCorpse(ctx, t) { drawBat(ctx, this.cx, this.cy, this.facing, t, { flap: 2.2, spread: 0.5, scream: 0, tilt: 0, seed: this.seed, dead: true }); }
    drawPuddle(ctx, x, y, p) { ashHeap(ctx, x, y, p, 13, this.seed, { color: SF.ash, hi: SF.ashHi, embers: 0.5 }); }
  }
  function bez(a, b, c, u) {
    const v = 1 - u;
    return { x: v * v * a.x + 2 * v * u * b.x + u * u * c.x, y: v * v * a.y + 2 * v * u * b.y + u * u * c.y };
  }

  /** Bat hanging asleep: feet hooked into the ceiling at (x, top), wings wrapped into a pod, head down. */
  function drawBatRoost(ctx, x, top, f, t, s) {
    const C = CH();
    const seed = s.seed || 0, wake = s.wake || 0;
    const br = Math.sin(t * 1.8 + seed) * 0.6;
    const sway = Math.sin(t * 0.9 + seed) * 0.05;
    ctx.save();
    ctx.translate(x, top);
    ctx.rotate(sway);
    // feet hooked to the ceiling
    ctx.strokeStyle = SF.outline; ctx.lineWidth = 3; ctx.lineCap = 'round';
    for (const sx of [-3, 3]) { ctx.beginPath(); ctx.moveTo(sx, 0); ctx.lineTo(sx * 0.8, 6); ctx.stroke(); }
    ctx.strokeStyle = AB.bone; ctx.lineWidth = 1.4;
    for (const sx of [-3, 3]) { ctx.beginPath(); ctx.moveTo(sx, 0.5); ctx.lineTo(sx * 0.8, 6); ctx.stroke(); }
    // the wrapped pod
    const open = wake * 4;
    const W = 11 + br * 0.4 + open, H = 26;
    const pod = new Path2D();
    pod.moveTo(0, 4);
    pod.bezierCurveTo(W, 4, W + 2, H * 0.55, W * 0.6, H * 0.85);
    pod.quadraticCurveTo(0, H + 3, -W * 0.6, H * 0.85);
    pod.bezierCurveTo(-W - 2, H * 0.55, -W, 4, 0, 4);
    pod.closePath();
    if (C && C.shape) C.shape(ctx, pod, { fill: AB.wing, box: [-W - 2, 4, W + 2, H + 3], rim: '#c08060', rimWidth: 1.6, light: -1, shade: 0.3 });
    else { ctx.fillStyle = AB.wing; ctx.fill(pod); }
    // finger ridges folded around the pod
    ctx.strokeStyle = AB.bone; ctx.lineWidth = 1.2;
    for (const sd of [-1, 1]) {
      ctx.beginPath(); ctx.moveTo(sd * 2, 6); ctx.quadraticCurveTo(sd * (W + 1), H * 0.4, sd * W * 0.45, H * 0.82); ctx.stroke();
    }
    // the head peeking out at the bottom, upside down: ears pointing down, eyes shut (or snapping open)
    const hy = H - 1;
    ctx.fillStyle = SF.outline;
    for (const sd of [-1, 1]) { ctx.beginPath(); ctx.moveTo(sd * 3, hy + 2); ctx.lineTo(sd * 7, hy + 11); ctx.lineTo(sd * 7.5, hy + 1); ctx.closePath(); ctx.fill(); }
    ctx.fillStyle = AB.ear;
    for (const sd of [-1, 1]) { ctx.beginPath(); ctx.moveTo(sd * 3.6, hy + 2.6); ctx.lineTo(sd * 6.6, hy + 9); ctx.lineTo(sd * 6.6, hy + 2); ctx.closePath(); ctx.fill(); }
    ctx.fillStyle = SF.outline;
    ctx.beginPath(); ctx.ellipse(0, hy, 7.2, 6.2, 0, 0, TAU); ctx.fill();
    ctx.fillStyle = AB.fur;
    ctx.beginPath(); ctx.ellipse(0, hy, 5.8, 4.9, 0, 0, TAU); ctx.fill();
    ctx.fillStyle = AB.furHi;
    ctx.beginPath(); ctx.ellipse(-1.5, hy + 1.6, 3, 1.8, 0, 0, TAU); ctx.fill();
    if (wake > 0.05 && C && C.eyes) {
      C.eyes(ctx, 0, hy - 1, { kind: 'ember', size: 5.5, gap: 5, color: '#ff8a3a', blink: 1 - wake });
    } else {
      ctx.strokeStyle = '#3a2e2a'; ctx.lineWidth = 1.2;
      for (const sd of [-1, 1]) { ctx.beginPath(); ctx.arc(sd * 2.6, hy - 1.6, 1.6, 0.2, Math.PI - 0.2); ctx.stroke(); }
    }
    // a little soot dust trickling (sleeping breath)
    ctx.restore();
    void f;
  }

  /** Flying bat at centre (x, y). s: {flap, spread 0..1, scream 0..1, tilt, seed, tele, swoop, dead}. */
  function drawBat(ctx, x, y, f, t, s) {
    const C = CH();
    const seed = s.seed || 0;
    const sp = s.spread == null ? 1 : s.spread;
    let up = Math.sin(s.flap || 0);
    if (s.tele) up = 0.85 + Math.sin(t * 30) * 0.1;          // wings held high and trembling while winding up
    if (s.swoop) up = -0.35;                                  // swept back in the dive
    if (s.dead) up = 0.3;
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate((s.tilt || 0) * f);
    ctx.lineCap = 'round'; ctx.lineJoin = 'round';
    // wings: far (behind) first when swooping, else both symmetric
    const wing = (side, far) => {
      const sw = s.swoop ? 0.6 : 1;
      const Sx = side * 5, Sy = -3;
      const Wx = side * (13 + 5 * sp) * sw, Wy = -6 - 12 * up * sp;
      const T1x = side * (16 + 20 * sp) * sw, T1y = -3 - 16 * up * sp;
      const T2x = side * (12 + 16 * sp) * sw, T2y = 7 - 9 * up * sp;
      const T3x = side * (7 + 8 * sp) * sw, T3y = 11 - 4 * up * sp;
      const p = new Path2D();
      p.moveTo(Sx, Sy);
      p.quadraticCurveTo((Sx + Wx) / 2, Wy - 4, Wx, Wy);
      p.lineTo(T1x, T1y);
      p.quadraticCurveTo((T1x + T2x) / 2 - side * 4, (T1y + T2y) / 2 - 1, T2x, T2y);
      p.quadraticCurveTo((T2x + T3x) / 2 - side * 3, (T2y + T3y) / 2 - 2, T3x, T3y);
      p.quadraticCurveTo((T3x + side * 3) / 2, 9, side * 3, 8);
      p.closePath();
      ctx.fillStyle = SF.outline; ctx.lineWidth = 3.4; ctx.strokeStyle = SF.outline; ctx.stroke(p);
      ctx.fillStyle = far ? AB.wingFar : AB.wing; ctx.fill(p);
      // membrane sheen + ember-lit lower edge
      ctx.strokeStyle = 'rgba(255,130,70,0.28)'; ctx.lineWidth = 1.2;
      ctx.beginPath(); ctx.moveTo(T1x, T1y); ctx.quadraticCurveTo((T1x + T2x) / 2 - side * 4, (T1y + T2y) / 2 - 1, T2x, T2y); ctx.stroke();
      // finger bones
      ctx.strokeStyle = AB.bone; ctx.lineWidth = 1.5;
      ctx.beginPath(); ctx.moveTo(Sx, Sy); ctx.quadraticCurveTo((Sx + Wx) / 2, Wy - 4, Wx, Wy);
      ctx.moveTo(Wx, Wy); ctx.lineTo(T1x, T1y); ctx.moveTo(Wx, Wy); ctx.lineTo(T2x, T2y); ctx.moveTo(Wx, Wy); ctx.lineTo(T3x, T3y); ctx.stroke();
      // thumb claw
      ctx.strokeStyle = AB.fang; ctx.lineWidth = 1.2;
      ctx.beginPath(); ctx.moveTo(Wx, Wy); ctx.lineTo(Wx - side * 1, Wy - 3.5); ctx.stroke();
    };
    wing(-f, true);
    if (!s.swoop) wing(f, false);
    // body: pale ash fur, little feet tucked
    ctx.strokeStyle = SF.outline; ctx.lineWidth = 2.4;
    ctx.beginPath(); ctx.moveTo(-3, 9); ctx.lineTo(-4, 14); ctx.moveTo(3, 9); ctx.lineTo(4, 14); ctx.stroke();
    ctx.fillStyle = SF.outline;
    ctx.beginPath(); ctx.ellipse(0, 2, 9.5, 10.5, 0, 0, TAU); ctx.fill();
    ctx.fillStyle = AB.fur;
    ctx.beginPath(); ctx.ellipse(0, 2, 8, 9, 0, 0, TAU); ctx.fill();
    ctx.fillStyle = AB.furDark;
    ctx.beginPath(); ctx.ellipse(1.5, 5.5, 6, 5.5, 0, 0, TAU); ctx.fill();
    ctx.fillStyle = AB.furHi;
    ctx.beginPath(); ctx.ellipse(-2.5, -1.5, 3.6, 3.4, 0, 0, TAU); ctx.fill();
    // fur tufts on the chest
    ctx.strokeStyle = AB.furHi; ctx.lineWidth = 1;
    for (let i = 0; i < 3; i++) { const fx = -3 + i * 3; ctx.beginPath(); ctx.moveTo(fx, 6); ctx.lineTo(fx + 1, 9); ctx.stroke(); }
    if (s.swoop) wing(f, false);
    // head with tall ears, looking toward f
    const hx = f * 2, hy = -9;
    for (const sd of [-1, 1]) {
      const ex = hx + sd * 4.5, tipx = hx + sd * 8 + f * 1.5, tipy = hy - 14 + (s.dead ? 6 : 0);
      ctx.fillStyle = SF.outline;
      ctx.beginPath(); ctx.moveTo(ex - 3.5, hy - 1); ctx.lineTo(tipx, tipy - 1.5); ctx.lineTo(ex + 3.5, hy - 1); ctx.closePath(); ctx.fill();
      ctx.fillStyle = AB.ear;
      ctx.beginPath(); ctx.moveTo(ex - 2.2, hy - 1.5); ctx.lineTo(tipx, tipy); ctx.lineTo(ex + 2.2, hy - 1.5); ctx.closePath(); ctx.fill();
      ctx.fillStyle = AB.earIn;
      ctx.beginPath(); ctx.moveTo(ex - 0.9, hy - 2); ctx.lineTo(tipx * 0.85 + ex * 0.15, tipy + 3); ctx.lineTo(ex + 0.9, hy - 2); ctx.closePath(); ctx.fill();
    }
    ctx.fillStyle = SF.outline;
    ctx.beginPath(); ctx.ellipse(hx, hy, 8, 7, 0, 0, TAU); ctx.fill();
    ctx.fillStyle = AB.fur;
    ctx.beginPath(); ctx.ellipse(hx, hy, 6.6, 5.7, 0, 0, TAU); ctx.fill();
    ctx.fillStyle = AB.furHi;
    ctx.beginPath(); ctx.ellipse(hx - 2, hy - 2, 3, 2.2, 0, 0, TAU); ctx.fill();
    // snout + mouth (opens to screech) with fangs
    const mo = clamp(s.scream || 0, 0, 1);
    const mx = hx + f * 2.5, my = hy + 3;
    ctx.fillStyle = AB.mouth;
    ctx.beginPath(); ctx.ellipse(mx, my + mo * 1.5, 2.6 + mo * 1.2, 0.8 + mo * 2.4, 0, 0, TAU); ctx.fill();
    ctx.fillStyle = AB.fang;
    ctx.beginPath(); ctx.moveTo(mx - 2, my - 0.4); ctx.lineTo(mx - 1.4, my + 2.6 + mo); ctx.lineTo(mx - 0.6, my - 0.4); ctx.fill();
    ctx.beginPath(); ctx.moveTo(mx + 0.6, my - 0.4); ctx.lineTo(mx + 1.4, my + 2.6 + mo); ctx.lineTo(mx + 2, my - 0.4); ctx.fill();
    if (s.dead) {
      ctx.strokeStyle = '#3a2e2a'; ctx.lineWidth = 1.3;
      for (const sd of [-1, 1]) { ctx.beginPath(); ctx.moveTo(hx + sd * 3 - 1.5, hy - 2.5); ctx.lineTo(hx + sd * 3 + 1.5, hy - 0.5); ctx.moveTo(hx + sd * 3 + 1.5, hy - 2.5); ctx.lineTo(hx + sd * 3 - 1.5, hy - 0.5); ctx.stroke(); }
    } else if (C && C.eyes) {
      C.eyes(ctx, hx + f * 0.8, hy - 1.5, { kind: 'ember', size: 6.5 + (s.tele ? 1.5 : 0), gap: 5.5, color: s.tele ? '#ffd890' : '#ff8a3a', blink: C.blinkAt ? C.blinkAt(t, seed) : 0, tilt: 0.3 });
    }
    ctx.restore();
  }
  G.registerEnemy('ash_bat', AshBat);

  G.Events = G.Events || {};
  // =====================================================================================================
  // Region set pieces drawn by code (event scripts used by src/data/regions/flue.js; owner: region-flue).
  // Static parts are painted once into cached canvases on first draw (never at load time); animation is a few
  // cheap paths per frame. Every script culls itself against the camera (e.cull = false, own rect test).
  //   sf_stack   — a brick chimney stack (part 'back': whole stack incl. an open hearth arch, behind the terrain;
  //                part 'front': glazed brick skin over the solid crown block, so the X tiles read as one stack)
  //   sf_crown   — the Great Flue's crown on the Chimney Tops: a huge brick collar around S1, red glow, smoke
  //   sf_embers  — a column of embers streaming upward (the Great Flue, the Ember Shaft)
  //   sf_bellows — Bellows Hall's two giant leather bellows, heaving
  //   sf_sacks   — soot-sacks on ropes, swaying under the loft trusses
  //   sf_rack    — the kiln-glass cooling rack in the Soot Lofts
  //   sf_pipe    — a big riveted iron pipe skin over a run of solid tiles (the cistern pipe, ceiling runs)
  //   sf_door    — the Ashpit's heavy iron door frame to the Chandlery, glowing with heat
  // =====================================================================================================
  const sfSprites = new Map();
  function sfSprite(key, w, h, fn) {
    let c = sfSprites.get(key);
    if (!c) { const mc = G.U.makeCanvas(w, h); fn(mc.ctx, w, h); c = mc.canvas; sfSprites.set(key, c); }
    return c;
  }
  const seen = (x, y, w, h, m) => !G.camera || !G.camera.visible || G.camera.visible(x, y, w, h, m == null ? 60 : m);
  const rgbaS = (hex, a) => {
    const n = parseInt(hex.slice(1), 16);
    return 'rgba(' + ((n >> 16) & 255) + ',' + ((n >> 8) & 255) + ',' + (n & 255) + ',' + a + ')';
  };
  function sfBricks(x, x0, y0, w, h, base, seed, bw, bh) {
    bw = bw || 26; bh = bh || 12;
    x.fillStyle = base; x.fillRect(x0, y0, w, h);
    let i = 0;
    for (let yy = y0, r = 0; yy < y0 + h; yy += bh, r++) {
      for (let xx = x0 - (r % 2) * bw * 0.5; xx < x0 + w; xx += bw, i++) {
        const v = h01(i, seed);
        x.fillStyle = v < 0.5 ? 'rgba(255,190,150,' + (0.02 + v * 0.07).toFixed(3) + ')' : 'rgba(0,0,0,' + (0.04 + (v - 0.5) * 0.16).toFixed(3) + ')';
        x.fillRect(Math.max(x0, xx + 1), yy + 1, Math.min(bw - 2, x0 + w - xx - 1), bh - 2);
      }
      x.fillStyle = 'rgba(0,0,0,0.35)'; x.fillRect(x0, yy, w, 1.2);
    }
  }
  const sfSmoke = (x, y, s) => {
    if (!G.fx || !G.fx.spawn) return;
    G.fx.spawn({ x: x + rnd(-6, 6) * s, y, vx: rnd(-8, 14), vy: rnd(-40, -22), life: rnd(2.6, 4), size: rnd(6, 9) * s, size2: rnd(20, 30) * s,
      color: Math.random() < 0.5 ? '#5a4840' : '#6a5248', alpha: rnd(0.08, 0.14), drag: 0.2, shape: 'circle' });
  };
  const sfEmber = (x, y, o) => {
    if (!G.fx || !G.fx.spawn) return;
    G.fx.spawn({ x, y, vx: rnd(-14, 14) + ((o && o.vx) || 0), vy: -rnd((o && o.v0) || 50, (o && o.v1) || 130), life: rnd(1.6, 3.2), size: rnd(1.6, 3.2),
      size2: 0.4, color: Math.random() < 0.3 ? '#ffd080' : '#ff7a30', alpha: rnd(0.7, 1), add: true, drag: 0.05, shape: 'circle' });
  };

  // ---- sf_stack: props c0 c1 (cols, incl.), top (row), base (row standing on the ground), hearth [r0, r1] (open
  // arch rows), part 'back'|'front', front [r0, r1] (rows of the solid block to skin), glaze, smoke, dim, seed.
  function paintStack(x, w, h, p) {
    const T = TILE, pad = 14, cw = w - pad * 2;
    const body = '#3a221c', dark = '#1c100c';
    sfBricks(x, pad, T * 0.6, cw, h - T * 0.6, body, p.seed || 3);
    // side shading: ember-lit left face, dark right
    const g = x.createLinearGradient(pad, 0, pad + cw, 0);
    g.addColorStop(0, 'rgba(255,120,60,0.16)'); g.addColorStop(0.3, 'rgba(0,0,0,0)'); g.addColorStop(1, 'rgba(0,0,0,0.5)');
    x.fillStyle = g; x.fillRect(pad, T * 0.6, cw, h);
    // soot streaks running down from the crown
    for (let i = 0; i < 9; i++) {
      const sx = pad + 6 + h01(i, 41) * (cw - 12), len = (0.2 + h01(i, 42) * 0.6) * h;
      const sg = x.createLinearGradient(0, T, 0, T + len);
      sg.addColorStop(0, 'rgba(8,4,3,0.55)'); sg.addColorStop(1, 'rgba(8,4,3,0)');
      x.fillStyle = sg; x.fillRect(sx, T, 3 + h01(i, 43) * 7, len);
    }
    if (p.glaze) {                              // kiln glaze: glossy vertical sheens (cannot be gripped)
      for (const fx of [pad + 5, pad + cw - 12]) {
        const gg = x.createLinearGradient(fx, 0, fx + 7, 0);
        gg.addColorStop(0, 'rgba(255,220,190,0)'); gg.addColorStop(0.5, 'rgba(255,220,190,0.28)'); gg.addColorStop(1, 'rgba(255,220,190,0)');
        x.fillStyle = gg; x.fillRect(fx, T * 0.8, 7, ((p.front ? p.front[1] - p.top + 1 : 4) * T) - T * 0.4);
      }
    }
    // the crown: a corbelled cap two courses wide
    x.fillStyle = dark; x.fillRect(0, T * 0.15, w, T * 0.55);
    x.fillStyle = '#4a2c22'; x.fillRect(2, T * 0.15, w - 4, T * 0.18);
    x.fillStyle = '#2a1812'; x.fillRect(pad * 0.5, T * 0.7, w - pad, T * 0.22);
    // open hearth arch
    if (p.hearth) {
      const y0 = (p.hearth[0] - p.top) * T + T * 0.6, y1 = h, ax0 = pad + 5, ax1 = pad + cw - 5;
      x.save();
      x.beginPath(); x.moveTo(ax0, y1); x.lineTo(ax0, y0 + T * 0.9);
      x.quadraticCurveTo((ax0 + ax1) / 2, y0 - T * 0.5, ax1, y0 + T * 0.9); x.lineTo(ax1, y1); x.closePath();
      const hg = x.createLinearGradient(0, y0, 0, y1);
      hg.addColorStop(0, '#0a0504'); hg.addColorStop(0.7, '#2a0e06'); hg.addColorStop(1, '#6a2410');
      x.fillStyle = hg; x.fill();
      x.strokeStyle = '#120a08'; x.lineWidth = 5; x.stroke();
      x.restore();
      // voussoirs
      x.strokeStyle = 'rgba(255,170,120,0.12)'; x.lineWidth = 1.5;
      for (let i = 1; i < 8; i++) {
        const k = i / 8, bx = ax0 + (ax1 - ax0) * k, by = y0 + T * 0.9 - Math.sin(Math.PI * k) * T * 0.7;
        x.beginPath(); x.moveTo(bx, by); x.lineTo(bx + (k - 0.5) * 10, by - 9); x.stroke();
      }
    }
  }
  G.Events.sf_stack = G.Events.sf_stack || {
    init(e) {
      e.cull = false;
      const p = e.props;
      e.data.r = { x: p.c0 * TILE - 14, y: p.top * TILE - TILE * 0.6, w: (p.c1 - p.c0 + 1) * TILE + 28, h: (p.base - p.top + 1) * TILE + TILE * 0.6 };
    },
    update(e, dt) {
      const p = e.props, r = e.data.r;
      if (!p.smoke || p.part === 'front' || !seen(r.x, r.y - 200, r.w, r.h + 200)) return;
      e.data.acc = (e.data.acc || 0) + dt * (p.smoke === true ? 2.2 : +p.smoke);
      while (e.data.acc > 1) { e.data.acc -= 1; sfSmoke(r.x + r.w / 2, r.y + 6, r.w / 140); }
    },
    draw(e, ctx) {
      const p = e.props, r = e.data.r;
      if (!seen(r.x, r.y, r.w, r.h)) return;
      const key = 'sf_stack:' + [p.c0, p.c1, p.top, p.base, p.hearth, p.glaze, p.front, p.seed].join('/');
      const img = sfSprite(key, r.w, r.h, (x, w, h) => paintStack(x, w, h, p));
      if (p.part === 'front') {
        const fr = p.front || [p.top, p.top + 3];
        const sy = 0, sh = (fr[1] - p.top + 1) * TILE + TILE * 0.6;
        ctx.drawImage(img, 0, sy, r.w, sh, r.x, r.y, r.w, sh);
        return;
      }
      if (p.dim) ctx.globalAlpha = 1 - +p.dim;
      ctx.drawImage(img, r.x, r.y);
      ctx.globalAlpha = 1;
      if (p.hearth) {                             // the banked fire breathing in the hearth
        const hx = r.x + r.w / 2, hy = (p.base + 1) * TILE - 8, t = G.game ? G.game.t : 0;
        glow(ctx, hx, hy, TILE * 2.2, '#ff5a1a', 0.32 + 0.08 * Math.sin(t * 1.7));
      }
    },
  };

  // ---- sf_crown: props c0 c1 (collar cols), top (row of the collar's top), floor (row of the mouth's lip), mouth [m0, m1]
  function paintCrown(x, w, h, p) {
    const T = TILE, top = T * 0.7;
    // the far inner wall of the crown's drum between the rims: soot-glazed brick with a broken, jagged top edge,
    // a corbelled cap lit from below by the furnace glow, an iron hoop; dark at the curving edges (QA: the old
    // flat dark rectangle read as a panel, not a chimney crown)
    const prof = [];
    for (let i = 0, px = 0; px < w; i++) {
      const bw = 16 + h01(i, 61) * 30, dy = h01(i, 62) < 0.35 ? T * 0.55 * h01(i, 63) : 0;
      prof.push([px, Math.min(w, px + bw), top + dy]); px += bw;
    }
    x.save();
    x.beginPath(); x.moveTo(0, h);
    for (const [a, b, y] of prof) { x.lineTo(a, y); x.lineTo(b, y); }
    x.lineTo(w, h); x.closePath(); x.clip();
    sfBricks(x, 0, 0, w, h, '#2c1611', 17, 30, 13);
    const g = x.createLinearGradient(0, top, 0, h);
    g.addColorStop(0, 'rgba(10,5,4,0.55)'); g.addColorStop(0.45, 'rgba(10,5,4,0.25)'); g.addColorStop(1, 'rgba(10,5,4,0)');
    x.fillStyle = g; x.fillRect(0, 0, w, h);
    const sg = x.createLinearGradient(0, 0, w, 0);
    sg.addColorStop(0, 'rgba(0,0,0,0.7)'); sg.addColorStop(0.22, 'rgba(0,0,0,0.05)'); sg.addColorStop(0.78, 'rgba(0,0,0,0.05)'); sg.addColorStop(1, 'rgba(0,0,0,0.7)');
    x.fillStyle = sg; x.fillRect(0, 0, w, h);
    // iron hoop round the drum, rivets
    const hy = top + (h - top) * 0.5;
    x.fillStyle = '#1e1819'; x.fillRect(0, hy, w, 7);
    x.fillStyle = 'rgba(255,150,100,0.22)'; x.fillRect(0, hy + 6, w, 1.5);
    x.fillStyle = '#6a5a58'; for (let rx = 10; rx < w; rx += 22) x.fillRect(rx, hy + 2.5, 2.5, 2.5);
    // the mouth's glow on the inner wall
    const mx0 = (p.mouth[0] - p.c0) * T, mx1 = (p.mouth[1] - p.c0 + 1) * T;
    const mg = x.createRadialGradient((mx0 + mx1) / 2, h, 4, (mx0 + mx1) / 2, h, (mx1 - mx0) * 1.6);
    mg.addColorStop(0, 'rgba(255,120,50,0.6)'); mg.addColorStop(1, 'rgba(255,80,30,0)');
    x.fillStyle = mg; x.fillRect(0, 0, w, h);
    x.restore();
    // corbelled cap along the broken top: a dark projecting course whose underside catches the glow
    for (const [a, b, y] of prof) {
      x.fillStyle = '#170b08'; x.fillRect(a - 1, y - 2, b - a + 2, 9);
      x.fillStyle = 'rgba(120,70,50,0.5)'; x.fillRect(a, y - 2, b - a, 1.5);
      x.fillStyle = 'rgba(255,130,70,0.3)'; x.fillRect(a, y + 7, b - a, 1.5);
    }
  }
  G.Events.sf_crown = G.Events.sf_crown || {
    init(e) {
      e.cull = false;
      const p = e.props;
      e.data.r = { x: p.c0 * TILE, y: p.top * TILE - TILE * 0.25, w: (p.c1 - p.c0 + 1) * TILE, h: (p.floor - p.top) * TILE + TILE * 0.25 };
    },
    update(e, dt) {
      const p = e.props, r = e.data.r;
      if (!seen(r.x, r.y - 300, r.w, r.h + 300)) return;
      const mx = (p.mouth[0] + (p.mouth[1] - p.mouth[0] + 1) / 2) * TILE, my = (p.floor + 1) * TILE;
      e.data.s = (e.data.s || 0) + dt * 5;
      while (e.data.s > 1) { e.data.s -= 1; sfSmoke(mx, my - 10, 1.6); }
      e.data.e = (e.data.e || 0) + dt * 9;
      while (e.data.e > 1) { e.data.e -= 1; sfEmber(mx + rnd(-60, 60), my, { v0: 90, v1: 200 }); }
    },
    draw(e, ctx, t) {
      const p = e.props, r = e.data.r;
      if (!seen(r.x, r.y - 300, r.w, r.h + 300)) return;
      ctx.drawImage(sfSprite('sf_crown:' + [p.c0, p.c1, p.top, p.floor].join('/'), r.w, r.h, (x, w, h) => paintCrown(x, w, h, p)), r.x, r.y);
      const mx = (p.mouth[0] + (p.mouth[1] - p.mouth[0] + 1) / 2) * TILE, my = (p.floor + 1) * TILE;
      glow(ctx, mx, my, TILE * 4.5, '#ff4a14', 0.42 + 0.1 * Math.sin(t * 1.3));
      glow(ctx, mx, my - TILE * 4, TILE * 3, '#c8401a', 0.16);
    },
  };

  // ---- sf_embers: props c0 c1 r0 r1 (rect, incl.), rate (per second while visible), v0 v1 (rise speed px/s)
  G.Events.sf_embers = G.Events.sf_embers || {
    init(e) {
      e.cull = false;
      const p = e.props;
      e.data.r = { x: p.c0 * TILE, y: p.r0 * TILE, w: (p.c1 - p.c0 + 1) * TILE, h: (p.r1 - p.r0 + 1) * TILE };
    },
    update(e, dt) {
      const p = e.props, r = e.data.r, cam = G.camera;
      if (!cam || !seen(r.x, r.y, r.w, r.h, 0)) return;
      // spawn inside the visible part of the column (plus a band below the view so the stream enters from below)
      const y0 = Math.max(r.y, cam.y), y1 = Math.min(r.y + r.h, cam.y + cam.h + 200);
      if (y1 <= y0) return;
      e.data.acc = (e.data.acc || 0) + dt * (p.rate || 14);
      while (e.data.acc > 1) {
        e.data.acc -= 1;
        sfEmber(r.x + Math.random() * r.w, y0 + Math.random() * (y1 - y0), { v0: p.v0 || 60, v1: p.v1 || 150 });
      }
    },
  };

  // ---- sf_bellows: props cx (col of the pair's centre), base (floor row: feet on its bottom), n (2), span (tiles each)
  // a giant bellows in side view: hinge (nozzle) at (x, yb - 14), boards opening like a wedge, pleated leather,
  // a chain from the top board's far end up into the brickwork (the hidden beam that works it)
  function drawBellows(ctx, x, yb, len, open, flip, ceilY) {
    const f = flip ? -1 : 1, th = 0.07 + open * 0.33;
    const hy = yb - 16, c = Math.cos(th), sn = Math.sin(th);
    const tip = (u) => [x + f * u * len * c, hy - 8 - u * len * sn];       // point u along the top board's underside
    // leather wedge
    ctx.fillStyle = '#6a3a22';
    ctx.beginPath(); ctx.moveTo(x + f * 6, hy - 4); ctx.lineTo(x + f * len, hy);
    const [tx, ty] = tip(1); ctx.lineTo(tx, ty + 2); ctx.closePath(); ctx.fill();
    ctx.lineWidth = 2.2;
    for (let k = 1; k <= 6; k++) {                 // pleats parallel to the far edge, light/dark pairs
      const u = 0.18 + k * 0.13, [px, py] = tip(u), bx = x + f * u * len;
      ctx.strokeStyle = 'rgba(20,8,4,0.55)'; ctx.beginPath(); ctx.moveTo(bx, hy - 1); ctx.lineTo((bx + px) / 2 - f * 7, (hy + py) / 2); ctx.lineTo(px, py + 2); ctx.stroke();
      ctx.strokeStyle = 'rgba(255,170,110,0.18)'; ctx.beginPath(); ctx.moveTo(bx + f * 3, hy - 1); ctx.lineTo((bx + px) / 2 - f * 4, (hy + py) / 2); ctx.lineTo(px + f * 3, py + 2); ctx.stroke();
    }
    // bottom board (fixed) and top board (rotating), iron-shod
    ctx.fillStyle = '#3e2818'; ctx.fillRect(flip ? x - len : x, hy, len, 11);
    ctx.fillStyle = 'rgba(255,170,110,0.25)'; ctx.fillRect(flip ? x - len : x, hy, len, 2);
    ctx.save(); ctx.translate(x, hy - 8); ctx.rotate(-f * th);
    ctx.fillStyle = '#4a3020'; ctx.fillRect(flip ? -len - 6 : 0, -10, len + 6, 11);
    ctx.fillStyle = 'rgba(255,180,120,0.3)'; ctx.fillRect(flip ? -len - 6 : 0, -10, len + 6, 2);
    ctx.fillStyle = '#2e2828'; ctx.fillRect(flip ? -len - 6 : len - 16, -12, 22, 15);
    ctx.restore();
    // the working chain up to the ceiling
    const [cx2, cy2] = tip(1);
    ctx.strokeStyle = '#2a2220'; ctx.lineWidth = 2;
    for (let y = cy2 - 14; y > ceilY; y -= 8) { ctx.beginPath(); ctx.ellipse(cx2, y, 2, 4, 0, 0, TAU); ctx.stroke(); }
    // iron nozzle into the duct box
    ctx.fillStyle = '#2e2622'; ctx.beginPath(); ctx.moveTo(x + f * 10, hy - 14); ctx.lineTo(x - f * 22, hy - 6); ctx.lineTo(x - f * 22, hy + 4); ctx.lineTo(x + f * 10, hy + 10); ctx.closePath(); ctx.fill();
  }
  G.Events.sf_bellows = G.Events.sf_bellows || {
    init(e) {
      e.cull = false;
      const p = e.props;
      e.data.span = (p.span || 7) * TILE;
      e.data.r = { x: (p.cx + 0.5) * TILE - e.data.span - 60, y: (p.base + 1) * TILE - TILE * 5, w: e.data.span * 2 + 120, h: TILE * 5 };
    },
    update(e) {
      const p = e.props, r = e.data.r, t = G.game ? G.game.t : 0;
      if (!seen(r.x, r.y, r.w, r.h)) return;
      for (let i = 0; i < 2; i++) {                // a gust of soot and sparks out of each nozzle as it closes
        const ph = Math.sin(t * 1.25 + i * Math.PI), prev = e.data['ph' + i] || 0;
        if (prev > -0.2 && ph <= -0.2 && G.fx) {
          const nx = (p.cx + 0.5) * TILE + (i ? 1 : -1) * 34, ny = (p.base + 1) * TILE - 14;
          for (let k = 0; k < 3; k++) sfSmoke(nx + (i ? 1 : -1) * 20, ny, 0.7);
          G.fx.burst && G.fx.burst('ember', nx, ny, { count: 4, color: '#ff8a40', speed: 120 });
        }
        e.data['ph' + i] = ph;
      }
    },
    draw(e, ctx, t) {
      const p = e.props, r = e.data.r;
      if (!seen(r.x, r.y, r.w, r.h)) return;
      const cx = (p.cx + 0.5) * TILE, yb = (p.base + 1) * TILE;
      // iron stand + the shared nozzle box feeding the duct into the floor
      ctx.fillStyle = '#1e1614'; ctx.fillRect(cx - 30, yb - 30, 60, 30);
      ctx.fillStyle = 'rgba(255,140,80,0.18)'; ctx.fillRect(cx - 30, yb - 30, 60, 2);
      for (let i = 0; i < 2; i++) {
        const open = 0.5 + 0.5 * Math.sin(t * 1.25 + i * Math.PI);
        drawBellows(ctx, cx + (i ? 1 : -1) * 34, yb, e.data.span, ease(open), !i, (p.ceil != null ? p.ceil + 1 : p.base - 5) * TILE);
      }
      glow(ctx, cx, yb - 10, TILE * 1.6, '#ff6a2a', 0.18);
    },
  };

  // ---- sf_sacks: props sacks [[col, ceilingRow, lenPx, sizeScale], ...]
  G.Events.sf_sacks = G.Events.sf_sacks || {
    init(e) { e.cull = false; },
    draw(e, ctx, t) {
      for (let i = 0; i < e.props.sacks.length; i++) {
        const [c, row, len, sc = 1] = e.props.sacks[i];
        const x0 = (c + 0.5) * TILE, y0 = (row + 1) * TILE;
        if (!seen(x0 - 40, y0, 80, len + 60)) continue;
        const sw = Math.sin(t * 0.7 + i * 1.9) * 0.05, bx = x0 + Math.sin(sw) * len, by = y0 + Math.cos(sw) * len;
        ctx.strokeStyle = '#2a201a'; ctx.lineWidth = 1.6; ctx.beginPath(); ctx.moveTo(x0, y0); ctx.lineTo(bx, by); ctx.stroke();
        const w = 32 * sc, h = 42 * sc;
        ctx.save(); ctx.translate(bx, by); ctx.rotate(sw * 0.8);
        ctx.fillStyle = '#5a463a';             // QA: a touch lighter + a warm rim so the sacks read in the loft's gloom
        ctx.beginPath(); ctx.moveTo(-3, 0); ctx.quadraticCurveTo(-w * 0.75, h * 0.35, -w * 0.5, h); ctx.quadraticCurveTo(0, h * 1.12, w * 0.5, h);
        ctx.quadraticCurveTo(w * 0.75, h * 0.35, 3, 0); ctx.closePath(); ctx.fill();
        ctx.strokeStyle = 'rgba(255,170,120,0.22)'; ctx.lineWidth = 1.5; ctx.stroke();
        ctx.fillStyle = 'rgba(255,160,110,0.16)'; ctx.beginPath(); ctx.ellipse(-w * 0.2, h * 0.55, w * 0.16, h * 0.3, 0.2, 0, TAU); ctx.fill();
        ctx.strokeStyle = 'rgba(20,12,8,0.5)'; ctx.lineWidth = 1.2;
        ctx.beginPath(); ctx.moveTo(-w * 0.1, h * 0.15); ctx.quadraticCurveTo(w * 0.05, h * 0.6, -w * 0.05, h * 0.95); ctx.stroke();
        ctx.fillStyle = '#4a3a30'; ctx.fillRect(-4, 1, 8, 3);
        if (h01(i, 5) < 0.5) { ctx.fillStyle = 'rgba(10,8,6,0.6)'; ctx.fillRect(-w * 0.3, h * 0.92, w * 0.6, 3); }
        ctx.restore();
        if (h01(i + Math.floor(t * 0.5), 9) < 0.004 && G.fx) sfSmoke(bx, by + h, 0.4);   // a sift of soot now and then
      }
    },
  };

  // ---- sf_rack: props (marker = the floor tile above the ground, centre col)
  function paintRack(x, w, h) {
    const iron = '#2a2422', lite = 'rgba(255,170,110,0.35)';
    x.fillStyle = iron;
    x.fillRect(4, 6, 4, h - 6); x.fillRect(w - 8, 6, 4, h - 6); x.fillRect(w / 2 - 2, 10, 3, h - 10);
    for (const yy of [16, 40, 62]) { x.fillStyle = iron; x.fillRect(0, yy, w, 4); x.fillStyle = lite; x.fillRect(0, yy, w, 1); }
    for (let k = 0; k < 5; k++) {                  // glass panes cooling on the shelves, faintly glowing
      const px = 8 + k * ((w - 22) / 4), yy = k % 2 ? 40 : 62;
      x.fillStyle = 'rgba(255,190,130,0.22)'; x.fillRect(px, yy - 14, 10, 14);
      x.fillStyle = 'rgba(255,230,200,0.45)'; x.fillRect(px + 2, yy - 13, 2, 12);
    }
    x.fillStyle = '#1a1412'; x.fillRect(0, 2, w, 5);
  }
  G.Events.sf_rack = G.Events.sf_rack || {
    init(e) { e.cull = false; },
    draw(e, ctx, t) {
      const W = 92, Hh = 84, x = e.cx - W / 2, y = e.bottom - Hh;
      if (!seen(x, y, W, Hh)) return;
      ctx.drawImage(sfSprite('sf_rack', W, Hh, paintRack), x, y);
      glow(ctx, e.cx, y + 30, TILE * 1.5, '#ffb070', 0.16 + 0.04 * Math.sin(t * 2));
    },
  };

  // ---- sf_pipe: props c0 c1 (cols incl.), r0 r1 (rows incl.: the pipe's diameter), flange (tiles between flanges), drip
  function paintPipe(x, w, h, step) {
    const g = x.createLinearGradient(0, 0, 0, h);
    g.addColorStop(0, '#1c1614'); g.addColorStop(0.18, '#5a4a42'); g.addColorStop(0.34, '#3a302c'); g.addColorStop(0.75, '#1e1816'); g.addColorStop(1, '#0c0908');
    x.fillStyle = g; x.fillRect(0, 2, w, h - 4);
    x.fillStyle = 'rgba(255,170,120,0.18)'; x.fillRect(0, h * 0.2, w, 2);
    for (let fx = step * TILE * 0.5; fx < w; fx += step * TILE) {
      x.fillStyle = '#141010'; x.fillRect(fx - 7, 0, 14, h);
      x.fillStyle = 'rgba(255,170,120,0.2)'; x.fillRect(fx - 7, 0, 2, h);
      x.fillStyle = '#4a3c36'; for (let ry = 6; ry < h - 4; ry += 12) x.fillRect(fx - 2, ry, 4, 4);
    }
    for (let k = 0; k < w / 50; k++) { x.fillStyle = 'rgba(120,60,30,' + (0.08 + h01(k, 3) * 0.12).toFixed(2) + ')'; x.fillRect(h01(k, 4) * w, h * (0.4 + h01(k, 5) * 0.4), 10 + h01(k, 6) * 30, 3); }
  }
  G.Events.sf_pipe = G.Events.sf_pipe || {
    init(e) {
      e.cull = false;
      const p = e.props;
      e.data.r = { x: p.c0 * TILE - 6, y: p.r0 * TILE, w: (p.c1 - p.c0 + 1) * TILE + 12, h: (p.r1 - p.r0 + 1) * TILE };
    },
    update(e, dt) {
      const p = e.props, r = e.data.r;
      if (!p.drip || !seen(r.x, r.y, r.w, r.h + 120)) return;
      e.data.acc = (e.data.acc || 0) + dt * 1.6;
      if (e.data.acc > 1 && G.fx && G.fx.spawn) {
        e.data.acc -= 1;
        G.fx.spawn({ x: r.x + 20 + Math.random() * (r.w - 40), y: r.y + r.h - 2, vx: 0, vy: 30, gravity: 900, life: 0.9, size: 1.8, color: '#c8b8a8', alpha: 0.7, shape: 'drop' });
      }
    },
    draw(e, ctx) {
      const p = e.props, r = e.data.r;
      if (!seen(r.x, r.y, r.w, r.h)) return;
      ctx.drawImage(sfSprite('sf_pipe:' + r.w + 'x' + r.h + ':' + (p.flange || 4), r.w, r.h, (x, w, h) => paintPipe(x, w, h, p.flange || 4)), r.x, r.y);
    },
  };

  // ---- sf_door: props c (jamb col), r0 r1 (opening rows incl.), side 'E'|'W'
  function paintDoor(x, w, h) {
    const iron = '#241c1a';
    x.fillStyle = iron; x.fillRect(0, 0, 18, h); x.fillRect(w - 18, 0, 18, h); x.fillRect(0, 0, w, 20);
    x.fillStyle = 'rgba(255,150,90,0.3)'; x.fillRect(16, 18, 2, h - 18); x.fillRect(w - 18, 18, 2, h - 18); x.fillRect(0, 18, w, 2);
    x.fillStyle = '#4a3c34'; for (let y = 8; y < h; y += 14) { x.fillRect(6, y, 5, 5); x.fillRect(w - 11, y, 5, 5); }
    for (let k = 10; k < w - 10; k += 14) x.fillRect(k, 7, 5, 5);
    // the swung-open door leaf, bolted against the wall
    x.fillStyle = '#1a1412'; x.fillRect(w - 14, 22, 12, h - 24);
  }
  G.Events.sf_door = G.Events.sf_door || {
    init(e) {
      e.cull = false;
      const p = e.props;
      e.data.r = { x: p.c * TILE - 10, y: (p.r0 - 1) * TILE + 8, w: TILE * 3 + 20, h: (p.r1 - p.r0 + 2) * TILE - 8 };
    },
    draw(e, ctx, t) {
      const r = e.data.r;
      if (!seen(r.x, r.y, r.w, r.h)) return;
      glow(ctx, r.x + r.w, r.y + r.h * 0.6, TILE * 3, '#ff5a1a', 0.3 + 0.06 * Math.sin(t * 2.2));
      ctx.drawImage(sfSprite('sf_door:' + r.w + 'x' + r.h, r.w, r.h, paintDoor), r.x, r.y);
    },
  };

  // ---- sf_sky: the open dusk sky over Ash Ridge (sf_01, z < -10: drawn over the parallax background, behind the
  // terrain). The region background recipe closes the top of every room with a soot ceiling (stalactites, hanging
  // chains); on the surface that read as a cave. This paints a screen-fixed, smoke-choked dusk sky over the upper
  // part of the view (opaque at the top, fading out over the chimney field), a veiled moon and slow cloud banks.
  // props: h (fraction of the view height covered, default 0.45), moon [fx, fy] (fraction of the view).
  function paintSky(x, w, h, p) {
    const g = x.createLinearGradient(0, 0, 0, h);
    g.addColorStop(0, '#0a0506'); g.addColorStop(0.3, '#160a09');
    g.addColorStop(0.55, 'rgba(36,15,11,0.82)'); g.addColorStop(0.8, 'rgba(52,20,12,0.35)'); g.addColorStop(1, 'rgba(60,22,12,0)');
    x.fillStyle = g; x.fillRect(0, 0, w, h);
    const m = p.moon || [0.7, 0.2], mx = m[0] * G.CONST.VIEW_W + 160, my = m[1] * G.CONST.VIEW_H, mr = 24;
    const hg = x.createRadialGradient(mx, my, mr * 0.6, mx, my, mr * 5);
    hg.addColorStop(0, 'rgba(230,170,130,0.16)'); hg.addColorStop(1, 'rgba(230,170,130,0)');
    x.fillStyle = hg; x.fillRect(mx - mr * 5, my - mr * 5, mr * 10, mr * 10);
    const dg = x.createRadialGradient(mx - mr * 0.3, my - mr * 0.3, 0, mx, my, mr);
    dg.addColorStop(0, 'rgba(250,222,190,0.78)'); dg.addColorStop(1, 'rgba(226,150,104,0.55)');
    x.fillStyle = dg; x.beginPath(); x.arc(mx, my, mr, 0, Math.PI * 2); x.fill();
  }
  function paintClouds(x, w, h) {
    for (let i = 0; i < 46; i++) {
      const cy = (0.08 + h01(i, 2) * 0.5) * h, rx = 70 + h01(i, 3) * 170, ry = rx * (0.16 + h01(i, 4) * 0.1);
      const lit = cy / h;                                   // lower banks catch more of the furnace glow
      for (const cx of [h01(i, 1) * w, h01(i, 1) * w - w, h01(i, 1) * w + w]) {
        if (cx + rx < 0 || cx - rx > w) continue;
        x.save(); x.translate(cx, cy); x.scale(1, ry / rx);
        let g = x.createRadialGradient(0, 0, 0, 0, 0, rx);
        g.addColorStop(0, 'rgba(14,7,6,' + (0.42 + 0.2 * h01(i, 5)).toFixed(3) + ')'); g.addColorStop(1, 'rgba(14,7,6,0)');
        x.fillStyle = g; x.fillRect(-rx, -rx, rx * 2, rx * 2);
        // the underside lit red by the furnaces below
        x.translate(0, rx * 0.42);
        g = x.createRadialGradient(0, 0, 0, 0, 0, rx * 0.8);
        g.addColorStop(0, 'rgba(170,64,30,' + (0.05 + 0.12 * lit).toFixed(3) + ')'); g.addColorStop(1, 'rgba(170,64,30,0)');
        x.fillStyle = g; x.fillRect(-rx, -rx, rx * 2, rx * 2);
        x.restore();
      }
    }
  }
  G.Events.sf_sky = G.Events.sf_sky || {
    init(e) { e.cull = false; },
    draw(e, ctx) {
      // one cached canvas (gradient + moon + cloud banks), a little wider than the view for a slow parallax: one blit
      const cam = G.camera; if (!cam) return;
      const p = e.props, W = G.CONST.VIEW_W, PAR = 320, H = Math.round((p.h || 0.45) * G.CONST.VIEW_H);
      const img = sfSprite('sf_sky:' + H + ':' + (p.moon || ''), W + PAR, H, (x, w, h) => { paintSky(x, w, h, p); paintClouds(x, w, h); });
      const room = G.game && G.game.room, span = room ? Math.max(1, room.cols * TILE - W) : 1;
      const off = Math.round(PAR * Math.max(0, Math.min(1, cam.x / span)));
      ctx.drawImage(img, Math.round(cam.x - (cam.shakeX || 0)) - off, Math.round(cam.y - (cam.shakeY || 0)));
    },
  };

  // test/inspection hooks (contact sheet, scripted fights)
  G.FlueEnemies = { SootSprite, ChimneyCrawler, Stoker, AshBat, CrawlerAsh, StokerCoal, POSE };
})();
