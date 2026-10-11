#!/usr/bin/env node
// tools/text_check.js — verifies src/data/text.js + src/data/items.js (module: text; promoted from
// test-output/text/check.js by integration so the regression runner can use it).
//
//   node tools/text_check.js [--transcript] [--quiet] [--text file] [--items file]
//
// Loads both files in a bare node:vm context (no window/document => proves Node-loadability),
// then checks: required keys & counts, schemas, condition grammar (TECH_SPEC §9.1), NPC fallbacks,
// talk-id uniqueness, give/setFlag specs, page lengths (warn > 140, fail > 220), forbidden and
// Hollow-Knight-associated terms, soul/damage numbers (none allowed), tokens/placeholders, punctuation hygiene, G.Items vs DESIGN
// numbers and vs G.Text, and simulates NPC dialogue selection over a playthrough to prove every
// one-shot talk is reachable. --transcript prints the simulated conversations.
// Exit code: 0 = clean (warnings allowed), 1 = errors.
'use strict';
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const ROOT = path.resolve(__dirname, '..');
const argv = process.argv.slice(2);
const args = new Set(argv);
// --text <file> / --items <file>: check alternative copies (used to mutation-test this script).
const argPath = (flag, dflt) => (argv.includes(flag) ? path.resolve(argv[argv.indexOf(flag) + 1]) : path.join(ROOT, dflt));
const FILES = [argPath('--text', 'src/data/text.js'), argPath('--items', 'src/data/items.js')];
const errors = [];
const warnings = [];
const err = (m) => errors.push(m);
const warn = (m) => warnings.push(m);

// ------------------------------------------------------------------------------------------------
// Load
const ctx = vm.createContext({});
vm.runInContext('globalThis.G = {};', ctx);
for (const f of FILES) {
  const code = fs.readFileSync(f, 'utf8');
  try {
    vm.runInContext(code, ctx, { filename: f });
  } catch (e) {
    console.error(`FATAL: ${f} failed to load in a bare vm context: ${e.stack || e}`);
    process.exit(1);
  }
}
const G = vm.runInContext('G', ctx);
const T = G.Text;
const I = G.Items;
if (!T || typeof T !== 'object') { console.error('FATAL: G.Text missing'); process.exit(1); }
if (!I || typeof I !== 'object') { console.error('FATAL: G.Items missing'); process.exit(1); }

// ------------------------------------------------------------------------------------------------
// Reference data (independent copies of DESIGN / TECH_SPEC facts)
const ABILITIES = ['bolt', 'dash', 'grip', 'oilcloak', 'plunge', 'wings'];
const BOSSES = ['effigy', 'sable1', 'matron', 'tallowmere', 'kilnmother', 'vespertine', 'sable2', 'lucerne'];
const REGIONS = ['shore', 'lastlight', 'guttered', 'meltbloom', 'flue', 'nave', 'chandlery', 'mothwood', 'rime', 'sanctum'];
const PREFIXES = ['sh', 'll', 'gw', 'mb', 'sf', 'dn', 'ch', 'mw', 'ri', 'hs'];
const LORE_COUNTS = { sh: 3, ll: 2, gw: 5, mb: 4, sf: 4, dn: 6, ch: 4, mw: 4, ri: 4, hs: 2 };
const SPARKS = ['spark_gw', 'spark_mb', 'spark_sf', 'spark_dn', 'spark_ch', 'spark_mw'];
const SEALS = ['bell', 'kiln', 'wing'];
const SIGIL_COSTS = {
  swift_brand: 2, long_brand: 2, heartwax: 2, kindle_haste: 2, ember_thirst: 1, cinder_lure: 1,
  smolder_shell: 1, flare_trail: 2, bright_bolt: 3, thorned_wax: 1, steadfast: 1, waymoth: 1,
  last_light: 2, deep_kindle: 3,
};
const SIGILS = Object.keys(SIGIL_COSTS);
const ITEMS = ['heartwax', 'urn', 'kiln_glass', 'notch', 'spark', 'seal_bell', 'seal_kiln', 'seal_wing', 'chart'];
const NPC_KEYS = ['thrum', 'pell', 'quill', 'bramm', 'wren_1', 'wren_2', 'wren_3', 'wren_4', 'sable_1', 'sable_2'];
const SHOP_IDS = ['pell', 'quill', 'bramm'];
const INPUT_TOKENS = ['jump', 'attack', 'dash', 'spell', 'up', 'down', 'interact', 'map', 'inventory', 'left', 'right', 'pause'];
const PLACEHOLDERS = ['n', 'used', 'total', 'price', 'glass', 'region', 'action', 'input', 'other'];
const PELL_STOCK = [
  ['heartwax', 'shop_pell_hw1', 150], ['heartwax', 'shop_pell_hw2', 450], ['urn', 'shop_pell_urn', 350],
  ['notch', 'shop_pell_notch', 400], ['sigil', 'shop_pell_cinder_lure', 100, 'cinder_lure'],
  ['sigil', 'shop_pell_waymoth', 120, 'waymoth'], ['sigil', 'shop_pell_steadfast', 220, 'steadfast'],
  ['sigil', 'shop_pell_smolder_shell', 280, 'smolder_shell'], ['sigil', 'shop_pell_kindle_haste', 480, 'kindle_haste'],
];
const QUILL_STOCK = { guttered: 40, meltbloom: 80, flue: 80, nave: 120, chandlery: 120, mothwood: 120, rime: 150 };
const UI_REQUIRED = [
  'gameTitle', 'pressAny', 'start', 'newGame', 'continue', 'options', 'controls', 'back', 'yes', 'no',
  'chooseSlot', 'slot', 'slotEmpty', 'slotNew', 'slotComplete', 'erase', 'eraseConfirm', 'playTime', 'completion',
  'paused', 'resume', 'quitToTitle', 'quitConfirm', 'masterVolume', 'musicVolume', 'sfxVolume', 'ambienceVolume',
  'screenShake', 'controlHints', 'on', 'off', 'keyboard', 'gamepad', 'actions', 'controlTips', 'prompts',
  'saved', 'sconceLit', 'rested', 'lanternwayLit', 'gateOpened', 'gateLocked', 'sealDoorLocked', 'sealDoorOpen',
  'lanternway', 'lanternwayChoose', 'lanternwayHere', 'lanternwayUnlit', 'lanternwayDanger',
  'map', 'mapLegend', 'inventory', 'abilities', 'relics', 'sigils', 'notches', 'notchesUsed', 'restToEquip',
  'equip', 'unequip', 'equipped', 'notEnoughNotches', 'health', 'ember', 'cinders', 'brand', 'heartShards',
  'urns', 'kilnGlass', 'sparks', 'seals', 'unknown', 'buy', 'sold', 'owned', 'leave', 'priceCinders', 'theEnd',
];
const PROMPTS_REQUIRED = ['rest', 'read', 'talk', 'listen', 'travel', 'take', 'examine'];
const ACTIONS_REQUIRED = ['left', 'right', 'up', 'down', 'jump', 'attack', 'dash', 'spell', 'interact', 'map', 'inventory', 'pause', 'confirm', 'cancel'];
const TALK_KEYS = new Set(['id', 'when', 'once', 'lines', 'give', 'setFlag']);
const SCENE_WORDS = ['crown', 'cage', 'reach', 'flame', 'lake', 'gate', 'dark', 'sparks', 'hands', 'shatter', 'ash'];

