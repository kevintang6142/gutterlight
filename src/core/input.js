// src/core/input.js — G.input: rebindable keyboard + mouse + gamepad + virtual (test) input, sampled once per fixed
// step. No DOM access at load time: G.input.init(target) is called by main.js at boot.
//
// Bindings: every GAMEPLAY action has three slots — two keyboard/mouse slots and one gamepad slot — holding a typed
// input id or null:  'key:<KeyboardEvent.code>' (modifiers merged: 'key:Shift', 'key:Control', 'key:Alt', 'key:Meta'),
// 'mouse:<button>' (0 left, 1 middle, 2 right, 3 back, 4 forward), 'pad:<standard button index>', 'axis:<index>-|+'.
// The menu actions confirm/cancel are derived (never bound directly) and the lockout fallbacks (Enter / Esc /
// arrows / pad A,B,D-pad in menus; Esc always pauses) work whatever the bindings are.
(function () {
  'use strict';
  const G = globalThis.G;

  const GAME_ACTIONS = ['left', 'right', 'up', 'down', 'jump', 'attack', 'dash', 'spell', 'interact',
    'map', 'inventory', 'pause'];
  const ACTIONS = GAME_ACTIONS.concat(['confirm', 'cancel']);
  const SLOT_COUNT = 3;          // 0, 1 = keyboard/mouse; 2 = gamepad
  const PAD_SLOT = 2;
  const BIND_VERSION = 1;

  // Defaults = the original static maps (TECH_SPEC §6).
  const DEFAULTS = {
    left: ['key:ArrowLeft', 'key:KeyA', 'pad:14'],
    right: ['key:ArrowRight', 'key:KeyD', 'pad:15'],
    up: ['key:ArrowUp', 'key:KeyW', 'pad:12'],
    down: ['key:ArrowDown', 'key:KeyS', 'pad:13'],
    jump: ['key:KeyZ', 'key:Space', 'pad:0'],
    attack: ['key:KeyX', 'key:KeyJ', 'pad:2'],
    dash: ['key:KeyC', 'key:Shift', 'pad:5'],
    spell: ['key:KeyV', 'key:KeyL', 'pad:1'],
    interact: ['key:ArrowUp', 'key:KeyW', 'pad:12'],
    map: ['key:Tab', 'key:KeyM', 'pad:8'],
    inventory: ['key:KeyI', null, 'pad:4'],
    pause: ['key:Escape', 'key:KeyP', 'pad:9'],
  };
  // Default inputs that do not fit the visible slots (dash had C/K/Shift and RB/RT). They stay active until the
  // player edits that column group of the action (any keyboard slot drops the key extras, the pad slot the pad
  // extras), the input is bound elsewhere, or until a reset brings them back.
  const DEFAULT_EXTRA = { dash: ['key:KeyK', 'pad:7'] };
  // Actions allowed to share an input (interact = up by default, on every device).
  const SHARE = { up: 'interact', interact: 'up' };
  // Implicit inputs: active for the action while not bound to any other gameplay action (the left stick always
  // moves unless rebound; Start pauses unless rebound).
  const IMPLICIT = {
    left: ['axis:0-'], right: ['axis:0+'], up: ['axis:1-'], down: ['axis:1+'], interact: ['axis:1-'],
    pause: ['pad:9'],
  };
  // Lockout protection. ALWAYS: whatever the bindings. MENU: only while a menu/screen has the input (title,
  // pause, any blocking UI screen) so a bad binding can never trap the player.
  const ALWAYS = {
    pause: ['key:Escape'],
    confirm: ['key:Enter', 'key:NumpadEnter', 'pad:0'],
    cancel: ['key:Escape', 'key:Backspace', 'pad:1'],
  };
  const MENU = {
    up: ['key:ArrowUp', 'pad:12', 'axis:1-'],
    down: ['key:ArrowDown', 'pad:13', 'axis:1+'],
    left: ['key:ArrowLeft', 'pad:14', 'axis:0-'],
    right: ['key:ArrowRight', 'pad:15', 'axis:0+'],
  };
  // Keys the capture never binds: Escape cancels a capture, Backspace/Delete clear the slot, Enter always confirms in
  // menus (a habitual double Enter must not rebind a cell; old/corrupt tables holding Enter drop it on load).
  const RESERVED = { 'key:Escape': 'pause', 'key:Backspace': null, 'key:Delete': null, 'key:Enter': null, 'key:NumpadEnter': null };
  // OS keys never bound (setBinding reason 'os'): Win opens Start and blurs the window; on macOS the keyup of other
  // keys is not delivered while Cmd is held (stuck movement) and Cmd+W/Q/M/H cannot be blocked.
  const FORBIDDEN = { 'key:Meta': 1 };
  // A page cannot block these Ctrl combos (close tab, new tab, new window): binding Ctrl next to W/T/N gets a warning.
  const CTRL_UNBLOCKABLE = ['key:KeyW', 'key:KeyT', 'key:KeyN'];
  // In menus a direction fallback means only its direction (jump on ↑ must not also confirm; pause on ↓ must not
  // close the pause menu), and the confirm/cancel fallbacks never navigate. Defaults never put these on other actions
  // (except up's inputs on interact, its share partner), so default behaviour is unchanged.
  const MENU_DIR_OWNER = {};
  for (const a in MENU) for (const id of MENU[a]) MENU_DIR_OWNER[id] = a;
  const MENU_BUTTON_IDS = {};
  for (const id of ALWAYS.confirm.concat(ALWAYS.cancel)) MENU_BUTTON_IDS[id] = 1;
  // Gamepad pause must stay reachable (no Esc on a pad): if pause has no pad input at all, the first free of these.
  const PAD_PAUSE_FALLBACK = ['pad:9', 'pad:8', 'pad:16'];
  // Legacy menu keys kept while their gameplay owner still has them (defaults: J confirms, X goes back).
  const LEGACY_MENU = { confirm: [['key:KeyJ', 'attack']], cancel: [['key:KeyX', 'attack']] };

  const KEY_LABELS = {
    ArrowLeft: '←', ArrowRight: '→', ArrowUp: '↑', ArrowDown: '↓', Space: 'Space', Tab: 'Tab',
    Escape: 'Esc', Enter: 'Enter', NumpadEnter: 'Enter', Backspace: 'Backspace', Delete: 'Del', Insert: 'Ins',
    Shift: 'Shift', ShiftLeft: 'Shift', ShiftRight: 'Shift', Control: 'Ctrl', Alt: 'Alt', Meta: 'Meta',
    CapsLock: 'Caps', Home: 'Home', End: 'End', PageUp: 'PgUp', PageDown: 'PgDn', ContextMenu: 'Menu',
    NumpadAdd: 'Num +', NumpadSubtract: 'Num -', NumpadMultiply: 'Num *', NumpadDivide: 'Num /', NumpadDecimal: 'Num .',
  };
  // printable keys when the layout is unknown (QWERTY); the learned layout label wins
  const PUNCT_LABELS = {
    Minus: '-', Equal: '=', BracketLeft: '[', BracketRight: ']', Backslash: '\\', Semicolon: ';', Quote: "'",
    Backquote: '`', Comma: ',', Period: '.', Slash: '/', IntlBackslash: '\\',
  };
  const PAD_LABELS = { 0: 'A', 1: 'B', 2: 'X', 3: 'Y', 4: 'LB', 5: 'RB', 6: 'LT', 7: 'RT', 8: 'Back', 9: 'Start', 10: 'LS', 11: 'RS', 12: 'D-pad ↑', 13: 'D-pad ↓', 14: 'D-pad ←', 15: 'D-pad →', 16: 'Home' };
  const MOUSE_LABELS = { 0: 'LMB', 1: 'MMB', 2: 'RMB', 3: 'Mouse 4', 4: 'Mouse 5' };
  const AXIS_LABELS = { '0-': 'LS ←', '0+': 'LS →', '1-': 'LS ↑', '1+': 'LS ↓', '2-': 'RS ←', '2+': 'RS →', '3-': 'RS ↑', '3+': 'RS ↓' };
  // compact on-screen prompts for pad movement (D-pad or stick): the arrow of the input actually bound
  const PAD_ARROW_ACTIONS = { left: 1, right: 1, up: 1, down: 1, interact: 1 };
  const PAD_ARROWS = { 'pad:12': '↑', 'axis:1-': '↑', 'pad:13': '↓', 'axis:1+': '↓', 'pad:14': '←', 'axis:0-': '←', 'pad:15': '→', 'axis:0+': '→' };
  // prompt label of an action with no input on the device in use (never the other device's label: pad X != key X)
  const UNBOUND_LABEL = '—';
  const DEADZONE = 0.35;
  const CAPTURE_AXIS = 0.6;
  const CAPTURE_TIMEOUT = 10;    // seconds without input: a capture cancels itself (pad users have no Esc)

  // ------------------------------------------------------------------ typed input ids
  const MOD_IDS = { ShiftLeft: 'Shift', ShiftRight: 'Shift', ControlLeft: 'Control', ControlRight: 'Control',
    AltLeft: 'Alt', AltRight: 'Alt', MetaLeft: 'Meta', MetaRight: 'Meta', OSLeft: 'Meta', OSRight: 'Meta' };
  const keyId = (code) => 'key:' + (MOD_IDS[code] || code);
  const ID_RE = /^(key:[A-Za-z][A-Za-z0-9]{0,31}|mouse:[0-9]|pad:([0-9]|[1-3][0-9])|axis:[0-9][+-])$/;
  function validId(id) { return typeof id === 'string' && ID_RE.test(id); }
  function kindOf(id) { return typeof id === 'string' ? id.slice(0, id.indexOf(':')) : ''; }
  const isPadKind = (id) => { const k = kindOf(id); return k === 'pad' || k === 'axis'; };
  const isKbmKind = (id) => { const k = kindOf(id); return k === 'key' || k === 'mouse'; };
  function slotAccepts(slot, id) { return slot === PAD_SLOT ? isPadKind(id) : isKbmKind(id); }

  // ------------------------------------------------------------------ binding table
  let slots = {};                 // action -> [s0, s1, s2]
  let extra = {};                 // action -> [id...]
  const sets = {};                // action -> ids active in play (bindings + extras + implicit + always)
  const menuSets = {};            // action -> additional ids active in menus
  const menuView = {};            // action -> every id active in menus (sets + menuSets - MENU_DIR_OWNER/MENU_BUTTON_IDS rules)
  let mouseBound = false;

  function copyTable(t) { const o = {}; for (const a of GAME_ACTIONS) o[a] = (t[a] || []).slice(); return o; }
  function defaultSlots() { return copyTable(DEFAULTS); }
  function defaultExtra() { const o = {}; for (const a of GAME_ACTIONS) o[a] = (DEFAULT_EXTRA[a] || []).slice(); return o; }
  function inputsOf(a) {
    const out = [];
    const s = slots[a] || [];
    for (let i = 0; i < SLOT_COUNT; i++) if (s[i]) out.push(s[i]);
    for (const id of (extra[a] || [])) out.push(id);
    return out;
  }
  /** Gameplay actions (other than `a` and its share partner) that use input id. */
  function ownersOf(id, except) {
    const out = [];
    for (const b of GAME_ACTIONS) {
      if (b === except || (except && SHARE[except] === b)) continue;
      if (inputsOf(b).indexOf(id) >= 0) out.push(b);
    }
    return out;
  }
  function boundAnywhere(id) { for (const b of GAME_ACTIONS) if (inputsOf(b).indexOf(id) >= 0) return true; return false; }
  /** Does pause keep a gamepad input in table (ns, ne)? (its pad slot / pad extras, or Start while nobody else has it) */
  function padPauseOk(ns, ne) {
    if (isPadKind(ns.pause[PAD_SLOT]) || ne.pause.some(isPadKind)) return true;
    for (const id of IMPLICIT.pause) {
      let owned = false;
      for (const b of GAME_ACTIONS) if (b !== 'pause' && (ns[b].indexOf(id) >= 0 || ne[b].indexOf(id) >= 0)) owned = true;
      if (!owned) return true;
    }
    return false;
  }

  function rebuild() {
    mouseBound = false;
    for (const a of ACTIONS) { sets[a] = new Set(); menuSets[a] = new Set(); }
    for (const a of GAME_ACTIONS) {
      for (const id of inputsOf(a)) { sets[a].add(id); if (kindOf(id) === 'mouse') mouseBound = true; }
      for (const id of (IMPLICIT[a] || [])) if (!ownersOf(id, a).length) sets[a].add(id);
    }
    // gamepad players can always pause: if pause lost every pad input (Start moved away), the first free fallback
    if (!Array.from(sets.pause).some(isPadKind)) {
      for (const id of PAD_PAUSE_FALLBACK) if (!boundAnywhere(id)) { sets.pause.add(id); break; }
    }
    for (const a in ALWAYS) for (const id of ALWAYS[a]) sets[a].add(id);
    // confirm also takes the keyboard/mouse inputs of jump (HK: jump confirms) + legacy keys still owned; never a
    // menu direction (jump on ↑ would move AND confirm in every menu: two ↑ in pause = Quit, Yes)
    for (const id of inputsOf('jump')) if (isKbmKind(id) && !MENU_DIR_OWNER[id]) sets.confirm.add(id);
    for (const m in LEGACY_MENU) for (const [id, owner] of LEGACY_MENU[m]) if (inputsOf(owner).indexOf(id) >= 0) sets[m].add(id);
    for (const a in MENU) for (const id of MENU[a]) if (!sets[a].has(id)) menuSets[a].add(id);
    for (const a of ACTIONS) {
      const v = new Set();
      for (const id of sets[a]) v.add(id);
      for (const id of menuSets[a]) v.add(id);
      for (const id of Array.from(v)) {
        const dir = MENU_DIR_OWNER[id];
        if (dir && dir !== a && SHARE[a] !== dir) v.delete(id);
        else if (MENU[a] && MENU_BUTTON_IDS[id]) v.delete(id);
      }
      menuView[a] = v;
    }
    input.labelsVersion++;
  }

  /** Validates a stored table ({v, slots, extra}); returns {slots, extra} (defaults for anything unusable). */
  function sanitize(raw) {
    const out = { slots: defaultSlots(), extra: defaultExtra() };
    if (!raw || typeof raw !== 'object' || raw.v !== BIND_VERSION || !raw.slots || typeof raw.slots !== 'object') return out;
    const s = {};
    for (const a of GAME_ACTIONS) {
      const arr = raw.slots[a];
      if (!Array.isArray(arr) || arr.length !== SLOT_COUNT) { s[a] = DEFAULTS[a].slice(); continue; }
      s[a] = [];
      for (let i = 0; i < SLOT_COUNT; i++) {
        const id = arr[i];
        if (id === null) s[a].push(null);
        else if (validId(id) && slotAccepts(i, id) && !FORBIDDEN[id] && (!(id in RESERVED) || RESERVED[id] === a)) s[a].push(id);
        else s[a].push(DEFAULTS[a][i]);   // corrupt entry -> that slot's default
      }
    }
    const e = {};
    const rawExtra = raw.extra && typeof raw.extra === 'object' ? raw.extra : null;
    for (const a of GAME_ACTIONS) {
      const allowed = DEFAULT_EXTRA[a] || [];
      const arr = rawExtra ? rawExtra[a] : allowed;
      e[a] = Array.isArray(arr) ? arr.filter((id, i) => allowed.indexOf(id) >= 0 && arr.indexOf(id) === i) : [];
    }
    // one owner per input (except the up/interact pair); within an action, no duplicates
    const claimed = {};
    for (const a of GAME_ACTIONS) {
      const mine = new Set();
      const keep = (id) => {
        if (mine.has(id)) return false;
        const owner = claimed[id];
        if (owner && owner !== a && SHARE[a] !== owner) return false;
        mine.add(id);
        if (!owner) claimed[id] = a;
        return true;
      };
      for (let i = 0; i < SLOT_COUNT; i++) if (s[a][i] && !keep(s[a][i])) s[a][i] = null;
      e[a] = e[a].filter(keep);
      if (!mine.size) return out;      // an action with no binding at all: the table is unusable -> defaults
    }
    out.slots = s; out.extra = e;
    return out;
  }
  function serialize() { return { v: BIND_VERSION, slots: copyTable(slots), extra: copyTable(extra) }; }
  function persist() {
    if (!G.settings) return;
    G.settings.bindings = serialize();
    if (G.Save && typeof G.Save.saveSettings === 'function') {
      try { G.Save.saveSettings(); } catch (err) { if (G.reportError) G.reportError(err, 'input.persist'); }
    }
  }

  // ------------------------------------------------------------------ printed-key labels
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
  function keyLabel(code) {
    if (KEY_LABELS[code]) return KEY_LABELS[code];
    if (layoutLabels[code]) return layoutLabels[code];
    if (PUNCT_LABELS[code]) return PUNCT_LABELS[code];
    if (code.indexOf('Key') === 0) return code.slice(3);
    if (code.indexOf('Digit') === 0) return code.slice(5);
    if (code.indexOf('Numpad') === 0) return 'Num ' + code.slice(6);
    return code;
  }
  /** Readable label of one typed input id ('key:KeyX' -> 'X', 'mouse:0' -> 'LMB', 'pad:2' -> 'X', 'axis:0-' -> 'LS ←'). */
  function labelOf(id) {
    if (!validId(id)) return '?';
    const k = kindOf(id), v = id.slice(k.length + 1);
    if (k === 'key') return keyLabel(v);
    if (k === 'mouse') return MOUSE_LABELS[v] || ('Mouse ' + (+v + 1));
    if (k === 'pad') return PAD_LABELS[v] || ('Button ' + v);
    if (k === 'axis') return AXIS_LABELS[v] || ('Axis ' + v);
    return '?';
  }

  // ------------------------------------------------------------------ raw device state
  const held = new Set();          // key codes currently held
  const mouseHeld = new Set();     // 'mouse:N' currently held
  const tapRaw = new Set();        // ids pressed since the last update (catches sub-frame taps)
  const padDown = new Set();       // ids down on the active pad this step
  const swallow = new Set();       // ids ignored until physically released (the input that ended a capture)
  let anyKeyLatch = false;         // any key at all (incl. unbound) since last update
  const cur = {}, prev = {}, pressedNow = {}, releasedNow = {};
  let virtual = {};
  let padAny = false;
  let attached = null;
  for (const a of ACTIONS) { cur[a] = prev[a] = pressedNow[a] = releasedNow[a] = false; }

  // capture (Controls screen): the next physical input of any device
  let capture = null;              // {cb, t}
  let captureResult = null;        // delivered from update()
  let lastCaptureEnd = -1e9;       // ms; the mouse button that ended a capture: its mouseup / auxclick / context
  let lastCaptureBtn = -1;         // menu (RMB) that follow are suppressed too, even if the binding was refused
  const nowMs = () => (typeof performance !== 'undefined' && performance.now ? performance.now() : Date.now());
  function captureHit(res) {
    if (!capture || captureResult) return;
    captureResult = res;
  }

  function onKeyDown(e) {
    const code = e.code || e.key;
    if (!code) return;
    input.lastDevice = 'keyboard';
    const id = keyId(code);
    learnLabel(e, code);
    const mod = e.ctrlKey || e.metaKey || e.altKey;
    if (capture) {
      e.preventDefault();
      if (e.repeat) return;
      held.add(code);
      if (code === 'Escape') captureHit({ cancel: true });
      else if (code === 'Backspace' || code === 'Delete') captureHit({ clear: true });
      else captureHit({ input: id });
      return;
    }
    // keys the game uses never reach the browser (Tab focus, arrows/space scrolling, Alt menu bar...). With a BOUND
    // modifier held (Alt/Ctrl as dash...), the game key pressed with it is still a game key: Alt+← must not go Back,
    // Ctrl+D/P/S must not open dialogs. Combos with an unbound modifier (Ctrl+R, F5, Ctrl+Shift+I...) stay the browser's.
    const gameKey = usedKey(id) || code === 'Tab' || code === 'Space' || code.indexOf('Arrow') === 0 || code === 'Backspace';
    const modBound = (e.ctrlKey && usedKey('key:Control')) || (e.altKey && usedKey('key:Alt')) || (e.metaKey && usedKey('key:Meta'));
    if (gameKey && (!mod || modBound)) e.preventDefault();
    else if (mod && usedKey(id) && (code.indexOf('Alt') === 0 || code.indexOf('Control') === 0)) e.preventDefault();
    held.add(code);
    if (e.repeat) return;
    anyKeyLatch = true;
    tapRaw.add(id);
  }
  function onKeyUp(e) {
    const code = e.code || e.key;
    if (!code) return;
    held.delete(code);
    // macOS: while Cmd is held the keyup of other keys is never delivered; drop every hold when Cmd goes up (a key
    // still physically down is held again by its next auto-repeat keydown)
    if (keyId(code) === 'key:Meta') held.clear();
    if (!e.ctrlKey && !e.metaKey && usedKey(keyId(code))) e.preventDefault();
  }
  function usedKey(id) {
    for (const a of ACTIONS) if (sets[a] && (sets[a].has(id) || menuSets[a].has(id))) return true;
    return false;
  }
  function onBlur() { held.clear(); mouseHeld.clear(); }

  // Mouse: presses count only on the game canvas (or the page around it), releases anywhere. Only bound buttons
  // (or a capture) have their default prevented; unbound clicks never become actions.
  function gameTarget(e) {
    const t = e && e.target;
    if (!t) return true;
    if (typeof window !== 'undefined' && t === window) return true;
    const tag = t.tagName ? String(t.tagName).toUpperCase() : '';
    if (!tag) return true;    // document
    return tag === 'CANVAS' || tag === 'BODY' || tag === 'HTML';
  }
  function mouseIsBound(id) { return boundAnywhere(id) || usedKey(id); }
  function onMouseDown(e) {
    if (!e || typeof e.button !== 'number' || !gameTarget(e)) return;
    const id = 'mouse:' + e.button;
    if (capture) {
      e.preventDefault();
      input.lastDevice = 'keyboard';
      mouseHeld.add(id);
      captureHit({ input: id });
      return;
    }
    if (!mouseIsBound(id)) return;
    e.preventDefault();      // no text selection, middle-click autoscroll, ...
    input.lastDevice = 'keyboard';
    mouseHeld.add(id);
    tapRaw.add(id);
    // preventDefault on mousedown can keep focus where it was: make sure the keyboard still reaches the game
    try { const c = e.target; if (c && c.tagName && String(c.tagName).toUpperCase() === 'CANVAS' && typeof c.focus === 'function') c.focus({ preventScroll: true }); } catch (err) { /* ignore */ }
  }
  function onMouseUp(e) {
    if (!e || typeof e.button !== 'number') return;
    const id = 'mouse:' + e.button;
    mouseHeld.delete(id);
    // back/forward buttons navigate the page on mouseup in Chromium
    if ((mouseIsBound(id) || capture || justCaptured(e.button)) && gameTarget(e)) e.preventDefault();
  }
  function onAuxClick(e) {
    if (!e || typeof e.button !== 'number') return;
    if ((mouseIsBound('mouse:' + e.button) || capture || justCaptured(e.button)) && gameTarget(e)) e.preventDefault();
  }
  function onContextMenu(e) {
    if (!e || !gameTarget(e)) return;
    if (mouseBound || capture || justCaptured(2)) e.preventDefault();
  }
  function justCaptured(button) { return button === lastCaptureBtn && nowMs() - lastCaptureEnd < 1000; }

  // ------------------------------------------------------------------ gamepad
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
  function getPads() {
    try { return (typeof navigator !== 'undefined' && navigator.getGamepads) ? navigator.getGamepads() : null; } catch (e) { return null; }
  }
  function onPadDisconnected() {
    const pads = getPads();
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
  // Updates the pad's previous state; returns {act: 2 = new button press, 1 = a stick axis left its resting range,
  // 0 = none, id: the first new input id (for a capture)}.
  function padActivity(pad, key) {
    const ax = pad.axes || [];
    let prevS = padPrev[key];
    if (!prevS) prevS = padPrev[key] = { buttons: [], axes: Array.from(ax, (v) => v || 0) };
    let act = 0, id = null;
    const b = pad.buttons || [];
    for (let i = 0; i < b.length; i++) {
      const p = padPressed(pad, i);
      if (p && !prevS.buttons[i]) { act = 2; if (!id) id = 'pad:' + i; }
      prevS.buttons[i] = p;
    }
    for (let i = 0; i < ax.length; i++) {
      const v = ax[i] || 0, pv = prevS.axes[i] || 0;
      if (Math.abs(v) > CAPTURE_AXIS && Math.abs(pv) < DEADZONE) {
        if (!act && i < 4) act = 1;
        if (!id) id = 'axis:' + i + (v < 0 ? '-' : '+');
      }
      prevS.axes[i] = v;
    }
    return { act, id };
  }

  function pollGamepad() {
    padAny = false;
    padDown.clear();
    const pads = getPads();
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
      const r = padActivity(live[i], keys[i]);
      if (capture && r.id) { captureHit({ input: r.id }); input.lastDevice = 'gamepad'; activePad = keys[i]; }
      if (!r.act) continue;
      if (r.act === 2) padAny = true;
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
    const b = pad.buttons || [];
    for (let i = 0; i < b.length; i++) if (padPressed(pad, i)) padDown.add('pad:' + i);
    const ax = pad.axes || [];
    for (let i = 0; i < ax.length; i++) {
      const v = ax[i] || 0;
      if (v < -DEADZONE) padDown.add('axis:' + i + '-');
      else if (v > DEADZONE) padDown.add('axis:' + i + '+');
    }
    const lx = ax[0] || 0, ly = ax[1] || 0;
    // device switch on any new activity (a button press, or a stick pushed out of its resting range)
    if (moved || Math.abs(lx) > 0.6 || Math.abs(ly) > 0.6) input.lastDevice = 'gamepad';
  }

  // Menus own the input (title, pause, any blocking screen): the lockout fallbacks are live.
  function menuActive() {
    if (input.forceMenu === true || input.forceMenu === false) return input.forceMenu;
    try {
      const g = G.game;
      if (!g) return true;
      if (g.mode !== 'play') return true;
      return typeof g.uiBlocking === 'function' ? !!g.uiBlocking() : false;
    } catch (e) { return false; }
  }

  function hasAny(set, pool) {
    for (const id of set) if (pool.has(id)) return true;
    return false;
  }

  const down = new Set(), prevDown = new Set(), rawPressedNow = new Set();
  const input = {
    ACTIONS, GAME_ACTIONS, SLOT_COUNT, PAD_SLOT,
    lastDevice: 'keyboard',
    /** null = automatic; true/false forces the menu fallbacks on/off (tests). */
    forceMenu: null,

    init(target) {
      const t = target || (typeof window !== 'undefined' ? window : null);
      if (!t || attached === t) return;
      attached = t;
      t.addEventListener('keydown', onKeyDown, { passive: false });
      t.addEventListener('keyup', onKeyUp, { passive: false });
      t.addEventListener('mousedown', onMouseDown, { passive: false });
      t.addEventListener('mouseup', onMouseUp, { passive: false });
      t.addEventListener('auxclick', onAuxClick, { passive: false });
      t.addEventListener('contextmenu', onContextMenu, { passive: false });
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
    /** Bumped whenever a label changes (key layout learned, binding changed); cached hint strings compare it. */
    labelsVersion: 0,
    /** Test hook: the printed-key override table (code -> label). */
    _layoutLabels: layoutLabels,
    _setLabel: setLabel,

    // Called once per fixed step by the engine BEFORE game logic.
    update(dt) {
      pollGamepad();
      // a finished capture is delivered here, in step order; the inputs that ended it are swallowed until released
      if (capture) {
        capture.t += (typeof dt === 'number' && dt > 0) ? dt : (G.CONST && G.CONST.DT) || 1 / 60;
        if (!captureResult && capture.t > CAPTURE_TIMEOUT) captureResult = { cancel: true, timeout: true };
        if (captureResult) {
          const cb = capture.cb, res = captureResult;
          capture = null; captureResult = null;
          if (res.input && kindOf(res.input) === 'mouse') { lastCaptureEnd = nowMs(); lastCaptureBtn = +res.input.slice(6); }
          for (const c of held) swallow.add(keyId(c));
          for (const id of mouseHeld) swallow.add(id);
          for (const id of padDown) swallow.add(id);
          tapRaw.clear(); anyKeyLatch = false; padAny = false;
          if (typeof cb === 'function') {
            try { cb(res); } catch (err) { if (G.reportError) G.reportError(err, 'input.capture'); }
          }
        }
      }
      down.clear();
      for (const c of held) down.add(keyId(c));
      for (const id of mouseHeld) down.add(id);
      for (const id of padDown) down.add(id);
      for (const id of Array.from(swallow)) { if (!down.has(id)) swallow.delete(id); else down.delete(id); }
      for (const id of swallow) tapRaw.delete(id);
      rawPressedNow.clear();
      if (!capture) {
        for (const id of down) if (!prevDown.has(id)) rawPressedNow.add(id);
        for (const id of tapRaw) rawPressedNow.add(id);
      }
      prevDown.clear();
      for (const id of down) prevDown.add(id);
      const capturing = !!capture;
      const menu = menuActive();
      for (const a of ACTIONS) {
        prev[a] = cur[a];
        let on = false, tapped = false;
        if (!capturing) {
          const s = menu ? menuView[a] : sets[a];
          on = hasAny(s, down);
          tapped = hasAny(s, tapRaw);
        }
        cur[a] = on || !!virtual[a] || tapped;
        pressedNow[a] = cur[a] && !prev[a];
        releasedNow[a] = !cur[a] && prev[a];
        // A tap that was pressed AND released between two steps still counts as one press.
        if (tapped && !prev[a]) pressedNow[a] = true;
      }
      input._anyNow = !capturing && (anyKeyLatch || padAny);
      tapRaw.clear();
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
    /** Is the raw input id physically down right now (e.g. 'key:Delete')? Not tied to any binding. */
    rawDown(id) { return down.has(id); },
    /** Did the raw input id go down this step (e.g. 'key:Delete', 'pad:3')? Not tied to any binding. */
    rawPressed(id) { return rawPressedNow.has(id); },

    // ---------------------------------------------------------------- labels
    // Label for on-screen prompts, based on the last used device (mouse counts as keyboard).
    label(a) {
      if (a === 'confirm' || a === 'cancel') {
        if (input.lastDevice === 'gamepad') return a === 'confirm' ? 'A' : 'B';
        return a === 'confirm' ? 'Enter' : 'Esc';
      }
      const s = slots[a];
      if (!s) return '?';
      const kb = [s[0], s[1]].concat((extra[a] || []).filter(isKbmKind)).filter(Boolean);
      const pd = [s[PAD_SLOT]].concat((extra[a] || []).filter(isPadKind)).filter(Boolean);
      const pad = input.lastDevice === 'gamepad';
      const lab = (id) => (pad && PAD_ARROW_ACTIONS[a] && PAD_ARROWS[id]) || labelOf(id);
      const ids = pad ? pd : kb;
      if (ids.length) return lab(ids[0]);
      // no binding on this device: an implicit / fallback input still active (left stick unless taken, Start, Esc)
      for (const id of (sets[a] || [])) if (pad ? isPadKind(id) : isKbmKind(id)) return lab(id);
      return UNBOUND_LABEL;
    },
    // All keyboard/mouse labels for an action, e.g. ['Z', 'Space'].
    keyLabels(a) {
      let ids;
      if (a === 'confirm' || a === 'cancel') ids = Array.from(sets[a] || []).filter(isKbmKind);
      else ids = inputsOf(a).filter(isKbmKind);
      return ids.map(labelOf).filter((v, i, arr) => arr.indexOf(v) === i);
    },
    padLabels(a) {
      let ids;
      if (a === 'confirm' || a === 'cancel') ids = Array.from(sets[a] || []).filter(isPadKind);
      else ids = inputsOf(a).filter(isPadKind);
      return ids.map(labelOf).filter((v, i, arr) => arr.indexOf(v) === i);
    },
    /** Label of one typed input id. */
    labelOf,
    /** Readable name of a key code (layout-aware). */
    keyLabel,

    // ---------------------------------------------------------------- bindings
    /** {action: [slot0, slot1, padSlot]} copy (ids or null) for every gameplay action. */
    getBindings() { return copyTable(slots); },
    /** Default inputs outside the visible slots that are still active ({dash: ['key:KeyK', 'pad:7']}). */
    getExtras() { return copyTable(extra); },
    defaultBindings() { return defaultSlots(); },
    /** The inputs an action reacts to right now (bindings, extras, implicit and fallbacks; menu = include menu fallbacks). */
    activeInputs(a, menu) { return Array.from((menu ? menuView[a] : sets[a]) || []); },
    /**
     * Binds input id to (action, slot). Slot 0/1 take key/mouse ids, slot 2 pad/axis ids. Any other gameplay action
     * using the input loses it (if that left it with no binding, it gets this slot's previous input instead = swap;
     * with nothing to swap the call is refused). Returns {ok, reason?, moved:[{action, slot, input}], swapped?}.
     * reason: 'action' | 'slot' | 'input' | 'kind' | 'reserved' | 'last' (with .action = the action that would be left empty).
     */
    setBinding(a, slot, id, opts) {
      const o = opts || {};
      if (GAME_ACTIONS.indexOf(a) < 0) return { ok: false, reason: 'action', moved: [] };
      if (!(slot >= 0 && slot < SLOT_COUNT && Number.isInteger(slot))) return { ok: false, reason: 'slot', moved: [] };
      if (!validId(id)) return { ok: false, reason: 'input', moved: [] };
      if (!slotAccepts(slot, id)) return { ok: false, reason: 'kind', moved: [] };
      if (id in RESERVED && RESERVED[id] !== a) return { ok: false, reason: 'reserved', moved: [] };
      if (FORBIDDEN[id]) return { ok: false, reason: 'os', moved: [] };
      const old = slots[a][slot];
      if (old === id) return { ok: true, moved: [], unchanged: true };
      // work on copies; commit only if every action keeps a binding
      const ns = copyTable(slots), ne = copyTable(extra);
      const moved = [];
      let swapped = null;
      for (const b of GAME_ACTIONS) {
        if (b === a || SHARE[a] === b) continue;
        for (let i = 0; i < SLOT_COUNT; i++) if (ns[b][i] === id) { ns[b][i] = null; moved.push({ action: b, slot: i, input: id }); }
        if (ne[b].indexOf(id) >= 0) { ne[b] = ne[b].filter((x) => x !== id); moved.push({ action: b, slot: -1, input: id }); }
      }
      // the same input elsewhere in this action's row moves into the chosen slot
      for (let i = 0; i < SLOT_COUNT; i++) if (i !== slot && ns[a][i] === id) ns[a][i] = null;
      ns[a][slot] = id;
      // editing a column group drops the hidden default extras of that group
      ne[a] = ne[a].filter((x) => (slot === PAD_SLOT ? !isPadKind(x) : !isKbmKind(x)) && x !== id);
      for (const m of moved) {
        const b = m.action;
        const left = ns[b].filter(Boolean).length + ne[b].length;
        if (left) continue;
        // swap: the target slot's previous input goes to the emptied action (same slot kind)
        const canSwap = old && m.slot >= 0 && slotAccepts(m.slot, old) && (!(old in RESERVED) || RESERVED[old] === b) && !swapped;
        if (canSwap) {
          let usedElsewhere = false;
          for (const c of GAME_ACTIONS) if (c !== b && SHARE[b] !== c && (ns[c].indexOf(old) >= 0 || ne[c].indexOf(old) >= 0)) usedElsewhere = true;
          if (!usedElsewhere) { ns[b][m.slot] = old; swapped = { action: b, slot: m.slot, input: old }; continue; }
        }
        return { ok: false, reason: 'last', action: b, moved: [] };
      }
      // a pad player must always be able to pause: moving pause's last pad input swaps instead (or is refused)
      if (!padPauseOk(ns, ne)) {
        let usedElsewhere = false;
        if (old) for (const c of GAME_ACTIONS) if (c !== 'pause' && (ns[c].indexOf(old) >= 0 || ne[c].indexOf(old) >= 0)) usedElsewhere = true;
        if (!swapped && old && isPadKind(old) && !usedElsewhere) {
          ns.pause[PAD_SLOT] = old; swapped = { action: 'pause', slot: PAD_SLOT, input: old };
        } else return { ok: false, reason: 'last', action: 'pause', device: 'gamepad', moved: [] };
      }
      slots = ns; extra = ne;
      rebuild();
      if (!o.noSave) persist();
      const res = { ok: true, moved, swapped };
      // Ctrl bound next to W/T/N: Ctrl+W (close tab), Ctrl+T, Ctrl+N cannot be blocked by a page
      if (boundAnywhere('key:Control') && CTRL_UNBLOCKABLE.some(boundAnywhere)) res.warning = 'ctrlCombos';
      return res;
    },
    /** Clears (action, slot). Refused ({ok:false, reason:'last'}) when it is the action's last binding. */
    clearBinding(a, slot, opts) {
      const o = opts || {};
      if (GAME_ACTIONS.indexOf(a) < 0) return { ok: false, reason: 'action' };
      if (!(slot >= 0 && slot < SLOT_COUNT && Number.isInteger(slot))) return { ok: false, reason: 'slot' };
      if (!slots[a][slot]) return { ok: true, unchanged: true };
      const left = slots[a].filter(Boolean).length - 1 + extra[a].filter((x) => (slot === PAD_SLOT ? !isPadKind(x) : !isKbmKind(x))).length;
      if (left <= 0) return { ok: false, reason: 'last', action: a };
      if (a === 'pause' && slot === PAD_SLOT) {
        const ns = copyTable(slots), ne = copyTable(extra);
        ns.pause[PAD_SLOT] = null; ne.pause = ne.pause.filter((x) => !isPadKind(x));
        if (!padPauseOk(ns, ne)) return { ok: false, reason: 'last', action: a, device: 'gamepad' };
      }
      const old = slots[a][slot];
      slots[a][slot] = null;
      extra[a] = extra[a].filter((x) => (slot === PAD_SLOT ? !isPadKind(x) : !isKbmKind(x)));
      rebuild();
      if (!o.noSave) persist();
      return { ok: true, input: old };
    },
    /** Back to the default bindings (persisted). */
    resetBindings(opts) {
      slots = defaultSlots(); extra = defaultExtra();
      rebuild();
      if (!(opts && opts.noSave)) persist();
    },
    /** Installs a stored table (validated; corrupt/unknown -> defaults). Used by G.Save.loadSettings. */
    loadBindings(raw) {
      const t = sanitize(raw);
      slots = t.slots; extra = t.extra;
      rebuild();
      return serialize();
    },
    /** The table in its stored form {v, slots, extra}. */
    serializeBindings: serialize,
    sanitizeBindings(raw) { const t = sanitize(raw); return { v: BIND_VERSION, slots: t.slots, extra: t.extra }; },

    // ---------------------------------------------------------------- capture (Controls screen)
    /**
     * Waits for the next physical input of any device and calls cb once (from update(), in step order) with
     * {input: id} | {clear: true} (Backspace/Delete) | {cancel: true[, timeout: true]} (Esc / 10 s without input).
     * While capturing no action is reported. The input that ends the capture is ignored until it is released.
     */
    beginCapture(cb) {
      if (capture && capture.cb !== cb) input.cancelCapture();
      capture = { cb, t: 0 };
      captureResult = null;
      // pads: start from the current state so a held button does not count
      const pads = getPads();
      if (pads) for (let i = 0; i < pads.length; i++) { const p = pads[i]; if (p && p.connected !== false) padActivity(p, typeof p.index === 'number' ? p.index : i); }
    },
    cancelCapture() {
      if (!capture) return;
      const cb = capture.cb;
      capture = null; captureResult = null;
      if (typeof cb === 'function') { try { cb({ cancel: true }); } catch (err) { if (G.reportError) G.reportError(err, 'input.capture'); } }
    },
    get capturing() { return !!capture; },
    get captureTime() { return capture ? capture.t : 0; },
    CAPTURE_TIMEOUT,

    setVirtual(state) {
      virtual = Object.assign({}, state || {});
      if (virtual.interact === undefined && virtual.up) virtual.interact = true;
    },
    clearVirtual() { virtual = {}; },
    getVirtual() { return Object.assign({}, virtual); },
    // Clears all held state (e.g. after a screen change) so stale holds don't leak into gameplay.
    reset() {
      held.clear(); mouseHeld.clear(); tapRaw.clear(); swallow.clear(); anyKeyLatch = false; virtual = {};
      down.clear(); prevDown.clear(); rawPressedNow.clear();
      for (const a of ACTIONS) { cur[a] = prev[a] = pressedNow[a] = releasedNow[a] = false; }
    },
  };

  // Legacy views (read-only, rebuilt from the current bindings): KEYMAP[action] = key codes, PADMAP[action] = buttons.
  Object.defineProperty(input, 'KEYMAP', {
    enumerable: true,
    get() {
      const o = {};
      for (const a of ACTIONS) o[a] = Array.from(sets[a] || []).filter((id) => kindOf(id) === 'key').map((id) => id.slice(4));
      return o;
    },
  });
  Object.defineProperty(input, 'PADMAP', {
    enumerable: true,
    get() {
      const o = {};
      for (const a of ACTIONS) o[a] = Array.from(sets[a] || []).filter((id) => kindOf(id) === 'pad').map((id) => +id.slice(4));
      return o;
    },
  });

  slots = defaultSlots(); extra = defaultExtra();
  rebuild();
  input.labelsVersion = 0;

  G.input = input;
})();
