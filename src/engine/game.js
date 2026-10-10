// src/engine/game.js — G.game: state machine, fixed-step loop, progress (save data) API, room loading &
// transitions, death → wisp → respawn, saving, fades/flash/shake/hitstop, control locks, audio cues.
(function () {
  'use strict';
  const G = globalThis.G;
  const DT = G.CONST.DT;
  const TILE = G.CONST.TILE;
  const W = G.CONST.VIEW_W, H = G.CONST.VIEW_H;

  const ABILITIES = ['bolt', 'dash', 'grip', 'oilcloak', 'plunge', 'wings'];
  const BOSSES = ['effigy', 'sable1', 'matron', 'tallowmere', 'kilnmother', 'vespertine', 'sable2', 'lucerne'];
  const SIGIL_COSTS = { swift_brand: 2, long_brand: 2, heartwax: 2, kindle_haste: 2, ember_thirst: 1, cinder_lure: 1,
    smolder_shell: 1, flare_trail: 2, bright_bolt: 3, thorned_wax: 1, steadfast: 1, waymoth: 1, last_light: 2, deep_kindle: 3 };
  const DEFAULT_TOTALS = { heartwax: 8, urns: 2, kilnGlass: 3, sparks: 6, seals: 3, sigils: 14, notches: 6, bosses: 8, abilities: 6, brand: 3 };
  const TRANSITION_FADE = 0.18;

  function defaultProgress(slot) {
    return {
      version: 1, slot: slot | 0, playTime: 0, completed: false, ending: null, endingsSeen: [],
      sconce: null, lastRoom: null,
      maxHealth: 5, health: 5, heartShards: 0,
      ember: 0, urns: 0,
      cinders: 0, brandLevel: 0, kilnGlass: 0, notches: 3,
      abilities: { bolt: false, dash: false, grip: false, oilcloak: false, plunge: false, wings: false },
      sigils: [], equipped: [],
      sparks: [], seals: [],
      bosses: {}, flags: {}, visited: {}, charts: {}, lanterns: {},
      wisp: null,
    };
  }
  // Fill missing fields of loaded data (forward-compatible saves). Every known field is coerced to the type of its
  // default (arrays of strings, plain objects, finite numbers in a sane range, nullable records): a hand-edited or
  // corrupted save must never reach the game with e.g. `equipped: {}` (QA robust: black screen on Continue).
  const isObj = (v) => !!v && typeof v === 'object' && !Array.isArray(v);
  const NUM_RANGE = { version: [0, 1e6], playTime: [0, 1e9], maxHealth: [1, 20], health: [0, 20], heartShards: [0, 99],
    ember: [0, 1e4], urns: [0, 20], cinders: [0, 1e8], brandLevel: [0, 9], kilnGlass: [0, 20], notches: [0, 20] };
  const INT_FIELDS = { version: 1, maxHealth: 1, health: 1, heartShards: 1, urns: 1, cinders: 1, brandLevel: 1, kilnGlass: 1, notches: 1 };
  function coerceField(k, def, v) {
    if (Array.isArray(def)) return Array.isArray(v) ? v.filter((x) => typeof x === 'string') : def;
    if (isObj(def)) return isObj(v) ? Object.assign(def, v) : def;
    if (typeof def === 'number') {
      if (typeof v !== 'number' || !isFinite(v)) return def;
      const r = NUM_RANGE[k];
      let n = r ? Math.max(r[0], Math.min(r[1], v)) : v;
      if (INT_FIELDS[k]) n = Math.floor(n);
      return n;
    }
    if (typeof def === 'boolean') return typeof v === 'boolean' ? v : def;
    switch (k) { // nullable fields (default null)
      case 'ending': case 'lastRoom': return typeof v === 'string' ? v : null;
      case 'sconce': return isObj(v) && typeof v.room === 'string' ? v : null;
      case 'wisp': return isObj(v) && typeof v.room === 'string' && isFinite(v.x) && isFinite(v.y) ? v : null;
      default: return v;
    }
  }
  // A finished run (the ending has played) continues HK-style from just before the final fight: Lucerne is undefeated
  // again, so the other ending (or the same one) can be played on the same save. The endings seen are kept in
  // `endingsSeen`, which also keeps the slot marked complete (G.Save.summary) and Lucerne counted in the completion.
  const FINAL_BOSS = 'lucerne';
  function rewindFinishedRun(p) {
    if (!p.completed || !(p.bosses[FINAL_BOSS] || p.flags['boss:' + FINAL_BOSS])) return false;
    if (p.ending && p.endingsSeen.indexOf(p.ending) < 0) p.endingsSeen.push(p.ending);
    if (!p.endingsSeen.length) p.endingsSeen.push('undying');
    p.completed = false;
    p.ending = null;
    delete p.bosses[FINAL_BOSS];
    delete p.flags['boss:' + FINAL_BOSS];
    return true;
  }
  function migrate(data, slot) {
    const p = defaultProgress(slot);
    if (!data || typeof data !== 'object') return p;
    for (const k in p) {
      if (data[k] === undefined || data[k] === null) continue;
      p[k] = coerceField(k, p[k], data[k]);
    }
    for (const k in data) if (!(k in p)) p[k] = data[k];
    p.slot = slot | 0;
    rewindFinishedRun(p);
    return p;
  }

  const safe = (fn, where, ...args) => { try { return fn(...args); } catch (err) { G.reportError(err, where); return undefined; } };
  const UIfn = (name) => (G.UI && typeof G.UI[name] === 'function') ? G.UI[name].bind(G.UI) : null;
  const callUI = (name, ...args) => { const f = UIfn(name); if (!f) return false; safe(f, 'UI.' + name, ...args); return true; };
  const audio = (name, ...args) => {
    const A = G.Audio;
    if (A && typeof A[name] === 'function') safe(() => A[name](...args), 'Audio.' + name);
  };

  // ------------------------------------------------------------------ fades (public + engine-internal)
  function makeFader(key) {
    return { key, from: 0, to: 0, dur: 0, time: 0, cb: null, active: false };
  }
  const pubFade = makeFader('fadeAlpha');
  const sysFade = makeFader('sysFadeAlpha');
  function startFade(f, to, sec, onDone) {
    // A superseded fade completes immediately. Its callback may itself start a fade on this fader (e.g. travel's
    // fade-in that unlocks 'travel'); complete those too, so no callback is ever silently dropped.
    for (let guard = 0; f.cb && guard < 8; guard++) {
      const prev = f.cb;
      f.cb = null;
      safe(prev, 'fade callback');
    }
    f.from = game[f.key];
    f.to = Math.max(0, Math.min(1, to));
    f.dur = Math.max(0, sec || 0);
    f.time = 0;
    f.cb = onDone || null;
    f.active = true;
    if (f.dur === 0) finishFade(f);
  }
  function finishFade(f) {
    game[f.key] = f.to;
    f.active = false;
    const cb = f.cb;
    f.cb = null;
    if (cb) safe(cb, 'fade callback');
  }
  function tickFade(f, dt) {
    if (!f.active) return;
    f.time += dt;
    const k = f.dur > 0 ? Math.min(1, f.time / f.dur) : 1;
    game[f.key] = f.from + (f.to - f.from) * k;
    if (k >= 1) finishFade(f);
  }

  // ------------------------------------------------------------------ state
  const locks = new Map();
  let flashDur = 0, flashTime = 0;
  let trans = null;
  let respawning = false;
  let deathInfo = null;
  let fallbackTitle = false, fallbackPaused = false, fallbackEnding = null;
  let accumulator = DT / 2;
  let bossMusic = null;

  const game = {
    mode: 'boot',
    progress: null, room: null, player: null, region: null, t: 0,
    slot: 0, god: false,
    fadeAlpha: 0, sysFadeAlpha: 0, flashAlpha: 0, flashColor: null,
    hitstopTime: 0, deathTime: 0,
    ABILITIES, BOSSES, SIGIL_COSTS,
    defaultProgress,
  };

  // ------------------------------------------------------------------ presentation helpers
  game.hitstop = function (sec) { game.hitstopTime = Math.max(game.hitstopTime, Math.min(0.5, sec || 0)); };
  game.flash = function (color, sec) {
    game.flashColor = color || '#ffffff';
    flashDur = flashTime = Math.max(0.01, sec || 0.15);
    game.flashAlpha = 1;
  };
  game.shake = function (px, sec) {
    const k = G.settings && typeof G.settings.shake === 'number' ? G.settings.shake : (G.settings && G.settings.shake === false ? 0 : 1);
    if (k > 0 && G.camera) G.camera.shake(px * k, sec || 0.2);
  };
  game.fade = function (toAlpha, sec, onDone) { startFade(pubFade, toAlpha, sec, onDone); };
  game._sysFade = function (toAlpha, sec, onDone) { startFade(sysFade, toAlpha, sec, onDone); };

  game.lockPlayer = function (reason) { const r = reason || 'default'; locks.set(r, (locks.get(r) || 0) + 1); };
  game.unlockPlayer = function (reason) {
    const r = reason || 'default';
    const n = (locks.get(r) || 0) - 1;
    if (n > 0) locks.set(r, n); else locks.delete(r);
  };
  game.isLocked = () => locks.size > 0;
  game.lockReasons = () => [...locks.keys()];
  game.clearLocks = () => locks.clear();

  // ------------------------------------------------------------------ progress API
  const P = () => game.progress || (game.progress = defaultProgress(game.slot));
  game.hasAbility = (id) => !!(game.progress && game.progress.abilities[id]);
  game.giveAbility = function (id, opts) {
    const o = opts || {};
    const p = P();
    const isNew = !p.abilities[id];
    p.abilities[id] = true;
    G.events.emit('abilityGet', { id, isNew });
    game.saveNow();
    if (!o.silent && UIfn('abilityGet')) callUI('abilityGet', id, o.onDone || (() => {}));
    else if (o.onDone) safe(o.onDone, 'giveAbility onDone');
  };
  game.getFlag = (k) => (game.progress ? game.progress.flags[k] : undefined);
  game.setFlag = function (k, v) { P().flags[k] = v === undefined ? true : v; };
  game.clearFlag = function (k) { if (game.progress) delete game.progress.flags[k]; };

  game.addCinders = function (n) {
    const p = P();
    p.cinders = Math.max(0, Math.min(99999, p.cinders + Math.floor(n || 0)));
    G.events.emit('cinders', { amount: n, total: p.cinders });
  };
  game.spendCinders = function (n) {
    const p = P();
    n = Math.floor(n || 0);
    if (n < 0 || p.cinders < n) return false;
    p.cinders -= n;
    G.events.emit('cinders', { amount: -n, total: p.cinders });
    return true;
  };
  game.emberMax = function () {
    const p = P();
    return Math.max(0, 99 + 33 * (p.urns || 0) - (p.wisp ? 33 : 0));
  };
  game.addEmber = function (n) {
    const p = P();
    const max = game.emberMax();
    const before = p.ember;
    p.ember = Math.max(0, Math.min(max, p.ember + (n || 0)));
    if (before < max && p.ember >= max) G.events.emit('emberFull', {});
  };
  game.spendEmber = function (n) {
    const p = P();
    if (p.ember < n) return false;
    p.ember -= n;
    return true;
  };
  game.maxHealth = function () { const p = P(); return p.maxHealth + (game.isEquipped('heartwax') ? 1 : 0); };
  game.heal = function (n) { const p = P(); p.health = Math.min(game.maxHealth(), p.health + (n == null ? 1 : n)); };

  game.sigilCost = function (id) {
    const s = G.Items && G.Items.sigils && G.Items.sigils[id];
    return s && typeof s.cost === 'number' ? s.cost : (SIGIL_COSTS[id] || 1);
  };
  game.isEquipped = (id) => !!(game.progress && game.progress.equipped.indexOf(id) >= 0);
  game.notchesUsed = function () { let n = 0; for (const id of P().equipped) n += game.sigilCost(id); return n; };
  game.canEquip = function (id) {
    const p = P();
    return p.sigils.indexOf(id) >= 0 && p.equipped.indexOf(id) < 0 && game.notchesUsed() + game.sigilCost(id) <= p.notches;
  };
  game.equip = function (id) {
    if (!game.canEquip(id)) return false;
    P().equipped.push(id);
    G.events.emit('sigilsChanged', {});
    return true;
  };
  game.unequip = function (id) {
    const p = P();
    const i = p.equipped.indexOf(id);
    if (i < 0) return false;
    p.equipped.splice(i, 1);
    p.health = Math.min(p.health, game.maxHealth());
    G.events.emit('sigilsChanged', {});
    return true;
  };

  // spec: 'heartwax' | 'urn' | 'kiln_glass' | 'notch' | 'brand' | 'spark:<id>' | 'seal:<id>' | 'sigil:<id>' |
  //       'cinders:<n>' | 'chart:<region>'. opts: {silent, onDone, pickupId}
  game.giveItem = function (spec, opts) {
    const o = opts || {};
    const p = P();
    const s = String(spec || '');
    const ci = s.indexOf(':');
    const kind = ci < 0 ? s : s.slice(0, ci);
    const arg = ci < 0 ? '' : s.slice(ci + 1);
    let major = true, card = 'item';
    switch (kind) {
      case 'heartwax':
        p.heartShards++;
        if (p.heartShards % 2 === 0) { p.maxHealth++; p.health = game.maxHealth(); }
        break;
      case 'urn': p.urns++; break;
      case 'kiln_glass': p.kilnGlass++; break;
      case 'notch': p.notches = Math.min(6, p.notches + 1); break;
      case 'brand': p.brandLevel = Math.min(3, p.brandLevel + 1); break;
      case 'spark': if (arg && p.sparks.indexOf(arg) < 0) p.sparks.push(arg); card = 'spark'; break;
      case 'seal': if (arg && p.seals.indexOf(arg) < 0) p.seals.push(arg); break;
      case 'sigil': if (arg && p.sigils.indexOf(arg) < 0) p.sigils.push(arg); break;
      case 'cinders': game.addCinders(parseInt(arg, 10) || 0); major = false; card = null; break;
      case 'chart': if (arg) p.charts[arg] = true; major = false; card = null; break;
      default:
        G.reportError(new Error('giveItem: unknown item "' + s + '"'), 'giveItem');
        return false;
    }
    if (o.pickupId) game.setFlag('item:' + o.pickupId, true);
    G.events.emit('itemGet', { item: s });
    if (major) game.saveNow();
    const done = o.onDone || (() => {});
    if (o.silent || !card) { safe(done, 'giveItem onDone'); return true; }
    if (card === 'spark' && UIfn('sparkMemory')) callUI('sparkMemory', arg, done);
    else if (UIfn('itemGet')) callUI('itemGet', s, done);
    else safe(done, 'giveItem onDone');
    return true;
  };

  game.bossDefeated = (id) => !!(game.progress && (game.progress.bosses[id] || game.progress.flags['boss:' + id]));
  game.defeatBoss = function (id) {
    const p = P();
    p.bosses[id] = true;
    p.flags['boss:' + id] = true;
    game.saveNow();
    G.events.emit('bossDefeated', { id });
  };
  game.reclaimWisp = function () {
    const p = P();
    if (!p.wisp) return 0;
    const c = p.wisp.cinders || 0;
    p.wisp = null;
    game.addCinders(c);
    game.saveNow();
    return c;
  };
  game.lightLantern = function (id) { P().lanterns[id] = true; game.saveNow(); };

  // ---- conditions (§9.1) ----
  const COUNTS = {
    seals: (p) => p.seals.length, sparks: (p) => p.sparks.length, cinders: (p) => p.cinders,
    health: (p) => p.health, maxhealth: () => game.maxHealth(), heartwax: (p) => p.heartShards, shards: (p) => p.heartShards,
    urns: (p) => p.urns, notches: (p) => p.notches, brand: (p) => p.brandLevel, kilnglass: (p) => p.kilnGlass,
    bosses: (p) => BOSSES.filter((b) => p.bosses[b]).length, sigils: (p) => p.sigils.length,
    abilities: (p) => ABILITIES.filter((a) => p.abilities[a]).length,
  };
  function evalTerm(term, p) {
    let t = term.trim();
    if (!t) return true;
    let neg = false;
    while (t[0] === '!') { neg = !neg; t = t.slice(1).trim(); }
    let v;
    const m = /^([a-zA-Z_]+)\s*(>=|<=|==|!=|>|<|=)\s*(-?\d+)$/.exec(t);
    if (m) {
      const fn = COUNTS[m[1].toLowerCase()];
      if (!fn) { G.warnOnce('cond:' + m[1], 'evalCondition: unknown counter "' + m[1] + '"'); v = false; }
      else {
        const a = fn(p), b = parseInt(m[3], 10);
        v = m[2] === '>=' ? a >= b : m[2] === '<=' ? a <= b : m[2] === '>' ? a > b : m[2] === '<' ? a < b : m[2] === '!=' ? a !== b : a === b;
      }
    } else if (t === 'true') v = true;
    else if (t === 'false') v = false;
    else {
      const ci = t.indexOf(':');
      const kind = ci < 0 ? t : t.slice(0, ci);
      const arg = ci < 0 ? '' : t.slice(ci + 1);
      switch (kind) {
        case 'ability': v = !!p.abilities[arg]; break;
        case 'boss': v = !!(p.bosses[arg] || p.flags['boss:' + arg]); break;
        case 'flag': v = !!p.flags[arg]; break;
        case 'item': v = !!p.flags['item:' + arg]; break;
        case 'visited': v = !!p.visited[arg]; break;
        case 'region': v = !!p.flags['region:' + arg]; break;
        case 'sigil': v = p.sigils.indexOf(arg) >= 0; break;
        case 'equipped': v = p.equipped.indexOf(arg) >= 0; break;
        case 'spark': v = p.sparks.indexOf(arg) >= 0; break;
        case 'seal': v = p.seals.indexOf(arg) >= 0; break;
        case 'lantern': v = !!p.lanterns[arg]; break;
        case 'chart': v = !!p.charts[arg]; break;
        default:
          if (ci < 0) { G.warnOnce('cond:' + t, 'evalCondition: unknown term "' + t + '"'); v = false; }
          else v = !!p.flags[t]; // lever:<id>, talked:<npc>:<id>, broken:<comp>, dead:<id>, ...
      }
    }
    return neg ? !v : v;
  }
  game.evalCondition = function (str) {
    if (str === undefined || str === null || str === true) return true;
    if (str === false) return false;
    const s = String(str).trim();
    if (!s) return true;
    const p = P();
    for (const term of s.split('&')) if (!evalTerm(term, p)) return false;
    return true;
  };

  // ---- completion (DESIGN §9): every collectible counts equally ----
  function totals() { return Object.assign({}, DEFAULT_TOTALS, (G.Items && G.Items.totals) || {}); }
  game.completionOf = function (p) {
    if (!p) return 0;
    const tt = totals();
    const extraNotches = Math.max(0, (tt.notches || 6) - 3);
    const parts = [
      [ABILITIES.filter((a) => p.abilities && p.abilities[a]).length, tt.abilities || 6],
      [p.heartShards || 0, tt.heartwax], [p.urns || 0, tt.urns], [p.brandLevel || 0, tt.brand || 3],
      [(p.sparks || []).length, tt.sparks], [(p.seals || []).length, tt.seals], [(p.sigils || []).length, tt.sigils],
      [Math.max(0, (p.notches || 3) - 3), extraNotches], [BOSSES.filter((b) => (p.bosses && p.bosses[b]) || (b === FINAL_BOSS && Array.isArray(p.endingsSeen) && p.endingsSeen.length > 0)).length, tt.bosses],
    ];
    let got = 0, total = 0;
    for (const [a, b] of parts) { got += Math.min(a, b); total += b; }
    return total ? Math.floor((100 * got) / total + 1e-9) : 0;
  };
  game.completion = () => game.completionOf(P());
  game.endingId = () => (P().sparks.length >= 6 ? 'gutterlight' : 'undying');

  // Safe = no active arena, no live hostile enemy within SAFE_RADIUS of the player and the player was not hurt or
  // attacked in the last SAFE_COOLDOWN seconds (Lanternway travel, shops). Enemies elsewhere in a big hub room do
  // not matter. Without a player in the room, any live hostile enemy counts.
  game.SAFE_RADIUS = 12 * TILE;
  game.SAFE_COOLDOWN = 3;
  game.lastThreatT = -1e9;
  game.noteThreat = function () { game.lastThreatT = game.t; };
  G.events.on('playerHurt', () => game.noteThreat());
  game.hostileNear = function (radius) {
    const room = game.room, p = game.player;
    if (!room) return 0;
    const R = radius == null ? game.SAFE_RADIUS : radius;
    const here = p && p.room === room;
    let n = 0;
    for (const e of room.entities) {
      if (e.dead || e.team !== 'enemy' || !e.hurtable) continue;
      if (!here || Math.hypot(e.cx - p.cx, e.cy - p.cy) <= R) n++;
    }
    return n;
  };
  game.isSafeRoom = function () {
    const room = game.room;
    if (!room) return true;
    if (room.find((e) => e.type === 'arena' && e.active)) return false;
    if (game.t - game.lastThreatT < game.SAFE_COOLDOWN) return false;
    return game.hostileNear() === 0;
  };

  // ------------------------------------------------------------------ saving
  // Player-facing notices when saving does not persist (QA robust): a failed localStorage write (quota/disk full) and
  // storage that is unavailable altogether (site data blocked: the game runs from memory only). Once per streak/session.
  const SAVE_NOTICE = {
    saveFailed: 'Saving failed - progress since the last save may be lost',
    saveUnavailable: 'Saving is unavailable - progress will be lost when this page closes',
    saveConflict: 'This save was changed in another window - return to the title',
  };
  let noticeFailed = false, noticeMemory = false;
  function saveNotice(key) {
    const T = G.Text && G.Text.ui;
    callUI('toast', (T && typeof T[key] === 'string' && T[key]) || SAVE_NOTICE[key]);
  }
  // Another window (tab) changed this session's slot (G.Save 'saveConflict'): this session stops saving so it cannot
  // overwrite the newer progress, and tells the player (on detection, then again at most every 20 s of play when a
  // save is refused). Cleared when a session starts (Continue loads the newer save).
  let conflictNoticeT = -1e9;
  function conflictNotice() {
    if (G.test || game.t - conflictNoticeT < 20) return;
    conflictNoticeT = game.t;
    saveNotice('saveConflict');
  }
  G.events.on('saveConflict', (e) => {
    if (!e || e.slot !== game.slot || !game.progress || !game.player) return;
    if (game.mode === 'boot' || game.mode === 'title') return;
    conflictNotice();
  });
  game.saveNow = function () {
    const p = game.progress;
    if (!p || game.mode === 'boot') return false;
    if (game.room) p.lastRoom = game.room.id;
    if (G.Save && G.Save.isStale && G.Save.isStale(game.slot)) {
      conflictNotice();
      G.events.emit('save', { slot: game.slot, ok: false, persistent: false, stale: true });
      return false;
    }
    const ok = G.Save ? G.Save.save(game.slot, p) : false;
    if (!ok && G.Save && G.Save.isStale && G.Save.isStale(game.slot)) {
      G.events.emit('save', { slot: game.slot, ok: false, persistent: false, stale: true });
      return false; // refused (another window); the 'saveConflict' handler showed the notice
    }
    const persistent = !!(G.Save && !G.Save.memoryOnly);
    if (G.Save && !G.test && game.mode === 'play') {
      if (!ok && !noticeFailed) { noticeFailed = true; saveNotice('saveFailed'); } else if (ok) noticeFailed = false;
      if (!persistent && !noticeMemory) { noticeMemory = true; saveNotice('saveUnavailable'); }
    }
    G.events.emit('save', { slot: game.slot, ok, persistent });
    return ok;
  };

  // ------------------------------------------------------------------ audio per room
  function roomAudio(room) {
    const def = room.def || {};
    const region = room.region || {};
    const regionPreview = def.dev && room.regionId !== def.region;
    const music = (!regionPreview && def.music !== undefined) ? def.music : (region.music || null);
    const amb = (!regionPreview && def.ambience !== undefined) ? def.ambience : (region.ambience || null);
    return { music, amb };
  }
  function applyRoomAudio(room) {
    if (!room) return;
    const a = roomAudio(room);
    if (!bossMusic) audio('music', a.music);
    audio('ambience', a.amb);
  }
  game.startBossMusic = function (trackId) { bossMusic = trackId || 'boss'; audio('music', bossMusic, { fade: 0.6 }); };
  game.endBossMusic = function () { bossMusic = null; applyRoomAudio(game.room); };

  // ------------------------------------------------------------------ player
  function createPlayer() {
    let p = null;
    if (G.Entity && G.Entity.isRegistered('player')) p = G.Entity.create({ type: 'player' });
    if (!p && G.DebugPlayer) p = new G.DebugPlayer({ type: 'debug_player' });
    if (!p) G.reportError(new Error('no player implementation available'), 'createPlayer');
    game.player = p;
    return p;
  }
  function playerMotor() { return game.player && game.player.motor; }
  function setPlayerPos(x, y, keepVelocity) {
    const p = game.player;
    if (!p) return;
    const m = p.motor;
    if (!keepVelocity && typeof p.placeAt === 'function') p.placeAt(x, y);
    else {
      if (m) { m.x = x; m.y = y; }
      p.x = x; p.y = y;
    }
    if (m) {
      m.lastSafe = { x, y };
      m.hazard = null;
      if (!keepVelocity) { m.vx = 0; m.vy = 0; }
    }
  }

  // Find a non-solid spot for a w×h box near (x, y), searching outward.
  function freeSpot(room, x, y, w, h, preferAxis) {
    const Ph = G.Physics;
    if (!Ph.rectSolid(room, x, y, w, h)) return { x, y };
    for (let d = 2; d <= 3 * TILE; d += 2) {
      const tries = preferAxis === 'y'
        ? [[0, -d], [0, d], [-d, 0], [d, 0]]
        : [[-d, 0], [d, 0], [0, -d], [0, d]];
      for (const [ox, oy] of tries) {
        const nx = Math.max(1, Math.min(room.widthPx - w - 1, x + ox));
        const ny = Math.max(1, Math.min(room.heightPx - h - 1, y + oy));
        if (!Ph.rectSolid(room, nx, ny, w, h)) return { x: nx, y: ny };
      }
    }
    return { x, y };
  }

  function specPos(spec, w, h) {
    // ground-standing anchor at a tile
    return { x: (spec.tx + 0.5) * TILE - w / 2, y: (spec.ty + 1) * TILE - h };
  }
  function findSpec(room, type, id) {
    return room.entitySpecs.find((s) => s.props.type === type && (id == null || s.props.id === id)) || null;
  }

  // Place the player for a non-transition room entry. place: {tx,ty} | {x,y} | {sconce} | {lanternway} | {start} | undefined
  function placePlayer(room, place) {
    const p = game.player;
    if (!p) return;
    const w = (p.motor && p.motor.w) || p.w || G.CONST.PLAYER_W;
    const h = (p.motor && p.motor.h) || p.h || G.CONST.PLAYER_H;
    let pos = null;
    const pl = place || {};
    if (pl.x != null && pl.y != null) pos = { x: +pl.x, y: +pl.y };
    else if (pl.tx != null && pl.ty != null) pos = specPos({ tx: +pl.tx, ty: +pl.ty }, w, h);
    else if (pl.sconce) { const s = findSpec(room, 'sconce', pl.sconce); if (s) pos = specPos(s, w, h); }
    else if (pl.lanternway) { const s = findSpec(room, 'lanternway', pl.lanternway); if (s) pos = specPos({ tx: s.tx + 1, ty: s.ty }, w, h); }
    if (!pos) {
      const s = findSpec(room, 'start') || (room.def.spawn ? { tx: room.def.spawn.tx, ty: room.def.spawn.ty } : null) || findSpec(room, 'respawn') || findSpec(room, 'sconce');
      if (s) pos = specPos(s, w, h);
    }
    if (!pos) pos = { x: room.widthPx / 2 - w / 2, y: room.heightPx / 2 - h / 2 };
    pos = freeSpot(room, pos.x, pos.y, w, h, 'y');
    setPlayerPos(pos.x, pos.y, false);
    if (p.motor) { p.motor.fallStartY = pos.y; p.motor.facing = pl.facing || p.motor.facing || 1; }
    if (pl.sconce) {
      const e = room.find((en) => en.type === 'sconce' && (en.persistId === pl.sconce || (en.props && en.props.id === pl.sconce)));
      if (e && typeof e.onRespawn === 'function') safe(() => e.onRespawn(p), 'sconce.onRespawn');
    }
  }

  // ------------------------------------------------------------------ room loading
  game.enterRoom = function (roomId, place) {
    const def = G.World.getRoom(roomId);
    if (!def) { G.reportError(new Error('enterRoom: unknown room "' + roomId + '"'), 'enterRoom'); return false; }
    const prev = game.room;
    const prevRegion = prev ? prev.regionId : null;
    let room;
    try { room = G.World.instantiate(roomId, { flags: P().flags }); } catch (err) { G.reportError(err, 'instantiate ' + roomId); return false; }
    if (prev) for (const e of prev.entities) if (typeof e.onRoomExit === 'function') safe(() => e.onRoomExit(), 'onRoomExit ' + e.type);
    if (G.fx) G.fx.clear();
    if (G.lighting) { G.lighting.invalidateStatic(); G.lighting.beginStep(); }
    if (G.camera) { G.camera.clearZone(); G.camera.stopShake(); }
    game.hitstopTime = 0;
    bossMusic = null;
    game.room = room;
    game.region = room.region;
    if (!game.player) createPlayer();
    const p = game.player;
    if (p) p.room = room;
    room.spawnEntities();
    const pr = P();
    if (pr.wisp && pr.wisp.room === room.id && G.Entity.isRegistered('wisp')) {
      room.spawn({ type: 'wisp', x: pr.wisp.x, y: pr.wisp.y, cinders: pr.wisp.cinders });
    }
    room.rebuildSolids();
    if (place && place.transition) placeFromTransition(room, prev, place.transition);
    else placePlayer(room, place);
    pr.visited[room.id] = true;
    pr.lastRoom = room.id;
    if (G.Art && typeof G.Art.prepareRoom === 'function') safe(() => G.Art.prepareRoom(room), 'Art.prepareRoom');
    if (G.camera) { G.camera.follow(p); G.camera.snap(); }
    applyRoomAudio(room);
    if (prevRegion !== room.regionId) {
      const first = !pr.flags['region:' + room.regionId];
      pr.flags['region:' + room.regionId] = true;
      if (room.regionId !== 'test') callUI('areaCard', room.regionId, first);
      G.events.emit('regionEnter', { region: room.region, first });
    }
    G.events.emit('roomEnter', { room });
    if (p && typeof p.onRoomEnter === 'function') safe(() => p.onRoomEnter(room), 'player.onRoomEnter');
    return true;
  };

  function placeFromTransition(room, prev, t) {
    const p = game.player, m = playerMotor();
    if (!p || !m) return;
    let x = t.gpx - room.gx * TILE - m.w / 2;
    let y = t.gpy - room.gy * TILE - m.h / 2;
    const M = 2;
    if (t.dir === 'E') x = Math.max(x, M);
    if (t.dir === 'W') x = Math.min(x, room.widthPx - m.w - M);
    if (t.dir === 'S') y = Math.max(y, M);
    if (t.dir === 'N') y = Math.min(y, room.heightPx - m.h - M);
    x = Math.max(M, Math.min(room.widthPx - m.w - M, x));
    y = Math.max(M, Math.min(room.heightPx - m.h - M, y));
    const spot = freeSpot(room, x, y, m.w, m.h, t.dir === 'E' || t.dir === 'W' ? 'y' : 'x');
    setPlayerPos(spot.x, spot.y, true);
    m.vx = t.vx; m.vy = t.vy; m.facing = t.facing;
    p.facing = t.facing;
    m.fallStartY = t.fallStartGlobal - room.gy * TILE;
    m.hazard = null;
    m.lastSafe = safeEntryPoint(room, spot.x, spot.y, m);
    if (t.dir === 'N') G.PlayerMotor.exitUpBoost(m);
  }

  // Entry point for hazard respawn: the entry spot itself, or the ground below it for top entries.
  function safeEntryPoint(room, x, y, m) {
    const Ph = G.Physics;
    if (Ph.onGround(room, m)) return { x, y };
    for (let yy = y; yy < room.heightPx - m.h; yy += 4) {
      if (Ph.rectSolid(room, x, yy + 4, m.w, m.h)) {
        const probe = { x, y: yy, w: m.w, h: m.h };
        if (G.PlayerMotor.isSafeGround(room, probe, game.progress ? game.progress.abilities : {})) return { x, y: yy };
        break;
      }
    }
    return { x, y };
  }

  // ------------------------------------------------------------------ transitions
  function checkTransition() {
    const p = game.player, m = playerMotor(), room = game.room;
    if (!p || !m || !room || trans) return;
    const cx = m.x + m.w / 2, cy = m.y + m.h / 2;
    if (cx >= 0 && cy >= 0 && cx < room.widthPx && cy < room.heightPx) return;
    // Neighbour lookup with a point at least 0.5 px outside the room: a centre a few ULPs past the edge (cx = -1e-13)
    // would otherwise round onto the edge itself and find this very room (spurious 'leads nowhere' + push-back).
    const ox = cx < 0 ? Math.min(cx, -0.5) : cx >= room.widthPx ? Math.max(cx, room.widthPx + 0.5) : cx;
    const oy = cy < 0 ? Math.min(cy, -0.5) : cy >= room.heightPx ? Math.max(cy, room.heightPx + 0.5) : cy;
    const gpx = room.gx * TILE + cx, gpy = room.gy * TILE + cy;
    const def = G.World.roomAtGlobal((room.gx * TILE + ox) / TILE, (room.gy * TILE + oy) / TILE);
    if (!def || def.id === room.id) {
      // no neighbour: hold the player inside the boundary
      if (cx < 0) { m.x = -m.w / 2 + 0.5; m.vx = Math.max(0, m.vx); }
      if (cx >= room.widthPx) { m.x = room.widthPx - m.w / 2 - 0.5; m.vx = Math.min(0, m.vx); }
      if (cy < 0) { m.y = -m.h / 2 + 0.5; m.vy = Math.max(0, m.vy); }
      if (cy >= room.heightPx) { m.y = room.heightPx - m.h / 2 - 0.5; m.vy = Math.min(0, m.vy); }
      p.x = m.x; p.y = m.y;
      G.warnOnce('noexit:' + room.id + ':' + Math.round(gpx / TILE) + ',' + Math.round(gpy / TILE), 'room ' + room.id + ': opening at global tile ' + Math.floor(gpx / TILE) + ',' + Math.floor(gpy / TILE) + ' leads nowhere');
      return;
    }
    const dir = cx < 0 ? 'W' : cx >= room.widthPx ? 'E' : cy < 0 ? 'N' : 'S';
    trans = { toId: def.id, dir, gpx, gpy, vx: m.vx, vy: m.vy, facing: m.facing || p.facing || 1,
      fallStartGlobal: room.gy * TILE + m.fallStartY };
    game.mode = 'transition';
    game._sysFade(1, TRANSITION_FADE, finishTransition);
  }
  function finishTransition() {
    const t = trans;
    if (!t) return;
    const ok = game.enterRoom(t.toId, { transition: t });
    trans = null;
    if (game.mode === 'transition') game.mode = 'play';
    if (ok) game.saveNow();
    game._sysFade(0, TRANSITION_FADE);
  }

  // ------------------------------------------------------------------ death & respawn
  game.playerDied = function () {
    if (game.mode === 'dead' || !game.player || !game.room) return;
    const p = game.player, m = playerMotor(), room = game.room;
    game.mode = 'dead';
    game.deathTime = 0;
    respawning = false;
    trans = null;
    const fromHazard = !!(m && m.hazard) || (G.Combat && G.Combat.hazardActive);
    const pos = fromHazard && m && m.lastSafe ? m.lastSafe : { x: m ? m.x : p.x, y: m ? m.y : p.y };
    deathInfo = {
      room: room.id,
      x: Math.max(TILE, Math.min(room.widthPx - TILE, pos.x + p.w / 2)),
      y: Math.max(TILE, Math.min(room.heightPx - TILE, pos.y + p.h / 2)),
    };
    const cx = p.x + p.w / 2, cy = p.y + p.h / 2;
    if (G.fx) {
      G.fx.burst('wax', cx, cy, { count: 18, color: '#efe6d2', speed: 380 });
      G.fx.burst('smoke', cx, cy, { count: 10 });
      G.fx.burst('flash', cx, cy, { r: 120, color: '#9fd6ff' });
    }
    G.sfx('player_die');
    audio('stinger', 'death'); // ducks the region/boss music for its length (G.Audio stinger contract)
    game.shake(12, 0.4);
    game.flash('rgba(255,255,255,0.55)', 0.25);
    G.events.emit('playerDied', {});
  };

  function respawn() {
    const pr = P();
    if (deathInfo) pr.wisp = { room: deathInfo.room, x: deathInfo.x, y: deathInfo.y, cinders: pr.cinders };
    pr.cinders = 0;
    pr.ember = 0;
    pr.health = game.maxHealth();
    deathInfo = null;
    locks.clear();
    if (G.Combat) G.Combat.resetHazard();
    const p = game.player;
    if (p && typeof p.respawn === 'function') safe(() => p.respawn(), 'player.respawn');
    else createPlayer();
    game.mode = 'play';
    game.deathTime = 0;
    goToRespawnPoint();
    respawning = false;
    game.saveNow();
    game._sysFade(0, 0.6);
    G.events.emit('respawn', {});
  }

  function startLocation() {
    if (G.World.getRoom('sh_01')) return { room: 'sh_01', place: { start: true } };
    const dev = G.World.firstDevRoom();
    if (dev) return { room: dev, place: {} };
    const any = G.World.listRooms()[0];
    return any ? { room: any, place: {} } : null;
  }
  function goToRespawnPoint() {
    const pr = P();
    if (pr.sconce && pr.sconce.room && G.World.getRoom(pr.sconce.room)) {
      game.enterRoom(pr.sconce.room, { sconce: pr.sconce.id });
      return;
    }
    const s = startLocation();
    if (s) game.enterRoom(s.room, s.place);
    else G.reportError(new Error('no rooms defined'), 'respawn');
  }

  game.rest = function (sconce) {
    const pr = P();
    const room = (sconce && sconce.room) || game.room;
    const id = sconce ? (sconce.persistId || (sconce.props && sconce.props.id) || sconce.id) : null;
    if (room && id) pr.sconce = { room: room.id, id };
    pr.health = game.maxHealth();
    game.saveNow();
    G.events.emit('rest', { sconce });
  };

  // ------------------------------------------------------------------ flow
  function resetSession() {
    trans = null; respawning = false; deathInfo = null; bossMusic = null;
    locks.clear();
    game.room = null; game.region = null; game.player = null;
    game.hitstopTime = 0; game.deathTime = 0; game.lastThreatT = -1e9;
    conflictNoticeT = -1e9;
    fallbackPaused = false; fallbackEnding = null;
    pendingPause.clear();
    if (G.fx) G.fx.clear();
    if (G.Combat) G.Combat.resetHazard();
    if (G.camera) { G.camera.follow(null); G.camera.clearZone(); G.camera.stopShake(); }
    // Screens/overlays from the previous session (an open item card, toasts, prompts) must not leak into the new one.
    callUI('closeAll', false);
    callUI('clearOverlays');
  }

  game.newGame = function (slot) {
    resetSession();
    game.slot = slot | 0;
    if (G.Save && G.Save.claim) G.Save.claim(game.slot); // from now on, refuse to overwrite another window's writes
    game.progress = defaultProgress(game.slot);
    fallbackTitle = false;
    const begin = () => {
      try {
        const s = startLocation();
        if (!s) throw new Error('newGame: no rooms defined');
        createPlayer();
        game.mode = 'play';
        game.enterRoom(s.room, s.place);
        game.saveNow();
        G.events.emit('newGame', { slot: game.slot });
      } catch (err) { startFailed(err, 'newGame'); }
    };
    game.mode = 'title';
    if (!G.test && UIfn('playIntro')) callUI('playIntro', begin);
    else begin();
  };

  game.continueGame = function (slot) {
    const data = G.Save ? G.Save.load(slot | 0) : null;
    if (!data) { game.newGame(slot); return; }
    resetSession();
    fallbackTitle = false;
    game.slot = slot | 0;
    try {
      game.progress = migrate(data, game.slot);
      game.progress.health = game.maxHealth();
      createPlayer();
      game.mode = 'play';
      goToRespawnPoint();
      game.saveNow();
      G.events.emit('continue', { slot: game.slot });
    } catch (err) { startFailed(err, 'continueGame'); }
  };

  // Starting a session threw (e.g. a save the migration could not make sense of): never leave a black screen with
  // no UI (resetSession already closed the title) — report it and reopen the title, where the slot can be erased.
  function startFailed(err, where) {
    G.reportError(err, where);
    resetSession();
    game.progress = null;
    game.fadeAlpha = 0; game.sysFadeAlpha = 0;
    pubFade.active = sysFade.active = false; pubFade.cb = sysFade.cb = null;
    game.openTitle();
  }

  game.openTitle = function () {
    game.mode = 'title';
    if (UIfn('openTitle')) { fallbackTitle = false; callUI('openTitle'); }
    else { fallbackTitle = true; audio('music', 'title'); audio('ambience', null); }
  };

  game.quitToTitle = function () {
    if (game.progress && game.room && game.mode !== 'ending') {
      if (game.mode === 'dead' && deathInfo) { // keep the wisp if quitting mid-death
        const pr = P();
        pr.wisp = { room: deathInfo.room, x: deathInfo.x, y: deathInfo.y, cinders: pr.cinders };
        pr.cinders = 0;
      }
      game.saveNow();
    }
    resetSession();
    game.fadeAlpha = 0; game.sysFadeAlpha = 0;
    pubFade.active = sysFade.active = false; pubFade.cb = sysFade.cb = null;
    // The title draws no room art: release the room-art LRU (up to ~64 Mpx); Continue rebuilds behind its fade.
    if (G.Art && typeof G.Art.clearCaches === 'function') safe(() => G.Art.clearCaches(), 'Art.clearCaches');
    game.openTitle();
  };

  // Ending: marks the save complete, plays G.UI.playEnding, then returns to the title.
  // The save keeps the finished state (slot summary: complete, this ending); Continue rewinds it to just before the
  // final fight (see rewindFinishedRun), so the other ending stays reachable on the same save.
  game.finishGame = function (endingId) {
    const pr = P();
    const id = endingId || game.endingId();
    pr.completed = true;
    pr.ending = id;
    if (!Array.isArray(pr.endingsSeen)) pr.endingsSeen = [];
    if (pr.endingsSeen.indexOf(id) < 0) pr.endingsSeen.push(id);
    game.saveNow();
    game.mode = 'ending';
    const done = () => game.quitToTitle();
    if (UIfn('playEnding')) callUI('playEnding', id, done);
    else fallbackEnding = { id, t: 0, done };
  };

  game.travel = function (lanternwayId) {
    const found = G.World.findEntitySpecs((pr) => pr.type === 'lanternway' && pr.id === lanternwayId);
    if (!found.length) { G.reportError(new Error('travel: no lanternway "' + lanternwayId + '"'), 'travel'); return false; }
    const target = found[0].roomId;
    game.lockPlayer('travel');
    G.sfx('lanternway');
    game._sysFade(1, 0.45, () => {
      game.enterRoom(target, { lanternway: lanternwayId });
      game.saveNow();
      game._sysFade(0, 0.45, () => game.unlockPlayer('travel'));
    });
    return true;
  };

  // ------------------------------------------------------------------ fixed step
  function uiBlocking() {
    if (fallbackPaused) return true;
    const f = UIfn('isBlocking');
    if (!f) return false;
    return !!safe(f, 'UI.isBlocking');
  }
  game.uiBlocking = uiBlocking;

  // Auto-pause requests (window blur / tab hidden / the active gamepad unplugged: main.js). Honoured at once when the
  // game can pause; otherwise (death, room transition, a blocking card or dialogue) kept pending and honoured on the
  // first step where play can pause again. Regaining focus cancels a pending focus-loss request (main.js).
  const pendingPause = new Set();
  const canAutoPause = () => game.mode === 'play' && !uiBlocking();
  function openPauseNow() { if (UIfn('openPause')) callUI('openPause'); else fallbackPaused = true; }
  game.requestAutoPause = function (reason) {
    if (canAutoPause()) { pendingPause.clear(); openPauseNow(); return true; }
    if (game.mode === 'play' || game.mode === 'transition' || game.mode === 'dead') pendingPause.add(reason || 'blur');
    return false;
  };
  game.cancelAutoPause = function (reason) { if (reason) pendingPause.delete(reason); else pendingPause.clear(); };
  game.autoPausePending = () => [...pendingPause];

  function handleMenuKeys() {
    const inp = G.input;
    const p = game.player;
    if (inp.pressed('pause')) {
      inp.consume('pause');
      if (UIfn('openPause')) callUI('openPause'); else fallbackPaused = true;
      return;
    }
    if (game.isLocked() || trans) return;
    if (inp.pressed('map') && UIfn('openMap')) { inp.consume('map'); callUI('openMap'); return; }
    if (inp.pressed('inventory') && UIfn('openInventory')) { inp.consume('inventory'); callUI('openInventory', { atSconce: !!(p && p.resting) }); }
  }

  function updateEntities(room, dt, noContact) {
    const list = room.entities;
    const n = list.length;
    for (let i = 0; i < n; i++) {
      const e = list[i];
      if (e.dead) continue;
      e.t = (e.t || 0) + dt;
      try { e.update(dt); } catch (err) {
        G.reportError(err, 'update ' + e.type + (e.kind ? ':' + e.kind : ''));
        e.dead = true;
      }
    }
    if (!noContact && game.mode === 'play' && game.player) G.Combat.checkContact(room, game.player);
    room.removeDead();
    room.rebuildSolids();
  }

  function updateWorldFx(dt) {
    if (G.camera) G.camera.update(dt);
    if (G.fx) G.fx.update(dt);
    if (game.room && G.Art && typeof G.Art.updateAtmosphere === 'function') safe(() => G.Art.updateAtmosphere(game.room, G.camera, dt), 'Art.updateAtmosphere');
  }

  function stepPlay(dt, blockingBefore) {
    if (uiBlocking()) return;
    if (!blockingBefore) handleMenuKeys();
    if (uiBlocking()) return;
    const room = game.room, p = game.player;
    if (!room) return;
    if (game.hitstopTime > 0) {
      game.hitstopTime = Math.max(0, game.hitstopTime - dt);
      updateWorldFx(dt);
      return;
    }
    room.time += dt;
    if (G.lighting) G.lighting.beginStep();
    if (p) {
      p.t = (p.t || 0) + dt;
      try { p.update(dt); } catch (err) { G.reportError(err, 'player.update'); }
      const m = p.motor;
      if (m && m.hazard && game.mode === 'play' && G.Combat && !G.Combat.hazardActive) G.Combat.hazardPlayer(m.hazard);
    }
    if (game.room !== room) return; // the player changed rooms during its update
    updateEntities(room, dt, false);
    updateWorldFx(dt);
    if (game.mode === 'play') checkTransition();
  }

  function stepDead(dt) {
    game.deathTime += dt;
    const room = game.room;
    if (room && !uiBlocking()) {
      if (G.lighting) G.lighting.beginStep();
      updateEntities(room, dt, true);
    }
    updateWorldFx(dt);
    if (game.deathTime >= 1.1 && !respawning) {
      respawning = true;
      game._sysFade(1, 0.7, respawn);
    }
  }

  function stepFallback() {
    const inp = G.input;
    if (game.mode === 'title' && fallbackTitle && inp.anyPressed()) {
      inp.consumeAll();
      fallbackTitle = false;
      if (G.Save && G.Save.exists(0)) game.continueGame(0); else game.newGame(0);
    } else if (fallbackPaused && (inp.pressed('pause') || inp.pressed('cancel') || inp.pressed('confirm'))) {
      inp.consumeAll();
      fallbackPaused = false;
    }
    if (fallbackEnding) {
      fallbackEnding.t += DT;
      if (fallbackEnding.t > 4 || (fallbackEnding.t > 1 && inp.anyPressed())) { const d = fallbackEnding.done; fallbackEnding = null; d(); }
    }
  }

  game.step = function () {
    const dt = DT;
    G.input.update();
    if (G.debug && G.debug._afterInput) G.debug._afterInput();
    game.t += dt;
    if (pendingPause.size && canAutoPause()) { pendingPause.clear(); openPauseNow(); }
    const blockingBefore = uiBlocking();
    if (G.UI && typeof G.UI.update === 'function') safe(() => G.UI.update(dt), 'UI.update');
    stepFallback();
    tickFade(pubFade, dt);
    tickFade(sysFade, dt);
    if (flashTime > 0) {
      flashTime = Math.max(0, flashTime - dt);
      const k = flashDur > 0 ? flashTime / flashDur : 0;
      game.flashAlpha = k * k;
    } else game.flashAlpha = 0;
    switch (game.mode) {
      case 'play': stepPlay(dt, blockingBefore); break;
      case 'transition': updateWorldFx(dt); break;
      case 'dead': stepDead(dt); break;
      default: break;
    }
    const pr = game.progress;
    if (pr && (game.mode === 'play' || game.mode === 'transition' || game.mode === 'dead') && !uiBlocking()) pr.playTime += dt;
  };

  // Real-time driver: accumulates elapsed seconds into fixed steps (max 4 per frame), then renders.
  // Frame pacing (QA robust): at a 60 Hz refresh every elapsed is ~DT, so a remainder sitting on the step boundary
  // turned rAF timestamp jitter (coarsened to 0.1 ms) into frames of 0 or 2 steps (repeated / skipped images).
  // Elapsed times within FRAME_SNAP of a whole number of steps count as exactly that many, and the accumulator is
  // seeded half a step in (resetClock), so the remainder stays mid-step. Rendering only follows a step (the renderer
  // draws game state, which only changes in a step): no repeated draws on 120/144 Hz displays. requestRender()
  // forces the next frame's draw (first frame, resize, visibility/context restore).
  const FRAME_SNAP = 0.001;
  let needsRender = true;
  game.resetClock = function () { accumulator = DT / 2; needsRender = true; };
  game.requestRender = function () { needsRender = true; };
  game.frame = function (elapsed) {
    let e = Math.min(0.25, Math.max(0, +elapsed || 0));
    const k = Math.round(e / DT);
    if (k >= 1 && k <= 4 && Math.abs(e - k * DT) < FRAME_SNAP) e = k * DT;
    accumulator += e;
    let steps = 0;
    while (accumulator >= DT - 1e-9 && steps < 4) { game.step(); accumulator -= DT; steps++; }
    if (accumulator < 0) accumulator = 0;
    if (accumulator > DT) accumulator = DT; // drop the backlog instead of spiralling
    if (G.Render && (steps > 0 || needsRender)) { needsRender = false; G.Render.frame(); }
    return steps;
  };

  // ------------------------------------------------------------------ boot flow (called by main.js)
  game.boot = function () {
    const q = G.params || {};
    game.god = !!G.test && q.god === '1'; // test-only: a release run ignores ?god=1 (G.debug.god() still works)
    if (G.test) {
      game.newGame(0);
      if (q.room && G.World.getRoom(q.room)) {
        const place = (q.tx != null && q.ty != null) ? { tx: +q.tx, ty: +q.ty } : {};
        game.enterRoom(q.room, place);
      } else if (q.room) G.reportError(new Error('?room=' + q.room + ' does not exist'), 'boot');
      else if (q.testrooms === '1') {
        const dev = G.World.firstDevRoom();
        if (dev && game.room && game.room.id !== dev) game.enterRoom(dev, {});
      }
      if (q.abilities) {
        const list = q.abilities === 'all' ? ABILITIES : q.abilities.split(',');
        for (const a of list) if (ABILITIES.indexOf(a.trim()) >= 0) P().abilities[a.trim()] = true;
      }
    } else game.openTitle();
  };

  // ------------------------------------------------------------------ fallback UI (no G.UI module)
  game.drawFallbackUI = function (ctx) {
    const t = game.t;
    ctx.save();
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    if (game.mode === 'title' && fallbackTitle) {
      ctx.fillStyle = '#05060a';
      ctx.fillRect(0, 0, W, H);
      const fx = W / 2, fy = H * 0.36;
      if (G.fx) {
        G.fx.glowAt(ctx, fx, fy - 70, 90 + Math.sin(t * 7) * 6, '#4fb0ff', 0.7);
        G.fx.glowAt(ctx, fx, fy - 74, 34 + Math.sin(t * 11) * 3, '#e8f6ff', 0.8);
      }
      ctx.fillStyle = '#e9e4d8';
      ctx.font = '64px Georgia, serif';
      ctx.fillText('GUTTERLIGHT', fx, fy + 20);
      ctx.globalAlpha = 0.55 + 0.35 * Math.sin(t * 2.5);
      ctx.font = '22px Georgia, serif';
      ctx.fillText('press any key', fx, H * 0.68);
      ctx.globalAlpha = 1;
    } else if (game.mode === 'play' || game.mode === 'transition' || game.mode === 'dead') {
      const pr = game.progress;
      if (pr) {
        const mh = game.maxHealth();
        for (let i = 0; i < mh; i++) {
          const x = 120 + i * 30, y = 52;
          ctx.fillStyle = i < pr.health ? '#e9e4d8' : 'rgba(233,228,216,0.18)';
          ctx.fillRect(x - 8, y - 10, 16, 24);
          if (i < pr.health && G.fx) G.fx.glowAt(ctx, x, y - 16, 12, '#4fb0ff', 0.9);
        }
        const em = game.emberMax();
        ctx.fillStyle = 'rgba(255,255,255,0.12)';
        ctx.beginPath(); ctx.arc(64, 60, 34, 0, Math.PI * 2); ctx.fill();
        ctx.fillStyle = '#8fd0ff';
        const k = em > 0 ? pr.ember / em : 0;
        ctx.beginPath(); ctx.arc(64, 60, 34 * Math.sqrt(k), 0, Math.PI * 2); ctx.fill();
        ctx.textAlign = 'left';
        ctx.fillStyle = '#e9d8b0';
        ctx.font = '20px Georgia, serif';
        ctx.fillText('◆ ' + pr.cinders, 112, 92);
      }
      if (fallbackPaused) {
        ctx.fillStyle = 'rgba(0,0,0,0.6)';
        ctx.fillRect(0, 0, W, H);
        ctx.textAlign = 'center';
        ctx.fillStyle = '#e9e4d8';
        ctx.font = '42px Georgia, serif';
        ctx.fillText('Paused', W / 2, H / 2);
      }
    } else if (fallbackEnding) {
      ctx.fillStyle = '#000';
      ctx.fillRect(0, 0, W, H);
      ctx.fillStyle = '#e9e4d8';
      ctx.font = '36px Georgia, serif';
      ctx.fillText(fallbackEnding.id === 'gutterlight' ? 'Every light gutters.' : 'And the light did not end.', W / 2, H / 2);
    }
    ctx.restore();
  };

  // internal state for debug/tests
  game._internal = {
    get transition() { return trans; },
    get fallbackTitle() { return fallbackTitle; },
    get fallbackPaused() { return fallbackPaused; },
    set fallbackPaused(v) { fallbackPaused = !!v; },
    get bossMusic() { return bossMusic; },
    migrate, startLocation,
  };

  G.game = game;
})();
