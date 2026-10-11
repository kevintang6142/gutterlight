#!/usr/bin/env node
// tools/ui_selftest.js — headless self-test of the UI module (src/ui/*).
// Opens every screen through the G.UI API with fake progress states (empty, mid-game, complete), navigates with
// virtual input, asserts behaviour (flow, blocking, purchases, equipping, settings, callbacks) and screenshots
// each state to test-output/ui/*.png. No-spoiler audit (T.capture/T.invAudit): every string and icon drawn is
// recorded; inventory/map/cards/Lanternway must never draw unowned names/icons, placeholders or "x / total".
//
//   node tools/ui_selftest.js            # everything
//   node tools/ui_selftest.js map shop   # only scenarios whose name contains one of the filters
//
// Exit code 1 if a check fails or a UI error (src/ui or a 'UI.*' report) occurs. Errors that come from other
// modules are listed separately as "foreign" (not failures of this module).
'use strict';
const path = require('path');
const fs = require('fs');
const { openGame, closeAll, ROOT } = require('./lib/browser');

const OUT = path.join(ROOT, 'test-output', 'ui');
const filters = process.argv.slice(2);
const results = [];
const shots = [];

function check(name, ok, detail) {
  results.push({ name, ok: !!ok, detail });
  console.log((ok ? '  ok   ' : '  FAIL ') + name + (detail !== undefined && !ok ? '  -> ' + JSON.stringify(detail) : ''));
}

