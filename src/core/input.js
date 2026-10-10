// src/core/input.js — G.input: keyboard + gamepad + virtual (test) input, sampled once per fixed step.
// No DOM access at load time: G.input.init(target) is called by main.js at boot.
(function () {
  'use strict';
  const G = globalThis.G;

  const ACTIONS = ['left', 'right', 'up', 'down', 'jump', 'attack', 'dash', 'spell', 'interact',
    'map', 'inventory', 'pause', 'confirm', 'cancel'];

  // KeyboardEvent.code → actions (both key sets work at once). interact = up.
  const KEYMAP = {
    left: ['ArrowLeft', 'KeyA'],
    right: ['ArrowRight', 'KeyD'],
    up: ['ArrowUp', 'KeyW'],
    down: ['ArrowDown', 'KeyS'],
    jump: ['KeyZ', 'Space'],
    attack: ['KeyX', 'KeyJ'],
    dash: ['KeyC', 'KeyK', 'ShiftLeft', 'ShiftRight'],
    spell: ['KeyV', 'KeyL'],
    interact: ['ArrowUp', 'KeyW'],
    map: ['Tab', 'KeyM'],
    inventory: ['KeyI'],
    pause: ['Escape', 'KeyP'],
    confirm: ['Enter', 'NumpadEnter', 'KeyZ', 'Space', 'KeyJ'],
    cancel: ['Escape', 'KeyX', 'Backspace'],
  };
  // Standard-mapping gamepad buttons per action (axes handled separately).
  const PADMAP = {
    left: [14], right: [15], up: [12], down: [13],
    jump: [0], attack: [2], dash: [5, 7], spell: [1], interact: [12],
    map: [8], inventory: [4], pause: [9], confirm: [0], cancel: [1],
  };
  const KEY_LABELS = {
    ArrowLeft: '←', ArrowRight: '→', ArrowUp: '↑', ArrowDown: '↓', Space: 'Space', Tab: 'Tab',
    Escape: 'Esc', Enter: 'Enter', NumpadEnter: 'Enter', Backspace: 'Backspace',
    ShiftLeft: 'Shift', ShiftRight: 'Shift',
  };
  const PAD_LABELS = { 0: 'A', 1: 'B', 2: 'X', 3: 'Y', 4: 'LB', 5: 'RB', 6: 'LT', 7: 'RT', 8: 'Back', 9: 'Start', 12: 'D-pad ↑', 13: 'D-pad ↓', 14: 'D-pad ←', 15: 'D-pad →' };
  const PAD_ACTION_LABELS = { left: '←', right: '→', up: '↑', down: '↓', interact: '↑' };
  const DEADZONE = 0.35;

  const codeToActions = {};
  for (const a of ACTIONS) for (const code of KEYMAP[a]) (codeToActions[code] || (codeToActions[code] = [])).push(a);

  const held = new Set();          // key codes currently held
  const tapLatch = new Set();      // actions pressed since the last update (catches sub-frame taps)
  let anyKeyLatch = false;         // any key at all (incl. unmapped) since last update
  const cur = {}, prev = {}, pressedNow = {}, releasedNow = {};
  let virtual = {};
  let padAny = false;
  let attached = null;

  for (const a of ACTIONS) { cur[a] = prev[a] = pressedNow[a] = releasedNow[a] = false; }

  // Bindings use KeyboardEvent.code (the physical key position), so the labels must name the key PRINTED at that
  // position on the player's layout (QA ui r2: on AZERTY/QWERTZ the hints said 'Z' for jump). layoutLabels maps
  // code -> printed key: filled from navigator.keyboard.getLayoutMap() when available (Chromium, secure contexts) and
  // learned from e.key on every key press (any browser; also follows a layout switched mid-game). Without either, the
  // label falls back to the code name (QWERTY).
  const layoutLabels = {};
  const LABEL_CODE = /^(Key[A-Z]|Digit[0-9]|Minus|Equal|BracketLeft|BracketRight|Backslash|Semicolon|Quote|Backquote|Comma|Period|Slash|IntlBackslash|IntlRo|IntlYen)$/;
  function setLabel(code, ch) {
    if (typeof code !== 'string' || !LABEL_CODE.test(code) || typeof ch !== 'string') return false;
    if (Array.from(ch).length !== 1 || !/\S/.test(ch) || /\p{C}|\p{M}/u.test(ch)) return false;
    const up = ch.toUpperCase();
    if (Array.from(up).length !== 1) return false;   // e.g. 'ß' -> 'SS': keep the single printed glyph
    if (layoutLabels[code] === up) return false;
    layoutLabels[code] = up;
    input.labelsVersion++;
    return true;
  }
  function learnLabel(e, code) {
    try {
      if (!e || typeof e.key !== 'string' || e.ctrlKey || e.metaKey || e.altKey) return;
      if (typeof e.getModifierState === 'function' && e.getModifierState('AltGraph')) return;
      const k = e.key;
      // with Shift only letters are kept (Shift+Digit1 is '!' or '1' depending on the layout; the label is the base key)
      if (e.shiftKey && k.toLowerCase() === k.toUpperCase()) return;
      setLabel(code, k);
    } catch (err) { /* labels are cosmetic */ }
  }
  function loadLayoutMap() {
    try {
      const kb = typeof navigator !== 'undefined' ? navigator.keyboard : null;
      if (!kb || typeof kb.getLayoutMap !== 'function') return;
      const pr = kb.getLayoutMap();
      if (!pr || typeof pr.then !== 'function') return;
      pr.then((map) => {
        if (!map || typeof map.forEach !== 'function') return;
        map.forEach((ch, code) => { setLabel(code, ch); });
      }, () => { /* not allowed here (e.g. iframe / insecure context): e.key learning still works */ });
    } catch (err) { /* ignore */ }
  }

  function onKeyDown(e) {
    const code = e.code || e.key;
    input.lastDevice = 'keyboard';
    const mapped = codeToActions[code];
    if (mapped && !e.ctrlKey && !e.metaKey && !e.altKey) e.preventDefault();
    learnLabel(e, code);
    if (e.repeat) return;
    held.add(code);
    anyKeyLatch = true;
    if (mapped) for (const a of mapped) tapLatch.add(a);
  }
  function onKeyUp(e) {
    const code = e.code || e.key;
    held.delete(code);
    if (codeToActions[code] && !e.ctrlKey && !e.metaKey) e.preventDefault();
  }
  function onBlur() { held.clear(); }

  function keyboardHeld(a) {
    const codes = KEYMAP[a];
    for (let i = 0; i < codes.length; i++) if (held.has(codes[i])) return true;
    return false;
  }

  // The pad disappeared (unplugged, battery died): prompts fall back to keyboard labels and, if the pad was the
  // device in use, 'gamepadLost' {wasActive} lets main.js pause the game (HK-style). Detected by the
  // 'gamepaddisconnected' event and, as a fallback, by polling (a pad seen last step and gone now).
  let padPresent = false;
  function padLost() {
    padPresent = false;
    for (const k in padPrev) delete padPrev[k];
    activePad = -1;
    const wasActive = input.lastDevice === 'gamepad';
    if (wasActive) input.lastDevice = 'keyboard';
    if (G.events) G.events.emit('gamepadLost', { wasActive });
  }
  function onPadDisconnected() {
    let pads = null;
    try { pads = (typeof navigator !== 'undefined' && navigator.getGamepads) ? navigator.getGamepads() : null; } catch (e) { pads = null; }
    if (pads) for (let i = 0; i < pads.length; i++) if (pads[i] && pads[i].connected !== false) return; // another pad remains
    if (padPresent || input.lastDevice === 'gamepad') padLost();
  }

  // Several pads can be connected at once (an idle virtual pad, a wheel, a DS4 plus its XInput twin...). Only ONE pad
  // drives the game: the "active" pad, i.e. the one with the most recent activity (a new button press, or a stick axis
  // pushed out of its resting range). Until a pad shows activity, the first pad with the standard mapping (else the
  // first connected one) is used. An axis that already rests outside the deadzone when a pad is first seen (a pedal)
  // is not counted as activity. Per-pad previous state is kept by pad index (QA robust r2: the player's pad at index 1
  // was ignored when an idle pad sat at index 0).
  const padPrev = {};              // pad index -> { buttons: bool[], axes: number[] }
  let activePad = -1;
  function padPressed(pad, i) { const b = pad.buttons && pad.buttons[i]; return !!(b && (b.pressed || b.value > 0.5)); }
  // Updates the pad's previous state; returns 2 = new button press, 1 = a stick axis left its resting range, 0 = none.
  function padActivity(pad, key) {
    const ax = pad.axes || [];
    let prevS = padPrev[key];
    if (!prevS) prevS = padPrev[key] = { buttons: [], axes: Array.from(ax, (v) => v || 0) };
    let act = 0;
    const b = pad.buttons || [];
    for (let i = 0; i < b.length; i++) {
      const p = padPressed(pad, i);
      if (p && !prevS.buttons[i]) act = 2;
      prevS.buttons[i] = p;
    }
    for (let i = 0; i < ax.length && i < 4; i++) {
      const v = ax[i] || 0, pv = prevS.axes[i] || 0;
      if (!act && Math.abs(v) > 0.6 && Math.abs(pv) < DEADZONE) act = 1;
      prevS.axes[i] = v;
    }
    return act;
  }

  function pollGamepad(state) {
    padAny = false;
    let pads = null;
    try { pads = (typeof navigator !== 'undefined' && navigator.getGamepads) ? navigator.getGamepads() : null; } catch (e) { pads = null; }
    const live = [], keys = [];
    if (pads) {
      for (let i = 0; i < pads.length; i++) {
        const p = pads[i];
        if (p && p.connected !== false) { live.push(p); keys.push(typeof p.index === 'number' ? p.index : i); }
      }
    }
    if (!live.length) {
      if (padPresent) padLost();
      activePad = -1;
      for (const k in padPrev) delete padPrev[k];
      return;
    }
    padPresent = true;
    let moved = false, activeHit = false, firstHit = -1;
    for (let i = 0; i < live.length; i++) {
      const act = padActivity(live[i], keys[i]);
      if (!act) continue;
      if (act === 2) padAny = true;
      moved = true;
      if (keys[i] === activePad) activeHit = true; else if (firstHit < 0) firstHit = keys[i];
    }
    if (!activeHit && firstHit >= 0) activePad = firstHit;
    let pad = null;
    for (let i = 0; i < live.length; i++) if (keys[i] === activePad) { pad = live[i]; break; }
    if (!pad) {
      let j = live.findIndex((p) => p.mapping === 'standard');
      if (j < 0) j = 0;
      pad = live[j]; activePad = keys[j];
    }
    for (const k in padPrev) if (keys.indexOf(+k) < 0) delete padPrev[k];
    for (const a of ACTIONS) {
      const list = PADMAP[a];
      for (let i = 0; i < list.length; i++) if (padPressed(pad, list[i])) { state[a] = true; break; }
    }
    const ax = pad.axes || [];
    const lx = ax[0] || 0, ly = ax[1] || 0;
    if (lx < -DEADZONE) state.left = true;
    if (lx > DEADZONE) state.right = true;
    if (ly < -DEADZONE) { state.up = true; state.interact = true; }
    if (ly > DEADZONE) state.down = true;
    // device switch on any new activity (a button press, or a stick pushed out of its resting range)
    if (moved || Math.abs(lx) > 0.6 || Math.abs(ly) > 0.6) input.lastDevice = 'gamepad';
  }

  const padState = {};
  const input = {
    ACTIONS, KEYMAP, PADMAP,
    lastDevice: 'keyboard',

    init(target) {
      const t = target || (typeof window !== 'undefined' ? window : null);
      if (!t || attached === t) return;
      attached = t;
      t.addEventListener('keydown', onKeyDown, { passive: false });
      t.addEventListener('keyup', onKeyUp, { passive: false });
      t.addEventListener('blur', onBlur);
      t.addEventListener('gamepaddisconnected', onPadDisconnected);
      loadLayoutMap();
      try {
        const kb = typeof navigator !== 'undefined' ? navigator.keyboard : null;
        if (kb && typeof kb.addEventListener === 'function') kb.addEventListener('layoutchange', loadLayoutMap);
      } catch (err) { /* ignore */ }
      // the title gate ("press any key") gives focus/activation; re-read the map then too
      t.addEventListener('focus', loadLayoutMap);
    },
    /** Re-reads the keyboard layout map (labels). Called at boot; safe to call any time. */
    refreshLabels: loadLayoutMap,
    /** Bumped whenever a key label changes (cached hint strings can compare it). */
    labelsVersion: 0,
    /** Test hook: the printed-key override table (code -> label). */
    _layoutLabels: layoutLabels,
    _setLabel: setLabel,

    // Called once per fixed step by the engine BEFORE game logic.
    update() {
      for (const a of ACTIONS) padState[a] = false;
      pollGamepad(padState);
      for (const a of ACTIONS) {
        prev[a] = cur[a];
        cur[a] = keyboardHeld(a) || padState[a] || !!virtual[a] || tapLatch.has(a);
        pressedNow[a] = cur[a] && !prev[a];
        releasedNow[a] = !cur[a] && prev[a];
      }
      // A tap that was pressed AND released between two steps still counts as one press.
      for (const a of tapLatch) if (!prev[a]) pressedNow[a] = true;
      input._anyNow = anyKeyLatch || padAny;
      tapLatch.clear();
      anyKeyLatch = false;
    },

    down: (a) => !!cur[a],
    pressed: (a) => !!pressedNow[a],
    released: (a) => !!releasedNow[a],
    consume(a) { pressedNow[a] = false; },
    consumeAll() { for (const a of ACTIONS) pressedNow[a] = false; input._anyNow = false; },
    anyPressed() {
      if (input._anyNow) return true;
      for (const a of ACTIONS) if (pressedNow[a]) return true;
      return false;
    },
    _anyNow: false,

    // Label for on-screen prompts, based on the last used device.
    label(a) {
      if (input.lastDevice === 'gamepad') {
        if (PAD_ACTION_LABELS[a]) return PAD_ACTION_LABELS[a];
        const list = PADMAP[a];
        return list && list.length ? (PAD_LABELS[list[0]] || '?') : '?';
      }
      const codes = KEYMAP[a];
      return codes && codes.length ? keyLabel(codes[0]) : '?';
    },
    // All keyboard labels for an action (Controls screen), e.g. ['Z', 'Space'].
    keyLabels(a) { return (KEYMAP[a] || []).map(keyLabel).filter((v, i, arr) => arr.indexOf(v) === i); },
    padLabels(a) { return (PADMAP[a] || []).map((i) => PAD_LABELS[i] || ('Button ' + i)); },

    setVirtual(state) {
      virtual = Object.assign({}, state || {});
      if (virtual.interact === undefined && virtual.up) virtual.interact = true;
    },
    clearVirtual() { virtual = {}; },
    getVirtual() { return Object.assign({}, virtual); },
    // Clears all held state (e.g. after a screen change) so stale holds don't leak into gameplay.
    reset() {
      held.clear(); tapLatch.clear(); anyKeyLatch = false; virtual = {};
      for (const a of ACTIONS) { cur[a] = prev[a] = pressedNow[a] = releasedNow[a] = false; }
    },
  };

  function keyLabel(code) {
    if (KEY_LABELS[code]) return KEY_LABELS[code];
    if (layoutLabels[code]) return layoutLabels[code];
    if (code.indexOf('Key') === 0) return code.slice(3);
    if (code.indexOf('Digit') === 0) return code.slice(5);
    return code;
  }

  G.input = input;
})();
