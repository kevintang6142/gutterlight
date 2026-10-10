#!/usr/bin/env node
// tools/fixtures/selftest.js — regression test of the QA tools themselves (validate.js, reach.js, build.js).
// Every planted defect in the fixtures must be reported, every known-possible traversal must pass and every
// known-impossible one must fail.
//
//   node tools/fixtures/selftest.js            (~30 s; uses the reach cache — add --no-cache to force)
//   node tools/fixtures/selftest.js --quick    validate + build checks only (no reach)
'use strict';
const path = require('path');
const { spawnSync } = require('child_process');

const ROOT = path.resolve(__dirname, '..', '..');
const args = process.argv.slice(2);
const QUICK = args.includes('--quick');
const NOCACHE = args.includes('--no-cache') ? ['--no-cache'] : [];
let pass = 0, fail = 0;

function run(script, argv) {
  const r = spawnSync(process.execPath, [path.join(ROOT, script)].concat(argv), { cwd: ROOT, encoding: 'utf8', maxBuffer: 64 << 20 });
  let json = null;
  try { json = JSON.parse(r.stdout); } catch (e) { /* not json */ }
  return { code: r.status, out: r.stdout, err: r.stderr, json };
}
function check(name, ok, detail) {
  if (ok) { pass++; console.log('  PASS ' + name); } else { fail++; console.log('  FAIL ' + name + (detail ? '\n       ' + String(detail).split('\n').slice(0, 12).join('\n       ') : '')); }
}
const has = (list, room, code, re) => list.some((x) => (room == null || x.scope === room) && (!code || x.code === code) && (!re || re.test(x.msg)));

// ------------------------------------------------------------------------------------------------ build
console.log('build.js');
{
  const { escapeScript, build } = require('../build.js');
  const e = escapeScript('a = "</script>"; b = "<!-- x"; c = "</SCRIPT >";');
  check('escapes </script (any case) and <!--', e.escapes === 3 && !/<\/script/i.test(e.text) && !/<!--/.test(e.text), e.text);
  const fs = require('fs');
  const html = '<html><body><script src="src/core/namespace.js"></script>\n<script src="missing/nope.js"></script></body></html>';
  const b = build(html, ROOT);
  check('inlines scripts in order and reports missing files', b.scripts.length === 1 && b.missing[0] === 'missing/nope.js' && b.html.includes('/* src/core/namespace.js */'), JSON.stringify(b.missing));
  void fs;
}