// ------------------------------------------------------------------ in-page helpers (stringified)
function pageHelpers() {
  const T = {};
  window.T = T;
  T.step = (n) => { for (let i = 0; i < (n || 1); i++) G.game.step(); };
  T.press = (action, after) => {
    const a = Array.isArray(action) ? action : [action];
    const v = {}; for (const x of a) v[x] = true;
    G.input.setVirtual(v); G.game.step(); G.input.clearVirtual(); G.game.step();
    T.step(after === undefined ? 2 : after);
  };
  T.hold = (action, frames) => { G.input.setVirtual({ [action]: true }); T.step(frames); G.input.clearVirtual(); G.game.step(); };
  T.ui = () => G.UI.screenNames();
  T.top = () => { const s = G.UI.top(); return s ? s.name : null; };
  T.reset = () => {
    G.UI.closeAll(false);
    if (G.UI.clearOverlays) G.UI.clearOverlays();
    G.input.clearVirtual();
    if (G.game.mode !== 'play') { G.game.newGame(0); }
    G.game.fadeAlpha = 0;
    T.step(2);
  };

  // ---- synthetic world (only when no real rooms exist in this region range) ----
  function genRoom(id, region, gx, gy, cols, rows, seed, marks) {
    const rng = new G.RNG(seed);
    const g = [];
    for (let r = 0; r < rows; r++) g.push(new Array(cols).fill('#'));
    const floorAt = [], ceilAt = [];
    const ph = rng.range(0, 6), ph2 = rng.range(0, 6);
    for (let c = 0; c < cols; c++) {
      const f = rows - 3 - Math.round(1.6 + 1.6 * Math.sin(c * 0.19 + ph) + Math.sin(c * 0.47 + ph2) * 0.7);
      const ce = 2 + Math.round(1.4 + 1.4 * Math.sin(c * 0.13 + ph2) + (rows > 18 ? 0 : 0));
      floorAt[c] = Math.min(rows - 3, Math.max(ce + 4, f));
      ceilAt[c] = ce;
      for (let r = ce; r <= floorAt[c]; r++) g[r][c] = '.';
    }
    for (let c = 0; c < cols; c++) { g[rows - 1][c] = '#'; g[0][c] = '#'; }
    for (let r = 0; r < rows; r++) { g[r][0] = '#'; g[r][cols - 1] = '#'; }
    // side openings at floor level
    for (const c of [0, cols - 1]) { const fc = c === 0 ? 1 : cols - 2; const f = floorAt[fc]; for (let r = f - 2; r <= f; r++) g[r][c] = '.'; }
    // platforms and a ledge for tall rooms
    if (rows >= 27) {
      for (let k = 0; k < 3; k++) { const r = 6 + k * 6, c0 = 4 + Math.floor(rng.range(0, cols - 14)); for (let c = c0; c < c0 + 7; c++) if (g[r][c] === '.') g[r][c] = '='; }
      for (let c = Math.floor(cols * 0.6); c < Math.floor(cols * 0.6) + 5; c++) for (let r = rows - 10; r <= rows - 9; r++) g[r][c] = '#';
    } else {
      const c0 = 6 + Math.floor(rng.range(0, cols - 18));
      const r = Math.max(ceilAt[c0] + 3, floorAt[c0] - 4);
      for (let c = c0; c < c0 + 6; c++) if (g[r][c] === '.') g[r][c] = '=';
    }
    // a small pool in a dip
    // (kept clear of the spawn column and of entity marks: water is a hazard without the Oilcloak)
    const poolC0 = Math.floor(cols * 0.72);
    const poolFree = (marks || []).every((m) => m.c < poolC0 - 3 || m.c > poolC0 + 7) && Math.floor(cols / 2) - 3 < poolC0 - 4;
    if (poolFree && rng.chance(0.5)) {
      const c0 = poolC0;
      for (let c = c0; c < c0 + 5; c++) { const f = floorAt[c]; g[f][c] = '~'; g[f + 1][c] = '#'; }
    }
    const legend = {};
    let li = 0;
    for (const m of marks || []) {
      const ch = 'abcdefghijklmnopqrstuvwxyz'[li++];
      const c = Math.max(2, Math.min(cols - 3, m.c));
      legend[ch] = m.props;
      g[floorAt[c]][c] = ch;
      if (g[floorAt[c] + 1][c] !== '#') g[floorAt[c] + 1][c] = '#';
    }
    const spawnC = Math.floor(cols / 2) - 3;
    G.World.defineRoom({ id, region, gx, gy, tiles: g.map((row) => row.join('')), legend, name: id });
    return { tx: spawnC, ty: floorAt[spawnC] };
  }
  T.buildWorld = () => {
    if (T.world) return T.world;
    // data-only mode: the synthetic world replaces the shipped region/arena rooms (they reuse region ids,
    // Lanternway post ids and the map would count them); dev rooms stay.
    for (const id of G.World.listRooms({ dev: false })) G.World.removeRoom(id);
    const B = 1800;
    const spawns = {};
    const defs = [
      ['sh_91', 'shore', 0, B, 64, 18, [{ c: 40, props: { type: 'pickup', id: 'sh_hw91', item: 'heartwax' } }]],
      ['sh_92', 'shore', 64, B, 48, 18, [{ c: 20, props: { type: 'sconce', id: 'sh_sconce_z' } }]],
      ['ll_91', 'lastlight', 112, B, 64, 18, [{ c: 14, props: { type: 'npc', npc: 'pell' } }, { c: 26, props: { type: 'npc', npc: 'quill' } }, { c: 40, props: { type: 'sconce', id: 'll_sconce_z' } }, { c: 52, props: { type: 'lanternway', id: 'lastlight' } }]],
      ['ll_92', 'lastlight', 176, B - 9, 32, 27, [{ c: 10, props: { type: 'npc', npc: 'bramm' } }]],
      ['mb_91', 'meltbloom', 0, B + 18, 48, 18, []],
      ['gw_94', 'guttered', 48, B + 27, 64, 18, [{ c: 30, props: { type: 'pickup', id: 'gw_sig_flare_trail', item: 'sigil', sigil: 'flare_trail' } }]],
      ['gw_91', 'guttered', 112, B + 18, 32, 36, [{ c: 8, props: { type: 'sconce', id: 'gw_sconce_z' } }]],
      ['gw_92', 'guttered', 144, B + 18, 64, 18, [{ c: 12, props: { type: 'lanternway', id: 'guttered' } }, { c: 46, props: { type: 'npc', npc: 'wren', stage: 1 } }]],
      ['gw_93', 'guttered', 208, B + 18, 48, 27, [{ c: 30, props: { type: 'pickup', id: 'spark_gw', item: 'spark' } }]],
      ['gw_95', 'guttered', 144, B + 36, 32, 18, [{ c: 16, props: { type: 'sealdoor', id: 'gw_door_z' } }]],
      ['dn_91', 'nave', 112, B + 54, 64, 27, [{ c: 20, props: { type: 'pickup', id: 'dn_hw91', item: 'heartwax' } }, { c: 44, props: { type: 'sconce', id: 'dn_sconce_z' } }]],
      ['dn_92', 'nave', 176, B + 63, 48, 18, []],
      ['dn_93', 'nave', 224, B + 45, 32, 36, []],
    ];
    for (const d of defs) if (!G.World.getRoom(d[0])) spawns[d[0]] = genRoom(d[0], d[1], d[2], d[3], d[4], d[5], d[2] * 7 + d[3], d[6]);
    T.world = { spawns, ids: defs.map((d) => d[0]) };
    return T.world;
  };

  // ---- progress fixtures ----
  T.fixture = (kind) => {
    const p = G.game.progress;
    const fresh = G.game.defaultProgress(p.slot || 0);
    for (const k of Object.keys(p)) delete p[k];
    Object.assign(p, fresh);
    if (kind === 'empty') return p;
    if (kind === 'mid') {
      Object.assign(p.abilities, { bolt: true, dash: true, grip: true });
      p.heartShards = 3; p.maxHealth = 6; p.health = 4; p.urns = 1; p.kilnGlass = 1; p.brandLevel = 1;
      p.sparks = ['spark_mb', 'spark_sf']; p.seals = ['bell']; p.notches = 4; p.ember = 54; p.cinders = 640;
      p.sigils = ['waymoth', 'swift_brand', 'heartwax', 'bright_bolt', 'thorned_wax', 'cinder_lure', 'steadfast'];
      p.equipped = ['waymoth', 'swift_brand'];
      p.bosses = { effigy: true, sable1: true, matron: true }; p.playTime = 4321;
      p.charts = { guttered: true, nave: true }; p.lanterns = { lastlight: true, guttered: true, nave: true };
      p.visited = { sh_91: true, sh_92: true, ll_91: true, ll_92: true, mb_91: true, gw_91: true, gw_92: true, gw_94: true, gw_95: true };
      return p;
    }
    if (kind === 'complete') {
      G.debug.give('everything');
      const q = G.game.progress;
      q.health = G.game.maxHealth(); q.ember = G.game.emberMax(); q.cinders = 12345; q.playTime = 50000;
      for (const id of Object.keys(G.Items ? G.Items.sigils : {})) if (q.sigils.indexOf(id) < 0) q.sigils.push(id);
      q.equipped = []; G.game.equip('heartwax'); G.game.equip('bright_bolt'); G.game.equip('waymoth');
      q.lanterns = { lastlight: true, guttered: true, meltbloom: true, nave: true, chandlery: true, mothwood: true, rime: true };
      q.charts = { guttered: true, meltbloom: true, flue: true, nave: true, chandlery: true, mothwood: true, rime: true };
      for (const id of T.world ? T.world.ids : []) q.visited[id] = true;
      return q;
    }
    return p;
  };
  // ---- no-spoiler audit: capture every string drawn (fillText/strokeText/UI.spacedText) and every icon drawn
  // (UI.icons.item/sigil/ability) during one G.debug.render() ----
  T.capture = (fn) => {
    const out = { strs: [], icons: [] };
    const CP = CanvasRenderingContext2D.prototype, I = G.UI.icons;
    const f0 = CP.fillText, s0 = CP.strokeText, sp0 = G.UI.spacedText, it0 = I.item, sg0 = I.sigil, ab0 = I.ability;
    CP.fillText = function (txt) { out.strs.push(String(txt)); return f0.apply(this, arguments); };
    CP.strokeText = function (txt) { out.strs.push(String(txt)); return s0.apply(this, arguments); };
    G.UI.spacedText = function (ctx, txt) { out.strs.push(String(txt)); return sp0.apply(this, arguments); };
    I.item = function (ctx, kind) { out.icons.push('item:' + kind); return it0.apply(this, arguments); };
    I.sigil = function (ctx, id, x, y, size, o) { out.icons.push((o && o.empty ? 'emptysigil:' : 'sigil:') + id); return sg0.apply(this, arguments); };
    I.ability = function (ctx, id) { out.icons.push('ability:' + id); return ab0.apply(this, arguments); };
    try { if (fn) fn(); G.debug.render(); } finally { CP.fillText = f0; CP.strokeText = s0; G.UI.spacedText = sp0; I.item = it0; I.sigil = sg0; I.ability = ab0; }
    return out;
  };
  T.SLASH = /\d\s*\/\s*\d/;              // any "x / y" counter
  T.names = () => {
    const tx = G.UI.text;
    return {
      ab: G.Items.order.abilities.map((id) => [id, tx('abilities.' + id + '.name', id)]),
      sg: Object.keys(G.Items.sigils).map((id) => [id, tx('sigils.' + id + '.name', id)]),
      relic: [['heartwax', tx('items.heartwax.name', 'Heartwax Shard')], ['urn', tx('items.urn.name', 'Ember Urn')], ['kiln_glass', tx('items.kiln_glass.name', 'Kiln Glass')],
        ['spark', tx('items.spark.name', "Chandler's Spark")], ['seal', tx('ui.seals', 'Warden Seals')]],
    };
  };
  // render the open inventory with nothing and then every cell selected; report leaks
  T.invAudit = () => {
    const s = G.UI.top(), p = G.game.progress, N = T.names();
    const strs = new Set(), icons = new Set();
    const add = (c) => { c.strs.forEach((x) => strs.add(x)); c.icons.forEach((x) => icons.add(x)); };
    const sel0 = s.sel;
    s.sel = -1; add(T.capture());
    for (let i = 0; i < s.cells.length; i++) { s.sel = i; add(T.capture()); }
    s.sel = sel0;
    const own = G.UI.inventoryOwned(p);
    const unAb = N.ab.filter(([id]) => !p.abilities[id]), unSg = N.sg.filter(([id]) => p.sigils.indexOf(id) < 0);
    const unRelic = N.relic.filter(([id]) => own.relics.indexOf(id) < 0);
    const all = [...strs];
    return {
      cells: s.cells.map((c) => c.kind + ':' + c.id),
      slash: all.filter((x) => T.SLASH.test(x)),
      unownedNames: all.filter((x) => unAb.some(([, n]) => n === x) || unSg.some(([, n]) => n === x) || unRelic.some(([, n]) => n === x)),
      banned: all.filter((x) => /\?\?\?|Not yet found/.test(x) || x.indexOf(G.UI.text('ui.completion', 'Completion')) === 0),
      unownedIcons: [...icons].filter((k) => /^emptysigil:/.test(k) || (/^ability:/.test(k) && !p.abilities[k.slice(8)]) || (/^sigil:/.test(k) && p.sigils.indexOf(k.slice(6)) < 0)
        || (/^item:seal_/.test(k) && (p.seals || []).indexOf(k.slice(10)) < 0)),
      sealIcons: [...icons].filter((k) => /^item:seal_/.test(k)).sort().join(','),
      sections: all.filter((x) => x === G.UI.text('ui.abilities', 'Abilities') || x === G.UI.text('ui.relics', 'Relics')),
    };
  };
  T.enter = (roomId) => {
    const s = T.world && T.world.spawns[roomId];
    G.game.enterRoom(roomId, s ? { tx: s.tx, ty: s.ty } : {});
    T.step(3);
  };
}

