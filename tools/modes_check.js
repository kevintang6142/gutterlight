#!/usr/bin/env node
// tools/modes_check.js — regression for the difficulty modes contract (module: modes-integration; sections 1-7
// promoted from the modes-core module's test). Each section opens fresh headless pages.
//
//   node tools/modes_check.js                    every section
//   node tools/modes_check.js contract wisp tele  only these sections
//   node tools/modes_check.js tele --shots        + easy | standard contact sheets per boss (test-output/modes_check/)
//
//   contract  ?mode= / defaults / telegraphs(); save migration (old saves -> easy); easy/standard deaths + the
//             G.wispSpotFor hook; the real title "Choose a Trial" flow for all 3 modes; hardcore permadeath
//             (broken at the instant of death, game over -> title, Continue refused, Erase; quit / reload mid-death)
//   wisp      every boss: walk into the trigger, die to real damage mid-fight (standard), respawn at the sconce
//             before the arena; progress.wisp + the Gutterwisp entity are at the spot chosen by G.wispSpotFor, the
//             arena stays idle; a death before the trigger moves it too; a won arena keeps the death spot; a
//             hardcore boss death leaves no wisp
//   tele      every boss, seeded, both phases, in easy / standard / hardcore: standard and hardcore render
//             identically, easy differs (its explicit telegraphs), no errors in any mode
//   engine    real-storage edge cases: stale-tab hardcore death, refused Continue (broken / erased) -> title,
//             quit mid-death empties Ember, Ember cap, old arena wisp moved on Continue, legacy run ids
//   leap      Effigy: off-screen leap -> kept subtle landing mark (>= 0.45 s lead), in-view leap -> none
'use strict';
const path = require('path');
const fs = require('fs');
const { openGame, closeAll } = require('./lib/browser');

const ARGS = process.argv.slice(2);
const SHOTS = ARGS.includes('--shots');
const ONLY = ARGS.filter((a) => !a.startsWith('--'));
const want = (s) => !ONLY.length || ONLY.includes(s);
const OUT = path.join(__dirname, '..', 'test-output', 'modes_check');
fs.mkdirSync(OUT, { recursive: true });
let pass = 0, fail = 0;
const failures = [];
function check(name, ok, info) {
  if (ok) { pass++; console.log('  ok   ' + name); } else {
    fail++; failures.push(name);
    console.log('  FAIL ' + name + (info !== undefined ? '  ' + JSON.stringify(info).slice(0, 600) : ''));
  }
  return !!ok;
}

const HELPERS = `(() => {
  window.E = {
    step(n) { G.debug.step(n || 1); },
    press(action, hold) { G.input.setVirtual({ [action]: true }); G.debug.step(hold || 1); G.input.clearVirtual(); G.debug.step(1); },
    ui() { return G.UI.screenNames(); },
    waitFor(pred, max) { for (let i = 0; i < (max || 600); i++) { if (pred()) return i; G.debug.step(1); } return -1; },
    newGame(slot, mode) {
      G.game.newGame(slot, mode);
      if (E.waitFor(() => E.ui().includes('intro') || G.game.mode === 'play', 300) >= 0 && E.ui().includes('intro')) { E.step(20); E.press('cancel'); }
      return E.waitFor(() => G.game.mode === 'play' && !E.ui().includes('intro'), 600);
    },
    raw(slot) { try { return JSON.parse(localStorage.getItem('gutterlight.v1.slot' + slot)); } catch (e) { return null; } },
  };
  return true;
})()`;

async function page(query) {
  const r = await openGame({ query });
  await r.page.evaluate(HELPERS);
  r.ev = (src) => r.page.evaluate(`(() => { ${src} })()`);
  return r;
}

// ------------------------------------------------------------------------------------- boss sections (8, 9)
// entry = the tile just outside the arena trigger + the walk direction into it; sconce = the rest spot before the
// arena (respawn point); wisp = where G.wispSpotFor puts the Gutterwisp after a death in that fight (room, column).
const BOSSES = [
  { boss: 'effigy', arena: 'gw_05', entry: [60, 14], into: 'left', sconce: ['gw_04', 'gw_sconce_a'], wisp: ['gw_04', 8] },
  { boss: 'sable1', arena: 'mb_07', entry: [60, 14], into: 'left', sconce: ['mb_08', 'mb_sconce_b'], wisp: ['mb_07', 53] },
  { boss: 'matron', arena: 'sf_05', entry: [4, 14], into: 'right', sconce: ['sf_02', 'sf_sconce_b'], wisp: ['sf_02', 25] },
  { boss: 'tallowmere', arena: 'dn_07', entry: [5, 23], into: 'right', sconce: ['dn_06', 'dn_sconce_b'], wisp: ['dn_07', 6] },
  { boss: 'kilnmother', arena: 'ch_09', entry: [5, 14], into: 'right', sconce: ['ch_08', 'ch_sconce_b'], wisp: ['ch_08', 58] },
  { boss: 'vespertine', arena: 'mw_04', entry: [5, 23], into: 'right', sconce: ['mw_06', 'mw_sconce_b'], wisp: ['mw_06', 44] },
  { boss: 'sable2', arena: 'ri_07', entry: [60, 14], into: 'left', sconce: ['ri_04', 'ri_sconce_b'], wisp: ['ri_07', 53] },
  { boss: 'lucerne', arena: 'hs_03', entry: [5, 32], into: 'right', sconce: ['hs_02', 'hs_sconce_a'], wisp: ['hs_02', 33] },
];

