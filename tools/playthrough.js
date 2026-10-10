#!/usr/bin/env node
// tools/playthrough.js — headless end-to-end run of the whole intended critical path in the REAL game (module:
// qa-playthrough). Proves at runtime that GUTTERLIGHT is completable from New Game to both endings.
//
//   node tools/playthrough.js [--from <step>] [--to <step>] [--list] [--shots] [--verbose] [--file dist/Gutterlight.html]
//
// How it plays
//   * The game runs in headless Chromium (paused=1&mute=1, real boot through the title unless resuming), driven
//     frame by frame with G.input.setVirtual + G.game.step.
//   * Movement: tools/lib/nav.js runs reach_core's macro search in Node from the player's ACTUAL motor state, the
//     room's live tiles and live solids (gates, doors) with the abilities owned, and returns the next input
//     program; the program is played in the browser (same deterministic motor) and the predicted end state is
//     compared with the real one; the bot re-plans after every macro. Room-level routes come from the world plan
//     (design/world_plan.json paths/spots with the tokens owned), incl. Lanternway travel between lit posts.
//   * Regular enemies are neutralised with god mode + G.debug.killAll (never in a room holding the Gutterwisp,
//     never while a boss is alive). Bosses: the bot walks into the arena trigger, the arena flow is verified
//     (gates close, boss spawns, boss music), the boss takes damage through its own onHit (debug damage), then
//     rewards/flags/gates are verified.
//   * Abilities are taken at their shrines by touching/interacting, sconces are rested at, Lanternway posts are
//     lit and travelled, the player dies once (real hurt calls) and reclaims the wisp with Brand strikes, saves,
//     quits and continues through the real pause menu and title, and finishes both endings ('undying' with
//     < 6 sparks; then title Continue resumes the finished save before the final fight, all 6 sparks are collected and 'gutterlight' plays).
//   * Every step writes a checkpoint (test-output/qa-playthrough/checkpoints/<step>.json); --from <step> resumes
//     from the checkpoint written by the step before it (in ?test=1 mode, memory-only saves).
// Exit 1 on any failure (incl. console errors / G.debug errors).
'use strict';
const path = require('path');
const fs = require('fs');
const ROOT = path.resolve(__dirname, '..');
const { openGame, closeAll } = require(path.join(ROOT, 'tools/lib/browser'));
const { Nav } = require(path.join(ROOT, 'tools/lib/nav'));
const PLAN = require(path.join(ROOT, 'design/world_plan.json'));

const OUT = path.join(ROOT, 'test-output/qa-playthrough');
const CK = path.join(OUT, 'checkpoints');
const SHOTS = path.join(OUT, 'shots');
fs.mkdirSync(CK, { recursive: true });
fs.mkdirSync(SHOTS, { recursive: true });

const argv = process.argv.slice(2);
const arg = (k, d) => { const i = argv.indexOf(k); return i >= 0 ? argv[i + 1] : d; };
const FLAG = (k) => argv.includes(k);
const VERBOSE = FLAG('--verbose');
const SHOT = FLAG('--shots');
const FILE = arg('--file', 'index.html');

const T0 = Date.now();
const logLines = [];
function log(...a) {
  const s = '[' + ((Date.now() - T0) / 1000).toFixed(1).padStart(7) + 's] ' + a.join(' ');
  logLines.push(s);
  console.log(s);
}
function vlog(...a) { if (VERBOSE) log(...a); else logLines.push('        ' + a.join(' ')); }
class Fail extends Error {}
function must(cond, msg, detail) {
  if (!cond) throw new Fail(msg + (detail !== undefined ? ' — ' + (typeof detail === 'string' ? detail : JSON.stringify(detail)) : ''));
}

// =============================================================================================== page helper
const INJECT = `
(() => {
  if (window.PT) return true;
  window.__bad = [];
  const P = CanvasRenderingContext2D.prototype;
  for (const fn of ['fillText', 'strokeText']) {
    const orig = P[fn];
    P[fn] = function (s) { const str = String(s); if (/undefined|NaN|\\[object|null/.test(str) && __bad.length < 50) __bad.push(str); return orig.apply(this, arguments); };
  }
  const musicLog = [];
  if (G.Audio && G.Audio.music) {
    const om = G.Audio.music.bind(G.Audio);
    G.Audio.music = function (name) { musicLog.push(name == null ? null : String(name)); if (musicLog.length > 400) musicLog.shift(); return om.apply(null, arguments); };
  }
  const vin = (c) => ({ left: !!(c & 1), right: !!(c & 2), down: !!(c & 68), jump: !!(c & 8), dash: !!(c & 32), spell: !!(c & 64) });
  const DISMISS = ['dialogue', 'lore', 'abilityGet', 'itemGet', 'sparkMemory'];
  const api = {
    frames: 0, lastRoom: null, roomLog: [], musicLog, killed: 0, noKill: false, emberTopUps: 0,
    g: () => G.game, p: () => G.game.player,
    step(n) {
      for (let i = 0; i < (n || 1); i++) {
        G.game.step(); api.frames++;
        const r = G.game.room && G.game.room.id;
        if (r !== api.lastRoom) { api.roomLog.push({ f: api.frames, room: r, mode: G.game.mode }); api.lastRoom = r; api.onEnter(); }
      }
    },
    onEnter() {
      if (api.noKill || !G.game.room || G.game.mode !== 'play') return;
      const room = G.game.room;
      if (room.entities.some((e) => e.type === 'wisp' && !e.dead)) return;
      const ar = room.findType ? room.findType('arena')[0] : null;
      if (ar && ar.boss && !ar.boss.dead) return;
      api.killed += G.debug.killAll();
    },
    killNow() { if (!api.noKill) { const r = G.game.room; if (r && !r.entities.some((e) => e.type === 'wisp' && !e.dead)) { const ar = r.findType('arena')[0]; if (!(ar && ar.boss && !ar.boss.dead)) api.killed += G.debug.killAll(); } } },
    ui: () => (G.UI && G.UI.screenNames ? G.UI.screenNames() : []),
    motor() { const m = G.game.player && G.game.player.motor; return m ? JSON.parse(JSON.stringify(m)) : null; },
    snap(withTiles) {
      const g = G.game, p = g.player, room = g.room, pr = g.progress;
      const s = { mode: g.mode, room: room && room.id, frames: api.frames, ui: api.ui(), locked: g.isLocked(), locks: g.lockReasons ? g.lockReasons() : [],
        motor: api.motor(), resting: !!(p && p.resting), hp: pr && pr.health, maxHp: g.maxHealth ? g.maxHealth() : null, ember: pr && pr.ember,
        cinders: pr && pr.cinders, abilities: pr ? Object.assign({}, pr.abilities) : {}, fade: g.sysFadeAlpha, wisp: pr && pr.wisp };
      if (withTiles && room) {
        s.tiles = Array.from(room.tiles);
        if (room.rebuildSolids) room.rebuildSolids();
        s.solids = room.solids.filter((o) => o && o !== p).map((o) => ({ x: o.x, y: o.y, w: o.w, h: o.h, oneWay: !!o.oneWay, noGrip: !!o.noGrip }));
      }
      return s;
    },
    // play input codes; stop on room change (after the new room is live), death, UI, unexpected lock
    run(codes, o) {
      o = o || {};
      const g = G.game, r0 = g.room && g.room.id;
      let f = 0, why = 'done';
      const holdDir = o.holdDir || 0;
      for (; f < codes.length + (o.extra || 0); f++) {
        if (g.mode === 'dead' || g.mode === 'ending' || g.mode === 'title') { why = 'mode:' + g.mode; break; }
        if (g.room && g.room.id !== r0 && g.mode === 'play') { why = 'room'; break; }
        if (g.mode === 'play' && api.ui().some((n) => n !== 'hud' && n !== 'toasts' && n !== 'prompts' && n !== 'cards')) { why = 'ui:' + api.ui().join(','); break; }
        if (g.mode === 'play' && g.isLocked() && !o.ignoreLock) { why = 'lock:' + g.lockReasons().join(','); break; }
        const c = f < codes.length ? codes[f] : (holdDir > 0 ? 2 : holdDir < 0 ? 1 : 0);
        G.input.setVirtual(g.mode === 'transition' ? { left: !!(c & 1), right: !!(c & 2) } : vin(c));
        if ((c & 64) && g.progress.ember < 33) { g.progress.ember = Math.max(g.progress.ember, 33); api.emberTopUps++; }
        api.step(1);
        if (o.trace) { const m = g.player.motor; (o.tr || (o.tr = [])).push([m.x, m.y, m.vx, m.vy, m.onGround, m.wall, g.isLocked(), g.hitstopTime, m.knockTime, m.recoilTime, g.player.invuln || 0]); }
      }
      G.input.clearVirtual();
      // one neutral frame so the next program's first jump/dash is a fresh press (presses derive from transitions)
      const end = g.player && g.player.motor ? { x: g.player.motor.x, y: g.player.motor.y } : null;
      if (g.mode === 'play' && !(why === 'room')) api.step(1);
      return { f, why, room: g.room && g.room.id, mode: g.mode, end, tr: o.tr };
    },
    press(action, hold, after) { G.input.setVirtual(typeof action === 'string' ? { [action]: true } : action); api.step(hold || 1); G.input.clearVirtual(); api.step(after == null ? 1 : after); },
    // let the game settle: dismiss cards/dialogue/lore, wait for transitions/locks to end and the player to be stable
    settle(max, o) {
      o = o || {};
      const g = G.game;
      let f = 0, presses = 0;
      const seen = [];
      for (; f < (max || 900); f++) {
        const ui = api.ui().filter((n) => n !== 'hud' && n !== 'toasts' && n !== 'prompts' && n !== 'cards');
        if (ui.length) {
          for (const n of ui) if (!seen.includes(n)) seen.push(n);
          if (ui.some((n) => DISMISS.includes(n))) {
            if (f % 12 === 0) { G.input.setVirtual({ confirm: true, jump: true }); presses++; } else G.input.clearVirtual();
            api.step(1); continue;
          }
          if (!o.keepUI) { G.input.clearVirtual(); return { f, ok: false, why: 'ui:' + ui.join(','), seen, presses }; }
        }
        G.input.clearVirtual();
        const p = g.player, m = p && p.motor;
        if (g.mode === 'play' && !g.isLocked() && m && !m.hazard && (m.onGround || m.wall || m.swimming) && Math.abs(m.vy) < 1e-6 + (m.swimming ? 40 : 0) && !(p.standT > 0) && !p.dying) {
          if (!o.still || Math.abs(m.vx) < 1e-6) return { f, ok: true, seen, presses };
        }
        if (g.mode === 'title' || g.mode === 'ending') return { f, ok: false, why: 'mode:' + g.mode, seen, presses };
        api.step(1);
      }
      return { f, ok: false, why: 'timeout mode=' + g.mode + ' locks=' + (g.lockReasons ? g.lockReasons().join(',') : '') + ' ui=' + api.ui().join(','), seen, presses };
    },
    // a stable-enough moment to plan: in play, unlocked, no blocking UI (airborne is fine: the planner uses the exact state)
    ready(max) {
      const g = G.game;
      for (let f = 0; f < (max || 600); f++) {
        const ui = api.ui().filter((n) => n !== 'hud' && n !== 'toasts' && n !== 'prompts' && n !== 'cards');
        if (ui.length) {
          if (ui.some((n) => DISMISS.includes(n))) { if (f % 12 === 0) G.input.setVirtual({ confirm: true, jump: true }); else G.input.clearVirtual(); api.step(1); continue; }
          G.input.clearVirtual();
          return { ok: false, why: 'ui:' + ui.join(',') };
        }
        G.input.clearVirtual();
        const m = g.player && g.player.motor;
        if (g.mode === 'play' && !g.isLocked() && m && !m.hazard && !(g.player.standT > 0) && !(g.hitstopTime > 0)) return { ok: true, f };
        if (g.mode === 'title' || g.mode === 'ending') return { ok: false, why: 'mode:' + g.mode };
        api.step(1);
      }
      return { ok: false, why: 'not ready: mode=' + g.mode + ' locks=' + g.lockReasons().join(',') };
    },
    tokens(list) {
      const pr = G.game.progress, out = [];
      for (const t of list) {
        if (['dash', 'grip', 'wings', 'oilcloak', 'plunge', 'bolt'].includes(t)) { if (pr.abilities[t]) out.push(t); continue; }
        try { if (G.game.evalCondition(t)) out.push(t); } catch (e) { /* unknown */ }
      }
      return out;
    },
    errors() { return (G.debug && G.debug.errors ? G.debug.errors : []).slice(0, 20).map(String); },
  };
  window.PT = api;
  return true;
})()`;

