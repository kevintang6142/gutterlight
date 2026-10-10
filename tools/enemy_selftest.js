#!/usr/bin/env node
// Enemy & boss framework self-test (module: enemies). Headless, in the dev rooms (plus two runtime-defined
// dev rooms for persistence and arena-reset checks). Prints PASS/FAIL per check, renders contact sheets to
// test-output/enemies/*.png, exit code 1 on any failure or unexpected console error.
//
//   node tools/enemy_selftest.js              all checks
//   node tools/enemy_selftest.js arena boss   only checks whose name contains one of the words
//
// LAB MODE (for region / boss builders — smoke-tests YOUR enemies and bosses, see docs/api/enemies.md §11):
//   node tools/enemy_selftest.js --kinds snuffed_walker,drip_fly [--region guttered] [--out test-output/guttered]
//        [--props '{"surface":"ceiling"}']
//     per kind: registered, spawns, idles 3 s without errors, engages the player (states, telegraph
//     lengths, projectiles), contact damage, hits-to-kill at every Brand level, death → enemyKilled +
//     cinders + removal; writes lab_<kinds>.png (pose sheet: idle, first states, hit flash, melt,
//     puddle) and lab_<kind>_ingame.png.
//   node tools/enemy_selftest.js --boss effigy [--seconds 40] [--room gw_boss] [--region guttered] [--dialogue]
//     runs the full arena flow in a lab arena (or the real room with --room): trigger → arenaStart → gates
//     → boss spawn/card/music → N s of random play while chipping HP (records attacks, telegraphs,
//     phases, staggers, hurt attempts) → kill → defeat recorded, gates open, music restored.
//     Writes lab_boss_<id>_<n>.png. Exit code 1 on any failure or console error.
'use strict';
const path = require('path');
const fs = require('fs');
const { openGame, closeAll, ROOT } = require('./lib/browser');

const OUT = path.join(ROOT, 'test-output', 'enemies');
// --flag value options (lab mode); every other word is a check-name filter
const OPTS = {};
const filters = [];
{
  const argv = process.argv.slice(2);
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a.startsWith('--')) {
      const k = a.slice(2);
      const next = argv[i + 1];
      if (next != null && !next.startsWith('--')) { OPTS[k] = next; i++; } else OPTS[k] = true;
    } else filters.push(a.toLowerCase());
  }
}
const wanted = (name) => !filters.length || filters.some((f) => name.toLowerCase().includes(f));
const results = [];
function report(name, ok, detail) {
  results.push({ name, ok });
  console.log((ok ? 'PASS  ' : 'FAIL  ') + name.padEnd(60) + (detail ? '  ' + detail : ''));
}
// console errors that the checks provoke on purpose
const EXPECTED_ERRORS = /no_such_enemy|boss_nosuchboss|selftest boom/;

// ------------------------------------------------------------------------------------------ in-page helpers
const HELPERS = `
window.H = {
  T: G.CONST.TILE,
  reset(room, tx, ty) {
    G.debug.clearInput();
    G.game.god = false;
    G.Boss.skipDialogue = true;
    G.game.newGame(0);
    G.debug.step(2);
    if (room) { G.debug.teleport(room, tx == null ? 12 : tx, ty == null ? 15 : ty); G.debug.step(1); }
    H.clearEnemies();
    if (G.fx) G.fx.clear();
  },
  clearEnemies() {
    const r = G.game.room;
    for (const e of r.entities) if (e.team === 'enemy' || e.type === 'cinder' || e.type === 'arena' || e.type === 'arena_gate') e.dead = true;
    r.removeDead();
  },
  room() { return G.game.room; },
  p() { return G.game.player; },
  hp() { return G.game.progress.health; },
  spawn(kind, tx, ty, extra) { return G.debug.spawn(Object.assign({ type: 'enemy', kind, tx, ty }, extra || {})); },
  step(n, until) { let i = 0; for (; i < n; i++) { G.game.step(); if (until && until(i)) { i++; break; } } return i; },
  hit(e, dmg, dir, kind) {
    return G.Combat.attack({ owner: G.game.player, team: 'player', rect: { x: e.x - 2, y: e.y - 2, w: e.w + 4, h: e.h + 4 },
      damage: dmg, kind: kind || 'nail', dir: dir || { x: 1, y: 0 }, id: 'st' + Math.random() });
  },
  park(tx, ty) { G.debug.teleport(G.game.room.id, tx, ty); G.game.player.invuln = 0; },
  count(type) { return G.game.room.entities.filter((e) => !e.dead && e.type === type).length; },
  cinderValue() { return G.game.room.entities.filter((e) => !e.dead && e.type === 'cinder').reduce((s, e) => s + (e.value || 1), 0); },
  listen(name) { const box = { n: 0, last: null }; G.events.on(name, (p) => { box.n++; box.last = p; }); return box; },
  waitPlay(max) { return H.step(max || 400, () => G.game.mode === 'play' && !G.game.isLocked() && (G.game.sysFadeAlpha || 0) < 0.01); },
};
// a minimal test enemy (gravity body that stands still) and a surface crawler
class StDummy extends G.Enemy {
  constructor(p) { super(p, { hp: 20, w: 30, h: 30, cinders: [3, 3] }); }
  think() { if (this.grounded) this.vx = 0; }
}
G.registerEnemy('st_dummy', StDummy);
class StCrawler extends G.Enemy {
  constructor(p) { super(p, { hp: 20, w: 24, h: 24, physics: 'manual', cinders: 0 }); this.crawlDir = p.dir || 1; this.seen = {}; this.falls = 0; }
  think(dt) { const r = this.crawl(this.props.speed || 90, dt); if (r === 'fall') this.falls++; if (this.surf) this.seen[this.surf.x + ',' + this.surf.y] = true; }
  drawBody(ctx) { ctx.save(); const c = this.crawlTransform(ctx); ctx.fillStyle = '#c8a0ff'; ctx.fillRect(-12, -12, 24, 24); ctx.fillStyle = '#301040'; ctx.fillRect(this.facing > 0 ? 4 : -10, 4, 6, 8); ctx.restore(); void c; }
}
G.registerEnemy('st_crawler', StCrawler);
`;

