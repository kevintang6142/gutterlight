// src/art/regions/shore.js — the Ashen Shore: slate-blue sky, pale moon, drifting ash over pale dunes,
// broken pillars and wick-graves, and the colossal fallen candle lying on the horizon.
(function () {
  'use strict';
  const G = globalThis.G;
  const Art = G.Art;
  const U = Art.util, K = Art.BG.kit;
  const { mix, rgba, lerp } = U;
  const TAU = Math.PI * 2;

  const pal = {
    skyTop: '#121824', skyBottom: '#6e788c', far: '#56607a', mid: '#3a4254', near: '#222833',
    fill: '#151a22', fillDeep: '#07090c', edge: '#6a7486', highlight: '#e0dbcf', accent: '#ece2c6',
    light: '#ffd9a0', fog: '#7c8598', particle: '#e0ddd4', mapColor: '#8a94a6', darkness: '#05070c',
    water: '#6a8296', waterDeep: '#141c24',
  };

  // The colossal fallen candle: a toppled pillar of wax lying across the dunes, wick curled at its tip.
  function fallenCandle(ctx, x0, y0, len, rad, ang, c, hi, shadow, wickC) {
    ctx.save();
    ctx.translate(x0, y0);
    ctx.rotate(ang);
    const body = new Path2D();
    body.moveTo(0, -rad);
    body.lineTo(len - rad * 0.6, -rad);
    body.quadraticCurveTo(len + rad * 0.15, -rad * 0.9, len + rad * 0.1, 0); // melted crown
    body.quadraticCurveTo(len + rad * 0.2, rad * 0.95, len - rad * 0.5, rad);
    body.lineTo(0, rad);
    // broken base: jagged
    body.lineTo(rad * 0.25, rad * 0.5); body.lineTo(-rad * 0.1, rad * 0.1); body.lineTo(rad * 0.2, -rad * 0.4); body.lineTo(-rad * 0.05, -rad * 0.8);
    body.closePath();
    ctx.fillStyle = c; ctx.fill(body);
    ctx.save(); ctx.clip(body);
    const g = ctx.createLinearGradient(0, -rad, 0, rad);
    g.addColorStop(0, rgba(hi, 0.55)); g.addColorStop(0.35, rgba(hi, 0.08)); g.addColorStop(0.7, rgba(shadow, 0.25)); g.addColorStop(1, rgba(shadow, 0.6));
    ctx.fillStyle = g; ctx.fillRect(-10, -rad - 10, len + rad + 20, rad * 2 + 20);
    // carved rings and long drips running "down" (toward +y in the rotated frame)
    ctx.strokeStyle = rgba(shadow, 0.35); ctx.lineWidth = rad * 0.05;
    for (let k = 1; k < 5; k++) { const x = (len * k) / 5.3; ctx.beginPath(); ctx.moveTo(x, -rad); ctx.quadraticCurveTo(x + rad * 0.12, 0, x, rad); ctx.stroke(); }
    ctx.restore();
    ctx.fillStyle = c;
    for (let k = 0; k < 7; k++) {
      const x = len * (0.12 + 0.12 * k), dl = rad * (0.3 + ((k * 37) % 7) / 7 * 0.7), dw = rad * 0.09;
      ctx.beginPath(); ctx.moveTo(x - dw, rad - 2); ctx.lineTo(x - dw, rad + dl - dw); ctx.arc(x, rad + dl - dw, dw, Math.PI, 0, true); ctx.lineTo(x + dw, rad - 2); ctx.closePath(); ctx.fill();
    }
    // the wick: a great black curl
    ctx.strokeStyle = wickC; ctx.lineWidth = rad * 0.16; ctx.lineCap = 'round';
    ctx.beginPath(); ctx.moveTo(len, 0); ctx.bezierCurveTo(len + rad * 0.9, -rad * 0.1, len + rad * 1.1, -rad * 0.9, len + rad * 0.55, -rad * 1.1); ctx.stroke();
    ctx.restore();
  }

  function dunes(ctx, w, h, base, amp, scale, color, seed, crest) {
    K.ridge(ctx, w, h, { base, amp, scale, color, seed, oct: 3 });
    if (crest) { // pale wind-lit crests
      ctx.save();
      ctx.globalCompositeOperation = 'source-atop';
      const g = ctx.createLinearGradient(0, base - amp, 0, base + amp * 0.4);
      g.addColorStop(0, rgba(crest, 0.35)); g.addColorStop(1, rgba(crest, 0));
      ctx.fillStyle = g; ctx.fillRect(0, base - amp * 1.2, w, amp * 1.8);
      ctx.restore();
    }
  }
  function ashGrass(ctx, x, yb, h, c, rng) {
    ctx.strokeStyle = c; ctx.lineCap = 'round';
    for (let i = 0; i < 7; i++) { const dx = rng.range(-10, 10), hh = rng.range(h * 0.4, h), lean = rng.range(-12, 12) + 6; ctx.lineWidth = rng.range(1, 2.2); ctx.beginPath(); ctx.moveTo(x + dx, yb + 2); ctx.quadraticCurveTo(x + dx + lean * 0.2, yb - hh * 0.6, x + dx + lean, yb - hh); ctx.stroke(); }
  }

  function skyRecipe(info) {
    const P = info.pal;
    const layers = [];
    // backdrop: far pale dunes and the fallen candle on the horizon
    layers.push({ f: 0.04, haze: 0.36, hazeColor: '#7c86a0', fog: { alpha: 0.55, h: 0.34, color: '#9aa2b4' }, lowres: 0.5,
      draw(ctx, w, h, rng) {
        dunes(ctx, w, h, h * 0.8, 46, 520, '#6c768c', rng.int(1, 1e6));
        // theme.landmark:false — the room shows the real Fallen Wick (sh_03): no second one on the horizon
        if (!(info.theme && info.theme.landmark === false)) fallenCandle(ctx, w * 0.12, h * 0.71, w * 0.42, 22, -0.06, '#8e93a0', '#d6d6d4', '#4a5262', '#3a404e');
        dunes(ctx, w, h, h * 0.86, 30, 300, '#5e687e', rng.int(1, 1e6));
      } });
    // L1: mid dunes with half-buried pillars & grave stakes
    layers.push({ f: 0.14, lowres: 0.6, haze: 0.16, hazeColor: '#7c8598', fog: { alpha: 0.42, h: 0.35, color: '#8a93a6' }, bands: [[0.4, 1]],
      draw(ctx, w, h, rng) {
        const base = h * 0.84, o = { base, amp: 40, scale: 340, color: '#48526a', seed: rng.int(1, 1e6), oct: 3 };
        for (let x = rng.range(60, 260); x < w; x += rng.range(300, 520)) {
          const y = K.ridgeY(w, x, o) + 16;
          K.wrap(w, x, 40, (xx) => K.pillar(ctx, xx, y, rng.range(22, 34), rng.range(70, 150), { color: '#48526a', broken: rng.range(0.2, 0.6) }));
        }
        dunes(ctx, w, h, base, 40, 340, '#48526a', o.seed, '#c8ccd8');
        for (let x = rng.range(0, 120); x < w; x += rng.range(90, 220)) {
          const y = K.ridgeY(w, x, o) + 4;
          ctx.fillStyle = '#3a4256'; ctx.fillRect(x - 1.5, y - 22, 3, 24); ctx.fillRect(x - 6, y - 16, 12, 3);
        }
      } });
    // L2: nearer dunes, crisper, with a toppled statue and dead ash-grass
    layers.push({ f: 0.3, haze: 0.04, fog: { alpha: 0.32, h: 0.3, color: '#7c8598' }, bands: [[0.5, 1]], rim: { color: '#e8e4da', alpha: 0.35, width: 2 },
      draw(ctx, w, h, rng) {
        const o = { base: h * 0.9, amp: 34, scale: 260, color: '#2e3544', seed: rng.int(1, 1e6), oct: 3 };
        const sx = rng.range(0.2, 0.8) * w;
        K.wrap(w, sx, 80, (xx) => { ctx.save(); ctx.translate(xx, K.ridgeY(w, sx, o) + 18); ctx.rotate(0.35); K.statue(ctx, 0, 0, 120, { color: '#2e3544', staff: true }); ctx.restore(); });
        dunes(ctx, w, h, o.base, 34, 260, '#2e3544', o.seed, '#d8dce6');
        for (let x = rng.range(0, 100); x < w; x += rng.range(60, 160)) ashGrass(ctx, x, K.ridgeY(w, x, o) + 3, rng.range(14, 28), '#3e4656', rng);
      } });
    // L3: the dark near dune lip
    layers.push({ f: 0.55, fog: { alpha: 0.12, h: 0.12 }, bands: [[0.72, 1]],
      draw(ctx, w, h, rng) {
        const o = { base: h * 0.985, amp: 26, scale: 200, color: '#161b23', seed: rng.int(1, 1e6), oct: 3 };
        dunes(ctx, w, h, o.base, 26, 200, '#161b23', o.seed);
        for (let x = rng.range(0, 80); x < w; x += rng.range(40, 120)) ashGrass(ctx, x, K.ridgeY(w, x, o) + 4, rng.range(16, 34), '#161b23', rng);
      } });
    return {
      sky(ctx, w, h, rng) {
        ctx.fillStyle = K.grad(ctx, 0, 0, 0, h, [[0, '#0f141e'], [0.45, '#2e3648'], [0.78, '#6a7488'], [1, '#8c94a6']]);
        ctx.fillRect(0, 0, w, h);
        K.stars(ctx, w, h * 0.5, 140, '#dfe6f4', rng);
        K.moon(ctx, w * 0.78, h * 0.2, 30, { color: '#ece6d6', halo: '#b8c4dc' });
        for (let k = 0; k < 9; k++) { // thin cloud streaks
          const y = rng.range(h * 0.15, h * 0.6), x = rng.range(-100, w), cw = rng.range(200, 520);
          const g = ctx.createLinearGradient(x, 0, x + cw, 0);
          g.addColorStop(0, 'rgba(160,170,190,0)'); g.addColorStop(0.5, 'rgba(170,178,196,' + rng.range(0.06, 0.14).toFixed(3) + ')'); g.addColorStop(1, 'rgba(160,170,190,0)');
          ctx.fillStyle = g; ctx.fillRect(x, y, cw, rng.range(3, 9));
        }
      },
      skyGlows: [{ x: 0.78, y: 0.2, r: 160, color: '#c8d4ec', a: 0.18, flicker: 0.05 }],
      layers,
    };
  }

  function caveRecipe(th, info) {
    const P = info.pal;
    const c0 = '#3a4252', c1 = '#2a303c', c2 = '#1c2129', c3 = '#0e1116';
    return {
      sky: { top: '#07090d', bottom: '#2a3140', gy: 0.6, glowColor: '#8a94a8', glowA: 0.22 },
      layers: [
        { f: 0.05, lowres: 0.45, haze: 0.4, hazeColor: '#5a6274', fog: { alpha: 0.5, h: 0.5, top: 0.5, topH: 0.35, color: '#4a5262' },
          draw(ctx, w, h, rng) { K.rockWall(ctx, 0, 0, w, h, { color: c0, rng, blobs: 80 }); K.stalactites(ctx, w, 0, { color: '#20252e', rng, minL: 30, maxL: h * 0.18, minW: 40, maxW: 120, band: 20 }); } },
        { f: 0.2, lowres: 0.6, haze: 0.15, hazeColor: '#5a6274', fog: { alpha: 0.4, h: 0.4, color: '#5a6274' }, bands: [[0, 0.3], [0.45, 1]],
          draw(ctx, w, h, rng) {
            K.ridge(ctx, w, h, { base: h * 0.9, amp: 60, scale: 240, color: c1, seed: rng.int(1, 1e6) });
            for (let x = rng.range(0, 300); x < w; x += rng.range(300, 600)) K.wrap(w, x, 40, (xx) => K.pillar(ctx, xx, h * 0.92, 30, rng.range(90, 200), { color: c1, broken: rng.range(0.2, 0.6) }));
            K.stalactites(ctx, w, 0, { color: c1, rng, minL: 20, maxL: 120, band: 10 });
          } },
        { f: 0.55, fog: { alpha: 0.15, h: 0.15 }, bands: [[0, 0.2], [0.65, 1]],
          draw(ctx, w, h, rng) { K.ridge(ctx, w, h, { base: h, amp: 36, scale: 160, color: c3, seed: rng.int(1, 1e6) }); K.stalactites(ctx, w, 0, { color: c3, rng, minL: 14, maxL: 80, band: 6 }); } },
      ],
    };
  }

  function recipe(th, info) {
    const kind = th.bg || 'sky';
    if (kind === 'sky') return skyRecipe(info);
    if (kind === 'none') return Art.BG.genericRecipe(th, info);
    return caveRecipe(th, info);
  }

  Art.defineRegion({
    id: 'shore', name: 'Ashen Shore',
    palette: pal,
    materials: { wood: '#4a4440', woodDark: '#2a2624', woodLight: '#7a746a', stone: '#4c5466', stoneDark: '#2c3240', stoneLight: '#7a8294' },
    theme: { bg: 'sky' },
    terrain: {
      texture: { type: 'strata', bands: 11, warp: 1.2, speckle: 320 },
      texStrength: 0.55,
      ramp: [[0, '#8a92a2'], [3, '#5c6578'], [9, '#2c3240'], [18, 'fill']],
      rimWidth: 9, rim: 1.0, rimSide: 0.22,
      rimColor: '#ece8de',
      floor: [
        { type: 'drift', color: '#c9c6bd', color2: '#f2efe8', h: 3.2, scale: 80, threshold: 0.4, alpha: 0.95 },
        { type: 'grass', color: '#4e5666', color2: '#a8acb4', density: 0.22, h: [4, 12], cluster: 0.5, lean: 9, wind: 3 },
        { type: 'pebbles', color: '#1c222c', color2: '#6a7282', density: 0.12 },
      ],
      ceiling: [{ type: 'drips', color: '#5a6272', color2: '#c8ccd4', density: 0.18, len: [4, 16], w: [2, 4], pointy: true }],
      wall: [{ type: 'streaks', color: '#000000', alpha: 0.3, density: 0.15, len: 60 }],
      spikes: { type: 'shards', color: '#1a1e26', tip: '#e8e4da' },
      platform: { type: 'wood', top: '#a8a296' },
      glaze: { color: '#9aa8b8', deep: '#2a3240', sheen: '#f0f6ff' },
    },
    liquids: { water: { top: '#7a92a6', deep: '#18222c', alphaTop: 0.5 } },
    decor: [
      { kind: 'wick_grave', where: 'floor', chance: 0.05, gap: 4, opts: (rng) => ({ variant: rng.int(0, 1) }) },
      { kind: 'column_broken', where: 'floor', chance: 0.02, gap: 14, height: 3, dim: 0.35, opts: (rng) => ({ h: rng.range(50, 110) }) },
      { kind: ['rubble', 'bones'], where: 'floor', chance: 0.03, gap: 7 },
      { kind: 'reeds', where: 'floor', chance: 0.03, gap: 5, opts: {} },
      { kind: 'signpost', where: 'floor', chance: 0.006, gap: 30, height: 2 },
      { kind: 'statue_waxen', where: 'floor', chance: 0.008, gap: 24, width: 2, height: 5, dim: 0.45, opts: (rng) => ({ variant: 2 }) },
      { kind: 'grass_clump', where: 'floor', chance: 0.07, gap: 2, layer: 'front', opts: { color: '#3c4352', h: 18 } },
    ],
    weather: [{ kind: 'ash', count: 110, color: '#e2ded6' }],
    fog: { alpha: 0.14, color: '#8a93a6' },
    vignette: 0.45,
    grade: { top: '#0a1020', topA: 0.1, bottom: '#c8c0b0', bottomA: 0.04 },
    fg: { kinds: ['grass', 'rock'], density: 0.9 },
    bg: { recipe },
  });
})();