// ------------------------------------------------------------------ scenarios
const scenarios = [];
const scenario = (name, fn) => scenarios.push({ name, fn });

async function snap(page, name) {
  await page.evaluate(() => G.debug.render());
  const file = path.join(OUT, name + '.png');
  await page.screenshot({ path: file });
  shots.push(path.relative(ROOT, file));
}
const ev = (page, fn, ...args) => page.evaluate(fn, ...args);

scenario('title', async (page) => {
  await ev(page, () => {
    T.reset();
    G.game.quitToTitle();
    G.UI._titleSkipGate = false;
    G.UI.openTitle();
    // saves written after quitting (quit saves the running session to slot 0)
    for (let i = 0; i < 3; i++) G.Save.remove(i);
    const a = G.game.defaultProgress(0);
    Object.assign(a, { playTime: 5025, maxHealth: 7, health: 7, cinders: 845, heartShards: 4, lastRoom: 'gw_92' });
    a.abilities.bolt = a.abilities.dash = true; a.visited = { gw_92: true };
    G.Save.save(0, a);
    const c = G.game.defaultProgress(2);
    Object.assign(c, { completed: true, ending: 'gutterlight', playTime: 40000, cinders: 3120, lastRoom: 'll_91' });
    G.Save.save(2, c);
    T.step(80);
  });
  check('title: opens at the gate', (await ev(page, () => G.UI.top().view)) === 'gate');
  check('title: mode is title', (await ev(page, () => G.game.mode)) === 'title');
  await snap(page, '01_title_gate');
  await ev(page, () => { T.press('jump'); T.step(50); });
  check('title: any key opens the menu', (await ev(page, () => G.UI.top().view)) === 'menu');
  check('title: Continue listed when saves exist', (await ev(page, () => G.UI.top().items[0].id)) === 'continue');
  await snap(page, '02_title_menu');
  await ev(page, () => { T.press('confirm'); T.step(40); });
  check('title: Continue opens slots in continue mode', (await ev(page, () => [G.UI.top().view, G.UI.top().slotMode].join())) === 'slots,continue');
  await snap(page, '03_title_slots_continue');
  // continue mode skips the empty slot
  await ev(page, () => T.press('down'));
  check('title: navigation skips empty slots in continue mode', (await ev(page, () => G.UI.top().slotSel)) === 2);
  await ev(page, () => { T.press('cancel'); T.step(30); T.press('down'); T.press('confirm'); T.step(40); });
  check('title: New Game opens slots in new mode (first empty preselected)', (await ev(page, () => [G.UI.top().slotMode, G.UI.top().slotSel].join())) === 'new,1');
  await ev(page, () => { T.press('up'); T.press('right'); });
  check('title: right focuses Erase', (await ev(page, () => G.UI.top().eraseFocus)) === true);
  await snap(page, '04_title_slots_new_erase');
  await ev(page, () => { T.press('confirm'); T.step(20); });
  check('title: erase asks for confirmation', (await ev(page, () => T.top())) === 'confirm_erase');
  await snap(page, '05_title_erase_confirm');
  await ev(page, () => { T.press('confirm'); T.step(20); });
  check('title: "No" keeps the save', (await ev(page, () => G.Save.exists(0))) === true);
  await ev(page, () => { T.press('confirm'); T.step(10); T.press('left'); T.press('confirm'); T.step(20); });
  check('title: "Yes" erases the save', (await ev(page, () => G.Save.exists(0))) === false);
  // options & controls from the menu
  await ev(page, () => { T.press('cancel'); T.step(30); G.UI.top().sel = G.UI.top().items.findIndex((i) => i.id === 'options'); T.press('confirm'); T.step(20); });
  check('title: Options opens', (await ev(page, () => T.top())) === 'options');
  await snap(page, '06_title_options');
  await ev(page, () => { T.press('cancel'); T.step(20); G.UI.top().sel = G.UI.top().items.findIndex((i) => i.id === 'controls'); T.press('confirm'); T.step(30); });
  check('title: Controls opens', (await ev(page, () => T.top())) === 'controls');
  await snap(page, '07_title_controls');
  // continue the completed save in slot 2
  await ev(page, () => { T.press('cancel'); T.step(20); G.UI.top().sel = 0; T.press('confirm'); T.step(30); });
  const view = await ev(page, () => [G.UI.top().slotMode, G.UI.top().slotSel].join());
  check('title: continue preselects the remaining save', view === 'continue,2', view);
  await ev(page, () => { T.press('confirm'); T.step(60); });
  const st = await ev(page, () => ({ mode: G.game.mode, cinders: G.game.progress && G.game.progress.cinders, ui: T.ui() }));
  check('title: continue starts play with the loaded save', st.mode === 'play' && st.cinders === 3120 && st.ui.length === 0, st);
  await ev(page, () => T.step(60));
  await snap(page, '08_continue_fadein');
  // the engine API starting play by itself (quit → continue with no step in between) must not leave the title open
  const eng = await ev(page, () => { G.game.quitToTitle(); G.game.continueGame(2); T.step(3); return { mode: G.game.mode, ui: T.ui(), blocking: G.UI.isBlocking() }; });
  check('title: engine-driven continue dismisses the title', eng.mode === 'play' && eng.ui.length === 0 && !eng.blocking, eng);
});

scenario('hud', async (page) => {
  await ev(page, () => { T.reset(); T.buildWorld(); T.fixture('empty'); T.enter('gw_92'); G.UI.clearOverlays(); G.UI.hudSnap(); T.step(40); });
  await snap(page, '10_hud_empty');
  await ev(page, () => {
    T.fixture('mid'); T.enter('gw_92'); G.UI.clearOverlays(); G.UI.hudSnap(); T.step(30);
    const p = G.game.progress; p.health = 3; p.cinders += 125;
    p.wisp = { room: 'gw_92', x: 600, y: 400, cinders: 300 };
    T.step(9);
  });
  check('hud: cinders count up (not instant)', await ev(page, () => G.UI.hud.cinderShown < G.game.progress.cinders));
  await snap(page, '11_hud_mid_snuff_wisp');
  await ev(page, () => { T.step(150); });
  check('hud: count-up reaches the total', await ev(page, () => Math.floor(G.UI.hud.cinderShown) === G.game.progress.cinders));
  await ev(page, () => { G.game.progress.health = 5; T.step(8); });
  await snap(page, '12_hud_rekindle');
  await ev(page, () => { T.fixture('complete'); T.enter('ll_91'); G.UI.clearOverlays(); G.UI.hudSnap(); T.step(40); });
  check('hud: candles = maxHealth incl. sigil', await ev(page, () => G.UI.hud.candles.length === G.game.maxHealth()));
  await snap(page, '13_hud_full');
  await ev(page, () => { G.UI.openPause(); T.step(30); });
  check('hud: visible under pause (not hidden)', await ev(page, () => G.UI.hud.alpha > 0.9));
  await ev(page, () => { G.UI.closeAll(false); G.UI.openInventory({}); T.step(30); });
  check('hud: hidden under the inventory', await ev(page, () => G.UI.hud.alpha < 0.05));
});

