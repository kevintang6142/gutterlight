#!/usr/bin/env node
// tools/audit.js — static cross-module contract audit (integration). Exit 1 on any error.
//
//   node tools/audit.js [--verbose]
//
// Checks:
//   scripts  every <script src> in index.html exists; every src/**/*.js is listed in index.html
//   syntax   `node --check` on every src/ and tools/ .js file
//   canvas   no ctx.shadowBlur / ctx.filter outside the allowlist of one-time prerenders (TECH_SPEC §3)
//   audio    every sfx / music / ambience / stinger name used as a literal in src/ exists in G.Audio
//   text     every G.Text key used as a literal in src/ exists in src/data/text.js
'use strict';
const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');

const ROOT = path.resolve(__dirname, '..');
const VERBOSE = process.argv.includes('--verbose');
const rel = (p) => path.relative(ROOT, p).split(path.sep).join('/');

// One-time prerenders that may use shadowBlur/filter (never per frame).
const CANVAS_ALLOW = new Set(['src/ui/title.js']);

const results = [];
function report(name, errors, detail) {
  results.push({ name, ok: errors.length === 0 });
  console.log((errors.length ? 'FAIL  ' : 'PASS  ') + name.padEnd(10) + ' ' + (detail || ''));
  for (const e of errors.slice(0, VERBOSE ? 500 : 25)) console.log('        ' + e);
  if (!VERBOSE && errors.length > 25) console.log('        … ' + (errors.length - 25) + ' more (--verbose)');
}

