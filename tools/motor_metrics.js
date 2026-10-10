#!/usr/bin/env node
// Measures G.PlayerMotor in synthetic rooms and checks every TECH_SPEC §8.2 target (PASS/FAIL).
//
//   node tools/motor_metrics.js            # print metrics, exit 1 if any FAIL
//   node tools/motor_metrics.js --json     # machine-readable output
//   node tools/motor_metrics.js --write    # also store the measured values in G.PlayerMotor.METRICS (motor.js)
//   node tools/motor_metrics.js --set G_HOLD=1400 --set JUMP_V=710   # try constants (tuning)
'use strict';
const fs = require('fs');
const path = require('path');
const { loadGame, ROOT } = require('./lib/node_loader');

const args = process.argv.slice(2);
const G = loadGame({ quiet: true });
const M = G.PlayerMotor;
if (!M || !M.step) { console.error('G.PlayerMotor not loaded'); process.exit(2); }
for (let i = 0; i < args.length; i++) {
  if (args[i] === '--set') {
    const [k, v] = String(args[++i]).split('=');
    if (!(k in M.C)) { console.error('unknown motor constant ' + k); process.exit(2); }
    M.C[k] = parseFloat(v);
  }
}
const JSON_OUT = args.includes('--json');
const WRITE = args.includes('--write');

const TILE = G.CONST.TILE, DT = G.CONST.DT;
const PW = G.CONST.PLAYER_W, PH = G.CONST.PLAYER_H;
const C = M.C;

// ------------------------------------------------------------------ helpers
function grid(cols, rows) {
  const g = [];
  for (let r = 0; r < rows; r++) g.push(new Array(cols).fill('.'));
  for (let c = 0; c < cols; c++) { g[0][c] = '#'; g[rows - 1][c] = '#'; }
  for (let r = 0; r < rows; r++) { g[r][0] = '#'; g[r][cols - 1] = '#'; }
  return g;
}
function fill(g, c0, r0, c1, r1, ch) {
  for (let r = r0; r <= r1; r++) for (let c = c0; c <= c1; c++) if (g[r] && c >= 0 && c < g[r].length) g[r][c] = ch;
}
let roomSeq = 0;
function mkRoom(g) {
  return G.World.createRoom({ id: 'mm_' + (roomSeq++), region: 'test', gx: 0, gy: 0, dev: true, tiles: g.map((r) => r.join('')) }, { flags: {}, tileOnly: true });
}
const ALL = { dash: true, grip: true, wings: true, oilcloak: true, plunge: true };
// Runs `frames` steps. inputFn(f, s) → {left,right,down,jump,dash}; jumpPressed is derived from jump edges.
function sim(room, s, frames, inputFn, ab, onStep) {
  const ctx = { room, dt: DT, abilities: ab || {}, mods: {} };
  let prevJump = false;
  for (let f = 0; f < frames; f++) {
    const i = (inputFn && inputFn(f, s)) || {};
    const inp = { left: !!i.left, right: !!i.right, up: !!i.up, down: !!i.down, jump: !!i.jump,
      jumpPressed: !!i.jump && !prevJump, dashPressed: !!i.dash };
    prevJump = !!i.jump;
    M.step(s, inp, ctx);
    if (onStep && onStep(f, s) === true) return f;
  }
  return -1;
}
function standAt(room, x, floorRow) {
  const s = M.create(x, floorRow * TILE - PH);
  sim(room, s, 2, null, {});
  return s;
}
const tiles = (px) => px / TILE;
const r2 = (v) => Math.round(v * 100) / 100;

const results = [];
function check(name, value, ok, target, unit) {
  results.push({ name, value, ok: !!ok, target, unit: unit || '' });
}

