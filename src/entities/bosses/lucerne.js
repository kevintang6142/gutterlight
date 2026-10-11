// src/entities/bosses/lucerne.js — LUCERNE, the Everlantern (final boss; arena hs_03 "The Heartwick"). Owner: boss-lucerne.
// Form 1 — Queen Lucerne: a floating regal figure of gold-white wax, a crown of ever-burning candles, a lantern-staff.
//   Attacks: beam (aimed light lances from the lantern), motes (homing light motes), spikes (crystal spikes from the
//   surface under the player, telegraphed cracks), nova (close-range crown flare), dive (descending judgement + floor
//   waves). At half health she rises to the Everlantern and fuses with it (phase-2 lines).
// Form 2 — the Everlantern: the cage's heart, a huge golden lantern with a blinding core and her face in the glass, hung
//   on a chain from the cage. Attacks: sweep (two lasers fanning down — climb/leave — or up — drop), pulse (darkness
//   falls, rings of light with dark lanes), motes, spikes, beam (three lances). Golden panes appear and vanish as extra
//   footholds. Phase 3 (desperation) at 20 %: double sweeps, three rings, faster.
// Defeat: last words, the heart sinks, the victory is recorded, then the ending beat (gutterlight: six sparks shatter
//   the cage; undying: the Everlantern draws the Wickling's flame in) and G.game.finishGame().
// Registers: boss 'lucerne' (entity boss_lucerne, both forms), projectile 'lucerne_mote', entities 'lucerne_pane'
// (ephemeral one-way platform) and 'lucerne_fx' (attack FX layer), room script 'lucerne_heart' (the Everlantern
// backdrop, deck supports, the waiting queen, the after-state) and the lucerne_* sfx. Test hooks: G.Lucerne.
// API notes: docs/api/boss-lucerne.md.
(function () {
  'use strict';
  const G = globalThis.G;
  if (!G || !G.Boss || !G.Enemy) return;

  const TILE = G.CONST.TILE;
  const TAU = Math.PI * 2;
  const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
  const lerp = (a, b, k) => a + (b - a) * k;
  const rnd = (a, b) => a + Math.random() * (b - a);
  const damp = (a, b, k, dt) => a + (b - a) * (1 - Math.exp(-k * dt));
  const smooth = (k) => (k <= 0 ? 0 : k >= 1 ? 1 : k * k * (3 - 2 * k));
  const angDiff = (a, b) => { let d = a - b; while (d > Math.PI) d -= TAU; while (d < -Math.PI) d += TAU; return d; };
  const sfx = (name, x, o) => { if (G.sfxAt) G.sfxAt(name, x, o); };
  const burst = (k, x, y, o) => { if (G.fx) G.fx.burst(k, x, y, o); };
  const glow = (ctx, x, y, r, c, a) => { if (G.Art && G.Art.glow) G.Art.glow(ctx, x, y, r, c, a); else if (G.fx && G.fx.glowAt) G.fx.glowAt(ctx, x, y, r, c, a); };
  // The First Flame is a warm white (the shared 'white' palette has blue-grey edges that read as the Wickling's blue
  // flame under the hall's gold light): a local palette is added to G.Art.FLAMES on first use.
  const FIRST = { outer: '#d9b46a', mid: '#fff0c4', core: '#ffffff', glow: '#fff2d0' };
  const flame = (ctx, x, y, s, kind, t, seed, o) => {
    if (!G.Art || !G.Art.flame) return;
    if (kind === 'white' && G.Art.FLAMES) { if (!G.Art.FLAMES.lucerne_first) G.Art.FLAMES.lucerne_first = FIRST; kind = 'lucerne_first'; }
    G.Art.flame(ctx, x, y, s, kind, t, seed, o);
  };
  const light = (o) => { if (G.lighting) G.lighting.add(o); };
  // Difficulty modes: EXPLICIT telegraphs (beam guide lines, the spike columns, the nova circle, the dive column, the
  // sweep wedge, the pulse lanes) are drawn in full only while this is true (easy); a few are kept in a subtler form in
  // standard / hardcore. Gameplay timing never depends on it. Per-attack decisions and the diegetic tells:
  // docs/api/boss-lucerne.md "Telegraphs by mode".
  const teleOn = () => (G.telegraphsOn ? G.telegraphsOn() : (!(G.game && G.game.telegraphs) || G.game.telegraphs() !== false));
  const playerOf = () => (G.game && G.game.player) || null;

  // ---------------------------------------------------------------------------------------------------------
  // Numbers (px, s). Brand 5/9/13/17 → 1400 HP = 108 hits at L2, 83 at L3 (spells 15).
  // ---------------------------------------------------------------------------------------------------------
  const NUM = {
    HP: 1400, SPLIT: 0.5, LATE1: 0.78, P3: 0.2,
    Q_W: 60, Q_H: 136, HOVER: 34,             // the queen's box; her hem floats this far above the floor
    L_W: 150, L_H: 172,                       // the lantern's glass globe (hurt box)
    BEAM_HALF: 16, BEAM_LOCK: 0.45, BEAM_FIRE: 0.38,   // lock → fire 0.45 s: a 0.3 s reaction still steps out
    SWEEP_HALF: 20, SWEEP_MAX: Math.PI / 3, SWEEP_TIME: 1.45, SWEEP_TELE: 1.05, V_H: 360, UP_H: 160,
    // idle heart: 500 px up (baseline QA, was 460): a full jump + full double jump + up-slash from the floor reaches its
    // bottom without touching it (at 460 the bob put the contact box in the double jump's path, so the idle heart was
    // only safely hittable from the row-21 decks); still side-slashable from those decks
    IDLE2_H: 500, PULSE_H: 560,             // pulse: low enough that the heart stays on screen above a player on the floor
    RING_SPEED: 520, RING_BAND: 30, GAP: 0.48, RING_GAP_T: 1.25,
    SPIKE_W: 64, SPIKE_H: 128, SPIKE_WARN: 0.75, SPIKE_RISE: 0.1, SPIKE_HOLD: 0.45,
    NOVA_R: 165, NOVA_TELE: 0.6,
    DIVE_H: 420, DIVE_COL: 64, DIVE_TELE: 0.9, DIVE_LOCK: 0.5,
    MOTE_SPEED: 290, MOTE_TURN: 2.6, MOTE_HOME: 1.35, MOTE_LIFE: 3.4,
    PANE_W: 120, PANE_LIFE: 5.2,
    REVEAL: 2.2,                              // first intro of the session: seconds spent looking up at the cage
  };
  let revealSeen = false;

  const COL = {
    outline: '#1a1206', gold: '#f2d68a', goldShade: '#b08a40', goldDeep: '#6e5220', goldHi: '#fff6d8',
    wax: '#f7ecd2', waxShade: '#cdb787', waxDeep: '#8a7046', white: '#fffdf4', core: '#fff6d8',
    beam: '#fff1c4', beamEdge: '#ffcf5a', tele: '#ffe2a0', crystal: '#fff2cc', crystalShade: '#c8ac6a',
    glass: '#ffe9b0', face: '#fff1d0', blue: '#8fd0ff', blueHot: '#e6f6ff', dark: '#0a0704',
  };

  // ---------------------------------------------------------------------------------------------------------
  // Arena geometry (works in hs_03 and in any dev room: everything is measured from the tiles)
  // ---------------------------------------------------------------------------------------------------------
  function arenaGeom(room, hintX) {
    const T = G.T, cols = room.cols, rows = room.rows;
    const solid = (c, r) => G.Physics.isSolidTile(room.tileAt(c, r));
    const c = clamp(Math.floor((hintX != null ? hintX : room.widthPx / 2) / TILE), 1, cols - 2);
    let r = rows - 1;
    while (r > 1 && solid(c, r)) r--;
    const floorRow = r + 1, floorY = floorRow * TILE;
    const probe = Math.max(1, floorRow - 5);
    let w = c; while (w > 0 && !solid(w - 1, probe)) w--;
    let e = c; while (e < cols - 1 && !solid(e + 1, probe)) e++;
    let top = floorRow - 1; while (top > 0 && !solid(c, top - 1)) top--;
    const west = w * TILE, east = (e + 1) * TILE, ceilY = top * TILE;
    const mid = clamp(room.widthPx / 2, west + 240, east - 240);
    const decks = [];
    for (let rr = 1; rr < rows - 1; rr++) {
      let c0 = -1;
      for (let cc = 0; cc <= cols; cc++) {
        const isP = cc < cols && room.tileAt(cc, rr) === T.PLATFORM;
        if (isP && c0 < 0) c0 = cc;
        if (!isP && c0 >= 0) { decks.push({ x0: c0 * TILE, x1: cc * TILE, y: rr * TILE }); c0 = -1; }
      }
    }
    const anchorY = Math.max(ceilY + 40, floorY - 800);
    return { floorY, floorRow, west, east, ceilY, mid, decks, anchorY, heartY: Math.max(ceilY + 120, anchorY - 220) };
  }
  /** y of the first floor or deck surface at or below (x, y). */
  function surfaceBelow(room, x, y, floorY) {
    const c = Math.floor(x / TILE);
    for (let r = Math.max(0, Math.floor(y / TILE)); r * TILE < floorY; r++) {
      const code = room.tileAt(c, r);
      if (G.Physics.isSolidTile(code) || code === G.T.PLATFORM) return r * TILE;
    }
    return floorY;
  }
  function castLen(room, x0, y0, a, max) {
    const x1 = x0 + Math.cos(a) * max, y1 = y0 + Math.sin(a) * max;
    const h = G.Physics.raycast(room, x0, y0, x1, y1);
    return h && h.hit ? Math.hypot(h.x - x0, h.y - y0) : max;
  }

  // ---------------------------------------------------------------------------------------------------------
  // Hit tests (the player is a vertical capsule)
  // ---------------------------------------------------------------------------------------------------------
  function ptSeg(px, py, ax, ay, bx, by) {
    const vx = bx - ax, vy = by - ay, l2 = vx * vx + vy * vy || 1;
    const k = clamp(((px - ax) * vx + (py - ay) * vy) / l2, 0, 1);
    return Math.hypot(ax + vx * k - px, ay + vy * k - py);
  }
  function segX(ax, ay, bx, by, cx, cy, dx, dy) {
    const d = (bx - ax) * (dy - cy) - (by - ay) * (dx - cx);
    if (Math.abs(d) < 1e-9) return false;
    const u = ((cx - ax) * (dy - cy) - (cy - ay) * (dx - cx)) / d;
    const v = ((cx - ax) * (by - ay) - (cy - ay) * (bx - ax)) / d;
    return u >= 0 && u <= 1 && v >= 0 && v <= 1;
  }
  function segSegDist(ax, ay, bx, by, cx, cy, dx, dy) {
    if (segX(ax, ay, bx, by, cx, cy, dx, dy)) return 0;
    return Math.min(ptSeg(ax, ay, cx, cy, dx, dy), ptSeg(bx, by, cx, cy, dx, dy), ptSeg(cx, cy, ax, ay, bx, by), ptSeg(dx, dy, ax, ay, bx, by));
  }
  function beamTouches(p, x0, y0, x1, y1, half) {
    const r = p.w / 2 - 2, pcx = p.x + p.w / 2;
    return segSegDist(x0, y0, x1, y1, pcx, p.y + r, pcx, p.y + p.h - r) < half + r;
  }
  function circleRect(cx, cy, R, r) {
    const qx = clamp(cx, r.x, r.x + r.w), qy = clamp(cy, r.y, r.y + r.h);
    return (qx - cx) * (qx - cx) + (qy - cy) * (qy - cy) < R * R;
  }
  const overlap = (a, b) => a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y;

  // ---------------------------------------------------------------------------------------------------------
  // Sound design
  // ---------------------------------------------------------------------------------------------------------
  (function defineSounds() {
    const A = G.Audio;
    if (!A || typeof A.defineSfx !== 'function') return;
    const shimmer = (k, n, span, g, at, lo, hi) => {
      for (let i = 0; i < n; i++) k.tone({ f: k.r(lo || 1800, hi || 4200), type: 'sine', a: 0.004, d: k.r(0.1, 0.3), g: g * k.r(0.4, 1), at: (at || 0) + k.r(0, span) });
    };
    // beam wind-up: a glassy tone rising under a choir breath
    A.defineSfx('lucerne_charge', { vol: 1.7, reverb: 0.45, prio: 2, play(k) {
      const v = k.r(0.97, 1.03);
      k.tone({ f: 440 * v, f1: 1320 * v, glide: 0.75, wave: 'glass', a: 0.05, hold: 0.55, d: 0.3, g: 0.11 });
      k.tone({ f: 220 * v, f1: 330 * v, glide: 0.7, type: 'triangle', a: 0.1, hold: 0.45, d: 0.3, g: 0.08 });
      k.noise({ color: 'pink', bp: 2400, bp1: 6000, Q: 2, a: 0.3, hold: 0.3, d: 0.25, g: 0.08, sweep: 0.7 });
      shimmer(k, 5, 0.7, 0.03, 0.05);
    } });
    // the aim locks: a crisp bell ping
    A.defineSfx('lucerne_lock', { vol: 1.6, reverb: 0.4, prio: 3, play(k) {
      k.inst('bell', 'A5', 0.6, 0.55);
      k.tone({ f: 2640, type: 'sine', a: 0.002, d: 0.18, g: 0.08 });
    } });
    // a lance of light: bright burst + sizzling hum
    A.defineSfx('lucerne_beam', { vol: 1.9, reverb: 0.3, prio: 3, play(k) {
      const v = k.r(0.95, 1.05);
      k.tone({ f: 880 * v, f1: 1760 * v, glide: 0.06, type: 'sawtooth', lp: 4200, a: 0.004, hold: 0.25, d: 0.25, g: 0.1 });
      k.tone({ f: 110 * v, type: 'sawtooth', lp: 900, a: 0.01, hold: 0.25, d: 0.2, g: 0.12, vib: { rate: 30, depth: 60 } });
      k.noise({ color: 'white', hp: 3000, a: 0.003, hold: 0.22, d: 0.2, g: 0.12 });
      k.noise({ color: 'pink', bp: 900, Q: 0.8, a: 0.002, d: 0.3, g: 0.2 });
    } });
    // motes gather: a celesta flurry
    A.defineSfx('lucerne_motes', { vol: 1.5, reverb: 0.55, prio: 2, play(k) {
      const notes = ['D6', 'A5', 'F6', 'D6', 'A6', 'E6'];
      for (let i = 0; i < notes.length; i++) k.inst('celesta', notes[i], 0.5, 0.45, { at: i * 0.07 });
      shimmer(k, 8, 0.5, 0.025, 0);
    } });
    A.defineSfx('lucerne_release', { vol: 1.2, reverb: 0.4, prio: 1, play(k) {
      k.tone({ f: k.r(1400, 1900), f1: k.r(700, 900), glide: 0.18, type: 'sine', a: 0.003, d: 0.22, g: 0.07 });
      k.noise({ color: 'pink', bp: 3000, Q: 1.5, a: 0.01, d: 0.16, g: 0.06 });
    } });
    // staff raised: an airy rising swell
    A.defineSfx('lucerne_raise', { vol: 1.7, reverb: 0.5, prio: 2, play(k) {
      k.inst('choir_oo', 'D4', 0.7, 0.5);
      k.inst('choir_oo', 'A4', 0.7, 0.4);
      k.noise({ color: 'pink', bp: 1200, bp1: 3600, Q: 1.2, a: 0.2, hold: 0.2, d: 0.3, g: 0.1, sweep: 0.5 });
    } });
    // crystal cracks: dry crackle with glassy ticks
    A.defineSfx('lucerne_crack', { vol: 1.6, reverb: 0.3, prio: 2, play(k) {
      for (let i = 0; i < 9; i++) k.noise({ color: 'white', hp: 2500, a: 0.001, d: k.r(0.02, 0.05), g: k.r(0.08, 0.18), at: k.r(0, 0.32) });
      shimmer(k, 4, 0.3, 0.03, 0, 3000, 6000);
      k.tone({ f: 90, f1: 60, glide: 0.4, type: 'triangle', a: 0.02, d: 0.4, g: 0.12 });
    } });
    // crystal spikes erupt: a glassy burst with bell overtones
    A.defineSfx('lucerne_spike', { vol: 1.9, reverb: 0.35, prio: 3, play(k) {
      k.noise({ color: 'white', hp: 1800, a: 0.001, d: 0.25, g: 0.22 });
      k.tone({ f: 150, f1: 70, glide: 0.2, type: 'sine', a: 0.002, d: 0.3, g: 0.3 });
      k.inst('bell', 'E6', 0.6, 0.35);
      shimmer(k, 6, 0.15, 0.04, 0.01, 2500, 5500);
    } });
    // nova wind-up: light drawn inward (reverse swell)
    A.defineSfx('lucerne_gather', { vol: 1.7, reverb: 0.45, prio: 2, play(k) {
      k.noise({ color: 'pink', bp: 600, bp1: 4000, Q: 1.4, a: 0.5, hold: 0.05, d: 0.08, g: 0.16, sweep: 0.55 });
      k.tone({ f: 300, f1: 900, glide: 0.55, wave: 'glass', a: 0.45, hold: 0.05, d: 0.1, g: 0.1 });
    } });
    // nova burst / ring release
    A.defineSfx('lucerne_nova', { vol: 2.0, reverb: 0.5, prio: 3, play(k) {
      k.tone({ f: 120, f1: 50, glide: 0.4, type: 'sine', a: 0.002, d: 0.6, g: 0.38 });
      k.noise({ color: 'pink', lp: 5000, lp1: 800, a: 0.004, d: 0.5, g: 0.25, sweep: 0.5 });
      k.inst('bell', 'D5', 1.2, 0.5);
      k.inst('bell', 'A5', 1.0, 0.3, { at: 0.02 });
    } });
    // blink: a shimmering dissolve
    A.defineSfx('lucerne_blink', { vol: 1.4, reverb: 0.5, prio: 1, play(k) {
      shimmer(k, 10, 0.25, 0.04, 0, 2000, 6000);
      k.noise({ color: 'white', hp: 4000, a: 0.04, d: 0.25, g: 0.06 });
    } });
    // the dive: a falling whoosh
    A.defineSfx('lucerne_dive', { vol: 1.8, reverb: 0.3, prio: 2, play(k) {
      k.noise({ color: 'pink', bp: 3000, bp1: 500, Q: 1.1, a: 0.02, hold: 0.1, d: 0.25, g: 0.25, sweep: 0.3 });
      k.tone({ f: 900, f1: 200, glide: 0.3, wave: 'glass', a: 0.01, d: 0.3, g: 0.08 });
    } });
    // the slam: holy impact
    A.defineSfx('lucerne_slam', { vol: 2.1, reverb: 0.45, prio: 3, play(k) {
      k.tone({ f: 90, f1: 38, glide: 0.35, type: 'sine', a: 0.002, d: 0.7, g: 0.5 });
      k.noise({ color: 'brown', lp: 1400, a: 0.002, d: 0.5, g: 0.4 });
      k.noise({ color: 'white', hp: 3000, a: 0.001, d: 0.2, g: 0.12 });
      k.inst('bell', 'D4', 1.6, 0.6);
    } });
    // sweep charge: a deep hum swelling under a high glass tone
    A.defineSfx('lucerne_sweep_charge', { vol: 1.9, reverb: 0.4, prio: 3, play(k) {
      k.tone({ f: 55, f1: 82, glide: 1.0, type: 'sawtooth', lp: 500, a: 0.3, hold: 0.7, d: 0.2, g: 0.2, vib: { rate: 6, depth: 30 } });
      k.tone({ f: 1320, f1: 1760, glide: 1.0, wave: 'glass', a: 0.4, hold: 0.6, d: 0.2, g: 0.07 });
      k.noise({ color: 'pink', bp: 800, bp1: 2400, Q: 1.5, a: 0.6, hold: 0.4, d: 0.2, g: 0.1, sweep: 1.0 });
    } });
    // the sweep: a sustained searing laser (about 1.5 s)
    A.defineSfx('lucerne_sweep', { vol: 2.0, reverb: 0.3, prio: 3, play(k) {
      k.tone({ f: 165, type: 'sawtooth', lp: 1800, a: 0.02, hold: 1.3, d: 0.3, g: 0.14, vib: { rate: 22, depth: 45 } });
      k.tone({ f: 1100, f1: 1250, glide: 1.4, wave: 'glass', a: 0.02, hold: 1.25, d: 0.3, g: 0.07 });
      k.noise({ color: 'white', hp: 2500, a: 0.02, hold: 1.3, d: 0.3, g: 0.08 });
      k.noise({ color: 'pink', bp: 700, Q: 0.7, a: 0.004, d: 0.35, g: 0.25 });
    } });
    // darkness falls: reverse wind + low drone
    A.defineSfx('lucerne_inhale', { vol: 2.0, reverb: 0.55, prio: 3, play(k) {
      k.noise({ color: 'pink', bp: 300, bp1: 2400, Q: 0.9, a: 0.85, hold: 0.05, d: 0.1, g: 0.22, sweep: 0.9 });
      k.tone({ f: 73, f1: 55, glide: 0.9, type: 'sawtooth', lp: 400, a: 0.4, hold: 0.4, d: 0.4, g: 0.16 });
      k.inst('glass_pad', 'D3', 1.2, 0.4);
    } });
    // a ring of light released
    A.defineSfx('lucerne_pulse', { vol: 2.0, reverb: 0.55, prio: 3, play(k) {
      k.tone({ f: 70, f1: 40, glide: 0.5, type: 'sine', a: 0.002, d: 0.8, g: 0.42 });
      k.inst('bell', 'D3', 1.8, 0.6);
      k.inst('bell', 'A4', 1.4, 0.35, { at: 0.01 });
      k.noise({ color: 'pink', lp: 3000, lp1: 500, a: 0.003, d: 0.6, g: 0.18, sweep: 0.6 });
    } });
    // a golden pane forms / shatters
    A.defineSfx('lucerne_pane', { vol: 1.2, reverb: 0.5, prio: 1, play(k) {
      k.inst('celesta', 'A6', 0.4, 0.3);
      k.inst('celesta', 'E6', 0.4, 0.25, { at: 0.06 });
      shimmer(k, 5, 0.3, 0.02, 0, 3000, 6500);
    } });
    // the fusion: a vast swell of choir and bells
    A.defineSfx('lucerne_fuse', { vol: 2.2, reverb: 0.7, prio: 4, play(k) {
      for (const n of ['D3', 'A3', 'D4', 'F4', 'A4']) k.inst('choir_oo', n, 2.0, 0.5);
      k.inst('bell', 'D3', 3.0, 0.7, { at: 0.6 });
      k.inst('bell', 'A4', 2.5, 0.5, { at: 0.62 });
      k.tone({ f: 60, f1: 30, glide: 1.6, type: 'sine', a: 0.5, hold: 0.4, d: 1.2, g: 0.4, at: 0.2 });
      k.noise({ color: 'white', hp: 2000, a: 0.6, d: 1.0, g: 0.12 });
    } });
    // her cry (transformation start, defeat)
    A.defineSfx('lucerne_cry', { vol: 1.9, reverb: 0.6, prio: 3, play(k) {
      k.tone({ f: 660, pts: [[0.3, 880], [0.6, 520]], wave: 'glass', a: 0.05, hold: 0.6, d: 0.5, g: 0.12, vib: { rate: 6, depth: 40 } });
      k.inst('choir_oo', 'F4', 1.0, 0.5);
      k.inst('choir_oo', 'C5', 1.0, 0.35);
      k.noise({ color: 'pink', bp: 1500, Q: 1, a: 0.1, hold: 0.4, d: 0.5, g: 0.08 });
    } });
    // glass cracking (defeat, ending)
    A.defineSfx('lucerne_glass', { vol: 1.8, reverb: 0.45, prio: 3, play(k) {
      for (let i = 0; i < 14; i++) k.noise({ color: 'white', hp: 3000, a: 0.001, d: k.r(0.02, 0.06), g: k.r(0.06, 0.16), at: k.r(0, 0.55) });
      shimmer(k, 6, 0.5, 0.035, 0, 3000, 7000);
      k.tone({ f: 200, f1: 120, glide: 0.5, wave: 'glass', a: 0.01, d: 0.5, g: 0.06 });
    } });
    // the Everlantern shatters
    A.defineSfx('lucerne_shatter', { vol: 2.3, reverb: 0.75, prio: 4, play(k) {
      k.tone({ f: 70, f1: 28, glide: 1.2, type: 'sine', a: 0.002, d: 1.8, g: 0.5 });
      k.noise({ color: 'white', hp: 1200, a: 0.002, d: 1.4, g: 0.35 });
      for (let i = 0; i < 24; i++) k.noise({ color: 'white', hp: 4000, a: 0.001, d: k.r(0.03, 0.1), g: k.r(0.05, 0.14), at: k.r(0.05, 1.6) });
      for (const [n, at] of [['D5', 0], ['A5', 0.08], ['D6', 0.2], ['F6', 0.35], ['A6', 0.5]]) k.inst('bell', n, 2.4, 0.5, { at });
    } });
    // the Everlantern draws a flame in
    A.defineSfx('lucerne_pull', { vol: 2.0, reverb: 0.65, prio: 3, play(k) {
      k.tone({ f: 55, f1: 110, glide: 2.4, type: 'sawtooth', lp: 600, a: 0.8, hold: 1.2, d: 0.8, g: 0.16 });
      k.inst('glass_pad', 'A3', 2.6, 0.5);
      k.noise({ color: 'pink', bp: 2400, bp1: 500, Q: 1.2, a: 1.0, hold: 1.0, d: 0.8, g: 0.12, sweep: 2.4 });
    } });
  })();

  // ---------------------------------------------------------------------------------------------------------
  // Projectile 'lucerne_mote': drifts out, homes for ~1 s, then flies straight; the Brand pops it.
  // ---------------------------------------------------------------------------------------------------------
  class Mote extends G.Projectile {
    constructor(props) {
      super(props);
      this.homeT = props.homeT != null ? props.homeT : NUM.MOTE_HOME;
      this.top = props.top || NUM.MOTE_SPEED;
      this.spin = Math.random() * TAU;
    }
    update(dt) {
      const a = this.age;
      this.homing = a > 0.35 && a < this.homeT ? NUM.MOTE_TURN : 0;
      const sp = Math.hypot(this.vx, this.vy) || 1, want = a < 0.35 ? 110 : this.top;
      const ns = damp(sp, want, a < 0.35 ? 6 : 2.4, dt);
      this.vx *= ns / sp; this.vy *= ns / sp;
      this.spin += dt * 5;
      super.update(dt);
    }
    burstFx(why) {
      burst('flash', this.cx, this.cy, { r: 26, color: '#fff4d0', life: 0.12 });
      burst('spark', this.cx, this.cy, { count: why === 'expire' ? 4 : 8, color: '#ffe6a0', speed: 240 });
      if (why === 'hit') sfx('lucerne_release', this.cx, { vol: 0.5, pitch: 1.4 });
    }
    draw(ctx, t) {
      const tr = this.trail, x = this.cx, y = this.cy;
      for (let i = 0; i < tr.length; i += 2) { const k = i / tr.length; glow(ctx, tr[i], tr[i + 1], 6 + k * 10, '#ffd77a', 0.1 + k * 0.2); }
      const homing = this.age > 0.35 && this.age < this.homeT;
      glow(ctx, x, y, 34, homing ? '#ffe9b0' : '#ffd070', 0.75);
      ctx.save();
      ctx.translate(x, y); ctx.rotate(this.spin);
      const R = 13 + 2 * Math.sin(t * 18 + this.seed);
      ctx.fillStyle = '#ffe9a8';
      ctx.beginPath();
      for (let i = 0; i < 8; i++) { const a = i * Math.PI / 4, rr = i % 2 ? R * 0.32 : R; ctx.lineTo(Math.cos(a) * rr, Math.sin(a) * rr); }
      ctx.closePath(); ctx.fill();
      ctx.fillStyle = COL.white;
      ctx.beginPath(); ctx.arc(0, 0, 4.2, 0, TAU); ctx.fill();
      ctx.restore();
    }
  }
  G.registerProjectile('lucerne_mote', Mote, { r: 9, life: NUM.MOTE_LIFE, color: '#ffe6a0', damage: 1, gravity: 0 });

  // ---------------------------------------------------------------------------------------------------------
  // Entity 'lucerne_pane': an ephemeral golden glass platform (one-way). grow (not solid) → solid → warn → gone.
  // props: {px (centre x), py (top y), pw, life}
  // ---------------------------------------------------------------------------------------------------------
  class Pane extends G.Entity {
    constructor(props) {
      super(props);
      this.type = 'lucerne_pane';
      this.w = props.pw || NUM.PANE_W; this.h = 14;
      this.x = (props.px || 0) - this.w / 2; this.y = props.py || 0;
      this.life = props.life || NUM.PANE_LIFE;
      this.age = 0; this.solid = false; this.oneWay = true; this.noGrip = true;
      this.z = -2; this.cull = false; this.seed = Math.random() * 100;
      this.GROW = 0.6; this.WARN = 0.85;
    }
    init() { sfx('lucerne_pane', this.x + this.w / 2, { vol: 0.7 }); }
    getSolidRect() { return { x: this.x, y: this.y, w: this.w, h: this.h, owner: this, oneWay: true, noGrip: true }; }
    dismiss() { if (this.age < this.GROW + this.life) this.age = Math.max(this.age, this.GROW + this.life); }
    update(dt) {
      this.age += dt;
      this.solid = this.age >= this.GROW * 0.9;
      if (this.age >= this.GROW + this.life + this.WARN) {
        burst('shard', this.x + this.w / 2, this.y + 6, { count: 10, color: COL.glass, speed: 160 });
        sfx('lucerne_pane', this.x + this.w / 2, { vol: 0.5, pitch: 0.8 });
        this.remove();
        return;
      }
      light({ x: this.x + this.w / 2, y: this.y, r: 110, color: '#ffe2a0', intensity: 0.35 * this.vis() });
    }
    vis() {
      const a = this.age;
      if (a < this.GROW) return smooth(a / this.GROW);
      if (a > this.GROW + this.life) { const k = (a - this.GROW - this.life) / this.WARN; return (Math.floor(a * 12) % 2 ? 0.35 : 0.9) * (1 - k * 0.5); }
      return 1;
    }
    draw(ctx, t) {
      const v = this.vis(), x = this.x, y = this.y, w = this.w;
      if (v <= 0) return;
      ctx.save();
      if (this.age < this.GROW) {
        // shimmering outline while forming (not solid yet)
        ctx.globalAlpha *= 0.4 + 0.4 * Math.sin(t * 30 + this.seed) * 0.5 + 0.2;
        ctx.strokeStyle = COL.goldHi; ctx.lineWidth = 2; ctx.setLineDash([6, 5]);
        ctx.strokeRect(x + 0.5, y + 0.5, w * v, this.h);
        ctx.setLineDash([]);
        ctx.restore();
        return;
      }
      ctx.globalAlpha *= v;
      glow(ctx, x + w / 2, y + 6, w * 0.7, '#ffd890', 0.35);
      ctx.fillStyle = 'rgba(255,236,180,0.55)';
      ctx.fillRect(x, y + 2, w, this.h - 4);
      ctx.fillStyle = COL.gold; ctx.fillRect(x, y, w, 3);
      ctx.fillStyle = COL.goldShade; ctx.fillRect(x, y + this.h - 3, w, 3);
      ctx.fillStyle = 'rgba(255,255,255,0.7)';
      for (let i = 0; i < 3; i++) { const sx = x + ((t * 60 + i * w / 3 + this.seed * 7) % w); ctx.fillRect(sx, y + 4, 10, 2); }
      ctx.strokeStyle = COL.goldDeep; ctx.lineWidth = 2;
      ctx.strokeRect(x + 1, y + 1, w - 2, this.h - 2);
      ctx.restore();
    }
  }
  G.registerEntity('lucerne_pane', Pane);

  // ---------------------------------------------------------------------------------------------------------
  // Entity 'lucerne_fx': draws every Lucerne body's attack FX above the player (beams, wedges, rings, spikes).
  // ---------------------------------------------------------------------------------------------------------
  class FxLayer extends G.Entity {
    constructor(props) { super(props); this.type = 'lucerne_fx'; this.z = 6; this.cull = false; this.w = this.h = 1; }
    update() {}
    draw(ctx, t) {
      const r = this.room; if (!r) return;
      for (const b of r.entities) if (b.type === 'boss_lucerne' && !b.dead && typeof b.drawFX === 'function') b.drawFX(ctx, t);
    }
  }
  G.registerEntity('lucerne_fx', FxLayer);

  // ---------------------------------------------------------------------------------------------------------
  // Queen poses (local frame: facing +x, hem at 0, up = −y). staff = staff angle from vertical (+ forward),
  // arm = free arm (0 hanging, π/2 forward, π up), lift = staff hand raise px, reach = hand forward px.
  // ---------------------------------------------------------------------------------------------------------
  const QBASE = { kneel: 0, lift: 0, reach: 0, staff: 0.12, arm: 0.55, bow: 0.05, flare: 1, glow: 0.3, spread: 0, eyes: 0.35, white: 0 };
  const QP = (o) => Object.assign({}, QBASE, o);
  const QPOSES = {
    idle: QP({}),
    pray: QP({ kneel: 1, lift: -8, reach: -6, staff: 0.04, arm: 1.25, bow: 0.4, flare: 0.75, glow: 0.12, eyes: 0 }),
    aim: QP({ lift: 16, reach: 12, arm: -0.35, eyes: 1, glow: 0.6, spread: 0.15 }),
    raise: QP({ lift: 42, reach: 4, staff: -0.06, arm: 2.6, eyes: 1, glow: 0.6, spread: 0.3, flare: 1.4 }),
    slam: QP({ lift: -10, reach: 14, staff: 0.4, arm: 0.5, eyes: 1, glow: 0.5, spread: 0.7 }),
    cast: QP({ lift: 6, arm: 2.95, staff: 0.08, eyes: 1, glow: 0.75, flare: 1.7, spread: 0.2 }),
    gather: QP({ lift: -6, arm: 1.05, staff: -0.02, bow: 0.25, glow: 1, flare: 1.9, spread: -0.35, eyes: 1 }),
    nova: QP({ lift: 22, arm: 2.5, staff: -0.3, glow: 1, flare: 2.2, spread: 1, eyes: 1 }),
    dive: QP({ lift: 34, staff: 2.95, reach: 4, arm: 2.85, spread: -0.6, eyes: 1, glow: 0.7 }),
    land: QP({ kneel: 1, lift: -10, staff: 2.75, reach: 10, arm: 0.25, bow: 0.4, glow: 0.3, eyes: 0.2, spread: 0.6 }),
    stagger: QP({ kneel: 1, lift: -14, staff: 0.65, reach: -4, arm: 0.1, bow: 0.6, flare: 0.35, glow: 0.08, eyes: 0 }),
    reel: QP({ arm: 2.1, lift: 10, staff: -0.35, bow: -0.3, flare: 2.4, glow: 1, spread: 0.8, eyes: 1 }),
    ascend: QP({ arm: 2.7, lift: 30, staff: -0.1, bow: -0.2, flare: 2.6, glow: 1, spread: 0.4, eyes: 1 }),
    fallen: QP({ kneel: 1, lift: -16, staff: 1.2, reach: -8, arm: 0.0, bow: 0.8, flare: 0.1, glow: 0.05, eyes: 0, spread: 0.9 }),
  };
  const qpose = (o) => Object.assign({}, o);

  /** Staff geometry in world space for a queen at (x, hemY) facing f with pose P. */
  function staffGeom(x, hemY, f, P) {
    const ky = P.kneel * 34;
    const sx = 12, sy = -104 + ky;                       // front shoulder (local)
    const gx = 18 + P.reach, gy = -80 + ky - P.lift;     // grip
    const a = P.staff, dx = Math.sin(a), dy = -Math.cos(a);
    const bx = gx - dx * 118, by = gy - dy * 118;        // butt
    const tx = gx + dx * 92, ty = gy + dy * 92;          // tip
    const lx = tx, ly = ty + 13;                         // the lantern hangs under the tip
    const W = (lx_, ly_) => [x + f * lx_, hemY + ly_];
    return { shoulder: W(sx, sy), grip: W(gx, gy), butt: W(bx, by), tip: W(tx, ty), lantern: W(lx, ly) };
  }

  /** Lucerne (form 1) — also used by the room script for her waiting figure. o: {f, pz, t, seed, alpha, cloth, dim} */
  function drawQueen(ctx, x, hemY, o) {
    const C = G.Art && G.Art.char;
    const P = o.pz, f = o.f || 1, t = o.t || 0, seed = o.seed || 1;
    const ky = P.kneel * 34;
    const dim = o.dim || 0;
    ctx.save();
    if (o.alpha != null) ctx.globalAlpha *= o.alpha;
    // aura behind her
    glow(ctx, x, hemY - 80 + ky, 120 + 50 * P.glow, '#ffe2a0', (0.25 + 0.35 * P.glow) * (1 - dim));
    // the veil / train (verlet cloth anchored at the shoulders)
    if (o.cloth && C && C.cloth) C.cloth.draw(ctx, o.cloth, { width: 22, tip: 0.35, color: 'rgba(255,240,200,0.55)', shade: 'rgba(200,170,110,0.45)', outline: 'rgba(60,44,16,0.6)', lw: 2, wave: 0.6 });
    ctx.translate(x, hemY);
    ctx.scale(f, 1);
    const g = staffGeom(0, 0, 1, P);
    // staff (behind the body below the grip line when held low; drawn first, the hand covers it)
    drawStaff(ctx, g, P, t, seed, dim);
    // free (back) arm: a long bell sleeve
    const shx = -12, shy = -104 + ky;
    const aa = P.arm, hx = shx + Math.sin(aa) * 34 * 0.8 - 4, hy = shy + Math.cos(aa) * 34;
    sleeve(ctx, shx, shy, hx, hy, 1);
    // gown: a bell of gold-white wax, flaring hem with drips
    const hemW = 40 + P.kneel * 24 + P.spread * 9, waistY = -78 + ky * 0.75, waistW = 12;
    const sway = Math.sin(t * 1.7 + seed) * 3;
    const gp = new Path2D();
    gp.moveTo(-waistW, waistY);
    gp.bezierCurveTo(-waistW - 6, waistY + 30, -hemW + 6 + sway, -24, -hemW + sway, -2);
    const sc = 6;
    for (let i = 0; i <= sc; i++) {
      const k = i / sc, xx = lerp(-hemW + sway, hemW + sway, k);
      const yy = -2 + Math.sin(k * Math.PI * 3 + t * 2.4 + seed) * 3 + (i % 2 ? 4 : 0);
      gp.lineTo(xx, yy);
    }
    gp.bezierCurveTo(hemW - 6 + sway, -24, waistW + 6, waistY + 30, waistW, waistY);
    gp.closePath();
    const fill = mixHex(COL.wax, '#8a7a5a', dim * 0.5);
    if (C && C.shape) C.shape(ctx, gp, { fill, outline: COL.outline, lw: 3, light: -1, shade: 0.32, rim: '#fff4d0', box: [-hemW, waistY, hemW, 0] });
    else { ctx.fillStyle = fill; ctx.fill(gp); }
    // gold trim on the hem and a flame motif down the front
    ctx.strokeStyle = COL.gold; ctx.lineWidth = 3;
    ctx.beginPath();
    for (let i = 0; i <= sc; i++) { const k = i / sc, xx = lerp(-hemW + 4 + sway, hemW - 4 + sway, k); ctx.lineTo(xx, -9 + Math.sin(k * Math.PI * 3 + t * 2.4 + seed) * 3); }
    ctx.stroke();
    ctx.strokeStyle = COL.goldShade; ctx.lineWidth = 2;
    ctx.beginPath(); ctx.moveTo(0, waistY + 4); ctx.quadraticCurveTo(sway * 0.5 + 4, (waistY - 10) / 2, sway, -14); ctx.stroke();
    for (const [yy, s] of [[waistY + 20, 6], [waistY + 42, 8], [waistY + 64, 10]]) {
      if (yy > -12) continue;
      ctx.fillStyle = COL.gold;
      ctx.beginPath(); ctx.moveTo(sway * 0.4, yy - s); ctx.quadraticCurveTo(sway * 0.4 + s * 0.6, yy, sway * 0.4, yy + s * 0.4); ctx.quadraticCurveTo(sway * 0.4 - s * 0.6, yy, sway * 0.4, yy - s); ctx.fill();
    }
    // wax drips on the hem
    if (C && C.drip) for (let i = 0; i < 4; i++) C.drip(ctx, lerp(-hemW * 0.7, hemW * 0.7, i / 3) + sway, -4, 6 + ((i * 7 + seed) % 5) * 2 + Math.sin(t + i) * 1.5, { color: COL.waxShade });
    // bodice
    const bp = new Path2D();
    bp.moveTo(-waistW + 1, waistY + 2);
    bp.lineTo(-16, -104 + ky); bp.quadraticCurveTo(0, -110 + ky, 16, -104 + ky);
    bp.lineTo(waistW - 1, waistY + 2); bp.closePath();
    if (C && C.shape) C.shape(ctx, bp, { fill: mixHex(COL.gold, '#7a6a4a', dim * 0.5), outline: COL.outline, lw: 3, light: -1, shade: 0.3, box: [-16, -110 + ky, 16, waistY] });
    // the halo collar: gold spokes fanning behind the head
    const nx = 0, ny = -110 + ky + P.bow * 3;
    ctx.save();
    ctx.translate(nx, ny);
    for (let i = 0; i < 11; i++) {
      const a = Math.PI + 0.2 + i * (Math.PI - 0.4) / 10;
      const len = 30 + (i % 2 ? 6 : 12) + 2 * Math.sin(t * 2 + i);
      ctx.strokeStyle = i % 2 ? COL.goldShade : COL.gold; ctx.lineWidth = i % 2 ? 2 : 3;
      ctx.beginPath(); ctx.moveTo(Math.cos(a) * 10, Math.sin(a) * 8); ctx.lineTo(Math.cos(a) * len, Math.sin(a) * len * 0.9); ctx.stroke();
    }
    ctx.strokeStyle = COL.gold; ctx.lineWidth = 2;
    ctx.beginPath(); ctx.ellipse(0, -2, 36, 32, 0, Math.PI + 0.15, TAU - 0.15); ctx.stroke();
    ctx.restore();
    // head: a smooth tapered candle of white wax
    const hx0 = 2 + P.bow * 6, hy0 = -126 + ky + P.bow * 6;
    ctx.save();
    ctx.translate(hx0, hy0); ctx.rotate(P.bow * 0.35);
    const hp = new Path2D();
    hp.moveTo(-10, 12); hp.bezierCurveTo(-13, 2, -12, -12, -9, -17); hp.lineTo(9, -17); hp.bezierCurveTo(12, -12, 13, 2, 10, 12);
    hp.quadraticCurveTo(0, 16, -10, 12); hp.closePath();
    if (C && C.shape) C.shape(ctx, hp, { fill: mixHex(COL.white, '#9a8a6a', dim * 0.5), outline: COL.outline, lw: 2.5, light: -1, shade: 0.25, box: [-12, -17, 12, 14] });
    // face: serene eyes that open and burn white
    const eo = P.eyes;
    if (eo > 0.5) {
      glow(ctx, 4, -2, 16, '#fff6d0', 0.6 * eo);
      ctx.fillStyle = COL.white;
      for (const ex of [-1, 7]) { ctx.beginPath(); ctx.ellipse(ex, -2, 3.2, 1.6 + eo, 0, 0, TAU); ctx.fill(); }
    } else {
      ctx.strokeStyle = COL.waxDeep; ctx.lineWidth = 1.6;
      for (const ex of [-1, 7]) { ctx.beginPath(); ctx.arc(ex, -3, 3, 0.25, Math.PI - 0.25); ctx.stroke(); }
    }
    ctx.strokeStyle = COL.waxDeep; ctx.lineWidth = 1.4;
    ctx.beginPath(); ctx.moveTo(1, 7); ctx.quadraticCurveTo(3.5, 8 + (eo > 0.8 ? 1.5 : 0), 6, 7); ctx.stroke();
    // a tear of wax
    ctx.fillStyle = COL.waxShade; ctx.beginPath(); ctx.ellipse(-2, 4 + ((t * 3) % 6), 1.1, 2, 0, 0, TAU); ctx.fill();
    // crown of ever-burning candles
    ctx.fillStyle = COL.gold; ctx.fillRect(-11, -20, 22, 5);
    ctx.strokeStyle = COL.outline; ctx.lineWidth = 1.5; ctx.strokeRect(-11, -20, 22, 5);
    const cand = [[-9, 9], [-4.5, 13], [0, 17], [4.5, 13], [9, 9]];
    for (let i = 0; i < cand.length; i++) {
      const [cx, ch] = cand[i];
      ctx.fillStyle = COL.wax; ctx.fillRect(cx - 1.8, -20 - ch, 3.6, ch);
      ctx.strokeStyle = COL.outline; ctx.lineWidth = 1; ctx.strokeRect(cx - 1.8, -20 - ch, 3.6, ch);
      flame(ctx, cx, -21 - ch, (9 + ch * 0.35) * P.flare * (1 - dim * 0.6), dim > 0.5 ? 'pale' : 'gold', t, seed + i * 3.7, { glow: 0.8 });
    }
    ctx.restore();
    // front arm (to the staff grip) and hand
    sleeve(ctx, g.shoulder[0], g.shoulder[1], g.grip[0], g.grip[1], 0.9);
    ctx.fillStyle = COL.white; ctx.strokeStyle = COL.outline; ctx.lineWidth = 2;
    ctx.beginPath(); ctx.arc(g.grip[0], g.grip[1], 5, 0, TAU); ctx.fill(); ctx.stroke();
    ctx.beginPath(); ctx.arc(hx, hy, 4.5, 0, TAU); ctx.fill(); ctx.stroke();
    if (P.white > 0) {
      // fusion: she dissolves into white light
      ctx.globalAlpha *= P.white;
      ctx.globalCompositeOperation = 'lighter';
      glow(ctx, 0, -80 + ky, 110, '#ffffff', 0.9);
      ctx.globalCompositeOperation = 'source-over';
    }
    ctx.restore();
  }
  function sleeve(ctx, x0, y0, x1, y1, wide) {
    const dx = x1 - x0, dy = y1 - y0, L = Math.hypot(dx, dy) || 1, nx = -dy / L, ny = dx / L;
    const w0 = 6, w1 = 9 * wide;
    ctx.beginPath();
    ctx.moveTo(x0 + nx * w0, y0 + ny * w0);
    ctx.quadraticCurveTo(x0 + dx * 0.5 + nx * (w0 + 3), y0 + dy * 0.5 + ny * (w0 + 3), x1 + nx * w1, y1 + ny * w1);
    ctx.lineTo(x1 - nx * w1, y1 - ny * w1);
    ctx.quadraticCurveTo(x0 + dx * 0.5 - nx * w0, y0 + dy * 0.5 - ny * w0, x0 - nx * w0, y0 - ny * w0);
    ctx.closePath();
    ctx.fillStyle = COL.wax; ctx.fill();
    ctx.strokeStyle = COL.outline; ctx.lineWidth = 2.5; ctx.stroke();
    ctx.strokeStyle = COL.gold; ctx.lineWidth = 2;
    ctx.beginPath(); ctx.moveTo(x1 + nx * w1, y1 + ny * w1); ctx.lineTo(x1 - nx * w1, y1 - ny * w1); ctx.stroke();
  }
  function drawStaff(ctx, g, P, t, seed, dim) {
    const [bx, by] = g.butt, [tx, ty] = g.tip, [lx, ly] = g.lantern;
    ctx.lineCap = 'round';
    ctx.strokeStyle = COL.outline; ctx.lineWidth = 7;
    ctx.beginPath(); ctx.moveTo(bx, by); ctx.lineTo(tx, ty); ctx.stroke();
    ctx.strokeStyle = COL.gold; ctx.lineWidth = 4;
    ctx.beginPath(); ctx.moveTo(bx, by); ctx.lineTo(tx, ty); ctx.stroke();
    ctx.strokeStyle = COL.goldHi; ctx.lineWidth = 1.2;
    ctx.beginPath(); ctx.moveTo(lerp(bx, tx, 0.1) - 1, lerp(by, ty, 0.1)); ctx.lineTo(lerp(bx, tx, 0.9) - 1, lerp(by, ty, 0.9)); ctx.stroke();
    // rings on the shaft
    ctx.fillStyle = COL.goldShade;
    for (const k of [0.2, 0.62, 0.95]) { ctx.beginPath(); ctx.arc(lerp(bx, tx, k), lerp(by, ty, k), 3.6, 0, TAU); ctx.fill(); }
    // crescent finial
    const a = Math.atan2(ty - by, tx - bx);
    ctx.save(); ctx.translate(tx, ty); ctx.rotate(a + Math.PI / 2);
    ctx.strokeStyle = COL.gold; ctx.lineWidth = 3;
    ctx.beginPath(); ctx.arc(0, -8, 10, 0.25, Math.PI - 0.25, true); ctx.stroke();
    ctx.restore();
    // the lantern: a little cage with the white flame
    const sw = Math.sin(t * 2.2 + seed) * 2;
    ctx.strokeStyle = COL.goldShade; ctx.lineWidth = 1.5;
    ctx.beginPath(); ctx.moveTo(tx, ty); ctx.lineTo(lx + sw, ly - 9); ctx.stroke();
    glow(ctx, lx + sw, ly, 44, '#fff3c8', 0.75 * (1 - dim * 0.7));
    ctx.fillStyle = 'rgba(255,244,210,0.55)';
    ctx.beginPath(); ctx.ellipse(lx + sw, ly, 8, 10, 0, 0, TAU); ctx.fill();
    flame(ctx, lx + sw, ly + 6, 13 * (1 - dim * 0.5), 'white', t, seed + 11, { glow: 0.6 });
    ctx.strokeStyle = COL.gold; ctx.lineWidth = 1.6;
    ctx.beginPath(); ctx.ellipse(lx + sw, ly, 8, 10, 0, 0, TAU); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(lx + sw, ly - 10); ctx.lineTo(lx + sw, ly + 10); ctx.stroke();
    ctx.fillStyle = COL.gold; ctx.fillRect(lx + sw - 6, ly - 12, 12, 3); ctx.fillRect(lx + sw - 5, ly + 9, 10, 3);
  }
  function mixHex(a, b, k) {
    if (G.U && G.U.mix) return G.U.mix(a, b, k);
    return k > 0.5 ? b : a;
  }

  /** The Everlantern's heart (form 2), centred at (x, y). o: {t, seed, eyes, mouth, flare, dim, crack, rot, blue} */
  function drawLantern(ctx, x, y, o) {
    const C = G.Art && G.Art.char;
    const t = o.t || 0, seed = o.seed || 1, rx = 78, ry = 92;
    const dim = o.dim || 0, flare = o.flare || 0, crack = o.crack || 0;
    const rot = o.rot || 0;
    ctx.save();
    ctx.translate(x, y);
    // back bars (dim, behind the glass)
    const bars = 8;
    const barX = (phi, yy) => { const k = Math.sqrt(Math.max(0, 1 - (yy * yy) / (ry * ry * 1.04))); return Math.sin(phi) * rx * 1.04 * k; };
    const drawBar = (phi, front) => {
      ctx.beginPath();
      for (let i = 0; i <= 10; i++) { const yy = lerp(-ry * 0.96, ry * 0.96, i / 10); const xx = barX(phi, yy); if (i) ctx.lineTo(xx, yy); else ctx.moveTo(xx, yy); }
      ctx.strokeStyle = front ? COL.outline : 'rgba(40,28,10,0.6)'; ctx.lineWidth = front ? 7 : 4; ctx.stroke();
      ctx.strokeStyle = front ? COL.gold : COL.goldDeep; ctx.lineWidth = front ? 4 : 2.5; ctx.stroke();
      if (front) { ctx.strokeStyle = 'rgba(255,250,230,0.7)'; ctx.lineWidth = 1.2; ctx.stroke(); }
    };
    for (let i = 0; i < bars; i++) { const phi = rot + i * TAU / bars; if (Math.cos(phi) < 0) drawBar(phi, false); }
    // the glass globe and the blinding core
    const coreA = (1 - dim * 0.8);
    ctx.fillStyle = o.blue ? 'rgba(170,215,255,0.28)' : 'rgba(255,236,190,0.30)';
    ctx.beginPath(); ctx.ellipse(0, 0, rx, ry, 0, 0, TAU); ctx.fill();
    glow(ctx, 0, 6, 120 + 40 * flare, o.blue ? '#bfe6ff' : '#fff2c8', 0.85 * coreA);
    glow(ctx, 0, 10, 54 + 20 * flare, '#ffffff', 0.9 * coreA);
    flame(ctx, 0, 46, (64 + 26 * flare) * (1 - dim * 0.55), o.blue ? 'blue' : 'white', t, seed, { glow: 0.5 });
    // her face in the glass
    const eyes = o.eyes || 0, mouth = o.mouth || 0;
    ctx.save();
    ctx.globalAlpha *= 0.62 * (1 - dim * 0.4) * (o.blue ? 0.3 : 1);
    const fy = -18;
    ctx.fillStyle = COL.face;
    ctx.beginPath(); ctx.ellipse(0, fy, 27, 36, 0, 0, TAU); ctx.fill();
    ctx.strokeStyle = 'rgba(120,90,40,0.8)'; ctx.lineWidth = 1.6; ctx.stroke();
    if (eyes > 0.4) {
      ctx.fillStyle = COL.white;
      for (const ex of [-10, 10]) { ctx.beginPath(); ctx.ellipse(ex, fy - 6, 6, 1.5 + eyes * 2.6, ex < 0 ? 0.12 : -0.12, 0, TAU); ctx.fill(); }
      glow(ctx, 0, fy - 6, 40, '#ffffff', 0.5 * eyes);
    } else {
      ctx.strokeStyle = 'rgba(110,80,36,0.9)'; ctx.lineWidth = 2;
      for (const ex of [-10, 10]) { ctx.beginPath(); ctx.arc(ex, fy - 8, 6, 0.3, Math.PI - 0.3); ctx.stroke(); }
    }
    ctx.fillStyle = 'rgba(90,60,24,0.85)';
    ctx.beginPath(); ctx.ellipse(0, fy + 15, 6 + mouth * 4, 1.5 + mouth * 8, 0, 0, TAU); ctx.fill();
    ctx.restore();
    // glass highlight
    ctx.strokeStyle = 'rgba(255,255,255,0.55)'; ctx.lineWidth = 4;
    ctx.beginPath(); ctx.ellipse(-8, -8, rx - 18, ry - 18, 0, Math.PI * 1.05, Math.PI * 1.38); ctx.stroke();
    // cracks
    if (crack > 0) {
      ctx.save();
      ctx.strokeStyle = 'rgba(255,255,255,' + (0.5 + 0.5 * crack).toFixed(2) + ')'; ctx.lineWidth = 2;
      const n = Math.ceil(crack * 7);
      for (let i = 0; i < n; i++) {
        let a = seed * 3 + i * 2.39, px = Math.cos(a) * 18, py = Math.sin(a) * 22;
        ctx.beginPath(); ctx.moveTo(px, py);
        for (let j = 0; j < 4; j++) { a += Math.sin(i * 7 + j * 3) * 0.6; px += Math.cos(a) * 18; py += Math.sin(a) * 18; ctx.lineTo(clamp(px, -rx + 6, rx - 6), clamp(py, -ry + 6, ry - 6)); }
        ctx.stroke();
      }
      glow(ctx, 0, 0, 90, '#ffffff', 0.4 * crack);
      ctx.restore();
    }
    // front bars
    for (let i = 0; i < bars; i++) { const phi = rot + i * TAU / bars; if (Math.cos(phi) >= 0) drawBar(phi, true); }
    // rings: equator band and outline
    ctx.strokeStyle = COL.outline; ctx.lineWidth = 6;
    ctx.beginPath(); ctx.ellipse(0, 0, rx, ry, 0, 0, TAU); ctx.stroke();
    ctx.strokeStyle = COL.gold; ctx.lineWidth = 3; ctx.stroke();
    ctx.strokeStyle = COL.goldShade; ctx.lineWidth = 5;
    ctx.beginPath(); ctx.ellipse(0, 10, rx + 2, 9, 0, 0, Math.PI); ctx.stroke();
    // cap: a golden dome with her crown of candles
    const capY = -ry + 4;
    const cap = new Path2D();
    cap.moveTo(-rx * 0.7, capY); cap.bezierCurveTo(-rx * 0.66, capY - 40, -16, capY - 52, 0, capY - 56);
    cap.bezierCurveTo(16, capY - 52, rx * 0.66, capY - 40, rx * 0.7, capY); cap.closePath();
    if (C && C.shape) C.shape(ctx, cap, { fill: COL.gold, outline: COL.outline, lw: 3, light: -1, shade: 0.35, rim: COL.goldHi, box: [-rx * 0.7, capY - 56, rx * 0.7, capY] });
    else { ctx.fillStyle = COL.gold; ctx.fill(cap); }
    ctx.fillStyle = COL.goldShade; ctx.fillRect(-rx * 0.72, capY - 4, rx * 1.44, 8);
    ctx.strokeStyle = COL.outline; ctx.lineWidth = 2; ctx.strokeRect(-rx * 0.72, capY - 4, rx * 1.44, 8);
    // ring on top (the chain attaches here)
    ctx.strokeStyle = COL.gold; ctx.lineWidth = 4;
    ctx.beginPath(); ctx.arc(0, capY - 64, 8, 0, TAU); ctx.stroke();
    const cands = [-44, -29, -14, 0, 14, 29, 44];
    for (let i = 0; i < cands.length; i++) {
      const cx = cands[i], h = 12 + (3 - Math.abs(i - 3)) * 5;
      const by = capY - 4 - Math.sqrt(Math.max(0, 1 - (cx * cx) / (rx * rx * 0.5))) * 40 * 0.6;
      ctx.fillStyle = COL.wax; ctx.fillRect(cx - 2.5, by - h, 5, h);
      ctx.strokeStyle = COL.outline; ctx.lineWidth = 1.2; ctx.strokeRect(cx - 2.5, by - h, 5, h);
      flame(ctx, cx, by - h - 1, (12 + h * 0.3) * (1 + flare * 0.5) * (1 - dim * 0.6), o.blue ? 'blue' : 'gold', t, seed + i * 2.1, { glow: 0.7 });
    }
    // base and finial
    const baseY = ry - 6;
    ctx.fillStyle = COL.goldShade;
    ctx.beginPath(); ctx.moveTo(-rx * 0.55, baseY); ctx.quadraticCurveTo(0, baseY + 26, rx * 0.55, baseY); ctx.closePath(); ctx.fill();
    ctx.strokeStyle = COL.outline; ctx.lineWidth = 3; ctx.stroke();
    const fin = new Path2D();
    fin.moveTo(-12, baseY + 12); fin.lineTo(0, baseY + 56 + 4 * Math.sin(t * 3)); fin.lineTo(12, baseY + 12); fin.closePath();
    ctx.fillStyle = COL.gold; ctx.fill(fin); ctx.strokeStyle = COL.outline; ctx.lineWidth = 2.5; ctx.stroke(fin);
    if (C && C.drip) for (let i = 0; i < 3; i++) C.drip(ctx, -30 + i * 30, baseY + 6, 8 + ((t * 9 + i * 4) % 10), { color: COL.goldShade });
    ctx.restore();
  }

  const LPOSE = { eyes: 0.3, mouth: 0.1, flare: 0.3, dim: 0, crack: 0 };

  // ---------------------------------------------------------------------------------------------------------
  // The boss (both forms)
  // ---------------------------------------------------------------------------------------------------------
  const PHASES = [NUM.SPLIT, NUM.P3];
  class Lucerne extends G.Boss {
    constructor(props) {
      const form = props && props.form === 2 ? 2 : 1;
      const cfg = form === 1 ? {
        hp: NUM.HP, w: NUM.Q_W, h: NUM.Q_H, physics: 'manual', gravity: 0,
        contactDamage: 1, contactInset: 10, noSpawnShift: true,
        phases: PHASES,
        stagger: { damage: 210, time: 2.1 },
        rest: [0.5, 0.95], phaseRest: [1, 0.85, 0.72],
        introTime: 0.5, defeatStyle: 'custom', slowmo: 1.1, stinger: false,
        hitSound: 'boss_hit', z: -1,
        colors: { body: COL.wax, dark: COL.goldShade, hit: COL.goldHi, puddle: '#d8c08a', smoke: '#8a7a5a', tele: COL.tele },
        attacks: {
          beam: { weight: function (d) { return d > 240 ? 3 : 1.4; }, cooldown: 1.8 },
          motes: { weight: 2, cooldown: 5 },
          spikes: { weight: 2.3, cooldown: 3.2 },
          nova: { weight: 7, cooldown: 2.6, when: function () { return this.playerNear(175); } },
          dive: { weight: function (d) { return d > 180 ? 2.4 : 1.2; }, cooldown: 3.8 },
          ascend: { phase: 99, weight: 0, uninterruptible: true },
        },
      } : {
        hp: NUM.HP, w: NUM.L_W, h: NUM.L_H, physics: 'manual', gravity: 0,
        contactDamage: 1, contactInset: 14, noSpawnShift: true,
        phases: PHASES,
        stagger: { damage: 230, time: 2.6 },
        rest: [0.8, 1.25], phaseRest: [1, 1, 0.72],   // baseline QA: was [0.6, 1.05] (more punish windows)
        introTime: 1.5, defeatStyle: 'custom', slowmo: 1.3, stinger: false,
        hitSound: 'boss_hit', z: -4,
        colors: { body: COL.gold, dark: COL.goldShade, hit: COL.goldHi, puddle: '#d8c08a', smoke: '#8a7a5a', tele: COL.tele },
        attacks: {
          sweep: { weight: 3.2, cooldown: 6 },
          pulse: { weight: 1.7, cooldown: 11 },   // baseline QA: was 2.4 / 8 (the heart cannot be struck during a pulse; ~27 % of form 2)
          motes: { weight: 1.8, cooldown: 5 },
          spikes: { weight: 2, cooldown: 3.8 },
          beam: { weight: 2.4, cooldown: 2.8 },
        },
      };
      super(props, cfg);
      this.form = form;
      this.seed = 1 + Math.floor(Math.random() * 97);
      this.hz = [];            // live area hazards: spikes, rings
      this.beams = [];         // beams drawn this frame (rebuilt by the attack each step)
      this.wedge = null;       // sweep telegraph
      this.lanes = [];         // pulse: gaps shown ahead of each ring
      this.nova = null;        // nova telegraph/burst
      this.column = null;      // dive telegraph column
      this.motesGather = 0;
      this.alpha = 1;
      this.camBX = props.camBX || 0; this.camBY = props.camBY || 0;
      this.darkWant = null;
      if (form === 1) {
        this.pz = qpose(QPOSES.pray); this.pt = qpose(QPOSES.pray); this.poseRate = 6;
        this.facing = -1;
      } else {
        this.lp = Object.assign({}, LPOSE); this.lt = Object.assign({}, LPOSE);
        this.rot = 0;
        this.phase = 2;
        this.maxHp = NUM.HP;
        this.hp = clamp(props.startHp != null ? +props.startHp : Math.round(NUM.HP * NUM.SPLIT), 1, NUM.HP);
      }
      this.introT = 0;
      this._woke = form === 2;
    }

    init() {
      super.init();
      const room = this.room;
      this.A = arenaGeom(room, this.cx);
      if (room._lucBaseDark == null) room._lucBaseDark = typeof room.dark === 'number' ? room.dark : 0.3;
      if (!room.find((e) => e.type === 'lucerne_fx' && !e.dead)) room.spawn({ type: 'lucerne_fx', x: 0, y: 0 });
      const A = this.A;
      if (this.form === 1) {
        this.x = clamp(this.cx, A.west + 60, A.east - 60) - this.w / 2;
        this.y = A.floorY - NUM.HOVER - this.h;
        this.facing = playerOf() && playerOf().x < this.cx ? -1 : (this.props.facing === 'right' ? 1 : -1);
        if (G.Art && G.Art.char && G.Art.char.cloth) this.cloth = G.Art.char.cloth.create(6, 13);
        if (this.arena && G.game && G.game.lockPlayer) { G.game.lockPlayer('lucerne_intro'); this._locked = true; }
      } else {
        // form 2 continues the fight at once (spawned by the fusion)
        this.fightStarted = true;
        this._introStart = 0;
        this.setState('intro');
        this.lockFuse();
        if (G.Audio && typeof G.Audio.musicLayer === 'function') { try { G.Audio.musicLayer(1); } catch (err) { G.reportError(err, 'lucerne musicLayer'); } }
        this.paneT = 3.5; this.paneSet = 0;
      }
      this.home = { x: this.cx, y: this.cy };
    }

    // ---------------------------------------------------------------- helpers
    get feetY() { return this.y + this.h; }
    playerNear(r) { const p = this.player; if (!p || !this.targetable(p)) return false; return Math.hypot(p.x + p.w / 2 - this.cx, p.y + p.h / 2 - this.cy) < r; }
    pc() { const p = this.player; return p ? { x: p.x + p.w / 2, y: p.y + p.h / 2, feet: p.y + p.h, p } : { x: this.A.mid, y: this.A.floorY - 30, feet: this.A.floorY, p: null }; }
    /** form 2 relocates fast before the sweep/pulse: harmless by touch meanwhile and until apart from the player */
    relocating(on) { if (on) this.contactDamage = 0; else { this.contactDamage = 1; this._sepNoTouch = true; } }
    late() { return this.form === 1 ? this.hp <= this.maxHp * NUM.LATE1 : this.phase >= 3; }
    want(name, rate) { if (this.form === 1) { this.pt = QPOSES[name] || QPOSES.idle; if (rate) this.poseRate = rate; } }
    lwant(o, rate) { Object.assign(this.lt, LPOSE, o); this.poseRate = rate || 5; }
    sub(name) { const sd = this.stateData; sd.ph = name; sd.t = 0; }
    finish(rest) { this.beams.length = 0; this.wedge = null; this.nova = null; this.column = null; this.motesGather = 0; this.alpha = 1; this.hurtable = true; this.contactDamage = 1; this.endAttack(rest); }
    /** glide toward a point (critically damped, clamped speed), staying inside the hall */
    glide(tx, ty, dt, maxV, k) {
      const A = this.A;
      const dx = tx - this.cx, dy = ty - this.cy;
      let vx = dx * (k || 4), vy = dy * (k || 4);
      const s = Math.hypot(vx, vy), m = maxV || 320;
      if (s > m) { vx *= m / s; vy *= m / s; }
      this.vx = damp(this.vx, vx, 9, dt); this.vy = damp(this.vy, vy, 9, dt);
      this.x += this.vx * dt; this.y += this.vy * dt;
      this.clampHall();
      return Math.hypot(tx - this.cx, ty - this.cy);
    }
    clampHall() {
      const A = this.A;
      const mx = this.form === 1 ? 20 : 70;
      this.x = clamp(this.x, A.west + mx, A.east - mx - this.w);
      const top = A.ceilY + (this.form === 1 ? 70 : 90);
      this.y = clamp(this.y, top, A.floorY - this.h - (this.form === 1 ? 0 : 6));
    }
    lanternPos() { const g = staffGeom(this.cx, this.feetY, this.facing, this.pz); return { x: g.lantern[0], y: g.lantern[1] }; }
    crownPos() { const ky = this.pz.kneel * 34; return { x: this.cx + this.facing * 3, y: this.feetY - 160 + ky }; }
    origin() { return this.form === 1 ? this.lanternPos() : { x: this.cx, y: this.cy }; }
    eye() { return this.form === 1 ? { x: this.cx + this.facing * 3, y: this.feetY - 128 + this.pz.kneel * 34 } : { x: this.cx, y: this.cy - 18 }; }
    hurtRect() { return (this.dying || !this.hurtable || this.alpha < 0.5) ? null : this; }
    contactRect() {
      if (this.dying || this.alpha < 0.6 || !this.contactDamage) return null;
      return super.contactRect();
    }
    modifyDamage(dmg) {
      if (this.form === 1 && !this.dying) {
        const room = this.hp - Math.round(this.maxHp * NUM.SPLIT);
        if (room <= 0) return 0;
        return Math.min(dmg, room);
      }
      return dmg;
    }
    hurtSrc(kind, x, y) { return { type: 'lucerne_hazard', kind, cx: x, cy: y, x: x - 1, y: y - 1, w: 2, h: 2, owner: this }; }
    hurt(kind, dmg, x, y) {
      if (!G.Combat || !G.Combat.hurtPlayer) return false;
      if (G.game && G.game.noteThreat) G.game.noteThreat();
      return G.Combat.hurtPlayer(dmg, this.hurtSrc(kind, x, y));
    }

    // ---------------------------------------------------------------- camera: keep her in frame
    updateCam(dt, focus) {
      const cam = G.camera, p = playerOf();
      if (!cam || !p || !this.room || p.room !== this.room || !this.A) return;
      const pcx = p.x + p.w / 2, pcy = p.y + p.h / 2;
      const by = this.form === 1 ? this.y + 40 : this.cy;
      let wx, wy, rate = 2.4;
      if (focus === 'reveal') {
        // cinematic: look up at the Everlantern (the cage and its heart) — the player is locked meanwhile
        wx = clamp((this.A.mid - pcx) * 0.9, -900, 900); wy = clamp(this.A.heartY + 100 - pcy, -1200, 0); rate = 2.6;
      } else if (focus) { wx = clamp((this.cx - pcx) * 0.8, -560, 560); wy = clamp((by - pcy) * 0.6, -260, 120); }
      else { wx = clamp((this.cx - pcx) * 0.45, -380, 380); wy = clamp((by - pcy) * 0.5, this.form === 2 ? -270 : -240, 100); }
      this.camBX = damp(this.camBX, wx, rate, dt);
      this.camBY = damp(this.camBY, wy, rate, dt);
      if (!this._cam) {
        const self = this;
        const pl = () => playerOf();
        this._cam = {
          isLucerneCam: true,
          get x() { const q = pl(); return q ? q.x + (self.camBX || 0) : 0; },
          get y() { const q = pl(); return q ? q.y + (self.camBY || 0) : 0; },
          get w() { const q = pl(); return q ? q.w : 26; },
          get h() { const q = pl(); return q ? q.h : 54; },
          get motor() { return null; },
          get facing() { const q = pl(); return q ? q.facing : 1; },
          get vx() { const q = pl(); return q && q.motor ? q.motor.vx : 0; },
          get vy() { const q = pl(); return q && q.motor ? q.motor.vy : 0; },
          get room() { const q = pl(); return q ? q.room : null; },
        };
      }
      if (cam.target === p || (cam.target && cam.target.isLucerneCam && cam.target !== this._cam)) cam.follow(this._cam);
    }
    releaseCam() { if (this._cam && G.camera && G.camera.target === this._cam) G.camera.follow(playerOf()); }
    unlock() { if (this._locked) { this._locked = false; if (G.game && G.game.unlockPlayer) G.game.unlockPlayer('lucerne_intro'); } this.unlockFuse(); }
    unlockFuse() { if (this._lockedF) { this._lockedF = false; if (G.game && G.game.unlockPlayer) G.game.unlockPlayer('lucerne_fuse'); } }
    lockFuse() { if (!this._lockedF && this.arena && G.game && G.game.lockPlayer) { this._lockedF = true; G.game.lockPlayer('lucerne_fuse'); } }
    restoreDark() { const r = this.room; if (r && r._lucBaseDark != null) r.dark = r._lucBaseDark; }
    remove() {
      if (!this._handover) { this.releaseCam(); this.restoreDark(); }
      this.unlock();
      this.dismissPanes();
      super.remove();
    }
    onRoomExit() {
      this.releaseCam(); this.unlock(); this.restoreDark();
      if (this._endLocked && G.game && G.game.unlockPlayer) { this._endLocked = false; G.game.unlockPlayer('lucerne_end'); }
      if (this.form === 2 && G.Audio && typeof G.Audio.musicLayer === 'function') { try { G.Audio.musicLayer(0); } catch (err) { void err; } }
      if (super.onRoomExit) super.onRoomExit();
    }

    // ---------------------------------------------------------------- per-step
    /** while one of her cinematics holds the player still, nothing may hurt them (e.g. their own Gutterwisp left in
     *  the hall by an earlier attempt keeps lunging at a locked player) */
    shieldLocked() {
      if (!(this._locked || this._lockedF || this._endLocked)) return;
      const p = playerOf();
      if (p && p.room === this.room) p.invuln = Math.max(p.invuln || 0, 0.12);
    }
    think(dt) {
      this.shieldLocked();
      this.tickPose(dt);
      this.tickHazards(dt);
      this.tickDark(dt);
      if (this.form === 2) this.tickPanes(dt);
      if (this._sepNoTouch && !this.dying) {
        // after a form-2 stagger the heart rises out of whoever stands in it: harmless until they are apart
        const p = this.player;
        if (p && overlap(this, p)) this.contactDamage = 0;
        else if (this.state !== 'intro') { this._sepNoTouch = false; if (this.state !== 'stagger') this.contactDamage = 1; }
      }
      this.lights();
      if (this.form === 1 && this.cloth && G.Art.char.cloth) {
        const g = this.feetY - 104 + this.pz.kneel * 34;
        G.Art.char.cloth.update(this.cloth, this.cx - this.facing * 10, g, dt, { gravity: 300, wind: -this.vx * 2.2 - this.facing * 60, damping: 0.9, lift: 0.2 });
      }
      super.think(dt);
    }
    tickPose(dt) {
      const k = 1 - Math.exp(-(this.poseRate || 6) * dt);
      if (this.form === 1) { for (const key in this.pt) this.pz[key] += (this.pt[key] - this.pz[key]) * k; }
      else { for (const key in this.lt) this.lp[key] += (this.lt[key] - this.lp[key]) * k; this.rot += dt * (0.25 + 0.6 * this.lp.flare); }
    }
    tickDark(dt) {
      const r = this.room; if (!r || r._lucBaseDark == null) return;
      const want = this.darkWant != null ? this.darkWant : r._lucBaseDark;
      r.dark = damp(r.dark, want, this.darkWant != null ? 3.2 : 1.8, dt);
    }
    lights() {
      if (!G.lighting) return;
      if (this.form === 1) {
        const c = this.crownPos(), l = this.lanternPos();
        light({ x: c.x, y: c.y + 10, r: 170 + 120 * this.pz.glow, color: '#ffe2a0', intensity: (0.45 + 0.35 * this.pz.glow) * this.alpha });
        light({ x: l.x, y: l.y, r: 150, color: '#fff3c8', intensity: 0.5 * this.alpha });
        light({ x: this.cx, y: this.feetY - 50, r: 200, color: '#ffd890', intensity: 0.25 * this.alpha });
      } else {
        const d = this.lp.dim;
        light({ x: this.cx, y: this.cy, r: 420 + 160 * this.lp.flare, color: '#fff2c8', intensity: 0.85 * (1 - d * 0.6) });
      }
    }

    // ---------------------------------------------------------------- hazards (spikes, rings) live past their attack
    tickHazards(dt) {
      const p = this.player, hz = this.hz;
      for (let i = hz.length - 1; i >= 0; i--) {
        const h = hz[i];
        h.t += dt;
        if (h.kind === 'spike') {
          const on = h.t >= h.warn && h.t < h.warn + NUM.SPIKE_RISE + NUM.SPIKE_HOLD;
          if (h.t >= h.warn && !h.erupted) {
            h.erupted = true;
            sfx('lucerne_spike', h.x, { vol: 0.8 });
            burst('shard', h.x, h.y - 10, { count: 9, color: COL.crystal, speed: 300 });
            burst('flash', h.x, h.y - 30, { r: 60, color: '#fff4d0', life: 0.12 });
            if (G.game && h.big) G.game.shake(4, 0.15);
          }
          if (on && p && this.targetable(p)) {
            const k = clamp((h.t - h.warn) / NUM.SPIKE_RISE, 0, 1);
            const r = { x: h.x - NUM.SPIKE_W / 2 + 8, y: h.y - NUM.SPIKE_H * k, w: NUM.SPIKE_W - 16, h: NUM.SPIKE_H * k };
            if (r.h > 6 && overlap(r, p)) this.hurt('spike', 1, h.x, h.y - 40);
          }
          if (on) light({ x: h.x, y: h.y - 50, r: 110, color: '#fff0c0', intensity: 0.5 });
          if (h.t > h.warn + NUM.SPIKE_RISE + NUM.SPIKE_HOLD + 0.3) hz.splice(i, 1);
        } else if (h.kind === 'ring') {
          if (h.t < 0) continue;
          h.r = 50 + h.t * NUM.RING_SPEED;
          if (p && this.targetable(p) && !h.hitDone) {
            const pcx = p.x + p.w / 2;
            for (const py of [p.y + 10, p.y + p.h / 2, p.y + p.h - 10]) {
              const d = Math.hypot(pcx - h.x, py - h.y);
              if (Math.abs(d - h.r) < NUM.RING_BAND / 2 + 10) {
                const a = Math.atan2(py - h.y, pcx - h.x);
                if (!h.gaps.some((g) => Math.abs(angDiff(a, g)) < NUM.GAP / 2 - 0.02)) { if (this.hurt('ring', 1, h.x, h.y)) h.hitDone = true; break; }
              }
            }
          }
          for (let j = 0; j < 10; j++) {
            const a = j * TAU / 10 + 0.3;
            if (h.gaps.some((g) => Math.abs(angDiff(a, g)) < NUM.GAP / 2)) continue;
            light({ x: h.x + Math.cos(a) * h.r, y: h.y + Math.sin(a) * h.r, r: 120, color: '#fff2c8', intensity: 0.55 });
          }
          if (h.r > 2600) hz.splice(i, 1);
        }
      }
    }
    clearHazards() { this.hz.length = 0; this.beams.length = 0; this.wedge = null; this.lanes.length = 0; this.nova = null; this.column = null; this.motesGather = 0; this.darkWant = null; }
    addSpike(x, y, warn, big) {
      const A = this.A;
      x = clamp(x, A.west + NUM.SPIKE_W / 2 + 4, A.east - NUM.SPIKE_W / 2 - 4);
      this.hz.push({ kind: 'spike', x, y, t: 0, warn: warn || NUM.SPIKE_WARN, big: !!big, seed: Math.random() * 10 });
    }

    // ---------------------------------------------------------------- beams (drawn + hit-tested each step)
    beam(x0, y0, a, mode, half, kind, dmg) {
      const len = castLen(this.room, x0, y0, a, 3200);
      const x1 = x0 + Math.cos(a) * len, y1 = y0 + Math.sin(a) * len;
      const b = { x0, y0, x1, y1, a, len, mode, half: half || NUM.BEAM_HALF };
      this.beams.push(b);
      if (mode === 'fire') {
        const p = this.player;
        if (p && this.targetable(p) && beamTouches(p, x0, y0, x1, y1, b.half)) this.hurt(kind || 'beam', dmg || 1, x0, y0);
        for (let s = 80; s < len; s += 170) light({ x: x0 + Math.cos(a) * s, y: y0 + Math.sin(a) * s, r: 130, color: '#fff2c8', intensity: 0.6 });
        if (G.fx && Math.random() < 0.6) burst('spark', x1, y1, { count: 2, color: '#fff2c8', speed: 300 });
      }
      return b;
    }

    // ---------------------------------------------------------------- panes (form 2)
    tickPanes(dt) {
      if (this.dying || !this.fightStarted) return;
      const A = this.A;
      this.paneT -= dt * (this.phase >= 3 ? 1.35 : 1);
      if (this.paneT > 0) return;
      this.paneT = NUM.PANE_LIFE + 0.6 + 0.85 + 2.6;
      const sets = [
        [[A.mid - 560, A.floorY - 320], [A.mid + 560, A.floorY - 320]],
        [[A.mid - 400, A.floorY - 600], [A.mid + 400, A.floorY - 600]],
      ];
      const set = sets[this.paneSet++ % sets.length];
      for (const [px, py] of set) {
        if (px < A.west + 80 || px > A.east - 80 || py < A.ceilY + 80) continue;
        if (this.room.tileAt(Math.floor(px / TILE), Math.floor(py / TILE)) !== G.T.EMPTY && G.Physics.isSolidTile(this.room.tileAt(Math.floor(px / TILE), Math.floor(py / TILE)))) continue;
        this.room.spawn({ type: 'lucerne_pane', px, py, pw: NUM.PANE_W, life: NUM.PANE_LIFE });
      }
    }
    dismissPanes() { const r = this.room; if (!r) return; for (const e of r.entities) if (e.type === 'lucerne_pane' && !e.dead) e.dismiss(); }

    // ---------------------------------------------------------------- intro (form 1: she rises from prayer, then speaks)
    beginFight() {
      if (this._woke) return super.beginFight();
      this._beginQueued = true;
    }
    introUpdate(dt) {
      this.introT += dt;
      const t = this.introT;
      if (this.form === 2) {
        // the heart descends from the cage on its chain; the camera follows it down, then the player is freed.
        // Harmless by touch on the way down (it passes the high decks while the player is still locked)
        this.contactDamage = 0; this._sepNoTouch = true;
        this.updateCam(dt, t < 0.7 ? 'reveal' : false);
        if (t > 1.0) this.unlockFuse();
        this.lwant({ eyes: 1, flare: 1, mouth: 0.6 }, 3);
        this.glide(this.A.mid, this.A.floorY - NUM.IDLE2_H, dt, 260, 2.5);
        return;
      }
      // first encounter of the session: the camera tilts up to the Everlantern while she prays, then back to her
      if (this._reveal == null) { this._reveal = this.arena && !revealSeen ? NUM.REVEAL : 0; if (this.arena) revealSeen = true; }
      const R = this._reveal;
      this.updateCam(dt, t < R - 0.4 ? 'reveal' : (t < R + 1.6 || !this.fightStarted));
      this.face();
      if (t < R + 0.35) this.want('pray', 6);
      else if (!this._woke) {
        if (!this._rose) { this._rose = true; sfx('lucerne_raise', this.cx, { vol: 0.9 }); }
        this.want('idle', 2.4);
        this.glide(this.cx, this.A.floorY - NUM.HOVER - this.h / 2, dt, 120);
        if (t > R + 1.45) {
          this._woke = true;
          if (this._beginQueued || (!this.arena && !this.props.noAutoStart)) super.beginFight();
        }
      }
      if (this.fightStarted) { this.want('cast', 5); this.unlock(); }
    }
    onFightStart() {
      this.unlock();
      if (G.Audio && typeof G.Audio.musicLayer === 'function') { try { G.Audio.musicLayer(0); } catch (err) { void err; } }
      burst('ember', this.cx, this.feetY - 140, { count: 18, color: '#ffe6a0', speed: 220 });
    }

    // ---------------------------------------------------------------- idle / stagger
    idleUpdate(dt) {
      this.updateCam(dt, false);
      const A = this.A, P = this.pc();
      if (this.form === 1) {
        this.want('idle', 5);
        this.face();
        // keep a duelling distance at hover height
        let side = this.cx < P.x ? -1 : 1;
        let tx = P.x + side * 300;
        if (tx < A.west + 80 || tx > A.east - 80) { side = -side; tx = P.x + side * 300; }
        if (Math.abs(this.cx - P.x) < 260 || Math.abs(this.cx - P.x) > 420) this.glide(clamp(tx, A.west + 60, A.east - 60), A.floorY - NUM.HOVER - this.h / 2, dt, 230, 2.2);
        else this.glide(this.cx, A.floorY - NUM.HOVER - this.h / 2, dt, 120, 2);
      } else {
        this.lwant({ eyes: 0.5, flare: 0.3 }, 4);
        const tx = clamp(lerp(A.mid, P.x, 0.6), A.mid - 560, A.mid + 560);
        this.glide(tx, A.floorY - NUM.IDLE2_H + Math.sin(this.t * 0.9) * 26, dt, 200, 1.6);
      }
    }
    onStagger() {
      this.clearHazards();
      // form 2: the slack heart crashes to the floor; it never hurts by touch while stunned (it usually lands on the
      // very player whose up-slash staggered it)
      this.alpha = 1; this.hurtable = true; this.contactDamage = this.form === 1 ? 1 : 0;
      if (this.form === 1) { this.want('stagger', 7); sfx('lucerne_cry', this.cx, { vol: 0.6, pitch: 1.1 }); }
      else { this.lwant({ dim: 0.7, eyes: 0, mouth: 0.8 }, 6); this.dismissPanes(); }
      burst('shard', this.cx, this.cy, { count: 14, color: COL.crystal, speed: 320 });
    }
    staggerUpdate(dt) {
      this.updateCam(dt, false);
      const A = this.A;
      if (this.form === 1) {
        this.want('stagger', 7);
        this.glide(this.cx, A.floorY - this.h / 2, dt, 420, 6);
      } else {
        // the chain slackens: the heart crashes to the floor
        const ty = A.floorY - this.h / 2 - 6;
        this.vy = Math.min(this.vy + 2400 * dt, 1100); this.vx = damp(this.vx, 0, 6, dt);
        this.x += this.vx * dt; this.y += this.vy * dt;
        if (this.cy >= ty) {
          this.y = ty - this.h / 2;
          if (!this._thud) { this._thud = true; this.vy = 0; sfx('lucerne_slam', this.cx, { vol: 0.8, pitch: 1.2 }); if (G.game) G.game.shake(10, 0.4); burst('dust', this.cx, A.floorY, { count: 16, color: '#cbb889', speed: 260 }); }
        }
        this.clampHall();
        this.lwant({ dim: 0.7, eyes: 0, mouth: 0.5 }, 5);
      }
    }
    onStaggerEnd() { this._thud = false; if (this.form === 1) this.want('idle', 4); else this._sepNoTouch = true; }
    onInterrupt() { this.clearHazardsSoft(); }
    clearHazardsSoft() { this.beams.length = 0; this.wedge = null; this.nova = null; this.column = null; this.motesGather = 0; this.lanes.length = 0; }

    // ---------------------------------------------------------------- phases
    onPhase(phase) {
      if (this.form === 1 && phase >= 2 && !this._ascending) {
        this._ascending = true;
        if (G.clearProjectiles) G.clearProjectiles(this.room);
        this.clearHazards();
        this.startAttack('ascend');
        return;
      }
      if (this.form === 2 && phase >= 3) {
        super.onPhase(phase);
        sfx('lucerne_cry', this.cx, { vol: 0.8, pitch: 0.9 });
        this.lwant({ flare: 1, eyes: 1, mouth: 1 }, 6);
      }
    }

    // =================================================================================== form-1 transformation
    atk_ascend(dt, s) {
      const sd = this.stateData, A = this.A;
      if (!sd.ph) { sd.ph = 'reel'; sd.t = 0; this.alpha = 1; this.hurtable = false; this.contactDamage = 0; this.clearHazards(); this.lockFuse(); sfx('lucerne_cry', this.cx, { vol: 1 }); if (G.game) G.game.shake(6, 0.5); }
      sd.t += dt;
      this.updateCam(dt, sd.ph === 'reel' ? false : 'reveal');
      const hx = A.mid, hy = A.heartY + 110;
      switch (sd.ph) {
        case 'reel':
          this.want('reel', 8);
          this.x += Math.sin(this.t * 70) * 1.2;
          if (sd.t > 0.9) this.sub('rise');
          break;
        case 'rise': {
          this.want('ascend', 4);
          const d = this.glide(hx, hy, dt, 480, 2.2);
          this.face({ x: hx - 1, y: 0, w: 2, h: 2 });
          if (Math.random() < dt * 30) burst('ember', this.cx, this.feetY, { count: 1, color: '#ffe6a0', speed: 60 });
          if (d < 14 || sd.t > 3.2) { this.sub('speak'); sd.spoke = false; this.speak('phase2', () => { sd.spoke = true; }); }
          break;
        }
        case 'speak':
          this.glide(hx, hy, dt, 200, 3);
          if (sd.spoke) { this.sub('fuse'); sfx('lucerne_fuse', this.cx, { vol: 1 }); }
          break;
        case 'fuse': {
          this.glide(hx, A.heartY + 30, dt, 140, 1.4);
          this.pt = Object.assign({}, QPOSES.ascend, { white: smooth(sd.t / 1.3) });
          this.poseRate = 6;
          if (Math.random() < dt * 40) burst('spark', this.cx + rnd(-200, 200), this.cy + rnd(-140, 140), { count: 1, color: '#fff2c8', speed: 80 });
          if (G.game && sd.t > 0.4) G.game.shake(2 + sd.t * 3, 0.1);
          if (sd.t > 1.35) this.transform();
          break;
        }
        default: break;
      }
      if (s > 30) this.transform();
    }
    transform() {
      if (this._transformed) return;
      this._transformed = true;
      const A = this.A;
      if (G.game) { G.game.flash('#ffffff', 0.9); G.game.shake(16, 0.9); }
      burst('flash', this.cx, this.cy, { r: 520, color: '#ffffff', life: 0.5 });
      burst('ring', this.cx, this.cy, { r: 420, color: '#fff2c8', width: 8, life: 0.7 });
      burst('spark', this.cx, this.cy, { count: 40, color: '#ffffff', speed: 800 });
      const nb = this.room.spawn({ type: 'boss_lucerne', boss: this.bossId, arena: this.arena, form: 2, startHp: this.hp,
        cx: A.mid, cy: A.heartY + 40, camBX: this.camBX, camBY: this.camBY, noAutoStart: true });
      if (nb) {
        if (this.arena && typeof this.arena.setBoss === 'function') this.arena.setBoss(nb);
        if (this.staggerDmg) nb.staggerDmg = 0;
        this._handover = true;
        if (this._cam && G.camera && G.camera.target === this._cam) { nb.updateCam(0, false); }
      }
      this.remove();
    }

    // =================================================================================== form-1 attacks
    atk_beam(dt, s) {
      const sd = this.stateData, A = this.A;
      if (!sd.ph) {
        sd.ph = this.form === 1 ? 'pos' : 'tele'; sd.t = 0; sd.n = 0;
        sd.total = this.form === 1 ? (this.late() ? 2 : 1) : (this.phase >= 3 ? 4 : 3);
        if (this.form === 1) {
          const P = this.pc();
          let side = this.cx < P.x ? -1 : 1;
          let fx = P.x + side * rnd(300, 430);
          if (fx < A.west + 80 || fx > A.east - 80) { side = -side; fx = P.x + side * rnd(300, 430); }
          sd.fx = clamp(fx, A.west + 80, A.east - 80);
          sd.fy = Math.max(A.ceilY + 200, A.floorY - rnd(250, 330));
        }
      }
      sd.t += dt;
      this.beams.length = 0;
      this.updateCam(dt, false);
      const P = this.pc();
      if (this.form === 1) { this.face({ x: P.x - 1, y: 0, w: 2, h: 2 }); }
      switch (sd.ph) {
        case 'pos': {
          this.want('aim', 5);
          const d = this.glide(sd.fx, sd.fy - this.h / 2, dt, 640, 4);
          if (d < 24 || sd.t > 0.6) this.sub('tele');
          break;
        }
        case 'tele': {
          const first = sd.n === 0;
          const dur = this.form === 1 ? (first ? 0.85 : 0.6) : (first ? 0.8 : (this.phase >= 3 ? 0.6 : 0.65));
          if (sd.t <= dt + 1e-6) {
            sd.dur = this.telegraph(dur, { color: COL.tele, sound: first ? 'lucerne_charge' : 'lucerne_raise', vol: 0.8, x: this.origin().x, y: this.origin().y, shake: 0.6 });
            sd.locked = false;
          }
          if (this.form === 1) { this.want('aim', 6); this.glide(sd.fx, sd.fy - this.h / 2, dt, 120, 3); }
          else { this.lwant({ eyes: 1, flare: 0.8, mouth: 0.3 }, 6); this.glide(this.cx, this.cy, dt, 60); }
          const o = this.origin();
          if (!sd.locked) sd.aim = Math.atan2(P.y - o.y, P.x - o.x);
          if (this.form === 1) this.pt = Object.assign({}, QPOSES.aim, { staff: this.staffAngle(sd.aim) });
          if (!sd.locked && sd.t >= sd.dur - NUM.BEAM_LOCK) { sd.locked = true; sfx('lucerne_lock', o.x, { vol: 0.7 }); }
          this.beam(o.x, o.y, sd.aim, sd.locked ? 'lock' : 'guide');
          if (sd.t >= sd.dur) { this.sub('fire'); sfx('lucerne_beam', o.x, { vol: 1 }); if (G.game) G.game.shake(4, 0.2); }
          break;
        }
        case 'fire': {
          const o = this.origin();
          this.beam(o.x, o.y, sd.aim, 'fire', NUM.BEAM_HALF, 'beam', 1);
          if (sd.t >= NUM.BEAM_FIRE) {
            sd.n++;
            if (sd.n < sd.total) this.sub('tele'); else this.sub('rec');
          }
          break;
        }
        case 'rec':
          if (this.form === 1) { this.want('idle', 4); this.glide(this.cx, A.floorY - NUM.HOVER - this.h / 2, dt, 300, 2); }
          else this.lwant({ dim: 0.25, eyes: 0.3 }, 4);
          if (sd.t > 0.7) { this.finish(); return; }
          break;
        default: break;
      }
      if (s > 8) this.finish();
    }
    /** staff angle (from vertical, + forward) that points the lantern along world angle a */
    staffAngle(a) {
      const lx = Math.cos(a) * this.facing, ly = Math.sin(a);
      return clamp(Math.atan2(lx, -ly), -0.6, 2.9);
    }

    atk_motes(dt, s) {
      const sd = this.stateData;
      if (!sd.ph) {
        sd.ph = 'tele'; sd.t = 0;
        sd.count = this.form === 1 ? (this.late() ? 5 : 4) : (this.phase >= 3 ? 8 : 6);
        sd.dur = this.telegraph(0.7, { color: COL.tele, sound: 'lucerne_motes', vol: 0.9, x: this.motesOrigin().x, y: this.motesOrigin().y, shake: 0.5 });
        sd.fired = 0;
      }
      sd.t += dt;
      this.updateCam(dt, false);
      if (this.form === 1) { this.want('cast', 6); this.face(); this.glide(this.cx, this.A.floorY - NUM.HOVER - this.h / 2 - 20, dt, 140, 2); }
      else { this.lwant({ eyes: 1, flare: 0.9, mouth: 0.4 }, 6); this.glide(this.cx, this.cy, dt, 80); }
      switch (sd.ph) {
        case 'tele':
          this.motesGather = clamp(sd.t / sd.dur, 0, 1);
          if (sd.t >= sd.dur) this.sub('fire');
          break;
        case 'fire': {
          const gap = this.form === 1 ? 0.24 : 0.16;
          while (sd.fired < sd.count && sd.t >= sd.fired * gap) this.fireMote(sd.fired++, sd.count);
          this.motesGather = 1 - sd.fired / sd.count;
          if (sd.fired >= sd.count) this.sub('rec');
          break;
        }
        case 'rec':
          this.motesGather = 0;
          if (sd.t > 0.75) { this.finish(); return; }
          break;
        default: break;
      }
      if (s > 7) this.finish();
    }
    motesOrigin() { return this.form === 1 ? this.crownPos() : { x: this.cx, y: this.cy }; }
    fireMote(i, n) {
      const o = this.motesOrigin();
      const a = -Math.PI / 2 + (i - (n - 1) / 2) * (this.form === 1 ? 0.55 : 0.5);
      const R = this.form === 1 ? 26 : 70;
      const x = o.x + Math.cos(a) * R, y = o.y + Math.sin(a) * R;
      G.spawnProjectile(this.room, 'lucerne_mote', { x, y, vx: Math.cos(a) * 170, vy: Math.sin(a) * 170, owner: this, destroyable: true,
        homeT: NUM.MOTE_HOME + (i % 2) * 0.12, top: NUM.MOTE_SPEED + (this.form === 2 ? 20 : 0), life: NUM.MOTE_LIFE });
      sfx('lucerne_release', x, { vol: 0.6, pitch: 1 + i * 0.05 });
    }

    atk_spikes(dt, s) {
      const sd = this.stateData, A = this.A;
      if (!sd.ph) {
        sd.ph = 'tele'; sd.t = 0;
        sd.dur = this.telegraph(this.form === 1 ? 0.55 : 0.5, { color: COL.tele, sound: 'lucerne_raise', vol: 0.8, shake: 0.8 });
      }
      sd.t += dt;
      this.updateCam(dt, false);
      const P = this.pc();
      switch (sd.ph) {
        case 'tele':
          if (this.form === 1) { this.want('raise', 7); this.face(); this.glide(this.cx, A.floorY - NUM.HOVER - this.h / 2 - 30, dt, 160, 3); }
          else { this.lwant({ eyes: 1, flare: 0.6, mouth: 0.7 }, 6); this.glide(this.cx, this.cy - 30, dt, 120, 3); }
          if (sd.t >= sd.dur) {
            this.sub('slam');
            // cracks: one under the player (on whatever surface they stand over) + spread on the floor
            const surf = surfaceBelow(this.room, P.x, P.feet - 4, A.floorY);
            this.addSpike(P.x, surf, NUM.SPIKE_WARN, true);
            const xs = [P.x];
            const extra = this.form === 1 ? (this.late() ? 3 : 2) : (this.phase >= 3 ? 6 : 4);
            for (let i = 0; i < extra; i++) {
              const side = i % 2 ? 1 : -1, ring = Math.floor(i / 2);
              let x = P.x + side * (rnd(150, 220) + ring * rnd(190, 240));
              if (x < A.west + 40 || x > A.east - 40) x = P.x - side * (rnd(150, 220) + (ring + 1) * 200);
              if (x < A.west + 40 || x > A.east - 40 || xs.some((q) => Math.abs(q - x) < 130)) continue;
              xs.push(x);
              this.addSpike(x, A.floorY, NUM.SPIKE_WARN + 0.05 * (i + 1), false);
            }
            sfx('lucerne_crack', P.x, { vol: 0.9 });
            if (G.game) G.game.shake(5, 0.25);
            burst('ring', this.cx, this.form === 1 ? this.feetY : this.cy + 90, { r: 90, color: '#fff2c8', width: 4, life: 0.35 });
          }
          break;
        case 'slam':
          if (this.form === 1) this.want('slam', 9); else this.lwant({ eyes: 1, flare: 0.4, mouth: 0.2 }, 6);
          if (sd.t > NUM.SPIKE_WARN + 0.25) this.sub('rec');
          break;
        case 'rec':
          if (this.form === 1) { this.want('idle', 3); this.glide(this.cx, A.floorY - NUM.HOVER - this.h / 2, dt, 140, 2); }
          else this.lwant({ dim: 0.2 }, 4);
          if (sd.t > 0.55) { this.finish(); return; }
          break;
        default: break;
      }
      if (s > 6) this.finish();
    }

    atk_nova(dt, s) {
      const sd = this.stateData;
      if (!sd.ph) { sd.ph = 'tele'; sd.t = 0; sd.dur = this.telegraph(NUM.NOVA_TELE, { color: '#fff4d0', sound: 'lucerne_gather', vol: 0.9, shake: 1.2 }); }
      sd.t += dt;
      this.updateCam(dt, false);
      this.glide(this.cx, this.cy, dt, 40);
      const c = { x: this.cx, y: this.cy };
      switch (sd.ph) {
        case 'tele':
          this.want('gather', 8);
          this.nova = { x: c.x, y: c.y, k: sd.t / sd.dur, r: NUM.NOVA_R, mode: 'tele' };
          if (sd.t >= sd.dur) { this.sub('burst'); sfx('lucerne_nova', c.x, { vol: 1 }); if (G.game) G.game.shake(7, 0.3); burst('spark', c.x, c.y, { count: 26, color: '#fff2c8', speed: 600 }); }
          break;
        case 'burst': {
          this.want('nova', 14);
          const k = clamp(sd.t / 0.16, 0, 1), R = lerp(40, NUM.NOVA_R, smooth(k));
          this.nova = { x: c.x, y: c.y, k, r: R, mode: 'burst' };
          const p = this.player;
          if (sd.t < 0.24 && p && this.targetable(p) && circleRect(c.x, c.y, R, p)) this.hurt('nova', 1, c.x, c.y);
          light({ x: c.x, y: c.y, r: R * 2.2, color: '#fff2c8', intensity: 0.9 * (1 - k * 0.5) });
          if (sd.t > 0.3) this.sub('rec');
          break;
        }
        case 'rec':
          this.nova = null;
          this.want('idle', 2.5);
          this.pz.glow = Math.min(this.pz.glow, 0.1);
          if (sd.t > 0.7) { this.finish(); return; }
          break;
        default: break;
      }
      if (s > 4) this.finish();
    }

    atk_dive(dt, s) {
      const sd = this.stateData, A = this.A;
      if (!sd.ph) { sd.ph = 'out'; sd.t = 0; sfx('lucerne_blink', this.cx, { vol: 0.8 }); }
      sd.t += dt;
      this.updateCam(dt, false);
      const P = this.pc();
      switch (sd.ph) {
        case 'out':
          this.want('cast', 8);
          this.alpha = 1 - smooth(sd.t / 0.3);
          this.hurtable = this.alpha > 0.5; this.contactDamage = this.alpha > 0.6 ? 1 : 0;
          if (Math.random() < dt * 40) burst('spark', this.cx + rnd(-20, 20), this.cy + rnd(-60, 60), { count: 1, color: '#fff2c8', speed: 120 });
          if (sd.t >= 0.3) {
            // reappear well above the player's head (a player on a high deck or mid-jump must never be inside her)
            const pTop = P.p ? P.p.y : A.floorY - 60;
            const topFeet = Math.max(A.ceilY + 80 + this.h, Math.min(A.floorY - NUM.DIVE_H, pTop - 90));
            this.x = clamp(P.x, A.west + 80, A.east - 80) - this.w / 2;
            this.y = topFeet - this.h;
            sd.noTouch = true;
            this.vx = this.vy = 0;
            this.clampHall();
            this.sub('in');
            sfx('lucerne_blink', this.cx, { vol: 0.7, pitch: 1.2 });
          }
          break;
        case 'in':
          this.want('raise', 8);
          this.alpha = smooth(sd.t / 0.25);
          this.hurtable = this.alpha > 0.5; this.contactDamage = this.alpha > 0.6 && !this.diveTouch(sd) ? 1 : 0;
          this.column = { x: this.cx, top: this.feetY, bottom: A.floorY, k: 0, locked: false };
          if (sd.t >= 0.25) { this.alpha = 1; this.hurtable = true; this.contactDamage = this.diveTouch(sd) ? 0 : 1; this.sub('tele'); sd.dur = this.telegraph(NUM.DIVE_TELE, { color: COL.tele, sound: 'lucerne_raise', vol: 0.8, shake: 1 }); sd.locked = false; }
          break;
        case 'tele': {
          this.want('raise', 6);
          this.contactDamage = this.diveTouch(sd) ? 0 : 1;
          if (!sd.locked) {
            const tx = clamp(P.x, A.west + 80, A.east - 80);
            const dx = clamp(tx - this.cx, -280 * dt, 280 * dt);
            this.x += dx; this.clampHall();
            if (sd.t >= sd.dur - NUM.DIVE_LOCK) { sd.locked = true; sfx('lucerne_lock', this.cx, { vol: 0.7 }); }
          }
          this.column = { x: this.cx, top: this.feetY, bottom: A.floorY, k: sd.t / sd.dur, locked: sd.locked };
          if (sd.t >= sd.dur) { this.sub('fall'); sfx('lucerne_dive', this.cx, { vol: 1 }); this.vy = 600; }
          break;
        }
        case 'fall':
          this.want('dive', 12);
          this.column = { x: this.cx, top: this.feetY, bottom: A.floorY, k: 1, locked: true, falling: true };
          this.vy = Math.min(this.vy + 6000 * dt, 1900);
          this.y += this.vy * dt;
          if (this.feetY >= A.floorY - 2) {
            this.y = A.floorY - 2 - this.h; this.vy = 0;
            this.column = null;
            this.sub('land');
            this.strike({ x: this.cx - 90, y: A.floorY - 92, w: 180, h: 92 }, { damage: 1, dir: { x: this.facing, y: -1 } });
            sfx('lucerne_slam', this.cx, { vol: 1 });
            if (G.game) G.game.shake(12, 0.45);
            burst('ring', this.cx, A.floorY - 6, { r: 180, color: '#fff2c8', width: 6, life: 0.4 });
            burst('dust', this.cx, A.floorY - 4, { count: 22, color: '#d8c79a', speed: 360 });
            for (const dir of [-1, 1]) G.spawnProjectile(this.room, 'wave', { x: this.cx + dir * 40, y: A.floorY, dir, speed: 470, w: 34, h: 42, color: '#ffd77a', owner: this, life: 3 });
          }
          if (sd.t > 1.2) { this.y = A.floorY - 2 - this.h; this.sub('land'); }
          break;
        case 'land':
          this.want('land', 9);
          if (sd.t < 0.12) this.strike({ x: this.cx - 90, y: A.floorY - 92, w: 180, h: 92 }, { damage: 1, dir: { x: this.facing, y: -1 } });
          if (sd.t > 1.0) this.sub('rise');
          break;
        case 'rise':
          this.want('idle', 4);
          this.glide(this.cx, A.floorY - NUM.HOVER - this.h / 2, dt, 200, 3);
          if (sd.t > 0.4) { this.finish(0.35); return; }
          break;
        default: break;
      }
      if (s > 6) { this.alpha = 1; this.finish(); }
    }

    /** dive: while she still overlaps a player she reappeared on (only possible right under the ceiling), no contact */
    diveTouch(sd) {
      if (!sd.noTouch) return false;
      const p = this.player;
      if (p && overlap({ x: this.x - 6, y: this.y - 6, w: this.w + 12, h: this.h + 12 }, p)) return true;
      sd.noTouch = false;
      return false;
    }

    // =================================================================================== form-2 attacks
    atk_sweep(dt, s) {
      const sd = this.stateData, A = this.A;
      if (!sd.ph) {
        sd.ph = 'pos'; sd.t = 0;
        const P = this.pc();
        const high = P.feet < A.floorY - 150;
        sd.list = this.phase >= 3 ? (high ? ['up', 'down'] : ['down', 'up']) : [high ? 'up' : 'down'];
        sd.i = 0;
      }
      sd.t += dt;
      this.updateCam(dt, false);
      const mode = sd.list[sd.i];
      const cy = A.floorY - (mode === 'down' ? NUM.V_H : NUM.UP_H);
      const base = mode === 'down' ? Math.PI / 2 : -Math.PI / 2;
      this.beams.length = 0;
      switch (sd.ph) {
        case 'pos': {
          this.lwant({ eyes: 1, flare: 0.5, mouth: 0.3 }, 5);
          this.relocating(true);
          const d = this.glide(A.mid, cy, dt, 700, 4);
          if (d < 12 || sd.t > 1.1) { this.relocating(false); this.sub('tele'); sd.dur = this.telegraph(sd.i === 0 ? NUM.SWEEP_TELE : 0.8, { color: COL.tele, sound: 'lucerne_sweep_charge', vol: 1, shake: 1.4 }); }
          break;
        }
        case 'tele': {
          this.glide(A.mid, cy, dt, 300, 6);
          this.lwant({ eyes: 1, flare: 1, mouth: 0.9 }, 5);
          this.wedge = { x: this.cx, y: this.cy, base, max: NUM.SWEEP_MAX, k: sd.t / sd.dur, mode };
          this.beam(this.cx, this.cy, base, sd.t > sd.dur - 0.3 ? 'lock' : 'guide', NUM.SWEEP_HALF).sweep = true;
          if (sd.t >= sd.dur) { this.sub('sweep'); sfx('lucerne_sweep', this.cx, { vol: 1 }); if (G.game) G.game.shake(5, 0.3); }
          break;
        }
        case 'sweep': {
          this.glide(A.mid, cy, dt, 300, 6);
          const k = clamp(sd.t / NUM.SWEEP_TIME, 0, 1), th = NUM.SWEEP_MAX * k;
          this.wedge = { x: this.cx, y: this.cy, base, max: NUM.SWEEP_MAX, k: 1, mode, th };
          const sgn = mode === 'down' ? 1 : -1;
          this.beam(this.cx, this.cy, base + sgn * th, 'fire', NUM.SWEEP_HALF, 'sweep', 2);
          this.beam(this.cx, this.cy, base - sgn * th, 'fire', NUM.SWEEP_HALF, 'sweep', 2);
          if (G.game && Math.random() < dt * 20) G.game.shake(2, 0.06);
          if (k >= 1) {
            this.wedge = null;
            sd.i++;
            if (sd.i < sd.list.length) this.sub('pos'); else this.sub('rec');
          }
          break;
        }
        case 'rec':
          this.wedge = null;
          this.lwant({ dim: 0.45, eyes: 0, mouth: 0.2 }, 4);
          this.glide(this.cx, this.cy + 20, dt, 60);
          if (sd.t > 1.0) { this.finish(); return; }
          break;
        default: break;
      }
      if (s > 14) this.finish();
    }

    /**
     * Pulse rings: each ring has 3 gaps (NUM.GAP wide). The first gap of every ring is planned on the floor line
     * as a span of x: ring 1's span starts 30-280 px from where the player stands (never
     * on them); every next span is reachable from ANY point of the previous one within 230 px (the ring before must pass
     * first: 1.25 s minus its band, a 0.3 s reaction and a 0.7 s run) and never covers all of
     * it (standing still in the last gap is not safe). Far from the middle the spans get very wide, so the plan works
     * on spans, not on gap centres. The two other gaps never overlap the previous ring's planned gap.
     */
    planRings(n, cx, cy) {
      const A = this.A, P0 = this.pc();
      // planned on the floor: the rings sweep the decks within a fraction of a second, the safe gaps are below
      // (the lanes are drawn down to the floor); a player up on a deck drops during the 1 s inhale
      const ty = A.floorY - 27, H = ty - cy;
      const lo = A.west + 30, hi = A.east - 30;
      const xAt = (a) => (a <= 0.001 ? hi + 4000 : a >= Math.PI - 0.001 ? lo - 4000 : cx + H / Math.tan(a));
      const span = (g, h) => { const a = xAt(Math.min(Math.PI - 0.001, g + h)), b = xAt(Math.max(0.001, g - h)); return [Math.max(lo, a), Math.min(hi, b)]; };
      const SAFE = NUM.GAP / 2 - 0.07, FULL = NUM.GAP / 2 + 0.03;
      const dist = (x, I) => (x < I[0] ? I[0] - x : x > I[1] ? x - I[1] : 0);
      const rings = [];
      let prev = null, prevG = null;
      const x0 = clamp(P0.x, lo, hi);
      for (let i = 0; i < n; i++) {
        const ok = [], loose = [];
        for (let g = 0.06; g < Math.PI - 0.06; g += 0.012) {
          const S = span(g, SAFE), F = span(g, FULL);
          if (S[1] - S[0] < 90) continue;
          if (!prev) {
            const d = dist(x0, F), reach = dist(x0, S);
            if (d >= 30 && reach <= 280) ok.push({ g, S, d: reach });
            else if (reach <= 360 && dist(x0, F) > 0) loose.push({ g, S, d: reach });
          } else {
            const travel = Math.max(dist(prev[0], S), dist(prev[1], S));
            const unsafe = Math.max(0, F[0] - prev[0]) + Math.max(0, prev[1] - F[1]);
            if (travel <= 230 && unsafe >= 50 && Math.abs(angDiff(g, prevG)) > 0.2) ok.push({ g, S, d: travel });
            else if (travel <= 300 && unsafe > 0) loose.push({ g, S, d: travel });
          }
        }
        let pool = ok.length ? ok : loose;
        if (!pool.length) {
          // cannot happen in a normal hall; fall back to a gap right beside the player
          const g = Math.atan2(H, x0 + 200 * (x0 < A.mid ? 1 : -1) - cx);
          pool = [{ g, S: span(g, SAFE), d: 0 }];
        }
        // prefer moving toward the middle (75 %), as the hall's edges are cramped
        const inward = Math.random() < 0.75;
        const ref = prev ? (prev[0] + prev[1]) / 2 : x0;
        const pref = pool.filter((c) => (Math.abs((c.S[0] + c.S[1]) / 2 - A.mid) < Math.abs(ref - A.mid)) === inward);
        const pick = (pref.length ? pref : pool)[Math.floor(Math.random() * (pref.length || pool.length))];
        const gaps = [pick.g];
        for (let tries = 0; gaps.length < 3 && tries < 80; tries++) {
          const g = rnd(-Math.PI, Math.PI);
          if (!gaps.every((q) => Math.abs(angDiff(g, q)) > 1.1)) continue;
          if (prevG != null && Math.abs(angDiff(g, prevG)) < NUM.GAP + 0.15) continue;
          if (!prev && g > 0 && g < Math.PI && dist(x0, span(g, FULL)) < 30) continue;
          gaps.push(g);
        }
        rings.push({ gaps, tx: (pick.S[0] + pick.S[1]) / 2, span: pick.S });
        prev = pick.S; prevG = pick.g;
      }
      return rings;
    }

    atk_pulse(dt, s) {
      const sd = this.stateData, A = this.A;
      const cx = A.mid, cy = A.floorY - NUM.PULSE_H;
      if (!sd.ph) {
        sd.ph = 'pos'; sd.t = 0;
        sd.n = this.phase >= 3 ? 3 : 2;
        sd.rings = this.planRings(sd.n, cx, cy);
        sd.fired = 0;
      }
      sd.t += dt;
      this.updateCam(dt, false);
      switch (sd.ph) {
        case 'pos': {
          this.lwant({ eyes: 0.6, flare: 0.3 }, 4);
          this.relocating(true);
          const d = this.glide(cx, cy, dt, 600, 4);
          if (d < 12 || sd.t > 1.0) {
            // stays harmless by touch through the whole pulse: the row-15 deck is right above it and a player
            // dropping to the floor for the rings falls past the heart
            this.sub('inhale');
            sd.dur = this.telegraph(1.0, { color: '#fff4d0', sound: 'lucerne_inhale', vol: 1, shake: 1 });
            this.darkWant = 0.9;
          }
          break;
        }
        case 'inhale': {
          this.contactDamage = 0;
          this.glide(cx, cy, dt, 200, 6);
          this.lwant({ eyes: 1, flare: 0.1, dim: 0.5, mouth: 1 }, 5);
          this.lanes = [{ gaps: sd.rings[0].gaps, k: sd.t / sd.dur }];
          if (Math.random() < dt * 40) {
            const a = rnd(0, TAU), r = rnd(300, 700);
            burst('spark', cx + Math.cos(a) * r, cy + Math.sin(a) * r, { count: 1, color: '#fff2c8', speed: 30, vx: -Math.cos(a) * 500, vy: -Math.sin(a) * 500, life: 0.6 });
          }
          if (sd.t >= sd.dur) { this.sub('rings'); sd.fired = 0; }
          break;
        }
        case 'rings': {
          this.contactDamage = 0;
          this.glide(cx, cy, dt, 200, 6);
          this.lwant({ eyes: 1, flare: 1, dim: 0, mouth: 0.6 }, 8);
          while (sd.fired < sd.n && sd.t >= sd.fired * NUM.RING_GAP_T) {
            const R = sd.rings[sd.fired];
            this.hz.push({ kind: 'ring', x: cx, y: cy, r: 50, t: 0, gaps: R.gaps.slice() });
            sfx('lucerne_pulse', cx, { vol: 1 });
            if (G.game) G.game.shake(6, 0.3);
            burst('flash', cx, cy, { r: 160, color: '#ffffff', life: 0.2 });
            sd.fired++;
          }
          const next = sd.rings[sd.fired];
          this.lanes = next ? [{ gaps: next.gaps, k: clamp((sd.t - (sd.fired - 1) * NUM.RING_GAP_T) / NUM.RING_GAP_T, 0, 1) }] : [];
          if (sd.fired >= sd.n && sd.t > (sd.n - 1) * NUM.RING_GAP_T + 1.6) { this.sub('rec'); this.darkWant = null; this.lanes = []; }
          break;
        }
        case 'rec':
          if (sd.t <= dt + 1e-6) this.relocating(false);
          this.lwant({ dim: 0.5, eyes: 0.1 }, 4);
          this.glide(cx, cy + 60, dt, 80);
          if (sd.t > 0.9) { this.finish(); this._sepNoTouch = true; return; }
          break;
        default: break;
      }
      if (s > 12) { this.darkWant = null; this.lanes = []; this.finish(); this._sepNoTouch = true; }
    }

    // =================================================================================== defeat & the ending
    die(hit) {
      this.clearHazards();
      this.dismissPanes();
      super.die(hit);
    }
    onDefeatStart() {
      this.alpha = 1;
      sfx('lucerne_cry', this.cx, { vol: 1, pitch: 0.9 });
      if (this.form === 1) this.want('fallen', 3); else this.lwant({ dim: 0.2, eyes: 1, mouth: 1, crack: 0.4, flare: 1 }, 4);
    }
    settle(dt) {
      this.shieldLocked();
      this.tickPose(dt);
      this.tickDark(dt);
      this.lights();
      const A = this.A;
      if (this.form === 1) {
        this.want('fallen', 3);
        this.glide(this.cx, A.floorY - this.h / 2, dt, 160, 2);
      } else {
        const E = this.ending;
        const ty = A.floorY - this.h / 2 - 8;
        if (E) this.glide(lerp(this.cx, A.mid, 0.02), ty, dt, 120, 1.2);
        else this.glide(this.cx, this.cy + 10, dt, 30, 1);
      }
      this.updateCam(dt, this._camReveal ? 'reveal' : true);
    }
    onDefeatSequence(dt, s) {
      const A = this.A;
      if (!this.ending) {
        this.ending = { id: (G.game && typeof G.game.endingId === 'function') ? G.game.endingId() : 'undying', crack: 0, shatter: 0, open: 0, blue: 0, flame: 0, sparks: [], stream: 0 };
        if (G.game && G.game.lockPlayer) { G.game.lockPlayer('lucerne_end'); this._endLocked = true; }
        sfx('lucerne_glass', this.cx, { vol: 1 });
      }
      const E = this.ending;
      if (this.form === 2) this.lwant({ dim: clamp(s / 1.6, 0, 1) * 0.85, eyes: s < 1.0 ? 1 : 0, mouth: 0.5, crack: Math.min(1, 0.4 + s * 0.4), flare: 0 }, 3);
      if (s >= 1.9 && !this._finished) {
        // The finale fades her track to silence over 3 s. Fade it out BEFORE finishDefeat: the arena's end runs
        // G.game.endBossMusic → the region-music restore (music('sanctum'), 1.5 s crossfade), which would shorten the
        // fade and start a sanctum player for nothing (QA audio) — so that restore is swallowed (ambience is kept).
        if (G.Audio && typeof G.Audio.music === 'function') { try { G.Audio.musicLayer && G.Audio.musicLayer(0); G.Audio.music(null, { fade: 3 }); } catch (err) { G.reportError(err, 'lucerne music'); } }
        withoutMusicRestore(() => this.finishDefeat());
      }
      if (s >= 2.0) this.endingBeat(dt, s - 2.0, E);
      // safety: if the fade's callback never arrives (fade overridden / interrupted), finish anyway
      const fg = this._fadeGuard;
      if (fg && !this._endingDone && G.game && G.game.t - fg.at > fg.sec) this.finishEnding(E.id);
      void A;
    }
    onDefeated() { /* the ending beat continues in onDefeatSequence; G.game.finishGame() at its end */ }
    endingBeat(dt, e, E) {
      const A = this.A, p = playerOf();
      const heart = { x: A.mid, y: A.heartY };
      const pp = p ? { x: p.x + p.w / 2, y: p.y + p.h / 2 } : { x: A.mid - 300, y: A.floorY - 30 };
      if (p && this._plr == null) { this._plr = p.lightRadius; }
      // the camera rises to the cage once the sparks fly to it (gutterlight) / the stream reaches it (undying)
      this._camReveal = E.id === 'gutterlight' ? e > 2.3 : e > 2.2;
      if (E.id === 'gutterlight') {
        // six sparks rise from the Wickling, rekindle its flame, then shatter the Everlantern
        while (E.sparks.length < 6 && e >= E.sparks.length * 0.3) {
          E.sparks.push({ a: E.sparks.length * TAU / 6, t0: e, x: pp.x, y: pp.y });
          sfx('lucerne_release', pp.x, { vol: 0.8, pitch: 0.8 + E.sparks.length * 0.1 });
        }
        for (const sp of E.sparks) {
          const age = e - sp.t0;
          if (e < 2.4) { const R = 40 + 14 * Math.min(1, age); sp.a += dt * 2.2; sp.x = pp.x + Math.cos(sp.a) * R; sp.y = pp.y - 10 + Math.sin(sp.a) * R * 0.6 - Math.min(1, age) * 16; }
          else { const k = smooth(clamp((e - 2.4 - sp.a * 0.03) / 0.8, 0, 1)); sp.x = lerp(sp.x, heart.x, k * 0.2); sp.y = lerp(sp.y, heart.y, k * 0.2); }
        }
        if (p) p.lightRadius = 260 + 140 * clamp(e / 2.4, 0, 1);
        light({ x: pp.x, y: pp.y, r: 200 + 120 * clamp(e / 2.4, 0, 1), color: '#cfe8ff', intensity: 0.6 });
        if (e > 3.2) E.crack = clamp((e - 3.2) / 1.4, 0, 1);
        if (e > 3.2 && e < 4.6 && G.game && Math.random() < dt * 20) G.game.shake(2 + E.crack * 6, 0.1);
        if (e > 3.3 && !E.cracked) { E.cracked = true; sfx('lucerne_glass', heart.x, { vol: 1 }); }
        if (e >= 4.6 && !E.shatter) {
          E.shatter = 1;
          sfx('lucerne_shatter', heart.x, { vol: 1 });
          if (G.game) { G.game.flash('#ffffff', 1.2); G.game.shake(20, 1.0); }
          burst('flash', heart.x, heart.y, { r: 900, color: '#ffffff', life: 0.6 });
          for (let i = 0; i < 6; i++) burst('shard', heart.x + rnd(-420, 420), heart.y + rnd(-200, 200), { count: 12, color: i % 2 ? COL.glass : COL.gold, speed: 700 });
          burst('ring', heart.x, heart.y, { r: 900, color: '#ffffff', width: 10, life: 0.9 });
          E.sparks.length = 0;
        }
        if (E.shatter) {
          E.flame = clamp((e - 4.6) / 1.2, 0, 1);
          if (Math.random() < dt * 30) burst('ember', rnd(A.west, A.east), A.floorY - rnd(0, 600), { count: 1, color: '#ffd890', speed: 40, vy: -120 });
          light({ x: heart.x, y: heart.y, r: 900, color: '#ffffff', intensity: 0.9 });
        }
        if (e >= 6.4 && !this._fading) { this._fading = true; this.fadeOut(1.4, 'gutterlight'); }
      } else {
        // the Everlantern opens and draws the Wickling's blue flame in: it becomes its new heart
        E.open = smooth(clamp(e / 1.2, 0, 1));
        if (e > 0.2 && !E.pulled) { E.pulled = true; sfx('lucerne_pull', heart.x, { vol: 1 }); }
        E.stream = clamp((e - 1.2) / 2.6, 0, 1);
        if (e > 1.2 && e < 3.8 && Math.random() < dt * 40) {
          const k = Math.random();
          burst('ember', lerp(pp.x, heart.x, k) + rnd(-8, 8), lerp(pp.y - 20, heart.y, k) + rnd(-8, 8), { count: 1, color: COL.blue, speed: 30 });
        }
        if (p) p.lightRadius = lerp(260, 80, E.stream);
        if (e > 3.8) E.blue = smooth(clamp((e - 3.8) / 1.0, 0, 1));
        if (e > 3.8 && !E.blued) { E.blued = true; sfx('lucerne_glass', heart.x, { vol: 0.6, pitch: 0.7 }); if (G.game) G.game.flash('rgba(160,210,255,0.6)', 0.8); }
        light({ x: heart.x, y: heart.y, r: 500 + 300 * E.blue, color: E.blue > 0.5 ? COL.blue : '#fff2c8', intensity: 0.7 });
        if (e >= 5.2 && !this._fading) { this._fading = true; this.fadeOut(1.8, 'undying'); }
      }
    }
    fadeOut(sec, id) {
      const done = () => this.finishEnding(id);
      if (G.game && typeof G.game.fade === 'function') G.game.fade(1, sec, done); else done();
      this._fadeGuard = setTimeoutSafe(sec + 2.5);
    }
    finishEnding(id) {
      if (this._endingDone) return;
      this._endingDone = true;
      const p = playerOf();
      if (p && this._plr !== undefined) p.lightRadius = this._plr;
      if (this._endLocked && G.game && G.game.unlockPlayer) { this._endLocked = false; G.game.unlockPlayer('lucerne_end'); }
      this.releaseCam();
      const g = G.game;
      if (g && typeof g.finishGame === 'function') { try { g.finishGame(id); } catch (err) { G.reportError(err, 'lucerne finishGame'); } return; }
      // fallback: mark the save complete, play the ending, back to the title
      const pr = g && g.progress;
      if (pr) { pr.completed = true; pr.ending = id; }
      if (g && g.saveNow) g.saveNow();
      const back = () => { if (g && g.quitToTitle) g.quitToTitle(); };
      if (G.UI && typeof G.UI.playEnding === 'function') G.UI.playEnding(id, back); else back();
    }

    // =================================================================================== drawing
    drawBounds() {
      if (this.form === 1) return { x: this.x - 110, y: this.y - 120, w: this.w + 220, h: this.h + 150 };
      return { x: this.cx - 150, y: this.cy - 190, w: 300, h: 360 };
    }
    drawBody(ctx, t) {
      if (this.form === 1) {
        if (this.alpha <= 0.02) return;
        const bob = this.state === 'stagger' || this.dying ? 0 : Math.sin(this.t * 2.1 + this.seed) * 3;
        drawQueen(ctx, this.cx, this.feetY + bob, { f: this.facing, pz: this.pz, t, seed: this.seed, alpha: this.alpha, cloth: this.cloth, dim: this.state === 'stagger' ? 0.5 : (this.dying ? 0.6 : 0) });
      } else {
        drawLantern(ctx, this.cx, this.cy, { t, seed: this.seed, eyes: this.lp.eyes, mouth: this.lp.mouth, flare: this.lp.flare, dim: this.lp.dim, crack: this.lp.crack, rot: this.rot });
      }
    }
    drawCorpse(ctx, t) { this.drawBody(ctx, t); }
    /** attack FX above the player (called by the lucerne_fx layer) */
    drawFX(ctx, t) {
      if (this.dying) { this.drawEndingFX(ctx, t); return; }
      // motes gathering at the crown / core
      if (this.motesGather > 0.01) {
        const o = this.motesOrigin(), n = this.stateData.count || 4, R = (this.form === 1 ? 26 : 70) + (1 - this.motesGather) * 30;
        for (let i = 0; i < n; i++) {
          const a = -Math.PI / 2 + (i - (n - 1) / 2) * (this.form === 1 ? 0.55 : 0.5) + Math.sin(t * 3 + i) * 0.05;
          const x = o.x + Math.cos(a) * R, y = o.y + Math.sin(a) * R;
          glow(ctx, x, y, 22 * this.motesGather + 6, '#ffe6a0', 0.8 * this.motesGather);
          ctx.fillStyle = COL.white; ctx.beginPath(); ctx.arc(x, y, 2 + 3 * this.motesGather, 0, TAU); ctx.fill();
        }
      }
      // sweep wedge (the area the lasers will cover)
      const tele = teleOn();
      if (this.wedge) this.drawWedge(ctx, t, this.wedge, tele);
      // pulse lanes (safe dark corridors of the next ring)
      for (const L of this.lanes) this.drawLanes(ctx, t, L, tele);
      // hazards
      for (const h of this.hz) {
        if (h.kind === 'spike') this.drawSpike(ctx, t, h);
        else if (h.kind === 'ring' && h.t >= 0) this.drawRing(ctx, t, h);
      }
      // dive column
      if (this.column && !tele) this.drawDiveTell(ctx, t, this.column);
      else if (this.column) {
        const c = this.column, w = NUM.DIVE_COL;
        ctx.save();
        const a = c.falling ? 0.5 : (c.locked ? 0.42 + 0.18 * Math.sin(t * 40) : 0.14 + 0.12 * c.k);
        ctx.fillStyle = 'rgba(255,236,170,' + a.toFixed(3) + ')';
        ctx.fillRect(c.x - w, c.top, w * 2, c.bottom - c.top);
        ctx.strokeStyle = 'rgba(255,248,220,' + (0.5 + 0.4 * c.k).toFixed(3) + ')'; ctx.lineWidth = c.locked ? 3 : 2;
        ctx.beginPath(); ctx.moveTo(c.x - w, c.top); ctx.lineTo(c.x - w, c.bottom); ctx.moveTo(c.x + w, c.top); ctx.lineTo(c.x + w, c.bottom); ctx.stroke();
        glow(ctx, c.x, c.bottom - 6, w * 1.6, '#fff2c8', 0.4 + 0.4 * c.k);
        ctx.restore();
        light({ x: c.x, y: c.bottom - 40, r: 140, color: '#fff2c8', intensity: 0.3 + 0.3 * c.k });
      }
      // nova
      if (this.nova) {
        const n = this.nova;
        ctx.save();
        if (n.mode === 'tele') {
          if (tele) {   // the blast radius (easy only; standard: the light gathering into her is the tell)
            ctx.strokeStyle = 'rgba(255,240,200,' + (0.25 + 0.5 * n.k).toFixed(3) + ')'; ctx.lineWidth = 2 + 2 * n.k;
            ctx.setLineDash([10, 8]); ctx.lineDashOffset = -t * 60;
            ctx.beginPath(); ctx.arc(n.x, n.y, n.r, 0, TAU); ctx.stroke(); ctx.setLineDash([]);
          }
          glow(ctx, n.x, n.y, 60 + 40 * n.k, '#ffffff', 0.4 + 0.5 * n.k);
          for (let i = 0; i < 6; i++) { const a = i * TAU / 6 + t * 2, r = n.r * (1 - n.k); glow(ctx, n.x + Math.cos(a) * r, n.y + Math.sin(a) * r, 12, '#fff2c8', 0.8); }
        } else {
          ctx.globalCompositeOperation = 'lighter';
          ctx.fillStyle = 'rgba(255,240,200,' + (0.35 * (1 - n.k * 0.6)).toFixed(3) + ')';
          ctx.beginPath(); ctx.arc(n.x, n.y, n.r, 0, TAU); ctx.fill();
          ctx.strokeStyle = 'rgba(255,255,255,0.9)'; ctx.lineWidth = 8 * (1 - n.k) + 3;
          ctx.beginPath(); ctx.arc(n.x, n.y, n.r, 0, TAU); ctx.stroke();
          ctx.globalCompositeOperation = 'source-over';
        }
        ctx.restore();
      }
      // beams
      for (const b of this.beams) this.drawBeam(ctx, t, b, tele);
    }
    /** Standard / hardcore dive tell (diegetic, replaces the light column): she hangs above the player with her light
     *  swelling and shedding sparks downward; at the lock (0.5 s before the fall, with the 'lucerne_lock' chime) she
     *  flares white. */
    drawDiveTell(ctx, t, c) {
      if (c.falling) return;
      const y = this.cy, k = c.k || 0;
      glow(ctx, this.cx, y, 60 + 50 * k, '#fff2c8', 0.3 + 0.35 * k);
      if (c.locked) glow(ctx, this.cx, y, 46, '#ffffff', 0.55 + 0.3 * Math.abs(Math.sin(t * 30)));
      ctx.save();
      for (let i = 0; i < 6; i++) {   // sparks dripping from her hem
        const q = (t * 1.6 + i * 0.167) % 1;
        ctx.fillStyle = 'rgba(255,242,200,' + ((0.3 + 0.5 * k) * (1 - q)).toFixed(3) + ')';
        ctx.fillRect(this.cx + Math.sin(i * 2.3 + this.seed) * 16 - 1, this.feetY + q * 70, 2, 4);
      }
      ctx.restore();
      light({ x: this.cx, y: this.cy, r: 120 + 60 * k, color: '#fff2c8', intensity: 0.25 + 0.3 * k });
    }
    drawBeam(ctx, t, b, tele) {
      if (tele === false && (b.mode === 'guide' || b.mode === 'lock')) { this.drawBeamSubtle(ctx, t, b); return; }
      ctx.save();
      ctx.lineCap = 'round';
      if (b.mode === 'guide' || b.mode === 'lock') {
        const lock = b.mode === 'lock';
        const a = lock ? 0.9 : 0.42 + 0.25 * Math.abs(Math.sin(t * 22));   // the tracking guide must read at 1280×720
        ctx.strokeStyle = 'rgba(255,226,150,' + a.toFixed(3) + ')'; ctx.lineWidth = lock ? 3 : 2;
        if (!lock) { ctx.setLineDash([16, 10]); ctx.lineDashOffset = -t * 160; }
        ctx.beginPath(); ctx.moveTo(b.x0, b.y0); ctx.lineTo(b.x1, b.y1); ctx.stroke();
        ctx.setLineDash([]);
        if (lock) {
          const nx = -Math.sin(b.a) * b.half, ny = Math.cos(b.a) * b.half;
          ctx.strokeStyle = 'rgba(255,220,140,0.35)'; ctx.lineWidth = 1.5;
          ctx.beginPath(); ctx.moveTo(b.x0 + nx, b.y0 + ny); ctx.lineTo(b.x1 + nx, b.y1 + ny); ctx.moveTo(b.x0 - nx, b.y0 - ny); ctx.lineTo(b.x1 - nx, b.y1 - ny); ctx.stroke();
        }
        glow(ctx, b.x0, b.y0, lock ? 46 : 30, '#fff2c8', lock ? 0.9 : 0.6);
        glow(ctx, b.x1, b.y1, 26, '#ffe2a0', 0.5);
      } else {
        ctx.globalCompositeOperation = 'lighter';
        const fl = 0.85 + 0.15 * Math.sin(t * 60);
        for (const [w, c] of [[b.half * 2 + 14, 'rgba(255,200,90,0.28)'], [b.half * 2, 'rgba(255,232,160,0.75)'], [b.half * 0.9 * fl, 'rgba(255,255,250,0.95)']]) {
          ctx.strokeStyle = c; ctx.lineWidth = w;
          ctx.beginPath(); ctx.moveTo(b.x0, b.y0); ctx.lineTo(b.x1, b.y1); ctx.stroke();
        }
        ctx.globalCompositeOperation = 'source-over';
        glow(ctx, b.x0, b.y0, 70, '#ffffff', 0.9);
        glow(ctx, b.x1, b.y1, 60, '#fff2c8', 0.9);
      }
      ctx.restore();
    }
    /** Standard / hardcore beam tell: the light gathering at the staff / heart (on the attacker) through the whole
     *  wind-up; the tracking guide is gone. KEPT-SUBTLE: the locked lance's line (lances only, not the sweep) as a
     *  thin faint line for the 0.45-s lock — see the docs for why. */
    drawBeamSubtle(ctx, t, b) {
      const lock = b.mode === 'lock';
      if (lock && !b.sweep) {
        ctx.save();
        ctx.lineCap = 'round';
        ctx.strokeStyle = 'rgba(255,226,150,' + (0.42 + 0.14 * Math.abs(Math.sin(t * 26))).toFixed(3) + ')'; ctx.lineWidth = 2;
        ctx.beginPath(); ctx.moveTo(b.x0, b.y0); ctx.lineTo(b.x1, b.y1); ctx.stroke();
        ctx.restore();
      }
      glow(ctx, b.x0, b.y0, lock ? 50 : 34, '#fff2c8', lock ? 0.95 : 0.55 + 0.2 * Math.abs(Math.sin(t * 12)));
      if (lock) glow(ctx, b.x0, b.y0, 20, '#ffffff', 0.9);
    }
    drawWedge(ctx, t, w, tele) {
      const room = this.room;
      ctx.save();
      const steps = 22;
      const pts = [];
      for (const sgn of [-1, 1]) {
        for (let i = 0; i <= steps; i++) {
          const a = w.base + sgn * (w.max * i / steps) * (w.mode === 'down' ? 1 : -1);
          pts.push([a, castLen(room, w.x, w.y, a, 2600)]);
        }
      }
      if (tele === false) {
        // KEPT-SUBTLE (standard / hardcore): no tinted area, only the two outer edges (where the lasers stop) as
        // thin faint lines — the safe horizon of a 2-damage sweep cannot be read from the heart alone
        ctx.strokeStyle = 'rgba(255,236,180,' + (0.36 + 0.14 * Math.abs(Math.sin(t * 8))).toFixed(3) + ')'; ctx.lineWidth = 2;
        ctx.setLineDash([6, 12]); ctx.lineDashOffset = t * 80;
        for (const h of [0, 1]) { const [a, L] = pts[h * (steps + 1) + steps]; ctx.beginPath(); ctx.moveTo(w.x, w.y); ctx.lineTo(w.x + Math.cos(a) * L, w.y + Math.sin(a) * L); ctx.stroke(); }
        ctx.setLineDash([]);
        ctx.restore();
        return;
      }
      // fill both halves (tinted area that will be swept)
      const alpha = (w.th == null ? 0.05 + 0.1 * w.k : 0.08);
      ctx.fillStyle = 'rgba(255,224,150,' + alpha.toFixed(3) + ')';
      for (let h = 0; h < 2; h++) {
        ctx.beginPath(); ctx.moveTo(w.x, w.y);
        for (let i = 0; i <= steps; i++) { const [a, L] = pts[h * (steps + 1) + i]; ctx.lineTo(w.x + Math.cos(a) * L, w.y + Math.sin(a) * L); }
        ctx.closePath(); ctx.fill();
      }
      // the outer edges (where the lasers stop): bright dashed lines = the safe horizon
      ctx.strokeStyle = 'rgba(255,236,180,' + (0.45 + 0.35 * Math.abs(Math.sin(t * 8))).toFixed(3) + ')'; ctx.lineWidth = 2.5;
      ctx.setLineDash([12, 9]); ctx.lineDashOffset = t * 80;
      for (const h of [0, 1]) { const [a, L] = pts[h * (steps + 1) + steps]; ctx.beginPath(); ctx.moveTo(w.x, w.y); ctx.lineTo(w.x + Math.cos(a) * L, w.y + Math.sin(a) * L); ctx.stroke(); }
      ctx.setLineDash([]);
      ctx.restore();
    }
    drawLanes(ctx, t, L, tele) {
      const A = this.A, cx = A.mid, cy = A.floorY - NUM.PULSE_H, room = this.room;
      ctx.save();
      for (const g of L.gaps) {
        const a0 = g - NUM.GAP / 2, a1 = g + NUM.GAP / 2;
        const l0 = castLen(room, cx, cy, a0, 2400), l1 = castLen(room, cx, cy, a1, 2400), lm = castLen(room, cx, cy, g, 2400);
        if (tele === false) {
          // KEPT-SUBTLE (standard / hardcore): the dark corridor of each gap with thin faint solid edges; no dashes,
          // no floor marker, no lights — in the pulse's near-darkness the rings' gaps cannot be extrapolated in time
          ctx.fillStyle = 'rgba(8,6,20,' + (0.2 + 0.15 * L.k).toFixed(3) + ')';
          ctx.beginPath(); ctx.moveTo(cx, cy); ctx.lineTo(cx + Math.cos(a0) * l0, cy + Math.sin(a0) * l0); ctx.lineTo(cx + Math.cos(g) * lm, cy + Math.sin(g) * lm); ctx.lineTo(cx + Math.cos(a1) * l1, cy + Math.sin(a1) * l1); ctx.closePath(); ctx.fill();
          ctx.strokeStyle = 'rgba(255,232,170,' + (0.3 + 0.2 * L.k).toFixed(3) + ')'; ctx.lineWidth = 2;
          ctx.beginPath(); ctx.moveTo(cx, cy); ctx.lineTo(cx + Math.cos(a0) * l0, cy + Math.sin(a0) * l0); ctx.moveTo(cx, cy); ctx.lineTo(cx + Math.cos(a1) * l1, cy + Math.sin(a1) * l1); ctx.stroke();
          continue;
        }
        ctx.fillStyle = 'rgba(8,6,20,' + (0.25 + 0.2 * L.k).toFixed(3) + ')';
        ctx.beginPath(); ctx.moveTo(cx, cy); ctx.lineTo(cx + Math.cos(a0) * l0, cy + Math.sin(a0) * l0); ctx.lineTo(cx + Math.cos(g) * lm, cy + Math.sin(g) * lm); ctx.lineTo(cx + Math.cos(a1) * l1, cy + Math.sin(a1) * l1); ctx.closePath(); ctx.fill();
        ctx.strokeStyle = 'rgba(255,232,170,' + (0.55 + 0.4 * L.k).toFixed(3) + ')'; ctx.lineWidth = 3;
        ctx.setLineDash([14, 10]); ctx.lineDashOffset = -t * 120;
        ctx.beginPath(); ctx.moveTo(cx, cy); ctx.lineTo(cx + Math.cos(a0) * l0, cy + Math.sin(a0) * l0); ctx.moveTo(cx, cy); ctx.lineTo(cx + Math.cos(a1) * l1, cy + Math.sin(a1) * l1); ctx.stroke();
        ctx.setLineDash([]);
        // where the lane meets a surface: a bright marker of the safe span
        const ex0 = cx + Math.cos(a0) * l0, ey0 = cy + Math.sin(a0) * l0, ex1 = cx + Math.cos(a1) * l1, ey1 = cy + Math.sin(a1) * l1;
        if (Math.abs(ey0 - ey1) < 6) {
          const al = 0.45 + 0.45 * L.k + 0.1 * Math.sin(t * 14);
          ctx.fillStyle = 'rgba(255,236,180,' + al.toFixed(3) + ')';
          ctx.fillRect(Math.min(ex0, ex1) + 6, ey0 - 3, Math.abs(ex1 - ex0) - 12, 3);
          for (const ex of [ex0, ex1]) { ctx.beginPath(); ctx.moveTo(ex, ey0 - 14); ctx.lineTo(ex + 5, ey0 - 3); ctx.lineTo(ex - 5, ey0 - 3); ctx.closePath(); ctx.fill(); }
          glow(ctx, (ex0 + ex1) / 2, ey0 - 4, Math.abs(ex1 - ex0) * 0.45, '#ffe2a0', 0.25 + 0.25 * L.k);
        }
        for (let s = 160; s < lm; s += 260) light({ x: cx + Math.cos(a0) * s, y: cy + Math.sin(a0) * s, r: 70, color: '#ffe2a0', intensity: 0.35, glow: false });
      }
      ctx.restore();
    }
    drawRing(ctx, t, h) {
      ctx.save();
      ctx.globalCompositeOperation = 'lighter';
      const segs = [];
      const gs = h.gaps.slice().sort((a, b) => a - b);
      for (let i = 0; i < gs.length; i++) {
        const a0 = gs[i] + NUM.GAP / 2, a1 = (i + 1 < gs.length ? gs[i + 1] : gs[0] + TAU) - NUM.GAP / 2;
        if (a1 > a0) segs.push([a0, a1]);
      }
      for (const [w, c] of [[NUM.RING_BAND + 16, 'rgba(255,200,100,0.25)'], [NUM.RING_BAND, 'rgba(255,236,170,0.7)'], [NUM.RING_BAND * 0.4, 'rgba(255,255,250,0.95)']]) {
        ctx.strokeStyle = c; ctx.lineWidth = w;
        for (const [a0, a1] of segs) { ctx.beginPath(); ctx.arc(h.x, h.y, h.r, a0, a1); ctx.stroke(); }
      }
      ctx.globalCompositeOperation = 'source-over';
      ctx.restore();
    }
    drawSpike(ctx, t, h) {
      const x = h.x, y = h.y, W = NUM.SPIKE_W;
      ctx.save();
      if (h.t < h.warn) {
        // telegraph: a dark glowing fissure across the surface, crystal tips pushing through, the column to come
        const k = h.t / h.warn;
        const a = 0.55 + 0.4 * k + 0.1 * Math.sin(t * 30);
        const hw = W * 0.62;
        glow(ctx, x, y - 4, W * (0.8 + 0.6 * k), '#fff0c0', 0.5 + 0.4 * k);
        // the column the spike will fill: faint fill + bright edges fading upward (easy only; standard keeps the
        // fissure, the crystal tips pushing through, the sparks and the crack's glow — diegetic precursors)
        if (teleOn()) {
          const gr = ctx.createLinearGradient(0, y, 0, y - NUM.SPIKE_H);
          gr.addColorStop(0, 'rgba(255,240,200,' + (0.26 + 0.38 * k).toFixed(3) + ')');
          gr.addColorStop(1, 'rgba(255,240,200,0)');
          ctx.fillStyle = gr;
          ctx.fillRect(x - W / 2 + 6, y - NUM.SPIKE_H, W - 12, NUM.SPIKE_H);
          ctx.fillRect(x - W / 2 + 6, y - NUM.SPIKE_H, 2, NUM.SPIKE_H);
          ctx.fillRect(x + W / 2 - 8, y - NUM.SPIKE_H, 2, NUM.SPIKE_H);
        }
        // fissure (cut into the surface)
        ctx.beginPath(); ctx.moveTo(x - hw, y);
        for (let i = 1; i < 8; i++) ctx.lineTo(x - hw + i * hw / 4, y + 2 + ((i * 5 + h.seed * 3) % 4));
        ctx.lineTo(x + hw, y);
        for (let i = 7; i > 0; i--) ctx.lineTo(x - hw + i * hw / 4, y - 3 - ((i * 3 + h.seed) % 3) * k);
        ctx.closePath();
        ctx.fillStyle = COL.outline; ctx.fill();
        ctx.strokeStyle = 'rgba(255,244,208,' + a.toFixed(3) + ')'; ctx.lineWidth = 2;
        ctx.beginPath(); ctx.moveTo(x - hw + 4, y);
        for (let i = 1; i < 8; i++) ctx.lineTo(x - hw + i * hw / 4, y - ((i * 7 + h.seed * 3) % 3));
        ctx.lineTo(x + hw - 4, y);
        ctx.stroke();
        // crystal tips pushing through
        const tip = 4 + 14 * smooth(k);
        for (const [dx, hk] of [[0, 1], [-15, 0.65], [15, 0.75]]) {
          const th = tip * hk, tw = 7 + 4 * hk;
          ctx.beginPath(); ctx.moveTo(x + dx - tw / 2, y); ctx.lineTo(x + dx, y - th); ctx.lineTo(x + dx + tw / 2, y); ctx.closePath();
          ctx.fillStyle = COL.crystal; ctx.fill(); ctx.strokeStyle = COL.outline; ctx.lineWidth = 1.5; ctx.stroke();
        }
        if (Math.random() < 0.3) burst('spark', x + rnd(-W / 2, W / 2), y - 4, { count: 1, color: '#fff2c8', speed: 90, angle: -Math.PI / 2, spread: 0.6 });
      } else {
        const e = h.t - h.warn;
        const rise = clamp(e / NUM.SPIKE_RISE, 0, 1), fall = clamp((e - NUM.SPIKE_RISE - NUM.SPIKE_HOLD) / 0.3, 0, 1);
        const H = NUM.SPIKE_H * smooth(rise) * (1 - fall * 0.6);
        ctx.globalAlpha *= 1 - fall;
        glow(ctx, x, y - H * 0.5, W * 1.4, '#fff0c0', 0.6);
        const shards = [[0, 1, 0.42], [-17, 0.62, 0.3], [17, 0.7, 0.28], [-29, 0.36, 0.2], [27, 0.4, 0.2]];
        for (const [dx, hk, wk] of shards) {
          const sh = H * hk, sw = W * wk, lean = dx * 0.18;
          ctx.beginPath(); ctx.moveTo(x + dx - sw / 2, y); ctx.lineTo(x + dx + lean, y - sh); ctx.lineTo(x + dx + sw / 2, y); ctx.closePath();
          ctx.fillStyle = COL.crystal; ctx.fill();
          ctx.strokeStyle = COL.outline; ctx.lineWidth = 2; ctx.stroke();
          ctx.beginPath(); ctx.moveTo(x + dx + lean, y - sh); ctx.lineTo(x + dx + sw * 0.1, y); ctx.lineTo(x + dx + sw / 2, y); ctx.closePath();
          ctx.fillStyle = COL.crystalShade; ctx.fill();
          ctx.strokeStyle = 'rgba(255,255,255,0.8)'; ctx.lineWidth = 1.2;
          ctx.beginPath(); ctx.moveTo(x + dx - sw * 0.25, y - 4); ctx.lineTo(x + dx + lean * 0.9, y - sh * 0.9); ctx.stroke();
        }
      }
      ctx.restore();
    }
    drawEndingFX(ctx, t) {
      const E = this.ending; if (!E) return;
      for (const sp of E.sparks) {
        glow(ctx, sp.x, sp.y, 26, '#bfe3ff', 0.9);
        flame(ctx, sp.x, sp.y + 6, 14, 'blue', t, sp.a * 10, { glow: 0.5 });
      }
      if (E.id !== 'gutterlight' && E.stream > 0 && E.stream < 1) {
        const A = this.A, p = playerOf();
        if (p) {
          const x0 = p.x + p.w / 2, y0 = p.y + 8, x1 = A.mid, y1 = A.heartY;
          ctx.save();
          ctx.globalCompositeOperation = 'lighter';
          ctx.strokeStyle = 'rgba(140,200,255,' + (0.5 * Math.sin(E.stream * Math.PI)).toFixed(3) + ')'; ctx.lineWidth = 10;
          ctx.beginPath(); ctx.moveTo(x0, y0); ctx.quadraticCurveTo((x0 + x1) / 2, Math.min(y0, y1) - 160, x1, y1); ctx.stroke();
          ctx.strokeStyle = 'rgba(230,246,255,0.8)'; ctx.lineWidth = 3; ctx.stroke();
          ctx.globalCompositeOperation = 'source-over';
          ctx.restore();
        }
      }
    }
  }
  G.Boss.register('lucerne', Lucerne);

  // a timer-free guard (the game is stepped headlessly in tests): returns a marker only
  function setTimeoutSafe(sec) { return { at: (G.game && G.game.t) || 0, sec }; }
  /** Runs fn with G.Audio.music() calls swallowed (the arena's region-music restore at her defeat); always restored. */
  function withoutMusicRestore(fn) {
    const A = G.Audio;
    if (!A || typeof A.music !== 'function') return fn();
    const orig = A.music;
    A.music = function () {};
    try { return fn(); } finally { A.music = orig; }
  }

  // ---------------------------------------------------------------------------------------------------------
  // Room script 'lucerne_heart' (hs_03): the Everlantern (cage + First Flame), the chains/stilts that hold the
  // platform pyramid, Lucerne waiting before it, the chain of her phase-2 heart, and the cage after the ending.
  // ---------------------------------------------------------------------------------------------------------
  const CAGE = { w: 1000, h: 470 };
  let cageCache = null, cageBroken = null;
  function cageCanvas(broken) {
    if (broken ? cageBroken : cageCache) return broken ? cageBroken : cageCache;
    if (!G.U || !G.U.makeCanvas) return null;
    const { canvas, ctx } = G.U.makeCanvas(CAGE.w, CAGE.h);
    const cx = CAGE.w / 2, top = 6, bot = CAGE.h - 20;
    // silhouette half-width at height y (a tall bell: narrow crown, wide shoulders, gathered base)
    const half = (y) => { const k = (y - top) / (bot - top); return 480 * Math.pow(Math.sin(Math.PI * clamp(0.08 + k * 0.84, 0, 1)), 0.7) * (0.55 + 0.45 * Math.min(1, k * 2.2)); };
    let seed = 7; const R = () => { seed = (seed * 16807) % 2147483647; return seed / 2147483647; };
    // glass panes
    ctx.fillStyle = broken ? 'rgba(255,236,190,0.03)' : 'rgba(255,236,190,0.07)';
    ctx.beginPath(); ctx.moveTo(cx, top);
    for (let y = top; y <= bot; y += 6) ctx.lineTo(cx + half(y), y);
    for (let y = bot; y >= top; y -= 6) ctx.lineTo(cx - half(y), y);
    ctx.closePath(); ctx.fill();
    // vertical bars
    const n = 17;
    for (let i = 0; i < n; i++) {
      const s = -1 + 2 * i / (n - 1), front = Math.abs(s) < 0.92;
      const brk = broken ? (R() < 0.75 ? lerp(0.25, 0.85, R()) : 1.1) : 1.1;
      ctx.beginPath();
      let started = false;
      for (let y = top; y <= bot; y += 5) {
        const k = (y - top) / (bot - top);
        if (k > brk) break;
        const x = cx + Math.sin(s * Math.PI / 2) * half(y);
        if (!started) { ctx.moveTo(x, y); started = true; } else ctx.lineTo(x, y);
      }
      const wdt = front ? 9 : 6;
      ctx.lineCap = 'round';
      ctx.strokeStyle = '#2a1e0a'; ctx.lineWidth = wdt + 4; ctx.stroke();
      ctx.strokeStyle = Math.abs(s) < 0.3 ? '#e8c878' : '#b08a40'; ctx.lineWidth = wdt; ctx.stroke();
      ctx.strokeStyle = 'rgba(255,248,220,0.55)'; ctx.lineWidth = 1.6; ctx.stroke();
      if (broken && brk < 1) {
        // a bent, broken stub
        const y = top + brk * (bot - top), x = cx + Math.sin(s * Math.PI / 2) * half(y);
        ctx.strokeStyle = '#b08a40'; ctx.lineWidth = wdt - 2;
        ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x + s * 30 + (R() - 0.5) * 20, y + 26); ctx.stroke();
      }
    }
    // rings
    for (const k of [0.16, 0.48, 0.8, 1]) {
      if (broken && k > 0.4) continue;
      const y = top + k * (bot - top), hw = half(y);
      ctx.strokeStyle = '#2a1e0a'; ctx.lineWidth = 11;
      ctx.beginPath(); ctx.ellipse(cx, y, hw, 16, 0, 0, Math.PI); ctx.stroke();
      ctx.strokeStyle = '#d8b060'; ctx.lineWidth = 7; ctx.stroke();
      ctx.strokeStyle = 'rgba(255,246,210,0.6)'; ctx.lineWidth = 2; ctx.stroke();
    }
    // the crown cap where the cage meets the vault
    ctx.fillStyle = '#c89c48';
    ctx.beginPath(); ctx.moveTo(cx - 120, top + 30); ctx.quadraticCurveTo(cx, top - 30, cx + 120, top + 30); ctx.lineTo(cx + 90, top + 44); ctx.lineTo(cx - 90, top + 44); ctx.closePath(); ctx.fill();
    ctx.strokeStyle = '#2a1e0a'; ctx.lineWidth = 3; ctx.stroke();
    for (let i = -3; i <= 3; i++) { ctx.fillStyle = '#ffe8a8'; ctx.beginPath(); ctx.moveTo(cx + i * 30 - 6, top + 30); ctx.lineTo(cx + i * 30, top + 6 - (3 - Math.abs(i)) * 6); ctx.lineTo(cx + i * 30 + 6, top + 30); ctx.closePath(); ctx.fill(); ctx.stroke(); }
    // the heart socket (a smaller globe cage around the First Flame)
    if (!broken) {
      const hy = CAGE.h - 220 - 0, hr = 92;
      ctx.strokeStyle = '#2a1e0a'; ctx.lineWidth = 8;
      ctx.beginPath(); ctx.ellipse(cx, hy, hr, hr * 1.1, 0, 0, TAU); ctx.stroke();
      ctx.strokeStyle = '#e8c878'; ctx.lineWidth = 4; ctx.stroke();
      for (let i = 0; i < 6; i++) { const s = -1 + 2 * i / 5; ctx.beginPath(); ctx.ellipse(cx, hy, Math.abs(Math.sin(s * Math.PI / 2)) * hr + 0.1, hr * 1.1, 0, -Math.PI / 2, Math.PI / 2, s < 0); ctx.strokeStyle = '#2a1e0a'; ctx.lineWidth = 5; ctx.stroke(); ctx.strokeStyle = '#d8b060'; ctx.lineWidth = 2.5; ctx.stroke(); }
      // heart chain down to the socket's base
      ctx.strokeStyle = '#b08a40'; ctx.lineWidth = 4;
      ctx.beginPath(); ctx.moveTo(cx, hy + hr * 1.1); ctx.lineTo(cx, bot); ctx.stroke();
    } else {
      // glass shards caught in the bars
      for (let i = 0; i < 40; i++) { const x = cx + (R() - 0.5) * 760, y = top + 60 + R() * 300; ctx.fillStyle = 'rgba(255,240,200,' + (0.2 + R() * 0.4).toFixed(2) + ')'; ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x + 6 + R() * 10, y + 4); ctx.lineTo(x + R() * 4, y + 10 + R() * 12); ctx.closePath(); ctx.fill(); }
    }
    if (broken) cageBroken = canvas; else cageCache = canvas;
    return canvas;
  }

  G.Events.lucerne_heart = {
    init(e) {
      e.cull = false;
      const arena = e.room.findType ? e.room.findType('arena')[0] : null;
      const bx = arena && arena.props && arena.props.bx != null ? arena.props.bx : Math.floor(e.room.cols * 0.7);
      e.data.bx = bx;
      e.data.A = arenaGeom(e.room, bx * TILE + TILE / 2);
      e.data.pz = qpose(QPOSES.pray);
      e.data.seed = 5;
    },
    boss(e) { const r = e.room; if (!r) return null; for (const b of r.entities) if (b.type === 'boss_lucerne' && !b.dead) return b; return null; },
    state(e) {
      const pr = G.game && G.game.progress;
      const R = e.data.rematch;
      // in a rematch the saved defeat is ignored: she is 'won' only once this visit's arena is done
      const won = R ? R.state === 'done' : !!(G.game && G.game.bossDefeated && G.game.bossDefeated('lucerne'));
      const b = this.boss(e);
      const E = b && b.ending;
      const ending = R ? (won && G.game.endingId ? G.game.endingId() : null) : ((pr && pr.ending) || (won && G.game.endingId ? G.game.endingId() : null));
      return { b, E, won, ending, form2: !!(b && b.form === 2) };
    },
    /**
     * Rematch: a completed save whose ending would now differ (finished 'undying', has since gathered all 6 sparks)
     * may face her again, so the true ending stays reachable on that slot (QA softlock: the hall used to stay empty
     * forever). The saved defeat/completion is left untouched (completion %, boss list); only this visit's arena is
     * re-armed ('done' → 'wait') and judges victory by this fight's boss instead of the saved flag. Winning plays the
     * new ending (G.game.finishGame); leaving/dying keeps the save as it was and re-arms on the next visit.
     */
    rematchDue() {
      const g = G.game, pr = g && g.progress;
      return !!(pr && pr.completed && pr.ending && typeof g.endingId === 'function' && g.endingId() !== pr.ending &&
        g.bossDefeated && g.bossDefeated('lucerne'));
    },
    rearm(e) {
      const d = e.data;
      if (d.rematch !== undefined) return;
      const ar = e.room.findType ? e.room.findType('arena')[0] : null;
      if (!ar || ar.state !== 'done' || this.boss(e) || !this.rematchDue()) { if (ar && ar.state !== 'done') d.rematch = null; return; }
      Object.defineProperty(ar, 'defeated', { configurable: true, get() { return !!(this.boss && this.boss._finished); } });
      ar.setState('wait');
      d.rematch = ar;
    },
    /**
     * Recovery: she is defeated (flag saved at the start of the ending beat) but the game was never completed — the
     * player quit or closed the game during the beat. Entering the hall then plays the ending instead of leaving a
     * finished world with no way to finish the game.
     */
    resumeEnding(e, dt, S) {
      const g = G.game, pr = g && g.progress;
      if (!S.won || S.b || !pr || pr.completed || g.mode !== 'play' || !g.player || g.player.room !== e.room) return;
      const d = e.data;
      d.resumeT = (d.resumeT || 0) + dt;
      if (d.resumeT < 1.2) return;
      const go = () => {
        if (d.went) return;
        d.went = true;
        if (g.unlockPlayer) g.unlockPlayer('lucerne_end');
        try { g.finishGame(g.endingId ? g.endingId() : undefined); } catch (err) { G.reportError(err, 'lucerne resume ending'); }
      };
      if (!d.resumed) {
        d.resumed = true; d.guardAt = g.t;
        if (g.lockPlayer) g.lockPlayer('lucerne_end');
        sfx('lucerne_pull', e.room.widthPx / 2, { vol: 0.6 });
        if (typeof g.fade === 'function') g.fade(1, 1.6, go); else go();
      } else if (g.t - d.guardAt > 4.5) go();
    },
    update(e, dt) {
      const A = e.data.A; if (!A) return;
      this.rearm(e);
      const S = this.state(e);
      this.resumeEnding(e, dt, S);
      const hx = A.mid, hy = A.heartY;
      const broken = (S.E && S.E.shatter) || (!S.b && S.won && S.ending === 'gutterlight');
      const blue = (S.E && S.E.blue > 0.5) || (!S.b && S.won && S.ending !== 'gutterlight');
      if (S.form2 && !S.E) light({ x: hx, y: hy, r: 260, color: '#ffd890', intensity: 0.3 });
      else if (broken) light({ x: hx, y: hy, r: 700, color: '#ffffff', intensity: 0.8 });
      else if (blue) light({ x: hx, y: hy, r: 420, color: COL.blue, intensity: 0.65 });
      else light({ x: hx, y: hy, r: 520, color: '#fff2c8', intensity: 0.75, flicker: true });
      light({ x: hx, y: A.anchorY - 60, r: 600, color: '#ffd890', intensity: 0.22 });
      // the waiting queen
      if (!S.b && !S.won && this.waiting(e)) { const x = e.data.bx * TILE + TILE / 2; light({ x, y: A.floorY - 120, r: 260, color: '#ffe2a0', intensity: 0.55 }); }
    },
    waiting(e) { const ar = e.room.findType ? e.room.findType('arena')[0] : null; return !ar || ar.state === 'wait' || ar.state === 'beat'; },
    draw(e, ctx, t) {
      const A = e.data.A; if (!A) return;
      const S = this.state(e);
      const hx = A.mid, hy = A.heartY;
      const E = S.E;
      const broken = (E && E.shatter) || (!S.b && S.won && S.ending === 'gutterlight');
      const blue = (E && E.blue) || (!S.b && S.won && S.ending !== 'gutterlight' ? 1 : 0);
      // supports: crystal stilts under the low decks, gold chains from the cage to the high decks
      for (const d of A.decks) {
        const below = A.floorY - d.y;
        if (below <= 4) continue;
        if (d.y > A.anchorY + 420) {
          for (const x of [d.x0 + 22, d.x1 - 22]) crystalStilt(ctx, x, d.y + 10, A.floorY);
        } else {
          for (const x of [d.x0 + 14, d.x1 - 14]) chain(ctx, x, Math.min(d.y, A.anchorY - 10), x, d.y + 2, t, 0.85);
        }
      }
      // the cage
      const cv = cageCanvas(!!broken);
      const top = A.anchorY - CAGE.h + 20;
      const glowK = S.form2 && !E ? 1 : 0.6;
      glow(ctx, hx, hy, 560, '#ffd890', (broken ? 0.2 : 0.22) * glowK + (S.form2 ? 0.08 : 0));
      if (cv) {
        ctx.save();
        ctx.globalAlpha *= 0.92;
        ctx.drawImage(cv, hx - CAGE.w / 2, top);
        if (S.form2 && !broken) {
          ctx.globalCompositeOperation = 'lighter';
          ctx.globalAlpha = 0.25 + 0.15 * Math.sin(t * 3);
          ctx.drawImage(cv, hx - CAGE.w / 2, top);
          ctx.globalCompositeOperation = 'source-over';
        }
        ctx.restore();
      }
      // cracks spreading over the cage (gutterlight ending)
      if (E && E.crack > 0 && !E.shatter) {
        ctx.save();
        ctx.strokeStyle = 'rgba(255,255,255,0.9)'; ctx.lineWidth = 2.5;
        const n = Math.ceil(E.crack * 14);
        for (let i = 0; i < n; i++) {
          let a = i * 2.39996, x = hx + Math.cos(a) * 40, y = hy + Math.sin(a) * 40;
          ctx.beginPath(); ctx.moveTo(x, y);
          for (let j = 0; j < 6 * E.crack + 1; j++) { a += Math.sin(i * 5 + j * 2) * 0.5; x += Math.cos(a) * 46; y += Math.sin(a) * 34; ctx.lineTo(x, y); }
          ctx.stroke();
        }
        glow(ctx, hx, hy, 300 + 300 * E.crack, '#ffffff', 0.5 * E.crack);
        ctx.restore();
      }
      // the heart: the First Flame (white), gone into her lantern in phase 2, blue in the undying ending, free after
      if (broken) {
        const k = E ? E.flame : 1;
        glow(ctx, hx, hy, 300 + 200 * k, '#ffffff', 0.85);
        flame(ctx, hx, hy + 120, 220 + 120 * k, 'white', t, 3, { glow: 1 });
      } else if (!(S.form2 && !E)) {
        const open = E ? E.open : 0;
        const fk = 1 - open * 0.7;
        glow(ctx, hx, hy, 220, blue > 0.5 ? COL.blue : '#fff2c8', 0.8 * Math.max(fk, blue));
        flame(ctx, hx, hy + 60, (blue > 0.5 ? 90 : 120) * Math.max(fk, blue * 0.9), blue > 0.5 ? 'blue' : 'white', t, 3, { glow: 0.8 });
      } else {
        glow(ctx, hx, hy, 140, '#ffd890', 0.35);
      }
      // the chain of her phase-2 heart
      if (S.b && S.b.form === 2) chain(ctx, hx, A.anchorY - 30, S.b.cx, S.b.cy - 150, t, 1);
      if (S.b && S.b.form === 2 && !E) glow(ctx, S.b.cx, S.b.cy, 260 + 80 * S.b.lp.flare, '#fff2c8', 0.45 * (1 - S.b.lp.dim * 0.7));
      // Lucerne waiting before the Everlantern
      if (!S.b && !S.won && this.waiting(e)) {
        const x = e.data.bx * TILE + TILE / 2;
        drawQueen(ctx, x, A.floorY - 8, { f: x > hx ? -1 : 1, pz: e.data.pz, t, seed: e.data.seed });
      }
    },
  };
  function chain(ctx, x0, y0, x1, y1, t, a) {
    const L = Math.hypot(x1 - x0, y1 - y0); if (L < 4) return;
    const n = Math.max(2, Math.floor(L / 14)), ux = (x1 - x0) / L, uy = (y1 - y0) / L;
    ctx.save();
    ctx.globalAlpha *= a == null ? 1 : a;
    ctx.lineWidth = 3;
    for (let i = 0; i < n; i++) {
      const k = (i + 0.5) / n, x = lerp(x0, x1, k), y = lerp(y0, y1, k);
      ctx.strokeStyle = i % 2 ? '#8a6a2a' : '#c8a050';
      ctx.beginPath();
      if (i % 2) ctx.ellipse(x, y, 2.5, 7, Math.atan2(uy, ux) + Math.PI / 2, 0, TAU);
      else ctx.ellipse(x, y, 5, 7, Math.atan2(uy, ux) + Math.PI / 2, 0, TAU);
      ctx.stroke();
    }
    ctx.restore();
    void t;
  }
  function crystalStilt(ctx, x, y0, y1) {
    const w = 16;
    ctx.save();
    ctx.fillStyle = '#5e4c28';
    ctx.beginPath(); ctx.moveTo(x - w / 2, y1); ctx.lineTo(x - w / 2 + 3, y0); ctx.lineTo(x + w / 2 - 3, y0); ctx.lineTo(x + w / 2, y1); ctx.closePath(); ctx.fill();
    ctx.fillStyle = 'rgba(255,240,200,0.35)'; ctx.fillRect(x - w / 2 + 4, y0, 3, y1 - y0);
    ctx.strokeStyle = '#1a1206'; ctx.lineWidth = 2; ctx.stroke();
    ctx.fillStyle = '#c8a050';
    for (const k of [0.15, 0.6]) { const y = lerp(y0, y1, k); ctx.fillRect(x - w / 2 - 3, y, w + 6, 6); }
    ctx.restore();
  }

  // ---------------------------------------------------------------------------------------------------------
  // Test hooks
  // ---------------------------------------------------------------------------------------------------------
  G.Lucerne = { NUM, COL, QPOSES, geom: arenaGeom, surfaceBelow, beamTouches, Lucerne, drawQueen, drawLantern };
})();
