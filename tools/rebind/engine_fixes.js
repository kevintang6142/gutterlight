'use strict';
// Engine fixes of the rebinding QA round (module rebind-fix-engine): arrows bound to jump/pause in menus, Alt/Ctrl
// browser shortcuts, Meta refused, Start moved off Pause (swap/refuse), pad labels. Run by tools/rebind_check.js.
const { openGame, closeAll } = require('../lib/browser');
const file = process.argv.indexOf('--file') > 0 ? process.argv[process.argv.indexOf('--file') + 1] : undefined;
let fails = 0;
const check = (n, ok, info) => { if (!ok) fails++; console.log((ok ? 'PASS ' : 'FAIL ') + n + (ok ? '' : '  -> ' + JSON.stringify(info))); };
(async () => {
  const { page, errors } = await openGame(Object.assign({ query: 'test=1&paused=1&room=dev_shaft&tx=10&ty=34&seed=7&mute=1&god=1' }, file ? { file } : {}));
  const ev = (fn, a) => page.evaluate(fn, a);
  await ev(() => {
    window.T = {}; T.step = (n) => { for (let i = 0; i < (n || 1); i++) G.game.step(); };
    T.log = []; const upd = G.input.update;
    G.input.update = function (dt) { upd.call(G.input, dt); const p = G.input.ACTIONS.filter((a) => G.input.pressed(a)); if (p.length) T.log.push(p.join(',')); };
    const mk = () => ({ pressed: false, value: 0 });
    window.__pad = { id: 'mock', index: 0, connected: true, mapping: 'standard', axes: [0, 0, 0, 0], buttons: Array.from({ length: 17 }, mk), timestamp: 0 };
    window.__btn = (i, on) => { __pad.buttons[i].pressed = on; __pad.buttons[i].value = on ? 1 : 0; };
    window.__tap = (i) => { __btn(i, true); T.step(2); __btn(i, false); T.step(2); };
    T.step(40);
    // spy: did a later listener see defaultPrevented?
    window.__dp = []; window.addEventListener('keydown', (e) => __dp.push(e.code + (e.altKey ? '+alt' : '') + (e.ctrlKey ? '+ctrl' : '') + ':' + e.defaultPrevented));
  });
  // ---- 1. jump on each arrow: two presses in the pause menu keep the game paused
  for (const k of ['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight']) {
    await ev((k) => { G.UI.closeAll(false); G.input.resetBindings({ noSave: true }); G.input.setBinding('jump', 0, 'key:' + k, { noSave: true }); G.UI.openPause(); T.step(12); T.log = []; }, k);
    await page.keyboard.press(k); await ev(() => T.step(10));
    await page.keyboard.press(k); await ev(() => T.step(30));
    const r = await ev(() => ({ n: G.UI.screenNames(), mode: G.game.mode, log: T.log }));
    check('jump on ' + k + ': 2 presses in pause stay in pause, no confirm', r.mode === 'play' && r.n.join() === 'pause' && !r.log.some((l) => /confirm/.test(l)), r);
  }
  // pause / map on ↓: in the pause menu ↓ only navigates
  await ev(() => { G.UI.closeAll(false); G.input.resetBindings({ noSave: true }); G.input.setBinding('pause', 1, 'key:ArrowDown', { noSave: true }); G.UI.openPause(); T.step(12); T.log = []; });
  await page.keyboard.press('ArrowDown'); await ev(() => T.step(10));
  let r = await ev(() => ({ n: G.UI.screenNames(), log: T.log }));
  check('pause on ↓: ↓ in the pause menu navigates, does not close', r.n.join() === 'pause' && r.log.join() === 'down', r);
  // in play the arrow still does its gameplay action; defaults unchanged in menus (↑ = up+interact, J = confirm, X = cancel)
  await ev(() => { G.UI.closeAll(false); G.input.resetBindings({ noSave: true }); G.input.setBinding('jump', 0, 'key:ArrowUp', { noSave: true }); T.step(5); T.log = []; });
  await page.keyboard.press('ArrowUp'); await ev(() => T.step(3));
  r = await ev(() => T.log);
  check('jump on ↑ in play: jump fires', r.some((l) => /jump/.test(l)), r);
  r = await ev(() => { G.input.resetBindings({ noSave: true }); G.input.forceMenu = true;
    const m = (a) => G.input.activeInputs(a, true).sort().join(' ');
    const o = { up: m('up'), interact: m('interact'), confirm: m('confirm'), cancel: m('cancel'), spell: m('spell'), jump: m('jump') }; G.input.forceMenu = null; return o; });
  check('defaults: menu views unchanged', r.up.includes('key:ArrowUp') && r.interact.includes('key:ArrowUp') && r.confirm.includes('key:KeyJ') && r.confirm.includes('key:KeyZ') && r.cancel.includes('key:KeyX') && r.spell.includes('pad:1') && r.jump.includes('pad:0'), r);
  // ---- 2. modifiers
  await ev(() => { G.UI.closeAll(false); G.input.resetBindings({ noSave: true }); G.input.setBinding('dash', 1, 'key:Alt', { noSave: true }); T.step(3); __dp = []; });
  await page.keyboard.down('Alt'); await page.keyboard.press('ArrowLeft'); await page.keyboard.press('KeyD'); await page.keyboard.up('Alt');
  r = await ev(() => __dp.slice());
  check('Alt bound: Alt+← and Alt+D are prevented', r.includes('ArrowLeft+alt:true') && r.includes('KeyD+alt:true'), r);
  await ev(() => { G.input.resetBindings({ noSave: true }); G.input.setBinding('dash', 1, 'key:Control', { noSave: true }); T.step(3); __dp = []; });
  await page.keyboard.down('Control'); for (const k of ['KeyD', 'KeyP', 'KeyS', 'KeyR']) await page.keyboard.press(k); await page.keyboard.up('Control');
  r = await ev(() => __dp.slice());
  check('Ctrl bound: Ctrl+D/P/S prevented, unbound Ctrl+R not', r.includes('KeyD+ctrl:true') && r.includes('KeyP+ctrl:true') && r.includes('KeyS+ctrl:true') && r.includes('KeyR+ctrl:false'), r);
  await ev(() => { G.input.resetBindings({ noSave: true }); T.step(3); __dp = []; });
  await page.keyboard.down('Control'); await page.keyboard.press('KeyD'); await page.keyboard.up('Control');
  r = await ev(() => __dp.slice());
  check('Ctrl unbound: Ctrl+D left to the browser', r.includes('KeyD+ctrl:false'), r);
  r = await ev(() => ({ meta: G.input.setBinding('dash', 1, 'key:Meta', { noSave: true }), ctrl: G.input.setBinding('dash', 1, 'key:Control', { noSave: true }),
    load: G.input.sanitizeBindings({ v: 1, slots: Object.assign(G.input.getBindings(), { dash: ['key:KeyC', 'key:Meta', 'pad:5'] }) }).slots.dash }));
  check('Meta refused (reason os); Ctrl+W/T/N warning; stored Meta dropped', r.meta.ok === false && r.meta.reason === 'os' && r.ctrl.ok && r.ctrl.warning === 'ctrlCombos' && r.load[1] !== 'key:Meta', r);
  // ---- 3. pad pause stays reachable
  await ev(() => { G.UI.closeAll(false); G.input.resetBindings({ noSave: true }); Object.defineProperty(navigator, 'getGamepads', { configurable: true, value: () => [window.__pad] }); T.step(3); });
  r = await ev(() => G.input.setBinding('dash', 2, 'pad:9', { noSave: true }));
  const pp = await ev(() => G.input.getBindings().pause[2]);
  await ev(() => { T.step(30); T.log = []; T.sn = []; __btn(5, true); for (let i = 0; i < 4; i++) { T.step(1); T.sn.push(G.UI.screenNames().join('/') + ':' + G.input.pressed('pause')); } __btn(5, false); for (let i = 0; i < 10; i++) { T.step(1); T.sn.push(G.UI.screenNames().join('/') + ':' + G.input.ACTIONS.filter((a) => G.input.down(a)).join('+') + ':' + G.game.mode); } });
  r = { set: r, pausePad: pp, screens: await ev(() => G.UI.screenNames()), log: await ev(() => T.log), mode: await ev(() => [G.game.mode, G.game.uiBlocking(), G.input.down('pause'), G.input.activeInputs('pause', true)]) };
  check('Start -> dash swaps: pause gets RB and RB pauses', r.set.ok && r.set.swapped && r.set.swapped.action === 'pause' && pp === 'pad:5' && r.screens.indexOf('pause') >= 0, r);
  r = await ev(() => { G.UI.closeAll(false); G.input.resetBindings({ noSave: true }); G.input.clearBinding('dash', 2, { noSave: true });
    return { a: G.input.setBinding('dash', 2, 'pad:9', { noSave: true }), b: G.input.clearBinding('pause', 2, { noSave: true }) }; });
  check('Start -> dash with nothing to swap: refused (pause, gamepad); clearing pause pad slot with Start free is ok', r.a.ok === false && r.a.action === 'pause' && r.b.ok, r);
  r = await ev(() => { G.input.resetBindings({ noSave: true }); G.input.setBinding('pause', 2, 'pad:3', { noSave: true }); G.input.setBinding('dash', 2, 'pad:9', { noSave: true }); return G.input.clearBinding('pause', 2, { noSave: true }); });
  check('clearing pause pad slot while Start is taken: refused', r.ok === false && r.action === 'pause', r);
  r = await ev(() => { G.input.loadBindings({ v: 1, slots: Object.assign(G.input.getBindings(), { pause: ['key:Escape', 'key:KeyP', null], dash: ['key:KeyC', 'key:Shift', 'pad:9'] }) });
    G.input.forceMenu = false; const a = G.input.activeInputs('pause').filter((x) => /^pad/.test(x)); G.input.forceMenu = null; return a; });
  check('loaded table without pad pause: a fallback pad input pauses', r.length > 0, r);
  // ---- 4/5. labels
  r = await ev(() => { G.input.resetBindings({ noSave: true }); G.input.lastDevice = 'gamepad';
    const o = {};
    G.input.setBinding('dash', 2, 'pad:2', { noSave: true }); o.attack = G.input.label('attack'); o.dash = G.input.label('dash');
    o.tok = G.UI.tokens('Press {attack} to strike.');
    G.input.resetBindings({ noSave: true }); G.input.setBinding('interact', 2, 'pad:13', { noSave: true }); o.interact = G.input.label('interact');
    G.input.resetBindings({ noSave: true }); G.input.clearBinding('interact', 2, { noSave: true }); G.input.setBinding('jump', 2, 'axis:1-', { noSave: true }); o.interact2 = G.input.label('interact');
    G.input.resetBindings({ noSave: true }); o.def = ['left', 'right', 'up', 'down', 'interact', 'jump', 'attack', 'dash', 'spell', 'map', 'inventory', 'pause'].map((a) => G.input.label(a)).join(' ');
    G.input.clearBinding('left', 2, { noSave: true }); o.leftStick = G.input.label('left');
    G.input.resetBindings({ noSave: true }); G.input.lastDevice = 'keyboard';
    o.kdef = ['left', 'jump', 'attack', 'dash', 'pause'].map((a) => G.input.label(a)).join(' ');
    G.input.setBinding('jump', 0, 'key:KeyQ', { noSave: true }); G.input.setBinding('attack', 0, 'key:KeyZ', { noSave: true }); G.input.setBinding('attack', 1, 'key:Space', { noSave: true });
    o.kjump = G.input.label('jump');
    G.input.resetBindings({ noSave: true });
    return o; });
  check('pad: attack with no pad input shows unbound, not keyboard X', r.attack === '—' && r.dash === 'X' && r.tok === 'Press — to strike.', r);
  check('pad: interact on D-pad ↓ shows ↓', r.interact === '↓', r);
  check('pad: interact with no pad input and LS ↑ taken shows unbound', r.interact2 === '—', r);
  check('pad defaults unchanged', r.def === '← → ↑ ↓ ↑ A X RB B Back LB Start' && r.leftStick === '←', r);
  check('kbd defaults unchanged; jump keeps Q', r.kdef === '← Z X C Esc' && r.kjump === 'Q', r);
  console.log('errors', errors.length, errors.slice(0, 3));
  if (errors.length) fails++;
  await closeAll();
  console.log(fails ? 'FAIL ' + fails : 'ALL PASS');
  process.exit(fails ? 1 : 0);
})().catch(async (e) => { console.error(e); await closeAll(); process.exit(1); });