function walk(dir, out) {
  for (const f of fs.readdirSync(dir)) {
    if (f === 'node_modules') continue;
    const p = path.join(dir, f);
    const st = fs.statSync(p);
    if (st.isDirectory()) walk(p, out);
    else if (p.endsWith('.js')) out.push(p);
  }
  return out;
}
const srcFiles = walk(path.join(ROOT, 'src'), []);
const toolFiles = walk(path.join(ROOT, 'tools'), []);
const lineOf = (s, i) => s.slice(0, i).split('\n').length;
const stripComments = (s) => s.replace(/\/\*[\s\S]*?\*\//g, (m) => m.replace(/[^\n]/g, ' ')).replace(/(^|[^:'"\\])\/\/[^\n]*/g, (m, a) => a + ' '.repeat(m.length - a.length));

// ------------------------------------------------------------------ scripts
function checkScripts() {
  const html = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');
  const listed = [...html.matchAll(/<script src="([^"]+)"><\/script>/g)].map((m) => m[1]);
  const errors = [];
  for (const s of listed) if (!fs.existsSync(path.join(ROOT, s))) errors.push('index.html lists a missing file: ' + s);
  const set = new Set(listed);
  for (const f of srcFiles) if (!set.has(rel(f))) errors.push('not loaded by index.html: ' + rel(f));
  const dup = listed.filter((s, i) => listed.indexOf(s) !== i);
  for (const d of dup) errors.push('listed twice: ' + d);
  report('scripts', errors, listed.length + ' scripts');
}

// ------------------------------------------------------------------ syntax
function checkSyntax() {
  const errors = [];
  for (const f of srcFiles.concat(toolFiles)) {
    try { execFileSync(process.execPath, ['--check', f], { stdio: 'pipe' }); } catch (e) { errors.push(rel(f) + ': ' + String(e.stderr || e.message).split('\n').slice(0, 4).join(' ')); }
  }
  report('syntax', errors, (srcFiles.length + toolFiles.length) + ' files');
}

// ------------------------------------------------------------------ canvas
function checkCanvas() {
  const errors = [];
  for (const f of srcFiles) {
    const s = stripComments(fs.readFileSync(f, 'utf8'));
    const re = /\.(shadowBlur|filter)\s*=/g;
    let m;
    while ((m = re.exec(s))) {
      if (!CANVAS_ALLOW.has(rel(f))) errors.push(rel(f) + ':' + lineOf(s, m.index) + ' sets ' + m[1] + ' (pre-render into a cached canvas instead)');
    }
  }
  report('canvas', errors, 'shadowBlur/filter allowlist: ' + [...CANVAS_ALLOW].join(', '));
}

// ------------------------------------------------------------------ text
function checkText() {
  const { loadGame } = require('./lib/node_loader');
  const G = loadGame({ quiet: true });
  const T = G.Text || {};
  const get = (p) => p.split('.').reduce((o, k) => (o == null ? undefined : o[k]), T);
  const ROOTS = 'ui|areas|npcs|lore|sparks|abilities|items|sigils|bosses|endings|shops|credits|intro';
  const pats = [
    new RegExp("\\b(?:UI|H|G\\.UI|G\\.Interact)\\.text(?:Obj)?\\(\\s*'((?:" + ROOTS + ")(?:\\.[A-Za-z0-9_]+)*)'", 'g'),
    new RegExp("\\btext(?:Obj)?\\(\\s*'((?:" + ROOTS + ")(?:\\.[A-Za-z0-9_]+)*)'", 'g'),
    new RegExp("\\bG\\.Text\\.((?:" + ROOTS + ")(?:\\.[A-Za-z_][A-Za-z0-9_]*)*)", 'g'),
    /textKey\s*:\s*'((?:ui)\.[A-Za-z0-9_.]+)'/g,
  ];
  const errors = [];
  let n = 0;
  for (const f of srcFiles) {
    if (rel(f) === 'src/data/text.js') continue;
    const s = stripComments(fs.readFileSync(f, 'utf8'));
    for (const re of pats) {
      re.lastIndex = 0;
      let m;
      while ((m = re.exec(s))) {
        const key = m[1];
        const next = s[m.index + m[0].length];
        if (next === '+' || /^\s*\+/.test(s.slice(m.index + m[0].length, m.index + m[0].length + 3))) continue; // prefix concat
        if (/\.(length|map|forEach|slice|indexOf|filter|fmt)$/.test(key)) continue;
        n++;
        if (get(key) === undefined && !(key.endsWith('_') )) errors.push(rel(f) + ':' + lineOf(s, m.index) + ' G.Text key "' + key + '" does not exist');
      }
    }
  }
  report('text', [...new Set(errors)], n + ' key references');
}

// ------------------------------------------------------------------ audio (needs the browser for G.Audio's tables)
async function checkAudio() {
  const { openGame, closeAll } = require('./lib/browser');
  let names;
  try {
    const { page } = await openGame({ query: 'test=1&paused=1&mute=1' });
    names = await page.evaluate(() => ({ sfx: G.Audio.sfxNames(), music: G.Audio.TRACK_IDS || G.Audio.trackIds(), ambience: G.Audio.ambienceIds(), stinger: G.Audio.stingerNames() }));
  } finally { await closeAll(); }
  const sets = { sfx: new Set(names.sfx), music: new Set(names.music), ambience: new Set(names.ambience), stinger: new Set(names.stinger) };
  const pats = [
    [/\b(?:G\.sfx|G\.sfxAt|G\.Audio\.sfx|H\.sfx|UI\.sfx|sfx|sfxAt)\(\s*'([a-z_0-9]+)'/g, 'sfx'],
    [/\b\w*(?:[sS]fx|[sS]ound)\w*\s*:\s*'([a-z_0-9]+)'/g, 'sfx'],
    [/\bstinger\(\s*'([a-z_0-9]+)'/g, 'stinger'], [/\bstinger\s*:\s*'([a-z_0-9]+)'/g, 'stinger'],
    [/\b(?:music|startBossMusic)\(\s*'([a-z_0-9]+)'/g, 'music'], [/\bmusic\s*:\s*'([a-z_0-9]+)'/g, 'music'],
    [/\bambience\(\s*'([a-z_0-9]+)'/g, 'ambience'], [/\bambience\s*:\s*'([a-z_0-9]+)'/g, 'ambience'],
  ];
  const errors = [];
  let n = 0;
  for (const f of srcFiles) {
    if (rel(f).startsWith('src/audio/')) continue;
    const s = stripComments(fs.readFileSync(f, 'utf8'));
    for (const [re, kind] of pats) {
      re.lastIndex = 0;
      let m;
      while ((m = re.exec(s))) { n++; if (!sets[kind].has(m[1])) errors.push(rel(f) + ':' + lineOf(s, m.index) + ' ' + kind + ' "' + m[1] + '" is not defined by the audio module'); }
    }
  }
  report('audio', errors, n + ' name references; ' + names.sfx.length + ' sfx, ' + names.music.length + ' tracks, ' + names.ambience.length + ' ambiences, ' + names.stinger.length + ' stingers');
}

(async () => {
  checkScripts();
  checkSyntax();
  checkCanvas();
  checkText();
  await checkAudio();
  const failed = results.filter((r) => !r.ok).length;
  console.log('\n' + (failed ? 'FAILED ' + failed + ' of ' + results.length : 'ALL PASS (' + results.length + ' audits)'));
  process.exit(failed ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(3); });