// =============================================================================================== world plan router
const roomPlan = new Map(PLAN.rooms.map((r) => [r.id, r]));
const ALL_TOKENS = (() => {
  const s = new Set();
  for (const r of PLAN.rooms) for (const x of [...r.paths, ...r.spots]) for (const t of x.requires || []) s.add(t);
  return [...s];
})();
const LANTERN_ROOM = {};
for (const r of PLAN.rooms) for (const sp of r.spots) { const m = /^lanternway:(.+)$/.exec(sp.id); if (m) LANTERN_ROOM[m[1]] = r.id; }

function reqOk(req, tokens) { return (req || []).every((t) => tokens.has(t)); }

// Dijkstra over (room, entry) states. start: {room, exits:[reachable exit ids], spots:[reachable spot ids]}.
// goal: {room, spot}. lit: Set of lit lanternway ids. Returns {cost, hops:[{room, exit}|{travel}], first} or null.
function route(start, goal, tokens, lit) {
  const dist = new Map(), prev = new Map();
  const pq = [];
  const push = (k, d, from, how) => { if (dist.has(k) && dist.get(k) <= d) return; dist.set(k, d); prev.set(k, { from, how }); pq.push([d, k]); };
  const S = 'START';
  dist.set(S, 0);
  const expandFrom = (room, exitsReach, spotsReach, k, d) => {
    const rp = roomPlan.get(room);
    for (const x of exitsReach) {
      const ex = rp.exits.find((e) => e.id === x);
      if (ex && ex.to) push(ex.to + '|' + ex.toExit, d + 1, k, { room, exit: x });
    }
    for (const sp of spotsReach) {
      const m = /^lanternway:(.+)$/.exec(sp);
      if (!m || !lit.has(m[1])) continue;
      for (const id of lit) if (id !== m[1] && LANTERN_ROOM[id]) push(LANTERN_ROOM[id] + '|@lanternway:' + id, d + 3, k, { room, travel: id, from: m[1] });
    }
  };
  const reachIn = (room, entry) => {
    const rp = roomPlan.get(room);
    if (!rp) return { exits: [], spots: [] };
    const exits = new Set(), spots = new Set();
    if (entry.startsWith('@')) {
      const sid = entry.slice(1);
      spots.add(sid);
      for (const sp of rp.spots) if (sp.id === sid && reqOk(sp.requires, tokens)) exits.add(sp.from);
      // from the exits reachable at the post, everything those exits reach
      for (const x of [...exits]) for (const p of rp.paths) if (p.from === x && reqOk(p.requires, tokens)) exits.add(p.to);
    } else {
      for (const p of rp.paths) if (p.from === entry && reqOk(p.requires, tokens)) exits.add(p.to);
    }
    const entries = entry.startsWith('@') ? [...exits] : [entry];
    for (const sp of rp.spots) if (entries.includes(sp.from) && reqOk(sp.requires, tokens)) spots.add(sp.id);
    return { exits: [...exits], spots: [...spots] };
  };
  if (start.room === goal.room && start.spots.includes(goal.spot)) return { cost: 0, hops: [] };
  expandFrom(start.room, start.exits, start.spots, S, 0);
  let found = null;
  while (pq.length) {
    pq.sort((a, b) => a[0] - b[0]);
    const [d, k] = pq.shift();
    if (d > dist.get(k)) continue;
    const [room, entry] = k.split('|');
    const rr = reachIn(room, entry);
    if (room === goal.room && rr.spots.includes(goal.spot)) { found = k; break; }
    expandFrom(room, rr.exits, rr.spots, k, d);
  }
  if (!found) return null;
  const hops = [];
  for (let k = found; k !== S; k = prev.get(k).from) hops.unshift(prev.get(k).how);
  return { cost: dist.get(found), hops, end: found };
}

// =============================================================================================== driver
const nav = new Nav();
let page = null, pageErrors = null, pageLogs = null;
const stats = { fragile: [], macros: 0, diverged: 0, replans: 0, hazards: 0, rooms: 0, minMargin: [], travel: 0, rests: 0, interacts: 0, killed: 0, frames: 0, planMs: 0 };
const ev = (fn, ...args) => page.evaluate(fn, ...args);

async function snap(withTiles) { return ev((w) => PT.snap(w), !!withTiles); }
async function tokensNow() { return new Set(await ev((l) => PT.tokens(l), ALL_TOKENS)); }
async function litNow() { return new Set(await ev(() => Object.keys(G.game.progress.lanterns || {}).filter((k) => G.game.progress.lanterns[k]))); }
async function shot(name) {
  if (!SHOT && !/^(ending|title|boss|final)/.test(name)) return;
  await ev(() => G.debug.render());
  await page.screenshot({ path: path.join(SHOTS, name + '.png') });
}

// reachable exits/spots in the current room from the actual state (for the router's first hop)
function hereReach(s) {
  const e = nav.analyzer(s);
  const rp = roomPlan.get(s.room);
  const spotIds = rp ? rp.spots.map((x) => x.id).filter((v, i, a) => a.indexOf(v) === i) : [];
  const tis = [];
  for (const id of spotIds) { try { tis.push([id, nav.targetIndex(e, { spot: id }).ti]); } catch (err) { /* spot entity missing */ } }
  const A = Object.assign({}, s.motor, { events: [], locked: false });
  const res = e.an.closure([{ s: A, label: 'now' }], e.req);
  const spots = tis.filter(([, ti]) => res.spots.has(ti)).map(([id]) => id);
  return { exits: [...res.exits.keys()], spots };
}

