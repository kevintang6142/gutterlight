// src/entities/bosses/vespertine.js — DUCHESS VESPERTINE, Warden of the Wing (module boss-vespertine).
// Keeper of the Mothwood, fought in mw_04 "The Duchess's Bower" (src/data/arenas/vespertine.js). HP 600, expected
// Brand level 1-2 (L2: 47 hits, L1: 67). A giant moth seen from above: eye-spotted violet wings (cached sprites,
// flapped by foreshortening), a pale fur mane, feathered antennae and a small violet flame on her crown.
// Attacks (every wind-up >= 0.45 s, visual + audio; every hit deals 1):
//   swoop  wings fold back, a rising whistle -> a deep arcing dive through the player (jump over it); P2: twice
//   gust   wings drawn far back, air sucked in -> one great beat: the wind pushes the player away and a roll of dust
//          races along the floor (jump it); P2: two beats
//   dust   wings wrapped, a thrumming hum -> she flings them open: the arena darkens and 3 (P2: 4) dust clouds settle
//          around the player, each warned 0.8 s by a ring before it turns harmful for 3 s (step into a gap)
//   brood  wings quiver, chittering -> moths peel off her eye-spots (cap 3 alive) that hunt, glow (0.46 s) and dart
//   dash   (P2) wings swept into blades, an aim line that locks with a flash -> straight dashes (jump over); 2-3 in a row
// Phase 2 at 50 %: she gathers herself and flares (cry, flash, music layer 1). Stagger after 130 damage: she tumbles to
// the floor (no contact damage) for 2 s. Defeat (custom): she sinks to the floor and comes apart into a swarm of
// small pale moths that rise through the vault. Seal of the Wing + 300 cinders + music 'keeper' come from G.Boss.
(function () {
  'use strict';
  const G = globalThis.G;
  if (!G || !G.Boss || !G.Enemy || !G.CONST) return;
  const TILE = G.CONST.TILE;
  const TAU = Math.PI * 2;
  const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
  const lerp = (a, b, k) => a + (b - a) * k;
  const damp = (a, b, rate, dt) => a + (b - a) * (1 - Math.exp(-rate * dt));
  const approach = (v, to, step) => (v < to ? Math.min(to, v + step) : Math.max(to, v - step));
  const rnd = (a, b) => a + Math.random() * (b - a);
  const glow = (ctx, x, y, r, col, a) => {
    if (!(a > 0.004)) return;
    if (G.Art && G.Art.glow) G.Art.glow(ctx, x, y, r, col, a);
    else if (G.fx && G.fx.glowAt) G.fx.glowAt(ctx, x, y, r, col, a);
  };
  // Difficulty modes: EXPLICIT telegraphs (the dust clouds' warning rings, the dash aim line, the mothlings' aim
  // streak) are drawn only while this is true (easy). Gameplay timing never depends on it. Per-attack decisions and
  // the diegetic tells: docs/api/boss-vespertine.md "Telegraphs by mode".
  const teleOn = () => (G.telegraphsOn ? G.telegraphsOn() : (!(G.game && G.game.telegraphs) || G.game.telegraphs() !== false));

  const ID = 'vespertine';
  const HP = 600;
  const BW = 92, BH = 116;                  // physics box (thorax + head + upper abdomen)
  const K = 0.82;                           // art scale (local art units -> px): wingspan ~410 px
  const STAGGER = { damage: 130, time: 2.0 };
  const MOTH_CAP = 3;
  const TELE = { swoop: 0.56, swoop2: 0.5, swoopChain: 0.46, gust: 0.66, gust2: 0.48, dust: 0.76, brood: 0.62, dash: 0.56, dashChain: 0.48, moth: 0.46 };
  // swoop geometry: start point SW_MAX px beside the player; her climb-out ends >= SW_EDGE px from the far wall (with less
  // room than SW_MAX beyond the player the climb-out is compressed); with less than SW_CORNER px beyond the player she does
  // not swoop, and a player who ran into such a corner during the wind-up gets a cut-off arc ending SW_CUT px in front
  const SW_MAX = 460, SW_EDGE = 80, SW_CORNER = 150, SW_CUT = 110;
  const DASH_PASS = 150, DASH_SHORT = 150, DASH_REST = 130;   // dash: room past the player to pass them; check-short gap; recover hover height (centre above the floor)
  const DASH_LOCK = 0.34, DASH_RUN = 480;                   // dash: aim locks (white flash + chirp) this long before launch; min run-up from the player
  const PUSH = 300;                         // gust wind (px/s): running into it still gains ground
  const DARK_MAX = 0.86;                    // room darkness at the depth of a dust pulse
  const CAMB = { x: 400, y: 160, intro: 1050 };
  const PAL = {
    wing: '#6a48b0', wingDeep: '#2c1f52', wingEdge: '#1a1230', wingRoot: '#9a80d4', band: '#d4c0f6', fringe: '#efe6ff', vein: '#20163a',
    eyeOuter: '#100a1e', eyeRing: '#e6d2ff', eyeIris: '#7c4ae4', eyePupil: '#0b0614', eyeHi: '#fbf7ff',
    fur: '#efe8f8', furShade: '#bcaed8', furDeep: '#7a6aa6',
    body: '#4c3c74', bodyDark: '#281e44', bodyBand: '#a492d0',
    head: '#30245a', compound: '#120b22', compoundHi: '#cdb0ff',
    antenna: '#2c2048', antennaBarb: '#b4a2dc',
    glow: '#c8a8ff', glowDeep: '#8a5cff', tele: '#efdcff', aim: '#f2e4ff',
    dust: '#1a1328', dustMid: '#3a2d58', dustLight: '#b8a4e8', outline: '#0b0714',
    moth: '#8a6cc8', mothDark: '#3e2e66', mothEye: '#f4eaff',
  };

  // ======================================================================================== the moth figure
  // Pose: fa/ha = fore/hind wing angle (rad, + = tips raised), fx = span (1 = spread flat toward the viewer, small =
  // foreshortened, swept back), amp = flap depth, hz = flap rate, ant = antenna lift, leg = talons out (0..1).
  const POSES = {
    rest:   { fa: -0.42, ha: -0.30, fx: 0.62, amp: 0.05, hz: 0.22, ant: -0.30, leg: 0.0 },
    hover:  { fa: 0.20, ha: -0.04, fx: 1.00, amp: 0.55, hz: 1.35, ant: 0.00, leg: 0.1 },
    glide:  { fa: 0.12, ha: -0.02, fx: 1.00, amp: 0.22, hz: 0.9, ant: 0.15, leg: 0.0 },
    dart:   { fa: 0.82, ha: 0.56, fx: 0.42, amp: 0.05, hz: 3.0, ant: 0.60, leg: 0.6 },
    raise:  { fa: 1.12, ha: 0.82, fx: 0.60, amp: 0.07, hz: 7.0, ant: -0.40, leg: 0.2 },
    beat:   { fa: -0.32, ha: -0.42, fx: 1.06, amp: 0.00, hz: 1.0, ant: 0.50, leg: 0.3 },
    wrap:   { fa: -0.98, ha: -0.78, fx: 0.40, amp: 0.04, hz: 6.0, ant: -0.60, leg: 0.0 },
    flare:  { fa: 0.42, ha: 0.10, fx: 1.12, amp: 0.08, hz: 5.0, ant: 0.80, leg: 0.4 },
    quiver: { fa: 0.30, ha: 0.02, fx: 0.96, amp: 0.20, hz: 9.0, ant: 0.50, leg: 0.2 },
    blade:  { fa: 0.98, ha: 0.72, fx: 0.36, amp: 0.02, hz: 8.0, ant: 0.70, leg: 1.0 },
    droop:  { fa: -0.50, ha: -0.45, fx: 0.88, amp: 0.12, hz: 0.6, ant: -0.50, leg: 0.0 },
    fallen: { fa: -0.08, ha: -0.12, fx: 1.00, amp: 0.03, hz: 0.4, ant: -0.70, leg: 0.0 },
  };
  const PKEYS = ['fa', 'ha', 'fx', 'amp', 'hz', 'ant', 'leg'];
  const copyPose = (p) => { const o = { phi: 0 }; for (const k of PKEYS) o[k] = p[k]; return o; };

  const FORE_ROOT = { x: 12, y: -12 }, HIND_ROOT = { x: 10, y: 6 };
  const FORE_EYE = { x: 136, y: -46, r: 19 }, HIND_EYE = { x: 100, y: 62, r: 27 };
  const MANE = [[-30, 4, 12], [-29, -8, 13], [-22, -19, 13], [-12, -26, 12], [0, -28, 12], [12, -26, 12], [22, -19, 13],
    [29, -8, 13], [30, 4, 12], [-19, 8, 13], [19, 8, 13], [-8, 12, 12], [8, 12, 12], [0, 17, 11],
    [-12, -6, 13], [12, -6, 13], [0, -10, 13], [0, 4, 14], [-14, 0, 11], [14, 0, 11]];

  function forePath() {
    const p = new Path2D();
    p.moveTo(0, -6);
    p.bezierCurveTo(40, -42, 120, -100, 212, -120);
    p.quadraticCurveTo(240, -124, 238, -100);
    p.bezierCurveTo(228, -52, 216, -8, 190, 24);
    p.quadraticCurveTo(150, 44, 96, 36);
    p.bezierCurveTo(56, 30, 20, 20, 0, 8);
    p.closePath();
    return p;
  }
  function hindPath() {
    const p = new Path2D();
    p.moveTo(0, -4);
    p.bezierCurveTo(60, -16, 134, -10, 166, 22);
    p.bezierCurveTo(192, 52, 178, 106, 138, 128);
    p.bezierCurveTo(104, 148, 56, 142, 30, 106);
    p.bezierCurveTo(14, 80, 4, 40, 0, 10);
    p.closePath();
    return p;
  }

  // Wing sprites (built once, lazily: no DOM at load time). Local art units; RES px per unit for crisp scaling.
  const RES = 1.6;
  let SPR = null;
  function eyeSpot(c, x, y, r) {
    c.fillStyle = PAL.eyeOuter; c.beginPath(); c.arc(x, y, r * 1.34, 0, TAU); c.fill();
    c.fillStyle = PAL.eyeRing; c.beginPath(); c.arc(x, y, r * 1.1, 0, TAU); c.fill();
    const g = c.createRadialGradient(x - r * 0.2, y - r * 0.2, r * 0.1, x, y, r * 0.88);
    g.addColorStop(0, '#b48cff'); g.addColorStop(1, PAL.eyeIris);
    c.fillStyle = g; c.beginPath(); c.arc(x, y, r * 0.86, 0, TAU); c.fill();
    c.fillStyle = PAL.eyePupil; c.beginPath(); c.arc(x + r * 0.06, y + r * 0.04, r * 0.42, 0, TAU); c.fill();
    c.fillStyle = PAL.eyeHi; c.beginPath(); c.ellipse(x - r * 0.3, y - r * 0.32, r * 0.2, r * 0.14, -0.6, 0, TAU); c.fill();
    c.strokeStyle = 'rgba(240,226,255,0.35)'; c.lineWidth = 1.5;
    c.beginPath(); c.arc(x, y, r * 1.22, Math.PI * 1.05, Math.PI * 1.6); c.stroke();
  }
  function makeWing(fore) {
    const w = fore ? 250 : 200, h = fore ? 178 : 160, ox = 6, oy = fore ? 132 : 18;
    const cv = G.U.makeCanvas(Math.ceil(w * RES), Math.ceil(h * RES));
    const c = cv.ctx;
    c.scale(RES, RES); c.translate(ox, oy);
    const path = fore ? forePath() : hindPath();
    const g = c.createRadialGradient(0, 0, 8, 0, 0, fore ? 245 : 190);
    g.addColorStop(0, PAL.wingRoot); g.addColorStop(0.42, PAL.wing); g.addColorStop(0.84, PAL.wingDeep); g.addColorStop(1, PAL.wingEdge);
    c.fillStyle = g; c.fill(path);
    c.save(); c.clip(path);
    // scale texture (deterministic speckle)
    let s = fore ? 1234567 : 7654321;
    const R = () => { s = (s * 16807) % 2147483647; return s / 2147483647; };
    for (let i = 0; i < 260; i++) {
      const a = R() * (fore ? -1.2 : 1.4) + (fore ? 0.2 : -0.2), d = 20 + R() * (fore ? 220 : 165);
      c.fillStyle = R() < 0.5 ? 'rgba(220,200,255,0.10)' : 'rgba(10,6,24,0.16)';
      c.fillRect(Math.cos(a) * d, Math.sin(a) * d, 2 + R() * 3, 1.5 + R() * 2);
    }
    // veins fanning from the root
    c.strokeStyle = PAL.vein; c.globalAlpha = 0.55; c.lineWidth = 1.6;
    const tips = fore ? [[214, -116], [230, -84], [226, -44], [212, -6], [186, 22], [140, 38], [80, 32]]
      : [[160, 18], [178, 58], [162, 104], [124, 134], [74, 136], [36, 108]];
    for (const [tx, ty] of tips) { c.beginPath(); c.moveTo(0, 0); c.quadraticCurveTo(tx * 0.45, ty * 0.55 + (fore ? 10 : -6), tx, ty); c.stroke(); }
    c.globalAlpha = 1;
    // pale fur at the root
    c.strokeStyle = 'rgba(236,228,248,0.32)'; c.lineWidth = 2.2;
    for (let i = 0; i < 14; i++) { const a = (fore ? -0.9 : -0.1) + i * 0.09, l = 22 + R() * 26; c.beginPath(); c.moveTo(0, 0); c.lineTo(Math.cos(a) * l, Math.sin(a) * l); c.stroke(); }
    // concentric decorative bands (a scaled copy of the outline stroked inside the wing)
    c.save(); c.scale(0.8, 0.8); c.strokeStyle = PAL.band; c.globalAlpha = 0.42; c.lineWidth = 7; c.stroke(path); c.restore();
    c.save(); c.scale(0.9, 0.9); c.strokeStyle = PAL.wingEdge; c.globalAlpha = 0.6; c.lineWidth = 4; c.setLineDash([9, 5]); c.stroke(path); c.restore();
    // a dark crescent mark near the apex (forewing) / tail lobe (hindwing)
    c.fillStyle = 'rgba(16,10,30,0.55)';
    c.beginPath();
    if (fore) { c.ellipse(196, -88, 16, 7, -0.6, 0, TAU); } else { c.ellipse(70, 118, 18, 8, 0.5, 0, TAU); }
    c.fill();
    // eye-spot
    const E = fore ? FORE_EYE : HIND_EYE;
    eyeSpot(c, E.x, E.y, E.r);
    // pale fringe along the margin
    c.strokeStyle = PAL.fringe; c.globalAlpha = 0.75; c.lineWidth = 4; c.setLineDash([3, 6]); c.stroke(path);
    c.setLineDash([]); c.globalAlpha = 1;
    c.restore();
    c.lineWidth = 2.6; c.strokeStyle = PAL.outline; c.stroke(path);
    return { canvas: cv.canvas, ox, oy, w, h };
  }
  function sprites() {
    if (!SPR && G.U && G.U.makeCanvas) { try { SPR = { fore: makeWing(true), hind: makeWing(false) }; } catch (e) { G.reportError(e, 'vespertine wing sprites'); SPR = { fail: true }; } }
    return SPR && !SPR.fail ? SPR : null;
  }

  /** Effective wing angles/spans for the current pose and flap phase. */
  function wingState(P) {
    const ph = P.phi || 0, amp = P.amp || 0;
    const k1 = 0.5 - 0.5 * Math.cos(ph), k2 = 0.5 - 0.5 * Math.cos(ph - 0.45);
    return {
      fa: P.fa + 0.2 * amp * Math.sin(ph), ha: P.ha + 0.14 * amp * Math.sin(ph - 0.45),
      ffx: P.fx * (1 - 0.8 * amp * k1), hfx: P.fx * (1 - 0.72 * amp * k2),
    };
  }
  /** A point on a wing (wing-local art units) -> figure-local art units. */
  function wingLocal(root, ang, fx, side, lx, ly) {
    const ca = Math.cos(ang), sa = Math.sin(ang), wx = lx * fx;
    return { x: side * (root.x + wx * ca + ly * sa), y: root.y - wx * sa + ly * ca };
  }
  /** Figure-local art units -> world px for a figure centred at (x, y) rotated by rot. */
  function toWorld(x, y, rot, lx, ly) {
    const c = Math.cos(rot || 0), s = Math.sin(rot || 0), ax = lx * K, ay = ly * K;
    return { x: x + ax * c - ay * s, y: y + ax * s + ay * c };
  }
  /** World positions of the four eye-spots (glows, moth spawn points). */
  function eyeSpots(x, y, P, rot) {
    const W = wingState(P), out = [];
    for (const side of [-1, 1]) {
      const a = wingLocal(FORE_ROOT, W.fa, W.ffx, side, FORE_EYE.x, FORE_EYE.y);
      const b = wingLocal(HIND_ROOT, W.ha, W.hfx, side, HIND_EYE.x, HIND_EYE.y);
      out.push(Object.assign(toWorld(x, y, rot, a.x, a.y), { r: FORE_EYE.r * K, side }));
      out.push(Object.assign(toWorld(x, y, rot, b.x, b.y), { r: HIND_EYE.r * K, side }));
    }
    return out;
  }

  function drawWing(ctx, spr, root, side, ang, fx) {
    ctx.save();
    ctx.scale(side, 1);
    ctx.translate(root.x, root.y);
    ctx.rotate(-ang);
    ctx.scale(Math.max(0.06, fx), 1);
    ctx.drawImage(spr.canvas, -spr.ox, -spr.oy, spr.w, spr.h);
    ctx.restore();
  }
  function drawWingFallback(ctx, root, side, ang, fx, fore) {
    ctx.save(); ctx.scale(side, 1); ctx.translate(root.x, root.y); ctx.rotate(-ang); ctx.scale(Math.max(0.06, fx), 1);
    ctx.fillStyle = PAL.wing; ctx.strokeStyle = PAL.outline; ctx.lineWidth = 2.5;
    const p = fore ? forePath() : hindPath(); ctx.fill(p); ctx.stroke(p);
    ctx.restore();
  }
  function drawAntenna(ctx, side, lift, t, seed, look) {
    const bx = side * 6 + look, by = -48;
    const sw = Math.sin(t * 1.7 + side + seed) * 3;
    const tx = side * (44 + lift * 8) + sw + look * 0.5, ty = -118 - lift * 10;
    const cx = side * (12 - lift * 4) + look, cy = -86 - lift * 8;
    ctx.lineCap = 'round';
    // barbs (feathered, bipectinate)
    ctx.beginPath();
    for (let i = 1; i <= 12; i++) {
      const u = i / 13, iu = 1 - u;
      const px = iu * iu * bx + 2 * iu * u * cx + u * u * tx, py = iu * iu * by + 2 * iu * u * cy + u * u * ty;
      let dx = 2 * iu * (cx - bx) + 2 * u * (tx - cx), dy = 2 * iu * (cy - by) + 2 * u * (ty - cy);
      const dl = Math.hypot(dx, dy) || 1; dx /= dl; dy /= dl;
      const L = 11 * (1 - u * 0.62);
      for (const n of [-1, 1]) { ctx.moveTo(px, py); ctx.lineTo(px - dy * n * L + dx * L * 0.5, py + dx * n * L + dy * L * 0.5); }
    }
    ctx.strokeStyle = PAL.antennaBarb; ctx.lineWidth = 1.7; ctx.stroke();
    ctx.beginPath(); ctx.moveTo(bx, by); ctx.quadraticCurveTo(cx, cy, tx, ty);
    ctx.strokeStyle = PAL.antenna; ctx.lineWidth = 3; ctx.stroke();
  }
  function drawLegs(ctx, reach, t) {
    ctx.lineCap = 'round'; ctx.lineJoin = 'round';
    const pairs = [[10, 10, -30, -40], [14, 16, -6, -22], [12, 22, 14, -6]];
    for (let pass = 0; pass < 2; pass++) {
      ctx.strokeStyle = pass ? PAL.bodyDark : PAL.outline; ctx.lineWidth = pass ? 2.6 : 5;
      ctx.beginPath();
      for (let i = 0; i < pairs.length; i++) {
        const [hx, hy, rx, ry] = pairs[i];
        for (const s of [-1, 1]) {
          const kx = s * (hx + 14), ky = hy + 12 + Math.sin(t * 3 + i) * 1.2;
          const fx = s * lerp(hx + 4, hx + 10 + i * 4, reach), fy = lerp(hy + 30, hy + ry + rx * 0.2, reach) + (i === 0 ? -reach * 26 : 0);
          ctx.moveTo(s * hx, hy); ctx.lineTo(kx, ky); ctx.lineTo(fx, fy);
        }
      }
      ctx.stroke();
    }
  }
  function drawMane(ctx, t, seed) {
    const br = Math.sin(t * 2.1 + seed) * 0.8;
    ctx.fillStyle = PAL.outline;
    ctx.beginPath(); for (const [x, y, r] of MANE) { ctx.moveTo(x + r + 2.4, y + br); ctx.arc(x, y + br, r + 2.4, 0, TAU); } ctx.fill();
    ctx.fillStyle = PAL.furShade;
    ctx.beginPath(); for (const [x, y, r] of MANE) { ctx.moveTo(x + r, y + br); ctx.arc(x, y + br, r, 0, TAU); } ctx.fill();
    ctx.fillStyle = PAL.fur;
    ctx.beginPath(); for (const [x, y, r] of MANE) { const rr = r * 0.7; ctx.moveTo(x - 2 + rr, y - 3 + br); ctx.arc(x - 2, y - 3 + br, rr, 0, TAU); } ctx.fill();
    ctx.strokeStyle = 'rgba(122,106,166,0.55)'; ctx.lineWidth = 1.4;
    ctx.beginPath();
    for (let i = 0; i < MANE.length; i++) { const [x, y, r] = MANE[i]; ctx.moveTo(x + r * 0.2, y + r * 0.1 + br); ctx.quadraticCurveTo(x + r * 0.5, y + r * 0.6 + br, x + r * 0.1, y + r * 0.9 + br); }
    ctx.stroke();
  }

  /**
   * Draws Duchess Vespertine centred on her thorax at (x, y). P: pose (POSES keys + phi). o: {rot, eye (eye-spot glow
   * 0..1.5), flame (0..1), look (px), seed, alpha, asym (rad: one wing up, one down)}.
   */
  function drawMoth(ctx, x, y, P, t, o) {
    o = o || {};
    const W = wingState(P), spr = sprites(), seed = o.seed || 0, look = clamp(o.look || 0, -5, 5);
    const eye = clamp(o.eye == null ? 0.4 : o.eye, 0, 1.6), asym = o.asym || 0;
    ctx.save();
    ctx.translate(x, y);
    if (o.rot) ctx.rotate(o.rot);
    ctx.scale(K, K);
    if (o.alpha != null && o.alpha < 1) ctx.globalAlpha *= Math.max(0, o.alpha);
    glow(ctx, 0, 6, 210, PAL.glowDeep, 0.14 + 0.12 * eye);
    for (const side of [-1, 1]) {
      if (spr) drawWing(ctx, spr.hind, HIND_ROOT, side, W.ha + asym * side, W.hfx); else drawWingFallback(ctx, HIND_ROOT, side, W.ha, W.hfx, false);
    }
    for (const side of [-1, 1]) {
      if (spr) drawWing(ctx, spr.fore, FORE_ROOT, side, W.fa + asym * side, W.ffx); else drawWingFallback(ctx, FORE_ROOT, side, W.fa, W.ffx, true);
    }
    if (eye > 0.02) {
      for (const side of [-1, 1]) {
        const a = wingLocal(FORE_ROOT, W.fa + asym * side, W.ffx, side, FORE_EYE.x, FORE_EYE.y);
        const b = wingLocal(HIND_ROOT, W.ha + asym * side, W.hfx, side, HIND_EYE.x, HIND_EYE.y);
        glow(ctx, a.x, a.y, FORE_EYE.r * 2.8, PAL.glow, 0.22 * eye);
        glow(ctx, b.x, b.y, HIND_EYE.r * 2.6, PAL.glow, 0.26 * eye);
        if (eye > 0.7) { glow(ctx, a.x, a.y, FORE_EYE.r * 1.1, '#ffffff', 0.25 * (eye - 0.7)); glow(ctx, b.x, b.y, HIND_EYE.r * 1.1, '#ffffff', 0.25 * (eye - 0.7)); }
      }
    }
    // body: legs, abdomen, thorax, mane, head, antennae, crown flame
    const breath = Math.sin(t * 2.1 + seed) * 1.5;
    const sway = Math.sin(t * 1.3 + seed) * 4 * (1 - (P.leg || 0) * 0.7);
    drawLegs(ctx, P.leg || 0, t);
    const tipX = sway, tipY = 104 + breath;
    const ab = new Path2D();
    ab.moveTo(-20, 12);
    ab.bezierCurveTo(-27, 44, -18, 84, tipX - 4, tipY);
    ab.quadraticCurveTo(tipX, tipY + 7, tipX + 4, tipY);
    ab.bezierCurveTo(18, 84, 27, 44, 20, 12);
    ab.closePath();
    ctx.fillStyle = PAL.body; ctx.fill(ab);
    ctx.save(); ctx.clip(ab);
    ctx.fillStyle = PAL.bodyDark; ctx.globalAlpha *= 0.7; ctx.fillRect(5, 6, 32, 110); ctx.globalAlpha /= 0.7;
    ctx.strokeStyle = PAL.bodyBand; ctx.lineWidth = 3.2;
    ctx.beginPath();
    for (let i = 0; i < 5; i++) { const yy = 30 + i * 15, xs = sway * (yy - 12) / 92; ctx.moveTo(-26 + xs, yy); ctx.quadraticCurveTo(xs, yy + 7, 26 + xs, yy); }
    ctx.globalAlpha *= 0.55; ctx.stroke();
    ctx.restore();
    ctx.lineWidth = 3; ctx.strokeStyle = PAL.outline; ctx.stroke(ab);
    ctx.beginPath(); ctx.arc(0, 0, 27, 0, TAU); ctx.fillStyle = PAL.body; ctx.fill(); ctx.stroke();
    drawMane(ctx, t, seed);
    ctx.beginPath(); ctx.ellipse(look, -38, 18, 16, 0, 0, TAU); ctx.fillStyle = PAL.head; ctx.fill();
    ctx.lineWidth = 2.6; ctx.strokeStyle = PAL.outline; ctx.stroke();
    for (const s of [-1, 1]) {
      ctx.beginPath(); ctx.ellipse(look + s * 10.5, -38, 8.5, 10.5, s * 0.35, 0, TAU); ctx.fillStyle = PAL.compound; ctx.fill();
      ctx.beginPath(); ctx.ellipse(look + s * 10.5 - 2.5, -42, 3.6, 2.6, -0.5, 0, TAU);
      ctx.fillStyle = PAL.compoundHi; ctx.globalAlpha *= 0.45 + 0.35 * Math.min(1, eye); ctx.fill(); ctx.globalAlpha /= 0.45 + 0.35 * Math.min(1, eye);
    }
    glow(ctx, look, -38, 30, PAL.glow, 0.12 + 0.18 * Math.min(1, eye));
    drawAntenna(ctx, -1, P.ant || 0, t, seed, look);
    drawAntenna(ctx, 1, P.ant || 0, t, seed, look);
    // crown: a short wick with her violet flame
    const fk = clamp(o.flame == null ? 1 : o.flame, 0, 1.4);
    ctx.strokeStyle = '#1a1226'; ctx.lineWidth = 3; ctx.lineCap = 'round';
    ctx.beginPath(); ctx.moveTo(look * 0.6, -52); ctx.quadraticCurveTo(look * 0.6 + 3, -60, look * 0.6, -67); ctx.stroke();
    if (fk > 0.04 && G.Art && G.Art.flame) G.Art.flame(ctx, look * 0.6, -66, 14 + 12 * fk, 'violet', t, seed, { glow: 0.8 * Math.min(1, fk) });
    ctx.restore();
  }

  // ======================================================================================== projectiles
  // A roll of dust driven along the floor by her wing-beat (jump it). Wave mechanics (stops at walls).
  const WaveBase = (G.Projectile && G.Projectile.Wave) || G.Projectile;
  class DustRoll extends WaveBase {
    hitBox() { return { x: this.x + 8, y: this.y + this.h * 0.3, w: this.w - 16, h: this.h * 0.7 }; }
    update(dt) {
      super.update(dt);
      if (this.dead || !G.fx) return;
      if (Math.random() < dt * 40) G.fx.spawn({ x: this.cx - this.dir * this.w * 0.4, y: this.y + this.h * rnd(0.3, 0.9), vx: -this.dir * rnd(20, 80), vy: rnd(-60, -10), life: rnd(0.4, 0.8), size: rnd(3, 6), size2: 1, color: PAL.dustLight, alpha: 0.5, drag: 1.5, add: true });
    }
    burstFx() {
      if (!G.fx) return;
      G.fx.burst('smoke', this.cx, this.y + this.h * 0.6, { count: 6, color: PAL.dustMid, alpha: 0.5, size: 16 });
      G.fx.burst('dust', this.cx, this.y + this.h, { count: 8, color: PAL.dustLight });
    }
    draw(ctx, t) {
      const life = clamp(Math.min(this.age / 0.12, 1 - Math.max(0, this.age - this.life + 0.3) / 0.3), 0, 1);
      const d = this.dir, by = this.y + this.h;
      glow(ctx, this.cx, by - this.h * 0.4, this.h * 1.4, PAL.glowDeep, 0.35 * life);
      ctx.save();
      ctx.globalAlpha *= life;
      for (let i = 0; i < 7; i++) {      // tumbling puffs: tallest at the leading edge
        const k = i / 6, spin = t * 9 + i * 1.3 + this.seed;
        const px = this.cx + d * (this.w * 0.42 - k * this.w * 1.15) + Math.cos(spin) * 5;
        const r = this.h * (0.52 - k * 0.3) * (0.9 + 0.1 * Math.sin(spin * 1.3));
        const py = by - r * 0.9 + Math.sin(spin) * 3;
        ctx.fillStyle = i % 2 ? PAL.dustMid : PAL.dust;
        ctx.beginPath(); ctx.arc(px, py, r, 0, TAU); ctx.fill();
        ctx.fillStyle = 'rgba(184,164,232,0.35)';
        ctx.beginPath(); ctx.arc(px - r * 0.3, py - r * 0.35, r * 0.45, 0, TAU); ctx.fill();
      }
      ctx.strokeStyle = 'rgba(214,196,255,0.6)'; ctx.lineWidth = 2;   // crest line so it reads on the dark floor
      ctx.beginPath();
      if (d > 0) ctx.arc(this.cx + this.w * 0.3, by - this.h * 0.45, this.h * 0.5, -1.4, 0.2);
      else ctx.arc(this.cx - this.w * 0.3, by - this.h * 0.45, this.h * 0.5, Math.PI - 0.2, Math.PI + 1.4);
      ctx.stroke();
      ctx.restore();
    }
  }
  G.registerProjectile('vesp_roll', DustRoll, { r: 24, gravity: 0, life: 6, color: PAL.glowDeep, damage: 1 });

  // A dust cloud: drifts from her wings to its spot (travel), warns with a pulsing ring (warn), then hurts (active),
  // then thins away (fade, harmless). Darkness: the boss deepens the room while clouds live.
  let DUST_SPR = null;
  function dustSprite() {
    if (!DUST_SPR && G.U && G.U.makeCanvas) {
      const cv = G.U.makeCanvas(128, 128), c = cv.ctx;
      // a pale haze of wing-dust (reads against the dark bower) with a smothering darker heart
      const g = c.createRadialGradient(64, 64, 4, 64, 64, 64);
      g.addColorStop(0, 'rgba(150,128,196,0.62)'); g.addColorStop(0.45, 'rgba(106,88,150,0.46)'); g.addColorStop(0.8, 'rgba(70,56,104,0.2)'); g.addColorStop(1, 'rgba(60,48,90,0)');
      c.fillStyle = g; c.fillRect(0, 0, 128, 128);
      const g2 = c.createRadialGradient(58, 70, 2, 60, 68, 34);
      g2.addColorStop(0, 'rgba(18,12,30,0.55)'); g2.addColorStop(1, 'rgba(18,12,30,0)');
      c.fillStyle = g2; c.fillRect(0, 0, 128, 128);
      DUST_SPR = cv.canvas;
    }
    return DUST_SPR;
  }
  class DustCloud extends G.Projectile {
    constructor(props) {
      super(props);
      const p = props || {};
      this.sx = this.cx; this.sy = this.cy;
      this.tx = p.tx == null ? this.cx : p.tx; this.ty = p.ty == null ? this.cy : p.ty;
      this.R = p.R || 78;                       // drawn radius; harmful radius 0.8 R
      this.T1 = p.travel == null ? 0.5 : p.travel;
      this.T2 = this.T1 + (p.warn == null ? 0.8 : p.warn);
      this.T3 = this.T2 + (p.active == null ? 3.0 : p.active);
      this.T4 = this.T3 + 0.8;
      this.life = this.T4 + 0.1;
      this.terrain = false;
      this.z = 6;
      this.light = false;
    }
    get phase() { return this.age < this.T1 ? 'travel' : this.age < this.T2 ? 'warn' : this.age < this.T3 ? 'active' : 'fade'; }
    get harmful() { return this.age >= this.T2 && this.age < this.T3; }
    update(dt) {
      this.age += dt;
      if (this.age >= this.T4) { this.remove(); return; }
      const k = clamp(this.age / Math.max(0.01, this.T1), 0, 1), e = 1 - (1 - k) * (1 - k);
      const nx = lerp(this.sx, this.tx, e), ny = lerp(this.sy, this.ty, e);
      this.x = nx - this.r; this.y = ny - this.r;
      if (!this._warned && this.age >= this.T1) {
        this._warned = true;
        const R = this.R * 0.8;
        // the warning circle is an explicit marker: G.warnZone draws it in easy only (cue 'none': the settling,
        // thickening haze itself + the 'vesp_settle' sound are the standard-mode tell)
        if (this.room) G.warnZone(this.room, { x: this.tx - R, y: this.ty - R, w: R * 2, h: R * 2, dur: this.T2 - this.T1, color: PAL.tele, style: 'circle', cue: 'none' });
        G.sfxAt('vesp_settle', this.tx, { vol: 0.5 });
      }
      if (this.harmful) this.touchPlayer();
      if (G.lighting) G.lighting.add({ x: this.cx, y: this.cy, r: this.R * 1.6, color: PAL.glow, intensity: this.age < this.T1 ? 0.18 : this.age < this.T3 ? 0.5 : 0.3, glow: false });
      // standard / hardcore: while it settles (warn) the cloud sheds twice the glittering scales — the diegetic tell
      const glit = this.age > this.T1 && this.age < this.T2 && !teleOn() ? 34 : 14;
      if (G.fx && this.age > this.T1 && this.age < this.T3 && Math.random() < dt * glit) {
        const a = rnd(0, TAU), d = rnd(0.2, 0.9) * this.R;
        G.fx.spawn({ x: this.cx + Math.cos(a) * d, y: this.cy + Math.sin(a) * d, vx: rnd(-20, 20), vy: rnd(-30, 5), life: rnd(0.5, 1.1), size: rnd(1.5, 3), color: PAL.dustLight, alpha: 0.75, add: true });
      }
    }
    hitBox() { const s = this.R * 0.8 * 0.72; return { x: this.cx - s, y: this.cy - s, w: s * 2, h: s * 2 }; }
    touchPlayer() {
      const p = G.game && G.game.player;
      if (!p || p.dead) return false;
      const R = this.R * 0.8, nx = clamp(this.cx, p.x, p.x + p.w), ny = clamp(this.cy, p.y, p.y + p.h);
      if ((nx - this.cx) * (nx - this.cx) + (ny - this.cy) * (ny - this.cy) > R * R) return false;
      G.Combat.hurtPlayer(this.damage, this);   // the cloud lingers (area denial)
      return true;
    }
    burstFx() { if (G.fx) G.fx.burst('smoke', this.cx, this.cy, { count: 6, color: PAL.dustMid, alpha: 0.4, size: 22 }); }
    draw(ctx, t) {
      const spr = dustSprite();
      const ph = this.phase, tele = teleOn();
      // standard / hardcore: with no warning ring the settling haze itself must read, so it thickens from a denser start
      const wk = (this.age - this.T1) / (this.T2 - this.T1);
      const dens = ph === 'travel' ? 0.55 : ph === 'warn' ? (tele ? 0.35 + 0.45 * wk : 0.6 + 0.4 * wk) : ph === 'active' ? 1 : clamp(1 - (this.age - this.T3) / 0.8, 0, 1) * 0.8;
      const R = ph === 'travel' ? this.R * (0.45 + 0.4 * (this.age / this.T1)) : this.R;
      ctx.save();
      if (spr) {
        for (let i = 0; i < 7; i++) {
          const a = this.seed + i * 0.9 + t * (0.35 + i * 0.05) * (i % 2 ? 1 : -1);
          const d = i === 0 ? 0 : R * 0.42;
          const rr = R * (i === 0 ? 0.95 : 0.62);
          ctx.globalAlpha = dens * (i === 0 ? 0.85 : 0.6);
          ctx.drawImage(spr, this.cx + Math.cos(a) * d - rr, this.cy + Math.sin(a) * d * 0.8 - rr, rr * 2, rr * 2);
        }
      } else { ctx.globalAlpha = dens * 0.7; ctx.fillStyle = PAL.dust; ctx.beginPath(); ctx.arc(this.cx, this.cy, R, 0, TAU); ctx.fill(); }
      ctx.restore();
      // a violet rim so the harmful edge reads in the dark (standard / hardcore: no rim while it warns; a fainter
      // rim on the live cloud only — KEPT-SUBTLE, see the docs)
      if (ph !== 'travel' && (tele || ph !== 'warn')) {
        const pulse = ph === 'warn' ? 0.5 + 0.5 * Math.sin(this.age * 22) : 0.6;
        ctx.save();
        ctx.globalCompositeOperation = 'lighter';
        ctx.globalAlpha = (ph === 'fade' ? dens * 0.4 : ph === 'warn' ? 0.25 + 0.35 * pulse : 0.45) * (tele ? 1 : 0.75);
        ctx.strokeStyle = PAL.glow; ctx.lineWidth = ph === 'active' ? 2.5 : 1.5;
        ctx.setLineDash(ph === 'active' ? [10, 8] : [4, 10]);
        ctx.lineDashOffset = -t * 30;
        ctx.beginPath(); ctx.arc(this.cx, this.cy, this.R * 0.8, 0, TAU); ctx.stroke();
        ctx.setLineDash([]);
        ctx.restore();
      }
      glow(ctx, this.cx, this.cy, R * 0.9, PAL.glowDeep, 0.1 * dens);
      if (!tele && ph === 'warn') glow(ctx, this.cx, this.cy, R * 0.85, PAL.glow, 0.08 + 0.12 * wk);   // the settling haze glows faintly from within
    }
  }
  G.registerProjectile('vesp_dust', DustCloud, { r: 30, gravity: 0, life: 6, color: PAL.dustMid, damage: 1 });

  // ======================================================================================== the boss
  class Vespertine extends G.Boss {
    constructor(props) {
      super(props, {
        hp: HP, w: BW, h: BH,
        flying: true, gravity: 0,
        phases: [0.5],
        stagger: STAGGER,
        rest: [0.55, 1.0],
        phaseRest: [1, 0.72],
        introTime: 1.6,
        roar: false,                                   // she wakes with her own cry
        defeatStyle: 'custom',
        slowmo: 1.0,
        contactInset: 0,
        colors: { body: PAL.wing, dark: PAL.wingDeep, hit: '#f4ecff', puddle: PAL.furShade, smoke: '#6a5a8c', tele: PAL.tele },
        light: { r: 250, color: '#c8a8ff', intensity: 0.55 },
        attacks: {
          swoop: { weight(d) { return d > 260 ? 3.2 : 2.2; }, cooldown: 1.1, when() { return this.swoopRoom() >= SW_CORNER; } },   // a cornered player is never swooped into the wall
          gust:  { weight() { return this.playerLow() ? 2.6 : 1.0; }, cooldown: 4.5, when() { return this.dustCount() === 0; } },   // never blows the player into her clouds
          dust:  { weight: 1.8, cooldown: 10, when() { return this.dustCount() === 0; } },
          brood: { weight: 2.0, cooldown: 9, when() { return this.liveMinions() < this.mothCap(); } },
          dash:  { weight: 3.2, phase: 2, cooldown: 2.4 },
          ascend: { weight: 0, phase: 99, uninterruptible: true },
        },
      });
      this.dropThrough = true;                        // passes through the one-way silk platforms
      this.pz = copyPose(POSES.rest);
      this.want = 'rest'; this.poseRate = 6;
      this.rot = 0; this.rotWant = 0;
      this.eyeGlow = 0.15; this.eyeWant = 0.15; this.eyeBoost = 0;
      this.flameK = 0.5; this.look = 0; this.asym = 0;
      this.darkK = 0; this.darkT = 0;
      this.side = 1;
      this.camBX = 0; this.camBY = 0;
      this.contactOff = 0;
      this.dissolve = 0; this.swarm = [];
      this.wakeT = -1;
      this.phaseQueued = false;
    }

    init() {
      super.init();
      this.geom = this.buildGeom();
      this.baseDark = this.room && typeof this.room.dark === 'number' ? this.room.dark : 0.55;
      this.face();
      this.side = this.player && this.cx < this.player.x + this.player.w / 2 ? -1 : 1;
    }
    /** Inner flight bounds from the room tiles around her spawn (works in any room; mw_04: 40..2520 x 120..960). */
    buildGeom() {
      const room = this.room;
      if (!room) return { L: 0, R: 2560, ceil: 0, floor: 1000 };
      const T = G.T || {};
      const solid = (c, r) => c < 0 || r < 0 || c >= room.cols || r >= room.rows ? true : G.Physics.isSolidTile(room.tileAt(c, r));
      const c0 = clamp(Math.floor(this.cx / TILE), 0, room.cols - 1), r0 = clamp(Math.floor(this.cy / TILE), 0, room.rows - 1);
      let fr = r0; while (fr < room.rows && !solid(c0, fr)) fr++;
      let cr = r0; while (cr >= 0 && !solid(c0, cr)) cr--;
      const row = clamp(fr - 6, 0, room.rows - 1);
      let lc = c0; while (lc >= 0 && !solid(lc, row)) lc--;
      let rc = c0; while (rc < room.cols && !solid(rc, row)) rc++;
      void T;
      const g = { L: (lc + 1) * TILE, R: rc * TILE, ceil: (cr + 1) * TILE, floor: fr * TILE };
      // arena gates are walls during the fight (mw_04: the west gate at col 2 stands 80 px inside the room's edge)
      for (const e of room.entities || []) {
        if (e.type !== 'arena_gate' || e.y + e.h < g.floor - 6 * TILE) continue;
        if (e.x + e.w <= this.cx) g.L = Math.max(g.L, e.x + e.w); else g.R = Math.min(g.R, e.x);
      }
      return g;
    }

    // ---------------------------------------------------------------- hit areas (match the drawn figure)
    hurtRect() {
      if (this.hidden || this.dying) return null;
      const W = wingState(this.pz);
      const half = clamp(50 + 100 * W.ffx, 80, 155);
      if (Math.abs(Math.sin(this.rot)) > 0.6) return { x: this.cx - 82, y: this.cy - half * 0.75, w: 164, h: half * 1.5 };
      return { x: this.cx - half, y: this.cy - 84, w: half * 2, h: 162 };
    }
    contactRect() {
      if (this.dying || this.hidden || this.contactGrace || this.contactOff > 0 || this.is('stagger') || !this.fightStarted) return null;
      return { x: this.cx - 38, y: this.cy - 50, w: 76, h: 100 };
    }
    bodyRect() { return { x: this.cx - 50, y: this.cy - 50, w: 100, h: 100 }; }
    drawBounds() { return { x: this.cx - 300, y: this.cy - 230, w: 600, h: 430 }; }
    teleAnchor() { return toWorld(this.cx, this.cy, this.rot, this.look, -40); }
    eye() { return { x: this.cx, y: this.cy - 20 }; }

    // ---------------------------------------------------------------- helpers
    pcx() { const p = this.player; return p ? p.x + p.w / 2 : this.cx; }
    pcy() { const p = this.player; return p ? p.y + p.h / 2 : this.cy; }
    playerLow() { const p = this.player; return !!p && (p.y + p.h) > this.geom.floor - 1.6 * TILE; }
    clampX(x, m) { return clamp(x, this.geom.L + (m == null ? 130 : m), this.geom.R - (m == null ? 130 : m)); }
    clampY(y, top, bottom) { return clamp(y, this.geom.ceil + (top == null ? 110 : top), this.geom.floor - (bottom == null ? 64 : bottom)); }
    mothCap() { return this.phase >= 2 ? MOTH_CAP : 2; }
    dustCount() { return this.room ? this.room.entities.filter((e) => !e.dead && e.type === 'projectile' && e.kind === 'vesp_dust').length : 0; }
    setPose(name, rate) { if (POSES[name]) { this.want = name; this.poseRate = rate || 8; } }
    snapPose(name) { const P = POSES[name]; if (P) { for (const k of PKEYS) this.pz[k] = P[k]; this.want = name; } }
    /** Steer toward a point (centre) with arrival. Returns the distance. */
    glide(tx, ty, dt, speed, accel) {
      // repositioning never sweeps through the player: when her way runs past them at body height she climbs over
      const p = this.player;
      if (p && !p.dead && this.fightStarted) {
        const px = this.pcx(), py = this.pcy(), toward = (tx - this.cx) * (px - this.cx) > 0;
        const between = toward && Math.abs(tx - this.cx) > Math.abs(px - this.cx) - 120;
        // (clear of a full jump: her contact box bottom 290 - 50 px above their centre, the jump apex head ~213)
        if (between && Math.abs(px - this.cx) < 260 && this.cy > py - 250) ty = Math.min(ty, this.clampY(py - 290, 110, 140));
      }
      const dx = tx - this.cx, dy = ty - this.cy, d = Math.hypot(dx, dy);
      const sp = Math.min(speed, d * 3.4);
      const wx = d > 0.5 ? dx / d * sp : 0, wy = d > 0.5 ? dy / d * sp : 0;
      const a = (accel || 1400) * dt;
      this.vx = approach(this.vx, wx, a); this.vy = approach(this.vy, wy, a);
      return d;
    }
    /** Follow an exact path point (centre) this step. */
    track(tx, ty, dt) {
      this.vx = clamp((tx - this.cx) / dt, -2800, 2800);
      this.vy = clamp((ty - this.cy) / dt, -2800, 2800);
    }
    brake(dt, rate) { this.vx = approach(this.vx, 0, (rate || 1600) * dt); this.vy = approach(this.vy, 0, (rate || 1600) * dt); }
    /** A side of the player with room for `dist` px; keeps the current side unless it is blocked. */
    pickSide(dist) {
      const pc = this.pcx(), g = this.geom, m = 140;
      let side = this.cx >= pc ? 1 : -1;
      const fits = (s) => pc + s * dist >= g.L + m && pc + s * dist <= g.R - m;
      if (!fits(side) && fits(-side)) side = -side;
      this.side = side;
      return side;
    }
    station() {
      const pc = this.pcx(), pcy = this.pcy(), g = this.geom;
      const side = this.pickSide(360);
      return {
        x: this.clampX(pc + side * 360, 150),
        y: clamp(Math.min(g.floor - 290, pcy - 230), g.ceil + 120, g.floor - 200) + Math.sin(this.t * 1.25 + this.seed) * 16,
      };
    }
    scales(n, spread) {   // glittering scales shed from the wings
      if (!G.fx) return;
      for (let i = 0; i < n; i++) {
        const a = rnd(0, TAU), d = rnd(20, spread || 150);
        G.fx.spawn({ x: this.cx + Math.cos(a) * d, y: this.cy + Math.sin(a) * d * 0.6, vx: rnd(-40, 40), vy: rnd(-20, 50), life: rnd(0.8, 1.6), size: rnd(1.5, 3.2), color: Math.random() < 0.5 ? PAL.band : PAL.glow, alpha: 0.85, gravity: 40, drag: 0.8, add: true });
      }
    }
    darkPulse(sec) { this.darkT = Math.max(this.darkT, sec); }

    // ---------------------------------------------------------------- fight start
    onFightStart() { this.wakeT = 0; }
    introUpdate(dt) {
      this.face();
      if (!this.fightStarted || this.wakeT < 0) {
        // woken by the intruder: she lifts her head, unfurls and drifts down from the throne while she speaks
        const w = (this.introT = (this.introT || 0) + dt);
        this.setPose(w < 0.8 ? 'rest' : 'glide', w < 0.8 ? 3 : 2.2);
        this.eyeWant = w < 0.5 ? 0.15 : 0.55;
        if (w > 0.8 && this.geom) this.glide(this.clampX(this.home.x - 160), this.geom.floor - 330, dt, 150, 260);
        else this.brake(dt);
        this.rotWant = clamp(this.vx / 1500, -0.2, 0.2);
        return;
      }
      const w = (this.wakeT += dt);
      if (w < 0.35) { this.setPose('rest', 4); this.eyeWant = 0.6; this.brake(dt); }
      else {
        if (!this._cried) {
          this._cried = true;
          G.sfxAt('vesp_cry', this.cx, { vol: 1 });
          if (G.game) G.game.shake(6, 0.6);
          if (G.Audio && G.Audio.duck) G.Audio.duck(0.3, 1.2);
          this.scales(26, 200);
          if (G.fx) G.fx.burst('ring', this.cx, this.cy, { r: 240, color: PAL.glow, width: 4, life: 0.6 });
        }
        this.setPose(w < 1.0 ? 'flare' : 'hover', w < 1.0 ? 9 : 5);
        this.eyeWant = w < 1.0 ? 1.1 : 0.45;
        if (w > 0.9) { const s = this.station(); this.glide(s.x, s.y, dt, 240, 500); } else this.brake(dt);
      }
    }

    // ---------------------------------------------------------------- scheduler hooks
    think(dt) {
      if (this.contactOff > 0) this.contactOff -= dt;
      if (this.state === 'idle' && this.phaseQueued) { this.phaseQueued = false; this.startAttack('ascend'); }
      super.think(dt);
      this.animate(dt);
    }
    /** A mothling is glowing, darting or has only just landed: she does not start an attack on top of it. */
    mothBusy() {
      return !!this.room && this.room.entities.some((e) => !e.dead && !e.dying && e.kind === 'vespertine_moth' && (e.state === 'aim' || e.state === 'dart' || (e.state === 'recover' && e.stateTime < 0.3)));
    }
    idleUpdate(dt) {
      // (at most 1.2 s per pause: the mothlings in turn hold off for her whole swoop/gust/dash, see packBusy)
      if (this.stateTime >= this.restTime - 0.05 && (this._mothWait || 0) < 1.2 && this.mothBusy()) { this.restTime = this.stateTime + 0.1; this._mothWait = (this._mothWait || 0) + dt; }
      this.face();
      const s = this.station();
      this.glide(s.x, s.y, dt, 300, 900);
      this.setPose('hover', 5);
      this.eyeWant = this.phase >= 2 ? 0.75 : 0.45;               // phase 2: her eye-spots burn
      this.rotWant = clamp(this.vx / 1500, -0.3, 0.3);
    }
    onAttackStart() { this.rotWant = 0; this._mothWait = 0; }
    onPhase(phase) {
      if (phase < 2) return;
      if (G.Audio && typeof G.Audio.musicLayer === 'function') G.Audio.musicLayer(1);
      if (this.state === 'stagger') { this.phaseQueued = true; return; }
      this.startAttack('ascend');
    }
    onInterrupt() { this.rotWant = 0; }
    onStagger() {
      this.vx = clamp(this.vx * 0.3, -260, 260); this.vy = clamp(this.vy, -200, 300);   // a stagger mid-dash/-dive does not skid on across the bower
      this.setPose('droop', 6);
      this.eyeWant = 0.1;
      this.scales(20, 160);
      G.sfxAt('vesp_wings', this.cx, { vol: 0.9, pitch: 0.7 });
    }
    staggerUpdate(dt) {
      this.vx = approach(this.vx, 0, 900 * dt);
      if (!this.grounded) { this.vy = approach(this.vy, 700, 1600 * dt); this.rotWant = 0.35 * this.facing; }
      else {
        if (!this._staggerLanded) {
          this._staggerLanded = true;
          if (G.fx) { G.fx.burst('dust', this.cx, this.y + this.h, { count: 12, color: PAL.dustLight }); G.fx.burst('smoke', this.cx, this.y + this.h - 10, { count: 5, color: PAL.dustMid, alpha: 0.4, size: 18 }); }
          G.sfxAt('hardland', this.cx, { vol: 0.6, pitch: 0.8 });
          if (G.game) G.game.shake(5, 0.3);
        }
        this.vy = 0; this.setPose('fallen', 5); this.rotWant = 0.18 * this.facing;
      }
      this.asym = Math.sin(this.t * 3) * 0.12;
    }
    onStaggerEnd() {
      this._staggerLanded = false;
      this.asym = 0;
      this.contactOff = 0.6;
      this.vy = -260;
      this.scales(14, 140);
      G.sfxAt('vesp_wings', this.cx, { vol: 0.8 });
    }

    // ---------------------------------------------------------------- per-step animation & world effects
    animate(dt) {
      const tgt = POSES[this.want] || POSES.hover;
      const prevPhi = this.pz.phi;
      for (const k of PKEYS) this.pz[k] = damp(this.pz[k], tgt[k], this.poseRate, dt);
      this.pz.phi = (this.pz.phi + this.pz.hz * TAU * dt) % (TAU * 1000);
      // a soft wing-beat sound on each big downstroke
      if (!this.dying && this.pz.amp > 0.3 && this.pz.hz < 3 && Math.floor(this.pz.phi / TAU) !== Math.floor(prevPhi / TAU)) {
        const p = this.player;
        if (p && Math.abs(this.pcx() - this.cx) < 900) G.sfxAt('vesp_wings', this.cx, { vol: 0.32 * this.pz.amp });
      }
      this.rot = damp(this.rot, this.rotWant, 7, dt);
      this.eyeBoost = Math.max(0, this.eyeBoost - dt * 1.2);
      const eyeW = Math.max(this.eyeWant, this.darkK * 0.85) + this.eyeBoost;
      this.eyeGlow = damp(this.eyeGlow, eyeW, 7, dt);
      this.flameK = damp(this.flameK, this.dying ? 0.12 : (0.55 + 0.45 * Math.min(1, this.eyeGlow)) * (this.phase >= 2 ? 1.3 : 1), 3, dt);
      this.look = damp(this.look, this.player ? clamp(this.dx() / 60, -4, 4) : 0, 4, dt);
      // darkness pulse (dust): deepen the room's darkness while it lasts
      if (this.darkT > 0) this.darkT -= dt;
      this.darkK = damp(this.darkK, this.darkT > 0 ? 1 : 0, this.darkT > 0 ? 2.2 : 1.0, dt);
      if (this.room) this.room.dark = this.darkK > 0.002 ? this.baseDark + (Math.max(this.baseDark, DARK_MAX) - this.baseDark) * this.darkK : this.baseDark;
      // in her darkness the eye-spots burn brighter: she stays readable while the bower dims
      if (this.darkK > 0.02 && G.lighting && !this.dying && !this.hidden) G.lighting.add({ x: this.cx, y: this.cy, r: 260, color: PAL.glow, intensity: 0.4 * this.darkK });
      // dust motes shed from the wings
      if (G.fx && !this.dying && this.fightStarted && Math.random() < dt * (this.phase >= 2 ? 11 : 5)) this.scales(1, 170);
    }
    update(dt) {
      super.update(dt);
      this.camUpdate(dt);
    }
    updateDeath(dt) {
      super.updateDeath(dt);
      if (!this.dead) this.animate(dt);
    }
    restoreWorld() {
      if (this.room && typeof this.baseDark === 'number') this.room.dark = this.baseDark;
      this.darkT = 0; this.darkK = 0;
    }
    remove() {
      this.restoreWorld();
      this.releaseCam();
      super.remove();
    }
    onRoomExit() {
      this.restoreWorld();
      this.releaseCam();
      super.onRoomExit();
    }

    // ---------------------------------------------------------------- camera
    // The bower is two screens wide and a screen and a half tall. While her intro lines are open the view pans to her
    // throne (the player is held by the dialogue); during the fight the camera follows a stand-in for the player shifted
    // toward her (<= 400 px across, <= 160 px up) so her wind-ups are seen, never only their results.
    camUpdate(dt) {
      const cam = G.camera, p = G.game && G.game.player;
      if (!cam || typeof cam.follow !== 'function' || !p || p.dead || (p.room && p.room !== this.room)) return;
      if (!this.arena && !this.fightStarted) return;
      const pcx = p.x + p.w / 2, pcy = p.y + p.h / 2;
      let wx = 0, wy = 0;
      if (this._finished || this.dead) { wx = 0; wy = 0; }
      else if (this._dialogueOpen && !this.fightStarted) { wx = clamp(this.cx - 160 - pcx, -CAMB.intro, CAMB.intro); wy = clamp((this.cy - pcy) * 0.5, -CAMB.y, 0); }
      else if (!this.dying) {
        wx = clamp((this.cx - pcx) * 0.5, -CAMB.x, CAMB.x);
        wy = clamp((this.cy - pcy) * 0.45, -CAMB.y, 0);
      }
      this.camBX = damp(this.camBX, wx, this._dialogueOpen ? 2.2 : 2.6, dt);
      this.camBY = damp(this.camBY, wy, 2.6, dt);
      if (!this._cam) {
        const self = this, pl = () => (G.game && G.game.player) || null;
        this._cam = {
          isVespertineCam: true,
          get x() { const q = pl(); return q ? q.x + (self.camBX || 0) : 0; },
          get y() { const q = pl(); return q ? q.y + (self.camBY || 0) : 0; },
          get w() { const q = pl(); return q ? q.w : 26; },
          get h() { const q = pl(); return q ? q.h : 54; },
          get motor() { const q = pl(); return q ? q.motor : null; },
          get facing() { const q = pl(); return q ? q.facing : 1; },
          get vx() { const q = pl(); return q ? q.vx || 0 : 0; },
          get vy() { const q = pl(); return q ? q.vy || 0 : 0; },
          get room() { const q = pl(); return q ? q.room : null; },
        };
      }
      if (cam.target === p) cam.follow(this._cam);
      if (this._finished && Math.abs(this.camBX) < 2 && Math.abs(this.camBY) < 2) this.releaseCam();
    }
    releaseCam() {
      if (this._cam && G.camera && G.camera.target === this._cam) G.camera.follow(G.game && G.game.player);
    }

    // ---------------------------------------------------------------- the wind (gust)
    pushPlayer(dir, dt, top) {
      const p = this.player, m = p && p.motor;
      if (!m || p.dead || !this.room || !this.targetable(p)) return;
      const pc = p.x + p.w / 2;
      if ((pc - this.cx) * dir < -30) return;                         // behind her: calm
      if (p.y + p.h < top) return;                                    // above the gust
      const far = Math.abs(pc - this.cx);
      const k = far < 1400 ? 1 : 0.7;
      G.Physics.move(m, this.room, dir * PUSH * k * dt, 0);
      p.x = m.x; p.y = m.y;
    }

    // ================================================================ attacks
    /** Swoop start point: high, 460 px beside the player on the open side. */
    swoopRise(d) {
      const side = this.pickSide(SW_MAX);
      d.ax = this.clampX(this.pcx() + side * SW_MAX); d.ay = this.clampY(this.pcy() - 290, 110, 260);
    }
    /** Space beyond the player (on the far side from her open side) for a swoop's climb-out. */
    swoopRoom() {
      const pc = this.pcx(), g = this.geom;
      const fits = (s) => pc + s * SW_MAX >= g.L + 140 && pc + s * SW_MAX <= g.R - 140;
      let side = this.cx >= pc ? 1 : -1;
      if (!fits(side) && fits(-side)) side = -side;
      return side > 0 ? pc - (g.L + SW_EDGE) : (g.R - SW_EDGE) - pc;
    }
    // swoop: rise to a high point beside the player -> wings fold back (telegraph) -> a deep arc through the player.
    atk_swoop(dt, s) {
      const d = this.stateData;
      if (!d.stage) {
        d.stage = 'rise'; d.n = 0; d.t0 = s;
        this.swoopRise(d);
      }
      switch (d.stage) {
        case 'rise': {
          this.setPose('glide', 6); this.face();
          const dist = this.glide(d.ax, d.ay, dt, 780, 2400);
          this.rotWant = clamp(this.vx / 1600, -0.4, 0.4);
          if (dist < 28 || s - d.t0 > 1.4) { d.stage = 'tele'; d.t0 = s; }
          break;
        }
        case 'tele': {
          if (!d.w) {
            d.w = this.telegraph(d.n ? TELE.swoopChain : this.phase >= 2 ? TELE.swoop2 : TELE.swoop, { color: PAL.tele, sound: 'vesp_swoop', vol: 1, shake: 1.2 });
            d.locked = false; this.eyeBoost = 0.7;
          }
          const u = s - d.t0;
          this.face(); this.brake(dt, 2400);
          this.vy = -40 * (1 - u / d.w);                              // a small lift before the plunge
          this.setPose('dart', 7);
          const dir = Math.sign(this.pcx() - this.cx) || 1;
          this.rotWant = dir * 0.55;
          if (!d.locked && u >= d.w - 0.12) {
            d.locked = true;
            const py = clamp(this.dashAimY() + 4, this.geom.ceil + 200, this.geom.floor - BH / 2 - 6);   // a jumping player is swept at standing height: jump it
            // the arc is symmetric about its bottom and must climb out with room to spare: near a wall the bottom is
            // pulled short of the player (she will not fly into the wall), so a player jumping over her is never met
            // by her climb-out (cornered: she cuts off the way out instead of hitting the corner)
            const lo = this.geom.L + SW_EDGE, hi = this.geom.R - SW_EDGE, pc = this.pcx(), dir = Math.sign(pc - this.cx) || 1;
            const room = dir > 0 ? hi - pc : pc - lo;                 // space beyond the player for her climb-out
            let px = pc;
            d.cut = room < SW_CORNER;
            if (d.cut) px = (this.cx + pc - dir * SW_CUT) / 2;        // cornered since the rise: the whole arc stays in front of them
            d.A = { x: this.cx, y: this.cy };
            d.E = { x: 2 * px - this.cx, y: this.cy };                // (virtual when the climb-out is compressed)
            // near a wall the second half is compressed: she sweeps on low past the player, then climbs steeply in
            // the room that is left (never back up through a player who jumped over her)
            d.R = !d.cut && room < Math.abs(px - this.cx) ? room : 0;
            d.dir = dir;
            d.C = { x: 2 * px - (d.A.x + d.E.x) / 2, y: 2 * py - (d.A.y + d.E.y) / 2 };
            d.P = { x: px, y: py };
            // a long, graceful plunge: she reaches the bottom 0.55-0.63 s after the dive begins, so a jump made on
            // seeing her drop (0.2-0.3 s reaction) clears her
            const len = Math.hypot(d.E.x - d.A.x, (py - d.A.y) * 2);
            d.dur = d.cut ? clamp(len / 950, 0.8, 1.1) : this.phase >= 2 ? clamp(len / 950, 1.2, 1.3) : clamp(len / 900, 1.26, 1.38);
          }
          if (u >= d.w) { d.stage = 'dive'; d.t0 = s; G.sfxAt('vesp_dive', this.cx, { vol: 1 }); this.scales(10, 120); }
          break;
        }
        case 'dive': {
          const tau = clamp((s - d.t0) / d.dur, 0, 1);
          const u = tau - 0.55 * Math.sin(TAU * tau) / TAU;           // slow at the ends, fastest at the bottom
          const iu = 1 - u;
          let qx = iu * iu * d.A.x + 2 * iu * u * d.C.x + u * u * d.E.x, qy = iu * iu * d.A.y + 2 * iu * u * d.C.y + u * u * d.E.y;
          if (d.R && u > 0.5) {                                       // compressed climb-out: same speed at the bottom,
            const w = Math.abs(d.P.x - d.A.x), k = (u - 0.5) * 2;     // a shorter run, then a steep rise to the start height
            const e = 1 - Math.pow(1 - k, w / (2 * d.R));
            qx = d.P.x + d.dir * d.R * (1 - (1 - e) * (1 - e));
            qy = d.P.y - e * e * (d.P.y - d.A.y);
          }
          this.track(qx, qy, dt);
          this.rotWant = clamp(Math.atan2(this.vy, this.vx) + Math.PI / 2, -1.25, 1.25);
          if (Math.abs(this.rotWant) > 1.2 && Math.abs(this.vx) < 50) this.rotWant = 0;
          this.setPose('dart', 10);
          this.strike(this.bodyRect(), { id: 'swoop' + this.uid + ':' + d.n, dir: { x: Math.sign(this.vx) || 1, y: 0 } });
          if (G.fx && Math.random() < dt * 40) this.scales(1, 60);
          if (tau >= 1) {
            if (this.phase >= 2 && d.n < 1 && this.swoopRoom() >= SW_CORNER) {   // phase 2: wheels round for a second pass
              d.n++; d.stage = 'rise'; d.t0 = s; d.w = 0; this.vx *= 0.3; this.vy *= 0.3;
              this.swoopRise(d);
            }
            else { d.stage = 'recover'; d.t0 = s; d.rx = this.cx; d.ry = this.clampY(this.pcy() - 170, 140, 150); }
          }
          break;
        }
        case 'recover': {                                             // banks, hovers low and catches her breath
          this.setPose('hover', 5); this.eyeWant = 0.3; this.face();
          this.glide(d.rx, d.ry, dt, 260, 1500);
          this.rotWant = clamp(this.vx / 1500, -0.3, 0.3);
          if (s - d.t0 > 0.75) { this.endAttack(); return; }
          break;
        }
        default: break;
      }
      if (s > 8) this.endAttack();
    }

    // gust: hover low beside the player -> wings drawn far back (telegraph) -> a beat: wind + a roll of dust on the floor.
    atk_gust(dt, s) {
      const d = this.stateData;
      if (!d.stage) {
        d.stage = 'move'; d.t0 = s; d.beats = 0;
        const side = this.pickSide(420);
        d.hx = this.clampX(this.pcx() + side * 420); d.hy = this.playerLow() ? this.geom.floor - 196 : this.clampY(this.pcy() - 70, 140, 160);
      }
      switch (d.stage) {
        case 'move': {
          this.setPose('glide', 6); this.face();
          const dist = this.glide(d.hx, d.hy, dt, 720, 2200);
          this.rotWant = clamp(this.vx / 1600, -0.35, 0.35);
          if (dist < 26 || s - d.t0 > 1.1) { d.stage = 'tele'; d.t0 = s; }
          break;
        }
        case 'tele': {
          if (!d.w) {
            d.dir = Math.sign(this.pcx() - this.cx) || this.facing;
            d.w = this.telegraph(d.beats ? TELE.gust2 : TELE.gust, { color: PAL.tele, sound: 'vesp_inhale', vol: 1, shake: 0.8 });
            this.eyeBoost = 0.5;
          }
          this.facing = d.dir; this.brake(dt, 2000);
          this.setPose('raise', 9);
          this.rotWant = -d.dir * 0.22;                               // leans back
          if (G.fx && Math.random() < dt * 30) {                      // air and dust drawn in under the wings
            const a = rnd(0, TAU), r = rnd(160, 260);
            const x = this.cx + Math.cos(a) * r, y = this.cy + Math.sin(a) * r * 0.7;
            G.fx.spawn({ x, y, vx: (this.cx - x) * 2.2, vy: (this.cy - y) * 2.2, life: 0.4, size: rnd(1.5, 3), color: PAL.band, alpha: 0.8, add: true });
          }
          if (s - d.t0 >= d.w) {
            d.stage = 'blow'; d.t0 = s; d.beats++;
            this.snapPose('beat');
            this.rotWant = d.dir * 0.12;
            G.sfxAt('vesp_gust', this.cx, { vol: 1.1 });
            if (G.game) G.game.shake(7, 0.45);
            // the roll of dust is for a player on the floor; one on a silk platform only gets the wind (it can blow
            // them off, but never into a roll they could not see coming while they fell)
            if (this.room && this.player && this.geom.floor - (this.player.y + this.player.h) < 200) G.spawnProjectile(this.room, 'vesp_roll', { x: this.cx + d.dir * 90, y: this.geom.floor, dir: d.dir, speed: 500, w: 64, h: 50, owner: this, color: PAL.glowDeep });
            if (G.fx) G.fx.burst('ring', this.cx + d.dir * 60, this.cy, { r: 160, color: PAL.band, width: 3, life: 0.35 });
          }
          break;
        }
        case 'blow': {
          const u = s - d.t0;
          this.setPose(u < 0.3 ? 'beat' : 'hover', u < 0.3 ? 12 : 5);
          this.brake(dt, 1200);
          if (u < 0.15) this.vx = -d.dir * 90;                       // a little recoil from the beat
          const top = this.cy - 260;
          if (u < 1.25) {
            this.pushPlayer(d.dir, dt, top);
            if (G.fx && Math.random() < dt * 80) {                    // wind streaks across the band
              const y = rnd(top, this.geom.floor - 6);
              G.fx.spawn({ x: this.cx + d.dir * rnd(60, 300), y, vx: d.dir * rnd(1100, 1600), vy: rnd(-12, 12), life: rnd(0.3, 0.55), size: rnd(1.6, 2.6), size2: 0.5, color: '#efe6ff', alpha: 0.5, shape: 'line', add: true });
            }
          }
          const second = this.phase >= 2 && d.beats < 2;
          if (second && u >= 0.6) { d.stage = 'tele'; d.t0 = s; d.w = 0; break; }
          if (!second && u >= 1.25) { d.stage = 'recover'; d.t0 = s; }
          break;
        }
        case 'recover': {                                             // wings low, spent: punishable
          this.setPose('droop', 5); this.eyeWant = 0.25;
          this.vx = approach(this.vx, 0, 800 * dt);
          this.vy = approach(this.vy, 30, 600 * dt);
          this.rotWant = 0;
          if (s - d.t0 > 0.75) { this.endAttack(); return; }
          break;
        }
        default: break;
      }
      if (s > 7) this.endAttack();
    }

    // dust: rise above the player -> wings wrapped, humming (telegraph) -> flings them open: darkness + dust clouds.
    atk_dust(dt, s) {
      const d = this.stateData;
      if (!d.stage) {
        d.stage = 'rise'; d.t0 = s;
        const side = this.pickSide(240);
        d.hx = this.clampX(this.pcx() + side * 240, 200); d.hy = this.clampY(this.pcy() - 320, 120, 300);
      }
      switch (d.stage) {
        case 'rise': {
          this.setPose('glide', 6); this.face();
          const dist = this.glide(d.hx, d.hy, dt, 700, 2000);
          this.rotWant = clamp(this.vx / 1600, -0.35, 0.35);
          if (dist < 26 || s - d.t0 > 1.1) { d.stage = 'tele'; d.t0 = s; }
          break;
        }
        case 'tele': {
          if (!d.w) { d.w = this.telegraph(TELE.dust, { color: PAL.tele, sound: 'vesp_hum', vol: 1, shake: 1 }); }
          this.brake(dt, 2000); this.face();
          this.setPose('wrap', 7); this.eyeWant = 0.05; this.rotWant = 0;
          if (G.fx && Math.random() < dt * 40) {                      // motes gather into her
            const a = rnd(0, TAU), r = rnd(120, 220);
            const x = this.cx + Math.cos(a) * r, y = this.cy + Math.sin(a) * r;
            G.fx.spawn({ x, y, vx: (this.cx - x) * 2.4, vy: (this.cy - y) * 2.4, life: 0.38, size: rnd(1.5, 3), color: PAL.dustLight, alpha: 0.85, add: true });
          }
          if (s - d.t0 >= d.w) { d.stage = 'burst'; d.t0 = s; this.release(); }
          break;
        }
        case 'burst': {
          this.setPose(s - d.t0 < 0.35 ? 'flare' : 'hover', 10); this.eyeWant = 0.8;
          this.brake(dt, 1200);
          if (s - d.t0 > 0.9) { this.endAttack(); return; }
          break;
        }
        default: break;
      }
      if (s > 6) this.endAttack();
    }
    release() {
      G.sfxAt('vesp_dust', this.cx, { vol: 1.1 });
      if (G.game) { G.game.shake(5, 0.4); G.game.flash('rgba(20,10,40,0.35)', 0.25); }
      if (G.fx) { G.fx.burst('smoke', this.cx, this.cy, { count: 14, color: PAL.dustMid, alpha: 0.5, size: 26, speed: 200 }); }
      this.scales(24, 200);
      const p = this.player, room = this.room;
      if (!room) return;
      const pc = this.pcx(), g = this.geom;
      const grounded = !!(p && p.motor && p.motor.onGround) || this.playerLow();
      const ty = grounded && this.playerLow() ? g.floor - 64 : clamp(this.pcy(), g.ceil + 90, g.floor - 64);
      const offs = [-300, 0, 300];
      if (this.phase >= 2) offs.push((Math.random() < 0.5 ? -1 : 1) * 600);
      const xs = [];
      for (const o of offs) {
        const x = clamp(pc + o, g.L + 70, g.R - 70);
        if (xs.some((q) => Math.abs(q - x) < 200)) continue;
        xs.push(x);
      }
      const T = { travel: 0.5, warn: 0.8, active: 3.0 };
      for (let i = 0; i < xs.length; i++) {
        G.spawnProjectile(room, 'vesp_dust', { x: this.cx, y: this.cy, tx: xs[i], ty, R: 78, owner: this, travel: T.travel + i * 0.04, warn: T.warn, active: T.active });
      }
      this.darkPulse(T.travel + T.warn + T.active + 0.4);
    }

    // brood: hover beside the player -> wings quiver, chittering (telegraph) -> moths peel off her eye-spots.
    atk_brood(dt, s) {
      const d = this.stateData;
      if (!d.stage) {
        d.stage = 'move'; d.t0 = s;
        const side = this.pickSide(360);
        d.hx = this.clampX(this.pcx() + side * 360); d.hy = this.clampY(this.pcy() - 250, 120, 220);
      }
      switch (d.stage) {
        case 'move': {
          this.setPose('glide', 6); this.face();
          const dist = this.glide(d.hx, d.hy, dt, 640, 2000);
          this.rotWant = clamp(this.vx / 1600, -0.35, 0.35);
          if (dist < 30 || s - d.t0 > 0.9) { d.stage = 'tele'; d.t0 = s; }
          break;
        }
        case 'tele': {
          if (!d.w) { d.w = this.telegraph(TELE.brood, { color: PAL.tele, sound: 'vesp_brood', vol: 1, shake: 0.6 }); }
          this.brake(dt, 2000); this.face(); this.rotWant = 0;
          this.setPose('quiver', 10);
          this.eyeWant = 0.7 + 0.5 * Math.abs(Math.sin((s - d.t0) * 18));
          if (s - d.t0 >= d.w) {
            d.stage = 'recover'; d.t0 = s;
            const n = Math.max(0, Math.min(2, this.mothCap() - this.liveMinions()));   // two per brood; cap 2 (P1) / 3 (P2)
            const spots = eyeSpots(this.cx, this.cy, this.pz, this.rot).sort(() => Math.random() - 0.5);
            for (let i = 0; i < n; i++) {
              const e = spots[i % spots.length];
              const m = this.summon('vespertine_moth', e.x, e.y, { ox: e.x - this.cx, oy: e.y - this.cy, idx: i });
              if (m && G.fx) G.fx.burst('ring', e.x, e.y, { r: 40, color: PAL.glow, width: 2, life: 0.3 });
            }
            this.eyeBoost = 0.8;
          }
          break;
        }
        case 'recover': {
          this.setPose('hover', 5); this.eyeWant = 0.3; this.brake(dt, 1000);
          if (s - d.t0 > 0.7) { this.endAttack(); return; }
          break;
        }
        default: break;
      }
      if (s > 5) this.endAttack();
    }

    // dash (phase 2): level with the player -> wings swept into blades, aim line, lock flash -> straight dash. 2-3 times.
    atk_dash(dt, s) {
      const d = this.stateData;
      if (!d.stage) { d.stage = 'move'; d.t0 = s; d.n = 0; d.max = this.hp < this.maxHp * 0.25 ? 3 : 2; this.dashSpot(d); }
      switch (d.stage) {
        case 'move': {
          this.setPose('glide', 6); this.face();
          if (d.via && d.lift != null) {                              // crossing: first straight up beside them (never
            this.glide(d.liftX, d.lift, dt, 1000, 2800);              // diagonally across a player still in the air) ...
            if (this.cy < d.lift + 60) d.lift = null;
          }
          else if (d.via) {                                           // ... then high over them
            if (this.glide(d.via.x, d.via.y, dt, 1000, 2800) < 90) d.via = null;
          }
          const dist = d.via ? 999 : this.glide(d.hx, d.hy, dt, 900, 2600);
          this.rotWant = clamp(this.vx / 1600, -0.35, 0.35);
          if (dist < 30 || s - d.t0 > (d.cross ? 2.2 : d.n ? 0.45 : 1.0)) { d.stage = 'tele'; d.t0 = s; d.w = 0; d.via = null; }
          break;
        }
        case 'tele': {
          if (!d.w) { d.w = this.telegraph(d.n ? TELE.dashChain : TELE.dash, { color: PAL.tele, sound: 'vesp_blade', vol: 1, shake: 1.4 }); d.locked = false; this.eyeBoost = 1; }
          const u = s - d.t0;
          this.face();
          // holds her line, settling level with the target - and backing off to her run-up distance if a late
          // arrival (or a player walking in) left her closer than DASH_RUN: a short run-up leaves no time to jump it
          const rdx = this.cx - this.pcx(), runX = this.clampX(this.pcx() + (Math.sign(rdx) || this.facing) * DASH_RUN);
          const backOff = !d.locked && Math.abs(rdx) < DASH_RUN - 60 && Math.abs(runX - this.cx) > 20;
          this.vx = approach(this.vx, backOff ? clamp((runX - this.cx) * 5, -700, 700) : 0, 2600 * dt);
          if (!d.locked) d.hy = this.clampY(this.dashAimY() - 12, 120, BH / 2 + 4);
          this.vy = approach(this.vy, d.locked ? 0 : clamp((d.hy - this.cy) * 6, -520, 520), 2600 * dt);
          this.setPose('blade', 9);
          if (!d.locked) {
            let ax = this.pcx() - this.cx, ay = this.dashAimY() - this.cy;
            let a = clamp(Math.atan2(ay, Math.abs(ax)), -0.6, 0.6); const sx = Math.sign(ax) || this.facing;
            if (this.y + this.h + Math.max(0, Math.tan(a)) * Math.abs(ax) > this.geom.floor - 2) a = Math.min(a, 0);   // never ploughs into the floor: skims it
            d.ux = Math.cos(a) * sx; d.uy = Math.sin(a);
            // still settling into line (e.g. arriving late from a high crossing arc): hold the wind-up (up to
            // 0.5 s) instead of locking a dash at mid height - too high to jump, aimed through a jumping player
            if (u >= d.w - DASH_LOCK && (Math.abs(this.cy - d.hy) > 14 || backOff) && d.w < (d.n ? TELE.dashChain : TELE.dash) + 0.5) {
              d.w += dt; if (this.tele) this.tele.dur += dt;
            }
            if (u >= d.w - DASH_LOCK) { d.locked = true; G.sfxAt('vesp_moth', this.cx, { vol: 0.6, pitch: 0.7 }); }
          }
          this.rotWant = Math.atan2(d.uy, d.ux) + Math.PI / 2;
          if (u >= d.w) {
            d.stage = 'go'; d.t0 = s; d.sx = this.cx; d.sy = this.cy;
            d.len = Math.min(1250, Math.hypot(this.pcx() - this.cx, this.pcy() - this.cy) + 420);
            // a player at the floor with no room behind them for her to pass (a corner): she checks her dash short of
            // them instead of pinning them against the wall (she would come to rest under a player jumping over her)
            const pc = this.pcx(), sx = Math.sign(d.ux) || 1, g = this.geom;
            const beyond = sx > 0 ? (g.R - BW / 2) - pc : pc - (g.L + BW / 2);
            d.short = Math.abs(d.uy) < 0.2 && this.dashAimY() > g.floor - 100 && beyond < DASH_PASS;
            if (d.short) d.len = Math.max(40, Math.abs(pc - this.cx) - DASH_SHORT);
            G.sfxAt('vesp_dash', this.cx, { vol: 1.1 });
            if (G.game) G.game.shake(4, 0.25);
          }
          break;
        }
        case 'go': {
          this.vx = d.ux * 1500; this.vy = d.uy * 1500;
          this.setPose('blade', 12);
          this.strike(this.bodyRect(), { id: 'dash' + this.uid + ':' + d.n, dir: { x: Math.sign(d.ux) || 1, y: 0 } });
          if (G.fx) for (let i = 0; i < 2; i++) G.fx.spawn({ x: this.cx + rnd(-30, 30), y: this.cy + rnd(-30, 30), vx: -d.ux * 120, vy: -d.uy * 120 + rnd(-20, 20), life: rnd(0.3, 0.6), size: rnd(2, 4), color: PAL.band, alpha: 0.85, add: true });
          const gone = Math.hypot(this.cx - d.sx, this.cy - d.sy);
          const blocked = this.wallHit || this.ceilHit || (this.grounded && d.uy > 0.05);
          if (gone >= d.len || blocked || s - d.t0 > 0.9) {
            this.vx *= d.short ? 0.05 : 0.25; this.vy *= 0.25;
            if (d.short && G.fx) { G.fx.burst('ring', this.cx + d.ux * 60, this.cy, { r: 70, color: PAL.glow, width: 3, life: 0.3 }); this.scales(12, 90); }
            if (blocked && G.fx) G.fx.burst('dust', this.cx + d.ux * 50, this.cy + d.uy * 50, { count: 8, color: PAL.dustLight });
            d.n++;
            if (d.n < d.max) { d.stage = 'move'; d.t0 = s; d.locked = false; this.dashSpot(d); }
            else { d.stage = 'recover'; d.t0 = s; }
          }
          break;
        }
        case 'recover': {                                             // brakes, wings drooping, hovering just above head height
          this.setPose('droop', 5); this.eyeWant = 0.25;
          this.vx = approach(this.vx, 0, 1400 * dt);
          this.vy = approach(this.vy, clamp((this.geom.floor - DASH_REST - this.cy) * 5, -320, 60), 1400 * dt);
          this.rotWant = 0;
          if (s - d.t0 > 0.85) { this.endAttack(); return; }
          break;
        }
        default: break;
      }
      if (s > 9) this.endAttack();
    }
    /** Height her dash and swoop aim at: a player on or just above the floor (within a plain jump) is aimed at standing
     *  height, so both skim the floor there and a jump clears them; higher targets (platforms, wings) are aimed at. */
    dashAimY() {
      const p = this.player;
      if (p && this.geom.floor - (p.y + p.h) < 200) return this.geom.floor - p.h / 2;
      return this.pcy();
    }
    dashSpot(d) {
      const pc = this.pcx(), was = Math.sign(this.cx - pc) || 1;
      const side = this.pickSide(500);
      d.hx = this.clampX(pc + side * 500);
      d.hy = this.clampY(this.dashAimY() - 12, 120, BH / 2 + 4);
      d.cross = side !== was && Math.abs(this.cx - pc) < 900;
      d.via = d.cross ? { x: pc, y: this.clampY(this.pcy() - 330, 110, 300) } : null;
      d.lift = d.cross && this.cy > d.via.y + 60 && Math.abs(this.cx - pc) < 260 ? d.via.y : null;
      d.liftX = this.cx;
    }

    // ascend (phase 2 transition, uninterruptible): she gathers herself above the player and flares.
    atk_ascend(dt, s) {
      const d = this.stateData;
      if (!d.init) {
        d.init = true;
        this.contactOff = Math.max(this.contactOff, 1.0);           // the transition is a moment, not an ambush
        if (G.clearProjectiles) G.clearProjectiles(this.room);
        d.hx = this.clampX(this.pcx(), 300); d.hy = this.clampY(this.pcy() - 310, 130, 300);
      }
      if (s < 0.95) {
        this.glide(d.hx, d.hy, dt, 650, 2000);
        this.setPose('wrap', 6); this.eyeWant = 0.1; this.rotWant = 0;
      } else {
        if (!d.flared) {
          d.flared = true;
          this.snapPose('flare'); this.eyeBoost = 1.2;
          G.sfxAt('vesp_cry', this.cx, { vol: 1.2, pitch: 0.92 });
          if (G.game) { G.game.shake(10, 0.8); G.game.flash('rgba(214,190,255,0.5)', 0.25); }
          if (G.Audio && G.Audio.duck) G.Audio.duck(0.35, 1.4);
          if (G.fx) {
            G.fx.burst('ring', this.cx, this.cy, { r: 360, color: PAL.glow, width: 6, life: 0.7 });
            G.fx.burst('ring', this.cx, this.cy, { r: 220, color: '#ffffff', width: 3, life: 0.45 });
          }
          this.scales(50, 260);
          this.darkPulse(1.4);
        }
        this.brake(dt, 1500);
        this.setPose(s < 1.9 ? 'flare' : 'hover', 6);
        this.eyeWant = 0.9;
      }
      if (s > 2.4) this.endAttack(0.5);
    }

    // ---------------------------------------------------------------- defeat
    onDefeatStart() {
      this.setPose('droop', 4);
      this.eyeWant = 0.2;
      this.darkT = 0;
      this.rotWant = 0;
      this.asym = 0;
    }
    /** Defeat drift: she sinks gently (slow-mo, lines), then settles on the floor. */
    settle(dt) {
      if (!this.room) return;
      const sink = this.defeatStage === 'custom' ? 190 : 70;
      this.vy = approach(this.vy, sink, 500 * dt);
      this.vx = approach(this.vx, 0, 900 * dt);
      const r = G.Physics.move(this, this.room, this.vx * dt, this.vy * dt);
      if (r.hitY > 0) { this.vy = 0; this.onFloor = true; }
    }
    onDefeatSequence(dt, s) {
      if (!this._released) {
        this._released = true;
        G.sfxAt('vesp_release', this.cx, { vol: 1.1 });
        if (G.Audio && G.Audio.duck) G.Audio.duck(0.4, 3);
      }
      this.setPose(this.onFloor ? 'fallen' : 'droop', 3);
      this.eyeWant = 0;
      this.rotWant = 0;
      // she comes apart into small pale moths that rise through the vault
      if (s > 0.5) this.dissolve = clamp((s - 0.5) / 2.4, 0, 1);
      if (s > 0.5 && this.dissolve < 1 && this.swarm.length < 90 && Math.random() < dt * 60) this.spawnSwarm();
      for (const m of this.swarm) {
        m.t += dt;
        m.vy = Math.max(m.vy - 140 * dt, -260);
        m.vx += Math.sin(m.t * 5 + m.ph) * 160 * dt;
        m.x += m.vx * dt; m.y += m.vy * dt;
      }
      this.swarm = this.swarm.filter((m) => m.t < m.life && m.y > -60);
      if (s > 1.3 && !this._finished) this.finishDefeat();
      if (s > 2.4 && this._finished && this.dissolve >= 1 && (!this.swarm.length || s > 7)) this.remove();
    }
    spawnSwarm() {
      const a = rnd(0, TAU), r = rnd(0, 140) * (1 - this.dissolve * 0.5);
      this.swarm.push({ x: this.cx + Math.cos(a) * r, y: this.cy + Math.sin(a) * r * 0.45, vx: rnd(-60, 60), vy: rnd(-90, -20), t: 0, life: rnd(2.2, 3.6), ph: rnd(0, TAU), s: rnd(0.6, 1.2) });
    }
    drawSwarm(ctx, t) {
      if (!this.swarm.length) return;
      ctx.save();
      for (const m of this.swarm) {
        const a = clamp(Math.min(m.t / 0.3, (m.life - m.t) / 0.8), 0, 1);
        const flap = 0.35 + 0.65 * Math.abs(Math.sin(t * 22 + m.ph));
        const sz = 6 * m.s;
        ctx.globalAlpha = a * 0.9;
        ctx.fillStyle = '#efe6ff';
        ctx.beginPath();
        ctx.ellipse(m.x - sz * flap * 0.6, m.y, sz * flap * 0.7, sz * 0.55, 0.3, 0, TAU);
        ctx.ellipse(m.x + sz * flap * 0.6, m.y, sz * flap * 0.7, sz * 0.55, -0.3, 0, TAU);
        ctx.fill();
        glow(ctx, m.x, m.y, sz * 3, PAL.glow, 0.3 * a);
      }
      ctx.restore();
    }

    // ---------------------------------------------------------------- drawing
    draw(ctx, t) {
      if (!this.dead) this.drawUnder(ctx, t);
      super.draw(ctx, t);
    }
    /** Floor shadow (height cue for the swoops) and the dash aim line (behind the body). */
    drawUnder(ctx, t) {
      if (this.phase >= 2 && !this.dying && this.fightStarted) glow(ctx, this.cx, this.cy, 250, PAL.glow, 0.13 + 0.05 * Math.sin(t * 2.6));   // her roused aura
      const g = this.geom;
      if (g) {
        const hgt = g.floor - (this.y + this.h);
        const a = clamp(1 - hgt / 520, 0, 1) * (1 - this.dissolve);
        if (a > 0.02) {
          ctx.save(); ctx.globalAlpha = 0.4 * a; ctx.fillStyle = '#05030a';
          ctx.beginPath(); ctx.ellipse(this.cx, g.floor - 2, 70 + 90 * (1 - a), 9, 0, 0, TAU); ctx.fill();
          ctx.restore();
        }
      }
      const d = this.stateData;
      if (this.is('dash') && d && d.stage === 'tele' && d.ux != null && teleOn()) {
        const u = this.stateTime - d.t0, k = clamp(u / Math.max(0.1, d.w), 0, 1);
        const len = 1400, x1 = this.cx + d.ux * len, y1 = this.cy + d.uy * len;
        ctx.save();
        ctx.globalCompositeOperation = 'lighter';
        ctx.strokeStyle = d.locked ? '#ffffff' : PAL.aim;
        ctx.globalAlpha = d.locked ? 0.75 : 0.18 + 0.3 * k;
        ctx.lineWidth = d.locked ? 4 : 2;
        ctx.setLineDash(d.locked ? [] : [14, 12]);
        ctx.lineDashOffset = -t * 120;
        ctx.beginPath(); ctx.moveTo(this.cx + d.ux * 60, this.cy + d.uy * 60); ctx.lineTo(x1, y1); ctx.stroke();
        ctx.setLineDash([]);
        ctx.restore();
      }
    }
    drawBody(ctx, t) {
      // low passes (swoop bottom, floor-skimming dash, stagger): the floor's front edge hides the wing tips
      const g = this.geom, clip = g && this.cy + 240 > g.floor;
      if (clip) { ctx.save(); ctx.beginPath(); ctx.rect(this.cx - 420, this.cy - 420, 840, g.floor + 3 - (this.cy - 420)); ctx.clip(); }
      drawMoth(ctx, this.cx, this.cy, this.pz, t, {
        rot: this.rot, eye: this.eyeGlow, flame: this.flameK, look: this.look, seed: this.seed,
        alpha: this.dying ? 1 - this.dissolve : 1, asym: this.asym,
      });
      if (clip) ctx.restore();
      if (this.dying) this.drawSwarm(ctx, t);
      // standard / hardcore dash tell (diegetic, replaces the aim line): her head and blade-swept wings flare white at
      // the lock (0.34 s before she goes), on top of the 'vesp_moth' lock chirp; her body is already turned along the line
      const d = this.stateData;
      if (this.is('dash') && d && d.stage === 'tele' && d.locked && d.ux != null && !teleOn()) {
        const pulse = 0.5 + 0.5 * Math.sin(t * 40);
        glow(ctx, this.cx + d.ux * 34, this.cy + d.uy * 34, 70, '#ffffff', 0.55 + 0.3 * pulse);
        glow(ctx, this.cx, this.cy, 150, PAL.aim, 0.22 + 0.1 * pulse);
      }
    }
  }
  G.Boss.register('vespertine', Vespertine);       // literal id: tools/lib/registry.js scans for it

  // ======================================================================================== her brood
  // vespertine_moth: a hand-sized dusk moth shed from her eye-spots. Flutters to a perch beside/above the player, glows
  // (0.46 s telegraph, chirp) and darts in a straight line; one Brand hit kills it. No drops. Fades after ~18 s.
  const MOTH = { hp: 9, w: 28, h: 24, dart: 600, life: 18 };
  class DuskMothling extends G.Enemy {
    constructor(props) {
      super(props, {
        hp: MOTH.hp, w: MOTH.w, h: MOTH.h, flying: true, gravity: 0, weight: 0.6, cinders: 0, contactDamage: 1, contactInset: 4,
        sight: 1200, z: 2, minTelegraph: 0.35,
        colors: { body: PAL.moth, dark: PAL.mothDark, hit: '#ffffff', puddle: PAL.furShade, smoke: '#6a5a8c', tele: PAL.tele },
        light: { r: 90, color: '#c8a8ff', intensity: 0.4 },
      });
      this.dropThrough = true;
      this.age = 0;
      this.flap = Math.random() * TAU;
      this.alpha = 1;
    }
    init() {
      super.init();
      const ox = this.props.ox || rnd(-1, 1), oy = this.props.oy || -1, l = Math.hypot(ox, oy) || 1;
      this.vx = ox / l * 220; this.vy = oy / l * 160 - 60;
      this.setState('born');
    }
    /** One dart at a time: a mothling waits while a sister glows, darts or has only just landed. */
    packBusy() {
      const room = this.room;
      if (!room) return false;
      // ...and while the Duchess herself is striking (one threat at a time)
      const o = this.owner || room.entities.find((e) => e.type === 'boss_vespertine' && !e.dead);
      if (o && !o.dead && !o.dying && o.stateData && /^(swoop|gust|dash|ascend)$/.test(o.state) && o.stateData.stage !== 'recover') return true;   // never on top of her own attacks
      return room.entities.some((e) => e !== this && !e.dead && !e.dying && e.kind === 'vespertine_moth' && (e.state === 'aim' || e.state === 'dart' || (e.state === 'recover' && e.stateTime < 0.3)));
    }
    contactRect() {
      if (this.is('born') || this.is('fade') || this.is('recover')) return null;   // dazed after a dart: the punish window
      return super.contactRect();
    }
    think(dt) {
      this.age += dt;
      this.flap += dt * (this.is('aim') ? 40 : this.is('dart') ? 6 : 26);
      const p = this.player, ok = this.targetable(p);
      switch (this.state) {
        case 'born':
          this.vx = approach(this.vx, 0, 400 * dt); this.vy = approach(this.vy, 0, 400 * dt);
          if (this.stateTime > 0.5) { this.setState('hunt'); this.cooldown('dart', 0.6 + (this.props.idx || 0) * 0.55 + rnd(0, 0.4)); }
          break;
        case 'hunt': {
          if (this.age > MOTH.life) { this.setState('fade'); break; }
          if (!ok) { this.hover(this.home.x, this.home.y, dt, { amp: 20, speed: 90 }); break; }
          const side = this.cx < p.x + p.w / 2 ? -1 : 1;
          let tx = p.x + p.w / 2 + side * 130, ty = p.y + p.h / 2 - 122 + Math.sin(this.t * 2 + this.seed) * 26;   // flutters well above head height
          if (this.cy > p.y - 14 && Math.abs(this.cx - (p.x + p.w / 2)) < 96) { tx = this.cx + side * 150; ty = this.cy; }   // low beside them (after a dart): sidestep before climbing
          this.flyTo(tx, ty, 230, dt, { accel: 800, arrive: 40 });
          this.vy += Math.sin(this.t * 11 + this.seed) * 260 * dt;    // fluttering
          this.face();
          if (this.ready('dart') && this.stateTime > 0.8 && this.dist() < 280 && !this.packBusy()) this.setState('aim');
          break;
        }
        case 'aim': {
          if (this.once('t')) this.stateData.w = this.telegraph(TELE.moth, { color: PAL.tele, sound: 'vesp_moth', vol: 0.55, shake: 1.4, glint: true });
          this.vx = approach(this.vx, 0, 900 * dt); this.vy = approach(this.vy, 0, 900 * dt);
          // the aim locks just past half the glow (a white glint + a faint streak show where it will fly)
          if (ok && this.stateTime < this.stateData.w * 0.52) {
            const ax = p.x + p.w / 2 - this.cx, ay = p.y + p.h / 2 - this.cy, l = Math.hypot(ax, ay) || 1;
            this.stateData.ux = ax / l; this.stateData.uy = ay / l; this.stateData.len = l;
            this.face();
          }
          if (this.stateTime >= this.stateData.w) {
            const d = this.stateData;
            // it darts through the spot it marked and a little beyond, no further
            this.setState('dart', { ux: d.ux == null ? this.facing : d.ux, uy: d.uy || 0, tmax: clamp(((d.len || 200) + 80) / MOTH.dart, 0.2, 0.5) });
          }
          break;
        }
        case 'dart': {
          const d = this.stateData;
          this.vx = d.ux * MOTH.dart; this.vy = d.uy * MOTH.dart;
          if (this.wallHit || this.ceilHit || this.grounded || this.stateTime > (d.tmax || 0.5)) { this.vx *= 0.2; this.vy *= 0.2; this.setState('recover'); }
          break;
        }
        case 'recover':
          this.vx = approach(this.vx, p ? (this.cx < p.x + p.w / 2 ? -110 : 110) : 0, 500 * dt); this.vy = approach(this.vy, -50, 500 * dt);   // drifts away, dazed
          if (this.stateTime > 0.7) { this.cooldown('dart', 1.5); this.setState('hunt'); }
          break;
        case 'fade':
          this.contactDamage = 0; this.hurtable = false;
          this.vy = approach(this.vy, -60, 200 * dt); this.vx = approach(this.vx, 0, 200 * dt);
          this.alpha = clamp(1 - this.stateTime / 0.8, 0, 1);
          if (this.stateTime > 0.8) this.remove();
          break;
        default: this.setState('hunt');
      }
    }
    updateDeath(dt) {      // a moth does not melt: it bursts into scales and is gone
      this.deathT += dt;
      if (!this._puffed) {
        this._puffed = true;
        if (G.fx) { G.fx.burst('smoke', this.cx, this.cy, { count: 4, color: PAL.dustMid, alpha: 0.45, size: 12 }); for (let i = 0; i < 10; i++) G.fx.spawn({ x: this.cx, y: this.cy, vx: rnd(-120, 120), vy: rnd(-140, 40), life: rnd(0.4, 0.9), size: rnd(1.5, 3), color: PAL.band, alpha: 0.9, gravity: 200, add: true }); }
      }
      if (this.deathT > 0.25) this.remove();
    }
    drawDeath(ctx, t) {
      ctx.save(); ctx.globalAlpha *= clamp(1 - this.deathT / 0.25, 0, 1);
      this.drawBody(ctx, t);
      ctx.restore();
    }
    drawBody(ctx, t) {
      const x = this.cx, y = this.cy;
      const aim = this.is('aim'), dart = this.is('dart');
      const f = dart ? 0.25 : 0.3 + 0.7 * Math.abs(Math.sin(this.flap));
      // standard / hardcore: once its aim locks a mothling turns its head along the line (diegetic, replaces the streak)
      const sd = this.stateData, lockedAim = aim && sd && sd.ux != null && sd.w && this.stateTime >= sd.w * 0.52 && !teleOn();
      const tilt = dart ? Math.atan2(this.vy, this.vx) + Math.PI / 2 : lockedAim ? Math.atan2(sd.uy, sd.ux) + Math.PI / 2 : clamp(this.vx / 900, -0.4, 0.4);
      ctx.save();
      ctx.globalAlpha *= this.alpha;
      ctx.translate(x, y); ctx.rotate(tilt);
      glow(ctx, 0, 0, aim ? 40 : 26, PAL.glow, aim ? 0.45 + 0.25 * Math.sin(this.stateTime * 30) : 0.22);
      if (lockedAim) glow(ctx, 0, -6, 22, '#ffffff', 0.6);   // the lock glint on its head
      for (const s of [-1, 1]) {
        ctx.save(); ctx.scale(s * f, 1);
        ctx.fillStyle = PAL.mothDark; ctx.strokeStyle = PAL.outline; ctx.lineWidth = 1.6;
        ctx.beginPath(); ctx.moveTo(2, 2); ctx.quadraticCurveTo(10, 16, 6, 18); ctx.quadraticCurveTo(14, 14, 15, 6); ctx.closePath(); ctx.fill(); ctx.stroke();
        ctx.fillStyle = PAL.moth;
        ctx.beginPath(); ctx.moveTo(2, -1); ctx.quadraticCurveTo(10, -16, 22, -15); ctx.quadraticCurveTo(22, -2, 14, 5); ctx.quadraticCurveTo(7, 5, 2, 3); ctx.closePath(); ctx.fill(); ctx.stroke();
        ctx.fillStyle = aim ? '#ffffff' : PAL.mothEye;
        ctx.beginPath(); ctx.arc(13, -7, 2.6, 0, TAU); ctx.fill();
        ctx.restore();
      }
      ctx.fillStyle = PAL.body; ctx.strokeStyle = PAL.outline; ctx.lineWidth = 1.6;
      ctx.beginPath(); ctx.ellipse(0, 3, 3.6, 9, 0, 0, TAU); ctx.fill(); ctx.stroke();
      ctx.fillStyle = PAL.fur; ctx.beginPath(); ctx.arc(0, -5, 4.2, 0, TAU); ctx.fill();
      ctx.strokeStyle = PAL.antennaBarb; ctx.lineWidth = 1.2;
      ctx.beginPath(); ctx.moveTo(-1, -8); ctx.quadraticCurveTo(-4, -14, -8, -16); ctx.moveTo(1, -8); ctx.quadraticCurveTo(4, -14, 8, -16); ctx.stroke();
      ctx.restore();
    }
    draw(ctx, t) {
      if (!this.dying && !this.dead) {   // the locked aim streak (outside the hit-flash silhouette)
        const sd = this.stateData;
        if (this.is('aim') && sd && sd.ux != null && sd.w && this.stateTime >= sd.w * 0.52 && teleOn()) {
          ctx.save();
          ctx.globalCompositeOperation = 'lighter';
          ctx.globalAlpha *= 0.5 * this.alpha;
          ctx.strokeStyle = PAL.aim; ctx.lineWidth = 2; ctx.setLineDash([8, 8]); ctx.lineDashOffset = -t * 90;
          ctx.beginPath(); ctx.moveTo(this.cx + sd.ux * 18, this.cy + sd.uy * 18); ctx.lineTo(this.cx + sd.ux * 170, this.cy + sd.uy * 170); ctx.stroke();
          ctx.restore();
        }
      }
      super.draw(ctx, t);
    }
    drawBounds() { return { x: this.cx - 40, y: this.cy - 40, w: 80, h: 80 }; }
  }
  G.registerEnemy('vespertine_moth', DuskMothling);

  // ======================================================================================== the bower (event script)
  // Arena dressing owned by this module: the cocoon throne at the east end (with the sleeping Duchess before the fight),
  // the silk ropes that hold the three platforms, a slanting moonbeam; the cocoons flare in her second phase and go
  // cold after her defeat. Props: ropes [[col,row],...] (platform ends), the event tile = the throne (= arena bx/by).
  let THRONE = null, BEAM = null;
  const COCOONS = [[-96, 40, 15, 34, -0.3], [-60, 66, 18, 40, -0.15], [-20, 84, 20, 44, 0.05], [24, 80, 19, 42, 0.12], [64, 62, 18, 40, 0.25],
    [100, 36, 15, 34, 0.35], [-120, 6, 12, 28, -0.4], [124, 2, 12, 28, 0.45], [-40, 118, 15, 34, -0.1], [10, 126, 16, 36, 0.05], [52, 112, 14, 32, 0.2]];
  function makeThrone() {
    const w = 360, h = 360, ox = 180, oy = 230;              // origin = her seat (the spawn centre)
    const cv = G.U.makeCanvas(w, h), c = cv.ctx;
    c.translate(ox, oy);
    // silk strands up to the vault
    c.strokeStyle = 'rgba(216,200,244,0.32)'; c.lineWidth = 2;
    for (let i = 0; i < 9; i++) { const x0 = -110 + i * 27; c.beginPath(); c.moveTo(x0 * 0.6, 40); c.quadraticCurveTo(x0 * 0.9, -100, x0 * 1.3, -230); c.stroke(); }
    // the woven cradle
    c.fillStyle = '#211835'; c.strokeStyle = PAL.outline; c.lineWidth = 3;
    c.beginPath(); c.moveTo(-140, 20); c.quadraticCurveTo(-120, 120, 0, 132); c.quadraticCurveTo(120, 120, 140, 20); c.quadraticCurveTo(0, 60, -140, 20); c.closePath(); c.fill(); c.stroke();
    c.strokeStyle = 'rgba(200,184,236,0.28)'; c.lineWidth = 1.5;
    for (let i = 0; i < 12; i++) { c.beginPath(); c.moveTo(-130 + i * 22, 26 + Math.abs(i - 6) * 2); c.quadraticCurveTo(-120 + i * 20, 90, -60 + i * 10, 126); c.stroke(); }
    for (const [x, y, rx, ry, a] of COCOONS) {
      const g = c.createLinearGradient(x - rx, y - ry, x + rx, y + ry);
      g.addColorStop(0, '#e2d6f2'); g.addColorStop(0.55, '#a898c8'); g.addColorStop(1, '#5a4a7c');
      c.save(); c.translate(x, y); c.rotate(a);
      c.fillStyle = g; c.strokeStyle = PAL.outline; c.lineWidth = 2.4;
      c.beginPath(); c.ellipse(0, 0, rx, ry, 0, 0, TAU); c.fill(); c.stroke();
      c.strokeStyle = 'rgba(255,255,255,0.35)'; c.lineWidth = 1.2;
      for (let k = -2; k <= 2; k++) { c.beginPath(); c.moveTo(-rx * 0.9, k * ry * 0.3 - 4); c.quadraticCurveTo(0, k * ry * 0.3 + 6, rx * 0.9, k * ry * 0.3 - 2); c.stroke(); }
      c.restore();
    }
    return { canvas: cv.canvas, ox, oy, w, h };
  }
  function makeBeam() {
    const w = 300, h = 860, cv = G.U.makeCanvas(w, h), c = cv.ctx;
    const g = c.createLinearGradient(0, 0, 0, h);
    g.addColorStop(0, 'rgba(226,214,255,0.9)'); g.addColorStop(0.7, 'rgba(200,180,250,0.45)'); g.addColorStop(1, 'rgba(200,180,250,0)');
    c.fillStyle = g;
    c.beginPath(); c.moveTo(w * 0.42, 0); c.lineTo(w * 0.62, 0); c.lineTo(w, h); c.lineTo(0, h); c.closePath(); c.fill();
    return cv.canvas;
  }
  function bowerState(e) {
    const room = e.room;
    const done = !!(G.game && typeof G.game.bossDefeated === 'function' && G.game.bossDefeated(ID));
    const boss = room ? room.entities.find((x) => x.type === 'boss_' + ID && !x.dead) : null;
    const arena = room ? room.entities.find((x) => x.type === 'arena' && x.props && x.props.boss === ID) : null;
    return { done, boss, arena };
  }
  G.Events.vespertine_bower = {
    init(e) {
      e.data.ropes = Array.isArray(e.props.ropes) ? e.props.ropes : [];
      e.data.flare = 0.4; e.data.cold = 0; e.data.pose = copyPose(POSES.rest);
    },
    update(e, dt) {
      const st = bowerState(e);
      e.data.st = st;
      const want = st.done ? 0.08 : st.boss && st.boss.phase >= 2 ? 1 : st.boss && st.boss.fightStarted ? 0.6 : 0.4;
      e.data.flare = damp(e.data.flare, want, 1.5, dt);
      e.data.cold = damp(e.data.cold, st.done ? 1 : 0, 0.8, dt);
      e.data.pose.phi += POSES.rest.hz * TAU * dt;
      if (!G.lighting) return;
      const sx = e.x + TILE / 2, sy = e.y + TILE / 2;
      G.lighting.add({ x: sx, y: sy + 60, r: 230, color: '#b890ff', intensity: 0.12 + 0.4 * e.data.flare });
      G.lighting.add({ x: sx - 80, y: (st.boss && st.boss.geom ? st.boss.geom.floor : sy + 540) - 30, r: 200, color: '#e2d6ff', intensity: 0.32 });   // moonbeam pool
    },
    draw(e, ctx, t) {
      const sx = e.x + TILE / 2, sy = e.y + TILE / 2;
      const st = e.data.st || bowerState(e);
      if (!THRONE && G.U && G.U.makeCanvas) { try { THRONE = makeThrone(); BEAM = makeBeam(); } catch (err) { G.reportError(err, 'vespertine_bower sprites'); THRONE = { fail: true }; } }
      // moonbeam slanting from the vault onto the throne and the floor below it
      if (BEAM) {
        ctx.save(); ctx.globalCompositeOperation = 'lighter';
        ctx.globalAlpha = 0.07 + 0.02 * Math.sin(t * 0.7);
        ctx.drawImage(BEAM, sx - 230, sy - 300, 300, 860);
        ctx.restore();
      }
      // silk ropes holding the platforms (from the vault, row 3 top)
      const top = 3 * TILE;
      ctx.save();
      ctx.lineCap = 'round';
      for (const [c, r] of e.data.ropes) {
        const room = e.room;
        const left = room && room.tileAt(c - 1, r) !== (G.T && G.T.PLATFORM);
        const x = c * TILE + (left ? 8 : TILE - 8), y1 = r * TILE + 3;
        const sw = Math.sin(t * 0.8 + c) * 3;
        ctx.strokeStyle = 'rgba(206,190,240,0.55)'; ctx.lineWidth = 2;
        ctx.beginPath(); ctx.moveTo(x - 3, top); ctx.quadraticCurveTo(x - 3 + sw, (top + y1) / 2, x - 2, y1); ctx.stroke();
        ctx.strokeStyle = 'rgba(206,190,240,0.3)'; ctx.lineWidth = 1.4;
        ctx.beginPath(); ctx.moveTo(x + 3, top); ctx.quadraticCurveTo(x + 3 - sw, (top + y1) / 2, x + 2, y1); ctx.stroke();
        ctx.fillStyle = '#cbbbe8'; ctx.beginPath(); ctx.ellipse(x, y1 - 2, 5, 4, 0, 0, TAU); ctx.fill();
      }
      ctx.restore();
      // the throne
      if (THRONE && !THRONE.fail) {
        ctx.save();
        if (e.data.cold > 0.01) ctx.globalAlpha *= 1 - 0.35 * e.data.cold;
        ctx.drawImage(THRONE.canvas, sx - THRONE.ox, sy - THRONE.oy, THRONE.w, THRONE.h);
        ctx.restore();
        const fl = e.data.flare * (1 - e.data.cold);
        for (let i = 0; i < COCOONS.length; i++) {
          const [x, y, rx] = COCOONS[i];
          glow(ctx, sx + x, sy + y, rx * 2.4, '#b890ff', fl * (0.22 + 0.16 * Math.sin(t * 1.6 + i * 1.9)));
        }
      }
      // the sleeping Duchess (before her arena's fight has spawned her)
      if (!st.done && !st.boss && (!st.arena || st.arena.state !== 'done')) {
        drawMoth(ctx, sx, sy, e.data.pose, t, { eye: 0.15, flame: 0.45, seed: 3, look: 0 });
      }
    },
  };

  // ======================================================================================== sounds
  (function defineSounds() {
    const A = G.Audio;
    if (!A || typeof A.defineSfx !== 'function') return;
    // one great, papery wing-beat
    A.defineSfx('vesp_wings', { vol: 1.4, reverb: 0.25, prio: 1, play(k) {
      const v = k.r(0.9, 1.1);
      k.noise({ color: 'pink', lp: 520 * v, lp1: 200, a: 0.03, d: 0.28, g: 0.32, sweep: 0.25 });
      k.noise({ bp: 1300 * v, Q: 0.8, a: 0.02, d: 0.12, g: 0.06 });
    } });
    // swoop wind-up: wings fold with a rising airy whistle
    A.defineSfx('vesp_swoop', { vol: 1.8, reverb: 0.3, prio: 2, play(k) {
      const v = k.r(0.95, 1.05);
      k.tone({ f: 520 * v, f1: 1250 * v, glide: 0.5, type: 'sine', a: 0.05, hold: 0.3, d: 0.25, g: 0.09, vib: { rate: 9, depth: 30 } });
      k.noise({ hp: 1800, hp1: 3600, a: 0.1, hold: 0.25, d: 0.2, g: 0.08, sweep: 0.5 });
      k.noise({ color: 'pink', lp: 600, a: 0.01, d: 0.18, g: 0.22 });
    } });
    // the dive: a long falling whoosh
    A.defineSfx('vesp_dive', { vol: 1.9, reverb: 0.2, prio: 2, play(k) {
      const v = k.r(0.92, 1.08);
      k.noise({ bp: 500 * v, bp1: 1800 * v, Q: 1.1, a: 0.08, hold: 0.25, d: 0.45, g: 0.42, sweep: 0.5 });
      k.tone({ f: 180 * v, f1: 90 * v, glide: 0.6, a: 0.05, d: 0.6, g: 0.12 });
    } });
    // gust wind-up: air drawn in under the raised wings
    A.defineSfx('vesp_inhale', { vol: 1.9, reverb: 0.3, prio: 2, play(k) {
      const v = k.r(0.95, 1.05);
      k.noise({ color: 'pink', lp: 280, lp1: 2600 * v, a: 0.45, hold: 0.12, d: 0.12, g: 0.34, sweep: 0.6 });
      k.tone({ f: 70 * v, f1: 110 * v, glide: 0.6, type: 'triangle', a: 0.3, hold: 0.2, d: 0.2, g: 0.12 });
    } });
    // the beat: a huge rolling gust
    A.defineSfx('vesp_gust', { vol: 2.0, reverb: 0.35, prio: 3, play(k) {
      const v = k.r(0.94, 1.06);
      k.noise({ color: 'brown', lp: 1400 * v, lp1: 260, a: 0.01, hold: 0.25, d: 1.1, g: 0.55, sweep: 1.2 });
      k.noise({ color: 'pink', bp: 900 * v, bp1: 400, Q: 0.7, a: 0.02, d: 0.9, g: 0.22, sweep: 1.0 });
      k.tone({ f: 60 * v, f1: 38, glide: 0.5, a: 0.005, d: 0.5, g: 0.35 });
    } });
    // dust wind-up: the deep thrumming hum of wrapped wings
    A.defineSfx('vesp_hum', { vol: 1.9, reverb: 0.4, prio: 2, play(k) {
      const v = k.r(0.97, 1.03);
      k.tone({ f: 55 * v, type: 'sawtooth', lp: 380, a: 0.15, hold: 0.45, d: 0.35, g: 0.16, vib: { rate: 28, depth: 60 } });
      k.inst('glass_pad', 'E4', 0.9, 0.5);
      k.noise({ color: 'pink', lp: 900, a: 0.3, hold: 0.3, d: 0.3, g: 0.08 });
    } });
    // dust burst: a soft heavy "foom" and glittering scales
    A.defineSfx('vesp_dust', { vol: 2.0, reverb: 0.45, prio: 3, play(k) {
      k.noise({ color: 'brown', lp: 700, lp1: 180, a: 0.01, d: 0.9, g: 0.5, sweep: 0.8 });
      for (let i = 0; i < 6; i++) k.tone({ f: k.r(2400, 4200), a: 0.002, d: k.r(0.15, 0.4), g: 0.04, at: 0.05 + i * 0.06 });
    } });
    // a cloud settling into place (its warning ring appears)
    A.defineSfx('vesp_settle', { vol: 1.3, reverb: 0.4, prio: 1, play(k) {
      k.noise({ color: 'pink', lp: 500, a: 0.08, d: 0.5, g: 0.18 });
      k.tone({ f: k.r(1600, 2000), f1: 1200, glide: 0.3, type: 'sine', a: 0.02, d: 0.4, g: 0.03 });
    } });
    // brood wind-up: a quivering chitter
    A.defineSfx('vesp_brood', { vol: 1.8, reverb: 0.3, prio: 2, play(k) {
      const v = k.r(0.95, 1.05);
      for (let i = 0; i < 18; i++) k.tone({ f: k.r(1800, 3400) * v, f1: k.r(1400, 2600) * v, glide: 0.03, type: 'triangle', a: 0.002, d: 0.04, g: 0.05, at: i * 0.032 });
      k.noise({ bp: 2600, Q: 2, a: 0.1, hold: 0.3, d: 0.2, g: 0.06 });
    } });
    // a small moth's dart chirp (also her dash lock)
    A.defineSfx('vesp_moth', { vol: 1.6, reverb: 0.2, prio: 2, play(k) {
      const v = k.r(0.94, 1.06);
      k.tone({ f: 2200 * v, f1: 3300 * v, glide: 0.12, type: 'triangle', a: 0.004, d: 0.12, g: 0.06 });
      k.tone({ f: 2600 * v, f1: 3600 * v, glide: 0.1, type: 'triangle', a: 0.004, d: 0.1, g: 0.05, at: 0.16 });
      k.noise({ bp: 3000, Q: 3, a: 0.01, hold: 0.2, d: 0.15, g: 0.03 });
    } });
    // dash wind-up: a rising crystalline shing
    A.defineSfx('vesp_blade', { vol: 1.8, reverb: 0.3, prio: 2, play(k) {
      const v = k.r(0.96, 1.04);
      k.tone({ f: 700 * v, f1: 2100 * v, glide: 0.45, type: 'sawtooth', bp: 2200, Q: 3, a: 0.05, hold: 0.3, d: 0.15, g: 0.07 });
      k.inst('celesta', 'B5', 0.6, 0.6, { at: 0.36 });
      k.noise({ hp: 3000, a: 0.2, hold: 0.25, d: 0.1, g: 0.05 });
    } });
    // the dash: a hard cutting rush
    A.defineSfx('vesp_dash', { vol: 2.0, reverb: 0.2, prio: 3, play(k) {
      const v = k.r(0.94, 1.06);
      k.noise({ hp: 900 * v, hp1: 2400, a: 0.004, d: 0.35, g: 0.42, sweep: 0.3 });
      k.noise({ color: 'pink', bp: 700, Q: 1, a: 0.01, d: 0.4, g: 0.2 });
      k.tone({ f: 1500 * v, f1: 600, glide: 0.3, type: 'triangle', a: 0.002, d: 0.3, g: 0.05 });
    } });
    // her cry: an eerie, breathy keen over a low swell (wake, phase 2)
    A.defineSfx('vesp_cry', { vol: 2.2, reverb: 0.55, prio: 3, play(k) {
      const v = k.r(0.98, 1.02);
      k.inst('choir_oo', 'B4', 1.2, 0.7);
      k.inst('choir_oo', 'F#5', 1.0, 0.5, { at: 0.08 });
      k.tone({ f: 980 * v, f1: 1480 * v, glide: 0.35, type: 'sine', a: 0.08, hold: 0.4, d: 0.6, g: 0.08, vib: { rate: 6, depth: 40 } });
      k.noise({ color: 'pink', lp: 700, a: 0.05, hold: 0.3, d: 0.7, g: 0.22 });
    } });
    // defeat: a hush of countless small wings and a falling glass chord
    A.defineSfx('vesp_release', { vol: 2.0, reverb: 0.6, prio: 3, play(k) {
      for (let i = 0; i < 24; i++) k.noise({ color: 'pink', lp: k.r(500, 1200), a: 0.01, d: k.r(0.08, 0.2), g: 0.06, at: i * 0.09 + k.r(0, 0.05) });
      k.inst('glass_pad', 'E4', 2.6, 0.5);
      k.inst('glass_pad', 'B4', 2.4, 0.4, { at: 0.2 });
      ['E6', 'B5', 'G#5', 'E5'].forEach((n, i) => k.inst('celesta', n, 0.8, 0.45, { at: 0.3 + i * 0.22 }));
    } });
  })();

  G.Vespertine = { ID, HP, BW, BH, K, PAL, POSES, TELE, STAGGER, MOTH_CAP, MOTH, PUSH, DARK_MAX, drawMoth, eyeSpots, wingState, Vespertine, DuskMothling, DustCloud, DustRoll };
})();
