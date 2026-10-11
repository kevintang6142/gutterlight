// src/entities/enemy_base.js — G.Enemy base (config, hit reactions, death → wax puddle, drops, contact
// damage), the behaviour toolkit (state machine + timers, ground/flying/surface-crawler movement, sight,
// arcs, telegraphs, shooting, ambush, minions, room safety), G.registerEnemy + the 'enemy' entity type,
// G.Projectile (orb / glob / shard / wave) and telegraph warning zones. API guide: docs/api/enemies.md.
(function () {
  'use strict';
  const G = globalThis.G;
  const TILE = G.CONST.TILE;
  const GRAV = G.CONST.GRAVITY, MAX_FALL = G.CONST.MAX_FALL;
  const T = G.T;
  const TAU = Math.PI * 2;
  const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
  const approach = (cur, target, d) => (cur < target ? Math.min(cur + d, target) : Math.max(cur - d, target));
  const sgn = (v) => (v > 0 ? 1 : v < 0 ? -1 : 0);
  const rnd = (a, b) => a + Math.random() * (b - a);
  const overlap = (a, b) => a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y;
  const centerOf = (e) => ({ x: e.x + (e.w || 0) / 2, y: e.y + (e.h || 0) / 2 });

  const MIN_TELEGRAPH = 0.35;   // DESIGN: every normal enemy attack is telegraphed at least this long
  const FLASH_TIME = 0.12;      // white hit flash
  const KB_TIME = 0.14;         // knockback duration

  // ------------------------------------------------------------------ extra sfx (only if audio lacks them)
  // The audio module owns sound design; these guarded fallbacks only fill names it does not define.
  (function defineFallbackSfx() {
    const A = G.Audio;
    if (!A || typeof A.defineSfx !== 'function') return;
    const have = typeof A.sfxNames === 'function' ? A.sfxNames() : [];
    if (have.indexOf('enemy_windup') < 0) {
      A.defineSfx('enemy_windup', {
        vol: 4.5, reverb: 0.12,
        play(k) {
          const v = k.r(0.95, 1.06);
          k.noise({ bp: 520 * v, bp1: 2100 * v, Q: 2.2, a: 0.14, d: 0.22, g: 0.12, sweep: 0.32 });
          k.tone({ f: 196 * v, f1: 392 * v, glide: 0.3, a: 0.05, d: 0.34, g: 0.07, type: 'triangle', lp: 1600 });
          k.tone({ f: 1180 * v, a: 0.002, d: 0.12, g: 0.025, at: 0.02 });
        },
      });
    }
  })();

  // ------------------------------------------------------------------ defaults
  const DEFAULTS = {
    hp: 10,
    w: 32, h: 32,
    contactDamage: 1,
    cinders: [2, 5],          // [min, max] dropped on death (0 = none)
    weight: 1,                // knockback divisor: 0.5 light · 1 normal · 2 heavy · >= 10 immovable
    knockback: 320,           // base knockback speed px/s (divided by weight)
    hitStun: null,            // AI pause per hit (s); null → 0.12 if weight <= 1 else 0
    gravity: 1,               // × G.CONST.GRAVITY (0 = none)
    flying: false,            // gravity 0, anchor 'center', 2-axis knockback, corpse falls on death
    physics: 'auto',          // 'auto': base integrates vx/vy each step · 'manual': you move yourself
    sight: 8 * TILE,          // canSee() default range (px)
    hurtable: true,
    pogoable: true,
    contactInset: 3,          // contact box = own box shrunk by this (forgiving)
    hitstop: 0.03,            // on connecting nail hits
    hitSound: 'enemy_hit',
    deathSound: 'enemy_die',
    colors: null,             // {body, dark, hit, puddle, smoke, tele}
    meltTime: 0.55,           // body melts into the puddle (s)
    puddleTime: 2.6,          // puddle lingers (s) then fades
    puddleW: null,            // puddle max half-width (default 0.75 × w)
    light: null,              // {r, color, intensity, dx, dy} auto-added each step while alive
    z: -1,                    // behind the player, in front of terrain
    minTelegraph: MIN_TELEGRAPH,
    noSpawnShift: false,      // true: never nudged away from the player on spawn (contact grace only)
  };
  const DEFAULT_COLORS = { body: '#8f99a8', dark: '#4d5462', hit: '#dfe4ec', puddle: null, smoke: '#7e879a', tele: '#ffe2a8' };

  let uidCounter = 0;
  let scratch = null; // shared offscreen canvas for hit flashes

  function getScratch(w, h) {
    if (!scratch || scratch.canvas.width < w || scratch.canvas.height < h) {
      const nw = Math.max(w, scratch ? scratch.canvas.width : 0), nh = Math.max(h, scratch ? scratch.canvas.height : 0);
      scratch = G.U.makeCanvas(Math.ceil(nw / 64) * 64, Math.ceil(nh / 64) * 64);
    }
    return scratch;
  }

  // =====================================================================================================
  // G.Enemy
  // =====================================================================================================
  class Enemy extends G.Entity {
    /** props: room data ({type:'enemy', kind, tx, ty, id?, persistent?, hp?, cinders?, facing?}); cfg: see DEFAULTS. */
    constructor(props, cfg) {
      super(props);
      const p = this.props;
      const c = Object.assign({}, DEFAULTS, cfg || {});
      if (p.hp != null) c.hp = +p.hp;
      if (p.cinders != null) c.cinders = p.cinders;
      if (p.noDrops) c.cinders = 0;
      this.cfg = c;
      this.kind = p.kind || c.kind || this.type;
      this.uid = ++uidCounter;
      this.w = c.w; this.h = c.h;
      this.team = 'enemy';
      this.hurtable = c.hurtable !== false;
      this.pogoable = c.pogoable !== false;
      this.contactDamage = c.contactDamage;
      this.baseContact = c.contactDamage;
      this.hp = this.maxHp = c.hp;
      this.weight = c.weight;
      this.flying = !!c.flying;
      this.gravityScale = this.flying ? 0 : c.gravity;
      this.anchor = c.anchor || (this.flying ? 'center' : 'ground');
      this.sight = c.sight;
      this.z = c.z;
      this.colors = Object.assign({}, DEFAULT_COLORS, c.colors || {});
      if (!this.colors.puddle) this.colors.puddle = this.colors.body;
      this.minTelegraph = c.minTelegraph;
      // facing: props.facing (1|-1|'left'|'right') or props.flip; else random for variety
      const f = p.facing;
      this.facing = f === 'left' || f === -1 ? -1 : f === 'right' || f === 1 ? 1 : p.flip ? -1 : (Math.random() < 0.5 ? -1 : 1);
      this.seed = (this.x * 0.137 + this.y * 0.311 + (zoneSerial++) * 7.77) % 1000;   // no Math.random: easy stays bit-identical
      // runtime state
      this.state = null; this.prevState = null; this.stateTime = 0; this.stateData = {};
      this._prevST = -1; this._stFresh = true; this._once = null;
      this.strikeSerial = 0;
      this.cds = Object.create(null);
      this.flashT = 0;
      this.stun = 0;
      this.kbTime = 0; this.kbVx = 0; this.kbVy = 0;
      this.grounded = false; this.wallHit = 0; this.ceilHit = false; this.landed = false;
      this.tele = null;
      this.hidden = false;
      this.dying = false; this.deathT = 0; this.melt = 0; this.meltStarted = false; this.fade = 1;
      this.contactGrace = false;
      this._spawnChecked = false;
      this.home = null;
      this.minions = [];
      this.surf = null; this.crawlDir = this.facing; this.crawlAngle = 0; this.crawlVis = { x: 0, y: 0 };
      this._dbgRects = null;
    }

    init() {
      this.home = { x: this.cx, y: this.cy };
      if (this.state == null) this.setState('idle');
    }

    // ---------------------------------------------------------------- main loop (do not override; use think)
    update(dt) {
      if (this.dying) { this.updateDeath(dt); return; }
      if (!this.home) this.home = { x: this.cx, y: this.cy };
      if (!this._spawnChecked) this.spawnCheck();
      if (this.flashT > 0) this.flashT = Math.max(0, this.flashT - dt);
      for (const k in this.cds) if (this.cds[k] > 0) this.cds[k] -= dt;
      if (this.tele) { this.tele.t += dt; if (this.tele.t >= this.tele.dur + 0.25) this.tele = null; }
      if (!this._stFresh) this._prevST = this.stateTime;
      this._stFresh = false;
      this.stateTime += dt;
      this.landed = false;
      if (this.stun > 0) {
        this.stun -= dt;
        if (this.flying) { this.vx = approach(this.vx, 0, 900 * dt); this.vy = approach(this.vy, 0, 900 * dt); }
        else if (this.grounded) this.vx = 0;
        this.whileStunned(dt);
      } else {
        this.think(dt);
      }
      if (this.dying || this.dead) return; // think() may have killed/removed us
      if (this.cfg.physics !== 'manual') this.physicsStep(dt);
      else if (this.kbTime > 0) this.kbTime -= dt;
      this.keepInRoom();
      if (this.contactGrace && !this.overlapsPlayer(6)) this.contactGrace = false;
      if (this.cfg.light && !this.hidden) {
        const L = this.cfg.light;
        if (G.lighting) G.lighting.add({ x: this.cx + (L.dx || 0) * this.facing, y: this.cy + (L.dy || 0), r: L.r || 80, color: L.color || '#ffffff', intensity: L.intensity == null ? 0.5 : L.intensity, flicker: !!L.flicker });
      }
    }

    /** AI: override. Called every step unless stunned or dying. Set vx/vy or call behaviours. */
    think(dt) { void dt; }
    /** Called each step while hit-stunned (AI paused). */
    whileStunned(dt) { void dt; }

    // ---------------------------------------------------------------- state machine & timers
    /** Enter a state: resets stateTime, `once()` keys and the strike id. Calls onEnter(name, prev). */
    setState(name, data) {
      const prev = this.state;
      if (prev != null && typeof this.onExit === 'function') this.onExit(prev, name);
      this.prevState = prev;
      this.state = name;
      this.stateTime = 0; this._prevST = -1; this._stFresh = true;
      this.stateData = data || {};
      this._once = null;
      this.strikeSerial++;
      if (typeof this.onEnter === 'function') this.onEnter(name, prev);
    }
    is(name) { return this.state === name; }
    /** True on exactly one step: the one where stateTime crosses `time` (s). Timeline scripting. */
    at(time) { return this._prevST < time && this.stateTime >= time; }
    /** True the first time it is called with `key` in the current state. */
    once(key) {
      if (!this._once) this._once = new Set();
      if (this._once.has(key)) return false;
      this._once.add(key);
      return true;
    }
    /** Every `period` seconds within the state (true on the crossing step). */
    every(period, offset) {
      const o = offset || 0;
      const b = this.stateTime - o, a = this._prevST - o;
      if (b < 0) return false;
      if (a < 0) return true;
      return Math.floor(a / period) !== Math.floor(b / period);
    }
    cooldown(name, sec) { this.cds[name] = sec; }
    ready(name) { return !(this.cds[name] > 0); }

    // ---------------------------------------------------------------- physics
    physicsStep(dt) {
      const room = this.room;
      if (!room) return;
      const kb = this.kbTime > 0;
      let k = 0;
      if (kb) { k = this.kbTime / KB_TIME; this.kbTime -= dt; }
      let vx = kb ? this.kbVx * (0.35 + 0.65 * k) : this.vx;
      let vy;
      if (this.flying) vy = kb ? this.kbVy * (0.35 + 0.65 * k) : this.vy;
      else {
        if (this.gravityScale) this.vy = Math.min(this.vy + GRAV * this.gravityScale * dt, MAX_FALL);
        vy = this.vy;
      }
      const fallV = this.vy;
      const r = G.Physics.move(this, room, vx * dt, vy * dt);
      this.wallHit = r.hitX;
      this.ceilHit = r.hitY < 0;
      if (this.flying) {
        if (r.hitX) { this.vx = 0; if (kb) this.kbVx = 0; }
        if (r.hitY) { this.vy = 0; if (kb) this.kbVy = 0; }
        this.grounded = r.hitY > 0;
      } else {
        if (r.hitY > 0) { if (fallV > 220) this.landed = true; this.vy = 0; }
        else if (r.hitY < 0 && this.vy < 0) this.vy = 0;
        this.grounded = r.hitY > 0 || (this.vy >= 0 && G.Physics.onGround(room, this));
        if (kb && r.hitX) this.kbVx = 0;
      }
    }

    /** Room-bounds safety: never leave through openings; removed when fallen out of the room. */
    keepInRoom() {
      const room = this.room;
      if (!room) return;
      const W = room.widthPx, H = room.heightPx;
      if (this.x < 0) { this.x = 0; if (this.vx < 0) this.wallHit = -1; }
      if (this.x + this.w > W) { this.x = W - this.w; if (this.vx > 0) this.wallHit = 1; }
      if (this.flying || this.surf) {
        if (this.y < 0) { this.y = 0; if (this.vy < 0) this.vy = 0; }
        if (this.y + this.h > H) { this.y = H - this.h; if (this.vy > 0) this.vy = 0; }
      } else if (this.y < -this.h * 2) this.y = -this.h * 2;
      if (this.y > H + 60) this.fellOut();
    }
    /** Fell out of the room (bottom opening / pit): silently removed (no drops). */
    fellOut() { this.remove(); }

    /** On the first step: never start overlapping the player (nudge sideways or suspend contact damage). */
    spawnCheck() {
      this._spawnChecked = true;
      const p = this.player;
      if (!p || !this.room || !this.overlapsPlayer(24)) return;
      if (!this.cfg.noSpawnShift) {
        const away = this.cx >= p.x + p.w / 2 ? 1 : -1;
        const room = this.room, x0 = this.x;
        for (let s = 1; s <= 12; s++) {
          for (const d of [away, -away]) {
            const nx = x0 + d * s * 16;
            if (nx < 0 || nx + this.w > room.widthPx) continue;
            if (G.Physics.rectSolid(room, nx, this.y, this.w, this.h)) continue;
            if (!this.flying && !G.Physics.rectSolid(room, nx + 2, this.y + this.h + 1, this.w - 4, 4) && !this.platformAt(nx + this.w / 2, this.y + this.h + 2)) continue;
            const test = { x: nx - 24, y: this.y - 24, w: this.w + 48, h: this.h + 48 };
            if (overlap(test, p)) continue;
            this.x = nx;
            this.home = { x: this.cx, y: this.cy };
            return;
          }
        }
      }
      this.contactGrace = true;
    }

    // ---------------------------------------------------------------- queries
    get airborne() { return !this.flying && !this.grounded; }
    targetable(p) {
      p = p || this.player;
      return !!(p && !p.dead && !p.hidden && G.game && G.game.mode === 'play');
    }
    dx(target) { target = target || this.player; return target ? (target.x + target.w / 2) - this.cx : 0; }
    dy(target) { target = target || this.player; return target ? (target.y + target.h / 2) - this.cy : 0; }
    dist(target) { target = target || this.player; return target ? Math.hypot(this.dx(target), this.dy(target)) : Infinity; }
    dirTo(target) { return this.dx(target) >= 0 ? 1 : -1; }
    face(target) { const d = this.dx(target); if (Math.abs(d) > 4) this.facing = d > 0 ? 1 : -1; return this.facing; }
    overlapsPlayer(pad) {
      const p = this.player;
      if (!p) return false;
      const m = pad || 0;
      return overlap({ x: this.x - m, y: this.y - m, w: this.w + 2 * m, h: this.h + 2 * m }, p);
    }
    /** Eye point used for line of sight. Override for unusual bodies. */
    eye() { return { x: this.cx, y: this.y + this.h * 0.35 }; }
    /** Line of sight to the target (default player) within range (default cfg.sight). Solid tiles block. */
    canSee(target, range) {
      target = target || this.player;
      if (!this.room || !this.targetable(target)) return false;
      const e = this.eye(), t = centerOf(target);
      const r = range == null ? this.sight : range;
      if (Math.hypot(t.x - e.x, t.y - e.y) > r) return false;
      if (!G.Physics.raycast(this.room, e.x, e.y, t.x, t.y).hit) return true;
      // also try the target's head (peeking over a ledge)
      return !G.Physics.raycast(this.room, e.x, e.y, t.x, target.y + 6).hit;
    }
    solidAt(x, y) { return G.Physics.isSolidTile(this.room.tileAt(Math.floor(x / TILE), Math.floor(y / TILE))); }
    platformAt(x, y) { return this.room.tileAt(Math.floor(x / TILE), Math.floor(y / TILE)) === T.PLATFORM; }
    /** No floor ahead in direction dir (±1)? Probes just past the front edge below the feet. */
    ledgeAhead(dir, look) {
      if (!this.room) return false;
      const l = look == null ? 2 : look;
      const px = dir > 0 ? this.x + this.w + l : this.x - l, py = this.y + this.h + 3;
      if (this.solidAt(px, py) || this.platformAt(px, py)) return false;
      return !G.Physics.rectSolid(this.room, px - 1, this.y + this.h + 1, 2, 4);
    }
    wallAhead(dir, look) {
      if (!this.room) return false;
      const l = look == null ? 2 : look;
      const px = dir > 0 ? this.x + this.w : this.x - l;
      return G.Physics.rectSolid(this.room, px, this.y + 2, l, Math.max(2, this.h - 6));
    }
    /** Spikes/lava/water directly ahead at the feet or under the next step. */
    hazardAhead(dir, look) {
      if (!this.room) return false;
      const l = look == null ? 2 : look;
      const px = dir > 0 ? this.x + this.w + l : this.x - l;
      const c = Math.floor(px / TILE);
      const below = this.room.tileAt(c, Math.floor((this.y + this.h + 3) / TILE));
      const feet = this.room.tileAt(c, Math.floor((this.y + this.h - 3) / TILE));
      return G.Physics.isHazardTile(below) || G.Physics.isHazardTile(feet);
    }
    /** Wall, ledge (unless o.ledges === false) or hazard (unless o.hazards === false) ahead. */
    blockedAhead(dir, o) {
      o = o || {};
      if (this.wallHit === dir || this.wallAhead(dir)) return true;
      if (this.room && (dir > 0 ? this.x + this.w >= this.room.widthPx - 1 : this.x <= 1)) return true;
      if (!this.flying && o.ledges !== false && this.ledgeAhead(dir)) return true;
      if (!this.flying && o.hazards !== false && this.hazardAhead(dir)) return true;
      return false;
    }

    // ---------------------------------------------------------------- ground behaviours
    /** Walk back and forth, turning at walls, ledges, hazards, room edges and o.range (px from home).
     *  o: {ledges, hazards, range, pause (s standing still after a turn)}. Returns true on the turning step. */
    patrol(speed, o) {
      o = o || {};
      if (!this.flying && !this.grounded) return false;
      if (this._patrolPause > 0) { this._patrolPause -= G.CONST.DT; this.vx = 0; return false; }
      let turn = this.blockedAhead(this.facing, o);
      if (!turn && o.range && this.home) {
        const off = this.cx - this.home.x;
        if ((this.facing > 0 && off > o.range) || (this.facing < 0 && off < -o.range)) turn = true;
      }
      if (turn) {
        this.facing = -this.facing;
        this._patrolPause = o.pause || 0;
        this.vx = o.pause ? 0 : this.facing * speed;
        if (typeof this.onTurn === 'function') this.onTurn();
        return true;
      }
      this.vx = this.facing * speed;
      return false;
    }
    /** Walk toward the target, stopping at ledges/walls (o.ledges false = walk off) and within o.stop px. */
    approach(target, speed, o) {
      o = o || {};
      target = target || this.player;
      if (!target) { this.vx = 0; return false; }
      if (!this.flying && !this.grounded) return false;
      const d = this.dx(target);
      if (Math.abs(d) > (o.turnDeadzone || 6)) this.facing = d > 0 ? 1 : -1;
      if (Math.abs(d) <= (o.stop || 0) || this.blockedAhead(this.facing, o)) { this.vx = 0; return false; }
      this.vx = this.facing * speed;
      return true;
    }
    /** Walk away from the target (faces it unless o.faceAway). Returns false when cornered. */
    flee(target, speed, o) {
      o = o || {};
      target = target || this.player;
      if (!target || (!this.flying && !this.grounded)) return false;
      const away = -this.dirTo(target);
      if (this.blockedAhead(away, o)) { this.vx = 0; this.facing = -away; return false; }
      this.vx = away * speed;
      this.facing = o.faceAway ? away : -away;
      return true;
    }
    /** Decelerate horizontally (rate px/s², default instant). */
    stop(rate) {
      if (rate) this.vx = approach(this.vx, 0, rate * G.CONST.DT);
      else this.vx = 0;
      if (this.flying) this.vy = rate ? approach(this.vy, 0, rate * G.CONST.DT) : 0;
    }
    /** Dash forward at speed; returns true (and stops) when blocked by a wall/ledge/edge (o.ledges false: run off). */
    charge(speed, o) {
      o = o || {};
      const dir = o.dir || this.facing;
      if (this.blockedAhead(dir, o)) { this.vx = 0; return true; }
      this.vx = dir * speed;
      return false;
    }
    /** Jump with the given velocity (only when grounded unless force). */
    hop(vx, vy, force) {
      if (!force && !this.grounded) return false;
      this.vx = vx; this.vy = vy; this.grounded = false;
      return true;
    }
    /** Leap so the feet land at world point (x, footY), apex `apex` px above the higher end. Returns {vx, vy, t}. */
    leapTo(x, footY, apex, o) {
      o = o || {};
      const g = GRAV * (this.gravityScale || 1);
      const sol = Enemy.solveJump(x - this.cx, footY - (this.y + this.h), g, apex == null ? 80 : apex);
      if (o.maxVx) sol.vx = clamp(sol.vx, -o.maxVx, o.maxVx);
      this.vx = sol.vx; this.vy = sol.vy; this.grounded = false;
      if (Math.abs(sol.vx) > 1) this.facing = sol.vx > 0 ? 1 : -1;
      return sol;
    }

    // ---------------------------------------------------------------- flying behaviours
    /** Bob offset: sin wave with amplitude amp (px) and frequency freq (Hz), desynced per enemy. */
    bob(amp, freq) { return Math.sin((this.t || 0) * (freq || 1) * TAU + this.seed) * (amp || 0); }
    /**
     * Steer toward the world point (tx, ty): arrive smoothly, avoid walls with 3 feeler rays.
     * o: {accel (px/s², 600), arrive (px, 60), look (px, 70), avoid (strength, 1.4)}. Returns distance.
     */
    flyTo(tx, ty, speed, dt, o) {
      o = o || {};
      const ex = tx - this.cx, ey = ty - this.cy;
      const d = Math.hypot(ex, ey);
      const arrive = o.arrive == null ? 60 : o.arrive;
      let s = speed * (arrive > 0 ? Math.min(1, d / arrive) : 1);
      let desx = d > 0.5 ? (ex / d) * s : 0, desy = d > 0.5 ? (ey / d) * s : 0;
      const room = this.room;
      if (room && (o.avoid !== 0)) {
        const vl = Math.hypot(this.vx, this.vy);
        let hx, hy;
        if (vl > 10) { hx = this.vx / vl; hy = this.vy / vl; } else if (d > 1) { hx = ex / d; hy = ey / d; } else { hx = 0; hy = 0; }
        if (hx || hy) {
          const look = (o.look == null ? 70 : o.look) + Math.max(this.w, this.h) * 0.5;
          let bx = 0, by = 0, hitAny = false, front = 0;
          for (const a of [0, 0.6, -0.6]) {
            const ca = Math.cos(a), sa = Math.sin(a);
            const fx = hx * ca - hy * sa, fy = hx * sa + hy * ca;
            const r = G.Physics.raycast(room, this.cx, this.cy, this.cx + fx * look, this.cy + fy * look);
            if (!r.hit) continue;
            const near = 1 - Math.hypot(r.x - this.cx, r.y - this.cy) / look;
            bx -= fx * near; by -= fy * near;
            hitAny = true;
            if (a === 0) front = Math.max(front, near);
            else front = Math.max(front, near * 0.5);
          }
          this._avoidT = (this._avoidT || 0) - dt;
          if (hitAny) {
            // detour: pick a side once per obstacle (toward the goal if it is off to one side) and keep it
            if (!this._avoidSide || this._avoidT <= 0) {
              const cross = hx * ey - hy * ex;
              this._avoidSide = Math.abs(cross) > d * 0.15 ? (cross > 0 ? 1 : -1) : (this.facing || 1);
            }
            this._avoidT = 0.9;
            const side = this._avoidSide;
            const k = (o.avoid == null ? 1.4 : o.avoid) * speed;
            desx += bx * k * 0.7 + -hy * side * (0.5 + front) * speed;
            desy += by * k * 0.7 + hx * side * (0.5 + front) * speed;
            const dl = Math.hypot(desx, desy);
            if (dl > speed) { desx = (desx / dl) * speed; desy = (desy / dl) * speed; }
          }
        }
      }
      const acc = (o.accel == null ? 600 : o.accel) * dt;
      this.vx = approach(this.vx, desx, acc);
      this.vy = approach(this.vy, desy, acc);
      return d;
    }
    /** Hover around (hx, hy) (default: home) with a figure-8 drift. o: {amp (px, 14), freq (Hz, 0.5), speed (px/s, 70)} + flyTo opts. */
    hover(hx, hy, dt, o) {
      o = o || {};
      const h = this.home || { x: this.cx, y: this.cy };
      const x = hx == null ? h.x : hx, y = hy == null ? h.y : hy;
      const amp = o.amp == null ? 14 : o.amp, f = o.freq == null ? 0.5 : o.freq;
      const ph = (this.t || 0) * f * TAU + this.seed;
      return this.flyTo(x + Math.sin(ph * 0.5) * amp * 1.6, y + Math.sin(ph) * amp, o.speed == null ? 70 : o.speed, dt, o);
    }

    // ---------------------------------------------------------------- surface crawler
    /**
     * Follows floors, walls and ceilings around corners (physics: 'manual'; the body must be square: w === h).
     * this.surf = {x, y}: unit direction toward the surface; this.crawlDir = ±1 (1 = rightward on a floor).
     * Falls (gravity) when detached and re-attaches to the floor. Returns 'inner' | 'outer' | 'reverse' | 'fall' | null.
     */
    crawl(speed, dt) {
      const room = this.room;
      if (!room) return null;
      if (!this.surf) this.attachSurface();
      this.crawlVis.x *= Math.max(0, 1 - dt * 14); this.crawlVis.y *= Math.max(0, 1 - dt * 14);
      if (!this.surf) { // falling
        this.vy = Math.min(this.vy + GRAV * dt, MAX_FALL);
        const r = G.Physics.move(this, room, 0, this.vy * dt);
        if (r.hitY > 0) { this.vy = 0; this.surf = { x: 0, y: 1 }; this.landed = true; }
        this.updateCrawlAngle(dt);
        return 'fall';
      }
      const d = this.surf, cd = this.crawlDir;
      const tx = d.y * cd, ty = -d.x * cd;
      const step = speed * dt;
      let result = null;
      const r = G.Physics.move(this, room, tx * step, ty * step);
      if ((tx && r.hitX === sgn(tx)) || (ty && r.hitY === sgn(ty))) {
        this.surf = { x: tx, y: ty }; // inner corner: climb the wall we ran into
        result = 'inner';
      } else if (!this.supportAt(d)) {
        result = this.outerTurn(d, tx, ty, step);
      } else {
        G.Physics.move(this, room, d.x * 0.5, d.y * 0.5); // stay pressed against the surface
      }
      this.facing = this.localFacing();
      this.updateCrawlAngle(dt);
      return result;
    }
    supportAt(d) {
      const s = Math.max(this.w, this.h) / 2 + 2;
      const px = this.cx + d.x * s, py = this.cy + d.y * s;
      if (this.solidAt(px, py)) return true;
      return d.y > 0 && this.platformAt(px, py);
    }
    outerTurn(d, tx, ty, step) {
      const s = this.w;
      const cx = this.cx, cy = this.cy;
      const nd = { x: -tx, y: -ty };
      const planeX = d.x > 0 ? this.x + this.w : this.x, planeY = d.y > 0 ? this.y + this.h : this.y;
      const edgeX = tx > 0 ? Math.floor(cx / TILE) * TILE : (Math.floor(cx / TILE) + 1) * TILE;
      const edgeY = ty > 0 ? Math.floor(cy / TILE) * TILE : (Math.floor(cy / TILE) + 1) * TILE;
      const Cx = d.x ? planeX : edgeX, Cy = d.y ? planeY : edgeY;
      const ncx = Cx - nd.x * s / 2 + d.x * s / 2, ncy = Cy - nd.y * s / 2 + d.y * s / 2;
      const nx = ncx - this.w / 2, ny = ncy - this.h / 2;
      const room = this.room;
      const free = !G.Physics.rectSolid(room, nx, ny, this.w, this.h) && nx >= 0 && ny >= 0 && nx + this.w <= room.widthPx && ny + this.h <= room.heightPx;
      const sp = s / 2 + 2;
      const supported = this.solidAt(ncx + nd.x * sp, ncy + nd.y * sp);
      if (free && supported) {
        this.crawlVis.x += cx - ncx; this.crawlVis.y += cy - ncy;
        this.x = nx; this.y = ny;
        this.surf = nd;
        return 'outer';
      }
      // cannot wrap (platform edge, room edge): turn around on the current surface
      G.Physics.move(this, room, -tx * step, -ty * step);
      this.crawlDir = -this.crawlDir;
      if (!this.supportAt(d)) { this.surf = null; return 'fall'; }
      return 'reverse';
    }
    /**
     * Find an adjacent surface (floor preferred). Sets this.surf or null (falls). props.surface
     * ('floor' | 'left' | 'right' | 'ceiling') is tried first and, on the first attach, the body is slid
     * up to one tile toward it (markers are tile-centred, so a wall/ceiling crawler starts a few px off it).
     */
    attachSurface() {
      const order = [{ x: 0, y: 1 }, { x: -1, y: 0 }, { x: 1, y: 0 }, { x: 0, y: -1 }];
      if (this.props.surface) {
        const m = { floor: 0, left: 1, right: 2, ceiling: 3 }[this.props.surface];
        if (m != null) {
          const d = order[m];
          order.unshift(d);
          if (!this._surfSnapped && this.room) {
            this._surfSnapped = true;
            const x0 = this.x, y0 = this.y;
            const r = G.Physics.move(this, this.room, d.x * TILE, d.y * TILE);
            if ((d.x && r.hitX === d.x) || (d.y && r.hitY === d.y)) {
              this.surf = d;
              this.crawlAngle = Math.atan2(-d.x, d.y);
              if (this.home) this.home = { x: this.cx, y: this.cy };
              return d;
            }
            this.x = x0; this.y = y0;
          }
        }
      }
      for (const d of order) {
        const probe = { x: this.x + d.x * 3, y: this.y + d.y * 3, w: this.w, h: this.h };
        if (G.Physics.rectSolid(this.room, probe.x, probe.y, probe.w, probe.h) || (d.y > 0 && this.supportAt(d))) {
          // snap flush against it
          G.Physics.move(this, this.room, d.x * 4, d.y * 4);
          this.surf = d;
          this.crawlAngle = Math.atan2(-d.x, d.y);
          return d;
        }
      }
      this.surf = null;
      return null;
    }
    localFacing() {
      const d = this.surf || { x: 0, y: 1 };
      const a = Math.atan2(-d.x, d.y);
      const tx = d.y * this.crawlDir, ty = -d.x * this.crawlDir;
      return (tx * Math.cos(a) + ty * Math.sin(a)) >= 0 ? 1 : -1;
    }
    updateCrawlAngle(dt) {
      const d = this.surf || { x: 0, y: 1 };
      const target = Math.atan2(-d.x, d.y);
      let diff = target - this.crawlAngle;
      while (diff > Math.PI) diff -= TAU;
      while (diff < -Math.PI) diff += TAU;
      this.crawlAngle += diff * Math.min(1, dt * 16);
    }
    /** Use in drawBody for crawlers: rotates ctx so the local floor is +y below the body centre. Returns {x, y} centre. */
    crawlTransform(ctx) {
      const x = this.cx + this.crawlVis.x, y = this.cy + this.crawlVis.y;
      ctx.translate(x, y);
      ctx.rotate(this.crawlAngle);
      return { x, y };
    }

    // ---------------------------------------------------------------- ambush
    /** Hidden enemies are not hurtable and deal no contact damage until reveal(). */
    hide() { this.hidden = true; }
    reveal() {
      if (!this.hidden) return;
      this.hidden = false;
      if (G.fx) G.fx.burst('dust', this.cx, this.y + this.h, { count: 10, color: this.colors.dark });
    }
    /** Player within range px horizontally (and within vRange vertically, default 3 tiles), optionally with sight. */
    ambushReady(range, o) {
      o = o || {};
      const p = this.player;
      if (!this.targetable(p)) return false;
      if (Math.abs(this.dx(p)) > range || Math.abs(this.dy(p)) > (o.vRange || 3 * TILE)) return false;
      return o.sight ? this.canSee(p, range * 1.5) : true;
    }

    // ---------------------------------------------------------------- telegraphs & attacks
    /**
     * Wind-up telegraph: body shake + eye glint + glow pulse + audio cue. Clamped to >= minTelegraph
     * (0.35 s for enemies) unless o.force. o: {color, shake (px), glint, sound (name|false), vol, x, y (world anchor)}.
     * Returns the duration actually used — time your attack with it.
     */
    telegraph(dur, o) {
      o = o || {};
      const d = o.force ? dur : Math.max(dur || 0, this.minTelegraph);
      this.tele = { t: 0, dur: d, color: o.color || this.colors.tele, shake: o.shake == null ? 1.6 : o.shake, glint: o.glint !== false, x: o.x, y: o.y };
      if (o.sound !== false) G.sfxAt(o.sound || 'enemy_windup', this.cx, { vol: o.vol == null ? 0.8 : o.vol });
      return d;
    }
    get telegraphing() { return !!(this.tele && this.tele.t < this.tele.dur); }
    teleAnchor() { const e = this.eye(); return { x: e.x + this.facing * this.w * 0.15, y: e.y }; }
    /** Melee hitbox for the current state (one hit per state unless o.id). o: {damage (1), dir, id}. */
    strike(rect, o) {
      o = o || {};
      if (G.debug && G.debug.overlayOn) (this._dbgRects || (this._dbgRects = [])).push({ x: rect.x, y: rect.y, w: rect.w, h: rect.h, t: 0.15 });
      return G.Combat.attack({ owner: this, team: 'enemy', rect, damage: o.damage == null ? 1 : o.damage, kind: 'enemy',
        dir: o.dir || { x: this.facing, y: 0 }, id: o.id || ('en' + this.uid + ':' + this.strikeSerial) });
    }
    /**
     * Velocity aimed from (o.x, o.y) (default eye) at the target with `speed`; o.lead 0..1 leads a moving
     * target. Returns {vx, vy, angle}.
     */
    aimAt(target, speed, o) {
      o = o || {};
      target = target || this.player;
      const e = this.eye();
      const fx = o.x == null ? e.x : o.x, fy = o.y == null ? e.y : o.y;
      return Enemy.aim(fx, fy, target, speed, o.lead || 0);
    }
    /** Spawn a projectile (default at the eye). opts = projectile props ({kind via arg, vx, vy, x, y, ...}). */
    fire(kind, o) {
      o = Object.assign({}, o || {});
      const e = this.eye();
      if (o.x == null) o.x = e.x;
      if (o.y == null) o.y = e.y;
      o.owner = this;
      if (o.sound !== false) G.sfxAt(o.sound || 'projectile', o.x, { vol: o.vol == null ? 0.8 : o.vol });
      return spawnProjectile(this.room, kind, o);
    }
    /** Fire `kind` at the target (aimAt + fire). o: fire opts + {speed (320), lead, spread (rad offset)}. */
    shootAt(kind, target, o) {
      o = Object.assign({}, o || {});
      const e = this.eye();
      const fx = o.x == null ? e.x : o.x, fy = o.y == null ? e.y : o.y;
      const a = Enemy.aim(fx, fy, target || this.player, o.speed || 320, o.lead || 0);
      let ang = a.angle + (o.spread || 0);
      const s = o.speed || 320;
      o.x = fx; o.y = fy; o.vx = Math.cos(ang) * s; o.vy = Math.sin(ang) * s;
      return this.fire(kind, o);
    }
    /** Lob a gravity projectile to land on the target in o.time s (default from distance). */
    lob(kind, target, o) {
      o = Object.assign({}, o || {});
      target = target || this.player;
      const e = this.eye();
      const fx = o.x == null ? e.x : o.x, fy = o.y == null ? e.y : o.y;
      const tc = target ? centerOf(target) : { x: fx + this.facing * 200, y: fy };
      const g = o.gravity == null ? (PROJ_DEFAULTS[kind] && PROJ_DEFAULTS[kind].gravity) || 1200 : o.gravity;
      const dist = Math.hypot(tc.x - fx, tc.y - fy);
      const time = o.time || clamp(dist / 420, 0.55, 1.3);
      const v = Enemy.solveArcTime(tc.x - fx, tc.y - fy, g, time);
      o.x = fx; o.y = fy; o.vx = v.vx; o.vy = v.vy; o.gravity = g;
      return this.fire(kind, o);
    }
    /** Spawn a minion enemy (no drops by default). Returns it; tracked in this.minions. */
    summon(kind, x, y, props) {
      if (!this.room) return null;
      const pr = Object.assign({ type: 'enemy', kind, noDrops: true, minion: true, summoner: this }, props || {});
      const e = G.Entity.create(pr);
      if (!e) return null;
      e.x = x - e.w / 2;
      e.y = e.flying ? y - e.h / 2 : y - e.h;
      this.room.add(e);
      e.contactGrace = e.overlapsPlayer ? e.overlapsPlayer(0) : false;
      this.minions.push(e);
      return e;
    }
    liveMinions() {
      this.minions = this.minions.filter((m) => !m.dead && !m.dying);
      return this.minions.length;
    }
    killMinions() { for (const m of this.minions) if (!m.dead && !m.dying && m.kill) m.kill(); this.minions.length = 0; }

    // ---------------------------------------------------------------- damage
    hurtRect() { return (this.hidden || this.dying) ? null : this; }
    contactRect() {
      if (this.dying || this.hidden || this.contactGrace) return null;
      const i = this.cfg.contactInset || 0;
      return { x: this.x + i, y: this.y + i, w: Math.max(2, this.w - 2 * i), h: Math.max(2, this.h - 2 * i) };
    }
    /** Override to reduce damage (armour); return 0 to deflect (the hit still "connects": recoil, clink). */
    modifyDamage(dmg, hit) { void hit; return dmg; }

    onHit(hit) {
      if (this.dying || this.hidden || !this.hurtable) return false;
      hit = hit || { damage: 0, dir: { x: 0, y: 0 } };
      const dmg = Math.max(0, +this.modifyDamage(hit.damage || 0, hit) || 0);
      const src = hit.source ? centerOf(hit.source) : null;
      if (dmg <= 0) { this.deflect(hit, src); return true; }
      this.hp -= dmg;
      this.flashT = FLASH_TIME;
      this.applyKnockback(hit, src);
      this.hitFx(hit, src);
      G.sfxAt(this.cfg.hitSound, this.cx, { vol: 0.9, pitch: rnd(0.94, 1.06) });
      if (hit.kind === 'nail' && G.game && this.cfg.hitstop) G.game.hitstop(this.cfg.hitstop);
      if (typeof this.onHurt === 'function') this.onHurt(hit, dmg);
      if (this.hp <= 0 && !this.dying) this.die(hit);
      return true;
    }
    deflect(hit, src) {
      const px = src ? clamp(src.x, this.x, this.x + this.w) : this.cx, py = src ? clamp(src.y, this.y, this.y + this.h) : this.cy;
      if (G.fx) G.fx.burst('spark', px, py, { count: 7, color: '#fff2c8', speed: 380 });
      G.sfxAt('slash_wall', this.cx, { vol: 0.9 });
    }
    applyKnockback(hit, src) {
      if (this.weight >= 10 || this.surf || this.cfg.physics === 'manual') {
        this.stun = Math.max(this.stun, this.hitStunTime());
        return;
      }
      let dx = (hit.dir && hit.dir.x) || 0, dy = (hit.dir && hit.dir.y) || 0;
      const away = src ? (this.cx >= src.x ? 1 : -1) : -this.facing;
      if (!dx && !dy) dx = away;
      const k = (this.cfg.knockback || 0) / Math.max(0.2, this.weight);
      if (this.flying) { this.kbVx = (dx || away * 0.3) * k; this.kbVy = dy * k * 0.8; }
      else this.kbVx = (dx || away * 0.35) * k;
      this.kbTime = KB_TIME;
      this.stun = Math.max(this.stun, this.hitStunTime());
    }
    hitStunTime() { return this.cfg.hitStun != null ? this.cfg.hitStun : (this.weight <= 1 ? 0.12 : 0); }
    hitFx(hit, src) {
      if (!G.fx) return;
      const px = src ? clamp(src.x, this.x + 4, this.x + this.w - 4) : this.cx;
      const py = src ? clamp(src.y, this.y + 4, this.y + this.h - 4) : this.cy;
      const dx = (hit.dir && hit.dir.x) || (src ? (this.cx >= src.x ? 1 : -1) : 0), dy = (hit.dir && hit.dir.y) || 0;
      const ang = Math.atan2(dy, dx || 0.0001);
      G.fx.burst('flash', px, py, { r: 26 + Math.min(this.w, 80) * 0.25, color: '#ffffff', life: 0.1 });
      G.fx.burst('spark', px, py, { count: 6, color: '#ffffff', angle: ang, spread: 1.6, speed: 460 });
      G.fx.burst('wax', px, py, { count: 5, color: this.colors.hit, angle: ang - (dy ? 0 : 0.5 * Math.sign(dx || 1)), spread: 1.2, speed: 260 });
    }

    // ---------------------------------------------------------------- death
    /** Instant kill (debug / scripted). */
    kill() { if (!this.dying) { this.hp = 0; this.die({ damage: 0, kind: 'debug', dir: { x: 0, y: -1 }, source: null }); } }

    die(hit) {
      if (this.dying) return;
      this.dying = true;
      this.hp = 0;
      this.hurtable = false;
      this.contactDamage = 0;
      this.tele = null;
      this.flashT = FLASH_TIME;
      this.deathT = 0; this.melt = 0; this.fade = 1;
      this.meltStarted = !this.flying && !this.surf;
      const d = (hit && hit.dir) || { x: 0, y: 0 };
      this.vx = (d.x || 0) * 140; this.vy = this.flying ? -140 : 0;
      this.corpseSpin = (d.x || (Math.random() < 0.5 ? 1 : -1)) * rnd(4, 7);
      this.corpseRot = 0;
      this.deathFx(hit);
      G.sfxAt(this.cfg.deathSound, this.cx, { vol: 1, pitch: rnd(0.95, 1.05) });
      this.dropLoot();
      this.markDead();
      if (typeof this.onDeath === 'function') this.onDeath(hit);
      G.events.emit('enemyKilled', { enemy: this });
    }
    dropLoot() {
      const c = this.cfg.cinders;
      if (!c || this.props.noDrops) return 0;
      const n = Array.isArray(c) ? Math.round(rnd(c[0], (c[1] == null ? c[0] : c[1]) + 0.999) - 0.5) : +c;
      const amt = Math.max(0, Math.floor(n));
      if (amt > 0 && typeof G.dropCinders === 'function' && this.room) G.dropCinders(this.room, this.cx, this.cy, amt);
      this.droppedCinders = amt;
      return amt;
    }
    deathFx(hit) {
      if (!G.fx) return;
      const d = (hit && hit.dir) || { x: 0, y: -1 };
      const ang = Math.atan2(d.y || -0.6, d.x || 0);
      const big = Math.min(2.5, Math.max(1, (this.w * this.h) / 1400));
      G.fx.burst('flash', this.cx, this.cy, { r: 40 * big, color: '#ffffff', life: 0.14 });
      G.fx.burst('wax', this.cx, this.cy, { count: Math.round(10 * big), color: this.colors.body, speed: 340, angle: ang, spread: 2.4 });
      G.fx.burst('wax', this.cx, this.cy, { count: Math.round(5 * big), color: this.colors.dark, speed: 260 });
      G.fx.burst('smoke', this.cx, this.cy, { count: Math.round(7 * big), color: this.colors.smoke, alpha: 0.4 });
      G.fx.burst('spark', this.cx, this.cy, { count: 8, color: '#ffffff', speed: 420, angle: ang, spread: 2.2 });
    }
    updateDeath(dt) {
      this.deathT += dt;
      if (this.flashT > 0) this.flashT = Math.max(0, this.flashT - dt);
      const room = this.room;
      if (!this.meltStarted) { // corpse falls (flyers, crawlers on ceilings)
        this.vy = Math.min(this.vy + GRAV * 0.8 * dt, MAX_FALL);
        this.corpseRot += this.corpseSpin * dt;
        const r = room ? G.Physics.move(this, room, this.vx * dt, this.vy * dt) : { hitX: 0, hitY: 0 };
        if (r.hitX) this.vx = -this.vx * 0.3;
        if (r.hitY > 0 || this.deathT > 2.2) {
          this.meltStarted = true; this.meltT0 = this.deathT; this.vx = 0; this.vy = 0;
          if (r.hitY > 0 && G.fx) G.fx.burst('dust', this.cx, this.y + this.h, { count: 6, color: this.colors.dark });
        }
        if (room && this.y > room.heightPx + 60) { this.remove(); return; }
        return;
      }
      if (this.meltT0 == null) this.meltT0 = this.deathT;
      // settle onto the ground if knocked into the air
      if (room && !this.flying) {
        this.vy = Math.min(this.vy + GRAV * dt, MAX_FALL);
        const r = G.Physics.move(this, room, 0, this.vy * dt);
        if (r.hitY > 0) this.vy = 0;
      }
      const mt = this.deathT - this.meltT0;
      this.melt = clamp(mt / this.cfg.meltTime, 0, 1);
      if (G.fx && this.melt < 1 && Math.random() < dt * 14) {
        G.fx.burst('smoke', this.cx + rnd(-this.w * 0.3, this.w * 0.3), this.y + this.h * (0.3 + 0.6 * this.melt), { count: 1, color: this.colors.smoke, alpha: 0.32, size: rnd(5, 9) });
      }
      const end = this.cfg.meltTime + this.cfg.puddleTime;
      if (mt > end) this.fade = Math.max(0, 1 - (mt - end) / 0.6);
      if (mt > end + 0.6) this.remove();
    }

    // ---------------------------------------------------------------- drawing
    /** Override: draw the living body in world space. this.facing, this.t, this.state are available. */
    drawBody(ctx, t) {
      ctx.fillStyle = this.colors.body;
      ctx.fillRect(this.x, this.y, this.w, this.h);
      void t;
    }
    /** World rect containing all body art (used by the hit flash buffer). */
    drawBounds() {
      const m = Math.max(this.w, this.h) * 0.6 + 24;
      return { x: this.x - m, y: this.y - m * 1.4, w: this.w + 2 * m, h: this.h + m * 2.4 };
    }
    draw(ctx, t) {
      if (this.dying) { this.drawDeath(ctx, t); this.drawDebug(ctx); return; }
      ctx.save();
      if (this.tele && this.tele.t < this.tele.dur && this.tele.shake) {
        const k = Math.min(1, this.tele.t / Math.max(0.05, this.tele.dur));
        ctx.translate(Math.sin(t * 95 + this.seed) * this.tele.shake * (0.4 + 0.6 * k), 0);
      }
      if (this.flashT > 0) this.drawFlashed(ctx, t, this.flashT / FLASH_TIME);
      else this.drawBody(ctx, t);
      ctx.restore();
      if (this.tele) this.drawTelegraph(ctx, t);
      this.drawDebug(ctx);
    }
    /** Draws the body into a scratch buffer, whitens it (source-atop) and blits it. */
    drawFlashed(ctx, t, amount) {
      let b;
      try { b = this.drawBounds(); } catch (e) { b = null; }
      if (!b || !(b.w > 0) || b.w * b.h > 1400 * 1400) { this.drawBody(ctx, t); return; }
      const bx = Math.floor(b.x), by = Math.floor(b.y), bw = Math.ceil(b.w) + 2, bh = Math.ceil(b.h) + 2;
      const sc = getScratch(bw, bh);
      const s = sc.ctx;
      s.setTransform(1, 0, 0, 1, 0, 0);
      s.globalAlpha = 1; s.globalCompositeOperation = 'source-over';
      s.clearRect(0, 0, Math.min(sc.canvas.width, bw + 4), Math.min(sc.canvas.height, bh + 4));
      s.save();
      s.translate(-bx, -by);
      this.drawBody(s, t);
      s.restore();
      s.globalCompositeOperation = 'source-atop';
      s.fillStyle = 'rgba(255,255,255,' + clamp(0.25 + amount * 0.7, 0, 0.95).toFixed(3) + ')';
      s.fillRect(0, 0, bw, bh);
      s.globalCompositeOperation = 'source-over';
      ctx.drawImage(sc.canvas, 0, 0, bw, bh, bx, by, bw, bh);
    }
    drawTelegraph(ctx, t) {
      const tl = this.tele;
      const a = tl.x != null ? { x: tl.x, y: tl.y } : this.teleAnchor();
      const glow = G.fx && G.fx.glowAt ? G.fx.glowAt : null;
      if (tl.t < tl.dur) {
        const pulse = 0.5 + 0.5 * Math.sin(tl.t * 26);
        if (glow) glow(ctx, a.x, a.y, 22 + 10 * pulse, tl.color, 0.35 + 0.25 * pulse);
      }
      if (tl.glint && tl.t < 0.4) { // four-point star glint at the start of the wind-up
        const q = tl.t / 0.4;
        const s = 26 * Math.sin(Math.min(1, q * 1.6) * Math.PI * 0.5) * (1 - q * 0.6);
        ctx.save();
        ctx.globalCompositeOperation = 'lighter';
        ctx.globalAlpha = 1 - q;
        ctx.fillStyle = '#ffffff';
        ctx.translate(a.x, a.y);
        ctx.rotate(q * 0.8);
        ctx.beginPath();
        ctx.moveTo(0, -s); ctx.lineTo(s * 0.14, -s * 0.14); ctx.lineTo(s, 0); ctx.lineTo(s * 0.14, s * 0.14);
        ctx.lineTo(0, s); ctx.lineTo(-s * 0.14, s * 0.14); ctx.lineTo(-s, 0); ctx.lineTo(-s * 0.14, -s * 0.14);
        ctx.closePath(); ctx.fill();
        ctx.restore();
        if (glow) glow(ctx, a.x, a.y, s * 1.4, tl.color, 0.6 * (1 - q));
      }
      void t;
    }
    /** Death rendering: tumbling corpse (flyers) → body sinking/spreading → wax puddle → fade. */
    drawDeath(ctx, t) {
      ctx.save();
      ctx.globalAlpha *= this.fade;
      const fx = this.cx, fy = this.y + this.h;
      if (!this.meltStarted) {
        ctx.translate(this.cx, this.cy); ctx.rotate(this.corpseRot || 0); ctx.translate(-this.cx, -this.cy);
        this.drawCorpse(ctx, t);
        ctx.restore();
        return;
      }
      const m = this.melt;
      if (m > 0.15) this.drawPuddle(ctx, fx, fy, clamp((m - 0.15) / 0.85, 0, 1));
      if (m < 1) {
        ctx.save();
        ctx.translate(fx, fy);
        ctx.scale(1 + m * 0.55, Math.max(0.04, 1 - m * 0.96));
        ctx.translate(-fx, -fy);
        ctx.globalAlpha *= 1 - m * 0.35;
        if (this.flashT > 0) this.drawFlashed(ctx, t, this.flashT / FLASH_TIME); else this.drawCorpse(ctx, t);
        ctx.restore();
      }
      ctx.restore();
    }
    /** Body pose used while dead (default: drawBody). */
    drawCorpse(ctx, t) { this.drawBody(ctx, t); }
    drawPuddle(ctx, x, y, p) {
      const w = this.cfg.puddleW || Math.max(10, this.w * 0.75);
      const ch = G.Art && G.Art.char;
      if (ch && ch.puddle) { ch.puddle(ctx, x, y, p, { color: this.colors.puddle, w, wick: this.puddleWick !== false }); return; }
      const ww = w * (0.35 + 0.65 * p), hh = Math.max(1.5, ww * 0.18);
      ctx.fillStyle = '#141218';
      ctx.beginPath(); ctx.ellipse(x, y - hh * 0.4, ww + 1.5, hh + 1.5, 0, 0, TAU); ctx.fill();
      ctx.fillStyle = this.colors.puddle;
      ctx.beginPath(); ctx.ellipse(x, y - hh * 0.4, ww, hh, 0, 0, TAU); ctx.fill();
    }
    drawDebug(ctx) {
      const list = this._dbgRects;
      if (!list || !list.length) return;
      ctx.save();
      ctx.strokeStyle = 'rgba(255,60,60,0.95)'; ctx.lineWidth = 2;
      for (const r of list) { ctx.strokeRect(r.x, r.y, r.w, r.h); r.t -= G.CONST.DT; }
      this._dbgRects = list.filter((r) => r.t > 0);
      ctx.restore();
    }

    // ---------------------------------------------------------------- static math helpers
    /** Jump velocity from (0,0) to (dx, dy) (dy > 0 = down) peaking `apex` px above the higher end. */
    static solveJump(dx, dy, g, apex) {
      g = g || GRAV;
      const H = Math.max(4, Math.max(0, -dy) + Math.max(0, apex || 0));
      const vy = -Math.sqrt(2 * g * H);
      const tUp = Math.sqrt(2 * H / g);
      const tDown = Math.sqrt(Math.max(0, 2 * (H + dy)) / g);
      const t = tUp + tDown;
      return { vx: dx / Math.max(0.05, t), vy, t };
    }
    /** Velocity from (0,0) reaching (dx, dy) after exactly `time` s under gravity g. */
    static solveArcTime(dx, dy, g, time) {
      const tt = Math.max(0.05, time);
      return { vx: dx / tt, vy: (dy - 0.5 * g * tt * tt) / tt, t: tt };
    }
    /** Aim from (x, y) at target with speed; lead 0..1 predicts the target's motion. → {vx, vy, angle}. */
    static aim(x, y, target, speed, lead) {
      if (!target) return { vx: speed, vy: 0, angle: 0 };
      const c = centerOf(target);
      let tx = c.x, ty = c.y;
      if (lead) {
        const m = target.motor || target;
        const tvx = (m.vx || 0) * lead, tvy = (m.vy || 0) * lead * 0.5;
        const rx = tx - x, ry = ty - y;
        const a = tvx * tvx + tvy * tvy - speed * speed, b = 2 * (rx * tvx + ry * tvy), cc = rx * rx + ry * ry;
        let tHit = -1;
        if (Math.abs(a) < 1e-6) tHit = b !== 0 ? -cc / b : -1;
        else {
          const disc = b * b - 4 * a * cc;
          if (disc >= 0) {
            const s = Math.sqrt(disc), t1 = (-b - s) / (2 * a), t2 = (-b + s) / (2 * a);
            tHit = Math.min(t1, t2) > 0 ? Math.min(t1, t2) : Math.max(t1, t2);
          }
        }
        if (tHit > 0 && tHit < 3) { tx += tvx * tHit; ty += tvy * tHit; }
      }
      const angle = Math.atan2(ty - y, tx - x);
      return { vx: Math.cos(angle) * speed, vy: Math.sin(angle) * speed, angle };
    }
  }

  // =====================================================================================================
  // Registry: G.registerEnemy(kind, Class) + entity type 'enemy' (dispatch on props.kind)
  // =====================================================================================================
  const kinds = Object.create(null);
  function registerEnemy(kind, cls) {
    if (typeof kind !== 'string' || typeof cls !== 'function') {
      G.reportError(new Error('registerEnemy(kind, Class) needs a string and a class'), 'registerEnemy');
      return;
    }
    if (kinds[kind] && kinds[kind] !== cls) G.warnOnce('enemy-dup:' + kind, 'enemy kind "' + kind + '" registered twice (last wins)');
    kinds[kind] = cls;
  }
  G.registerEntityFactory('enemy', function enemyFactory(props) {
    const cls = kinds[props.kind];
    if (!cls) {
      G.reportError(new Error('unknown enemy kind "' + props.kind + '"'), 'enemy');
      return null;
    }
    const e = new cls(props);
    e.kind = props.kind;
    return e;
  });
  Enemy.kinds = () => Object.keys(kinds);
  Enemy.isKind = (k) => !!kinds[k];
  Enemy.classOf = (k) => kinds[k] || null;
  Enemy.DEFAULTS = DEFAULTS;
  Enemy.MIN_TELEGRAPH = MIN_TELEGRAPH;
  /** Spawn an enemy of `kind` in room with feet at tile (tx, ty) (flyers: centred). */
  Enemy.spawn = function (room, kind, tx, ty, props) {
    room = room || (G.game && G.game.room);
    if (!room) return null;
    return room.spawn(Object.assign({ type: 'enemy', kind, tx, ty }, props || {}));
  };

  G.Enemy = Enemy;
  G.registerEnemy = registerEnemy;

  // =====================================================================================================
  // Projectiles: G.Projectile + 'orb' 'glob' 'shard' 'wave'; entity type 'projectile' (props.kind)
  // =====================================================================================================
  const PROJ_DEFAULTS = {
    orb: { r: 9, gravity: 0, life: 4, color: '#ffb070', damage: 1 },
    glob: { r: 8, gravity: 1250, life: 4, color: '#e6d6b4', damage: 1 },
    shard: { r: 6, gravity: 0, life: 3, color: '#cfe8ff', damage: 1 },
    wave: { r: 14, gravity: 0, life: 4, color: '#ffc27a', damage: 1 },
  };
  const projKinds = Object.create(null);

  class Projectile extends G.Entity {
    /**
     * props: {kind, x, y (centre px; or cx/cy, tx/ty), vx, vy, damage (1), gravity (px/s²), life (s), r (radius px),
     *         color, destroyable (Brand can break it), terrain (false = passes through walls), homing (rad/s),
     *         maxSpeed, owner, team ('enemy'), light (bool, true), onBurst(proj, why)}
     */
    constructor(props) {
      const p = props || {};
      const d = PROJ_DEFAULTS[p.kind] || PROJ_DEFAULTS.orb;
      const centerX = p.x, centerY = p.y;
      super(Object.assign({}, p, { x: 0, y: 0 }));
      this.type = 'projectile';
      this.kind = p.kind || 'orb';
      this.r = p.r || d.r;
      this.w = this.h = this.r * 2;
      this.anchor = 'center';
      if (centerX != null && centerY != null) { this.x = centerX - this.r; this.y = centerY - this.r; this._placed = p.tx == null; }
      this.vx = p.vx || 0; this.vy = p.vy || 0;
      this.team = p.team || 'enemy';
      this.damage = p.damage == null ? d.damage : p.damage;
      this.gravity = p.gravity == null ? d.gravity : p.gravity;
      this.life = p.life == null ? d.life : p.life;
      this.color = p.color || d.color;
      this.destroyable = !!p.destroyable;
      this.hurtable = this.destroyable;
      this.pogoable = !!p.pogoable;
      this.noEmber = true;
      this.terrain = p.terrain !== false;
      this.homing = p.homing || 0;
      this.maxSpeed = p.maxSpeed || 0;
      this.owner = p.owner || null;
      this.z = 5;
      this.age = 0;
      this.seed = Math.random() * 100;
      this.trail = [];
      this.light = p.light !== false;
    }
    get speed() { return Math.hypot(this.vx, this.vy); }
    update(dt) {
      this.age += dt;
      if (this.age >= this.life) { this.burst('expire'); return; }
      const p = G.game && G.game.player;
      if (this.homing && p && !p.dead) {
        const sp = Math.max(1, this.speed);
        const cur = Math.atan2(this.vy, this.vx);
        const want = Math.atan2(p.y + p.h / 2 - this.cy, p.x + p.w / 2 - this.cx);
        let diff = want - cur;
        while (diff > Math.PI) diff -= TAU;
        while (diff < -Math.PI) diff += TAU;
        const na = cur + clamp(diff, -this.homing * dt, this.homing * dt);
        this.vx = Math.cos(na) * sp; this.vy = Math.sin(na) * sp;
      }
      if (this.gravity) this.vy = Math.min(this.vy + this.gravity * dt, 1400);
      if (this.maxSpeed) { const s = this.speed; if (s > this.maxSpeed) { this.vx *= this.maxSpeed / s; this.vy *= this.maxSpeed / s; } }
      this.trail.push(this.cx, this.cy);
      if (this.trail.length > 16) this.trail.splice(0, 2);
      const dist = Math.max(Math.abs(this.vx), Math.abs(this.vy)) * dt;
      const steps = clamp(Math.ceil(dist / Math.max(4, this.r)), 1, 10);
      for (let i = 0; i < steps; i++) {
        this.x += this.vx * dt / steps;
        this.y += this.vy * dt / steps;
        if (this.terrain && this.hitsTerrain()) { this.burst('terrain'); return; }
        if (this.team === 'enemy' && this.touchPlayer()) return;
      }
      const room = this.room;
      if (room && (this.x > room.widthPx + 120 || this.x + this.w < -120 || this.y > room.heightPx + 120 || this.y + this.h < -400)) this.remove();
      if (this.light && G.lighting) G.lighting.add({ x: this.cx, y: this.cy, r: this.r * 7, color: this.color, intensity: 0.45 });
    }
    hitBox() { const s = this.r * 0.7; return { x: this.cx - s, y: this.cy - s, w: s * 2, h: s * 2 }; }
    hitsTerrain() {
      const b = this.hitBox();
      return G.Physics.rectSolid(this.room, b.x, b.y, b.w, b.h);
    }
    touchPlayer() {
      const p = G.game && G.game.player;
      if (!p || p.dead || !overlap(this.hitBox(), p)) return false;
      if (G.Combat.hurtPlayer(this.damage, this)) { this.burst('player'); return true; }
      return false; // invulnerable: passes through
    }
    hurtRect() { return this.destroyable ? this.hitBox() : null; }
    onHit(hit) {
      if (!this.destroyable || this.dead) return false;
      if (hit && hit.dir && G.fx) G.fx.burst('spark', this.cx, this.cy, { count: 6, color: '#ffffff', angle: Math.atan2(hit.dir.y, hit.dir.x || 0.001), speed: 380 });
      this.burst('hit');
      return true;
    }
    /** why: 'terrain' | 'player' | 'hit' | 'expire' | 'clear'. Spawns effects and removes the projectile. */
    burst(why) {
      if (this.dead) return;
      this.remove();
      if (typeof this.props.onBurst === 'function') { try { this.props.onBurst(this, why); } catch (e) { G.reportError(e, 'projectile.onBurst'); } }
      this.burstFx(why);
    }
    burstFx(why) {
      if (!G.fx) return;
      if (why === 'expire') { G.fx.burst('smoke', this.cx, this.cy, { count: 2, color: this.color, alpha: 0.3, size: this.r }); return; }
      G.fx.burst('flash', this.cx, this.cy, { r: this.r * 3, color: this.color, life: 0.12 });
      G.fx.burst('spark', this.cx, this.cy, { count: 6, color: this.color, speed: 260 });
      if (why === 'terrain' || why === 'hit') G.sfxAt('bolt_hit', this.cx, { vol: 0.35, pitch: 1.5 });
    }
    draw(ctx, t) {
      const glow = G.fx && G.fx.glowAt;
      const tr = this.trail;
      for (let i = 0; i < tr.length; i += 2) {
        const k = i / tr.length;
        if (glow) glow(ctx, tr[i], tr[i + 1], this.r * (0.6 + k * 1.2), this.color, 0.12 + k * 0.18);
      }
      if (glow) glow(ctx, this.cx, this.cy, this.r * 3.4, this.color, 0.55);
      ctx.fillStyle = this.color;
      ctx.beginPath(); ctx.arc(this.cx, this.cy, this.r, 0, TAU); ctx.fill();
      ctx.fillStyle = '#ffffff';
      ctx.beginPath(); ctx.arc(this.cx, this.cy, this.r * (0.45 + 0.08 * Math.sin(t * 20 + this.seed)), 0, TAU); ctx.fill();
    }
  }

  // Orb: glowing ball with a soft trail (homing-capable).
  class Orb extends Projectile {}

  // Glob: arcing gob of wax that splats.
  class Glob extends Projectile {
    burstFx(why) {
      if (!G.fx) return;
      if (why === 'expire') return super.burstFx(why);
      G.fx.burst('wax', this.cx, this.cy, { count: 10, color: this.color, speed: 260, angle: -Math.PI / 2, spread: 2.6 });
      G.fx.burst('smoke', this.cx, this.cy, { count: 2, color: '#6b6670', alpha: 0.3 });
      G.sfxAt('splash', this.cx, { vol: 0.35, pitch: 1.4 });
    }
    draw(ctx, t) {
      const a = Math.atan2(this.vy, this.vx), s = clamp(this.speed / 700, 0, 0.6);
      const glow = G.fx && G.fx.glowAt;
      if (glow) glow(ctx, this.cx, this.cy, this.r * 2.6, this.color, 0.25);
      ctx.save();
      ctx.translate(this.cx, this.cy); ctx.rotate(a);
      ctx.fillStyle = '#1c1820';
      ctx.beginPath(); ctx.ellipse(-this.r * s * 0.6, 0, this.r * (1 + s) + 1.5, this.r * (1 - s * 0.35) + 1.5, 0, 0, TAU); ctx.fill();
      ctx.fillStyle = this.color;
      ctx.beginPath(); ctx.ellipse(-this.r * s * 0.6, 0, this.r * (1 + s), this.r * (1 - s * 0.35), 0, 0, TAU); ctx.fill();
      ctx.fillStyle = 'rgba(255,255,255,0.55)';
      ctx.beginPath(); ctx.ellipse(this.r * 0.2, -this.r * 0.35, this.r * 0.35, this.r * 0.22, 0, 0, TAU); ctx.fill();
      ctx.restore();
      void t;
    }
  }

  // Shard: fast, thin, pointed along its velocity.
  class Shard extends Projectile {
    draw(ctx, t) {
      const a = Math.atan2(this.vy, this.vx), L = this.r * 3.2, W = this.r * 0.9;
      const glow = G.fx && G.fx.glowAt;
      const tr = this.trail;
      for (let i = 0; i < tr.length; i += 2) if (glow) glow(ctx, tr[i], tr[i + 1], this.r * 1.2, this.color, 0.08 + 0.12 * i / tr.length);
      if (glow) glow(ctx, this.cx, this.cy, this.r * 3, this.color, 0.4);
      ctx.save();
      ctx.translate(this.cx, this.cy); ctx.rotate(a);
      ctx.fillStyle = '#10141c';
      ctx.beginPath(); ctx.moveTo(L * 0.6 + 2, 0); ctx.lineTo(-L * 0.1, -W - 1.5); ctx.lineTo(-L * 0.5 - 2, 0); ctx.lineTo(-L * 0.1, W + 1.5); ctx.closePath(); ctx.fill();
      ctx.fillStyle = this.color;
      ctx.beginPath(); ctx.moveTo(L * 0.6, 0); ctx.lineTo(-L * 0.1, -W); ctx.lineTo(-L * 0.5, 0); ctx.lineTo(-L * 0.1, W); ctx.closePath(); ctx.fill();
      ctx.fillStyle = 'rgba(255,255,255,0.8)';
      ctx.beginPath(); ctx.moveTo(L * 0.55, 0); ctx.lineTo(-L * 0.1, -W * 0.35); ctx.lineTo(-L * 0.3, 0); ctx.closePath(); ctx.fill();
      ctx.restore();
      void t;
    }
    burstFx(why) {
      if (!G.fx) return;
      if (why === 'expire') return super.burstFx(why);
      G.fx.burst('shard', this.cx, this.cy, { count: 5, color: this.color, speed: 240 });
      G.sfxAt('slash_wall', this.cx, { vol: 0.3, pitch: 1.6 });
    }
  }

  /**
   * Wave: a ground shockwave that travels along the floor (props: x = start centre x, y = floor y (feet),
   * dir ±1, speed (px/s, 420), h (px, 46), w (px, 30)). Dies at walls, ledges or after `life`.
   */
  class Wave extends Projectile {
    constructor(props) {
      const p = props || {};
      super(p);
      this.dir = p.dir || (p.vx < 0 ? -1 : 1);
      this.speedX = p.speed || Math.abs(p.vx) || 420;
      this.w = p.w || 30; this.h = p.h || 46;
      this.vx = this.dir * this.speedX; this.vy = 0;
      if (p.x != null && p.y != null) { this.x = p.x - this.w / 2; this.y = p.y - this.h; this._placed = true; }
      this.anchor = 'ground';
      this.gravity = 0;
    }
    hitBox() { return { x: this.x + 4, y: this.y + this.h * 0.25, w: this.w - 8, h: this.h * 0.75 }; }
    update(dt) {
      this.age += dt;
      if (this.age >= this.life) { this.burst('expire'); return; }
      const room = this.room;
      const nx = this.x + this.vx * dt;
      const front = this.dir > 0 ? nx + this.w : nx;
      const blocked = G.Physics.rectSolid(room, nx, this.y, this.w, this.h - 2);
      const footC = Math.floor(front / TILE), footR = Math.floor((this.y + this.h + 2) / TILE);
      const floor = G.Physics.isSolidTile(room.tileAt(footC, footR)) || room.tileAt(footC, footR) === T.PLATFORM;
      if (blocked || !floor) { this.burst('terrain'); return; }
      this.x = nx;
      if (G.fx && Math.random() < dt * 30) G.fx.burst('dust', this.cx, this.y + this.h, { count: 1, color: '#9a8f80', angle: -Math.PI / 2 - this.dir * 0.6 });
      if (this.team === 'enemy') this.touchPlayer();
      if (this.light && G.lighting) G.lighting.add({ x: this.cx, y: this.y + this.h * 0.6, r: 90, color: this.color, intensity: 0.5 });
    }
    touchPlayer() {
      const p = G.game && G.game.player;
      if (!p || p.dead || !overlap(this.hitBox(), p)) return false;
      G.Combat.hurtPlayer(this.damage, this); // waves keep going after a hit (jump over them)
      return true;
    }
    draw(ctx, t) {
      const glow = G.fx && G.fx.glowAt;
      const bx = this.cx, by = this.y + this.h;
      const life = clamp(1 - Math.max(0, this.age - this.life + 0.3) / 0.3, 0, 1);
      if (glow) glow(ctx, bx, by - this.h * 0.35, this.h * 1.1, this.color, 0.5 * life);
      ctx.save();
      ctx.globalAlpha *= life;
      // a run of flame tongues: tallest at the leading edge, trailing lower tongues behind it
      const d = this.dir;
      const hot = G.U.mix(this.color, '#ffffff', 0.55);
      for (let pass = 0; pass < 2; pass++) {
        ctx.fillStyle = pass ? hot : this.color;
        for (let i = 0; i < 4; i++) {
          const k = 1 - i * 0.22, shrink = pass ? 0.55 : 1;
          const flick = 0.85 + 0.15 * Math.sin(t * 34 + i * 1.7 + this.seed);
          const hh = this.h * k * flick * shrink;
          const ww = this.w * 0.42 * k * (pass ? 0.6 : 1);
          const x0 = bx + d * (this.w * 0.25 - i * this.w * 0.32);
          const lean = -d * hh * 0.45;
          ctx.beginPath();
          ctx.moveTo(x0 - ww, by);
          ctx.bezierCurveTo(x0 - ww * 0.6, by - hh * 0.45, x0 + lean * 0.6 - ww * 0.2, by - hh * 0.8, x0 + lean, by - hh);
          ctx.bezierCurveTo(x0 + lean * 0.3 + ww * 0.5, by - hh * 0.6, x0 + ww * 0.9, by - hh * 0.3, x0 + ww, by);
          ctx.closePath();
          ctx.fill();
        }
      }
      ctx.fillStyle = '#ffffff';
      ctx.globalAlpha *= 0.8;
      ctx.fillRect(bx - this.w * 0.9, by - 2, this.w * 1.8, 2);
      ctx.restore();
    }
  }

  function registerProjectile(kind, cls, defaults) {
    projKinds[kind] = cls;
    if (defaults) PROJ_DEFAULTS[kind] = Object.assign({}, PROJ_DEFAULTS.orb, defaults);
  }
  registerProjectile('orb', Orb);
  registerProjectile('glob', Glob);
  registerProjectile('shard', Shard);
  registerProjectile('wave', Wave);
  G.registerEntityFactory('projectile', (props) => {
    const cls = projKinds[props.kind || 'orb'];
    if (!cls) { G.reportError(new Error('unknown projectile kind "' + props.kind + '"'), 'projectile'); return null; }
    return new cls(props);
  });
  /** Spawn a projectile in room. kind: 'orb' | 'glob' | 'shard' | 'wave' | registered. o: Projectile props. */
  function spawnProjectile(room, kind, o) {
    room = room || (G.game && G.game.room);
    if (!room) return null;
    const props = Object.assign({}, o || {}, { type: 'projectile', kind: kind || 'orb' });
    const cls = projKinds[props.kind];
    if (!cls) { G.reportError(new Error('unknown projectile kind "' + props.kind + '"'), 'projectile'); return null; }
    let e;
    try { e = new cls(props); } catch (err) { G.reportError(err, 'projectile ' + props.kind); return null; }
    return room.add(e);
  }
  /** Burst every enemy projectile in the room (boss defeat, phase changes). */
  function clearProjectiles(room) {
    room = room || (G.game && G.game.room);
    if (!room) return 0;
    let n = 0;
    for (const e of room.entities) if (!e.dead && e instanceof Projectile && e.team === 'enemy') { e.burst('clear'); n++; }
    return n;
  }
  Projectile.Orb = Orb; Projectile.Glob = Glob; Projectile.Shard = Shard; Projectile.Wave = Wave;
  Projectile.DEFAULTS = PROJ_DEFAULTS;
  Projectile.kinds = () => Object.keys(projKinds);
  G.Projectile = Projectile;
  G.registerProjectile = registerProjectile;
  G.spawnProjectile = spawnProjectile;
  G.clearProjectiles = clearProjectiles;

  // =====================================================================================================
  // Telegraph zones: pulsing warning areas (debris columns, heated floor, spike rows). Harmless by themselves.
  // MODE-AWARE (difficulty modes, docs/api/enemies.md §6.1): the zone geometry is an EXPLICIT telegraph and is
  // drawn only while G.telegraphsOn() is true (easy). In standard / hardcore the zone still exists and times
  // the attack identically (dur, onDone), but draws nothing and instead emits a subtle DIEGETIC cue chosen by
  // its shape (o.cue): 'dust' (pebbles + dust trickling from the ceiling over a column), 'cracks' (dark hairline
  // cracks + hopping crumbs + a faint rumble on a floor strip), 'drip' (a molten drop swelling on the ceiling,
  // then trickling), 'none'. o.keep: 'subtle' keeps a dim, outline-free version of the marker in standard /
  // hardcore (for attacks that would be unfair without it — document why at the call site); 'full' keeps it as is.
  // =====================================================================================================
  let urlMode;   // fallback until G.game.telegraphs() exists: ?mode=easy|standard|hardcore
  /** True when explicit telegraphs (zones, landing marks, aim lines) should be drawn — easy mode only. */
  G.telegraphsOn = function () {
    const g = G.game;
    if (g && typeof g.telegraphs === 'function') { try { return g.telegraphs() !== false; } catch (e) { return true; } }
    if (urlMode === undefined) {
      urlMode = null;
      try { const m = /[?&]mode=(easy|standard|hardcore)\b/.exec((globalThis.location && globalThis.location.search) || ''); if (m) urlMode = m[1]; } catch (e) { /* no location */ }
    }
    const m = urlMode || (g && g.progress && g.progress.mode) || 'easy';
    return m !== 'standard' && m !== 'hardcore';
  };
  let zoneSerial = 0;
  const CUE_AUTO = { column: 'dust', floor: 'cracks', circle: 'none', rect: 'none' };
  const CUE_KINDS = { dust: 1, cracks: 1, drip: 1, none: 1 };
  class TelegraphZone extends G.Entity {
    /**
     * props: {x, y, w, h (px), dur (s), color, style: 'rect'|'column'|'floor'|'circle', onDone(zone),
     *         cue: 'auto'|'dust'|'cracks'|'drip'|'none'|false (standard/hardcore diegetic cue; auto = by style),
     *         cueColor (particle colour; default by kind), keep: false|'subtle'|'full' (draw in standard too)}
     */
    constructor(props) {
      const p = props || {};
      super({ type: 'telegraph' });
      this.props = p;
      this.type = 'telegraph';
      this.x = p.x || 0; this.y = p.y || 0; this.w = p.w || TILE; this.h = p.h || TILE;
      this._placed = true;
      this.dur = Math.max(0.05, p.dur || 0.6);
      this.color = p.color || '#ffcf8a';
      this.style = p.style || 'rect';
      this.z = -6;
      this.age = 0;
      const c = p.cue === false ? 'none' : (p.cue == null || p.cue === 'auto') ? (CUE_AUTO[this.style] || 'none') : p.cue;
      this.cue = CUE_KINDS[c] ? c : 'none';
      this.keep = p.keep === 'full' || p.keep === true ? 'full' : p.keep === 'subtle' ? 'subtle' : null;
      this.seed = (this.x * 0.137 + this.y * 0.311 + (zoneSerial++) * 7.77) % 1000;   // no Math.random: easy stays bit-identical
      this._cueAcc = 0;
    }
    /** Whether the zone geometry is drawn right now (easy, or kept by the caller). */
    get explicit() { return !!this.keep || G.telegraphsOn(); }
    update(dt) {
      this.age += dt;
      if (this.cue !== 'none' && !G.telegraphsOn()) this.updateCue(dt);
      if (this.age >= this.dur) {
        this.remove();
        if (typeof this.props.onDone === 'function') { try { this.props.onDone(this); } catch (e) { G.reportError(e, 'telegraph.onDone'); } }
      }
    }
    /** Standard / hardcore: emit the diegetic cue particles (purely cosmetic; never touches timing). */
    updateCue(dt) {
      const fx = G.fx;
      if (!fx || !fx.spawn) return;
      // off-screen zones emit nothing (the particle pool is shared; many columns can be warned at once)
      if (G.camera && typeof G.camera.visible === 'function' && !G.camera.visible(this.x, this.y, this.w, this.h, 120)) return;
      const k = Math.min(1, this.age / this.dur);
      const cx = this.x + this.w / 2, half = this.w * 0.32;
      const cc = this.props.cueColor, c1 = Array.isArray(cc) ? cc[0] : cc, c2 = Array.isArray(cc) ? (cc[1] || cc[0]) : cc;   // [pebble, dust]
      if (this.cue === 'dust' || (this.cue === 'drip' && k > 0.12)) {
        // from the ceiling over the column (or the top of the view when the ceiling is off-screen)
        const camY = G.camera && typeof G.camera.y === 'number' ? G.camera.y : -1e9;
        const top = Math.max(this.y + 2, camY - 6);
        const rate = this.cue === 'drip' ? 6 + 28 * k : 22 + 40 * k;   // particles / s, building up
        this._cueAcc += dt * rate;
        while (this._cueAcc >= 1) {
          this._cueAcc -= 1;
          const drip = this.cue === 'drip';
          const px = drip ? cx + rnd(-4, 4) : cx + rnd(-half, half);
          if (drip || Math.random() < 0.6) {
            // pebbles / drops: fall the whole height (life long enough to reach a floor ~600 px below)
            fx.spawn({ x: px, y: top + rnd(0, 6), vx: rnd(-6, 6), vy: rnd(40, 120), gravity: 1100, life: 1.2, size: drip ? rnd(1.8, 3) : rnd(2.4, 4.4),
              color: c1 || (drip ? this.color : '#cbbfa8'), alpha: 0.95, shape: drip ? 'drop' : 'tri', rot: rnd(0, TAU), vrot: rnd(-8, 8) });
          } else {
            const s = rnd(4, 8);   // dust puffing out of the vault where it comes loose
            fx.spawn({ x: px, y: top + rnd(0, 10), vx: rnd(-16, 16), vy: rnd(20, 70), gravity: 60, drag: 1.2, life: rnd(0.8, 1.3), size: s, size2: s * 2.6,
              color: c2 || '#b3a893', alpha: 0.5, shape: 'circle' });
          }
        }
      } else if (this.cue === 'cracks') {
        const fy = this.y + this.h;
        this._cueAcc += dt * (5 + 16 * k);
        while (this._cueAcc >= 1) {
          this._cueAcc -= 1;
          const px = cx + rnd(-this.w * 0.42, this.w * 0.42);
          if (Math.random() < 0.6) {
            fx.spawn({ x: px, y: fy - 1, vx: rnd(-25, 25), vy: -rnd(70, 170) * (0.6 + 0.6 * k), gravity: 1300, life: rnd(0.3, 0.55), size: rnd(1.5, 2.8),
              color: c1 || '#7d7466', alpha: 0.9, shape: 'tri', rot: rnd(0, TAU), vrot: rnd(-12, 12) });
          } else {
            const s = rnd(3, 5.5);
            fx.spawn({ x: px, y: fy - 2, vx: rnd(-20, 20), vy: -rnd(10, 35), gravity: -20, drag: 2.5, life: rnd(0.4, 0.7), size: s, size2: s * 2.2,
              color: c2 || '#8a8070', alpha: 0.35, shape: 'circle' });
          }
        }
        if (!this._rumbled && G.game && G.game.shake) { this._rumbled = true; G.game.shake(1.2, Math.min(0.5, this.dur)); }
      }
    }
    draw(ctx, t) {
      const on = G.telegraphsOn();
      if (on || this.keep === 'full') { this.drawZone(ctx, 1); return; }
      if (this.keep === 'subtle') this.drawZone(ctx, 0.4, true);
      if (this.cue === 'cracks') this.drawCracks(ctx);
      else if (this.cue === 'drip') this.drawSwell(ctx);
      void t;
    }
    /** Standard cue: two or three short dark hairline cracks that lengthen as the eruption builds. */
    drawCracks(ctx) {
      const k = Math.min(1, this.age / this.dur);
      const fy = this.y + this.h;
      const n = this.w > 90 ? 3 : 2;
      ctx.save();
      ctx.strokeStyle = 'rgba(12,10,14,' + (0.35 + 0.35 * k).toFixed(3) + ')';
      ctx.lineWidth = 1.4; ctx.lineCap = 'round';
      ctx.beginPath();
      for (let i = 0; i < n; i++) {
        const sd = this.seed + i * 37.1;
        const x0 = this.x + this.w * (0.2 + 0.6 * ((Math.sin(sd) * 0.5 + 0.5) * 0.8 + i * 0.1) / (0.8 + (n - 1) * 0.1));
        const len = (6 + 10 * k) * (0.7 + 0.3 * Math.abs(Math.sin(sd * 1.7)));
        const dir = Math.sin(sd * 2.3) > 0 ? 1 : -1;
        ctx.moveTo(x0, fy);
        ctx.lineTo(x0 + dir * len * 0.4, fy - len * 0.35);
        ctx.lineTo(x0 + dir * len * 0.2, fy - len * 0.7);
        ctx.lineTo(x0 + dir * len * 0.55, fy - len);
      }
      ctx.stroke();
      ctx.restore();
    }
    /** Standard 'drip' cue: a drop of the zone colour swelling on the ceiling over the column. */
    drawSwell(ctx) {
      const k = Math.min(1, this.age / this.dur);
      const camY = G.camera && typeof G.camera.y === 'number' ? G.camera.y : -1e9;
      const top = Math.max(this.y, camY);
      const cx = this.x + this.w / 2, r = 2.5 + 6 * k;
      ctx.save();
      ctx.fillStyle = this.color;
      ctx.beginPath();
      ctx.moveTo(cx - r * 0.9, top);
      ctx.quadraticCurveTo(cx - r * 1.1, top + r * 1.4, cx, top + r * 2.2);
      ctx.quadraticCurveTo(cx + r * 1.1, top + r * 1.4, cx + r * 0.9, top);
      ctx.closePath(); ctx.fill();
      ctx.restore();
      if (G.fx && G.fx.glowAt) G.fx.glowAt(ctx, cx, top + r, 10 + 14 * k, this.color, 0.45 + 0.35 * k);
    }
    drawZone(ctx, mul, subtle) {
      const k = this.age / this.dur;
      const pulse = 0.5 + 0.5 * Math.sin(this.age * (10 + 22 * k));
      const a = (0.12 + 0.22 * k) * (0.6 + 0.4 * pulse) * mul;
      ctx.save();
      ctx.globalCompositeOperation = 'lighter';
      ctx.fillStyle = G.U.rgba(this.color, a);
      if (this.style === 'circle') {
        const r = Math.min(this.w, this.h) / 2;
        ctx.beginPath(); ctx.arc(this.cx, this.cy, r, 0, TAU); ctx.fill();
        if (!subtle) {
          ctx.strokeStyle = G.U.rgba(this.color, 0.5 + 0.4 * pulse); ctx.lineWidth = 2;
          ctx.beginPath(); ctx.arc(this.cx, this.cy, r * (1 - 0.15 * k), 0, TAU); ctx.stroke();
        }
      } else if (this.style === 'column') {
        const g = ctx.createLinearGradient(0, this.y, 0, this.y + this.h);
        g.addColorStop(0, G.U.rgba(this.color, a * 1.4)); g.addColorStop(1, G.U.rgba(this.color, a * 0.3));
        ctx.fillStyle = g; ctx.fillRect(this.x, this.y, this.w, this.h);
        if (!subtle) {
          ctx.fillStyle = G.U.rgba(this.color, 0.4 + 0.5 * pulse);
          ctx.fillRect(this.x, this.y + this.h - 4, this.w, 4);
        }
      } else if (this.style === 'floor') {
        const g = ctx.createLinearGradient(0, this.y + this.h, 0, this.y);
        g.addColorStop(0, G.U.rgba(this.color, a * 2)); g.addColorStop(1, G.U.rgba(this.color, 0));
        ctx.fillStyle = g; ctx.fillRect(this.x, this.y, this.w, this.h);
        if (!subtle) {
          ctx.fillStyle = G.U.rgba(this.color, 0.35 + 0.5 * pulse);
          ctx.fillRect(this.x, this.y + this.h - 3, this.w, 3);
        }
      } else {
        ctx.fillRect(this.x, this.y, this.w, this.h);
        if (!subtle) {
          ctx.strokeStyle = G.U.rgba(this.color, 0.4 + 0.5 * pulse); ctx.lineWidth = 2;
          ctx.strokeRect(this.x + 1, this.y + 1, this.w - 2, this.h - 2);
        }
      }
      ctx.restore();
    }
  }
  G.registerEntity('telegraph', TelegraphZone);
  G.TelegraphZone = TelegraphZone;
  /** Show a warning zone for dur seconds then call onDone. o: TelegraphZone props. */
  G.warnZone = function (room, o) {
    room = room || (G.game && G.game.room);
    if (!room) return null;
    return room.add(new TelegraphZone(o));
  };
})();
