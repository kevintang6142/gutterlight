// src/entities/interactables.js — world objects (TECH_SPEC §9.1): sconce, lanternway, lore, shrine, pickup,
// geode, lever, gate, arena_gate, sealdoor, light, decor, respawn, start, event; cinder pickups
// (G.dropCinders, §9.3); the G.Events dispatcher; and G.Interact, the helper kit shared with npcs.js/wisp.js.
// No DOM access at load time: sprites are rendered lazily (first draw) and cached.
(function () {
  'use strict';
  const G = globalThis.G;
  const TILE = G.CONST.TILE;
  const TAU = Math.PI * 2;
  const OUT = 'rgba(10,8,12,0.92)';

  // =====================================================================================================
  // G.Interact — shared helpers (robust cross-module calls, text, colors, cached sprites, effects)
  // =====================================================================================================
  const H = (G.Interact = G.Interact || {});
  const U = () => G.U;
  const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
  const lerp = (a, b, t) => a + (b - a) * t;

  H.safe = function (fn, where) {
    try { return fn(); } catch (err) { G.reportError(err, where || 'interact'); return undefined; }
  };
  H.hasUI = (name) => !!(G.UI && typeof G.UI[name] === 'function');
  /** Calls G.UI[name](...args) if present. Returns true if the call was made (and did not throw). */
  H.ui = function (name, ...args) {
    if (!H.hasUI(name)) return false;
    try { G.UI[name](...args); return true; } catch (err) { G.reportError(err, 'UI.' + name); return false; }
  };
  H.text = function (path, fallback) {
    let o = G.Text;
    for (const k of String(path).split('.')) { if (o == null) break; o = o[k]; }
    return typeof o === 'string' ? o : fallback;
  };
  H.fmt = function (s, vars) {
    if (G.Text && typeof G.Text.fmt === 'function') return G.Text.fmt(s, vars);
    return String(s).replace(/\{(\w+)\}/g, (m, k) => (vars && vars[k] != null ? String(vars[k]) : m));
  };
  H.prompt = (key, fallback) => H.text('ui.prompts.' + key, fallback);
  H.toast = function (text) { if (text) H.ui('toast', text); };
  H.cond = (str) => (G.game && typeof G.game.evalCondition === 'function' ? G.game.evalCondition(str) : true);
  H.flag = (k) => !!(G.game && G.game.progress && G.game.getFlag(k));
  H.setFlag = (k, v) => { if (G.game && G.game.progress) G.game.setFlag(k, v === undefined ? true : v); };
  H.progress = () => (G.game && G.game.progress) || null;
  H.player = () => (G.game && G.game.player) || null;
  H.save = () => { if (G.game && typeof G.game.saveNow === 'function') H.safe(() => G.game.saveNow(), 'saveNow'); };
  H.sfx = (name, x, opts) => { if (x == null) G.sfx(name, opts); else G.sfxAt(name, x, opts); };
  H.burst = (kind, x, y, opts) => { if (G.fx) H.safe(() => G.fx.burst(kind, x, y, opts), 'fx.burst'); };
  H.spawnFx = (p) => { if (G.fx && G.fx.spawn) G.fx.spawn(p); };
  H.light = (x, y, r, color, intensity, flicker) => {
    if (G.lighting && r > 0) G.lighting.add({ x, y, r, color, intensity: intensity == null ? 1 : intensity, flicker: !!flicker });
  };
  // veil opacity (0..1) over a world point of the current room: inside a still-hidden secret pocket (lights are
  // dimmed centrally by G.lighting; particles emitted there must check this themselves)
  H.veilAt = (x, y) => {
    const room = G.game && G.game.room;
    if (!room || !room.artCache || !room.artCache.veil || !G.Art || !G.Art.veilAlphaAt) return 0;
    return G.Art.veilAlphaAt(room, x, y) || 0;
  };
  H.shake = (px, sec) => { if (G.game && G.game.shake) G.game.shake(px, sec); };
  H.consume = (...actions) => { if (G.input) for (const a of actions) G.input.consume(a); };
  H.pressed = (a) => !!(G.input && G.input.pressed(a));
  H.down = (a) => !!(G.input && G.input.down(a));
  H.regionId = (e) => (e && e.room && e.room.regionId) || (G.game && G.game.room && G.game.room.regionId) || 'test';
  H.seedOf = function (e) {
    const p = e.props || {};
    const key = (e.room ? e.room.id : '') + ':' + e.type + ':' + (p.id || p.npc || p.kind || '') + ':' + (p.tx != null ? p.tx : Math.round(e.x)) + ',' + (p.ty != null ? p.ty : Math.round(e.y));
    return (G.U.hash(key) % 100000) | 0;
  };
  H.playerBox = function () {
    const p = H.player();
    if (!p) return null;
    const m = p.motor;
    return m ? { x: m.x, y: m.y, w: m.w, h: m.h } : { x: p.x, y: p.y, w: p.w, h: p.h };
  };
  H.playerCenter = function () {
    const b = H.playerBox();
    return b ? { x: b.x + b.w / 2, y: b.y + b.h / 2 } : null;
  };
  H.distToPlayer = function (e) {
    const c = H.playerCenter();
    return c ? Math.hypot(c.x - e.cx, c.y - e.cy) : Infinity;
  };
  H.touchesPlayer = function (r, pad) {
    const b = H.playerBox();
    if (!b) return false;
    const d = pad || 0;
    return b.x < r.x + r.w + d && b.x + b.w > r.x - d && b.y < r.y + r.h + d && b.y + b.h > r.y - d;
  };
  H.playable = () => !!(G.game && G.game.mode === 'play');

  // ---- colors ----
  const FALLBACK_MAT = {
    iron: '#2c2c34', ironLight: '#5a5a66', rust: '#5e3a26', wax: '#d8cfb8', waxShade: '#8a8270', waxDark: '#4a4438',
    stone: '#4a4e58', stoneDark: '#24262c', stoneLight: '#7a808c', gold: '#c8a040', goldLight: '#ffe8a0',
    wood: '#4a3424', woodDark: '#24180f', woodLight: '#7a5a3a', glass: '#e0c080', crystal: '#fff0c0',
    cloth: '#5a2a2a', clothDark: '#2a1414', leaf: '#4a5a3a', leafLight: '#8aa070', bone: '#cfc6b0', soot: '#141010',
  };
  const FALLBACK_PAL = { edge: '#4a505c', highlight: '#b8bcc6', accent: '#d0b070', light: '#ffd8a0', fill: '#121419', fillDeep: '#06070a', mid: '#20242d', fog: '#3a404c' };
  H.mat = function (regionId) {
    try { if (G.Art && G.Art.materials) return G.Art.materials(regionId) || FALLBACK_MAT; } catch (e) { /* fall through */ }
    return FALLBACK_MAT;
  };
  H.pal = function (regionId) {
    try { if (G.Art && G.Art.palette) return G.Art.palette(regionId) || FALLBACK_PAL; } catch (e) { /* fall through */ }
    return FALLBACK_PAL;
  };
  H.mix = (a, b, t) => G.U.mix(a, b, t);
  H.rgba = (c, a) => G.U.rgba(c, a);
  H.shadeC = (c, amt) => G.U.shade(c, amt);

  // ---- drawing primitives (shared with npcs.js / wisp.js) ----
  H.OUT = OUT;
  H.rrect = function (x, y, w, h, r) {
    const p = new Path2D();
    r = Math.max(0, Math.min(r, w / 2, h / 2));
    p.moveTo(x + r, y); p.lineTo(x + w - r, y); p.quadraticCurveTo(x + w, y, x + w, y + r); p.lineTo(x + w, y + h - r);
    p.quadraticCurveTo(x + w, y + h, x + w - r, y + h); p.lineTo(x + r, y + h); p.quadraticCurveTo(x, y + h, x, y + h - r);
    p.lineTo(x, y + r); p.quadraticCurveTo(x, y, x + r, y); p.closePath();
    return p;
  };
  H.poly = function (pts) {
    const p = new Path2D();
    p.moveTo(pts[0], pts[1]);
    for (let i = 2; i < pts.length; i += 2) p.lineTo(pts[i], pts[i + 1]);
    p.closePath();
    return p;
  };
  H.ellipse = function (cx, cy, rx, ry, rot) { const p = new Path2D(); p.ellipse(cx, cy, rx, ry, rot || 0, 0, TAU); return p; };
  /** Fill with form shading (lit upper-left → shadow lower-right) and a dark outline. box = [x0,y0,x1,y1]. */
  H.shaded = function (ctx, path, base, box, o) {
    o = o || {};
    ctx.fillStyle = base;
    ctx.fill(path);
    if (box) {
      ctx.save();
      ctx.clip(path);
      const g = ctx.createLinearGradient(box[0], box[1], box[2], box[3]);
      g.addColorStop(0, H.rgba('#ffffff', o.light === undefined ? 0.16 : o.light));
      g.addColorStop(0.45, 'rgba(0,0,0,0)');
      g.addColorStop(1, H.rgba('#000000', o.shadow === undefined ? 0.42 : o.shadow));
      ctx.fillStyle = g;
      ctx.fillRect(Math.min(box[0], box[2]) - 4, Math.min(box[1], box[3]) - 4, Math.abs(box[2] - box[0]) + 8, Math.abs(box[3] - box[1]) + 8);
      ctx.restore();
    }
    if (o.outline !== false) {
      ctx.strokeStyle = o.oc || OUT; ctx.lineWidth = o.lw || 1.6; ctx.lineJoin = 'round';
      ctx.stroke(path);
    }
  };
  H.line = function (ctx, pts, color, w) {
    ctx.strokeStyle = color; ctx.lineWidth = w || 1.5; ctx.lineCap = 'round'; ctx.lineJoin = 'round';
    ctx.beginPath(); ctx.moveTo(pts[0], pts[1]);
    for (let i = 2; i < pts.length; i += 2) ctx.lineTo(pts[i], pts[i + 1]);
    ctx.stroke();
  };
  /** Stroke drawn twice: dark outline then color (readable thin parts: poles, legs, chains). */
  H.stroke2 = function (ctx, pts, color, w, outline) {
    H.line(ctx, pts, outline || OUT, w + 2.4);
    H.line(ctx, pts, color, w);
  };
  /** Engraved line: dark groove plus a light lip 1 px below. */
  H.carve = function (ctx, pts, dark, lite, w) {
    ctx.save();
    ctx.translate(0, 1);
    H.line(ctx, pts, lite, w);
    ctx.restore();
    H.line(ctx, pts, dark, w);
  };
  H.glow = function (ctx, x, y, r, color, alpha) {
    if (G.Art && G.Art.glow) G.Art.glow(ctx, x, y, r, color, alpha);
    else if (G.fx && G.fx.glowAt) G.fx.glowAt(ctx, x, y, r, color, alpha);
  };
  /** Animated flame (G.Art.flame) with a plain fallback. */
  H.flame = function (ctx, x, y, size, kind, t, seed, opts) {
    if (G.Art && G.Art.flame) { G.Art.flame(ctx, x, y, size, kind, t, seed, opts); return; }
    const cols = { blue: '#5ab8ff', orange: '#ffa040', red: '#ff4a30', white: '#e8f0ff', violet: '#a070ff', gold: '#ffd040', pale: '#c0c6d0' };
    H.glow(ctx, x, y - size * 0.4, size * 2, cols[kind] || '#ffa040', 0.4);
    ctx.fillStyle = cols[kind] || '#ffa040';
    ctx.beginPath(); ctx.moveTo(x, y - size); ctx.quadraticCurveTo(x + size * 0.35, y - size * 0.3, x, y); ctx.quadraticCurveTo(x - size * 0.35, y - size * 0.3, x, y - size); ctx.fill();
  };
  H.FLAME_COLORS = { blue: '#5ab8ff', orange: '#ff9a40', red: '#ff4a30', white: '#dfe9ff', violet: '#a468ff', gold: '#ffc838', pale: '#c0c6d0' };
  H.char = () => (G.Art && G.Art.char) || null;
  H.shadow = function (ctx, x, y, w, a) {
    const C = H.char();
    if (C && C.shadow) C.shadow(ctx, x, y, w, a);
  };

  // ---- cached sprites (static parts of objects): LRU, created lazily on first draw ----
  const sprites = new Map();
  const SPRITE_MAX = 180;
  /**
   * Returns a cached sprite {canvas, ax, ay, w, h, meta}; draw(ctx, meta) renders it in local coordinates with
   * the anchor (ax, ay) at the origin. Returns null if rendering failed (reported once).
   */
  H.sprite = function (key, w, h, ax, ay, draw) {
    let s = sprites.get(key);
    if (s !== undefined) {
      sprites.delete(key); sprites.set(key, s); // LRU touch
      return s;
    }
    try {
      const mc = G.U.makeCanvas(w, h);
      const meta = {};
      mc.ctx.translate(ax, ay);
      draw(mc.ctx, meta);
      s = { canvas: mc.canvas, ax, ay, w, h, meta };
    } catch (err) {
      G.reportError(err, 'sprite ' + key.split('|')[0]);
      s = null;
    }
    sprites.set(key, s);
    if (sprites.size > SPRITE_MAX) {
      const k = sprites.keys().next().value;
      const old = sprites.get(k);
      sprites.delete(k);
      if (old && old.canvas) { try { old.canvas.width = 0; old.canvas.height = 0; } catch (e) { /* ignore */ } }
    }
    return s;
  };
  H.blit = function (ctx, s, x, y) {
    if (s) ctx.drawImage(s.canvas, Math.round(x - s.ax), Math.round(y - s.ay));
  };
  H.clearSprites = () => sprites.clear();
  H.spriteCount = () => sprites.size;

  // Small deterministic random (per object seed) for procedural details.
  H.rand = function (seed) {
    let s = (seed >>> 0) || 0x9e3779b9;
    return function () {
      s = (s + 0x6d2b79f5) >>> 0;
      let t = Math.imul(s ^ (s >>> 15), s | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  };

  // =====================================================================================================
  // Base class for everything the player can use with Up
  // =====================================================================================================
  class Interactable extends G.Entity {
    constructor(props) {
      super(props);
      this.interactable = true;
      this.promptText = 'Use';
      this.seed = 0;
    }
    init() { this.seed = H.seedOf(this); }
    interactRect() { return { x: this.x - 20, y: this.y - 20, w: this.w + 40, h: this.h + 40 }; }
    interact() {}
  }
  H.Interactable = Interactable;

  // =====================================================================================================
  // start — new-game spawn marker (the engine places the player at its spec; nothing to draw)
  // =====================================================================================================
  class Start extends G.Entity {
    constructor(props) {
      super(props);
      this.w = G.CONST.PLAYER_W; this.h = G.CONST.PLAYER_H;
      this.cull = true;
    }
  }

  // =====================================================================================================
  // respawn — hazard-respawn hint: while the player stands in its trigger box, hazard respawn returns here
  // props: w, h (trigger size in tiles; default 2 × 3)
  // =====================================================================================================
  class Respawn extends G.Entity {
    constructor(props) {
      super(props);
      this.w = G.CONST.PLAYER_W; this.h = G.CONST.PLAYER_H;
      this.tw = Math.max(1, +props.w || 2) * TILE;
      this.th = Math.max(1, +props.h || 3) * TILE;
    }
    triggerRect() { return { x: this.cx - this.tw / 2, y: this.bottom - this.th, w: this.tw, h: this.th }; }
    update() {
      const p = H.player();
      const m = p && p.motor;
      if (!m || m.hazard || !H.playable()) return;
      if (H.touchesPlayer(this.triggerRect(), 0)) {
        const x = this.cx - m.w / 2, y = this.bottom - m.h;
        if (!m.lastSafe || m.lastSafe.x !== x || m.lastSafe.y !== y) m.lastSafe = { x, y };
      }
    }
  }

  // =====================================================================================================
  // sconce — the bench. Unlit until the first rest. Rest: heal, save, respawn point, sigils.
  // =====================================================================================================
  function drawSconceSprite(ctx, meta, m, pal, lit, seed) {
    const C = H.char();
    const iron = H.mix(m.iron, pal.edge, 0.18), ironL = H.mix(m.ironLight, pal.highlight, 0.15);
    // stone foot slab
    H.shaded(ctx, H.rrect(-25, -7, 50, 7, 2), m.stoneDark, [-25, -7, 25, 0], { light: 0.12 });
    H.line(ctx, [-21, -6, 21, -6], H.rgba(m.stoneLight, 0.35), 1);
    // splayed legs with curled feet + center stem
    for (const s of [-1, 1]) {
      const pts = [s * 11, -29, s * 17, -16, s * 21, -8];
      ctx.strokeStyle = OUT; ctx.lineWidth = 6.2; ctx.lineCap = 'round';
      ctx.beginPath(); ctx.moveTo(pts[0], pts[1]); ctx.quadraticCurveTo(pts[2], pts[3], pts[4], pts[5]); ctx.stroke();
      ctx.strokeStyle = iron; ctx.lineWidth = 3.6;
      ctx.beginPath(); ctx.moveTo(pts[0], pts[1]); ctx.quadraticCurveTo(pts[2], pts[3], pts[4], pts[5]); ctx.stroke();
      ctx.strokeStyle = H.rgba(ironL, 0.5); ctx.lineWidth = 1.2;
      ctx.beginPath(); ctx.moveTo(pts[0] - s, pts[1]); ctx.quadraticCurveTo(pts[2] - s, pts[3], pts[4] - s, pts[5]); ctx.stroke();
      H.shaded(ctx, H.ellipse(s * 21, -8.5, 3.6, 2.6), iron, [s * 21 - 4, -11, s * 21 + 4, -6], { lw: 1.2 });
    }
    H.shaded(ctx, H.rrect(-3.5, -31, 7, 25, 2), iron, [-3.5, -31, 3.5, -6], { lw: 1.4 });
    H.shaded(ctx, H.rrect(-6, -22, 12, 4, 1.5), iron, [-6, -22, 6, -18], { lw: 1.2 });
    // bowl interior (back half)
    ctx.fillStyle = H.mix(iron, '#000000', 0.55);
    ctx.fill(H.ellipse(0, -36, 25, 5.5));
    if (lit) { ctx.fillStyle = H.rgba('#ff8a3a', 0.35); ctx.fill(H.ellipse(0, -35.5, 20, 3.5)); }
    // the candle
    let tip = [0, -70];
    if (C) {
      const b = C.waxBody(ctx, 0, -33, 20, 26, {
        variant: 'pillar', color: lit ? H.mix(m.wax, '#fff2d8', 0.25) : H.mix(m.wax, m.waxShade, 0.25),
        drips: 4, seed, lw: 1.5, light: -1, rim: lit ? '#ffd9a0' : null, rimAlpha: 0.6,
      });
      tip = C.wick(ctx, b.cx, b.top + 2, { len: 7, bend: 1.4, width: 2.2 });
    } else {
      H.shaded(ctx, H.rrect(-10, -60, 20, 27, 3), m.wax, [-10, -60, 10, -33]);
      H.line(ctx, [0, -60, 1, -67], '#141016', 2.2);
      tip = [1, -67];
    }
    meta.tipX = tip[0]; meta.tipY = tip[1];
    // bowl front (crescent between the rim's front edge and the bowl bottom)
    const front = new Path2D();
    front.ellipse(0, -36, 25, 16, 0, 0, Math.PI, false);
    front.ellipse(0, -36, 25, 5.5, 0, Math.PI, 0, true);
    front.closePath();
    H.shaded(ctx, front, iron, [-25, -36, 25, -20], { light: 0.2, shadow: 0.5, lw: 1.6 });
    // engraved band + rivets
    ctx.save(); ctx.clip(front);
    ctx.strokeStyle = H.rgba('#000000', 0.35); ctx.lineWidth = 1.2;
    ctx.beginPath(); ctx.ellipse(0, -33, 23, 9, 0, 0.15, Math.PI - 0.15, false); ctx.stroke();
    ctx.restore();
    for (const rx of [-17, -6, 6, 17]) {
      const ry = -36 + 5.5 * Math.sqrt(Math.max(0, 1 - (rx / 25) ** 2)) + 3.5;
      ctx.fillStyle = OUT; ctx.beginPath(); ctx.arc(rx, ry, 1.9, 0, TAU); ctx.fill();
      ctx.fillStyle = ironL; ctx.beginPath(); ctx.arc(rx - 0.4, ry - 0.4, 1.1, 0, TAU); ctx.fill();
    }
    // rim highlight along the front lip
    ctx.strokeStyle = H.rgba(ironL, 0.85); ctx.lineWidth = 1.3;
    ctx.beginPath(); ctx.ellipse(0, -36, 24, 5, 0, Math.PI * 0.95, Math.PI * 0.05, true); ctx.stroke();
    if (lit) { // warm bounce light on the bowl lip
      ctx.strokeStyle = H.rgba('#ffb060', 0.45); ctx.lineWidth = 2;
      ctx.beginPath(); ctx.ellipse(0, -36, 24, 5, 0, Math.PI * 1.1, Math.PI * 1.9, false); ctx.stroke();
    }
  }

  class Sconce extends Interactable {
    constructor(props) {
      super(props);
      this.w = 56; this.h = 66; this.z = -6;
      this.promptText = H.prompt('rest', 'Rest');
      this.lit = false;
      this.flare = 0;          // >0 after lighting/resting: brighter flame
      this.seatPending = 0;    // frames until the respawned player is seated
      this.emberT = 0;
    }
    init() {
      super.init();
      this.lit = H.flag(this.flagKey());
    }
    flagKey() { return 'sconce:' + (this.persistId || (this.room ? this.room.id : '?')); }
    interactRect() { return { x: this.x - 22, y: this.y - 10, w: this.w + 44, h: this.h + 10 }; }
    // Seated here: the player is resting and this is (or is right next to) the sconce it sat at.
    isSeated(p) {
      if (!p || !p.resting) return false;
      if (p.restSconce === this) return true;
      if (p.restSconce && !p.restSconce.dead && p.restSconce.room === this.room) return false;
      return H.distToPlayer(this) < 70;
    }
    // Players that implement sit()/standUp() seat themselves on the 'rest' event (src/player/player.js);
    // for simpler players (G.DebugPlayer) the sconce does the seating and standing up itself.
    playerSeatsItself(p) { return !!(p && typeof p.sit === 'function'); }

    interact(player) {
      const p = player || H.player();
      if (!p) return;
      if (this.isSeated(p)) { this.openSigils(); return; }
      if (!this.lit) this.lightUp();
      this.seat(p, true);
    }
    lightUp() {
      this.lit = true;
      H.setFlag(this.flagKey());
      this.flare = 1.4;
      H.sfx('shrine', this.cx, { vol: 0.5, pitch: 1.3 });
      H.burst('ember', this.cx, this.y + 4, { count: 14, color: '#ffb060', speed: 120 });
      H.burst('flash', this.cx, this.y + 4, { r: 90, color: '#ffc080', alpha: 0.7 });
      H.toast(H.text('ui.sconceLit', 'Sconce lit'));
    }
    // Rest here (heal, save, respawn point) and seat the player.
    seat(p, rest) {
      const pr = H.progress();
      const hurt = pr && G.game.maxHealth && pr.health < G.game.maxHealth();
      p.restSconce = this;
      if (!this.playerSeatsItself(p)) { this.placeBeside(p); p.resting = true; }
      if (rest) {
        if (G.game && G.game.rest) G.game.rest(this);     // emits 'rest' → player.sit(this)
        else if (this.playerSeatsItself(p)) p.sit(this);
        if (this.playerSeatsItself(p) && !p.resting) p.sit(this);
        this.flare = Math.max(this.flare, 0.8);
        H.sfx('rest', this.cx);
        H.burst('ember', this.cx, this.y + 6, { count: 8, color: '#ffc070', speed: 70 });
        if (hurt) H.toast(H.text('ui.rested', 'Rested'));
      } else if (this.playerSeatsItself(p) && !p.resting) p.sit(this);
    }
    placeBeside(p) {
      const m = p.motor;
      const pw = m ? m.w : p.w, ph = m ? m.h : p.h;
      const pcx = (m ? m.x : p.x) + pw / 2;
      const side = pcx < this.cx ? -1 : 1;
      const tryAt = (s) => {
        const nx = this.cx + s * 32 - pw / 2, ny = this.bottom - ph;
        if (this.room && G.Physics.rectSolid(this.room, nx, ny, pw, ph)) return false;
        if (typeof p.placeAt === 'function') p.placeAt(nx, ny);
        if (m) m.facing = -s;
        p.facing = -s;
        return true;
      };
      if (!tryAt(side)) tryAt(-side);
    }
    openSigils() {
      H.consume('up', 'interact');
      if (!H.ui('openInventory', { atSconce: true })) H.toast(H.text('ui.inventory', 'Inventory'));
    }
    onRespawn() { this.seatPending = 2; }

    update(dt) {
      const p = H.player();
      if (this.seatPending > 0 && --this.seatPending === 0 && p && H.distToPlayer(this) < 90) {
        if (!this.lit) { this.lit = true; H.setFlag(this.flagKey()); }
        if (!p.resting) this.seat(p, false);
        else p.restSconce = this;
      }
      if (this.isSeated(p)) {
        this.promptText = H.text('ui.inventory', 'Inventory');
        const blocked = !!(G.UI && G.UI.isBlocking && G.UI.isBlocking()) || (G.game && G.game.isLocked && G.game.isLocked());
        if (H.distToPlayer(this) > 110 || (G.game && G.game.mode !== 'play')) this.standUp(p);
        else if (!blocked) {
          if (H.pressed('up') || H.pressed('interact')) this.openSigils();
          else if (!this.playerSeatsItself(p) && (H.down('left') || H.down('right') || H.pressed('jump') || H.pressed('down') || H.pressed('attack') || H.pressed('dash') || H.pressed('spell'))) {
            H.consume('jump', 'attack', 'dash', 'spell');
            this.standUp(p);
          }
        }
      } else this.promptText = H.prompt('rest', 'Rest');
      if (this.flare > 0) this.flare = Math.max(0, this.flare - dt);

      const fx = this.cx, fy = this.y + 8;
      if (this.lit) {
        H.light(fx, fy, 250 + this.flare * 60, '#ffb468', 0.95, true);
        this.emberT -= dt;
        if (this.emberT <= 0) {
          this.emberT = 0.25 + Math.random() * 0.5;
          H.burst('ember', fx + (Math.random() - 0.5) * 6, fy - 6, { count: 1, color: '#ffb060', speed: 40, life: 1.4 });
        }
      } else H.light(fx, this.y + 30, 70, '#ff9050', 0.22, false);
    }
    standUp(p) {
      if (!p) return;
      if (typeof p.standUp === 'function') p.standUp(); else p.resting = false;
      p.resting = false;
      if (p.restSconce === this) p.restSconce = null;
    }
    onRoomExit() { const p = H.player(); if (this.isSeated(p)) this.standUp(p); }

    draw(ctx, t) {
      const rid = H.regionId(this);
      const s = H.sprite('sconce|' + rid + '|' + (this.lit ? 1 : 0) + '|' + (this.seed % 8), 74, 112, 37, 104,
        (c, meta) => drawSconceSprite(c, meta, H.mat(rid), H.pal(rid), this.lit, this.seed % 8));
      const fx = this.cx, fy = this.bottom;
      H.shadow(ctx, fx, fy, 30, 0.5);
      H.blit(ctx, s, fx, fy);
      const tipX = fx + (s ? s.meta.tipX : 0), tipY = fy + (s ? s.meta.tipY : -67);
      if (this.lit) {
        const size = 15 + this.flare * 7 + Math.sin(t * 2.1 + this.seed) * 0.8;
        H.glow(ctx, tipX, tipY - 6, 70 + this.flare * 30, '#ff9a40', 0.35);
        H.flame(ctx, tipX, tipY + 1, size, 'orange', t, this.seed);
      } else {
        // cold wick: a dull ember and a thread of smoke
        H.glow(ctx, tipX, tipY, 7, '#ff7030', 0.5 + 0.2 * Math.sin(t * 1.7 + this.seed));
        ctx.fillStyle = '#ff7a30'; ctx.beginPath(); ctx.arc(tipX, tipY, 1.4, 0, TAU); ctx.fill();
        const C = H.char();
        if (C && C.pallSmoke) C.pallSmoke(ctx, tipX, tipY - 2, t, { count: 3, height: 30, spread: 5, size: 2.5, alpha: 0.22, seed: this.seed, speed: 0.35, color: '#8a8478' });
      }
    }
  }

  // =====================================================================================================
  // lanternway — post with a hanging lantern. First use lights it; afterwards 'Travel' opens the menu.
  // =====================================================================================================
  function drawLanternPost(ctx, meta, m, pal) {
    const iron = H.mix(m.iron, pal.edge, 0.15), ironL = H.mix(m.ironLight, pal.highlight, 0.2);
    // plinth
    H.shaded(ctx, H.rrect(-17, -14, 34, 14, 3), m.stone, [-17, -14, 17, 0]);
    H.line(ctx, [-13, -12.5, 13, -12.5], H.rgba(m.stoneLight, 0.4), 1);
    H.shaded(ctx, H.rrect(-11, -24, 22, 11, 2), m.stoneDark, [-11, -24, 11, -13]);
    // post
    H.shaded(ctx, H.rrect(-3.5, -150, 7, 128, 2), iron, [-3.5, -150, 3.5, -22], { lw: 1.5 });
    H.line(ctx, [-1.6, -146, -1.6, -26], H.rgba(ironL, 0.55), 1);
    for (const ry of [-34, -100, -132]) H.shaded(ctx, H.rrect(-5.5, ry, 11, 4, 1.5), iron, [-5.5, ry, 5.5, ry + 4], { lw: 1.2 });
    // finial
    H.shaded(ctx, H.poly([-3.5, -150, 0, -162, 3.5, -150]), iron, [-3.5, -162, 3.5, -150], { lw: 1.3 });
    H.shaded(ctx, H.ellipse(0, -151, 4.5, 2.2), iron, [-4.5, -153, 4.5, -149], { lw: 1.2 });
    // arm + decorative curl
    H.stroke2(ctx, [0, -141, 31, -141], iron, 3.6);
    ctx.strokeStyle = OUT; ctx.lineWidth = 4.2; ctx.lineCap = 'round';
    ctx.beginPath(); ctx.moveTo(2, -122); ctx.quadraticCurveTo(10, -140, 24, -141); ctx.stroke();
    ctx.strokeStyle = iron; ctx.lineWidth = 2.2;
    ctx.beginPath(); ctx.moveTo(2, -122); ctx.quadraticCurveTo(10, -140, 24, -141); ctx.stroke();
    ctx.beginPath(); ctx.arc(9, -127, 3.5, 0, TAU * 0.8); ctx.stroke();
    H.shaded(ctx, H.ellipse(31, -141, 2.6, 2.6), iron, [28, -144, 34, -138], { lw: 1.1 });
    // plaque with an engraved flame (region accent)
    H.shaded(ctx, H.rrect(-9, -92, 18, 22, 3), H.mix(m.stoneDark, pal.edge, 0.3), [-9, -92, 9, -70], { lw: 1.4 });
    const fl = new Path2D();
    fl.moveTo(0, -88); fl.quadraticCurveTo(5, -81, 3, -77); fl.quadraticCurveTo(0, -73.5, -3, -77); fl.quadraticCurveTo(-5, -81, 0, -88);
    ctx.fillStyle = H.rgba('#000000', 0.45); ctx.fill(fl);
    ctx.strokeStyle = H.rgba(pal.accent, 0.8); ctx.lineWidth = 1; ctx.stroke(fl);
    meta.hangX = 31; meta.hangY = -139;
  }
  function drawLantern(ctx, m, pal, lit, t, seed, glowAmt) {
    const iron = H.mix(m.iron, pal.edge, 0.15), ironL = H.mix(m.ironLight, pal.highlight, 0.2);
    // chain
    ctx.strokeStyle = OUT; ctx.lineWidth = 3;
    ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(0, 9); ctx.stroke();
    ctx.strokeStyle = ironL; ctx.lineWidth = 1.3;
    for (let y = 0; y < 9; y += 4) { ctx.beginPath(); ctx.ellipse(0, y + 2, 1.3, 2.2, 0, 0, TAU); ctx.stroke(); }
    // cap
    H.shaded(ctx, H.poly([-9, 15, 9, 15, 5, 9, -5, 9]), iron, [-9, 9, 9, 15], { lw: 1.4 });
    H.shaded(ctx, H.ellipse(0, 8.5, 2.6, 2), iron, [-3, 6, 3, 11], { lw: 1 });
    // glass body
    const glass = H.rrect(-8, 15, 16, 22, 2);
    if (lit) {
      const g = ctx.createLinearGradient(0, 15, 0, 37);
      g.addColorStop(0, '#ffe6a8'); g.addColorStop(0.6, '#ffb45a'); g.addColorStop(1, '#d8762a');
      ctx.fillStyle = g; ctx.fill(glass);
      H.flame(ctx, 0, 33, 10, 'gold', t, seed, { glow: 0.6 });
    } else {
      ctx.fillStyle = 'rgba(28,30,40,0.92)'; ctx.fill(glass);
      ctx.fillStyle = H.rgba('#ff6a2a', 0.25 + 0.1 * Math.sin(t * 1.3 + seed)); ctx.beginPath(); ctx.arc(0, 32, 1.6, 0, TAU); ctx.fill();
      ctx.fillStyle = 'rgba(200,210,230,0.16)'; ctx.fillRect(-6, 17, 3, 17);
    }
    ctx.strokeStyle = OUT; ctx.lineWidth = 1.6; ctx.stroke(glass);
    ctx.strokeStyle = iron; ctx.lineWidth = 1.5;
    for (const bx of [-8, 0, 8]) { ctx.beginPath(); ctx.moveTo(bx, 15); ctx.lineTo(bx, 37); ctx.stroke(); }
    H.line(ctx, [-8, 26, 8, 26], H.rgba(iron, 0.7), 1);
    // base
    H.shaded(ctx, H.poly([-9, 37, 9, 37, 5, 42, -5, 42]), iron, [-9, 37, 9, 42], { lw: 1.4 });
    H.shaded(ctx, H.poly([-2, 42, 2, 42, 0, 47]), iron, [-2, 42, 2, 47], { lw: 1 });
    if (lit && glowAmt > 0) H.glow(ctx, 0, 26, 46, '#ffc060', 0.5 * glowAmt);
  }

  class Lanternway extends Interactable {
    constructor(props) {
      super(props);
      this.w = 40; this.h = 150; this.z = -6;
      this.flip = !!props.flip;
      this.lit = false;
      this.flare = 0;
      this.swing = 0; this.swingV = 0;
      this.promptText = H.prompt('light', 'Light');
    }
    get lanternId() { return this.props.id || (this.room ? this.room.regionId : ''); }
    init() {
      super.init();
      const pr = H.progress();
      this.lit = !!(pr && pr.lanterns && pr.lanterns[this.lanternId]);
      this.updatePrompt();
    }
    updatePrompt() { this.promptText = this.lit ? H.prompt('travel', 'Travel') : H.prompt('light', 'Light'); }
    interactRect() { return { x: this.cx - 40, y: this.bottom - 90, w: 80, h: 90 }; }
    hangPoint() { return { x: this.cx + (this.flip ? -31 : 31), y: this.bottom - 139 }; }
    interact() {
      if (!this.lit) { this.lightUp(); return; }
      if (!H.ui('openLanternway', this.lanternId, () => {})) H.toast(H.text('ui.lanternway', 'Lanternway'));
    }
    lightUp() {
      const id = this.lanternId;
      if (G.game && typeof G.game.lightLantern === 'function') G.game.lightLantern(id);
      else { const pr = H.progress(); if (pr) { pr.lanterns[id] = true; H.save(); } }
      this.lit = true;
      this.flare = 1.2;
      this.swingV += 1.6;
      this.updatePrompt();
      const hp = this.hangPoint();
      H.sfx('lanternway', hp.x);
      H.burst('flash', hp.x, hp.y + 26, { r: 110, color: '#ffd080', alpha: 0.8 });
      H.burst('ember', hp.x, hp.y + 26, { count: 16, color: '#ffc860', speed: 110 });
      H.burst('ring', hp.x, hp.y + 26, { r: 80, color: '#ffd8a0', width: 3 });
      H.toast(H.text('ui.lanternwayLit', 'Lanternway post lit'));
    }
    update(dt) {
      // gentle pendulum; the player brushing past nudges it
      const p = H.player();
      if (p && p.motor && Math.abs(p.motor.vx) > 50 && H.touchesPlayer({ x: this.cx - 30, y: this.bottom - 150, w: 60, h: 150 })) this.swingV += p.motor.vx * 0.00035;
      this.swingV += (-this.swing * 9 - this.swingV * 0.9) * dt;
      this.swing += this.swingV * dt;
      if (this.flare > 0) this.flare = Math.max(0, this.flare - dt);
      const hp = this.hangPoint();
      if (this.lit) H.light(hp.x, hp.y + 26, 210 + this.flare * 80, '#ffd08a', 0.9, true);
      else H.light(hp.x, hp.y + 26, 54, '#ff8040', 0.2, false);
    }
    draw(ctx, t) {
      const rid = H.regionId(this);
      const m = H.mat(rid), pal = H.pal(rid);
      const s = H.sprite('lanternpost|' + rid, 96, 176, 32, 170, (c, meta) => drawLanternPost(c, meta, m, pal));
      ctx.save();
      ctx.translate(Math.round(this.cx), Math.round(this.bottom));
      if (this.flip) ctx.scale(-1, 1);
      H.shadow(ctx, 0, 0, 20, 0.45);
      H.blit(ctx, s, 0, 0);
      const hx = s ? s.meta.hangX : 31, hy = s ? s.meta.hangY : -139;
      ctx.translate(hx, hy);
      ctx.rotate(this.swing * 0.12 + Math.sin(t * 1.1 + this.seed) * 0.03);
      drawLantern(ctx, m, pal, this.lit, t, this.seed, 0.6 + this.flare);
      ctx.restore();
    }
  }

  // =====================================================================================================
  // lore — a carved tablet; 'Read' opens G.UI.lore(id)
  // =====================================================================================================
  function tabletPath() {
    const p = new Path2D();
    p.moveTo(-24, -10); p.lineTo(-24, -56);
    p.quadraticCurveTo(-24, -74, 0, -77); p.quadraticCurveTo(24, -74, 24, -56);
    p.lineTo(24, -10); p.closePath();
    return p;
  }
  function tabletGlyphs(seed) {
    const R = H.rand(seed * 7 + 3);
    const rows = [];
    for (let r = 0; r < 5; r++) {
      const y = -49 + r * 7.2;
      const marks = [];
      let x = -17 + R() * 3;
      const end = 17 - R() * 6;
      while (x < end) {
        const kind = R();
        const w = 2 + R() * 4;
        marks.push({ x, y, w, kind });
        x += w + 1.6 + R() * 2.2;
      }
      rows.push(marks);
    }
    return rows;
  }
  function strokeGlyph(ctx, g) {
    const { x, y, w, kind } = g;
    ctx.beginPath();
    if (kind < 0.35) { ctx.moveTo(x, y + 2); ctx.lineTo(x + w, y + 2); }
    else if (kind < 0.55) { ctx.moveTo(x, y); ctx.lineTo(x + w * 0.5, y + 4); ctx.lineTo(x + w, y); }
    else if (kind < 0.7) { ctx.moveTo(x + w / 2, y - 0.5); ctx.lineTo(x + w / 2, y + 4.5); ctx.moveTo(x, y + 2); ctx.lineTo(x + w, y + 2); }
    else if (kind < 0.85) { ctx.arc(x + w / 2, y + 2, Math.min(2.4, w / 2), 0, TAU * 0.75); }
    else { ctx.moveTo(x, y + 4); ctx.lineTo(x + w, y); }
    ctx.stroke();
  }
  function drawTablet(ctx, meta, m, pal, seed) {
    const stone = H.mix(m.stone, pal.edge, 0.35), stoneDark = H.mix(m.stoneDark, pal.fill, 0.2);
    const R = H.rand(seed + 11);
    // base
    H.shaded(ctx, H.rrect(-30, -11, 60, 11, 3), stoneDark, [-30, -11, 30, 0]);
    H.line(ctx, [-26, -9.5, 26, -9.5], H.rgba(m.stoneLight, 0.3), 1);
    // slab
    const slab = tabletPath();
    H.shaded(ctx, slab, stone, [-24, -77, 24, -10], { light: 0.2, shadow: 0.5, lw: 1.8 });
    // stone mottling
    ctx.save(); ctx.clip(slab);
    for (let i = 0; i < 14; i++) {
      ctx.fillStyle = H.rgba(R() < 0.5 ? '#000000' : '#ffffff', 0.04 + R() * 0.05);
      ctx.beginPath(); ctx.ellipse(-24 + R() * 48, -76 + R() * 66, 2 + R() * 6, 1 + R() * 3, R() * 3, 0, TAU); ctx.fill();
    }
    // inset frame
    const inner = new Path2D();
    inner.moveTo(-19, -14); inner.lineTo(-19, -55); inner.quadraticCurveTo(-19, -69, 0, -71.5); inner.quadraticCurveTo(19, -69, 19, -55); inner.lineTo(19, -14); inner.closePath();
    ctx.strokeStyle = H.rgba('#000000', 0.45); ctx.lineWidth = 1.4; ctx.stroke(inner);
    ctx.translate(0.8, 0.8); ctx.strokeStyle = H.rgba(m.stoneLight, 0.28); ctx.stroke(inner); ctx.translate(-0.8, -0.8);
    // crack
    const cx0 = R() < 0.5 ? -24 : 24, cy0 = -40 - R() * 25;
    const crack = [cx0, cy0];
    let px = cx0, py = cy0;
    for (let i = 0; i < 4; i++) { px += (cx0 < 0 ? 1 : -1) * (3 + R() * 4); py += -3 + R() * 9; crack.push(px, py); }
    H.line(ctx, crack, H.rgba('#000000', 0.55), 1.1);
    ctx.restore();
    // emblem: carved flame in the arch
    const fl = new Path2D();
    fl.moveTo(0, -68); fl.quadraticCurveTo(5.5, -61, 3.6, -57); fl.quadraticCurveTo(0, -53.5, -3.6, -57); fl.quadraticCurveTo(-5.5, -61, 0, -68);
    ctx.save(); ctx.translate(0, 0.9); ctx.strokeStyle = H.rgba(m.stoneLight, 0.4); ctx.lineWidth = 1.4; ctx.stroke(fl); ctx.restore();
    ctx.fillStyle = H.rgba('#000000', 0.5); ctx.fill(fl);
    // glyph rows (carved)
    const rows = tabletGlyphs(seed);
    ctx.lineWidth = 1.3; ctx.lineCap = 'round';
    ctx.save(); ctx.translate(0, 0.9); ctx.strokeStyle = H.rgba(m.stoneLight, 0.35);
    for (const row of rows) for (const g of row) strokeGlyph(ctx, g);
    ctx.restore();
    ctx.strokeStyle = H.rgba('#000000', 0.62);
    for (const row of rows) for (const g of row) strokeGlyph(ctx, g);
    // a run of wax down one shoulder (the kingdom is wax)
    const wx = (R() < 0.5 ? -1 : 1) * (10 + R() * 8);
    const drip = new Path2D();
    const top = -74 + Math.abs(wx) * 0.12;
    drip.moveTo(wx - 4, top); drip.quadraticCurveTo(wx - 4, top + 6, wx - 2, top + 9 + R() * 8);
    drip.arc(wx - 0.5, top + 10 + R() * 4, 1.8, Math.PI, 0, true);
    drip.quadraticCurveTo(wx + 3, top + 6, wx + 4, top + 1); drip.closePath();
    ctx.fillStyle = H.mix(m.wax, pal.highlight, 0.2); ctx.fill(drip);
    ctx.strokeStyle = H.rgba('#000000', 0.4); ctx.lineWidth = 1; ctx.stroke(drip);
    meta.rows = rows;
  }
  function drawTabletGlow(ctx, rows, color) {
    ctx.strokeStyle = color; ctx.lineWidth = 1.6; ctx.lineCap = 'round';
    for (const row of rows) for (const g of row) strokeGlyph(ctx, g);
    const fl = new Path2D();
    fl.moveTo(0, -68); fl.quadraticCurveTo(5.5, -61, 3.6, -57); fl.quadraticCurveTo(0, -53.5, -3.6, -57); fl.quadraticCurveTo(-5.5, -61, 0, -68);
    ctx.stroke(fl);
  }

  class Lore extends Interactable {
    constructor(props) {
      super(props);
      this.w = 52; this.h = 77; this.z = -6;
      this.promptText = H.prompt('read', 'Read');
      this.near = 0;
      this.reading = false;
    }
    interactRect() { return { x: this.x - 16, y: this.y, w: this.w + 32, h: this.h + 6 }; }
    interact() {
      const id = this.props.id;
      if (!id) { G.warnOnce('lore:noid', 'lore tablet without id'); return; }
      const textId = this.props.text || id;   // `text`: dev rooms show a real tablet's text under their own id
      H.setFlag('lore:' + id);
      this.reading = true;
      const done = () => { this.reading = false; };
      if (H.ui('lore', textId, done)) return;
      const entry = G.Text && G.Text.lore && G.Text.lore[textId];
      if (entry && H.ui('dialogue', { name: entry.title || '', lines: entry.lines || [], onDone: done })) return;
      if (!entry) G.warnOnce('lore:' + textId, 'lore text "' + textId + '" not found');
      this.reading = false;
    }
    update(dt) {
      const d = H.distToPlayer(this);
      this.near = G.U.approach(this.near, d < 130 || this.reading ? 1 : 0, dt * 2);
      const pal = H.pal(H.regionId(this));
      H.light(this.cx, this.y + 30, 80 + this.near * 50, pal.light || '#ffd8a0', 0.18 + this.near * 0.22, false);
    }
    draw(ctx, t) {
      const rid = H.regionId(this);
      const pal = H.pal(rid);
      const seed = this.seed % 997;
      const s = H.sprite('tablet|' + rid + '|' + seed, 72, 96, 36, 88, (c, meta) => drawTablet(c, meta, H.mat(rid), pal, seed));
      const x = this.cx, y = this.bottom;
      H.shadow(ctx, x, y, 30, 0.5);
      H.blit(ctx, s, x, y);
      if (s && this.near > 0.01) {
        const gs = H.sprite('tabletglow|' + rid + '|' + seed, 72, 96, 36, 88, (c) => drawTabletGlow(c, s.meta.rows, H.mix(pal.light || '#ffd8a0', '#ffffff', 0.3)));
        if (gs) {
          ctx.save();
          ctx.globalCompositeOperation = 'lighter';
          ctx.globalAlpha = this.near * (0.42 + 0.12 * Math.sin(t * 2.2 + seed));
          H.blit(ctx, gs, x, y);
          ctx.restore();
        }
      }
    }
  }

  // =====================================================================================================
  // shrine — pedestal with a floating blue ember; 'Take' grants the ability
  // =====================================================================================================
  function drawAbilityGlyph(ctx, ability) {
    ctx.lineCap = 'round'; ctx.lineJoin = 'round';
    ctx.beginPath();
    switch (ability) {
      case 'bolt': // flame-headed arrow
        ctx.moveTo(-6, 5); ctx.lineTo(5, -6); ctx.moveTo(5, -6); ctx.lineTo(0, -6); ctx.moveTo(5, -6); ctx.lineTo(5, -1);
        ctx.moveTo(-6, 5); ctx.quadraticCurveTo(-8, 1, -4, 0);
        break;
      case 'dash': // double chevron
        ctx.moveTo(-6, -5); ctx.lineTo(-1, 0); ctx.lineTo(-6, 5); ctx.moveTo(0, -5); ctx.lineTo(5, 0); ctx.lineTo(0, 5);
        break;
      case 'grip': // three claws on a wall line
        ctx.moveTo(5, -7); ctx.lineTo(5, 7);
        for (const yy of [-4, 0, 4]) { ctx.moveTo(-5, yy + 1.5); ctx.quadraticCurveTo(0, yy - 2, 3.5, yy); }
        break;
      case 'oilcloak': // waves under a drop
        ctx.moveTo(-7, 3); ctx.quadraticCurveTo(-3.5, 0, 0, 3); ctx.quadraticCurveTo(3.5, 6, 7, 3);
        ctx.moveTo(-7, 7); ctx.quadraticCurveTo(-3.5, 4, 0, 7); ctx.quadraticCurveTo(3.5, 10, 7, 7);
        ctx.moveTo(0, -8); ctx.quadraticCurveTo(3, -4, 0, -2); ctx.quadraticCurveTo(-3, -4, 0, -8);
        break;
      case 'plunge': // down arrow onto a broken line
        ctx.moveTo(0, -8); ctx.lineTo(0, 3); ctx.moveTo(-4, -1); ctx.lineTo(0, 3); ctx.lineTo(4, -1);
        ctx.moveTo(-7, 7); ctx.lineTo(-2, 7); ctx.moveTo(2, 7); ctx.lineTo(7, 7);
        break;
      case 'wings': // a pair of smoke wings
        ctx.moveTo(0, 4); ctx.quadraticCurveTo(-3, -6, -8, -5); ctx.quadraticCurveTo(-6, 1, 0, 4);
        ctx.moveTo(0, 4); ctx.quadraticCurveTo(3, -6, 8, -5); ctx.quadraticCurveTo(6, 1, 0, 4);
        break;
      default:
        ctx.arc(0, 0, 5, 0, TAU);
    }
    ctx.stroke();
  }
  function drawPedestal(ctx, meta, m, pal, ability) {
    const stone = H.mix(m.stone, pal.edge, 0.3), dark = H.mix(m.stoneDark, pal.fill, 0.2);
    const gold = H.mix(m.gold, '#9fc8ff', 0.25);
    H.shaded(ctx, H.rrect(-31, -8, 62, 8, 2), dark, [-31, -8, 31, 0]);
    H.shaded(ctx, H.rrect(-25, -15, 50, 8, 2), stone, [-25, -15, 25, -7]);
    const col = H.poly([-14, -15, -11, -52, 11, -52, 14, -15]);
    H.shaded(ctx, col, stone, [-14, -52, 14, -15], { light: 0.22 });
    ctx.save(); ctx.clip(col);
    ctx.strokeStyle = H.rgba('#000000', 0.25); ctx.lineWidth = 1;
    for (const x of [-7, 7]) { ctx.beginPath(); ctx.moveTo(x, -16); ctx.lineTo(x * 0.85, -51); ctx.stroke(); }
    ctx.restore();
    H.shaded(ctx, H.rrect(-20, -60, 40, 9, 2), stone, [-20, -60, 20, -51]);
    H.line(ctx, [-17, -58.5, 17, -58.5], H.rgba(m.stoneLight, 0.4), 1);
    // offering bowl
    const bowl = new Path2D();
    bowl.ellipse(0, -61, 15, 7, 0, 0, Math.PI, false);
    bowl.closePath();
    H.shaded(ctx, bowl, H.mix(gold, m.iron, 0.4), [-15, -61, 15, -54], { lw: 1.4 });
    ctx.fillStyle = H.mix(m.iron, '#000000', 0.5); ctx.fill(H.ellipse(0, -61, 15, 2.6));
    ctx.strokeStyle = H.rgba(gold, 0.9); ctx.lineWidth = 1.1; ctx.beginPath(); ctx.ellipse(0, -61, 15, 2.6, 0, 0, TAU); ctx.stroke();
    // carved ability glyph
    ctx.save();
    ctx.translate(0, -33.5);
    ctx.fillStyle = H.rgba('#000000', 0.35); ctx.beginPath(); ctx.arc(0, 0, 10.5, 0, TAU); ctx.fill();
    ctx.strokeStyle = H.rgba(gold, 0.55); ctx.lineWidth = 1; ctx.beginPath(); ctx.arc(0, 0, 10.5, 0, TAU); ctx.stroke();
    ctx.translate(0, 0.8); ctx.strokeStyle = H.rgba('#000000', 0.6); ctx.lineWidth = 1.8; drawAbilityGlyph(ctx, ability);
    ctx.translate(0, -0.8); ctx.strokeStyle = H.rgba(gold, 0.85); ctx.lineWidth = 1.3; drawAbilityGlyph(ctx, ability);
    ctx.restore();
    meta.emberY = -86;
  }

  class Shrine extends Interactable {
    constructor(props) {
      super(props);
      this.w = 62; this.h = 62; this.z = -6;
      this.ability = props.ability || 'bolt';
      this.promptText = H.prompt('take', 'Take');
      this.state = 'dormant';   // 'dormant' (requires unmet) | 'ready' | 'absorbing' | 'taken'
      this.recheck = 0;
      this.appear = 1;          // 0→1 fade-in of the ember
      this.absorbT = 0;
      this.locked = false;
    }
    init() {
      super.init();
      if (G.game && G.game.hasAbility(this.ability)) this.state = 'taken';
      else if (H.cond(this.props.requires)) this.state = 'ready';
      this.interactable = this.state === 'ready';
    }
    interactRect() { return { x: this.x - 16, y: this.y - 40, w: this.w + 32, h: this.h + 40 }; }
    emberPos(t) {
      const bob = Math.sin((t || 0) * 2.2 + this.seed) * 4;
      return { x: this.cx, y: this.bottom - 86 + bob };
    }
    interact(player) {
      if (this.state !== 'ready') return;
      this.state = 'absorbing';
      this.interactable = false;
      this.absorbT = 0;
      const p = player || H.player();
      this.absorbFrom = this.emberPos(this.t);
      if (G.game) { G.game.lockPlayer('shrine'); this.locked = true; }
      if (p) {
        p.invuln = Math.max(p.invuln || 0, 1.5);
        if (typeof p.playPose === 'function') H.safe(() => p.playPose('ability', 1.1), 'player.playPose');
      }
      H.sfx('shrine', this.cx);
      H.burst('ring', this.absorbFrom.x, this.absorbFrom.y, { r: 70, color: '#9fd8ff', width: 3 });
    }
    finishAbsorb() {
      if (this.state !== 'absorbing') return;
      this.state = 'taken';
      this.unlock();
      const c = H.playerCenter() || { x: this.cx, y: this.y };
      H.burst('flash', c.x, c.y, { r: 140, color: '#9fd8ff', alpha: 0.9 });
      H.burst('ring', c.x, c.y, { r: 160, color: '#bfe6ff', width: 5 });
      H.burst('spark', c.x, c.y, { count: 22, color: '#cfeeff', speed: 520 });
      H.shake(6, 0.3);
      if (G.game && G.game.flash) G.game.flash('rgba(160,215,255,0.55)', 0.35);
      if (G.game) G.game.giveAbility(this.ability);
    }
    unlock() {
      if (this.locked && G.game) G.game.unlockPlayer('shrine');
      this.locked = false;
    }
    onRoomExit() { if (this.state === 'absorbing') this.finishAbsorb(); this.unlock(); }
    onRemoved() { this.unlock(); }
    update(dt) {
      if (this.state === 'dormant') {
        this.recheck -= dt;
        if (this.recheck <= 0) {
          this.recheck = 0.25;
          if (H.cond(this.props.requires) && !(G.game && G.game.hasAbility(this.ability))) {
            this.state = 'ready'; this.interactable = true; this.appear = 0;
            const e = this.emberPos(this.t);
            H.burst('ring', e.x, e.y, { r: 90, color: '#9fd8ff', width: 4 });
            H.burst('ember', e.x, e.y, { count: 12, color: '#8fd0ff', speed: 90 });
            H.sfx('shrine', this.cx, { vol: 0.7 });
          }
        }
      }
      if (this.state === 'ready' && G.game && G.game.hasAbility(this.ability)) { this.state = 'taken'; this.interactable = false; }
      if (this.appear < 1) this.appear = Math.min(1, this.appear + dt * 1.5);
      if (this.state === 'absorbing') {
        this.absorbT += dt;
        if (this.absorbT >= 0.75) this.finishAbsorb();
      }
      const e = this.currentEmber(this.t);
      if (e) {
        H.light(e.x, e.y, 170 * this.appear, '#6fb8ff', 0.85, true);
        if (Math.random() < dt * 6 * this.appear) H.burst('ember', e.x, e.y + 4, { count: 1, color: '#8fd0ff', speed: 30, life: 1.1 });
      } else H.light(this.cx, this.bottom - 64, 50, '#7aa8d8', 0.15, false);
    }
    currentEmber(t) {
      if (this.state === 'ready') return this.emberPos(t);
      if (this.state !== 'absorbing') return null;
      const k = G.U.ease.inOutSine ? G.U.ease.inOutSine(clamp(this.absorbT / 0.75, 0, 1)) : clamp(this.absorbT / 0.75, 0, 1);
      const c = H.playerCenter() || this.absorbFrom;
      const a = this.absorbFrom;
      return { x: lerp(a.x, c.x, k), y: lerp(a.y, c.y, k) - Math.sin(k * Math.PI) * 30 };
    }
    draw(ctx, t) {
      const rid = H.regionId(this);
      const s = H.sprite('pedestal|' + rid + '|' + this.ability, 76, 82, 38, 72, (c, meta) => drawPedestal(c, meta, H.mat(rid), H.pal(rid), this.ability));
      const x = this.cx, y = this.bottom;
      H.shadow(ctx, x, y, 32, 0.5);
      H.blit(ctx, s, x, y);
      const e = this.currentEmber(t);
      if (e) {
        const a = this.appear;
        const sc = this.state === 'absorbing' ? 1 - clamp(this.absorbT / 0.75, 0, 1) * 0.5 : 1;
        H.glow(ctx, e.x, e.y, 90 * a * sc, '#3f8cff', 0.5);
        H.glow(ctx, e.x, e.y, 34 * a * sc, '#bfe6ff', 0.55);
        // orbiting motes
        for (let i = 0; i < 4; i++) {
          const ang = t * 1.8 + i * TAU / 4 + this.seed;
          const ox = Math.cos(ang) * 20 * sc, oy = Math.sin(ang) * 7 * sc;
          H.glow(ctx, e.x + ox, e.y + oy + 4, 6, '#9fd8ff', 0.8 * a);
        }
        ctx.save();
        ctx.globalAlpha *= a;
        H.flame(ctx, e.x, e.y + 11 * sc, 24 * sc, 'blue', t, this.seed);
        ctx.restore();
      }
    }
  }

  // =====================================================================================================
  // pickup — glowing collectibles; collected on touch
  // =====================================================================================================
  const PICKUP_GLOW = { heartwax: '#ffd8d0', urn: '#9fd8ff', kiln_glass: '#ffb648', spark: '#bfe6ff', notch: '#fff0d0', sigil: '#ffcf80', cinders: '#ffa850', seal: '#ffe8a0' };
  const SEAL_FLAME = { bell: 'white', kiln: 'orange', wing: 'violet' };
  function pickupSpec(props) {
    if (props.give) return String(props.give);
    const k = props.item;
    switch (k) {
      case 'heartwax': case 'urn': case 'kiln_glass': case 'notch': return k;
      case 'spark': return 'spark:' + (props.spark || props.id);
      case 'sigil': return props.sigil ? 'sigil:' + props.sigil : null;
      case 'seal': return props.seal ? 'seal:' + props.seal : null;
      case 'cinders': return 'cinders:' + Math.max(1, Math.floor(+props.amount || 50));
      default: return null;
    }
  }
  // Item art (x,y = item center). Shared with the contact sheet / UI if anyone wants it.
  function drawItemIcon(ctx, kind, x, y, t, seed, opts) {
    const o = opts || {};
    ctx.save();
    ctx.translate(x, y);
    switch (kind) {
      case 'heartwax': {
        const p = new Path2D(); // a heart-shaped wax drop
        p.moveTo(0, 10); p.bezierCurveTo(-4, 6, -11, 1, -10.5, -4.5); p.bezierCurveTo(-10, -10, -2.5, -11, 0, -5);
        p.bezierCurveTo(2.5, -11, 10, -10, 10.5, -4.5); p.bezierCurveTo(11, 1, 4, 6, 0, 10); p.closePath();
        H.shaded(ctx, p, '#f4e2d6', [-11, -11, 11, 10], { light: 0.3, shadow: 0.35, lw: 1.6 });
        ctx.fillStyle = H.rgba('#ff9a8a', 0.28); ctx.beginPath(); ctx.ellipse(1.5, 1.5, 6, 5, 0.3, 0, TAU); ctx.fill();
        ctx.fillStyle = 'rgba(255,255,255,0.75)'; ctx.beginPath(); ctx.ellipse(-5, -5.5, 2.4, 1.5, -0.6, 0, TAU); ctx.fill();
        // a drip hanging from the point
        ctx.fillStyle = '#f4e2d6'; ctx.beginPath(); ctx.ellipse(0, 12.5, 1.6, 2.3, 0, 0, TAU); ctx.fill();
        break;
      }
      case 'urn': {
        const p = new Path2D(); // small glass urn
        p.moveTo(-4, -11); p.lineTo(4, -11); p.lineTo(3.5, -7); p.bezierCurveTo(10, -5, 10, 7, 6, 10); p.lineTo(-6, 10);
        p.bezierCurveTo(-10, 7, -10, -5, -3.5, -7); p.closePath();
        ctx.fillStyle = 'rgba(30,50,80,0.55)'; ctx.fill(p);
        // swirling blue-white fire inside
        ctx.save(); ctx.clip(p);
        H.glow(ctx, 0, 3, 14, '#5ab8ff', 0.9);
        for (let i = 0; i < 3; i++) {
          const a = t * 3 + i * 2.1 + seed;
          ctx.fillStyle = i === 0 ? '#f2fbff' : '#8fd8ff';
          ctx.beginPath(); ctx.arc(Math.cos(a) * 3, 3 + Math.sin(a * 1.3) * 3, 2.6 - i * 0.5, 0, TAU); ctx.fill();
        }
        ctx.restore();
        ctx.strokeStyle = OUT; ctx.lineWidth = 1.6; ctx.stroke(p);
        ctx.strokeStyle = 'rgba(220,240,255,0.7)'; ctx.lineWidth = 1; ctx.stroke(p);
        ctx.fillStyle = 'rgba(255,255,255,0.6)'; ctx.fillRect(-6.5, -3, 1.6, 8);
        H.shaded(ctx, H.rrect(-5, -14, 10, 4, 1.5), '#8a6a3a', [-5, -14, 5, -10], { lw: 1.2 });
        break;
      }
      case 'kiln_glass': {
        ctx.rotate(Math.sin(t * 0.8 + seed) * 0.15);
        const p = H.poly([-3, -13, 7, -6, 8, 5, 1, 12, -7, 6, -8, -4]);
        const g = ctx.createLinearGradient(-8, -13, 8, 12);
        g.addColorStop(0, '#ffe7a0'); g.addColorStop(0.5, '#ffaa3a'); g.addColorStop(1, '#b8501a');
        ctx.fillStyle = g; ctx.fill(p);
        ctx.strokeStyle = OUT; ctx.lineWidth = 1.6; ctx.stroke(p);
        H.line(ctx, [-3, -13, 0, -1, 1, 12], 'rgba(255,240,200,0.6)', 1);
        H.line(ctx, [0, -1, 8, 5], 'rgba(120,40,10,0.5)', 1);
        H.line(ctx, [0, -1, -8, -4], 'rgba(255,255,255,0.45)', 1);
        ctx.fillStyle = 'rgba(255,255,255,0.8)'; ctx.beginPath(); ctx.arc(-3, -6, 1.4, 0, TAU); ctx.fill();
        break;
      }
      case 'spark': {
        const r = 12 + Math.sin(t * 3 + seed) * 1.2;
        H.glow(ctx, 0, 0, 48, '#4f9cff', 0.55);
        H.glow(ctx, 0, 0, 20, '#e8f6ff', 0.7);
        ctx.rotate(t * 0.6);
        for (const [len, w, a] of [[r, 3.2, 0], [r * 0.62, 2.2, Math.PI / 4]]) {
          ctx.save(); ctx.rotate(a);
          const p = new Path2D();
          for (let i = 0; i < 4; i++) {
            const ang = i * Math.PI / 2;
            p.moveTo(0, 0);
            p.lineTo(Math.cos(ang - 0.3) * w, Math.sin(ang - 0.3) * w);
            p.lineTo(Math.cos(ang) * len, Math.sin(ang) * len);
            p.lineTo(Math.cos(ang + 0.3) * w, Math.sin(ang + 0.3) * w);
            p.closePath();
          }
          ctx.fillStyle = a ? '#8fd0ff' : '#f2fbff'; ctx.fill(p);
          ctx.restore();
        }
        ctx.fillStyle = '#ffffff'; ctx.beginPath(); ctx.arc(0, 0, 3, 0, TAU); ctx.fill();
        break;
      }
      case 'notch': {
        ctx.rotate(Math.sin(t * 1.2 + seed) * 0.25);
        const ring = new Path2D();
        ring.ellipse(0, 0, 10, 8, 0, 0, TAU);
        ring.ellipse(0, 0, 5, 3.8, 0, 0, TAU);
        ctx.fillStyle = '#efe4cc'; ctx.fill(ring, 'evenodd');
        ctx.save(); ctx.clip(ring, 'evenodd');
        const g = ctx.createLinearGradient(-10, -8, 10, 8);
        g.addColorStop(0, 'rgba(255,255,255,0.45)'); g.addColorStop(0.5, 'rgba(0,0,0,0)'); g.addColorStop(1, 'rgba(60,40,20,0.45)');
        ctx.fillStyle = g; ctx.fillRect(-11, -9, 22, 18);
        ctx.restore();
        ctx.strokeStyle = OUT; ctx.lineWidth = 1.5; ctx.stroke(ring);
        // the notch cut
        ctx.fillStyle = '#3a2a1a'; ctx.beginPath(); ctx.moveTo(-1.5, -8); ctx.lineTo(1.5, -8); ctx.lineTo(0, -4.6); ctx.closePath(); ctx.fill();
        ctx.fillStyle = 'rgba(255,255,255,0.7)'; ctx.beginPath(); ctx.ellipse(-5.5, -4.5, 2, 1.1, -0.6, 0, TAU); ctx.fill();
        break;
      }
      case 'sigil': case 'seal': {
        const isSeal = kind === 'seal';
        const base = isSeal ? '#d8b860' : '#b8352a';
        const r = isSeal ? 12 : 11;
        const p = new Path2D(); // a wax medallion with a squashed, wavy rim
        for (let i = 0; i <= 24; i++) {
          const a = (i / 24) * TAU, rr = r + Math.sin(i * 2.7 + seed) * 0.9;
          if (i === 0) p.moveTo(Math.cos(a) * rr, Math.sin(a) * rr); else p.lineTo(Math.cos(a) * rr, Math.sin(a) * rr);
        }
        p.closePath();
        H.shaded(ctx, p, base, [-r, -r, r, r], { light: 0.3, shadow: 0.45, lw: 1.6 });
        ctx.strokeStyle = H.rgba(isSeal ? '#fff2c0' : '#ffb0a0', 0.5); ctx.lineWidth = 1;
        ctx.beginPath(); ctx.arc(0, 0, r * 0.68, 0, TAU); ctx.stroke();
        // engraving: a flame for sigils, the seal's emblem for seals
        ctx.strokeStyle = H.rgba('#000000', 0.45); ctx.lineWidth = 1.4;
        ctx.beginPath(); ctx.moveTo(0, -5.5); ctx.quadraticCurveTo(4, -1, 2.4, 2.5); ctx.quadraticCurveTo(0, 5, -2.4, 2.5); ctx.quadraticCurveTo(-4, -1, 0, -5.5); ctx.stroke();
        if (isSeal && o.seal && SEAL_FLAME[o.seal]) H.flame(ctx, 0, 3, 8, SEAL_FLAME[o.seal], t, seed, { glow: 0.5 });
        ctx.fillStyle = 'rgba(255,255,255,0.45)'; ctx.beginPath(); ctx.ellipse(-r * 0.45, -r * 0.5, 2.6, 1.4, -0.7, 0, TAU); ctx.fill();
        break;
      }
      case 'cinders': {
        const R = H.rand(seed + 5);
        const chips = [];
        for (let i = 0; i < 9; i++) chips.push([(R() - 0.5) * 18 * (1 - i / 14), 8 - i * 1.6 - R() * 2, 3 + R() * 2.4, R() * 3]);
        for (const [cx, cy, s, rot] of chips) {
          ctx.save(); ctx.translate(cx, cy); ctx.rotate(rot);
          const ch = H.poly([0, -s, s * 0.9, 0, 0, s * 0.8, -s, 0]);
          ctx.fillStyle = '#2a1408'; ctx.lineWidth = 2.4; ctx.strokeStyle = '#2a1408'; ctx.stroke(ch);
          ctx.fillStyle = R() < 0.3 ? '#ffd27a' : '#ff9a3c'; ctx.fill(ch);
          ctx.fillStyle = 'rgba(255,250,220,0.8)'; ctx.fillRect(-s * 0.3, -s * 0.5, s * 0.4, s * 0.35);
          ctx.restore();
        }
        break;
      }
      default:
        ctx.fillStyle = '#ffffff'; ctx.beginPath(); ctx.arc(0, 0, 6, 0, TAU); ctx.fill();
    }
    ctx.restore();
  }
  H.drawItemIcon = drawItemIcon;

  class Pickup extends G.Entity {
    constructor(props) {
      super(props);
      this.w = 30; this.h = 30; this.z = 5;
      this.item = props.item || 'heartwax';
      this.spec = pickupSpec(props);
      this.visible = true;
      this.recheck = 0;
      this.appear = 1;
      this.collected = false;
    }
    init() {
      this.seed = H.seedOf(this);
      const id = this.props.id;
      if (!id) G.warnOnce('pickup:noid:' + (this.room && this.room.id), 'pickup without id in room ' + (this.room && this.room.id) + ' (it will not persist)');
      if (!this.spec) {
        G.reportError(new Error('pickup "' + id + '": unknown item "' + this.item + '" (or missing sigil/seal)'), 'pickup');
        this.remove();
        return;
      }
      if (id && H.flag('item:' + id)) { this.remove(); return; }
      if (this.item === 'spark' && H.progress() && H.progress().sparks.indexOf(this.props.spark || id) >= 0) { this.remove(); return; }
      this.visible = H.cond(this.props.requires);
    }
    itemCenter(t) { return { x: this.cx, y: this.y + 8 + Math.sin((t || 0) * 2.4 + this.seed) * 4 }; }
    update(dt) {
      if (!this.visible) {
        this.recheck -= dt;
        if (this.recheck <= 0) {
          this.recheck = 0.25;
          if (H.cond(this.props.requires)) {
            this.visible = true; this.appear = 0;
            const c = this.itemCenter(this.t);
            H.burst('ring', c.x, c.y, { r: 60, color: PICKUP_GLOW[this.item] || '#ffffff', width: 3 });
            H.burst('ember', c.x, c.y, { count: 8, color: PICKUP_GLOW[this.item] || '#ffffff', speed: 70 });
          }
        }
        return;
      }
      if (this.appear < 1) this.appear = Math.min(1, this.appear + dt * 2);
      const c = this.itemCenter(this.t);
      const col = PICKUP_GLOW[this.item] || '#ffffff';
      H.light(c.x, c.y, this.item === 'spark' ? 150 : 100, col, this.item === 'spark' ? 0.8 : 0.55, false);
      if (Math.random() < dt * (this.item === 'spark' ? 7 : 3) && H.veilAt(c.x, c.y) < 0.5) H.burst('ember', c.x + (Math.random() - 0.5) * 14, c.y + 6, { count: 1, color: col, speed: 30, life: 1 });
      if (H.playable() && this.appear > 0.5 && H.touchesPlayer(this, 6)) this.collect();
    }
    collect() {
      if (this.collected) return;
      this.collected = true;
      const c = this.itemCenter(this.t);
      const col = PICKUP_GLOW[this.item] || '#ffffff';
      this.remove();
      H.burst('flash', c.x, c.y, { r: 70, color: col, alpha: 0.85 });
      H.burst('spark', c.x, c.y, { count: 12, color: col, speed: 300 });
      H.burst('ring', c.x, c.y, { r: 60, color: col, width: 3 });
      if (this.item === 'cinders') {
        for (let i = 0; i < 4; i++) H.sfx('cinder', c.x, { vol: 0.4, pitch: 0.95 + i * 0.12 });
      } else H.sfx('item', c.x);
      const opts = {};
      if (this.props.id) opts.pickupId = this.props.id;
      if (G.game) G.game.giveItem(this.spec, opts);
    }
    draw(ctx, t) {
      if (!this.visible) return;
      const c = this.itemCenter(t);
      const col = PICKUP_GLOW[this.item] || '#ffffff';
      const a = this.appear;
      ctx.globalAlpha *= a;
      H.shadow(ctx, this.cx, this.bottom, 12 - (c.y - this.y - 8) * 0.4, 0.35);
      H.glow(ctx, c.x, c.y, 54 + Math.sin(t * 3 + this.seed) * 5, col, 0.5);
      const sc = (0.6 + 0.4 * a) * 1.35;
      ctx.save(); ctx.translate(c.x, c.y); ctx.scale(sc, sc);
      drawItemIcon(ctx, this.item, 0, 0, t, this.seed, { seal: this.props.seal });
      ctx.restore();
      // periodic glint
      const q = (t * 0.45 + (this.seed % 100) / 100) % 1;
      if (q < 0.08) {
        const k = Math.sin((q / 0.08) * Math.PI);
        ctx.save(); ctx.globalCompositeOperation = 'lighter'; ctx.globalAlpha *= k;
        H.line(ctx, [c.x + 5, c.y - 14, c.x + 5, c.y - 2], '#ffffff', 1.2);
        H.line(ctx, [c.x - 1, c.y - 8, c.x + 11, c.y - 8], '#ffffff', 1.2);
        ctx.restore();
      }
    }
  }

  // =====================================================================================================
  // geode — ember-crystal cluster; each Brand hit sheds cinders; breaks on the 4th hit (persistent)
  // =====================================================================================================
  const GEODE_HITS = 4;
  function geodeCrystals(seed) {
    const R = H.rand(seed * 13 + 1);
    const list = [];
    const n = 7;
    for (let i = 0; i < n; i++) {
      const f = i / (n - 1) - 0.5;
      list.push({
        x: f * 34 + (R() - 0.5) * 6, y: -9 - R() * 4,
        ang: f * 1.3 + (R() - 0.5) * 0.35, len: 16 + R() * 16 * (1 - Math.abs(f) * 1.1), w: 6 + R() * 5, hue: R(),
      });
    }
    list.sort((a, b) => b.len - a.len);
    list.forEach((c, i) => { c.order = i; });
    return list;
  }
  function drawCrystal(ctx, c, dim) {
    ctx.save();
    ctx.translate(c.x, c.y);
    ctx.rotate(c.ang);
    const w = c.w, L = c.len;
    const body = H.poly([-w / 2, 4, -w / 2, -L * 0.72, 0, -L, w / 2, -L * 0.72, w / 2, 4]);
    const lit = H.mix('#ffb24a', '#ff7a2a', c.hue), dark = H.mix('#b8451a', '#7a2a10', c.hue);
    ctx.strokeStyle = OUT; ctx.lineWidth = 3; ctx.lineJoin = 'round'; ctx.stroke(body);
    ctx.fillStyle = dim ? H.mix(dark, '#2a1a14', 0.5) : dark; ctx.fill(body);
    ctx.fillStyle = dim ? H.mix(lit, '#3a2418', 0.6) : lit;
    ctx.fill(H.poly([-w / 2, 4, -w / 2, -L * 0.72, 0, -L, 0, 4]));
    ctx.fillStyle = dim ? 'rgba(255,220,170,0.15)' : 'rgba(255,240,200,0.55)';
    ctx.fill(H.poly([-w / 2 + 1.2, 2, -w / 2 + 1.2, -L * 0.7, -w * 0.15, -L * 0.88, -w * 0.15, 2]));
    ctx.restore();
  }
  function drawGeodeSprite(ctx, meta, m, pal, seed, stage) {
    const crystals = geodeCrystals(seed);
    const broken = stage >= GEODE_HITS;
    // rock mound
    const rock = new Path2D();
    rock.moveTo(-32, 0); rock.bezierCurveTo(-30, -12, -18, -17, -4, -15); rock.bezierCurveTo(10, -18, 26, -13, 32, 0); rock.closePath();
    H.shaded(ctx, rock, H.mix(m.stoneDark, pal.edge, 0.2), [-32, -18, 32, 0], { light: 0.18, shadow: 0.5, lw: 1.8 });
    // crystals: each hit knocks off the largest remaining shard
    const alive = crystals.filter((c) => c.order >= stage).sort((a, b) => a.len - b.len);
    const draw = broken ? crystals.map((c) => Object.assign({}, c, { len: 5 + c.len * 0.15 })) : alive.slice().reverse();
    for (const c of draw) drawCrystal(ctx, c, broken);
    // cracks grow with hits
    const R = H.rand(seed + stage * 31);
    ctx.strokeStyle = 'rgba(20,8,4,0.8)'; ctx.lineWidth = 1.2;
    for (let k = 0; k < Math.min(stage, 3) * 2; k++) {
      let x = (R() - 0.5) * 40, y = -4 - R() * 8;
      ctx.beginPath(); ctx.moveTo(x, y);
      for (let j = 0; j < 3; j++) { x += (R() - 0.5) * 10; y += (R() - 0.5) * 8; ctx.lineTo(x, y); }
      ctx.stroke();
    }
    if (!broken) {
      // a glowing seam at the base
      ctx.strokeStyle = 'rgba(255,170,80,0.55)'; ctx.lineWidth = 1.4;
      ctx.beginPath(); ctx.moveTo(-18, -12); ctx.quadraticCurveTo(0, -16, 18, -12); ctx.stroke();
    }
    meta.glows = broken ? [] : alive.map((c) => [c.x + Math.sin(c.ang) * c.len * 0.5, c.y - Math.cos(c.ang) * c.len * 0.5, c.len]);
  }

  class Geode extends G.Entity {
    constructor(props) {
      super(props);
      this.w = 60; this.h = 38; this.z = -3;
      this.team = 'neutral';
      this.hurtable = true;
      this.pogoable = true;
      this.amount = Math.max(GEODE_HITS, Math.floor(+props.amount || 60));
      this.hits = 0;
      this.broken = false;
      this.shakeT = 0;
      this.dropped = 0;
    }
    geodeKey() { return this.persistId || (this.room ? this.room.id + ':' + this.props.tx + ',' + this.props.ty : '?'); }
    flagKey() { return 'geode:' + this.geodeKey(); }
    // partial progress (hits that did not break it yet) persists too, so leaving and re-entering the room cannot
    // re-farm the per-hit cinders: a re-entered geode resumes at its saved stage and pays only what is left
    hitsKey() { return 'geodeHits:' + this.geodeKey(); }
    partialDrop() { return Math.min(Math.max(1, Math.floor(this.amount * 0.12)), this.amount - this.dropped - 1); }
    init() {
      this.seed = H.seedOf(this);
      if (!this.persistId) G.warnOnce('geode:noid:' + (this.room && this.room.id), 'geode without id in room ' + (this.room && this.room.id));
      if (H.flag(this.flagKey())) { this.broken = true; this.hits = GEODE_HITS; this.hurtable = false; return; }
      const saved = G.game && G.game.progress ? Math.floor(+G.game.getFlag(this.hitsKey()) || 0) : 0;
      const n = Math.max(0, Math.min(GEODE_HITS - 1, saved));
      // replay the deterministic per-hit drops so `dropped` (and so the remainder paid on the break) matches
      for (let i = 0; i < n; i++) { this.hits++; this.dropped += Math.max(0, this.partialDrop()); }
    }
    hurtRect() { return { x: this.x - 4, y: this.y - 18, w: this.w + 8, h: this.h + 18 }; }
    onHit(hit) {
      if (this.broken) return false;
      if (hit && hit.team && hit.team !== 'player') return false;
      this.hits++;
      this.shakeT = 0.25;
      const top = { x: this.cx, y: this.y - 4 };
      const dirX = hit && hit.dir ? hit.dir.x : 0;
      H.burst('shard', top.x, top.y, { count: 6, color: '#ffb050', speed: 320, angle: -Math.PI / 2 + dirX * 0.6 });
      H.burst('spark', top.x, top.y, { count: 8, color: '#ffd080', speed: 360 });
      if (this.hits >= GEODE_HITS) {
        this.broken = true;
        this.hurtable = false;
        H.setFlag(this.flagKey());
        if (G.game && typeof G.game.clearFlag === 'function') G.game.clearFlag(this.hitsKey());
        const rest = this.amount - this.dropped;
        this.drop(rest, dirX, true);
        H.sfx('geode_break', this.cx);
        H.burst('shard', top.x, top.y, { count: 16, color: '#ff9a3c', speed: 460 });
        H.burst('flash', top.x, top.y, { r: 110, color: '#ffb060', alpha: 0.8 });
        H.burst('dust', this.cx, this.bottom - 4, { count: 10, color: '#8a6a50' });
        H.shake(7, 0.3);
      } else {
        this.drop(this.partialDrop(), dirX, false);
        H.setFlag(this.hitsKey(), this.hits);
        H.sfx('geode_hit', this.cx, { pitch: 0.9 + this.hits * 0.08 });
        H.shake(3, 0.12);
      }
      return true;
    }
    drop(n, dirX, big) {
      if (n <= 0) return;
      this.dropped += n;
      G.dropCinders(this.room, this.cx, this.y - 6, n, { dir: -dirX * 0.5, power: big ? 1.15 : 0.9 });
    }
    update(dt) {
      if (this.shakeT > 0) this.shakeT = Math.max(0, this.shakeT - dt);
      if (!this.broken) H.light(this.cx, this.y - 6, 120, '#ff9a40', 0.5, true);
    }
    draw(ctx, t) {
      const rid = H.regionId(this);
      const stage = Math.min(this.hits, GEODE_HITS);
      const seed = this.seed % 64;
      const s = H.sprite('geode|' + rid + '|' + seed + '|' + stage, 90, 76, 45, 66, (c, meta) => drawGeodeSprite(c, meta, H.mat(rid), H.pal(rid), seed, stage));
      const sh = this.shakeT > 0 ? Math.sin(this.shakeT * 90) * this.shakeT * 14 : 0;
      const x = this.cx + sh, y = this.bottom;
      H.shadow(ctx, this.cx, y, 32, 0.5);
      H.blit(ctx, s, x, y);
      if (s && !this.broken) {
        for (const [gx, gy, len] of s.meta.glows) {
          H.glow(ctx, x + gx, y + gy, len * 1.3, '#ff9a40', 0.28 + 0.1 * Math.sin(t * 2 + gx));
        }
        if (this.shakeT > 0) H.glow(ctx, x, y - 20, 50, '#ffe0a0', this.shakeT * 2);
      }
    }
  }

  // =====================================================================================================
  // lever — strike it with the Brand; sets lever:<id>; linked gates open themselves
  // =====================================================================================================
  const LEVER_ANGLE = 0.62;
  function drawLeverBase(ctx, meta, m, pal) {
    const iron = H.mix(m.iron, pal.edge, 0.2), ironL = H.mix(m.ironLight, pal.highlight, 0.2);
    H.shaded(ctx, H.rrect(-15, -9, 30, 9, 2), H.mix(m.stoneDark, pal.fill, 0.2), [-15, -9, 15, 0]);
    const housing = new Path2D();
    housing.moveTo(-11, -8); housing.lineTo(-11, -13); housing.arc(0, -13, 11, Math.PI, 0, false); housing.lineTo(11, -8); housing.closePath();
    H.shaded(ctx, housing, iron, [-11, -24, 11, -8], { lw: 1.6 });
    ctx.fillStyle = H.mix(iron, '#000000', 0.6);
    ctx.beginPath(); ctx.arc(0, -13, 6, Math.PI * 1.05, Math.PI * 1.95, false); ctx.lineTo(0, -13); ctx.closePath(); ctx.fill();
    for (const bx of [-7.5, 7.5]) {
      ctx.fillStyle = OUT; ctx.beginPath(); ctx.arc(bx, -10.5, 1.8, 0, TAU); ctx.fill();
      ctx.fillStyle = ironL; ctx.beginPath(); ctx.arc(bx - 0.4, -10.9, 1, 0, TAU); ctx.fill();
    }
    meta.pivotY = -13;
  }

  class Lever extends G.Entity {
    constructor(props) {
      super(props);
      this.w = 30; this.h = 56; this.z = -3;
      this.team = 'neutral';
      this.hurtable = true;
      this.pogoable = false;
      this.pulled = false;
      this.angle = -LEVER_ANGLE;
      this.av = 0;
    }
    flagKey() { return 'lever:' + (this.persistId || '?'); }
    init() {
      this.seed = H.seedOf(this);
      if (!this.persistId) G.warnOnce('lever:noid:' + (this.room && this.room.id), 'lever without id in room ' + (this.room && this.room.id));
      this.pulled = H.flag(this.flagKey());
      this.angle = this.pulled ? LEVER_ANGLE : -LEVER_ANGLE;
    }
    hurtRect() { return { x: this.x - 6, y: this.y, w: this.w + 12, h: this.h }; }
    onHit(hit) {
      if (this.pulled) return false;
      if (hit && hit.team && hit.team !== 'player') return false;
      this.pull(hit);
      return true;
    }
    pull(hit) {
      if (this.pulled) return;
      this.pulled = true;
      this.av = 22;
      H.setFlag(this.flagKey());
      const kx = this.cx, ky = this.bottom - 46;
      H.sfx('lever', this.cx);
      H.burst('spark', kx, ky, { count: 12, color: '#ffe0a0', speed: 380 });
      H.burst('dust', this.cx, this.bottom - 2, { count: 4 });
      H.shake(4, 0.15);
      if (G.game && G.game.hitstop) G.game.hitstop(0.04);
      G.events.emit('leverPulled', { id: this.persistId, room: this.room, lever: this, hit: hit || null });
      // tell the player something moved when the gate it opens is not in sight
      const id = this.persistId;
      const here = this.room && this.room.find((e) => (e.type === 'gate') && typeof e.props.opens === 'string' && e.props.opens.indexOf('lever:' + id) >= 0);
      if (!here || (G.camera && G.camera.visible && !G.camera.visible(here.x, here.y, here.w, here.h, 0))) H.toast(H.text('ui.gateOpened', 'Somewhere, a gate grinds open.'));
      H.save();
    }
    update(dt) {
      const target = this.pulled ? LEVER_ANGLE : -LEVER_ANGLE;
      // spring toward the target with a little overshoot
      this.av += ((target - this.angle) * 600 - this.av * 26) * dt;
      this.angle += this.av * dt;
      if (Math.abs(target - this.angle) < 0.001 && Math.abs(this.av) < 0.01) { this.angle = target; this.av = 0; }
    }
    draw(ctx, t) {
      const rid = H.regionId(this);
      const m = H.mat(rid), pal = H.pal(rid);
      const s = H.sprite('leverbase|' + rid, 40, 34, 20, 30, (c, meta) => drawLeverBase(c, meta, m, pal));
      const x = Math.round(this.cx), y = Math.round(this.bottom);
      H.shadow(ctx, x, y, 16, 0.45);
      // handle (behind the housing front)
      ctx.save();
      ctx.translate(x, y + (s ? s.meta.pivotY : -13));
      ctx.rotate(this.angle);
      const iron = H.mix(m.iron, pal.edge, 0.2);
      H.stroke2(ctx, [0, 0, 0, -36], iron, 4);
      H.line(ctx, [-0.9, -2, -0.9, -34], H.rgba(m.ironLight, 0.6), 1);
      const knob = H.ellipse(0, -39, 6, 6);
      H.shaded(ctx, knob, this.pulled ? H.mix(m.gold, '#ffe0a0', 0.2) : H.mix(m.wax, '#c05030', 0.4), [-6, -45, 6, -33], { light: 0.35, lw: 1.5 });
      ctx.fillStyle = 'rgba(255,255,255,0.55)'; ctx.beginPath(); ctx.arc(-2, -41, 1.6, 0, TAU); ctx.fill();
      ctx.restore();
      H.blit(ctx, s, x, y);
    }
  }

  // =====================================================================================================
  // gate & arena_gate — iron bars that slide into the ceiling. Shared drawing.
  // =====================================================================================================
  function drawBars(ctx, meta, m, pal, w, h, heavy) {
    const iron = H.mix(heavy ? H.mix(m.iron, '#000000', 0.25) : m.iron, pal.edge, 0.22);
    const ironL = H.mix(m.ironLight, pal.highlight, 0.18);
    const n = Math.max(3, Math.round(w / (heavy ? 12 : 11)));
    const bw = heavy ? 7 : 5.5;
    const step = (w - bw) / (n - 1);
    for (let i = 0; i < n; i++) {
      const bx = i * step;
      const bar = H.poly([bx, 0, bx + bw, 0, bx + bw, h - 7, bx + bw / 2, h, bx, h - 7]);
      H.shaded(ctx, bar, iron, [bx, 0, bx + bw, h], { light: 0.25, shadow: 0.45, lw: 1.4 });
      H.line(ctx, [bx + 1.3, 2, bx + 1.3, h - 9], H.rgba(ironL, 0.45), 1);
    }
    const cross = heavy ? [0.14, 0.5, 0.82] : [0.18, 0.62];
    for (const f of cross) {
      const cy = Math.round(h * f);
      H.shaded(ctx, H.rrect(-2, cy - 3.5, w + 4, 7, 2), iron, [0, cy - 3.5, w, cy + 3.5], { lw: 1.4 });
      for (let i = 0; i < n; i++) {
        const bx = i * step + bw / 2;
        ctx.fillStyle = OUT; ctx.beginPath(); ctx.arc(bx, cy, 1.7, 0, TAU); ctx.fill();
        ctx.fillStyle = ironL; ctx.beginPath(); ctx.arc(bx - 0.3, cy - 0.3, 0.9, 0, TAU); ctx.fill();
      }
    }
    // wax drips hanging from the crossbars
    const R = H.rand(Math.round(w * 7 + h * 3 + (heavy ? 99 : 0)));
    const wax = H.mix(m.wax, pal.highlight, 0.15);
    for (const f of cross) {
      const cy = Math.round(h * f) + 3;
      const k = 1 + Math.floor(R() * 2.5);
      for (let j = 0; j < k; j++) {
        const dx = 4 + R() * (w - 8), len = 5 + R() * 13, dw = 1.6 + R() * 1.4;
        const d = new Path2D();
        d.moveTo(dx - dw - 1, cy - 1); d.lineTo(dx - dw, cy + len - dw); d.arc(dx, cy + len - dw, dw, Math.PI, 0, true); d.lineTo(dx + dw + 1, cy - 1); d.closePath();
        ctx.fillStyle = wax; ctx.fill(d);
        ctx.strokeStyle = 'rgba(0,0,0,0.35)'; ctx.lineWidth = 0.8; ctx.stroke(d);
        ctx.fillStyle = 'rgba(255,255,255,0.4)'; ctx.fillRect(dx - dw * 0.5, cy, 0.9, len * 0.6);
      }
    }
    if (heavy) { // accent tips
      ctx.fillStyle = H.rgba(pal.accent, 0.6);
      for (let i = 0; i < n; i++) { const bx = i * step + bw / 2; ctx.beginPath(); ctx.moveTo(bx - 2, h - 6); ctx.lineTo(bx, h - 1); ctx.lineTo(bx + 2, h - 6); ctx.fill(); }
    }
    void meta;
  }
  // Horizontal grate (floor/ceiling hatch, seen edge-on): two rails with short struts between them, rivets,
  // wax drips hanging from the lower rail. Local origin = top-left of the gate rect; the top rail is flush
  // with the top of the collision box so a player standing on it does not float.
  function drawGrate(ctx, m, pal, w, h) {
    const iron = H.mix(m.iron, pal.edge, 0.22);
    const ironD = H.mix(iron, '#000000', 0.3);
    const ironL = H.mix(m.ironLight, pal.highlight, 0.18);
    const railH = Math.min(10, Math.max(6, Math.round(h * 0.24)));
    const lowY = Math.max(railH + 8, Math.round(h * 0.62));
    // struts first (behind the rails), with see-through gaps between them
    const n = Math.max(4, Math.round(w / 13));
    const sw = 5, step = (w - sw) / (n - 1);
    for (let i = 0; i < n; i++) {
      const sx = i * step;
      H.shaded(ctx, H.rrect(sx, railH - 2, sw, lowY - railH + 4, 1.5), ironD, [sx, railH, sx + sw, lowY], { light: 0.2, shadow: 0.4, lw: 1.2 });
      // diagonal brace in every other gap: reads as a lattice, not a fence
      if (i < n - 1 && i % 2 === 0) H.line(ctx, [sx + sw, railH + 1, sx + step, lowY - 1], H.rgba(ironD, 0.9), 2);
    }
    for (const [ry, rh] of [[0, railH], [lowY, Math.max(5, railH - 2)]]) {
      H.shaded(ctx, H.rrect(-1, ry, w + 2, rh, 2), iron, [0, ry, w, ry + rh], { light: 0.3, shadow: 0.45, lw: 1.4 });
      H.line(ctx, [2, ry + 1.6, w - 2, ry + 1.6], H.rgba(ironL, 0.5), 1);
      for (let i = 0; i < n; i++) {
        const bx = i * step + sw / 2, by = ry + rh / 2;
        ctx.fillStyle = OUT; ctx.beginPath(); ctx.arc(bx, by, 1.7, 0, TAU); ctx.fill();
        ctx.fillStyle = ironL; ctx.beginPath(); ctx.arc(bx - 0.3, by - 0.3, 0.9, 0, TAU); ctx.fill();
      }
    }
    // wax drips under the lower rail
    const R = H.rand(Math.round(w * 13 + h * 5));
    const wax = H.mix(m.wax, pal.highlight, 0.15);
    const k = 2 + Math.floor(R() * (w / 50));
    const cy = lowY + Math.max(5, railH - 2) - 1;
    for (let j = 0; j < k; j++) {
      const dx = 6 + R() * (w - 12), len = 4 + R() * 10, dw = 1.5 + R() * 1.4;
      const d = new Path2D();
      d.moveTo(dx - dw - 1, cy - 1); d.lineTo(dx - dw, cy + len - dw); d.arc(dx, cy + len - dw, dw, Math.PI, 0, true); d.lineTo(dx + dw + 1, cy - 1); d.closePath();
      ctx.fillStyle = wax; ctx.fill(d);
      ctx.strokeStyle = 'rgba(0,0,0,0.35)'; ctx.lineWidth = 0.8; ctx.stroke(d);
      ctx.fillStyle = 'rgba(255,255,255,0.4)'; ctx.fillRect(dx - dw * 0.5, cy, 0.9, len * 0.6);
    }
  }
  // End brackets that hold a horizontal grate in its frame (drawn over the neighbouring wall tiles).
  function drawGrateBrackets(ctx, m, pal, x, y, w, h) {
    const iron = H.mix(H.mix(m.iron, '#000000', 0.2), pal.edge, 0.2);
    const bh = Math.min(h, 22);
    for (const bx of [x - 7, x + w - 1]) {
      H.shaded(ctx, H.rrect(bx, y - 3, 8, bh + 6, 2), iron, [bx, y - 3, bx + 8, y + bh + 3], { lw: 1.4 });
      ctx.fillStyle = H.rgba(m.ironLight, 0.6);
      ctx.beginPath(); ctx.arc(bx + 4, y + 2, 1.3, 0, TAU); ctx.arc(bx + 4, y + bh - 2, 1.3, 0, TAU); ctx.fill();
    }
  }
  function drawHeader(ctx, m, pal, x, y, w) {
    const iron = H.mix(H.mix(m.iron, '#000000', 0.2), pal.edge, 0.2);
    H.shaded(ctx, H.rrect(x - 4, y, w + 8, 9, 2), iron, [x - 4, y, x + w + 4, y + 9], { lw: 1.5 });
    H.line(ctx, [x - 2, y + 2, x + w + 2, y + 2], H.rgba(m.ironLight, 0.4), 1);
  }

  // The closed horizontal grate exactly as a `gate` (w > h) draws it, for content that previews a real grate seen from
  // the neighbouring room (meltbloom's mb_grate shows mw_03's mw_gate1 at the bottom of mb_09's shaft).
  H.drawGrate = function (ctx, regionId, x, y, w, h) {
    const m = H.mat(regionId), pal = H.pal(regionId);
    const s = H.sprite('grate|' + regionId + '|' + w + 'x' + h, w + 4, h + 18, 2, 0, (c) => drawGrate(c, m, pal, w, h));
    H.blit(ctx, s, x, y);
    drawGrateBrackets(ctx, m, pal, x, y, w, h);
  };

  class Gate extends G.Entity {
    constructor(props) {
      super(props);
      this.w = Math.max(1, +props.w || 1) * TILE;
      this.h = Math.max(1, +props.h || 4) * TILE;
      this.z = 4;
      this.solid = true;
      this.noGrip = true;
      this.open = false;
      this.p = 0;              // 0 closed … 1 fully retracted
      this.opening = false;
      this.interactable = false;
      this.promptText = H.prompt('examine', 'Examine');
      this.warnedNoCond = false;
      // Horizontal grate (floor/ceiling hatch, e.g. w:4 h:1): slides sideways into its frame instead of up.
      const o = props.orient;
      this.horizontal = o === 'h' || o === 'horizontal' || (o !== 'v' && o !== 'vertical' && this.w > this.h);
      this.slideDir = props.slide === 'left' ? -1 : 1;
    }
    placeAtTile(tx, ty) { this.x = tx * TILE; this.y = (ty + 1) * TILE - this.h; this._placed = true; }
    flagKey() { return 'gate:' + (this.persistId || (this.room ? this.room.id + ':' + this.props.tx : '?')); }
    condMet() {
      const c = this.props.opens;
      if (!c || !String(c).trim()) {
        if (!this.warnedNoCond) { this.warnedNoCond = true; G.warnOnce('gate:nocond:' + this.persistId, 'gate "' + this.persistId + '" has no `opens` condition — it stays closed'); }
        return false;
      }
      return H.cond(c);
    }
    init() {
      this.seed = H.seedOf(this);
      if (H.flag(this.flagKey()) || this.condMet()) { this.open = true; this.p = 1; this.solid = false; }
      this.interactable = !this.open && !!this.props.hint;
    }
    getSolidRect() {
      const k = 1 - this.ease();
      if (this.horizontal) {
        const w = Math.max(0, this.w * k);
        return { x: this.slideDir > 0 ? this.right - w : this.x, y: this.y, w, h: this.h, owner: this, noGrip: true, oneWay: false };
      }
      return { x: this.x, y: this.y, w: this.w, h: Math.max(0, this.h * k), owner: this, noGrip: true, oneWay: false };
    }
    ease() { const p = this.p; return p < 0.5 ? 2 * p * p : 1 - Math.pow(-2 * p + 2, 2) / 2; }
    startOpening() {
      if (this.open || this.opening) return;
      this.opening = true;
      this.interactable = false;
      H.setFlag(this.flagKey());
      H.sfx('gate_open', this.cx);
      H.shake(4, 0.5);
      if (this.horizontal) H.burst('dust', this.slideDir > 0 ? this.right - 4 : this.x + 4, this.cy, { count: 10, color: '#8a8070' });
      else H.burst('dust', this.cx, this.y + 4, { count: 8, color: '#8a8070' });
      G.events.emit('gateOpened', { id: this.persistId, room: this.room, gate: this });
    }
    interact() {
      const key = this.props.hint;
      const txt = typeof key === 'string' && key.indexOf(' ') < 0 ? H.text('ui.' + key, key) : key;
      H.toast(txt || H.text('ui.gateLocked', 'Barred fast.'));
    }
    interactRect() {
      if (this.horizontal) return { x: this.x - 10, y: this.y - 60, w: this.w + 20, h: this.h + 120 };
      return { x: this.x - 30, y: this.bottom - 80, w: this.w + 60, h: 80 };
    }
    update(dt) {
      if (!this.open && !this.opening && this.condMet()) this.startOpening();
      if (this.opening) {
        this.p = Math.min(1, this.p + dt / (this.horizontal ? 1.1 : 0.9));
        if (Math.random() < dt * 20) {
          if (this.horizontal) H.burst('dust', this.slideDir > 0 ? this.right - 3 : this.x + 3, this.y + Math.random() * this.h, { count: 1, color: '#8a8070', speed: 40 });
          else H.burst('dust', this.x + Math.random() * this.w, this.y + 6, { count: 1, color: '#8a8070', speed: 40 });
        }
        if (this.p >= 1) { this.opening = false; this.open = true; this.solid = false; }
      }
    }
    draw(ctx) {
      const rid = H.regionId(this);
      const m = H.mat(rid), pal = H.pal(rid);
      if (this.horizontal) {
        if (this.p < 1) {
          const s = H.sprite('grate|' + rid + '|' + this.w + 'x' + this.h, this.w + 4, this.h + 18, 2, 0, (c) => drawGrate(c, m, pal, this.w, this.h));
          ctx.save();
          ctx.beginPath(); ctx.rect(this.x, this.y - 2, this.w, this.h + 20); ctx.clip();
          H.blit(ctx, s, this.x + this.slideDir * this.ease() * this.w, this.y);
          ctx.restore();
        }
        drawGrateBrackets(ctx, m, pal, this.x, this.y, this.w, this.h);
        return;
      }
      if (this.p < 1) {
        const s = H.sprite('bars|' + rid + '|' + this.w + 'x' + this.h + '|0', this.w + 12, this.h + 6, 6, 0, (c, meta) => drawBars(c, meta, m, pal, this.w, this.h, false));
        ctx.save();
        ctx.beginPath(); ctx.rect(this.x - 8, this.y, this.w + 16, this.h + 4); ctx.clip();
        H.blit(ctx, s, this.x, this.y - this.ease() * this.h);
        ctx.restore();
      }
      drawHeader(ctx, m, pal, this.x, this.y - 4, this.w);
    }
  }

  class ArenaGate extends G.Entity {
    constructor(props) {
      super(props);
      this.w = Math.max(1, +props.w || 1) * TILE;
      this.h = Math.max(1, +props.h || 4) * TILE;
      this.z = 4;
      this.solid = false;
      this.noGrip = true;
      this.state = 'open';    // open | closing | closed | opening
      this.q = 0;             // 0 retracted … 1 closed
      this.bounce = 0;
      this.listeners = [];
    }
    placeAtTile(tx, ty) { this.x = tx * TILE; this.y = (ty + 1) * TILE - this.h; this._placed = true; }
    init() {
      this.seed = H.seedOf(this);
      const on = (name, fn) => { G.events.on(name, fn); this.listeners.push([name, fn]); };
      on('arenaStart', (p) => { if (this.matches(p)) this.close(); });
      on('arenaEnd', (p) => { if (this.matches(p)) this.open(); });
      on('bossDefeated', () => { if (this.isLive() && (this.state === 'closed' || this.state === 'closing')) this.open(); });
    }
    isLive() { return !this.dead && !!this.room && !!G.game && G.game.room === this.room; }
    matches(p) {
      if (!this.isLive()) return false;
      if (p && p.room != null && p.room !== this.room && p.room !== this.room.id) return false;
      if (p && Array.isArray(p.gates) && p.gates.indexOf(this.persistId) < 0) return false;
      return true;
    }
    detach() { for (const [n, fn] of this.listeners) G.events.off(n, fn); this.listeners.length = 0; }
    onRoomExit() { this.detach(); }
    onRemoved() { this.detach(); }
    get closed() { return this.state === 'closed' || this.state === 'closing'; }
    getSolidRect() { return { x: this.x, y: this.y, w: this.w, h: Math.max(0, this.h * this.q), owner: this, noGrip: true, oneWay: false }; }
    // Which side is the arena? props.side ('left'|'right'), else the side facing the room's centre.
    arenaSide() {
      if (this.props.side === 'left') return -1;
      if (this.props.side === 'right') return 1;
      return this.room && this.cx > this.room.widthPx / 2 ? -1 : 1;
    }
    close(instant) {
      if (this.closed) return;
      this.pushPlayerOut();
      this.state = instant ? 'closed' : 'closing';
      this.solid = true;
      if (instant) { this.q = 1; return; }
      H.sfx('gate_close', this.cx, { vol: 0.8, pitch: 1.1 });
    }
    open(instant) {
      if (this.state === 'open' || this.state === 'opening') return;
      this.state = instant ? 'open' : 'opening';
      if (instant) { this.q = 0; this.solid = false; return; }
      H.sfx('gate_open', this.cx);
    }
    pushPlayerOut() {
      const p = H.player(), m = p && p.motor;
      if (!m || !this.room) return;
      const r = { x: this.x - 2, y: this.y, w: this.w + 4, h: this.h };
      if (!H.touchesPlayer(r, 0)) return;
      const s = this.arenaSide();
      const nx = s > 0 ? this.x + this.w + 2 : this.x - m.w - 2;
      if (!G.Physics.rectSolid(this.room, nx, m.y, m.w, m.h)) {
        if (typeof p.placeAt === 'function') { const vx = m.vx, vy = m.vy; p.placeAt(nx, m.y); m.vx = vx; m.vy = vy; }
        else { m.x = nx; p.x = nx; }
      }
    }
    update(dt) {
      if (this.state === 'closing') {
        this.q = Math.min(1, this.q + dt / 0.24 * (0.4 + this.q * 1.6));
        if (this.q >= 1) {
          this.q = 1; this.state = 'closed'; this.bounce = 1;
          H.shake(7, 0.3);
          H.burst('dust', this.cx, this.bottom - 2, { count: 12, color: '#8a8070', speed: 180 });
          H.burst('spark', this.cx, this.bottom - 2, { count: 6, color: '#ffd8a0', speed: 260 });
        }
      } else if (this.state === 'opening') {
        this.q = Math.max(0, this.q - dt / 0.7);
        if (this.q <= 0) { this.q = 0; this.state = 'open'; this.solid = false; }
      }
      if (this.bounce > 0) this.bounce = Math.max(0, this.bounce - dt * 5);
    }
    draw(ctx) {
      const rid = H.regionId(this);
      const m = H.mat(rid), pal = H.pal(rid);
      const peek = 6;
      const shown = Math.max(peek, this.q * this.h) - Math.sin(this.bounce * Math.PI) * 6 * this.bounce;
      const s = H.sprite('bars|' + rid + '|' + this.w + 'x' + this.h + '|1', this.w + 12, this.h + 6, 6, 0, (c, meta) => drawBars(c, meta, m, pal, this.w, this.h, true));
      ctx.save();
      ctx.beginPath(); ctx.rect(this.x - 8, this.y, this.w + 16, this.h + 4); ctx.clip();
      H.blit(ctx, s, this.x, this.y - this.h + shown);
      ctx.restore();
      drawHeader(ctx, m, pal, this.x, this.y - 4, this.w);
    }
  }

  // =====================================================================================================
  // sealdoor — the Sanctum's seal door: three sockets light per Warden Seal; opens with all three
  // =====================================================================================================
  const SEALS = ['bell', 'kiln', 'wing'];
  const SEAL_COLORS = { bell: '#cfe8ff', kiln: '#ff9a40', wing: '#b080ff' };
  function socketPositions(w, h) {
    return [[w * 0.5, h * 0.3], [w * 0.27, h * 0.55], [w * 0.73, h * 0.55]];
  }
  function drawSealDoor(ctx, meta, m, pal, w, h) {
    const gold = H.mix(m.gold, '#e8d090', 0.3), goldD = H.mix(gold, '#3a2a10', 0.55);
    const stone = H.mix(m.stoneDark, pal.fill, 0.25);
    // frame (stone) filling the doorway rect
    H.shaded(ctx, H.rrect(0, 0, w, h, 2), stone, [0, 0, w, h], { lw: 2 });
    // arched door panel
    const inset = 7, top = 10, ar = (w - inset * 2) / 2;
    const panel = new Path2D();
    panel.moveTo(inset, h); panel.lineTo(inset, top + ar); panel.arc(w / 2, top + ar, ar, Math.PI, 0, false); panel.lineTo(w - inset, h); panel.closePath();
    const g = ctx.createLinearGradient(0, top, 0, h);
    g.addColorStop(0, H.mix('#2a2430', pal.fill, 0.3)); g.addColorStop(1, H.mix('#16121a', pal.fill, 0.3));
    ctx.fillStyle = g; ctx.fill(panel);
    ctx.save(); ctx.clip(panel);
    // the cage motif: vertical gilt bars converging toward the arch
    ctx.strokeStyle = H.rgba(gold, 0.35); ctx.lineWidth = 1.2;
    for (let i = 1; i < 8; i++) {
      const fx = inset + (w - inset * 2) * (i / 8);
      ctx.beginPath(); ctx.moveTo(fx, h); ctx.quadraticCurveTo(fx, top + ar * 0.6, w / 2 + (fx - w / 2) * 0.25, top + 4); ctx.stroke();
    }
    for (const f of [0.78, 0.92]) { ctx.beginPath(); ctx.moveTo(inset, h * f); ctx.lineTo(w - inset, h * f); ctx.stroke(); }
    // concentric rings around the socket triangle
    const [s0, s1, s2] = socketPositions(w, h);
    const ccx = (s0[0] + s1[0] + s2[0]) / 3, ccy = (s0[1] + s1[1] + s2[1]) / 3;
    for (const rr of [w * 0.36, w * 0.44]) { ctx.beginPath(); ctx.arc(ccx, ccy, rr, 0, TAU); ctx.stroke(); }
    // central seam
    ctx.strokeStyle = 'rgba(0,0,0,0.7)'; ctx.lineWidth = 2;
    ctx.beginPath(); ctx.moveTo(w / 2, top + 2); ctx.lineTo(w / 2, h); ctx.stroke();
    ctx.strokeStyle = H.rgba(gold, 0.25); ctx.lineWidth = 1;
    ctx.beginPath(); ctx.moveTo(w / 2 + 1.5, top + 4); ctx.lineTo(w / 2 + 1.5, h); ctx.stroke();
    ctx.restore();
    ctx.strokeStyle = OUT; ctx.lineWidth = 2; ctx.stroke(panel);
    ctx.strokeStyle = H.rgba(gold, 0.85); ctx.lineWidth = 1.6;
    const rimP = new Path2D();
    rimP.moveTo(inset + 2.5, h); rimP.lineTo(inset + 2.5, top + ar); rimP.arc(w / 2, top + ar, ar - 2.5, Math.PI, 0, false); rimP.lineTo(w - inset - 2.5, h);
    ctx.stroke(rimP);
    // keystone with a carved crown of candles
    H.shaded(ctx, H.poly([w / 2 - 9, 2, w / 2 + 9, 2, w / 2 + 6, 16, w / 2 - 6, 16]), H.mix(m.stone, pal.edge, 0.3), [w / 2 - 9, 2, w / 2 + 9, 16], { lw: 1.4 });
    for (const dx of [-4, 0, 4]) H.line(ctx, [w / 2 + dx, 13, w / 2 + dx, dx === 0 ? 5 : 7], H.rgba(gold, 0.8), 1.4);
    // sockets: empty hollows with gilt rims; glyph under each
    SEALS.forEach((id, i) => {
      const [sx, sy] = socketPositions(w, h)[i];
      ctx.fillStyle = OUT; ctx.beginPath(); ctx.arc(sx, sy, 12.5, 0, TAU); ctx.fill();
      ctx.fillStyle = '#060508'; ctx.beginPath(); ctx.arc(sx, sy, 9.5, 0, TAU); ctx.fill();
      ctx.strokeStyle = gold; ctx.lineWidth = 2.2; ctx.beginPath(); ctx.arc(sx, sy, 11, 0, TAU); ctx.stroke();
      ctx.strokeStyle = H.rgba('#ffffff', 0.35); ctx.lineWidth = 1; ctx.beginPath(); ctx.arc(sx, sy, 11, Math.PI * 1.1, Math.PI * 1.6); ctx.stroke();
      ctx.strokeStyle = H.rgba(gold, 0.75); ctx.lineWidth = 1.2; ctx.lineCap = 'round';
      ctx.save(); ctx.translate(sx, sy + 20);
      ctx.beginPath();
      if (id === 'bell') { ctx.moveTo(-4, 3); ctx.quadraticCurveTo(-4, -4, 0, -4); ctx.quadraticCurveTo(4, -4, 4, 3); ctx.lineTo(-5, 3); ctx.moveTo(0, 3); ctx.lineTo(0, 5); }
      else if (id === 'kiln') { ctx.moveTo(-5, 4); ctx.lineTo(5, 4); ctx.moveTo(-4, 4); ctx.lineTo(-4, -2); ctx.lineTo(0, -5); ctx.lineTo(4, -2); ctx.lineTo(4, 4); ctx.moveTo(-1.5, 4); ctx.lineTo(-1.5, 1); ctx.lineTo(1.5, 1); ctx.lineTo(1.5, 4); }
      else { ctx.moveTo(0, 3); ctx.quadraticCurveTo(-2, -4, -6, -3); ctx.quadraticCurveTo(-5, 2, 0, 3); ctx.quadraticCurveTo(2, -4, 6, -3); ctx.quadraticCurveTo(5, 2, 0, 3); }
      ctx.stroke();
      ctx.restore();
    });
    // studs along the door edges
    for (let y = top + ar + 6; y < h - 6; y += 18) {
      for (const x of [inset + 6, w - inset - 6]) {
        ctx.fillStyle = OUT; ctx.beginPath(); ctx.arc(x, y, 2.4, 0, TAU); ctx.fill();
        ctx.fillStyle = goldD; ctx.beginPath(); ctx.arc(x, y, 1.6, 0, TAU); ctx.fill();
        ctx.fillStyle = H.rgba(gold, 0.8); ctx.beginPath(); ctx.arc(x - 0.5, y - 0.5, 0.8, 0, TAU); ctx.fill();
      }
    }
    void meta;
  }

  class SealDoor extends Interactable {
    constructor(props) {
      super(props);
      this.w = Math.max(2, +props.w || 3) * TILE;
      this.h = Math.max(3, +props.h || 6) * TILE;
      this.z = 3;
      this.solid = true;
      this.noGrip = true;
      this.state = 'locked';   // locked | kindling | rising | open
      this.timer = 0;
      this.rise = 0;
      this.sockets = [0, 0, 0]; // lit amount per socket
      this.promptText = H.prompt('examine', 'Examine');
    }
    flagKey() { return 'door:' + (this.persistId || (this.room ? this.room.id : '?')); }
    init() {
      super.init();
      const pr = H.progress();
      for (let i = 0; i < 3; i++) this.sockets[i] = pr && pr.seals.indexOf(SEALS[i]) >= 0 ? 1 : 0;
      if (H.flag(this.flagKey())) { this.state = 'open'; this.rise = 1; this.solid = false; this.interactable = false; }
    }
    sealCount() { const pr = H.progress(); return pr ? pr.seals.length : 0; }
    interactRect() { return { x: this.x - 30, y: this.bottom - 90, w: this.w + 60, h: 90 }; }
    getSolidRect() { return { x: this.x, y: this.y, w: this.w, h: Math.max(0, this.h * (1 - this.rise)), owner: this, noGrip: true, oneWay: false }; }
    interact() {
      if (this.state !== 'locked') return;
      const n = this.sealCount();
      if (n >= 3) { this.begin(); return; }
      const lines = [H.text('ui.sealDoorLocked', 'Three empty sockets wait in the door. It will not open for fewer.'),
        H.fmt(H.text('ui.sealDoorCount', 'Warden Seals: {n} / 3'), { n })];
      if (!H.ui('dialogue', { name: '', lines, onDone: () => {} })) H.toast(lines[0]);
      H.sfx('deny', this.cx, { vol: 0.5 });
    }
    begin() {
      if (this.state !== 'locked') return;
      this.state = 'kindling';
      this.timer = 0;
      this.interactable = false;
      H.setFlag(this.flagKey());
      H.save();
      if (G.game) G.game.lockPlayer('sealdoor');
      this.lockedPlayer = true;
    }
    release() { if (this.lockedPlayer && G.game) G.game.unlockPlayer('sealdoor'); this.lockedPlayer = false; }
    onRoomExit() { if (this.state === 'kindling' || this.state === 'rising') { this.state = 'open'; this.rise = 1; this.solid = false; } this.release(); }
    onRemoved() { this.release(); }
    update(dt) {
      const pr = H.progress();
      for (let i = 0; i < 3; i++) {
        const has = pr && pr.seals.indexOf(SEALS[i]) >= 0;
        if (this.state === 'kindling') continue;
        this.sockets[i] = G.U.approach(this.sockets[i], has ? 1 : 0, dt * 2);
      }
      if (this.state === 'locked' && this.sealCount() >= 3 && H.playable()) {
        const pc = H.playerCenter();
        if (pc && Math.abs(pc.x - this.cx) < 6 * TILE && Math.abs(pc.y - this.cy) < this.h / 2 + 3 * TILE) this.begin();
      }
      if (this.state === 'kindling') {
        this.timer += dt;
        // sockets flare one after another
        for (let i = 0; i < 3; i++) {
          const k = clamp((this.timer - i * 0.35) / 0.3, 0, 1);
          const before = this.sockets[i];
          this.sockets[i] = 1 + k * 0.8 * (1 - clamp((this.timer - 1.4) / 0.6, 0, 1));
          if (before < 1.05 && this.sockets[i] >= 1.05) {
            const [sx, sy] = socketPositions(this.w, this.h)[i];
            H.burst('flash', this.x + sx, this.y + sy, { r: 60, color: SEAL_COLORS[SEALS[i]], alpha: 0.9 });
            H.burst('ember', this.x + sx, this.y + sy, { count: 8, color: SEAL_COLORS[SEALS[i]], speed: 90 });
            H.sfx('shrine', this.x + sx, { vol: 0.6, pitch: 0.8 + i * 0.2 });
          }
        }
        if (this.timer >= 1.4) {
          this.state = 'rising'; this.timer = 0;
          H.sfx('door', this.cx);
          H.toast(H.text('ui.sealDoorOpen', 'The door yields.'));
        }
      } else if (this.state === 'rising') {
        this.timer += dt;
        const k = clamp(this.timer / 2.6, 0, 1);
        this.rise = k * k * (3 - 2 * k);
        H.shake(2.5, 0.1);
        if (Math.random() < dt * 30) H.burst('dust', this.x + Math.random() * this.w, this.y + 4, { count: 1, color: '#9a9080', speed: 60 });
        if (Math.random() < dt * 14) H.burst('dust', this.x + Math.random() * this.w, this.bottom - 4, { count: 1, color: '#9a9080', speed: 90 });
        if (k >= 1) { this.state = 'open'; this.solid = false; this.release(); }
      }
      // light
      for (let i = 0; i < 3; i++) {
        if (this.sockets[i] <= 0.02) continue;
        const [sx, sy] = socketPositions(this.w, this.h)[i];
        H.light(this.x + sx, this.y + sy - this.rise * this.h, 90 * Math.min(1.6, this.sockets[i]), SEAL_COLORS[SEALS[i]], 0.6, true);
      }
      if (this.state !== 'open') H.light(this.cx, this.bottom - 40, 120, '#e8d8b0', 0.2, false);
    }
    draw(ctx, t) {
      const rid = H.regionId(this);
      const m = H.mat(rid), pal = H.pal(rid);
      const oy = -this.rise * this.h;
      if (this.rise < 1) {
        const s = H.sprite('sealdoor|' + rid + '|' + this.w + 'x' + this.h, this.w, this.h, 0, 0, (c, meta) => drawSealDoor(c, meta, m, pal, this.w, this.h));
        ctx.save();
        ctx.beginPath(); ctx.rect(this.x - 2, this.y, this.w + 4, this.h + 2); ctx.clip();
        H.blit(ctx, s, this.x, this.y + oy);
        SEALS.forEach((id, i) => {
          const a = this.sockets[i];
          if (a <= 0.02) return;
          const [sx, sy] = socketPositions(this.w, this.h)[i];
          const x = this.x + sx, y = this.y + sy + oy;
          H.glow(ctx, x, y, 40 * Math.min(1.8, a), SEAL_COLORS[id], 0.55 * Math.min(1, a));
          ctx.save(); ctx.globalAlpha *= Math.min(1, a);
          H.flame(ctx, x, y + 7, 14 * Math.min(1.5, a), SEAL_FLAME[id], t, this.seed + i);
          ctx.restore();
        });
        ctx.restore();
      }
      drawHeader(ctx, m, pal, this.x, this.y - 5, this.w);
    }
  }

  // =====================================================================================================
  // light — static light source; optional flame/glow sprite
  // props: r (tiles, default 4), color, intensity (0..1), flicker, flame (kind), size (flame px), glow (bool)
  // =====================================================================================================
  class Light extends G.Entity {
    constructor(props) {
      super(props);
      this.w = 16; this.h = 16; this.z = -8;
      this.anchor = 'center';
      this.r = Math.max(0.5, +props.r || 4) * TILE;
      this.color = props.color || '#ffd8a0';
      this.intensity = props.intensity == null ? 0.8 : +props.intensity;
      this.flicker = !!props.flicker;
    }
    init() { this.seed = H.seedOf(this); }
    update() { H.light(this.cx, this.cy, this.r, this.color, this.intensity, this.flicker); }
    draw(ctx, t) {
      const p = this.props;
      if (p.flame) H.flame(ctx, this.cx, this.cy + (p.size || 14) * 0.45, p.size || 14, p.flame, t, this.seed);
      else if (p.glow) H.glow(ctx, this.cx, this.cy, this.r * 0.35, this.color, 0.35 * this.intensity);
    }
  }

  // =====================================================================================================
  // decor — a catalog prop drawn via G.Art.drawDecorProp (layer 'back' z=-20 behind terrain, 'front' z=20)
  // =====================================================================================================
  class Decor extends G.Entity {
    constructor(props) {
      super(props);
      this.kind = props.kind;
      this.layer = props.layer === 'front' ? 'front' : 'back';
      this.z = props.z != null ? +props.z : (this.layer === 'front' ? 20 : -20);
      this.scale = props.scale > 0 ? +props.scale : 1;
      const info = G.Art && G.Art.propInfo ? G.Art.propInfo(this.kind) : null;
      this.top = !!(info && info.anchor === 'top');
      this.w = Math.max(1, (info ? info.size[0] : 1)) * TILE * this.scale;
      this.h = Math.max(1, (info ? info.size[1] : 1)) * TILE * this.scale;
      this.opts = null;
      this.lights = null;
    }
    placeAtTile(tx, ty) {
      this.footX = (tx + 0.5) * TILE;
      this.footY = this.top ? ty * TILE : (ty + 1) * TILE;
      this.x = this.footX - this.w / 2;
      this.y = this.top ? this.footY : this.footY - this.h;
      this._placed = true;
    }
    init() {
      if (this.footX == null) { this.footX = this.cx; this.footY = this.top ? this.y : this.bottom; }
      const p = this.props;
      const o = {};
      for (const k in p) if (['type', 'tx', 'ty', 'x', 'y', 'kind', 'layer', 'z'].indexOf(k) < 0) o[k] = p[k];
      o.region = H.regionId(this);
      if (o.seed == null) o.seed = H.seedOf(this);
      o.flip = !!p.flip;
      o.scale = this.scale;
      if (this.layer === 'back' && o.dim == null) o.dim = 0;
      this.opts = o;
      if (!this.kind) { G.reportError(new Error('decor without kind in room ' + (this.room && this.room.id)), 'decor'); this.remove(); return; }
      if (G.Art && G.Art.propLights) this.lights = G.Art.propLights(this.kind, this.footX, this.footY, o) || [];
    }
    update() {
      if (this.lights) for (const L of this.lights) H.light(L.x, L.y, L.r, L.color, L.intensity == null ? 0.8 : L.intensity, L.flicker);
    }
    draw(ctx, t) {
      if (G.Art && G.Art.drawDecorProp) G.Art.drawDecorProp(ctx, this.kind, this.footX, this.footY, this.opts, t);
    }
  }

  // =====================================================================================================
  // event — dispatches to G.Events[script] = { init(entity), update(entity, dt), draw?(entity, ctx, t) }
  // props: script, id (optional: with `once` the event is skipped after entity.done()), w/h (tiles), anchor
  // =====================================================================================================
  const reportedScripts = new Set();
  class EventEntity extends G.Entity {
    constructor(props) {
      super(props);
      this.script = props.script;
      this.w = Math.max(0.25, +props.w || 1) * TILE;
      this.h = Math.max(0.25, +props.h || 1) * TILE;
      this.anchor = props.anchor || 'ground';
      this.cull = false;
      this.z = props.z != null ? +props.z : 1;
      this.data = {};
      this.def = null;
    }
    get flagKey() { return 'event:' + (this.persistId || this.script); }
    init() {
      this.seed = H.seedOf(this);
      if (this.props.once && H.flag(this.flagKey)) { this.remove(); return; }
      const def = G.Events && G.Events[this.script];
      if (!def || typeof def !== 'object') {
        if (!reportedScripts.has(this.script)) {
          reportedScripts.add(this.script);
          G.reportError(new Error('unknown event script "' + this.script + '"' + (this.room ? ' in room ' + this.room.id : '')), 'event');
        }
        this.remove();
        return;
      }
      this.def = def;
      if (typeof def.init === 'function') def.init(this);
    }
    /** Mark the event finished: sets flag event:<id|script> and removes the entity. */
    done() { H.setFlag(this.flagKey); this.remove(); }
    triggerRect() { return { x: this.x, y: this.y, w: this.w, h: this.h }; }
    playerInside() { return H.touchesPlayer(this.triggerRect(), 0); }
    update(dt) { if (this.def && typeof this.def.update === 'function') this.def.update(this, dt); }
    draw(ctx, t) { if (this.def && typeof this.def.draw === 'function') this.def.draw(this, ctx, t); }
    onRoomExit() { if (this.def && typeof this.def.exit === 'function') H.safe(() => this.def.exit(this), 'event exit ' + this.script); }
  }
  // A small built-in script: a one-time toast when the player enters the trigger box.
  // props: { type:'event', script:'toast', text:'...' | textKey:'ui.someKey', id, once:true, w, h }
  G.Events.toast = G.Events.toast || {
    init() {},
    update(e) {
      if (!e.playerInside() || !H.playable()) return;
      const txt = e.props.textKey ? H.text(e.props.textKey, e.props.text) : e.props.text;
      H.toast(txt);
      if (e.props.once !== false) e.done(); else e.remove();
    },
  };

  // =====================================================================================================
  // cinder — currency chips: burst out, bounce, settle, glint; collected on touch; Cinder Lure attracts
  // =====================================================================================================
  const CINDER = {
    1: { size: 5, color: '#ff9a3c', hi: '#ffd8a0', light: 0.3 },
    5: { size: 7, color: '#ffc04a', hi: '#fff0c0', light: 0.4 },
    25: { size: 9.5, color: '#fff0b0', hi: '#ffffff', light: 0.55 },
  };
  const LURE_RANGE = 6 * TILE;
  let streak = 0, streakT = -1;   // rising pitch when collecting many in a row

  class Cinder extends G.Entity {
    constructor(props) {
      super(props);
      this.type = 'cinder';
      this.value = props.value === 25 || props.value === 5 ? props.value : 1;
      const d = CINDER[this.value];
      this.w = this.h = Math.round(d.size * 1.6);
      this.anchor = 'center';
      this.z = 6;
      this.vx = props.vx || 0;
      this.vy = props.vy || 0;
      this.delay = props.delay != null ? props.delay : 0.12;   // not collectible during the first instant
      this.rot = Math.random() * TAU;
      this.vrot = (Math.random() - 0.5) * 18;
      this.settled = false;
      this.lured = false;
      this.glintPhase = Math.random();
      this.shapeSeed = (Math.random() * 1000) | 0;
      this.cull = true;
    }
    collect() {
      if (this.dead) return;
      this.remove();
      if (G.game) G.game.addCinders(this.value);
      const now = G.game ? G.game.t : 0;
      streak = now - streakT < 0.35 ? Math.min(streak + 1, 12) : 0;
      streakT = now;
      const pitch = (this.value >= 25 ? 0.85 : this.value >= 5 ? 0.95 : 1.05) + streak * 0.035 + Math.random() * 0.06;
      H.sfx('cinder', this.cx, { vol: this.value >= 25 ? 0.6 : 0.45, pitch });
      const d = CINDER[this.value];
      H.burst('spark', this.cx, this.cy, { count: this.value >= 5 ? 5 : 3, color: d.hi, speed: 160 });
    }
    update(dt) {
      if (this.delay > 0) this.delay -= dt;
      const room = this.room;
      const pc = H.playerCenter();
      const live = H.playable();
      if (pc && live && this.delay <= 0) {
        const dx = pc.x - this.cx, dy = pc.y - this.cy;
        const d = Math.hypot(dx, dy);
        if (!this.lured && d < LURE_RANGE && G.game && G.game.isEquipped && G.game.isEquipped('cinder_lure')) this.lured = true;
        if (this.lured) {
          // home in: accelerate toward the player, ignoring terrain
          const acc = 2600, max = 760;
          this.vx += (dx / (d || 1)) * acc * dt;
          this.vy += (dy / (d || 1)) * acc * dt;
          const sp = Math.hypot(this.vx, this.vy);
          if (sp > max) { this.vx *= max / sp; this.vy *= max / sp; }
          // damp sideways drift so it doesn't orbit
          this.vx *= 0.94; this.vy *= 0.94;
          this.x += this.vx * dt; this.y += this.vy * dt;
          this.rot += dt * 14;
          this.settled = false;
        }
        if (H.touchesPlayer(this, 4)) { this.collect(); return; }
        if (this.lured) return;
      }
      if (this.settled) return;
      this.vy = Math.min(this.vy + 1900 * dt, 760);
      const res = room ? G.Physics.move(this, room, this.vx * dt, this.vy * dt) : { hitX: 0, hitY: 0 };
      this.rot += this.vrot * dt;
      if (res.hitX) { this.vx = -this.vx * 0.45; this.vrot *= -0.6; }
      if (res.hitY > 0) {
        if (this.vy > 150) {
          if (this.vy > 260) H.sfx('cinder', this.cx, { vol: 0.12, pitch: 1.7 + Math.random() * 0.3 });
          this.vy = -this.vy * 0.42;
          this.vx *= 0.7;
          this.vrot *= 0.6;
        } else {
          this.vy = 0;
          this.vx = G.U.approach(this.vx, 0, 1400 * dt);
          this.vrot = G.U.approach(this.vrot, 0, 40 * dt);
          if (Math.abs(this.vx) < 2) { this.vx = 0; this.vrot = 0; this.settled = true; }
        }
      } else if (res.hitY < 0) this.vy = Math.abs(this.vy) * 0.2;
      if (room && this.y > room.heightPx + 120) this.remove();
    }
    // A settled chip that the floor drops away from (a B wall broke, etc.) falls again.
    wake() { this.settled = false; }
    draw(ctx, t) {
      const d = CINDER[this.value];
      const cx = this.cx, cy = this.cy, s = d.size;
      // light comes from draw so dozens of chips don't flood the step lights while invisible
      if (G.lighting) G.lighting.add({ x: cx, y: cy, r: 26 + s * 3, color: d.color, intensity: d.light, glow: false });
      H.glow(ctx, cx, cy, s * 3.4, d.color, 0.32 + 0.1 * Math.sin(t * 5 + this.glintPhase * 6));
      ctx.save();
      ctx.translate(cx, cy);
      ctx.rotate(this.rot);
      const k = this.shapeSeed % 3;
      const pts = k === 0 ? [0, -s, s * 0.9, -s * 0.1, s * 0.3, s * 0.85, -s * 0.85, s * 0.3]
        : k === 1 ? [-s * 0.3, -s, s * 0.8, -s * 0.5, s * 0.7, s * 0.6, -s * 0.5, s * 0.8, -s * 0.95, 0]
          : [0, -s * 1.05, s * 0.85, 0, 0, s * 0.85, -s * 0.85, 0];
      const p = H.poly(pts);
      ctx.strokeStyle = '#2a1206'; ctx.lineWidth = 2.6; ctx.lineJoin = 'round'; ctx.stroke(p);
      ctx.fillStyle = d.color; ctx.fill(p);
      ctx.fillStyle = H.rgba(d.hi, 0.85);
      ctx.beginPath(); ctx.moveTo(pts[0], pts[1]); ctx.lineTo(pts[2], pts[3]); ctx.lineTo(0, 0); ctx.closePath(); ctx.fill();
      ctx.fillStyle = 'rgba(80,20,0,0.35)';
      ctx.beginPath(); ctx.moveTo(pts[4], pts[5]); ctx.lineTo(pts[6], pts[7]); ctx.lineTo(0, 0); ctx.closePath(); ctx.fill();
      ctx.restore();
      // glint: a quick 4-point star now and then once settled
      if (this.settled) {
        const q = (t * 0.33 + this.glintPhase) % 1;
        if (q < 0.07) {
          const a = Math.sin((q / 0.07) * Math.PI);
          const L = s * 1.6 * a;
          ctx.save();
          ctx.globalCompositeOperation = 'lighter';
          ctx.globalAlpha *= a;
          const gx = cx - s * 0.3, gy = cy - s * 0.4;
          H.line(ctx, [gx - L, gy, gx + L, gy], '#fff6dc', 1.2);
          H.line(ctx, [gx, gy - L, gx, gy + L], '#fff6dc', 1.2);
          ctx.restore();
        }
      }
    }
  }

  /**
   * G.dropCinders(room, x, y, amount, opts) — spawns bouncing cinder chips worth `amount` (25/5/1).
   * opts: {dir (-1..1 horizontal bias), power (velocity multiplier), delay}. Returns the spawned chips.
   */
  function dropCinders(room, x, y, amount, opts) {
    room = room || (G.game && G.game.room);
    amount = Math.max(0, Math.floor(+amount || 0));
    if (!room || !amount) return [];
    const o = opts || {};
    const values = [];
    let left = amount;
    for (const d of [25, 5, 1]) while (left >= d) { values.push(d); left -= d; }
    // keep floods of chips bounded: very large drops just use fewer, bigger pieces already; cap count anyway
    const out = [];
    const n = values.length;
    for (let i = 0; i < n; i++) {
      const v = values[i];
      const spread = 0.45 + 0.35 * Math.min(1, n / 6);    // more chips → wider fan (radians each side)
      const ang = -Math.PI / 2 + (o.dir || 0) * 0.5 + (Math.random() * 2 - 1) * spread;
      const sp = (230 + Math.random() * 210) * (o.power || 1);
      const c = new Cinder({ type: 'cinder', value: v, vx: Math.cos(ang) * sp, vy: Math.sin(ang) * sp - 80, delay: o.delay });
      c.x = x - c.w / 2; c.y = y - c.h / 2;
      if (G.Physics.rectSolid(room, c.x, c.y, c.w, c.h)) {
        for (let k = 1; k <= 4 && G.Physics.rectSolid(room, c.x, c.y, c.w, c.h); k++) c.y -= TILE * 0.25;
      }
      room.add(c);
      out.push(c);
    }
    return out;
  }

  // Wake settled cinders when the terrain under them changes (a breakable shattered).
  G.events.on('tilesBroken', (p) => {
    const room = p && p.room;
    if (!room || !room.entities) return;
    for (const e of room.entities) if (e.type === 'cinder' && e.wake) e.wake();
  });

  // =====================================================================================================
  // registration
  // =====================================================================================================
  G.registerEntity('start', Start);
  G.registerEntity('respawn', Respawn);
  G.registerEntity('sconce', Sconce);
  G.registerEntity('lanternway', Lanternway);
  G.registerEntity('lore', Lore);
  G.registerEntity('shrine', Shrine);
  G.registerEntity('pickup', Pickup);
  G.registerEntity('geode', Geode);
  G.registerEntity('lever', Lever);
  G.registerEntity('gate', Gate);
  G.registerEntity('arena_gate', ArenaGate);
  G.registerEntity('sealdoor', SealDoor);
  G.registerEntity('light', Light);
  G.registerEntity('decor', Decor);
  G.registerEntity('event', EventEntity);
  G.registerEntity('cinder', Cinder);
  G.Cinder = Cinder;
  G.dropCinders = dropCinders;

  G.Interactables = {
    Interactable, Start, Respawn, Sconce, Lanternway, Lore, Shrine, Pickup, Geode, Lever, Gate, ArenaGate, SealDoor,
    Light, Decor, EventEntity, Cinder, pickupSpec, SEALS, SEAL_COLORS, GEODE_HITS,
  };
})();