// ------------------------------------------------------------------------------------------------ validate
console.log('validate.js');
{
  const r = run('tools/validate.js', ['--data-only', '--data', 'tools/fixtures/plan_rooms.js', '--room', 'sh_01,sh_02,mw_03,dn_12', '--json']);
  check('plan fixture rooms (sh_01 sh_02 mw_03 dn_12) validate with 0 errors', r.code === 0 && r.json && r.json.errors.length === 0, r.json ? JSON.stringify(r.json.errors, null, 1) : r.out + r.err);
}
{
  const r = run('tools/validate.js', ['--data-only', '--data', 'tools/fixtures/plan_rooms_broken.js', '--room', 'sh_01,sh_02,mw_03,dn_12', '--json']);
  const E = (r.json && r.json.errors) || [];
  check('broken copies → exit 1', r.code === 1);
  check('  shifted exit E1 reported against the plan', has(E, 'sh_02', 'plan-exit', /E1.*rows 11-13.*built rows 10-12/));
  check('  unknown lore id', has(E, 'sh_02', 'entity', /lore_sh_99/));
  check('  floating pickup without floor', has(E, 'sh_02', 'entity', /sh_hw_extra.*no floor/));
  check('  unplanned pickup', has(E, 'sh_02', 'plan-content', /unplanned pickup/));
  check('  planned lore missing', has(E, 'sh_02', 'plan-content', /lore:lore_sh_2.*missing/));
  check('  floating water / open rims', has(E, 'mw_03', 'liquid', /floats/) && has(E, 'mw_03', 'liquid', /open side walls/));
  check('  gate opens an unknown lever (+ plan mismatch)', has(E, 'mw_03', 'ref', /mw_lv9/) && has(E, 'mw_03', 'plan-content', /opens "lever:mw_lv9"/));
}
{
  const r = run('tools/validate.js', ['--dev', '--no-plan', '--data-only', '--data', 'tools/fixtures/bad_rooms.js', '--room', 'fx_bad1,fx_bad2,fx_bad3,fx_bad4,fx_bad5', '--json']);
  const E = (r.json && r.json.errors) || [], Wn = (r.json && r.json.warnings) || [];
  check('bad rooms → exit 1', r.code === 1);
  const want = [
    ['fx_bad1', 'rows', /row lengths differ/], ['fx_bad1', 'grid', /multiples of 16/], ['fx_bad1', 'chars', /'\?'/],
    ['fx_bad1', 'legend', /marker 'q'/], ['fx_bad1', 'corner', /corner tile \(0,0\)/], ['fx_bad1', 'opening', /leads to no room/],
    ['fx_bad2', 'dims', /width 40/], ['fx_bad2', 'liquid', /lava pool.*floats/], ['fx_bad2', 'liquid', /touches the other liquid/],
    ['fx_bad2', 'entity', /unknown entity type "teleporter"/], ['fx_bad2', 'entity', /sconce at .*missing required prop `id`/],
    ['fx_bad2', 'entity', /lore_nope_1/], ['fx_bad2', 'entity', /wren_9/], ['fx_bad2', 'entity', /unknown ability "teleport"/],
    ['fx_bad2', 'entity', /no_such_sigil/], ['fx_bad2', 'ref', /cannot parse term "\?\?"/], ['fx_bad2', 'entity', /unknown boss "dragon"/],
    ['fx_bad2', 'entity', /trigger .* leaves the room/], ['fx_bad2', 'entity', /fx_sconce_rock.*stands inside/],
    ['fx_bad2', 'entity', /lanternway.*no floor/], ['fx_bad2', 'entity', /space_goblin/],
    ['fx_bad3', 'opening', /faces closed tiles of fx_bad4/], ['fx_bad4', 'overlap', /overlaps room fx_bad5/],
  ];
  for (const [room, code, re] of want) check('  ' + room + ' [' + code + '] ' + re.source, has(E, room, code, re), JSON.stringify(E.filter((x) => x.scope === room).map((x) => x.msg)));
  check('  unused legend key is a warning', has(Wn, 'fx_bad1', 'legend', /legend key 'z'/));
  const w = run('tools/validate.js', ['--dev', '--no-plan', '--data-only', '--data', 'tools/fixtures/bad_rooms.js', '--json']);
  const WE = (w.json && w.json.errors) || [];
  check('  world mode: room id defined twice', has(WE, 'fx_bad5', 'id', /defined twice/), JSON.stringify(WE.filter((x) => x.code === 'id')));
  check('  world mode: pickup id used in two rooms', has(WE, null, 'id', /pickup:fx_dup is used 2 times/), JSON.stringify(WE.filter((x) => x.code === 'id')));
}

// ------------------------------------------------------------------------------------------------ plan orders
{
  console.log('plan orders (tools/plan_check.js --orders-json → maximal pre-ability sets)');
  const PlanLib = require('../lib/plan');
  const o = PlanLib.abilityOrders().orders;
  const mb = (x, others) => PlanLib.maxBefore(o, x, others || []);
  check('  world plan: feasible orders found; dash ← [], grip ← [dash], wings ← [dash, grip, oilcloak, plunge]',
    o.length > 0 && mb('dash').set.join() === '' && mb('grip').set.join() === 'dash' && mb('wings').set.join() === 'dash,grip,oilcloak,plunge', o.length + ' orders');
  check('  an order constraint that no order satisfies yields no set (grip while holding wings)', mb('grip', ['wings']).orders === 0);
}

