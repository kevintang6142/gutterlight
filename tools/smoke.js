#!/usr/bin/env node
// tools/smoke.js — headless end-to-end smoke test (Playwright via tools/lib/browser.js).
//
//   1. boot (no test param) → title → keys → new game → intro → verify mode 'play' in a room
//   2. save → reload → title → Continue → verify the saved progress came back (save/continue round trip)
//   3. ?test=1&paused=1: teleport into EVERY non-dev room (dev rooms when no region room exists yet) at a safe
//      spot (sconce, start, else just inside an exit on solid ground), step 90 frames, screenshot to
//      test-output/rooms/<id>.png, collect errors per room, time G.debug.step(120) + renders, flag slow rooms
//   Summary table; exit 1 on any error (console errors, page errors, G.debug.errors, failed flow steps).
//
//   node tools/smoke.js                 everything
//   node tools/smoke.js --rooms-only    skip the title/save flows       --flow-only   skip the room tour
//   node tools/smoke.js --room gw_03    tour only these rooms (comma list ok)
//   node tools/smoke.js --dev           tour dev rooms too               --no-shots    no screenshots
//   node tools/smoke.js --file dist/Gutterlight.html                    smoke-test the single-file build
//   node tools/smoke.js --slow-update 4 --slow-render 25                 thresholds (ms) for the "slow" flag
'use strict';
const fs = require('fs');
const path = require('path');
const { openGame, closeAll, ROOT } = require('./lib/browser');

