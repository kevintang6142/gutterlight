// src/art/regions/sanctum.js — The Heartwick Sanctum: gold & white on deep black. Crystal
// architecture, the colossal golden bars of the Everlantern's cage around a radiant core, light
// shafts and slow-rising motes of light.
(function () {
  'use strict';
  const G = globalThis.G;
  const Art = G.Art;
  const U = Art.util, K = Art.BG.kit;
  const { mix, rgba } = U;
  const TAU = Math.PI * 2;

  const pal = {
    skyTop: '#030203', skyBottom: '#1c150a', far: '#2c2412', mid: '#1c170c', near: '#0e0b06',
    fill: '#0d0b08', fillDeep: '#030202', edge: '#8c7646', highlight: '#fff4d8', accent: '#ffd870',
    light: '#ffe8a8', fog: '#3a2e16', particle: '#fff0c4', mapColor: '#e2c46c', darkness: '#040302',
    water: '#c8b47a', waterDeep: '#1a140a',
  };
  const GOLD = '#d8a848', GOLD_HI = '#ffe6a0', CORE = '#fff8e0';

  // Crystal column: a tall faceted prism with gold collars.
  function crystalColumn(ctx, x, yb, cw, ch, c, gold) {
    ctx.fillStyle = c;
    ctx.beginPath(); ctx.moveTo(x - cw / 2, yb); ctx.lineTo(x - cw / 2, yb - ch + cw * 0.6); ctx.lineTo(x, yb - ch); ctx.lineTo(x + cw / 2, yb - ch + cw * 0.6); ctx.lineTo(x + cw / 2, yb); ctx.closePath(); ctx.fill();
    ctx.fillStyle = rgba('#ffffff', 0.06); ctx.fillRect(x - cw * 0.1, yb - ch + cw * 0.5, cw * 0.18, ch - cw * 0.5);
    if (gold) { ctx.fillStyle = gold; for (const t of [0.12, 0.6]) ctx.fillRect(x - cw * 0.62, yb - ch * t - 5, cw * 1.24, 7); }
  }

  function recipe(th, info) {
    const kind = th.bg || 'open';
    if (kind === 'none') return Art.BG.genericRecipe(th, info);
    const shaft = kind === 'shaft', interior = kind === 'interior';
    const c0 = '#2a2210', c1 = '#1c170b', c2 = '#120f07', c3 = '#060503';
    const g0 = mix(GOLD, c0, 0.55), g1 = mix(GOLD, c1, 0.45), g2 = mix(GOLD, c2, 0.35);
    const layers = [];
    // backdrop: the Everlantern far below — vast curved cage bars around a radiant heart
    layers.push({ f: 0.04, lowres: 0.45, haze: 0.3, hazeColor: '#4a3a18', fog: { alpha: 0.5, h: 0.45, color: '#6a5424' },
      draw(ctx, w, h, rng, li) {
        const cx = w * rng.range(0.4, 0.6), cy = h * 0.72;
        K.glowSpot(ctx, cx, cy, h * 0.6, '#ffd890', 0.35);
        K.glowSpot(ctx, cx, cy, h * 0.18, CORE, 0.6);
        li.addGlow(cx, cy, h * 0.5, '#ffd070', 0.35, 0.12);
        if (!interior) K.cageBars(ctx, cx, -40, h * 1.1, { n: 13, spread: w * 0.9, topSpread: w * 0.12, color: mix(g0, c0, 0.25), width: 8, rings: 3 });
        for (let x = rng.range(0, 140); x < w; x += rng.range(90, 200)) if (Math.abs(x - cx) > 160) crystalColumn(ctx, x, h + 4, rng.range(26, 50), rng.range(h * 0.3, h * 0.75), c0, null);
      } });
    // L1: crystal architecture — faceted columns banded in gold, pointed crystal arches
    layers.push({ f: 0.15, lowres: 0.6, haze: 0.14, hazeColor: '#3a2e14', fog: { alpha: 0.5, h: 0.4, color: '#5a4820' },
      shade: { top: 'rgba(255,240,200,0.08)', bottom: 'rgba(0,0,0,0.12)' },
      draw(ctx, w, h, rng, li) {
        const yb = h * 0.97;
        for (let x = rng.range(40, 200); x < w; x += rng.range(160, 300)) {
          const cw = rng.range(40, 66), ch = shaft ? h * 1.05 : rng.range(h * 0.5, h * 0.92);
          K.wrap(w, x, cw, (xx) => crystalColumn(ctx, xx, yb, cw, ch, c1, g1));
          if (rng.chance(0.4)) li.addGlow(x, yb - ch * 0.6, cw * 1.6, GOLD_HI, 0.18, 0.2);
        }
        if (!shaft) for (let x = rng.range(100, 300); x < w; x += rng.range(400, 700)) { // crystal arch
          K.wrap(w, x, 140, (xx) => {
            ctx.strokeStyle = c1; ctx.lineWidth = 18;
            ctx.beginPath(); ctx.moveTo(xx - 120, yb); ctx.lineTo(xx - 120, yb - h * 0.35); ctx.lineTo(xx, yb - h * 0.62); ctx.lineTo(xx + 120, yb - h * 0.35); ctx.lineTo(xx + 120, yb); ctx.stroke();
            ctx.strokeStyle = g1; ctx.lineWidth = 3;
            ctx.beginPath(); ctx.moveTo(xx - 120, yb - h * 0.35); ctx.lineTo(xx, yb - h * 0.62); ctx.lineTo(xx + 120, yb - h * 0.35); ctx.stroke();
          });
        }
      } });
    // L2: near golden bars with rings and crystal clusters; white-gold rim light
    layers.push({ f: 0.32, haze: 0.03, fog: { alpha: 0.38, h: 0.3, color: '#4a3c1a' }, bands: [[0, 1]],
      rim: { color: '#fff0c0', alpha: 0.42, width: 2 },
      draw(ctx, w, h, rng) {
        const yb = h * 0.99;
        ctx.fillStyle = c2; ctx.fillRect(0, yb, w, h - yb);
        for (let x = rng.range(60, 220); x < w; x += rng.range(260, 480)) {
          K.wrap(w, x, 30, (xx) => {
            ctx.fillStyle = g2; ctx.fillRect(xx - 7, 0, 14, yb);
            ctx.fillStyle = rgba(GOLD_HI, 0.25); ctx.fillRect(xx - 6, 0, 3, yb);
            for (let y = rng.range(60, 200); y < yb; y += rng.range(180, 320)) { ctx.fillStyle = g2; ctx.fillRect(xx - 14, y, 28, 9); }
          });
        }
        for (let x = rng.range(20, 200); x < w; x += rng.range(220, 420)) {
          K.wrap(w, x, 80, (xx) => { for (let k = 0; k < 5; k++) K.crystal(ctx, xx + rng.range(-40, 40), yb + 2, rng.range(14, 30), rng.range(40, 120), { color: c2, lean: rng.range(-20, 20), hi: mix(c2, '#fff0c0', 0.1) }); });
        }
      } });
    // L3: near dark crystal teeth
    layers.push({ f: 0.58, fog: { alpha: 0.14, h: 0.14, color: '#3a2e14' }, bands: [[0, 0.2], [0.72, 1]],
      draw(ctx, w, h, rng) {
        K.ridge(ctx, w, h, { base: h * 1.01, amp: 28, scale: 160, color: c3, seed: rng.int(1, 1e6), sharp: true });
        for (let x = rng.range(0, 160); x < w; x += rng.range(120, 300)) for (let k = 0; k < 3; k++) K.crystal(ctx, x + rng.range(-30, 30), h + 4, rng.range(20, 40), rng.range(40, 110), { color: c3, lean: rng.range(-20, 20) });
        ctx.fillStyle = c3; ctx.fillRect(0, 0, w, 12);
        K.stalactites(ctx, w, 10, { color: c3, rng, minL: 10, maxL: 70, minW: 10, maxW: 30, band: 2 });
      } });
    return {
      sky: { top: '#020101', bottom: '#241a0a', gy: 0.75, gr: 0.6, glowColor: '#ffcf70', glowA: 0.22 },
      layers,
      shafts: [
        { x: 300, f: 0.16, w0: 30, w1: 240, slant: 60, color: '#fff2c8', alpha: 0.13, after: 0, speed: 0.25 },
        { x: 820, f: 0.18, w0: 60, w1: 320, slant: -40, color: '#ffe8b0', alpha: 0.12, after: 1, speed: 0.2, phase: 1.3 },
        { x: 1450, f: 0.16, w0: 40, w1: 260, slant: 80, color: '#fff2c8', alpha: 0.11, after: 0, speed: 0.3, phase: 2.7 },
        { x: 2100, f: 0.18, w0: 50, w1: 280, slant: -70, color: '#ffe8b0', alpha: 0.1, after: 1, speed: 0.22, phase: 4.1 },
      ],
    };
  }

  Art.defineRegion({
    id: 'sanctum', name: 'The Heartwick Sanctum',
    palette: pal,
    materials: { gold: '#d8a848', goldLight: '#ffe6a0', stone: '#3e3420', stoneDark: '#1e180c', stoneLight: '#8a7a54', crystal: '#fff0c8',
      glass: '#ffe0a0', wax: '#f4ecd8', waxShade: '#b0a07a', cloth: '#e8dcc0', clothDark: '#8a7a5a', iron: '#2a2418', ironLight: '#8a7448' },
    theme: { bg: 'open' },
    terrain: {
      texture: { type: 'facets', count: 40 },
      texStrength: 0.7,
      ramp: [[0, '#b4965a'], [3, '#5e4c28'], [9, '#2a2214'], [18, 'fill']],
      rimWidth: 9, rim: 1.0, rimSide: 0.28, rimColor: '#fff6dc',
      floor: [
        { type: 'crystals', color: '#f0dca0', color2: 'rgba(255,255,255,0.7)', density: 0.1, h: [4, 12], cluster: 0.5, glow: 0.12, glowColor: GOLD_HI },
        { type: 'pebbles', color: '#0a0806', color2: '#8a7446', density: 0.1 },
      ],
      ceiling: [{ type: 'crystals', side: 1, color: '#c8b07a', density: 0.14, h: [6, 18], cluster: 0.5 }],
      wall: [{ type: 'streaks', color: '#000000', alpha: 0.3, density: 0.12, len: 60 }],
      spikes: { type: 'crystal', color: '#f0d890', glow: '#ffd870' },
      platform: { type: 'gold' },
      glaze: { color: '#e8d8a8', deep: '#3a3018', sheen: '#ffffff' },
    },
    liquids: { water: { top: '#d8c890', deep: '#1a140a', alphaTop: 0.4 } },
    decor: [
      { kind: 'crystal', where: 'floor', chance: 0.035, gap: 6, height: 2, opts: { color: '#fff0c8' } },
      { kind: 'cage_bars', where: 'floor', chance: 0.012, gap: 14, width: 2, height: 6, dim: 0.35 },
      { kind: 'candelabra', where: 'floor', chance: 0.015, gap: 10, height: 3, opts: { material: 'gold', flame: 'gold' } },
      { kind: 'candle_cluster', where: 'floor', chance: 0.02, gap: 8, opts: { flame: 'gold' } },
      { kind: 'statue_waxen', where: 'floor', chance: 0.008, gap: 22, width: 2, height: 5, dim: 0.4, opts: { variant: 0, material: 'gold' } },
      { kind: 'altar', where: 'floor', chance: 0.005, gap: 30, width: 2, height: 2 },
      { kind: 'cage_hanging', where: 'ceiling', chance: 0.01, gap: 12, fitLen: [24, 0.35], opts: { material: 'gold' } },
      { kind: 'banner', where: 'ceiling', chance: 0.01, gap: 12, height: 4, dim: 0.2, opts: (rng) => ({ len: rng.range(90, 130) }) },
    ],
    weather: [{ kind: 'light', count: 70, color: '#ffeab0' }, { kind: 'motes', count: 30, color: '#fff4d0' }],
    fog: { alpha: 0.14, color: '#5a4820' },
    vignette: 0.7,
    grade: { top: '#000000', topA: 0.14, bottom: '#ffd070', bottomA: 0.06 },
    fg: { kinds: ['crystal', 'pillar'], density: 0.8 },
    bg: { recipe },
  });
})();