// ---- in-room navigation to a target. Returns {ok, why, room}
async function navTo(target, o) {
  o = o || {};
  const room0 = (await snap()).room;
  let fails = 0, lastPos = null, still = 0;
  for (let it = 0; it < (o.maxIt || 80); it++) {
    const rd = await ev(() => PT.ready(900));
    if (!rd.ok) {
      const s0 = await snap();
      if (s0.mode === 'dead') return { ok: false, why: 'died', room: s0.room };
      return { ok: false, why: 'not ready: ' + rd.why, room: s0.room };
    }
    const s = await snap(true);
    if (s.room !== room0) return { ok: false, why: 'left room', room: s.room };
    if (o.done && await o.done(s)) return { ok: true, room: s.room };
    const t0 = Date.now();
    let plan;
    try { plan = nav.plan(s, target, { margin: o.margin !== false }); } catch (err) { return { ok: false, why: 'nav error: ' + err.message, room: s.room }; }
    stats.planMs += Date.now() - t0;
    stats.replans++;
    const posKey = Math.round(s.motor.x) + ',' + Math.round(s.motor.y);
    if (posKey === lastPos) still++; else still = 0;
    lastPos = posKey;
    if (still > 4) fs.writeFileSync(path.join(OUT, 'fail_snap.json'), JSON.stringify({ snap: s, target }));
    if (still > 4) return { ok: false, why: 'stuck at ' + nav.describeState(s.motor) + ' (' + (plan.desc || plan.reason) + ')', room: s.room };
    vlog('  nav[' + s.room + '] ' + plan.type + ' ' + (plan.desc || plan.reason || '') + (plan.margin ? ' margin ' + plan.margin.lo + '..+' + plan.margin.hi + 'px' : '') + ' (' + (Date.now() - t0) + 'ms)');
    if (plan.type === 'fail') {
      fails++;
      fs.writeFileSync(path.join(OUT, 'fail_snap.json'), JSON.stringify({ snap: s, target }));
      if (fails > 2) return { ok: false, why: plan.reason + ' exits=' + JSON.stringify(plan.exits) + ' spots=' + JSON.stringify(plan.spots), room: s.room };
      await ev(() => PT.step(10));
      continue;
    }
    if (plan.fragile && plan.fragile.length) {
      for (const d of plan.fragile) stats.fragile.push({ room: s.room, at: nav.describeState(s.motor), edge: d });
      log('  WARN fragile reach edge(s) in ' + s.room + ' not reproducible from ' + nav.describeState(s.motor) + ': ' + plan.fragile.slice(0, 3).join(' ; '));
    }
    if (plan.type === 'seq') {
      stats.macros++;
      if (plan.margin && plan.margin.px < 8 && process.env.PT_DIVERGE) fs.writeFileSync(path.join(OUT, 'tight_' + s.room + '.json'), JSON.stringify({ snap: s, target }));
      if (plan.margin && o.critical !== false) stats.minMargin.push({ room: s.room, px: plan.margin.px, lo: plan.margin.lo, hi: plan.margin.hi, desc: plan.desc.slice(0, 120), at: nav.describeState(s.motor) });
      const extra = plan.expect.kind === 'exit' ? 240 : 0;
      const last = plan.codes.length ? plan.codes[plan.codes.length - 1] : 0;
      const r = await ev(([c, x, d, tr]) => PT.run(c, { extra: x, holdDir: d, trace: tr }), [plan.codes, extra, (last & 2) ? 1 : (last & 1) ? -1 : 0, !!process.env.PT_DIVERGE]);
      if (r.why === 'room') return { ok: true, why: 'room', room: r.room, exited: true };
      if (r.why.startsWith('mode:')) return { ok: false, why: r.why, room: r.room };
      const a = await snap();
      if (r.end && plan.expect && plan.expect.kind !== 'exit') {
        const dx = Math.abs(r.end.x - plan.expect.x), dy = Math.abs(r.end.y - plan.expect.y);
        if (dx > 0.5 || dy > 0.5 || r.f !== plan.codes.length) {
          stats.diverged++;
          if (process.env.PT_DIVERGE) fs.writeFileSync(path.join(OUT, 'diverge_' + stats.diverged + '.json'), JSON.stringify({ snap: s, plan: { codes: plan.codes, pre: plan.pre, expect: plan.expect, desc: plan.desc }, got: r }));
          vlog('    diverged: expected ' + plan.expect.kind + ' at ' + plan.expect.x.toFixed(1) + ',' + plan.expect.y.toFixed(1) + ' f' + plan.codes.length + ' got ' + r.end.x.toFixed(1) + ',' + r.end.y.toFixed(1) + ' f' + r.f + ' (' + r.why + ')');
        }
      }
      if (a.motor && a.motor.hazard) stats.hazards++;
      if (o.touchDone && await o.touchDone()) return { ok: true, room: s.room };
      continue;
    }
    if (plan.type === 'walkout' || plan.type === 'hold') {
      const n = plan.type === 'walkout' ? 0 : plan.frames;
      const code = plan.dir > 0 ? 2 : plan.dir < 0 ? 1 : 0;
      const r = await ev(([c, n0, dir]) => PT.run(new Array(n0).fill(c), { extra: n0 ? 0 : 400, holdDir: dir }), [code, n, plan.dir]);
      if (r.why === 'room') return { ok: true, why: 'room', room: r.room, exited: true };
      continue;
    }
    if (plan.type === 'here') {
      await ev((c) => PT.run(c), plan.codes);
      await ev(() => PT.step(2));
      return { ok: true, room: s.room, here: true };
    }
    if (plan.type === 'break') {
      await ev((c) => PT.run(c), plan.codes);
      const br = await breakComp(plan.comp, plan.tiles);
      vlog('    break ' + plan.comp + ': ' + JSON.stringify(br));
      if (!br.ok) return { ok: false, why: 'could not break ' + plan.comp + ' ' + JSON.stringify(br), room: s.room };
      continue;
    }
  }
  return { ok: false, why: 'too many iterations', room: room0 };
}

// strike a breakable component with the Brand (side / up / down) until it breaks
async function breakComp(compId, tiles) {
  return ev(([id, tiles]) => {
    const g = G.game, room = g.room;
    const comp = () => room.components.find((c) => c.id === id);
    const tries = [];
    const p = () => g.player;
    for (let k = 0; k < 14 && comp() && !comp().broken; k++) {
      const m = p().motor, cx = m.x + m.w / 2, cy = m.y + m.h / 2;
      let tx = 0, ty = 0;
      for (const [c, r] of tiles) { tx += (c + 0.5) * 40; ty += (r + 0.5) * 40; }
      tx /= tiles.length; ty /= tiles.length;
      const below = tiles.some(([c, r]) => Math.abs(r * 40 - (m.y + m.h)) < 2 && (c + 1) * 40 > m.x && c * 40 < m.x + m.w);
      const above = !below && ty < m.y - 10 && Math.abs(tx - cx) < 80;
      const dir = tx > cx ? 1 : -1;
      if (below) { tries.push('down'); PT.press({ jump: true }, 6, 0); G.input.setVirtual({ down: true, attack: true }); PT.step(1); G.input.setVirtual({ down: true }); PT.step(30); G.input.clearVirtual(); PT.step(10); }
      else if (above && k % 2 === 0) { tries.push('up'); G.input.setVirtual({ up: true, attack: true }); PT.step(1); G.input.setVirtual({ up: true }); PT.step(4); G.input.clearVirtual(); PT.step(20); }
      else if (above) { tries.push('jump-up'); G.input.setVirtual({ jump: true }); PT.step(14); G.input.setVirtual({ jump: true, up: true, attack: true }); PT.step(1); G.input.setVirtual({ up: true }); PT.step(4); G.input.clearVirtual(); PT.step(40); }
      else {
        tries.push('side' + dir);
        if ((m.facing || 1) !== dir) { G.input.setVirtual(dir > 0 ? { right: true } : { left: true }); PT.step(1); G.input.clearVirtual(); }
        G.input.setVirtual({ attack: true }); PT.step(1); G.input.clearVirtual(); PT.step(22);
      }
    }
    const c = comp();
    return { ok: !!(c && c.broken), tries };
  }, [compId, tiles]);
}

