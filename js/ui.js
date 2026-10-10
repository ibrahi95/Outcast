/* Outcast — ui.js: menus, lobby, wardrobe, options, end screen. Owns styles.css. */
(function () {
  'use strict';
  window.AL = window.AL || {};

  var U = AL.util, BUS = AL.bus;
  var DPR = Math.min(2, window.devicePixelRatio || 1);

  /* ============================================================
     Tiny DOM helpers
     ============================================================ */
  function el(tag, cls, parent) {
    var e = document.createElement(tag);
    if (cls) e.className = cls;
    if (parent) parent.appendChild(e);
    return e;
  }
  function txt(parent, tag, cls, text) {
    var e = el(tag, cls, parent);
    e.textContent = text;
    return e;
  }
  function btn(parent, cls, label, onClick) {
    var b = el('button', 'ui-btn' + (cls ? ' ' + cls : ''), parent);
    b.type = 'button';
    b.textContent = label;
    if (onClick) b.addEventListener('click', onClick);
    return b;
  }
  function makeCanvas(parent, cls, cssW, cssH) {
    var cv = el('canvas', cls, parent);
    cv.width = Math.round(cssW * DPR);
    cv.height = Math.round(cssH * DPR);
    cv.style.width = cssW + 'px';
    cv.style.height = cssH + 'px';
    var ctx = cv.getContext('2d');
    ctx.scale(DPR, DPR);
    return { cv: cv, ctx: ctx, w: cssW, h: cssH };
  }
  function sfx(id, opts) {
    try { if (AL.audio && AL.audio.sfx) AL.audio.sfx(id, opts); } catch (e) {}
  }
  function loadJSON(key, fallback) {
    try {
      var s = localStorage.getItem(key);
      if (s) return JSON.parse(s);
    } catch (e) {}
    return fallback;
  }
  function saveJSON(key, val) {
    try { localStorage.setItem(key, JSON.stringify(val)); } catch (e) {}
  }
  function clamp01(v, d) {
    v = parseFloat(v);
    if (isNaN(v)) return d;
    return Math.max(0, Math.min(1, v));
  }
  function getPath(obj, key) {
    if (!obj) return undefined;
    if (key.indexOf('.') < 0) return obj[key];
    var parts = key.split('.'), v = obj;
    for (var i = 0; i < parts.length; i++) {
      if (v == null) return undefined;
      v = v[parts[i]];
    }
    return v;
  }

  /* ============================================================
     Profile + options (persisted)
     ============================================================ */
  function normalizeProfile(p) {
    p = p || {};
    var color = parseInt(p.color, 10);
    if (isNaN(color) || color < 0 || color > 17) color = Math.floor(Math.random() * 18);
    return {
      name: typeof p.name === 'string' ? p.name.slice(0, 12) : '',
      color: color,
      hat: typeof p.hat === 'string' ? p.hat : 'none',
      pet: typeof p.pet === 'string' ? p.pet : 'none',
      skin: typeof p.skin === 'string' ? p.skin : 'none',
    };
  }
  var profile = normalizeProfile(loadJSON('al_profile', null));
  function saveProfile() { saveJSON('al_profile', profile); }
  function safeProfile() {
    return AL.wardrobe ? AL.wardrobe.sanitize(profile) : Object.assign({}, profile, {hat:'none',pet:'none',skin:'none'});
  }
  if (AL.wardrobe) profile = AL.wardrobe.sanitize(profile);
  BUS.on('wardrobe:access', function (access) {
    if (access.status === 'checking' || access.status === 'connecting') return;
    profile = safeProfile();
    saveProfile();
  });

  var savedOpts = loadJSON('al_options', null) || {};
  var uiOptions = {
    musicVol: clamp01(savedOpts.musicVol, 0.8),
    sfxVol: clamp01(savedOpts.sfxVol, 0.9),
    colorblind: !!savedOpts.colorblind,
    reducedFlash: !!savedOpts.reducedFlash,
  };
  function saveOptions() { saveJSON('al_options', uiOptions); }
  function applyAudioOptions() {
    try {
      if (AL.audio) {
        if (AL.audio.setMusicVol) AL.audio.setMusicVol(uiOptions.musicVol);
        if (AL.audio.setSfxVol) AL.audio.setSfxVol(uiOptions.sfxVol);
      }
    } catch (e) {}
  }

  /* ============================================================
     Audio bootstrapping (first gesture) + music intent
     ============================================================ */
  var audioStarted = false;
  var desiredMusic = null;
  function ensureAudio() {
    if (audioStarted) return;
    audioStarted = true;
    try { if (AL.audio && AL.audio.init) AL.audio.init(); } catch (e) {}
    applyAudioOptions();
    if (desiredMusic) {
      try { if (AL.audio && AL.audio.playMusic) AL.audio.playMusic(desiredMusic); } catch (e) {}
    }
  }
  function playMusic(id) {
    desiredMusic = id;
    if (!audioStarted) return;
    try { if (AL.audio && AL.audio.playMusic) AL.audio.playMusic(id); } catch (e) {}
  }

  /* ============================================================
     Mode metadata (ui-side copy)
     ============================================================ */
  var MODES = [
    { id: 'classic', name: 'Classic', tag: '4-15 players',
      desc: 'Finish tasks while impostors hunt. Meetings, votes, sabotage — the full experience.' },
    { id: 'hideseek', name: 'Hide & Seek', tag: 'No meetings',
      desc: 'Impostors are revealed and fast. Survive until the clock runs out — tasks buy time.' },
    { id: 'outbreak', name: 'Outbreak', tag: 'Infection',
      desc: 'One player starts infected. Kills convert instead of eliminate. Fill the taskbar before everyone turns.' },
    { id: 'bombtag', name: 'Bomb Tag', tag: 'Free-for-all',
      desc: 'A live bomb passes on touch and explodes every 25 seconds. Last bean standing wins.' },
    { id: 'sprint', name: 'Task Sprint', tag: 'Race',
      desc: 'No kills, no lies. Everyone gets the same tasks — first to finish them all wins.' },
  ];
  function modeMeta(id) {
    for (var i = 0; i < MODES.length; i++) if (MODES[i].id === id) return MODES[i];
    return MODES[0];
  }
  function minPlayersFor(mode) { return mode === 'classic' ? 4 : 2; }
  function mapsForMode(mode) {
    var list = [];
    try { list = (AL.maps && AL.maps.list) ? AL.maps.list() : []; } catch (e) { list = []; }
    return list.filter(function (d) {
      var m = d.modes;
      if (!m || m === 'all') return true;
      if (Object.prototype.toString.call(m) === '[object Array]') {
        return m.indexOf(mode) >= 0 || m.indexOf('all') >= 0;
      }
      return true;
    });
  }

  /* ============================================================
     Character drawing helpers (defensive around AL.chars)
     ============================================================ */
  function drawPortraitTo(ctx, opts) {
    try {
      if (AL.chars && AL.chars.drawPortrait) { AL.chars.drawPortrait(ctx, opts); return true; }
    } catch (e) {}
    // graceful fallback dot
    try {
      var col = (AL.chars && AL.chars.COLORS && AL.chars.COLORS[opts.color]) ? AL.chars.COLORS[opts.color].body : '#8b96c9';
      ctx.fillStyle = col;
      ctx.beginPath();
      ctx.arc(opts.x, opts.y, opts.size * 0.4, 0, Math.PI * 2);
      ctx.fill();
    } catch (e2) {}
    return false;
  }
  function drawBeanTo(ctx, p) {
    try { if (AL.chars && AL.chars.draw) { AL.chars.draw(ctx, p); return true; } } catch (e) {}
    return false;
  }
  function colorOf(idx) {
    try {
      var c = AL.chars && AL.chars.COLORS && AL.chars.COLORS[idx];
      if (c && c.body) return c.body;
    } catch (e) {}
    return '#8b96c9';
  }
  function playerPortrait(parent, p, size) {
    var c = makeCanvas(parent, 'ui-portrait', size, size);
    drawPortraitTo(c.ctx, {
      x: size / 2, y: size / 2 + size * 0.08, size: size * 0.92,
      color: p.color || 0, hat: p.hat || 'none', skin: p.skin || 'none',
      dead: !!p.dead, t: 0, dir: 1,
    });
    return c.cv;
  }
  function mapThumb(parent, mapId, w, h) {
    var c = makeCanvas(parent, 'ui-mapthumb', w, h);
    var drew = false;
    try {
      if (AL.render && AL.render.getMapThumb) {
        var src = AL.render.getMapThumb(mapId, Math.round(w * DPR), Math.round(h * DPR));
        if (src) { c.ctx.drawImage(src, 0, 0, w, h); drew = true; }
      }
    } catch (e) {}
    if (!drew) {
      var g = c.ctx.createLinearGradient(0, 0, w, h);
      g.addColorStop(0, '#1d2440');
      g.addColorStop(1, '#151b31');
      c.ctx.fillStyle = g;
      c.ctx.fillRect(0, 0, w, h);
      c.ctx.strokeStyle = '#2c3560';
      c.ctx.strokeRect(4.5, 4.5, w - 9, h - 9);
    }
    return c.cv;
  }

  /* ============================================================
     Animation ticker (shared rAF; screens register/unregister)
     ============================================================ */
  var ticks = [];
  var rafId = 0, lastT = 0;
  function tickLoop(t) {
    rafId = 0;
    if (!ticks.length) return;
    var dt = Math.min(0.05, Math.max(0.001, (t - lastT) / 1000));
    lastT = t;
    var copy = ticks.slice();
    for (var i = 0; i < copy.length; i++) {
      try { copy[i](dt, t); } catch (e) {}
    }
    if (ticks.length) rafId = requestAnimationFrame(tickLoop);
  }
  function addTick(fn) {
    ticks.push(fn);
    if (!rafId) { lastT = performance.now(); rafId = requestAnimationFrame(tickLoop); }
    return function () {
      var i = ticks.indexOf(fn);
      if (i >= 0) ticks.splice(i, 1);
    };
  }

  /* ============================================================
     Screen management
     ============================================================ */
  var root = null, layer = null, toastWrap = null;
  var current = null, currentEl = null;
  var cleanups = [];
  var lastLobby = null; // last game:lobby payload
  var lastEnd = null;   // last game:end payload
  var lobbyRefs = null; // live refs into the lobby DOM

  function onCleanup(fn) { cleanups.push(fn); }
  function busOnScreen(ev, fn) { onCleanup(BUS.on(ev, fn)); }
  function tickOnScreen(fn) { onCleanup(addTick(fn)); }

  var MENU_FAMILY = { menu: 1, join: 1, host: 1, freeplay: 1, wardrobe: 1, howto: 1, options: 1 };
  var BACK_TARGET = { join: 'menu', host: 'menu', freeplay: 'menu', wardrobe: 'menu', howto: 'menu', options: 'menu' };

  function showScreen(name) {
    for (var i = 0; i < cleanups.length; i++) { try { cleanups[i](); } catch (e) {} }
    cleanups.length = 0;
    lobbyRefs = null;
    if (currentEl) {
      var old = currentEl;
      old.classList.add('ui-exit');
      setTimeout(function () { if (old.parentNode) old.parentNode.removeChild(old); }, 220);
      currentEl = null;
    }
    current = name || null;
    if (name && builders[name]) {
      var scr = el('section', 'ui-screen ui-screen-' + name, layer);
      try { builders[name](scr); }
      catch (e) {
        console.warn('[ui] failed to build screen ' + name, e);
        var p = el('div', 'ui-panel ui-error-panel', scr);
        txt(p, 'h2', 'ui-panel-title', 'Something broke');
        txt(p, 'p', 'ui-dim', 'This screen failed to load. Returning to the menu may help.');
        btn(p, 'ui-btn-primary', 'BACK TO MENU', function () { showScreen('menu'); });
      }
      currentEl = scr;
    }
    if (name === 'lobby') playMusic('lobby');
    else if (name && MENU_FAMILY[name]) playMusic('menu');
    BUS.emit('ui:screen', { screen: current });
  }

  /* ============================================================
     Toasts
     ============================================================ */
  function toast(text, kind) {
    if (!toastWrap) return;
    while (toastWrap.children.length >= 4) toastWrap.removeChild(toastWrap.firstChild);
    var t = el('div', 'ui-toast' + (kind === 'warn' ? ' ui-toast-warn' : ''), toastWrap);
    t.textContent = text;
    requestAnimationFrame(function () { t.classList.add('ui-toast-show'); });
    setTimeout(function () {
      t.classList.remove('ui-toast-show');
      setTimeout(function () { if (t.parentNode) t.parentNode.removeChild(t); }, 300);
    }, 3400);
  }

  /* ============================================================
     Modals
     ============================================================ */
  var modalEl = null;
  function closeModal() {
    if (!modalEl) return;
    var m = modalEl;
    modalEl = null;
    m.classList.add('ui-exit');
    setTimeout(function () { if (m.parentNode) m.parentNode.removeChild(m); }, 200);
  }
  function showModal(opts) {
    closeModal();
    var back = el('div', 'ui-modal-backdrop', layer);
    var panel = el('div', 'ui-modal ui-panel' + (opts.kind ? ' ui-modal-' + opts.kind : ''), back);
    txt(panel, 'h2', 'ui-panel-title', opts.title || 'Notice');
    if (opts.message) txt(panel, 'p', 'ui-modal-msg', opts.message);
    var row = el('div', 'ui-modal-row', panel);
    (opts.buttons || [{ label: 'OK', cls: 'ui-btn-primary', cb: closeModal }]).forEach(function (b) {
      btn(row, b.cls || '', b.label, function () { (b.cb || closeModal)(); });
    });
    if (opts.dismissable !== false) {
      back.addEventListener('click', function (ev) { if (ev.target === back) closeModal(); });
    }
    modalEl = back;
    return back;
  }
  function confirmDialog(title, message, yesLabel, onYes) {
    showModal({
      title: title, message: message, kind: 'confirm',
      buttons: [
        { label: 'CANCEL', cls: 'ui-btn-ghost', cb: closeModal },
        { label: yesLabel, cls: 'ui-btn-danger', cb: function () { closeModal(); onYes(); } },
      ],
    });
  }

  /* ============================================================
     Shared widgets
     ============================================================ */
  function nameField(parent, autofocus) {
    var wrap = el('label', 'ui-field', parent);
    txt(wrap, 'span', 'ui-field-label', 'YOUR NAME');
    var input = el('input', 'ui-input', wrap);
    input.type = 'text';
    input.maxLength = 12;
    input.placeholder = 'Bean';
    input.autocomplete = 'off';
    input.spellcheck = false;
    input.value = profile.name;
    input.addEventListener('input', function () {
      profile.name = input.value.slice(0, 12);
      saveProfile();
    });
    if (autofocus) setTimeout(function () { try { input.focus(); } catch (e) {} }, 250);
    return input;
  }
  function requireName(input) {
    var n = (profile.name || '').trim();
    if (n) { profile.name = n; saveProfile(); return true; }
    input.classList.remove('ui-shake');
    void input.offsetWidth;
    input.classList.add('ui-shake');
    input.focus();
    toast('Pick a name first!', 'warn');
    return false;
  }
  function backRow(parent, target) {
    var row = el('div', 'ui-back-row', parent);
    var b = btn(row, 'ui-btn-ghost ui-btn-small', '← BACK', function () { showScreen(target || 'menu'); });
    b.dataset.sfx = 'back';
    return row;
  }
  function stepper(parent, cls, min, max, value, onChange) {
    var wrap = el('div', 'ui-stepper' + (cls ? ' ' + cls : ''), parent);
    var minus = btn(wrap, 'ui-btn-small ui-step-btn', '−');
    var num = txt(wrap, 'span', 'ui-step-val', String(value));
    var plus = btn(wrap, 'ui-btn-small ui-step-btn', '+');
    var v = value;
    function set(nv) {
      nv = Math.max(min, Math.min(max, nv));
      if (nv === v) return;
      v = nv;
      num.textContent = String(v);
      onChange(v);
    }
    minus.addEventListener('click', function () { set(v - 1); });
    plus.addEventListener('click', function () { set(v + 1); });
    return { get: function () { return v; }, set: set };
  }
  function copyText(s, done) {
    var ok = function () { if (done) done(true); };
    var legacy = function () {
      try {
        var ta = document.createElement('textarea');
        ta.value = s;
        ta.style.position = 'fixed';
        ta.style.opacity = '0';
        document.body.appendChild(ta);
        ta.select();
        document.execCommand('copy');
        document.body.removeChild(ta);
        ok();
      } catch (e) { if (done) done(false); }
    };
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(s).then(ok, legacy);
    } else legacy();
  }

  /* ============================================================
     Screen: MENU
     ============================================================ */
  function buildMenu(scr) {
    var wrap = el('div', 'ui-menu-wrap', scr);

    // Logotype
    var logo = el('h1', 'ui-logo', wrap);
    var name = (AL.C && AL.C.NAME) || 'Outcast';
    for (var i = 0; i < name.length; i++) {
      var span = txt(logo, 'span', 'ui-logo-letter', name[i]);
      span.style.animationDelay = (i * 0.09) + 's';
    }
    txt(wrap, 'div', 'ui-tagline', 'trust no one');
    txt(wrap, 'div', 'ui-version', 'v' + ((AL.C && AL.C.VERSION) || '1.0.0'));

    // Buttons
    var col = el('nav', 'ui-menu-buttons', wrap);
    btn(col, 'ui-btn-big ui-btn-primary', 'HOST GAME', function () { showScreen('host'); });
    btn(col, 'ui-btn-big ui-btn-primary', 'JOIN GAME', function () { showScreen('join'); });
    btn(col, 'ui-btn-big ui-btn-good', 'FREEPLAY', function () { showScreen('freeplay'); });
    btn(col, 'ui-btn-big', 'WARDROBE', function () { showScreen('wardrobe'); });
    btn(col, 'ui-btn-big', 'HOW TO PLAY', function () { showScreen('howto'); });
    btn(col, 'ui-btn-big', 'OPTIONS', function () { showScreen('options'); });

    // Ambient walking bean strip
    var stripWrap = el('div', 'ui-menu-strip', scr);
    var strip = null;
    var walker = { x: -90 };
    function rebuildStrip() {
      stripWrap.innerHTML = '';
      var w = Math.max(320, stripWrap.clientWidth || window.innerWidth);
      strip = makeCanvas(stripWrap, 'ui-strip-canvas', w, 130);
    }
    rebuildStrip();
    var onResize = function () { rebuildStrip(); };
    window.addEventListener('resize', onResize);
    onCleanup(function () { window.removeEventListener('resize', onResize); });

    tickOnScreen(function (dt, t) {
      if (!strip) return;
      var ctx = strip.ctx, w = strip.w, h = strip.h;
      walker.x += 62 * dt;
      if (walker.x > w + 120) walker.x = -120;
      ctx.clearRect(0, 0, w, h);
      // subtle floor glow line
      ctx.save();
      ctx.globalAlpha = 0.25;
      var g = ctx.createLinearGradient(0, h - 18, 0, h);
      g.addColorStop(0, 'rgba(53,224,255,0)');
      g.addColorStop(1, 'rgba(53,224,255,0.35)');
      ctx.fillStyle = g;
      ctx.fillRect(0, h - 18, w, 18);
      ctx.restore();
      drawBeanTo(ctx, {
        x: walker.x, y: h - 26,
        color: profile.color, hat: profile.hat, skin: profile.skin,
        pet: profile.pet !== 'none' ? profile.pet : null,
        petX: walker.x - 58, petY: h - 22,
        dir: 1, moving: true, dead: false, t: t, scale: 1.1,
      });
    });
  }

  /* ============================================================
     Screen: JOIN
     ============================================================ */
  function buildJoin(scr) {
    var panel = el('div', 'ui-panel ui-form-panel', scr);
    backRow(panel, 'menu');
    txt(panel, 'h2', 'ui-panel-title', 'JOIN GAME');
    txt(panel, 'p', 'ui-dim', 'Enter the 6-letter room code your host shared.');

    var nameInput = nameField(panel, false);

    var codeWrap = el('label', 'ui-field', panel);
    txt(codeWrap, 'span', 'ui-field-label', 'ROOM CODE');
    var codeInput = el('input', 'ui-input ui-code-input', codeWrap);
    codeInput.type = 'text';
    codeInput.maxLength = 6;
    codeInput.placeholder = 'ABC123';
    codeInput.autocomplete = 'off';
    codeInput.spellcheck = false;
    codeInput.addEventListener('input', function () {
      var v = codeInput.value.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 6);
      if (v !== codeInput.value) codeInput.value = v;
      else codeInput.value = v;
    });

    var status = txt(panel, 'div', 'ui-status', '');
    var connectBtn = btn(panel, 'ui-btn-big ui-btn-primary ui-btn-wide', 'CONNECT', doJoin);
    var busy = false;

    function setStatus(msg, kind) {
      status.textContent = msg || '';
      status.className = 'ui-status' + (kind ? ' ui-status-' + kind : '');
    }
    function doJoin() {
      if (busy) return;
      if (!requireName(nameInput)) return;
      var code = codeInput.value.toUpperCase().replace(/[^A-Z0-9]/g, '');
      if (code.length !== 6) {
        codeInput.classList.remove('ui-shake');
        void codeInput.offsetWidth;
        codeInput.classList.add('ui-shake');
        codeInput.focus();
        setStatus('Room codes are 6 characters.', 'warn');
        return;
      }
      if (!AL.game || !AL.game.joinLobby) { setStatus('Multiplayer is unavailable right now.', 'err'); return; }
      busy = true;
      connectBtn.disabled = true;
      setStatus('Connecting to room ' + code + '…', 'busy');
      AL.game.joinLobby(code, U.deep(safeProfile())).then(function () {
        setStatus('Connected!', 'good');
        sfx('join');
        if (current === 'join') showScreen('lobby');
      }, function (err) {
        busy = false;
        connectBtn.disabled = false;
        setStatus((err && err.message) ? err.message : 'Could not reach that room. Check the code and try again.', 'err');
      });
    }
    codeInput.addEventListener('keydown', function (ev) { if (ev.key === 'Enter') doJoin(); });
    nameInput.addEventListener('keydown', function (ev) { if (ev.key === 'Enter') codeInput.focus(); });
    setTimeout(function () { try { (profile.name ? codeInput : nameInput).focus(); } catch (e) {} }, 260);
  }

  /* ============================================================
     Screen: HOST
     ============================================================ */
  function buildHost(scr) {
    var panel = el('div', 'ui-panel ui-form-panel', scr);
    backRow(panel, 'menu');
    txt(panel, 'h2', 'ui-panel-title', 'HOST GAME');
    txt(panel, 'p', 'ui-dim', 'Create a room and share the code. Friends join from anywhere — no accounts, no servers.');

    var nameInput = nameField(panel, true);
    var status = txt(panel, 'div', 'ui-status', '');
    var createBtn = btn(panel, 'ui-btn-big ui-btn-primary ui-btn-wide', 'CREATE ROOM', doHost);
    var busy = false;

    function setStatus(msg, kind) {
      status.textContent = msg || '';
      status.className = 'ui-status' + (kind ? ' ui-status-' + kind : '');
    }
    function doHost() {
      if (busy) return;
      if (!requireName(nameInput)) return;
      if (!AL.game || !AL.game.hostLobby) { setStatus('Multiplayer is unavailable right now.', 'err'); return; }
      busy = true;
      createBtn.disabled = true;
      setStatus('Creating your room…', 'busy');
      AL.game.hostLobby(U.deep(safeProfile())).then(function () {
        sfx('join');
        if (current === 'host') showScreen('lobby');
      }, function (err) {
        busy = false;
        createBtn.disabled = false;
        setStatus((err && err.message) ? err.message : 'Could not create a room. Check your connection.', 'err');
      });
    }
    nameInput.addEventListener('keydown', function (ev) { if (ev.key === 'Enter') doHost(); });
  }

  /* ============================================================
     Screen: FREEPLAY
     ============================================================ */
  function buildFreeplay(scr) {
    var panel = el('div', 'ui-panel ui-wide-panel', scr);
    backRow(panel, 'menu');
    txt(panel, 'h2', 'ui-panel-title', 'FREEPLAY');
    txt(panel, 'p', 'ui-dim', 'Practice offline with bots. Pick a map, a mode, and the role you want to try.');

    var sel = { mode: 'classic', mapId: null, bots: 7, role: null };

    // Mode cards
    txt(panel, 'h3', 'ui-section-title', 'MODE');
    var modeRow = el('div', 'ui-card-row', panel);
    // Map cards
    txt(panel, 'h3', 'ui-section-title', 'MAP');
    var mapRow = el('div', 'ui-card-row', panel);
    // Bots + role
    var optsGrid = el('div', 'ui-free-opts', panel);
    var botsBox = el('div', 'ui-free-box', optsGrid);
    txt(botsBox, 'h3', 'ui-section-title', 'BOTS');
    var botStep = stepper(botsBox, '', 1, 14, sel.bots, function (v) { sel.bots = v; });
    var roleBox = el('div', 'ui-free-box', optsGrid);
    txt(roleBox, 'h3', 'ui-section-title', 'PRACTICE ROLE');
    var roleRow = el('div', 'ui-role-row', roleBox);

    function roleList(mode) {
      var base = [{ id: null, name: 'Random', color: '#8b96c9' }];
      var defs = (AL.roles && AL.roles.DEFS) || {};
      var ids;
      if (mode === 'classic') {
        ids = ['crewmate', 'sheriff', 'engineer', 'scientist', 'medic', 'tracker',
               'impostor', 'shapeshifter', 'phantom', 'jester'];
      } else {
        ids = ['crewmate', 'impostor'];
      }
      ids.forEach(function (id) {
        if (defs[id]) base.push({ id: id, name: defs[id].name || id, color: defs[id].color || '#8b96c9' });
      });
      return base;
    }
    function renderRoles() {
      roleRow.innerHTML = '';
      if (sel.mode === 'bombtag' || sel.mode === 'sprint') {
        sel.role = null;
        txt(roleRow, 'div', 'ui-empty', 'This mode has no roles — everyone plays for themselves.');
        return;
      }
      roleList(sel.mode).forEach(function (r) {
        var b = btn(roleRow, 'ui-chip' + (sel.role === r.id ? ' ui-chip-on' : ''), r.name, function () {
          sel.role = r.id;
          renderRoles();
        });
        b.style.setProperty('--chip', r.color);
      });
    }
    function renderMaps() {
      mapRow.innerHTML = '';
      var maps = mapsForMode(sel.mode);
      if (!maps.length) {
        txt(mapRow, 'div', 'ui-empty', 'No maps available for this mode yet.');
        sel.mapId = null;
        return;
      }
      var found = maps.some(function (m) { return m.id === sel.mapId; });
      if (!found) sel.mapId = (sel.mode === 'bombtag' && maps.some(function (m) { return m.id === 'meteor'; })) ? 'meteor' : maps[0].id;
      maps.forEach(function (m) {
        var card = el('button', 'ui-card ui-map-card' + (sel.mapId === m.id ? ' ui-card-on' : ''), mapRow);
        card.type = 'button';
        mapThumb(card, m.id, 168, 106);
        txt(card, 'div', 'ui-card-name', m.name || m.id);
        txt(card, 'div', 'ui-card-tag', m.sizeLabel || '');
        card.addEventListener('click', function () { sel.mapId = m.id; renderMaps(); });
      });
    }
    function renderModes() {
      modeRow.innerHTML = '';
      MODES.forEach(function (m) {
        var card = el('button', 'ui-card ui-mode-card' + (sel.mode === m.id ? ' ui-card-on' : ''), modeRow);
        card.type = 'button';
        txt(card, 'div', 'ui-card-name', m.name);
        txt(card, 'div', 'ui-card-tag', m.tag);
        txt(card, 'div', 'ui-card-desc', m.desc);
        card.addEventListener('click', function () {
          sel.mode = m.id;
          renderModes();
          renderMaps();
          renderRoles();
        });
      });
    }
    renderModes();
    renderMaps();
    renderRoles();

    var launchRow = el('div', 'ui-launch-row', panel);
    btn(launchRow, 'ui-btn-big ui-btn-good ui-btn-wide', 'LAUNCH', function () {
      if (!sel.mapId) { toast('Pick a map first!', 'warn'); return; }
      if (!AL.game || !AL.game.startFreeplay) { toast('Game module missing.', 'warn'); return; }
      if (!(profile.name || '').trim()) { profile.name = 'Bean'; saveProfile(); }
      try {
        AL.game.startFreeplay(U.deep(safeProfile()), {
          mapId: sel.mapId, mode: sel.mode, botCount: botStep.get(), myRole: sel.role,
        });
        sfx('start_whoosh');
      } catch (e) {
        console.warn('[ui] startFreeplay failed', e);
        toast('Could not start freeplay.', 'warn');
      }
    });
  }

  /* ============================================================
     Screen: WARDROBE
     ============================================================ */
  function buildWardrobe(scr) {
    var panel = el('div', 'ui-panel ui-wide-panel ui-wardrobe', scr);
    backRow(panel, 'menu');
    txt(panel, 'h2', 'ui-panel-title', 'WARDROBE');

    var grid = el('div', 'ui-wardrobe-grid', panel);

    // ---- preview column
    var prevCol = el('div', 'ui-wardrobe-preview', grid);
    var prevBox = el('div', 'ui-preview-box', prevCol);
    var prev = makeCanvas(prevBox, 'ui-preview-canvas', 220, 250);
    nameField(prevCol, false);

    tickOnScreen(function (dt, t) {
      var ctx = prev.ctx;
      ctx.clearRect(0, 0, prev.w, prev.h);
      // pedestal glow
      ctx.save();
      ctx.globalAlpha = 0.5;
      var g = ctx.createRadialGradient(prev.w / 2, prev.h - 26, 4, prev.w / 2, prev.h - 26, 70);
      g.addColorStop(0, 'rgba(53,224,255,0.30)');
      g.addColorStop(1, 'rgba(53,224,255,0)');
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.ellipse(prev.w / 2, prev.h - 26, 70, 16, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
      drawBeanTo(ctx, {
        x: prev.w / 2, y: prev.h - 34,
        color: profile.color, hat: profile.hat, skin: profile.skin,
        pet: profile.pet !== 'none' ? profile.pet : null,
        petX: prev.w / 2 - 66, petY: prev.h - 26,
        dir: 1, moving: false, dead: false, t: t, scale: 2.0,
      });
    });

    // ---- customize column
    var custCol = el('div', 'ui-wardrobe-cust', grid);
    var walletBox = el('section', 'ui-wardrobe-wallet', custCol);
    txt(walletBox, 'h3', 'ui-section-title', 'OUTCAST · SOLANA');
    var walletStatus = txt(walletBox, 'p', 'ui-wallet-status', 'Loading wallet integration…');
    walletStatus.setAttribute('role', 'status');
    walletStatus.setAttribute('aria-live', 'polite');
    var walletActions = el('div', 'ui-wallet-actions', walletBox);
    var connectButton = btn(walletActions, 'ui-btn-small', 'CONNECT WALLET', function () {
      if (AL.wardrobe) AL.wardrobe.connect();
    });
    var checkButton = btn(walletActions, 'ui-btn-small', 'CHECK HOLDINGS', function () {
      if (AL.wardrobe) AL.wardrobe.refresh();
    });
    txt(walletBox, 'p', 'ui-wallet-note', 'Shared requirements for every player. Hold tokens; no purchase or deposit required.');
    function renderAccess() {
      var access = AL.wardrobe && AL.wardrobe.state;
      walletStatus.textContent = access ? access.message : 'Wallet integration unavailable. Free items remain available.';
      var busy = !access || access.status === 'connecting' || access.status === 'checking';
      connectButton.disabled = busy;
      checkButton.disabled = busy;
      renderGallery();
    }
    busOnScreen('wardrobe:access', renderAccess);

    // Colors
    txt(custCol, 'h3', 'ui-section-title', 'COLOR');
    var swatchGrid = el('div', 'ui-swatch-grid', custCol);
    function takenColors() {
      var taken = {};
      try {
        var st = AL.game && AL.game.state;
        if (st && st.phase === 'lobby' && st.players) {
          st.players.forEach(function (p) {
            if (p.id !== st.meId) taken[p.color] = true;
          });
        }
      } catch (e) {}
      return taken;
    }
    function renderSwatches() {
      swatchGrid.innerHTML = '';
      var colors = (AL.chars && AL.chars.COLORS) || [];
      var taken = takenColors();
      for (var i = 0; i < 18; i++) {
        (function (idx) {
          var c = colors[idx] || { body: '#8b96c9', shade: '#555', name: 'Color ' + idx };
          var sw = el('button', 'ui-swatch' + (profile.color === idx ? ' ui-swatch-on' : ''), swatchGrid);
          sw.type = 'button';
          sw.title = c.name || ('Color ' + idx);
          sw.setAttribute('aria-label', c.name || ('Color ' + idx));
          sw.style.background = c.body;
          sw.style.borderColor = c.shade || '#222';
          if (taken[idx]) { sw.disabled = true; sw.classList.add('ui-swatch-taken'); }
          sw.addEventListener('click', function () {
            profile.color = idx;
            saveProfile();
            renderSwatches();
            renderGallery();
          });
        })(i);
      }
    }

    // Tabs: hats / pets / skins
    var tabs = el('div', 'ui-tabs', custCol);
    var galleryWrap = el('div', 'ui-gallery', custCol);
    var activeTab = 'hats';
    var TABS = [
      { id: 'hats', label: 'HATS' },
      { id: 'pets', label: 'PETS' },
      { id: 'skins', label: 'SKINS' },
    ];
    function renderTabs() {
      tabs.innerHTML = '';
      TABS.forEach(function (t) {
        var b = btn(tabs, 'ui-tab' + (activeTab === t.id ? ' ui-tab-on' : ''), t.label, function () {
          activeTab = t.id;
          renderTabs();
          renderGallery();
        });
        b.classList.remove('ui-btn');
        b.classList.add('ui-tab');
      });
    }
    function itemsFor(tab) {
      var ch = AL.chars || {};
      if (tab === 'hats') return ch.HATS || [{ id: 'none', name: 'None' }];
      if (tab === 'pets') return ch.PETS || [{ id: 'none', name: 'None' }];
      return ch.SKINS || [{ id: 'none', name: 'None' }];
    }
    function currentFor(tab) {
      return tab === 'hats' ? profile.hat : (tab === 'pets' ? profile.pet : profile.skin);
    }
    function setFor(tab, id) {
      if (!AL.wardrobe || !AL.wardrobe.unlocked(tab, id)) return;
      if (tab === 'hats') profile.hat = id;
      else if (tab === 'pets') profile.pet = id;
      else profile.skin = id;
      saveProfile();
    }
    function drawItemPreview(ctx, tab, item, w, h) {
      ctx.clearRect(0, 0, w, h);
      if (tab === 'pets') {
        if (item.id === 'none') return;
        try {
          if (AL.chars && AL.chars.drawPet) {
            AL.chars.drawPet(ctx, { x: w / 2, y: h / 2 + h * 0.22, kind: item.id, color: profile.color, dir: 1, moving: false, t: 0 });
            return;
          }
        } catch (e) {}
        return;
      }
      drawPortraitTo(ctx, {
        x: w / 2, y: h / 2 + h * 0.06, size: w * 0.8,
        color: profile.color,
        hat: tab === 'hats' ? item.id : 'none',
        skin: tab === 'skins' ? item.id : profile.skin,
        dead: false, t: 0, dir: 1,
      });
    }
    function renderGallery() {
      galleryWrap.innerHTML = '';
      var items = itemsFor(activeTab).slice().sort(function (a, b) {
        var access = AL.wardrobe;
        var aMinimum = access ? access.minimum(activeTab, a.id) : (a.id === 'none' ? 0 : Infinity);
        var bMinimum = access ? access.minimum(activeTab, b.id) : (b.id === 'none' ? 0 : Infinity);
        return aMinimum - bMinimum;
      });
      var cur = currentFor(activeTab);
      items.forEach(function (item) {
        var card = el('button', 'ui-card ui-item-card' + (cur === item.id ? ' ui-card-on' : ''), galleryWrap);
        card.type = 'button';
        var c = makeCanvas(card, 'ui-item-canvas', 68, 68);
        drawItemPreview(c.ctx, activeTab, item, 68, 68);
        txt(card, 'div', 'ui-card-name ui-item-name', item.name || item.id);
        var minimum = AL.wardrobe ? AL.wardrobe.minimum(activeTab, item.id) : (item.id === 'none' ? 0 : Infinity);
        var available = AL.wardrobe ? AL.wardrobe.unlocked(activeTab, item.id) : item.id === 'none';
        txt(card, 'div', 'ui-item-access' + (minimum === 0 ? ' ui-item-free' : ''), minimum === 0 ? 'FREE' : 'HOLD ' + (minimum / 1000) + 'k OUTCAST');
        card.setAttribute('aria-label', (item.name || item.id) + (minimum === 0 ? ', free' : ', hold ' + minimum.toLocaleString('en-US') + ' OUTCAST') + (available ? '' : ', locked'));
        card.setAttribute('aria-disabled', available ? 'false' : 'true');
        if (!available) card.classList.add('ui-item-locked');
        var category = activeTab;
        card.addEventListener('click', async function () {
          if (!AL.wardrobe || !AL.wardrobe.unlocked(category, item.id)) { walletStatus.textContent = 'Connect your wallet and hold the required OUTCAST to use this item.'; return; }
          card.disabled = true;
          var approved = await AL.wardrobe.equip(category, item.id, profile);
          card.disabled = false;
          if (!approved) { renderAccess(); return; }
          setFor(category, item.id);
          renderGallery();
          sfx('sparkle', { vol: 0.4 });
        });
      });
      if (!items.length) txt(galleryWrap, 'div', 'ui-empty', 'Nothing here yet.');
    }
    renderSwatches();
    renderTabs();
    renderGallery();
    renderAccess();
    if (AL.wardrobe && AL.wardrobe.state.status === 'idle') AL.wardrobe.refresh();
  }

  /* ============================================================
     Screen: LOBBY
     ============================================================ */
  function getLobby() {
    if (lastLobby) return lastLobby;
    var st = (AL.game && AL.game.state) || {};
    var hostId = null;
    (st.players || []).forEach(function (p) { if (p.isHost) hostId = p.id; });
    return {
      players: st.players || [],
      settings: st.settings || {},
      mode: st.mode || 'classic',
      mapId: st.mapId || 'vessel',
      code: st.code || null,
      hostId: hostId,
      meId: st.meId || null,
    };
  }
  function amIHost() {
    try {
      var st = AL.game && AL.game.state;
      if (st && typeof st.isHost === 'boolean') return st.isHost;
      var lb = getLobby();
      return !!(lb.meId && lb.hostId && lb.meId === lb.hostId);
    } catch (e) { return false; }
  }

  function buildLobby(scr) {
    var lb = getLobby();
    var wrap = el('div', 'ui-lobby', scr);

    // ---- header
    var top = el('header', 'ui-lobby-top', wrap);
    txt(top, 'h2', 'ui-lobby-title', 'LOBBY');
    var codeChip = null, codeVal = null;
    if (lb.code) {
      codeChip = el('button', 'ui-copy', top);
      codeChip.type = 'button';
      codeChip.title = 'Copy room code';
      txt(codeChip, 'span', 'ui-copy-label', 'ROOM CODE');
      codeVal = txt(codeChip, 'span', 'ui-copy-code', lb.code);
      var hint = txt(codeChip, 'span', 'ui-copy-hint', 'click to copy');
      codeChip.addEventListener('click', function () {
        copyText(codeVal.textContent, function (ok) {
          hint.textContent = ok ? 'copied!' : 'copy failed';
          codeChip.classList.add('ui-copy-done');
          setTimeout(function () {
            hint.textContent = 'click to copy';
            codeChip.classList.remove('ui-copy-done');
          }, 1600);
        });
      });
    }
    el('div', 'ui-flex-spacer', top);
    var leaveB = btn(top, 'ui-btn-danger ui-btn-small', 'LEAVE', function () {
      confirmDialog('Leave the lobby?', 'You will be disconnected from this room.', 'LEAVE', function () {
        try { if (AL.game && AL.game.leave) AL.game.leave(); } catch (e) {}
        sfx('leave');
        showScreen('menu');
      });
    });
    leaveB.dataset.sfx = 'back';

    // ---- main grid
    var grid = el('div', 'ui-lobby-grid', wrap);
    var left = el('div', 'ui-lobby-left', grid);
    var right = el('div', 'ui-lobby-right', grid);

    // Players panel
    var pPanel = el('div', 'ui-panel ui-lobby-panel', left);
    var pTitle = txt(pPanel, 'h3', 'ui-panel-title ui-panel-title-sm', 'PLAYERS');
    var pList = el('div', 'ui-player-list', pPanel);

    // Chat panel
    var cPanel = el('div', 'ui-panel ui-lobby-panel ui-chat-panel', left);
    txt(cPanel, 'h3', 'ui-panel-title ui-panel-title-sm', 'CHAT');
    var chatLog = el('div', 'ui-chat-log', cPanel);
    var chatRow = el('div', 'ui-chat-row', cPanel);
    var chatInput = el('input', 'ui-input ui-chat-input', chatRow);
    chatInput.type = 'text';
    chatInput.maxLength = 120;
    chatInput.placeholder = 'Say something…';
    chatInput.autocomplete = 'off';
    var sendB = btn(chatRow, 'ui-btn-primary ui-btn-small', 'SEND', sendChat);
    function sendChat() {
      var t = chatInput.value.trim();
      if (!t) return;
      chatInput.value = '';
      try { if (AL.game && AL.game.sendChat) AL.game.sendChat(t); } catch (e) {}
    }
    chatInput.addEventListener('keydown', function (ev) {
      if (ev.key === 'Enter') { ev.preventDefault(); sendChat(); }
      ev.stopPropagation();
    });

    // Mode panel
    var mPanel = el('div', 'ui-panel ui-lobby-panel', right);
    txt(mPanel, 'h3', 'ui-panel-title ui-panel-title-sm', 'GAME MODE');
    var modeRow = el('div', 'ui-card-row ui-lobby-modes', mPanel);

    // Map panel
    var mapPanel = el('div', 'ui-panel ui-lobby-panel', right);
    txt(mapPanel, 'h3', 'ui-panel-title ui-panel-title-sm', 'MAP');
    var mapRow = el('div', 'ui-card-row ui-lobby-maps', mapPanel);

    // Settings panel
    var sPanel = el('div', 'ui-panel ui-lobby-panel', right);
    var sHead = el('div', 'ui-settings-head', sPanel);
    txt(sHead, 'h3', 'ui-panel-title ui-panel-title-sm', 'SETTINGS');
    var sNote = txt(sHead, 'span', 'ui-settings-note', '');
    var sWrap = el('div', 'ui-settings', sPanel);

    // Bottom bar
    var bottom = el('footer', 'ui-lobby-bottom', wrap);
    var countLabel = txt(bottom, 'span', 'ui-lobby-count', '');
    el('div', 'ui-flex-spacer', bottom);
    var addBotB = btn(bottom, 'ui-btn-small', '+ ADD BOT', function () {
      try { if (AL.game && AL.game.addBot) AL.game.addBot(); } catch (e) {}
    });
    var startB = btn(bottom, 'ui-btn-big ui-btn-good ui-start-btn', 'START', tryStart);
    var startHint = txt(bottom, 'span', 'ui-start-hint', '');

    function tryStart() {
      var l = getLobby();
      var need = minPlayersFor(l.mode);
      var have = (l.players || []).length;
      if (have < need) {
        startB.classList.remove('ui-shake');
        void startB.offsetWidth;
        startB.classList.add('ui-shake');
        toast('Need at least ' + need + ' players — add bots or invite friends!', 'warn');
        return;
      }
      try { if (AL.game && AL.game.startGame) AL.game.startGame(); } catch (e) {}
    }

    // ---------- settings controls ----------
    var settingCtrls = {};
    function fmtNum(entry, v) {
      if (v == null || isNaN(v)) return '–';
      var s;
      if (entry.type === 'float') {
        s = (Math.round(v * 100) / 100).toString();
      } else s = String(Math.round(v));
      if (/(Cd|Time)$/.test(entry.key) || /time|cooldown/i.test(entry.label || '')) s += 's';
      return s;
    }
    function buildSettingsPanel() {
      sWrap.innerHTML = '';
      settingCtrls = {};
      var schema = [];
      try { schema = (AL.game && AL.game.settingsSchema) ? (AL.game.settingsSchema() || []) : []; } catch (e) { schema = []; }
      if (!schema.length) {
        txt(sWrap, 'div', 'ui-empty', 'Settings will appear when the game module loads.');
        return;
      }
      var groupEls = {};
      schema.forEach(function (entry) {
        if (!entry || !entry.key) return;
        var gName = entry.group || 'General';
        if (!groupEls[gName]) {
          var gBox = el('div', 'ui-set-group', sWrap);
          txt(gBox, 'h4', 'ui-set-group-title', gName.toUpperCase());
          groupEls[gName] = gBox;
        }
        var row = el('div', 'ui-set-row', groupEls[gName]);
        txt(row, 'span', 'ui-set-label', entry.label || entry.key);
        var ctrl = { entry: entry, row: row };
        if (entry.type === 'bool') {
          var tog = el('label', 'ui-toggle', row);
          var cb = el('input', '', tog);
          cb.type = 'checkbox';
          el('span', 'ui-toggle-knob', tog);
          cb.addEventListener('change', function () {
            if (!amIHost()) return;
            try { AL.game.setSetting(entry.key, cb.checked); } catch (e) {}
          });
          ctrl.input = cb;
        } else if (entry.type === 'enum') {
          var selEl = el('select', 'ui-select', row);
          (entry.options || []).forEach(function (o) {
            var opt = el('option', '', selEl);
            if (o && typeof o === 'object') { opt.value = String(o.value); opt.textContent = String(o.label != null ? o.label : o.value); }
            else { opt.value = String(o); opt.textContent = String(o); }
          });
          selEl.addEventListener('change', function () {
            if (!amIHost()) return;
            try { AL.game.setSetting(entry.key, selEl.value); } catch (e) {}
          });
          ctrl.input = selEl;
        } else {
          var box = el('div', 'ui-set-range', row);
          var range = el('input', 'ui-range', box);
          range.type = 'range';
          range.min = entry.min != null ? entry.min : 0;
          range.max = entry.max != null ? entry.max : 10;
          range.step = entry.step != null ? entry.step : (entry.type === 'float' ? 0.25 : 1);
          var valEl = txt(box, 'span', 'ui-set-val', '');
          range.addEventListener('input', function () {
            var v = parseFloat(range.value);
            valEl.textContent = fmtNum(entry, v);
            if (!amIHost()) return;
            try { AL.game.setSetting(entry.key, entry.type === 'int' ? Math.round(v) : v); } catch (e) {}
          });
          ctrl.input = range;
          ctrl.valEl = valEl;
        }
        settingCtrls[entry.key] = ctrl;
      });
    }
    function refreshSettings(l) {
      var host = amIHost();
      sNote.textContent = host ? '' : 'host controls these — live';
      Object.keys(settingCtrls).forEach(function (key) {
        var c = settingCtrls[key], entry = c.entry;
        // mode visibility
        var visible = true;
        if (entry.modes && entry.modes.length && entry.modes.indexOf(l.mode) < 0) visible = false;
        c.row.style.display = visible ? '' : 'none';
        if (!visible) return;
        var v = getPath(l.settings, key);
        var focused = document.activeElement === c.input;
        if (entry.type === 'bool') {
          if (!focused && v != null) c.input.checked = !!v;
        } else if (entry.type === 'enum') {
          if (!focused && v != null) c.input.value = String(v);
        } else {
          if (!focused && v != null && !isNaN(parseFloat(v))) {
            c.input.value = v;
            if (c.valEl) c.valEl.textContent = fmtNum(entry, parseFloat(v));
          } else if (c.valEl && v != null) {
            c.valEl.textContent = fmtNum(entry, parseFloat(v));
          }
        }
        c.input.disabled = !host;
      });
    }

    // ---------- renderers ----------
    function renderPlayers(l) {
      pList.innerHTML = '';
      var max = (AL.C && AL.C.MAX_PLAYERS) || 15;
      pTitle.textContent = 'PLAYERS  ' + (l.players || []).length + ' / ' + max;
      (l.players || []).forEach(function (p) {
        var row = el('div', 'ui-player-row' + (p.disconnected ? ' ui-player-dc' : ''), pList);
        playerPortrait(row, p, 42);
        var nameWrap = el('div', 'ui-player-name-wrap', row);
        var nm = txt(nameWrap, 'span', 'ui-player-name', p.name || '???');
        nm.style.color = colorOf(p.color);
        if (p.id === l.meId) txt(nameWrap, 'span', 'ui-player-you', '(you)');
        if (p.isHost) {
          var star = txt(row, 'span', 'ui-host-star', '★');
          star.title = 'Host';
        }
        if (p.isBot) txt(row, 'span', 'ui-bot-chip', 'BOT');
        if (amIHost() && p.id !== l.meId) {
          var kick = btn(row, 'ui-btn-ghost ui-kick-btn', '×', function () {
            if (p.isBot) {
              try { if (AL.game && AL.game.removeBot) AL.game.removeBot(p.id); } catch (e) {}
            } else {
              confirmDialog('Kick ' + (p.name || 'player') + '?', 'They can rejoin with the room code.', 'KICK', function () {
                try { if (AL.net && AL.net.kick) AL.net.kick(p.id); } catch (e) {}
              });
            }
          });
          kick.title = p.isBot ? 'Remove bot' : 'Kick player';
        }
      });
      if (!(l.players || []).length) txt(pList, 'div', 'ui-empty', 'Waiting for players…');
    }
    function renderModes(l) {
      modeRow.innerHTML = '';
      var host = amIHost();
      MODES.forEach(function (m) {
        var card = el('button', 'ui-card ui-mode-card' + (l.mode === m.id ? ' ui-card-on' : ''), modeRow);
        card.type = 'button';
        card.disabled = !host;
        txt(card, 'div', 'ui-card-name', m.name);
        txt(card, 'div', 'ui-card-tag', m.tag);
        txt(card, 'div', 'ui-card-desc', m.desc);
        card.addEventListener('click', function () {
          if (!host) return;
          try { if (AL.game && AL.game.setMode) AL.game.setMode(m.id); } catch (e) {}
        });
      });
    }
    function renderMaps(l) {
      mapRow.innerHTML = '';
      var host = amIHost();
      var maps = mapsForMode(l.mode);
      if (!maps.length) { txt(mapRow, 'div', 'ui-empty', 'No maps for this mode.'); return; }
      maps.forEach(function (m) {
        var card = el('button', 'ui-card ui-map-card' + (l.mapId === m.id ? ' ui-card-on' : ''), mapRow);
        card.type = 'button';
        card.disabled = !host;
        mapThumb(card, m.id, 148, 92);
        txt(card, 'div', 'ui-card-name', m.name || m.id);
        txt(card, 'div', 'ui-card-tag', m.sizeLabel || '');
        card.addEventListener('click', function () {
          if (!host) return;
          try { if (AL.game && AL.game.setMap) AL.game.setMap(m.id); } catch (e) {}
        });
      });
    }
    function renderBottom(l) {
      var host = amIHost();
      var need = minPlayersFor(l.mode);
      var have = (l.players || []).length;
      countLabel.textContent = have + ' player' + (have === 1 ? '' : 's') + ' in room';
      addBotB.style.display = host ? '' : 'none';
      startB.style.display = host ? '' : 'none';
      startHint.textContent = host
        ? (have < need ? 'need ' + need + '+ to start' : '')
        : 'waiting for the host to start…';
      startB.classList.toggle('ui-btn-dim', have < need);
      var max = (AL.C && AL.C.MAX_PLAYERS) || 15;
      addBotB.disabled = have >= max;
    }
    var lastModeSeen = null;
    function updateAll() {
      var l = getLobby();
      if (codeVal && l.code) codeVal.textContent = l.code;
      renderPlayers(l);
      if (l.mode !== lastModeSeen) {
        lastModeSeen = l.mode;
        renderModes(l);
        renderMaps(l);
      } else {
        // cheap selected-state sync for maps (host may have changed map only)
        renderMaps(l);
        renderModes(l);
      }
      refreshSettings(l);
      renderBottom(l);
    }

    function appendChat(m) {
      if (!m) return;
      var row = el('div', 'ui-chat-line' + (m.ghost ? ' ui-chat-ghost' : ''));
      var nm = txt(row, 'span', 'ui-chat-name', (m.name || '???') + ':');
      nm.style.color = colorOf(m.color);
      txt(row, 'span', 'ui-chat-text', ' ' + (m.text || ''));
      chatLog.appendChild(row);
      while (chatLog.children.length > 80) chatLog.removeChild(chatLog.firstChild);
      chatLog.scrollTop = chatLog.scrollHeight;
    }

    lobbyRefs = { appendChat: appendChat, updateAll: updateAll };
    buildSettingsPanel();
    updateAll();
    txt(chatLog, 'div', 'ui-chat-line ui-chat-sys', 'Welcome to the lobby. Be nice!');

    busOnScreen('game:lobby', function () { updateAll(); });
    busOnScreen('game:chat', function (m) { if (m && (m.lobby || m.lobby === undefined)) appendChat(m); });
  }

  /* ============================================================
     Screen: HOW TO PLAY
     ============================================================ */
  function buildHowto(scr) {
    var panel = el('div', 'ui-panel ui-wide-panel ui-howto', scr);
    backRow(panel, 'menu');
    txt(panel, 'h2', 'ui-panel-title', 'HOW TO PLAY');

    var pageWrap = el('div', 'ui-howto-page', panel);
    var nav = el('div', 'ui-howto-nav', panel);
    var prevB = btn(nav, 'ui-btn-small', '← PREV', function () { go(page - 1); });
    var dots = el('div', 'ui-howto-dots', nav);
    var nextB = btn(nav, 'ui-btn-small ui-btn-primary', 'NEXT →', function () { go(page + 1); });

    function beansIllustration(parent, specs) {
      var c = makeCanvas(parent, 'ui-howto-illus', 300, 100);
      var t = performance.now();
      specs.forEach(function (s, i) {
        drawPortraitTo(c.ctx, {
          x: 60 + i * 90, y: 62, size: 66,
          color: s.color, hat: s.hat || 'none', skin: 'none',
          dead: !!s.dead, t: t + i * 400, dir: i % 2 ? -1 : 1,
        });
      });
      return c;
    }
    function bullet(parent, strong, rest) {
      var li = el('li', 'ui-howto-li', parent);
      txt(li, 'strong', '', strong + ' ');
      txt(li, 'span', '', rest);
    }

    var pages = [
      { title: 'THE CREW', build: function (box) {
          beansIllustration(box, [{ color: 4 }, { color: 1 }, { color: 9 }]);
          var ul = el('ul', 'ui-howto-list', box);
          bullet(ul, 'Finish tasks.', 'Walk to glowing markers and press USE to open a minigame. Fill the task bar to win.');
          bullet(ul, 'Watch your back.', 'Impostors look exactly like you. Stick together — or don’t, and gather alibis.');
          bullet(ul, 'Report bodies.', 'Found a corpse? Press REPORT to call everyone to a meeting.');
          bullet(ul, 'Vote smart.', 'Discuss, accuse, defend. Majority vote ejects a player into space. Ties skip.');
          bullet(ul, 'Death is not the end.', 'Ghosts keep finishing tasks and can chat with other ghosts.');
        } },
      { title: 'THE IMPOSTOR', build: function (box) {
          beansIllustration(box, [{ color: 0 }, { color: 6, dead: true }]);
          var ul = el('ul', 'ui-howto-list', box);
          bullet(ul, 'Blend in.', 'Pretend to do tasks. Move like a crewmate. Lie with confidence.');
          bullet(ul, 'Kill quietly.', 'Get close and press KILL. Mind the cooldown — and the witnesses.');
          bullet(ul, 'Use vents.', 'Press VENT on a grate to travel instantly between linked vents.');
          bullet(ul, 'Sabotage.', 'Cut lights, drain oxygen, melt the reactor, jam comms, slam doors. Divide and conquer.');
          bullet(ul, 'Win condition.', 'Even the numbers: when impostors match the remaining crew, the ship is yours.');
        } },
      { title: 'ROLES', build: function (box) {
          txt(box, 'p', 'ui-dim', 'Roles are assigned at the start of Classic games based on lobby settings.');
          var list = el('div', 'ui-role-list', box);
          var defs = (AL.roles && AL.roles.DEFS) || {};
          var order = ['crewmate', 'sheriff', 'engineer', 'scientist', 'medic', 'tracker',
                       'impostor', 'shapeshifter', 'phantom', 'jester'];
          order.forEach(function (id) {
            var d = defs[id];
            if (!d) return;
            var row = el('div', 'ui-role-item', list);
            var dot = el('span', 'ui-role-dot', row);
            dot.style.background = d.color || '#8b96c9';
            var body = el('div', 'ui-role-body', row);
            var head = el('div', 'ui-role-head', body);
            txt(head, 'span', 'ui-role-name', d.name || id);
            var team = txt(head, 'span', 'ui-role-team ui-role-team-' + (d.team || 'crew'),
              d.team === 'impostor' ? 'IMPOSTOR' : (d.team === 'neutral' ? 'NEUTRAL' : 'CREW'));
            team.setAttribute('aria-hidden', 'false');
            txt(body, 'div', 'ui-role-desc', d.desc ||
              (id === 'crewmate' ? 'Finish your tasks and find the impostors.' : 'Kill the crew. Sabotage. Deceive.'));
          });
          if (!Object.keys(defs).length) txt(list, 'div', 'ui-empty', 'Role list unavailable.');
        } },
      { title: 'GAME MODES', build: function (box) {
          var list = el('div', 'ui-role-list', box);
          MODES.forEach(function (m) {
            var row = el('div', 'ui-role-item', list);
            var body = el('div', 'ui-role-body', row);
            var head = el('div', 'ui-role-head', body);
            txt(head, 'span', 'ui-role-name', m.name);
            txt(head, 'span', 'ui-role-team', m.tag.toUpperCase());
            txt(body, 'div', 'ui-role-desc', m.desc);
          });
        } },
      { title: 'CONTROLS', build: function (box) {
          txt(box, 'h3', 'ui-section-title', 'KEYBOARD');
          var kt = el('div', 'ui-keys', box);
          [['WASD / Arrows', 'Move'], ['E / Space', 'Use / interact'], ['R', 'Report body'],
           ['Q', 'Kill (impostor / sheriff)'], ['F', 'Vent / ability'], ['Tab / M', 'Map'],
           ['Enter', 'Chat'], ['Esc', 'Close panel']].forEach(function (k) {
            var row = el('div', 'ui-key-row', kt);
            txt(row, 'kbd', 'ui-kbd', k[0]);
            txt(row, 'span', 'ui-key-desc', k[1]);
          });
          txt(box, 'h3', 'ui-section-title', 'TOUCH');
          var ul = el('ul', 'ui-howto-list', box);
          bullet(ul, 'Move:', 'drag anywhere on the left half of the screen — a virtual joystick appears.');
          bullet(ul, 'Actions:', 'big buttons in the bottom-right corner: USE, REPORT, KILL, VENT, and abilities.');
          bullet(ul, 'Map & chat:', 'tap the icons at the top of the screen.');
        } },
    ];

    var page = 0;
    function go(n) {
      page = Math.max(0, Math.min(pages.length - 1, n));
      pageWrap.innerHTML = '';
      txt(pageWrap, 'h3', 'ui-howto-title', pages[page].title);
      var box = el('div', 'ui-howto-body', pageWrap);
      try { pages[page].build(box); } catch (e) { txt(box, 'div', 'ui-empty', 'Page failed to load.'); }
      dots.innerHTML = '';
      for (var i = 0; i < pages.length; i++) {
        (function (idx) {
          var d = el('button', 'ui-dot' + (idx === page ? ' ui-dot-on' : ''), dots);
          d.type = 'button';
          d.setAttribute('aria-label', 'Page ' + (idx + 1));
          d.addEventListener('click', function () { go(idx); });
        })(i);
      }
      prevB.disabled = page === 0;
      nextB.textContent = page === pages.length - 1 ? 'DONE ✓' : 'NEXT →';
    }
    nextB.addEventListener('click', function () {
      if (page === pages.length - 1) showScreen('menu');
    });
    go(0);
  }

  /* ============================================================
     Screen: OPTIONS
     ============================================================ */
  function buildOptions(scr) {
    var panel = el('div', 'ui-panel ui-form-panel ui-options', scr);
    backRow(panel, 'menu');
    txt(panel, 'h2', 'ui-panel-title', 'OPTIONS');

    function volumeRow(label, key, testSfx) {
      var row = el('div', 'ui-opt-row', panel);
      txt(row, 'span', 'ui-set-label', label);
      var box = el('div', 'ui-set-range', row);
      var range = el('input', 'ui-range', box);
      range.type = 'range';
      range.min = 0; range.max = 100; range.step = 1;
      range.value = Math.round(uiOptions[key] * 100);
      var val = txt(box, 'span', 'ui-set-val', Math.round(uiOptions[key] * 100) + '%');
      var lastBlip = 0;
      range.addEventListener('input', function () {
        var v = parseInt(range.value, 10) / 100;
        uiOptions[key] = v;
        val.textContent = Math.round(v * 100) + '%';
        applyAudioOptions();
        saveOptions();
        if (testSfx) {
          var now = performance.now();
          if (now - lastBlip > 180) { lastBlip = now; sfx(testSfx, { vol: 0.6 }); }
        }
      });
    }
    function toggleRow(label, desc, key) {
      var row = el('div', 'ui-opt-row ui-opt-toggle-row', panel);
      var col = el('div', 'ui-opt-text', row);
      txt(col, 'span', 'ui-set-label', label);
      txt(col, 'span', 'ui-opt-desc', desc);
      var tog = el('label', 'ui-toggle', row);
      var cb = el('input', '', tog);
      cb.type = 'checkbox';
      cb.checked = !!uiOptions[key];
      el('span', 'ui-toggle-knob', tog);
      cb.addEventListener('change', function () {
        uiOptions[key] = cb.checked;
        saveOptions();
      });
    }

    txt(panel, 'h3', 'ui-section-title', 'AUDIO');
    volumeRow('Music volume', 'musicVol', null);
    volumeRow('SFX volume', 'sfxVol', 'ui_click');
    txt(panel, 'h3', 'ui-section-title', 'ACCESSIBILITY');
    toggleRow('Colorblind nameplates', 'Show color names next to players so nobody says "the red one".', 'colorblind');
    toggleRow('Reduced flashes', 'Tone down screen flashes and heavy visual effects.', 'reducedFlash');
  }

  /* ============================================================
     Screen: END
     ============================================================ */
  function buildEnd(scr) {
    var p = lastEnd;
    var wrap = el('div', 'ui-end', scr);
    if (!p) {
      var fallback = el('div', 'ui-panel ui-form-panel', wrap);
      txt(fallback, 'h2', 'ui-panel-title', 'GAME OVER');
      btn(fallback, 'ui-btn-primary', 'BACK TO MENU', function () {
        try { if (AL.game && AL.game.leave) AL.game.leave(); } catch (e) {}
        showScreen('menu');
      });
      return;
    }
    var st = (AL.game && AL.game.state) || {};
    var meId = st.meId || null;
    var winnerIds = p.winnerIds || [];
    var iWon = meId != null && winnerIds.indexOf(meId) >= 0;
    var team = p.winnerTeam || 'crew';

    var teamCls = team === 'impostor' ? 'ui-end-imp'
      : team === 'jester' ? 'ui-end-jester'
      : (team === 'player') ? 'ui-end-gold'
      : (team === 'infected') ? 'ui-end-infected'
      : 'ui-end-crew';
    wrap.classList.add(teamCls, iWon ? 'ui-end-won' : 'ui-end-lost');

    var title, sub;
    if (team === 'jester') {
      title = 'JESTER WINS';
      sub = iWon ? 'You fooled them all.' : ((p.winnerName || 'The Jester') + ' fooled everyone.');
    } else if (team === 'player') {
      title = iWon ? 'VICTORY' : 'DEFEAT';
      sub = (p.winnerName || 'Someone') + ' wins the match!';
    } else if (team === 'infected') {
      title = iWon ? 'VICTORY' : 'DEFEAT';
      sub = 'The outbreak ' + (team === 'infected' && iWon ? 'consumed the crew.' : 'consumed the crew.');
    } else if (team === 'impostor') {
      title = iWon ? 'VICTORY' : 'DEFEAT';
      sub = 'The Impostors win.';
    } else {
      title = iWon ? 'VICTORY' : 'DEFEAT';
      sub = 'The Crew wins.';
    }
    var big = txt(wrap, 'h1', 'ui-end-title', title);
    big.setAttribute('data-text', title);
    txt(wrap, 'div', 'ui-end-sub', sub);
    if (p.reason) txt(wrap, 'div', 'ui-end-reason', p.reason);

    // ---- winner parade
    var paradeWrap = el('div', 'ui-end-parade', wrap);
    var parade = makeCanvas(paradeWrap, 'ui-parade-canvas', Math.min(640, Math.max(320, window.innerWidth - 60)), 130);
    var looks = {};
    (st.players || []).forEach(function (pl) { looks[pl.id] = pl; });
    var walkers = winnerIds.map(function (id, i) {
      var stat = null;
      (p.stats || []).forEach(function (s) { if (s.id === id) stat = s; });
      var look = looks[id] || {};
      return {
        color: (stat && stat.color != null) ? stat.color : (look.color || 0),
        hat: look.hat || 'none', skin: look.skin || 'none', pet: look.pet,
        off: i * 92,
      };
    });
    if (!walkers.length) walkers.push({ color: profile.color, hat: profile.hat, skin: profile.skin, off: 0 });
    var paradeT0 = performance.now();
    tickOnScreen(function (dt, t) {
      var ctx = parade.ctx, w = parade.w, h = parade.h;
      ctx.clearRect(0, 0, w, h);
      var span = w + 160;
      walkers.forEach(function (wk) {
        var x = (((t - paradeT0) * 0.055 + wk.off) % span) - 80;
        drawBeanTo(ctx, {
          x: x, y: h - 24, color: wk.color, hat: wk.hat, skin: wk.skin,
          pet: wk.pet && wk.pet !== 'none' ? wk.pet : null,
          petX: x - 52, petY: h - 20,
          dir: 1, moving: true, dead: false, t: t, scale: 1.15,
        });
      });
    });

    // ---- stats table
    if (p.stats && p.stats.length) {
      var statsPanel = el('div', 'ui-panel ui-end-stats', wrap);
      var table = el('div', 'ui-stats-table', statsPanel);
      var head = el('div', 'ui-stats-row ui-stats-head', table);
      ['PLAYER', 'ROLE', 'TASKS', 'KILLS'].forEach(function (h) { txt(head, 'span', 'ui-stats-cell', h); });
      var defs = (AL.roles && AL.roles.DEFS) || {};
      p.stats.forEach(function (s) {
        var row = el('div', 'ui-stats-row' + (winnerIds.indexOf(s.id) >= 0 ? ' ui-stats-winner' : ''), table);
        var nameCell = el('span', 'ui-stats-cell ui-stats-name', row);
        var dot = el('i', 'ui-role-dot', nameCell);
        dot.style.background = colorOf(s.color);
        txt(nameCell, 'span', '', s.name || '???');
        var rd = defs[s.role];
        var roleCell = txt(row, 'span', 'ui-stats-cell', rd ? rd.name : (s.role || '–'));
        if (rd && rd.color) roleCell.style.color = rd.color;
        txt(row, 'span', 'ui-stats-cell', String(s.tasksDone != null ? s.tasksDone : '–'));
        txt(row, 'span', 'ui-stats-cell', String(s.kills != null ? s.kills : '–'));
      });
    }

    // ---- buttons
    var row = el('div', 'ui-end-buttons', wrap);
    if (amIHost()) {
      btn(row, 'ui-btn-big ui-btn-primary', 'BACK TO LOBBY', function () {
        var gm = AL.game || {};
        var fn = gm.backToLobby || gm.returnToLobby || gm.toLobby || gm.endToLobby;
        if (typeof fn === 'function') {
          try { fn.call(gm); } catch (e) { console.warn('[ui] back-to-lobby failed', e); }
        } else {
          toast('Returning to lobby…', 'info');
        }
      });
    } else {
      txt(row, 'span', 'ui-start-hint', 'waiting for the host…');
    }
    btn(row, 'ui-btn-danger', 'LEAVE', function () {
      confirmDialog('Leave the game?', 'You will return to the main menu.', 'LEAVE', function () {
        try { if (AL.game && AL.game.leave) AL.game.leave(); } catch (e) {}
        showScreen('menu');
      });
    });

    // ---- confetti
    if (iWon) {
      var confetti = el('div', 'ui-confetti', wrap);
      var colors = ['#35e0ff', '#ff3860', '#ffd23e', '#3ee06f', '#d06bff', '#eaf0ff'];
      var n = uiOptions.reducedFlash ? 24 : 70;
      for (var i = 0; i < n; i++) {
        var bit = el('i', 'ui-confetti-bit', confetti);
        var sz = 5 + Math.random() * 7;
        bit.style.left = (Math.random() * 100) + '%';
        bit.style.width = sz + 'px';
        bit.style.height = (sz * (0.6 + Math.random() * 0.9)) + 'px';
        bit.style.background = colors[Math.floor(Math.random() * colors.length)];
        bit.style.animationDuration = (2.8 + Math.random() * 2.6) + 's';
        bit.style.animationDelay = (Math.random() * 2.2) + 's';
        bit.style.setProperty('--spin', (Math.random() > 0.5 ? 1 : -1) * (240 + Math.random() * 460) + 'deg');
        if (Math.random() > 0.6) bit.style.borderRadius = '50%';
      }
      onCleanup(function () { if (confetti.parentNode) confetti.parentNode.removeChild(confetti); });
    }
  }

  /* ============================================================
     Builders registry
     ============================================================ */
  var builders = {
    menu: buildMenu,
    join: buildJoin,
    host: buildHost,
    freeplay: buildFreeplay,
    wardrobe: buildWardrobe,
    lobby: buildLobby,
    howto: buildHowto,
    options: buildOptions,
    end: buildEnd,
  };

  /* ============================================================
     Global bus wiring
     ============================================================ */
  function wireBus() {
    BUS.on('game:lobby', function (payload) {
      if (payload) lastLobby = payload;
      // lobby screen refresh handled by its own listener
    });
    BUS.on('game:phase', function (payload) {
      var phase = payload && payload.phase;
      if (!phase) return;
      if (phase === 'lobby') {
        lastEnd = null;
        if (current !== 'lobby') showScreen('lobby');
      } else if (phase === 'menu') {
        if (current !== 'menu') showScreen('menu');
      } else if (phase === 'end') {
        if (current !== 'end' && lastEnd) showScreen('end');
      } else {
        // countdown / reveal / play / meeting / eject: hud territory
        if (current !== null) showScreen(null);
      }
    });
    BUS.on('game:end', function (payload) {
      lastEnd = payload || lastEnd;
      if (current !== 'end') showScreen('end');
    });
    BUS.on('game:toast', function (payload) {
      if (payload && payload.text) toast(payload.text, payload.kind);
    });
    BUS.on('net:error', function (payload) {
      var code = (payload && payload.code) || '';
      var msg = (payload && payload.message) || 'Something went wrong with the connection.';
      if (code === 'nolib') {
        showModal({
          title: 'Multiplayer unavailable', kind: 'error',
          message: 'The network library could not load. Check your internet connection and refresh the page. Freeplay still works offline!',
        });
        return;
      }
      // Join screen shows inline errors already; avoid double modal there.
      if (current === 'join' || current === 'host') return;
      showModal({ title: 'Connection trouble', kind: 'error', message: msg });
    });
    BUS.on('net:hostLost', function () {
      showModal({
        title: 'Host left the game', kind: 'error', dismissable: false,
        message: 'The connection to the host was lost. You have been returned to the main menu.',
        buttons: [{ label: 'OK', cls: 'ui-btn-primary', cb: function () {
          closeModal();
          try { if (AL.game && AL.game.leave) AL.game.leave(); } catch (e) {}
          showScreen('menu');
        } }],
      });
    });
  }

  /* ============================================================
     Global input wiring (sfx delegation, escape, audio unlock)
     ============================================================ */
  var HOVER_SEL = 'button, select, .ui-card, .ui-swatch, .ui-tab, .ui-copy, .ui-toggle, .ui-dot, input[type="range"]';
  var CLICK_SEL = 'button, .ui-card, .ui-swatch, .ui-tab, .ui-copy, .ui-toggle, .ui-dot';
  var lastHover = null;

  function wireInput() {
    layer.addEventListener('pointerover', function (ev) {
      var t = ev.target && ev.target.closest ? ev.target.closest(HOVER_SEL) : null;
      if (t && t !== lastHover && !t.disabled) {
        lastHover = t;
        sfx('ui_hover', { vol: 0.35 });
      }
    });
    layer.addEventListener('pointerout', function (ev) {
      if (lastHover && ev.target && (ev.target === lastHover || lastHover.contains(ev.target))) {
        var rel = ev.relatedTarget;
        if (!rel || !lastHover.contains(rel)) lastHover = null;
      }
    });
    layer.addEventListener('click', function (ev) {
      var t = ev.target && ev.target.closest ? ev.target.closest(CLICK_SEL) : null;
      if (t && !t.disabled) sfx(t.dataset && t.dataset.sfx === 'back' ? 'ui_back' : 'ui_click', { vol: 0.5 });
    }, true);

    window.addEventListener('pointerdown', ensureAudio, true);
    window.addEventListener('keydown', ensureAudio, true);

    window.addEventListener('keydown', function (ev) {
      if (ev.key !== 'Escape') return;
      if (modalEl) { closeModal(); return; }
      var ae = document.activeElement;
      if (ae && (ae.tagName === 'INPUT' || ae.tagName === 'TEXTAREA' || ae.tagName === 'SELECT')) {
        ae.blur();
        return;
      }
      if (current && BACK_TARGET[current]) {
        sfx('ui_back');
        showScreen(BACK_TARGET[current]);
      }
    });
  }

  /* ============================================================
     Public API
     ============================================================ */
  var inited = false;
  AL.ui = {
    options: uiOptions,
    init: function () {
      if (inited) return;
      inited = true;
      root = document.getElementById('ui-root');
      if (!root) { console.warn('[ui] missing #ui-root'); return; }
      layer = el('div', 'ui-layer', root);
      toastWrap = el('div', 'ui-toasts', root);
      applyAudioOptions();
      wireBus();
      wireInput();
      showScreen('menu');
    },
    showScreen: function (name) {
      if (name != null && !builders[name]) {
        console.warn('[ui] unknown screen: ' + name);
        return;
      }
      showScreen(name || null);
    },
  };
})();
