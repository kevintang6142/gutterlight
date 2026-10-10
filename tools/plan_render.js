#!/usr/bin/env node
// Renders design/world_plan.json to design/world_map.png (headless Chromium, inline canvas page).
//
//   node tools/plan_render.js [plan.json] [--out design/world_map.png] [--scale 3] [--crop x,y,w,h]
//   (--crop writes only that pixel rectangle of the rendered map, for close inspection)
//
// Rooms are filled by region colour (same mapColor as src/data/regions/_regions.js), with ids, names,
// exits (doorway ticks; arrows for one-way drops), gate badges (requirements to cross a room), content
// icons, numbered critical-path milestones and a legend.
'use strict';
const fs = require('fs');
const path = require('path');
const { getBrowser, closeAll, ROOT } = require('./lib/browser');

const args = process.argv.slice(2);
const opt = (k, d) => { const i = args.indexOf(k); return i >= 0 ? args[i + 1] : d; };
const planFile = path.resolve(args.find((a, i) => !a.startsWith('--') && !(i > 0 && args[i - 1].startsWith('--'))) || path.join(ROOT, 'design', 'world_plan.json'));
const outFile = path.resolve(opt('--out', path.join(ROOT, 'design', 'world_map.png')));
const SCALE = parseFloat(opt('--scale', '3'));
const CROP = opt('--crop', null) ? opt('--crop').split(',').map(Number) : null;

const plan = JSON.parse(fs.readFileSync(planFile, 'utf8'));

const REGION_INFO = {
  shore: ['Ashen Shore', '#8a94a6'], lastlight: ['Lastlight', '#a8806e'], guttered: ['The Guttered Ways', '#b08850'],
  meltbloom: ['Meltbloom Gardens', '#94ad7e'], flue: ['The Sootflue', '#b8513c'], nave: ['The Drowned Nave', '#4f8fa3'],
  chandlery: ['The Chandlery', '#d0863a'], mothwood: ['The Mothwood', '#7b6ab4'], rime: ['The Rime', '#9fd2e4'],
  sanctum: ['The Heartwick Sanctum', '#e2c46c'],
};
const MILESTONES = ['shrine:bolt', 'arena:effigy', 'arena:sable1', 'shrine:dash', 'arena:matron', 'shrine:grip', 'shrine:oilcloak',
  'arena:tallowmere', 'shrine:plunge', 'arena:kilnmother', 'shrine:wings', 'arena:vespertine', 'arena:sable2', 'sealdoor', 'arena:lucerne'];

function pageHtml() {
  return `<!doctype html><html><head><meta charset="utf-8"><style>html,body{margin:0;background:#0d0b12}</style></head>
<body><canvas id="c"></canvas><script>
const PLAN = ${JSON.stringify(plan)};
const REGION_INFO = ${JSON.stringify(REGION_INFO)};
const MILESTONES = ${JSON.stringify(MILESTONES)};
const S = ${SCALE};
${clientCode.toString()}
clientCode();
</script></body></html>`;
}

