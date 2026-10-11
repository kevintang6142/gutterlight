// src/engine/debug.js — G.debug: test/automation API (TECH_SPEC §16), the ?debug=1 overlay, and
// G.DebugPlayer: a minimal motor-driven box with a slash, used ONLY when no 'player' entity is registered.
// No DOM access at load time (G.debug.init is called by main.js at boot).
(function () {
  'use strict';
  const G = globalThis.G;
  const TILE = G.CONST.TILE;
  const W = G.CONST.VIEW_W;

  // =====================================================================================================
  // DebugPlayer — stand-in for G.Player (§9.2 contract subset) so the engine is testable on its own.
  // =====================================================================================================
  const SLASH_CD = 0.38;
  const SLASH_SHOW = 0.12;

  class DebugPlayer extends G.Entity {
    constructor(props) {
      super(props || { type: 'debug_player' });
      this.type = 'debug_player';
      this.w = G.CONST.PLAYER_W;
      this.h = G.CONST.PLAYER_H;
      this.team = 'player';
      this.z = 0;
      this.cull = false;
      this.motor = G.PlayerMotor.create(this.x, this.y);
      this.facing = 1;
      this.invuln = 0;
      this.resting = false;
      this.attackCd = 0;
      this.slash = null;      // {dir:'side'|'up'|'down', t, rect}
      this.seq = 0;
      this.hidden = false;
      this.lastEvents = [];
    }

    abilities() { return (G.game && G.game.progress && G.game.progress.abilities) || {}; }

    placeAt(x, y) {
      const m = this.motor;
      m.x = x; m.y = y; m.vx = 0; m.vy = 0;
      m.dashTime = 0; m.plunging = false; m.knockTime = 0; m.recoilTime = 0; m.wall = 0;
      m.hazard = null; m.fallStartY = y;
      this.x = x; this.y = y;
    }

    onRoomEnter(room) { this.room = room; this.slash = null; this.resting = false; }

    busy() { return !!this.slash || this.motor.plunging; }

    respawn() {
      this.motor = G.PlayerMotor.create(this.motor.x, this.motor.y);
      this.motor.facing = this.facing;
      this.invuln = 0; this.attackCd = 0; this.slash = null; this.hidden = false; this.dead = false; this.resting = false;
    }

    update(dt) {
      const g = G.game, inp = G.input, m = this.motor;
      m.locked = g.isLocked() || this.resting;
      const ctl = !m.locked;
      const ab = this.abilities();
      if (ctl && inp.pressed('spell') && inp.down('down') && !m.onGround && !m.swimming && ab.plunge && !m.plunging) {
        if (G.PlayerMotor.startPlunge(m)) this.invuln = Math.max(this.invuln, 0.05);
      }
      G.PlayerMotor.step(m, {
        left: inp.down('left'), right: inp.down('right'), up: inp.down('up'), down: inp.down('down'),
        jump: inp.down('jump'), jumpPressed: inp.pressed('jump'), dashPressed: inp.pressed('dash'),
      }, { room: this.room, dt, abilities: ab, mods: { noKnockback: g.isEquipped('steadfast') } });
      this.x = m.x; this.y = m.y;
      this.facing = m.facing || this.facing;
      this.lastEvents = m.events.slice();
      for (const ev of m.events) this.onMotorEvent(ev);

      if (this.invuln > 0) this.invuln = Math.max(0, this.invuln - dt);
      if (this.attackCd > 0) this.attackCd -= dt;
      if (this.slash && (this.slash.t -= dt) <= 0) this.slash = null;
      if (ctl && inp.pressed('attack') && this.attackCd <= 0 && !m.plunging && !m.hazard) this.doSlash();
      if (ctl && inp.pressed('interact') && m.onGround && !this.busy()) this.tryInteract();
      this.showPrompt();
    }

    onMotorEvent(ev) {
      const cx = this.cx, feet = this.y + this.h;
      switch (ev) {
        case 'jump': case 'doublejump': case 'walljump': case 'dash': case 'grip': case 'land': case 'hardland':
        case 'plunge': case 'splash': case 'swim':
          G.sfxAt(ev, cx);
          if ((ev === 'land' || ev === 'hardland') && G.fx) G.fx.burst('dust', cx, feet, { count: ev === 'hardland' ? 10 : 4 });
          if (ev === 'hardland' && G.game) G.game.shake(4, 0.15);
          if (ev === 'splash' && G.fx) G.fx.burst('splash', cx, feet, { count: 10 });
          break;
        case 'plungeLand': {
          G.sfxAt('plunge_land', cx);
          if (G.game) { G.game.shake(10, 0.3); G.game.hitstop(0.05); }
          if (G.fx) { G.fx.burst('ring', cx, feet, { r: 120, color: '#8fd0ff' }); G.fx.burst('dust', cx, feet, { count: 12 }); }
          G.Combat.attack({ owner: this, team: 'player', rect: { x: cx - 100, y: feet - 60, w: 200, h: 64 }, damage: 15, kind: 'plunge', dir: { x: 0, y: 1 }, id: 'dbgp' + (++this.seq) });
          break;
        }
        default: break;
      }
    }

    brandDamage() {
      const pr = G.game.progress || {};
      const table = (G.Items && G.Items.brandDamage) || [5, 9, 13, 17];
      let d = table[Math.max(0, Math.min(table.length - 1, pr.brandLevel || 0))] || 5;
      if (G.game.isEquipped('last_light') && pr.health === 1) d = Math.round(d * 1.75);
      return d;
    }

    slashRect(dir) {
      const m = this.motor, cx = m.x + m.w / 2;
      const reach = G.game.isEquipped('long_brand') ? 1.35 : 1;
      if (dir === 'up') return { x: cx - 40, y: m.y - 78 * reach, w: 80, h: 78 * reach + 10 };
      if (dir === 'down') return { x: cx - 40, y: m.y + m.h - 10, w: 80, h: 78 * reach + 10 };
      const w = 86 * reach;
      return { x: this.facing > 0 ? m.x + m.w - 6 : m.x + 6 - w, y: m.y + 2, w, h: 52 };
    }

    doSlash() {
      const inp = G.input, m = this.motor;
      const dir = inp.down('up') ? 'up' : (inp.down('down') && !m.onGround && !m.swimming) ? 'down' : 'side';
      const rect = this.slashRect(dir);
      const dv = dir === 'up' ? { x: 0, y: -1 } : dir === 'down' ? { x: 0, y: 1 } : { x: this.facing, y: 0 };
      const res = G.Combat.attack({ owner: this, team: 'player', rect, damage: this.brandDamage(), kind: 'nail', dir: dv, pogo: dir === 'down', id: 'dbg' + (++this.seq) });
      this.slash = { dir, t: SLASH_SHOW, rect, facing: this.facing };
      this.attackCd = SLASH_CD * (G.game.isEquipped('swift_brand') ? 0.7 : 1);
      const steadfast = G.game.isEquipped('steadfast');
      if (res.pogo && dir === 'down') { G.PlayerMotor.pogo(m); G.sfxAt('pogo', this.cx); }
      if (res.length) {
        G.game.hitstop(0.05);
        G.sfxAt('slash_hit', this.cx);
        if (!steadfast) G.PlayerMotor.recoil(m, -this.facing, dir !== 'side');
      } else if (res.wall || res.breakable) {
        G.sfxAt('slash_wall', this.cx);
        if (G.fx) G.fx.burst('spark', rect.x + rect.w / 2, rect.y + rect.h / 2, { count: 5, color: '#ffe0a0' });
        if (!steadfast && dir === 'side') G.PlayerMotor.recoil(m, -this.facing, false);
      } else G.sfxAt('slash', this.cx);
    }

    // Nearest interactable whose interact rect overlaps the player.
    findInteractable() {
      const room = this.room;
      if (!room) return null;
      let best = null, bestD = Infinity;
      for (const e of room.entities) {
        if (e.dead || !e.interactable) continue;
        let r;
        try { r = e.interactRect ? e.interactRect() : { x: e.x - 20, y: e.y - 20, w: e.w + 40, h: e.h + 40 }; } catch (err) { G.reportError(err, 'interactRect ' + e.type); continue; }
        if (!r || !G.U.aabb(this, r)) continue;
        const d = Math.abs(e.cx - this.cx);
        if (d < bestD) { bestD = d; best = e; }
      }
      return best;
    }
    tryInteract() {
      const e = this.findInteractable();
      if (!e || typeof e.interact !== 'function') return;
      G.input.consume('interact'); G.input.consume('up');
      try { e.interact(this); } catch (err) { G.reportError(err, 'interact ' + e.type); }
    }
    showPrompt() {
      if (!this.motor.onGround || !G.UI || typeof G.UI.prompt !== 'function') return;
      const e = this.findInteractable();
      if (e) { try { G.UI.prompt(e.cx, e.y - 10, e.promptText || 'Use'); } catch (err) { G.reportError(err, 'UI.prompt'); } }
    }

    hurt(amount, source) {
      const g = G.game, m = this.motor, pr = g.progress;
      if (!pr || g.god || g.mode !== 'play') return false;
      const hazard = !!(source && source.hazard);
      if (!hazard && (this.invuln > 0 || m.plunging)) return false;
      pr.health = Math.max(0, pr.health - (amount == null ? 1 : amount));
      this.invuln = 1.0 * (g.isEquipped('smolder_shell') ? 1.6 : 1);
      this.slash = null;
      G.sfxAt('player_hurt', this.cx);
      g.shake(8, 0.25);
      g.flash('rgba(255,255,255,0.6)', 0.12);
      if (!hazard) {
        g.hitstop(0.12);
        const sx = source && (source.cx != null ? source.cx : source.x != null ? source.x + (source.w || 0) / 2 : null);
        const dir = sx == null ? -this.facing : (this.cx >= sx ? 1 : -1);
        if (!g.isEquipped('steadfast')) G.PlayerMotor.knockback(m, dir);
      }
      if (pr.health <= 0) g.playerDied();
      return true;
    }

    draw(ctx, t) {
      const g = G.game;
      if (g && g.mode === 'dead') return;
      if (this.invuln > 0 && Math.floor(t * 24) % 2 === 0) ctx.globalAlpha = 0.45;
      const x = Math.round(this.x), y = Math.round(this.y), w = this.w, h = this.h;
      const cx = x + w / 2;
      // body
      ctx.fillStyle = '#1a1714';
      ctx.fillRect(x - 2, y + 8, w + 4, h - 6);
      ctx.fillStyle = '#ece4d2';
      ctx.fillRect(x, y + 10, w, h - 10);
      ctx.fillStyle = '#cfc4ad';
      ctx.fillRect(x, y + h - 10, w, 10);
      // eyes (look toward facing)
      ctx.fillStyle = '#0c0a08';
      const ex = cx + this.facing * 3;
      ctx.fillRect(ex - 7, y + 18, 4, 11);
      ctx.fillRect(ex + 3, y + 18, 4, 11);
      // wick + blue flame
      ctx.fillStyle = '#141210';
      ctx.fillRect(cx - 1.5, y + 2, 3, 9);
      const fl = 1 + 0.12 * Math.sin(t * 17) + 0.06 * Math.sin(t * 31);
      if (G.fx) G.fx.glowAt(ctx, cx, y - 2, 26 * fl, '#4fb0ff', 0.75);
      ctx.fillStyle = '#7fd0ff';
      ctx.beginPath();
      ctx.moveTo(cx, y - 14 * fl); ctx.quadraticCurveTo(cx + 6, y - 2, cx, y + 4); ctx.quadraticCurveTo(cx - 6, y - 2, cx, y - 14 * fl);
      ctx.fill();
      ctx.fillStyle = '#eefaff';
      ctx.fillRect(cx - 1.5, y - 4, 3, 5);
      ctx.globalAlpha = 1;
      if (this.slash) this.drawSlash(ctx);
    }

    drawSlash(ctx) {
      const s = this.slash, r = s.rect;
      const k = s.t / SLASH_SHOW;
      const cx = r.x + r.w / 2, cy = r.y + r.h / 2;
      const rad = Math.max(r.w, r.h) * 0.55;
      const base = s.dir === 'up' ? -Math.PI / 2 : s.dir === 'down' ? Math.PI / 2 : (s.facing > 0 ? 0 : Math.PI);
      ctx.globalCompositeOperation = 'lighter';
      ctx.globalAlpha = 0.85 * k;
      ctx.strokeStyle = '#bfe6ff';
      ctx.lineWidth = 7;
      ctx.lineCap = 'round';
      const ox = s.dir === 'side' ? -s.facing * rad * 0.5 : 0, oy = s.dir === 'up' ? rad * 0.5 : s.dir === 'down' ? -rad * 0.5 : 0;
      ctx.beginPath();
      ctx.arc(cx + ox, cy + oy, rad, base - 1.0, base + 1.0);
      ctx.stroke();
      ctx.lineWidth = 2.5;
      ctx.strokeStyle = '#ffffff';
      ctx.stroke();
      ctx.globalAlpha = 1;
      ctx.globalCompositeOperation = 'source-over';
    }
  }
  G.DebugPlayer = DebugPlayer;

  // =====================================================================================================
  // G.debug
  // =====================================================================================================
  let inputFrames = 0;        // >0: virtual input auto-clears after this many steps; -1: held until cleared
  let fpsFrames = 0, fpsTime = 0;

  const debug = {
    errors: G._errors,        // same array G.reportError fills
    overlayOn: false,
    fps: 60,

    /** true when the F3 / ` key may toggle the overlay (?debug=1 or ?test=1 only). */
    toggleAllowed() { const q = G.params || {}; return q.debug === '1' || !!G.test; },

    init() {
      const q = G.params || {};
      if (q.debug === '1') debug.overlayOn = true;
      if (q.seed != null && q.seed !== '' && isFinite(+q.seed)) {
        const rng = new G.RNG(+q.seed >>> 0);
        Math.random = () => rng.next(); // deterministic cosmetics for reproducible screenshots
      }
      // The F3 / ` overlay toggle is a developer tool: only with ?debug=1 or ?test=1, never in a normal (release) run
      // (QA robust r2: a stray ` press showed hitboxes + the stats panel in dist/Gutterlight.html).
      if (debug.toggleAllowed() && typeof window !== 'undefined' && window.addEventListener) {
        window.addEventListener('keydown', (e) => {
          if (e.code === 'F3' || e.code === 'Backquote') { debug.overlayOn = !debug.overlayOn; e.preventDefault(); }
        });
      }
    },

    // Called by the RAF loop once per rendered frame (real time, seconds).
    tickFps(elapsed) {
      fpsFrames++; fpsTime += elapsed;
      if (fpsTime >= 0.5) { debug.fps = fpsFrames / fpsTime; fpsFrames = 0; fpsTime = 0; if (G.Render) G.Render.fps = debug.fps; }
    },

    // Hook called by G.game.step right after G.input.update().
    _afterInput() {
      if (inputFrames > 0 && --inputFrames === 0) G.input.clearVirtual();
    },

    // Run n fixed updates, then render once. Works with or without the RAF loop.
    step(n) {
      const count = n == null ? 1 : Math.max(0, n | 0);
      for (let i = 0; i < count; i++) {
        try { G.game.step(); } catch (err) { G.reportError(err, 'debug.step'); }
      }
      debug.render();
      return debug.brief();
    },
    render() { if (G.Render && G.Render.ctx) G.Render.frame(); },

    // Hold a virtual input for `frames` steps, then auto-clear (frames omitted/0 → hold until changed).
    setInput(state, frames) {
      G.input.setVirtual(state || {});
      inputFrames = frames > 0 ? frames | 0 : -1;
    },
    clearInput() { G.input.clearVirtual(); inputFrames = 0; },

    player() { return G.game.player; },
    room() { return G.game.room; },

    brief() {
      const g = G.game, p = g.player, m = p && p.motor;
      return { mode: g.mode, room: g.room ? g.room.id : null, x: m ? Math.round(m.x) : null, y: m ? Math.round(m.y) : null, errors: G._errors.length };
    },

    state() {
      const g = G.game, room = g.room, p = g.player, m = p && p.motor, pr = g.progress;
      return {
        mode: g.mode,
        room: room ? room.id : null,
        region: room ? room.regionId : null,
        t: +g.t.toFixed(3),
        player: p ? {
          type: p.type,
          x: m ? m.x : p.x, y: m ? m.y : p.y, vx: m ? m.vx : p.vx, vy: m ? m.vy : p.vy,
          tx: Math.floor(((m ? m.x : p.x) + p.w / 2) / TILE), ty: Math.floor(((m ? m.y : p.y) + p.h - 1) / TILE),
          health: pr ? pr.health : null, maxHealth: pr ? g.maxHealth() : null, ember: pr ? pr.ember : null, cinders: pr ? pr.cinders : null,
          onGround: m ? m.onGround : null, wall: m ? m.wall : null, swimming: m ? m.swimming : null, inWater: m ? m.inWater : null,
          plunging: m ? m.plunging : null, dashing: m ? m.dashTime > 0 : null, facing: p.facing, hazard: m ? m.hazard : null,
          invuln: p.invuln || 0, events: p.lastEvents ? p.lastEvents.slice() : [],
        } : null,
        entities: room ? room.entities.filter((e) => !e.dead).map((e) => ({ type: e.type, kind: e.kind || (e.props && e.props.kind) || undefined, id: e.persistId || undefined, x: Math.round(e.x), y: Math.round(e.y) })) : [],
        ui: uiScreens(),
        difficulty: pr && g.difficulty ? g.difficulty() : null,
        broken: !!(pr && pr.broken),
        locks: g.lockReasons(),
        fade: Math.max(g.fadeAlpha, g.sysFadeAlpha),
        errors: G._errors.length,
      };
    },

    // Move the player to tile (tx, ty) (feet on the bottom of that tile) in roomId (current room if omitted).
    teleport(roomId, tx, ty) {
      const g = G.game;
      if (!g.progress) g.newGame(0);
      // a snuffed hardcore run (or its game-over screen) is never brought back, not even by the debug teleport
      if (g.progress.broken || g.mode === 'gameover') return false;
      const target = roomId || (g.room && g.room.id);
      if (!target || !G.World.getRoom(target)) { G.reportError(new Error('teleport: unknown room "' + roomId + '"'), 'debug.teleport'); return false; }
      if (g.mode !== 'play') g.mode = 'play';
      const place = tx != null && ty != null ? { tx: +tx, ty: +ty } : {};
      if (!g.room || g.room.id !== target) return g.enterRoom(target, place);
      const p = g.player;
      if (!p) return false;
      if (place.tx != null) {
        const x = (place.tx + 0.5) * TILE - p.w / 2, y = (place.ty + 1) * TILE - p.h;
        if (typeof p.placeAt === 'function') p.placeAt(x, y); else { p.x = x; p.y = y; }
        if (p.motor) { p.motor.lastSafe = { x, y }; p.motor.hazard = null; }
      }
      if (G.camera) G.camera.snap();
      return true;
    },

    // 'all' (all six abilities), 'everything' (abilities + every collectible), an ability id, or a giveItem spec.
    give(spec) {
      const g = G.game;
      if (!g.progress) g.progress = g.defaultProgress(g.slot);
      const s = String(spec || '');
      if (s === 'all') { for (const a of g.ABILITIES) g.giveAbility(a, { silent: true }); return true; }
      if (s === 'everything') {
        for (const a of g.ABILITIES) g.giveAbility(a, { silent: true });
        const pr = g.progress;
        for (const id of ['bell', 'kiln', 'wing']) g.giveItem('seal:' + id, { silent: true });
        for (const id of ['spark_gw', 'spark_mb', 'spark_sf', 'spark_dn', 'spark_ch', 'spark_mw']) g.giveItem('spark:' + id, { silent: true });
        for (const id of Object.keys(g.SIGIL_COSTS)) g.giveItem('sigil:' + id, { silent: true });
        while (pr.heartShards < 8) g.giveItem('heartwax', { silent: true });
        pr.urns = 2; pr.kilnGlass = 3; pr.brandLevel = 3; pr.notches = 6;
        for (const b of g.BOSSES) pr.bosses[b] = true;
        pr.health = g.maxHealth();
        return true;
      }
      const ab = s.indexOf('ability:') === 0 ? s.slice(8) : s;
      if (g.ABILITIES.indexOf(ab) >= 0) { g.giveAbility(ab, { silent: true }); return true; }
      return g.giveItem(s, { silent: true });
    },

    /** Set the current run's difficulty ('easy' | 'standard' | 'hardcore'; tests/debug only - the game never switches
     *  mode mid-run). Never un-breaks a snuffed hardcore run. Returns the resulting mode. */
    setMode(mode) {
      const g = G.game, pr = g.progress;
      if (!pr || !g.MODES || g.MODES.indexOf(mode) < 0 || pr.broken) return g.difficulty ? g.difficulty() : null;
      pr.mode = mode;
      return g.difficulty();
    },
    god(on) { G.game.god = on === undefined ? true : !!on; return G.game.god; },

    spawn(props) {
      const room = G.game.room;
      if (!room || !props) return null;
      return room.spawn(Object.assign({}, props));
    },

    killAll() {
      const room = G.game.room;
      if (!room) return 0;
      let n = 0;
      for (const e of room.entities.slice()) {
        if (e.dead || e.team !== 'enemy' || !e.hurtable) continue;
        n++;
        try {
          if (typeof e.kill === 'function') e.kill();
          else if (typeof e.die === 'function') e.die();
          else { e.onHit({ damage: 99999, kind: 'debug', dir: { x: 0, y: -1 }, source: null, pogo: false }); if (e.hp === undefined) e.remove(); }
        } catch (err) { G.reportError(err, 'killAll ' + e.type); e.remove(); }
      }
      return n;
    },

    listRooms(opts) { return G.World.listRooms(opts); },

    // ---------------------------------------------------------------- overlay (?debug=1, F3 / ` toggles)
    drawWorld(ctx) {
      const room = G.game.room;
      if (!room) return;
      ctx.save();
      ctx.lineWidth = 1;
      for (const s of room.solids) { ctx.strokeStyle = 'rgba(255,220,60,0.9)'; ctx.strokeRect(s.x + 0.5, s.y + 0.5, s.w - 1, s.h - 1); }
      for (const e of room.entities) {
        if (e.dead) continue;
        ctx.strokeStyle = e.team === 'enemy' ? 'rgba(255,80,80,0.9)' : e.team === 'player' ? 'rgba(80,180,255,0.9)' : 'rgba(120,255,140,0.7)';
        ctx.strokeRect(e.x + 0.5, e.y + 0.5, e.w - 1, e.h - 1);
      }
      const p = G.game.player;
      if (p) {
        ctx.strokeStyle = 'rgba(80,200,255,1)';
        ctx.strokeRect(p.x + 0.5, p.y + 0.5, p.w - 1, p.h - 1);
        const ls = p.motor && p.motor.lastSafe;
        if (ls) { ctx.strokeStyle = 'rgba(80,255,120,0.8)'; ctx.strokeRect(ls.x + 0.5, ls.y + 0.5, p.w - 1, p.h - 1); }
        if (p.slash) { ctx.strokeStyle = 'rgba(255,255,255,0.9)'; const r = p.slash.rect; ctx.strokeRect(r.x, r.y, r.w, r.h); }
      }
      ctx.restore();
    },

    drawScreen(ctx) {
      const g = G.game, room = g.room, p = g.player, m = p && p.motor;
      const lines = [
        'FPS ' + debug.fps.toFixed(0) + '   frame ' + (G.Render ? G.Render.frameMs.toFixed(1) : '?') + ' ms',
        'mode ' + g.mode + (g.uiBlocking() ? ' [ui]' : '') + (g.isLocked() ? ' [lock:' + g.lockReasons().join(',') + ']' : ''),
        'room ' + (room ? room.id + '  (' + room.regionId + ')  ' + room.cols + 'x' + room.rows + '  dark ' + room.dark : '-'),
      ];
      if (m) {
        lines.push('pos ' + Math.round(m.x) + ',' + Math.round(m.y) + '  tile ' + Math.floor((m.x + m.w / 2) / TILE) + ',' + Math.floor((m.y + m.h - 1) / TILE));
        lines.push('vel ' + Math.round(m.vx) + ',' + Math.round(m.vy) + (m.onGround ? ' ground' : '') + (m.wall ? ' wall' + m.wall : '') + (m.swimming ? ' swim' : '') + (m.plunging ? ' plunge' : '') + (m.dashTime > 0 ? ' dash' : ''));
      }
      if (room) lines.push('entities ' + room.entities.length + '   particles ' + (G.fx ? G.fx.count : 0) + '   lights ' + (G.lighting ? G.lighting.count : 0));
      lines.push('errors ' + G._errors.length);
      ctx.save();
      ctx.font = '13px monospace';
      ctx.textBaseline = 'top';
      const bw = 360, bh = lines.length * 16 + 10;
      ctx.fillStyle = 'rgba(0,0,0,0.6)';
      ctx.fillRect(W - bw - 8, 8, bw, bh);
      ctx.fillStyle = '#d8f0ff';
      for (let i = 0; i < lines.length; i++) ctx.fillText(lines[i], W - bw, 13 + i * 16);
      ctx.restore();
    },
  };

  function uiScreens() {
    const UI = G.UI;
    if (!UI) return [];
    try {
      if (typeof UI.screenNames === 'function') return UI.screenNames();
      const stack = UI.stack || UI.screens;
      if (Array.isArray(stack)) return stack.map((s) => (s && (s.name || s.id)) || '?');
    } catch (err) { G.reportError(err, 'debug.uiScreens'); }
    return [];
  }

  G.debug = debug;
})();