// ------------------------------------------------------------------------------------------ checks
const CHECKS = [
  ['registry: enemy kinds + entity types registered', `
    H.reset();
    const types = ['enemy', 'projectile', 'arena', 'boss_test', 'telegraph'].filter((t) => !G.Entity.isRegistered(t));
    const kinds = ['ash_crawler', 'ash_fly'].filter((k) => !G.Enemy.isKind(k));
    return { ok: !types.length && !kinds.length && typeof G.registerEnemy === 'function' && !!G.Boss && !!G.Projectile,
      detail: 'kinds: ' + G.Enemy.kinds().join(',') + (types.length ? ' missing types ' + types : '') };
  `],
  ['registry: unknown kind → null + one reportError', `
    H.reset('dev_01');
    const n0 = G.debug.errors.length;
    const a = H.spawn('no_such_enemy', 30, 15), b = H.spawn('no_such_enemy', 31, 15);
    const added = G.debug.errors.slice(n0).filter((e) => /no_such_enemy/.test(e)).length;
    return { ok: a === null && b === null && added === 1, detail: 'errors added ' + added };
  `],
  ['spawn: ground enemy feet on the marker tile, flyer centred', `
    H.reset('dev_01');
    const c = H.spawn('ash_crawler', 26, 15), f = H.spawn('ash_fly', 30, 10);
    return { ok: c.bottom === 16 * H.T && Math.abs(c.cx - 26.5 * H.T) < 0.01 && Math.abs(f.cy - 10.5 * H.T) < 0.01 && c.hp === 10 && f.hp === 8,
      detail: 'crawler bottom ' + c.bottom + ' fly cy ' + f.cy };
  `],
  ['patrol: ash_crawler turns at ledges (3-tile floating slab)', `
    H.reset('dev_01', 12, 15); G.debug.god(true);
    const e = H.spawn('ash_crawler', 41, 12, { facing: 1 });
    let minX = 1e9, maxR = -1e9, badY = 0, turns = 0, f = e.facing;
    H.step(600, () => { minX = Math.min(minX, e.x); maxR = Math.max(maxR, e.right); if (Math.abs(e.bottom - 13 * H.T) > 0.5) badY++; if (e.facing !== f) { turns++; f = e.facing; } return e.dead; });
    return { ok: !e.dead && minX >= 40 * H.T - 0.5 && maxR <= 43 * H.T + 0.5 && badY === 0 && turns >= 3,
      detail: 'x ' + minX.toFixed(1) + '..' + maxR.toFixed(1) + ' (slab 1600..1720) turns ' + turns + ' offFloor ' + badY };
  `],
  ['patrol: ash_crawler turns at walls (between two steps)', `
    H.reset('dev_01', 12, 15); G.debug.god(true);
    const e = H.spawn('ash_crawler', 32, 15, { facing: -1 });
    let minX = 1e9, maxR = -1e9, turns = 0, f = e.facing;
    H.step(480, () => { minX = Math.min(minX, e.x); maxR = Math.max(maxR, e.right); if (e.facing !== f) { turns++; f = e.facing; } });
    return { ok: minX >= 31 * H.T - 0.5 && maxR <= 34 * H.T + 0.5 && turns >= 2, detail: 'x ' + minX.toFixed(1) + '..' + maxR.toFixed(1) + ' turns ' + turns };
  `],
  ['patrol: ash_crawler turns before spikes', `
    H.reset('dev_02', 20, 15); G.debug.god(true);
    const e = H.spawn('ash_crawler', 64, 15, { facing: 1 });
    let maxR = -1e9, turns = 0, f = e.facing;
    H.step(420, () => { maxR = Math.max(maxR, e.right); if (e.facing !== f) { turns++; f = e.facing; } });
    return { ok: maxR <= 68 * H.T + 0.5 && turns >= 1 && !e.dead, detail: 'max right ' + maxR.toFixed(1) + ' (spikes at ' + 68 * H.T + ')' };
  `],
  ['flyer: ash_fly hovers near home when the player is away', `
    H.reset('dev_01', 12, 15); G.debug.god(true);
    const e = H.spawn('ash_fly', 60, 8);
    let maxD = 0;
    H.step(300, () => { maxD = Math.max(maxD, Math.hypot(e.cx - e.home.x, e.cy - e.home.y)); });
    return { ok: maxD < 70 && e.state === 'hover', detail: 'max drift ' + maxD.toFixed(1) + ' state ' + e.state };
  `],
  ['flyer: ash_fly drifts toward the player in sight', `
    H.reset('dev_01', 20, 15); G.debug.god(true);
    const e = H.spawn('ash_fly', 24, 12);
    const d0 = e.dist();
    H.step(180);
    const d1 = e.dist();
    return { ok: d1 < d0 * 0.5 && e.state === 'chase', detail: 'dist ' + d0.toFixed(0) + ' → ' + d1.toFixed(0) + ' state ' + e.state };
  `],
  ['flyer: steering avoids walls (no wall hugging toward an unreachable target)', `
    H.reset('dev_01', 12, 15); G.debug.god(true);
    // fly placed under the 4-tile floating slab, target point straight above it: must slide around the slab
    const e = H.spawn('ash_fly', 47, 14);
    e.setState('scripted'); e.think = function (dt) { this.flyTo(47.5 * H.T, 9 * H.T, 120, dt, { accel: 500 }); };
    let reached = false;
    H.step(360, () => { reached = Math.hypot(e.cx - 47.5 * H.T, e.cy - 9 * H.T) < 40; return reached; });
    return { ok: reached, detail: 'final ' + e.cx.toFixed(0) + ',' + e.cy.toFixed(0) + ' target 1900,360' };
  `],
  ['hit: damage, white flash, knockback along hit.dir, short stun', `
    H.reset('dev_01', 44, 15); G.debug.god(true);
    const e = H.spawn('ash_crawler', 50, 15, { facing: -1 });
    H.step(2);
    const x0 = e.x;
    const res = H.hit(e, 5, { x: 1, y: 0 });
    const flash = e.flashT > 0, stun = e.stun > 0;
    H.step(10);
    const moved = e.x - x0;
    return { ok: res.length === 1 && e.hp === 5 && flash && stun && moved > 12, detail: 'hp ' + e.hp + ' knockback ' + moved.toFixed(1) + 'px' };
  `],
  ['hit: flyer knockback on both axes (up-slash pushes it up)', `
    H.reset('dev_01', 44, 15); G.debug.god(true);
    const e = H.spawn('ash_fly', 50, 9);
    H.step(2);
    const y0 = e.y;
    H.hit(e, 2, { x: 0, y: -1 });
    H.step(8);
    return { ok: y0 - e.y > 15, detail: 'rose ' + (y0 - e.y).toFixed(1) + 'px' };
  `],
  ['death: melt → puddle, cinders dropped, enemyKilled, removed', `
    H.reset('dev_01', 44, 15); G.debug.god(true);
    const ev = H.listen('enemyKilled');
    const e = H.spawn('ash_crawler', 50, 15);
    H.step(2);
    const c0 = H.cinderValue();
    H.hit(e, 5); H.hit(e, 5);
    const dying = e.dying && !e.hurtable && e.contactRect() === null;
    const dropped = H.cinderValue() - c0;
    H.step(30);
    const melting = e.melt > 0 && !e.dead;
    H.step(260);
    return { ok: dying && ev.n === 1 && ev.last.enemy === e && dropped >= 2 && dropped <= 4 && melting && e.dead && !H.room().entities.includes(e),
      detail: 'cinders ' + dropped + ' events ' + ev.n + ' removed ' + e.dead };
  `],
  ['death: ash_fly corpse falls, then melts on the floor', `
    H.reset('dev_01', 44, 15); G.debug.god(true);
    const e = H.spawn('ash_fly', 50, 10);
    H.step(2);
    e.kill();
    H.step(90);
    return { ok: e.meltStarted && Math.abs(e.bottom - 16 * H.T) < 2, detail: 'bottom ' + e.bottom.toFixed(1) + ' melt ' + e.melt.toFixed(2) };
  `],
  ['contact: touching an enemy hurts the player', `
    H.reset('dev_01', 20, 15);
    const h0 = H.hp();
    H.spawn('ash_crawler', 23, 15, { facing: -1 });
    const n = H.step(300, () => H.hp() < h0);
    return { ok: H.hp() === h0 - 1, detail: 'health ' + h0 + ' → ' + H.hp() + ' after ' + n + ' steps' };
  `],
  ['spawn: never starts overlapping the player', `
    H.reset('dev_01', 20, 15);
    const h0 = H.hp();
    const e = H.spawn('ash_crawler', 20, 15);
    H.step(1);
    const separated = !G.U.aabb(e, H.p()) || e.contactGrace;
    H.step(20);
    return { ok: separated && H.hp() === h0, detail: 'enemy x ' + e.x.toFixed(0) + ' player x ' + H.p().x.toFixed(0) + ' grace ' + e.contactGrace };
  `],
  ['safety: enemy falling out of the room is removed (no drops)', `
    H.reset('dev_01', 12, 15); G.debug.god(true);
    const ev = H.listen('enemyKilled');
    const e = H.spawn('ash_crawler', 71, 12);
    H.step(150, () => e.dead);
    return { ok: e.dead && ev.n === 0 && H.cinderValue() === 0, detail: 'removed ' + e.dead };
  `],
  ['safety: walkers never leave through a side opening', `
    H.reset('dev_01', 12, 15); G.debug.god(true);
    const e = H.spawn('ash_crawler', 77, 15, { facing: 1 });
    let maxR = 0;
    H.step(400, () => { maxR = Math.max(maxR, e.right); });
    return { ok: !e.dead && maxR <= H.room().widthPx + 0.01, detail: 'max right ' + maxR.toFixed(1) + ' / ' + H.room().widthPx };
  `],
  ['projectile: orb hits the player', `
    H.reset('dev_01', 20, 15);
    const h0 = H.hp(), p = H.p();
    const o = G.spawnProjectile(H.room(), 'orb', { x: p.cx + 200, y: p.cy, vx: -320, vy: 0 });
    H.step(90, () => o.dead);
    return { ok: o.dead && H.hp() === h0 - 1, detail: 'health ' + h0 + ' → ' + H.hp() };
  `],
  ['projectile: orb and glob burst on terrain', `
    H.reset('dev_01', 40, 15); G.debug.god(true);
    const o = G.spawnProjectile(H.room(), 'orb', { x: 200, y: 560, vx: -500, vy: 0 });
    const g = G.spawnProjectile(H.room(), 'glob', { x: 600, y: 300, vx: 50, vy: -200 });
    const n = H.step(120, () => o.dead && g.dead);
    return { ok: o.dead && g.dead && g.y + g.h > 15 * H.T, detail: 'both burst after ' + n + ' steps, glob y ' + g.y.toFixed(0) };
  `],
  ['projectile: destroyable by the Brand, others pass through attacks', `
    H.reset('dev_01', 20, 15); G.debug.god(true);
    const p = H.p();
    const a = G.spawnProjectile(H.room(), 'orb', { x: p.cx + 60, y: p.cy, vx: 0, vy: 0, destroyable: true });
    const b = G.spawnProjectile(H.room(), 'shard', { x: p.cx + 60, y: p.cy - 30, vx: 0, vy: 0 });
    H.step(1);
    const res = G.Combat.attack({ owner: p, team: 'player', rect: { x: p.cx, y: p.cy - 60, w: 120, h: 100 }, damage: 5, kind: 'nail', dir: { x: 1, y: 0 }, id: 'stp' });
    const ember = G.game.progress.ember;
    return { ok: a.dead && !b.dead && res.length === 1 && ember === 0, detail: 'destroyable dead ' + a.dead + ', shard dead ' + b.dead + ', ember ' + ember };
  `],
  ['projectile: wave runs along the floor, hurts, stops at walls', `
    H.reset('dev_01', 22, 15);
    const h0 = H.hp(), p = H.p();
    const w = G.spawnProjectile(H.room(), 'wave', { x: p.cx - 200, y: 16 * H.T, dir: 1, speed: 420 });
    H.step(60, () => H.hp() < h0);
    const hurt = H.hp() === h0 - 1;
    H.step(200, () => w.dead);
    return { ok: hurt && w.dead && w.right <= 34 * H.T + 1, detail: 'hurt ' + hurt + ', stopped at x ' + w.right.toFixed(0) + ' (2-tile step at ' + 34 * H.T + ')' };
  `],
  ['projectile: homing orb turns toward the player', `
    H.reset('dev_01', 20, 15);
    const p = H.p(), h0 = H.hp();
    const o = G.spawnProjectile(H.room(), 'orb', { x: p.cx + 150, y: p.cy - 200, vx: 260, vy: 0, homing: 4 });
    H.step(240, () => o.dead);
    return { ok: o.dead && H.hp() === h0 - 1, detail: 'health ' + h0 + ' → ' + H.hp() };
  `],
  ['aim: lead prediction & lob arc land on target', `
    H.reset('dev_01', 30, 15);
    const tgt = { x: 1000, y: 600, w: 20, h: 20, vx: 200, vy: 0 };
    const a = G.Enemy.aim(400, 610, tgt, 400, 1);
    // simulate: projectile vs target
    let px = 400, py = 610, tx = 1010, ty = 610, best = 1e9;
    for (let i = 0; i < 300; i++) { px += a.vx / 60; py += a.vy / 60; tx += 200 / 60; best = Math.min(best, Math.hypot(px - tx, py - ty)); }
    const s = G.Enemy.solveArcTime(300, -50, 1200, 0.8);
    let x = 0, y = 0, vy = s.vy;
    for (let i = 0; i < 48; i++) { vy += 1200 / 60; x += s.vx / 60; y += vy / 60; }
    return { ok: best < 10 && Math.abs(x - 300) < 1 && Math.abs(y + 50) < 12, detail: 'lead miss ' + best.toFixed(1) + 'px, lob end ' + x.toFixed(1) + ',' + y.toFixed(1) };
  `],
  ['leap: arc solver lands the body on the target point', `
    H.reset('dev_01', 12, 15); G.debug.god(true);
    const e = H.spawn('st_dummy', 50, 15);
    H.step(3);
    const target = 58.5 * H.T;
    const sol = e.leapTo(target, 16 * H.T, 100);
    let air = false;
    H.step(200, () => { if (!e.grounded) air = true; return air && e.grounded; });
    return { ok: air && Math.abs(e.cx - target) < 12, detail: 'landed at ' + e.cx.toFixed(1) + ' target ' + target + ' flight ' + sol.t.toFixed(2) + 's' };
  `],
  ['telegraph: wind-up ≥ 0.35 s for enemies (bosses ≥ 0.25 s), with cue', `
    H.reset('dev_01', 12, 15); G.debug.god(true);
    const e = H.spawn('ash_crawler', 40, 15), b = G.debug.spawn({ type: 'boss_test', tx: 60, ty: 15, noAutoStart: true });
    const d1 = e.telegraph(0.1, { sound: false }), d2 = e.telegraph(0.6, { sound: false }), d3 = b.telegraph(0.1, { sound: false });
    const forced = e.telegraph(0.1, { sound: false, force: true });
    const tele = e.telegraphing;
    return { ok: d1 === 0.35 && d2 === 0.6 && d3 === 0.25 && forced === 0.1 && tele, detail: [d1, d2, d3, forced].join(' / ') };
  `],
  ['state machine: at() fires once per crossing, once(), every()', `
    H.reset('dev_01', 12, 15); G.debug.god(true);
    const e = H.spawn('st_dummy', 40, 15);
    let at0 = 0, at05 = 0, onceN = 0, everyN = 0;
    e.think = function () { if (this.at(0)) at0++; if (this.at(0.5)) at05++; if (this.once('k')) onceN++; if (this.every(0.25)) everyN++; };
    e.setState('x');
    H.step(61);
    return { ok: at0 === 1 && at05 === 1 && onceN === 1 && everyN === 5, detail: 'at0 ' + at0 + ' at0.5 ' + at05 + ' once ' + onceN + ' every ' + everyN };
  `],
  ['crawler: follows floor, wall and ceiling around a floating slab', `
    H.reset('dev_01', 12, 15); G.debug.god(true);
    const e = H.spawn('st_crawler', 53, 10);
    let lost = 0, far = 0;
    H.step(900, () => {
      if (!e.surf) lost++;
      const dx = Math.max(52 * H.T - e.cx, 0, e.cx - 55 * H.T), dy = Math.max(11 * H.T - e.cy, 0, e.cy - 12 * H.T);
      if (Math.hypot(dx, dy) > 16) far++;
    });
    const seen = Object.keys(e.seen);
    return { ok: seen.length === 4 && lost === 0 && far === 0, detail: 'surfaces ' + seen.join(' ') + ' detached ' + lost + ' strayed ' + far };
  `],
  ['crawler: climbs inner corners (step) and wraps over the top', `
    H.reset('dev_01', 12, 15); G.debug.god(true);
    const e = H.spawn('st_crawler', 32, 15, { dir: 1 });
    let wall = false, top = false;
    H.step(300, () => { if (e.surf && e.surf.x === 1) wall = true; if (wall && e.surf && e.surf.y === 1 && e.bottom <= 14 * H.T + 0.5) top = true; return top; });
    return { ok: wall && top && e.falls === 0, detail: 'wall ' + wall + ' top ' + top + ' y ' + e.bottom.toFixed(1) };
  `],
  ['crawler: props.surface snaps wall / ceiling crawlers onto their surface', `
    H.reset('dev_01', 60, 15); G.debug.god(true);
    const c = H.spawn('st_crawler', 20, 1, { surface: 'ceiling' }), w = H.spawn('st_crawler', 1, 10, { surface: 'left' });
    H.step(3);
    const at = c.surf && c.surf.y === -1 && Math.abs(c.y - H.T) < 1 && w.surf && w.surf.x === -1 && Math.abs(w.x - H.T) < 1;
    H.step(90);
    return { ok: at && c.falls === 0 && w.falls === 0 && !!c.surf && !!w.surf,
      detail: 'ceiling y ' + c.y.toFixed(1) + ' surf ' + JSON.stringify(c.surf) + ' wall x ' + w.x.toFixed(1) + ' surf ' + JSON.stringify(w.surf) + ' falls ' + c.falls + '/' + w.falls };
  `],
  ['ambush: hidden enemies are not hurtable and deal no contact', `
    H.reset('dev_01', 20, 15);
    const e = H.spawn('st_dummy', 30, 15);
    e.hide();
    const hidden = e.hurtRect() === null && e.contactRect() === null && H.hit(e, 5).length === 0 && e.hp === 20;
    H.park(29, 15);
    const near = e.ambushReady(3 * H.T);
    e.reveal();
    const shown = H.hit(e, 5).length === 1 && e.hp === 15;
    return { ok: hidden && near && shown, detail: 'hidden ' + hidden + ' ready ' + near + ' revealed ' + shown };
  `],
  ['unique enemy: persistent id stays dead across room loads', `
    H.reset();
    if (!G.World.getRoom('dev_enemytest')) {
      const rows = [];
      for (let r = 0; r < 18; r++) rows.push(r === 0 || r >= 16 ? '#'.repeat(32) : '#' + '.'.repeat(30) + '#');
      G.World.defineRoom({ id: 'dev_enemytest', region: 'test', dev: true, gx: 400, gy: 954, tiles: rows,
        entities: [{ type: 'enemy', kind: 'ash_crawler', id: 'dev_u1', persistent: true, x: 22, y: 15 }, { type: 'enemy', kind: 'ash_crawler', x: 12, y: 15 }] });
    }
    G.debug.god(true);
    G.debug.teleport('dev_enemytest', 3, 15); G.debug.step(1);
    const u = H.room().findById('dev_u1');
    const before = H.room().findType('enemy').length;
    u.kill();
    const flag = G.game.getFlag('dead:dev_u1');
    G.debug.teleport('dev_01', 12, 15); G.debug.step(1);
    G.debug.teleport('dev_enemytest', 3, 15); G.debug.step(1);
    const after = H.room().findType('enemy');
    return { ok: !!u && before === 2 && flag && after.length === 1 && !H.room().findById('dev_u1'), detail: 'before ' + before + ' after ' + after.length + ' flag ' + flag };
  `],
  ['minions: summoned enemies drop nothing and die with the boss', `
    H.reset('dev_01', 12, 15); G.debug.god(true);
    const b = G.debug.spawn({ type: 'boss_test', tx: 60, ty: 15, noAutoStart: true });
    const m = b.summon('ash_crawler', 50 * H.T, 16 * H.T);
    H.step(2);
    b.kill();
    H.step(2);
    return { ok: !!m && m.dying && m.props.noDrops && H.cinderValue() === 0 && b.liveMinions() === 0, detail: 'minion dying ' + (m && m.dying) };
  `],
  ['boss: phases at hp thresholds + stagger', `
    H.reset('dev_01', 30, 15); G.debug.god(true);
    const ev = H.listen('bossPhase');
    const b = G.debug.spawn({ type: 'boss_test', tx: 50, ty: 15, hp: 100 });
    H.step(80);
    const p1 = b.phase;
    H.hit(b, 39); const after39 = b.phase;
    H.hit(b, 2); const after41 = b.phase;
    const notYet = b.staggers === 0;
    H.step(100);
    H.hit(b, 30); const after71 = b.phase;
    const staggered = b.state === 'stagger' && notYet;
    return { ok: p1 === 1 && after39 === 1 && after41 === 2 && after71 === 3 && ev.n === 2 && b.staggers >= 1 && staggered,
      detail: 'phases ' + [p1, after39, after41, after71].join('→') + ' staggers ' + b.staggers + ' events ' + ev.n };
  `],
  ['boss: scheduler is weighted, range-aware, never repeats', `
    H.reset('dev_01', 30, 15); G.debug.god(true);
    const b = G.debug.spawn({ type: 'boss_test', tx: 50, ty: 15, noAutoStart: true });
    H.step(2);
    b.phase = 3; let reps = 0, last = null; const counts = {};
    H.park(30, 15);
    for (let i = 0; i < 400; i++) { b.cds = {}; const a = b.pickAttack(); if (a === last) reps++; counts[a] = (counts[a] || 0) + 1; last = b.lastAttack = a; }
    b.phase = 1; b.lastAttack = null; H.park(Math.floor(b.cx / H.T) - 1, 15);
    let close = {};
    for (let i = 0; i < 100; i++) { b.cds = {}; const a = b.pickAttack(); close[a] = (close[a] || 0) + 1; }
    return { ok: reps === 0 && Object.keys(counts).length === 4 && close.leap === 100, detail: 'far ' + JSON.stringify(counts) + ' close ' + JSON.stringify(close) };
  `],
  ['boss: fight start → bossStart, boss music, attacks run', `
    H.reset('dev_01', 30, 15); G.debug.god(true);
    const ev = H.listen('bossStart');
    const b = G.debug.spawn({ type: 'boss_test', tx: 50, ty: 15 });
    const seen = {};
    H.step(900, () => { if (b.attack) seen[b.attack] = 1; });
    return { ok: ev.n === 1 && G.game._internal.bossMusic === 'boss' && Object.keys(seen).length >= 2 && !b.dying, detail: 'music ' + G.game._internal.bossMusic + ' attacks ' + Object.keys(seen).join(',') };
  `],
  ['boss: defeat → slow-mo, explosion, defeatBoss, reward, stinger, music ends', `
    H.reset('dev_01', 30, 15); G.debug.god(true);
    const ev = H.listen('bossDefeated');
    const stingers = [];
    const origSt = G.Audio && G.Audio.stinger;
    if (G.Audio) G.Audio.stinger = function (n) { stingers.push(n); return origSt ? origSt.apply(this, arguments) : null; };
    const b = G.debug.spawn({ type: 'boss_test', tx: 50, ty: 15, boss: 'effigy' });
    H.step(60);
    G.spawnProjectile(H.room(), 'orb', { x: 300, y: 300, vx: 0, vy: 0, life: 30 });
    const t0 = G.game.t;
    G.debug.killAll();
    const cleared = H.count('projectile') === 0;
    let frames = 0;
    H.step(600, () => { frames++; return b.exploded; });
    const realT = frames / 60;
    const rewarded = H.cinderValue();
    H.step(500, () => b.dead);
    if (G.Audio) G.Audio.stinger = origSt;
    const stOk = !G.Audio || (stingers.length === 1 && stingers[0] === 'boss_defeated');
    return { ok: cleared && b.exploded && G.game.bossDefeated('effigy') && ev.n === 1 && rewarded === 200 && realT > 1.6 && G.game._internal.bossMusic == null && b.dead && stOk,
      detail: 'explosion after ' + realT.toFixed(2) + ' s (slow-mo), reward ' + rewarded + ', events ' + ev.n + ', stinger ' + JSON.stringify(stingers) + ', music ' + G.game._internal.bossMusic };
  `],
  ['boss: seal boss → only the seal card stinger (no boss_defeated overlap)', `
    H.reset('dev_01', 30, 15); G.debug.god(true);
    const stingers = [];
    const origSt = G.Audio && G.Audio.stinger;
    if (G.Audio) G.Audio.stinger = function (n) { stingers.push(n); return origSt ? origSt.apply(this, arguments) : null; };
    const b = G.debug.spawn({ type: 'boss_test', tx: 50, ty: 15, boss: 'tallowmere' });
    H.step(60);
    G.debug.killAll();
    H.step(1200, () => b.dead && stingers.length > 0);
    if (G.Audio) G.Audio.stinger = origSt;
    const sealed = (G.game.progress.seals || []).indexOf('bell') >= 0;
    const stOk = !G.Audio || (stingers.length === 1 && stingers[0] === 'seal');
    return { ok: G.game.bossDefeated('tallowmere') && sealed && stOk, detail: 'seal ' + sealed + ', stingers ' + JSON.stringify(stingers) };
  `],
  ['arena: trigger → gates close → beat → boss → kill → gates open, flag set', `
    H.reset('dev_01', 30, 15);
    G.debug.god(true);
    const hasGate = G.Entity.isRegistered('arena_gate');
    const gate = hasGate ? G.debug.spawn({ type: 'arena_gate', id: 'dev_ag1', tx: 44, ty: 15, h: 4 }) : null;
    const st = H.listen('arenaStart'), en = H.listen('arenaEnd'), bs = H.listen('bossStart');
    const ar = G.debug.spawn({ type: 'arena', boss: 'test', bx: 58, by: 15, trigger: [50, 0, 66, 17] });
    H.step(30);
    const idle = ar.state === 'wait' && !ar.active && st.n === 0;
    H.park(52, 15); H.step(1);
    const started = st.n === 1 && ar.active && !G.game.isSafeRoom();
    H.step(20);
    const gateClosed = !gate || gate.closed;
    const noBossYet = H.count('boss_test') === 0;
    H.step(25);
    const boss = H.room().findType('boss_test')[0];
    const spawned = !!boss && bs.n === 1 && G.game._internal.bossMusic === 'boss' && Math.abs(boss.cx - 58.5 * H.T) < 1;
    H.step(60);
    G.debug.killAll();
    H.step(900, () => en.n > 0);
    H.step(60);
    const done = G.game.bossDefeated('test') && en.n === 1 && !ar.active && ar.state === 'done' && G.game._internal.bossMusic == null;
    const gateOpen = !gate || gate.state === 'open';
    // already defeated → a fresh arena is inert
    const ar2 = G.debug.spawn({ type: 'arena', boss: 'test', bx: 58, by: 15, trigger: [50, 0, 66, 17] });
    H.step(60);
    const inert = ar2.state === 'done' && st.n === 1;
    return { ok: idle && started && gateClosed && noBossYet && spawned && done && gateOpen && inert,
      detail: 'gate ' + (hasGate ? 'yes' : 'n/a') + ' idle ' + idle + ' started ' + started + ' closed ' + gateClosed + ' beat ' + noBossYet + ' spawned ' + spawned + ' done ' + done + ' open ' + gateOpen + ' inert ' + inert };
  `],
  ['arena: unregistered boss → reportError + placeholder boss', `
    H.reset('dev_01', 30, 15); G.debug.god(true);
    const n0 = G.debug.errors.length;
    const ar = G.debug.spawn({ type: 'arena', boss: 'nosuchboss', bx: 58, by: 15, trigger: [50, 0, 66, 17] });
    H.park(52, 15); H.step(60);
    const b = H.room().findType('boss_test')[0];
    const errs = G.debug.errors.slice(n0).filter((e) => /boss_nosuchboss/.test(e)).length;
    b && b.kill();
    H.step(900, () => ar.state === 'done');
    return { ok: !!b && b.bossId === 'nosuchboss' && errs === 1 && G.game.bossDefeated('nosuchboss'), detail: 'placeholder ' + !!b + ' errors ' + errs };
  `],
  ['arena: player death mid-fight resets the arena on the next load', `
    H.reset();
    if (!G.World.getRoom('dev_arenatest')) {
      const rows = [];
      for (let r = 0; r < 18; r++) rows.push(r === 0 || r >= 16 ? '#'.repeat(32) : '#' + '.'.repeat(30) + '#');
      G.World.defineRoom({ id: 'dev_arenatest', region: 'test', dev: true, gx: 432, gy: 954, tiles: rows,
        entities: [{ type: 'arena', boss: 'test', bx: 24, by: 15, trigger: [14, 0, 30, 17], x: 1, y: 1 }] });
    }
    G.debug.teleport('dev_arenatest', 3, 15); G.debug.step(1);
    H.park(18, 15); H.step(50);
    const fighting = !!H.room().findType('arena')[0].active && H.count('boss_test') === 1;
    G.game.playerDied();
    H.step(30); H.waitPlay(600);
    const respawned = G.game.mode === 'play' && H.room().id !== 'dev_arenatest';
    G.debug.teleport('dev_arenatest', 3, 15); G.debug.step(2);
    const ar = H.room().findType('arena')[0];
    return { ok: fighting && respawned && ar && ar.state === 'wait' && !ar.active && H.count('boss_test') === 0 && !G.game.bossDefeated('test') && G.game._internal.bossMusic == null,
      detail: 'fighting ' + fighting + ' respawned in ' + (respawned && G.debug.state().room) + ' arena ' + (ar && ar.state) };
  `],
  ['integration: the real player\'s Brand kills an ash_crawler (ember +, cinders)', `
    H.reset('dev_01', 20, 15); G.debug.god(true);
    const e = H.spawn('ash_crawler', 22, 15, { facing: -1 });
    const em0 = G.game.progress.ember, ci0 = G.game.progress.cinders || 0;
    let hits = 0, hp = e.hp;
    for (let i = 0; i < 240 && !e.dying; i++) {
      G.input.setVirtual({ attack: i % 6 === 0, right: e.cx > H.p().cx + 60, left: e.cx < H.p().cx - 60 });
      G.game.step();
      if (e.hp < hp) { hits++; hp = e.hp; }
    }
    G.input.clearVirtual();
    H.step(20);
    // dropped = still lying + already collected (the player stands on the drop spot; a chip can be picked up in 20 frames)
    const got = (G.game.progress.cinders || 0) - ci0, dropped = H.cinderValue() + got;
    return { ok: e.dying && hits >= 2 && G.game.progress.ember > em0 && dropped >= 2, detail: 'hits ' + hits + ' ember ' + em0 + '→' + G.game.progress.ember + ' cinders ' + dropped + ' (collected ' + got + ')' };
  `],
  ['fuzz: 40 s of random play vs. arena boss + enemies, no errors', `
    H.reset('dev_01', 30, 15);
    const n0 = G.debug.errors.length;
    G.debug.spawn({ type: 'arena', boss: 'test', bx: 44, by: 15, trigger: [24, 0, 60, 17] });
    H.spawn('ash_fly', 20, 9); H.spawn('ash_crawler', 50, 15); H.spawn('ash_fly', 56, 8);
    let keys = {};
    for (let i = 0; i < 2400; i++) {
      if (i % 12 === 0) keys = { left: Math.random() < 0.4, right: Math.random() < 0.4, jump: Math.random() < 0.3, attack: Math.random() < 0.5, down: Math.random() < 0.15, up: Math.random() < 0.1, dash: Math.random() < 0.1 };
      G.input.setVirtual(keys);
      G.game.step();
      if (G.game.progress.health <= 1) G.game.progress.health = 5;
    }
    G.input.clearVirtual();
    G.debug.render();
    const errs = G.debug.errors.slice(n0);
    return { ok: errs.length === 0 && G.game.mode === 'play', detail: 'mode ' + G.game.mode + ' errors ' + errs.length + (errs[0] ? ' ' + errs[0] : '') };
  `],
  ['robustness: an enemy whose think() throws is removed, the game continues', `
    H.reset('dev_01', 20, 15); G.debug.god(true);
    const e = H.spawn('st_dummy', 30, 15);
    e.think = () => { throw new Error('selftest boom'); };
    H.step(3);
    const other = H.spawn('ash_crawler', 40, 15);
    H.step(30);
    return { ok: e.dead && !other.dead && G.game.mode === 'play', detail: 'removed ' + e.dead };
  `],
  ['perf: 40 enemies + projectiles step & render', `
    H.reset('dev_01', 12, 15); G.debug.god(true);
    for (let i = 0; i < 20; i++) H.spawn('ash_crawler', 14 + i * 3, 15);
    for (let i = 0; i < 20; i++) H.spawn('ash_fly', 14 + i * 3, 6 + (i % 4));
    for (let i = 0; i < 20; i++) G.spawnProjectile(H.room(), i % 2 ? 'orb' : 'shard', { x: 600 + i * 40, y: 200, vx: 30, vy: 20, life: 20 });
    H.step(10); G.debug.render();
    // Time the CPU work (step + render submission). The software rasterizer's flush (getImageData) is kept out of
    // the timed region: it measures the headless machine, not the game code, and varies with machine load.
    const ctx = G.Render.ctx;
    let ms = 0;
    for (let i = 0; i < 60; i++) {
      ctx.getImageData(0, 0, 1, 1);
      const t0 = performance.now();
      G.game.step(); G.debug.render();
      ms += performance.now() - t0;
    }
    ms /= 60;
    return { ok: ms < 25, detail: ms.toFixed(2) + ' ms per step+render (CPU, raster flush excluded)' };
  `],
];

