// src/ui/menus.js — pause menu (Resume / Options / Controls / Quit to Title; shows the region and the run's
// difficulty, read-only), the shared Options screen
// (volumes, screen shake, control hints; persisted with G.Save.saveSettings → applied to G.Audio) and the
// Controls screen (rebindable keyboard / mouse / gamepad table, reset to defaults, rotating control tips).
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
        if (UI.pressedClose(['pause', 'cancel'])) { UI.sfx('menu_back'); UI.close(this); return; }
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
        // the run's difficulty (read-only: the mode is chosen at New Game and never changes mid-run)
        const run = G.game && G.game.progress && typeof G.game.difficulty === 'function' ? G.game.difficulty() : null;
        if (run) {
          const fb = { easy: 'Easy', standard: 'Standard', hardcore: 'Hardcore' };
          const label = UI.modeLabel ? UI.modeLabel(run) : UI.text('ui.mode' + run[0].toUpperCase() + run.slice(1), fb[run] || run);
          ctx.font = UI.font(15);
          ctx.fillStyle = run === 'hardcore' ? C.red : C.dim;
          ctx.textAlign = 'center';
          ctx.textBaseline = 'middle';
          const pa = ctx.globalAlpha;
          ctx.globalAlpha = pa * (run === 'hardcore' ? 0.75 : 1);
          UI.spacedText(ctx, label.toUpperCase(), W / 2, reg && reg !== 'test' ? 280 : 250, 3, 'center');
          ctx.globalAlpha = pa;
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

  // ------------------------------------------------------------------ controls (rebinding)
  // Rows = the gameplay actions, columns = Primary / Secondary (keyboard or mouse) / Gamepad. Confirm on a cell waits
  // for the next key, mouse button or pad button (G.input.beginCapture); Backspace/Delete (pad Y) clears the cell;
  // Esc cancels a capture. Below the table: Reset to Defaults (asks first) and Back. Bindings persist via
  // G.Save settings (G.input does it on every change).
  const FALLBACK_ACTIONS = ['left', 'right', 'up', 'down', 'jump', 'attack', 'dash', 'spell', 'interact', 'map', 'inventory', 'pause'];
  const ACTION_FB = {
    left: 'Move Left', right: 'Move Right', up: 'Up / Aim Up', down: 'Aim Down', jump: 'Jump', attack: 'Attack',
    dash: 'Dash', spell: 'Spell / Kindle', interact: 'Interact', map: 'Map', inventory: 'Inventory', pause: 'Pause',
  };
  /** Readable action name (Controls screen and binding notes). */
  function actionName(a) {
    // 'ui.actions.up' historically read 'Aim Up / Interact'; Interact now has its own row
    if (a === 'up') return UI.text('ui.actions.aimUp', ACTION_FB.up);
    return UI.text('ui.actions.' + a, ACTION_FB[a] || a);
  }
  UI.actionName = actionName;
  function controlsCaps(ctx, list, x, y, h, alpha) {
    let cx = x;
    for (const label of list) {
      const w = UI.keycapWidth(ctx, label, h);
      UI.keycap(ctx, label, cx + w / 2, y, h, { alpha });
      cx += w + 3;
    }
    return cx - x;
  }
  function cellFrame(ctx, cx, y, w, h, alpha) {
    const pa = ctx.globalAlpha;
    ctx.globalAlpha = pa * alpha;
    UI.glow(ctx, cx, y, w * 0.55, '#79c4ff', 0.18);
    ctx.strokeStyle = 'rgba(143,211,255,0.85)';
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    const x0 = cx - w / 2, y0 = y - h / 2, r = 6;
    ctx.moveTo(x0 + r, y0); ctx.lineTo(x0 + w - r, y0); ctx.quadraticCurveTo(x0 + w, y0, x0 + w, y0 + r);
    ctx.lineTo(x0 + w, y0 + h - r); ctx.quadraticCurveTo(x0 + w, y0 + h, x0 + w - r, y0 + h);
    ctx.lineTo(x0 + r, y0 + h); ctx.quadraticCurveTo(x0, y0 + h, x0, y0 + h - r);
    ctx.lineTo(x0, y0 + r); ctx.quadraticCurveTo(x0, y0, x0 + r, y0);
    ctx.stroke();
    ctx.globalAlpha = pa;
  }

  // Enter / NumpadEnter always confirm in menus (lockout protection), so the capture never binds them.
  const MENU_KEYS = { 'key:Enter': 1, 'key:NumpadEnter': 1 };
  // Fallback strings (G.Text ui.* wins). Capture prompt by column x last device: a pad cannot press Esc, so pad
  // players are told B backs out (keyboard columns) or that waiting cancels (Gamepad column, where B is bindable).
  const FALLBACK_KEY = 'Enter, Esc and the arrow keys always work in menus, and Esc always pauses.';
  const FALLBACK_PAD = 'A, B and the D-pad always work in menus.';
  function capturePrompt(padCol, padDevice) {
    if (padCol) {
      return padDevice ? UI.text('ui.capturePromptPad', 'Press a gamepad button for {action}... or wait a moment to cancel.')
        : UI.text('ui.capturePromptPadKey', 'Press a gamepad button for {action}... Esc to cancel, Backspace to clear.');
    }
    return padDevice ? UI.text('ui.capturePromptKeyPad', 'Press a key or mouse button for {action}... B to cancel.')
      : UI.text('ui.capturePromptKey', 'Press a key or mouse button for {action}... Esc to cancel, Backspace to clear.');
  }
  UI._controlsCapturePrompt = capturePrompt;   // test hook
  // refusal note for reason 'last': the gamepad variant when only the pad slot is at stake (Pause keeps its keys)
  function lastNote(r, a) {
    return r.device === 'gamepad'
      ? UI.fmt(UI.text('ui.bindLastPad', '{action} needs a gamepad button.'), { action: actionName(r.action || a) })
      : UI.fmt(UI.text('ui.bindLast', '{action} needs at least one binding.'), { action: actionName(r.action || a) });
  }

  /** Controls screen (rebinding table). opts: {backdrop, onClose} */
  UI.openControls = function (opts) {
    const o = opts || {};
    const I = () => G.input || {};
    const acts = (G.input && G.input.GAME_ACTIONS) || FALLBACK_ACTIONS;
    const ROW_RESET = acts.length, ROW_BACK = acts.length + 1, NROWS = acts.length + 2;
    const COLS = 3, PAD_COL = 2;
    const LX = 450, CX = [570, 760, 950], Y0 = 164, RH = 30;
    const rowY = (r) => (r < acts.length ? Y0 + r * RH : Y0 + acts.length * RH + 24 + (r - acts.length) * 34);
    return UI.push({
      name: 'controls', fadeIn: 0.18, fadeOut: 0.16, tip: 0, tipT: 0,
      // a pad player starts in the Gamepad column (pad A in a keyboard column only starts a capture it cannot finish)
      row: 0, col: G.input && G.input.lastDevice === 'gamepad' ? PAD_COL : 0,
      capturing: false, capT: 0, note: '', noteT: 0, noteBad: false,
      onClose() {
        if (this.capturing && G.input && G.input.capturing) G.input.cancelCapture();
        this.capturing = false;
        if (o.onClose) o.onClose();
      },
      say(text, bad) { this.note = text; this.noteT = 3.2; this.noteBad = !!bad; },
      update(dt, active) {
        const tips = UI.textObj('ui.controlTips') || [];
        this.noteT = Math.max(0, this.noteT - dt);
        if (!this.capturing && !this.noteT) {
          this.tipT += dt;
          if (this.tipT > 5.5 && tips.length) { this.tipT = 0; this.tip = (this.tip + 1) % tips.length; }
        }
        if (this.capturing && !(G.input && G.input.capturing)) this.capturing = false;   // ended elsewhere
        // the screen owns the capture timeout: re-arming after a refused input (wrong device, Enter) restarts the
        // input's own timer, so pressing buttons can never keep a capture alive past CAPTURE_TIMEOUT
        if (this.capturing) {
          this.capT += dt;
          if (this.capT > ((G.input && G.input.CAPTURE_TIMEOUT) || 10) && G.input.cancelCapture) G.input.cancelCapture();
        }
        if (!active || this.capturing) return;
        const inp = I();
        const dy = UI.navY();
        if (dy) { this.row = (this.row + dy + NROWS) % NROWS; UI.sfx('menu_move'); }
        const dx = UI.navX();
        if (dx && this.row < acts.length) { this.col = (this.col + dx + COLS) % COLS; UI.sfx('menu_move'); }
        const onCell = this.row < acts.length;
        const raw = (id) => !!(inp.rawPressed && inp.rawPressed(id));
        if (onCell && (raw('key:Backspace') || raw('key:Delete') || raw('pad:3'))) {
          if (inp.consume) inp.consume('cancel');
          this.clearCell();
          return;
        }
        if (UI.pressedClose(['cancel', 'pause'])) { UI.sfx('menu_back'); UI.close(this); return; }
        if (!UI.pressedAny(UI.CONFIRM)) return;
        if (onCell) this.startCapture();
        else if (this.row === ROW_BACK) { UI.sfx('menu_back'); UI.close(this); } else if (this.row === ROW_RESET) {
          UI.sfx('menu_select');
          UI.confirm({
            name: 'confirm_reset_controls',
            text: UI.text('ui.resetControlsConfirm', 'Reset every control to its default?'),
            onYes: () => {
              if (inp.resetBindings) inp.resetBindings();
              this.say(UI.text('ui.controlsReset', 'Controls reset to their defaults.'));
            },
          });
        }
      },
      startCapture() {
        const inp = I();
        if (!inp.beginCapture) return;
        UI.sfx('menu_select');
        this.capturing = true;
        this.capT = 0;
        this.note = ''; this.noteT = 0;
        inp.beginCapture((res) => this.captured(res));
      },
      /** Keep listening after a refused input; the elapsed capture time (this.capT) is kept. */
      rearm() {
        const inp = I();
        if (!inp.beginCapture) return;
        this.capturing = true;
        inp.beginCapture((r) => this.captured(r));
      },
      captured(res) {
        const inp = I();
        this.capturing = false;
        if (!res || res.cancel) { UI.sfx('menu_back'); return; }
        if (res.clear) { this.clearCell(); return; }
        const a = acts[this.row], id = res.input;
        const padCol = this.col === PAD_COL;
        const isPad = /^(pad|axis):/.test(id);
        // pad B backs out of a keyboard/mouse-column capture (lockout: B always backs out for a pad player)
        if (!padCol && id === 'pad:1') { UI.sfx('menu_back'); return; }
        const name = inp.labelOf ? inp.labelOf(id) : id;
        if (padCol !== isPad) {
          // wrong device for this column: say so and keep listening
          this.say(padCol ? UI.text('ui.bindNeedPad', 'Press a gamepad button for the Gamepad column.')
            : UI.text('ui.bindNeedKey', 'Press a key or mouse button for this column.'), true);
          UI.sfx('deny', { vol: 0.5 });
          this.rearm();
          return;
        }
        // Enter always confirms in menus: never capture it (a habitual double Enter would rebind the cell)
        if (MENU_KEYS[id]) {
          UI.sfx('deny', { vol: 0.5 });
          this.say(UI.fmt(UI.text('ui.bindReserved', '{input} is kept for the menus.'), { input: name }), true);
          this.rearm();
          return;
        }
        const r = inp.setBinding(a, this.col, id);
        if (!r.ok) {
          UI.sfx('deny', { vol: 0.6 });
          if (r.reason === 'last') this.say(lastNote(r, r.action), true);
          else if (r.reason === 'os') {
            this.say(UI.fmt(UI.text('ui.bindOsKey', '{input} is a system key and cannot be bound.'), { input: name }), true);
            this.rearm();
          } else if (r.reason === 'reserved') {
            this.say(UI.fmt(UI.text('ui.bindReserved', '{input} is kept for the menus.'), { input: name }), true);
            this.rearm();
          } else this.say(UI.text('ui.bindRefused', 'That cannot be bound here.'), true);
          return;
        }
        UI.sfx('menu_select');
        if (r.warning === 'ctrlCombos') {
          this.say(UI.text('ui.bindCtrlWarn', 'Ctrl+W, Ctrl+T and Ctrl+N cannot be blocked by the browser.'));
        } else if (r.swapped) {
          this.say(UI.fmt(UI.text('ui.bindSwapped', '{input} moved from {action}, which now uses {other}.'),
            { input: name, action: actionName(r.swapped.action), other: inp.labelOf(r.swapped.input) }));
        } else if (r.moved && r.moved.length) {
          const from = r.moved.map((m) => actionName(m.action)).filter((v, i, arr) => arr.indexOf(v) === i).join(', ');
          this.say(UI.fmt(UI.text('ui.bindMoved', '{input} moved from {action}.'), { input: name, action: from }));
        }
      },
      clearCell() {
        const inp = I();
        const a = acts[this.row];
        if (!inp.clearBinding || !a) return;
        const r = inp.clearBinding(a, this.col);
        if (r.ok) { UI.sfx(r.unchanged ? 'menu_move' : 'menu_back'); return; }
        UI.sfx('deny', { vol: 0.6 });
        if (r.reason === 'last') this.say(lastNote(r, a), true);
      },
      draw(ctx, a) {
        const inp = I();
        UI.veil(ctx, o.backdrop !== false ? 0.85 : 0.45);
        title(ctx, UI.text('ui.controls', 'Controls'), 62, 38);
        const binds = inp.getBindings ? inp.getBindings() : {};
        const extras = inp.getExtras ? inp.getExtras() : {};
        const lab = (id) => (inp.labelOf ? inp.labelOf(id) : String(id));
        // column headers
        ctx.font = UI.font(19, 'italic');
        ctx.fillStyle = C.gold;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        const heads = [UI.text('ui.bindPrimary', 'Primary'), UI.text('ui.bindSecondary', 'Secondary'), UI.text('ui.gamepad', 'Gamepad')];
        for (let c = 0; c < COLS; c++) ctx.fillText(heads[c], CX[c], Y0 - 34);
        UI.rule(ctx, W / 2, Y0 - 18, 470, C.cream, 0.3);
        for (let i = 0; i < acts.length; i++) {
          const act = acts[i];
          const y = rowY(i);
          const selRow = i === this.row;
          if (selRow) {
            const g = ctx.createLinearGradient(W / 2 - 470, 0, W / 2 + 470, 0);
            g.addColorStop(0, 'rgba(120,180,255,0)'); g.addColorStop(0.5, 'rgba(120,180,255,0.1)'); g.addColorStop(1, 'rgba(120,180,255,0)');
            ctx.fillStyle = g;
            ctx.fillRect(W / 2 - 470, y - RH / 2, 940, RH);
          } else if (i % 2 === 0) { ctx.fillStyle = 'rgba(236,228,207,0.035)'; ctx.fillRect(W / 2 - 470, y - RH / 2, 940, RH); }
          ctx.font = UI.font(20);
          ctx.fillStyle = selRow ? C.creamHi : C.cream;
          ctx.textAlign = 'right';
          ctx.textBaseline = 'middle';
          ctx.fillText(actionName(act), LX, y + 1);
          const row = binds[act] || [];
          for (let c = 0; c < COLS; c++) {
            const cx = CX[c];
            const sel = selRow && c === this.col;
            if (sel) cellFrame(ctx, cx, y, 168, RH - 4, 1);
            if (sel && this.capturing) {
              const pulse = 0.55 + 0.45 * Math.sin(UI.t * 6);
              ctx.globalAlpha = a * pulse;
              ctx.font = UI.font(18, 'italic');
              ctx.fillStyle = C.blueHi;
              ctx.textAlign = 'center';
              ctx.fillText(UI.text('ui.bindPress', 'Press...'), cx, y + 1);
              ctx.globalAlpha = a;
              continue;
            }
            const id = row[c];
            const ex = c === 0 ? [] : (extras[act] || []).filter((x) => (c === PAD_COL ? /^(pad|axis):/.test(x) : /^(key|mouse):/.test(x)));
            let w = 0;
            if (id) {
              w = UI.keycapWidth(ctx, lab(id), 24);
              UI.keycap(ctx, lab(id), cx, y, 24, sel ? { color: C.creamHi } : {});
            } else {
              ctx.font = UI.font(18);
              ctx.fillStyle = C.faint;
              ctx.textAlign = 'center';
              ctx.fillText('—', cx, y + 1);
              w = 20;
            }
            // default inputs beyond the visible slots (dash: K, RT), small and dim
            if (ex.length) controlsCaps(ctx, ex.map(lab), cx + w / 2 + 2, y, 18, 0.6);
          }
        }
        UI.drawMenu(ctx, [{ label: UI.text('ui.resetControls', 'Reset to Defaults') }], this.row === ROW_RESET ? 0 : -1, W / 2, rowY(ROW_RESET), { size: 23 });
        UI.drawMenu(ctx, [{ label: UI.text('ui.back', 'Back') }], this.row === ROW_BACK ? 0 : -1, W / 2, rowY(ROW_BACK), { size: 23 });
        // message line: fresh note (a refusal while the capture keeps listening) > capture prompt > note > rotating tip
        const my = 630;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        if (this.capturing && !(this.noteT > 0 && this.note)) {
          ctx.font = UI.font(20, 'italic');
          ctx.fillStyle = C.blueHi;
          ctx.fillText(UI.fmt(capturePrompt(this.col === PAD_COL, inp.lastDevice === 'gamepad'), { action: actionName(acts[this.row]) }), W / 2, my);
        } else if (this.noteT > 0 && this.note) {
          ctx.globalAlpha = a * Math.min(1, this.noteT / 0.4);
          ctx.font = UI.font(20, 'italic');
          ctx.fillStyle = this.noteBad ? C.red : C.gold;
          ctx.fillText(this.note, W / 2, my);
          ctx.globalAlpha = a;
        } else {
          const tips = UI.textObj('ui.controlTips') || [];
          if (tips.length) {
            const tipA = Math.min(1, this.tipT / 0.5, Math.max(0, (5.5 - this.tipT) / 0.5));
            ctx.globalAlpha = a * tipA;
            ctx.font = UI.font(20, 'italic');
            ctx.fillStyle = C.creamDim;
            const lay = UI.layoutRich(ctx, tips[this.tip % tips.length], 900, 20);
            UI.drawRich(ctx, lay, W / 2, my, 28, 'center', C.creamDim);
            ctx.globalAlpha = a;
          }
        }
        ctx.font = UI.font(15, 'italic');
        ctx.fillStyle = C.dim;
        ctx.textAlign = 'center';
        const pad = inp.lastDevice === 'gamepad';
        ctx.fillText(pad ? UI.text('ui.controlsFallbackPad', FALLBACK_PAD) : UI.text('ui.controlsFallbackKey', FALLBACK_KEY), W / 2, 664);
        const hints = this.row < acts.length
          ? [['confirm', UI.text('ui.rebind', 'Rebind')], ['cancel', UI.text('ui.clear', 'Clear'), pad ? 'Y' : 'Del'], ['cancel', UI.text('ui.back', 'Back')]]
          : [['confirm', UI.text('ui.confirm', 'Confirm')], ['cancel', UI.text('ui.back', 'Back')]];
        if (!this.capturing) UI.hints(ctx, hints, W / 2, 698, 'center', { alpha: 0.6 });
      },
    });
  };
})();
