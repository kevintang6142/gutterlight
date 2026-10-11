#!/usr/bin/env node
// tools/rebind_check.js — regressions of the rebinding QA round (complements tools/input_check.js). Runs, each in its
// own headless page (real keyboard events + a mocked gamepad):
//   tools/rebind/engine_fixes.js  menus ignore gameplay meaning of fallback inputs (jump on an arrow never confirms),
//                                 Alt/Ctrl browser shortcuts blocked when bound, Meta refused, Pause keeps a pad input,
//                                 labels never show the other device
//   tools/rebind/ui_fixes.js      pause/inventory on pad A, pad capture cancel + timeout, Enter refused by the capture,
//                                 capture prompt by device, world prompt keycap, no urn count drawn
//   tools/rebind/notes.js         Controls notes: system key, 'Pause needs a gamepad button.', Ctrl+W/T/N warning;
//                                 Enter reserved in setBinding and dropped on load
// Usage: node tools/rebind_check.js [--file dist/Gutterlight.html]   exit 0 = ALL PASS
'use strict';
const path = require('path');
const { spawnSync } = require('child_process');

const extra = process.argv.slice(2);
const parts = ['engine_fixes', 'ui_fixes', 'notes'];
let bad = 0;
for (const p of parts) {
  const t0 = Date.now();
  const r = spawnSync(process.execPath, [path.join(__dirname, 'rebind', p + '.js'), ...extra], { encoding: 'utf8', timeout: 300000 });
  const out = (r.stdout || '') + (r.stderr || '');
  const fails = out.split('\n').filter((l) => /^FAIL/.test(l));
  const ok = r.status === 0;
  if (!ok) bad++;
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${p.padEnd(13)} ${((Date.now() - t0) / 1000).toFixed(1)} s` + (ok ? '' : `  (exit ${r.status})`));
  if (!ok) console.log((fails.length ? fails : out.split('\n').slice(-15)).map((l) => '      ' + l).join('\n'));
}
console.log(bad ? `FAILED (${bad}/${parts.length})` : `ALL PASS (${parts.length} parts)`);
process.exit(bad ? 1 : 0);
