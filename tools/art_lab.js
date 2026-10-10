#!/usr/bin/env node
// tools/art_lab.js — headless art lab runner. Renders every region through the full art pipeline
// (tools/art_lab.html) at several sample rooms/cameras and writes screenshots, contact sheets and
// performance numbers.
//
//   node tools/art_lab.js                       all regions → test-output/art/<region>_<n>.png
//   node tools/art_lab.js --regions guttered,nave
//   node tools/art_lab.js --sheets              also props.png + characters.png
//   node tools/art_lab.js --only-sheets
//   node tools/art_lab.js --perf                per-frame stage timings + prepareRoom (incl. 128x54)
//   node tools/art_lab.js --shots 0,1           only these shot indices
//   node tools/art_lab.js --nolight             skip the darkness pass (files *_raw.png)
//
// Exit code 1 if any console/page errors occurred.
'use strict';
const path = require('path');
const fs = require('fs');
const { openGame, closeAll, ROOT } = require('./lib/browser');

const OUT = path.join(ROOT, 'test-output', 'art');
// [roomIndex, camIndex, theme]
const SHOTS = [
  [0, 0, null], // hall: west side, pool, platforms, outcrop
  [0, 1, null], // hall: glazed wall, breakable, bg wall
  [1, 1, null], // shaft: lava bottom, wall spikes
  [2, 0, null], // tunnel: low ceiling, flooded, dive floor
  [3, 0, { bg: 'sky' }], // surface with open sky
];

function parse(argv) {
  const a = { regions: null, sheets: false, onlySheets: false, perf: false, shots: null, noLight: false, suffix: '' };
  for (let i = 2; i < argv.length; i++) {
    const k = argv[i];
    if (k === '--regions') a.regions = argv[++i].split(',');
    else if (k === '--sheets') a.sheets = true;
    else if (k === '--only-sheets') { a.sheets = true; a.onlySheets = true; }
    else if (k === '--perf') a.perf = true;
    else if (k === '--shots') a.shots = argv[++i].split(',').map(Number);
    else if (k === '--nolight') { a.noLight = true; a.suffix = '_raw'; }
    else { console.error('unknown arg', k); process.exit(2); }
  }
  return a;
}

(async () => {
  const a = parse(process.argv);
  fs.mkdirSync(OUT, { recursive: true });
  const { page, errors } = await openGame({ file: 'tools/art_lab.html', query: 'auto=1', waitFor: 'window.LAB && LAB.ready', timeout: 30000 });
  const regions = a.regions || (await page.evaluate(() => LAB.REGIONS));
  const canvas = await page.$('#c');
  if (!a.onlySheets) {
    for (const region of regions) {
      for (let n = 0; n < SHOTS.length; n++) {
        if (a.shots && !a.shots.includes(n)) continue;
        const [ri, ci, theme] = SHOTS[n];
        const info = await page.evaluate(([r, ri2, ci2, th, nl]) => LAB.render(r, ri2, ci2, { theme: th || undefined, noLight: nl }), [region, ri, ci, theme, a.noLight]);
        const file = path.join(OUT, `${region}_${n}${a.suffix}.png`);
        await canvas.screenshot({ path: file });
        console.log(`${path.relative(ROOT, file)}  prep ${info.prepMs} ms  lights ${info.lights}  ${JSON.stringify(info.timing)}`);
      }
      await page.evaluate(() => LAB.clear());
    }
  }
  if (a.sheets) {
    for (const [name, fn] of [['props', 'propsSheet'], ['characters', 'charSheet']]) {
      const ok = await page.evaluate((f) => (typeof LAB[f] === 'function' ? (LAB[f](), true) : false), fn);
      if (!ok) { console.log(`(no ${fn} in lab yet)`); continue; }
      const file = path.join(OUT, `${name}.png`);
      await canvas.screenshot({ path: file });
      console.log(path.relative(ROOT, file));
    }
  }
  if (a.perf) {
    const results = {};
    for (const region of regions) {
      const unflushed = await page.evaluate((r) => LAB.perf(r, 0, 0, 120, false), region);
      const flushed = await page.evaluate((r) => LAB.perf(r, 0, 0, 60, true), region);
      results[region] = { unflushed, flushed };
      console.log(`perf ${region}: flushed ${JSON.stringify(flushed)}`);
      await page.evaluate(() => LAB.clear());
    }
    for (const region of regions) {
      const big = await page.evaluate((r) => LAB.bigRoomPrep(r, 128, 54), region);
      console.log(`prepareRoom 128x54 ${region}: ${big.ms} ms ${JSON.stringify(big.timing)}`);
      results[region].big = big;
      await page.evaluate(() => LAB.clear());
    }
    fs.writeFileSync(path.join(OUT, 'perf.json'), JSON.stringify(results, null, 2));
  }
  if (errors.length) {
    console.log(`ERRORS (${errors.length}):`);
    for (const e of errors.slice(0, 40)) console.log('  ' + e);
  } else console.log('no errors');
  await closeAll();
  process.exit(errors.length ? 1 : 0);
})().catch(async (e) => { console.error(e); await closeAll(); process.exit(3); });
