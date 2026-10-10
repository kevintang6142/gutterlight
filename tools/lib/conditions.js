// Condition strings (TECH_SPEC §9.1, engine doc §14): parse, check references, evaluate against token sets.
//
//   parseCondition('lever:gw_lv1 & !boss:effigy & seals>=3')
//     → { terms: [{neg, kind:'lever', arg:'gw_lv1', raw}, ...], errors: [] }
//   evalWithTokens(cond, tokens)  → bool, where tokens = Set of plan requirement tokens
//     ('dash', 'boss:effigy', 'lever:gw_lv1', 'seals>=3', ...). Used by reach.js for gates.
'use strict';

const COUNTERS = ['seals', 'sparks', 'cinders', 'health', 'maxhealth', 'heartwax', 'urns', 'notches', 'brand',
  'kilnglass', 'bosses', 'sigils', 'abilities'];
const KNOWN_PREFIXES = ['ability', 'boss', 'flag', 'item', 'visited', 'region', 'sigil', 'equipped', 'spark', 'seal',
  'lantern', 'chart', 'lever', 'talked', 'broken', 'dead'];
const COUNTER_RE = new RegExp('^(' + COUNTERS.join('|') + ')\\s*(>=|<=|==|!=|>|<|=)\\s*(\\d+)$');

function parseCondition(str) {
  const out = { terms: [], errors: [] };
  if (str == null || str === '') return out;
  if (typeof str !== 'string') { out.errors.push('condition must be a string (got ' + typeof str + ')'); return out; }
  const parts = str.split('&');
  for (let raw of parts) {
    raw = raw.trim();
    if (!raw) { out.errors.push('empty term in "' + str + '"'); continue; }
    let neg = false, t = raw;
    if (t[0] === '!') { neg = true; t = t.slice(1).trim(); }
    if (t === 'true' || t === 'false') { out.terms.push({ neg, kind: 'const', arg: t, raw }); continue; }
    const cm = COUNTER_RE.exec(t);
    if (cm) { out.terms.push({ neg, kind: 'counter', counter: cm[1], op: cm[2], value: +cm[3], raw }); continue; }
    const m = /^([a-z_]+):([A-Za-z0-9_:\-]+)$/.exec(t);
    if (!m) { out.errors.push('cannot parse term "' + raw + '"'); continue; }
    const kind = m[1], arg = m[2];
    if (!KNOWN_PREFIXES.includes(kind)) {
      // the engine treats unknown a:b terms as raw flag lookups: allowed, but flag it as suspicious
      out.terms.push({ neg, kind: 'rawflag', prefix: kind, arg, raw, unknownPrefix: true });
      continue;
    }
    out.terms.push({ neg, kind, arg, raw });
  }
  return out;
}

// Check the references of a parsed condition against the world's id sets.
// ctx: {abilities:Set, bosses:Set, regions:Set, rooms:Set, sigils:Set, sparks:Set, seals:Set, lanterns:Set,
//       levers:Set, pickups:Set, npcTalks:Map(npcKey → Set(talkIds)), persistentIds:Set}
// → { errors: [], warnings: [] }
function checkRefs(parsed, ctx) {
  const errors = parsed.errors.slice(), warnings = [];
  const need = (set, v, what, level) => {
    if (!set) return;
    if (!set.has(v)) (level === 'warn' ? warnings : errors).push(what + ' "' + v + '" does not exist');
  };
  for (const t of parsed.terms) {
    switch (t.kind) {
      case 'ability': need(ctx.abilities, t.arg, 'ability'); break;
      case 'boss': need(ctx.bosses, t.arg, 'boss'); break;
      case 'region': need(ctx.regions, t.arg, 'region'); break;
      case 'chart': need(ctx.regions, t.arg, 'chart region'); break;
      case 'visited': need(ctx.rooms, t.arg, 'room'); break;
      case 'sigil': case 'equipped': need(ctx.sigils, t.arg, 'sigil'); break;
      case 'spark': need(ctx.sparks, t.arg, 'spark'); break;
      case 'seal': need(ctx.seals, t.arg, 'seal'); break;
      case 'lantern': need(ctx.lanterns, t.arg, 'lanternway'); break;
      case 'lever': need(ctx.levers, t.arg, 'lever'); break;
      case 'item': need(ctx.pickups, t.arg, 'pickup/shop item'); break;
      case 'dead': need(ctx.persistentIds, t.arg, 'persistent enemy id', 'warn'); break;
      case 'talked': {
        const [npc, id] = t.arg.split(':');
        if (!id) { errors.push('talked term needs "talked:<npc>:<talkId>" (got "' + t.raw + '")'); break; }
        if (ctx.npcTalks) {
          const talks = ctx.npcTalks.get(npc);
          if (!talks) warnings.push('talked: npc "' + npc + '" has no talks in G.Text.npcs');
          else if (!talks.has(id)) warnings.push('talked: npc "' + npc + '" has no talk id "' + id + '"');
        }
        break;
      }
      case 'rawflag': warnings.push('term "' + t.raw + '" uses an unknown prefix "' + t.prefix + ':" (treated as a raw flag)'); break;
      default: break;
    }
  }
  return { errors, warnings };
}

// Evaluate a condition against plan requirement tokens (reach analysis of gates).
// Tokens: ability ids, 'boss:<id>', 'lever:<id>', 'seals>=N', 'flag:<x>' ... A positive term holds if the token is
// present (counters: a token 'seals>=M' with M >= N). Negated terms hold if the positive term does not.
function evalWithTokens(cond, tokens) {
  const p = typeof cond === 'string' || cond == null ? parseCondition(cond) : cond;
  if (p.errors.length) return false;
  for (const t of p.terms) {
    let v;
    if (t.kind === 'const') v = t.arg === 'true';
    else if (t.kind === 'counter') {
      v = false;
      for (const tok of tokens) {
        const m = COUNTER_RE.exec(tok);
        if (!m || m[1] !== t.counter) continue;
        const have = +m[3];
        if ((t.op === '>=' && have >= t.value) || (t.op === '>' && have > t.value) || ((t.op === '==' || t.op === '=') && have === t.value)) v = true;
      }
    } else if (t.kind === 'ability') v = tokens.has(t.arg) || tokens.has('ability:' + t.arg);
    else v = tokens.has(t.raw.replace(/^!\s*/, ''));
    if (t.neg) v = !v;
    if (!v) return false;
  }
  return true;
}

module.exports = { parseCondition, checkRefs, evalWithTokens, COUNTERS, KNOWN_PREFIXES };