// ------------------------------------------------------------------------------------------ screenshots
const SHEET = `
(() => {
  H.reset('dev_01', 12, 15);
  const cv = document.getElementById('game'), ctx = cv.getContext('2d');
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  const g = ctx.createLinearGradient(0, 0, 0, 720); g.addColorStop(0, '#2c3240'); g.addColorStop(1, '#161a22');
  ctx.fillStyle = g; ctx.fillRect(0, 0, 1280, 720);
  const mk = (props) => { const e = G.Entity.create(props); e.room = H.room(); e.home = { x: e.cx, y: e.cy }; return e; };
  const put = (e, x, y, s, fn) => { ctx.save(); ctx.translate(x, y); ctx.scale(s, s); ctx.translate(-e.cx, -(e.y + e.h)); fn(e); ctx.restore(); };
  const label = (txt, x, y) => { ctx.fillStyle = '#9aa3b4'; ctx.font = '13px monospace'; ctx.textAlign = 'center'; ctx.fillText(txt, x, y); };
  ctx.fillStyle = '#d8dde8'; ctx.font = '16px Georgia'; ctx.textAlign = 'left';
  ctx.fillText('GUTTERLIGHT — enemies module: ash_crawler · ash_fly · boss_test · projectiles · telegraphs', 16, 24);
  const c = mk({ type: 'enemy', kind: 'ash_crawler', tx: 0, ty: 0, facing: 1 });
  for (let i = 0; i < 3; i++) { c.walk = i * 0.9; put(c, 110 + i * 170, 175, 3, (e) => e.drawBody(ctx, i * 0.4)); label('crawl ' + i, 110 + i * 170, 200); }
  c.facing = -1; c.turnT = 0.15; put(c, 620, 175, 3, (e) => e.drawBody(ctx, 1)); label('turning', 620, 200);
  c.facing = 1; c.turnT = 0; c.flashT = 0.1; put(c, 790, 175, 3, (e) => e.draw(ctx, 0)); label('hit flash', 790, 200);
  c.flashT = 0; c.dying = true; c.meltStarted = true; c.fade = 1;
  c.melt = 0.45; put(c, 960, 175, 3, (e) => e.draw(ctx, 0)); label('melting', 960, 200);
  c.melt = 1; put(c, 1140, 175, 3, (e) => e.draw(ctx, 0)); label('puddle', 1140, 200);
  const f = mk({ type: 'enemy', kind: 'ash_fly', tx: 0, ty: 0, facing: 1 });
  for (let i = 0; i < 4; i++) { f.flap = i * 1.6; f.facing = i < 2 ? 1 : -1; put(f, 110 + i * 150, 390, 3, (e) => e.drawBody(ctx, i * 0.3)); label('flutter ' + i, 110 + i * 150, 420); }
  f.flashT = 0.1; put(f, 720, 390, 3, (e) => e.draw(ctx, 0)); label('hit flash', 720, 420);
  f.flashT = 0; f.telegraph(0.5, { sound: false }); f.tele.t = 0.1; put(f, 870, 390, 3, (e) => e.draw(ctx, 0.2)); label('telegraph', 870, 420); f.tele = null;
  f.dying = true; f.meltStarted = false; f.corpseRot = 0.7; put(f, 1010, 390, 3, (e) => e.draw(ctx, 0)); label('corpse', 1010, 420);
  f.meltStarted = true; f.melt = 1; f.fade = 1; put(f, 1150, 390, 3, (e) => e.draw(ctx, 0)); label('puddle', 1150, 420);
  const b = mk({ type: 'boss_test', tx: 0, ty: 0, noAutoStart: true }); b.facing = 1;
  put(b, 120, 680, 1.3, (e) => e.drawBody(ctx, 0.2)); label('boss_test', 120, 705);
  b.telegraph(0.5, { sound: false }); b.tele.t = 0.12; put(b, 330, 680, 1.3, (e) => e.draw(ctx, 0.6)); label('wind-up', 330, 705); b.tele = null;
  b.state = 'stagger'; put(b, 540, 680, 1.3, (e) => e.drawBody(ctx, 0.2)); label('stagger', 540, 705);
  const P = G.Projectile;
  const proj = [['orb', { vx: 300 }], ['glob', { vx: 300, vy: 300 }], ['shard', { vx: 400, vy: -100 }]];
  proj.forEach(([k, v], i) => {
    const p = G.Entity.create(Object.assign({ type: 'projectile', kind: k, x: 0, y: 0 }, v));
    for (let j = 0; j < 8; j++) p.trail.push(-v.vx * 0.012 * (8 - j), -(v.vy || 0) * 0.012 * (8 - j));
    ctx.save(); ctx.translate(720 + i * 110, 600); ctx.scale(2, 2); ctx.translate(-p.cx, -p.cy); p.draw(ctx, 0.3); ctx.restore(); label(k, 720 + i * 110, 650);
  });
  const w = G.Entity.create({ type: 'projectile', kind: 'wave', x: 0, y: 0, dir: 1 });
  ctx.save(); ctx.translate(1060, 640); ctx.scale(2, 2); ctx.translate(-w.cx, -(w.y + w.h)); w.draw(ctx, 0.3); ctx.restore(); label('wave', 1060, 665);
  const z = new G.TelegraphZone({ x: 0, y: 0, w: 50, h: 120, dur: 1, style: 'column' }); z.age = 0.7;
  ctx.save(); ctx.translate(1160, 520); z.draw(ctx, 0); ctx.restore(); label('warn zone', 1185, 665);
  return 'sheet';
})()
`;

