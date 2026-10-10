// src/art/regions/nave.js — The Drowned Nave: a sunken cathedral-city in deep blue and teal, gothic
// arcades and spires, pale-gold stained glass glowing through the gloom, constant rain, still pools.
(function () {
  'use strict';
  const G = globalThis.G;
  const Art = G.Art;
  const U = Art.util, K = Art.BG.kit;
  const { mix, rgba } = U;
  const TAU = Math.PI * 2;

  const pal = {
    skyTop: '#05090e', skyBottom: '#1a3440', far: '#2a4450', mid: '#1c303a', near: '#101c23',
    fill: '#0e161b', fillDeep: '#040709', edge: '#4c6c76', highlight: '#cadcd8', accent: '#ecc878',
    light: '#f2d890', fog: '#2c4a54', particle: '#a8c8d4', mapColor: '#4f8fa3', darkness: '#02070a',
    water: '#4a8a94', waterDeep: '#08161a',
  };
  const GLASS = '#e8c870', GLASS_CORE = '#fff4cc';

  /** Pointed (gothic) window or arch opening. Fills with `fill`; tracery in `frame` when given. */
  function lancet(ctx, x, yb, w, h, fill, frame) {
    const r = w * 0.85, spring = yb - h + w * 0.95;
    ctx.fillStyle = fill;
    ctx.beginPath();
    ctx.moveTo(x - w / 2, yb); ctx.lineTo(x - w / 2, spring);
    ctx.arc(x - w / 2 + r, spring, r, Math.PI, Math.PI + Math.acos((r - w / 2) / r) * 1, false);
    ctx.arc(x + w / 2 - r, spring, r, -Math.acos((r - w / 2) / r), 0, false);
    ctx.lineTo(x + w / 2, yb); ctx.closePath(); ctx.fill();
    if (frame) {
      ctx.fillStyle = frame;
      ctx.fillRect(x - Math.max(1, w * 0.04), spring - w * 0.5, Math.max(2, w * 0.08), yb - spring + w * 0.5);
      for (let y = spring + (yb - spring) * 0.33; y < yb - 2; y += (yb - spring) * 0.33) ctx.fillRect(x - w / 2, y, w, Math.max(1.5, w * 0.05));
      ctx.beginPath(); ctx.arc(x, spring - w * 0.18, w * 0.17, 0, TAU); ctx.lineWidth = Math.max(1.5, w * 0.05); ctx.strokeStyle = frame; ctx.stroke();
    }
  }
  function glowWindow(ctx, x, yb, w, h, c, li, a) {
    const g = ctx.createLinearGradient(0, yb - h, 0, yb);
    g.addColorStop(0, GLASS_CORE); g.addColorStop(0.5, GLASS); g.addColorStop(1, mix(GLASS, '#3a6a70', 0.6));
    lancet(ctx, x, yb, w, h, g, c);
    if (li) li.addGlow(x, yb - h * 0.55, Math.max(w, h * 0.5) * 1.3, GLASS, a, 0.15);
  }
  // Cathedral front: a tall gabled mass with twin spires, a glowing rose and lancets.
  function cathedral(ctx, x, yb, s, c, li, a) {
    ctx.fillStyle = c;
    ctx.fillRect(x - 120 * s, yb - 300 * s, 240 * s, 300 * s);
    ctx.beginPath(); ctx.moveTo(x - 130 * s, yb - 300 * s); ctx.lineTo(x, yb - 420 * s); ctx.lineTo(x + 130 * s, yb - 300 * s); ctx.closePath(); ctx.fill();
    for (const sx of [-1, 1]) K.spire(ctx, x + sx * 150 * s, yb, 64 * s, 640 * s, { color: c, window: null });
    for (const sx of [-1, 1]) K.spire(ctx, x + sx * 210 * s, yb, 34 * s, 330 * s, { color: c });
    K.roseWindow(ctx, x, yb - 300 * s, 54 * s, { frame: c, glass: GLASS, core: GLASS_CORE, edge: mix(GLASS, '#2a4a50', 0.6), petals: 12 });
    if (li) li.addGlow(x, yb - 300 * s, 160 * s, GLASS, a, 0.12);
    for (const sx of [-1, 1]) glowWindow(ctx, x + sx * 150 * s, yb - 200 * s, 22 * s, 120 * s, c, li, a * 0.6);
    glowWindow(ctx, x, yb - 40 * s, 60 * s, 170 * s, c, null);
  }
  // A long wall pierced by an arcade of pointed arches (openings show what is behind).
  function arcadeWall(ctx, x0, x1, yb, o) {
    const span = o.span, pier = o.pier, ah = o.archH, wallH = o.h;
    ctx.save();
    ctx.fillStyle = o.color; ctx.fillRect(x0, yb - wallH, x1 - x0, wallH);
    ctx.globalCompositeOperation = 'destination-out';
    for (let x = x0 + pier + span / 2; x + span / 2 <= x1; x += span + pier) lancet(ctx, x, yb, span, ah, '#000');
    ctx.restore();
    if (o.cornice) { ctx.fillStyle = o.color; ctx.fillRect(x0 - 6, yb - wallH - 8, x1 - x0 + 12, 10); }
  }

  function recipe(th, info) {
    const kind = th.bg || 'open';
    if (kind === 'none') return Art.BG.genericRecipe(th, info);
    const shaft = kind === 'shaft', interior = kind === 'interior';
    const c0 = '#25404a', c1 = '#1a2f38', c2 = '#122229', c3 = '#070f13';
    const layers = [];
    // backdrop: the drowned cathedral rising through rain haze
    layers.push({ f: 0.04, lowres: 0.45, haze: 0.38, hazeColor: '#2e5058', fog: { alpha: 0.55, h: 0.45, color: '#3a5e64', top: 0.25, topH: 0.25 },
      draw(ctx, w, h, rng, li) {
        if (interior || shaft) {
          ctx.fillStyle = c0; ctx.fillRect(0, 0, w, h);
          for (let x = rng.range(40, 120); x < w; x += rng.range(130, 190)) glowWindow(ctx, x, h * rng.range(0.55, 0.75), rng.range(30, 46), h * rng.range(0.3, 0.42), mix(c0, '#000000', 0.2), li, 0.25);
          if (!shaft) K.roseWindow(ctx, w * rng.range(0.3, 0.7), h * 0.24, 70, { frame: c0, glass: GLASS, core: GLASS_CORE, petals: 16 });
          return;
        }
        K.ridge(ctx, w, h, { base: h * 0.92, amp: 30, scale: 300, color: c0, seed: rng.int(1, 1e6) });
        for (let x = rng.range(0, 200); x < w; x += rng.range(110, 220)) K.wrap(w, x, 40, (xx) => K.spire(ctx, xx, h * 0.95, rng.range(22, 44), rng.range(h * 0.3, h * 0.62), { color: c0, window: rng.chance(0.4) ? mix(GLASS, c0, 0.5) : null }));
        cathedral(ctx, w * rng.range(0.35, 0.65), h * 0.95, rng.range(0.7, 0.85), c0, li, 0.35);
      } });
    // L1: the great arcade — pointed arches on clustered columns, lancet windows beyond
    layers.push({ f: 0.15, lowres: 0.6, haze: 0.16, hazeColor: '#2a4a54', fog: { alpha: 0.5, h: 0.42, color: '#36585e' }, bands: [[0.05, 1]],
      shade: { top: 'rgba(240,220,160,0.05)', bottom: 'rgba(0,0,0,0.12)' },
      draw(ctx, w, h, rng, li) {
        const yb = h * 0.97;
        if (shaft) {
          for (let x = rng.range(40, 200); x < w; x += rng.range(240, 420)) {
            const cw = rng.range(40, 64);
            K.wrap(w, x, cw, (xx) => { ctx.fillStyle = c1; ctx.fillRect(xx - cw / 2, 0, cw, h); ctx.fillStyle = rgba('#000000', 0.2); for (let k = 1; k < 4; k++) ctx.fillRect(xx - cw / 2 + (cw * k) / 4, 0, 2, h); });
            const by = rng.range(h * 0.2, h * 0.7);
            ctx.strokeStyle = c1; ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(x + cw, 0); ctx.lineTo(x + cw, h); ctx.stroke(); void by;
          }
          return;
        }
        arcadeWall(ctx, -20, w + 20, yb, { span: 120, pier: 46, archH: h * 0.55, h: h * 0.82, color: c1, cornice: true });
        // windows glimpsed through the arches (drawn behind via destination-over)
        ctx.save(); ctx.globalCompositeOperation = 'destination-over';
        for (let x = 20 + 46 + 60; x < w; x += 166) if (rng.chance(0.5)) glowWindow(ctx, x, yb - h * 0.12, 26, h * 0.3, mix(c1, '#000000', 0.1), li, 0.25);
        ctx.restore();
        // clerestory: small lancets above the arcade
        for (let x = 20 + 46 + 60; x < w; x += 166) if (rng.chance(0.6)) glowWindow(ctx, x, yb - h * 0.62, 18, h * 0.12, c1, li, 0.18);
      } });
    // L2: near columns with capitals, a hanging bell, rim-lit in pale gold
    layers.push({ f: 0.32, haze: 0.04, hazeColor: '#1e3640', fog: { alpha: 0.42, h: 0.3, color: '#2c4c54' }, bands: [[0, 1]],
      rim: { color: '#e8d8a0', alpha: 0.3, width: 2 },
      draw(ctx, w, h, rng) {
        const yb = h * 0.99;
        ctx.fillStyle = c2; ctx.fillRect(0, yb, w, h - yb);
        for (let x = rng.range(60, 200); x < w; x += rng.range(300, 520)) {
          const cw = rng.range(36, 54), broken = !shaft && rng.chance(0.35);
          K.wrap(w, x, cw * 1.6, (xx) => {
            K.pillar(ctx, xx, yb, cw, broken ? h * rng.range(0.4, 0.7) : h * 1.05, { color: c2, flutes: true, broken: broken ? rng.range(0.1, 0.3) : 0 });
            if (!broken) { ctx.fillStyle = c2; ctx.fillRect(xx - cw * 0.8, h * 0.14, cw * 1.6, 12); ctx.fillRect(xx - cw * 0.65, h * 0.14 + 12, cw * 1.3, 8); }
          });
        }
        if (!shaft) for (let x = rng.range(200, 600); x < w; x += rng.range(700, 1200)) { // a drowned bell on a long chain
          const cy = h * rng.range(0.28, 0.4);
          K.chain(ctx, x, 0, cy, { color: c2, link: 16, width: 3 });
          ctx.fillStyle = c2; ctx.beginPath(); ctx.moveTo(x - 14, cy); ctx.quadraticCurveTo(x - 20, cy + 40, x - 40, cy + 64); ctx.lineTo(x + 40, cy + 64); ctx.quadraticCurveTo(x + 20, cy + 40, x + 14, cy); ctx.closePath(); ctx.fill();
          ctx.fillRect(x - 44, cy + 60, 88, 6);
        }
      } });
    // L3: near darkness — fallen masonry, a pew-back, dripping vault ribs
    layers.push({ f: 0.58, fog: { alpha: 0.16, h: 0.14, color: '#22404a' }, bands: [[0, 0.22], [0.7, 1]],
      draw(ctx, w, h, rng) {
        K.ridge(ctx, w, h, { base: h * 1.01, amp: 30, scale: 140, color: c3, seed: rng.int(1, 1e6) });
        for (let x = rng.range(60, 400); x < w; x += rng.range(400, 800)) { ctx.fillStyle = c3; ctx.fillRect(x, h - 70, rng.range(50, 90), 70); }
        ctx.fillStyle = c3; ctx.fillRect(0, 0, w, 16);
        for (let x = rng.range(0, 100); x < w; x += rng.range(180, 320)) { // vault ribs
          ctx.strokeStyle = c3; ctx.lineWidth = 10; ctx.beginPath(); ctx.moveTo(x - 90, 0); ctx.quadraticCurveTo(x, 70, x + 90, 0); ctx.stroke();
        }
        K.stalactites(ctx, w, 14, { color: c3, rng, minL: 6, maxL: 40, minW: 8, maxW: 22, band: 2 });
      } });
    return {
      sky: { top: '#03070a', bottom: '#1a3440', gy: 0.4, gr: 0.7, glowColor: '#8a9a7a', glowA: 0.2 },
      layers,
      shafts: [
        { x: 380, f: 0.18, w0: 50, w1: 260, slant: 220, color: '#f4e2a8', alpha: 0.12, after: 0, speed: 0.22 },
        { x: 1250, f: 0.2, w0: 40, w1: 210, slant: 180, color: '#f4e2a8', alpha: 0.1, after: 1, speed: 0.3, phase: 2.2 },
        { x: 2000, f: 0.18, w0: 60, w1: 280, slant: 240, color: '#e8e4c0', alpha: 0.09, after: 0, speed: 0.26, phase: 4 },
      ],
    };
  }

  Art.defineRegion({
    id: 'nave', name: 'The Drowned Nave',
    palette: pal,
    materials: { stone: '#3e5a62', stoneDark: '#1c2c32', stoneLight: '#7a9aa0', wood: '#3a3430', woodDark: '#1c1814', woodLight: '#6a6054',
      cloth: '#2a4a5a', clothDark: '#142430', glass: GLASS, gold: '#c8a858', goldLight: '#f0dca0', wax: '#d8dccc', waxShade: '#8a9a96', glowCap: '#9ae0d0' },
    theme: { bg: 'open' },
    terrain: {
      texture: { type: 'blocks', h: 40 },
      texStrength: 0.75,
      ramp: [[0, '#6a8c92'], [3, '#3a565e'], [9, '#1c2e34'], [18, 'fill']],
      rimWidth: 8, rim: 0.95, rimSide: 0.22, rimColor: '#d8ecea',
      floor: [
        { type: 'tufts', color: '#1e3a36', color2: '#6aa898', density: 0.35, cluster: 0.55, r: [1.6, 4] },
        { type: 'pebbles', color: '#0c171b', color2: '#4a6a72', density: 0.12 },
        { type: 'candles', density: 0.035, cluster: 0.5 },
      ],
      ceiling: [
        { type: 'drips', color: '#4a7a84', color2: '#d8f4f4', density: 0.26, len: [4, 18], w: [1.6, 3.2], pointy: true, shine: 0.7 },
        { type: 'roots', color: '#1c3430', density: 0.1, len: [10, 40], width: 1.3, leaves: 0.4 },
      ],
      wall: [{ type: 'streaks', color: '#02080a', alpha: 0.45, density: 0.28, len: 110 }],
      spikes: { type: 'iron', tip: '#e8f4f0' },
      platform: { type: 'stone' },
      glaze: { color: '#7aa8b0', deep: '#18303a', sheen: '#eafffa' },
    },
    liquids: { water: { top: '#5aa0a8', deep: '#061418', alphaTop: 0.46 } },
    decor: [
      { kind: 'stained_window', where: 'floor', chance: 0.012, gap: 14, width: 2, height: 5, dim: 0.35 },
      { kind: 'pew', where: 'floor', chance: 0.015, gap: 8, width: 3, height: 2, dim: 0.5 },
      { kind: 'candelabra', where: 'floor', chance: 0.015, gap: 10, height: 3, opts: (rng) => ({ lit: rng.chance(0.55) }) },
      { kind: 'statue_waxen', where: 'floor', chance: 0.01, gap: 20, width: 2, height: 5, dim: 0.45, opts: (rng) => ({ variant: rng.chance(0.6) ? 1 : 0 }) },
      { kind: 'column_broken', where: 'floor', chance: 0.015, gap: 12, height: 3, dim: 0.35, opts: (rng) => ({ h: rng.range(60, 120) }) },
      { kind: ['rubble', 'candle_cluster'], where: 'floor', chance: 0.03, gap: 7, opts: (rng) => ({ lit: rng.chance(0.4) }) },
      { kind: 'bell_small', where: 'ceiling', chance: 0.012, gap: 10, fitLen: [16, 0.3] },
      { kind: 'bell_great', where: 'ceiling', chance: 0.004, gap: 30, width: 3, height: 5, dim: 0.3, fitLen: [30, 0.3] },
      { kind: 'banner', where: 'ceiling', chance: 0.012, gap: 12, height: 4, dim: 0.25, opts: (rng) => ({ torn: rng.chance(0.6), len: rng.range(90, 140) }) },
      { kind: 'chain', where: 'ceiling', chance: 0.02, gap: 8, fitLen: [50, 0.5] },
      { kind: 'drip', where: 'ceiling', chance: 0.05, gap: 5, opts: (rng, c, r, tile) => { let k = 0; while (k < 20 && tile(c, r + k + 1) === 0) k++; return { fall: (k + 1) * 40 - 12, color: '#a8d4dc' }; } },
      { kind: 'grass_clump', where: 'floor', chance: 0.06, gap: 2, layer: 'front', opts: { color: '#0e2024', h: 16 } },
    ],
    weather: [{ kind: 'rain', count: 160, color: '#a8ccd8' }, { kind: 'motes', count: 22, color: '#f0dca0' }],
    fog: { alpha: 0.2, color: '#2e5058' },
    vignette: 0.6,
    grade: { top: '#02060a', topA: 0.14, bottom: '#2a5a60', bottomA: 0.08 },
    fg: { kinds: ['pillar', 'chain', 'rock'], density: 0.9 },
    bg: { recipe },
  });
})();
