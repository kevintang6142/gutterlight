#!/usr/bin/env node
// Player self-test: scripted headless checks of the Wickling (G.Player) in the engine's dev rooms, plus a
// contact sheet of every animation state (test-output/player/poses*.png).
//
//   node tools/player_selftest.js              all checks + contact sheets
//   node tools/player_selftest.js sheet        only the contact sheets
//   node tools/player_selftest.js pogo kindle  only checks whose name contains one of the words
//
// Exit code 1 on any failure or unexpected console error.
'use strict';
const path = require('path');
const fs = require('fs');
const { openGame, closeAll, ROOT } = require('./lib/browser');

const OUT = path.join(ROOT, 'test-output', 'player');
const args = process.argv.slice(2).map((s) => s.toLowerCase());
const onlySheet = args.length === 1 && args[0] === 'sheet';
const filters = onlySheet ? [] : args.filter((a) => a !== 'sheet');
const wanted = (name) => !filters.length || filters.some((f) => name.toLowerCase().includes(f));
const results = [];
function report(name, ok, detail) {
  results.push({ name, ok });
  console.log((ok ? 'PASS  ' : 'FAIL  ') + name.padEnd(56) + (detail ? '  ' + detail : ''));
}

// ------------------------------------------------------------------------------------------ in-page helpers
const HELPERS = `
window.H = {
  reset(opts) {
    G.debug.clearInput();
    // a previous check may have collected a dev-room pickup whose blocking card would freeze gameplay
    if (G.UI && typeof G.UI.closeAll === 'function') G.UI.closeAll(false);
    G.game.god = false;
    G.game.newGame(0);
    G.debug.step(2);
    H.ensureDummies();
  },
  tp(room, tx, ty) { G.debug.teleport(room, tx, ty); G.debug.step(1); },
  p() { return G.game.player; },
  m() { return G.game.player.motor; },
  feet() { const m = H.m(); return m.y + m.h; },
  cx() { const m = H.m(); return m.x + m.w / 2; },
  pr() { return G.game.progress; },
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
  settle(n) { return H.drive(n || 30, null, (m) => m.onGround && Math.abs(m.vx) < 1 && G.game.mode === 'play' && !G.game.isLocked()); },
  ensureDummies() {
    if (!G.Entity.isRegistered('ptest_dummy')) {
      G.registerEntity('ptest_dummy', class extends G.Entity {
        constructor(p) {
          super(p); this.w = p.w || 40; this.h = p.h || 40; this.team = 'enemy'; this.hurtable = true;
          this.contactDamage = p.contact || 0; this.hp = p.hp || 1000; this.hits = []; this.anchor = p.anchor || 'ground';
          this.pogoable = p.pogoable !== false; this.fly = !!p.fly;
        }
        onHit(hit) { this.hits.push({ damage: hit.damage, kind: hit.kind, dir: hit.dir, pogo: hit.pogo }); this.hp -= hit.damage; return true; }
        draw(ctx) { ctx.fillStyle = '#c04040'; ctx.fillRect(this.x, this.y, this.w, this.h); }
      });
    }
    if (!G.Entity.isRegistered('ptest_sign')) {
      G.registerEntity('ptest_sign', class extends G.Entity {
        constructor(p) { super(p); this.w = 30; this.h = 40; this.interactable = true; this.promptText = 'Read'; this.used = 0; }
        interact(player) { this.used++; this.by = player; }
        draw(ctx) { ctx.fillStyle = '#806040'; ctx.fillRect(this.x, this.y, this.w, this.h); }
      });
    }
  },
};
`;