// ---- go to (room, spot) through the world
async function goTo(goal, o) {
  o = o || {};
  const tStart = Date.now();
  const visited = [];
  for (let hop = 0; hop < 120; hop++) {
    const rd = await ev(() => PT.ready(900));
    must(rd.ok, 'game not ready while travelling to ' + goal.room + '/' + goal.spot, rd);
    const s = await snap(true);
    if (!visited.length || visited[visited.length - 1] !== s.room) visited.push(s.room);
    const tokens = await tokensNow();
    const lit = await litNow();
    if (s.room === goal.room) {
      const tgt = o.targetFn ? await o.targetFn() : o.target;
      const r = await navTo(tgt || { spot: goal.spot }, Object.assign({}, o.nav || {}, { done: o.done, touchDone: o.touchDone }));
      if (r.ok && !r.exited) { log('  reached ' + goal.room + ' ' + goal.spot + ' via ' + visited.join('>') + ' (' + ((Date.now() - tStart) / 1000).toFixed(1) + 's)'); return { ok: true, visited }; }
      if (r.ok && r.exited) continue;
      vlog('  direct nav in ' + s.room + ' failed: ' + r.why + ' — routing');
    }
    const here = hereReach(s);
    const rt = route({ room: s.room, exits: here.exits, spots: here.spots }, goal, tokens, lit);
    must(rt, 'no route from ' + s.room + ' (exits reachable now: ' + here.exits.join(',') + ') to ' + goal.room + '/' + goal.spot + ' with tokens ' + [...tokens].join(','));
    if (!rt.hops.length) {
      const r = await navTo(o.target || { spot: goal.spot }, Object.assign({}, o.nav || {}, { done: o.done, touchDone: o.touchDone }));
      must(r.ok, 'could not reach ' + goal.spot + ' in ' + s.room, r.why);
      if (!r.exited) { log('  reached ' + goal.room + ' ' + goal.spot + ' via ' + visited.join('>')); return { ok: true, visited }; }
      continue;
    }
    const h = rt.hops[0];
    vlog('  route ' + s.room + ' → ' + goal.room + ': ' + rt.hops.map((x) => x.travel ? '[travel ' + x.travel + ']' : x.room + ':' + x.exit).join(' '));
    if (h.travel) {
      await travel(h.from, h.travel);
      continue;
    }
    const r = await navTo({ exit: h.exit }, o.nav);
    if (!r.ok) {
      const s2 = await snap();
      if (s2.room !== s.room) continue;     // e.g. a hazard respawn or a fall into another room
      throw new Fail('navigation failed in ' + s.room + ' toward exit ' + h.exit + ': ' + r.why);
    }
    if (r.exited) stats.rooms++;
  }
  throw new Fail('gave up travelling to ' + goal.room + '/' + goal.spot + ' after many hops: ' + visited.join('>'));
}

// ---- interactions
async function interactUp(expect, max) {
  const r = await ev(([ex, max]) => {
    const g = G.game, p = g.player;
    const tgt = p.interactTarget;
    const info = tgt ? tgt.type + (tgt.props && tgt.props.id ? ':' + tgt.props.id : '') : null;
    PT.press({ up: true }, 2, 2);
    let f = 0, uiSeen = [];
    for (; f < (max || 240); f++) { const ui = PT.ui(); for (const n of ui) if (!uiSeen.includes(n)) uiSeen.push(n); PT.step(1); }
    return { target: info, uiSeen, resting: !!p.resting, ui: PT.ui() };
  }, [expect, max]);
  stats.interacts++;
  return r;
}

async function rest(sconceId) {
  await goTo({ room: (await ev((id) => (G.World.findEntitySpecs((p) => p.type === 'sconce' && p.id === id)[0] || {}).roomId, sconceId)), spot: 'sconce:' + sconceId });
  const r = await interactUp('sconce', 90);
  const s = await ev(() => ({ resting: G.game.player.resting, sconce: G.game.progress.sconce, hp: G.game.progress.health, max: G.game.maxHealth() }));
  must(s.resting && s.sconce && s.sconce.id === sconceId, 'rest at ' + sconceId, { r, s });
  must(s.hp === s.max, 'resting heals', s);
  stats.rests++;
  await ev(() => { PT.settle(300, { keepUI: true }); PT.press('down', 1, 1); return PT.settle(600); });
  log('  rested at ' + sconceId + ' (respawn set, healed ' + s.hp + '/' + s.max + ')');
}

async function lightLantern(id) {
  const room = LANTERN_ROOM[id];
  await goTo({ room, spot: 'lanternway:' + id });
  const before = await ev((id) => !!G.game.progress.lanterns[id], id);
  if (!before) {
    const r = await interactUp('lanternway', 120);
    await ev(() => PT.settle(600));
    const lit = await ev((id) => !!G.game.progress.lanterns[id], id);
    must(lit, 'lanternway ' + id + ' lit', r);
    log('  lit Lanternway post "' + id + '" in ' + room);
  }
}

async function travel(fromId, toId) {
  // stand at the post, open the menu, pick the destination, confirm
  const room = LANTERN_ROOM[fromId];
  const s = await snap();
  must(s.room === room, 'travel must start in ' + room, s.room);
  const r0 = await navTo({ spot: 'lanternway:' + fromId });
  must(r0.ok, 'reach lanternway ' + fromId, r0.why);
  await ev(() => PT.killNow());
  await ev(() => PT.step(200)); // isSafeRoom: 3 s after the last threat
  const r = await ev((to) => {
    PT.press({ up: true }, 2, 30);
    const ui = PT.ui();
    if (!ui.includes('lanternway')) return { ok: false, why: 'menu did not open', ui };
    const scr = G.UI.find('lanternway');
    const ids = ['lastlight', 'guttered', 'meltbloom', 'nave', 'chandlery', 'mothwood', 'rime'];
    for (let k = 0; k < 10; k++) {
      const cur = scr.sel;
      // posts are listed in LANTERNS order; read the target index from the draw order when available
      if (scr.travelTo) break;
      const names = (G.UI.LANTERNS || ids);
      if (names[cur] === to) break;
      PT.press('down', 1, 6);
    }
    const names = (G.UI.LANTERNS || ids);
    const selId = names[scr.sel];
    PT.press('confirm', 1, 2);
    const r0 = G.game.room.id;
    let f = 0;
    for (; f < 300 && (G.game.room.id === r0 || G.game.isLocked()); f++) PT.step(1);
    return { ok: true, sel: selId, ui: PT.ui(), frames: f };
  }, toId);
  must(r.ok, 'lanternway menu', r);
  await ev(() => PT.settle(900));
  const s2 = await snap();
  must(s2.room === LANTERN_ROOM[toId], 'travel ' + fromId + ' → ' + toId + ' arrives in ' + LANTERN_ROOM[toId], { room: s2.room, r });
  stats.travel++;
  log('  travelled by Lanternway ' + fromId + ' → ' + toId + ' (' + s2.room + ')');
}

async function takeShrine(ability) {
  const where = await ev((a) => (G.World.findEntitySpecs((p) => p.type === 'shrine' && p.ability === a)[0] || {}).roomId, ability);
  await goTo({ room: where, spot: 'shrine:' + ability });
  const r = await interactUp('shrine', 200);
  const s = await ev((a) => ({ has: G.game.hasAbility(a) }), ability);
  must(s.has, 'shrine grants ' + ability, r);
  must(r.uiSeen.includes('abilityGet'), 'ability card shown for ' + ability, r);
  await ev(() => PT.settle(1200));
  log('  took ' + ability + ' at its shrine in ' + where + ' (card: ' + r.uiSeen.join(',') + ')');
}

async function pickup(id) {
  const where = await ev((id) => (G.World.findEntitySpecs((p) => p.type === 'pickup' && p.id === id)[0] || {}).roomId, id);
  must(where, 'pickup ' + id + ' exists');
  const has = () => ev((id) => !!G.game.progress.flags['item:' + id], id);
  if (await has()) { log('  pickup ' + id + ' already collected'); return; }
  // the plan spot is a 3x3-tile touch zone; the pickup itself is smaller: aim at its live body
  const targetFn = async () => {
    const r = await ev((id) => { const e = G.game.room.entities.find((x) => x.type === 'pickup' && x.props && x.props.id === id && !x.dead); return e ? { x: e.x + 2, y: e.y + 2, w: Math.max(4, e.w - 4), h: Math.max(4, e.h - 4) } : null; }, id);
    return r ? { rect: r } : null;
  };
  await goTo({ room: where, spot: 'pickup:' + id }, { touchDone: has, done: async () => has(), targetFn });
  for (let k = 0; k < 20 && !(await has()); k++) await ev(() => PT.step(10));
  must(await has(), 'pickup ' + id + ' collected');
  const seen = await ev(() => PT.settle(1200));
  log('  collected ' + id + ' in ' + where + ' (ui ' + seen.seen.join(',') + ')');
}

