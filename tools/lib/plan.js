// World plan helpers (design/world_plan.json, TECH_SPEC §18): loading, content-spec parsing, exit naming,
// spot → entity resolution. Shared by validate.js and reach.js.
'use strict';
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..', '..');
const DEFAULT_PLAN = path.join(ROOT, 'design', 'world_plan.json');
const MOVEMENT = ['dash', 'grip', 'wings', 'oilcloak', 'plunge'];
const ABILITIES = ['bolt', 'dash', 'grip', 'oilcloak', 'plunge', 'wings'];

// → {plan, file, error}  (plan null when the file does not exist or cannot be parsed)
function loadPlan(file) {
  const f = file ? path.resolve(file) : DEFAULT_PLAN;
  if (!fs.existsSync(f)) return { plan: null, file: f, error: null, missing: true };
  try {
    const plan = JSON.parse(fs.readFileSync(f, 'utf8'));
    if (!plan || !Array.isArray(plan.rooms)) return { plan: null, file: f, error: 'plan has no "rooms" array' };
    return { plan, file: f, error: null };
  } catch (e) {
    return { plan: null, file: f, error: 'cannot parse: ' + e.message };
  }
}

// Plan content spec → structured. Unknown shapes → {type:'unknown', raw}.
//   'start' 'sealdoor' 'sconce:id' 'lanternway:id' 'lore:id' 'geode:id' 'lever:id' 'arena:boss' 'arena_gate:id'
//   'npc:name[:stage]' 'shrine:ability[?cond]' 'pickup:item[:sigil]#id' 'gate:id[?cond]' 'enemy:kind[*n][#id]'
//   'landmark:text' 'decor:kind' 'event:script' 'light'
function parseContent(spec) {
  const raw = String(spec);
  if (raw === 'start' || raw === 'sealdoor' || raw === 'light' || raw === 'respawn') return { type: raw, raw, spotId: raw === 'start' || raw === 'sealdoor' ? raw : null };
  const colon = raw.indexOf(':');
  if (colon < 0) return { type: 'unknown', raw };
  const type = raw.slice(0, colon);
  let rest = raw.slice(colon + 1);
  if (type === 'landmark' || type === 'note') return { type: 'landmark', raw, text: rest };
  let cond = null;
  const q = rest.indexOf('?');
  if (q >= 0 && type !== 'landmark') { cond = rest.slice(q + 1); rest = rest.slice(0, q); }
  switch (type) {
    case 'sconce': case 'lanternway': case 'lore': case 'geode': case 'lever': case 'arena_gate':
      return { type, id: rest, cond, raw, spotId: type === 'arena_gate' ? null : type + ':' + rest };
    case 'arena': return { type, boss: rest, cond, raw, spotId: 'arena:' + rest };
    case 'gate': return { type, id: rest, cond, raw, spotId: null };
    case 'npc': {
      const [npc, stage] = rest.split(':');
      return { type, npc, stage: stage != null && stage !== '' ? +stage : null, cond, raw, spotId: stage ? 'npc:' + npc + ':' + stage : 'npc:' + npc };
    }
    case 'shrine': return { type, ability: rest, cond, raw, spotId: 'shrine:' + rest };
    case 'pickup': {
      const hash = rest.indexOf('#');
      const id = hash >= 0 ? rest.slice(hash + 1) : null;
      const what = hash >= 0 ? rest.slice(0, hash) : rest;
      const [item, sigil] = what.split(':');
      return { type, item, sigil: sigil || null, id, cond, raw, spotId: id ? 'pickup:' + id : null };
    }
    case 'enemy': {
      const m = /^([a-z0-9_]+)(?:\*(\d+))?(?:#([A-Za-z0-9_]+))?$/.exec(rest);
      if (!m) return { type: 'unknown', raw };
      return { type, kind: m[1], count: m[2] ? +m[2] : 1, id: m[3] || null, raw };
    }
    case 'decor': case 'event': case 'light':
      return { type, kind: rest, raw };
    default: return { type: 'unknown', raw };
  }
}

// Does an entity spec (props + tx/ty) match a parsed content item / spot?
function entityMatches(c, props) {
  switch (c.type) {
    case 'start': case 'sealdoor': case 'respawn': return props.type === c.type;
    case 'sconce': case 'lanternway': case 'lore': case 'geode': case 'lever': case 'gate': case 'arena_gate':
      return props.type === c.type && props.id === c.id;
    case 'arena': return props.type === 'arena' && props.boss === c.boss;
    case 'npc': return props.type === 'npc' && props.npc === c.npc && (c.stage == null || (+props.stage || 1) === c.stage);
    case 'shrine': return props.type === 'shrine' && props.ability === c.ability;
    case 'pickup': return props.type === 'pickup' && (c.id ? props.id === c.id : props.item === c.item);
    case 'enemy': return props.type === 'enemy' && props.kind === c.kind && (!c.id || props.id === c.id);
    case 'decor': return props.type === 'decor' && props.kind === c.kind;
    case 'event': return props.type === 'event' && props.script === c.kind;
    case 'light': return props.type === 'light';
    default: return false;
  }
}

// Spot id ('pickup:gw_hw1', 'npc:wren:1', 'tile:12,15', ...) → parsed content-like object
function parseSpotId(id) {
  const s = String(id);
  let m;
  if ((m = /^tile:(\d+),(\d+)$/.exec(s))) return { type: 'tile', tx: +m[1], ty: +m[2], raw: s };
  if (s === 'start' || s === 'sealdoor') return { type: s, raw: s };
  if ((m = /^pickup:(.+)$/.exec(s))) return { type: 'pickup', id: m[1], raw: s };
  if ((m = /^npc:([a-z_]+)(?::(\d+))?$/.exec(s))) return { type: 'npc', npc: m[1], stage: m[2] ? +m[2] : null, raw: s };
  if ((m = /^shrine:([a-z_]+)$/.exec(s))) return { type: 'shrine', ability: m[1], raw: s };
  if ((m = /^arena:([a-z0-9_]+)$/.exec(s))) return { type: 'arena', boss: m[1], raw: s };
  if ((m = /^(sconce|lanternway|lore|geode|lever|gate):(.+)$/.exec(s))) return { type: m[1], id: m[2], raw: s };
  return { type: 'unknown', raw: s };
}

// Exit ids for a list of openings, like the plan generator: side + index (ordered by pos), e.g. W1, W2, N1.
function nameOpenings(openings) {
  const out = openings.map((o) => Object.assign({}, o));
  for (const side of ['N', 'S', 'W', 'E']) {
    out.filter((o) => o.side === side).sort((a, b) => a.pos - b.pos).forEach((o, i) => { o.id = side + (i + 1); });
  }
  return out;
}

// Requirement list → {abilities:{dash:true,...}, tokens:Set(all), gates:Set(non-ability tokens)}
function splitRequires(req) {
  const tokens = new Set(req || []);
  const abilities = {};
  const gates = new Set();
  for (const t of tokens) {
    if (ABILITIES.includes(t)) abilities[t] = true;
    else gates.add(t);
  }
  return { abilities, tokens, gates };
}
// Feasible ability acquisition orders of a plan: `plan.abilityOrders` if the plan file states them (fixtures),
// else the progression simulation of tools/plan_check.js (`--orders-json`). → {orders: [[ability,...],...], source}
// (orders = [] when the simulation cannot run, e.g. on a partial plan).
const ordersCache = new Map();
function abilityOrders(planFile, plan) {
  if (plan && Array.isArray(plan.abilityOrders)) return { orders: plan.abilityOrders, source: 'plan.abilityOrders' };
  const f = planFile ? path.resolve(planFile) : DEFAULT_PLAN;
  if (ordersCache.has(f)) return ordersCache.get(f);
  let res = { orders: [], source: 'unavailable' };
  try {
    const cp = require('child_process');
    const txt = cp.execFileSync(process.execPath, [path.join(ROOT, 'tools', 'plan_check.js'), f, '--orders-json'], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] });
    const j = JSON.parse(txt.trim().split('\n').pop());
    if (Array.isArray(j.orders)) res = { orders: j.orders, source: 'plan_check' + (j.ok ? '' : ' (plan has errors)') };
  } catch (e) { /* partial or broken plan: no orders */ }
  ordersCache.set(f, res);
  return res;
}
// The MAXIMAL movement-ability set a player can own while still lacking `x` and holding every ability of `others`:
// the union, over the feasible orders in which every ability of `others` precedes `x`, of the movement abilities
// that precede `x`. → {set: [...], orders: n} (n = 0: no such order — no player can own `others` without `x`).
function maxBefore(orders, x, others) {
  const need = (others || []).filter((t) => MOVEMENT.includes(t) && t !== x);
  const set = new Set();
  let n = 0;
  for (const o of orders || []) {
    const ix = o.indexOf(x);
    if (ix < 0) continue;
    const pre = o.slice(0, ix);
    if (!need.every((t) => pre.includes(t))) continue;
    n++;
    for (const t of pre) if (MOVEMENT.includes(t)) set.add(t);
  }
  return { set: Array.from(set).sort(), orders: n };
}

const reqKey = (req) => Array.from(new Set(req || [])).sort().join('+') || '-';
const isSubset = (a, b) => a.every((x) => b.includes(x));

module.exports = { loadPlan, parseContent, entityMatches, parseSpotId, nameOpenings, splitRequires, reqKey, isSubset, abilityOrders, maxBefore,
  MOVEMENT, ABILITIES, DEFAULT_PLAN };