// ------------------------------------------------------------------ 1. run
function flatRoom(cols) {
  const g = grid(cols || 96, 18);
  fill(g, 0, 16, g[0].length - 1, 17, '#');
  return mkRoom(g);
}
{
  const room = flatRoom(64);
  const s = standAt(room, 200, 16);
  let reach = -1;
  sim(room, s, 40, () => ({ right: true }), {}, (f, st) => { if (reach < 0 && st.vx >= C.RUN - 0.01) reach = f; });
  const x0 = s.x;
  sim(room, s, 30, () => ({ right: true }), {});
  const speed = (s.x - x0) / (30 * DT);
  let stop = -1;
  sim(room, s, 20, () => ({}), {}, (f, st) => { if (stop < 0 && st.vx === 0) stop = f; });
  const reachT = (reach + 1) * DT, stopT = (stop + 1) * DT;
  check('run speed (px/s)', r2(speed), Math.abs(speed - 330) < 0.5, '330');
  check('time to full run speed (s)', r2(reachT), reachT <= 0.05 + 1e-9, '<= 0.05');
  check('time to stop (s)', r2(stopT), stopT <= 0.05 + 1e-9, '<= 0.05');
}

// ------------------------------------------------------------------ 2. jump apex & short hop
function jumpRise(holdFrames, ab) {
  const room = flatRoom(64);
  const s = standAt(room, 600, 16);
  const y0 = s.y;
  let minY = s.y;
  sim(room, s, 120, (f) => ({ jump: f < holdFrames }), ab || {}, (f, st) => { minY = Math.min(minY, st.y); });
  return tiles(y0 - minY);
}
const apex = jumpRise(1000);
check('full jump apex (tiles)', r2(apex), apex >= 4.4 && apex <= 4.8, '4.4-4.8');
const hop1 = jumpRise(1), hop3 = jumpRise(3), hop5 = jumpRise(5);
check('short hop, 1-frame tap (tiles)', r2(hop1), hop1 <= 1.6, '<= 1.6');
check('short hop, 3-frame tap (tiles)', r2(hop3), hop3 <= 1.6, '<= 1.6');
check('short hop, 5-frame tap (tiles, info)', r2(hop5), true, 'info');

// ------------------------------------------------------------------ 3. running jump distance
let jumpDist = 0;
{
  const room = flatRoom(96);
  const s = standAt(room, 120, 16);
  let takeoffX = null, landX = null, airborne = false;
  sim(room, s, 200, (f) => ({ right: true, jump: f >= 20 }), {}, (f, st) => {
    if (!airborne && !st.onGround && f >= 20) { airborne = true; takeoffX = st.x - st.vx * DT; }
    if (airborne && st.onGround) { landX = st.x; return true; }
  });
  jumpDist = tiles(landX - takeoffX);
  check('running full-jump distance, flat (tiles)', r2(jumpDist), jumpDist >= 7.2 && jumpDist <= 8.2, '7.2-8.2');
}

// ------------------------------------------------------------------ 4. gap crossing (exhaustive timing search)
// Gap crossing: run at full speed toward a ledge edge at x = 60*TILE; the far ledge starts at farX (any px,
// realised as a solid rect so sub-tile gaps can be measured). Exhaustive over jump frame (incl. coyote),
// dash frame (ground dash before / air dash any time) and sub-frame start alignment.
const OFFSETS = [0, 1.1, 2.2, 3.3, 4.4];
function crossRoom(gapPx) {
  const g = grid(200, 20);
  fill(g, 0, 12, 59, 19, '#');
  fill(g, 0, 17, 199, 19, '#');
  const room = mkRoom(g);
  const farX = 60 * TILE + gapPx, topY = 12 * TILE;
  room.solids.push({ x: farX, y: topY, w: 200 * TILE, h: 5 * TILE });
  return { room, farX, topY };
}
function canCrossPx(gapPx, ab, offsets) {
  const { room, farX, topY } = crossRoom(gapPx);
  const edgeFrame = Math.round(520 / (C.RUN * DT));
  const dashFrames = [null];
  if (ab.dash) for (let d = -20; d <= 60; d++) dashFrames.push(d);
  for (const off of offsets || OFFSETS) {
    const start = standAt(room, 60 * TILE - 520 + off, 12);
    for (let jf = edgeFrame - 30; jf <= edgeFrame + 12; jf++) {
      for (const df of dashFrames) {
        const s = M.clone(start);
        let ok = false;
        sim(room, s, 240, (f) => ({ right: true, jump: f >= jf, dash: df !== null && f === jf + df }), ab, (f, st) => {
          if (st.onGround && Math.abs(st.y + st.h - topY) < 0.01 && st.x + st.w > farX) { ok = true; return true; }
          // below the ledge top, short of it, falling, no coyote left: nothing can lift the body again
          if (st.y + st.h > topY + 2 && st.x + st.w <= farX && st.vy > 0 && st.coyote <= 0 && st.dashTime <= 0) return true;
        });
        if (ok) return { ok: true, off, jf, df };
      }
    }
  }
  return { ok: false };
}
const canCross = (gapTiles, ab) => canCrossPx(gapTiles * TILE, ab);
function maxCrossPx(ab, lo, hi) {
  while (hi - lo > 1) { const mid = (lo + hi) >> 1; if (canCrossPx(mid, ab).ok) lo = mid; else hi = mid; }
  return lo;
}
const gap6 = canCross(6, {}).ok;
check('6-tile gap crossable without dash', gap6, gap6, 'true');
const gap9nd = canCross(9, {}).ok;
check('9-tile gap NOT crossable without dash', !gap9nd, !gap9nd, 'true');
const crossPxNoDash = maxCrossPx({}, 240, 400);
const maxGapNoDash = Math.floor(crossPxNoDash / TILE);
check('max gap without dash (px; 9 tiles = 360)', crossPxNoDash + ' (' + r2(crossPxNoDash / TILE) + ' t)', crossPxNoDash >= 240 && crossPxNoDash < 360, '>= 240 and < 360');

