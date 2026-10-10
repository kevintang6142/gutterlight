// src/engine/camera.js — G.camera: smooth follow with facing look-ahead, vertical deadzone, fall look-down,
// room clamping (optional sub-zone, e.g. boss arenas), screen shake. Coordinates are room-local px.
(function () {
  'use strict';
  const G = globalThis.G;
  const W = G.CONST.VIEW_W, H = G.CONST.VIEW_H;

  const LOOK_AHEAD = 70;      // px toward the facing direction
  const SCREEN_Y = 0.56;      // player center sits at this fraction of the screen height when settled
  const DEAD_TOP = 0.36, DEAD_BOTTOM = 0.66;
  const FALL_LOOK = 150;      // extra look-down when falling fast

  function targetInfo(t) {
    const m = t.motor;
    return {
      cx: t.x + t.w / 2,
      cy: t.y + t.h / 2,
      vx: m ? m.vx : (t.vx || 0),
      vy: m ? m.vy : (t.vy || 0),
      facing: t.facing || (m && m.facing) || 1,
      grounded: m ? (m.onGround || m.swimming || !!m.wall) : true,
    };
  }

  const cam = {
    x: 0, y: 0, w: W, h: H,
    target: null,
    lookX: 0,
    fallLook: 0,
    shakeX: 0, shakeY: 0,
    _shakeAmp: 0, _shakeTime: 0, _shakeDur: 0,
    zone: null,

    follow(entity) { cam.target = entity || null; },

    room() { return (cam.target && cam.target.room) || (G.game && G.game.room) || null; },

    // Constrain the camera to a sub-rectangle of the room (room px), e.g. an arena; null clears.
    setZone(rect) { cam.zone = rect ? { x: rect.x, y: rect.y, w: rect.w, h: rect.h } : null; },
    clearZone() { cam.zone = null; },

    clamp() {
      const room = cam.room();
      let x0 = 0, y0 = 0, x1 = room ? room.widthPx : W, y1 = room ? room.heightPx : H;
      if (cam.zone) {
        x0 = Math.max(x0, cam.zone.x); y0 = Math.max(y0, cam.zone.y);
        x1 = Math.min(x1, cam.zone.x + cam.zone.w); y1 = Math.min(y1, cam.zone.y + cam.zone.h);
      }
      if (x1 - x0 <= W) cam.x = (x0 + x1 - W) / 2; else cam.x = Math.max(x0, Math.min(x1 - W, cam.x));
      if (y1 - y0 <= H) cam.y = (y0 + y1 - H) / 2; else cam.y = Math.max(y0, Math.min(y1 - H, cam.y));
    },

    desired() {
      const t = cam.target;
      if (!t) return { x: cam.x, y: cam.y };
      const i = targetInfo(t);
      return { x: i.cx + cam.lookX - W / 2, y: i.cy - H * SCREEN_Y + cam.fallLook };
    },

    // Jump straight to the target (room entry, respawn).
    snap() {
      const t = cam.target;
      if (t) {
        const i = targetInfo(t);
        cam.lookX = i.facing * LOOK_AHEAD;
        cam.fallLook = 0;
        const d = cam.desired();
        cam.x = d.x; cam.y = d.y;
      }
      cam.clamp();
    },

    update(dt) {
      const t = cam.target;
      if (t) {
        const i = targetInfo(t);
        const k = (rate) => 1 - Math.exp(-rate * dt);
        cam.lookX += (i.facing * LOOK_AHEAD - cam.lookX) * k(Math.abs(i.vx) > 10 ? 2.6 : 1.2);
        const wantFall = i.vy > 700 ? FALL_LOOK : 0;
        cam.fallLook += (wantFall - cam.fallLook) * k(wantFall ? 2.2 : 3);
        const d = cam.desired();
        cam.x += (d.x - cam.x) * k(6.5);
        // vertical: settle when grounded; otherwise only follow when leaving the deadzone
        const sy = i.cy - cam.y; // player's screen y
        if (i.grounded || cam.fallLook > 1) cam.y += (d.y - cam.y) * k(i.grounded ? 4.5 : 6);
        else if (sy < H * DEAD_TOP) cam.y += (i.cy - H * DEAD_TOP - cam.y) * k(9);
        else if (sy > H * DEAD_BOTTOM) cam.y += (i.cy - H * DEAD_BOTTOM - cam.y) * k(9);
        // hard limit: never let the player leave the view
        if (i.cy - cam.y < 60) cam.y = i.cy - 60;
        if (i.cy - cam.y > H - 60) cam.y = i.cy - (H - 60);
      }
      cam.clamp();
      // shake
      if (cam._shakeTime > 0) {
        cam._shakeTime = Math.max(0, cam._shakeTime - dt);
        const f = cam._shakeDur > 0 ? cam._shakeTime / cam._shakeDur : 0;
        const a = cam._shakeAmp * f * f;
        cam.shakeX = (Math.random() * 2 - 1) * a;
        cam.shakeY = (Math.random() * 2 - 1) * a;
        if (cam._shakeTime === 0) cam._shakeAmp = 0;
      } else { cam.shakeX = 0; cam.shakeY = 0; }
    },

    // Shake amplitude px for sec seconds (scaled by G.settings.shake by G.game.shake; this is raw).
    shake(px, sec) {
      if (!(px > 0) || !(sec > 0)) return;
      if (px >= cam._shakeAmp * (cam._shakeDur > 0 ? cam._shakeTime / cam._shakeDur : 0)) {
        cam._shakeAmp = px; cam._shakeDur = sec; cam._shakeTime = sec;
      }
    },
    stopShake() { cam._shakeTime = 0; cam._shakeAmp = 0; cam.shakeX = 0; cam.shakeY = 0; },

    worldToScreen(x, y) { return { x: x - cam.x, y: y - cam.y }; },
    screenToWorld(x, y) { return { x: x + cam.x, y: y + cam.y }; },
    // Is a world rect (plus margin) visible?
    visible(x, y, w, h, margin) {
      const m = margin || 0;
      return x + w > cam.x - m && x < cam.x + W + m && y + h > cam.y - m && y < cam.y + H + m;
    },
  };

  G.camera = cam;
})();
