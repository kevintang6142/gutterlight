'use strict';
// UI fixes of the rebinding QA round (module rebind-fix-ui): pause/inventory bound to pad A, pad capture cancel and
// timeout, Enter refused by the capture, capture prompt by device, world prompt keycap, no urn count drawn.
// Run by tools/rebind_check.js.
const { openGame, closeAll } = require('../lib/browser');
const file = process.argv.indexOf('--file') > 0 ? process.argv[process.argv.indexOf('--file') + 1] : undefined;
let fails = 0;
const check = (n, ok, v) => { console.log((ok ? 'ok  ' : 'FAIL') + ' ' + n + (ok ? '' : ' ' + JSON.stringify(v))); if (!ok) fails++; };
(async () => {
  const { page, errors } = await openGame(Object.assign({ query: 'test=1&paused=1&room=dev_shaft&tx=10&ty=34&seed=7&mute=1&god=1' }, file ? { file } : {}));
  const ev = (fn, a) => page.evaluate(fn, a);
  await ev(() => {
    window.T = { step: (n) => { for (let i = 0; i < (n || 1); i++) G.game.step(); } };
    const mk = () => ({ pressed: false, value: 0 });
    window.__pad = { id: 'mock', index: 0, connected: true, mapping: 'standard', axes: [0, 0, 0, 0], buttons: Array.from({ length: 17 }, mk), timestamp: 0 };
    Object.defineProperty(navigator, 'getGamepads', { configurable: true, value: () => [window.__pad] });
    window.__btn = (i, on) => { __pad.buttons[i].pressed = on; __pad.buttons[i].value = on ? 1 : 0; };
    window.__tap = (i) => { __btn(i, true); T.step(2); __btn(i, false); T.step(2); };
    window.reset = () => { G.UI.closeAll(false); G.input.resetBindings({ noSave: true }); T.step(20); };
    G.debug.give('all'); T.step(40);
  });
  // F1: pause on pad A
  await ev(() => G.input.setBinding('pause', 2, 'pad:0'));
  await ev(() => { G.UI.openPause(); T.step(10); __tap(13); __tap(13); T.step(3); __tap(0); T.step(10); });
  let r = await ev(() => G.UI.screenNames());
  check('F1 pause=A: A on Controls opens Controls', r.includes('controls') && r.includes('pause'), r);
  r = await ev(() => { __tap(1); T.step(10); return G.UI.screenNames(); });
  check('F1 B backs out of Controls', !r.includes('controls'), r);
  await ev(() => reset());
  // F1b: inventory on pad A
  await ev(() => G.input.setBinding('inventory', 2, 'pad:0'));
  r = await ev(() => { __tap(0); T.step(15); const a = G.UI.screenNames(); __tap(0); T.step(15); return [a, G.UI.screenNames()]; });
  check('F1b inventory=A: 2nd A keeps inventory open', r[0].includes('inventory') && r[1].includes('inventory'), r);
  r = await ev(() => { __tap(1); T.step(15); return G.UI.screenNames(); });
  check('F1b B closes inventory', !r.includes('inventory'), r);
  await ev(() => reset());
  // keyboard pause still closes with Esc/P
  r = await ev(() => { G.UI.openPause(); T.step(30); return 1; });
  await ev(() => { window.PL = []; const u = G.input.update; G.input.update = function (dt) { u.call(G.input, dt); PL.push(G.input.ACTIONS.filter((a) => G.input.pressed(a)).join(',')); }; });
  await page.keyboard.press('KeyP'); await ev(() => T.step(40));
  r = await ev(() => ({ names: G.UI.screenNames(), b: G.input.getBindings().pause, pl: PL.filter(Boolean), dev: G.input.lastDevice }));
  check('P closes pause (unchanged)', !r.names.includes('pause'), r);
  await ev(() => reset());

  // F5: Enter in a keyboard column is refused, capture keeps listening
  await ev(() => { G.input.lastDevice = 'keyboard'; G.UI.openControls(); T.step(15); });
  r = await ev(() => [G.UI.top().row, G.UI.top().col]);
  check('keyboard: Controls opens on col 0', r[1] === 0, r);
  await page.keyboard.press('Enter'); await ev(() => T.step(4));
  check('Enter starts capture', await ev(() => G.input.capturing), null);
  await page.keyboard.press('Enter'); await ev(() => T.step(4));
  r = await ev(() => ({ cap: G.input.capturing, left: G.input.getBindings().left, note: G.UI.top().note }));
  check('F5 2nd Enter not bound, still capturing', r.cap && r.left.indexOf('key:Enter') < 0, r);
  await page.keyboard.press('KeyQ'); await ev(() => T.step(4));
  r = await ev(() => G.input.getBindings().left);
  check('then Q binds', r[0] === 'key:KeyQ', r);
  await ev(() => reset());

  // F3/F6: pad on keyboard column: B cancels; timeout not reset by re-arms
  await ev(() => { G.input.lastDevice = 'keyboard'; G.UI.openControls(); T.step(15); __tap(0); T.step(2); });
  check('pad A starts capture in kb column', await ev(() => G.input.capturing), null);
  r = await ev(() => { __tap(1); T.step(4); return G.input.capturing; });
  check('F6 pad B cancels kb-column capture', !r, r);
  r = await ev(() => { __tap(0); T.step(2); const a = []; for (let i = 0; i < 4; i++) { __tap(3); T.step(60 * 3); a.push(G.input.capturing); } return a; });
  check('F3 re-arms keep elapsed time (ends <= ~10 s)', r[r.length - 1] === false, r);
  r = await ev(() => G.input.getBindings().left);
  check('nothing bound', r[0] === 'key:ArrowLeft', r);
  await ev(() => reset());
  // pad device opens on Gamepad column; prompt texts
  r = await ev(() => { G.input.lastDevice = 'gamepad'; G.UI.openControls(); T.step(15); return G.UI.top().col; });
  check('F6 pad: Controls opens on Gamepad column', r === 2, r);
  r = await ev(() => [G.UI._controlsCapturePrompt(true, true), G.UI._controlsCapturePrompt(false, true), G.UI._controlsCapturePrompt(false, false), G.UI._controlsCapturePrompt(true, false)]);
  check('F4 prompts by device', !/Esc/.test(r[0]) && /B/.test(r[1]) && /Esc/.test(r[2]) && /Esc/.test(r[3]), r);
  await ev(() => reset());

  // F2: prompt label follows Interact
  r = await ev(() => { G.input.lastDevice = 'keyboard'; const a = G.UI.promptKeyLabel('Rest'); G.input.setBinding('interact', 0, 'key:KeyE'); G.input.setBinding('interact', 1, 'key:KeyF'); const b = G.UI.promptKeyLabel('Rest'); const c = G.UI.promptKeyLabel(G.UI.text('ui.inventory', 'Inventory')); G.input.lastDevice = 'gamepad'; const d = G.UI.promptKeyLabel('Rest'); G.input.setBinding('interact', 2, 'pad:3'); const e = G.UI.promptKeyLabel('Rest'); G.input.lastDevice = 'keyboard'; return [a, b, c, d, e]; });
  check('F2 prompt key labels', r[0] === '↑' && r[1] === 'E' && r[2] === '↑' && r[4] !== '↑', r);
  await ev(() => reset());

  // F7: urn never drawn as a number
  r = await ev(() => {
    G.debug.give('urn'); G.debug.give('urn');
    const seen = []; const ft = CanvasRenderingContext2D.prototype.fillText;
    CanvasRenderingContext2D.prototype.fillText = function (t, ...a) { seen.push(String(t)); return ft.call(this, t, ...a); };
    const inv = G.UI.openInventory(); T.step(20);
    inv.sel = inv.cells.findIndex((c) => c.id === 'urn'); T.step(3);
    G.debug.render(); G.UI.closeAll(false); T.step(5);
    G.UI.itemGet('urn', () => {}); T.step(40); G.debug.render();
    CanvasRenderingContext2D.prototype.fillText = ft;
    return { n: G.game.progress.urns, bad: seen.map((s, i) => /Urns?\b.*\d|^\s*2\s*$/.test(s) ? seen.slice(Math.max(0, i - 3), i + 1).join('|') : '').filter(Boolean), sample: seen.filter((s) => /Urn/.test(s)).slice(0, 5) };
  });
  check('F7 no urn count drawn', r.bad.length === 0 && r.sample.length > 0, r);
  console.log('errors', errors.length, errors.slice(0, 3));
  console.log(fails ? 'FAILS ' + fails : 'ALL OK');
  await closeAll();
})().catch((e) => { console.error(e); process.exit(1); });
