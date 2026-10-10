#!/usr/bin/env node
// tools/build.js — single-file build: inlines every <script src> of index.html (in order) into
// dist/Gutterlight.html, keeps everything else (styles, canvas, markup) verbatim, then verifies that the
// built file boots headless with no errors.
//
//   node tools/build.js                 build + verify (exit 1 on a missing script or any runtime error)
//   node tools/build.js --no-verify     build only
//   node tools/build.js --out dist/x.html --frames 240
//
// Each source file becomes its own classic <script> element (same semantics as the separate files: a
// syntax error in one file does not stop the others). Inside sources, '</script' is escaped as '<\/script'
// and '<!--' as '<\!--' so the HTML parser can never end or mis-parse a script block early (both escapes
// are no-ops inside JS strings / comments / regexes, where these sequences can legally appear).
'use strict';
const fs = require('fs');
const path = require('path');
const zlib = require('zlib');

const ROOT = path.resolve(__dirname, '..');

function parseArgs(argv) {
  const a = { out: 'dist/Gutterlight.html', verify: true, frames: 180, query: 'test=1&paused=1&mute=1' };
  for (let i = 2; i < argv.length; i++) {
    const k = argv[i];
    if (k === '--no-verify') a.verify = false;
    else if (k === '--out') a.out = argv[++i];
    else if (k === '--frames') a.frames = parseInt(argv[++i], 10) || 0;
    else if (k === '--help' || k === '-h') { a.help = true; }
    else { console.error('build: unknown argument ' + k); process.exit(2); }
  }
  return a;
}

function escapeScript(src) {
  let n = 0;
  const out = src
    .replace(/<\/script/gi, (m) => { n++; return '<\\/' + m.slice(2); })
    .replace(/<!--/g, () => { n++; return '<\\!--'; });
  return { text: out, escapes: n };
}

// → {html, scripts:[{src, bytes}], missing:[src], escapes}
function build(indexHtml, root) {
  const scripts = [], missing = [];
  let escapes = 0;
  const re = /<script\b([^>]*?)\bsrc\s*=\s*(["'])([^"']+)\2([^>]*)>\s*<\/script\s*>/gi;
  const html = indexHtml.replace(re, (whole, pre, q, src) => {
    const rel = src.replace(/^\.\//, '');
    const file = path.join(root, rel);
    if (!fs.existsSync(file)) { missing.push(rel); return whole; }
    let code = fs.readFileSync(file, 'utf8');
    if (code.charCodeAt(0) === 0xfeff) code = code.slice(1);
    const esc = escapeScript(code);
    escapes += esc.escapes;
    scripts.push({ src: rel, bytes: Buffer.byteLength(code) });
    return '<script>/* ' + rel + ' */\n' + esc.text + (esc.text.endsWith('\n') ? '' : '\n') + '</script>';
  });
  return { html, scripts, missing, escapes };
}

async function verify(outFile, frames, query) {
  const { openGame, closeAll } = require('./lib/browser');
  const problems = [];
  try {
    // 1) test boot: new in-memory game, step frames
    const t = await openGame({ file: outFile, query });
    const st = await t.page.evaluate((n) => {
      const r = G.debug && G.debug.step ? G.debug.step(n) : null;
      return { ready: !!G.ready, mode: G.game && G.game.mode, room: G.game && G.game.room && G.game.room.id, step: r,
        scripts: document.querySelectorAll('script[src]').length };
    }, frames);
    problems.push(...t.errors.map((e) => 'test boot: ' + e));
    if (!st.ready) problems.push('test boot: G.ready is false');
    if (st.scripts) problems.push('test boot: ' + st.scripts + ' external <script src> left in the build');
    await t.context.close();
    // 2) normal boot (title screen) with real timers for a moment
    const b = await openGame({ file: outFile, query: 'mute=1' });
    await b.page.waitForTimeout(600);
    const mode = await b.page.evaluate(() => G.game && G.game.mode);
    problems.push(...b.errors.map((e) => 'title boot: ' + e));
    await b.context.close();
    return { problems, state: st, titleMode: mode };
  } finally {
    await closeAll();
  }
}

async function main() {
  const a = parseArgs(process.argv);
  if (a.help) { console.log(fs.readFileSync(__filename, 'utf8').split('\n').slice(1, 14).join('\n')); return 0; }
  const indexPath = path.join(ROOT, 'index.html');
  const res = build(fs.readFileSync(indexPath, 'utf8'), ROOT);
  if (res.missing.length) {
    console.error('build: FAILED — missing script file(s):\n  ' + res.missing.join('\n  '));
    return 1;
  }
  const outAbs = path.resolve(ROOT, a.out);
  fs.mkdirSync(path.dirname(outAbs), { recursive: true });
  fs.writeFileSync(outAbs, res.html);
  const bytes = Buffer.byteLength(res.html);
  const gz = zlib.gzipSync(res.html, { level: 9 }).length;
  const kb = (n) => (n / 1024).toFixed(1) + ' KB';
  console.log('build: ' + path.relative(ROOT, outAbs) + ' — ' + res.scripts.length + ' scripts inlined, ' + kb(bytes) +
    ' (' + kb(gz) + ' gzipped)' + (res.escapes ? ', ' + res.escapes + ' sequence(s) escaped' : ''));
  const top = res.scripts.slice().sort((x, y) => y.bytes - x.bytes).slice(0, 5);
  console.log('  largest: ' + top.map((s) => s.src + ' ' + kb(s.bytes)).join(', '));
  if (!a.verify) return 0;
  const v = await verify(path.relative(ROOT, outAbs), a.frames, a.query);
  if (v.problems.length) {
    console.error('build: VERIFY FAILED (' + v.problems.length + '):');
    for (const p of v.problems.slice(0, 40)) console.error('  ' + p);
    return 1;
  }
  console.log('verify: OK — boots with no errors (test mode: mode=' + v.state.mode + ', room=' + v.state.room +
    ', ' + a.frames + ' frames stepped; normal boot: mode=' + v.titleMode + ')');
  return 0;
}

if (require.main === module) {
  main().then((code) => process.exit(code), (e) => { console.error(e); process.exit(3); });
}
module.exports = { build, escapeScript };
