#!/usr/bin/env node
// tools/interact_selftest.js — headless checks for the interact module (src/entities/interactables.js,
// npcs.js, wisp.js) in the dev rooms, plus contact-sheet screenshots in test-output/interact/.
//
//   node tools/interact_selftest.js            # all checks + screenshots
//   node tools/interact_selftest.js lever      # only checks whose name contains "lever"
//   node tools/interact_selftest.js --noshots  # skip screenshots
//
// UI calls are replaced by spies (recorded, callbacks invoked immediately) so the logic is tested in
// isolation; one extra check runs against the real G.UI if it is present. Exit code 1 on any failure.
'use strict';
const path = require('path');
const fs = require('fs');
const { openGame, closeAll, ROOT } = require('./lib/browser');

const OUT = path.join(ROOT, 'test-output', 'interact');
const args = process.argv.slice(2);
const filter = args.find((a) => !a.startsWith('--')) || '';
const noShots = args.includes('--noshots');

// Console errors that belong to this module (others are reported as foreign warnings, not failures).
const MINE = /interactables\.js|npcs\.js|wisp\.js|\b(sconce|lanternway|lore|shrine|pickup|geode|lever|gate|arena_gate|sealdoor|cinder|npc|wisp|event|decor|light|respawn|start)\b/i;
const EXPECTED = [/unknown event script "no_such_script"/];

// ---------------------------------------------------------------------------------------------------
// Page-side harness (evaluated once in the page)
const HARNESS = `
window.IT = (function () {
  const calls = [];
  const SPIED = { dialogue: (o) => o && o.onDone, lore: (id, cb) => cb, sparkMemory: (id, cb) => cb, abilityGet: (id, cb) => cb,
    itemGet: (s, cb) => cb, openShop: () => null, openLanternway: () => null, openInventory: () => null, toast: () => null };
  const real = {};
  let spying = false;
  function spy() {
    if (!G.UI) G.UI = {};
    if (spying) return;
    for (const name of Object.keys(SPIED)) {
      real[name] = G.UI[name];
      G.UI[name] = function (...a) {
        calls.push({ name, args: a.map((x) => (typeof x === 'function' ? '<fn>' : x && typeof x === 'object' ? Object.assign({}, x, { onDone: undefined }) : x)) });
        const cb = SPIED[name](...a);
        if (typeof cb === 'function') cb();
      };
    }
    spying = true;
  }
  function unspy() { if (!spying) return; for (const k of Object.keys(real)) G.UI[k] = real[k]; spying = false; }
  function fresh(room, tx, ty) {
    unspy();
    if (G.UI && G.UI.closeAll) G.UI.closeAll();
    G.game.newGame(0);
    spy();
    calls.length = 0;
    G.game.clearLocks();
    if (room) G.debug.teleport(room, tx, ty);
    clearEnemies();
    G.debug.step(4);
    return G.game.player;
  }
  // dev rooms contain regular enemies; remove them so they don't interfere with the checks
  function clearEnemies() { for (const e of G.game.room.entities) if (e.type === 'enemy') e.remove(); G.game.room.removeDead(); }
  function teleport(room, tx, ty) { G.debug.teleport(room, tx, ty); clearEnemies(); }
  const P = () => G.game.player;
  const pr = () => G.game.progress;
  function placeNear(e, dx) {
    const p = P(), m = p.motor;
    const x = e.x + e.w / 2 + (dx || 0) - m.w / 2, y = e.y + e.h - m.h;
    p.placeAt(x, y);
    G.debug.step(3);
  }
  function press(state, frames) {
    G.input.setVirtual(state); G.game.step(); G.input.clearVirtual();
    for (let i = 0; i < (frames || 1); i++) G.game.step();
  }
  function use(e, dx) { placeNear(e, dx); press({ up: true }, 2); }
  function spawn(props) { const e = G.debug.spawn(props); G.game.room.rebuildSolids(); return e; }
  function find(type, pred) { return G.game.room.find((e) => e.type === type && (!pred || pred(e))); }
  function hit(e, kind, n) {
    let ok = 0;
    for (let i = 0; i < (n || 1); i++) {
      const r = { x: e.x - 2, y: e.y - 2, w: e.w + 4, h: e.h + 4 };
      const res = G.Combat.attack({ owner: P(), team: 'player', rect: r, damage: 5, kind: kind || 'nail', dir: { x: 1, y: 0 }, id: 'it' + Math.random() });
      if (res.some((h) => h.target === e)) ok++;
      G.game.step();
    }
    return ok;
  }
  function called(name) { return calls.filter((c) => c.name === name); }
  function cinderSum() { return G.game.room.findType('cinder').reduce((s, c) => s + c.value, 0); }
  return { calls, spy, unspy, fresh, clearEnemies, teleport, P, pr, placeNear, press, use, spawn, find, hit, called, cinderSum, real };
})();
true;
`;

