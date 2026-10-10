// src/art/regions/chandlery.js — The Chandlery: rust & iron pouring-forges, great vats of molten wax,
// chains and gantries, giant ladles pouring bright streams, furnace mouths and rising embers.
(function () {
  'use strict';
  const G = globalThis.G;
  const Art = G.Art;
  const U = Art.util, K = Art.BG.kit;
  const { mix, rgba } = U;
  const TAU = Math.PI * 2;

  const pal = {
    skyTop: '#090504', skyBottom: '#3c2214', far: '#4a3226', mid: '#33221a', near: '#1e1410',
    fill: '#17110e', fillDeep: '#070504', edge: '#7c5238', highlight: '#f2b482', accent: '#ff8a20',
    light: '#ffa040', fog: '#5a3420', particle: '#ffb868', mapColor: '#d0863a', darkness: '#070403',
    water: '#6a6050', waterDeep: '#120e0a', lava: '#ff8a20', lavaHot: '#fff0b0', lavaDeep: '#a8300c',
  };
  const MOLTEN = '#ff9a2a', MOLTEN_HOT = '#ffe6a0';

  function gearShape(ctx, x, y, r, teeth, c) {
    ctx.fillStyle = c;
    ctx.beginPath();
    for (let i = 0; i < teeth * 2; i++) {
      const a0 = (i / (teeth * 2)) * TAU, a1 = ((i + 1) / (teeth * 2)) * TAU, rr = i % 2 ? r * 0.84 : r;
      ctx.lineTo(x + Math.cos(a0) * rr, y + Math.sin(a0) * rr); ctx.lineTo(x + Math.cos(a1) * rr, y + Math.sin(a1) * rr);
    }
    ctx.closePath(); ctx.fill();
    ctx.save(); ctx.globalCompositeOperation = 'destination-out';
    ctx.beginPath(); ctx.arc(x, y, r * 0.18, 0, TAU); ctx.fill();
    for (let k = 0; k < 5; k++) { const a = (k / 5) * TAU; ctx.beginPath(); ctx.arc(x + Math.cos(a) * r * 0.5, y + Math.sin(a) * r * 0.5, r * 0.16, 0, TAU); ctx.fill(); }
    ctx.restore();
  }
  // A great ladle on a chain, tipping a bright stream of molten wax down to `yb`.
  function pour(ctx, x, y, yb, s, c, li, a) {
    K.chain(ctx, x, 0, y - 30 * s, { color: c, link: 16 * s, width: 3 * s });
    ctx.fillStyle = c;
    ctx.save(); ctx.translate(x, y); ctx.rotate(0.5);
    ctx.fillRect(-4 * s, -36 * s, 8 * s, 30 * s);
    ctx.beginPath(); ctx.moveTo(-34 * s, -6 * s); ctx.quadraticCurveTo(-30 * s, 26 * s, 0, 28 * s); ctx.quadraticCurveTo(30 * s, 26 * s, 34 * s, -6 * s); ctx.closePath(); ctx.fill();
    ctx.restore();
    const sx = x + 30 * s, sy = y + 14 * s;
    const g = ctx.createLinearGradient(sx, sy, sx, yb);
    g.addColorStop(0, MOLTEN_HOT); g.addColorStop(1, MOLTEN);
    ctx.strokeStyle = g; ctx.lineCap = 'round';
    ctx.lineWidth = 6 * s; ctx.beginPath(); ctx.moveTo(sx, sy); ctx.quadraticCurveTo(sx + 14 * s, sy + 20 * s, sx + 14 * s, sy + 60 * s); ctx.lineTo(sx + 14 * s, yb); ctx.stroke();
    if (li) { li.addGlow(sx + 14 * s, (sy + yb) / 2, (yb - sy) * 0.45, MOLTEN, a, 0.35); li.addGlow(sx + 14 * s, yb, 90 * s, MOLTEN_HOT, a, 0.5); }
  }
  function furnace(ctx, x, yb, fw, fh, c, li, a) {
    ctx.fillStyle = c;
    ctx.beginPath(); ctx.moveTo(x - fw / 2, yb); ctx.lineTo(x - fw * 0.42, yb - fh); ctx.lineTo(x + fw * 0.42, yb - fh); ctx.lineTo(x + fw / 2, yb); ctx.closePath(); ctx.fill();
    ctx.fillRect(x - fw * 0.16, yb - fh - fh * 0.9, fw * 0.32, fh * 0.92);
    const mw = fw * 0.42, mh = fh * 0.36, my = yb - fh * 0.18;
    const g = ctx.createLinearGradient(0, my - mh, 0, my);
    g.addColorStop(0, '#ff6a18'); g.addColorStop(1, MOLTEN_HOT);
    ctx.fillStyle = g;
    ctx.beginPath(); ctx.moveTo(x - mw / 2, my); ctx.lineTo(x - mw / 2, my - mh + mw / 2); ctx.arc(x, my - mh + mw / 2, mw / 2, Math.PI, 0); ctx.lineTo(x + mw / 2, my); ctx.closePath(); ctx.fill();
    ctx.fillStyle = c; for (let k = 1; k < 4; k++) ctx.fillRect(x - mw / 2 + (mw * k) / 4 - 1.5, my - mh, 3, mh);
    if (li) li.addGlow(x, my - mh * 0.4, fw * 1.1, '#ff7a20', a, 0.5);
  }

  function recipe(th, info) {
    const kind = th.bg || 'open';
    if (kind === 'none') return Art.BG.genericRecipe(th, info);
    const shaft = kind === 'shaft';
    const c0 = '#432c22', c1 = '#30201a', c2 = '#211611', c3 = '#0d0907';
    const layers = [];
    // backdrop: the foundry hall — vats, furnace stacks and chains in rusty haze
    layers.push({ f: 0.04, lowres: 0.45, haze: 0.38, hazeColor: '#6a3a20', fog: { alpha: 0.55, h: 0.5, color: '#8a4a20', top: 0.35, topH: 0.3 },
      draw(ctx, w, h, rng, li) {
        if (kind === 'interior') K.brickWall(ctx, 0, 0, w, h, { color: c0, rng, bw: 70, bh: 30 });
        for (let x = rng.range(0, 200); x < w; x += rng.range(220, 380)) {
          if (rng.chance(0.5)) furnace(ctx, x, h + 4, rng.range(110, 170), rng.range(120, 180), c0, li, 0.28);
          else K.vat(ctx, x, h + 4, rng.range(150, 230), rng.range(110, 170), { color: c0, bands: rgba('#000000', 0.25), glow: MOLTEN, addGlow: (gx, gy, r, col) => li.addGlow(gx, gy, r, col, 0.3, 0.4) });
        }
        for (let x = rng.range(0, 160); x < w; x += rng.range(100, 220)) K.chain(ctx, x, 0, h * rng.range(0.15, 0.5), { color: c0, link: 20, width: 4 });
        ctx.fillStyle = c0; ctx.fillRect(0, h * 0.08, w, 14);
      } });
    // L1: gantries, gears and ladles pouring into vats below
    layers.push({ f: 0.15, lowres: 0.6, haze: 0.15, hazeColor: '#5a3018', fog: { alpha: 0.5, h: 0.42, color: '#7a3c18' },
      shade: { top: 'rgba(0,0,0,0.12)', bottom: 'rgba(255,140,60,0.05)' },
      draw(ctx, w, h, rng, li) {
        const gy = h * rng.range(0.16, 0.26);
        ctx.fillStyle = c1; ctx.fillRect(-10, gy, w + 20, 12); ctx.fillRect(-10, gy + 30, w + 20, 6);
        ctx.strokeStyle = c1; ctx.lineWidth = 3; ctx.beginPath();
        for (let x = -10; x < w + 20; x += 30) { ctx.moveTo(x, gy + 12); ctx.lineTo(x + 15, gy + 30); ctx.lineTo(x + 30, gy + 12); }
        ctx.stroke();
        for (let x = rng.range(40, 200); x < w; x += rng.range(240, 420)) { ctx.fillStyle = c1; ctx.fillRect(x - 8, gy, 16, h); }
        for (let x = rng.range(100, 400); x < w; x += rng.range(380, 640)) {
          const vy = shaft ? h * rng.range(0.55, 0.9) : h * 0.97;
          K.wrap(w, x, 160, (xx) => {
            if (!shaft) K.vat(ctx, xx + 40, vy, 150, 110, { color: c1, bands: rgba('#000000', 0.3), glow: MOLTEN, addGlow: (gx2, gy2, r, col) => li.addGlow(gx2, gy2, r, col, 0.4, 0.4) });
            pour(ctx, xx, gy + rng.range(90, 160), shaft ? vy : vy - 110, 1, c1, li, 0.4);
          });
        }
        for (let x = rng.range(200, 500); x < w; x += rng.range(500, 900)) K.wrap(w, x, 90, (xx) => gearShape(ctx, xx, gy - 40, rng.range(50, 80), rng.int(10, 14), c1));
      } });
    // L2: near molds, a stack of ingots and rust-red rim light from the forges
    layers.push({ f: 0.32, haze: 0.05, hazeColor: '#3a1c0e', fog: { alpha: 0.28, h: 0.3, color: '#5a2810' }, bands: [[0, 0.3], [0.4, 1]],
      rim: { color: '#ff9a50', alpha: 0.32, width: 2 },
      draw(ctx, w, h, rng, li) {
        const yb = h * 0.985;
        ctx.fillStyle = c2; ctx.fillRect(0, yb, w, h - yb);
        for (let x = rng.range(40, 200); x < w; x += rng.range(180, 340)) {
          const t = rng.next();
          K.wrap(w, x, 90, (xx) => {
            if (t < 0.4) { // mold racks: stacked candle molds
              for (let r = 0; r < 4; r++) for (let k = 0; k < 4 - r; k++) { ctx.fillStyle = c2; ctx.fillRect(xx - 60 + k * 30 + r * 15, yb - 28 - r * 28, 26, 28); ctx.beginPath(); ctx.arc(xx - 47 + k * 30 + r * 15, yb - 28 - r * 28, 13, Math.PI, 0); ctx.fill(); }
            } else if (t < 0.7) furnace(ctx, xx, yb, rng.range(90, 130), rng.range(90, 130), c2, li, 0.5);
            else { // tall support with a hanging hook
              ctx.fillStyle = c2; ctx.fillRect(xx - 12, 0, 24, yb); ctx.fillRect(xx - 12, h * 0.2, 110, 14);
              K.chain(ctx, xx + 86, h * 0.2 + 14, h * 0.2 + rng.range(60, 160), { color: c2, link: 14, width: 3 });
            }
          });
        }
      } });
    // L3: dark near chains and slag
    layers.push({ f: 0.58, fog: { alpha: 0.16, h: 0.14, color: '#4a200c' }, bands: [[0, 0.24], [0.7, 1]],
      draw(ctx, w, h, rng) {
        K.ridge(ctx, w, h, { base: h * 1.01, amp: 34, scale: 150, color: c3, seed: rng.int(1, 1e6), sharp: true });
        ctx.fillStyle = c3; ctx.fillRect(0, 0, w, 22);
        for (let x = rng.range(30, 200); x < w; x += rng.range(140, 320)) {
          K.chain(ctx, x, 0, rng.range(70, h * 0.22), { color: c3, link: 20, width: 5 });
        }
      } });
    return {
      sky: { top: '#060302', bottom: '#4a2410', gy: 0.9, gr: 0.85, glowColor: '#ff7a20', glowA: 0.26 },
      layers,
    };
  }

  Art.defineRegion({
    id: 'chandlery', name: 'The Chandlery',
    palette: pal,
    materials: { iron: '#2e2624', ironLight: '#7a6458', rust: '#7a3a1c', stone: '#4e3a30', stoneDark: '#281c16', stoneLight: '#8a6a58',
      wood: '#4a3424', woodDark: '#241810', woodLight: '#7a5a40', wax: '#ecd2a8', waxShade: '#a88864', gold: '#c88a40', goldLight: '#ffd090' },
    theme: { bg: 'open' },
    terrain: {
      texture: { type: 'plates', w: 80, h: 60 },
      texStrength: 0.7,
      ramp: [[0, '#966a4c'], [3, '#5c3e2c'], [9, '#2c1e16'], [18, 'fill']],
      rimWidth: 8, rim: 1.0, rimSide: 0.22, rimBottom: 0.12, rimColor: '#ffcc98',
      floor: [
        { type: 'drift', color: '#c8a078', color2: '#ffe0b0', h: 2.6, scale: 90, threshold: 0.55, alpha: 0.9 },
        { type: 'pebbles', color: '#140d0a', color2: '#7a4a30', density: 0.2, size: 3.5 },
        { type: 'tufts', color: '#3a1606', color2: '#ff8a30', alpha2: 0.85, density: 0.08, cluster: 0.6, r: [1.2, 2.4], glow: 0.3, glowColor: MOLTEN },
      ],
      ceiling: [{ type: 'drips', color: '#c08a5a', color2: '#ffe0b0', density: 0.24, len: [4, 22], w: [2, 5], cluster: 0.4 }],
      wall: [
        { type: 'streaks', color: '#2a0e04', alpha: 0.45, density: 0.25, len: 90 },
        { type: 'rivets', color: '#d8a07a', density: 0.7, step: 24, inset: 8, alpha: 0.55 },
      ],
      spikes: { type: 'iron', tip: '#ffc070', color2: '#c07a50' },
      platform: { type: 'iron', glow: MOLTEN },
      glaze: { color: '#c08a5a', deep: '#2c1e16', sheen: '#fff0d8' },
      lavaGlow: 0.9,
    },
    liquids: { water: { top: '#7a6a58', deep: '#100c08', alphaTop: 0.5 }, lava: { hot: '#fff0b0', color: '#ff8a20', deep: '#a8300c' } },
    decor: [
      { kind: 'vat', where: 'floor', chance: 0.012, gap: 16, width: 3, height: 3, dim: 0.3 },
      { kind: 'mold_stack', where: 'floor', chance: 0.03, gap: 6, width: 2, height: 2 },
      { kind: ['anvil', 'crate', 'cart'], where: 'floor', chance: 0.02, gap: 9, width: 2, height: 2 },
      { kind: 'gear', where: 'floor', chance: 0.008, gap: 20, width: 2, height: 3, dim: 0.4 },
      { kind: 'grate_glow', where: 'floor', chance: 0.018, gap: 10, width: 2 },
      { kind: 'candle_cluster', where: 'floor', chance: 0.02, gap: 8, opts: (rng) => ({ lit: rng.chance(0.5) }) },
      { kind: 'ladle', where: 'ceiling', chance: 0.012, gap: 14, width: 1, height: 4, fitLen: [30, 0.3] },
      { kind: 'chain', where: 'ceiling', chance: 0.04, gap: 6, fitLen: [50, 0.55], opts: (rng) => ({ hook: rng.chance(0.5) }) },
      { kind: 'cage_hanging', where: 'ceiling', chance: 0.006, gap: 16, fitLen: [24, 0.3] },
      { kind: 'lantern_hanging', where: 'ceiling', chance: 0.01, gap: 14, fitLen: [20, 0.3], opts: { lit: true } },
    ],
    weather: [{ kind: 'embers', count: 55, color: '#ffa040' }, { kind: 'motes', count: 30, color: '#ffd0a0' }],
    fog: { alpha: 0.17, color: '#6a3818' },
    vignette: 0.58,
    grade: { top: '#000000', topA: 0.12, bottom: '#ff7a20', bottomA: 0.07 },
    fg: { kinds: ['chain', 'pipe', 'beam'], density: 1 },
    bg: { recipe },
  });
})();