// Hard-forbidden (task rule) and Hollow-Knight-associated words we also keep out of the text.
const FORBIDDEN = [
  ['hallownest', /hallownest/i], ['vessel', /\bvessels?\b/i], ['infection', /\binfect\w*/i],
  ['soul', /\bsoul\w*/i], ['geo', /\bgeo\b/i], ['nail', /\bnail\w*/i], ['charm', /\bcharm\w*/i],
  ['bench', /\bbench\w*/i], ['shade', /\bshade\w*/i], ['dream', /dream/i],
];
const AVOID = [
  ['hollow', /\bhollow\w*/i], ['knight', /\bknight\w*/i], ['radiance', /\bradian\w*/i], ['void', /\bvoid\b/i],
  ['abyss', /\babyss\w*/i], ['grub', /\bgrub\w*/i], ['mantis', /\bmantis\b/i], ['stag', /\bstags?\b/i],
  ['lifeblood', /lifeblood/i], ['focus', /\bfocus\w*/i], ['mask', /\bmask\w*/i], ['king', /\bkings?\b/i],
  ['crossroads', /crossroads?/i], ['wyrm', /\bwyrm\b/i], ['seer', /\bseers?\b/i], ['weaver', /\bweaver\w*/i],
  ['elder', /\belder\w*/i], ['nightmare', /nightmare/i], ['husk', /\bhusk\w*/i], ['hornet', /\bhornet\b/i],
  ['pantheon', /pantheon/i], ['godhome', /godhome/i], ['kingsoul', /kingsoul/i],
];
// Allowed exceptions: exact text mandated by DESIGN §5.3.
const AVOID_EXCEPT = { 'bosses.effigy.sub': ['husk'] };
const ALLOWED_NON_ASCII = new Set(['—']); // em dash only

// ------------------------------------------------------------------------------------------------
// Helpers
const isObj = (v) => v !== null && typeof v === 'object' && !Array.isArray(v);
const isStr = (v) => typeof v === 'string' && v.length > 0;
const isStrArr = (v, min = 1) => Array.isArray(v) && v.length >= min && v.every(isStr);
function sameSet(actual, expected, what) {
  const a = new Set(actual), e = new Set(expected);
  for (const k of e) if (!a.has(k)) err(`${what}: missing '${k}'`);
  for (const k of a) if (!e.has(k)) err(`${what}: unexpected '${k}'`);
}
function needStr(obj, key, where) {
  if (!isObj(obj) || !isStr(obj[key])) { err(`${where}.${key}: missing or not a non-empty string`); return false; }
  return true;
}
function needLines(obj, key, where, min = 1, max = Infinity) {
  const v = isObj(obj) ? obj[key] : undefined;
  if (!isStrArr(v, min)) { err(`${where}.${key}: must be an array of >= ${min} non-empty strings`); return false; }
  if (v.length > max) err(`${where}.${key}: ${v.length} entries (max ${max})`);
  return true;
}

// ------------------------------------------------------------------------------------------------
// Condition grammar (TECH_SPEC §9.1): terms joined by ' & ', each optionally prefixed by '!'.
const talkIndex = {}; // npcKey -> Set(talk ids); also family ('wren', 'sable') -> Set
const familyOf = (key) => key.replace(/_\d+$/, '');
if (isObj(T.npcs)) {
  for (const [key, npc] of Object.entries(T.npcs)) {
    const ids = new Set((npc && Array.isArray(npc.talks) ? npc.talks : []).map((t) => t && t.id));
    talkIndex[key] = ids;
    const fam = familyOf(key);
    talkIndex[fam] = new Set([...(talkIndex[fam] || []), ...ids]);
  }
}
const TERMS = [
  [/^ability:([a-z_]+)$/, (m) => ABILITIES.includes(m[1]) || `unknown ability '${m[1]}'`],
  [/^boss:([a-z0-9_]+)$/, (m) => BOSSES.includes(m[1]) || `unknown boss '${m[1]}'`],
  [/^flag:([a-z0-9_:]+)$/, () => true],
  [/^item:([a-z0-9_]+)$/, () => true],
  [/^sigil:([a-z_]+)$/, (m) => SIGILS.includes(m[1]) || `unknown sigil '${m[1]}'`], // owned sigil (G.game.evalCondition)
  [/^seals>=(\d)$/, (m) => (+m[1] >= 1 && +m[1] <= 3) || `seals>=${m[1]} is pointless or impossible`],
  [/^sparks>=(\d)$/, (m) => (+m[1] >= 1 && +m[1] <= 6) || `sparks>=${m[1]} is pointless or impossible`],
  [/^talked:([a-z0-9_]+):([a-z0-9_]+)$/, (m) => (talkIndex[m[1]] ? (talkIndex[m[1]].has(m[2]) || `no talk '${m[2]}' in '${m[1]}'`) : `unknown npc '${m[1]}'`)],
  [/^visited:([a-z]{2})_(\d{2})$/, (m) => PREFIXES.includes(m[1]) || `unknown room prefix '${m[1]}'`],
  [/^region:([a-z]+)$/, (m) => REGIONS.includes(m[1]) || `unknown region '${m[1]}'`],
];
function parseCondition(str) {
  if (str === undefined || str === '') return { ok: true, terms: [] };
  if (typeof str !== 'string') return { ok: false, error: 'condition is not a string' };
  const terms = [];
  for (const part of str.split(' & ')) {
    if (!part || part !== part.trim() || /\s/.test(part)) return { ok: false, error: `bad term '${part}' (terms must be joined by ' & ')` };
    let t = part, neg = false;
    if (t[0] === '!') { neg = true; t = t.slice(1); }
    if (t[0] === '!') return { ok: false, error: `double negation in '${part}'` };
    let matched = false;
    for (const [re, check] of TERMS) {
      const m = re.exec(t);
      if (!m) continue;
      matched = true;
      const r = check(m);
      if (r !== true) return { ok: false, error: r };
      terms.push({ neg, term: t });
      break;
    }
    if (!matched) return { ok: false, error: `unrecognised term '${t}'` };
  }
  return { ok: true, terms };
}
// Self-test of the parser so a broken grammar check cannot silently pass everything.
[['', true], ['ability:dash', true], ['!boss:effigy & seals>=3', true], ['talked:thrum:meet', true],
  ['visited:gw_03', true], ['region:nave', true], ['flag:thrum_notch & !sparks>=6', true],
  ['ability:dash&boss:effigy', false], ['ability:fly', false], ['!!flag:x', false], ['seals>=9', false],
  ['ability:dash &  boss:effigy', false], ['talked:thrum:nope', false], ['visited:zz_01', false], ['foo', false],
  ['!sigil:waymoth', true], ['sigil:nope', false],
].forEach(([s, want]) => {
  if (parseCondition(s).ok !== want) err(`[self-test] parseCondition('${s}') should be ${want ? 'valid' : 'invalid'}`);
});

