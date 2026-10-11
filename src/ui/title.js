// src/ui/title.js — the title screen: "press any key" gate (unlocks audio), animated GUTTERLIGHT logo (the I is
// a candle carrying a live blue flame), drifting ash over a dusk shore with a fallen colossal candle, the main
// menu (Continue / New Game / Options / Controls), the save-slot chooser (region, play time, completion,
// completed marker, difficulty label, snuffed hardcore runs, erase with confirmation) and the New Game difficulty
// chooser (Easy / Standard / Hardcore; default Standard; Hardcore asks for a confirmation).
(function () {
  'use strict';
  const G = globalThis.G;
  const UI = G.UI;
  const C = UI.C;
  const W = UI.W, H = UI.H;
  const TAU = Math.PI * 2;
  const ROMAN = ['I', 'II', 'III', 'IV', 'V'];
  // New Game difficulties (G.game.difficulty()): label, one-line description, flame colour of the icon.
  const MODES = [
    { id: 'easy', label: ['ui.modeEasy', 'Easy'], desc: ['ui.modeEasyDesc', 'Attacks are clearly marked — every strike shows where it will land.'], flame: 'gold' },
    { id: 'standard', label: ['ui.modeStandard', 'Standard'], desc: ['ui.modeStandardDesc', 'The intended journey. Read your foes.'], flame: 'blue' },
    { id: 'hardcore', label: ['ui.modeHardcore', 'Hardcore'], desc: ['ui.modeHardcoreDesc', 'As Standard, but death is final — the journey is lost.'], flame: 'red' },
  ];
  const DEFAULT_MODE = 1; // Standard
  const modeLabel = (id) => { const m = MODES.find((x) => x.id === id) || MODES[0]; return UI.text(m.label[0], m.label[1]); };
  UI.modeLabel = modeLabel;

  // ------------------------------------------------------------------ cached art
  let backdrop = null;
  let logo = null; // {canvas, w, h, wickX, wickY}

  function buildBackdrop() {
    const { canvas, ctx } = G.U.makeCanvas(W, H);
    let g = ctx.createLinearGradient(0, 0, 0, H);
    g.addColorStop(0, '#040509'); g.addColorStop(0.55, '#0b0e16'); g.addColorStop(0.74, '#151a25'); g.addColorStop(1, '#07080c');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, W, H);
    // pale haze over the horizon
    g = ctx.createRadialGradient(W * 0.5, H * 0.74, 20, W * 0.5, H * 0.74, W * 0.6);
    g.addColorStop(0, 'rgba(120,140,170,0.16)'); g.addColorStop(1, 'rgba(120,140,170,0)');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, W, H);
    const rng = new G.RNG(7);
    // the fallen colossal candle on the far dunes (right)
    ctx.save();
    ctx.translate(W * 0.8, H * 0.735);
    ctx.rotate(-0.13);
    ctx.fillStyle = '#121620';
    ctx.beginPath();
    ctx.moveTo(-260, -26); ctx.lineTo(150, -34);
    ctx.quadraticCurveTo(170, -30, 166, -8); ctx.lineTo(160, 22); ctx.lineTo(-258, 24);
    ctx.quadraticCurveTo(-272, 0, -260, -26);
    ctx.fill();
    ctx.strokeStyle = '#121620'; ctx.lineWidth = 4;
    ctx.beginPath(); ctx.moveTo(166, -12); ctx.quadraticCurveTo(184, -16, 196, -30); ctx.stroke(); // bent wick
    // drips hardened along its side
    for (let i = 0; i < 7; i++) {
      const x = -220 + i * 52 + rng.range(-10, 10);
      ctx.beginPath(); ctx.ellipse(x, 22, 7, 10 + rng.range(0, 10), 0, 0, TAU); ctx.fill();
    }
    ctx.restore();
    // dunes, far to near
    const layers = [['#10131b', 0.70, 16, 0.004], ['#0b0d13', 0.77, 22, 0.006], ['#06070a', 0.86, 26, 0.009]];
    for (const [col, base, amp, fr] of layers) {
      const ph = rng.range(0, 6);
      ctx.fillStyle = col;
      ctx.beginPath();
      ctx.moveTo(0, H);
      for (let x = 0; x <= W; x += 8) {
        const y = H * base + Math.sin(x * fr + ph) * amp + Math.sin(x * fr * 2.7 + ph * 2) * amp * 0.35;
        ctx.lineTo(x, y);
      }
      ctx.lineTo(W, H);
      ctx.closePath();
      ctx.fill();
    }
    // a few half-buried candle stubs in the near dune (left)
    ctx.fillStyle = '#05060a';
    for (const [x, h, w] of [[120, 34, 12], [146, 22, 10], [1150, 28, 11]]) {
      const y = H * 0.86 + Math.sin(x * 0.009) * 10;
      ctx.fillRect(x - w / 2, y - h, w, h + 20);
      ctx.beginPath(); ctx.ellipse(x, y - h, w / 2, 3, 0, 0, TAU); ctx.fill();
    }
    backdrop = canvas;
  }

  function buildLogo() {
    const size = 94, spacing = 9;
    const font = UI.font(size);
    const m = G.U.makeCanvas(10, 10).ctx;
    m.font = font;
    const left = 'GUTTERL', right = 'GHT';
    const wl = UI.spacedWidth(m, left, spacing), wr = UI.spacedWidth(m, right, spacing);
    const capH = size * 0.69;
    const iw = size * 0.17;           // candle-I width
    const pad = 60;
    const total = wl + spacing + iw + spacing + wr;
    const cw = Math.ceil(total + pad * 2), ch = Math.ceil(size * 1.6 + pad);
    const { canvas, ctx } = G.U.makeCanvas(cw, ch);
    const base = Math.round(ch * 0.68);
    const ix = pad + wl + spacing; // candle-I left edge
    const drawLetters = (fill) => {
      ctx.font = font;
      ctx.fillStyle = fill;
      ctx.textBaseline = 'alphabetic';
      UI.spacedText(ctx, left, pad, base, spacing, 'left');
      UI.spacedText(ctx, right, ix + iw + spacing, base, spacing, 'left');
      // the candle I: wax column with a melted lip and a drip
      ctx.beginPath();
      ctx.moveTo(ix, base);
      ctx.lineTo(ix, base - capH + 6);
      ctx.quadraticCurveTo(ix, base - capH, ix + 5, base - capH);
      ctx.lineTo(ix + iw - 5, base - capH);
      ctx.quadraticCurveTo(ix + iw, base - capH, ix + iw, base - capH + 6);
      ctx.lineTo(ix + iw, base - capH * 0.45);
      ctx.quadraticCurveTo(ix + iw + 4, base - capH * 0.38, ix + iw + 1, base - capH * 0.3);
      ctx.lineTo(ix + iw, base);
      ctx.closePath();
      ctx.fill();
    };
    // glow pass (prerender only)
    ctx.save();
    ctx.shadowColor = 'rgba(90,160,255,0.55)';
    ctx.shadowBlur = 26;
    drawLetters('rgba(40,60,90,0.6)');
    ctx.restore();
    const g = ctx.createLinearGradient(0, base - capH, 0, base);
    g.addColorStop(0, '#fbf6e6'); g.addColorStop(0.55, '#e6dcc0'); g.addColorStop(1, '#b6a57c');
    drawLetters(g);
    // subtle engraved top highlight
    ctx.globalCompositeOperation = 'source-atop';
    ctx.fillStyle = 'rgba(255,255,255,0.18)';
    ctx.fillRect(0, base - capH, cw, 3);
    ctx.fillStyle = 'rgba(70,50,20,0.25)';
    ctx.fillRect(0, base - 6, cw, 6);
    ctx.globalCompositeOperation = 'source-over';
    // wick
    ctx.strokeStyle = '#1a1612';
    ctx.lineWidth = 3;
    ctx.beginPath(); ctx.moveTo(ix + iw / 2, base - capH + 1); ctx.quadraticCurveTo(ix + iw / 2 + 1, base - capH - 6, ix + iw / 2 + 0.5, base - capH - 11); ctx.stroke();
    logo = { canvas, w: cw, h: ch, wickX: ix + iw / 2 + 0.5, wickY: base - capH - 10, base, capH };
  }

  // ------------------------------------------------------------------ shared backdrop drawing (also used by intro/menus)
  const ash = new UI.Particles(110);
  function spawnAsh(initial) {
    ash.spawn({
      x: Math.random() * (W + 300) - 50, y: initial ? Math.random() * H : -10,
      vx: -14 - Math.random() * 22, vy: 16 + Math.random() * 22, life: 9 + Math.random() * 8,
      size: 1 + Math.random() * 1.8, color: Math.random() < 0.25 ? '#d8d2c4' : '#8c8a86', alpha: 0.35 + Math.random() * 0.4,
      wobble: 12, kind: 'flake', rot: Math.random() * 6, vrot: (Math.random() - 0.5) * 3,
    });
  }
  let ashInit = false;
  function updateAsh(dt) {
    if (!ashInit) { for (let i = 0; i < 70; i++) spawnAsh(true); ashInit = true; }
    if (Math.random() < dt * 9) spawnAsh(false);
    ash.update(dt);
  }
  /** Draw the title backdrop (dusk shore + drifting ash). */
  UI.drawTitleBackdrop = function (ctx, alpha) {
    if (!backdrop) buildBackdrop();
    const pa = ctx.globalAlpha;
    ctx.globalAlpha = pa * (alpha === undefined ? 1 : alpha);
    ctx.drawImage(backdrop, 0, 0);
    ash.draw(ctx);
    UI.vignette(ctx, 0.9);
    ctx.globalAlpha = pa;
  };

  function drawLogo(ctx, cx, cy, t, a) {
    if (!logo) buildLogo();
    const x = Math.round(cx - logo.w / 2), y = Math.round(cy - logo.base);
    const pa = ctx.globalAlpha;
    ctx.globalAlpha = pa * a;
    UI.glow(ctx, cx, cy - logo.capH * 0.4, 420, '#2c5cd8', 0.09 + 0.02 * Math.sin(t * 0.9));
    ctx.drawImage(logo.canvas, x, y);
    const fx = x + logo.wickX, fy = y + logo.wickY;
    UI.glow(ctx, fx, fy - 18, 140, '#3f8cff', 0.22 + 0.04 * Math.sin(t * 5.3));
    UI.flame(ctx, fx, fy, 40, 'blue', t, 3.7, { glow: 1.2 });
    ctx.globalAlpha = pa;
  }
  UI.drawLogo = drawLogo;

  // ------------------------------------------------------------------ slots
  function readSlots() {
    const out = [];
    const n = (G.Save && G.Save.SLOTS) || 3;
    for (let i = 0; i < n; i++) {
      let sum = { slot: i, exists: false };
      let raw = false;
      try { raw = !!(G.Save && G.Save.exists(i)); sum = G.Save.summary(i) || sum; } catch (e) { G.reportError(e, 'title.readSlots'); }
      if (sum.exists && !sum.regionName) {
        // the save's room is not loaded (or unknown): fall back to the region implied by the room-id prefix
        try {
          const p = G.Save.load(i);
          const rid = UI.regionOfRoom(p && ((p.sconce && p.sconce.room) || p.lastRoom));
          if (rid) sum = Object.assign({}, sum, { regionId: rid, regionName: UI.regionName(rid) });
        } catch (e) { /* best effort */ }
      }
      out.push({ slot: i, raw, exists: !!sum.exists, unreadable: raw && !sum.exists, sum });
    }
    return out;
  }
  function anySave() {
    try { for (let i = 0; i < ((G.Save && G.Save.SLOTS) || 3); i++) if (G.Save.exists(i)) return true; } catch (e) { /* ignore */ }
    return false;
  }

  // ------------------------------------------------------------------ the title screen
  function makeTitle() {
    const s = {
      name: 'title', blocking: true, fadeIn: 0.8, fadeOut: 0.7,
      view: 'gate',          // gate | menu | slots | modes
      gateK: 1, menuK: 0, slotsK: 0, modesK: 0,
      modeSel: DEFAULT_MODE, newSlot: -1, newOverwrite: false,
      sel: 0, items: [],
      slotMode: 'continue', slots: [], slotSel: 0, eraseFocus: false,
      leaving: false, startT: 0,

      open() {
        this.sawTitleMode = !!(G.game && G.game.mode === 'title');
        UI.music('title');
        if (G.Audio && typeof G.Audio.ambience === 'function') UI.safe(() => G.Audio.ambience(null), 'title ambience');
        this.view = UI._titleSkipGate ? 'menu' : 'gate';
        this.gateK = this.view === 'gate' ? 1 : 0;
        this.menuK = this.view === 'menu' ? 1 : 0;
        this.buildMenu();
      },
      buildMenu() {
        const has = anySave();
        this.items = [];
        if (has) this.items.push({ id: 'continue', label: UI.text('ui.continue', 'Continue') });
        this.items.push({ id: 'new', label: UI.text('ui.newGame', 'New Game') });
        this.items.push({ id: 'options', label: UI.text('ui.options', 'Options') });
        this.items.push({ id: 'controls', label: UI.text('ui.controls', 'Controls') });
        this.sel = Math.min(this.sel, this.items.length - 1);
      },
      update(dt, active) {
        // play was started without us (engine/debug API: continueGame/newGame/test harness): get out of the way
        const mode = G.game && G.game.mode;
        if (mode === 'title') this.sawTitleMode = true;
        else if (this.sawTitleMode && !this.leaving && mode && mode !== 'boot') { UI.dismiss(this); return; }
        updateAsh(dt);
        this.cover = UI.childCover ? UI.childCover(this, dt) : 0;
        const k = dt * 3.2;
        this.gateK = approach(this.gateK, this.view === 'gate' ? 1 : 0, k);
        this.menuK = approach(this.menuK, this.view === 'menu' ? 1 : 0, k);
        this.slotsK = approach(this.slotsK, this.view === 'slots' ? 1 : 0, k);
        this.modesK = approach(this.modesK, this.view === 'modes' ? 1 : 0, k);
        if (!active || this.leaving) return;
        if (this.view === 'gate') this.updateGate();
        else if (this.view === 'menu') this.updateMenu();
        else if (this.view === 'modes') this.updateModes();
        else this.updateSlots();
      },
      updateGate() {
        const inp = G.input;
        if (this.t < 0.5) return;
        if ((inp && inp.anyPressed()) || UI.pointerTapped()) {
          if (inp) inp.consumeAll();
          if (G.Audio && typeof G.Audio.init === 'function') UI.safe(() => G.Audio.init(), 'Audio.init');
          if (G.Save && G.Save.applySettings) UI.safe(() => G.Save.applySettings(), 'applySettings');
          UI.music('title');
          UI.sfx('menu_select');
          UI._titleSkipGate = true;
          this.view = 'menu';
          this.buildMenu();
          this.sel = 0;
        }
      },
      updateMenu() {
        const dy = UI.navY();
        if (dy) { this.sel = (this.sel + dy + this.items.length) % this.items.length; UI.sfx('menu_move'); }
        if (UI.pressedAny(UI.CONFIRM)) {
          const it = this.items[this.sel];
          UI.sfx('menu_select');
          if (it.id === 'continue') this.openSlots('continue');
          else if (it.id === 'new') this.openSlots('new');
          else if (it.id === 'options' && UI.openOptions) UI.openOptions({ backdrop: false });
          else if (it.id === 'controls' && UI.openControls) UI.openControls({ backdrop: false });
        } else if (UI.pressedAny(UI.BACK)) {
          UI.sfx('menu_back');
          this.view = 'gate';
          UI._titleSkipGate = false;
          this.t = 0;
        }
      },
      openSlots(mode) {
        this.slotMode = mode;
        this.slots = readSlots();
        this.eraseFocus = false;
        // preselect: continue → the first resumable slot (else the first save); new → the first empty slot
        let pick = mode === 'continue' ? this.slots.findIndex((x) => x.exists && !x.sum.broken) : -1;
        if (pick < 0) pick = this.slots.findIndex((x) => (mode === 'continue' ? x.raw : !x.raw));
        if (pick < 0) pick = 0;
        this.slotSel = pick;
        this.view = 'slots';
      },
      slotUsable(i) {
        if (i >= this.slots.length) return true; // Back
        const sl = this.slots[i];
        return this.slotMode === 'new' ? true : sl.exists && !sl.sum.broken; // a snuffed hardcore run cannot continue
      },
      updateSlots() {
        const n = this.slots.length + 1; // + Back
        const dy = UI.navY();
        if (dy) {
          let i = this.slotSel;
          for (let k = 0; k < n; k++) {
            i = (i + dy + n) % n;
            if (this.slotUsable(i) || (i < this.slots.length && this.slots[i].raw)) break;
          }
          if (i !== this.slotSel) { this.slotSel = i; this.eraseFocus = false; UI.sfx('menu_move'); }
        }
        const dx = UI.navX();
        const cur = this.slots[this.slotSel];
        if (dx && cur && cur.raw) {
          const want = dx > 0;
          if (want !== this.eraseFocus) { this.eraseFocus = want; UI.sfx('menu_move'); }
        }
        if (UI.pressedAny(UI.BACK)) {
          UI.sfx('menu_back');
          this.view = 'menu';
          this.buildMenu();
          return;
        }
        if (!UI.pressedAny(UI.CONFIRM)) return;
        if (this.slotSel >= this.slots.length) { UI.sfx('menu_back'); this.view = 'menu'; this.buildMenu(); return; }
        const sl = cur;
        if (this.eraseFocus && sl.raw) {
          UI.sfx('menu_select');
          UI.confirm({
            name: 'confirm_erase', text: UI.text('ui.eraseConfirm', 'Erase this journey forever?'),
            yes: UI.text('ui.erase', 'Erase'), no: UI.text('ui.cancel', 'Cancel'),
            onYes: () => {
              UI.safe(() => G.Save.remove(sl.slot), 'Save.remove');
              UI.sfx('break_wall', { vol: 0.5 });
              this.slots = readSlots();
              this.eraseFocus = false;
              if (!anySave() && this.slotMode === 'continue') { this.view = 'menu'; this.buildMenu(); }
            },
          });
          return;
        }
        if (this.slotMode === 'continue') {
          if (!sl.exists || sl.sum.broken) { UI.sfx('deny'); return; }
          this.start('continue', sl.slot);
          return;
        }
        if (sl.raw) {
          UI.sfx('menu_select');
          // the old save is only erased once the new journey actually begins (backing out of the mode chooser keeps it)
          UI.confirm({
            name: 'confirm_overwrite', text: UI.text('ui.eraseConfirm', 'Erase this journey forever?'),
            yes: UI.text('ui.newGame', 'New Game'), no: UI.text('ui.cancel', 'Cancel'),
            onYes: () => this.openModes(sl.slot, true),
          });
          return;
        }
        UI.sfx('menu_select');
        this.openModes(sl.slot, false);
      },
      openModes(slot, overwrite) {
        this.newSlot = slot;
        this.newOverwrite = !!overwrite;
        this.modeSel = DEFAULT_MODE;
        this.view = 'modes';
      },
      updateModes() {
        const dy = UI.navY();
        if (dy) { this.modeSel = (this.modeSel + dy + MODES.length) % MODES.length; UI.sfx('menu_move'); }
        if (UI.pressedAny(UI.BACK)) { UI.sfx('menu_back'); this.view = 'slots'; this.slots = readSlots(); return; }
        if (!UI.pressedAny(UI.CONFIRM)) return;
        const m = MODES[this.modeSel];
        if (m.id === 'hardcore') {
          UI.sfx('menu_select');
          UI.confirm({
            name: 'confirm_hardcore',
            text: UI.text('ui.hardcoreConfirm', 'Death is final. If your flame goes out, this journey is lost forever.'),
            yes: UI.text('ui.hardcoreBegin', 'Begin'), no: UI.text('ui.cancel', 'Cancel'),
            onYes: () => this.beginNew(m.id),
          });
          return;
        }
        this.beginNew(m.id);
      },
      beginNew(mode) {
        const slot = this.newSlot;
        if (slot < 0) return;
        if (this.newOverwrite) UI.safe(() => G.Save.remove(slot), 'Save.remove');
        this.start('new', slot, mode);
      },
      start(kind, slot, mode) {
        this.leaving = true;
        UI.sfx('menu_select');
        UI.close(this, () => {
          if (!G.game) return;
          if (kind === 'continue') {
            G.game.continueGame(slot);
            if (G.game.mode === 'play' && typeof G.game.fade === 'function') { G.game.fadeAlpha = 1; G.game.fade(0, 1.0); }
          } else G.game.newGame(slot, mode);
        });
      },

      draw(ctx, a) {
        const t = UI.t;
        UI.drawTitleBackdrop(ctx, 1);
        const cover = 1 - (this.cover || 0);
        const logoA = Math.max(this.gateK, this.menuK) * (1 - Math.max(this.slotsK, this.modesK)) * cover;
        const ly = 250 - 20 * this.menuK;
        if (logoA > 0.01) {
          drawLogo(ctx, W / 2, ly, t, logoA);
          ctx.globalAlpha = a * logoA;
          UI.flourish(ctx, W / 2, ly + 46, 250, { alpha: 0.6, color: C.creamDim });
          ctx.font = UI.font(23, 'italic');
          ctx.fillStyle = C.creamDim;
          ctx.textAlign = 'center';
          ctx.textBaseline = 'middle';
          ctx.fillText(UI.text('ui.tagline', 'Every light gutters.'), W / 2, ly + 84);
          ctx.globalAlpha = a;
        }
        if (this.gateK > 0.01) {
          ctx.globalAlpha = a * this.gateK * (0.45 + 0.4 * (0.5 + 0.5 * Math.sin(t * 2.4)));
          ctx.font = UI.font(25);
          ctx.fillStyle = C.cream;
          ctx.textAlign = 'center';
          ctx.textBaseline = 'middle';
          UI.spacedText(ctx, UI.text('ui.pressAny', 'Press any key'), W / 2, 560, 3, 'center');
          ctx.globalAlpha = a;
        }
        if (this.menuK * cover > 0.01) {
          ctx.globalAlpha = a * this.menuK * cover;
          UI.drawMenu(ctx, this.items, this.sel, W / 2, 452, { size: 28, gap: 50, t });
          UI.hints(ctx, [['confirm', UI.text('ui.confirm', 'Confirm')], ['cancel', UI.text('ui.back', 'Back')]], W / 2, 676, 'center', { alpha: 0.55 });
          ctx.globalAlpha = a;
        }
        if (this.slotsK > 0.01) this.drawSlots(ctx, a * this.slotsK, t);
        if (this.modesK > 0.01) this.drawModes(ctx, a * this.modesK, t);
        // version
        ctx.globalAlpha = a * 0.35;
        ctx.font = UI.font(14);
        ctx.fillStyle = C.creamDim;
        ctx.textAlign = 'right';
        ctx.textBaseline = 'alphabetic';
        ctx.fillText('v' + (G.VERSION || '1.0.0'), W - 18, H - 14);
        ctx.globalAlpha = a;
      },

      drawSlots(ctx, a, t) {
        ctx.globalAlpha = a;
        ctx.font = UI.font(40);
        ctx.fillStyle = C.cream;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        UI.spacedText(ctx, UI.text('ui.chooseSlot', 'Choose a Flame'), W / 2, 92, 2, 'center');
        UI.flourish(ctx, W / 2, 132, 200, { alpha: 0.6 });
        const px = 250, pw = 780, ph = 124;
        for (let i = 0; i < this.slots.length; i++) {
          const sl = this.slots[i];
          const py = 172 + i * 142;
          const on = this.slotSel === i;
          const usable = this.slotUsable(i);
          drawSlotPanel(ctx, sl, px, py, pw, ph, on, usable, this.slotMode, t, a);
          if (on && sl.raw) {
            const ex = px + pw + 82, ey = py + ph / 2;
            ctx.font = UI.font(22);
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';
            ctx.fillStyle = this.eraseFocus ? C.red : C.dim;
            const label = UI.text('ui.erase', 'Erase');
            ctx.fillText(label, ex, ey);
            if (this.eraseFocus) UI.pips(ctx, ex, ey, ctx.measureText(label).width / 2 - 4, t);
          }
        }
        const by = 172 + this.slots.length * 142 + 22;
        UI.drawMenu(ctx, [{ label: UI.text('ui.back', 'Back') }], this.slotSel === this.slots.length ? 0 : -1, W / 2, by, { size: 24, t });
        UI.hints(ctx, [['confirm', UI.text('ui.confirm', 'Confirm')], ['right', UI.text('ui.erase', 'Erase')], ['cancel', UI.text('ui.back', 'Back')]], W / 2, 690, 'center', { alpha: 0.55, size: 16 });
      },

      drawModes(ctx, a, t) {
        ctx.globalAlpha = a;
        ctx.font = UI.font(40);
        ctx.fillStyle = C.cream;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        UI.spacedText(ctx, UI.text('ui.chooseMode', 'Choose a Trial'), W / 2, 92, 2, 'center');
        UI.flourish(ctx, W / 2, 132, 200, { alpha: 0.6 });
        const px = 290, pw = 700, ph = 118;
        for (let i = 0; i < MODES.length; i++) {
          const m = MODES[i];
          const py = 176 + i * 140;
          const on = this.modeSel === i;
          const hard = m.id === 'hardcore';
          ctx.globalAlpha = a * (on ? 1 : 0.72);
          UI.panel(ctx, px, py, pw, ph, {
            border: on ? (hard ? 'rgba(240,140,120,0.6)' : 'rgba(170,215,255,0.6)') : 'rgba(236,228,207,0.2)',
            cornerAlpha: on ? 0.8 : 0.4, cornerColor: hard ? C.red : undefined,
          });
          const fx = px + 66, fy = py + ph / 2 + 22;
          if (on) UI.glow(ctx, fx, fy - 20, 100, hard ? '#d8402c' : m.flame === 'gold' ? '#d8a040' : '#3f8cff', 0.14);
          // icon: a candle carrying the mode's flame (hardcore: a single thin, red flame)
          ctx.fillStyle = '#e8e0ca';
          ctx.fillRect(fx - 6, fy - 2, 12, 26);
          UI.flame(ctx, fx, fy - 3, on ? 30 : 24, m.flame, t, i * 3 + 1, { glow: on ? 0.9 : 0.4 });
          const tx = px + 130;
          ctx.textAlign = 'left';
          ctx.textBaseline = 'middle';
          ctx.font = UI.font(30);
          ctx.fillStyle = on ? (hard ? '#f4b4a4' : C.creamHi) : C.cream;
          const lab = UI.text(m.label[0], m.label[1]);
          ctx.fillText(lab, tx, py + 40);
          if (on) { const lw = ctx.measureText(lab).width; UI.pips(ctx, tx + lw / 2, py + 40, lw / 2, t); }
          ctx.font = UI.font(19, 'italic');
          ctx.fillStyle = on ? C.creamDim : C.dim;
          ctx.fillText(UI.text(m.desc[0], m.desc[1]), tx, py + 80);
        }
        ctx.globalAlpha = a;
        UI.hints(ctx, [['confirm', UI.text('ui.confirm', 'Confirm')], ['cancel', UI.text('ui.back', 'Back')]], W / 2, 664, 'center', { alpha: 0.55, size: 16 });
      },
    };
    return s;
  }

  function approach(v, target, k) { return v < target ? Math.min(target, v + k) : Math.max(target, v - k); }

  function drawSlotPanel(ctx, sl, x, y, w, h, on, usable, mode, t, a) {
    const sum = sl.sum || {};
    const broken = !!(sl.exists && sum.broken);
    ctx.globalAlpha = a * (usable ? 1 : broken ? 0.8 : sl.raw ? 1 : 0.55);
    UI.panel(ctx, x, y, w, h, {
      border: on ? (broken ? 'rgba(224,138,120,0.5)' : 'rgba(170,215,255,0.6)') : 'rgba(236,228,207,0.2)', cornerAlpha: on ? 0.8 : 0.4,
      cornerColor: broken ? C.faint : sum.completed ? C.gold : undefined,
    });
    if (on && !broken) UI.glow(ctx, x + 70, y + h / 2, 110, '#3f8cff', 0.12);
    // numeral medallion
    const mx = x + 70, my = y + h / 2;
    ctx.strokeStyle = on ? 'rgba(170,215,255,0.7)' : 'rgba(236,228,207,0.3)';
    ctx.lineWidth = 1.2;
    ctx.beginPath(); ctx.arc(mx, my, 34, 0, TAU); ctx.stroke();
    ctx.beginPath(); ctx.arc(mx, my, 29, 0, TAU); ctx.stroke();
    ctx.font = UI.font(30);
    ctx.fillStyle = broken ? C.dim : sum.completed ? C.gold : on ? C.creamHi : C.creamDim;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(ROMAN[sl.slot] || String(sl.slot + 1), mx, my + 1);
    if (broken) { // a crack through the medallion
      ctx.strokeStyle = 'rgba(5,6,10,0.9)'; ctx.lineWidth = 2.2;
      ctx.beginPath(); ctx.moveTo(mx - 9, my - 35); ctx.lineTo(mx - 2, my - 14); ctx.lineTo(mx - 8, my - 2); ctx.lineTo(mx + 4, my + 12); ctx.lineTo(mx + 1, my + 35); ctx.stroke();
      ctx.strokeStyle = 'rgba(224,138,120,0.35)'; ctx.lineWidth = 0.8;
      ctx.beginPath(); ctx.moveTo(mx - 2, my - 14); ctx.lineTo(mx + 9, my - 20); ctx.stroke();
    }
    const tx = x + 132;
    ctx.textAlign = 'left';
    if (sl.unreadable) {
      ctx.font = UI.font(22, 'italic');
      ctx.fillStyle = C.red;
      ctx.fillText(UI.text('ui.slotUnreadable', 'This save could not be read.'), tx, my);
      return;
    }
    if (!sl.exists) {
      ctx.font = UI.font(26, mode === 'new' ? 'italic' : '');
      ctx.fillStyle = mode === 'new' ? (on ? C.creamHi : C.creamDim) : C.dim;
      ctx.fillText(mode === 'new' ? UI.text('ui.slotNew', 'New Journey') : UI.text('ui.slotEmpty', 'Empty'), tx, my);
      return;
    }
    ctx.font = UI.font(30);
    ctx.fillStyle = broken ? C.creamDim : on ? C.creamHi : C.cream;
    const regionText = sum.regionName || UI.text('ui.unknown', '???');
    ctx.fillText(regionText, tx, y + 44);
    // the run's difficulty, small, after the region name
    const rw = ctx.measureText(regionText).width;
    const runMode = sum.mode || 'easy';
    ctx.font = UI.font(17, 'italic');
    ctx.fillStyle = runMode === 'hardcore' ? C.red : runMode === 'standard' ? '#a9c6dc' : C.goldDim;
    ctx.globalAlpha = a * (broken ? 0.6 : 0.85);
    ctx.fillText(modeLabel(runMode), tx + rw + 18, y + 46);
    ctx.globalAlpha = a * (usable ? 1 : broken ? 0.8 : sl.raw ? 1 : 0.55);
    ctx.font = UI.font(19);
    ctx.fillStyle = C.creamDim;
    const info = UI.text('ui.playTime', 'Play Time') + '  ' + (sum.playTimeText || '0:00') + '      ' +
      UI.text('ui.completion', 'Completion') + '  ' + (sum.completion | 0) + '%';
    ctx.fillText(info, tx, y + 86);
    // right column: completed marker or candles, and cinders
    const rx = x + w - 34;
    if (broken) {
      // a snuffed candle: a short wax stub, a bent black wick and a curl of smoke (no flame)
      ctx.font = UI.font(18, 'italic');
      ctx.fillStyle = C.red;
      ctx.textAlign = 'right';
      const lab = UI.text('ui.slotSnuffed', 'Snuffed');
      ctx.fillText(lab, rx, y + 40);
      const lw = ctx.measureText(lab).width;
      const cx = rx - lw - 18, by = y + 52;
      ctx.fillStyle = '#9a9384';
      ctx.fillRect(cx - 4, by - 10, 8, 10);
      ctx.beginPath(); ctx.ellipse(cx, by - 10, 4, 1.6, 0, 0, TAU); ctx.fill();
      ctx.strokeStyle = '#141210'; ctx.lineWidth = 1.6;
      ctx.beginPath(); ctx.moveTo(cx, by - 11); ctx.quadraticCurveTo(cx + 1, by - 15, cx + 3, by - 16); ctx.stroke();
      const pa = ctx.globalAlpha;
      ctx.strokeStyle = 'rgba(190,186,176,0.4)'; ctx.lineWidth = 1.2;
      ctx.beginPath();
      for (let k = 0; k <= 12; k++) {
        const sy = by - 17 - k * 2.2, sx = cx + 3 + Math.sin(k * 0.7 + t * 1.6) * (1 + k * 0.25);
        if (k === 0) ctx.moveTo(sx, sy); else ctx.lineTo(sx, sy);
      }
      ctx.globalAlpha = pa * 0.8;
      ctx.stroke();
      ctx.globalAlpha = pa;
    } else if (sum.completed) {
      ctx.font = UI.font(18, 'italic');
      ctx.fillStyle = C.gold;
      ctx.textAlign = 'right';
      const lab = UI.text('ui.slotComplete', 'Journey Complete');
      ctx.fillText(lab, rx, y + 40);
      const lw = ctx.measureText(lab).width;
      UI.flame(ctx, rx - lw - 16, y + 48, 16, 'gold', t, sl.slot);
    } else {
      const mh = Math.max(1, Math.min(10, sum.maxHealth | 0 || 5));
      for (let i = 0; i < mh; i++) {
        const cx = rx - (mh - 1 - i) * 15 - 4, by = y + 50;
        ctx.fillStyle = '#e8e0ca';
        ctx.fillRect(cx - 3.5, by - 15, 7, 15);
        UI.flame(ctx, cx, by - 16, 9, 'blue', t, i + sl.slot * 3, { glow: 0.5 });
      }
    }
    UI.drawCinderIcon(ctx, rx - 64, y + 86, 7, t);
    ctx.font = UI.font(20);
    ctx.fillStyle = C.cream;
    ctx.textAlign = 'left';
    ctx.fillText(String(sum.cinders | 0), rx - 50, y + 87);
  }

  // ------------------------------------------------------------------ API
  /** Open the title screen (clears all screens/overlays). Starts at the "press any key" gate on first boot. */
  UI.openTitle = function () {
    UI.closeAll(false);
    if (UI.clearOverlays) UI.clearOverlays();
    return UI.push(makeTitle());
  };
})();