scenario('pause', async (page) => {
  await ev(page, () => { T.reset(); T.buildWorld(); T.fixture('mid'); T.enter('gw_92'); G.UI.clearOverlays(); T.step(5); });
  // the engine opens pause on the pause action
  await ev(page, () => { T.press('pause'); T.step(20); });
  check('pause: opened by the engine on pause', (await ev(page, () => T.top())) === 'pause');
  check('pause: blocking', await ev(page, () => G.UI.isBlocking() && G.game.uiBlocking()));
  await snap(page, '20_pause');
  const before = await ev(page, () => G.settings.musicVolume);
  await ev(page, () => { T.press('down'); T.press('confirm'); T.step(20); T.press('down'); T.press('left'); T.press('left'); });
  const after = await ev(page, () => G.settings.musicVolume);
  check('options: left lowers Music Volume by 2 steps', Math.abs(after - (Math.round((before - 0.2) * 10) / 10)) < 1e-9, { before, after });
  await ev(page, () => { T.press('down'); T.press('down'); T.press('down'); T.press('confirm'); });
  check('options: Screen Shake toggles off', (await ev(page, () => G.settings.shake)) === 0);
  await snap(page, '21_pause_options');
  await ev(page, () => { T.press('confirm'); T.press('cancel'); T.step(20); });
  check('options: closing returns to pause', (await ev(page, () => T.top())) === 'pause');
  await ev(page, () => { T.press('down'); T.press('confirm'); T.step(30); });
  await snap(page, '22_pause_controls');
  await ev(page, () => { T.press('cancel'); T.step(20); T.press('down'); T.press('confirm'); T.step(20); });
  check('pause: quit asks to confirm', (await ev(page, () => T.top())) === 'confirm_quit');
  await snap(page, '23_pause_quit_confirm');
  await ev(page, () => { T.press('confirm'); T.step(20); T.press('pause'); T.step(20); });
  check('pause: "No" then pause resumes play', await ev(page, () => !G.UI.isBlocking() && G.game.mode === 'play'));
  await ev(page, () => { T.press('pause'); T.step(20); G.UI.top().sel = 3; T.press('confirm'); T.step(10); T.press('left'); T.press('confirm'); T.step(40); });
  check('pause: "Yes" quits to the title', (await ev(page, () => [G.game.mode, T.top()].join())) === 'title,title');
});

scenario('map', async (page) => {
  await ev(page, () => { T.reset(); T.buildWorld(); T.fixture('mid'); T.enter('gw_92'); G.UI.clearOverlays(); T.step(5); });
  await ev(page, () => { T.press('map'); T.step(20); });
  check('map: opened by the engine on map', (await ev(page, () => T.top())) === 'map');
  const info = await ev(page, () => { const s = G.UI.top(); return { n: s.rooms.length, you: !!s.you, cur: s.curId, faint: s.rooms.filter((r) => !r.visited).map((r) => r.id).sort().join(','), relics: s.rooms.reduce((a, r) => a + r.markers.filter((m) => m.kind === 'relic').length, 0) }; });
  check('map: shows visited + charted rooms (dev rooms excluded)', info.n === 13 && info.you && info.cur === 'gw_92', info);
  check('map: charted-unvisited rooms are faint', info.faint === 'dn_91,dn_92,dn_93,gw_93', info);
  check('map: waymoth marks uncollected pickups', info.relics === 4, info);
  await snap(page, '30_map_mid');
  const lg = await ev(page, () => {
    const s = G.UI.top(), kinds = new Set(s.rooms.flatMap((r) => r.markers.map((m) => m.kind)));
    const c = T.capture();
    return { legend: G.UI.mapLegendKinds(s).join(), kinds: [...kinds].sort().join(), slash: c.strs.filter((x) => T.SLASH.test(x)), door: c.strs.indexOf(G.UI.text('ui.mapLegend.door', 'Seal Door')) >= 0 };
  });
  check('map(mid): legend = only the icon kinds on the map (door room visited → Seal Door listed)', lg.legend === 'you,sconce,lanternway,shop,npc,relic,door' && lg.door && !lg.slash.length, lg);
  const lg2 = await ev(page, () => {
    G.UI.closeAll(false); delete G.game.progress.visited.gw_95; G.game.unequip('waymoth'); G.UI.openMap(); T.step(5);
    const s = G.UI.top(), c = T.capture(), L = (k, fb) => G.UI.text('ui.mapLegend.' + k, fb);
    const r = { legend: G.UI.mapLegendKinds(s).join(), door: c.strs.indexOf(L('door', 'Seal Door')) >= 0, relic: c.strs.indexOf(L('relic', 'Unclaimed Relic')) >= 0 };
    G.UI.closeAll(false); G.game.progress.visited.gw_95 = true; G.game.equip('waymoth'); G.UI.openMap(); T.step(5);
    return r;
  });
  check('map: no Seal Door legend before its room is visited, no relic legend without waymoth', lg2.legend === 'you,sconce,lanternway,shop,npc' && !lg2.door && !lg2.relic, lg2);
  await ev(page, () => { T.press('jump'); T.step(20); T.hold('left', 30); });
  await snap(page, '31_map_zoom_pan');
  await ev(page, () => { T.press('dash'); T.press('dash'); T.step(20); });
  await snap(page, '32_map_zoomed_out');
  await ev(page, () => { T.press('map'); T.step(20); });
  check('map: closes with map', await ev(page, () => !G.UI.isOpen('map')));
  await ev(page, () => { G.game.unequip('waymoth'); G.game.progress.wisp = { room: 'gw_94', x: 900, y: 500, cinders: 50 }; G.UI.openMap(); T.step(20); });
  check('map: no relic marks without waymoth', await ev(page, () => G.UI.top().rooms.every((r) => r.markers.every((m) => m.kind !== 'relic'))));
  await snap(page, '33_map_wisp_no_waymoth');
  await ev(page, () => { G.UI.closeAll(false); T.fixture('complete'); T.enter('dn_91'); G.UI.openMap(); T.step(20); });
  await snap(page, '34_map_complete');
  // zooming out to a level at which the whole world fits frames it (bounds centre, inside the masked band)
  const fr = await ev(page, () => { const s = G.UI.top(); T.press('dash'); T.step(60); const f = G.UI.mapFrameCenter(s.bounds, s.zoom, s.foot.viewBot); return { zi: s.zi, f, cx: s.cx, cy: s.cy }; });
  check('map: widest zoom frames the whole world', fr.zi === 0 && fr.f && Math.abs(fr.f.x - fr.cx) < 0.1 && Math.abs(fr.f.y - fr.cy) < 0.1, fr);
  // NPC markers follow the NPCs' own presence rules (Wren only ever in one place, Sable's glimpse/duel rules)
  const np = await ev(page, () => {
    const p = G.game.progress, f = p.flags, saved = Object.assign({}, f), sb = Object.assign({}, p.bosses);
    const q = (npc, stage, extra) => G.UI.mapNpcPresent(Object.assign({ type: 'npc', npc, stage }, extra || {}));
    for (const k of Object.keys(f)) if (/^wren_|^sable_/.test(k)) delete f[k];
    delete p.bosses.sable1; delete p.bosses.sable2;
    const r = [q('wren', 1), q('sable', 1), q('sable', 2), q('thrum', 0, { requires: 'flag:never_set_xyz' }), q('pell', 0)];
    f.wren_met_2 = true; f.sable_glimpse = true;
    r.push(q('wren', 1), q('wren', 2), q('sable', 1));
    p.bosses.sable2 = true; r.push(q('sable', 2));
    for (const k of Object.keys(f)) delete f[k]; Object.assign(f, saved); p.bosses = sb;
    return r.join(',');
  });
  check('map: npc markers only where the NPC is present', np === 'true,true,false,false,true,false,true,false,true', np);
  await ev(page, () => { G.UI.closeAll(false); T.fixture('empty'); G.game.enterRoom('dev_shaft', { tx: 10, ty: 34 }); G.UI.openMap(); T.step(20); });
  check('map: empty state (dev room)', await ev(page, () => G.UI.top().rooms.length === 0 && !G.UI.top().you));
  check('map(empty): empty legend', (await ev(page, () => G.UI.mapLegendKinds().join())) === '');
  await snap(page, '35_map_empty');
  const lg3 = await ev(page, () => { G.UI.closeAll(false); T.fixture('empty'); T.enter('gw_92'); G.UI.openMap(); T.step(20); const c = T.capture(); return { legend: G.UI.mapLegendKinds().join(), merchant: c.strs.indexOf(G.UI.text('ui.mapLegend.shop', 'Merchant')) >= 0, rooms: G.UI.top().rooms.length }; });
  check('map(first room): legend lists only what this room shows (no Merchant/Sconce yet)', lg3.rooms === 1 && !lg3.merchant && !/shop|sconce|door|relic/.test(lg3.legend), lg3);
  await snap(page, '36_map_first_room');
});