// ---------------------------------------------------------------------------------------------------
// Checks: [name, async (page) => {ok, detail}] — each body runs in the page and returns {ok, detail}.
const CHECKS = [
  ['types registered', `
    const types = ['start','respawn','sconce','lanternway','lore','npc','shrine','pickup','geode','lever','gate','arena_gate','sealdoor','light','decor','event','cinder','wisp'];
    const missing = types.filter((t) => !G.Entity.isRegistered(t));
    return { ok: !missing.length && typeof G.dropCinders === 'function' && !!G.Events, detail: missing.length ? 'missing ' + missing : 'all 18 types + G.dropCinders + G.Events' };`],

  ['sconce: rest heals, saves, sets respawn, lights; Up opens sigils; stand up', `
    IT.fresh('dev_01', 10, 15);
    const s = IT.find('sconce');
    let saves = 0; const on = () => saves++; G.events.on('save', on);
    IT.pr().health = 2;
    const litBefore = s.lit;
    IT.use(s);
    G.events.off('save', on);
    const p = IT.P(), pr = IT.pr();
    const a = pr.health === G.game.maxHealth(), b = pr.sconce && pr.sconce.room === 'dev_01' && pr.sconce.id === 'dev_sconce';
    const c = s.lit && !litBefore && G.game.getFlag('sconce:dev_sconce') === true, d = p.resting === true, e = saves > 0;
    const toastLit = IT.called('toast').some((t) => /lit/i.test(t.args[0]));
    IT.calls.length = 0;
    IT.press({ up: true }, 2);
    const inv = IT.called('openInventory');
    const f = inv.length === 1 && inv[0].args[0] && inv[0].args[0].atSconce === true;
    IT.press({ right: true }, 20);
    const g = !p.resting;
    return { ok: a && b && c && d && e && f && g && toastLit, detail: JSON.stringify({ heal: a, respawn: b, lit: c, toastLit, seated: d, saved: e, sigils: f, stoodUp: g }) };`],

  ['sconce: respawn after death seats the player at the rested sconce', `
    IT.fresh('dev_01', 10, 15);
    const s = IT.find('sconce');
    IT.use(s);
    IT.press({ right: true }, 10);
    G.debug.teleport('dev_02', 5, 15);
    G.debug.step(5);
    IT.pr().health = 1;
    G.game.playerDied();
    for (let i = 0; i < 300 && G.game.mode !== 'play'; i++) G.game.step();
    G.debug.step(10);
    const p = IT.P();
    const s2 = IT.find('sconce');
    const near = s2 && Math.abs((p.x + p.w / 2) - s2.cx) < 70;
    return { ok: G.game.room.id === 'dev_01' && near && p.resting === true, detail: JSON.stringify({ room: G.game.room.id, near, resting: p.resting }) };`],

  ['lanternway: first use lights (progress.lanterns), then Travel opens the menu', `
    IT.fresh('dev_below', 4, 15);
    const lw = IT.spawn({ type: 'lanternway', id: 'guttered', tx: 8, ty: 15 });
    const p0 = lw.promptText;
    IT.use(lw);
    const lit = IT.pr().lanterns.guttered === true && lw.lit;
    const p1 = lw.promptText;
    IT.use(lw);
    const menu = IT.called('openLanternway');
    // persistence: a new instance starts lit
    const lw2 = IT.spawn({ type: 'lanternway', id: 'guttered', tx: 12, ty: 15 });
    return { ok: lit && menu.length === 1 && menu[0].args[0] === 'guttered' && lw2.lit && p0 !== p1, detail: JSON.stringify({ lit, prompts: [p0, p1], menu: menu.map((c) => c.args[0]), persists: lw2.lit }) };`],

  ['lore: Read opens G.UI.lore(id)', `
    IT.fresh('dev_01', 10, 15);
    const l = IT.find('lore');
    IT.use(l);
    const c = IT.called('lore');
    return { ok: c.length === 1 && c[0].args[0] === 'lore_sh_1' && G.game.getFlag('lore:lore_dev_1') === true, detail: JSON.stringify(c.map((x) => x.args[0])) };`],

  ['npc thrum: condition selection, once, give + setFlag', `
    IT.fresh('dev_01', 10, 15);
    const n = IT.find('npc');
    const said = () => { const d = IT.called('dialogue'); return d.length ? d[d.length - 1].args[0] : null; };
    IT.use(n);
    const first = said();
    const t1 = G.game.getFlag('talked:thrum:meet') === true;
    IT.use(n);
    const second = G.NPCs.pickTalk('thrum', 'thrum');
    IT.pr().seals = ['bell', 'kiln', 'wing'];
    const notchesBefore = IT.pr().notches;
    const pick = G.NPCs.pickTalk('thrum', 'thrum').id;
    IT.use(n);
    const gave = IT.pr().notches === notchesBefore + 1 && G.game.getFlag('thrum_notch') === true && IT.called('itemGet').some((c) => c.args[0] === 'notch');
    const after = G.NPCs.pickTalk('thrum', 'thrum').id;
    const meetLines = G.Text.npcs.thrum.talks[0].lines;
    return { ok: first && first.name === 'Old Thrum' && first.lines[0] === meetLines[0] && t1 && second.id !== 'meet' && pick === 'notch' && gave && after !== 'notch',
      detail: JSON.stringify({ firstName: first && first.name, metFlag: t1, second: second.id, pickWithSeals: pick, gave, after }) };`],

  ['npc pell: dialogue then shop; wren stage 4 gives long_brand; sable stage 2 presence', `
    IT.fresh('dev_below', 4, 15);
    const pell = IT.spawn({ type: 'npc', npc: 'pell', tx: 8, ty: 15 });
    IT.use(pell);
    const order = IT.calls.map((c) => c.name).filter((n) => n === 'dialogue' || n === 'openShop');
    const shop = IT.called('openShop');
    const wren = IT.spawn({ type: 'npc', npc: 'wren', stage: 4, tx: 14, ty: 15 });
    IT.use(wren);
    const sig = IT.pr().sigils.indexOf('long_brand') >= 0 && G.game.getFlag('wren_gift') === true && (G.game.getFlag('talked:wren_4:w4_gift') === true || G.game.getFlag('talked:wren_4:w4_gift_first') === true);
    const wrenKey = wren.textKey;
    const s0 = IT.spawn({ type: 'npc', npc: 'sable', stage: 2, tx: 20, ty: 15 });
    const absent = !s0 || s0.dead;
    G.game.defeatBoss('sable2');
    const s1 = IT.spawn({ type: 'npc', npc: 'sable', stage: 2, tx: 20, ty: 15 });
    const present = s1 && !s1.dead && s1.interactable;
    return { ok: order.join(',') === 'dialogue,openShop' && shop[0].args[0] === 'pell' && sig && wrenKey === 'wren_4' && absent && present,
      detail: JSON.stringify({ order, sig, wrenKey, sableAbsentBefore: absent, sablePresentAfter: present }) };`],

  ['npc sable stage 1: glimpse within 8 tiles, speaks, dissolves, flag persists', `
    IT.fresh('dev_below', 2, 15);
    const s = IT.spawn({ type: 'npc', npc: 'sable', stage: 1, tx: 30, ty: 15 });
    G.debug.step(20);
    const idle = s.mode === 'idle' && !s.dead;
    IT.P().placeAt(24 * 40, 16 * 40 - 54);
    for (let i = 0; i < 200 && !s.dead; i++) G.game.step();
    const spoke = IT.called('dialogue').some((d) => d.args[0].name === 'Sable');
    const flag = G.game.getFlag('sable_glimpse') === true;
    const again = IT.spawn({ type: 'npc', npc: 'sable', stage: 1, tx: 30, ty: 15 });
    return { ok: idle && spoke && s.dead && flag && (!again || again.dead), detail: JSON.stringify({ idle, spoke, gone: s.dead, flag, notBack: !again || again.dead }) };`],

  ['npc sable stage 1: no glimpse after she has yielded at the Sanctum gate (boss:sable2)', `
    IT.fresh('dev_below', 2, 15);
    G.game.defeatBoss('sable1'); G.game.defeatBoss('sable2');
    const s = IT.spawn({ type: 'npc', npc: 'sable', stage: 1, tx: 30, ty: 15 });
    const gone = !s || s.dead;
    return { ok: gone, detail: JSON.stringify({ gone }) };`],

  ['npc wren: only ever in one place (later stage met/seen or the gift hides earlier stages)', `
    IT.fresh('dev_below', 2, 15);
    const alive = (st) => { const e = IT.spawn({ type: 'npc', npc: 'wren', stage: st, tx: 40, ty: 15 }); const ok = !!e && !e.dead; if (e && !e.dead) e.remove(); G.game.room.removeDead(); return ok; };
    const base = [1, 2, 3, 4].map(alive).join('');
    G.game.setFlag('wren_met_3');
    const met3 = [1, 2, 3, 4].map(alive).join('');
    IT.fresh('dev_below', 2, 15);
    G.game.setFlag('wren_gift');
    const gift = [1, 2, 3, 4].map(alive).join('');
    IT.fresh('dev_below', 2, 15);
    const w2 = IT.spawn({ type: 'npc', npc: 'wren', stage: 2, tx: 30, ty: 15 });
    const notYet = !G.game.getFlag('wren_seen_2');
    IT.P().placeAt(26 * 40, 16 * 40 - 54);
    G.debug.step(5);
    const seen = G.game.getFlag('wren_seen_2') === true && !w2.dead;
    const seen2 = [1, 2].map(alive).join('');
    const want = { base: 'truetruetruetrue', met3: 'falsefalsetruetrue', gift: 'falsefalsefalsetrue', seen2: 'falsetrue' };
    const got = { base, met3, gift, seen2 };
    return { ok: Object.keys(want).every((k) => want[k] === got[k]) && notYet && seen, detail: JSON.stringify({ got, notYet, seen }) };`],

  ['wisp: first respawn after a death shows ui.wispHint once (flag hint:wisp)', `
    IT.fresh('dev_below', 10, 15);
    G.debug.step(5);
    const die = () => { G.game.playerDied(); for (let i = 0; i < 300 && G.game.mode !== 'play'; i++) G.game.step(); G.debug.step(5); };
    const hint = G.Text && G.Text.ui && G.Text.ui.wispHint;
    const toasts = () => IT.called("toast").map((c) => c.args[0]).join(" ").split(hint).length - 1;
    die();
    const first = toasts();
    const flag = G.game.getFlag('hint:wisp') === true;
    die();
    const second = toasts();
    return { ok: !!hint && first === 1 && flag && second === 1, detail: JSON.stringify({ hint: !!hint, first, flag, second }) };`],

  ['shrine: Take grants the ability (card, pose, unlock); dormant shrine wakes when requires passes', `
    IT.fresh('dev_01', 10, 15);
    const sh = IT.find('shrine');
    IT.use(sh);
    for (let i = 0; i < 120; i++) G.game.step();
    const got = G.game.hasAbility('dash') && IT.called('abilityGet').some((c) => c.args[0] === 'dash');
    const unlocked = !G.game.isLocked();
    const taken = sh.state === 'taken' && !sh.interactable;
    const d = IT.spawn({ type: 'shrine', ability: 'wings', requires: 'boss:effigy', tx: 33, ty: 15 });
    G.debug.step(20);
    const dormant = d.state === 'dormant' && !d.interactable;
    G.game.defeatBoss('effigy');
    G.debug.step(30);
    const woke = d.state === 'ready' && d.interactable;
    const again = IT.spawn({ type: 'shrine', ability: 'dash', tx: 36, ty: 15 });
    return { ok: got && unlocked && taken && dormant && woke && again.state === 'taken', detail: JSON.stringify({ got, unlocked, taken, dormant, woke, ownedStaysEmpty: again.state }) };`],

  ['pickups: every kind grants on touch and persists', `
    IT.fresh('dev_below', 4, 15);
    const pr = IT.pr();
    const kinds = [
      [{ item: 'heartwax' }, () => pr.heartShards === 1],
      [{ item: 'urn' }, () => pr.urns === 1],
      [{ item: 'kiln_glass' }, () => pr.kilnGlass === 1],
      [{ item: 'spark', id: 'spark_gw' }, () => pr.sparks.indexOf('spark_gw') >= 0 && IT.called('sparkMemory').length === 1],
      [{ item: 'notch' }, () => pr.notches === 4],
      [{ item: 'sigil', sigil: 'swift_brand' }, () => pr.sigils.indexOf('swift_brand') >= 0],
      [{ item: 'cinders', amount: 75 }, () => pr.cinders === 75],
      [{ item: 'seal', seal: 'bell' }, () => pr.seals.indexOf('bell') >= 0],
    ];
    const res = {};
    let all = true;
    kinds.forEach(([props, check], i) => {
      const id = props.id || ('dev_pk' + i);
      const e = IT.spawn(Object.assign({ type: 'pickup', id, tx: 8, ty: 15 }, props));
      IT.placeNear(e);
      G.debug.step(4);
      const ok = e.dead && check() && G.game.getFlag('item:' + id) === true;
      const again = IT.spawn(Object.assign({ type: 'pickup', id, tx: 8, ty: 15 }, props));
      const persisted = !again || again.dead;
      res[props.item] = ok && persisted;
      all = all && ok && persisted;
      IT.P().placeAt(2 * 40, 16 * 40 - 54); G.debug.step(2);
    });
    // requires: hidden until the condition passes
    const hid = IT.spawn({ type: 'pickup', id: 'dev_pk_req', item: 'heartwax', requires: 'flag:dev_reveal', tx: 8, ty: 15 });
    IT.placeNear(hid); G.debug.step(10);
    const stayed = !hid.dead && !hid.visible;
    G.game.setFlag('dev_reveal'); G.debug.step(30);
    const tookAfter = hid.dead && pr.heartShards === 2;
    res.requires = stayed && tookAfter;
    return { ok: all && stayed && tookAfter, detail: JSON.stringify(res) };`],

  ['geode: each hit drops cinders, breaks on the 4th, stays broken', `
    IT.fresh('dev_below', 3, 15);
    const g = IT.spawn({ type: 'geode', id: 'dev_geo1', amount: 60, tx: 10, ty: 15 });
    const sums = [];
    for (let i = 0; i < 4; i++) { IT.hit(g); sums.push(IT.cinderSum()); }
    const broke = g.broken && G.game.getFlag('geode:dev_geo1') === true && !g.hurtable;
    const fifth = IT.hit(g);
    const total = IT.cinderSum();
    const g2 = IT.spawn({ type: 'geode', id: 'dev_geo1', amount: 60, tx: 14, ty: 15 });
    const grew = sums[0] > 0 && sums[1] > sums[0] && sums[2] > sums[1] && sums[3] > sums[2];
    return { ok: grew && broke && fifth === 0 && total === 60 && g2.broken, detail: JSON.stringify({ sums, broke, fifthHitIgnored: fifth === 0, total, persisted: g2.broken }) };`],

  ['geode: partial hits persist across re-entry (no re-farming); total paid == amount', `
    IT.fresh('dev_below', 3, 15);
    const spawnG = () => IT.spawn({ type: 'geode', id: 'dev_geo2', amount: 45, tx: 10, ty: 15 });
    let g = spawnG();
    IT.hit(g, 'nail', 2);
    const s2 = IT.cinderSum();
    g.remove(); g = spawnG(); // a fresh instance == re-entering the room
    const resumed2 = g.hits === 2 && g.dropped === s2 && !g.broken;
    IT.hit(g);
    const s3 = IT.cinderSum();
    g.remove(); g = spawnG();
    const resumed3 = g.hits === 3 && g.dropped === s3 && !g.broken;
    IT.hit(g); // the 4th hit overall breaks it
    const total = IT.cinderSum();
    const cleared = G.game.getFlag('geodeHits:dev_geo2') === undefined && G.game.getFlag('geode:dev_geo2') === true;
    g.remove(); g = spawnG();
    const ok = resumed2 && resumed3 && g.broken && total === 45 && cleared && s2 > 0 && s3 > s2;
    return { ok, detail: JSON.stringify({ s2, s3, resumed2, resumed3, total, cleared, stillBroken: g.broken }) };`],

  ['lever opens gate; gate stops blocking; both persist', `
    IT.fresh('dev_below', 40, 15);
    const lv = IT.find('lever'), gt = IT.find('gate');
    const r = { x: gt.x + 4, y: gt.y + 4, w: gt.w - 8, h: gt.h - 8 };
    const blockedBefore = G.Physics.rectSolid(G.game.room, r.x, r.y, r.w, r.h) && gt.solid;
    // walking into it: the player stops at the gate
    IT.P().placeAt(gt.x - 120, gt.bottom - 54);
    IT.press({ right: true }, 1);
    G.input.setVirtual({ right: true }); for (let i = 0; i < 40; i++) G.game.step(); G.input.clearVirtual();
    const stopped = IT.P().x + IT.P().w <= gt.x + 1;
    const n = IT.hit(lv);
    const flag = G.game.getFlag('lever:dev_lv1') === true && lv.pulled;
    for (let i = 0; i < 70; i++) G.game.step();
    const open = !gt.solid && !G.Physics.rectSolid(G.game.room, r.x, r.y, r.w, r.h);
    G.input.setVirtual({ right: true }); for (let i = 0; i < 40; i++) G.game.step(); G.input.clearVirtual();
    const passed = IT.P().x > gt.x + gt.w;
    const second = IT.hit(lv);
    IT.teleport('dev_01', 10, 15); IT.teleport('dev_below', 40, 15);
    const lv2 = IT.find('lever'), gt2 = IT.find('gate');
    return { ok: blockedBefore && stopped && n === 1 && flag && open && passed && second === 0 && lv2.pulled && !gt2.solid,
      detail: JSON.stringify({ blockedBefore, stopped, hit: n, flag, open, passed, secondHitIgnored: second === 0, persists: lv2.pulled && !gt2.solid }) };`],

  ['horizontal grate (w:4 h:1): placement, carries the player, slides sideways open on its condition', `
    IT.fresh('dev_below', 3, 15);
    const gt = IT.spawn({ type: 'gate', id: 'dev_hgate', opens: 'lever:dev_hlv', tx: 4, ty: 9, w: 4, h: 1 });
    const placed = gt.horizontal && gt.x === 160 && gt.y === 360 && gt.w === 160 && gt.h === 40;
    IT.P().placeAt(gt.x + 60, gt.y - 200);
    for (let i = 0; i < 70; i++) G.game.step();
    const m = IT.P().motor;
    const standing = Math.abs(m.y + m.h - gt.y) < 1.5 && m.onGround !== false;
    G.game.setFlag('lever:dev_hlv');
    G.game.step();
    const opening = gt.opening && G.game.getFlag('gate:dev_hgate') === true;
    for (let i = 0; i < 5; i++) G.game.step();
    const sr = gt.getSolidRect();
    const slidesSideways = sr.w < gt.w && sr.x + sr.w === gt.x + gt.w && sr.h === gt.h;
    for (let i = 0; i < 90; i++) G.game.step();
    const open = gt.open && !gt.solid;
    const fell = m.y > gt.bottom;
    const v = IT.spawn({ type: 'gate', id: 'dev_vgate', opens: 'false', tx: 30, ty: 15 });
    const vertical = !v.horizontal && v.w === 40 && v.h === 160 && v.y === 640 - 160;
    return { ok: placed && standing && opening && slidesSideways && open && fell && vertical,
      detail: JSON.stringify({ placed, standing, opening, slidesSideways, open, fell, vertical }) };`],

  ['npc sable stage 2: absent before boss:sable2 even if its own requires passes', `
    IT.fresh('dev_below', 3, 15);
    G.game.setFlag('sable_test');
    const s0 = IT.spawn({ type: 'npc', npc: 'sable', stage: 2, requires: 'flag:sable_test', tx: 20, ty: 15 });
    const absent = !s0 || s0.dead;
    G.game.defeatBoss('sable2');
    const s1 = IT.spawn({ type: 'npc', npc: 'sable', stage: 2, requires: 'flag:sable_test', tx: 20, ty: 15 });
    const present = !!s1 && !s1.dead;
    const s2 = IT.spawn({ type: 'npc', npc: 'sable', stage: 2, requires: '!flag:sable_test', tx: 22, ty: 15 });
    const reqRespected = !s2 || s2.dead;
    return { ok: absent && present && reqRespected, detail: JSON.stringify({ absent, present, reqRespected }) };`],

  ['arena gates: close on arenaStart, open on arenaEnd / bossDefeated, ignore other rooms', `
    IT.fresh('dev_below', 3, 15);
    const a = IT.spawn({ type: 'arena_gate', id: 'dev_ag1', tx: 10, ty: 15, h: 4 });
    const b = IT.spawn({ type: 'arena_gate', id: 'dev_ag2', tx: 30, ty: 15, h: 4 });
    const openAtStart = !a.solid && !a.closed;
    G.events.emit('arenaStart', { room: 'some_other_room' });
    G.debug.step(30);
    const ignored = !a.closed;
    G.events.emit('arenaStart', { room: G.game.room });
    G.debug.step(30);
    const closed = a.closed && a.solid && a.q === 1 && G.Physics.rectSolid(G.game.room, a.x + 4, a.y + 4, a.w - 8, a.h - 8) && b.closed;
    G.events.emit('arenaEnd', { room: G.game.room.id });
    G.debug.step(60);
    const reopened = !a.solid && a.state === 'open';
    a.close(); G.debug.step(30);
    G.game.defeatBoss('effigy'); G.debug.step(60);
    const bossOpen = a.state === 'open';
    // player standing in the doorway is pushed into the arena side, not trapped
    IT.P().placeAt(a.x + 6, a.bottom - 54); G.debug.step(2);
    a.close(); G.debug.step(30);
    const p = IT.P();
    const notTrapped = !(p.x < a.x + a.w && p.x + p.w > a.x);
    return { ok: openAtStart && ignored && closed && reopened && bossOpen && notTrapped, detail: JSON.stringify({ openAtStart, ignored, closed, reopened, bossOpen, notTrapped }) };`],

  ['seal door: locked hint; opens with 3 seals on approach; persists', `
    IT.fresh('dev_below', 3, 15);
    const d = IT.spawn({ type: 'sealdoor', id: 'dev_door', tx: 10, ty: 15 });
    const solid = d.solid && G.Physics.rectSolid(G.game.room, d.x + 4, d.y + 4, d.w - 8, d.h - 8);
    IT.use(d, -60);
    const hint = IT.called('dialogue').length === 1 && d.state === 'locked';
    IT.P().placeAt(2 * 40, 16 * 40 - 54); G.debug.step(2);
    IT.pr().seals = ['bell', 'kiln', 'wing'];
    G.debug.step(30);
    const waits = d.state === 'locked';
    IT.P().placeAt(6 * 40, 16 * 40 - 54);
    for (let i = 0; i < 360; i++) G.game.step();
    const open = d.state === 'open' && !d.solid && !G.Physics.rectSolid(G.game.room, d.x + 4, d.y + 4, d.w - 8, d.h - 8);
    const flag = G.game.getFlag('door:dev_door') === true;
    const d2 = IT.spawn({ type: 'sealdoor', id: 'dev_door', tx: 30, ty: 15 });
    return { ok: solid && hint && waits && open && flag && !G.game.isLocked() && d2.state === 'open', detail: JSON.stringify({ solid, hint, waitsForApproach: waits, open, flag, unlocked: !G.game.isLocked(), persists: d2.state }) };`],

  ['cinders: denominations, bounce & settle, collect on touch; Cinder Lure attracts from <= 6 tiles', `
    IT.fresh('dev_below', 3, 15);
    const room = G.game.room;
    const list = G.dropCinders(room, 400, 560, 37);
    const vals = list.map((c) => c.value).sort((a, b) => b - a).join(',');
    for (let i = 0; i < 240; i++) G.game.step();
    const settled = list.every((c) => c.settled || c.dead);
    const onFloor = list.every((c) => c.dead || Math.abs(c.y + c.h - 640) < 2);
    // walk over them
    const before = IT.pr().cinders;
    let minX = Infinity, maxX = -Infinity;
    for (const c of list) { minX = Math.min(minX, c.x); maxX = Math.max(maxX, c.x + c.w); }
    for (let x = minX - 30; x <= maxX + 10; x += 12) { IT.P().placeAt(x, 640 - 54); G.game.step(); }
    const gotN = IT.pr().cinders - before, left = list.filter((c) => !c.dead).map((c) => [Math.round(c.x), Math.round(c.y)]);
    const got = gotN === 37 && !left.length;
    // lure off: chips 5 tiles away stay put
    IT.P().placeAt(4 * 40, 640 - 54); G.debug.step(2);
    const far = G.dropCinders(room, 4 * 40 + 4 * 40, 600, 10);
    for (let i = 0; i < 120; i++) G.game.step();
    const stayed = far.every((c) => !c.dead);
    // the drop scatter is random (Math.random), so a chip can bounce past 6 tiles: judge the chips by where they
    // actually settled (those inside the lure range must all come; the ones outside are checked below)
    const P0 = IT.P(), inRange = far.filter((c) => Math.hypot(P0.cx - c.cx, P0.cy - c.cy) < 6 * 40);
    const inValue = inRange.reduce((s, c) => s + c.value, 0);
    G.game.giveItem('sigil:cinder_lure', { silent: true });
    const eq = G.game.equip('cinder_lure');
    const c0 = IT.pr().cinders;
    for (let i = 0; i < 120; i++) G.game.step();
    const farLeft = inRange.filter((c) => !c.dead).map((c) => Math.round((c.cx - IT.P().cx) / 40 * 10) / 10);
    const lured = inRange.length >= far.length - 2 && !farLeft.length && IT.pr().cinders - c0 === inValue;
    // beyond 6 tiles: not attracted
    const farther = G.dropCinders(room, 4 * 40 + 11 * 40, 600, 5);
    for (let i = 0; i < 120; i++) G.game.step();
    const notLured = farther.every((c) => !c.dead && !c.lured);
    return { ok: vals === '25,5,5,1,1' && settled && onFloor && got && stayed && eq && lured && notLured,
      detail: JSON.stringify({ vals, settled, onFloor, collected: gotN, left, noLureStays: stayed, lureEquipped: eq, lured, inRange: inRange.length, farLeft, beyond6TilesIgnored: notLured }) };`],

  ['wisp: spawns where you died, drifts toward you, 3 hits return cinders and ember capacity', `
    IT.fresh('dev_below', 10, 15);
    IT.pr().cinders = 120;
    G.debug.step(5);
    G.game.playerDied();
    for (let i = 0; i < 300 && G.game.mode !== 'play'; i++) G.game.step();
    G.debug.step(5);
    const pr = IT.pr();
    const stored = pr.wisp && pr.wisp.room === 'dev_below' && pr.wisp.cinders === 120 && pr.cinders === 0 && G.game.emberMax() === 66;
    G.debug.god(true);
    IT.teleport('dev_below', 2, 15);
    G.debug.step(3);
    const w = IT.find('wisp');
    const spawned = !!w;
    const d0 = w ? Math.abs(w.cx - IT.P().cx) : 0;
    for (let i = 0; i < 90; i++) G.game.step();
    const d1 = w ? Math.abs(w.cx - IT.P().cx) : 0;
    const drifts = w && w.noticed && d1 < d0;
    const hits = w ? IT.hit(w, 'nail', 3) : 0;
    const reclaimed = w && w.dead && pr.wisp === null && pr.cinders === 120 && G.game.emberMax() === 99;
    IT.teleport('dev_01', 10, 15); IT.teleport('dev_below', 2, 15);
    const gone = !IT.find('wisp');
    G.debug.god(false);
    return { ok: stored && spawned && drifts && hits === 3 && reclaimed && gone, detail: JSON.stringify({ stored, spawned, drifts: !!drifts, d0: Math.round(d0), d1: Math.round(d1), hits, reclaimed, gone }) };`],

  ['wisp: contact damage and lunge telegraph', `
    IT.fresh('dev_below', 10, 15);
    IT.pr().wisp = { room: 'dev_below', x: 16 * 40, y: 14 * 40, cinders: 5 };
    IT.teleport('dev_01', 10, 15); IT.teleport('dev_below', 10, 15);
    const w = IT.find('wisp');
    let windup = false, lunged = false;
    const h0 = IT.pr().health;
    for (let i = 0; i < 400; i++) { G.game.step(); if (w.state === 'windup') windup = true; if (w.state === 'lunge') lunged = true; if (IT.pr().health < h0) break; }
    const hurt = IT.pr().health === h0 - 1;
    return { ok: !!w && windup && lunged && hurt, detail: JSON.stringify({ windup, lunged, hurt }) };`],

  ['event registry: init/update/draw dispatch, once flag, unknown script reported once', `
    IT.fresh('dev_below', 3, 15);
    G.Events.it_probe = { init(e) { e.data.n = 0; e.data.inited = true; }, update(e) { if (++e.data.n === 5) e.done(); }, draw(e) { e.data.drawn = true; } };
    const e = IT.spawn({ type: 'event', script: 'it_probe', id: 'dev_ev1', once: true, tx: 6, ty: 15 });
    G.debug.step(8);
    const ran = e.data.inited && e.data.n === 5 && e.dead && G.game.getFlag('event:dev_ev1') === true;
    const again = IT.spawn({ type: 'event', script: 'it_probe', id: 'dev_ev1', once: true, tx: 6, ty: 15 });
    const skipped = !again || again.dead;
    const before = G._errors.length;
    IT.spawn({ type: 'event', script: 'no_such_script', tx: 6, ty: 15 });
    IT.spawn({ type: 'event', script: 'no_such_script', tx: 7, ty: 15 });
    const reported = G._errors.slice(before).filter((m) => /no_such_script/.test(m)).length === 1;
    // built-in 'toast' script
    IT.calls.length = 0;
    const t = IT.spawn({ type: 'event', script: 'toast', text: 'Hello', id: 'dev_toast', tx: 10, ty: 15, w: 2, h: 3 });
    IT.P().placeAt(10 * 40, 16 * 40 - 54); G.debug.step(3);
    const toasted = IT.called('toast').some((c) => c.args[0] === 'Hello') && t.dead;
    return { ok: ran && skipped && reported && toasted, detail: JSON.stringify({ ran, skipped, reportedOnce: reported, toasted }) };`],

  ['light, decor, respawn, start: spawn, update and draw cleanly; respawn sets the hazard point', `
    IT.fresh('dev_below', 3, 15);
    const before = G._errors.length;
    const L = IT.spawn({ type: 'light', r: 4, color: '#ffc070', intensity: 0.8, flicker: true, flame: 'orange', tx: 6, ty: 12 });
    const D1 = IT.spawn({ type: 'decor', kind: 'brazier', layer: 'back', tx: 8, ty: 15, lit: true });
    const D2 = IT.spawn({ type: 'decor', kind: 'chain', layer: 'front', tx: 10, ty: 1 });
    const S = IT.spawn({ type: 'start', tx: 12, ty: 15 });
    const R = IT.spawn({ type: 'respawn', tx: 14, ty: 15 });
    G.debug.step(10);
    const zs = D1.z < -10 && D2.z > 10;
    IT.P().placeAt(14 * 40 + 7, 16 * 40 - 54); G.debug.step(2);
    const m = IT.P().motor;
    const rs = m.lastSafe && Math.abs(m.lastSafe.x - (R.cx - m.w / 2)) < 0.5 && Math.abs(m.lastSafe.y - (R.bottom - m.h)) < 0.5;
    const newErr = G._errors.slice(before);
    return { ok: !L.dead && !D1.dead && !D2.dead && !S.dead && zs && rs && !newErr.length, detail: JSON.stringify({ zLayers: zs, respawnHint: rs, errors: newErr }) };`],

  ['real UI integration (if G.UI is implemented): lore/dialogue/inventory open modal screens', `
    IT.fresh('dev_01', 10, 15);
    IT.unspy();
    if (!G.UI || !G.UI.lore || !G.UI.isBlocking) return { ok: true, detail: 'G.UI not present — skipped' };
    const res = {};
    const l = IT.find('lore');
    IT.use(l);
    res.lore = G.UI.isBlocking();
    if (G.UI.closeAll) G.UI.closeAll();
    G.game.step();
    const n = IT.find('npc');
    IT.use(n);
    res.dialogue = G.UI.isBlocking();
    if (G.UI.closeAll) G.UI.closeAll();
    G.debug.step(2);
    // finishing a talk without the callback is caught by the NPC safety net within ~1 s
    for (let i = 0; i < 80; i++) G.game.step();
    res.npcFree = !n.talking;
    const s = IT.find('sconce');
    IT.use(s);
    res.seated = IT.P().resting;
    IT.press({ up: true }, 2);
    res.inventory = G.UI.isBlocking();
    if (G.UI.closeAll) G.UI.closeAll();
    IT.spy();
    return { ok: res.lore && res.dialogue && res.npcFree && res.seated && res.inventory, detail: JSON.stringify(res) };`],
];