// ------------------------------------------------------------------ 5. dash
let dashDist = 0, dashTime = 0;
{
  const room = flatRoom(96);
  const s = standAt(room, 400, 16);
  const x0 = s.x;
  let frames = 0;
  sim(room, s, 40, (f) => ({ dash: f === 0 }), { dash: true }, (f, st) => { if (st.dashTime > 0 || (f > 0 && frames === f)) frames++; });
  dashDist = tiles(s.x - x0);
  dashTime = C.DASH_T;
  check('flare dash distance (tiles)', r2(dashDist), Math.abs(dashDist - 3.375) < 0.05, '~3.4 (750 px/s x 0.18 s)');
  // air dash: no gravity
  const g = grid(64, 30);
  fill(g, 0, 28, 63, 29, '#');
  const air = mkRoom(g);
  const a = M.create(400, 200);
  let yDuring = [], vxs = [];
  sim(air, a, 12, (f) => ({ dash: f === 0 }), { dash: true }, (f, st) => { if (st.dashTime > 0) { yDuring.push(st.y); vxs.push(st.vx); } });
  const flat = yDuring.length > 0 && yDuring.every((y) => Math.abs(y - yDuring[0]) < 1e-6);
  check('dash: no gravity during dash', flat, flat, 'true');
  check('dash speed (px/s)', vxs[0], vxs[0] === 750, '750');
  // cooldown & one air dash per airtime
  const b = M.create(400, 200);
  let dashes = 0;
  sim(air, b, 60, (f) => ({ dash: f === 0 || f === 30 || f === 50 }), { dash: true }, (f, st) => { if (st.events.includes('dash')) dashes++; });
  check('only 1 air dash per airtime', dashes, dashes === 1, '1');
  const c = standAt(room, 400, 16);
  let cdFrames = -1, first = -1;
  sim(room, c, 60, (f) => ({ dash: f === 0 || (first >= 0 && f > first) }), { dash: true }, (f, st) => {
    if (st.events.includes('dash')) { if (first < 0) first = f; else if (cdFrames < 0) cdFrames = f - first; }
  });
  check('dash cooldown (s)', r2(cdFrames * DT), Math.abs(cdFrames * DT - 0.4) <= DT + 1e-9, '0.4');
}
const gap9 = canCross(9, { dash: true });
check('9-tile gap crossable with dash + jump', gap9.ok, gap9.ok, 'true');
const gap12 = canCross(12, { dash: true });
check('12-tile gap NOT crossable with dash + jump', !gap12.ok, !gap12.ok, 'true');
const crossPxDash = maxCrossPx({ dash: true }, 360, 560);
const maxGapDash = Math.floor(crossPxDash / TILE);
check('max gap with dash + jump (px; 12 tiles = 480)', crossPxDash + ' (' + r2(crossPxDash / TILE) + ' t)', crossPxDash >= 360 && crossPxDash < 480, '>= 360 and < 480');