// Runs inside the page.
function clientCode() {
  const rooms = PLAN.rooms;
  const byId = new Map(rooms.map((r) => [r.id, r]));
  let W = 0, H = 0;
  for (const r of rooms) { W = Math.max(W, r.gx + r.w); H = Math.max(H, r.gy + r.h); }
  const M = 50, TOP = 70, LEG = 250;
  const cv = document.getElementById('c');
  cv.width = Math.ceil(W * S + 2 * M);
  cv.height = Math.ceil(H * S + TOP + M + LEG);
  const ctx = cv.getContext('2d');
  const X = (gx) => M + gx * S, Y = (gy) => TOP + gy * S;

  function hexToRgb(h) { const n = parseInt(h.slice(1), 16); return [(n >> 16) & 255, (n >> 8) & 255, n & 255]; }
  function mix(a, b, t) { const A = hexToRgb(a), B = hexToRgb(b); return 'rgb(' + A.map((v, i) => Math.round(v + (B[i] - v) * t)).join(',') + ')'; }
  function rgba(h, a) { const c = hexToRgb(h); return 'rgba(' + c.join(',') + ',' + a + ')'; }

  // background + cell grid
  ctx.fillStyle = '#0d0b12'; ctx.fillRect(0, 0, cv.width, cv.height);
  ctx.strokeStyle = 'rgba(255,255,255,0.035)'; ctx.lineWidth = 1;
  for (let gx = 0; gx <= W; gx += 16) { ctx.beginPath(); ctx.moveTo(X(gx) + 0.5, Y(0)); ctx.lineTo(X(gx) + 0.5, Y(H)); ctx.stroke(); }
  for (let gy = 0; gy <= H; gy += 9) { ctx.beginPath(); ctx.moveTo(X(0), Y(gy) + 0.5); ctx.lineTo(X(W), Y(gy) + 0.5); ctx.stroke(); }

  // title
  ctx.fillStyle = '#efe6d2'; ctx.font = 'bold 30px Georgia, serif'; ctx.textBaseline = 'alphabetic';
  ctx.fillText('GUTTERLIGHT — World Plan', M, 44);
  const titleW = ctx.measureText('GUTTERLIGHT — World Plan').width;
  ctx.font = '15px Georgia, serif'; ctx.fillStyle = '#a99f8c';
  const nExits = rooms.reduce((n, r) => n + r.exits.length, 0) / 2;
  ctx.fillText(rooms.length + ' rooms · ' + nExits + ' doorways · 1 cell = 16×9 tiles · generated from design/world_plan.json', M + titleW + 24, 46);

  // region labels (behind rooms, very faint)
  const regionBox = {};
  for (const r of rooms) {
    const b = regionBox[r.region] || (regionBox[r.region] = { x0: 1e9, y0: 1e9, x1: -1e9, y1: -1e9, a: 0, cx: 0, cy: 0 });
    const a = r.w * r.h;
    b.x0 = Math.min(b.x0, r.gx); b.y0 = Math.min(b.y0, r.gy); b.x1 = Math.max(b.x1, r.gx + r.w); b.y1 = Math.max(b.y1, r.gy + r.h);
    b.cx += (r.gx + r.w / 2) * a; b.cy += (r.gy + r.h / 2) * a; b.a += a;
  }

  // gating summary of a room: distinct non-empty requirement sets over paths
  const ABBR = { dash: 'D', grip: 'G', wings: 'W', oilcloak: 'O', plunge: 'P' };
  const TOKCOL = { dash: '#ff9b4a', grip: '#e3d35c', wings: '#d7d7ff', oilcloak: '#58c7d8', plunge: '#ff5a5a', boss: '#ff4d6d', lever: '#c9b37a', seals: '#ffd75e' };
  function tokAbbr(t) {
    if (ABBR[t]) return ABBR[t];
    if (t.startsWith('boss:')) return 'Boss';
    if (t.startsWith('lever:')) return 'Lever';
    if (t === 'seals>=3') return 'Seals';
    return t;
  }
  function tokCol(t) { if (TOKCOL[t]) return TOKCOL[t]; if (t.startsWith('boss:')) return TOKCOL.boss; if (t.startsWith('lever:')) return TOKCOL.lever; return TOKCOL.seals; }
  function roomGates(r) {
    const sets = new Map();
    for (const p of r.paths) if (p.requires.length) { const k = p.requires.slice().sort().join('+'); sets.set(k, p.requires.slice().sort()); }
    // drop sets that are supersets of another listed set (keep it compact)
    const list = [...sets.values()].filter((s, i, all) => !all.some((o) => o !== s && o.length < s.length && o.every((x) => s.includes(x))));
    return list;
  }

  // ---- rooms
  for (const r of rooms) {
    const [, col] = REGION_INFO[r.region] || ['?', '#888888'];
    const x = X(r.gx), y = Y(r.gy), w = r.w * S, h = r.h * S;
    ctx.fillStyle = mix(col, '#0d0b12', 0.62);
    ctx.fillRect(x + 1, y + 1, w - 2, h - 2);
    // inner glow strip at the top
    const g = ctx.createLinearGradient(0, y, 0, y + h);
    g.addColorStop(0, rgba(col, 0.22)); g.addColorStop(1, rgba(col, 0.04));
    ctx.fillStyle = g; ctx.fillRect(x + 1, y + 1, w - 2, h - 2);
    ctx.lineWidth = r.kind === 'arena' ? 3 : 1.5;
    ctx.strokeStyle = r.kind === 'arena' ? '#ff4d6d' : col;
    if (r.kind === 'secret') ctx.setLineDash([5, 4]);
    ctx.strokeRect(x + 1.5, y + 1.5, w - 3, h - 3);
    ctx.setLineDash([]);
  }

  // ---- region names (above room fills, translucent)
  for (const [reg, b] of Object.entries(regionBox)) {
    const [name, col] = REGION_INFO[reg] || [reg, '#888'];
    const cx = X(b.cx / b.a), cy = Y(b.cy / b.a);
    ctx.save();
    ctx.font = 'italic bold 24px Georgia, serif';
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillStyle = rgba(col, 0.28);
    ctx.fillText(name.toUpperCase(), cx, cy);
    ctx.restore();
  }

  // ---- doorways
  const done = new Set();
  function canLeave(r, e) { return r.paths.some((p) => p.to === e.id) || (r.exits.length === 1 && r.spots.some((s) => s.from === e.id)); }
  function canEnter(r, e) { return r.paths.some((p) => p.from === e.id) || r.spots.some((s) => s.from === e.id); }
  function arrow(x, y, dx, dy, colr) {
    const L = 9;
    ctx.save(); ctx.translate(x, y); ctx.rotate(Math.atan2(dy, dx));
    ctx.fillStyle = colr; ctx.strokeStyle = '#000'; ctx.lineWidth = 1;
    ctx.beginPath(); ctx.moveTo(L, 0); ctx.lineTo(-L * 0.6, -L * 0.7); ctx.lineTo(-L * 0.25, 0); ctx.lineTo(-L * 0.6, L * 0.7); ctx.closePath();
    ctx.fill(); ctx.stroke(); ctx.restore();
  }
  for (const r of rooms) for (const e of r.exits) {
    const key = [r.id + e.id, e.to + e.toExit].sort().join('|');
    if (done.has(key)) continue; done.add(key);
    const b = byId.get(e.to); if (!b) continue;
    const be = b.exits.find((x) => x.id === e.toExit); if (!be) continue;
    let x0, y0, x1, y1;
    if (e.side === 'W' || e.side === 'E') { const gx = e.side === 'W' ? r.gx : r.gx + r.w; x0 = x1 = X(gx); y0 = Y(r.gy + e.pos); y1 = Y(r.gy + e.pos + e.size); }
    else { const gy = e.side === 'N' ? r.gy : r.gy + r.h; y0 = y1 = Y(gy); x0 = X(r.gx + e.pos); x1 = X(r.gx + e.pos + e.size); }
    const ab = canLeave(r, e) && canEnter(b, be), ba = canLeave(b, be) && canEnter(r, e);
    const interRegion = r.region !== b.region;
    // gap in the walls
    ctx.strokeStyle = '#0d0b12'; ctx.lineWidth = 5;
    ctx.beginPath(); ctx.moveTo(x0, y0); ctx.lineTo(x1, y1); ctx.stroke();
    // doorway tick
    ctx.strokeStyle = interRegion ? '#ffffff' : '#e8dcc0'; ctx.lineWidth = interRegion ? 3 : 2;
    ctx.beginPath();
    if (x0 === x1) { ctx.moveTo(x0 - 5, (y0 + y1) / 2); ctx.lineTo(x0 + 5, (y0 + y1) / 2); }
    else { ctx.moveTo((x0 + x1) / 2, y0 - 5); ctx.lineTo((x0 + x1) / 2, y0 + 5); }
    ctx.stroke();
    if (ab !== ba) {
      // one-way: arrow pointing from the room you can leave to the room you enter
      const from = ab ? r : b, fe = ab ? e : be;
      const d = { W: [-1, 0], E: [1, 0], N: [0, -1], S: [0, 1] }[fe.side];
      arrow((x0 + x1) / 2 + d[0] * 6, (y0 + y1) / 2 + d[1] * 6, d[0], d[1], '#7dff9a');
    }
  }

  // ---- content icons
  function icon(kind, x, y, extra) {
    ctx.save(); ctx.translate(x, y); ctx.lineWidth = 1.2; ctx.strokeStyle = '#0d0b12';
    const circ = (r, f) => { ctx.beginPath(); ctx.arc(0, 0, r, 0, Math.PI * 2); ctx.fillStyle = f; ctx.fill(); ctx.stroke(); };
    const star = (n, r1, r2, f) => { ctx.beginPath(); for (let i = 0; i < n * 2; i++) { const a = -Math.PI / 2 + i * Math.PI / n, rr = i % 2 ? r2 : r1; ctx.lineTo(Math.cos(a) * rr, Math.sin(a) * rr); } ctx.closePath(); ctx.fillStyle = f; ctx.fill(); ctx.stroke(); };
    const poly = (pts, f) => { ctx.beginPath(); pts.forEach(([a, b], i) => (i ? ctx.lineTo(a, b) : ctx.moveTo(a, b))); ctx.closePath(); ctx.fillStyle = f; ctx.fill(); ctx.stroke(); };
    const letter = (t, c, sz) => { ctx.fillStyle = c || '#0d0b12'; ctx.font = 'bold ' + (sz || 8) + 'px sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText(t, 0, 0.5); };
    switch (kind) {
      case 'sconce': poly([[0, -7], [5, 1], [3, 6], [-3, 6], [-5, 1]], '#ffb347'); break;
      case 'lanternway': poly([[0, -7], [6, 0], [0, 7], [-6, 0]], '#5ff0ff'); letter('L', '#003', 7); break;
      case 'shrine': star(4, 8, 3, '#4fa3ff'); ctx.fillStyle = '#fff'; letter(extra, '#fff', 7); break;
      case 'arena': circ(7, '#ff4d6d'); letter('!', '#fff', 10); break;
      case 'spark': star(5, 8, 3.5, '#ffe14d'); break;
      case 'heartwax': ctx.beginPath(); ctx.moveTo(0, 6); ctx.bezierCurveTo(-9, -1, -4, -8, 0, -3); ctx.bezierCurveTo(4, -8, 9, -1, 0, 6); ctx.fillStyle = '#ff7eb6'; ctx.fill(); ctx.stroke(); break;
      case 'urn': poly([[-4, -6], [4, -6], [6, 2], [3, 6], [-3, 6], [-6, 2]], '#c08bff'); break;
      case 'kiln_glass': poly([[0, -7], [6, -3], [6, 3], [0, 7], [-6, 3], [-6, -3]], '#bfe9ff'); break;
      case 'notch': poly([[0, -7], [7, 6], [-7, 6]], '#ffffff'); break;
      case 'sigil': poly([[0, -7], [7, 0], [0, 7], [-7, 0]], '#7dff9a'); ctx.beginPath(); ctx.arc(0, 0, 2, 0, 7); ctx.fillStyle = '#0d0b12'; ctx.fill(); break;
      case 'lore': ctx.fillStyle = '#b9b2a3'; ctx.fillRect(-4, -6, 8, 12); ctx.strokeRect(-4, -6, 8, 12); ctx.fillStyle = '#5c564b'; ctx.fillRect(-2, -3, 4, 1); ctx.fillRect(-2, 0, 4, 1); ctx.fillRect(-2, 3, 4, 1); break;
      case 'geode': poly([[-5, 5], [-6, -1], [-2, -6], [3, -5], [6, 0], [4, 5]], '#a8744a'); break;
      case 'npc': circ(3, '#f4ecd8'); ctx.translate(0, 0); ctx.beginPath(); ctx.moveTo(-5, 8); ctx.lineTo(0, 2); ctx.lineTo(5, 8); ctx.closePath(); ctx.fillStyle = '#f4ecd8'; ctx.fill(); ctx.stroke(); ctx.translate(0, -1); break;
      case 'lever': ctx.strokeStyle = '#ffd75e'; ctx.lineWidth = 2.5; ctx.beginPath(); ctx.moveTo(-4, 6); ctx.lineTo(4, -6); ctx.stroke(); circ(2.5, '#ffd75e'); break;
      case 'gate': ctx.fillStyle = '#9aa0aa'; for (let i = -6; i <= 6; i += 4) ctx.fillRect(i - 1, -7, 2, 14); ctx.fillRect(-7, -7, 14, 2); break;
      case 'sealdoor': ctx.fillStyle = '#ffd75e'; ctx.fillRect(-6, -8, 12, 16); ctx.strokeRect(-6, -8, 12, 16); letter('3', '#0d0b12', 9); break;
      case 'start': poly([[-5, -6], [7, 0], [-5, 6]], '#7dff9a'); break;
      default: circ(3, '#888');
    }
    ctx.restore();
  }
  const reqLetters = (r, sid) => {
    const sets = r.spots.filter((s) => s.id === sid).map((s) => s.requires.filter((t) => ABBR[t]).map((t) => ABBR[t]).sort().join(''));
    if (!sets.length || sets.some((s) => s === '')) return '';
    return [...new Set(sets)].sort((a, b) => a.length - b.length).slice(0, 2).join('/');
  };
  const milestoneAt = {};
  MILESTONES.forEach((m, i) => { for (const r of rooms) if (r.contents.some((c) => c === m || c.startsWith(m + '?'))) (milestoneAt[r.id] = milestoneAt[r.id] || []).push(i + 1); });

  for (const r of rooms) {
    const x = X(r.gx), y = Y(r.gy), w = r.w * S, h = r.h * S;
    ctx.save();
    ctx.beginPath(); ctx.rect(x + 2, y + 2, w - 4, h - 4); ctx.clip();
    // id + name
    ctx.fillStyle = '#f4ecd8'; ctx.font = 'bold 11px sans-serif'; ctx.textAlign = 'left'; ctx.textBaseline = 'top';
    ctx.fillText(r.id, x + 4, y + 4);
    ctx.fillStyle = 'rgba(244,236,216,0.62)'; ctx.font = '9px sans-serif';
    ctx.fillText(r.name || '', x + 4, y + 17);
    // arena boss label
    const arena = r.contents.find((c) => c.startsWith('arena:'));
    if (arena) {
      ctx.fillStyle = '#ff8098'; ctx.font = 'bold 12px Georgia, serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.fillText(arena.slice(6).toUpperCase(), x + w / 2, y + h / 2 - 2);
    }
    // gate badges (top-right)
    const gates = roomGates(r);
    let bx = x + w - 4;
    ctx.font = 'bold 8px sans-serif'; ctx.textBaseline = 'middle';
    for (const set of gates.slice(0, 3)) {
      const txt = set.map(tokAbbr).join('+');
      const tw = ctx.measureText(txt).width + 6;
      bx -= tw;
      ctx.fillStyle = tokCol(set[0]); ctx.fillRect(bx, y + 4, tw, 11);
      ctx.fillStyle = '#0d0b12'; ctx.textAlign = 'left'; ctx.fillText(txt, bx + 3, y + 10);
      bx -= 3;
    }
    // icons: flow along the bottom
    const icons = [];
    for (const c of r.contents) {
      let m;
      if (c === 'start') icons.push(['start']);
      else if ((m = /^sconce:/.exec(c))) icons.push(['sconce']);
      else if (/^lanternway:/.test(c)) icons.push(['lanternway']);
      else if ((m = /^shrine:(\w+)/.exec(c))) icons.push(['shrine', { bolt: 'B', dash: 'D', grip: 'G', oilcloak: 'O', plunge: 'P', wings: 'W' }[m[1]], 'shrine:' + m[1]]);
      else if (/^arena:/.test(c)) icons.push(['arena']);
      else if ((m = /^pickup:(spark|heartwax|urn|kiln_glass|notch|sigil)[^#]*#(\w+)/.exec(c))) icons.push([m[1], null, 'pickup:' + m[2]]);
      else if ((m = /^lore:(\w+)/.exec(c))) icons.push(['lore', null, 'lore:' + m[1]]);
      else if ((m = /^geode:(\w+)/.exec(c))) icons.push(['geode', null, 'geode:' + m[1]]);
      else if ((m = /^npc:(\w+)/.exec(c))) icons.push(['npc', null, null, m[1]]);
      else if (/^lever:/.test(c)) icons.push(['lever']);
      else if (/^gate:/.test(c)) icons.push(['gate']);
      else if (c === 'sealdoor') icons.push(['sealdoor']);
    }
    let ix = x + 10, iy = y + h - 12;
    for (const [k, extra, sid, label] of icons) {
      if (ix > x + w - 10) { ix = x + 10; iy -= 20; }
      icon(k, ix, iy, extra);
      const rl = sid ? reqLetters(r, sid) : '';
      if (rl) { ctx.fillStyle = '#ffe9a8'; ctx.font = 'bold 8px sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'bottom'; ctx.fillText(rl, ix, iy - 8); }
      if (label) { ctx.fillStyle = '#f4ecd8'; ctx.font = '8px sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'bottom'; ctx.fillText(label, ix, iy - 8); }
      ix += label ? 28 : 17;
    }
    ctx.restore();
    // critical-path milestones
    const ms = milestoneAt[r.id];
    if (ms) {
      let mx = x + w - 13;
      for (const n of ms) {
        ctx.beginPath(); ctx.arc(mx, y + h - 13, 9, 0, Math.PI * 2);
        ctx.fillStyle = '#fff1c4'; ctx.fill(); ctx.lineWidth = 2; ctx.strokeStyle = '#b8513c'; ctx.stroke();
        ctx.fillStyle = '#3a1a10'; ctx.font = 'bold 10px sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
        ctx.fillText(String(n), mx, y + h - 12.5);
        mx -= 20;
      }
    }
  }

  // ---- legend
  const ly = Y(H) + 40;
  ctx.fillStyle = 'rgba(255,255,255,0.04)'; ctx.fillRect(M, ly - 26, cv.width - 2 * M, LEG - 30);
  ctx.textAlign = 'left'; ctx.textBaseline = 'middle';
  ctx.fillStyle = '#efe6d2'; ctx.font = 'bold 16px Georgia, serif'; ctx.fillText('Legend', M + 14, ly - 6);
  const entries = [['start', 'start'], ['sconce', 'sconce (bench)'], ['lanternway', 'Lanternway post'], ['shrine', 'ability shrine', 'D'], ['arena', 'boss arena (red frame)'],
    ['spark', "Chandler's Spark"], ['heartwax', 'Heartwax Shard'], ['urn', 'Ember Urn'], ['kiln_glass', 'Kiln Glass'], ['notch', 'Wax Notch'], ['sigil', 'sigil'],
    ['lore', 'lore tablet'], ['geode', 'cinder geode'], ['npc', 'NPC'], ['lever', 'lever'], ['gate', 'gate'], ['sealdoor', 'Seal Door']];
  let lx = M + 20, lyy = ly + 22;
  ctx.font = '12px sans-serif';
  for (const [k, label, extra] of entries) {
    icon(k, lx, lyy, extra);
    ctx.fillStyle = '#d9cfba'; ctx.font = '12px sans-serif'; ctx.textAlign = 'left'; ctx.textBaseline = 'middle';
    ctx.fillText(label, lx + 13, lyy);
    lx += 170; if (lx > cv.width - M - 170) { lx = M + 20; lyy += 26; }
  }
  lyy += 30; lx = M + 20;
  const badges = [['dash', 'D = Flare Dash'], ['grip', 'G = Wax Grip'], ['wings', 'W = Smokewing'], ['oilcloak', 'O = Oilcloak'], ['plunge', 'P = Molten Plunge'], ['boss:x', 'Boss = boss defeated'], ['lever:x', 'Lever = lever struck'], ['seals>=3', 'Seals = all 3 Warden seals']];
  ctx.font = 'bold 10px sans-serif';
  for (const [t, label] of badges) {
    const tw = ctx.measureText(tokAbbr(t)).width + 8;
    ctx.fillStyle = tokCol(t); ctx.fillRect(lx, lyy - 7, tw, 14);
    ctx.fillStyle = '#0d0b12'; ctx.fillText(tokAbbr(t), lx + 4, lyy);
    ctx.fillStyle = '#d9cfba'; ctx.font = '12px sans-serif'; ctx.fillText(label.split(' = ')[1], lx + tw + 6, lyy); ctx.font = 'bold 10px sans-serif';
    lx += 190;
  }
  lyy += 28; lx = M + 20;
  ctx.font = '12px sans-serif'; ctx.fillStyle = '#d9cfba';
  ctx.fillText('Badges (top-right of a room) = requirements of the traversals inside that room (alternatives listed separately). Letters above an icon = abilities needed to reach it. White ticks = doorways (thick = between regions); green arrows = one-way passages (drops, up-only climbs).', lx, lyy);
  lyy += 22;
  // milestones legend
  const MSNAME = { 'shrine:bolt': 'Ember Bolt', 'arena:effigy': 'Effigy', 'arena:sable1': 'Sable I', 'shrine:dash': 'Flare Dash', 'arena:matron': 'Soot Matron', 'shrine:grip': 'Wax Grip', 'shrine:oilcloak': 'Oilcloak',
    'arena:tallowmere': 'Tallowmere', 'shrine:plunge': 'Molten Plunge', 'arena:kilnmother': 'Kiln Mother', 'shrine:wings': 'Smokewing', 'arena:vespertine': 'Vespertine', 'arena:sable2': 'Sable II', 'sealdoor': 'Seal Door', 'arena:lucerne': 'Lucerne' };
  ctx.fillText('Critical path: ' + MILESTONES.map((m, i) => (i + 1) + ' ' + MSNAME[m]).join('  ·  '), lx, lyy);
  window.__done = true;
}

(async () => {
  const browser = await getBrowser();
  const context = await browser.newContext({ viewport: { width: 1600, height: 1000 } });
  const page = await context.newPage();
  const errs = [];
  page.on('pageerror', (e) => errs.push(e.message));
  page.on('console', (m) => { if (m.type() === 'error') errs.push(m.text()); });
  await page.setContent(pageHtml());
  await page.waitForFunction('window.__done === true', null, { timeout: 15000 });
  const dataUrl = await page.evaluate((crop) => {
    const c = document.getElementById('c');
    if (!crop) return c.toDataURL('image/png');
    const o = document.createElement('canvas'); o.width = crop[2]; o.height = crop[3];
    o.getContext('2d').drawImage(c, crop[0], crop[1], crop[2], crop[3], 0, 0, crop[2], crop[3]);
    return o.toDataURL('image/png');
  }, CROP);
  fs.mkdirSync(path.dirname(outFile), { recursive: true });
  fs.writeFileSync(outFile, Buffer.from(dataUrl.split(',')[1], 'base64'));
  const size = await page.evaluate(() => [document.getElementById('c').width, document.getElementById('c').height]);
  await closeAll();
  if (errs.length) { console.error('page errors:\n' + errs.join('\n')); process.exit(1); }
  console.log(`wrote ${path.relative(ROOT, outFile)} (${size[0]}x${size[1]})`);
})().catch(async (e) => { console.error(e); await closeAll(); process.exit(1); });
