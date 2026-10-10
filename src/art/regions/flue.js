// src/art/regions/flue.js — The Sootflue: a vertical warren of charcoal brick chimneys and iron
// pipes, glowing furnace grates and vents far below, smoke plumes, rising embers and falling soot.
(function () {
  'use strict';
  const G = globalThis.G;
  const Art = G.Art;
  const U = Art.util, K = Art.BG.kit;
  const { mix, rgba } = U;
  const TAU = Math.PI * 2;

  const pal = {
    skyTop: '#090505', skyBottom: '#3a1a10', far: '#3c2824', mid: '#2a1b18', near: '#170f0d',
    fill: '#141010', fillDeep: '#060404', edge: '#5e443a', highlight: '#e0a882', accent: '#ff6a2a',
    light: '#ff8a40', fog: '#4c2c22', particle: '#ffa060', mapColor: '#b8513c', darkness: '#070303',
    water: '#5a5450', waterDeep: '#120e0c', lava: '#ff5a1a', lavaHot: '#ffd070', lavaDeep: '#801808',
  };
  const EMBER = '#ff6a2a', HOT = '#ffb060';

  // Grate: a barred furnace mouth glowing from within.
  function grate(ctx, x, y, gw, gh, c, li, a) {
    const g = ctx.createLinearGradient(0, y - gh, 0, y);
    g.addColorStop(0, '#ff8a3a'); g.addColorStop(1, '#ffd080');
    ctx.fillStyle = g; ctx.fillRect(x - gw / 2, y - gh, gw, gh);
    ctx.fillStyle = c;
    const n = Math.max(3, Math.round(gw / 9));
    for (let k = 0; k <= n; k++) ctx.fillRect(x - gw / 2 + (gw * k) / n - 1.5, y - gh, 3, gh);
    ctx.fillRect(x - gw / 2 - 4, y - gh - 4, gw + 8, 5); ctx.fillRect(x - gw / 2 - 4, y - 1, gw + 8, 5);
    if (li) li.addGlow(x, y - gh / 2, gw * 2.2, EMBER, a, 0.5);
  }
  // Smoke plume: stacked soft dark puffs rising (and leaning) from a chimney mouth.
  function plume(ctx, x, y, s, c, rng) {
    let px = x, py = y, r = 10 * s;
    const lean = rng.range(-0.6, 0.6);
    for (let k = 0; k < 14; k++) {
      const g = ctx.createRadialGradient(px, py, 0, px, py, r);
      g.addColorStop(0, rgba(c, 0.32 - k * 0.018)); g.addColorStop(1, rgba(c, 0));
      ctx.fillStyle = g; ctx.fillRect(px - r, py - r, r * 2, r * 2);
      py -= r * 0.7; px += lean * r * 0.5 + rng.range(-4, 4) * s; r *= 1.13;
    }
  }
  function stack(ctx, x, yb, cw, ch, c, li, glowA, rng) {
    K.chimney(ctx, x, yb, cw, ch, { color: c, bricks: rgba('#000000', 0.22), bands: mix(c, '#000000', 0.3), glow: rng.chance(0.7) ? EMBER : null, addGlow: li ? (gx, gy, r, col) => li.addGlow(gx, gy, r, col, glowA, 0.45) : null });
  }

  function recipe(th, info) {
    const kind = th.bg || 'open';
    if (kind === 'none') return Art.BG.genericRecipe(th, info);
    const shaft = kind === 'shaft', interior = kind === 'interior', sky = kind === 'sky';
    const c0 = '#3a2622', c1 = '#2a1b18', c2 = '#22150f', c3 = '#0c0807';
    const layers = [];
    // backdrop: colossal chimneys in red haze, the furnace glow welling up from below
    layers.push({ f: 0.04, lowres: 0.45, haze: 0.4, hazeColor: '#5a2a1c', fog: { alpha: 0.5, h: 0.5, color: '#7a3018', top: sky ? 0 : 0.35, topH: 0.3 },
      draw(ctx, w, h, rng, li) {
        if (interior) K.brickWall(ctx, 0, 0, w, h, { color: c0, rng, bw: 52, bh: 22 });
        for (let x = rng.range(0, 160); x < w; x += rng.range(150, 300)) {
          const cw = rng.range(40, 90), ch = shaft ? h * 1.2 : rng.range(h * 0.45, h * 0.9);
          stack(ctx, x, h + 10, cw, ch, c0, li, 0.3, rng);
          if (!interior) plume(ctx, x, h + 10 - ch - 10, cw / 40, '#100808', rng);
        }
        for (let k = 0; k < 5; k++) li.addGlow(rng.range(0, w), h * rng.range(0.75, 1), rng.range(120, 220), '#ff5a1a', 0.12, 0.3);
      } });
    // L1: pipe works and grates set in brick piers
    layers.push({ f: 0.15, lowres: 0.6, haze: 0.14, hazeColor: '#4a2418', fog: { alpha: 0.45, h: 0.45, color: '#6a2814' },
      shade: { top: 'rgba(0,0,0,0.15)', bottom: 'rgba(255,120,60,0.05)' },
      draw(ctx, w, h, rng, li) {
        // horizontal pipe runs with drops
        for (let y = rng.range(h * 0.12, h * 0.3); y < h * 0.9; y += rng.range(h * 0.22, h * 0.4)) {
          const pw = rng.range(14, 26), pts = [[-30, y]];
          let x = -30;
          while (x < w + 30) {
            x += rng.range(120, 300);
            const yy = pts[pts.length - 1][1];
            pts.push([x, yy]);
            if (rng.chance(0.4)) { const dy = rng.range(-80, 80); pts.push([x, yy + dy]); }
          }
          K.pipe(ctx, pts, pw, { color: c1, jointEvery: 110, lite: rgba('#ff9060', 0.14) });
        }
        for (let x = rng.range(60, 220); x < w; x += rng.range(220, 420)) {
          const pw = rng.range(50, 80), top = shaft ? 0 : rng.range(h * 0.15, h * 0.45);
          K.wrap(w, x, pw, (xx) => {
            ctx.fillStyle = c1; ctx.fillRect(xx - pw / 2, top, pw, h - top);
            ctx.fillStyle = rgba('#000000', 0.25); for (let y = top + 14; y < h; y += 22) ctx.fillRect(xx - pw / 2, y, pw, 2);
            for (let gy = top + rng.range(60, 160); gy < h - 20; gy += rng.range(160, 320)) grate(ctx, xx, gy, pw * 0.6, pw * 0.36, c1, li, 0.35);
          });
        }
      } });
    // L2: near chimney flues and stoking doors with an ember underlight
    layers.push({ f: 0.32, haze: 0.08, hazeColor: '#4a2014', fog: { alpha: 0.5, h: 0.36, color: '#6a2814' }, bands: shaft ? [[0, 1]] : [[0, 0.3], [0.4, 1]],
      rim: { color: '#ff8a4a', alpha: 0.3, width: 2 },
      draw(ctx, w, h, rng, li) {
        for (let x = rng.range(40, 200); x < w; x += rng.range(260, 520)) {
          const cw = rng.range(56, 90);
          if (shaft) K.wrap(w, x, cw, (xx) => stack(ctx, xx, h + 10, cw, h + 20, c2, li, 0.4, rng));
          else K.wrap(w, x, cw, (xx) => stack(ctx, xx, h + 10, cw, rng.range(h * 0.35, h * 0.62), c2, li, 0.4, rng));
        }
        // vertical pipes with valve wheels
        for (let x = rng.range(100, 300); x < w; x += rng.range(300, 560)) {
          const pw = rng.range(12, 20);
          K.wrap(w, x, 40, (xx) => {
            K.pipe(ctx, [[xx, -10], [xx, h + 10]], pw, { color: c2, jointEvery: 130 });
            const vy = rng.range(h * 0.4, h * 0.8);
            ctx.strokeStyle = c2; ctx.lineWidth = 3; ctx.beginPath(); ctx.arc(xx + pw, vy, 12, 0, TAU); ctx.stroke();
            ctx.beginPath(); ctx.moveTo(xx + pw - 12, vy); ctx.lineTo(xx + pw + 12, vy); ctx.moveTo(xx + pw, vy - 12); ctx.lineTo(xx + pw, vy + 12); ctx.stroke();
          });
        }
        if (!shaft) { ctx.fillStyle = c2; ctx.fillRect(0, h * 0.985, w, h * 0.02); }
      } });
    // L3: near darkness — soot ridges, hanging chains and a beam
    // (under an open sky there is nothing to hang from: no ceiling band, chains or stalactites)
    layers.push({ f: 0.58, fog: { alpha: 0.18, h: 0.14, color: '#4a1a0c' }, bands: sky ? [[0.7, 1]] : [[0, 0.22], [0.7, 1]],
      draw(ctx, w, h, rng) {
        K.ridge(ctx, w, h, { base: h * 1.01, amp: 38, scale: 150, color: c3, seed: rng.int(1, 1e6) });
        if (sky) return;
        ctx.fillStyle = c3; ctx.fillRect(0, 0, w, 18);
        for (let x = rng.range(60, 300); x < w; x += rng.range(240, 520)) K.chain(ctx, x, 0, rng.range(60, h * 0.2), { color: c3, link: 18, width: 4 });
        K.stalactites(ctx, w, 14, { color: c3, rng, minL: 8, maxL: 46, minW: 10, maxW: 30, band: 2 });
      } });
    return {
      sky: { top: '#060303', bottom: '#4a1c0e', gy: 0.95, gr: 0.9, glowColor: '#ff5a1a', glowA: 0.3 },
      layers,
    };
  }

  Art.defineRegion({
    id: 'flue', name: 'The Sootflue',
    palette: pal,
    materials: { iron: '#2a2426', ironLight: '#6a5a58', rust: '#6a3220', stone: '#4a3632', stoneDark: '#241816', stoneLight: '#7a5e54',
      wood: '#3a2a22', woodDark: '#1e1410', woodLight: '#6a5040', soot: '#141010', wax: '#c8b8a8', waxShade: '#7a6a60' },
    theme: { bg: 'open' },
    terrain: {
      texture: { type: 'bricks', w: 38, h: 18, jitter: true, mortar: 2 },
      texStrength: 0.75,
      ramp: [[0, '#8e6452'], [3, '#523830'], [9, '#261a17'], [18, 'fill']],
      rimWidth: 8, rim: 1.0, rimSide: 0.24, rimBottom: 0.16, rimColor: '#ffc8a0',
      floor: [
        { type: 'drift', color: '#4e3c36', color2: '#d09478', h: 3.2, scale: 60, threshold: 0.3, alpha: 0.95 },
        { type: 'pebbles', color: '#0e0a0a', color2: '#5a4038', density: 0.22, size: 3.5 },
        { type: 'tufts', color: '#2a120a', color2: '#ff7a3a', alpha2: 0.8, density: 0.12, cluster: 0.6, r: [1.2, 2.6], glow: 0.25, glowColor: EMBER },
      ],
      ceiling: [{ type: 'drips', color: '#1a1414', color2: '#6a5048', density: 0.3, len: [4, 18], w: [2, 4], pointy: true }],
      wall: [{ type: 'streaks', color: '#000000', alpha: 0.5, density: 0.3, len: 90 }],
      spikes: { type: 'iron', tip: '#ffa060', color2: '#a0705a' },
      platform: { type: 'iron' },
      glaze: { color: '#7a4a3a', deep: '#241816', sheen: '#ffd8c0' },
      lavaGlow: 0.8,
    },
    liquids: { water: { top: '#6a6460', deep: '#0e0a0a', alphaTop: 0.5 }, lava: { hot: '#ffd070', color: '#ff5a1a', deep: '#801808' } },
    decor: [
      { kind: 'grate_glow', where: 'floor', chance: 0.03, gap: 8, width: 2 },
      { kind: 'pipe_v', where: 'floor', chance: 0.02, gap: 9, height: 4, dim: 0.3, opts: (rng) => ({ len: rng.range(110, 170), steam: rng.chance(0.5) }) },
      { kind: ['crate', 'rubble', 'bones'], where: 'floor', chance: 0.03, gap: 7 },
      { kind: 'brazier', where: 'floor', chance: 0.008, gap: 18, height: 2 },
      { kind: 'gear', where: 'floor', chance: 0.006, gap: 20, width: 2, height: 3, dim: 0.4 },
      { kind: 'chain', where: 'ceiling', chance: 0.035, gap: 6, fitLen: [40, 0.5], opts: (rng) => ({ hook: rng.chance(0.4) }) },
      { kind: 'cage_hanging', where: 'ceiling', chance: 0.008, gap: 14, fitLen: [24, 0.3] },
      { kind: 'lantern_hanging', where: 'ceiling', chance: 0.008, gap: 16, fitLen: [20, 0.3], opts: { lit: true } },
    ],
    weather: [{ kind: 'embers', count: 60, color: '#ff8a40' }, { kind: 'soot', count: 55, color: '#1a1414' }],
    fog: { alpha: 0.18, color: '#5a2414' },
    vignette: 0.62,
    grade: { top: '#000000', topA: 0.16, bottom: '#ff4a10', bottomA: 0.08 },
    fg: { kinds: ['pipe', 'chain', 'beam', 'rock'], density: 1 },
    bg: { recipe },
  });
})();