// ------------------------------------------------------------------ 6. ledges (no abilities / wings / dash)
function ledgeRoom(h) {
  const g = grid(64, 30);
  fill(g, 0, 28, 63, 29, '#');
  fill(g, 30, 28 - h, 40, 29, '#');
  return { room: mkRoom(g), topY: (28 - h) * TILE, wallX: 30 * TILE };
}
function canClimb(h, ab) {
  const { room, topY, wallX } = ledgeRoom(h);
  for (const back of [2, 20, 60, 120, 200]) {
    for (const djDelay of ab.wings ? [0, 2, 4, 6, 8, 10, 12, 16] : [null]) {
      const s = standAt(room, wallX - PW - back, 28);
      let ok = false, phase = 0, apexF = -1;
      sim(room, s, 240, (f, st) => {
        // jump; with wings: release then press again near the apex (+delay frames)
        if (djDelay === null) return { right: true, jump: true };
        if (phase === 0 && st.vy >= -60 && f > 3) { phase = 1; apexF = f; }
        const jump = phase === 0 ? true : (f >= apexF + djDelay + 1);
        return { right: true, jump };
      }, ab, (f, st) => {
        if (st.onGround && Math.abs(st.y + st.h - topY) < 0.01) { ok = true; return true; }
      });
      if (ok) return true;
    }
  }
  return false;
}
const ledge4 = canClimb(4, {});
check('4-tile ledge reachable (no abilities)', ledge4, ledge4, 'true');
let maxLedge = 0;
for (let h = 1; h <= 8; h++) if (canClimb(h, {})) maxLedge = h;
check('max ledge without abilities (tiles)', maxLedge, maxLedge === 4, '4 (5+ impossible)');
const ledge6dash = canClimb(6, { dash: true });
check('6-tile ledge NOT reachable without wings (even with dash)', !ledge6dash, !ledge6dash, 'true');
const wingsApex = (() => {
  const room = flatRoom(64);
  const s = standAt(room, 600, 16);
  const y0 = s.y;
  let minY = s.y, phase = 0, at = 0;
  sim(room, s, 160, (f, st) => {
    if (phase === 0 && f > 3 && st.vy >= 0) { phase = 1; at = f; }
    return { jump: phase === 0 || f > at };
  }, { wings: true }, (f, st) => { minY = Math.min(minY, st.y); });
  return tiles(y0 - minY);
})();
const wingsExtra = wingsApex - apex;
check('smokewing extra height (tiles)', r2(wingsExtra), wingsExtra >= 3.2 && wingsExtra <= 3.8, '3.2-3.8');
const ledge7w = canClimb(7, { wings: true });
check('7-tile ledge reachable with wings', ledge7w, ledge7w, 'true');

