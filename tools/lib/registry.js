// tools/lib/registry.js — static scan of src/ for what the browser-side code registers, so Node tools can
// check room data against it without a browser:
//   entity types  G.registerEntity('type', ...)            (all of src/)
//   enemy kinds   registerEnemy('kind', ...)                (src/entities/enemies/*.js, enemy_base.js)
//   bosses        G.Boss.register('id', ...) / registerEntity('boss_<id>', ...)
//   decor props   P('kind', ...) / defineProp('kind', ...)  (src/art/**)
//   event scripts G.Events.name = / G.Events['name'] =      (all of src/)
// Plus the fixed TECH_SPEC lists (§9.1 entity types, §19 enemy kinds / bosses / ids).
'use strict';
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..', '..');

const SPEC_TYPES = ['start', 'sconce', 'lanternway', 'lore', 'npc', 'shrine', 'pickup', 'geode', 'lever', 'gate', 'arena_gate',
  'sealdoor', 'arena', 'enemy', 'light', 'decor', 'respawn', 'event'];
const SPEC_ENEMIES = {
  shore: ['ash_crawler', 'ash_fly'],
  guttered: ['snuffed_walker', 'snuffed_lancer', 'drip_fly', 'wick_crawler'],
  meltbloom: ['bloom_spitter', 'thorn_hopper', 'pollen_moth', 'vine_lurker'],
  flue: ['soot_sprite', 'chimney_crawler', 'stoker', 'ash_bat'],
  nave: ['drowned_acolyte', 'rain_jelly', 'bell_sentry', 'drowned_knight'],
  chandlery: ['moldling', 'ladle_brute', 'drip_slime', 'forge_wisp'],
  mothwood: ['dusk_moth', 'cocoon_spawner', 'dust_maw', 'moth_knight'],
  rime: ['frost_husk', 'ice_spitter', 'rime_wraith', 'shard_crawler'],
};
const BOSSES = ['effigy', 'sable1', 'matron', 'tallowmere', 'kilnmother', 'vespertine', 'sable2', 'lucerne'];
const ABILITIES = ['bolt', 'dash', 'grip', 'oilcloak', 'plunge', 'wings'];
const LANTERNWAYS = ['lastlight', 'guttered', 'meltbloom', 'nave', 'chandlery', 'mothwood', 'rime'];
const NPCS = ['thrum', 'pell', 'quill', 'bramm', 'wren', 'sable'];
const SEALS = ['bell', 'kiln', 'wing'];
const PICKUP_ITEMS = ['heartwax', 'urn', 'kiln_glass', 'notch', 'spark', 'sigil', 'seal', 'cinders'];
const LORE_COUNTS = { sh: 3, ll: 2, gw: 5, mb: 4, sf: 4, dn: 6, ch: 4, mw: 4, ri: 4, hs: 2 };

function listJs(dir) {
  const out = [];
  const abs = path.join(ROOT, dir);
  if (!fs.existsSync(abs)) return out;
  for (const e of fs.readdirSync(abs, { withFileTypes: true })) {
    const rel = dir + '/' + e.name;
    if (e.isDirectory()) out.push(...listJs(rel));
    else if (e.name.endsWith('.js')) out.push(rel);
  }
  return out;
}

function scanAll(re, files) {
  const found = new Map(); // name → [files]
  for (const f of files) {
    const src = fs.readFileSync(path.join(ROOT, f), 'utf8');
    re.lastIndex = 0;
    let m;
    while ((m = re.exec(src))) {
      const name = m[1];
      if (!found.has(name)) found.set(name, []);
      if (!found.get(name).includes(f)) found.get(name).push(f);
    }
  }
  return found;
}

let cache = null;
function scanRegistry() {
  if (cache) return cache;
  const all = listJs('src');
  // the trailing ',' skips computed names such as registerEntity('boss_' + id, cls)
  const entityTypes = scanAll(/registerEntity(?:Factory)?\(\s*['"]([A-Za-z0-9_]+)['"]\s*,/g, all);
  const enemyFiles = listJs('src/entities/enemies').concat(['src/entities/enemy_base.js']);
  const enemyKinds = scanAll(/registerEnemy\(\s*['"]([A-Za-z0-9_]+)['"]/g, enemyFiles.filter((f) => fs.existsSync(path.join(ROOT, f))));
  const bossFiles = all.filter((f) => f.startsWith('src/entities/'));
  const bosses = scanAll(/(?:Boss\.register|registerBoss)\(\s*['"]([A-Za-z0-9_]+)['"]/g, bossFiles);
  for (const [t, files] of entityTypes) if (t.startsWith('boss_')) bosses.set(t.slice(5), files);
  const decor = scanAll(/(?:\bP|defineProp)\(\s*['"]([A-Za-z0-9_]+)['"]\s*,/g, listJs('src/art'));
  // event scripts: the name is in group 1 (G.Events.name =) or group 2 (G.Events['name'] =)
  const ev2 = new Map();
  const evRe = /G\.Events(?:\.([A-Za-z0-9_]+)|\[\s*['"]([A-Za-z0-9_]+)['"]\s*\])\s*=(?!=)/g;
  for (const f of all) {
    const src = fs.readFileSync(path.join(ROOT, f), 'utf8');
    let m;
    evRe.lastIndex = 0;
    while ((m = evRe.exec(src))) { const n = m[1] || m[2]; if (!ev2.has(n)) ev2.set(n, []); ev2.get(n).push(f); }
  }
  const specEnemyKinds = new Set(Object.values(SPEC_ENEMIES).flat());
  cache = {
    entityTypes, enemyKinds, bosses, decor, events: ev2, specEnemyKinds,
    knownType: (t) => SPEC_TYPES.includes(t) || entityTypes.has(t),
  };
  return cache;
}

module.exports = { scanRegistry, SPEC_TYPES, SPEC_ENEMIES, BOSSES, ABILITIES, LANTERNWAYS, NPCS, SEALS, PICKUP_ITEMS, LORE_COUNTS, ROOT };
