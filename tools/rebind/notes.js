'use strict';
// Controls screen notes (system key, Pause without a pad button, Ctrl+W/T/N warning) and Enter reserved in the engine
// (module rebind-reverify). Run by tools/rebind_check.js.
const { openGame, closeAll } = require('../lib/browser');
const file = process.argv.indexOf('--file') > 0 ? process.argv[process.argv.indexOf('--file') + 1] : undefined;
let fails = 0;
const check = (n, ok, v) => { console.log((ok ? 'ok  ' : 'FAIL') + ' ' + n + ' ' + JSON.stringify(v)); if (!ok) fails++; };
(async () => {
  const { page, errors } = await openGame(Object.assign({ query: 'test=1&paused=1&room=dev_shaft&tx=10&ty=34&seed=7&mute=1&god=1' }, file ? { file } : {}));
  const ev = (fn, a) => page.evaluate(fn, a);
  await ev(() => {
    window.T = { step: (n) => { for (let i = 0; i < (n || 1); i++) G.game.step(); } };
    window.reset = () => { G.input.cancelCapture && G.input.cancelCapture(); G.UI.closeAll(false); G.input.resetBindings({ noSave: true }); T.step(5); };
    window.cap = (a, col, id) => {
      const s = G.UI.top(); s.row = G.input.GAME_ACTIONS.indexOf(a); s.col = col; s.note = '';
      s.captured({ input: id });
      return { note: s.note, bad: s.noteBad, capturing: !!s.capturing, b: G.input.getBindings()[a] };
    };
    G.input.lastDevice = 'keyboard'; G.UI.openControls(); T.step(10);
  });
  let r = await ev(() => cap('jump', 0, 'key:Meta'));
  check('Meta refused with system-key note, keeps listening', /system key/.test(r.note) && r.bad && r.capturing && r.b.indexOf('key:Meta') < 0, r);
  await ev(() => reset()); await ev(() => { G.UI.openControls(); T.step(10); });
  r = await ev(() => { cap('jump', 1, 'key:Control'); return cap('attack', 1, 'key:KeyW'); });
  check('Ctrl + W bound -> ctrl warning note', /Ctrl\+W/.test(r.note) && !r.bad && r.b.indexOf('key:KeyW') >= 0, r);
  await ev(() => reset()); await ev(() => { G.UI.openControls(); T.step(10); });
  r = await ev(() => { const c = G.input.clearBinding('dash', 2); const s = G.UI.top(); return [c, cap('dash', 2, 'pad:9')]; });
  check('Start on Dash (no pad input to swap) -> "Pause needs a gamepad button."', r[1].note === 'Pause needs a gamepad button.' && r[1].bad, r);
  r = await ev(() => { const s = G.UI.top(); s.row = G.input.GAME_ACTIONS.indexOf('pause'); s.col = 2; s.note = ''; s.clearCell(); return { note: s.note, b: G.input.getBindings().pause }; });
  check('clearing Pause pad slot: note text', r.b.indexOf('pad:9') < 0 || /gamepad button|at least one/.test(r.note), r);
  await ev(() => reset());
  r = await ev(() => [G.input.setBinding('jump', 0, 'key:Enter'), G.input.setBinding('left', 1, 'key:NumpadEnter')]);
  check('setBinding refuses Enter/NumpadEnter (reserved)', r[0].reason === 'reserved' && r[1].reason === 'reserved', r);
  r = await ev(() => { const s = G.input.serializeBindings(); s.slots.jump[0] = 'key:Enter'; return G.input.loadBindings(s).slots.jump; });
  check('Enter dropped on load (slot falls back to default)', r.indexOf('key:Enter') < 0, r);
  await ev(() => reset());
  r = await ev(() => { const T2 = G.Text.ui; return [T2.capturePromptKey, T2.capturePromptPad, T2.controlsFallbackKey, T2.controlsFallbackPad, T2.bindLastPad, T2.bindOsKey, T2.bindCtrlWarn].every((x) => typeof x === 'string'); });
  check('text keys present', r, r);
  check('no page errors', errors.length === 0, errors);
  await closeAll();
  console.log(fails ? 'FAILS ' + fails : 'ALL PASS');
  process.exit(fails ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(2); });