// ------------------------------------------------------------------ 7. falling & walls
{
  const g = grid(32, 60);
  fill(g, 0, 58, 31, 59, '#');
  const room = mkRoom(g);
  const s = M.create(400, 80);
  let maxVy = 0;
  sim(room, s, 120, null, {}, (f, st) => { maxVy = Math.max(maxVy, st.vy); });
  check('max fall speed (px/s)', maxVy, maxVy === 960, '960');
}
let climb = null, wallSlide = 0, wjPush = 0;
{
  // single sheer wall: x = 20*TILE, 20 tiles high, nothing to the left
  const g = grid(48, 45);
  fill(g, 0, 43, 47, 44, '#');
  fill(g, 20, 23, 47, 44, '#');
  const room = mkRoom(g);
  const topY = 23 * TILE;
  // wall slide
  const s = M.create(20 * TILE - PW - 4, 30 * TILE);
  s.vy = 300;
  const ys = [];
  sim(room, s, 40, () => ({ right: true }), { grip: true }, (f, st) => { if (st.wall) ys.push(st.y); });
  wallSlide = ys.length > 10 ? (ys[ys.length - 1] - ys[5]) / ((ys.length - 6) * DT) : 0;
  check('wall slide speed (px/s)', r2(wallSlide), Math.abs(wallSlide - 160) < 1, '160');
  // single-wall wall-jump climb
  const c = M.create(20 * TILE - PW - 60, 43 * TILE - PH);
  sim(room, c, 2, null, { grip: true });
  let wallJumps = 0, prevJump = false, reached = -1, pushFrames = 0, counting = false;
  sim(room, c, 900, (f, st) => {
    let jump = true;
    if (st.wall && prevJump) jump = false;   // release for one frame on grip, then press again
    prevJump = jump;
    return { right: true, jump };
  }, { grip: true }, (f, st) => {
    if (st.events.includes('walljump')) { wallJumps++; counting = true; pushFrames = 0; }
    if (counting) { if (st.vx < 0 && st.wallJumpLock >= 0 && st.vx === -C.RUN) pushFrames++; else if (st.vx >= 0) { counting = false; wjPush = Math.max(wjPush, pushFrames); } }
    if (st.onGround && Math.abs(st.y + st.h - topY) < 0.01) { reached = f; return true; }
  });
  climb = { ok: reached >= 0, time: r2((reached + 1) * DT), wallJumps };
  check('single-wall wall-jump climb (20 tiles)', climb.ok ? climb.time + ' s, ' + wallJumps + ' wall-jumps' : 'failed', climb.ok, 'reach top');
  check('wall-jump forced push (s at 330 px/s)', r2(wjPush * DT), Math.abs(wjPush * DT - 0.14) <= DT + 1e-9, '0.14');
  // grip refreshes dash
  const d = M.create(20 * TILE - PW - 4, 30 * TILE);
  d.airDashUsed = true;
  sim(room, d, 10, () => ({ right: true }), { grip: true, dash: true });
  check('wall grip refreshes air dash', !d.airDashUsed, !d.airDashUsed, 'true');
}
{
  // glazed wall: never grippable
  const g = grid(48, 45);
  fill(g, 0, 43, 47, 44, '#');
  fill(g, 20, 10, 47, 42, 'X');
  const room = mkRoom(g);
  const s = M.create(20 * TILE - PW - 4, 20 * TILE);
  let gripped = false;
  sim(room, s, 60, () => ({ right: true, jump: true }), { grip: true }, (f, st) => { if (st.wall) gripped = true; });
  check('glazed (X) wall not grippable', !gripped, !gripped, 'true');
  // noGrip solid entity
  const g2 = grid(48, 45);
  fill(g2, 0, 43, 47, 44, '#');
  const room2 = mkRoom(g2);
  room2.solids.push({ x: 20 * TILE, y: 10 * TILE, w: TILE, h: 30 * TILE, noGrip: true });
  const s2 = M.create(20 * TILE - PW - 4, 20 * TILE);
  let gripped2 = false;
  sim(room2, s2, 60, () => ({ right: true }), { grip: true }, (f, st) => { if (st.wall) gripped2 = true; });
  check('noGrip solid entity not grippable', !gripped2, !gripped2, 'true');
  room2.solids[0].noGrip = false;
  const s3 = M.create(20 * TILE - PW - 4, 20 * TILE);
  let gripped3 = false;
  sim(room2, s3, 60, () => ({ right: true }), { grip: true }, (f, st) => { if (st.wall) gripped3 = true; });
  check('solid entity grippable by default', gripped3, gripped3, 'true');
}

// ------------------------------------------------------------------ 8. coyote & buffer
let coyoteFrames = 0, bufferFrames = 0;
{
  const g = grid(64, 30);
  fill(g, 0, 16, 30, 29, '#');
  fill(g, 0, 28, 63, 29, '#');
  const room = mkRoom(g);
  for (let k = 1; k <= 10; k++) {
    const s = standAt(room, 31 * TILE - 200, 16);
    let left = -1, jumped = false;
    sim(room, s, 80, (f, st) => ({ right: true, jump: left >= 0 && f === left + k }), {}, (f, st) => {
      if (left < 0 && !st.onGround) left = f;
      if (st.events.includes('jump')) jumped = true;
    });
    if (jumped) coyoteFrames = k; else break;
  }
  check('coyote time (s)', r2(coyoteFrames * DT), coyoteFrames * DT >= 0.06 && coyoteFrames * DT <= 0.09, '0.08');
  for (let k = 0; k <= 12; k++) {
    // fall onto flat ground; press jump k frames before the landing frame
    const probe = M.create(40 * TILE, 18 * TILE);
    let landF = -1;
    sim(room, probe, 120, null, {}, (f, st) => { if (st.onGround) { landF = f; return true; } });
    const s = M.create(40 * TILE, 18 * TILE);
    let jumped = false;
    sim(room, s, 140, (f) => ({ jump: f >= landF - k && f <= landF - k + 30 }), {}, (f, st) => { if (st.events.includes('jump')) jumped = true; });
    if (jumped) bufferFrames = k; else break;
  }
  check('jump buffer (s)', r2(bufferFrames * DT), bufferFrames * DT >= 0.1 && bufferFrames * DT <= 0.13, '0.12');
}

