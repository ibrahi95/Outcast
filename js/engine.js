/* Outcast -- engine.js: rAF loop, input (keyboard / pointer / touch joystick),
   devicePixelRatio-aware canvas sizing, smooth-follow camera with trauma-based
   shake, world/screen transforms and circle-vs-tile collision.
   Simulation plumbing only -- NO game rules live here. */
(function () {
  'use strict';
  window.AL = window.AL || {};

  var U = AL.util;
  var TAU = Math.PI * 2;
  var MAX_DT = 0.05;          // seconds; rAF delta clamp
  var FIT_TILES = 11.5;       // default zoom fits this many tiles vertically
  var ZOOM_MIN = 0.6, ZOOM_MAX = 1.6;
  var FOLLOW_RATE = 8.5;      // camera exponential smoothing rate (1/s)
  var TRAUMA_DECAY = 1.5;     // trauma units per second
  var SHAKE_PX = 14;          // max shake amplitude in screen px (divided by zoom)

  // ------------------------------------------------------------------ state
  var canvas = null;
  var ctx = null;
  var running = false;
  var rafId = 0;
  var lastT = 0;
  var frameCbs = [];
  var anyKeyCbs = [];
  var unbinders = [];         // listener teardown (defensive re-init)

  // canvas metrics (css px + device pixel ratio)
  var cssW = 1, cssH = 1, dpr = 1;
  var winW = 0, winH = 0, rawDpr = 0;   // cached to detect changes each frame
  var rectL = 0, rectT = 0;             // canvas top-left in client coords
  var smoothing = true;

  // camera internals
  var zoomVal = 1;
  var zoomCustom = false;     // true once game assigns camera.zoom explicitly
  var trauma = 0;
  var curShakeX = 0, curShakeY = 0;     // world-px offsets, updated per frame

  // keyboard: held state keyed by KeyboardEvent.code
  var held = {};
  var KEY_ALIAS = {           // fallback when e.code is unavailable
    w: 'KeyW', W: 'KeyW', a: 'KeyA', A: 'KeyA', s: 'KeyS', S: 'KeyS',
    d: 'KeyD', D: 'KeyD', e: 'KeyE', E: 'KeyE', r: 'KeyR', R: 'KeyR',
    q: 'KeyQ', Q: 'KeyQ', f: 'KeyF', F: 'KeyF', m: 'KeyM', M: 'KeyM',
    ' ': 'Space', Tab: 'Tab', ArrowUp: 'ArrowUp', ArrowDown: 'ArrowDown',
    ArrowLeft: 'ArrowLeft', ArrowRight: 'ArrowRight',
  };

  // pointer / aim (screen css px; converted to world coords each frame)
  var pointerSX = 0, pointerSY = 0;

  // touch virtual joystick (left half of screen)
  var joyId = null;           // active pointerId or null
  var joyX = 0, joyY = 0;     // analog move vector, |v| <= 1
  var joyR = 60;              // ring radius css px (sized per screen on grab)
  var joyDead = 10;           // deadzone radius css px
  var joyAlpha = 0;           // draw fade 0..1
  var virtualX = 0, virtualY = 0;
  var fixedTouchControls = false;

  // ------------------------------------------------------------- public API
  var input = {
    moveX: 0, moveY: 0,
    aimX: 0, aimY: 0,
    usePressed: false, reportPressed: false, killPressed: false,
    ventPressed: false, mapPressed: false,
    anyKey: function (cb) { if (typeof cb === 'function') anyKeyCbs.push(cb); },
  };

  var touch = { active: false, baseX: 0, baseY: 0, stickX: 0, stickY: 0 };

  var cam = {
    x: 0, y: 0,
    follow: function (x, y, dt) {
      if (!isFinite(x) || !isFinite(y)) return;
      var dx = x - cam.x, dy = y - cam.y;
      // teleport-distance targets (meeting gather, vent hop) snap instantly
      var span = Math.max(cssW, cssH) * 1.1 / zoomVal;
      if (dx * dx + dy * dy > span * span) { cam.x = x; cam.y = y; return; }
      var t = (typeof dt === 'number' && dt > 0) ? dt : 0.016;
      var k = 1 - Math.exp(-t * FOLLOW_RATE);
      cam.x += dx * k;
      cam.y += dy * k;
    },
    shake: function (amt) {
      if (typeof amt !== 'number' || !(amt > 0)) return;
      trauma = Math.min(1, trauma + amt);
    },
  };
  // camera.zoom: plain-looking field with clamping + "custom" tracking so the
  // default (fit ~11.5 tiles vertically) keeps applying across resizes until
  // game explicitly sets a zoom. Assigning a non-finite/<=0 value resets to
  // the responsive default.
  Object.defineProperty(cam, 'zoom', {
    enumerable: true,
    get: function () { return zoomVal; },
    set: function (v) {
      if (typeof v !== 'number' || !isFinite(v) || v <= 0) {
        zoomCustom = false;
        zoomVal = defaultZoom();
      } else {
        zoomCustom = true;
        zoomVal = U.clamp(v, ZOOM_MIN, ZOOM_MAX);
      }
    },
  });

  function defaultZoom() {
    return U.clamp(cssH / (FIT_TILES * AL.C.TILE), ZOOM_MIN, ZOOM_MAX);
  }

  // ------------------------------------------------------------ resize/dpr
  function resize() {
    winW = window.innerWidth;
    winH = window.innerHeight;
    rawDpr = window.devicePixelRatio || 1;
    cssW = Math.max(1, winW);
    cssH = Math.max(1, winH);
    dpr = U.clamp(rawDpr, 1, 3);
    if (canvas) {
      canvas.width = Math.max(1, Math.round(cssW * dpr));
      canvas.height = Math.max(1, Math.round(cssH * dpr));
      canvas.style.width = cssW + 'px';
      canvas.style.height = cssH + 'px';
      var rect = canvas.getBoundingClientRect();
      rectL = rect.left;
      rectT = rect.top;
    }
    if (!zoomCustom) zoomVal = defaultZoom();
    applySmoothing();
    AL.bus.emit('engine:resize', { w: cssW, h: cssH, dpr: dpr });
  }

  function checkResize() {
    if (window.innerWidth !== winW || window.innerHeight !== winH ||
        (window.devicePixelRatio || 1) !== rawDpr) {
      resize();
    }
  }

  function applySmoothing() {
    if (!ctx) return;
    // resizing the backing store resets 2d context state; reapply here
    ctx.imageSmoothingEnabled = smoothing;
  }

  // -------------------------------------------------------------- keyboard
  function isEditing() {
    var el = document.activeElement;
    if (!el) return false;
    var tag = el.tagName;
    return tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' ||
           el.isContentEditable === true;
  }

  function flushAnyKey() {
    if (!anyKeyCbs.length) return;
    var list = anyKeyCbs;
    anyKeyCbs = [];
    for (var i = 0; i < list.length; i++) {
      try { list[i](); } catch (e) { console.warn('[engine] anyKey handler error', e); }
    }
  }

  function onKeyDown(e) {
    // never fight browser shortcuts or a focused text field (chat, code entry)
    if (e.ctrlKey || e.metaKey || e.altKey) return;
    if (isEditing()) return;
    var code = e.code || KEY_ALIAS[e.key] || '';
    if (!code) return;
    flushAnyKey();
    switch (code) {
      case 'KeyW': case 'KeyA': case 'KeyS': case 'KeyD':
        held[code] = true;
        break;
      case 'ArrowUp': case 'ArrowDown': case 'ArrowLeft': case 'ArrowRight':
        held[code] = true;
        e.preventDefault();               // stop page scroll / focus walking
        break;
      case 'KeyE':
        if (!e.repeat) input.usePressed = true;
        break;
      case 'Space':
        if (!e.repeat) input.usePressed = true;
        e.preventDefault();               // stop scroll / focused-button clicks
        break;
      case 'KeyR':
        if (!e.repeat) input.reportPressed = true;
        break;
      case 'KeyQ':
        if (!e.repeat) input.killPressed = true;
        break;
      case 'KeyF':
        if (!e.repeat) input.ventPressed = true;
        break;
      case 'Tab':
        if (!e.repeat) input.mapPressed = true;
        e.preventDefault();               // keep focus where it is
        break;
      case 'KeyM':
        if (!e.repeat) input.mapPressed = true;
        break;
    }
  }

  function onKeyUp(e) {
    // always release, even while typing, so keys never stick after focus swaps
    var code = e.code || KEY_ALIAS[e.key] || '';
    if (code) held[code] = false;
  }

  function clearEdgeFlags() {
    input.usePressed = false;
    input.reportPressed = false;
    input.killPressed = false;
    input.ventPressed = false;
    input.mapPressed = false;
  }

  function clearInputs() {
    held = {};
    releaseJoy();
    clearEdgeFlags();
    input.moveX = 0;
    input.moveY = 0;
    virtualX = virtualY = 0;
  }

  // ------------------------------------------------------- pointer / touch
  function releaseJoy() {
    joyId = null;
    joyX = 0;
    joyY = 0;
    touch.active = false;
  }

  function joyStart(sx, sy) {
    joyR = U.clamp(Math.min(cssW, cssH) * 0.10, 44, 64);
    joyDead = joyR * 0.16;
    touch.active = true;
    touch.baseX = sx;
    touch.baseY = sy;
    touch.stickX = sx;
    touch.stickY = sy;
    joyX = 0;
    joyY = 0;
  }

  function joyMove(sx, sy) {
    var dx = sx - touch.baseX, dy = sy - touch.baseY;
    var len = Math.sqrt(dx * dx + dy * dy);
    if (len > joyR) {
      // floating base: drag the ring along so the stick pins to its edge
      var over = (len - joyR) / len;
      touch.baseX += dx * over;
      touch.baseY += dy * over;
      dx = sx - touch.baseX;
      dy = sy - touch.baseY;
      len = joyR;
    }
    touch.stickX = sx;
    touch.stickY = sy;
    if (len <= joyDead || len < 0.0001) {
      joyX = 0;
      joyY = 0;
      return;
    }
    var mag = U.clamp((len - joyDead) / (joyR - joyDead), 0, 1);
    joyX = (dx / len) * mag;
    joyY = (dy / len) * mag;
  }

  function onPointerDown(e) {
    var sx = e.clientX - rectL, sy = e.clientY - rectT;
    if (e.pointerType === 'touch') {
      if (!fixedTouchControls && joyId === null && sx < cssW * 0.5) {
        joyId = e.pointerId;
        joyStart(sx, sy);
        return;
      }
      // right-half (or extra) touches steer the aim point
      pointerSX = sx;
      pointerSY = sy;
    } else {
      pointerSX = sx;
      pointerSY = sy;
    }
  }

  function onWindowPointerDown() {
    flushAnyKey();
  }

  function onPointerMove(e) {
    var sx = e.clientX - rectL, sy = e.clientY - rectT;
    if (joyId !== null && e.pointerId === joyId) {
      joyMove(sx, sy);
      return;
    }
    pointerSX = sx;
    pointerSY = sy;
  }

  function onPointerUp(e) {
    if (joyId !== null && e.pointerId === joyId) releaseJoy();
  }

  function onContextMenu(e) {
    e.preventDefault();
  }

  // --------------------------------------------------------- per-frame work
  function computeInput() {
    // keyboard vector (digital), diagonal normalized
    var kx = 0, ky = 0;
    if (held.KeyA || held.ArrowLeft) kx -= 1;
    if (held.KeyD || held.ArrowRight) kx += 1;
    if (held.KeyW || held.ArrowUp) ky -= 1;
    if (held.KeyS || held.ArrowDown) ky += 1;
    var mx = kx, my = ky;
    if (kx !== 0 && ky !== 0) {
      mx *= 0.7071067811865476;
      my *= 0.7071067811865476;
    }
    // blend in analog joystick, clamp combined magnitude to 1
    mx += joyX + virtualX;
    my += joyY + virtualY;
    var len2 = mx * mx + my * my;
    if (len2 > 1) {
      var inv = 1 / Math.sqrt(len2);
      mx *= inv;
      my *= inv;
    }
    input.moveX = mx;
    input.moveY = my;
    // aim: last pointer screen position -> world coords through the camera
    input.aimX = cam.x + curShakeX + (pointerSX - cssW * 0.5) / zoomVal;
    input.aimY = cam.y + curShakeY + (pointerSY - cssH * 0.5) / zoomVal;
  }

  function updateShake(dt, tMs) {
    if (trauma > 0) {
      trauma = Math.max(0, trauma - dt * TRAUMA_DECAY);
      // trauma^2 amplitude with layered sines: smooth, cheap, allocation-free
      var m = trauma * trauma * (SHAKE_PX / zoomVal);
      var ts = tMs * 0.001;
      curShakeX = m * (Math.sin(ts * 31.4) * 0.55 + Math.sin(ts * 13.7 + 2.1) * 0.45);
      curShakeY = m * (Math.sin(ts * 27.7 + 4.2) * 0.55 + Math.sin(ts * 11.3 + 0.7) * 0.45);
    } else {
      curShakeX = 0;
      curShakeY = 0;
    }
  }

  function updateTouchFade(dt) {
    var target = touch.active ? 1 : 0;
    joyAlpha += (target - joyAlpha) * Math.min(1, dt * 12);
    if (joyAlpha < 0.001) joyAlpha = 0;
    if (!touch.active && joyAlpha > 0) {
      // ghost stick eases home while the ring fades out
      var k = Math.min(1, dt * 14);
      touch.stickX += (touch.baseX - touch.stickX) * k;
      touch.stickY += (touch.baseY - touch.stickY) * k;
    }
  }

  function frame(ts) {
    if (!running) return;
    rafId = requestAnimationFrame(frame);
    var dt = lastT === 0 ? 0.016 : (ts - lastT) * 0.001;
    lastT = ts;
    if (dt < 0) dt = 0;
    else if (dt > MAX_DT) dt = MAX_DT;

    checkResize();
    updateShake(dt, ts);
    updateTouchFade(dt);
    computeInput();

    for (var i = 0; i < frameCbs.length; i++) {
      try { frameCbs[i](dt, ts); }
      catch (e) { console.warn('[engine] frame handler error', e); }
    }
    clearEdgeFlags();  // edge-triggered actions live for exactly one frame
  }

  // ----------------------------------------------------------- collision --
  // Axis-separated circle vs solid tiles. Resolving X and Y independently
  // makes players slide along walls; the sqrt term rounds off tile corners
  // so brushing past a doorway never snags.
  function resolveX(map, x, y, r) {
    var TILE = AL.C.TILE;
    var minTx = Math.floor((x - r) / TILE), maxTx = Math.floor((x + r) / TILE);
    var minTy = Math.floor((y - r) / TILE), maxTy = Math.floor((y + r) / TILE);
    var r2 = r * r;
    for (var ty = minTy; ty <= maxTy; ty++) {
      var top = ty * TILE, bot = top + TILE;
      var cy = y < top ? top : (y > bot ? bot : y);
      var dy = y - cy;
      var d2 = r2 - dy * dy;
      if (d2 <= 0) continue;                 // circle can't reach this row
      for (var tx = minTx; tx <= maxTx; tx++) {
        if (!map.isSolid(tx, ty)) continue;
        var left = tx * TILE, right = left + TILE;
        var cx = x < left ? left : (x > right ? right : x);
        var ddx = x - cx;
        if (ddx * ddx >= d2) continue;       // no overlap
        var need = Math.sqrt(d2) + 0.01;
        x = x < left + TILE * 0.5 ? left - need : right + need;
      }
    }
    return x;
  }

  function resolveY(map, x, y, r) {
    var TILE = AL.C.TILE;
    var minTx = Math.floor((x - r) / TILE), maxTx = Math.floor((x + r) / TILE);
    var minTy = Math.floor((y - r) / TILE), maxTy = Math.floor((y + r) / TILE);
    var r2 = r * r;
    for (var tx = minTx; tx <= maxTx; tx++) {
      var left = tx * TILE, right = left + TILE;
      var cx = x < left ? left : (x > right ? right : x);
      var dx = x - cx;
      var d2 = r2 - dx * dx;
      if (d2 <= 0) continue;                 // circle can't reach this column
      for (var ty = minTy; ty <= maxTy; ty++) {
        if (!map.isSolid(tx, ty)) continue;
        var top = ty * TILE, bot = top + TILE;
        var cy = y < top ? top : (y > bot ? bot : y);
        var ddy = y - cy;
        if (ddy * ddy >= d2) continue;
        var need = Math.sqrt(d2) + 0.01;
        y = y < top + TILE * 0.5 ? top - need : bot + need;
      }
    }
    return y;
  }

  // ------------------------------------------------------- engine assembly
  AL.engine = {
    input: input,
    touch: touch,
    setVirtualMove: function (x, y) {
      virtualX = isFinite(x) ? U.clamp(x, -1, 1) : 0;
      virtualY = isFinite(y) ? U.clamp(y, -1, 1) : 0;
    },
    setTouchControlsVisible: function (visible) {
      fixedTouchControls = !!visible;
      if (visible) releaseJoy();
      else virtualX = virtualY = 0;
    },
    camera: cam,

    init: function (cv) {
      if (!cv || typeof cv.getContext !== 'function') {
        console.warn('[engine] init requires a canvas element');
        return;
      }
      // defensive: tear down previous listeners if init is called again
      for (var i = 0; i < unbinders.length; i++) unbinders[i]();
      unbinders.length = 0;

      canvas = cv;
      ctx = canvas.getContext('2d');
      canvas.style.touchAction = 'none';   // we own all touch gestures

      var bind = function (target, ev, fn, opts) {
        target.addEventListener(ev, fn, opts);
        unbinders.push(function () { target.removeEventListener(ev, fn, opts); });
      };
      bind(window, 'keydown', onKeyDown);
      bind(window, 'keyup', onKeyUp);
      bind(window, 'blur', clearInputs);
      bind(document, 'visibilitychange', function () {
        if (document.hidden) clearInputs();
      });
      bind(window, 'resize', resize);
      bind(window, 'pointerdown', onWindowPointerDown, true);
      bind(canvas, 'pointerdown', onPointerDown);
      bind(window, 'pointermove', onPointerMove);
      bind(window, 'pointerup', onPointerUp);
      bind(window, 'pointercancel', onPointerUp);
      bind(canvas, 'contextmenu', onContextMenu);

      resize();
      pointerSX = cssW * 0.5;
      pointerSY = cssH * 0.5;
    },

    onFrame: function (fn) {
      if (typeof fn !== 'function') return function () {};
      frameCbs.push(fn);
      return function () {
        var i = frameCbs.indexOf(fn);
        if (i >= 0) frameCbs.splice(i, 1);
      };
    },

    start: function () {
      if (running) return;
      running = true;
      lastT = 0;
      clearEdgeFlags();
      rafId = requestAnimationFrame(frame);
    },

    stop: function () {
      running = false;
      if (rafId) cancelAnimationFrame(rafId);
      rafId = 0;
      lastT = 0;
    },

    // world transform: screen center follows camera (plus shake), scaled by
    // zoom, in device pixels so world drawing is crisp on hi-dpi screens.
    applyCamera: function (c) {
      if (!c) return;
      var s = dpr * zoomVal;
      c.setTransform(s, 0, 0, s,
        dpr * (cssW * 0.5 - (cam.x + curShakeX) * zoomVal),
        dpr * (cssH * 0.5 - (cam.y + curShakeY) * zoomVal));
    },

    // back to screen space: 1 unit == 1 css px
    resetCamera: function (c) {
      if (!c) return;
      c.setTransform(dpr, 0, 0, dpr, 0, 0);
    },

    worldFromScreen: function (sx, sy) {
      return {
        x: cam.x + curShakeX + (sx - cssW * 0.5) / zoomVal,
        y: cam.y + curShakeY + (sy - cssH * 0.5) / zoomVal,
      };
    },

    screenFromWorld: function (wx, wy) {
      return {
        x: cssW * 0.5 + (wx - cam.x - curShakeX) * zoomVal,
        y: cssH * 0.5 + (wy - cam.y - curShakeY) * zoomVal,
      };
    },

    moveCircle: function (map, x, y, dx, dy, r) {
      if (typeof r !== 'number' || !(r > 0)) r = AL.C.PLAYER_R;
      if (!isFinite(dx)) dx = 0;
      if (!isFinite(dy)) dy = 0;
      if (!map || typeof map.isSolid !== 'function') {
        return { x: x + dx, y: y + dy };
      }
      // resolve even at zero delta so a door closing on a standing player
      // pushes them out instead of trapping them inside a solid tile
      x = resolveX(map, x + dx, y, r);
      y = resolveY(map, x, y + dy, r);
      return { x: x, y: y };
    },

    canvasSize: function () {
      return { w: cssW, h: cssH };
    },

    dpr: function () {
      return dpr;
    },

    setPixelSmoothing: function (v) {
      smoothing = !!v;
      applySmoothing();
    },

    // virtual joystick overlay; render calls this late in its draw order.
    // Draws in screen space regardless of the ctx transform it is handed.
    drawTouchUI: function (c) {
      if (!c || fixedTouchControls || joyAlpha < 0.02) return;
      c.save();
      c.setTransform(dpr, 0, 0, dpr, 0, 0);
      var bx = touch.baseX, by = touch.baseY;
      var strength = Math.sqrt(joyX * joyX + joyY * joyY);
      // base ring
      c.globalAlpha = joyAlpha * 0.85;
      c.beginPath();
      c.arc(bx, by, joyR, 0, TAU);
      c.fillStyle = 'rgba(21,27,49,0.38)';
      c.fill();
      c.lineWidth = 2.5;
      c.strokeStyle = 'rgba(139,150,201,0.8)';
      c.stroke();
      // deadzone hint
      c.beginPath();
      c.arc(bx, by, joyDead, 0, TAU);
      c.lineWidth = 1.5;
      c.strokeStyle = 'rgba(139,150,201,0.35)';
      c.stroke();
      // direction tick on the ring edge when pushing
      if (strength > 0.05) {
        var a = Math.atan2(joyY, joyX);
        c.beginPath();
        c.arc(bx, by, joyR, a - 0.45, a + 0.45);
        c.lineWidth = 4;
        c.strokeStyle = 'rgba(53,224,255,' + (0.25 + 0.55 * strength).toFixed(3) + ')';
        c.stroke();
      }
      // stick nub
      var nub = joyR * 0.42;
      c.globalAlpha = joyAlpha;
      c.beginPath();
      c.arc(touch.stickX, touch.stickY, nub, 0, TAU);
      c.fillStyle = 'rgba(53,224,255,0.4)';
      c.fill();
      c.lineWidth = 3;
      c.strokeStyle = 'rgba(53,224,255,0.9)';
      c.stroke();
      // soft specular highlight
      c.beginPath();
      c.arc(touch.stickX - nub * 0.28, touch.stickY - nub * 0.32, nub * 0.32, 0, TAU);
      c.fillStyle = 'rgba(234,240,255,0.28)';
      c.fill();
      c.restore();
    },
  };
})();
