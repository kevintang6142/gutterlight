// src/ui/dialogue.js — NPC dialogue (speaker name, typewriter text with 'dialogue_blip', page dots, advance with
// confirm/attack/jump), lore tablets (carved stone slab, engraved title, page by page) and Chandler's Spark
// memories (dreamy full-screen: drifting embers, italic text, slow fades). Input tokens ({jump} …) render as key caps.
(function () {
  'use strict';
  const G = globalThis.G;
  const UI = G.UI;
  const C = UI.C;
  const W = UI.W, H = UI.H;
  const TAU = Math.PI * 2;

  const CPS = 50;          // typewriter characters per second
  const BOX_W = 940, TEXT_SIZE = 25;

  function pagesOf(lines) {
    if (Array.isArray(lines)) return lines.map((l) => String(l == null ? '' : l));
    if (typeof lines === 'string') return [lines];
    return [];
  }
  const isStage = (page) => /^\s*\(/.test(page);

  // count of visible "characters" in a rich layout (a key cap counts as one)
  function layoutChars(lay) {
    let n = 0;
    for (const ln of lay.lines) for (const p of ln.parts) n += p.key !== undefined ? 1 : p.text.length;
    return n;
  }
  /** Draw the first `n` characters of a rich layout, lines centered on x using their full widths. */
  function drawRichPartial(ctx, lay, x, y, lineH, n, color, align) {
    const font = ctx.font;
    let left = n;
    ctx.textBaseline = 'alphabetic';
    for (let i = 0; i < lay.lines.length && left > 0; i++) {
      const ln = lay.lines[i];
      let lx = align === 'left' ? x : x - ln.w / 2;
      const ly = y + i * lineH;
      for (const p of ln.parts) {
        if (left <= 0) break;
        if (p.key !== undefined) {
          UI.keycap(ctx, p.key, lx + p.w / 2, ly - lay.size * 0.34, lay.size * 1.08, { color });
          ctx.font = font;
          left -= 1;
        } else {
          const s = left >= p.text.length ? p.text : p.text.slice(0, left);
          ctx.textAlign = 'left';
          ctx.fillStyle = color;
          ctx.fillText(s, lx, ly);
          left -= p.text.length;
        }
        lx += p.w;
      }
    }
  }
  UI.drawRichPartial = drawRichPartial;
  UI.layoutChars = layoutChars;

  function pageDots(ctx, cx, y, n, cur, color) {
    if (n <= 1) return;
    for (let i = 0; i < n; i++) {
      const x = cx - (n - 1) * 7 + i * 14;
      ctx.fillStyle = i === cur ? (color || C.cream) : 'rgba(236,228,207,0.22)';
      ctx.beginPath();
      if (i === cur) { ctx.moveTo(x, y - 4); ctx.lineTo(x + 4, y); ctx.lineTo(x, y + 4); ctx.lineTo(x - 4, y); ctx.closePath(); } else ctx.arc(x, y, 2.2, 0, TAU);
      ctx.fill();
    }
  }
  function advanceMark(ctx, x, y, t, a) {
    const pa = ctx.globalAlpha;
    ctx.globalAlpha = pa * a;
    const bob = Math.sin(t * 4) * 2.5;
    ctx.fillStyle = C.cream;
    ctx.beginPath();
    ctx.moveTo(x - 6, y - 3 + bob); ctx.lineTo(x + 6, y - 3 + bob); ctx.lineTo(x, y + 4 + bob); ctx.closePath();
    ctx.fill();
    UI.glow(ctx, x, y + bob, 14, '#79c4ff', 0.4);
    ctx.globalAlpha = pa;
  }

  // ------------------------------------------------------------------ dialogue
  const G_OPEN = 0.45, G_PAGE = 0.25, G_DONE = 0.4;   // dialogue input guards (s): after open, after a page turn, page fully shown
  /**
   * NPC dialogue. opts: {name, lines (pages), onDone, voice: {pitch}}. Blocking; returns the screen.
   */
  UI.dialogue = function (opts) {
    const o = opts || {};
    const pages = pagesOf(o.lines);
    const pitch = (o.voice && o.voice.pitch) || 1;
    return UI.push({
      name: 'dialogue', fadeIn: 0.2, fadeOut: 0.18, hideHud: true,
      page: 0, shown: 0, total: 0, blipAcc: 0, layout: null, layoutPage: -1, pageT: 0, doneT: 0,
      onClose: o.onDone,
      open() { if (!pages.length) UI.close(this); },
      // (re)build the wrapped layout of the current page; called from update too, so `total` is known before the
      // first draw (an early press must complete the page, not skip it)
      relayout(ctx) {
        const page = pages[this.page] || '';
        const dev = G.input && G.input.lastDevice;
        if (this.layoutPage === this.page && this.layout && this.layout._dev === dev) return;
        const c = ctx || UI.measureCtx();
        const f = c.font;
        c.font = UI.font(TEXT_SIZE, isStage(page) ? 'italic' : '');
        this.layout = UI.layoutRich(c, page, BOX_W - 120, TEXT_SIZE);
        this.layout._dev = dev;
        this.total = layoutChars(this.layout);
        this.layoutPage = this.page;
        c.font = f;
      },
      update(dt, active) {
        if (!pages.length) return;
        this.relayout(null);
        if (this.shown < this.total) {
          const before = Math.floor(this.shown);
          this.shown = Math.min(this.total, this.shown + dt * CPS);
          const now = Math.floor(this.shown);
          if (now > before) {
            this.blipAcc += now - before;
            if (this.blipAcc >= 3) { this.blipAcc = 0; UI.sfx('dialogue_blip', { vol: 0.55, pitch: pitch * (0.92 + Math.random() * 0.16) }); }
          }
        }
        this.pageT += dt;
        if (this.shown >= this.total) this.doneT += dt;
        if (!active || this.state === 'in' && this.alpha < 0.6) return;
        // input guard: boss lines open mid-fight while Attack is likely still being mashed, so presses are ignored
        // for a moment after the box opens / a page turns (G_OPEN, G_PAGE), and a finished page must stay up for
        // G_DONE before a press turns it (cf. lore's pageT, itemGet's delay)
        if (UI.pressedAny(UI.ADVANCE)) {
          if (this.t < G_OPEN || this.pageT < G_PAGE) return;
          if (this.shown < this.total) { this.shown = this.total; return; }
          if (this.doneT < G_DONE) return;
          if (this.page < pages.length - 1) { this.page++; this.shown = 0; this.pageT = 0; this.doneT = 0; this.layoutPage = -1; UI.sfx('menu_move', { vol: 0.5 }); } else UI.close(this);
        }
      },
      draw(ctx, a) {
        if (!pages.length) return;
        const bw = BOX_W, bx = (W - bw) / 2, by = 48, bh = 214;
        const t = UI.t;
        // soft dark backing (HK-like: a dark wash rather than a hard box)
        const g = ctx.createLinearGradient(0, by - 30, 0, by + bh + 40);
        g.addColorStop(0, 'rgba(0,0,0,0)'); g.addColorStop(0.18, 'rgba(3,4,8,0.82)'); g.addColorStop(0.82, 'rgba(3,4,8,0.82)'); g.addColorStop(1, 'rgba(0,0,0,0)');
        ctx.fillStyle = g;
        ctx.fillRect(bx - 80, by - 30, bw + 160, bh + 70);
        UI.flourish(ctx, W / 2, by + 6, 300, { alpha: 0.5 });
        UI.flourish(ctx, W / 2, by + bh + 4, 300, { alpha: 0.5 });
        let textTop = by + 70;
        if (o.name) {
          ctx.font = UI.font(23);
          ctx.fillStyle = C.gold;
          ctx.textAlign = 'center';
          ctx.textBaseline = 'middle';
          UI.spacedText(ctx, String(o.name), W / 2, by + 36, 2.5, 'center');
        } else textTop = by + 58;
        const page = pages[this.page] || '';
        const stage = isStage(page);
        this.relayout(ctx);
        ctx.font = UI.font(TEXT_SIZE, stage ? 'italic' : '');
        const lines = this.layout.lines.length;
        const lineH = 35;
        const y0 = textTop + 18 + Math.max(0, (3 - lines) * lineH * 0.5);
        drawRichPartial(ctx, this.layout, W / 2, y0, lineH, Math.floor(this.shown), stage ? C.creamDim : C.cream);
        pageDots(ctx, W / 2, by + bh - 14, pages.length, this.page);
        if (this.shown >= this.total) advanceMark(ctx, bx + bw - 40, by + bh - 18, t, 1);
      },
    });
  };

  // ------------------------------------------------------------------ lore tablets
  const stoneCache = new Map();
  function stoneSlab(w, h) {
    const key = w + 'x' + h;
    let c = stoneCache.get(key);
    if (c) return c;
    const { canvas, ctx } = G.U.makeCanvas(w + 20, h + 20);
    const o = 10;
    // shadow
    ctx.fillStyle = 'rgba(0,0,0,0.55)';
    UI.roundRect(ctx, o + 4, o + 8, w, h, 10); ctx.fill();
    // base
    let g = ctx.createLinearGradient(0, o, 0, o + h);
    g.addColorStop(0, '#4a463f'); g.addColorStop(0.5, '#3a3732'); g.addColorStop(1, '#2b2925');
    ctx.fillStyle = g;
    UI.roundRect(ctx, o, o, w, h, 10); ctx.fill();
    // speckle / grain
    const rng = new G.RNG(w * 31 + h);
    for (let i = 0; i < (w * h) / 90; i++) {
      const x = o + rng.range(4, w - 4), y = o + rng.range(4, h - 4);
      ctx.fillStyle = rng.chance(0.5) ? 'rgba(255,255,255,0.045)' : 'rgba(0,0,0,0.09)';
      ctx.fillRect(x, y, rng.range(1, 3), rng.range(1, 2.5));
    }
    // a few cracks
    ctx.strokeStyle = 'rgba(0,0,0,0.35)';
    ctx.lineWidth = 1;
    for (let k = 0; k < 3; k++) {
      let x = o + rng.range(20, w - 20), y = rng.chance(0.5) ? o + 2 : o + h - 2;
      ctx.beginPath(); ctx.moveTo(x, y);
      for (let s = 0; s < 5; s++) { x += rng.range(-14, 14); y += (y < o + h / 2 ? 1 : -1) * rng.range(6, 14); ctx.lineTo(x, y); }
      ctx.stroke();
    }
    // bevel
    ctx.strokeStyle = 'rgba(255,240,210,0.16)';
    ctx.lineWidth = 2;
    UI.roundRect(ctx, o + 2, o + 2, w - 4, h - 4, 9); ctx.stroke();
    // chiselled inner border
    ctx.strokeStyle = 'rgba(0,0,0,0.5)';
    ctx.lineWidth = 2;
    UI.roundRect(ctx, o + 16, o + 16, w - 32, h - 32, 4); ctx.stroke();
    ctx.strokeStyle = 'rgba(255,240,210,0.12)';
    ctx.lineWidth = 1;
    UI.roundRect(ctx, o + 18, o + 18, w - 32, h - 32, 4); ctx.stroke();
    // corner studs
    for (const [x, y] of [[o + 30, o + 30], [o + w - 30, o + 30], [o + 30, o + h - 30], [o + w - 30, o + h - 30]]) {
      g = ctx.createRadialGradient(x - 1, y - 1, 0, x, y, 5);
      g.addColorStop(0, '#77706a'); g.addColorStop(1, '#2a2622');
      ctx.fillStyle = g;
      ctx.beginPath(); ctx.arc(x, y, 4.5, 0, TAU); ctx.fill();
    }
    // moss of ash along the bottom
    g = ctx.createLinearGradient(0, o + h - 40, 0, o + h);
    g.addColorStop(0, 'rgba(0,0,0,0)'); g.addColorStop(1, 'rgba(0,0,0,0.35)');
    ctx.fillStyle = g;
    UI.roundRect(ctx, o, o, w, h, 10); ctx.fill();
    if (stoneCache.size > 8) stoneCache.delete(stoneCache.keys().next().value);
    stoneCache.set(key, canvas);
    return canvas;
  }
  /** Engraved text: dark cut with a light lower lip. */
  function engraved(ctx, text, x, y, fill) {
    ctx.fillStyle = 'rgba(255,238,205,0.16)';
    ctx.fillText(text, x, y + 1.2);
    ctx.fillStyle = 'rgba(0,0,0,0.55)';
    ctx.fillText(text, x, y - 0.8);
    ctx.fillStyle = fill;
    ctx.fillText(text, x, y);
  }

  /** Lore tablet from G.Text.lore[loreId] ({title, lines}). Blocking. */
  UI.lore = function (loreId, onDone) {
    const L = (G.Text && G.Text.lore && G.Text.lore[loreId]) || null;
    if (!L) G.warnOnce && G.warnOnce('lore:' + loreId, 'UI.lore: unknown lore id "' + loreId + '"');
    const title = (L && L.title) || '';
    const pages = pagesOf(L ? L.lines : ['(The carving is too worn to read.)']);
    return UI.push({
      name: 'lore', fadeIn: 0.28, fadeOut: 0.22, page: 0, pageT: 0, onClose: onDone,
      update(dt, active) {
        this.pageT += dt;
        if (!active || this.alpha < 0.6) return;
        if (UI.pressedAny(UI.ADVANCE) || UI.pressed('cancel')) {
          if (this.pageT < 0.3) { this.pageT = 0.3; return; }
          if (this.page < pages.length - 1) { this.page++; this.pageT = 0; UI.sfx('menu_move', { vol: 0.5, pitch: 0.8 }); } else UI.close(this);
        }
      },
      draw(ctx, a) {
        UI.veil(ctx, 0.55);
        const w = 820, h = 330, x = (W - w) / 2, y = 120;
        const rise = (1 - UI.ease.outCubic(Math.min(1, this.t / 0.35))) * 14;
        ctx.drawImage(stoneSlab(w, h), x - 10, y - 10 + rise);
        ctx.textAlign = 'center';
        ctx.textBaseline = 'alphabetic';
        if (title) {
          ctx.font = UI.font(25, 'italic');
          engraved(ctx, title, W / 2, y + 70 + rise, '#d9cdb0');
          UI.flourish(ctx, W / 2, y + 92 + rise, 150, { alpha: 0.4, color: '#d9cdb0' });
        }
        const page = pages[this.page] || '';
        const stage = isStage(page);
        const k = Math.min(1, this.pageT / 0.35);
        const pa = ctx.globalAlpha;
        ctx.globalAlpha = pa * k;
        const size = 24;
        ctx.font = UI.font(size, stage ? 'italic' : '');
        const lay = UI.layoutRich(ctx, page, w - 150, size);
        const lineH = 34;
        const top = y + (title ? 150 : 120) + Math.max(0, (4 - lay.lines.length) * lineH * 0.5) - 10;
        // engraved rich text: shadow pass then fill pass
        ctx.save();
        ctx.translate(0, -0.8);
        drawRichPartial(ctx, lay, W / 2, top + rise, lineH, 1e9, 'rgba(0,0,0,0.55)');
        ctx.restore();
        drawRichPartial(ctx, lay, W / 2, top + rise, lineH, 1e9, stage ? '#b4aa92' : '#e4dac2');
        ctx.globalAlpha = pa;
        pageDots(ctx, W / 2, y + h - 34 + rise, pages.length, this.page, '#e4dac2');
        if (this.pageT > 0.35) advanceMark(ctx, x + w - 48, y + h - 36 + rise, UI.t, 0.8);
      },
    });
  };

  // ------------------------------------------------------------------ spark memories
  /** Chandler's Spark memory (G.Text.sparks[id] = {title, lines}). Dreamy, slow; blocking. */
  UI.sparkMemory = function (sparkId, onDone) {
    const S = (G.Text && G.Text.sparks && G.Text.sparks[sparkId]) || null;
    if (!S) G.warnOnce && G.warnOnce('spark:' + sparkId, 'UI.sparkMemory: unknown spark id "' + sparkId + '"');
    const pages = pagesOf(S ? S.lines : ['...']);
    const embers = new UI.Particles(140);
    UI.stinger('spark');
    UI.sfx('item', { vol: 0.6 });
    return UI.push({
      name: 'sparkMemory', fadeIn: 1.1, fadeOut: 1.0, hideHud: true, page: 0, pageT: 0, out: 0, onClose: onDone,
      update(dt, active) {
        if (Math.random() < dt * 26) {
          embers.spawn({ x: Math.random() * W, y: H + 10, vx: (Math.random() - 0.5) * 16, vy: -22 - Math.random() * 38,
            life: 6 + Math.random() * 6, size: 0.8 + Math.random() * 1.8, color: Math.random() < 0.3 ? '#ffffff' : '#7cc4ff',
            alpha: 0.4 + Math.random() * 0.5, glow: Math.random() < 0.35, wobble: 18 });
        }
        embers.update(dt);
        this.pageT += dt;
        if (this.out > 0) {
          this.out -= dt;
          if (this.out <= 0) { this.page++; this.pageT = 0; }
          return;
        }
        if (!active || this.alpha < 0.7) return;
        if (UI.pressedAny(UI.ADVANCE) || UI.pressed('cancel')) {
          if (this.pageT < 1.0) { this.pageT = Math.max(this.pageT, 1.0); return; }
          if (this.page < pages.length - 1) { this.out = 0.6; UI.sfx('menu_move', { vol: 0.35, pitch: 0.6 }); } else UI.close(this);
        }
      },
      draw(ctx, a) {
        const t = UI.t;
        const g = ctx.createRadialGradient(W / 2, H / 2, 40, W / 2, H / 2, W * 0.75);
        g.addColorStop(0, 'rgba(10,22,48,0.94)'); g.addColorStop(1, 'rgba(1,2,6,0.98)');
        ctx.fillStyle = g;
        ctx.fillRect(0, 0, W, H);
        UI.glow(ctx, W / 2, H * 0.5, 420 + Math.sin(t * 0.7) * 30, '#2a64d8', 0.12);
        embers.draw(ctx);
        // header: the spark and its title
        UI.flame(ctx, W / 2, 132, 30, 'blue', t, 11, { glow: 1.1 });
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.font = UI.font(17, 'italic');
        ctx.fillStyle = 'rgba(191,232,255,0.7)';
        const n = G.game && G.game.progress ? (G.game.progress.sparks || []).length : 0;
        const total = (G.Items && G.Items.totals && G.Items.totals.sparks) || 6;
        UI.spacedText(ctx, UI.text('items.spark.name', "Chandler's Spark") + '   ' + n + ' / ' + total, W / 2, 166, 1.5, 'center');
        if (S && S.title) {
          ctx.font = UI.font(32, 'italic');
          ctx.fillStyle = '#d8ecff';
          ctx.fillText(S.title, W / 2, 214);
          UI.flourish(ctx, W / 2, 246, 160, { alpha: 0.45, color: '#bfe0ff' });
        }
        // page text with slow fades
        const page = pages[Math.min(this.page, pages.length - 1)] || '';
        let k = Math.min(1, this.pageT / 1.2);
        if (this.out > 0) k = Math.max(0, this.out / 0.6);
        const pa = ctx.globalAlpha;
        ctx.globalAlpha = pa * UI.ease.inOutSine(k);
        ctx.font = UI.font(28, 'italic');
        const lay = UI.layoutRich(ctx, page, 860, 28);
        const lineH = 42;
        const y0 = H * 0.56 - (lay.lines.length - 1) * lineH / 2 + (1 - k) * 8;
        drawRichPartial(ctx, lay, W / 2, y0, lineH, 1e9, '#e6f2ff');
        ctx.globalAlpha = pa;
        pageDots(ctx, W / 2, H - 92, pages.length, Math.min(this.page, pages.length - 1), '#bfe0ff');
        if (this.pageT > 1.2 && this.out <= 0) advanceMark(ctx, W / 2, H - 60, t, 0.6);
      },
    });
  };
})();
