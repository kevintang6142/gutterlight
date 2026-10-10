// src/audio/sfx.js — every sound effect, ambience bed and musical stinger, synthesized at runtime
// with the G.Audio sound-design kit (see docs/api/audio.md, "Kit"). Owner: audio.
// Conventions: each sfx gets `k` (kit) with k.t (start), k.p (pitch multiplier), k.r(a,b) random,
// k.tone({...}), k.noise({...}), k.inst(name, note, dur, vel), k.buffer(key, gen). Envelope fields:
// a = attack, hold, d = decay time to -60 dB, g = peak gain. Filters: lp/hp/bp (+lp1/hp1/bp1 sweep).
(function () {
  'use strict';
  const G = globalThis.G;
  if (!G || !G.Audio || !G.Audio.defineSfx) return;
  const A = G.Audio;
  // Mixing desk: per-sound fader trims in dB (applied on top of each definition's `vol`), plus a
  // global SFX_DB. Calibrated with `node tools/audio_check.js --only sfx` (column "max" = loudest
  // 100 ms, K-weighted, LUFS scale) against music at about -16 LUFS. Targets after SFX_DB:
  // UI -34..-20, footsteps/swim -40..-32, light movement -28..-22, swings & enemy projectiles -26..-22,
  // hits -18..-16, hurt/heavy impacts -15..-11, big events -12..-9; every peak stays <= -3 dBFS.
  const SFX_DB = 4;
  const MIX = {
    jump: 14.4, doublejump: 14.4, land: 5.4, walljump: 19, grip: 15.7, dash: 10.5, step: 28, swim: 10.7, splash: 6.6,
    slash: 18.4, slash_hit: 10.6, slash_wall: 10.1, pogo: 12.3, enemy_hit: 6.9, enemy_die: 5.3, player_hurt: 3.1,
    hazard: 3.1, bolt: 11.7, bolt_hit: 6.1, plunge: 8.1, kindle: -1.9, cinder: 5.2, projectile: 13.4, shockwave: 1.4,
    boss_hit: 3.2, geode_hit: 6.3, lever: 3.9, shrine: -1, item: -1,
    menu_move: 15.9, menu_back: 14.2, dialogue_blip: 22.3, menu_select: 8.8, map_open: 11.5, deny: 4.9,
    // already loud: keep their peaks under -3 dBFS
    boss_roar: -3, boss_die: -3, door: -3, ability: -3, player_die: -1, gate_open: -1.5,
  };
  const sfx = (name, play, opts) => {
    const def = Object.assign({ play }, opts || {});
    def.vol = (def.vol === undefined ? 1 : def.vol) * Math.pow(10, (SFX_DB + (MIX[name] || 0)) / 20);
    A.defineSfx(name, def);
  };

  // ---- shared building blocks ----------------------------------------------
  /** Soft body thump: pitch-dropping sine. */
  function thump(k, f, d, g, at) {
    k.tone({ f, f1: f * 0.55, glide: d * 0.8, d, g, at: at || 0, a: 0.002 });
  }
  /** Airy whoosh: band-passed noise sweeping between two centre frequencies. */
  function whoosh(k, f0, f1, d, g, at, Q) {
    k.noise({ bp: f0, bp1: f1, Q: Q || 1.1, a: d * 0.25, d: d * 0.75, g, at: at || 0, sweep: d });
  }
  /** Tiny bright crackles (fire, sparks). */
  function crackles(k, n, span, g, at) {
    for (let i = 0; i < n; i++) {
      k.noise({ hp: k.r(2500, 5000), a: 0.0006, d: k.r(0.008, 0.03), g: g * k.r(0.4, 1), at: (at || 0) + k.r(0, span) });
    }
  }
  /** Debris: short random knocks. */
  function debris(k, n, span, g, at, lo, hi) {
    for (let i = 0; i < n; i++) {
      k.noise({ bp: k.r(lo || 900, hi || 3500), Q: 1.4, a: 0.001, d: k.r(0.02, 0.07), g: g * k.r(0.4, 1), at: (at || 0) + k.r(0, span) });
    }
  }
  /** Glassy inharmonic ping. The 2.756x overtone is skipped when it would be ultrasonic (> 18 kHz): it is
   *  inaudible there and, above Nyquist (22.05 kHz at 44.1 kHz), the browser clamps it and logs a warning. */
  function ping(k, f, d, g, at) {
    k.tone({ f, d, g, at: at || 0, a: 0.001 });
    if (f * 2.756 * (k.p || 1) < 18000) k.tone({ f: f * 2.756, d: d * 0.4, g: g * 0.35, at: at || 0, a: 0.001 });
  }

  // ===========================================================================
  // Player movement
  // ===========================================================================
  sfx('jump', (k) => {
    const v = k.r(0.94, 1.06);
    whoosh(k, 700 * v, 1900 * v, 0.14, 0.16);
    k.tone({ f: 170 * v, f1: 260 * v, d: 0.06, g: 0.07 });
    k.noise({ lp: 500, a: 0.001, d: 0.035, g: 0.06 });
  }, { reverb: 0.06 });
  sfx('doublejump', (k) => {
    const v = k.r(0.95, 1.05);
    // two smoky wing beats and a soft airy rise
    k.noise({ bp: 900 * v, Q: 1.6, a: 0.012, d: 0.09, g: 0.16 });
    k.noise({ bp: 1300 * v, Q: 1.6, a: 0.012, d: 0.1, g: 0.13, at: 0.055 });
    k.noise({ lp: 450, a: 0.02, d: 0.22, g: 0.12 });
    k.tone({ f: 380 * v, f1: 720 * v, d: 0.18, g: 0.04, type: 'triangle', lp: 2400 });
  }, { reverb: 0.12 });
  sfx('land', (k) => {
    const v = k.r(0.9, 1.1);
    thump(k, 95 * v, 0.09, 0.2);
    k.noise({ lp: 380 * v, a: 0.002, d: 0.07, g: 0.2 });
    k.noise({ bp: 2600, Q: 0.9, a: 0.001, d: 0.04, g: 0.035 });
  }, { reverb: 0.05 });
  sfx('hardland', (k) => {
    const v = k.r(0.92, 1.06);
    thump(k, 75 * v, 0.28, 0.5);
    k.noise({ lp: 520, a: 0.002, d: 0.22, g: 0.36 });
    k.noise({ bp: 1600, Q: 1, a: 0.001, d: 0.09, g: 0.1 });
    debris(k, 5, 0.12, 0.05, 0.02, 1800, 4200);
  }, { reverb: 0.12 });
  sfx('walljump', (k) => {
    const v = k.r(0.94, 1.06);
    k.noise({ bp: 2300 * v, Q: 1.3, a: 0.002, d: 0.06, g: 0.1 });
    k.noise({ lp: 650, a: 0.002, d: 0.08, g: 0.14 });
    whoosh(k, 800 * v, 1800 * v, 0.12, 0.11, 0.01);
  }, { reverb: 0.06 });
  sfx('grip', (k) => {
    const v = k.r(0.92, 1.08);
    k.noise({ bp: 620 * v, Q: 3.5, a: 0.004, d: 0.06, g: 0.14 });
    k.tone({ f: 290 * v, f1: 170 * v, d: 0.06, g: 0.06, type: 'triangle', lp: 900 });
    k.noise({ hp: 3200, a: 0.002, d: 0.025, g: 0.025 });
  }, { reverb: 0.04 });
  sfx('dash', (k) => {
    const v = k.r(0.95, 1.05);
    whoosh(k, 500 * v, 3200 * v, 0.2, 0.32, 0, 1.0);
    k.tone({ f: 210 * v, f1: 520 * v, glide: 0.12, d: 0.16, g: 0.06, type: 'sawtooth', lp: 1200 });
    thump(k, 120, 0.08, 0.12);
    crackles(k, 6, 0.14, 0.05);
  }, { reverb: 0.1 });
  sfx('step', (k) => {
    const v = k.r(0.85, 1.15);
    k.noise({ lp: 700 * v, hp: 110, a: 0.002, d: k.r(0.03, 0.05), g: k.r(0.04, 0.06) });
    k.noise({ bp: 3000 * v, Q: 1.5, a: 0.0008, d: 0.012, g: 0.012 });
  }, { reverb: 0.03, prio: 1 });
  sfx('swim', (k) => {
    const v = k.r(0.9, 1.1);
    k.noise({ bp: 650 * v, Q: 1.8, a: 0.03, d: 0.16, g: 0.07 });
    for (let i = 0; i < 2; i++) k.tone({ f: k.r(500, 800), f1: k.r(900, 1300), d: 0.035, g: 0.025, at: k.r(0.02, 0.12) });
  }, { reverb: 0.1, prio: 1 });
  sfx('splash', (k) => {
    const v = k.r(0.92, 1.08);
    k.noise({ lp: 2600 * v, a: 0.004, d: 0.45, g: 0.28 });
    k.noise({ bp: 900 * v, Q: 1.2, a: 0.002, d: 0.18, g: 0.18 });
    thump(k, 110 * v, 0.1, 0.16);
    for (let i = 0; i < 7; i++) {
      const f = k.r(450, 1400);
      k.tone({ f, f1: f * k.r(1.4, 2), d: k.r(0.03, 0.06), g: k.r(0.015, 0.04), at: k.r(0.05, 0.45) });
    }
  }, { reverb: 0.2 });

  // ===========================================================================
  // Combat
  // ===========================================================================
  sfx('slash', (k) => {
    const v = k.r(0.92, 1.08);
    k.noise({ bp: 1100 * v, bp1: 3600 * v, Q: 1.4, a: 0.008, d: 0.1, g: 0.32, sweep: 0.08 });
    k.noise({ hp: 4200 * v, a: 0.004, d: 0.05, g: 0.05, at: 0.02 });
    k.noise({ hp: 6500, a: 0.002, d: 0.04, g: 0.025 });
  }, { reverb: 0.06 });
  sfx('slash_hit', (k) => {
    const v = k.r(0.94, 1.06);
    k.noise({ bp: 2400 * v, Q: 0.9, a: 0.001, d: 0.06, g: 0.38 });
    k.tone({ f: 1750 * v, type: 'square', d: 0.018, g: 0.06, lp: 5000 });
    thump(k, 170 * v, 0.09, 0.3);
    crackles(k, 4, 0.05, 0.06);
  }, { reverb: 0.08 });
  sfx('slash_wall', (k) => {
    const v = k.r(0.93, 1.07);
    k.tone({ f: 2550 * v, type: 'triangle', d: 0.16, g: 0.09, a: 0.001 });
    k.tone({ f: 4130 * v, d: 0.09, g: 0.05, a: 0.001 });
    k.noise({ hp: 3000, a: 0.0008, d: 0.035, g: 0.16 });
    crackles(k, 5, 0.08, 0.05, 0.005);
  }, { reverb: 0.12 });
  sfx('pogo', (k) => {
    const v = k.r(0.95, 1.05);
    k.tone({ f: 310 * v, f1: 720 * v, glide: 0.08, d: 0.13, g: 0.13, type: 'triangle', lp: 2200 });
    k.tone({ f: 2100 * v, d: 0.05, g: 0.05, a: 0.001 });
    whoosh(k, 800, 2100, 0.12, 0.1);
  }, { reverb: 0.08 });
  sfx('enemy_hit', (k) => {
    const v = k.r(0.9, 1.1);
    thump(k, 140 * v, 0.11, 0.42);
    k.noise({ lp: 1300 * v, a: 0.001, d: 0.08, g: 0.3 });
    k.noise({ bp: 520 * v, Q: 3, a: 0.003, d: 0.07, g: 0.14 });
  }, { reverb: 0.08 });
  sfx('enemy_die', (k) => {
    const v = k.r(0.9, 1.08);
    k.noise({ lp: 950 * v, a: 0.003, d: 0.26, g: 0.32 });
    thump(k, 125 * v, 0.24, 0.34);
    k.noise({ bp: 420 * v, Q: 1.4, a: 0.025, d: 0.35, g: 0.12, at: 0.03 });
    k.noise({ hp: 2600, a: 0.06, d: 0.6, g: 0.06, at: 0.05 });
    k.tone({ f: 330 * v, f1: 140 * v, d: 0.3, g: 0.05, type: 'triangle', lp: 900, at: 0.02 });
  }, { reverb: 0.16 });
  sfx('player_hurt', (k) => {
    const v = k.r(0.97, 1.03);
    k.noise({ bp: 1800 * v, Q: 0.8, a: 0.001, d: 0.13, g: 0.42 });
    k.tone({ f: 210 * v, f1: 58, glide: 0.22, d: 0.26, g: 0.5 });
    k.tone({ f: 3100 * v, d: 0.16, g: 0.06, a: 0.001 });
    k.tone({ f: 4730 * v, d: 0.12, g: 0.04, a: 0.001 });
    k.tone({ f: 55, type: 'sawtooth', lp: 400, a: 0.005, d: 0.32, g: 0.1 });
    k.tone({ f: 58.3, type: 'sawtooth', lp: 400, a: 0.005, d: 0.32, g: 0.08 });
  }, { reverb: 0.14 });
  sfx('player_die', (k) => {
    k.noise({ lp: 1600, lp1: 300, a: 0.002, d: 0.8, g: 0.38 });
    k.tone({ f: 160, f1: 38, glide: 0.7, d: 0.9, g: 0.5 });
    k.noise({ bp: 2100, bp1: 300, Q: 1.2, a: 0.03, d: 0.9, g: 0.14, at: 0.05 });
    k.tone({ f: 880, f1: 220, glide: 1.3, a: 0.05, d: 1.5, g: 0.07, type: 'triangle', vib: { rate: 5, depth: 25 }, at: 0.1 });
    k.tone({ f: 1318, f1: 330, glide: 1.3, a: 0.05, d: 1.4, g: 0.04, vib: { rate: 5.5, depth: 25 }, at: 0.12 });
    crackles(k, 8, 0.4, 0.06);
  }, { reverb: 0.35 });
  sfx('hazard', (k) => {
    const v = k.r(0.95, 1.05);
    k.noise({ hp: 2800, a: 0.003, d: 0.32, g: 0.2 });
    k.tone({ f: 230 * v, f1: 85, glide: 0.18, d: 0.22, g: 0.42 });
    k.noise({ bp: 1500 * v, Q: 1, a: 0.001, d: 0.09, g: 0.25 });
    crackles(k, 6, 0.25, 0.06);
  }, { reverb: 0.12 });
  sfx('bolt', (k) => {
    const v = k.r(0.95, 1.05);
    whoosh(k, 380 * v, 1900 * v, 0.32, 0.34, 0, 0.9);
    k.noise({ lp: 320, a: 0.01, d: 0.28, g: 0.24 });
    k.tone({ f: 110 * v, f1: 230 * v, glide: 0.2, type: 'sawtooth', lp: 900, d: 0.26, g: 0.07 });
    k.tone({ f: 660 * v, f1: 1320 * v, glide: 0.15, d: 0.2, g: 0.03, type: 'triangle' });
    crackles(k, 8, 0.2, 0.06);
  }, { reverb: 0.15 });
  sfx('bolt_hit', (k) => {
    const v = k.r(0.92, 1.08);
    k.noise({ lp: 2100 * v, a: 0.002, d: 0.26, g: 0.38 });
    thump(k, 180 * v, 0.2, 0.3);
    crackles(k, 9, 0.18, 0.07);
  }, { reverb: 0.14 });
  sfx('plunge', (k) => {
    k.noise({ bp: 2800, bp1: 450, Q: 1.1, a: 0.02, d: 0.38, g: 0.28, sweep: 0.35 });
    k.noise({ lp: 420, a: 0.05, hold: 0.15, d: 0.3, g: 0.22 });
    k.tone({ f: 620, f1: 120, glide: 0.35, d: 0.4, g: 0.07, type: 'triangle', lp: 2000 });
    crackles(k, 6, 0.3, 0.05);
  }, { reverb: 0.12 });
  sfx('plunge_land', (k) => {
    k.tone({ f: 82, f1: 30, glide: 0.6, d: 0.75, g: 0.7 });
    k.noise({ lp: 850, lp1: 250, a: 0.002, d: 0.65, g: 0.48 });
    k.noise({ bp: 2500, Q: 0.8, a: 0.001, d: 0.22, g: 0.2 });
    debris(k, 12, 0.5, 0.07, 0.03);
    crackles(k, 8, 0.3, 0.05);
  }, { reverb: 0.3 });
  sfx('kindle', (k) => {
    // ~0.9 s rising warm shimmer while healing charges (stoppable via the returned handle)
    k.tone({ f: 220, f1: 440, glide: 0.9, a: 0.3, hold: 0.5, d: 0.35, g: 0.07 });
    k.tone({ f: 330, f1: 660, glide: 0.9, a: 0.35, hold: 0.45, d: 0.35, g: 0.045, type: 'triangle', lp: 2500 });
    k.noise({ bp: 1100, bp1: 3200, Q: 1.3, a: 0.45, hold: 0.35, d: 0.25, g: 0.05, sweep: 0.9 });
    crackles(k, 10, 0.85, 0.03, 0.05);
  }, { reverb: 0.25 });
  sfx('kindle_done', (k) => {
    k.inst('celesta', 'A5', 1.2, 0.55);
    k.inst('celesta', 'E6', 1.2, 0.45, { at: 0.05 });
    k.noise({ lp: 1300, a: 0.02, d: 0.45, g: 0.18 });
    k.tone({ f: 110, a: 0.01, d: 0.45, g: 0.14 });
    k.tone({ f: 880, f1: 1320, glide: 0.25, a: 0.01, d: 0.5, g: 0.03 });
  }, { reverb: 0.3 });
  sfx('ember_full', (k) => {
    k.inst('celesta', 'E6', 1, 0.4);
    k.inst('celesta', 'B6', 1, 0.32, { at: 0.07 });
    k.noise({ hp: 5000, a: 0.05, d: 0.3, g: 0.025 });
  }, { reverb: 0.35, vol: 0.8 });
  const PENTA = [1, 1.125, 1.26, 1.5, 1.68, 2];
  sfx('cinder', (k) => {
    const f = 1760 * k.pick(PENTA);
    k.tone({ f, d: 0.2, g: 0.1, a: 0.001 });
    k.tone({ f: f * 2.76, d: 0.05, g: 0.035, a: 0.001 });
    k.tone({ f: f * 1.5, d: 0.08, g: 0.02, a: 0.001, at: 0.012 });
  }, { reverb: 0.2, vol: 0.85 });
  sfx('projectile', (k) => {
    const v = k.r(0.9, 1.1);
    k.noise({ bp: 950 * v, Q: 1.2, a: 0.003, d: 0.09, g: 0.2 });
    k.tone({ f: 420 * v, f1: 210 * v, d: 0.09, g: 0.1, type: 'triangle' });
  }, { reverb: 0.08 });
  sfx('shockwave', (k) => {
    const v = k.r(0.95, 1.05);
    k.tone({ f: 62 * v, f1: 34, glide: 0.5, d: 0.65, g: 0.5 });
    k.noise({ lp: 320, lp1: 120, a: 0.005, d: 0.6, g: 0.32 });
    whoosh(k, 900, 220, 0.55, 0.1);
  }, { reverb: 0.2 });
  sfx('wisp', (k) => {
    const v = k.r(0.95, 1.05);
    k.noise({ bp: 480 * v, bp1: 900 * v, Q: 5, a: 0.12, d: 0.6, g: 0.16 });
    k.tone({ f: 220 * v, a: 0.12, d: 0.7, g: 0.045, vib: { rate: 6.5, depth: 35 } });
    k.tone({ f: 233 * v, a: 0.12, d: 0.7, g: 0.04, vib: { rate: 5.2, depth: 30 } });
    k.noise({ hp: 3500, a: 0.1, d: 0.5, g: 0.03 });
  }, { reverb: 0.3 });
  sfx('wisp_die', (k) => {
    k.noise({ bp: 300, bp1: 3000, Q: 1.2, a: 0.35, d: 0.25, g: 0.18, sweep: 0.5 });
    ['D6', 'F6', 'A6', 'D7'].forEach((n, i) => k.inst('celesta', n, 0.6, 0.45, { at: 0.3 + i * 0.07 }));
    k.tone({ f: 147, a: 0.2, d: 0.9, g: 0.06, at: 0.3 });
  }, { reverb: 0.4 });

  // ===========================================================================
  // Bosses
  // ===========================================================================
  sfx('boss_roar', (k) => {
    const v = k.r(0.94, 1.06);
    // throat (formant noise) + rough growl (beating saws, wide vibrato) + sub
    k.noise({ bp: 520 * v, bp1: 360 * v, Q: 2.6, a: 0.12, hold: 0.55, d: 0.75, g: 0.34, sweep: 1.3 });
    k.noise({ bp: 1350 * v, bp1: 950 * v, Q: 3.5, a: 0.1, hold: 0.5, d: 0.7, g: 0.15, sweep: 1.2 });
    const growl = { pts: [[0.25, 68 * v], [0.9, 58 * v], [1.4, 44 * v]], type: 'sawtooth', lp: 950, a: 0.12, hold: 0.55, d: 0.8, vib: { rate: 9, depth: 45 } };
    k.tone(Object.assign({ f: 52 * v, g: 0.16 }, growl));
    k.tone(Object.assign({ f: 54.5 * v, g: 0.13, det: 20 }, growl));
    k.tone({ f: 46 * v, f1: 34, glide: 1.4, a: 0.1, hold: 0.5, d: 0.9, g: 0.28 });
    k.noise({ hp: 3000, a: 0.08, hold: 0.4, d: 0.6, g: 0.05 });
  }, { reverb: 0.3 });
  sfx('boss_hit', (k) => {
    const v = k.r(0.92, 1.06);
    thump(k, 105 * v, 0.2, 0.48);
    k.noise({ lp: 1500 * v, a: 0.001, d: 0.15, g: 0.38 });
    k.noise({ bp: 2100 * v, Q: 1, a: 0.001, d: 0.08, g: 0.18 });
    k.tone({ f: 910 * v, d: 0.16, g: 0.045, a: 0.001 });
    k.tone({ f: 1347 * v, d: 0.12, g: 0.03, a: 0.001 });
  }, { reverb: 0.12 });
  sfx('boss_stagger', (k) => {
    const v = k.r(0.95, 1.05);
    k.noise({ bp: 2500 * v, Q: 0.8, a: 0.001, d: 0.16, g: 0.45 });
    k.tone({ f: 92 * v, f1: 38, glide: 0.45, d: 0.55, g: 0.55 });
    k.tone({ f: 150 * v, f1: 78 * v, glide: 0.6, type: 'sawtooth', lp: 600, a: 0.02, d: 0.65, g: 0.1 });
    debris(k, 6, 0.25, 0.06, 0.03);
  }, { reverb: 0.22 });
  sfx('boss_die', (k) => {
    k.tone({ f: 72, f1: 24, glide: 1.6, d: 1.8, g: 0.62 });
    k.noise({ lp: 1400, lp1: 180, a: 0.003, d: 2.6, g: 0.4, sweep: 2.4 });
    k.noise({ bp: 2200, Q: 0.8, a: 0.001, d: 0.3, g: 0.25 });
    debris(k, 14, 1.0, 0.07, 0.05);
    k.inst('bell', 'D2', 4, 0.75, { at: 0.05 });
    k.noise({ hp: 2500, a: 0.6, d: 1.6, g: 0.06, at: 0.4 });
    k.tone({ f: 587, f1: 1175, glide: 2.2, a: 0.8, d: 1.6, g: 0.03, at: 0.5 });
  }, { reverb: 0.4 });
  sfx('bell', (k) => {
    // Abbot Tallowmere's great bell
    k.inst('bell', 'D3', 4.5, 1.0);
    thump(k, 70, 0.3, 0.25);
    k.noise({ bp: 3200, Q: 1.2, a: 0.001, d: 0.06, g: 0.12 });
  }, { reverb: 0.45, vol: 0.9 });

  // ===========================================================================
  // World & objects
  // ===========================================================================
  sfx('break_wall', (k) => {
    const v = k.r(0.93, 1.07);
    k.noise({ lp: 1300 * v, a: 0.002, d: 0.5, g: 0.42 });
    thump(k, 92 * v, 0.4, 0.42);
    debris(k, 12, 0.55, 0.09, 0.02);
    k.noise({ hp: 1800, a: 0.05, d: 0.7, g: 0.05, at: 0.1 });
  }, { reverb: 0.2 });
  sfx('geode_hit', (k) => {
    const v = k.r(0.9, 1.1);
    ping(k, 1820 * v, 0.3, 0.09);
    ping(k, 2710 * v, 0.22, 0.05, 0.004);
    k.noise({ hp: 3200, a: 0.0008, d: 0.03, g: 0.14 });
    thump(k, 210 * v, 0.07, 0.15);
  }, { reverb: 0.18 });
  sfx('geode_break', (k) => {
    for (let i = 0; i < 11; i++) ping(k, k.r(1900, 6200), k.r(0.12, 0.45), k.r(0.02, 0.06), k.r(0, 0.32));
    k.noise({ bp: 3000, Q: 0.8, a: 0.001, d: 0.3, g: 0.32 });
    thump(k, 170, 0.12, 0.25);
    debris(k, 6, 0.2, 0.05, 0, 2500, 6000);
  }, { reverb: 0.25 });
  sfx('lever', (k) => {
    k.tone({ f: 185, type: 'square', lp: 1300, d: 0.1, g: 0.12 });
    k.noise({ bp: 1500, Q: 1.2, a: 0.001, d: 0.05, g: 0.16 });
    for (let i = 0; i < 4; i++) k.noise({ bp: 2600, Q: 2, a: 0.0008, d: 0.018, g: 0.08, at: 0.08 + i * 0.055 });
    k.tone({ f: 610, d: 0.25, g: 0.05, a: 0.001, at: 0.32 });
    k.tone({ f: 917, d: 0.2, g: 0.035, a: 0.001, at: 0.32 });
    thump(k, 120, 0.12, 0.2, 0.32);
  }, { reverb: 0.15 });
  sfx('gate_open', (k) => {
    k.noise({ bp: 210, bp1: 520, Q: 2.2, a: 0.3, hold: 0.9, d: 0.5, g: 0.26, sweep: 1.6 });
    k.tone({ f: 48, a: 0.25, hold: 0.9, d: 0.5, g: 0.18 });
    k.noise({ bp: 1300, Q: 3, a: 0.2, hold: 0.9, d: 0.4, g: 0.04 });
    for (let i = 0; i < 9; i++) k.noise({ bp: k.r(1800, 3200), Q: 2, a: 0.001, d: 0.025, g: k.r(0.03, 0.06), at: k.r(0.1, 1.4) });
    thump(k, 90, 0.35, 0.35, 1.55);
    k.tone({ f: 420, d: 0.6, g: 0.03, a: 0.001, at: 1.55 });
  }, { reverb: 0.25 });
  sfx('gate_close', (k) => {
    k.noise({ lp: 1500, a: 0.001, d: 0.3, g: 0.48 });
    thump(k, 82, 0.42, 0.58);
    for (const f of [418, 643, 1129]) k.tone({ f: f * k.r(0.98, 1.02), d: 0.9, g: 0.045, a: 0.001 });
    debris(k, 4, 0.1, 0.05, 0.01);
  }, { reverb: 0.25 });
  sfx('door', (k) => {
    // the great Seal Door: stone grinding, then a resonant boom and a hushed choir
    k.noise({ lp: 420, a: 0.5, hold: 1.4, d: 1.0, g: 0.3 });
    k.noise({ bp: 160, bp1: 320, Q: 2.5, a: 0.4, hold: 1.4, d: 0.8, g: 0.18, sweep: 2.2 });
    for (let i = 0; i < 12; i++) k.noise({ bp: k.r(900, 2400), Q: 1.5, a: 0.002, d: k.r(0.02, 0.06), g: k.r(0.02, 0.05), at: k.r(0.2, 2.2) });
    k.tone({ f: 46, f1: 30, glide: 1.8, a: 0.005, d: 2.2, g: 0.5, at: 2.3 });
    k.noise({ lp: 600, a: 0.003, d: 1.2, g: 0.3, at: 2.3 });
    k.inst('choir_oo', 'D4', 2.5, 0.55, { at: 2.3 });
    k.inst('choir_oo', 'A4', 2.5, 0.5, { at: 2.35 });
  }, { reverb: 0.45 });
  sfx('shrine', (k) => {
    ['D5', 'A5', 'D6', 'F6', 'A6'].forEach((n, i) => k.inst('celesta', n, 1.2, 0.4 + i * 0.05, { at: i * 0.11 }));
    k.noise({ hp: 3000, hp1: 7000, a: 0.6, d: 0.8, g: 0.05, sweep: 1.2 });
    k.tone({ f: 293.7, a: 0.4, hold: 0.4, d: 1.0, g: 0.05, vib: { rate: 4, depth: 6 } });
    k.tone({ f: 440, a: 0.5, hold: 0.3, d: 1.0, g: 0.035, vib: { rate: 4.5, depth: 6 } });
  }, { reverb: 0.45 });

  // ===========================================================================
  // Pickups, rest & travel
  // ===========================================================================
  sfx('item', (k) => {
    ['A5', 'C#6', 'E6', 'A6'].forEach((n, i) => k.inst('celesta', n, 1.4, 0.6, { at: i * 0.06 }));
    k.noise({ hp: 4500, a: 0.02, d: 0.6, g: 0.04 });
    k.tone({ f: 220, a: 0.01, d: 0.5, g: 0.08 });
  }, { reverb: 0.35 });
  sfx('ability', (k) => {
    whoosh(k, 300, 2600, 0.7, 0.2, 0, 0.9);
    k.tone({ f: 55, f1: 40, glide: 1.2, a: 0.01, d: 1.6, g: 0.4, at: 0.55 });
    k.noise({ lp: 900, a: 0.01, d: 0.9, g: 0.22, at: 0.55 });
    k.inst('bell', 'A3', 3, 0.55, { at: 0.55 });
    ['D5', 'F5', 'A5', 'D6'].forEach((n, i) => k.inst('celesta', n, 1.6, 0.5, { at: 0.6 + i * 0.09 }));
    k.noise({ hp: 3500, a: 0.3, d: 1.4, g: 0.05, at: 0.6 });
  }, { reverb: 0.45 });
  sfx('rest', (k) => {
    k.noise({ lp: 850, a: 0.05, d: 0.6, g: 0.2 });
    k.tone({ f: 98, a: 0.03, d: 0.6, g: 0.12 });
    crackles(k, 12, 1.0, 0.035, 0.1);
    ['D4', 'F4', 'A4', 'D5'].forEach((n, i) => k.inst('harp', n, 2, 0.45, { at: 0.25 + i * 0.09 }));
  }, { reverb: 0.35 });
  sfx('save', (k) => {
    k.inst('celesta', 'D6', 1.2, 0.35);
    k.inst('celesta', 'A6', 1.2, 0.28, { at: 0.12 });
  }, { reverb: 0.35, vol: 0.75 });
  sfx('lanternway', (k) => {
    whoosh(k, 260, 3200, 1.1, 0.22, 0, 0.8);
    k.tone({ f: 196, f1: 392, glide: 1.0, a: 0.4, d: 0.8, g: 0.05, type: 'triangle', lp: 2000 });
    crackles(k, 14, 1.0, 0.035);
    ['A5', 'E6', 'A6'].forEach((n, i) => k.inst('celesta', n, 1.4, 0.45, { at: 0.8 + i * 0.1 }));
  }, { reverb: 0.4 });
  sfx('area_card', (k) => {
    k.tone({ f: 55, a: 0.05, d: 2.6, g: 0.24 });
    k.noise({ lp: 500, a: 0.3, d: 2.0, g: 0.08 });
    k.inst('glass_pad', 'A4', 1.6, 0.5, { attack: 0.5, release: 1.8 });
    k.inst('glass_pad', 'E5', 1.6, 0.42, { attack: 0.6, release: 1.8 });
    k.inst('bell', 'D3', 3, 0.35, { at: 0.05 });
  }, { reverb: 0.55, vol: 0.85 });

  // ===========================================================================
  // UI
  // ===========================================================================
  sfx('menu_move', (k) => {
    k.tone({ f: 1400 * k.r(0.99, 1.01), d: 0.035, g: 0.06, a: 0.001 });
    k.noise({ hp: 3000, a: 0.0008, d: 0.012, g: 0.025 });
  }, { reverb: 0.05, prio: 3 });
  sfx('menu_select', (k) => {
    k.tone({ f: 880, d: 0.16, g: 0.065, a: 0.002 });
    k.tone({ f: 1320, d: 0.25, g: 0.055, a: 0.002, at: 0.055 });
    k.tone({ f: 1760, d: 0.12, g: 0.02, a: 0.002, at: 0.055 });
  }, { reverb: 0.15, prio: 3 });
  sfx('menu_back', (k) => {
    k.tone({ f: 660, f1: 500, glide: 0.07, d: 0.09, g: 0.06, a: 0.002 });
    k.noise({ hp: 2500, a: 0.0008, d: 0.012, g: 0.02 });
  }, { reverb: 0.08, prio: 3 });
  sfx('dialogue_blip', (k) => {
    k.tone({ f: 520 * k.r(0.94, 1.06), type: 'triangle', lp: 1800, d: 0.04, g: 0.035, a: 0.002 });
  }, { reverb: 0.05, prio: 3, vol: 0.9 });
  sfx('map_open', (k) => {
    for (let i = 0; i < 6; i++) k.noise({ bp: k.r(1800, 3600), Q: 0.7, a: 0.01, d: k.r(0.05, 0.1), g: k.r(0.05, 0.1), at: i * 0.05 + k.r(0, 0.02) });
    k.noise({ lp: 900, a: 0.03, d: 0.25, g: 0.06 });
  }, { reverb: 0.08, prio: 3 });
  sfx('shop_buy', (k) => {
    for (let i = 0; i < 3; i++) {
      const f = 1760 * k.pick(PENTA);
      k.tone({ f, d: 0.18, g: 0.07, a: 0.001, at: i * 0.05 });
      k.tone({ f: f * 2.76, d: 0.05, g: 0.025, a: 0.001, at: i * 0.05 });
    }
    k.inst('celesta', 'G5', 1, 0.45, { at: 0.16 });
    k.inst('celesta', 'D6', 1, 0.4, { at: 0.2 });
  }, { reverb: 0.25, prio: 3 });
  sfx('deny', (k) => {
    k.tone({ f: 110, type: 'square', lp: 600, a: 0.003, d: 0.16, g: 0.11 });
    k.tone({ f: 104, type: 'square', lp: 600, a: 0.003, d: 0.16, g: 0.08 });
    k.noise({ lp: 400, a: 0.002, d: 0.06, g: 0.08 });
  }, { reverb: 0.05, prio: 3 });

  // ===========================================================================
  // Ambience beds — continuous layers + sparse random events (see G.Audio.defineAmbience)
  // ===========================================================================
  // Bed levels (`gain`) are calibrated with `node tools/audio_check.js --only ambience` to
  // -29..-24 LUFS (music sits around -20), louder where the bed is the region's signature (wind, rain).
  const amb = (id, def) => A.defineAmbience(id, def);
  const DMIN_PENTA = [587.3, 698.5, 784, 880, 1046.5, 1174.7, 1396.9, 1568];
  const AMAJ_PENTA = [1760, 1975.5, 2217.5, 2637, 2960];

  function crackle(k) {
    k.noise({ hp: k.r(1400, 4200), a: 0.0005, d: k.r(0.008, 0.035), g: k.r(0.04, 0.12) });
    if (k.r(0, 1) < 0.15) k.noise({ lp: 900, a: 0.001, d: 0.05, g: k.r(0.05, 0.1) });
  }
  function drip(k) {
    const f = k.r(1100, 2300);
    k.tone({ f, f1: f * k.r(1.5, 1.9), glide: 0.022, a: 0.001, d: 0.07, g: 0.07 });
    k.noise({ hp: 3000, a: 0.0005, d: 0.006, g: 0.03 });
  }
  function windChime(k) {
    const n = 2 + Math.floor(k.r(0, 3));
    for (let i = 0; i < n; i++) {
      const f = k.pick(DMIN_PENTA) * 2;
      const at = i * k.r(0.12, 0.35);
      k.tone({ f, d: k.r(1.6, 2.6), g: 0.025, a: 0.001, at });
      k.tone({ f: f * 2.76, d: 0.4, g: 0.008, a: 0.001, at });
    }
  }
  function creak(k) {
    k.noise({ bp: 650, bp1: 950, Q: 9, a: 0.12, d: 0.45, g: 0.07, sweep: 0.5 });
    k.tone({ f: 92, f1: 118, type: 'sawtooth', lp: 500, a: 0.1, d: 0.45, g: 0.015, glide: 0.5 });
  }
  function distantBell(k, note) {
    k.reverb(0.95);
    k.inst('bell', note || 'A2', 5, 0.22);
  }
  function stoneClick(k) {
    let at = 0, gap = k.r(0.12, 0.2);
    const n = 2 + Math.floor(k.r(0, 3));
    for (let i = 0; i < n; i++) {
      k.noise({ bp: k.r(1500, 3200), Q: 2.5, a: 0.0005, d: 0.02, g: 0.06 * Math.pow(0.7, i), at });
      at += gap; gap *= 0.65;
    }
  }
  function moan(k, f) {
    k.noise({ bp: f, bp1: f * 1.6, Q: 6, a: 1.8, d: 2.6, g: 0.07, sweep: 4, color: 'pink' });
  }

  amb('wind', {
    gain: 0.67,
    layers: [
      { noise: 'pink', filters: [{ type: 'lowpass', f: 650, Q: 0.5 }, { type: 'bandpass', f: 420, Q: 0.8 }], gain: 0.5,
        lfo: [{ target: 'gain', rate: 0.07, depth: 0.45 }, { target: 'gain', rate: 0.023, depth: 0.3 }, { target: 'sweep', filter: 1, rate: 0.05, depth: 700 }], reverb: 0.2 },
      { noise: 'white', filters: [{ type: 'bandpass', f: 1500, Q: 12 }], gain: 0.05,
        lfo: [{ target: 'sweep', rate: 0.031, depth: 500 }, { target: 'gain', rate: 0.09, depth: 0.8 }], pan: -0.35, reverb: 0.4 },
      { noise: 'white', filters: [{ type: 'bandpass', f: 2200, Q: 14 }], gain: 0.035,
        lfo: [{ target: 'sweep', rate: 0.043, depth: 600 }, { target: 'gain', rate: 0.067, depth: 0.8 }], pan: 0.4, reverb: 0.4 },
      { noise: 'brown', filters: [{ type: 'lowpass', f: 140 }], gain: 0.12 },
    ],
    events: [
      { every: [6, 14], pan: [-0.9, 0.9], play(k) { k.noise({ color: 'pink', bp: 350, bp1: 950, Q: 1, a: 1.2, hold: 0.6, d: 1.8, g: 0.2, sweep: 2.4 }); } },
      { every: [9, 20], play(k) { k.noise({ hp: 3200, a: 0.5, d: 1.4, g: 0.03 }); } },
    ],
  });
  amb('village', {
    gain: 0.69,
    layers: [
      { noise: 'pink', filters: [{ type: 'lowpass', f: 500 }, { type: 'highpass', f: 80 }], gain: 0.2, lfo: [{ target: 'gain', rate: 0.05, depth: 0.4 }], reverb: 0.15 },
      { noise: 'brown', filters: [{ type: 'bandpass', f: 300, Q: 0.7 }], gain: 0.22, pan: -0.25,
        lfo: [{ target: 'gain', rate: 3.1, depth: 0.25 }, { target: 'gain', rate: 7.3, depth: 0.2 }] },
    ],
    events: [
      { every: [0.08, 0.6], pan: [-0.5, 0.1], vol: [0.3, 1], reverb: 0.15, play: crackle },
      { every: [7, 16], pan: [-0.8, 0.8], reverb: 0.6, play: windChime },
      { every: [14, 30], pan: [-0.7, 0.7], reverb: 0.4, play: creak },
      { every: [40, 75], first: 0.3, pan: [-0.3, 0.3], play: (k) => distantBell(k, 'A2') },
    ],
  });
  amb('cave', {
    gain: 0.91,
    layers: [
      { noise: 'brown', filters: [{ type: 'lowpass', f: 160 }], gain: 0.15, lfo: [{ target: 'gain', rate: 0.04, depth: 0.3 }] },
      { noise: 'pink', filters: [{ type: 'bandpass', f: 320, Q: 1.5 }], gain: 0.07,
        lfo: [{ target: 'sweep', rate: 0.027, depth: 500 }, { target: 'gain', rate: 0.06, depth: 0.5 }], reverb: 0.5 },
      { tones: [{ f: 49 }, { f: 73.5, gain: 0.4 }], gain: 0.025, lfo: [{ target: 'gain', rate: 0.05, depth: 0.6 }] },
    ],
    events: [
      { every: [1.2, 4.5], pan: [-0.9, 0.9], reverb: 0.6, play: drip },
      { every: [8, 18], pan: [-0.8, 0.8], reverb: 0.5, play: stoneClick },
      { every: [15, 35], pan: [-0.6, 0.6], reverb: 0.6, play: (k) => moan(k, 210) },
    ],
  });
  amb('garden', {
    gain: 1.08,
    layers: [
      { noise: 'pink', filters: [{ type: 'highpass', f: 1500 }, { type: 'lowpass', f: 6000 }], gain: 0.05, lfo: [{ target: 'gain', rate: 0.11, depth: 0.5 }], reverb: 0.2 },
      { noise: 'pink', filters: [{ type: 'lowpass', f: 420 }], gain: 0.16, lfo: [{ target: 'gain', rate: 0.05, depth: 0.4 }] },
    ],
    events: [
      { every: [2, 6], pan: [-0.9, 0.9], reverb: 0.35, play(k) { // little bird / insect whistles
        const f = k.r(2600, 4200), n = 2 + Math.floor(k.r(0, 3));
        for (let i = 0; i < n; i++) k.tone({ f: f * k.r(0.95, 1.05), f1: f * k.r(0.7, 1.25), glide: 0.07, a: 0.01, d: 0.09, g: 0.025, at: i * k.r(0.1, 0.16) });
      } },
      { every: [4, 10], pan: [-0.8, 0.8], reverb: 0.6, play(k) { // pollen chimes
        const n = 1 + Math.floor(k.r(0, 3));
        for (let i = 0; i < n; i++) { const f = k.pick(AMAJ_PENTA) * 1.5; k.tone({ f, d: 1.2, g: 0.018, a: 0.002, at: i * k.r(0.15, 0.3) }); }
      } },
      { every: [6, 14], pan: [-0.9, 0.9], reverb: 0.2, play(k) { // leaf rustle
        for (let i = 0; i < 5; i++) k.noise({ bp: k.r(2500, 4500), Q: 0.6, a: 0.02, d: k.r(0.05, 0.12), g: k.r(0.02, 0.045), at: i * k.r(0.04, 0.09) });
      } },
    ],
  });
  amb('fire', {
    gain: 0.72,
    layers: [
      { noise: 'brown', filters: [{ type: 'lowpass', f: 380 }], gain: 0.2, lfo: [{ target: 'gain', rate: 0.8, depth: 0.2 }, { target: 'gain', rate: 2.3, depth: 0.15 }] },
      { noise: 'pink', filters: [{ type: 'bandpass', f: 1100, Q: 0.8 }], gain: 0.06, lfo: [{ target: 'gain', rate: 5.3, depth: 0.4 }, { target: 'gain', rate: 3.7, depth: 0.3 }] },
      { noise: 'brown', filters: [{ type: 'lowpass', f: 90 }], gain: 0.12, lfo: [{ target: 'gain', rate: 0.03, depth: 0.4 }] },
    ],
    events: [
      { every: [0.05, 0.35], pan: [-0.8, 0.8], vol: [0.4, 1], reverb: 0.15, play: crackle },
      { every: [5, 12], pan: [-0.9, 0.9], reverb: 0.3, play(k) { k.noise({ hp: 2600, a: 0.25, hold: k.r(0.4, 1.4), d: 0.6, g: 0.05 }); } },
      { every: [9, 22], pan: [-0.8, 0.8], reverb: 0.6, play(k) { // pipe clank
        const f = k.r(300, 520);
        k.tone({ f, d: 0.9, g: 0.03, a: 0.001 }); k.tone({ f: f * 2.41, d: 0.5, g: 0.015, a: 0.001 });
        k.noise({ bp: 1200, Q: 1.5, a: 0.001, d: 0.04, g: 0.05 });
      } },
    ],
  });
  /** Rain texture: dense micro-drops (clicks + tiny bubble chirps), stereo, loopable. */
  function rainTexture(sr, R) {
    const n = Math.floor(sr * 6), ch = [new Float32Array(n), new Float32Array(n)];
    for (let c = 0; c < 2; c++) {
      const out = ch[c];
      const drops = 6 * 420;
      for (let i = 0; i < drops; i++) {
        const p = Math.floor(R() * n), amp = Math.pow(R(), 2.2) * 0.5, len = Math.floor(sr * (0.002 + R() * 0.004));
        let lp = 0;
        const a = 0.2 + R() * 0.6;
        for (let j = 0; j < len; j++) {
          lp += a * ((R() * 2 - 1) - lp);
          out[(p + j) % n] += lp * amp * Math.exp(-j / (len * 0.3));
        }
        if (R() < 0.06) { // bubble chirp
          const f0 = 1500 + R() * 2500, bl = Math.floor(sr * 0.012);
          let ph = 0;
          for (let j = 0; j < bl; j++) {
            ph += 2 * Math.PI * f0 * (1 + j / bl) / sr;
            out[(p + j) % n] += Math.sin(ph) * amp * 0.3 * Math.exp(-j / (bl * 0.35));
          }
        }
      }
    }
    return ch;
  }
  amb('rain', {
    gain: 0.91,
    layers: [
      { gen: rainTexture, key: 'rain_tex', filters: [{ type: 'highpass', f: 300 }, { type: 'lowpass', f: 7000 }], gain: 0.55, reverb: 0.25 },
      { noise: 'pink', filters: [{ type: 'bandpass', f: 1200, Q: 0.5 }], gain: 0.07, lfo: [{ target: 'gain', rate: 0.06, depth: 0.3 }] },
      { noise: 'brown', filters: [{ type: 'lowpass', f: 120 }], gain: 0.25 },
    ],
    events: [
      { every: [0.6, 2.5], pan: [-0.9, 0.9], reverb: 0.5, play(k) { // drops into meltwater pools
        const f = k.r(500, 1100);
        k.tone({ f, f1: f * 1.7, glide: 0.03, a: 0.001, d: 0.09, g: 0.05 });
        k.noise({ lp: 1500, a: 0.001, d: 0.03, g: 0.04 });
      } },
      { every: [25, 50], first: 0.4, pan: [-0.4, 0.4], play: (k) => distantBell(k, 'D2') },
      { every: [10, 20], pan: [-0.9, 0.9], reverb: 0.3, play(k) { // trickle
        for (let i = 0; i < 8; i++) { const f = k.r(900, 1800); k.tone({ f, f1: f * 1.3, glide: 0.02, a: 0.001, d: 0.03, g: 0.012, at: i * k.r(0.04, 0.09) }); }
      } },
    ],
  });
  amb('forge', {
    gain: 1.19,
    layers: [
      { noise: 'brown', filters: [{ type: 'lowpass', f: 150 }], gain: 0.15, lfo: [{ target: 'gain', rate: 0.13, depth: 0.25 }] },
      { noise: 'pink', filters: [{ type: 'bandpass', f: 600, Q: 0.9 }], gain: 0.05, lfo: [{ target: 'gain', rate: 1.7, depth: 0.3 }] },
      { tones: [{ f: 50 }, { f: 100, gain: 0.35 }, { f: 150, gain: 0.12 }], gain: 0.022 },
    ],
    events: [
      { every: [3, 7], pan: [-0.9, 0.9], vol: [0.5, 1], play(k) { // distant hammer on anvil
        k.reverb(0.8);
        const note = k.pick(['E5', 'G5', 'A5', 'C6']);
        k.inst('anvil', note, 1, k.r(0.2, 0.35));
        if (k.r(0, 1) < 0.5) k.inst('anvil', note, 1, k.r(0.15, 0.25), { at: k.r(0.35, 0.5) });
      } },
      { every: [0.8, 3], pan: [-0.8, 0.8], reverb: 0.25, play(k) { // molten blorps
        const f = k.r(80, 170);
        k.tone({ f, f1: f * 2.3, glide: 0.08, a: 0.004, d: 0.13, g: 0.09, lp: 650 });
      } },
      { every: [10, 20], pan: [-0.9, 0.9], reverb: 0.4, play(k) { // chain rattle
        let at = 0;
        for (let i = 0; i < 12; i++) { k.noise({ bp: k.r(2500, 5200), Q: 2.5, a: 0.0005, d: 0.02, g: k.r(0.02, 0.05), at }); at += k.r(0.02, 0.06); }
      } },
      { every: [7, 15], pan: [-0.9, 0.9], reverb: 0.3, play(k) { k.noise({ hp: 2500, a: 0.2, hold: k.r(0.5, 1.5), d: 0.6, g: 0.05 }); } },
    ],
  });
  amb('forest', {
    gain: 1.35,
    layers: [
      { noise: 'pink', filters: [{ type: 'lowpass', f: 700 }], gain: 0.1, lfo: [{ target: 'gain', rate: 0.04, depth: 0.4 }] },
      { noise: 'white', filters: [{ type: 'bandpass', f: 4800, Q: 7 }], gain: 0.022, pan: -0.5,
        lfo: [{ target: 'gain', rate: 11, depth: 0.9 }, { target: 'gain', rate: 0.07, depth: 0.5 }] },
      { noise: 'white', filters: [{ type: 'bandpass', f: 5600, Q: 8 }], gain: 0.018, pan: 0.55,
        lfo: [{ target: 'gain', rate: 13.5, depth: 0.9 }, { target: 'gain', rate: 0.05, depth: 0.5 }] },
      { tones: [{ f: 110 }, { f: 165.3, gain: 0.5 }], gain: 0.01, lfo: [{ target: 'gain', rate: 0.03, depth: 0.8 }] },
    ],
    events: [
      { every: [3, 8], pan: [-0.9, 0.9], reverb: 0.3, play(k) { // moth wing flutter
        const n = 6 + Math.floor(k.r(0, 7)), f = k.r(1400, 2400);
        for (let i = 0; i < n; i++) k.noise({ bp: f, Q: 1.5, a: 0.004, d: 0.018, g: 0.03 * Math.sin(Math.PI * (i + 0.5) / n), at: i * 0.04 });
      } },
      { every: [5, 12], pan: [-0.9, 0.9], reverb: 0.45, play(k) { // wick-reed clicks
        const n = 2 + Math.floor(k.r(0, 3));
        for (let i = 0; i < n; i++) { const at = i * k.r(0.08, 0.2); k.noise({ bp: 1800, Q: 4, a: 0.0005, d: 0.02, g: 0.04, at }); k.tone({ f: k.r(700, 950), d: 0.04, g: 0.012, a: 0.001, at }); }
      } },
      { every: [12, 25], pan: [-0.5, 0.5], reverb: 0.6, play(k) { k.tone({ f: 82, f1: 77, a: 2, d: 3, g: 0.03 }); k.noise({ lp: 300, a: 2, d: 2.5, g: 0.04 }); } },
    ],
  });
  amb('ice', {
    gain: 1.46,
    layers: [
      { noise: 'white', filters: [{ type: 'bandpass', f: 2600, Q: 6 }], gain: 0.028, pan: -0.3, reverb: 0.5,
        lfo: [{ target: 'sweep', rate: 0.035, depth: 800 }, { target: 'gain', rate: 0.08, depth: 0.7 }] },
      { noise: 'pink', filters: [{ type: 'bandpass', f: 700, Q: 1 }], gain: 0.12, reverb: 0.3,
        lfo: [{ target: 'gain', rate: 0.05, depth: 0.5 }, { target: 'sweep', rate: 0.02, depth: 600 }] },
      { tones: [{ f: 36.7 }, { f: 55, gain: 0.4 }], gain: 0.035, lfo: [{ target: 'gain', rate: 0.03, depth: 0.5 }] },
    ],
    events: [
      { every: [4, 10], pan: [-0.9, 0.9], reverb: 0.6, play(k) { // crystal tinkles
        const n = 3 + Math.floor(k.r(0, 4));
        for (let i = 0; i < n; i++) ping(k, k.r(3800, 8500), k.r(0.3, 0.9), 0.012, i * k.r(0.04, 0.12));
      } },
      { every: [9, 20], pan: [-0.9, 0.9], reverb: 0.55, play(k) { // ice crack
        k.noise({ hp: 1500, a: 0.0005, d: 0.09, g: 0.22 });
        k.tone({ f: 1600, f1: 280, glide: 0.15, a: 0.001, d: 0.2, g: 0.035 });
        thump(k, 70, 0.25, 0.12, 0.01);
      } },
      { every: [15, 30], pan: [-0.6, 0.6], reverb: 0.6, play(k) { // deep groan of the ice
        k.tone({ f: 61, f1: 52, type: 'sawtooth', lp: 300, a: 1, d: 2, g: 0.035 });
        k.noise({ bp: 200, Q: 5, a: 1, d: 2, g: 0.05 });
      } },
    ],
  });
  amb('sanctum', {
    gain: 1.26,
    layers: [
      { tones: [{ f: 293.66 }, { f: 440, gain: 0.7 }, { f: 587.33, gain: 0.5 }, { f: 659.26, gain: 0.35 }, { f: 880, gain: 0.25 }], gain: 0.011,
        lfo: [{ target: 'gain', rate: 0.07, depth: 0.5 }], reverb: 0.8 },
      { tones: [{ f: 1174.66, det: 4 }, { f: 1760, gain: 0.6, det: -5 }], gain: 0.005,
        lfo: [{ target: 'gain', rate: 0.13, depth: 0.9 }, { target: 'pan', rate: 0.05, depth: 0.6 }], reverb: 0.9 },
      { noise: 'pink', filters: [{ type: 'highpass', f: 3000 }, { type: 'lowpass', f: 9000 }], gain: 0.02, lfo: [{ target: 'gain', rate: 0.06, depth: 0.5 }], reverb: 0.4 },
      { tones: [{ f: 73.42 }], gain: 0.03 },
    ],
    events: [
      { every: [5, 12], pan: [-0.8, 0.8], reverb: 0.85, play(k) { // crystal chime
        const f = k.pick([1174.66, 1318.5, 1480, 1760, 2349.3]);
        k.tone({ f, d: 2.5, g: 0.03, a: 0.002, fm: { ratio: 3.5, index: 1.4, index1: 0.01, d: 0.4 } });
      } },
      { every: [18, 35], pan: [-0.5, 0.5], reverb: 0.8, play(k) { k.inst('choir_oo', k.pick(['D4', 'A4', 'F#4']), 3, 0.3, { attack: 1.5, release: 2 }); } },
    ],
  });

  // ===========================================================================
  // Stingers — short musical cues in the track format (docs/AUDIO_FORMAT.md)
  // ===========================================================================
  A.defineStinger('item', {
    bpm: 96, duck: 0.5, tail: 2.5, reverb: 0.45, volume: 0.65,
    parts: {
      cel: { inst: 'celesta', vol: 0.75, grid: '16n' },
      harp: { inst: 'harp', vol: 0.5 },
      pad: { inst: 'strings', vol: 0.3, params: { attack: 0.2 } },
    },
    sections: { A: {
      cel: 'A5 C#6 E6 A6 - - - - - - - - . . . .',
      harp: 'A3+E4+A4 - - - - - - -',
      pad: 'A3+C#4+E4',
    } },
    order: ['A'],
  });
  A.defineStinger('ability', {
    bpm: 84, duck: 0.7, tail: 3.5, reverb: 0.5, volume: 0.5,
    parts: {
      str: { inst: 'strings', vol: 0.5 },
      choir: { inst: 'choir', vol: 0.45 },
      cel: { inst: 'celesta', vol: 0.6 },
      bell: { inst: 'bell', vol: 0.5 },
      timp: { inst: 'timpani', vol: 0.55, humanize: false },
      sub: { inst: 'sub_bass', vol: 0.5 },
    },
    sections: { A: {
      str: '[Dm9] | [Bb] - - - [A] - - - | D3+A3+D4+F#4+A4',
      choir: 'A4 - - - - - - - | Bb4 - - - A4 - - - | A4',
      cel: 'D6 F6 A6 E6 F6 A6 D7 . | F6 D6 Bb5 . E6 C#6 A5 . | F#6 - A6 - D7 - - -',
      bell: '. | . . . . A3 . . . | D3',
      timp: { notes: 'D2 D2 D2 D2 D2 D2 D2 D2! | Bb2 . . . A2 A2 A2 A2! | D2! . . . . . . .', ramp: [0.4, 1] },
      sub: 'D1 | Bb0 - - - A0 - - - | D1',
    } },
    order: ['A'],
  });
  A.defineStinger('boss_defeated', {
    bpm: 72, duck: 0.8, tail: 4, reverb: 0.45, volume: 0.5,
    parts: {
      brass: { inst: 'brass', vol: 0.55 },
      str: { inst: 'strings', vol: 0.5 },
      timp: { inst: 'timpani', vol: 0.6, humanize: false },
      cym: { inst: 'cymbal_swell', vol: 0.4 },
      bell: { inst: 'bell', vol: 0.45 },
    },
    sections: { A: {
      brass: 'D2+A2 - - - F2+C3 - - - | C2+G2 - - - D2+A2 - - -',
      str: '[Dm] - - - [F] - - - | [C] - - - D3+F#3+A3+D4 - - -',
      timp: 'D2! . . D2 F2! . . . | C2! . A2 A2 D2! . . .',
      cym: '. . . . . . . . | . . C5 - . . . .',
      bell: '. | . . . . D3 . . .',
    } },
    order: ['A'],
  });
  A.defineStinger('death', {
    bpm: 50, duck: 0.9, tail: 4, reverb: 0.55, volume: 0.4,
    parts: {
      cello: { inst: 'cello', vol: 0.5, legato: true },
      choir: { inst: 'choir_oo', vol: 0.4 },
      bell: { inst: 'bell', vol: 0.4 },
      drone: { inst: 'drone', vol: 0.5, params: { attack: 0.8 } },
    },
    sections: { A: {
      cello: 'A3 - G3 - F3 - E3 -',
      choir: '[Dm]',
      bell: 'D2 . . . . . . .',
      drone: 'D2',
    } },
    order: ['A'],
  });
  A.defineStinger('spark', {
    bpm: 72, duck: 0.6, tail: 3.5, reverb: 0.55, volume: 0.5,
    parts: {
      box: { inst: 'music_box', vol: 0.6 },
      glass: { inst: 'glass_pad', vol: 0.45, params: { attack: 0.5 } },
      harp: { inst: 'harp', vol: 0.45, pedal: true },
    },
    sections: { A: {
      box: 'A5 - D6 - C6 A5 F5 -',
      glass: 'D4+A4+E5',
      harp: 'D3 A3 D4 E4 F4 A4 D5 .',
    } },
    order: ['A'],
  });
  A.defineStinger('seal', {
    bpm: 60, duck: 0.8, tail: 4.5, reverb: 0.55, volume: 0.5,
    parts: {
      organ: { inst: 'organ', vol: 0.45 },
      choir: { inst: 'choir', vol: 0.4 },
      bell: { inst: 'bell', vol: 0.5 },
      sub: { inst: 'sub_bass', vol: 0.4 },
    },
    sections: { A: {
      organ: '[Dm] | [Bb] - - - D3+F#3+A3+D4 - - -',
      choir: 'D5 - - - C5 - - - | D5 - - - - - - -',
      bell: 'D3 . . . . . . . | Bb2 . . . D3 . . .',
      sub: 'D1 | Bb0 - - - D1 - - -',
    } },
    order: ['A'],
  });
})();
