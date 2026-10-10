// Loads Gutterlight's Node-loadable game data with per-file attribution of every room definition.
//
//   const { loadWorld } = require('./lib/game_data');
//   const W = loadWorld();                       // core + src/data/** in index.html order
//   const W = loadWorld({ extra: ['tools/fixtures/reach_rooms.js'] });   // + extra data files (loaded last)
//   W.G          the vm-context G (G.World, G.Physics, G.PlayerMotor, G.Text, G.Items, ...)
//   W.defs       [{def, file}] every defineRoom call in order (duplicates included)
//   W.loadErrors [{file, error}] data files that threw while loading (syntax errors etc.)
//   W.files      data files loaded (repo-relative)
//
// Unlike node_loader.loadGame(), this hooks G.World.defineRoom before the data files run, so tools can
// say which file defined which room and see rooms that were defined twice.
'use strict';
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const { loadGame, scriptOrder, NODE_CORE, ROOT } = require('./node_loader');

function rel(f) { return path.relative(ROOT, path.resolve(ROOT, f)).split(path.sep).join('/'); }

function loadWorld(opts) {
  const o = opts || {};
  const G = loadGame({ files: NODE_CORE.slice(), quiet: true, query: o.query });
  const context = G.__loader.context;
  const loadErrors = G.__loader.errors.slice();
  const defs = [];
  let currentFile = null;
  const origDefine = G.World.defineRoom;
  G.World.defineRoom = function (def) {
    defs.push({ def, file: currentFile });
    return origDefine.call(this, def);
  };
  const order = scriptOrder();
  // dataOnly (option, or env GUTTERLIGHT_DATA_ONLY=1 so worker threads inherit it): skip the shipped room files
  // (src/data/regions/<region>.js except _regions.js, src/data/arenas/*.js) so fixture rooms passed as `extra`
  // are checked in isolation even after the real rooms with the same ids exist.
  const dataOnly = o.dataOnly || process.env.GUTTERLIGHT_DATA_ONLY === '1';
  const shippedRooms = (f) => /^src\/data\/arenas\//.test(f) || (/^src\/data\/regions\//.test(f) && !/\/_regions\.js$/.test(f));
  const files = order.filter((f) => f.startsWith('src/data/') && !(dataOnly && shippedRooms(f)));
  for (const f of o.extra || []) files.push(rel(f));
  // keep World's own console warnings out of tool output (tools report their own findings)
  const savedConsole = context.console;
  context.console = { log() {}, info() {}, warn() {}, error() {}, debug() {} };
  for (const f of files) {
    const full = path.join(ROOT, f);
    currentFile = f;
    if (!fs.existsSync(full)) { loadErrors.push({ file: f, error: 'missing file' }); continue; }
    try {
      vm.runInContext(fs.readFileSync(full, 'utf8'), context, { filename: full });
    } catch (err) {
      loadErrors.push({ file: f, error: (err && err.stack) || String(err) });
    }
  }
  context.console = savedConsole;
  currentFile = null;
  G.World.defineRoom = origDefine;
  return { G, defs, loadErrors, files, context, ROOT };
}

// Simple content hash (sha1 hex) of files, for caches that must invalidate when game logic changes.
function hashFiles(files) {
  const h = require('crypto').createHash('sha1');
  for (const f of files) {
    const full = path.resolve(ROOT, f);
    h.update(f + '\0');
    h.update(fs.existsSync(full) ? fs.readFileSync(full) : 'missing');
  }
  return h.digest('hex');
}

module.exports = { loadWorld, hashFiles, ROOT, rel };