async function pullLever(id) {
  const where = await ev((id) => (G.World.findEntitySpecs((p) => p.type === 'lever' && p.id === id)[0] || {}).roomId, id);
  const pulled = () => ev((id) => !!G.game.progress.flags['lever:' + id], id);
  if (await pulled()) { log('  lever ' + id + ' already pulled'); return; }
  // stand within Brand reach of the lever (the plan spot only means "touchable"; a strike needs footing)
  const lt = await ev((id) => { const f = G.World.findEntitySpecs((p) => p.type === 'lever' && p.id === id)[0]; return { tx: f.tx, ty: f.ty }; }, id);
  await goTo({ room: where, spot: 'lever:' + id }, { target: { stand: { feetY0: (lt.ty - 1) * 40, feetY1: (lt.ty + 3) * 40, cx0: (lt.tx - 1) * 40, cx1: (lt.tx + 2) * 40 } } });
  const r = await ev((id) => {
    const lv = G.game.room.entities.find((e) => e.type === 'lever' && e.props && e.props.id === id);
    if (!lv) return { ok: false, why: 'no lever entity' };
    const tries = [];
    for (let k = 0; k < 16 && !G.game.progress.flags['lever:' + id]; k++) {
      const m = G.game.player.motor, cx = m.x + m.w / 2, cy = m.y + m.h / 2;
      const lx = lv.x + lv.w / 2, ly = lv.y + lv.h / 2;
      const dir = lx > cx ? 1 : -1;
      if (ly < m.y - 8 && Math.abs(lx - cx) < 70) {
        tries.push('up');
        if (k % 2) { G.input.setVirtual({ jump: true }); PT.step(12); }
        G.input.setVirtual({ up: true, attack: true }); PT.step(1); G.input.setVirtual({ up: true }); PT.step(4); G.input.clearVirtual(); PT.step(30);
      } else if (ly > m.y + m.h + 8 && Math.abs(lx - cx) < 60) {
        tries.push('down'); PT.press({ jump: true }, 8, 0); G.input.setVirtual({ down: true, attack: true }); PT.step(1); G.input.setVirtual({ down: true }); PT.step(30); G.input.clearVirtual(); PT.step(10);
      } else {
        tries.push('side' + dir);
        if (Math.abs(lx - cx) > 90) { G.input.setVirtual(dir > 0 ? { right: true } : { left: true }); PT.step(Math.min(20, Math.floor((Math.abs(lx - cx) - 60) / 5.5))); G.input.clearVirtual(); PT.step(2); }
        if ((m.facing || 1) !== dir) { G.input.setVirtual(dir > 0 ? { right: true } : { left: true }); PT.step(1); G.input.clearVirtual(); }
        if (k % 3 === 2) { G.input.setVirtual({ jump: true }); PT.step(10); }
        G.input.setVirtual({ attack: true }); PT.step(1); G.input.clearVirtual(); PT.step(24);
      }
    }
    return { ok: !!G.game.progress.flags['lever:' + id], tries };
  }, id);
  must(r.ok, 'lever ' + id + ' struck with the Brand', r);
  await ev(() => PT.settle(600));
  log('  struck lever ' + id + ' in ' + where + ' (' + r.tries.join(',') + ')');
}

// ---- bosses
const BOSS_ROOM = { effigy: 'gw_05', sable1: 'mb_07', matron: 'sf_05', tallowmere: 'dn_07', kilnmother: 'ch_09', vespertine: 'mw_04', sable2: 'ri_07', lucerne: 'hs_03' };
const BOSS_MUSIC = { effigy: 'boss', matron: 'boss', sable1: 'sable', sable2: 'sable', tallowmere: 'keeper', kilnmother: 'keeper', vespertine: 'keeper', lucerne: 'lucerne' };
const SEAL = { tallowmere: 'bell', kilnmother: 'kiln', vespertine: 'wing' };

async function fightBoss(id, o) {
  o = o || {};
  const room = BOSS_ROOM[id];
  const before = await ev(() => ({ cinders: G.game.progress.cinders, seals: (G.game.progress.seals || []).slice(), mlen: PT.musicLog.length }));
  // walk into the arena trigger (real movement)
  await ev(() => { PT.noKill = false; });
  const started = async () => ev(() => { const ar = G.game.room.findType('arena')[0]; return !!(ar && ar.state !== 'wait'); });
  await goTo({ room, spot: 'arena:' + id }, { done: started });
  if (!(await started())) {
    // the arena starts when the player's CENTRE is inside the trigger (reach's spot = body overlap): walk in
    const tr = await ev(() => { const ar = G.game.room.findType('arena')[0]; return ar.trigger; });
    const r = await navTo({ stand: { feetY0: tr.y, feetY1: tr.y + tr.h + 1, cx0: tr.x + 20, cx1: tr.x + tr.w - 20 } }, { done: started });
    must(r.ok || (await started()), id + ': walk into the arena trigger', r);
    for (let k = 0; k < 30 && !(await started()); k++) await ev(() => PT.step(2));
  }
  await ev(() => { PT.noKill = true; });
  const t0 = Date.now();
  const r = await ev(([id, dmg]) => {
    const g = G.game;
    const ar = g.room.findType('arena')[0];
    const out = { states: [], gatesClosed: 0, gatesTotal: 0, forms: {}, hits: 0, frames: 0, bossTypes: [], card: false, ui: [] };
    if (!ar) return Object.assign(out, { err: 'no arena entity' });
    for (let f = 0; f < 60 * 900; f++) {
      if (!out.states.includes(ar.state)) out.states.push(ar.state);
      const gates = ar.gates();
      out.gatesTotal = gates.length;
      if (ar.state === 'fight') out.gatesClosed = Math.max(out.gatesClosed, gates.filter((x) => x.closed).length);
      const ui = PT.ui();
      for (const n of ui) if (!out.ui.includes(n)) out.ui.push(n);
      const blocking = ui.filter((n) => n !== 'hud' && n !== 'toasts' && n !== 'prompts' && n !== 'cards');
      if (blocking.length) G.input.setVirtual(f % 12 === 0 ? { confirm: true, jump: true } : {});
      else G.input.clearVirtual();
      PT.step(1);
      out.frames++;
      const b = ar.boss;
      if (b && !out.bossTypes.includes(b.type)) out.bossTypes.push(b.type);
      if (b && !b.dead) out.forms['f' + (b.form || b.phase || 1)] = 1;
      // like a human: only once the fight has started and the player is in control (not during intro cinematics)
      if (b && !b.dead && !b.dying && b.hurtable && b.fightStarted !== false && !g.isLocked() && !blocking.length && f % 10 === 0) {
        const p = g.player;
        b.onHit({ damage: dmg, kind: 'nail', dir: { x: b.x > p.x ? 1 : -1, y: 0 }, source: p, pogo: false });
        out.hits++;
      }
      if (g.mode === 'ending' || g.mode === 'title') break;
      if (g.bossDefeated(id) && ar.state === 'done' && !g.isLocked() && !blocking.length && f > 30) { PT.step(60); break; }
    }
    G.input.clearVirtual();
    out.defeated = g.bossDefeated(id);
    out.arenaState = ar.state;
    out.gatesOpenAfter = ar.gates().filter((x) => !x.closed).length;
    out.mode = g.mode;
    return out;
  }, [id, o.dmg || 40]);
  const after = await ev(() => ({ cinders: G.game.progress.cinders, seals: (G.game.progress.seals || []).slice(), music: PT.musicLog.slice(-40) }));
  const music = after.music;
  log('  boss ' + id + ': states ' + r.states.join('>') + ', gates closed ' + r.gatesClosed + '/' + r.gatesTotal + ', forms ' + Object.keys(r.forms).join(',') +
    ', ' + r.hits + ' debug hits, ' + (r.frames / 60).toFixed(1) + ' s game time (' + ((Date.now() - t0) / 1000).toFixed(1) + ' s), music ' + music.filter((x, i, a) => x && a.indexOf(x) === i).join(',') + ', ui ' + r.ui.join(','));
  must(!r.err, 'arena for ' + id, r.err);
  must(r.states.includes('fight'), id + ': arena reached the fight state', r.states);
  must(r.gatesTotal === 0 || r.gatesClosed > 0, id + ': arena gates closed during the fight', r);
  must(music.includes(BOSS_MUSIC[id]), id + ': boss music "' + BOSS_MUSIC[id] + '" started', music);
  if (id === 'lucerne') {
    must(r.mode === 'ending', 'lucerne: the ending starts after her defeat', r);
    return r;
  }
  must(r.defeated, id + ': defeated (progress flag)', r);
  must(r.arenaState === 'done', id + ': arena done', r);
  must(r.gatesOpenAfter === r.gatesTotal, id + ': arena gates reopened', r);
  // reward cinders: chips on the floor + already collected; then walk over the chips to collect them
  const chips = await ev(() => G.game.room.entities.filter((e) => e.type === 'cinder' && !e.dead).map((e) => ({ v: e.value, tx: Math.floor((e.x + e.w / 2) / 40), ty: Math.floor((e.y + e.h - 1) / 40) })));
  const dropped = chips.reduce((a, c) => a + c.v, 0) + (after.cinders - before.cinders);
  const DESIGN_REWARD = { effigy: 200, tallowmere: 300, kilnmother: 300, vespertine: 300 };   // DESIGN §5 boss rewards
  if (DESIGN_REWARD[id]) must(dropped >= DESIGN_REWARD[id], id + ': reward of ' + DESIGN_REWARD[id] + ' cinders dropped', { before: before.cinders, after: after.cinders, chips: chips.length, dropped });
  const cols = [...new Set(chips.map((c) => c.tx + ',' + c.ty))].slice(0, 6);
  for (const k of cols) {
    const [tx, ty] = k.split(',').map(Number);
    const left = await ev(() => G.game.room.entities.filter((e) => e.type === 'cinder' && !e.dead).length);
    if (!left) break;
    await navTo({ stand: { feetY0: ty * 40 - 2, feetY1: (ty + 1) * 40 + 2, cx0: tx * 40 - 10, cx1: (tx + 1) * 40 + 10 } }, { maxIt: 12, margin: false }).catch(() => null);
    await ev(() => PT.step(20));
  }
  const got = await ev(() => G.game.progress.cinders);
  log('  reward: ' + dropped + ' cinders dropped, collected ' + (got - before.cinders));
  if (SEAL[id]) must(after.seals.includes(SEAL[id]), id + ': Warden Seal "' + SEAL[id] + '" given', after.seals);
  await ev(() => { PT.noKill = false; return PT.settle(1200); });
  await ev(() => PT.step(120)); // collect dropped cinders nearby
  return r;
}

