// src/ui/hud.js — the in-play HUD (top-left): the Ember Well (a glass vessel of blue-white fire, level =
// ember / emberMax, cracked & smoking while a Gutterwisp holds part of its capacity), a row of health
// candles (blue flames; snuff on loss, rekindle on heal) and the cinders count (counts up on gain).
// Drawn automatically in play/transition/dead modes; hidden in title, intro, ending and cutscenes.
(function () {
  'use strict';
  const G = globalThis.G;
  const UI = G.UI;
  const C = UI.C;
  const TAU = Math.PI * 2;

  // layout
  const WX = 82, WY = 80, R = 40;             // Ember Well center / radius
  const CX0 = 152, CSP = 30, CBOT = 84;      // first candle x, spacing, candle bottom y
  const CW = 12, CH = 25;                     // candle body size
  const CINDER_Y = 122;                       // cinders row center y

  const hud = {
    alpha: 0,
    progressRef: null,
    emberShown: 0,
    emberFlash: 0,
    hurtShake: 0,
    candles: [],          // [{lit, anim:'snuff'|'kindle'|'appear'|null, at, ember}]
    cinderShown: 0,
    cinderActual: 0,
    cinderDelay: 0,
    gainFlash: 0,
    smoke: null,
  };
  UI.hud = hud;

  // ------------------------------------------------------------------ cached sprites
  let wellBack = null, wellFront = null, liquidGrad = null, liquidGradGrey = null;
  const SPR = R * 2 + 64;          // sprite canvas size; well centered
  const SO = SPR / 2;               // sprite center offset
  function buildWell() {
    // back: shadow halo + dark glass interior
    const b = G.U.makeCanvas(SPR, SPR);
    let x = b.ctx;
    let g = x.createRadialGradient(SO, SO, R * 0.7, SO, SO, R + 26);
    g.addColorStop(0, 'rgba(0,0,0,0.55)'); g.addColorStop(1, 'rgba(0,0,0,0)');
    x.fillStyle = g;
    x.fillRect(0, 0, SPR, SPR);
    g = x.createRadialGradient(SO - R * 0.25, SO - R * 0.3, 2, SO, SO, R);
    g.addColorStop(0, '#16202e'); g.addColorStop(0.7, '#0a0f17'); g.addColorStop(1, '#04060a');
    x.fillStyle = g;
    x.beginPath(); x.arc(SO, SO, R - 2, 0, TAU); x.fill();
    wellBack = b.canvas;

    // front: glass highlights, rim, neck and side filigree
    const f = G.U.makeCanvas(SPR, SPR);
    x = f.ctx;
    // inner shading at the glass edge
    g = x.createRadialGradient(SO, SO, R * 0.62, SO, SO, R - 2);
    g.addColorStop(0, 'rgba(0,0,0,0)'); g.addColorStop(1, 'rgba(0,0,0,0.42)');
    x.fillStyle = g;
    x.beginPath(); x.arc(SO, SO, R - 2, 0, TAU); x.fill();
    // highlight arc (upper left) and a small glint
    x.strokeStyle = 'rgba(255,255,255,0.32)';
    x.lineWidth = 3.2;
    x.lineCap = 'round';
    x.beginPath(); x.arc(SO, SO, R - 9, Math.PI * 1.08, Math.PI * 1.42); x.stroke();
    x.strokeStyle = 'rgba(255,255,255,0.12)';
    x.lineWidth = 1.5;
    x.beginPath(); x.arc(SO, SO, R - 9, Math.PI * 0.62, Math.PI * 0.8); x.stroke();
    x.fillStyle = 'rgba(255,255,255,0.55)';
    x.beginPath(); x.arc(SO - R * 0.36, SO - R * 0.52, 2.1, 0, TAU); x.fill();
    // rim: dark outer line, light metal ring, inner dark line
    x.lineCap = 'butt';
    x.strokeStyle = 'rgba(0,0,0,0.75)';
    x.lineWidth = 6;
    x.beginPath(); x.arc(SO, SO, R, 0, TAU); x.stroke();
    g = x.createLinearGradient(0, SO - R, 0, SO + R);
    g.addColorStop(0, '#f3ead2'); g.addColorStop(0.5, '#b9ae95'); g.addColorStop(1, '#e2d7bc');
    x.strokeStyle = g;
    x.lineWidth = 2.6;
    x.beginPath(); x.arc(SO, SO, R, 0, TAU); x.stroke();
    x.strokeStyle = 'rgba(30,26,20,0.8)';
    x.lineWidth = 1;
    x.beginPath(); x.arc(SO, SO, R - 2.6, 0, TAU); x.stroke();
    // neck / spout on top
    x.fillStyle = '#d9cfb6';
    x.strokeStyle = 'rgba(0,0,0,0.7)';
    x.lineWidth = 1;
    x.beginPath();
    x.moveTo(SO - 9, SO - R + 1); x.lineTo(SO - 6, SO - R - 7); x.lineTo(SO + 6, SO - R - 7); x.lineTo(SO + 9, SO - R + 1);
    x.closePath(); x.fill(); x.stroke();
    x.fillStyle = '#efe6cf';
    x.fillRect(SO - 8, SO - R - 10, 16, 3.5);
    x.strokeRect(SO - 8, SO - R - 10, 16, 3.5);
    // side filigree horns sweeping up from the lower rim
    x.strokeStyle = '#d4c9ae';
    x.lineWidth = 1.6;
    for (const d of [-1, 1]) {
      x.beginPath();
      x.moveTo(SO + d * R * 0.72, SO + R * 0.7);
      x.bezierCurveTo(SO + d * (R + 14), SO + R * 0.55, SO + d * (R + 14), SO - R * 0.15, SO + d * (R + 5), SO - R * 0.42);
      x.bezierCurveTo(SO + d * (R + 1), SO - R * 0.55, SO + d * (R + 9), SO - R * 0.7, SO + d * (R + 11), SO - R * 0.52);
      x.stroke();
      x.fillStyle = '#e6dcc2';
      x.beginPath(); x.arc(SO + d * (R + 11), SO - R * 0.52, 1.8, 0, TAU); x.fill();
    }
    // foot ornament
    x.fillStyle = '#d9cfb6';
    x.beginPath();
    x.moveTo(SO, SO + R + 9); x.lineTo(SO + 7, SO + R + 1); x.lineTo(SO - 7, SO + R + 1); x.closePath();
    x.fill(); x.stroke();
    wellFront = f.canvas;
  }
  function liquidGradient(ctx, grey) {
    const g = ctx.createLinearGradient(0, WY - R, 0, WY + R);
    if (grey) {
      g.addColorStop(0, '#e4eef4'); g.addColorStop(0.3, '#8fb6d4'); g.addColorStop(1, '#2d4a78');
    } else {
      g.addColorStop(0, '#f2fbff'); g.addColorStop(0.22, '#9fdcff'); g.addColorStop(0.55, '#3f9bff'); g.addColorStop(1, '#1a3fb8');
    }
    return g;
  }

  // ------------------------------------------------------------------ state sync
  function snapTo(p) {
    hud.progressRef = p;
    hud.emberShown = p ? p.ember : 0;
    hud.cinderShown = hud.cinderActual = p ? p.cinders : 0;
    hud.cinderDelay = 0;
    hud.candles.length = 0;
    if (p) {
      const m = maxHealth();
      for (let i = 0; i < m; i++) hud.candles.push({ lit: i < p.health, anim: null, at: 0, ember: 0 });
    }
    if (hud.smoke) hud.smoke.clear();
  }
  function maxHealth() {
    try { return Math.max(1, G.game.maxHealth()); } catch (e) { return 5; }
  }
  function emberMax() {
    try { return Math.max(1, G.game.emberMax()); } catch (e) { return 99; }
  }

  function updateCandles(p, dt) {
    const m = maxHealth();
    const h = Math.max(0, Math.min(m, p.health | 0));
    while (hud.candles.length < m) hud.candles.push({ lit: false, anim: 'appear', at: 0, ember: 0 });
    if (hud.candles.length > m) hud.candles.length = m;
    for (let i = 0; i < m; i++) {
      const c = hud.candles[i];
      c.at += dt;
      if (c.ember > 0) c.ember = Math.max(0, c.ember - dt);
      const want = i < h;
      if (want !== c.lit) {
        c.lit = want;
        c.at = 0;
        c.anim = want ? 'kindle' : 'snuff';
        if (!want) {
          c.ember = 1.2;
          const x = CX0 + i * CSP, y = CBOT - CH - 6;
          for (let k = 0; k < 7; k++) {
            hud.smoke.spawn({ x: x + (Math.random() - 0.5) * 4, y, vx: (Math.random() - 0.5) * 22, vy: -26 - Math.random() * 30,
              life: 0.9 + Math.random() * 0.7, size: 2 + Math.random() * 1.5, size2: 5 + Math.random() * 3,
              color: '#9aa0a8', alpha: 0.45, wobble: 14 });
          }
          hud.smoke.spawn({ x, y: y + 2, life: 0.35, size: 3, size2: 1, color: '#dff4ff', alpha: 0.9, glow: true });
        }
      }
      if (c.anim && c.at > 0.9) c.anim = null;
    }
  }

  function updateCinders(p, dt) {
    const actual = p.cinders | 0;
    if (actual !== hud.cinderActual) {
      if (actual > hud.cinderActual) { hud.cinderDelay = 0.55; hud.gainFlash = 1; }
      hud.cinderActual = actual;
    }
    if (hud.gainFlash > 0) hud.gainFlash = Math.max(0, hud.gainFlash - dt * 1.4);
    if (hud.cinderShown < actual) {
      if (hud.cinderDelay > 0) hud.cinderDelay -= dt;
      else {
        const rate = Math.max(30, (actual - hud.cinderShown) * 3.2);
        hud.cinderShown = Math.min(actual, hud.cinderShown + rate * dt);
      }
    } else if (hud.cinderShown > actual) {
      const rate = Math.max(80, (hud.cinderShown - actual) * 5);
      hud.cinderShown = Math.max(actual, hud.cinderShown - rate * dt);
    }
  }

  function update(dt) {
    if (!hud.smoke) hud.smoke = new UI.Particles(80);
    const want = UI.hudWanted();
    hud.alpha = want ? Math.min(1, hud.alpha + dt * 3) : Math.max(0, hud.alpha - dt * 5);
    const p = G.game && G.game.progress;
    if (p !== hud.progressRef) snapTo(p);
    if (!p) return;
    const em = emberMax();
    const e = Math.max(0, Math.min(em, p.ember || 0));
    hud.emberShown += (e - hud.emberShown) * Math.min(1, dt * 9);
    if (Math.abs(e - hud.emberShown) < 0.05) hud.emberShown = e;
    if (hud.emberFlash > 0) hud.emberFlash = Math.max(0, hud.emberFlash - dt * 1.6);
    if (hud.hurtShake > 0) hud.hurtShake = Math.max(0, hud.hurtShake - dt);
    updateCandles(p, dt);
    updateCinders(p, dt);
    hud.smoke.update(dt);
    // grey smoke curling from the spout while a wisp holds part of the well
    if (p.wisp && hud.alpha > 0.05 && Math.random() < dt * 5) {
      hud.smoke.spawn({ x: WX + (Math.random() - 0.5) * 6, y: WY - R - 10, vx: (Math.random() - 0.5) * 10, vy: -18 - Math.random() * 12,
        life: 1.6 + Math.random(), size: 2, size2: 6, color: '#7d838c', alpha: 0.35, wobble: 10 });
    }
  }

  // ------------------------------------------------------------------ drawing
  function drawWell(ctx, p, t) {
    if (!wellBack) buildWell();
    if (!liquidGrad) { liquidGrad = liquidGradient(ctx, false); liquidGradGrey = liquidGradient(ctx, true); }
    const em = emberMax();
    const lvl = UI.clamp01(hud.emberShown / em);
    const ready = (p.ember || 0) >= 33;
    const wisp = !!p.wisp;
    ctx.drawImage(wellBack, WX - SO, WY - SO);
    // outer readiness glow
    if (ready) UI.glow(ctx, WX, WY, R * 2.1, '#3f8cff', 0.16 + 0.05 * Math.sin(t * 3) + hud.emberFlash * 0.4);
    const ir = R - 3;
    if (lvl > 0.003) {
      ctx.save();
      ctx.beginPath(); ctx.arc(WX, WY, ir, 0, TAU); ctx.clip();
      const top = WY + ir - lvl * 2 * ir;
      const amp = lvl > 0.97 ? 0.8 : 2.2;
      ctx.beginPath();
      ctx.moveTo(WX - ir - 2, WY + ir + 2);
      for (let x = WX - ir - 2; x <= WX + ir + 2; x += 3) {
        const y = top + Math.sin(x * 0.17 + t * 3.1) * amp + Math.sin(x * 0.09 - t * 2.2) * amp * 0.7;
        ctx.lineTo(x, y);
      }
      ctx.lineTo(WX + ir + 2, WY + ir + 2);
      ctx.closePath();
      ctx.fillStyle = wisp ? liquidGradGrey : liquidGrad;
      ctx.fill();
      // fire tongues licking up from the surface
      ctx.globalCompositeOperation = 'lighter';
      for (let i = 0; i < 6; i++) {
        const fx = WX - ir * 0.8 + (i / 5) * ir * 1.6 + Math.sin(t * 1.3 + i * 2.1) * 3;
        const hh = (5 + 6 * (0.5 + 0.5 * Math.sin(t * (4.1 + i * 0.7) + i * 1.7))) * Math.min(1, lvl * 5);
        ctx.globalAlpha = 0.38;
        ctx.fillStyle = '#bfe8ff';
        UI.teardrop(ctx, fx, top + 3, 2.6, hh, Math.sin(t * 2 + i) * 1.6);
        ctx.fill();
      }
      ctx.globalAlpha = 1;
      // rising motes in the fire
      for (let i = 0; i < 7; i++) {
        const ph = (t * (0.35 + i * 0.05) + i * 0.37) % 1;
        const my = WY + ir - ph * (WY + ir - top);
        const mx = WX + Math.sin(i * 2.4 + t * 1.1) * ir * 0.6;
        ctx.globalAlpha = 0.5 * Math.sin(ph * Math.PI);
        ctx.fillStyle = '#ffffff';
        ctx.beginPath(); ctx.arc(mx, my, 1.1, 0, TAU); ctx.fill();
      }
      ctx.globalAlpha = 1;
      ctx.globalCompositeOperation = 'source-over';
      ctx.restore();
      UI.glow(ctx, WX, Math.max(WY - ir + 6, top + 4), ir * 1.3, '#79c4ff', 0.28 + 0.25 * lvl + hud.emberFlash * 0.4);
    }
    // capacity ticks every 33 ember (the cost of a spell)
    ctx.strokeStyle = 'rgba(236,228,207,0.35)';
    ctx.lineWidth = 1;
    for (let v = 33; v < em - 1; v += 33) {
      const y = WY + ir - (v / em) * 2 * ir;
      const dx = Math.sqrt(Math.max(0, ir * ir - (y - WY) * (y - WY)));
      ctx.beginPath(); ctx.moveTo(WX - dx + 1, y); ctx.lineTo(WX - dx + 6, y); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(WX + dx - 1, y); ctx.lineTo(WX + dx - 6, y); ctx.stroke();
    }
    ctx.drawImage(wellFront, WX - SO, WY - SO);
    if (wisp) drawWispMarks(ctx, t);
  }
  // Reduced capacity: a dark crack across the glass and a grey haze cap.
  function drawWispMarks(ctx, t) {
    ctx.save();
    ctx.beginPath(); ctx.arc(WX, WY, R - 3, 0, TAU); ctx.clip();
    const g = ctx.createLinearGradient(0, WY - R, 0, WY - R * 0.2);
    g.addColorStop(0, 'rgba(120,126,136,0.55)'); g.addColorStop(1, 'rgba(120,126,136,0)');
    ctx.fillStyle = g;
    ctx.fillRect(WX - R, WY - R, R * 2, R * 0.8);
    ctx.restore();
    ctx.strokeStyle = 'rgba(16,14,12,0.85)';
    ctx.lineWidth = 1.6;
    ctx.beginPath();
    ctx.moveTo(WX + R * 0.62, WY - R * 0.74);
    ctx.lineTo(WX + R * 0.36, WY - R * 0.42);
    ctx.lineTo(WX + R * 0.44, WY - R * 0.22);
    ctx.lineTo(WX + R * 0.18, WY + R * 0.05);
    ctx.moveTo(WX + R * 0.36, WY - R * 0.42);
    ctx.lineTo(WX + R * 0.12, WY - R * 0.5);
    ctx.stroke();
    ctx.strokeStyle = 'rgba(230,236,244,0.35)';
    ctx.lineWidth = 0.8;
    ctx.beginPath();
    ctx.moveTo(WX + R * 0.64, WY - R * 0.72);
    ctx.lineTo(WX + R * 0.38, WY - R * 0.4);
    ctx.lineTo(WX + R * 0.46, WY - R * 0.2);
    ctx.stroke();
  }

  // the slim bracket under the candles, growing from the well
  function drawBracket(ctx, n) {
    const x0 = WX + R - 2, x1 = CX0 + (n - 1) * CSP + 26, y = CBOT + 5;
    ctx.fillStyle = 'rgba(0,0,0,0.5)';
    ctx.fillRect(x0, y - 1, x1 - x0, 4);
    ctx.fillStyle = '#cfc4a8';
    ctx.beginPath();
    ctx.moveTo(x0, y - 1.4); ctx.lineTo(x1, y); ctx.lineTo(x0, y + 1.4);
    ctx.closePath(); ctx.fill();
    ctx.beginPath();
    ctx.moveTo(x1 + 2, y); ctx.lineTo(x1 + 7, y - 3.5); ctx.lineTo(x1 + 12, y); ctx.lineTo(x1 + 7, y + 3.5);
    ctx.closePath(); ctx.fill();
  }

  function drawCandle(ctx, i, c, t, golden, lowHealth) {
    const x = CX0 + i * CSP;
    const appear = c.anim === 'appear' ? UI.ease.outCubic(UI.clamp01(c.at / 0.6)) : 1;
    const shake = c.anim === 'snuff' && c.at < 0.25 ? Math.sin(c.at * 90) * 1.6 * (1 - c.at / 0.25) : 0;
    const bx = x - CW / 2 + shake, by = CBOT - CH * appear;
    const pa = ctx.globalAlpha;
    ctx.globalAlpha = pa * appear;
    // shadow
    ctx.fillStyle = 'rgba(0,0,0,0.45)';
    ctx.fillRect(bx - 1.5, by + 1, CW + 3, CH * appear + 1);
    // wax body
    const lit = c.lit;
    const wax = golden ? (lit ? '#efdca2' : '#8f8466') : (lit ? '#efe7d2' : '#77736a');
    const waxDark = golden ? (lit ? '#c9b06c' : '#625a46') : (lit ? '#c8bd9f' : '#57534c');
    ctx.fillStyle = wax;
    UI.roundRect(ctx, bx, by, CW, CH * appear, 2.5);
    ctx.fill();
    ctx.fillStyle = waxDark;
    ctx.fillRect(bx + CW - 3.5, by + 3, 3.5, CH * appear - 3);
    // drips (vary per candle)
    ctx.fillStyle = wax;
    const d1 = 6 + ((i * 7) % 5), side = i % 2 ? 1 : -1;
    ctx.beginPath();
    ctx.ellipse(bx + (side > 0 ? CW - 1 : 1), by + d1, 1.8, 3.6, 0, 0, TAU);
    ctx.fill();
    // melt pool on top
    ctx.fillStyle = lit ? '#fffaf0' : '#8d887c';
    ctx.beginPath(); ctx.ellipse(bx + CW / 2, by + 1.6, CW / 2 - 1, 1.8, 0, 0, TAU); ctx.fill();
    // wick
    const wx = bx + CW / 2, wy = by;
    ctx.strokeStyle = '#1a1612';
    ctx.lineWidth = 1.6;
    ctx.beginPath(); ctx.moveTo(wx, wy + 1); ctx.quadraticCurveTo(wx + 0.5, wy - 3, wx + (lit ? 0 : 1.6), wy - 5); ctx.stroke();
    ctx.globalAlpha = pa;
    // flame
    let size = 0;
    if (lit) {
      size = 15;
      if (c.anim === 'kindle') size *= UI.ease.outBack(UI.clamp01(c.at / 0.45));
      if (lowHealth) size *= 1 + 0.12 * Math.sin(t * 7);
    } else if (c.anim === 'snuff' && c.at < 0.4) {
      const k = c.at / 0.4;
      size = 15 * Math.pow(1 - k, 1.6) * (1 + 0.3 * Math.sin(c.at * 70));
    }
    if (size > 0.6) {
      ctx.globalAlpha = pa * appear;
      UI.flame(ctx, wx, wy - 3, size, 'blue', t, i * 1.7 + 0.3, { glow: lowHealth ? 1.3 : 0.9 });
      UI.glow(ctx, wx, wy + 2, 16, '#79c4ff', 0.18);
      ctx.globalAlpha = pa;
    }
    if (c.anim === 'kindle' && c.at < 0.35) UI.glow(ctx, wx, wy - 8, 40 * (1 - c.at / 0.35) + 10, '#bfe6ff', 0.6 * (1 - c.at / 0.35));
    if (c.anim === 'snuff' && c.at < 0.18) UI.glow(ctx, wx, wy - 6, 34, '#ffffff', 0.55 * (1 - c.at / 0.18));
    // dying ember on the wick after a snuff
    if (!lit && c.ember > 0) {
      ctx.fillStyle = '#ffb070';
      ctx.globalAlpha = pa * Math.min(1, c.ember);
      ctx.beginPath(); ctx.arc(wx + 1.6, wy - 5, 1.3, 0, TAU); ctx.fill();
      ctx.globalAlpha = pa;
      UI.glow(ctx, wx + 1.6, wy - 5, 7, '#ff9050', 0.5 * Math.min(1, c.ember));
    }
  }

  /** Cinder icon: a small faceted coal with a warm glowing heart. */
  function drawCinderIcon(ctx, x, y, s, t) {
    UI.glow(ctx, x, y, s * 2.6, '#ff8a3c', 0.22 + 0.06 * Math.sin(t * 2.5));
    ctx.fillStyle = '#231b17';
    ctx.strokeStyle = 'rgba(0,0,0,0.8)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(x - s * 0.95, y + s * 0.15);
    ctx.lineTo(x - s * 0.45, y - s * 0.8);
    ctx.lineTo(x + s * 0.55, y - s * 0.7);
    ctx.lineTo(x + s, y + s * 0.1);
    ctx.lineTo(x + s * 0.4, y + s * 0.85);
    ctx.lineTo(x - s * 0.55, y + s * 0.75);
    ctx.closePath();
    ctx.fill(); ctx.stroke();
    ctx.fillStyle = '#ff9a4a';
    ctx.beginPath();
    ctx.moveTo(x - s * 0.45, y - s * 0.8); ctx.lineTo(x + s * 0.1, y - s * 0.1); ctx.lineTo(x + s * 0.55, y - s * 0.7); ctx.closePath();
    ctx.globalAlpha *= 0.85;
    ctx.fill();
    ctx.fillStyle = '#ffd38a';
    ctx.beginPath();
    ctx.moveTo(x - s * 0.95, y + s * 0.15); ctx.lineTo(x + s * 0.1, y - s * 0.1); ctx.lineTo(x - s * 0.45, y - s * 0.8); ctx.closePath();
    ctx.fill();
    ctx.globalAlpha /= 0.85;
    ctx.fillStyle = 'rgba(255,140,60,0.55)';
    ctx.beginPath();
    ctx.moveTo(x + s * 0.1, y - s * 0.1); ctx.lineTo(x + s, y + s * 0.1); ctx.lineTo(x + s * 0.4, y + s * 0.85); ctx.closePath();
    ctx.fill();
  }
  UI.drawCinderIcon = drawCinderIcon;

  function drawCinders(ctx, t) {
    const x = CX0 - 2, y = CINDER_Y;
    drawCinderIcon(ctx, x, y, 8.5, t);
    const shown = Math.floor(hud.cinderShown + 1e-6);
    ctx.font = UI.font(26);
    ctx.textAlign = 'left';
    ctx.textBaseline = 'middle';
    ctx.fillStyle = 'rgba(0,0,0,0.6)';
    ctx.fillText(String(shown), x + 18, y + 2.5);
    ctx.fillStyle = C.cream;
    ctx.fillText(String(shown), x + 17, y + 1);
    const pending = hud.cinderActual - shown;
    if (pending > 0) {
      const w = ctx.measureText(String(shown)).width;
      ctx.font = UI.font(20);
      ctx.fillStyle = C.gold;
      const pa = ctx.globalAlpha;
      ctx.globalAlpha = pa * (0.75 + 0.25 * hud.gainFlash);
      ctx.fillText('+' + pending, x + 30 + w, y + 2);
      ctx.globalAlpha = pa;
    }
  }

  function draw(ctx) {
    if (hud.alpha <= 0.003) return;
    const p = G.game && G.game.progress;
    if (!p) return;
    const t = UI.t;
    ctx.globalAlpha = UI.ease.inOutSine(hud.alpha);
    const m = hud.candles.length;
    drawBracket(ctx, Math.max(1, m));
    drawWell(ctx, p, t);
    const golden = G.game.isEquipped && G.game.isEquipped('heartwax');
    const low = (p.health | 0) === 1 && m > 1;
    for (let i = 0; i < m; i++) drawCandle(ctx, i, hud.candles[i], t, golden && i === m - 1, low && i === 0);
    hud.smoke.draw(ctx);
    drawCinders(ctx, t);
  }

  UI.addLayer({ name: 'hud', z: 0, update, draw });

  // event hooks
  UI._inits.push(() => {
    if (!G.events) return;
    G.events.on('emberFull', () => { hud.emberFlash = 1; });
    G.events.on('playerHurt', () => { hud.hurtShake = 0.3; });
  });
  /** Snap HUD counters to the current progress (no count-up/snuff animations). */
  UI.hudSnap = () => snapTo(G.game && G.game.progress);
})();