async function shots(page) {
  fs.mkdirSync(OUT, { recursive: true });
  await page.evaluate(SHEET);
  await page.screenshot({ path: path.join(OUT, 'contact_sheet.png') });
  // in-game: shore enemies around the player
  await page.evaluate(`(() => { H.reset('dev_01', 22, 15); G.debug.god(true);
    H.spawn('ash_crawler', 27, 15, { facing: -1 }); H.spawn('ash_crawler', 16, 15, { facing: 1 }); H.spawn('ash_fly', 26, 11); H.spawn('ash_fly', 18, 9);
    H.step(70); G.debug.render(); })()`);
  await page.screenshot({ path: path.join(OUT, 'ingame_shore.png') });
  // in-game: the test boss mid-fight in an arena (leap shockwaves)
  await page.evaluate(`(() => { H.reset('dev_01', 30, 15); G.debug.god(true);
    if (G.Entity.isRegistered('arena_gate')) { G.debug.spawn({ type: 'arena_gate', id: 'shot_g1', tx: 23, ty: 15, h: 4 }); G.debug.spawn({ type: 'arena_gate', id: 'shot_g2', tx: 45, ty: 15, h: 4 }); }
    G.debug.spawn({ type: 'arena', boss: 'test', bx: 40, by: 15, trigger: [24, 0, 44, 17] });
    H.park(30, 15); H.step(100);
    const b = H.room().findType('boss_test')[0];
    b.startAttack('leap'); H.step(200, () => H.count('projectile') > 0); H.step(8); G.debug.render(); })()`);
  await page.screenshot({ path: path.join(OUT, 'ingame_boss.png') });
  // in-game: death puddles + cinders
  await page.evaluate(`(() => { H.reset('dev_01', 22, 15); G.debug.god(true);
    const a = H.spawn('ash_crawler', 26, 15), f = H.spawn('ash_fly', 29, 12); H.step(5); H.hit(a, 10); H.hit(f, 10, { x: 1, y: 0 }); H.step(60); G.debug.render(); })()`);
  await page.screenshot({ path: path.join(OUT, 'ingame_death.png') });
}

