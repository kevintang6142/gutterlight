// src/player/player.js — G.Player: the Wickling. Controller (input → G.PlayerMotor), the Brand (nail
// slashes, pogo, recoil), spells (Ember Bolt, Molten Plunge), Kindle (heal), damage / i-frames / death,
// interaction, resting, cinematics (wake-up, poses), sigil effects, sfx and gameplay particles.
// Also registers the 'player_bolt' and 'flare_trail' entities. Drawing lives in player_draw.js
// (G.PlayerDraw, feature-detected; a minimal fallback is drawn here). Movement physics: G.PlayerMotor only.
(function () {
  'use strict';
  const G = globalThis.G;
  const TILE = G.CONST.TILE;

  // ------------------------------------------------------------------------------------ tuning
  const K = {
    ATTACK_CD: 0.38,          // Brand cooldown (swift_brand × 0.7)
    ATTACK_ACTIVE: 0.09,      // hitbox live window
    ATTACK_ANIM: 0.26,        // visual swing length
    ATTACK_BUFFER: 0.1,       // early presses are remembered this long
    SIDE_W: 80, SIDE_H: 56,   // horizontal slash box (in front)
    VERT_W: 60, VERT_H: 80,   // up / down slash boxes (above / below)
    REACH_LONG: 1.35,         // long_brand
    SPELL_COST: 33,
    TAP_TIME: 0.2,            // spell press shorter than this = cast; longer = Kindle
    KINDLE_TIME: 0.9,
    CAST_TIME: 0.3, CAST_BUSY: 0.18,
    BOLT_DAMAGE: 15, PLUNGE_DAMAGE: 15, SPELL_MULT: 1.5,
    PLUNGE_RADIUS: 3 * TILE,
    THORNS_DAMAGE: 12, THORNS_RADIUS: 3 * TILE,
    TRAIL_DAMAGE: 8, TRAIL_TICK: 0.25, TRAIL_LIFE: 0.6,
    IFRAMES: 1.0, SMOLDER_MULT: 1.6,
    HURT_HITSTOP: 0.12, HURT_ANIM: 0.3,
    LAST_LIGHT_MULT: 1.75,
    LIGHT_R: 260, LIGHT_COLOR: '#79c4ff',
    WAKE_TIME: 3.4,
  };
  const BRAND_FALLBACK = [5, 9, 13, 17];

  const game = () => G.game;
  const prog = () => (G.game && G.game.progress) || null;
  const equipped = (id) => !!(G.game && G.game.isEquipped && G.game.isEquipped(id));
  function sigilParam(id, key, fallback) {
    const s = G.Items && G.Items.sigils && G.Items.sigils[id];
    return s && typeof s[key] === 'number' ? s[key] : fallback;
  }
  const sfx = (name, x, opts) => G.sfxAt(name, x, opts);
  const draw = () => G.PlayerDraw || null;
  function drawEvent(p, name, data) {
    const D = draw();
    if (D && typeof D.onEvent === 'function') {
      try { D.onEvent(p, name, data); } catch (err) { G.reportError(err, 'PlayerDraw.onEvent ' + name); }
    }
  }
  const overlapRect = (a, b) => {
    const x0 = Math.max(a.x, b.x), y0 = Math.max(a.y, b.y);
    const x1 = Math.min(a.x + a.w, b.x + b.w), y1 = Math.min(a.y + a.h, b.y + b.h);
    return { x: (x0 + x1) / 2, y: (y0 + y1) / 2 };
  };

  let seq = 0;                     // unique attack ids across all player-owned attacks
  const nextId = (prefix) => prefix + (++seq);

  // =====================================================================================================
  class Player extends G.Entity {
    constructor(props) {
      super(props || { type: 'player' });
      this.type = 'player';
      this.w = G.CONST.PLAYER_W;
      this.h = G.CONST.PLAYER_H;
      this.team = 'player';
      this.z = 0;
      this.cull = false;
      this.noAutoLight = true;          // the Wickling emits its own (flickering, kindle-aware) light
      this.motor = G.PlayerMotor.create(this.x, this.y);
      this.facing = 1;
      this.invuln = 0;
      this.resting = false;
      this.hidden = false;
      this.lastEvents = [];
      this._mi = { left: false, right: false, up: false, down: false, jump: false, jumpPressed: false, dashPressed: false };
      this._ctx = { room: null, dt: G.CONST.DT, abilities: null, mods: { noKnockback: false } };
      this.resetTransient();
    }

    // All per-life transient state (attacks, spells, timers, cinematics, animation hooks).
    resetTransient() {
      this.invuln = 0;
      this.flickerT = 0;           // i-frame flicker (only after real damage)
      this.hurtT = 0;              // hurt pose
      this.flashT = 0;             // white body flash
      this.attackCd = 0;
      this.attackBuffer = 0;
      this.slash = null;           // active swing {dir, t, id, facing, rect, connected, pogo, wall, alt}
      this.swingAlt = 0;
      this.spellHold = null;       // {t} spell button held, waiting for tap/hold decision
      this.kindle = null;          // {t, dur, heal, snd}
      this.castT = 0;              // cast pose timer
      this.plungeLandT = 0;
      this.landT = 0;
      this.djumpT = 0;
      this.dashFxT = 0;
      this.slideFxT = 0;
      this.trailGroup = null;
      this.standT = 0;             // getting up from a sconce
      this.seat = null;            // {x} sconce seat position while resting
      this.cine = null;            // {kind:'wake'|'pose', t, dur, name, done:[]}
      this.dying = false;
      this.deathT = 0;
      this.respawnT = 0;           // flame re-ignites after respawn / hazard return
      this.runPhase = 0;
      this.stepCount = 0;
      this.interactTarget = null;
      this.resting = false;
      this.hidden = false;
      if (this.motor) { this.motor.locked = false; }
      if (G.PlayerDraw && typeof G.PlayerDraw.reset === 'function') {
        try { G.PlayerDraw.reset(this); } catch (err) { G.reportError(err, 'PlayerDraw.reset'); }
      }
    }

    abilities() { const p = prog(); return (p && p.abilities) || {}; }

    // ---------------------------------------------------------------------------------- engine contract
    placeAt(x, y) {
      const m = this.motor;
      const fromHazard = !!m.hazard;
      m.x = x; m.y = y; m.vx = 0; m.vy = 0;
      m.dashTime = 0; m.plunging = false; m.knockTime = 0; m.recoilTime = 0; m.wall = 0; m.wallJumpLock = 0;
      m.swimming = false; m.inWater = false; m.jumpHolding = false;
      m.hazard = null; m.fallStartY = y;
      this.x = x; this.y = y;
      this.slash = null;
      this.cancelKindle();
      this.spellHold = null;
      this.trailGroup = null;
      drawEvent(this, 'teleport');
      if (fromHazard && !this.dying) this.respawnT = 0.45;   // the flame re-forms after a hazard return
    }

    onRoomEnter(room) {
      this.room = room;
      this.slash = null;
      this.trailGroup = null;
      this.interactTarget = null;
      this.resting = false;
      this.seat = null;
      drawEvent(this, 'teleport');
    }

    respawn() {
      const old = this.motor;
      this.motor = G.PlayerMotor.create(old.x, old.y);
      this.motor.facing = this.facing || 1;
      this.dead = false;
      this.resetTransient();
      this.respawnT = 0.6;         // flame re-ignites
    }

    busy() {
      return !!this.slash || this.castT > K.CAST_TIME - K.CAST_BUSY || !!this.kindle || !!this.spellHold ||
        this.motor.plunging || !!this.cine || this.dying || this.standT > 0;
    }

    // Sit at a sconce (also triggered automatically by the engine's 'rest' event). Any movement stands up.
    sit(sconce) {
      if (this.dying) return;
      this.resting = true;
      this.standT = 0;
      // seated at the sconce's foot on the side we came from, leaning back against it
      if (sconce && typeof sconce.cx === 'number') {
        const side = this.cx >= sconce.cx ? 1 : -1;
        let x = sconce.cx + side * 24;
        if (this.room && G.Physics.rectSolid(this.room, x - this.motor.w / 2, this.motor.y, this.motor.w, this.motor.h)) x = sconce.cx - side * 24;
        this.seat = { x };
        this.facing = this.motor.facing = side;
      } else this.seat = { x: this.cx };
      this.slash = null; this.attackBuffer = 0; this.cancelKindle(); this.spellHold = null;
      this.motor.vx = 0;
      drawEvent(this, 'sit');
    }
    standUp() {
      if (!this.resting) return;
      this.resting = false;
      this.seat = null;
      this.standT = 0.16;
      drawEvent(this, 'stand');
    }

    // New-game wake-up: lying on the ash → the blue flame ignites → stands up. onDone after control returns.
    playWake(onDone) {
      if (this.cine && this.cine.kind === 'wake') { if (onDone) this.cine.done.push(onDone); return; }
      this.endCine(false);
      this.resting = false; this.seat = null;
      this.cine = { kind: 'wake', name: 'wake', t: 0, dur: K.WAKE_TIME, done: onDone ? [onDone] : [], ignited: false, lock: 'wake' };
      if (G.game) G.game.lockPlayer('wake');
      drawEvent(this, 'wake');
    }
    // Scripted pose (e.g. 'ability' when a shrine grants an ability). Locks control for `sec` seconds.
    playPose(name, sec, onDone) {
      this.endCine(true);
      this.cine = { kind: 'pose', name: name || 'ability', t: 0, dur: Math.max(0.1, sec == null ? 1.5 : sec), done: onDone ? [onDone] : [], lock: 'pose' };
      this.slash = null; this.cancelKindle(); this.spellHold = null;
      if (G.game) G.game.lockPlayer('pose');
      if (this.cine.name === 'ability') {
        sfx('kindle_done', this.cx, { vol: 0.8, pitch: 0.8 });
        if (G.fx) {
          G.fx.burst('ring', this.cx, this.y + 4, { r: 90, color: '#9fdcff', width: 5 });
          G.fx.burst('ember', this.cx, this.y + 10, { count: 12, color: '#7fd0ff', speed: 120 });
        }
      }
      drawEvent(this, 'pose', this.cine.name);
    }
    // Ends the current cinematic. callDone=false drops callbacks (used when a new wake replaces it).
    endCine(callDone) {
      const c = this.cine;
      if (!c) return;
      this.cine = null;
      if (G.game && c.lock) G.game.unlockPlayer(c.lock);
      if (callDone !== false) for (const fn of c.done) { try { fn(); } catch (err) { G.reportError(err, 'player cinematic onDone'); } }
    }

    // ---------------------------------------------------------------------------------- damage
    // Called by G.Combat.hurtPlayer (and hazardPlayer with source.hazard). Returns true if damage applied.
    hurt(amount, source) {
      const g = game(), m = this.motor, pr = prog();
      if (!g || !pr || g.god || g.mode !== 'play' || this.dying) return false;
      const hazard = !!(source && source.hazard);
      if (!hazard && (this.invuln > 0 || m.plunging)) return false;
      const dmg = amount == null ? 1 : Math.max(0, amount);
      pr.health = Math.max(0, pr.health - dmg);

      // interrupt everything
      this.cancelKindle();
      this.spellHold = null;
      this.slash = null;
      this.attackBuffer = 0;
      if (this.resting) { this.resting = false; this.seat = null; }
      if (this.cine) this.endCine(true);

      const iframes = K.IFRAMES * (equipped('smolder_shell') ? sigilParam('smolder_shell', 'invulnMult', K.SMOLDER_MULT) : 1);
      this.invuln = iframes;
      this.flickerT = iframes;
      this.hurtT = K.HURT_ANIM;
      this.flashT = 0.12;
      const cx = this.cx, cy = this.cy;

      if (pr.health <= 0) { this.die(source); return true; }

      if (!hazard) {
        sfx('player_hurt', cx);
        g.hitstop(K.HURT_HITSTOP);
        g.shake(9, 0.3);
        g.flash('rgba(255,255,255,0.45)', 0.14);
        const sx = source && (typeof source.cx === 'number' ? source.cx : typeof source.x === 'number' ? source.x + (source.w || 0) / 2 : null);
        const dir = sx == null ? -this.facing : (cx >= sx ? 1 : -1);
        if (!equipped('steadfast')) G.PlayerMotor.knockback(m, dir);
        if (G.fx) {
          G.fx.burst('wax', cx, cy - 6, { count: 7, color: '#efe5cf', speed: 260, angle: dir > 0 ? -0.6 : -Math.PI + 0.6, spread: 1.6 });
          G.fx.burst('spark', cx, cy - 6, { count: 8, color: '#ffffff', speed: 420 });
          G.fx.burst('flash', cx, cy - 6, { r: 60, color: '#dff4ff', life: 0.14 });
        }
      } else {
        g.shake(6, 0.2);
        if (G.fx) G.fx.burst('wax', cx, cy, { count: 5, color: '#efe5cf', speed: 200 });
      }
      if (equipped('thorned_wax')) this.thornsBurst();
      drawEvent(this, 'hurt', { hazard });
      return true;
    }

    die() {
      const g = game();
      this.dying = true;
      this.deathT = 0;
      this.slash = null;
      this.cancelKindle();
      this.spellHold = null;
      this.motor.vx = 0;
      const cx = this.cx, top = this.y + 8;
      if (G.fx) {
        G.fx.burst('smoke', cx, top - 6, { count: 3, color: '#3f4150', speed: 30, life: 1.4, alpha: 0.3 });
        G.fx.burst('ember', cx, top, { count: 10, color: '#7fd0ff', speed: 150 });
      }
      drawEvent(this, 'die');
      if (g && typeof g.playerDied === 'function') g.playerDied();
    }

    thornsBurst() {
      const r = K.THORNS_RADIUS, cx = this.cx, cy = this.cy;
      const dmg = sigilParam('thorned_wax', 'damage', K.THORNS_DAMAGE);
      G.Combat.attack({ owner: this, team: 'player', rect: { x: cx - r, y: cy - r, w: r * 2, h: r * 2 }, damage: dmg, kind: 'thorns', dir: { x: 0, y: -1 }, id: nextId('pthorn') });
      if (G.fx) {
        G.fx.burst('ring', cx, cy, { r, color: '#f2e6c8', width: 6, life: 0.3 });
        for (let i = 0; i < 14; i++) {
          const a = (i / 14) * Math.PI * 2;
          G.fx.spawn({ x: cx + Math.cos(a) * 10, y: cy + Math.sin(a) * 10, vx: Math.cos(a) * 520, vy: Math.sin(a) * 520, life: 0.22, size: 3, size2: 1,
            color: '#efe2c4', drag: 6, shape: 'tri', rot: a + Math.PI / 2 });
        }
      }
      sfx('slash_hit', cx, { pitch: 0.7 });
      drawEvent(this, 'thorns');
    }

    // ---------------------------------------------------------------------------------- main update
    update(dt) {
      const g = game(), m = this.motor, inp = G.input;
      if (!g || !this.room) return;
      if (this.dying) { this.deathT += dt; return; }
      this.tickTimers(dt);
      if (this.cine) this.updateCine(dt);

      const sysLocked = g.isLocked();
      if (this.resting && !sysLocked) this.checkStandUp(inp);
      if (this.resting && this.seat) {   // glide onto the seat
        const tx = this.seat.x - m.w / 2;
        if (Math.abs(m.x - tx) > 0.5 && m.onGround && !G.Physics.rectSolid(this.room, tx, m.y, m.w, m.h)) m.x += (tx - m.x) * Math.min(1, dt * 14);
      }
      const ownLock = this.resting || !!this.cine || !!this.kindle || this.standT > 0;
      m.locked = sysLocked || ownLock;
      const ctl = !m.locked && !m.hazard;
      if (!ctl) {
        this.attackBuffer = 0;
        if (sysLocked || this.cine) this.spellHold = null;
      }

      if (ctl && inp.pressed('attack')) this.attackBuffer = K.ATTACK_BUFFER;
      if (ctl && inp.pressed('spell')) this.onSpellPressed(inp);

      // ---- motor
      const mi = this._mi;
      mi.left = inp.down('left'); mi.right = inp.down('right'); mi.up = inp.down('up'); mi.down = inp.down('down');
      mi.jump = inp.down('jump'); mi.jumpPressed = inp.pressed('jump'); mi.dashPressed = inp.pressed('dash');
      const c = this._ctx;
      c.room = this.room; c.dt = dt; c.abilities = this.abilities(); c.mods.noKnockback = equipped('steadfast');
      G.PlayerMotor.step(m, mi, c);
      this.x = m.x; this.y = m.y;
      if (m.facing) this.facing = m.facing;
      const evs = m.events;
      this.lastEvents.length = 0;
      for (let i = 0; i < evs.length; i++) this.lastEvents.push(evs[i]);
      for (let i = 0; i < evs.length; i++) this.onMotorEvent(evs[i]);

      // ---- spells & Kindle
      if (this.spellHold) this.updateSpellHold(dt, inp);
      if (this.kindle) this.updateKindle(dt, inp);

      // ---- the Brand
      if (this.attackBuffer > 0 && this.attackCd <= 0 && this.canAttack()) this.startSwing(inp);
      if (this.slash) this.updateSwing(dt);

      // ---- movement juice that depends on continuous state
      this.updateMovementFx(dt);

      // ---- interaction
      this.updateInteract(inp, ctl);

      if (G.PlayerDraw && typeof G.PlayerDraw.update === 'function') {
        try { G.PlayerDraw.update(this, dt); } catch (err) { G.reportError(err, 'PlayerDraw.update'); }
      }
    }

    tickTimers(dt) {
      const dec = (v) => (v > 0 ? Math.max(0, v - dt) : 0);
      this.invuln = dec(this.invuln);
      this.flickerT = dec(this.flickerT);
      this.hurtT = dec(this.hurtT);
      this.flashT = dec(this.flashT);
      this.attackCd = dec(this.attackCd);
      this.attackBuffer = dec(this.attackBuffer);
      this.castT = dec(this.castT);
      this.plungeLandT = dec(this.plungeLandT);
      this.landT = dec(this.landT);
      this.djumpT = dec(this.djumpT);
      this.standT = dec(this.standT);
      this.respawnT = dec(this.respawnT);
    }

    checkStandUp(inp) {
      if (this.standT > 0) return;
      const any = inp.pressed('left') || inp.pressed('right') ||
        inp.pressed('jump') || inp.pressed('dash') || inp.pressed('attack') || inp.pressed('spell') || inp.pressed('down');
      if (!any) return;
      inp.consume('jump'); inp.consume('attack'); inp.consume('spell'); inp.consume('dash');
      this.standUp();
    }

    updateCine(dt) {
      const c = this.cine;
      c.t += dt;
      if (c.kind === 'wake') {
        const IGNITE = 1.35;
        if (!c.ignited && c.t >= IGNITE) {
          c.ignited = true;
          sfx('kindle_done', this.cx, { vol: 0.9, pitch: 1.15 });
          if (G.fx) {
            const fx0 = this.cx - this.facing * 14, fy0 = this.y + this.h - 12;
            G.fx.burst('flash', fx0, fy0, { r: 80, color: '#8fd8ff', life: 0.3 });
            G.fx.burst('ember', fx0, fy0, { count: 14, color: '#8fd8ff', speed: 140 });
            G.fx.burst('spark', fx0, fy0, { count: 10, color: '#dff4ff', speed: 300 });
          }
          drawEvent(this, 'ignite');
        }
        // Let impatient players skip the slow part once the flame is lit.
        const inp = G.input;
        if (c.ignited && c.t < c.dur - 0.7 && (inp.pressed('jump') || inp.pressed('attack') || inp.pressed('confirm'))) {
          inp.consume('jump'); inp.consume('attack');
          c.t = c.dur - 0.7;
        }
      }
      if (c.t >= c.dur) this.endCine(true);
    }

    // ---------------------------------------------------------------------------------- motor events
    onMotorEvent(ev) {
      const m = this.motor, cx = m.x + m.w / 2, feet = m.y + m.h;
      const fx = G.fx;
      switch (ev) {
        case 'jump':
          sfx('jump', cx, { pitch: 0.96 + Math.random() * 0.08 });
          if (fx && !m.inWater) fx.burst('dust', cx, feet, { count: 3, speed: 70, size: 3 });
          drawEvent(this, 'jump');
          break;
        case 'doublejump':
          sfx('doublejump', cx);
          this.djumpT = 0.38;
          if (fx) {
            fx.burst('smoke', cx - 12, feet - 18, { count: 4, color: '#575866', speed: 70, vx: -90, vy: 60, life: 0.7, alpha: 0.55 });
            fx.burst('smoke', cx + 12, feet - 18, { count: 4, color: '#575866', speed: 70, vx: 90, vy: 60, life: 0.7, alpha: 0.55 });
            fx.burst('ember', cx, feet - 14, { count: 5, color: '#8fd0ff', speed: 90 });
          }
          drawEvent(this, 'doublejump');
          break;
        case 'walljump':
          sfx('walljump', cx);
          if (fx) fx.burst('dust', cx - m.facing * 14, m.y + m.h * 0.6, { count: 4, angle: m.facing > 0 ? 0 : Math.PI, spread: 1.2, speed: 90 });
          drawEvent(this, 'walljump');
          break;
        case 'grip':
          sfx('grip', cx, { vol: 0.8 });
          drawEvent(this, 'grip');
          break;
        case 'land':
          sfx('land', cx, { vol: Math.min(1, 0.45 + (m.landVy || 0) / 1400) });
          this.landT = 0.12;
          if (fx) {
            fx.burst('dust', cx - 6, feet, { count: 3, angle: Math.PI, spread: 0.5, speed: 90 });
            fx.burst('dust', cx + 6, feet, { count: 3, angle: 0, spread: 0.5, speed: 90 });
          }
          drawEvent(this, 'land', m.landVy || 0);
          break;
        case 'hardland':
          sfx('hardland', cx);
          this.landT = 0.22;
          if (game()) game().shake(5, 0.18);
          if (fx) {
            fx.burst('dust', cx - 8, feet, { count: 7, angle: Math.PI, spread: 0.45, speed: 200, size: 5 });
            fx.burst('dust', cx + 8, feet, { count: 7, angle: 0, spread: 0.45, speed: 200, size: 5 });
            fx.burst('shard', cx, feet - 2, { count: 4, color: '#8a8070', speed: 180, spread: 1.6 });
          }
          drawEvent(this, 'hardland');
          break;
        case 'dash':
          sfx('dash', cx);
          this.dashFxT = 0;
          if (fx) {
            const back = -m.dashDir;
            fx.burst('flash', cx + back * 10, m.y + 30, { r: 46, color: '#5fb8ff', life: 0.14 });
            fx.burst('spark', cx + back * 8, m.y + 30, { count: 9, color: '#9fdcff', angle: back > 0 ? 0 : Math.PI, spread: 0.9, speed: 520, gravity: 0 });
            if (m.onGround) fx.burst('dust', cx, feet, { count: 4, angle: back > 0 ? 0 : Math.PI, spread: 0.4, speed: 160 });
          }
          if (equipped('flare_trail')) this.trailGroup = { id: nextId('ptrail'), t0: game() ? game().t : 0, lastX: null };
          drawEvent(this, 'dash');
          break;
        case 'splash':
          sfx('splash', cx);
          if (fx) {
            const sy = m.surfaceY || feet;
            fx.burst('splash', cx, sy, { count: 12 });
            fx.burst('bubble', cx, sy + 14, { count: 3 });
          }
          drawEvent(this, 'splash');
          break;
        case 'swim':
          sfx('swim', cx, { vol: 0.7 });
          drawEvent(this, 'ripple');
          break;
        case 'plunge':
          sfx('plunge', cx);
          if (fx) fx.burst('flash', cx, m.y + 20, { r: 50, color: '#7fc8ff', life: 0.16 });
          drawEvent(this, 'plunge');
          break;
        case 'plungeBreak':
          if (game()) game().shake(8, 0.2);
          break;
        case 'plungeLand':
          this.onPlungeLand();
          break;
        case 'plungeEnd':
          if (!this.plungeLandT) this.invuln = Math.max(this.invuln, 0.15);
          break;
        default: break;   // hazard:* is handled by the engine (G.Combat.hazardPlayer)
      }
    }

    onPlungeLand() {
      const g = game(), m = this.motor, cx = m.x + m.w / 2, feet = m.y + m.h;
      this.plungeLandT = 0.28;
      this.invuln = Math.max(this.invuln, 0.3);
      const r = K.PLUNGE_RADIUS;
      const dmg = Math.round(K.PLUNGE_DAMAGE * (equipped('bright_bolt') ? sigilParam('bright_bolt', 'spellMult', K.SPELL_MULT) : 1));
      const id = nextId('pplunge');
      const res = G.Combat.attack({ owner: this, team: 'player', rect: { x: cx - r, y: feet - r * 0.8, w: r * 2, h: r * 0.8 - 2 }, damage: dmg, kind: 'plunge', dir: { x: 0, y: 1 }, id });
      G.Combat.breakTilesInRect(this.room, { x: m.x - 16, y: feet, w: m.w + 32, h: 10 }, 'plunge', id);
      for (const h of res) this.hitSpark(h.target, { x: cx - r, y: feet - r, w: r * 2, h: r }, '#9fdcff');
      sfx('plunge_land', cx);
      if (g) { g.shake(11, 0.32); g.hitstop(0.06); }
      if (G.fx) {
        const fx = G.fx;
        fx.burst('ring', cx, feet - 4, { r: r * 1.05, color: '#8fd0ff', width: 7, life: 0.4 });
        fx.burst('flash', cx, feet - 10, { r: 110, color: '#6fc0ff', life: 0.2 });
        fx.burst('dust', cx - 14, feet, { count: 10, angle: Math.PI, spread: 0.35, speed: 360, size: 6 });
        fx.burst('dust', cx + 14, feet, { count: 10, angle: 0, spread: 0.35, speed: 360, size: 6 });
        fx.burst('spark', cx, feet - 4, { count: 18, color: '#bfe8ff', angle: -Math.PI / 2, spread: 2.6, speed: 620 });
        fx.burst('ember', cx, feet - 8, { count: 12, color: '#7fd0ff', speed: 160 });
        fx.burst('shard', cx, feet - 2, { count: 6, color: '#8a8070', speed: 300 });
      }
      drawEvent(this, 'plungeLand');
    }

    // ---------------------------------------------------------------------------------- the Brand
    canAttack() {
      const m = this.motor;
      return !m.locked && !m.hazard && !m.plunging && m.dashTime <= 0 && !this.kindle && !this.spellHold &&
        this.castT <= K.CAST_TIME - K.CAST_BUSY && !this.cine && !this.resting && this.standT <= 0;
    }

    brandDamage() {
      const pr = prog() || {};
      const table = (G.Items && Array.isArray(G.Items.brandDamage) && G.Items.brandDamage.length) ? G.Items.brandDamage : BRAND_FALLBACK;
      const lvl = Math.max(0, Math.min(table.length - 1, pr.brandLevel | 0));
      let d = table[lvl] || BRAND_FALLBACK[0];
      if (equipped('last_light') && pr.health === 1) d = Math.round(d * sigilParam('last_light', 'damageMult', K.LAST_LIGHT_MULT));
      return d;
    }
    reach() { return equipped('long_brand') ? sigilParam('long_brand', 'reachMult', K.REACH_LONG) : 1; }
    attackCooldown() { return K.ATTACK_CD * (equipped('swift_brand') ? sigilParam('swift_brand', 'cooldownMult', 0.7) : 1); }

    slashRect(dir, facing) {
      const m = this.motor, cx = m.x + m.w / 2, rc = this.reach();
      if (dir === 'up') { const h = K.VERT_H * rc; return { x: cx - K.VERT_W / 2, y: m.y + 10 - h, w: K.VERT_W, h }; }
      if (dir === 'down') { const h = K.VERT_H * rc; return { x: cx - K.VERT_W / 2, y: m.y + m.h - 10, w: K.VERT_W, h }; }
      const w = K.SIDE_W * rc;
      // bottom edge 2 px above the feet so a grounded swing never "hits" the floor it stands on
      return { x: facing > 0 ? m.x + m.w - 6 : m.x + 6 - w, y: m.y + m.h - 2 - K.SIDE_H, w, h: K.SIDE_H };
    }

    startSwing(inp) {
      const m = this.motor;
      const airborne = !m.onGround && !m.swimming;
      const dir = inp.down('up') ? 'up' : (inp.down('down') && airborne && !m.wall) ? 'down' : 'side';
      const facing = this.facing || 1;
      this.swingAlt = 1 - this.swingAlt;
      this.slash = { dir, t: 0, id: nextId('pslash'), facing, rect: this.slashRect(dir, facing), connected: false, pogo: false, wall: false, alt: this.swingAlt, hits: 0 };
      this.attackCd = this.attackCooldown();
      this.attackBuffer = 0;
      sfx('slash', m.x + m.w / 2, { pitch: 0.94 + Math.random() * 0.12 });
      drawEvent(this, 'slash', dir);
      this.swingHit();
    }

    updateSwing(dt) {
      const s = this.slash;
      s.t += dt;
      if (s.t < K.ATTACK_ACTIVE) this.swingHit();
      else s.rect = null;
      if (s.t >= K.ATTACK_ANIM) this.slash = null;
    }

    swingHit() {
      const s = this.slash, m = this.motor;
      const rect = this.slashRect(s.dir, s.facing);
      s.rect = rect;
      const dv = s.dir === 'up' ? { x: 0, y: -1 } : s.dir === 'down' ? { x: 0, y: 1 } : { x: s.facing, y: 0 };
      const res = G.Combat.attack({ owner: this, team: 'player', rect, damage: this.brandDamage(), kind: 'nail', dir: dv, pogo: s.dir === 'down', id: s.id });
      const steadfast = equipped('steadfast');
      const cx = m.x + m.w / 2;
      let enemyHit = false;
      for (const h of res) {
        if (h.target && h.target.team === 'enemy') enemyHit = true;
        this.hitSpark(h.target, rect, '#cfeeff', dv);
      }
      if (res.length && !s.connected) {
        s.connected = true;
        sfx('slash_hit', cx, { pitch: 0.95 + Math.random() * 0.1 });
        if (game()) { game().hitstop(enemyHit ? 0.045 : 0.02); game().shake(enemyHit ? 3 : 2, 0.1); }
        if (s.dir === 'side' && !steadfast) G.PlayerMotor.recoil(m, -s.facing, false);
      }
      if (s.dir === 'down' && res.pogo && !s.pogo) {
        s.pogo = true;
        G.PlayerMotor.pogo(m);
        sfx('pogo', cx);
        if (res.spikes && !res.length && G.fx) {
          G.fx.burst('spark', cx, rect.y + 34, { count: 8, color: '#ffe0b0', angle: -Math.PI / 2, spread: 1.8, speed: 360 });
          G.fx.burst('flash', cx, rect.y + 34, { r: 28, color: '#ffe6c0', life: 0.1 });
        }
        drawEvent(this, 'pogo');
      }
      if (res.wall && !res.length && !s.wall && !s.pogo && s.dir !== 'down') {
        s.wall = true;
        const pt = this.terrainContact(rect, s.dir, s.facing);
        if (!res.breakable) sfx('slash_wall', cx);         // breakables play their own crack sound
        if (G.fx && pt) {
          const ang = s.dir === 'up' ? Math.PI / 2 : (s.facing > 0 ? Math.PI : 0);
          G.fx.burst('spark', pt.x, pt.y, { count: 8, color: '#ffd9a0', angle: ang, spread: 1.5, speed: 380 });
          G.fx.burst('flash', pt.x, pt.y, { r: 24, color: '#ffe2b0', life: 0.09 });
        }
        if (s.dir === 'side' && !steadfast && !s.connected) G.PlayerMotor.recoil(m, -s.facing, false);
        drawEvent(this, 'clang');
      }
    }

    hitSpark(target, rect, color, dv) {
      if (!G.fx || !target) return;
      let hr = target;
      try { hr = target.hurtRect ? target.hurtRect() : target; } catch (err) { hr = target; }
      const p = overlapRect(rect, hr || target);
      const ang = dv ? Math.atan2(dv.y, dv.x) : -Math.PI / 2;
      G.fx.burst('flash', p.x, p.y, { r: 34, color, life: 0.11 });
      G.fx.burst('spark', p.x, p.y, { count: 9, color: '#ffffff', angle: ang, spread: 1.4, speed: 480 });
      G.fx.burst('slash', p.x, p.y, { r: 22, angle: ang + Math.PI / 2 + (Math.random() - 0.5) * 0.6, span: 1.3, width: 5, life: 0.11, color: '#eaf8ff' });
    }

    // Point where a slash meets terrain (for sparks): first solid tile scanning outward from the body.
    terrainContact(rect, dir, facing) {
      const room = this.room, m = this.motor, P = G.Physics;
      if (!room) return null;
      if (dir === 'up') {
        const cx = m.x + m.w / 2, c = Math.floor(cx / TILE);
        for (let y = m.y; y >= rect.y; y -= 4) {
          const r = Math.floor(y / TILE);
          if (P.isSolidTile(P.tileAt(room, c, r))) return { x: cx, y: (r + 1) * TILE };
        }
        return { x: cx, y: rect.y };
      }
      const y = m.y + m.h * 0.45, r = Math.floor(y / TILE);
      const x0 = facing > 0 ? m.x + m.w : m.x, x1 = facing > 0 ? rect.x + rect.w : rect.x;
      for (let x = x0; facing > 0 ? x <= x1 : x >= x1; x += facing * 4) {
        const c = Math.floor(x / TILE);
        if (P.isSolidTile(P.tileAt(room, c, r))) return { x: facing > 0 ? c * TILE : (c + 1) * TILE, y };
      }
      return { x: x1, y };
    }

    // ---------------------------------------------------------------------------------- spells
    spellCost() { return K.SPELL_COST; }
    canKindleNow() {
      const m = this.motor, pr = prog(), g = game(), inp = G.input;
      if (!pr || !g) return false;
      return m.onGround && !m.swimming && !m.hazard && !m.plunging && m.dashTime <= 0 && m.knockTime <= 0 &&
        !inp.down('left') && !inp.down('right') && !this.slash &&
        pr.health < g.maxHealth() && pr.ember >= K.SPELL_COST;
    }

    onSpellPressed(inp) {
      const m = this.motor, ab = this.abilities();
      if (m.plunging || m.dashTime > 0 || this.kindle || this.spellHold) return;
      if (this.castT > K.CAST_TIME - K.CAST_BUSY) return;
      const airborne = !m.onGround && !m.swimming;
      if (inp.down('down') && airborne && ab.plunge) { this.tryPlunge(); return; }
      if (this.canKindleNow()) { this.spellHold = { t: 0 }; return; }
      this.tryBolt();
    }

    updateSpellHold(dt, inp) {
      const h = this.spellHold;
      h.t += dt;
      if (!inp.down('spell')) {
        this.spellHold = null;
        if (h.t < K.TAP_TIME) this.tryBolt();
        return;
      }
      if (h.t >= K.TAP_TIME && this.canKindleNow()) {
        this.spellHold = null;
        this.startKindle(h.t);
      }
    }

    kindleDuration() {
      let d = K.KINDLE_TIME;
      if (equipped('kindle_haste')) d *= sigilParam('kindle_haste', 'kindleTimeMult', 0.6);
      if (equipped('deep_kindle')) d *= sigilParam('deep_kindle', 'kindleTimeMult', 1.65);
      return d;
    }

    startKindle(elapsed) {
      const heal = equipped('deep_kindle') ? sigilParam('deep_kindle', 'heal', 2) : 1;
      this.kindle = { t: Math.max(0, elapsed || 0), dur: this.kindleDuration(), heal, snd: null, emberT: 0, count: 0 };
      this.motor.vx = 0;
      this.kindleSound();
      drawEvent(this, 'kindle');
    }
    kindleSound() {
      const A = G.Audio;
      if (A && typeof A.sfx === 'function') {
        try { this.kindle.snd = A.sfx('kindle', { pitch: 1, pan: 0, force: true }) || null; } catch (err) { this.kindle.snd = null; }
      }
    }
    cancelKindle() {
      const k = this.kindle;
      if (!k) return;
      this.kindle = null;
      if (k.snd && typeof k.snd.stop === 'function') { try { k.snd.stop(0.08); } catch (err) { /* ignore */ } }
      drawEvent(this, 'kindleEnd');
    }

    updateKindle(dt, inp) {
      const k = this.kindle, m = this.motor, g = game(), pr = prog();
      if (!inp.down('spell') || !m.onGround || m.swimming || m.knockTime > 0 || m.hazard || g.isLocked()) { this.cancelKindle(); return; }
      k.t += dt;
      k.emberT -= dt;
      if (k.emberT <= 0 && G.fx) {
        k.emberT = 0.05;
        const q = Math.min(1, k.t / k.dur);
        G.fx.burst('ember', m.x + m.w / 2 + (Math.random() - 0.5) * 30, m.y + m.h - 4 - Math.random() * 30,
          { count: 1, color: Math.random() < 0.5 ? '#7fd0ff' : '#cfeeff', speed: 60 + q * 80, life: 0.6 + Math.random() * 0.5 });
      }
      if (k.t < k.dur) return;
      // complete: spend → heal
      if (!g.spendEmber(K.SPELL_COST)) { this.cancelKindle(); return; }
      g.heal(k.heal);
      k.count++;
      const cx = m.x + m.w / 2;
      sfx('kindle_done', cx);
      if (G.fx) {
        G.fx.burst('flash', cx, m.y + 6, { r: 70, color: '#bfe8ff', life: 0.2 });
        G.fx.burst('ring', cx, m.y + 24, { r: 70, color: '#9fdcff', width: 4, life: 0.3 });
        G.fx.burst('ember', cx, m.y + 20, { count: 10, color: '#cfeeff', speed: 140 });
      }
      drawEvent(this, 'kindleDone');
      if (pr.health < g.maxHealth() && pr.ember >= K.SPELL_COST) {   // chain while held
        k.t = 0;
        if (k.snd && typeof k.snd.stop === 'function') { try { k.snd.stop(0.05); } catch (err) { /* ignore */ } }
        this.kindleSound();
      } else this.cancelKindle();
    }

    spellFizzle() {
      const m = this.motor;
      sfx('deny', m.x + m.w / 2, { vol: 0.5 });
      if (G.fx) G.fx.burst('smoke', m.x + m.w / 2 + this.facing * 12, m.y + 26, { count: 3, color: '#5a5c68', speed: 30, life: 0.6, alpha: 0.4 });
      drawEvent(this, 'fizzle');
    }

    tryBolt() {
      const g = game(), m = this.motor, ab = this.abilities();
      if (!ab.bolt) return false;
      if (m.hazard || m.plunging) return false;
      if (!g.spendEmber(K.SPELL_COST)) { this.spellFizzle(); return false; }
      const dir = m.wall ? -m.wall : (this.facing || 1);
      this.facing = dir; m.facing = dir;
      const dmg = Math.round(K.BOLT_DAMAGE * (equipped('bright_bolt') ? sigilParam('bright_bolt', 'spellMult', K.SPELL_MULT) : 1));
      const b = new PlayerBolt({ type: 'player_bolt', dir, damage: dmg });
      b.x = m.x + m.w / 2 + dir * 10 - b.w / 2;
      b.y = m.y + 15;
      b.owner = this;
      this.room.add(b);
      this.castT = K.CAST_TIME;
      this.slash = null;
      G.PlayerMotor.recoil(m, -dir, false);
      sfx('bolt', m.x + m.w / 2);
      if (G.fx) G.fx.burst('flash', m.x + m.w / 2 + dir * 18, m.y + 28, { r: 44, color: '#8fd8ff', life: 0.14 });
      drawEvent(this, 'cast');
      return true;
    }

    tryPlunge() {
      const g = game(), m = this.motor;
      if (m.plunging || m.hazard) return false;
      if (!g.spendEmber(K.SPELL_COST)) { this.spellFizzle(); return false; }
      if (!G.PlayerMotor.startPlunge(m)) { g.addEmber(K.SPELL_COST); return false; }
      this.slash = null;
      this.attackBuffer = 0;
      this.invuln = Math.max(this.invuln, 0.05);
      return true;
    }

    // ---------------------------------------------------------------------------------- movement fx
    updateMovementFx(dt) {
      const m = this.motor, fx = G.fx, cx = m.x + m.w / 2, feet = m.y + m.h;
      // run cycle: quiet footsteps on each foot plant
      if (m.onGround && Math.abs(m.vx) > 30 && m.dashTime <= 0 && !m.swimming) {
        this.runPhase += Math.abs(m.vx) * dt / 46 * Math.PI;
        const n = Math.floor(this.runPhase / Math.PI);
        if (n !== this.stepCount) {
          this.stepCount = n;
          sfx('step', cx, { vol: 0.35, pitch: 0.9 + Math.random() * 0.2 });
          if (fx && Math.random() < 0.5) fx.burst('dust', cx - m.facing * 6, feet, { count: 1, angle: m.facing > 0 ? Math.PI : 0, spread: 0.5, speed: 50, size: 2.5, alpha: 0.35 });
        }
      } else if (m.onGround) {
        this.runPhase = 0; this.stepCount = 0;
      }
      // dash: blue flame burst stream (+ flare_trail segments)
      if (m.dashTime > 0) {
        this.dashFxT -= dt;
        if (fx && this.dashFxT <= 0) {
          this.dashFxT = 1 / 60;
          fx.burst('ember', cx - m.dashDir * 10, m.y + 18 + Math.random() * 26, { count: 1, color: Math.random() < 0.6 ? '#5fb8ff' : '#dff4ff', speed: 40, vx: -m.dashDir * 120, life: 0.35 });
        }
        if (this.trailGroup) this.layTrail(false);
      } else if (this.trailGroup) {
        this.layTrail(true);
        this.trailGroup = null;
      }
      // wall slide: wax shavings / dust at the contact point
      if (m.wall && m.vy > 20) {
        this.slideFxT -= dt;
        if (fx && this.slideFxT <= 0) {
          this.slideFxT = 0.06;
          const wx = m.wall > 0 ? m.x + m.w : m.x;
          fx.burst('dust', wx, m.y + m.h * 0.75, { count: 1, angle: -Math.PI / 2, spread: 0.6, speed: 40, size: 2.5, alpha: 0.45, color: '#c9bfa8' });
          if (Math.random() < 0.3) fx.burst('wax', wx, m.y + m.h * 0.6, { count: 1, speed: 40, size: 1.6, color: '#efe5cf' });
        }
      }
      // plunge comet trail
      if (m.plunging && fx) {
        fx.burst('ember', cx + (Math.random() - 0.5) * 16, m.y + 10, { count: 2, color: Math.random() < 0.5 ? '#5fb8ff' : '#dff4ff', speed: 30, vy: -260, life: 0.3 });
      }
    }

    // Flare Trail: burning segments along the dash path (one shared damage clock per dash).
    layTrail(final) {
      const g = this.trailGroup, m = this.motor;
      if (!g || !this.room) return;
      const x = m.x + m.w / 2;
      if (g.lastX != null && Math.abs(x - g.lastX) < 30 && !final) return;
      if (final && g.lastX != null && Math.abs(x - g.lastX) < 12) return;
      g.lastX = x;
      const seg = new FlareTrail({ type: 'flare_trail', group: g });
      seg.x = x - seg.w / 2;
      seg.y = m.y + m.h - seg.h;
      this.room.add(seg);
    }

    // ---------------------------------------------------------------------------------- interaction
    findInteractable() {
      const room = this.room;
      if (!room) return null;
      let best = null, bestD = Infinity;
      const list = room.entities;
      for (let i = 0; i < list.length; i++) {
        const e = list[i];
        if (e.dead || !e.interactable) continue;
        let r;
        try { r = typeof e.interactRect === 'function' ? e.interactRect() : { x: e.x - 20, y: e.y - 20, w: e.w + 40, h: e.h + 40 }; } catch (err) { G.reportError(err, 'interactRect ' + e.type); continue; }
        if (!r || !G.U.aabb(this, r)) continue;
        const d = Math.abs((e.x + e.w / 2) - this.cx);
        if (d < bestD) { bestD = d; best = e; }
      }
      return best;
    }

    updateInteract(inp, ctl) {
      const m = this.motor;
      const can = ctl && m.onGround && !this.busy() && !m.swimming;
      const e = can ? this.findInteractable() : null;
      this.interactTarget = e;
      if (!e) return;
      if (G.UI && typeof G.UI.prompt === 'function') {
        try { G.UI.prompt(e.x + e.w / 2, e.y - 10, e.promptText || 'Use'); } catch (err) { G.reportError(err, 'UI.prompt'); }
      }
      if (inp.pressed('interact') && typeof e.interact === 'function') {
        inp.consume('interact'); inp.consume('up');
        this.attackBuffer = 0;
        try { e.interact(this); } catch (err) { G.reportError(err, 'interact ' + e.type); }
      }
    }

    // ---------------------------------------------------------------------------------- drawing
    lightInfo() {
      const m = this.motor;
      let r = K.LIGHT_R, intensity = 1;
      if (this.kindle) { const q = Math.min(1, this.kindle.t / this.kindle.dur); r += 70 * q + 12 * Math.sin((game() ? game().t : 0) * 20); intensity = 1; }
      if (m.plunging) r += 40;
      if (this.cine && this.cine.kind === 'wake') {
        const c = this.cine, IGN = 1.35;
        r = c.t < IGN ? 70 : K.LIGHT_R * Math.min(1, 0.3 + (c.t - IGN) / 0.6);
      }
      if (this.cine && this.cine.kind === 'pose' && this.cine.name === 'ability') r += 80;
      if (this.respawnT > 0) r *= 1 - this.respawnT / 0.6 * 0.6;
      if (this.dying) {
        const dt = G.game && G.game.mode === 'dead' ? G.game.deathTime : this.deathT;
        r *= Math.max(0, 1 - dt / 0.7);
      }
      return { x: m.x + m.w / 2, y: m.y + 6, r, color: K.LIGHT_COLOR, intensity, flicker: true };
    }

    draw(ctx, t) {
      if (G.lighting) { const l = this.lightInfo(); if (l.r > 4) G.lighting.add(l); }
      const D = draw();
      if (D && typeof D.draw === 'function') { D.draw(ctx, this, t); return; }
      this.drawFallback(ctx, t);
    }

    // Minimal stand-in used only if player_draw.js failed to load.
    drawFallback(ctx, t) {
      if (this.dying) return;
      if (this.flickerT > 0 && Math.floor(t * 24) % 2 === 0) ctx.globalAlpha = 0.45;
      const x = this.x, y = this.y, w = this.w, h = this.h, cx = x + w / 2;
      ctx.fillStyle = '#141218'; ctx.fillRect(x - 1, y + 9, w + 2, h - 8);
      ctx.fillStyle = '#ece5d2'; ctx.fillRect(x + 1, y + 11, w - 2, h - 20);
      ctx.fillStyle = '#0d0b10';
      ctx.fillRect(cx + this.facing * 3 - 6, y + 17, 3, 10); ctx.fillRect(cx + this.facing * 3 + 3, y + 17, 3, 10);
      if (G.fx) G.fx.glowAt(ctx, cx, y + 2, 22, '#4fb0ff', 0.8);
      ctx.fillStyle = '#9fdcff'; ctx.beginPath(); ctx.ellipse(cx, y + 2, 4, 8, 0, 0, Math.PI * 2); ctx.fill();
      ctx.globalAlpha = 1;
    }
  }
  Player.TUNING = K;

  // =====================================================================================================
  // Ember Bolt: fast piercing blue fireball. Bursts on walls (and damages breakables there).
  class PlayerBolt extends G.Entity {
    constructor(props) {
      super(props);
      this.type = 'player_bolt';
      this.w = 40; this.h = 28;
      this.anchor = 'center';
      this.team = 'player';
      this.z = 5;
      this.dir = props.dir || 1;
      this.facing = this.dir;
      this.damage = props.damage || K.BOLT_DAMAGE;
      this.speed = props.speed || 1000;
      this.life = props.life || 1.1;
      this.age = 0;
      this.attackId = nextId('pbolt');
      this.hitCount = 0;
      this.trail = [];             // recent centre positions (for the comet tail)
      this.burst = null;           // {t} when bursting (lingers briefly for the explosion visual)
    }
    update(dt) {
      const room = this.room;
      if (!room) return;
      if (this.burst) {
        this.burst.t += dt;
        G.lighting.add({ x: this.burst.x, y: this.burst.y, r: 200 * (1 - this.burst.t / 0.25), color: K.LIGHT_COLOR, intensity: 0.9 });
        if (this.burst.t >= 0.25) this.remove();
        return;
      }
      this.age += dt;
      const total = this.speed * dt;
      const steps = Math.max(1, Math.ceil(total / 16));
      for (let i = 0; i < steps; i++) {
        this.x += (this.dir * total) / steps;
        const core = { x: this.dir > 0 ? this.x + this.w - 14 : this.x + 2, y: this.y + 8, w: 12, h: this.h - 16 };
        if (G.Physics.rectSolid(room, core.x, core.y, core.w, core.h)) { this.explode(true); return; }
        const res = G.Combat.attack({ owner: this, team: 'player', rect: this, damage: this.damage, kind: 'spell', dir: { x: this.dir, y: 0 }, id: this.attackId });
        for (const h of res) this.onConnect(h.target);
      }
      this.trail.push(this.cx, this.cy);
      if (this.trail.length > 16) this.trail.splice(0, 2);
      if (G.fx && Math.random() < 0.8) G.fx.burst('ember', this.cx - this.dir * 14, this.cy + (Math.random() - 0.5) * 12, { count: 1, color: Math.random() < 0.5 ? '#5fb8ff' : '#dff4ff', speed: 40, vx: -this.dir * 60, life: 0.35 });
      G.lighting.add({ x: this.cx, y: this.cy, r: 190, color: K.LIGHT_COLOR, intensity: 0.95, flicker: true });
      if (this.x + this.w < -60 || this.x > room.widthPx + 60) { this.remove(); return; }
      if (this.age >= this.life) this.explode(false);
    }
    onConnect(target) {
      this.hitCount++;
      G.sfxAt('bolt_hit', this.cx);
      if (G.fx && target) {
        let hr = null;    // hurtRect() may return null on a target that started dying (killing blow)
        try { hr = target.hurtRect ? target.hurtRect() : null; } catch (err) { hr = null; }
        const p = overlapRect(this, hr || target);
        G.fx.burst('flash', p.x, p.y, { r: 40, color: '#9fdcff', life: 0.12 });
        G.fx.burst('spark', p.x, p.y, { count: 8, color: '#dff4ff', angle: this.dir > 0 ? 0 : Math.PI, spread: 1.6, speed: 420 });
      }
    }
    explode(wall) {
      const x = wall ? (this.dir > 0 ? this.x + this.w - 6 : this.x + 6) : this.cx, y = this.cy;
      if (wall) {   // terrain hit: let the spell crack B walls in front
        G.Combat.attack({ owner: this, team: 'player', rect: { x: this.dir > 0 ? this.x + this.w - 12 : this.x - 8, y: this.y + 4, w: 20, h: this.h - 8 }, damage: this.damage, kind: 'spell', dir: { x: this.dir, y: 0 }, id: this.attackId });
        G.sfxAt('bolt_hit', x, { pitch: 0.85 });
      }
      if (G.fx) {
        G.fx.burst('flash', x, y, { r: wall ? 70 : 50, color: '#7fc8ff', life: 0.18 });
        G.fx.burst('spark', x, y, { count: wall ? 14 : 8, color: '#bfe8ff', angle: this.dir > 0 ? Math.PI : 0, spread: wall ? 2.2 : 6.28, speed: 420 });
        G.fx.burst('ember', x, y, { count: 8, color: '#7fd0ff', speed: 120 });
        G.fx.burst('smoke', x, y, { count: 3, color: '#3d4a66', speed: 40, life: 0.8, alpha: 0.35 });
      }
      this.burst = { t: 0, x, y, wall };
    }
    draw(ctx, t) {
      const D = G.PlayerDraw;
      if (D && typeof D.drawBolt === 'function') { D.drawBolt(ctx, this, t); return; }
      if (this.burst) return;
      if (G.fx) G.fx.glowAt(ctx, this.cx, this.cy, 40, '#4fb0ff', 0.9);
      ctx.fillStyle = '#dff4ff';
      ctx.beginPath(); ctx.ellipse(this.cx, this.cy, 12, 8, 0, 0, Math.PI * 2); ctx.fill();
    }
  }

  // =====================================================================================================
  // Flare Trail segment: burning blue fire left by Flare Dash (flare_trail sigil). All segments of one dash
  // share a damage clock, so a target takes at most one hit per 0.25 s from the whole trail.
  class FlareTrail extends G.Entity {
    constructor(props) {
      super(props);
      this.type = 'flare_trail';
      this.w = 46; this.h = 34;
      this.team = 'player';
      this.z = -1;
      this.group = props.group || { id: nextId('ptrail'), t0: G.game ? G.game.t : 0 };
      this.life = this.max = props.life || K.TRAIL_LIFE;
      this.seed = Math.random() * 100;
    }
    update(dt) {
      this.life -= dt;
      if (this.life <= 0) { this.remove(); return; }
      const now = G.game ? G.game.t : 0;
      const tick = Math.floor((now - this.group.t0) / K.TRAIL_TICK);
      const dmg = sigilParam('flare_trail', 'damage', K.TRAIL_DAMAGE);
      G.Combat.attack({ owner: this, team: 'player', rect: this, damage: dmg, kind: 'trail', dir: { x: 0, y: -1 }, id: this.group.id + ':' + tick });
      const k = this.life / this.max;
      G.lighting.add({ x: this.cx, y: this.cy, r: 80 * k + 20, color: K.LIGHT_COLOR, intensity: 0.7 * k, glow: false });
      if (G.fx && Math.random() < 0.25) G.fx.burst('ember', this.cx + (Math.random() - 0.5) * this.w, this.y + this.h - 6, { count: 1, color: '#7fd0ff', speed: 50, life: 0.5 });
    }
    draw(ctx, t) {
      const D = G.PlayerDraw;
      if (D && typeof D.drawTrail === 'function') { D.drawTrail(ctx, this, t); return; }
      const k = this.life / this.max;
      if (G.fx) G.fx.glowAt(ctx, this.cx, this.y + this.h - 10, 26 * k + 6, '#4fb0ff', 0.8 * k);
    }
  }

  G.registerEntity('player', Player);
  G.registerEntity('player_bolt', PlayerBolt);
  G.registerEntity('flare_trail', FlareTrail);
  G.Player = Player;
  G.PlayerBolt = PlayerBolt;
  G.FlareTrail = FlareTrail;

  // ---- engine hooks -----------------------------------------------------------------------------------
  // Resting at a sconce seats the Wickling (G.game.rest emits 'rest').
  G.events.on('rest', (e) => {
    const p = G.game && G.game.player;
    if (p instanceof Player && !p.dying) p.sit(e && e.sconce);
  });
  // Respawn after death / continue: seated at the sconce we respawned at (HK-style), if it exists here.
  function seatAtRespawnSconce() {
    const g = G.game, p = g && g.player, pr = g && g.progress, room = g && g.room;
    if (!(p instanceof Player) || !pr || !pr.sconce || !room || room.id !== pr.sconce.room) return;
    const s = room.find((e) => e.type === 'sconce' && (e.persistId === pr.sconce.id || (e.props && e.props.id === pr.sconce.id)));
    if (s) p.sit(s);
  }
  G.events.on('respawn', seatAtRespawnSconce);
  G.events.on('continue', seatAtRespawnSconce);
  // New game: the Wickling wakes on the ash (skipped in ?test=1 unless &wake=1, so tests stay deterministic).
  G.events.on('newGame', () => {
    const p = G.game && G.game.player;
    const q = G.params || {};
    if (!(p instanceof Player)) return;
    if (G.test && q.wake !== '1') return;
    p.playWake();
  });
})();