// ------------------------------------------------------------------ 9. exit-up boost
let exitRise = 0;
{
  const g = grid(32, 40);
  fill(g, 0, 38, 31, 39, '#');
  const room = mkRoom(g);
  const s = M.create(400, 30 * TILE);
  M.exitUpBoost(s);
  const y0 = s.y;
  let minY = s.y;
  sim(room, s, 60, null, {}, (f, st) => { minY = Math.min(minY, st.y); });
  exitRise = tiles(y0 - minY);
  check('upward exit boost rise (tiles)', r2(exitRise), exitRise >= 2.8 && exitRise <= 3.6, '~3');
}

// ------------------------------------------------------------------ 10. swimming & hazards
let floatAbove = 0, swimRatio = 0;
{
  const g = grid(64, 18);
  fill(g, 0, 10, 63, 17, '#');
  fill(g, 10, 10, 40, 14, '~');    // pool surface at y = 400, 5 deep
  fill(g, 44, 10, 48, 10, '%');    // lava strip
  fill(g, 52, 10, 54, 10, '^');    // spikes in the floor
  const room = mkRoom(g);
  const surface = 10 * TILE;
  const s = M.create(20 * TILE, 4 * TILE);
  sim(room, s, 240, null, { oilcloak: true });
  floatAbove = (surface - s.y) / PH;
  check('swim: body fraction above surface', r2(floatAbove), floatAbove >= 0.55 && floatAbove <= 0.65, '~0.6');
  const x0 = s.x;
  sim(room, s, 30, () => ({ right: true }), { oilcloak: true });
  swimRatio = (s.x - x0) / (30 * DT) / C.RUN;
  check('swim speed (x run speed)', r2(swimRatio), Math.abs(swimRatio - 0.65) < 0.01, '0.65');
  let maxRise = 0;
  const ys = s.y;
  sim(room, s, 60, (f) => ({ jump: f < 40 }), { oilcloak: true }, (f, st) => { maxRise = Math.max(maxRise, ys - st.y); });
  check('swim: can jump out (rise, tiles)', r2(tiles(maxRise)), tiles(maxRise) > 2, '> 2');
  // swim to the rim and climb out
  const t = M.create(30 * TILE, 4 * TILE);
  sim(room, t, 180, null, { oilcloak: true });
  let out = false;
  sim(room, t, 240, () => ({ right: true }), { oilcloak: true }, (f, st) => { if (st.onGround && st.x > 41 * TILE) { out = true; return true; } });
  check('swim: walk out onto a flush rim', out, out, 'true');
  // hazards
  const h = M.create(20 * TILE, 4 * TILE);
  sim(room, h, 120, null, {}, (f, st) => { if (st.hazard) return true; });
  check('meltwater without oilcloak = hazard', h.hazard, h.hazard === 'water', 'water');
  const l = standAt(room, 42 * TILE, 10);
  sim(room, l, 120, () => ({ right: true }), {}, (f, st) => { if (st.hazard) return true; });
  check('lava = hazard', l.hazard, l.hazard === 'lava', 'lava');
  const k = standAt(room, 50 * TILE, 10);
  sim(room, k, 120, () => ({ right: true }), {}, (f, st) => { if (st.hazard) return true; });
  check('spikes = hazard', k.hazard, k.hazard === 'spikes', 'spikes');
  const safe = k.lastSafe;
  const safeOk = safe && safe.x + PW <= 51 * TILE && !k.onGround === false || (safe && safe.x + PW <= 51 * TILE);
  check('lastSafe is >= 1 tile from the hazard', r2(tiles(52 * TILE - (safe.x + PW))), safeOk, '>= 1');
}