// ------------------------------------------------------------------------------------------ lab mode
const LAB_HELPERS = `
window.LAB = {
  // Runtime lab rooms (region 'test'; ?region=<id> renders them in a region's art).
  ensureRooms() {
    const box = (id, cols, rows, gx, extra, entities) => {
      if (G.World.getRoom(id)) return;
      const t = [];
      for (let r = 0; r < rows; r++) {
        let row = '';
        for (let c = 0; c < cols; c++) row += (r === 0 || r >= rows - 2 || c === 0 || c === cols - 1 || extra(c, r)) ? '#' : '.';
        t.push(row);
      }
      G.World.defineRoom({ id, region: 'test', dev: true, gx, gy: 954, tiles: t, entities: entities || [] });
    };
    // enemy lab 64×22: floor surface row 20, a floating slab (cols 10–14, row 15), a 2-tile step (cols 46–48)
    box('dev_enemylab', 64, 22, 464, (c, r) => (r === 15 && c >= 10 && c <= 14) || (r >= 18 && c >= 46 && c <= 48));
    // boss lab 56×24: floor surface row 22, two slabs (row 17) for aerial play
    box('dev_bosslab', 56, 24, 528, (c, r) => r === 17 && ((c >= 14 && c <= 19) || (c >= 36 && c <= 41)));
    // a room whose data contains an arena (exercises --room mode): node tools/enemy_selftest.js --boss test --room dev_arenalab
    box('dev_arenalab', 40, 22, 584, () => false, [{ type: 'arena', boss: 'test', bx: 30, by: 19, trigger: [14, 0, 38, 21], x: 1, y: 1 }]);
  },
  sheet: null,
  sheetRow: 0,
  SLOT_W: 150, SLOT_H: 180,
  newSheet(rows) {
    const c = G.U.makeCanvas(LAB.SLOT_W * 8 + 20, rows * LAB.SLOT_H + 40);
    const x = c.ctx;
    const g = x.createLinearGradient(0, 0, 0, c.canvas.height); g.addColorStop(0, '#2c3240'); g.addColorStop(1, '#161a22');
    x.fillStyle = g; x.fillRect(0, 0, c.canvas.width, c.canvas.height);
    x.fillStyle = '#d8dde8'; x.font = '15px Georgia'; x.fillText('GUTTERLIGHT enemy lab — poses (scaled to fit)', 12, 24);
    LAB.sheet = c; LAB.sheetRow = 0;
  },
  // Draw entity e (live pose) into slot (row, col) with a caption.
  snap(e, col, caption) {
    const c = LAB.sheet; if (!c) return;
    const x = c.ctx, W = LAB.SLOT_W, Hh = LAB.SLOT_H;
    const ox = 10 + col * W, oy = 36 + LAB.sheetRow * Hh;
    const s = Math.max(0.4, Math.min(2.5, 100 / Math.max(e.w, e.h * 0.9)));
    x.save();
    x.beginPath(); x.rect(ox, oy, W - 4, Hh - 4); x.clip();
    x.fillStyle = 'rgba(255,255,255,0.03)'; x.fillRect(ox, oy, W - 4, Hh - 4);
    x.translate(ox + W / 2, oy + (e.flying && !e.dying ? Hh * 0.5 : Hh - 34));
    x.scale(s, s);
    x.translate(-e.cx, e.flying && !e.dying ? -e.cy : -(e.y + e.h));
    try { e.draw(x, G.game.t); } catch (err) { G.reportError(err, 'lab draw ' + e.kind); }
    x.restore();
    x.fillStyle = '#9aa3b4'; x.font = '12px monospace'; x.textAlign = 'center';
    x.fillText(caption, ox + W / 2, oy + Hh - 12);
    x.textAlign = 'left';
  },
  label(text) {
    const c = LAB.sheet; if (!c) return;
    c.ctx.fillStyle = '#e8d8b0'; c.ctx.font = 'bold 12px monospace';
    c.ctx.fillText(text, 14, 36 + LAB.sheetRow * LAB.SLOT_H + 14);
  },
  canvasShot() { G.debug.render(); return document.getElementById('game').toDataURL('image/png'); },

  enemy(kind, extraProps) {
    const out = [];
    const chk = (name, ok, detail) => out.push({ name: kind + ': ' + name, ok: !!ok, detail: detail || '' });
    const shots = {};
    if (!G.Enemy.isKind(kind)) { chk('registered (G.registerEnemy)', false, 'known kinds: ' + G.Enemy.kinds().join(',')); LAB.sheetRow++; return { out, shots }; }
    const n0 = G.debug.errors.length;
    const newErrs = () => G.debug.errors.slice(n0);
    H.reset('dev_enemylab', 4, 19); G.debug.god(true);
    const probe = G.Entity.create(Object.assign({ type: 'enemy', kind, tx: 32, ty: 19 }, extraProps || {}));
    if (!probe) { chk('constructs', false, newErrs()[0]); LAB.sheetRow++; return { out, shots }; }
    const fly = !!probe.flying;
    const SX = 32, SY = fly ? 14 : 19;
    const mk = () => H.spawn(kind, SX, SY, extraProps);
    let e = mk();
    const cfg = e.cfg || {};
    chk('spawns & config', !!e && e.hp > 0 && e.team === 'enemy',
      'hp ' + e.hp + ' size ' + e.w + 'x' + e.h + ' weight ' + e.weight + ' contact ' + e.contactDamage + ' cinders ' + JSON.stringify(cfg.cinders) + (fly ? ' flying' : '') + (e.hidden ? ' hidden' : ''));
    LAB.label(kind + '  hp ' + e.hp + (fly ? '  flying' : ''));
    // 1) idle, player far away
    H.step(180);
    LAB.snap(e, 0, 'idle · ' + e.state);
    chk('idles 3 s (player far) without errors', !e.dead && e.room === H.room() && newErrs().length === 0,
      'state ' + e.state + ' at ' + (e.cx / H.T).toFixed(1) + ',' + (e.cy / H.T).toFixed(1) + (newErrs()[0] ? ' ' + newErrs()[0] : ''));
    // 2) engaged: player 6 tiles from the enemy's current position (god mode), hopping now and then
    { const ex = Math.floor(e.cx / H.T); H.park(ex - 6 >= 2 ? ex - 6 : ex + 6, 19); }
    const states = [], teles = []; let lastTele = null, projs = 0, slots = 1, pending = null, strikes = 0;
    const seenProj = new Set();
    const origAttack = G.Combat.attack;
    G.Combat.attack = function (o) { if (o && o.owner === e) strikes++; return origAttack.apply(this, arguments); };
    let shotTaken = false;
    try {
      for (let i = 0; i < 420 && !e.dead; i++) {
        G.input.setVirtual({ jump: i % 90 < 12 });
        const st0 = e.state;
        G.game.step();
        if (e.state !== st0 || i === 0) { if (states.indexOf(e.state) < 0) { states.push(e.state); if (slots < 5) pending = { at: i + 8, st: e.state }; } }
        if (e.tele && e.tele !== lastTele) { lastTele = e.tele; teles.push(e.tele.dur); }
        for (const p of H.room().entities) if (p.type === 'projectile' && p.owner === e && !seenProj.has(p)) { seenProj.add(p); projs++; }
        if (pending && i >= pending.at) { LAB.snap(e, slots++, pending.st); pending = null; }
        if (!shotTaken && (e.telegraphing || projs > 0 || i === 300)) { shotTaken = true; shots.ingame = LAB.canvasShot(); }
      }
    } finally { G.Combat.attack = origAttack; G.input.clearVirtual(); }
    while (slots < 5) LAB.snap(e, slots++, 'now · ' + e.state);
    const minTele = teles.length ? Math.min.apply(null, teles) : null;
    chk('engages the player (info)', true, 'states ' + states.join('>') + ' · telegraphs ' + teles.length + (minTele != null ? ' (min ' + minTele.toFixed(2) + ' s)' : '') + ' · projectiles ' + projs + ' · strike() steps ' + strikes);
    if (minTele != null) chk('telegraphs >= ' + (e.minTelegraph || 0.35) + ' s', minTele >= (e.minTelegraph || 0.35) - 1e-6, 'min ' + minTele.toFixed(2));
    chk('no errors while engaged', newErrs().length === 0, newErrs()[0] || '');
    // 3) contact damage
    if (!e.dead && !e.dying && e.contactDamage > 0) {
      if (e.hidden && e.reveal) e.reveal();
      G.debug.god(false);
      const p = H.p(); const h0 = H.hp(); let hurt = false;
      for (let i = 0; i < 40 && !hurt; i++) { p.invuln = 0; p.placeAt(e.cx - p.w / 2, e.y + e.h - p.h); G.game.step(); if (H.hp() < h0) hurt = true; }
      G.game.progress.health = G.game.maxHealth ? G.game.maxHealth() : 5; G.debug.god(true);
      chk('contact damage hurts the player', hurt, 'contactDamage ' + e.contactDamage);
    } else chk('contact damage (info)', true, 'contactDamage ' + e.contactDamage + ' — not tested');
    // 4) hits to kill (fresh enemy, 5 damage = Brand level 0)
    e.remove(); H.clearEnemies();
    H.park(4, 19);
    e = mk();
    H.step(2);
    if (e.hidden && e.reveal) e.reveal();
    const killed = H.listen('enemyKilled');
    const hp = e.hp; let hits = 0;
    for (let i = 0; i < 2400 && !e.dying && !e.dead && hits < 60; i++) {
      if (i % 24 === 0) {
        if (e.hidden && e.reveal) e.reveal();
        const r = H.hit(e, 5, { x: 1, y: 0 });
        if (r.length) hits++;
        if (hits === 1 && r.length) { G.game.step(); LAB.snap(e, 5, 'hit flash'); }
      }
      G.game.step();
    }
    const lv = [5, 9, 13, 17].map((d) => Math.ceil(hp / d)).join('/');
    chk('dies from Brand hits', e.dying || e.dead, hits + ' hits of 5 (Brand lv 0–3: ' + lv + ' hits)');
    const minC = Array.isArray(cfg.cinders) ? +cfg.cinders[0] || 0 : +cfg.cinders || 0;
    chk('death → enemyKilled + cinders', killed.n === 1 && (minC > 0 ? (e.droppedCinders || 0) >= minC : true), 'events ' + killed.n + ' cinders ' + (e.droppedCinders || 0) + ' (cfg ' + JSON.stringify(cfg.cinders) + ')');
    let melt = false, puddle = false, steps = 0;
    for (; steps < 900 && !e.dead; steps++) {
      G.game.step();
      if (!melt && e.meltStarted && e.melt > 0.4) { melt = true; LAB.snap(e, 6, 'melting'); }
      if (!puddle && e.meltStarted && e.melt >= 1 && e.deathT - (e.meltT0 || 0) > (cfg.meltTime || 0.5) + 0.6) { puddle = true; LAB.snap(e, 7, 'puddle'); shots.death = LAB.canvasShot(); }
    }
    chk('corpse melts and is removed', e.dead && melt, 'removed after ' + (steps / 60).toFixed(1) + ' s');
    chk('no errors', newErrs().length === 0, newErrs().slice(0, 2).join(' | '));
    LAB.sheetRow++;
    return { out, shots };
  },

  boss(id, seconds, roomId) {
    const out = [];
    const chk = (name, ok, detail) => out.push({ name: 'boss ' + id + ': ' + name, ok: !!ok, detail: detail || '' });
    const shots = [];
    const type = 'boss_' + id;
    if (!G.Entity.isRegistered(type)) { chk('registered as entity type ' + type, false, 'use G.Boss.register(\\'' + id + '\\', Class)'); return { out, shots }; }
    const n0 = G.debug.errors.length;
    const newErrs = () => G.debug.errors.slice(n0);
    let ar;
    H.reset(roomId ? null : 'dev_bosslab', 4, 21);
    if (G.game.bossDefeated(id)) { G.game.progress.bosses[id] = false; delete G.game.progress.flags['boss:' + id]; }
    G.debug.god(true);
    const listen = {};
    for (const n of ['arenaStart', 'arenaEnd', 'bossStart', 'bossPhase', 'bossStagger', 'bossDefeated']) listen[n] = H.listen(n);
    if (roomId) {
      G.debug.teleport(roomId, 4, 15); G.debug.step(2);
      ar = H.room().findType('arena')[0];
      if (!ar) { chk('room ' + roomId + ' has an arena entity', false); return { out, shots }; }
    } else {
      H.room().entities.filter((x) => x.type === 'arena' || x.type === 'arena_gate').forEach((x) => { x.dead = true; });
      H.room().removeDead();
      if (G.Entity.isRegistered('arena_gate')) { G.debug.spawn({ type: 'arena_gate', id: 'lab_g1', tx: 8, ty: 21, h: 4 }); G.debug.spawn({ type: 'arena_gate', id: 'lab_g2', tx: 47, ty: 21, h: 4 }); }
      ar = G.debug.spawn({ type: 'arena', boss: id, bx: 38, by: 21, trigger: [10, 0, 45, 23] });
    }
    const gates = () => H.room().findType('arena_gate');
    const cards = [];
    const UI = G.UI, origCard = UI && UI.bossCard;
    if (UI) UI.bossCard = function (b) { cards.push(b); return origCard ? origCard.apply(this, arguments) : undefined; };
    let hurtCalls = 0; const hurtBy = {};
    const origHurt = G.Combat.hurtPlayer;
    G.Combat.hurtPlayer = function (amount, src) {
      hurtCalls++; const k = (src && (src.kind || src.type)) || '?'; hurtBy[k] = (hurtBy[k] || 0) + 1;
      return origHurt.apply(this, arguments);
    };
    try {
      // enter the trigger
      const tr = ar.trigger;
      const tc = Math.floor((tr.x + tr.w * 0.3) / H.T), trow = roomId ? ar.by : 21;
      H.park(tc, trow);
      H.step(400, () => !!(ar.boss && ar.boss.fightStarted));
      const b0 = ar.boss;
      chk('trigger → arenaStart, gates close, boss spawns', listen.arenaStart.n === 1 && !!b0 && b0.type === type && gates().every((g) => g.closed !== false),
        'arenaStart ' + listen.arenaStart.n + ' gates ' + gates().length + ' closed ' + gates().filter((g) => g.closed).length + ' boss ' + (b0 && b0.type));
      if (!b0) return { out, shots };
      const music = G.game._internal.bossMusic;
      chk('fight start: card + music', cards.indexOf(id) >= 0 && music === (G.Boss.MUSIC[id] || 'boss') && listen.bossStart.n >= 1,
        'card ' + JSON.stringify(cards) + ' music ' + music + ' (expected ' + (G.Boss.MUSIC[id] || 'boss') + ')');
      chk('config (info)', true, 'hp ' + b0.maxHp + ' size ' + b0.w + 'x' + b0.h + ' phases ' + JSON.stringify(b0.phaseThresholds) + ' stagger ' + JSON.stringify(b0.cfg.stagger) + ' attacks ' + Object.keys(b0.attacks).join(','));
      // fight: random play, chip damage so the last phase is reached near the end
      const N = Math.round(seconds * 60);
      const nHits = Math.max(4, Math.round(seconds * 1.2));
      const dmg = Math.max(1, Math.ceil(b0.maxHp * 0.93 / nHits));
      const every = Math.max(1, Math.floor(N / nHits));
      const atk = {}; const teles = []; let lastTele = null, lastAtk = null, maxPhase = 1, shotEvery = Math.floor(N / 5);
      let keys = {};
      for (let i = 0; i < N; i++) {
        const b = ar.boss;
        if (!b || b.dying || b.dead) break;
        if (i % 12 === 0) keys = { left: Math.random() < 0.4, right: Math.random() < 0.4, jump: Math.random() < 0.3, attack: Math.random() < 0.4, dash: Math.random() < 0.08 };
        G.input.setVirtual(keys);
        if (i % every === every - 1 && b.hurtRect && b.hurtRect()) H.hit(b, dmg, { x: b.cx > H.p().cx ? 1 : -1, y: 0 });
        G.game.step();
        if (G.game.progress.health <= 1) G.game.progress.health = 5;
        if (b.attack && b.attack !== lastAtk) atk[b.attack] = (atk[b.attack] || 0) + 1;
        lastAtk = b.attack;
        if (b.tele && b.tele !== lastTele) { lastTele = b.tele; teles.push(b.tele.dur); }
        maxPhase = Math.max(maxPhase, b.phase || 1);
        if (i > 0 && i % shotEvery === 0) shots.push(LAB.canvasShot());
      }
      G.input.clearVirtual();
      const names = Object.keys(atk);
      const minTele = teles.length ? Math.min.apply(null, teles) : null;
      chk('uses its attacks', names.length >= Math.min(2, Object.keys(b0.attacks).length), Object.keys(atk).map((k) => k + '×' + atk[k]).join(' ') + ' (declared: ' + Object.keys(b0.attacks).join(',') + ')');
      chk('telegraphs (info)', true, teles.length + ' telegraphs' + (minTele != null ? ', min ' + minTele.toFixed(2) + ' s' : ''));
      chk('phases reached', maxPhase === b0.phaseThresholds.length + 1, 'max phase ' + maxPhase + ' of ' + (b0.phaseThresholds.length + 1) + ' · bossPhase events ' + listen.bossPhase.n + ' · staggers ' + listen.bossStagger.n);
      chk('threatens the player (info)', true, hurtCalls + ' hurtPlayer calls ' + JSON.stringify(hurtBy));
      chk('no errors during the fight', newErrs().length === 0, newErrs().slice(0, 2).join(' | '));
      // defeat
      const b = ar.boss;
      if (b && !b.dying && !b.dead) b.kill();
      let dShot = false;
      H.step(60 * 25, (i) => { if (!dShot && i === 50) { dShot = true; shots.push(LAB.canvasShot()); } return ar.state === 'done' && i > 120; });
      H.step(90);
      shots.push(LAB.canvasShot());
      chk('defeat recorded: bossDefeated, arenaEnd, gates open, music restored',
        G.game.bossDefeated(id) && listen.bossDefeated.n >= 1 && listen.arenaEnd.n === 1 && listen.arenaEnd.last.victory && gates().every((g) => g.state === 'open' || g.open === true) && G.game._internal.bossMusic == null,
        'defeated ' + G.game.bossDefeated(id) + ' arenaEnd ' + listen.arenaEnd.n + ' gates open ' + gates().filter((g) => g.state === 'open').length + '/' + gates().length + ' music ' + G.game._internal.bossMusic + ' arena ' + ar.state);
      chk('no errors', newErrs().length === 0, newErrs().slice(0, 2).join(' | '));
    } finally {
      G.Combat.hurtPlayer = origHurt;
      if (UI) UI.bossCard = origCard;
      G.input.clearVirtual();
    }
    return { out, shots };
  },
};
`;

