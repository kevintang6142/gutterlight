// src/art/regions/rime.js — The Rime: frozen depths in pale cyan, white and steel blue. Ice spires,
// waxen frozen mid-step inside ice, a cold aurora rippling across the cavern vault, falling snow.
(function () {
  'use strict';
  const G = globalThis.G;
  const Art = G.Art;
  const U = Art.util, K = Art.BG.kit;
  const { mix, rgba } = U;

  const pal = {
    skyTop: '#060a10', skyBottom: '#3a5268', far: '#4a627a', mid: '#30445a', near: '#1a2634',
    fill: '#121a24', fillDeep: '#05080c', edge: '#6a8aa4', highlight: '#eaf6ff', accent: '#9ae0ff',
    light: '#c8f0ff', fog: '#5a7490', particle: '#f0f8ff', mapColor: '#9fd2e4', darkness: '#03060c',
    water: '#7ab4d0', waterDeep: '#0a1620',
  };

  // Aurora: soft vertical curtains hanging from a wavy line, cyan → violet, drawn additively.
  function aurora(ctx, w, h, rng) {
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    const bands = [['#5ae0c8', 0.22], ['#7ab8ff', 0.16], ['#a890ff', 0.11]];
    for (let b = 0; b < bands.length; b++) {
      const [col, a] = bands[b];
      const base = h * (0.3 + b * 0.08), amp = h * 0.07, ph = rng.range(0, 6), len = h * rng.range(0.16, 0.26);
      for (let x = 0; x < w; x += 3) {
        const y = base + Math.sin(x * 0.004 + ph) * amp + Math.sin(x * 0.011 + ph * 2) * amp * 0.4;
        const k = 0.5 + 0.5 * Math.sin(x * 0.02 + ph * 3) * Math.sin(x * 0.0063 + b);
        const g = ctx.createLinearGradient(0, y - len, 0, y + 6);
        g.addColorStop(0, rgba(col, 0)); g.addColorStop(0.8, rgba(col, a * k)); g.addColorStop(1, rgba(col, 0));
        ctx.fillStyle = g; ctx.fillRect(x, y - len, 3, len + 6);
      }
    }
    ctx.restore();
  }
  // A waxen figure frozen mid-stride inside a block of ice (silhouette + translucent block).
  function frozenFigure(ctx, x, yb, s, c, ice, rng) {
    ctx.fillStyle = c;
    const lean = rng.range(-0.25, 0.25);
    ctx.save(); ctx.translate(x, yb); ctx.rotate(lean * 0.3);
    ctx.beginPath(); ctx.moveTo(-14 * s, 0); ctx.lineTo(-12 * s, -50 * s); ctx.quadraticCurveTo(-12 * s, -66 * s, 0, -68 * s); ctx.quadraticCurveTo(12 * s, -66 * s, 12 * s, -50 * s); ctx.lineTo(14 * s, 0); ctx.closePath(); ctx.fill();
    ctx.fillRect(-1.2 * s, -76 * s, 2.4 * s, 9 * s); // dead wick
    ctx.lineWidth = 5 * s; ctx.strokeStyle = c; ctx.lineCap = 'round';
    ctx.beginPath(); ctx.moveTo(10 * s, -44 * s); ctx.lineTo(26 * s, -58 * s + lean * 40); ctx.stroke();
    ctx.restore();
    ctx.fillStyle = rgba(ice, 0.22);
    ctx.beginPath(); ctx.moveTo(x - 30 * s, yb); ctx.lineTo(x - 34 * s, yb - 70 * s); ctx.lineTo(x - 12 * s, yb - 96 * s); ctx.lineTo(x + 26 * s, yb - 88 * s); ctx.lineTo(x + 34 * s, yb - 40 * s); ctx.lineTo(x + 30 * s, yb); ctx.closePath(); ctx.fill();
    ctx.strokeStyle = rgba('#ffffff', 0.25); ctx.lineWidth = 1.2; ctx.stroke();
  }
  function iceField(ctx, w, yb, o) {
    const rng = o.rng;
    for (let x = rng.range(0, o.gap); x < w; x += rng.range(o.gap * 0.5, o.gap * 1.4)) {
      const n = rng.int(1, 4);
      for (let k = 0; k < n; k++) {
        const sw = rng.range(o.w * 0.6, o.w * 1.3), sh = rng.range(o.min, o.max);
        K.wrap(w, x, sw, (xx) => K.iceSpire(ctx, xx + k * sw * 0.6, yb + 4, sw, sh * (1 - k * 0.2), { color: o.color, hi: o.hi, lean: rng.range(-sw * 0.6, sw * 0.6) }));
      }
    }
  }

  function recipe(th, info) {
    const kind = th.bg || 'open';
    if (kind === 'none') return Art.BG.genericRecipe(th, info);
    const shaft = kind === 'shaft', interior = kind === 'interior';
    const c0 = '#3e566e', c1 = '#2c4054', c2 = '#1c2a3a', c3 = '#0b121a';
    const layers = [];
    // backdrop: a vast frozen vault; colossal ice spires under icicle curtains
    layers.push({ f: 0.04, lowres: 0.45, haze: 0.36, hazeColor: '#6a88a4', fog: { alpha: 0.55, h: 0.45, color: '#8aa8c4' },
      draw(ctx, w, h, rng, li) {
        if (interior) K.rockWall(ctx, 0, 0, w, h, { color: c0, rng, blobs: 70, lite: '#cfe8ff' });
        iceField(ctx, w, h * 0.96, { rng, gap: 200, w: 70, min: h * 0.3, max: h * 0.7, color: c0, hi: mix(c0, '#d8f0ff', 0.25) });
        K.stalactites(ctx, w, 0, { color: c0, rng, minL: 14, maxL: h * 0.1, minW: 12, maxW: 40, band: 8 });
        for (let k = 0; k < 4; k++) li.addGlow(rng.range(0, w), rng.range(h * 0.4, h * 0.85), rng.range(80, 160), '#9ae0ff', 0.08, 0.2);
      } });
    // L1: the frozen congregation — waxen caught in ice, broken columns, spires
    layers.push({ f: 0.15, lowres: 0.6, haze: 0.15, hazeColor: '#5a7894', fog: { alpha: 0.5, h: 0.42, color: '#7a98b4' },
      shade: { top: 'rgba(220,240,255,0.07)', bottom: 'rgba(0,0,0,0.1)' },
      draw(ctx, w, h, rng) {
        const yb = h * 0.96;
        if (!shaft) K.ridge(ctx, w, h, { base: yb, amp: 26, scale: 260, color: c1, seed: rng.int(1, 1e6) });
        iceField(ctx, w, yb, { rng, gap: 340, w: 46, min: h * 0.18, max: h * 0.45, color: c1, hi: mix(c1, '#e0f4ff', 0.3) });
        for (let x = rng.range(60, 200); x < w; x += rng.range(110, 260)) {
          const y = shaft ? rng.range(h * 0.3, h) : yb;
          K.wrap(w, x, 40, (xx) => frozenFigure(ctx, xx, y, rng.range(1, 1.5), c1, '#cfe8ff', rng));
        }
        for (let x = rng.range(200, 400); x < w; x += rng.range(500, 900)) K.wrap(w, x, 40, (xx) => K.pillar(ctx, xx, yb, rng.range(30, 44), rng.range(h * 0.3, h * 0.6), { color: c1, broken: rng.range(0.15, 0.4), flutes: true }));
        K.stalactites(ctx, w, 0, { color: c1, rng, minL: 10, maxL: h * 0.08, minW: 8, maxW: 22, band: 3 });
      } });
    // L2: near crystal clusters with a bright cold rim; snow-capped ridge
    layers.push({ f: 0.32, haze: 0.04, hazeColor: '#3a5068', fog: { alpha: 0.4, h: 0.3, color: '#6a88a4' }, bands: [[0, 0.25], [0.45, 1]],
      rim: { color: '#e8f8ff', alpha: 0.42, width: 2 },
      draw(ctx, w, h, rng) {
        const o = { base: h * 0.985, amp: 20, scale: 220, color: c2, seed: rng.int(1, 1e6), oct: 2 };
        for (let x = rng.range(40, 200); x < w; x += rng.range(220, 420)) {
          const y = K.ridgeY(w, x, o) + 10;
          K.wrap(w, x, 80, (xx) => { for (let k = 0; k < 5; k++) K.crystal(ctx, xx + rng.range(-40, 40), y, rng.range(16, 34), rng.range(40, 130), { color: c2, lean: rng.range(-20, 20), hi: mix(c2, '#cfe8ff', 0.15) }); });
        }
        K.ridge(ctx, w, h, o);
        K.stalactites(ctx, w, 0, { color: c2, rng, minL: 10, maxL: 90, minW: 6, maxW: 20, band: 3 });
      } });
    // L3: dark near ice teeth and snow mounds
    layers.push({ f: 0.58, fog: { alpha: 0.16, h: 0.14, color: '#4a6480' }, bands: [[0, 0.22], [0.72, 1]],
      draw(ctx, w, h, rng) {
        K.ridge(ctx, w, h, { base: h * 1.01, amp: 24, scale: 180, color: c3, seed: rng.int(1, 1e6) });
        ctx.fillStyle = c3; ctx.fillRect(0, 0, w, 12);
        K.stalactites(ctx, w, 10, { color: c3, rng, minL: 10, maxL: 80, minW: 6, maxW: 24, band: 2 });
      } });
    return {
      sky(ctx, w, h, rng) {
        ctx.fillStyle = K.grad(ctx, 0, 0, 0, h, [[0, '#04070c'], [0.4, '#142232'], [0.75, '#2e4660'], [1, '#4a6680']]);
        ctx.fillRect(0, 0, w, h);
        if (!interior) aurora(ctx, w, h, rng);
        K.stars(ctx, w, h * 0.6, 60, '#dff4ff', rng);
        K.glowSpot(ctx, w * 0.5, h * 0.9, w * 0.6, '#8ab4d4', 0.25);
      },
      layers,
      shafts: [
        { x: 520, f: 0.18, w0: 40, w1: 220, slant: 90, color: '#d8f4ff', alpha: 0.1, after: 0, speed: 0.2 },
        { x: 1500, f: 0.2, w0: 50, w1: 240, slant: 120, color: '#c8ecff', alpha: 0.08, after: 1, speed: 0.26, phase: 2 },
      ],
    };
  }

  Art.defineRegion({
    id: 'rime', name: 'The Rime',
    palette: pal,
    materials: { ice: '#a8d8f0', stone: '#4a6074', stoneDark: '#22303e', stoneLight: '#8aa4b8', wood: '#3a4450', woodDark: '#1c222a', woodLight: '#7a8a98',
      wax: '#dce6ec', waxShade: '#8a9aa8', crystal: '#bfeaff', iron: '#2a3038', ironLight: '#7a8a9a' },
    theme: { bg: 'open' },
    terrain: {
      texture: { type: 'ice', cracks: 16 },
      texStrength: 0.8,
      ramp: [[0, '#9ab8d0'], [3, '#5a7690'], [9, '#2a3a4c'], [18, 'fill']],
      rimWidth: 9, rim: 1.0, rimSide: 0.26, rimColor: '#f4fbff',
      floor: [
        { type: 'drift', color: '#dfeef8', color2: '#ffffff', h: 4.2, scale: 70, threshold: 0.3, alpha: 0.95 },
        { type: 'crystals', color: '#9ad0ec', density: 0.06, h: [4, 12], cluster: 0.5 },
      ],
      ceiling: [{ type: 'drips', color: '#9ccce4', color2: '#ffffff', density: 0.34, len: [6, 30], w: [2, 5], pointy: true, longChance: 0.12, shine: 0.8 }],
      wall: [{ type: 'frost', color: '#e0f4ff', density: 0.32, len: 10, alpha: 0.55 }],
      spikes: { type: 'ice' },
      platform: { type: 'ice' },
      glaze: { color: '#b4e0f6', deep: '#2a4a64', sheen: '#ffffff' },
    },
    liquids: { water: { top: '#8ac8e0', deep: '#081420', alphaTop: 0.5 } },
    decor: [
      { kind: 'frozen_waxen', where: 'floor', chance: 0.015, gap: 12, width: 2, height: 3, dim: 0.2, opts: (rng) => ({ variant: rng.int(0, 1) }) },
      { kind: 'ice_spire', where: 'floor', chance: 0.025, gap: 7, height: 3, dim: 0.25 },
      { kind: 'crystal', where: 'floor', chance: 0.015, gap: 9, height: 2, opts: { color: '#a8e4ff' } },
      { kind: ['wick_grave', 'sconce_dead', 'bones'], where: 'floor', chance: 0.02, gap: 9, height: 2 },
      { kind: 'column_broken', where: 'floor', chance: 0.01, gap: 16, height: 3, dim: 0.35, opts: (rng) => ({ h: rng.range(60, 110) }) },
      { kind: 'stalagmite', where: 'floor', chance: 0.02, gap: 8, height: 2, opts: (rng) => ({ h: rng.range(40, 70) }) },
      { kind: 'drip', where: 'ceiling', chance: 0.02, gap: 9, opts: (rng, c, r, tile) => { let k = 0; while (k < 20 && tile(c, r + k + 1) === 0) k++; return { fall: (k + 1) * 40 - 12, color: '#d8f0ff' }; } },
      { kind: 'grass_clump', where: 'floor', chance: 0.04, gap: 3, layer: 'front', opts: { color: '#1a2634', h: 14 } },
    ],
    weather: [{ kind: 'snow', count: 120, color: '#f0f8ff' }, { kind: 'motes', count: 18, color: '#bfeaff' }],
    fog: { alpha: 0.18, color: '#7a98b4' },
    vignette: 0.55,
    grade: { top: '#040814', topA: 0.12, bottom: '#bfe0f4', bottomA: 0.05 },
    fg: { kinds: ['icicles', 'crystal', 'rock'], density: 0.9 },
    bg: { recipe },
  });
})();