function validGive(spec) {
  if (['heartwax', 'urn', 'kiln_glass', 'notch'].includes(spec)) return true;
  let m;
  if ((m = /^sigil:([a-z_]+)$/.exec(spec))) return SIGILS.includes(m[1]);
  if ((m = /^spark:([a-z_]+)$/.exec(spec))) return SPARKS.includes(m[1]);
  if ((m = /^seal:([a-z]+)$/.exec(spec))) return SEALS.includes(m[1]);
  if ((m = /^cinders:(\d+)$/.exec(spec))) return +m[1] > 0;
  return false;
}

// ------------------------------------------------------------------------------------------------
// 1. Structure & counts
const TOP = ['intro', 'areas', 'npcs', 'lore', 'sparks', 'abilities', 'items', 'sigils', 'bosses', 'endings', 'credits', 'shops', 'ui'];
for (const k of TOP) if (T[k] === undefined) err(`G.Text.${k} missing`);
for (const k of Object.keys(T)) if (!TOP.includes(k)) warn(`G.Text.${k}: key not in TECH_SPEC §15 (extension)`);
if (typeof T.fmt !== 'function') err('G.Text.fmt helper missing');
else {
  if (T.fmt('Slot {n}', { n: 2 }) !== 'Slot 2') err('G.Text.fmt does not substitute');
  if (T.fmt('Press {jump}', { n: 1 }) !== 'Press {jump}') err('G.Text.fmt must keep unknown tokens');
  if (Object.keys(T).includes('fmt')) err('G.Text.fmt must be non-enumerable');
}

// intro
needLines(T, 'intro', 'intro', 3, 5);

// areas
if (isObj(T.areas)) {
  sameSet(Object.keys(T.areas).filter((k) => k !== 'test'), REGIONS, 'areas');
  if (T.areas.test) { needStr(T.areas.test, 'name', 'areas.test'); needStr(T.areas.test, 'sub', 'areas.test'); }
  for (const r of REGIONS) { needStr(T.areas[r], 'name', `areas.${r}`); needStr(T.areas[r], 'sub', `areas.${r}`); }
}

// npcs
const setFlags = new Set();
const referencedFlags = new Map(); // flag -> where
if (isObj(T.npcs)) {
  for (const k of NPC_KEYS) if (!T.npcs[k]) err(`npcs.${k} missing`);
  const familyIds = {};
  for (const [key, npc] of Object.entries(T.npcs)) {
    const where = `npcs.${key}`;
    if (!NPC_KEYS.includes(key)) warn(`${where}: not one of the TECH_SPEC §19 npc keys`);
    needStr(npc, 'name', where);
    if (npc.prompt !== undefined && !isStr(npc.prompt)) err(`${where}.prompt must be a string`);
    if (npc.shop !== undefined && !SHOP_IDS.includes(npc.shop)) err(`${where}.shop '${npc.shop}' is not a shop id`);
    if (!Array.isArray(npc.talks) || !npc.talks.length) { err(`${where}.talks must be a non-empty array`); continue; }
    const fam = familyOf(key);
    familyIds[fam] = familyIds[fam] || new Map();
    npc.talks.forEach((t, i) => {
      const tw = `${where}.talks[${i}]${t && t.id ? `(${t.id})` : ''}`;
      if (!isObj(t)) { err(`${tw}: not an object`); return; }
      for (const k of Object.keys(t)) if (!TALK_KEYS.has(k)) err(`${tw}: unknown key '${k}'`);
      if (!isStr(t.id) || !/^[a-z0-9_]+$/.test(t.id)) err(`${tw}: id must match /^[a-z0-9_]+$/`);
      else if (familyIds[fam].has(t.id)) err(`${tw}: talk id '${t.id}' already used in ${familyIds[fam].get(t.id)} (ids must be unique per NPC family)`);
      else familyIds[fam].set(t.id, key);
      needLines(t, 'lines', tw, 1, 6);
      if (t.when !== undefined) {
        const p = parseCondition(t.when);
        if (!p.ok) err(`${tw}: bad condition '${t.when}': ${p.error}`);
        else for (const { term } of p.terms) if (term.startsWith('flag:')) referencedFlags.set(term.slice(5), tw);
      }
      if (t.once !== undefined && typeof t.once !== 'boolean') err(`${tw}: once must be boolean`);
      if (t.give !== undefined && !validGive(t.give)) err(`${tw}: invalid give spec '${t.give}'`);
      if (t.give !== undefined && t.once !== true) err(`${tw}: an entry that gives an item must be once:true`);
      if (t.setFlag !== undefined) {
        if (!isStr(t.setFlag) || !/^[a-z0-9_]+$/.test(t.setFlag)) err(`${tw}: setFlag must match /^[a-z0-9_]+$/`);
        else setFlags.add(t.setFlag);
      }
    });
    const last = npc.talks[npc.talks.length - 1];
    if (last && (last.when || last.once || last.give || last.setFlag)) err(`${where}: last talk '${last.id}' must be an unconditional, repeatable fallback`);
  }
  for (const [flag, where] of referencedFlags) if (!setFlags.has(flag)) warn(`${where}: flag '${flag}' is never set by any setFlag in G.Text (must come from another module)`);

  // Specific content requirements
  const thrum = T.npcs.thrum;
  if (thrum && Array.isArray(thrum.talks)) {
    if (thrum.talks.length < 10) err(`npcs.thrum: ${thrum.talks.length} talks (need >= 10)`);
    const gift = thrum.talks.find((t) => t.give === 'notch');
    if (!gift) err('npcs.thrum: no talk gives the notch');
    else {
      if (!/seals>=3/.test(gift.when || '')) err('npcs.thrum notch gift must require seals>=3');
      if (!gift.setFlag) err('npcs.thrum notch gift must setFlag');
      if (!gift.lines.some((l) => /Carry this too/.test(l))) warn('npcs.thrum notch gift lacks the DESIGN line "Carry this too."');
    }
  }
  const w4 = T.npcs.wren_4;
  if (w4 && Array.isArray(w4.talks) && !w4.talks.some((t) => t.give === 'sigil:long_brand' && t.once === true)) err("npcs.wren_4 must give 'sigil:long_brand' once");
  for (const [k, shop] of [['pell', 'pell'], ['quill', 'quill'], ['bramm', 'bramm']]) {
    if (T.npcs[k] && T.npcs[k].shop !== shop) err(`npcs.${k}.shop must be '${shop}'`);
  }
  const s1 = T.npcs.sable_1;
  if (s1 && Array.isArray(s1.talks) && s1.talks[0] && s1.talks[0].lines.length > 2) err('npcs.sable_1 glimpse must be 1-2 lines');
  const s2 = T.npcs.sable_2;
  if (s2 && Array.isArray(s2.talks) && !s2.talks.some((t) => (t.lines || []).some((l) => /Burn for all of us/.test(l)))) err('npcs.sable_2 must contain her "Burn for all of us" line');
}

