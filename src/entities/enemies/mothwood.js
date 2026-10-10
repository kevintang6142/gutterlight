// src/entities/enemies/mothwood.js — the Mothwood's enemies (module: enemies-mothwood).
//   dusk_moth       large dusky moth: circles above the Wickling, rears up and dives in a curved swoop; every third
//                   attack it shivers and flings a fan of glittering wing-scales (slow, fluttering, destroyable)
//   cocoon_spawner  hanging (or wall-glued) brood cocoon: swells and releases 1-2 mothlings (max 3 alive); kill it to stop them
//   mothling        (minion kind, spawned by cocoon_spawner; also usable by bosses) tiny flitting moth, buzzes then darts
//   dust_maw        ambush: a heap of grey moth-dust that trembles, erupts as a gaping maw, bites up/forward, gapes, sinks
//   moth_knight     dusty-winged duelist: dash-in + two-cut combo + hop back; now and then a short flying lunge
// Placement guide: docs/api/enemies-mothwood.md. Test hooks: G.MothwoodEnemies.
(function () {
  'use strict';
  const G = globalThis.G;
  if (!G || !G.Enemy) return;
  const TILE = G.CONST.TILE;
  const TAU = Math.PI * 2;
  const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
  const lerp = (a, b, k) => a + (b - a) * k;
  const toward = (v, target, step) => (v < target ? Math.min(target, v + step) : Math.max(target, v - step));
  const h01 = (i, s) => { const x = Math.sin(i * 127.1 + s * 311.7) * 43758.5453; return x - Math.floor(x); };
  const rnd = (a, b) => a + Math.random() * (b - a);
  const ease = (q) => (q < 0 ? 0 : q > 1 ? 1 : 1 - (1 - q) * (1 - q) * (1 - q));
  const glow = (ctx, x, y, r, c, a) => { if (G.fx && G.fx.glowAt) G.fx.glowAt(ctx, x, y, r, c, a); };
  const CH = () => (G.Art && G.Art.char) || null;
  const burst = (k, x, y, o) => { if (G.fx) G.fx.burst(k, x, y, o); };
  const fxSpawn = (o) => { if (G.fx && G.fx.spawn) G.fx.spawn(o); };
  const light = (o) => { if (G.lighting) G.lighting.add(o); };
  const sfx = (name, x, o) => { if (G.sfxAt) G.sfxAt(name, x, o); };

  // ------------------------------------------------------------------ sfx (defined only if the audio module lacks them)
  (function defineSfx() {
    const A = G.Audio;
    if (!A || typeof A.defineSfx !== 'function') return;
    const have = typeof A.sfxNames === 'function' ? A.sfxNames() : [];
    const def = (name, o) => { if (have.indexOf(name) < 0) A.defineSfx(name, o); };
    def('dusk_rear', {        // great dusty wings hauled up: two soft whumps and a powdery shimmer
      vol: 2.8, reverb: 0.3,
      play(k) {
        const v = k.r(0.94, 1.06);
        k.noise({ color: 'pink', bp: 360 * v, Q: 0.9, a: 0.03, d: 0.22, g: 0.17 });
        k.noise({ color: 'pink', bp: 290 * v, Q: 0.9, a: 0.03, d: 0.26, g: 0.15, at: 0.17 });
        k.noise({ hp: 5200, a: 0.08, d: 0.45, g: 0.03, at: 0.05 });
        k.tone({ f: 2300 * v, f1: 3100 * v, glide: 0.4, type: 'sine', a: 0.06, d: 0.35, g: 0.014, at: 0.1 });
      },
    });
    def('dusk_swoop', {       // a big wing-whoosh diving past
      vol: 3, reverb: 0.25,
      play(k) {
        const v = k.r(0.92, 1.08);
        k.noise({ color: 'pink', bp: 260 * v, bp1: 1300 * v, Q: 0.8, a: 0.12, d: 0.55, g: 0.22, sweep: 0.5 });
        k.noise({ color: 'brown', lp: 420 * v, a: 0.05, d: 0.35, g: 0.12 });
        k.noise({ hp: 6000, a: 0.1, d: 0.5, g: 0.022 });
      },
    });
    def('scale_shiver', {     // wings trembling fast: a dry flutter that rises into a shimmer
      vol: 2.4, reverb: 0.3,
      play(k) {
        const v = k.r(0.95, 1.05);
        for (let i = 0; i < 8; i++) k.noise({ color: 'pink', bp: (900 + i * 90) * v, Q: 1.2, a: 0.005, d: 0.05, g: 0.06 + i * 0.006, at: i * 0.05 });
        k.noise({ hp: 6500, a: 0.25, d: 0.25, g: 0.03 });
        k.tone({ f: 3000 * v, f1: 4200 * v, glide: 0.45, type: 'sine', a: 0.2, d: 0.2, g: 0.012 });
      },
    });
    def('scale_shed', {       // the wing snap and a cluster of glittering chimes
      vol: 2.4, reverb: 0.4,
      play(k) {
        k.noise({ color: 'pink', bp: 650, Q: 0.8, a: 0.01, d: 0.18, g: 0.16 });
        for (let i = 0; i < 5; i++) k.tone({ f: k.pick([2637, 3136, 3520, 3951, 4699]) * k.r(0.99, 1.01), type: 'triangle', a: 0.002, d: 0.28, g: 0.028, at: 0.02 + i * 0.035 });
        k.noise({ hp: 7000, a: 0.01, d: 0.4, g: 0.03 });
      },
    });
    def('cocoon_throb', {     // a wet double heartbeat inside the silk
      vol: 2.8, reverb: 0.25,
      play(k) {
        const v = k.r(0.94, 1.06);
        k.tone({ f: 74 * v, f1: 50 * v, glide: 0.22, type: 'sine', a: 0.02, d: 0.28, g: 0.24 });
        k.tone({ f: 70 * v, f1: 46 * v, glide: 0.22, type: 'sine', a: 0.02, d: 0.32, g: 0.2, at: 0.26 });
        k.noise({ color: 'brown', lp: 320 * v, a: 0.02, d: 0.25, g: 0.1 });
        k.noise({ bp: 900 * v, Q: 5, a: 0.01, d: 0.12, g: 0.03, at: 0.3 });
      },
    });
    def('cocoon_hatch', {     // silk tearing open + a soft wet pop + tiny wings
      vol: 2.8, reverb: 0.25,
      play(k) {
        const v = k.r(0.94, 1.06);
        for (let i = 0; i < 4; i++) k.noise({ bp: (2200 + i * 300) * v, Q: 1.6, a: 0.002, d: 0.04, g: 0.07, at: i * 0.025 });
        k.tone({ f: 210 * v, f1: 90 * v, glide: 0.08, type: 'sine', a: 0.003, d: 0.12, g: 0.16, at: 0.1 });
        for (let i = 0; i < 5; i++) k.noise({ color: 'pink', bp: 1500 * v, Q: 1, a: 0.003, d: 0.03, g: 0.03, at: 0.16 + i * 0.03 });
      },
    });
    def('mothling_buzz', {    // a tiny angry flutter
      vol: 2, reverb: 0.15,
      play(k) {
        const v = k.r(0.9, 1.12);
        k.tone({ f: 230 * v, type: 'sawtooth', lp: 1900, vib: { rate: 34, depth: 70 }, a: 0.03, hold: 0.25, d: 0.12, g: 0.026 });
        k.noise({ bp: 2600 * v, Q: 2, a: 0.03, hold: 0.22, d: 0.1, g: 0.02 });
      },
    });
    def('dust_stir', {        // the dust heap shudders: gritty low rumble + trickling crackle
      vol: 3, reverb: 0.2,
      play(k) {
        const v = k.r(0.92, 1.08);
        k.noise({ color: 'brown', lp: 260 * v, a: 0.08, hold: 0.2, d: 0.35, g: 0.3 });
        k.tone({ f: 46 * v, type: 'sine', a: 0.1, hold: 0.2, d: 0.3, g: 0.12 });
        for (let i = 0; i < 6; i++) k.noise({ hp: 3200, a: 0.002, d: 0.035, g: 0.04, at: 0.04 + i * 0.07 + k.r(0, 0.03) });
      },
    });
    def('maw_snap', {         // the dust maw erupts and its jaws clap shut
      vol: 3.2, reverb: 0.2,
      play(k) {
        const v = k.r(0.92, 1.08);
        k.noise({ color: 'brown', lp: 700 * v, a: 0.005, d: 0.3, g: 0.26 });
        k.noise({ hp: 1600 * v, a: 0.001, d: 0.05, g: 0.3, at: 0.08 });
        k.tone({ f: 120 * v, f1: 60 * v, glide: 0.12, type: 'triangle', a: 0.002, d: 0.2, g: 0.2, at: 0.08 });
      },
    });
    def('maw_sink', {         // dust pouring back down
      vol: 2.4, reverb: 0.2,
      play(k) {
        const v = k.r(0.94, 1.06);
        k.noise({ color: 'pink', lp: 1400 * v, lp1: 260 * v, sweep: 0.5, a: 0.04, hold: 0.15, d: 0.4, g: 0.12 });
      },
    });
    def('mknight_ready', {    // a needle-blade drawn: thin shing + wing rustle
      vol: 2.6, reverb: 0.3,
      play(k) {
        const v = k.r(0.97, 1.03);
        k.noise({ bp: 2400 * v, bp1: 6000 * v, Q: 2, a: 0.03, d: 0.2, g: 0.05, sweep: 0.2 });
        k.tone({ f: 3400 * v, type: 'triangle', a: 0.002, d: 0.45, g: 0.02, at: 0.06 });
        k.tone({ f: 4520 * v, type: 'triangle', a: 0.002, d: 0.35, g: 0.012, at: 0.07 });
        k.noise({ color: 'pink', bp: 1100 * v, Q: 1, a: 0.01, d: 0.12, g: 0.06 });
      },
    });
    def('mknight_slash', {    // a fast thin cut
      vol: 2.8, reverb: 0.2,
      play(k) {
        const v = k.r(0.94, 1.06);
        k.noise({ bp: 900 * v, bp1: 3400 * v, Q: 1.3, a: 0.01, d: 0.16, g: 0.24, sweep: 0.12 });
        k.tone({ f: 2700 * v, type: 'triangle', a: 0.002, d: 0.08, g: 0.014 });
      },
    });
    def('mknight_flare', {    // the dusty wings snap open
      vol: 2.8, reverb: 0.3,
      play(k) {
        const v = k.r(0.95, 1.05);
        k.noise({ color: 'pink', bp: 420 * v, Q: 0.9, a: 0.005, d: 0.12, g: 0.2 });
        k.noise({ color: 'pink', bp: 520 * v, Q: 0.9, a: 0.005, d: 0.12, g: 0.16, at: 0.08 });
        k.tone({ f: 95 * v, f1: 70 * v, glide: 0.1, type: 'sine', a: 0.004, d: 0.16, g: 0.12 });
        k.noise({ hp: 6000, a: 0.1, d: 0.35, g: 0.025, at: 0.05 });
      },
    });
    def('mknight_lunge', {    // a flying thrust: long whoosh with wingbeats
      vol: 3, reverb: 0.25,
      play(k) {
        const v = k.r(0.94, 1.06);
        k.noise({ bp: 500 * v, bp1: 1900 * v, Q: 1, a: 0.02, d: 0.38, g: 0.22, sweep: 0.3 });
        k.noise({ color: 'pink', bp: 380 * v, Q: 1, a: 0.005, d: 0.08, g: 0.1, at: 0.1 });
        k.noise({ color: 'pink', bp: 380 * v, Q: 1, a: 0.005, d: 0.08, g: 0.08, at: 0.2 });
      },
    });
  })();

  // ------------------------------------------------------------------ palette
  const MW = {
    outline: '#0c0912', tele: '#ffdcb0', teleHot: '#fff2dc', violet: '#b890ff', violetHot: '#e6d8ff',
    smoke: '#4a3f5c', glitter: '#eadcff',
  };

  // ------------------------------------------------------------------ shared: exit zones, beats, floors
  /** Exit zones of the enemy's room: each opening's run (±1 tile) and 3.5 tiles inward (wide N openings = open sky are
   *  skipped; S openings = pits are kept, so nothing wanders over a hole). */
  function exitZones(e) {
    const room = e.room;
    if (e._zones && e._zonesRoom === room) return e._zones;
    const out = [];
    if (room) {
      const W = room.widthPx, H = room.heightPx, D = 3.5 * TILE;
      for (const o of room.openings || []) {
        if (o.side === 'N' && o.size > 8) continue;
        const a = (o.pos - 1) * TILE, b = (o.pos + o.size + 1) * TILE;
        if (o.side === 'W') out.push({ side: 'W', x0: -1, y0: a, x1: D, y1: b });
        else if (o.side === 'E') out.push({ side: 'E', x0: W - D, y0: a, x1: W + 1, y1: b });
        else if (o.side === 'N') out.push({ side: 'N', x0: a, y0: -1, x1: b, y1: D });
        else out.push({ side: 'S', x0: a, y0: H - D, x1: b, y1: H + 1 });
      }
    }
    e._zones = out; e._zonesRoom = room;
    return out;
  }
  function inZone(e, x, y) {
    for (const z of exitZones(e)) if (x > z.x0 && x < z.x1 && y > z.y0 && y < z.y1) return z;
    return null;
  }
  /** Move a steering target out of any exit zone (toward the room interior) and inside the room. */
  function keepOut(e, x, y, margin) {
    const m = margin == null ? 30 : margin;
    for (let i = 0; i < 3; i++) {
      let z = inZone(e, x, y);
      if (!z) z = inZone(e, x - m, y) || inZone(e, x + m, y) || inZone(e, x, y - m) || inZone(e, x, y + m);
      if (!z) break;
      if (z.side === 'W') x = z.x1 + m; else if (z.side === 'E') x = z.x0 - m; else if (z.side === 'N') y = z.y1 + m; else y = z.y0 - m;
    }
    const room = e.room;
    if (room) { x = clamp(x, TILE, room.widthPx - TILE); y = clamp(y, TILE, room.heightPx - TILE); }
    return { x, y };
  }
  const pCenter = (p) => ({ x: p.x + p.w / 2, y: p.y + p.h / 2 });
  function playerInZone(e) { const p = e.player; return !!p && !!inZone(e, p.x + p.w / 2, p.y + p.h / 2); }
  function propTiles(e, name, def) { const v = +e.props[name]; return (v > 0 ? v : def) * TILE; }
  /** Ground walkers: may it take a step in dir (inside its beat, not into an exit zone, no wall/ledge/hazard)? */
  function canStep(e, dir, beat) {
    const ax = e.cx + dir * (e.w / 2 + 14);
    if (inZone(e, ax, e.cy)) return false;
    if (e.home && Math.abs(ax - e.home.x) > beat + TILE) return false;
    return !e.blockedAhead(dir);
  }
  const solidTile = (room, c, r) => G.Physics.isSolidTile(room.tileAt(c, r));
  const hazardTile = (room, c, r) => G.Physics.isHazardTile(room.tileAt(c, r));
  /** Safe floor under the point (x, footY) within maxDrop px: returns the floor y, or null (pit, hazard, exit zone). */
  function safeFloor(e, x, footY, maxDrop, halfW) {
    const room = e.room;
    if (!room) return null;
    const hw = halfW == null ? e.w / 2 - 2 : halfW;
    const cols = [Math.floor((x - hw) / TILE), Math.floor(x / TILE), Math.floor((x + hw) / TILE)];
    const r0 = Math.max(0, Math.floor((footY - 4) / TILE)), r1 = Math.floor((footY + maxDrop) / TILE);
    for (let r = r0; r <= r1; r++) {
      const c = cols[1];
      const code = room.tileAt(c, r);
      if (G.Physics.isHazardTile(code)) return null;
      if (G.Physics.isSolidTile(code) || code === G.T.PLATFORM) {
        for (const cc of cols) { if (hazardTile(room, cc, r) || hazardTile(room, cc, r - 1)) return null; }
        const fy = r * TILE;
        if (inZone(e, x, fy - TILE)) return null;
        return fy;
      }
    }
    return null;
  }

  // ================================================================== dusk_moth
  const DM = {
    fur: '#8e7a8c', furHi: '#d4c2cc', furDark: '#4c3a4e',
    fore: '#6e5a7a', foreBand: '#b8a6c6', foreEdge: '#2c2036', vein: '#4a3a58', foreTip: '#d8cae4',
    hind: '#8c6680', hindDark: '#4c3048',
    spotRing: '#e6d8f4', spotDark: '#1a1022', spotCore: '#c8a8ff',
    abdomen: '#6c5668', band: '#ad96a6', eye: '#140c1a', eyeGlint: '#ecdfff', glow: '#a782ff',
  };
  const DMW = { fore: null, hind: null };
  const FL = 58, FW = 30, HL = 42, HW = 32;   // fore / hind wing length & width
  function dmWings() {
    if (DMW.fore) return;
    const f = new Path2D();
    f.moveTo(0, -3);
    f.bezierCurveTo(FL * 0.25, -FW * 0.95, FL * 0.68, -FW * 1.15, FL * 0.98, -FW * 0.78);
    f.quadraticCurveTo(FL * 1.1, -FW * 0.52, FL * 0.98, -FW * 0.22);           // hooked (falcate) apex
    f.quadraticCurveTo(FL * 0.92, FW * 0.02, FL * 0.82, FW * 0.1);             // scalloped outer margin
    f.quadraticCurveTo(FL * 0.76, FW * 0.24, FL * 0.66, FW * 0.22);
    f.quadraticCurveTo(FL * 0.58, FW * 0.36, FL * 0.48, FW * 0.3);
    f.bezierCurveTo(FL * 0.32, FW * 0.36, FL * 0.14, FW * 0.3, 0, 4);
    f.closePath();
    const h = new Path2D();
    h.moveTo(0, 0);
    h.bezierCurveTo(HL * 0.3, -HW * 0.12, HL * 0.84, -HW * 0.06, HL * 0.96, HW * 0.34);
    h.bezierCurveTo(HL * 1.04, HW * 0.74, HL * 0.78, HW * 1.06, HL * 0.46, HW * 0.98);
    h.quadraticCurveTo(HL * 0.36, HW * 1.1, HL * 0.28, HW * 0.92);             // small tail lobe
    h.bezierCurveTo(HL * 0.12, HW * 0.8, HL * 0.04, HW * 0.45, 0, 0);
    h.closePath();
    DMW.fore = f; DMW.hind = h;
  }
  /** Map a local point through the current transform into the frame's local sprite space (for live eye-spot glows). */
  function spotOut(ctx, x, y, res, half) {
    const m = ctx.getTransform();
    return { x: (m.a * x + m.c * y + m.e) / res - half.x, y: (m.b * x + m.d * y + m.f) / res - half.y };
  }
  /** Dusk moth art, centred at (x, y), head toward +x (mirror outside). pose 0 flap, 1 raised (rear/shiver), 2 dive.
   *  Returns the hind-wing eye-spot positions when `spots` is given ({res, half}). */
  function drawDuskMoth(ctx, x, y, flap, pose, t, dead, spots) {
    const ch = CH();
    dmWings();
    const beat = Math.cos(flap);
    const out = [];
    ctx.save();
    ctx.translate(x, y);
    for (const layer of ['hind', 'fore']) {
      for (const side of [-1, 1]) {
        const far = side === -1;
        ctx.save();
        ctx.translate(side * (layer === 'fore' ? 5 : 4), layer === 'fore' ? -6 : 3);
        let ang, sy;
        if (dead) { ang = layer === 'fore' ? 0.55 : 0.95; sy = 0.72; }
        else if (pose === 1) { ang = (layer === 'fore' ? -1.08 : -0.5) + Math.sin(flap * 1.7) * 0.05; sy = 0.96; }
        else if (pose === 2) { ang = (layer === 'fore' ? 0.42 : 0.92) + 0.05 * Math.sin(flap); sy = 0.78; }
        else {
          const base = layer === 'fore' ? -0.36 : 0.18, amp = layer === 'fore' ? 0.62 : 0.46;
          ang = base - beat * amp; sy = 0.6 + 0.4 * Math.abs(Math.sin(flap + 0.3));
        }
        ctx.scale(side * (far ? 0.84 : 1), 1);
        ctx.rotate(ang);
        ctx.scale(1, sy);
        ctx.globalAlpha = far ? 0.82 : 1;
        if (layer === 'fore') {
          const path = DMW.fore;
          if (ch) ch.shape(ctx, path, { fill: DM.fore, box: [0, -FW, FL, FW * 0.4], light: -1, shade: 0.45, hi: 0.25, lw: 1.8, rim: '#d8c8ee', rimWidth: 1.4 });
          else { ctx.fillStyle = DM.fore; ctx.fill(path); }
          ctx.save();
          ctx.clip(path);
          ctx.globalAlpha *= 0.9;
          ctx.strokeStyle = DM.foreEdge; ctx.lineWidth = 7;                    // dark leading edge
          ctx.beginPath(); ctx.moveTo(0, -6); ctx.bezierCurveTo(FL * 0.25, -FW * 1.02, FL * 0.68, -FW * 1.2, FL * 1.0, -FW * 0.8); ctx.stroke();
          ctx.strokeStyle = DM.foreBand; ctx.lineWidth = 5.5;                  // pale crescent band
          ctx.beginPath(); ctx.moveTo(FL * 0.42, -FW * 0.86); ctx.quadraticCurveTo(FL * 0.56, -FW * 0.2, FL * 0.44, FW * 0.3); ctx.stroke();
          ctx.lineWidth = 0.9; ctx.strokeStyle = DM.vein;                       // veins
          ctx.beginPath();
          for (let k = 0; k < 5; k++) { ctx.moveTo(2, -1); ctx.quadraticCurveTo(FL * 0.35, (k - 2) * 5 - 8, FL * 0.95, (k - 2.4) * 9 - 6); }
          ctx.stroke();
          ctx.fillStyle = DM.foreTip;                                          // apex window spot
          ctx.beginPath(); ctx.ellipse(FL * 0.86, -FW * 0.56, 4, 2.4, -0.4, 0, TAU); ctx.fill();
          ctx.fillStyle = DM.spotDark; ctx.globalAlpha *= 0.55;               // small reniform spot
          ctx.beginPath(); ctx.ellipse(FL * 0.3, -FW * 0.42, 3.2, 4.4, 0.3, 0, TAU); ctx.fill();
          ctx.globalAlpha = (far ? 0.82 : 1) * 0.5; ctx.fillStyle = MW.glitter;   // scale glitter
          for (let k = 0; k < 9; k++) { ctx.beginPath(); ctx.arc(6 + h01(k, 3) * FL * 0.85, -FW * 0.9 + h01(k, 7) * FW * 1.2, 0.8, 0, TAU); ctx.fill(); }
          ctx.restore();
        } else {
          const path = DMW.hind;
          if (ch) ch.shape(ctx, path, { fill: DM.hind, box: [0, -4, HL, HW], light: -1, shade: 0.5, hi: 0.2, lw: 1.8, rim: '#e0c8e0', rimWidth: 1.2 });
          else { ctx.fillStyle = DM.hind; ctx.fill(path); }
          ctx.save();
          ctx.clip(path);
          ctx.strokeStyle = DM.hindDark; ctx.globalAlpha *= 0.7; ctx.lineWidth = 6;
          ctx.stroke(path);
          ctx.restore();
          // owl eye-spot: dark ring, pale ring, violet core, glint
          const ex = HL * 0.56, ey = HW * 0.5;
          ctx.fillStyle = DM.spotDark; ctx.beginPath(); ctx.arc(ex, ey, 9.5, 0, TAU); ctx.fill();
          ctx.fillStyle = DM.spotRing; ctx.beginPath(); ctx.arc(ex, ey, 7.4, 0, TAU); ctx.fill();
          ctx.fillStyle = DM.spotDark; ctx.beginPath(); ctx.arc(ex, ey, 5.4, 0, TAU); ctx.fill();
          ctx.fillStyle = DM.spotCore; ctx.beginPath(); ctx.arc(ex + 0.6, ey, 3.6, 0, TAU); ctx.fill();
          ctx.fillStyle = '#ffffff'; ctx.beginPath(); ctx.arc(ex - 1.2, ey - 1.6, 1.2, 0, TAU); ctx.fill();
          if (spots && !far) out.push(spotOut(ctx, ex, ey, spots.res, spots.half));
          else if (spots) out.push(Object.assign(spotOut(ctx, ex, ey, spots.res, spots.half), { far: true }));
        }
        ctx.restore();
      }
    }
    ctx.globalAlpha = 1;
    // abdomen: long, banded, curling slightly
    const ab = new Path2D();
    ab.moveTo(-6.5, 4);
    ab.bezierCurveTo(-8, 14, -5, 25, 0, 30);
    ab.bezierCurveTo(5, 25, 8, 14, 6.5, 4);
    ab.closePath();
    if (ch) ch.shape(ctx, ab, { fill: DM.abdomen, box: [-8, 4, 8, 30], light: -1, shade: 0.5, lw: 1.8 });
    else { ctx.fillStyle = DM.abdomen; ctx.fill(ab); }
    ctx.strokeStyle = DM.band; ctx.lineWidth = 1.5;
    for (const yy of [11, 16, 21, 25]) { const w = 6.6 - (yy - 8) * 0.22; ctx.beginPath(); ctx.moveTo(-w, yy); ctx.quadraticCurveTo(0, yy + 2, w, yy); ctx.stroke(); }
    // thorax: big furry ruff
    const th = new Path2D();
    th.ellipse(0, -3, 10, 11, 0, 0, TAU);
    if (ch) ch.shape(ctx, th, { fill: DM.fur, box: [-10, -14, 10, 8], light: -1, shade: 0.45, lw: 1.8, rim: DM.furHi, rimWidth: 1.4 });
    else { ctx.fillStyle = DM.fur; ctx.fill(th); }
    ctx.fillStyle = DM.furHi;
    for (let k = 0; k < 22; k++) {
      const a = (k / 22) * TAU + h01(k, 4) * 0.3;
      ctx.globalAlpha = 0.35 + 0.35 * h01(k, 9);
      ctx.beginPath(); ctx.arc(Math.cos(a) * 9.5, -4 + Math.sin(a) * 10.5, 1.3 + 0.8 * h01(k, 2), 0, TAU); ctx.fill();
    }
    ctx.globalAlpha = 1;
    // head with plumed antennae and big dark eyes
    const hx = 3, hy = -15;
    const hd = new Path2D(); hd.arc(hx, hy, 6.5, 0, TAU);
    if (ch) ch.shape(ctx, hd, { fill: '#a48ea0', box: [hx - 7, hy - 7, hx + 7, hy + 7], light: -1, shade: 0.4, lw: 1.6 });
    else { ctx.fillStyle = '#a48ea0'; ctx.fill(hd); }
    ctx.strokeStyle = '#cdbfd8'; ctx.lineWidth = 1.3; ctx.lineCap = 'round';
    for (const side of [-1, 1]) {
      const sway = dead ? 0 : Math.sin((t || 0) * 2.2 + side) * 1.5;
      const ax = hx + side * 2.5, ay = hy - 5;
      const ex = ax + side * 14 + 3 + sway, ey = ay - 15;
      ctx.beginPath(); ctx.moveTo(ax, ay); ctx.quadraticCurveTo(ax + side * 3, ay - 11, ex, ey); ctx.stroke();
      ctx.beginPath();
      for (let k = 1; k <= 7; k++) {
        const q = k / 8, px = ax + (ex - ax) * q + side * 3 * Math.sin(q * Math.PI) * 0.6, py = ay + (ey - ay) * q;
        const L = 3.6 * Math.sin(q * Math.PI) + 1;
        ctx.moveTo(px, py); ctx.lineTo(px + side * L, py + L * 0.5);
        ctx.moveTo(px, py); ctx.lineTo(px - side * L * 0.4, py - L * 0.7);
      }
      ctx.stroke();
    }
    ctx.lineCap = 'butt';
    if (!dead) {
      ctx.fillStyle = DM.eye;
      ctx.beginPath(); ctx.ellipse(hx + 3.2, hy + 0.5, 3.2, 3.8, 0, 0, TAU); ctx.fill();
      ctx.beginPath(); ctx.ellipse(hx - 3, hy + 0.5, 2.5, 3.4, 0, 0, TAU); ctx.fill();
      ctx.fillStyle = DM.eyeGlint;
      ctx.beginPath(); ctx.arc(hx + 2.4, hy - 0.8, 1.1, 0, TAU); ctx.fill();
      ctx.beginPath(); ctx.arc(hx - 3.4, hy - 0.6, 0.8, 0, TAU); ctx.fill();
    } else {
      ctx.strokeStyle = MW.outline; ctx.lineWidth = 1.2;
      ctx.beginPath(); ctx.moveTo(hx - 2, hy - 2); ctx.lineTo(hx + 2, hy + 2); ctx.moveTo(hx + 2, hy - 2); ctx.lineTo(hx - 2, hy + 2); ctx.stroke();
    }
    ctx.restore();
    return out;
  }
  // pre-rendered frames (12 flap phases + 2 raised + 2 dive), one facing (mirrored at draw time), 2x resolution
  const DM_SW = 176, DM_SH = 168, DM_RES = 2, DM_FLAP = 12;
  const dmCache = new Map();
  function dmFrame(pose, i) {
    const key = pose + '|' + i;
    let fr = dmCache.get(key);
    if (fr) return fr;
    const mc = G.U.makeCanvas(DM_SW * DM_RES, DM_SH * DM_RES);
    mc.ctx.scale(DM_RES, DM_RES);
    const n = pose === 0 ? DM_FLAP : 2;
    const spots = drawDuskMoth(mc.ctx, DM_SW / 2, DM_SH / 2, (i / n) * TAU, pose, i * 0.21, false, { res: DM_RES, half: { x: DM_SW / 2, y: DM_SH / 2 } });
    fr = { canvas: mc.canvas, spots };
    dmCache.set(key, fr);
    return fr;
  }
  function drawDuskMothCached(ctx, x, y, f, flap, pose, rot) {
    const n = pose === 0 ? DM_FLAP : 2;
    const ph = ((flap % TAU) + TAU) % TAU;
    const fr = dmFrame(pose, Math.floor((ph / TAU) * n) % n);
    ctx.save();
    ctx.translate(x, y);
    if (rot) ctx.rotate(rot);
    if (f < 0) ctx.scale(-1, 1);
    ctx.drawImage(fr.canvas, -DM_SW / 2, -DM_SH / 2, DM_SW, DM_SH);
    ctx.restore();
    return fr;
  }
  const bez = (s, u) => { const a = 1 - u; return { x: a * a * s.x0 + 2 * a * u * s.x1 + u * u * s.x2, y: a * a * s.y0 + 2 * a * u * s.y1 + u * u * s.y2 }; };
  const ARC0 = -Math.PI + 0.3, ARC1 = -0.3;   // the circling arc: the upper half around the Wickling

  class DuskMoth extends G.Enemy {
    constructor(props) {
      super(props, {
        hp: 40, w: 54, h: 40, flying: true, cinders: [7, 12], weight: 0.6, sight: 9 * TILE,
        colors: { body: DM.fore, dark: DM.furDark, hit: '#f4ecff', smoke: MW.smoke, puddle: '#4e3e5c', tele: MW.tele },
        puddleW: 26,
      });
      this.dropThrough = true;          // flies through one-way platforms (a dive never "lands" on one)
      this.puddleWick = false;
      this.flap = Math.random() * TAU;
      this.range = propTiles(this, 'range', 8);
      this.orbitR = 4 * TILE;
      this.ang = -Math.PI / 2; this.orbitDir = 1;
      this.oc = { x: 0, y: 0 };
      this.rot = 0; this.glowK = 0.3;
      this.attacks = 0;
    }
    init() { super.init(); this.setState('drift'); this.cooldown('attack', rnd(1.0, 1.6)); }
    inLeash(x, y, mul) {
      const h = this.home, r = this.range * (mul || 1.15);
      return Math.abs(x - h.x) < r && Math.abs(y - h.y) < r * 0.85;
    }
    /** A steering target clamped to the leash, below the ceiling, above the floor and outside exit zones. */
    clampTarget(tx, ty) {
      const h = this.home, r = this.range, room = this.room;
      tx = clamp(tx, h.x - r, h.x + r); ty = clamp(ty, h.y - r * 0.75, h.y + r * 0.75);
      if (room && !G.Physics.rectSolid(room, tx - 2, ty - 2, 4, 4)) {
        const up = G.Physics.raycast(room, tx, ty, tx, ty - 1.3 * TILE); if (up.hit) ty = up.y + 1.3 * TILE;
        const dn = G.Physics.raycast(room, tx, ty, tx, ty + 1.6 * TILE); if (dn.hit) ty = dn.y - 1.6 * TILE;
      }
      return keepOut(this, tx, ty, 34);
    }
    startCircle(pc) {
      this.oc.x = pc ? pc.x : this.cx; this.oc.y = pc ? pc.y : this.cy;
      let a = Math.atan2(this.cy - this.oc.y, this.cx - this.oc.x);
      if (a > ARC1 && a <= Math.PI / 2) a = ARC1; else if (a > Math.PI / 2 || a < ARC0) a = ARC0;
      this.ang = a; this.orbitDir = a > -Math.PI / 2 ? -1 : 1;
      this.setState('circle', { dur: rnd(1.3, 2.3) });
    }
    /** Curved dive through the Wickling's chest height and out the other side, or null if anything is in the way. */
    planSwoop(pc) {
      const p = this.player, room = this.room;
      if (!room || !p) return null;
      const x0 = this.cx, y0 = this.cy;
      const px = pc.x + clamp(p.vx || 0, -320, 320) * 0.14, py = p.y + p.h * 0.36;
      if (py < y0 + 0.8 * TILE) return null;                 // it dives: the Wickling must be below
      const side = Math.sign(px - x0) || this.facing;
      const span = Math.max(2.8 * TILE, Math.abs(px - x0));
      const c = this.clampTarget(px + side * span, y0 - 0.4 * TILE);
      const s = { x0, y0, x2: c.x, y2: c.y, x1: 0, y1: 0, side };
      if ((s.x2 - px) * side < 1.2 * TILE) return null;      // no room to pull out past the Wickling
      s.x1 = 2 * px - (x0 + s.x2) / 2; s.y1 = 2 * py - (y0 + s.y2) / 2;
      let len = 0, prev = { x: x0, y: y0 };
      for (let i = 1; i <= 12; i++) {
        const q = bez(s, i / 12);
        if (G.Physics.rectSolid(room, q.x - this.w / 2 + 5, q.y - this.h / 2 + 6, this.w - 10, this.h - 12)) return null;
        if (inZone(this, q.x, q.y)) return null;
        len += Math.hypot(q.x - prev.x, q.y - prev.y); prev = q;
      }
      s.dur = clamp(len / 540, 0.62, 1.05);
      return s;
    }
    chooseAttack(pc) {
      this.attacks++;
      if (this.attacks % 3 !== 0 && this.planSwoop(pc)) this.setState('rear');
      else if (this.canSee(this.player)) this.setState('shiver');
      else this.cooldown('attack', 0.5);
    }
    shedScales(pc) {
      const e = this.eye();
      const a = Math.atan2(pc.y - e.y, pc.x - e.x);
      for (const off of [-0.34, 0, 0.34]) {
        const sp = 235 - Math.abs(off) * 60;
        this.fire('moth_scale', { x: this.cx + Math.cos(a + off) * 18, y: this.cy + 6 + Math.sin(a + off) * 12, vx: Math.cos(a + off) * sp, vy: Math.sin(a + off) * sp, sound: false });
      }
      sfx('scale_shed', this.cx, { vol: 0.9 });
      for (let k = 0; k < 14; k++) fxSpawn({ x: this.cx + rnd(-40, 40), y: this.cy + rnd(-10, 16), vx: rnd(-60, 60), vy: rnd(-40, 50), life: rnd(0.6, 1.1), size: rnd(1.5, 2.6), size2: 0.4, color: MW.glitter, add: true, gravity: 60, drag: 1.5, shape: 'tri', rot: rnd(0, TAU), vrot: rnd(-8, 8) });
    }
    glitter(rate, dt) {
      if (Math.random() > rate * dt) return;
      const s = this.facing;
      fxSpawn({ x: this.cx + rnd(-34, 34), y: this.cy + rnd(-12, 18), vx: rnd(-20, 20) - this.vx * 0.15, vy: rnd(10, 40) - this.vy * 0.1, life: rnd(0.8, 1.4), size: rnd(1.2, 2.2), size2: 0.3, color: Math.random() < 0.5 ? MW.glitter : '#c8a8ff', add: true, gravity: 40, drag: 1.2, shape: 'tri', rot: rnd(0, TAU), vrot: rnd(-6, 6) * s });
    }
    think(dt) {
      const p = this.player;
      const pc = p ? pCenter(p) : null;
      const st = this.state;
      this.glowK = toward(this.glowK, st === 'rear' || st === 'shiver' ? 1 : st === 'swoop' ? 0.75 : 0.3, dt * 2.6);
      this.flap += dt * (st === 'swoop' ? 9 : st === 'climb' ? 15 : st === 'rear' || st === 'shiver' ? 7 : st === 'circle' ? 10 : 7.2);
      let rotT = clamp(this.vx / 520, -0.3, 0.3);
      if (st === 'swoop') rotT = this.facing * clamp(Math.atan2(this.vy, Math.abs(this.vx) + 1) * 0.55, -0.55, 0.65);
      else if (st === 'rear') rotT = -this.facing * 0.28 * clamp(this.stateTime / 0.3, 0, 1);
      this.rot = toward(this.rot, rotT, dt * (st === 'swoop' ? 6 : 2.5));
      const h = this.home;
      switch (st) {
        case 'drift': {
          this.hover(null, null, dt, { amp: 22, freq: 0.3, speed: 55, accel: 220 });
          if (Math.abs(this.vx) > 12) this.facing = this.vx > 0 ? 1 : -1;
          this.glitter(3, dt);
          if (this.stateTime > 0.4 && this.canSee(p) && this.inLeash(pc.x, pc.y)) this.startCircle(pc);
          break;
        }
        case 'circle': {
          if (!this.targetable(p) || !this.inLeash(pc.x, pc.y, 1.25)) { this.setState('return'); break; }
          const k = 1 - Math.exp(-dt * 2.5);
          this.oc.x += (pc.x - this.oc.x) * k; this.oc.y += (pc.y - this.oc.y) * k;
          this.ang += this.orbitDir * 0.95 * dt;
          if (this.ang > ARC1) { this.ang = ARC1; this.orbitDir = -1; } else if (this.ang < ARC0) { this.ang = ARC0; this.orbitDir = 1; }
          const tp = this.clampTarget(this.oc.x + Math.cos(this.ang) * this.orbitR, this.oc.y + Math.sin(this.ang) * this.orbitR * 0.75 + this.bob(8, 0.6));
          this.flyTo(tp.x, tp.y, 210, dt, { accel: 560, arrive: 50 });
          this.face(p);
          this.glitter(5, dt);
          if (this.stateTime > this.stateData.dur && this.ready('attack') && !playerInZone(this) && this.canSee(p)) this.chooseAttack(pc);
          break;
        }
        case 'rear': {   // telegraph: brakes, tilts back, wings hauled high, eye-spots flare
          this.vx *= Math.pow(0.02, dt); this.vy = toward(this.vy, -24, 300 * dt);
          if (this.targetable(p)) this.face(p);
          if (this.once('tele')) this.stateData.w = this.telegraph(0.5, { color: MW.tele, sound: 'dusk_rear', vol: 0.85, shake: 1.2 });
          if (this.stateTime >= this.stateData.w) {
            const plan = this.targetable(p) && !playerInZone(this) ? this.planSwoop(pc) : null;
            if (!plan) { this.cooldown('attack', 0.6); this.startCircle(pc); break; }
            this.facing = plan.side;
            this.setState('swoop', plan);
            sfx('dusk_swoop', this.cx, { vol: 0.9 });
          }
          break;
        }
        case 'swoop': {
          const s = this.stateData;
          const q = bez(s, Math.min(1, this.stateTime / s.dur));
          let vx = (q.x - this.cx) / dt, vy = (q.y - this.cy) / dt;
          const sp = Math.hypot(vx, vy);
          if (sp > 950) { vx *= 950 / sp; vy *= 950 / sp; }
          this.vx = vx; this.vy = vy;
          this.facing = s.side;
          this.glitter(40, dt);
          if (this.stateTime >= s.dur || (this.stateTime > 0.08 && (this.wallHit || this.ceilHit || this.grounded))) this.setState('climb');
          break;
        }
        case 'climb': {  // recovery: slow, heavy climb out of the dive (punish window)
          this.vx = toward(this.vx, 0, 900 * dt); this.vy = toward(this.vy, -80, 1100 * dt);
          const ahead = this.cx + Math.sign(this.vx) * 1.5 * TILE;
          if (inZone(this, ahead, this.cy)) this.vx = toward(this.vx, 0, 2400 * dt);
          this.glitter(12, dt);
          if (this.stateTime > 0.72) { this.cooldown('attack', rnd(1.1, 1.7)); this.startCircle(pc); }
          break;
        }
        case 'shiver': { // telegraph: hangs in the air, wings raised and trembling, scales glittering
          this.vx = toward(this.vx, 0, 500 * dt); this.vy = toward(this.vy, 0, 500 * dt);
          if (this.targetable(p)) this.face(p);
          if (this.once('tele')) this.stateData.w = this.telegraph(0.55, { color: MW.tele, sound: 'scale_shiver', vol: 0.8, shake: 1.4 });
          this.glitter(26, dt);
          if (this.stateTime >= this.stateData.w) {
            if (this.targetable(p) && !playerInZone(this)) this.shedScales(pc);
            this.setState('beat');
          }
          break;
        }
        case 'beat':     // recovery after the flurry
          this.vy = toward(this.vy, -30, 300 * dt); this.vx = toward(this.vx, 0, 300 * dt);
          if (this.stateTime > 0.65) { this.cooldown('attack', rnd(1.3, 1.9)); this.startCircle(pc); }
          break;
        case 'return': {
          const d = this.flyTo(h.x, h.y, 120, dt, { accel: 300, arrive: 50 });
          if (Math.abs(this.vx) > 12) this.facing = this.vx > 0 ? 1 : -1;
          this.glitter(3, dt);
          if (d < 24 || this.stateTime > 6) this.setState('drift');
          else if (this.stateTime > 0.8 && this.canSee(p) && this.inLeash(pc.x, pc.y)) this.startCircle(pc);
          break;
        }
        default: this.setState('drift');
      }
      if (this.state !== 'swoop' && this.state !== 'climb' && this.state !== 'return' && !this.inLeash(this.cx, this.cy, 1.4)) this.setState('return');
    }
    onHurt() { if (this.is('swoop')) this.setState('climb'); }     // a clean hit knocks it out of the dive
    whileStunned(dt) { this.flap += dt * 12; }
    eye() { return { x: this.cx + this.facing * 4, y: this.cy - 10 }; }
    drawBounds() { return { x: this.cx - 92, y: this.cy - 88, w: 184, h: 176 }; }
    drawBody(ctx, t) {
      const k = this.glowK * (this.telegraphing ? 0.85 + 0.15 * Math.sin(t * 30) : 1);
      const pose = this.is('rear') || this.is('shiver') ? 1 : this.is('swoop') ? 2 : 0;
      glow(ctx, this.cx, this.cy + 4, 40 + 24 * k, DM.glow, 0.1 + 0.18 * k);
      const fr = drawDuskMothCached(ctx, this.cx, this.cy, this.facing, this.flap, pose, this.rot);
      // the hind-wing eye-spots glow (and flare on the wind-up)
      const c = Math.cos(this.rot), s = Math.sin(this.rot);
      for (const sp of fr.spots) {
        const lx = sp.x * this.facing, ly = sp.y;
        const x = this.cx + lx * c - ly * s, y = this.cy + lx * s + ly * c;
        glow(ctx, x, y, 9 + 9 * k, '#c8a8ff', (sp.far ? 0.25 : 0.4) + 0.45 * k);
      }
      light({ x: this.cx, y: this.cy, r: 70 + 50 * k, color: '#b890ff', intensity: 0.16 + 0.24 * k, flicker: false });
    }
    drawCorpse(ctx, t) {
      ctx.save(); ctx.translate(this.cx, this.cy); if (this.facing < 0) ctx.scale(-1, 1);
      drawDuskMoth(ctx, 0, 0, 0, 0, t, true, null);
      ctx.restore();
    }
  }

  // ------------------------------------------------------------------ moth_scale: a glittering wing-scale (projectile)
  class MothScale extends G.Projectile {
    update(dt) {
      // the throw slows into a fluttering fall
      const k = 1 - Math.exp(-dt * 1.7);
      this.vx += (Math.sin(this.age * 4.6 + this.seed) * 60 - this.vx) * k;
      this.vy += (78 - this.vy) * k;
      super.update(dt);
    }
    draw(ctx, t) {
      const x = this.cx, y = this.cy, a = this.age * 7 + this.seed;
      const sh = Math.abs(Math.cos(a));                       // shimmer as it turns
      glow(ctx, x, y, 18, '#b890ff', 0.35);
      ctx.save();
      ctx.translate(x, y); ctx.rotate(Math.sin(this.age * 3 + this.seed) * 0.9 + 0.4); ctx.scale(0.45 + 0.55 * sh, 1);
      ctx.beginPath();                                        // paddle-shaped scale with a serrated tip
      ctx.moveTo(0, -8);
      ctx.quadraticCurveTo(5.5, -6, 5, 2);
      ctx.lineTo(3.4, 6); ctx.lineTo(1.6, 4.4); ctx.lineTo(0, 7); ctx.lineTo(-1.6, 4.4); ctx.lineTo(-3.4, 6);
      ctx.lineTo(-5, 2);
      ctx.quadraticCurveTo(-5.5, -6, 0, -8);
      ctx.closePath();
      ctx.fillStyle = sh > 0.5 ? '#efe4ff' : '#b9a2dc'; ctx.fill();
      ctx.strokeStyle = '#3a2c56'; ctx.lineWidth = 1.2; ctx.stroke();
      ctx.strokeStyle = 'rgba(120,90,170,0.7)'; ctx.lineWidth = 0.8;
      ctx.beginPath(); ctx.moveTo(0, -6); ctx.lineTo(0, 4); ctx.moveTo(-2.5, -3); ctx.lineTo(-2.2, 3); ctx.moveTo(2.5, -3); ctx.lineTo(2.2, 3); ctx.stroke();
      ctx.restore();
      if (sh > 0.85) glow(ctx, x, y, 7, '#ffffff', (sh - 0.85) * 4);
      void t;
    }
    burstFx(why) {
      if (!G.fx) return;
      for (let k = 0; k < 7; k++) fxSpawn({ x: this.cx, y: this.cy, vx: rnd(-90, 90), vy: rnd(-90, 40), life: rnd(0.4, 0.8), size: rnd(1.4, 2.4), size2: 0.3, color: MW.glitter, add: true, gravity: 120, drag: 2, shape: 'tri', rot: rnd(0, TAU), vrot: rnd(-10, 10) });
      if (why === 'hit' || why === 'terrain') sfx('bolt_hit', this.cx, { vol: 0.25, pitch: 1.8 });
    }
  }
  if (G.registerProjectile) G.registerProjectile('moth_scale', MothScale, { r: 7, gravity: 0, life: 3.4, color: '#d8c8f0', damage: 1, destroyable: true });

  G.registerEnemy('dusk_moth', DuskMoth);

  // ================================================================== cocoon_spawner
  const CC = {
    silk: '#b2a8c4', silkHi: '#ece6f6', silkShade: '#625878', groove: '#463c5c', vein: '#5a2f6e',
    heart: '#c8a0ff', heartHot: '#f2e6ff', thread: 'rgba(226,218,240,0.75)', wing: '#cfc2e2',
  };
  const COC_W = 44, COC_H = 66;
  /** Lumpy spindle: narrow silk neck at the top, fattest at 62 % of the height, a blunt point at the bottom. */
  function cocoonHalfW(v) {
    const W = COC_W / 2;
    const w = v < 0.62 ? Math.pow(Math.sin((v / 0.62) * Math.PI / 2), 0.85) : Math.pow(Math.cos(((v - 0.62) / 0.38) * Math.PI / 2), 0.62);
    return Math.max(2.5, W * w);
  }
  function cocoonPath(sw, seed) {
    const H = COC_H, N = 13, pts = [];
    for (let i = 0; i <= N; i++) { const v = i / N; pts.push([cocoonHalfW(v) * sw * (1 + 0.07 * (h01(i, seed) - 0.5)), v * H]); }
    for (let i = N; i >= 0; i--) { const v = i / N; pts.push([-cocoonHalfW(v) * sw * (1 + 0.07 * (h01(i + 20, seed) - 0.5)), v * H]); }
    const p = new Path2D();
    const mid = (a, b) => [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2];
    let m = mid(pts[pts.length - 1], pts[0]);
    p.moveTo(m[0], m[1]);
    for (let i = 0; i < pts.length; i++) { const a = pts[i], b = pts[(i + 1) % pts.length], q = mid(a, b); p.quadraticCurveTo(a[0], a[1], q[0], q[1]); }
    p.closePath();
    return p;
  }
  /** Cocoon art with its top-centre at (0, 0), hanging down (+y). sw = swell 0..1, beat = heartbeat 0..1. */
  function drawCocoon(ctx, t, seed, sw, beat, dead) {
    const ch = CH();
    const sx = 1 + 0.1 * sw + 0.03 * beat;
    const path = cocoonPath(sx, seed);
    if (ch) ch.shape(ctx, path, { fill: dead ? '#6e6680' : CC.silk, box: [-COC_W / 2, 0, COC_W / 2, COC_H], light: -1, shade: 0.5, hi: 0.35, lw: 2, rim: CC.silkHi, rimWidth: 1.6 });
    else { ctx.fillStyle = CC.silk; ctx.fill(path); }
    ctx.save();
    ctx.clip(path);
    // inner heart glow seen through the silk (translucent lower half)
    if (!dead) glow(ctx, 0, COC_H * 0.66, 20 + 16 * sw + 6 * beat, CC.heart, 0.3 + 0.45 * sw + 0.2 * beat);
    // wriggling brood: curled larvae pressing against the silk
    ctx.strokeStyle = dead ? 'rgba(20,12,28,0.45)' : 'rgba(34,16,50,' + (0.22 + 0.4 * sw).toFixed(3) + ')';
    ctx.lineCap = 'round';
    for (let i = 0; i < 3; i++) {
      const wx = (i - 1) * 8 + Math.sin(t * (1.6 + i * 0.7) + seed + i) * (1.5 + 3 * sw), wy = COC_H * (0.5 + 0.13 * i) + Math.cos(t * 2.2 + i * 2 + seed) * 1.5;
      const a0 = i * 2.1 + Math.sin(t * 2.4 + i + seed) * (0.4 + 0.6 * sw);
      ctx.lineWidth = 5 - i * 0.6;
      ctx.beginPath(); ctx.arc(wx, wy, 4.5 - i * 0.5, a0, a0 + 3.6); ctx.stroke();
    }
    // thin, translucent belly where the silk is stretched over the brood
    ctx.fillStyle = dead ? 'rgba(40,30,50,0.3)' : 'rgba(206,180,255,' + (0.12 + 0.22 * sw + 0.08 * beat).toFixed(3) + ')';
    ctx.beginPath(); ctx.ellipse(1, COC_H * 0.64, COC_W * 0.28 * sx, COC_H * 0.2, 0.08, 0, TAU); ctx.fill();
    // irregular silk wraps: uneven bands at varying slants, some only part-way round
    ctx.lineCap = 'round';
    for (let i = 0; i < 11; i++) {
      const v = 0.07 + i * 0.083 + (h01(i, seed + 7) - 0.5) * 0.04, y0 = v * COC_H;
      const hw = cocoonHalfW(v) * sx + 3, slant = (h01(i, seed + 2) - 0.6) * 12;
      const a0 = -hw * (0.55 + 0.45 * h01(i, seed + 4)), a1 = hw * (0.55 + 0.45 * h01(i, seed + 5));
      const light = i % 3 !== 1;
      ctx.strokeStyle = light ? 'rgba(240,234,250,' + (0.32 + 0.3 * h01(i, seed + 9)).toFixed(3) + ')' : 'rgba(60,50,82,0.5)';
      ctx.lineWidth = light ? 1 + 1.6 * h01(i, seed + 11) : 2;
      ctx.beginPath(); ctx.moveTo(a0, y0 + slant * (a0 / hw)); ctx.quadraticCurveTo(0, y0 + 3 + Math.sin(i * 2.1 + seed) * 2, a1, y0 + slant * (a1 / hw) - 1); ctx.stroke();
    }
    // dark veins over the swollen belly
    ctx.strokeStyle = 'rgba(90,47,110,' + (0.35 + 0.4 * sw).toFixed(3) + ')'; ctx.lineWidth = 1.2;
    ctx.beginPath();
    ctx.moveTo(-6, COC_H * 0.35); ctx.quadraticCurveTo(-12, COC_H * 0.55, -8, COC_H * 0.8);
    ctx.moveTo(7, COC_H * 0.3); ctx.quadraticCurveTo(13, COC_H * 0.5, 9, COC_H * 0.78);
    ctx.stroke();
    ctx.restore();
    // the birth slit at the bottom: opens with the swell, violet light inside
    const sl = 2 + 7 * sw;
    ctx.fillStyle = dead ? '#1a1222' : '#1c0e28';
    ctx.beginPath(); ctx.moveTo(0, COC_H * 0.7); ctx.quadraticCurveTo(sl, COC_H * 0.86, 0, COC_H + 1); ctx.quadraticCurveTo(-sl, COC_H * 0.86, 0, COC_H * 0.7); ctx.fill();
    if (!dead) {
      glow(ctx, 0, COC_H * 0.86, 10 + 12 * sw, CC.heartHot, 0.35 + 0.55 * sw);
      // wing tips poking out of the silk (a brood cocoon, not a sleeping one)
      ctx.fillStyle = CC.wing; ctx.strokeStyle = MW.outline; ctx.lineWidth = 1.2;
      for (const s of [-1, 1]) {
        const flick = Math.sin(t * 9 + s * 2 + seed) * (0.15 + 0.5 * sw);
        ctx.save(); ctx.translate(s * (COC_W * 0.42 * sx), COC_H * 0.58); ctx.rotate(s * (0.5 + flick));
        ctx.beginPath(); ctx.moveTo(0, 0); ctx.quadraticCurveTo(s * 7, -3, s * 9, 3); ctx.quadraticCurveTo(s * 4, 4, 0, 0); ctx.fill(); ctx.stroke();
        ctx.restore();
      }
    }
    // loose silk strands drifting off the sides and the tail
    ctx.strokeStyle = 'rgba(232,226,244,0.32)'; ctx.lineWidth = 0.8;
    ctx.beginPath();
    for (let i = 0; i < 3; i++) {
      const v = 0.42 + i * 0.2, s = i % 2 ? 1 : -1, x0 = s * cocoonHalfW(v) * sx * 0.97, y0 = v * COC_H;
      const sway = Math.sin(t * 1.3 + i * 1.7 + seed) * 2;
      ctx.moveTo(x0, y0); ctx.quadraticCurveTo(x0 + s * 2.5, y0 + 9, x0 + s * 1.5 + sway, y0 + 18 + i * 3);
    }
    ctx.moveTo(0, COC_H); ctx.quadraticCurveTo(2, COC_H + 6, Math.sin(t * 1.1 + seed) * 3, COC_H + 12);
    ctx.stroke();
    // knotted silk gathering at the top
    ctx.fillStyle = CC.silkHi; ctx.strokeStyle = MW.outline; ctx.lineWidth = 1.4;
    ctx.beginPath(); ctx.ellipse(0, 2, 4.5, 3.2, 0, 0, TAU); ctx.fill(); ctx.stroke();
  }

  class CocoonSpawner extends G.Enemy {
    constructor(props) {
      super(props, {
        hp: 50, w: 40, h: 62, flying: true, weight: 12, cinders: [7, 12], sight: 10 * TILE, contactInset: 6,
        colors: { body: CC.silk, dark: CC.silkShade, hit: '#ffffff', smoke: MW.smoke, puddle: '#6a6080', tele: MW.tele },
        puddleW: 24, meltTime: 0.6,
      });
      this.dropThrough = true;
      this.puddleWick = false;
      this.range = propTiles(this, 'range', 9);
      this.maxBrood = clamp(Math.round(+props.max || 3), 1, 3);
      this.leash = propTiles(this, 'leash', 9);
      this.swing = 0; this.swingV = 0; this.swell = 0;
      this.anchorY = null; this.wallSide = 0; this.threadFade = false;
    }
    init() {
      super.init();
      this.setupAttach();
      this.setState('rest');
      this.cooldown('brood', rnd(1.4, 2.0));     // entry grace
    }
    /** attach: 'ceiling' (default: a silk thread up to the ceiling) | 'wall' (nearest wall within 3 tiles) | 'left' | 'right'. */
    setupAttach() {
      const room = this.room;
      if (!room) return;
      const a = String(this.props.attach || 'ceiling');
      const r = Math.floor(this.cy / TILE);
      let side = a === 'left' ? -1 : a === 'right' ? 1 : 0;
      if (a === 'wall') {
        for (let d = 0; d <= 3 && !side; d++) {
          if (solidTile(room, Math.floor(this.x / TILE) - d, r)) side = -1;
          else if (solidTile(room, Math.floor((this.x + this.w - 1) / TILE) + d, r)) side = 1;
        }
      }
      if (side) {
        let c = side < 0 ? Math.floor(this.x / TILE) : Math.floor((this.x + this.w - 1) / TILE);
        for (let i = 0; i < 4 && !solidTile(room, c, r); i++) c += side;
        if (solidTile(room, c, r)) { this.x = side < 0 ? (c + 1) * TILE + 2 : c * TILE - this.w - 2; this.wallSide = side; }
      }
      if (!this.wallSide) {
        const c = Math.floor(this.cx / TILE);
        let top = null;
        for (let rr = Math.floor((this.y + 4) / TILE); rr >= Math.max(0, r - 16); rr--) if (solidTile(room, c, rr)) { top = (rr + 1) * TILE; break; }
        if (top != null && this.y < top + 6) this.y = top + 6;
        this.anchorY = top != null ? top : Math.max(-TILE, this.y - 6 * TILE);
        this.threadFade = top == null;
      }
      this.home = { x: this.cx, y: this.cy };
    }
    think(dt) {
      const p = this.player;
      this.swingV += (-this.swing * 10 - this.swingV * 1.8) * dt;
      this.swing += this.swingV * dt;
      switch (this.state) {
        case 'rest':
          this.swell = toward(this.swell, 0, dt * 2);
          if (this.ready('brood') && this.liveMinions() < this.maxBrood && this.notices(p) && !playerInZone(this)) this.setState('swell');
          break;
        case 'swell':    // telegraph: the cocoon bulges, its heart-light flares, the slit splits open
          if (this.once('tele')) this.stateData.w = this.telegraph(0.6, { color: MW.tele, sound: 'cocoon_throb', vol: 0.85, shake: 0.9, x: this.cx, y: this.y + this.h * 0.82 });
          this.swell = clamp(this.stateTime / this.stateData.w, 0, 1);
          if (this.stateTime >= this.stateData.w) { this.hatch(); this.setState('spent'); }
          break;
        case 'spent':
          this.swell = toward(this.swell, 0, dt * 2.5);
          if (this.stateTime > 0.7) { this.cooldown('brood', rnd(3.6, 4.8)); this.setState('rest'); }
          break;
        default: this.setState('rest');
      }
    }
    /** Hangs high: notices the Wickling within range horizontally and 1.4x range vertically (line of sight). */
    notices(p) {
      if (!this.targetable(p)) return false;
      const pc = pCenter(p);
      return Math.abs(pc.x - this.cx) < this.range && Math.abs(pc.y - this.cy) < this.range * 1.4 && this.canSee(p, this.range * 1.75);
    }
    hatch() {
      const live = this.liveMinions();
      const room = this.leash;
      let n = Math.min(this.maxBrood - live, live <= this.maxBrood - 2 && Math.random() < 0.6 ? 2 : 1);
      const bx = this.cx, by = this.y + this.h + 2;
      for (let i = 0; i < n; i++) {
        const m = this.summon('mothling', bx + (i - (n - 1) / 2) * 12, by - 4, { leash: room / TILE, facing: i ? 1 : -1 });
        if (m) { m.vx = (i - (n - 1) / 2 || (Math.random() < 0.5 ? -1 : 1)) * rnd(90, 140); m.vy = rnd(60, 120); m.nest = { x: this.cx, y: this.y + this.h + TILE }; }
      }
      sfx('cocoon_hatch', this.cx, { vol: 0.9 });
      this.swingV += (Math.random() < 0.5 ? -1 : 1) * 1.6;
      for (let k = 0; k < 12; k++) fxSpawn({ x: bx + rnd(-6, 6), y: by - rnd(0, 10), vx: rnd(-90, 90), vy: rnd(-20, 110), life: rnd(0.5, 1), size: rnd(1, 2.2), size2: 0.3, color: k % 3 ? CC.silkHi : '#c8a8ff', add: k % 3 === 0, gravity: 160, drag: 1.4, shape: k % 2 ? 'line' : 'circle', rot: rnd(0, TAU) });
    }
    onHurt(hit) {
      const d = hit && hit.dir ? (hit.dir.x || (this.cx > (hit.source ? hit.source.x : this.cx) ? 1 : -1)) : 1;
      this.swingV += d * 2.2;
    }
    drawBounds() { return { x: this.x - 34, y: (this.anchorY != null ? Math.min(this.anchorY, this.y) : this.y) - 10, w: this.w + 68, h: this.h + 60 + (this.anchorY != null ? Math.max(0, this.y - this.anchorY) : 0) }; }
    drawBody(ctx, t) {
      const beat = Math.max(0, Math.sin(t * 2.2 + this.seed)) ** 6;     // a slow heartbeat
      const topX = this.cx, topY = this.y - 2;
      const tilt = clamp(this.swing, -0.35, 0.35) * 0.5 + (this.wallSide ? this.wallSide * 0.1 : Math.sin(t * 0.8 + this.seed) * 0.03);
      // thread / wall strands
      ctx.lineCap = 'round';
      if (this.anchorY != null && !this.wallSide) {
        const len = topY - this.anchorY;
        if (len > 0) {
          ctx.strokeStyle = CC.thread; ctx.lineWidth = 2;
          if (this.threadFade) ctx.globalAlpha = 0.6;
          ctx.beginPath(); ctx.moveTo(topX + Math.sin(tilt) * 4, this.anchorY); ctx.quadraticCurveTo(topX + 2, this.anchorY + len * 0.5, topX, topY + 2); ctx.stroke();
          ctx.lineWidth = 0.8; ctx.strokeStyle = 'rgba(226,218,240,0.4)';
          ctx.beginPath(); ctx.moveTo(topX - 5, this.anchorY); ctx.lineTo(topX, topY + 2); ctx.moveTo(topX + 6, this.anchorY); ctx.lineTo(topX, topY + 2); ctx.stroke();
          ctx.globalAlpha = 1;
          if (!this.threadFade) { ctx.fillStyle = CC.silkHi; ctx.beginPath(); ctx.ellipse(topX, this.anchorY + 1, 7, 3, 0, 0, TAU); ctx.fill(); }
        }
      } else if (this.wallSide) {
        const wx = this.wallSide < 0 ? this.x - 2 : this.x + this.w + 2;
        ctx.strokeStyle = CC.thread; ctx.lineWidth = 1.4;
        ctx.beginPath();
        for (const fy of [0.12, 0.4, 0.75]) { const yy = this.y + this.h * fy; ctx.moveTo(wx, yy - 8); ctx.lineTo(this.cx, yy); ctx.moveTo(wx, yy + 8); ctx.lineTo(this.cx, yy); }
        ctx.stroke();
      }
      ctx.lineCap = 'butt';
      ctx.save();
      ctx.translate(topX, topY);
      ctx.rotate(tilt);
      drawCocoon(ctx, t, this.seed, this.swell, beat, false);
      ctx.restore();
      light({ x: this.cx, y: this.y + this.h * 0.7, r: 60 + 50 * this.swell + 10 * beat, color: '#b890ff', intensity: 0.2 + 0.35 * this.swell, flicker: false });
    }
    drawCorpse(ctx, t) {
      ctx.save(); ctx.translate(this.cx, this.y - 2);
      drawCocoon(ctx, t, this.seed, 0.6, 0, true);
      ctx.restore();
    }
  }
  G.registerEnemy('cocoon_spawner', CocoonSpawner);

  // ================================================================== mothling (minion)
  const ML = { body: '#e4daf2', bodyDark: '#8a7aa6', wing: 'rgba(222,210,244,0.82)', wingEdge: '#4a3a66', heart: '#c8a8ff' };
  function drawMothling(ctx, x, y, f, flap, t, dead, k) {
    const s = Math.abs(Math.sin(flap));
    ctx.save();
    ctx.translate(x, y);
    ctx.scale(f, 1);
    glow(ctx, 0, 2, 14 + 8 * k, ML.heart, 0.35 + 0.4 * k);
    for (const side of [-1, 1]) {
      ctx.save();
      ctx.scale(side, 1);
      ctx.rotate(dead ? 0.7 : -0.35 + Math.cos(flap) * 0.7);
      ctx.scale(1, dead ? 0.7 : 0.35 + 0.65 * s);
      ctx.fillStyle = ML.wing; ctx.strokeStyle = ML.wingEdge; ctx.lineWidth = 1;
      ctx.beginPath(); ctx.moveTo(1, -1); ctx.quadraticCurveTo(7, -9, 12, -5); ctx.quadraticCurveTo(12, 0, 2, 1); ctx.closePath(); ctx.fill(); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(1, 1); ctx.quadraticCurveTo(8, 2, 8, 7); ctx.quadraticCurveTo(4, 8, 1, 2); ctx.closePath(); ctx.fill(); ctx.stroke();
      ctx.fillStyle = 'rgba(160,120,220,0.7)'; ctx.beginPath(); ctx.arc(7.5, -4.5, 1.4, 0, TAU); ctx.fill();
      ctx.restore();
    }
    ctx.fillStyle = ML.body; ctx.strokeStyle = MW.outline; ctx.lineWidth = 1.2;
    ctx.beginPath(); ctx.ellipse(0, 1.5, 3.4, 5.5, 0, 0, TAU); ctx.fill(); ctx.stroke();
    ctx.beginPath(); ctx.arc(1, -4.5, 2.8, 0, TAU); ctx.fill(); ctx.stroke();
    ctx.strokeStyle = ML.bodyDark; ctx.lineWidth = 0.9;
    ctx.beginPath(); ctx.moveTo(0, -6.5); ctx.quadraticCurveTo(-2, -10, -4.5, -11); ctx.moveTo(2, -6.5); ctx.quadraticCurveTo(4, -10, 6, -10.5); ctx.stroke();
    if (!dead) { ctx.fillStyle = '#1a1022'; ctx.beginPath(); ctx.arc(2.4, -4.6, 1.2, 0, TAU); ctx.fill(); }
    ctx.restore();
    void t;
  }
  class Mothling extends G.Enemy {
    constructor(props) {
      super(props, {
        hp: 6, w: 18, h: 16, flying: true, weight: 0.5, cinders: 0, sight: 10 * TILE, hitStun: 0.15, knockback: 360, hitstop: 0.02,
        colors: { body: ML.body, dark: ML.bodyDark, hit: '#ffffff', smoke: MW.smoke, puddle: '#8a7aa0', tele: MW.tele },
        meltTime: 0.35, puddleTime: 1.2, puddleW: 9,
      });
      this.dropThrough = true;
      this.puddleWick = false;
      this.flap = rnd(0, TAU);
      this.phase = rnd(0, TAU);
      this.spin = Math.random() < 0.5 ? -1 : 1;
      this.leash = propTiles(this, 'leash', 9);
      this.nest = null; this.glowK = 0.3;
    }
    init() {
      super.init();
      if (!this.nest) this.nest = { x: this.home.x, y: this.home.y };
      this.setState('flit');
      this.cooldown('dart', rnd(1.2, 2.0));
    }
    think(dt) {
      const p = this.player;
      const pc = p ? pCenter(p) : null;
      const nest = this.nest || this.home;
      this.flap += dt * (this.is('buzz') ? 70 : 40);
      this.glowK = toward(this.glowK, this.is('buzz') ? 1 : this.is('dart') ? 0.7 : 0.3, dt * 4);
      const inL = !!pc && this.targetable(p) && Math.abs(pc.x - nest.x) < this.leash && Math.abs(pc.y - nest.y) < this.leash * 1.4;
      switch (this.state) {
        case 'flit': {
          let tx, ty;
          if (inL) {
            this.phase += dt * 2.1 * this.spin;
            tx = pc.x + Math.cos(this.phase) * 2.1 * TILE + Math.sin(this.t * 7.3 + this.seed) * 10;
            ty = pc.y - 0.9 * TILE + Math.sin(this.phase) * 1.2 * TILE + Math.cos(this.t * 6.1 + this.seed) * 10;
          } else {
            this.phase += dt * 1.6 * this.spin;
            tx = nest.x + Math.cos(this.phase) * 1.4 * TILE; ty = nest.y + Math.sin(this.phase * 1.3) * 0.8 * TILE;
          }
          tx = clamp(tx, nest.x - this.leash, nest.x + this.leash); ty = clamp(ty, nest.y - this.leash * 1.4, nest.y + this.leash * 1.4);
          const c = keepOut(this, tx, ty, 24);
          this.flyTo(c.x, c.y, 125, dt, { accel: 540, arrive: 30, look: 34 });
          if (Math.abs(this.vx) > 8) this.facing = this.vx > 0 ? 1 : -1;
          if (inL && this.ready('dart') && this.stateTime > 0.5 && this.dist(p) < 4 * TILE && this.canSee(p) && !playerInZone(this)) this.setState('buzz');
          break;
        }
        case 'buzz': {   // telegraph: hangs still, wings blur, the heart-glow brightens
          this.vx = toward(this.vx, 0, 700 * dt); this.vy = toward(this.vy, 0, 700 * dt);
          if (this.targetable(p)) this.face(p);
          if (this.once('tele')) this.stateData.w = this.telegraph(0.42, { color: MW.tele, sound: 'mothling_buzz', vol: 0.55, shake: 1.6 });
          if (this.stateTime >= this.stateData.w) {
            if (!this.targetable(p) || playerInZone(this)) { this.cooldown('dart', 1); this.setState('flit'); break; }
            const a = this.aimAt(p, 330, { x: this.cx, y: this.cy, lead: 0.15 });
            this.setState('dart', { vx: a.vx, vy: a.vy });
          }
          break;
        }
        case 'dart': {
          this.vx = this.stateData.vx; this.vy = this.stateData.vy;
          if (Math.abs(this.vx) > 8) this.facing = this.vx > 0 ? 1 : -1;
          if (this.stateTime > 0.48 || (this.stateTime > 0.05 && (this.wallHit || this.ceilHit || this.grounded)) || inZone(this, this.cx + this.vx * 0.12, this.cy + this.vy * 0.12)) {
            this.cooldown('dart', rnd(1.7, 2.7));
            this.setState('flit');
          }
          break;
        }
        default: this.setState('flit');
      }
    }
    whileStunned(dt) { this.flap += dt * 30; }
    drawBounds() { return { x: this.cx - 30, y: this.cy - 30, w: 60, h: 60 }; }
    drawBody(ctx, t) {
      drawMothling(ctx, this.cx, this.cy, this.facing, this.flap, t, false, this.glowK);
      light({ x: this.cx, y: this.cy, r: 38 + 20 * this.glowK, color: '#c8a8ff', intensity: 0.14 + 0.2 * this.glowK, flicker: false });
    }
    drawCorpse(ctx, t) { drawMothling(ctx, this.cx, this.cy, this.facing, 0, t, true, 0); }
  }
  G.registerEnemy('mothling', Mothling);

  // ================================================================== dust_maw
  const DW = {
    dust: '#77708a', dustHi: '#b4acc2', dustShade: '#48425a', dustDark: '#2c2838', mouth: '#150b1d',
    gum: '#5a2a4e', tooth: '#e6dfd2', toothShade: '#9e9488', eye: '#efe4ff',
  };
  /** The heap (always) + the maw (rise > 0). Local feet space: origin = feet centre, +x = facing. */
  function drawMaw(ctx, t, seed, rise, open, tilt, trem, stretch, dead) {
    const ch = CH();
    // heap of dust at the base
    const hh = 12 + 7 * trem + 5 * Math.min(1, rise * 3);
    const jit = trem ? Math.sin(t * 61 + seed) * 1.8 * trem : 0;
    const heap = new Path2D();
    heap.moveTo(-38, 1);
    heap.bezierCurveTo(-30, -hh * 0.5, -22, -hh * 1.0 + jit, -10, -hh * 0.95);
    heap.bezierCurveTo(-4, -hh * 1.12 - jit, 6, -hh * 1.05, 14, -hh * 0.9 + jit);
    heap.bezierCurveTo(24, -hh * 0.82, 32, -hh * 0.4, 40, 1);
    heap.closePath();
    // the maw column (behind the heap's front lip)
    if (rise > 0.02) {
      const H = 64 * rise * stretch;
      const sc = Math.min(1, 0.45 + 0.55 * rise);
      const J = { x: -13, y: -0.62 * H };
      const lip = { x: 21 * sc, y: -0.55 * H };
      // mouth cavity (upper-jaw points: hinge-local, opened by ua, scaled, then tilted about the hinge)
      const ua = -open * 0.85;
      const uc = Math.cos(ua), us = Math.sin(ua);
      const U = (x, y) => ({ x: J.x + (x * uc - y * us) * sc, y: J.y + (x * us + y * uc) * sc });
      const rotP = (pt) => { const dx = pt.x - J.x, dy = pt.y - J.y, c = Math.cos(tilt), s = Math.sin(tilt); return { x: J.x + dx * c - dy * s, y: J.y + dx * s + dy * c }; };
      const lipT = rotP(lip);
      const upTip = rotP(U(36, 2)), upBack = rotP(U(0, 2));
      ctx.fillStyle = DW.mouth;
      ctx.beginPath(); ctx.moveTo(J.x, J.y); ctx.lineTo(lipT.x, lipT.y); ctx.lineTo(upTip.x, upTip.y); ctx.lineTo(upBack.x, upBack.y); ctx.closePath(); ctx.fill();
      if (!dead && open > 0.15) glow(ctx, (lipT.x + upTip.x) / 2 - 4, (lipT.y + upTip.y) / 2, 12 + 10 * open, '#9a6ad8', 0.3 + 0.4 * open);
      // lower body (column) with the lower jaw
      const body = new Path2D();
      body.moveTo(-34, 0);
      body.bezierCurveTo(-30, -0.25 * H, -24, -0.45 * H, -21 * sc, -0.6 * H);
      body.lineTo(J.x, J.y);
      body.lineTo(lipT.x, lipT.y);
      body.bezierCurveTo(lipT.x + 5, lipT.y + 0.16 * H, 30, -0.18 * H, 36, 0);
      body.closePath();
      if (ch) ch.shape(ctx, body, { fill: dead ? '#5c5668' : DW.dust, box: [-34, -H, 36, 0], light: -1, shade: 0.5, hi: 0.25, lw: 2, rim: DW.dustHi, rimWidth: 1.5 });
      else { ctx.fillStyle = DW.dust; ctx.fill(body); }
      // lower teeth (pointing up into the mouth)
      const tooth = (ax, ay, bx, by, n, up, len) => {
        ctx.fillStyle = DW.tooth; ctx.strokeStyle = MW.outline; ctx.lineWidth = 1;
        for (let i = 0; i < n; i++) {
          const q = (i + 0.5) / n, x = ax + (bx - ax) * q, y = ay + (by - ay) * q;
          const L = len * (0.7 + 0.5 * Math.sin(q * Math.PI)) * (0.8 + 0.4 * h01(i, seed));
          const nx = -(by - ay), ny = bx - ax, nl = Math.hypot(nx, ny) || 1;
          const dx = (nx / nl) * up * L, dy = (ny / nl) * up * L;
          ctx.beginPath(); ctx.moveTo(x - (bx - ax) / n * 0.38, y - (by - ay) / n * 0.38); ctx.lineTo(x + dx, y + dy); ctx.lineTo(x + (bx - ax) / n * 0.38, y + (by - ay) / n * 0.38); ctx.closePath(); ctx.fill(); ctx.stroke();
        }
      };
      if (sc > 0.55) tooth(J.x + 3, J.y, lipT.x, lipT.y, 5, -1, 6 * sc);
      // upper head (crown + snout), rotated open around the hinge
      ctx.save();
      ctx.translate(J.x, J.y); ctx.rotate(tilt + ua); ctx.scale(sc, sc);
      const head = new Path2D();
      head.moveTo(-8, 7);
      head.bezierCurveTo(-14, -8, -2, -24, 16, -21);
      head.bezierCurveTo(30, -18, 39, -8, 37, -1);
      head.lineTo(35, 2.5);
      head.lineTo(0, 2.5);
      head.closePath();
      if (ch) ch.shape(ctx, head, { fill: dead ? '#625c6e' : '#7e778f', box: [-12, -24, 38, 4], light: -1, shade: 0.45, hi: 0.3, lw: 2, rim: DW.dustHi, rimWidth: 1.6 });
      else { ctx.fillStyle = DW.dust; ctx.fill(head); }
      // dust ridges
      ctx.strokeStyle = 'rgba(40,36,52,0.55)'; ctx.lineWidth = 1.2;
      ctx.beginPath(); ctx.moveTo(-4, -10); ctx.quadraticCurveTo(6, -16, 18, -16); ctx.moveTo(0, -3); ctx.quadraticCurveTo(10, -9, 24, -9); ctx.stroke();
      // upper teeth (hanging down)
      tooth(2, 2.5, 34, 2.5, 6, 1, 7);
      // eyes: three small pale pinpricks
      if (!dead) {
        for (const [ex, ey, r] of [[14, -12, 2.1], [21, -10.5, 1.7], [8.5, -10, 1.4]]) {
          glow(ctx, ex, ey, 7, '#c8a8ff', 0.5);
          ctx.fillStyle = DW.eye; ctx.beginPath(); ctx.arc(ex, ey, r, 0, TAU); ctx.fill();
        }
      } else {
        ctx.strokeStyle = MW.outline; ctx.lineWidth = 1;
        ctx.beginPath(); ctx.moveTo(12, -13); ctx.lineTo(16, -11); ctx.moveTo(19, -11.5); ctx.lineTo(23, -9.5); ctx.stroke();
      }
      ctx.restore();
    }
    // heap in front (hides the column's base)
    if (ch) ch.shape(ctx, heap, { fill: dead ? '#5a5466' : '#6c6680', box: [-38, -hh, 40, 0], light: -1, shade: 0.55, hi: 0.3, lw: 2, rim: DW.dustHi, rimWidth: 1.2 });
    else { ctx.fillStyle = DW.dust; ctx.fill(heap); }
    ctx.fillStyle = 'rgba(214,206,226,0.5)';
    for (let i = 0; i < 9; i++) { ctx.beginPath(); ctx.arc(-30 + h01(i, seed) * 62, -2 - h01(i, seed + 3) * hh * 0.8, 0.9 + h01(i, 5) * 0.8, 0, TAU); ctx.fill(); }
    if (rise < 0.05 && !dead) {
      // the tell: tooth-tips barely showing through the dust and, now and then, two pale eyes opening
      ctx.fillStyle = DW.toothShade; ctx.strokeStyle = MW.outline; ctx.lineWidth = 0.9;
      for (let i = 0; i < 3; i++) { const x = 4 + i * 6; ctx.beginPath(); ctx.moveTo(x - 2, -hh * 0.82 + 3); ctx.lineTo(x, -hh * 0.82 - 2 - trem * 3); ctx.lineTo(x + 2, -hh * 0.82 + 3); ctx.fill(); ctx.stroke(); }
      const bl = trem > 0 ? 1 : Math.max(0, Math.sin(t * 0.7 + seed) - 0.82) * 5.5;
      if (bl > 0.02) {
        for (const ex of [-6, 2]) { glow(ctx, ex, -hh * 0.62, 6, '#c8a8ff', 0.45 * bl); ctx.fillStyle = 'rgba(239,228,255,' + Math.min(1, bl).toFixed(3) + ')'; ctx.beginPath(); ctx.ellipse(ex, -hh * 0.62, 1.6, 1.6 * Math.min(1, bl), 0, 0, TAU); ctx.fill(); }
      }
    }
  }

  class DustMaw extends G.Enemy {
    constructor(props) {
      super(props, {
        hp: 52, w: 46, h: 58, weight: 12, cinders: [7, 12], sight: 7 * TILE, contactInset: 6,
        colors: { body: DW.dust, dark: DW.dustShade, hit: '#ffffff', smoke: '#5c566a', puddle: '#5e5868', tele: MW.tele },
        puddleW: 30, meltTime: 0.7,
      });
      this.puddleWick = false;
      this.beat = propTiles(this, 'range', 3);
      this.trigger = propTiles(this, 'trigger', 2.5);
      this.rise = 0; this.open = 0; this.tilt = 0; this.stretch = 1; this.trem = 0;
    }
    init() { super.init(); this.hide(); this.setState('lurk'); this.cooldown('ambush', 0.8); }
    bodyRect() { const r = clamp(this.rise, 0.25, 1), hh = this.h * r; return { x: this.x, y: this.y + this.h - hh, w: this.w, h: hh }; }
    hurtRect() { return (this.hidden || this.dying) ? null : this.bodyRect(); }
    contactRect() {
      if (this.dying || this.hidden || this.contactGrace || this.rise < 0.3) return null;
      const b = this.bodyRect(), i = this.cfg.contactInset;
      return { x: b.x + i, y: b.y + i, w: b.w - 2 * i, h: Math.max(2, b.h - 2 * i) };
    }
    /** The bite: forward and up (the maw lunges up out of the dust). */
    biteRect() {
      const f = this.facing, fy = this.y + this.h;
      return { x: f > 0 ? this.cx - 0.6 * TILE : this.cx - 2.2 * TILE, y: fy - 2.7 * TILE, w: 2.8 * TILE, h: 2.7 * TILE };
    }
    dust(n, spread) {
      for (let k = 0; k < n; k++) fxSpawn({ x: this.cx + rnd(-spread, spread), y: this.y + this.h - rnd(0, 10), vx: rnd(-60, 60), vy: rnd(-160, -40), life: rnd(0.5, 1.1), size: rnd(2, 4.5), size2: 1, color: Math.random() < 0.5 ? '#8a8498' : '#5e586e', alpha: 0.6, gravity: 220, drag: 1.2 });
    }
    think(dt) {
      const p = this.player;
      if (this.is('lurk') && !this.hidden) this.setState('gape', { n: 2 });    // revealed by a script / test
      this.trem = this.is('tremble') ? clamp(this.stateTime / 0.15, 0, 1) : toward(this.trem, 0, dt * 6);
      this.vx = 0;
      switch (this.state) {
        case 'lurk': {
          this.rise = toward(this.rise, 0, dt * 3); this.open = toward(this.open, 0, dt * 3);
          if (!this.targetable(p)) break;
          if (this.ready('ambush') && !playerInZone(this) && this.ambushReady(this.trigger, { vRange: 2.6 * TILE })) { this.face(p); this.setState('tremble'); break; }
          // creep toward the Wickling under the dust (slow, inside its beat)
          if (this.grounded && this.ambushReady(6 * TILE, { vRange: 2.5 * TILE, sight: true })) {
            const dir = this.dirTo(p);
            if (Math.abs(this.dx(p)) > this.trigger * 0.6 && canStep(this, dir, this.beat)) {
              this.vx = dir * 34; this.facing = dir;
              if (Math.random() < dt * 6) this.dust(1, 26);
            }
          }
          break;
        }
        case 'tremble': {   // telegraph (still hidden): the heap shudders, heaps up and spits grit
          if (this.once('tele')) this.stateData.w = this.telegraph(0.5, { color: MW.tele, sound: 'dust_stir', vol: 0.9, shake: 2.2, x: this.cx, y: this.y + this.h - 12 });
          if (this.targetable(p)) this.face(p);
          if (Math.random() < dt * 30) this.dust(1, 30);
          if (this.stateTime >= this.stateData.w) {
            this.reveal(); this.setState('bite', { n: 1 });
            sfx('maw_snap', this.cx, { vol: 1 });
            this.dust(14, 30);
            if (G.game && G.game.shake) G.game.shake(3, 0.15);
          }
          break;
        }
        case 'bite': {      // erupt, jaws wide, snap at 0.1 s
          const st = this.stateTime;
          this.rise = clamp(0.2 + (st / 0.1) * 0.8, 0, 1);
          this.stretch = st < 0.16 ? 1 + 0.32 * Math.sin(clamp(st / 0.16, 0, 1) * Math.PI) : toward(this.stretch, 1, dt * 4);
          this.open = st < 0.09 ? 1 : toward(this.open, 0.06, dt * 16);
          this.tilt = toward(this.tilt, 0.32, dt * 6);
          if (st >= 0.05 && st <= 0.2) this.strike(this.biteRect(), { dir: { x: this.facing, y: -0.5 } });
          if (st > 0.26) this.setState('gape', { n: this.stateData.n });
          break;
        }
        case 'gape': {      // recovery: the maw hangs open, panting dust (punish window)
          this.rise = toward(this.rise, 1, dt * 4); this.stretch = toward(this.stretch, 1, dt * 4);
          this.open = toward(this.open, 0.6 + 0.08 * Math.sin(this.t * 5), dt * 2.5);
          this.tilt = toward(this.tilt, 0.05, dt * 2);
          if (Math.random() < dt * 5) this.dust(1, 18);
          if (this.stateTime > 0.9) {
            const n = this.stateData.n || 1;
            if (n < 2 && this.targetable(p) && !playerInZone(this) && this.ambushReady(this.trigger * 0.95, { vRange: 2.6 * TILE })) this.setState('rebite', { n });
            else { this.setState('sink'); sfx('maw_sink', this.cx, { vol: 0.8 }); }
          }
          break;
        }
        case 'rebite': {    // second telegraph, exposed: jaws close, the maw draws back low
          if (this.once('tele')) this.stateData.w = this.telegraph(0.45, { color: MW.tele, sound: 'dust_stir', vol: 0.6, shake: 1.4 });
          if (this.targetable(p)) this.face(p);
          this.open = toward(this.open, 0.25, dt * 4); this.tilt = toward(this.tilt, -0.3, dt * 3);
          this.rise = toward(this.rise, 0.8, dt * 2);
          if (this.stateTime >= this.stateData.w) { this.setState('bite', { n: this.stateData.n + 1 }); sfx('maw_snap', this.cx, { vol: 0.9 }); this.dust(8, 24); }
          break;
        }
        case 'sink': {
          this.rise = Math.max(0, 1 - this.stateTime / 0.5);
          this.open = toward(this.open, 0, dt * 4); this.tilt = toward(this.tilt, 0, dt * 3);
          if (Math.random() < dt * 20) this.dust(1, 24);
          if (this.stateTime >= 0.5) { this.hide(); this.cooldown('ambush', 1.5); this.setState('lurk'); }
          break;
        }
        default: this.hide(); this.setState('lurk');
      }
    }
    onHurt() { this.open = Math.max(0.15, this.open - 0.3); this.tilt -= 0.12; }
    eye() { return { x: this.cx + this.facing * 8, y: this.y + this.h - 20 - 40 * this.rise }; }
    drawBounds() { return { x: this.cx - 70, y: this.y + this.h - 150, w: 140, h: 156 }; }
    drawBody(ctx, t) {
      const fx = this.cx, fy = this.y + this.h;
      ctx.save();
      ctx.translate(fx, fy); ctx.scale(this.facing, 1);
      drawMaw(ctx, t, this.seed, this.rise, this.open, this.tilt, this.trem, this.stretch, false);
      ctx.restore();
      if (this.rise > 0.2) light({ x: fx + this.facing * 10, y: fy - 50 * this.rise, r: 60, color: '#b890ff', intensity: 0.22 * this.rise, flicker: false });
    }
    drawCorpse(ctx, t) {
      ctx.save(); ctx.translate(this.cx, this.y + this.h); ctx.scale(this.facing, 1);
      drawMaw(ctx, t, this.seed, Math.max(0.6, this.rise), 0.7, 0.4, 0, 1, true);
      ctx.restore();
    }
  }
  G.registerEnemy('dust_maw', DustMaw);

  // ================================================================== moth_knight
  const MK = {
    armor: '#67558a', armorHi: '#bcaade', trim: '#cfc1e8', dark: '#2a2138', cloth: '#3c3050', leg: '#3a3050',
    ruff: '#e8def4', ruffShade: '#b4a7c8', helm: '#483c64', eye: '#f6eeff',
    wing: '#8e7e9e', wingBand: '#d4c6e2', wingTip: '#3a2e48', spot: '#c8a8ff', spotRing: '#f0e8fa',
    blade: '#e4def2', bladeHi: '#ffffff', hilt: '#1c1626', plume: '#ddd2ec',
  };
  const KPOSE = {
    guard:   { crouch: 0.15, lean: 0.08, arm: 0.75, blade: -0.45, wing: 0.05, head: 0 },
    notice:  { crouch: 0.0, lean: -0.06, arm: -0.4, blade: -1.5, wing: 0.18, head: -0.08 },
    ready:   { crouch: 0.85, lean: 0.42, arm: 2.5, blade: 2.75, wing: 0.35, head: 0.1 },
    dash:    { crouch: 0.6, lean: 0.58, arm: 2.4, blade: 2.85, wing: 0.22, head: 0.1 },
    pull:    { crouch: 0.35, lean: -0.08, arm: -2.0, blade: -2.35, wing: 0.25, head: -0.1 },
    recover: { crouch: 0.55, lean: 0.36, arm: 1.15, blade: 1.3, wing: 0.1, head: 0.28 },
    hop:     { crouch: 0.25, lean: -0.15, arm: 0.9, blade: -0.25, wing: 0.75, head: -0.1 },
    rise:    { crouch: 0.9, lean: 0.25, arm: 2.9, blade: -0.1, wing: 1, head: 0 },
    lunge:   { crouch: 0.1, lean: 0.9, arm: 0.05, blade: 0, wing: 0.85, head: -0.1 },
    land:    { crouch: 0.75, lean: 0.32, arm: 0.9, blade: 0.6, wing: 0.45, head: 0.1 },
    dead:    { crouch: 1, lean: 0.6, arm: 1.3, blade: 1.45, wing: 0, head: 0.55 },
  };
  const MK_STATE_POSE = { patrol: 'guard', engage: 'guard', notice: 'notice', ready: 'ready', dash: 'dash', pull: 'pull', recover: 'recover', hop: 'hop', evade: 'hop', vault: 'hop', rise: 'rise', lunge: 'lunge', land: 'land' };
  const KW = { fore: null, hind: null };
  function kWings() {
    if (KW.fore) return;
    const f = new Path2D();
    f.moveTo(0, -2);
    f.bezierCurveTo(14, -10, 34, -12, 46, -6);
    f.quadraticCurveTo(50, -2, 46, 3);
    f.quadraticCurveTo(38, 6, 32, 5); f.quadraticCurveTo(26, 9, 20, 7); f.quadraticCurveTo(12, 9, 0, 3);
    f.closePath();
    const h = new Path2D();
    h.moveTo(0, 0);
    h.bezierCurveTo(10, 2, 26, 2, 31, 9);
    h.bezierCurveTo(33, 17, 20, 20, 12, 15);
    h.bezierCurveTo(6, 12, 2, 6, 0, 0);
    h.closePath();
    KW.fore = f; KW.hind = h;
  }
  /** Moth knight art in local feet space (origin = feet centre, +x = facing). P = pose; o = {walk, t, seed, flap, slash, dead, eyeK}. */
  function drawKnight(ctx, P, o) {
    const ch = CH();
    kWings();
    const t = o.t || 0;
    const c = P.crouch, L = P.lean;
    const hipY = -27 + 9 * c;
    const walk = o.walk || 0, stride = o.stride || 0;
    const shape = (path, fill, box, extra) => {
      if (ch) ch.shape(ctx, path, Object.assign({ fill, box, light: -1, shade: 0.45, lw: 1.8 }, extra || {}));
      else { ctx.fillStyle = fill; ctx.fill(path); }
    };
    const strokeLimb = (pts, w, col) => {
      ctx.lineCap = 'round'; ctx.lineJoin = 'round';
      ctx.strokeStyle = MW.outline; ctx.lineWidth = w + 3.4;
      ctx.beginPath(); ctx.moveTo(pts[0][0], pts[0][1]); for (let i = 1; i < pts.length; i++) ctx.lineTo(pts[i][0], pts[i][1]); ctx.stroke();
      ctx.strokeStyle = col; ctx.lineWidth = w;
      ctx.beginPath(); ctx.moveTo(pts[0][0], pts[0][1]); for (let i = 1; i < pts.length; i++) ctx.lineTo(pts[i][0], pts[i][1]); ctx.stroke();
    };
    // upper body transform: rotate around the hip by the lean
    const cl = Math.cos(L), sl = Math.sin(L);
    const U = (x, y) => [x * cl - y * sl, hipY + x * sl + y * cl];    // local (relative to hip, y up negative) → feet space
    const shoulder = U(3, -18);
    // ---- wings (behind everything)
    const wingRoot = U(-4, -17);
    const flap = o.flap || 0;
    for (const far of [true, false]) {
      const w = P.wing;
      const base = far ? lerp(1.8, 3.75, w) : lerp(1.68, 4.0, w);
      const ang = base + L + (w > 0.5 ? Math.sin(flap + (far ? 0.6 : 0)) * 0.22 * w : 0);
      const scl = 0.85 + 0.28 * w;
      ctx.save();
      ctx.translate(wingRoot[0] + (far ? 2 : 0), wingRoot[1] + (far ? -1 : 0));
      ctx.rotate(ang);
      ctx.scale(scl * lerp(1.05, 1, w), (far ? 0.9 : 1) * lerp(0.5, 1, w));
      ctx.globalAlpha = far ? 0.85 : 1;
      if (w > 0.25) {   // hind wing shows when the wings open
        ctx.save(); ctx.rotate(0.35 * w); ctx.globalAlpha *= clamp((w - 0.25) * 2, 0, 1);
        shape(KW.hind, far ? '#6a4c6c' : '#946e8a', [0, 0, 32, 20], { shade: 0.5 });
        ctx.restore();
      }
      shape(KW.fore, far ? '#685a7e' : MK.wing, [0, -12, 48, 9], { shade: 0.5, rim: '#e0d4f0', rimWidth: 1.4 });
      ctx.save(); ctx.clip(KW.fore);
      ctx.strokeStyle = MK.wingTip; ctx.lineWidth = 8; ctx.beginPath(); ctx.moveTo(40, -14); ctx.quadraticCurveTo(52, -2, 40, 10); ctx.stroke();
      ctx.strokeStyle = MK.wingBand; ctx.lineWidth = 3.5; ctx.globalAlpha *= 0.8;
      ctx.beginPath(); ctx.moveTo(24, -11); ctx.quadraticCurveTo(29, -1, 23, 9); ctx.stroke();
      ctx.restore();
      if (!far) {     // eye-spot (echo of the Duchess)
        ctx.fillStyle = MK.wingTip; ctx.beginPath(); ctx.arc(14, -2, 5, 0, TAU); ctx.fill();
        ctx.fillStyle = MK.spotRing; ctx.beginPath(); ctx.arc(14, -2, 3.8, 0, TAU); ctx.fill();
        ctx.fillStyle = MK.spot; ctx.beginPath(); ctx.arc(14.3, -2, 2.3, 0, TAU); ctx.fill();
      }
      ctx.restore();
    }
    ctx.globalAlpha = 1;
    // ---- legs (far leg first)
    for (const near of [false, true]) {
      const ph = walk + (near ? 0 : Math.PI);
      const fxp = (near ? 5 : -5) + Math.sin(ph) * stride * 7;
      const lift = Math.max(0, Math.cos(ph)) * stride * 4;
      const hip = [near ? 2 : -2, hipY + 2];
      const foot = [fxp, -lift];
      const kx = (hip[0] + foot[0]) / 2 + 6 + 5 * c, ky = (hip[1] + foot[1]) / 2 - 1;
      strokeLimb([hip, [kx, ky], foot], near ? 5 : 4.6, near ? MK.leg : '#272033');
      ctx.fillStyle = near ? '#4a3e5c' : '#2a2238'; ctx.strokeStyle = MW.outline; ctx.lineWidth = 1.4;
      ctx.beginPath(); ctx.moveTo(foot[0] - 4, foot[1]); ctx.lineTo(foot[0] + 8, foot[1]); ctx.lineTo(foot[0] + 1, foot[1] - 4); ctx.closePath(); ctx.fill(); ctx.stroke();
    }
    // ---- far arm (a short dark stroke)
    strokeLimb([U(-1, -17), U(-4, -8), U(-1, -2)], 3.6, '#221a2e');
    // ---- tassets (tattered cloth skirt)
    ctx.save(); ctx.translate(0, hipY); ctx.rotate(L * 0.5);
    const sk = new Path2D();
    sk.moveTo(-8, -4); sk.lineTo(8, -4); sk.lineTo(10, 9); sk.lineTo(6, 6); sk.lineTo(3, 11); sk.lineTo(-1, 7); sk.lineTo(-4, 12); sk.lineTo(-7, 7); sk.lineTo(-10, 10); sk.closePath();
    shape(sk, MK.cloth, [-10, -4, 10, 12], { shade: 0.4 });
    ctx.restore();
    // ---- torso (cuirass)
    ctx.save(); ctx.translate(0, hipY); ctx.rotate(L);
    const tor = new Path2D();
    tor.moveTo(-6, 0); tor.quadraticCurveTo(-10, -12, -8, -21); tor.lineTo(8, -22); tor.quadraticCurveTo(11, -12, 6, 0); tor.closePath();
    shape(tor, MK.armor, [-10, -22, 11, 0], { rim: MK.armorHi, rimWidth: 1.5 });
    ctx.strokeStyle = MK.trim; ctx.lineWidth = 1.3;
    ctx.beginPath(); ctx.moveTo(2, -20); ctx.quadraticCurveTo(4, -10, 1, -1); ctx.moveTo(-6, -2); ctx.lineTo(6, -2); ctx.stroke();
    // ruff: fluffy pale moth collar
    for (let i = 0; i < 8; i++) {
      const a = Math.PI * (0.95 + i * 0.16);
      const rx = 1 + Math.cos(a) * 8, ry = -22 + Math.sin(a) * 4.5 + 1.5;
      ctx.fillStyle = i % 2 ? MK.ruffShade : MK.ruff; ctx.strokeStyle = MW.outline; ctx.lineWidth = 1.2;
      ctx.beginPath(); ctx.arc(rx, ry, 4.4 - (i % 3) * 0.4, 0, TAU); ctx.fill(); ctx.stroke();
    }
    ctx.fillStyle = MK.ruff;
    ctx.beginPath(); ctx.ellipse(2, -23, 7.5, 4, 0, 0, TAU); ctx.fill();
    // ---- head: helm with a beaked visor, glowing eye, plumed antennae
    ctx.save(); ctx.translate(2, -28); ctx.rotate(P.head);
    ctx.strokeStyle = MK.plume; ctx.lineWidth = 1.2; ctx.lineCap = 'round';
    for (const k of [0, 1]) {
      const sway = o.dead ? 0.4 : Math.sin(t * 2.4 + k * 1.3 + (o.seed || 0)) * 1.4 - (o.vx || 0) * 0.004;
      const ax = -1 + k * 2, ay = -6;
      const ex = -16 + k * 5 + sway, ey = o.dead ? -10 : -24 + k * 2;
      ctx.beginPath(); ctx.moveTo(ax, ay); ctx.quadraticCurveTo(ax - 2, ey + 4, ex, ey); ctx.stroke();
      ctx.beginPath();
      for (let j = 1; j <= 7; j++) {
        const q = j / 8, px = ax + (ex - ax) * q, py = ay + (ey - ay) * q - Math.sin(q * Math.PI) * 2;
        const ln = 3.4 * Math.sin(q * Math.PI) + 0.8;
        ctx.moveTo(px, py); ctx.lineTo(px - ln * 0.4, py - ln);
        ctx.moveTo(px, py); ctx.lineTo(px + ln * 0.5, py + ln * 0.6);
      }
      ctx.stroke();
    }
    const helm = new Path2D();
    helm.moveTo(-6, 3); helm.quadraticCurveTo(-8, -6, -1, -8.5); helm.quadraticCurveTo(6, -8, 8, -3); helm.lineTo(11, 0); helm.lineTo(6, 3.5); helm.closePath();
    shape(helm, MK.helm, [-8, -9, 11, 4], { rim: '#8a7aa8', rimWidth: 1.3, lw: 1.8 });
    const ek = o.dead ? 0 : (o.eyeK == null ? 0.5 : o.eyeK);
    if (ek > 0) {
      glow(ctx, 5, -2.5, 7 + 6 * ek, '#c8a8ff', 0.35 + 0.4 * ek);
      ctx.fillStyle = MK.eye; ctx.beginPath(); ctx.ellipse(5, -2.5, 2.4, 1.3, -0.2, 0, TAU); ctx.fill();
      ctx.fillStyle = 'rgba(242,232,255,0.6)'; ctx.beginPath(); ctx.ellipse(1, -2.8, 1.3, 1, -0.2, 0, TAU); ctx.fill();
    }
    ctx.restore();
    ctx.restore();
    // ---- near arm + needle blade
    const ha = P.arm, ba = P.blade;
    const hand = [shoulder[0] + Math.cos(ha) * 14, shoulder[1] + Math.sin(ha) * 14];
    const el = [(shoulder[0] + hand[0]) / 2 - Math.sin(ha) * 2, (shoulder[1] + hand[1]) / 2 + Math.cos(ha) * 2];
    // slash crescent (behind the blade)
    if (o.slash) {
      const s = o.slash, R1 = 55, n = 14;
      const a0 = s.from, dir = s.to > a0 ? 1 : -1, tail = s.cur - dir * Math.min(Math.abs(s.cur - a0), 1.8);
      const sx0 = shoulder[0], sy0 = shoulder[1];
      ctx.save();
      ctx.globalCompositeOperation = 'lighter';
      ctx.beginPath();
      for (let i = 0; i <= n; i++) { const a = tail + (s.cur - tail) * (i / n); ctx.lineTo(sx0 + Math.cos(a) * R1, sy0 + Math.sin(a) * R1); }
      for (let i = n; i >= 0; i--) { const a = tail + (s.cur - tail) * (i / n), r = R1 - (2 + 15 * Math.pow(i / n, 1.5)); ctx.lineTo(sx0 + Math.cos(a) * r, sy0 + Math.sin(a) * r); }
      ctx.closePath();
      ctx.fillStyle = 'rgba(200,176,255,' + (0.5 * s.alpha).toFixed(3) + ')'; ctx.fill();
      ctx.strokeStyle = 'rgba(255,248,255,' + (0.9 * s.alpha).toFixed(3) + ')'; ctx.lineWidth = 2;
      ctx.beginPath(); ctx.arc(sx0, sy0, R1 - 1.5, s.cur - dir * Math.min(0.9, Math.abs(s.cur - tail)), s.cur, dir < 0); ctx.stroke();
      ctx.restore();
    }
    strokeLimb([shoulder, el, hand], 4.2, MK.armor);
    // blade: thin curved sabre from the hand along `ba`
    const bl = 38, bc = Math.cos(ba), bs = Math.sin(ba);
    const tip = [hand[0] + bc * bl, hand[1] + bs * bl];
    const mid = [hand[0] + bc * bl * 0.55 - bs * 3, hand[1] + bs * bl * 0.55 + bc * 3];
    ctx.lineCap = 'round';
    ctx.strokeStyle = MW.outline; ctx.lineWidth = 4.6;
    ctx.beginPath(); ctx.moveTo(hand[0], hand[1]); ctx.quadraticCurveTo(mid[0], mid[1], tip[0], tip[1]); ctx.stroke();
    ctx.strokeStyle = MK.blade; ctx.lineWidth = 2.4;
    ctx.beginPath(); ctx.moveTo(hand[0], hand[1]); ctx.quadraticCurveTo(mid[0], mid[1], tip[0], tip[1]); ctx.stroke();
    ctx.strokeStyle = MK.bladeHi; ctx.lineWidth = 0.9;
    ctx.beginPath(); ctx.moveTo(hand[0] + bc * 8, hand[1] + bs * 8); ctx.quadraticCurveTo(mid[0], mid[1], tip[0], tip[1]); ctx.stroke();
    if (o.glint) glow(ctx, tip[0], tip[1], 10 + 8 * o.glint, '#ffffff', 0.5 * o.glint);
    // crossguard + hand
    ctx.strokeStyle = MW.outline; ctx.lineWidth = 4;
    ctx.beginPath(); ctx.moveTo(hand[0] - bs * 5, hand[1] + bc * 5); ctx.lineTo(hand[0] + bs * 5, hand[1] - bc * 5); ctx.stroke();
    ctx.strokeStyle = '#8c7aa8'; ctx.lineWidth = 2;
    ctx.beginPath(); ctx.moveTo(hand[0] - bs * 5, hand[1] + bc * 5); ctx.lineTo(hand[0] + bs * 5, hand[1] - bc * 5); ctx.stroke();
    ctx.fillStyle = MK.dark; ctx.beginPath(); ctx.arc(hand[0], hand[1], 3, 0, TAU); ctx.fill();
    ctx.lineCap = 'butt'; ctx.lineJoin = 'miter';
  }

  class MothKnight extends G.Enemy {
    constructor(props) {
      super(props, {
        hp: 63, w: 34, h: 64, weight: 2.5, cinders: [12, 18], sight: 9 * TILE, knockback: 300,
        colors: { body: MK.armor, dark: MK.dark, hit: '#ffffff', smoke: MW.smoke, puddle: '#3e3450', tele: MW.tele },
        puddleW: 26,
      });
      this.beat = propTiles(this, 'range', 4);
      this.pose = Object.assign({}, KPOSE.guard);
      this.walk = 0; this.stride = 0; this.flapW = 0; this.hurtT = 0; this.turnT = 0; this.lost = 0; this.pausing = 0;
      this.seenSlash = null; this.slashFx = null; this.glintK = 0;
    }
    init() { super.init(); this.setState('patrol'); this.cooldown('attack', 0.9); this.cooldown('lunge', rnd(2.5, 3.5)); this.cooldown('evade', 2); }
    sees(p) {
      if (!this.canSee(p)) return false;
      const pc = pCenter(p);
      return Math.abs(pc.y - this.cy) < 3.5 * TILE && Math.abs(pc.x - this.home.x) < this.beat + 7 * TILE;
    }
    /** Close by, the Wickling peering down from a step lip: look from the top of the head instead of the visor. */
    seesOverLip(p) {
      const pc = pCenter(p);
      if (Math.abs(pc.x - this.cx) > 5 * TILE || Math.abs(pc.y - this.cy) > 4 * TILE) return false;
      return !G.Physics.raycast(this.room, this.cx, this.y - 6, pc.x, pc.y).hit;
    }
    slashRect(n) {
      const f = this.facing, top = this.y;
      if (n === 1) return { x: f > 0 ? this.cx - 6 : this.cx + 6 - 1.7 * TILE, y: top + 8, w: 1.7 * TILE, h: 1.35 * TILE };
      return { x: f > 0 ? this.cx - 10 : this.cx + 10 - 1.6 * TILE, y: top - 0.8 * TILE, w: 1.6 * TILE, h: 2.3 * TILE };
    }
    /** Back-hop target is floor, inside the beat, not a hazard / pit / exit zone, no wall in between. */
    safeHop(dir, dist) {
      const room = this.room;
      if (!room || !this.grounded) return false;
      const d = dist || 2.6 * TILE;
      const lx = this.cx + dir * d;
      if (Math.abs(lx - this.home.x) > this.beat + TILE) return false;
      if (G.Physics.rectSolid(room, Math.min(this.x, this.x + dir * d), this.y - 30, this.w + d, this.h)) return false;
      const fy = safeFloor(this, lx, this.y + this.h, TILE * 0.6);
      return fy != null && Math.abs(fy - (this.y + this.h)) < 4;
    }
    /** A low step (1-2 tiles) right ahead in dir: the landing point on its top if the knight can vault onto it (headroom,
     *  safe floor, inside its beat, not an exit zone), else null. */
    vaultTarget(dir) {
      const room = this.room;
      if (!room || !this.grounded || !this.home) return null;
      const foot = this.y + this.h, fr = Math.round(foot / TILE);
      const c = Math.floor((dir > 0 ? this.x + this.w + 10 : this.x - 10) / TILE);
      let k = 0;
      while (k < 3 && solidTile(room, c, fr - 1 - k)) k++;
      if (k < 1 || k > 2) return null;
      const top = (fr - k) * TILE;
      const lx = dir > 0 ? c * TILE + this.w / 2 + 6 : (c + 1) * TILE - this.w / 2 - 6;
      if (Math.abs(lx - this.home.x) > this.beat + TILE || inZone(this, lx, top - TILE)) return null;
      const x0 = Math.min(this.x, lx - this.w / 2), x1 = Math.max(this.x + this.w, lx + this.w / 2);
      if (G.Physics.rectSolid(room, x0, top - this.h - 26, x1 - x0, this.h + 24)) return null;
      if (safeFloor(this, lx, top, 4) !== top) return null;
      return { x: lx, y: top };
    }
    /** Step off a ledge in dir onto safe floor at most 3 tiles below (inside the beat, not a pit / hazard / exit zone)? */
    dropOk(dir) {
      if (!this.grounded || !this.home || this.wallAhead(dir) || !this.ledgeAhead(dir)) return false;
      const ax = this.cx + dir * (this.w / 2 + 14);
      if (Math.abs(ax - this.home.x) > this.beat + TILE || inZone(this, ax, this.cy)) return false;
      const fy = safeFloor(this, ax + dir * 8, this.y + this.h + 4, 3 * TILE);
      return fy != null && fy > this.y + this.h + 2;
    }
    planLunge() {
      const p = this.player, room = this.room;
      if (!room || !this.targetable(p)) return null;
      const sx = this.cx, sy = this.y + this.h * 0.45;
      const tx = p.x + p.w / 2 + clamp(p.vx || 0, -300, 300) * 0.1, ty = p.y + p.h * 0.45;
      const dx = tx - sx, dy = ty - sy, d = Math.hypot(dx, dy);
      if (d < 2.2 * TILE) return null;
      const ux = dx / d, uy = dy / d;
      if (uy > 0.45 || Math.abs(ux) < 0.35) return null;      // never steeply down, never straight up
      const len = Math.min(d + 0.6 * TILE, 5.2 * TILE);
      for (let i = 1; i <= 10; i++) {
        const k = (len * i) / 10, bx = this.x + ux * k, by = this.y + uy * k;
        if (G.Physics.rectSolid(room, bx + 2, by + 2, this.w - 4, this.h - 4)) return null;
        if (inZone(this, bx + this.w / 2, by + this.h / 2)) return null;
      }
      const ex = sx + ux * len, ey = this.y + this.h + uy * len;
      if (Math.abs(ex - this.home.x) > this.beat + 1.5 * TILE) return null;
      if (safeFloor(this, ex, ey, 6 * TILE) == null) return null;
      return { ux, uy, len };
    }
    poseTarget() {
      const P = KPOSE[MK_STATE_POSE[this.state] || 'guard'];
      return P;
    }
    think(dt) {
      const p = this.player;
      this.hurtT = Math.max(0, this.hurtT - dt);
      this.glintK = toward(this.glintK, 0, dt * 3);
      const st = this.state;
      switch (st) {
        case 'patrol': {
          if (this.grounded) {
            if (this.pausing > 0) { this.pausing -= dt; this.vx = 0; if (this.pausing <= 0) this.facing = -this.facing; }
            else if (!canStep(this, this.facing, this.beat)) { this.vx = 0; this.pausing = 0.7; }
            else this.vx = this.facing * 52;
          }
          if (this.sees(p)) { this.pausing = 0; this.setState('notice'); }
          break;
        }
        case 'notice':   // a quick salute: blade up before the visor
          this.vx = 0; this.face(p);
          if (this.stateTime > 0.4) this.setState('engage');
          break;
        case 'engage': {
          if (!this.targetable(p) || !(this.canSee(p, 11 * TILE) || this.seesOverLip(p))) { this.lost += dt; this.vx = toward(this.vx, 0, 900 * dt); if (this.lost > 1.4) { this.lost = 0; this.setState('patrol'); } break; }
          this.lost = 0;
          const want = this.dirTo(p);
          if (want !== this.facing) { this.turnT += dt; if (this.turnT > 0.16) { this.facing = want; this.turnT = 0; } } else this.turnT = 0;
          const adx = Math.abs(this.dx(p)), ady = this.dy(p);
          // evade: a back-hop away from a swing that starts close in front (now and then)
          const sl = p.slash;
          if (sl && sl !== this.seenSlash) {
            this.seenSlash = sl;
            if (adx < 2.4 * TILE && Math.abs(ady) < 1.5 * TILE && this.ready('evade') && Math.random() < 0.35 && this.safeHop(-this.facing, 2.2 * TILE)) {
              this.cooldown('evade', 3.5); this.setState('evade'); break;
            }
          }
          let mv = 0;
          if (Math.abs(ady) > 0.7 * TILE) { if (adx > 1.2 * TILE) mv = this.facing; }   // other level: close in (vault / drop)
          else if (adx > 3.4 * TILE) mv = this.facing; else if (adx < 2.3 * TILE) mv = -this.facing;
          // a low step between it and the Wickling: vault up onto it
          if (this.grounded && this.turnT === 0 && adx > 1.2 * TILE && ady < 0.2 * TILE && this.ready('vault')) {
            const v = this.vaultTarget(this.facing);
            if (v) { this.cooldown('vault', 1.1); this.setState('vault', v); break; }
          }
          if (mv && this.grounded && (canStep(this, mv, this.beat) || (mv === this.facing && this.dropOk(mv)))) {
            this.vx = toward(this.vx, mv * (mv === this.facing ? 120 : 95), 900 * dt);
          } else this.vx = toward(this.vx, 0, 900 * dt);
          if (!playerInZone(this) && this.grounded && this.turnT === 0) {
            if (this.ready('lunge') && (ady < -1.6 * TILE || adx > 4.6 * TILE) && adx < 7.5 * TILE && ady > -5 * TILE) {
              const plan = this.planLunge();
              if (plan) { this.setState('rise'); break; }
            }
            if (this.ready('attack') && adx < 4.6 * TILE && Math.abs(ady) < 1.4 * TILE && this.facing === this.dirTo(p) &&
              (adx < 1.5 * TILE || canStep(this, this.facing, this.beat))) { this.setState('ready'); break; }
          }
          break;
        }
        case 'ready': {  // telegraph: drops low, blade drawn back, wings twitch open
          this.vx = toward(this.vx, 0, 1400 * dt);
          if (this.once('tele')) { this.stateData.w = this.telegraph(0.45, { color: MW.tele, sound: 'mknight_ready', vol: 0.85, shake: 1.2 }); this.glintK = 1; }
          if (this.stateTime >= this.stateData.w) this.setState('dash', { x0: this.cx });
          break;
        }
        case 'dash': {
          const close = this.targetable(p) && Math.abs(this.dx(p)) < 1.2 * TILE && this.dirTo(p) === this.facing;
          if (close || Math.abs(this.cx - this.stateData.x0) > 2.8 * TILE || this.stateTime > 0.32 || !canStep(this, this.facing, this.beat)) { this.setState('slash1'); break; }
          this.vx = this.facing * 640;
          if (this.every(0.03)) burst('dust', this.cx - this.facing * 12, this.y + this.h, { count: 1, color: '#8a8098' });
          break;
        }
        case 'slash1': {
          if (this.once('sfx')) sfx('mknight_slash', this.cx, { vol: 0.9 });
          this.vx = canStep(this, this.facing, this.beat) ? toward(this.vx, 0, 2600 * dt) : 0;
          if (this.stateTime < 0.14) this.strike(this.slashRect(1), { dir: { x: this.facing, y: -0.2 } });
          if (this.stateTime > 0.2) this.setState('pull');
          break;
        }
        case 'pull': {   // second wind-up (0.36 s): blade hoisted overhead
          this.vx = 0;
          if (this.targetable(p)) this.face(p);
          if (this.once('tele')) { this.stateData.w = this.telegraph(0.36, { color: MW.tele, sound: 'mknight_ready', vol: 0.55, shake: 0.9 }); this.glintK = 1; }
          if (this.stateTime >= this.stateData.w) this.setState('slash2');
          break;
        }
        case 'slash2': {
          if (this.once('step')) { this.vx = canStep(this, this.facing, this.beat) ? this.facing * 260 : 0; sfx('mknight_slash', this.cx, { vol: 1, pitch: 0.85 }); }
          this.vx = canStep(this, this.facing, this.beat) ? toward(this.vx, 0, 1800 * dt) : 0;
          if (this.stateTime < 0.16) this.strike(this.slashRect(2), { dir: { x: this.facing, y: 0.3 } });
          if (this.stateTime > 0.22) this.setState('recover');
          break;
        }
        case 'recover':  // punish window: blade low, shoulders heaving
          this.vx = toward(this.vx, 0, 2000 * dt);
          if (this.stateTime > 0.55) {
            if (this.safeHop(-this.facing)) this.setState('hop');
            else { this.cooldown('attack', rnd(0.9, 1.4)); this.setState('engage'); }
          }
          break;
        case 'hop':
        case 'evade': {
          if (this.once('go')) { this.hop(-this.facing * (st === 'evade' ? 300 : 260), st === 'evade' ? -480 : -560, true); sfx('mknight_flare', this.cx, { vol: 0.5 }); }
          this.flapW += dt * 26;
          if ((this.stateTime > 0.12 && this.grounded) || this.stateTime > 1.5) {
            this.vx = 0;
            if (st === 'hop') this.cooldown('attack', rnd(0.9, 1.4)); else this.cooldown('attack', Math.max(0.35, this.cds.attack || 0));
            this.setState('engage');
          }
          break;
        }
        case 'vault': {  // a wing-assisted hop up a low step (no attack)
          if (this.once('go')) { this.leapTo(this.stateData.x, this.stateData.y, 22); sfx('mknight_flare', this.cx, { vol: 0.45 }); }
          this.flapW += dt * 26;
          if ((this.stateTime > 0.1 && this.grounded) || this.stateTime > 1.2) {
            this.vx = 0; this.cooldown('attack', Math.max(0.3, this.cds.attack || 0)); this.setState('engage');
          }
          break;
        }
        case 'rise': {   // telegraph: wings flare wide, crouch, blade levelled at the Wickling
          this.vx = toward(this.vx, 0, 1400 * dt);
          if (this.targetable(p)) this.face(p);
          if (this.once('tele')) { this.stateData.w = this.telegraph(0.55, { color: MW.tele, sound: 'mknight_flare', vol: 0.9, shake: 1.2 }); this.glintK = 1; }
          this.flapW += dt * 18;
          if (this.stateTime >= this.stateData.w) {
            const plan = playerInZone(this) ? null : this.planLunge();
            if (!plan) { this.cooldown('lunge', 1.5); this.setState('engage'); break; }
            this.facing = plan.ux >= 0 ? 1 : -1;
            this.gravityScale = 0;
            this.setState('lunge', Object.assign({ x0: this.cx, y0: this.cy }, plan));
            sfx('mknight_lunge', this.cx, { vol: 0.95 });
          }
          break;
        }
        case 'lunge': {
          const s = this.stateData;
          this.vx = s.ux * 620; this.vy = s.uy * 620;
          this.flapW += dt * 30;
          const tipx = this.cx + s.ux * 34, tipy = this.y + this.h * 0.45 + s.uy * 34;
          this.strike({ x: tipx - 24, y: tipy - 18, w: 48, h: 36 }, { dir: { x: s.ux, y: s.uy } });
          if (this.every(0.025)) fxSpawn({ x: this.cx - s.ux * 20 + rnd(-8, 8), y: this.cy - s.uy * 20 + rnd(-10, 10), vx: rnd(-30, 30), vy: rnd(-30, 30), life: rnd(0.4, 0.8), size: rnd(1.4, 2.4), size2: 0.3, color: MW.glitter, add: true, gravity: 50, drag: 1.5, shape: 'tri', rot: rnd(0, TAU), vrot: rnd(-6, 6) });
          const gone = Math.hypot(this.cx - s.x0, this.cy - s.y0);
          if (gone >= s.len || this.stateTime > 0.5 || (this.stateTime > 0.05 && (this.wallHit || this.ceilHit || this.grounded))) {
            this.gravityScale = 1; this.vx *= 0.35; this.vy = Math.max(this.vy * 0.2, 0);
            this.setState('land');
          }
          break;
        }
        case 'land': {   // recovery after the lunge (falls, then folds its wings)
          if (this.grounded) { this.vx = toward(this.vx, 0, 1600 * dt); if (!this.stateData.g) { this.stateData.g = this.stateTime; burst('dust', this.cx, this.y + this.h, { count: 6, color: '#8a8098' }); } }
          if ((this.stateData.g != null && this.stateTime - this.stateData.g > 0.6) || this.stateTime > 2) {
            this.cooldown('lunge', rnd(4.5, 6)); this.cooldown('attack', rnd(0.5, 0.9)); this.setState('engage');
          }
          break;
        }
        default: this.setState('patrol');
      }
      // animation state
      const P = this.poseTarget(), cur = this.pose;
      const rate = 1 - Math.exp(-dt * (this.state === 'ready' || this.state === 'pull' || this.state === 'rise' ? 18 : 12));
      for (const k in P) cur[k] = lerp(cur[k], P[k], rate);
      if (this.state === 'slash1' || this.state === 'slash2') {
        const one = this.state === 'slash1';
        const q = ease(this.stateTime / (one ? 0.13 : 0.15));
        const from = one ? 2.75 : -2.35, to = one ? -0.55 : 0.95;
        cur.blade = lerp(from, to, q); cur.arm = lerp(one ? 2.5 : -2.0, one ? -0.1 : 0.85, q);
        cur.crouch = one ? 0.45 : 0.3; cur.lean = one ? 0.5 : 0.42;
        this.slashFx = { from, to, cur: cur.blade, alpha: clamp(1 - (this.stateTime - 0.13) / 0.09, 0, 1) };
      } else this.slashFx = null;
      if (this.state === 'lunge' || this.state === 'rise') {
        const s = this.state === 'lunge' ? this.stateData : null;
        const ang = s ? Math.atan2(s.uy, Math.abs(s.ux)) : (this.targetable(p) ? clamp(Math.atan2(this.dy(p), Math.abs(this.dx(p))), -1.1, 0.4) : 0);
        cur.blade = ang; if (s) { cur.arm = ang; cur.lean = clamp(0.95 + ang * 0.6, 0.2, 1.1); }
      }
      if (this.hurtT > 0) cur.lean -= 0.25 * (this.hurtT / 0.2);
      const moving = this.grounded && Math.abs(this.vx) > 15 && this.state !== 'dash';
      this.stride = toward(this.stride, moving ? 1 : 0, dt * 6);
      if (moving) this.walk += dt * Math.abs(this.vx) * 0.09;
      if (!(this.state === 'hop' || this.state === 'evade' || this.state === 'vault' || this.state === 'rise' || this.state === 'lunge')) this.flapW = 0;
    }
    onExit(prev) { if (prev === 'lunge') this.gravityScale = 1; }
    onHurt() { this.hurtT = 0.2; }
    eye() { return { x: this.cx + this.facing * 6, y: this.y + 8 }; }
    drawBounds() { return { x: this.cx - 90, y: this.y - 70, w: 180, h: this.h + 82 }; }
    drawBody(ctx, t) {
      const fx = this.cx, fy = this.y + this.h;
      const air = !this.grounded && this.state !== 'lunge';
      ctx.save();
      ctx.translate(fx, fy); ctx.scale(this.facing, 1);
      drawKnight(ctx, this.pose, {
        t, seed: this.seed, walk: this.walk, stride: air ? 0 : this.stride, flap: this.flapW, vx: this.vx * this.facing,
        slash: this.slashFx, eyeK: this.telegraphing ? 1 : 0.55, glint: this.glintK,
      });
      ctx.restore();
      light({ x: fx, y: this.y + 26, r: 100, color: '#c8a8ff', intensity: this.telegraphing ? 0.44 : 0.3, flicker: false });
    }
    drawCorpse(ctx, t) {
      ctx.save(); ctx.translate(this.cx, this.y + this.h); ctx.scale(this.facing, 1);
      drawKnight(ctx, KPOSE.dead, { t, seed: this.seed, dead: true });
      ctx.restore();
    }
  }
  G.registerEnemy('moth_knight', MothKnight);

  G.MothwoodEnemies = { DuskMoth, MothScale, CocoonSpawner, Mothling, DustMaw, MothKnight, KPOSE, drawDuskMoth, drawCocoon, drawMaw, drawKnight, drawMothling, exitZones };
})();
