// src/entities/bosses/matron.js — THE SOOT MATRON, Brood-Mother of the Flue (arena sf_05). Owner: boss-matron.
// A bloated soot-mother on eight spidery legs: a huge sooty abdomen glowing with coal-red eggs, a cluster of ember
// eyes, ember-tipped fangs. She clings to the walls of her den (the player cannot yet), lobs soot, lays eggs that
// hatch into brood sprites and, in her second phase, pounds the floor so the chimneys rain burning soot.
// HP 320 (DESIGN). Expected Brand level 1 (9 dmg): 36 plain hits (L0: 64; Ember Bolt 15). Staggered (on her back,
// belly up) after 120 damage: 2.1 s, her soft underside takes x1.5. Phase 2 at 50 % ("ignite"). Every hit deals 1.
//   pounce  — crouch (>= 0.5 s) -> leaps onto the surface the player stands on (landing spot marked in flight);
//             phase 2: shockwaves both ways on landing; sometimes a quick second pounce (0.34 s crouch)
//   spit    — rears, throat glows (>= 0.5 s) -> 3 (P2: 5) soot balls lobbed around the player (landing shadows)
//   swipe   — close range: both foreleg pairs raised (>= 0.44 s) -> stab down in front (P2: a second stab)
//   brood   — abdomen swells and pulses (0.6 s) -> 2 eggs (cap 3 brood alive; one dart at a time); eggs hatch after 1.1 s
//             (pop them first); brood sprites drift, chirp (0.45 s) and dart
//   skitter — crouch (0.45 s) -> leaps to a wall cling or a platform away from the player (then spits/pounces)
//   ashfall — phase 2, on the floor: rears up fully (0.7 s) -> belly-slam: shockwaves + two waves of warned
//             columns of burning soot from the chimneys (0.8 s warning each, the second wave between the first)
//   ignite  — phase-2 transition: screech, she climbs to the vault, hangs on a soot strand, the egg-sacs on the
//             walls flare, music intensity layer; drops onto a marked spot (0.7 s) with a pound
// Also registers: enemy kind 'matron_brood' (her minion; eggs + sprites), projectiles 'matron_soot' and
// 'matron_ash', 17 sfx (matron_* / brood_*), and the room event script 'matron_nest' (wall egg-sacs, the nest,
// her curled husk after the defeat). Guide: docs/api/boss-matron.md.
(function () {
  'use strict';
  const G = globalThis.G;
  if (!G || !G.Boss || !G.Enemy) return;
  const TILE = G.CONST.TILE;
  const GRAV = G.CONST.GRAVITY;
  const TAU = Math.PI * 2;
  const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
  const lerp = (a, b, t) => a + (b - a) * t;
  const rnd = (a, b) => a + Math.random() * (b - a);
  const ease = (t) => { t = clamp(t, 0, 1); return t * t * (3 - 2 * t); };
  const damp = (cur, target, rate, dt) => cur + (target - cur) * (1 - Math.exp(-rate * dt));
  const C = () => (G.Art && G.Art.char) || null;
  const glow = (ctx, x, y, r, color, a) => { if (G.Art && G.Art.glow) G.Art.glow(ctx, x, y, r, color, a); };

  // ---------------------------------------------------------------------------------------------------------
  // Palette & numbers
  // ---------------------------------------------------------------------------------------------------------
  const OUTL = '#050303', SOOT = '#171213', SOOT_DK = '#0b0808', SOOT_HI = '#4a3a34', SOOT_MID = '#241b1a';
  const EMBER = '#ff7a2e', EMBER_HI = '#ffb35a', EMBER_WH = '#ffeccc', EMBER_DK = '#a83a16', EMBER_DEEP = '#5a1a0c';
  const LEG = '#1c1616', LEG_FAR = '#100c0c', BELLY = '#a88a78', BELLY_DK = '#5e4a40';
  const TELE = '#ffd9a0', SMOKE = '#3a302c';
  const BW = 150, BH = 100;            // standing body box (hurtbox); clinging: BH x BW
  const HP = 320;
  const BROOD_CAP = 3;
  const STAGGER = { damage: 120, time: 2.1 };
  const STAGGER_MULT = 1.5;
  const CONTACT_GRACE = 0.45;          // s after the i-frames to walk out of her body before it hurts again
  const ROLLUP_GRACE = 0.75;           // s to step off her when she rolls back onto her feet after a stagger
  const HUSK_DOOR = 260;               // her husk rests at least this far (centre) from the east end of the floor
  const FLIP_SPEED = 5.5;              // pose 'flip' units per second (roll over in ~0.18 s)
  const CAM_BIAS = 440;                // max px the view centre may be from the player in the fight (see camUpdate)
  const CAM_IN = 170;                  // keep her centre this far inside the view
  const CAM_TOP = 230;                 // ... and (perched high) this far below the top edge, clear of the HUD
  const CAM_REACH = 900;               // |dx| she can be from the player and still be on screen (CAM_BIAS + 640 - CAM_IN - margin)

  // ---------------------------------------------------------------------------------------------------------
  // Pose model (local frame: origin = ground contact under the body centre, +x = head, -y = away from the surface)
  // ---------------------------------------------------------------------------------------------------------
  const BASE_POSE = { crouch: 0, rear: 0, swell: 0, mouth: 0, raise: 0, air: 0, curl: 0, flip: 0, dangle: 0, eyes: 1, glow: 0.45, splay: 0, twitch: 0 };
  const POSE_KEYS = Object.keys(BASE_POSE);
  const pose = (o) => Object.assign({}, BASE_POSE, o || {});
  const POSES = {
    idle: pose({}),
    crouch: pose({ crouch: 1, swell: 0.15, glow: 0.6 }),
    air: pose({ air: 1, crouch: 0.1 }),
    spitWind: pose({ rear: 0.35, mouth: 1, swell: 0.3, glow: 0.7 }),
    swipeWind: pose({ rear: 0.6, raise: 1, crouch: 0.15, glow: 0.6 }),
    swipeHit: pose({ rear: -0.12, raise: 0, crouch: 0.55, glow: 0.6 }),
    broodWind: pose({ swell: 1, crouch: 0.35, glow: 1 }),
    rearUp: pose({ rear: 1, raise: 1, swell: 0.3, mouth: 0.7, glow: 0.9 }),
    slam: pose({ rear: -0.1, crouch: 1, splay: 1, glow: 1 }),
    dangle: pose({ dangle: 1, eyes: 0, glow: 0.3 }),
    hang: pose({ dangle: 1, splay: 0.6, glow: 0.8 }),
    stagger: pose({ flip: 1, curl: 0.75, crouch: 1, eyes: 0.35, glow: 0.35, twitch: 1 }),
    dead: pose({ flip: 1, curl: 1, crouch: 1, eyes: 0, glow: 0.05 }),
  };
  // Leg rig (near side; the far side reuses it with offsets). hip/raise/air/curl/dangle: body space; foot: ground.
  const LEGS = [
    { hip: [46, -46], foot: [150, 0], raise: [124, -176], air: [138, -46], curl: [74, -8], dangle: [96, 52], L1: 96, L2: 112, front: 2 },
    { hip: [37, -42], foot: [98, 0], raise: [104, -150], air: [110, -18], curl: [42, 6], dangle: [62, 74], L1: 86, L2: 100, front: 1 },
    { hip: [26, -42], foot: [-40, 0], raise: [-40, 0], air: [-46, -6], curl: [-12, 6], dangle: [-6, 80], L1: 82, L2: 96, front: 0 },
    { hip: [15, -46], foot: [-114, 0], raise: [-114, 0], air: [-126, -40], curl: [-54, -8], dangle: [-64, 56], L1: 92, L2: 108, front: 0 },
  ];
  // bristly outline tables (deterministic)
  const TUFT_N = 44;
  const TUFTS = [];
  for (let i = 0; i < TUFT_N; i++) TUFTS.push(1 + (i % 3 === 0 ? 0.075 : i % 3 === 1 ? 0.02 : -0.01) + 0.025 * Math.sin(i * 7.31));
  const EGGS = [[-0.42, 0.18, 19], [0.02, 0.34, 21], [0.4, 0.1, 17], [-0.12, -0.18, 18], [0.28, -0.34, 15], [-0.58, -0.16, 14], [0.58, -0.12, 12]];

  /** body-space transform: crouch lowers, rear tilts the front up around the abdomen's rear-bottom. */
  function bodyXf(pz, t) {
    const bob = Math.sin(t * 2.2) * 1.6 * (1 - pz.curl);
    const dy = pz.crouch * 24 - bob;
    const a = -pz.rear * 0.5;
    const px = -64, py = -26 + dy;
    const ca = Math.cos(a), sa = Math.sin(a);
    return (x, y) => {
      const yy = y + dy;
      const rx = x - px, ry = yy - py;
      return [px + rx * ca - ry * sa, py + rx * sa + ry * ca];
    };
  }
  function ik(hx, hy, fx, fy, L1, L2) {
    let dx = fx - hx, dy = fy - hy;
    let d = Math.hypot(dx, dy) || 0.001;
    const maxD = L1 + L2 - 2, minD = Math.abs(L1 - L2) + 6;
    if (d > maxD) { fx = hx + dx / d * maxD; fy = hy + dy / d * maxD; dx = fx - hx; dy = fy - hy; d = maxD; }
    if (d < minD) { fx = hx + dx / d * minD; fy = hy + dy / d * minD; dx = fx - hx; dy = fy - hy; d = minD; }
    const a = (L1 * L1 - L2 * L2 + d * d) / (2 * d);
    const h = Math.sqrt(Math.max(0, L1 * L1 - a * a));
    const mx = hx + dx / d * a, my = hy + dy / d * a;
    const nx = -dy / d, ny = dx / d;
    const k1 = [mx + nx * h, my + ny * h], k2 = [mx - nx * h, my - ny * h];
    return { knee: k1[1] < k2[1] ? k1 : k2, foot: [fx, fy] };
  }
  /** tapered limb segment, bowed sideways by `bend` px (organic, slightly arched) */
  function legPath(ctx, x0, y0, x1, y1, w0, w1, bend) {
    const dx = x1 - x0, dy = y1 - y0, d = Math.hypot(dx, dy) || 1;
    const nx = -dy / d, ny = dx / d;
    const b = bend || 0;
    const N = 5, L = [], R = [];
    for (let i = 0; i <= N; i++) {
      const u = i / N, off = b * 4 * u * (1 - u), w = lerp(w0, w1, u) * (1 + 0.25 * Math.sin(u * Math.PI));
      const x = x0 + dx * u + nx * off, y = y0 + dy * u + ny * off;
      L.push(x + nx * w, y + ny * w); R.push(x - nx * w, y - ny * w);
    }
    ctx.moveTo(L[0], L[1]);
    for (let i = 2; i < L.length; i += 2) ctx.lineTo(L[i], L[i + 1]);
    for (let i = R.length - 2; i >= 0; i -= 2) ctx.lineTo(R[i], R[i + 1]);
    ctx.closePath();
  }
  /** Foot positions (ground space) for the 8 legs, given the pose and gait. */
  function feetFor(pz, bt, gait, far) {
    const out = [];
    for (let i = 0; i < 4; i++) {
      const L = LEGS[i];
      const ph = gait.ph + i * Math.PI * 0.5 + (far ? Math.PI : 0);
      const stride = gait.amt * 16;
      let fx = L.foot[0] * (far ? 0.86 : 1) + Math.sin(ph) * stride + (far ? -8 : 0) + pz.splay * Math.sign(L.foot[0]) * 26;
      let fy = -Math.max(0, Math.cos(ph)) * gait.amt * 14;
      const ra = L.front === 2 ? pz.raise : L.front === 1 ? pz.raise * 0.85 : 0;
      if (ra > 0) { const r = bt(L.raise[0] - (far ? 10 : 0), L.raise[1] + (far ? 8 : 0)); fx = lerp(fx, r[0], ra); fy = lerp(fy, r[1], ra); }
      if (pz.air > 0) { const r = bt(L.air[0] * (far ? 0.9 : 1), L.air[1]); fx = lerp(fx, r[0], pz.air); fy = lerp(fy, r[1], pz.air); }
      if (pz.dangle > 0) {
        const sw = Math.sin(gait.t * 1.7 + i * 1.3 + (far ? 2 : 0)) * 8;
        const dyn = L.dangle[1] + pz.splay * 14;
        const r = bt(L.dangle[0] * (far ? 0.85 : 1) * (1 + pz.splay * 0.3) + sw, far ? -100 - dyn : dyn);
        fx = lerp(fx, r[0], pz.dangle); fy = lerp(fy, r[1], pz.dangle);
      }
      if (pz.curl > 0) {
        const tw = pz.twitch * Math.sin(gait.t * 23 + i * 2.1 + (far ? 1 : 0)) * 7;
        const r = bt(L.curl[0] * (far ? 0.85 : 1) + tw, L.curl[1] + (far ? 6 : 0) - tw * 0.5);
        fx = lerp(fx, r[0], pz.curl); fy = lerp(fy, r[1], pz.curl);
      }
      out.push([fx, fy]);
    }
    return out;
  }

  /**
   * Draws the Matron in the local frame (see above). opts: {t, gait:{ph, amt, t}, tele 0..1, phase2, mouthGlow}
   */
  function drawMatron(ctx, pz, opts) {
    opts = opts || {};
    const t = opts.t || 0;
    const gait = opts.gait || { ph: 0, amt: 0, t };
    if (gait.t == null) gait.t = t;
    const hot = opts.phase2 ? 1 : 0;
    ctx.save();
    if (pz.flip > 0.001) {
      // belly-up: mirror about the line that puts the abdomen's top on the ground
      const m = -44;
      ctx.translate(0, m * (1 - (1 - 2 * pz.flip)));
      ctx.scale(1, 1 - 2 * pz.flip);
    }
    const bt = bodyXf(pz, t);
    // ---- far legs (behind)
    drawLegs(ctx, pz, bt, gait, true, hot);
    // ---- abdomen
    const sw = pz.swell + Math.sin(t * (pz.swell > 0.5 ? 14 : 2.6)) * (pz.swell > 0.5 ? 0.05 : 0.015);
    const ab = bt(-30, -64);
    const arx = 64 * (1 + 0.13 * sw), ary = 50 * (1 + 0.16 * sw);
    const tilt = -0.12 - pz.rear * 0.5;
    const abP = new Path2D();
    for (let i = 0; i <= TUFT_N; i++) {
      const k = i % TUFT_N, a = k / TUFT_N * TAU, r = TUFTS[k];
      const ex = Math.cos(a) * arx * r, ey = Math.sin(a) * ary * r;
      const x = ab[0] + ex * Math.cos(tilt) - ey * Math.sin(tilt), y = ab[1] + ex * Math.sin(tilt) + ey * Math.cos(tilt);
      if (i === 0) abP.moveTo(x, y); else abP.lineTo(x, y);
    }
    abP.closePath();
    ctx.lineJoin = 'round';
    ctx.strokeStyle = OUTL; ctx.lineWidth = 5; ctx.stroke(abP);
    const g = ctx.createRadialGradient(ab[0] + 8, ab[1] + 14, 4, ab[0], ab[1], arx * 1.05);
    g.addColorStop(0, pz.flip > 0.5 ? BELLY : '#3a1a12'); g.addColorStop(0.55, pz.flip > 0.5 ? BELLY_DK : SOOT_MID); g.addColorStop(1, SOOT_DK);
    ctx.fillStyle = g; ctx.fill(abP);
    ctx.save();
    ctx.clip(abP);
    // eggs glowing through the soot skin
    const gl = clamp(pz.glow + hot * 0.25 + (opts.tele || 0) * 0.3, 0, 1.3);
    if (gl > 0.02) {
      ctx.globalCompositeOperation = 'lighter';
      for (let i = 0; i < EGGS.length; i++) {
        const e = EGGS[i];
        const ex = e[0] * arx, ey = e[1] * ary;
        const x = ab[0] + ex * Math.cos(tilt) - ey * Math.sin(tilt), y = ab[1] + ex * Math.sin(tilt) + ey * Math.cos(tilt);
        const pulse = 0.6 + 0.4 * Math.sin(t * (2.4 + sw * 9) + i * 1.7);
        const rr = e[2] * (1 + 0.25 * sw);
        glow(ctx, x, y, rr * 2.0, EMBER, 0.45 * gl * pulse);
        glow(ctx, x, y, rr * 0.85, EMBER_HI, 0.42 * gl * pulse);
      }
      ctx.globalCompositeOperation = 'source-over';
    }
    // membrane veins between the eggs
    ctx.strokeStyle = 'rgba(8,5,5,0.75)'; ctx.lineWidth = 2.2;
    ctx.beginPath();
    for (let i = 0; i < 5; i++) {
      const a0 = i * 1.31 + 0.4;
      const x0 = ab[0] + Math.cos(a0) * arx * 0.95, y0 = ab[1] + Math.sin(a0) * ary * 0.95;
      const x1 = ab[0] + Math.cos(a0 + 2.6) * arx * 0.9, y1 = ab[1] + Math.sin(a0 + 2.6) * ary * 0.9;
      ctx.moveTo(x0, y0); ctx.quadraticCurveTo(ab[0] + Math.cos(a0 + 1.3) * 10, ab[1] + Math.sin(a0 + 1.3) * 8, x1, y1);
    }
    ctx.stroke();
    // ember cracks (brighter in phase 2)
    const ca = clamp(0.35 + gl * 0.6, 0, 1);
    ctx.strokeStyle = 'rgba(255,122,46,' + (0.55 * ca).toFixed(3) + ')'; ctx.lineWidth = 2;
    ctx.beginPath();
    const cr = [[-0.7, -0.3, -0.35, -0.05, -0.15, -0.4], [0.1, 0.55, 0.3, 0.25, 0.55, 0.38], [-0.3, 0.6, -0.5, 0.35, -0.75, 0.42]];
    for (const c of cr) {
      const p = (u, v) => [ab[0] + u * arx * Math.cos(tilt) - v * ary * Math.sin(tilt), ab[1] + u * arx * Math.sin(tilt) + v * ary * Math.cos(tilt)];
      const a = p(c[0], c[1]), b = p(c[2], c[3]), d = p(c[4], c[5]);
      ctx.moveTo(a[0], a[1]); ctx.lineTo(b[0], b[1]); ctx.lineTo(d[0], d[1]);
    }
    ctx.stroke();
    // underside ember rim + top sheen
    const rg = ctx.createLinearGradient(0, ab[1] - ary, 0, ab[1] + ary);
    rg.addColorStop(0, 'rgba(120,100,95,0.28)'); rg.addColorStop(0.35, 'rgba(0,0,0,0)'); rg.addColorStop(0.75, 'rgba(0,0,0,0)'); rg.addColorStop(1, 'rgba(255,110,50,' + (0.35 + 0.3 * gl).toFixed(3) + ')');
    ctx.strokeStyle = rg; ctx.lineWidth = 9; ctx.stroke(abP);
    ctx.restore();
    // spinneret
    const sp = bt(-90, -52);
    ctx.fillStyle = SOOT_DK; ctx.beginPath(); ctx.ellipse(sp[0], sp[1], 9, 7, tilt, 0, TAU); ctx.fill();
    // ---- cephalothorax
    const th = bt(30, -52);
    const thP = new Path2D();
    for (let i = 0; i <= 28; i++) {
      const k = i % 28, a = k / 28 * TAU, r = 1 + (k % 2 ? 0.06 : 0);
      const x = th[0] + Math.cos(a) * 33 * r, y = th[1] + Math.sin(a) * 24 * r;
      if (i === 0) thP.moveTo(x, y); else thP.lineTo(x, y);
    }
    thP.closePath();
    ctx.strokeStyle = OUTL; ctx.lineWidth = 4.5; ctx.stroke(thP);
    const tg = ctx.createLinearGradient(th[0], th[1] - 24, th[0], th[1] + 24);
    tg.addColorStop(0, '#3a2e2a'); tg.addColorStop(0.45, SOOT); tg.addColorStop(1, pz.flip > 0.5 ? BELLY_DK : '#2a1410');
    ctx.fillStyle = tg; ctx.fill(thP);
    ctx.strokeStyle = 'rgba(170,140,125,0.22)'; ctx.lineWidth = 2;
    ctx.beginPath(); ctx.ellipse(th[0] - 2, th[1] - 6, 22, 12, 0, Math.PI * 1.1, Math.PI * 1.85); ctx.stroke();
    // ---- head, fangs, eyes
    const hd = bt(62, -50);
    ctx.fillStyle = OUTL; ctx.beginPath(); ctx.arc(hd[0], hd[1], 19, 0, TAU); ctx.fill();
    ctx.fillStyle = SOOT_MID; ctx.beginPath(); ctx.arc(hd[0], hd[1], 16.5, 0, TAU); ctx.fill();
    const mo = clamp(pz.mouth, 0, 1);
    for (const s of [-1, 1]) {
      const bx = hd[0] + 9, by = hd[1] + 11;
      const ang = 0.35 + s * (0.18 + mo * 0.42);
      const L = 22;
      const tx = bx + Math.cos(ang + 0.9) * L * 0.4 + Math.sin(ang) * 4, ty = by + Math.sin(ang + 0.9) * L;
      ctx.beginPath(); ctx.moveTo(bx - 6, by - 2); ctx.quadraticCurveTo(bx + 10 + s * 4, by + 6, tx + 6, ty); ctx.quadraticCurveTo(bx + 2, by + 10, bx + 4, by - 3); ctx.closePath();
      ctx.strokeStyle = OUTL; ctx.lineWidth = 3; ctx.stroke();
      ctx.fillStyle = s > 0 ? '#4a3028' : '#2e1e19'; ctx.fill();
      ctx.fillStyle = s > 0 ? EMBER_DK : '#6a2410';
      ctx.beginPath(); ctx.arc(tx + 5, ty - 1, 2.4, 0, TAU); ctx.fill();
    }
    // mouth / throat glow (spit wind-up)
    if (opts.mouthGlow > 0.01) {
      ctx.save(); ctx.globalCompositeOperation = 'lighter';
      glow(ctx, hd[0] + 14, hd[1] + 12, 14 + 30 * opts.mouthGlow, EMBER, 0.75 * opts.mouthGlow);
      glow(ctx, hd[0] + 14, hd[1] + 12, 6 + 10 * opts.mouthGlow, EMBER_WH, 0.8 * opts.mouthGlow);
      ctx.restore();
    }
    const eb = clamp(pz.eyes, 0, 1.4);
    const EYE = [[10, -8, 5.2], [13, 2, 4.6], [3, -13, 3.2], [5, -3, 3.4], [-4, -9, 2.6], [15, -6, 2.4]];
    for (const e of EYE) {
      const x = hd[0] + e[0], y = hd[1] + e[1];
      ctx.fillStyle = eb > 0.05 ? EMBER_DEEP : '#1a1010';
      ctx.beginPath(); ctx.arc(x, y, e[2] + 1.2, 0, TAU); ctx.fill();
      if (eb > 0.05) {
        ctx.fillStyle = hot ? EMBER_HI : EMBER; ctx.globalAlpha = clamp(eb, 0, 1);
        ctx.beginPath(); ctx.arc(x, y, e[2], 0, TAU); ctx.fill();
        ctx.fillStyle = EMBER_WH;
        ctx.beginPath(); ctx.arc(x + e[2] * 0.25, y - e[2] * 0.25, e[2] * 0.42, 0, TAU); ctx.fill();
        ctx.globalAlpha = 1;
      }
    }
    if (eb > 0.05) {
      ctx.save(); ctx.globalCompositeOperation = 'lighter';
      glow(ctx, hd[0] + 9, hd[1] - 5, 30 + hot * 12, EMBER, (0.42 + hot * 0.2) * Math.min(1, eb));
      ctx.restore();
    }
    // ---- near legs (in front)
    drawLegs(ctx, pz, bt, gait, false, hot);
    ctx.restore();
  }
  function drawLegs(ctx, pz, bt, gait, far, hot) {
    const feet = feetFor(pz, bt, gait, far);
    const col = far ? LEG_FAR : LEG;
    const knees = [];
    for (let i = 0; i < 4; i++) {
      const L = LEGS[i];
      const h = bt(L.hip[0] - (far ? 4 : 0), L.hip[1] - (far ? 3 : 0));
      const s = ik(h[0], h[1], feet[i][0], feet[i][1], L.L1 * (far ? 0.95 : 1), L.L2 * (far ? 0.95 : 1));
      const k = s.knee, f = s.foot;
      // claw hook direction: away from the body
      const hx = f[0] + (f[0] > h[0] ? 6 : -6), hy = f[1] - 6;
      const mk = [lerp(k[0], f[0], 0.45), lerp(k[1], f[1], 0.45)];
      ctx.beginPath();
      const bs = (k[0] - h[0]) * (f[0] - k[0]) >= 0 ? 1 : -1;       // bow outward, away from the body
      legPath(ctx, h[0], h[1], k[0], k[1], far ? 4 : 5.2, far ? 3 : 3.8, -bs * (f[0] > h[0] ? 5 : -5));
      legPath(ctx, k[0], k[1], mk[0], mk[1], far ? 2.8 : 3.6, far ? 2.2 : 2.8, bs * (f[0] > h[0] ? 3 : -3));
      legPath(ctx, mk[0], mk[1], f[0], f[1], far ? 2.1 : 2.6, 0.9, bs * (f[0] > h[0] ? 2 : -2));
      ctx.fillStyle = OUTL; ctx.strokeStyle = OUTL; ctx.lineWidth = 2.6; ctx.lineJoin = 'round';
      ctx.stroke(); ctx.fillStyle = col; ctx.fill();
      ctx.strokeStyle = far ? '#1d1616' : '#4a3a34'; ctx.lineWidth = 1.2;
      ctx.beginPath(); ctx.moveTo(h[0], h[1] - 2); ctx.lineTo(k[0], k[1] - 2.5); ctx.lineTo(mk[0], mk[1] - 1.5); ctx.stroke();
      // bristles along the shin
      ctx.strokeStyle = OUTL; ctx.lineWidth = 1.2;
      ctx.beginPath();
      for (let b = 1; b <= 3; b++) {
        const u = b / 4, bx = lerp(k[0], f[0], u), by = lerp(k[1], f[1], u);
        const dx = f[0] - k[0], dy = f[1] - k[1], dl = Math.hypot(dx, dy) || 1;
        ctx.moveTo(bx, by); ctx.lineTo(bx - dy / dl * 6 + dx / dl * 4, by + dx / dl * 6 + dy / dl * 4);
      }
      ctx.moveTo(f[0], f[1]); ctx.quadraticCurveTo(hx, f[1] - 1, hx, hy);
      ctx.stroke();
      ctx.fillStyle = OUTL; ctx.beginPath(); ctx.arc(mk[0], mk[1], far ? 2.6 : 3.2, 0, TAU); ctx.fill();
      knees.push(k);
    }
    // smouldering knee joints
    for (const k of knees) {
      ctx.fillStyle = OUTL; ctx.beginPath(); ctx.arc(k[0], k[1], far ? 4.6 : 5.8, 0, TAU); ctx.fill();
      ctx.fillStyle = far ? '#4a1a0c' : EMBER_DK;
      ctx.beginPath(); ctx.arc(k[0], k[1], far ? 2.4 : 3.2, 0, TAU); ctx.fill();
    }
    if (!far) {
      ctx.save(); ctx.globalCompositeOperation = 'lighter';
      for (const k of knees) glow(ctx, k[0], k[1], 11 + hot * 4, EMBER, 0.28 + hot * 0.15);
      ctx.restore();
    }
  }

  // ---------------------------------------------------------------------------------------------------------
  // Sound design (own sfx; defined once at load)
  // ---------------------------------------------------------------------------------------------------------
  (function defineSounds() {
    const A = G.Audio;
    if (!A || typeof A.defineSfx !== 'function') return;
    const clicks = (k, n, span, g, at, lo, hi) => {
      for (let i = 0; i < n; i++) k.noise({ bp: k.r(lo || 1400, hi || 4200), Q: 3, a: 0.0008, d: k.r(0.012, 0.035), g: g * k.r(0.5, 1), at: (at || 0) + k.r(0, span) });
    };
    const thump = (k, f, d, g, at) => k.tone({ f, f1: f * 0.5, glide: d * 0.8, d, g, at: at || 0, a: 0.002 });
    // pounce wind-up: a long breathy hiss over chitter
    A.defineSfx('matron_hiss', { vol: 2.0, reverb: 0.25, prio: 2, play(k) {
      const v = k.r(0.92, 1.08);
      k.noise({ hp: 2400 * v, hp1: 1500 * v, a: 0.05, hold: 0.25, d: 0.35, g: 0.2, sweep: 0.5 });
      k.noise({ bp: 900 * v, Q: 1.2, a: 0.08, hold: 0.2, d: 0.3, g: 0.12 });
      clicks(k, 9, 0.45, 0.09, 0.02);
    } });
    // the leap: a heavy whoosh with legs clattering
    A.defineSfx('matron_leap', { vol: 1.9, reverb: 0.15, prio: 2, play(k) {
      const v = k.r(0.9, 1.1);
      k.noise({ bp: 300 * v, bp1: 1000 * v, Q: 1, a: 0.04, d: 0.32, g: 0.36, sweep: 0.3 });
      clicks(k, 6, 0.12, 0.08, 0, 900, 2600);
    } });
    // landing: a soft heavy thump of soot and a patter of eight feet
    A.defineSfx('matron_land', { vol: 2.0, reverb: 0.3, prio: 2, play(k) {
      const v = k.r(0.92, 1.06);
      thump(k, 64 * v, 0.45, 0.6);
      k.noise({ color: 'brown', lp: 700 * v, lp1: 160, a: 0.002, d: 0.5, g: 0.4, sweep: 0.5 });
      clicks(k, 8, 0.16, 0.1, 0.01, 700, 2400);
    } });
    // spit wind-up: a bubbling, rising gurgle in the throat
    A.defineSfx('matron_gurgle', { vol: 1.9, reverb: 0.2, prio: 2, play(k) {
      const v = k.r(0.94, 1.06);
      k.tone({ f: 120 * v, f1: 260 * v, glide: 0.5, type: 'sawtooth', lp: 700, a: 0.08, hold: 0.25, d: 0.25, g: 0.1, vib: { rate: 17, depth: 120 } });
      for (let i = 0; i < 9; i++) k.tone({ f: k.r(180, 420) * v, f1: k.r(400, 900) * v, glide: 0.05, a: 0.004, d: 0.06, g: 0.06, at: i * 0.055 + k.r(0, 0.03) });
      k.noise({ bp: 600 * v, bp1: 1400 * v, Q: 2, a: 0.1, d: 0.4, g: 0.08, sweep: 0.5 });
    } });
    // the spit: a wet hawk and a puff of soot
    A.defineSfx('matron_spit', { vol: 1.9, reverb: 0.2, prio: 2, play(k) {
      const v = k.r(0.92, 1.08);
      k.noise({ bp: 1300 * v, bp1: 500 * v, Q: 1.4, a: 0.003, d: 0.2, g: 0.36, sweep: 0.2 });
      k.tone({ f: 220 * v, f1: 90 * v, glide: 0.12, a: 0.002, d: 0.16, g: 0.18 });
      k.noise({ color: 'pink', lp: 900, a: 0.01, d: 0.35, g: 0.12, at: 0.04 });
    } });
    // swipe wind-up: dry chitin rasp
    A.defineSfx('matron_rasp', { vol: 1.9, reverb: 0.15, prio: 2, play(k) {
      const v = k.r(0.94, 1.06);
      for (let i = 0; i < 16; i++) k.noise({ bp: k.r(1800, 3400) * v, Q: 4, a: 0.001, d: 0.02, g: 0.1, at: i * 0.026 });
      k.tone({ f: 150 * v, f1: 110 * v, glide: 0.4, type: 'sawtooth', lp: 900, a: 0.05, hold: 0.15, d: 0.2, g: 0.07 });
    } });
    // the swipe: whoosh + the leg-tips stabbing the floor
    A.defineSfx('matron_swipe', { vol: 2.0, reverb: 0.15, prio: 2, play(k) {
      const v = k.r(0.92, 1.08);
      k.noise({ bp: 500 * v, bp1: 2200 * v, Q: 1.2, a: 0.02, d: 0.16, g: 0.36, sweep: 0.15 });
      thump(k, 110 * v, 0.2, 0.32, 0.1);
      clicks(k, 5, 0.04, 0.16, 0.1, 1200, 3000);
    } });
    // brood wind-up: wet squelching pulses
    A.defineSfx('matron_brood', { vol: 2.0, reverb: 0.25, prio: 2, play(k) {
      const v = k.r(0.94, 1.06);
      for (let i = 0; i < 4; i++) {
        k.tone({ f: 80 * v, f1: 140 * v, glide: 0.1, a: 0.02, d: 0.14, g: 0.2, at: i * 0.14 });
        k.noise({ bp: 420 * v, bp1: 900 * v, Q: 3, a: 0.01, d: 0.1, g: 0.12, at: i * 0.14 + 0.02, sweep: 0.1 });
      }
    } });
    // an egg dropped: plop and a crackle
    A.defineSfx('matron_lay', { vol: 1.6, reverb: 0.2, prio: 1, play(k) {
      const v = k.r(0.9, 1.1);
      k.tone({ f: 320 * v, f1: 120 * v, glide: 0.08, a: 0.002, d: 0.12, g: 0.18 });
      for (let i = 0; i < 5; i++) k.noise({ hp: k.r(2000, 4000), a: 0.0008, d: 0.02, g: 0.07, at: 0.04 + k.r(0, 0.12) });
    } });
    // ashfall wind-up: a low groan rising to a howl as she rears
    A.defineSfx('matron_rear', { vol: 2.2, reverb: 0.35, prio: 3, play(k) {
      const v = k.r(0.96, 1.04);
      k.tone({ f: 70 * v, f1: 150 * v, glide: 0.7, type: 'sawtooth', lp: 700, lp1: 1600, a: 0.15, hold: 0.45, d: 0.3, g: 0.16, vib: { rate: 7, depth: 50 }, sweep: 0.7 });
      k.tone({ f: 105 * v, f1: 230 * v, glide: 0.7, type: 'sawtooth', lp: 900, a: 0.15, hold: 0.45, d: 0.3, g: 0.08 });
      k.noise({ bp: 600, bp1: 1800, Q: 1.5, a: 0.2, d: 0.6, g: 0.1, sweep: 0.7 });
    } });
    // the belly-slam: sub boom, rumble and the chimneys shedding
    A.defineSfx('matron_pound', { vol: 2.2, reverb: 0.4, prio: 3, play(k) {
      const v = k.r(0.95, 1.05);
      thump(k, 48 * v, 0.8, 0.7);
      k.noise({ color: 'brown', lp: 600 * v, lp1: 120, a: 0.002, d: 1.1, g: 0.5, sweep: 1.0 });
      for (let i = 0; i < 12; i++) k.noise({ bp: k.r(500, 2400), Q: 1.5, a: 0.002, d: k.r(0.04, 0.1), g: k.r(0.03, 0.08), at: 0.15 + k.r(0, 0.8) });
    } });
    // a clump of burning soot lands
    A.defineSfx('matron_ashland', { vol: 1.5, reverb: 0.2, prio: 1, play(k) {
      const v = k.r(0.85, 1.15);
      thump(k, 90 * v, 0.18, 0.32);
      for (let i = 0; i < 8; i++) k.noise({ hp: k.r(1500, 4000), a: 0.001, d: k.r(0.015, 0.05), g: k.r(0.05, 0.12), at: k.r(0, 0.2) });
    } });
    // her screech (intro, ignite)
    A.defineSfx('matron_screech', { vol: 2.2, reverb: 0.5, prio: 3, play(k) {
      const v = k.r(0.97, 1.03);
      for (const [f, g] of [[640, 0.08], [910, 0.06], [1330, 0.045], [470, 0.05]]) {
        k.tone({ f: f * v, f1: f * 0.82 * v, glide: 1.0, type: 'sawtooth', bp: f * 1.6, Q: 2, a: 0.06, hold: 0.55, d: 0.6, g, vib: { rate: 19, depth: 90 } });
      }
      k.noise({ hp: 2200, a: 0.05, hold: 0.5, d: 0.6, g: 0.12 });
      k.tone({ f: 80, f1: 60, glide: 1, a: 0.1, hold: 0.4, d: 0.6, g: 0.12 });
    } });
    // legs skittering on brick (reposition)
    A.defineSfx('matron_skitter', { vol: 1.7, reverb: 0.15, prio: 1, play(k) {
      clicks(k, 14, 0.4, 0.12, 0, 800, 3000);
      k.noise({ bp: 400, Q: 1, a: 0.05, d: 0.3, g: 0.06 });
    } });
    // her death: a long rattling wheeze, the eggs' crackle dying away
    A.defineSfx('matron_die', { vol: 2.2, reverb: 0.5, prio: 3, play(k) {
      k.tone({ f: 300, f1: 90, glide: 1.6, type: 'sawtooth', bp: 600, Q: 1.5, a: 0.05, hold: 0.6, d: 1.0, g: 0.1, vib: { rate: 11, depth: 120 } });
      k.noise({ hp: 1600, hp1: 500, a: 0.1, hold: 0.6, d: 1.2, g: 0.12, sweep: 1.6 });
      for (let i = 0; i < 16; i++) k.noise({ hp: k.r(1800, 4200), a: 0.001, d: 0.03, g: 0.06 * (1 - i / 16), at: 0.2 + i * 0.11 + k.r(0, 0.05) });
    } });
    // brood: a tiny chirp before a dart; hatching crackle
    A.defineSfx('brood_chirp', { vol: 1.3, reverb: 0.15, prio: 1, play(k) {
      const v = k.r(0.9, 1.15);
      k.tone({ f: 1500 * v, f1: 2300 * v, glide: 0.08, type: 'triangle', a: 0.004, d: 0.09, g: 0.09 });
      k.tone({ f: 1700 * v, f1: 2600 * v, glide: 0.08, type: 'triangle', a: 0.004, d: 0.09, g: 0.07, at: 0.1 });
    } });
    A.defineSfx('brood_hatch', { vol: 1.4, reverb: 0.15, prio: 1, play(k) {
      for (let i = 0; i < 7; i++) k.noise({ hp: k.r(2200, 4500), a: 0.0008, d: 0.02, g: 0.1, at: k.r(0, 0.1) });
      k.tone({ f: 1300, f1: 2100, glide: 0.1, type: 'triangle', a: 0.005, d: 0.1, g: 0.07, at: 0.08 });
    } });
  })();

  // ---------------------------------------------------------------------------------------------------------
  // Arena geometry: standable surfaces (solid or one-way tops with headroom), wall clings, the vault.
  // ---------------------------------------------------------------------------------------------------------
  const LAYOUTS = {
    // sf_05: with the gates shut, the west lintel + bars form one face (x = 80) above the ledge; the east wall
    // above the door lintel. The strand hangs over the nest.
    sf_05: { walls: [{ side: -1, face: 2 * TILE, cy: 13 * TILE }, { side: 1, face: 47 * TILE, cy: 15 * TILE }], strandX: 30.5 * TILE },
  };
  function buildArena(room) {
    const cols = room.cols, rows = room.rows, T = G.T;
    const isSolid = (c, r) => (c < 0 || r < 0 || c >= cols || r >= rows) ? true : G.Physics.isSolidTile(room.tileAt(c, r));
    const isPlat = (c, r) => room.tileAt(c, r) === T.PLATFORM;
    const gates = (room.entities || []).filter((e) => e.type === 'arena_gate' || e.type === 'gate').map((g) => ({
      c0: Math.floor(g.x / TILE), c1: Math.floor((g.x + g.w - 1) / TILE), r0: Math.floor(g.y / TILE), r1: Math.floor((g.y + g.h - 1) / TILE) }));
    const blocked = (c, r) => isSolid(c, r) || gates.some((g) => c >= g.c0 && c <= g.c1 && r >= g.r0 && r <= g.r1);
    const hazard = (c, r) => { const t = room.tileAt(c, r); return t === T.SPIKES || t === T.LAVA || t === T.WATER; };
    const surfaces = [];
    for (let r = 3; r < rows; r++) {
      let run = null;
      for (let c = 1; c < cols - 1; c++) {
        const ok = (isSolid(c, r) || isPlat(c, r)) && !hazard(c, r) && !hazard(c, r - 1) &&
          !blocked(c, r - 1) && !blocked(c, r - 2) && !blocked(c, r - 3) && !gates.some((g) => c >= g.c0 && c <= g.c1 && r - 1 >= g.r0 && r - 1 <= g.r1);
        if (ok) { if (!run) run = { c0: c, c1: c }; else run.c1 = c; }
        if ((!ok || c === cols - 2) && run) {
          if (run.c1 - run.c0 + 1 >= 4) surfaces.push({ y: r * TILE, x0: run.c0 * TILE, x1: (run.c1 + 1) * TILE, plat: isPlat(run.c0, r), row: r });
          run = null;
        }
      }
    }
    // floor = the lowest, widest surface
    let floor = null;
    for (const s of surfaces) if (!floor || s.y > floor.y || (s.y === floor.y && s.x1 - s.x0 > floor.x1 - floor.x0)) floor = s;
    if (!floor) floor = { y: (rows - 2) * TILE, x0: TILE, x1: (cols - 1) * TILE, plat: false, row: rows - 2 };
    floor.floor = true;
    // the den's horizontal extent at body height above the floor
    const fr = floor.row;
    let x0 = floor.x0, x1 = floor.x1;
    const midC = Math.floor((floor.x0 + floor.x1) / 2 / TILE);
    // vault: first solid tile above the den centre
    let ceilR = fr - 1;
    while (ceilR > 0 && !isSolid(midC, ceilR - 1)) ceilR--;
    const ceilY = ceilR * TILE;
    const lay = LAYOUTS[room.id] || null;
    let walls = [];
    if (lay && lay.walls) walls = lay.walls.map((w) => Object.assign({}, w));
    else {
      // generic: the inner faces at ~6 tiles above the floor, if 4 rows of solid wall are there
      const rc = fr - 7;
      for (const side of [-1, 1]) {
        let c = midC;
        while (c > 0 && c < cols - 1 && !blocked(c, rc)) c += side;
        let flat = true;
        for (let r = rc - 2; r <= rc + 1; r++) if (!blocked(c, r) || blocked(c - side, r)) flat = false;
        if (flat && rc > ceilR + 2) walls.push({ side, face: side < 0 ? (c + 1) * TILE : c * TILE, cy: (rc + 0.5) * TILE });
      }
    }
    for (const s of surfaces) { x0 = Math.min(x0, s.x0); x1 = Math.max(x1, s.x1); }
    const strandX = lay && lay.strandX ? lay.strandX : (floor.x0 + floor.x1) / 2;
    return { surfaces, floor, walls, ceilY, x0, x1, strandX, isSolid, isPlat };
  }
  /** The surface under world point (x, y): the highest surface top >= y whose span contains x. */
  function surfaceBelow(A, x, y, pad) {
    let best = null;
    const p = pad == null ? 0 : pad;
    for (const s of A.surfaces) {
      if (x < s.x0 - p || x > s.x1 + p || s.y < y - 2) continue;
      if (!best || s.y < best.y) best = s;
    }
    return best;
  }
  /** Allowed centre-x range for her body on surface s (legs may overhang the edge a little). */
  function surfRange(s) {
    const over = 18;
    let a = s.x0 + BW / 2 - over, b = s.x1 - BW / 2 + over;
    if (a > b) a = b = (s.x0 + s.x1) / 2;
    return [a, b];
  }

  // ---------------------------------------------------------------------------------------------------------
  // Warning marks (entity type 'telegraph' like G.warnZone, drawn bold enough to read over the ember-lit den):
  //   floor  — her landing spot: a glowing seam with end brackets and a heat shimmer rising from it
  //   column — a lane of burning soot about to fall: bright edges, sifting grit, a glowing crack in the vault
  // ---------------------------------------------------------------------------------------------------------
  const Mark = G.TelegraphZone ? class extends G.TelegraphZone {
    update(dt) {
      if (this.props.hold) {
        // 'hold': the lane stays lit (dimmer, 'live') from the warning's end until what it spawned has landed
        this.age += dt;
        if (!this.fired && this.age >= this.dur) {
          this.fired = true;
          try { this.held = this.props.onDone(this) || null; } catch (e) { G.reportError(e, 'matron mark'); }
        }
        if (this.fired && (!this.held || this.held.dead || this.age > this.dur + 1.6)) { this.remove(); return; }
      } else super.update(dt);
      if (this.dead || !G.fx) return;
      if (this.fired) return;
      const k = this.age / this.dur;
      if (this.style === 'column' && Math.random() < dt * (10 + 30 * k)) G.fx.burst('ash', this.x + Math.random() * this.w, this.y + 6, { count: 1, color: '#9a8070' });
      if (this.style === 'floor' && Math.random() < dt * 14) G.fx.burst('ember', this.x + Math.random() * this.w, this.y + this.h - 4, { count: 1, color: EMBER_HI, speed: 40 });
      if (G.lighting) G.lighting.add({ x: this.cx, y: this.style === 'column' ? this.y + this.h - 30 : this.y + this.h - 10, r: this.style === 'column' ? 90 : 120, color: '#ff8a40', intensity: 0.25 + 0.3 * k });
    }
    draw(ctx, t) {
      const k = clamp(this.age / this.dur, 0, 1);
      const pulse = 0.5 + 0.5 * Math.sin(this.age * (12 + 20 * k));
      const x0 = this.x, x1 = this.x + this.w, yb = this.y + this.h;
      ctx.save();
      ctx.globalCompositeOperation = 'lighter';
      if (this.style === 'column' && this.fired) {
        // live lane: the clump is falling; a steady dimmer band below it and the glowing impact line
        const top = this.held && !this.held.dead ? Math.max(this.y, this.held.y) : this.y;
        if (yb > top) {
          const g = ctx.createLinearGradient(0, top, 0, yb);
          g.addColorStop(0, 'rgba(255,140,70,0.05)'); g.addColorStop(1, 'rgba(255,150,80,0.26)');
          ctx.fillStyle = g; ctx.fillRect(x0, top, this.w, yb - top);
          ctx.strokeStyle = 'rgba(255,170,100,0.45)'; ctx.lineWidth = 2;
          ctx.beginPath(); ctx.moveTo(x0 + 1, top); ctx.lineTo(x0 + 1, yb); ctx.moveTo(x1 - 1, top); ctx.lineTo(x1 - 1, yb); ctx.stroke();
        }
        ctx.fillStyle = 'rgba(255,200,140,' + (0.55 + 0.35 * pulse).toFixed(3) + ')';
        ctx.fillRect(x0 + 4, yb - 5, this.w - 8, 5);
        glow(ctx, this.cx, yb - 4, this.w * 0.6, EMBER, 0.55);
      } else if (this.style === 'column') {
        const g = ctx.createLinearGradient(0, this.y, 0, yb);
        g.addColorStop(0, 'rgba(255,140,70,' + (0.25 + 0.25 * k).toFixed(3) + ')');
        g.addColorStop(0.6, 'rgba(255,120,60,' + (0.08 + 0.12 * k).toFixed(3) + ')');
        g.addColorStop(1, 'rgba(255,150,80,' + (0.2 + 0.3 * k).toFixed(3) + ')');
        ctx.fillStyle = g; ctx.fillRect(x0, this.y, this.w, this.h);
        ctx.strokeStyle = 'rgba(255,170,100,' + (0.35 + 0.45 * pulse * (0.4 + 0.6 * k)).toFixed(3) + ')';
        ctx.lineWidth = 2; ctx.setLineDash([14, 10]); ctx.lineDashOffset = -this.age * 120;
        ctx.beginPath(); ctx.moveTo(x0 + 1, this.y); ctx.lineTo(x0 + 1, yb); ctx.moveTo(x1 - 1, this.y); ctx.lineTo(x1 - 1, yb); ctx.stroke();
        ctx.setLineDash([]);
        glow(ctx, this.cx, this.y + 8, 30 + 20 * k, EMBER, 0.5 + 0.3 * pulse);
        ctx.fillStyle = 'rgba(255,200,140,' + (0.5 + 0.4 * pulse).toFixed(3) + ')';
        ctx.fillRect(x0 + 4, yb - 5, this.w - 8, 5);
        glow(ctx, this.cx, yb - 4, this.w * 0.6, EMBER, 0.35 + 0.35 * k);
      } else {
        const g = ctx.createLinearGradient(0, yb, 0, this.y);
        g.addColorStop(0, 'rgba(255,170,100,' + (0.35 + 0.3 * k).toFixed(3) + ')'); g.addColorStop(1, 'rgba(255,140,70,0)');
        ctx.fillStyle = g; ctx.fillRect(x0, this.y, this.w, this.h);
        ctx.fillStyle = 'rgba(255,215,160,' + (0.55 + 0.4 * pulse).toFixed(3) + ')';
        ctx.fillRect(x0 + 6, yb - 4, this.w - 12, 4);
        // end brackets
        ctx.fillRect(x0, yb - 18, 4, 18); ctx.fillRect(x1 - 4, yb - 18, 4, 18);
        ctx.fillRect(x0, yb - 4, 14, 4); ctx.fillRect(x1 - 14, yb - 4, 14, 4);
        glow(ctx, this.cx, yb - 6, this.w * 0.55, EMBER, 0.3 + 0.3 * k);
      }
      ctx.restore();
      void t;
    }
  } : null;

  // ---------------------------------------------------------------------------------------------------------
  // The boss
  // ---------------------------------------------------------------------------------------------------------
  const ROT = { floor: 0, wallE: -Math.PI / 2, wallW: Math.PI / 2, strand: Math.PI / 2, ceil: Math.PI };

  class Matron extends G.Boss {
    constructor(props) {
      super(props, {
        hp: HP, w: BW, h: BH,
        physics: 'manual', gravity: 0,
        contactInset: 12,
        phases: [0.5],
        stagger: STAGGER,
        rest: [0.42, 0.85],
        phaseRest: [1, 0.78],
        introTime: 99,                       // the intro ends itself (endAttack) when she lands
        defeatStyle: 'custom',
        slowmo: 0.9,
        z: -2,
        colors: { body: '#1a1414', dark: '#0b0909', hit: '#ffd9b0', puddle: '#141011', smoke: SMOKE, tele: TELE },
        attacks: {
          pounce: { weight(dist) { return this.mustLeave() ? 9 : this.perchKind() === 'wall' ? 3.2 : dist > 220 ? 3 : 0.4; } },
          spit: { weight(dist) { return this.perchKind() === 'wall' ? (dist > CAM_REACH ? 0.4 : 3) : dist > 260 ? 2.4 : 0.5; }, cooldown: 2.4, when() { return !this.mustLeave(); } },
          swipe: { weight: 4.2, range: [0, 230], when() { return this.canSwipe(); } },
          skitter: { weight(dist) { return dist < 260 ? 2.2 : 1.3; }, cooldown: 4.5, when() { return this.onFloor() && this.perchOptions().length > 0; } },
          brood: { weight(dist) { return dist > CAM_REACH ? 0.3 : 1.6; }, cooldown: 12, when() { return !this.mustLeave() && this.liveMinions() < BROOD_CAP; } },
          ashfall: { phase: 2, weight: 2.4, cooldown: 7.5, when() { return this.onFloor(); } },
          ignite: { weight: 0, uninterruptible: true, when() { return false; } },
        },
      });
      this.pz = pose(POSES.dangle);
      this.pzT = pose(POSES.dangle);
      this.pzRate = 8;
      this.rot = ROT.strand; this.sx = 1; this.sxT = 1;
      this.perch = null;           // {kind:'surf', s} | {kind:'wall', wall} | {kind:'strand'}
      this.mv = null;              // active motion
      this.gait = { ph: 0, amt: 0, t: 0 };
      this.perchAttacks = 0;
      this.zones = [];             // my pending landing marks (removed on interrupt / defeat)
      this.ignited = false;
      this.pendingIgnite = false;
      this.introOn = false;
      this.strandTop = null;
      this.mouthGlow = 0;
      this.teleK = 0;
    }

    // ------------------------------------------------------------------ geometry helpers
    get A() { if (!this._A || this._A.room !== this.room) { this._A = buildArena(this.room); this._A.room = this.room; } return this._A; }
    perchKind() { return !this.perch ? 'air' : this.perch.kind === 'surf' ? (this.perch.s.floor ? 'floor' : 'surf') : this.perch.kind; }
    onFloor() { return !this.mv && this.perch && this.perch.kind === 'surf' && this.perch.s.floor; }
    onSurface() { return !this.mv && this.perch && this.perch.kind === 'surf'; }
    mustLeave() { const k = this.perchKind(); return (k === 'wall' || k === 'surf') && this.perchAttacks >= 2; }
    boxFor(kind) { return kind === 'wall' ? { w: BH, h: BW } : { w: BW, h: BH }; }
    setBox(kind, cx, cy) {
      const b = this.boxFor(kind);
      this.w = b.w; this.h = b.h;
      this.x = cx - b.w / 2; this.y = cy - b.h / 2;
    }
    /** centre of her body when perched at a wall / standing at x on surface s */
    wallCenter(w) { return { x: w.face - w.side * BH / 2, y: w.cy }; }
    surfCenter(s, x) { const r = surfRange(s); return { x: clamp(x, r[0], r[1]), y: s.y - BH / 2 }; }
    playerFeet() { const p = this.player; return p ? { x: p.x + p.w / 2, y: p.y + p.h } : { x: this.cx, y: this.A.floor.y }; }
    playerSurface() {
      const f = this.playerFeet();
      return surfaceBelow(this.A, f.x, f.y - 6, 0) || surfaceBelow(this.A, f.x, f.y - 6, 30) || this.A.floor;
    }
    /** drawing anchor (ground contact point under the body centre) */
    anchorPt() {
      const ca = Math.cos(this.rot), sa = Math.sin(this.rot);
      const half = BH / 2;
      // local (0, -half) rotated → centre offset; anchor = centre - that
      return { x: this.cx - (half * sa), y: this.cy + half * ca };
    }
    /** local (drawing frame) point → world */
    toWorld(lx, ly) {
      const a = this.anchorPt(), ca = Math.cos(this.rot), sa = Math.sin(this.rot);
      const x = lx * this.sx;
      return { x: a.x + x * ca - ly * sa, y: a.y + x * sa + ly * ca };
    }
    headWorld() { const bt = bodyXf(this.pz, this.t || 0); const h = bt(74, -40); return this.toWorld(h[0], h[1]); }
    tailWorld() { const bt = bodyXf(this.pz, this.t || 0); const h = bt(-92, -50); return this.toWorld(h[0], h[1]); }
    eye() { return this.headWorld(); }
    teleAnchor() { return this.headWorld(); }

    /** pose damping; the roll onto her back / onto her feet ('flip') runs at a fixed brisk speed with a hop
     *  (drawBody), so the body passes edge-on in a few frames instead of lingering as a flat sliver */
    poseStep(dt) {
      for (const k of POSE_KEYS) {
        if (k === 'flip') {
          const f0 = this.pz.flip, tg = this.pzT.flip;
          const f1 = Math.abs(tg - f0) < FLIP_SPEED * dt ? tg : f0 + Math.sign(tg - f0) * FLIP_SPEED * dt;
          this.pz.flip = f1;
          if ((f0 - 0.5) * (f1 - 0.5) < 0 && G.fx) {
            const a = this.anchorPt();
            G.fx.burst('dust', a.x, a.y - 10, { count: 10, color: '#5a4a42', speed: 200, spread: 1.3, angle: -Math.PI / 2 });
            G.fx.burst('smoke', a.x, a.y - 40, { count: 4, color: SMOKE, alpha: 0.45, size: 14, speed: 60 });
          }
        } else this.pz[k] = damp(this.pz[k], this.pzT[k], this.pzRate, dt);
      }
    }
    want(p, rate) { this.pzT = pose(p); this.pzRate = rate || 8; }
    wantMix(p, extra, rate) { this.pzT = pose(Object.assign({}, p, extra)); this.pzRate = rate || 8; }

    // ------------------------------------------------------------------ motion
    /** Leap along an arc to centre (x1, y1), ending perched on `perch` (rot/flip follow). */
    leap(x1, y1, perch, o) {
      o = o || {};
      const x0 = this.cx, y0 = this.cy;
      const dist = Math.hypot(x1 - x0, y1 - y0);
      const T = o.T || clamp(0.5 + dist / 2400, 0.55, 0.95);
      let H = o.H != null ? o.H : clamp(130 + Math.abs(x1 - x0) * 0.12, 150, 260);
      const top = this.A.ceilY + BH * 0.6;
      // keep the apex under the vault; raise it if the path clips terrain
      const peak = (h) => Math.min(y0, y1) - h * 0.9;
      if (peak(H) < top) H = Math.max(40, (Math.min(y0, y1) - top) / 0.9);
      for (let tries = 0; tries < 4 && this.arcBlocked(x0, y0, x1, y1, H); tries++) H = Math.max(40, H * (tries < 2 ? 1.35 : 0.5));
      const rot1 = perch.kind === 'wall' ? (perch.wall.side > 0 ? ROT.wallE : ROT.wallW) : perch.kind === 'strand' ? ROT.strand : ROT.floor;
      let sx1;
      if (perch.kind === 'wall') sx1 = perch.wall.side > 0 ? -1 : 1;
      else if (perch.kind === 'strand') sx1 = 1;
      else sx1 = x1 >= x0 ? 1 : -1;
      this.mv = { type: 'arc', x0, y0, x1, y1, T, H, t: 0, rot0: this.rot, rot1, sx0: this.sx, sx1, perch, onLand: o.onLand || null };
      this.perch = null;
      this.setBox('surf', x0, y0);
      return this.mv;
    }
    arcBlocked(x0, y0, x1, y1, H) {
      const A = this.A;
      for (let i = 2; i < 15; i++) {
        const u = i / 16;
        const x = lerp(x0, x1, u * u * (3 - 2 * u)), y = lerp(y0, y1, u) - 4 * H * u * (1 - u);
        if (G.Physics.rectSolid(this.room, x - BW / 2 + 16, y - BH / 2 + 12, BW - 32, BH - 24)) return true;
        if (y - BH / 2 < A.ceilY - 4) return true;
      }
      return false;
    }
    /** Drop straight down onto the surface below (stagger, interrupted leaps, the strand cut). */
    fall(onLand, target) {
      const s = target || surfaceBelow(this.A, this.cx, this.y + this.h - 4, 10) || this.A.floor;
      this.mv = { type: 'fall', vy: Math.max(0, this.mv && this.mv.type === 'fall' ? this.mv.vy : 0), s, onLand: onLand || null, rot0: this.rot };
      this.perch = null;
      const cx = this.cx, cy = this.cy;
      this.setBox('surf', cx, cy);
    }
    motionStep(dt) {
      const m = this.mv;
      this.gait.t += dt;
      if (m && m.type === 'arc') {
        m.t += dt;
        const u = clamp(m.t / m.T, 0, 1);
        const xu = u * u * (3 - 2 * u);           // near-vertical take-off and landing: no low sweep at either end
        const cx = lerp(m.x0, m.x1, xu), cy = lerp(m.y0, m.y1, u) - 4 * m.H * u * (1 - u);
        this.x = cx - this.w / 2; this.y = cy - this.h / 2;
        let dr = m.rot1 - m.rot0;
        while (dr > Math.PI) dr -= TAU;
        while (dr < -Math.PI) dr += TAU;
        this.rot = m.rot0 + dr * ease(u * 1.15);
        this.sx = lerp(m.sx0, m.sx1, ease(u * 1.3));
        if (Math.abs(this.sx) < 0.08) this.sx = this.sx < 0 ? -0.08 : 0.08;
        this.vx = (m.x1 - m.x0) / m.T;
        if (u >= 1) this.arrive(m.perch, m.onLand);
        return;
      }
      if (m && m.type === 'fall') {
        m.vy = Math.min(m.vy + GRAV * dt, 1500);
        const prevB = this.y + this.h;
        this.y += m.vy * dt;
        this.rot = damp(this.rot, 0, 12, dt);
        const s = m.s;
        if (this.y + this.h >= s.y && prevB <= s.y + 2) {
          const c = this.surfCenter(s, this.cx);
          this.x = c.x - this.w / 2;
          this.arrive({ kind: 'surf', s }, m.onLand, m.vy);
        } else if (this.y + this.h > this.A.floor.y + 4) {          // safety: never sink through the floor
          this.y = this.A.floor.y - this.h;
          this.arrive({ kind: 'surf', s: this.A.floor }, m.onLand, m.vy);
        }
        return;
      }
      // perched: walking on a surface
      if (this.perch && this.perch.kind === 'surf') {
        const s = this.perch.s, r = surfRange(s);
        if (this.vx) {
          const nx = clamp(this.cx + this.vx * dt, r[0], r[1]);
          if (Math.abs(nx - this.cx) < Math.abs(this.vx * dt) * 0.5) this.vx = 0;
          this.x = nx - this.w / 2;
          this.gait.ph += Math.abs(this.vx) * dt / 22;
          this.gait.amt = damp(this.gait.amt, 1, 10, dt);
        } else this.gait.amt = damp(this.gait.amt, 0, 8, dt);
        this.y = s.y - this.h;
        this.rot = damp(this.rot, 0, 14, dt);
        this.sx = damp(this.sx, this.facing, 11, dt);
        if (Math.abs(this.sx) < 0.08) this.sx = this.facing * 0.08;
      } else if (this.perch && this.perch.kind === 'wall') {
        const c = this.wallCenter(this.perch.wall);
        this.setBox('wall', c.x, c.y);
        this.rot = this.perch.wall.side > 0 ? ROT.wallE : ROT.wallW;
        this.sx = this.perch.wall.side > 0 ? -1 : 1;
        this.vx = 0;
      }
    }
    arrive(perch, onLand, vy) {
      const m = this.mv;
      this.mv = null;
      this.perch = perch;
      this.vx = 0;
      if (perch.kind === 'wall') {
        const c = this.wallCenter(perch.wall);
        this.setBox('wall', c.x, c.y);
        this.rot = perch.wall.side > 0 ? ROT.wallE : ROT.wallW;
        this.sx = perch.wall.side > 0 ? -1 : 1;
      } else if (perch.kind === 'surf') {
        const c = this.surfCenter(perch.s, this.cx);
        this.setBox('surf', c.x, c.y);
        this.rot = 0;
        this.sx = m && m.sx1 != null ? m.sx1 : this.sx;
        this.facing = this.sx >= 0 ? 1 : -1;
      } else if (perch.kind === 'strand') {
        this.rot = ROT.strand; this.sx = 1;
      }
      if (typeof onLand === 'function') onLand.call(this, perch, vy || 0);
    }
    /** Land feedback: dust, shake, sfx (soft for perches, heavy for the floor). */
    landFx(heavy) {
      const a = this.anchorPt();
      if (G.fx) {
        G.fx.burst('dust', a.x, a.y, { count: heavy ? 16 : 8, color: '#5a4a42', speed: heavy ? 260 : 150, spread: 1.2, angle: -Math.PI / 2 });
        G.fx.burst('ash', a.x, a.y - 20, { count: heavy ? 10 : 4, color: '#8a7a70' });
        if (heavy) G.fx.burst('ember', a.x, a.y - 10, { count: 6, color: EMBER_HI });
      }
      if (G.game) G.game.shake(heavy ? 7 : 3, heavy ? 0.3 : 0.15);
      G.sfxAt('matron_land', this.cx, { vol: heavy ? 1 : 0.6, pitch: heavy ? 1 : 1.15 });
    }
    /** Pulsing landing mark on surface s around centre x (until dur). */
    markLanding(s, x, dur, color, wide) {
      const m = wide ? 30 : 10;
      const z = this.room ? this.room.add(new Mark({ x: x - BW / 2 - m, y: s.y - 44, w: BW + 2 * m, h: 44, dur: Math.max(0.1, dur), color: color || TELE, style: 'floor' })) : null;
      if (z) this.zones.push(z);
      return z;
    }
    clearZones() { for (const z of this.zones) if (z && !z.dead && z.remove) z.remove(); this.zones.length = 0; }

    // ------------------------------------------------------------------ lifecycle
    init() {
      super.init();
      const A = this.A;
      // hang from the vault on a soot strand over the nest; never right above the player
      const f = this.playerFeet();
      const fr = surfRange(A.floor);
      let sxp = clamp(A.strandX, fr[0], fr[1]);
      if (Math.abs(sxp - f.x) < 320) {
        for (const dx of [-420, 420, -620, 620, 300, -300]) {
          const cand = clamp(A.strandX + dx, fr[0], fr[1]);
          if (Math.abs(cand - f.x) >= 320) { sxp = cand; break; }
        }
      }
      this.strandTop = A.ceilY;
      this.setBox('surf', sxp, A.ceilY + 40);
      this.perch = { kind: 'strand' };
      this.rot = ROT.strand; this.sx = 1;
      this.contactDamage = 0;
      this.facing = f.x < sxp ? -1 : 1;
    }
    think(dt) {
      super.think(dt);
      if (this.dead || this.dying) return;
      this.motionStep(dt);
      // pose damping
      this.poseStep(dt);
      this.mouthGlow = damp(this.mouthGlow, this.state === 'spit' && this.telegraphing ? 1 : 0, this.state === 'spit' ? 4 : 10, dt);
      this.teleK = this.telegraphing ? Math.min(1, this.tele.t / Math.max(0.05, this.tele.dur)) : 0;
      const cd0 = this.contactDamage;
      this.contactDamage = (this.state === 'stagger' || this.introOn || this.dying) ? 0 : 1;
      // Contact grace: after her body hurts the player (or when she rolls back onto her feet with the player on/in
      // her), contact pauses for the player's i-frames + CONTACT_GRACE s so they can always walk out of her
      // (150 px) - but only once per overlap: standing inside her is never safe (it used to be a free face-tank).
      const pl = this.player;
      const inside = !!pl && this.overlapsPlayer(0);
      if (inside) {
        if (cd0 === 0 && this.contactDamage === 1) { this._graceT = Math.max(this._graceT || 0, ROLLUP_GRACE); this._graceUsed = true; }
        else if (!this._graceUsed && this.contactDamage === 1 && pl.invuln > 0.6) { this._graceT = pl.invuln + CONTACT_GRACE; this._graceUsed = true; }
      } else this._graceUsed = false;
      if (this._graceT > 0) { this._graceT -= dt; this.contactGrace = this._graceT > 0 && inside; }
      // light + ambient soot
      if (G.lighting) {
        const h = this.headWorld();
        G.lighting.add({ x: this.cx, y: this.cy, r: 300 + (this.ignited ? 60 : 0), color: '#ff8a4a', intensity: 0.55 + (this.ignited ? 0.12 : 0), flicker: true });
        if (this.pz.eyes > 0.1) G.lighting.add({ x: h.x, y: h.y, r: 110, color: '#ffb060', intensity: 0.35 * this.pz.eyes });
      }
      if (G.fx && Math.random() < dt * (this.ignited ? 7 : 3.5)) {
        const tl = this.tailWorld();
        G.fx.burst('smoke', tl.x, tl.y, { count: 1, color: SMOKE, alpha: 0.35, size: 9, speed: 30 });
      }
      if (G.fx && this.ignited && Math.random() < dt * 5) G.fx.burst('ember', this.cx + rnd(-50, 50), this.cy + rnd(-30, 30), { count: 1, color: EMBER_HI });
      if (this.perch && this.perch.kind === 'strand' && this.strandTop != null && G.fx && Math.random() < dt * 4) {
        G.fx.burst('ash', this.cx + rnd(-6, 6), this.strandTop + 6, { count: 1, color: '#6a5a52' });
      }
    }
    // the base settles a dying body with box physics; she drops onto her surface with her own motion
    settle(dt) {
      if (!this.room || this._husked) return;
      if (!this._deathPlaced) {
        // her husk stays in the den for good: never on the entry ledge / step or in front of the east door
        this._deathPlaced = true;
        const d = this.deathSpot();
        if (d) { G.sfxAt('matron_leap', this.cx, { vol: 0.5, pitch: 0.7 }); this.leap(d.x, d.y, { kind: 'surf', s: d.s }, { T: 0.8, H: 90 }); this.mv.deathArc = true; }
      }
      if (this.mv && this.mv.type === 'arc' && !this.mv.deathArc) { this.fall(); }
      if (!this.mv && (!this.perch || this.perch.kind !== 'surf')) this.fall();
      if (this.mv) this.motionStep(dt);
      else { this.gait.t += dt; this.rot = damp(this.rot, 0, 10, dt); }
      if (G.lighting) G.lighting.add({ x: this.cx, y: this.cy, r: 200, color: '#ff7a3a', intensity: 0.3 * Math.max(0.2, this.pz.glow), flicker: true });
      this.poseStep(dt);
    }

    // ------------------------------------------------------------------ intro: down the soot strand, screech, drop
    beginFight() {
      if (this.fightStarted || this._starting || this.introOn) return;
      this.introOn = true; this.introT = 0;
      this.want(POSES.dangle, 6);
      const cam = G.camera;
      if (cam && typeof cam.follow === 'function' && G.game) {
        const p = this.player;
        this._camProxy = { x: p ? p.x : this.cx, y: p ? p.y : this.cy, w: 26, h: 54, facing: this.facing, vx: 0, vy: 0, room: this.room };
        cam.follow(this._camProxy);
        G.game.lockPlayer('matron_intro');
        this._locked = true;
      }
      G.sfxAt('matron_skitter', this.cx, { vol: 0.7 });
      if (G.game) G.game.shake(2, 1.4);
    }
    releaseCinematic() {
      if (this._camProxy && G.camera && G.camera.target === this._camProxy) G.camera.follow(G.game && G.game.player);
      this._camProxy = null;
      if (this._locked && G.game) G.game.unlockPlayer('matron_intro');
      this._locked = false;
    }
    // ------------------------------------------------------------------ fight camera
    // The den (48 tiles) is wider than the screen (32): from a far wall cling she would attack from off-screen. While
    // the fight runs the camera follows a stand-in for the player shifted toward her (at most CAM_BIAS px, so the
    // player always stays >= ~190 px inside the view); it is the plain player again as soon as she is gone.
    update(dt) {
      super.update(dt);
      this.camUpdate(dt);
    }
    camUpdate(dt) {
      const cam = G.camera, p = G.game && G.game.player;
      if (!cam || typeof cam.follow !== 'function' || !p || p.room !== this.room || this.dead) return;
      if (!this.fightStarted || this.introOn || this._husked) return;
      // the view centre without a lean is the player + the camera's look-ahead; lean just enough to keep her centre
      // CAM_IN px inside the view (her legs splay far beyond her body box), never moving the player more than
      // CAM_BIAS px off the view centre
      const pc = p.x + p.w / 2, look = +cam.lookX || 0, c0 = pc + look;
      const half = (cam.w || 1280) / 2 - CAM_IN;
      const c1 = clamp(c0, this.cx - half, this.cx + half);
      const want = clamp(c1 - c0, -CAM_BIAS - look, CAM_BIAS - look);
      // taking the camera over (end of the intro): start at the full lean, so the view eases from the intro shot
      // straight to its fight framing instead of swinging back to the player and drifting out again
      const takeover = cam.target === p;
      this.camBias = takeover ? want : damp(this.camBias || 0, want, 2.6, dt);
      // perched high (west cling, strand) with the view pinned to the den floor: lift the view a little so she is
      // clear of the HUD corner (the camera's own hard limit keeps the player >= 60 px above the bottom edge)
      let wantY = 0;
      // (the lift starts with the leap up to such a perch, so she never hangs out of view while the view catches up)
      const mv = this.mv, hiY = mv ? (mv.type === 'arc' && mv.perch && mv.perch.kind !== 'surf' && !mv.deathArc ? mv.y1 : null)
        : (this.perch && this.perch.kind !== 'surf' ? this.cy : null);
      if (hiY != null) {
        const H = cam.h || 720, rh = this.room.heightPx || H;
        const pcy = p.y + p.h / 2, natY = clamp(pcy - H * 0.56, 0, Math.max(0, rh - H));
        const short = CAM_TOP - (hiY - natY);
        if (short > 0) wantY = Math.max(natY - short, pcy - (H - 80)) - (pcy - H * 0.56);
        wantY = Math.min(0, wantY);
      }
      this.camBiasY = takeover ? wantY : damp(this.camBiasY || 0, wantY, 2.6, dt);
      if (!this._fightCam) {
        const self = this;
        const pl = () => (G.game && G.game.player) || null;
        this._fightCam = {
          isMatronCam: true,
          get x() { const q = pl(); return q ? q.x + (self.camBias || 0) : 0; },
          get y() { const q = pl(); return q ? q.y + (self.camBiasY || 0) : 0; },
          get w() { const q = pl(); return q ? q.w : 26; },
          get h() { const q = pl(); return q ? q.h : 54; },
          get motor() { const q = pl(); return q ? q.motor : null; },
          get facing() { const q = pl(); return q ? q.facing : 1; },
          get vx() { const q = pl(); return q ? q.vx || 0 : 0; },
          get vy() { const q = pl(); return q ? q.vy || 0 : 0; },
          get room() { const q = pl(); return q ? q.room : null; },
        };
      }
      if (cam.target === p) cam.follow(this._fightCam);
    }
    releaseFightCam() {
      if (this._fightCam && G.camera && G.camera.target === this._fightCam) G.camera.follow(G.game && G.game.player);
    }
    remove() {
      this.releaseFightCam();
      super.remove();
    }
    introUpdate(dt) {
      if (!this.introOn) return;
      const w = (this.introT += dt);
      const A = this.A;
      const hangY = Math.max(A.ceilY + 180, A.floor.y - 11 * TILE);
      if (this._camProxy) {
        const p = this.player;
        const k = ease(w / 1.2);
        this._camProxy.x = lerp(p ? p.x : this.cx, this.cx - 13, 0.55 * k);
        this._camProxy.y = lerp(p ? p.y : this.cy, this.cy + 120, 0.75 * k);
      }
      if (!this.fightStarted) {
        // descend on the strand, eyes kindling one after another
        const k = ease(w / 1.6);
        this.y = lerp(A.ceilY + 40, hangY, k) - this.h / 2;
        this.wantMix(POSES.dangle, { eyes: clamp((w - 0.5) / 0.9, 0, 1), glow: 0.3 + 0.4 * k }, 6);
        if (w > 0.55 && this.once('eyes')) { G.sfxAt('matron_gurgle', this.cx, { vol: 0.5, pitch: 0.8 }); }
        if (w >= 1.75 && this.once('screech')) {
          this.want(POSES.hang, 10);
          G.sfxAt('matron_screech', this.cx, { vol: 1 });
          if (G.fx) G.fx.burst('ash', this.cx, A.ceilY + 20, { count: 16, color: '#6a5a52' });
          G.Boss.prototype.beginFight.call(this);      // intro lines (if any) → card, music, roar, bossStart
        }
        if (w > 9) G.Boss.prototype.beginFight.call(this);   // safety
        return;
      }
      // fight started: hold the screech a beat, then cut the strand and drop
      if (this._dropAt == null) this._dropAt = w + 0.7;
      if (w >= this._dropAt && this.once('drop')) {
        this.strandTop = null;
        this.want(POSES.air, 6);
        G.sfxAt('matron_leap', this.cx, { vol: 0.8, pitch: 0.8 });
        this.fall(function () {
          this.landFx(true);
          this.want(POSES.idle, 6);
          this.introOn = false;
          this.releaseCinematic();
          this.face();
          this.endAttack(0.55);
        });
      }
      if (w > 12) { this.introOn = false; this.releaseCinematic(); this.endAttack(0.3); }   // safety
    }

    broodBusy() {
      const rm = this.room;
      if (!rm) return false;
      const now = G.game ? G.game.t || 0 : 0;
      if (rm._broodDartEnd != null && now - rm._broodDartEnd < 0.35) return true;
      return rm.entities.some((e) => e.kind === 'matron_brood' && !e.dead && !e.dying && (e.state === 'aim' || e.state === 'dart'));
    }
    // ------------------------------------------------------------------ idle
    idleUpdate(dt) {
      // (the scheduler runs right after this hook in the same step: keep it from picking over a forced attack)
      if (this.pendingIgnite && this.phase >= 2 && !this.dying) { this.pendingIgnite = false; this.restTime = Infinity; this.startAttack('ignite'); return; }
      // a brood sprite is aiming / darting (or just did): she waits for it, so its dart never overlaps her next attack
      if (this.broodBusy()) this.restTime = Math.max(this.restTime, this.stateTime + 0.1);
      if (!this.mv && (!this.perch || this.perch.kind === 'strand')) { this.fall((p, vy) => { if (vy > 300) this.landFx(true); }); return; }
      if (this.mv) return;
      this.want(POSES.idle, 7);
      if (this.onSurface()) {
        this.face();
        const p = this.player;
        if (this.perch.s.floor && p) {
          const dx = (p.x + p.w / 2) - this.cx, d = Math.abs(dx);
          let v = 0;
          if (d < 190) v = -Math.sign(dx) * 170;
          else if (d > 560) v = Math.sign(dx) * 150;
          this.vx = damp(this.vx, v, 8, dt);
          if (Math.abs(this.vx) < 4) this.vx = 0;
        } else this.vx = 0;
      }
    }
    face(target) {
      if (!this.onSurface() && this.perch) return;
      super.face(target);
    }

    // ------------------------------------------------------------------ scheduler helpers
    canSwipe() {
      if (!this.onSurface() || this.mustLeave()) return false;
      const p = this.player;
      if (!p) return false;
      const pc = p.x + p.w / 2, dir = pc >= this.cx ? 1 : -1;
      if (Math.abs((p.y + p.h) - this.perch.s.y) > 70) return false;     // the player stands on her surface
      // room behind the player to back off (no corner trap)
      // on the floor: room behind the player to back off (no corner trap); on a platform they can drop off
      if (!this.perch.s.floor) return true;
      const s = this.perch.s;
      const space = dir > 0 ? (s.x1 - pc) : (pc - s.x0);
      return space >= 190;
    }
    /** Perches she may skitter to: walls and raised surfaces at least 280 px from the player (never the current one). */
    perchOptions() {
      const out = [];
      const f = this.playerFeet();
      for (const w of this.A.walls) {
        const c = this.wallCenter(w);
        // far enough to be a retreat, near enough to stay on screen (fight camera)
        if (Math.hypot(c.x - f.x, c.y - (f.y - 27)) >= 300 && Math.abs(c.x - f.x) <= CAM_REACH) out.push({ kind: 'wall', wall: w, x: c.x, y: c.y, weight: 2 });
      }
      for (const s of this.A.surfaces) {
        if (s.floor || s.x1 - s.x0 < 200) continue;
        if (this.perch && this.perch.kind === 'surf' && this.perch.s === s) continue;
        const c = this.surfCenter(s, (s.x0 + s.x1) / 2);
        if (Math.hypot(c.x - f.x, c.y - (f.y - 27)) >= 280) out.push({ kind: 'surf', s, x: c.x, y: c.y, weight: 1 });
      }
      return out;
    }
    onAttackStart(name) {
      if (name !== 'pounce' && name !== 'skitter' && name !== 'ignite' && this.perchKind() !== 'floor') this.perchAttacks++;
      this.vx = 0;
    }

    // ------------------------------------------------------------------ attacks
    /** pounce: crouch → leap onto the player's surface (mark during the flight) → [P2 shockwaves] → recover */
    atk_pounce(dt, s) {
      const d = this.stateData;
      const p2 = this.phase >= 2;
      if (this.once('wind')) {
        if (this.onSurface()) this.face();
        d.w = this.telegraph(d.quick ? 0.34 : p2 ? 0.5 : 0.58, { sound: 'matron_hiss', color: TELE, shake: 1.4, force: !!d.quick });
        this.want(POSES.crouch, 9);
      }
      if (s < d.w) { this.vx = 0; return; }
      if (this.once('go')) {
        const sf = this.playerSurface();
        const f = this.playerFeet();
        const c = this.surfCenter(sf, f.x);
        this.perchAttacks = 0;
        this.want(POSES.air, 9);
        G.sfxAt('matron_leap', this.cx);
        if (G.fx) G.fx.burst('dust', this.anchorPt().x, this.anchorPt().y, { count: 8, color: '#5a4a42', speed: 160 });
        const dd = Math.hypot(c.x - this.cx, c.y - this.cy);
        const mv = this.leap(c.x, c.y, { kind: 'surf', s: sf }, { T: clamp(0.62 + dd / 2400, 0.66, 0.98), onLand: () => { d.landT = this.stateTime; this.pounceLand(sf); } });
        this.markLanding(sf, c.x, mv.T, null, p2);
        return;
      }
      if (d.landT == null) { if (s > d.w + 3) this.endAttack(); return; }
      const rec = s - d.landT;
      if (rec < 0.12) this.want(POSES.crouch, 14); else this.want(POSES.idle, 5);
      if (!d.quick && p2 && rec >= 0.3 && this.once('chain') && Math.random() < 0.4 && this.playerDist() > 220) {
        this.setState('pounce', { quick: true });
        this.attack = 'pounce';
        return;
      }
      if (rec >= (p2 ? 0.5 : 0.62)) this.endAttack();
    }
    pounceLand(sf) {
      this.clearZones();
      this.landFx(true);
      if (this.phase >= 2) {
        const a = this.anchorPt();
        for (const dir of [-1, 1]) {
          G.spawnProjectile(this.room, 'wave', { x: a.x + dir * (BW / 2 + 10), y: sf.y, dir, speed: 380, owner: this, color: '#ff9a50', w: 30, h: 40 });
        }
        G.sfxAt('shockwave', this.cx, { vol: 0.7 });
      }
    }

    /** skitter: crouch → leap to a wall cling or a raised surface away from the player */
    atk_skitter(dt, s) {
      const d = this.stateData;
      if (this.once('wind')) {
        const opts = this.perchOptions();
        if (!opts.length) { this.endAttack(0.1); return; }
        let tot = 0; for (const o of opts) tot += o.weight;
        let r = Math.random() * tot; d.dest = opts[opts.length - 1];
        for (const o of opts) { r -= o.weight; if (r <= 0) { d.dest = o; break; } }
        this.facing = d.dest.x >= this.cx ? 1 : -1;
        d.w = this.telegraph(0.45, { sound: 'matron_skitter', color: TELE, shake: 1 });
        this.want(POSES.crouch, 10);
      }
      if (s < d.w) { this.vx = 0; return; }
      if (this.once('go')) {
        const o = d.dest;
        const perch = o.kind === 'wall' ? { kind: 'wall', wall: o.wall } : { kind: 'surf', s: o.s };
        this.want(POSES.air, 9);
        G.sfxAt('matron_leap', this.cx, { vol: 0.8 });
        this.leap(o.x, o.y, perch, { H: o.kind === 'wall' ? 200 : null, onLand: () => { d.landT = this.stateTime; this.perchAttacks = 0; this.landFx(false); } });
        return;
      }
      if (d.landT != null) { this.want(POSES.idle, 6); if (s - d.landT > 0.25) this.endAttack(rnd(0.3, 0.5)); }
      else if (s > d.w + 3) this.endAttack();
    }

    /** spit: rear back, throat glows → a fan of soot balls lobbed around the player */
    atk_spit(dt, s) {
      const d = this.stateData;
      const p2 = this.phase >= 2;
      if (this.once('wind')) {
        if (this.onSurface()) this.face();
        const m = this.headWorld();
        d.w = this.telegraph(p2 ? 0.5 : 0.56, { sound: 'matron_gurgle', color: '#ffb060', shake: 1, x: m.x, y: m.y });
        this.want(this.perchKind() === 'wall' ? pose({ mouth: 1, swell: 0.3, glow: 0.7, crouch: 0.3 }) : POSES.spitWind, 7);
      }
      if (s < d.w) { this.vx = 0; return; }
      if (this.once('fire')) {
        const n = p2 ? 5 : 3, gap = p2 ? 140 : 130;
        const f = this.playerFeet();
        const m = this.headWorld();
        const time = clamp(0.9 + Math.hypot(f.x - m.x, f.y - m.y) / 3000, 0.95, 1.2);
        for (let i = 0; i < n; i++) {
          const off = (i - (n - 1) / 2) * gap;
          const tx = clamp(f.x + off, this.A.x0 + 14, this.A.x1 - 14);
          const sb = surfaceBelow(this.A, tx, f.y - 8, 0) || this.A.floor;
          this.lob('matron_soot', { x: tx - 1, y: sb.y - 12, w: 2, h: 2 }, { time, x: m.x, y: m.y, sound: false, landY: sb.y, landX: tx });
        }
        G.sfxAt('matron_spit', m.x, { vol: 1 });
        if (G.fx) G.fx.burst('smoke', m.x, m.y, { count: 6, color: SMOKE, alpha: 0.5, size: 10, speed: 90 });
        this.want(pose({ mouth: 0.4, rear: this.perchKind() === 'wall' ? 0 : 0.1, glow: 0.5 }), 10);
      }
      if (s > d.w + 0.62) this.endAttack();
    }

    /** swipe: forelegs raised → stab down in front (P2: a second stab) */
    atk_swipe(dt, s) {
      const d = this.stateData;
      const p2 = this.phase >= 2;
      if (!this.onSurface() && !d.w) { this.endAttack(0.1); return; }
      if (this.once('wind')) {
        this.face();
        d.w = this.telegraph(p2 ? 0.44 : 0.5, { sound: 'matron_rasp', color: TELE, shake: 1.6 });
        this.want(POSES.swipeWind, 9);
        d.n = p2 ? 2 : 1; d.i = 0; d.hitAt = d.w;
      }
      this.vx = 0;
      if (d.i < d.n && s >= d.hitAt) {
        if (this.once('hit' + d.i)) {
          // lunge a step and stab
          const r = surfRange(this.perch.s);
          const nx = clamp(this.cx + this.facing * 34, r[0], r[1]);
          this.x = nx - this.w / 2;
          this.want(POSES.swipeHit, 22);
          G.sfxAt('matron_swipe', this.cx);
          const fx = this.cx + this.facing * (BW / 2 + 60);
          if (G.fx) { G.fx.burst('dust', fx, this.y + this.h, { count: 10, color: '#5a4a42', speed: 200 }); G.fx.burst('spark', fx, this.y + this.h - 6, { count: 6, color: EMBER_HI, speed: 260 }); }
          if (G.game) G.game.shake(4, 0.15);
          d.activeTo = s + 0.1;
        }
        if (s <= d.activeTo) this.strike(this.swipeRect(), { id: 'swipe' + this.uid + ':' + this.strikeSerial + ':' + d.i, dir: { x: this.facing, y: 0.3 } });
        else {
          d.i++;
          if (d.i < d.n) {
            this.face();
            const w2 = this.telegraph(0.3, { sound: 'matron_rasp', color: TELE, shake: 1.2, vol: 0.6 });
            d.hitAt = s + w2;
            this.want(POSES.swipeWind, 14);
          } else d.recT = s;
        }
        return;
      }
      if (d.recT != null) {
        this.want(pose({ crouch: 0.4, glow: 0.5 }), 5);
        if (s - d.recT >= 0.6) this.endAttack();
      } else if (s > 4) this.endAttack();
    }
    /** the whole stretch of floor a coming stab can reach (before its lunge): what the raised forelegs promise */
    swipeZone() {
      const r = this.swipeRect(), d = this.stateData || {};
      const lunges = this.state === 'swipe' ? Math.max(0, (d.n || 1) - (d.i || 0) - (d.activeTo != null && d.i < (d.n || 1) ? 1 : 0)) : 0;
      const ext = 34 * lunges;
      return this.facing > 0 ? { x: r.x, y: r.y, w: r.w + ext, h: r.h } : { x: r.x - ext, y: r.y, w: r.w + ext, h: r.h };
    }
    swipeRect() {
      const f = this.facing;
      const reach = 112;
      const x = f > 0 ? this.x + this.w - 26 : this.x - reach + 26;
      return { x, y: this.y - 36, w: reach, h: this.h + 36 };
    }

    /** brood: abdomen swells → eggs dropped from the spinneret */
    atk_brood(dt, s) {
      const d = this.stateData;
      if (this.once('wind')) {
        if (this.onSurface()) this.face();
        const tl = this.tailWorld();
        d.w = this.telegraph(0.6, { sound: 'matron_brood', color: '#ff9a50', shake: 1.2, x: tl.x, y: tl.y });
        this.want(POSES.broodWind, 7);
      }
      if (s < d.w) { this.vx = 0; return; }
      if (this.once('lay')) {
        const n = Math.min(BROOD_CAP - this.liveMinions(), 2);
        const tl = this.tailWorld();
        const away = this.perchKind() === 'wall' ? -this.perch.wall.side : -this.facing;
        for (let i = 0; i < n; i++) {
          const m = this.summon('matron_brood', tl.x, tl.y + 10, { egg: true, evx: away * rnd(60, 200) + (i - (n - 1) / 2) * 90, evy: rnd(-260, -120) });
          if (m && G.fx) G.fx.burst('smoke', tl.x, tl.y, { count: 4, color: SMOKE, alpha: 0.45, size: 8 });
        }
        G.sfxAt('matron_lay', tl.x);
        this.want(pose({ swell: 0, crouch: 0.2, glow: 0.6 }), 6);
      }
      if (s > d.w + 0.7) this.endAttack();
    }

    /** ashfall (P2, floor): rears up → belly-slam: shockwaves + two waves of warned soot columns */
    atk_ashfall(dt, s) {
      const d = this.stateData;
      if (this.once('wind')) {
        this.face();
        d.w = this.telegraph(0.7, { sound: 'matron_rear', color: '#ffb060', shake: 2.4 });
        this.want(POSES.rearUp, 6);
      }
      if (s < d.w) { this.vx = 0; return; }
      if (this.once('slam')) {
        this.want(POSES.slam, 24);
        this.slamFx();
        const f = this.playerFeet();
        d.px = f.x;
        d.colsA = this.ashColumns(d.px, [0, -310, 310, -620, 620]);
      }
      if (s >= d.w + 0.95 && this.once('wave2')) {
        const xs = [];
        const a = d.colsA.slice().sort((p, q) => p - q);
        for (let i = 0; i + 1 < a.length; i++) if (a[i + 1] - a[i] > 200) xs.push((a[i] + a[i + 1]) / 2);
        if (a.length) { xs.push(a[0] - 155); xs.push(a[a.length - 1] + 155); }
        this.ashColumns(null, xs);
      }
      if (s > d.w + 0.35) this.want(pose({ crouch: 0.6, glow: 0.8 }), 4);
      if (s > d.w + 1.9) this.endAttack(0.5);
    }
    slamFx() {
      const a = this.anchorPt();
      if (G.game) { G.game.shake(12, 0.6); }
      G.sfxAt('matron_pound', this.cx);
      if (G.fx) {
        G.fx.burst('dust', a.x, a.y, { count: 24, color: '#5a4a42', speed: 340, spread: 1.4, angle: -Math.PI / 2 });
        G.fx.burst('ring', a.x, a.y - 10, { r: 160, color: '#ff9a50', width: 4, life: 0.35 });
        G.fx.burst('ember', a.x, a.y - 20, { count: 14, color: EMBER_HI, speed: 220 });
      }
      const sf = this.perch && this.perch.kind === 'surf' ? this.perch.s : this.A.floor;
      for (const dir of [-1, 1]) {
        G.spawnProjectile(this.room, 'wave', { x: a.x + dir * (BW / 2 + 12), y: sf.y, dir, speed: 380, owner: this, color: '#ff9a50', w: 30, h: 42 });
      }
      // the chimneys shed ash
      if (G.fx) for (let i = 0; i < 10; i++) G.fx.burst('ash', rnd(this.A.x0, this.A.x1), this.A.ceilY + 10, { count: 2, color: '#6a5a52' });
    }
    /** Warned columns of falling burning soot at x positions (relative to px if given). Returns the xs used. */
    ashColumns(px, xs) {
      const A = this.A, used = [];
      const W = 76;
      for (const ox of xs) {
        const x = clamp(px == null ? ox : px + ox, A.x0 + W / 2 + 4, A.x1 - W / 2 - 4);
        if (used.some((u) => Math.abs(u - x) < W + 40)) continue;
        used.push(x);
        // the column ends on the first solid tile below the vault (platforms do not stop it)
        let r = Math.floor((A.ceilY + 2) / TILE);
        const c = Math.floor(x / TILE);
        while (r < this.room.rows && !A.isSolid(c, r)) r++;
        const bottom = r * TILE;
        const room = this.room;
        room.add(new Mark({ x: x - W / 2, y: A.ceilY, w: W, h: bottom - A.ceilY, dur: 0.8, color: '#ff9a50', style: 'column', hold: true,
          onDone: () => {
            if (!room || (G.game && G.game.room !== room) || this.dying || this.dead) return null;
            return G.spawnProjectile(room, 'matron_ash', { x, y: A.ceilY + 16, vx: 0, vy: 950, owner: this });
          } }));
      }
      return used;
    }

    /** ignite (phase-2 transition): screech → climb to the vault → hang on a strand while the den flares → drop */
    atk_ignite(dt, s) {
      const d = this.stateData;
      const A = this.A;
      if (this.once('start')) {
        this.clearZones();
        G.clearProjectiles(this.room);
        this.want(POSES.rearUp, 8);
        G.sfxAt('matron_screech', this.cx, { vol: 1 });
        if (G.game) { G.game.shake(8, 0.6); G.game.flash('rgba(255,170,110,0.25)', 0.2); }
        d.phaseT = 0;
      }
      if (d.stage == null && s >= 0.75) {
        d.stage = 'climb';
        const x = clamp(A.strandX, A.x0 + 200, A.x1 - 200);
        this.want(POSES.air, 8);
        G.sfxAt('matron_leap', this.cx);
        this.strandTop = null;
        this.leap(x, A.ceilY + 60, { kind: 'strand' }, { H: 60, T: 0.75, onLand: () => { d.stage = 'hang'; d.hangT = this.stateTime; this.strandTop = A.ceilY; } });
      }
      if (d.stage === 'hang') {
        const h = s - d.hangT;
        const hangY = Math.max(A.ceilY + 160, A.floor.y - 11 * TILE);
        this.y = lerp(A.ceilY + 60, hangY, ease(h / 0.9)) - this.h / 2;
        this.want(POSES.hang, 6);
        if (h >= 0.5 && this.once('flare')) {
          this.ignited = true;
          G.sfxAt('matron_screech', this.cx, { vol: 0.9, pitch: 1.1 });
          if (G.game) { G.game.shake(10, 0.8); G.game.flash('rgba(255,140,80,0.3)', 0.25); }
          if (G.Audio && typeof G.Audio.musicLayer === 'function') G.Audio.musicLayer(1);
          if (G.fx) for (let i = 0; i < 18; i++) G.fx.burst('ember', rnd(A.x0, A.x1), rnd(A.ceilY, A.floor.y - 200), { count: 2, color: EMBER_HI, speed: 80 });
        }
        if (h >= 1.5 && this.once('mark')) {
          d.dropS = A.floor;
          const c = this.surfCenter(A.floor, this.cx);
          d.dropX = c.x;
          this.x = c.x - this.w / 2;
          const wv = this.telegraph(0.7, { sound: 'matron_hiss', color: TELE, shake: 2 });
          const fallT = Math.sqrt(2 * Math.max(10, A.floor.y - (this.y + this.h)) / GRAV);
          this.markLanding(A.floor, c.x, wv + fallT, null, true);
          d.dropAt = s + wv;
        }
        if (d.dropAt != null && s >= d.dropAt && this.once('drop')) {
          d.stage = 'drop';
          this.strandTop = null;
          this.want(POSES.air, 8);
          this.fall(() => {
            this.clearZones();
            this.want(POSES.slam, 20);
            this.slamFx();
            d.landT = this.stateTime;
            d.stage = 'land';
          }, d.dropS);
        }
      }
      if (d.stage === 'land' && s - d.landT > 0.8) { this.want(POSES.idle, 6); this.endAttack(0.5); return; }
      if (s > 9) { this.strandTop = null; if (!this.onSurface()) this.fall(); this.endAttack(0.3); }   // safety
    }

    // ------------------------------------------------------------------ phase, stagger, damage
    onPhase(phase) {
      if (phase >= 2) {
        this.pendingIgnite = true;
        // cut the current attack short (not a stagger: that runs out first, then she ignites)
        if (this.state !== 'stagger' && this.state !== 'intro' && this.state !== 'idle' && !this.dying) {
          this.clearZones();
          if (this.mv && this.mv.type === 'arc') this.fall();
          this.endAttack(0);
        }
      }
    }
    onInterrupt() { this.clearZones(); }
    onStagger() {
      this.clearZones();
      this.strandTop = null;
      if (this.mv || !this.perch || this.perch.kind !== 'surf') this.fall((p, vy) => { if (vy > 200) this.landFx(false); });
      this.want(POSES.stagger, 9);
      if (G.fx) G.fx.burst('ember', this.cx, this.cy, { count: 10, color: EMBER_HI, speed: 200 });
    }
    staggerUpdate(dt) {
      this.vx = 0;
      this.want(POSES.stagger, 9);
      if (G.fx && Math.random() < dt * 6) G.fx.burst('smoke', this.cx + rnd(-50, 50), this.cy, { count: 1, color: SMOKE, alpha: 0.4, size: 10 });
    }
    onStaggerEnd() { this.want(POSES.idle, 6); G.sfxAt('matron_skitter', this.cx, { vol: 0.8 }); }
    modifyDamage(dmg) { return this.state === 'stagger' ? Math.round(dmg * STAGGER_MULT) : dmg; }

    // ------------------------------------------------------------------ defeat: curls on her back, the last brood flies up the chimney
    onDefeatStart() {
      this.clearZones();
      // pending ash-column warnings go out with her: nothing may hurt the player after the killing blow
      if (this.room && Mark) for (const e of this.room.entities) if (!e.dead && e instanceof Mark) e.remove();
      this.introOn = false;
      this.releaseCinematic();
      this.strandTop = null;
      this.want(pose({ flip: this.pz.flip > 0.5 ? 1 : 0, curl: 0.4, crouch: 0.6, eyes: 1, glow: 0.8, twitch: 1 }), 6);
      if (G.Audio && typeof G.Audio.musicLayer === 'function') G.Audio.musicLayer(0);
    }
    onDefeatSequence(dt, s) {
      if (this.once('curl')) {
        G.sfxAt('matron_die', this.cx);
        this.want(pose({ flip: 1, curl: 0.9, crouch: 1, eyes: 0.8, glow: 0.6, twitch: 1 }), 5);
      }
      // the eyes go out one by one, the eggs cool
      const k = clamp(s / 2.2, 0, 1);
      this.pzT.eyes = 0.8 * (1 - k);
      this.pzT.glow = 0.6 * (1 - k) + 0.05;
      this.pzT.twitch = 1 - k;
      this.pzT.curl = 0.9 + 0.1 * k;
      if (G.fx && Math.random() < dt * 10 * (1 - k)) G.fx.burst('smoke', this.cx + rnd(-60, 60), this.cy + rnd(-20, 20), { count: 1, color: SMOKE, alpha: 0.45, size: 12, speed: 40 });
      if (s >= 1.6 && this.once('brood')) {
        // one last brood sprite crawls out of her and flutters up into the chimneys (her brood lives on)
        const tl = this.tailWorld();
        this.room.add(new LastBrood({ x: tl.x, y: tl.y, ceilY: this.A.ceilY }));
        G.sfxAt('brood_hatch', tl.x, { vol: 0.8 });
      }
      if (s >= 2.6 && this.once('end')) {
        if (G.fx) {
          G.fx.burst('smoke', this.cx, this.cy, { count: 20, color: SMOKE, alpha: 0.55, size: 18, speed: 140 });
          G.fx.burst('ember', this.cx, this.cy, { count: 18, color: EMBER_HI, speed: 200 });
          G.fx.burst('ash', this.cx, this.cy, { count: 16, color: '#8a7a70' });
        }
        if (G.game) { G.game.shake(10, 0.5); G.game.flash('rgba(255,200,160,0.35)', 0.2); }
        G.sfxAt('boss_die', this.cx, { vol: 0.8 });
        this.recordHusk();
        this.finishDefeat();
      }
      if (s >= 3.4) { this._husked = true; this.remove(); }
    }
    /** Where her body should come to rest if where she is would put her husk somewhere awkward (null = fine). */
    deathSpot() {
      const A = this.A, fl = A.floor;
      let s = null;
      if (!this.mv && this.perch && this.perch.kind === 'surf') s = this.perch.s;
      else if (!this.perch || this.perch.kind !== 'wall') s = surfaceBelow(A, this.cx, this.y + this.h - 4, 10) || fl;
      const doorX = fl.x1 - HUSK_DOOR;
      const bad = !s || s.x1 - s.x0 < 200 || (s.floor && this.cx > doorX);
      if (!bad) return null;
      const c = this.surfCenter(fl, clamp(this.cx, fl.x0 + 140, doorX));
      return { s: fl, x: c.x, y: c.y };
    }
    recordHusk() {
      if (G.game && typeof G.game.setFlag === 'function') {
        const a = this.anchorPt();
        G.game.setFlag('matron_rest_x', Math.round(a.x));
        G.game.setFlag('matron_rest_y', Math.round(a.y));
        G.game.setFlag('matron_rest_f', this.sx >= 0 ? 1 : -1);
      }
    }

    // ------------------------------------------------------------------ drawing
    drawBounds() { return { x: this.cx - 220, y: this.cy - 220, w: 440, h: 440 }; }
    drawBody(ctx, t) {
      // the soot strand
      if (this.strandTop != null && this.perch && this.perch.kind === 'strand' || (this.strandTop != null && this.introOn)) {
        const tl = this.tailWorld();
        const mx = tl.x + Math.sin(t * 1.3) * 4, my = (this.strandTop + tl.y) / 2;
        ctx.strokeStyle = 'rgba(12,9,8,0.95)'; ctx.lineWidth = 4.5;
        ctx.beginPath(); ctx.moveTo(tl.x, this.strandTop); ctx.quadraticCurveTo(mx, my, tl.x, tl.y); ctx.stroke();
        ctx.strokeStyle = 'rgba(150,120,105,0.75)'; ctx.lineWidth = 1.6;
        ctx.beginPath(); ctx.moveTo(tl.x + 0.5, this.strandTop); ctx.quadraticCurveTo(mx + 0.5, my, tl.x + 0.5, tl.y); ctx.stroke();
      }
      const a = this.anchorPt();
      const ch = C();
      if (this.perch && this.perch.kind === 'surf' && !this.mv && ch) ch.shadow(ctx, a.x, a.y, BW * 0.55, 0.5);
      ctx.save();
      ctx.translate(a.x, a.y);
      ctx.rotate(this.rot);
      ctx.scale(this.sx, 1);
      const fl = this.pz.flip;
      if (fl > 0.001 && fl < 0.999) {
        // rolling over: a hop and a twist while the body turns edge-on
        const k = Math.sin(Math.PI * fl);
        ctx.translate(0, -46 * k);
        ctx.rotate(0.32 * k);
      }
      drawMatron(ctx, this.pz, { t, gait: this.gait, tele: this.teleK, phase2: this.ignited, mouthGlow: this.mouthGlow });
      ctx.restore();
    }
    drawCorpse(ctx, t) { this.drawBody(ctx, t); }
    drawDeath(ctx, t) { if (!this._husked) this.drawBody(ctx, t); }
  }
  G.Boss.register('matron', Matron);

  // ---------------------------------------------------------------------------------------------------------
  // The last brood sprite (defeat flourish): crawls out, flutters up and away into a chimney throat.
  // ---------------------------------------------------------------------------------------------------------
  class LastBrood extends G.Entity {
    constructor(p) {
      super({ type: 'matron_lastbrood' });
      this.type = 'matron_lastbrood';
      this.x = p.x - 10; this.y = p.y - 10; this.w = 20; this.h = 20; this._placed = true;
      this.ceilY = p.ceilY; this.age = 0; this.z = 4; this.cull = false;
      this.vx = rnd(-30, 30); this.vy = -40;
    }
    update(dt) {
      this.age += dt;
      const up = this.age > 0.5;
      this.vy = up ? Math.max(this.vy - 500 * dt, -190) : this.vy;
      this.vx = Math.sin(this.age * 5) * 70;
      this.x += this.vx * dt; this.y += this.vy * dt;
      if (G.lighting) G.lighting.add({ x: this.cx, y: this.cy, r: 70, color: '#ffb060', intensity: 0.4, flicker: true });
      if (this.y < this.ceilY - 80 || this.age > 6) this.remove();
    }
    draw(ctx, t) { drawSprite(ctx, this.cx, this.cy, t + 3, 1, Math.min(1, this.age * 3), 0); }
  }
  G.registerEntity('matron_lastbrood', LastBrood);

  // ---------------------------------------------------------------------------------------------------------
  // Brood: eggs that hatch into soot sprites (her minions; no drops)
  // ---------------------------------------------------------------------------------------------------------
  function drawSprite(ctx, x, y, t, f, a, tele) {
    const pa = ctx.globalAlpha;
    ctx.globalAlpha = pa * a;
    const flap = Math.sin(t * 26);
    // wings (moth-like soot flaps)
    ctx.fillStyle = 'rgba(40,30,28,0.85)';
    for (const s of [-1, 1]) {
      ctx.beginPath();
      ctx.moveTo(x + s * 4, y - 3);
      ctx.quadraticCurveTo(x + s * 18, y - 14 - flap * 6, x + s * 20, y - 2 + flap * 4);
      ctx.quadraticCurveTo(x + s * 12, y + 2, x + s * 4, y + 2);
      ctx.fill();
    }
    // fuzzy soot ball
    ctx.fillStyle = OUTL;
    ctx.beginPath();
    for (let i = 0; i <= 14; i++) {
      const an = i / 14 * TAU, r = 11 + (i % 2 ? 2.4 : 0) + Math.sin(t * 9 + i) * 0.8;
      const px = x + Math.cos(an) * r, py = y + Math.sin(an) * r;
      if (i === 0) ctx.moveTo(px, py); else ctx.lineTo(px, py);
    }
    ctx.fill();
    ctx.fillStyle = SOOT_MID; ctx.beginPath(); ctx.arc(x, y, 9.5, 0, TAU); ctx.fill();
    ctx.globalCompositeOperation = 'lighter';
    glow(ctx, x, y + 2, 20 + tele * 12, EMBER, 0.55 + tele * 0.4);
    ctx.globalCompositeOperation = 'source-over';
    // ember eyes
    ctx.fillStyle = tele > 0.05 ? EMBER_WH : EMBER_HI;
    for (const s of [-1, 1]) { ctx.beginPath(); ctx.arc(x + f * 3 + s * 3.4, y - 1, 2.1, 0, TAU); ctx.fill(); }
    ctx.globalAlpha = pa;
  }
  function drawEgg(ctx, x, feetY, t, wob, heat) {
    const w = 13, h = 17;
    const ang = Math.sin(t * (10 + 20 * wob)) * 0.25 * wob;
    ctx.save();
    ctx.translate(x, feetY);
    ctx.rotate(ang);
    ctx.fillStyle = OUTL;
    ctx.beginPath(); ctx.ellipse(0, -h, w + 2, h + 2, 0, 0, TAU); ctx.fill();
    const g = ctx.createRadialGradient(-2, -h - 4, 1, 0, -h, h);
    g.addColorStop(0, '#5a2a1a'); g.addColorStop(0.6, '#24160f'); g.addColorStop(1, '#100b0a');
    ctx.fillStyle = g; ctx.beginPath(); ctx.ellipse(0, -h, w, h, 0, 0, TAU); ctx.fill();
    ctx.strokeStyle = 'rgba(255,140,60,' + (0.45 + 0.5 * heat).toFixed(3) + ')'; ctx.lineWidth = 1.6;
    ctx.beginPath(); ctx.moveTo(-6, -h - 6); ctx.lineTo(-1, -h - 1); ctx.lineTo(-4, -h + 5); ctx.moveTo(3, -h - 9); ctx.lineTo(6, -h - 2); ctx.stroke();
    ctx.globalCompositeOperation = 'lighter';
    glow(ctx, 0, -h, 26, EMBER, 0.35 + 0.45 * heat);
    glow(ctx, 0, -h, 10, EMBER_HI, 0.3 + 0.4 * heat);
    ctx.restore();
  }
  // A sprite only starts a dart while its mother is between attacks (or repositioning / laying / staggered) and none of
  // her soot is in the air or warned: a dart never stacks on a pounce landing, a soot spread, a stab or an ashfall.
  const CALM_STATES = { idle: 1, skitter: 1, brood: 1, stagger: 1 };
  function motherCalm(rm) {
    if (!rm) return true;
    for (const e of rm.entities) {
      if (e.dead) continue;
      if (e.type === 'boss_matron' && !e.dying && !CALM_STATES[e.state]) return false;
      if (e.type === 'telegraph' && Mark && e instanceof Mark) return false;
      if (e.type === 'projectile' && (e.kind === 'matron_soot' || e.kind === 'matron_ash' || (e.kind === 'wave' && e.owner && e.owner.type === 'boss_matron'))) return false;
    }
    return true;
  }
  class Brood extends G.Enemy {
    constructor(props) {
      super(props, {
        hp: 5, w: 26, h: 26, flying: true, weight: 0.5, contactDamage: 1, contactInset: 4, cinders: 0,
        sight: 1400, meltTime: 0.35, puddleTime: 1.2, z: -1, minTelegraph: 0.35,
        colors: { body: '#241b1a', dark: '#0b0808', hit: '#ffd9b0', puddle: '#1a1213', smoke: SMOKE, tele: '#ffcf8a' },
        light: { r: 60, color: '#ff8a40', intensity: 0.35, flicker: true },
      });
      this.egg = !!this.props.egg;
      this.side = Math.random() < 0.5 ? -1 : 1;
    }
    init() {
      super.init();
      if (this.egg) {
        this.setState('egg');
        this.vx = +this.props.evx || 0; this.vy = +this.props.evy || 0;
        this.contactDamage = 0;
        this.w = 22; this.h = 30; this.x = this.x + 2; this.y = this.y - 4;
      } else this.setState('drift');
    }
    think(dt) {
      const p = this.player;
      switch (this.state) {
        case 'egg': {
          this.contactDamage = 0;
          this.vy = Math.min(this.vy + 1500 * dt, 900);
          if (this.grounded) { this.vx *= Math.pow(0.02, dt); if (Math.abs(this.vx) < 5) this.vx = 0; }
          if (this.stateTime >= 1.1) this.hatch();
          break;
        }
        case 'drift': {
          this.contactDamage = 1;
          if (!this.targetable(p)) { this.hover(this.home.x, this.home.y, dt); break; }
          const tx = p.x + p.w / 2 + this.side * 110, ty = p.y - 70 + Math.sin(this.t * 2 + this.seed) * 20;
          this.flyTo(tx, ty, 125, dt, { accel: 420, arrive: 50 });
          // keep clear of the player's body while drifting (only the telegraphed dart is meant to touch)
          const rx = this.cx - (p.x + p.w / 2), ry = this.cy - (p.y + p.h / 2), rd = Math.hypot(rx, ry) || 1;
          if (rd < 90) { const k = (90 - rd) / 90 * 900 * dt; this.vx += rx / rd * k; this.vy += ry / rd * k - k * 0.3; }
          this.face(p);
          // one dart at a time across the whole brood (each one readable on its own)
          const rm = this.room, now = G.game ? G.game.t || 0 : 0;
          const busy = rm && rm.entities.some((e) => e !== this && e.kind === 'matron_brood' && !e.dead && !e.dying && (e.state === 'aim' || e.state === 'dart'));
          const calm = (!rm || rm._broodDartEnd == null || now - rm._broodDartEnd > 0.7) && motherCalm(rm);
          if (this.stateTime > (this.stateData.wait || (this.stateData.wait = rnd(1.5, 2.4))) && !busy && calm && this.canSee(p, 700)) this.setState('aim');
          if (this.t > 14 && !busy) this.setState('leave');
          break;
        }
        case 'aim': {
          this.vx *= Math.pow(0.01, dt); this.vy *= Math.pow(0.01, dt);
          if (this.once('t')) this.stateData.w = this.telegraph(0.45, { sound: 'brood_chirp', color: '#ffcf8a', shake: 1.2 });
          if (this.stateTime >= this.stateData.w) {
            const a = this.targetable(p) ? this.aimAt(p, 430, { x: this.cx, y: this.cy }) : { vx: this.facing * 430, vy: 0 };
            // the dart flies to where the player was (+50 px), no further
            const dist = this.targetable(p) ? Math.hypot(p.x + p.w / 2 - this.cx, p.y + p.h / 2 - this.cy) : 200;
            this.setState('dart', { vx: a.vx, vy: a.vy, dur: Math.min(0.5, (dist + 50) / 430) });
          }
          break;
        }
        case 'dart': {
          this.vx = this.stateData.vx; this.vy = this.stateData.vy;
          if (G.fx && Math.random() < dt * 30) G.fx.burst('smoke', this.cx, this.cy, { count: 1, color: SMOKE, alpha: 0.35, size: 6 });
          if (this.stateTime > (this.stateData.dur || 0.5) || this.wallHit || this.ceilHit || this.grounded) {
            this.side = -this.side;
            if (this.room) this.room._broodDartEnd = G.game ? G.game.t || 0 : 0;
            this.setState('recover', { dir: this.vx >= 0 ? 1 : -1 });
          }
          break;
        }
        case 'recover': {
          // pull up and away after a dart (never lingers on the player)
          const away = this.targetable(p) ? (this.cx >= p.x + p.w / 2 ? 1 : -1) : this.stateData.dir;
          if (this.once('turn')) { this.vx = away * 120; this.vy = -180; }
          this.vx = damp(this.vx, away * 140, 6, dt);
          this.vy = damp(this.vy, -200, 6, dt);
          if (this.stateTime > 0.6) this.setState('drift');
          break;
        }
        case 'leave':
          // after a while a sprite flutters back up into the flues (it has chimneys to sweep)
          this.contactDamage = 0;
          this.vx = damp(this.vx, Math.sin(this.t * 4) * 60, 4, dt);
          this.vy = damp(this.vy, -220, 3, dt);
          if (this.y + this.h < 0 || this.stateTime > 5 || this.ceilHit) this.remove();
          break;
        default: this.setState('drift');
      }
    }
    hatch() {
      this.egg = false;
      const cx = this.cx, by = this.y + this.h;
      this.w = 26; this.h = 26; this.x = cx - 13; this.y = by - 34;
      this.vx = 0; this.vy = -120;
      this.contactDamage = 1;
      this.contactGrace = this.overlapsPlayer ? this.overlapsPlayer(0) : false;
      if (G.fx) { G.fx.burst('shard', cx, by - 12, { count: 6, color: '#3a2218', speed: 160 }); G.fx.burst('ember', cx, by - 14, { count: 5, color: EMBER_HI }); }
      G.sfxAt('brood_hatch', cx);
      this.setState('drift');
    }
    drawBounds() { return { x: this.x - 30, y: this.y - 30, w: this.w + 60, h: this.h + 60 }; }
    drawBody(ctx, t) {
      if (this.is('egg')) { drawEgg(ctx, this.cx, this.y + this.h, t, clamp((this.stateTime - 0.5) / 0.6, 0, 1), clamp(this.stateTime / 1.1, 0, 1)); return; }
      const tk = this.telegraphing ? Math.min(1, this.tele.t / this.tele.dur) : 0;
      ctx.save(); ctx.translate(this.cx, this.cy); ctx.scale(1.3, 1.3);
      drawSprite(ctx, 0, 0, t + this.seed, this.facing, this.is('leave') ? Math.max(0.3, 1 - this.stateTime * 0.5) : 1, tk);
      ctx.restore();
    }
  }
  G.registerEnemy('matron_brood', Brood);

  // ---------------------------------------------------------------------------------------------------------
  // Projectiles: soot balls (lobbed, landing shadow) and falling clumps of burning soot (ashfall)
  // ---------------------------------------------------------------------------------------------------------
  function groundBelow(room, x, y) {
    if (!room) return null;
    const c = Math.floor(x / TILE);
    for (let r = Math.max(0, Math.floor(y / TILE) + 1), n = 0; r < room.rows && n < 26; r++, n++) {
      const tl = room.tileAt(c, r);
      if (G.Physics.isSolidTile(tl) || tl === G.T.PLATFORM) return r * TILE;
    }
    return null;
  }
  class Soot extends G.Projectile {
    // soot balls aimed at a one-way platform splat on it (others fly past the thin planks)
    hitsTerrain() {
      if (super.hitsTerrain()) return true;
      const ly = this.props.landY;
      if (this.vy <= 0 || !this.room || ly == null) return false;
      const b = this.hitBox(), bot = b.y + b.h, r = Math.floor(bot / TILE);
      return Math.abs(r * TILE - ly) < 8 && this.room.tileAt(Math.floor(this.cx / TILE), r) === G.T.PLATFORM && bot - r * TILE < 16;
    }
    draw(ctx, t) {
      const ly = this.props.landY, lx = this.props.landX;
      // where it will land: a smouldering ring on the floor from the moment it is spat
      if (ly != null && lx != null && ly > this.cy) {
        const k = clamp(this.age / 0.9, 0, 1), pulse = 0.5 + 0.5 * Math.sin(this.age * 18);
        ctx.save(); ctx.globalCompositeOperation = 'lighter';
        glow(ctx, lx, ly - 3, 20 + 8 * k, EMBER, 0.3 + 0.3 * k);
        ctx.strokeStyle = 'rgba(255,170,100,' + (0.5 + 0.4 * pulse * k).toFixed(3) + ')'; ctx.lineWidth = 2.5;
        ctx.beginPath(); ctx.ellipse(lx, ly - 2, 20 - 6 * k, 5 - 1.5 * k, 0, 0, TAU); ctx.stroke();
        ctx.restore();
      }
      const gy = ly != null && ly > this.cy ? ly : groundBelow(this.room, this.cx, this.cy);
      if (gy != null) {
        const k = clamp(1 - (gy - this.cy) / 420, 0.15, 1);
        const ch = C();
        if (ch) ch.shadow(ctx, this.cx, gy, 10 + 10 * k, 0.35 + 0.35 * k);
        ctx.save(); ctx.globalCompositeOperation = 'lighter';
        glow(ctx, this.cx, gy - 2, 14 + 10 * k, EMBER, 0.18 + 0.3 * k);
        ctx.restore();
      }
      const tr = this.trail, spr = G.Art && G.Art.dotSprite ? G.Art.dotSprite(SMOKE) : null;
      if (spr) for (let i = 0; i < tr.length; i += 2) { const k = i / tr.length, r = 4 + 8 * k; ctx.globalAlpha = 0.25 + 0.35 * k; ctx.drawImage(spr, tr[i] - r, tr[i + 1] - r, r * 2, r * 2); }
      ctx.globalAlpha = 1;
      ctx.save(); ctx.globalCompositeOperation = 'lighter';
      glow(ctx, this.cx, this.cy, this.r * 2.8, EMBER, 0.5);
      ctx.restore();
      ctx.fillStyle = OUTL;
      ctx.beginPath();
      for (let i = 0; i <= 10; i++) { const a = i / 10 * TAU + t * 6, r = this.r + (i % 2 ? 2.5 : 0); const x = this.cx + Math.cos(a) * r, y = this.cy + Math.sin(a) * r; if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y); }
      ctx.fill();
      ctx.fillStyle = '#2a1812'; ctx.beginPath(); ctx.arc(this.cx, this.cy, this.r - 2, 0, TAU); ctx.fill();
      ctx.fillStyle = EMBER; ctx.beginPath(); ctx.arc(this.cx + 1, this.cy + 1, this.r * 0.42, 0, TAU); ctx.fill();
      ctx.fillStyle = EMBER_WH; ctx.beginPath(); ctx.arc(this.cx + 1.5, this.cy, this.r * 0.18, 0, TAU); ctx.fill();
    }
    burstFx(why) {
      if (!G.fx) return;
      if (why === 'clear' || why === 'expire') { G.fx.burst('smoke', this.cx, this.cy, { count: 4, color: SMOKE, alpha: 0.4, size: 10 }); return; }
      G.fx.burst('smoke', this.cx, this.cy, { count: 7, color: SMOKE, alpha: 0.55, size: 13, speed: 110 });
      G.fx.burst('ember', this.cx, this.cy, { count: 5, color: EMBER_HI, speed: 160 });
      G.fx.burst('dust', this.cx, this.cy + 6, { count: 5, color: '#3a2e2a', speed: 120 });
      G.sfxAt('matron_lay', this.cx, { vol: 0.5, pitch: 0.7 });
    }
  }
  G.registerProjectile('matron_soot', Soot, { r: 11, gravity: 1800, life: 4, color: '#ff8a40', damage: 1 });

  class Ash extends G.Projectile {
    draw(ctx, t) {
      const tr = this.trail;
      ctx.save(); ctx.globalCompositeOperation = 'lighter';
      for (let i = 0; i < tr.length; i += 2) { const k = i / tr.length; glow(ctx, tr[i], tr[i + 1], 6 + 8 * k, EMBER, 0.1 + 0.2 * k); }
      glow(ctx, this.cx, this.cy, this.r * 2.6, EMBER, 0.45);
      ctx.restore();
      ctx.save(); ctx.translate(this.cx, this.cy); ctx.rotate(this.seed + t * 3);
      ctx.fillStyle = OUTL;
      ctx.beginPath(); ctx.moveTo(-15, -6); ctx.lineTo(-6, -15); ctx.lineTo(10, -12); ctx.lineTo(15, 2); ctx.lineTo(6, 14); ctx.lineTo(-11, 11); ctx.closePath(); ctx.fill();
      ctx.fillStyle = '#2b1a14';
      ctx.beginPath(); ctx.moveTo(-12, -5); ctx.lineTo(-5, -12); ctx.lineTo(8, -10); ctx.lineTo(12, 1); ctx.lineTo(5, 11); ctx.lineTo(-9, 9); ctx.closePath(); ctx.fill();
      ctx.strokeStyle = EMBER_HI; ctx.lineWidth = 2;
      ctx.beginPath(); ctx.moveTo(-8, -2); ctx.lineTo(0, 2); ctx.lineTo(6, -4); ctx.moveTo(0, 2); ctx.lineTo(2, 9); ctx.stroke();
      ctx.restore();
    }
    burstFx(why) {
      if (!G.fx) return;
      G.fx.burst('dust', this.cx, this.cy + 8, { count: 10, color: '#4a3c34', speed: 200 });
      G.fx.burst('ember', this.cx, this.cy, { count: 8, color: EMBER_HI, speed: 220 });
      G.fx.burst('smoke', this.cx, this.cy, { count: 4, color: SMOKE, alpha: 0.5, size: 12 });
      if (why === 'terrain' || why === 'player') G.sfxAt('matron_ashland', this.cx);
    }
  }
  G.registerProjectile('matron_ash', Ash, { r: 13, gravity: 1500, life: 3, color: '#ff8a40', damage: 1 });

  // ---------------------------------------------------------------------------------------------------------
  // Room event 'matron_nest': egg-sacs crusting the den's walls + the nest; her curled husk after the defeat.
  // props: sacs: [[col, row, face 'l'|'r'|'u', count], ...] (face = side the wall/vault is on)
  // ---------------------------------------------------------------------------------------------------------
  function nestState(e) {
    const room = e.room;
    const boss = room ? room.entities.find((x) => x.type === 'boss_matron' && !x.dead) : null;
    const done = !!(G.game && G.game.bossDefeated && G.game.bossDefeated('matron'));
    return { boss, done, ignited: !!(boss && boss.ignited && !boss.dying) };
  }
  function drawSacCluster(ctx, x, y, face, n, t, heat, seed) {
    // along the surface: tangent; out of the surface: normal
    const nx = face === 'l' ? 1 : face === 'r' ? -1 : 0, ny = face === 'u' ? 1 : 0;
    const tx = ny ? 1 : 0, ty = ny ? 0 : 1;
    const sacs = [];
    for (let i = 0; i < n; i++) {
      const s = Math.sin(seed * 12.9898 + i * 78.233) * 43758.5453, f = s - Math.floor(s);
      const along = (i - (n - 1) / 2) * 17 + (f - 0.5) * 8;
      const out = 9 + f * 9;
      sacs.push({ x: x + tx * along + nx * out, y: y + ty * along + ny * out, r: 8 + f * 5, f });
    }
    // soot webbing to the wall
    ctx.strokeStyle = 'rgba(30,24,22,0.8)'; ctx.lineWidth = 1.4;
    ctx.beginPath();
    for (const s of sacs) { ctx.moveTo(s.x, s.y); ctx.lineTo(s.x - nx * 16 + tx * 8, s.y - ny * 16 + ty * 8); ctx.moveTo(s.x, s.y); ctx.lineTo(s.x - nx * 16 - tx * 8, s.y - ny * 16 - ty * 8); }
    ctx.stroke();
    for (const s of sacs) {
      ctx.fillStyle = OUTL; ctx.beginPath(); ctx.ellipse(s.x, s.y, s.r + 1.8, s.r * 1.25 + 1.8, ny ? 0 : Math.PI / 2, 0, TAU); ctx.fill();
      ctx.fillStyle = '#24140e'; ctx.beginPath(); ctx.ellipse(s.x, s.y, s.r, s.r * 1.25, ny ? 0 : Math.PI / 2, 0, TAU); ctx.fill();
      ctx.fillStyle = 'rgba(255,130,60,' + Math.min(0.9, 0.75 * heat).toFixed(3) + ')'; ctx.beginPath(); ctx.ellipse(s.x, s.y, s.r * 0.55, s.r * 0.7, ny ? 0 : Math.PI / 2, 0, TAU); ctx.fill();
    }
    ctx.save(); ctx.globalCompositeOperation = 'lighter';
    for (const s of sacs) {
      const pulse = 0.65 + 0.35 * Math.sin(t * (1.6 + heat * 3) + s.f * 9);
      glow(ctx, s.x, s.y, s.r * 2.6, EMBER, 0.5 * heat * pulse);
      glow(ctx, s.x, s.y, s.r * 1.0, EMBER_HI, 0.6 * heat * pulse);
    }
    ctx.restore();
  }
  G.Events.matron_nest = {
    init(e) { e.data.sacs = Array.isArray(e.props.sacs) ? e.props.sacs : []; e.data.heat = 0.55; },
    update(e, dt) {
      const st = nestState(e);
      const want = st.ignited ? 1.15 : st.done ? 0.35 : 0.55;
      e.data.heat = damp(e.data.heat, want, 1.5, dt);
      if (!G.lighting) return;
      for (const s of e.data.sacs) {
        const p = sacPos(s);
        G.lighting.add({ x: p.x, y: p.y, r: 80 + 16 * s[3], color: '#ff6a2a', intensity: Math.min(0.9, 0.85 * e.data.heat), flicker: true });
      }
      G.lighting.add({ x: e.cx, y: e.y + e.h - 20, r: 150, color: '#ff7a3a', intensity: 0.25 * e.data.heat, flicker: true });
    },
    draw(e, ctx, t) {
      const cam = G.camera;
      const heat = e.data.heat;
      for (let i = 0; i < e.data.sacs.length; i++) {
        const s = e.data.sacs[i], p = sacPos(s);
        if (cam && cam.visible && !cam.visible(p.x - 60, p.y - 60, 120, 120, 40)) continue;
        drawSacCluster(ctx, p.x, p.y, s[2], s[3], t, heat, i + 1);
      }
      // the nest: a low ring of soot, charred wicks and egg-shell shards on the floor
      const fx = e.cx, fy = e.y + e.h;
      ctx.fillStyle = '#0d0a09';
      ctx.beginPath(); ctx.moveTo(fx - 120, fy); ctx.quadraticCurveTo(fx - 100, fy - 20, fx - 60, fy - 16); ctx.quadraticCurveTo(fx, fy - 8, fx + 60, fy - 17); ctx.quadraticCurveTo(fx + 104, fy - 20, fx + 122, fy); ctx.closePath(); ctx.fill();
      ctx.strokeStyle = '#2a201c'; ctx.lineWidth = 2;
      ctx.beginPath();
      for (let i = 0; i < 9; i++) { const x = fx - 100 + i * 25; ctx.moveTo(x, fy - 6 - (i % 3) * 3); ctx.lineTo(x + 18 - (i % 2) * 30, fy - 14 + (i % 2) * 4); }
      ctx.stroke();
      ctx.save(); ctx.globalCompositeOperation = 'lighter';
      for (let i = 0; i < 5; i++) glow(ctx, fx - 80 + i * 40, fy - 8, 14, EMBER, 0.18 * heat * (0.6 + 0.4 * Math.sin(t * 2 + i * 2)));
      ctx.restore();
      ctx.fillStyle = '#3a2218';
      for (let i = 0; i < 6; i++) { const x = fx - 70 + i * 27, y = fy - 10 - (i % 2) * 4; ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x + 7, y - 5); ctx.lineTo(x + 9, y + 2); ctx.closePath(); ctx.fill(); }
      // her husk, curled on its back, after the defeat
      const st = nestState(e);
      if (st.done && !st.boss) {
        const hx = G.game.getFlag('matron_rest_x'), hy = G.game.getFlag('matron_rest_y'), hf = G.game.getFlag('matron_rest_f');
        const x = typeof hx === 'number' ? hx : fx, y = typeof hy === 'number' ? hy : fy;
        const ch = C();
        if (ch) ch.shadow(ctx, x, y, BW * 0.5, 0.5);
        ctx.save(); ctx.translate(x, y); ctx.scale(hf === -1 ? -1 : 1, 1);
        drawMatron(ctx, POSES.dead, { t: 0, gait: { ph: 0, amt: 0, t: 0 } });
        ctx.restore();
      }
    },
  };
  function sacPos(s) {
    const c = +s[0], r = +s[1], f = s[2];
    if (f === 'l') return { x: c * TILE, y: (r + 0.5) * TILE };
    if (f === 'r') return { x: (c + 1) * TILE, y: (r + 0.5) * TILE };
    return { x: (c + 0.5) * TILE, y: r * TILE };
  }

  G.Matron = { POSES, pose, drawMatron, buildArena, surfaceBelow, BROOD_CAP, STAGGER, STAGGER_MULT, HP, BW, BH, Matron, Brood };
})();