// lore
if (isObj(T.lore)) {
  const expected = [];
  for (const [p, n] of Object.entries(LORE_COUNTS)) for (let i = 1; i <= n; i++) expected.push(`lore_${p}_${i}`);
  if (expected.length !== 38) err('[self-test] lore id list is not 38 long');
  sameSet(Object.keys(T.lore), expected, 'lore');
  for (const id of expected) {
    const l = T.lore[id];
    if (!l) continue;
    needStr(l, 'title', `lore.${id}`);
    needLines(l, 'lines', `lore.${id}`, 1, 6);
  }
  const shTokens = new Set();
  for (const id of ['lore_sh_1', 'lore_sh_2', 'lore_sh_3']) {
    const l = T.lore[id];
    if (!l || !Array.isArray(l.lines)) continue;
    const toks = l.lines.join(' ').match(/\{(\w+)\}/g) || [];
    if (!toks.length) err(`lore.${id}: tutorial carving uses no control tokens`);
    toks.forEach((t) => shTokens.add(t.slice(1, -1)));
  }
  for (const t of ['jump', 'attack', 'spell', 'up', 'down', 'map', 'inventory']) {
    if (!shTokens.has(t)) err(`lore_sh_1..3 never teach {${t}}`);
  }
}

// sparks
if (isObj(T.sparks)) {
  sameSet(Object.keys(T.sparks), SPARKS, 'sparks');
  for (const id of SPARKS) if (T.sparks[id]) needLines(T.sparks[id], 'lines', `sparks.${id}`, 2, 6);
}

// abilities
if (isObj(T.abilities)) {
  sameSet(Object.keys(T.abilities), ABILITIES, 'abilities');
  for (const id of ABILITIES) {
    const a = T.abilities[id];
    if (!a) continue;
    for (const k of ['name', 'desc', 'how']) needStr(a, k, `abilities.${id}`);
    if (isStr(a.how) && !/\{(\w+)\}/.test(a.how)) err(`abilities.${id}.how uses no control token`);
  }
}

// items
if (isObj(T.items)) {
  for (const id of ITEMS) { if (!T.items[id]) err(`items.${id} missing`); else { needStr(T.items[id], 'name', `items.${id}`); needStr(T.items[id], 'desc', `items.${id}`); } }
  const brand = T.items.brand;
  if (brand) {
    if (!Array.isArray(brand.levels) || brand.levels.length !== (I.brandDamage || []).length) err('items.brand.levels must have one entry per G.Items.brandDamage level');
    else brand.levels.forEach((lv, i) => { needStr(lv, 'name', `items.brand.levels[${i}]`); needStr(lv, 'desc', `items.brand.levels[${i}]`); });
  }
}

// sigils
if (isObj(T.sigils)) {
  sameSet(Object.keys(T.sigils), SIGILS, 'sigils (text)');
  for (const id of SIGILS) if (T.sigils[id]) { needStr(T.sigils[id], 'name', `sigils.${id}`); needStr(T.sigils[id], 'desc', `sigils.${id}`); }
  const names = SIGILS.map((id) => T.sigils[id] && T.sigils[id].name);
  if (new Set(names).size !== names.length) err('sigils: duplicate names');
  // No numbers (user request, no-numbers): effects are described qualitatively, as Hollow Knight does. The exact
  // values live in G.Items.sigils / DESIGN §3.5; the descriptions must not state them (see numericStat() below).
  for (const id of SIGILS) if (T.sigils[id] && /\d/.test(String(T.sigils[id].desc))) err(`sigils.${id}.desc contains a digit (describe the effect in words)`);
}

// bosses
if (isObj(T.bosses)) {
  sameSet(Object.keys(T.bosses), BOSSES, 'bosses');
  const SUBS = { effigy: 'Husk of the Old Guard', sable1: 'the Unlit', tallowmere: 'Warden of the Bell', kilnmother: 'Warden of the Forge', vespertine: 'Warden of the Wing', sable2: 'Last Guard of the Heart', lucerne: 'the Everlantern' };
  const NAMES = { effigy: 'The Effigy', sable1: 'Sable', matron: 'The Soot Matron', tallowmere: 'Abbot Tallowmere', kilnmother: 'The Kiln Mother', vespertine: 'Duchess Vespertine', sable2: 'Sable', lucerne: 'Lucerne' };
  for (const id of BOSSES) {
    const b = T.bosses[id];
    if (!b) continue;
    needStr(b, 'name', `bosses.${id}`);
    needStr(b, 'sub', `bosses.${id}`);
    if (b.name !== NAMES[id]) err(`bosses.${id}.name '${b.name}' != DESIGN '${NAMES[id]}'`);
    if (SUBS[id] && b.sub !== SUBS[id]) err(`bosses.${id}.sub '${b.sub}' != DESIGN '${SUBS[id]}'`);
    for (const k of ['intro', 'phase2', 'defeat']) if (b[k] !== undefined) needLines(b, k, `bosses.${id}`, 1, 3);
    for (const k of Object.keys(b)) if (!['name', 'sub', 'intro', 'phase2', 'defeat'].includes(k)) err(`bosses.${id}: unknown key '${k}'`);
  }
  for (const id of ['sable1', 'tallowmere', 'kilnmother', 'vespertine', 'sable2', 'lucerne']) if (T.bosses[id] && !T.bosses[id].intro) err(`bosses.${id}: speaking boss needs intro lines`);
  if (T.bosses.lucerne && !T.bosses.lucerne.phase2) err('bosses.lucerne.phase2 missing');
}

// endings & credits
if (isObj(T.endings)) {
  sameSet(Object.keys(T.endings), ['undying', 'gutterlight'], 'endings');
  const LAST = { undying: 'And the light did not end. Nor did it shine.', gutterlight: 'Every light gutters. That is how it is passed on.' };
  const TITLE = { undying: 'The Undying Light', gutterlight: 'Gutterlight' };
  for (const id of ['undying', 'gutterlight']) {
    const e = T.endings[id];
    if (!e) continue;
    needStr(e, 'title', `endings.${id}`);
    if (e.title !== TITLE[id]) err(`endings.${id}.title must be '${TITLE[id]}'`);
    if (needLines(e, 'pages', `endings.${id}`, 5, 8) && e.pages[e.pages.length - 1] !== LAST[id]) err(`endings.${id}: last page must be the DESIGN line '${LAST[id]}'`);
    if (e.scenes !== undefined) {
      if (!Array.isArray(e.scenes) || e.scenes.length !== e.pages.length) err(`endings.${id}.scenes must parallel pages`);
      else e.scenes.forEach((s) => { if (!SCENE_WORDS.includes(s)) err(`endings.${id}.scenes: unknown scene '${s}'`); });
    }
  }
}
if (!Array.isArray(T.credits) || !T.credits.every((l) => typeof l === 'string')) err('credits must be an array of strings');
else if (!T.credits.includes('Made entirely in code — every image, note and sound generated at runtime')) err("credits must include 'Made entirely in code — every image, note and sound generated at runtime'");

// shops
if (isObj(T.shops)) {
  sameSet(Object.keys(T.shops), SHOP_IDS, 'shops');
  for (const s of SHOP_IDS) for (const k of ['greet', 'bought', 'poor', 'empty']) needStr(T.shops[s], k, `shops.${s}`);
  const b = T.shops.bramm;
  if (b) {
    needStr(b, 'maxed', 'shops.bramm'); needStr(b, 'noGlass', 'shops.bramm');
    needLines(b, 'upgrade', 'shops.bramm', I.shops && I.shops.bramm ? I.shops.bramm.length : 3, 3);
    needLines(b, 'offer', 'shops.bramm', I.shops && I.shops.bramm ? I.shops.bramm.length : 3, 3);
  }
}