async function runLab() {
  const outDir = OPTS.out ? path.resolve(ROOT, OPTS.out) : path.join(OUT, 'lab');
  fs.mkdirSync(outDir, { recursive: true });
  const q = 'test=1&paused=1&testrooms=1&mute=1' + (OPTS.region ? '&region=' + encodeURIComponent(OPTS.region) : '');
  const { page, errors } = await openGame({ query: q });
  await page.addScriptTag({ content: HELPERS });
  await page.addScriptTag({ content: LAB_HELPERS });
  await page.evaluate(`LAB.ensureRooms(); G.Boss.skipDialogue = ${OPTS.dialogue ? 'false' : 'true'};`);
  const save = (dataUrl, name) => {
    if (!dataUrl) return;
    fs.writeFileSync(path.join(outDir, name), Buffer.from(dataUrl.split(',')[1], 'base64'));
    console.log('      wrote ' + path.relative(ROOT, path.join(outDir, name)));
  };
  let extra = null;
  if (OPTS.props) { try { extra = JSON.parse(OPTS.props); } catch (e) { console.error('--props is not valid JSON'); process.exit(2); } }
  if (OPTS.kinds) {
    const kinds = String(OPTS.kinds).split(',').map((s) => s.trim()).filter(Boolean);
    await page.evaluate(`LAB.newSheet(${kinds.length})`);
    for (const k of kinds) {
      let r;
      try { r = await page.evaluate(`LAB.enemy(${JSON.stringify(k)}, ${JSON.stringify(extra)})`); } catch (e) { r = { out: [{ name: k + ': lab run', ok: false, detail: 'threw: ' + e.message.split('\n')[0] }], shots: {} }; }
      for (const c of r.out) report(c.name, c.ok, c.detail);
      save(r.shots.ingame, 'lab_' + k + '_ingame.png');
      save(r.shots.death, 'lab_' + k + '_death.png');
    }
    save(await page.evaluate('LAB.sheet.canvas.toDataURL("image/png")'), 'lab_' + (kinds.length > 3 ? kinds.length + '_kinds' : kinds.join('+')) + '.png');
  }
  if (OPTS.boss) {
    const secs = Math.max(5, +OPTS.seconds || 40);
    let r;
    try { r = await page.evaluate(`LAB.boss(${JSON.stringify(String(OPTS.boss))}, ${secs}, ${JSON.stringify(OPTS.room || null)})`); } catch (e) { r = { out: [{ name: 'boss lab run', ok: false, detail: 'threw: ' + e.message.split('\n')[0] }], shots: [] }; }
    for (const c of r.out) report(c.name, c.ok, c.detail);
    r.shots.forEach((s, i) => save(s, 'lab_boss_' + OPTS.boss + '_' + i + '.png'));
  }
  report('no console errors', errors.length === 0, errors.slice(0, 3).join(' | '));
  await closeAll();
  const failed = results.filter((x) => !x.ok);
  console.log('\n' + (failed.length ? 'FAILED ' + failed.length + ' of ' + results.length : 'ALL PASS (' + results.length + ' checks)'));
  process.exit(failed.length ? 1 : 0);
}