// ------------------------------------------------------------------ 11. plunge & drop-through
{
  const g = grid(32, 36);
  fill(g, 0, 34, 31, 35, '#');
  fill(g, 0, 18, 31, 18, '#');
  fill(g, 10, 18, 20, 18, 'D');
  const room = mkRoom(g);
  const s = M.create(14 * TILE, 8 * TILE);
  sim(room, s, 3, null, { plunge: true });
  M.startPlunge(s);
  let maxV = 0, broke = false, landed = false, landY = 0;
  sim(room, s, 120, null, { plunge: true }, (f, st) => {
    maxV = Math.max(maxV, st.vy);
    if (st.events.includes('plungeBreak')) broke = true;
    if (st.events.includes('plungeLand')) { landed = true; landY = st.y + st.h; return true; }
  });
  check('plunge speed (px/s)', maxV, maxV === 1400, '1400');
  check('plunge breaks D floor and continues', broke, broke, 'true');
  check('plunge ends on ground with plungeLand', landed && landY === 34 * TILE, landed && landY === 34 * TILE, 'true');
  const g2 = grid(32, 18);
  fill(g2, 0, 16, 31, 17, '#');
  fill(g2, 5, 12, 20, 12, '=');
  const room2 = mkRoom(g2);
  const p = standAt(room2, 10 * TILE, 12);
  const onPlat = p.onGround;
  sim(room2, p, 40, (f) => ({ down: true, jump: f === 2 }), {});
  const dropped = onPlat && p.y + p.h === 16 * TILE;
  check('down + jump drops through one-way platform', dropped, dropped, 'true');
  const q = standAt(room2, 10 * TILE, 16);
  let landedOn = 0;
  sim(room2, q, 90, (f) => ({ jump: f < 40 }), {}, (f, st) => { if (st.onGround && f > 5) { landedOn = st.y + st.h; return true; } });
  check('jump up through platform and land on it', landedOn === 12 * TILE, landedOn === 12 * TILE, 'true');
}

// ------------------------------------------------------------------ report
const METRICS = {
  runSpeed: 330 / TILE,
  jumpApex: r2(apex), shortHop: r2(hop1), shortHop3: r2(hop3), jumpDistance: r2(jumpDist),
  maxLedge, maxLedgeWings: ledge7w ? 7 : 0, wingsExtra: r2(wingsExtra),
  maxGapNoDash, maxGapDash, maxGapNoDashPx: crossPxNoDash, maxGapDashPx: crossPxDash,
  dashDistance: r2(dashDist), dashTime: dashTime, dashSpeed: C.DASH_V / TILE,
  maxFall: C.MAX_FALL / TILE, wallSlide: r2(wallSlide / TILE), wallJumpPush: r2(wjPush * DT),
  wallClimbSeconds20: climb && climb.ok ? climb.time : null,
  coyote: r2(coyoteFrames * DT), buffer: r2(bufferFrames * DT),
  exitUpRise: r2(exitRise), swimFloatAbove: r2(floatAbove), swimSpeedRatio: r2(swimRatio),
  plungeSpeed: C.PLUNGE_V / TILE,
};

const failed = results.filter((r) => !r.ok);
if (JSON_OUT) {
  console.log(JSON.stringify({ results, METRICS, failed: failed.length }, null, 2));
} else {
  console.log('GUTTERLIGHT motor metrics (TILE = ' + TILE + ' px, 60 Hz)\n');
  for (const r of results) {
    console.log((r.ok ? 'PASS' : 'FAIL') + '  ' + r.name.padEnd(52) + String(r.value).padEnd(26) + 'target ' + r.target);
  }
  console.log('\n' + (failed.length ? failed.length + ' FAILED' : 'ALL PASS') + ' (' + results.length + ' checks)');
  console.log('METRICS = ' + JSON.stringify(METRICS));
}
if (WRITE && !failed.length) {
  const file = path.join(ROOT, 'src/player/motor.js');
  const src = fs.readFileSync(file, 'utf8');
  const re = /METRICS: \/\*BEGIN\*\/[\s\S]*?\/\*END\*\//;
  if (!re.test(src)) { console.error('motor.js: METRICS markers not found'); process.exit(1); }
  fs.writeFileSync(file, src.replace(re, 'METRICS: /*BEGIN*/' + JSON.stringify(METRICS) + '/*END*/'));
  console.log('wrote METRICS to src/player/motor.js');
}
process.exit(failed.length ? 1 : 0);