const BOSS_HARNESS = `
window.BH = (function () {
  const step = (n) => { for (let i = 0; i < (n || 1); i++) G.debug.step(1); };
  const arena = () => G.game.room && G.game.room.findType('arena')[0];
  function pc() { const p = G.game.player, m = p.motor; return { x: m.x + p.w / 2, y: m.y + p.h / 2 }; }
  function seed(s) { let a = s >>> 0; Math.random = function () { a = (a + 0x6D2B79F5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }
  function hash() { const c = G.Render.ctx.canvas; const d = c.getContext('2d').getImageData(0, 0, c.width, c.height).data; let h = 2166136261; for (let i = 0; i < d.length; i += 5) { h ^= d[i]; h = Math.imul(h, 16777619); } return (h >>> 0).toString(36); }
  let small = null;
  function shot() { const c = G.Render.ctx.canvas; small = small || document.createElement('canvas'); small.width = 384; small.height = 216; small.getContext('2d').drawImage(c, 0, 0, 384, 216); return small.toDataURL('image/jpeg', 0.8); }
  // walk into the trigger with real input until the fight runs
  function startFight(into) {
    G.Boss.skipDialogue = true;
    const ar = arena();
    if (!ar) return { ok: false, why: 'no arena' };
    let f = 0;
    for (; f < 900 && ar.state === 'wait'; f++) { const s = { [into]: true }; if (f % 40 === 39) s.jump = true; G.input.setVirtual(s); step(1); }
    G.input.clearVirtual();
    if (ar.state === 'wait') return { ok: false, why: 'trigger not reached', pos: pc() };
    for (f = 0; f < 900 && !(ar.state === 'fight' && ar.boss && !G.game.isLocked()); f++) step(1);
    if (ar.state !== 'fight') return { ok: false, why: 'fight did not start: ' + ar.state };
    return { ok: true, boss: ar.boss.type };
  }
  // drop the boss to just above its first threshold and land hits until its own phase logic runs
  function toPhase2() {
    const ar = arena(); let boss = ar.boss;
    const thr = boss && boss.phaseThresholds && boss.phaseThresholds[0];
    if (!thr) return false;
    for (let f = 0; f < 900 && (ar.boss || boss).phase < 2; f++) {
      boss = ar.boss || boss;
      if (f % 20 === 0) { boss.hp = Math.min(boss.hp, Math.floor(boss.maxHp * thr) + 2); boss.onHit({ damage: 6, team: 'player', kind: 'spell', dir: { x: 0, y: 0 }, source: G.game.player }); }
      step(1);
    }
    for (let f = 0; f < 600 && G.game.isLocked(); f++) step(1);
    return (ar.boss || boss).phase >= 2;
  }
  // real damage through the player's own hurt() until dead, then let death -> respawn play out
  function dieAndRespawn() {
    const g = G.game, p = g.player, pr = g.progress, deathRoom = g.room.id, at = pc();
    G.debug.god(false);
    let f = 0;
    for (; f < 600 && g.mode !== 'dead'; f++) {
      if (!p.dying && g.mode === 'play') { pr.health = 1; p.invuln = 0; if (p.motor) p.motor.plunging = false; p.hurt(1, { x: at.x, y: at.y, w: 1, h: 1, team: 'enemy' }); }
      if (g.mode !== 'dead') step(1);
    }
    if (g.mode !== 'dead') return { ok: false, why: 'player did not die (' + g.mode + ')' };
    for (f = 0; f < 1500 && g.mode !== 'play'; f++) step(1);
    step(30);
    return { ok: g.mode === 'play', deathRoom, room: g.room.id };
  }
  // a seeded fight: ~15 s of phase 1 then ~15 s of phase 2 with the player standing (god mode), a frame hash every
  // 15 frames (and a downscaled shot when asked)
  function teleRun(c, shots) {
    G.debug.give('all'); G.debug.god(true); seed(20261010);
    const out = { difficulty: G.game.difficulty(), tele: G.game.telegraphs(), hashes: [], shots: [], ok: false, phase2: false, gErr: [] };
    const fight = startFight(c.into);
    if (!fight.ok) { out.why = fight.why; return out; }
    const rec = (n) => { for (let i = 0; i < n; i++) { G.debug.step(15); out.hashes.push(hash()); out.shots.push(shots ? shot() : null); } };
    rec(60);
    out.phase2 = toPhase2();
    rec(60);
    out.ok = true;
    out.gErr = (G._errors || []).map((e) => String(e.where || '') + ': ' + String(e.message || e.err || e).slice(0, 160));
    return out;
  }
  return { startFight, toPhase2, dieAndRespawn, teleRun, pc };
})();
`;

