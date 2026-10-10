#!/usr/bin/env node
// Engine self-test: Node loader check + scripted headless play in the dev rooms (src/data/test_rooms.js).
// Prints PASS/FAIL per check; exit code 1 on any failure (or unexpected console errors).
//
//   node tools/engine_selftest.js            all checks
//   node tools/engine_selftest.js swim dash  only checks whose name contains one of the words
'use strict';
const path = require('path');
const fs = require('fs');
const { loadGame, scriptOrder, isNodeLoadable, ROOT } = require('./lib/node_loader');
const { openGame, closeAll } = require('./lib/browser');

const filters = process.argv.slice(2).map((s) => s.toLowerCase());
const results = [];
function report(name, ok, detail) {
  results.push({ name, ok });
  console.log((ok ? 'PASS  ' : 'FAIL  ') + name.padEnd(52) + (detail ? '  ' + detail : ''));
}
const wanted = (name) => !filters.length || filters.some((f) => name.toLowerCase().includes(f));

// ------------------------------------------------------------------------------------------ Node side
function nodeChecks() {
  if (!wanted('node')) return;
  const G = loadGame({ quiet: true });
  const errs = G.__loader.errors;
  const expected = scriptOrder().filter(isNodeLoadable);
  report('node: all Node-loadable files load', errs.length === 0 && G.__loader.loaded.length === expected.length,
    errs.length ? errs.map((e) => e.file + ': ' + e.error.split('\n')[0]).join(' | ') : G.__loader.loaded.length + ' files');
  report('node: 10 regions + test defined', Object.keys(G.World.regions).length === 11);
  const dev = G.World.listRooms({ dev: true });
  report('node: dev rooms defined without warnings', dev.length >= 5 && !G.World.warnings.some((w) => /dev_/.test(w)), dev.join(','));
  const r = G.World.instantiate('dev_01', { tileOnly: true });
  report('node: TileRoom instantiates in Node', r.cols === 80 && r.rows === 18 && r.openings.length === 4);
  report('node: PlayerMotor.METRICS present', !!(G.PlayerMotor && G.PlayerMotor.METRICS && G.PlayerMotor.METRICS.jumpApex));
}

// ------------------------------------------------------------------------------------------ in-page helpers
const HELPERS = `
window.H = {
  reset() {
    G.debug.clearInput();
    G.game.god = false;
    G.game.newGame(0);
    G.debug.step(2);
  },
  tp(room, tx, ty) { G.debug.teleport(room, tx, ty); G.debug.step(1); },
  m() { return G.game.player.motor; },
  feet() { const m = H.m(); return m.y + m.h; },
  cx() { const m = H.m(); return m.x + m.w / 2; },
  // Drive frame by frame: f(i, motor) → virtual input; stops early when until(motor, i) is true.
  drive(frames, f, until) {
    let i = 0;
    for (; i < frames; i++) {
      G.input.setVirtual((f ? f(i, H.m()) : null) || {});
      G.game.step();
      if (until && until(H.m(), i)) { i++; break; }
    }
    G.input.clearVirtual();
    G.debug.render();
    return i;
  },
  waitPlay(max) { return H.drive(max || 240, null, () => G.game.mode === 'play' && !G.game.isLocked() && G.game.sysFadeAlpha < 0.01); },
};
`;