// ---- endings
async function playEnding(expectId) {
  const r = await ev((want) => {
    const g = G.game;
    const out = { endingId: g.progress.ending, completed: g.progress.completed, uiSeq: [], phaseSeq: [], frames: 0 };
    for (let f = 0; f < 60 * 600 && g.mode !== 'title'; f++) {
      const ui = PT.ui().join(',');
      if (out.uiSeq[out.uiSeq.length - 1] !== ui) out.uiSeq.push(ui);
      const sc = G.UI.find && G.UI.find('ending');
      if (sc) {
        const st = 'phase:' + sc.phase + (sc.phase === 'pages' ? ':' + sc.page : '');
        if (out.phaseSeq[out.phaseSeq.length - 1] !== st) out.phaseSeq.push(st);
        if (sc.phase === 'credits') out.creditsScroll = Math.max(out.creditsScroll || 0, sc.scroll / Math.max(1, sc.creditsH));
      }
      PT.step(1);
      out.frames++;
    }
    out.mode = g.mode;
    out.summary = G.Save.summary(g.slot || 0);
    out.titleUI = PT.ui();
    return out;
  }, expectId);
  log('  ending "' + r.endingId + '" played in ' + (r.frames / 60).toFixed(1) + ' s; ' + r.phaseSeq.map((x) => x.slice(6)).join(' > ') + ' (credits scrolled ' + Math.round((r.creditsScroll || 0) * 100) + '%); back at ' + r.mode + ' (' + r.titleUI.join(',') + ')');
  must(r.endingId === expectId, 'ending id is ' + expectId, r.endingId);
  must(r.mode === 'title', 'ending returns to the title', r.mode);
  must(r.summary && r.summary.completed === true && r.summary.ending === expectId, 'save slot marked complete with ending ' + expectId, r.summary);
  must(r.uiSeq.some((x) => /ending/.test(x)), 'ending screen shown', r.uiSeq);
  const phases = r.phaseSeq.map((x) => x.split(':')[1]).filter((v, i, a) => a.indexOf(v) === i);
  must(['title', 'pages', 'credits', 'end'].every((p) => phases.includes(p)), 'ending phases title → pages → credits → The End', phases);
  must(r.creditsScroll >= 1, 'credits scrolled to the end', r.creditsScroll);
  await shot('title_after_' + expectId);
  return r;
}

// =============================================================================================== steps
const S = [];
const step = (id, desc, fn) => S.push({ id, desc, fn });

step('boot', 'real title → New Game → intro → wake-up in sh_01', async () => {
  const s = await ev(() => {
    PT.step(40);
    const out = { mode0: G.game.mode, ui0: PT.ui() };
    PT.press('jump', 1, 60);                 // title gate → menu (Audio.init)
    PT.press('confirm', 1, 40);              // New Game → slot select
    const t = G.UI.find('title');
    out.view = t && t.view;
    PT.press('confirm', 1, 1);               // slot 0 → intro
    let f = 0; for (; f < 240 && !PT.ui().includes('intro'); f++) PT.step(1);
    out.intro = PT.ui().includes('intro');
    PT.step(240);
    PT.press('cancel', 1, 1);                // skip the rest of the intro
    for (f = 0; f < 600 && !(G.game.mode === 'play' && !PT.ui().includes('intro')); f++) PT.step(1);
    out.locks = G.game.lockReasons();
    for (f = 0; f < 900 && G.game.isLocked(); f++) PT.step(1);
    out.wakeFrames = f;
    out.room = G.game.room && G.game.room.id;
    out.mode = G.game.mode;
    out.real = G.game.player && G.game.player.constructor && G.game.player.constructor.name;
    return out;
  });
  log('  title ' + s.mode0 + ' → slots(' + s.view + ') → intro ' + s.intro + ' → ' + s.room + ' locks ' + JSON.stringify(s.locks) + ' wake ' + s.wakeFrames + ' f');
  must(s.mode0 === 'title' && s.intro && s.room === 'sh_01' && s.mode === 'play', 'new game starts in sh_01', s);
  must(s.locks.includes('wake'), 'wake-up cinematic plays', s.locks);
  await ev(() => { G.debug.god(true); return true; });
  await shot('boot_sh01');
});

