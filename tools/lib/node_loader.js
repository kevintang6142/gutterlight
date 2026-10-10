// Loads Gutterlight's Node-loadable game files into a vm context (no browser needed).
//
//   const { loadGame } = require('./lib/node_loader');
//   const G = loadGame();                       // TECH_SPEC §1 list + src/data/**, in index.html order
//   const G = loadGame({ extra: ['src/engine/room.js'] });   // add more files (kept in index order)
//   const G = loadGame({ files: ['src/core/namespace.js', 'src/core/util.js'] }); // explicit list
//   G.__loader.errors  → [{file, error}]  (files that threw while loading; stubs are fine)
//
// Options: files, extra, query ('region=nave&test=1' → G.params), quiet (no console output from the
// game files), console (custom console), throwOnError, root.
'use strict';
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const ROOT = path.resolve(__dirname, '..', '..');
const NODE_CORE = [
  'src/core/namespace.js',
  'src/core/util.js',
  'src/engine/physics.js',
  'src/engine/world.js',
  'src/player/motor.js',
];

// Script src list from index.html (between SCRIPTS:BEGIN / SCRIPTS:END when present).
function scriptOrder(root) {
  const html = fs.readFileSync(path.join(root || ROOT, 'index.html'), 'utf8');
  const b = html.indexOf('SCRIPTS:BEGIN'), e = html.indexOf('SCRIPTS:END');
  const section = b >= 0 && e > b ? html.slice(b, e) : html;
  const out = [];
  const re = /<script\b[^>]*\bsrc\s*=\s*["']([^"']+)["'][^>]*>/gi;
  let m;
  while ((m = re.exec(section))) out.push(m[1].replace(/^\.\//, ''));
  return out;
}

function isNodeLoadable(file) {
  return NODE_CORE.includes(file) || file.startsWith('src/data/');
}

const silentConsole = { log() {}, info() {}, warn() {}, error() {}, debug() {} };

function loadGame(opts) {
  const o = opts || {};
  const root = o.root || ROOT;
  const order = scriptOrder(root);
  let files = o.files ? o.files.slice() : order.filter(isNodeLoadable);
  for (const f of o.extra || []) if (!files.includes(f)) files.push(f);
  const idx = new Map(order.map((f, i) => [f, i]));
  files = files.map((f, i) => ({ f, i })).sort((a, b) => {
    const ia = idx.has(a.f) ? idx.get(a.f) : 1e9 + a.i, ib = idx.has(b.f) ? idx.get(b.f) : 1e9 + b.i;
    return ia - ib;
  }).map((x) => x.f);

  const sandbox = {
    console: o.console || (o.quiet ? silentConsole : console),
    performance: { now: () => Number(process.hrtime.bigint() / 1000n) / 1000 },
    setTimeout, clearTimeout,
  };
  if (o.query) sandbox.location = { search: '?' + String(o.query).replace(/^\?/, ''), href: '' };
  const context = vm.createContext(sandbox);
  const errors = [], loaded = [];
  for (const f of files) {
    const full = path.join(root, f);
    if (!fs.existsSync(full)) { errors.push({ file: f, error: 'missing file' }); continue; }
    try {
      vm.runInContext(fs.readFileSync(full, 'utf8'), context, { filename: full });
      loaded.push(f);
    } catch (err) {
      errors.push({ file: f, error: (err && err.stack) || String(err) });
      if (!o.quiet) console.warn('[node_loader] ' + f + ': ' + ((err && err.message) || err));
    }
  }
  const G = context.G;
  if (!G) throw new Error('node_loader: src/core/namespace.js did not create G');
  Object.defineProperty(G, '__loader', { value: { errors, loaded, files, context }, enumerable: false });
  if (o.throwOnError && errors.length) {
    throw new Error('node_loader: ' + errors.length + ' file(s) failed:\n' + errors.map((x) => x.file + ': ' + x.error.split('\n')[0]).join('\n'));
  }
  return G;
}

module.exports = { loadGame, scriptOrder, isNodeLoadable, NODE_CORE, ROOT };
