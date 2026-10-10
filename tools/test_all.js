#!/usr/bin/env node
// tools/test_all.js — the single end-to-end regression runner (integration). Runs every self-test and tool in
// sequence, writes each step's full output to test-output/test_all/<step>.log, prints a summary table and exits
// 1 if any step fails.
//
//   node tools/test_all.js                     everything (≈ 6.5 min on a 16-core machine)
//   node tools/test_all.js --quick             skip the slow, rarely-affected steps (motor, audio, art, plan_render,
//                                              playthrough, e2e_dist) — about 2 min
//   node tools/test_all.js --only engine,ui    run only these steps (names from --list)
//   node tools/test_all.js --skip art,audio    run everything except these
//   node tools/test_all.js --from smoke        start at this step
//   node tools/test_all.js --list              list the steps
//   node tools/test_all.js --keep-going=false  stop at the first failure (default: run everything)
//
// Steps run sequentially on purpose: several self-tests measure frame timings, and parallel runs make them noisy.
'use strict';
const fs = require('fs');
const path = require('path');
const { spawn } = require('child_process');

const ROOT = path.resolve(__dirname, '..');
const LOGS = path.join(ROOT, 'test-output', 'test_all');

// name, command (args after `node`), description, slow (skipped by --quick)
const STEPS = [
  ['audit', ['tools/audit.js'], 'static contracts: scripts, syntax, canvas rules, audio names, text keys'],
  ['text', ['tools/text_check.js', '--quiet'], 'G.Text / G.Items schemas, counts, conditions, NPC talk reachability'],
  ['motor', ['tools/motor_metrics.js'], 'player motor vs TECH_SPEC §8.2 metrics (≈ 2.5 min)', true],
  ['engine', ['tools/engine_selftest.js'], 'engine: physics, rooms, transitions, death, save, perf'],
  ['player', ['tools/player_selftest.js'], 'the Wickling: moves, Brand, spells, sigils, damage, sheets'],
  ['ui', ['tools/ui_selftest.js'], 'every UI screen with fixtures + screenshots'],
  ['interact', ['tools/interact_selftest.js'], 'interactables, NPCs, wisp, cinders, events'],
  ['enemies', ['tools/enemy_selftest.js'], 'enemy/boss framework, shore enemies, doc examples, perf'],
  ['audio', ['tools/audio_check.js'], 'offline render of every sfx/track/ambience/stinger', true],
  ['art', ['tools/art_lab.js'], 'every region art preview + timings', true],
  ['plan_check', ['tools/plan_check.js'], 'design/world_plan.json consistency + progression'],
  ['plan_render', ['tools/plan_render.js'], 'design/world_map.png', true],
  ['validate', ['tools/validate.js', '--dev'], 'static validation of all room data (incl. dev rooms)'],
  ['tools', ['tools/fixtures/selftest.js'], 'self-test of validate/reach/build with fixtures'],
  ['reach_fx', ['tools/reach.js', '--plan', 'tools/fixtures/reach_plan.json', '--data-only', '--data', 'tools/fixtures/reach_rooms.js', '--dev', '--expect'], 'reach: motor-rule fixtures (gaps, ledges, gates)'],
  ['reach_plan_fx', ['tools/reach.js', '--data-only', '--data', 'tools/fixtures/plan_rooms.js', '--room', 'sh_01,sh_02,mw_03,dn_12'], 'reach: four real plan rooms built as fixtures'],
  ['reach', ['tools/reach.js'], 'reach: every built room against the world plan'],
  ['reach_margin', ['tools/reach.js', '--margin'], 'reach: plan paths/spots still work with a handicapped motor (no zero-margin moves on the critical path)'],
  ['smoke', ['tools/smoke.js'], 'title → new game → play, save/continue, every room toured'],
  ['e2e', ['tools/e2e.js'], 'the real boot flow end to end (title … wisp … continue)'],
  ['playthrough', ['tools/playthrough.js'], 'the whole critical path played in the real game: New Game → both endings (≈ 5 min)', true],
  ['build', ['tools/build.js'], 'dist/Gutterlight.html (single file) + boot verification'],
  ['e2e_dist', ['tools/e2e.js', '--file', 'dist/Gutterlight.html'], 'the end-to-end flow on the single-file build', true],
];

