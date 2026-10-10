// src/art/regions/mothwood.js — The Mothwood: a very dark indigo forest of tall wick-reeds, glowing
// cocoons on silk threads, draped webs catching faint lavender light, and drifting wing-scales.
(function () {
  'use strict';
  const G = globalThis.G;
  const Art = G.Art;
  const U = Art.util, K = Art.BG.kit;
  const { mix, rgba } = U;
  const TAU = Math.PI * 2;

  const pal = {
    skyTop: '#07050c', skyBottom: '#251b3a', far: '#30264a', mid: '#221a36', near: '#140f22',
    fill: '#100c18', fillDeep: '#050308', edge: '#5c4c7e', highlight: '#d6caee', accent: '#b890ff',
    light: '#c8a8ff', fog: '#3a2c56', particle: '#dacaf2', mapColor: '#7b6ab4', darkness: '#040209',
    water: '#5a4a7a', waterDeep: '#0c0816',
  };
  const GLOW = '#b48cff', PALE = '#e8d8ff';

  // A colossal moth resting with spread wings (eye-spots faintly lit) — the Wing-Warden's motif.
  function moth(ctx, x, y, s, c, li) {
    ctx.fillStyle = c;
    for (const d of [-1, 1]) {
      ctx.beginPath(); ctx.moveTo(x, y - 10 * s);
      ctx.bezierCurveTo(x + d * 60 * s, y - 120 * s, x + d * 230 * s, y - 110 * s, x + d * 250 * s, y - 40 * s);
      ctx.bezierCurveTo(x + d * 240 * s, y + 10 * s, x + d * 120 * s, y + 20 * s, x, y + 10 * s); ctx.closePath(); ctx.fill();
      ctx.beginPath(); ctx.moveTo(x, y + 4 * s);
      ctx.bezierCurveTo(x + d * 90 * s, y + 20 * s, x + d * 170 * s, y + 70 * s, x + d * 120 * s, y + 130 * s);
      ctx.bezierCurveTo(x + d * 70 * s, y + 150 * s, x + d * 30 * s, y + 80 * s, x, y + 40 * s); ctx.closePath(); ctx.fill();
    }
    ctx.beginPath(); ctx.ellipse(x, y + 20 * s, 14 * s, 70 * s, 0, 0, TAU); ctx.fill();
    ctx.lineWidth = 3 * s; ctx.strokeStyle = c; ctx.lineCap = 'round';
    for (const d of [-1, 1]) { ctx.beginPath(); ctx.moveTo(x, y - 46 * s); ctx.quadraticCurveTo(x + d * 30 * s, y - 110 * s, x + d * 70 * s, y - 120 * s); ctx.stroke(); }
    // eye-spots
    for (const d of [-1, 1]) {
      const ex = x + d * 150 * s, ey = y - 50 * s;
      ctx.fillStyle = mix(c, GLOW, 0.35); ctx.beginPath(); ctx.arc(ex, ey, 26 * s, 0, TAU); ctx.fill();
      ctx.fillStyle = c; ctx.beginPath(); ctx.arc(ex, ey, 15 * s, 0, TAU); ctx.fill();
      ctx.fillStyle = mix(c, PALE, 0.5); ctx.beginPath(); ctx.arc(ex - 4 * s, ey - 4 * s, 4 * s, 0, TAU); ctx.fill();
      if (li) li.addGlow(ex, ey, 70 * s, GLOW, 0.12, 0.25);
    }
  }
  function reeds(ctx, w, yb, o) {
    const rng = o.rng;
    for (let x = rng.range(0, o.gap); x < w; x += rng.range(o.gap * 0.4, o.gap * 1.3)) {
      const rh = rng.range(o.min, o.max), lean = rng.range(-o.lean, o.lean), wd = rng.range(o.w * 0.7, o.w * 1.3);
      const ember = o.ember && rng.chance(o.ember) ? (rng.chance(0.75) ? GLOW : '#ffb070') : null;
      K.wrap(w, x, 40, (xx) => K.reed(ctx, xx, yb + 4, rh, { color: o.color, width: wd, lean, leaves: o.leaves ? rng.int(1, o.leaves) : 0, ember, addGlow: ember && o.li ? (gx, gy, r, col) => o.li.addGlow(gx, gy, r * 1.6, col, o.glowA || 0.4, 0.4) : null }));
    }
  }
  function silk(ctx, w, h, o) {
    const rng = o.rng;
    ctx.strokeStyle = o.color; ctx.lineWidth = o.width || 1;
    for (let i = 0; i < o.n; i++) { // sagging threads between random anchor points near the top
      const x0 = rng.range(0, w), x1 = x0 + rng.range(80, 300), y0 = rng.range(0, h * o.top), y1 = rng.range(0, h * o.top);
      ctx.beginPath(); ctx.moveTo(x0, y0); ctx.quadraticCurveTo((x0 + x1) / 2, Math.max(y0, y1) + rng.range(30, 120), x1, y1); ctx.stroke();
    }
    for (let i = 0; i < o.n * 0.6; i++) { const x = rng.range(0, w); ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x + rng.range(-10, 10), rng.range(h * 0.1, h * o.drop)); ctx.stroke(); }
  }

  function recipe(th, info) {
    const kind = th.bg || 'open';
    if (kind === 'none') return Art.BG.genericRecipe(th, info);
    const shaft = kind === 'shaft';
    const c0 = '#2c2244', c1 = '#211a36', c2 = '#161126', c3 = '#0a0712';
    const layers = [];
    // backdrop: endless reed forest in violet haze, a giant moth resting high on the stalks
    layers.push({ f: 0.04, lowres: 0.45, haze: 0.38, hazeColor: '#3e3060', fog: { alpha: 0.55, h: 0.5, color: '#4a3a70', top: 0.3, topH: 0.3 },
      draw(ctx, w, h, rng, li) {
        reeds(ctx, w, h, { rng, gap: 34, min: h * 0.5, max: h * 1.05, lean: 30, w: 4, color: c0, ember: 0.12, li, glowA: 0.25 });
        // theme.landmark:false (like shore/lastlight) — no giant resting moth on the stalks
        if (!shaft && !(info.theme && info.theme.landmark === false)) moth(ctx, w * rng.range(0.3, 0.7), h * rng.range(0.28, 0.4), rng.range(0.7, 1), c0, li);
        silk(ctx, w, h, { rng, color: rgba('#c8b8f0', 0.12), n: 30, top: 0.3, drop: 0.5 });
      } });
    // L1: mid reeds with violet ember tips and glowing cocoons hung on long threads
    layers.push({ f: 0.15, lowres: 0.6, haze: 0.14, hazeColor: '#3a2c5a', fog: { alpha: 0.5, h: 0.45, color: '#463670' },
      shade: { top: 'rgba(200,180,255,0.05)', bottom: 'rgba(0,0,0,0.12)' },
      draw(ctx, w, h, rng, li) {
        reeds(ctx, w, h, { rng, gap: 70, min: h * 0.45, max: h * 0.95, lean: 40, w: 6, color: c1, ember: 0.3, leaves: 2, li, glowA: 0.35 });
        for (let x = rng.range(40, 200); x < w; x += rng.range(140, 300)) {
          const y = rng.range(h * 0.08, h * 0.4), clen = rng.range(70, 120), lit = rng.chance(0.55);
          K.wrap(w, x, 30, (xx) => {
            ctx.strokeStyle = rgba('#c8b8f0', 0.22); ctx.lineWidth = 1; ctx.beginPath(); ctx.moveTo(xx, 0); ctx.lineTo(xx, y); ctx.stroke();
            K.cocoon(ctx, xx, y, clen, { color: c1, silk: rgba('#c8b8f0', 0.25), wraps: rgba('#000000', 0.3) });
            if (lit) { // a faint pulse showing through the silk
              const cy = y + clen * 0.67;
              ctx.fillStyle = rgba(GLOW, 0.45); ctx.beginPath(); ctx.ellipse(xx, cy, clen * 0.06, clen * 0.16, 0, 0, TAU); ctx.fill();
              li.addGlow(xx, cy, clen * 0.7, GLOW, 0.3, 0.5);
            }
          });
        }
        silk(ctx, w, h, { rng, color: rgba('#d8c8ff', 0.16), n: 22, top: 0.35, drop: 0.6 });
      } });
    // L2: near thick reeds with leaves, draped silk, lavender rim
    layers.push({ f: 0.32, haze: 0.04, hazeColor: '#241a3c', fog: { alpha: 0.4, h: 0.32, color: '#3a2c5a' }, bands: [[0, 1]],
      rim: { color: '#c8b0ff', alpha: 0.32, width: 2 },
      draw(ctx, w, h, rng, li) {
        reeds(ctx, w, h, { rng, gap: 150, min: h * 0.4, max: h * 0.95, lean: 50, w: 8, color: c2, ember: 0.25, leaves: 1, li, glowA: 0.5 });
        silk(ctx, w, h, { rng, color: rgba('#e0d4ff', 0.2), n: 14, top: 0.45, drop: 0.5, width: 1.2 });
        ctx.fillStyle = c2; ctx.fillRect(0, h * 0.99, w, h * 0.02);
      } });
    // L3: near darkness — fat reed stems and hanging silk
    layers.push({ f: 0.58, fog: { alpha: 0.14, h: 0.12, color: '#2a1e44' }, bands: [[0, 0.2], [0.68, 1]],
      draw(ctx, w, h, rng) {
        K.ridge(ctx, w, h, { base: h * 1.01, amp: 26, scale: 150, color: c3, seed: rng.int(1, 1e6) });
        for (let x = rng.range(0, 160); x < w; x += rng.range(90, 220)) for (let k = 0; k < 3; k++) K.frond(ctx, x + rng.range(-20, 20), h + 4, rng.range(40, 100), rng.range(-0.8, 0.8), { color: c3, width: 0.08, curl: rng.range(-0.4, 0.4) });
        ctx.fillStyle = c3; ctx.fillRect(0, 0, w, 14);
        silk(ctx, w, h, { rng, color: rgba('#100c1c', 0.9), n: 10, top: 0.1, drop: 0.2, width: 2 });
      } });
    return {
      sky: { top: '#040309', bottom: '#221836', gy: 0.5, gr: 0.75, glowColor: '#6a4aa8', glowA: 0.24 },
      layers,
      shafts: [{ x: 700, f: 0.18, w0: 40, w1: 200, slant: -80, color: '#c8b0ff', alpha: 0.07, after: 0, speed: 0.2 }],
    };
  }

  Art.defineRegion({
    id: 'mothwood', name: 'The Mothwood',
    palette: pal,
    materials: { wood: '#3a2e4a', woodDark: '#1c1626', woodLight: '#6a5a84', leaf: '#3a3058', leafLight: '#8a7ab8', silk: '#e0d6f4',
      stone: '#3e3456', stoneDark: '#1e182c', stoneLight: '#6e6290', wax: '#dcd2e8', waxShade: '#8a7ea0', glowCap: '#c8a0ff', crystal: '#c8a8ff' },
    theme: { bg: 'open' },
    terrain: {
      texture: { type: 'fibers' },
      texStrength: 0.75,
      ramp: [[0, '#6e5e92'], [3, '#40345e'], [9, '#211a32'], [18, 'fill']],
      rimWidth: 8, rim: 1.0, rimSide: 0.24, rimColor: '#e4d8ff',
      floor: [
        { type: 'grass', color: '#3a3058', color2: '#c8b8ec', density: 0.45, h: [5, 16], cluster: 0.45, lean: 6, wind: 1.5, width: 1.2 },
        { type: 'tufts', color: '#241c38', color2: '#b890ff', alpha2: 0.7, density: 0.16, cluster: 0.6, r: [1.4, 3], glow: 0.3, glowColor: GLOW },
        { type: 'pebbles', color: '#0c0914', color2: '#4e4270', density: 0.1 },
      ],
      ceiling: [
        { type: 'roots', color: '#c8bcec', density: 0.26, len: [14, 70], width: 0.9, alpha: 0.45 },
        { type: 'roots', color: '#221a34', density: 0.18, len: [8, 34], width: 2, leaves: 0.4 },
      ],
      wall: [{ type: 'streaks', color: '#000000', alpha: 0.35, density: 0.18, len: 70 }],
      spikes: { type: 'thorns', color: '#2a2042', tip: '#e6dcff' },
      platform: { type: 'branch', top: '#c4b4ec' },
      glaze: { color: '#8c7cb4', deep: '#221a34', sheen: '#f6eeff' },
    },
    liquids: { water: { top: '#6a5a96', deep: '#0a0614', alphaTop: 0.48 } },
    decor: [
      { kind: 'reeds', where: 'floor', chance: 0.05, gap: 4, height: 3, opts: (rng) => ({ ember: rng.chance(0.35) }) },
      { kind: 'mushroom_glow', where: 'floor', chance: 0.035, gap: 6, opts: { color: '#c8a0ff' } },
      { kind: ['wick_grave', 'bones', 'stalagmite'], where: 'floor', chance: 0.02, gap: 9, height: 2 },
      { kind: 'crystal', where: 'floor', chance: 0.006, gap: 18, height: 2, opts: { color: '#b898ff' } },
      { kind: 'cocoon', where: 'ceiling', chance: 0.03, gap: 6, height: 2, fitLen: [20, 0.35] },
      { kind: 'web', where: 'ceiling', chance: 0.05, gap: 7, test: (tile, c, r) => tile(c - 1, r) === 1 || tile(c + 1, r) === 1 },
      { kind: 'vine_curtain', where: 'ceiling', chance: 0.02, gap: 10, height: 2, fitLen: [50, 0.4], opts: { silk: true } },
      { kind: 'lantern_hanging', where: 'ceiling', chance: 0.006, gap: 18, fitLen: [24, 0.3], opts: { lit: true, flame: 'violet' } },
      { kind: 'grass_clump', where: 'floor', chance: 0.08, gap: 2, layer: 'front', opts: { color: '#0c0916', h: 22 } },
    ],
    weather: [{ kind: 'silk', count: 70, color: '#d8c8f4' }, { kind: 'motes', count: 30, color: '#b890ff' }],
    fog: { alpha: 0.18, color: '#3e2e5e' },
    vignette: 0.66,
    grade: { top: '#05020c', topA: 0.16, bottom: '#6a4aa8', bottomA: 0.06 },
    fg: { kinds: ['reeds', 'silk', 'grass'], density: 1 },
    bg: { recipe },
  });
})();
