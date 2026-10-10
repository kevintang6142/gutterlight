// src/ui/cards.js — presentation cards and small overlays:
//   areaCard (big centered name + subtitle + ornament on first visit; small top-left name on revisits),
//   bossCard (name + subtitle in the lower third), abilityGet (full-screen, waits for confirm),
//   itemGet (medium card, waits for confirm), toast (small, bottom-right), prompt (world-space label with an
//   up-arrow glyph above an interactable; call every step while relevant).
(function () {
  'use strict';
  const G = globalThis.G;
  const UI = G.UI;
  const C = UI.C;
  const W = UI.W, H = UI.H;
  const TAU = Math.PI * 2;

  // ================================================================== non-blocking layers
  let area = null;      // {big, name, sub, t, dur, delay}
  let boss = null;      // {name, sub, t, dur}
  const toasts = [];    // {text, t, dur}
  const prompts = new Map(); // key → {x, y, text, alpha, last}

  /** Clear all non-blocking overlays (title, quit). */
  UI.clearOverlays = function () { area = null; boss = null; toasts.length = 0; prompts.clear(); };

  /** Area title card. big = first visit (large, centered), else a small top-left name. */
  UI.areaCard = function (regionId, big) {
    const name = UI.regionName(regionId);
    if (!name) return;
    const sub = UI.text('areas.' + regionId + '.sub', '');
    area = big
      ? { big: true, name, sub, t: 0, dur: 4.2, delay: 0.45 }
      : { big: false, name, sub, t: 0, dur: 2.6, delay: 0.3 };
    if (big) area.sfxPending = true;
  };
  /** Boss title card (lower third). Uses G.Text.bosses[id] = {name, sub}. */
  UI.bossCard = function (bossId) {
    const b = (G.Text && G.Text.bosses && G.Text.bosses[bossId]) || {};
    boss = { name: b.name || bossId, sub: b.sub || '', t: 0, dur: 4.2 };
    UI.sfx('boss_roar', { vol: 0.35 });
  };
  /** Small non-blocking message, bottom-right. Action tokens ({down}, {jump}, ...) show the current key labels. */
  UI.toast = function (text) {
    if (!text) return;
    text = UI.tokens ? UI.tokens(String(text)) : String(text);
    if (toasts.length && toasts[toasts.length - 1].text === text && toasts[toasts.length - 1].t < 1) { toasts[toasts.length - 1].t = 0.25; return; }
    toasts.push({ text: String(text), t: 0, dur: 3.4 });
    while (toasts.length > 4) toasts.shift();
  };
  /** World-space interaction prompt (x = center, y = bottom of the label, room px). Call every step while shown. */
  UI.prompt = function (x, y, text) {
    const key = String(text || '');
    let p = prompts.get(key);
    if (!p) { p = { x, y, text: key, alpha: 0, last: 0 }; prompts.set(key, p); }
    p.x = x; p.y = y; p.last = UI.step || 0;
  };

  function updateLayers(dt) {
    // area/boss cards are hidden under any open blocking screen (inventory, shop, map, dialogue, but also Pause,
    // Options, Controls, item cards...) and wait there rather than spending their time unseen; toasts and
    // prompts keep their own rules
    const covered = UI.blockCover() > 0;
    if (area && !covered) {
      if (area.delay > 0) area.delay -= dt;
      else {
        if (area.sfxPending) { area.sfxPending = false; UI.sfx('area_card'); }
        area.t += dt;
        if (area.t >= area.dur) area = null;
      }
    }
    if (boss && !covered) { boss.t += dt; if (boss.t >= boss.dur) boss = null; }
    for (let i = toasts.length - 1; i >= 0; i--) { toasts[i].t += dt; if (toasts[i].t >= toasts[i].dur) toasts.splice(i, 1); }
    const step = UI.step || 0;
    for (const [k, p] of prompts) {
      const live = p.last >= step - 1;
      p.alpha = live ? Math.min(1, p.alpha + dt * 5) : Math.max(0, p.alpha - dt * 6);
      if (!live && p.alpha <= 0) prompts.delete(k);
    }
  }
  const playing = () => G.game && (G.game.mode === 'play' || G.game.mode === 'transition' || G.game.mode === 'dead');

  function darkBehind(ctx, x, y, rx, ry, a) {
    ctx.save();
    ctx.translate(x, y);
    ctx.scale(rx / 100, ry / 100);
    const g = ctx.createRadialGradient(0, 0, 0, 0, 0, 100);
    g.addColorStop(0, 'rgba(0,0,0,' + (0.55 * a).toFixed(3) + ')'); g.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = g;
    ctx.fillRect(-100, -100, 200, 200);
    ctx.restore();
  }

  function drawArea(ctx) {
    if (!area || area.delay > 0 || !playing()) return;
    const vis = 1 - UI.blockCover();
    if (vis <= 0) return;
    if (area.big) {
      const k = UI.envelope(area.t, area.dur, 1.0, 1.0) * vis;
      if (k <= 0) return;
      const y = H * 0.34;
      ctx.globalAlpha = k;
      darkBehind(ctx, W / 2, y, 560, 130, 1.2);
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.font = UI.font(22, 'italic');
      ctx.fillStyle = C.creamDim;
      if (area.sub) ctx.fillText(area.sub, W / 2, y - 52);
      ctx.font = UI.font(60);
      ctx.fillStyle = C.creamHi;
      const rise = (1 - UI.ease.outCubic(UI.clamp01(area.t / 1.4))) * 10;
      UI.spacedText(ctx, area.name, W / 2, y + rise, 5, 'center');
      const hw = 120 + 160 * UI.ease.outCubic(UI.clamp01(area.t / 1.6));
      UI.flourish(ctx, W / 2, y + 48, hw, { alpha: 0.75 });
    } else {
      const k = UI.envelope(area.t, area.dur, 0.5, 0.7) * vis;
      if (k <= 0) return;
      ctx.globalAlpha = k;
      const x = 46, y = 176;
      darkBehind(ctx, x + 120, y, 220, 50, 0.8);
      ctx.font = UI.font(26);
      ctx.fillStyle = C.cream;
      ctx.textAlign = 'left';
      ctx.textBaseline = 'middle';
      const w = UI.spacedText(ctx, area.name, x, y, 2, 'left');
      UI.rule(ctx, x + w / 2, y + 22, w / 2 + 6, C.cream, 0.45 * k);
    }
    ctx.globalAlpha = 1;
  }
  function drawBoss(ctx) {
    if (!boss || !playing()) return;
    const k = UI.envelope(boss.t, boss.dur, 0.8, 1.0) * (1 - UI.blockCover());
    if (k <= 0) return;
    const y = H * 0.79;
    ctx.globalAlpha = k;
    darkBehind(ctx, W / 2, y - 10, 560, 120, 1.35);
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    if (boss.sub) {
      ctx.font = UI.font(22, 'italic');
      ctx.fillStyle = C.creamDim;
      ctx.fillText(boss.sub, W / 2, y - 50);
    }
    ctx.font = UI.font(56);
    ctx.fillStyle = C.creamHi;
    UI.spacedText(ctx, boss.name, W / 2, y, 4, 'center');
    UI.flourish(ctx, W / 2, y + 44, 120 + 140 * UI.ease.outCubic(UI.clamp01(boss.t / 1.4)), { alpha: 0.75 });
    ctx.globalAlpha = 1;
  }
  function drawToasts(ctx) {
    let y = H - 40;
    for (let i = toasts.length - 1; i >= 0; i--) {
      const tt = toasts[i];
      const k = UI.envelope(tt.t, tt.dur, 0.3, 0.6);
      if (k <= 0) continue;
      ctx.font = UI.font(19);
      const tw = ctx.measureText(tt.text).width;
      const w = Math.min(560, tw + 56), h = 40;
      const slide = (1 - UI.ease.outCubic(UI.clamp01(tt.t / 0.35))) * 24;
      const x = W - 28 - w + slide;
      ctx.globalAlpha = k;
      UI.panel(ctx, x, y - h, w, h, { corners: false, radius: 4, fill: 'rgba(6,7,12,0.82)' });
      UI.flame(ctx, x + 20, y - h / 2 + 7, 13, 'blue', UI.t, i);
      ctx.fillStyle = C.cream;
      ctx.textAlign = 'left';
      ctx.textBaseline = 'middle';
      let text = tt.text;
      while (text.length > 4 && ctx.measureText(text).width > w - 50) text = text.slice(0, -2);
      if (text !== tt.text) text = text.trimEnd() + '…';
      ctx.fillText(text, x + 36, y - h / 2 + 1);
      y -= h + 8;
    }
    ctx.globalAlpha = 1;
  }
  function drawPrompts(ctx) {
    if (!prompts.size || !playing() || UI.isBlocking()) return;
    const cam = G.camera;
    for (const p of prompts.values()) {
      if (p.alpha <= 0.01) continue;
      const sx = p.x - (cam ? cam.x - (cam.shakeX || 0) : 0);
      const sy = p.y - (cam ? cam.y - (cam.shakeY || 0) : 0);
      const k = UI.ease.inOutSine(p.alpha);
      const bob = Math.sin(UI.t * 3) * 2;
      const y = sy - 6 + (1 - k) * 8;
      ctx.globalAlpha = k;
      ctx.font = UI.font(20);
      const tw = ctx.measureText(p.text).width;
      darkBehind(ctx, sx, y - 22, tw / 2 + 50, 40, 0.9);
      ctx.fillStyle = C.cream;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'alphabetic';
      ctx.fillText(p.text, sx, y);
      UI.rule(ctx, sx, y + 8, tw / 2 + 10, C.cream, 0.5 * k);
      // up-arrow glyph
      const ay = y - 34 + bob;
      ctx.fillStyle = '#d8eeff';
      ctx.beginPath();
      ctx.moveTo(sx, ay - 8); ctx.lineTo(sx + 8, ay + 1); ctx.lineTo(sx + 3, ay + 1); ctx.lineTo(sx + 3, ay + 7);
      ctx.lineTo(sx - 3, ay + 7); ctx.lineTo(sx - 3, ay + 1); ctx.lineTo(sx - 8, ay + 1); ctx.closePath();
      ctx.fill();
      UI.glow(ctx, sx, ay, 16, '#79c4ff', 0.35 * k);
    }
    ctx.globalAlpha = 1;
  }

  UI.addLayer({ name: 'prompts', z: 5, update: null, draw: drawPrompts });
  UI.addLayer({ name: 'cards', z: 10, update: updateLayers, draw(ctx) { drawArea(ctx); drawBoss(ctx); } });
  UI.addLayer({ name: 'toasts', z: 20, update: null, draw: drawToasts });
  UI.overlayState = () => ({ area: area && { name: area.name, big: area.big }, boss: boss && { name: boss.name }, toasts: toasts.map((x) => x.text), prompts: [...prompts.keys()] });

  // ================================================================== ability get
  function rays(ctx, x, y, r, t, color, alpha) {
    const pa = ctx.globalAlpha, po = ctx.globalCompositeOperation;
    ctx.globalCompositeOperation = 'lighter';
    ctx.fillStyle = color;
    for (let i = 0; i < 14; i++) {
      const a = t * 0.12 + (i / 14) * TAU;
      const w = 0.05 + 0.03 * Math.sin(i * 1.7 + t);
      ctx.globalAlpha = pa * alpha * (0.5 + 0.5 * Math.sin(i * 2.3 + t * 0.8));
      ctx.beginPath();
      ctx.moveTo(x, y);
      ctx.lineTo(x + Math.cos(a - w) * r, y + Math.sin(a - w) * r);
      ctx.lineTo(x + Math.cos(a + w) * r, y + Math.sin(a + w) * r);
      ctx.closePath();
      ctx.fill();
    }
    ctx.globalAlpha = pa; ctx.globalCompositeOperation = po;
  }
  UI.rays = rays;

  /** Full-screen ability card (name, icon, description, how-to with key caps); waits for confirm. */
  UI.abilityGet = function (abilityId, onDone) {
    const A = (G.Text && G.Text.abilities && G.Text.abilities[abilityId]) || {};
    UI.stinger('ability');
    UI.sfx('ability');
    const motes = new UI.Particles(60);
    return UI.push({
      name: 'abilityGet', fadeIn: 0.6, fadeOut: 0.5, hideHud: true, onClose: onDone,
      update(dt, active) {
        if (Math.random() < dt * 16) motes.spawn({ x: W / 2 + (Math.random() - 0.5) * 300, y: 260 + (Math.random() - 0.5) * 120, vx: (Math.random() - 0.5) * 20, vy: -20 - Math.random() * 30, life: 2.5, size: 1.2, color: '#bfe8ff', glow: true, alpha: 0.7 });
        motes.update(dt);
        if (!active || this.t < 1.3) return;
        if (UI.pressedAny(UI.ADVANCE) || UI.pressed('cancel')) { UI.sfx('menu_select'); UI.close(this); }
      },
      draw(ctx, a) {
        const t = UI.t;
        UI.veil(ctx, 1, 'rgba(2,3,7,0.9)');
        UI.vignette(ctx, 1);
        const ix = W / 2, iy = 214;
        const pop = UI.ease.outBack(UI.clamp01(this.t / 0.8));
        rays(ctx, ix, iy, 250, t, '#4f90ff', 0.12);
        UI.glow(ctx, ix, iy, 220, '#3f8cff', 0.3 + 0.06 * Math.sin(t * 2));
        motes.draw(ctx);
        UI.icons.ability(ctx, abilityId, ix, iy, 124 * pop, { t });
        const k = UI.clamp01((this.t - 0.4) / 0.6);
        ctx.globalAlpha = a * k;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.font = UI.font(52);
        ctx.fillStyle = C.creamHi;
        UI.spacedText(ctx, A.name || abilityId, W / 2, 344, 4, 'center');
        UI.flourish(ctx, W / 2, 386, 230, { alpha: 0.7 });
        if (A.desc) {
          ctx.font = UI.font(23, 'italic');
          ctx.fillStyle = C.creamDim;
          UI.paragraph(ctx, A.desc, W / 2, 432, 820, 32, 'center');
        }
        const k2 = UI.clamp01((this.t - 0.8) / 0.6);
        if (A.how) {
          ctx.globalAlpha = a * k2;
          const pw = 780;
          ctx.font = UI.font(23);
          const lay = UI.layoutRich(ctx, A.how, pw - 80, 23);
          const ph = 48 + lay.lines.length * 34;
          const py = 498;
          UI.panel(ctx, (W - pw) / 2, py, pw, ph, { fill: 'rgba(14,18,28,0.75)', border: 'rgba(170,215,255,0.3)', cornerSize: 12, cornerAlpha: 0.5 });
          ctx.font = UI.font(23);
          UI.drawRich(ctx, lay, W / 2, py + 40, 34, 'center', C.cream);
        }
        const k3 = UI.clamp01((this.t - 1.3) / 0.5);
        if (k3 > 0) UI.hints(ctx, [['confirm', UI.text('ui.next', 'Continue')]], W / 2, 676, 'center', { alpha: 0.6 * k3 });
      },
    });
  };

  // ================================================================== item get
  function itemInfo(spec) {
    const s = String(spec || '');
    const ci = s.indexOf(':');
    const kind = ci < 0 ? s : s.slice(0, ci), arg = ci < 0 ? '' : s.slice(ci + 1);
    const p = (G.game && G.game.progress) || {};
    const tt = Object.assign({ heartwax: 8, urns: 2, kilnGlass: 3, sparks: 6, seals: 3, sigils: 14, notches: 6 }, (G.Items && G.Items.totals) || {});
    const info = { name: '', desc: '', extra: '', highlight: false, stinger: 'item', icon: s };
    switch (kind) {
      case 'heartwax': {
        info.name = UI.text('items.heartwax.name', 'Heartwax Shard');
        info.desc = UI.text('items.heartwax.desc', '');
        const n = p.heartShards | 0;
        if (n > 0 && n % 2 === 0) { info.extra = UI.text('items.heartwax.whole', 'The shards fuse into a new candle.'); info.highlight = true; } else info.extra = UI.text('ui.heartShards', 'Heartwax Shards') + ':  ' + n + ' / ' + tt.heartwax;
        break;
      }
      case 'urn': info.name = UI.text('items.urn.name', 'Ember Urn'); info.desc = UI.text('items.urn.desc', ''); info.extra = UI.text('ui.urns', 'Ember Urns') + ':  ' + (p.urns | 0) + ' / ' + tt.urns; break;
      case 'kiln_glass': info.name = UI.text('items.kiln_glass.name', 'Kiln Glass'); info.desc = UI.text('items.kiln_glass.desc', ''); info.extra = UI.text('ui.kilnGlass', 'Kiln Glass') + ':  ' + (p.kilnGlass | 0); break;
      case 'notch': info.name = UI.text('items.notch.name', 'Wax Notch'); info.desc = UI.text('items.notch.desc', ''); info.extra = UI.text('ui.notches', 'Notches') + ':  ' + (p.notches | 0) + ' / ' + tt.notches; break;
      case 'spark': info.name = UI.text('items.spark.name', "Chandler's Spark"); info.desc = UI.text('items.spark.desc', ''); info.extra = UI.text('ui.sparks', "Chandler's Sparks") + ':  ' + (p.sparks || []).length + ' / ' + tt.sparks; info.stinger = 'spark'; break;
      case 'seal': {
        info.name = UI.text('items.seal_' + arg + '.name', 'Warden Seal');
        info.desc = UI.text('items.seal_' + arg + '.desc', '');
        info.extra = UI.fmt(UI.text('ui.sealDoorCount', 'Warden Seals: {n} / 3'), { n: (p.seals || []).length });
        info.stinger = 'seal';
        break;
      }
      case 'sigil': info.name = UI.text('sigils.' + arg + '.name', arg); info.desc = UI.text('sigils.' + arg + '.desc', ''); info.extra = UI.text('ui.notches', 'Notches') + ':  ' + (UI.sigilCost ? UI.sigilCost(arg) : 1); break;
      case 'brand': {
        const lvl = Math.max(0, Math.min(3, p.brandLevel | 0));
        const bi = UI.brandLevelInfo ? UI.brandLevelInfo(lvl) : { name: 'Brand', desc: '', dmg: 0 };
        info.name = bi.name; info.desc = bi.desc; info.extra = bi.dmg + ' ' + UI.text('ui.damage', 'damage');
        break;
      }
      case 'chart': info.name = UI.fmt(UI.text('ui.chartOf', 'Chart: {region}'), { region: UI.regionName(arg) }); info.desc = UI.text('items.chart.desc', ''); break;
      case 'cinders': info.name = (parseInt(arg, 10) || 0) + ' ' + UI.text('items.cinders.name', 'Cinders'); info.desc = UI.text('items.cinders.desc', ''); info.icon = 'cinders'; break;
      default: info.name = s;
    }
    return info;
  }
  UI.itemInfo = itemInfo;

  /** Medium item card (heartwax/urn/kiln/notch/seal/sigil/spark/brand/chart); waits for confirm. */
  UI.itemGet = function (itemSpec, onDone) {
    const info = itemInfo(itemSpec);
    UI.stinger(info.stinger);
    UI.sfx('item');
    return UI.push({
      name: 'itemGet', fadeIn: 0.3, fadeOut: 0.3, onClose: onDone,
      update(dt, active) {
        if (!active || this.t < 0.7) return;
        if (UI.pressedAny(UI.ADVANCE) || UI.pressed('cancel')) { UI.sfx('menu_select'); UI.close(this); }
      },
      draw(ctx, a) {
        const t = UI.t;
        UI.veil(ctx, 0.6);
        const pw = 660;
        ctx.font = UI.font(20);
        const lines = UI.wrapBalanced(ctx, info.desc, pw - 110);
        const ph = 238 + lines.length * 28 + (info.extra ? 34 : 0);
        const px = (W - pw) / 2, py = (H - ph) / 2 - 10;
        const lift = (1 - UI.ease.outCubic(UI.clamp01(this.t / 0.4))) * 16;
        UI.panel(ctx, px, py + lift, pw, ph, { cornerSize: 18, border: 'rgba(170,215,255,0.32)' });
        const ix = W / 2, iy = py + 78 + lift;
        rays(ctx, ix, iy, 120, t, '#4f90ff', 0.08);
        UI.glow(ctx, ix, iy, 100, '#3f8cff', 0.2);
        UI.icons.spec(ctx, info.icon, ix, iy, 76 * UI.ease.outBack(UI.clamp01(this.t / 0.5)), { t });
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.font = UI.font(13, 'italic');
        ctx.fillStyle = C.dim;
        UI.spacedText(ctx, UI.text('ui.acquired', 'Acquired').toUpperCase(), W / 2, py + 138 + lift, 3, 'center');
        ctx.font = UI.font(32);
        ctx.fillStyle = C.creamHi;
        ctx.fillText(info.name, W / 2, py + 170 + lift);
        UI.flourish(ctx, W / 2, py + 200 + lift, 110, { alpha: 0.5 });
        ctx.font = UI.font(20);
        ctx.fillStyle = C.creamDim;
        ctx.textBaseline = 'alphabetic';
        for (let i = 0; i < lines.length; i++) ctx.fillText(lines[i], W / 2, py + 238 + lift + i * 28);
        if (info.extra) {
          ctx.font = UI.font(18, 'italic');
          ctx.fillStyle = info.highlight ? C.gold : C.goldDim;
          ctx.fillText(info.extra, W / 2, py + 238 + lift + lines.length * 28 + 12);
        }
        const k = UI.clamp01((this.t - 0.7) / 0.4);
        if (k > 0) UI.hints(ctx, [['confirm', UI.text('ui.next', 'Continue')]], W / 2, py + ph + 32, 'center', { alpha: 0.6 * k });
      },
    });
  };
})();
