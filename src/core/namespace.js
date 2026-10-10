// src/core/namespace.js — creates the global namespace G: constants, tile codes, event bus, error reporting.
// Node-loadable (no DOM access). Every other file reads `const G = globalThis.G;`.
(function () {
  'use strict';
  const root = globalThis;
  const G = root.G || {};
  root.G = G;

  G.VERSION = '1.0.0';
  G.ready = false;

  // §4 — authoritative constants (the motor tunes everything else around these).
  G.CONST = {
    TILE: 40,
    VIEW_W: 1280, VIEW_H: 720,
    CELL_W: 16, CELL_H: 9,
    DT: 1 / 60,
    PLAYER_W: 26, PLAYER_H: 54,
    GRAVITY: 2600, MAX_FALL: 960,
  };

  // §7.3 — tile codes and the characters that produce them.
  G.T = { EMPTY: 0, SOLID: 1, GLAZED: 2, PLATFORM: 3, SPIKES: 4, WATER: 5, LAVA: 6, BREAKABLE: 7, DIVEFLOOR: 8, BGWALL: 9 };
  G.TILE_CHARS = { '.': 0, '#': 1, 'X': 2, '=': 3, '^': 4, '~': 5, '%': 6, 'B': 7, 'D': 8, ':': 9 };

  // URL parameters (empty object in Node). Read once; values are strings.
  G.params = (function parseParams() {
    const out = {};
    try {
      const search = (root.location && typeof root.location.search === 'string') ? root.location.search : '';
      if (!search) return out;
      for (const part of search.replace(/^\?/, '').split('&')) {
        if (!part) continue;
        const eq = part.indexOf('=');
        const k = decodeURIComponent(eq < 0 ? part : part.slice(0, eq));
        const v = eq < 0 ? '1' : decodeURIComponent(part.slice(eq + 1).replace(/\+/g, ' '));
        out[k] = v;
      }
    } catch (e) { /* ignore malformed query */ }
    return out;
  })();
  G.test = G.params.test === '1' || G.params.test === 'true';

  // ---- error reporting: log once per unique message; collected for the test harness ----
  const seenErrors = new Set();
  G._errors = G._errors || [];
  G.reportError = function reportError(err, where) {
    const msg = (err && err.message) ? err.message : String(err);
    const key = '[' + (where || '?') + '] ' + msg;
    if (seenErrors.has(key)) return;
    seenErrors.add(key);
    G._errors.push(key);
    if (G.debug && Array.isArray(G.debug.errors) && G.debug.errors !== G._errors) G.debug.errors.push(key);
    try {
      const stack = err && err.stack ? '\n' + String(err.stack).split('\n').slice(0, 5).join('\n') : '';
      console.error('[Gutterlight] ' + key + stack);
    } catch (e) { /* console unavailable */ }
  };

  // Warn once per key (used for missing content during parallel development, unknown entity types, ...).
  const seenWarnings = new Set();
  G.warnOnce = function warnOnce(key, text) {
    if (seenWarnings.has(key)) return;
    seenWarnings.add(key);
    try { console.warn('[Gutterlight] ' + (text || key)); } catch (e) { /* ignore */ }
  };

  // ---- event bus ----
  const listeners = Object.create(null);
  G.events = {
    on(name, fn) {
      (listeners[name] || (listeners[name] = [])).push(fn);
      return fn;
    },
    off(name, fn) {
      const arr = listeners[name];
      if (!arr) return;
      const i = arr.indexOf(fn);
      if (i >= 0) arr.splice(i, 1);
    },
    once(name, fn) {
      const wrap = (p) => { G.events.off(name, wrap); fn(p); };
      return G.events.on(name, wrap);
    },
    emit(name, payload) {
      const arr = listeners[name];
      if (!arr || !arr.length) return;
      for (const fn of arr.slice()) {
        try { fn(payload); } catch (e) { G.reportError(e, 'event:' + name); }
      }
    },
    clear(name) { if (name) delete listeners[name]; else for (const k in listeners) delete listeners[k]; },
  };

  // Scripted-event registry for `event` entities (§9.3). Content files add entries.
  G.Events = G.Events || {};

  // ---- safe cross-module calls (other modules may not exist yet) ----
  G.sfx = function sfx(name, opts) {
    const A = G.Audio;
    if (!A || typeof A.sfx !== 'function') return;
    try { A.sfx(name, opts); } catch (e) { G.reportError(e, 'Audio.sfx(' + name + ')'); }
  };
  // Positional sfx (QA audio r2): pans by the world x position relative to the camera and fades with the distance
  // of the source from the view rectangle (x always; y too when opts.y is given): full volume inside the view,
  // smoothly down to SFX_FALLOFF.floor at one view width/height outside it, then to silence at SFX_FALLOFF.far views,
  // beyond which the sound is not played at all (so far-away sounds cannot use up a name's rate-limit slot either).
  // Exempt (always full volume, only panned): opts.global, the names in G.SFX_GLOBAL (boss and world-event cues)
  // and every sound while an arena fight is active in the current room.
  G.SFX_FALLOFF = { floor: 0.2, far: 1.5 };
  G.SFX_GLOBAL = { boss_roar: 1, boss_stagger: 1, boss_hit: 1, boss_die: 1, gate_open: 1, gate_close: 1, door: 1 };
  G.sfxGain = function sfxGain(name, x, y) {
    const cam = G.camera;
    if (!cam || typeof x !== 'number' || !isFinite(x) || G.SFX_GLOBAL[name]) return 1;
    const w = cam.w || G.CONST.VIEW_W, h = cam.h || G.CONST.VIEW_H;
    const dx = x < cam.x ? cam.x - x : Math.max(0, x - (cam.x + w));
    const dy = (typeof y === 'number' && isFinite(y)) ? (y < cam.y ? cam.y - y : Math.max(0, y - (cam.y + h))) : 0;
    const d = Math.max(dx / w, dy / h);             // distance outside the view, in views
    if (d <= 0) return 1;
    const F = G.SFX_FALLOFF;
    if (d >= F.far) return 0;
    if (d <= 1) { const s = d * d * (3 - 2 * d); return 1 - (1 - F.floor) * s; }
    return F.floor * (1 - (d - 1) / (F.far - 1));
  };
  function arenaFight() {
    const room = G.game && G.game.room;
    if (!room || typeof room.find !== 'function') return false;
    try { return !!room.find((e) => e.type === 'arena' && e.active); } catch (e) { return false; }
  }
  G.sfxAt = function sfxAt(name, x, opts) {
    const cam = G.camera;
    let pan = 0, gain = 1;
    if (cam && typeof x === 'number' && isFinite(x)) {
      pan = Math.max(-0.8, Math.min(0.8, ((x - cam.x) / (cam.w || G.CONST.VIEW_W) - 0.5) * 1.6));
      if (!(opts && opts.global)) {
        gain = G.sfxGain(name, x, opts && opts.y);
        if (gain < 1 && arenaFight()) gain = 1;
        if (gain <= 0) return;
      }
    }
    const o = Object.assign({ pan }, opts || {});
    if (gain < 1) o.vol = (typeof o.vol === 'number' && isFinite(o.vol) ? o.vol : 1) * gain;
    G.sfx(name, o);
  };
})();