scenario('inventory', async (page) => {
  await ev(page, () => { T.reset(); T.buildWorld(); T.fixture('empty'); T.enter('gw_92'); G.UI.clearOverlays(); G.UI.openInventory({}); T.step(25); });
  await snap(page, '40_inventory_empty');
  const a0 = await ev(page, () => T.invAudit());
  check('inventory(empty): no cells (no placeholders for unfound things)', a0.cells.length === 0, a0.cells);
  check('inventory(empty): no unowned names / icons, no Abilities/Relics sections', !a0.unownedNames.length && !a0.unownedIcons.length && !a0.sections.length, a0);
  check('inventory(empty): no "x / y" counters, "???", completion %', !a0.slash.length && !a0.banned.length, a0);
  // no Sigil pane before the first Sigil (Hollow Knight's Charms pane): no header, notch pips, Equipped row or Sconce hint.
  // Pips are counted as stroked paths; forcing layout.hasSigils on must add them, proving the counter sees them.
  const sg0 = await ev(page, () => {
    const tx = G.UI.text, bad = [tx('ui.sigils', 'Sigils'), tx('ui.notches', 'Notches'), tx('ui.equipped', 'Equipped'), tx('ui.restToEquip', 'Rest at a Sconce to change Sigils'), '—'];
    const CP = CanvasRenderingContext2D.prototype, st0 = CP.stroke;
    const run = () => { let n = 0; CP.stroke = function () { n++; return st0.apply(this, arguments); }; let c; try { c = T.capture(); } finally { CP.stroke = st0; } return { n, strs: c.strs }; };
    const s = G.UI.top(), off = run(); s.layout.hasSigils = true; const on = run(); s.layout.hasSigils = false;
    return { strs: off.strs.filter((x) => bad.some((b) => x.indexOf(b) === 0)), pipStrokes: on.n - off.n, notches: G.game.progress.notches, onStrs: on.strs.filter((x) => x === bad[0]).length };
  });
  check('inventory(empty): no Sigil pane (no Sigils/Notches/Equipped/Sconce text, no notch pips)', !sg0.strs.length && sg0.onStrs === 1 && sg0.pipStrokes >= sg0.notches && sg0.notches > 0, sg0);
  await ev(page, () => { G.UI.closeAll(false); T.fixture('mid'); G.UI.openInventory({ atSconce: true }); T.step(25); });
  const a1 = await ev(page, () => T.invAudit());
  check('inventory(mid): only owned abilities, held relic types and owned sigils (found order)',
    a1.cells.join() === 'ability:bolt,ability:dash,ability:grip,relic:heartwax,relic:urn,relic:kiln_glass,relic:spark,relic:seal,'
      + 'sigil:waymoth,sigil:swift_brand,sigil:heartwax,sigil:bright_bolt,sigil:thorned_wax,sigil:cinder_lure,sigil:steadfast', a1.cells);
  check('inventory(mid): no unowned names or icons drawn (abilities, sigils, relics, seal sockets)', !a1.unownedNames.length && !a1.unownedIcons.length && a1.sealIcons === 'item:seal_bell', a1);
  check('inventory(mid): no "x / y" counters, "???", completion %', !a1.slash.length && !a1.banned.length, { slash: a1.slash, banned: a1.banned });
  const a1b = await ev(page, () => { const p = G.game.progress, q = { heartShards: p.heartShards, urns: p.urns, kilnGlass: p.kilnGlass, seals: p.seals };
    p.heartShards = 2; p.urns = 0; p.kilnGlass = 0; p.seals = ['wing', 'bell']; G.UI.closeAll(false); G.UI.openInventory({}); T.step(5);
    const r = T.invAudit(); G.UI.closeAll(false); Object.assign(p, q); G.UI.openInventory({ atSconce: true }); T.step(5); return r; });
  check('inventory: relic types appear only while held (no urn / spent glass), seals = only the obtained ones',
    a1b.cells.filter((c) => /^relic/.test(c)).join() === 'relic:heartwax,relic:spark,relic:seal' && a1b.sealIcons === 'item:seal_bell,item:seal_wing' && !a1b.slash.length, a1b);
  // first sigil preselected at a sconce; move to bright_bolt (index 8) and equip
  const eq = await ev(page, () => {
    const s = G.UI.top();
    s.sel = s.cells.findIndex((c) => c.kind === 'sigil' && c.id === 'thorned_wax');
    T.press('confirm');
    return G.game.isEquipped('thorned_wax');
  });
  check('inventory: equip at a sconce', eq === true);
  const deny = await ev(page, () => {
    const s = G.UI.top();
    s.sel = s.cells.findIndex((c) => c.kind === 'sigil' && c.id === 'bright_bolt');
    T.press('confirm');
    return { eq: G.game.isEquipped('bright_bolt'), msg: s.msg };
  });
  check('inventory: notch limit denies (with message)', deny.eq === false && !!deny.msg, deny);
  await snap(page, '41_inventory_mid_sconce');
  await ev(page, () => { const s = G.UI.top(); s.sel = s.cells.findIndex((c) => c.kind === 'sigil' && c.id === 'swift_brand'); T.press('confirm'); });
  check('inventory: unequip at a sconce', (await ev(page, () => G.game.isEquipped('swift_brand'))) === false);
  await ev(page, () => { const s = G.UI.top(); s.sel = 0; T.press('right'); T.press('down'); });
  check('inventory: spatial navigation (bolt → dash → kiln_glass)', (await ev(page, () => G.UI.top().cells[G.UI.top().sel].id)) === 'kiln_glass');
  await ev(page, () => { T.press('inventory'); T.step(20); });
  check('inventory: closes with inventory', await ev(page, () => !G.UI.isOpen('inventory')));
  await ev(page, () => { G.UI.openInventory({ atSconce: false }); T.step(20); const s = G.UI.top(); s.sel = s.cells.findIndex((c) => c.kind === 'sigil' && c.id === 'waymoth'); T.press('confirm'); });
  check('inventory: cannot change sigils away from a sconce', await ev(page, () => G.game.isEquipped('waymoth') && /Sconce/.test(G.UI.top().msg)));
  await ev(page, () => { const s = G.UI.top(); s.sel = s.cells.findIndex((c) => c.kind === 'relic' && c.id === 'heartwax'); T.step(2); });
  await snap(page, '42_inventory_mid_not_sconce_relic');
  await ev(page, () => { G.UI.closeAll(false); T.fixture('complete'); G.UI.openInventory({ atSconce: true }); T.step(25); const s = G.UI.top(); s.sel = s.cells.findIndex((c) => c.kind === 'sigil' && c.id === 'deep_kindle'); T.step(2); });
  await snap(page, '43_inventory_complete');
  const a2 = await ev(page, () => T.invAudit());
  check('inventory(complete): every ability and sigil listed, no counters with totals',
    a2.cells.filter((c) => /^ability/.test(c)).length === 6 && a2.cells.filter((c) => /^sigil/.test(c)).length === 14 && !a2.slash.length && !a2.banned.length && !a2.unownedIcons.length, a2);
  const a3 = await ev(page, () => { G.UI.closeAll(false); const p = G.game.progress; const ab = p.abilities; p.abilities = { dash: true }; G.UI.openInventory({}); T.step(25); const r = T.invAudit(); return r; });
  check('inventory: a single ability is laid out alone (no slots for the rest)', a3.cells.filter((c) => /^ability/.test(c)).join() === 'ability:dash' && !a3.unownedNames.length && !a3.unownedIcons.length, a3);
  await snap(page, '45_inventory_one_ability');
  await ev(page, () => { G.UI.closeAll(false); T.fixture('complete'); G.UI.openInventory({ atSconce: true }); T.step(25); });
  await ev(page, () => { const s = G.UI.top(); s.sel = s.cells.findIndex((c) => c.kind === 'ability' && c.id === 'plunge'); T.step(2); });
  await snap(page, '44_inventory_complete_ability');
});