// ------------------------------------------------------------------------------------------ browser checks
const CHECKS = [
  ['boot: ready in play mode in dev_01', `
    H.reset();
    const s = G.debug.state();
    return { ok: G.ready && s.mode === 'play' && !!s.room && s.player && s.player.onGround, detail: s.room + ' ' + s.player.type };
  `],
  ['run: instant accel/stop at 330 px/s', `
    H.reset(); H.tp('dev_01', 12, 15);
    H.drive(3, () => ({ right: true }));
    const v1 = H.m().vx;
    const x0 = H.m().x;
    H.drive(30, () => ({ right: true }));
    const dx = H.m().x - x0;
    H.drive(3, () => ({}));
    const v2 = H.m().vx;
    return { ok: v1 === 330 && v2 === 0 && Math.abs(dx - 165) < 2, detail: 'v=' + v1 + ' dx(30f)=' + dx.toFixed(1) + ' stop v=' + v2 };
  `],
  ['ledge: jump onto 4-tile ledge', `
    H.reset(); H.tp('dev_01', 45, 15);
    H.drive(24, () => ({ jump: true }));
    H.drive(60, () => ({ jump: true, right: true }), (m) => m.onGround);
    const m = H.m();
    return { ok: m.onGround && H.feet() === 480, detail: 'feet=' + H.feet() + ' (top 480)' };
  `],
  ['ledge: 6-tile ledge unreachable without wings', `
    H.reset(); H.tp('dev_01', 57, 15);
    let best = 1e9;
    H.drive(120, (i) => (i < 26 ? { jump: true } : { jump: i < 60, right: i < 70 }), (m) => { if (m.onGround) best = Math.min(best, m.y + m.h); return false; });
    H.tp('dev_01', 57, 15);
    let best2 = 1e9;
    H.drive(120, (i) => ({ jump: i < 50, right: true }), (m) => { if (m.onGround) best2 = Math.min(best2, m.y + m.h); return false; });
    return { ok: best > 400 && best2 > 400, detail: 'highest grounded feet=' + Math.min(best, best2) + ' (ledge top 400)' };
  `],
  ['ledge: 7-tile ledge reachable with wings', `
    H.reset(); G.debug.give('wings'); H.tp('dev_01', 63, 15);
    // the dev heartwax pickup sits on this ledge; its (blocking) item card would freeze the jump mid-air
    for (const e of G.game.room.entities) if (e.type === 'pickup') e.remove();
    G.debug.step(1);
    H.drive(28, () => ({ jump: true }));
    H.drive(2, () => ({}));
    H.drive(60, (i) => ({ jump: true, right: i > 14 }), (m) => m.onGround);
    return { ok: H.m().onGround && H.feet() === 360, detail: 'feet=' + H.feet() + ' (top 360)' };
  `],
  ['gap: cross 6-tile gap (no abilities)', `
    H.reset(); H.tp('dev_02', 16, 15);
    let jumped = -1;
    H.drive(160, (i, m) => {
      if (jumped < 0 && m.x + m.w >= 798) jumped = i;
      return { right: true, jump: jumped >= 0 && i - jumped < 30 };
    }, (m, i) => jumped >= 0 && i - jumped > 5 && m.onGround);
    const c = H.cx() / 40;
    return { ok: H.m().onGround && H.feet() === 640 && c >= 26 && c < 32 && G.game.progress.health === 5, detail: 'landed col ' + c.toFixed(1) };
  `],
  ['gap: 9-tile gap fails without dash (spikes)', `
    H.reset(); H.tp('dev_02', 28, 15);
    let jumped = -1, hz = false;
    H.drive(200, (i, m) => {
      if (jumped < 0 && m.x + m.w >= 1278) jumped = i;
      if (m.hazard) hz = true;
      return { right: true, jump: jumped >= 0 && i - jumped < 30 };
    }, (m, i) => hz || (jumped >= 0 && i - jumped > 5 && m.onGround));
    return { ok: hz, detail: hz ? 'fell into the spikes' : 'landed at col ' + (H.cx() / 40).toFixed(1) };
  `],
  ['gap: dash across 9-tile gap after give(dash)', `
    const tryDash = (dashAt) => {
      H.reset(); G.debug.give('dash'); H.tp('dev_02', 28, 15);
      let jumped = -1;
      H.drive(200, (i, m) => {
        if (jumped < 0 && m.x + m.w >= 1278) jumped = i;
        const k = jumped < 0 ? -1 : i - jumped;
        return { right: true, jump: k >= 0 && k < 30, dash: k === dashAt };
      }, (m, i) => jumped >= 0 && i - jumped > 5 && (m.onGround || !!m.hazard));
      const m = H.m();
      return m.onGround && !m.hazard && H.feet() === 640 && m.x + m.w > 41 * 40 && H.cx() < 47 * 40;
    };
    const apex = tryDash(30), late = tryDash(44);
    return { ok: apex && late, detail: 'dash at apex: ' + apex + ', while falling: ' + late };
  `],
  ['gap: 12-tile gap impossible even with dash', `
    H.reset(); G.debug.give('dash'); H.tp('dev_02', 43, 15);
    let jumped = -1, hz = false;
    H.drive(220, (i, m) => {
      if (jumped < 0 && m.x + m.w >= 1878) jumped = i;
      if (m.hazard) hz = true;
      const k = jumped < 0 ? -1 : i - jumped;
      return { right: true, jump: k >= 0 && k < 30, dash: k === 22 };
    }, (m, i) => hz || (jumped >= 0 && i - jumped > 5 && m.onGround));
    return { ok: hz, detail: hz ? 'fell' : 'landed col ' + (H.cx() / 40).toFixed(1) };
  `],
  ['grip: single-wall climb of the 29-tile pillar', `
    H.reset(); G.debug.give('grip'); H.tp('dev_shaft', 12, 34);
    let minFeet = 1e9, grips = 0;
    H.drive(900, (i) => ({ right: true, jump: (i % 16) < 11 }), (m) => {
      minFeet = Math.min(minFeet, m.y + m.h);
      if (m.events.indexOf('grip') >= 0) grips++;
      return m.y + m.h <= 250;
    });
    return { ok: minFeet <= 250, detail: 'climbed ' + ((1400 - minFeet) / 40).toFixed(1) + ' tiles, grips=' + grips };
  `],
  ['grip: no climb without the ability', `
    H.reset(); H.tp('dev_shaft', 12, 34);
    let minFeet = 1e9;
    H.drive(400, (i) => ({ right: true, jump: (i % 16) < 11 }), (m) => { minFeet = Math.min(minFeet, m.y + m.h); return false; });
    return { ok: (1400 - minFeet) / 40 < 5, detail: 'rose ' + ((1400 - minFeet) / 40).toFixed(1) + ' tiles' };
  `],
  ['glazed: X wall cannot be gripped (# wall can)', `
    H.reset(); G.debug.give('grip'); H.tp('dev_shaft', 20, 34);
    let gripX = 0, maxVy = 0, minFeetX = 1e9;
    H.drive(300, (i) => ({ right: true, jump: (i % 16) < 11 }), (m) => {
      if (m.wall || m.events.indexOf('grip') >= 0) gripX++;
      minFeetX = Math.min(minFeetX, m.y + m.h);
      return false;
    });
    H.tp('dev_shaft', 17, 34);
    let gripHash = 0;
    H.drive(90, (i) => ({ left: true, jump: i < 20 }), (m) => { if (m.events.indexOf('grip') >= 0) gripHash++; return false; });
    return { ok: gripX === 0 && gripHash > 0 && (1400 - minFeetX) / 40 < 5, detail: 'X grips=' + gripX + ' rise=' + ((1400 - minFeetX) / 40).toFixed(1) + ' #grips=' + gripHash };
  `],
  ['swim: oilcloak floats across the pool and the low tunnel', `
    H.reset(); G.debug.give('oilcloak'); H.tp('dev_water', 47, 15);
    let swam = 0, hz = null;
    H.drive(900, () => ({ left: true }), (m) => { if (m.swimming) swam++; if (m.hazard) hz = m.hazard; return !!hz || H.cx() < 6 * 40; });
    const m = H.m();
    return { ok: !hz && swam > 60 && H.cx() < 6 * 40 && G.game.progress.health === 5, detail: 'swim frames=' + swam + ' end col ' + (H.cx() / 40).toFixed(1) + (hz ? ' hazard=' + hz : '') };
  `],
  ['swim: body floats ~60% above the surface', `
    H.reset(); G.debug.give('oilcloak'); H.tp('dev_water', 47, 15);
    H.drive(200, () => ({ left: true }), () => H.cx() < 37 * 40);
    H.drive(90, () => ({}));
    const m = H.m();
    const above = (640 - m.y) / m.h;
    return { ok: m.swimming && above > 0.5 && above < 0.7, detail: 'above=' + above.toFixed(2) };
  `],
  ['water: hazard without oilcloak, back to lastSafe', `
    H.reset(); H.tp('dev_water', 47, 15);
    let hz = null;
    H.drive(200, () => ({ left: true }), (m) => { if (m.hazard) hz = m.hazard; return !!hz; });
    const hp = G.game.progress.health;
    H.waitPlay(240);
    const m = H.m();
    const c = H.cx() / 40;
    return { ok: hz === 'water' && hp === 4 && m.onGround && H.feet() === 640 && c > 45 && c < 50 && !m.hazard, detail: 'hazard=' + hz + ' hp=' + hp + ' back at col ' + c.toFixed(1) };
  `],
  ['hazard: spikes → 1 damage → respawn at lastSafe', `
    H.reset(); H.tp('dev_02', 7, 15);
    let hz = null;
    H.drive(200, () => ({ right: true }), (m) => { if (m.hazard) hz = m.hazard; return !!hz; });
    const hp = G.game.progress.health;
    H.waitPlay(240);
    const c = H.cx() / 40;
    return { ok: hz === 'spikes' && hp === 4 && H.m().onGround && c <= 10 && c > 1, detail: 'hazard=' + hz + ' hp=' + hp + ' respawn col ' + c.toFixed(1) };
  `],
  ['lava: always a hazard (even with oilcloak)', `
    H.reset(); G.debug.give('oilcloak'); H.tp('dev_water', 55, 15);
    let hz = null;
    H.drive(200, () => ({ left: true }), (m) => { if (m.hazard) hz = m.hazard; return !!hz; });
    H.waitPlay(240);
    return { ok: hz === 'lava' && G.game.progress.health === 4, detail: 'hazard=' + hz };
  `],
  ['platform: drop through with down+jump', `
    H.reset(); H.tp('dev_01', 5, 7);
    const y0 = H.feet();
    H.drive(3, () => ({ down: true, jump: true }));
    H.drive(60, () => ({}), (m) => m.onGround && m.y + m.h > y0 + 10);
    return { ok: y0 === 320 && H.feet() === 480, detail: 'from ' + y0 + ' to ' + H.feet() };
  `],
  ['secret pockets: auto-veil until the B wall breaks (fades while the player is inside)', `
    H.reset(); H.tp('dev_below', 61, 15); G.debug.step(30); G.debug.render();
    const room = G.game.room, hp = G.World.hiddenPockets(room.def), V = room.artCache && room.artCache.veil;
    const at = () => +G.Art.veilAlphaAt(room, 20 * 40 + 20, 14 * 40 + 20).toFixed(2);
    const a0 = at();
    H.tp('dev_below', 20, 15); G.debug.step(30); const aIn = at();
    H.tp('dev_below', 61, 15); G.debug.step(30); const aOut = at();
    room.breakComponentAt(58, 5); G.debug.step(60); const a1 = at();
    const pk = hp && hp.pockets[0];
    return { ok: !!pk && hp.pockets.length === 1 && pk.tiles.length > 500 && !!V && !!V.sprites && V.sprites.length === 1 && a0 === 1 && aIn === 0 && aOut === 1 && a1 === 0 && G.World.pocketRevealed(pk, room),
      detail: JSON.stringify({ pockets: hp && hp.pockets.map((p) => p.id + ' n=' + p.tiles.length), a0, aIn, aOut, a1, ms: room.artCache && room.artCache.timing.veil }) };
  `],
  ['breakable: B wall breaks on the 3rd debug slash', `
    H.reset(); H.tp('dev_below', 61, 15);
    H.drive(2, () => ({ left: true }));
    const room = G.game.room;
    const comp = room.componentAt(58, 5);
    const hits = [];
    for (let k = 0; k < 3; k++) {
      H.drive(1, () => ({ attack: true }));
      H.drive(26, () => ({}));
      hits.push(comp.hits + (comp.broken ? 'b' : ''));
    }
    const flag = G.game.getFlag('broken:' + comp.id);
    return { ok: comp.broken && hits[0] === '1' && hits[1] === '2' && room.tileAt(58, 5) === G.T.EMPTY && flag === true, detail: 'hits ' + hits.join(',') + ' flag=' + flag };
  `],
  ['breakable: stays broken after re-entering the room', `
    G.debug.teleport('dev_01', 12, 15); G.debug.step(1);
    G.debug.teleport('dev_below', 61, 15); G.debug.step(1);
    const comp = G.game.room.componentAt(58, 5);
    return { ok: !!comp && comp.broken && G.game.room.tileAt(58, 5) === G.T.EMPTY, detail: comp ? comp.id : 'none' };
  `],
  ['plunge: breaks the D floor and lands below', `
    H.reset(); G.debug.give('plunge'); H.tp('dev_below', 29, 9);
    G.game.progress.ember = 33;   // a plunge costs 33 Ember (DESIGN 3.3)
    const y0 = H.feet();
    H.drive(10, () => ({ jump: true }));
    H.drive(1, () => ({ down: true, spell: true }));
    let landed = false, plunged = false;
    H.drive(120, () => ({ down: true }), (m) => { if (m.plunging) plunged = true; if (m.events.indexOf('plungeLand') >= 0) landed = true; return landed; });
    const comp = G.game.room.componentAt(29, 10);
    return { ok: y0 === 400 && plunged && landed && comp.broken && H.feet() === 640 && G.game.getFlag('broken:' + comp.id) === true, detail: 'feet ' + y0 + ' → ' + H.feet() };
  `],
  ['transition: W (dev_01 → dev_water)', `
    H.reset(); H.tp('dev_01', 2, 15);
    H.drive(120, () => ({ left: true }), () => G.game.room.id === 'dev_water');
    H.waitPlay(60); H.drive(20, () => ({}));
    const r = G.game.room, c = H.cx() / 40;
    return { ok: r.id === 'dev_water' && c > 60 && c < 64 && H.m().onGround && H.feet() === 640, detail: r.id + ' col ' + c.toFixed(1) + ' feet ' + H.feet() };
  `],
  ['transition: E (dev_01 → dev_02)', `
    H.reset(); H.tp('dev_01', 77, 15);
    H.drive(120, () => ({ right: true }), () => G.game.room.id === 'dev_02');
    H.waitPlay(60); H.drive(20, () => ({}));
    const r = G.game.room, c = H.cx() / 40;
    return { ok: r.id === 'dev_02' && c > 0 && c < 4 && H.m().onGround && H.feet() === 640, detail: r.id + ' col ' + c.toFixed(1) + ' feet ' + H.feet() };
  `],
  ['transition: N (dev_01 → dev_shaft, boost onto ledge)', `
    H.reset(); H.tp('dev_01', 5, 3);
    H.drive(60, () => ({ jump: true }), () => G.game.room.id === 'dev_shaft');
    const entered = G.game.room.id;
    H.waitPlay(60);
    let minFeet = 1e9;
    H.drive(120, () => ({ right: true }), (m) => { minFeet = Math.min(minFeet, m.y + m.h); return m.onGround; });
    const rise = (1440 - minFeet) / 40;
    return { ok: entered === 'dev_shaft' && H.m().onGround && H.feet() === 1400 && rise > 2.5, detail: entered + ' rise=' + rise.toFixed(2) + ' tiles, feet ' + H.feet() };
  `],
  ['transition: S (dev_01 pit → dev_below)', `
    H.reset(); H.tp('dev_01', 68, 15);
    H.drive(120, () => ({ right: true }), () => G.game.room.id === 'dev_below');
    const r = G.game.room;
    const y = H.m().y;
    H.waitPlay(60);
    H.drive(90, () => ({}), (m) => m.onGround);
    return { ok: r.id === 'dev_below' && y < 40 && H.m().onGround, detail: r.id + ' entry y=' + Math.round(y) + ' landed feet ' + H.feet() };
  `],
  ['death: respawn at start without a sconce, wisp data', `
    H.reset(); H.tp('dev_02', 30, 15);
    G.game.addCinders(57);
    G.game.progress.health = 1;
    G.game.player.hurt(1, { x: H.cx() + 30, y: 600, w: 0, h: 0 });
    const dead = G.game.mode;
    H.drive(400, () => ({}), () => G.game.mode === 'play' && G.game.sysFadeAlpha < 0.01);
    const pr = G.game.progress, start = G.game._internal.startLocation();
    return { ok: dead === 'dead' && G.game.mode === 'play' && G.game.room.id === start.room && pr.health === G.game.maxHealth() &&
      pr.cinders === 0 && pr.wisp && pr.wisp.room === 'dev_02' && pr.wisp.cinders === 57 && G.game.emberMax() === 66,
      detail: 'room ' + G.game.room.id + ' wisp ' + JSON.stringify(pr.wisp) };
  `],
  ['death: respawn at the rested sconce', `
    H.reset(); H.tp('dev_01', 14, 15);
    G.game.rest({ room: G.game.room, persistId: 'dev_sconce' });
    H.tp('dev_02', 30, 15);
    G.game.progress.health = 1;
    G.game.player.hurt(1, null);
    H.drive(400, () => ({}), () => G.game.mode === 'play' && G.game.sysFadeAlpha < 0.01);
    const c = H.cx() / 40;
    return { ok: G.game.room.id === 'dev_01' && c > 13.5 && c < 15.5 && G.game.progress.sconce.id === 'dev_sconce', detail: G.game.room.id + ' col ' + c.toFixed(1) };
  `],
  ['god mode blocks damage', `
    H.reset(); G.debug.god(true);
    const ok1 = G.Combat.hurtPlayer(1, { x: 0, y: 0 });
    G.debug.god(false);
    const ok2 = G.Combat.hurtPlayer(1, { x: 0, y: 0 });
    return { ok: !ok1 && ok2 && G.game.progress.health === 4, detail: 'hp ' + G.game.progress.health };
  `],
  ['save/load round-trip (memory only in test mode)', `
    H.reset(); H.tp('dev_01', 14, 15);
    G.game.rest({ room: G.game.room, persistId: 'dev_sconce' });
    G.game.addCinders(321); G.game.setFlag('lever:dev_lv1'); G.debug.give('dash'); G.game.giveItem('sigil:steadfast', { silent: true });
    G.game.equip('steadfast');
    G.game.saveNow();
    const saved = G.Save.load(0);
    const same = JSON.stringify(saved) === JSON.stringify(G.game.progress);
    H.tp('dev_02', 30, 15);
    G.game.quitToTitle();
    const titleMode = G.game.mode;
    G.game.continueGame(0);
    H.drive(5);
    const p = G.game.progress;
    let ls = 0; try { for (let i = 0; i < localStorage.length; i++) if (/gutterlight/.test(localStorage.key(i))) ls++; } catch (e) { ls = 0; }
    return { ok: same && titleMode === 'title' && p.cinders === 321 && p.flags['lever:dev_lv1'] && p.abilities.dash && G.game.isEquipped('steadfast') &&
      G.game.room.id === 'dev_01' && G.Save.memoryOnly && ls === 0, detail: 'room ' + G.game.room.id + ' cinders ' + p.cinders + ' localStorage keys ' + ls };
  `],
  ['hitstop freezes the player, game time continues', `
    H.reset(); H.tp('dev_01', 12, 15);
    H.drive(2, () => ({ right: true }));
    const x0 = H.m().x, t0 = G.game.t;
    G.game.hitstop(0.1);
    H.drive(5, () => ({ right: true }));
    const x1 = H.m().x;
    H.drive(6, () => ({ right: true }));
    const x2 = H.m().x;
    return { ok: x1 === x0 && x2 > x1 && G.game.t > t0, detail: 'frozen dx=' + (x1 - x0) + ' after dx=' + (x2 - x1).toFixed(1) };
  `],
  ['pause (UI blocking) freezes gameplay; resume', `
    H.reset(); H.tp('dev_01', 12, 15);
    G.game._internal.fallbackPaused = true;
    const x0 = H.m().x, pt0 = G.game.progress.playTime;
    H.drive(20, () => ({ right: true }));
    const x1 = H.m().x, pt1 = G.game.progress.playTime;
    G.game._internal.fallbackPaused = false;
    H.drive(10, () => ({ right: true }));
    return { ok: x1 === x0 && pt1 === pt0 && H.m().x > x1 && G.game.mode === 'play', detail: 'paused dx=' + (x1 - x0) + ' resumed dx=' + (H.m().x - x1).toFixed(1) };
  `],
  ['lockPlayer / unlockPlayer (stackable)', `
    H.reset(); H.tp('dev_01', 12, 15);
    G.game.lockPlayer('a'); G.game.lockPlayer('b');
    const x0 = H.m().x;
    H.drive(10, () => ({ right: true }));
    G.game.unlockPlayer('a');
    H.drive(10, () => ({ right: true }));
    const x1 = H.m().x;
    G.game.unlockPlayer('b');
    H.drive(10, () => ({ right: true }));
    return { ok: x1 === x0 && H.m().x > x1 && !G.game.isLocked(), detail: 'locked dx=' + (x1 - x0) };
  `],
  ['conditions: evaluator cases', `
    H.reset();
    const g = G.game, p = g.progress;
    p.abilities.dash = true; p.seals = ['bell', 'kiln']; p.sparks = ['spark_gw'];
    g.setFlag('lever:gw_lv1'); g.setFlag('talked:thrum:meet'); g.setFlag('item:gw_hw1'); g.setFlag('custom_x');
    p.bosses.effigy = true; p.visited.gw_03 = true; p.flags['region:guttered'] = true;
    const cases = [
      ['', true], [undefined, true], ['ability:dash', true], ['ability:grip', false], ['!ability:grip', true],
      ['boss:effigy', true], ['boss:sable1', false], ['seals>=2', true], ['seals>=3', false], ['sparks>=1', true],
      ['lever:gw_lv1', true], ['flag:custom_x', true], ['flag:nope', false], ['item:gw_hw1', true], ['item:gw_hw2', false],
      ['talked:thrum:meet', true], ['!talked:thrum:meet', false], ['visited:gw_03', true], ['visited:gw_04', false],
      ['region:guttered', true], ['region:nave', false], ['ability:dash & boss:effigy', true], ['ability:dash & !boss:effigy', false],
      ['seals>=2 & !flag:thrum_notch', true], ['  ability:dash  &  seals>=1 ', true],
    ];
    const bad = cases.filter(([c, want]) => g.evalCondition(c) !== want).map(([c]) => String(c));
    return { ok: bad.length === 0, detail: bad.length ? 'wrong: ' + bad.join(' | ') : cases.length + ' cases' };
  `],
  ['completion(): 0 → partial → 100', `
    H.reset();
    const c0 = G.game.completion();
    G.debug.give('all');
    const c1 = G.game.completion();
    G.debug.give('everything');
    const c2 = G.game.completion();
    return { ok: c0 === 0 && c1 === 11 && c2 === 100, detail: c0 + ' / ' + c1 + ' / ' + c2 };
  `],
  ['items & sigils: notches, equip limits, heartwax pairs', `
    H.reset();
    const g = G.game, p = g.progress;
    g.giveItem('heartwax', { silent: true }); const mh1 = p.maxHealth;
    g.giveItem('heartwax', { silent: true }); const mh2 = p.maxHealth;
    g.giveItem('sigil:bright_bolt', { silent: true }); g.giveItem('sigil:steadfast', { silent: true }); g.giveItem('sigil:heartwax', { silent: true });
    const e1 = g.equip('bright_bolt'), e2 = g.equip('steadfast');
    const used = g.notchesUsed();
    g.unequip('bright_bolt');
    const e3 = g.equip('steadfast'), e4 = g.equip('heartwax');
    g.giveItem('notch', { silent: true });
    return { ok: mh1 === 5 && mh2 === 6 && e1 && !e2 && used === 3 && e3 && e4 && g.notchesUsed() === 3 && p.notches === 4 && g.maxHealth() === 7,
      detail: 'notches used ' + used + ' maxHealth ' + g.maxHealth() };
  `],
  ['contact damage + i-frames; nail hit gives 11 ember', `
    H.reset(); H.tp('dev_01', 12, 15);
    if (!G.Entity.isRegistered('test_dummy')) {
      G.registerEntity('test_dummy', class extends G.Entity {
        constructor(p) { super(p); this.w = 40; this.h = 40; this.team = 'enemy'; this.hurtable = true; this.contactDamage = p.contact || 0; this.hp = 30; this.hits = 0; }
        onHit(hit) { this.hits++; this.hp -= hit.damage; return true; }
      });
    }
    const e = G.debug.spawn({ type: 'test_dummy', x: H.m().x - 7, y: H.m().y + 14, contact: 1 });
    H.drive(3);
    const hp1 = G.game.progress.health;
    H.drive(20);
    const hp2 = G.game.progress.health;
    e.remove(); H.drive(2);
    G.debug.teleport('dev_01', 12, 15); H.drive(1);
    const d = G.debug.spawn({ type: 'test_dummy', x: H.m().x + 40, y: H.m().y + 10 });
    H.drive(1, () => ({ right: true })); H.drive(1, () => ({ attack: true })); H.drive(2);
    return { ok: hp1 === 4 && hp2 === 4 && d.hits === 1 && G.game.progress.ember === 11, detail: 'hp ' + hp1 + '/' + hp2 + ' ember ' + G.game.progress.ember };
  `],
  ['broken entity is removed and reported (no crash)', `
    H.reset();
    if (!G.Entity.isRegistered('test_broken')) G.registerEntity('test_broken', class extends G.Entity { update() { throw new Error('selftest boom'); } });
    const before = G.debug.errors.length;
    const e = G.debug.spawn({ type: 'test_broken', tx: 20, ty: 15 });
    H.drive(3);
    const unknown = G.Entity.create({ type: 'no_such_type' });
    return { ok: e.dead && !G.game.room.entities.includes(e) && G.debug.errors.length >= before + 2 && unknown === null && G.game.mode === 'play', detail: 'errors +' + (G.debug.errors.length - before) };
  `],
  ['region preview (?region= on dev rooms)', `
    const r = G.World.instantiate('dev_01', { regionId: 'nave' });
    return { ok: r.regionId === 'nave' && r.dark === 0.45 && G.World.instantiate('dev_01').regionId === 'test', detail: r.regionId + ' dark ' + r.dark };
  `],
  ['perf: 50 entities, fallback renderer, step+render', `
    H.reset(); H.tp('dev_01', 12, 15);
    if (!G.Entity.isRegistered('test_mover')) {
      G.registerEntity('test_mover', class extends G.Entity {
        constructor(p) { super(p); this.w = 30; this.h = 30; this.vx = 120 * (Math.random() < 0.5 ? -1 : 1); }
        update(dt) { const r = this.move(this.vx * dt, 200 * dt); if (r.hitX) this.vx = -this.vx; G.lighting.add({ x: this.cx, y: this.cy, r: 60, color: '#ffb060', intensity: 0.5 }); }
        draw(ctx) { ctx.fillStyle = '#c86'; ctx.fillRect(this.x, this.y, this.w, this.h); }
      });
    }
    for (let i = 0; i < 50; i++) G.debug.spawn({ type: 'test_mover', tx: 3 + i, ty: 15 });
    for (let i = 0; i < 20; i++) G.fx.burst('spark', 400 + i * 20, 500, { count: 15 });
    const useArt = G.Render.useArt;
    G.Render.useArt = false;
    G.debug.step(10);
    // CPU cost of step + render submission; the software rasterizer's flush (getImageData) runs outside the timed
    // region (same method as the enemy self-test, integration log #4): headless SwiftShader raster is not game cost
    const cx = G.Render.ctx;
    cx.getImageData(0, 0, 1, 1);
    let ms = 0;
    for (let i = 0; i < 60; i++) { const a = performance.now(); G.game.step(); G.Render.frame(); ms += performance.now() - a; cx.getImageData(0, 0, 1, 1); }
    ms /= 60;
    G.Render.useArt = useArt;
    G.debug.killAll();
    return { ok: ms < 16.7, detail: ms.toFixed(2) + ' ms per step+frame (headless software canvas)' };
  `],
];

