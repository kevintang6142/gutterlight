#!/usr/bin/env node
// Quick headless check: open the game, optionally run JS in the page, screenshot, report errors.
//
//   node tools/shot.js [--query "test=1&paused=1&room=gw_01"] [--eval "G.debug.step(120)"]
//                      [--out test-output/shot.png] [--wait 500] [--file index.html]
//                      [--evalFile path/to/script.js] [--frames N]
//
// --eval may be given multiple times; each is awaited in order (may return a promise).
// --frames N is shorthand for --eval "G.debug.step(N)".
// Exit code 1 if any console errors / page errors were captured, else 0.
'use strict';
const path = require('path');
const fs = require('fs');
const { openGame, closeAll, ROOT } = require('./lib/browser');

function parseArgs(argv) {
  const a = { evals: [], query: 'test=1&paused=1', out: path.join(ROOT, 'test-output', 'shot.png'), wait: 300, file: 'index.html' };
  for (let i = 2; i < argv.length; i++) {
    const k = argv[i], v = argv[i + 1];
    if (k === '--query') { a.query = v; i++; }
    else if (k === '--eval') { a.evals.push(v); i++; }
    else if (k === '--evalFile') { a.evals.push(fs.readFileSync(v, 'utf8')); i++; }
    else if (k === '--frames') { a.evals.push(`G.debug.step(${parseInt(v, 10)})`); i++; }
    else if (k === '--out') { a.out = path.resolve(v); i++; }
    else if (k === '--wait') { a.wait = parseInt(v, 10); i++; }
    else if (k === '--file') { a.file = v; i++; }
    else if (k === '--nowait') { a.noWait = true; }
    else { console.error('unknown arg', k); process.exit(2); }
  }
  return a;
}

(async () => {
  const a = parseArgs(process.argv);
  const { page, errors } = await openGame({ query: a.query, file: a.file, waitFor: a.noWait ? null : undefined });
  const results = [];
  for (const src of a.evals) {
    try {
      const r = await page.evaluate(`(async () => { return (${src}); })()`);
      results.push(r);
    } catch (e) {
      errors.push('[eval] ' + e.message.split('\n')[0]);
    }
  }
  await page.waitForTimeout(a.wait);
  fs.mkdirSync(path.dirname(a.out), { recursive: true });
  await page.screenshot({ path: a.out });
  for (const r of results) if (r !== undefined) console.log('eval result:', typeof r === 'string' ? r : JSON.stringify(r).slice(0, 4000));
  console.log('screenshot:', path.relative(ROOT, a.out));
  if (errors.length) {
    console.log(`ERRORS (${errors.length}):`);
    for (const e of errors.slice(0, 50)) console.log('  ' + e);
  } else console.log('no errors');
  await closeAll();
  process.exit(errors.length ? 1 : 0);
})().catch(async (e) => { console.error(e); await closeAll(); process.exit(3); });
