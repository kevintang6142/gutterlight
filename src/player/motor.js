// src/player/motor.js — G.PlayerMotor: pure, deterministic player movement simulation (no rendering/audio).
// Used by the in-game player AND by headless tools (tools/reach.js, tools/motor_metrics.js): its behaviour
// is the ground truth for level design. Node-loadable. Only depends on G.Physics, G.CONST, G.T.
(function () {
  'use strict';
  const G = globalThis.G;
  const T = G.T;
  const TILE = G.CONST.TILE;

  // Tuned constants (px, s). Verified by `node tools/motor_metrics.js` against TECH_SPEC §8.2.
  const C = {
    RUN: 330,                 // run speed (instant accel/decel)
    GRAVITY: G.CONST.GRAVITY, // 2600: falling / released jump
    G_HOLD: 1470,             // gravity while rising with jump held (variable jump height)
    MAX_FALL: G.CONST.MAX_FALL,
    JUMP_V: 740,              // jump take-off speed
    JUMP_CUT: 140,            // upward speed kept when jump is released early
    DJ_V: 640,                // Smokewing double jump
    WJ_V: 740,                // wall-jump vertical speed
    WJ_LOCK: 0.14,            // forced push away from the wall after a wall-jump
    WALL_SLIDE: 160,
    GRIP_VY: -60,             // grip engages once vy >= this (near the apex or falling)
    WALL_COYOTE: 0.1,         // wall-jump still allowed this long after letting go of a wall
    COYOTE: 0.08,
    BUFFER: 0.12,
    DASH_V: 750,
    DASH_T: 0.18,
    DASH_CD: 0.4,             // from dash start
    DASH_BUFFER: 0.08,
    DASH_VY_KEEP: 1,          // fraction of the pre-dash falling speed restored after an air dash
    POGO_V: 680,
    KNOCK_VX: 360, KNOCK_VY: 400, KNOCK_T: 0.18,
    RECOIL_V: 260, RECOIL_T: 0.08,
    EXIT_UP_VY: 816,          // upward room-exit boost (~3.2 tiles of rise)
    SWIM_SPEED: 330 * 0.65,
    FLOAT_SUBMERGED: 0.4,     // fraction of the body below the surface while floating
    PLUNGE_V: 1400,
    HARD_FALL: 400,           // fall height (px) that produces 'hardland'
    CORNER_PX: 8,             // ceiling-corner forgiveness
    DROP_TIME: 0.35,
    SPIKE_INSET: 6,
  };

  const NO_AB = {};
  const NO_MODS = {};

  function create(x, y) {
    return {
      x: x || 0, y: y || 0, w: G.CONST.PLAYER_W, h: G.CONST.PLAYER_H,
      vx: 0, vy: 0, facing: 1,
      onGround: false, coyote: 0, jumpBuffer: 0, jumpHolding: false,
      airDashUsed: false, dashTime: 0, dashCooldown: 0, dashDir: 1, dashBuffer: 0, dashVy: 0,
      wall: 0, lastWall: 0, wallCoyote: 0, wallJumpLock: 0, wallJumpDir: 0,
      doubleJumpUsed: false,
      inWater: false, swimming: false, surfaceY: 0, swimTimer: 0,
      plunging: false,
      knockTime: 0, recoilTime: 0, recoilVx: 0,
      locked: false, hazard: null,
      lastSafe: { x: x || 0, y: y || 0 },
      fallStartY: y || 0,
      dropY: null, dropTime: 0, dropThrough: false,
      airTime: 0, groundTime: 0, landVy: 0,
      events: [],
    };
  }

  function clone(s) {
    const c = Object.assign({}, s);
    c.events = s.events.slice();
    c.lastSafe = { x: s.lastSafe.x, y: s.lastSafe.y };
    return c;
  }

  // ---------------------------------------------------------------- helpers
  function setHazard(s, kind) {
    s.hazard = kind;
    s.vx = 0; s.vy = 0;
    s.dashTime = 0; s.wall = 0; s.jumpHolding = false;
    if (s.plunging) { s.plunging = false; s.events.push('plungeEnd'); }
    s.events.push('hazard:' + kind);
  }

  function touchesSpikes(room, s) {
    const P = G.Physics;
    const c0 = Math.floor(s.x / TILE), c1 = Math.floor((s.x + s.w) / TILE);
    const r0 = Math.floor(s.y / TILE), r1 = Math.floor((s.y + s.h) / TILE);
    const k = C.SPIKE_INSET;
    for (let r = r0; r <= r1; r++) {
      for (let c = c0; c <= c1; c++) {
        if (P.tileAt(room, c, r) !== T.SPIKES) continue;
        const x = c * TILE + k, y = r * TILE + k, w = TILE - 2 * k, h = TILE - 2 * k;
        if (s.x < x + w && s.x + s.w > x && s.y < y + h && s.y + s.h > y) return true;
      }
    }
    return false;
  }

  // Safe ground for hazard respawn: standing on plain terrain (no B/D, not only on an entity),
  // fully inside the room, no hazard tile within one tile.
  function isSafeGround(room, s, ab) {
    if (s.x < 0 || s.y < 0 || s.x + s.w > room.cols * TILE || s.y + s.h > room.rows * TILE) return false;
    const gi = G.Physics.groundInfo(room, s);
    if (!gi.tiles.length || gi.unsafe) return false;
    const P = G.Physics;
    // Firm footing: the ground under the body's center must hold (no respawning on a 1-px ledge lip).
    const under = P.tileAt(room, Math.floor((s.x + s.w / 2) / TILE), Math.round((s.y + s.h) / TILE));
    if (!P.isSolidTile(under) && under !== T.PLATFORM) return false;
    const x = s.x - TILE, y = s.y - TILE, w = s.w + 2 * TILE, h = s.h + 2 * TILE;
    if (P.overlapTiles(room, x, y, w, h, T.SPIKES)) return false;
    if (P.overlapTiles(room, x, y, w, h, T.LAVA)) return false;
    if (!ab.oilcloak && P.overlapTiles(room, x, y, w, h, T.WATER)) return false;
    return true;
  }

  function standingOnPlatformOnly(room, s) {
    const gi = G.Physics.groundInfo(room, s);
    if (gi.entity || !gi.platform) return false;
    for (const code of gi.tiles) if (code !== T.PLATFORM) return false;
    return true;
  }

  function doJump(s, v) {
    s.vy = -v;
    s.jumpHolding = true;
    s.onGround = false;
    s.coyote = 0;
    s.jumpBuffer = 0;
    s.dropY = null;
  }

  // Liquids, spikes, swimming state, lastSafe. Called after every movement.
  function postMove(s, room, ab, dt, moveDir) {
    const P = G.Physics;
    const ev = s.events;
    const water = P.liquidDepth(room, s, T.WATER);
    s.inWater = water.depth > 0;
    if (s.inWater && water.surface != null) s.surfaceY = water.surface;
    if (s.inWater) {
      if (!ab.oilcloak) {
        if (water.depth >= 0.25 * s.h) { ev.push('splash'); setHazard(s, 'water'); return; }
      } else if (!s.swimming) {
        const wading = s.onGround && water.depth <= C.FLOAT_SUBMERGED * s.h + 2;
        if (!wading && water.depth > 6 && (s.vy >= 0 || water.depth > 0.6 * s.h)) {
          s.swimming = true;
          s.wall = 0; s.airDashUsed = false; s.doubleJumpUsed = false; s.jumpHolding = false;
          if (s.plunging) { s.plunging = false; ev.push('plungeEnd'); s.vy = Math.min(s.vy, 420); }
          ev.push('splash');
        }
      }
    } else if (s.swimming) {
      s.swimming = false;
    }
    if (s.swimming) {
      s.onGround = false;
      s.coyote = 0;
      if (moveDir) {
        s.swimTimer += dt;
        if (s.swimTimer >= 0.45) { s.swimTimer = 0; ev.push('swim'); }
      } else s.swimTimer = 0.3;
    }
    if (P.liquidDepth(room, s, T.LAVA).depth > 3) { ev.push('splash'); setHazard(s, 'lava'); return; }
    if (touchesSpikes(room, s)) { setHazard(s, 'spikes'); return; }
    if (s.onGround && isSafeGround(room, s, ab)) { s.lastSafe.x = s.x; s.lastSafe.y = s.y; }
  }

  // Ground state, landing events and refreshes after a move.
  function updateGround(s, room, dt, prevVy) {
    const was = s.onGround;
    s.dropThrough = s.dropY != null ? s.dropY : false;
    // within 1 px of a floor counts as grounded; snap onto it so positions stay exact
    const down = (!s.swimming && s.vy >= 0) ? G.Physics.sweepY(s, room, 1) : 1;
    s.onGround = down < 1 - 1e-6;
    if (s.onGround) {
      s.y += down;
      if (!was && (s.airTime > 0.05 || prevVy > 60)) {
        s.landVy = prevVy;
        s.events.push(s.y - s.fallStartY >= C.HARD_FALL ? 'hardland' : 'land');
      }
      s.vy = 0;
      if (s.dashTime <= 0) s.coyote = C.COYOTE;
      s.airDashUsed = false;
      s.doubleJumpUsed = false;
      s.wall = 0;
      s.fallStartY = s.y;
      s.dropY = null;
      s.airTime = 0;
      s.groundTime += dt;
    } else {
      s.airTime += dt;
      s.groundTime = 0;
      if (s.y < s.fallStartY) s.fallStartY = s.y;
    }
  }

  function tryCornerNudge(s, room, dy) {
    const P = G.Physics;
    for (let n = 1; n <= C.CORNER_PX; n++) {
      for (const dir of [-1, 1]) {
        const nx = s.x + dir * n;
        if (!P.rectSolid(room, nx, s.y, s.w, s.h) && !P.rectSolid(room, nx, s.y - 2, s.w, s.h)) {
          s.x = nx;
          return P.move(s, room, 0, dy);
        }
      }
    }
    return null;
  }

  // Break dive floors directly under the feet while plunging. → true if something broke.
  function breakDiveUnder(s, room, ctx) {
    if (ctx.breakDive === false) return false;
    const P = G.Physics;
    const r = Math.round((s.y + s.h) / TILE);
    const c0 = Math.floor((s.x + P.SKIN) / TILE), c1 = Math.floor((s.x + s.w - P.SKIN) / TILE);
    let broke = false;
    for (let c = c0; c <= c1; c++) {
      if (P.tileAt(room, c, r) !== T.DIVEFLOOR) continue;
      const ok = typeof ctx.breakDive === 'function' ? ctx.breakDive(room, c, r) : P.breakAt(room, c, r, 'plunge');
      if (ok && P.tileAt(room, c, r) !== T.DIVEFLOOR) broke = true;
    }
    return broke;
  }

  function stepPlunge(s, room, dt, ctx, ab) {
    const P = G.Physics;
    s.vx = 0;
    s.vy = C.PLUNGE_V;
    let remaining = C.PLUNGE_V * dt;
    s.dropThrough = false;
    for (let guard = 0; guard < 6 && remaining > 0.001; guard++) {
      const y0 = s.y;
      const res = P.move(s, room, 0, remaining);
      remaining -= (s.y - y0);
      if (res.hitY > 0) {
        if (breakDiveUnder(s, room, ctx)) { s.events.push('plungeBreak'); continue; }
        s.plunging = false;
        s.vy = 0;
        s.events.push('plungeLand', 'plungeEnd');
        break;
      }
      break;
    }
    s.airTime += dt;
    updateGround(s, room, dt, C.PLUNGE_V);
    // landing events from updateGround are replaced by plungeLand
    const ev = s.events;
    for (let i = ev.length - 1; i >= 0; i--) if (ev[i] === 'land' || ev[i] === 'hardland') ev.splice(i, 1);
    postMove(s, room, ab, dt, 0);
  }

  // ---------------------------------------------------------------- main step
  function step(s, inp, ctx) {
    const ev = s.events;
    ev.length = 0;
    const room = ctx && ctx.room;
    if (!room) return;
    const dt = ctx.dt || G.CONST.DT;
    const ab = ctx.abilities || NO_AB;
    const mods = ctx.mods || NO_MODS;
    const P = G.Physics;
    inp = inp || NO_AB;

    if (s.hazard) { s.vx = 0; s.vy = 0; return; } // frozen until the controller respawns (clears s.hazard)

    const ctl = !s.locked;
    const L = ctl && !!inp.left, R = ctl && !!inp.right, D = ctl && !!inp.down;
    const jumpHeld = ctl && !!inp.jump;
    const moveDir = (R ? 1 : 0) - (L ? 1 : 0);

    // timers & buffers
    s.jumpBuffer = Math.max(0, s.jumpBuffer - dt);
    s.dashBuffer = Math.max(0, s.dashBuffer - dt);
    if (!s.onGround) s.coyote = Math.max(0, s.coyote - dt); // not consumed on the frame you leave a ledge
    s.dashCooldown = Math.max(0, s.dashCooldown - dt);
    s.wallJumpLock = Math.max(0, s.wallJumpLock - dt);
    s.knockTime = Math.max(0, s.knockTime - dt);
    s.recoilTime = Math.max(0, s.recoilTime - dt);
    s.wallCoyote = Math.max(0, s.wallCoyote - dt);
    if (s.dropY != null) { s.dropTime -= dt; if (s.dropTime <= 0) s.dropY = null; }
    if (ctl && inp.jumpPressed) s.jumpBuffer = C.BUFFER;
    if (ctl && inp.dashPressed) s.dashBuffer = C.DASH_BUFFER;
    if (mods.noKnockback && s.knockTime > 0) { s.knockTime = 0; s.vx = 0; }

    if (s.plunging) { stepPlunge(s, room, dt, ctx, ab); return; }

    // ---- dash start
    if (s.dashBuffer > 0 && ctl && ab.dash && s.dashTime <= 0 && s.dashCooldown <= 0 && s.knockTime <= 0) {
      const grounded = s.onGround || s.swimming;
      if (grounded || !s.airDashUsed) {
        const dir = s.wall ? -s.wall : (moveDir || s.facing || 1);
        s.dashDir = dir; s.facing = dir;
        s.dashTime = C.DASH_T; s.dashCooldown = C.DASH_CD; s.dashBuffer = 0;
        s.dashVy = s.vy;
        if (!grounded) { s.airDashUsed = true; s.coyote = 0; }
        if (s.wall) { s.lastWall = 0; s.wall = 0; }
        s.wallJumpLock = 0; s.jumpHolding = false; s.recoilTime = 0;
        ev.push('dash');
      }
    }

    // ---- dashing: horizontal burst, no gravity, not cancellable
    if (s.dashTime > 0) {
      const d = Math.min(dt, s.dashTime);
      s.dashTime -= dt;
      s.vx = s.dashDir * C.DASH_V;
      s.vy = 0;
      s.dropThrough = s.dropY != null ? s.dropY : false;
      const res = P.move(s, room, s.vx * d, 0);
      if (res.hitX) s.dashTime = 0;
      const wasGround = s.onGround;
      s.onGround = !s.swimming && P.onGround(room, s);
      if (!s.onGround) { s.coyote = 0; s.airTime += dt; } else { s.airTime = 0; s.airDashUsed = false; s.doubleJumpUsed = false; }
      if (wasGround && !s.onGround) s.fallStartY = s.y;
      if (s.dashTime <= 0) {
        s.dashTime = 0;
        s.vy = s.onGround || s.swimming ? 0 : Math.max(0, s.dashVy) * C.DASH_VY_KEEP;
        s.vx = moveDir * (s.swimming ? C.SWIM_SPEED : C.RUN);
      }
      postMove(s, room, ab, dt, moveDir);
      return;
    }

    // ---- horizontal control
    const speed = s.swimming ? C.SWIM_SPEED : C.RUN;
    if (s.knockTime > 0) { /* keep knockback velocity */ }
    else if (s.wallJumpLock > 0) s.vx = s.wallJumpDir * C.RUN;
    else if (s.recoilTime > 0) s.vx = s.recoilVx;
    else s.vx = moveDir * speed;
    if (moveDir && s.knockTime <= 0 && s.wallJumpLock <= 0 && !s.wall) s.facing = moveDir;

    // ---- jumping (buffered)
    if (s.jumpBuffer > 0 && ctl && s.knockTime <= 0) {
      if (D && s.onGround && standingOnPlatformOnly(room, s)) {
        s.dropY = s.y + s.h; s.dropTime = C.DROP_TIME;
        s.jumpBuffer = 0; s.onGround = false; s.coyote = 0;
      } else if (s.onGround || s.coyote > 0 || s.swimming) {
        const fromWater = s.swimming;
        doJump(s, C.JUMP_V);
        if (fromWater) { s.swimming = false; ev.push('splash'); }
        ev.push('jump');
      } else if (ab.grip && (s.wall !== 0 || (s.wallCoyote > 0 && s.lastWall))) {
        const wdir = s.wall || s.lastWall;
        doJump(s, C.WJ_V);
        s.wallJumpLock = C.WJ_LOCK; s.wallJumpDir = -wdir;
        s.vx = -wdir * C.RUN; s.facing = -wdir;
        s.wall = 0; s.lastWall = 0; s.wallCoyote = 0;
        ev.push('walljump');
      } else if (ab.wings && !s.doubleJumpUsed) {
        doJump(s, C.DJ_V);
        s.doubleJumpUsed = true;
        ev.push('doublejump');
      }
    }
    // variable height: releasing jump cuts the rise
    if (s.jumpHolding && !jumpHeld && s.vy < 0) {
      if (s.vy < -C.JUMP_CUT) s.vy = -C.JUMP_CUT;
      s.jumpHolding = false;
    }
    if (s.vy >= 0) s.jumpHolding = false;

    // ---- vertical forces
    const prevVy = s.vy;
    if (s.swimming) {
      const target = s.surfaceY - (1 - C.FLOAT_SUBMERGED) * s.h;
      const desired = Math.max(-320, Math.min(640, (target - s.y) * 10));
      const a = 4200 * dt;
      s.vy = s.vy < desired ? Math.min(s.vy + a, desired) : Math.max(s.vy - a, desired);
    } else if (s.wall) {
      s.vy = C.WALL_SLIDE;
    } else {
      const g = (s.jumpHolding && s.vy < 0) ? C.G_HOLD : C.GRAVITY;
      s.vy = Math.min(s.vy + g * dt, C.MAX_FALL);
    }

    // ---- move
    s.dropThrough = s.dropY != null ? s.dropY : false;
    const dx = s.vx * dt;
    let res = P.move(s, room, dx, s.vy * dt);
    if (res.hitX && s.swimming) {
      // climb out of flush pools: step up onto the rim (at most the submerged part of the body)
      const up = s.y + s.h - s.surfaceY + 1;
      if (up > 0 && up <= C.FLOAT_SUBMERGED * s.h + 4 && !P.rectSolid(room, s.x + Math.sign(dx), s.y - up, s.w, s.h)) {
        s.y -= up;
        P.move(s, room, dx * 0.5, 0);
      }
    }
    if (res.hitY < 0 && s.vy < 0) {
      const remaining = s.vy * dt;
      const r2 = s.wall ? null : tryCornerNudge(s, room, remaining * 0.5);
      if (!r2 || r2.hitY < 0) { s.vy = 0; s.jumpHolding = false; }
      if (r2) res = { hitX: res.hitX, hitY: r2.hitY };
    }
    if (res.hitX && s.knockTime > 0) s.vx = 0;

    const wasGround = s.onGround;
    updateGround(s, room, dt, prevVy);
    // a buffered jump fires on the landing frame itself
    if (s.onGround && !wasGround && s.jumpBuffer > 0 && ctl && s.knockTime <= 0 && !(D && standingOnPlatformOnly(room, s))) {
      doJump(s, C.JUMP_V);
      ev.push('jump');
    }

    // ---- wall grip
    if (!s.onGround && !s.swimming && ab.grip && s.knockTime <= 0) {
      if (s.wall) {
        const c = P.wallContact(room, s, s.wall);
        if (c !== 1 || moveDir === -s.wall) {
          s.lastWall = s.wall; s.wallCoyote = C.WALL_COYOTE; s.wall = 0;
        }
      } else if (moveDir !== 0 && s.wallJumpLock <= 0 && s.vy >= C.GRIP_VY) {
        if (P.wallContact(room, s, moveDir) === 1) {
          s.wall = moveDir;
          s.facing = -moveDir;
          s.vy = Math.min(s.vy, C.WALL_SLIDE);
          s.airDashUsed = false; s.doubleJumpUsed = false; s.jumpHolding = false;
          s.lastWall = 0; s.wallCoyote = 0;
          ev.push('grip');
        }
      }
    } else if (s.wall) {
      s.lastWall = s.onGround ? 0 : s.wall;
      s.wallCoyote = s.onGround ? 0 : C.WALL_COYOTE;
      s.wall = 0;
    }

    postMove(s, room, ab, dt, moveDir);
  }

  // ---------------------------------------------------------------- controller hooks
  function startPlunge(s) {
    if (s.plunging || s.hazard) return false;
    s.plunging = true;
    s.vx = 0; s.vy = C.PLUNGE_V;
    s.dashTime = 0; s.wall = 0; s.jumpHolding = false;
    s.knockTime = 0; s.recoilTime = 0; s.wallJumpLock = 0;
    s.swimming = false;
    s.events.push('plunge');
    return true;
  }
  function pogo(s) {
    if (s.hazard) return;
    s.vy = -C.POGO_V;
    s.jumpHolding = false;
    s.airDashUsed = false;
    s.doubleJumpUsed = false;
    s.dashTime = 0;
    s.wall = 0;
    s.onGround = false;
    s.coyote = 0;
    s.dropY = null;
    s.events.push('pogo');
  }
  // dirX: push direction (sign of player.cx - source.cx)
  function knockback(s, dirX) {
    if (s.plunging || s.hazard) return;
    s.vx = (dirX || -s.facing || 1) * C.KNOCK_VX;
    s.vy = -C.KNOCK_VY;
    s.knockTime = C.KNOCK_T;
    s.dashTime = 0; s.wall = 0; s.jumpHolding = false; s.wallJumpLock = 0; s.recoilTime = 0;
    s.onGround = false; s.coyote = 0;
  }
  // dirX: push direction (usually -facing). Vertical (up/down) slashes do not recoil horizontally.
  function recoil(s, dirX, vertical) {
    if (vertical || s.hazard || s.plunging) return;
    s.recoilTime = C.RECOIL_T;
    s.recoilVx = (dirX || 0) * C.RECOIL_V;
  }
  function exitUpBoost(s) {
    s.vy = Math.min(s.vy, -C.EXIT_UP_VY);
    s.jumpHolding = false;
    s.onGround = false;
    s.coyote = 0;
    s.wall = 0;
    s.dashTime = 0;
  }

  G.PlayerMotor = {
    C, create, step, clone, startPlunge, pogo, knockback, recoil, exitUpBoost,
    isSafeGround,
    // Measured by tools/motor_metrics.js (tiles unless noted). Updated whenever constants change.
    METRICS: /*BEGIN*/{"runSpeed":8.25,"jumpApex":4.5,"shortHop":0.36,"shortHop3":0.93,"jumpDistance":7.29,"maxLedge":4,"maxLedgeWings":7,"wingsExtra":3.32,"maxGapNoDash":8,"maxGapDash":11,"maxGapNoDashPx":333,"maxGapDashPx":468,"dashDistance":3.38,"dashTime":0.18,"dashSpeed":18.75,"maxFall":24,"wallSlide":4,"wallJumpPush":0.15,"wallClimbSeconds20":2.7,"coyote":0.07,"buffer":0.12,"exitUpRise":3.03,"swimFloatAbove":0.6,"swimSpeedRatio":0.65,"plungeSpeed":35}/*END*/,
  };
})();
