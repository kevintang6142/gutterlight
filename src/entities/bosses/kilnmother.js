// src/entities/bosses/kilnmother.js — THE KILN MOTHER, Warden of the Forge (arena ch_09 "The Kiln Heart").
// A colossal furnace-bodied waxen rooted at her forge: an iron kiln for a body, a molten core behind a chest grate,
// a mantle of poured tallow, ladles for hands. She pours molten waves along the floor, lobs slag, heats floor
// sections, sweeps and slams her ladle, pours wickless moldlings from the vents and — once her grate bursts open in
// phase 2 — breathes the core's fire. Registers boss 'kilnmother' (entity boss_kilnmother), the minion kind
// 'kiln_moldling', projectiles 'kiln_wave' / 'kiln_slag', the floor hazard entity 'kiln_heat', the room script
// 'kiln_forge' (backdrop, vents, her dormant figure before the fight and her cold husk after it) and her sfx.
// Test hooks: G.KilnMother. API notes: docs/api/boss-kilnmother.md.
(function () {
  'use strict';
  const G = globalThis.G;
  if (!G || !G.Boss || !G.Enemy) return;

  const TILE = G.CONST.TILE;
  const TAU = Math.PI * 2;
  const U = G.U;
  const clamp = U.clamp, lerp = U.lerp;
  const rnd = (a, b) => a + Math.random() * (b - a);
  const damp = (a, b, k, dt) => a + (b - a) * (1 - Math.exp(-k * dt));
  const overlap = (a, b) => a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y;
  const sfx = (name, x, o) => { if (G.sfxAt) G.sfxAt(name, x, o); };
  const glow = (ctx, x, y, r, c, a) => { if (G.fx && G.fx.glowAt) G.fx.glowAt(ctx, x, y, r, c, a); };
  const burst = (k, x, y, o) => { if (G.fx) G.fx.burst(k, x, y, o); };

  // ---------------------------------------------------------------------------------------------------------
  // Numbers
  // ---------------------------------------------------------------------------------------------------------
  const BODY_W = 220, BODY_H = 300;
  const DECK_GAP = 40;          // px between the east deck's end and her front (ch_09: front at x 2040)
  const CORE_MULT = 1.5;        // damage on the open core (phase 2) or while she is slumped (stagger)
  const MOLD_CAP = 3;
  const SWEEP_REACH = 270, SWEEP_H = 84;
  const SLAM_REACH = 262, SLAM_NEAR = 40;   // the ladle lands 200-260 px out; hugging her front (< 40 px) is under her arm
  const SLAM_LOW = 122;                     // the slam's hitbox stops this far above her feet (deck underside: 120)
  const SWEEP_GAP = 1.0, POUR_GAP = 0.95;    // P2 follow-ups: time to land and jump again (QA: sweep 0.85 -> 1.0)
  const SWEEP_TELE2 = 0.55;     // P2 return sweep's own wind-up
  const WAVE_RISE = 0.1;        // a new molten wave is harmless while it rises
  const BREATH_REACH = 460, BREATH_HALF = 40;
  const CORE_LY = -172;         // core centre height above her feet (local)
  const HEAT_W = 160;           // heated floor section width
  const HEAT_WARN2 = 1.25;      // P2 second set: warning (flares 0.88 s after the first set burns out)
  const HEAT_FLARE_H = 104;     // flare height (stays below the decks' underside: floor 600, deck bottom 480)

  const COL = {
    outline: '#120a07',
    iron: '#2e231e', ironMid: '#4a372d', ironHi: '#9a7660', rust: '#743a1a',
    wax: '#e6c393', waxShade: '#a2764e', waxDark: '#5e3e28', waxHi: '#fff1d6',
    molten: '#ff8a20', moltenHot: '#ffd27a', white: '#fff7dc', ember: '#ffb347',
    coreRed: '#ff5a14', smoke: '#5a4a44', cold: '#8d8780', coldWax: '#bdb3a4',
  };

  // ---------------------------------------------------------------------------------------------------------
  // Poses (local frame: forward = +x, up = -y, feet at 0). Arm angles: 0 = hanging straight down, + = rotating
  // forward/up (π/2 = pointing forward, π = straight up), negative = swinging back. a2 = elbow (added to a1).
  // fl = ladle handle angle relative to the forearm, ft = bowl tilt (0 upright, + tipped forward = pouring).
  // ---------------------------------------------------------------------------------------------------------
  const BASE = { lean: 0.04, crouch: 0, head: 0.08, rear: 0,
    fa1: 0.3, fa2: 0.55, fl: 0.25, ft: 0.1, ba1: -0.3, ba2: 0.45, bl: 0.2, bt: 0.1,
    pour: 0, core: 0.45, mouth: 0.4, eyes: 1, flame: 1, clutch: 0 };
  const P = (o) => Object.assign({}, BASE, o);
  const POSES = {
    idle: P({}),
    dormant: P({ lean: 0.2, head: 0.55, fa1: 0.95, fa2: 0.3, fl: 0.05, ft: 1.25, pour: 1, eyes: 0, core: 0.35, flame: 0.75 }),
    wake: P({ lean: 0.02, head: -0.18, fa1: 0.75, fa2: 0.35, ft: 0.5, eyes: 1, core: 0.7 }),
    roar: P({ lean: -0.16, head: -0.45, crouch: 0.05, fa1: 1.75, fa2: 0.2, fl: 0.1, ft: 0.2, ba1: -1.5, ba2: 0.2, core: 1, mouth: 1 }),
    pourRaise: P({ lean: -0.06, head: -0.1, crouch: 0.08, fa1: 2.2, fa2: -0.15, fl: -0.5, ft: -0.4, core: 0.7 }),
    pourTip: P({ lean: 0.12, head: 0.12, fa1: 1.95, fa2: -0.1, fl: -0.4, ft: 1.7, pour: 1, core: 0.55 }),
    scoop: P({ lean: 0.26, crouch: 0.22, head: 0.3, fa1: -0.15, fa2: 2.15, fl: 0.6, ft: -0.2, core: 1, mouth: 0.8 }),
    fling: P({ lean: -0.12, head: -0.2, fa1: 1.6, fa2: 0.7, fl: 0.6, ft: 1.4, core: 0.6 }),
    sweepBack: P({ lean: -0.06, crouch: 0.2, head: 0.05, fa1: -1.05, fa2: 0.35, fl: 0.45, ft: 0.4, ba1: 0.35, core: 0.6 }),
    sweepThru: P({ lean: 0.35, crouch: 0.45, head: 0.2, fa1: 0.5, fa2: 0.2, fl: -0.15, ft: 0.45, ba1: -0.7 }),
    slamUp: P({ lean: -0.2, head: -0.25, fa1: 2.55, fa2: 0.3, fl: 0.2, ft: 0.2, ba1: -0.6, core: 0.7 }),
    slamDown: P({ lean: 0.2, crouch: 0.28, head: 0.2, fa1: 1.5, fa2: 0.3, fl: -1.2, ft: 0.15, ba1: -0.75 }),
    call: P({ lean: -0.1, head: -0.38, fa1: 0.55, ba1: -2.55, ba2: 0.25, bl: 0.1, bt: 0.8, core: 0.7 }),
    callBang: P({ lean: 0.05, head: -0.15, fa1: 0.45, ba1: -1.9, ba2: 0.6, bl: 0.2, bt: 1.4 }),
    stoke: P({ lean: -0.14, crouch: 0.12, head: -0.25, rear: 0.25, fa1: 0.85, fa2: 0.15, fl: 0.1, ba1: -0.95, ba2: 0.15, mouth: 1, core: 0.85 }),
    stamp: P({ lean: 0.22, crouch: 0.32, head: 0.2, fa1: 0.62, fa2: 0.25, fl: 0.35, ft: 0.2, ba1: 0.5, ba2: 0.2, mouth: 1, core: 0.8 }),
    rear: P({ lean: -0.26, head: -0.42, rear: 1, fa1: 2.35, fa2: 0.35, fl: 0.2, ft: 0.4, ba1: -2.1, ba2: -0.3, bl: 0.2, core: 1, mouth: 0.9 }),
    breathe: P({ lean: 0.1, head: 0.05, rear: 0.3, fa1: 1.95, fa2: 0.25, fl: 0.15, ft: 0.3, ba1: -1.6, ba2: -0.2, core: 1, mouth: 1 }),
    sag: P({ lean: 0.22, crouch: 0.2, head: 0.35, fa1: 0.4, fa2: 0.3, ft: 0.8, core: 0.5, mouth: 0.3 }),
    clutch: P({ lean: 0.32, crouch: 0.3, head: 0.45, clutch: 1, fa1: 0.15, fa2: 1.25, fl: 1.7, ft: 0.6, ba1: 0.55, ba2: 1.3, bl: 1.6, core: 1 }),
    slump: P({ lean: 0.42, crouch: 1, head: 0.7, fa1: 0.75, fa2: 0.1, fl: 0.25, ft: 0.9, ba1: 0.55, ba2: 0.15, core: 0.75, mouth: 0.2, eyes: 0.5, flame: 0.6 }),
    dead: P({ lean: 0.5, crouch: 1, head: 0.95, fa1: 0.32, fa2: 0.05, fl: 0.4, ft: 1.4, ba1: 0.1, ba2: 0.05, bl: 0.3, core: 0, mouth: 0, eyes: 0, flame: 0 }),
  };
  const POSE_KEYS = Object.keys(BASE);
  function pose(src) { return Object.assign({}, BASE, src || {}); }

  // ---------------------------------------------------------------------------------------------------------
  // Skeleton: local joint positions for a pose (shared by drawing and attack hitboxes)
  // ---------------------------------------------------------------------------------------------------------
  const L_UP = 82, L_FORE = 74, L_HANDLE = 128, L_HANDLE_B = 70;
  function skeleton(pz, cool) {
    const sink = pz.crouch * 46;
    const waistY = -112 + sink * 0.6;
    const lean = pz.lean, sl = Math.sin(lean), cl = Math.cos(lean);
    const up = (x, y) => { const dy = y - waistY; return [x * cl - dy * sl, waistY + x * sl + dy * cl]; };   // rotate about the waist
    const shF = up(80, -244 + sink), shB = up(-56, -232 + sink);
    const arm = (sh, a1, a2, al, at, hl) => {
      const e = [sh[0] + Math.sin(a1) * L_UP, sh[1] + Math.cos(a1) * L_UP];
      const h = [e[0] + Math.sin(a1 + a2) * L_FORE, e[1] + Math.cos(a1 + a2) * L_FORE];
      const ha = a1 + a2 + al;
      const b = [h[0] + Math.sin(ha) * hl, h[1] + Math.cos(ha) * hl];
      return { sh, e, h, b, ha, tilt: at };
    };
    const F = arm(shF, pz.fa1 + lean, pz.fa2, pz.fl, pz.ft, L_HANDLE);
    const B = arm(shB, pz.ba1 + lean, pz.ba2, pz.bl, pz.bt, L_HANDLE_B);
    const neck = up(18, -262 + sink);
    const head = up(26 + pz.head * 14, -292 + sink + Math.max(0, pz.head) * 16 - pz.rear * 4);
    const core = up(46, CORE_LY + sink);
    const mouth = up(40, -118 + sink * 0.4);
    const flue = up(-70, -250 + sink);
    void cool;
    return { sink, waistY, lean, up, F, B, neck, head, core, mouth, flue };
  }

  // ---------------------------------------------------------------------------------------------------------
  // Drawing (procedural, world space via a local transform). opts: {cool 0..1, grate 0..1, flash, t}
  // ---------------------------------------------------------------------------------------------------------
  const C = () => (G.Art && G.Art.char) || null;
  function mixc(a, b, k) { return k <= 0 ? a : k >= 1 ? b : U.mix(a, b, k); }

  function bowlPath(ctx, r, deep) {
    ctx.beginPath();
    ctx.moveTo(-r, 0);
    ctx.bezierCurveTo(-r, r * deep, r, r * deep, r, 0);
    ctx.closePath();
  }

  /** One ladle (handle from the hand to the bowl). big = the front ladle. */
  function drawLadle(ctx, A, big, pz, t, cool, hot) {
    const [hx, hy] = A.h, [bx, by] = A.b;
    const r = big ? 34 : 24;
    // handle
    ctx.lineCap = 'round';
    ctx.strokeStyle = COL.outline; ctx.lineWidth = big ? 13 : 10;
    ctx.beginPath(); ctx.moveTo(hx, hy); ctx.lineTo(bx, by); ctx.stroke();
    ctx.strokeStyle = COL.ironMid; ctx.lineWidth = big ? 8 : 6;
    ctx.beginPath(); ctx.moveTo(hx, hy); ctx.lineTo(bx, by); ctx.stroke();
    ctx.strokeStyle = COL.ironHi; ctx.lineWidth = 2; ctx.globalAlpha *= 0.6;
    ctx.beginPath(); ctx.moveTo(hx - 1, hy - 2); ctx.lineTo(bx - 1, by - 2); ctx.stroke();
    ctx.globalAlpha /= 0.6;
    // bowl: hangs from the handle end, its opening faces up, tipped forward by `tilt`
    ctx.save();
    ctx.translate(bx, by);
    ctx.rotate(A.tilt);
    // molten contents (visible over the rim when not tipped far)
    const fill = clamp(1 - Math.max(0, A.tilt - 0.6) * 0.9, 0, 1);
    bowlPath(ctx, r + 3, 1.05);
    ctx.fillStyle = COL.outline; ctx.fill();
    bowlPath(ctx, r, 1.0);
    ctx.fillStyle = grad('bowl' + r, () => { const g = ctx.createLinearGradient(-r, 0, r, r); g.addColorStop(0, COL.ironHi); g.addColorStop(0.35, COL.ironMid); g.addColorStop(1, COL.iron); return g; });
    ctx.fill();
    // rivets
    ctx.fillStyle = COL.ironHi;
    for (let i = -1; i <= 1; i++) { ctx.beginPath(); ctx.arc(i * r * 0.5, r * 0.42 + Math.abs(i) * -4, 2, 0, TAU); ctx.fill(); }
    // rim + molten surface
    ctx.fillStyle = COL.outline; ctx.fillRect(-r - 4, -3, 2 * r + 8, 6);
    if (fill > 0.05 && hot > 0.02) {
      ctx.fillStyle = mixc(COL.moltenHot, COL.molten, 0.4 + 0.2 * Math.sin(t * 6));
      ctx.globalAlpha *= hot;
      ctx.beginPath(); ctx.ellipse(0, -1, r - 2, 4 + 2 * fill, 0, Math.PI, TAU); ctx.fill();
      ctx.globalAlpha /= hot;
    }
    ctx.restore();
    if (hot > 0.02) glow(ctx, bx, by - 4, r * 2.4, COL.molten, 0.35 * hot * (1 - cool));
  }

  /** A tapered limb path from a to b (round ends). */
  function limbPath(a, b, w0, w1) {
    const dx = b[0] - a[0], dy = b[1] - a[1], L = Math.hypot(dx, dy) || 1;
    const nx = -dy / L, ny = dx / L, an = Math.atan2(ny, nx);
    const p = new Path2D();
    p.moveTo(a[0] + nx * w0, a[1] + ny * w0);
    p.lineTo(b[0] + nx * w1, b[1] + ny * w1);
    p.arc(b[0], b[1], w1, an, an + Math.PI, true);
    p.lineTo(a[0] - nx * w0, a[1] - ny * w0);
    p.arc(a[0], a[1], w0, an + Math.PI, an, true);
    p.closePath();
    return p;
  }

  function drawArm(ctx, A, front, pz, t, cool, hot) {
    const wax = mixc(front ? COL.wax : COL.waxShade, COL.coldWax, cool * 0.8);
    const shade = mixc(COL.waxDark, COL.cold, cool * 0.6);
    const w0 = front ? 22 : 18, w1 = front ? 17 : 14, w2 = front ? 13 : 11;
    const up = limbPath(A.sh, A.e, w0, w1), fo = limbPath(A.e, A.h, w1, w2);
    // outlines first, then fills: the joints read as one continuous limb
    ctx.lineWidth = 6; ctx.strokeStyle = COL.outline; ctx.stroke(up); ctx.stroke(fo);
    ctx.fillStyle = wax; ctx.fill(up); ctx.fill(fo);
    // form shade along the underside of both segments
    ctx.save();
    ctx.globalAlpha *= 0.45; ctx.strokeStyle = shade; ctx.lineCap = 'round';
    for (const [a, b, w] of [[A.sh, A.e, w0], [A.e, A.h, w1]]) {
      const dx = b[0] - a[0], dy = b[1] - a[1], L = Math.hypot(dx, dy) || 1, nx = -dy / L * w * 0.45, ny = dx / L * w * 0.45;
      const sgn = ny > 0 ? 1 : -1;   // the lower side
      ctx.lineWidth = w * 0.7;
      ctx.beginPath(); ctx.moveTo(a[0] + nx * sgn, a[1] + ny * sgn); ctx.lineTo(b[0] + nx * sgn, b[1] + ny * sgn); ctx.stroke();
    }
    ctx.restore();
    // iron bracer on the forearm
    const bx = lerp(A.e[0], A.h[0], 0.62), by = lerp(A.e[1], A.h[1], 0.62);
    ctx.save();
    ctx.translate(bx, by); ctx.rotate(Math.atan2(A.h[1] - A.e[1], A.h[0] - A.e[0]));
    const bh = front ? 17 : 14;
    ctx.fillStyle = COL.outline; ctx.fillRect(-15, -bh, 30, bh * 2);
    ctx.fillStyle = COL.ironMid; ctx.fillRect(-12, -bh + 2, 24, bh * 2 - 4);
    ctx.fillStyle = COL.ironHi; ctx.fillRect(-12, -bh + 2, 24, 3);
    ctx.fillStyle = COL.outline; ctx.fillRect(-1, -bh + 2, 2, bh * 2 - 4);
    ctx.restore();
    // wax drip from the elbow
    ctx.fillStyle = wax;
    const dl = 10 + 6 * Math.sin(t * 0.7 + (front ? 0 : 2));
    ctx.beginPath(); ctx.ellipse(A.e[0], A.e[1] + 10 + dl * 0.5, 4, dl * 0.5 + 3, 0, 0, TAU); ctx.fill();
    drawLadle(ctx, A, front, pz, t, cool, hot);
  }

  // ---- sprite cache: the heavy shaded shapes (skirt, furnace, mantle, hood) are rendered once per cooling step
  const SPR = new Map(), SPR_SCALE = 1.5, GRAD = new Map();
  function sprite(key, x0, y0, x1, y1, draw) {
    let sp = SPR.get(key);
    if (!sp) {
      const c = G.U.makeCanvas(Math.ceil((x1 - x0) * SPR_SCALE), Math.ceil((y1 - y0) * SPR_SCALE));
      const g = c.ctx;
      g.scale(SPR_SCALE, SPR_SCALE); g.translate(-x0, -y0);
      g.lineJoin = 'round'; g.lineCap = 'round';
      try { draw(g); } catch (e) { G.reportError(e, 'kilnmother sprite ' + key); }
      sp = { canvas: c.canvas, x0, y0, w: x1 - x0, h: y1 - y0 };
      SPR.set(key, sp);
    }
    return sp;
  }
  function blit(ctx, sp) { ctx.drawImage(sp.canvas, sp.x0, sp.y0, sp.w, sp.h); }
  /** gradients are interpreted in the user space at fill time, so position-fixed local gradients can be reused */
  function grad(key, make) { let g = GRAD.get(key); if (!g) { g = make(); GRAD.set(key, g); } return g; }

  function skirtSprite(cq) {
    return sprite('skirt' + cq, -162, -122, 172, 14, (ctx) => {
      const ch = C(), hot = 1 - cq;
      const sk = new Path2D();
      sk.moveTo(-150, 0);
      sk.bezierCurveTo(-140, -40, -118, -80, -100, -112);
      sk.lineTo(104, -112);
      sk.bezierCurveTo(124, -78, 142, -36, 158, 0);
      for (let i = 0; i <= 8; i++) { const hx = 158 - i * 38.5; sk.quadraticCurveTo(hx - 19, 6 + (i % 2) * 3, hx - 38.5, 0); }
      sk.closePath();
      const skirtC = mixc('#b5855a', '#9a948a', cq);
      if (ch) ch.shape(ctx, sk, { fill: skirtC, box: [-150, -115, 158, 0], light: -1, shade: 0.62, rim: hot > 0.3 ? COL.moltenHot : '#d8d0c4', rimWidth: 3, hi: 0.16, lw: 3, outline: COL.outline });
      else { ctx.fillStyle = skirtC; ctx.fill(sk); }
      ctx.save(); ctx.clip(sk);
      ctx.strokeStyle = mixc(COL.waxShade, COL.cold, cq * 0.7); ctx.lineWidth = 5; ctx.globalAlpha = 0.55;
      for (const [dx, len] of [[-110, 60], [-70, 84], [-24, 70], [26, 90], [70, 64], [118, 50]]) { ctx.beginPath(); ctx.moveTo(dx, -108); ctx.lineTo(dx + 4, -108 + len); ctx.stroke(); }
      ctx.restore();
    });
  }
  function bodySprite(cq) {
    return sprite('body' + cq, -134, -284, 134, -84, (ctx) => {
      const ch = C(), hot = 1 - cq;
      const iron = mixc(COL.iron, '#2a2826', cq), ironMid = mixc(COL.ironMid, '#45413d', cq);
      const by0 = -95, by1 = -262;
      const body = new Path2D();
      body.moveTo(-98, by0);
      body.bezierCurveTo(-120, -150, -112, -220, -80, by1 + 8);
      body.quadraticCurveTo(-10, by1 - 14, 70, by1 + 4);
      body.bezierCurveTo(118, -222, 128, -150, 104, by0);
      body.closePath();
      if (ch) ch.shape(ctx, body, { fill: iron, box: [-120, by1, 128, by0], light: -1, shade: 0.55, rim: hot > 0.3 ? '#ffb070' : '#a8a098', rimWidth: 3, hi: 0.12, lw: 3.5, outline: COL.outline });
      else { ctx.fillStyle = iron; ctx.fill(body); }
      ctx.save(); ctx.clip(body);
      for (const yy of [-126, -238]) {
        ctx.fillStyle = COL.outline; ctx.fillRect(-130, yy - 6, 260, 12);
        ctx.fillStyle = ironMid; ctx.fillRect(-130, yy - 4, 260, 8);
        ctx.fillStyle = COL.ironHi;
        for (let xx = -110; xx <= 120; xx += 22) { ctx.beginPath(); ctx.arc(xx, yy, 2.2, 0, TAU); ctx.fill(); }
      }
      ctx.fillStyle = COL.rust; ctx.globalAlpha = 0.35;
      ctx.fillRect(-84, -230, 6, 60); ctx.fillRect(-40, -160, 5, 40); ctx.fillRect(86, -200, 5, 50);
      ctx.restore();
      // porthole rim (riveted ring) — the core and its grate are drawn live inside it
      const cx0 = 46, cy0 = CORE_LY, cr = 40;
      ctx.fillStyle = COL.outline; ctx.beginPath(); ctx.arc(cx0, cy0, cr + 9, 0, TAU); ctx.fill();
      ctx.fillStyle = ironMid; ctx.beginPath(); ctx.arc(cx0, cy0, cr + 6, 0, TAU); ctx.fill();
      ctx.fillStyle = COL.ironHi;
      for (let i = 0; i < 8; i++) { const a = i / 8 * TAU; ctx.beginPath(); ctx.arc(cx0 + Math.cos(a) * (cr + 3), cy0 + Math.sin(a) * (cr + 3), 2, 0, TAU); ctx.fill(); }
      // firebox mouth frame
      ctx.fillStyle = COL.outline; ctx.beginPath(); ctx.ellipse(34, -106, 34, 12, 0, 0, TAU); ctx.fill();
    });
  }
  function mantleSprite(cq) {
    return sprite('mantle' + cq, -114, -306, 106, -168, (ctx) => {
      const ch = C(), hot = 1 - cq;
      const wax = mixc(COL.wax, COL.coldWax, cq * 0.85);
      const mt = new Path2D();
      mt.moveTo(-96, -238);
      mt.bezierCurveTo(-104, -268, -60, -296, 0, -296);
      mt.bezierCurveTo(60, -296, 100, -272, 92, -240);
      const drips = [[92, 0], [80, 34], [64, 14], [44, 50], [14, 22], [-14, 60], [-40, 26], [-64, 46], [-84, 18], [-96, 0]];
      for (let i = 0; i < drips.length; i++) {
        const [dx, len] = drips[i], nx2 = i + 1 < drips.length ? drips[i + 1][0] : -96, yb = -238;
        mt.lineTo(dx, yb);
        if (len > 4) { const mid = (dx + nx2) / 2; mt.quadraticCurveTo(dx - 2, yb + len * 0.7, mid + 3, yb + len); mt.quadraticCurveTo(nx2 + 2, yb + len * 0.7, nx2, yb); }
      }
      mt.closePath();
      if (ch) ch.shape(ctx, mt, { fill: wax, box: [-104, -300, 100, -180], light: -1, shade: 0.4, rim: hot > 0.3 ? COL.waxHi : '#e8e2d8', rimWidth: 3, hi: 0.25, lw: 3, outline: COL.outline });
      else { ctx.fillStyle = wax; ctx.fill(mt); }
    });
  }
  function headSprite(cq) {
    return sprite('head' + cq, -60, -62, 68, 40, (ctx) => {
      const ch = C(), hot = 1 - cq;
      const ironMid = mixc(COL.ironMid, '#45413d', cq), wax = mixc(COL.wax, COL.coldWax, cq * 0.85);
      const hood = new Path2D();
      hood.moveTo(-44, 22);
      hood.bezierCurveTo(-54, -14, -40, -50, -4, -54);
      hood.bezierCurveTo(30, -56, 52, -30, 50, 2);
      hood.quadraticCurveTo(54, 18, 46, 26);
      hood.quadraticCurveTo(0, 36, -44, 22);
      hood.closePath();
      if (ch) ch.shape(ctx, hood, { fill: ironMid, box: [-54, -56, 54, 30], light: -1, shade: 0.55, rim: hot > 0.3 ? '#ffb070' : '#b0a8a0', rimWidth: 2.5, hi: 0.15, lw: 3, outline: COL.outline });
      else { ctx.fillStyle = ironMid; ctx.fill(hood); }
      ctx.fillStyle = COL.outline;
      ctx.beginPath(); ctx.moveTo(40, -30); ctx.lineTo(62, -40); ctx.lineTo(60, -30); ctx.lineTo(46, -20); ctx.closePath(); ctx.fill();
      ctx.fillStyle = ironMid;
      ctx.beginPath(); ctx.moveTo(42, -29); ctx.lineTo(58, -37); ctx.lineTo(57, -31); ctx.lineTo(46, -23); ctx.closePath(); ctx.fill();
      const face = new Path2D();
      face.moveTo(-16, 18);
      face.bezierCurveTo(-26, -6, -14, -32, 10, -32);
      face.bezierCurveTo(34, -32, 44, -10, 38, 14);
      face.quadraticCurveTo(14, 26, -16, 18);
      face.closePath();
      if (ch) ch.shape(ctx, face, { fill: wax, box: [-26, -34, 44, 24], light: -1, shade: 0.45, hi: 0.3, lw: 2.5, outline: COL.outline });
      else { ctx.fillStyle = wax; ctx.fill(face); }
      ctx.save(); ctx.clip(face);
      const hs = ctx.createLinearGradient(0, -32, 0, 4);
      hs.addColorStop(0, 'rgba(20,10,6,0.75)'); hs.addColorStop(1, 'rgba(20,10,6,0)');
      ctx.fillStyle = hs; ctx.fillRect(-30, -34, 80, 40);
      ctx.restore();
      ctx.fillStyle = wax;
      ctx.beginPath(); ctx.ellipse(4, -10, 5, 9, 0.2, 0, TAU); ctx.fill();
      for (const ex of [6, 26]) { ctx.fillStyle = COL.outline; ctx.beginPath(); ctx.ellipse(ex, -6, 7, 4.2, ex > 10 ? -0.32 : 0.32, 0, TAU); ctx.fill(); }
    });
  }

  /**
   * Draw the Kiln Mother. x = centre, feetY = floor. facing ±1. pz = pose. o: {t, cool 0..1, grate 0..1}
   */
  function drawFigure(ctx, x, feetY, facing, pz, o) {
    o = o || {};
    const t = o.t || 0, cool = clamp(o.cool || 0, 0, 1), grate = clamp(o.grate || 0, 0, 1);
    const cq = Math.round(cool * 5) / 5;
    const hot = (1 - cool);
    const ch = C();
    const S = skeleton(pz, cool);
    ctx.save();
    ctx.translate(x, feetY);
    ctx.scale(facing, 1);
    ctx.lineJoin = 'round'; ctx.lineCap = 'round';

    const breathe = Math.sin(t * 1.6) * 2.5 * hot;
    const iron = mixc(COL.iron, '#2a2826', cq);
    const ironMid = mixc(COL.ironMid, '#45413d', cq);
    const sink = S.sink;

    // ---- floor: pooled wax and her shadow
    if (ch) ch.shadow(ctx, 0, 0, 170, 0.5);
    ctx.fillStyle = mixc('#c89a64', '#9a948a', cq);
    ctx.beginPath(); ctx.ellipse(8, -2, 168, 9, 0, 0, TAU); ctx.fill();

    // ---- back arm (behind the body)
    drawArm(ctx, S.B, false, pz, t, cool, hot * 0.8);

    // ---- flue pipe rising from her back
    ctx.save();
    const fx = S.flue[0], fy = S.flue[1];
    ctx.translate(fx, fy); ctx.rotate(S.lean * 0.8 - 0.12);
    ctx.fillStyle = COL.outline; ctx.fillRect(-17, -96, 34, 110);
    ctx.fillStyle = ironMid; ctx.fillRect(-14, -93, 28, 106);
    ctx.fillStyle = iron; ctx.fillRect(2, -93, 12, 106);
    ctx.fillStyle = COL.outline; ctx.fillRect(-20, -100, 40, 10);
    ctx.fillStyle = COL.ironHi; ctx.fillRect(-18, -98, 36, 3);
    if (hot > 0.05) glow(ctx, 0, -98, 30, COL.molten, 0.4 * hot);
    ctx.restore();
    if (ch && ch.pallSmoke) ch.pallSmoke(ctx, fx - 10 + S.lean * 40, fy - 100, t, { count: 5, height: 110, spread: 12, size: 11, alpha: 0.28 + 0.12 * cool, color: COL.smoke, seed: 3, drift: -6 });

    // ---- skirt (squashed from the floor as she sinks)
    ctx.save();
    ctx.scale(1, (112 - sink * 0.6) / 112);
    blit(ctx, skirtSprite(cq));
    ctx.restore();
    if (hot > 0.05) {   // molten rivulets running down from the firebox
      ctx.strokeStyle = COL.molten; ctx.globalAlpha *= 0.8 * hot;
      for (const [dx, len, w] of [[14, 70, 4], [46, 52, 3], [70, 84, 3.5], [-12, 40, 2.5]]) {
        const y0 = -100 + sink * 0.6, wob = Math.sin(t * 1.3 + dx) * 2, L2 = len * (1 - sink / 160);
        ctx.lineWidth = w;
        ctx.beginPath(); ctx.moveTo(dx, y0); ctx.quadraticCurveTo(dx + 6 + wob, y0 + L2 * 0.5, dx + 2, y0 + L2); ctx.stroke();
      }
      ctx.globalAlpha /= 0.8 * hot;
    }

    // ---- the furnace body (rotates with the lean about the waist)
    ctx.save();
    ctx.translate(0, S.waistY); ctx.rotate(S.lean); ctx.translate(0, -S.waistY);
    ctx.translate(0, sink);
    blit(ctx, bodySprite(cq));

    // firebox mouth glow + grille
    const mo = 0.35 + 0.65 * pz.mouth;
    const mx = 34, my = -106;
    const mga = (0.5 + 0.5 * mo) * (0.25 + 0.75 * hot);
    ctx.fillStyle = grad('mouth' + cq, () => { const g = ctx.createLinearGradient(0, my - 12, 0, my + 12); g.addColorStop(0, mixc(COL.moltenHot, '#3a3430', cq)); g.addColorStop(1, mixc(COL.coreRed, '#262220', cq)); return g; });
    ctx.globalAlpha *= mga;
    ctx.beginPath(); ctx.ellipse(mx, my + 1, 29, 8, 0, 0, TAU); ctx.fill();
    ctx.globalAlpha /= mga;
    ctx.fillStyle = COL.outline;
    for (let i = -2; i <= 2; i++) ctx.fillRect(mx + i * 11 - 2, my - 9, 4, 18);
    if (hot > 0.02) glow(ctx, mx, my, 70 + 30 * mo, COL.molten, 0.4 * mo * hot);

    // the chest porthole: molten core behind a grate (phase 2: the grate hangs open)
    const cx0 = 46, cy0 = CORE_LY, cr = 40;
    const pulse = 0.5 + 0.5 * Math.sin(t * (3 + 4 * pz.core));
    const heat = clamp(pz.core * hot, 0, 1);
    ctx.fillStyle = grad('core' + cq, () => {
      const g = ctx.createRadialGradient(cx0 - 6, cy0 - 6, 2, cx0, cy0, cr);
      g.addColorStop(0, mixc(COL.white, '#4a4440', cq)); g.addColorStop(0.35, mixc(COL.moltenHot, '#3a3532', cq));
      g.addColorStop(0.8, mixc(COL.molten, '#2c2826', cq)); g.addColorStop(1, mixc(COL.coreRed, '#201c1a', cq));
      return g;
    });
    const ca = 0.55 + 0.45 * heat;
    ctx.globalAlpha *= ca;
    ctx.beginPath(); ctx.arc(cx0, cy0, cr, 0, TAU); ctx.fill();
    ctx.globalAlpha /= ca;
    if (hot > 0.05) {   // swirling molten veins
      const va = 0.35 + 0.4 * heat;
      ctx.strokeStyle = COL.white; ctx.lineWidth = 2.5; ctx.globalAlpha *= va;
      for (let i = 0; i < 3; i++) { const a0 = t * (0.8 + i * 0.3) + i * 2.1; ctx.beginPath(); ctx.arc(cx0, cy0, cr * (0.35 + i * 0.18), a0, a0 + 1.6); ctx.stroke(); }
      ctx.globalAlpha /= va;
    }
    if (grate < 1) {   // bars across the porthole, folding toward the hinge as the grate opens
      const k = 1 - grate;
      ctx.fillStyle = COL.outline;
      for (let i = -3; i <= 3; i++) {
        const bx = cx0 - cr + (cr + i * 12) * k, hh = Math.sqrt(Math.max(0, cr * cr - (i * 12) * (i * 12))) - 1;
        ctx.fillRect(bx - 3.5 * k, cy0 - hh, 7 * k, hh * 2);
      }
      ctx.fillRect(cx0 - cr, cy0 - 4, cr * 2 * k, 8);
      ctx.fillStyle = ironMid;
      for (let i = -3; i <= 3; i++) {
        const bx = cx0 - cr + (cr + i * 12) * k, hh = Math.sqrt(Math.max(0, cr * cr - (i * 12) * (i * 12))) - 2;
        ctx.fillRect(bx - 2 * k, cy0 - hh, 4 * k, hh * 2);
      }
    }
    if (grate > 0) {
      // the burst-open door, hanging from its hinge on the near side
      ctx.save();
      ctx.translate(cx0 - cr - 4, cy0 + 6);
      ctx.rotate(-0.25 + 0.15 * Math.sin(t * 2) * hot);
      ctx.scale(0.28 + 0.1 * (1 - grate), 1);
      ctx.fillStyle = COL.outline; ctx.beginPath(); ctx.arc(-cr, 0, cr + 6, 0, TAU); ctx.fill();
      ctx.fillStyle = ironMid; ctx.beginPath(); ctx.arc(-cr, 0, cr + 2, 0, TAU); ctx.fill();
      ctx.fillStyle = COL.outline;
      for (let i = -3; i <= 3; i++) ctx.fillRect(-cr + i * 12 - 3, -cr, 6, cr * 2);
      ctx.restore();
      if (hot > 0.1) {   // molten dribble from the open porthole
        ctx.fillStyle = COL.molten; ctx.globalAlpha *= 0.85 * hot;
        const dl = 24 + 10 * Math.sin(t * 3);
        ctx.beginPath(); ctx.moveTo(cx0 + 4, cy0 + cr - 6); ctx.quadraticCurveTo(cx0 + 12, cy0 + cr + dl * 0.5, cx0 + 6, cy0 + cr + dl);
        ctx.quadraticCurveTo(cx0 - 2, cy0 + cr + dl * 0.5, cx0 - 6, cy0 + cr - 6); ctx.fill();
        ctx.globalAlpha /= 0.85 * hot;
      }
    }
    if (heat > 0.02) glow(ctx, cx0, cy0, cr * (2.4 + 1.2 * grate) + 10 * pulse, grate > 0 ? COL.moltenHot : COL.molten, (0.35 + 0.35 * heat + 0.2 * grate) * heat);

    // ---- the wax mantle poured over the shoulders (breathing)
    ctx.translate(0, breathe);
    blit(ctx, mantleSprite(cq));
    ctx.restore();   // end body transform

    // ---- head: an iron crucible-hood with a waxen face; ember eyes; wick and flame on the crown
    const [hX, hY] = S.head;
    ctx.save();
    ctx.translate(hX, hY + breathe);
    ctx.rotate(S.lean * 0.6 + pz.head * 0.45);
    ctx.scale(1.3, 1.3);
    blit(ctx, headSprite(cq));
    const eyes = clamp(pz.eyes * hot, 0, 1);
    if (eyes > 0.02) {
      const blink = ch && ch.blinkAt ? ch.blinkAt(t, 7, 5.5) : 0;
      ctx.fillStyle = mixc(COL.ember, COL.white, Math.round(pz.core * 4) / 16);
      ctx.globalAlpha *= eyes;
      for (const ex of [6, 26]) { ctx.beginPath(); ctx.ellipse(ex, -6, 4.6, 2.3 * (1 - blink * 0.9), ex > 10 ? -0.32 : 0.32, 0, TAU); ctx.fill(); }
      ctx.globalAlpha /= eyes;
      glow(ctx, 16, -6, 26, COL.ember, 0.45 * eyes);
    }
    // mouth: a thin molten seam (opens as she rears to breathe)
    ctx.strokeStyle = eyes > 0.1 ? '#a8401a' : COL.outline; ctx.lineWidth = 2.2;
    ctx.beginPath(); ctx.moveTo(9, 10); ctx.lineTo(27, 9 + pz.rear * 4); ctx.stroke();
    if (pz.rear > 0.2 && hot > 0.1) { ctx.fillStyle = COL.moltenHot; ctx.globalAlpha *= pz.rear; ctx.beginPath(); ctx.ellipse(18, 10 + pz.rear * 2, 8, 2.5 * pz.rear, 0, 0, TAU); ctx.fill(); ctx.globalAlpha /= pz.rear; }
    const wk = ch && ch.wick ? ch.wick(ctx, -6, -52, { len: 12, bend: -4, width: 3, ember: true }) : [-6, -62];
    if (pz.flame > 0.02 && hot > 0.02 && G.Art && G.Art.flame) G.Art.flame(ctx, wk[0], wk[1] + 2, 40 * pz.flame * (0.4 + 0.6 * hot), 'orange', t, 11, { lean: -6 });
    else if (ch && ch.pallSmoke) ch.pallSmoke(ctx, wk[0], wk[1], t, { count: 4, height: 70, spread: 6, size: 6, alpha: 0.3, seed: 5 });
    ctx.restore();

    // ---- front arm and its great ladle (in front of the body)
    drawArm(ctx, S.F, true, pz, t, cool, hot);

    // ---- molten stream from the front ladle while pouring
    if (pz.pour > 0.05 && hot > 0.05) {
      const [bx, by] = S.F.b;
      const lipX = bx + Math.cos(S.F.tilt) * 30, lipY = by + Math.sin(S.F.tilt) * 30;
      const w = 9 * pz.pour;
      ctx.fillStyle = COL.molten; ctx.globalAlpha *= pz.pour * hot;
      ctx.beginPath();
      ctx.moveTo(lipX - w, lipY);
      ctx.quadraticCurveTo(lipX + 8, lipY + 20, lipX + 2 - w * 0.5, 0);
      ctx.lineTo(lipX + 2 + w * 0.5, 0);
      ctx.quadraticCurveTo(lipX + 14, lipY + 20, lipX + w, lipY);
      ctx.closePath(); ctx.fill();
      ctx.fillStyle = COL.moltenHot;
      ctx.fillRect(lipX - 1.5, lipY + 6, 3, -lipY - 8);
      ctx.globalAlpha /= pz.pour * hot;
      glow(ctx, lipX + 4, -8, 60, COL.molten, 0.5 * pz.pour * hot);
      glow(ctx, lipX + 2, (lipY) * 0.5, 40, COL.molten, 0.3 * pz.pour * hot);
    }
    ctx.restore();
    return S;
  }

  // ---------------------------------------------------------------------------------------------------------
  // Arena geometry (from the tiles: floor, decks, inner walls, gates, vents)
  // ---------------------------------------------------------------------------------------------------------
  function isSolid(code) { return G.Physics.isSolidTile(code); }
  function arenaGeom(room, spawnCx, w) {
    const cols = room.cols, rows = room.rows;
    const col = clamp(Math.floor(spawnCx / TILE), 1, cols - 2);
    let fr = rows - 1, r0 = 0;
    while (r0 < rows - 1 && isSolid(room.tileAt(col, r0))) r0++;                 // below the ceiling
    for (let r = r0; r < rows; r++) if (isSolid(room.tileAt(col, r))) { fr = r; break; }
    const floorY = fr * TILE;
    const decks = [];
    for (let r = 0; r < fr; r++) {
      let c = 0;
      while (c < cols) {
        if (room.tileAt(c, r) === G.T.PLATFORM) {
          let c2 = c; while (c2 + 1 < cols && room.tileAt(c2 + 1, r) === G.T.PLATFORM) c2++;
          decks.push({ x0: c * TILE, x1: (c2 + 1) * TILE, y: r * TILE });
          c = c2 + 1;
        } else c++;
      }
    }
    const row = fr - 1;
    let cw = col; while (cw > 0 && !isSolid(room.tileAt(cw - 1, row))) cw--;
    let ce = col; while (ce < cols - 1 && !isSolid(room.tileAt(ce + 1, row))) ce++;
    let west = cw * TILE, east = (ce + 1) * TILE;
    // closed arena gates bound the floor too
    for (const g of room.findType ? room.findType('arena_gate') : []) {
      if (g.x + g.w <= spawnCx) west = Math.max(west, g.x + g.w); else east = Math.min(east, g.x);
    }
    // her station: a deck ending close to the spawn → she stands DECK_GAP beyond its end
    let homeX = null;
    for (const d of decks) if (Math.abs(d.x1 - spawnCx) <= 220 && d.y > floorY - 7 * TILE) homeX = d.x1 + DECK_GAP;
    if (homeX == null) homeX = spawnCx - w / 2;
    homeX = clamp(homeX, west + 6 * TILE, east - w);
    let ceilY = 0; for (let r = r0 - 1; r >= 0; r--) { if (isSolid(room.tileAt(col, r))) { ceilY = (r + 1) * TILE; break; } }
    if (!ceilY) ceilY = r0 * TILE;
    // moldling vents: over an alcove behind her if there is one, else hanging from the vault over her back
    // (ch_09: the forge wall stands 20 px behind her — QA removed the alcove, a corner trap)
    const alcove0 = homeX + w;
    const vents = east - alcove0 >= 160
      ? [{ x: Math.max(alcove0 + 40, east - 140), y: 7 * TILE - 10 }, { x: east - 46, y: 7 * TILE - 10 }]
      : [{ x: homeX + w * 0.6, y: ceilY + 62 }, { x: homeX + w - 16, y: ceilY + 104 }];
    return { floorY, ceilY, decks, west, east, homeX, vents };
  }
  /** Top surface y at x (a deck if one covers x, else the floor). */
  function surfaceAt(A, x) {
    let y = A.floorY;
    for (const d of A.decks) if (x >= d.x0 && x <= d.x1 && d.y < y) y = d.y;
    return y;
  }

  // ---------------------------------------------------------------------------------------------------------
  // Sound design
  // ---------------------------------------------------------------------------------------------------------
  (function defineSounds() {
    const A = G.Audio;
    if (!A || typeof A.defineSfx !== 'function') return;
    const thump = (k, f, d, g, at) => k.tone({ f, f1: f * 0.5, glide: d * 0.8, d, g, at: at || 0, a: 0.002 });
    const bubbles = (k, n, span, g, at, lo, hi) => {
      for (let i = 0; i < n; i++) k.tone({ f: k.r(lo || 140, hi || 380), f1: k.r(300, 800), glide: 0.05, a: 0.004, d: k.r(0.04, 0.09), g: g * k.r(0.5, 1), at: (at || 0) + k.r(0, span) });
    };
    const sizzle = (k, d, g, at) => k.noise({ hp: 3800, hp1: 2400, a: 0.02, hold: d * 0.4, d: d, g, at: at || 0, sweep: d });
    // a deep molten gurgle rising in the furnace (pour / scoop wind-ups)
    A.defineSfx('kiln_gurgle', { vol: 2.0, reverb: 0.3, prio: 2, play(k) {
      const v = k.r(0.92, 1.06);
      k.tone({ f: 70 * v, f1: 120 * v, glide: 0.5, type: 'sawtooth', lp: 420, a: 0.08, hold: 0.3, d: 0.3, g: 0.16, vib: { rate: 9, depth: 140 } });
      bubbles(k, 10, 0.55, 0.06, 0.02, 110, 300);
      k.noise({ color: 'brown', lp: 500 * v, a: 0.1, hold: 0.25, d: 0.3, g: 0.2 });
    } });
    // pouring: a heavy molten stream hitting the floor with a hiss
    A.defineSfx('kiln_pour', { vol: 2.0, reverb: 0.25, prio: 2, play(k) {
      const v = k.r(0.92, 1.06);
      k.noise({ color: 'pink', bp: 500 * v, Q: 0.8, a: 0.02, hold: 0.35, d: 0.4, g: 0.3 });
      sizzle(k, 0.6, 0.12, 0.05);
      thump(k, 80 * v, 0.3, 0.3);
      bubbles(k, 7, 0.4, 0.05, 0.05, 160, 420);
    } });
    // the molten wave rolling along the floor
    A.defineSfx('kiln_wave', { vol: 1.9, reverb: 0.2, prio: 2, play(k) {
      const v = k.r(0.92, 1.06);
      k.noise({ color: 'brown', lp: 900 * v, lp1: 300, a: 0.04, hold: 0.25, d: 0.5, g: 0.36, sweep: 0.6 });
      sizzle(k, 0.5, 0.1, 0.02);
    } });
    // scoop into the chest / fling: an iron scrape and a whoosh
    A.defineSfx('kiln_scoop', { vol: 1.9, reverb: 0.25, prio: 2, play(k) {
      const v = k.r(0.94, 1.06);
      k.tone({ f: 420 * v, f1: 300 * v, glide: 0.3, type: 'sawtooth', bp: 1200, Q: 4, a: 0.03, hold: 0.15, d: 0.25, g: 0.06 });
      bubbles(k, 8, 0.45, 0.06, 0.05);
      k.noise({ color: 'brown', lp: 600, a: 0.12, d: 0.4, g: 0.18 });
    } });
    A.defineSfx('kiln_fling', { vol: 1.9, reverb: 0.2, prio: 2, play(k) {
      const v = k.r(0.92, 1.08);
      k.noise({ bp: 500 * v, bp1: 1500 * v, Q: 1, a: 0.02, d: 0.3, g: 0.36, sweep: 0.25 });
      sizzle(k, 0.3, 0.08, 0.03);
    } });
    // a slag gob splashing on iron
    A.defineSfx('kiln_splat', { vol: 1.6, reverb: 0.2, prio: 1, play(k) {
      const v = k.r(0.88, 1.12);
      k.noise({ bp: 900 * v, bp1: 300 * v, Q: 1.2, a: 0.002, d: 0.22, g: 0.32, sweep: 0.2 });
      thump(k, 110 * v, 0.18, 0.2);
      sizzle(k, 0.35, 0.07, 0.04);
    } });
    // heated floor: a rising furnace drone; then the flare whoomph
    A.defineSfx('kiln_heat', { vol: 1.9, reverb: 0.35, prio: 2, play(k) {
      const v = k.r(0.95, 1.05);
      k.tone({ f: 55 * v, f1: 110 * v, glide: 0.8, type: 'sawtooth', lp: 380, lp1: 1400, sweep: 0.8, a: 0.2, hold: 0.5, d: 0.3, g: 0.14 });
      k.noise({ color: 'pink', lp: 400, lp1: 2400, sweep: 0.8, a: 0.3, hold: 0.4, d: 0.25, g: 0.14 });
    } });
    A.defineSfx('kiln_flare', { vol: 1.9, reverb: 0.25, prio: 2, play(k) {
      const v = k.r(0.92, 1.08);
      k.noise({ color: 'pink', bp: 700 * v, Q: 0.7, a: 0.01, hold: 0.15, d: 0.45, g: 0.4 });
      thump(k, 70 * v, 0.35, 0.3);
      sizzle(k, 0.5, 0.1, 0.05);
    } });
    // ladle sweep: a grinding scrape (wind-up) and the heavy swing
    A.defineSfx('kiln_scrape', { vol: 1.9, reverb: 0.2, prio: 2, play(k) {
      const v = k.r(0.94, 1.06);
      for (let i = 0; i < 14; i++) k.noise({ bp: k.r(1500, 3200) * v, Q: 5, a: 0.002, d: 0.03, g: 0.08, at: i * 0.03 });
      k.tone({ f: 190 * v, f1: 140 * v, glide: 0.4, type: 'sawtooth', lp: 1000, a: 0.04, hold: 0.2, d: 0.2, g: 0.07 });
    } });
    A.defineSfx('kiln_sweep', { vol: 2.0, reverb: 0.2, prio: 2, play(k) {
      const v = k.r(0.92, 1.06);
      k.noise({ bp: 260 * v, bp1: 900 * v, Q: 0.9, a: 0.02, d: 0.35, g: 0.45, sweep: 0.25 });
      for (let i = 0; i < 8; i++) k.noise({ bp: k.r(2000, 4000), Q: 4, a: 0.002, d: 0.04, g: 0.06, at: 0.05 + i * 0.025 });
    } });
    // overhead slam: an iron creak on the raise, then a ringing clang and thud
    A.defineSfx('kiln_creak', { vol: 1.9, reverb: 0.3, prio: 2, play(k) {
      const v = k.r(0.94, 1.06);
      k.tone({ f: 160 * v, f1: 240 * v, glide: 0.5, type: 'sawtooth', bp: 700, Q: 6, a: 0.06, hold: 0.25, d: 0.25, g: 0.08, vib: { rate: 23, depth: 60 } });
      k.noise({ color: 'brown', lp: 500, a: 0.2, d: 0.4, g: 0.12 });
    } });
    A.defineSfx('kiln_slam', { vol: 2.1, reverb: 0.35, prio: 3, play(k) {
      const v = k.r(0.94, 1.04);
      thump(k, 58 * v, 0.55, 0.65);
      k.noise({ color: 'brown', lp: 900 * v, lp1: 160, a: 0.002, d: 0.6, g: 0.45, sweep: 0.5 });
      k.tone({ f: 620 * v, type: 'triangle', a: 0.002, d: 0.9, g: 0.08, fm: { ratio: 2.76, index: 3, d: 0.5 } });
      k.tone({ f: 1130 * v, type: 'sine', a: 0.002, d: 0.6, g: 0.04 });
    } });
    // calling the brood: a long low groan and the vents gurgling
    A.defineSfx('kiln_call', { vol: 2.0, reverb: 0.4, prio: 2, play(k) {
      const v = k.r(0.94, 1.04);
      k.tone({ f: 92 * v, pts: [[0.25, 110 * v], [0.5, 82 * v]], type: 'sawtooth', lp: 600, a: 0.1, hold: 0.35, d: 0.3, g: 0.16, vib: { rate: 5, depth: 40 } });
      k.tone({ f: 138 * v, pts: [[0.25, 165 * v], [0.5, 123 * v]], type: 'triangle', a: 0.1, hold: 0.35, d: 0.3, g: 0.08 });
      bubbles(k, 10, 0.6, 0.05, 0.2, 120, 260);
    } });
    // breath: a roaring intake, then the jet
    A.defineSfx('kiln_inhale', { vol: 2.0, reverb: 0.3, prio: 2, play(k) {
      const v = k.r(0.95, 1.05);
      k.noise({ color: 'pink', bp: 300 * v, bp1: 1600 * v, Q: 0.9, a: 0.4, hold: 0.2, d: 0.12, g: 0.3, sweep: 0.65 });
      k.tone({ f: 60 * v, f1: 95 * v, glide: 0.6, type: 'sawtooth', lp: 500, a: 0.3, hold: 0.25, d: 0.15, g: 0.12 });
    } });
    A.defineSfx('kiln_breath', { vol: 2.1, reverb: 0.25, prio: 3, play(k) {
      const v = k.r(0.95, 1.05);
      k.noise({ color: 'pink', bp: 600 * v, Q: 0.6, a: 0.02, hold: 0.55, d: 0.35, g: 0.42 });
      k.noise({ color: 'brown', lp: 400, a: 0.02, hold: 0.5, d: 0.3, g: 0.35 });
      sizzle(k, 0.8, 0.1, 0.05);
    } });
    // phase 2: the grate bursts open
    A.defineSfx('kiln_grate', { vol: 2.2, reverb: 0.45, prio: 3, play(k) {
      const v = k.r(0.97, 1.03);
      k.tone({ f: 300 * v, f1: 180 * v, glide: 0.35, type: 'sawtooth', bp: 900, Q: 5, a: 0.02, hold: 0.2, d: 0.2, g: 0.1 });
      thump(k, 52 * v, 0.7, 0.6, 0.3);
      k.tone({ f: 470 * v, type: 'triangle', a: 0.002, d: 1.4, g: 0.1, at: 0.3, fm: { ratio: 3.1, index: 4, d: 0.6 } });
      k.noise({ color: 'pink', bp: 800, Q: 0.6, a: 0.005, d: 0.9, g: 0.4, at: 0.3 });
    } });
    // a hit on the open core: a hot ringing hiss
    A.defineSfx('kiln_core', { vol: 1.6, reverb: 0.25, prio: 2, play(k) {
      const v = k.r(0.94, 1.06);
      k.tone({ f: 880 * v, f1: 700 * v, glide: 0.2, type: 'triangle', a: 0.002, d: 0.35, g: 0.12 });
      sizzle(k, 0.3, 0.12);
    } });
    // defeat: steam hissing as the kiln goes cold; ladles dropping
    A.defineSfx('kiln_cool', { vol: 1.9, reverb: 0.45, prio: 2, play(k) {
      k.noise({ hp: 1800, hp1: 800, a: 0.3, hold: 1.2, d: 1.4, g: 0.22, sweep: 2.5 });
      k.tone({ f: 70, f1: 40, glide: 2.5, type: 'sawtooth', lp: 300, a: 0.3, hold: 0.8, d: 1.2, g: 0.08 });
    } });
    A.defineSfx('kiln_clang', { vol: 1.9, reverb: 0.35, prio: 2, play(k) {
      const v = k.r(0.9, 1.1);
      k.tone({ f: 540 * v, type: 'triangle', a: 0.002, d: 1.1, g: 0.12, fm: { ratio: 2.4, index: 3, d: 0.4 } });
      thump(k, 90 * v, 0.3, 0.3);
    } });
    // moldlings: a wet gurgle (lunge wind-up), the hop, and a molten splat on landing
    A.defineSfx('mold_gurgle', { vol: 1.5, reverb: 0.15, prio: 1, play(k) {
      const v = k.r(0.9, 1.15);
      k.tone({ f: 200 * v, f1: 420 * v, glide: 0.35, type: 'sawtooth', lp: 900, a: 0.03, hold: 0.15, d: 0.15, g: 0.07, vib: { rate: 18, depth: 160 } });
      bubbles(k, 5, 0.3, 0.05, 0, 260, 600);
    } });
    A.defineSfx('mold_hop', { vol: 1.4, reverb: 0.1, prio: 1, play(k) {
      const v = k.r(0.9, 1.15);
      k.noise({ bp: 800 * v, bp1: 1600 * v, Q: 1.2, a: 0.004, d: 0.16, g: 0.22, sweep: 0.15 });
    } });
    A.defineSfx('mold_splat', { vol: 1.5, reverb: 0.15, prio: 1, play(k) {
      const v = k.r(0.88, 1.12);
      k.noise({ bp: 700 * v, bp1: 250, Q: 1.2, a: 0.002, d: 0.2, g: 0.3, sweep: 0.2 });
      sizzle(k, 0.25, 0.06, 0.03);
    } });
  })();

  // ---------------------------------------------------------------------------------------------------------
  // Projectiles: the molten wave and slag gobs
  // ---------------------------------------------------------------------------------------------------------
  const Wave = G.Projectile && G.Projectile.Wave;
  class KilnWave extends (Wave || G.Projectile) {
    // harmless while it rises out of the pour (its crest grows over the first 0.12 s): a player right beside the stream
    // or the slam's impact gets a beat to jump instead of being hit on the wave's first frame
    hitBox() { return this.age < WAVE_RISE ? { x: this.cx, y: this.y + this.h, w: 0, h: 0 } : { x: this.x + 6, y: this.y + this.h * 0.3, w: this.w - 12, h: this.h * 0.7 }; }
    draw(ctx, t) {
      const bx = this.cx, by = this.y + this.h, d = this.dir, H = this.h, W = this.w;
      const life = clamp(1 - Math.max(0, this.age - this.life + 0.3) / 0.3, 0, 1);
      const rise = clamp(this.age / 0.12, 0, 1);
      glow(ctx, bx, by - H * 0.4, H * 1.5, COL.molten, 0.55 * life);
      ctx.save();
      ctx.globalAlpha *= life;
      const h = H * rise * (0.92 + 0.08 * Math.sin(t * 22 + this.seed));
      // trailing low swell
      ctx.fillStyle = COL.coreRed;
      ctx.beginPath();
      ctx.moveTo(bx - d * W * 2.2, by);
      ctx.quadraticCurveTo(bx - d * W * 1.2, by - h * 0.35, bx - d * W * 0.2, by - h * 0.62);
      ctx.lineTo(bx + d * W * 0.2, by);
      ctx.closePath(); ctx.fill();
      // the crest, curling forward
      const crest = new Path2D();
      crest.moveTo(bx - d * W * 0.9, by);
      crest.bezierCurveTo(bx - d * W * 0.8, by - h * 0.7, bx - d * W * 0.1, by - h * 1.05, bx + d * W * 0.45, by - h * 0.92);
      crest.bezierCurveTo(bx + d * W * 0.75, by - h * 0.85, bx + d * W * 0.7, by - h * 0.55, bx + d * W * 0.45, by - h * 0.6);
      crest.bezierCurveTo(bx + d * W * 0.6, by - h * 0.3, bx + d * W * 0.7, by - h * 0.1, bx + d * W * 0.75, by);
      crest.closePath();
      ctx.lineWidth = 4; ctx.strokeStyle = '#3a1404'; ctx.stroke(crest);
      ctx.fillStyle = COL.molten; ctx.fill(crest);
      ctx.save(); ctx.clip(crest);
      ctx.fillStyle = COL.moltenHot;
      ctx.beginPath(); ctx.ellipse(bx + d * W * 0.15, by - h * 0.8, W * 0.55, h * 0.16, -d * 0.3, 0, TAU); ctx.fill();
      ctx.fillStyle = COL.white; ctx.globalAlpha *= 0.8;
      ctx.beginPath(); ctx.ellipse(bx + d * W * 0.3, by - h * 0.86, W * 0.25, h * 0.06, -d * 0.3, 0, TAU); ctx.fill();
      ctx.restore();
      // droplets thrown off the crest
      ctx.fillStyle = COL.moltenHot;
      for (let i = 0; i < 4; i++) {
        const k = ((t * 2.2 + i * 0.27 + this.seed) % 1);
        const px = bx + d * (W * 0.4 + k * 30), py = by - h * (0.95 + 0.35 * Math.sin(k * Math.PI)) + k * 20;
        ctx.beginPath(); ctx.arc(px, py, 2.6 * (1 - k * 0.6), 0, TAU); ctx.fill();
      }
      // hot line on the floor
      ctx.fillStyle = COL.white; ctx.globalAlpha *= 0.7;
      ctx.fillRect(bx - W * 1.4, by - 2, W * 2.8, 2);
      ctx.restore();
    }
    burstFx(why) {
      if (why === 'clear' || why === 'expire' || why === 'terrain') {
        burst('wax', this.cx, this.y + this.h - 10, { count: 8, color: COL.molten, speed: 220, angle: -Math.PI / 2, spread: 2.2 });
        burst('smoke', this.cx, this.y + this.h - 20, { count: 3, color: COL.smoke, alpha: 0.35, size: 12 });
      }
    }
  }
  G.registerProjectile('kiln_wave', KilnWave, { r: 20, gravity: 0, life: 6, color: COL.molten, damage: 1 });

  /** Slag gob: arcs onto a marked spot (props landX, landY) and splashes there (radius SPLASH). */
  const SPLASH = 30;
  class KilnSlag extends G.Projectile {
    constructor(props) {
      super(props);
      this.landX = props.landX; this.landY = props.landY;
      this.ringT = 0;
      this.flight = props.flight || 1;
    }
    update(dt) {
      this.ringT += dt;
      super.update(dt);
      if (!this.dead && this.vy > 0 && this.landY != null && this.cy + this.r * 0.5 >= this.landY) { this.y = this.landY - this.h / 2; this.splash(); }
    }
    // terrain never stops a gob before its marked spot (it lands exactly there, see update)
    hitsTerrain() { return this.landY == null ? super.hitsTerrain() : this.cy > this.landY + 40 && super.hitsTerrain(); }
    // harmless in flight: only the splash on the marked spot burns (the ring is the whole rule)
    touchPlayer() { return false; }
    splash() {
      if (this.dead) return;
      const p = G.game && G.game.player;
      if (p && !p.dead) {
        const zone = { x: this.landX - SPLASH, y: this.landY - SPLASH * 1.2, w: SPLASH * 2, h: SPLASH * 1.2 };
        if (overlap(zone, p)) G.Combat.hurtPlayer(this.damage, this);
      }
      this.burst('terrain');
    }
    burstFx(why) {
      const x = this.landX != null && why === 'terrain' ? this.landX : this.cx, y = why === 'terrain' && this.landY != null ? this.landY : this.cy;
      burst('wax', x, y - 4, { count: 12, color: COL.molten, speed: 300, angle: -Math.PI / 2, spread: 2.4 });
      burst('spark', x, y - 6, { count: 8, color: COL.moltenHot, speed: 340, angle: -Math.PI / 2, spread: 2.6 });
      burst('smoke', x, y - 10, { count: 2, color: COL.smoke, alpha: 0.35, size: 12 });
      if (why !== 'clear') sfx('kiln_splat', x, { vol: 0.7 });
    }
    draw(ctx, t) {
      // the landing mark: a glowing ring on the target surface, tightening as the gob comes down
      if (this.landX != null) {
        const k = clamp(this.ringT / Math.max(0.3, this.flight), 0, 1);
        const pulse = 0.5 + 0.5 * Math.sin(this.ringT * (10 + 14 * k));
        const R = SPLASH * (1.35 - 0.35 * k);
        ctx.save();
        ctx.globalCompositeOperation = 'lighter';
        ctx.strokeStyle = U.rgba(COL.molten, 0.45 + 0.4 * pulse); ctx.lineWidth = 3;
        ctx.beginPath(); ctx.ellipse(this.landX, this.landY - 2, R, R * 0.28, 0, 0, TAU); ctx.stroke();
        ctx.fillStyle = U.rgba(COL.molten, 0.12 + 0.18 * k);
        ctx.beginPath(); ctx.ellipse(this.landX, this.landY - 2, R * 0.85, R * 0.22, 0, 0, TAU); ctx.fill();
        ctx.restore();
        glow(ctx, this.landX, this.landY - 6, R * 1.6, COL.molten, 0.18 + 0.2 * k);
      }
      const tr = this.trail;
      for (let i = 0; i < tr.length; i += 2) glow(ctx, tr[i], tr[i + 1], this.r * (0.5 + i / tr.length), COL.molten, 0.1 + 0.2 * i / tr.length);
      glow(ctx, this.cx, this.cy, this.r * 3.2, COL.molten, 0.5);
      const a = Math.atan2(this.vy, this.vx), s = clamp(this.speed / 800, 0, 0.5);
      ctx.save();
      ctx.translate(this.cx, this.cy); ctx.rotate(a);
      ctx.fillStyle = '#3a1404';
      ctx.beginPath(); ctx.ellipse(-this.r * s, 0, this.r * (1 + s) + 2, this.r * (1 - s * 0.3) + 2, 0, 0, TAU); ctx.fill();
      ctx.fillStyle = COL.molten;
      ctx.beginPath(); ctx.ellipse(-this.r * s, 0, this.r * (1 + s), this.r * (1 - s * 0.3), 0, 0, TAU); ctx.fill();
      ctx.fillStyle = COL.moltenHot;
      ctx.beginPath(); ctx.ellipse(this.r * 0.15, -this.r * 0.2, this.r * 0.55, this.r * 0.4, 0, 0, TAU); ctx.fill();
      ctx.restore();
      void t;
    }
  }
  G.registerProjectile('kiln_slag', KilnSlag, { r: 12, gravity: 1250, life: 4, color: COL.molten, damage: 1 });

  // ---------------------------------------------------------------------------------------------------------
  // Heated floor section: a glowing seam (warning) that flares into a wall of flame, then cools.
  // props: {x, w, floorY, warn (s), flare (s)}
  // ---------------------------------------------------------------------------------------------------------
  class KilnHeat extends G.Entity {
    constructor(props) {
      const p = props || {};
      super({ type: 'kiln_heat' });
      this.props = p;
      this.type = 'kiln_heat';
      this.x = p.x; this.w = p.w || HEAT_W; this.h = HEAT_FLARE_H; this.y = p.floorY - this.h;
      this.floorY = p.floorY;
      this._placed = true;
      this.warn = Math.max(0.6, p.warn || 0.9);
      this.flare = p.flare || 0.5;
      this.age = 0; this.z = -2;
      this.owner = p.owner || null;
      this.seed = Math.random() * 100;
      this.flared = false;
    }
    get active() { return this.age >= this.warn && this.age < this.warn + this.flare; }
    update(dt) {
      this.age += dt;
      if (this.age >= this.warn && !this.flared) {
        this.flared = true;
        sfx('kiln_flare', this.x + this.w / 2, { vol: 0.7 });
        burst('spark', this.x + this.w / 2, this.floorY - 10, { count: 10, color: COL.moltenHot, speed: 380, angle: -Math.PI / 2, spread: 1.2 });
        if (G.game) G.game.shake(2.5, 0.15);
      }
      if (this.active) {
        const p = G.game && G.game.player;
        const k = clamp((this.age - this.warn) / 0.08, 0, 1);
        const zone = { x: this.x + 6, y: this.floorY - HEAT_FLARE_H * k, w: this.w - 12, h: HEAT_FLARE_H * k };
        if (p && !p.dead && overlap(zone, p)) G.Combat.hurtPlayer(1, this);
        if (G.lighting) G.lighting.add({ x: this.x + this.w / 2, y: this.floorY - 40, r: 150, color: COL.molten, intensity: 0.6, flicker: true });
      } else if (this.age < this.warn && G.lighting) {
        G.lighting.add({ x: this.x + this.w / 2, y: this.floorY - 10, r: 100 + 50 * (this.age / this.warn), color: COL.molten, intensity: 0.38 + 0.32 * (this.age / this.warn) });
      }
      if (this.age >= this.warn + this.flare + 0.45) this.remove();
    }
    draw(ctx, t) {
      const x = this.x, w = this.w, fy = this.floorY;
      if (this.age < this.warn) {
        // warning: the floor plates flash as she stamps, then glow from dull red to white-hot, heat shimmer rises
        // (QA: louder — the old 60-px glow read like the background's molten drips at 1280x720)
        const k = this.age / this.warn;
        const pulse = 0.5 + 0.5 * Math.sin(this.age * (9 + 20 * k));
        const pop = clamp(1 - this.age / 0.2, 0, 1);
        ctx.save();
        ctx.globalCompositeOperation = 'lighter';
        const gh = 84 + 20 * pop;
        const g = ctx.createLinearGradient(0, fy, 0, fy - gh);
        g.addColorStop(0, U.rgba(COL.molten, Math.min(1, (0.55 + 0.4 * k) * (0.75 + 0.25 * pulse) + 0.45 * pop)));
        g.addColorStop(0.45, U.rgba(COL.molten, (0.16 + 0.2 * k) * (0.75 + 0.25 * pulse) + 0.2 * pop));
        g.addColorStop(1, U.rgba(COL.molten, 0));
        ctx.fillStyle = g; ctx.fillRect(x, fy - gh, w, gh);
        ctx.fillStyle = U.rgba(k > 0.7 ? COL.moltenHot : COL.molten, Math.min(1, 0.6 + 0.4 * pulse + pop));
        ctx.fillRect(x + 2, fy - 6, w - 4, 6);
        // end brackets (so the section's edges read clearly)
        ctx.fillStyle = U.rgba(COL.moltenHot, 0.7 + 0.3 * pulse);
        ctx.fillRect(x, fy - 24, 4, 24); ctx.fillRect(x + w - 4, fy - 24, 4, 24);
        // seams in the plates
        ctx.fillStyle = U.rgba(COL.moltenHot, 0.45 + 0.5 * k);
        for (let i = 1; i < 4; i++) ctx.fillRect(x + (w * i) / 4 - 1, fy - 5, 2, 5);
        // rising shimmer motes
        for (let i = 0; i < 8; i++) {
          const q = ((this.age * (0.8 + k) + i * 0.13 + this.seed) % 1);
          ctx.fillStyle = U.rgba(COL.moltenHot, (0.35 + 0.45 * k) * (1 - q));
          ctx.fillRect(x + 10 + ((i * 37 + this.seed * 7) % (w - 20)), fy - 8 - q * 56, 2, 6);
        }
        ctx.restore();
        return;
      }
      // flare / cooling: the moment it stops burning the flame collapses (0.12 s) into a dull ember bed, so a burnt-out
      // section reads as safe at once (QA: a slow 0.45-s shrink looked dangerous for most of P2's step-back window)
      const fa = this.age - this.warn, cool = Math.max(0, fa - this.flare);
      const up = clamp(fa / 0.08, 0, 1), down = clamp(1 - cool / 0.12, 0, 1), emb = clamp(1 - cool / 0.45, 0, 1);
      const H = HEAT_FLARE_H * up * down;
      glow(ctx, x + w / 2, fy - H * 0.4, w * 0.9, COL.molten, 0.6 * down + 0.15 * emb);
      if (cool > 0) {
        ctx.fillStyle = U.rgba(COL.coreRed, 0.55 * emb); ctx.fillRect(x + 2, fy - 3, w - 4, 3);
        ctx.fillStyle = U.rgba('#2a1a14', 0.5 * emb);
        for (let i = 0; i < 4; i++) { const q = (cool * 1.6 + i * 0.25) % 1; ctx.fillRect(x + 16 + ((i * 41 + this.seed * 5) % (w - 32)), fy - 8 - q * 30, 3, 3); }
      }
      if (H < 0.5) return;
      ctx.save();
      for (let pass = 0; pass < 3; pass++) {
        ctx.fillStyle = pass === 0 ? '#3a1404' : pass === 1 ? COL.molten : COL.moltenHot;
        const sh = pass === 0 ? 1.06 : pass === 1 ? 1 : 0.6;
        const n = 6;
        ctx.beginPath(); ctx.moveTo(x, fy);
        for (let i = 0; i < n; i++) {
          const x0 = x + (w * i) / n, x1 = x + (w * (i + 1)) / n, xm = (x0 + x1) / 2;
          const fl = 0.7 + 0.3 * Math.sin(t * 26 + i * 1.9 + this.seed);
          const hh = H * sh * fl * (i === 0 || i === n - 1 ? 0.75 : 1);
          ctx.quadraticCurveTo(x0 + (x1 - x0) * 0.15, fy - hh * 0.6, xm + Math.sin(t * 9 + i) * 4, fy - hh);
          ctx.quadraticCurveTo(x1 - (x1 - x0) * 0.15, fy - hh * 0.6, x1, fy);
        }
        ctx.closePath(); ctx.fill();
      }
      ctx.restore();
    }
  }
  G.registerEntity('kiln_heat', KilnHeat);

  // ---------------------------------------------------------------------------------------------------------
  // Moldling: a wickless, half-formed waxen poured from her vents. Drops as a molten gob, forms, crawls to the
  // player, and lunges after a swelling gurgle (0.42 s). HP 9 (one Brand hit from L1 up), contact 1, no drops.
  // ---------------------------------------------------------------------------------------------------------
  class Moldling extends G.Enemy {
    constructor(props) {
      super(props, {
        hp: 9, w: 30, h: 26, gravity: 1, contactDamage: 1, contactInset: 4, cinders: 0, weight: 0.8, knockback: 300,
        sight: 3000, z: -1, noSpawnShift: true, meltTime: 0.45, puddleTime: 1.6,
        colors: { body: '#e08a3c', dark: '#5a2a10', hit: '#ffd27a', puddle: '#b8622a', smoke: '#5a4a44', tele: '#ffd27a' },
        light: { r: 70, color: COL.molten, intensity: 0.35, dy: -2 },
      });
      this.speed = 74 + Math.random() * 18;
    }
    init() {
      super.init();
      this.setState(this.props.drop ? 'drop' : 'form');
    }
    // a gob in flight (it arcs over her), a freshly landed puddle and a moldling slumped after its lunge are harmless
    contactRect() { return this.is('drop') || this.is('form') || (this.is('rest') && this.stateTime < 0.4) ? null : super.contactRect(); }
    think(dt) {
      const p = this.player;
      switch (this.state) {
        case 'drop':
          if (this.grounded) {
            burst('wax', this.cx, this.y + this.h, { count: 10, color: COL.molten, speed: 220, angle: -Math.PI / 2, spread: 2.4 });
            sfx('mold_splat', this.cx, { vol: 0.8 });
            this.setState('form');
          } else if (this.stateTime > 3) this.setState('form');
          break;
        case 'form':
          this.stop();
          if (this.stateTime > 0.5) this.setState('crawl');
          break;
        case 'crawl':
          if (!this.targetable(p)) { this.stop(); break; }
          const sd = this.stateData;
          if (!sd.off && p.y + p.h > this.y + this.h + 30 && this.onDeck()) {
            // on a deck above the player: walk off its nearer end (toward the player when they are past it). The
            // choice is kept until it has dropped below the deck — re-deciding at the lip (feet half over the edge)
            // made it dither there forever.
            const e = this.deckEnds(), pc = p.x + p.w / 2;
            sd.off = pc < e[0] ? -1 : pc > e[1] ? 1 : (this.cx - e[0] < e[1] - this.cx ? -1 : 1);
            sd.offY = this.y + this.h; sd.offT = 0;
          }
          if (sd.off) {
            sd.offT += dt;
            if (this.y + this.h > sd.offY + 12 || sd.offT > 4) sd.off = 0;
          }
          if (sd.off) {
            this.facing = sd.off;
            if (this.charge(this.speed, { dir: sd.off, ledges: false })) sd.off = -sd.off;
          } else if (this.motherBusy() && this.dist() < 130 && Math.abs(this.dy()) < 70) {
            this.face(p); this.stop();   // the brood waits at arm's length while their mother's attack pins the player
          } else {
            this.face(p);
            this.approach(p, this.speed, { stop: 8 });
          }
          if (this.dist() < 150 && Math.abs(this.dy()) < 70 && this.ready('lunge') && !this.motherBusy()) this.setState('wind');
          break;
        case 'wind': {
          this.stop();
          if (this.once('t')) { this.stateData.w = this.telegraph(0.45, { sound: 'mold_gurgle', vol: 0.8, shake: 1.2 }); this.face(p); }
          // their mother just began a pinning attack (breath / heat / grate): swallow the lunge and wait
          if (this.stateTime < this.stateData.w - 0.08 && this.motherBusy()) { this.tele = null; this.cooldown('lunge', 0.5); this.setState('crawl'); break; }
          if (this.stateTime >= this.stateData.w) {
            const dir = this.facing;
            this.hop(dir * 280, -480, true);
            sfx('mold_hop', this.cx, { vol: 0.8 });
            this.setState('hop');
          }
          break;
        }
        case 'hop':
          if (this.grounded && this.stateTime > 0.08) {
            this.cooldown('lunge', 1.4);
            burst('wax', this.cx, this.y + this.h, { count: 5, color: COL.molten, speed: 160, angle: -Math.PI / 2, spread: 2 });
            this.setState('rest');
          } else if (this.stateTime > 2) this.setState('rest');
          break;
        case 'rest':
          this.stop();
          if (this.stateTime > 0.55) this.setState('crawl');
          break;
        default: this.setState('crawl');
      }
    }
    /** the brood waits while their mother's attack pins the player (the jet forbids jumping, the heat forbids standing) */
    motherBusy() {
      const m = this.props.summoner;
      if (m && !m.dead && (m.is('breath') || m.is('heat') || m.is('grate'))) return true;
      return !!this.room && this.room.entities.some((e) => e.type === 'kiln_heat' && !e.dead && e.age < e.warn + e.flare);
    }
    onDeck() {
      if (!this.grounded || !this.room) return false;
      const r = Math.floor((this.y + this.h + 2) / TILE), P = G.T.PLATFORM;
      return this.room.tileAt(Math.floor((this.x + 2) / TILE), r) === P || this.room.tileAt(Math.floor((this.x + this.w - 2) / TILE), r) === P;
    }
    deckEnds() {
      const r = Math.floor((this.y + this.h + 2) / TILE), room = this.room;
      let c0 = Math.floor(this.cx / TILE);
      if (room.tileAt(c0, r) !== G.T.PLATFORM) c0 = Math.floor((room.tileAt(Math.floor((this.x + 2) / TILE), r) === G.T.PLATFORM ? this.x + 2 : this.x + this.w - 2) / TILE);
      let c1 = c0;
      while (c0 > 0 && room.tileAt(c0 - 1, r) === G.T.PLATFORM) c0--;
      while (c1 < room.cols - 1 && room.tileAt(c1 + 1, r) === G.T.PLATFORM) c1++;
      return [c0 * TILE, (c1 + 1) * TILE];
    }
    drawBody(ctx, t) {
      const ch = C();
      const x = this.cx, fy = this.y + this.h, f = this.facing;
      if (this.is('drop')) {
        // a falling molten gob, stretched by the fall
        if (this.landX != null) {
          const k = clamp(this.stateTime / (this.flight || 1), 0, 1), R = 26 * (1.3 - 0.3 * k);
          ctx.save(); ctx.globalCompositeOperation = 'lighter';
          ctx.strokeStyle = U.rgba(COL.molten, 0.5 + 0.35 * Math.sin(this.stateTime * 18)); ctx.lineWidth = 3;
          ctx.beginPath(); ctx.ellipse(this.landX, this.landY - 2, R, R * 0.28, 0, 0, TAU); ctx.stroke();
          ctx.restore();
        }
        const s = clamp(Math.abs(this.vy) / 700, 0, 1);
        glow(ctx, x, fy - 14, 34, COL.molten, 0.5);
        ctx.fillStyle = '#3a1404';
        ctx.beginPath(); ctx.ellipse(x, fy - 14, 12 - s * 2, 14 + s * 10, 0, 0, TAU); ctx.fill();
        ctx.fillStyle = COL.molten;
        ctx.beginPath(); ctx.ellipse(x, fy - 14, 10 - s * 2, 12 + s * 10, 0, 0, TAU); ctx.fill();
        ctx.fillStyle = COL.moltenHot;
        ctx.beginPath(); ctx.ellipse(x - 2, fy - 18, 4, 6 + s * 4, 0, 0, TAU); ctx.fill();
        return;
      }
      let rise = 1;
      if (this.is('form')) rise = clamp(this.stateTime / 0.45, 0.15, 1);
      const tele = this.telegraphing ? clamp(this.tele.t / this.tele.dur, 0, 1) : 0;
      const wob = Math.sin(t * 10 + this.seed) * (this.is('crawl') ? 1 : 0.3);
      const slump = this.is('rest') ? clamp(1 - this.stateTime / 0.4, 0, 1) : 0;
      const sw = 1 + tele * 0.22 + slump * 0.25, sh = rise * (1 - tele * 0.12 - slump * 0.35) + (this.is('hop') ? 0.15 : 0);
      const W = 17 * sw, H = 25 * sh;
      if (ch) ch.shadow(ctx, x, fy, 16, 0.4);
      const path = new Path2D();
      path.moveTo(x - W - 3, fy);
      path.bezierCurveTo(x - W - 2, fy - H * 0.6 + wob, x - W * 0.6, fy - H, x - 2 * f, fy - H + wob * 0.5);
      path.bezierCurveTo(x + W * 0.5, fy - H - 2, x + W + 2, fy - H * 0.55 - wob, x + W + 3, fy);
      // lumpy hem
      path.quadraticCurveTo(x + W * 0.5, fy + 3, x, fy);
      path.quadraticCurveTo(x - W * 0.5, fy + 3, x - W - 3, fy);
      path.closePath();
      const body = mixc('#d8803a', COL.moltenHot, tele * 0.6);
      if (ch) ch.shape(ctx, path, { fill: body, box: [x - W, fy - H, x + W, fy], light: -1, shade: 0.5, rim: COL.moltenHot, rimWidth: 2, hi: 0.3, lw: 2, outline: COL.outline });
      else { ctx.fillStyle = body; ctx.fill(path); }
      // crust patches and a molten crack
      ctx.fillStyle = '#6a3414'; ctx.globalAlpha *= 0.6;
      ctx.beginPath(); ctx.ellipse(x - W * 0.4, fy - H * 0.35, 5, 3, 0.3, 0, TAU); ctx.fill();
      ctx.beginPath(); ctx.ellipse(x + W * 0.45, fy - H * 0.2, 4, 2.5, -0.2, 0, TAU); ctx.fill();
      ctx.globalAlpha /= 0.6;
      // the empty wick socket (no wick: never lit)
      ctx.fillStyle = COL.outline;
      ctx.beginPath(); ctx.ellipse(x - 2 * f, fy - H + 3, 3, 1.6, 0, 0, TAU); ctx.fill();
      if (rise > 0.6) {
        // dark sockets with ember pupils (never lit: no wick, only the heat inside)
        const ey = fy - H * 0.58, bl = ch && ch.blinkAt ? ch.blinkAt(t, this.seed, 3) : 0;
        for (const ex of [x + f * 1, x + f * 10]) {
          ctx.fillStyle = COL.outline;
          ctx.beginPath(); ctx.ellipse(ex, ey, 3.6, 4.2 * (1 - bl * 0.8), 0, 0, TAU); ctx.fill();
          ctx.fillStyle = tele > 0.3 ? COL.white : COL.ember;
          ctx.beginPath(); ctx.ellipse(ex + f * 0.8, ey + 0.5, 1.7, 2.1 * (1 - bl * 0.8), 0, 0, TAU); ctx.fill();
        }
        glow(ctx, x + f * 5, ey, 12, COL.ember, 0.35);
      }
      glow(ctx, x, fy - H * 0.5, 30, COL.molten, 0.25 + 0.4 * tele);
    }
  }
  G.registerEnemy('kiln_moldling', Moldling);

  // ---------------------------------------------------------------------------------------------------------
  // The boss
  // ---------------------------------------------------------------------------------------------------------
  const WAKE_TIME = 1.5;
  class KilnMother extends G.Boss {
    constructor(props) {
      super(props, {
        hp: 620, w: BODY_W, h: BODY_H, physics: 'manual', gravity: 0,
        contactDamage: 1, contactInset: 12, noSpawnShift: true,
        phases: [0.5],
        stagger: { damage: 150, time: 2.3 },
        rest: [0.5, 0.95], phaseRest: [1, 0.74],
        introTime: 0.6,
        defeatStyle: 'custom', slowmo: 1.0,
        hitSound: 'boss_hit',
        z: -3,
        colors: { body: COL.wax, dark: COL.iron, hit: COL.moltenHot, puddle: '#a8763e', smoke: COL.smoke, tele: '#ffd27a' },
        attacks: {
          pour: { weight: function (d) { return d > 260 ? 3 : 1.6; }, cooldown: 1.0 },
          lob: { weight: function (d) { return d > 300 ? 3 : 1.2; }, cooldown: 2.2 },
          heat: { weight: 2.2, cooldown: 5.5, when: function () { return this.frontSpan() > HEAT_W * 2.2; } },
          sweep: { weight: 5, cooldown: 1.2, when: function () { return this.playerFrontDist() < SWEEP_REACH - 20 && this.playerLow(); } },
          slam: { weight: function () { return this.playerOnDeckNear() ? 7 : this.playerLow() ? 0.4 : 2; }, cooldown: 1.4, when: function () { return this.playerFrontDist() < SLAM_REACH - 10 && this.playerInFront(); } },
          brood: { weight: 1.6, cooldown: 11, when: function () { return this.liveMinions() < MOLD_CAP && this.A && this.A.vents.length > 0; } },
          breath: { phase: 2, weight: function () { return this.playerHigh() ? 5 : 1.4; }, cooldown: 4.5, when: function () { return this.playerInFront() && this.playerFrontDist() < BREATH_REACH + 200; } },
          grate: { phase: 99, weight: 0, uninterruptible: true },
        },
      });
      this.pz = pose(POSES.dormant);
      this.target = pose(POSES.dormant);
      this.poseRate = 6;
      this.grate = 0;
      this.cool = 0;
      this.coreHitT = 0;
      this.ventGlow = 0;
      this.camBias = 0;
      this.introT = 0;
      this._woke = false;
      this.facing = -1;
      this.heats = [];
      this.breathOn = 0;
      this.turnT = 0;
    }
    init() {
      super.init();
      const room = this.room;
      this.A = arenaGeom(room, this.cx, this.w);
      this.x = this.A.homeX;
      this.y = this.A.floorY - this.h;
      this.home = { x: this.cx, y: this.cy };
      this.facing = -1;
      if (this.arena && G.game && G.game.lockPlayer) { G.game.lockPlayer('kiln_intro'); this._locked = true; }
    }

    // ---------------------------------------------------------------- geometry helpers
    get front() { return this.facing < 0 ? this.x : this.x + this.w; }
    get feetY() { return this.y + this.h; }
    /** horizontal distance from her front face to the player (negative = behind the front face). */
    playerFrontDist() { const p = this.player; if (!p) return 999; const pc = p.x + p.w / 2; return (pc - this.front) * this.facing; }
    playerInFront() { return this.playerFrontDist() > -10; }
    playerLow() { const p = this.player; return !!p && p.y + p.h > this.feetY - 70; }
    playerHigh() { const p = this.player; return !!p && p.y + p.h < this.feetY - 100; }
    playerOnDeckNear() {
      const p = this.player; if (!p) return false;
      const feet = p.y + p.h;
      return feet < this.feetY - 100 && this.playerFrontDist() < SLAM_REACH && this.playerInFront();
    }
    /** width of open floor in front of her (heat sections) */
    frontSpan() { return this.facing < 0 ? this.x - this.A.west : this.A.east - (this.x + this.w); }
    toWorld(lx, ly) { return { x: this.cx + lx * this.facing, y: this.feetY + ly }; }
    /** current core rect (world) from the pose */
    coreRect() {
      const S = skeleton(this.pz);
      const c = this.toWorld(S.core[0], S.core[1]);
      return { x: c.x - 52, y: c.y - 52, w: 104, h: this.is('stagger') ? 124 : 104 };
    }
    eye() { const S = skeleton(this.pz); return this.toWorld(S.head[0] + 14, S.head[1] - 6); }
    teleAnchor() { const c = this.coreRect(); return { x: c.x + c.w / 2, y: c.y + c.h / 2 }; }
    contactRect() {
      if (this.dying || this.hidden || this.contactGrace) return null;
      // the furnace body and skirt (her ladles and head are art only); inset at her front only — her back stands against
      // the forge wall, and a back inset would leave a sliver a player could stand in untouched
      const i = this.cfg.contactInset;
      return { x: this.facing < 0 ? this.x + i : this.x, y: this.y + 60, w: this.w - i, h: this.h - 60 };
    }
    hurtRect() {
      if (this.dying || this.hidden) return null;
      return { x: this.x, y: this.y - 20, w: this.w, h: this.h + 20 };
    }
    drawBounds() { return { x: this.cx - 380, y: this.feetY - 560, w: 760, h: 590 }; }

    // ---------------------------------------------------------------- pose
    want(name, rate) { const src = typeof name === 'string' ? POSES[name] : name; if (src) { this.target = src; this.poseRate = rate || 8; } }
    animate(dt) {
      const k = this.poseRate;
      for (const key of POSE_KEYS) this.pz[key] = damp(this.pz[key], this.target[key], k, dt);
      // phase 2 keeps the core blazing
      if (this.grate > 0) this.pz.core = Math.max(this.pz.core, 0.75);
      if (this.coreHitT > 0) this.coreHitT -= dt;
      this.ventGlow = Math.max(0, this.ventGlow - dt * 1.6);
      if (this.turnT > 0) this.turnT = Math.max(0, this.turnT - dt);
    }
    /** world position of the front ladle bowl */
    bowl() { const S = skeleton(this.pz); return this.toWorld(S.F.b[0], S.F.b[1]); }

    // ---------------------------------------------------------------- damage
    attackRectOf(hit) {
      if (!hit) return null;
      const p = G.game && G.game.player;
      if (hit.kind === 'nail') return p && p.slash && p.slash.rect ? p.slash.rect : (p ? { x: p.x - 40, y: p.y, w: p.w + 80, h: p.h } : null);
      const s = hit.source;
      if (s && s.w != null) return { x: s.x, y: s.y, w: s.w, h: s.h };
      return null;
    }
    coreOpen() { return this.grate > 0.5 || this.is('stagger'); }
    modifyDamage(dmg, hit) {
      this._coreHit = false;
      if (this.coreOpen()) {
        const r = this.attackRectOf(hit);
        if (r && overlap(r, this.coreRect())) { this._coreHit = true; return Math.round(dmg * CORE_MULT); }
      }
      return dmg;
    }
    onHurt(hit, dmg) {
      void hit;
      if (this._coreHit) {
        this.coreHitT = 0.25;
        const c = this.coreRect();
        burst('spark', c.x + c.w / 2, c.y + c.h / 2, { count: 12, color: COL.white, speed: 520 });
        burst('ring', c.x + c.w / 2, c.y + c.h / 2, { r: 70, color: COL.moltenHot, width: 4, life: 0.25 });
        sfx('kiln_core', this.cx, { vol: 0.9 });
      } else {
        burst('spark', this.cx - this.facing * 0, this.cy, { count: 3, color: COL.moltenHot, speed: 200 });
      }
      void dmg;
    }

    // ---------------------------------------------------------------- camera: keep her face in view
    updateCam(dt, focus) {
      const cam = G.camera, p = G.game && G.game.player;
      if (!cam || !p || !this.room || p.room !== this.room) return;
      const pcx = p.x + p.w / 2;
      let want;
      if (focus) want = (this.front - this.facing * 420) - pcx;               // intro: frame her
      else {
        // lean toward her so her front (+ a margin) is in view while the player stays >= 200 px inside
        const need = this.facing < 0 ? (this.front + 170 - 640) - pcx : (this.front - 170 + 640) - pcx;
        want = this.facing < 0 ? clamp(need, 0, 440) : clamp(need, -440, 0);
      }
      this.camBias = damp(this.camBias, want, focus ? 2.2 : 3.2, dt);
      if (!this._cam) {
        const self = this;
        const pl = () => (G.game && G.game.player) || null;
        this._cam = {
          isKilnCam: true,
          get x() { const q = pl(); return q ? q.x + (self.camBias || 0) : 0; },
          get y() { const q = pl(); return q ? q.y : 0; },
          get w() { const q = pl(); return q ? q.w : 26; },
          get h() { const q = pl(); return q ? q.h : 54; },
          get motor() { return null; },
          get facing() { const q = pl(); return q ? q.facing : 1; },
          get vx() { const q = pl(); return q && q.motor ? q.motor.vx : 0; },
          get vy() { const q = pl(); return q && q.motor ? q.motor.vy : 0; },
          get room() { const q = pl(); return q ? q.room : null; },
        };
      }
      if (cam.target === p) cam.follow(this._cam);
    }
    releaseCam() { if (this._cam && G.camera && G.camera.target === this._cam) G.camera.follow(G.game && G.game.player); }
    unlock() { if (this._locked) { this._locked = false; if (G.game && G.game.unlockPlayer) G.game.unlockPlayer('kiln_intro'); } }
    remove() { this.releaseCam(); this.unlock(); super.remove(); }
    onRoomExit() { this.releaseCam(); this.unlock(); if (super.onRoomExit) super.onRoomExit(); }

    // ---------------------------------------------------------------- per-step extras (lights, cam, pose)
    lights() {
      if (!G.lighting) return;
      const c = this.coreRect(), hot = 1 - this.cool;
      if (hot <= 0.01) return;
      G.lighting.add({ x: c.x + c.w / 2, y: c.y + c.h / 2, r: 300 + 120 * this.grate, color: COL.molten, intensity: (0.55 + 0.25 * this.pz.core) * hot, flicker: true });
      G.lighting.add({ x: this.cx, y: this.feetY - 40, r: 220, color: COL.coreRed, intensity: 0.35 * hot * (0.5 + this.pz.mouth) });
      const b = this.bowl();
      G.lighting.add({ x: b.x, y: b.y, r: 120, color: COL.molten, intensity: 0.4 * hot });
    }
    /** defeat timeline runs this every step (instead of the base's gravity settle): keep animating */
    settle(dt) { this.animate(dt); if (!this._camDone) this.updateCam(dt, true); }   // frame her while the kiln goes cold
    tick(dt) {
      this.animate(dt);
      // molten drips from the ladle — she cannot stop pouring
      if (this.cool < 0.5 && Math.random() < dt * (2 + 6 * this.pz.pour)) {
        const b = this.bowl();
        burst('drip', b.x + this.facing * 20, b.y + 10, { count: 1, color: COL.molten });
      }
    }

    // ---------------------------------------------------------------- fight start: she wakes, then speaks
    beginFight() {
      if (this._woke) return super.beginFight();
      this._beginQueued = true;
    }
    introUpdate(dt) {
      this.tick(dt);
      this.introT += dt;
      const t = this.introT;
      this.updateCam(dt, t < WAKE_TIME + 0.4 || !this.fightStarted);
      if (t < 0.5) this.want('dormant', 4);
      else if (t < WAKE_TIME) {
        if (!this._stopped) { this._stopped = true; sfx('kiln_gurgle', this.cx, { vol: 0.8 }); }
        this.want('wake', 2.6);
      } else if (!this._woke) {
        this._woke = true;
        if (this._beginQueued || (!this.arena && !this.props.noAutoStart)) super.beginFight();
      }
      if (this.fightStarted) this.want('roar', 6);
      if (this.fightStarted) this.unlock();
    }
    onFightStart() {
      this.unlock();
      this.want('roar', 7);
      burst('ember', this.cx, this.feetY - 200, { count: 20, color: COL.moltenHot, speed: 260 });
    }
    idleUpdate(dt) {
      this.tick(dt);
      this.updateCam(dt, false);
      this.want('idle', 4);
      // turn to face the player (a colossus turns heavily: brief shudder)
      const p = this.player;
      if (p && this.targetable(p)) {
        const pc = p.x + p.w / 2;
        const want = pc < this.cx - 30 ? -1 : pc > this.cx + 30 ? 1 : this.facing;
        // only turn toward real floor (a player inside her body against the forge wall must not turn her to face the wall)
        const room = want > 0 ? this.A.east - (this.x + this.w) : this.x - this.A.west;
        if (want !== this.facing && this.turnT <= 0 && room >= 120) {
          this.facing = want; this.turnT = 0.35;
          sfx('kiln_creak', this.cx, { vol: 0.6, pitch: 0.8 });
          if (G.game) G.game.shake(3, 0.2);
        }
      }
    }
    staggerUpdate(dt) { this.tick(dt); this.updateCam(dt, false); this.want('slump', 7); }
    onStagger() {
      this.breathOn = 0;
      burst('wax', this.cx, this.feetY - 180, { count: 16, color: COL.molten, speed: 300 });
      sfx('kiln_clang', this.cx, { vol: 0.8 });
    }
    onStaggerEnd() { sfx('kiln_gurgle', this.cx, { vol: 0.7 }); }
    onInterrupt() { this.breathOn = 0; }
    onAttackStart() { this.breathOn = 0; }

    // ---------------------------------------------------------------- phase 2: the grate bursts open
    onPhase(phase) {
      if (phase >= 2 && !this._grateDone) {
        if (G.clearProjectiles) G.clearProjectiles(this.room);
        this.startAttack('grate');
      } else super.onPhase(phase);
    }
    atk_grate(dt, s) {
      this.tick(dt); this.updateCam(dt, false);
      if (s < 0.9) this.want('clutch', 6);
      if (this.once('groan')) { sfx('kiln_gurgle', this.cx, { vol: 1, pitch: 0.7 }); sfx('kiln_creak', this.cx, { vol: 0.9 }); }
      if (s < 0.9 && this.every(0.12)) { const c = this.coreRect(); burst('spark', c.x + c.w / 2, c.y + c.h / 2, { count: 4, color: COL.moltenHot, speed: 260 }); }
      if (this.at(0.9)) {
        this._grateDone = true;
        this.grate = 1;
        const c = this.coreRect(), x = c.x + c.w / 2, y = c.y + c.h / 2;
        sfx('kiln_grate', this.cx, { vol: 1 });
        burst('flash', x, y, { r: 260, color: COL.white, life: 0.35 });
        burst('ring', x, y, { r: 300, color: COL.moltenHot, width: 6, life: 0.5 });
        burst('wax', x, y, { count: 30, color: COL.molten, speed: 520 });
        burst('spark', x, y, { count: 30, color: COL.white, speed: 700 });
        if (G.game) { G.game.shake(12, 0.6); G.game.flash('rgba(255,210,140,0.45)', 0.25); }
        if (G.Audio && typeof G.Audio.musicLayer === 'function') { try { G.Audio.musicLayer(1); } catch (e) { G.reportError(e, 'musicLayer'); } }
      }
      if (s >= 0.9 && s < 2.0) this.want('roar', 6);
      if (this.at(1.15)) { sfx('boss_roar', this.cx, { vol: 0.9, pitch: 0.85 }); if (G.game) G.game.shake(8, 0.6); }
      if (s > 2.1) this.endAttack(0.5);
    }

    // ---------------------------------------------------------------- attacks
    windup(dur, sound, o) {
      return this.telegraph(dur, Object.assign({ sound, vol: 1, shake: 2.2, color: '#ffd27a' }, o || {}));
    }
    p2() { return this.phase >= 2; }
    /** strike id unique to this attack instance (G.Combat hits a target once per id) */
    sid(name) { return 'km' + this.uid + ':' + this.attackCount + ':' + name; }

    /** POUR: raises the great ladle and pours; a molten wave rolls out along the floor (P2: two). */
    atk_pour(dt, s) {
      this.tick(dt); this.updateCam(dt, false);
      const sd = this.stateData;
      if (this.once('t')) { sd.w = this.windup(this.p2() ? 0.55 : 0.64, 'kiln_gurgle'); this.want('pourRaise', 7); sd.waves = this.p2() ? 2 : 1; sd.n = 0; }
      if (s >= sd.w - 0.12 && s < sd.w + 0.3) this.want('pourTip', 10);
      if (this.at(sd.w)) sfx('kiln_pour', this.cx, { vol: 1 });
      if (sd.waves > 1) {
        // P2: she lifts the ladle (the stream stops), gurgles, and tips it again — the second wave is announced
        const t2 = sd.w + POUR_GAP;
        if (this.at(t2 - 0.5)) { this.want('pourRaise', 8); this.telegraph(0.5, { sound: 'kiln_gurgle', vol: 0.8, shake: 1.5, color: '#ffd27a' }); }
        if (s >= t2 - 0.12 && s < t2 + 0.3) this.want('pourTip', 10);
        if (this.at(t2)) sfx('kiln_pour', this.cx, { vol: 0.9 });
      }
      for (let i = 0; i < sd.waves; i++) {
        if (this.at(sd.w + 0.12 + i * POUR_GAP)) {
          const b = this.bowl();
          const x0 = b.x + this.facing * 26;
          this.fire('kiln_wave', { x: x0, y: this.feetY, dir: this.facing, speed: this.p2() ? 430 : 380, w: 50, h: 60, sound: 'kiln_wave', vol: 0.9 });
          burst('wax', x0, this.feetY - 8, { count: 10, color: COL.molten, speed: 260, angle: -Math.PI / 2, spread: 2 });
          if (G.game) G.game.shake(3, 0.2);
        }
      }
      // the stream itself burns (standing under the ladle's lip) while it pours
      if (s >= sd.w && s < sd.w + 0.25 + (sd.waves - 1) * POUR_GAP && this.pz.pour > 0.5) {
        const b = this.bowl();
        this.strike({ x: b.x + this.facing * 26 - 16, y: b.y, w: 32, h: this.feetY - b.y }, { id: this.sid('stream') });
      }
      const end = sd.w + 0.35 + (sd.waves - 1) * POUR_GAP;
      if (s >= end) this.want('sag', 4);
      if (s >= end + 0.55) this.endAttack();
    }

    /** LOB: scoops molten slag from her chest and flings 3 (P2: 5) gobs onto marked spots around the player. */
    atk_lob(dt, s) {
      this.tick(dt); this.updateCam(dt, false);
      const sd = this.stateData;
      if (this.once('t')) { sd.w = this.windup(this.p2() ? 0.5 : 0.58, 'kiln_scoop'); this.want('scoop', 7); }
      if (s >= sd.w - 0.06 && s < sd.w + 0.5) this.want('fling', 12);
      if (this.at(sd.w + 0.08)) {
        sfx('kiln_fling', this.cx, { vol: 1 });
        this.throwSlag(this.p2() ? 5 : 3);
      }
      if (s >= sd.w + 0.5) this.want('sag', 4);
      if (s >= sd.w + 1.0) this.endAttack();
    }
    throwSlag(n) {
      const p = this.player; if (!p) return;
      const A = this.A;
      const pc = p.x + p.w / 2 + (p.motor ? p.motor.vx : 0) * 0.25;
      const lo = this.facing < 0 ? A.west + 24 : this.x + this.w + 30, hi = this.facing < 0 ? this.x - 30 : A.east - 24;
      const gap = 150;
      const spots = [];
      const k0 = -Math.floor((n - 1) / 2) - (n % 2 === 0 && Math.random() < 0.5 ? 1 : 0);
      for (let i = 0; i < n; i++) spots.push(clamp(pc + (k0 + i) * gap + rnd(-12, 12), lo, hi));
      const b = this.bowl();
      const g = 1250, y0 = b.y - 10;
      const room = this.room, ceil = this.A.ceilY + 30;
      spots.forEach((x, i) => {
        const ly = surfaceAt(A, x);
        // highest arc that stays clear of the vault: rise h above the release point, varied per gob so they land in sequence
        const h = Math.max(24, (y0 - ceil) * (0.62 + 0.38 * ((i * 2 + 1) % n) / n));
        const vy = -Math.sqrt(2 * g * h);
        const time = (-vy + Math.sqrt(vy * vy + 2 * g * Math.max(0, ly - y0))) / g;
        G.spawnProjectile(room, 'kiln_slag', { x: b.x, y: y0, vx: (x - b.x) / time, vy, gravity: g, landX: x, landY: ly, flight: time, owner: this });
      });
    }

    /** HEAT: stokes her furnace and stamps; floor sections glow (warning) then flare (P2: a second, offset set). */
    atk_heat(dt, s) {
      this.tick(dt); this.updateCam(dt, false);
      const sd = this.stateData;
      if (this.once('t')) { sd.w = this.windup(0.5, 'kiln_heat'); this.want('stoke', 6); }
      if (this.at(sd.w)) {
        this.want('stamp', 12);
        sfx('kiln_slam', this.cx, { vol: 0.6, pitch: 1.3 });
        if (G.game) G.game.shake(5, 0.25);
        const warn = this.p2() ? 0.82 : 0.95;
        sd.set = this.heatSet(0, warn);
        if (this.p2()) sd.second = true;
      }
      if (sd.second && this.at(sd.w + 0.95)) this.heatSet(1, HEAT_WARN2);
      if (s >= sd.w + 0.5) this.want('sag', 3);
      const end = sd.w + (sd.second ? 2.3 : 1.4);
      if (s >= end) this.endAttack();
    }
    /** Spawn one alternating set of heated sections over the floor in front of her. which: 0 = on the player, 1 = the gaps. */
    heatSet(which, warn) {
      const A = this.A, p = this.player;
      const lo = this.facing < 0 ? A.west : this.x + this.w + 10, hi = this.facing < 0 ? this.x - 10 : A.east;
      const pc = p ? p.x + p.w / 2 : (lo + hi) / 2;
      const period = HEAT_W * 2;
      if (which === 0 || this._heatBase == null) this._heatBase = pc - HEAT_W / 2 + rnd(-HEAT_W * 0.3, HEAT_W * 0.3);
      const base = this._heatBase + (which ? HEAT_W : 0);
      const out = [];
      let x = base - Math.ceil((base - lo) / period) * period;
      for (; x < hi; x += period) {
        const x0 = Math.max(lo, x), x1 = Math.min(hi, x + HEAT_W);
        if (x1 - x0 < 50) continue;
        const e = new KilnHeat({ x: x0, w: x1 - x0, floorY: A.floorY, warn, flare: 0.5, owner: this });
        this.room.add(e);
        out.push(e);
      }
      return out;
    }

    /** SWEEP: draws the ladle back and sweeps it along the floor in front (P2: and back again). Jump it or back off. */
    atk_sweep(dt, s) {
      this.tick(dt); this.updateCam(dt, false);
      const sd = this.stateData;
      if (this.once('t')) { sd.w = this.windup(this.p2() ? 0.52 : 0.56, 'kiln_scrape'); this.want('sweepBack', 7); sd.n = this.p2() ? 2 : 1; }
      for (let i = 0; i < sd.n; i++) {
        const t0 = sd.w + i * SWEEP_GAP;
        if (i > 0 && this.at(t0 - SWEEP_TELE2)) { this.telegraph(SWEEP_TELE2, { sound: 'kiln_scrape', vol: 0.8, shake: 2 }); this.want('sweepBack', 10); }
        if (this.at(t0)) { this.want('sweepThru', 16); sfx('kiln_sweep', this.cx, { vol: 1 }); }
        if (s >= t0 + 0.03 && s < t0 + 0.27) {
          // the hitbox reaches as far as the ladle bowl (+ its spray), so it never lands before the ladle does
          const f = this.front, reach = clamp((this.bowl().x - f) * this.facing + 44, 40, SWEEP_REACH);
          const r = this.facing < 0 ? { x: f - reach, y: this.feetY - SWEEP_H, w: reach + 30, h: SWEEP_H } : { x: f - 30, y: this.feetY - SWEEP_H, w: reach + 30, h: SWEEP_H };
          this.strike(r, { id: this.sid('sweep' + i), dir: { x: this.facing, y: -0.3 } });
          if (this.every(0.03)) {
            const b = this.bowl();
            burst('spark', b.x, this.feetY - 4, { count: 3, color: COL.moltenHot, speed: 300, angle: -Math.PI / 2 - this.facing * 0.6, spread: 0.8 });
            burst('wax', b.x, this.feetY - 10, { count: 4, color: COL.molten, speed: 420, angle: this.facing < 0 ? Math.PI + 0.25 : -0.25, spread: 0.35 });
          }
        }
      }
      const end = sd.w + (sd.n - 1) * SWEEP_GAP + 0.3;
      if (s >= end) this.want('sag', 4);
      if (s >= end + 0.62) this.endAttack();
    }

    /** SLAM: heaves the ladle overhead and brings it down on the deck end and the floor below (P2: + a wave). */
    atk_slam(dt, s) {
      this.tick(dt); this.updateCam(dt, false);
      const sd = this.stateData;
      if (this.once('t')) { sd.w = this.windup(this.p2() ? 0.66 : 0.72, 'kiln_creak'); this.want('slamUp', 5); }
      if (s >= sd.w - 0.05) this.want('slamDown', 18);
      if (this.at(sd.w + 0.1)) {
        sfx('kiln_slam', this.cx, { vol: 1 });
        if (G.game) G.game.shake(11, 0.4);
        const b = this.bowl();
        burst('spark', b.x, b.y + 20, { count: 18, color: COL.moltenHot, speed: 480 });
        burst('wax', b.x, b.y + 20, { count: 14, color: COL.molten, speed: 340 });
        burst('dust', b.x, this.feetY - 4, { count: 10, color: '#8a6a50' });
        if (this.p2()) this.fire('kiln_wave', { x: this.front + this.facing * (SLAM_REACH - 20), y: this.feetY, dir: this.facing, speed: 400, w: 40, h: 44, sound: 'kiln_wave', vol: 0.8 });
      }
      if (s >= sd.w + 0.06 && s < sd.w + 0.2) this.strike(this.slamRect(), { id: this.sid('slam'), dir: { x: this.facing, y: 0.4 } });
      if (s >= sd.w + 0.5) this.want('sag', 3);
      if (s >= sd.w + 1.25) this.endAttack();
    }
    slamRect() {
      // the ladle's path from overhead down to deck level (the bowl bottoms out ~165 px above her feet): a player on the
      // floor below never sees it reach them, so it must not hurt them there
      const f = this.front, top = this.feetY - 240, w = SLAM_REACH - SLAM_NEAR, h = 240 - SLAM_LOW;
      return this.facing < 0 ? { x: f - SLAM_REACH, y: top, w, h } : { x: f + SLAM_NEAR, y: top, w, h };
    }

    /** BROOD: raises her back ladle to the vents and bangs her furnace; moldlings drop from the vents (cap 3). */
    atk_brood(dt, s) {
      this.tick(dt); this.updateCam(dt, false);
      const sd = this.stateData;
      if (this.once('t')) { sd.w = this.windup(0.6, 'kiln_call'); this.want('call', 6); }
      if (s < sd.w + 0.4) this.ventGlow = Math.min(1, s / Math.max(0.1, sd.w));
      if (this.at(sd.w)) { this.want('callBang', 14); sfx('kiln_clang', this.cx, { vol: 0.8, pitch: 0.8 }); if (G.game) G.game.shake(4, 0.2); }
      if (this.at(sd.w + 0.12)) {
        const n = Math.min(this.p2() ? 2 : 1, MOLD_CAP - this.liveMinions());   // phase 1: one at a time
        const vents = this.A.vents.slice();
        for (let i = 0; i < n; i++) {
          const v = vents[i % vents.length];
          // spat from the vent in an arc over her shoulders, onto a marked spot in front of her
          const tx = clamp(this.front + this.facing * (110 + i * 150), this.A.west + 40, this.A.east - 40);
          const m = this.summon('kiln_moldling', v.x, v.y + 30, { drop: true });
          if (m) {
            const g = G.CONST.GRAVITY * (m.cfg.gravity == null ? 1 : m.cfg.gravity);
            const ly = surfaceAt(this.A, tx);
            const vv = G.Enemy.solveArcTime(tx - m.cx, ly - (m.y + m.h), g, 0.85 + i * 0.1);
            m.vx = vv.vx; m.vy = vv.vy; m.landX = tx; m.landY = ly; m.flight = 0.85 + i * 0.1;
          }
          burst('wax', v.x, v.y, { count: 6, color: COL.molten, speed: 140, angle: Math.PI / 2, spread: 1 });
        }
        sfx('mold_splat', this.A.vents[0].x, { vol: 0.7, pitch: 0.8 });
      }
      if (s >= sd.w + 0.45) this.want('sag', 4);
      if (s >= sd.w + 0.95) this.endAttack();
    }

    /** BREATH (P2): rears back, the open core blazes, then a jet of fire at chest height (stay on the floor). */
    atk_breath(dt, s) {
      this.tick(dt); this.updateCam(dt, false);
      const sd = this.stateData;
      if (this.once('t')) {
        sd.w = this.windup(0.72, 'kiln_inhale');
        this.want('rear', 5);
      }
      if (this.at(sd.w)) { this.want('breathe', 14); sfx('kiln_breath', this.cx, { vol: 1 }); if (G.game) G.game.shake(6, 0.7); }
      const act = 0.7;
      if (s >= sd.w && s < sd.w + act) {
        this.breathOn = clamp((s - sd.w) / 0.12, 0, 1) * clamp((sd.w + act - s) / 0.12, 0, 1);
        this.strike(this.breathRect(clamp((s - sd.w) / 0.15, 0.3, 1)), { id: this.sid('breath') });
        if (this.every(0.05)) {
          const c = this.coreRect();
          burst('ember', c.x + c.w / 2 + this.facing * 60, c.y + c.h / 2, { count: 3, color: COL.moltenHot, speed: 500, angle: this.facing < 0 ? Math.PI : 0, spread: 0.3 });
        }
      } else this.breathOn = 0;
      if (s >= sd.w + act) this.want('sag', 3);
      if (s >= sd.w + act + 0.75) this.endAttack();
    }
    breathRect(k) {
      const c = this.coreRect(), cy = this.feetY + CORE_LY;
      const len = BREATH_REACH * (k == null ? 1 : k);
      const f = this.front;
      return this.facing < 0 ? { x: f - len, y: cy - BREATH_HALF, w: len, h: BREATH_HALF * 2 } : { x: f, y: cy - BREATH_HALF, w: len, h: BREATH_HALF * 2 };
      void c;
    }

    // ---------------------------------------------------------------- defeat: the kiln goes cold
    onDefeatStart() {
      this.unlock();
      this.breathOn = 0;
      this.want('slump', 3);
      for (const e of this.room ? this.room.entities : []) if (e.type === 'kiln_heat') e.remove();
    }
    onDefeatSequence(dt, s) {
      const at = (t) => s >= t && s - dt < t;   // the defeat timeline runs on the stage clock (stateTime is frozen)
      this.animate(dt);
      if (s < 0.1) this.want('slump', 2);
      if (at(0.4)) { sfx('kiln_clang', this.x + 20, { vol: 0.9 }); burst('spark', this.bowl().x, this.feetY - 10, { count: 10, color: COL.moltenHot, speed: 260 }); }
      if (s > 0.6) { this.want('dead', 0.9); this.cool = clamp((s - 0.6) / 2.6, 0, 1); }
      if (at(0.7)) sfx('kiln_cool', this.cx, { vol: 1 });
      if (s > 0.6 && s < 3.4 && Math.floor(s / 0.1) !== Math.floor((s - dt) / 0.1)) burst('smoke', this.x + Math.random() * this.w, this.feetY - 120 - Math.random() * 160, { count: 2, color: '#b8b0a8', alpha: 0.35, size: 16, speed: 60 });
      if (at(1.6)) sfx('kiln_clang', this.cx + this.facing * 120, { vol: 0.7, pitch: 0.8 });
      if (at(3.4) && !this._finished) {
        const c = this.coreRect();
        burst('ember', c.x + c.w / 2, c.y + c.h / 2, { count: 26, color: COL.moltenHot, speed: 220 });
        burst('ring', c.x + c.w / 2, c.y + c.h / 2, { r: 240, color: '#ffd8a0', width: 4, life: 0.6 });
        if (G.game) G.game.flash('rgba(255,220,170,0.35)', 0.4);
        if (G.game) G.game.setFlag('kiln_rest_f', this.facing);
        this.finishDefeat();
      }
      if (s > 4.6 && !this._camDone) { this._camDone = true; this.releaseCam(); }
      // the husk stays at the forge (drawn by the entity now, by 'kiln_forge' on later visits)
    }
    // she never melts into a puddle: her husk is drawn cold where she stood
    drawDeath(ctx, t) {
      if (this.defeatStage === 'slowmo' && Math.floor(t * 14) % 2 === 0) this.drawFlashed(ctx, t, 0.5);
      else this.drawBody(ctx, t);
    }

    // ---------------------------------------------------------------- drawing
    drawBody(ctx, t) {
      const shake = this.turnT > 0 ? Math.sin(t * 60) * 3 * this.turnT / 0.35 : 0;
      const pz = this.pz;
      this.lights();
      drawFigure(ctx, this.cx + shake, this.feetY, this.facing, pz, { t, cool: this.cool, grate: this.grate });
      // the breath: a shimmering heat band marks the jet's line through the wind-up, then the jet
      if (this.state === 'breath' && this.stateData.w && this.stateTime < this.stateData.w) this.drawBreathWarn(ctx, t, this.stateTime / this.stateData.w);
      // the sweep: the floor strip the ladle will skim glints through each wind-up (its tell is otherwise behind her body)
      if (this.state === 'sweep' && this.stateData.w) {
        const sd = this.stateData, s = this.stateTime, t1 = sd.w + SWEEP_GAP;
        const k = s < sd.w ? s / sd.w : sd.n > 1 && s >= t1 - SWEEP_TELE2 && s < t1 ? (s - t1 + SWEEP_TELE2) / SWEEP_TELE2 : -1;
        if (k >= 0) this.drawSweepWarn(ctx, t, k);
      }
      if (this.breathOn > 0.01) this.drawBreath(ctx, t);
      // vents glowing while she calls the brood
      if (this.coreHitT > 0) { const c = this.coreRect(); glow(ctx, c.x + c.w / 2, c.y + c.h / 2, 90, COL.white, this.coreHitT * 2); }
    }
    drawSweepWarn(ctx, t, k) {
      const f = this.front, fy = this.feetY, d = this.facing;
      const reach = SWEEP_REACH * Math.min(1, 0.35 + 0.9 * k);
      const x0 = d < 0 ? f - reach : f, pulse = 0.5 + 0.5 * Math.sin(t * (14 + 16 * k));
      ctx.save();
      ctx.globalCompositeOperation = 'lighter';
      const g = ctx.createLinearGradient(0, fy, 0, fy - SWEEP_H);
      g.addColorStop(0, U.rgba(COL.molten, (0.22 + 0.4 * k) * (0.75 + 0.25 * pulse)));
      g.addColorStop(0.5, U.rgba(COL.molten, (0.06 + 0.12 * k) * (0.75 + 0.25 * pulse)));
      g.addColorStop(1, U.rgba(COL.molten, 0));
      ctx.fillStyle = g; ctx.fillRect(x0, fy - SWEEP_H, reach, SWEEP_H);
      // the scraped line on the floor and a bracket where the ladle's reach ends
      ctx.fillStyle = U.rgba(COL.moltenHot, Math.min(1, 0.5 + 0.5 * k * pulse));
      ctx.fillRect(x0, fy - 5, reach, 5);
      ctx.fillStyle = U.rgba(COL.white, 0.15 + 0.45 * k * pulse);
      ctx.fillRect(x0, fy - 3, reach, 2);
      const xe = d < 0 ? x0 : x0 + reach - 3;
      ctx.fillStyle = U.rgba(COL.moltenHot, (0.25 + 0.6 * k) * (0.7 + 0.3 * pulse));
      ctx.fillRect(xe, fy - 30, 4, 30);
      ctx.restore();
      if (G.lighting) G.lighting.add({ x: x0 + reach / 2, y: fy - 20, r: reach * 0.6 + 40, color: COL.molten, intensity: 0.25 + 0.35 * k });
    }
    drawBreathWarn(ctx, t, k) {
      const r = this.breathRect(1);
      const pulse = 0.5 + 0.5 * Math.sin(t * (12 + 18 * k));
      ctx.save();
      ctx.globalCompositeOperation = 'lighter';
      const g = ctx.createLinearGradient(0, r.y, 0, r.y + r.h);
      const a = (0.05 + 0.16 * k) * (0.7 + 0.3 * pulse);
      g.addColorStop(0, U.rgba(COL.molten, 0)); g.addColorStop(0.5, U.rgba(COL.molten, a)); g.addColorStop(1, U.rgba(COL.molten, 0));
      ctx.fillStyle = g; ctx.fillRect(r.x, r.y, r.w, r.h);
      // wavering heat lines along the band's edges, drawn out from her core
      ctx.strokeStyle = U.rgba(COL.moltenHot, 0.25 + 0.45 * k * pulse); ctx.lineWidth = 2;
      const reach = r.w * Math.min(1, 0.3 + k);
      for (const yy of [r.y + 4, r.y + r.h - 4]) {
        ctx.beginPath();
        for (let i = 0; i <= 24; i++) {
          const q = i / 24, x = this.facing < 0 ? r.x + r.w - q * reach : r.x + q * reach;
          const y = yy + Math.sin(q * 18 - t * 14) * 2.5;
          if (i) ctx.lineTo(x, y); else ctx.moveTo(x, y);
        }
        ctx.stroke();
      }
      ctx.restore();
    }
    drawBreath(ctx, t) {
      const k = this.breathOn;
      const c = this.coreRect();
      const x0 = this.facing < 0 ? c.x + 20 : c.x + c.w - 20, y0 = this.feetY + CORE_LY;
      const L = BREATH_REACH + (this.front - x0) * this.facing;
      ctx.save();
      ctx.translate(x0, y0); ctx.scale(this.facing, 1);
      glow(ctx, L * 0.5, 0, L * 0.6, COL.molten, 0.5 * k);
      for (let pass = 0; pass < 3; pass++) {
        ctx.fillStyle = pass === 0 ? COL.coreRed : pass === 1 ? COL.molten : COL.white;
        ctx.globalAlpha = (pass === 2 ? 0.8 : 0.9) * k;
        const hw = BREATH_HALF * (pass === 0 ? 1.05 : pass === 1 ? 0.78 : 0.35);
        ctx.beginPath();
        ctx.moveTo(0, -hw * 0.4);
        const n = 7;
        for (let i = 1; i <= n; i++) {
          const x = (L * i) / n, w = hw * (0.55 + 0.45 * i / n) * (0.85 + 0.15 * Math.sin(t * 30 + i * 2.3 + pass));
          ctx.lineTo(x, -w);
        }
        for (let i = n; i >= 1; i--) {
          const x = (L * i) / n, w = hw * (0.55 + 0.45 * i / n) * (0.85 + 0.15 * Math.sin(t * 27 + i * 1.7 + pass));
          ctx.lineTo(x, w);
        }
        ctx.lineTo(0, hw * 0.4);
        ctx.closePath(); ctx.fill();
      }
      ctx.restore();
      if (G.lighting) G.lighting.add({ x: x0 + this.facing * L * 0.5, y: y0, r: 260, color: COL.molten, intensity: 0.8 * k, flicker: true });
    }
  }
  G.Boss.register('kilnmother', KilnMother);

  // ---------------------------------------------------------------------------------------------------------
  // Room script 'kiln_forge' (ch_09): the forge behind her (furnace arch, vents over the alcove, flue hood), her
  // dormant figure before the fight and her cold husk after it.
  // ---------------------------------------------------------------------------------------------------------
  G.Events.kiln_forge = {
    init(e) {
      const room = e.room;
      const arena = room.findType ? room.findType('arena')[0] : null;
      const bx = arena && arena.props && arena.props.bx != null ? arena.props.bx : 48;
      e.data.A = arenaGeom(room, bx * TILE + TILE / 2, BODY_W);
      e.data.pz = pose(POSES.dormant);
      e.data.dead = pose(POSES.dead);
    },
    boss(e) { const r = e.room; const b = r && r.findType ? r.findType('boss_kilnmother')[0] : null; return b && !b.dead ? b : null; },
    update(e, dt) {
      void dt;
      const A = e.data.A; if (!A) return;
      const b = this.boss(e);
      const won = G.game && G.game.bossDefeated('kilnmother');
      if (!b && G.lighting) {
        const cx = A.homeX + BODY_W / 2;
        G.lighting.add({ x: cx - 40, y: A.floorY - 200, r: won ? 160 : 300, color: won ? '#c8602c' : COL.molten, intensity: won ? 0.25 : 0.55, flicker: !won });
      }
      // the vents drip and glow
      const vg = b ? b.ventGlow : 0;
      for (const v of A.vents) if (G.lighting) G.lighting.add({ x: v.x, y: v.y + 10, r: 70 + 90 * vg, color: COL.molten, intensity: (won ? 0.15 : 0.3) + 0.5 * vg });
    },
    draw(e, ctx, t) {
      const A = e.data.A; if (!A) return;
      const b = this.boss(e);
      const won = G.game && G.game.bossDefeated('kilnmother');
      const cx = A.homeX + BODY_W / 2, fy = A.floorY;
      const hot = won ? 0.25 : 1;
      // furnace arch on the back wall behind her
      ctx.save();
      ctx.globalAlpha *= 0.9;
      const ax = cx + 10, ay = fy, aw = 210, ah = 330;
      ctx.fillStyle = '#1a100c';
      ctx.beginPath(); ctx.moveTo(ax - aw, ay); ctx.lineTo(ax - aw, ay - ah + aw * 0.6); ctx.quadraticCurveTo(ax, ay - ah - aw * 0.45, ax + aw, ay - ah + aw * 0.6); ctx.lineTo(ax + aw, ay); ctx.closePath(); ctx.fill();
      // brick courses of the arch ring
      ctx.strokeStyle = '#3a2418'; ctx.lineWidth = 16;
      ctx.beginPath(); ctx.moveTo(ax - aw + 8, ay); ctx.lineTo(ax - aw + 8, ay - ah + aw * 0.6); ctx.quadraticCurveTo(ax, ay - ah - aw * 0.45 + 16, ax + aw - 8, ay - ah + aw * 0.6); ctx.lineTo(ax + aw - 8, ay); ctx.stroke();
      ctx.strokeStyle = '#5a3420'; ctx.lineWidth = 2;
      for (let i = 0; i < 14; i++) {
        const q = i / 13;
        const px = ax + (q - 0.5) * 2 * (aw - 8), py = ay - ah + aw * 0.6 - Math.sin(q * Math.PI) * (aw * 0.45 + aw * 0.6 - 16) * 0.55;
        ctx.beginPath(); ctx.moveTo(px - 8, py - 8); ctx.lineTo(px + 8, py + 8); ctx.stroke();
      }
      // inner glow of the great furnace
      const gg = ctx.createRadialGradient(ax, ay - 120, 20, ax, ay - 120, 260);
      gg.addColorStop(0, U.rgba(COL.molten, 0.45 * hot)); gg.addColorStop(1, U.rgba(COL.coreRed, 0));
      ctx.fillStyle = gg; ctx.fillRect(ax - aw, ay - ah - 60, aw * 2, ah + 60);
      ctx.restore();
      // flue hood over her head: an iron funnel into the vault throat
      ctx.save();
      ctx.fillStyle = '#22160f'; ctx.strokeStyle = COL.outline; ctx.lineWidth = 3;
      ctx.beginPath(); ctx.moveTo(cx - 92, 128); ctx.lineTo(cx - 30, 80); ctx.lineTo(cx + 30, 80); ctx.lineTo(cx + 92, 128); ctx.lineTo(cx + 70, 140); ctx.lineTo(cx - 70, 140); ctx.closePath(); ctx.fill(); ctx.stroke();
      ctx.fillStyle = '#6a4a38'; ctx.fillRect(cx - 70, 128, 140, 4);
      ctx.restore();
      // vents: iron pipes from the vault throats ending in spouts over the alcove
      for (const v of A.vents) {
        const vg = b ? b.ventGlow : 0;
        ctx.fillStyle = COL.outline; ctx.fillRect(v.x - 15, 40, 30, v.y - 40);
        ctx.fillStyle = '#3a2a22'; ctx.fillRect(v.x - 12, 40, 24, v.y - 40);
        ctx.fillStyle = '#5a4234'; ctx.fillRect(v.x - 12, 40, 6, v.y - 40);
        ctx.fillStyle = COL.outline; ctx.fillRect(v.x - 19, v.y - 64, 38, 10); ctx.fillRect(v.x - 21, v.y - 6, 42, 14);
        ctx.fillStyle = '#7a5a46'; ctx.fillRect(v.x - 19, v.y - 4, 38, 3);
        // the mouth
        ctx.fillStyle = mixc('#3a1404', COL.moltenHot, vg);
        ctx.beginPath(); ctx.ellipse(v.x, v.y + 8, 13, 4, 0, 0, TAU); ctx.fill();
        glow(ctx, v.x, v.y + 8, 30 + 50 * vg, COL.molten, (0.25 + 0.6 * vg) * hot);
        // a slow molten drip
        if (!won) {
          const q = (t * 0.6 + v.x * 0.01) % 1;
          ctx.fillStyle = COL.molten;
          ctx.beginPath(); ctx.ellipse(v.x, v.y + 12 + q * q * (fy - v.y - 12), 2.5, 4, 0, 0, TAU); ctx.fill();
        }
      }
      // the Mother herself when no boss entity is present
      if (!b) {
        if (won) {
          const f = G.game.getFlag('kiln_rest_f') || -1;
          drawFigure(ctx, cx, fy, f < 0 ? -1 : 1, e.data.dead, { t, cool: 1, grate: 1 });
        } else {
          // dormant: head bowed, pouring into a mold at her feet — she cannot stop
          const pz = e.data.pz;
          pz.ft = 1.25 + 0.06 * Math.sin(t * 0.8);
          pz.lean = 0.2 + 0.02 * Math.sin(t * 0.5);
          drawFigure(ctx, cx, fy, -1, pz, { t, cool: 0, grate: 0 });
        }
      }
    },
  };

  // ---------------------------------------------------------------------------------------------------------
  // Test hooks
  // ---------------------------------------------------------------------------------------------------------
  G.KilnMother = { POSES, pose, skeleton, drawFigure, arenaGeom, surfaceAt, COL,
    NUM: { BODY_W, BODY_H, CORE_MULT, MOLD_CAP, SWEEP_REACH, SWEEP_H, SLAM_REACH, SLAM_NEAR, BREATH_REACH, BREATH_HALF, HEAT_W, HEAT_FLARE_H, SPLASH, WAKE_TIME, SWEEP_GAP, SWEEP_TELE2, POUR_GAP, WAVE_RISE, HEAT_WARN2, SLAM_LOW },
    Boss: KilnMother, Moldling, KilnHeat, KilnWave, KilnSlag };
})();