// The annotated examples in docs/api/enemies.md (```js blocks starting with "// EXAMPLE:") must run.
async function docsCheck(page) {
  const md = fs.readFileSync(path.join(ROOT, 'docs', 'api', 'enemies.md'), 'utf8');
  const blocks = [];
  const re = /```js\n(\/\/ EXAMPLE:[^\n]*\n[\s\S]*?)```/g;
  let m;
  while ((m = re.exec(md))) blocks.push(m[1]);
  report('docs: annotated examples found in docs/api/enemies.md', blocks.length >= 3, blocks.length + ' blocks');
  for (const b of blocks) {
    try { await page.addScriptTag({ content: b }); } catch (e) { report('docs: example loads', false, e.message.split('\n')[0]); }
  }
  await page.evaluate('LAB.ensureRooms(); LAB.newSheet(2);');
  for (const k of ['example_lancer', 'example_spitter']) {
    const r = await page.evaluate(`LAB.enemy(${JSON.stringify(k)})`);
    const bad = r.out.filter((c) => !c.ok);
    const info = r.out.find((c) => /engages/.test(c.name));
    report('docs: ' + k + ' passes the enemy lab', bad.length === 0, bad.length ? bad.map((c) => c.name + ' ' + c.detail).join(' | ') : (info && info.detail));
  }
  const sheet = await page.evaluate('LAB.sheet.canvas.toDataURL("image/png")');
  fs.writeFileSync(path.join(OUT, 'docs_examples.png'), Buffer.from(sheet.split(',')[1], 'base64'));
  const rb = await page.evaluate(`LAB.boss('example', 24, null)`);
  const badB = rb.out.filter((c) => !c.ok);
  const atk = rb.out.find((c) => /uses its attacks/.test(c.name));
  report('docs: boss_example passes the boss lab (arena flow, attacks, phases, defeat)', badB.length === 0,
    badB.length ? badB.map((c) => c.name + ' ' + c.detail).join(' | ') : (atk && atk.detail));
  if (rb.shots[1]) fs.writeFileSync(path.join(OUT, 'docs_example_boss.png'), Buffer.from(rb.shots[1].split(',')[1], 'base64'));
}