step('sh_sconce', 'Ashen Shore: rest at the first sconce', async () => { await rest('sh_sconce_a'); });
step('ll_lantern', 'Lastlight: light the Lanternway post, rest', async () => { await lightLantern('lastlight'); await rest('ll_sconce_a'); });
step('bolt', 'Guttered Ways: Ember Bolt shrine (gw_04)', async () => { await takeShrine('bolt'); await rest('gw_sconce_a'); });
step('death', 'die once (real hurt), respawn at the sconce, reclaim the Gutterwisp with the Brand', async () => {
  // walk east to the exit side of gw_04 and die there to a real hurt call
  const spot = await ev(() => {
    const room = G.game.room;
    return { room: room.id };
  });
  must(spot.room === 'gw_04', 'death step starts in gw_04', spot);
  // die at the Bolt shrine (same room as the sconce, a few tiles away)
  const nv = await navTo({ spot: 'shrine:bolt' });
  must(nv.ok && !nv.exited, 'walk to the death spot', nv);
  const d = await ev(() => {
    G.debug.god(false);
    G.game.progress.cinders += 40;
    const c0 = G.game.progress.cinders;
    const p = G.game.player;
    let n = 0;
    for (let k = 0; k < 20 && G.game.mode === 'play'; k++) { p.invuln = 0; G.Combat.hurtPlayer(1, { x: p.x + p.w / 2 + 30, y: p.y + p.h / 2 }); n++; PT.step(3); }
    let f = 0; for (; f < 60 && G.game.mode !== 'dead'; f++) PT.step(1);
    const mode = G.game.mode;
    for (f = 0; f < 600 && !(G.game.mode === 'play' && G.game.sysFadeAlpha < 0.05); f++) PT.step(1);
    PT.step(30);
    G.debug.god(true);
    return { hurts: n, deadMode: mode, room: G.game.room.id, wisp: G.game.progress.wisp, cinders: G.game.progress.cinders, c0, resting: G.game.player.resting, emberMax: G.game.emberMax ? G.game.emberMax() : null };
  });
  log('  died after ' + d.hurts + ' hurt calls; respawned in ' + d.room + ' resting=' + d.resting + '; wisp ' + JSON.stringify(d.wisp) + '; ember cap ' + d.emberMax);
  must(d.deadMode === 'dead', 'player died', d);
  must(d.wisp && d.wisp.cinders === d.c0 && d.cinders === 0, 'wisp holds the cinders', d);
  must(d.resting && d.room === 'gw_04', 'respawn seated at gw_sconce_a', d);
  // walk to the wisp (it drifts toward the player within 8 tiles) and strike it 3 times
  await ev(() => { PT.settle(200, { keepUI: true }); PT.press('down', 1, 1); return PT.settle(400); });
  const wx = d.wisp.x, wy = d.wisp.y;
  const tx = Math.floor(wx / 40), ty = Math.floor(wy / 40);
  await navTo({ stand: { feetY0: (ty - 1) * 40, feetY1: (ty + 2) * 40, cx0: (tx - 5) * 40, cx1: (tx + 5) * 40 } }, { done: async () => ev(() => { const w = G.game.room.entities.find((e) => e.type === 'wisp' && !e.dead); const p = G.game.player; return !w || Math.abs(w.x - p.x) < 260; }) });
  const w = await ev(() => {
    const wisp = () => G.game.room.entities.find((e) => e.type === 'wisp' && !e.dead);
    let i = 0, swings = 0;
    for (; i < 1800 && wisp(); i++) {
      const p = G.game.player, e = wisp();
      const dir = e.x + e.w / 2 > p.x + p.w / 2 ? 1 : -1;
      const dx = Math.abs(e.x + e.w / 2 - (p.x + p.w / 2));
      const far = dx > 60;
      const up = e.y + e.h / 2 < p.y - 30 && dx < 60;
      const atk = !far && i % 20 === 0;
      if (atk) swings++;
      G.input.setVirtual({ right: far && dir > 0, left: (far && dir < 0) || (!far && dir < 0 && p.facing > 0), up, attack: atk, jump: up && i % 40 < 12 });
      PT.step(1);
    }
    G.input.clearVirtual();
    PT.step(60);
    return { gone: !wisp(), wisp: G.game.progress.wisp, cinders: G.game.progress.cinders, frames: i, swings, emberMax: G.game.emberMax ? G.game.emberMax() : null };
  });
  log('  wisp reclaimed in ' + w.frames + ' frames (' + w.swings + ' swings): cinders ' + w.cinders + ', ember cap ' + w.emberMax);
  must(w.gone && !w.wisp && w.cinders >= d.c0, 'wisp reclaimed with the Brand, cinders returned', w);
  await ev(() => PT.settle(600));
});
step('savequit', 'save → pause menu → Quit to Title → Continue', async () => {
  const s = await ev(() => {
    const out = {};
    G.game.setFlag('pt_marker');
    out.room = G.game.room.id; out.cinders = G.game.progress.cinders;
    PT.press('pause', 1, 30);
    out.pause = PT.ui().includes('pause');
    const pz = G.UI.find('pause');
    for (let k = 0; k < 6 && pz.items[pz.sel].id !== 'quit'; k++) PT.press('down', 1, 8);
    out.sel = pz.items[pz.sel].id;
    PT.press('confirm', 1, 20);
    out.confirmUI = PT.ui();
    PT.press('left', 1, 8);
    PT.press('confirm', 1, 60);
    out.mode = G.game.mode; out.ui = PT.ui(); out.saved = G.Save.exists(0);
    PT.press('jump', 1, 50);
    const t = G.UI.find('title');
    out.items = t && t.items ? t.items.map((i) => i.id) : null;
    PT.press('confirm', 1, 40);
    PT.press('confirm', 1, 1);
    let f = 0; for (; f < 400 && !(G.game.mode === 'play' && !PT.ui().includes('title')); f++) PT.step(1);
    PT.step(60);
    out.after = { mode: G.game.mode, room: G.game.room && G.game.room.id, marker: G.game.getFlag('pt_marker'), cinders: G.game.progress.cinders, bolt: G.game.hasAbility('bolt'), resting: G.game.player.resting };
    G.debug.god(true);
    return out;
  });
  log('  pause ' + s.pause + ' sel ' + s.sel + ' → confirm ' + JSON.stringify(s.confirmUI) + ' → ' + s.mode + ' (saved ' + s.saved + ') menu ' + JSON.stringify(s.items) + ' → continue → ' + JSON.stringify(s.after));
  must(s.pause && s.sel === 'quit' && s.mode === 'title' && s.saved, 'quit to title through the pause menu', s);
  must(s.items && s.items[0] === 'continue', 'title offers Continue', s.items);
  must(s.after.mode === 'play' && s.after.room === s.room && s.after.marker && s.after.bolt && s.after.cinders === s.cinders, 'Continue restores the game at the sconce', s.after);
  await ev(() => { PT.settle(200, { keepUI: true }); PT.press('down', 1, 1); return PT.settle(400); });
});
step('effigy', 'the Effigy (gw_05)', async () => { await fightBoss('effigy'); });
step('sable1', 'Sable, first duel (mb_07)', async () => { await fightBoss('sable1'); });
step('dash', 'Molten Dash shrine (mb_06)', async () => { await takeShrine('dash'); });
step('mb_lantern', 'Meltbloom: Lanternway post + sconce', async () => { await lightLantern('meltbloom'); await rest('mb_sconce_a'); });
step('gw_lantern', 'Guttered Ways: Lanternway post', async () => { await lightLantern('guttered'); });
step('matron', 'the Soot Matron (sf_05)', async () => { await rest('sf_sconce_b'); await fightBoss('matron'); });
step('grip', 'Wax Grip shrine (sf_06)', async () => { await takeShrine('grip'); });
step('lever_sf', 'Chimney Tops lever sf_lv1 (shortcut to Lastlight)', async () => { await pullLever('sf_lv1'); });
step('oilcloak', 'Oilcloak shrine (dn_05)', async () => { await takeShrine('oilcloak'); });
step('dn_lantern', 'Drowned Nave: Lanternway post + sconce', async () => { await lightLantern('nave'); await rest('dn_sconce_a'); });
step('tallowmere', 'Abbot Tallowmere (dn_07)', async () => { await rest('dn_sconce_b'); await fightBoss('tallowmere'); });
step('plunge', 'Molten Plunge shrine (ch_04)', async () => { await lightLantern('chandlery'); await rest('ch_sconce_a'); await takeShrine('plunge'); });
step('kilnmother', 'the Kiln Mother (ch_09)', async () => { await rest('ch_sconce_b'); await fightBoss('kilnmother'); });
step('travel', 'Lanternway travel Chandlery → Nave', async () => {
  await goTo({ room: LANTERN_ROOM.chandlery, spot: 'lanternway:chandlery' });
  await travel('chandlery', 'nave');
});
step('wings', 'Smokewing shrine (mw_10)', async () => { await takeShrine('wings'); });
step('mw_lantern', 'Mothwood: Lanternway post + sconce', async () => { await lightLantern('mothwood'); await rest('mw_sconce_a'); });
step('vespertine', 'Duchess Vespertine (mw_04)', async () => { await rest('mw_sconce_b'); await fightBoss('vespertine'); });
step('lever_mw', 'Mothward Gate lever mw_lv1', async () => { await pullLever('mw_lv1'); });
step('sable2', 'Sable, second duel (ri_07)', async () => { await lightLantern('rime'); await rest('ri_sconce_b'); await fightBoss('sable2'); });
step('lever_ri', 'lever ri_lv1 (Rime chute)', async () => { await pullLever('ri_lv1'); });
step('sanctum', 'Seal Door → Heartwick Sanctum, rest at the last sconce', async () => {
  const seals = await ev(() => G.game.progress.seals.slice());
  must(seals.length >= 3, 'three Warden Seals before the Seal Door', seals);
  await rest('hs_sconce_a');
  const pr = await ev(() => JSON.parse(JSON.stringify(G.game.progress)));
  fs.writeFileSync(path.join(OUT, 'pre_lucerne_save.json'), JSON.stringify(pr));
  log('  pre-Lucerne save kept (sparks ' + pr.sparks.length + ')');
});
step('undying', 'Lucerne with < 6 sparks → ending "undying" → credits → title', async () => {
  const n = await ev(() => G.game.progress.sparks.length);
  must(n < 6, 'fewer than 6 sparks for the undying run', n);
  await fightBoss('lucerne', { dmg: 60 });
  await playEnding('undying');
});
step('postgame', 'title Continue on the finished save → rewound to before Lucerne (no manual restore)', async () => {
  // The real post-game path (QA r1 softlock fix, G.game rewindFinishedRun): the 'undying' save stays complete on the
  // slot card; Continue resumes at the last sconce rested at, with Lucerne alive again, so 'gutterlight' stays reachable.
  const pre = JSON.parse(fs.readFileSync(path.join(OUT, 'pre_lucerne_save.json'), 'utf8'));
  const s = await ev(() => {
    if (G.game.mode !== 'title') G.game.quitToTitle();
    const card = G.Save.summary(0);
    PT.step(30);
    PT.press('jump', 1, 50);
    const t = G.UI.find('title');
    const items = t && t.items ? t.items.map((i) => i.id) : null;
    PT.press('confirm', 1, 40);
    PT.press('confirm', 1, 1);
    let f = 0; for (; f < 400 && !(G.game.mode === 'play' && !PT.ui().includes('title')); f++) PT.step(1);
    PT.step(60);
    G.debug.god(true);
    const p = G.game.progress;
    return { items, card: card && { completed: card.completed, ending: card.ending }, mode: G.game.mode, room: G.game.room && G.game.room.id,
      sparks: p.sparks.length, completed: p.completed, ending: p.ending, endingsSeen: (p.endingsSeen || []).slice(),
      lucerne: !!(p.bosses && p.bosses.lucerne) || !!(p.flags && p.flags['boss:lucerne']) };
  });
  log('  post-game continue: card ' + JSON.stringify(s.card) + ', title ' + JSON.stringify(s.items) + ' → ' + s.mode + ' in ' + s.room +
    ' sparks ' + s.sparks + ' completed ' + s.completed + ' endingsSeen ' + JSON.stringify(s.endingsSeen) + ' lucerne ' + s.lucerne);
  must(s.card && s.card.completed === true && s.card.ending === 'undying', 'slot card stays complete (undying) after the ending', s.card);
  must(s.mode === 'play' && !s.completed && !s.ending, 'Continue on the finished save resumes play, not completed', s);
  must(!s.lucerne, 'Lucerne is undefeated again after Continue (true ending reachable)', s);
  must(s.endingsSeen.indexOf('undying') >= 0, 'endingsSeen records undying', s.endingsSeen);
  must(s.sparks === pre.sparks.length, 'sparks as before the fight (' + pre.sparks.length + ')', s.sparks);
  await ev(() => { PT.settle(200, { keepUI: true }); PT.press('down', 1, 1); return PT.settle(400); });
});
const SPARKS = ['spark_gw', 'spark_mb', 'spark_sf', 'spark_dn', 'spark_ch', 'spark_mw'];
for (const sp of SPARKS) step(sp, 'spark ' + sp, async () => { await pickup(sp); });
step('gutterlight', 'Lucerne with 6 sparks → ending "gutterlight" → credits → title', async () => {
  const n = await ev(() => G.game.progress.sparks.length);
  must(n === 6, 'all 6 sparks', n);
  await rest('hs_sconce_a');
  await fightBoss('lucerne', { dmg: 60 });
  await playEnding('gutterlight');
});