// ------------------------------------------------------------------------------------------ checks
const CHECKS = [
  ['contract: G.Player registered and used by the engine', `
    H.reset();
    const p = H.p();
    const ok = G.Entity.isRegistered('player') && p instanceof G.Player && p.type === 'player' && p.w === 26 && p.h === 54 &&
      typeof p.hurt === 'function' && typeof p.placeAt === 'function' && typeof p.respawn === 'function' && typeof p.busy === 'function' &&
      p.motor && p.x === p.motor.x && p.y === p.motor.y && G.Entity.isRegistered('player_bolt') && G.Entity.isRegistered('flare_trail');
    return { ok, detail: p.type };
  `],
  ['walk: instant run at 330 px/s, instant stop', `
    H.reset(); H.tp('dev_01', 12, 15);
    H.drive(2, () => ({ right: true }));
    const v = H.m().vx;
    const x0 = H.m().x;
    H.drive(30, () => ({ right: true }));
    const dx = H.m().x - x0;
    H.drive(1, () => ({}));
    const v2 = H.m().vx;
    return { ok: v === 330 && Math.abs(dx - 165) < 1 && v2 === 0 && H.p().facing === 1, detail: 'v ' + v + ' dx ' + dx.toFixed(1) + ' stop ' + v2 };
  `],
  ['walk: footstep cadence + run animation state', `
    H.reset(); H.tp('dev_01', 12, 15);
    let steps = 0, states = new Set();
    const orig = G.Audio && G.Audio.sfx;
    const seen = [];
    if (G.Audio) G.Audio.sfx = function (n, o) { seen.push(n); return orig ? orig.apply(this, arguments) : null; };
    H.drive(60, () => ({ right: true }), () => { states.add(G.PlayerDraw.poseFrom(H.p()).state); return false; });
    if (G.Audio) G.Audio.sfx = orig;
    steps = seen.filter((n) => n === 'step').length;
    return { ok: steps >= 5 && steps <= 9 && states.has('run'), detail: steps + ' steps/s, states ' + [...states].join(',') };
  `],
  ['jump: full jump apex 4.4–4.8 tiles, tap hop ≤ 1.6', `
    H.reset(); H.tp('dev_01', 12, 15);
    const y0 = H.feet(); let minF = 1e9;
    H.drive(90, () => ({ jump: true }), (m) => { minF = Math.min(minF, m.y + m.h); return m.onGround && m.vy === 0 && minF < y0 - 10; });
    const full = (y0 - minF) / 40;
    H.settle(10);
    let minT = 1e9;
    H.drive(60, (i) => ({ jump: i < 2 }), (m) => { minT = Math.min(minT, m.y + m.h); return m.onGround && minT < y0 - 2; });
    const tap = (y0 - minT) / 40;
    return { ok: full >= 4.4 && full <= 4.8 && tap <= 1.6 && tap > 0.2, detail: 'full ' + full.toFixed(2) + ' tap ' + tap.toFixed(2) };
  `],
  ['attack: side slash hits a dummy once per swing, 11 ember, recoil', `
    H.reset(); H.tp('dev_01', 12, 15);
    const p = H.p();
    const d = G.debug.spawn({ type: 'ptest_dummy', x: H.m().x + H.m().w + 30, y: H.feet() - 40 });
    H.drive(1, () => ({ attack: true }));
    const x1 = H.m().x;
    H.drive(10, () => ({}));
    const recoil = x1 - H.m().x;
    const hits1 = d.hits.length;
    H.drive(10, () => ({}));
    const ok = hits1 === 1 && d.hits[0].damage === 5 && d.hits[0].kind === 'nail' && d.hits[0].dir.x === 1 && H.pr().ember === 11 && recoil > 5;
    return { ok, detail: 'hits ' + hits1 + ' dmg ' + (d.hits[0] && d.hits[0].damage) + ' ember ' + H.pr().ember + ' recoil ' + recoil.toFixed(1) };
  `],
  ['attack: cooldown 0.38 s, buffered press fires on cooldown end', `
    H.reset(); H.tp('dev_01', 12, 15);
    const d = G.debug.spawn({ type: 'ptest_dummy', x: H.m().x + H.m().w + 20, y: H.feet() - 40 });
    H.drive(1, () => ({ attack: true }));
    H.drive(10, () => ({}));
    H.drive(1, () => ({ attack: true }));        // during cooldown, too early to buffer (0.18 s before ready)
    H.drive(4, () => ({}));
    const early = d.hits.length;
    // press 4 frames before the cooldown ends → buffered → fires exactly when ready
    const p = H.p();
    H.drive(200, () => ({}), () => p.attackCd <= 4 / 60 + 1e-6);
    H.drive(1, () => ({ attack: true }));
    let fired = -1;
    H.drive(10, () => ({}), (m, i) => { if (d.hits.length > early) { fired = i; return true; } return false; });
    return { ok: early === 1 && fired >= 1 && fired <= 4, detail: 'early ' + early + ' buffered swing after ' + fired + ' frames' };
  `],
  ['attack: up slash hits above, down slash only airborne', `
    H.reset(); H.tp('dev_01', 12, 15);
    const d = G.debug.spawn({ type: 'ptest_dummy', x: H.cx() - 20, y: H.m().y - 70 });
    H.drive(1, () => ({ up: true, attack: true })); H.drive(25);
    const up = d.hits.length === 1 && d.hits[0].dir.y === -1;
    d.remove();
    const below = G.debug.spawn({ type: 'ptest_dummy', x: H.cx() - 20, y: H.feet() + 10, w: 40, h: 20 });
    H.drive(1, () => ({ down: true, attack: true })); H.drive(25);
    const groundDown = H.p().slash ? H.p().slash.dir : 'none';
    const st = below.hits.length;
    below.remove();
    return { ok: up && st === 0, detail: 'up ' + up + ' ground down-slash hits ' + st };
  `],
  ['attack: long_brand reach +35%, swift_brand cooldown -30%, last_light', `
    H.reset(); H.tp('dev_01', 12, 15);
    const p = H.p();
    const r0 = p.slashRect('side', 1).w;
    G.game.giveItem('sigil:long_brand', { silent: true }); G.game.giveItem('sigil:swift_brand', { silent: true });
    G.game.progress.notches = 6;
    G.game.equip('long_brand'); G.game.equip('swift_brand');
    const r1 = p.slashRect('side', 1).w, u1 = p.slashRect('up', 1).h;
    const cd = p.attackCooldown();
    G.game.giveItem('sigil:last_light', { silent: true }); G.game.equip('last_light');
    const d0 = p.brandDamage(); G.game.progress.health = 1; const d1 = p.brandDamage();
    G.game.progress.brandLevel = 3; const d3 = p.brandDamage();
    return { ok: Math.abs(r1 / r0 - 1.35) < 0.01 && Math.abs(u1 - 108) < 0.5 && Math.abs(cd - 0.266) < 0.001 && d0 === 5 && d1 === 9 && d3 === 30,
      detail: 'reach ' + r0 + '→' + r1.toFixed(1) + ' cd ' + cd.toFixed(3) + ' dmg ' + d0 + '/' + d1 + '/' + d3 };
  `],
  ['pogo: down-slash on a dummy bounces and restores air dash', `
    H.reset(); G.debug.give('dash'); H.tp('dev_01', 12, 15);
    const d = G.debug.spawn({ type: 'ptest_dummy', x: H.cx() - 20, y: H.feet() - 30, w: 40, h: 30 });
    d.y = H.feet() - 30;
    H.m().y -= 140; H.p().y = H.m().y; H.m().vy = 0;
    H.m().airDashUsed = true;
    let pogoed = false;
    H.drive(60, (i, m) => ({ down: true, attack: m.y + m.h > d.y - 55 }), (m) => { if (m.vy < -500) pogoed = true; return pogoed; });
    const refreshed = !H.m().airDashUsed;
    return { ok: pogoed && d.hits.length >= 1 && d.hits[0].pogo && refreshed, detail: 'pogo ' + pogoed + ' hits ' + d.hits.length + ' dash refreshed ' + refreshed };
  `],
  ['pogo: down-slash bounces off spikes without damage', `
    H.reset(); H.tp('dev_02', 76, 14);
    H.m().y -= 160; H.p().y = H.m().y;
    const hp0 = H.pr().health;
    let bounced = 0, minY = 1e9;
    // swing whenever the cooldown allows and the spikes are within reach; three bounces in a row
    H.drive(150, (i, m) => ({ down: true, attack: i % 2 === 0 && m.vy > 0 && m.y + m.h > 600 - 70 }), (m) => { if (H.p().lastEvents.indexOf('pogo') >= 0 || (m.vy < -600 && !m.onGround)) bounced++; return m.hazard || bounced >= 3; });
    const ok = bounced >= 1 && H.pr().health === hp0 && !H.m().hazard;
    return { ok, detail: 'bounces ' + bounced + ' health ' + H.pr().health + ' hazard ' + H.m().hazard };
  `],
  ['dash: 750 px/s for 0.18 s, afterimages + dash sfx', `
    H.reset(); G.debug.give('dash'); H.tp('dev_01', 12, 15);
    const x0 = H.m().x;
    H.drive(1, () => ({ dash: true }));
    const v = H.m().vx, st = G.PlayerDraw.poseFrom(H.p()).state;
    H.drive(12, () => ({}));
    const dist = (H.m().x - x0) / 40;
    const after = H.p().gfx.after.length;
    return { ok: v === 750 && st === 'dash' && dist > 3.2 && dist < 3.6 && after >= 1, detail: 'v ' + v + ' dist ' + dist.toFixed(2) + ' t, afterimages ' + after };
  `],
  ['wall: grip + climb the dev_shaft pillar', `
    H.reset(); G.debug.give('grip'); H.tp('dev_shaft', 12, 34);
    const y0 = H.feet();
    let grips = 0;
    // jump toward the pillar (cols 14-15), then wall-jump repeatedly while steering back
    H.drive(600, (i, m) => {
      const t = i % 24;
      if (m.wall) return { right: true, jump: t < 1 ? false : t < 12 };
      return { right: true, jump: t < 12 };
    }, (m) => { if (m.events.indexOf('grip') >= 0) grips++; return m.y + m.h < y0 - 8 * 40; });
    const rise = (y0 - H.feet()) / 40;
    return { ok: grips >= 2 && rise >= 8, detail: 'grips ' + grips + ' rise ' + rise.toFixed(1) + ' tiles' };
  `],
  ['wings: double jump adds height (Smokewing state)', `
    H.reset(); G.debug.give('wings'); H.tp('dev_01', 12, 15);
    const y0 = H.feet(); let minF = 1e9, sawWings = false;
    H.drive(120, (i) => ({ jump: i < 22 || (i >= 26 && i < 50) }), (m, i) => { minF = Math.min(minF, m.y + m.h); if (H.p().djumpT > 0) sawWings = true; return i > 30 && m.onGround; });
    const rise = (y0 - minF) / 40;
    return { ok: rise > 7 && sawWings, detail: 'rise ' + rise.toFixed(2) + ' tiles' };
  `],
  ['swim: oilcloak floats in dev_water, ripples, no hazard', `
    H.reset(); G.debug.give('oilcloak'); H.tp('dev_water', 26, 15);
    H.drive(120, () => ({ right: true }), (m) => m.swimming && m.x > 31 * 40);
    const sw = H.m().swimming;
    H.drive(40, () => ({ right: true }));
    const rip = H.p().gfx.ripples.length;
    const st = G.PlayerDraw.poseFrom(H.p()).state;
    return { ok: sw && H.m().swimming && !H.m().hazard && st === 'swim' && rip >= 1 && H.pr().health === 5, detail: 'swimming ' + H.m().swimming + ' ripples ' + rip + ' state ' + st };
  `],
  ['plunge: costs 33 ember, breaks the D floor, shockwave hits a dummy', `
    H.reset(); G.debug.give('plunge'); H.tp('dev_below', 29, 9);
    G.game.progress.ember = 66;
    const d = G.debug.spawn({ type: 'ptest_dummy', x: 29 * 40 + 60, y: 640 - 40 });
    H.drive(10, () => ({ jump: true }));
    H.drive(1, () => ({ down: true, spell: true }));
    const e1 = H.pr().ember, plunging = H.m().plunging;
    let landed = false;
    H.drive(120, () => ({ down: true }), (m) => { if (m.events.indexOf('plungeLand') >= 0) landed = true; return landed; });
    const comp = G.game.room.componentAt(29, 10);
    return { ok: plunging && e1 === 33 && landed && comp.broken && H.feet() === 640 && d.hits.length === 1 && d.hits[0].kind === 'plunge' && d.hits[0].damage === 15,
      detail: 'ember ' + e1 + ' broken ' + comp.broken + ' feet ' + H.feet() + ' dummy hits ' + d.hits.length };
  `],
  ['plunge: invulnerable while plunging; no ember → no plunge', `
    H.reset(); G.debug.give('plunge'); H.tp('dev_below', 8, 15);
    G.game.progress.ember = 0;
    H.drive(10, () => ({ jump: true }));
    H.drive(1, () => ({ down: true, spell: true }));
    const noPlunge = !H.m().plunging;
    G.game.progress.ember = 33;
    H.drive(1, () => ({ down: true }));
    H.drive(1, () => ({ down: true, spell: true }));
    const pl = H.m().plunging;
    const hurt = G.Combat.hurtPlayer(1, { x: 0, y: 0 });
    H.drive(60, () => ({}), (m) => !m.plunging);
    return { ok: noPlunge && pl && !hurt && H.pr().health === 5, detail: 'noPlunge ' + noPlunge + ' plunged ' + pl + ' hurt ' + hurt };
  `],
  ['bolt: tap casts, costs 33, pierces 2 dummies, bursts on wall', `
    H.reset(); G.debug.give('bolt'); H.tp('dev_01', 40, 15);
    G.game.progress.ember = 99; G.game.progress.health = 5;
    const a = G.debug.spawn({ type: 'ptest_dummy', x: H.cx() + 120, y: H.feet() - 50, h: 50 });
    const b = G.debug.spawn({ type: 'ptest_dummy', x: H.cx() + 260, y: H.feet() - 50, h: 50 });
    H.drive(1, () => ({ spell: true }));
    const e1 = H.pr().ember;
    const bolt = G.game.room.entities.find((e) => e.type === 'player_bolt');
    let burst = false;
    H.drive(120, () => ({}), () => { if (bolt.burst) burst = true; return bolt.dead; });
    return { ok: e1 === 66 && !!bolt && a.hits.length === 1 && b.hits.length === 1 && a.hits[0].damage === 15 && a.hits[0].kind === 'spell' && burst && H.pr().ember === 66,
      detail: 'ember ' + e1 + ' hits ' + a.hits.length + '/' + b.hits.length + ' burst ' + burst };
  `],
  ['bolt: bright_bolt ×1.5 damage, breaks B wall in 3 casts', `
    H.reset(); G.debug.give('bolt'); H.tp('dev_below', 54, 15);
    G.game.giveItem('sigil:bright_bolt', { silent: true }); G.game.equip('bright_bolt');
    const d = G.debug.spawn({ type: 'ptest_dummy', x: H.cx() + 60, y: H.feet() - 50, h: 50 });
    G.game.progress.ember = 99;
    H.drive(1, () => ({ right: true, spell: true })); H.drive(40);
    const dmg = d.hits[0] && d.hits[0].damage;
    d.remove();
    const comp = G.game.room.componentAt(58, 5);
    for (let k = 0; k < 2; k++) { G.game.progress.ember = 99; H.drive(1, () => ({ spell: true })); H.drive(40); }
    return { ok: dmg === 23 && comp.broken, detail: 'dmg ' + dmg + ' wall hits ' + comp.hits + ' broken ' + comp.broken };
  `],
  ['kindle: hold heals 1 after 0.9 s, spends 33, chains', `
    H.reset(); H.tp('dev_01', 12, 15);
    G.game.progress.health = 2; G.game.progress.ember = 99;
    let healAt = -1;
    H.drive(60, () => ({ spell: true }), (m, i) => { if (G.game.progress.health === 3) { healAt = i + 1; return true; } return false; });
    const e1 = H.pr().ember;
    const kindling = !!H.p().kindle;
    H.drive(70, () => ({ spell: true }), () => G.game.progress.health === 4);
    const chained = H.pr().health === 4 && H.pr().ember === 33;
    H.drive(2);
    return { ok: healAt >= 53 && healAt <= 56 && e1 === 66 && kindling && chained && !H.p().kindle, detail: 'healed at frame ' + healAt + ' ember ' + e1 + ' chained ' + chained };
  `],
  ['kindle: interrupted by damage; tap with full health casts bolt', `
    H.reset(); G.debug.give('bolt'); H.tp('dev_01', 40, 15);
    G.game.progress.health = 3; G.game.progress.ember = 99;
    H.drive(30, () => ({ spell: true }));
    const was = !!H.p().kindle;
    G.Combat.hurtPlayer(1, { x: H.cx() + 30, y: H.feet() - 20 });
    const cancelled = !H.p().kindle;
    H.drive(40, () => ({ spell: true }));
    const hp = H.pr().health;
    H.drive(80, () => ({}));
    G.game.progress.health = G.game.maxHealth();
    const e0 = H.pr().ember;
    H.drive(1, () => ({ spell: true })); H.drive(3);
    const bolts = G.game.room.entities.filter((e) => e.type === 'player_bolt').length;
    return { ok: was && cancelled && hp === 2 && bolts === 1 && H.pr().ember === e0 - 33, detail: 'kindling ' + was + ' cancelled ' + cancelled + ' hp ' + hp + ' bolts ' + bolts };
  `],
  ['kindle: kindle_haste −40%, deep_kindle heals 2 (+65% time)', `
    H.reset(); H.tp('dev_01', 12, 15);
    const p = H.p();
    G.game.progress.notches = 6;
    G.game.giveItem('sigil:kindle_haste', { silent: true }); G.game.equip('kindle_haste');
    const d1 = p.kindleDuration();
    G.game.unequip('kindle_haste');
    G.game.giveItem('sigil:deep_kindle', { silent: true }); G.game.equip('deep_kindle');
    const d2 = p.kindleDuration();
    G.game.progress.health = 1; G.game.progress.ember = 33;
    H.drive(120, () => ({ spell: true }), () => G.game.progress.health > 1);
    return { ok: Math.abs(d1 - 0.54) < 1e-6 && Math.abs(d2 - 1.485) < 1e-6 && H.pr().health === 3, detail: 'haste ' + d1.toFixed(3) + ' deep ' + d2.toFixed(3) + ' hp ' + H.pr().health };
  `],
  ['hurt: i-frames 1.0 s, knockback, hitstop; steadfast & smolder_shell', `
    H.reset(); H.tp('dev_01', 40, 15);
    const ok1 = G.Combat.hurtPlayer(1, { x: H.cx() + 20, y: H.feet() - 20, w: 0, h: 0 });
    const ok2 = G.Combat.hurtPlayer(1, { x: H.cx() + 20, y: H.feet() - 20 });
    const hs = G.game.hitstopTime;
    const inv = H.p().invuln;
    H.drive(14);
    const knockVx = H.m().vx;
    H.drive(60, () => ({}), () => H.p().invuln <= 0);
    const ok3 = G.Combat.hurtPlayer(1, { x: H.cx() - 20, y: 0 });
    // steadfast: no knockback; smolder_shell: 1.6 s
    G.game.progress.notches = 6;
    G.game.giveItem('sigil:steadfast', { silent: true }); G.game.equip('steadfast');
    G.game.giveItem('sigil:smolder_shell', { silent: true }); G.game.equip('smolder_shell');
    H.drive(80, () => ({}), () => H.p().invuln <= 0);
    G.Combat.hurtPlayer(1, { x: H.cx() + 20, y: 0 });
    const inv2 = H.p().invuln;
    H.drive(10);
    const vx2 = H.m().vx;
    return { ok: ok1 && !ok2 && ok3 && hs >= 0.11 && Math.abs(inv - 1) < 1e-6 && knockVx < 0 && Math.abs(inv2 - 1.6) < 1e-6 && vx2 === 0 && H.pr().health === 2,
      detail: 'hits ' + ok1 + '/' + ok2 + '/' + ok3 + ' knockVx ' + knockVx + ' inv ' + inv.toFixed(2) + '/' + inv2.toFixed(2) + ' hp ' + H.pr().health };
  `],
  ['hurt: thorned_wax burst damages nearby enemies', `
    H.reset(); H.tp('dev_01', 40, 15);
    G.game.giveItem('sigil:thorned_wax', { silent: true }); G.game.equip('thorned_wax');
    const near = G.debug.spawn({ type: 'ptest_dummy', x: H.cx() + 70, y: H.feet() - 40 });
    const far = G.debug.spawn({ type: 'ptest_dummy', x: H.cx() + 200, y: H.feet() - 40 });
    G.Combat.hurtPlayer(1, near);
    return { ok: near.hits.length === 1 && near.hits[0].damage === 12 && near.hits[0].kind === 'thorns' && far.hits.length === 0, detail: 'near ' + near.hits.length + ' far ' + far.hits.length };
  `],
  ['hazard: spikes → 1 damage, fade, respawn at last safe ground', `
    H.reset(); H.tp('dev_02', 8, 15);
    H.drive(20);
    const safe = { x: H.m().lastSafe.x, y: H.m().lastSafe.y };
    let hz = false, ls = null;
    H.drive(120, () => ({ right: true }), (m) => { if (m.hazard) { hz = true; ls = { x: m.lastSafe.x, y: m.lastSafe.y }; } return hz; });
    H.waitPlay(120);
    H.drive(5);
    const back = Math.abs(H.m().x - ls.x) < 1 && Math.abs(H.m().y - ls.y) < 1 && H.m().onGround && ls.x > safe.x;
    return { ok: hz && back && H.pr().health === 4 && H.p().invuln > 0 && G.game.mode === 'play', detail: 'hazard ' + hz + ' back ' + back + ' hp ' + H.pr().health + ' invuln ' + H.p().invuln.toFixed(2) };
  `],
  ['hazard: water without oilcloak → splash + respawn', `
    H.reset(); H.tp('dev_water', 26, 15);
    let hz = null;
    H.drive(160, () => ({ right: true }), (m) => { if (m.hazard) hz = m.hazard; return !!hz; });
    H.waitPlay(120);
    return { ok: hz === 'water' && H.pr().health === 4 && !H.m().hazard && H.m().onGround, detail: 'hazard ' + hz + ' hp ' + H.pr().health };
  `],
  ['death: melt → respawn with full health, transient state reset', `
    H.reset(); H.tp('dev_02', 30, 15);
    G.game.progress.health = 1;
    G.Combat.hurtPlayer(1, { x: H.cx() + 10, y: H.feet() - 10 });
    const mode = G.game.mode, dying = H.p().dying;
    H.drive(20);
    const st = G.PlayerDraw.poseFrom(H.p()).state;
    H.drive(400, () => ({}), () => G.game.mode === 'play' && G.game.sysFadeAlpha < 0.01);
    const p = H.p();
    return { ok: mode === 'dead' && dying && st === 'dead' && G.game.mode === 'play' && !p.dying && H.pr().health === G.game.maxHealth() && p.invuln === 0 && !p.slash && !p.kindle,
      detail: 'mode ' + mode + ' state ' + st + ' room ' + G.game.room.id };
  `],
  ['interact: prompt above the nearest interactable; Up interacts', `
    H.reset(); H.tp('dev_01', 40, 15);
    const prompts = [];
    const hadUI = !!G.UI;
    if (!G.UI) G.UI = {};
    const orig = G.UI.prompt;
    G.UI.prompt = (x, y, text) => prompts.push({ x, y, text });
    const s = G.debug.spawn({ type: 'ptest_sign', x: H.cx() + 10, y: H.feet() - 40 });
    H.drive(2);
    const shown = prompts.length > 0 && prompts[prompts.length - 1].text === 'Read' && Math.abs(prompts[prompts.length - 1].x - s.cx) < 1;
    H.drive(1, () => ({ up: true }));
    const used = s.used;
    H.drive(1, () => ({ up: true }));
    const once = s.used;
    // not while airborne
    H.drive(4, () => ({ jump: true }));
    const before = s.used;
    H.drive(1, () => ({ up: true }));
    const air = s.used === before;
    if (hadUI) G.UI.prompt = orig; else delete G.UI;
    return { ok: shown && used === 1 && once === 1 && air && s.by === H.p(), detail: 'prompts ' + prompts.length + ' used ' + used };
  `],
  ['rest: sitting at a sconce, any movement stands up', `
    H.reset(); H.tp('dev_01', 30, 15);
    G.game.progress.health = 2;
    G.game.rest({ room: G.game.room, persistId: 'dev_sconce', cx: H.cx() + 4 });
    const sat = H.p().resting && G.PlayerDraw.poseFrom(H.p()).state === 'rest';
    H.drive(30, () => ({}));
    const still = H.p().resting && Math.abs(H.m().vx) < 1;
    H.drive(1, () => ({ right: true }));
    H.drive(20, () => ({ right: true }));
    return { ok: sat && still && !H.p().resting && H.m().vx === 330 && H.pr().health === 5, detail: 'sat ' + sat + ' resting ' + H.p().resting + ' vx ' + H.m().vx };
  `],
  ['wake: playWake locks, ignites, returns control', `
    H.reset(); H.tp('dev_01', 12, 15);
    let done = 0;
    H.p().playWake(() => done++);
    const locked = G.game.isLocked();
    H.drive(60, () => ({ right: true }));
    const x0 = H.m().x;
    const lying = G.PlayerDraw.poseFrom(H.p()).state === 'wake';
    H.drive(240, () => ({}), () => done > 0);
    const free = !G.game.isLocked();
    H.drive(10, () => ({ right: true }));
    return { ok: locked && lying && done === 1 && free && H.m().vx === 330, detail: 'locked ' + locked + ' done ' + done + ' moved ' + (H.m().x - x0).toFixed(0) };
  `],
  ['pose: playPose("ability") locks for its duration', `
    H.reset(); H.tp('dev_01', 12, 15);
    let done = false;
    H.p().playPose('ability', 1, () => { done = true; });
    const st = G.PlayerDraw.poseFrom(H.p()).state;
    H.drive(30, () => ({ right: true }));
    const moved = Math.abs(H.m().vx) > 0;
    H.drive(40);
    return { ok: st === 'pose' && !moved && done && !G.game.isLocked(), detail: 'state ' + st + ' done ' + done };
  `],
  ['flare_trail: dash leaves burning segments that tick 8 dmg', `
    H.reset(); G.debug.give('dash'); H.tp('dev_01', 30, 15);
    G.game.giveItem('sigil:flare_trail', { silent: true }); G.game.equip('flare_trail');
    const d = G.debug.spawn({ type: 'ptest_dummy', x: H.cx() + 60, y: H.feet() - 40 });
    H.drive(1, () => ({ dash: true }));
    H.drive(12);
    const segs = G.game.room.entities.filter((e) => e.type === 'flare_trail').length;
    H.drive(40);
    const dmg = d.hits.filter((h) => h.kind === 'trail');
    H.drive(40);
    const left = G.game.room.entities.filter((e) => e.type === 'flare_trail').length;
    return { ok: segs >= 3 && dmg.length >= 2 && dmg.length <= 3 && dmg[0].damage === 8 && left === 0, detail: 'segments ' + segs + ' trail hits ' + dmg.length + ' left ' + left };
  `],
  ['ember_thirst: +6 ember per nail hit (17 total)', `
    H.reset(); H.tp('dev_01', 12, 15);
    G.game.giveItem('sigil:ember_thirst', { silent: true }); G.game.equip('ember_thirst');
    G.debug.spawn({ type: 'ptest_dummy', x: H.m().x + H.m().w + 20, y: H.feet() - 40 });
    H.drive(1, () => ({ attack: true })); H.drive(5);
    return { ok: H.pr().ember === 17, detail: 'ember ' + H.pr().ember };
  `],
  ['breakables/levers via G.Combat: B wall cracks on 3 slashes', `
    H.reset(); H.tp('dev_below', 61, 15);
    H.drive(2, () => ({ left: true }));
    const comp = G.game.room.componentAt(58, 5);
    for (let k = 0; k < 3; k++) { H.drive(1, () => ({ attack: true })); H.drive(26); }
    const lever = G.game.room.entities.find((e) => e.type === 'lever');
    let leverHit = 'n/a';
    if (lever) {
      G.debug.teleport('dev_below', 43, 15); H.drive(2, () => ({ right: true })); H.drive(1, () => ({ attack: true })); H.drive(30);
      leverHit = String(!!G.game.getFlag('lever:' + (lever.persistId || 'dev_lv1')));
    }
    let geode = 'n/a';
    if (G.Entity.isRegistered('geode')) {
      H.tp('dev_01', 40, 15);
      const gd = G.debug.spawn({ type: 'geode', id: 'ptest_geo', amount: 40, x: H.m().x + H.m().w + 16, y: H.feet() - 40 });
      const c0 = G.game.progress.cinders;
      for (let k = 0; k < 6 && !gd.broken; k++) { H.drive(1, () => ({ attack: true })); H.drive(26); }
      H.drive(120);
      geode = (gd.broken ? 'broken' : 'hits ' + gd.hits) + ', cinders +' + (G.game.progress.cinders - c0);
      if (!gd.broken) return { ok: false, detail: 'geode ' + geode };
    }
    return { ok: comp.broken && leverHit !== 'false', detail: 'wall broken ' + comp.broken + ' lever ' + leverHit + ' geode ' + geode };
  `],
  ['ui: no gameplay while locked (dialogue lock)', `
    H.reset(); H.tp('dev_01', 12, 15);
    G.game.lockPlayer('dialogue');
    const d = G.debug.spawn({ type: 'ptest_dummy', x: H.m().x + H.m().w + 20, y: H.feet() - 40 });
    H.drive(10, (i) => ({ right: true, attack: i === 2, jump: i === 3 }));
    const moved = H.m().vx !== 0 || !H.m().onGround;
    G.game.unlockPlayer('dialogue');
    H.drive(5);
    return { ok: !moved && d.hits.length === 0, detail: 'moved ' + moved + ' hits ' + d.hits.length };
  `],
  ['room transition keeps the player sane (E exit)', `
    H.reset(); H.tp('dev_01', 77, 15);
    H.drive(120, () => ({ right: true }), () => G.game.room.id === 'dev_02');
    H.waitPlay(60); H.drive(10, () => ({ right: true }));
    return { ok: G.game.room.id === 'dev_02' && H.p().room === G.game.room && H.m().onGround && G.debug.errors.length === 0, detail: G.game.room.id };
  `],
];

