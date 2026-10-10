/* Outcast — util.js: global namespace, constants, helpers, event bus */
(function () {
  'use strict';
  window.AL = window.AL || {};

  AL.C = {
    TILE: 64,
    PLAYER_R: 20,
    SPEED: 230,
    VISION_CREW: 5.0,
    VISION_IMP: 7.5,
    KILL_RANGE: 78,
    USE_RANGE: 84,
    REPORT_RANGE: 120,
    SNAP_HZ: 15,
    INTERP_MS: 120,
    MAX_PLAYERS: 15,
    PROTO: 1,
    NAME: 'Outcast',
    VERSION: '1.0.0',
  };

  var CODE_CHARS = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // no 0/O/1/I

  AL.util = {
    clamp: function (v, a, b) { return v < a ? a : (v > b ? b : v); },
    lerp: function (a, b, t) { return a + (b - a) * t; },
    dist: function (x1, y1, x2, y2) {
      var dx = x2 - x1, dy = y2 - y1;
      return Math.sqrt(dx * dx + dy * dy);
    },
    angle: function (x1, y1, x2, y2) { return Math.atan2(y2 - y1, x2 - x1); },
    // mulberry32 seeded prng
    rng: function (seed) {
      var a = (seed >>> 0) || 1;
      return function () {
        a |= 0; a = (a + 0x6D2B79F5) | 0;
        var t = Math.imul(a ^ (a >>> 15), 1 | a);
        t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
        return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
      };
    },
    hashStr: function (s) {
      var h = 2166136261;
      for (var i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); }
      return h >>> 0;
    },
    randId: function (len) {
      len = len || 6;
      var out = '';
      var cryptoObj = window.crypto || window.msCrypto;
      if (cryptoObj && cryptoObj.getRandomValues) {
        var buf = new Uint32Array(len);
        cryptoObj.getRandomValues(buf);
        for (var i = 0; i < len; i++) out += CODE_CHARS[buf[i] % CODE_CHARS.length];
      } else {
        for (var j = 0; j < len; j++) out += CODE_CHARS[Math.floor(Math.random() * CODE_CHARS.length)];
      }
      return out;
    },
    pick: function (arr, rnd) {
      var r = rnd ? rnd() : Math.random();
      return arr[Math.floor(r * arr.length) % arr.length];
    },
    shuffle: function (arr, rnd) {
      var a = arr.slice();
      for (var i = a.length - 1; i > 0; i--) {
        var r = rnd ? rnd() : Math.random();
        var j = Math.floor(r * (i + 1));
        var tmp = a[i]; a[i] = a[j]; a[j] = tmp;
      }
      return a;
    },
    now: function () { return performance.now(); },
    fmtTime: function (seconds) {
      seconds = Math.max(0, Math.ceil(seconds));
      var m = Math.floor(seconds / 60), s = seconds % 60;
      return m + ':' + (s < 10 ? '0' : '') + s;
    },
    deep: function (obj) { return JSON.parse(JSON.stringify(obj)); },
  };

  // Global event bus
  var listeners = {};
  AL.bus = {
    on: function (ev, fn) {
      (listeners[ev] = listeners[ev] || []).push(fn);
      return function () { AL.bus.off(ev, fn); };
    },
    off: function (ev, fn) {
      var l = listeners[ev];
      if (!l) return;
      var i = l.indexOf(fn);
      if (i >= 0) l.splice(i, 1);
    },
    once: function (ev, fn) {
      var off = AL.bus.on(ev, function (p) { off(); fn(p); });
      return off;
    },
    emit: function (ev, payload) {
      var l = listeners[ev];
      if (!l) return;
      // copy: handlers may unsubscribe during emit
      var copy = l.slice();
      for (var i = 0; i < copy.length; i++) {
        try { copy[i](payload); }
        catch (e) { console.warn('[bus] handler error for ' + ev, e); }
      }
    },
  };
})();