scenario('dialogue', async (page) => {
  await ev(page, () => { T.reset(); T.buildWorld(); T.fixture('mid'); T.enter('ll_91'); G.UI.clearOverlays(); T.step(5); });
  await ev(page, () => {
    window.__done = 0;
    const t = G.Text.npcs.thrum.talks[0];
    G.UI.dialogue({ name: G.Text.npcs.thrum.name, lines: t.lines.concat(['(He taps his stick twice against the brazier.)']), onDone: () => { window.__done++; } });
    T.step(40);
  });
  check('dialogue: blocking', await ev(page, () => G.UI.isBlocking()));
  check('dialogue: typewriter is mid-page', await ev(page, () => { const s = G.UI.top(); return s.shown > 0 && s.shown < s.total; }));
  await snap(page, '50_dialogue_typing');
  await ev(page, () => { T.press('attack'); });
  check('dialogue: attack completes the page', await ev(page, () => { const s = G.UI.top(); return s.shown === s.total && s.page === 0; }));
  // input guard: a page that was just completed is not turned by the very next press (boss lines mid-fight)
  await ev(page, () => { T.press('jump'); T.step(2); });
  check('dialogue: a press right after completing the page does not turn it (input guard)', (await ev(page, () => G.UI.top().page)) === 0);
  await ev(page, () => { T.step(30); T.press('jump'); T.step(10); });
  check('dialogue: jump advances to the next page', (await ev(page, () => G.UI.top().page)) === 1);
  await ev(page, () => { const s = G.UI.top(); s.page = s.layoutPage = -1; s.page = G.Text.npcs.thrum.talks[0].lines.length; s.shown = 0; T.step(200); });
  await snap(page, '51_dialogue_stage_direction');
  await ev(page, () => { T.press('confirm'); T.step(30); });
  check('dialogue: onDone fires once after close', (await ev(page, () => window.__done)) === 1);
  // a press before the box was ever drawn completes the page instead of skipping it
  const early = await ev(page, () => {
    G.UI.dialogue({ name: 'Wren', lines: ['A first page that is long enough to still be typing.', 'Second page.'] });
    T.step(9);   // past the fade-in guard but inside the open input guard (0.45 s): this press is ignored
    G.input.setVirtual({ confirm: true }); G.game.step(); G.input.clearVirtual(); G.game.step();
    const s = G.UI.top(); const guarded = s.shown < s.total && s.page === 0;
    T.step(20);  // past the open input guard; G.game.step() never draws
    G.input.setVirtual({ confirm: true }); G.game.step(); G.input.clearVirtual(); G.game.step();
    const r = { page: s.page, shown: s.shown, total: s.total, guarded };
    G.UI.closeAll(false); T.step(2);
    return r;
  });
  check('dialogue: press before any draw completes the page (layout built in update)', early.page === 0 && early.total > 20 && early.shown === early.total, early);
  check('dialogue: a press within the open input guard is ignored', early.guarded, early);
  check('dialogue: closing press does not make the player jump', await ev(page, () => { const m = G.game.player.motor; return m.vy >= 0; }));
  // tokens as key caps
  await ev(page, () => { G.UI.dialogue({ name: 'Quill', lines: ['Press {jump} to leap, {attack} to strike, and {map} to read my charts. Hm-hm.'] }); T.step(200); });
  await snap(page, '52_dialogue_tokens');
  await ev(page, () => { T.press('confirm'); T.step(20); G.UI.lore('lore_sh_1', () => { window.__lore = true; }); T.step(30); T.press('confirm'); T.step(30); });
  await snap(page, '53_lore_tokens');
  await ev(page, () => { for (let i = 0; i < 6; i++) { T.press('confirm'); T.step(25); } });
  check('lore: closes after the last page and calls onDone', await ev(page, () => window.__lore === true && !G.UI.isOpen('lore')));
  await ev(page, () => { G.UI.lore('lore_dn_5'); T.step(40); });
  await snap(page, '54_lore_long');
  await ev(page, () => { G.UI.closeAll(false); G.game.progress.sparks.push('spark_gw'); G.UI.sparkMemory('spark_gw', () => { window.__spark = true; }); T.step(150); });
  await snap(page, '55_spark_memory');
  const spk = await ev(page, () => { const c = T.capture(); return { slash: c.strs.filter((x) => T.SLASH.test(x)), head: c.strs.filter((x) => x.indexOf(G.UI.text('items.spark.name', "Chandler's Spark")) === 0) }; });
  check('sparkMemory: header without a "n / total" counter', !spk.slash.length && spk.head.length && spk.head[0] === G_SPARK_NAME, spk);
  await ev(page, () => { for (let i = 0; i < 8; i++) { T.press('confirm'); T.step(70); } T.step(80); });
  check('sparkMemory: completes and calls onDone', await ev(page, () => window.__spark === true && !G.UI.isOpen('sparkMemory')));
});