// ------------------------------------------------------------------------------------------ contact sheet
const SHEET = `
(async () => {
  const P = G.PlayerDraw;
  const SC = __SCALE__, CW = 150, CHh = 132, COLS = 8;
  const t0 = 1.15;
  const make = (setup) => {
    const p = new G.Player({ type: 'player' });
    p.room = null;
    const m = p.motor;
    m.onGround = true; m.vx = 0; m.vy = 0;
    setup(p, m);
    return p;
  };
  const cells = [
    ['idle', (p, m) => {}],
    ['idle (blink)', (p, m) => { p.gfx = null; P.ensure(p).blinkSeed = 7; p._blinkT = true; }],
    ['run 1', (p, m) => { m.vx = 330; p.runPhase = 0.6; }],
    ['run 2', (p, m) => { m.vx = 330; p.runPhase = 2.2; }],
    ['jump rise', (p, m) => { m.onGround = false; m.vy = -620; }],
    ['apex', (p, m) => { m.onGround = false; m.vy = 0; }],
    ['fall', (p, m) => { m.onGround = false; m.vy = 800; m.vx = 120; }],
    ['land squash', (p, m) => { p._sq = 0.72; }],
    ['dash', (p, m) => { m.dashTime = 0.1; m.dashDir = 1; m.vx = 750; p._after = true; }],
    ['wall grip', (p, m) => { m.onGround = false; m.wall = -1; m.vy = 160; }],
    ['double jump', (p, m) => { m.onGround = false; m.vy = -500; p.djumpT = 0.24; }],
    ['swim', (p, m) => { m.onGround = false; m.swimming = true; m.inWater = true; m.surfaceY = 600 - 22; p._water = true; }],
    ['plunge', (p, m) => { m.onGround = false; m.plunging = true; m.vy = 1400; }],
    ['slash side A', (p, m) => { p.slash = { dir: 'side', t: 0.05, facing: 1, alt: 0 }; }],
    ['slash side B', (p, m) => { p.slash = { dir: 'side', t: 0.05, facing: 1, alt: 1 }; }],
    ['slash up', (p, m) => { p.slash = { dir: 'up', t: 0.05, facing: 1, alt: 0 }; }],
    ['slash down', (p, m) => { m.onGround = false; m.vy = 200; p.slash = { dir: 'down', t: 0.05, facing: 1, alt: 0 }; }],
    ['cast', (p, m) => { p.castT = 0.2; }],
    ['kindle', (p, m) => { p.kindle = { t: 0.7, dur: 0.9 }; }],
    ['hurt (flash)', (p, m) => { p.hurtT = 0.26; p.flashT = 0.09; }],
    ['i-frames', (p, m) => { p.flickerT = 0.6; }],
    ['death 0.15s', (p, m) => { p.dying = true; p.deathT = 0.15; }],
    ['death 0.6s', (p, m) => { p.dying = true; p.deathT = 0.6; }],
    ['death 1.3s', (p, m) => { p.dying = true; p.deathT = 1.3; }],
    ['rest (seated)', (p, m) => { p.resting = true; }],
    ['wake: lying', (p, m) => { p.cine = { kind: 'wake', t: 0.9, dur: 3.4, done: [] }; }],
    ['wake: ignite', (p, m) => { p.cine = { kind: 'wake', t: 1.5, dur: 3.4, done: [] }; }],
    ['wake: rising', (p, m) => { p.cine = { kind: 'wake', t: 2.15, dur: 3.4, done: [] }; }],
    ['ability pose', (p, m) => { p.cine = { kind: 'pose', name: 'ability', t: 0.8, dur: 1.6, done: [] }; }],
    ['facing left', (p, m) => { p.facing = -1; m.facing = -1; }],
    ['ember bolt', null],
    ['flare trail', null],
  ];
  const rows = Math.ceil(cells.length / COLS);
  const bgs = __BGS__;
  const W = CW * COLS, H = CHh * rows;
  const { canvas, ctx } = G.U.makeCanvas(W * SC, H * SC * bgs.length);
  for (let bi = 0; bi < bgs.length; bi++) {
    const bg = bgs[bi];
    for (let i = 0; i < cells.length; i++) {
      const [name, setup] = cells[i];
      const cx = (i % COLS) * CW, cy = Math.floor(i / COLS) * CHh + bi * H;
      ctx.setTransform(SC, 0, 0, SC, 0, 0);
      const gr = ctx.createLinearGradient(0, cy, 0, cy + CHh);
      gr.addColorStop(0, bg[0]); gr.addColorStop(1, bg[1]);
      ctx.fillStyle = gr; ctx.fillRect(cx, cy, CW, CHh);
      ctx.strokeStyle = 'rgba(128,128,128,0.35)'; ctx.lineWidth = 0.5; ctx.strokeRect(cx + 0.25, cy + 0.25, CW - 0.5, CHh - 0.5);
      const fx = cx + CW / 2, fy = cy + CHh - 26;
      ctx.fillStyle = bg[2]; ctx.fillRect(cx, fy, CW, 26);
      ctx.fillStyle = bg[3]; ctx.font = '9px monospace'; ctx.fillText(name, cx + 4, cy + 11);
      ctx.save();
      ctx.beginPath(); ctx.rect(cx, cy, CW, CHh); ctx.clip();
      if (!setup) {
        if (name === 'ember bolt') {
          const b = new G.PlayerBolt({ type: 'player_bolt', dir: 1, damage: 15 });
          b.x = fx - 20; b.y = fy - 60; b.age = 0.2;
          for (let k = 7; k >= 0; k--) b.trail.push(b.x + 20 - k * 14, b.y + 14);
          P.drawBolt(ctx, b, t0);
        } else {
          for (let k = 0; k < 3; k++) {
            const s = new G.FlareTrail({ type: 'flare_trail' });
            s.x = fx - 70 + k * 46; s.y = fy - s.h; s.life = 0.6 - k * 0.15;
            P.drawTrail(ctx, s, t0 + k);
          }
        }
        ctx.restore();
        continue;
      }
      const p = make(setup);
      const m = p.motor;
      const tile = (fy - 54);
      m.x = p.x = fx - 13; m.y = p.y = fy - 54;
      if (m.wall) { ctx.fillStyle = bg[2]; ctx.fillRect(fx - 13 - 30, cy, 30, CHh); }
      if (p._water) { m.y = p.y = fy - 54 - 4; }
      const g = P.ensure(p);
      G.game.t = t0;
      for (let k = 0; k < 90; k++) P.update(p, 1 / 60);
      if (p._sq) { g.sq = p._sq; g.sqV = 0; }
      if (p._after) { for (let k = 1; k <= 3; k++) g.after.push({ x: fx - 26 * k, y: fy, life: 0.2 - k * 0.04, max: 0.2, img: null }); }
      let t = t0;
      if (p._blinkT) { for (let tt = 0; tt < 8; tt += 0.005) { if (G.Art.char.blinkAt(tt, 7, 3.2) > 0.95) { t = tt; break; } } }
      if (p.flickerT) t = 1 / 36;
      G.game.t = t;
      p.draw(ctx, t);
      if (p._water) {
        ctx.globalAlpha = 0.55; ctx.fillStyle = '#3a6a8a'; ctx.fillRect(cx, m.surfaceY, CW, fy + 26 - m.surfaceY);
        ctx.globalAlpha = 0.9; ctx.fillStyle = '#9fd8ff'; ctx.fillRect(cx, m.surfaceY, CW, 1.5); ctx.globalAlpha = 1;
        P.ensure(p).ripples.length = 0;
      }
      ctx.restore();
    }
  }
  return canvas.toDataURL('image/png');
})()
`;