// ------------------------------------------------------------------------------------------------ reach
if (!QUICK) {
  console.log('reach.js');
  {
    const r = run('tools/reach.js', ['--plan', 'tools/fixtures/reach_plan.json', '--data-only', '--data', 'tools/fixtures/reach_rooms.js', '--dev', '--expect', '--json'].concat(NOCACHE));
    const rooms = (r.json && r.json.rooms) || {};
    const items = Object.entries(rooms).flatMap(([id, x]) => (x.items || []).map((i) => Object.assign({ room: id }, i)));
    check('fixture plan: every expectation holds (exit 0, no errors)', r.code === 0 && r.json && r.json.errors === 0, items.filter((i) => i.level === 'error').map((i) => i.room + ': ' + i.msg).join('\n') || r.err.slice(-2000));
    const ok = (room, re) => items.some((i) => i.room === room && i.level === 'pass' && re.test(i.msg));
    check('  10-tile gap: impossible without dash, possible with dash / wings', ok('fx_gap10', /unreachable as expected: spot tile:40,13/) && ok('fx_gap10', /path W1→E1 \[dash\] \| \[wings\]/) && ok('fx_gap10', /W1→E1 blocked without dash/));
    check('  7-tile ledge: needs wings (dash is not enough)', ok('fx_climb', /spot tile:31,15 from W1 \[wings\]/) && ok('fx_climb', /unreachable as expected: spot tile:31,15 from W1 \[dash\]/) && ok('fx_climb', /tile:31,15 from W1 blocked without wings/));
    check('  12-tile gap: impossible even with dash', ok('dev_02', /unreachable as expected: spot tile:62,15 from W1 \[dash\]/));
    check('  glazed wall: cannot be climbed with grip (+ dash + wings)', ok('fx_climb', /unreachable as expected: spot tile:61,10/));
    check('  grippable pillar: needs grip', ok('dev_shaft', /tile:14,5 from S1 \[grip\]/) && ok('dev_shaft', /tile:14,5 from S1 blocked without grip/));
    check('  wide water / low flooded tunnel: need oilcloak', ok('dev_water', /tile:26,15 from E1 blocked without oilcloak/) && ok('dev_water', /unreachable as expected: spot tile:26,15 from E1 \[dash\]/) && ok('dev_water', /unreachable as expected: spot tile:4,15/));
    check('  D floor: plunge only; B wall: broken with the Brand', ok('fx_dive', /tile:30,24 from W1 blocked without plunge/) && ok('fx_dive', /geode:fx_geo_b from W1 \[\] \(and back\)/) && ok('dev_below', /tile:40,15 from N1 \[\]/));
    const warned = (room, re) => items.some((i) => i.room === room && i.level === 'warning' && re.test(i.msg));
    const ao = (r.json && r.json.abilityOrders) || {};
    check('  gate vs maximal pre-ability set: orders from the plan ("abilityOrders"), grip ← [dash], wings ← [dash, grip, oilcloak]',
      ao.source === 'plan.abilityOrders' && JSON.stringify(ao.before && ao.before.grip) === '["dash"]' && JSON.stringify(ao.before && ao.before.wings) === '["dash","grip","oilcloak"]', ao);
    check('  grip pillar reachable by a dash-jump: GATE LEAK against [dash] (impossible with [])',
      warned('fx_order', /GATE LEAK: spot tile:38,15 from W1 needs \[grip\] but is possible WITHOUT grip \(with \[dash\]\)/) && ok('fx_order', /unreachable as expected: spot tile:38,15 from W1 \[\]/));
    check('  wings ledge holds even with the pre-wings set [dash, grip, oilcloak]', ok('fx_climb', /tile:31,15 from W1 blocked without wings \(even with dash, grip, oilcloak\)/));
  }
  {
    const r = run('tools/reach.js', ['--data-only', '--data', 'tools/fixtures/plan_rooms.js', '--room', 'sh_01,sh_02,mw_03,dn_12', '--json'].concat(NOCACHE));
    check('plan fixture rooms: all plan paths/spots/gates hold, no warnings', r.code === 0 && r.json && r.json.errors === 0 && r.json.warnings === 0,
      r.json ? Object.entries(r.json.rooms).flatMap(([id, x]) => (x.items || []).filter((i) => i.level !== 'pass').map((i) => id + ': ' + i.msg)).join('\n') : r.err.slice(-2000));
    const items = r.json ? Object.entries(r.json.rooms).flatMap(([id, x]) => (x.items || []).map((i) => Object.assign({ room: id }, i))) : [];
    check('  horizontal lever grate (mw_03, w4 h1) blocks both ways without the lever', items.some((i) => i.room === 'mw_03' && /N1→S1 blocked without lever:mw_lv1/.test(i.msg)) && items.some((i) => i.room === 'mw_03' && /S1→N1 blocked without lever:mw_lv1/.test(i.msg)));
    check('  one-way room dn_12: the Ice Stair works up (grip) and W1→S1 stays impossible', items.some((i) => i.room === 'dn_12' && /path S1→W1 \[grip\]/.test(i.msg)) && !items.some((i) => i.room === 'dn_12' && i.kind === 'oneway'));
  }
  {
    const r = run('tools/reach.js', ['--data-only', '--data', 'tools/fixtures/plan_rooms_broken.js', '--room', 'sh_01,sh_02,mw_03,dn_12', '--global', '--json'].concat(NOCACHE));
    const items = r.json ? Object.entries(r.json.rooms).flatMap(([id, x]) => (x.items || []).map((i) => Object.assign({ room: id }, i))) : [];
    const find = (room, level, re) => items.some((i) => i.room === room && i.level === level && re.test(i.msg));
    check('broken copies → exit 1', r.code === 1);
    check('  exit built in the wrong place', find('sh_02', 'error', /exit E1 is built at E 10\+3 instead of E 11\+3/));
    check('  GATE LEAK: grip pickup reachable without grip (platforms)', find('sh_02', 'warning', /GATE LEAK: spot pickup:sh_hw1 from W1 needs \[grip\]/));
    check('  gate opening on the wrong lever blocks the planned paths', find('mw_03', 'error', /path N1→S1 is NOT possible with \[lever:mw_lv1\]/));
    check('  one-way violated: unplanned traversal reported as a warning', find('dn_12', 'warning', /unplanned traversal W1→S1 is possible/));
    check('  --global: the traversal is minimised and added for plan_check', r.json && r.json.global && r.json.global.added.some((a) => /dn_12 W1→S1 \[\]/.test(a)));
  }
  {
    // --margin: gw_10 as built before the baseline QA (rising in from the Nave cleared the S1 lip by 3.3 px)
    const base = ['--data-only', '--data', 'tools/fixtures/margin_rooms.js', '--room', 'gw_10', '--json'].concat(NOCACHE);
    const r0 = run('tools/reach.js', base);
    const r1 = run('tools/reach.js', base.concat(['--margin']));
    const items = (r) => (r.json && r.json.rooms && r.json.rooms.gw_10 ? r.json.rooms.gw_10.items : []);
    check('margin fixture: the normal run passes S1→N1', r0.code === 0 && items(r0).some((i) => i.level === 'pass' && /path S1→N1/.test(i.msg)), r0.out.slice(0, 400) + r0.err.slice(-400));
    check('  --margin flags S1→N1 as a near-exact move (warning: not on the critical path)', items(r1).some((i) => i.level === 'warning' && i.kind === 'margin' && /path S1→N1/.test(i.msg)), JSON.stringify(items(r1)).slice(0, 600));
  }
}

console.log('\n' + (fail ? 'FAIL' : 'OK') + ': ' + pass + ' passed, ' + fail + ' failed');
process.exit(fail ? 1 : 0);
