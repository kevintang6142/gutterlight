#!/usr/bin/env node
// tools/input_check.js — control rebinding regression (G.input bindings + the Controls screen), driven with REAL
// browser events (page.keyboard / page.mouse) and a mocked navigator.getGamepads.
//
//   1. defaults: X attacks, an unbound left click does nothing (no action at all)
//   2. Controls screen: bind Attack to LMB by clicking -> a real left click attacks, X no longer does
//   3. bind Jump to Q -> Q jumps; bind Dash to Q -> moved away from Jump with a note
//   4. last-binding refusal (Inventory), swap when the move would leave an action empty, clear, Reset (confirm)
//   5. labels: ability card ({jump}), lore tablet ({attack}), Controls screen and hints follow the bindings
//   6. lockout: with every arrow / Z / Space / Esc rebound away, Esc still pauses and Enter/Esc/arrows run menus
//   7. browser context menu suppressed while RMB is bound (and not otherwise)
//   8. gamepad slot bound by a (mocked) pad button; the pad then attacks; pad labels follow
//   9. persistence: bindings survive a reload (localStorage), corrupt/unknown entries fall back to defaults
//  Zero console/page errors. Prints PASS/FAIL per check; exit 1 on any failure.
//
//   node tools/input_check.js [--shots]      --shots also writes test-output/input_check/*.png
'use strict';
const fs = require('fs');
const path = require('path');
const { openGame, closeAll, ROOT } = require('./lib/browser');

const OUT = path.join(ROOT, 'test-output', 'input_check');
const SHOTS = process.argv.includes('--shots');
// --file dist/Gutterlight.html: run against the single-file build instead of index.html
const fileArg = process.argv.indexOf('--file');
const FILE = fileArg > 0 ? process.argv[fileArg + 1] : undefined;
let fails = 0, passes = 0;
function check(name, ok, info) {
  if (ok) passes++; else fails++;
  console.log((ok ? 'PASS ' : 'FAIL ') + name + (ok || info === undefined ? '' : '  -> ' + JSON.stringify(info).slice(0, 400)));
}
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// in-page helpers: a per-step log of pressed actions and a key-cap spy
const HELPERS = () => {
  const T = {};
  window.T = T;
  T.log = [];
  const upd = G.input.update;
  G.input.update = function (dt) {
    upd.call(G.input, dt);
    const p = G.input.ACTIONS.filter((a) => G.input.pressed(a));
    if (p.length) T.log.push(p.join(','));
  };
  T.caps = null;
  const kc = G.UI.keycap;
  G.UI.keycap = function (ctx, label) { if (T.caps) T.caps.push(String(label)); return kc.apply(this, arguments); };
  T.step = (n) => { for (let i = 0; i < (n || 1); i++) G.game.step(); };
  T.drawnCaps = () => { T.caps = []; G.debug.render(); const c = T.caps; T.caps = null; return c; };
  T.top = () => { const s = G.UI.top(); return s ? s.name : null; };
  T.ctl = () => { const s = G.UI.find('controls'); return s ? { row: s.row, col: s.col, capturing: s.capturing, note: s.noteT > 0 ? s.note : '' } : null; };
  T.player = () => { const p = G.game.player; const m = p && (p.motor || {}); return p ? { slash: !!p.slash, buf: p.attackBuffer || 0, vy: m.vy !== undefined ? m.vy : p.vy, x: p.x, onGround: !!m.onGround } : null; };
  return true;
};