// =============================================================================================== main
async function checkErrors(where) {
  const errs = await ev(() => ({ dbg: PT.errors(), bad: (window.__bad || []).slice(0, 10) }));
  const con = pageErrors.slice();
  must(!con.length, 'no console errors (' + where + ')', con.slice(0, 5));
  must(!errs.dbg.length, 'no G.debug errors (' + where + ')', errs.dbg);
  must(!errs.bad.length, 'no undefined/NaN/[object/null text drawn (' + where + ')', errs.bad);
}

async function saveCheckpoint(stepId) {
  const ck = await ev(() => ({ progress: JSON.parse(JSON.stringify(G.game.progress)), room: G.game.room && G.game.room.id, mode: G.game.mode,
    motor: G.game.player ? { x: G.game.player.motor.x, y: G.game.player.motor.y } : null, frames: PT.frames }));
  ck.step = stepId; ck.wall = (Date.now() - T0) / 1000;
  fs.writeFileSync(path.join(CK, stepId + '.json'), JSON.stringify(ck));
}

async function resumeFrom(prevStep) {
  const ck = JSON.parse(fs.readFileSync(path.join(CK, prevStep + '.json'), 'utf8'));
  must(ck.room && ck.mode === 'play', 'checkpoint ' + prevStep + ' is resumable (in play)', { room: ck.room, mode: ck.mode });
  const tx = Math.floor((ck.motor.x + 14) / 40), ty = Math.floor((ck.motor.y + 70) / 40);
  ({ page, errors: pageErrors, logs: pageLogs } = await openGame({ file: FILE, query: 'test=1&paused=1&mute=1&seed=7&room=' + ck.room + '&tx=' + tx + '&ty=' + ty }));
  await page.evaluate(INJECT);
  const r = await ev((ck) => {
    G.game.progress = ck.progress;
    G.game.enterRoom(ck.room, { tx: 1, ty: 1 });
    const m = G.game.player.motor;
    m.x = ck.motor.x; m.y = ck.motor.y; m.vx = 0; m.vy = 0;
    G.game.player.x = m.x; G.game.player.y = m.y;
    G.debug.god(true);
    PT.step(2);
    return { room: G.game.room.id, x: m.x, y: m.y, sparks: G.game.progress.sparks.length };
  }, ck);
  log('resumed from checkpoint "' + prevStep + '" in ' + r.room + ' at ' + r.x.toFixed(0) + ',' + r.y.toFixed(0));
}

(async () => {
  if (FLAG('--list')) { S.forEach((s, i) => console.log(String(i).padStart(2) + ' ' + s.id.padEnd(12) + ' ' + s.desc)); return; }
  const from = arg('--from'), to = arg('--to');
  let i0 = 0, i1 = S.length - 1;
  if (from) { i0 = S.findIndex((s) => s.id === from); must(i0 >= 0, 'unknown step ' + from); }
  if (to) { i1 = S.findIndex((s) => s.id === to); must(i1 >= 0, 'unknown step ' + to); }
  log('GUTTERLIGHT playthrough: steps ' + S[i0].id + ' .. ' + S[i1].id + ' (' + (i1 - i0 + 1) + '), file ' + FILE);
  if (i0 === 0) {
    ({ page, errors: pageErrors, logs: pageLogs } = await openGame({ file: FILE, query: 'paused=1&mute=1&seed=7' }));
    await page.evaluate(INJECT);
  } else await resumeFrom(S[i0 - 1].id);
  const results = [];
  let failed = null;
  for (let i = i0; i <= i1; i++) {
    const st = S[i];
    const t = Date.now();
    const f0 = await ev(() => PT.frames);
    log('STEP ' + st.id + ' — ' + st.desc);
    try {
      await st.fn();
      await checkErrors(st.id);
      const s = await snap();
      const f1 = await ev(() => PT.frames);
      results.push({ id: st.id, ok: true, s: (Date.now() - t) / 1000, frames: f1 - f0 });
      log('  PASS ' + st.id + ' in ' + ((Date.now() - t) / 1000).toFixed(1) + ' s (' + (f1 - f0) + ' frames = ' + ((f1 - f0) / 60).toFixed(0) + ' s game time) — now in ' + s.room);
      await saveCheckpoint(st.id);
    } catch (err) {
      const s = await snap().catch(() => null);
      failed = { id: st.id, msg: err.message, stack: err instanceof Fail ? '' : err.stack };
      results.push({ id: st.id, ok: false, s: (Date.now() - t) / 1000 });
      log('  FAIL ' + st.id + ': ' + err.message + (s ? ' [room ' + s.room + ' mode ' + s.mode + (s.motor ? ' ' + nav.describeState(s.motor) : '') + ']' : ''));
      if (!(err instanceof Fail)) log(err.stack);
      try { await ev(() => G.debug.render()); await page.screenshot({ path: path.join(SHOTS, 'fail_' + st.id + '.png') }); } catch (e) { /* ignore */ }
      break;
    }
  }
  if (!failed && i0 === 0 && i1 === S.length - 1) {
    // whole-run requirements
    const bad = [];
    if (stats.travel < 1) bad.push('no Lanternway travel happened');
    if (stats.rests < 1) bad.push('no sconce rest happened');
    if (bad.length) { failed = { id: 'run', msg: bad.join('; ') }; log('FAIL run: ' + failed.msg); }
  }
  const warns = [...new Set((pageLogs || []).filter((l) => /^\[warning\]/.test(l)))];
  log('console warnings (' + warns.length + ')' + (warns.length ? ':\n    ' + warns.slice(0, 20).join('\n    ') : ''));
  const rl = await ev(() => ({ rooms: [...new Set(PT.roomLog.map((x) => x.room))], killed: PT.killed, ember: PT.emberTopUps, frames: PT.frames })).catch(() => ({}));
  const margins = stats.minMargin.slice().sort((a, b) => a.px - b.px);
  log('SUMMARY: ' + results.filter((r) => r.ok).length + '/' + results.length + ' steps passed; ' + stats.rooms + ' room exits, distinct rooms ' + (rl.rooms || []).length +
    '; macros ' + stats.macros + ' (diverged ' + stats.diverged + '), replans ' + stats.replans + ', hazards ' + stats.hazards + ', rests ' + stats.rests + ', travels ' + stats.travel +
    ', enemies killed by debug ' + rl.killed + ', ember top-ups for plunges ' + rl.ember + ', game frames ' + rl.frames + ', planning ' + (stats.planMs / 1000).toFixed(1) + ' s');
  const tight = margins.filter((m) => m.px < 8);
  log('Executed macros with a start window < 8 px (window = start positions, scanned ±16 px, that still give the same result; a human must hit it): ' + tight.length + ' of ' + margins.length +
    (tight.length ? '\n    ' + tight.slice(0, 12).map((m) => m.room + ' ' + m.px + ' px [' + m.lo + '..' + m.hi + '] at ' + m.at.slice(0, 34) + ' — ' + m.desc.slice(0, 80)).join('\n    ') : ''));
  const sfx = i0 === 0 && i1 === S.length - 1 ? '' : '_partial';   // a partial run (--from/--to) keeps the full run's files
  fs.writeFileSync(path.join(OUT, 'margins' + sfx + '.json'), JSON.stringify(margins, null, 1));
  log('nav: ' + nav.stats.plans + ' plans, analyzer cache ' + (nav.stats.hits || 0) + ' hits / ' + (nav.stats.misses || 0) + ' misses');
  if (stats.fragile.length) log('Fragile reach edges met (worked around): ' + stats.fragile.length + ' — see result.json');
  fs.writeFileSync(path.join(OUT, 'playthrough_log' + sfx + '.txt'), logLines.join('\n') + '\n');
  fs.writeFileSync(path.join(OUT, 'result' + sfx + '.json'), JSON.stringify({ results, failed, stats, rooms: rl.rooms }, null, 1));
  await closeAll();
  if (failed) { console.log('\nFAILED at step ' + failed.id + ': ' + failed.msg); process.exit(1); }
  console.log('\nALL PASS (' + results.length + ' steps)');
})().catch(async (e) => { console.error(e); try { await closeAll(); } catch (x) { /* */ } process.exit(3); });