async function renderSheet(page, file, scale, bgs) {
  const src = SHEET.replace('__SCALE__', String(scale)).replace('__BGS__', JSON.stringify(bgs));
  const url = await page.evaluate(src);
  const buf = Buffer.from(url.split(',')[1], 'base64');
  fs.writeFileSync(path.join(OUT, file), buf);
  console.log('sheet: ' + path.relative(ROOT, path.join(OUT, file)));
}

(async () => {
  fs.mkdirSync(OUT, { recursive: true });
  const { page, errors } = await openGame({ query: 'test=1&paused=1&testrooms=1&mute=1&seed=7' });
  await page.evaluate(HELPERS);
  let unexpected = [];
  if (!onlySheet) {
    for (const [name, body] of CHECKS) {
      if (!wanted(name)) continue;
      const before = errors.length;
      let r;
      try { r = await page.evaluate(`(() => { ${body} })()`); } catch (e) { r = { ok: false, detail: 'threw: ' + e.message.split('\n')[0] }; }
      const errs = errors.slice(before).filter((e) => !/ignored-/.test(e));
      if (errs.length) { unexpected = unexpected.concat(errs); report(name, false, (r && r.detail) + ' | console: ' + errs[0]); }
      else report(name, !!(r && r.ok), r && r.detail);
    }
  }
  if (onlySheet || !filters.length) {
    const DARK = ['#1d2230', '#0b0d13', '#2a2620', '#9aa4b8'];
    const LIGHT = ['#d9d3c4', '#b9b2a2', '#857a68', '#2a2620'];
    await renderSheet(page, 'poses.png', 2, [DARK, LIGHT]);
    await renderSheet(page, 'poses_1x.png', 1, [DARK, LIGHT, ['#5a6476', '#3c4352', '#262a33', '#e0e0e0']]);
    const errs = errors.filter((e) => !unexpected.includes(e));
    if (errs.length) { report('contact sheet renders without errors', false, errs[0]); }
  }
  await closeAll();
  const failed = results.filter((r) => !r.ok);
  console.log(failed.length ? `\n${failed.length} FAILED of ${results.length}` : `\nALL PASS (${results.length} checks)`);
  process.exit(failed.length ? 1 : 0);
})().catch(async (e) => { console.error(e); await closeAll(); process.exit(3); });