(async () => {
  if (OPTS.kinds || OPTS.boss) { await runLab(); return; }
  const list = CHECKS.filter(([name]) => wanted(name));
  const { page, errors } = await openGame({ query: 'test=1&paused=1&testrooms=1&mute=1' });
  await page.addScriptTag({ content: HELPERS });
  for (const [name, body] of list) {
    let r;
    try { r = await page.evaluate(`(() => { ${body} })()`); } catch (e) { r = { ok: false, detail: 'threw: ' + e.message.split('\n')[0] }; }
    report(name, !!(r && r.ok), r && r.detail);
  }
  if (!filters.length || wanted('docs')) {
    try { await page.addScriptTag({ content: LAB_HELPERS }); await docsCheck(page); } catch (e) { report('docs: examples', false, 'threw: ' + e.message.split('\n')[0]); }
  }
  if (!filters.length || wanted('shots')) {
    try { await shots(page); report('screenshots rendered to test-output/enemies/', true); } catch (e) { report('screenshots rendered', false, e.message.split('\n')[0]); }
  }
  const unexpected = errors.filter((e) => !EXPECTED_ERRORS.test(e));
  report('no unexpected console errors', unexpected.length === 0, unexpected.slice(0, 5).join(' | '));
  await closeAll();
  const failed = results.filter((r) => !r.ok);
  console.log('\n' + (failed.length ? 'FAILED ' + failed.length + ' of ' + results.length : 'ALL PASS (' + results.length + ' checks)'));
  process.exit(failed.length ? 1 : 0);
})().catch(async (e) => { console.error(e); await closeAll(); process.exit(1); });