// ---------------------------------------------------------------------------------------------------
// Screenshots: in-game showcase rooms (with lighting) and zoomed art sheets.
async function screenshots(page) {
  const shots = [];
  // a showcase room per region, defined at runtime (dev room, never saved)
  const regions = ['guttered', 'nave', 'rime'];
  for (const region of regions) {
    await page.evaluate(({ region, idx }) => {
      const id = 'dev_ix_' + region;
      if (!G.World.getRoom(id)) {
        const cols = 96, rows = 18;
        const tiles = [];
        for (let r = 0; r < rows; r++) {
          let row = '';
          for (let c = 0; c < cols; c++) row += (r === 0 || r >= 16 || c === 0 || c === cols - 1) ? '#' : '.';
          tiles.push(row);
        }
        G.World.defineRoom({ id, region, dev: true, gx: 400 + idx * 96, gy: 1197, tiles, name: 'Interact showcase' });
      }
      IT.fresh(id, 2, 15);
      const pr = IT.pr();
      pr.seals = ['bell', 'kiln'];
      pr.lanterns.guttered = true;
      G.game.setFlag('sconce:ix_s2');
      const S = (p) => IT.spawn(p);
      S({ type: 'sconce', id: 'ix_s1', tx: 4, ty: 15 }); S({ type: 'sconce', id: 'ix_s2', tx: 8, ty: 15 });
      S({ type: 'lanternway', id: 'nave', tx: 12, ty: 15 }); S({ type: 'lanternway', id: 'guttered', tx: 16, ty: 15 });
      S({ type: 'lore', id: 'lore_gw_1', tx: 21, ty: 15 }); S({ type: 'shrine', ability: 'grip', tx: 25, ty: 15 });
      S({ type: 'geode', id: 'ix_g', amount: 50, tx: 29, ty: 15 }); S({ type: 'lever', id: 'ix_lv', tx: 32, ty: 15 });
      S({ type: 'gate', id: 'ix_gt', opens: 'lever:ix_lv', tx: 34, ty: 15, h: 4 });
      S({ type: 'arena_gate', id: 'ix_ag', tx: 36, ty: 15, h: 4 }).close(true);
      S({ type: 'gate', id: 'ix_hg', opens: 'false', tx: 13, ty: 9, w: 4, h: 1 });
      S({ type: 'sealdoor', id: 'ix_sd', tx: 40, ty: 15 });
      ['heartwax', 'urn', 'kiln_glass', 'spark', 'notch', 'sigil', 'cinders'].forEach((it, i) =>
        S({ type: 'pickup', id: 'ix_p' + i, item: it, sigil: 'heartwax', amount: 40, tx: 44 + i * 2, ty: 15 }));
      S({ type: 'npc', npc: 'thrum', tx: 59, ty: 15 }); S({ type: 'npc', npc: 'pell', tx: 62, ty: 15, flip: true });
      S({ type: 'npc', npc: 'quill', tx: 66, ty: 15 }); S({ type: 'npc', npc: 'bramm', tx: 70, ty: 15 });
      S({ type: 'npc', npc: 'wren', stage: 1, tx: 75, ty: 15 }); S({ type: 'npc', npc: 'wren', stage: 3, tx: 78, ty: 15 });
      S({ type: 'npc', npc: 'wren', stage: 4, tx: 81, ty: 15 }); S({ type: 'npc', npc: 'sable', stage: 2, preview: true, tx: 85, ty: 15 });
      S({ type: 'wisp', preview: true, x: 90 * 40, y: 13 * 40 });
      S({ type: 'light', r: 5, color: '#ffc070', intensity: 0.7, flicker: true, flame: 'orange', size: 12, tx: 92, ty: 10 });
      G.dropCinders(G.game.room, 31 * 40, 600, 40);
      IT.P().hidden = true;
      G.debug.step(90);
    }, { region, idx: regions.indexOf(region) });
    for (const [k, tx] of [['a', 16], ['b', 46], ['c', 78]]) {
      await page.evaluate((tx) => { IT.P().placeAt(tx * 40, 16 * 40 - 54); G.camera.snap(); G.debug.step(30); IT.P().hidden = true; if (G.UI && G.UI.clearOverlays) G.UI.clearOverlays(); G.debug.render(); }, tx);
      const file = path.join(OUT, `showcase_${region}_${k}.png`);
      await page.screenshot({ path: file });
      shots.push(file);
    }
  }
  // zoomed art sheets (entities drawn onto a 2× canvas without lighting)
  const sheet = await page.evaluate(() => {
    const items = [
      [{ type: 'sconce', id: 'zs1' }, 'sconce'], [{ type: 'sconce', id: 'zs2' }, 'sconce (lit)', (e) => { e.lit = true; }],
      [{ type: 'lanternway', id: 'zl' }, 'lanternway'], [{ type: 'lanternway', id: 'zl2' }, 'lanternway (lit)', (e) => { e.lit = true; }],
      [{ type: 'lore', id: 'lore_gw_2' }, 'lore', (e) => { e.near = 1; }], [{ type: 'shrine', ability: 'bolt' }, 'shrine'],
      [{ type: 'geode', id: 'zg' }, 'geode'], [{ type: 'lever', id: 'zlv' }, 'lever'], [{ type: 'gate', id: 'zgt', opens: 'false' }, 'gate'],
      [{ type: 'sealdoor', id: 'zsd' }, 'seal door'],
      [{ type: 'npc', npc: 'thrum' }, 'Thrum'], [{ type: 'npc', npc: 'pell' }, 'Pell'], [{ type: 'npc', npc: 'quill' }, 'Quill'],
      [{ type: 'npc', npc: 'bramm' }, 'Bramm'], [{ type: 'npc', npc: 'wren', stage: 2 }, 'Wren 2'], [{ type: 'npc', npc: 'wren', stage: 4 }, 'Wren 4'],
      [{ type: 'npc', npc: 'sable', stage: 2, preview: true }, 'Sable 2'], [{ type: 'wisp', preview: true }, 'Gutterwisp'],
      [{ type: 'npc', npc: 'wren', stage: 1 }, 'Wren 1'], [{ type: 'npc', npc: 'wren', stage: 3 }, 'Wren 3'],
      [{ type: 'npc', npc: 'sable', stage: 1, flag: 'sheet_never' }, 'Sable 1 (glimpse)'],
      [{ type: 'arena_gate', id: 'zag' }, 'arena gate (closed)', (e) => { e.close(true); }],
      [{ type: 'gate', id: 'zhg', opens: 'false', w: 3, h: 1 }, 'grate w3 h1 (horizontal)'],
      [{ type: 'pickup', id: 'zp1', item: 'heartwax' }, 'heartwax'], [{ type: 'pickup', id: 'zp2', item: 'urn' }, 'urn'],
      [{ type: 'pickup', id: 'zp3', item: 'kiln_glass' }, 'kiln glass'], [{ type: 'pickup', id: 'spark_gw', item: 'spark' }, 'spark'],
      [{ type: 'pickup', id: 'zp5', item: 'notch' }, 'notch'], [{ type: 'pickup', id: 'zp6', item: 'sigil', sigil: 'swift_brand' }, 'sigil'],
      [{ type: 'pickup', id: 'zp7', item: 'cinders', amount: 60 }, 'cinders pile'],
      [null, 'cinders 1 / 5 / 25', null, (ctx, fx, fy) => {
        [1, 5, 25].forEach((v, k) => {
          const c = G.Entity.create({ type: 'cinder', value: v });
          c.settled = true; c.rot = 0.4 + k; c.vrot = 0; c.t = 0.3 + k * 0.2;
          c.x = fx - 40 + k * 40 - c.w / 2; c.y = fy - c.h;
          ctx.save(); c.draw(ctx, c.t); ctx.restore();
        });
      }],
    ];
    const zoom = 2, cols = 6, cw = 150, ch = 262;
    const rows = Math.ceil(items.length / cols);
    const cv = document.createElement('canvas'); cv.width = cols * cw * zoom; cv.height = rows * ch * zoom;
    const ctx = cv.getContext('2d');
    const g = ctx.createLinearGradient(0, 0, 0, cv.height); g.addColorStop(0, '#20232c'); g.addColorStop(1, '#0c0d12');
    ctx.fillStyle = g; ctx.fillRect(0, 0, cv.width, cv.height);
    ctx.scale(zoom, zoom);
    const fake = Object.create(G.game.room); fake.regionId = 'guttered'; fake.id = 'sheet';
    const errs = [];
    items.forEach(([props, label, mod, custom], i) => {
      const c = i % cols, r = (i / cols) | 0, fx = c * cw + cw / 2, fy = r * ch + ch - 20;
      try {
        if (custom) { custom(ctx, fx, fy); ctx.fillStyle = '#8a92a0'; ctx.font = '10px sans-serif'; ctx.fillText(label, c * cw + 6, r * ch + 12); return; }
        const e = G.Entity.create(Object.assign({}, props));
        e.room = fake; if (e.init) e.init();
        e.x = fx - e.w / 2; e.y = fy - e.h; if (e.home) e.home = { x: e.x, y: e.y };
        if (mod) mod(e);
        for (let k = 0; k < 40; k++) { e.t = (e.t || 0) + 1 / 60; e.update(1 / 60); }
        e.x = fx - e.w / 2; e.y = fy - e.h;
        ctx.save(); e.draw(ctx, e.t); ctx.restore();
      } catch (err) { errs.push(label + ': ' + err.message); }
      ctx.fillStyle = '#8a92a0'; ctx.font = '10px sans-serif'; ctx.fillText(label, c * cw + 6, r * ch + 12);
    });
    return { url: cv.toDataURL('image/png'), errs };
  });
  const sheetFile = path.join(OUT, 'contact_sheet.png');
  fs.writeFileSync(sheetFile, Buffer.from(sheet.url.split(',')[1], 'base64'));
  shots.push(sheetFile);
  return { shots, errs: sheet.errs };
}

