// src/ui/ending.js — the opening verse (G.Text.intro over a dark animated backdrop; skippable) and the endings
// ('undying' | 'gutterlight'): a title, illustrated pages (procedural scenes chosen by G.Text.endings[id].scenes),
// the credits scroll, "The End", then onDone.
(function () {
  'use strict';
  const G = globalThis.G;
  const UI = G.UI;
  const C = UI.C;
  const W = UI.W, H = UI.H;
  const TAU = Math.PI * 2;

  function readTime(text) { return Math.max(3.4, Math.min(8, String(text).length * 0.055)); }

  // ================================================================== intro verse
  /** Opening verse. Confirm/Attack/Jump advance a page; Back (Esc/Backspace, pad B) or Pause skips. onDone after the fade to black. */
  UI.playIntro = function (onDone) {
    const pages = (UI.textObj('intro') || []).map(String);
    if (!pages.length) pages.push('...');
    const ash = new UI.Particles(90);
    const FIN = 1.5, FOUT = 1.1;
    return UI.push({
      name: 'intro', fadeIn: 0.8, fadeOut: 0.9, hideHud: true,
      page: 0, pt: 0, phase: 'in', hold: readTime(pages[0]), skipping: false, flameK: 0,
      onClose() {
        if (onDone) UI.safe(onDone, 'intro onDone');
        if (G.game && G.game.mode === 'play' && typeof G.game.fade === 'function') { G.game.fadeAlpha = 1; G.game.fade(0, 1.6); }
      },
      update(dt, active) {
        if (Math.random() < dt * 7) ash.spawn({ x: Math.random() * (W + 200), y: -8, vx: -10 - Math.random() * 14, vy: 14 + Math.random() * 14, life: 14, size: 1 + Math.random() * 1.5, color: '#8c8a86', alpha: 0.3 + Math.random() * 0.3, wobble: 10, kind: 'flake', rot: Math.random() * 6, vrot: 1 });
        ash.update(dt);
        const last = this.page === pages.length - 1;
        if (last) this.flameK = Math.min(1, this.flameK + dt / 2.5);
        this.pt += dt;
        if (this.phase === 'in' && this.pt >= FIN) { this.phase = 'hold'; this.pt = 0; }
        else if (this.phase === 'hold' && this.pt >= this.hold + (last ? 1.5 : 0)) { this.phase = 'out'; this.pt = 0; }
        else if (this.phase === 'out' && this.pt >= FOUT) {
          if (last) { UI.close(this); return; }
          this.page++; this.phase = 'in'; this.pt = 0; this.hold = readTime(pages[this.page]);
        }
        if (!active || this.skipping) return;
        // Back skips, but not keyboard X: X is also Attack, which advances like Z (UI.ADVANCE)
        if (UI.pressed('pause') | UI.pressedBack()) { this.skipping = true; UI.sfx('menu_back'); UI.close(this); return; }
        if (UI.pressedAny(UI.ADVANCE)) {
          if (this.phase === 'in') { this.phase = 'hold'; this.pt = 0; } else if (this.phase === 'hold') { this.phase = 'out'; this.pt = 0; }
        }
      },
      draw(ctx, a) {
        const t = UI.t;
        ctx.fillStyle = '#020306';
        ctx.fillRect(0, 0, W, H);
        // the deep, warm below and long cold
        const g = ctx.createRadialGradient(W / 2, H * 1.25, 40, W / 2, H * 1.25, H * 1.1);
        g.addColorStop(0, 'rgba(70,40,24,0.35)'); g.addColorStop(1, 'rgba(0,0,0,0)');
        ctx.fillStyle = g;
        ctx.fillRect(0, 0, W, H);
        ash.draw(ctx);
        const k = this.phase === 'in' ? UI.ease.inOutSine(Math.min(1, this.pt / FIN)) : this.phase === 'hold' ? 1 : UI.ease.inOutSine(Math.max(0, 1 - this.pt / FOUT));
        const page = pages[this.page] || '';
        ctx.globalAlpha = a * k;
        ctx.font = UI.font(30, 'italic');
        ctx.fillStyle = C.cream;
        const lines = UI.wrapBalanced(ctx, page, 900);
        const lh = 48;
        const y0 = H * 0.44 - (lines.length - 1) * lh / 2 + (1 - k) * 6;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        for (let i = 0; i < lines.length; i++) ctx.fillText(lines[i], W / 2, y0 + i * lh);
        ctx.globalAlpha = a;
        if (this.flameK > 0) {
          const fk = UI.ease.outCubic(this.flameK);
          UI.glow(ctx, W / 2, H * 0.74, 60 + 90 * fk, '#3f8cff', 0.35 * fk);
          if (fk < 0.25) { ctx.fillStyle = '#e8f6ff'; ctx.globalAlpha = a * fk * 4; ctx.beginPath(); ctx.arc(W / 2, H * 0.75, 2, 0, TAU); ctx.fill(); ctx.globalAlpha = a; }
          UI.flame(ctx, W / 2, H * 0.76, 30 * UI.ease.outBack(Math.max(0, (this.flameK - 0.1) / 0.9)), 'blue', t, 3);
        }
        const hk = Math.min(1, Math.max(0, (this.t - 1.5) / 1));
        if (hk > 0) UI.hints(ctx, [['cancel', UI.text('ui.skip', 'Skip')]], W - 40, H - 32, 'right', { alpha: 0.35 * hk, size: 15 });
      },
    });
  };

  // ================================================================== ending scenes
  function frameClip(ctx, x, y, w, h) {
    ctx.beginPath();
    ctx.moveTo(x, y + h);
    ctx.lineTo(x, y + 60);
    ctx.quadraticCurveTo(x, y, x + 60, y);
    ctx.lineTo(x + w - 60, y);
    ctx.quadraticCurveTo(x + w, y, x + w, y + 60);
    ctx.lineTo(x + w, y + h);
    ctx.closePath();
  }
  function grad(ctx, y0, y1, stops) {
    const g = ctx.createLinearGradient(0, y0, 0, y1);
    stops.forEach((c, i) => g.addColorStop(i / (stops.length - 1), c));
    return g;
  }

  function cage(ctx, cx, cy, s, t, flameKind, still) {
    const w = 120 * s, h = 190 * s;
    UI.glow(ctx, cx, cy, 220 * s, flameKind === 'blue' ? '#3f8cff' : '#ffe6a0', 0.35);
    // inner flame (perfectly still when caged)
    UI.flame(ctx, cx, cy + 40 * s, 70 * s, flameKind, still ? 0.37 : t, 2, { glow: 1.2 });
    ctx.strokeStyle = '#d9b860';
    ctx.lineWidth = 3 * s;
    // bars
    const n = 9;
    for (let i = 0; i < n; i++) {
      const k = i / (n - 1) * 2 - 1;
      const bx = cx + k * w * 0.5;
      ctx.beginPath();
      ctx.moveTo(cx + k * w * 0.32, cy - h * 0.5);
      ctx.quadraticCurveTo(bx + k * w * 0.18, cy, cx + k * w * 0.36, cy + h * 0.5);
      ctx.stroke();
    }
    // rings, dome & base
    ctx.lineWidth = 5 * s;
    ctx.beginPath(); ctx.ellipse(cx, cy - h * 0.5, w * 0.34, 9 * s, 0, 0, TAU); ctx.stroke();
    ctx.beginPath(); ctx.ellipse(cx, cy + h * 0.5, w * 0.38, 10 * s, 0, 0, TAU); ctx.stroke();
    ctx.fillStyle = '#b8963c';
    ctx.beginPath(); ctx.moveTo(cx - w * 0.34, cy - h * 0.5); ctx.quadraticCurveTo(cx, cy - h * 0.82, cx + w * 0.34, cy - h * 0.5); ctx.closePath(); ctx.fill();
    ctx.fillRect(cx - 3 * s, cy - h * 0.86, 6 * s, 22 * s);
    ctx.beginPath(); ctx.arc(cx, cy - h * 0.9, 9 * s, 0, TAU); ctx.lineWidth = 3 * s; ctx.stroke();
    ctx.beginPath(); ctx.moveTo(cx - w * 0.5, cy + h * 0.5 + 8 * s); ctx.lineTo(cx + w * 0.5, cy + h * 0.5 + 8 * s); ctx.lineTo(cx + w * 0.4, cy + h * 0.5 + 26 * s); ctx.lineTo(cx - w * 0.4, cy + h * 0.5 + 26 * s); ctx.closePath(); ctx.fill();
  }
  function wickling(ctx, x, y, s, t, reach) {
    ctx.fillStyle = '#ece4d0';
    ctx.beginPath();
    ctx.moveTo(x - 11 * s, y); ctx.lineTo(x - 9 * s, y - 34 * s); ctx.quadraticCurveTo(x, y - 40 * s, x + 9 * s, y - 34 * s); ctx.lineTo(x + 11 * s, y); ctx.closePath();
    ctx.fill();
    if (reach) {
      ctx.strokeStyle = '#ece4d0'; ctx.lineWidth = 4 * s; ctx.lineCap = 'round';
      ctx.beginPath(); ctx.moveTo(x + 7 * s, y - 26 * s); ctx.lineTo(x + 18 * s, y - 50 * s); ctx.stroke();
    }
    ctx.fillStyle = '#111';
    ctx.fillRect(x - 5 * s, y - 30 * s, 2.5 * s, 8 * s);
    ctx.fillRect(x + 2.5 * s, y - 30 * s, 2.5 * s, 8 * s);
    ctx.strokeStyle = '#111'; ctx.lineWidth = 2 * s;
    ctx.beginPath(); ctx.moveTo(x, y - 38 * s); ctx.lineTo(x, y - 45 * s); ctx.stroke();
    UI.flame(ctx, x, y - 44 * s, 20 * s, 'blue', t, 5);
  }
  function sable(ctx, x, y, s, t, lit) {
    // red scarf
    ctx.fillStyle = '#9a2a24';
    ctx.beginPath();
    ctx.moveTo(x - 4 * s, y - 70 * s);
    for (let i = 0; i <= 6; i++) ctx.lineTo(x - 10 * s - i * 14 * s, y - 70 * s + Math.sin(t * 2 + i * 0.8) * 5 * s + i * 2 * s);
    for (let i = 6; i >= 0; i--) ctx.lineTo(x - 10 * s - i * 14 * s, y - 62 * s + Math.sin(t * 2 + i * 0.8) * 5 * s + i * 3 * s);
    ctx.closePath(); ctx.fill();
    ctx.fillStyle = '#0c0c10';
    ctx.beginPath();
    ctx.moveTo(x - 16 * s, y); ctx.lineTo(x - 11 * s, y - 64 * s); ctx.quadraticCurveTo(x, y - 82 * s, x + 11 * s, y - 64 * s); ctx.lineTo(x + 16 * s, y); ctx.closePath();
    ctx.fill();
    ctx.strokeStyle = '#0c0c10'; ctx.lineWidth = 3 * s;
    ctx.beginPath(); ctx.moveTo(x + 22 * s, y + 2 * s); ctx.lineTo(x + 30 * s, y - 92 * s); ctx.stroke(); // spear
    ctx.beginPath(); ctx.moveTo(x, y - 78 * s); ctx.lineTo(x + 1 * s, y - 88 * s); ctx.stroke();       // wick
    ctx.fillStyle = '#e8e8f0';
    ctx.fillRect(x - 5 * s, y - 66 * s, 2.5 * s, 7 * s);
    ctx.fillRect(x + 3 * s, y - 66 * s, 2.5 * s, 7 * s);
    if (lit) UI.flame(ctx, x + 1 * s, y - 87 * s, 22 * s, 'orange', t, 8);
  }
  function hand(ctx, x, y, s, rot, col) {
    ctx.save();
    ctx.translate(x, y); ctx.rotate(rot);
    ctx.fillStyle = col;
    ctx.beginPath(); ctx.ellipse(0, 0, 46 * s, 36 * s, 0, 0, TAU); ctx.fill();
    for (let i = 0; i < 4; i++) {
      const fx = -30 * s + i * 20 * s;
      ctx.save(); ctx.translate(fx, -26 * s); ctx.rotate(-0.25 + i * 0.16);
      UI.roundRect(ctx, -8 * s, -70 * s, 16 * s, 76 * s, 8 * s); ctx.fill();
      ctx.restore();
    }
    ctx.save(); ctx.translate(44 * s, 4 * s); ctx.rotate(0.9);
    UI.roundRect(ctx, -8 * s, -52 * s, 16 * s, 56 * s, 8 * s); ctx.fill();
    ctx.restore();
    ctx.restore();
  }
  function risingSparks(ctx, x, y, w, h, t, colors, n, toX, toY) {
    for (let i = 0; i < n; i++) {
      const ph = (t * (0.08 + (i % 7) * 0.012) + i * 0.137) % 1;
      const sx = x + ((i * 97) % 100) / 100 * w;
      const px = toX === undefined ? sx + Math.sin(t + i) * 12 : sx + (toX - sx) * ph * ph;
      const py = toY === undefined ? y + h - ph * h : y + h - (y + h - toY) * ph;
      const al = Math.sin(ph * Math.PI);
      ctx.fillStyle = colors[i % colors.length];
      ctx.globalAlpha = al * 0.9;
      ctx.beginPath(); ctx.arc(px, py, 1.4 + (i % 3) * 0.6, 0, TAU); ctx.fill();
      if (i % 4 === 0) { ctx.globalAlpha = 1; UI.glow(ctx, px, py, 10, colors[i % colors.length], al * 0.5); }
    }
    ctx.globalAlpha = 1;
  }

  /** Draw one ending scene into the rect (clipped by the caller). info: {ending, page, pt} */
  function drawScene(ctx, scene, x, y, w, h, t, info) {
    const cx = x + w / 2, cy = y + h / 2;
    const undying = info.ending !== 'gutterlight';
    switch (scene) {
      case 'crown': {
        ctx.fillStyle = grad(ctx, y, y + h, ['#120c06', '#24180a', '#0a0705']); ctx.fillRect(x, y, w, h);
        UI.glow(ctx, cx, cy, 300, '#ffc850', 0.25);
        ctx.fillStyle = '#c9a24a';
        ctx.beginPath(); ctx.ellipse(cx, cy + 50, 150, 26, 0, 0, Math.PI); ctx.lineTo(cx - 150, cy + 50); ctx.fill();
        ctx.fillRect(cx - 150, cy + 20, 300, 30);
        for (let i = 0; i < 7; i++) {
          const bx = cx - 126 + i * 42, hh = 36 + (i === 3 ? 26 : Math.abs(3 - i) < 2 ? 14 : 0);
          ctx.fillStyle = '#f2ead6';
          ctx.fillRect(bx - 7, cy + 20 - hh, 14, hh);
          UI.flame(ctx, bx, cy + 18 - hh, 26, 'gold', undying ? 0.4 : t, i);
        }
        break;
      }
      case 'cage': {
        ctx.fillStyle = grad(ctx, y, y + h, ['#05060c', '#0d0f1c', '#05060c']); ctx.fillRect(x, y, w, h);
        const blue = undying && info.page >= 3;
        cage(ctx, cx, cy + 6, 1, t, blue ? 'blue' : 'white', true);
        break;
      }
      case 'reach': {
        ctx.fillStyle = grad(ctx, y, y + h, ['#0a0b14', '#05060a']); ctx.fillRect(x, y, w, h);
        const g = ctx.createLinearGradient(cx, y, cx, y + h);
        g.addColorStop(0, 'rgba(255,240,200,0.18)'); g.addColorStop(1, 'rgba(255,240,200,0)');
        ctx.fillStyle = g;
        ctx.beginPath(); ctx.moveTo(cx - 40, y); ctx.lineTo(cx + 40, y); ctx.lineTo(cx + 120, y + h); ctx.lineTo(cx - 120, y + h); ctx.closePath(); ctx.fill();
        cage(ctx, cx, y + 90, 0.55, t, 'white', true);
        ctx.fillStyle = '#0a0a0e'; ctx.fillRect(x, y + h - 40, w, 40);
        wickling(ctx, cx - 10, y + h - 40, 1.6, t, true);
        break;
      }
      case 'flame': {
        if (undying) {
          ctx.fillStyle = grad(ctx, y, y + h, ['#03040a', '#081020', '#03040a']); ctx.fillRect(x, y, w, h);
          UI.glow(ctx, cx, cy, 260, '#3f8cff', 0.35);
          UI.flame(ctx, cx, cy + 70, 140, 'blue', 0.6, 1, { glow: 1.4 });
        } else {
          ctx.fillStyle = grad(ctx, y, y + h, ['#140c08', '#2a1a10', '#3a2416']); ctx.fillRect(x, y, w, h);
          ctx.fillStyle = '#4a3020'; ctx.beginPath(); ctx.ellipse(cx, y + h + 30, w * 0.7, 90, 0, 0, TAU); ctx.fill();
          ctx.fillStyle = '#f4ecd8'; ctx.fillRect(cx - 9, cy + 20, 18, 46);
          UI.glow(ctx, cx, cy + 6, 160, '#ffb050', 0.35);
          UI.flame(ctx, cx, cy + 18, 40, 'gold', t, 3, { glow: 1.2 });
          risingSparks(ctx, x, y, w, h, t, ['#ffc070', '#ffe0a0'], 22);
        }
        break;
      }
      case 'lake': {
        ctx.fillStyle = grad(ctx, y, y + h * 0.55, ['#0b1a24', '#3a5a68']); ctx.fillRect(x, y, w, h * 0.55);
        ctx.fillStyle = grad(ctx, y + h * 0.55, y + h, ['#9fc8d4', '#2a4450']); ctx.fillRect(x, y + h * 0.55, w, h * 0.45);
        ctx.strokeStyle = 'rgba(255,255,255,0.25)'; ctx.lineWidth = 1;
        for (let i = 0; i < 6; i++) { ctx.beginPath(); ctx.moveTo(x + 60 + i * 90, y + h * 0.62 + i * 14); ctx.lineTo(x + 140 + i * 90, y + h * 0.6 + i * 14); ctx.stroke(); }
        const fx = cx + 70, fy = y + h * 0.58;
        ctx.fillStyle = '#1c2026';
        ctx.beginPath(); ctx.moveTo(fx - 12, fy); ctx.quadraticCurveTo(fx - 10, fy - 26, fx, fy - 28); ctx.quadraticCurveTo(fx + 10, fy - 26, fx + 12, fy); ctx.closePath(); ctx.fill();
        ctx.beginPath(); ctx.ellipse(fx, fy - 30, 18, 5, 0, 0, TAU); ctx.fill(); // wide hat
        const fade = undying ? Math.max(0, 1 - info.pt / 4) : 1;
        if (fade > 0.02) UI.flame(ctx, fx, fy - 34, 14 * fade, 'pale', t, 4);
        else risingSparks(ctx, fx - 10, fy - 120, 20, 90, t, ['#9aa0a8'], 6);
        break;
      }
      case 'gate': {
        ctx.fillStyle = grad(ctx, y, y + h, ['#0c1418', '#1a2830', '#0a0f12']); ctx.fillRect(x, y, w, h);
        ctx.fillStyle = '#05080a';
        ctx.beginPath(); ctx.moveTo(cx - 150, y + h); ctx.lineTo(cx - 150, y + 110); ctx.arc(cx, y + 110, 150, Math.PI, 0); ctx.lineTo(cx + 150, y + h); ctx.lineTo(cx + 110, y + h); ctx.lineTo(cx + 110, y + 112); ctx.arc(cx, y + 112, 110, 0, Math.PI, true); ctx.lineTo(cx - 110, y + h); ctx.closePath(); ctx.fill();
        UI.glow(ctx, cx, y + 150, 140, undying ? '#3f8cff' : '#ffb050', 0.3);
        sable(ctx, cx + 30, y + h - 18, 1.5, t, !undying);
        if (undying) UI.glow(ctx, cx + 30, y + h - 112, 30, '#6fb8ff', 0.5);
        break;
      }
      case 'dark': {
        ctx.fillStyle = '#020204'; ctx.fillRect(x, y, w, h);
        UI.glow(ctx, cx, cy - 20, 60, '#3f8cff', 0.18 + 0.03 * Math.sin(t));
        ctx.strokeStyle = 'rgba(200,170,90,0.18)'; ctx.lineWidth = 1;
        for (let i = 0; i < 5; i++) { ctx.beginPath(); ctx.moveTo(cx - 16 + i * 8, cy - 46); ctx.lineTo(cx - 18 + i * 9, cy + 6); ctx.stroke(); }
        break;
      }
      case 'sparks': {
        ctx.fillStyle = grad(ctx, y, y + h, ['#03050c', '#0a1426', '#04060c']); ctx.fillRect(x, y, w, h);
        UI.glow(ctx, cx, y + 80, 200, '#9fd0ff', 0.3);
        risingSparks(ctx, x, y + 60, w, h - 60, t, ['#bfe8ff', '#ffd890', '#ffffff'], 70, cx, y + 80);
        if (info.page === 0) {
          for (let i = 0; i < 6; i++) {
            const an = t * 0.8 + i * TAU / 6;
            const r = 70 * Math.max(0.15, 1 - info.pt / 6);
            UI.flame(ctx, cx + Math.cos(an) * r, cy + 30 + Math.sin(an) * r * 0.5, 18, 'blue', t, i);
          }
        }
        break;
      }
      case 'hands': {
        ctx.fillStyle = grad(ctx, y, y + h, ['#100a06', '#1e140c', '#0a0604']); ctx.fillRect(x, y, w, h);
        UI.glow(ctx, cx, cy + 10, 160, '#bfe0ff', 0.4);
        UI.flame(ctx, cx, cy + 30, 34, 'blue', t, 9);
        const col = '#3a2a1c';
        hand(ctx, cx - 190, cy + 120, 1.3, 0.6, col);
        hand(ctx, cx + 190, cy + 120, 1.3, -0.6, col);
        hand(ctx, cx - 250, cy - 40, 1.0, 1.2, '#2c2016');
        hand(ctx, cx + 250, cy - 40, 1.0, -1.2, '#2c2016');
        hand(ctx, cx, y + h + 60, 1.4, 0, '#2a1e14');
        break;
      }
      case 'shatter': {
        ctx.fillStyle = grad(ctx, y, y + h, ['#0a0a10', '#1a1810', '#0a0a10']); ctx.fillRect(x, y, w, h);
        const k = Math.min(1, info.pt / 3);
        UI.glow(ctx, cx, cy, 120 + 260 * k, '#ffffff', 0.55);
        UI.glow(ctx, cx, cy, 320, '#ffe6a0', 0.3);
        const rng = new G.RNG(5);
        for (let i = 0; i < 46; i++) {
          const an = rng.range(0, TAU), sp = rng.range(40, 260), r = 20 + sp * (0.25 + k);
          const px = cx + Math.cos(an) * r, py = cy + Math.sin(an) * r * 0.8;
          ctx.save(); ctx.translate(px, py); ctx.rotate(an + k * rng.range(-3, 3));
          if (i % 3 === 0) { ctx.fillStyle = '#d9b860'; ctx.fillRect(-2, -14, 4, 28); } else {
            ctx.fillStyle = 'rgba(200,230,255,0.75)';
            const sz = rng.range(5, 13);
            ctx.beginPath(); ctx.moveTo(0, -sz); ctx.lineTo(sz * 0.6, sz * 0.4); ctx.lineTo(-sz * 0.5, sz * 0.7); ctx.closePath(); ctx.fill();
          }
          ctx.restore();
        }
        break;
      }
      case 'ash': {
        ctx.fillStyle = grad(ctx, y, y + h, ['#1a0e08', '#3a2010', '#5a3418']); ctx.fillRect(x, y, w, h);
        UI.glow(ctx, cx, y + h, 300, '#ff9040', 0.35);
        ctx.fillStyle = '#4a3428';
        ctx.beginPath(); ctx.moveTo(x, y + h);
        for (let i = 0; i <= 20; i++) ctx.lineTo(x + i * w / 20, y + h - 70 - Math.sin(i * 0.9) * 18 - Math.sin(i * 2.3) * 8);
        ctx.lineTo(x + w, y + h); ctx.closePath(); ctx.fill();
        for (let i = 0; i < 5; i++) {
          const bx = cx - 160 + i * 80, by = y + h - 78 - Math.sin(i * 1.7) * 10;
          ctx.fillStyle = '#efe6d0'; ctx.fillRect(bx - 5, by - 22, 10, 22);
          UI.flame(ctx, bx, by - 22, 13 + (i % 2) * 3, 'gold', t, i);
        }
        risingSparks(ctx, x, y, w, h - 60, t, ['#ffb060', '#ffd890'], 40);
        break;
      }
      default: {
        ctx.fillStyle = '#05060a'; ctx.fillRect(x, y, w, h);
        UI.flame(ctx, cx, cy + 30, 50, 'blue', t, 1);
      }
    }
  }
  UI.drawEndingScene = drawScene;

  // ================================================================== ending screen
  /** Ending sequence: 'undying' | 'gutterlight' → pages → credits → The End → onDone. */
  UI.playEnding = function (endingId, onDone) {
    UI.closeAll(false);
    const E = (G.Text && G.Text.endings && G.Text.endings[endingId]) || {};
    const pages = (E.pages || ['...']).map(String);
    const scenes = E.scenes || [];
    const credits = (UI.textObj('credits') || ['GUTTERLIGHT']).map(String);
    const gold = endingId === 'gutterlight';
    // credits rows: style per line (title, section headings = short line after a blank, closing line), and the
    // total scroll height — computed up front so the scroll can end without depending on draw()
    const creditRows = credits.map((line, i) => {
      const prevBlank = i > 0 && credits[i - 1] === '';
      const nextLine = credits[i + 1];
      const heading = i > 0 && prevBlank && nextLine && nextLine !== '' && line.length < 24 && line.indexOf(',') < 0 && i < credits.length - 1;
      let size = 23, style = '', color = C.cream, gap = 40;
      if (i === 0) { size = 56; gap = 84; color = C.creamHi; } else if (line === '') { gap = 30; } else if (heading) { size = 21; style = 'italic'; color = C.gold; gap = 42; } else if (i === credits.length - 1) { size = 26; style = 'italic'; color = gold ? '#f4e3b0' : C.creamHi; gap = 60; }
      return { line, size, style, color, gap };
    });
    const creditsH = creditRows.reduce((acc, r) => acc + r.gap, 0);
    UI.music('ending');
    // the region's ambience (the sanctum's) must not play under the ending
    if (G.Audio && typeof G.Audio.ambience === 'function') UI.safe(() => G.Audio.ambience(null, { fade: 3 }), 'ending ambience');
    // "The End" stays up until the ending track has resolved (its last section is the theme in D major, the
    // final chord rings into the tail) unless the player moves on; measured in audio time when audio runs
    const trk = G.Audio && typeof G.Audio.getTrack === 'function' ? G.Audio.getTrack('ending') : null;
    const musicEnd = trk && trk.intro && trk.body ? (trk.intro.len || 0) + (trk.body.len || 0) + Math.min(4, trk.tail || 0) : 0;
    const audioNow = () => {
      const st = G.Audio && typeof G.Audio.state === 'function' ? G.Audio.state() : null;
      if (!st || !st.ready || st.ctxState !== 'running' || st.muted) return null;
      const v = st.volumes || {};
      if (v.master === 0 || v.music === 0) return null;
      return st.time;
    };
    const audio0 = audioNow();
    const sparks = new UI.Particles(120);
    return UI.push({
      name: 'ending', fadeIn: 1.2, fadeOut: 1.4, hideHud: true, onClose: onDone,
      phase: 'title', pt: 0, page: 0, pageK: 0, sceneOut: false, scroll: 0, creditsH, endT: 0, skipArm: 0, elapsed: 0,
      /** Seconds of the ending track played so far, or null when it is not audible (muted / no audio). */
      musicPos() {
        if (!musicEnd) return null;
        const now = audioNow();
        if (now == null) return null;
        return audio0 != null ? now - audio0 : this.elapsed;
      },
      update(dt, active) {
        this.pt += dt;
        this.elapsed += dt;
        if (this.skipArm > 0) this.skipArm = Math.max(0, this.skipArm - dt);
        if (Math.random() < dt * 10) sparks.spawn({ x: Math.random() * W, y: H + 6, vx: (Math.random() - 0.5) * 10, vy: -18 - Math.random() * 24, life: 10, size: 1 + Math.random(), color: gold ? (Math.random() < 0.5 ? '#ffc070' : '#ffe2a8') : '#7cb8ff', alpha: 0.5, glow: Math.random() < 0.3, wobble: 8 });
        sparks.update(dt);
        // Back/Pause skips; keyboard X (Back + Attack) only advances. The ending can't be replayed, so skipping
        // the pages or credits takes a second press within 3 s (the hint turns into a pulsing "Skip?")
        const skipPress = active && !!(UI.pressed('pause') | UI.pressedBack());
        const adv = active && UI.pressedAny(UI.ADVANCE);
        let skip = false;
        if (skipPress) {
          if (this.phase === 'end' || this.phase === 'done' || this.skipArm > 0) { skip = true; this.skipArm = 0; } else { this.skipArm = 3; UI.sfx('menu_move'); }
        }
        switch (this.phase) {
          case 'title':
            if (skip) this.next('credits');
            else if (this.pt > 4.5 || (adv && this.pt > 1.2)) this.next('pages');
            break;
          case 'pages': {
            const hold = readTime(pages[this.page]);
            if (this.sub === 'in') { if (this.pt >= 1.4 || adv) { this.sub = 'hold'; this.pt = 0; } } else if (this.sub === 'hold') {
              if (adv || this.pt >= hold + 3) { this.sub = 'out'; this.pt = 0; }
            } else if (this.sub === 'out' && this.pt >= 1.0) {
              if (this.page >= pages.length - 1) this.next('credits');
              else { this.page++; this.sub = 'in'; this.pt = 0; }
            }
            if (skip) this.next('credits');
            break;
          }
          case 'credits': {
            const speed = (active && G.input && (G.input.down('confirm') || G.input.down('jump'))) ? 170 : 42;
            this.scroll += dt * speed;
            if (this.scroll > this.creditsH + H * 0.5) this.next('end');
            if (skip) this.next('end');
            break;
          }
          case 'end': {
            const mp = this.musicPos();
            // nothing audible to wait for, or the track has ended; game time bounds the wait in case the audio
            // clock stalls or runs behind (e.g. a stepped test harness)
            const resolved = mp == null || mp >= musicEnd || this.elapsed >= musicEnd + 15;
            if ((adv && this.pt > 1.5) || (this.pt > 7 && resolved) || skip) { this.phase = 'done'; UI.close(this); }
            break;
          }
        }
      },
      next(phase) { this.phase = phase; this.pt = 0; this.skipArm = 0; if (phase === 'pages') { this.sub = 'in'; this.page = 0; } },
      draw(ctx, a) { drawEnding(ctx, this, a); },
    });

    function drawEnding(ctx, s, a) {
      const t = UI.t;
      ctx.fillStyle = '#000';
      ctx.fillRect(0, 0, W, H);
      sparks.draw(ctx, 0.6);
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      if (s.phase === 'title') {
        const k = UI.envelope(s.pt, 4.5, 1.4, 1.0);
        ctx.globalAlpha = a * k;
        ctx.font = UI.font(54);
        ctx.fillStyle = gold ? '#f4e3b0' : C.creamHi;
        UI.spacedText(ctx, E.title || '', W / 2, H * 0.45, 5, 'center');
        UI.flourish(ctx, W / 2, H * 0.45 + 50, 220, { alpha: 0.7, color: gold ? C.gold : C.cream });
      } else if (s.phase === 'pages') {
        const scene = scenes[s.page] || 'flame';
        const nextScene = scenes[s.page + 1];
        const fin = s.sub === 'in' ? UI.ease.inOutSine(Math.min(1, s.pt / 1.4)) : s.sub === 'hold' ? 1 : UI.ease.inOutSine(Math.max(0, 1 - s.pt / 1.0));
        const prevScene = s.page > 0 ? scenes[s.page - 1] : null;
        const sceneK = (s.sub === 'in' && prevScene === scene) || (s.sub === 'out' && nextScene === scene && s.page < pages.length - 1) ? 1 : fin;
        const fx = 300, fy = 46, fw = 680, fh = 370;
        ctx.save();
        ctx.globalAlpha = a * sceneK;
        frameClip(ctx, fx, fy, fw, fh);
        ctx.clip();
        drawScene(ctx, scene, fx, fy, fw, fh, t, { ending: endingId, page: s.page, pt: s.sub === 'in' ? s.pt : s.sub === 'hold' ? 1.4 + s.pt : 99 });
        const vg = ctx.createRadialGradient(fx + fw / 2, fy + fh / 2, fh * 0.35, fx + fw / 2, fy + fh / 2, fw * 0.62);
        vg.addColorStop(0, 'rgba(0,0,0,0)'); vg.addColorStop(1, 'rgba(0,0,0,0.75)');
        ctx.fillStyle = vg;
        ctx.fillRect(fx, fy, fw, fh);
        ctx.restore();
        ctx.save();
        ctx.globalAlpha = a * sceneK * 0.8;
        ctx.strokeStyle = gold ? '#cdb070' : '#b9b09a';
        ctx.lineWidth = 1.5;
        frameClip(ctx, fx - 6, fy - 6, fw + 12, fh + 12);
        ctx.stroke();
        // small ornament breaking the frame's base line
        ctx.fillStyle = '#000';
        ctx.fillRect(W / 2 - 34, fy + fh + 2, 68, 8);
        UI.flourish(ctx, W / 2, fy + fh + 6, 30, { alpha: 0.9, color: gold ? C.gold : C.cream });
        ctx.restore();
        ctx.globalAlpha = a * fin;
        ctx.font = UI.font(26, 'italic');
        ctx.fillStyle = C.cream;
        const lines = UI.wrapBalanced(ctx, pages[s.page] || '', 900);
        const lh = 38;
        const y0 = 500 + Math.max(0, (3 - lines.length) * lh * 0.5);
        for (let i = 0; i < lines.length; i++) ctx.fillText(lines[i], W / 2, y0 + i * lh);
        ctx.globalAlpha = a * 0.5;
        dots(ctx, W / 2, 668, pages.length, s.page);
      } else if (s.phase === 'credits') {
        ctx.globalAlpha = a * Math.min(1, s.pt / 1.5);
        let y = H + 40 - s.scroll;
        for (let i = 0; i < creditRows.length; i++) {
          const r = creditRows[i];
          if (r.line && y > -60 && y < H + 60) {
            ctx.font = UI.font(r.size, r.style);
            ctx.fillStyle = r.color;
            if (i === 0) { UI.spacedText(ctx, r.line, W / 2, y, 8, 'center'); UI.flourish(ctx, W / 2, y + 46, 200, { alpha: 0.6 }); } else ctx.fillText(r.line, W / 2, y);
          }
          y += r.gap;
        }
      } else if (s.phase === 'end' || s.phase === 'done') {
        const k = Math.min(1, s.pt / 1.5);
        ctx.globalAlpha = a * k;
        UI.flame(ctx, W / 2, H * 0.42, 34, gold ? 'gold' : 'blue', t, 2);
        ctx.font = UI.font(44, 'italic');
        ctx.fillStyle = C.creamHi;
        UI.spacedText(ctx, UI.text('ui.theEnd', 'The End'), W / 2, H * 0.52, 4, 'center');
        UI.flourish(ctx, W / 2, H * 0.52 + 44, 160, { alpha: 0.6 });
      }
      ctx.globalAlpha = a * 0.35;
      if (s.phase !== 'end' && s.phase !== 'done') {
        if (s.skipArm > 0) { ctx.globalAlpha = a * Math.min(1, s.skipArm / 0.5); UI.hints(ctx, [['cancel', UI.text('ui.skip', 'Skip') + '?']], W - 40, H - 30, 'right', { alpha: 0.75 + 0.25 * Math.sin(UI.t * 6), size: 15, force: true }); }   // state feedback: shown even with hints off
        else UI.hints(ctx, [['cancel', UI.text('ui.skip', 'Skip')]], W - 40, H - 30, 'right', { alpha: 0.7, size: 15 });
      } else if (s.phase === 'end' && s.pt > 7) {
        ctx.globalAlpha = a * Math.min(1, (s.pt - 7) / 1.5) * 0.35;
        UI.hints(ctx, [['confirm', UI.text('ui.continue', 'Continue')]], W - 40, H - 30, 'right', { alpha: 0.7, size: 15, force: true });   // the screen waits here
      }
    }
    function dots(ctx, cx, y, n, cur) {
      for (let i = 0; i < n; i++) {
        ctx.fillStyle = i === cur ? C.cream : 'rgba(236,228,207,0.3)';
        ctx.beginPath(); ctx.arc(cx - (n - 1) * 7 + i * 14, y, i === cur ? 3 : 2, 0, TAU); ctx.fill();
      }
    }
  };
})();
