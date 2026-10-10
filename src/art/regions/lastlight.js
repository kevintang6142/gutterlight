// src/art/regions/lastlight.js — Lastlight, the last lit village: dusk purple-brown sky, huddled
// candle-stub houses with warm windows, chimney smoke, and the Last Brazier burning on its plinth.
(function () {
  'use strict';
  const G = globalThis.G;
  const Art = G.Art;
  const U = Art.util, K = Art.BG.kit;
  const { mix, rgba } = U;
  const TAU = Math.PI * 2;

  const pal = {
    skyTop: '#140d18', skyBottom: '#8a5450', far: '#4c3442', mid: '#33232e', near: '#1d141b',
    fill: '#181116', fillDeep: '#070407', edge: '#76545c', highlight: '#ecc8a8', accent: '#ffb35c',
    light: '#ffb868', fog: '#6e4a54', particle: '#f2caa0', mapColor: '#a8806e', darkness: '#080409',
    water: '#6a6a84', waterDeep: '#16121c',
  };
  const WIN = '#ffb45c', WIN_HOT = '#ffd890';

  // The Last Brazier: a stepped stone plinth crowned by a wide iron bowl and a tall flame.
  function brazier(ctx, x, yb, s, c, li) {
    ctx.fillStyle = c;
    ctx.fillRect(x - 90 * s, yb - 22 * s, 180 * s, 22 * s);
    ctx.fillRect(x - 66 * s, yb - 44 * s, 132 * s, 24 * s);
    ctx.fillRect(x - 30 * s, yb - 150 * s, 60 * s, 110 * s);
    ctx.fillRect(x - 40 * s, yb - 158 * s, 80 * s, 12 * s);
    // bowl
    ctx.beginPath();
    ctx.moveTo(x - 92 * s, yb - 200 * s); ctx.quadraticCurveTo(x - 80 * s, yb - 156 * s, x, yb - 152 * s);
    ctx.quadraticCurveTo(x + 80 * s, yb - 156 * s, x + 92 * s, yb - 200 * s); ctx.closePath(); ctx.fill();
    ctx.fillRect(x - 100 * s, yb - 206 * s, 200 * s, 8 * s);
    // the flame: layered tongues (static silhouette; the glow animates)
    const tongues = [[0, 1, 1], [-0.42, 0.62, 0.8], [0.45, 0.7, 0.75], [-0.2, 0.82, 0.6], [0.22, 0.86, 0.55]];
    const cols = ['#ff8a30', '#ffb050', '#ffd27a', '#fff0c0'];
    for (let k = 0; k < cols.length; k++) {
      const sc = 1 - k * 0.22;
      ctx.fillStyle = cols[k];
      for (const [dx, hh, ww] of tongues) {
        const fx = x + dx * 70 * s * sc, h = 150 * s * hh * sc, w = 34 * s * ww * sc;
        ctx.beginPath(); ctx.moveTo(fx - w, yb - 204 * s);
        ctx.quadraticCurveTo(fx - w * 0.9, yb - 204 * s - h * 0.55, fx + dx * 10 * s, yb - 204 * s - h);
        ctx.quadraticCurveTo(fx + w * 0.9, yb - 204 * s - h * 0.55, fx + w, yb - 204 * s); ctx.closePath(); ctx.fill();
      }
    }
    if (li) {
      li.addGlow(x, yb - 250 * s, 340 * s, '#ff9840', 0.55, 0.25);
      li.addGlow(x, yb - 240 * s, 140 * s, '#ffd890', 0.6, 0.3);
    }
  }
  // Candle-stub house with roof, chimney and warm windows (a few are dark: the town is dimming).
  function home(ctx, x, yb, hw, hh, c, rng, li, glowA) {
    const lit = rng.chance(0.78);
    const wins = [];
    const n = rng.int(1, hh > hw * 1.3 ? 3 : 2);
    for (let i = 0; i < n; i++) wins.push([rng.range(-0.22, 0.22), 0.3 + i * 0.22 + rng.range(-0.04, 0.04)]);
    K.house(ctx, x, yb, hw, hh, {
      color: c, rng, roof: rng.chance(0.75), roofLean: rng.range(-10, 10) * hw / 60, chimney: rng.chance(0.55),
      window: lit ? (rng.chance(0.3) ? WIN_HOT : WIN) : mix(c, '#000000', 0.4), windows: wins,
      addGlow: lit && li ? (gx, gy, r, col) => li.addGlow(gx, gy, r * 1.4, col, glowA, 0.35) : null,
      door: rng.chance(0.5) ? mix(c, '#000000', 0.5) : null,
    });
  }
  function lampPost(ctx, x, yb, h, c, li) {
    ctx.fillStyle = c;
    ctx.fillRect(x - 1.5, yb - h, 3, h);
    ctx.fillRect(x - 6, yb - 4, 12, 4);
    ctx.fillRect(x - 1, yb - h, 12, 2);
    ctx.fillRect(x + 7, yb - h + 2, 8, 10);
    ctx.fillStyle = WIN; ctx.fillRect(x + 8.5, yb - h + 4, 5, 6);
    if (li) li.addGlow(x + 11, yb - h + 7, 34, WIN, 0.5, 0.4);
  }
  function hills(ctx, w, h, base, amp, scale, color, seed) { K.ridge(ctx, w, h, { base, amp, scale, color, seed, oct: 3 }); }

  function skyRecipe(info) {
    const layers = [];
    // backdrop: distant ash hills and the upper town on a far rise (tiny windows)
    layers.push({ f: 0.04, lowres: 0.5, haze: 0.32, hazeColor: '#7a5058', fog: { alpha: 0.45, h: 0.3, color: '#a06a60' },
      draw(ctx, w, h, rng, li) {
        hills(ctx, w, h, h * 0.8, 50, 460, '#5a3c48', rng.int(1, 1e6));
        const o = { base: h * 0.84, amp: 28, scale: 300, color: '#4c3240', seed: rng.int(1, 1e6), oct: 3 };
        for (let x = rng.range(w * 0.05, w * 0.2); x < w * 0.9; x += rng.range(26, 60)) {
          const hw = rng.range(14, 26), hh = hw * rng.range(1, 2.2);
          home(ctx, x, K.ridgeY(w, x, o) + 6, hw, hh, '#4c3240', rng, li, 0.18);
        }
        hills(ctx, w, h, o.base, o.amp, o.scale, o.color, o.seed);
      } });
    // L1: the Last Brazier on its hill, the old belltower and a cluster of houses around it
    layers.push({ f: 0.12, lowres: 0.7, haze: 0.12, hazeColor: '#6e4652', fog: { alpha: 0.4, h: 0.32, color: '#8a5a5a' }, bands: [[0.25, 1]],
      rim: { color: '#ffb070', alpha: 0.28, width: 2 },
      draw(ctx, w, h, rng, li) {
        const c = '#3a2834';
        const o = { base: h * 0.86, amp: 34, scale: 340, color: c, seed: rng.int(1, 1e6), oct: 3 };
        const bx = w * rng.range(0.4, 0.6);
        // the brazier stands on a raised mound so it crowns the skyline (theme.landmark:false: rooms that show the
        // real Last Brazier, or stand next to it, leave it out and fill its place with houses)
        const landmark = !(info.theme && info.theme.landmark === false);
        const my = K.ridgeY(w, bx, o) + 10;
        if (landmark) {
          ctx.fillStyle = c; ctx.beginPath(); ctx.ellipse(bx, my + 8, 150, 64, 0, Math.PI, TAU); ctx.fill();
          brazier(ctx, bx, my - 46, 0.44, c, li);
        }
        // belltower: a tall wax spire with an open belfry
        const tx = mod(bx + w * 0.3, w);
        K.wrap(w, tx, 40, (xx) => {
          const yb = K.ridgeY(w, tx, o) + 10;
          ctx.fillStyle = c; ctx.fillRect(xx - 18, yb - 210, 36, 210);
          ctx.beginPath(); ctx.moveTo(xx - 26, yb - 206); ctx.lineTo(xx, yb - 290); ctx.lineTo(xx + 26, yb - 206); ctx.closePath(); ctx.fill();
          ctx.fillStyle = mix(c, '#000000', 0.5); ctx.beginPath(); ctx.moveTo(xx - 10, yb - 150); ctx.lineTo(xx - 10, yb - 182); ctx.arc(xx, yb - 182, 10, Math.PI, 0); ctx.lineTo(xx + 10, yb - 150); ctx.closePath(); ctx.fill();
          ctx.fillStyle = c; ctx.beginPath(); ctx.arc(xx, yb - 166, 7, Math.PI, 0); ctx.lineTo(xx + 8, yb - 158); ctx.lineTo(xx - 8, yb - 158); ctx.closePath(); ctx.fill();
        });
        for (let x = rng.range(0, 60); x < w; x += rng.range(50, 110)) {
          if (landmark && Math.abs(x - bx) < 70) continue;
          const hw = rng.range(26, 44), hh = hw * rng.range(1.1, 2);
          K.wrap(w, x, hw, (xx) => home(ctx, xx, K.ridgeY(w, x, o) + 8, hw, hh, c, rng, li, 0.3));
        }
        hills(ctx, w, h, o.base, o.amp, o.scale, c, o.seed);
      } });
    // L2: the village street — larger houses, lamp posts, a clothesline of little pennants
    layers.push({ f: 0.28, haze: 0.03, fog: { alpha: 0.3, h: 0.26, color: '#7a4e54' }, bands: [[0.35, 1]],
      rim: { color: '#ffc080', alpha: 0.4, width: 2 },
      draw(ctx, w, h, rng, li) {
        const c = '#24181f';
        const o = { base: h * 0.93, amp: 18, scale: 260, color: c, seed: rng.int(1, 1e6), oct: 2 };
        const houses = [];
        for (let x = rng.range(20, 120); x < w; x += rng.range(110, 230)) houses.push([x, rng.range(48, 74)]);
        for (const [x, hw] of houses) {
          const hh = hw * rng.range(1.2, 2.1);
          K.wrap(w, x, hw, (xx) => home(ctx, xx, K.ridgeY(w, x, o) + 6, hw, hh, c, rng, li, 0.45));
        }
        // pennant lines between neighbouring roofs
        for (let i = 0; i + 1 < houses.length; i++) {
          if (!rng.chance(0.5)) continue;
          const [x0, w0] = houses[i], [x1] = houses[i + 1];
          const y0 = K.ridgeY(w, x0, o) - w0 * 1.3, y1 = K.ridgeY(w, x1, o) - w0 * 1.2, sag = 26;
          ctx.strokeStyle = c; ctx.lineWidth = 1.2;
          ctx.beginPath(); ctx.moveTo(x0, y0); ctx.quadraticCurveTo((x0 + x1) / 2, (y0 + y1) / 2 + sag * 2, x1, y1); ctx.stroke();
          for (let k = 1; k < 8; k++) {
            const t = k / 8, px = x0 + (x1 - x0) * t, py = (1 - t) * (1 - t) * y0 + 2 * (1 - t) * t * ((y0 + y1) / 2 + sag * 2) + t * t * y1;
            ctx.fillStyle = k % 3 === 0 ? '#5a2a2a' : c;
            ctx.beginPath(); ctx.moveTo(px - 4, py); ctx.lineTo(px + 4, py); ctx.lineTo(px, py + 9); ctx.closePath(); ctx.fill();
          }
        }
        for (let x = rng.range(60, 160); x < w; x += rng.range(180, 320)) K.wrap(w, x, 20, (xx) => lampPost(ctx, xx, K.ridgeY(w, x, o) + 4, rng.range(64, 84), c, li));
        hills(ctx, w, h, o.base, o.amp, o.scale, c, o.seed);
      } });
    // L3: near dark — fence posts, grass and a cart
    layers.push({ f: 0.55, fog: { alpha: 0.1, h: 0.12 }, bands: [[0.72, 1]],
      draw(ctx, w, h, rng) {
        const c = '#110b10';
        const o = { base: h * 0.99, amp: 16, scale: 200, color: c, seed: rng.int(1, 1e6), oct: 2 };
        hills(ctx, w, h, o.base, o.amp, o.scale, c, o.seed);
        ctx.fillStyle = c; ctx.strokeStyle = c; ctx.lineCap = 'round';
        for (let x = rng.range(0, 200); x < w; x += rng.range(300, 600)) {
          const n = rng.int(4, 9), y = K.ridgeY(w, x, o);
          for (let k = 0; k < n; k++) { const px = x + k * 26, py = K.ridgeY(w, px, o) + 4; ctx.fillRect(px - 2.5, py - 34 - (k % 2) * 4, 5, 38); }
          ctx.lineWidth = 3; ctx.beginPath(); ctx.moveTo(x - 6, y - 22); ctx.lineTo(x + (n - 1) * 26 + 6, K.ridgeY(w, x + (n - 1) * 26, o) - 22); ctx.stroke();
        }
        for (let x = rng.range(0, 60); x < w; x += rng.range(40, 110)) {
          const y = K.ridgeY(w, x, o) + 4;
          ctx.lineWidth = 2;
          for (let k = 0; k < 6; k++) { const dx = rng.range(-10, 10), hh = rng.range(10, 30), l = rng.range(-10, 14); ctx.beginPath(); ctx.moveTo(x + dx, y); ctx.quadraticCurveTo(x + dx + l * 0.2, y - hh * 0.6, x + dx + l, y - hh); ctx.stroke(); }
        }
      } });
    return {
      sky(ctx, w, h, rng) {
        ctx.fillStyle = K.grad(ctx, 0, 0, 0, h, [[0, '#0e0912'], [0.35, '#2a1a2a'], [0.62, '#5a3440'], [0.82, '#94584e'], [1, '#c07a58']]);
        ctx.fillRect(0, 0, w, h);
        K.stars(ctx, w, h * 0.35, 70, '#e8d8e8', rng);
        // long dusk cloud banks lit from below by the brazier
        for (let k = 0; k < 12; k++) {
          const y = rng.range(h * 0.22, h * 0.62), x = rng.range(-120, w), cw = rng.range(260, 620), ch = rng.range(5, 16);
          const g = ctx.createLinearGradient(x, 0, x + cw, 0);
          const a = rng.range(0.08, 0.2).toFixed(3);
          g.addColorStop(0, 'rgba(60,30,44,0)'); g.addColorStop(0.5, 'rgba(70,36,50,' + a + ')'); g.addColorStop(1, 'rgba(60,30,44,0)');
          ctx.fillStyle = g; ctx.fillRect(x, y, cw, ch);
          const g2 = ctx.createLinearGradient(x, 0, x + cw, 0);
          g2.addColorStop(0, 'rgba(255,170,110,0)'); g2.addColorStop(0.5, 'rgba(255,170,110,' + (a * 0.5).toFixed(3) + ')'); g2.addColorStop(1, 'rgba(255,170,110,0)');
          ctx.fillStyle = g2; ctx.fillRect(x, y + ch - 2, cw, 2);
        }
      },
      skyGlows: [{ x: 0.5, y: 0.95, r: 520, color: '#ff8a50', a: 0.16, flicker: 0.06 }],
      layers,
    };
  }
  function mod(a, b) { return ((a % b) + b) % b; }

  // Under the village: cellars, the Well, root-bound earth lit by hanging lanterns.
  function caveRecipe(th, info) {
    const shaft = th.bg === 'shaft', interior = th.bg === 'interior';
    const c0 = '#3a2832', c1 = '#2a1d25', c2 = '#1b1218', c3 = '#0d080b';
    const layers = [
      { f: 0.05, lowres: 0.45, haze: 0.4, hazeColor: '#5a3c46', fog: { alpha: 0.45, h: 0.5, top: 0.4, topH: 0.35, color: '#4a3038' },
        draw(ctx, w, h, rng, li) {
          if (shaft) K.brickWall(ctx, 0, 0, w, h, { color: c0, rng, bw: 58, bh: 26 });
          else K.rockWall(ctx, 0, 0, w, h, { color: c0, rng, blobs: 90 });
          for (let k = 0; k < 4; k++) li.addGlow(rng.range(0, w), rng.range(h * 0.3, h * 0.8), rng.range(60, 120), '#ff9a50', 0.08, 0.3);
        } },
      { f: 0.18, lowres: 0.6, haze: 0.14, hazeColor: '#5a3c46', fog: { alpha: 0.4, h: 0.4, color: '#5a3a42' },
        draw(ctx, w, h, rng, li) {
          if (shaft) { // the well's rope and old ladders
            for (let x = rng.range(80, 300); x < w; x += rng.range(360, 640)) {
              ctx.strokeStyle = c1; ctx.lineWidth = 4; ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x + 6, h); ctx.stroke();
              const lx = x + rng.range(90, 200);
              ctx.fillStyle = c1; ctx.fillRect(lx, 0, 5, h); ctx.fillRect(lx + 36, 0, 5, h);
              for (let y = rng.range(0, 30); y < h; y += 30) ctx.fillRect(lx, y, 41, 4);
            }
            return;
          }
          K.ridge(ctx, w, h, { base: h * 0.92, amp: 50, scale: 220, color: c1, seed: rng.int(1, 1e6) });
          // timber props holding up the cellar roof
          for (let x = rng.range(60, 260); x < w; x += rng.range(260, 460)) {
            ctx.fillStyle = c1; ctx.fillRect(x - 9, h * 0.08, 18, h * 0.86);
            ctx.fillRect(x - 70, h * 0.08, 140, 16);
            ctx.save(); ctx.translate(x, h * 0.08 + 16); ctx.rotate(0.7); ctx.fillRect(0, -4, 60, 8); ctx.restore();
            ctx.save(); ctx.translate(x, h * 0.08 + 16); ctx.rotate(Math.PI - 0.7); ctx.fillRect(0, -4, 60, 8); ctx.restore();
            if (rng.chance(0.6)) { ctx.fillRect(x + 40, h * 0.08 + 16, 2, 30); ctx.fillRect(x + 35, h * 0.08 + 46, 12, 14); li.addGlow(x + 41, h * 0.08 + 53, 40, WIN, 0.35, 0.5); ctx.fillStyle = WIN; ctx.fillRect(x + 38, h * 0.08 + 49, 6, 8); }
          }
          if (!interior) K.stalactites(ctx, w, 0, { color: c1, rng, minL: 16, maxL: 70, band: 8 });
        } },
      { f: 0.5, fog: { alpha: 0.15, h: 0.15 }, bands: [[0, 0.2], [0.65, 1]],
        draw(ctx, w, h, rng) {
          K.ridge(ctx, w, h, { base: h * 1.01, amp: 34, scale: 160, color: c3, seed: rng.int(1, 1e6) });
          ctx.strokeStyle = c2; ctx.lineCap = 'round';
          for (let x = rng.range(0, 80); x < w; x += rng.range(50, 140)) { // roots
            ctx.lineWidth = rng.range(2, 5); const l = rng.range(30, 110), s = rng.range(-20, 20);
            ctx.beginPath(); ctx.moveTo(x, 0); ctx.bezierCurveTo(x + s, l * 0.4, x - s, l * 0.7, x + s * 0.5, l); ctx.stroke();
          }
          K.stalactites(ctx, w, 0, { color: c3, rng, minL: 10, maxL: 60, band: 6 });
        } },
    ];
    return { sky: { top: '#0a060a', bottom: '#2c1c24', gy: 0.6, glowColor: '#8a5040', glowA: 0.25 }, layers };
  }

  function recipe(th, info) {
    const kind = th.bg || 'sky';
    if (kind === 'sky' || kind === 'open') return skyRecipe(info);
    if (kind === 'none') return Art.BG.genericRecipe(th, info);
    return caveRecipe(th, info);
  }

  Art.defineRegion({
    id: 'lastlight', name: 'Lastlight',
    palette: pal,
    materials: { wood: '#5a3c30', woodDark: '#2e1e1a', woodLight: '#8a6448', stone: '#56424a', stoneDark: '#2e2228', stoneLight: '#8a7076',
      cloth: '#6a2e32', clothDark: '#341618', wax: '#e6d2b4', waxShade: '#a88a70' },
    theme: { bg: 'sky' },
    terrain: {
      texture: { type: 'cobble' },
      texStrength: 0.6,
      ramp: [[0, '#8a6460'], [3, '#5a4048'], [9, '#2e2028'], [18, 'fill']],
      rimWidth: 8, rim: 0.95, rimSide: 0.2, rimColor: '#f0c8a0',
      floor: [
        { type: 'grass', color: '#4a3436', color2: '#b88a6a', density: 0.3, h: [4, 11], cluster: 0.5, lean: 8, wind: 2 },
        { type: 'pebbles', color: '#1e1418', color2: '#6a5052', density: 0.14 },
        { type: 'candles', density: 0.06, cluster: 0.45 },
      ],
      ceiling: [
        { type: 'roots', color: '#2a1c1c', density: 0.22, len: [8, 40], width: 1.6 },
        { type: 'drips', color: '#b89a84', color2: '#f0dcc4', density: 0.14, len: [3, 12], w: [2, 4] },
      ],
      wall: [{ type: 'streaks', color: '#000000', alpha: 0.3, density: 0.16, len: 50 }],
      spikes: { type: 'iron', tip: '#ffe0c0' },
      platform: { type: 'wood' },
      glaze: { color: '#b08a74', deep: '#2e2028', sheen: '#fff0e0' },
    },
    liquids: { water: { top: '#7a7090', deep: '#141018', alphaTop: 0.5 } },
    decor: [
      { kind: 'lamp_post', where: 'floor', chance: 0.03, gap: 10, height: 3, opts: (rng) => ({ h: rng.range(100, 130) }) },
      { kind: 'house_stub', where: 'floor', chance: 0.02, gap: 9, width: 3, height: 5, dim: 0.5, opts: (rng) => ({ variant: rng.int(0, 2) }) },
      { kind: 'candle_cluster', where: 'floor', chance: 0.05, gap: 6, opts: (rng) => ({ lit: rng.chance(0.8) }) },
      { kind: ['crate', 'cart', 'signpost'], where: 'floor', chance: 0.02, gap: 10, width: 2, height: 2 },
      { kind: 'rubble', where: 'floor', chance: 0.015, gap: 10 },
      { kind: 'lantern_hanging', where: 'ceiling', chance: 0.03, gap: 9, fitLen: [24, 0.35], opts: { lit: true } },
      { kind: 'bell_small', where: 'ceiling', chance: 0.01, gap: 14, fitLen: [12, 0.2] },
      { kind: 'banner', where: 'ceiling', chance: 0.012, gap: 12, height: 4, dim: 0.2, opts: (rng) => ({ len: rng.range(80, 120) }) },
      { kind: 'grass_clump', where: 'floor', chance: 0.07, gap: 2, layer: 'front', opts: { color: '#2a1c20', h: 18 } },
    ],
    weather: [{ kind: 'ash', count: 50, color: '#d8c0b8' }, { kind: 'embers', count: 22, color: '#ffb060' }],
    fog: { alpha: 0.14, color: '#7a4e58' },
    vignette: 0.5,
    grade: { top: '#1a0a20', topA: 0.12, bottom: '#ff9050', bottomA: 0.05 },
    fg: { kinds: ['grass', 'rock'], density: 0.8 },
    bg: { recipe },
  });
})();