// ---------------------------------------------------------------------------------------------------
(async () => {
  fs.mkdirSync(OUT, { recursive: true });
  const { page, errors } = await openGame({ query: 'test=1&paused=1&testrooms=1&mute=1&seed=7' });
  await page.evaluate(HARNESS);
  let fails = 0, runs = 0;
  for (const [name, body] of CHECKS) {
    if (filter && name.indexOf(filter) < 0) continue;
    runs++;
    let r;
    try {
      r = await page.evaluate(`(() => { ${body} })()`);
    } catch (e) {
      r = { ok: false, detail: 'threw: ' + e.message.split('\n')[0] };
    }
    if (!r || !r.ok) fails++;
    console.log(`${r && r.ok ? 'PASS' : 'FAIL'}  ${name}\n      ${r ? r.detail : ''}`);
  }
  if (!noShots && !filter) {
    try {
      const s = await screenshots(page);
      console.log('screenshots:\n  ' + s.shots.map((f) => path.relative(ROOT, f)).join('\n  '));
      if (s.errs.length) { fails++; console.log('FAIL  contact sheet errors: ' + s.errs.join('; ')); }
    } catch (e) { fails++; console.log('FAIL  screenshots threw: ' + e.message); }
  }
  const mine = errors.filter((e) => MINE.test(e) && !EXPECTED.some((re) => re.test(e)));
  const foreign = errors.filter((e) => !MINE.test(e));
  if (foreign.length) console.log(`note: ${foreign.length} console error(s) from other modules (not counted):\n  ` + [...new Set(foreign.map((e) => e.split('\n')[0]))].slice(0, 8).join('\n  '));
  if (mine.length) { fails++; console.log(`FAIL  console errors from this module (${mine.length}):\n  ` + mine.slice(0, 12).map((e) => e.split('\n').slice(0, 3).join(' | ')).join('\n  ')); }
  console.log(fails ? `\n${fails} FAILURE(S) of ${runs} checks` : `\nALL PASS (${runs} checks)`);
  await closeAll();
  process.exit(fails ? 1 : 0);
})().catch(async (e) => { console.error(e); await closeAll(); process.exit(3); });