// ui
if (isObj(T.ui)) {
  for (const k of UI_REQUIRED) if (T.ui[k] === undefined) err(`ui.${k} missing`);
  if (T.ui.restToEquip !== 'Rest at a Sconce to change Sigils') err("ui.restToEquip must read 'Rest at a Sconce to change Sigils'");
  if (isObj(T.ui.prompts)) for (const k of PROMPTS_REQUIRED) needStr(T.ui.prompts, k, 'ui.prompts');
  if (isObj(T.ui.actions)) for (const k of ACTIONS_REQUIRED) needStr(T.ui.actions, k, 'ui.actions');
}

// ------------------------------------------------------------------------------------------------
// No soul/damage numbers (permanent rule, user request): Hollow Knight never shows nail damage or soul amounts;
// abilities, sigils and upgrades are described in words, health is drawn as candles and the Ember Well as a vessel.
// Fails on: a number next to ember/soul/damage/dmg/health/hp/heal ('33 Ember', 'Ember 132', '9 damage', 'Health: 5'),
// a spelled-out amount of Ember or damage ('thirty Ember'), percentages ('30%', 'percent'), signed modifiers ('+11',
// '-30'), multipliers ('x2', '1.5x') and number arrows ('5 -> 9'). In abilities.*, items.*, sigils.* and shops.* no
// digit may appear at all. Currency (Cinders), prices ({price} placeholders), item/seal counts and lore dates
// ('Day 112', 'Warden Seals: {n} / 3') are NOT stat numbers and are not matched.
// NUMERIC_ALLOW: where -> reason, for a legitimate non-stat number that a pattern would catch. Currently empty;
// add an entry (exact path as printed by the error) only with a reason that is not a soul/damage/health value.
const NUMERIC_ALLOW = {};
const STAT_WORD = '(?:ember|soul|damage|dmg|health|hp|heal(?:s|ing|th)?)';
const SPELLED = '(?:one|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve|thirteen|fifteen|twenty|thirty|forty|fifty|sixty|hundred)';
const NUMERIC_RULES = [
  ['number + stat', new RegExp('\\b\\d+(?:\\.\\d+)?\\s*(?:more\\s+|extra\\s+|bonus\\s+)?' + STAT_WORD + '\\b', 'i')],
  ['stat + number', new RegExp('\\b' + STAT_WORD + '\\s*[:=]?\\s*[+\\-]?\\d', 'i')],
  ['spelled amount', new RegExp('\\b' + SPELLED + '(?:[\\s-]+' + SPELLED + ')*\\s+(?:more\\s+|extra\\s+)?(?:ember|soul|damage|dmg)\\b', 'i')],
  ['percentage', /\d\s*%|\bper\s?cent\b/i],
  ['signed modifier', /(^|[^\w])[+\-−]\s?\d/],
  ['multiplier', /\b\d+(?:\.\d+)?\s*[x×](?![a-z])|(^|[^\w])[x×]\s?\d/i],
  ['number arrow', /\d\s*(?:->|=>|→|>)\s*\d/],
];
function numericStat(s, where) {
  if (NUMERIC_ALLOW[where]) return null;
  for (const [name, re] of NUMERIC_RULES) if (re.test(s)) return name;
  if (/^(abilities|items|sigils|shops)\./.test(where) && /\d/.test(s)) return 'digit in an ability/item/sigil/shop string';
  return null;
}
// Self-test so a broken pattern cannot silently pass everything.
for (const [s, where, bad] of [
  ['Costs 33 Ember.', 'ui.x', true], ['+11 Ember', 'ui.x', true], ['+33 Ember capacity', 'ui.x', true], ['cooldown -30%', 'ui.x', true],
  ['+50% damage', 'ui.x', true], ['9 damage', 'ui.x', true], ['Ember 132', 'ui.x', true], ['Brand 1/3 . 9 damage', 'ui.x', true],
  ['5 -> 9 damage', 'ui.x', true], ['Health: 6', 'ui.x', true], ['heals 2x', 'ui.x', true], ['thirty-three Ember', 'ui.x', true],
  ['draws 6 more Ember', 'ui.x', true], ['restores 2 health', 'ui.x', true], ['Level 2', 'items.brand.levels[1].desc', true],
  ['Your spells burn far hotter.', 'sigils.x.desc', false], ['Warden Seals: {n} / 3', 'ui.sealDoorCount', false],
  ['Day 112 since the Lantern was lit.', 'lore.x.lines[0]', false], ['{price} Cinders', 'ui.priceCinders', false],
  ['Two shards fuse into a new candle of health.', 'items.heartwax.desc', false], ['one more candle of health', 'sigils.x.desc', false],
]) if (!!numericStat(s, where) !== bad) err(`[self-test] numericStat('${s}' @ ${where}) should be ${bad ? 'flagged' : 'clean'}`);