function parseArgs(argv) {
  const a = { only: null, skip: new Set(), from: null, quick: false, list: false, keepGoing: true };
  for (let i = 2; i < argv.length; i++) {
    const k = argv[i];
    const v = () => argv[++i] || '';
    if (k === '--only') a.only = new Set(v().split(','));
    else if (k === '--skip') for (const s of v().split(',')) a.skip.add(s);
    else if (k === '--from') a.from = v();
    else if (k === '--quick') a.quick = true;
    else if (k === '--list') a.list = true;
    else if (k === '--keep-going=false' || k === '--bail') a.keepGoing = false;
    else if (k === '--help' || k === '-h') a.help = true;
    else { console.error('test_all: unknown argument ' + k); process.exit(2); }
  }
  return a;
}

// Summary text for a step: the most informative line of its output.
function summarize(out) {
  const lines = out.split('\n').map((l) => l.trim()).filter(Boolean);
  const pick = [...lines].reverse().find((l) => /^(ALL PASS|FAILED|OK|PASS|FAIL|build:|verify:|SMOKE|wrote|ERROR)/.test(l) || /\d+ (passed|checks|error)/.test(l));
  return (pick || lines[lines.length - 1] || '').replace(/\s+/g, ' ').slice(0, 90);
}

function runStep(name, args) {
  return new Promise((resolve) => {
    const t0 = Date.now();
    const child = spawn(process.execPath, args, { cwd: ROOT, env: process.env });
    let out = '';
    child.stdout.on('data', (d) => { out += d; });
    child.stderr.on('data', (d) => { out += d; });
    child.on('close', (code, signal) => {
      fs.writeFileSync(path.join(LOGS, name + '.log'), '$ node ' + args.join(' ') + '\n\n' + out + '\n[exit ' + (code == null ? signal : code) + ']\n');
      resolve({ name, code: code == null ? 1 : code, sec: (Date.now() - t0) / 1000, summary: summarize(out) });
    });
    child.on('error', (err) => resolve({ name, code: 1, sec: (Date.now() - t0) / 1000, summary: 'spawn failed: ' + err.message }));
  });
}

(async () => {
  const A = parseArgs(process.argv);
  if (A.help) { const L = fs.readFileSync(__filename, 'utf8').split('\n'); console.log(L.slice(1, L.findIndex((l, i) => i > 0 && !l.startsWith('//'))).join('\n')); return; }
  if (A.list) { for (const [n, args, d, slow] of STEPS) console.log(n.padEnd(14) + (slow ? '(slow) ' : '       ') + d + '\n               node ' + args.join(' ')); return; }
  fs.mkdirSync(LOGS, { recursive: true });
  let steps = STEPS;
  if (A.from) { const i = steps.findIndex((s) => s[0] === A.from); if (i < 0) { console.error('test_all: unknown step ' + A.from); process.exit(2); } steps = steps.slice(i); }
  if (A.only) {
    for (const n of A.only) if (!STEPS.some((s) => s[0] === n)) { console.error('test_all: unknown step ' + n); process.exit(2); }
    steps = steps.filter((s) => A.only.has(s[0]));
  }
  steps = steps.filter((s) => !A.skip.has(s[0]) && !(A.quick && s[3] && !(A.only && A.only.has(s[0]))));
  const t0 = Date.now();
  const results = [];
  console.log('GUTTERLIGHT test_all — ' + steps.length + ' step(s); logs in ' + path.relative(ROOT, LOGS) + '/\n');
  for (const [name, args] of steps) {
    process.stdout.write(('  ' + name).padEnd(16) + '… ');
    const r = await runStep(name, args);
    results.push(r);
    console.log((r.code === 0 ? 'ok  ' : 'FAIL') + ('  ' + r.sec.toFixed(1) + ' s').padStart(10));
    if (r.code !== 0 && !A.keepGoing) break;
  }
  const failed = results.filter((r) => r.code !== 0);
  console.log('\n  ' + 'step'.padEnd(14) + 'result  ' + 'time'.padStart(8) + '   summary');
  console.log('  ' + '-'.repeat(14) + ' ------ ' + '-'.repeat(8) + '   ' + '-'.repeat(60));
  for (const r of results) console.log('  ' + r.name.padEnd(14) + (r.code === 0 ? 'PASS  ' : 'FAIL  ') + (r.sec.toFixed(1) + ' s').padStart(9) + '   ' + r.summary);
  const total = ((Date.now() - t0) / 1000).toFixed(0);
  console.log('\n' + (failed.length ? 'FAILED ' + failed.length + ' of ' + results.length + ' step(s): ' + failed.map((r) => r.name).join(', ') + '  (see test-output/test_all/<step>.log)'
    : 'ALL PASS (' + results.length + ' steps)') + ' in ' + total + ' s');
  process.exit(failed.length ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(3); });
