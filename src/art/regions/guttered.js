// src/art/regions/guttered.js — The Guttered Ways: deep umber crossroads, amber accents, brick
// arches & aqueducts, rows of dead sconces, wax stalactites, drifting dust motes.
(function () {
  'use strict';
  const G = globalThis.G;
  const Art = G.Art;
  const U = Art.util, K = Art.BG.kit;
  const { mix, rgba } = U;

  const pal = {
    skyTop: '#0a0705', skyBottom: '#2e2016', far: '#5a4430', mid: '#3c2d1f', near: '#241a11',
    fill: '#17110c', fillDeep: '#070504', edge: '#6e5236', highlight: '#d8ae78', accent: '#eaa84a',
    light: '#ffb45a', fog: '#6a5034', particle: '#ecd29c', mapColor: '#b08850',
    water: '#6c7c6c', waterDeep: '#121816',
  };

  // A dead sconce on a short post (iron cup, snuffed candle stub).
  function sconce(ctx, x, yb, h, c, rng, ember, addGlow) {
    ctx.fillStyle = c;
    ctx.fillRect(x - 2.5, yb - h, 5, h);
    ctx.fillRect(x - 9, yb - 5, 18, 5);
    ctx.beginPath(); ctx.moveTo(x - 15, yb - h); ctx.lineTo(x + 15, yb - h); ctx.lineTo(x + 8, yb - h + 9); ctx.lineTo(x - 8, yb - h + 9); ctx.closePath(); ctx.fill();
    const sh = rng.range(6, 14);
    ctx.fillRect(x - 4.5, yb - h - sh, 9, sh);
    ctx.beginPath(); ctx.ellipse(x - 4.5, yb - h - sh * 0.4, 1.6, sh * 0.35, 0, 0, Math.PI * 2); ctx.fill();
    ctx.fillRect(x - 0.7, yb - h - sh - 5, 1.4, 5);
    if (ember) { ctx.fillStyle = ember; ctx.fillRect(x - 1, yb - h - sh - 6, 2, 2); if (addGlow) addGlow(x, yb - h - sh - 5, 18, ember, 0.4, 0.6); }
  }

  // Background value plan (far → near): warm haze glow in the depths, progressively darker and
  // crisper silhouettes toward the camera so the lit terrain crust always reads in front.
  function recipe(th, info) {
    const P = info.pal;
    const kind = th.bg || 'open';
    if (kind === 'sky' || kind === 'none') return Art.BG.genericRecipe(th, info);
    const c0 = '#3a2b1e', c1 = '#2a1f15', c2 = '#1c140d', c3 = '#0e0a07';
    const fogC = '#5a4128';
    const shaft = kind === 'shaft', interior = kind === 'interior';
    const layers = [];
    // backdrop — the far cavern: a colossal aqueduct ghosting through warm haze
    layers.push({ f: 0.04, lowres: 0.4, haze: 0.5, hazeColor: fogC, fog: { alpha: 0.6, h: 0.55, top: 0.7, topH: 0.45, color: '#2a1e14' },
      draw(ctx, w, h, rng, li) {
        if (interior) K.brickWall(ctx, 0, 0, w, h, { color: c0, rng, bw: 64, bh: 28 });
        else {
          K.arches(ctx, -80, w + 80, h * 0.95, { span: 320, pier: 62, h: h * 0.56, deck: 54, color: c0, tiers: 2 });
          for (let x = rng.range(0, 300); x < w; x += rng.range(260, 420)) K.chain(ctx, x, 0, h * rng.range(0.15, 0.35), { color: c0, link: 22, width: 5 });
        }
        for (let k = 0; k < 5; k++) li.addGlow(rng.range(0, w), rng.range(h * 0.42, h * 0.8), rng.range(50, 110), P.accent, 0.1, 0.35);
      } });
    // L1 — nearer aqueduct with a collapsed span, and fluted pillars
    layers.push({ f: 0.15, lowres: 0.55, haze: 0.22, hazeColor: fogC, fog: { alpha: 0.55, h: 0.45, color: fogC }, bands: [[0.1, 1]],
      shade: { top: 'rgba(255,214,160,0.06)', bottom: 'rgba(0,0,0,0.1)' },
      draw(ctx, w, h, rng) {
        const yb = h * 0.96;
        if (!shaft) {
          const gap0 = rng.range(0.3, 0.6) * w, gap1 = gap0 + rng.range(220, 340);
          K.arches(ctx, -60, gap0, yb, { span: 190, pier: 34, h: h * 0.4, deck: 32, color: c1, tiers: 2 });
          K.arches(ctx, gap1, w + 60, yb, { span: 190, pier: 34, h: h * 0.4, deck: 32, color: c1, tiers: 2 });
          ctx.fillStyle = c1;
          for (const gx of [gap0, gap1]) { ctx.beginPath(); ctx.moveTo(gx - 30, yb - h * 0.44); ctx.lineTo(gx + (gx === gap0 ? 26 : -26), yb - h * 0.41); ctx.lineTo(gx, yb - h * 0.3); ctx.closePath(); ctx.fill(); }
          ctx.fillRect(0, yb, w, h - yb);
        }
        const step = shaft ? 260 : 460;
        for (let x = rng.range(40, 200); x < w; x += rng.range(step * 0.7, step * 1.25)) {
          const pw = rng.range(32, 48), ph = shaft ? h * 0.95 : h * rng.range(0.55, 0.85);
          K.wrap(w, x, pw, (xx) => K.pillar(ctx, xx, yb, pw, ph, { color: c1, broken: rng.chance(0.45) ? rng.range(0.2, 0.5) : 0, flutes: true }));
        }
      } });
    // L2 — ruined arcades with pale keystones and a row of dead sconces (amber rim from the depths)
    layers.push({ f: 0.32, haze: 0.04, hazeColor: fogC, fog: { alpha: 0.45, h: 0.3, color: fogC }, bands: [[0.45, 1]],
      rim: { color: '#c08850', alpha: 0.35, width: 2 },
      draw(ctx, w, h, rng, li) {
        const yb = h * 0.985;
        ctx.fillStyle = c2; ctx.fillRect(0, yb, w, h - yb);
        let x = rng.range(-40, 120);
        while (x < w) {
          const len = rng.range(340, 640), wallH = rng.range(h * 0.22, h * 0.38);
          K.arcade(ctx, x, Math.min(w + 60, x + len), yb, { span: rng.range(96, 130), pier: 22, archH: wallH * 0.62, h: wallH, color: c2, rng, courses: rgba('#000000', 0.25), keystones: mix(c2, P.highlight, 0.1) });
          x += len + rng.range(180, 420);
        }
        for (let sx = rng.range(30, 80); sx < w; sx += rng.range(120, 190)) {
          const lit = rng.chance(0.14);
          K.wrap(w, sx, 20, (xx) => sconce(ctx, xx, yb, rng.range(54, 82), mix(c2, '#000000', 0.25), rng, lit ? P.accent : null, lit ? li.addGlow : null));
        }
      } });
    // L3 — near darkness: rubble mounds, broken columns, dripping stalactites
    layers.push({ f: 0.58, fog: { alpha: 0.16, h: 0.14, color: fogC }, bands: [[0, 0.22], [0.6, 1]],
      draw(ctx, w, h, rng) {
        K.ridge(ctx, w, h, { base: h * 1.01, amp: 46, scale: 150, color: c3, seed: rng.int(1, 1e6) });
        for (let x = rng.range(100, 500); x < w; x += rng.range(520, 900)) K.wrap(w, x, 40, (xx) => K.pillar(ctx, xx, h, rng.range(40, 56), rng.range(h * 0.16, h * 0.3), { color: c3, broken: rng.range(0.1, 0.4) }));
        K.stalactites(ctx, w, 0, { color: c3, rng, minL: 14, maxL: 96, minW: 16, maxW: 46, band: 6, drip: true });
      } });
    return {
      sky: { top: '#060403', bottom: '#2a1d13', gy: 0.7, gr: 0.75, glowColor: '#8a5a30', glowA: 0.32 },
      layers,
      shafts: shaft ? [] : [
        { x: 420, f: 0.2, w0: 70, w1: 300, slant: 160, color: '#f0c890', alpha: 0.13, after: 0, speed: 0.33 },
        { x: 1500, f: 0.2, w0: 46, w1: 230, slant: 120, color: '#f0c890', alpha: 0.1, after: 0, speed: 0.27, phase: 2 },
      ],
    };
  }

  Art.defineRegion({
    id: 'guttered', name: 'The Guttered Ways',
    palette: pal,
    theme: { bg: 'open' },
    terrain: {
      texture: { type: 'rock', scale: 70, amp: 0.2, cracks: 16, courses: 0.16, courseH: 20, courseW: 40 },
      texStrength: 0.85,
      ramp: [[0, '#7c5e3e'], [4, '#4e3a26'], [10, '#2a1f15'], [18, 'fill']],
      rimWidth: 8, rim: 0.95, rimSide: 0.18,
      floor: [
        { type: 'tufts', color: '#4a3a24', color2: '#a07a40', density: 0.35, cluster: 0.55, r: [1.6, 4], glow: 0.08, glowColor: '#e8a848' },
        { type: 'pebbles', color: '#1c140d', color2: '#5e4630', density: 0.18 },
        { type: 'candles', density: 0.05, cluster: 0.4 },
      ],
      ceiling: [
        { type: 'drips', color: '#b8a080', color2: '#f0dcb8', density: 0.32, len: [4, 22], w: [2, 5], cluster: 0.35 },
      ],
      wall: [
        { type: 'streaks', color: '#000000', alpha: 0.4, density: 0.2, len: 70 },
      ],
      spikes: { type: 'iron' },
      platform: { type: 'wood' },
      glaze: { color: '#8a6a46', deep: '#2a1f15', sheen: '#ffe6c0' },
    },
    liquids: { water: { top: '#6a7a6c', deep: '#101614', alphaTop: 0.45 } },
    decor: [
      { kind: 'sconce_dead', where: 'floor', chance: 0.07, gap: 5, opts: (rng) => ({ lit: rng.chance(0.3) }) },
      { kind: 'candle_cluster', where: 'floor', chance: 0.04, gap: 7, opts: (rng) => ({ lit: rng.chance(0.7) }) },
      { kind: 'statue_waxen', where: 'floor', chance: 0.02, gap: 20, width: 2, height: 5, dim: 0.5, opts: (rng) => ({ variant: rng.int(0, 2) }) },
      { kind: 'column_broken', where: 'floor', chance: 0.02, gap: 14, height: 3, dim: 0.4, opts: (rng) => ({ h: rng.range(60, 110) }) },
      { kind: ['rubble', 'bones'], where: 'floor', chance: 0.035, gap: 6 },
      { kind: 'mushroom_glow', where: 'floor', chance: 0.02, gap: 9, opts: { color: '#eaa84a' } },
      { kind: 'chain', where: 'ceiling', chance: 0.035, gap: 6, fitLen: [50, 0.55], opts: (rng) => ({ hook: rng.chance(0.4) }) },
      { kind: 'lantern_hanging', where: 'ceiling', chance: 0.012, gap: 14, fitLen: [24, 0.3], opts: (rng) => ({ lit: rng.chance(0.6) }) },
      { kind: 'cage_hanging', where: 'ceiling', chance: 0.01, gap: 12, fitLen: [24, 0.35] },
      { kind: 'banner', where: 'ceiling', chance: 0.012, gap: 12, height: 4, dim: 0.25, opts: (rng) => ({ torn: true, len: rng.range(90, 130) }) },
      { kind: 'web', where: 'ceiling', chance: 0.05, gap: 8, test: (tile, c, r) => tile(c - 1, r) === 1 || tile(c + 1, r) === 1 },
      { kind: 'drip', where: 'ceiling', chance: 0.03, gap: 6, opts: (rng, c, r, tile) => { let k = 0; while (k < 20 && tile(c, r + k + 1) === 0) k++; return { fall: (k + 1) * 40 - 12, color: '#d8c4a0' }; } },
      { kind: 'grass_clump', where: 'floor', chance: 0.06, gap: 2, layer: 'front', opts: { color: '#2c2016', h: 16 } },
    ],
    weather: [{ kind: 'motes', count: 70, color: '#f0d098' }],
    fog: { alpha: 0.16, color: '#6a5034' },
    vignette: 0.6,
    grade: { top: '#000000', topA: 0.12, bottom: '#3a2210', bottomA: 0.1 },
    fg: { kinds: ['pillar', 'chain', 'rock'], density: 1 },
    bg: { recipe },
  });
})();
