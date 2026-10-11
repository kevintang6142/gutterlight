// src/ui/shop.js — shops and the Lanternway menu.
//   Pell  : stock from G.Items.shops.pell; buy → G.game.giveItem(entry.give, {pickupId}) (flag item:<id>, sold rows vanish)
//   Quill : charts of known regions only (entered or a room visited; no spoilers) → G.game.giveItem('chart:<region>') (progress.charts[region] = true)
//   Bramm : Brand upgrade (current → next damage; cinders + Kiln Glass, glass is consumed) → giveItem('brand')
//   Lanternway: lit posts only (unlit ones are not listed), by region name, current marked, travel with G.game.travel(id)
(function () {
  'use strict';
  const G = globalThis.G;
  const UI = G.UI;
  const C = UI.C;
  const W = UI.W, H = UI.H;
  const TAU = Math.PI * 2;

  const LANTERNS = ['lastlight', 'guttered', 'meltbloom', 'nave', 'chandlery', 'mothwood', 'rime'];
  const KEEPER_NAMES = { pell: 'Pell', quill: 'Quill', bramm: 'Bramm the Wickwright' };

  function P() { return (G.game && G.game.progress) || null; }
  function shopText(shopId, key, fb) { return UI.text('shops.' + shopId + '.' + key, fb || ''); }
  function stock(shopId) { return (G.Items && G.Items.shops && G.Items.shops[shopId]) || []; }

  // ------------------------------------------------------------------ rows per shop
  function pellRows() {
    const p = P();
    return stock('pell').filter((e) => !(p && p.flags && p.flags['item:' + e.id])).map((e) => {
      const give = e.give || (e.item === 'sigil' ? 'sigil:' + e.sigil : e.item);
      let name, desc, extra = '', notches = 0;
      if (e.item === 'sigil') {
        name = UI.text('sigils.' + e.sigil + '.name', e.sigil);
        desc = UI.text('sigils.' + e.sigil + '.desc', '');
        notches = UI.sigilCost ? UI.sigilCost(e.sigil) : 1; // drawn as pips, never a number
      } else {
        name = UI.text('items.' + e.item + '.name', e.item);
        desc = UI.text('items.' + e.item + '.desc', '');
      }
      return { entry: e, give, name, desc, extra, notches, price: e.price | 0, glass: 0 };
    });
  }
  // Quill only offers charts of regions the player knows (no spoilers, like Iselda): a region is known once it has
  // been entered (flags['region:<id>'], set by G.game on region change) or any of its rooms is in progress.visited.
  // A partly explored region still has a chart worth buying ("Buy what I've walked, then walk what I haven't").
  function knownRegions(p) {
    const known = {};
    if (!p) return known;
    const f = p.flags || {};
    for (const k in f) if (f[k] && k.indexOf('region:') === 0) known[k.slice(7)] = true;
    for (const id in (p.visited || {})) if (p.visited[id]) { const r = UI.regionOfRoom(id); if (r) known[r] = true; }
    return known;
  }
  function quillUnsold(p, e) { return !(p && ((p.charts && p.charts[e.region]) || (p.flags && p.flags['item:' + e.id]))); }
  /** True when Quill still has charts the player cannot see yet (regions not yet known). */
  function quillPending() {
    const p = P(), known = knownRegions(p);
    return stock('quill').some((e) => quillUnsold(p, e) && !known[e.region]);
  }
  /** Speech when a shop has no rows: Quill with unseen regions left says "go explore", not "that's all of them". */
  function emptySpeech(shopId) {
    if (shopId === 'bramm') return shopText('bramm', 'maxed', shopText('bramm', 'empty'));
    if (shopId === 'quill' && quillPending()) return shopText('quill', 'unwalked', "Hm-hm... Nothing I've drawn touches anywhere you've been. Go find an edge, then come back for its chart.");
    return shopText(shopId, 'empty');
  }
  function quillRows() {
    const p = P(), known = knownRegions(p);
    return stock('quill').filter((e) => quillUnsold(p, e) && known[e.region]).map((e) => ({
      entry: e, give: 'chart:' + e.region,
      name: UI.fmt(UI.text('ui.chartOf', 'Chart: {region}'), { region: UI.regionName(e.region) }),
      desc: UI.text('items.chart.desc', ''), extra: '', price: e.price | 0, glass: 0, region: e.region,
    }));
  }
  function brammRows() {
    const p = P();
    const lvl = p ? Math.max(0, Math.min(3, p.brandLevel | 0)) : 0;
    const next = stock('bramm')[lvl];
    if (!next || lvl >= 3) return [];
    const cur = UI.brandLevelInfo(lvl), nx = UI.brandLevelInfo(lvl + 1);
    return [{
      entry: next, give: 'brand', name: UI.text('ui.temper', 'Temper the Brand'),
      desc: (UI.textObj('shops.bramm.offer') || [])[lvl] || nx.desc, extra: '',
      price: next.price | 0, glass: next.glass | 0, from: cur, to: nx, level: lvl + 1,
    }];
  }
  const ROWS = { pell: pellRows, quill: quillRows, bramm: brammRows };
  /** Current (unsold) rows of a shop: [{entry, give, name, desc, price, glass, ...}]. */
  UI.shopRows = (shopId) => (ROWS[shopId] ? ROWS[shopId]() : []);

  // ------------------------------------------------------------------ shop screen
  /** Open a shop: 'pell' | 'quill' | 'bramm'. onDone after it closes. */
  UI.openShop = function (shopId, onDone) {
    const rowsFn = ROWS[shopId];
    if (!rowsFn) { G.reportError(new Error('UI.openShop: unknown shop "' + shopId + '"'), 'UI.openShop'); if (onDone) UI.safe(onDone, 'openShop onDone'); return null; }
    const keeper = UI.text('npcs.' + shopId + '.name', KEEPER_NAMES[shopId] || shopId);
    const initialRows = rowsFn();
    return UI.push({
      name: 'shop', shopId, fadeIn: 0.22, fadeOut: 0.2, hideHud: true, sel: 0, scroll: 0, onClose: onDone,
      speech: initialRows.length ? shopText(shopId, 'greet') : emptySpeech(shopId),
      speechT: 0, cinderPulse: 0, busy: false,
      say(text) { if (text) { this.speech = text; this.speechT = 0; } },
      update(dt, active) {
        this.speechT += dt;
        if (this.cinderPulse > 0) this.cinderPulse -= dt;
        const rows = rowsFn();
        if (this.sel >= rows.length) this.sel = Math.max(0, rows.length - 1);
        if (!active || this.busy) return;
        if (UI.pressedClose(['cancel', 'pause'])) { UI.sfx('menu_back'); this.say(shopText(shopId, 'farewell')); UI.close(this); return; }
        const dy = UI.navY();
        if (dy && rows.length > 1) { this.sel = (this.sel + dy + rows.length) % rows.length; UI.sfx('menu_move'); }
        if (UI.pressedAny(UI.CONFIRM)) {
          const row = rows[this.sel];
          if (!row) { UI.sfx('deny'); return; }
          this.tryBuy(row);
        }
      },
      tryBuy(row) {
        const p = P();
        if (!p) return;
        if ((p.cinders | 0) < row.price) { UI.sfx('deny'); this.say(shopText(shopId, 'poor')); this.cinderPulse = 0.6; return; }
        if (row.glass > (p.kilnGlass | 0)) { UI.sfx('deny'); this.say(shopText(shopId, 'noGlass', shopText(shopId, 'poor'))); return; }
        UI.sfx('menu_select');
        let q = row.name + '  —  ' + UI.fmt(UI.text('ui.priceCinders', '{price} Cinders'), { price: row.price });
        if (row.glass) q += ',  ' + UI.fmt(UI.text('ui.priceGlass', '{glass} Kiln Glass'), { glass: row.glass });
        this.busy = true;
        UI.confirm({
          name: 'confirm_buy', text: q, yes: UI.text('ui.buy', 'Buy'), no: UI.text('ui.cancel', 'Cancel'),
          onYes: () => { this.busy = false; this.buy(row); },
          onNo: () => { this.busy = false; },
        });
      },
      buy(row) {
        const p = P();
        if (!p || !G.game.spendCinders(row.price)) { UI.sfx('deny'); this.say(shopText(shopId, 'poor')); return; }
        if (row.glass) p.kilnGlass = Math.max(0, (p.kilnGlass | 0) - row.glass);
        UI.sfx('shop_buy');
        const e = row.entry;
        if (shopId === 'bramm') {
          G.game.giveItem('brand');
          const up = UI.textObj('shops.bramm.upgrade');
          this.say((up && up[row.level - 1]) || shopText('bramm', 'bought'));
        } else if (shopId === 'quill') {
          G.game.giveItem(row.give, { pickupId: e.id });
          if (G.game.saveNow) G.game.saveNow();
          UI.toast(row.name);
          this.say(shopText('quill', 'bought'));
        } else {
          G.game.giveItem(row.give, { pickupId: e.id });
          this.say(shopText('pell', 'bought'));
        }
        if (!rowsFn().length) this.say(emptySpeech(shopId));
      },
      draw(ctx, a) { drawShop(ctx, this, rowsFn(), keeper); },
    });
  };

  function drawPrice(ctx, x, y, price, glass, p, align, size) {
    const sz = size || 21;
    const poor = p && (p.cinders | 0) < price;
    ctx.font = UI.font(sz);
    ctx.textBaseline = 'middle';
    const ptxt = String(price);
    let w = ctx.measureText(ptxt).width + 22;
    let gw = 0;
    if (glass) { gw = ctx.measureText(String(glass)).width + 30; w += gw; }
    let cx = align === 'right' ? x - w : x;
    UI.drawCinderIcon(ctx, cx + 7, y, 7, UI.t);
    ctx.textAlign = 'left';
    ctx.fillStyle = poor ? C.red : C.cream;
    ctx.fillText(ptxt, cx + 20, y + 1);
    if (glass) {
      cx += ctx.measureText(ptxt).width + 34;
      UI.icons.item(ctx, 'kiln_glass', cx + 6, y, 18, {});
      ctx.fillStyle = p && (p.kilnGlass | 0) < glass ? C.red : C.cream;
      ctx.fillText(String(glass), cx + 18, y + 1);
    }
  }

  function drawShop(ctx, s, rows, keeper) {
    const p = P();
    const t = UI.t;
    UI.veil(ctx, 1, 'rgba(3,4,8,0.78)');
    UI.vignette(ctx, 0.6);
    // left: keeper + list
    const lx = 70, ly = 54, lw = 540, lh = 560;
    UI.panel(ctx, lx, ly, lw, lh, { cornerSize: 18 });
    ctx.font = UI.font(32);
    ctx.fillStyle = C.cream;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    UI.spacedText(ctx, keeper, lx + lw / 2, ly + 46, 2, 'center');
    UI.flourish(ctx, lx + lw / 2, ly + 80, 150, { alpha: 0.5 });
    const rowH = 50, listTop = ly + 108, maxRows = 9;
    if (s.sel < s.scroll) s.scroll = s.sel;
    if (s.sel >= s.scroll + maxRows) s.scroll = s.sel - maxRows + 1;
    s.scroll = Math.max(0, Math.min(s.scroll, Math.max(0, rows.length - maxRows)));
    if (!rows.length) {
      ctx.font = UI.font(21, 'italic');
      ctx.fillStyle = C.dim;
      ctx.fillText(s.shopId === 'bramm' ? UI.brandLevelInfo(3).name
        : (s.shopId === 'quill' && quillPending() ? UI.text('ui.noChartsYet', 'Nothing yet') : UI.text('ui.sold', 'Sold')), lx + lw / 2, listTop + 120);
    }
    for (let i = s.scroll; i < Math.min(rows.length, s.scroll + maxRows); i++) {
      const r = rows[i];
      const y = listTop + (i - s.scroll) * rowH + rowH / 2;
      const on = i === s.sel;
      if (on) {
        const g = ctx.createLinearGradient(lx + 20, 0, lx + lw - 20, 0);
        g.addColorStop(0, 'rgba(120,180,255,0.16)'); g.addColorStop(1, 'rgba(120,180,255,0)');
        ctx.fillStyle = g;
        ctx.fillRect(lx + 20, y - rowH / 2 + 3, lw - 40, rowH - 6);
        UI.flame(ctx, lx + 34, y + 7, 14, 'blue', t, 1);
      }
      UI.icons.spec(ctx, r.give, lx + 74, y, 34, { t });
      ctx.font = UI.font(21);
      ctx.fillStyle = on ? C.creamHi : C.creamDim;
      ctx.textAlign = 'left';
      ctx.textBaseline = 'middle';
      let name = r.name;
      while (name.length > 4 && ctx.measureText(name).width > lw - 250) name = name.slice(0, -2);
      if (name !== r.name) name = name.trimEnd() + '…';
      ctx.fillText(name, lx + 104, y + 1);
      drawPrice(ctx, lx + lw - 36, y, r.price, r.glass, p, 'right', 20);
    }
    if (s.scroll > 0) arrow(ctx, lx + lw / 2, listTop - 10, -1);
    if (s.scroll + maxRows < rows.length) arrow(ctx, lx + lw / 2, listTop + maxRows * rowH + 6, 1);

    // right: details
    const rx = 650, ry = 54, rw = 560, rh = 560;
    UI.panel(ctx, rx, ry, rw, rh, { cornerSize: 18 });
    // owned cinders
    const pulse = s.cinderPulse > 0 ? Math.sin(s.cinderPulse * 30) * 3 : 0;
    UI.drawCinderIcon(ctx, rx + rw - 120 + pulse, ry + 40, 9, t);
    ctx.font = UI.font(24);
    ctx.fillStyle = s.cinderPulse > 0 ? C.red : C.cream;
    ctx.textAlign = 'left';
    ctx.textBaseline = 'middle';
    ctx.fillText(String(p ? p.cinders | 0 : 0), rx + rw - 102 + pulse, ry + 41);
    if (s.shopId === 'bramm' && p) {
      UI.icons.item(ctx, 'kiln_glass', rx + 40, ry + 40, 22, {});
      ctx.fillStyle = C.cream;
      ctx.fillText(String(p.kilnGlass | 0), rx + 58, ry + 41);
    }
    const r = rows[s.sel];
    if (s.shopId === 'bramm') drawBrandDetail(ctx, rx, ry, rw, r, p, t);
    else if (r) {
      UI.glow(ctx, rx + rw / 2, ry + 132, 110, '#3f8cff', 0.12);
      UI.icons.spec(ctx, r.give, rx + rw / 2, ry + 132, 92, { t });
      ctx.font = UI.font(30);
      ctx.fillStyle = C.cream;
      ctx.textAlign = 'center';
      ctx.fillText(r.name, rx + rw / 2, ry + 222);
      UI.flourish(ctx, rx + rw / 2, ry + 252, 120, { alpha: 0.4 });
      ctx.font = UI.font(20);
      ctx.fillStyle = C.creamDim;
      UI.paragraph(ctx, r.desc, rx + rw / 2, ry + 296, rw - 90, 28, 'center');
      if (r.extra) {
        ctx.font = UI.font(17, 'italic');
        ctx.fillStyle = C.goldDim;
        ctx.textAlign = 'center';
        ctx.fillText(r.extra, rx + rw / 2, ry + rh - 96);
      }
      if (r.notches > 0 && UI.notchCost) {
        // the sigil's notch cost: a dim label and diamond pips, centered (no number)
        const label = UI.text('ui.notches', 'Notches');
        ctx.font = UI.font(17, 'italic');
        const lw = ctx.measureText(label).width, tw = lw + 12 + r.notches * 16;
        const x0 = rx + rw / 2 - tw / 2, y0 = ry + rh - 96;
        ctx.fillStyle = C.goldDim;
        ctx.textAlign = 'left';
        ctx.textBaseline = 'middle';
        ctx.fillText(label, x0, y0);
        UI.notchCost(ctx, x0 + lw + 12, y0, r.notches, 'left');
      }
      drawPrice(ctx, rx + rw / 2 - 30, ry + rh - 56, r.price, r.glass, p, 'left', 24);
    }
    // speech
    if (s.speech) {
      const k = Math.min(1, s.speechT / 0.3);
      const pa = ctx.globalAlpha;
      ctx.globalAlpha = pa * k;
      ctx.font = UI.font(21, 'italic');
      ctx.fillStyle = C.cream;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      const lines = UI.wrapBalanced(ctx, '“' + s.speech + '”', 1000);
      for (let i = 0; i < Math.min(2, lines.length); i++) ctx.fillText(lines[i], W / 2, 646 + i * 26 - (lines.length > 1 ? 10 : 0));
      ctx.globalAlpha = pa;
    }
    const hints = [];
    if (rows.length) hints.push(['confirm', s.shopId === 'bramm' ? UI.text('ui.temper', 'Temper') : UI.text('ui.buy', 'Buy')]);
    hints.push(['cancel', UI.text('ui.leave', 'Leave')]);
    UI.hints(ctx, hints, W - 70, 700, 'right', { alpha: 0.5, size: 15 });
  }

  function drawBrandDetail(ctx, rx, ry, rw, r, p, t) {
    const lvl = p ? Math.max(0, Math.min(3, p.brandLevel | 0)) : 0;
    const cur = UI.brandLevelInfo(lvl);
    const cx = rx + rw / 2;
    UI.glow(ctx, cx, ry + 132, 120, '#ff8a3c', 0.12);
    UI.icons.item(ctx, 'brand', cx, ry + 132, 96, { t });
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    if (!r) {
      ctx.font = UI.font(30);
      ctx.fillStyle = C.cream;
      ctx.fillText(cur.name, cx, ry + 226);
      UI.flourish(ctx, cx, ry + 256, 120, { alpha: 0.4 });
      ctx.font = UI.font(20);
      ctx.fillStyle = C.creamDim;
      UI.paragraph(ctx, cur.desc, cx, ry + 300, rw - 90, 28, 'center');
      return;
    }
    ctx.font = UI.font(28);
    ctx.fillStyle = C.cream;
    ctx.fillText(r.name, cx, ry + 222);
    UI.flourish(ctx, cx, ry + 252, 120, { alpha: 0.4 });
    // current → next: the two Brands by name, the next one brighter (no damage numbers, as in Hollow Knight)
    const y = ry + 316;
    UI.icons.item(ctx, 'brand', cx - 130, y - 4, 40, { t, dim: true });
    UI.glow(ctx, cx + 130, y - 4, 42, '#ff8a3c', 0.16);
    UI.icons.item(ctx, 'brand', cx + 130, y - 4, 48, { t });
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.font = UI.font(21);
    ctx.fillStyle = C.creamDim;
    ctx.fillText(r.from.name, cx - 130, y + 40);
    ctx.fillStyle = C.gold;
    ctx.fillText(r.to.name, cx + 130, y + 40);
    // arrow
    ctx.strokeStyle = C.creamDim;
    ctx.lineWidth = 1.5;
    ctx.beginPath(); ctx.moveTo(cx - 30, y - 4); ctx.lineTo(cx + 30, y - 4); ctx.lineTo(cx + 22, y - 10); ctx.moveTo(cx + 30, y - 4); ctx.lineTo(cx + 22, y + 2); ctx.stroke();
    ctx.font = UI.font(18, 'italic');
    ctx.fillStyle = C.creamDim;
    UI.paragraph(ctx, r.desc, cx, y + 100, rw - 100, 24, 'center');
    drawPrice(ctx, cx - 50, ry + 504, r.price, r.glass, p, 'left', 24);
  }

  function arrow(ctx, x, y, dir) {
    ctx.fillStyle = C.dim;
    ctx.beginPath();
    ctx.moveTo(x - 7, y - dir * 3); ctx.lineTo(x + 7, y - dir * 3); ctx.lineTo(x, y + dir * 5); ctx.closePath();
    ctx.fill();
  }

  // ------------------------------------------------------------------ lanternway
  function lanternGlyph(ctx, x, y, lit, t, seed) {
    ctx.strokeStyle = lit ? '#d9cdb0' : '#5a564e';
    ctx.lineWidth = 1.5;
    ctx.beginPath(); ctx.moveTo(x, y - 18); ctx.lineTo(x, y - 13); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(x - 7, y - 13); ctx.lineTo(x + 7, y - 13); ctx.lineTo(x + 9, y + 9); ctx.lineTo(x - 9, y + 9); ctx.closePath();
    ctx.fillStyle = lit ? 'rgba(255,200,120,0.12)' : 'rgba(0,0,0,0.4)';
    ctx.fill(); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(x - 10, y + 12); ctx.lineTo(x + 10, y + 12); ctx.stroke();
    if (lit) UI.flame(ctx, x, y + 6, 13, 'blue', t, seed, { glow: 0.8 });
  }
  UI.lanternGlyph = lanternGlyph;

  /** Lanternway travel menu. currentId = the post the player stands at. onDone after close (travel is started first). */
  UI.openLanternway = function (currentId, onDone) {
    if (G.game && typeof G.game.isSafeRoom === 'function' && !G.game.isSafeRoom()) {
      return UI.dialogue({ lines: [UI.text('ui.lanternwayDanger', 'The lantern will not open while danger is near.')], onDone });
    }
    const p = P();
    const posts = LANTERNS.map((id) => ({ id, name: UI.regionName(id) || id, lit: !!(p && p.lanterns && p.lanterns[id]) || id === currentId, here: id === currentId }));
    const selectable = (i) => posts[i] && posts[i].lit;
    let sel = posts.findIndex((x) => x.lit && !x.here);
    if (sel < 0) sel = Math.max(0, posts.findIndex((x) => x.here));
    UI.sfx('lanternway', { vol: 0.5 });
    return UI.push({
      name: 'lanternway', fadeIn: 0.25, fadeOut: 0.2, hideHud: true, sel, travelTo: null,
      onClose() {
        if (this.travelTo && G.game && G.game.travel) G.game.travel(this.travelTo);
        if (onDone) onDone(this.travelTo);
      },
      update(dt, active) {
        if (!active) return;
        if (UI.pressedClose(['cancel', 'pause'])) { UI.sfx('menu_back'); UI.close(this); return; }
        const dy = UI.navY();
        if (dy) {
          let i = this.sel;
          for (let k = 0; k < posts.length; k++) { i = (i + dy + posts.length) % posts.length; if (selectable(i)) break; }
          if (i !== this.sel) { this.sel = i; UI.sfx('menu_move'); }
        }
        if (UI.pressedAny(UI.CONFIRM)) {
          const post = posts[this.sel];
          if (!post || !post.lit || post.here) { UI.sfx('deny'); return; }
          UI.sfx('menu_select');
          this.travelTo = post.id;
          UI.close(this);
        }
      },
      draw(ctx, a) {
        const t = UI.t;
        UI.veil(ctx, 1, 'rgba(3,4,8,0.72)');
        // only lit posts are listed (no '???' rows hinting at how many posts exist); `sel` still indexes `posts`
        const shown = posts.map((post, i) => ({ post, i })).filter((r) => r.post.lit);
        const pw = 600, ph = 110 + shown.length * 56 + 40, px = (W - pw) / 2, py = (H - ph) / 2 - 10;
        UI.panel(ctx, px, py, pw, ph, { cornerSize: 18 });
        ctx.font = UI.font(32);
        ctx.fillStyle = C.cream;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        UI.spacedText(ctx, UI.text('ui.lanternway', 'Lanternway'), W / 2, py + 44, 2.5, 'center');
        UI.flourish(ctx, W / 2, py + 76, 140, { alpha: 0.5 });
        ctx.font = UI.font(17, 'italic');
        ctx.fillStyle = C.dim;
        ctx.fillText(UI.text('ui.lanternwayChoose', 'Where shall the light carry you?'), W / 2, py + 100);
        for (let row = 0; row < shown.length; row++) {
          const { post, i } = shown[row];
          const y = py + 146 + row * 56;
          const on = i === this.sel;
          if (on) {
            const g = ctx.createLinearGradient(px + 30, 0, px + pw - 30, 0);
            g.addColorStop(0, 'rgba(120,180,255,0)'); g.addColorStop(0.5, 'rgba(120,180,255,0.13)'); g.addColorStop(1, 'rgba(120,180,255,0)');
            ctx.fillStyle = g;
            ctx.fillRect(px + 30, y - 24, pw - 60, 48);
          }
          lanternGlyph(ctx, px + 76, y, post.lit, t, i);
          ctx.font = UI.font(23);
          ctx.textAlign = 'left';
          ctx.fillStyle = !post.lit ? C.faint : on ? C.creamHi : C.creamDim;
          ctx.fillText(post.lit ? post.name : UI.text('ui.unknown', '???'), px + 112, y + 1);
          ctx.font = UI.font(16, 'italic');
          ctx.textAlign = 'right';
          if (post.here) { ctx.fillStyle = C.gold; ctx.fillText(UI.text('ui.lanternwayHere', 'You are here'), px + pw - 44, y + 1); }
          if (on && post.lit && !post.here) UI.flame(ctx, px + pw - 52, y + 7, 14, 'blue', t, 3);
        }
        UI.hints(ctx, [['confirm', UI.text('ui.prompts.travel', 'Travel')], ['cancel', UI.text('ui.close', 'Close')]], W / 2, py + ph + 30, 'center', { alpha: 0.6 });
      },
    });
  };
})();
