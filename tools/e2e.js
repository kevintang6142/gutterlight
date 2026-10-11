#!/usr/bin/env node
// tools/e2e.js — end-to-end flow through the REAL boot (no ?test=1), driven frame by frame (integration).
//   node tools/e2e.js [--file dist/Gutterlight.html]
// title (gate → Audio.init → menu → New Game → slot) → intro → wake → real Player in the start room →
// lore, NPC dialogue, shrine + ability card, sconce rest, inventory, map, pause, shop, Lanternway (refusal in an
// unsafe room + menu), a real ash_crawler fight, death → wisp → respawn at the sconce → reclaim the wisp →
// save → quit to title → Continue. Also audits every audio name played, every text drawn ('undefined', 'NaN',
// '[object', 'null'), G.debug errors, console errors and warnings. Uses the dev rooms (src/data/test_rooms.js),
// which stay in the game for this purpose. Screenshots: test-output/e2e/e2e_*.png. Exit 1 on any failure.
'use strict';
const path = require('path');
const fs = require('fs');
const ROOT = path.resolve(__dirname, '..');
const { openGame, closeAll } = require(path.join(ROOT, 'tools/lib/browser'));
const OUT = path.join(ROOT, 'test-output/e2e');
fs.mkdirSync(OUT, { recursive: true });
const fileArg = process.argv.indexOf('--file');
const FILE = fileArg > 0 ? process.argv[fileArg + 1] : 'index.html';

const results = [];
function check(name, ok, detail) {
  results.push({ name, ok: !!ok, detail });
  console.log((ok ? 'PASS  ' : 'FAIL  ') + name.padEnd(58) + (detail != null ? '  ' + (typeof detail === 'string' ? detail : JSON.stringify(detail)) : ''));
}

const INSTRUMENT = `
(() => {
  window.__bad = [];
  window.__audio = { sfx: {}, music: {}, ambience: {}, stinger: {}, unknown: [] };
  const P = CanvasRenderingContext2D.prototype;
  for (const fn of ['fillText', 'strokeText']) {
    const orig = P[fn];
    P[fn] = function (s, x, y, mw) {
      const str = String(s);
      if (/undefined|NaN|\\[object|null/.test(str) && __bad.length < 50) __bad.push(str);
      return orig.apply(this, arguments);
    };
  }
  const A = G.Audio;
  const names = { sfx: new Set(A.sfxNames()), music: new Set(A.TRACK_IDS || A.trackIds()), ambience: new Set(A.ambienceIds()), stinger: new Set(A.stingerNames()) };
  for (const k of ['sfx', 'music', 'ambience', 'stinger']) {
    const orig = A[k].bind(A);
    A[k] = function (name) {
      if (name != null) {
        __audio[k][name] = (__audio[k][name] || 0) + 1;
        if (!names[k].has(name)) __audio.unknown.push(k + ':' + name);
      }
      return orig.apply(null, arguments);
    };
  }
  window.E = {
    step(n) { G.debug.step(n || 1); },
    press(action, hold) { G.input.setVirtual({ [action]: true }); G.debug.step(hold || 1); G.input.clearVirtual(); G.debug.step(1); },
    ui() { return G.UI.screenNames(); },
    st() { const s = G.debug.state(); return { mode: s.mode, room: s.room, ui: s.ui, locks: s.locks, hp: s.player && s.player.health, x: s.player && s.player.tx, y: s.player && s.player.ty }; },
    waitFor(pred, max) { for (let i = 0; i < (max || 600); i++) { if (pred()) return i; G.debug.step(1); } return -1; },
    hold(state, n) { G.input.setVirtual(state); G.debug.step(n); G.input.clearVirtual(); G.debug.step(1); },
    p() { return G.game.player; },
  };
  return true;
})()`;

