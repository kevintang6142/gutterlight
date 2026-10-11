// src/entities/bosses/effigy.js — THE EFFIGY, Husk of the Old Guard (first boss, arena gw_05). Owner: boss-effigy.
// A hollow giant statue of a royal guard: cracked white wax shell leaking Pall smoke, an iron snuffer-cap hammer.
// HP 200 (Brand L0 = 5 → 40 hits; 37 measured with the exposed-core bonus). Phase 2 at 50 %. Stagger every 70 damage
// (35 %): it collapses, the chest shell splits and the smoke core takes +50 % damage. Every hit deals 1.
// Its impact spots are marked on the floor (glowing seam + cracks + edge brackets, lit) until the blow lands.
//   slam   — hammer raised overhead (≥ 0.55 s, floor mark where the head lands) → impact + shockwaves both ways
//   leap   — crouch (≥ 0.5 s) → high leap onto the player's spot (run under it; floor mark during the flight) → landing shockwaves
//   combo  — low sweep (jump it / back off) → overhead chop on a marked spot; long recovery (punish)
//   debris — phase 2: roars and stamps; warned columns of ceiling debris fall (move out of the marks; later stamps
//            never land on or beside an earlier column, the rocks cast a floor shadow while falling)
//   hurl   — phase 2: throws the hammer skimming low (jump it); it returns high (stay down); unarmed meanwhile
//   awaken — phase-2 transition: the shell bursts, eyes turn ember, music intensity layer
// Also registers: projectiles 'effigy_wave' and 'effigy_debris', its sfx (effigy_*), and the room event script
// 'effigy_statue' (the kneeling statue before the fight, its broken shell afterwards). Guide: docs/api/boss-effigy.md.
(function () {
  'use strict';
  const G = globalThis.G;
  if (!G || !G.Boss || !G.Enemy) return;
  const TILE = G.CONST.TILE;
  const TAU = Math.PI * 2;
  const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
  const lerp = (a, b, t) => a + (b - a) * t;
  const rnd = (a, b) => a + Math.random() * (b - a);
  const ease = (t) => { t = clamp(t, 0, 1); return t * t * (3 - 2 * t); };
  const outQ = (t) => { t = clamp(t, 0, 1); return t * (2 - t); };
  const inQ = (t) => { t = clamp(t, 0, 1); return t * t; };
  /** Explicit telegraphs (floor seams, lit lanes, rock shadows) draw only in easy (docs/api/boss-effigy.md). */
  const teleOn = () => (G.telegraphsOn ? G.telegraphsOn() : true);

  // ---------------------------------------------------------------------------------------------------------
  // Palette & geometry (facing-space: origin at the feet centre, +x = facing direction, y up is negative)
  // ---------------------------------------------------------------------------------------------------------
  const OUT = '#141218';
  const SHELL = '#e2dacb', SHELL_DK = '#a59b8a', SHELL_HI = '#fbf7ee', SHELL_FAR = '#bdb3a2';
  const IRON = '#36343d', IRON_HI = '#6d6874', IRON_DK = '#1c1b21';
  const CLOTH = '#5c3430', CLOTH_DK = '#381f1d', GOLD = '#d4ad62';
  const CRACK = '#2b2530', PALL = '#7e879a', CORE = '#cdc6e4';
  const TELE = '#ffd59a', EMBER = '#ffb45a';
  const HL = 130;            // haft: grip → head centre
  const ARM1 = 44, ARM2 = 44, LEG1 = 33, LEG2 = 33;
  const HIP_Y = -60;

  /** A full pose. Numbers are damped toward their target each step; `held` switches at once. */
  const BASE_POSE = {
    kneel: 0, crouch: 0, lean: 0.05, head: 0, stretch: 0, walk: 0, stride: 0,
    gx: 44, gy: -96, ha: 0.62, sq: 1, hfo: 0,     // grip (back hand) and hammer angle (0 forward, +π/2 down)
    open: 0, eyes: 1, held: 1,                     // shell opened over the core; eye brightness; hammer in hand
    rhx: 30, rhy: -70,                             // rest hand position when not holding the hammer
  };
  const NUM_KEYS = Object.keys(BASE_POSE).filter((k) => k !== 'held');
  const pose = (o) => Object.assign({}, BASE_POSE, o || {});
  // grip/angle so the cone mouth rests on the floor at a given reach factor k (0 close … 1 far)
  function slamGrip(k) {
    const ha = lerp(0.88, 0.42, k), gx = lerp(28, 72, k);
    const hy = -25 * Math.cos(ha) - 1;
    return { gx, gy: hy - HL * Math.sin(ha), ha };
  }
  const P = {
    stand: pose({}),
    raise: pose({ gx: 8, gy: -172, ha: -1.95, lean: -0.12, crouch: 0.12, head: -0.12 }),
    leapCrouch: pose({ gx: 4, gy: -134, ha: -1.72, lean: 0.3, crouch: 0.85, head: 0.1 }),
    air: pose({ gx: 4, gy: -160, ha: -2.75, lean: -0.08, stretch: 1, head: -0.1 }),
    sweepWind: pose({ gx: -24, gy: -52, ha: Math.PI - 0.1, sq: 0, lean: -0.05, crouch: 0.4, head: 0.05 }),
    hurlWind: pose({ gx: -22, gy: -150, ha: -2.7, lean: -0.26, crouch: 0.25, head: -0.15 }),
    hurlRelease: pose({ held: 0, lean: 0.3, crouch: 0.2, rhx: 96, rhy: -112, gx: 120, gy: -60, ha: 0 }),
    unarmed: pose({ held: 0, lean: 0.06, crouch: 0.15, rhx: 40, rhy: -96, gx: 120, gy: -60, ha: 0 }),
    plant: pose({ gx: 52, gy: -152, ha: Math.PI / 2, hfo: -Math.PI / 2, lean: -0.18, head: -0.5, crouch: 0.1 }),
    statue: pose({ kneel: 1, lean: 0.16, head: 0.42, gx: 14, gy: -70, ha: 0.36, eyes: 0 }),
    dropped: { gx: 41, gy: -8.5, ha: -0.127 },
  };
  P.stagger = pose({ kneel: 1, lean: 0.36, head: 0.22, open: 1, eyes: 0.35, held: 0, rhx: 70, rhy: -6, gx: P.dropped.gx + 14, gy: P.dropped.gy, ha: P.dropped.ha });

  // ---------------------------------------------------------------------------------------------------------
  // Sound design (own sfx; registered once — the audit reads G.Audio.sfxNames() at runtime)
  // ---------------------------------------------------------------------------------------------------------
  (function defineSounds() {
    const A = G.Audio;
    if (!A || typeof A.defineSfx !== 'function') return;
    const thump = (k, f, d, g, at) => k.tone({ f, f1: f * 0.5, glide: d * 0.8, d, g, at: at || 0, a: 0.002 });
    const knocks = (k, n, span, g, at, lo, hi) => {
      for (let i = 0; i < n; i++) k.noise({ bp: k.r(lo || 500, hi || 2400), Q: 1.4, a: 0.001, d: k.r(0.025, 0.08), g: g * k.r(0.4, 1), at: (at || 0) + k.r(0, span) });
    };
    // the statue stirs: long stone-and-wax grinding rumble, creaks, a smoky exhale
    A.defineSfx('effigy_wake', { vol: 2.4, reverb: 0.4, prio: 2, play(k) {
      k.noise({ color: 'brown', lp: 420, lp1: 150, a: 0.3, hold: 0.9, d: 0.9, g: 0.42, sweep: 1.7 });
      k.tone({ f: 46, f1: 36, glide: 1.8, a: 0.35, hold: 0.8, d: 0.9, g: 0.28 });
      for (let i = 0; i < 8; i++) k.noise({ bp: k.r(700, 2400), Q: 3, a: 0.004, d: k.r(0.04, 0.1), g: k.r(0.05, 0.13), at: 0.15 + i * 0.17 + k.r(0, 0.08) });
      k.noise({ bp: 760, bp1: 260, Q: 0.7, a: 0.45, d: 1.0, g: 0.14, at: 0.8, sweep: 1.0 });
    } });
    // the iron hammer hauled up: creak, groan, rising metallic ring
    A.defineSfx('effigy_raise', { vol: 2.2, reverb: 0.2, prio: 2, play(k) {
      const v = k.r(0.95, 1.05);
      k.noise({ bp: 380 * v, bp1: 1300 * v, Q: 4, a: 0.12, hold: 0.12, d: 0.3, g: 0.16, sweep: 0.45 });
      k.tone({ f: 92 * v, f1: 70 * v, glide: 0.5, type: 'sawtooth', lp: 520, a: 0.08, hold: 0.18, d: 0.38, g: 0.14, vib: { rate: 13, depth: 40 } });
      k.tone({ f: 620 * v, f1: 930 * v, glide: 0.5, type: 'triangle', a: 0.08, d: 0.55, g: 0.035 });
      k.tone({ f: 1710 * v, a: 0.002, d: 0.25, g: 0.02, at: 0.04 });
    } });
    // crouching / bracing: grinding wax and stone
    A.defineSfx('effigy_grind', { vol: 2.2, reverb: 0.2, prio: 2, play(k) {
      const v = k.r(0.92, 1.08);
      k.noise({ color: 'brown', lp: 520 * v, lp1: 260 * v, a: 0.06, hold: 0.2, d: 0.35, g: 0.38, sweep: 0.5 });
      knocks(k, 6, 0.4, 0.07, 0.02, 900, 2600);
      k.tone({ f: 70 * v, f1: 58 * v, glide: 0.4, type: 'sawtooth', lp: 360, a: 0.05, hold: 0.15, d: 0.3, g: 0.1 });
    } });
    // a huge swing through the air
    A.defineSfx('effigy_swing', { vol: 2.0, reverb: 0.15, prio: 2, play(k) {
      const v = k.r(0.92, 1.08);
      k.noise({ bp: 260 * v, bp1: 1100 * v, Q: 1.1, a: 0.06, d: 0.26, g: 0.42, sweep: 0.28 });
      k.noise({ bp: 1800 * v, bp1: 3200 * v, Q: 2, a: 0.05, d: 0.16, g: 0.08, sweep: 0.2 });
      k.tone({ f: 84 * v, f1: 56 * v, glide: 0.3, a: 0.04, d: 0.3, g: 0.14 });
    } });
    // the snuffer-cap hammer meets the floor: sub thump, iron clang, rubble
    A.defineSfx('effigy_slam', { vol: 2.0, reverb: 0.3, prio: 3, play(k) {
      const v = k.r(0.95, 1.05);
      thump(k, 58 * v, 0.55, 0.62);
      k.noise({ lp: 900 * v, lp1: 140, a: 0.002, d: 0.5, g: 0.42, sweep: 0.5 });
      k.tone({ f: 196 * v, d: 0.7, g: 0.07, a: 0.001 });
      k.tone({ f: 196 * 2.76 * v, d: 0.4, g: 0.045, a: 0.001 });
      k.tone({ f: 196 * 5.4 * v, d: 0.18, g: 0.025, a: 0.001 });
      knocks(k, 8, 0.35, 0.08, 0.03, 600, 2800);
    } });
    // the wax shell splits: crackle burst, thud, the hiss of escaping smoke
    A.defineSfx('effigy_crack', { vol: 2.2, reverb: 0.3, prio: 3, play(k) {
      for (let i = 0; i < 14; i++) k.noise({ hp: k.r(1800, 4200), a: 0.0008, d: k.r(0.012, 0.04), g: k.r(0.08, 0.2), at: k.r(0, 0.22) });
      thump(k, 120, 0.3, 0.4);
      k.noise({ hp: 2600, hp1: 900, a: 0.05, d: 0.9, g: 0.09, at: 0.06, sweep: 0.9 });
      k.noise({ bp: 520, Q: 0.8, a: 0.1, d: 0.8, g: 0.12, at: 0.05 });
    } });
    // a chunk of the vault lands
    A.defineSfx('effigy_debris', { vol: 1.6, reverb: 0.2, prio: 1, play(k) {
      const v = k.r(0.85, 1.15);
      thump(k, 96 * v, 0.22, 0.38);
      knocks(k, 7, 0.18, 0.12, 0, 500, 2200);
      k.noise({ lp: 1200 * v, a: 0.001, d: 0.18, g: 0.2 });
    } });
    // the thrown hammer whirring through the air
    A.defineSfx('effigy_spin', { vol: 1.8, reverb: 0.1, prio: 1, play(k) {
      const v = k.r(0.95, 1.05);
      k.noise({ bp: 640 * v, Q: 5, a: 0.03, hold: 0.08, d: 0.18, g: 0.2 });
      k.tone({ f: 150 * v, type: 'sawtooth', lp: 900, a: 0.02, hold: 0.1, d: 0.16, g: 0.07, vib: { rate: 24, depth: 70 } });
    } });
    // one heavy footfall
    A.defineSfx('effigy_step', { vol: 1.5, reverb: 0.15, prio: 1, play(k) {
      const v = k.r(0.9, 1.1);
      thump(k, 72 * v, 0.22, 0.4);
      k.noise({ lp: 260 * v, a: 0.002, d: 0.16, g: 0.22 });
      knocks(k, 2, 0.06, 0.04, 0.01, 900, 2000);
    } });
  })();

  // ---------------------------------------------------------------------------------------------------------
  // Drawing kit (all in the caller's transform)
  // ---------------------------------------------------------------------------------------------------------
  const C = () => (G.Art && G.Art.char) || null;
  const glow = (ctx, x, y, r, color, a) => { if (G.Art && G.Art.glow) G.Art.glow(ctx, x, y, r, color, a); };
  function mixc(a, b, t) { return G.U && G.U.mix ? G.U.mix(a, b, t) : a; }

  /** Thick round-capped limb segment with outline, base, lit edge and shade edge. */
  function limb(ctx, x0, y0, x1, y1, w, color, light) {
    ctx.lineCap = 'round'; ctx.lineJoin = 'round';
    ctx.strokeStyle = OUT; ctx.lineWidth = w + 6;
    ctx.beginPath(); ctx.moveTo(x0, y0); ctx.lineTo(x1, y1); ctx.stroke();
    ctx.strokeStyle = color; ctx.lineWidth = w;
    ctx.beginPath(); ctx.moveTo(x0, y0); ctx.lineTo(x1, y1); ctx.stroke();
    const dx = x1 - x0, dy = y1 - y0, L = Math.hypot(dx, dy) || 1;
    let nx = -dy / L, ny = dx / L;
    if (nx * light + ny * -1 < 0) { nx = -nx; ny = -ny; }     // toward the light (upper side)
    const o = w * 0.26;
    ctx.strokeStyle = 'rgba(255,252,240,0.45)'; ctx.lineWidth = w * 0.22;
    ctx.beginPath(); ctx.moveTo(x0 + nx * o, y0 + ny * o); ctx.lineTo(x1 + nx * o, y1 + ny * o); ctx.stroke();
    ctx.strokeStyle = 'rgba(20,16,24,0.22)'; ctx.lineWidth = w * 0.3;
    ctx.beginPath(); ctx.moveTo(x0 - nx * o, y0 - ny * o); ctx.lineTo(x1 - nx * o, y1 - ny * o); ctx.stroke();
  }
  /** Two-bone IK: elbow/knee for a limb from (sx,sy) toward (tx,ty). pick(+1|-1 candidate) by `prefer(ex, ey)`. */
  function ik(sx, sy, tx, ty, l1, l2, prefer) {
    let dx = tx - sx, dy = ty - sy, d = Math.hypot(dx, dy);
    const max = l1 + l2 - 0.5;
    if (d > max) { tx = sx + dx / d * max; ty = sy + dy / d * max; dx = tx - sx; dy = ty - sy; d = max; }
    d = Math.max(d, Math.abs(l1 - l2) + 1);
    const a = Math.acos(clamp((l1 * l1 + d * d - l2 * l2) / (2 * l1 * d), -1, 1));
    const base = Math.atan2(dy, dx);
    const e1 = { x: sx + Math.cos(base + a) * l1, y: sy + Math.sin(base + a) * l1 };
    const e2 = { x: sx + Math.cos(base - a) * l1, y: sy + Math.sin(base - a) * l1 };
    const e = prefer(e1) >= prefer(e2) ? e1 : e2;
    return { ex: e.x, ey: e.y, hx: tx, hy: ty };
  }
  /** torso-local → facing-space */
  function tpt(F, x, y) { return { x: F.hx + x * F.c - y * F.s, y: F.hy + x * F.s + y * F.c }; }

  /** Hammer head position (facing-space) of a pose. */
  function headOf(p) { return { x: p.gx + HL * Math.cos(p.ha), y: p.gy + HL * Math.sin(p.ha) * p.sq }; }
  function faceOf(p) { return p.sq < 0.5 ? 0 : p.ha + Math.PI / 2 + p.hfo; }

  /**
   * The snuffer-cap hammer: haft from grip toward head (pommel behind the grip), iron cone head whose open mouth
   * faces `face` (radians). o: {light, tele (0..1 hot rim), smolder (0..1), alpha}
   */
  function drawHammer(ctx, gx, gy, hx, hy, face, o) {
    o = o || {};
    const ch = C();
    const pmx = gx - (hx - gx) * 0.2, pmy = gy - (hy - gy) * 0.2;
    ctx.lineCap = 'round';
    // haft
    ctx.strokeStyle = OUT; ctx.lineWidth = 15;
    ctx.beginPath(); ctx.moveTo(pmx, pmy); ctx.lineTo(hx, hy); ctx.stroke();
    ctx.strokeStyle = IRON; ctx.lineWidth = 9;
    ctx.beginPath(); ctx.moveTo(pmx, pmy); ctx.lineTo(hx, hy); ctx.stroke();
    ctx.strokeStyle = IRON_HI; ctx.lineWidth = 2.5;
    ctx.beginPath(); ctx.moveTo(pmx, pmy - 2); ctx.lineTo(hx, hy - 2); ctx.stroke();
    // leather grip wrap
    ctx.strokeStyle = '#4a3328'; ctx.lineWidth = 11;
    const wx0 = lerp(pmx, hx, 0.1), wy0 = lerp(pmy, hy, 0.1), wx1 = lerp(pmx, hx, 0.42), wy1 = lerp(pmy, hy, 0.42);
    ctx.beginPath(); ctx.moveTo(wx0, wy0); ctx.lineTo(wx1, wy1); ctx.stroke();
    ctx.strokeStyle = 'rgba(20,14,12,0.6)'; ctx.lineWidth = 1.4;
    for (let i = 0; i <= 5; i++) {
      const q = i / 5, x = lerp(wx0, wx1, q), y = lerp(wy0, wy1, q);
      ctx.beginPath(); ctx.moveTo(x - 3, y - 5); ctx.lineTo(x + 3, y + 5); ctx.stroke();
    }
    // pommel ring
    ctx.fillStyle = OUT; ctx.beginPath(); ctx.arc(pmx, pmy, 9, 0, TAU); ctx.fill();
    ctx.fillStyle = IRON_HI; ctx.beginPath(); ctx.arc(pmx, pmy, 6, 0, TAU); ctx.fill();
    ctx.fillStyle = IRON_DK; ctx.beginPath(); ctx.arc(pmx, pmy, 2.6, 0, TAU); ctx.fill();
    // head: local +y = mouth direction
    ctx.save();
    ctx.translate(hx, hy);
    ctx.rotate(face - Math.PI / 2);
    const cone = new Path2D();
    cone.moveTo(-13, -25);
    cone.quadraticCurveTo(-17, 2, -38, 20);
    cone.lineTo(38, 20);
    cone.quadraticCurveTo(17, 2, 13, -25);
    cone.quadraticCurveTo(0, -31, -13, -25);
    cone.closePath();
    if (ch) ch.shape(ctx, cone, { fill: IRON, outline: OUT, lw: 3, light: o.light || -1, box: [-40, -32, 40, 22], shade: 0.45, hi: 0.2, rim: '#9a917f', rimWidth: 2 });
    else { ctx.fillStyle = IRON; ctx.fill(cone); }
    // soot streaks
    ctx.strokeStyle = 'rgba(10,8,12,0.5)'; ctx.lineWidth = 2;
    ctx.beginPath(); ctx.moveTo(-6, -20); ctx.quadraticCurveTo(-10, 0, -20, 16); ctx.moveTo(7, -18); ctx.quadraticCurveTo(9, 2, 18, 15); ctx.stroke();
    // riveted band
    const band = new Path2D();
    band.moveTo(-20, -4); band.quadraticCurveTo(0, -1, 20, -4); band.lineTo(23, 4); band.quadraticCurveTo(0, 7, -23, 4); band.closePath();
    ctx.lineWidth = 2; ctx.strokeStyle = OUT; ctx.stroke(band); ctx.fillStyle = IRON_HI; ctx.fill(band);
    ctx.fillStyle = '#c9bea6';
    for (let i = -2; i <= 2; i++) { ctx.beginPath(); ctx.arc(i * 8.5, 1.4, 1.6, 0, TAU); ctx.fill(); }
    // mouth lip
    ctx.fillStyle = OUT; ctx.beginPath(); ctx.ellipse(0, 22, 42, 6.5, 0, 0, TAU); ctx.fill();
    ctx.fillStyle = IRON_HI; ctx.beginPath(); ctx.ellipse(0, 21, 39, 4, 0, 0, TAU); ctx.fill();
    const hot = Math.max(o.tele || 0, (o.smolder || 0) * 0.5);
    ctx.fillStyle = hot > 0.02 ? mixc('#2a1810', '#ffcf8a', hot) : '#120f14';
    ctx.beginPath(); ctx.ellipse(0, 23, 34, 2.4, 0, 0, TAU); ctx.fill();
    // finial ring at the apex (a snuffer's ring)
    ctx.strokeStyle = OUT; ctx.lineWidth = 6; ctx.beginPath(); ctx.arc(0, -34, 7, 0, TAU); ctx.stroke();
    ctx.strokeStyle = IRON_HI; ctx.lineWidth = 3; ctx.beginPath(); ctx.arc(0, -34, 7, 0, TAU); ctx.stroke();
    if (hot > 0.02) glow(ctx, 0, 26, 40 + 26 * hot, TELE, 0.65 * hot);
    ctx.restore();
  }

  /** Torso-local crack polylines, revealed progressively as the shell takes damage. */
  const CRACKS = [
    [[6, -64], [1, -56], [8, -48], [3, -40], [8, -31]],          // the seam over the core (always)
    [[-40, -46], [-31, -40], [-34, -30], [-26, -22]],
    [[30, -60], [24, -51], [29, -43]],
    [[-12, -62], [-17, -53], [-12, -47]],
    [[20, -34], [30, -29], [25, -19], [35, -12]],
    [[-22, -28], [-12, -22], [-15, -12]],
    [[38, -50], [44, -40]],
    [[-6, -24], [2, -16], [-3, -6]],
  ];
  const CORE_PTS = (() => { const a = []; for (let i = 0; i < 12; i++) a.push(1 + 0.28 * Math.sin(i * 2.7) + 0.12 * Math.cos(i * 5.3)); return a; })();

  /**
   * Draw the whole Effigy in facing-space (ctx already translated to the feet and mirrored).
   * p: pose; hands: {n:{x,y}, f:{x,y}} (or null = from the pose); o: {light, t, cracked, damage (0..1), tele,
   * statue, seed, flashMouth}
   */
  function drawEffigy(ctx, p, hands, o) {
    const ch = C();
    const t = o.t || 0, L = o.light == null ? -1 : o.light;
    const dmg = clamp(o.damage || 0, 0, 1);
    const cracked = !!o.cracked;
    // ---- frame: hip, torso transform, shoulders
    const hip = { x: 0, y: HIP_Y + p.crouch * 26 + p.kneel * 24 - p.stretch * 6 };
    const F = { hx: hip.x, hy: hip.y, c: Math.cos(p.lean), s: Math.sin(p.lean) };
    const shN = tpt(F, 33, -54), shF = tpt(F, -30, -56);
    const neck = tpt(F, 3, -68);
    const head = headOf(p), face = faceOf(p);
    const grip = { x: p.gx, y: p.gy };
    // hands
    let hn, hf;
    if (hands) { hn = hands.n; hf = hands.f; }
    else ({ n: hn, f: hf } = handTargets(p, shN, shF));
    const hammerBehind = p.held && (head.x < -18 || (head.y < -150 && head.x < 30));
    // ---- cape (behind everything)
    drawCape(ctx, F, p, t, L);
    // ---- far arm
    const armF = ik(shF.x, shF.y, hf.x, hf.y, ARM1, ARM2, (e) => e.y - e.x * 0.3);
    limb(ctx, shF.x, shF.y, armF.ex, armF.ey, 22, SHELL_FAR, L);
    limb(ctx, armF.ex, armF.ey, armF.hx, armF.hy, 20, SHELL_FAR, L);
    fist(ctx, armF.hx, armF.hy, 12, SHELL_FAR, L);
    // ---- hammer behind the body (raised / drawn back)
    const hopts = { light: L, tele: o.tele || 0, smolder: cracked ? 0.6 + 0.4 * Math.sin(t * 3) : 0 };
    if (p.held && hammerBehind) drawHammer(ctx, grip.x, grip.y, head.x, head.y, face, hopts);
    if (!p.held && o.drawLoose !== false) drawHammer(ctx, grip.x, grip.y, head.x, head.y, face, hopts);
    // ---- legs
    drawLegs(ctx, hip, p, L);
    // ---- far pauldron
    pauldron(ctx, F, -36, -58, 23, L, SHELL_FAR, false, 0);
    // ---- torso
    drawTorso(ctx, F, p, t, L, dmg, cracked, o);
    // ---- helm
    drawHelm(ctx, F, neck, p, t, L, cracked, o);
    // ---- near pauldron
    pauldron(ctx, F, 38, -57, 27, L, SHELL, true, cracked ? 1 : 0);
    // ---- hammer in front, then the near arm over the haft
    if (p.held && !hammerBehind) drawHammer(ctx, grip.x, grip.y, head.x, head.y, face, hopts);
    const armN = ik(shN.x, shN.y, hn.x, hn.y, ARM1, ARM2, (e) => e.y - e.x * 0.15);
    limb(ctx, shN.x, shN.y, armN.ex, armN.ey, 25, SHELL, L);
    vambrace(ctx, armN.ex, armN.ey, armN.hx, armN.hy, L);
    fist(ctx, armN.hx, armN.hy, 14, SHELL, L);
    if (p.held && p.sq > 0.5) {         // the near fist wraps over the haft
      ctx.strokeStyle = 'rgba(20,18,24,0.55)'; ctx.lineWidth = 1.6;
      ctx.beginPath(); ctx.moveTo(armN.hx - 6, armN.hy - 5); ctx.lineTo(armN.hx + 6, armN.hy + 5); ctx.stroke();
    }
  }

  /** Hand targets: on the haft when held, else the pose's rest position (kneeling: on the knee/floor). */
  function handTargets(p, shN, shF) {
    if (p.held) {
      const head = headOf(p);
      const dx = head.x - p.gx, dy = head.y - p.gy, d = Math.hypot(dx, dy) || 1;
      const k = p.sq < 0.5 ? 18 : 26;
      return { f: { x: p.gx, y: p.gy }, n: { x: p.gx + dx / d * k, y: p.gy + dy / d * k } };
    }
    return { n: { x: p.rhx, y: p.rhy }, f: { x: p.rhx - 34, y: p.rhy + 6 } };
    // (shoulders unused: rest targets are absolute so the hands settle predictably)
  }

  function fist(ctx, x, y, r, color, L) {
    ctx.fillStyle = OUT; ctx.beginPath(); ctx.arc(x, y, r + 3, 0, TAU); ctx.fill();
    ctx.fillStyle = color; ctx.beginPath(); ctx.arc(x, y, r, 0, TAU); ctx.fill();
    ctx.fillStyle = 'rgba(255,252,240,0.45)'; ctx.beginPath(); ctx.arc(x + L * r * 0.35, y - r * 0.35, r * 0.4, 0, TAU); ctx.fill();
    ctx.strokeStyle = 'rgba(20,18,24,0.35)'; ctx.lineWidth = 1.5;
    ctx.beginPath(); ctx.arc(x, y, r * 0.62, -0.4, 1.6); ctx.stroke();
  }
  function vambrace(ctx, x0, y0, x1, y1, L) {
    const mx = lerp(x0, x1, 0.55), my = lerp(y0, y1, 0.55);
    limb(ctx, x0, y0, mx, my, 21, SHELL, L);
    limb(ctx, mx, my, x1, y1, 25, SHELL_DK, L);
    ctx.strokeStyle = 'rgba(20,18,24,0.5)'; ctx.lineWidth = 1.6;
    const dx = x1 - x0, dy = y1 - y0, l = Math.hypot(dx, dy) || 1, nx = -dy / l * 12, ny = dx / l * 12;
    ctx.beginPath(); ctx.moveTo(mx + nx, my + ny); ctx.lineTo(mx - nx, my - ny); ctx.stroke();
  }

  function drawLegs(ctx, hip, p, L) {
    const st = Math.sin(p.walk) * p.stride, lift = Math.max(0, Math.cos(p.walk)) * p.stride * 0.35;
    const lift2 = Math.max(0, -Math.cos(p.walk)) * p.stride * 0.35;
    // standing feet → kneeling feet → airborne tuck
    let nfx = lerp(20 + st * 16, -48, p.kneel), nfy = lerp(-lift * 14, -2, p.kneel);
    let ffx = lerp(-18 - st * 16, 26, p.kneel), ffy = lerp(-lift2 * 14, 0, p.kneel);
    nfx = lerp(nfx, 12, p.stretch); nfy = lerp(nfy, -6, p.stretch);
    ffx = lerp(ffx, -22, p.stretch); ffy = lerp(ffy, -14, p.stretch);
    const hipN = { x: hip.x + 10, y: hip.y + 2 }, hipF = { x: hip.x - 10, y: hip.y };
    const kneeFwd = (e) => e.x * 2 - e.y * 0.2;
    const lf = ik(hipF.x, hipF.y, ffx, ffy, LEG1, LEG2, kneeFwd);
    const ln = ik(hipN.x, hipN.y, nfx, nfy, LEG1, LEG2, kneeFwd);
    for (const [lg, col, near] of [[lf, SHELL_FAR, false], [ln, SHELL, true]]) {
      const hp = near ? hipN : hipF;
      limb(ctx, hp.x, hp.y, lg.ex, lg.ey, near ? 27 : 24, col, L);
      limb(ctx, lg.ex, lg.ey, lg.hx, lg.hy - 4, near ? 23 : 21, col, L);
      // greave seam
      ctx.strokeStyle = 'rgba(20,18,24,0.4)'; ctx.lineWidth = 1.5;
      ctx.beginPath(); ctx.moveTo(lerp(lg.ex, lg.hx, 0.25) + 4, lerp(lg.ey, lg.hy, 0.25)); ctx.lineTo(lerp(lg.ex, lg.hx, 0.8) + 3, lerp(lg.ey, lg.hy, 0.8)); ctx.stroke();
      // knee cop
      const kc = new Path2D(); kc.ellipse(lg.ex + 3, lg.ey, near ? 12 : 10, near ? 10 : 9, 0.3, 0, TAU);
      const chh = C();
      if (chh) chh.shape(ctx, kc, { fill: near ? SHELL_HI : SHELL_DK, outline: OUT, lw: 2.5, light: L, box: [lg.ex - 12, lg.ey - 10, lg.ex + 14, lg.ey + 10], shade: 0.3 });
      // sabaton (toe forward; a kneeling back foot rests on its toe)
      const fx = lg.hx, fy = lg.hy;
      const kneelBack = near && p.kneel > 0.5;
      const sb = new Path2D();
      if (kneelBack) { sb.moveTo(fx - 4, fy - 14); sb.quadraticCurveTo(fx - 18, fy - 6, fx - 14, fy + 1); sb.lineTo(fx + 8, fy + 1); sb.quadraticCurveTo(fx + 10, fy - 10, fx - 4, fy - 14); }
      else { sb.moveTo(fx - 13, fy - 12); sb.quadraticCurveTo(fx + 4, fy - 16, fx + 22, fy - 4); sb.quadraticCurveTo(fx + 25, fy, fx + 21, fy + 1); sb.lineTo(fx - 14, fy + 1); sb.closePath(); }
      if (chh) chh.shape(ctx, sb, { fill: near ? SHELL : SHELL_FAR, outline: OUT, lw: 2.5, light: L, box: [fx - 16, fy - 16, fx + 24, fy + 2], shade: 0.4 });
    }
  }

  function drawCape(ctx, F, p, t, L) {
    const a = tpt(F, -38, -60), b = tpt(F, -8, -70);
    const sway = Math.sin(t * 1.3) * 5 + p.stretch * -14;
    const hemY = Math.min(-4, lerp(-10, -2, p.kneel)) + p.stretch * -30;
    const hx0 = a.x - 34 - p.kneel * 22 + sway, hx1 = b.x - 4 + sway * 0.5;
    const path = new Path2D();
    path.moveTo(b.x, b.y);
    path.quadraticCurveTo(lerp(b.x, hx1, 0.5) + 4, lerp(b.y, hemY, 0.5), hx1, hemY);
    const n = 6;
    for (let i = 1; i <= n; i++) {
      const q = i / n, x = lerp(hx1, hx0, q), y = hemY - (i % 2 ? 10 + 4 * Math.sin(t * 2 + i) : 0) - q * 4;
      path.lineTo(x, y);
    }
    path.quadraticCurveTo(lerp(a.x, hx0, 0.5) - 6, lerp(a.y, hemY, 0.45), a.x, a.y);
    path.closePath();
    const ch = C();
    if (ch) ch.shape(ctx, path, { fill: CLOTH_DK, outline: OUT, lw: 3, light: L, box: [hx0, a.y, b.x, hemY], shade: 0.5, hi: 0.08 });
    ctx.strokeStyle = 'rgba(0,0,0,0.25)'; ctx.lineWidth = 2;
    ctx.beginPath(); ctx.moveTo(lerp(a.x, b.x, 0.5), lerp(a.y, b.y, 0.5) + 6); ctx.quadraticCurveTo(lerp(hx0, hx1, 0.5) - 4, lerp(a.y, hemY, 0.5), lerp(hx0, hx1, 0.45), hemY - 6); ctx.stroke();
  }

  function pauldron(ctx, F, x, y, r, L, color, near, broken) {
    const ch = C();
    ctx.save();
    ctx.translate(F.hx, F.hy); ctx.rotate(Math.atan2(F.s, F.c));
    const path = new Path2D();
    path.moveTo(x - r, y + 8);
    path.bezierCurveTo(x - r * 1.05, y - r * 0.9, x + r * 1.05, y - r * 0.9, x + r, y + 8);
    path.quadraticCurveTo(x + r * 0.3, y + 14, x, y + 13);
    path.quadraticCurveTo(x - r * 0.4, y + 15, x - r, y + 8);
    path.closePath();
    if (ch) ch.shape(ctx, path, { fill: color, outline: OUT, lw: 3, light: L, box: [x - r, y - r, x + r, y + 14], shade: 0.38, hi: 0.25, rim: near ? '#fff4dc' : undefined });
    ctx.strokeStyle = 'rgba(20,18,24,0.42)'; ctx.lineWidth = 1.6;
    ctx.beginPath(); ctx.moveTo(x - r * 0.9, y + 2); ctx.quadraticCurveTo(x, y - 6, x + r * 0.9, y + 2); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(x - r * 0.75, y - 7); ctx.quadraticCurveTo(x, y - 14, x + r * 0.75, y - 7); ctx.stroke();
    // wax drips off the rim
    ctx.fillStyle = color;
    for (const [dx, len] of [[-0.55, 9], [0.1, 6], [0.6, 11]]) {
      const px = x + dx * r, py = y + 11;
      ctx.strokeStyle = OUT; ctx.lineWidth = 2;
      ctx.beginPath(); ctx.moveTo(px - 3, py); ctx.lineTo(px - 2.5, py + len); ctx.arc(px, py + len, 2.6, Math.PI, 0, true); ctx.lineTo(px + 3, py); ctx.closePath(); ctx.stroke(); ctx.fill();
    }
    if (broken) {        // phase 2: a chunk knocked out of the near pauldron, smoke-dark inside
      const hole = new Path2D();
      hole.moveTo(x + r * 0.2, y - r * 0.62); hole.lineTo(x + r * 0.62, y - r * 0.4); hole.lineTo(x + r * 0.5, y - r * 0.05);
      hole.lineTo(x + r * 0.78, y + 2); hole.lineTo(x + r * 0.3, y + 1); hole.lineTo(x + r * 0.12, y - r * 0.3); hole.closePath();
      ctx.fillStyle = '#1a161e'; ctx.fill(hole);
      ctx.strokeStyle = SHELL_HI; ctx.lineWidth = 1.2; ctx.stroke(hole);
    }
    ctx.restore();
  }

  function drawTorso(ctx, F, p, t, L, dmg, cracked, o) {
    const ch = C();
    ctx.save();
    ctx.translate(F.hx, F.hy); ctx.rotate(Math.atan2(F.s, F.c));
    // cuirass
    const body = new Path2D();
    body.moveTo(-29, 6);
    body.bezierCurveTo(-34, -12, -49, -30, -46, -50);
    body.quadraticCurveTo(-47, -63, -34, -66);
    body.quadraticCurveTo(2, -74, 37, -65);
    body.quadraticCurveTo(50, -60, 48, -48);
    body.bezierCurveTo(48, -28, 36, -12, 31, 6);
    body.quadraticCurveTo(0, 12, -29, 6);
    body.closePath();
    if (ch) ch.shape(ctx, body, { fill: SHELL, outline: OUT, lw: 3, light: L, box: [-48, -72, 50, 10], shade: 0.42, hi: 0.3, rim: '#fff6e2', rimWidth: 2.5 });
    else { ctx.fillStyle = SHELL; ctx.fill(body); }
    // breastplate edge (plackart) + centre ridge
    ctx.strokeStyle = 'rgba(30,26,34,0.45)'; ctx.lineWidth = 2;
    ctx.beginPath(); ctx.moveTo(-40, -30); ctx.quadraticCurveTo(4, -14, 44, -30); ctx.stroke();
    ctx.strokeStyle = 'rgba(212,173,98,0.55)'; ctx.lineWidth = 1.6;      // the Guard's faded gilt trim
    ctx.beginPath(); ctx.moveTo(-39, -33); ctx.quadraticCurveTo(4, -17, 43, -33); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(-33, -62); ctx.quadraticCurveTo(2, -69, 35, -61); ctx.stroke();
    ctx.strokeStyle = 'rgba(255,250,236,0.55)'; ctx.lineWidth = 2;
    ctx.beginPath(); ctx.moveTo(10, -66); ctx.quadraticCurveTo(13, -48, 9, -32); ctx.stroke();
    // wax runs down from the shoulders
    ctx.fillStyle = SHELL_HI;
    for (const [x, y, l] of [[-30, -60, 14], [26, -62, 10], [-8, -66, 8]]) {
      ctx.beginPath(); ctx.moveTo(x - 2.5, y); ctx.lineTo(x - 2, y + l); ctx.arc(x, y + l, 2.2, Math.PI, 0, true); ctx.lineTo(x + 2.5, y); ctx.closePath(); ctx.fill();
    }
    // cracks (more as the shell takes damage; the seam over the core always shows)
    const n = 1 + Math.floor(dmg * (CRACKS.length - 1) + 0.0001);
    for (let i = 0; i < Math.min(n, CRACKS.length); i++) crackLine(ctx, CRACKS[i], cracked);
    // the core: the shell splits open over a swirl of Pall smoke
    if (p.open > 0.02) drawCore(ctx, p.open, t, cracked);
    else if (cracked || o.leak) {        // smoke leaking through the seam
      glow(ctx, 5, -46, 20, CORE, 0.18);
    }
    // belt
    const belt = new Path2D();
    belt.moveTo(-31, -2); belt.quadraticCurveTo(0, 5, 33, -2); belt.lineTo(33, 7); belt.quadraticCurveTo(0, 14, -31, 7); belt.closePath();
    ctx.lineWidth = 2.5; ctx.strokeStyle = OUT; ctx.stroke(belt); ctx.fillStyle = '#4a3428'; ctx.fill(belt);
    ctx.fillStyle = GOLD; ctx.fillRect(6, 0, 10, 8); ctx.fillStyle = '#4a3428'; ctx.fillRect(9, 2.5, 4, 3);
    // tabard: the Queen's flame on faded crimson, ragged hem
    const tab = new Path2D();
    tab.moveTo(-14, 6); tab.lineTo(26, 6);
    tab.lineTo(27 + Math.sin(t * 1.7) * 1.5, 30);
    const hem = [[27, 44], [20, 38], [14, 47], [7, 40], [0, 49], [-6, 41], [-12, 46]];
    for (const [x, y] of hem) tab.lineTo(x + Math.sin(t * 1.7 + x * 0.1) * 1.5, y - p.kneel * 8);
    tab.lineTo(-15, 26); tab.closePath();
    if (ch) ch.shape(ctx, tab, { fill: CLOTH, outline: OUT, lw: 2.5, light: L, box: [-15, 6, 28, 48], shade: 0.4, hi: 0.1 });
    // the flame sigil
    ctx.fillStyle = GOLD;
    ctx.beginPath(); ctx.moveTo(6, 15); ctx.quadraticCurveTo(13, 23, 9, 30); ctx.quadraticCurveTo(6, 34, 3, 30); ctx.quadraticCurveTo(0, 23, 6, 15); ctx.fill();
    ctx.fillRect(1, 33, 10, 2.2);
    ctx.restore();
  }

  function crackLine(ctx, pts, glowy) {
    ctx.lineCap = 'round'; ctx.lineJoin = 'round';
    ctx.strokeStyle = 'rgba(255,252,240,0.6)'; ctx.lineWidth = 1.2;
    ctx.beginPath(); ctx.moveTo(pts[0][0] + 1, pts[0][1] + 1); for (let i = 1; i < pts.length; i++) ctx.lineTo(pts[i][0] + 1, pts[i][1] + 1); ctx.stroke();
    ctx.strokeStyle = glowy ? '#3d3448' : CRACK; ctx.lineWidth = 2.2;
    ctx.beginPath(); ctx.moveTo(pts[0][0], pts[0][1]); for (let i = 1; i < pts.length; i++) ctx.lineTo(pts[i][0], pts[i][1]); ctx.stroke();
    if (glowy) {
      ctx.strokeStyle = 'rgba(205,198,228,0.55)'; ctx.lineWidth = 0.9;
      ctx.beginPath(); ctx.moveTo(pts[0][0], pts[0][1]); for (let i = 1; i < pts.length; i++) ctx.lineTo(pts[i][0], pts[i][1]); ctx.stroke();
    }
  }

  function drawCore(ctx, open, t, cracked) {
    const cx = 5, cy = -40, rx = 6 + 23 * open, ry = 8 + 25 * open;
    glow(ctx, cx, cy, 70 * open, CORE, 0.35 * open);
    const hole = new Path2D();
    for (let i = 0; i < CORE_PTS.length; i++) {
      const a = i / CORE_PTS.length * TAU, r = CORE_PTS[i];
      const x = cx + Math.cos(a) * rx * r, y = cy + Math.sin(a) * ry * r;
      if (i) hole.lineTo(x, y); else hole.moveTo(x, y);
    }
    hole.closePath();
    ctx.fillStyle = '#100d14'; ctx.fill(hole);
    ctx.save();
    ctx.clip(hole);
    glow(ctx, cx, cy, 34 + 14 * open, '#e6e0fa', 0.75 * open + 0.12 * Math.sin(t * 6));
    // swirling smoke inside the shell
    for (let i = 0; i < 5; i++) {
      const a = t * (1.6 + i * 0.3) + i * 1.3, r = (6 + i * 3.5) * open;
      ctx.fillStyle = 'rgba(160,166,184,' + (0.22 + 0.06 * i).toFixed(3) + ')';
      ctx.beginPath(); ctx.arc(cx + Math.cos(a) * r, cy + Math.sin(a * 1.3) * r * 1.2, 6 + 2 * i * open, 0, TAU); ctx.fill();
    }
    glow(ctx, cx, cy + 2, 18 * open, '#ffffff', 0.7 * open);
    ctx.fillStyle = cracked ? '#fff0d8' : '#f6f4ff';
    ctx.globalAlpha *= 0.75 + 0.25 * Math.sin(t * 9);
    ctx.beginPath(); ctx.arc(cx, cy + 2, 6 * open, 0, TAU); ctx.fill();
    ctx.restore();
    ctx.strokeStyle = SHELL_HI; ctx.lineWidth = 2.2; ctx.stroke(hole);
    ctx.strokeStyle = 'rgba(20,18,24,0.7)'; ctx.lineWidth = 1; ctx.stroke(hole);
    // splinters bent outward around the break
    ctx.fillStyle = SHELL_HI;
    for (let i = 0; i < CORE_PTS.length; i += 3) {
      const a = i / CORE_PTS.length * TAU, r = CORE_PTS[i];
      const x = cx + Math.cos(a) * rx * r, y = cy + Math.sin(a) * ry * r;
      ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x + Math.cos(a + 0.5) * 7 * open, y + Math.sin(a + 0.5) * 7 * open); ctx.lineTo(x + Math.cos(a) * 9 * open, y + Math.sin(a) * 9 * open); ctx.closePath(); ctx.fill();
    }
    const ch = C();
    if (ch && open > 0.3) ch.pallSmoke(ctx, cx, cy - ry * 0.5, t, { count: 6, height: 70, spread: 16, size: 9, alpha: 0.4 * open, color: '#a7a9bd', seed: 11, speed: 0.8 });
  }

  function drawHelm(ctx, F, neck, p, t, L, cracked, o) {
    const ch = C();
    ctx.save();
    ctx.translate(neck.x, neck.y);
    ctx.rotate(Math.atan2(F.s, F.c) + p.head);
    // gorget
    const gor = new Path2D();
    gor.moveTo(-17, 4); gor.quadraticCurveTo(2, 12, 21, 4); gor.lineTo(19, -6); gor.quadraticCurveTo(2, -1, -15, -6); gor.closePath();
    if (ch) ch.shape(ctx, gor, { fill: SHELL_DK, outline: OUT, lw: 2.5, light: L, box: [-17, -6, 21, 10], shade: 0.4 });
    // crest (a fin of melted wax)
    const crest = new Path2D();
    crest.moveTo(-17, -42); crest.quadraticCurveTo(-14, -60, 6, -62); crest.quadraticCurveTo(20, -60, 22, -47);
    crest.lineTo(14, -44); crest.quadraticCurveTo(4, -52, -8, -40); crest.closePath();
    if (ch) ch.shape(ctx, crest, { fill: SHELL_DK, outline: OUT, lw: 2.5, light: L, box: [-17, -62, 22, -40], shade: 0.35 });
    // great helm
    const helm = new Path2D();
    helm.moveTo(-19, -2); helm.lineTo(-21, -30);
    helm.quadraticCurveTo(-21, -50, 1, -51);
    helm.quadraticCurveTo(25, -51, 26, -30);
    helm.lineTo(25, -2); helm.quadraticCurveTo(3, 4, -19, -2); helm.closePath();
    if (ch) ch.shape(ctx, helm, { fill: SHELL, outline: OUT, lw: 3, light: L, box: [-21, -51, 26, 2], shade: 0.4, hi: 0.32, rim: '#fff6e2' });
    else { ctx.fillStyle = SHELL; ctx.fill(helm); }
    // visor slit (front-biased) and breaths
    const vis = new Path2D();
    vis.moveTo(-8, -31); vis.lineTo(26, -32); vis.lineTo(26, -24); vis.lineTo(-7, -24); vis.closePath();
    ctx.fillStyle = '#0d0b10'; ctx.fill(vis);
    ctx.fillStyle = '#0d0b10';
    for (const [x, y] of [[13, -15], [18, -15], [23, -15], [15.5, -10], [20.5, -10]]) { ctx.beginPath(); ctx.arc(x, y, 1.5, 0, TAU); ctx.fill(); }
    ctx.strokeStyle = 'rgba(255,250,236,0.55)'; ctx.lineWidth = 1.6;
    ctx.beginPath(); ctx.moveTo(-8, -34); ctx.lineTo(25, -35); ctx.stroke();
    if (cracked) {       // a split down the helm, smoke behind it
      ctx.strokeStyle = '#1a161e'; ctx.lineWidth = 2.6;
      ctx.beginPath(); ctx.moveTo(-4, -50); ctx.lineTo(-8, -42); ctx.lineTo(-3, -37); ctx.lineTo(-9, -31); ctx.stroke();
      ctx.strokeStyle = 'rgba(205,198,228,0.5)'; ctx.lineWidth = 1; ctx.stroke();
    }
    // eyes in the slit
    const eb = p.eyes;
    if (eb > 0.02 && ch) {
      const col = cracked ? EMBER : '#f4f8ff';
      ch.eyes(ctx, 13, -27.5, { kind: 'pinprick', size: 26, gap: 13, color: col, alpha: eb, blink: o.blink || 0 });
      if (o.tele > 0) glow(ctx, 13, -27.5, 26, cracked ? EMBER : TELE, 0.45 * o.tele);
    }
    // the dead wick, still smoking
    if (ch) {
      const tip = ch.wick(ctx, 0, -60, { len: 11, bend: -5, width: 3.4, curl: -3 });
      if (!o.statue || o.smoke) ch.pallSmoke(ctx, tip[0], tip[1], t, { count: cracked ? 7 : 5, height: 80, spread: 12, size: 7, alpha: o.statue ? 0.18 : 0.32, color: PALL, seed: 3, drift: -6 });
    }
    ctx.restore();
  }

  /** The broken shell after the fight (facing-space; feet line at 0). */
  function drawRemains(ctx, t, L) {
    const ch = C();
    // a low heap of wax rubble
    const heap = new Path2D();
    heap.moveTo(-70, 0); heap.quadraticCurveTo(-56, -18, -30, -20); heap.quadraticCurveTo(-8, -30, 18, -22); heap.quadraticCurveTo(52, -18, 66, 0); heap.closePath();
    if (ch) ch.shape(ctx, heap, { fill: SHELL_DK, outline: OUT, lw: 2.5, light: L, box: [-70, -30, 66, 0], shade: 0.45 });
    // the hammer, laid down (mouth to the floor)
    drawHammer(ctx, 26, -8.5, 156, -25, -0.127 + Math.PI / 2, { light: L });
    // the hollow cuirass, split open, lying on its back
    ctx.save();
    ctx.translate(-14, -24); ctx.rotate(-1.25);
    const body = new Path2D();
    body.moveTo(-20, 4); body.bezierCurveTo(-24, -10, -34, -22, -32, -36); body.quadraticCurveTo(-32, -46, -22, -48);
    body.quadraticCurveTo(2, -54, 26, -47); body.quadraticCurveTo(35, -43, 34, -34); body.bezierCurveTo(34, -20, 26, -8, 22, 4); body.closePath();
    if (ch) ch.shape(ctx, body, { fill: SHELL, outline: OUT, lw: 3, light: L, box: [-34, -54, 35, 6], shade: 0.45, hi: 0.25 });
    ctx.fillStyle = '#120f15';
    ctx.beginPath(); ctx.moveTo(2, -44); ctx.lineTo(10, -34); ctx.lineTo(4, -24); ctx.lineTo(12, -12); ctx.lineTo(-2, -8); ctx.lineTo(-8, -22); ctx.lineTo(-4, -34); ctx.closePath(); ctx.fill();
    crackLine(ctx, [[-24, -34], [-16, -28], [-20, -18]], false);
    ctx.restore();
    // shell shards
    ctx.fillStyle = SHELL;
    for (const [x, y, s, a] of [[-58, -6, 9, 0.4], [48, -5, 7, -0.6], [-90, -4, 6, 1.2], [84, -3, 5, 0.2], [100, -4, 8, -1.1]]) {
      ctx.save(); ctx.translate(x, y); ctx.rotate(a);
      ctx.beginPath(); ctx.moveTo(-s, s * 0.5); ctx.lineTo(-s * 0.2, -s * 0.7); ctx.lineTo(s, -s * 0.2); ctx.lineTo(s * 0.5, s * 0.6); ctx.closePath();
      ctx.lineWidth = 2; ctx.strokeStyle = OUT; ctx.stroke(); ctx.fill();
      ctx.restore();
    }
    // the great helm on its side, face to the floor, its wick cold
    ctx.save();
    ctx.translate(-50, -16); ctx.rotate(-1.9);
    const helm = new Path2D();
    helm.moveTo(-17, 0); helm.lineTo(-18, -24); helm.quadraticCurveTo(-18, -40, 1, -41); helm.quadraticCurveTo(21, -41, 22, -24); helm.lineTo(21, 0); helm.quadraticCurveTo(2, 4, -17, 0); helm.closePath();
    if (ch) ch.shape(ctx, helm, { fill: SHELL, outline: OUT, lw: 3, light: L, box: [-18, -41, 22, 2], shade: 0.45 });
    ctx.fillStyle = '#0d0b10'; ctx.fillRect(-6, -26, 27, 6);
    ctx.strokeStyle = '#141016'; ctx.lineWidth = 3; ctx.beginPath(); ctx.moveTo(0, -41); ctx.quadraticCurveTo(-2, -48, -6, -51); ctx.stroke();
    ctx.restore();
    // one last thread of Pall from the empty shell
    if (ch) ch.pallSmoke(ctx, -10, -30, t, { count: 3, height: 70, spread: 10, size: 6, alpha: 0.16, color: PALL, seed: 7, speed: 0.3 });
  }

  // ---------------------------------------------------------------------------------------------------------
  // Projectiles
  // ---------------------------------------------------------------------------------------------------------
  /** Floor shockwave: a rolling crest of pale wax dust with a hot amber core line. Jump it. */
  class EffigyWave extends G.Projectile.Wave {
    constructor(props) { super(Object.assign({ w: 34, h: 50, life: 5, color: '#ffcf8a' }, props)); this.puff = 0; }
    update(dt) {
      super.update(dt);
      if (this.dead) return;
      this.puff += dt;
      if (G.fx && Math.random() < dt * 22) G.fx.burst('dust', this.cx - this.dir * 10, this.y + this.h, { count: 1, color: '#c9bba3', angle: -Math.PI / 2 - this.dir * 0.9, speed: 140, size: 4 });
    }
    burstFx(why) {
      if (!G.fx) return;
      G.fx.burst('dust', this.cx, this.y + this.h, { count: 6, color: '#c9bba3', speed: 120 });
      if (why === 'terrain') G.fx.burst('shard', this.cx, this.y + this.h - 6, { count: 4, color: '#d9cfbd', speed: 200 });
    }
    draw(ctx, t) {
      const d = this.dir, bx = this.cx, by = this.y + this.h, H = this.h;
      const life = clamp(1 - Math.max(0, this.age - this.life + 0.3) / 0.3, 0, 1);
      glow(ctx, bx, by - H * 0.3, H * 1.25, '#ffcf8a', 0.5 * life);
      ctx.save();
      ctx.globalAlpha *= life;
      // trailing ash lobes then the leading crest
      for (let i = 3; i >= 0; i--) {
        const k = 1 - i * 0.2, fl = 0.9 + 0.1 * Math.sin(t * 30 + i * 2 + this.seed);
        const x0 = bx - d * i * 13, hh = H * k * fl, ww = 15 * k;
        ctx.beginPath();
        ctx.moveTo(x0 - ww, by);
        ctx.quadraticCurveTo(x0 - ww, by - hh, x0 + d * ww * 0.4, by - hh);
        ctx.quadraticCurveTo(x0 + d * ww * 1.3, by - hh * 0.92, x0 + d * ww * 0.9, by - hh * 0.55);
        ctx.quadraticCurveTo(x0 + d * ww * 0.45, by - hh * 0.62, x0 + d * ww * 0.6, by - hh * 0.4);
        ctx.quadraticCurveTo(x0 + ww, by - hh * 0.2, x0 + ww, by);
        ctx.closePath();
        ctx.lineWidth = 3; ctx.strokeStyle = OUT; ctx.stroke();
        ctx.fillStyle = i === 0 ? '#efe4cf' : mixc('#efe4cf', '#8f8576', i * 0.22);
        ctx.fill();
      }
      // hot core line along the floor and a bright lip on the crest
      ctx.globalCompositeOperation = 'lighter';
      ctx.fillStyle = 'rgba(255,207,138,0.85)';
      ctx.fillRect(bx - 44 * (d > 0 ? 1 : 0.2), by - 3, 52, 3);
      ctx.strokeStyle = 'rgba(255,230,180,0.8)'; ctx.lineWidth = 2;
      ctx.beginPath(); ctx.moveTo(bx - d * 4, by - H * 0.95); ctx.quadraticCurveTo(bx + d * 12, by - H * 0.9, bx + d * 10, by - H * 0.55); ctx.stroke();
      ctx.restore();
    }
  }
  G.registerProjectile('effigy_wave', EffigyWave, { r: 16, gravity: 0, life: 5, color: '#ffcf8a', damage: 1 });

  /** A chunk of the vault: tumbles down, shatters on the floor. */
  class EffigyDebris extends G.Projectile {
    constructor(props) {
      super(props);
      this.rot = Math.random() * TAU; this.spin = rnd(-5, 5);
      this.shape = []; for (let i = 0; i < 7; i++) this.shape.push(0.75 + Math.random() * 0.4);
    }
    update(dt) { this.rot += this.spin * dt; super.update(dt); }
    hitBox() { const s = this.r * 0.8; return { x: this.cx - s, y: this.cy - s, w: s * 2, h: s * 2 }; }
    burstFx(why) {
      if (!G.fx || why === 'clear') { if (G.fx) G.fx.burst('dust', this.cx, this.cy, { count: 4, color: '#a89c88' }); return; }
      G.fx.burst('shard', this.cx, this.cy, { count: 8, color: '#cbbfa8', speed: 260 });
      G.fx.burst('dust', this.cx, this.cy + this.r * 0.6, { count: 7, color: '#a89c88', speed: 150 });
      G.sfxAt('effigy_debris', this.cx, { vol: 0.8 });
    }
    draw(ctx, t) {
      const r = this.r;
      // its shadow on the floor keeps marking the spot after the warning column is gone
      const fy = this.owner && this.owner.feetY;
      if (fy && fy > this.cy && teleOn()) {
        const k = clamp(1 - (fy - this.cy) / 480, 0.15, 1);
        ctx.fillStyle = 'rgba(10,8,12,' + (0.25 + 0.4 * k).toFixed(3) + ')';
        ctx.beginPath(); ctx.ellipse(this.cx, fy - 1, r * (0.7 + 0.7 * k), 3 + 3 * k, 0, 0, TAU); ctx.fill();
        ctx.fillStyle = 'rgba(255,207,138,' + (0.18 + 0.3 * k).toFixed(3) + ')';
        ctx.fillRect(this.cx - r * 1.2, fy - 3, r * 2.4, 3);
      }
      ctx.save();
      ctx.translate(this.cx, this.cy); ctx.rotate(this.rot);
      ctx.beginPath();
      for (let i = 0; i < this.shape.length; i++) {
        const a = i / this.shape.length * TAU, rr = r * this.shape[i];
        if (i) ctx.lineTo(Math.cos(a) * rr, Math.sin(a) * rr); else ctx.moveTo(Math.cos(a) * rr, Math.sin(a) * rr);
      }
      ctx.closePath();
      ctx.lineWidth = 3; ctx.strokeStyle = OUT; ctx.stroke();
      ctx.fillStyle = '#9d927f'; ctx.fill();
      ctx.fillStyle = 'rgba(240,232,214,0.6)';
      ctx.beginPath(); ctx.arc(-r * 0.25, -r * 0.3, r * 0.35, 0, TAU); ctx.fill();
      ctx.strokeStyle = CRACK; ctx.lineWidth = 1.5;
      ctx.beginPath(); ctx.moveTo(-r * 0.4, r * 0.1); ctx.lineTo(r * 0.1, -r * 0.05); ctx.lineTo(r * 0.3, r * 0.4); ctx.stroke();
      ctx.restore();
      void t;
    }
  }
  G.registerProjectile('effigy_debris', EffigyDebris, { r: 15, gravity: 2000, life: 3, color: '#cbbfa8', damage: 1 });

  // ---------------------------------------------------------------------------------------------------------
  // The boss
  // ---------------------------------------------------------------------------------------------------------
  const STAGGER_DMG = 70, STAGGER_TIME = 2.5, CORE_MULT = 1.5;
  const WAKE = { eyes: 0.75, rise0: 0.85, raise: 1.55, swing: 2.05, slam: 2.15 };   // the statue wakes (s)

  class Effigy extends G.Boss {
    constructor(props) {
      super(props, {
        hp: 200, w: 108, h: 168,
        phases: [0.5],
        stagger: { damage: STAGGER_DMG, time: STAGGER_TIME },
        rest: [0.6, 1.05],
        phaseRest: [1, 0.82],          // QA difficulty pass: 0.72 left no Kindle window (0.9 s) in phase 2
        introTime: 0.75,
        defeatStyle: 'custom',
        contactInset: 10,
        puddleTime: 4,
        colors: { body: '#e2dacb', dark: '#6a6258', hit: '#fbf7ee', smoke: '#7e879a', tele: TELE, puddle: '#cfc6b4' },
        light: { r: 240, color: '#e8dfcc', intensity: 0.32, dy: -30 },
        attacks: {
          slam: { weight: 3, range: [0, 300] },
          // never against a cornered player: the lunging sweep + chop mark leave no gap within ~265 px of a wall
          combo: { weight: 3, range: [0, 250], cooldown: 1.2, when() { return this.comboRoom(); } },
          leap: { weight(d) { return d > 380 ? 4 : 1.1; }, range: [190, 5000], cooldown: 1.0 },
          debris: { weight: 2.2, phase: 2, cooldown: 7.5 },
          hurl: { weight: 3.4, phase: 2, range: [210, 1500], cooldown: 6, uninterruptible: true, when() { return this.hurlRoom(); } },
          awaken: { weight: 0, phase: 99, uninterruptible: true },
        },
      });
      this.pose = pose(P.statue);
      this.poseT = pose(P.statue);
      this.poseRate = 10;
      this.hands = null;
      this.cracked = false;
      this.pendingAwaken = false;
      this.hammer = null;           // the thrown hammer while it is away
      this.trail = [];              // recent hammer-head positions for swing streaks
      this.tele01 = 0;              // hammer telegraph glow
      this.waking = false; this.wakeT = 0;
      this.stepPhase = 0;
    }

    init() {
      super.init();
      const p = this.player;
      this.facing = p ? (this.dx(p) >= 0 ? 1 : -1) : 1;
      this.computeBounds();
    }

    /** Walkable span for the body (px, left/right x of free columns at body height around the spawn). */
    computeBounds() {
      const room = this.room;
      if (!room) { this.bx0 = 0; this.bx1 = 99999; return; }
      const rFloor = Math.floor((this.y + this.h + 1) / TILE);
      const r0 = Math.max(0, Math.floor((this.y + 2) / TILE)), r1 = rFloor - 1;
      const free = (c) => { for (let r = r0; r <= r1; r++) if (G.Physics.isSolidTile(room.tileAt(c, r))) return false; return c >= 0 && c < room.cols; };
      let c = Math.floor(this.cx / TILE);
      let a = c; while (a - 1 >= 0 && free(a - 1)) a--;
      let b = c; while (b + 1 < room.cols && free(b + 1)) b++;
      this.bx0 = a * TILE; this.bx1 = (b + 1) * TILE;
    }
    clampX(x, m) { m = m == null ? 10 : m; return clamp(x, this.bx0 + this.w / 2 + m, this.bx1 - this.w / 2 - m); }
    get feetY() { return this.y + this.h; }
    /** World point of a facing-space point. */
    wpt(x, y) { return { x: this.cx + this.facing * x, y: this.feetY + y }; }
    /** Space ahead of the body centre to the bounds (px). */
    spaceAhead(dir) { dir = dir || this.facing; return dir > 0 ? this.bx1 - this.cx : this.cx - this.bx0; }
    reachK() { return clamp((this.spaceAhead() - 150) / 80, 0, 1); }

    // ------------------------------------------------------------------ pose
    want(p, rate) { this.poseT = p; this.poseRate = rate == null ? 12 : rate; }
    updatePose(dt) {
      const tp = this.poseT, cp = this.pose;
      const a = this.poseRate <= 0 ? 1 : 1 - Math.exp(-this.poseRate * dt);
      for (const k of NUM_KEYS) cp[k] += ((tp[k] == null ? BASE_POSE[k] : tp[k]) - cp[k]) * a;
      cp.held = tp.held == null ? 1 : tp.held;
      // hands follow their targets (smoothly when the hammer changes hands)
      const F = { hx: 0, hy: HIP_Y + cp.crouch * 26 + cp.kneel * 24 - cp.stretch * 6, c: Math.cos(cp.lean), s: Math.sin(cp.lean) };
      const tg = handTargets(cp, tpt(F, 33, -54), tpt(F, -30, -56));
      if (!this.hands) this.hands = { n: Object.assign({}, tg.n), f: Object.assign({}, tg.f) };
      const ha = cp.held ? 1 : 1 - Math.exp(-18 * dt);
      for (const k of ['n', 'f']) { this.hands[k].x += (tg[k].x - this.hands[k].x) * ha; this.hands[k].y += (tg[k].y - this.hands[k].y) * ha; }
      // swing streak trail
      const h = headOf(cp);
      this.trail.push(h.x, h.y);
      if (this.trail.length > 10) this.trail.splice(0, 2);
      this.tele01 = Math.max(0, this.tele01 - dt * 2.5);
    }
    headWorld(p) { const h = headOf(p || this.poseT); return this.wpt(h.x, h.y); }
    headRect(p, padX, padY) {
      const h = this.headWorld(p);
      const px = padX == null ? 40 : padX, py = padY == null ? 38 : padY;
      const r = { x: h.x - px, y: h.y - py, w: px * 2, h: py * 2 };
      const fy = this.feetY; if (r.y + r.h > fy) r.h = Math.max(4, fy - r.y);
      return r;
    }

    // ------------------------------------------------------------------ fight start: the statue wakes
    beginFight() {
      if (this.fightStarted || this._starting || this.waking) return;
      this.waking = true; this.wakeT = 0;
      this.want(P.statue, 0);
      const cam = G.camera;
      const offscreen = cam && typeof cam.visible === 'function' && !cam.visible(this.x - 40, this.y - 60, this.w + 80, this.h + 60, -60);
      if (offscreen && G.game && typeof cam.follow === 'function') {
        this._camProxy = { x: this.cx - 13, y: this.feetY - 54, w: 26, h: 54, facing: this.facing, vx: 0, vy: 0 };
        cam.follow(this._camProxy);
        G.game.lockPlayer('effigy_wake');
        this._locked = true;
      }
      G.sfxAt('effigy_wake', this.cx, { vol: 1 });
      if (G.game) G.game.shake(3, 1.2);
    }
    releaseCinematic() {
      if (this._camProxy && G.camera && G.camera.target === this._camProxy) G.camera.follow(G.game && G.game.player);
      this._camProxy = null;
      if (this._locked && G.game) G.game.unlockPlayer('effigy_wake');
      this._locked = false;
    }
    introUpdate(dt) {
      if (this.grounded) this.vx = 0;
      if (!this.waking) { if (!this.fightStarted) this.want(P.statue, 0); else this.want(P.stand, 8); return; }
      const w = (this.wakeT += dt);
      const fx = this.facing;
      if (w < WAKE.eyes) {
        this.want(P.statue, 0);
        if (G.fx && Math.random() < dt * 14) G.fx.burst('dust', this.cx + rnd(-50, 50), this.y + rnd(30, 120), { count: 1, color: '#bdb2a0', angle: Math.PI / 2, spread: 0.4, speed: 30 });
      } else if (w < WAKE.rise0) {
        if (this.once('eyes')) {
          if (G.game && typeof G.game.startBossMusic === 'function') G.game.startBossMusic(this.music);
          const e = this.wpt(16, -150);
          if (G.fx) { G.fx.burst('flash', e.x, e.y, { r: 46, color: '#ffffff', life: 0.18 }); G.fx.burst('smoke', this.cx, this.y + 70, { count: 8, color: PALL, alpha: 0.45, size: 12 }); }
          G.sfxAt('effigy_crack', this.cx, { vol: 0.6 });
        }
        this.want(Object.assign(pose(P.statue), { eyes: 1 }), 14);
      } else if (w < WAKE.raise) {                         // rises from the knee, hammer still low
        const q = (w - WAKE.rise0) / (WAKE.raise - WAKE.rise0);
        this.want(q < 0.5 ? pose({ kneel: 0.45, lean: 0.14, head: 0.1, gx: 30, gy: -96, ha: 0.66 }) : P.stand, 6);
        if (this.once('stand')) G.sfxAt('effigy_grind', this.cx);
        if (G.fx && Math.random() < dt * 10) G.fx.burst('shard', this.cx + rnd(-40, 40), this.y + 40, { count: 1, color: SHELL, speed: 90 });
      } else if (w < WAKE.swing) {                         // hauls the hammer overhead
        if (this.once('raise')) G.sfxAt('effigy_raise', this.cx);
        this.want(P.raise, 8); this.tele01 = 0.6;
      } else if (w < WAKE.slam + 0.12) {                   // and brings it down: the hall shakes
        const k = this.reachK();
        this.want(pose(Object.assign({ lean: 0.3, crouch: 0.3 }, slamGrip(k))), 26);
        if (this.once('swing')) G.sfxAt('effigy_swing', this.cx);
        if (w >= WAKE.slam && this.once('slam')) this.impactFx(this.headWorld(), 1.1);
      } else {
        this.want(P.stand, 6);
        if (this.once('start')) {
          this.waking = false;
          if (this._camProxy && G.camera) G.camera.follow(G.game && G.game.player);
          this._camReturnT = 0;
          G.Boss.prototype.beginFight.call(this);       // → startFight: card, roar, bossStart
        }
      }
      if (this._camProxy) { this._camProxy.x = this.cx - 13; this._camProxy.facing = fx; }
      if (w > 6) { this.waking = false; this.releaseCinematic(); G.Boss.prototype.beginFight.call(this); }    // safety
    }
    onFightStart() {
      // card + roar just played; the camera glides back to the player, control returns a beat later
      this._unlockAt = this.stateTime + 0.35;
    }

    // ------------------------------------------------------------------ main loop hooks
    think(dt) {
      if (this.state === 'idle' && this.pendingAwaken) { this.pendingAwaken = false; this.startAttack('awaken'); }
      if (this._unlockAt != null && (this.stateTime >= this._unlockAt || this.state !== 'intro')) { this._unlockAt = null; this.releaseCinematic(); }
      if (this.state !== 'intro' && this._locked && !this._unlockAt) this.releaseCinematic();
      super.think(dt);
      if (this.dying || this.dead) return;
      this.updateHammer(dt);
      this.updatePose(dt);
      this.ambient(dt);
    }
    pickAttack() {
      if (this.attackCount === 0 && this.playerDist() > 300) return 'leap';
      return super.pickAttack();
    }
    idleUpdate(dt) {
      this.face();
      const p = this.player;
      const d = this.playerDist();
      const speed = this.phase >= 2 ? 96 : 72;
      let walking = false;
      if (this.grounded && p && this.targetable(p) && d > 290) walking = this.approach(p, speed, { stop: 260 });
      else if (this.grounded) this.vx = 0;
      if (walking) {
        const before = Math.floor(this.stepPhase / Math.PI);
        this.stepPhase += dt * speed * 0.055;
        if (Math.floor(this.stepPhase / Math.PI) !== before) {
          G.sfxAt('effigy_step', this.cx, { vol: 0.7 });
          if (G.game) G.game.shake(1.5, 0.12);
          if (G.fx) G.fx.burst('dust', this.cx + this.facing * 20, this.feetY, { count: 3, color: '#a99d88', speed: 70 });
        }
      }
      const breathe = Math.sin(this.t * 1.7) * 0.04;
      this.want(pose({ crouch: 0.06 + breathe, walk: this.stepPhase, stride: walking ? 1 : 0, eyes: 1 }), walking ? 10 : 6);
    }
    staggerUpdate(dt) {
      super.staggerUpdate(dt);
      const s = this.stateTime, T = this.staggerTime || STAGGER_TIME;
      if (s < T - 0.5) {
        this.want(P.stagger, s < 0.3 ? 14 : 8);
        // the Pall leaks from the split shell's back edge (never over the exposed core: it must stay readable)
        if (G.fx && Math.random() < dt * 6) { const c = this.wpt(-34, -96); G.fx.burst('smoke', c.x, c.y, { count: 1, color: PALL, alpha: 0.3, size: 8, vy: -90, vx: -this.facing * 30 }); }
      } else {
        if (this.once('rise')) { G.sfxAt('effigy_grind', this.cx); this.tele = null; }
        this.want(pose({ kneel: 0.2, lean: 0.12, crouch: 0.3, open: 0.2 }), 9);
      }
    }
    /** The blow a floor mark promised will not come (stagger / defeat): put the marks out. Debris columns stay real. */
    clearMarks(columns) {
      for (const z of this.liveMarks()) z.remove();
      this.marks = [];
      if (columns) { for (const z of this.columns || []) if (!z.dead) z.remove(); this.columns = []; }
    }
    /** The framework's stagger burst puts 10 slow smoke puffs on the body centre — right over the exposed core for
     *  ~0.8 s. Keep it, but thinner and lifted above the shell, so the weak point reads at once. */
    stagger(time) {
      const fx = G.fx, burst = fx && fx.burst;
      if (burst) {
        fx.burst = (kind, x, y, o) => (kind === 'smoke'
          ? burst.call(fx, kind, x, y - 70, Object.assign({}, o, { count: 4, alpha: 0.3, vy: -170 }))
          : burst.call(fx, kind, x, y, o));
      }
      try { super.stagger(time); } finally { if (burst) fx.burst = burst; }
    }
    onStagger() {
      this.dropHammerIfThrown();
      this.clearMarks();
      G.sfxAt('effigy_crack', this.cx, { vol: 1 });
      if (G.fx) {
        const c = this.wpt(8, -90);
        G.fx.burst('wax', c.x, c.y, { count: 16, color: SHELL, speed: 360 });
        G.fx.burst('shard', c.x, c.y, { count: 10, color: SHELL_HI, speed: 320 });
        G.fx.burst('smoke', c.x, c.y - 30, { count: 6, color: PALL, alpha: 0.35, size: 12, speed: 90, vy: -150 });
      }
    }
    onStaggerEnd() {
      if (this.overlapsPlayer(0)) this.contactGrace = true;      // standing up inside the player is not a hit
    }
    /** Core window: the exposed smoke core takes +50 % damage. */
    modifyDamage(dmg, hit) {
      void hit;
      if (this.state === 'stagger' && this.stateTime > 0.15 && this.stateTime < (this.staggerTime || STAGGER_TIME) - 0.45) return Math.round(dmg * CORE_MULT);
      return dmg;
    }
    onHurt(hit, dmg) {
      if (this.state === 'stagger' && G.fx) {
        const c = this.wpt(8, -70);
        G.fx.burst('smoke', c.x, c.y, { count: 4, color: '#a8a4bc', alpha: 0.5, size: 10, speed: 120 });
        G.fx.burst('spark', c.x, c.y, { count: 6, color: CORE, speed: 380 });
      } else if (G.fx && dmg > 0 && Math.random() < 0.6) {
        const p = hit && hit.source; const sx = p ? p.x + (p.w || 0) / 2 : this.cx;
        G.fx.burst('shard', clamp(sx, this.x + 8, this.right - 8), this.y + rnd(40, 120), { count: 3, color: SHELL, speed: 220 });
      }
    }
    /** Damage inside the core window does not count toward the next stagger. */
    addStagger(dmg) { if (this.state === 'stagger') return; super.addStagger(dmg); }
    endAttack(rest) {
      super.endAttack(rest);
      const s = this.cfg.stagger;
      if (s && this.staggerDmg >= s.damage && this.canStagger() && !this.dying) this.stagger();
    }
    onPhase(phase) {
      if (phase >= 2) this.pendingAwaken = true;
      if (G.game) G.game.shake(5, 0.3);
      G.sfxAt('effigy_crack', this.cx, { vol: 0.8 });
    }
    onHit(hit) {
      if (this.waking || (this.state === 'intro' && !this.fightStarted)) return false;     // still a statue
      return super.onHit(hit);
    }
    hurtRect() {
      // (while dying the base sets hurtable = false; keep returning a rect so callers that measure the hit spot after
      //  a killing blow — e.g. player_bolt.onConnect — never get null)
      if (this.dying) return this;
      if (this.hidden || this.waking || (this.state === 'intro' && !this.fightStarted)) return null;
      if (this.state === 'stagger') { const h = 128; return { x: this.x, y: this.feetY - h, w: this.w, h }; }
      return this;
    }
    contactRect() {
      if (this.waking || this.state === 'intro' || this.state === 'stagger') return null;
      return super.contactRect();
    }

    // ------------------------------------------------------------------ attacks
    /** slam: raise overhead → the head lands on a marked spot → shockwaves both ways (phase 2: twice). */
    atk_slam(dt, s) {
      const d = this.stateData;
      this.vx = 0;
      const two = this.phase >= 2;
      if (this.once('start')) { this.face(); d.n = 0; d.t0 = 0; }
      const t = s - d.t0;
      const wind = d.n === 0 ? (two ? 0.62 : 0.7) : 0.5;
      if (this.once('w' + d.n)) {
        d.k = this.reachK();
        d.pose = pose(Object.assign({ lean: 0.32, crouch: 0.35 }, slamGrip(d.k)));
        const hw = this.headWorld(d.pose);
        d.wind = this.telegraph(wind, { sound: 'effigy_raise', shake: 1.2, x: this.wpt(-30, -300).x, y: this.wpt(-30, -300).y });
        this.markFloor(hw.x, 96, d.wind + 0.08);
      }
      if (t < d.wind) { this.want(P.raise, 9); this.tele01 = 1; return; }
      if (t < d.wind + 0.1) { this.want(d.pose, 26); if (this.once('sw' + d.n)) G.sfxAt('effigy_swing', this.cx); }
      else this.want(d.pose, 30);
      if (t >= d.wind + 0.06 && t <= d.wind + 0.2) this.strike(this.headRect(d.pose, 44, 42), { id: 'slam' + this.uid + ':' + this.strikeSerial + ':' + d.n });
      if (t >= d.wind + 0.1 && this.once('hit' + d.n)) {
        const hw = this.headWorld(d.pose);
        this.impactFx(hw, 1);
        const sp = two ? 440 : 410;
        for (const dir of [-1, 1]) this.wave(hw.x + dir * 34, dir, sp);
      }
      if (two && d.n === 0 && t > d.wind + 0.42) {        // follow-up: step and slam again
        d.n = 1; d.t0 = s;
        this.face();
        // the step forward (≤ 30 px, instant) never lands the body on a player who closed in to punish (QA: untelegraphed contact hit)
        const p = this.player;
        const ahead = p && this.targetable(p) ? (p.x + p.w / 2 - this.cx) * this.facing : 999;
        const step = clamp(ahead - (this.w / 2 - this.cfg.contactInset) - (p ? p.w / 2 : 0) - 20, 0, 30);
        if (this.room && step > 0 && !this.blockedAhead(this.facing)) G.Physics.move(this, this.room, this.facing * step, 0);
        return;
      }
      if (t > d.wind + 0.1 + 0.8) this.endAttack();
      else if (s > 5) this.endAttack();
    }

    /** leap: crouch → jump onto the player's spot (marked) → landing slam with shockwaves (phase 2: twice). */
    atk_leap(dt, s) {
      const d = this.stateData;
      if (this.once('start')) { d.n = 0; d.t0 = 0; }
      const t = s - d.t0;
      const p = this.player;
      if (!d.jumped) {
        if (this.grounded) this.vx = 0;
        if (this.once('crouch' + d.n)) {
          this.face();
          d.wind = this.telegraph(d.n === 0 ? (this.phase >= 2 ? 0.52 : 0.62) : 0.45, { sound: 'effigy_grind', shake: 1.4 });
        }
        this.want(P.leapCrouch, 10);
        if (t >= d.wind && this.grounded) {
          const tx = this.clampX(p && this.targetable(p) ? p.x + p.w / 2 : this.cx + this.facing * 400, 14);
          const dist = Math.abs(tx - this.cx);
          const apex = clamp(150 + dist * 0.1, 170, 215);     // high enough to run under (and never into the vault)
          const sol = this.leapTo(tx, this.feetY, apex, { maxVx: 1500 });
          d.land = this.clampX(this.cx + sol.vx * sol.t, 14);
          // KEPT (subtle) in standard / hardcore when the statue takes off outside the camera view (the hall is 2x the
          // view and the opening leap often starts off-screen): a dim band + floor cracks so the landing never comes
          // from nowhere. Taking off in view, the crouch + the visible leap are the tell (no mark) — same rule as Matron.
          const seen = !G.camera || typeof G.camera.visible !== 'function' || G.camera.visible(this.x, this.y, this.w, this.h, -40);
          this.markFloor(d.land, this.w + 70, Math.max(0.45, sol.t), seen ? null : { keep: 'subtle', cue: 'cracks' });
          d.jumped = true; d.jt = t;
          G.sfxAt('effigy_swing', this.cx, { pitch: 0.7 });
          G.sfxAt('jump', this.cx, { pitch: 0.45, vol: 1.2 });
          if (G.fx) G.fx.burst('dust', this.cx, this.feetY, { count: 12, color: '#a99d88', speed: 200 });
        }
        if (t > 3) this.endAttack();
        return;
      }
      // airborne
      if (!d.landed) {
        this.want(this.vy < 0 ? P.air : pose(Object.assign({}, P.air, { gx: 20, gy: -170, ha: -1.6 })), 8);
        if (this.grounded && t > d.jt + 0.08) {
          d.landed = true; d.lt = t;
          this.vx = 0;
          const k = this.reachK();
          d.pose = pose(Object.assign({ lean: 0.34, crouch: 0.7 }, slamGrip(k)));
          this.want(d.pose, 30);
          this.strike({ x: this.x - 26, y: this.feetY - 74, w: this.w + 52, h: 74 }, { id: 'land' + this.uid + ':' + this.strikeSerial + ':' + d.n });
          this.impactFx({ x: this.cx, y: this.feetY }, 1.25);
          const sp = this.phase >= 2 ? 430 : 400;
          this.wave(this.x - 18, -1, sp);
          this.wave(this.right + 18, 1, sp);
        } else if (t > d.jt + 3) { d.landed = true; d.lt = t; }
        return;
      }
      this.vx = 0;
      if (t - d.lt < 0.25) this.want(d.pose || P.stand, 30); else this.want(P.stand, 6);
      if (this.phase >= 2 && d.n === 0 && t - d.lt > 0.42 && this.playerDist() > 140) {
        d.n = 1; d.t0 = s; d.jumped = false; d.landed = false;
        return;
      }
      if (t - d.lt > 0.7) this.endAttack();
    }

    /** combo: low sweep (jump it) → overhead chop on a marked spot → recovery with the hammer in the floor. */
    atk_combo(dt, s) {
      const d = this.stateData;
      if (this.once('start')) {
        this.face();
        d.w1 = this.telegraph(this.phase >= 2 ? 0.55 : 0.6, { sound: 'effigy_grind', shake: 1.3, x: this.wpt(-130, -60).x, y: this.wpt(-130, -60).y });
        d.k = this.reachK();
        d.chop = pose(Object.assign({ lean: 0.34, crouch: 0.3 }, slamGrip(Math.min(1, d.k + 0.15))));
        d.chop.gx += 10;
        d.sweepT = 0.16;
        d.w2 = this.phase >= 2 ? 0.36 : 0.42;     // combo follow-up (§8.1: ≥ 0.2 s); short so a sweep-jumper is still airborne at the chop
      }
      this.vx = 0;
      const t1 = d.w1, t2 = t1 + d.sweepT, t3 = t2 + d.w2, t4 = t3 + 0.1;
      if (s < t1) { this.want(P.sweepWind, 9); this.tele01 = 0.7; return; }
      if (s < t2) {                                         // the sweep: low and wide, around the body
        const q = (s - t1) / d.sweepT;
        if (this.once('sweep')) {
          G.sfxAt('effigy_swing', this.cx);
          // lunge (≤ 42 px) only as far as it keeps the body ~30 px short of a player in front: a hugging player
          // must be able to jump the sweep in place (QA: the full lunge drove the body into them — unavoidable in phase 2)
          const p = this.player;
          const ahead = p && this.targetable(p) ? (p.x + p.w / 2 - this.cx) * this.facing : -1;
          const room = ahead < 0 ? 999 : ahead - (this.w / 2 - this.cfg.contactInset) - p.w / 2 - 30;
          d.lungeV = clamp(room / d.sweepT, 0, 260);
        }
        const ha = lerp(Math.PI - 0.1, 0.06, outQ(q));
        this.want(pose({ gx: lerp(-24, 56, q), gy: -52, ha, sq: 0, lean: lerp(-0.05, 0.22, q), crouch: 0.4 }), 0);
        if (this.grounded) this.vx = this.facing * d.lungeV;
        this.strike(this.headRect(this.poseT, 34, 40), { id: 'sweep' + this.uid + ':' + this.strikeSerial });
        return;
      }
      if (s < t3) {                                         // follow-through up and over: chop wind-up
        if (this.once('wind2')) {
          d.tele2 = this.telegraph(d.w2, { sound: 'effigy_raise', shake: 0.8, force: true, x: this.wpt(-20, -300).x, y: this.wpt(-20, -300).y });
          this.markFloor(this.headWorld(d.chop).x, 96, d.w2 + 0.1);
        }
        this.want(P.raise, 14); this.tele01 = 1;
        return;
      }
      this.want(d.chop, s < t4 ? 26 : 30);
      if (s >= t3 + 0.05 && s <= t4 + 0.12) this.strike(this.headRect(d.chop, 44, 42), { id: 'chop' + this.uid + ':' + this.strikeSerial });
      if (s >= t4 && this.once('chopHit')) {
        const hw = this.headWorld(d.chop);
        this.impactFx(hw, 0.85);
        if (this.phase >= 2) this.wave(hw.x + this.facing * 34, this.facing, 430);
      }
      if (s > t4 + 0.95) this.endAttack(0.5);
    }

    /** debris (phase 2): roar and stamp; warned columns of the vault fall. */
    atk_debris(dt, s) {
      const d = this.stateData;
      this.vx = 0;
      if (this.once('start')) { this.face(); d.wind = this.telegraph(0.6, { sound: 'effigy_grind', shake: 1.6 }); }
      if (s < d.wind) { this.want(pose(Object.assign({}, P.plant, { head: 0.1, lean: 0.05 })), 8); return; }
      const st = s - d.wind;
      const stomp = (i) => st >= 0.55 * i && this.once('stomp' + i);
      this.want(pose(Object.assign({}, P.plant, { crouch: 0.1 + 0.25 * Math.max(0, Math.sin(st / 0.55 * Math.PI)) })), 10);
      if (stomp(0)) {
        G.sfxAt('boss_roar', this.cx, { vol: 0.75, pitch: 1.15 });
        if (G.game) G.game.shake(7, 0.6);
        this.dropDebris(5, true);
      }
      for (let i = 1; i <= 2; i++) if (stomp(i)) {
        G.sfxAt('effigy_step', this.cx, { vol: 1.1, pitch: 0.8 });
        if (G.game) G.game.shake(6, 0.3);
        if (G.fx) G.fx.burst('dust', this.cx + this.facing * 22, this.feetY, { count: 10, color: '#a99d88', speed: 160 });
        this.dropDebris(4, i === 2);
      }
      if (st > 0.55 * 2 + 1.2) this.endAttack(0.4);
    }
    /** n warned columns across the hall; `aim`: one of them at the player. */
    dropDebris(n, aim) {
      const room = this.room;
      if (!room) return;
      const xs = [];
      const p = this.player;
      // columns still warned or rocks still falling from the previous stamp: keep clear of them, so there is always
      // a gap to stand in between two stamps (no column lands on or right beside an earlier one)
      const busy = [];
      for (const e of room.entities) {
        if (e.dead) continue;
        if (e.type === 'telegraph' && e.style === 'column') busy.push(e.x + e.w / 2);
        else if (e.type === 'projectile' && e.kind === 'effigy_debris') busy.push(e.cx);
      }
      const clear = (x) => !busy.some((o) => Math.abs(o - x) < 125);
      if (aim && p && this.targetable(p)) {
        const ax = clamp(p.x + p.w / 2 + (p.motor ? p.motor.vx * 0.25 : 0), this.bx0 + 40, this.bx1 - 40);
        if (clear(ax)) xs.push(ax);
      }
      for (let tries = 0; xs.length < n && tries < 80; tries++) {
        const x = rnd(this.bx0 + 40, this.bx1 - 40);
        if (Math.abs(x - this.cx) < 90) continue;
        if (xs.some((o) => Math.abs(o - x) < 150) || !clear(x)) continue;
        xs.push(x);
      }
      for (const x of xs) {
        const top = this.ceilingAt(x);
        if (G.fx) G.fx.burst('dust', x, top + 4, { count: 3, color: '#a99d88', angle: Math.PI / 2, spread: 0.6, speed: 60 });
        const col = this.warnZone({ x: x - 28, y: top, w: 56, h: this.feetY - top, dur: 0.8, style: 'column', color: '#ffcf8a',
          onDone: (z) => {
            if (this.dying || this.dead || !z.room) return;
            G.spawnProjectile(z.room, 'effigy_debris', { x: z.x + z.w / 2, y: top + 22, vx: 0, vy: 140, owner: this });
          } });
        if (col) { this.columns = (this.columns || []).filter((z) => !z.dead); this.columns.push(col); }
      }
      G.sfxAt('effigy_crack', this.cx, { vol: 0.5, pitch: 1.3 });
    }
    /** Ceiling y (px) above world x: the first solid tile above the floor in that column (debris starts below it). */
    ceilingAt(x) {
      const room = this.room;
      if (!room) return 120;
      const c = clamp(Math.floor((x == null ? this.cx : x) / TILE), 0, room.cols - 1);
      for (let r = Math.floor((this.feetY - 1) / TILE); r >= 0; r--) if (G.Physics.isSolidTile(room.tileAt(c, r))) return (r + 1) * TILE;
      return 0;
    }

    /** combo needs space toward the player: from the body centre to the wall (QA corner search: traps below ~265 px). */
    comboRoom() {
      const p = this.player;
      if (!p || !this.targetable(p)) return false;
      return this.spaceAhead(this.dirTo(p)) >= 320;
    }
    /** hurl (phase 2): the hammer skims out low (jump it), hangs, returns high (stay down). */
    hurlRoom() {
      const p = this.player;
      if (!p || !this.targetable(p)) return false;
      const dir = this.dirTo(p), px = p.x + p.w / 2;
      const gapBehind = dir > 0 ? this.bx1 - px : px - this.bx0;
      return gapBehind > 280;
    }
    atk_hurl(dt, s) {
      const d = this.stateData;
      this.vx = 0;
      if (this.once('start')) {
        this.face();
        d.wind = this.telegraph(0.66, { sound: 'effigy_raise', shake: 1.2, x: this.wpt(-140, -205).x, y: this.wpt(-140, -205).y });
        const p = this.player;
        const px = p ? p.x + p.w / 2 : this.cx + this.facing * 400;
        const far = this.facing > 0 ? this.bx1 - 70 : this.bx0 + 70;
        d.stop = this.facing > 0 ? Math.min(px + 260, far) : Math.max(px - 260, far);
      }
      if (s < d.wind) { this.want(P.hurlWind, 9); this.tele01 = 1; return; }
      if (this.once('throw')) {
        this.want(P.hurlRelease, 18);
        const h = this.wpt(80, -120);
        this.hammer = { x: h.x, y: h.y, dir: this.facing, stop: d.stop, state: 'out', t: 0, rot: 0, alpha: 1, spinT: 0 };
        G.sfxAt('effigy_swing', this.cx, { pitch: 0.85 });
      }
      const hm = this.hammer;
      if (hm && hm.state !== 'caught') { if (s > d.wind + 0.35) this.want(P.unarmed, 6); }
      else if (hm && hm.state === 'caught') {
        this.want(P.stand, 10);
        if (this.once('catch')) { d.ct = s; G.sfxAt('effigy_slam', this.cx, { vol: 0.45, pitch: 1.4 }); if (G.game) G.game.shake(3, 0.2); }
        if (s - d.ct > 0.55) { this.hammer = null; this.endAttack(0.45); }
      }
      if (s > 9) { this.hammer = null; this.endAttack(); }
    }
    updateHammer(dt) {
      const hm = this.hammer;
      if (!hm || hm.state === 'caught') return;
      hm.t += dt; hm.rot += dt * 17;
      hm.spinT -= dt;
      if (hm.spinT <= 0 && hm.state !== 'fall') { hm.spinT = 0.26; G.sfxAt('effigy_spin', hm.x, { vol: 0.8 }); }
      const floor = this.feetY;
      const LOW = floor - 34, HIGH = floor - 150;
      if (hm.state === 'out') {
        const rem = (hm.stop - hm.x) * hm.dir;
        const sp = 760 * clamp(rem / 160, 0.25, 1);
        hm.x += hm.dir * Math.min(Math.max(rem, 0), sp * dt);
        hm.y += (LOW - hm.y) * (1 - Math.exp(-18 * dt));
        if (rem <= 2) { hm.state = 'hang'; hm.t = 0; hm.y0 = hm.y; }
        if (G.fx && Math.random() < dt * 30) G.fx.burst('spark', hm.x, floor - 2, { count: 1, color: '#ffd59a', angle: -Math.PI / 2 - hm.dir * 0.8, spread: 0.6, speed: 260 });
        this.strike(this.hammerRect(hm), { id: 'hurl_out' + this.uid + ':' + this.strikeSerial });
      } else if (hm.state === 'hang') {
        const q = clamp(hm.t / 0.45, 0, 1);
        hm.y = lerp(hm.y0, HIGH, ease(q));
        hm.x -= hm.dir * 40 * dt;
        if (q > 0.98) { hm.state = 'back'; hm.t = 0; }
      } else if (hm.state === 'back') {
        const hand = this.wpt(70, -118);
        const dx = hand.x - hm.x, adx = Math.abs(dx);
        hm.x += Math.sign(dx) * Math.min(adx, 680 * dt);
        hm.y = adx < 150 ? lerp(hand.y, HIGH, adx / 150) : HIGH;
        if (adx > 30) this.strike(this.hammerRect(hm), { id: 'hurl_back' + this.uid + ':' + this.strikeSerial });
        if (adx < 8) hm.state = 'caught';
      } else if (hm.state === 'fall') {
        hm.vy = (hm.vy || 0) + 2400 * dt;
        hm.y = Math.min(floor - 22, hm.y + hm.vy * dt);
        if (hm.y >= floor - 22) { hm.alpha -= dt * 1.5; if (hm.alpha <= 0) { this.hammer = null; if (G.fx) G.fx.burst('smoke', hm.x, floor - 20, { count: 6, color: PALL, alpha: 0.4 }); } }
      }
    }
    hammerRect(hm) { return { x: hm.x - 72, y: hm.y - 28, w: 144, h: 56 }; }
    dropHammerIfThrown() {
      if (this.hammer && this.hammer.state !== 'caught') { this.hammer.state = 'fall'; this.hammer.vy = 0; }
    }

    /** awaken: the phase-2 transition. */
    atk_awaken(dt, s) {
      this.vx = 0;
      if (this.once('start')) {
        if (G.clearProjectiles) G.clearProjectiles(this.room);
        this.face();
        this.cracked = true;
        G.sfxAt('effigy_crack', this.cx, { vol: 1.2, pitch: 0.85 });
        if (G.game) { G.game.flash('rgba(255,255,255,0.35)', 0.15); G.game.shake(8, 0.5); }
        if (G.fx) {
          const c = this.wpt(0, -110);
          G.fx.burst('wax', c.x, c.y, { count: 22, color: SHELL, speed: 420 });
          G.fx.burst('shard', c.x, c.y, { count: 14, color: SHELL_HI, speed: 380 });
          G.fx.burst('smoke', c.x, c.y, { count: 18, color: PALL, alpha: 0.6, size: 18, speed: 120 });
        }
      }
      if (s < 0.5) { this.want(pose({ lean: -0.3, crouch: 0.2, head: -0.2, gx: 30, gy: -110, ha: 0.9, open: 0.5 }), 10); return; }
      if (s < 1.45) {
        this.want(pose({ lean: -0.22, crouch: 0.05, head: -0.55, gx: 26, gy: -192, ha: -1.57, open: 0.15 }), 7);
        if (this.once('roar')) {
          G.sfxAt('boss_roar', this.cx, { vol: 1 });
          if (G.game) G.game.shake(9, 1.0);
          if (G.Audio && typeof G.Audio.musicLayer === 'function') G.Audio.musicLayer(1);
        }
        if (G.fx && Math.random() < dt * 20) G.fx.burst('dust', (this._dx = rnd(this.bx0 + 20, this.bx1 - 20)), this.ceilingAt(this._dx) + 4, { count: 1, color: '#a99d88', angle: Math.PI / 2, spread: 0.3, speed: 80 });
        if (G.fx && Math.random() < dt * 12) { const c = this.wpt(rnd(-30, 30), -rnd(60, 150)); G.fx.burst('smoke', c.x, c.y, { count: 1, color: PALL, alpha: 0.45, size: 12, vy: -80 }); }
        return;
      }
      const k = this.reachK();
      this.want(pose(Object.assign({ lean: 0.3, crouch: 0.35 }, slamGrip(k))), 26);
      if (s >= 1.55 && this.once('slam')) this.impactFx(this.headWorld(), 1.1);
      if (s > 2.1) this.endAttack(0.35);
    }

    // ------------------------------------------------------------------ helpers
    wave(x, dir, speed) {
      if (!this.room) return null;
      return G.spawnProjectile(this.room, 'effigy_wave', { x, y: this.feetY, dir, speed, owner: this });
    }
    markFloor(x, w, dur, o) {
      // standard: no cue — the raised hammer / the visible leap is the tell (cue 'none'); o ({keep, cue}) overrides
      // that for the off-screen leap (kept subtle, see atk_leap)
      const z = this.warnZone({ x: x - w / 2, y: this.feetY - 26, w, h: 26, dur: Math.max(0.3, dur), style: 'floor', color: '#ffcf8a',
        cue: (o && o.cue) || 'none', keep: (o && o.keep) || false });
      if (z) { (this.marks || (this.marks = [])).push(z); z.seedX = Math.random() * 10; }
      return z;
    }
    /** Live floor marks of this boss (pruned). */
    liveMarks() {
      const m = this.marks;
      if (!m || !m.length) return [];
      for (let i = m.length - 1; i >= 0; i--) if (m[i].dead || m[i].room !== this.room) m.splice(i, 1);
      return m;
    }
    /** The impact spot glows and cracks open under the coming blow (on top of the framework's floor zone). */
    drawMarks(ctx, t) {
      if (!teleOn()) return;
      const marks = this.liveMarks();
      if (!marks.length) return;
      ctx.save();
      ctx.globalCompositeOperation = 'lighter';
      for (const z of marks) this.drawSeam(ctx, z, z.y + z.h);       // the floor under the mark (the boss may be airborne)
      ctx.restore();
      void t;
    }
    /** Warned debris lanes: lit edges, a cracking glow at the vault, falling grit, and the same floor seam. */
    drawColumns(ctx, t) {
      const cols = this.columns;
      if (!cols || !cols.length) return;
      if (!teleOn()) { this.drawVaultCracks(ctx, cols); return; }
      ctx.save();
      ctx.globalCompositeOperation = 'lighter';
      for (const z of cols) {
        if (z.dead || z.room !== this.room) continue;
        const k = clamp(z.age / z.dur, 0, 1), top = z.y, fy = z.y + z.h, cx = z.x + z.w / 2;
        const pulse = 0.5 + 0.5 * Math.sin(z.age * (12 + 26 * k));
        // lane edges (thin, lit) so the lane reads apart from the hall's soft light shafts
        ctx.fillStyle = 'rgba(255,214,150,' + (0.18 + 0.34 * k).toFixed(3) + ')';
        ctx.fillRect(z.x, top, 2, z.h); ctx.fillRect(z.x + z.w - 2, top, 2, z.h);
        // the vault cracks where the rock will come loose
        glow(ctx, cx, top + 6, 46 + 20 * k, TELE, 0.35 + 0.45 * k * (0.7 + 0.3 * pulse));
        ctx.strokeStyle = 'rgba(255,226,170,' + (0.5 + 0.4 * k).toFixed(3) + ')'; ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.moveTo(cx - 18, top + 2); ctx.lineTo(cx - 6, top + 9); ctx.lineTo(cx + 3, top + 4); ctx.lineTo(cx + 16, top + 11);
        ctx.moveTo(cx - 2, top + 6); ctx.lineTo(cx - 4, top + 16 + 8 * k);
        ctx.stroke();
        // grit trickling down the lane
        ctx.fillStyle = 'rgba(240,226,200,' + (0.35 + 0.35 * k).toFixed(3) + ')';
        for (let i = 0; i < 5; i++) {
          const y = top + ((z.age * (260 + 40 * i) + i * z.h / 5) % z.h);
          ctx.fillRect(cx - 14 + ((i * 11) % 28), y, 2, 4);
        }
        this.drawSeam(ctx, z, fy);
      }
      ctx.restore();
      void t;
    }
    /** Standard / hardcore: only the vault cracking where each rock comes loose (dark, unlit — a natural precursor;
     *  the framework's 'dust' cue trickles pebbles down the column). No lane, no floor seam. */
    drawVaultCracks(ctx, cols) {
      ctx.save();
      ctx.lineWidth = 2; ctx.lineCap = 'round';
      for (const z of cols) {
        if (z.dead || z.room !== this.room) continue;
        const k = clamp(z.age / z.dur, 0, 1), top = z.y, cx = z.x + z.w / 2;
        ctx.strokeStyle = 'rgba(14,12,16,' + (0.45 + 0.45 * k).toFixed(3) + ')';
        ctx.beginPath();
        ctx.moveTo(cx - 18, top + 2); ctx.lineTo(cx - 6, top + 9); ctx.lineTo(cx + 3, top + 4); ctx.lineTo(cx + 16, top + 11);
        ctx.moveTo(cx - 2, top + 6); ctx.lineTo(cx - 4, top + 16 + 8 * k);
        ctx.stroke();
      }
      ctx.restore();
    }
    /** A glowing floor seam with cracks and edge brackets across zone z at floor y fy (ctx in 'lighter'). */
    drawSeam(ctx, z, fy) {
      if (z.seedX == null) z.seedX = (z.x * 0.137) % 10;
      {
        const k = clamp(z.age / z.dur, 0, 1), cx = z.x + z.w / 2, hw = z.w / 2;
        const pulse = 0.5 + 0.5 * Math.sin(z.age * (12 + 26 * k));
        const a = 0.5 + 0.5 * k;
        glow(ctx, cx, fy - 6, hw * 1.4, TELE, (0.35 + 0.4 * k) * (0.7 + 0.3 * pulse));
        // hot seam along the floor + a heat column rising from it
        const g = ctx.createLinearGradient(0, fy - 70, 0, fy);
        g.addColorStop(0, 'rgba(255,200,130,0)'); g.addColorStop(1, 'rgba(255,200,130,' + (0.3 * a).toFixed(3) + ')');
        ctx.fillStyle = g; ctx.fillRect(z.x, fy - 70, z.w, 70);
        ctx.fillStyle = 'rgba(255,214,150,' + (a * (0.7 + 0.3 * pulse)).toFixed(3) + ')';
        ctx.fillRect(z.x, fy - 3, z.w, 3);
        // crack forks spreading from the centre as the blow nears
        ctx.strokeStyle = 'rgba(255,226,170,' + (0.5 + 0.4 * k).toFixed(3) + ')';
        ctx.lineWidth = 2;
        ctx.beginPath();
        const n = 5, reach = hw * (0.35 + 0.65 * k);
        for (let i = 0; i < n; i++) {
          const dir = i % 2 ? 1 : -1, len = reach * (0.5 + 0.5 * ((i * 0.37 + z.seedX) % 1));
          const y0 = fy - 1;
          ctx.moveTo(cx, y0);
          ctx.lineTo(cx + dir * len * 0.45, y0 - 3 - (i % 3) * 2);
          ctx.lineTo(cx + dir * len, y0 - 1);
        }
        ctx.stroke();
        // edge brackets: where the danger ends
        ctx.fillStyle = 'rgba(255,226,170,' + (0.45 + 0.4 * pulse).toFixed(3) + ')';
        for (const ex of [z.x, z.x + z.w]) { ctx.beginPath(); ctx.moveTo(ex, fy); ctx.lineTo(ex, fy - 16); ctx.lineTo(ex + (ex === z.x ? 6 : -6), fy); ctx.closePath(); ctx.fill(); }
      }
    }
    impactFx(pt, k) {
      k = k || 1;
      G.sfxAt('effigy_slam', pt.x, { vol: 0.9 * k });
      if (G.game) G.game.shake(9 * k, 0.35);
      if (G.fx) {
        const fy = this.feetY;
        G.fx.burst('dust', pt.x, fy, { count: Math.round(14 * k), color: '#a99d88', speed: 260 });
        G.fx.burst('shard', pt.x, fy - 6, { count: Math.round(8 * k), color: '#cbbfa8', speed: 300 });
        G.fx.burst('ring', pt.x, fy - 10, { r: 120 * k, color: '#ffe0b0', width: 4, life: 0.3 });
        G.fx.burst('flash', pt.x, fy - 16, { r: 60 * k, color: '#fff2d8', life: 0.12 });
      }
    }
    ambient(dt) {
      if (!G.lighting) return;
      const p = this.pose;
      if (p.eyes > 0.1) { const e = this.wpt(16, -150); G.lighting.add({ x: e.x, y: e.y, r: 70, color: this.cracked ? EMBER : '#f4f8ff', intensity: 0.35 * p.eyes }); }
      if (p.open > 0.1) { const c = this.wpt(6, -100); G.lighting.add({ x: c.x, y: c.y, r: 120, color: CORE, intensity: 0.5 * p.open }); }
      if (this.tele01 > 0.05 && p.held) { const h = this.headWorld(p); G.lighting.add({ x: h.x, y: h.y, r: 120, color: TELE, intensity: 0.45 * this.tele01 }); }
      if (this.hammer) G.lighting.add({ x: this.hammer.x, y: this.hammer.y, r: 110, color: TELE, intensity: 0.35 });
      { const on = teleOn(); for (const z of this.liveMarks()) if (on || z.keep) G.lighting.add({ x: z.x + z.w / 2, y: z.y + z.h - 20, r: z.w * 0.6 + 60, color: TELE, intensity: (on ? 1 : 0.4) * (0.25 + 0.3 * clamp(z.age / z.dur, 0, 1)) }); }
      if (this.columns && teleOn()) for (const z of this.columns) if (!z.dead) G.lighting.add({ x: z.x + z.w / 2, y: z.y + z.h - 24, r: 90, color: TELE, intensity: 0.2 + 0.25 * clamp(z.age / z.dur, 0, 1) });
      if (this.cracked && G.fx && Math.random() < dt * 3) { const c = this.wpt(rnd(-30, 30), -rnd(50, 140)); G.fx.burst('smoke', c.x, c.y, { count: 1, color: PALL, alpha: 0.3, size: 8, vy: -40 }); }
    }

    // ------------------------------------------------------------------ defeat: the Pall leaves, the shell falls
    onDefeatStart() {
      this._once = null;
      this.clearMarks(true);      // (the base clears projectiles; the warned columns would never drop now)
      this.releaseCinematic();
      this.dropHammerIfThrown();
      this.deathPose = pose(Object.assign({}, this.pose, { held: this.pose.held }));
      this.pendingAwaken = false;
    }
    updateDeath(dt) {
      super.updateDeath(dt);
      if (this.dead) return;
      this.updateHammer(dt);
      if (this.exploded) return;
      // pose over the death timeline (slow-mo, then the custom sequence)
      const stage = this.defeatStage, s = this.stageT;
      if (stage === 'slowmo' || stage === 'speak') {
        this.want(pose({ kneel: 0.3, lean: -0.15, head: -0.3, crouch: 0.3, held: 0, rhx: 40, rhy: -60, gx: P.dropped.gx + 20, gy: P.dropped.gy, ha: P.dropped.ha, open: 0.2, eyes: 1 }), 6);
      } else {
        const q = clamp(s / 0.8, 0, 1);
        this.want(pose({ kneel: 1, lean: lerp(0.2, 0.55, q), head: lerp(0, 0.75, q), held: 0, rhx: 46, rhy: -12, gx: P.dropped.gx + 20, gy: P.dropped.gy, ha: P.dropped.ha, open: clamp(s / 0.9, 0, 1), eyes: clamp(1 - (s - 0.6) / 0.6, 0, 1) }), 7);
      }
      this.updatePose(dt);
    }
    onDefeatSequence(dt, s) {
      const core = this.wpt(8, -80);
      if (this.once('crack')) {
        G.sfxAt('effigy_crack', this.cx, { vol: 1.2, pitch: 0.8 });
        if (G.fx) G.fx.burst('shard', core.x, core.y, { count: 12, color: SHELL_HI, speed: 300 });
      }
      if (s > 0.25 && s < 2.1 && G.fx) {           // the Pall pours out of the shell and rises away
        if (Math.random() < dt * 30) G.fx.spawn({ x: core.x + rnd(-10, 10), y: core.y, vx: rnd(-25, 25), vy: rnd(-200, -120), life: rnd(1.2, 1.8), size: rnd(10, 16), size2: rnd(26, 40), color: PALL, alpha: 0.42, gravity: -40, drag: 0.6, shape: 'circle' });
        if (Math.random() < dt * 10) G.fx.burst('ember', core.x, core.y, { count: 1, color: '#d8d4ee', speed: 60 });
      }
      if (this.once('release') && G.fx) G.fx.burst('ring', core.x, core.y, { r: 90, color: CORE, width: 3, life: 0.5 });
      if (s > 1.0 && this.once('wisp')) { G.sfxAt('wisp', core.x, { vol: 0.7, pitch: 0.8 }); this.wispT = 0; }
      if (this.wispT != null) this.wispT += dt;
      if (s > 2.2) {
        this.explode();
        this.nextDefeatStage('explode');
        if (G.fx) {
          const c = this.wpt(0, -90);
          G.fx.burst('shard', c.x, c.y, { count: 26, color: SHELL, speed: 520 });
          G.fx.burst('wax', c.x, c.y, { count: 18, color: SHELL_DK, speed: 420 });
        }
      }
    }
    onDefeated() {
      if (G.game && typeof G.game.setFlag === 'function') {
        G.game.setFlag('effigy_rest_x', Math.round(this.cx));
        G.game.setFlag('effigy_rest_f', this.facing);
      }
    }
    onRemoved() { this.releaseCinematic(); super.onRemoved(); }
    onRoomExit() { this.releaseCinematic(); super.onRoomExit(); }

    // ------------------------------------------------------------------ drawing
    drawBounds() { return { x: this.x - 250, y: this.y - 200, w: this.w + 500, h: this.h + 226 }; }
    drawBody(ctx, t) {
      const f = this.facing, fx = this.cx, fy = this.feetY;
      const ch = C();
      if (!ch) { ctx.fillStyle = SHELL; ctx.fillRect(this.x, this.y, this.w, this.h); return; }
      ch.shadow(ctx, fx, fy, this.w * 0.7, 0.55);
      ctx.save();
      ctx.translate(fx, fy);
      ctx.scale(f, 1);
      const p = this.pose;
      // swing streak behind a fast-moving hammer head
      if (p.held && this.trail.length >= 6 && (this.state === 'slam' || this.state === 'combo' || this.state === 'leap' || this.state === 'awaken')) {
        const tr = this.trail, n = tr.length;
        const sp = Math.hypot(tr[n - 2] - tr[n - 6], tr[n - 1] - tr[n - 5]);
        if (sp > 40) {
          ctx.save();
          ctx.globalCompositeOperation = 'lighter';
          ctx.lineCap = 'round';
          for (let i = 2; i < n; i += 2) {
            ctx.strokeStyle = 'rgba(255,236,200,' + (0.08 + 0.22 * i / n).toFixed(3) + ')';
            ctx.lineWidth = 10 + 40 * i / n;
            ctx.beginPath(); ctx.moveTo(tr[i - 2], tr[i - 1]); ctx.lineTo(tr[i], tr[i + 1]); ctx.stroke();
          }
          ctx.restore();
        }
      }
      if (this.exploded) { drawRemains(ctx, t, -f); ctx.restore(); return; }
      const tele = this.telegraphing ? Math.min(1, this.tele.t / Math.max(0.1, this.tele.dur)) : 0;
      drawEffigy(ctx, p, this.hands, {
        t, light: -f, cracked: this.cracked, damage: 1 - this.hp / this.maxHp, tele: Math.max(tele, this.tele01 * 0.6),
        drawLoose: !this.hammer, leak: true,
      });
      ctx.restore();
      // the released flame (defeat): a small pale light drifting up and away
      if (this.wispT != null && this.wispT < 2.4 && G.Art && G.Art.flame) {
        const q = this.wispT / 2.4, c = this.wpt(8 - q * 30 * f, -80 - q * 260);
        ctx.save(); ctx.globalAlpha *= Math.sin(Math.min(1, q * 1.2) * Math.PI) * 0.9;
        G.Art.flame(ctx, c.x, c.y, 18, 'pale', t, 7);
        ctx.restore();
      }
    }
    draw(ctx, t) {
      if (!this.dying) { this.drawMarks(ctx, t); this.drawColumns(ctx, t); }
      super.draw(ctx, t);
      const hm = this.hammer;
      if (hm && hm.state !== 'caught') {
        ctx.save();
        ctx.globalAlpha *= clamp(hm.alpha, 0, 1);
        if (hm.state === 'fall') drawHammer(ctx, hm.x - 90, hm.y + 6, hm.x + 40, hm.y, Math.PI / 2, { light: -1 });
        else {
          // a flat whirl seen from the side: the haft swings in depth; a pale blur ring shows the reach
          const c = Math.cos(hm.rot), sn = Math.sin(hm.rot);
          ctx.strokeStyle = 'rgba(255,230,190,0.18)'; ctx.lineWidth = 10;
          ctx.beginPath(); ctx.ellipse(hm.x, hm.y, 74, 16, 0, 0, TAU); ctx.stroke();
          glow(ctx, hm.x, hm.y, 90, TELE, 0.25);
          drawHammer(ctx, hm.x - c * 86, hm.y - sn * 12, hm.x + c * 44, hm.y + sn * 6, Math.PI / 2 + sn * 0.5, { light: -1, tele: 0.5 + 0.3 * Math.sin(t * 20) });
        }
        ctx.restore();
      }
    }
    drawDeath(ctx, t) {
      ctx.save();
      if (!this.exploded && this.defeatStage === 'slowmo') {
        const k = Math.min(1, this.deathT / 0.9);
        ctx.translate(Math.sin(t * 80) * (2 + 3 * k), Math.cos(t * 67) * 1.2 * k);
        if (this.flashT > 0 || Math.floor(t * 12) % 3 === 0) this.drawFlashed(ctx, t, 0.35 + 0.4 * k); else this.drawBody(ctx, t);
      } else this.drawBody(ctx, t);
      ctx.restore();
    }
  }
  Effigy.drawEffigy = drawEffigy;
  Effigy.drawRemains = drawRemains;
  Effigy.drawHammer = drawHammer;
  Effigy.POSES = P;
  Effigy.pose = pose;
  G.Boss.register('effigy', Effigy);
  G.Effigy = Effigy;

  // ---------------------------------------------------------------------------------------------------------
  // Room event 'effigy_statue': the kneeling statue (landmark) before the fight; its broken shell after.
  // { type:'event', script:'effigy_statue', x: <bx>, y: <by>, w: 3, h: 4, z: -3 }
  // ---------------------------------------------------------------------------------------------------------
  G.Events.effigy_statue = {
    init(e) { e.data.f = e.props.facing === 'left' || e.props.facing === -1 ? -1 : 1; },
    update(e) {
      if (!G.lighting) return;
      const st = statueState(e);
      if (st === 'statue') G.lighting.add({ x: e.cx, y: e.y + e.h - 110, r: 150, color: '#d8cfbd', intensity: 0.18 });
    },
    draw(e, ctx, t) {
      const st = statueState(e);
      if (st === 'hidden') return;
      const ch = C();
      if (!ch) return;
      const fy = e.y + e.h;
      if (st === 'remains') {
        const fl = G.game && G.game.getFlag ? G.game.getFlag('effigy_rest_x') : null;
        const ff = G.game && G.game.getFlag ? G.game.getFlag('effigy_rest_f') : null;
        const x = typeof fl === 'number' ? fl : e.cx, f = ff === -1 ? -1 : 1;
        ctx.save(); ctx.translate(x, fy); ctx.scale(f, 1);
        drawRemains(ctx, t, -f);
        ctx.restore();
        return;
      }
      const f = e.data.f;
      ch.shadow(ctx, e.cx, fy, 76, 0.55);
      ctx.save(); ctx.translate(e.cx, fy); ctx.scale(f, 1);
      drawEffigy(ctx, P.statue, null, { t, light: -f, statue: true, smoke: true, damage: 0.15 });
      ctx.restore();
    },
  };
  /** 'statue' (waiting), 'hidden' (the live boss draws itself), 'remains' (defeated, body gone). */
  function statueState(e) {
    const room = e.room;
    if (!room) return 'hidden';
    const live = room.entities.some((x) => x.type === 'boss_effigy' && !x.dead);
    if (live) return 'hidden';
    if (G.game && G.game.bossDefeated && G.game.bossDefeated('effigy')) return 'remains';
    const ar = room.findType ? room.findType('arena').find((a) => a.bossId === 'effigy') : null;
    if (ar && ar.boss && !ar.boss.dead) return 'hidden';
    return 'statue';
  }
})();