// ------------------------------------------------------------------------------------------------
// 2. Every player-facing string: length, terms, tokens, punctuation
const NON_TEXT_KEYS = new Set(['id', 'when', 'give', 'setFlag', 'shop', 'scenes', 'once']);
let stringCount = 0, charCount = 0, longest = { len: 0, where: '' };
function walk(v, where) {
  if (typeof v === 'string') return checkString(v, where);
  if (Array.isArray(v)) return v.forEach((x, i) => walk(x, `${where}[${i}]`));
  if (isObj(v)) for (const [k, x] of Object.entries(v)) if (!NON_TEXT_KEYS.has(k)) walk(x, where ? `${where}.${k}` : k);
}
function checkString(s, where) {
  stringCount++;
  charCount += s.length;
  const isCreditSpacer = where.startsWith('credits[') && s === '';
  if (!s.length && !isCreditSpacer) err(`${where}: empty string`);
  if (s.length > longest.len) longest = { len: s.length, where };
  if (s.length > 220) err(`${where}: ${s.length} chars (max 220): "${s.slice(0, 60)}..."`);
  else if (s.length > 140) warn(`${where}: ${s.length} chars (ideal <= 140)`);
  if (s !== s.trim()) err(`${where}: leading/trailing whitespace`);
  if (/ {2,}/.test(s)) err(`${where}: double space`);
  if (/ \n|\n /.test(s)) err(`${where}: space next to a line break`);
  if (/\s[,.;:!?]/.test(s) && !/\s\.\.\./.test(s)) err(`${where}: space before punctuation`);
  // 'a,b' / 'a;b' / 'a:b' are typos; a quote, bracket or digit may follow directly.
  if (/[,;:][^\s'")\d]/.test(s)) err(`${where}: missing space after punctuation`);
  if (/\.{4,}/.test(s) || /(^|[^.])\.\.(?!\.)/.test(s)) err(`${where}: malformed ellipsis (use exactly '...')`);
  for (const ch of s) if (ch.charCodeAt(0) > 126 && !ALLOWED_NON_ASCII.has(ch)) err(`${where}: non-ASCII character U+${ch.charCodeAt(0).toString(16)} ('${ch}')`);
  if (/[\t\r]/.test(s)) err(`${where}: tab or carriage return`);
  if (/ - /.test(s)) err(`${where}: spaced hyphen used as a dash (use '—')`);
  if ((s.match(/"/g) || []).length % 2) err(`${where}: unbalanced double quotes`);
  if ((s.match(/\(/g) || []).length !== (s.match(/\)/g) || []).length) err(`${where}: unbalanced parentheses`);
  for (const [name, re] of FORBIDDEN) if (re.test(s)) err(`${where}: forbidden term '${name}': "${s}"`);
  const num = numericStat(s, where);
  if (num) err(`${where}: shows a soul/damage number (${num}); describe it in words: "${s}"`);
  for (const [name, re] of AVOID) {
    if (!re.test(s)) continue;
    if ((AVOID_EXCEPT[where] || []).includes(name)) continue;
    err(`${where}: Hollow-Knight-associated term '${name}': "${s}"`);
  }
  // Tokens: input tokens anywhere in narrative; format placeholders only in ui/shops.
  const braces = s.replace(/\{(\w+)\}/g, '');
  if (/[{}]/.test(braces)) err(`${where}: stray brace`);
  for (const m of s.matchAll(/\{(\w+)\}/g)) {
    const tok = m[1];
    const inUi = where.startsWith('ui.') || where.startsWith('shops.');
    if (INPUT_TOKENS.includes(tok)) {
      if (inUi && !where.startsWith('ui.controlTips')) warn(`${where}: input token {${tok}} in a ui/shop string (only ui.controlTips is documented to carry them)`);
      continue;
    }
    if (PLACEHOLDERS.includes(tok) && inUi) continue;
    err(`${where}: unknown token {${tok}}`);
  }
  // Up and Interact are separately rebindable: rest/read/talk/travel prompts must name {interact}, not {up}.
  if (/\{up\}[^.]{0,20}\b(rest|read|talk|travel|shop|open)\b/i.test(s)) err(`${where}: use {interact} (not {up}) for rest/read/talk/travel`);
  // Sentence-final punctuation for prose pages (not titles/labels).
  const prose = /^(intro|npcs\.[^.]+\.talks|lore\.[^.]+\.lines|sparks\.[^.]+\.lines|endings\.[^.]+\.pages|bosses\.[^.]+\.(intro|phase2|defeat))/.test(where);
  // Verse may end a page on ';' and quoted speech on a closing quote; graffiti and signatures
  // (lore_gw_1 last page, lore_gw_3, lore_mw_2 signature, lore_sf_1 last page) are deliberately bare.
  const bare = /^lore\.(lore_gw_3\.|lore_mw_2\.lines\[2\]|lore_gw_1\.lines\[3\]|lore_sf_1\.lines\[2\])/.test(where);
  if (prose && !bare && !/[.!?"'\u2014);:]$/.test(s)) {
    err(`${where}: prose page should end with punctuation: "${s.slice(-30)}"`);
  }
}
walk(T, '');

// The UI must not rebuild damage/Ember numbers from data either: no 'ui.damage' suffix key, and no src/ui code that
// draws the Brand's damage (`.dmg`, G.Items.brandDamage) or G.game.emberMax()/maxHealth() as text.
if (isObj(T.ui) && T.ui.damage !== undefined) err("ui.damage exists: Brand damage numbers are not shown (no-numbers)");
{
  const uiDir = path.join(ROOT, 'src', 'ui');
  const NUM_UI = [
    [/ui\.damage/, "'ui.damage' suffix"],
    [/\.dmg\b/, 'Brand damage value (.dmg)'],
    [/brandDamage/, 'G.Items.brandDamage'],
    [/String\(\s*G\.game\.(?:emberMax|maxHealth)\(\)\s*\)/, 'numeric Ember/health readout'],
  ];
  if (fs.existsSync(uiDir)) for (const f of fs.readdirSync(uiDir).filter((x) => x.endsWith('.js'))) {
    fs.readFileSync(path.join(uiDir, f), 'utf8').split('\n').forEach((line, i) => {
      if (/^\s*(\/\/|\*)/.test(line)) return;
      for (const [re, what] of NUM_UI) if (re.test(line)) err(`src/ui/${f}:${i + 1}: ${what} (no soul/damage numbers in the UI)`);
    });
  }
}

// ------------------------------------------------------------------------------------------------
// 2b. The API doc must mention every ui key, lore id, npc key, sigil and shop-extra key.
const DOC = path.join(ROOT, 'docs', 'api', 'text.md');
if (!fs.existsSync(DOC)) err('docs/api/text.md missing');
else {
  const doc = fs.readFileSync(DOC, 'utf8');
  const mentioned = (k) => new RegExp('(^|[^A-Za-z0-9_])' + k.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '([^A-Za-z0-9_]|$)').test(doc);
  const keys = [];
  if (isObj(T.ui)) for (const [k, v] of Object.entries(T.ui)) { keys.push(['ui', k]); if (isObj(v)) for (const kk of Object.keys(v)) keys.push([`ui.${k}`, kk]); }
  if (isObj(T.lore)) for (const k of Object.keys(T.lore)) keys.push(['lore', k]);
  if (isObj(T.npcs)) for (const k of Object.keys(T.npcs)) keys.push(['npcs', k]);
  if (isObj(T.shops)) for (const [sid, sh] of Object.entries(T.shops)) for (const k of Object.keys(sh)) keys.push([`shops.${sid}`, k]);
  if (isObj(T.npcs)) for (const npc of Object.values(T.npcs)) for (const t of npc.talks || []) if (t.setFlag) keys.push(['flag', t.setFlag]);
  for (const [where, k] of keys) if (!mentioned(k)) err(`docs/api/text.md does not mention ${where} key '${k}'`);
}

// ------------------------------------------------------------------------------------------------
// 3. G.Items
if (!isObj(I.sigils)) err('G.Items.sigils missing');
else {
  sameSet(Object.keys(I.sigils), SIGILS, 'G.Items.sigils');
  for (const id of SIGILS) if (I.sigils[id] && I.sigils[id].cost !== SIGIL_COSTS[id]) err(`G.Items.sigils.${id}.cost ${I.sigils[id].cost} != DESIGN ${SIGIL_COSTS[id]}`);
  const order = Object.keys(I.sigils).join(',');
  if (order !== SIGILS.join(',')) warn('G.Items.sigils order differs from DESIGN §3.5 table order');
  if (isObj(T.sigils) && Object.keys(T.sigils).join(',') !== order) err('G.Text.sigils and G.Items.sigils key order differ');
}
if (!isObj(I.shops)) err('G.Items.shops missing');
else {
  sameSet(Object.keys(I.shops), SHOP_IDS, 'G.Items.shops');
  const pell = I.shops.pell || [];
  if (pell.length !== PELL_STOCK.length) err(`G.Items.shops.pell: ${pell.length} entries, expected ${PELL_STOCK.length}`);
  PELL_STOCK.forEach(([item, id, price, sigil], i) => {
    const e = pell.find((x) => x.id === id);
    if (!e) return err(`G.Items.shops.pell: missing ${id}`);
    if (e.item !== item) err(`G.Items.shops.pell ${id}: item '${e.item}' != '${item}'`);
    if (e.price !== price) err(`G.Items.shops.pell ${id}: price ${e.price} != ${price}`);
    if (sigil && e.sigil !== sigil) err(`G.Items.shops.pell ${id}: sigil '${e.sigil}' != '${sigil}'`);
    const give = sigil ? `sigil:${sigil}` : item;
    if (e.give !== give || !validGive(e.give)) err(`G.Items.shops.pell ${id}: give '${e.give}' should be '${give}'`);
    if (sigil && !(T.sigils && T.sigils[sigil])) err(`G.Items.shops.pell ${id}: sigil has no text`);
    if (pell.indexOf(e) !== i) warn(`G.Items.shops.pell: ${id} not in DESIGN order`);
  });
  const quill = I.shops.quill || [];
  sameSet(quill.map((q) => q.region), Object.keys(QUILL_STOCK), 'G.Items.shops.quill regions');
  for (const q of quill) {
    if (q.item !== 'chart') err(`G.Items.shops.quill ${q.region}: item must be 'chart'`);
    if (q.price !== QUILL_STOCK[q.region]) err(`G.Items.shops.quill ${q.region}: price ${q.price} != ${QUILL_STOCK[q.region]}`);
    if (!(T.areas && T.areas[q.region])) err(`G.Items.shops.quill ${q.region}: no area text`);
  }
  const bramm = I.shops.bramm || [];
  const want = [[1, 250, 0], [2, 700, 1], [3, 1500, 2]];
  if (JSON.stringify(bramm.map((b) => [b.level, b.price, b.glass])) !== JSON.stringify(want)) err('G.Items.shops.bramm differs from DESIGN (L1 250/0, L2 700/1, L3 1500/2)');
  const ids = [...pell, ...quill].map((e) => e.id);
  if (new Set(ids).size !== ids.length) err('G.Items.shops: duplicate stock ids');
}
if (JSON.stringify(I.brandDamage) !== JSON.stringify([5, 9, 13, 17])) err('G.Items.brandDamage must be [5, 9, 13, 17]');
if (JSON.stringify(I.totals) !== JSON.stringify({ heartwax: 8, urns: 2, kilnGlass: 3, sparks: 6, seals: 3, sigils: 14, notches: 6, bosses: 8 })) err('G.Items.totals differs from TECH_SPEC §15');
if (I.order) {
  if (JSON.stringify(I.order.abilities) !== JSON.stringify(ABILITIES)) err('G.Items.order.abilities wrong');
  if (JSON.stringify(I.order.sparks) !== JSON.stringify(SPARKS)) err('G.Items.order.sparks wrong');
  if (JSON.stringify(I.order.seals) !== JSON.stringify(SEALS)) err('G.Items.order.seals wrong');
  if (JSON.stringify(I.order.bosses) !== JSON.stringify(BOSSES)) err('G.Items.order.bosses wrong');
}
if (I.totals && I.totals.sigils !== SIGILS.length) err('totals.sigils != number of sigils');
const shopKilnTotal = (I.shops && I.shops.bramm || []).reduce((a, b) => a + b.glass, 0);
if (I.totals && shopKilnTotal !== I.totals.kilnGlass) err(`Bramm consumes ${shopKilnTotal} Kiln Glass but ${I.totals.kilnGlass} exist`);

// ------------------------------------------------------------------------------------------------
// 4. Dialogue simulation (first-match semantics, once-entries remembered) over several routes.
// Each route is a list of [stageName, gains]; NPCs are present when their predicate holds.
const ROUTES = {
  // Critical path with every Spark found along the way; talk to everyone at every stage.
  full: [
    ['start', {}],
    ['bolt', { abilities: ['bolt'] }],
    ['effigy', { bosses: ['effigy'] }],
    ['sable1+dash', { bosses: ['sable1'], abilities: ['dash'], sparks: 1 }],
    ['matron+grip', { bosses: ['matron'], abilities: ['grip'], sparks: 2 }],
    ['oilcloak', { abilities: ['oilcloak'], sparks: 3 }],
    ['tallowmere', { bosses: ['tallowmere'], seals: 1 }],
    ['plunge', { abilities: ['plunge'], sparks: 4 }],
    ['kilnmother', { bosses: ['kilnmother'], seals: 2, sparks: 5 }],
    ['wings', { abilities: ['wings'] }],
    ['vespertine', { bosses: ['vespertine'], seals: 3, sparks: 6 }],
    ['sable2', { bosses: ['sable2'] }],
  ],
  // No Sparks at all; Sable's second duel before all three seals; abilities out of order.
  rushed: [
    ['start', {}],
    ['effigy (no bolt)', { bosses: ['effigy'] }],
    ['sable1+dash', { bosses: ['sable1'], abilities: ['dash'] }],
    ['matron+grip', { bosses: ['matron'], abilities: ['grip'] }],
    ['plunge (chandlery first)', { abilities: ['plunge'] }],
    ['oilcloak', { abilities: ['oilcloak'] }],
    ['wings', { abilities: ['wings'] }],
    ['sable2 (seals 0)', { bosses: ['sable2'] }],
    ['kilnmother', { bosses: ['kilnmother'], seals: 1 }],
    ['tallowmere', { bosses: ['tallowmere'], seals: 2 }],
    ['vespertine', { bosses: ['vespertine'], seals: 3 }],
    ['bolt (late)', { abilities: ['bolt'] }],
  ],
};
const NPC_PRESENT = {
  wren_2: (st) => st.abilities.has('grip'),
  wren_3: (st) => st.abilities.has('oilcloak'),
  wren_4: (st) => st.abilities.has('plunge') && st.abilities.has('wings'),
  sable_2: (st) => st.bosses.has('sable2'),
};
function makeState() { return { abilities: new Set(), bosses: new Set(), seals: 0, sparks: 0, flags: new Set(), gifts: [] }; }
function evalCond(str, st) {
  const p = parseCondition(str);
  if (!p.ok) return false;
  return p.terms.every(({ neg, term }) => {
    let v;
    const [kind, ...rest] = term.split(':');
    if (term.startsWith('seals>=')) v = st.seals >= +term.slice(7);
    else if (term.startsWith('sparks>=')) v = st.sparks >= +term.slice(8);
    else if (kind === 'ability') v = st.abilities.has(rest[0]);
    else if (kind === 'boss') v = st.bosses.has(rest[0]);
    else if (kind === 'flag') v = st.flags.has(rest.join(':'));
    else if (kind === 'sigil') v = st.gifts.includes(term); // shop purchases are not simulated
    else if (kind === 'talked') v = st.flags.has(`talked:${rest[0]}:${rest[1]}`);
    else v = false; // item/visited/region: unknown to the simulation
    return neg ? !v : v;
  });
}
function pickTalk(key, st) {
  return T.npcs[key].talks.find((t) => evalCond(t.when, st) && !(t.once && st.flags.has(`talked:${key}:${t.id}`)));
}
// skip: NPC keys the player never talks to (e.g. Wren's optional stage 1 in gw_09).
function runRoute(route, talkEvery, skip = []) {
  const st = makeState();
  const shown = new Set();
  const transcript = [];
  route.forEach(([name, gain], si) => {
    for (const a of gain.abilities || []) st.abilities.add(a);
    for (const b of gain.bosses || []) st.bosses.add(b);
    if (gain.seals !== undefined) st.seals = gain.seals;
    if (gain.sparks !== undefined) st.sparks = gain.sparks;
    if (!talkEvery && si !== route.length - 1) return;
    const log = [];
    for (const key of NPC_KEYS) {
      if (skip.includes(key) || (NPC_PRESENT[key] && !NPC_PRESENT[key](st))) continue;
      // Talk until the NPC says something repeatable (nothing new left), at most 30 times.
      for (let n = 0; n < 30; n++) {
        const t = pickTalk(key, st);
        if (!t) { err(`simulation: npcs.${key} had nothing to say at '${name}' (no fallback matched)`); break; }
        // Wren's opening page may only assume an earlier meeting if the player had one. Stage 4 is
        // exempt: her single Longbrand gift entry (validate: each sigil obtainable once) is written
        // for a player who has met her; skipping all three earlier talks is accepted (see test-output/qa-fix-text-r2/notes.md).
        const ws = /^wren_([23])$/.exec(key);
        if (ws && /remember me|Blue-flame|Blue\.\.\. flame/.test(t.lines[0])) {
          let met = false;
          for (let k = 1; k <= +ws[1]; k++) if (st.flags.has('wren_met_' + k)) met = true;
          if (!met) err(`simulation: npcs.${key}.${t.id} at '${name}' assumes an earlier meeting with Wren that never happened`);
        }
        st.flags.add(`talked:${key}:${t.id}`);
        if (t.setFlag) st.flags.add(t.setFlag);
        if (t.give) st.gifts.push(t.give);
        shown.add(`${key}:${t.id}`);
        log.push({ key, id: t.id, once: !!t.once, lines: t.lines, give: t.give });
        if (!t.once) break;
      }
    }
    transcript.push([name, log]);
  });
  return { st, shown, transcript };
}
if (isObj(T.npcs) && NPC_KEYS.every((k) => T.npcs[k] && Array.isArray(T.npcs[k].talks))) {
  const runs = [
    ['full route, talking at every stage', runRoute(ROUTES.full, true)],
    ['full route, talking only at the end', runRoute(ROUTES.full, false)],
    ['rushed route, talking at every stage', runRoute(ROUTES.rushed, true)],
    // Wren's earlier stages are optional (gw_09 is off the critical path; talking is always optional):
    // her first-meeting variants must cover a player who first speaks to her at a later stage.
    ['full route, every stage, never speaking to Wren in the Ways', runRoute(ROUTES.full, true, ['wren_1'])],
    ['full route, at the end, never speaking to Wren in the Ways', runRoute(ROUTES.full, false, ['wren_1'])],
    ['full route, every stage, first speaking to Wren in the Mothwood', runRoute(ROUTES.full, true, ['wren_1', 'wren_2'])],
    ['full route, at the end, first speaking to Wren in the Mothwood', runRoute(ROUTES.full, false, ['wren_1', 'wren_2'])],
  ];
  // Pell must not pitch the Waymoth once it has been bought (G.game.evalCondition knows owned sigils).
  const way = T.npcs.pell.talks.find((t) => t.id === 'waymoth');
  if (way && evalCond(way.when, Object.assign(makeState(), { gifts: ['sigil:waymoth'] }))) err("npcs.pell.waymoth still plays after the Waymoth is owned (add '!sigil:waymoth')");
  const fullShown = new Set(runs.filter(([label]) => label.startsWith('full route')).flatMap(([, r]) => [...r.shown]));
  const shownAny = new Set(runs.flatMap(([, r]) => [...r.shown]));
  for (const key of NPC_KEYS) for (const t of T.npcs[key].talks) {
    // Every one-shot talk must appear on some full-route run; every conditional one on some route.
    if (t.once && !fullShown.has(`${key}:${t.id}`)) err(`simulation: once-talk npcs.${key}.${t.id} is never reached on the full route`);
    if (!shownAny.has(`${key}:${t.id}`)) {
      const last = T.npcs[key].talks[T.npcs[key].talks.length - 1] === t;
      (last ? warn : err)(`simulation: npcs.${key}.${t.id} is never chosen on any simulated route`);
    }
  }
  for (const [label, r] of runs) {
    const gifts = r.st.gifts.slice().sort().join(',');
    if (gifts !== 'notch,sigil:long_brand') err(`simulation (${label}): gifts were [${gifts}], expected notch + sigil:long_brand once each`);
  }
  if (args.has('--transcript')) {
    for (const [label, r] of runs) {
      console.log(`\n================ ${label} ================`);
      for (const [stage, log] of r.transcript) {
        console.log(`\n--- ${stage}`);
        for (const e of log) console.log(`  [${e.key}.${e.id}${e.once ? '*' : ''}${e.give ? ' +' + e.give : ''}] ${e.lines.join(' / ')}`);
      }
    }
  }
}

// ------------------------------------------------------------------------------------------------
// No spoilers (modes-fix-text): control labels must not name an ability the player may not have found yet, and the
// first-death wisp hint must not say the wisp is "where you fell" (after a boss death it waits outside the arena).
if (isObj(T.ui) && isObj(T.ui.actions)) {
  const abilityNames = isObj(T.abilities) ? Object.values(T.abilities).map((a) => a && a.name).filter(Boolean) : [];
  for (const [k, v] of Object.entries(T.ui.actions)) {
    const n = abilityNames.find((x) => String(v).includes(x));
    if (n) err(`ui.actions.${k} names the ability "${n}" (a spoiler on the Controls screen): ${v}`);
  }
}
if (isObj(T.ui) && /where you fell/i.test(String(T.ui.wispHint || ''))) err('ui.wispHint says "where you fell"; after a boss death the Gutterwisp waits outside the arena');

// ------------------------------------------------------------------------------------------------
// Report
const count = (o) => (isObj(o) ? Object.keys(o).length : 0);
if (!args.has('--quiet')) {
  console.log('GUTTERLIGHT text check');
  console.log(`  intro ${T.intro ? T.intro.length : 0} pages | areas ${count(T.areas)} | npcs ${count(T.npcs)} | lore ${count(T.lore)} | sparks ${count(T.sparks)} | abilities ${count(T.abilities)} | items ${count(T.items)} | sigils ${count(T.sigils)} | bosses ${count(T.bosses)} | endings ${count(T.endings)} | ui keys ${count(T.ui)}`);
  console.log(`  ${stringCount} strings, ${charCount} chars; longest ${longest.len} chars at ${longest.where}`);
  const talks = isObj(T.npcs) ? Object.values(T.npcs).reduce((a, n) => a + (n.talks ? n.talks.length : 0), 0) : 0;
  console.log(`  ${talks} NPC talk entries (thrum ${T.npcs && T.npcs.thrum ? T.npcs.thrum.talks.length : 0})`);
}
for (const w of warnings) console.log('WARN  ' + w);
for (const e of errors) console.log('ERROR ' + e);
console.log(errors.length ? `FAILED: ${errors.length} error(s), ${warnings.length} warning(s)` : `OK: 0 errors, ${warnings.length} warning(s)`);
process.exit(errors.length ? 1 : 0);
