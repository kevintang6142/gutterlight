// src/engine/render.js — G.Render: the frame pipeline (TECH_SPEC §12). Each G.Art stage is optional:
// missing or throwing stages fall back to a clean built-in renderer (permanent safety net).
(function () {
  'use strict';
  const G = globalThis.G;
  const T = G.T;
  const TILE = G.CONST.TILE;
  const W = G.CONST.VIEW_W, H = G.CONST.VIEW_H;
  const MAX_STAGE_FAILS = 3;

  const R = {
    canvas: null, ctx: null,
    fps: 60, frameMs: 0, frames: 0,
    stageFails: {},
    useArt: true, // set false to force the fallback renderer (debug)
  };

  // ------------------------------------------------------------------ Art stage calls
  function artStage(name, ctx, args) {
    if (!R.useArt) return false;
    const A = G.Art;
    const fn = A && A[name];
    if (typeof fn !== 'function' || (R.stageFails[name] || 0) >= MAX_STAGE_FAILS) return false;
    ctx.save();
    try {
      fn.apply(A, args);
      ctx.restore();
      return true;
    } catch (err) {
      ctx.restore();
      R.stageFails[name] = (R.stageFails[name] || 0) + 1;
      G.reportError(err, 'Art.' + name);
      if (R.stageFails[name] >= MAX_STAGE_FAILS) G.warnOnce('artoff:' + name, 'G.Art.' + name + ' disabled after repeated errors; using the built-in renderer');
      return false;
    }
  }

  // ------------------------------------------------------------------ fallback palette
  const palCache = new Map();
  function palette(room) {
    const id = room ? room.regionId : 'test';
    let p = null;
    if (R.useArt && G.Art && typeof G.Art.palette === 'function' && (R.stageFails.palette || 0) < MAX_STAGE_FAILS) {
      try { p = G.Art.palette(id); } catch (err) { R.stageFails.palette = (R.stageFails.palette || 0) + 1; G.reportError(err, 'Art.palette'); }
    }
    const key = id + (p ? ':art' : '');
    let out = palCache.get(key);
    if (out) return out;
    const base = (room && room.region && room.region.mapColor) || '#8a8f9c';
    const U = G.U;
    out = Object.assign({
      skyTop: U.mix('#05060b', base, 0.12),
      skyBottom: U.mix('#0b0d14', base, 0.3),
      far: U.mix('#0a0b10', base, 0.2),
      mid: U.mix('#08090d', base, 0.14),
      fill: U.mix('#0c0c10', base, 0.16),
      fillDeep: U.mix('#060608', base, 0.08),
      edge: U.mix('#2a2a30', base, 0.55),
      highlight: U.mix('#8a8a90', base, 0.6),
      accent: base,
      fog: U.mix('#1a1c24', base, 0.25),
      water: '#2f6f8f', lava: '#ff7a2a',
    }, p || {});
    palCache.set(key, out);
    return out;
  }

  // ------------------------------------------------------------------ fallback stages
  const bgCache = new WeakMap();
  function bgShapes(room) {
    let s = bgCache.get(room);
    if (s) return s;
    const rng = new G.RNG(G.U.hash(room.id + ':bg') ^ ((room.def && room.def.bgSeed) || 0));
    s = [];
    for (let layer = 0; layer < 2; layer++) {
      const cols = [];
      const span = room.widthPx * (layer ? 0.55 : 0.35) + W;
      let x = -100;
      while (x < span) {
        const w = rng.range(60, 180) * (layer ? 1 : 1.4);
        cols.push({ x, w, h: rng.range(0.25, 0.7) * H * (layer ? 0.8 : 1), cap: rng.chance(0.4) });
        x += w + rng.range(20, 140);
      }
      s.push(cols);
    }
    bgCache.set(room, s);
    return s;
  }

  function fbBackground(ctx, room, cam) {
    const p = palette(room);
    const g = ctx.createLinearGradient(0, 0, 0, H);
    g.addColorStop(0, p.skyTop);
    g.addColorStop(1, p.skyBottom);
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, W, H);
    const shapes = bgShapes(room);
    const layers = [{ k: 0.2, col: p.far, a: 0.9 }, { k: 0.45, col: p.mid, a: 0.95 }];
    for (let i = 0; i < 2; i++) {
      const L = layers[i];
      const ox = -cam.x * L.k, oy = -cam.y * L.k * 0.5;
      ctx.fillStyle = L.col;
      ctx.globalAlpha = L.a;
      for (const c of shapes[i]) {
        const x = c.x + ox;
        if (x + c.w < 0 || x > W) continue;
        const top = H - c.h + oy * 0.3 + i * 40;
        ctx.fillRect(x, top, c.w, H - top + 200);
        if (c.cap) {
          ctx.beginPath();
          ctx.moveTo(x - 6, top); ctx.lineTo(x + c.w / 2, top - c.w * 0.45); ctx.lineTo(x + c.w + 6, top);
          ctx.fill();
        }
      }
    }
    ctx.globalAlpha = 1;
  }

  function visibleRange(room, cam) {
    return {
      c0: Math.max(0, Math.floor(cam.x / TILE) - 1), c1: Math.min(room.cols - 1, Math.floor((cam.x + W) / TILE) + 1),
      r0: Math.max(0, Math.floor(cam.y / TILE) - 1), r1: Math.min(room.rows - 1, Math.floor((cam.y + H) / TILE) + 1),
    };
  }
  const isTerrain = (k) => k === T.SOLID || k === T.GLAZED;
  const solidish = (k) => k === T.SOLID || k === T.GLAZED || k === T.BREAKABLE || k === T.DIVEFLOOR;

  function fbTerrain(ctx, room, cam) {
    const p = palette(room);
    const v = visibleRange(room, cam);
    // back walls
    ctx.fillStyle = G.U.rgba(p.fill, 0.55);
    for (let r = v.r0; r <= v.r1; r++) {
      let run = -1;
      for (let c = v.c0; c <= v.c1 + 1; c++) {
        const on = c <= v.c1 && room.tileAt(c, r) === T.BGWALL;
        if (on && run < 0) run = c;
        if (!on && run >= 0) { ctx.fillRect(run * TILE, r * TILE, (c - run) * TILE, TILE); run = -1; }
      }
    }
    // solid fill (run-merged per row)
    for (let r = v.r0; r <= v.r1; r++) {
      let run = -1, runCode = -1;
      for (let c = v.c0; c <= v.c1 + 1; c++) {
        const k = c <= v.c1 ? room.tileAt(c, r) : -1;
        const on = isTerrain(k);
        if (run >= 0 && (!on || k !== runCode)) {
          ctx.fillStyle = runCode === T.GLAZED ? G.U.mix(p.fill, '#9fb8c8', 0.18) : p.fill;
          ctx.fillRect(run * TILE, r * TILE, (c - run) * TILE, TILE);
          run = -1;
        }
        if (on && run < 0) { run = c; runCode = k; }
      }
    }
    // rims: lighter edges where terrain meets air
    for (let r = v.r0; r <= v.r1; r++) {
      for (let c = v.c0; c <= v.c1; c++) {
        const k = room.tileAt(c, r);
        if (!isTerrain(k)) continue;
        const x = c * TILE, y = r * TILE;
        const glazed = k === T.GLAZED;
        if (!solidish(room.tileAt(c, r - 1))) {
          ctx.fillStyle = glazed ? '#cfe6f2' : p.highlight;
          ctx.fillRect(x, y, TILE, 3);
          ctx.fillStyle = p.edge;
          ctx.fillRect(x, y + 3, TILE, 5);
        }
        ctx.fillStyle = p.edge;
        if (!solidish(room.tileAt(c - 1, r))) ctx.fillRect(x, y, 3, TILE);
        if (!solidish(room.tileAt(c + 1, r))) ctx.fillRect(x + TILE - 3, y, 3, TILE);
        if (!solidish(room.tileAt(c, r + 1))) ctx.fillRect(x, y + TILE - 3, TILE, 3);
        if (glazed) {
          ctx.fillStyle = 'rgba(200,230,255,0.10)';
          ctx.fillRect(x + 8, y + 4, 4, TILE - 8);
        }
      }
    }
    // platforms & spikes
    for (let r = v.r0; r <= v.r1; r++) {
      for (let c = v.c0; c <= v.c1; c++) {
        const k = room.tileAt(c, r);
        const x = c * TILE, y = r * TILE;
        if (k === T.PLATFORM) {
          ctx.fillStyle = p.edge;
          ctx.fillRect(x, y, TILE, 10);
          ctx.fillStyle = p.highlight;
          ctx.fillRect(x, y, TILE, 2);
          ctx.fillStyle = G.U.rgba(p.edge, 0.6);
          if (c % 3 === 0) ctx.fillRect(x + TILE / 2 - 2, y + 10, 4, 14);
        } else if (k === T.SPIKES) {
          const up = solidish(room.tileAt(c, r + 1)) || !solidish(room.tileAt(c, r - 1));
          ctx.fillStyle = p.highlight;
          ctx.beginPath();
          for (let i = 0; i < 4; i++) {
            const sx = x + i * 10;
            if (up) { ctx.moveTo(sx, y + TILE); ctx.lineTo(sx + 5, y + 8); ctx.lineTo(sx + 10, y + TILE); }
            else { ctx.moveTo(sx, y); ctx.lineTo(sx + 5, y + TILE - 8); ctx.lineTo(sx + 10, y); }
          }
          ctx.fill();
        }
      }
    }
  }

  function fbBreakables(ctx, room, cam) {
    const p = palette(room);
    const v = visibleRange(room, cam);
    for (let r = v.r0; r <= v.r1; r++) {
      for (let c = v.c0; c <= v.c1; c++) {
        const k = room.tileAt(c, r);
        if (k !== T.BREAKABLE && k !== T.DIVEFLOOR) continue;
        const x = c * TILE, y = r * TILE;
        ctx.fillStyle = k === T.BREAKABLE ? G.U.mix(p.fill, p.edge, 0.35) : G.U.mix(p.fill, p.edge, 0.25);
        ctx.fillRect(x, y, TILE, TILE);
        ctx.strokeStyle = G.U.rgba(p.highlight, 0.55);
        ctx.lineWidth = 2;
        ctx.beginPath();
        if (k === T.BREAKABLE) {
          const comp = room.componentAt(c, r);
          const hits = comp ? comp.hits : 0;
          ctx.moveTo(x + 6, y + 10); ctx.lineTo(x + 18, y + 20); ctx.lineTo(x + 14, y + 32);
          ctx.moveTo(x + 18, y + 20); ctx.lineTo(x + 32, y + 16);
          if (hits >= 1) { ctx.moveTo(x + 26, y + 4); ctx.lineTo(x + 22, y + 18); ctx.lineTo(x + 34, y + 34); }
          if (hits >= 2) { ctx.moveTo(x + 4, y + 28); ctx.lineTo(x + 16, y + 26); ctx.lineTo(x + 24, y + 38); }
        } else {
          ctx.moveTo(x, y + 6); ctx.lineTo(x + 12, y + 14); ctx.lineTo(x + 22, y + 8); ctx.lineTo(x + 40, y + 16);
          ctx.moveTo(x + 12, y + 14); ctx.lineTo(x + 16, y + 30);
        }
        ctx.stroke();
        if (!solidish(room.tileAt(c, r - 1))) { ctx.fillStyle = p.highlight; ctx.fillRect(x, y, TILE, 2); }
      }
    }
  }

  function fbLiquids(ctx, room, cam, t) {
    const p = palette(room);
    const v = visibleRange(room, cam);
    for (let r = v.r0; r <= v.r1; r++) {
      for (let c = v.c0; c <= v.c1; c++) {
        const k = room.tileAt(c, r);
        if (k !== T.WATER && k !== T.LAVA) continue;
        const x = c * TILE, y = r * TILE;
        const top = room.tileAt(c, r - 1) !== k;
        const water = k === T.WATER;
        ctx.fillStyle = water ? G.U.rgba(p.water || '#2f6f8f', 0.55) : G.U.rgba(p.lava || '#ff7a2a', 0.85);
        if (top) {
          const wv = Math.sin(t * 2.2 + c * 0.9) * 2;
          ctx.fillRect(x, y + 3 + wv, TILE, TILE - 3 - wv);
          ctx.fillStyle = water ? 'rgba(190,235,255,0.75)' : 'rgba(255,220,140,0.95)';
          ctx.fillRect(x, y + 2 + wv, TILE, 2);
        } else ctx.fillRect(x, y, TILE, TILE);
      }
    }
  }

  let vignette = null;
  function fbAtmosphere(ctx) {
    if (!vignette) {
      vignette = G.U.makeCanvas(W, H);
      const g = vignette.ctx.createRadialGradient(W / 2, H / 2, H * 0.35, W / 2, H / 2, H * 0.95);
      g.addColorStop(0, 'rgba(0,0,0,0)');
      g.addColorStop(1, 'rgba(0,0,0,0.55)');
      vignette.ctx.fillStyle = g;
      vignette.ctx.fillRect(0, 0, W, H);
    }
    ctx.drawImage(vignette.canvas, 0, 0);
  }

  // ------------------------------------------------------------------ entities
  const drawList = [];
  function drawEntity(ctx, e, t, room) {
    if (e.dead) return;
    const cam = G.camera;
    if (e.cull !== false && cam && !cam.visible(e.x, e.y, e.w, e.h, 400)) return;
    // inside a veiled secret pocket (G.Art.veilAlphaAt): hidden with the veil (the player never is)
    let veil = 0;
    if (room && room.artCache && room.artCache.veil && R.useArt && G.Art && G.Art.veilAlphaAt && e !== (G.game && G.game.player)) {
      veil = G.Art.veilAlphaAt(room, e.x + e.w / 2, e.y + e.h / 2);
      if (veil >= 0.997) return;
    }
    ctx.save();
    if (veil > 0) ctx.globalAlpha = 1 - veil;
    try { e.draw(ctx, t); } catch (err) {
      G.reportError(err, 'draw ' + e.type + (e.kind ? ':' + e.kind : ''));
      if (e !== (G.game && G.game.player)) e.dead = true;
    }
    ctx.restore();
  }
  function drawEntities(ctx, room, t, back) {
    drawList.length = 0;
    for (const e of room.entities) {
      if (e.dead) continue;
      const z = e.z || 0;
      if (back ? z < -10 : z >= -10) drawList.push(e);
    }
    const p = G.game && G.game.player;
    if (!back && p && p.room === room && !p.hidden) drawList.push(p);
    drawList.sort((a, b) => (a.z || 0) - (b.z || 0));
    for (const e of drawList) drawEntity(ctx, e, t, room);
  }

  // ------------------------------------------------------------------ screen overlays
  function drawOverlays(ctx) {
    const g = G.game;
    if (!g) return;
    if (g.flashAlpha > 0.003 && g.flashColor) {
      ctx.globalAlpha = Math.min(1, g.flashAlpha);
      ctx.fillStyle = g.flashColor;
      ctx.fillRect(0, 0, W, H);
      ctx.globalAlpha = 1;
    }
    const fade = Math.max(g.fadeAlpha || 0, g.sysFadeAlpha || 0);
    if (fade > 0.003) {
      ctx.globalAlpha = Math.min(1, fade);
      ctx.fillStyle = '#000';
      ctx.fillRect(0, 0, W, H);
      ctx.globalAlpha = 1;
    }
  }

  // ------------------------------------------------------------------ frame
  function frame() {
    const ctx = R.ctx;
    if (!ctx) return;
    const t0 = G.U.now();
    const g = G.game;
    const room = g && g.room;
    const cam = G.camera;
    const t = g ? g.t : 0;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.globalAlpha = 1;
    ctx.globalCompositeOperation = 'source-over';
    if (G.lighting) G.lighting.beginRender();
    try {
      if (room && g.mode !== 'title' && g.mode !== 'boot') {
        if (!artStage('drawBackground', ctx, [ctx, room, cam, t])) fbBackground(ctx, room, cam, t);
        ctx.save();
        ctx.translate(Math.round(-cam.x + cam.shakeX), Math.round(-cam.y + cam.shakeY));
        artStage('drawBackDecor', ctx, [ctx, room, cam, t]);
        drawEntities(ctx, room, t, true);
        if (!artStage('drawTerrain', ctx, [ctx, room, cam, t])) fbTerrain(ctx, room, cam, t);
        if (!artStage('drawBreakables', ctx, [ctx, room, cam, t])) fbBreakables(ctx, room, cam, t);
        drawEntities(ctx, room, t, false);
        if (G.fx) G.fx.draw(ctx);
        if (!artStage('drawLiquids', ctx, [ctx, room, cam, t])) fbLiquids(ctx, room, cam, t);
        artStage('drawFrontDecor', ctx, [ctx, room, cam, t]);
        if (G.debug && G.debug.overlayOn) G.debug.drawWorld(ctx);
        ctx.restore();
        artStage('drawForeground', ctx, [ctx, room, cam, t]);
        if (G.lighting) G.lighting.render(ctx, room, cam, t);
        if (!artStage('drawAtmosphere', ctx, [ctx, room, cam, t])) fbAtmosphere(ctx, room, cam, t);
      } else {
        ctx.fillStyle = '#000';
        ctx.fillRect(0, 0, W, H);
      }
      drawOverlays(ctx);
      if (G.UI && typeof G.UI.draw === 'function') {
        ctx.save();
        try { G.UI.draw(ctx); } catch (err) { G.reportError(err, 'UI.draw'); }
        ctx.restore();
      } else if (g && g.drawFallbackUI) g.drawFallbackUI(ctx);
      if (G.debug && G.debug.overlayOn) G.debug.drawScreen(ctx);
    } catch (err) {
      G.reportError(err, 'Render.frame');
      ctx.setTransform(1, 0, 0, 1, 0, 0);
    }
    if (G.lighting) G.lighting.endRender();
    R.frameMs = G.U.now() - t0;
    R.frames++;
  }

  function init(canvas) {
    R.canvas = canvas;
    R.ctx = canvas.getContext('2d', { alpha: false });
    R.ctx.imageSmoothingEnabled = true;
  }

  // Called when tiles change outside G.Art (keeps fallback caches valid).
  function onTilesChanged() { /* fallback renderer draws tiles live; nothing cached */ }

  Object.assign(R, {
    init, frame, palette, onTilesChanged,
    fallback: { background: fbBackground, terrain: fbTerrain, breakables: fbBreakables, liquids: fbLiquids, atmosphere: fbAtmosphere },
  });
  G.Render = R;
})();
