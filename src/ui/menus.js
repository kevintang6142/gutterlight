// src/ui/menus.js — pause menu (Resume / Options / Controls / Quit to Title), the shared Options screen
// (volumes, screen shake, control hints; persisted with G.Save.saveSettings → applied to G.Audio) and the
// Controls screen (keyboard & gamepad bindings per TECH_SPEC §6 plus rotating control tips).
(function () {
  'use strict';
  const G = globalThis.G;
  const UI = G.UI;
  const C = UI.C;
  const W = UI.W, H = UI.H;

  const CHILD_SCREENS = { options: 1, controls: 1 };
  /** 0..1: how much a child menu (options/controls) covers this screen. */
  function childCover(s, dt) {
    const top = UI.top();
    const covered = top && top !== s && CHILD_SCREENS[top.name] && top.state !== 'out';
    s._childK = s._childK === undefined ? 0 : s._childK;
    s._childK = covered ? Math.min(1, s._childK + dt * 6) : Math.max(0, s._childK - dt * 6);
    return s._childK;
  }
  UI.childCover = childCover;

  function title(ctx, text, y, size) {
    ctx.font = UI.font(size || 44);
    ctx.fillStyle = C.cream;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    UI.spacedText(ctx, text, W / 2, y, 3, 'center');
    UI.flourish(ctx, W / 2, y + 42, 190, { alpha: 0.6 });
  }
  UI.screenTitle = title;

  // ------------------------------------------------------------------ pause
  UI.openPause = function () {
    if (UI.isOpen('pause')) return UI.find('pause');
    const items = [
      { id: 'resume', label: UI.text('ui.resume', 'Resume') },
      { id: 'options', label: UI.text('ui.options', 'Options') },
      { id: 'controls', label: UI.text('ui.controls', 'Controls') },
      { id: 'quit', label: UI.text('ui.quitToTitle', 'Quit to Title') },
    ];
    UI.sfx('menu_select', { vol: 0.7 });
    return UI.push({
      name: 'pause', fadeIn: 0.18, fadeOut: 0.16, sel: 0, items,
      update(dt, active) {
        this.cover = childCover(this, dt);
        if (!active) return;
        const dy = UI.navY();
        if (dy) { this.sel = (this.sel + dy + items.length) % items.length; UI.sfx('menu_move'); }
        if (UI.pressedAny(['pause', 'cancel'])) { UI.sfx('menu_back'); UI.close(this); return; }
        if (!UI.pressedAny(UI.CONFIRM)) return;
        const id = items[this.sel].id;
        UI.sfx(id === 'resume' ? 'menu_back' : 'menu_select');
        if (id === 'resume') UI.close(this);
        else if (id === 'options') UI.openOptions({ backdrop: false });
        else if (id === 'controls') UI.openControls({ backdrop: false });
        else if (id === 'quit') {
          UI.confirm({
            name: 'confirm_quit', text: UI.text('ui.quitConfirm', 'Return to the title?'),
            onYes: () => { UI.closeAll(false); if (G.game && G.game.quitToTitle) G.game.quitToTitle(); },
          });
        }
      },
      draw(ctx, a) {
        UI.veil(ctx, 1);
        UI.vignette(ctx, 0.8);
        const k = 1 - (this.cover || 0);
        if (k <= 0.01) return;
        ctx.globalAlpha = a * k;
        title(ctx, UI.text('ui.paused', 'Paused'), 170);
        const reg = G.game && G.game.room && G.game.room.regionId;
        if (reg && reg !== 'test') {
          ctx.font = UI.font(21, 'italic');
          ctx.fillStyle = C.dim;
          ctx.textAlign = 'center';
          ctx.fillText(UI.regionName(reg), W / 2, 248);
        }
        UI.drawMenu(ctx, items, this.sel, W / 2, 330, { size: 30, gap: 60 });
        UI.hints(ctx, [['confirm', UI.text('ui.confirm', 'Confirm')], ['cancel', UI.text('ui.resume', 'Resume')]], W / 2, 664, 'center', { alpha: 0.6 });
      },
    });
  };

  // ------------------------------------------------------------------ options
  const VOLUMES = ['masterVolume', 'musicVolume', 'sfxVolume', 'ambienceVolume'];
  function settingLabel(key) {
    const fb = { masterVolume: 'Master Volume', musicVolume: 'Music Volume', sfxVolume: 'Sound Volume', ambienceVolume: 'Ambience Volume', shake: 'Screen Shake', hints: 'Show Control Hints' };
    return UI.text('ui.settings.' + key, fb[key] || key);
  }
  function persist() {
    if (G.Save && typeof G.Save.saveSettings === 'function') UI.safe(() => G.Save.saveSettings(), 'saveSettings');
  }
  /** Shared Options screen. opts: {backdrop (draw title-style backdrop veil, default true), onClose} */
  UI.openOptions = function (opts) {
    const o = opts || {};
    const rows = VOLUMES.map((k) => ({ key: k, kind: 'volume' }));
    rows.push({ key: 'shake', kind: 'toggle' }, { key: 'hints', kind: 'toggle' }, { key: 'back', kind: 'back' });
    return UI.push({
      name: 'options', fadeIn: 0.18, fadeOut: 0.16, sel: 0, rows, onClose: o.onClose,
      update(dt, active) {
        if (!active) return;
        const n = rows.length;
        const dy = UI.navY();
        if (dy) { this.sel = (this.sel + dy + n) % n; UI.sfx('menu_move'); }
        const row = rows[this.sel];
        const dx = UI.navX();
        const s = G.settings || {};
        if (dx && row.kind === 'volume') {
          const v = Math.round(Math.max(0, Math.min(1, (s[row.key] || 0) + dx * 0.1)) * 10) / 10;
          if (v !== s[row.key]) { s[row.key] = v; persist(); UI.sfx('menu_move'); } else UI.sfx('deny', { vol: 0.4 });
        } else if (dx && row.kind === 'toggle') this.toggle(row.key);
        if (UI.pressedAny(UI.BACK)) { UI.sfx('menu_back'); UI.close(this); return; }
        if (UI.pressedAny(UI.CONFIRM)) {
          if (row.kind === 'back') { UI.sfx('menu_back'); UI.close(this); } else if (row.kind === 'toggle') this.toggle(row.key);
        }
      },
      toggle(key) {
        const s = G.settings || {};
        if (key === 'shake') s.shake = (s.shake > 0 || s.shake === true) ? 0 : 1;
        else s[key] = !s[key];
        persist();
        UI.sfx('menu_select');
      },
      draw(ctx, a) {
        if (o.backdrop !== false) UI.veil(ctx, 0.8);
        else UI.veil(ctx, 0.35);
        title(ctx, UI.text('ui.options', 'Options'), 140);
        const s = G.settings || {};
        const y0 = 245, gap = 58;
        for (let i = 0; i < rows.length; i++) {
          const row = rows[i];
          const y = y0 + i * gap + (row.kind === 'back' ? 22 : 0);
          const on = i === this.sel;
          if (row.kind === 'back') {
            UI.drawMenu(ctx, [{ label: UI.text('ui.back', 'Back') }], on ? 0 : -1, W / 2, y, { size: 26 });
            continue;
          }
          if (on) rowBand(ctx, y);
          ctx.font = UI.font(25);
          ctx.textAlign = 'right';
          ctx.textBaseline = 'middle';
          ctx.fillStyle = on ? C.creamHi : C.creamDim;
          ctx.fillText(settingLabel(row.key), W / 2 - 30, y);
          if (row.kind === 'volume') drawSlider(ctx, W / 2 + 30, y, s[row.key] || 0, on);
          else drawToggle(ctx, W / 2 + 30, y, row.key === 'shake' ? (s.shake > 0 || s.shake === true) : !!s[row.key], on);
        }
        UI.hints(ctx, [['left', UI.text('ui.adjust', 'Adjust'), '\u2190 \u2192'], ['confirm', UI.text('ui.confirm', 'Confirm')], ['cancel', UI.text('ui.back', 'Back')]], W / 2, 670, 'center', { alpha: 0.6, force: true });
      },
    });
  };
  function rowBand(ctx, y) {
    const g = ctx.createLinearGradient(W / 2 - 420, 0, W / 2 + 420, 0);
    g.addColorStop(0, 'rgba(120,180,255,0)'); g.addColorStop(0.5, 'rgba(120,180,255,0.1)'); g.addColorStop(1, 'rgba(120,180,255,0)');
    ctx.fillStyle = g;
    ctx.fillRect(W / 2 - 420, y - 22, 840, 44);
    UI.flame(ctx, W / 2 - 390, y + 7, 14, 'blue', UI.t, 1);
    UI.flame(ctx, W / 2 + 390, y + 7, 14, 'blue', UI.t, 2);
  }
  function drawSlider(ctx, x, y, v, on) {
    const n = 10, sp = 24;
    for (let i = 0; i < n; i++) {
      const cx = x + 8 + i * sp;
      const filled = v >= (i + 1) / n - 1e-6;
      ctx.beginPath();
      ctx.moveTo(cx, y - 7); ctx.lineTo(cx + 5.5, y); ctx.lineTo(cx, y + 7); ctx.lineTo(cx - 5.5, y);
      ctx.closePath();
      if (filled) {
        ctx.fillStyle = on ? '#bfe6ff' : C.cream;
        ctx.fill();
      } else {
        ctx.strokeStyle = 'rgba(236,228,207,0.35)';
        ctx.lineWidth = 1;
        ctx.stroke();
      }
    }
    if (on && v > 0) UI.glow(ctx, x + 8 + (Math.round(v * n) - 1) * sp, y, 26, '#79c4ff', 0.35);
    ctx.font = UI.font(21);
    ctx.textAlign = 'left';
    ctx.fillStyle = on ? C.creamHi : C.dim;
    ctx.fillText(Math.round(v * 100) + '%', x + 8 + n * sp + 6, y + 1);
  }
  function drawToggle(ctx, x, y, val, on) {
    ctx.font = UI.font(24);
    ctx.textAlign = 'left';
    ctx.textBaseline = 'middle';
    const label = val ? UI.text('ui.on', 'On') : UI.text('ui.off', 'Off');
    ctx.fillStyle = on ? C.dim : C.faint;
    ctx.fillText('‹', x + 2, y);
    ctx.fillStyle = on ? C.creamHi : C.creamDim;
    ctx.fillText(label, x + 24, y + 1);
    const w = ctx.measureText(label).width;
    ctx.fillStyle = on ? C.dim : C.faint;
    ctx.fillText('›', x + 34 + w, y);
  }

  // ------------------------------------------------------------------ controls
  function controlRows() {
    const inp = G.input || {};
    const kl = (a) => (inp.keyLabels ? inp.keyLabels(a) : [UI.keyLabel(a)]);
    const pl = (a) => (inp.padLabels ? inp.padLabels(a) : []);
    const act = (k, fb) => UI.text('ui.actions.' + k, fb);
    const moveLabel = UI.text('ui.actions.move', 'Move');
    return [
      { label: moveLabel, keys: kl('left').concat(kl('right')).filter(uniq), pad: ['D-pad', 'Left Stick'] },
      { label: act('up', 'Aim Up / Interact'), keys: kl('up'), pad: ['D-pad ↑'] },
      { label: act('down', 'Aim Down'), keys: kl('down'), pad: ['D-pad ↓'] },
      { label: act('jump', 'Jump'), keys: kl('jump'), pad: pl('jump') },
      { label: act('attack', 'Attack'), keys: kl('attack'), pad: pl('attack') },
      { label: act('dash', 'Flare Dash'), keys: kl('dash'), pad: pl('dash') },
      { label: act('spell', 'Spell / Kindle'), keys: kl('spell'), pad: pl('spell') },
      { label: act('map', 'Map'), keys: kl('map'), pad: pl('map') },
      { label: act('inventory', 'Inventory'), keys: kl('inventory'), pad: pl('inventory') },
      { label: act('pause', 'Pause'), keys: kl('pause'), pad: pl('pause') },
      { label: act('confirm', 'Confirm'), keys: kl('confirm'), pad: pl('confirm') },
      { label: act('cancel', 'Back'), keys: kl('cancel'), pad: pl('cancel') },
    ];
  }
  function uniq(v, i, arr) { return arr.indexOf(v) === i; }
  function drawCaps(ctx, list, x, y, h) {
    let cx = x;
    for (const label of list) {
      const w = UI.keycapWidth(ctx, label, h);
      UI.keycap(ctx, label, cx + w / 2, y, h);
      cx += w + 4;
    }
    return cx - x;
  }
  /** Controls screen (keyboard + gamepad table). opts: {backdrop, onClose} */
  UI.openControls = function (opts) {
    const o = opts || {};
    return UI.push({
      name: 'controls', fadeIn: 0.18, fadeOut: 0.16, onClose: o.onClose, tip: 0, tipT: 0,
      update(dt, active) {
        const tips = UI.textObj('ui.controlTips') || [];
        this.tipT += dt;
        if (this.tipT > 5.5 && tips.length) { this.tipT = 0; this.tip = (this.tip + 1) % tips.length; }
        if (!active) return;
        if (UI.navX() || UI.navY()) { if (tips.length) { this.tip = (this.tip + 1) % tips.length; this.tipT = 0; UI.sfx('menu_move'); } }
        if (UI.pressedAny(['cancel', 'confirm', 'pause'])) { UI.sfx('menu_back'); UI.close(this); }
      },
      draw(ctx, a) {
        UI.veil(ctx, o.backdrop !== false ? 0.85 : 0.45);
        title(ctx, UI.text('ui.controls', 'Controls'), 82, 40);
        const rows = controlRows();
        const lx = 470, kx = 520, px = 880, y0 = 186, rh = 35;
        ctx.font = UI.font(19, 'italic');
        ctx.fillStyle = C.gold;
        ctx.textAlign = 'left';
        ctx.textBaseline = 'middle';
        ctx.fillText(UI.text('ui.keyboard', 'Keyboard'), kx, y0 - 34);
        ctx.fillText(UI.text('ui.gamepad', 'Gamepad'), px, y0 - 34);
        UI.rule(ctx, W / 2, y0 - 16, 470, C.cream, 0.3);
        for (let i = 0; i < rows.length; i++) {
          const r = rows[i];
          const y = y0 + i * rh;
          if (i % 2 === 0) { ctx.fillStyle = 'rgba(236,228,207,0.035)'; ctx.fillRect(W / 2 - 470, y - rh / 2, 940, rh); }
          ctx.font = UI.font(20);
          ctx.fillStyle = C.cream;
          ctx.textAlign = 'right';
          ctx.textBaseline = 'middle';
          ctx.fillText(r.label, lx, y + 1);
          drawCaps(ctx, r.keys, kx, y, 24);
          drawCaps(ctx, r.pad, px, y, 24);
        }
        const tips = UI.textObj('ui.controlTips') || [];
        if (tips.length) {
          const tipA = Math.min(1, this.tipT / 0.5, Math.max(0, (5.5 - this.tipT) / 0.5));
          ctx.globalAlpha = a * tipA;
          ctx.font = UI.font(20, 'italic');
          ctx.fillStyle = C.creamDim;
          const lay = UI.layoutRich(ctx, tips[this.tip % tips.length], 900, 20);
          UI.drawRich(ctx, lay, W / 2, 627, 28, 'center', C.creamDim);
          ctx.globalAlpha = a;
        }
        UI.hints(ctx, [['cancel', UI.text('ui.back', 'Back')]], W / 2, 690, 'center', { alpha: 0.6 });
      },
    });
  };
})();