async function browserChecks() {
  const list = CHECKS.filter(([name]) => wanted(name));
  if (!list.length) return;
  const { page, errors } = await openGame({ query: 'test=1&paused=1&testrooms=1&mute=1' });
  await page.addScriptTag({ content: HELPERS });
  for (const [name, body] of list) {
    let r;
    try {
      r = await page.evaluate(`(() => { ${body} })()`);
    } catch (e) {
      r = { ok: false, detail: 'threw: ' + e.message.split('\n')[0] };
    }
    report(name, !!(r && r.ok), r && r.detail);
  }
  fs.mkdirSync(path.join(ROOT, 'test-output', 'engine'), { recursive: true });
  await page.screenshot({ path: path.join(ROOT, 'test-output', 'engine', 'selftest_end.png') });
  const unexpected = errors.filter((e) => !/selftest boom|no_such_type/.test(e));
  report('no unexpected console errors', unexpected.length === 0, unexpected.slice(0, 5).join(' | '));
}

(async () => {
  nodeChecks();
  await browserChecks();
  await closeAll();
  const failed = results.filter((r) => !r.ok);
  console.log('\n' + (failed.length ? 'FAILED ' + failed.length + ' of ' + results.length : 'ALL PASS (' + results.length + ' checks)'));
  process.exit(failed.length ? 1 : 0);
})().catch(async (e) => { console.error(e); await closeAll(); process.exit(1); });