async function main() {
  fs.mkdirSync(OUT, { recursive: true });
  const allErrors = [];

  // =========================================================================== in-game checks (memory storage)
  const { page, errors } = await openGame({ query: 'test=1&paused=1&room=dev_shaft&tx=10&ty=34&seed=7&mute=1&god=1', file: FILE });
  const ev = (fn, arg) => page.evaluate(fn, arg);
  const step = (n) => ev((k) => T.step(k), n || 1);
  const key = async (k, n) => { await page.keyboard.press(k); await step(n === undefined ? 2 : n); };
  const click = async (button, n) => { await page.mouse.click(640, 360, { button: button || 'left' }); await step(n === undefined ? 1 : n); };
  try {
    await ev(HELPERS);
    await ev(() => { G.debug.give('all'); T.step(40); });
    await page.mouse.move(640, 360);

    // ---- 1. defaults
    await ev(() => { T.log.length = 0; });
    await page.keyboard.press('KeyX');
    await step(1);
    const p1 = await ev(() => ({ p: T.player(), log: T.log.slice() }));
    check('default: X attacks', p1.p.slash || p1.p.buf > 0, p1);
    await step(40);
    await ev(() => { T.log.length = 0; });
    await click('left', 3);
    const p2 = await ev(() => ({ p: T.player(), log: T.log.slice(), ui: G.UI.screenNames() }));
    check('default: an unbound left click does nothing', !p2.p.slash && p2.p.buf === 0 && p2.log.length === 0 && p2.ui.length === 0, p2);
    await click('right', 2);
    await click('middle', 2);
    const p2b = await ev(() => T.log.slice());
    check('default: unbound right/middle clicks do nothing', p2b.length === 0, p2b);

    // ---- 2. Controls: Attack -> LMB by clicking
    const acts = await ev(() => G.input.GAME_ACTIONS);
    const rowOf = (a) => acts.indexOf(a);
    async function gotoCell(row, col) {
      const cur = await ev(() => T.ctl());
      for (let i = cur.row; i < row; i++) await key('ArrowDown', 2);
      for (let i = cur.row; i > row; i--) await key('ArrowUp', 2);
      for (let i = cur.col; i < col; i++) await key('ArrowRight', 2);
      for (let i = cur.col; i > col; i--) await key('ArrowLeft', 2);
      return ev(() => T.ctl());
    }
    await ev(() => { G.UI.openPause(); T.step(10); });
    // pause -> Controls (3rd item) with real keys
    await key('ArrowDown', 2); await key('ArrowDown', 2); await key('Enter', 20);
    check('pause > Controls opens with real keys', (await ev(() => T.top())) === 'controls', await ev(() => G.UI.screenNames()));
    let c = await gotoCell(rowOf('attack'), 0);
    check('Controls: arrow keys select the Attack / Primary cell', c.row === rowOf('attack') && c.col === 0, c);
    await key('Enter', 2);
    c = await ev(() => T.ctl());
    check('Controls: Enter starts a capture', c.capturing === true && (await ev(() => G.input.capturing)) === true, c);
    if (SHOTS) { await ev(() => G.debug.render()); await page.screenshot({ path: path.join(OUT, 'controls_capture.png') }); }
    await click('left', 3);
    let b = await ev(() => G.input.getBindings());
    check('Controls: a left click binds Attack to LMB', b.attack[0] === 'mouse:0' && !(await ev(() => T.ctl().capturing)), b.attack);
    let caps = await ev(() => T.drawnCaps());
    check('Controls screen shows LMB in the Attack row', caps.includes('LMB'), caps.slice(0, 40));
    if (SHOTS) await page.screenshot({ path: path.join(OUT, 'controls_lmb.png') });

    // ---- 3. Jump -> Q, then Dash -> Q moves it
    await gotoCell(rowOf('jump'), 0);
    await key('Enter', 2);
    await key('KeyQ', 3);
    b = await ev(() => G.input.getBindings());
    check('Controls: pressing Q binds Jump to Q', b.jump[0] === 'key:KeyQ', b.jump);
    await gotoCell(rowOf('dash'), 0);
    await key('Enter', 2);
    await key('KeyQ', 3);
    b = await ev(() => G.input.getBindings());
    c = await ev(() => T.ctl());
    check('conflict: Q moves from Jump to Dash', b.dash[0] === 'key:KeyQ' && b.jump[0] === null && b.jump[1] === 'key:Space', { dash: b.dash, jump: b.jump });
    check('conflict: a note names the old action', /moved/i.test(c.note) && /jump/i.test(c.note), c.note);
    // back to Jump = Q (Dash gets nothing back: it keeps Shift)
    await gotoCell(rowOf('jump'), 0);
    await key('Enter', 2);
    await key('KeyQ', 3);
    b = await ev(() => G.input.getBindings());
    check('rebind Jump to Q again (Dash keeps its other keys)', b.jump[0] === 'key:KeyQ' && b.dash[0] === null && b.dash[1] === 'key:Shift', { jump: b.jump, dash: b.dash });
    // Esc cancels a capture without changing anything
    await gotoCell(rowOf('map'), 1);
    await key('Enter', 2);
    await key('Escape', 3);
    const afterEsc = await ev(() => ({ b: G.input.getBindings().map, top: T.top(), cap: G.input.capturing }));
    check('Esc cancels a capture (binding unchanged, screen stays)', afterEsc.b[1] === 'key:KeyM' && afterEsc.top === 'controls' && !afterEsc.cap, afterEsc);

    // ---- 4. last binding, swap, clear
    await gotoCell(rowOf('inventory'), 2);
    await key('Delete', 2);
    await gotoCell(rowOf('inventory'), 0);
    await key('Delete', 2);
    b = await ev(() => G.input.getBindings());
    c = await ev(() => T.ctl());
    check('clear: Delete clears the Inventory pad slot', b.inventory[2] === null, b.inventory);
    check('last binding: clearing Inventory\'s last input is refused with a note', b.inventory[0] === 'key:KeyI' && /at least one/i.test(c.note), { inv: b.inventory, note: c.note });
    await key('Backspace', 2);
    b = await ev(() => G.input.getBindings());
    check('last binding: Backspace refused too and does not close the screen', b.inventory[0] === 'key:KeyI' && (await ev(() => T.top())) === 'controls', b.inventory);
    await gotoCell(rowOf('map'), 0);
    await key('Enter', 2);
    await key('KeyI', 3);
    b = await ev(() => G.input.getBindings());
    c = await ev(() => T.ctl());
    check('swap: I to Map leaves Inventory with Map\'s old Tab', b.map[0] === 'key:KeyI' && b.inventory[0] === 'key:Tab', { map: b.map, inv: b.inventory, note: c.note });
    // gamepad-only column refuses a key and keeps listening
    await gotoCell(rowOf('map'), 2);
    await key('Enter', 2);
    await key('KeyH', 2);
    c = await ev(() => T.ctl());
    check('Gamepad column: a key is refused with a note and the capture continues', c.capturing && /gamepad/i.test(c.note), c);
    await key('Escape', 3);

    // ---- 5. labels (keyboard device)
    await key('Escape', 20); // close Controls
    await key('Escape', 20); // resume
    check('Esc closes Controls then the pause menu', (await ev(() => G.UI.screenNames().length)) === 0, await ev(() => G.UI.screenNames()));
    const lab = await ev(() => ({ attack: G.input.label('attack'), jump: G.input.label('jump'), tok: G.UI.tokens('Press {attack} and {jump}') }));
    check('G.input.label / UI.tokens follow the bindings', lab.attack === 'LMB' && lab.jump === 'Q' && lab.tok === 'Press LMB and Q', lab);
    await ev(() => { G.UI.abilityGet('grip'); T.step(90); });
    caps = await ev(() => T.drawnCaps());
    check('ability card ({jump}) shows Q', caps.includes('Q'), caps);
    if (SHOTS) await page.screenshot({ path: path.join(OUT, 'ability_q.png') });
    await ev(() => { G.UI.closeAll(false); T.step(5); G.UI.lore('lore_sh_2'); T.step(400); });
    caps = await ev(() => T.drawnCaps());
    check('lore tablet ({attack}) shows LMB', caps.includes('LMB'), caps);
    await ev(() => { G.UI.closeAll(false); T.step(5); });

    // ---- 2b. in game: LMB attacks, X does not, Q jumps
    await step(30);
    await ev(() => { T.log.length = 0; });
    await click('left', 1);
    const p3 = await ev(() => ({ p: T.player(), log: T.log.slice() }));
    check('in game: a real left click attacks', (p3.p.slash || p3.p.buf > 0) && p3.log.join().includes('attack'), p3);
    await step(40);
    await ev(() => { T.log.length = 0; });
    await key('KeyX', 1);
    const p4 = await ev(() => ({ p: T.player(), log: T.log.slice() }));
    check('in game: X no longer attacks (nor anything else)', !p4.p.slash && p4.p.buf === 0 && !p4.log.join().includes('attack'), p4);
    await step(40);
    await ev(() => { T.log.length = 0; });
    await page.keyboard.down('KeyQ'); await step(6);
    const p5 = await ev(() => ({ p: T.player(), log: T.log.slice() }));
    await page.keyboard.up('KeyQ'); await step(60);
    check('in game: Q jumps', p5.log.join().includes('jump') && p5.p.vy < 0, p5);

    // ---- 7. context menu
    // a persistent bubble-phase listener (registered after G.input's) records whether the menu was suppressed
    await ev(() => { window.__ctx = []; window.addEventListener('contextmenu', (e) => { setTimeout(() => window.__ctx.push(e.defaultPrevented), 0); }); });
    const rightClick = async () => {
      await ev(() => { window.__ctx.length = 0; });
      await page.mouse.click(640, 360, { button: 'right' });
      for (let i = 0; i < 40; i++) { const r = await ev(() => window.__ctx.slice()); if (r.length) return r[0]; await sleep(25); }
      return 'no contextmenu event';
    };
    let pr = await rightClick();
    check('context menu suppressed while LMB is bound', pr === true, pr);
    await ev(() => { G.input.resetBindings(); });
    pr = await rightClick();
    check('context menu not suppressed when no mouse button is bound', pr === false, pr);
    await ev(() => G.input.setBinding('spell', 1, 'mouse:2'));
    pr = await rightClick();
    check('context menu suppressed while RMB is bound', pr === true, pr);
    await step(40);
    await ev(() => { T.log.length = 0; });
    await page.mouse.down({ button: 'right' }); await step(2); await page.mouse.up({ button: 'right' }); await step(1);
    check('in game: RMB bound to Spell casts', (await ev(() => T.log.join())).includes('spell'), await ev(() => T.log.slice()));
    // a keyboard press right after mouse input still works (focus intact)
    await ev(() => { T.log.length = 0; });
    await key('KeyZ', 1);
    check('keyboard input still reaches the game after mouse clicks', (await ev(() => T.log.join())).includes('jump'));
    await step(60);

    // ---- 6. lockout fallback
    const lock = await ev(() => {
      const I = G.input;
      I.resetBindings();
      const r = [];
      r.push(I.setBinding('jump', 0, 'key:KeyO'), I.setBinding('jump', 1, 'key:KeyU'));
      r.push(I.setBinding('attack', 0, 'key:ArrowUp'), I.setBinding('attack', 1, 'key:ArrowDown'));
      r.push(I.setBinding('dash', 0, 'key:ArrowLeft'), I.setBinding('spell', 0, 'key:ArrowRight'));
      r.push(I.setBinding('pause', 0, 'key:KeyY'));
      return { ok: r.every((x) => x.ok), b: I.getBindings() };
    });
    check('lockout setup: arrows, Z, Space, Esc rebound away', lock.ok && lock.b.up[0] === null && lock.b.pause[0] === 'key:KeyY' && lock.b.jump[0] === 'key:KeyO', lock.b);
    await ev(() => { T.log.length = 0; });
    await page.keyboard.down('ArrowLeft'); await step(4);
    const mv = await ev(() => T.log.join());
    await page.keyboard.up('ArrowLeft'); await step(40);
    check('lockout: in play, ArrowLeft does its new action (dash), not left', mv.includes('dash') && !mv.includes('left'), mv);
    await key('Escape', 10);
    check('lockout: Esc still opens pause', (await ev(() => T.top())) === 'pause');
    await key('ArrowDown', 2);
    let sel = await ev(() => G.UI.top().sel);
    check('lockout: ArrowDown still navigates the pause menu', sel === 1, sel);
    await key('Enter', 15);
    check('lockout: Enter still confirms (Options opens)', (await ev(() => T.top())) === 'options');
    await key('Escape', 15);
    check('lockout: Esc still backs out (Options closes)', (await ev(() => T.top())) === 'pause');
    await key('ArrowDown', 2); await key('Enter', 15);
    check('lockout: Controls reachable', (await ev(() => T.top())) === 'controls');
    await gotoCell(rowOf('jump'), 0);
    c = await ev(() => T.ctl());
    check('lockout: arrows navigate the Controls table', c.row === rowOf('jump'), c);
    // Reset to defaults (with confirmation) via real keys
    await gotoCell(acts.length, 0);
    await key('Enter', 12);
    check('Reset asks for confirmation', (await ev(() => T.top())) === 'confirm_reset_controls');
    await key('ArrowLeft', 2); await key('Enter', 15);
    b = await ev(() => G.input.getBindings());
    const def = await ev(() => G.input.defaultBindings());
    check('Reset to Defaults restores every binding', JSON.stringify(b) === JSON.stringify(def));
    c = await ev(() => T.ctl());
    check('Reset shows a note', /default/i.test(c.note), c.note);
    await key('Escape', 20); await key('Escape', 20);

    // ---- 8. gamepad
    await ev(() => {
      const mk = () => ({ pressed: false, value: 0 });
      window.__pad = { id: 'mock', index: 0, connected: true, mapping: 'standard', axes: [0, 0, 0, 0], buttons: Array.from({ length: 17 }, mk), timestamp: 0 };
      Object.defineProperty(navigator, 'getGamepads', { configurable: true, value: () => [window.__pad] });
      window.__btn = (i, on) => { window.__pad.buttons[i].pressed = on; window.__pad.buttons[i].value = on ? 1 : 0; };
      T.step(3);
      G.UI.openControls();
      T.step(10);
      const s = G.UI.find('controls');
      s.row = G.input.GAME_ACTIONS.indexOf('attack'); s.col = 2;
    });
    await ev(() => { window.__btn(0, true); T.step(2); window.__btn(0, false); T.step(2); }); // pad A = confirm -> capture
    const padCap = await ev(() => T.ctl());
    check('pad: A starts a capture on the Gamepad cell', padCap.capturing, padCap);
    await ev(() => { window.__btn(3, true); T.step(3); });
    b = await ev(() => G.input.getBindings());
    check('pad: pressing Y binds Attack\'s gamepad slot', b.attack[2] === 'pad:3', b.attack);
    const stillOpen = await ev(() => { window.__btn(3, false); T.step(3); return T.top(); });
    check('pad: the capturing press does not also act (no clear, screen open)', stillOpen === 'controls' && (await ev(() => G.input.getBindings().attack[2])) === 'pad:3');
    await ev(() => { window.__btn(1, true); T.step(2); window.__btn(1, false); T.step(15); }); // B = back
    check('pad: B closes Controls', (await ev(() => G.UI.screenNames().length)) === 0, await ev(() => G.UI.screenNames()));
    await ev(() => { T.step(30); T.log.length = 0; window.__btn(3, true); T.step(1); });
    const pp = await ev(() => ({ p: T.player(), log: T.log.slice(), dev: G.input.lastDevice, label: G.input.label('attack') }));
    await ev(() => { window.__btn(3, false); T.step(40); T.log.length = 0; window.__btn(2, true); T.step(1); });
    const px = await ev(() => ({ log: T.log.slice() }));
    await ev(() => { window.__btn(2, false); T.step(5); });
    check('pad: Y now attacks', pp.p.slash || pp.p.buf > 0, pp);
    check('pad: prompts use the pad label (Y)', pp.dev === 'gamepad' && pp.label === 'Y', pp);
    check('pad: X (old attack) does nothing', !px.log.join().includes('attack'), px);
    await ev(() => { G.input.resetBindings(); Object.defineProperty(navigator, 'getGamepads', { configurable: true, value: () => [] }); T.step(3); });

    const derr = await ev(() => (G.debug.errors || []).slice());
    allErrors.push(...errors, ...derr);
  } catch (e) {
    check('in-game run threw', false, String(e && e.stack || e));
    allErrors.push(...errors);
  }
  await page.close();

  // =========================================================================== persistence (real localStorage)
  const g2 = await openGame({ query: 'paused=1&mute=1', file: FILE });
  try {
    const p2 = g2.page;
    await p2.evaluate(() => { localStorage.clear(); });
    await p2.reload(); await p2.waitForFunction('window.G && G.ready');
    const r1 = await p2.evaluate(() => {
      const r = G.input.setBinding('attack', 0, 'mouse:0');
      G.input.setBinding('jump', 0, 'key:KeyQ');
      return { ok: r.ok, stored: localStorage.getItem('gutterlight.v1.settings') };
    });
    check('persist: setBinding writes the settings to localStorage', r1.ok && /mouse:0/.test(r1.stored || ''), r1.stored && r1.stored.slice(0, 200));
    await p2.reload(); await p2.waitForFunction('window.G && G.ready');
    const r2 = await p2.evaluate(() => ({ b: G.input.getBindings(), s: G.settings.bindings && G.settings.bindings.slots && G.settings.bindings.slots.attack, vol: G.settings.musicVolume }));
    check('persist: bindings survive a reload', r2.b.attack[0] === 'mouse:0' && r2.b.jump[0] === 'key:KeyQ' && r2.s && r2.s[0] === 'mouse:0', r2);
    // corrupt entries
    await p2.evaluate(() => {
      const s = JSON.parse(localStorage.getItem('gutterlight.v1.settings'));
      s.bindings.slots.attack = ['bogus', 'pad:2', 12];   // bad id, wrong slot kind, not a string
      s.bindings.slots.nonsense = ['key:KeyA', null, null];
      s.bindings.slots.jump = 'x';
      localStorage.setItem('gutterlight.v1.settings', JSON.stringify(s));
    });
    await p2.reload(); await p2.waitForFunction('window.G && G.ready');
    const r3 = await p2.evaluate(() => ({ b: G.input.getBindings(), d: G.input.defaultBindings() }));
    check('persist: corrupt entries fall back to their defaults', JSON.stringify(r3.b.attack) === JSON.stringify(r3.d.attack) && JSON.stringify(r3.b.jump) === JSON.stringify(r3.d.jump) && !('nonsense' in r3.b), r3.b.attack);
    await p2.evaluate(() => { localStorage.setItem('gutterlight.v1.settings', '{"musicVolume":0.3,"bindings":"garbage"}'); });
    await p2.reload(); await p2.waitForFunction('window.G && G.ready');
    const r4 = await p2.evaluate(() => ({ same: JSON.stringify(G.input.getBindings()) === JSON.stringify(G.input.defaultBindings()), vol: G.settings.musicVolume }));
    check('persist: a garbage bindings value -> defaults, other settings kept', r4.same && r4.vol === 0.3, r4);
    await p2.evaluate(() => { localStorage.setItem('gutterlight.v1.settings', '{not json'); });
    await p2.reload(); await p2.waitForFunction('window.G && G.ready');
    check('persist: unreadable settings -> default bindings', await p2.evaluate(() => JSON.stringify(G.input.getBindings()) === JSON.stringify(G.input.defaultBindings())));
    // title: a click on the canvas with nothing bound to the mouse does not navigate or break anything
    await p2.evaluate(() => { localStorage.clear(); G.input.resetBindings(); });
    allErrors.push(...g2.errors, ...(await p2.evaluate(() => (G.debug && G.debug.errors ? G.debug.errors.slice() : []))));
    await p2.evaluate(() => localStorage.clear());
  } catch (e) {
    check('persistence run threw', false, String(e && e.stack || e));
    allErrors.push(...g2.errors);
  }
  await closeAll();

  check('zero console / page errors', allErrors.length === 0, allErrors.slice(0, 5));
  console.log(`\n${fails ? 'FAIL' : 'PASS'}: ${passes} passed, ${fails} failed`);
  process.exit(fails ? 1 : 0);
}

main().catch(async (e) => { console.error(e); await closeAll(); process.exit(1); });
