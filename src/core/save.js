// src/core/save.js — G.Save (3 save slots + settings in localStorage, in-memory fallback) and G.settings.
// ?test=1 => memory only (never touches localStorage).
(function () {
  'use strict';
  const G = globalThis.G;

  const PREFIX = 'gutterlight.v1.';
  const SLOTS = 3;
  const memory = new Map();
  let storage; // undefined = not probed yet, null = unavailable

  function getStorage() {
    if (storage !== undefined) return storage;
    storage = null;
    if (G.test) return storage;
    try {
      const ls = globalThis.localStorage;
      if (ls) {
        const k = PREFIX + '__probe';
        ls.setItem(k, '1');
        ls.removeItem(k);
        storage = ls;
      }
    } catch (e) { storage = null; }
    return storage;
  }

  // Keys whose last localStorage write failed (quota / disk full): their newest value lives only in `memory`, and
  // reads must return it instead of the stale stored copy (QA robust: Continue restored an older save).
  const failed = new Set();
  let lastWriteOk = true;
  function readRaw(key) {
    if (failed.has(key) && memory.has(key)) return memory.get(key);
    const ls = getStorage();
    if (ls) {
      try { return ls.getItem(PREFIX + key); } catch (e) { /* fall through */ }
    }
    return memory.has(key) ? memory.get(key) : null;
  }
  function writeRaw(key, value) {
    memory.set(key, value);
    const ls = getStorage();
    if (!ls) { lastWriteOk = true; return true; }
    try {
      ls.setItem(PREFIX + key, value);
      failed.delete(key);
      lastWriteOk = true;
      return true;
    } catch (e) {
      failed.add(key);
      lastWriteOk = false;
      G.reportError(e, 'Save.write');
      return false;
    }
  }
  function removeRaw(key) {
    memory.delete(key);
    failed.delete(key);
    const ls = getStorage();
    if (ls) { try { ls.removeItem(PREFIX + key); } catch (e) { /* ignore */ } }
  }

  const fin = (v, d) => (typeof v === 'number' && isFinite(v) ? v : d);
  const validSlot = (slot) => Number.isInteger(slot) && slot >= 0 && slot < SLOTS;

  // ---- settings ----
  const SETTINGS_DEFAULTS = {
    masterVolume: 1,
    musicVolume: 0.7,
    sfxVolume: 0.8,
    ambienceVolume: 0.6,
    shake: 1,        // screen-shake multiplier 0..1
    hints: true,     // show control hints/prompts
  };
  G.settings = Object.assign({}, SETTINGS_DEFAULTS);

  // ---- multi-window safety (QA robust r2: a second tab silently overwrote newer progress on the same slot) ----
  // Every slot write carries a unique `_stamp` (first key of the JSON). `known` holds, per slot, the stamp this session
  // loaded, claimed or last wrote (MISSING = the slot was empty). A save whose stored stamp differs (another window
  // wrote or erased the slot) is refused and the slot marked stale; a 'storage' event from another window marks it
  // stale at once. Legacy saves without a stamp read as null and compare equal to null.
  const MISSING = '\u0000missing';
  const known = new Map();
  const stale = new Set();
  let stampSeq = 0;
  function newStamp() {
    return Date.now().toString(36) + '.' + Math.floor(Math.random() * 1679616).toString(36) + '.' + (++stampSeq).toString(36);
  }
  function stampOf(raw) {
    if (typeof raw !== 'string' || !raw) return null;
    const m = /^\{"_stamp":"([^"\\]*)"/.exec(raw);
    return m ? m[1] : null;
  }
  function track(slot, stamp) { known.set(slot, stamp); stale.delete(slot); }
  function conflict(slot) {
    const first = !stale.has(slot);
    stale.add(slot);
    if (G.events) G.events.emit('saveConflict', { slot, first });
  }
  function parseSlot(slot) {
    if (!validSlot(slot)) return null;
    const raw = readRaw('slot' + slot);
    if (!raw) return null;
    try {
      const data = JSON.parse(raw);
      if (data && typeof data === 'object') { delete data._stamp; return data; } // the stamp is G.Save's, not progress
      return null;
    } catch (e) {
      G.reportError(e, 'Save.load(slot ' + slot + ')');
      return null;
    }
  }
  function onStorage(e) {
    try {
      if (!e || (e.storageArea && e.storageArea !== getStorage())) return;
      for (const [slot, stamp] of known) {
        if (e.key !== null && e.key !== PREFIX + 'slot' + slot) continue;
        if (stale.has(slot)) continue;
        const now = e.key === null ? readRaw('slot' + slot) : e.newValue;
        if (failed.has('slot' + slot)) continue; // our newest copy lives in memory only; nothing to compare
        if ((now ? stampOf(now) : MISSING) !== stamp) conflict(slot);
      }
    } catch (err) { /* best effort */ }
  }
  if (typeof window !== 'undefined' && window.addEventListener && !G.test) window.addEventListener('storage', onStorage);

  G.Save = {
    SLOTS,
    get memoryOnly() { return !getStorage(); },
    /** false after a localStorage write failed (until the next successful one); the data is then kept in memory. */
    get lastWriteOk() { return lastWriteOk; },
    /** true when saves survive closing the page (storage available and the last write succeeded). */
    get persistent() { return !!getStorage() && lastWriteOk; },

    load(slot) {
      const data = parseSlot(slot);
      if (data) track(slot, stampOf(readRaw('slot' + slot)));
      return data;
    },
    // Writes the slot unless another window changed it since this session loaded/claimed/last wrote it (then the
    // slot is marked stale, 'saveConflict' {slot} is emitted and false is returned; see isStale).
    save(slot, progress) {
      if (!validSlot(slot) || !progress) return false;
      if (stale.has(slot)) { conflict(slot); return false; }
      if (known.has(slot)) {
        const cur = readRaw('slot' + slot);
        const st = cur ? stampOf(cur) : MISSING;
        if (st !== known.get(slot)) { conflict(slot); return false; }
      }
      const stamp = newStamp();
      let raw;
      try {
        const out = Object.assign({ _stamp: stamp }, progress);
        out._stamp = stamp;
        raw = JSON.stringify(out);
      } catch (e) { G.reportError(e, 'Save.save'); return false; }
      const ok = writeRaw('slot' + slot, raw);
      known.set(slot, stamp); // a failed write keeps the new copy in memory, which readRaw then returns
      return ok;
    },
    /** Starts tracking a slot this session is about to write without loading it (New Game). */
    claim(slot) {
      if (!validSlot(slot)) return;
      const cur = readRaw('slot' + slot);
      track(slot, cur ? stampOf(cur) : MISSING);
    },
    /** true when another window changed this slot since this session loaded/claimed/last wrote it. */
    isStale(slot) { return stale.has(slot); },
    remove(slot) { if (validSlot(slot)) { removeRaw('slot' + slot); known.delete(slot); stale.delete(slot); } },
    exists(slot) { return validSlot(slot) && !!readRaw('slot' + slot); },

    // Summary for the save-slot screen.
    summary(slot) {
      const p = parseSlot(slot); // a peek: does not (re)track the slot
      if (!p) return { slot, exists: false };
      const roomId = (p.sconce && p.sconce.room) || p.lastRoom || null;
      let regionId = null, regionName = '';
      try {
        const def = roomId && G.World && G.World.getRoom ? G.World.getRoom(roomId) : null;
        regionId = def ? def.region : null;
        const reg = regionId && G.World.regions ? G.World.regions[regionId] : null;
        regionName = (G.Text && G.Text.areas && regionId && G.Text.areas[regionId] && G.Text.areas[regionId].name) ||
          (reg && reg.name) || '';
      } catch (e) { /* summary is best effort */ }
      const pt = (typeof p.playTime === 'number' && isFinite(p.playTime) && p.playTime > 0) ? p.playTime : 0;
      const seen = Array.isArray(p.endingsSeen) ? p.endingsSeen.filter((x) => typeof x === 'string') : [];
      let completion = 0;
      try { completion = G.game && G.game.completionOf ? G.game.completionOf(p) : 0; } catch (e) { completion = 0; }
      return {
        slot, exists: true, regionId, regionName,
        playTime: pt, playTimeText: G.U.formatTime(pt),
        // a finished run continues from before the final fight (G.game migrate): `endingsSeen` keeps the slot complete
        completion, completed: !!p.completed || seen.length > 0,
        ending: (typeof p.ending === 'string' && p.ending) || (seen.length ? seen[seen.length - 1] : null),
        health: fin(p.health, 5), maxHealth: fin(p.maxHealth, 5), cinders: fin(p.cinders, 0),
      };
    },
    list() { const out = []; for (let i = 0; i < SLOTS; i++) out.push(G.Save.summary(i)); return out; },

    SETTINGS_DEFAULTS,
    loadSettings() {
      const raw = readRaw('settings');
      if (raw) {
        try {
          const s = JSON.parse(raw);
          for (const k in SETTINGS_DEFAULTS) if (s && typeof s[k] === typeof SETTINGS_DEFAULTS[k]) G.settings[k] = s[k];
        } catch (e) { /* keep defaults */ }
      }
      G.Save.applySettings();
      return G.settings;
    },
    saveSettings() {
      const out = {};
      for (const k in SETTINGS_DEFAULTS) out[k] = G.settings[k];
      writeRaw('settings', JSON.stringify(out));
      G.Save.applySettings();
    },
    // Pushes volumes to G.Audio (if present). Called after load/save of settings.
    applySettings() {
      const A = G.Audio;
      if (!A || typeof A.setVolume !== 'function') return;
      try {
        A.setVolume('master', G.settings.masterVolume);
        A.setVolume('music', G.settings.musicVolume);
        A.setVolume('sfx', G.settings.sfxVolume);
        A.setVolume('ambience', G.settings.ambienceVolume);
      } catch (e) { G.reportError(e, 'Save.applySettings'); }
    },
    _memory: memory,
    _onStorage: onStorage,
    _known: known,
  };
})();
