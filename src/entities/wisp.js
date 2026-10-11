// src/entities/wisp.js — the Gutterwisp (type 'wisp'): a dark, smoky echo of the Wickling left where the
// player died, holding their cinders. Drifts toward the player within ~8 tiles, makes slow telegraphed
// lunges (1 damage on contact); three hits burst it: cinders return (G.game.reclaimWisp), Ember capacity
// is restored. Spawned by the engine as {type:'wisp', x, y, cinders} with x/y = the death spot's centre.
// G.wispSpotFor(death) (bottom of this file) moves the wisp of a death in an unbeaten boss's arena to a safe spot
// before the fight trigger or in the room before the arena (per-boss table, docs/api/interact.md).
(function () {
  'use strict';
  const G = globalThis.G;
  const H = G.Interact;
  const TILE = G.CONST.TILE;
  const TAU = Math.PI * 2;
  const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);

  const NOTICE = 8 * TILE;     // starts drifting toward the player
  const LUNGE_RANGE = 4.5 * TILE;
  const HITS = 3;
  const DRIFT_SPEED = 72;
  const LUNGE_SPEED = 440;
  const WINDUP = 0.6, LUNGE = 0.34, RECOVER = 0.9;
  const BODY = '#262230', BODY_HI = '#8a80aa', RIM = '#a898d0', EYE = '#e2dcff';

  class Wisp extends G.Entity {
    constructor(props) {
      super(props);
      this.type = 'wisp';
      this.w = 26; this.h = 46;
      this.anchor = 'center';
      this.team = 'enemy';
      this.hurtable = true;
      this.contactDamage = 1;
      this.z = 2;
      this.cinders = Math.max(0, props.cinders | 0);
      this.preview = !!props.preview;   // contact sheets / tests: no progress coupling
      // the engine passes the centre of the death spot in px
      if (props.tx == null && props.x != null && props.y != null) {
        this.x = +props.x - this.w / 2;
        this.y = +props.y - this.h / 2;
        this._placed = true;
      }
      this.home = null;
      this.hits = 0;
      this.state = 'idle';     // idle | drift | windup | lunge | recover
      this.stateT = 0;
      this.cooldown = 1.2;
      this.noticed = false;
      this.hurtT = 0;
      this.facing = 1;
      this.lunge = { x: 0, y: 0 };
      this.trail = null;
      this.scarf = null;
      this.seed = 0;
      this.whisperT = 3;
    }
    init() {
      this.seed = H.seedOf(this);
      if (!this.preview) {
        const pr = H.progress();
        if (!pr || !pr.wisp || !this.room || pr.wisp.room !== this.room.id) { this.remove(); return; }
        if (!this.cinders && pr.wisp.cinders) this.cinders = pr.wisp.cinders | 0;
      }
      this.unstick();
      this.home = { x: this.x, y: this.y };
      const C = H.char();
      if (C) {
        this.trail = C.smokeTrail.create(30);
        this.scarf = C.cloth.create(3, 7);
      }
    }
    // Never start inside terrain (e.g. a death spot next to a wall): search outward for free space.
    unstick() {
      const room = this.room;
      if (!room || !G.Physics.rectSolid(room, this.x, this.y, this.w, this.h)) return;
      for (let d = 4; d <= 4 * TILE; d += 4) {
        for (const [ox, oy] of [[0, -d], [-d, 0], [d, 0], [0, d], [-d, -d], [d, -d]]) {
          if (!G.Physics.rectSolid(room, this.x + ox, this.y + oy, this.w, this.h)) { this.x += ox; this.y += oy; return; }
        }
      }
    }
    setState(s) { this.state = s; this.stateT = 0; }

    update(dt) {
      this.stateT += dt;
      if (this.hurtT > 0) this.hurtT = Math.max(0, this.hurtT - dt);
      if (this.cooldown > 0) this.cooldown -= dt;
      const pc = H.playerCenter();
      const d = pc ? Math.hypot(pc.x - this.cx, pc.y - this.cy) : Infinity;
      // a cinematic / dialogue lock (G.game.isLocked) holds the player still: the wisp holds back and is harmless
      const locked = !!(G.game && G.game.isLocked && G.game.isLocked());
      if (this.hurtable) this.contactDamage = locked ? 0 : 1;
      if (!this.noticed && d < NOTICE && H.playable()) {
        this.noticed = true;
        H.sfx('wisp', this.cx);
        if (this.state === 'idle') this.setState('drift');
      }
      if (pc && this.state !== 'lunge') this.facing = pc.x < this.cx ? -1 : 1;

      let ax = 0, ay = 0;
      switch (this.state) {
        case 'idle': {
          // hover around the death spot
          const hx = this.home.x + Math.sin(this.t * 0.7 + this.seed) * 10, hy = this.home.y + Math.sin(this.t * 1.1) * 6;
          this.vx += (hx - this.x) * 3 * dt - this.vx * 2 * dt;
          this.vy += (hy - this.y) * 3 * dt - this.vy * 2 * dt;
          break;
        }
        case 'drift': {
          if (!pc) break;
          if (locked) { this.vx = G.U.approach(this.vx, 0, 300 * dt); this.vy = G.U.approach(this.vy, 0, 300 * dt); break; }
          const tx = pc.x, ty = pc.y - 18;
          const dx = tx - this.cx, dy = ty - this.cy, dl = Math.hypot(dx, dy) || 1;
          ax = (dx / dl) * 260; ay = (dy / dl) * 260;
          this.vx += ax * dt; this.vy += ay * dt;
          const sp = Math.hypot(this.vx, this.vy);
          if (sp > DRIFT_SPEED) { this.vx *= DRIFT_SPEED / sp; this.vy *= DRIFT_SPEED / sp; }
          if (d < LUNGE_RANGE && this.cooldown <= 0 && H.playable()) {
            this.setState('windup');
            H.sfx('wisp', this.cx, { vol: 0.6, pitch: 1.3 });
          }
          break;
        }
        case 'windup': {
          if (locked) { this.setState('drift'); break; }
          // draw back and swell before the lunge (the telegraph)
          if (pc) {
            const dx = pc.x - this.cx, dy = pc.y - 10 - this.cy, dl = Math.hypot(dx, dy) || 1;
            this.lunge.x = dx / dl; this.lunge.y = dy / dl;
            this.vx = G.U.approach(this.vx, -this.lunge.x * 50, 400 * dt);
            this.vy = G.U.approach(this.vy, -this.lunge.y * 50, 400 * dt);
          }
          if (this.stateT >= WINDUP) {
            this.setState('lunge');
            this.vx = this.lunge.x * LUNGE_SPEED; this.vy = this.lunge.y * LUNGE_SPEED;
            H.sfx('dash', this.cx, { vol: 0.45, pitch: 0.7 });
          }
          break;
        }
        case 'lunge':
          if (this.trail && Math.random() < 0.9) this.emitSmoke(1.4);
          if (this.stateT >= LUNGE) this.setState('recover');
          break;
        case 'recover':
          this.vx = G.U.approach(this.vx, 0, 700 * dt);
          this.vy = G.U.approach(this.vy, 0, 700 * dt);
          if (this.stateT >= RECOVER) { this.setState('drift'); this.cooldown = 1.4 + Math.random() * 1.2; }
          break;
        default: break;
      }
      const res = this.room ? G.Physics.move(this, this.room, this.vx * dt, this.vy * dt) : { hitX: 0, hitY: 0 };
      if (res.hitX) this.vx *= -0.3;
      if (res.hitY) this.vy *= -0.3;
      if (this.room) {
        this.x = clamp(this.x, 2, this.room.widthPx - this.w - 2);
        this.y = clamp(this.y, 2, this.room.heightPx - this.h - 2);
      }
      // smoke, cloth, light, whispers
      this.emitSmoke(1);
      const C = H.char();
      if (this.trail && C) C.smokeTrail.update(this.trail, dt);
      if (this.scarf && C) {
        const bob = this.bobY(this.t);
        C.cloth.update(this.scarf, this.cx - this.facing * 6, this.y + 22 + bob, dt, { wind: -this.facing * 220 - this.vx * 2, gravity: 260, lift: 0, damping: 0.9 });
      }
      const flare = this.state === 'windup' ? clamp(this.stateT / WINDUP, 0, 1) : 0;
      H.light(this.cx, this.y + 6, 100 + flare * 60, '#9a88c8', 0.35 + flare * 0.25, true);
      if (this.noticed && (this.whisperT -= dt) <= 0) {
        this.whisperT = 4 + Math.random() * 4;
        if (d < NOTICE * 1.2) H.sfx('wisp', this.cx, { vol: 0.25, pitch: 0.8 + Math.random() * 0.3 });
      }
    }
    emitSmoke(rate) {
      if (!this.trail || Math.random() > 0.55 * rate) return;
      const C = H.char();
      if (C) C.smokeTrail.emit(this.trail, this.cx + (Math.random() - 0.5) * 12, this.y + this.h - 6 + this.bobY(this.t), { color: '#2e2a38', alpha: 0.5, size: 6, life: 1.1, rise: 26, vx: -this.vx * 0.15 });
    }
    bobY(t) { return Math.sin(t * 2.1 + this.seed) * 3; }
    hurtRect() { return { x: this.x - 4, y: this.y - 6, w: this.w + 8, h: this.h + 6 }; }
    contactRect() { return { x: this.x + 3, y: this.y + 6, w: this.w - 6, h: this.h - 12 }; }

    onHit(hit) {
      if (this.dead || (hit && hit.team && hit.team !== 'player')) return false;
      this.hits++;
      this.hurtT = 0.22;
      const pc = H.playerCenter();
      let dx = hit && hit.dir ? hit.dir.x : 0, dy = hit && hit.dir ? hit.dir.y : 0;
      if (!dx && !dy && pc) { dx = this.cx - pc.x; dy = this.cy - pc.y; }
      const dl = Math.hypot(dx, dy) || 1;
      this.vx = (dx / dl) * 300; this.vy = (dy / dl) * 300 - 40;
      this.setState('recover');
      this.cooldown = Math.max(this.cooldown, 0.8);
      H.burst('smoke', this.cx, this.cy, { count: 5, color: '#2e2a38', alpha: 0.6 });
      H.burst('spark', this.cx, this.cy, { count: 8, color: '#c8b8ff', speed: 300 });
      H.sfx('enemy_hit', this.cx, { pitch: 0.75 + this.hits * 0.08 });
      if (this.hits >= HITS) this.burst();
      return true;
    }
    burst() {
      if (this.dead) return;
      this.contactDamage = 0;
      this.hurtable = false;
      this.remove();
      const cx = this.cx, cy = this.cy;
      let got = this.cinders;
      if (!this.preview && G.game) {
        if (typeof G.game.reclaimWisp === 'function') got = G.game.reclaimWisp();
        else {
          const pr = H.progress();
          if (pr) { got = (pr.wisp && pr.wisp.cinders) || 0; pr.wisp = null; G.game.addCinders(got); H.save(); }
        }
      }
      H.sfx('wisp_die', cx);
      H.burst('smoke', cx, cy, { count: 18, color: '#2a2632', alpha: 0.6, speed: 160, size: 12 });
      H.burst('flash', cx, cy, { r: 130, color: '#b8a8ff', alpha: 0.85 });
      H.burst('ring', cx, cy, { r: 120, color: '#c8b8ff', width: 4 });
      H.burst('wax', cx, cy, { count: 10, color: '#3a3446', speed: 300 });
      // the cinders stream home to the player
      const pc = H.playerCenter();
      if (pc && G.fx && G.fx.spawn) {
        for (let i = 0; i < 18; i++) {
          const a = Math.random() * TAU, r = Math.random() * 20;
          const sx = cx + Math.cos(a) * r, sy = cy + Math.sin(a) * r;
          const life = 0.35 + Math.random() * 0.25;
          G.fx.spawn({ x: sx, y: sy, vx: (pc.x - sx) / life, vy: (pc.y - sy) / life, life, size: 2.6, size2: 1, color: i % 3 ? '#ffb060' : '#bfe6ff', add: true, shape: 'glow' });
        }
      }
      H.shake(6, 0.3);
      if (G.game && G.game.hitstop) G.game.hitstop(0.08);
      H.toast(H.text('ui.wispReclaimed', 'Cinders reclaimed'));
      G.events.emit('wispReclaimed', { cinders: got, room: this.room });
    }

    draw(ctx, t) {
      const C = H.char();
      if (this.trail && C) C.smokeTrail.draw(ctx, this.trail);
      const bob = this.bobY(t);
      const flare = this.state === 'windup' ? clamp(this.stateT / WINDUP, 0, 1) : this.state === 'lunge' ? 1 : 0;
      const shiver = this.state === 'windup' ? Math.sin(t * 60) * 1.2 * flare : 0;
      const x = this.cx + shiver, feet = this.y + this.h - 8 + bob;
      ctx.save();
      ctx.globalAlpha *= 0.86 + 0.08 * Math.sin(t * 7 + this.seed);
      // halo of Pall
      H.glow(ctx, x, feet - 22, 46, '#4a4060', 0.5);
      if (this.scarf && C) C.cloth.draw(ctx, this.scarf, { width: 9, tip: 0.5, color: '#3a3646', shadeColor: '#000000', lw: 1.4, wave: 2 });
      // a wavering smoky tail instead of legs, and Pall smoke fraying its outline
      const spr = G.Art && G.Art.dotSprite ? G.Art.dotSprite('#2c2738') : null;
      if (spr) {
        for (let i = 0; i < 10; i++) {
          const a = (i / 10) * Math.PI * 2 + t * 0.6;
          const r = 7 + Math.sin(t * 3 + i * 1.7) * 2;
          const px = x + Math.cos(a) * 15, py = feet - 18 + Math.sin(a) * 20;
          ctx.globalAlpha *= 0.8;
          ctx.drawImage(spr, px - r, py - r, r * 2, r * 2);
          ctx.globalAlpha /= 0.8;
        }
        for (let i = 0; i < 5; i++) {
          const k = i / 4;
          const r = 9 - k * 4 + Math.sin(t * 5 + i) * 1.2;
          const ox = Math.sin(t * 3 + i * 1.3 + this.seed) * (2 + k * 5) - this.vx * 0.02 * k * 10;
          ctx.drawImage(spr, x + ox - r, feet - 4 + k * 12 - r, r * 2, r * 2);
        }
      }
      ctx.save();
      ctx.translate(x, feet);
      ctx.scale(this.facing, 1);
      const sq = 1 + flare * 0.08 + Math.sin(t * 2.4) * 0.02;
      let top = -36;
      if (C) {
        const b = C.waxBody(ctx, 0, 0, 24, 34, { variant: 'candle', color: BODY, hi: BODY_HI, shade: '#000000', drips: 3, seed: this.seed, squash: sq, rim: RIM, rimAlpha: 0.75, outline: '#0a080e' });
        top = b.top;
        C.eyes(ctx, b.cx + 2.5, top + b.h * 0.34, { kind: 'slit', size: 11 + flare * 2, gap: 9, color: EYE, shine: false, blink: 0 });
        H.glow(ctx, b.cx + 2.5, top + b.h * 0.34, 16, '#c8b8ff', 0.35 + flare * 0.4);
        const tip = C.wick(ctx, b.cx, top + 2, { len: 6, bend: -1.5, width: 2.2, color: '#0a080e' });
        ctx.save();
        ctx.globalAlpha *= 0.75;
        H.flame(ctx, tip[0], tip[1] + 1, 12 + flare * 8, 'violet', t, this.seed, { glow: 0.45 });
        ctx.restore();
        // greyed core so the flame reads "dim violet-grey"
        H.glow(ctx, tip[0], tip[1] - 5, 9, '#d0c8e0', 0.25);
      } else {
        ctx.fillStyle = BODY; ctx.fillRect(-12, -34, 24, 34);
      }
      ctx.restore();
      if (C && C.pallSmoke) C.pallSmoke(ctx, x, feet - 30, t, { count: 6, height: 46, spread: 16, size: 5, alpha: 0.4, color: '#2a2634', seed: this.seed, speed: 0.5, drift: -this.facing * 10 });
      if (this.hurtT > 0) H.glow(ctx, x, feet - 18, 40, '#ffffff', this.hurtT * 3);
      ctx.restore();
    }
  }

  G.registerEntity('wisp', Wisp);
  G.Wisp = Wisp;

  // First death: explain the Gutterwisp once (G.game's respawn sets progress.wisp, then emits 'respawn').
  // Flag 'hint:wisp' keeps it to a single showing per save.
  function wispHintOnRespawn() {
    const pr = H.progress();
    if (!pr || !pr.wisp || H.flag('hint:wisp')) return;
    H.setFlag('hint:wisp');
    // one toast per sentence: a toast is a single line (cut off past ~560px), the hint is two sentences
    const hint = String(H.text('ui.wispHint', 'Your Gutterwisp waits on the way back, holding your Cinders. Strike it to take them back.'));
    for (const line of hint.split(/(?<=[.!?])\s+/)) if (line) H.toast(line);
  }
  G.events.on('respawn', wispHintOnRespawn);
  Wisp.hintOnRespawn = wispHintOnRespawn;

  // ---------------------------------------------------------------------------------------------------------
  // Boss deaths: where the Gutterwisp waits instead of the arena floor (G.wispSpotFor, called by game.js when it
  // creates progress.wisp). A wisp left inside a boss fight could only be reclaimed by re-triggering the fight,
  // so a death in the arena of a boss that is not yet beaten moves it to a safe spot on the way back: either the
  // arena's own entry side, OUTSIDE the trigger rect (only where that strip is deep enough: the wisp sits >= 10
  // tiles from the trigger edge so the 3-hit reclaim, its lunges and the hit knockback never carry the player
  // in), or the room before the arena, near the door to it. Spots are tiles (tx = column, ty = the EMPTY tile
  // directly above the floor); see docs/api/interact.md for the per-boss reasoning.
  // ---------------------------------------------------------------------------------------------------------
  const WISP_SPOTS = {
    // gw_05 entry strip (cols 51-62) is only 12 tiles deep -> gw_04 (shrine room, no enemies), west end by
    // the door, west of the S1 drop: met right after jumping the drop, on the way from gw_sconce_a.
    effigy:     { arena: 'gw_05', room: 'gw_04', tx: 8, ty: 14 },
    // mb_07: 22-tile strip east of the trigger (cols 41-62) -> inside the Lawn, 12.5 tiles clear of it.
    sable1:     { arena: 'mb_07', room: 'mb_07', tx: 53, ty: 14 },
    // sf_05: the only non-trigger ground is the 5-tile west ledge above the den (a knock off it lands in the
    // trigger) -> sf_02 Great Flue floor between sf_sconce_b and the E4 door.
    matron:     { arena: 'sf_05', room: 'sf_02', tx: 25, ty: 77 },
    // dn_07: 14-tile strip west of the trigger (cols 3-16) -> inside the Belfry, 10.5 tiles clear of it, past the
    // open arena gate (col 2), on the clean floor (no hazards before the fight).
    tallowmere: { arena: 'dn_07', room: 'dn_07', tx: 6, ty: 23 },
    // ch_09: only 7 tiles before the trigger -> ch_08 upper ledge by the furnace door (E1), out of reach of the
    // ladle brute on the floor 9 tiles below.
    kilnmother: { arena: 'ch_09', room: 'ch_08', tx: 58, ty: 14 },
    // mw_04: only 7 tiles before the trigger -> mw_06. Near the bower door once the moth knight (mw_u1,
    // persistent) is slain; while it lives, short of its notice range (|x - home| < 9 tiles of col 55),
    // just east of mw_sconce_b.
    vespertine: { arena: 'mw_04', room: 'mw_06', tx: 58, ty: 23, alt: { unless: 'dead:mw_u1', tx: 44, ty: 23 } },
    // ri_07: same layout as mb_07 -> inside, 12.5 tiles east of the trigger.
    sable2:     { arena: 'ri_07', room: 'ri_07', tx: 53, ty: 14 },
    // hs_03: 9 tiles before the trigger -> hs_02 open hall before the low passage to the arena (no enemies).
    lucerne:    { arena: 'hs_03', room: 'hs_02', tx: 33, ty: 14 },
  };
  const ARENA_BOSS = {};
  for (const id in WISP_SPOTS) ARENA_BOSS[WISP_SPOTS[id].arena] = id;

  function bossBeaten(id) {
    return !!(G.game && typeof G.game.bossDefeated === 'function' && G.game.bossDefeated(id));
  }
  /** death = {room, x, y, arenaActive, bossId} (px, room-local) → {room, x, y} (px, centre) or null = keep. */
  function wispSpotFor(death) {
    if (!death || typeof death.room !== 'string') return null;
    const id = WISP_SPOTS[death.bossId] && WISP_SPOTS[death.bossId].arena === death.room ? death.bossId : ARENA_BOSS[death.room];
    const s = id && WISP_SPOTS[id];
    if (!s || bossBeaten(id)) return null;     // not a boss arena, or the boss is already beaten: normal behaviour
    const w = G.World && typeof G.World.getRoom === 'function' ? G.World.getRoom(s.room) : null;
    if (!w) return null;                       // (stripped / test worlds)
    let tx = s.tx, ty = s.ty;
    if (s.alt && !(H.flag && H.flag(s.alt.unless))) { tx = s.alt.tx; ty = s.alt.ty; }
    // the centre of a standing player on that tile (what game.js stores for a death spot)
    return { room: s.room, x: (tx + 0.5) * TILE, y: (ty + 1) * TILE - G.CONST.PLAYER_H / 2 };
  }
  wispSpotFor.SPOTS = WISP_SPOTS;
  G.wispSpotFor = wispSpotFor;
})();