scenario('shop', async (page) => {
  await ev(page, () => { T.reset(); T.buildWorld(); T.fixture('mid'); T.enter('ll_91'); G.UI.clearOverlays(); T.step(5); });
  await ev(page, () => { G.UI.openShop('pell', () => { window.__shop = true; }); T.step(25); });
  await snap(page, '60_shop_pell');
  const buy = await ev(page, () => {
    const c0 = G.game.progress.cinders;
    T.press('confirm'); T.step(10);
    const askd = T.top();
    T.press('left'); T.press('confirm'); T.step(30);
    return { askd, c0, c1: G.game.progress.cinders, flag: !!G.game.progress.flags['item:shop_pell_hw1'], shards: G.game.progress.heartShards, top: T.top() };
  });
  check('shop: buying asks to confirm', buy.askd === 'confirm_buy', buy);
  check('shop: purchase spends cinders, sets the item flag and gives the item', buy.c1 === buy.c0 - 150 && buy.flag && buy.shards === 4, buy);
  check('shop: item card appears over the shop', buy.top === 'itemGet', buy);
  await snap(page, '61_item_get_heartwax_whole');
  await ev(page, () => { T.step(40); T.press('confirm'); T.step(30); });
  check('shop: sold item disappears from the list', await ev(page, () => G.UI.top().name === 'shop' && G.UI.shopRows('pell').every((r) => r.entry.id !== 'shop_pell_hw1') && G.UI.shopRows('pell').length === 8));
  const poor = await ev(page, () => { G.game.progress.cinders = 40; const s = G.UI.top(); s.sel = 0; T.press('confirm'); return { top: T.top(), speech: s.speech }; });
  check('shop: too poor → deny, no confirm', poor.top === 'shop' && poor.speech === G_TEXT_POOR, poor);
  await snap(page, '62_shop_pell_poor');
  await ev(page, () => { T.press('cancel'); T.step(30); });
  check('shop: leaving calls onDone', await ev(page, () => window.__shop === true && !G.UI.isOpen('shop')));
  // Quill lists only charts of known regions (entered or a room visited): a fresh save sees none, entering a region adds it
  const qk = await ev(page, () => {
    const p = G.game.progress, keep = { visited: p.visited, flags: p.flags, charts: p.charts };
    const names = () => G.UI.shopRows('quill').map((r) => r.region).join();
    p.visited = { ll_91: true }; p.flags = {}; p.charts = {};
    const none = names(); G.UI.openShop('quill'); T.step(5); const speech = G.UI.top().speech; G.UI.closeAll(false);
    p.flags['region:rime'] = true; const byFlag = names();
    p.flags = {}; p.visited.gw_91 = true; const byVisit = names();
    Object.assign(p, keep);
    return { none, speech, emptyLine: G.UI.text('shops.quill.empty', ''), byFlag, byVisit };
  });
  check('shop: Quill hides charts of unknown regions (fresh: none, "go explore" line; known by region flag or visited room)',
    qk.none === '' && qk.speech !== qk.emptyLine && /edge/.test(qk.speech) && qk.byFlag === 'rime' && qk.byVisit === 'guttered', qk);
  await ev(page, () => { G.game.progress.cinders = 500; G.UI.openShop('quill'); T.step(25); });
  await snap(page, '63_shop_quill');
  const chart = await ev(page, () => { T.press('confirm'); T.press('left'); T.press('confirm'); T.step(10); return { charts: Object.keys(G.game.progress.charts).sort().join(), cinders: G.game.progress.cinders }; });
  check('shop: Quill sells the first missing chart (meltbloom)', chart.charts === 'guttered,meltbloom,nave' && chart.cinders === 420, chart);
  await ev(page, () => { G.UI.closeAll(false); G.game.progress.cinders = 900; G.UI.openShop('bramm'); T.step(25); });
  await snap(page, '64_shop_bramm');
  const br = await ev(page, () => { T.press('confirm'); T.press('left'); T.press('confirm'); T.step(20); return { lvl: G.game.progress.brandLevel, glass: G.game.progress.kilnGlass, cinders: G.game.progress.cinders, top: T.top() }; });
  check('shop: Bramm upgrades the Brand (700 + 1 glass)', br.lvl === 2 && br.glass === 0 && br.cinders === 200 && br.top === 'itemGet', br);
  await ev(page, () => { T.step(40); T.press('confirm'); T.step(30); });
  await snap(page, '65_shop_bramm_noglass');
  await ev(page, () => { G.UI.closeAll(false); G.game.progress.brandLevel = 3; G.UI.openShop('bramm'); T.step(25); });
  await snap(page, '66_shop_bramm_maxed');
  await ev(page, () => { G.UI.closeAll(false); T.fixture('mid'); T.step(2); window.__lw = null; G.UI.openLanternway('lastlight', (id) => { window.__lw = id || 'none'; }); T.step(25); });
  await snap(page, '67_lanternway');
  const lwc = await ev(page, () => { const c = T.capture(); const lit = Object.keys(G.game.progress.lanterns); const names = ['lastlight', 'guttered', 'meltbloom', 'nave', 'chandlery', 'mothwood', 'rime'].map((id) => [id, G.UI.regionName(id)]);
    return { unknown: c.strs.filter((x) => x === G.UI.text('ui.unknown', '???') || x === G.UI.text('ui.lanternwayUnlit', 'Unlit')), unlitNames: names.filter(([id, n]) => lit.indexOf(id) < 0 && c.strs.indexOf(n) >= 0).map(([id]) => id), litShown: names.filter(([id, n]) => lit.indexOf(id) >= 0 && c.strs.indexOf(n) >= 0).length }; });
  check('lanternway: unlit posts are not listed (no "???"/"Unlit" rows, no unlit names)', !lwc.unknown.length && !lwc.unlitNames.length && lwc.litShown === 3, lwc);
  const lw = await ev(page, () => { const s = G.UI.top(); const first = s.sel; T.press('down'); const second = s.sel; T.press('up'); T.press('confirm'); T.step(30); return { first, second, lw: window.__lw, locks: G.game.lockReasons() }; });
  check('lanternway: lit posts only, travel starts on confirm', lw.first === 1 && lw.second === 3 && lw.lw === 'guttered' && lw.locks.indexOf('travel') >= 0, lw);
  await ev(page, () => { T.step(120); });
  const arr = await ev(page, () => ({ room: G.game.room.id, locks: G.game.lockReasons(), mode: G.game.mode, fade: G.game.fadeAlpha, ui: T.ui() }));
  check('lanternway: travel arrives in the post room', arr.room === 'gw_92' && arr.locks.length === 0, arr);
});

