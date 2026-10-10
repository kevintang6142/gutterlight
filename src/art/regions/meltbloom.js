// src/art/regions/meltbloom.js — Meltbloom Gardens: sage & cream cavern gardens, giant wax flowers
// with glowing gold hearts, fronds and vine curtains, golden light shafts and drifting pollen.
(function () {
  'use strict';
  const G = globalThis.G;
  const Art = G.Art;
  const U = Art.util, K = Art.BG.kit;
  const { mix, rgba } = U;
  const TAU = Math.PI * 2;

  const pal = {
    skyTop: '#090f0c', skyBottom: '#3c4c3a', far: '#56664e', mid: '#3a4836', near: '#222b20',
    fill: '#141a12', fillDeep: '#060805', edge: '#70845e', highlight: '#ebe6c6', accent: '#f2c860',
    light: '#ffd880', fog: '#5c6c50', particle: '#f6e2a2', mapColor: '#94ad7e', darkness: '#040805',
    water: '#6a8c6a', waterDeep: '#0e1810',
  };
  const GOLD = '#ffd070';

  // A cluster of giant wax flowers with fronds at their feet.
  function grove(ctx, x, yb, s, c, petal, rng, li, glowA) {
    for (let k = 0; k < 4; k++) K.frond(ctx, x + rng.range(-70, 70) * s, yb + 4, rng.range(70, 150) * s, rng.range(-0.8, 0.8), { color: c, width: 0.14, curl: rng.range(-0.3, 0.3) });
    const n = rng.int(1, 3);
    for (let k = 0; k < n; k++) {
      const fh = rng.range(160, 300) * s;
      K.flower(ctx, x + rng.range(-50, 50) * s, yb + 4, fh, {
        petal: petal || c, stem: c, r: rng.range(26, 44) * s, lean: rng.range(-50, 50) * s, petals: rng.int(5, 7), open: rng.range(0.4, 0.9),
        heart: li ? GOLD : null, addGlow: li ? (gx, gy, r, col) => li.addGlow(gx, gy, r, col, glowA, 0.3) : null,
      });
    }
  }
  function vineCurtain(ctx, w, y0, o) {
    const rng = o.rng;
    ctx.strokeStyle = o.color; ctx.fillStyle = o.color; ctx.lineCap = 'round';
    for (let x = rng.range(0, 40); x < w; x += rng.range(o.gap * 0.5, o.gap * 1.4)) {
      const n = rng.int(2, 6);
      for (let k = 0; k < n; k++) {
        const vx = x + rng.range(-20, 20), l = rng.range(o.min, o.max), s = rng.range(-18, 18);
        ctx.lineWidth = rng.range(1.2, o.width || 3);
        ctx.beginPath(); ctx.moveTo(vx, y0); ctx.bezierCurveTo(vx + s, y0 + l * 0.35, vx - s, y0 + l * 0.7, vx + s * 0.4, y0 + l); ctx.stroke();
        for (let q = 0.2; q < 1; q += rng.range(0.12, 0.25)) {
          const lx = vx + s * 0.1, ly = y0 + l * q, d = rng.chance(0.5) ? 1 : -1, sz = (o.leaf || 6) * rng.range(0.7, 1.2);
          ctx.beginPath(); ctx.ellipse(lx + d * sz * 0.8, ly, sz, sz * 0.42, d * 0.6, 0, TAU); ctx.fill();
        }
      }
    }
  }

  function gardenRecipe(th, info) {
    const kind = th.bg || 'open';
    const shaft = kind === 'shaft', interior = kind === 'interior';
    const c0 = '#4a5a44', c1 = '#34422f', c2 = '#222c1f', c3 = '#0f140d';
    const layers = [];
    // backdrop: hazy cavern with colossal flower silhouettes glowing in the gloom
    layers.push({ f: 0.04, lowres: 0.45, haze: 0.42, hazeColor: '#6a7a5a', fog: { alpha: 0.5, h: 0.5, top: 0.45, topH: 0.3, color: '#7a8a62' },
      draw(ctx, w, h, rng, li) {
        if (interior) { // trellised greenhouse wall
          ctx.fillStyle = c0; ctx.fillRect(0, 0, w, h);
          ctx.strokeStyle = mix(c0, '#000000', 0.3); ctx.lineWidth = 6;
          for (let x = 0; x < w + 60; x += 60) { ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x - h * 0.5, h); ctx.moveTo(x - 60, 0); ctx.lineTo(x - 60 + h * 0.5, h); ctx.stroke(); }
        } else {
          K.ridge(ctx, w, h, { base: h * 0.86, amp: 70, scale: 400, color: c0, seed: rng.int(1, 1e6) });
          for (let x = rng.range(0, 200); x < w; x += rng.range(260, 420)) grove(ctx, x, h * 0.84, 1.3, c0, mix(c0, '#e8e0b0', 0.12), rng, li, 0.3);
        }
        K.stalactites(ctx, w, 0, { color: c0, rng, minL: 20, maxL: h * 0.11, minW: 26, maxW: 64, band: 14 });
        vineCurtain(ctx, w, 0, { rng, color: c0, gap: 140, min: 40, max: h * 0.35, width: 3, leaf: 8 });
      } });
    // L1: mid garden — flowers, fronds, a ruined trellis arch
    layers.push({ f: 0.15, lowres: 0.6, haze: 0.18, hazeColor: '#6a7a5a', fog: { alpha: 0.5, h: 0.42, color: '#748660' }, bands: shaft ? [[0, 1]] : [[0, 0.3], [0.3, 1]],
      shade: { top: 'rgba(255,240,190,0.07)', bottom: 'rgba(0,0,0,0.1)' },
      draw(ctx, w, h, rng, li) {
        if (!shaft) K.ridge(ctx, w, h, { base: h * 0.93, amp: 40, scale: 260, color: c1, seed: rng.int(1, 1e6) });
        for (let x = rng.range(40, 200); x < w; x += rng.range(200, 380)) {
          if (shaft) { // wall-borne blooms on long curling stems
            const y = rng.range(h * 0.2, h * 0.95);
            K.wrap(w, x, 120, (xx) => grove(ctx, xx, y, 0.75, c1, null, rng, li, 0.45));
          } else K.wrap(w, x, 160, (xx) => grove(ctx, xx, h * 0.93, 0.95, c1, null, rng, li, 0.45));
        }
        if (!shaft && !interior) { // a trellis arch overgrown with vines
          const ax = rng.range(0.2, 0.8) * w, ab = h * 0.94, aw = 150, ah = 230;
          K.wrap(w, ax, aw, (xx) => {
            ctx.strokeStyle = c1; ctx.lineWidth = 10;
            ctx.beginPath(); ctx.moveTo(xx - aw / 2, ab); ctx.lineTo(xx - aw / 2, ab - ah * 0.6); ctx.arc(xx, ab - ah * 0.6, aw / 2, Math.PI, 0); ctx.lineTo(xx + aw / 2, ab); ctx.stroke();
            ctx.lineWidth = 3;
            for (let k = -3; k <= 3; k++) { ctx.beginPath(); ctx.moveTo(xx + k * 20, ab - ah * 0.6 - Math.sqrt(Math.max(0, aw * aw / 4 - k * k * 400))); ctx.lineTo(xx + k * 22, ab - ah * 0.6 + 50 + Math.abs(k) * 6); ctx.stroke(); }
          });
        }
        vineCurtain(ctx, w, 0, { rng, color: c1, gap: 220, min: 30, max: h * 0.28, width: 2.5, leaf: 7 });
      } });
    // L2: near garden with cream rim light
    layers.push({ f: 0.32, haze: 0.04, fog: { alpha: 0.4, h: 0.3, color: '#6a7c58' }, bands: [[0, 0.25], [0.45, 1]],
      rim: { color: '#f4e8b0', alpha: 0.32, width: 2 },
      draw(ctx, w, h, rng, li) {
        K.ridge(ctx, w, h, { base: h * 0.985, amp: 26, scale: 200, color: c2, seed: rng.int(1, 1e6) });
        for (let x = rng.range(30, 160); x < w; x += rng.range(160, 300)) {
          const yb = h * 0.985;
          K.wrap(w, x, 120, (xx) => {
            for (let k = 0; k < 5; k++) K.frond(ctx, xx + rng.range(-50, 50), yb + 4, rng.range(50, 110), rng.range(-0.9, 0.9), { color: c2, width: 0.15, curl: rng.range(-0.3, 0.3), ribs: rgba('#000000', 0.25) });
            if (rng.chance(0.55)) K.flower(ctx, xx, yb + 4, rng.range(100, 170), { petal: mix(c2, '#f0e6c0', 0.08), stem: c2, r: rng.range(18, 28), lean: rng.range(-30, 30), heart: GOLD, addGlow: (gx, gy, r, col) => li.addGlow(gx, gy, r, col, 0.55, 0.35) });
          });
        }
        vineCurtain(ctx, w, 0, { rng, color: c2, gap: 260, min: 20, max: h * 0.22, width: 2, leaf: 6 });
      } });
    // L3: dark near foliage
    layers.push({ f: 0.58, fog: { alpha: 0.14, h: 0.12, color: '#5a6a4a' }, bands: [[0, 0.2], [0.7, 1]],
      draw(ctx, w, h, rng) {
        K.ridge(ctx, w, h, { base: h * 1.01, amp: 30, scale: 160, color: c3, seed: rng.int(1, 1e6) });
        for (let x = rng.range(0, 100); x < w; x += rng.range(70, 180)) for (let k = 0; k < 3; k++) K.frond(ctx, x + rng.range(-20, 20), h + 4, rng.range(40, 90), rng.range(-0.9, 0.9), { color: c3, width: 0.16 });
        vineCurtain(ctx, w, -2, { rng, color: c3, gap: 200, min: 16, max: 90, width: 2.5, leaf: 7 });
      } });
    return {
      sky: { top: '#070c09', bottom: '#3a4a36', gy: 0.55, gr: 0.8, glowColor: '#b0a060', glowA: 0.3 },
      layers,
      shafts: shaft ? [{ x: 600, f: 0.15, w0: 60, w1: 240, slant: 60, color: '#ffe6a0', alpha: 0.1, after: 0, speed: 0.3 }] : [
        { x: 300, f: 0.2, w0: 70, w1: 280, slant: 140, color: '#ffe6a0', alpha: 0.14, after: 0, speed: 0.31 },
        { x: 1100, f: 0.22, w0: 50, w1: 220, slant: 110, color: '#fff0b8', alpha: 0.11, after: 1, speed: 0.24, phase: 1.7 },
        { x: 1800, f: 0.2, w0: 60, w1: 250, slant: 150, color: '#ffe6a0', alpha: 0.12, after: 0, speed: 0.28, phase: 3.1 },
      ],
    };
  }

  function recipe(th, info) {
    if (th.bg === 'none') return Art.BG.genericRecipe(th, info);
    return gardenRecipe(th, info);
  }

  Art.defineRegion({
    id: 'meltbloom', name: 'Meltbloom Gardens',
    palette: pal,
    materials: { leaf: '#56704c', leafLight: '#a8c088', wax: '#f0e8cc', waxShade: '#b0a684', wood: '#4a4a32', woodDark: '#262818', woodLight: '#8a8a60',
      stone: '#5a6450', stoneDark: '#2e3428', stoneLight: '#8e9a80', glowCap: GOLD, silk: '#e8e8d0' },
    theme: { bg: 'open' },
    terrain: {
      texture: { type: 'wax', veins: 50 },
      texStrength: 0.8,
      ramp: [[0, '#7c8e64'], [3, '#4e5e40'], [9, '#28321f'], [18, 'fill']],
      rimWidth: 8, rim: 0.95, rimSide: 0.2, rimColor: '#f0eac8',
      floor: [
        { type: 'tufts', color: '#3e5232', color2: '#a8c080', density: 0.45, cluster: 0.5, r: [2, 5] },
        { type: 'grass', color: '#4e663e', color2: '#d8dcb0', density: 0.45, h: [5, 15], cluster: 0.45, lean: 8, wind: 2 },
        { type: 'flowers', color: '#f0e8cc', heart: GOLD, density: 0.12, h: 13, cluster: 0.5 },
      ],
      ceiling: [
        { type: 'roots', color: '#3a4a30', color2: '#6a8456', density: 0.32, len: [12, 56], width: 1.5, leaves: 0.7 },
        { type: 'drips', color: '#d8d2b4', color2: '#fffbe8', density: 0.12, len: [3, 12], w: [2, 4] },
      ],
      wall: [{ type: 'vines', color: '#3e5232', color2: '#6a8a54', density: 0.2, len: 64 }],
      spikes: { type: 'thorns', color: '#2e3a24', tip: '#f0e6c0' },
      platform: { type: 'wax' },
      glaze: { color: '#d8d0ae', deep: '#3a4430', sheen: '#fffef0' },
    },
    liquids: { water: { top: '#7aa07a', deep: '#0c160e', alphaTop: 0.48 } },
    decor: [
      { kind: 'flower_giant', where: 'floor', chance: 0.025, gap: 12, width: 2, height: 6, dim: 0.35, opts: (rng) => ({ h: rng.range(150, 220) }) },
      { kind: 'mushroom_glow', where: 'floor', chance: 0.03, gap: 7, opts: { color: GOLD } },
      { kind: 'reeds', where: 'floor', chance: 0.025, gap: 6, height: 3 },
      { kind: 'statue_waxen', where: 'floor', chance: 0.006, gap: 26, width: 2, height: 5, dim: 0.45, opts: { variant: 1, material: 'wax' } },
      { kind: 'fountain', where: 'floor', chance: 0.004, gap: 30, width: 3, height: 4, dim: 0.3 },
      { kind: 'vine_curtain', where: 'ceiling', chance: 0.035, gap: 7, height: 2, fitLen: [50, 0.45] },
      { kind: 'drip', where: 'ceiling', chance: 0.02, gap: 8, opts: (rng, c, r, tile) => { let k = 0; while (k < 20 && tile(c, r + k + 1) === 0) k++; return { fall: (k + 1) * 40 - 12, color: '#e8e0c0' }; } },
      { kind: 'grass_clump', where: 'floor', chance: 0.1, gap: 2, layer: 'front', opts: { color: '#1e2818', h: 20 } },
    ],
    weather: [{ kind: 'pollen', count: 80, color: '#ffe08a' }, { kind: 'motes', count: 25, color: '#f0f0d0' }],
    fog: { alpha: 0.17, color: '#6a7c58' },
    vignette: 0.5,
    grade: { top: '#0a1a08', topA: 0.1, bottom: '#c0a040', bottomA: 0.05 },
    fg: { kinds: ['flower', 'vines', 'grass'], density: 0.8 },
    bg: { recipe },
  });
})();
