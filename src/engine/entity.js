// src/engine/entity.js — G.Entity base class, type registry, G.Entity.create, cinder pickups (G.dropCinders).
(function () {
  'use strict';
  const G = globalThis.G;
  const TILE = G.CONST.TILE;

  const registry = Object.create(null); // type → {cls?, factory?}

  class Entity {
    constructor(props) {
      const p = props || {};
      this.props = p;
      this.type = p.type || 'entity';
      this.x = +p.x || 0;
      this.y = +p.y || 0;
      this.w = 32;
      this.h = 32;
      this.vx = 0;
      this.vy = 0;
      this.room = null;
      this.dead = false;
      this.z = 0;                   // draw order; player = 0; < -10 drawn behind terrain
      this.team = 'neutral';        // 'player' | 'enemy' | 'neutral'
      this.hurtable = false;
      this.solid = false;
      this.noGrip = false;          // solid entities: true = cannot be wall-gripped
      this.contactDamage = 0;       // > 0: hurts the player on overlap (engine checks each step)
      this.persistId = p.id || null;
      this.anchor = 'ground';       // tile placement: 'ground' | 'center' | 'top' | 'tile'
      this.facing = 1;
      this.t = 0;                   // age in seconds (advanced by the engine before update)
      this.cull = true;             // false: always drawn even when off-screen
    }

    init() {}
    update(dt) {}                   // eslint-disable-line no-unused-vars
    draw(ctx, t) {}                 // eslint-disable-line no-unused-vars
    onHit(hit) { return false; }    // eslint-disable-line no-unused-vars
    remove() { this.dead = true; }

    get cx() { return this.x + this.w / 2; }
    get cy() { return this.y + this.h / 2; }
    get bottom() { return this.y + this.h; }
    get right() { return this.x + this.w; }

    // Place relative to a tile (marker anchoring, TECH_SPEC §7.5).
    placeAtTile(tx, ty, anchor) {
      const a = anchor || this.anchor || 'ground';
      if (a === 'tile') { this.x = tx * TILE; this.y = ty * TILE; }
      else {
        this.x = (tx + 0.5) * TILE - this.w / 2;
        if (a === 'center') this.y = (ty + 0.5) * TILE - this.h / 2;
        else if (a === 'top') this.y = ty * TILE;
        else this.y = (ty + 1) * TILE - this.h; // ground: feet on the tile's bottom edge
      }
      this._placed = true;
    }

    getSolidRect() {
      return { x: this.x, y: this.y, w: this.w, h: this.h, owner: this, noGrip: !!this.noGrip, oneWay: !!this.oneWay };
    }
    hurtRect() { return this; }
    overlaps(o) { return G.U.aabb(this, o); }

    // Physics helpers
    move(dx, dy) { return G.Physics.move(this, this.room, dx, dy); }
    onGround() { return G.Physics.onGround(this.room, this); }

    get player() { return G.game ? G.game.player : null; }
    distTo(o) { return Math.hypot(o.cx - this.cx, o.cy - this.cy); }

    // Persistent entities (props.persistent && id) stay dead across room loads.
    markDead() {
      if (this.persistId && this.props.persistent && G.game) G.game.setFlag('dead:' + this.persistId);
    }
  }

  function registerEntity(type, cls) {
    if (typeof type !== 'string' || typeof cls !== 'function') {
      G.reportError(new Error('registerEntity(type, Class) needs a string and a class'), 'registerEntity');
      return;
    }
    registry[type] = { cls };
  }
  // factory(props) → entity | null (for types that dispatch on props, e.g. enemies by kind)
  function registerEntityFactory(type, factory) {
    if (typeof type !== 'string' || typeof factory !== 'function') {
      G.reportError(new Error('registerEntityFactory(type, fn) needs a string and a function'), 'registerEntityFactory');
      return;
    }
    registry[type] = { factory };
  }

  function create(props) {
    if (!props || typeof props.type !== 'string') {
      G.reportError(new Error('Entity.create: props.type missing'), 'Entity.create');
      return null;
    }
    const reg = registry[props.type];
    if (!reg) {
      G.reportError(new Error('unknown entity type "' + props.type + '"'), 'Entity.create');
      return null;
    }
    let e = null;
    try {
      e = reg.factory ? reg.factory(props) : new reg.cls(props);
    } catch (err) {
      G.reportError(err, 'create ' + props.type + (props.kind ? ':' + props.kind : ''));
      return null;
    }
    if (!e) return null;
    if (!e.props) e.props = props;
    if (!e.type) e.type = props.type;
    if (props.tx != null && props.ty != null && !e._placed && typeof e.placeAtTile === 'function') e.placeAtTile(+props.tx, +props.ty);
    else if (props.cx != null && props.cy != null) { e.x = props.cx - e.w / 2; e.y = props.cy - e.h / 2; }
    return e;
  }

  Entity.create = create;
  Entity.isRegistered = (type) => !!registry[type];
  Entity.types = () => Object.keys(registry);
  Entity.registry = registry;
  G.Entity = Entity;
  G.registerEntity = registerEntity;
  G.registerEntityFactory = registerEntityFactory;

  // ------------------------------------------------------------------ cinders (currency pickups)
  const CINDER_COLORS = { 1: '#ffb15a', 5: '#ffd27a', 25: '#fff0b0' };
  class Cinder extends Entity {
    constructor(props) {
      super(props);
      this.type = 'cinder';
      this.value = props.value || 1;
      this.w = this.value >= 25 ? 16 : this.value >= 5 ? 13 : 10;
      this.h = this.w;
      this.anchor = 'center';
      this.vx = props.vx || 0;
      this.vy = props.vy || 0;
      this.z = 6;
      this.delay = props.delay != null ? props.delay : 0.3;
      this.spin = Math.random() * Math.PI * 2;
      this.lured = false;
    }
    update(dt) {
      this.delay -= dt;
      this.spin += dt * (2 + Math.abs(this.vx) * 0.02);
      const p = G.game && G.game.player;
      const room = this.room;
      if (p && this.delay <= 0) {
        const dx = (p.x + p.w / 2) - this.cx, dy = (p.y + p.h / 2) - this.cy;
        const d = Math.hypot(dx, dy);
        const lure = G.game.isEquipped && G.game.isEquipped('cinder_lure');
        if (this.lured || (lure && d < 6 * TILE)) {
          this.lured = true;
          const sp = Math.min(900, 260 + (6 * TILE - Math.min(d, 6 * TILE)) * 3);
          this.x += (dx / (d || 1)) * sp * dt;
          this.y += (dy / (d || 1)) * sp * dt;
        }
        if (this.x < p.x + p.w + 6 && this.x + this.w > p.x - 6 && this.y < p.y + p.h + 6 && this.y + this.h > p.y - 6) {
          G.game.addCinders(this.value);
          G.sfxAt('cinder', this.cx, { vol: 0.5, pitch: 1 + Math.random() * 0.2, y: this.cy });
          if (G.fx) G.fx.burst('spark', this.cx, this.cy, { count: 3, color: CINDER_COLORS[this.value] || '#ffb15a', speed: 120 });
          this.remove();
          return;
        }
      }
      if (this.lured) return;
      this.vy = Math.min(this.vy + 1800 * dt, 700);
      const res = G.Physics.move(this, room, this.vx * dt, this.vy * dt);
      if (res.hitX) this.vx = -this.vx * 0.5;
      if (res.hitY > 0) {
        if (this.vy > 120) G.sfxAt('cinder', this.cx, { vol: 0.15, pitch: 1.6, y: this.cy });
        this.vy = this.vy > 120 ? -this.vy * 0.42 : 0;
        this.vx *= 0.7;
      } else if (res.hitY < 0) this.vy = 0;
      if (Math.abs(this.vx) < 4) this.vx = 0;
      if (room && this.y > room.heightPx + 200) this.remove();
    }
    draw(ctx, t) {
      const col = CINDER_COLORS[this.value] || '#ffb15a';
      const cx = this.cx, cy = this.cy, r = this.w * 0.5;
      if (G.fx && G.fx.glowAt) G.fx.glowAt(ctx, cx, cy, r * 3.2, col, 0.35 + 0.15 * Math.sin(t * 6 + this.spin));
      ctx.save();
      ctx.translate(cx, cy);
      ctx.rotate(Math.sin(this.spin) * 0.6);
      ctx.fillStyle = '#2a1408';
      ctx.beginPath();
      ctx.moveTo(0, -r - 1.5); ctx.lineTo(r + 1.5, 0); ctx.lineTo(0, r + 1.5); ctx.lineTo(-r - 1.5, 0); ctx.closePath();
      ctx.fill();
      ctx.fillStyle = col;
      ctx.beginPath();
      ctx.moveTo(0, -r); ctx.lineTo(r, 0); ctx.lineTo(0, r); ctx.lineTo(-r, 0); ctx.closePath();
      ctx.fill();
      ctx.fillStyle = '#fffbe8';
      ctx.fillRect(-r * 0.25, -r * 0.55, r * 0.4, r * 0.4);
      ctx.restore();
    }
  }
  registerEntity('cinder', Cinder);
  G.Cinder = Cinder;

  // Spawns bouncing cinder entities worth `amount` in total (denominations 25/5/1).
  G.dropCinders = function dropCinders(room, x, y, amount) {
    room = room || (G.game && G.game.room);
    amount = Math.max(0, Math.floor(amount || 0));
    if (!room || !amount) return [];
    const out = [];
    let left = amount;
    const values = [];
    for (const d of [25, 5, 1]) while (left >= d) { values.push(d); left -= d; }
    for (const v of values) {
      const c = new Cinder({ type: 'cinder', value: v, vx: (Math.random() - 0.5) * 440, vy: -260 - Math.random() * 300 });
      c.x = x - c.w / 2; c.y = y - c.h / 2;
      if (G.Physics.rectSolid(room, c.x, c.y, c.w, c.h)) c.y -= TILE * 0.5;
      room.add(c);
      out.push(c);
    }
    return out;
  };
})();