(async () => {
  if (want('contract')) {
  // ============================================================ 1. URL param / defaults / telegraphs()
  console.log('[params]');
  for (const [q, want] of [['test=1', 'easy'], ['test=1&mode=standard', 'standard'], ['test=1&mode=hardcore', 'hardcore'], ['test=1&mode=bogus', 'easy']]) {
    const r = await page(q + '&paused=1');
    const s = await r.ev(`return { d: G.game.difficulty(), pm: G.game.progress.mode, tele: G.game.telegraphs(), hc: G.game.isHardcore(), state: G.debug.state().difficulty, mode: G.game.mode };`);
    check(`?${q} -> ${want}`, s.d === want && s.pm === want && s.state === want && s.mode === 'play', s);
    check(`?${q} telegraphs() = ${want === 'easy'}`, s.tele === (want === 'easy') && s.hc === (want === 'hardcore'), s);
    check(`?${q} no page errors`, r.errors.length === 0, r.errors);
    await r.context.close();
  }

  // ============================================================ 2. migration
  console.log('[migration]');
  {
    const r = await page('test=1&paused=1');
    const s = await r.ev(`
      const m = G.game._internal.migrate;
      const legacy = m({ version: 1, cinders: 5 }, 0);
      const bogus = m({ mode: 'nightmare' }, 0);
      const std = m({ mode: 'standard', broken: true }, 0);
      const hc = m({ mode: 'hardcore', broken: true, wisp: { room: 'sh_01', x: 10, y: 10, cinders: 3 } }, 0);
      // a pre-modes save on disk: continue -> easy
      const old = G.game.defaultProgress(1); delete old.mode; delete old.broken; old.cinders = 77;
      G.Save.save(1, old);
      const sum = G.Save.summary(1);
      const okc = G.game.continueGame(1);
      return { legacy: legacy.mode, bogus: bogus.mode, std: [std.mode, std.broken], hc: [hc.mode, hc.broken, hc.wisp], sum: [sum.mode, sum.broken],
        cont: [okc, G.game.mode, G.game.difficulty(), G.game.progress.cinders] };
    `);
    check('legacy save (no mode) migrates to easy', s.legacy === 'easy' && s.sum[0] === 'easy' && s.sum[1] === false, s);
    check('invalid mode migrates to easy', s.bogus === 'easy', s);
    check('only hardcore can be broken', s.std[0] === 'standard' && s.std[1] === false, s);
    check('broken hardcore keeps broken, drops wisp', s.hc[0] === 'hardcore' && s.hc[1] === true && s.hc[2] === null, s);
    check('continue of a legacy save plays in easy', s.cont[0] === true && s.cont[1] === 'play' && s.cont[2] === 'easy' && s.cont[3] === 77, s);
    const rt = await r.ev(`
      G.game.newGame(2, 'standard'); G.debug.step(5);
      const a = G.Save.load(2).mode;
      G.game.quitToTitle(); G.debug.step(5);
      G.game.continueGame(2); G.debug.step(5);
      return { a, b: G.game.difficulty(), sum: G.Save.summary(2).mode, set: G.debug.setMode('hardcore'), after: G.game.difficulty() };
    `);
    check('save/load round-trips the mode', rt.a === 'standard' && rt.b === 'standard' && rt.sum === 'standard', rt);
    check('debug.setMode works', rt.set === 'hardcore' && rt.after === 'hardcore', rt);
    check('no page errors (migration)', r.errors.length === 0, r.errors);
    await r.context.close();
  }

  // ============================================================ 3. easy / standard deaths unchanged + wisp hook
  console.log('[death easy/standard + wisp hook]');
  for (const mode of ['easy', 'standard']) {
    const r = await page('test=1&paused=1&mode=' + mode);
    const s = await r.ev(`
      G.game.progress.cinders = 120;
      G.debug.step(5);
      const calls = [];
      G.wispSpotFor = (d) => { calls.push(Object.assign({}, d)); return null; };
      const room0 = G.game.room.id;
      let hpAtRespawn = null;
      G.events.on('respawn', () => { hpAtRespawn = G.game.progress.health; });
      G.game.playerDied();
      const brokeNow = !!G.game.progress.broken;
      const n = E.waitFor(() => G.game.mode === 'play', 400);
      const pr = G.game.progress;
      return { n, room0, brokeNow, mode: G.game.mode, wisp: pr.wisp, cinders: pr.cinders, hp: hpAtRespawn, max: G.game.maxHealth(), calls, ui: E.ui() };
    `);
    check(`${mode}: death respawns (play, full health, cinders 0)`, s.n > 0 && s.mode === 'play' && s.hp === s.max && s.cinders === 0 && !s.brokeNow, s);
    check(`${mode}: wisp left at the death spot with the cinders`, s.wisp && s.wisp.room === s.room0 && s.wisp.cinders === 120, s);
    check(`${mode}: wispSpotFor called once with {room,x,y,arenaActive:false,bossId:null}`, s.calls.length === 1 && s.calls[0].room === s.room0 &&
      isFinite(s.calls[0].x) && isFinite(s.calls[0].y) && s.calls[0].arenaActive === false && s.calls[0].bossId === null, s.calls);
    check(`${mode}: no page errors`, r.errors.length === 0, r.errors);
    await r.context.close();
  }
  {
    // boss arena: the hook gets arenaActive/bossId and its replacement spot is used (respawn and quit-mid-death)
    const r = await page('test=1&paused=1&mode=standard&abilities=all');
    const s = await r.ev(`
      const calls = [];
      G.wispSpotFor = (d) => { calls.push(Object.assign({}, d)); return d.arenaActive ? { room: 'gw_04', x: 100, y: 120 } : null; };
      G.debug.god(true);
      G.debug.teleport('gw_05');
      const arena = G.game.room.find((e) => e.type === 'arena');
      const before = G.game._internal.arenaInfo(G.game.room);
      E.step(10);
      arena.start();
      E.step(5);
      const during = G.game._internal.arenaInfo(G.game.room);
      G.game.progress.cinders = 55;
      G.debug.god(false);
      G.game.playerDied();
      const n = E.waitFor(() => G.game.mode === 'play', 400);
      E.step(20);
      const wisp1 = G.game.progress.wisp;
      // quit mid-death in the arena
      G.debug.teleport('gw_05'); E.step(10);
      const arena2 = G.game.room.find((e) => e.type === 'arena');
      if (arena2.state === 'wait') arena2.start(); else E.step(10);
      E.step(5);
      G.game.progress.cinders = 9;
      G.game.playerDied(); E.step(20);
      G.game.quitToTitle(); E.step(5);
      const saved = G.Save.load(0);
      return { room: 'gw_05', arenaBoss: arena && arena.bossId, before, during, n, calls, wisp1, wisp2: saved && saved.wisp };
    `);
    check('arenaInfo before trigger: inactive, bossId of the undefeated arena', s.before.arenaActive === false && s.before.bossId === s.arenaBoss && !!s.arenaBoss, s);
    check('arenaInfo during the fight: active + bossId', s.during.arenaActive === true && s.during.bossId === s.arenaBoss, s);
    check('wispSpotFor gets arenaActive:true + bossId on an arena death', s.calls[0] && s.calls[0].arenaActive === true && s.calls[0].bossId === s.arenaBoss && s.calls[0].room === 'gw_05', s.calls);
    check('the replacement spot is used for the wisp (respawn)', s.wisp1 && s.wisp1.room === 'gw_04' && s.wisp1.x === 100 && s.wisp1.y === 120 && s.wisp1.cinders === 55, s.wisp1);
    check('the replacement spot is used for the wisp (quit mid-death)', s.wisp2 && s.wisp2.room === 'gw_04' && s.wisp2.cinders === 9 && s.calls.length === 2, s);
    check('no page errors (wisp hook)', r.errors.length === 0, r.errors);
    await r.context.close();
  }

  // ============================================================ 4. title flow: mode select for all 3 modes (real storage)
  console.log('[title mode select]');
  const R = await page('paused=1');
  {
    const ev = R.ev;
    let s = await ev(`E.step(40); E.press('jump'); E.step(40); E.press('confirm'); E.step(40); const t = G.UI.find('title'); return { view: t.view, slotMode: t.slotMode };`);
    check('title: New Game -> slots', s.view === 'slots' && s.slotMode === 'new', s);
    s = await ev(`E.press('confirm'); E.step(30); const t = G.UI.find('title'); return { view: t.view, sel: t.modeSel, slot: t.newSlot };`);
    check('slot -> mode select, default cursor Standard', s.view === 'modes' && s.sel === 1 && s.slot === 0, s);
    await R.page.screenshot({ path: path.join(OUT, 'mode_select.png') });
    s = await ev(`E.press('cancel'); E.step(30); const t = G.UI.find('title'); return { view: t.view };`);
    check('mode select: Back returns to the slots', s.view === 'slots', s);
    s = await ev(`E.press('confirm'); E.step(30); E.press('confirm'); const n = E.waitFor(() => E.ui().includes('intro'), 300); E.step(30); E.press('cancel');
      const m = E.waitFor(() => G.game.mode === 'play' && !E.ui().includes('intro'), 600); E.step(10);
      return { n, m, mode: G.game.mode, d: G.game.difficulty(), tele: G.game.telegraphs(), raw: E.raw(0) && E.raw(0).mode };`);
    check('Standard chosen -> progress.mode standard, saved, telegraphs off', s.m >= 0 && s.d === 'standard' && s.raw === 'standard' && s.tele === false, s);
    // pause shows the mode
    s = await ev(`E.step(200); G.game.unlockPlayer && 0; G.UI.openPause(); E.step(30); return { ui: E.ui() };`);
    await R.page.screenshot({ path: path.join(OUT, 'pause_mode.png') });
    check('pause menu opens (mode label drawn)', s.ui.includes('pause'), s);
    s = await ev(`G.UI.closeAll(false); G.game.quitToTitle(); E.step(40); return { mode: G.game.mode };`);
    // Easy on slot 1
    s = await ev(`const t = G.UI.find('title'); t.sel = t.items.findIndex((i) => i.id === 'new'); E.press('confirm'); E.step(30);
      const t2 = G.UI.find('title'); const slotSel = t2.slotSel; E.press('confirm'); E.step(30); E.press('up'); E.step(5); const sel = t2.modeSel; E.press('confirm');
      E.waitFor(() => E.ui().includes('intro'), 300); E.press('cancel'); const m = E.waitFor(() => G.game.mode === 'play' && !E.ui().includes('intro'), 600);
      return { slotSel, sel, m, slot: G.game.slot, d: G.game.difficulty(), tele: G.game.telegraphs(), raw: E.raw(1) && E.raw(1).mode };`);
    check('Easy chosen on slot 1 -> progress.mode easy, telegraphs on', s.slotSel === 1 && s.sel === 0 && s.slot === 1 && s.d === 'easy' && s.raw === 'easy' && s.tele === true, s);
    // Hardcore on slot 2 (asks for a confirmation; No keeps the chooser)
    s = await ev(`G.game.quitToTitle(); E.step(40); const t = G.UI.find('title'); t.sel = t.items.findIndex((i) => i.id === 'new'); E.press('confirm'); E.step(30);
      const t2 = G.UI.find('title'); const slotSel = t2.slotSel; E.press('confirm'); E.step(30); E.press('down'); E.step(5); const sel = t2.modeSel; E.press('confirm'); E.step(20);
      const top1 = G.UI.top().name; E.press('confirm'); E.step(20); const top2 = G.UI.top().name; const view = t2.view;
      E.press('confirm'); E.step(20); E.press('left'); E.step(2); E.press('confirm');
      E.waitFor(() => E.ui().includes('intro'), 300); E.press('cancel'); const m = E.waitFor(() => G.game.mode === 'play' && !E.ui().includes('intro'), 600);
      return { slotSel, sel, top1, top2, view, m, slot: G.game.slot, d: G.game.difficulty(), tele: G.game.telegraphs(), raw: E.raw(2) && E.raw(2).mode };`);
    check('Hardcore asks for confirmation; "Cancel" stays on the chooser', s.sel === 2 && s.top1 === 'confirm_hardcore' && s.top2 === 'title' && s.view === 'modes', s);
    check('Hardcore chosen on slot 2 -> progress.mode hardcore, telegraphs off', s.slotSel === 2 && s.slot === 2 && s.d === 'hardcore' && s.raw === 'hardcore' && s.tele === false, s);

    // ============================================================ 5. hardcore death -> broken instantly -> game over -> title
    console.log('[hardcore permadeath]');
    s = await ev(`E.step(300); G.debug.god(false); G.game.progress.cinders = 40;
      G.game.playerDied();
      const raw = E.raw(2);
      const inst = { broken: raw && raw.broken, wisp: raw && raw.wisp, mode: G.game.mode };
      const n = E.waitFor(() => G.game.mode === 'gameover', 400);
      const ui = E.ui();
      return { inst, n, ui, wisp: G.game.progress && G.game.progress.wisp, tele: G.debug.teleport('sh_01') };`);
    check('hardcore death: save marked broken at the instant of death, no wisp', s.inst.broken === true && s.inst.wisp === null && s.inst.mode === 'dead', s);
    check('hardcore death: game-over screen after the death animation', s.n > 60 && s.ui.includes('gameover'), s);
    check('debug teleport refuses to resurrect', s.tele === false, s);
    await R.ev(`E.step(380);`);
    await R.page.screenshot({ path: path.join(OUT, 'gameover.png') });
    s = await ev(`const n = E.waitFor(() => G.game.mode === 'title' && E.ui().includes('title'), 1200); E.step(30); return { n, mode: G.game.mode, ui: E.ui(), sum: G.Save.summary(2) };`);
    check('game over -> title on its own', s.n >= 0 && s.mode === 'title', s);
    check('slot summary shows the broken hardcore run (region/time kept)', s.sum.exists && s.sum.broken === true && s.sum.mode === 'hardcore' && s.sum.playTime > 0 && !!s.sum.regionName, s.sum);
    s = await ev(`const t = G.UI.find('title'); t.sel = t.items.findIndex((i) => i.id === 'continue'); E.press('confirm'); E.step(30);
      const t2 = G.UI.find('title'); const usable = t2.slotUsable(2); t2.slotSel = 2; t2.eraseFocus = false; E.press('confirm'); E.step(40);
      return { usable, mode: G.game.mode, view: t2.view, ui: E.ui() };`);
    await R.page.screenshot({ path: path.join(OUT, 'slots_snuffed.png') });
    check('Continue on the snuffed slot is refused', s.usable === false && s.mode === 'title' && s.view === 'slots', s);
    s = await ev(`const ok = G.game.continueGame(2); E.step(10); return { ok, mode: G.game.mode, ui: E.ui() };`);
    check('engine continueGame on a broken slot refuses (stays on the title)', s.ok === false && s.mode === 'title' && s.ui.includes('title'), s);
    s = await ev(`G.UI.closeAll(false); G.game.openTitle(); E.step(10); const t = G.UI.find('title'); t.view = 'menu'; t.buildMenu(); t.sel = t.items.findIndex((i) => i.id === 'continue'); E.press('confirm'); E.step(30);
      const t2 = G.UI.find('title'); t2.slotSel = 2; E.press('right'); E.press('confirm'); E.step(20); const top = G.UI.top().name; E.press('left'); E.press('confirm'); E.step(20);
      return { top, exists: G.Save.exists(2), raw: E.raw(2) };`);
    check('Erase works on the snuffed slot', s.top === 'confirm_erase' && s.exists === false && s.raw === null, s);

    // ============================================================ 6. quit mid-death cannot resurrect
    console.log('[quit / reload mid-death]');
    s = await ev(`const ng = E.newGame(1, 'hardcore'); E.step(5);
      G.game.playerDied(); E.step(20); G.game.quitToTitle(); E.step(20);
      const sum = G.Save.summary(1); const ok = G.game.continueGame(1); E.step(5);
      return { ng, sum, ok, mode: G.game.mode };`);
    check('quit to title mid-death: slot stays broken, continue refused', s.sum.broken === true && s.ok === false && s.mode === 'title', s);
    // reload mid-death
    s = await ev(`G.Save.remove(1); const ng = E.newGame(1, 'hardcore'); E.step(5); G.game.playerDied(); E.step(3); return [ng, G.game.mode, G.game.difficulty()];`);
    check('reload test setup: hardcore run died', s[0] >= 0 && s[1] === 'dead' && s[2] === 'hardcore', s);
    await R.page.reload();
    await R.page.waitForFunction('window.G && G.ready', null, { timeout: 15000 });
    await R.page.evaluate(HELPERS);
    s = await R.ev(`E.step(20); const sum = G.Save.summary(1); const ok = G.game.continueGame(1); E.step(5); return { sum, ok, mode: G.game.mode, prog: !!G.game.progress };`);
    check('reload mid-death: slot broken, continue refused', s.sum.broken === true && s.ok === false && s.mode === 'title' && !s.prog, s);
    // easy/standard slot untouched by all this
    s = await R.ev(`return [G.Save.summary(0).mode, G.Save.summary(0).broken];`);
    check('the standard slot is untouched', s[0] === 'standard' && s[1] === false, s);
    check('no page errors (title flow)', R.errors.length === 0, R.errors.slice(0, 5));
  }
  await R.context.close();

  // ============================================================ 7. hardcore via a real hit (player.hurt path), test mode
  console.log('[hardcore real damage]');
  {
    const r = await page('test=1&paused=1&mode=hardcore');
    const s = await r.ev(`
      E.step(10);
      G.game.progress.health = 1;
      const p = G.game.player; p.invuln = 0;
      if (G.Combat && G.Combat.hurtPlayer) G.Combat.hurtPlayer(1, { x: p.x + 40, y: p.y, w: 10, h: 10 });
      else p.hurt(1, null);
      const now = { mode: G.game.mode, broken: G.game.progress.broken, saved: G.Save.load(0) && G.Save.load(0).broken };
      const n = E.waitFor(() => G.game.mode === 'gameover', 400);
      const m = E.waitFor(() => G.game.mode === 'title', 1500);
      return { now, n, m, wisp: G.Save.load(0) && G.Save.load(0).wisp };
    `);
    check('hardcore: lethal hit -> broken + saved at once', s.now.mode === 'dead' && s.now.broken === true && s.now.saved === true, s);
    check('hardcore: game over then title, no wisp', s.n > 0 && s.m > 0 && s.wisp === null, s);
    check('no page errors (hardcore real damage)', r.errors.length === 0, r.errors);
    await r.context.close();
  }

  }

  // ============================================================ 8. the Gutterwisp after a boss death, every boss (standard)
  if (want('wisp')) {
    console.log('[wisp after boss deaths]');
    for (const c of BOSSES) {
      const r = await page('test=1&paused=1&mute=1&mode=standard&room=' + c.arena + '&tx=' + c.entry[0] + '&ty=' + c.entry[1]);
      await r.page.evaluate(BOSS_HARNESS);
      const s = await r.page.evaluate((c) => {
        const g = G.game, pr = g.progress;
        G.debug.give('all');
        pr.sconce = { room: c.sconce[0], id: c.sconce[1] };
        pr.flags['sconce:' + c.sconce[1]] = true;
        pr.cinders = 137; pr.health = g.maxHealth();
        const calls = [];
        const orig = G.wispSpotFor;
        G.wispSpotFor = function (d) { calls.push(Object.assign({}, d)); return orig.apply(this, arguments); };
        const fight = BH.startFight(c.into);
        const d = fight.ok ? BH.dieAndRespawn() : null;
        G.wispSpotFor = orig;
        const w = pr.wisp && Object.assign({}, pr.wisp);
        const out = { fight, d, calls, wisp: w, respawnRoom: g.room.id };
        if (!w) return out;
        // go to the wisp's room (a few tiles away from it) and find the Gutterwisp entity
        if (g.player.resting) { g.player.resting = false; g.player.seat = null; }
        G.debug.god(true);
        const tx = Math.floor(w.x / 40), ty = Math.floor(w.y / 40);
        if (g.room.id !== w.room) G.debug.teleport(w.room, tx, ty);
        G.debug.step(30);
        const ent = g.room.find((e) => e.type === 'wisp' && !e.dead);
        out.entity = ent ? { room: g.room.id, x: ent.x + (ent.w || 0) / 2, y: ent.y + (ent.h || 0) / 2 } : null;
        const ar = g.room.findType('arena')[0];
        out.arenaHere = ar ? { state: ar.state, active: !!ar.active } : null;
        return out;
      }, c);
      const name = c.boss + ': ';
      if (!check(name + 'fight started by walking into the trigger', s.fight && s.fight.ok, s.fight)) { await r.context.close(); continue; }
      check(name + 'died in the arena (arenaActive, bossId ' + c.boss + ') and respawned at ' + c.sconce[1], s.d && s.d.ok && s.d.deathRoom === c.arena &&
        s.calls.length === 1 && s.calls[0].arenaActive === true && s.calls[0].bossId === c.boss && s.respawnRoom === c.sconce[0], { d: s.d, calls: s.calls });
      check(name + 'wisp moved to ' + c.wisp.join('/') + ' with the cinders', s.wisp && s.wisp.room === c.wisp[0] && Math.floor(s.wisp.x / 40) === c.wisp[1] && s.wisp.cinders === 137, s.wisp);
      // (a Gutterwisp drifts toward a player close by, so it may have moved a little since the teleport)
      check(name + 'the Gutterwisp waits there (entity in ' + c.wisp[0] + ', arena not running)', s.entity && s.entity.room === c.wisp[0] && Math.abs(s.entity.x - s.wisp.x) < 120 && Math.abs(s.entity.y - s.wisp.y) < 120 &&
        (!s.arenaHere || (s.arenaHere.state === 'wait' && !s.arenaHere.active)), { entity: s.entity, wisp: s.wisp, arena: s.arenaHere });
      check(name + 'no page errors', r.errors.length === 0, r.errors.slice(0, 3));
      await r.context.close();
    }
    // controls: death before the trigger moves it too; a won arena / ordinary room keeps the death spot; hardcore: none
    const r = await page('test=1&paused=1&mute=1&mode=standard&room=gw_05&tx=56&ty=14');
    await r.page.evaluate(BOSS_HARNESS);
    let s = await r.page.evaluate(() => {
      G.game.progress.cinders = 20; const pre = BH.dieAndRespawn(); const w1 = G.game.progress.wisp && Object.assign({}, G.game.progress.wisp);
      G.game.progress.wisp = null; G.game.progress.bosses.effigy = true;
      G.debug.teleport('gw_05', 56, 14); G.debug.step(10);
      const won = G.game.bossDefeated('effigy');
      G.game.progress.cinders = 30; const d2 = BH.dieAndRespawn(); const w2 = G.game.progress.wisp && Object.assign({}, G.game.progress.wisp);
      return { pre: pre.deathRoom, w1, won, d2room: d2.deathRoom, w2 };
    });
    check('death in an arena before its trigger: wisp moved too', s.pre === 'gw_05' && s.w1 && s.w1.room === 'gw_04', s);
    check('death in a won arena: wisp stays at the death spot', !s.won || (s.d2room === 'gw_05' && s.w2 && s.w2.room === 'gw_05'), s);
    await r.context.close();
    const h = await page('test=1&paused=1&mute=1&mode=hardcore&room=' + BOSSES[0].arena + '&tx=' + BOSSES[0].entry[0] + '&ty=' + BOSSES[0].entry[1]);
    await h.page.evaluate(BOSS_HARNESS);
    s = await h.page.evaluate((c) => {
      G.debug.give('all'); G.game.progress.cinders = 50;
      const fight = BH.startFight(c.into);
      const g = G.game, p = g.player;
      for (let f = 0; f < 600 && g.mode !== 'dead'; f++) { if (!p.dying && g.mode === 'play') { g.progress.health = 1; p.invuln = 0; p.hurt(1, { x: p.x, y: p.y, w: 1, h: 1, team: 'enemy' }); } if (g.mode !== 'dead') G.debug.step(1); }
      const inst = { mode: g.mode, broken: !!g.progress.broken, wisp: g.progress.wisp };
      let f = 0; for (; f < 2400 && g.mode !== 'title'; f++) G.debug.step(1);
      return { fight: fight.ok, inst, seenTitle: g.mode === 'title' };
    }, BOSSES[0]);
    check('hardcore boss death: broken at once, no wisp, game over → title', s.fight && s.inst.mode === 'dead' && s.inst.broken && !s.inst.wisp && s.seenTitle, s);
    check('no page errors (wisp controls)', r.errors.length === 0 && h.errors.length === 0, r.errors.concat(h.errors).slice(0, 3));
    await h.context.close();
  }

  // ============================================================ 9. boss telegraphs per mode (seeded, frame hashes)
  // Same seed, same input: Standard and Hardcore must render identically (telegraphs() is false in both); Easy must
  // differ (its explicit markers); every mode runs both phases with no errors. --shots writes an easy | standard
  // contact sheet per boss (test-output/modes_check/tele_<boss>.png).
  if (want('tele')) {
    console.log('[boss telegraphs per mode]');
    const sheets = [];
    for (const c of BOSSES) {
      const runs = {};
      for (const mode of ['easy', 'standard', 'hardcore']) {
        const r = await page('test=1&paused=1&mute=1&mode=' + mode + '&room=' + c.arena + '&tx=' + c.entry[0] + '&ty=' + c.entry[1]);
        await r.page.evaluate(BOSS_HARNESS);
        runs[mode] = await r.page.evaluate((a) => BH.teleRun(a.c, a.shots), { c, shots: SHOTS && mode !== 'hardcore' });
        runs[mode].errors = r.errors.slice();
        await r.context.close();
      }
      const e = runs.easy, st = runs.standard, hc = runs.hardcore;
      const same = st.hashes.filter((x, i) => x === hc.hashes[i]).length;
      const diff = e.hashes.filter((x, i) => x !== st.hashes[i]).length;
      check(c.boss + ': fight ran both phases in every mode', [e, st, hc].every((x) => x.ok && x.phase2), [e, st, hc].map((x) => ({ ok: x.ok, why: x.why, p2: x.phase2, d: x.difficulty })));
      check(c.boss + ': telegraphs() easy=true, standard/hardcore=false', e.tele === true && st.tele === false && hc.tele === false, [e.tele, st.tele, hc.tele]);
      check(c.boss + ': standard and hardcore render identically (' + same + '/' + st.hashes.length + ')', same === st.hashes.length && st.hashes.length > 0);
      check(c.boss + ': easy draws what standard does not (' + diff + ' frames differ)', diff > 0);
      check(c.boss + ': no page errors / G._errors in any mode', [e, st, hc].every((x) => x.errors.length === 0 && x.gErr.length === 0), [e, st, hc].map((x) => x.errors.concat(x.gErr).slice(0, 2)));
      if (SHOTS) {
        const idx = [];
        e.hashes.forEach((x, i) => { if (x !== st.hashes[i] && e.shots[i] && st.shots[i]) idx.push(i); });
        const pick = idx.filter((_, k) => k % Math.max(1, Math.floor(idx.length / 6)) === 0).slice(0, 6);
        sheets.push({ boss: c.boss, rows: pick.map((i) => [e.shots[i], st.shots[i]]) });
      }
    }
    if (SHOTS) {
      const { getBrowser } = require('./lib/browser');
      const b = await getBrowser(); const pg = await b.newPage();
      for (const sh of sheets) {
        if (!sh.rows.length) continue;
        const url = await pg.evaluate(async (rows) => {
          const load = (s) => new Promise((res) => { const i = new Image(); i.onload = () => res(i); i.src = s; });
          const W = 384, H = 216, c = document.createElement('canvas'); c.width = 2 * W + 4; c.height = rows.length * (H + 4);
          const x = c.getContext('2d'); x.fillStyle = '#000'; x.fillRect(0, 0, c.width, c.height);
          for (let r = 0; r < rows.length; r++) for (let j = 0; j < 2; j++) x.drawImage(await load(rows[r][j]), j * (W + 4), r * (H + 4), W, H);
          return c.toDataURL('image/png');
        }, sh.rows);
        fs.writeFileSync(path.join(OUT, 'tele_' + sh.boss + '.png'), Buffer.from(url.split(',')[1], 'base64'));
      }
      await pg.close();
      console.log('  contact sheets (easy | standard): ' + path.relative(process.cwd(), OUT) + '/tele_<boss>.png');
    }
  }

  // ============================================================ 10. engine edge cases (promoted from modes-fix-engine/r1)
  // Real storage (no test=1): a stale-tab hardcore death still breaks the run; game-over time = card time; a refused
  // Continue (broken / erased slot) reopens the title instead of a black screen or a silent New Game; another run in
  // the slot is never broken; quit mid-death empties Ember; Ember capped on Continue; an old save's wisp inside a boss
  // arena moves on Continue; a pre-runId hardcore save derives the same id in every window.
  if (want('engine')) {
    console.log('[engine edge cases]');
    const r = await page('paused=1');
    const ev = r.ev;
    const K = "'gutterlight.v1.slot0'";
    let s = await ev(`E.step(40); E.newGame(0,'hardcore'); E.step(200);
      const o=E.raw(0); o._stamp='tabB'; localStorage.setItem(${K}, JSON.stringify(o));
      let info=null; G.events.on('gameOver',(e)=>{info=e;});
      G.debug.god(false); G.game.playerDied(); const inst=E.raw(0).broken;
      E.waitFor(()=>G.game.mode==='gameover',400);
      E.waitFor(()=>G.game.mode==='title' && E.ui().includes('title'),3000);
      const raw=E.raw(0); const ok=G.game.continueGame(0); E.step(10);
      return {inst, rawPT: raw.playTime, goPT: info&&info.playTime, wisp: raw.wisp, ok, mode:G.game.mode, ui:E.ui()};`);
    check('engine: stale-tab hardcore death is recorded at once', s.inst === true && s.wisp === null, s);
    check('engine: game-over play time equals the saved play time', s.goPT === s.rawPT && s.rawPT > 0, s);
    check('engine: Continue on it is refused, title shown', s.ok === false && s.mode === 'title' && s.ui.includes('title'), s);
    s = await ev(`G.Save.remove(0); E.newGame(0,'hardcore'); E.step(30);
      const o=E.raw(0); o._stamp='tabC'; o.runId='other-run'; localStorage.setItem(${K}, JSON.stringify(o));
      G.debug.god(false); G.game.playerDied(); const raw=E.raw(0);
      E.waitFor(()=>G.game.mode==='title' && E.ui().includes('title'),3000);
      return {broken: raw.broken, runId: raw.runId};`);
    check('engine: another run stored in the slot is left alone', s.broken === false && s.runId === 'other-run', s);
    s = await ev(`const o=E.raw(0); o.broken=true; localStorage.setItem(${K}, JSON.stringify(o));
      G.UI.dismiss(G.UI.find('title')); E.step(2); const before=E.ui();
      const ok=G.game.continueGame(0); E.step(10); return {before, ok, mode:G.game.mode, ui:E.ui(), p:G.game.progress};`);
    check('engine: refused broken Continue reopens a dismissed title', s.ok === false && s.mode === 'title' && s.ui.includes('title') && s.p === null && !s.before.includes('title'), s);
    s = await ev(`localStorage.removeItem(${K}); G.UI.dismiss(G.UI.find('title')); E.step(2);
      let ref=null; G.events.on('continueRefused',(e)=>{ref=e.reason;});
      const ok=G.game.continueGame(0); E.step(30); return {ok, ref, mode:G.game.mode, ui:E.ui(), raw:E.raw(0)};`);
    check('engine: Continue on an erased slot is refused (no New Game)', s.ok === false && s.ref === 'missing' && s.mode === 'title' && s.ui.includes('title') && s.raw === null, s);
    s = await ev(`G.Save.remove(0); E.newGame(0,'standard'); E.step(30); const g=G.game;
      g.progress.ember=99; g.progress.cinders=50; G.debug.god(false); g.playerDied(); E.step(5); g.quitToTitle(); E.step(5);
      const a=E.raw(0); g.continueGame(0); E.step(5);
      const b={ember:g.progress.ember, max:g.emberMax(), wisp:!!g.progress.wisp};
      g.progress.wisp=null; g.progress.ember=99; g.saveNow(); g.quitToTitle(); const o=E.raw(0); o.ember=99; o.wisp={room:'gw_05',x:1540,y:573,cinders:300}; localStorage.setItem(${K}, JSON.stringify(o)); G.Save.load(0);
      g.continueGame(0); E.step(5);
      return {savedEmber:a.ember, savedWisp:!!a.wisp, b, c:{ember:g.progress.ember, max:g.emberMax(), wisp:g.progress.wisp, raw:E.raw(0).wisp}};`);
    check('engine: quit mid-death empties Ember (like respawn)', s.savedEmber === 0 && s.savedWisp && s.b.ember === 0, s);
    check('engine: Continue caps Ember at emberMax', s.c.ember === s.c.max && s.c.max > 0, s);
    check('engine: old-save wisp in the Effigy arena moves on Continue (cinders kept, saved)', s.c.wisp && s.c.wisp.room === 'gw_04' && s.c.wisp.cinders === 300 && s.c.raw && s.c.raw.room === 'gw_04', s);
    s = await ev(`G.game.quitToTitle(); G.Save.remove(0); E.newGame(0,'hardcore'); E.step(30); G.game.quitToTitle();
      const o=E.raw(0); delete o.runId; localStorage.setItem(${K}, JSON.stringify(o));
      G.game.continueGame(0); const a=G.game.progress.runId; G.game.progress=null; G.game.quitToTitle();
      localStorage.setItem(${K}, JSON.stringify(o)); G.game.continueGame(0); const b=G.game.progress.runId;
      const o2=E.raw(0); o2._stamp='tabD'; localStorage.setItem(${K}, JSON.stringify(o2));
      G.debug.god(false); G.game.playerDied(); return {a, b, broken:E.raw(0).broken};`);
    check('engine: pre-runId hardcore save derives the same run id; a stale death still breaks it', s.a && s.a === s.b && s.broken === true, s);
    check('engine: no page errors', r.errors.length === 0, r.errors.slice(0, 3));
    await r.context.close();
  }

  // ============================================================ 11. Effigy leap landing mark (promoted from modes-fix-boss-effigy)
  // Kept-subtle exception (docs/api/boss-effigy.md): a leap that takes off outside the camera view gets a dim landing
  // mark (keep 'subtle') with >= 0.45 s lead in standard/hardcore; a leap taken off in view gets no mark.
  if (want('leap')) {
    console.log('[effigy leap landing mark]');
    const c = BOSSES.find((b) => b.boss === 'effigy');
    const cases = [{ open: true }, { dx: -400, ph: 1 }, { dx: -1150, ph: 1 }, { dx: 950, ph: 1 }, { dx: 1150, ph: 2 }];
    for (const mode of ['standard', 'hardcore']) {
      for (const cs of cases) {
        const r = await page('test=1&paused=1&mute=1&mode=' + mode + '&room=' + c.arena + '&tx=' + c.entry[0] + '&ty=' + c.entry[1]);
        await r.page.evaluate(BOSS_HARNESS);
        const out = await r.page.evaluate(({ c, cs }) => {
          G.debug.give('all'); const f = BH.startFight(c.into); if (!f.ok) return { err: f };
          const ar = G.game.room.findType('arena')[0]; let b = ar.boss; const g = G.game, p = g.player, cam = G.camera;
          if (!cs.open) {
            if (cs.ph >= 2) { BH.toPhase2(); b = ar.boss; }
            b.endAttack(99); b.restTime = 99; for (let i = 0; i < 30; i++) G.debug.step(1);
            const R = g.room.widthPx, dx = cs.dx, px = R / 2 + (dx > 0 ? -Math.min(600, Math.abs(dx) / 2) : Math.min(600, Math.abs(dx) / 2));
            p.placeAt(px - p.w / 2, p.y); if (p.motor) p.motor.vx = 0; b.x = Math.max(80, Math.min(R - 80, px + dx)) - b.w / 2;
            for (let i = 0; i < 90; i++) { b.restTime = 99; G.debug.step(1); } if (b.face) b.face(); b.startAttack('leap');
          }
          let hit = -1, fr = 0, mark = -1, keep = null, firstAtk = null; G.events.on('playerHurt', () => { if (hit < 0) hit = fr; });
          for (; fr < 400; fr++) {
            if (!cs.open) { g.progress.health = Math.max(g.progress.health, 5); b.restTime = Math.max(b.restTime || 0, 5); }
            b = ar.boss; if (b.state && b.state !== 'idle' && !firstAtk && /leap|slam|combo|debris|hurl/.test(b.state)) firstAtk = b.state;
            if (mark < 0 && b.marks && b.marks.length && b.state === 'leap') { mark = fr; keep = b.marks[b.marks.length - 1].keep; }
            G.debug.step(1); if (hit >= 0) break;
          }
          return { firstAtk, mark, keep, hit, lead: hit >= 0 && mark >= 0 ? +((hit - mark) / 60).toFixed(2) : null };
        }, { c, cs });
        const off = cs.open || Math.abs(cs.dx) >= 900;
        const name = 'effigy leap ' + mode + ' ' + (cs.open ? 'fight opening' : 'dx ' + cs.dx + ' phase ' + cs.ph) + (off ? ': off-screen -> subtle mark, lead >= 0.45 s' : ': in view -> no mark');
        check(name, !out.err && out.firstAtk === 'leap' && out.hit >= 0 && (off ? out.keep === 'subtle' && out.lead >= 0.45 : !out.keep) && !r.errors.length, { out, err: r.errors.slice(0, 2) });
        await r.context.close();
      }
    }
  }

  await closeAll();
  const summary = `modes_check: ${pass} passed, ${fail} failed` + (failures.length ? '\n  ' + failures.join('\n  ') : '');
  console.log('\n' + summary);
  console.log(fail ? 'FAILED (' + fail + ' of ' + (pass + fail) + ' checks)' : 'ALL PASS (' + pass + ' checks)');
  fs.writeFileSync(path.join(OUT, 'result.txt'), summary + '\n');
  process.exit(fail ? 1 : 0);
})().catch(async (e) => { console.error(e); await closeAll(); process.exit(2); });

