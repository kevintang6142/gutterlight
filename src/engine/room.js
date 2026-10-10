// src/engine/room.js — G.Room: the runtime room (tiles from G.World.TileRoom + entities, solids, art cache).
// No DOM access; safe to load in Node too.
(function () {
  'use strict';
  const G = globalThis.G;

  class Room extends G.World.TileRoom {
    constructor(def, opts) {
      super(def, opts);
      this.artCache = {};     // reserved for G.Art
      this.time = 0;          // seconds since the room was entered (advanced by the game)
      this._staticLights = null;
    }

    // Adds an entity to the room and calls its init(). Returns the entity (or null if init threw).
    add(e) {
      if (!e) return null;
      e.room = this;
      e.dead = !!e.dead;
      this.entities.push(e);
      if (typeof e.init === 'function') {
        try { e.init(); } catch (err) {
          G.reportError(err, 'init ' + e.type + (e.kind ? ':' + e.kind : ''));
          e.dead = true;
          return null;
        }
      }
      return e;
    }

    // Creates an entity from props (G.Entity.create) and adds it. Unknown types → reportError + null.
    spawn(props) {
      const e = G.Entity.create(props);
      return e ? this.add(e) : null;
    }

    find(pred) {
      const list = this.entities;
      for (let i = 0; i < list.length; i++) { const e = list[i]; if (!e.dead && pred(e)) return e; }
      return null;
    }
    findAll(pred) {
      const out = [];
      for (const e of this.entities) if (!e.dead && pred(e)) out.push(e);
      return out;
    }
    // All live entities of a type (array; [] if none).
    findType(type) { return this.findAll((e) => e.type === type); }
    findById(id) { return this.find((e) => e.persistId === id || (e.props && e.props.id === id)); }

    // Spawn every entity of the room definition (legend markers + entities list).
    // Persistent entities flagged dead are skipped; unregistered types are skipped with one warning per type.
    spawnEntities() {
      const flags = (G.game && G.game.progress && G.game.progress.flags) || {};
      for (const spec of this.entitySpecs) this.spawnSpec(spec, flags);
    }
    spawnSpec(spec, flags) {
      const props = Object.assign({}, spec.props, { tx: spec.tx, ty: spec.ty });
      if (!props.type) { G.warnOnce('notype:' + this.id, 'room ' + this.id + ': entity without type at ' + spec.tx + ',' + spec.ty); return null; }
      if (props.persistent && props.id && flags && flags['dead:' + props.id]) return null;
      if (!G.Entity.isRegistered(props.type)) {
        G.warnOnce('etype:' + props.type, 'entity type "' + props.type + '" is not registered (yet) — skipped');
        return null;
      }
      return this.spawn(props);
    }

    rebuildSolids() {
      const s = this.solids;
      s.length = 0;
      const list = this.entities;
      for (let i = 0; i < list.length; i++) {
        const e = list[i];
        if (!e.solid || e.dead) continue;
        let r = null;
        try { r = e.getSolidRect ? e.getSolidRect() : e; } catch (err) { G.reportError(err, 'getSolidRect ' + e.type); }
        if (r) s.push(r);
      }
    }

    removeDead() {
      const list = this.entities;
      let j = 0;
      for (let i = 0; i < list.length; i++) {
        const e = list[i];
        if (!e.dead) list[j++] = e;
        else if (typeof e.onRemoved === 'function') { try { e.onRemoved(); } catch (err) { G.reportError(err, 'onRemoved ' + e.type); } }
      }
      list.length = j;
    }

    // Live hostile entities (team 'enemy', hurtable) — used by isSafeRoom.
    enemiesAlive() {
      let n = 0;
      for (const e of this.entities) if (!e.dead && e.team === 'enemy' && e.hurtable) n++;
      return n;
    }

    // Breaks the B/D component at a tile with full behaviour (persistence, art refresh, effects).
    breakComponentAt(c, r, kind) {
      const comp = this.componentAt(c, r);
      if (!comp || comp.broken) return false;
      if (G.Combat && G.Combat.breakComponent) return G.Combat.breakComponent(this, comp, kind);
      return super.breakComponentAt(c, r, kind);
    }
  }

  G.Room = Room;
})();