function parseArgs(argv) {
  const a = { flow: true, rooms: true, only: [], dev: false, shots: true, file: 'index.html', slowUpdate: 4, slowRender: 25, frames: 90 };
  for (let i = 2; i < argv.length; i++) {
    const k = argv[i];
    const v = () => argv[++i];
    if (k === '--rooms-only') a.flow = false;
    else if (k === '--flow-only') a.rooms = false;
    else if (k === '--room') a.only.push(...v().split(','));
    else if (k === '--dev') a.dev = true;
    else if (k === '--no-shots') a.shots = false;
    else if (k === '--file') a.file = v();
    else if (k === '--slow-update') a.slowUpdate = +v();
    else if (k === '--slow-render') a.slowRender = +v();
    else if (k === '--frames') a.frames = Math.max(1, parseInt(v(), 10) || 90);
    else if (k === '--help' || k === '-h') a.help = true;
    else { console.error('smoke: unknown argument ' + k); process.exit(2); }
  }
  return a;
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const short = (e) => String(e).split('\n')[0].slice(0, 300);

// ------------------------------------------------------------------------------------------------ flows
// Press confirm until the game is in play mode with no blocking UI (title gate → menu → slot → intro).
async function pressUntilPlay(page, log, timeoutMs) {
  const t0 = Date.now();
  const seen = [];
  while (Date.now() - t0 < timeoutMs) {
    const st = await page.evaluate(() => ({
      mode: G.game && G.game.mode, room: G.game && G.game.room ? G.game.room.id : null,
      ui: G.UI && G.UI.screenNames ? G.UI.screenNames() : [], blocking: !!(G.UI && G.UI.isBlocking && G.UI.isBlocking()),
    }));
    const tag = st.mode + ':' + st.ui.join('>');
    if (seen[seen.length - 1] !== tag) { seen.push(tag); log('    ' + tag); }
    if (st.mode === 'play' && st.room && !st.blocking) return { ok: true, state: st, seen };
    await page.keyboard.press('Enter');
    await sleep(350);
  }
  return { ok: false, seen };
}

async function flowNewGame(A, log) {
  const res = { name: 'title → new game → play', ok: false, errors: [], notes: [] };
  const { page, errors, context } = await openGame({ file: A.file, query: 'mute=1' });
  try {
    await sleep(500);
    const mode0 = await page.evaluate(() => G.game && G.game.mode);
    if (mode0 !== 'title') res.errors.push('after boot the mode is "' + mode0 + '" (expected "title")');
    const r = await pressUntilPlay(page, log, 30000);
    if (!r.ok) res.errors.push('never reached play mode (screens seen: ' + r.seen.join(' | ') + ')');
    else {
      res.notes.push('play in ' + r.state.room);
      // play a little with real input
      await page.keyboard.down('ArrowRight'); await sleep(400); await page.keyboard.up('ArrowRight');
      await page.keyboard.press('z'); await sleep(400);
      const st = await page.evaluate(() => G.debug && G.debug.state ? G.debug.state() : { mode: G.game.mode });
      if (st.mode !== 'play') res.errors.push('mode changed to "' + st.mode + '" after walking/jumping');
      const errs = await page.evaluate(() => (G.debug && G.debug.errors ? G.debug.errors.slice() : []));
      res.errors.push(...errs.map((e) => 'G.debug.errors: ' + short(e)));
      if (A.shots) { fs.mkdirSync(path.join(ROOT, 'test-output', 'rooms'), { recursive: true }); await page.screenshot({ path: path.join(ROOT, 'test-output', 'rooms', '_newgame.png') }); }
    }
    res.ok = !res.errors.length && !errors.length;
    return { res, page, errors, context };
  } catch (e) {
    res.errors.push('exception: ' + short(e.stack || e));
    return { res, page, errors, context };
  } finally {
    res.errors.push(...errors.map(short));
    res.ok = !res.errors.length;
  }
}

async function flowSaveContinue(A, prev, log) {
  const res = { name: 'save → reload → continue', ok: false, errors: [], notes: [] };
  if (!prev || !prev.res.ok) { res.errors.push('skipped: the new-game flow failed'); return res; }
  const { page, context } = prev;
  const errors = [];
  page.on('pageerror', (err) => errors.push('[pageerror] ' + err.message));
  page.on('console', (m) => { if (m.type() === 'error') errors.push('[console] ' + m.text()); });
  try {
    const before = await page.evaluate(() => {
      G.game.setFlag('smoke_marker', 4242);
      G.game.addCinders(123);
      G.game.saveNow();
      return { cinders: G.game.progress.cinders, slot: G.game.progress.slot, room: G.game.room.id };
    });
    res.notes.push('saved slot ' + before.slot + ' with ' + before.cinders + ' cinders in ' + before.room);
    await page.reload();
    await page.waitForFunction('window.G && G.ready', null, { timeout: 15000 });
    await sleep(400);
    const r = await pressUntilPlay(page, log, 30000);
    if (!r.ok) { res.errors.push('never reached play mode after reload (screens: ' + r.seen.join(' | ') + ')'); return res; }
    const after = await page.evaluate(() => ({ flag: G.game.getFlag('smoke_marker'), cinders: G.game.progress.cinders, slot: G.game.progress.slot, room: G.game.room.id }));
    if (after.flag !== 4242) res.errors.push('flag smoke_marker not restored (got ' + JSON.stringify(after.flag) + ') — did the title start a NEW game instead of Continue?');
    if (after.cinders !== before.cinders) res.errors.push('cinders ' + after.cinders + ' after continue, expected ' + before.cinders);
    res.notes.push('continued in ' + after.room + ' (slot ' + after.slot + ')');
  } catch (e) {
    res.errors.push('exception: ' + short(e.stack || e));
  } finally {
    res.errors.push(...errors.map(short));
    res.ok = !res.errors.length;
    await context.close().catch(() => {});
  }
  return res;
}

// ------------------------------------------------------------------------------------------------ room tour
// In-page: choose a safe standing tile (sconce, start, else just inside an exit / any floor away from hazards).
function pickSpot(id) {
  /* eslint-disable no-undef */
  const def = G.World.getRoom(id);
  const room = G.World.createRoom(def, { tileOnly: true });
  const T = G.T;
  const at = (c, r) => (c < 0 || r < 0 || c >= room.cols || r >= room.rows ? T.SOLID : room.tiles[r * room.cols + c]);
  const solid = (k) => k === T.SOLID || k === T.GLAZED || k === T.BREAKABLE || k === T.DIVEFLOOR || k === T.PLATFORM;
  const free = (k) => k === T.EMPTY || k === T.BGWALL;
  const hazardNear = (c, r) => { for (let y = r - 2; y <= r + 2; y++) for (let x = c - 2; x <= c + 2; x++) { const k = at(x, y); if (k === T.SPIKES || k === T.LAVA || k === T.WATER) return true; } return false; };
  const standable = (c, r) => free(at(c, r)) && free(at(c, r - 1)) && solid(at(c, r + 1)) && !hazardNear(c, r);
  const specs = G.World.entitySpecsOf(def) || [];
  for (const type of ['sconce', 'start', 'lanternway']) {
    const s = specs.find((x) => x.props && x.props.type === type);
    if (s) for (const dx of [-1, 1, -2, 2, 0]) if (standable(s.tx + dx, s.ty)) return { tx: s.tx + dx, ty: s.ty, why: type };
  }
  for (const o of room.openings) {
    if (o.side === 'W' || o.side === 'E') {
      for (let i = 1; i < 6; i++) {
        const c = o.side === 'W' ? i : room.cols - 1 - i;
        if (standable(c, o.pos + o.size - 1)) return { tx: c, ty: o.pos + o.size - 1, why: 'exit ' + o.side };
      }
    }
  }
  if (def.spawn) return { tx: def.spawn.tx, ty: def.spawn.ty, why: 'spawn' };
  for (let r = room.rows - 2; r > 0; r--) for (let c = 1; c < room.cols - 1; c++) if (standable(c, r)) return { tx: c, ty: r, why: 'floor scan' };
  return { tx: Math.floor(room.cols / 2), ty: Math.floor(room.rows / 2), why: 'centre (no floor found)' };
  /* eslint-enable no-undef */
}

async function roomTour(A, log) {
  const out = [];
  const { page, errors, context } = await openGame({ file: A.file, query: 'test=1&paused=1&mute=1' });
  try {
    let ids = await page.evaluate(() => G.World.listRooms({ dev: false }));
    let devFallback = false;
    if (A.dev) ids = ids.concat(await page.evaluate(() => G.World.listRooms({ dev: true })));
    if (!ids.length) { ids = await page.evaluate(() => G.World.listRooms({ dev: true })); devFallback = true; }
    if (A.only.length) ids = A.only;
    if (devFallback) log('  (no region rooms defined yet: touring the dev rooms)');
    if (A.shots) fs.mkdirSync(path.join(ROOT, 'test-output', 'rooms'), { recursive: true });
    await page.evaluate(() => { G.debug.god(true); });
    for (const id of ids) {
      const row = { id, ok: true, errors: [], spot: null, updMs: null, renderMs: null, end: null };
      const e0 = errors.length;
      try {
        const g0 = await page.evaluate(() => G.debug.errors.length);
        row.spot = await page.evaluate(pickSpot.toString().replace(/^function pickSpot/, '(function') + ')(' + JSON.stringify(id) + ')');
        const tp = await page.evaluate(([rid, s]) => G.debug.teleport(rid, s.tx, s.ty), [id, row.spot]);
        if (tp === false) row.errors.push('teleport failed');
        const st = await page.evaluate((n) => { G.debug.step(n); return G.debug.state(); }, A.frames);
        if (st.room !== id) row.errors.push('after ' + A.frames + ' frames the player is in ' + st.room + ' (left the room or never entered it)');
        if (st.mode !== 'play' && st.mode !== 'transition') row.errors.push('mode is "' + st.mode + '" after ' + A.frames + ' frames');
        if (st.player && st.player.hazard) row.errors.push('player touched a hazard at the safe spot (' + st.player.hazard + ')');
        if (A.shots) await page.screenshot({ path: path.join(ROOT, 'test-output', 'rooms', id + '.png') });
        const perf = await page.evaluate(() => {
          const t0 = performance.now();
          G.debug.step(120);
          const t1 = performance.now();
          for (let i = 0; i < 10; i++) G.debug.render();
          const t2 = performance.now();
          return { upd: (t1 - t0) / 120, render: (t2 - t1) / 10 };
        });
        row.updMs = perf.upd; row.renderMs = perf.render;
        row.end = await page.evaluate(() => G.debug.state().room);
        const g1 = await page.evaluate((k) => G.debug.errors.slice(k), g0);
        row.errors.push(...g1.map((e) => 'G.debug.errors: ' + short(e)));
      } catch (e) {
        row.errors.push('exception: ' + short(e.stack || e));
      }
      row.errors.push(...errors.slice(e0).map(short));
      row.ok = !row.errors.length;
      row.slow = (row.updMs != null && row.updMs > A.slowUpdate) || (row.renderMs != null && row.renderMs > A.slowRender);
      out.push(row);
      log('  ' + (row.ok ? 'ok  ' : 'FAIL') + ' ' + id.padEnd(10) + ' spot ' + row.spot.tx + ',' + row.spot.ty + ' (' + row.spot.why + ')' +
        (row.updMs != null ? '  update ' + row.updMs.toFixed(2) + ' ms/step, render ' + row.renderMs.toFixed(1) + ' ms' : '') + (row.slow ? '  SLOW' : ''));
    }
    return { rows: out, devFallback };
  } finally {
    await context.close().catch(() => {});
  }
}

// ------------------------------------------------------------------------------------------------ main
async function main() {
  const A = parseArgs(process.argv);
  if (A.help) { console.log(fs.readFileSync(__filename, 'utf8').split('\n').slice(1, 19).join('\n')); return 0; }
  const log = (m) => console.log(m);
  const t0 = Date.now();
  const flows = [];
  let tour = null;
  try {
    if (A.flow) {
      log('flow: title → new game');
      const ng = await flowNewGame(A, log);
      flows.push(ng.res);
      log('flow: save → continue');
      flows.push(await flowSaveContinue(A, ng, log));
    }
    if (A.rooms) { log('room tour (' + A.frames + ' frames each):'); tour = await roomTour(A, log); }
  } finally {
    await closeAll();
  }
  // summary
  const L = ['', 'SMOKE SUMMARY (' + ((Date.now() - t0) / 1000).toFixed(1) + ' s)'];
  let failures = 0;
  for (const f of flows) {
    L.push('  ' + (f.ok ? 'ok  ' : 'FAIL') + ' ' + f.name + (f.notes.length ? '  — ' + f.notes.join('; ') : ''));
    for (const e of f.errors) L.push('         ' + e);
    if (!f.ok) failures++;
  }
  if (tour) {
    L.push('');
    L.push('  room        result  update ms/step  render ms  spot');
    for (const r of tour.rows) {
      L.push('  ' + r.id.padEnd(11) + (r.ok ? ' ok    ' : ' FAIL  ') + (r.updMs == null ? '      -       ' : (r.updMs.toFixed(2) + (r.slow && r.updMs > A.slowUpdate ? '*' : '')).padStart(10) + '    ') +
        (r.renderMs == null ? '     -' : (r.renderMs.toFixed(1) + (r.slow && r.renderMs > A.slowRender ? '*' : '')).padStart(9)) + '  ' + (r.spot ? r.spot.tx + ',' + r.spot.ty + ' ' + r.spot.why : ''));
      for (const e of r.errors.slice(0, 8)) L.push('         ' + e);
      if (!r.ok) failures++;
    }
    const slow = tour.rows.filter((r) => r.slow);
    if (slow.length) L.push('  slow rooms (* > ' + A.slowUpdate + ' ms/update or > ' + A.slowRender + ' ms/render, headless software rendering): ' + slow.map((r) => r.id).join(' '));
    if (tour.devFallback) L.push('  note: no region rooms exist yet — the dev rooms were toured instead');
    if (A.shots) L.push('  screenshots: test-output/rooms/<id>.png');
  }
  L.push('');
  L.push(failures ? 'FAIL: ' + failures + ' failing item(s)' : 'OK: no errors');
  console.log(L.join('\n'));
  return failures ? 1 : 0;
}

if (require.main === module) main().then((c) => process.exit(c), async (e) => { console.error(e); await closeAll(); process.exit(3); });
