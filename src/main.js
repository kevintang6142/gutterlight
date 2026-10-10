// src/main.js — boot: canvas setup & letterboxed CSS scaling, input, settings, optional module init hooks,
// audio unlock on the first user gesture, game flow start, and the requestAnimationFrame loop
// (skipped with ?paused=1 — the test harness then drives frames with G.debug.step). Sets G.ready = true.
(function () {
  'use strict';
  const G = globalThis.G;
  const VW = G.CONST.VIEW_W, VH = G.CONST.VIEW_H;

  let canvas = null;
  let running = false;
  let lastTs = 0;

  const safe = (fn, where) => { try { return fn(); } catch (err) { G.reportError(err, where); return undefined; } };

  // CSS-scale the fixed 1280×720 canvas to the largest 16:9 box that fits the window (letterboxing).
  function resize() {
    if (!canvas) return;
    const ww = window.innerWidth || VW, wh = window.innerHeight || VH;
    const scale = Math.max(0.1, Math.min(ww / VW, wh / VH));
    canvas.style.width = Math.floor(VW * scale) + 'px';
    canvas.style.height = Math.floor(VH * scale) + 'px';
    if (G.game && G.game.requestRender) G.game.requestRender();
  }

  // The AudioContext may only start after a user gesture: init on the first key/pointer/touch.
  function setupGestureUnlock() {
    const events = ['keydown', 'pointerdown', 'mousedown', 'touchstart'];
    const unlock = () => {
      if (G.Audio && typeof G.Audio.init === 'function') {
        safe(() => G.Audio.init(), 'Audio.init');
        safe(() => G.Save.applySettings(), 'applySettings');
      }
      for (const ev of events) window.removeEventListener(ev, unlock, true);
    };
    for (const ev of events) window.addEventListener(ev, unlock, true);
    // Re-focus the canvas when clicked so keys always reach the game.
    canvas.addEventListener('pointerdown', () => { try { canvas.focus({ preventScroll: true }); } catch (e) { canvas.focus(); } });
  }

  function loop(ts) {
    if (!running) return;
    const elapsed = lastTs ? (ts - lastTs) / 1000 : 0;
    lastTs = ts;
    safe(() => G.game.frame(elapsed), 'frame');
    if (G.debug && G.debug.tickFps) G.debug.tickFps(elapsed);
    window.requestAnimationFrame(loop);
  }
  function startLoop() {
    if (running) return;
    running = true;
    lastTs = 0;
    if (G.game.resetClock) G.game.resetClock(); // remainder mid-step + draw the first frame (game.frame pacing)
    window.requestAnimationFrame(loop);
  }

  // Pause the game when the window loses focus, the tab is hidden or the gamepad in use is unplugged (HK-style),
  // outside of tests. A request that comes while the game cannot pause (death, room transition, a card) stays pending
  // in G.game and is honoured as soon as play resumes; regaining focus first cancels a focus-loss request.
  function setupAutoPause() {
    if (G.test) return;
    const request = (reason) => { const g = G.game; if (g && g.requestAutoPause) safe(() => g.requestAutoPause(reason), 'autoPause'); };
    const cancel = (reason) => { const g = G.game; if (g && g.cancelAutoPause) g.cancelAutoPause(reason); };
    window.addEventListener('blur', () => request('blur'));
    window.addEventListener('focus', () => { cancel('blur'); cancel('hidden'); });
    if (typeof document !== 'undefined') {
      document.addEventListener('visibilitychange', () => {
        if (document.visibilityState === 'hidden') request('hidden');
        else if (G.game && G.game.requestRender) G.game.requestRender();
      });
    }
    G.events.on('gamepadLost', (d) => { if (d && d.wasActive) request('gamepad'); });
  }

  function boot() {
    try {
      canvas = document.getElementById('game');
      if (!canvas) {
        canvas = document.createElement('canvas');
        canvas.id = 'game';
        document.body.appendChild(canvas);
      }
      canvas.width = VW;
      canvas.height = VH;
      canvas.setAttribute('tabindex', '0');
      const msg = document.getElementById('boot-msg');
      if (msg) msg.style.display = 'none';

      G.input.init(window);
      safe(() => G.Save.loadSettings(), 'Save.loadSettings');
      G.Render.init(canvas);
      if (G.debug && G.debug.init) safe(() => G.debug.init(), 'debug.init');
      // Optional init hooks of other modules (feature-detected; none is required).
      if (G.Art && typeof G.Art.init === 'function') safe(() => G.Art.init(), 'Art.init');
      if (G.UI && typeof G.UI.init === 'function') safe(() => G.UI.init(canvas), 'UI.init');

      resize();
      window.addEventListener('resize', resize);
      setupGestureUnlock();
      setupAutoPause();
      try { canvas.focus({ preventScroll: true }); } catch (e) { canvas.focus(); }

      G.game.boot();
      if (G.params.paused !== '1') startLoop();
      else G.debug.render();
    } catch (err) {
      G.reportError(err, 'boot');
    } finally {
      G.ready = true;
    }
  }

  G.main = { boot, resize, startLoop, stopLoop() { running = false; }, get running() { return running; } };

  if (typeof document !== 'undefined') {
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
    else boot();
  }
})();
