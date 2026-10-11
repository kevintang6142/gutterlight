// src/ui/inventory.js — the Inventory screen (owned abilities, stats, Brand, held relics, owned Sigils with a
// notch meter; equipping only when opened at a Sconce; nothing unfound is ever shown or counted) and the shared procedural icon set G.UI.icons
// (ability / sigil / item icons, also used by cards and shops).
(function () {
  'use strict';
  const G = globalThis.G;
  const UI = G.UI;
  const C = UI.C;
  const W = UI.W, H = UI.H;
  const TAU = Math.PI * 2;

  const ABILITIES = ['bolt', 'dash', 'grip', 'oilcloak', 'plunge', 'wings'];
  const SIGIL_ORDER = ['swift_brand', 'long_brand', 'heartwax', 'kindle_haste', 'ember_thirst', 'cinder_lure', 'smolder_shell',
    'flare_trail', 'bright_bolt', 'thorned_wax', 'steadfast', 'waymoth', 'last_light', 'deep_kindle'];
  const SIGIL_COLOR = {
    swift_brand: '#ffd27a', long_brand: '#e9e0c6', heartwax: '#f0a090', kindle_haste: '#ffb86a', ember_thirst: '#8fd3ff',
    cinder_lure: '#ff9a4a', smolder_shell: '#d9a070', flare_trail: '#6fc0ff', bright_bolt: '#f4fbff', thorned_wax: '#c9d08a',
    steadfast: '#cfc6b0', waymoth: '#c8b4ff', last_light: '#ff7a5a', deep_kindle: '#7fa8ff',
  };
  const sigilIds = () => {
    const keys = G.Items && G.Items.sigils ? Object.keys(G.Items.sigils) : [];
    return keys.length ? keys : SIGIL_ORDER;
  };
  const abilityIds = () => (G.Items && G.Items.order && G.Items.order.abilities) || ABILITIES;
  UI.sigilIds = sigilIds;

  // ================================================================== icons
  const icons = {};
  UI.icons = icons;

  function lw(ctx, w) { ctx.lineWidth = w; ctx.lineCap = 'round'; ctx.lineJoin = 'round'; }
  function heartPath(ctx, x, y, r) {
    ctx.beginPath();
    ctx.moveTo(x, y + r * 0.9);
    ctx.bezierCurveTo(x - r * 1.25, y + r * 0.05, x - r * 0.95, y - r * 0.95, x, y - r * 0.38);
    ctx.bezierCurveTo(x + r * 0.95, y - r * 0.95, x + r * 1.25, y + r * 0.05, x, y + r * 0.9);
    ctx.closePath();
  }
  function star(ctx, x, y, r1, r2, n, rot) {
    ctx.beginPath();
    for (let i = 0; i < n * 2; i++) {
      const r = i % 2 ? r2 : r1, a = rot + (i / (n * 2)) * TAU;
      if (i) ctx.lineTo(x + Math.cos(a) * r, y + Math.sin(a) * r); else ctx.moveTo(x + Math.cos(a) * r, y + Math.sin(a) * r);
    }
    ctx.closePath();
  }
  function disc(ctx, x, y, r, rim, glow, dim) {
    const g = ctx.createRadialGradient(x - r * 0.3, y - r * 0.35, r * 0.1, x, y, r);
    g.addColorStop(0, dim ? '#191a1e' : '#1d2230'); g.addColorStop(1, dim ? '#0b0b0d' : '#090b11');
    ctx.fillStyle = g;
    ctx.beginPath(); ctx.arc(x, y, r, 0, TAU); ctx.fill();
    if (glow && !dim) UI.glow(ctx, x, y, r * 1.6, glow, 0.22);
    ctx.strokeStyle = rim;
    ctx.lineWidth = Math.max(1, r * 0.07);
    ctx.beginPath(); ctx.arc(x, y, r - ctx.lineWidth / 2, 0, TAU); ctx.stroke();
    ctx.strokeStyle = 'rgba(0,0,0,0.6)';
    ctx.lineWidth = 1;
    ctx.beginPath(); ctx.arc(x, y, r * 0.86, 0, TAU); ctx.stroke();
  }

  /** Ability icon (disc + glyph). opts: {dim, t, noDisc} */
  icons.ability = function (ctx, id, x, y, size, opts) {
    const o = opts || {};
    const r = size / 2, t = o.t === undefined ? UI.t : o.t, dim = !!o.dim;
    const pa = ctx.globalAlpha;
    if (!o.noDisc) disc(ctx, x, y, r, dim ? 'rgba(160,150,130,0.35)' : '#d8ceb3', '#3f8cff', dim);
    ctx.globalAlpha = pa * (dim ? 0.32 : 1);
    const s = r * 0.62;
    const col = dim ? '#8d8a84' : '#bfe8ff', core = dim ? '#b0aca4' : '#ffffff';
    ctx.strokeStyle = col; ctx.fillStyle = col;
    lw(ctx, Math.max(1.4, r * 0.09));
    switch (id) {
      case 'bolt': {
        ctx.save(); ctx.translate(x + s * 0.25, y); ctx.rotate(-Math.PI / 2 - 0.25);
        ctx.fillStyle = dim ? col : '#3f8cff'; UI.teardrop(ctx, 0, s * 0.35, s * 0.5, s * 1.55, 0); ctx.fill();
        ctx.fillStyle = col; UI.teardrop(ctx, 0, s * 0.3, s * 0.34, s * 1.05, 0); ctx.fill();
        ctx.fillStyle = core; ctx.beginPath(); ctx.arc(0, -s * 0.05, s * 0.2, 0, TAU); ctx.fill();
        ctx.restore();
        break;
      }
      case 'dash': {
        for (let i = 0; i < 3; i++) { ctx.beginPath(); ctx.moveTo(x - s * 1.05, y - s * 0.45 + i * s * 0.45); ctx.lineTo(x - s * (0.35 - i * 0.12), y - s * 0.45 + i * s * 0.45); ctx.stroke(); }
        ctx.save(); ctx.translate(x + s * 0.2, y); ctx.rotate(Math.PI / 2);
        ctx.fillStyle = dim ? col : '#3f8cff'; UI.teardrop(ctx, 0, s * 0.45, s * 0.42, s * 1.3, 0); ctx.fill();
        ctx.fillStyle = core; UI.teardrop(ctx, 0, s * 0.35, s * 0.24, s * 0.75, 0); ctx.fill();
        ctx.restore();
        break;
      }
      case 'grip': {
        ctx.fillStyle = dim ? '#55524c' : '#6d6a64';
        ctx.fillRect(x - s * 1.05, y - s * 1.0, s * 0.45, s * 2.0);
        ctx.strokeStyle = 'rgba(0,0,0,0.5)'; lw(ctx, 1);
        for (let i = 0; i < 4; i++) { ctx.beginPath(); ctx.moveTo(x - s * 1.05, y - s + i * s * 0.55); ctx.lineTo(x - s * 0.6, y - s + i * s * 0.55); ctx.stroke(); }
        ctx.strokeStyle = col; lw(ctx, Math.max(1.4, r * 0.1));
        for (let i = 0; i < 3; i++) {
          const fy = y - s * 0.45 + i * s * 0.42;
          ctx.beginPath(); ctx.moveTo(x + s * 0.55, fy + s * 0.2); ctx.quadraticCurveTo(x - s * 0.05, fy - s * 0.15, x - s * 0.52, fy + s * 0.05); ctx.stroke();
        }
        ctx.fillStyle = col;
        ctx.beginPath(); ctx.ellipse(x + s * 0.65, y + s * 0.05, s * 0.32, s * 0.55, 0, 0, TAU); ctx.fill();
        break;
      }
      case 'oilcloak': {
        ctx.beginPath();
        ctx.moveTo(x, y - s * 1.0);
        ctx.quadraticCurveTo(x + s * 0.55, y - s * 0.95, x + s * 0.6, y - s * 0.3);
        ctx.lineTo(x + s * 0.95, y + s * 0.85); ctx.lineTo(x + s * 0.4, y + s * 0.65); ctx.lineTo(x, y + s * 0.9);
        ctx.lineTo(x - s * 0.4, y + s * 0.65); ctx.lineTo(x - s * 0.95, y + s * 0.85); ctx.lineTo(x - s * 0.6, y - s * 0.3);
        ctx.quadraticCurveTo(x - s * 0.55, y - s * 0.95, x, y - s * 1.0);
        ctx.closePath();
        ctx.globalAlpha *= 0.85; ctx.fill(); ctx.globalAlpha /= 0.85;
        ctx.fillStyle = '#0b0e16';
        ctx.beginPath(); ctx.ellipse(x, y - s * 0.35, s * 0.3, s * 0.36, 0, 0, TAU); ctx.fill();
        ctx.fillStyle = dim ? col : '#4fb0ff';
        UI.teardrop(ctx, x + s * 0.95, y + s * 0.15, s * 0.16, s * 0.5, 0); ctx.fill();
        break;
      }
      case 'plunge': {
        ctx.save(); ctx.translate(x, y - s * 0.1); ctx.rotate(Math.PI);
        ctx.fillStyle = dim ? col : '#3f8cff'; UI.teardrop(ctx, 0, -s * 0.35, s * 0.5, s * 1.3, 0); ctx.fill();
        ctx.fillStyle = core; UI.teardrop(ctx, 0, -s * 0.4, s * 0.28, s * 0.7, 0); ctx.fill();
        ctx.restore();
        ctx.strokeStyle = col;
        ctx.beginPath(); ctx.moveTo(x - s * 1.0, y + s * 0.95); ctx.lineTo(x + s * 1.0, y + s * 0.95); ctx.stroke();
        for (const d of [-1, 1]) { ctx.beginPath(); ctx.moveTo(x + d * s * 0.6, y + s * 0.75); ctx.lineTo(x + d * s * 1.0, y + s * 0.35); ctx.stroke(); }
        break;
      }
      case 'wings': {
        for (const d of [-1, 1]) {
          ctx.beginPath();
          ctx.moveTo(x + d * s * 0.12, y + s * 0.3);
          ctx.bezierCurveTo(x + d * s * 0.4, y - s * 1.1, x + d * s * 1.2, y - s * 0.95, x + d * s * 1.05, y - s * 0.2);
          ctx.bezierCurveTo(x + d * s * 0.95, y + s * 0.1, x + d * s * 0.7, y + s * 0.05, x + d * s * 0.62, y + s * 0.3);
          ctx.bezierCurveTo(x + d * s * 0.5, y + s * 0.6, x + d * s * 0.3, y + s * 0.55, x + d * s * 0.12, y + s * 0.3);
          ctx.closePath();
          ctx.globalAlpha *= 0.8; ctx.fill(); ctx.globalAlpha /= 0.8;
          ctx.strokeStyle = 'rgba(10,12,18,0.7)'; lw(ctx, 1);
          ctx.beginPath(); ctx.moveTo(x + d * s * 0.2, y + s * 0.2); ctx.quadraticCurveTo(x + d * s * 0.6, y - s * 0.5, x + d * s * 0.95, y - s * 0.3); ctx.stroke();
        }
        ctx.fillStyle = core;
        ctx.beginPath(); ctx.ellipse(x, y + s * 0.2, s * 0.13, s * 0.42, 0, 0, TAU); ctx.fill();
        break;
      }
      default:
        ctx.beginPath(); ctx.arc(x, y, s * 0.5, 0, TAU); ctx.fill();
    }
    ctx.globalAlpha = pa;
  };

  /** Sigil medallion with its glyph. opts: {dim, t, equipped, empty} */
  icons.sigil = function (ctx, id, x, y, size, opts) {
    const o = opts || {};
    const r = size / 2, t = o.t === undefined ? UI.t : o.t;
    const pa = ctx.globalAlpha;
    if (o.empty) {
      ctx.strokeStyle = 'rgba(236,228,207,0.18)';
      ctx.lineWidth = 1.2;
      ctx.setLineDash([3, 4]);
      ctx.beginPath(); ctx.arc(x, y, r * 0.8, 0, TAU); ctx.stroke();
      ctx.setLineDash([]);
      return;
    }
    const col = SIGIL_COLOR[id] || C.cream;
    if (o.equipped) UI.glow(ctx, x, y, r * 2, col, 0.35 + 0.08 * Math.sin(t * 3));
    // wax medallion: rim with drips
    ctx.fillStyle = o.dim ? '#4a463e' : '#d6caa9';
    ctx.beginPath(); ctx.arc(x, y, r, 0, TAU); ctx.fill();
    ctx.beginPath(); ctx.ellipse(x + r * 0.55, y + r * 0.85, r * 0.12, r * 0.22, -0.4, 0, TAU); ctx.fill();
    const g = ctx.createRadialGradient(x - r * 0.25, y - r * 0.3, r * 0.1, x, y, r * 0.8);
    g.addColorStop(0, '#232633'); g.addColorStop(1, '#0c0d12');
    ctx.fillStyle = g;
    ctx.beginPath(); ctx.arc(x, y, r * 0.8, 0, TAU); ctx.fill();
    ctx.strokeStyle = 'rgba(0,0,0,0.55)';
    ctx.lineWidth = 1;
    ctx.beginPath(); ctx.arc(x, y, r * 0.8, 0, TAU); ctx.stroke();
    ctx.globalAlpha = pa * (o.dim ? 0.4 : 1);
    sigilGlyph(ctx, id, x, y, r * 0.52, col, t);
    ctx.globalAlpha = pa;
    if (o.equipped) {
      ctx.strokeStyle = '#bfe6ff';
      ctx.lineWidth = 1.6;
      ctx.beginPath(); ctx.arc(x, y, r + 3.5, 0, TAU); ctx.stroke();
    }
  };

  function sigilGlyph(ctx, id, x, y, s, col, t) {
    ctx.strokeStyle = col; ctx.fillStyle = col;
    lw(ctx, Math.max(1.3, s * 0.13));
    switch (id) {
      case 'swift_brand': {
        ctx.fillRect(x - s * 0.18, y - s * 0.1, s * 0.36, s * 0.95);
        UI.flame(ctx, x, y - s * 0.12, s * 0.75, 'gold', t, 1, { glow: 0.4 });
        ctx.strokeStyle = col;
        for (let i = 0; i < 3; i++) { ctx.beginPath(); ctx.moveTo(x - s * 1.0, y - s * 0.35 + i * s * 0.35); ctx.lineTo(x - s * 0.45, y - s * 0.35 + i * s * 0.35); ctx.stroke(); }
        break;
      }
      case 'long_brand': {
        lw(ctx, Math.max(1.6, s * 0.16));
        ctx.beginPath(); ctx.moveTo(x - s * 0.85, y + s * 0.85); ctx.lineTo(x + s * 0.7, y - s * 0.7); ctx.stroke();
        ctx.beginPath(); ctx.moveTo(x - s * 0.62, y + s * 0.3); ctx.lineTo(x - s * 0.3, y + s * 0.62); ctx.stroke();
        UI.glow(ctx, x + s * 0.75, y - s * 0.75, s * 0.9, '#ff9a4a', 0.6);
        ctx.fillStyle = '#ffd38a'; ctx.beginPath(); ctx.arc(x + s * 0.75, y - s * 0.75, s * 0.16, 0, TAU); ctx.fill();
        break;
      }
      case 'heartwax': {
        heartPath(ctx, x, y + s * 0.1, s * 0.85); ctx.fill();
        ctx.fillStyle = 'rgba(255,255,255,0.4)'; ctx.beginPath(); ctx.ellipse(x - s * 0.35, y - s * 0.15, s * 0.14, s * 0.22, -0.5, 0, TAU); ctx.fill();
        break;
      }
      case 'kindle_haste': {
        ctx.beginPath();
        ctx.moveTo(x - s * 0.6, y - s * 0.9); ctx.lineTo(x + s * 0.6, y - s * 0.9); ctx.lineTo(x + s * 0.08, y);
        ctx.lineTo(x + s * 0.6, y + s * 0.9); ctx.lineTo(x - s * 0.6, y + s * 0.9); ctx.lineTo(x - s * 0.08, y); ctx.closePath();
        ctx.stroke();
        UI.flame(ctx, x, y - s * 0.32, s * 0.55, 'orange', t, 2, { glow: 0.4 });
        ctx.beginPath(); ctx.moveTo(x - s * 0.35, y + s * 0.85); ctx.lineTo(x, y + s * 0.45); ctx.lineTo(x + s * 0.35, y + s * 0.85); ctx.closePath(); ctx.fill();
        break;
      }
      case 'ember_thirst': {
        ctx.beginPath();
        ctx.moveTo(x - s * 0.8, y - s * 0.3); ctx.quadraticCurveTo(x - s * 0.75, y + s * 0.45, x, y + s * 0.45);
        ctx.quadraticCurveTo(x + s * 0.75, y + s * 0.45, x + s * 0.8, y - s * 0.3); ctx.stroke();
        ctx.beginPath(); ctx.moveTo(x, y + s * 0.45); ctx.lineTo(x, y + s * 0.85); ctx.moveTo(x - s * 0.4, y + s * 0.88); ctx.lineTo(x + s * 0.4, y + s * 0.88); ctx.stroke();
        UI.flame(ctx, x, y + s * 0.15, s * 0.95, 'blue', t, 3, { glow: 0.5 });
        break;
      }
      case 'cinder_lure': {
        UI.drawCinderIcon ? UI.drawCinderIcon(ctx, x, y, s * 0.4, t) : null;
        ctx.strokeStyle = col;
        for (let i = 1; i <= 2; i++) { ctx.beginPath(); ctx.arc(x, y, s * (0.45 + i * 0.25), -0.9, 0.9); ctx.stroke(); ctx.beginPath(); ctx.arc(x, y, s * (0.45 + i * 0.25), Math.PI - 0.9, Math.PI + 0.9); ctx.stroke(); }
        break;
      }
      case 'smolder_shell': {
        ctx.beginPath();
        ctx.moveTo(x, y - s * 0.95); ctx.lineTo(x + s * 0.8, y - s * 0.6); ctx.quadraticCurveTo(x + s * 0.75, y + s * 0.5, x, y + s * 0.95);
        ctx.quadraticCurveTo(x - s * 0.75, y + s * 0.5, x - s * 0.8, y - s * 0.6); ctx.closePath();
        ctx.globalAlpha *= 0.85; ctx.fill(); ctx.globalAlpha /= 0.85;
        ctx.fillStyle = '#ff8a3c';
        for (const [dx, dy] of [[-0.25, -0.2], [0.25, 0.05], [-0.05, 0.4]]) { ctx.beginPath(); ctx.arc(x + dx * s, y + dy * s, s * 0.1, 0, TAU); ctx.fill(); }
        break;
      }
      case 'flare_trail': {
        ctx.save(); ctx.translate(x + s * 0.35, y); ctx.rotate(Math.PI / 2);
        ctx.fillStyle = '#3f8cff'; UI.teardrop(ctx, 0, s * 0.35, s * 0.36, s * 1.1, 0); ctx.fill();
        ctx.fillStyle = '#e8f8ff'; UI.teardrop(ctx, 0, s * 0.28, s * 0.2, s * 0.6, 0); ctx.fill();
        ctx.restore();
        for (let i = 0; i < 3; i++) UI.flame(ctx, x - s * (0.25 + i * 0.32), y + s * 0.3, s * (0.55 - i * 0.12), 'blue', t, 4 + i, { glow: 0.2 });
        break;
      }
      case 'bright_bolt': {
        star(ctx, x, y, s * 0.95, s * 0.3, 8, t * 0.3); ctx.fill();
        UI.glow(ctx, x, y, s * 1.2, '#cfe8ff', 0.6);
        ctx.fillStyle = '#ffffff'; ctx.beginPath(); ctx.arc(x, y, s * 0.25, 0, TAU); ctx.fill();
        break;
      }
      case 'thorned_wax': {
        star(ctx, x, y, s * 0.95, s * 0.55, 9, 0.2); ctx.fill();
        ctx.fillStyle = '#121318'; ctx.beginPath(); ctx.arc(x, y, s * 0.4, 0, TAU); ctx.fill();
        ctx.fillStyle = col; ctx.beginPath(); ctx.arc(x, y, s * 0.18, 0, TAU); ctx.fill();
        break;
      }
      case 'steadfast': {
        ctx.fillRect(x - s * 0.14, y - s * 0.8, s * 0.28, s * 1.4);
        ctx.beginPath(); ctx.moveTo(x - s * 0.8, y + s * 0.85); ctx.lineTo(x + s * 0.8, y + s * 0.85); ctx.lineTo(x + s * 0.35, y + s * 0.5); ctx.lineTo(x - s * 0.35, y + s * 0.5); ctx.closePath(); ctx.fill();
        ctx.beginPath(); ctx.moveTo(x - s * 0.5, y - s * 0.55); ctx.lineTo(x + s * 0.5, y - s * 0.55); ctx.stroke();
        break;
      }
      case 'waymoth': drawMoth(ctx, x, y, s, col, t); break;
      case 'last_light': {
        ctx.fillRect(x - s * 0.22, y + s * 0.4, s * 0.44, s * 0.5);
        UI.flame(ctx, x, y + s * 0.38, s * 1.25, 'red', t, 5, { glow: 0.6 });
        break;
      }
      case 'deep_kindle': {
        ctx.beginPath();
        for (let i = 0; i <= 40; i++) { const a = i / 40 * TAU * 2.2, rr = s * (0.1 + 0.85 * i / 40); const px = x + Math.cos(a + t * 0.6) * rr, py = y + Math.sin(a + t * 0.6) * rr; if (i) ctx.lineTo(px, py); else ctx.moveTo(px, py); }
        ctx.stroke();
        UI.flame(ctx, x, y + s * 0.2, s * 0.6, 'blue', t, 6, { glow: 0.5 });
        break;
      }
      default:
        ctx.beginPath(); ctx.arc(x, y, s * 0.5, 0, TAU); ctx.fill();
    }
  }
  function drawMoth(ctx, x, y, s, col, t) {
    const flap = 0.85 + 0.15 * Math.sin(t * 6);
    ctx.fillStyle = col;
    for (const d of [-1, 1]) {
      ctx.beginPath();
      ctx.moveTo(x, y - s * 0.1);
      ctx.bezierCurveTo(x + d * s * 0.6 * flap, y - s * 1.0, x + d * s * 1.15 * flap, y - s * 0.55, x + d * s * 0.95 * flap, y + s * 0.05);
      ctx.quadraticCurveTo(x + d * s * 0.45, y + s * 0.1, x, y);
      ctx.fill();
      ctx.beginPath();
      ctx.moveTo(x, y + s * 0.05);
      ctx.quadraticCurveTo(x + d * s * 0.85 * flap, y + s * 0.15, x + d * s * 0.6 * flap, y + s * 0.75);
      ctx.quadraticCurveTo(x + d * s * 0.2, y + s * 0.6, x, y + s * 0.2);
      ctx.fill();
      ctx.fillStyle = '#121318';
      ctx.beginPath(); ctx.arc(x + d * s * 0.62 * flap, y - s * 0.42, s * 0.14, 0, TAU); ctx.fill();
      ctx.fillStyle = col;
    }
    ctx.fillStyle = '#2a2633';
    ctx.beginPath(); ctx.ellipse(x, y + s * 0.1, s * 0.12, s * 0.5, 0, 0, TAU); ctx.fill();
    ctx.strokeStyle = col; lw(ctx, 1);
    for (const d of [-1, 1]) { ctx.beginPath(); ctx.moveTo(x, y - s * 0.35); ctx.quadraticCurveTo(x + d * s * 0.2, y - s * 0.9, x + d * s * 0.45, y - s * 0.95); ctx.stroke(); }
  }
  icons.moth = drawMoth;

  /** Item icon. kind: heartwax urn kiln_glass notch spark seal_bell seal_kiln seal_wing chart brand cinders. opts: {dim, t, half} */
  icons.item = function (ctx, kind, x, y, size, opts) {
    const o = opts || {};
    const s = size / 2, t = o.t === undefined ? UI.t : o.t;
    const pa = ctx.globalAlpha;
    if (o.dim) ctx.globalAlpha = pa * 0.3;
    switch (kind) {
      case 'heartwax': {
        UI.glow(ctx, x, y, s * 1.6, '#ffb0a0', o.dim ? 0 : 0.18);
        ctx.fillStyle = '#f2e6cc';
        heartPath(ctx, x, y + s * 0.05, s * 0.8); ctx.fill();
        ctx.strokeStyle = 'rgba(80,60,40,0.7)'; lw(ctx, Math.max(1, s * 0.06));
        ctx.beginPath(); ctx.moveTo(x, y - s * 0.3); ctx.lineTo(x - s * 0.12, y + s * 0.05); ctx.lineTo(x + s * 0.1, y + s * 0.25); ctx.lineTo(x - s * 0.02, y + s * 0.7); ctx.stroke();
        if (o.half) { ctx.fillStyle = 'rgba(10,10,14,0.75)'; ctx.save(); heartPath(ctx, x, y + s * 0.05, s * 0.8); ctx.clip(); ctx.fillRect(x + 0.5, y - s, s, s * 2); ctx.restore(); }
        ctx.fillStyle = 'rgba(255,255,255,0.5)'; ctx.beginPath(); ctx.ellipse(x - s * 0.38, y - s * 0.15, s * 0.1, s * 0.18, -0.5, 0, TAU); ctx.fill();
        break;
      }
      case 'urn': {
        UI.glow(ctx, x, y - s * 0.55, s * 1.2, '#4fb0ff', o.dim ? 0 : 0.35);
        ctx.fillStyle = '#9a6a4a';
        ctx.beginPath();
        ctx.moveTo(x - s * 0.35, y - s * 0.65); ctx.lineTo(x + s * 0.35, y - s * 0.65);
        ctx.quadraticCurveTo(x + s * 0.3, y - s * 0.4, x + s * 0.6, y - s * 0.1);
        ctx.quadraticCurveTo(x + s * 0.8, y + s * 0.6, x + s * 0.3, y + s * 0.85);
        ctx.lineTo(x - s * 0.3, y + s * 0.85);
        ctx.quadraticCurveTo(x - s * 0.8, y + s * 0.6, x - s * 0.6, y - s * 0.1);
        ctx.quadraticCurveTo(x - s * 0.3, y - s * 0.4, x - s * 0.35, y - s * 0.65);
        ctx.fill();
        ctx.fillStyle = '#6e4a34'; ctx.fillRect(x - s * 0.62, y + s * 0.1, s * 1.24, s * 0.14);
        ctx.fillStyle = '#c99a72'; ctx.fillRect(x - s * 0.42, y - s * 0.75, s * 0.84, s * 0.14);
        UI.flame(ctx, x, y - s * 0.72, s * 0.55, 'blue', t, 7, { glow: 0.4 });
        break;
      }
      case 'kiln_glass': {
        UI.glow(ctx, x, y, s * 1.5, '#ffb46a', o.dim ? 0 : 0.25);
        const pts = [[0, -0.95], [0.55, -0.35], [0.4, 0.75], [-0.2, 0.9], [-0.6, 0.15], [-0.35, -0.6]];
        ctx.beginPath(); pts.forEach(([a, b], i) => (i ? ctx.lineTo(x + a * s, y + b * s) : ctx.moveTo(x + a * s, y + b * s))); ctx.closePath();
        ctx.fillStyle = 'rgba(160,220,230,0.75)'; ctx.fill();
        ctx.strokeStyle = '#ffd38a'; lw(ctx, Math.max(1, s * 0.07)); ctx.stroke();
        ctx.fillStyle = 'rgba(255,255,255,0.65)';
        ctx.beginPath(); ctx.moveTo(x, y - s * 0.95); ctx.lineTo(x + s * 0.12, y + s * 0.2); ctx.lineTo(x - s * 0.35, y - s * 0.6); ctx.closePath(); ctx.fill();
        break;
      }
      case 'notch': {
        ctx.strokeStyle = '#e8dfc6'; lw(ctx, Math.max(1.5, s * 0.14));
        ctx.beginPath(); ctx.arc(x, y + s * 0.1, s * 0.62, -Math.PI / 2 + 0.45, -Math.PI / 2 - 0.45 + TAU); ctx.stroke();
        ctx.fillStyle = '#e8dfc6';
        ctx.beginPath(); ctx.moveTo(x - s * 0.28, y - s * 0.62); ctx.lineTo(x, y - s * 0.2); ctx.lineTo(x + s * 0.28, y - s * 0.62); ctx.closePath(); ctx.fill();
        UI.flame(ctx, x, y - s * 0.62, s * 0.7, 'blue', t, 8, { glow: 0.4 });
        break;
      }
      case 'spark': {
        UI.glow(ctx, x, y, s * 2.2, '#6fb8ff', o.dim ? 0 : 0.55);
        ctx.fillStyle = '#bfe8ff';
        star(ctx, x, y, s * 0.9, s * 0.22, 4, t * 0.5); ctx.fill();
        star(ctx, x, y, s * 0.55, s * 0.18, 4, t * 0.5 + Math.PI / 4); ctx.fill();
        ctx.fillStyle = '#ffffff'; ctx.beginPath(); ctx.arc(x, y, s * 0.2, 0, TAU); ctx.fill();
        break;
      }
      case 'seal_bell': case 'seal_kiln': case 'seal_wing': case 'bell': case 'kiln': case 'wing': {
        const id = kind.replace('seal_', '');
        const metal = id === 'bell' ? ['#e4e8ee', '#9aa2ae'] : id === 'kiln' ? ['#8c8a88', '#4e4a46'] : ['#efe6f6', '#a99cb8'];
        UI.glow(ctx, x, y, s * 1.6, id === 'bell' ? '#bcd8ff' : id === 'kiln' ? '#ff9a4a' : '#d4b8ff', o.dim ? 0 : 0.25);
        const g = ctx.createRadialGradient(x - s * 0.3, y - s * 0.35, s * 0.1, x, y, s * 0.9);
        g.addColorStop(0, metal[0]); g.addColorStop(1, metal[1]);
        ctx.fillStyle = g;
        star(ctx, x, y, s * 0.92, s * 0.82, 12, 0); ctx.fill();
        ctx.strokeStyle = 'rgba(0,0,0,0.45)'; lw(ctx, 1);
        ctx.beginPath(); ctx.arc(x, y, s * 0.62, 0, TAU); ctx.stroke();
        ctx.fillStyle = 'rgba(20,20,26,0.75)';
        if (id === 'bell') {
          ctx.beginPath(); ctx.moveTo(x - s * 0.38, y + s * 0.3); ctx.quadraticCurveTo(x - s * 0.36, y - s * 0.45, x, y - s * 0.45);
          ctx.quadraticCurveTo(x + s * 0.36, y - s * 0.45, x + s * 0.38, y + s * 0.3); ctx.closePath(); ctx.fill();
          ctx.beginPath(); ctx.arc(x, y + s * 0.38, s * 0.09, 0, TAU); ctx.fill();
        } else if (id === 'kiln') {
          ctx.fillRect(x - s * 0.4, y - s * 0.05, s * 0.8, s * 0.42);
          ctx.beginPath(); ctx.moveTo(x - s * 0.4, y - s * 0.05); ctx.lineTo(x, y - s * 0.45); ctx.lineTo(x + s * 0.4, y - s * 0.05); ctx.closePath(); ctx.fill();
          ctx.fillStyle = '#ff9a4a'; ctx.beginPath(); ctx.arc(x, y + s * 0.15, s * 0.1, 0, TAU); ctx.fill();
        } else {
          for (const d of [-1, 1]) {
            ctx.beginPath(); ctx.moveTo(x, y); ctx.bezierCurveTo(x + d * s * 0.2, y - s * 0.5, x + d * s * 0.55, y - s * 0.45, x + d * s * 0.45, y + s * 0.05);
            ctx.quadraticCurveTo(x + d * s * 0.3, y + s * 0.35, x, y + s * 0.1); ctx.fill();
          }
        }
        break;
      }
      case 'chart': {
        ctx.fillStyle = '#d8c9a3';
        ctx.fillRect(x - s * 0.7, y - s * 0.55, s * 1.4, s * 1.1);
        ctx.fillStyle = '#b8a37a';
        ctx.beginPath(); ctx.ellipse(x - s * 0.7, y, s * 0.15, s * 0.58, 0, 0, TAU); ctx.fill();
        ctx.beginPath(); ctx.ellipse(x + s * 0.7, y, s * 0.15, s * 0.58, 0, 0, TAU); ctx.fill();
        ctx.strokeStyle = '#5a4a32'; lw(ctx, Math.max(1, s * 0.06));
        ctx.beginPath(); ctx.moveTo(x - s * 0.45, y + s * 0.25); ctx.lineTo(x - s * 0.15, y - s * 0.15); ctx.lineTo(x + s * 0.1, y + s * 0.1); ctx.lineTo(x + s * 0.45, y - s * 0.3); ctx.stroke();
        ctx.fillStyle = '#7a2a1a'; ctx.beginPath(); ctx.arc(x + s * 0.45, y - s * 0.3, s * 0.08, 0, TAU); ctx.fill();
        break;
      }
      case 'brand': {
        lw(ctx, Math.max(2, s * 0.16));
        ctx.strokeStyle = '#3a3a42';
        ctx.beginPath(); ctx.moveTo(x - s * 0.8, y + s * 0.8); ctx.lineTo(x + s * 0.6, y - s * 0.6); ctx.stroke();
        ctx.strokeStyle = '#8a8a96'; lw(ctx, Math.max(1, s * 0.05));
        ctx.beginPath(); ctx.moveTo(x - s * 0.78, y + s * 0.74); ctx.lineTo(x + s * 0.56, y - s * 0.6); ctx.stroke();
        UI.glow(ctx, x + s * 0.68, y - s * 0.68, s * 1.0, '#ff8a3c', 0.6);
        ctx.fillStyle = '#ffcf8a'; ctx.beginPath(); ctx.arc(x + s * 0.66, y - s * 0.66, s * 0.15, 0, TAU); ctx.fill();
        break;
      }
      case 'cinders': if (UI.drawCinderIcon) UI.drawCinderIcon(ctx, x, y, s * 0.8, t); break;
      case 'health': {
        ctx.fillStyle = '#efe7d2'; ctx.fillRect(x - s * 0.24, y - s * 0.2, s * 0.48, s * 1.0);
        UI.flame(ctx, x, y - s * 0.25, s * 0.85, 'blue', t, 9, { glow: 0.5 });
        break;
      }
      case 'ember': {
        ctx.strokeStyle = '#d8ceb3'; lw(ctx, Math.max(1.2, s * 0.1));
        ctx.fillStyle = '#3f9bff';
        ctx.beginPath(); ctx.arc(x, y + s * 0.1, s * 0.75, 0, TAU); ctx.fill(); ctx.stroke();
        ctx.fillStyle = '#e8f8ff'; ctx.beginPath(); ctx.arc(x - s * 0.25, y - s * 0.15, s * 0.14, 0, TAU); ctx.fill();
        break;
      }
      default: { ctx.fillStyle = C.cream; ctx.beginPath(); ctx.arc(x, y, s * 0.4, 0, TAU); ctx.fill(); }
    }
    ctx.globalAlpha = pa;
  };
  /** Icon for a giveItem spec ('heartwax', 'seal:bell', 'sigil:waymoth', 'spark:spark_gw', 'chart:nave', 'brand', ...). */
  icons.spec = function (ctx, spec, x, y, size, opts) {
    const s = String(spec || '');
    const ci = s.indexOf(':');
    const kind = ci < 0 ? s : s.slice(0, ci), arg = ci < 0 ? '' : s.slice(ci + 1);
    if (kind === 'sigil') icons.sigil(ctx, arg, x, y, size, opts);
    else if (kind === 'seal') icons.item(ctx, 'seal_' + arg, x, y, size, opts);
    else if (kind === 'ability') icons.ability(ctx, arg, x, y, size, opts);
    else icons.item(ctx, kind, x, y, size, opts);
  };

  // ================================================================== inventory data
  // No spoilers (Hollow Knight style): the screen only ever shows what the player has found. Abilities, relic types
  // and sigils appear once owned (no greyed placeholders, no empty sockets/cells), counts never carry a total
  // (no "x / 8"), Heartwax shows only the shard toward the next candle (half-filled heart), the Brand only its
  // current name, and completion % is left to the save-slot cards. No soul/damage numbers either (as in Hollow
  // Knight): health is a row of candles, Ember is never a number, the Brand has no damage figure, sigil costs are pips.
  function P() { return (G.game && G.game.progress) || null; }
  function brandLevelInfo(lvl) {
    const levels = UI.textObj('items.brand.levels');
    const L = levels && levels[lvl];
    return { name: (L && L.name) || ['Plain Brand', 'Tempered Brand', 'Glass-Edged Brand', 'Heartforged Brand'][lvl] || 'Brand', desc: (L && L.desc) || '' };
  }
  UI.brandLevelInfo = brandLevelInfo;
  function sigilCost(id) {
    if (G.game && G.game.sigilCost) return G.game.sigilCost(id);
    const s = G.Items && G.Items.sigils && G.Items.sigils[id];
    return (s && s.cost) || 1;
  }
  UI.sigilCost = sigilCost;
  function notchesUsed() { try { return G.game.notchesUsed(); } catch (e) { return 0; } }

  /** Ability ids the player owns, in the canonical order. */
  function ownedAbilities(p) { return abilityIds().filter((id) => !!(p && p.abilities && p.abilities[id])); }
  /** Relic types the player holds at least one of: heartwax (any shard found), urn, kiln_glass (held), spark, seal. */
  function ownedRelics(p) {
    const out = [];
    if (!p) return out;
    if ((p.heartShards | 0) > 0) out.push('heartwax');
    if ((p.urns | 0) > 0) out.push('urn');
    if ((p.kilnGlass | 0) > 0) out.push('kiln_glass');
    if ((p.sparks || []).length) out.push('spark');
    if ((p.seals || []).length) out.push('seal');
    return out;
  }
  /** Owned sigils in the order they were found (like HK's charm list), unknown/duplicate ids dropped. */
  function ownedSigils(p) {
    const known = sigilIds();
    return ((p && p.sigils) || []).filter((id, i, a) => known.indexOf(id) >= 0 && a.indexOf(id) === i);
  }
  /** Seal ids held, in the canonical order. */
  function ownedSeals(p) {
    const order = (G.Items && G.Items.order && G.Items.order.seals) || ['bell', 'kiln', 'wing'];
    const held = (p && p.seals) || [];
    return order.filter((id) => held.indexOf(id) >= 0).concat(held.filter((id) => order.indexOf(id) < 0));
  }
  UI.inventoryOwned = (p) => { const q = p || P(); return { abilities: ownedAbilities(q), relics: ownedRelics(q), sigils: ownedSigils(q), seals: ownedSeals(q) }; };

  // Layout of the left column flows with what is owned: abilities (rows of 3, centered; none → no section), the
  // stats row + Brand, then the relic row (none → no section). cells: {kind, id, x, y, w, h}
  const AB_W = 150, AB_H = 100, AB_DX = 172, AB_DY = 112, COL_MID = 359;
  function buildLayout(p) {
    const cells = [];
    const ab = ownedAbilities(p);
    const abRows = Math.ceil(ab.length / 3);
    ab.forEach((id, i) => {
      const row = Math.floor(i / 3), inRow = Math.min(3, ab.length - row * 3), k = i - row * 3;
      const x0 = COL_MID - (inRow * AB_DX - (AB_DX - AB_W)) / 2;
      cells.push({ kind: 'ability', id, x: Math.round(x0 + k * AB_DX), y: 186 + row * AB_DY, w: AB_W, h: AB_H });
    });
    const statsY = ab.length ? 186 + abRows * AB_DY + 22 : 196;
    const relicY = statsY + 104;
    ownedRelics(p).forEach((id, i) => cells.push({ kind: 'relic', id, x: 76 + i * 106, y: relicY, w: 96, h: 110 }));
    const perRow = 7;
    ownedSigils(p).forEach((id, i) => cells.push({ kind: 'sigil', id, x: 700 + (i % perRow) * 74, y: 248 + Math.floor(i / perRow) * 80, w: 64, h: 70 }));
    // hasSigils gates the whole Sigil column (header, notch meter, Equipped row, Sconce hint): like Hollow Knight's
    // Charms pane, the system is not shown at all until the first Sigil is found
    return { cells, statsY, relicY, hasAbilities: ab.length > 0, hasSigils: ownedSigils(p).length > 0 };
  }
  function navigate(cells, cur, dx, dy) {
    const a = cells[cur];
    if (!a) return cur;
    const ax = a.x + a.w / 2, ay = a.y + a.h / 2;
    let best = -1, bestScore = Infinity;
    for (let i = 0; i < cells.length; i++) {
      if (i === cur) continue;
      const b = cells[i];
      const bx = b.x + b.w / 2, by = b.y + b.h / 2;
      const px = (bx - ax) * dx + (by - ay) * dy;           // along the direction
      if (px <= 4) continue;
      const ox = Math.abs(dx ? by - ay : bx - ax);          // off-axis
      const score = px + ox * 2.2;
      if (score < bestScore) { bestScore = score; best = i; }
    }
    return best < 0 ? cur : best;
  }

  // ================================================================== screen
  UI.openInventory = function (opts) {
    if (UI.isOpen('inventory')) return UI.find('inventory');
    const o = opts || {};
    const atSconce = !!o.atSconce;
    const lay = buildLayout(P());
    const cells = lay.cells;
    const firstSigil = cells.findIndex((c) => c.kind === 'sigil');
    UI.sfx('map_open', { pitch: 1.15 });
    return UI.push({
      name: 'inventory', fadeIn: 0.2, fadeOut: 0.16, hideHud: true, atSconce, cells, layout: lay,
      sel: atSconce && firstSigil >= 0 ? firstSigil : 0, msg: '', msgT: 0, onClose: o.onClose,
      update(dt, active) {
        if (this.msgT > 0) this.msgT -= dt;
        if (!active) return;
        if (UI.pressedClose(['inventory', 'cancel', 'pause'])) { UI.sfx('menu_back'); UI.close(this); return; }
        const dx = UI.navX(), dy = dx ? 0 : UI.navY();
        if ((dx || dy) && cells.length) {
          const n = navigate(cells, this.sel, dx, dy);
          if (n !== this.sel) { this.sel = n; UI.sfx('menu_move'); }
        }
        if (UI.pressedAny(UI.CONFIRM)) this.activate();
      },
      activate() {
        const c = cells[this.sel];
        const p = P();
        if (!c || c.kind !== 'sigil' || !p) return;
        if (p.sigils.indexOf(c.id) < 0) { UI.sfx('deny', { vol: 0.5 }); return; }
        if (!this.atSconce) { UI.sfx('deny'); this.flash(UI.text('ui.restToEquip', 'Rest at a Sconce to change Sigils')); return; }
        if (G.game.isEquipped(c.id)) { if (G.game.unequip(c.id)) this.restChanged(); UI.sfx('menu_back'); return; }
        if (G.game.equip(c.id)) { this.restChanged(); UI.sfx('menu_select'); this.flash(''); } else { UI.sfx('deny'); this.flash(UI.text('ui.notEnoughNotches', 'Not enough Notches')); }
      },
      // the loadout changed while resting at a Sconce: the rest fills every candle the new loadout grants
      // (e.g. Heartwax's extra one) and the choice is saved now, not at the next room change
      restChanged() {
        const p = P();
        if (p && G.game.maxHealth) p.health = G.game.maxHealth();
        if (G.game.saveNow) G.game.saveNow();
      },
      flash(text) { this.msg = text; this.msgT = text ? 2.4 : 0; },
      draw(ctx, a) { drawInventory(ctx, a, this); },
    });
  };

  function sectionLabel(ctx, text, x, y, align) {
    ctx.font = UI.font(19, 'italic');
    ctx.fillStyle = C.gold;
    ctx.textAlign = align || 'left';
    ctx.textBaseline = 'middle';
    UI.spacedText(ctx, text, x, y, 1.5, align || 'left');
  }

  function drawInventory(ctx, a, s) {
    const p = P();
    const t = UI.t;
    UI.veil(ctx, 1, 'rgba(4,5,9,0.9)');
    UI.vignette(ctx, 0.7);
    UI.panel(ctx, 34, 26, W - 68, H - 52, { fill: 'rgba(8,9,14,0.55)', cornerSize: 26, cornerAlpha: 0.6 });
    ctx.font = UI.font(38);
    ctx.fillStyle = C.cream;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    UI.spacedText(ctx, UI.text('ui.inventory', 'Inventory'), W / 2, 66, 3, 'center');
    UI.flourish(ctx, W / 2, 100, 170, { alpha: 0.55 });
    // vertical divider between columns
    ctx.fillStyle = 'rgba(236,228,207,0.14)';
    ctx.fillRect(650, 140, 1, 520);
    if (!p) return;
    const sel = s.cells[s.sel];

    // ---- abilities (owned only; no section until the first one is found)
    if (s.layout.hasAbilities) sectionLabel(ctx, UI.text('ui.abilities', 'Abilities'), 80, 150);
    for (const c of s.cells) {
      if (c.kind !== 'ability') continue;
      const on = c === sel;
      const cx = c.x + c.w / 2;
      if (on) selectionFrame(ctx, c, t);
      icons.ability(ctx, c.id, cx, c.y + 34, 54, { t });
      ctx.font = UI.font(17);
      ctx.fillStyle = on ? C.creamHi : C.cream;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(UI.text('abilities.' + c.id + '.name', c.id), cx, c.y + 82);
    }

    // ---- stats
    const sy = s.layout.statsY;
    if (s.layout.hasAbilities) UI.rule(ctx, 340, sy - 34, 280, C.cream, 0.25);
    const lvl = Math.max(0, Math.min(3, p.brandLevel | 0));
    const bi = brandLevelInfo(lvl);
    // health: one small candle per candle of health (drawn, never a number); cinders: the purse, as geo is shown
    const mh = Math.max(1, Math.min(12, G.game.maxHealth() | 0));
    icons.item(ctx, 'health', 92, sy, 30, { t });
    ctx.font = UI.font(15);
    ctx.fillStyle = C.dim;
    ctx.textAlign = 'left';
    ctx.textBaseline = 'middle';
    ctx.fillText(UI.text('ui.health', 'Health'), 116, sy - 9);
    for (let i = 0; i < mh; i++) candlePip(ctx, 122 + i * 13, sy + 13, t + i * 0.37);
    const cx0 = Math.max(300, 122 + mh * 13 + 36);
    icons.item(ctx, 'cinders', cx0, sy, 30, { t });
    ctx.font = UI.font(15);
    ctx.fillStyle = C.dim;
    ctx.fillText(UI.text('ui.cinders', 'Cinders'), cx0 + 24, sy - 9);
    ctx.font = UI.font(22);
    ctx.fillStyle = C.cream;
    ctx.fillText(String(p.cinders | 0), cx0 + 24, sy + 13);
    // brand: its current name only (no level, no damage)
    const bx = 92, by = sy + 46;
    icons.item(ctx, 'brand', bx, by, 30, { t });
    ctx.font = UI.font(20);
    ctx.fillStyle = C.cream;
    ctx.textAlign = 'left';
    ctx.textBaseline = 'middle';
    ctx.fillText(bi.name, bx + 24, by + 1);

    // ---- relics (only types held; counts without totals)
    let relics = 0;
    for (const c of s.cells) {
      if (c.kind !== 'relic') continue;
      relics++;
      const on = c === sel;
      if (on) selectionFrame(ctx, c, t);
      const cx = c.x + c.w / 2, iy = c.y + 40;
      let count = '';
      switch (c.id) {
        case 'heartwax': {
          // the shard toward the next candle, as HK shows mask shards: half a heart, or an empty outline
          const loose = (p.heartShards | 0) % 2;
          icons.item(ctx, 'heartwax', cx, iy, 40, { t, half: loose === 1, dim: loose === 0 });
          break;
        }
        case 'urn': {
          // one urn per urn held, never a count (HK shows soul vessels as pictures, not numbers)
          const n = Math.max(1, Math.min(4, p.urns | 0)), sz = n > 2 ? 26 : n > 1 ? 32 : 40, dx = n > 2 ? 26 : 32;
          for (let k = 0; k < n; k++) icons.item(ctx, 'urn', cx - (n - 1) * dx / 2 + k * dx, iy, sz, { t });
          break;
        }
        case 'kiln_glass': icons.item(ctx, 'kiln_glass', cx, iy, 38, { t }); count = String(p.kilnGlass | 0); break;
        case 'spark': icons.item(ctx, 'spark', cx, iy, 34, { t }); count = String((p.sparks || []).length); break;
        case 'seal': {
          const ids = ownedSeals(p);
          const n = ids.length, sz = n > 2 ? 24 : 30, dx = n > 2 ? 26 : 32;
          ids.forEach((sid, k) => icons.item(ctx, 'seal_' + sid, cx - (n - 1) * dx / 2 + k * dx, iy, sz, { t }));
          break;
        }
      }
      if (!count) continue;
      ctx.font = UI.font(17);
      ctx.fillStyle = on ? C.creamHi : C.cream;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(count, cx, c.y + 90);
    }
    if (relics) sectionLabel(ctx, UI.text('ui.relics', 'Relics'), 80, s.layout.relicY - 14);

    // ---- sigils (owned only; no header, notch meter, Equipped row or Sconce hint until the first one is found)
    const hasSigils = !!s.layout.hasSigils;
    if (hasSigils) {
      sectionLabel(ctx, UI.text('ui.sigils', 'Sigils'), 700, 150);
      drawNotchMeter(ctx, p, 1198, 150, t);
      // equipped row
      ctx.font = UI.font(15, 'italic');
      ctx.fillStyle = C.dim;
      ctx.textAlign = 'left';
      ctx.fillText(UI.text('ui.equipped', 'Equipped'), 700, 192);
      const eq = p.equipped || [];
      if (!eq.length) {
        ctx.fillStyle = C.faint;
        ctx.fillText('—', 790, 192);
      }
      eq.forEach((id, i) => icons.sigil(ctx, id, 800 + i * 44, 192, 34, { t, equipped: false }));
      UI.rule(ctx, 925, 220, 240, C.cream, 0.2);
    }
    for (const c of s.cells) {
      if (c.kind !== 'sigil') continue;
      const on = c === sel;
      const cx = c.x + c.w / 2, cy = c.y + c.h / 2 - 4;
      if (on) selectionFrame(ctx, c, t);
      icons.sigil(ctx, c.id, cx, cy, 52, { t, equipped: G.game.isEquipped(c.id) });
      // cost pips
      const cost = sigilCost(c.id);
      for (let k = 0; k < cost; k++) {
        ctx.fillStyle = C.creamDim;
        ctx.beginPath(); ctx.arc(cx - (cost - 1) * 4 + k * 8, c.y + c.h + 1, 2.1, 0, TAU); ctx.fill();
      }
    }

    // ---- description panel
    drawDescription(ctx, s, sel, p, t);

    // ---- footer
    const hints = [];
    if (sel && sel.kind === 'sigil' && s.atSconce && p.sigils.indexOf(sel.id) >= 0) {
      hints.push(['confirm', G.game.isEquipped(sel.id) ? UI.text('ui.unequip', 'Remove') : UI.text('ui.equip', 'Equip')]);
    }
    hints.push(['cancel', UI.text('ui.close', 'Close')]);
    UI.hints(ctx, hints, W - 70, 672, 'right', { alpha: 0.6, size: 16 });
    if (hasSigils && !s.atSconce && !(s.msgT > 0 && s.msg)) {
      ctx.font = UI.font(16, 'italic');
      ctx.fillStyle = C.dim;
      ctx.textAlign = 'center';
      ctx.fillText(UI.text('ui.restToEquip', 'Rest at a Sconce to change Sigils'), 940, 628);
    }
  }

  function selectionFrame(ctx, c, t) {
    const pad = 4;
    const x = c.x - pad, y = c.y - pad, w = c.w + pad * 2, h = c.h + pad * 2;
    const g = ctx.createRadialGradient(x + w / 2, y + h / 2, 4, x + w / 2, y + h / 2, Math.max(w, h) * 0.7);
    g.addColorStop(0, 'rgba(110,170,255,0.16)'); g.addColorStop(1, 'rgba(110,170,255,0)');
    ctx.fillStyle = g;
    ctx.fillRect(x, y, w, h);
    const k = 0.55 + 0.25 * Math.sin(t * 3);
    UI.corner(ctx, x, y, 9, 1, 1, '#bfe6ff', k);
    UI.corner(ctx, x + w, y, 9, -1, 1, '#bfe6ff', k);
    UI.corner(ctx, x, y + h, 9, 1, -1, '#bfe6ff', k);
    UI.corner(ctx, x + w, y + h, 9, -1, -1, '#bfe6ff', k);
  }

  function drawNotchMeter(ctx, p, rx, y, t) {
    const total = Math.max(0, p.notches | 0);
    const used = notchesUsed();
    ctx.font = UI.font(16);
    ctx.fillStyle = C.creamDim;
    ctx.textAlign = 'right';
    ctx.textBaseline = 'middle';
    // the label carries no numbers: owned notches are the pips (filled = in use), never "used / max"
    const label = UI.text('ui.notches', 'Notches');
    const pipsW = total * 18;
    ctx.fillText(label, rx - pipsW - 10, y + 1);
    for (let i = 0; i < total; i++) {
      const x = rx - pipsW + 9 + i * 18;
      const filled = i < used;
      ctx.beginPath();
      ctx.moveTo(x, y - 8); ctx.lineTo(x + 6, y); ctx.lineTo(x, y + 8); ctx.lineTo(x - 6, y); ctx.closePath();
      if (filled) { ctx.fillStyle = '#bfe6ff'; ctx.fill(); UI.glow(ctx, x, y, 12, '#79c4ff', 0.35); } else { ctx.strokeStyle = 'rgba(236,228,207,0.45)'; ctx.lineWidth = 1.2; ctx.stroke(); }
    }
  }

  /** A small lit candle (health, drawn instead of a number). */
  function candlePip(ctx, x, y, t) {
    ctx.fillStyle = '#e9e1cc';
    ctx.fillRect(x - 3, y - 4, 6, 12);
    ctx.fillStyle = 'rgba(0,0,0,0.25)';
    ctx.fillRect(x + 1, y - 4, 2, 12);
    const fl = 1 + 0.12 * Math.sin(t * 9);
    UI.glow(ctx, x, y - 8, 8, '#79c4ff', 0.35);
    ctx.fillStyle = '#9fd4ff';
    ctx.beginPath();
    ctx.moveTo(x, y - 13 * fl); ctx.quadraticCurveTo(x + 3.2, y - 7, x, y - 5); ctx.quadraticCurveTo(x - 3.2, y - 7, x, y - 13 * fl);
    ctx.fill();
  }
  /** A sigil's notch cost as diamond pips (as on the notch meter), never a number. Returns the right edge
   *  (align 'left': pips start at x; 'center': centered on x). */
  function notchCost(ctx, x, y, n, align) {
    const k = Math.max(0, n | 0), step = 16, wTot = k * step;
    const x0 = align === 'center' ? x - wTot / 2 : x;
    for (let i = 0; i < k; i++) {
      const px = x0 + step / 2 + i * step;
      ctx.beginPath();
      ctx.moveTo(px, y - 7); ctx.lineTo(px + 5, y); ctx.lineTo(px, y + 7); ctx.lineTo(px - 5, y); ctx.closePath();
      ctx.fillStyle = '#bfe6ff';
      ctx.fill();
    }
    return x0 + wTot;
  }
  UI.notchCost = notchCost;

  function drawDescription(ctx, s, c, p, t) {
    const x = 690, y = 420, w = 500, h = 190;
    UI.panel(ctx, x, y, w, h, { corners: true, cornerSize: 12, cornerAlpha: 0.4, fill: 'rgba(10,11,17,0.75)' });
    if (!c) return;
    let name = '', desc = '', meta = '', pips = 0;
    // cells exist only for owned things, so every entry here has its real name and description
    if (c.kind === 'ability') {
      name = UI.text('abilities.' + c.id + '.name', c.id);
      desc = UI.text('abilities.' + c.id + '.desc', '');
      meta = UI.tokens(UI.text('abilities.' + c.id + '.how', ''));
    } else if (c.kind === 'relic') {
      switch (c.id) {
        case 'heartwax': {
          name = UI.text('items.heartwax.name', 'Heartwax Shard');
          desc = UI.text('items.heartwax.desc', '');
          meta = (p.heartShards | 0) % 2 ? UI.text('ui.heartwaxHalf', 'Half of a new candle. One more shard will complete it.')
            : UI.text('ui.heartwaxNone', 'No loose shards: every pair has fused into a candle.');
          break;
        }
        case 'urn': name = UI.text('items.urn.name', 'Ember Urn'); desc = UI.text('items.urn.desc', ''); break;   // no count: items.urn.desc says it in words
        case 'kiln_glass': name = UI.text('items.kiln_glass.name', 'Kiln Glass'); desc = UI.text('items.kiln_glass.desc', ''); meta = UI.text('ui.kilnGlass', 'Kiln Glass') + ': ' + (p.kilnGlass | 0); break;
        case 'spark': name = UI.text('items.spark.name', "Chandler's Spark"); desc = UI.text('items.spark.desc', ''); meta = UI.text('ui.sparks', "Chandler's Sparks") + ': ' + (p.sparks || []).length; break;
        case 'seal': {
          name = UI.text('ui.seals', 'Warden Seals');
          desc = ownedSeals(p).map((id) => UI.text('items.seal_' + id + '.name', id)).join(',  ');
          break;
        }
      }
    } else if (c.kind === 'sigil') {
      name = UI.text('sigils.' + c.id + '.name', c.id);
      desc = UI.text('sigils.' + c.id + '.desc', '');
      pips = sigilCost(c.id);
      if (G.game.isEquipped(c.id)) meta = UI.text('ui.equipped', 'Equipped');
    }
    ctx.font = UI.font(25);
    ctx.fillStyle = C.cream;
    ctx.textAlign = 'left';
    ctx.textBaseline = 'alphabetic';
    ctx.fillText(name, x + 26, y + 42);
    ctx.font = UI.font(17);
    ctx.fillStyle = C.creamDim;
    const lines = UI.wrap(ctx, desc, w - 52);
    const maxLines = 4;
    for (let i = 0; i < Math.min(maxLines, lines.length); i++) ctx.fillText(lines[i], x + 26, y + 74 + i * 23);
    let mx = x + 26;
    if (pips > 0) {
      // the cost as pips after a dim 'Notches' label (no number)
      ctx.font = UI.font(15, 'italic');
      ctx.fillStyle = C.goldDim;
      ctx.textAlign = 'left';
      ctx.textBaseline = 'middle';
      const label = UI.text('ui.notches', 'Notches');
      ctx.fillText(label, x + 26, y + h - 25);
      mx = notchCost(ctx, x + 26 + ctx.measureText(label).width + 10, y + h - 25, pips, 'left') + 18;
      ctx.textBaseline = 'alphabetic';
    }
    if (meta) {
      ctx.font = UI.font(15, 'italic');
      ctx.fillStyle = C.goldDim;
      ctx.textAlign = 'left';
      const ml = UI.wrap(ctx, meta, x + w - 26 - mx);
      const my = y + h - 20 - (ml.length - 1) * 19;
      for (let i = 0; i < ml.length; i++) ctx.fillText(ml[i], mx, my + i * 19);
    }
    if (s.msgT > 0 && s.msg) {
      ctx.globalAlpha *= Math.min(1, s.msgT / 0.4);
      ctx.font = UI.font(17, 'italic');
      ctx.fillStyle = C.red;
      ctx.textAlign = 'center';
      ctx.fillText(s.msg, x + w / 2, y + h + 18);
    }
  }
})();
