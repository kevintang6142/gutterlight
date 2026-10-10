// src/engine/lighting.js — G.lighting: half-resolution darkness map with soft light holes, plus additive
// colored glows. Lights: per-step (added during update), per-frame (added during draw), static (G.Art).
(function () {
  'use strict';
  const G = globalThis.G;
  const W = G.CONST.VIEW_W, H = G.CONST.VIEW_H;
  const SCALE = 0.5; // darkness map resolution

  const stepLights = [];   // added during gameplay updates (kept while the game is frozen/paused)
  const frameLights = [];  // added during rendering (cleared after each frame)
  let inRender = false;
  let dark = null;         // {canvas, ctx}
  let holeSprite = null;
  let staticRoom = null, staticList = [];

  function makeHole() {
    const size = 128;
    const { canvas, ctx } = G.U.makeCanvas(size, size);
    const g = ctx.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
    g.addColorStop(0, 'rgba(255,255,255,1)');
    g.addColorStop(0.3, 'rgba(255,255,255,0.92)');
    g.addColorStop(0.62, 'rgba(255,255,255,0.45)');
    g.addColorStop(0.85, 'rgba(255,255,255,0.12)');
    g.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, size, size);
    return canvas;
  }

  // {x, y, r, color, intensity (0..1), flicker} in room px. Call every step (update) or every frame (draw).
  function add(l) {
    if (!l || !(l.r > 0)) return;
    (inRender ? frameLights : stepLights).push(l);
  }

  function beginStep() { stepLights.length = 0; }

  function staticLightsFor(room) {
    if (room === staticRoom) return staticList;
    staticRoom = room;
    staticList = [];
    if (room && G.Art && typeof G.Art.staticLights === 'function') {
      try { staticList = G.Art.staticLights(room) || []; } catch (err) { G.reportError(err, 'Art.staticLights'); staticList = []; }
    }
    return staticList;
  }

  function darkColor(room) {
    let c = null;
    try { if (G.Art && G.Art.palette) { const p = G.Art.palette(room.regionId); c = p && (p.darkness || p.dark); } } catch (e) { c = null; }
    if (c) return c;
    return G.U.mix('#04050a', (room.region && room.region.mapColor) || '#404050', 0.07);
  }

  function flickerOf(l, t) {
    if (!l.flicker) return 1;
    const s = (l.x || 0) * 0.013 + (l.y || 0) * 0.007;
    return 0.86 + 0.08 * Math.sin(t * 9.1 + s) + 0.06 * Math.sin(t * 23.7 + s * 3.1);
  }

  // Collect all lights for this frame into `out` (screen-visible only).
  function collect(room, cam, t, out) {
    out.length = 0;
    // lights anchored inside a veiled secret pocket (G.Art.veilAlphaAt) are dimmed with the veil, so a pickup's,
    // lamp's or glowing prop's light never shows through the rock (the cracks are the hint)
    const veiled = room && room.artCache && room.artCache.veil && G.Render && G.Render.useArt !== false && G.Art && G.Art.veilAlphaAt;
    const push = (l, own) => {
      const r = l.r;
      if (l.x + r < cam.x || l.x - r > cam.x + W || l.y + r < cam.y || l.y - r > cam.y + H) return;
      if (veiled && !own) {
        const v = G.Art.veilAlphaAt(room, l.x, l.y) || 0;
        if (v >= 0.997) return;
        if (v > 0.003) l = Object.assign({}, l, { intensity: (l.intensity == null ? 1 : l.intensity) * (1 - v) });
      }
      out.push(l);
    };
    for (const l of staticLightsFor(room)) push(l);
    for (const l of stepLights) push(l);
    for (const l of frameLights) push(l);
    const p = G.game && G.game.player;
    if (p && !p.noAutoLight && !(G.game.mode === 'dead' && G.game.deathTime > 0.5)) {
      push({ x: p.x + p.w / 2, y: p.y + p.h * 0.3, r: p.lightRadius || 260, color: p.lightColor || '#79c4ff', intensity: 1, flicker: true }, true);
    }
    return out;
  }

  const visible = [];
  function render(ctx, room, cam, t) {
    if (!room) { frameLights.length = 0; return; }
    collect(room, cam, t, visible);
    const d = typeof room.dark === 'number' ? room.dark : 0.3;
    if (d > 0.01) {
      if (!dark) dark = G.U.makeCanvas(Math.ceil(W * SCALE), Math.ceil(H * SCALE));
      if (!holeSprite) holeSprite = makeHole();
      const dc = dark.ctx;
      dc.globalCompositeOperation = 'source-over';
      dc.globalAlpha = 1;
      dc.clearRect(0, 0, dark.canvas.width, dark.canvas.height);
      dc.fillStyle = G.U.rgba(darkColor(room), Math.min(0.97, d));
      dc.fillRect(0, 0, dark.canvas.width, dark.canvas.height);
      dc.globalCompositeOperation = 'destination-out';
      for (const l of visible) {
        const a = Math.max(0, Math.min(1, (l.intensity == null ? 1 : l.intensity) * flickerOf(l, t)));
        if (a <= 0.01) continue;
        const r = l.r * SCALE;
        dc.globalAlpha = a;
        dc.drawImage(holeSprite, (l.x - cam.x) * SCALE - r, (l.y - cam.y) * SCALE - r, r * 2, r * 2);
      }
      dc.globalCompositeOperation = 'source-over';
      dc.globalAlpha = 1;
      ctx.drawImage(dark.canvas, 0, 0, W, H);
    }
    // additive colored bloom (subtle, stronger in darker rooms)
    if (G.fx && G.fx.glowSprite) {
      const op = ctx.globalCompositeOperation, ga = ctx.globalAlpha;
      ctx.globalCompositeOperation = 'lighter';
      const k = 0.1 + d * 0.16;
      for (const l of visible) {
        if (!l.color || l.glow === false) continue;
        const a = Math.max(0, Math.min(1, (l.intensity == null ? 1 : l.intensity) * flickerOf(l, t) * k));
        if (a <= 0.01) continue;
        const r = l.r * 0.55;
        ctx.globalAlpha = a;
        ctx.drawImage(G.fx.glowSprite(l.color), l.x - cam.x - r, l.y - cam.y - r, r * 2, r * 2);
      }
      ctx.globalCompositeOperation = op;
      ctx.globalAlpha = ga;
    }
    frameLights.length = 0;
  }

  G.lighting = {
    add, beginStep, render,
    beginRender() { inRender = true; },
    endRender() { inRender = false; },
    invalidateStatic() { staticRoom = null; },
    get count() { return stepLights.length + frameLights.length + staticList.length; },
  };
})();
