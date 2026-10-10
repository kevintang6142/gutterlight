// src/entities/bosses/tallowmere.js — ABBOT TALLOWMERE, Warden of the Bell (Keeper of the Drowned Nave; arena dn_07).
// Owner: boss-tallowmere. API: docs/api/boss-tallowmere.md (framework: docs/api/enemies.md §10).
//
// A huge melting cleric under a drenched, bell-shaped hood, leaning on a crozier with a bronze hand-bell in its crook.
// Expected Brand level 1-2 (9 / 13 dmg): 560 HP = 63 / 44 Brand hits (fewer with Ember Bolts). Damage 1 everywhere
// except the phase-2 belly slam impact (2).
//   toll    Bell Toll — raises the crozier overhead (0.72 s, the hand-bell glows), slams it down: a ring of sound runs
//           along the floor both ways (jump it). Phase 2: two tolls (2nd re-raised 0.45 s), faster rings.
//   vigil   Molten Vigil — arms to the vault, a chant (0.62 s); waves of molten tallow drops swell on the ceiling over
//           a warned column + a floor shadow (0.75 s) and fall. Never over his own body (stand close and punish).
//   slam    Belly Slam — crouch + groan (0.62 s), a hop onto the player's spot (landing shadow), belly-flop impact;
//           long recovery on his belly. Phase 2: 2 damage and two small rings from the landing. Only vs a grounded player.
//   sweep   Crozier Sweep — draws the crozier back low (0.5 s), sweeps the floor in front (jump it / step back).
//           Phase 2: a second sweep after turning to the player (0.4 s re-wind).
//   hush    Lullaby — cups his hands to the hood (0.55 s), breathes 3 (5) slow homing pale motes (the Brand pops them).
//   summon  (phase 2) Call the Drowned — arms spread (0.7 s), the flood bubbles in the east, 2 drowned acolytes rise.
//   awaken  (phase 2 at 50 %) the great bell tolls by itself, his hood tears, his flame turns white; first acolytes.
// Registers: G.Boss 'tallowmere' (entity boss_tallowmere), enemy 'tallowmere_acolyte' (boss-only minion), projectiles
// 'tallow_ring' 'tallow_drip' 'tallow_hush', room events 'tallowmere_bell' (the great bell, the praying Abbot before
// the fight, his remains after it) and 'tallowmere_flood' (the shallow flood film + ripples), sfx 'tallow_*'.
(function () {
  'use strict';
  const G = globalThis.G;
  if (!G || !G.Boss || !G.Enemy) return;

  const TILE = G.CONST.TILE;
  const TAU = Math.PI * 2;
  const T = G.T || {};
  const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
  const lerp = (a, b, k) => a + (b - a) * k;
  const damp = (a, b, rate, dt) => b + (a - b) * Math.exp(-rate * dt);
  const rnd = (a, b) => a + Math.random() * (b - a);
  const smooth = (k) => { k = clamp(k, 0, 1); return k * k * (3 - 2 * k); };
  const hash = (n) => { const s = Math.sin(n * 12.9898 + 78.233) * 43758.5453; return s - Math.floor(s); };
  const C = () => (G.Art && G.Art.char) || null;
  const glow = (ctx, x, y, r, c, a) => { if (a > 0.003 && G.fx && G.fx.glowAt) G.fx.glowAt(ctx, x, y, r, c, a); };
  const sfx = (name, x, o) => { if (typeof G.sfxAt === 'function') G.sfxAt(name, x, o); };
  const fx = (kind, x, y, o) => { if (G.fx && G.fx.burst) G.fx.burst(kind, x, y, o); };
  const light = (o) => { if (G.lighting && G.lighting.add) G.lighting.add(o); };

  const ID = 'tallowmere';
  const HP = 560;
  const BW = 150, BH = 160;                // body box (hurt/contact); the art overhangs (drawBounds)
  const STAGGER = { damage: 120, time: 1.6 };
  const HURT = { half: 94, h: 224 };                               // Brand-hittable: the whole drawn robe + hood
  // contact: robe half-width by the height of the player's feet above the floor (art: ±100 at the hem, ±82 at 80 px,
  // ±70 at 160 px, ±55 at 190 px, hood crown ~225 px), a few px inside the outline so grazing the cloth is forgiven
  // fight camera (see camUpdate): max lean from the player, how far inside the view his centre is kept, intro framing
  const CAM = { bias: 420, inset: 170, introLead: 220, introPan: 1.0 };
  const CONTACT = { h: 206, half: [[50, 86], [110, 78], [150, 70], [180, 58], [999, 40]] };
  const DRIP_V0 = 520, DRIP_G = 2300;      // molten drop: speed when it lets go of the vault, gravity
  const PAL = {
    tallow: '#c3cfd2', tallowShade: '#6e828b', tallowHi: '#f0f7f7', tallowDark: '#3a4a52',
    robe: '#4f6571', robeShade: '#26333c', robeHi: '#88a1ab',
    hood: '#768c96', hoodShade: '#34444d', hoodHi: '#b8ccd2',
    bronze: '#a8834a', bronzeHi: '#e8c886', bronzeDark: '#4e3a20', verdigris: '#5f9e94',
    staff: '#3a2e27', staffHi: '#7b6552',
    outline: '#0b0d10', cavity: '#080b0e', rim: '#bfe0ea',
    molten: '#ffb04a', moltenHi: '#fff0c4', ring: '#cfeeff', ringHi: '#ffffff', mote: '#d6ecff',
    tele: '#ffe2a8', cord: '#8c7a58', water: '#4f8fa3',
  };
  const OUTL = () => { const ch = C(); return (ch && ch.COLORS && ch.COLORS.outline) || PAL.outline; };

  // =====================================================================================================
  // Poses (local space: feet centre at 0,0, facing +x, y up is negative). h1 = front hand (holds the crozier),
  // h2 = back hand, sa = crozier angle (0 = upright, + tips forward), sq = body squash, lean px, bell = hand-bell
  // glow, glow = hand glow (chant), lift = hood tilt.
  // =====================================================================================================
  const POSES = {
    idle:      { h1x: 66, h1y: -84, h2x: -24, h2y: -74, sa: 0.06, sq: 1, lean: 0, bell: 0, glow: 0 },
    pray:      { h1x: 50, h1y: -66, h2x: 40, h2y: -64, sa: 0.14, sq: 0.76, lean: 10, bell: 0, glow: 0 },
    kneel:     { h1x: 70, h1y: -30, h2x: -50, h2y: -36, sa: 1.3, sq: 0.72, lean: 12, bell: 0, glow: 0 },
    tollWind:  { h1x: 30, h1y: -222, h2x: 6, h2y: -206, sa: -0.36, sq: 1.04, lean: -10, bell: 1, glow: 0 },
    tollHit:   { h1x: 94, h1y: -98, h2x: 66, h2y: -108, sa: 0.3, sq: 0.93, lean: 12, bell: 0.55, glow: 0 },
    vigil:     { h1x: 52, h1y: -240, h2x: -48, h2y: -234, sa: 0.02, sq: 1.05, lean: -6, bell: 0, glow: 1 },
    slamWind:  { h1x: 76, h1y: -56, h2x: -68, h2y: -60, sa: 0.55, sq: 0.83, lean: 6, bell: 0, glow: 0 },
    slamAir:   { h1x: 108, h1y: -150, h2x: -100, h2y: -146, sa: 0.9, sq: 1.08, lean: 4, bell: 0, glow: 0 },
    slamLand:  { h1x: 116, h1y: -24, h2x: -106, h2y: -26, sa: 1.4, sq: 0.68, lean: 16, bell: 0, glow: 0 },
    sweepWind: { h1x: -44, h1y: -76, h2x: -70, h2y: -88, sa: -2.05, sq: 0.95, lean: -14, bell: 1, glow: 0 },
    sweepHit:  { h1x: 106, h1y: -74, h2x: 76, h2y: -80, sa: 1.72, sq: 0.94, lean: 14, bell: 0.5, glow: 0 },
    cup:       { h1x: 54, h1y: -150, h2x: 42, h2y: -138, sa: 0.34, sq: 1, lean: 4, bell: 0, glow: 0.7 },
    spread:    { h1x: 122, h1y: -152, h2x: -120, h2y: -154, sa: 0.18, sq: 1.03, lean: -4, bell: 0, glow: 1 },
    stagger:   { h1x: 72, h1y: -48, h2x: -62, h2y: -50, sa: 0.85, sq: 0.85, lean: -16, bell: 0, glow: 0 },
  };
  const KEYS = Object.keys(POSES.idle);
  const copyPose = (p) => Object.assign({}, p);
  function mixPose(a, b, k) { const o = {}; for (const key of KEYS) o[key] = lerp(a[key], b[key], k); return o; }

  // Crozier geometry for a pose (local space). Returns {bot, top, crook, bell} points.
  const STAFF_L = 250, STAFF_GRIP = 0.42;
  function staffGeom(P) {
    const dx = Math.sin(P.sa), dy = -Math.cos(P.sa);
    // the hand slides along the shaft so an upright crozier stands on the floor instead of sinking into it
    let grip = STAFF_GRIP;
    const by0 = P.h1y - dy * STAFF_L * grip;
    if (by0 > -1 && dy < -0.3) grip = clamp(grip - (by0 + 1) / (-dy * STAFF_L), 0.05, grip);
    const bot = { x: P.h1x - dx * STAFF_L * grip, y: P.h1y - dy * STAFF_L * grip };
    const top = { x: P.h1x + dx * STAFF_L * (1 - grip), y: P.h1y + dy * STAFF_L * (1 - grip) };
    // the crook curls forward (perpendicular +), the hand-bell hangs from its tip
    const px = Math.cos(P.sa), py = Math.sin(P.sa);
    const crook = { x: top.x + px * 22 + dx * 6, y: top.y + py * 22 + dy * 6 };
    return { bot, top, crook, bell: { x: crook.x, y: crook.y + 4 }, dx, dy, px, py };
  }

  // =====================================================================================================
  // Shared room state (the great bell, ripples on the flood film)
  // =====================================================================================================
  const BELL = { ang: 0, vel: 0, flash: 0, clap: 0, clapVel: 0, room: null, x0: 0, x1: 0, lipY: 0 };
  function bellKick(strength) {
    BELL.vel += (Math.random() < 0.5 ? -1 : 1) * 0.35 * strength + BELL.ang * 0.2;
    BELL.flash = Math.max(BELL.flash, strength);
    BELL.clapVel += 2.4 * strength;
  }
  const RIPPLES = [];
  function ripple(x, y, size, life) {
    if (RIPPLES.length > 28) RIPPLES.shift();
    RIPPLES.push({ x, y, t: 0, size: size || 40, life: life || 0.9 });
  }

  // =====================================================================================================
  // Arena geometry (works in any room: the boss scans walls, floor and vault around its spawn point)
  // =====================================================================================================
  function solidAt(room, c, r) {
    if (!room || c < 0 || r < 0 || c >= room.cols || r >= room.rows) return true;
    const code = room.tileAt(c, r);
    return G.Physics.isSolidTile(code);
  }
  function platAt(room, c, r) { return !!room && c >= 0 && r >= 0 && c < room.cols && r < room.rows && room.tileAt(c, r) === T.PLATFORM; }
  /** The arena span on the boss's floor row: walls AND solid entities (the closed arena gate stands in an open
   *  doorway, so tiles alone would put the west end inside the door corridor). */
  function buildGeom(room, cx, footY) {
    const row = Math.floor((footY - 1) / TILE);
    const c0 = clamp(Math.floor(cx / TILE), 0, room.cols - 1);
    const ents = (room.entities || []).filter((e) => !e.dead && (e.solid || e.type === 'arena_gate' || e.type === 'gate'));
    const y0 = row * TILE, y1 = y0 + TILE;
    const blocked = (c) => solidAt(room, c, row) || ents.some((e) => e.x < (c + 1) * TILE && e.x + e.w > c * TILE && e.y < y1 && e.y + e.h > y0);
    let l = c0, r = c0;
    while (l > 0 && !blocked(l - 1)) l--;
    while (r < room.cols - 1 && !blocked(r + 1)) r++;
    return { L: l * TILE, R: (r + 1) * TILE, floorY: footY, row };
  }
  /** y of the vault's underside above (x, fromY). */
  function ceilingAt(room, x, fromY) {
    const c = clamp(Math.floor(x / TILE), 0, room.cols - 1);
    let r = Math.floor(fromY / TILE);
    while (r > 0 && !solidAt(room, c, r - 1)) r--;
    return r * TILE;
  }
  /** top y of the first solid tile or one-way platform at/below y. */
  function surfaceBelow(room, x, y) {
    const c = clamp(Math.floor(x / TILE), 0, room.cols - 1);
    for (let r = Math.max(0, Math.floor(y / TILE)); r < room.rows; r++) if (solidAt(room, c, r) || platAt(room, c, r)) return r * TILE;
    return room.rows * TILE;
  }

  // =====================================================================================================
  // Drawing the Abbot (local space; the caller translates to the feet and mirrors by facing)
  // o: {t, phase (1|2), torn, flame (0..1 flame size), melt (0..1), eyes (0..1 open), light (-1|1 local), seed}
  // =====================================================================================================
  function sleeve(ctx, sx, sy, hx, hy, w, col, outl) {
    const mx = (sx + hx) / 2, my = (sy + hy) / 2 + 16;
    ctx.lineCap = 'round'; ctx.lineJoin = 'round';
    ctx.strokeStyle = outl; ctx.lineWidth = w + 6;
    ctx.beginPath(); ctx.moveTo(sx, sy); ctx.quadraticCurveTo(mx, my, hx, hy); ctx.stroke();
    ctx.strokeStyle = col; ctx.lineWidth = w;
    ctx.beginPath(); ctx.moveTo(sx, sy); ctx.quadraticCurveTo(mx, my, hx, hy); ctx.stroke();
    // flared cuff
    const ang = Math.atan2(hy - my, hx - mx);
    ctx.save(); ctx.translate(hx - Math.cos(ang) * 9, hy - Math.sin(ang) * 9); ctx.rotate(ang);
    ctx.fillStyle = outl; ctx.beginPath(); ctx.ellipse(0, 0, 9, w * 0.72 + 3, 0, 0, TAU); ctx.fill();
    ctx.fillStyle = col; ctx.beginPath(); ctx.ellipse(0, 0, 6.5, w * 0.72, 0, 0, TAU); ctx.fill();
    ctx.restore();
  }
  function hand(ctx, x, y, r, outl) {
    ctx.fillStyle = outl; ctx.beginPath(); ctx.arc(x, y, r + 2.5, 0, TAU); ctx.fill();
    ctx.fillStyle = PAL.tallow; ctx.beginPath(); ctx.arc(x, y, r, 0, TAU); ctx.fill();
    ctx.fillStyle = PAL.tallowHi; ctx.globalAlpha *= 0.6; ctx.beginPath(); ctx.arc(x - r * 0.3, y - r * 0.35, r * 0.4, 0, TAU); ctx.fill(); ctx.globalAlpha /= 0.6;
  }
  function handBell(ctx, x, y, swing, glowK, outl, t) {
    ctx.save(); ctx.translate(x, y); ctx.rotate(swing);
    ctx.strokeStyle = outl; ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(0, -4); ctx.lineTo(0, 3); ctx.stroke();
    const p = new Path2D();
    p.moveTo(-5, 2); p.quadraticCurveTo(-8, 13, -14, 23); p.lineTo(-16, 27); p.quadraticCurveTo(0, 31, 16, 27); p.lineTo(14, 23);
    p.quadraticCurveTo(8, 13, 5, 2); p.closePath();
    ctx.fillStyle = PAL.bronze; ctx.fill(p);
    ctx.fillStyle = PAL.bronzeDark; ctx.globalAlpha *= 0.55; ctx.beginPath(); ctx.moveTo(2, 3); ctx.quadraticCurveTo(7, 14, 15, 26); ctx.lineTo(4, 28); ctx.closePath(); ctx.fill(); ctx.globalAlpha /= 0.55;
    ctx.strokeStyle = PAL.bronzeHi; ctx.lineWidth = 1.6; ctx.beginPath(); ctx.moveTo(-4, 6); ctx.quadraticCurveTo(-7, 15, -11, 22); ctx.stroke();
    ctx.strokeStyle = outl; ctx.lineWidth = 2.4; ctx.stroke(p);
    ctx.fillStyle = PAL.bronzeDark; ctx.beginPath(); ctx.arc(Math.sin(t * 7) * 3 * glowK, 30, 3.4, 0, TAU); ctx.fill();
    ctx.restore();
    if (glowK > 0.01) {
      glow(ctx, x, y + 16, 46 + 26 * glowK, PAL.ring, 0.55 * glowK);
      glow(ctx, x, y + 16, 18, '#ffffff', 0.5 * glowK);
    }
  }
  function drawCrozier(ctx, P, outl, t, swing) {
    const g = staffGeom(P);
    ctx.lineCap = 'round';
    ctx.strokeStyle = outl; ctx.lineWidth = 9;
    ctx.beginPath(); ctx.moveTo(g.bot.x, g.bot.y); ctx.lineTo(g.top.x, g.top.y); ctx.stroke();
    ctx.strokeStyle = PAL.staff; ctx.lineWidth = 5;
    ctx.beginPath(); ctx.moveTo(g.bot.x, g.bot.y); ctx.lineTo(g.top.x, g.top.y); ctx.stroke();
    ctx.strokeStyle = PAL.staffHi; ctx.lineWidth = 1.4;
    ctx.beginPath(); ctx.moveTo(g.bot.x - g.px * 1.5, g.bot.y - g.py * 1.5); ctx.lineTo(g.top.x - g.px * 1.5, g.top.y - g.py * 1.5); ctx.stroke();
    // the crook: a bronze curl
    const cx = g.top.x + g.px * 12, cy = g.top.y + g.py * 12, a0 = P.sa + Math.PI;
    ctx.strokeStyle = outl; ctx.lineWidth = 9;
    ctx.beginPath(); ctx.arc(cx, cy, 12, a0, a0 + Math.PI * 1.15); ctx.stroke();
    ctx.strokeStyle = PAL.bronze; ctx.lineWidth = 5;
    ctx.beginPath(); ctx.arc(cx, cy, 12, a0, a0 + Math.PI * 1.15); ctx.stroke();
    ctx.strokeStyle = PAL.bronzeHi; ctx.lineWidth = 1.5;
    ctx.beginPath(); ctx.arc(cx, cy, 13.5, a0 + 0.2, a0 + 1.4); ctx.stroke();
    // bronze ferrule at the foot
    ctx.fillStyle = PAL.bronze; ctx.beginPath(); ctx.arc(g.bot.x, g.bot.y, 4.5, 0, TAU); ctx.fill();
    handBell(ctx, g.bell.x, g.bell.y, swing - P.sa * 0.15 * 0, P.bell, outl, t);
    return g;
  }

  function drawAbbot(ctx, P, o) {
    const ch = C();
    const t = o.t || 0, outl = OUTL();
    const melt = clamp(o.melt || 0, 0, 1);
    const sq = P.sq * (1 - 0.8 * melt);
    const lean = P.lean * (1 - melt);
    const breath = Math.sin(t * 1.7 + (o.seed || 0)) * 2.2 * (1 - melt);
    ctx.save();
    if (melt > 0) ctx.scale(1 + 0.55 * melt, 1);
    if (!ch) {                                                    // fallback silhouette
      ctx.fillStyle = PAL.robe; ctx.fillRect(-BW / 2, -BH * sq, BW, BH * sq);
      ctx.fillStyle = PAL.hood; ctx.beginPath(); ctx.ellipse(lean, -BH * sq, 90, 60 * sq, 0, Math.PI, 0); ctx.fill();
      ctx.restore();
      return;
    }
    const L = o.light || -1;
    const S1 = { x: 54 + lean * 0.6, y: -122 * sq + breath }, S2 = { x: -50 + lean * 0.6, y: -124 * sq + breath };
    const H1 = { x: lerp(P.h1x, 70, melt), y: lerp(P.h1y, -10, melt) }, H2 = { x: lerp(P.h2x, -70, melt), y: lerp(P.h2y, -10, melt) };
    const Pm = Object.assign({}, P, { h1x: H1.x, h1y: H1.y });

    // ---- back arm (behind everything)
    sleeve(ctx, S2.x, S2.y, H2.x, H2.y, 24, PAL.robeShade, outl);
    hand(ctx, H2.x, H2.y, 10, outl);

    // ---- robe: a sodden cassock falling in a bell to a dragging hem
    const hemW = 98 * (1 + (1 - sq) * 0.45), shY = -128 * sq + breath;
    const robe = new Path2D();
    robe.moveTo(-60 + lean * 0.5, shY);
    robe.bezierCurveTo(-78 + lean * 0.3, shY + 40, -hemW + 4, -40 * sq, -hemW, 0);
    for (let i = 0; i <= 8; i++) {                               // tattered, dripping hem
      const x = -hemW + (2 * hemW * i) / 8;
      robe.lineTo(x + hemW / 8 * 0.5, (i % 2 ? 6 : 2) + hash(i + 3) * 4);
    }
    robe.lineTo(hemW, 0);
    robe.bezierCurveTo(hemW - 4, -40 * sq, 80 + lean * 0.3, shY + 40, 62 + lean * 0.5, shY);
    robe.closePath();
    ch.shape(ctx, robe, { fill: PAL.robe, outline: outl, lw: 3, light: L, shade: 0.42, rim: PAL.rim, rimWidth: 2, box: [-hemW, shY, hemW, 6] });
    ctx.save(); ctx.clip(robe);
    ctx.strokeStyle = PAL.robeShade; ctx.lineWidth = 4; ctx.globalAlpha *= 0.7;
    for (let i = 0; i < 5; i++) {                                // folds
      const x = -hemW * 0.75 + i * hemW * 0.38;
      ctx.beginPath(); ctx.moveTo(x * 0.45 + lean * 0.4, shY + 30); ctx.quadraticCurveTo(x * 0.8 + Math.sin(t * 0.8 + i) * 2, -50 * sq, x, 4); ctx.stroke();
    }
    ctx.strokeStyle = PAL.robeHi; ctx.lineWidth = 1.2; ctx.globalAlpha *= 0.55;
    for (let i = 0; i < 4; i++) {                                // wet sheen
      const x = -hemW * 0.6 + i * hemW * 0.42 + 9;
      ctx.beginPath(); ctx.moveTo(x * 0.5, shY + 44); ctx.quadraticCurveTo(x * 0.85, -48 * sq, x * 0.98, -6); ctx.stroke();
    }
    ctx.restore();

    // ---- belly: pale tallow bulging through the cassock, bound by a cord of little bells
    const bx = 24 + lean * 0.45, by = -60 * sq + breath * 0.6;
    const brx = 60 * (1 + (1 - sq) * 0.55), bry = 52 * sq;
    const belly = new Path2D();
    belly.ellipse(bx, by, brx, bry, 0, 0, TAU);
    ch.shape(ctx, belly, { fill: PAL.tallow, outline: outl, lw: 3, light: L, shade: 0.4, rim: PAL.rim, rimWidth: 2.5, hi: 0.26, box: [bx - brx, by - bry, bx + brx, by + bry] });
    ctx.save(); ctx.clip(belly);
    ctx.fillStyle = PAL.tallowShade; ctx.globalAlpha *= 0.35;
    for (let i = 0; i < 4; i++) {                                // melt runnels
      const x = bx - brx * 0.5 + i * brx * 0.36, len = 18 + hash(i + 11) * 26;
      ctx.beginPath(); ctx.moveTo(x - 3, by - bry * 0.2); ctx.lineTo(x + 3, by - bry * 0.2); ctx.lineTo(x + 2.5, by + len); ctx.arc(x, by + len, 2.5, 0, Math.PI); ctx.closePath(); ctx.fill();
    }
    ctx.restore();
    // drips hanging off the belly
    ctx.fillStyle = PAL.tallowShade;
    for (let i = 0; i < 3; i++) {
      const x = bx - brx * 0.45 + i * brx * 0.45, y0 = by + bry * Math.sqrt(Math.max(0, 1 - Math.pow((x - bx) / brx, 2))) - 3;
      const k = (t * 0.55 + hash(i + 5)) % 1, len = 8 + k * 14;
      ctx.globalAlpha = 0.85 * (1 - k * 0.5);
      ctx.beginPath(); ctx.moveTo(x - 2.2, y0 - 2); ctx.quadraticCurveTo(x - 2, y0 + len, x, y0 + len + 2.5); ctx.quadraticCurveTo(x + 2, y0 + len, x + 2.2, y0 - 2); ctx.closePath(); ctx.fill();
      ctx.globalAlpha = 1;
    }
    // the cord + its little bells
    ctx.strokeStyle = outl; ctx.lineWidth = 5;
    ctx.beginPath(); ctx.moveTo(bx - brx * 0.95, by - bry * 0.45); ctx.quadraticCurveTo(bx, by - bry * 0.05, bx + brx * 0.92, by - bry * 0.5); ctx.stroke();
    ctx.strokeStyle = PAL.cord; ctx.lineWidth = 2.6; ctx.stroke();
    for (let i = 0; i < 3; i++) {
      const x = bx - brx * 0.35 + i * brx * 0.35, y = by - bry * 0.22 + Math.abs(i - 1) * -6 + 6;
      ctx.fillStyle = outl; ctx.beginPath(); ctx.arc(x, y + 4, 5.2, 0, TAU); ctx.fill();
      ctx.fillStyle = PAL.bronze; ctx.beginPath(); ctx.arc(x, y + 4, 3.6, Math.PI, 0); ctx.lineTo(x + 4.2, y + 7); ctx.lineTo(x - 4.2, y + 7); ctx.closePath(); ctx.fill();
    }

    // ---- the hood: a drenched bell of cloth over head and shoulders
    const hx = 6 + lean, rimY = -114 * sq + breath, topY = rimY - 112 * (0.55 + 0.45 * sq) * (1 - 0.35 * melt);
    const hood = new Path2D();
    hood.moveTo(hx - 98, rimY);
    hood.quadraticCurveTo(hx - 88, rimY - 22, hx - 72, rimY - 40);
    hood.bezierCurveTo(hx - 60, rimY - 64, hx - 50, topY + 30, hx - 38, topY + 13);
    hood.quadraticCurveTo(hx, topY - 7, hx + 38, topY + 13);
    hood.bezierCurveTo(hx + 50, topY + 30, hx + 60, rimY - 64, hx + 72, rimY - 40);
    hood.quadraticCurveTo(hx + 88, rimY - 22, hx + 98, rimY);
    hood.lineTo(hx + 102, rimY + 8);
    hood.quadraticCurveTo(hx, rimY + 18, hx - 102, rimY + 8);
    hood.closePath();
    ch.shape(ctx, hood, { fill: PAL.hood, outline: outl, lw: 3, light: L, shade: 0.45, rim: PAL.rim, rimWidth: 2.5, hi: 0.2, box: [hx - 102, topY - 7, hx + 102, rimY + 18] });
    ctx.save(); ctx.clip(hood);
    // wet streaks
    ctx.strokeStyle = PAL.hoodShade; ctx.lineWidth = 3; ctx.globalAlpha *= 0.45;
    for (let i = 0; i < 6; i++) {
      const x = hx - 70 + i * 26 + hash(i + 21) * 8;
      ctx.beginPath(); ctx.moveTo(x * 0.85 + hx * 0.15, topY + 18); ctx.quadraticCurveTo(x + 3, rimY - 40, x * 1.05 - hx * 0.05, rimY + 12); ctx.stroke();
    }
    ctx.globalAlpha /= 0.45;
    // bronze bands (the bell's sound-bow and shoulder)
    ctx.strokeStyle = PAL.bronzeDark; ctx.lineWidth = 7;
    ctx.beginPath(); ctx.moveTo(hx - 104, rimY + 1); ctx.quadraticCurveTo(hx, rimY + 12, hx + 104, rimY + 1); ctx.stroke();
    ctx.strokeStyle = PAL.bronze; ctx.lineWidth = 4;
    ctx.beginPath(); ctx.moveTo(hx - 104, rimY); ctx.quadraticCurveTo(hx, rimY + 11, hx + 104, rimY); ctx.stroke();
    ctx.strokeStyle = PAL.bronzeHi; ctx.lineWidth = 1.2;
    ctx.beginPath(); ctx.moveTo(hx - 80 * -L * -1, rimY - 2); ctx.quadraticCurveTo(hx - 40 * -L * -1, rimY + 4, hx, rimY + 5); ctx.stroke();
    ctx.strokeStyle = PAL.bronze; ctx.lineWidth = 3;
    ctx.beginPath(); ctx.moveTo(hx - 56, topY + 42); ctx.quadraticCurveTo(hx, topY + 30, hx + 56, topY + 42); ctx.stroke();
    // phase 2: the hood is torn open at the back, pale light inside
    if (o.torn) {
      const tx = hx - 52, ty = rimY - 18;
      const rip = new Path2D();
      rip.moveTo(tx - 30, rimY + 14); rip.lineTo(tx - 22, ty - 10); rip.lineTo(tx - 12, ty - 2); rip.lineTo(tx - 6, ty - 34);
      rip.lineTo(tx + 4, ty - 20); rip.lineTo(tx + 10, ty - 44); rip.lineTo(tx + 16, ty - 8); rip.lineTo(tx + 22, rimY + 14); rip.closePath();
      ctx.fillStyle = '#0c1418'; ctx.fill(rip);
      ctx.save(); ctx.clip(rip);
      glow(ctx, tx, ty, 46, '#9fc8e0', 0.3 + 0.1 * Math.sin(t * 6));
      ctx.restore();
      ctx.strokeStyle = outl; ctx.lineWidth = 2.5; ctx.stroke(rip);
    }
    ctx.restore();
    // drips falling from the rim
    ctx.fillStyle = PAL.rim;
    for (let i = 0; i < 4; i++) {
      const x = hx - 84 + i * 56 + hash(i + 31) * 10, k = (t * 0.9 + hash(i + 41)) % 1;
      ctx.globalAlpha = (1 - k) * 0.7 * (1 - melt);
      ctx.beginPath(); ctx.ellipse(x, rimY + 12 + k * 60, 1.8, 3.6, 0, 0, TAU); ctx.fill();
    }
    ctx.globalAlpha = 1;

    // ---- the face in the hood's mouth: melting wax, heavy-lidded, dreaming
    const fx = hx + 36, fy = rimY - 42;
    const fh = 40 * (0.6 + 0.4 * sq);
    const mouth = new Path2D();                                   // the cowl's opening: a pointed arch of shadow
    mouth.moveTo(fx - 30, fy + fh * 0.75); mouth.quadraticCurveTo(fx - 34, fy - fh * 0.35, fx - 2, fy - fh);
    mouth.quadraticCurveTo(fx + 30, fy - fh * 0.45, fx + 30, fy + fh * 0.8); mouth.quadraticCurveTo(fx, fy + fh * 0.95, fx - 30, fy + fh * 0.75);
    mouth.closePath();
    ctx.fillStyle = PAL.cavity; ctx.fill(mouth);
    ctx.strokeStyle = 'rgba(184,204,210,0.35)'; ctx.lineWidth = 2; ctx.stroke(mouth);
    const face = new Path2D();
    face.moveTo(fx - 18, fy - 16); face.quadraticCurveTo(fx + 2, fy - 30, fx + 20, fy - 14);
    face.quadraticCurveTo(fx + 24, fy + 8, fx + 14, fy + 22); face.quadraticCurveTo(fx + 10, fy + 34, fx + 6, fy + 26);
    face.quadraticCurveTo(fx, fy + 32, fx - 6, fy + 24); face.quadraticCurveTo(fx - 14, fy + 30, fx - 16, fy + 18);
    face.quadraticCurveTo(fx - 24, fy + 2, fx - 18, fy - 16); face.closePath();
    ctx.fillStyle = PAL.tallowShade; ctx.fill(face);
    ctx.save(); ctx.clip(face);
    ctx.fillStyle = PAL.tallow; ctx.beginPath(); ctx.ellipse(fx + 6, fy - 6, 17, 18, 0, 0, TAU); ctx.fill();
    ctx.restore();
    // wax tears
    ctx.strokeStyle = PAL.tallowHi; ctx.lineWidth = 2; ctx.globalAlpha = 0.7;
    ctx.beginPath(); ctx.moveTo(fx - 3, fy - 2); ctx.lineTo(fx - 4, fy + 16); ctx.moveTo(fx + 15, fy - 2); ctx.lineTo(fx + 16, fy + 12); ctx.stroke();
    ctx.globalAlpha = 1;
    const open = o.eyes == null ? 0.45 : o.eyes;
    ch.eyes(ctx, fx + 6, fy - 6, { kind: o.phase >= 2 ? 'ember' : 'round', size: 6.5, gap: 18, color: o.phase >= 2 ? '#e6f6ff' : '#dfeef2', blink: 1 - open, glow: true });
    glow(ctx, fx + 6, fy - 6, 30, '#cfe8ff', 0.05 + 0.08 * open);

    // ---- crozier + front arm
    const swing = Math.sin(t * 2.3) * 0.12;
    if (!o.noStaff) drawCrozier(ctx, Pm, outl, t, swing);
    sleeve(ctx, S1.x, S1.y, H1.x, H1.y, 26, PAL.robe, outl);
    hand(ctx, H1.x, H1.y, 11, outl);
    if (P.glow > 0.01) {
      glow(ctx, H1.x, H1.y, 40, PAL.molten, 0.4 * P.glow);
      glow(ctx, H2.x, H2.y, 40, PAL.molten, 0.4 * P.glow);
    }

    // ---- wick and flame at the crown
    const crownX = hx, crownY = topY - 2;
    ctx.fillStyle = PAL.bronze; ctx.strokeStyle = outl; ctx.lineWidth = 2.5;
    ctx.beginPath(); ctx.ellipse(crownX, crownY + 2, 11, 6, 0, 0, TAU); ctx.fill(); ctx.stroke();
    const tip = ch.wick(ctx, crownX, crownY, { len: 13, bend: -lean * 0.2, width: 3.4 });
    const fl = o.flame == null ? 1 : o.flame;
    if (fl > 0.02) {
      const big = o.phase >= 2;
      G.Art.flame(ctx, tip[0], tip[1] + 1, (big ? 40 : 30) * fl, big ? 'white' : 'pale', t, 7, { lean: -lean * 0.4 });
    } else if (melt < 1 && ch.pallSmoke) ch.pallSmoke(ctx, tip[0], tip[1], t, { count: 4, height: 70, spread: 10, size: 7, alpha: 0.3 });
    ctx.restore();
    return { tip, face: { x: fx, y: fy }, staff: staffGeom(Pm) };
  }

  /** The melted remains (after the defeat): a wide puddle, the slumped hood, the crozier lying in the flood. */
  function drawRemains(ctx, x, y, f, t) {
    const ch = C();
    if (ch) {
      ch.shadow(ctx, x, y, 130, 0.45);
      ch.puddle(ctx, x, y, 1, { color: '#a9babf', w: 130, wick: false });
    }
    ctx.save(); ctx.translate(x, y); ctx.scale(f || 1, 1);
    drawAbbot(ctx, POSES.kneel, { t, melt: 1, flame: 0, eyes: 0, light: -(f || 1), noStaff: true });
    // the crozier laid across the puddle
    const outl = OUTL();
    ctx.lineCap = 'round';
    ctx.strokeStyle = outl; ctx.lineWidth = 9; ctx.beginPath(); ctx.moveTo(-60, -4); ctx.lineTo(170, -8); ctx.stroke();
    ctx.strokeStyle = PAL.staff; ctx.lineWidth = 5; ctx.beginPath(); ctx.moveTo(-60, -4); ctx.lineTo(170, -8); ctx.stroke();
    ctx.restore();
    if (ch && ch.pallSmoke) ch.pallSmoke(ctx, x, y - 30, t, { count: 4, height: 90, spread: 30, size: 9, alpha: 0.18, color: '#8a9aa3', seed: 4 });
  }

  // =====================================================================================================
  // Projectiles
  // =====================================================================================================
  /** Bell ring: a crest of sound and floodwater running along the floor (like 'wave': jump it; keeps going). */
  class BellRing extends G.Projectile {
    constructor(props) {
      const p = props || {};
      super(p);
      this.dir = p.dir || (p.vx < 0 ? -1 : 1);
      this.speedX = p.speed || 400;
      this.w = p.w || 34; this.h = p.h || 62;
      this.vx = this.dir * this.speedX; this.vy = 0;
      if (p.x != null && p.y != null) { this.x = p.x - this.w / 2; this.y = p.y - this.h; this._placed = true; }
      this.anchor = 'ground';
      this.gravity = 0;
      this.grow = 0;
    }
    hitBox() { return { x: this.x + 6, y: this.y + this.h * 0.22, w: this.w - 12, h: this.h * 0.78 }; }
    update(dt) {
      this.age += dt;
      this.grow = Math.min(1, this.grow + dt / 0.12);
      if (this.age >= this.life) { this.burst('expire'); return; }
      const room = this.room;
      if (!room) return;
      const nx = this.x + this.vx * dt;
      const front = this.dir > 0 ? nx + this.w : nx;
      const blocked = G.Physics.rectSolid(room, nx, this.y, this.w, this.h - 2);
      const fc = Math.floor(front / TILE), fr = Math.floor((this.y + this.h + 2) / TILE);
      const floor = solidAt(room, fc, fr) || platAt(room, fc, fr);
      if (blocked || !floor) { this.burst('terrain'); return; }
      this.x = nx;
      if (G.fx && Math.random() < dt * 26) fx('splash', this.cx, this.y + this.h - 2, { count: 2, color: '#a8d4e0', speed: 160, angle: -Math.PI / 2 - this.dir * 0.5, spread: 0.6 });
      if (Math.random() < dt * 6) ripple(this.cx, this.y + this.h, 26, 0.7);
      if (this.team === 'enemy') this.touchPlayer();
      if (this.light) light({ x: this.cx, y: this.y + this.h * 0.55, r: 110, color: this.color, intensity: 0.55 });
    }
    touchPlayer() {
      const p = G.game && G.game.player;
      if (!p || p.dead) return false;
      const b = this.hitBox();
      if (!(b.x < p.x + p.w && b.x + b.w > p.x && b.y < p.y + p.h && b.y + b.h > p.y)) return false;
      G.Combat.hurtPlayer(this.damage, this);
      return true;
    }
    burstFx(why) {
      if (why === 'terrain') {
        fx('splash', this.cx + this.dir * this.w * 0.4, this.y + this.h - 10, { count: 8, color: '#a8d4e0', speed: 240 });
        fx('ring', this.cx + this.dir * this.w * 0.5, this.y + this.h * 0.5, { r: 40, color: this.color, width: 3, life: 0.3 });
      } else if (why === 'clear' || why === 'expire') {
        fx('smoke', this.cx, this.y + this.h * 0.6, { count: 3, color: '#9ec4d0', alpha: 0.3, size: 10 });
      }
    }
    draw(ctx, t) {
      const bx = this.cx, by = this.y + this.h, d = this.dir, h = this.h * (0.4 + 0.6 * this.grow);
      const life = clamp((this.life - this.age) / 0.3, 0, 1);
      ctx.save();
      ctx.globalAlpha *= life;
      glow(ctx, bx, by - h * 0.45, h * 1.4, this.color, 0.65);
      glow(ctx, bx + d * 6, by - h * 0.5, h * 0.6, '#ffffff', 0.35);
      // three nested arcs of sound, bulging in the travel direction (the leading one brightest)
      for (let i = 0; i < 3; i++) {
        const k = 1 - i * 0.24, x0 = bx - d * i * 13;
        const hh = h * k * (0.92 + 0.08 * Math.sin(t * 30 + i * 2 + this.seed));
        ctx.strokeStyle = i === 0 ? PAL.ringHi : this.color;
        ctx.globalAlpha = life * (i === 0 ? 1 : 0.75 - i * 0.15);
        ctx.lineWidth = i === 0 ? 6 : 4;
        ctx.beginPath();
        ctx.moveTo(x0 - d * 6, by);
        ctx.bezierCurveTo(x0 + d * 16 * k, by - hh * 0.25, x0 + d * 16 * k, by - hh * 0.8, x0 - d * 4, by - hh);
        ctx.stroke();
      }
      // the crest of floodwater it drags along
      ctx.globalAlpha = life * 0.85;
      ctx.fillStyle = '#9fd0de';
      ctx.beginPath();
      ctx.moveTo(bx - d * 34, by);
      ctx.quadraticCurveTo(bx - d * 8, by - 4, bx + d * 2, by - 18 - 3 * Math.sin(t * 24 + this.seed));
      ctx.quadraticCurveTo(bx + d * 10, by - 8, bx + d * 16, by);
      ctx.closePath(); ctx.fill();
      ctx.fillStyle = '#ffffff'; ctx.globalAlpha = life * 0.8;
      for (let i = 0; i < 4; i++) {
        const k = (t * 3 + i * 0.27 + this.seed) % 1;
        ctx.beginPath(); ctx.arc(bx - d * (4 + k * 22), by - 14 - Math.sin(k * Math.PI) * 14, 1.8, 0, TAU); ctx.fill();
      }
      ctx.restore();
    }
  }
  G.registerProjectile('tallow_ring', BellRing, { r: 20, gravity: 0, life: 7, color: PAL.ring, damage: 1 });

  /** Molten drip: swells on the vault (harmless, glinting, floor shadow + warned column), then falls. */
  class Drip extends G.Projectile {
    constructor(props) {
      const p = props || {};
      super(p);
      this.hang = p.hang == null ? 0.75 : p.hang;
      this.fallVy = p.fallVy || 520;
      this.fallG = p.fallGravity || 2300;
      this.gravity = 0; this.vx = 0; this.vy = 0;
      this.surfY = p.surfY || 0;
      this.topY = p.topY == null ? (this.cy - 12) : p.topY;
      this.falling = false;
      this.hangT = 0;
      this.light = true;
    }
    hitBox() { const s = this.r * 0.8; return { x: this.cx - s, y: this.cy - s * 1.4, w: s * 2, h: s * 2.4 }; }
    hurtRect() { return null; }
    update(dt) {
      if (!this.falling) {
        this.hangT += dt;
        if (this.hangT >= this.hang) { this.falling = true; this.vy = this.fallVy; this.gravity = this.fallG; }
        light({ x: this.cx, y: this.topY + 10, r: 60 + 50 * (this.hangT / this.hang), color: PAL.molten, intensity: 0.5 });
        return;
      }
      super.update(dt);
      if (this.dead) return;
      if (this.surfY && this.y + this.h * 0.5 >= this.surfY - 4) { this.y = this.surfY - this.h * 0.5 - 4; this.burst('terrain'); }
    }
    burstFx(why) {
      if (why === 'terrain' || why === 'player') {
        const y = why === 'terrain' ? (this.surfY || this.cy) : this.cy;
        fx('wax', this.cx, y - 4, { count: 10, color: PAL.molten, speed: 300, angle: -Math.PI / 2, spread: 2.2 });
        fx('spark', this.cx, y - 4, { count: 5, color: PAL.moltenHi, speed: 260 });
        fx('smoke', this.cx, y - 8, { count: 3, color: '#cfe0e6', alpha: 0.35, size: 9 });
        fx('flash', this.cx, y - 6, { r: 34, color: PAL.molten, life: 0.12 });
        sfx('tallow_hiss', this.cx, { vol: 0.55 });
        ripple(this.cx, y, 30, 0.8);
      } else if (why !== 'expire') {
        fx('smoke', this.cx, this.cy, { count: 2, color: PAL.molten, alpha: 0.3, size: 7 });
      }
    }
    draw(ctx, t) {
      const x = this.cx;
      const k = this.falling ? 1 : clamp(this.hangT / this.hang, 0, 1);
      // floor shadow: darkens as the drop swells / falls (the floor-side telegraph)
      if (this.surfY) {
        // the warned column (from the top of the view down to the floor) + a pulsing molten mark on the floor
        const cam = G.camera, y0 = cam ? Math.max(this.topY, cam.y - 10) : this.topY;
        const pulse = 0.5 + 0.5 * Math.sin((this.hangT + this.age) * 14);
        const a = this.falling ? 0.2 : 0.07 + 0.17 * k;
        if (this.surfY > y0) {
          ctx.fillStyle = 'rgba(255,176,74,' + a.toFixed(3) + ')'; ctx.fillRect(x - 15, y0, 30, this.surfY - y0);
          ctx.fillStyle = 'rgba(255,232,190,' + Math.min(0.5, a * 1.6).toFixed(3) + ')'; ctx.fillRect(x - 1.5, y0, 3, this.surfY - y0);
        }
        glow(ctx, x, this.surfY - 4, 56, PAL.molten, 0.3 + 0.3 * k);
        ctx.strokeStyle = 'rgba(255,214,150,' + (0.55 + 0.4 * pulse).toFixed(3) + ')'; ctx.lineWidth = 2.5;
        ctx.beginPath(); ctx.ellipse(x, this.surfY - 2, 24, 6, 0, 0, TAU); ctx.stroke();
        const near = this.falling ? clamp(1 - (this.surfY - this.cy) / 800, 0.4, 1) : 0.25 + 0.35 * k;
        ctx.fillStyle = 'rgba(8,10,12,' + (0.55 * near).toFixed(3) + ')';
        ctx.beginPath(); ctx.ellipse(x, this.surfY - 1, 16 + 8 * near, 4.5, 0, 0, TAU); ctx.fill();
        glow(ctx, x, this.surfY - 3, 28, PAL.molten, 0.25 * near);
      }
      if (!this.falling) {
        // stain on the vault + swelling drop + glint
        const r = 3 + 7 * k, y0 = this.topY;
        ctx.fillStyle = '#6a4a26'; ctx.beginPath(); ctx.ellipse(x, y0 + 1, 10, 3.5, 0, 0, TAU); ctx.fill();
        glow(ctx, x, y0 + r, 26 + 20 * k, PAL.molten, 0.45 + 0.3 * k);
        ctx.fillStyle = PAL.molten;
        ctx.beginPath(); ctx.moveTo(x - 4, y0); ctx.quadraticCurveTo(x - r, y0 + r * 1.2, x, y0 + r * 2.2); ctx.quadraticCurveTo(x + r, y0 + r * 1.2, x + 4, y0); ctx.closePath(); ctx.fill();
        ctx.fillStyle = PAL.moltenHi; ctx.beginPath(); ctx.arc(x - r * 0.25, y0 + r * 1.2, r * 0.35, 0, TAU); ctx.fill();
        const gl = 0.5 + 0.5 * Math.sin(this.hangT * 22);
        ctx.strokeStyle = 'rgba(255,248,220,' + (0.4 + 0.6 * gl * k).toFixed(3) + ')'; ctx.lineWidth = 1.5;
        const s = 6 + 8 * k * gl;
        ctx.beginPath(); ctx.moveTo(x - s, y0 + r); ctx.lineTo(x + s, y0 + r); ctx.moveTo(x, y0 + r - s); ctx.lineTo(x, y0 + r + s); ctx.stroke();
        return;
      }
      // falling teardrop, stretched by speed, with a short hot streak
      const st = clamp(this.vy / 1400, 0.2, 1), r = this.r;
      glow(ctx, x, this.cy, r * 3.4, PAL.molten, 0.55);
      ctx.fillStyle = 'rgba(255,176,74,0.35)';
      ctx.fillRect(x - r * 0.35, this.cy - r * (2 + 5 * st), r * 0.7, r * (2 + 5 * st));
      ctx.fillStyle = PAL.molten;
      ctx.beginPath(); ctx.moveTo(x, this.cy - r * (1.6 + 2.2 * st)); ctx.quadraticCurveTo(x + r, this.cy - r * 0.2, x, this.cy + r); ctx.quadraticCurveTo(x - r, this.cy - r * 0.2, x, this.cy - r * (1.6 + 2.2 * st)); ctx.fill();
      ctx.fillStyle = PAL.moltenHi; ctx.beginPath(); ctx.arc(x - r * 0.2, this.cy, r * 0.42, 0, TAU); ctx.fill();
    }
  }
  G.registerProjectile('tallow_drip', Drip, { r: 10, gravity: 0, life: 6, color: PAL.molten, damage: 1 });

  /** Lullaby mote: a pale slow light that curves toward the player for ~1 s, then drifts straight (destroyable). */
  class Mote extends G.Projectile {
    constructor(props) {
      super(props);
      this.homeRate = (props && props.homing) || 1.5;
      this.homing = 0;
      this.destroyable = true; this.hurtable = true;
    }
    update(dt) {
      // the lullaby leans toward the listener for a moment, then drifts on in a straight line (sidestep / jump it)
      this.homing = this.age > 0.25 && this.age < 1.0 ? this.homeRate : 0;
      super.update(dt);
    }
    burstFx(why) {
      fx('flash', this.cx, this.cy, { r: 34, color: PAL.mote, life: 0.14 });
      fx('spark', this.cx, this.cy, { count: why === 'hit' ? 8 : 4, color: '#ffffff', speed: 240 });
      if (why === 'hit') sfx('tallow_mote', this.cx, { vol: 0.5, pitch: 1.5 });
    }
    draw(ctx, t) {
      const tr = this.trail;
      for (let i = 0; i < tr.length; i += 2) glow(ctx, tr[i], tr[i + 1], this.r * (0.8 + (i / tr.length) * 1.4), PAL.mote, 0.1 + (i / tr.length) * 0.16);
      const pulse = 0.85 + 0.15 * Math.sin(t * 9 + this.seed);
      glow(ctx, this.cx, this.cy, this.r * 4 * pulse, PAL.mote, 0.5);
      ctx.fillStyle = PAL.mote; ctx.beginPath(); ctx.arc(this.cx, this.cy, this.r * 0.75 * pulse, 0, TAU); ctx.fill();
      ctx.fillStyle = '#ffffff'; ctx.beginPath(); ctx.arc(this.cx, this.cy, this.r * 0.38, 0, TAU); ctx.fill();
      ctx.strokeStyle = 'rgba(214,236,255,0.6)'; ctx.lineWidth = 1.5;
      const a = t * 2.5 + this.seed;
      ctx.beginPath(); ctx.ellipse(this.cx, this.cy, this.r * 1.5, this.r * 0.55, a, 0, TAU); ctx.stroke();
    }
  }
  G.registerProjectile('tallow_hush', Mote, { r: 11, gravity: 0, life: 4.2, color: PAL.mote, damage: 1 });

  // =====================================================================================================
  // The Abbot
  // =====================================================================================================
  class Tallowmere extends G.Boss {
    constructor(props) {
      super(props, {
        hp: HP, w: BW, h: BH,
        phases: [0.5],
        stagger: STAGGER,
        rest: [0.6, 1.05],
        phaseRest: [1, 0.74],
        introTime: 0.9,
        roar: false,                                   // the fight opens with a toll of the great bell instead
        defeatStyle: 'custom',
        slowmo: 1.0,
        contactInset: 10,
        colors: { body: PAL.tallow, dark: PAL.tallowDark, hit: '#f2fbff', puddle: '#a9babf', smoke: '#8a9aa3', tele: PAL.tele },
        light: { r: 230, color: '#cfe8ff', intensity: 0.5, dy: -150 },
        attacks: {
          toll:   { weight: 3, cooldown: 1.0 },
          vigil:  { weight: 2.2, cooldown: 6.5 },
          slam:   { weight(d) { return d > 300 ? 3.2 : 1.4; }, range: [230, 1300], cooldown: 1.4, when(d) { return this.playerLow() && d >= 200; } },   // never a hop-in-place onto a cornered player
          sweep:  { weight: 3.4, range: [0, 250], when() { return this.playerLow(); } },
          hush:   { weight() { return this.playerLow() ? 1.8 : 3.4; }, range: [300, 3000], cooldown: 4.5 },
          summon: { weight: 4, phase: 2, cooldown: 12, when() { return this.liveMinions() === 0; } },
          awaken: { weight: 0, phase: 99, uninterruptible: true },
        },
      });
      this.pz = copyPose(POSES.pray);
      this.want = 'pray';
      this.poseRate = 10;
      this.torn = false;
      this.flameK = 1;
      this.melt = 0;
      this.eyesOpen = 0.15;
      this.dropThrough = true;                         // never stands on the choir lofts (one-way platforms)
      this.slamTarget = null;
      this.stepT = 0;
    }

    init() {
      super.init();
      this.geom = this.room ? buildGeom(this.room, this.cx, this.y + this.h) : { L: 0, R: 4000, floorY: this.y + this.h, row: 0 };
      this.face();
    }

    // ---------------------------------------------------------------- hit areas (match the drawn body)
    // The drawn Abbot is a bell-shaped robe ~200 px wide at the hem tapering to a hood ~225 px tall, larger than the
    // physics box (150x160, kept small so he fits the belfry). Brand hits land on the whole visible body incl. the
    // hood; contact damage follows the robe's taper (the widest part a player can touch is at the player's feet).
    hurtRect() {
      if (this.hidden || this.dying) return null;
      const fy = this.y + this.h;
      return { x: this.cx - HURT.half, y: fy - HURT.h, w: HURT.half * 2, h: HURT.h };
    }
    contactRect() {
      if (this.dying || this.hidden || this.contactGrace) return null;
      const fy = this.y + this.h, p = this.player;
      const lift = p ? clamp(fy - (p.y + p.h), 0, 400) : 0;
      let half = CONTACT.half[CONTACT.half.length - 1][1];
      for (const [hgt, w] of CONTACT.half) if (lift < hgt) { half = w; break; }
      return { x: this.cx - half, y: fy - CONTACT.h, w: half * 2, h: CONTACT.h - 4 };
    }

    // ---------------------------------------------------------------- camera
    // The belfry is two screens wide. When the arena spawns him the view pans to him (beginFight: the player is held
    // for CAM.introPan s, then his lines open with him framed); during the fight the camera follows a stand-in for the player shifted toward him (at most
    // CAM.bias px, so the player stays well inside the view) so his wind-ups are seen, not just their results.
    update(dt) {
      super.update(dt);
      this.camUpdate(dt);
    }
    camUpdate(dt) {
      const cam = G.camera, p = G.game && G.game.player;
      if (!cam || typeof cam.follow !== 'function' || !p || p.dead || this.dead || (p.room && p.room !== this.room)) return;
      if (!this.arena && !this.fightStarted) return;                     // debug spawns: leave the camera alone
      const look = +cam.lookX || 0, c0 = p.x + p.w / 2 + look;
      let want;
      if (!this.fightStarted && (this._introPan || this._dialogueOpen)) want = (this.cx + CAM.introLead * this.facing) - c0;   // he faces the player
      else {
        const half = (cam.w || 1280) / 2 - CAM.inset;
        want = clamp(clamp(c0, this.cx - half, this.cx + half) - c0, -CAM.bias - look, CAM.bias - look);
      }
      if (this._finished) want = 0;                                      // victory recorded: settle back on the player
      this.camBias = damp(this.camBias || 0, want, this.fightStarted ? 2.6 : 3.6, dt);
      if (!this._cam) {
        const self = this, pl = () => (G.game && G.game.player) || null;
        this._cam = {
          isTallowmereCam: true,
          get x() { const q = pl(); return q ? q.x + (self.camBias || 0) : 0; },
          get y() { const q = pl(); return q ? q.y : 0; },
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
    }
    releaseCam() {
      if (this._cam && G.camera && G.camera.target === this._cam) G.camera.follow(G.game && G.game.player);
    }
    remove() {
      this.releaseCam();
      this.unlock();
      super.remove();
    }

    // ---------------------------------------------------------------- helpers
    floorY() { return this.geom ? this.geom.floorY : this.y + this.h; }
    /** [x0, x1] of the one-way loft the player is on or above (feet at/over its deck), else null */
    loftOver(p) {
      const room = this.room, fy = this.floorY();
      if (!room) return null;
      const c = Math.floor((p.x + p.w / 2) / TILE), feet = p.y + p.h;
      for (let r = Math.floor(fy / TILE) - 2; r >= Math.floor(fy / TILE) - 7 && r >= 0; r--) {
        if (!platAt(room, c, r)) continue;
        if (feet > r * TILE + 10) return null;                           // under the loft, not on it
        let c0 = c, c1 = c;
        while (platAt(room, c0 - 1, r)) c0--;
        while (platAt(room, c1 + 1, r)) c1++;
        return [c0 * TILE, (c1 + 1) * TILE];
      }
      return null;
    }
    /** player standing (or hopping) near the floor — not up on a choir loft */
    playerLow() { const p = this.player; return !!p && (p.y + p.h) > this.floorY() - 2.2 * TILE; }
    local(px, py) { return { x: this.cx + this.facing * px, y: this.y + this.h + py }; }
    staffWorld(name) { const g = staffGeom(POSES[name] || this.pz); return this.local(g.bell.x, g.bell.y + 16); }
    set(name, rate) { if (this.want !== name) { this.want = name; } this.poseRate = rate || 12; }
    snap(name) { this.pz = copyPose(POSES[name]); this.want = name; }
    halt() { if (this.grounded) this.vx = 0; }

    think(dt) {
      super.think(dt);
      this.animate(dt);
    }
    animate(dt) {
      const tgt = POSES[this.want] || POSES.idle;
      for (const k of KEYS) this.pz[k] = damp(this.pz[k], tgt[k], this.poseRate, dt);
      const wantEyes = this.state === 'intro' && !this.fightStarted ? 0.2 : this.phase >= 2 ? 0.95 : this.telegraphing ? 0.8 : 0.45;
      this.eyesOpen = damp(this.eyesOpen, wantEyes, 6, dt);
      // heavy footfalls while waddling
      if (this.grounded && Math.abs(this.vx) > 10) {
        this.stepT += dt * Math.abs(this.vx) / 55;
        if (this.stepT > 1) { this.stepT = 0; ripple(this.cx + rnd(-50, 50), this.floorY(), 34, 0.9); sfx('step', this.cx, { vol: 0.6, pitch: 0.5 }); }
      }
      if (this.flameK > 0) light({ x: this.cx, y: this.y - 70, r: this.phase >= 2 ? 260 : 210, color: this.phase >= 2 ? '#eef6ff' : '#cfe8ff', intensity: 0.42 * this.flameK, flicker: true });
    }

    // The arena spawns him kneeling where he prayed; the view first pans to him (player held), THEN his lines open
    // (the world, camera included, is frozen while a dialogue is open), then he rises with the toll of the bell.
    beginFight() {
      if (this.fightStarted || this._starting || this._introPan) return;
      if (!this.arena || !G.camera || typeof G.camera.follow !== 'function' || !G.game || typeof G.game.lockPlayer !== 'function') { super.beginFight(); return; }
      this._introPan = { t: 0 };
      G.game.lockPlayer('tallowmere_intro');
      this._locked = true;
    }
    unlock() { if (this._locked && G.game && typeof G.game.unlockPlayer === 'function') G.game.unlockPlayer('tallowmere_intro'); this._locked = false; }
    introUpdate(dt) {
      this.face(); this.halt();
      if (this._introPan) {
        const p = this.player;
        if (p && !p.dead) p.invuln = Math.max(p.invuln || 0, 0.1);      // held for the pan: nothing (a Gutterwisp) may hit them
        if ((this._introPan.t += dt) >= CAM.introPan) { this._introPan = null; super.beginFight(); }
      }
      if (!this.fightStarted) { this.set('pray', 6); this._riseT = this.stateTime; }
      else this.set(this.stateTime - (this._riseT || 0) < 0.3 ? 'pray' : 'idle', 2.6);
    }
    idleUpdate(dt) {
      this.face();
      this.contactDamage = 1;
      const d = this.playerDist();
      if (this.grounded && d > 330 && this.playerLow()) this.approach(this.player, 52, { stop: 300 });
      else if (this.grounded && d < 300 && !this.playerLow()) {          // someone perched on a loft over him: shuffle out from under it
        if (!this.flee(this.player, 60)) this.halt();
      } else this.halt();
      this.set('idle', 8);
    }
    staggerUpdate(dt) { this.halt(); this.set('stagger', 14); }

    onFightStart() {
      this.unlock();
      if (this.room) this.geom = buildGeom(this.room, this.cx, this.geom ? this.geom.floorY : this.y + this.h);   // the gate is shut by now
      sfx('bell', this.cx, { vol: 1.1, pitch: 0.75 });
      sfx('tallow_chant', this.cx, { vol: 0.8 });
      bellKick(0.8);
      if (G.game) G.game.shake(5, 0.6);
    }
    onAttackStart() { this.vx = this.grounded ? 0 : this.vx; this.contactDamage = 1; }
    onStagger() { this.snap('stagger'); this.slamTarget = null; this.contactDamage = 1; sfx('bell', this.cx, { vol: 0.5, pitch: 1.6 }); }
    onInterrupt() { this.slamTarget = null; this.contactDamage = 1; }

    onPhase(phase) {
      if (phase === 2) {
        this.slamTarget = null;
        this.startAttack('awaken');
      } else super.onPhase(phase);
    }

    // ---------------------------------------------------------------- attacks
    /** BELL TOLL: crozier raised overhead, slammed down → rings along the floor both ways (x2 in phase 2). */
    atk_toll(dt, s) {
      const d = this.stateData;
      const p2 = this.phase >= 2;
      if (this.once('wind')) {
        this.face();
        d.n = p2 ? 2 : 1; d.gap = 0.9;
        const at = this.staffWorld('tollWind');
        d.W = this.telegraph(p2 ? 0.62 : 0.72, { color: PAL.ring, sound: 'tallow_toll_wind', shake: 1.2, x: at.x, y: at.y });
      }
      this.halt();
      if (s < d.W) { this.set('tollWind', 9); return; }
      for (let k = 0; k < d.n; k++) {
        const tk = d.W + k * d.gap;
        if (k > 0 && this.at(tk - 0.45)) { this.face(); const at = this.staffWorld('tollWind'); this.telegraph(0.45, { color: PAL.ring, sound: 'tallow_toll_wind', vol: 0.6, shake: 1, x: at.x, y: at.y }); }
        if (this.at(tk)) this.tollStrike(p2 ? 470 : 400);
      }
      const since = s - d.W, idx = Math.floor(since / d.gap), local = since - idx * d.gap;
      if (idx < d.n - 1 && local > d.gap - 0.45) this.set('tollWind', 12); else this.set('tollHit', 20);
      if (s > d.W + (d.n - 1) * d.gap + 0.8) this.endAttack();
    }
    tollStrike(speed) {
      this.snap('tollHit');
      const fy = this.floorY();
      for (const dir of [-1, 1]) {
        G.spawnProjectile(this.room, 'tallow_ring', { x: this.cx + dir * (this.w / 2 - 8), y: fy, dir, speed, owner: this });
      }
      const g = staffGeom(POSES.tollHit), foot = this.local(g.bot.x, 0);
      sfx('bell', this.cx, { vol: 1, pitch: this.phase >= 2 ? 0.95 : 0.85 });
      sfx('tallow_toll', this.cx, { vol: 1 });
      bellKick(0.6);
      if (G.game) G.game.shake(7, 0.3);
      fx('ring', foot.x, fy - 20, { r: 170, color: PAL.ring, width: 5, life: 0.45 });
      fx('splash', foot.x, fy - 4, { count: 14, color: '#a8d4e0', speed: 320 });
      fx('flash', foot.x, fy - 20, { r: 70, color: PAL.ring, life: 0.15 });
      ripple(foot.x, fy, 70, 1.1);
    }

    /** MOLTEN VIGIL: arms to the vault; waves of drips swell on warned columns and fall. */
    atk_vigil(dt, s) {
      const d = this.stateData;
      const p2 = this.phase >= 2;
      if (this.once('wind')) {
        this.face();
        d.waves = 4; d.per = p2 ? 3 : 2; d.gap = p2 ? 0.48 : 0.58; d.hang = p2 ? 0.72 : 0.78;
        d.used = [];
        d.W = this.telegraph(0.62, { color: PAL.molten, sound: 'tallow_chant', shake: 0.8, x: this.cx, y: this.y - 90 });
      }
      this.halt();
      this.set('vigil', 7);
      for (let w = 0; w < d.waves; w++) if (this.at(d.W + w * d.gap)) this.dripWave(w, d, p2);
      if (s > d.W + (d.waves - 1) * d.gap + d.hang + 0.75) this.endAttack(0.45);
    }
    dripWave(w, d, p2) {
      const room = this.room, A = this.geom, fy = this.floorY();
      const slotW = 2 * TILE;
      const n0 = Math.ceil((A.L + TILE) / slotW), n1 = Math.floor((A.R - TILE) / slotW);
      const free = [];
      for (let i = n0; i <= n1; i++) {
        const x = i * slotW + TILE;
        // never over himself (stand close and punish) — unless the column ends on a choir loft above him
        if (Math.abs(x - this.cx) < this.w / 2 + 50 && surfaceBelow(room, x, ceilingAt(room, x, fy - TILE) + 4) >= fy - TILE) continue;
        if (d.used.indexOf(i) >= 0) continue;                          // a column never drips twice in a row
        free.push(i);
      }
      const pick = [];
      let aimX = null;
      const p = this.player;
      if (p && (w === 0 || p2)) {                                      // the first wave (every wave in phase 2) hunts the player
        const pxc = p.x + p.w / 2, i = Math.round((pxc - TILE) / slotW);
        if (free.indexOf(i) >= 0 && Math.abs(pxc - this.cx) >= this.w / 2 + 50) { pick.push(i); aimX = clamp(pxc + rnd(-4, 4), A.L + 24, A.R - 24); }
      }
      let guard = 0;
      while (pick.length < d.per && free.length && guard++ < 50) {
        const i = free[Math.floor(Math.random() * free.length)];
        if (pick.some((j) => Math.abs(j - i) < 2)) continue;             // keep gaps inside a wave
        pick.push(i);
      }
      d.used = pick.slice();
      for (let n = 0; n < pick.length; n++) {
        const i = pick[n];
        const x = (n === 0 && aimX != null) ? aimX : i * slotW + TILE + rnd(-6, 6);
        let top = ceilingAt(room, x, fy - TILE);
        if (BELL.room === room && BELL.lipY && x > BELL.x0 && x < BELL.x1 && BELL.lipY > top) top = BELL.lipY;   // off the great bell's lip
        const surf = surfaceBelow(room, x, top + 4);
        // the warned column glows until the drop lands (hang + fall time)
        const dist = Math.max(0, surf - (top + 12)), fall = (-DRIP_V0 + Math.sqrt(DRIP_V0 * DRIP_V0 + 2 * DRIP_G * dist)) / DRIP_G;
        this.warnZone({ x: x - 22, y: top, w: 44, h: Math.max(TILE, surf - top), dur: d.hang + fall, style: 'column', color: PAL.molten });
        G.spawnProjectile(room, 'tallow_drip', { x, y: top + 12, topY: top, surfY: surf, hang: d.hang, fallVy: DRIP_V0, fallGravity: DRIP_G, owner: this, damage: 1 });
      }
      if (pick.length) sfx('tallow_glint', pick.length ? pick[0] * slotW : this.cx, { vol: 0.7 });
    }

    /** BELLY SLAM: crouch, hop onto the player's spot, belly-flop; long recovery. */
    atk_slam(dt, s) {
      const d = this.stateData;
      const p2 = this.phase >= 2;
      if (this.once('wind')) {
        this.face();
        d.W = this.telegraph(p2 ? 0.55 : 0.64, { color: PAL.tele, sound: 'tallow_grunt', shake: 2.2 });
      }
      if (s < d.W) { this.halt(); this.set('slamWind', 10); return; }
      if (this.once('jump')) {
        const p = this.player, A = this.geom;
        let px = p ? p.x + p.w / 2 : this.cx;
        // they hopped up onto a choir loft during the wind-up: land beside the loft, never rise through it into them
        const loft = p ? this.loftOver(p) : null;
        if (loft) { const l = loft[0] - 104, r = loft[1] + 104; px = (l < A.L + 100) ? r : (r > A.R - 100) ? l : (Math.abs(l - this.cx) <= Math.abs(r - this.cx) ? l : r); }
        d.tx = clamp(px, A.L + 100, A.R - 100);                        // his hem (±100 px) stays clear of the walls
        // farther hops fly higher (a gap-closer, never a flat lunge); beyond his reach he lands short — and the landing
        // marker shows where he WILL land (it used to sit under the player while he fell short)
        const D = Math.abs(d.tx - this.cx);
        const sol = this.leapTo(d.tx, this.floorY(), clamp(210 + (D - 560) * 0.5, 210, 360), { maxVx: 780 });
        if (Math.abs(sol.vx * sol.t) < D - 2) d.tx = clamp(this.cx + sol.vx * sol.t, A.L + 100, A.R - 100);
        this.slamTarget = d.tx;
        this.contactDamage = p2 ? 2 : 1;                               // the whole falling body is the heavy blow
        this.snap('slamAir');
        sfx('jump', this.cx, { pitch: 0.45, vol: 1.2 });
        fx('splash', this.cx, this.floorY() - 4, { count: 16, color: '#a8d4e0', speed: 300 });
        ripple(this.cx, this.floorY(), 80, 1);
        return;
      }
      if (d.landT == null) {
        this.set('slamAir', 8);
        if (!this.grounded && this.slamTarget != null) {
          // keep the flight honest to the marker: aim the remaining arc at the landing spot picked at take-off
          const g = (G.CONST.GRAVITY || 2600) * (this.gravityScale || 1);
          const tr = (-this.vy + Math.sqrt(this.vy * this.vy + 2 * g * Math.max(0, this.floorY() - (this.y + this.h)))) / g;
          if (tr > 0.02) this.vx = clamp((this.slamTarget - this.cx) / tr, -820, 820);
        }
        if (this.grounded && s > d.W + 0.12) {
          d.landT = s;
          this.vx = 0;
          if (this.slamTarget != null && Math.abs(this.cx - this.slamTarget) < 24) this.x = this.slamTarget - this.w / 2;   // exactly on the marker
          this.slamTarget = null;
          this.snap('slamLand');
          const fy = this.floorY();
          this.strike({ x: this.cx - this.w / 2 - 46, y: fy - 72, w: this.w + 92, h: 72 }, { damage: p2 ? 2 : 1, id: 'tallow_slam' + this.uid + ':' + this.attackCount });
          if (G.game) G.game.shake(12, 0.45);
          sfx('tallow_splash', this.cx, { vol: 1.2 });
          sfx('hardland', this.cx, { vol: 1, pitch: 0.6 });
          fx('splash', this.cx, fy - 4, { count: 30, color: '#a8d4e0', speed: 460 });
          fx('dust', this.cx, fy - 4, { count: 10, color: '#7f949c', speed: 200 });
          fx('ring', this.cx, fy - 10, { r: 180, color: '#a8d4e0', width: 4, life: 0.4 });
          ripple(this.cx, fy, 120, 1.3);
          if (p2) d.ringAt = s + 0.3;                                  // the flood answers the impact a beat later
        } else if (s > d.W + 2.6) { this.slamTarget = null; this.contactDamage = 1; this.endAttack(); }
        return;
      }
      this.halt();
      if (d.ringAt != null && s >= d.ringAt) {
        d.ringAt = null;
        const fy = this.floorY();
        for (const dir of [-1, 1]) G.spawnProjectile(this.room, 'tallow_ring', { x: this.cx + dir * (this.w / 2 - 10), y: fy, dir, speed: 360, h: 48, owner: this });
        sfx('bell', this.cx, { vol: 0.6, pitch: 1.3 });
        fx('splash', this.cx, fy - 4, { count: 12, color: '#a8d4e0', speed: 260 });
      }
      if (s - d.landT > 0.1) this.contactDamage = 1;
      const rec = p2 ? 0.85 : 1.05;
      this.set(s - d.landT < rec * 0.6 ? 'slamLand' : 'idle', s - d.landT < rec * 0.6 ? 20 : 5);
      if (s - d.landT > rec) this.endAttack(0.35);
    }

    /** CROZIER SWEEP: drawn back low, swept across the floor in front (x2 in phase 2). */
    atk_sweep(dt, s) {
      const d = this.stateData;
      const p2 = this.phase >= 2;
      if (this.once('wind')) {
        this.face();
        d.n = p2 ? 2 : 1; d.gap = 0.95;                                // P2: re-wound while a jumper is still airborne, swung after they land
        const at = this.staffWorld('sweepWind');
        d.W = this.telegraph(0.5, { color: PAL.tele, sound: 'tallow_sweep_wind', shake: 1.4, x: at.x, y: at.y });
      }
      this.halt();
      if (s < d.W) { this.set('sweepWind', 10); return; }
      for (let k = 0; k < d.n; k++) {
        const tk = d.W + k * d.gap;
        if (k > 0 && this.at(tk - 0.55)) { this.face(); const at = this.staffWorld('sweepWind'); this.telegraph(0.55, { color: PAL.tele, sound: 'tallow_sweep_wind', vol: 0.6, x: at.x, y: at.y }); }
        if (this.at(tk)) { this.snap('sweepHit'); this.swingAt = this.t; sfx('tallow_swish', this.cx, { vol: 1 }); sfx('bell', this.cx, { vol: 0.3, pitch: 2.2 }); }
        if (s >= tk && s < tk + 0.16) {
          const f = this.facing, fy = this.floorY();
          const x0 = f > 0 ? this.cx + 10 : this.cx - 10 - 240;
          this.strike({ x: x0, y: fy - 96, w: 240, h: 96 }, { id: 'tallow_sweep' + this.uid + ':' + this.attackCount + ':' + k, dir: { x: f, y: -0.2 } });
          if (this.at(tk + 0.04)) { fx('splash', this.cx + f * 170, fy - 4, { count: 12, color: '#a8d4e0', speed: 300, angle: f > 0 ? -0.4 : Math.PI + 0.4, spread: 0.8 }); ripple(this.cx + f * 160, fy, 60, 0.9); }
        }
      }
      const since = s - d.W, idx = Math.floor(since / d.gap), local = since - idx * d.gap;
      if (idx < d.n - 1 && local > d.gap - 0.55) this.set('sweepWind', 14); else this.set('sweepHit', 18);
      if (s > d.W + (d.n - 1) * d.gap + 0.16 + 0.62) this.endAttack();
    }

    /** LULLABY: hands cupped to the hood; slow homing motes. */
    atk_hush(dt, s) {
      const d = this.stateData;
      const p2 = this.phase >= 2;
      if (this.once('wind')) {
        this.face();
        d.n = p2 ? 5 : 3;
        const g = this.local(42, -165);
        d.W = this.telegraph(0.55, { color: PAL.mote, sound: 'tallow_hush', shake: 0.6, x: g.x, y: g.y });
      }
      this.halt();
      this.set('cup', 9);
      for (let i = 0; i < d.n; i++) {
        if (!this.at(d.W + i * 0.24)) continue;
        const o = this.local(48, -160);
        const p = this.player;
        const base = p ? Math.atan2(p.y + p.h / 2 - o.y, p.x + p.w / 2 - o.x) : (this.facing > 0 ? 0 : Math.PI);
        const a = base + (i - (d.n - 1) / 2) * 0.5 - 0.35;
        G.spawnProjectile(this.room, 'tallow_hush', { x: o.x, y: o.y, vx: Math.cos(a) * 180, vy: Math.sin(a) * 180, maxSpeed: 200, homing: 1.6, owner: this, destroyable: true });
        sfx('tallow_mote', o.x, { vol: 0.6, pitch: 1 + i * 0.12 });
        fx('flash', o.x, o.y, { r: 30, color: PAL.mote, life: 0.12 });
      }
      if (s > d.W + d.n * 0.24 + 0.6) this.endAttack();
    }

    /** CALL THE DROWNED (phase 2): two acolytes rise from the flood in the east. */
    atk_summon(dt, s) {
      const d = this.stateData;
      if (this.once('wind')) {
        this.face();
        d.spots = this.summonSpots();
        d.W = this.telegraph(0.7, { color: '#9fd6ff', sound: 'tallow_chant', shake: 1 });
        for (const x of d.spots) this.warnZone({ x: x - 32, y: this.floorY() - 22, w: 64, h: 22, dur: d.W, style: 'floor', color: '#9fd6ff' });
        this.risePts = d.spots.map((x) => ({ x, t0: this.t, dur: d.W }));
        sfx('tallow_rise', d.spots[0] || this.cx, { vol: 0.8 });
      }
      this.halt();
      this.set('spread', 8);
      if (this.at(d.W)) this.raiseAcolytes(d.spots);
      if (s > d.W + 0.7) this.endAttack();
    }
    summonSpots() {
      const A = this.geom, p = this.player, px = p ? p.x + p.w / 2 : -9999;
      const cand = [A.R - 3.5 * TILE, A.R - 7 * TILE, A.R - 10 * TILE, A.R - 13 * TILE, A.L + 4 * TILE, A.L + 8 * TILE];
      const out = [];
      for (const x of cand) {
        if (x < A.L + TILE || x > A.R - TILE) continue;
        if (Math.abs(x - px) < 4 * TILE) continue;
        if (Math.abs(x - this.cx) < this.w / 2 + TILE) continue;
        if (out.some((o) => Math.abs(o - x) < 2 * TILE)) continue;
        out.push(x);
        if (out.length >= 2) break;
      }
      return out;
    }
    raiseAcolytes(spots) {
      const fy = this.floorY();
      for (const x of spots || []) {
        if (this.liveMinions() >= 2) break;
        const m = this.summon('tallowmere_acolyte', x, fy, { dir: x > this.cx ? -1 : 1 });
        if (m) { fx('splash', x, fy - 4, { count: 16, color: '#a8d4e0', speed: 260 }); ripple(x, fy, 60, 1.2); }
      }
    }

    /** AWAKEN (forced at 50 %): the great bell tolls by itself, the hood tears, first acolytes rise. */
    atk_awaken(dt, s) {
      const d = this.stateData;
      if (this.once('start')) {
        if (G.clearProjectiles) G.clearProjectiles(this.room);
        this.snap('stagger');
        sfx('boss_stagger', this.cx, { vol: 0.8 });
        d.tollT = null;
      }
      this.halt();
      if (s < 0.55) { this.set('stagger', 10); return; }
      if (s < 1.15) { this.set('tollWind', 6); if (this.once('wind')) { const at = this.staffWorld('tollWind'); this.telegraph(0.6, { color: '#ffffff', sound: 'tallow_toll_wind', shake: 2, x: at.x, y: at.y }); } return; }
      if (this.once('toll')) {
        this.torn = true;
        this.snap('tollHit');
        sfx('tallow_awaken', this.cx, { vol: 1.2 });
        sfx('bell', this.cx, { vol: 1.3, pitch: 0.55 });
        bellKick(1.4);
        if (G.game) { G.game.shake(12, 0.9); G.game.flash('rgba(220,240,255,0.45)', 0.25); }
        fx('ring', this.cx, this.y + 40, { r: 420, color: '#ffffff', width: 6, life: 0.7 });
        fx('ring', this.cx, this.y + 40, { r: 260, color: PAL.ring, width: 4, life: 0.5 });
        fx('smoke', this.cx, this.y - 40, { count: 14, color: '#cfe0e6', alpha: 0.4, size: 16 });
        fx('wax', this.cx - this.facing * 40, this.y + 30, { count: 14, color: PAL.hood, speed: 380 });
        if (G.Audio && typeof G.Audio.musicLayer === 'function') { try { G.Audio.musicLayer(1); } catch (err) { G.reportError(err, 'musicLayer'); } }
        G.events.emit('tallowmereAwaken', { boss: this });
        d.spots = this.summonSpots();
      }
      if (s < 1.6) { this.set('tollHit', 14); return; }
      this.set('spread', 7);
      if (this.once('warn')) {
        for (const x of d.spots) this.warnZone({ x: x - 32, y: this.floorY() - 22, w: 64, h: 22, dur: 0.75, style: 'floor', color: '#9fd6ff' });
        this.risePts = d.spots.map((x) => ({ x, t0: this.t, dur: 0.75 }));
        sfx('tallow_rise', d.spots[0] || this.cx, { vol: 0.8 });
      }
      if (this.at(2.35)) this.raiseAcolytes(d.spots);
      if (s > 2.9) { this.cooldown('atk:summon', 12); this.endAttack(0.6); }
    }

    // ---------------------------------------------------------------- defeat
    onDefeatStart() {
      this.slamTarget = null;
      this.vx = 0;
      if (G.Audio && typeof G.Audio.musicLayer === 'function') { try { G.Audio.musicLayer(0); } catch (err) { G.reportError(err, 'musicLayer'); } }
    }
    onDefeatSequence(dt, s) {
      // kneel → the great bell's last toll → the flame gutters out → he melts into the flood → victory recorded
      this.defT = s;
      if (s >= 0.8 && !this._lastToll) {
        this._lastToll = true;
        sfx('bell', this.cx, { vol: 1.2, pitch: 0.5 });
        bellKick(1.2);
        if (G.game) { G.game.shake(5, 0.6); G.game.flash('rgba(220,240,255,0.25)', 0.2); }
        fx('ring', this.cx, this.y + 20, { r: 360, color: PAL.ring, width: 4, life: 0.8 });
      }
      this.flameK = clamp(1 - (s - 1.3) / 0.8, 0, 1);
      if (s >= 2.1 && !this._snuffed) {
        this._snuffed = true;
        const top = this.local(6, -240);
        fx('smoke', top.x, top.y, { count: 10, color: '#cfe0e6', alpha: 0.5, size: 12 });
        sfx('enemy_die', this.cx, { vol: 0.7, pitch: 0.5 });
      }
      this.melt = smooth((s - 1.6) / 1.5);
      if (Math.random() < dt * 10 && s > 1.6 && s < 3.2) fx('drip', this.cx + rnd(-80, 80), this.y + rnd(20, 120), { count: 1, color: PAL.tallow });
      if (s >= 3.2 && !this._finished) {
        if (G.game && typeof G.game.setFlag === 'function') {
          G.game.setFlag('tallowmere_rest_x', Math.round(this.cx));
          G.game.setFlag('tallowmere_rest_y', Math.round(this.y + this.h));
          G.game.setFlag('tallowmere_rest_f', this.facing);
        }
        this.finishDefeat();
      }
      if (s >= 4.8) this.remove();
    }

    // ---------------------------------------------------------------- drawing
    drawBounds() { return { x: this.cx - 190, y: this.y + this.h - 330, w: 380, h: 350 }; }
    drawBody(ctx, t) {
      const ch = C();
      const f = this.facing, fx0 = this.cx, fy0 = this.y + this.h;
      const rising = this.risePts && this.risePts.length && this.t - this.risePts[0].t0 < 2;
      if (this.slamTarget == null && !rising && !onScreen(fx0 - 200, fy0 - 340, 400, 360)) return;
      let P = this.pz;
      let melt = this.melt;
      if (this.dying) {
        const k = smooth((this.deathT || 0) / 1.2);
        P = mixPose(POSES.stagger, POSES.kneel, k);
      }
      // landing shadow of the belly slam (floor-side telegraph)
      if (this.slamTarget != null && !this.grounded) {
        const fy = this.floorY(), hgt = clamp((fy - (this.y + this.h)) / 220, 0, 1);
        ctx.fillStyle = 'rgba(6,8,10,' + (0.5 - 0.25 * hgt).toFixed(3) + ')';
        ctx.beginPath(); ctx.ellipse(this.slamTarget, fy - 2, (this.w / 2 + 40) * (1 - 0.3 * hgt), 9, 0, 0, TAU); ctx.fill();
        glow(ctx, this.slamTarget, fy - 6, this.w * 0.8, PAL.tele, 0.22 + 0.2 * (1 - hgt));
        ctx.strokeStyle = 'rgba(255,226,168,' + (0.9 - 0.3 * hgt).toFixed(3) + ')'; ctx.lineWidth = 3;
        ctx.beginPath(); ctx.ellipse(this.slamTarget, fy - 2, this.w / 2 + 46, 11, 0, 0, TAU); ctx.stroke();
      }
      // the flood boiling where acolytes will rise (summon / awaken telegraph)
      if (this.risePts) {
        for (const r of this.risePts) {
          const k = clamp((this.t - r.t0) / r.dur, 0, 1);
          if (k >= 1 && this.t - r.t0 > r.dur + 0.4) continue;
          const fy = this.floorY(), pul = 0.6 + 0.4 * Math.sin(this.t * 18 + r.x);
          glow(ctx, r.x, fy - 8, 60 + 30 * k, '#9fd6ff', (0.25 + 0.35 * k) * pul);
          ctx.strokeStyle = 'rgba(200,236,250,' + (0.4 + 0.5 * k).toFixed(3) + ')'; ctx.lineWidth = 2;
          for (let i = 0; i < 3; i++) {
            const q = ((this.t * 1.6 + i / 3) % 1);
            ctx.globalAlpha = 1 - q;
            ctx.beginPath(); ctx.ellipse(r.x, fy - 4, 10 + q * 34, 2 + q * 5, 0, 0, TAU); ctx.stroke();
          }
          ctx.globalAlpha = 1;
          ctx.fillStyle = '#cfeaf4';
          for (let i = 0; i < 5; i++) { const q = (this.t * 2.2 + hash(i + r.x) ) % 1; ctx.beginPath(); ctx.arc(r.x + (hash(i * 7 + r.x) - 0.5) * 44, fy - 6 - q * 26 * k, 2 + 1.5 * hash(i), 0, TAU); ctx.fill(); }
        }
      }
      if (ch) {
        const air = clamp((this.floorY() - fy0) / 240, 0, 1);
        ch.shadow(ctx, fx0, this.floorY(), 110 * (1 - 0.4 * air) * (1 + 0.5 * melt), 0.5 * (1 - 0.5 * air));
      }
      ctx.save();
      ctx.translate(fx0, fy0);
      ctx.scale(f, 1);
      drawAbbot(ctx, P, { t, phase: this.phase, torn: this.torn, flame: this.flameK, melt, eyes: this.dying ? 0.2 : this.eyesOpen, light: -f, seed: this.seed });
      // the crozier's swing leaves a pale crescent along the floor
      if (ch && ch.slash && this.state === 'sweep' && this.swingAt != null && this.t - this.swingAt < 0.22) {
        const k = (this.t - this.swingAt) / 0.22;
        ch.slash(ctx, 0, -210, 212, 1.0, k, { arc: 1.05, width: 30, color: '#bfe6f4', core: '#ffffff', alpha: 0.9, flip: true });
      }
      ctx.restore();
    }
  }
  Tallowmere.POSES = POSES;
  G.Boss.register('tallowmere', Tallowmere);

  // =====================================================================================================
  // Drowned acolyte (boss-only minion; rises from the flood in phase 2)
  // =====================================================================================================
  const ACO = { hp: 30, w: 30, h: 52 };
  class Acolyte extends G.Enemy {
    constructor(props) {
      super(props, {
        hp: ACO.hp, w: ACO.w, h: ACO.h, cinders: 0, weight: 0.8, knockback: 300, sight: 40 * TILE, z: -1,
        colors: { body: '#7f949c', dark: '#34444d', hit: '#eef6fa', puddle: '#8fa3aa', smoke: '#7e879a', tele: PAL.tele },
      });
      this.rise = 0;
    }
    init() {
      super.init();
      if (this.props.dir) this.facing = this.props.dir;
      this.setState('rise');
      this.hurtable = false;
      this.contactDamage = 0;
    }
    think(dt) {
      const p = this.player;
      switch (this.state) {
        case 'rise':
          this.vx = 0;
          this.rise = clamp(this.stateTime / 0.9, 0, 1);
          if (Math.random() < dt * 12) fx('bubble', this.cx + rnd(-14, 14), this.y + this.h - 4, { count: 1, color: '#a8d4e0' });
          if (this.stateTime >= 0.9) { this.rise = 1; this.hurtable = true; this.contactDamage = 1; this.setState('walk'); }
          break;
        case 'walk':
          if (!this.targetable(p)) { this.stop(); break; }
          this.face();
          if (Math.abs(this.dx()) < 96 && Math.abs(this.dy()) < 70 && this.ready('lunge')) { this.setState('wind'); break; }
          this.approach(p, 78, { stop: 40 });
          break;
        case 'wind':
          this.stop();
          if (this.once('tele')) { this.face(); this.stateData.w = this.telegraph(0.5, { sound: 'acolyte_wind', vol: 0.7 }); }
          if (this.stateTime >= this.stateData.w) this.setState('lunge');
          break;
        case 'lunge':
          if (this.once('go')) { this.vx = this.facing * 300; sfx('tallow_swish', this.cx, { vol: 0.5, pitch: 1.5 }); }
          if (this.stateTime < 0.2) this.strike({ x: this.facing > 0 ? this.cx + 4 : this.cx - 48, y: this.y + 6, w: 44, h: 40 });
          if (this.blockedAhead(this.facing)) this.vx = 0;
          if (this.stateTime > 0.24) { this.vx = 0; this.setState('recover'); }
          break;
        case 'recover':
          this.stop();
          if (this.stateTime > 0.6) { this.cooldown('lunge', 1.1); this.setState('walk'); }
          break;
        default: this.setState('walk');
      }
    }
    drawBody(ctx, t) {
      const ch = C(), outl = OUTL();
      const f = this.facing, fx0 = this.cx, fy0 = this.y + this.h;
      const k = this.state === 'rise' ? smooth(this.rise) : 1;
      const wind = this.is('wind') ? smooth(this.stateTime / 0.5) : 0, lunge = this.is('lunge') ? 1 : 0;
      ctx.save();
      if (k < 1) { ctx.beginPath(); ctx.rect(fx0 - 60, fy0 - 120, 120, 120 - 6); ctx.clip(); }
      ctx.translate(fx0, fy0 + (1 - k) * (this.h + 6));
      ctx.scale(f, 1);
      const sway = Math.sin(this.t * 5) * (this.is('walk') ? 2 : 0.6);
      const lean = -wind * 6 + lunge * 9 + sway;
      if (!ch) { ctx.fillStyle = '#7f949c'; ctx.fillRect(-15, -52, 30, 52); ctx.restore(); return; }
      // back arm
      sleeve(ctx, -6 + lean * 0.5, -36, -14 + lean, -18, 9, '#34444d', outl);
      // cassock
      const robe = new Path2D();
      robe.moveTo(-10 + lean * 0.6, -38); robe.quadraticCurveTo(-16, -18, -17, 0);
      for (let i = 0; i <= 4; i++) robe.lineTo(-17 + i * 8.5, i % 2 ? 4 : 1);
      robe.quadraticCurveTo(16, -18, 10 + lean * 0.6, -38); robe.closePath();
      ch.shape(ctx, robe, { fill: '#4f6571', outline: outl, lw: 2, light: -f, rim: PAL.rim, box: [-17, -40, 17, 4] });
      // hood
      const hx = lean;
      const hood = new Path2D();
      hood.moveTo(hx - 15, -30); hood.quadraticCurveTo(hx - 16, -48, hx - 2, -58); hood.quadraticCurveTo(hx + 8, -52, hx + 15, -30);
      hood.quadraticCurveTo(hx, -24, hx - 15, -30); hood.closePath();
      ch.shape(ctx, hood, { fill: '#768c96', outline: outl, lw: 2, light: -f, rim: PAL.rim, box: [hx - 16, -58, hx + 16, -24] });
      ctx.fillStyle = PAL.cavity; ctx.beginPath(); ctx.ellipse(hx + 6, -38, 6.5, 8, 0.1, 0, TAU); ctx.fill();
      ch.eyes(ctx, hx + 7, -39, { kind: 'pinprick', size: 2.6, gap: 5, glow: true, color: wind > 0 ? '#ffe9b0' : undefined, blink: ch.blinkAt(this.t, this.seed) });
      const tip = ch.wick(ctx, hx - 2, -57, { len: 6, bend: -2, width: 2 });
      ch.pallSmoke(ctx, tip[0], tip[1], t, { count: 3, height: 34, spread: 6, size: 4, alpha: 0.3, seed: this.seed });
      // front arm: claws raised back on the wind-up, thrust on the lunge
      const hxA = lerp(lerp(12, -6, wind), 22, lunge), hyA = lerp(lerp(-20, -44, wind), -30, lunge);
      sleeve(ctx, 6 + lean * 0.5, -35, hxA, hyA, 9, '#4f6571', outl);
      hand(ctx, hxA, hyA, 4.5, outl);
      // water running off
      ctx.fillStyle = PAL.rim;
      for (let i = 0; i < 2; i++) { const kk = (t * 1.1 + i * 0.5 + this.seed) % 1; ctx.globalAlpha = 0.6 * (1 - kk); ctx.beginPath(); ctx.ellipse(-12 + i * 22, -26 + kk * 26, 1.3, 2.6, 0, 0, TAU); ctx.fill(); }
      ctx.globalAlpha = 1;
      ctx.restore();
      if (k < 1) { glow(ctx, fx0, fy0 - 6, 40, '#9fd6ff', 0.4 * (1 - k)); }
    }
  }
  G.registerEnemy('tallowmere_acolyte', Acolyte);

  // =====================================================================================================
  // Room events: the great bell (+ the praying Abbot before the fight, his remains after it) and the flood
  // =====================================================================================================
  function onScreen(x, y, w, h) { const cam = G.camera; return !cam || typeof cam.visible !== 'function' || cam.visible(x, y, w, h, 60); }
  function liveBoss(room) { return room ? room.entities.find((x) => x.type === 'boss_' + ID && !x.dead) : null; }
  function defeated() { return !!(G.game && typeof G.game.bossDefeated === 'function' && G.game.bossDefeated(ID)); }
  let bellSprite = null;
  function makeBellSprite(w, h) {
    if (!G.U || !G.U.makeCanvas) return null;
    const pad = 12;
    const cv = G.U.makeCanvas(w + pad * 2, h + pad * 2);
    const ctx = cv.ctx, ch = C(), outl = OUTL();
    ctx.translate(pad + w / 2, pad);
    // profile of a great bell: crown loops, shoulder, waist, flared sound-bow, lip
    const hw = w / 2;
    const p = new Path2D();
    p.moveTo(-hw * 0.3, 22);
    p.bezierCurveTo(-hw * 0.52, 22, -hw * 0.56, h * 0.18, -hw * 0.56, h * 0.36);
    p.bezierCurveTo(-hw * 0.58, h * 0.6, -hw * 0.8, h * 0.8, -hw * 0.98, h * 0.93);
    p.quadraticCurveTo(-hw, h - 4, -hw * 0.9, h - 2);
    p.quadraticCurveTo(0, h + 6, hw * 0.9, h - 2);
    p.quadraticCurveTo(hw, h - 4, hw * 0.98, h * 0.93);
    p.bezierCurveTo(hw * 0.8, h * 0.8, hw * 0.58, h * 0.6, hw * 0.56, h * 0.36);
    p.bezierCurveTo(hw * 0.56, h * 0.18, hw * 0.52, 22, hw * 0.3, 22);
    p.closePath();
    if (ch) ch.shape(ctx, p, { fill: '#7a6034', outline: outl, lw: 4, light: -1, shade: 0.5, rim: '#e8c886', rimWidth: 3, hi: 0.3, box: [-hw, 22, hw, h + 6] });
    else { ctx.fillStyle = '#7a6034'; ctx.fill(p); }
    ctx.save(); ctx.clip(p);
    // verdigris streaks
    ctx.globalAlpha = 0.45; ctx.strokeStyle = PAL.verdigris; ctx.lineWidth = 6;
    for (let i = 0; i < 9; i++) { const x = -hw * 0.5 + i * hw * 0.125 + (hash(i) - 0.5) * 8; ctx.beginPath(); ctx.moveTo(x * 0.9, 30 + hash(i + 3) * 30); ctx.lineTo(x * 1.25, h * (0.6 + hash(i + 7) * 0.35)); ctx.stroke(); }
    ctx.globalAlpha = 1;
    // bands and an inscription of little flames
    ctx.strokeStyle = '#4e3a20'; ctx.lineWidth = 5;
    for (const [y, k] of [[h * 0.3, 0.57], [h * 0.36, 0.565], [h * 0.82, 0.86], [h * 0.88, 0.93]]) { ctx.beginPath(); ctx.moveTo(-hw * k, y); ctx.quadraticCurveTo(0, y + 7, hw * k, y); ctx.stroke(); }
    ctx.strokeStyle = '#e8c886'; ctx.lineWidth = 1.5;
    for (const [y, k] of [[h * 0.3 - 3, 0.57], [h * 0.82 - 3, 0.86]]) { ctx.beginPath(); ctx.moveTo(-hw * k, y); ctx.quadraticCurveTo(0, y + 7, hw * k, y); ctx.stroke(); }
    ctx.fillStyle = '#c9a564';
    for (let i = 0; i < 7; i++) { const x = -hw * 0.42 + i * hw * 0.14, y = h * 0.46; ctx.beginPath(); ctx.moveTo(x, y + 14); ctx.quadraticCurveTo(x - 6, y + 6, x, y - 6); ctx.quadraticCurveTo(x + 6, y + 6, x, y + 14); ctx.fill(); }
    ctx.restore();
    // the dark mouth under the lip
    ctx.fillStyle = '#120d08'; ctx.beginPath(); ctx.ellipse(0, h - 1, hw * 0.86, 7, 0, 0, Math.PI); ctx.fill();
    // crown loops
    ctx.strokeStyle = outl; ctx.lineWidth = 9;
    ctx.beginPath(); ctx.arc(0, 18, 14, Math.PI, 0); ctx.stroke(); ctx.beginPath(); ctx.arc(-18, 22, 9, Math.PI, 0); ctx.stroke(); ctx.beginPath(); ctx.arc(18, 22, 9, Math.PI, 0); ctx.stroke();
    ctx.strokeStyle = '#a8834a'; ctx.lineWidth = 5;
    ctx.beginPath(); ctx.arc(0, 18, 14, Math.PI, 0); ctx.stroke(); ctx.beginPath(); ctx.arc(-18, 22, 9, Math.PI, 0); ctx.stroke(); ctx.beginPath(); ctx.arc(18, 22, 9, Math.PI, 0); ctx.stroke();
    return { canvas: cv.canvas, pad, w, h };
  }
  G.Events.tallowmere_bell = {
    init(e) {
      BELL.ang = 0; BELL.vel = 0; BELL.flash = 0; BELL.clap = 0; BELL.clapVel = 0; BELL.room = e.room;
      const b = Array.isArray(e.props.bell) ? e.props.bell : [28, 3, 8, 6];
      e.data.x0 = b[0] * TILE; e.data.y0 = b[1] * TILE; e.data.w = b[2] * TILE; e.data.h = b[3] * TILE;
      e.data.vault = (e.props.vault != null ? +e.props.vault : b[1]) * TILE;
      BELL.x0 = e.data.x0 + e.data.w * 0.08; BELL.x1 = e.data.x0 + e.data.w * 0.92; BELL.lipY = e.data.y0 + e.data.h - 14;
      const ar = e.room ? e.room.findType('arena')[0] : null;
      const bx = ar ? (ar.bx != null ? ar.bx : ar.props.bx) : null, by = ar ? (ar.by != null ? ar.by : ar.props.by) : null;
      e.data.abbot = bx != null ? { x: (+bx + 0.5) * TILE, y: (+by + 1) * TILE } : null;
    },
    update(e, dt) {
      const done = defeated();
      // a damped pendulum; it sways in the draught until the Abbot is gone
      const idle = done ? 0 : 0.012 * Math.sin(e.room ? (G.game ? G.game.t : 0) * 0.7 : 0);
      BELL.vel += (-3.2 * (BELL.ang - idle) - 0.55 * BELL.vel) * dt;
      BELL.ang += BELL.vel * dt;
      BELL.clapVel += (-9 * (BELL.clap - BELL.ang * 0.4) - 1.8 * BELL.clapVel) * dt;
      BELL.clap += BELL.clapVel * dt;
      BELL.flash = Math.max(0, BELL.flash - dt * 1.4);
      const D = e.data;
      if (BELL.flash > 0.02) light({ x: D.x0 + D.w / 2, y: D.y0 + D.h - 10, r: 260, color: '#cfeeff', intensity: 0.6 * BELL.flash });
      light({ x: D.x0 + D.w / 2, y: D.y0 + D.h * 0.6, r: 150, color: '#e8c886', intensity: done ? 0.08 : 0.14 });
      if (D.abbot && !done && !liveBoss(e.room)) light({ x: D.abbot.x, y: D.abbot.y - 200, r: 200, color: '#cfe8ff', intensity: 0.4, flicker: true });
    },
    draw(e, ctx, t) {
      const D = e.data;
      const outl = OUTL();
      const pvx = D.x0 + D.w / 2, pvy = D.y0 + 16;
      const showBell = onScreen(D.x0 - 60, D.vault, D.w + 120, D.y0 + D.h + 40 - D.vault);
      // heavy chains from the vault down to the yoke
      if (showBell && D.y0 > D.vault + 4) {
        for (const sx of [-0.36, 0.36]) {
          const cx = pvx + sx * D.w;
          ctx.strokeStyle = outl; ctx.lineWidth = 3;
          for (let y = D.vault; y < D.y0 + 6; y += 14) {
            ctx.beginPath(); ctx.ellipse(cx, y + 7, (y / 14) % 2 < 1 ? 5 : 2, 8, 0, 0, TAU); ctx.stroke();
          }
          ctx.strokeStyle = '#3e4850'; ctx.lineWidth = 1.5;
          for (let y = D.vault; y < D.y0 + 6; y += 14) { ctx.beginPath(); ctx.ellipse(cx, y + 7, (y / 14) % 2 < 1 ? 5 : 2, 8, 0, 0, TAU); ctx.stroke(); }
        }
      }
      // the yoke: a black timber beam with iron straps
      if (showBell) {
      ctx.fillStyle = outl; ctx.fillRect(pvx - D.w * 0.42 - 3, D.y0 + 2, D.w * 0.84 + 6, 26);
      ctx.fillStyle = '#3a2e27'; ctx.fillRect(pvx - D.w * 0.42, D.y0 + 5, D.w * 0.84, 20);
      ctx.fillStyle = '#5a4838'; ctx.fillRect(pvx - D.w * 0.42, D.y0 + 5, D.w * 0.84, 4);
      ctx.fillStyle = '#2a3036';
      for (const s of [-0.34, 0.34]) { ctx.fillRect(pvx + s * D.w - 6, D.y0 - 4, 12, 34); ctx.fillStyle = '#6a7680'; ctx.fillRect(pvx + s * D.w - 2, D.y0 + 12, 4, 4); ctx.fillStyle = '#2a3036'; }
      // the bell
      if (!bellSprite) bellSprite = makeBellSprite(D.w * 0.92, D.h - 24);
      const bs = bellSprite;
      ctx.save();
      ctx.translate(pvx, pvy);
      ctx.rotate(BELL.ang);
      if (bs) {
        // clapper (behind the mouth's lip; peeks out when it swings)
        ctx.save(); ctx.rotate(BELL.clap - BELL.ang);
        ctx.strokeStyle = outl; ctx.lineWidth = 9; ctx.beginPath(); ctx.moveTo(0, 30); ctx.lineTo(0, bs.h - 2); ctx.stroke();
        ctx.strokeStyle = '#4e3a20'; ctx.lineWidth = 5; ctx.beginPath(); ctx.moveTo(0, 30); ctx.lineTo(0, bs.h - 2); ctx.stroke();
        ctx.fillStyle = outl; ctx.beginPath(); ctx.arc(0, bs.h + 2, 13, 0, TAU); ctx.fill();
        ctx.fillStyle = '#5a4428'; ctx.beginPath(); ctx.arc(0, bs.h + 2, 10, 0, TAU); ctx.fill();
        ctx.restore();
        ctx.drawImage(bs.canvas, -bs.w / 2 - bs.pad, -bs.pad);
        if (defeated()) {                                            // silent now: a crack through the sound-bow
          ctx.strokeStyle = '#120d08'; ctx.lineWidth = 2.5;
          ctx.beginPath(); ctx.moveTo(bs.w * 0.3, bs.h * 0.98); ctx.lineTo(bs.w * 0.26, bs.h * 0.84); ctx.lineTo(bs.w * 0.3, bs.h * 0.72); ctx.lineTo(bs.w * 0.24, bs.h * 0.6); ctx.stroke();
        }
      }
      ctx.restore();
      }
      if (BELL.flash > 0.02 && bellSprite) {
        const bs = bellSprite;
        const lx = pvx + Math.sin(-BELL.ang) * bs.h, ly = pvy + Math.cos(BELL.ang) * bs.h;
        glow(ctx, lx, ly - 30, 220, PAL.ring, 0.45 * BELL.flash);
        const ch = C();
        if (ch && ch.ring) ch.ring(ctx, lx, ly - 30, 140 + (1 - BELL.flash) * 260, 1 - BELL.flash, { width: 5, color: PAL.ring, alpha: 0.6 * BELL.flash });
      }
      // before the fight: the Abbot kneels in prayer beneath his bell; after it: what is left of him
      const done = defeated();
      const boss = liveBoss(e.room);
      if (!boss && D.abbot && !done && onScreen(D.abbot.x - 200, D.abbot.y - 320, 400, 340)) {
        const ch = C();
        if (ch) ch.shadow(ctx, D.abbot.x, D.abbot.y, 110, 0.5);
        ctx.save(); ctx.translate(D.abbot.x, D.abbot.y); ctx.scale(-1, 1);
        drawAbbot(ctx, POSES.pray, { t, phase: 1, flame: 0.8, eyes: 0.05, light: 1, seed: 1 });
        ctx.restore();
      } else if (!boss && done && G.game && typeof G.game.getFlag === 'function') {
        const rx = G.game.getFlag('tallowmere_rest_x'), ry = G.game.getFlag('tallowmere_rest_y'), rf = G.game.getFlag('tallowmere_rest_f');
        const x = typeof rx === 'number' ? rx : (D.abbot ? D.abbot.x : pvx), y = typeof ry === 'number' ? ry : (D.abbot ? D.abbot.y : D.y0 + D.h * 3);
        if (onScreen(x - 260, y - 200, 520, 220)) drawRemains(ctx, x, y, rf === 1 ? 1 : -1, t);
      }
    },
  };

  G.Events.tallowmere_flood = {
    init(e) {
      RIPPLES.length = 0;
      e.data.fy = (+e.props.floor || 24) * TILE;
      e.data.x0 = (+e.props.c0 || 1) * TILE; e.data.x1 = ((e.props.c1 != null ? +e.props.c1 : 62) + 1) * TILE;
      e.data.wadeT = 0;
    },
    update(e, dt) {
      for (const r of RIPPLES) r.t += dt;
      for (let i = RIPPLES.length - 1; i >= 0; i--) if (RIPPLES[i].t >= RIPPLES[i].life) RIPPLES.splice(i, 1);
      const p = G.game && G.game.player;
      if (p && !p.dead) {
        const feet = p.y + p.h, x = p.x + p.w / 2;
        if (Math.abs(feet - e.data.fy) < 4 && x > e.data.x0 && x < e.data.x1 && Math.abs(p.vx || 0) > 60) {
          e.data.wadeT += dt;
          if (e.data.wadeT > 0.2) { e.data.wadeT = 0; ripple(x, e.data.fy, 22, 0.7); }
        }
      }
    },
    draw(e, ctx, t) {
      const D = e.data, fy = D.fy;
      const cam = G.camera;
      const vx0 = cam ? Math.max(D.x0, cam.x - 20) : D.x0, vx1 = cam ? Math.min(D.x1, cam.x + (cam.w || 1280) + 20) : D.x1;
      if (vx1 <= vx0) return;
      ctx.fillStyle = 'rgba(64,112,128,0.38)';
      ctx.fillRect(vx0, fy - 7, vx1 - vx0, 7);
      ctx.fillStyle = 'rgba(190,226,236,0.32)';
      const step = 26;
      for (let x = Math.floor(vx0 / step) * step; x < vx1; x += step) {
        const w = 8 + 8 * (0.5 + 0.5 * Math.sin(x * 0.07 + t * 1.3));
        ctx.fillRect(x + Math.sin(t * 0.9 + x) * 4, fy - 7, w, 1.5);
      }
      ctx.strokeStyle = 'rgba(200,232,240,0.55)';
      ctx.lineWidth = 1.5;
      for (const r of RIPPLES) {
        if (r.x < vx0 - 100 || r.x > vx1 + 100) continue;
        const k = r.t / r.life, R = r.size * (0.3 + k);
        ctx.globalAlpha = 1 - k;
        ctx.beginPath(); ctx.ellipse(r.x, r.y - 4, R, R * 0.12 + 1, 0, 0, TAU); ctx.stroke();
        if (r.size > 50) { ctx.beginPath(); ctx.ellipse(r.x, r.y - 4, R * 0.6, R * 0.08 + 1, 0, 0, TAU); ctx.stroke(); }
      }
      ctx.globalAlpha = 1;
    },
  };

  // =====================================================================================================
  // Sound design (own sfx; defined once at load)
  // =====================================================================================================
  (function defineSounds() {
    const A = G.Audio;
    if (!A || typeof A.defineSfx !== 'function') return;
    const def = (name, o) => { try { A.defineSfx(name, o); } catch (err) { G.reportError(err, 'tallowmere sfx ' + name); } };
    // the crozier raised: a rising, shimmering hum gathering in the hand-bell
    def('tallow_toll_wind', { vol: 1.6, reverb: 0.4, prio: 2, play(k) {
      const v = k.r(0.97, 1.03);
      k.tone({ f: 220 * v, f1: 330 * v, glide: 0.6, wave: 'glass', a: 0.25, hold: 0.25, d: 0.35, g: 0.12 });
      k.tone({ f: 110 * v, f1: 165 * v, glide: 0.6, type: 'sine', a: 0.3, hold: 0.2, d: 0.35, g: 0.16 });
      k.noise({ color: 'pink', bp: 1800, bp1: 4200, Q: 2, a: 0.4, d: 0.3, g: 0.05, sweep: 0.6 });
    } });
    // the strike on the floor: a deep thud under the bell
    def('tallow_toll', { vol: 1.8, reverb: 0.5, prio: 3, play(k) {
      k.tone({ f: 82, f1: 50, glide: 0.35, type: 'sine', a: 0.002, d: 0.7, g: 0.5 });
      k.noise({ color: 'brown', lp: 700, a: 0.002, d: 0.45, g: 0.35 });
      k.tone({ f: 146.8 * k.r(0.99, 1.01), type: 'sine', fm: { ratio: 3.5, index: 3, index1: 0.4, d: 1.2 }, a: 0.002, d: 2.2, g: 0.16 });
    } });
    // a low chant (vigil, summon, fight start)
    def('tallow_chant', { vol: 1.6, reverb: 0.6, prio: 2, play(k) {
      const v = k.r(0.98, 1.02);
      k.tone({ f: 98 * v, wave: 'organ', a: 0.12, hold: 0.35, d: 0.6, g: 0.13, vib: { rate: 5, depth: 12 } });
      k.tone({ f: 146.8 * v, wave: 'organ', a: 0.14, hold: 0.3, d: 0.55, g: 0.08, vib: { rate: 4.6, depth: 10 } });
      k.tone({ f: 196 * v, wave: 'reed', a: 0.2, hold: 0.25, d: 0.5, g: 0.05 });
      k.noise({ color: 'pink', bp: 700, Q: 2.5, a: 0.15, hold: 0.25, d: 0.4, g: 0.05 });
    } });
    // a drop swelling on the vault: a tiny glassy glint
    def('tallow_glint', { vol: 1.2, reverb: 0.5, prio: 1, play(k) {
      const f = k.r(2400, 2900);
      k.tone({ f, type: 'sine', a: 0.002, d: 0.25, g: 0.06 });
      k.tone({ f: f * 1.5, type: 'sine', a: 0.002, d: 0.18, g: 0.03, at: 0.04 });
    } });
    // molten wax hitting the wet floor
    def('tallow_hiss', { vol: 1.3, reverb: 0.2, prio: 1, play(k) {
      k.noise({ color: 'white', hp: 2600, a: 0.005, d: 0.35, g: 0.15 });
      k.noise({ color: 'pink', bp: 700, Q: 1, a: 0.002, d: 0.14, g: 0.18 });
      k.tone({ f: 320, f1: 120, glide: 0.08, type: 'sine', a: 0.002, d: 0.12, g: 0.12 });
    } });
    // the belly-slam wind-up: a low groan
    def('tallow_grunt', { vol: 1.8, reverb: 0.3, prio: 2, play(k) {
      const v = k.r(0.95, 1.05);
      k.tone({ f: 72 * v, f1: 52 * v, glide: 0.5, type: 'sawtooth', lp: 420, a: 0.08, hold: 0.25, d: 0.35, g: 0.28 });
      k.noise({ color: 'brown', lp: 320, a: 0.1, hold: 0.2, d: 0.3, g: 0.14 });
    } });
    // the belly flop: a heavy slosh of floodwater
    def('tallow_splash', { vol: 2.0, reverb: 0.35, prio: 3, play(k) {
      k.noise({ color: 'brown', lp: 900, lp1: 300, sweep: 0.5, a: 0.003, d: 0.8, g: 0.5 });
      k.noise({ color: 'white', bp: 2500, Q: 0.8, a: 0.01, d: 0.45, g: 0.14 });
      k.tone({ f: 60, f1: 34, glide: 0.3, type: 'sine', a: 0.002, d: 0.5, g: 0.5 });
    } });
    // the crozier drawn back: a creak and a small bell
    def('tallow_sweep_wind', { vol: 1.5, reverb: 0.3, prio: 2, play(k) {
      k.noise({ color: 'pink', bp: 500, bp1: 1400, sweep: 0.4, Q: 3, a: 0.2, d: 0.25, g: 0.1 });
      k.tone({ f: 1320 * k.r(0.98, 1.02), type: 'sine', fm: { ratio: 2.7, index: 2, d: 0.4 }, a: 0.002, d: 0.5, g: 0.06, at: 0.05 });
    } });
    def('tallow_swish', { vol: 1.6, reverb: 0.15, prio: 2, play(k) {
      k.noise({ color: 'pink', bp: 900, bp1: 2400, sweep: 0.15, Q: 1.2, a: 0.01, d: 0.22, g: 0.3 });
    } });
    // lullaby: a breath and two glass notes
    def('tallow_hush', { vol: 1.5, reverb: 0.6, prio: 2, play(k) {
      k.noise({ color: 'pink', bp: 3000, Q: 0.7, a: 0.15, hold: 0.2, d: 0.35, g: 0.07 });
      k.tone({ f: 880, wave: 'glass', a: 0.01, d: 0.9, g: 0.07 });
      k.tone({ f: 1318.5, wave: 'glass', a: 0.01, d: 0.8, g: 0.05, at: 0.12 });
    } });
    def('tallow_mote', { vol: 1.1, reverb: 0.5, prio: 1, play(k) {
      k.tone({ f: 1046.5, f1: 1568, glide: 0.15, wave: 'glass', a: 0.005, d: 0.4, g: 0.05 });
    } });
    // the flood bubbles; something rises
    def('tallow_rise', { vol: 1.5, reverb: 0.4, prio: 2, play(k) {
      for (let i = 0; i < 7; i++) { const f = k.r(280, 720); k.tone({ f, f1: f * 1.6, glide: 0.05, type: 'sine', a: 0.002, d: 0.07, g: 0.06, at: i * 0.09 }); }
      k.noise({ color: 'brown', lp: 700, a: 0.25, d: 0.5, g: 0.18 });
    } });
    def('acolyte_wind', { vol: 1.2, reverb: 0.2, prio: 1, play(k) {
      k.noise({ color: 'pink', hp: 1800, a: 0.08, hold: 0.15, d: 0.2, g: 0.08 });
      k.tone({ f: 190 * k.r(0.95, 1.05), f1: 150, glide: 0.3, type: 'triangle', lp: 900, a: 0.05, hold: 0.15, d: 0.2, g: 0.08 });
    } });
    // phase 2: the great bell tolls by itself
    def('tallow_awaken', { vol: 2.0, reverb: 0.7, prio: 3, play(k) {
      k.tone({ f: 73.4, type: 'sine', fm: { ratio: 2.76, index: 4, index1: 0.5, d: 2.5 }, a: 0.003, d: 3.5, g: 0.3 });
      k.tone({ f: 55, f1: 41, glide: 1.2, type: 'sawtooth', lp: 300, a: 0.05, hold: 0.4, d: 1.0, g: 0.2 });
      k.noise({ color: 'brown', lp: 500, a: 0.02, d: 1.4, g: 0.3 });
    } });
  })();

  G.Tallowmere = { POSES, PAL, HP, BW, BH, STAGGER, drawAbbot, drawRemains, staffGeom, buildGeom, ceilingAt, surfaceBelow, BELL, RIPPLES, Tallowmere, Acolyte, ACO };
})();