scenario('cards', async (page) => {
  await ev(page, () => { T.reset(); T.buildWorld(); T.fixture('mid'); T.enter('gw_92'); G.UI.clearOverlays(); G.UI.areaCard('guttered', true); T.step(110); });
  check('cards: area card is non-blocking', await ev(page, () => !G.UI.isBlocking()));
  // title cards wait (hidden) under any blocking screen, e.g. Pause, instead of timing out unseen
  const pc = await ev(page, () => { G.UI.bossCard('tallowmere'); T.step(5); G.UI.openPause(); T.step(30); const c = G.UI.blockCover(); T.step(600); G.UI.closeAll(false); T.step(5); const o = G.UI.overlayState(); return { c, area: !!o.area, boss: !!o.boss }; });
  check('cards: area/boss cards wait under Pause', pc.c > 0.99 && pc.area && pc.boss, pc);
  await snap(page, '70_area_card_big');
  await ev(page, () => { G.UI.clearOverlays(); G.UI.areaCard('nave', false); T.step(60); });
  await snap(page, '71_area_card_small');
  await ev(page, () => { G.UI.clearOverlays(); G.UI.bossCard('tallowmere'); T.step(90); });
  await snap(page, '72_boss_card');
  await ev(page, () => { G.UI.clearOverlays(); window.__ab = 0; G.UI.abilityGet('dash', () => { window.__ab++; }); T.step(20); T.press('confirm'); T.step(100); });
  check('cards: ability card ignores early presses', (await ev(page, () => T.top())) === 'abilityGet');
  await snap(page, '73_ability_get_dash');
  await ev(page, () => { T.press('confirm'); T.step(40); });
  check('cards: ability card closes on confirm and calls onDone', await ev(page, () => window.__ab === 1 && !G.UI.isBlocking()));
  await ev(page, () => { G.UI.abilityGet('plunge'); T.step(110); });
  await snap(page, '74_ability_get_plunge');
  const slashes = [];
  for (const [spec, name] of [['seal:bell', '75_item_get_seal'], ['sigil:waymoth', '76_item_get_sigil'], ['notch', '77_item_get_notch'], ['kiln_glass', '78_item_get_kiln'], ['urn', '79_item_get_urn'], ['spark', '7a_item_get_spark'], ['heartwax', '7b_item_get_heartwax_half']]) {
    const c = await ev(page, (sp) => { G.UI.closeAll(false); G.UI.itemGet(sp); T.step(60); return T.capture().strs.filter((x) => T.SLASH.test(x)); }, spec);
    slashes.push(...c);
    await snap(page, name);
  }
  check('cards: item cards show counts without totals (no "x / y")', slashes.length === 0, slashes);
  await ev(page, () => { T.press('confirm'); T.step(30); });
  await ev(page, () => {
    G.UI.closeAll(false); G.UI.clearOverlays();
    G.UI.toast('Progress saved'); T.step(20); G.UI.toast('Sconce lit'); T.step(20); G.UI.toast('Somewhere, a gate grinds open.');
    const pl = G.game.player;
    for (let i = 0; i < 30; i++) { G.UI.prompt(pl.x + pl.w / 2 + 120, pl.y - 20, 'Rest'); G.game.step(); }
  });
  check('cards: prompt visible while called', await ev(page, () => G.UI.overlayState().prompts.indexOf('Rest') >= 0));
  await snap(page, '80_toasts_prompt');
  await ev(page, () => T.step(30));
  check('cards: prompt fades away when no longer called', await ev(page, () => G.UI.overlayState().prompts.length === 0));
  // engine-driven ability get (giveAbility) and item get (giveItem)
  await ev(page, () => { G.UI.clearOverlays(); window.__gi = 0; G.game.giveItem('heartwax', { onDone: () => window.__gi++ }); T.step(60); T.press('confirm'); T.step(40); });
  check('cards: G.game.giveItem shows the item card and calls onDone', await ev(page, () => window.__gi === 1 && !G.UI.isBlocking()));
});

scenario('intro', async (page) => {
  await ev(page, () => { T.reset(); window.__intro = 0; G.UI.playIntro(() => { window.__intro++; }); T.step(150); });
  await snap(page, '90_intro_page1');
  await ev(page, () => { const s = G.UI.top(); s.page = 4; s.phase = 'hold'; s.pt = 0; s.flameK = 0; T.step(200); });
  await snap(page, '91_intro_last_flame');
  await ev(page, () => { T.press('cancel'); T.step(80); });
  check('intro: skip closes and calls onDone once', await ev(page, () => window.__intro === 1 && !G.UI.isOpen('intro')));
});

scenario('ending', async (page) => {
  for (const id of ['undying', 'gutterlight']) {
    await ev(page, (eid) => { T.reset(); window.__end = 0; G.game.mode = 'ending'; G.UI.playEnding(eid, () => { window.__end++; }); T.step(150); }, id);
    await snap(page, '9' + (id === 'undying' ? 'a' : 'b') + '_ending_' + id + '_title');
    const scenes = await ev(page, (eid) => G.Text.endings[eid].scenes, id);
    for (let i = 0; i < scenes.length; i++) {
      await ev(page, (k) => { const s = G.UI.top(); s.phase = 'pages'; s.sub = 'hold'; s.page = k; s.pt = 2.0; T.step(30); }, i);
      await snap(page, '9' + (id === 'undying' ? 'a' : 'b') + '_ending_' + id + '_p' + (i + 1) + '_' + scenes[i]);
    }
    await ev(page, () => { const s = G.UI.top(); s.next('credits'); T.step(60); s.scroll = 420; T.step(2); });
    await snap(page, '9' + (id === 'undying' ? 'a' : 'b') + '_ending_' + id + '_credits');
    await ev(page, () => { const s = G.UI.top(); s.next('end'); T.step(120); });
    await snap(page, '9' + (id === 'undying' ? 'a' : 'b') + '_ending_' + id + '_theend');
    await ev(page, () => { T.press('confirm'); T.step(120); });
    check('ending(' + id + '): finishes and calls onDone', await ev(page, () => window.__end === 1 && !G.UI.isOpen('ending')));
  }
  // full natural run of the gutterlight ending (timing, no input): must end by itself
  const auto = await ev(page, () => { T.reset(); window.__end = 0; G.UI.playEnding('gutterlight', () => { window.__end++; }); for (let i = 0; i < 60 * 260 && !window.__end; i++) G.game.step(); return { done: window.__end, secs: G.UI.t }; });
  check('ending: plays through on its own (no input)', auto.done === 1, auto);
  // engine flow: finishGame → ending → title
  await ev(page, () => { T.reset(); G.game.finishGame('undying'); T.step(5); });
  check('ending: G.game.finishGame opens the ending screen', (await ev(page, () => T.top())) === 'ending');
});

// ------------------------------------------------------------------ main
(async () => {
  fs.mkdirSync(OUT, { recursive: true });
  const { page, errors } = await openGame({ query: 'test=1&paused=1&room=dev_shaft&tx=10&ty=34&seed=7&mute=1' });
  await page.evaluate(pageHelpers);
  global.G_TEXT_POOR = await page.evaluate(() => G.Text.shops.pell.poor);
  global.G_SPARK_NAME = await page.evaluate(() => G.UI.text('items.spark.name', "Chandler's Spark"));
  const t0 = Date.now();
  for (const sc of scenarios) {
    if (filters.length && !filters.some((f) => sc.name.indexOf(f) >= 0)) continue;
    console.log('[' + sc.name + ']');
    try { await sc.fn(page); } catch (e) { check(sc.name + ': scenario threw', false, String(e.message || e).split('\n')[0]); }
  }
  const uiErr = errors.filter((e) => /src\/ui\/|\[UI\.|UI\.[a-zA-Z]+/.test(e));
  const foreign = errors.filter((e) => uiErr.indexOf(e) < 0);
  check('no UI errors', uiErr.length === 0, uiErr.slice(0, 5));
  const failed = results.filter((r) => !r.ok);
  console.log('\nscreenshots (' + shots.length + '): test-output/ui/');
  if (foreign.length) {
    console.log('foreign errors from other modules (' + foreign.length + ', not UI failures):');
    for (const e of foreign.slice(0, 8)) console.log('  ' + e.split('\n')[0]);
  }
  console.log('\n' + (failed.length ? 'FAILED ' + failed.length + ' / ' + results.length : 'ALL PASS (' + results.length + ' checks)') + ' in ' + ((Date.now() - t0) / 1000).toFixed(1) + ' s');
  await closeAll();
  process.exit(failed.length ? 1 : 0);
})().catch(async (e) => { console.error(e); await closeAll(); process.exit(3); });
