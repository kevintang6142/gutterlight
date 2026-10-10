// src/entities/bosses/sable.js — SABLE, the Unlit (module boss-sable). Queen Lucerne's daughter: tall, slender,
// jet-black wax, a long red scarf (verlet cloth), a hooked snuffer-spear; never lit (two small white eye-points).
//
// One class, two duels (G.Boss.register('sable1' | 'sable2', Sable) → entity types boss_sable1 / boss_sable2):
//   sable1 — Meltbloom, arena mb_07 (player Brand L0–1, no dash): HP 230, phase 2 at 50 %.
//            lunge · hook (boomerang) · dive (aerial dive strike) · whirl (smoke whirl) · evade (back-hop, harmless).
//            Beaten, she does not die: she staggers to one knee, speaks (G.Text.bosses.sable1.defeat) and leaps away.
//   sable2 — the Rime, arena ri_07 (Brand L2+, every movement ability): HP 800, phases at 60 % / 30 %; faster, chains
//            her moves into strings with short pauses between them, frost-smoke moves: frost (ground frost line),
//            triple hook, rising (anti-air), frost-wave dives. Beaten, she yields: kneels, then withdraws (npc sable
//            stage 2 waits in ri_08).
// Also registers: projectiles 'sable_hook' (the whirling spear / its smoke copies) and 'sable_frost' (ground frost
// line), sfx sable_*, and the room event script 'sable_wait' (she waits at her spot before the duel).
(function () {
  'use strict';
  const G = globalThis.G;
  if (!G || !G.Boss || !G.Projectile) return;

  const TILE = G.CONST.TILE;
  const GRAV = (G.CONST && G.CONST.GRAVITY) || 2600;
  const TAU = Math.PI * 2;
  const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
  const lerp = (a, b, t) => a + (b - a) * t;
  const rnd = (a, b) => a + Math.random() * (b - a);
  const ease = (t) => { t = clamp(t, 0, 1); return t * t * (3 - 2 * t); };
  const C = () => (G.Art && G.Art.char) || null;
  const glow = (ctx, x, y, r, color, a) => { if (G.Art && G.Art.glow) G.Art.glow(ctx, x, y, r, color, a); else if (G.fx && G.fx.glowAt) G.fx.glowAt(ctx, x, y, r, color, a); };
  const burst = (k, x, y, o) => { if (G.fx) G.fx.burst(k, x, y, o); };

  // ---------------------------------------------------------------------------------------------------------
  // Palette
  // ---------------------------------------------------------------------------------------------------------
  const OUT = '#06050a';
  const WAX = '#2b2832', WAX_HI = '#5a5466', COAT = '#24212b', LIMB = '#141218', LEG = '#0e0c12';
  const RIM = '#b8a8d8', RIM_ICE = '#bfe6ff';
  const SCARF = '#a8222a', SCARF_DK = '#2a0408', SCARF_ICE = '#7a2e3c';
  const IRON = '#2e2c36', IRON_HI = '#8d86a8', SHAFT = '#24222a';
  const EYE = '#f4efff', EYE_GLOW = '#d8ccff', EYE_ICE = '#d8f6ff', EYE_ICE_GLOW = '#9ae0ff';
  const SMOKE = '#5d5868', FROST = '#bfeaff', FROST_DK = '#6fa8c8';
  const TELE = '#f2e8ff', TELE_ICE = '#c8f2ff';
  const SP_LEN = 168;            // spear length (butt → hook tip)

  // ---------------------------------------------------------------------------------------------------------
  // Sound design (own sfx; registered once)
  // ---------------------------------------------------------------------------------------------------------
  (function defineSounds() {
    const A = G.Audio;
    if (!A || typeof A.defineSfx !== 'function') return;
    // the spear drawn back: a bright metallic scrape rising into a ring (her signature tell)
    A.defineSfx('sable_draw', { vol: 1.8, reverb: 0.25, prio: 2, play(k) {
      const v = k.r(0.96, 1.04);
      k.noise({ bp: 2400 * v, bp1: 6200 * v, Q: 3, a: 0.04, hold: 0.08, d: 0.22, g: 0.16, sweep: 0.3 });
      k.tone({ f: 1320 * v, f1: 1760 * v, glide: 0.3, type: 'triangle', a: 0.03, d: 0.6, g: 0.05 });
      k.tone({ f: 1320 * 2.76 * v, a: 0.002, d: 0.3, g: 0.018, at: 0.05 });
      k.noise({ color: 'pink', bp: 700, Q: 1, a: 0.06, d: 0.18, g: 0.06 });
    } });
    // the thrust: a fast cutting whoosh with a cloth snap
    A.defineSfx('sable_thrust', { vol: 1.8, reverb: 0.12, prio: 2, play(k) {
      const v = k.r(0.92, 1.08);
      k.noise({ bp: 900 * v, bp1: 3600 * v, Q: 1.2, a: 0.01, d: 0.2, g: 0.38, sweep: 0.15 });
      k.noise({ hp: 5000, a: 0.002, d: 0.06, g: 0.12, at: 0.02 });
      k.tone({ f: 180 * v, f1: 90 * v, glide: 0.15, a: 0.005, d: 0.16, g: 0.08 });
    } });
    // spear cocked for the throw: leather creak + a low hum
    A.defineSfx('sable_cock', { vol: 1.7, reverb: 0.15, prio: 2, play(k) {
      const v = k.r(0.95, 1.05);
      for (let i = 0; i < 5; i++) k.noise({ bp: k.r(900, 1800), Q: 6, a: 0.003, d: k.r(0.03, 0.06), g: 0.06, at: i * 0.05 + k.r(0, 0.02) });
      k.tone({ f: 220 * v, f1: 330 * v, glide: 0.4, type: 'sawtooth', lp: 900, a: 0.08, d: 0.45, g: 0.05 });
      k.tone({ f: 990 * v, a: 0.01, d: 0.5, g: 0.025, at: 0.12 });
    } });
    // the thrown spear whirring through the air (re-triggered while it flies)
    A.defineSfx('sable_whirr', { vol: 1.3, reverb: 0.08, prio: 1, play(k) {
      const v = k.r(0.95, 1.05);
      k.noise({ bp: 760 * v, Q: 4, a: 0.02, hold: 0.05, d: 0.12, g: 0.18 });
      k.tone({ f: 140 * v, type: 'sawtooth', lp: 700, a: 0.02, hold: 0.06, d: 0.1, g: 0.05, vib: { rate: 30, depth: 80 } });
    } });
    // caught back in the hand: a dry clack and a short ring
    A.defineSfx('sable_catch', { vol: 1.6, reverb: 0.2, prio: 2, play(k) {
      k.noise({ bp: 2200, Q: 2, a: 0.001, d: 0.05, g: 0.3 });
      k.tone({ f: 1480, a: 0.001, d: 0.35, g: 0.05 });
      k.tone({ f: 2210, a: 0.001, d: 0.2, g: 0.025 });
    } });
    // crouch and spring: cloth gathering, a sharp intake
    A.defineSfx('sable_leap', { vol: 1.7, reverb: 0.15, prio: 2, play(k) {
      const v = k.r(0.95, 1.05);
      k.noise({ bp: 500 * v, bp1: 1800 * v, Q: 1.4, a: 0.05, d: 0.3, g: 0.22, sweep: 0.3 });
      k.noise({ hp: 3000, a: 0.04, d: 0.18, g: 0.06, at: 0.05 });
      k.tone({ f: 330 * v, f1: 660 * v, glide: 0.3, type: 'triangle', a: 0.05, d: 0.35, g: 0.04 });
    } });
    // the dive: a falling whistle
    A.defineSfx('sable_dive', { vol: 1.7, reverb: 0.15, prio: 2, play(k) {
      const v = k.r(0.96, 1.04);
      k.tone({ f: 1900 * v, f1: 520 * v, glide: 0.35, type: 'sine', a: 0.01, d: 0.4, g: 0.07 });
      k.noise({ bp: 1400 * v, bp1: 500 * v, Q: 2, a: 0.02, d: 0.35, g: 0.25, sweep: 0.35 });
    } });
    // spear point into the floor: thud, crack and a long iron ring
    A.defineSfx('sable_impact', { vol: 2.0, reverb: 0.3, prio: 3, play(k) {
      const v = k.r(0.95, 1.05);
      k.tone({ f: 82 * v, f1: 44 * v, glide: 0.3, a: 0.002, d: 0.35, g: 0.5 });
      k.noise({ lp: 1400 * v, lp1: 200, a: 0.002, d: 0.3, g: 0.32, sweep: 0.3 });
      k.tone({ f: 740 * v, a: 0.001, d: 0.8, g: 0.05 });
      k.tone({ f: 740 * 2.4 * v, a: 0.001, d: 0.4, g: 0.025 });
      for (let i = 0; i < 6; i++) k.noise({ bp: k.r(800, 2600), Q: 1.6, a: 0.001, d: k.r(0.02, 0.06), g: 0.08, at: k.r(0, 0.2) });
    } });
    // smoke gathering for the whirl: a deep breathy hiss swelling
    A.defineSfx('sable_smoke', { vol: 1.7, reverb: 0.35, prio: 2, play(k) {
      k.noise({ color: 'pink', bp: 420, bp1: 1300, Q: 0.8, a: 0.35, d: 0.45, g: 0.26, sweep: 0.6 });
      k.tone({ f: 98, f1: 147, glide: 0.6, type: 'sawtooth', lp: 400, a: 0.3, d: 0.4, g: 0.06 });
    } });
    // one revolution of the whirl
    A.defineSfx('sable_whirl', { vol: 1.5, reverb: 0.15, prio: 1, play(k) {
      const v = k.r(0.92, 1.08);
      k.noise({ bp: 380 * v, bp1: 1200 * v, Q: 1.3, a: 0.06, d: 0.18, g: 0.3, sweep: 0.2 });
      k.noise({ bp: 2600 * v, Q: 3, a: 0.04, d: 0.08, g: 0.05 });
    } });
    // frost: the spear raised, cold mist hissing at her feet
    A.defineSfx('sable_chill', { vol: 1.7, reverb: 0.4, prio: 2, play(k) {
      k.noise({ hp: 3800, hp1: 6500, a: 0.15, d: 0.5, g: 0.1, sweep: 0.5 });
      k.tone({ f: 1760, f1: 2640, glide: 0.5, wave: 'glass', a: 0.08, d: 0.6, g: 0.04 });
      k.tone({ f: 2093, a: 0.1, d: 0.5, g: 0.02, at: 0.1 });
    } });
    // the frost line racing along the floor: crackling ice
    A.defineSfx('sable_frost', { vol: 1.9, reverb: 0.25, prio: 3, play(k) {
      for (let i = 0; i < 16; i++) k.noise({ hp: k.r(2400, 5200), a: 0.0008, d: k.r(0.015, 0.05), g: k.r(0.06, 0.16), at: k.r(0, 0.4) });
      k.tone({ f: 70, f1: 50, glide: 0.2, a: 0.002, d: 0.25, g: 0.35 });
      k.tone({ f: 1568, wave: 'glass', a: 0.002, d: 0.5, g: 0.04 });
    } });
    // ice breaking off (phase change in the Rime)
    A.defineSfx('sable_shatter', { vol: 2.0, reverb: 0.4, prio: 3, play(k) {
      for (let i = 0; i < 22; i++) k.noise({ hp: k.r(2000, 6000), a: 0.0006, d: k.r(0.02, 0.08), g: k.r(0.06, 0.2), at: k.r(0, 0.3) });
      for (const f of [1975, 2637, 3136]) k.tone({ f: f * k.r(0.98, 1.02), wave: 'glass', a: 0.001, d: k.r(0.5, 0.9), g: 0.03, at: k.r(0, 0.1) });
      k.tone({ f: 98, f1: 60, glide: 0.3, a: 0.002, d: 0.4, g: 0.3 });
    } });
    // the flourish: spear spun overhead, a cutting rising sweep, a struck note
    A.defineSfx('sable_flourish', { vol: 2.0, reverb: 0.4, prio: 3, play(k) {
      for (let i = 0; i < 4; i++) k.noise({ bp: 500 + i * 300, bp1: 1400 + i * 500, Q: 1.3, a: 0.04, d: 0.16, g: 0.2, at: i * 0.13, sweep: 0.15 });
      k.tone({ f: 293.7, a: 0.01, hold: 0.2, d: 1.2, g: 0.07, at: 0.55, type: 'triangle' });
      k.tone({ f: 440, a: 0.01, hold: 0.2, d: 1.0, g: 0.05, at: 0.55, type: 'triangle' });
      k.tone({ f: 1174, a: 0.001, d: 0.9, g: 0.03, at: 0.55 });
      k.tone({ f: 65, f1: 45, glide: 0.4, a: 0.002, d: 0.5, g: 0.4, at: 0.55 });
    } });
  })();

  // ---------------------------------------------------------------------------------------------------------
  // Poses (local frame: origin at the feet centre, +x = the way she faces, +y = down)
  //   crouch 0..1 · lean (rad, + = forward) · fw/bk front/back foot x · fy1/fy2 foot lift · tuck 0..1 (airborne legs)
  //   kneel 0..1 · gx/gy front-hand grip · sa spear angle (0 forward, +π/2 down, −π/2 up) · sg grip distance from
  //   the butt · two 0..1 (rear hand on the shaft) · hx2/hy2 free rear hand · head tilt · hem flare
  // ---------------------------------------------------------------------------------------------------------
  const BASE = { crouch: 0.1, lean: 0.05, fw: 12, bk: -13, fy1: 0, fy2: 0, tuck: 0, kneel: 0, gx: 20, gy: -52, sa: 0.45, sg: 112, two: 0, hx2: -12, hy2: -44, head: 0.05, hem: 0 };
  const KEYS = Object.keys(BASE);
  const pose = (o) => Object.assign({}, BASE, o || {});
  const P = {
    stand:     pose({ gx: 16, gy: -50, sa: -1.42, sg: 50, hx2: -10, hy2: -44 }),
    guard:     pose({ crouch: 0.22, lean: 0.12, fw: 18, bk: -18, gx: 24, gy: -50, sa: 0.28, sg: 104, two: 0.9, head: 0.08 }),
    walk:      pose({ crouch: 0.16, lean: 0.2, fw: 0, bk: 0, gx: 22, gy: -48, sa: 0.35, sg: 110, two: 0.5, hem: 0.4 }),
    lungeWind: pose({ crouch: 0.5, lean: -0.12, fw: 26, bk: -28, gx: -16, gy: -48, sa: 0.04, sg: 82, two: 0.9, head: 0.12, hem: 0.3 }),
    lunge:     pose({ crouch: 0.34, lean: 0.55, fw: 48, bk: -42, fy2: 2, gx: 44, gy: -46, sa: 0, sg: 40, two: 0, hx2: -34, hy2: -66, head: -0.2, hem: 1 }),
    lungeRec:  pose({ crouch: 0.3, lean: 0.36, fw: 40, bk: -34, gx: 38, gy: -40, sa: 0.12, sg: 52, two: 0, hx2: -26, hy2: -54, head: 0, hem: 0.5 }),
    throwWind: pose({ crouch: 0.3, lean: -0.22, fw: 20, bk: -24, gx: -30, gy: -86, sa: -0.12, sg: 84, two: 0, hx2: 18, hy2: -60, head: 0, hem: 0.2 }),
    throwRel:  pose({ crouch: 0.24, lean: 0.32, fw: 26, bk: -26, gx: 40, gy: -70, sa: 0, sg: 84, two: 0, hx2: -24, hy2: -50, head: -0.1, hem: 0.6 }),
    catchWait: pose({ crouch: 0.16, lean: -0.04, fw: 16, bk: -16, gx: 12, gy: -122, sa: -1.2, sg: 84, two: 0, hx2: -14, hy2: -46, head: -0.25 }),
    diveWind:  pose({ crouch: 0.68, lean: 0.18, fw: 18, bk: -18, gx: 14, gy: -38, sa: -1.25, sg: 100, two: 1, head: 0.15, hem: 0.3 }),
    air:       pose({ crouch: 0.15, lean: 0.06, tuck: 0.55, gx: 12, gy: -82, sa: -1.35, sg: 92, two: 1, head: -0.1, hem: 0.8 }),
    hang:      pose({ crouch: 0.1, lean: 0.22, tuck: 0.95, gx: 20, gy: -52, sa: 1.2, sg: 118, two: 1, head: 0.35, hem: 0.9 }),
    fall:      pose({ crouch: 0.1, lean: 0.35, tuck: 0.3, gx: 16, gy: -44, sa: 1.3, sg: 126, two: 1, head: 0.3, hem: 1 }),
    land:      pose({ crouch: 0.72, lean: 0.48, fw: 30, bk: -32, gx: 34, gy: -26, sa: 1.32, sg: 128, two: 1, head: 0.25, hem: 0.6 }),
    whirlWind: pose({ crouch: 0.26, lean: -0.04, fw: 20, bk: -20, gx: 4, gy: -104, sa: 0, sg: 84, two: 0, hx2: -24, hy2: -62, head: -0.1, hem: 0.3 }),
    whirl:     pose({ crouch: 0.3, lean: 0.02, fw: 22, bk: -22, gx: 2, gy: -108, sa: 0, sg: 84, two: 0, hx2: 20, hy2: -64, head: 0, hem: 1 }),
    dizzy:     pose({ crouch: 0.38, lean: 0.28, fw: 18, bk: -16, gx: 26, gy: -36, sa: 1.0, sg: 128, two: 0, hx2: -10, hy2: -40, head: 0.4 }),
    frostWind: pose({ crouch: 0.3, lean: -0.16, fw: 18, bk: -20, gx: 8, gy: -112, sa: 1.5, sg: 74, two: 1, head: -0.15, hem: 0.3 }),
    frostSlam: pose({ crouch: 0.66, lean: 0.45, fw: 28, bk: -30, gx: 30, gy: -36, sa: 1.32, sg: 124, two: 1, head: 0.2, hem: 0.7 }),
    risingWind:pose({ crouch: 0.74, lean: 0.12, fw: 16, bk: -18, gx: 18, gy: -30, sa: -1.05, sg: 66, two: 1, head: -0.2, hem: 0.3 }),
    rising:    pose({ crouch: 0, lean: -0.02, tuck: 0.25, gx: 6, gy: -116, sa: -1.55, sg: 36, two: 1, head: -0.35, hem: 1 }),
    evade:     pose({ crouch: 0.1, lean: -0.38, tuck: 0.85, gx: 14, gy: -66, sa: 0.3, sg: 100, two: 0.6, head: -0.1, hem: 1 }),
    stagger:   pose({ crouch: 0.46, lean: 0.5, fw: 16, bk: -20, gx: 30, gy: -28, sa: 1.2, sg: 140, two: 0, hx2: -2, hy2: -36, head: 0.55, hem: 0.2 }),
    kneel:     pose({ crouch: 0, kneel: 1, lean: 0.28, fw: 16, bk: -30, gx: 22, gy: -66, sa: -1.5, sg: 66, two: 0, hx2: 4, hy2: -40, head: 0.6 }),
    halfKneel: pose({ crouch: 0, kneel: 0.75, lean: 0.4, fw: 16, bk: -30, gx: 26, gy: -50, sa: -1.45, sg: 50, two: 0, hx2: 2, hy2: -38, head: 0.5 }),
    flourish:  pose({ crouch: 0.2, lean: -0.08, fw: 22, bk: -22, gx: 2, gy: -106, sa: 0, sg: 84, two: 0, hx2: -26, hy2: -70, head: -0.2, hem: 0.8 }),
  };

  // ---------------------------------------------------------------------------------------------------------
  // Rig: pose → joint positions (local)
  // ---------------------------------------------------------------------------------------------------------
  function ik(sx, sy, tx, ty, l1, l2, bend) {
    let dx = tx - sx, dy = ty - sy;
    let d = Math.hypot(dx, dy) || 1e-3;
    const max = (l1 + l2) * 0.999;
    if (d > max) { tx = sx + dx / d * max; ty = sy + dy / d * max; dx = tx - sx; dy = ty - sy; d = max; }
    const a = Math.atan2(dy, dx);
    const c = clamp((l1 * l1 + d * d - l2 * l2) / (2 * l1 * d), -1, 1);
    const b = Math.acos(c) * bend;
    return { kx: sx + Math.cos(a - b) * l1, ky: sy + Math.sin(a - b) * l1, ex: tx, ey: ty };
  }
  function rig(p) {
    const kn = p.kneel;
    let hipY = -(54 - 24 * p.crouch) + p.tuck * 6;
    hipY = lerp(hipY, -32, kn);
    const hip = { x: -p.lean * 6, y: hipY };
    const sl = Math.sin(p.lean), cl = Math.cos(p.lean);
    const chest = { x: hip.x + sl * 36, y: hip.y - cl * 36 };
    const neck = { x: chest.x + sl * 6, y: chest.y - cl * 6 };
    const ha = p.lean + p.head;
    const head = { x: neck.x + Math.sin(ha) * 13, y: neck.y - Math.cos(ha) * 13, a: ha };
    // feet
    let f1 = { x: p.fw * (1 - p.tuck * 0.45), y: -p.fy1 - p.tuck * 30 };
    let f2 = { x: p.bk * (1 - p.tuck * 0.45), y: -p.fy2 - p.tuck * 22 };
    if (kn > 0) { f1 = { x: lerp(f1.x, 18, kn), y: lerp(f1.y, 0, kn) }; f2 = { x: lerp(f2.x, -30, kn), y: lerp(f2.y, -1, kn) }; }
    const L1 = ik(hip.x + 2, hip.y, f1.x, f1.y, 30, 30, -1);
    let L2 = ik(hip.x - 2, hip.y, f2.x, f2.y, 30, 30, -1);
    if (kn > 0.01) L2 = { kx: lerp(L2.kx, -2, kn), ky: lerp(L2.ky, -3, kn), ex: f2.x, ey: f2.y };
    // shoulders, spear, hands
    const s1 = { x: chest.x + cl * 2 + sl * 3, y: chest.y + sl * 2 + cl * 3 };
    const s2 = { x: chest.x - cl * 3 + sl * 2, y: chest.y - sl * 3 + cl * 2 };
    let gx = p.gx, gy = p.gy;
    const rd = Math.hypot(gx - s1.x, gy - s1.y), reach = 49;
    if (rd > reach) { gx = s1.x + (gx - s1.x) / rd * reach; gy = s1.y + (gy - s1.y) / rd * reach; }
    const dx = Math.cos(p.sa), dy = Math.sin(p.sa);
    const butt = { x: gx - dx * p.sg, y: gy - dy * p.sg };
    const tip = { x: butt.x + dx * SP_LEN, y: butt.y + dy * SP_LEN };
    let h2x = lerp(p.hx2, gx - dx * 42, p.two), h2y = lerp(p.hy2, gy - dy * 42, p.two);
    const rd2 = Math.hypot(h2x - s2.x, h2y - s2.y);
    if (rd2 > reach) { h2x = s2.x + (h2x - s2.x) / rd2 * reach; h2y = s2.y + (h2y - s2.y) / rd2 * reach; }
    const A1 = ik(s1.x, s1.y, gx, gy, 25, 25, 1);
    const A2 = ik(s2.x, s2.y, h2x, h2y, 25, 25, 1);
    return { hip, chest, neck, head, f1, f2, L1, L2, s1, s2, g: { x: gx, y: gy }, h2: { x: h2x, y: h2y }, A1, A2, butt, tip, dx, dy, lean: p.lean };
  }

  // ---------------------------------------------------------------------------------------------------------
  // Drawing (local frame; caller has translated to the feet and mirrored by facing)
  // ---------------------------------------------------------------------------------------------------------
  function limb(ctx, x0, y0, kx, ky, x1, y1, w0, w1, color) {
    ctx.lineCap = 'round'; ctx.lineJoin = 'round';
    ctx.strokeStyle = OUT; ctx.lineWidth = w0 + 2.6;
    ctx.beginPath(); ctx.moveTo(x0, y0); ctx.lineTo(kx, ky); ctx.lineTo(x1, y1); ctx.stroke();
    ctx.strokeStyle = color;
    ctx.lineWidth = w0; ctx.beginPath(); ctx.moveTo(x0, y0); ctx.lineTo(kx, ky); ctx.stroke();
    ctx.lineWidth = w1; ctx.beginPath(); ctx.moveTo(kx, ky); ctx.lineTo(x1, y1); ctx.stroke();
  }
  function boot(ctx, x, y, ang, color) {
    ctx.save(); ctx.translate(x, y); ctx.rotate(ang);
    ctx.beginPath(); ctx.moveTo(-4, -3); ctx.quadraticCurveTo(6, -4, 11, 1); ctx.lineTo(-4, 2); ctx.closePath();
    ctx.fillStyle = color; ctx.strokeStyle = OUT; ctx.lineWidth = 1.6; ctx.fill(); ctx.stroke();
    ctx.restore();
  }
  /** The hooked snuffer-spear from butt (0,0) along +x, length SP_LEN (ctx rotated by the caller). */
  function drawSpear(ctx, o) {
    const L = SP_LEN, cap = L - 34;
    ctx.lineCap = 'round';
    ctx.strokeStyle = OUT; ctx.lineWidth = 5.4;
    ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(cap + 4, 0); ctx.stroke();
    ctx.strokeStyle = SHAFT; ctx.lineWidth = 3.2;
    ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(cap + 4, 0); ctx.stroke();
    ctx.strokeStyle = 'rgba(170,160,200,0.38)'; ctx.lineWidth = 1;
    ctx.beginPath(); ctx.moveTo(4, -1); ctx.lineTo(cap, -1); ctx.stroke();
    // butt ferrule + red tassel cord near the head
    ctx.fillStyle = IRON; ctx.strokeStyle = OUT; ctx.lineWidth = 1.4;
    ctx.beginPath(); ctx.ellipse(1, 0, 4, 3, 0, 0, TAU); ctx.fill(); ctx.stroke();
    ctx.strokeStyle = o.frozen ? SCARF_ICE : SCARF; ctx.lineWidth = 2;
    ctx.beginPath(); ctx.moveTo(cap - 6, 2); ctx.quadraticCurveTo(cap - 10, 10 + (o.sway || 0), cap - 16, 15 + (o.sway || 0)); ctx.stroke();
    // the snuffer cap (bell, mouth toward the butt)
    const bell = new Path2D();
    bell.moveTo(cap, -8); bell.quadraticCurveTo(cap + 14, -9, cap + 20, 0); bell.quadraticCurveTo(cap + 14, 9, cap, 8);
    bell.quadraticCurveTo(cap + 3, 0, cap, -8); bell.closePath();
    ctx.fillStyle = IRON; ctx.strokeStyle = OUT; ctx.lineWidth = 1.6; ctx.fill(bell); ctx.stroke(bell);
    ctx.strokeStyle = IRON_HI; ctx.lineWidth = 1; ctx.beginPath(); ctx.moveTo(cap + 3, -6); ctx.quadraticCurveTo(cap + 13, -7, cap + 18, -1); ctx.stroke();
    // the hook: a curved blade sweeping forward and back, sharp tip; plus a short spike
    const hk = new Path2D();
    hk.moveTo(cap + 17, -4); hk.quadraticCurveTo(cap + 30, -10, L, -4); hk.quadraticCurveTo(L + 4, 6, L - 9, 13);
    hk.quadraticCurveTo(L - 4, 4, L - 7, 0); hk.quadraticCurveTo(cap + 26, -3, cap + 19, 2); hk.closePath();
    ctx.fillStyle = IRON; ctx.fill(hk); ctx.lineWidth = 1.5; ctx.strokeStyle = OUT; ctx.stroke(hk);
    ctx.strokeStyle = o.hot ? '#ffffff' : '#bdb6d6'; ctx.lineWidth = 1.1;
    ctx.beginPath(); ctx.moveTo(cap + 22, -7); ctx.quadraticCurveTo(cap + 31, -10, L - 1, -5); ctx.stroke();
  }

  /**
   * drawSable(ctx, p, o): the figure in the local frame. o: {t, light (-1|1 local), frost 0..1, eyes 'ice'|undefined,
   * armed (bool), spin (whirl angle or null), hemDrag (px), hot (telegraph glint on the hook), alpha}
   * Returns the rig.
   */
  function drawSable(ctx, p, o) {
    o = o || {};
    const R = rig(p);
    const ch = C();
    const t = o.t || 0;
    const L = o.light == null ? -1 : o.light;
    const rimC = o.frost > 0.5 ? RIM_ICE : RIM;
    // far arm (behind everything)
    limb(ctx, R.s2.x, R.s2.y, R.A2.kx, R.A2.ky, R.h2.x, R.h2.y, 4.6, 3.8, '#100e14');
    // legs (back leg darker), boots
    limb(ctx, R.hip.x - 2, R.hip.y, R.L2.kx, R.L2.ky, R.f2.x, R.f2.y, 6, 4.4, '#08070b');
    boot(ctx, R.f2.x, R.f2.y, p.tuck > 0.3 ? 0.5 : 0, '#08070b');
    limb(ctx, R.hip.x + 2, R.hip.y, R.L1.kx, R.L1.ky, R.f1.x, R.f1.y, 6, 4.4, LEG);
    boot(ctx, R.f1.x, R.f1.y, p.tuck > 0.3 ? 0.6 : 0, LEG);
    // the long coat of black wax: narrow shoulders, waist, a ragged hem that trails her motion
    const sl = Math.sin(R.lean), cl = Math.cos(R.lean);
    const drag = (o.hemDrag || 0) - p.hem * 4;
    const flare = 13 + p.hem * 7;
    const hemY = R.hip.y + 34 * (1 - p.tuck * 0.35) - p.kneel * 6;
    const hcx = R.hip.x + drag * 0.8 + sl * 4;
    const coat = new Path2D();
    const shB = { x: R.chest.x - cl * 8, y: R.chest.y - sl * 8 }, shF = { x: R.chest.x + cl * 7, y: R.chest.y + sl * 7 };
    const wB = { x: R.hip.x - cl * 5.5 + sl * 4, y: R.hip.y - 5 }, wF = { x: R.hip.x + cl * 5.5 + sl * 4, y: R.hip.y - 5 };
    // a cut-away duelling coat: fitted bodice, the back tail long and trailing, the front cut high over the legs
    const tailB = { x: hcx - flare - 4 + drag * 1.3, y: hemY + 8 }, hemF = { x: hcx + flare * 0.7, y: hemY - 9 };
    coat.moveTo(R.neck.x - cl * 4, R.neck.y);
    coat.quadraticCurveTo(shB.x - 2, shB.y - 1, shB.x, shB.y + 4);
    coat.quadraticCurveTo(shB.x + sl * 10, wB.y - 12, wB.x, wB.y);
    coat.quadraticCurveTo(wB.x - 6, (wB.y + tailB.y) / 2, tailB.x, tailB.y);
    const n = 9;
    for (let i = 1; i <= n; i++) {
      const u = i / n;
      const wob = Math.sin(t * 7 + i * 1.9) * (1 + p.hem * 2.2) * (1 - u * 0.5);
      const dip = (i % 2 ? 4 : -2) * (1 - u * 0.4) + wob;
      coat.lineTo(lerp(tailB.x, hemF.x, u) + drag * (1 - u) * 0.4, lerp(tailB.y, hemF.y, u * u) + dip);
    }
    coat.quadraticCurveTo(wF.x + 3, (wF.y + hemF.y) / 2, wF.x, wF.y);
    coat.quadraticCurveTo(shF.x + sl * 8, wF.y - 12, shF.x, shF.y + 4);
    coat.quadraticCurveTo(shF.x + 1, shF.y - 2, R.neck.x + cl * 4, R.neck.y);
    coat.closePath();
    const box = [hcx - flare - 4, R.neck.y, hcx + flare + 4, hemY + 5];
    if (ch && ch.shape) ch.shape(ctx, coat, { fill: COAT, outline: OUT, lw: 2.2, light: L, shade: 0.45, rim: rimC, rimWidth: 1.8, box });
    else { ctx.fillStyle = COAT; ctx.fill(coat); }
    // coat folds + a sliver of red lining at the trailing hem
    ctx.save(); ctx.clip(coat);
    ctx.strokeStyle = 'rgba(0,0,0,0.45)'; ctx.lineWidth = 1.3;
    for (const k of [-5, 4]) { ctx.beginPath(); ctx.moveTo(R.chest.x + k * 0.5, R.chest.y + 10); ctx.quadraticCurveTo(R.hip.x + k * 1.2, R.hip.y + 6, hcx + k * 2.2 + drag * 0.5, hemY); ctx.stroke(); }
    if (p.hem > 0.2) {
      ctx.globalAlpha *= clamp(p.hem, 0, 1) * 0.8;
      ctx.fillStyle = o.frost > 0.5 ? SCARF_ICE : '#6e1219';
      ctx.beginPath(); ctx.moveTo(hcx - flare, hemY - 4); ctx.lineTo(hcx - flare * 0.2, hemY - 2); ctx.lineTo(hcx - flare * 0.4, hemY + 6); ctx.lineTo(hcx - flare - 2, hemY + 4); ctx.closePath(); ctx.fill();
    }
    ctx.restore();
    // head: the candle top, never lit
    ctx.save();
    ctx.translate(R.neck.x, R.neck.y); ctx.rotate(R.head.a); ctx.scale(1.2, 1.2);
    const hp = new Path2D();
    hp.moveTo(-6.5, 2); hp.lineTo(-7.5, -17); hp.quadraticCurveTo(-7, -23, -2.5, -24.5); hp.lineTo(1, -23); hp.lineTo(3, -25.5);
    hp.quadraticCurveTo(7.5, -24, 8, -18); hp.lineTo(8.5, -10); hp.quadraticCurveTo(9.5, -6, 8.5, -3); hp.lineTo(7, 2); hp.closePath();
    if (ch && ch.shape) ch.shape(ctx, hp, { fill: WAX, outline: OUT, lw: 2, light: L, shade: 0.5, rim: rimC, rimWidth: 1.6, hi: 0.14, box: [-7.5, -25.5, 9.5, 2] });
    else { ctx.fillStyle = WAX; ctx.fill(hp); }
    // a single wax drip down the brow
    ctx.fillStyle = '#3a3644'; ctx.beginPath(); ctx.ellipse(6.6, -19, 1.3, 3.4, 0.1, 0, TAU); ctx.fill();
    // the eyes: two small white points
    const ice = o.eyes === 'ice';
    const ec = ice ? EYE_ICE : EYE, eg = ice ? EYE_ICE_GLOW : EYE_GLOW;
    const blink = o.blink || 0;
    for (const [ex, ey] of [[1.8, -13.5], [6.6, -13]]) {
      glow(ctx, ex, ey, 9, eg, 0.4 * (1 - blink));
      ctx.fillStyle = ec;
      ctx.beginPath(); ctx.ellipse(ex, ey, 1.5, Math.max(0.3, 2.3 * (1 - blink)), 0, 0, TAU); ctx.fill();
    }
    // the cold black wick
    if (ch && ch.wick) {
      const tip = ch.wick(ctx, 0.5, -24, { len: 8, bend: -2.5, width: 2.2, color: '#08070a', curl: -1.5 });
      if (ch.pallSmoke && o.smoke !== false) ch.pallSmoke(ctx, tip[0], tip[1], t, { count: 3, height: 34, spread: 5, size: 3.5, alpha: 0.16, color: '#8a8498', seed: 5 });
    }
    ctx.restore();
    // the scarf knot at the neck
    ctx.save(); ctx.translate(R.neck.x, R.neck.y + 2); ctx.rotate(R.lean * 0.6);
    const sc = o.frost > 0.5 ? SCARF_ICE : SCARF;
    ctx.fillStyle = sc; ctx.strokeStyle = OUT; ctx.lineWidth = 1.5;
    ctx.beginPath(); ctx.moveTo(-9, -3); ctx.quadraticCurveTo(0, -6, 9, -3); ctx.quadraticCurveTo(10, 3, 7, 5); ctx.quadraticCurveTo(0, 7, -9, 4); ctx.closePath(); ctx.fill(); ctx.stroke();
    ctx.strokeStyle = 'rgba(40,0,8,0.55)'; ctx.lineWidth = 1; ctx.beginPath(); ctx.moveTo(-6, 1); ctx.lineTo(6, 0); ctx.stroke();
    if (o.frost > 0.5) { ctx.fillStyle = 'rgba(230,248,255,0.8)'; ctx.fillRect(-7, -4, 3, 1.5); ctx.fillRect(2, -5, 4, 1.5); }
    ctx.restore();
    // the spear (in the near hand), or the whirl blur
    if (o.armed !== false) {
      if (o.spin != null) drawSpin(ctx, R.g.x, R.g.y, o.spin, t, o);
      else {
        ctx.save(); ctx.translate(R.butt.x, R.butt.y); ctx.rotate(p.sa);
        drawSpear(ctx, { hot: o.hot, frozen: o.frost > 0.5, sway: Math.sin(t * 5) * 2 });
        ctx.restore();
      }
    }
    // near arm on top, slim hand
    limb(ctx, R.s1.x, R.s1.y, R.A1.kx, R.A1.ky, R.g.x, R.g.y, 4.8, 4, LIMB);
    ctx.fillStyle = WAX; ctx.strokeStyle = OUT; ctx.lineWidth = 1.3;
    ctx.beginPath(); ctx.arc(R.g.x, R.g.y, 3.4, 0, TAU); ctx.fill(); ctx.stroke();
    ctx.beginPath(); ctx.arc(R.h2.x, R.h2.y, 3, 0, TAU); ctx.fill(); ctx.stroke();
    return R;
  }
  /** The spear spun overhead: a blurred disc of shaft + hooks (whirl / flourish), centred on the hand. */
  function drawSpin(ctx, x, y, ang, t, o) {
    ctx.save(); ctx.translate(x, y); ctx.scale(1, 0.38);
    const r = SP_LEN * 0.5;
    ctx.globalAlpha *= 0.25;
    ctx.fillStyle = o.frost > 0.5 ? '#cfefff' : '#8d86a8';
    ctx.beginPath(); ctx.arc(0, 0, r, 0, TAU); ctx.fill();
    ctx.globalAlpha /= 0.25;
    for (let k = 3; k >= 0; k--) {
      ctx.save();
      ctx.globalAlpha *= k === 0 ? 1 : 0.22;
      ctx.rotate(ang - k * 0.22);
      ctx.translate(-r, 0);
      drawSpear(ctx, { hot: o.hot, frozen: o.frost > 0.5 });
      ctx.restore();
    }
    ctx.restore();
    void t;
  }

  // ---------------------------------------------------------------------------------------------------------
  // Scarf (verlet cloth in world space; frozen stiff in the Rime until her second phase)
  // ---------------------------------------------------------------------------------------------------------
  function scarfUpdate(sc, ax, ay, dt, facing, vx, t, floorY) {
    const ch = C();
    if (!ch || !ch.cloth) return;
    const wind = -vx * 3.5 - facing * 190 + Math.sin(t * 1.7) * 110;
    ch.cloth.update(sc, ax, ay, dt, { gravity: 250, wind, damping: 0.9, iterations: 3 });
    if (floorY != null) for (let i = 1; i < sc.n; i++) if (sc.y[i] > floorY - 3) { sc.y[i] = floorY - 3; sc.py[i] = sc.y[i]; }
  }
  function drawScarf(ctx, sc, frozen, ax, ay, facing, t) {
    const ch = C();
    if (!ch || !ch.cloth) return;
    if (frozen) {
      // frozen stiff: a rigid streamer swept back and down, rimed with frost and hung with icicles
      const f = facing, n = 10, fz = sc._frozen || (sc._frozen = { n, x: new Float32Array(n), y: new Float32Array(n), init: true });
      for (let i = 0; i < n; i++) { const u = i / (n - 1); fz.x[i] = ax - f * (u * 44 + Math.sin(u * 2.6) * 6); fz.y[i] = ay + u * 64 + Math.sin(u * 5 + 1) * 3; }
      ch.cloth.draw(ctx, fz, { width: 9, tip: 0.5, color: SCARF_ICE, shadeColor: SCARF_DK, lw: 1.8, wave: 0 });
      ctx.strokeStyle = 'rgba(235,250,255,0.85)'; ctx.lineWidth = 1.6; ctx.lineCap = 'round';
      ctx.beginPath(); for (let i = 0; i < n; i++) { const px = fz.x[i] - f * 3, py = fz.y[i] - 2; if (i) ctx.lineTo(px, py); else ctx.moveTo(px, py); } ctx.stroke();
      ctx.fillStyle = 'rgba(235,250,255,0.9)';
      for (let i = 2; i < n; i += 2) { const qx = fz.x[i] + f * 3, qy = fz.y[i] + 2; ctx.beginPath(); ctx.moveTo(qx - 2, qy); ctx.lineTo(qx + f * 1, qy + 6 + (i % 3) * 2); ctx.lineTo(qx + 2, qy); ctx.closePath(); ctx.fill(); }
      void t;
      return;
    }
    ch.cloth.draw(ctx, sc, { width: 9, tip: 0.5, color: SCARF, shadeColor: SCARF_DK, lw: 1.8, wave: 2 });
  }

  // ---------------------------------------------------------------------------------------------------------
  // Projectile 'sable_hook': the whirling spear (boomerang) or one of its smoke copies.
  //   props: owner, dir ±1, yOut (centre y of the outbound lane), yHigh (return lane), D (outbound distance),
  //          v0 (launch speed), ghost (copy: dissipates at the far end), frost, waitFor [hooks]
  // ---------------------------------------------------------------------------------------------------------
  const HOOK_RX = 46, HOOK_RY = 21;
  class SableHook extends G.Projectile {
    constructor(props) {
      super(Object.assign({ r: 24, life: 9, damage: 1, terrain: false, light: false, color: '#d8ccff' }, props, { kind: 'sable_hook' }));
      const p = props || {};
      this.dir = p.dir || 1;
      this.x0 = p.x; this.yOut = p.yOut != null ? p.yOut : p.y; this.yHigh = p.yHigh != null ? p.yHigh : this.yOut - 100;
      this.D = Math.max(60, p.D || 400);
      this.v0 = p.v0 || 720;
      this.Tout = 2 * this.D / this.v0;
      this.ghost = !!p.ghost;
      this.frost = !!p.frost;
      this.waitFor = p.waitFor || [];
      this.ph = 'out'; this.pt = 0;
      this.spin = 0;
      this.tx = this.x0; this.ty = this.yOut;
      this.trailPts = [];
      this.harmless = false;
      this._whirr = 0;
      this.place(this.x0, this.yOut);
    }
    place(x, y) { this.x = x - this.r; this.y = y - this.r; }
    hitBox() { return { x: this.cx - HOOK_RX * 0.82, y: this.cy - HOOK_RY * 0.85, w: HOOK_RX * 1.64, h: HOOK_RY * 1.7 }; }
    update(dt) {
      this.age += dt; this.pt += dt;
      if (this.age >= this.life) { this.burst('expire'); return; }
      const o = this.owner;
      const ownerOk = o && !o.dead && !o.dying && o.room === this.room;
      if (!ownerOk && !this.ghost) { this.burst('expire'); return; }
      this.spin += dt * 24 * this.dir;
      let x = this.cx, y = this.cy;
      if (this.ph === 'out') {
        const u = clamp(this.pt / this.Tout, 0, 1);
        x = this.x0 + this.dir * this.D * (1 - (1 - u) * (1 - u));
        y = this.yOut;
        if (u >= 1) { this.ph = this.ghost ? 'fade' : 'turn'; this.pt = 0; this.tx = x; }
      } else if (this.ph === 'turn') {
        x = this.tx;
        y = lerp(this.yOut, this.yHigh, ease(this.pt / 0.24));
        const waiting = this.waitFor.some((h) => h && !h.dead);
        if (this.pt >= 0.3 && !waiting) { this.ph = 'back'; this.pt = 0; }
        if (this.pt > 4) { this.ph = 'back'; this.pt = 0; }
      } else if (this.ph === 'back') {
        const c = o.catchPoint();
        const sp = Math.min(1250, 260 + this.pt * 1500);
        const dx = c.x - x;
        const step = Math.min(Math.abs(dx), sp * dt);
        x += Math.sign(dx) * step;
        const near = Math.abs(c.x - x);
        const wantY = near < 110 ? lerp(c.y, this.yHigh, near / 110) : this.yHigh;
        y += (wantY - y) * Math.min(1, dt * 14);
        if (Math.hypot(c.x - x, c.y - y) < 26 || this.pt > 3.5) { this.place(x, y); o.catchHook(this); this.remove(); return; }
      } else if (this.ph === 'fade') {
        if (this.pt > 0.1) this.harmless = true;
        if (this.pt > 0.32) {
          burst('smoke', x, y, { count: 7, color: this.frost ? '#cfefff' : SMOKE, alpha: 0.5, size: 12, speed: 70 });
          this.remove(); return;
        }
      }
      this.place(x, y);
      this.trailPts.push(x, y);
      if (this.trailPts.length > 24) this.trailPts.splice(0, 2);
      if ((this._whirr -= dt) <= 0 && !this.harmless) { this._whirr = 0.17; G.sfxAt('sable_whirr', x, { vol: this.ghost ? 0.35 : 0.55 }); }
      if (!this.harmless && this.team === 'enemy') {
        const p = G.game && G.game.player;
        const hb = this.hitBox();
        if (p && !p.dead && hb.x < p.x + p.w && hb.x + hb.w > p.x && hb.y < p.y + p.h && hb.y + hb.h > p.y) G.Combat.hurtPlayer(this.damage, this);
      }
      if (G.lighting) G.lighting.add({ x, y, r: 110, color: this.frost ? '#9ae0ff' : '#c8b8ff', intensity: this.ghost ? 0.25 : 0.35 });
    }
    burst(why) {
      if (this.dead) return;
      const o = this.owner;
      if (!this.ghost && o && !o.dead && typeof o.catchHook === 'function' && why !== 'player') o.catchHook(this, true);
      super.burst(why);
    }
    burstFx() { burst('smoke', this.cx, this.cy, { count: 8, color: this.frost ? '#cfefff' : SMOKE, alpha: 0.5, size: 12, speed: 90 }); }
    draw(ctx, t) {
      const fadeA = this.ph === 'fade' ? clamp(1 - this.pt / 0.32, 0, 1) : 1;
      const tr = this.trailPts;
      ctx.save();
      // smoke trail
      for (let i = 0; i < tr.length; i += 2) {
        const u = i / Math.max(2, tr.length);
        ctx.globalAlpha = fadeA * u * (this.ghost ? 0.3 : 0.38);
        ctx.fillStyle = this.frost ? '#7fb8d8' : (this.ghost ? '#6d6688' : '#3a3046');
        ctx.beginPath(); ctx.arc(tr[i], tr[i + 1], 6 + 12 * u, 0, TAU); ctx.fill();
      }
      ctx.globalAlpha = fadeA;
      glow(ctx, this.cx, this.cy, 70, this.frost ? '#9ae0ff' : '#b8a8d8', this.ghost ? 0.3 : 0.35);
      ctx.translate(this.cx, this.cy);
      ctx.scale(1, HOOK_RY / HOOK_RX);
      const r = HOOK_RX + 6;
      ctx.globalAlpha = fadeA * 0.3;
      ctx.fillStyle = this.frost ? '#bfeaff' : '#8a7aa8';
      ctx.beginPath(); ctx.arc(0, 0, r, 0, TAU); ctx.fill();
      ctx.globalAlpha = fadeA * 0.7;
      ctx.lineWidth = 3; ctx.strokeStyle = this.frost ? '#1c3a52' : OUT; ctx.stroke();
      ctx.lineWidth = 1.5; ctx.strokeStyle = this.frost ? '#e8f8ff' : '#d8ccff'; ctx.stroke();
      for (let k = 3; k >= 0; k--) {
        ctx.save();
        ctx.globalAlpha = fadeA * (k === 0 ? (this.ghost ? 0.55 : 1) : 0.2);
        ctx.rotate(this.spin - this.dir * k * 0.25);
        ctx.scale(0.62, 1);
        ctx.translate(-SP_LEN / 2, 0);
        if (this.ghost) {
          ctx.strokeStyle = this.frost ? '#e8f8ff' : '#c8c0e0'; ctx.lineWidth = 5; ctx.lineCap = 'round';
          ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(SP_LEN - 20, 0); ctx.quadraticCurveTo(SP_LEN + 4, -6, SP_LEN - 8, 12); ctx.stroke();
        } else drawSpear(ctx, { hot: true, frozen: this.frost });
        ctx.restore();
      }
      ctx.restore();
      void t;
    }
  }
  G.registerProjectile('sable_hook', SableHook, { r: 24, gravity: 0, life: 9, color: '#d8ccff', damage: 1 });

  // ---------------------------------------------------------------------------------------------------------
  // Projectile 'sable_frost': a line of frost racing along the floor, ice spikes erupting at its front (jump it)
  // ---------------------------------------------------------------------------------------------------------
  const WaveBase = G.Projectile.Wave || G.Projectile;
  class SableFrost extends WaveBase {
    constructor(props) {
      super(Object.assign({ w: 34, h: 46, speed: 560, life: 3, damage: 1, color: '#9ae0ff' }, props, { kind: 'sable_frost' }));
      this.marks = [];
      this._sfxT = 0;
    }
    hitBox() { return { x: this.x + 5, y: this.y + this.h * 0.3, w: this.w - 10, h: this.h * 0.7 }; }
    update(dt) {
      super.update(dt);
      if (this.dead) return;
      const fy = this.y + this.h;
      this.marks.push({ x: this.cx, y: fy, t: this.age });
      if (this.marks.length > 26) this.marks.shift();
      if (G.fx && Math.random() < dt * 34) G.fx.burst('snow', this.cx, fy - 10, { count: 1, color: '#e8f8ff', speed: 60, angle: -Math.PI / 2 });
      if ((this._sfxT -= dt) <= 0) { this._sfxT = 0.22; G.sfxAt('sable_whirr', this.cx, { vol: 0.25, pitch: 1.8 }); }
    }
    burstFx() { burst('shard', this.cx, this.y + this.h - 10, { count: 8, color: '#dff6ff', speed: 220 }); burst('snow', this.cx, this.y + this.h - 10, { count: 6, color: '#ffffff', speed: 90 }); }
    draw(ctx, t) {
      const fy = this.y + this.h;
      const life = clamp(1 - Math.max(0, this.age - this.life + 0.3) / 0.3, 0, 1);
      ctx.save();
      ctx.globalAlpha *= life;
      // frost left on the floor behind the front (fading, harmless)
      for (const m of this.marks) {
        const a = clamp(1 - (this.age - m.t) / 0.45, 0, 1);
        if (a <= 0) continue;
        ctx.globalAlpha = life * a * 0.55;
        ctx.fillStyle = '#dff6ff';
        ctx.fillRect(m.x - 10, fy - 3, 20, 3);
        const h = 6 + 10 * a * (0.5 + 0.5 * Math.sin(m.x * 0.3));
        ctx.beginPath(); ctx.moveTo(m.x - 4, fy); ctx.lineTo(m.x, fy - h); ctx.lineTo(m.x + 4, fy); ctx.closePath(); ctx.fill();
      }
      ctx.globalAlpha = life;
      glow(ctx, this.cx, fy - 18, 70, '#9ae0ff', 0.5);
      // the erupting spikes at the front: tallest leading, a ragged crown
      const d = this.dir;
      const spikes = [[0, 46, 7], [-10, 34, 6], [9, 30, 5], [-19, 24, 5], [-27, 16, 4]];
      for (const [ox, hh, w] of spikes) {
        const x = this.cx + ox * d;
        const h = hh * (0.85 + 0.15 * Math.sin(t * 30 + ox));
        const p = new Path2D();
        p.moveTo(x - w, fy); p.lineTo(x - w * 0.2 + d * 3, fy - h); p.lineTo(x + w, fy); p.closePath();
        ctx.fillStyle = '#bfeaff'; ctx.fill(p);
        ctx.strokeStyle = '#2a4a66'; ctx.lineWidth = 1.4; ctx.stroke(p);
        ctx.strokeStyle = 'rgba(255,255,255,0.85)'; ctx.lineWidth = 1;
        ctx.beginPath(); ctx.moveTo(x - w * 0.5, fy - 2); ctx.lineTo(x - w * 0.2 + d * 3, fy - h + 3); ctx.stroke();
      }
      ctx.restore();
    }
  }
  G.registerProjectile('sable_frost', SableFrost, { r: 16, gravity: 0, life: 3, color: '#9ae0ff', damage: 1 });

  // ---------------------------------------------------------------------------------------------------------
  // The boss
  // ---------------------------------------------------------------------------------------------------------
  const CHAINS = {
    lunge: ['dive', 'hook', 'whirl', 'frost'],
    dive: ['lunge', 'frost', 'dive'],
    frost: ['dive', 'lunge'],
    whirl: ['lunge', 'frost'],
    rising: ['dive', 'lunge'],
    evade: ['lunge', 'hook', 'frost'],
    hook: [],
  };

  class Sable extends G.Boss {
    constructor(props) {
      const late = (props && (props.boss === 'sable2' || props.type === 'boss_sable2' || props.variant === 2));
      super(props, late ? Sable.CFG2() : Sable.CFG1());
      this.late = late;
      this.pose = pose(P.stand);
      this.poseTo = P.stand; this.poseRate = 10;
      this.armed = true;
      this.hook = null;
      this.queue = [];
      this.combo = false;
      this.frostLevel = late ? 1 : 0;         // 1 = scarf frozen stiff (the Rime, until phase 2)
      this.aura = 0;                          // sable2 phase 3 frost aura
      this.alpha = 1;
      this.gone = false;
      this.spinA = 0; this.spinV = 0;
      this.runPh = 0;
      this.marks = [];                        // dive landing marks {x, y, w, t, dur}
      this.ring = null;                       // whirl radius {r, k (0..1 warning → 1 active), active}
      this.scarf = null;
      this.rigNow = rig(this.pose);
      this.lastHurtT = -9;
    }
    static CFG1() {
      return {
        hp: 230, w: 30, h: 100, contactInset: 6, phases: [0.5], stagger: { damage: 60, time: 1.3 },
        rest: [0.5, 0.9], phaseRest: [1, 0.78], introTime: 1.0, roar: false, defeatStyle: 'custom', slowmo: 0.8,
        colors: { body: WAX, dark: '#141218', hit: '#efe8ff', smoke: SMOKE, tele: TELE, puddle: WAX },
        attacks: {
          lunge: { weight: (d) => (d < 520 ? 3 : 1.2), when() { return this.playerLevel() < 90; } },
          hook: { weight: 2.4, range: [210, 2000], cooldown: 2.6, when() { return this.hookRoom(); } },
          dive: { weight: (d) => (d > 420 ? 2.6 : 1.6), cooldown: 1.4 },
          whirl: { weight: 2.2, range: [0, 300], cooldown: 3.2, when() { return this.whirlRoom(); } },
          evade: { weight: 4, range: [0, 120], cooldown: 3.5, when() { return this.evadeRoom(); } },
        },
      };
    }
    static CFG2() {
      return {
        hp: 800, w: 30, h: 100, contactInset: 6, phases: [0.6, 0.3], stagger: { damage: 130, time: 1.2 },
        rest: [0.45, 0.8], phaseRest: [1, 0.88, 0.76], introTime: 0.9, roar: false, defeatStyle: 'custom', slowmo: 0.8,
        colors: { body: WAX, dark: '#141218', hit: '#e8f8ff', smoke: '#9fb8c8', tele: TELE_ICE, puddle: WAX },
        attacks: {
          lunge: { weight: (d) => (d < 560 ? 3 : 1.4), when() { return this.playerLevel() < 90; } },
          hook: { weight: 2.2, range: [210, 2000], cooldown: 3.2, when() { return this.hookRoom(); } },
          dive: { weight: (d) => (d > 420 ? 2.4 : 1.5), cooldown: 1.2 },
          whirl: { weight: 1.8, range: [0, 300], cooldown: 3.4, when() { return this.whirlRoom(); } },
          frost: { weight: 2.2, range: [150, 2000], cooldown: 2.6, when() { return this.playerLevel() < 90; } },
          rising: { weight: 6, cooldown: 2.6, when() { return this.playerAbove(); } },
          evade: { weight: 4, range: [0, 120], cooldown: 3.2, when() { return this.evadeRoom(); } },
        },
      };
    }

    init() {
      super.init();
      this.feetHome = this.y + this.h;
      this.computeBounds();
      const ch = C();
      if (ch && ch.cloth) this.scarf = ch.cloth.create(9, 10);
      if (this.props.facing == null) this.facing = 1;
    }
    /** Walls of the hall at her height (the door alcoves under the lintels are out of her reach). */
    computeBounds() {
      const room = this.room;
      const W = room ? room.widthPx : 4000;
      const cx = this.cx;
      let lo = 0, hi = W;
      for (const dy of [60, 200]) {
        const y = this.feetHome - dy;
        let x = cx; while (x > 0 && !this.solidAt(x, y)) x -= 10; lo = Math.max(lo, x + 10);
        x = cx; while (x < W && !this.solidAt(x, y)) x += 10; hi = Math.min(hi, x);
      }
      if (hi - lo < 300) { lo = 0; hi = W; }
      this.bx0 = lo; this.bx1 = hi;
    }
    // ---------------------------------------------------------------- helpers
    get feet() { return this.y + this.h; }
    playerC() { const p = this.player; return p ? { x: p.x + p.w / 2, y: p.y + p.h / 2, bottom: p.y + p.h } : { x: this.cx + this.facing * 300, y: this.cy, bottom: this.feet }; }
    /** How far the player's feet are above hers (px, + = above). */
    playerLevel() { const p = this.player; return p ? this.feet - (p.y + p.h) : 0; }
    playerAbove() { const p = this.player; if (!p) return false; const dx = Math.abs(p.x + p.w / 2 - this.cx); return dx < 170 && this.playerLevel() > 70 && this.grounded; }
    /** The support under the player (floor or platform top), px. */
    groundUnder(x, fromY) {
      const room = this.room;
      const H = room ? room.heightPx : 2000;
      for (let y = fromY; y < H; y += 8) if (this.solidAt(x, y) || this.platformAt(x, y)) return Math.floor(y / TILE) * TILE;
      return this.feetHome;
    }
    playerGround() { const p = this.player; if (!p) return this.feetHome; return this.groundUnder(p.x + p.w / 2, p.y + p.h - 2); }
    /** Room behind the player (away from her) — the hook and the whirl need it. */
    roomBehindPlayer() { const pc = this.playerC(); const d = Math.sign(pc.x - this.cx) || this.facing; return d > 0 ? this.bx1 - pc.x : pc.x - this.bx0; }
    hookRoom() { return this.roomBehindPlayer() >= 230 && this.playerDist() >= 200; }
    whirlRoom() { return this.grounded && this.playerLevel() < 120; }
    evadeRoom() { if (!this.grounded) return false; const d = -this.dirTo(); return d > 0 ? this.bx1 - this.right > 150 : this.x - this.bx0 > 150; }
    want(p, rate) { this.poseTo = p; this.poseRate = rate == null ? 10 : rate; }
    tw(base, min) { return this.combo ? Math.max(min || 0.3, base * 0.68) : base; }
    wpt(lx, ly) { return { x: this.cx + this.facing * lx, y: this.feet + ly }; }
    catchPoint() { const R = this.rigNow; return this.wpt(R.g.x, R.g.y); }
    tipWorld() { const R = this.rigNow; return this.wpt(R.tip.x, R.tip.y); }
    teleAnchor() { return this.armed && this.state !== 'whirl' ? this.tipWorld() : this.wpt(this.rigNow.head.x + 4, this.rigNow.head.y - 2); }
    eye() { return this.wpt(this.rigNow.head.x + 4, this.rigNow.head.y); }
    clampX(x) { return clamp(x, this.bx0 + 4, this.bx1 - this.w - 4); }
    stopX() { if (this.grounded) this.vx = 0; }

    // ---------------------------------------------------------------- per-step animation (also while stunned / dying)
    animate(dt) {
      const k = 1 - Math.exp(-this.poseRate * dt);
      const tp = this.poseTo;
      for (const key of KEYS) this.pose[key] += (tp[key] - this.pose[key]) * k;
      // running legs
      if (this.grounded && Math.abs(this.vx) > 40 && (this.state === 'idle' || this.state === 'intro')) {
        this.runPh += dt * Math.abs(this.vx) * 0.055;
        this.pose.fw = Math.sin(this.runPh) * 20; this.pose.bk = -Math.sin(this.runPh) * 20;
        this.pose.fy1 = Math.max(0, Math.cos(this.runPh)) * 9; this.pose.fy2 = Math.max(0, -Math.cos(this.runPh)) * 9;
      }
      if (this.spinV) this.spinA += this.spinV * dt;
      this.rigNow = rig(this.pose);
      // scarf
      if (this.scarf) {
        const n = this.rigNow.neck;
        const a = this.wpt(n.x - 3, n.y + 4);
        scarfUpdate(this.scarf, a.x, a.y, dt, this.facing, this.vx, this.t, this.grounded ? this.feet : null);
      }
      // floor marks age
      for (const m of this.marks) m.t += dt;
      this.marks = this.marks.filter((m) => m.t < m.dur + 0.25);
      if (this.ring) this.ring.t += dt;
      if (this.aura > 0 && G.fx && Math.random() < dt * 10) G.fx.burst('snow', this.cx + rnd(-30, 30), this.feet - rnd(10, 100), { count: 1, color: '#e8f8ff', speed: 30, angle: -Math.PI / 2 });
      if (G.lighting && !this.gone) G.lighting.add({ x: this.cx, y: this.feet - 70, r: 150, color: this.late ? '#bfe6ff' : '#c8b8ff', intensity: 0.16 });
    }
    physicsStep(dt) { super.physicsStep(dt); this.animate(dt); }
    updateDeath(dt) { super.updateDeath(dt); if (!this.dead) this.animate(dt); }
    keepInRoom() {
      super.keepInRoom();
      if (this.dead || this.dying || !this.room) return;
      if (this.x < this.bx0 + 2) { this.x = this.bx0 + 2; if (this.vx < 0) { this.vx = 0; this.wallHit = -1; } }
      if (this.right > this.bx1 - 2) { this.x = this.bx1 - 2 - this.w; if (this.vx > 0) { this.vx = 0; this.wallHit = 1; } }
    }

    // ---------------------------------------------------------------- scheduler extensions
    pickAttack() {
      while (this.queue.length) {
        const n = this.queue.shift();
        const a = this.attacks[n];
        if (!a || this.phase < a.phase) continue;
        if (n === 'hook' && !this.hookRoom()) continue;
        if ((n === 'lunge' || n === 'frost') && this.playerLevel() >= 90) continue;
        if (n === 'whirl' && !this.whirlRoom()) continue;
        this.combo = true;
        return n;
      }
      this.combo = false;
      return super.pickAttack();
    }
    startAttack(name) {
      if (!this.armed && name !== 'flourish') { this.endAttack(0.2); return; }
      super.startAttack(name);
      // the phase flourish can never be cut by a stagger — not even by the very hit that started it (QA)
      if (name === 'flourish') this.uninterruptible = true;
      if (!this.combo && this.late && name !== 'flourish') this.planChain(name);
    }
    /** sable2: strings — follow-ups with shorter wind-ups, then a real pause. */
    planChain(first) {
      this.queue.length = 0;
      const chance = [0, 0.4, 0.65, 0.85][this.phase] || 0.4;
      const maxLen = this.phase >= 3 ? 2 : 1;
      let prev = first;
      for (let i = 0; i < maxLen; i++) {
        if (Math.random() > chance) break;
        const opts = (CHAINS[prev] || []).filter((n) => this.attacks[n] && this.phase >= this.attacks[n].phase);
        if (!opts.length) break;
        const n = opts[Math.floor(Math.random() * opts.length)];
        this.queue.push(n);
        prev = n;
      }
    }
    endAttack(rest) {
      const r = rest;
      super.endAttack(r);
      if (this.queue.length) this.restTime = Math.min(this.restTime, 0.22);
      this.spinV = 0;
      this.ring = null;
      this.gravityScale = 1;
      this.dropThrough = false;
    }

    // ---------------------------------------------------------------- intro (camera finds her; lines; the spear comes up)
    beginFight() {
      if (this.fightStarted || this._starting || this._intro) return;
      this._intro = { t: 0 };
      const cam = G.camera;
      const off = cam && typeof cam.visible === 'function' && !cam.visible(this.x - 40, this.y - 40, this.w + 80, this.h + 40, -80);
      if (off && G.game && typeof cam.follow === 'function') {
        this._camProxy = { x: this.cx - 13, y: this.feet - 54, w: 26, h: 54, facing: this.facing, vx: 0, vy: 0 };
        cam.follow(this._camProxy);
        G.game.lockPlayer('sable_intro');
        this._locked = true;
        this._intro.wait = 0.75;
      } else this._intro.wait = 0.2;
    }
    releaseCinematic() {
      if (this._camProxy && G.camera && G.camera.target === this._camProxy) G.camera.follow(G.game && G.game.player);
      this._camProxy = null;
      if (this._locked && G.game) G.game.unlockPlayer('sable_intro');
      this._locked = false;
    }
    introUpdate(dt) {
      this.stopX();
      if (!this._intro) { this.want(P.stand, 8); return; }
      const I = this._intro;
      I.t += dt;
      if (!this.fightStarted) {
        this.face();
        this.want(P.stand, 6);
        if (!this._starting && I.t >= I.wait) G.Boss.prototype.beginFight.call(this);   // lines → startFight
        if (I.t > 30 && !this._starting) { this.releaseCinematic(); G.Boss.prototype.beginFight.call(this); }
        return;
      }
      // fight started: the spear spun up and levelled at the player
      const s = this.stateTime - this._introStart;
      this.face();
      if (s < 0.55) { this.want(P.flourish, 14); this.spinV = 22 * this.facing; }
      else { this.spinV = 0; this.want(P.guard, 12); }
    }
    onFightStart() {
      G.sfxAt('sable_flourish', this.cx, { vol: 0.9 });
      burst('smoke', this.cx, this.feet - 60, { count: 10, color: this.late ? '#cfe6f0' : SMOKE, alpha: 0.45, size: 14, speed: 110 });
      if (G.game) G.game.shake(4, 0.4);
      this._unlockAt = this.stateTime + 0.65;
    }

    // ---------------------------------------------------------------- main loop
    think(dt) {
      if (this._unlockAt != null && (this.stateTime >= this._unlockAt || this.state !== 'intro')) { this._unlockAt = null; this.releaseCinematic(); }
      if (this.state !== 'intro' && this._locked && this._unlockAt == null) this.releaseCinematic();
      if (this.pendingPhase && this.state === 'idle') { const ph = this.pendingPhase; this.pendingPhase = 0; this.queue.length = 0; this.startAttack('flourish'); this.stateData.ph = ph; }
      super.think(dt);
    }
    idleUpdate(dt) {
      this.face();
      const d = this.playerDist();
      if (this.grounded) {
        const want = d > 430 ? 1 : 0;
        const sp = this.late ? 230 : 180;
        this.vx = want ? this.dirTo() * sp : 0;
        if (want && this.blockedAhead(this.dirTo(), { ledges: false, hazards: true })) this.vx = 0;
      }
      if (Math.abs(this.vx) > 10) this.want(P.walk, 10); else this.want(P.guard, 9);
      void dt;
    }
    staggerUpdate(dt) {
      this.stopX();
      this.gravityScale = 1;
      this.want(P.stagger, 12);
      void dt;
    }
    onStagger() { this.marks.length = 0; this.ring = null; this.spinV = 0; this.queue.length = 0; this.gravityScale = 1; this.dropThrough = false; burst('smoke', this.cx, this.feet - 70, { count: 6, color: SMOKE, alpha: 0.45, size: 10 }); }
    onInterrupt(name) { if (name === 'flourish' && !this.pendingPhase) this.pendingPhase = (this.stateData && this.stateData.ph) || this.phase; this.marks.length = 0; this.ring = null; this.gravityScale = 1; this.dropThrough = false; }
    onHurt() { this.lastHurtT = this.t; }

    onPhase(phase) {
      if (G.game) { G.game.shake(7, 0.4); G.game.flash('rgba(255,255,255,0.3)', 0.12); }
      if (phase === 2 && G.Audio && typeof G.Audio.musicLayer === 'function') G.Audio.musicLayer(1);
      if (G.clearProjectiles) G.clearProjectiles(this.room);
      this.marks.length = 0; this.ring = null;
      this.queue.length = 0;
      if (this.state === 'idle' || this.state === 'intro') { this.startAttack('flourish'); this.stateData.ph = phase; }
      else this.pendingPhase = phase;
      if (this.attack && this.attack !== 'flourish' && this.state !== 'idle') {
        // cut the current attack short: the flourish follows at once
        this.endAttack(0.05);
      }
    }

    // ---------------------------------------------------------------- the hook comes back
    catchHook(h, reform) {
      if (h !== this.hook && this.hook) return;
      this.hook = null;
      if (this.armed) return;
      this.armed = true;
      const c = this.catchPoint();
      if (!this.dying) {
        if (reform) burst('smoke', c.x, c.y, { count: 8, color: this.late ? '#cfe6f0' : SMOKE, alpha: 0.5, size: 10 });
        else { G.sfxAt('sable_catch', c.x); burst('spark', c.x, c.y, { count: 6, color: '#ffffff', speed: 240 }); }
      }
    }

    // ================================================================= ATTACKS
    // ---- lunge: drawn back (glint at the hook) → a long thrust across the lawn → stretched out, punishable.
    //      sable1 phase 2 / sable2 phase 2+: turns and lunges again (second wind-up 0.3 s+).
    atk_lunge(dt, s) {
      const d = this.stateData;
      if (this.once('init')) { d.k = 0; d.n = (this.phase >= 2 ? 2 : 1) + (this.late && this.phase >= 3 && Math.random() < 0.4 ? 1 : 0); d.ph = 'wind'; d.t0 = 0; this.face(); d.w = this.telegraph(this.tw(this.late ? 0.48 : 0.56, 0.42), { sound: 'sable_draw', shake: 1.2 }); }   // combo ≥ 0.42: at close range a jump must start ~0.07 s before the thrust (QA)
      const t = s - d.t0;
      if (d.ph === 'wind') {
        this.stopX();
        this.want(P.lungeWind, 16);
        if (t >= d.w && this.grounded) {
          const pc = this.playerC();
          const dist = Math.abs(pc.x - this.cx);
          const L = clamp(dist + 150, 300, this.late ? 640 : 560);
          const room = this.facing > 0 ? this.bx1 - this.right - 6 : this.x - this.bx0 - 6;
          d.L = Math.max(0, Math.min(L, room)); d.x0 = this.x; d.V = this.late ? 1060 : 980;
          d.ph = 'go'; d.t0 = s;
          G.sfxAt('sable_thrust', this.cx);
          burst('dust', this.cx - this.facing * 10, this.feet, { count: 6, color: '#9a94a8', angle: Math.PI, speed: 120 });
          this.want(P.lunge, 34);
        }
      } else if (d.ph === 'go') {
        this.vx = this.facing * d.V;
        this.want(P.lunge, 34);
        const tw = this.tipWorld();
        const x0 = Math.min(this.cx, tw.x + this.facing * 4), x1 = Math.max(this.cx, tw.x + this.facing * 4);
        this.strike({ x: x0, y: this.feet - 70, w: x1 - x0, h: 32 }, { id: 'lunge' + this.uid + ':' + this.strikeSerial + ':' + d.k });
        if (G.fx && Math.random() < 0.6) G.fx.burst('smoke', this.cx - this.facing * 20, this.feet - rnd(20, 80), { count: 1, color: this.late ? '#cfe6f0' : SMOKE, alpha: 0.35, size: 9, speed: 30 });
        if (Math.abs(this.x - d.x0) >= d.L || this.wallHit || t > 1.2) {
          d.ph = 'rec'; d.t0 = s;
          this.vx = this.facing * Math.min(d.V, 240);
        }
      } else if (d.ph === 'rec') {
        if (this.grounded) this.vx *= Math.max(0, 1 - dt * 10);
        this.want(P.lungeRec, 10);
        const more = d.k + 1 < d.n;
        if (more && t >= 0.3) {
          d.k++; d.ph = 'wind'; d.t0 = s; this.face();
          d.w = this.telegraph(this.late ? 0.36 : 0.38, { sound: 'sable_draw', shake: 1 });   // ≥ 0.3 s to react after she turns (QA)
        } else if (!more && t >= (this.late ? 0.42 : 0.5)) { this.stopX(); this.endAttack(this.late ? 0.3 : 0.42); return; }
      }
      if (s > 6) this.endAttack();
    }

    // ---- hook: cocked back → the spear whirls out low (jump it), turns beyond the player, comes back high (stay down)
    //      to her raised hand; she is unarmed meanwhile. sable2 phase 2+: two smoke copies follow (high, then low).
    atk_hook(dt, s) {
      const d = this.stateData;
      this.stopX();
      if (this.once('init')) {
        this.face();
        d.w = this.telegraph(this.tw(this.late ? 0.5 : 0.56), { sound: 'sable_cock', shake: 1 });
        d.triple = this.late && this.phase >= 2;
      }
      if (s < d.w) { this.want(P.throwWind, 14); this.face(); return; }
      const throwOne = (lane, ghost, wait) => {
        const pc = this.playerC();
        const gy = this.playerGround();
        const yOut = lane === 'low' ? gy - 34 : gy - 140;
        const dir = this.facing;
        const startX = this.cx + dir * 30;
        const far = dir > 0 ? this.bx1 - 50 : this.bx0 + 50;
        const D = clamp(Math.abs(pc.x - startX) + 175, 300, Math.min(760, Math.abs(far - startX)));
        const h = G.spawnProjectile(this.room, 'sable_hook', { x: startX, y: this.feet - 70, yOut, yHigh: Math.min(gy, this.feet) - 142, dir, D, v0: this.late ? 820 : 720, owner: this, ghost, frost: this.late, waitFor: wait || [] });
        return h;
      };
      if (this.once('throw')) {
        this.armed = false;
        d.copies = [];
        this.hook = throwOne('low', false, d.copies);
        G.sfxAt('sable_thrust', this.cx, { pitch: 1.2 });
        if (!this.hook) { this.armed = true; this.endAttack(); return; }
      }
      if (d.triple) {
        if (this.at(d.w + 0.8)) { const h = throwOne('high', true); if (h) d.copies.push(h); burst('smoke', this.cx + this.facing * 30, this.feet - 90, { count: 6, color: '#cfe6f0', alpha: 0.5, size: 10 }); G.sfxAt('sable_chill', this.cx, { vol: 0.6 }); }
        if (this.at(d.w + 1.4)) { const h = throwOne('low', true); if (h) d.copies.push(h); burst('smoke', this.cx + this.facing * 30, this.feet - 60, { count: 6, color: '#cfe6f0', alpha: 0.5, size: 10 }); G.sfxAt('sable_chill', this.cx, { vol: 0.6 }); }
      }
      const tt = s - d.w;
      if (!this.armed) {
        const gesturing = d.triple && ((tt > 0.72 && tt < 0.92) || (tt > 1.32 && tt < 1.52));
        if (tt < 0.3 || gesturing) this.want(P.throwRel, 18);
        else { this.want(P.catchWait, 7); if (this.hook) this.facing = this.hook.cx >= this.cx ? 1 : -1; }
        if (tt > 6.5) { this.armed = true; if (this.hook) { this.hook.remove(); this.hook = null; } }
        return;
      }
      if (d.caughtT == null) { d.caughtT = s; this.want(P.guard, 12); }
      if (s - d.caughtT > 0.32) this.endAttack(this.late ? 0.35 : 0.45);
    }

    // ---- dive: deep crouch → leaps to the vault above the player → hangs (the landing spot is marked) →
    //      dives down the marked line → spear in the floor (punish). sable2 phase 2+: frost waves run out both ways.
    atk_dive(dt, s) {
      const d = this.stateData;
      if (this.once('init')) { this.face(); d.ph = 'wind'; d.w = this.telegraph(this.tw(this.late ? 0.46 : 0.52), { sound: 'sable_leap', shake: 1.4 }); }
      if (d.ph === 'wind') {
        this.stopX();
        this.want(P.diveWind, 14);
        if (s >= d.w) {
          const pc = this.playerC();
          const apexFeet = Math.max(this.ceilingAbove() + this.h + 30, this.feet - 430);
          const rise = Math.max(120, this.feet - apexFeet);
          const vy = -Math.sqrt(2 * GRAV * rise);
          const tUp = -vy / GRAV;
          const tx = clamp(pc.x, this.bx0 + 60, this.bx1 - 60) - this.facing * 70;
          this.vy = vy; this.vx = clamp((tx - this.cx) / tUp, -950, 950);
          d.ph = 'rise'; d.t0 = s;
          G.sfxAt('jump', this.cx, { pitch: 0.8 });
          burst('dust', this.cx, this.feet, { count: 10, color: '#9a94a8', speed: 160 });
          this.want(P.air, 12);
        }
      } else if (d.ph === 'rise') {
        this.want(P.air, 10);
        if (this.vy >= -60 || this.ceilHit || s - d.t0 > 1.2) {
          d.ph = 'hang'; d.t0 = s; this.vx = 0; this.vy = 0; this.gravityScale = 0;
          d.hang = this.combo ? 0.32 : (this.late ? 0.36 : 0.44);
          this.planDive(d);
        }
      } else if (d.ph === 'hang') {
        this.vx = 0; this.vy = 0;
        this.face();
        this.want(P.hang, 12);
        this.facing = d.tx >= this.cx ? 1 : -1;
        if (s - d.t0 >= d.hang) {
          d.ph = 'fall'; d.t0 = s;
          const dx = d.tx - this.cx, dy = d.ty - this.feet;
          const len = Math.hypot(dx, dy) || 1;
          const V = this.late ? 1650 : 1450;
          this.vx = dx / len * V; this.vy = dy / len * V;
          d.ang = Math.atan2(dy, Math.abs(dx));
          G.sfxAt('sable_dive', this.cx);
        }
      } else if (d.ph === 'fall') {
        this.gravityScale = 0;
        const dx = d.tx - this.cx, dy = d.ty - this.feet;
        const len = Math.hypot(dx, dy) || 1;
        const V = this.late ? 1650 : 1450;
        this.dropThrough = true;                         // straight down the marked line, through the petals
        if (!this.grounded) { this.vx = dx / len * V; this.vy = Math.max(200, dy / len * V); }
        if (this.feet >= d.ty - 1) { this.y = d.ty - this.h; this.grounded = true; }
        // land exactly on the mark (the floor can stop her a few px short of it on a shallow line) (QA)
        if (this.grounded && Math.abs(this.cx - d.tx) < 40) this.x = this.clampX(d.tx - this.w / 2);
        this.want(Object.assign({}, P.fall, { sa: clamp(d.ang, 0.6, 1.5) }), 30);
        this.strike({ x: this.cx - 18, y: this.feet - 30, w: 36, h: 50 }, { id: 'divefall' + this.uid + ':' + this.strikeSerial, damage: this.late ? 2 : 1 });
        if (G.fx && Math.random() < 0.8) G.fx.burst('smoke', this.cx - this.vx * 0.02, this.feet - 60, { count: 1, color: this.late ? '#d8f0ff' : SMOKE, alpha: 0.4, size: 10, speed: 20 });
        if (this.grounded || s - d.t0 > 1.2) {
          d.ph = 'land'; d.t0 = s; this.gravityScale = 1; this.vx = 0; this.vy = 0; this.dropThrough = false;
          this.impact(d);
        }
      } else if (d.ph === 'land') {
        this.stopX();
        this.want(P.land, 22);
        if (d.waveT != null && s - d.t0 >= d.waveT) {
          d.waveT = null;                                    // frost runs out both ways a beat after the impact
          G.sfxAt('sable_frost', this.cx, { vol: 0.8 });
          for (const dir of [-1, 1]) G.spawnProjectile(this.room, 'sable_frost', { x: this.cx + dir * 40, y: this.feet, dir, speed: 480, life: 0.8, owner: this });
        }
        if (s - d.t0 > (this.late ? 0.46 : 0.6)) { this.endAttack(this.late ? 0.3 : 0.4); return; }
      }
      if (s > 6) { this.gravityScale = 1; this.endAttack(); }
    }
    ceilingAbove() { let y = this.y - 4; while (y > 0 && !this.solidAt(this.cx, y)) y -= 8; return y + 8; }
    planDive(d) {
      const pc = this.playerC();
      let tx = clamp(pc.x, this.bx0 + 50, this.bx1 - 50);
      const ty = this.groundUnder(tx, Math.max(this.feet + 4, pc.bottom - 4));
      // never shallower than ~42° from the horizontal: a far target is pulled toward her (the mark tells the truth)
      const maxDx = (ty - this.feet) * 1.1;
      if (Math.abs(tx - this.cx) > maxDx) tx = this.cx + Math.sign(tx - this.cx) * maxDx;
      d.tx = tx; d.ty = ty;
      // a player pinned against a wall can only leave the mark one way (~125 px): she hangs a beat longer (QA)
      if (Math.min(tx - this.bx0, this.bx1 - tx) < 140) d.hang += 0.12;
      const fall = Math.hypot(tx - this.cx, ty - this.feet) / (this.late ? 1650 : 1450);
      this.marks.push({ x: tx, y: ty, w: 60, t: 0, dur: d.hang + fall });
    }
    impact(d) {
      const fx = this.cx, fy = this.feet;   // the impact box (±56) sits just inside the mark's ring (±60 at impact)
      this.marks.length = 0;
      if (G.game) G.game.shake(this.late ? 9 : 7, 0.3);
      G.sfxAt('sable_impact', fx);
      burst('dust', fx, fy, { count: 16, color: this.late ? '#dceffa' : '#a8a2b4', speed: 260 });
      burst('smoke', fx, fy - 10, { count: 10, color: this.late ? '#d8f0ff' : SMOKE, alpha: 0.5, size: 14, speed: 160 });
      burst('ring', fx, fy - 6, { r: 90, color: this.late ? '#cfefff' : '#d8ccff', width: 4, life: 0.35 });
      this.strike({ x: fx - 56, y: fy - 92, w: 112, h: 92 }, { id: 'diveland' + this.uid + ':' + this.strikeSerial, damage: this.late ? 2 : 1 });
      if (this.late && this.phase >= 2) { d.waveT = 0.32; burst('snow', fx, fy - 8, { count: 14, color: '#ffffff', speed: 200 }); }
    }

    // ---- whirl: spear raised and spun (smoke gathers, the radius is shown) → a whirling smoke disc that drifts
    //      after the player → dizzy (punish). Back away; she never pins a player against a wall.
    atk_whirl(dt, s) {
      const d = this.stateData;
      if (this.once('init')) {
        this.face();
        d.w = this.telegraph(this.tw(this.late ? 0.52 : (this.phase >= 2 ? 0.56 : 0.62), 0.45), { sound: 'sable_smoke', shake: 0.8 });
        d.R = this.late ? (this.phase >= 3 ? 145 : 132) : (this.phase >= 2 ? 128 : 116);
        d.act = this.late ? 1.15 : 1.0;
        d.drift = this.late ? (this.phase >= 2 ? 170 : 135) : (this.phase >= 2 ? 115 : 85);
        this.ring = { r: d.R, t: 0, active: false, warn: d.w };
      }
      this.face();
      if (s < d.w) {
        this.stopX();
        this.want(P.whirlWind, 12);
        this.spinV = this.facing * lerp(5, 18, s / d.w);
        if (G.fx && Math.random() < 0.7) { const a = rnd(0, TAU); G.fx.burst('smoke', this.cx + Math.cos(a) * d.R, this.feet - 56 + Math.sin(a) * d.R * 0.8, { count: 1, color: this.late ? '#d8f0ff' : SMOKE, alpha: 0.4, size: 10, vx: -Math.cos(a) * 90, vy: -Math.sin(a) * 70 }); }
        return;
      }
      const ta = s - d.w;
      if (ta < d.act) {
        this.ring.active = true;
        this.want(P.whirl, 14);
        this.spinV = this.facing * 30;
        if (this.every(0.28)) G.sfxAt('sable_whirl', this.cx, { vol: 0.9 });
        // drift after the player, but never closer than R + 60 to the wall behind the player
        const pc = this.playerC();
        const dir = Math.sign(pc.x - this.cx) || this.facing;
        const wall = dir > 0 ? this.bx1 : this.bx0;
        const limit = wall - dir * (d.R + 60);
        const canGo = dir > 0 ? this.cx < limit : this.cx > limit;
        this.vx = canGo && Math.abs(pc.x - this.cx) > 30 ? dir * d.drift : 0;
        // the smoke disc hurts
        const p = this.player;
        if (p && !p.dead) {
          const cx = this.cx, cy = this.feet - 56;
          const nx = clamp(cx, p.x, p.x + p.w), ny = clamp(cy, p.y, p.y + p.h);
          if (Math.hypot(nx - cx, (ny - cy) * 1.0) < d.R - 6) G.Combat.hurtPlayer(1, this);
        }
        if (G.fx && Math.random() < 0.9) { const a = rnd(0, TAU); G.fx.burst('smoke', this.cx + Math.cos(a) * d.R * 0.9, this.feet - 56 + Math.sin(a) * d.R * 0.9, { count: 1, color: this.late ? '#d8f0ff' : SMOKE, alpha: 0.45, size: 12, vx: -Math.sin(a) * 160 * this.facing, vy: Math.cos(a) * 160 * this.facing }); }
        return;
      }
      this.ring = null;
      this.spinV = 0;
      this.stopX();
      this.want(P.dizzy, 10);
      if (ta > d.act + (this.late ? 0.45 : 0.62)) this.endAttack(this.late ? 0.3 : 0.4);
    }

    // ---- evade: a back-hop away from a player who crowds her (harmless; a duelist's footwork)
    atk_evade(dt, s) {
      const d = this.stateData;
      if (this.once('init')) {
        this.face();
        const away = -this.facing;
        const room = away > 0 ? this.bx1 - this.right - 10 : this.x - this.bx0 - 10;
        const dist = Math.min(this.late ? 260 : 220, room);
        this.vy = -760; this.vx = away * dist / 0.58;
        G.sfxAt('sable_leap', this.cx, { vol: 0.7 });
        burst('dust', this.cx, this.feet, { count: 6, color: '#9a94a8', speed: 120 });
      }
      this.face();
      this.want(s < 0.45 ? P.evade : P.guard, 14);
      if ((this.grounded && s > 0.15) || s > 1.4) {
        this.stopX();
        if (this.once('land')) burst('dust', this.cx, this.feet, { count: 5, color: '#9a94a8', speed: 90 });
        if (s > 0.2) this.endAttack(this.late ? 0.18 : 0.35);
      }
    }

    // ---- frost (sable2): the spear raised point-down (mist at her feet) → driven into the floor → a frost line
    //      races at the player along the ground (jump it). Phase 3: both ways.
    atk_frost(dt, s) {
      const d = this.stateData;
      this.stopX();
      if (this.once('init')) { this.face(); d.w = this.telegraph(this.tw(0.55), { sound: 'sable_chill', shake: 1.2, color: TELE_ICE }); }
      if (s < d.w) {
        this.want(P.frostWind, 12);
        if (G.fx && Math.random() < 0.6) G.fx.burst('smoke', this.cx + rnd(-40, 40), this.feet - 4, { count: 1, color: '#e0f4ff', alpha: 0.4, size: 9, speed: 20 });
        return;
      }
      if (this.once('slam')) {
        this.want(P.frostSlam, 30);
        G.sfxAt('sable_frost', this.cx);
        if (G.game) G.game.shake(6, 0.25);
        burst('shard', this.cx + this.facing * 40, this.feet - 6, { count: 10, color: '#dff6ff', speed: 260 });
        const sp = this.phase >= 3 ? 620 : 560;
        G.spawnProjectile(this.room, 'sable_frost', { x: this.cx + this.facing * 52, y: this.feet, dir: this.facing, speed: sp, life: 3, owner: this });
        if (this.phase >= 3) G.spawnProjectile(this.room, 'sable_frost', { x: this.cx - this.facing * 52, y: this.feet, dir: -this.facing, speed: sp * 0.9, life: 3, owner: this });
      }
      if (s > d.w + 0.55) this.endAttack(0.35);
    }

    // ---- rising (sable2): low crouch, spear pointing up → a straight leap with the spear overhead (anti-air;
    //      step aside out of her column)
    atk_rising(dt, s) {
      const d = this.stateData;
      if (this.once('init')) { this.face(); d.ph = 'wind'; d.w = this.telegraph(this.tw(0.46), { sound: 'sable_draw', shake: 1.2, color: TELE_ICE }); }
      if (d.ph === 'wind') {
        this.stopX();
        this.want(P.risingWind, 14);
        if (s >= d.w) {
          const pc = this.playerC();
          this.vy = -1250; this.vx = clamp((pc.x - this.cx) * 0.5, -160, 160);
          d.ph = 'up'; d.t0 = s;
          G.sfxAt('sable_thrust', this.cx, { pitch: 0.9 });
          burst('dust', this.cx, this.feet, { count: 10, color: '#dceffa', speed: 160 });
        }
      } else if (d.ph === 'up') {
        this.want(P.rising, 26);
        if (this.vy < 200) this.strike({ x: this.cx - 22, y: this.y - 90, w: 44, h: 120 }, { id: 'rise' + this.uid + ':' + this.strikeSerial });
        if (G.fx && Math.random() < 0.6) G.fx.burst('snow', this.cx, this.y - 40, { count: 1, color: '#ffffff', speed: 60 });
        if ((this.grounded && s - d.t0 > 0.15) || s - d.t0 > 2) { d.ph = 'land'; d.t0 = s; this.stopX(); burst('dust', this.cx, this.feet, { count: 6, color: '#dceffa', speed: 90 }); }
      } else {
        this.stopX();
        this.want(P.land, 16);
        if (s - d.t0 > 0.42) { this.endAttack(0.35); return; }
      }
      if (s > 5) this.endAttack();
    }

    // ---- flourish: the phase change (uninterruptible). The spear spun overhead, the butt struck down; in the Rime the
    //      frost cracks off her scarf (phase 2) and a frost aura rises (phase 3).
    atk_flourish(dt, s) {
      const d = this.stateData;
      if (!this.grounded && s < 2) { this.gravityScale = 1; this.want(P.air, 10); d.air = (d.air || 0) + dt; return; }
      const t = s - (d.air || 0);
      this.stopX();
      this.face();
      if (this.once('init')) { this.uninterruptible = true; G.sfxAt('sable_flourish', this.cx); if (!this.armed) this.catchHook(this.hook, true); }
      if (t < 0.65) {
        this.want(P.flourish, 14);
        this.spinV = this.facing * lerp(10, 34, t / 0.65);
        if (G.fx && Math.random() < 0.8) { const a = rnd(0, TAU); G.fx.burst('smoke', this.cx + Math.cos(a) * 80, this.feet - 100 + Math.sin(a) * 30, { count: 1, color: this.late ? '#d8f0ff' : SMOKE, alpha: 0.45, size: 10, speed: 40 }); }
        return;
      }
      if (this.once('strike')) {
        this.spinV = 0;
        this.want(P.frostSlam, 26);
        if (G.game) { G.game.shake(9, 0.45); G.game.flash('rgba(255,255,255,0.35)', 0.14); }
        burst('ring', this.cx, this.feet - 50, { r: 220, color: this.late ? '#cfefff' : '#e8dcff', width: 5, life: 0.5 });
        burst('smoke', this.cx, this.feet - 40, { count: 18, color: this.late ? '#d8f0ff' : SMOKE, alpha: 0.5, size: 16, speed: 220 });
        if (this.late) {
          G.sfxAt('sable_shatter', this.cx);
          if (this.frostLevel > 0) {                 // phase 2 (or a later flourish if that one was missed)
            this.frostLevel = 0;      // the scarf breaks free
            const n = this.rigNow.neck, a = this.wpt(n.x - 30, n.y + 20);
            burst('shard', a.x, a.y, { count: 22, color: '#e6f8ff', speed: 300 });
            if (this.scarf && C()) C().cloth.reset(this.scarf);
          }
          if ((d.ph || this.phase) >= 3) { this.aura = 1; burst('snow', this.cx, this.feet - 60, { count: 30, color: '#ffffff', speed: 260 }); }
        } else burst('ember', this.cx, this.feet - 70, { count: 10, color: '#ff6a6a', speed: 120 });
      }
      if (t > 0.65 && t < 1.25) this.want(t < 0.95 ? P.frostSlam : P.guard, 12);
      if (t >= 1.25) { this.uninterruptible = false; this.endAttack(0.25); }
    }

    // ---------------------------------------------------------------- defeat (custom): kneel → lines → leap away / yield
    onDefeatStart() {
      this.marks.length = 0; this.ring = null; this.spinV = 0; this.queue.length = 0;
      this.gravityScale = 1;
      if (!this.armed) { this.armed = true; this.hook = null; }
      this.want(this.late ? P.kneel : P.halfKneel, 8);
      this.releaseCinematic();
    }
    onDefeatSequence(dt, s) {
      const d = this.defSeq || (this.defSeq = {});
      if (!this.late) {
        // sable1: rises, turns from the player, springs up into the dome and is gone in a burst of smoke
        if (s < 0.55) { this.want(P.stand, 6); this.face(); return; }
        if (s < 0.95) { if (this.once('turn')) { this.facing = -this.dirTo(); G.sfxAt('sable_leap', this.cx); } this.want(P.diveWind, 14); return; }
        if (!d.jumped) {
          d.jumped = true;
          this.vy = -1500; this.vx = this.facing * 160;
          burst('dust', this.cx, this.feet, { count: 12, color: '#a8a2b4', speed: 180 });
          G.sfxAt('dash', this.cx, { vol: 0.8, pitch: 0.7 });
        }
        this.want(P.air, 12);
        if (!this.gone && (this.vy > -250 || this.y < 150 || s > 2.2)) {
          this.gone = true;
          burst('smoke', this.cx, this.cy, { count: 26, color: '#2a2630', alpha: 0.65, size: 18, speed: 150 });
          burst('ember', this.cx, this.cy, { count: 12, color: '#c03030', speed: 90 });
          burst('flash', this.cx, this.cy, { r: 60, color: '#e8dcff', life: 0.2 });
          this.finishDefeat();
          d.goneT = s;
        }
        if (this.gone && s - d.goneT > 0.4) this.remove();
        if (s > 5) { this.finishDefeat(); this.remove(); }
        return;
      }
      // sable2: kneels, the spear planted; the victory is recorded at once (gates open). Then she rises with her
      // head bowed and withdraws into the snow (she waits at the Sanctum gate — npc sable stage 2 in ri_08).
      this.want(s < 2.7 ? P.kneel : P.stand, s < 2.7 ? 6 : 3);
      if (s > 0.35 && !d.done) { d.done = true; this.finishDefeat(); }
      if (s < 2.7 && G.fx && Math.random() < dt * 6) G.fx.burst('snow', this.cx + rnd(-40, 40), this.feet - rnd(40, 120), { count: 1, color: '#ffffff', speed: 20 });
      if (s >= 3.4) {
        if (this.once('dissolve')) {
          burst('smoke', this.cx, this.feet - 50, { count: 22, color: '#cfe0ea', alpha: 0.55, size: 16, speed: 90 });
          burst('snow', this.cx, this.feet - 60, { count: 24, color: '#ffffff', speed: 120 });
          G.sfxAt('dash', this.cx, { vol: 0.6, pitch: 0.6 });
        }
        this.alpha = clamp(1 - (s - 3.4) / 0.8, 0, 1);
        if (this.alpha <= 0) this.remove();
      }
      if (s > 7) { this.finishDefeat(); this.remove(); }
    }

    // ---------------------------------------------------------------- damage boxes
    contactRect() {
      if (this.dying || this.gone || this.hidden || this.contactGrace) return null;
      if (!this.fightStarted || this.state === 'intro') return null;
      const low = this.state === 'lunge' || this.pose.crouch > 0.45 || this.pose.kneel > 0.3;
      const top = this.state === 'lunge' ? this.feet - 72 : low ? this.feet - 78 : this.y + 8;
      return { x: this.x + 5, y: top, w: this.w - 10, h: this.feet - 4 - top };
    }
    hurtRect() { return (this.gone || this.dying) ? null : this; }

    // ---------------------------------------------------------------- drawing
    drawBounds() { return { x: this.cx - 220, y: this.y - 140, w: 440, h: this.h + 175 }; }
    draw(ctx, t) {
      if (this.gone || this.alpha <= 0) return;
      this.drawMarks(ctx, t);
      this.drawRing(ctx, t, false);
      ctx.save();
      if (this.alpha < 1) ctx.globalAlpha *= this.alpha;
      super.draw(ctx, t);
      ctx.restore();
      this.drawRing(ctx, t, true);
    }
    drawBody(ctx, t) {
      const f = this.facing, fx = this.cx, fy = this.feet;
      const ch = C();
      if (ch && ch.shadow && this.grounded) ch.shadow(ctx, fx, fy, 24, 0.5);
      if (this.aura > 0) glow(ctx, fx, fy - 60, 120, '#9ae0ff', 0.22 + 0.06 * Math.sin(t * 3));
      // the scarf trails in world space (behind the body)
      if (this.scarf) {
        const n = this.rigNow.neck, a = this.wpt(n.x - 3, n.y + 4);
        drawScarf(ctx, this.scarf, this.frostLevel > 0.5, a.x, a.y, f, t);
      }
      ctx.save();
      ctx.translate(fx, fy);
      ctx.scale(f, 1);
      const hot = this.telegraphing;
      const blink = ch && ch.blinkAt && this.state === 'idle' ? ch.blinkAt(t, 4) : 0;
      drawSable(ctx, this.pose, {
        t, light: -f, frost: this.frostLevel, eyes: this.late && this.phase >= 2 ? 'ice' : undefined, armed: this.armed,
        spin: this.spinV ? this.spinA : null, hemDrag: -clamp(this.vx * f * 0.022, -14, 14), hot, blink,
      });
      ctx.restore();
    }
    drawMarks(ctx, t) {
      for (const m of this.marks) {
        const k = clamp(m.t / Math.max(0.05, m.dur), 0, 1);
        const a = m.t > m.dur ? clamp(1 - (m.t - m.dur) / 0.25, 0, 1) : clamp(m.t / 0.12, 0, 1);
        const col = this.late ? '#7fd8ff' : '#d0a8ff';
        const pulse = 0.5 + 0.5 * Math.sin(m.t * 22);
        ctx.save();
        ctx.globalAlpha = a;
        glow(ctx, m.x, m.y - 8, m.w * 1.5, col, 0.35 + 0.25 * k);
        // a dark scorch-ring on the floor with a bright rim: reads on pale snow and on dark grass alike
        const rw = m.w * (1.15 - 0.15 * k);
        ctx.fillStyle = 'rgba(20,10,30,' + (0.35 + 0.2 * k).toFixed(3) + ')';
        ctx.beginPath(); ctx.ellipse(m.x, m.y - 1, rw, 8, 0, 0, TAU); ctx.fill();
        ctx.lineWidth = 4; ctx.strokeStyle = OUT; ctx.stroke();
        ctx.lineWidth = 2.2; ctx.strokeStyle = col; ctx.stroke();
        // the line she will come down: a dashed beam from the vault to the spot
        ctx.globalAlpha = a * (0.35 + 0.25 * pulse);
        ctx.strokeStyle = col; ctx.lineWidth = 3; ctx.setLineDash([14, 10]); ctx.lineDashOffset = -m.t * 160;
        ctx.beginPath(); ctx.moveTo(this.cx, this.feet - 40); ctx.lineTo(m.x, m.y - 6); ctx.stroke(); ctx.setLineDash([]);
        // closing chevrons above the spot
        ctx.globalAlpha = a;
        const bw = m.w * (1.5 - 0.5 * k);
        for (const sd of [-1, 1]) {
          ctx.beginPath(); ctx.moveTo(m.x + sd * bw, m.y - 22); ctx.lineTo(m.x + sd * (bw - 12), m.y - 8); ctx.lineTo(m.x + sd * bw, m.y + 4);
          ctx.lineWidth = 5; ctx.strokeStyle = OUT; ctx.stroke(); ctx.lineWidth = 2.6; ctx.strokeStyle = '#ffffff'; ctx.stroke();
        }
        ctx.restore();
      }
      void t;
    }
    /** The whirl's reach: a dashed smoke ring while she winds up, the whirling disc while active. */
    drawRing(ctx, t, front) {
      const r = this.ring;
      if (!r || this.dying) return;
      const cx = this.cx, cy = this.feet - 56;
      const col = this.late ? '#d8f2ff' : '#cfc6e4';
      ctx.save();
      if (!r.active) {
        if (front) { ctx.restore(); return; }
        const k = clamp(r.t / Math.max(0.1, r.warn), 0, 1);
        ctx.globalAlpha = 0.25 + 0.5 * k;
        ctx.strokeStyle = col; ctx.lineWidth = 3;
        ctx.setLineDash([10, 12]); ctx.lineDashOffset = -t * 60;
        ctx.beginPath(); ctx.arc(cx, cy, r.r, 0, TAU); ctx.stroke();
        ctx.setLineDash([]);
        ctx.restore();
        return;
      }
      // active: a swirling smoke disc; back half behind her, a bright rim in front
      const spin = t * 9 * this.facing;
      if (!front) {
        ctx.globalAlpha = 0.28;
        ctx.fillStyle = this.late ? '#a8c8dc' : '#4a4556';
        ctx.beginPath(); ctx.arc(cx, cy, r.r, 0, TAU); ctx.fill();
        ctx.globalAlpha = 0.35;
        ctx.strokeStyle = this.late ? '#e8f8ff' : '#8d86a8'; ctx.lineWidth = 9;
        for (let i = 0; i < 4; i++) { ctx.beginPath(); ctx.arc(cx, cy, r.r * (0.45 + i * 0.16), spin + i * 1.3, spin + i * 1.3 + 2.1); ctx.stroke(); }
      } else {
        ctx.globalAlpha = 0.7;
        ctx.strokeStyle = col; ctx.lineWidth = 3;
        ctx.beginPath(); ctx.arc(cx, cy, r.r, spin, spin + 4.4); ctx.stroke();
        ctx.globalAlpha = 0.4; ctx.lineWidth = 6;
        ctx.beginPath(); ctx.arc(cx, cy, r.r - 6, spin + 3.6, spin + 5.6); ctx.stroke();
      }
      ctx.restore();
    }
  }

  Sable.POSES = P;
  Sable.rig = rig;
  Sable.drawSable = drawSable;
  Sable.drawScarf = drawScarf;
  Sable.pose = pose;
  G.Boss.register('sable1', Sable);
  G.Boss.register('sable2', Sable);
  G.Sable = Sable;

  // ---------------------------------------------------------------------------------------------------------
  // Room event 'sable_wait': she waits at her spot (facing the door the player comes from) until the duel begins.
  //   { type:'event', script:'sable_wait', boss:'sable1'|'sable2', x: <bx>, y: <by>, w: 1, h: 3, facing: 'right' }
  // ---------------------------------------------------------------------------------------------------------
  if (G.Events) {
    G.Events.sable_wait = {
      init(e) {
        e.data.f = e.props.facing === 'left' || e.props.facing === -1 ? -1 : 1;
        e.data.boss = e.props.boss === 'sable2' ? 'sable2' : 'sable1';
        const ch = C();
        if (ch && ch.cloth) e.data.scarf = ch.cloth.create(9, 10);
        e.data.R = rig(P.stand);
      },
      update(e, dt) {
        if (waitState(e) !== 'wait') return;
        const R = e.data.R, f = e.data.f;
        if (e.data.scarf) scarfUpdate(e.data.scarf, e.cx + f * (R.neck.x - 3), e.y + e.h + R.neck.y + 4, dt, f, 0, e.room ? e.room.t || 0 : 0, e.y + e.h);
        if (G.lighting) G.lighting.add({ x: e.cx, y: e.y + e.h - 70, r: 150, color: e.data.boss === 'sable2' ? '#bfe6ff' : '#c8b8ff', intensity: 0.16 });
      },
      draw(e, ctx, t) {
        if (waitState(e) !== 'wait') return;
        const f = e.data.f, fy = e.y + e.h, late = e.data.boss === 'sable2';
        const ch = C();
        if (ch && ch.shadow) ch.shadow(ctx, e.cx, fy, 24, 0.5);
        const R = e.data.R;
        if (e.data.scarf) drawScarf(ctx, e.data.scarf, late, e.cx + f * (R.neck.x - 3), fy + R.neck.y + 4, f, t);
        ctx.save(); ctx.translate(e.cx, fy); ctx.scale(f, 1);
        const breath = Object.assign({}, P.stand, { crouch: 0.1 + 0.02 * Math.sin(t * 1.3), head: 0.08 + 0.03 * Math.sin(t * 0.7) });
        drawSable(ctx, breath, { t, light: -f, frost: late ? 1 : 0, armed: true, blink: ch && ch.blinkAt ? ch.blinkAt(t, 9) : 0 });
        ctx.restore();
      },
    };
  }
  /** 'wait' (drawn), 'hidden' (the live boss draws itself), 'gone' (beaten). */
  function waitState(e) {
    const room = e.room;
    if (!room) return 'hidden';
    const id = e.data.boss;
    if (G.game && G.game.bossDefeated && G.game.bossDefeated(id)) return 'gone';
    if (room.entities.some((x) => x.type === 'boss_' + id && !x.dead)) return 'hidden';
    const ar = room.findType ? room.findType('arena').find((a) => a.bossId === id || (a.props && a.props.boss === id)) : null;
    if (ar && (ar.boss || ar.active || ar.state === 'beat' || ar.state === 'fight' || ar.state === 'done')) return 'hidden';
    return 'wait';
  }
})();