(async () => {
  const { page, errors, logs } = await openGame({ query: 'paused=1', file: FILE });
  const ev = (src) => page.evaluate(`(() => { ${src} })()`);
  const shot = async (name) => { await page.screenshot({ path: path.join(OUT, 'e2e_' + name + '.png') }); };
  await page.evaluate(INSTRUMENT);

  // ---------------------------------------------------------------- title
  let s = await ev(`E.step(40); return { mode: G.game.mode, ui: E.ui(), ready: !!(G.Audio.state && G.Audio.state().ready) };`);
  check('boot: title screen in title mode', s.mode === 'title' && s.ui.includes('title'), s);
  await shot('01_title_gate');
  s = await ev(`E.press('jump'); E.step(60); return { ui: E.ui(), audio: G.Audio.state(), music: __audio.music };`);
  check('title: any key → menu, Audio.init, title music', s.audio.ready !== false && s.music.title >= 1, { ready: s.audio.ready, ctx: s.audio.ctxState, music: s.audio.music });
  await shot('02_title_menu');
  // menu: (no save) first item = New Game
  s = await ev(`E.press('confirm'); E.step(40); const t = G.UI.find('title'); return { view: t && t.view, slotMode: t && t.slotMode };`);
  check('title: New Game → slot select', s.view === 'slots' && s.slotMode === 'new', s);
  await shot('03_title_slots');
  // slot → "Choose a Trial" (cursor starts on Standard) → confirm Standard (the intended mode)
  s = await ev(`E.press('confirm'); E.step(30); const t = G.UI.find('title'); return { view: t && t.view, sel: t && t.modeSel };`);
  check('new game: slot → trial chooser (default Standard)', s.view === 'modes' && s.sel === 1, s);
  await shot('03b_title_modes');
  s = await ev(`E.press('confirm'); const n = E.waitFor(() => E.ui().includes('intro'), 200); E.step(90); return { n, ui: E.ui(), mode: G.game.mode, diff: G.game.difficulty && G.game.difficulty(), tele: G.game.telegraphs && G.game.telegraphs() };`);
  check('new game: Standard chosen (no explicit telegraphs)', s.diff === 'standard' && s.tele === false, s);
  check('new game: intro verse plays', s.n >= 0 && s.ui.includes('intro'), s);
  await shot('04_intro');
  // let the intro run a little, then skip (cancel)
  s = await ev(`E.step(200); E.press('cancel'); const n = E.waitFor(() => G.game.mode === 'play' && !E.ui().includes('intro'), 400); return { n, st: E.st(), type: G.game.player && G.game.player.constructor.name, isReal: G.game.player instanceof G.Player };`);
  check('intro skip → play with the REAL Player', s.n >= 0 && s.st.mode === 'play' && s.isReal, s);
  // wake-up cinematic
  s = await ev(`const p = E.p(); const cine = p.cine || p.cinematic; return { locks: G.game.lockReasons(), pose: G.PlayerDraw && G.PlayerDraw.poseFrom ? G.PlayerDraw.poseFrom(p, G.game.t).state : '?' };`);
  check('wake-up animation runs after the intro', s.locks.includes('wake') || s.pose === 'wake', s);
  await ev(`E.step(50);`); await shot('05_wake_mid');
  s = await ev(`const n = E.waitFor(() => !G.game.isLocked(), 400); E.step(30); return { n, locks: G.game.lockReasons(), st: E.st() };`);
  check('wake ends and control returns', s.n >= 0 && !s.locks.length, s);
  await shot('06_play_start');

  // ---------------------------------------------------------------- walk/jump/HUD/interactables
  s = await ev(`const x0 = E.p().x; E.hold({ right: true }, 20); const x1 = E.p().x; E.hold({ jump: true }, 14); const vy = E.p().motor.vy; return { dx: x1 - x0, vy, hud: !!G.UI.hudSnap };`);
  check('player walks and jumps in the real game', s.dx > 100, s);
  // Read the lore tablet (dev_01 col 18)
  s = await ev(`E.step(40); G.debug.teleport('dev_01', 18, 15); E.step(4); E.press('up'); E.step(30); return { ui: E.ui() };`);
  check('lore tablet: Up opens the lore screen', s.ui.includes('lore'), s);
  await shot('10_lore');
  s = await ev(`for (let i = 0; i < 12 && E.ui().includes('lore'); i++) { E.press('confirm'); E.step(30); } return { ui: E.ui(), locks: G.game.lockReasons() };`);
  check('lore closes', !s.ui.includes('lore'), s);
  // Thrum dialogue (col 22)
  s = await ev(`G.debug.teleport('dev_01', 22, 15); E.step(4); E.press('up'); E.step(40); return { ui: E.ui() };`);
  check('NPC: talking to Thrum opens dialogue', s.ui.includes('dialogue'), s);
  await shot('11_dialogue_thrum');
  s = await ev(`for (let i = 0; i < 40 && E.ui().includes('dialogue'); i++) { E.press('confirm'); E.step(10); } E.step(30); return { ui: E.ui(), flags: Object.keys(G.game.progress.flags).filter((f) => /talked/.test(f)) };`);
  check('dialogue completes and sets talked flag', !s.ui.includes('dialogue') && s.flags.length > 0, s);
  // Shrine (dash, col 25) → ability card
  s = await ev(`G.debug.teleport('dev_01', 25, 15); E.step(4); E.press('up'); const n = E.waitFor(() => E.ui().includes('abilityGet'), 120); E.step(80); return { n, ui: E.ui(), dash: G.game.hasAbility('dash') };`);
  check('shrine: Up grants dash with the ability card', s.dash && s.ui.includes('abilityGet'), s);
  await shot('12_ability_get');
  s = await ev(`E.step(80); for (let i = 0; i < 10 && E.ui().includes('abilityGet'); i++) { E.press('confirm'); E.step(30); } E.step(60); return { ui: E.ui(), locks: G.game.lockReasons() };`);
  check('ability card closes, control returns', !s.ui.includes('abilityGet') && !s.locks.length, s);
  // Rest at the sconce (col 14)
  s = await ev(`G.debug.teleport('dev_01', 14, 15); E.step(4); E.press('up'); E.step(60); return { resting: E.p().resting, sconce: G.game.progress.sconce };`);
  check('sconce: rest sets the respawn sconce', s.resting && s.sconce && s.sconce.id === 'dev_sconce', s);
  await shot('13_rest');
  s = await ev(`E.press('inventory'); E.step(40); return { ui: E.ui(), at: (G.UI.find('inventory') || {}).atSconce };`);
  check('inventory opens while resting (atSconce)', s.ui.includes('inventory'), s);
  await shot('14_inventory');
  s = await ev(`E.press('inventory'); E.step(40); E.press('right'); E.step(30); return { ui: E.ui(), resting: E.p().resting };`);
  check('inventory closes; moving stands up', !s.ui.includes('inventory') && !s.resting, s);
  // Map, pause
  s = await ev(`E.press('map'); E.step(40); return { ui: E.ui() };`);
  check('map opens (Tab/M)', s.ui.includes('map'), s);
  await shot('15_map');
  s = await ev(`E.press('map'); E.step(40); E.press('pause'); E.step(40); return { ui: E.ui() };`);
  check('pause opens', s.ui.includes('pause'), s);
  await shot('16_pause');
  s = await ev(`E.press('pause'); E.step(40); return { ui: E.ui() };`);
  check('pause closes', !s.ui.includes('pause'), s);
  // Shop + Lanternway via the UI API (no merchants/posts in dev rooms)
  s = await ev(`G.game.addCinders(500); G.UI.openShop('pell'); E.step(50); return { ui: E.ui() };`);
  check('shop (Pell) opens', s.ui.includes('shop'), s);
  await shot('17_shop_pell');
  s = await ev(`for (let i = 0; i < 20 && E.ui().includes('shop'); i++) { E.press('cancel'); E.step(20); } E.step(20); return { ui: E.ui() };`);
  check('shop closes', !s.ui.includes('shop'), s);
  // safety rule: a live enemy > 12 tiles away does not matter; one within 12 tiles (or being hurt/attacked < 3 s ago) does
  s = await ev(`const far = G.game.isSafeRoom(), farN = G.game.room.enemiesAlive();
    const tx = Math.floor(E.p().cx / 40) + 5, e = G.debug.spawn({ type: 'enemy', kind: 'ash_crawler', tx, ty: 15 });
    const unsafe = !G.game.isSafeRoom(); G.UI.openLanternway('guttered'); if (e) e.dead = true; E.step(50); const ui = E.ui();
    for (let i = 0; i < 40 && E.ui().length; i++) { E.press('confirm'); E.step(10); }
    E.step(200); const clear = G.game.isSafeRoom(); G.game.noteThreat(); const hurt = !G.game.isSafeRoom(); E.step(190); const later = G.game.isSafeRoom();
    return { far, farN, unsafe, ui, clear, hurt, later };`);
  check('lanternway: a live enemy > 12 tiles away does not block travel', s.far && s.farN > 0, s);
  check('lanternway refuses with an enemy within 12 tiles (dialogue)', s.unsafe && s.ui.includes('dialogue') && !s.ui.includes('lanternway'), s);
  check('lanternway refuses for 3 s after the player was hurt/attacked', s.clear && s.hurt && s.later, s);
  s = await ev(`G.debug.teleport('dev_water', 60, 15); E.step(10); G.game.progress.lanterns = { lastlight: true, guttered: true, nave: true }; G.UI.openLanternway('guttered'); E.step(50); return { ui: E.ui() };`);
  check('lanternway menu opens', s.ui.includes('lanternway'), s);
  await shot('18_lanternway');
  s = await ev(`for (let i = 0; i < 10 && E.ui().includes('lanternway'); i++) { E.press('cancel'); E.step(20); } E.step(20); return { ui: E.ui(), locks: G.game.lockReasons() };`);
  check('lanternway closes without travelling (no posts placed)', !s.ui.includes('lanternway') && !s.locks.length, s);

  // ---------------------------------------------------------------- combat vs the shore enemy
  // (dev_01's placed crawler patrols beyond the south pit; spawn a real one on open floor instead)
  s = await ev(`G.debug.teleport('dev_01', 12, 15); E.step(2);
    const crawler = G.debug.spawn({ type: 'enemy', kind: 'ash_crawler', tx: 20, ty: 15 });
    if (!crawler) return { found: false };
    const before = G.game.progress.ember;
    let hits = 0;
    for (let i = 0; i < 360 && !crawler.dead && !crawler.dying; i++) {
      const p = E.p();
      const dir = crawler.cx > p.cx ? 1 : -1;
      const far = Math.abs(crawler.cx - p.cx) > 70;
      G.input.setVirtual({ right: far && dir > 0, left: (far && dir < 0) || (!far && dir < 0 && p.facing > 0), attack: !far && (i % 24 === 0) });
      G.debug.step(1);
    }
    G.input.clearVirtual(); E.step(10);
    return { found: true, dead: crawler.dead || !!crawler.dying, ember: G.game.progress.ember - before, hp: G.game.progress.health };`);
  check('combat: real ash_crawler killed with the Brand, ember gained', s.found && s.dead && s.ember > 0, s);
  await ev(`E.step(4);`); await shot('20_after_fight');

  // ---------------------------------------------------------------- death → wisp → respawn
  s = await ev(`G.game.progress.cinders = 77; G.debug.teleport('dev_02', 60, 15); E.step(2); G.game.progress.health = 1;
    E.p().invuln = 0; G.Combat.hurtPlayer(1, { x: E.p().cx + 30, y: E.p().cy });
    E.step(30); return { mode: G.game.mode };`);
  check('death: player dies (mode dead)', s.mode === 'dead', s);
  await shot('21_death');
  s = await ev(`const n = E.waitFor(() => G.game.mode === 'play' && G.game.sysFadeAlpha < 0.05, 400); E.step(30);
    return { n, room: G.game.room.id, wisp: G.game.progress.wisp, cinders: G.game.progress.cinders, emberMax: G.game.emberMax(), resting: E.p().resting };`);
  check('respawn at the rested sconce with a wisp holding the cinders', s.n >= 0 && s.room === 'dev_01' && s.wisp && s.wisp.cinders === 77 && s.cinders === 0, s);
  await shot('22_respawn');
  s = await ev(`E.press('right'); E.step(20); G.debug.teleport('dev_02', 64, 15); E.step(30);
    const w = G.game.room.entities.find((e) => e.type === 'wisp'); return { wisp: !!w, x: w && Math.round(w.cx), y: w && Math.round(w.cy) };`);
  check('wisp spawns where the player died', s.wisp, s);
  await shot('23_wisp');
  s = await ev(`G.debug.god(true); const w = () => G.game.room.entities.find((e) => e.type === 'wisp' && !e.dead);
    for (let i = 0; i < 600 && w(); i++) {
      const p = E.p(), e = w(); const dir = e.cx > p.cx ? 1 : -1; const far = Math.abs(e.cx - p.cx) > 60;
      const up = e.cy < p.cy - 50;
      G.input.setVirtual({ right: far && dir > 0, left: (far && dir < 0) || (!far && dir < 0 && p.facing > 0), up, attack: !far && i % 24 === 0, jump: up && i % 40 < 12 });
      G.debug.step(1);
    }
    G.input.clearVirtual(); E.step(60); G.debug.god(false);
    return { gone: !w(), wisp: G.game.progress.wisp, cinders: G.game.progress.cinders };`);
  check('wisp: 3 hits reclaim the cinders', s.gone && !s.wisp && s.cinders >= 77, s);

  // ---------------------------------------------------------------- save → quit → continue
  s = await ev(`G.game.setFlag('e2e_marker'); G.game.saveNow(); const c = G.game.progress.cinders;
    E.press('pause'); E.step(30);
    const pz = G.UI.find('pause'); return { c, ui: E.ui(), items: pz && pz.items ? pz.items.map((i) => i.id || i.label) : null };`);
  check('pause before quitting', s.ui.includes('pause'), s);
  s = await ev(`G.game.quitToTitle(); E.step(60); return { mode: G.game.mode, ui: E.ui(), saved: G.Save.exists(0), mem: G.Save.memoryOnly };`);
  check('quit to title (save exists in slot 0)', s.mode === 'title' && s.ui.includes('title') && s.saved, s);
  s = await ev(`E.press('jump'); E.step(50); const t = G.UI.find('title'); return { items: t && t.items.map((i) => i.id), sel: t && t.sel };`);
  check('title menu offers Continue', s.items && s.items[0] === 'continue', s);
  await shot('30_title_continue');
  s = await ev(`E.press('confirm'); E.step(40); E.press('confirm'); const n = E.waitFor(() => G.game.mode === 'play' && !E.ui().includes('title'), 300); E.step(60);
    return { n, room: G.game.room && G.game.room.id, marker: G.game.getFlag('e2e_marker'), cinders: G.game.progress.cinders, resting: E.p().resting, ui: E.ui() };`);
  check('continue restores progress at the sconce', s.n >= 0 && s.room === 'dev_01' && s.marker === true && s.cinders >= 77, s);
  await shot('31_continued');

  // ---------------------------------------------------------------- audit
  s = await ev(`return { bad: __bad.slice(0, 20), audio: __audio, errors: G.debug.errors.slice(0, 10) };`);
  check('no "undefined"/"NaN"/"[object" text drawn', s.bad.length === 0, s.bad);
  check('every audio name used exists in the audio module', s.audio.unknown.length === 0, s.audio.unknown);
  check('no G.debug errors', s.errors.length === 0, s.errors);
  check('no console errors', errors.length === 0, errors.slice(0, 10));
  fs.writeFileSync(path.join(OUT, 'e2e_audio_used.json'), JSON.stringify(s.audio, null, 1));
  const warns = [...new Set(logs.filter((l) => /^\[warning\]/.test(l)))];
  console.log('console warnings (' + warns.length + '):\n  ' + warns.join('\n  '));
  await closeAll();
  const failed = results.filter((r) => !r.ok);
  console.log('\n' + (failed.length ? 'FAILED ' + failed.length + ' of ' + results.length : 'ALL PASS (' + results.length + ' checks)'));
  process.exit(failed.length ? 1 : 0);
})().catch(async (e) => { console.error(e); await closeAll(); process.exit(3); });
