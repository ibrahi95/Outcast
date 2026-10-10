/* Outcast — hud.js: in-game HUD, meeting UI, panels, cinematics */
(function () {
  'use strict';
  window.AL = window.AL || {};
  var U = AL.util, bus = AL.bus;

  var root, hudEl, ovEl;
  var els = {};                 // named elements
  var lastVals = {};            // change detection
  var panelState = null;        // {cleanup, el, taskId, spotId}
  var deviceState = null;       // {kind, timer, raf, el}
  var mapOpen = false, sabMapOpen = false;
  var meetingEl = null, lastMeetingKey = '';
  var chatLog = [];
  var currentPhase = 'menu';
  var heartbeat = null;
  var joystickPointer = null, joystickVisible = false;
  var coarsePointer = window.matchMedia('(any-pointer: coarse)');
  var mobileViewport = window.matchMedia('(max-width: 900px)');
  var sawTouch = false;
  var touchDevice = navigator.maxTouchPoints > 0 || coarsePointer.matches || mobileViewport.matches;

  function resetJoystick() {
    var id = joystickPointer;
    joystickPointer = null;
    if (els.joystick && id !== null && els.joystick.hasPointerCapture(id)) els.joystick.releasePointerCapture(id);
    if (els.joystickKnob) els.joystickKnob.style.transform = 'translate(-50%, -50%)';
    if (els.joystick) els.joystick.classList.remove('active');
    AL.engine.setVirtualMove(0, 0);
  }
  function updateJoystickVisibility() {
    if (!els.joystick) return;
    touchDevice = sawTouch || navigator.maxTouchPoints > 0 || coarsePointer.matches || mobileViewport.matches;
    var visible = touchDevice && currentPhase === 'play' && !panelState && !deviceState && !mapOpen && !sabMapOpen;
    if (visible !== joystickVisible) {
      joystickVisible = visible;
      if (!visible) resetJoystick();
      show(els.joystick, visible);
      AL.engine.setTouchControlsVisible(visible);
    }
    hudEl.classList.toggle('hud-touch-device', touchDevice);
  }
  function buildJoystick() {
    els.joystick = el('button', 'hud-joystick', hudEl);
    els.joystick.type = 'button';
    els.joystick.setAttribute('aria-label', 'Movement joystick: drag to move');
    els.joystickKnob = el('span', 'hud-joystick-knob', els.joystick);
    els.joystickKnob.setAttribute('aria-hidden', 'true');
    show(els.joystick, false);
    function move(e) {
      var rect = els.joystick.getBoundingClientRect();
      var radius = rect.width * 0.32;
      var dx = e.clientX - rect.left - rect.width / 2;
      var dy = e.clientY - rect.top - rect.height / 2;
      var distance = Math.sqrt(dx * dx + dy * dy);
      var amount = Math.min(distance, radius), deadzone = radius * 0.16;
      var nx = distance ? dx / distance : 0, ny = distance ? dy / distance : 0;
      var strength = amount <= deadzone ? 0 : (amount - deadzone) / (radius - deadzone);
      AL.engine.setVirtualMove(nx * strength, ny * strength);
      els.joystickKnob.style.transform = 'translate(calc(-50% + ' + (nx * amount) + 'px), calc(-50% + ' + (ny * amount) + 'px))';
    }
    els.joystick.addEventListener('pointerdown', function (e) {
      if (!joystickVisible || joystickPointer !== null || (e.pointerType === 'mouse' && e.button !== 0)) return;
      e.preventDefault(); e.stopPropagation();
      joystickPointer = e.pointerId;
      els.joystick.setPointerCapture(e.pointerId);
      els.joystick.classList.add('active');
      move(e);
    });
    els.joystick.addEventListener('pointermove', function (e) {
      if (e.pointerId !== joystickPointer) return;
      e.preventDefault(); move(e);
    });
    ['pointerup', 'pointercancel', 'lostpointercapture'].forEach(function (event) {
      els.joystick.addEventListener(event, function (e) { if (e.pointerId === joystickPointer) resetJoystick(); });
    });
    window.addEventListener('blur', resetJoystick);
    window.addEventListener('resize', resetJoystick);
    document.addEventListener('visibilitychange', function () { if (document.hidden) resetJoystick(); });
    window.addEventListener('pointerdown', function (e) {
      if (e.pointerType === 'touch') { sawTouch = true; updateJoystickVisibility(); }
    }, {passive: true});
    AL.engine.onFrame(updateJoystickVisibility);
  }

  function el(tag, cls, parent) {
    var e = document.createElement(tag);
    if (cls) e.className = cls;
    if (parent) parent.appendChild(e);
    return e;
  }
  function setText(node, text) {
    if (node._t !== text) { node._t = text; node.textContent = text; }
  }
  function show(node, on) {
    // explicit display value: CSS defaults of 'none' on overlays would swallow ''
    var v = on ? (node._disp || 'block') : 'none';
    if (node._d !== v) { node._d = v; node.style.display = v; }
  }
  function sfx(id, o) { try { AL.audio.sfx(id, o); } catch (e) {} }
  function colorOf(idx) {
    var c = AL.chars.COLORS[idx | 0] || AL.chars.COLORS[0];
    return c.body;
  }

  /* ================= build ================= */

  function build() {
    root = document.getElementById('ui-root');
    hudEl = el('div', 'hud', root);
    ovEl = el('div', 'hud-ov-layer', root);
    buildJoystick();

    // ---- task list (top-left) ----
    var tp = el('div', 'hud-tasks', hudEl);
    els.taskHead = el('div', 'hud-tasks-head', tp);
    setText(els.taskHead, 'TASKS');
    els.taskList = el('div', 'hud-tasks-list', tp);
    els.commsOut = el('div', 'hud-comms-out', tp);
    els.commsOut.textContent = '⚠ COMMS OFFLINE';
    show(els.commsOut, false);
    els.taskbarWrap = el('div', 'hud-taskbar', tp);
    els.taskbarFill = el('div', 'hud-taskbar-fill', els.taskbarWrap);

    // ---- top-right ----
    var tr = el('div', 'hud-topright', hudEl);
    els.room = el('div', 'hud-room', tr);
    els.timer = el('div', 'hud-timer', tr);
    els.sabBanner = el('div', 'hud-sab-banner', tr);
    els.infection = el('div', 'hud-widget', tr);
    els.sprint = el('div', 'hud-sprint', tr);
    els.bombWarn = el('div', 'hud-bomb-warn', tr);
    els.bombWarn.textContent = '💣 YOU HAVE THE BOMB — TOUCH SOMEONE!';

    // ---- action buttons (bottom-right) ----
    var ar = el('div', 'hud-actions', hudEl);
    function actBtn(label, cls, key, fn) {
      var b = el('button', 'hud-btn ' + cls, ar);
      var ic = el('div', 'hud-btn-label', b);
      ic.textContent = label;
      var cd = el('div', 'hud-btn-cd', b);
      var hint = el('div', 'hud-btn-key', b);
      hint.textContent = key;
      b.addEventListener('click', function () { sfx('ui_click', { vol: 0.5 }); fn(); });
      return { b: b, cd: cd, label: ic };
    }
    els.bUse = actBtn('USE', 'hud-btn-use', 'E', function () { AL.game.interact(); });
    els.bReport = actBtn('REPORT', 'hud-btn-report', 'R', function () { AL.game.reportBody(); });
    els.bKill = actBtn('KILL', 'hud-btn-kill', 'Q', function () { AL.game.attemptKill(); });
    els.bVent = actBtn('VENT', 'hud-btn-vent', 'F', function () { ventAction(); });
    els.bAbility = actBtn('ABILITY', 'hud-btn-ability', 'F', function () { abilityAction(); });
    els.bSab = actBtn('SABOTAGE', 'hud-btn-sab', '', function () { toggleSabMap(); });
    els.bMap = actBtn('MAP', 'hud-btn-map', 'M', function () { toggleMap(); });

    // ---- vent navigation ----
    els.ventNav = el('div', 'hud-ventnav', hudEl);

    // ---- track arrow ----
    els.track = el('div', 'hud-track', hudEl);
    els.track.textContent = '➤';

    // ---- ghost chat drawer ----
    var cd2 = el('div', 'hud-chat', hudEl);
    els.chatBox = el('div', 'hud-chat-log', cd2);
    var cin = el('div', 'hud-chat-row', cd2);
    els.chatInput = el('input', 'hud-chat-input', cin);
    els.chatInput.placeholder = 'ghost chat…';
    els.chatInput.maxLength = 160;
    var csend = el('button', 'hud-chat-send', cin);
    csend.textContent = '➤';
    function sendGhostChat() {
      var t = els.chatInput.value.trim();
      if (t) AL.game.sendChat(t);
      els.chatInput.value = '';
    }
    csend.addEventListener('click', sendGhostChat);
    els.chatInput.addEventListener('keydown', function (e) {
      if (e.key === 'Enter') sendGhostChat();
      e.stopPropagation();
    });
    els.chatDrawer = cd2;

    // ---- overlays ----
    els.panelOv = el('div', 'hud-panel-ov', ovEl);
    els.mapOv = el('div', 'hud-map-ov', ovEl);
    els.meetingOv = el('div', 'hud-meeting-ov', ovEl);
    els.ejectOv = el('div', 'hud-eject-ov', ovEl);
    els.ejectOv._disp = 'flex';
    els.killcamOv = el('div', 'hud-killcam-ov', ovEl);
    els.killcamOv._disp = 'flex';
    els.revealOv = el('div', 'hud-reveal-ov', ovEl);
    els.countOv = el('div', 'hud-count-ov', ovEl);
    els.ventNav._disp = 'flex';
    els.chatDrawer._disp = 'block';

    document.addEventListener('keydown', function (e) {
      if (e.key === 'Escape') {
        if (panelState) closePanel(true);
        else if (mapOpen || sabMapOpen) { closeMapOv(); }
      }
      if (e.key === 'Enter' && currentPhase === 'play' &&
          document.activeElement !== els.chatInput &&
          els.chatDrawer.style.display !== 'none' &&
          !(document.activeElement && /INPUT|TEXTAREA/.test(document.activeElement.tagName))) {
        els.chatInput.focus();
        e.preventDefault();
      }
    });

    wireBus();
    show(hudEl, false);
    show(ovEl, false);
  }

  /* ================= bus events ================= */

  function wireBus() {
    bus.on('game:phase', function (e) {
      currentPhase = e.phase;
      resetJoystick();
      updateJoystickVisibility();
      var inGame = ['countdown', 'reveal', 'play', 'meeting', 'eject'].indexOf(e.phase) >= 0;
      show(hudEl, inGame);
      show(ovEl, true);
      if (!inGame) {
        closePanel(false);
        closeMapOv();
        hideMeeting();
        els.ejectOv.innerHTML = ''; show(els.ejectOv, false);
        chatLog = [];
        if (els.chatBox) els.chatBox.innerHTML = '';
        if (heartbeat) { heartbeat.stop(); heartbeat = null; }
      }
      if (e.phase === 'meeting') { closePanel(true); closeMapOv(); }
    });
    bus.on('game:countdown', function (e) {
      var c = els.countOv;
      c.innerHTML = '';
      show(c, true);
      var n = el('div', 'hud-count-num', c);
      n.textContent = e.n;
      setTimeout(function () { show(c, false); }, 850);
    });
    bus.on('game:start', function (e) { showReveal(e); });
    bus.on('game:panel', function (e) {
      if (e.open) openPanel(e);
      else closePanel(false);
    });
    bus.on('game:sab', function (e) {
      if (!e.kind && panelState && panelState.taskId && panelState.taskId.indexOf('sab_') === 0) closePanel(false);
    });
    bus.on('game:kill', function (e) {
      if (e.youVictim) showKillCam();
    });
    bus.on('game:eject', function (e) { showEject(e); });
    bus.on('game:chat', function (c) { pushChat(c); });
    bus.on('game:meeting', function (m) { /* meeting UI driven from update(); event keeps stage sfx in game.js */ });
  }

  /* ================= actions ================= */

  var lastHud = null;
  function ventAction() {
    if (!lastHud) return;
    if (lastHud.vent && lastHud.vent.in) AL.game.exitVent();
    else if (lastHud.vent) AL.game.enterVent();
  }
  function abilityAction() {
    if (!lastHud || !lastHud.ability || !lastHud.ability.ready) return;
    if (lastHud.ability.id === 'vent') { ventAction(); return; }
    AL.game.useAbility(lastHud.ability.id);
  }

  function toggleMap() { if (mapOpen) closeMapOv(); else openMapOv(false); }
  function toggleSabMap() { if (sabMapOpen) closeMapOv(); else openMapOv(true); }

  /* ================= minimap / sabotage map ================= */

  var mapRaf = 0;
  function openMapOv(sab) {
    closeMapOv();
    closePanel(true);
    mapOpen = !sab; sabMapOpen = !!sab;
    var ov = els.mapOv;
    ov.innerHTML = '';
    show(ov, true);
    var panel = el('div', 'hud-map-panel', ov);
    var head = el('div', 'hud-map-head', panel);
    setText(head, sab ? 'SABOTAGE' : 'MAP');
    var x = el('button', 'hud-x', head);
    x.textContent = '✕';
    x.addEventListener('click', closeMapOv);
    var cv = el('canvas', 'hud-map-cv', panel);
    var frame = AL.game.lastFrame;
    if (!frame || !frame.map) { closeMapOv(); return; }
    var map = frame.map;
    var maxW = Math.min(window.innerWidth - 80, 860);
    var maxH = Math.min(window.innerHeight - 200, 560);
    cv.width = maxW; cv.height = maxH;

    if (sab) {
      var row = el('div', 'hud-sab-row', panel);
      [['lights', 'LIGHTS'], ['reactor', 'REACTOR'], ['o2', 'OXYGEN'], ['comms', 'COMMS']].forEach(function (pair) {
        var b = el('button', 'hud-sab-btn', row);
        b.textContent = pair[1];
        b.addEventListener('click', function () {
          AL.game.sabotage(pair[0]);
          sfx('ui_click');
          closeMapOv();
        });
      });
      var doorRooms = {};
      Object.keys(map.doors).forEach(function (id) { doorRooms[map.doors[id].room] = 1; });
      if (Object.keys(doorRooms).length) {
        var drow = el('div', 'hud-door-row', panel);
        var lbl = el('span', 'hud-door-lbl', drow);
        lbl.textContent = 'DOORS:';
        Object.keys(doorRooms).forEach(function (rid) {
          var rm = map.rooms.find(function (r) { return r.id === rid; });
          var b = el('button', 'hud-door-btn', drow);
          b.textContent = rm ? rm.name : rid;
          b.addEventListener('click', function () {
            AL.game.closeDoors(rid);
            sfx('door_close', { vol: 0.4 });
            closeMapOv();
          });
        });
      }
    }

    var ctx = cv.getContext('2d');
    function paint() {
      if (!mapOpen && !sabMapOpen) return;
      var fr = AL.game.lastFrame;
      if (!fr || !fr.map) { closeMapOv(); return; }
      var blips = [];
      if (fr.me) blips.push({ x: fr.me.x, y: fr.me.y, kind: 'you', color: colorOf(fr.me.color) });
      (fr.taskSpotsMine || []).forEach(function (sid) {
        var sp = fr.map.taskSpots.find(function (s) { return s.id === sid; });
        if (sp) blips.push({ x: sp.x, y: sp.y, kind: 'task' });
      });
      if (fr.sab && fr.sab.kind) {
        fr.map.taskSpots.forEach(function (sp) {
          if (sp.task === 'sab_' + fr.sab.kind) blips.push({ x: sp.x, y: sp.y, kind: 'sab' });
        });
      }
      if (fr.me && fr.me.dead) {
        fr.players.forEach(function (p) {
          if (!p.dead && !p.isMe) blips.push({ x: p.x, y: p.y, kind: 'player', color: colorOf(p.color) });
        });
        (fr.bodies || []).forEach(function (b) { blips.push({ x: b.x, y: b.y, kind: 'body', color: colorOf(b.color) }); });
      }
      AL.render.drawMinimap(ctx, fr.map, cv.width, cv.height, blips);
      mapRaf = requestAnimationFrame(paint);
    }
    paint();
    sfx('task_open', { vol: 0.5 });
  }

  function closeMapOv() {
    if (mapRaf) { cancelAnimationFrame(mapRaf); mapRaf = 0; }
    mapOpen = sabMapOpen = false;
    els.mapOv.innerHTML = '';
    show(els.mapOv, false);
  }

  /* ================= task & device panels ================= */

  function openPanel(e) {
    closePanel(false);
    closeMapOv();
    var ov = els.panelOv;
    ov.innerHTML = '';
    show(ov, true);
    var back = el('div', 'hud-panel-back', ov);
    back.addEventListener('click', function () { closePanel(true); });
    var panel = el('div', 'hud-panel', ov);
    var head = el('div', 'hud-panel-head', panel);
    var title = el('span', '', head);
    var x = el('button', 'hud-x', head);
    x.textContent = '✕';
    x.addEventListener('click', function () { closePanel(true); });
    var body = el('div', 'hud-panel-body', panel);

    if (e.kind === 'device') {
      openDevice(e.device, title, body);
      panelState = { el: ov, taskId: null, spotId: null, cleanup: null, device: e.device };
      return;
    }
    var def = AL.tasks.DEFS[e.taskId];
    if (!def) { closePanel(false); return; }
    setText(title, def.name.toUpperCase() + (e.steps > 1 ? '  (' + (e.step + 1) + '/' + e.steps + ')' : ''));
    var api = {
      done: function () { var sid = e.spotId; closePanelSilent(); AL.game.panelDone(sid); },
      progress: function (p) { AL.game.panelProgress(e.spotId, p); },
      sfx: function (id, o) { sfx(id, o); },
      rnd: U.rng(U.hashStr(String(e.spotId) + '_' + (e.step || 0))),
      step: e.step || 0, steps: e.steps || 1,
      data: e.data || {},
    };
    var cleanup = null;
    try { cleanup = def.make(body, api); }
    catch (err) { console.warn('[hud] task make failed', err); }
    panelState = { el: ov, taskId: e.taskId, spotId: e.spotId, cleanup: cleanup };
  }

  function closePanelSilent() {
    if (!panelState) return;
    if (panelState.cleanup) { try { panelState.cleanup(); } catch (e) {} }
    if (deviceState) { stopDevice(); }
    els.panelOv.innerHTML = '';
    show(els.panelOv, false);
    panelState = null;
  }
  function closePanel(notifyGame) {
    if (!panelState) return;
    closePanelSilent();
    if (notifyGame) AL.game.panelClosed();
  }

  /* -------- devices -------- */

  function stopDevice() {
    if (!deviceState) return;
    if (deviceState.timer) clearInterval(deviceState.timer);
    if (deviceState.raf) cancelAnimationFrame(deviceState.raf);
    deviceState = null;
  }

  function openDevice(kind, title, body) {
    stopDevice();
    if (kind === 'emergency') {
      setText(title, 'EMERGENCY MEETING');
      var wrap = el('div', 'hud-emergency', body);
      var left = el('div', 'hud-emergency-left', wrap);
      setText(left, 'Meetings left: ' + (lastHud ? lastHud.emergencyLeft : 1));
      var btn = el('button', 'hud-emergency-btn', wrap);
      btn.textContent = 'CALL MEETING';
      btn.addEventListener('click', function () {
        AL.game.callMeeting();
        closePanel(true);
      });
      deviceState = { kind: kind };
      return;
    }
    if (kind === 'admin') {
      setText(title, 'ADMIN — LIFE SIGNS BY ROOM');
      var tbl = el('div', 'hud-admin', body);
      function paint() {
        var d = AL.game.getDeviceData('admin');
        if (!d) return;
        tbl.innerHTML = '';
        d.rooms.forEach(function (r) {
          var row = el('div', 'hud-admin-row', tbl);
          var nm = el('span', 'hud-admin-name', row);
          nm.textContent = r.name;
          var ct = el('span', 'hud-admin-count', row);
          ct.textContent = r.count > 0 ? '●'.repeat(Math.min(r.count, 8)) + ' ' + r.count : '—';
          ct.style.color = r.count > 0 ? '#ffd23e' : '#3a4573';
        });
      }
      paint();
      deviceState = { kind: kind, timer: setInterval(paint, 600) };
      return;
    }
    if (kind === 'vitals') {
      setText(title, 'VITALS');
      var list = el('div', 'hud-vitals', body);
      function paintV() {
        var d = AL.game.getDeviceData('vitals');
        if (!d) return;
        list.innerHTML = '';
        d.forEach(function (v) {
          var row = el('div', 'hud-vitals-row' + (v.dead ? ' dead' : '') + (v.disconnected ? ' dc' : ''), list);
          var chip = el('span', 'hud-vitals-chip', row);
          chip.style.background = colorOf(v.color);
          var nm = el('span', 'hud-vitals-name', row);
          nm.textContent = v.name;
          var st = el('span', 'hud-vitals-status', row);
          st.textContent = v.disconnected ? 'D/C' : (v.dead ? 'DEAD' : 'ALIVE');
          if (!v.dead && !v.disconnected) {
            var pulse = el('span', 'hud-vitals-pulse', row);
            pulse.textContent = '❤';
          }
        });
      }
      paintV();
      deviceState = { kind: kind, timer: setInterval(paintV, 900) };
      return;
    }
    if (kind === 'cams') {
      setText(title, 'SECURITY — CAMERAS');
      var grid = el('div', 'hud-cams', body);
      var d = AL.game.getDeviceData('cams');
      var canvases = [];
      (d && d.spots ? d.spots : []).forEach(function (sp) {
        var cell = el('div', 'hud-cam-cell', grid);
        var cv = el('canvas', 'hud-cam-cv', cell);
        cv.width = 210; cv.height = 140;
        var lab = el('div', 'hud-cam-label', cell);
        lab.textContent = sp.room;
        var rec = el('div', 'hud-cam-rec', cell);
        rec.textContent = '● REC';
        canvases.push({ cv: cv, ctx: cv.getContext('2d'), spot: sp });
      });
      function paintC() {
        if (!deviceState || deviceState.kind !== 'cams') return;
        var fr = AL.game.lastFrame;
        if (fr && fr.map) {
          canvases.forEach(function (c) {
            AL.render.drawRegionTo(c.ctx, fr.map, c.spot.x, c.spot.y, c.cv.width, c.cv.height, 0.34, fr);
            // scanline flicker
            c.ctx.fillStyle = 'rgba(53,224,255,0.05)';
            var ln = (U.now() / 30) % c.cv.height;
            c.ctx.fillRect(0, ln, c.cv.width, 2);
          });
        }
        deviceState.raf = requestAnimationFrame(paintC);
      }
      deviceState = { kind: kind };
      paintC();
      return;
    }
  }

  /* ================= meeting ================= */

  function hideMeeting() {
    meetingEl = null;
    lastMeetingKey = '';
    els.meetingOv.innerHTML = '';
    show(els.meetingOv, false);
  }

  function meetingUpdate(hud) {
    var m = hud.meeting;
    if (!m || hud.phase !== 'meeting') {
      if (meetingEl) hideMeeting();
      return;
    }
    var key = m.stage + '|' + JSON.stringify(m.votes || {}) + '|' + (m.myVote || '');
    if (!meetingEl) buildMeeting(hud);
    if (key !== lastMeetingKey) {
      lastMeetingKey = key;
      renderMeetingBody(hud);
    }
    // timer bar
    if (els.meetTimerFill && m.endsAt) {
      var totalMs = m.stage === 'discuss' ? hud.settings.discussTime * 1000 :
        m.stage === 'vote' ? hud.settings.voteTime * 1000 : 4000;
      var left = Math.max(0, m.endsAt - Date.now());
      els.meetTimerFill.style.width = U.clamp(left / Math.max(1, totalMs) * 100, 0, 100) + '%';
      setText(els.meetTimerText, m.stage.toUpperCase() + ' — ' + U.fmtTime(left / 1000));
    }
  }

  function buildMeeting(hud) {
    els.meetingOv.innerHTML = '';
    show(els.meetingOv, true);
    meetingEl = el('div', 'hud-meeting', els.meetingOv);
    // intro stinger
    var m = hud.meeting;
    var stinger = el('div', 'hud-meet-stinger', meetingEl);
    stinger.textContent = m.bodyOf ? 'DEAD BODY REPORTED' : 'EMERGENCY MEETING';
    setTimeout(function () { if (stinger.parentNode) stinger.classList.add('gone'); }, 2400);

    var inner = el('div', 'hud-meet-inner', meetingEl);
    var head = el('div', 'hud-meet-head', inner);
    setText(head, 'WHO IS THE IMPOSTOR?');
    var timer = el('div', 'hud-meet-timer', inner);
    els.meetTimerFill = el('div', 'hud-meet-timer-fill', timer);
    els.meetTimerText = el('div', 'hud-meet-timer-text', inner);
    var cols = el('div', 'hud-meet-cols', inner);
    els.meetGrid = el('div', 'hud-meet-grid', cols);
    // chat sidebar
    var chat = el('div', 'hud-meet-chat', cols);
    els.meetChatLog = el('div', 'hud-meet-chat-log', chat);
    chatLog.slice(-40).forEach(function (c) { appendChatTo(els.meetChatLog, c); });
    var row = el('div', 'hud-chat-row', chat);
    var inp = el('input', 'hud-chat-input', row);
    inp.placeholder = hud.dead ? 'ghost chat…' : 'discuss…';
    inp.maxLength = 160;
    var send = el('button', 'hud-chat-send', row);
    send.textContent = '➤';
    function doSend() {
      var t = inp.value.trim();
      if (t) AL.game.sendChat(t);
      inp.value = '';
    }
    send.addEventListener('click', doSend);
    inp.addEventListener('keydown', function (e) { if (e.key === 'Enter') doSend(); e.stopPropagation(); });
    els.meetSkipRow = el('div', 'hud-meet-skiprow', inner);
    renderMeetingBody(hud);
  }

  var voteSelecting = null;
  function renderMeetingBody(hud) {
    var m = hud.meeting;
    if (!m || !els.meetGrid) return;
    var grid = els.meetGrid;
    grid.innerHTML = '';
    var players = hud.players || [];
    var revealVotes = m.stage === 'reveal';
    // count votes per target for reveal
    var counts = {};
    var votersByTarget = {};
    if (revealVotes && m.result && m.result.counts) counts = m.result.counts;
    if (revealVotes && !hud.settings.anonymousVotes && m.votes) {
      Object.keys(m.votes).forEach(function (v) {
        var t = m.votes[v];
        if (t === true) return;
        (votersByTarget[t] = votersByTarget[t] || []).push(v);
      });
    }
    players.forEach(function (p) {
      if (p.disconnected) return;
      var card = el('div', 'hud-meet-card' + (p.dead ? ' dead' : ''), grid);
      var cv = el('canvas', 'hud-meet-portrait', card);
      cv.width = 56; cv.height = 56;
      try {
        AL.chars.drawPortrait(cv.getContext('2d'), { x: 2, y: 2, size: 52, color: p.color, hat: p.hat, skin: p.skin, dead: p.dead, t: U.now(), dir: 1 });
      } catch (e) {}
      var info = el('div', 'hud-meet-card-info', card);
      var nm = el('div', 'hud-meet-card-name', info);
      nm.textContent = p.name;
      nm.style.color = colorOf(p.color);
      if (m.reporter === p.id) {
        var rep = el('span', 'hud-meet-reporter', nm);
        rep.textContent = ' 📢';
      }
      if (m.bodyOf === p.id) {
        var bd = el('span', 'hud-meet-bodyof', nm);
        bd.textContent = ' ☠';
      }
      // voted stamp
      if (m.stage === 'vote' && m.votes && m.votes[p.id] != null && !p.dead) {
        var st = el('div', 'hud-meet-voted', info);
        st.textContent = 'I VOTED';
      }
      // reveal chips
      if (revealVotes) {
        var chipRow = el('div', 'hud-meet-chips', info);
        var voters = votersByTarget[p.id] || [];
        if (voters.length) {
          voters.forEach(function (v) {
            var vp = players.find(function (q) { return q.id === v; });
            var ch = el('span', 'hud-meet-chip', chipRow);
            ch.style.background = vp ? colorOf(vp.color) : '#888';
          });
        } else if (counts[p.id]) {
          var cc = el('span', 'hud-meet-chip-count', chipRow);
          cc.textContent = counts[p.id] + ' vote' + (counts[p.id] > 1 ? 's' : '');
        }
      }
      // vote interactions
      if (m.stage === 'vote' && m.canVote && !p.dead && p.id !== hud.meId) {
        card.classList.add('votable');
        card.addEventListener('click', function () {
          if (voteSelecting === p.id) return;
          voteSelecting = p.id;
          renderMeetingBody(hud);
        });
        if (voteSelecting === p.id) {
          var conf = el('div', 'hud-meet-confirm', card);
          var yes = el('button', 'hud-meet-yes', conf);
          yes.textContent = '✓';
          yes.addEventListener('click', function (ev) {
            ev.stopPropagation();
            AL.game.castVote(p.id);
            sfx('vote');
            voteSelecting = null;
          });
          var no = el('button', 'hud-meet-no', conf);
          no.textContent = '✕';
          no.addEventListener('click', function (ev) { ev.stopPropagation(); voteSelecting = null; renderMeetingBody(hud); });
        }
      }
      if (m.myVote === p.id) card.classList.add('myvote');
    });
    // skip row
    els.meetSkipRow.innerHTML = '';
    if (m.stage === 'vote') {
      if (m.canVote) {
        var skip = el('button', 'hud-meet-skip', els.meetSkipRow);
        skip.textContent = 'SKIP VOTE';
        skip.addEventListener('click', function () { AL.game.castVote('skip'); sfx('vote'); });
      } else if (m.myVote != null) {
        var done = el('div', 'hud-meet-locked', els.meetSkipRow);
        done.textContent = m.myVote === 'skip' ? 'You skipped.' : 'Vote locked in.';
      }
    } else if (revealVotes && m.result) {
      var res = el('div', 'hud-meet-result', els.meetSkipRow);
      if (m.result.skipped || m.result.tie || !m.result.ejected) {
        res.textContent = m.result.tie ? 'Tie — no one was ejected.' : 'No one was ejected. (skipped)';
      } else {
        var ep = (hud.players || []).find(function (p) { return p.id === m.result.ejected; });
        res.textContent = (ep ? ep.name : '???') + ' will be ejected…';
      }
      if (counts.skip) {
        var sk = el('div', 'hud-meet-skipcount', els.meetSkipRow);
        sk.textContent = counts.skip + ' skipped';
      }
    }
  }

  /* ================= cinematics ================= */

  function showReveal(e) {
    var ov = els.revealOv;
    ov.innerHTML = '';
    show(ov, true);
    var def = AL.roles.DEFS[e.role] || { name: 'Crewmate', team: 'crew', color: '#8fd3ff' };
    var card = el('div', 'hud-reveal-card', ov);
    var teamLine = el('div', 'hud-reveal-team', card);
    teamLine.textContent = def.team === 'impostor' ? 'IMPOSTOR' : (def.team === 'neutral' ? 'NEUTRAL' : 'CREWMATE');
    teamLine.style.color = def.team === 'impostor' ? '#ff3860' : (def.team === 'neutral' ? '#d06bff' : '#8fd3ff');
    var roleLine = el('div', 'hud-reveal-role', card);
    roleLine.textContent = def.name;
    roleLine.style.color = def.color;
    var flav = el('div', 'hud-reveal-flavor', card);
    try { flav.textContent = AL.roles.flavor ? AL.roles.flavor(e.role) : (def.desc || ''); }
    catch (err) { flav.textContent = def.desc || ''; }
    if (e.teamMates && e.teamMates.length) {
      var mates = el('div', 'hud-reveal-mates', card);
      var names = e.teamMates.map(function (id) {
        var p = (AL.game.state.players || []).find(function (q) { return q.id === id; });
        return p ? p.name : '?';
      });
      mates.textContent = 'Partners: ' + names.join(', ');
    }
    setTimeout(function () { ov.classList.add('fade'); }, 2900);
    setTimeout(function () { show(ov, false); ov.classList.remove('fade'); ov.innerHTML = ''; }, 3500);
  }

  function showKillCam() {
    var ov = els.killcamOv;
    ov.innerHTML = '';
    show(ov, true);
    AL.render.flash('#ff3860', 300);
    var t1 = el('div', 'hud-killcam-text', ov);
    t1.textContent = 'YOU WERE KILLED';
    var t2 = el('div', 'hud-killcam-sub', ov);
    t2.textContent = 'Finish your tasks as a ghost — the crew can still win.';
    setTimeout(function () { show(ov, false); ov.innerHTML = ''; }, 2600);
  }

  function showEject(e) {
    hideMeeting();
    var ov = els.ejectOv;
    ov.innerHTML = '';
    show(ov, true);
    var cv = el('canvas', 'hud-eject-cv', ov);
    cv.width = window.innerWidth; cv.height = Math.min(window.innerHeight, 480);
    var text = el('div', 'hud-eject-text', ov);
    var line1, line2 = '';
    if (!e.playerId) {
      line1 = e.tie ? 'The vote was a tie. No one was ejected.' : 'No one was ejected. (Skipped)';
    } else {
      line1 = e.name + ' was ejected.';
      if (e.roleRevealed === 'impostor') line1 = e.name + ' was An Impostor.';
      else if (e.roleRevealed === 'jester') line1 = e.name + ' was… The Jester?!';
      else if (e.roleRevealed === 'crew') line1 = e.name + ' was not An Impostor.';
      if (e.remainingImps != null) {
        line2 = e.remainingImps + ' Impostor' + (e.remainingImps === 1 ? '' : 's') + ' remain' + (e.remainingImps === 1 ? 's' : '') + '.';
      }
    }
    // typewriter
    var shown = 0;
    var tw = setInterval(function () {
      shown += 1;
      setText(text, line1.slice(0, shown));
      if (shown >= line1.length) {
        clearInterval(tw);
        if (line2) {
          var sub = el('div', 'hud-eject-sub', ov);
          sub.textContent = line2;
        }
      }
    }, 42);
    // starfield + tumbling body
    var ctx = cv.getContext('2d');
    var t0 = U.now();
    var raf;
    function paint() {
      var t = (U.now() - t0) / 1000;
      ctx.fillStyle = '#04060f';
      ctx.fillRect(0, 0, cv.width, cv.height);
      for (var s = 0; s < 70; s++) {
        ctx.fillStyle = 'rgba(234,240,255,' + (0.2 + (s % 5) / 8) + ')';
        ctx.fillRect((s * 199 + t * (18 + s % 7 * 5)) % cv.width, (s * 83) % cv.height, 2, 2);
      }
      if (e.playerId) {
        var x = cv.width * (0.1 + t * 0.13);
        var y = cv.height * 0.45 + Math.sin(t * 1.2) * 26;
        ctx.save();
        ctx.translate(x, y);
        ctx.rotate(t * 1.6);
        try { AL.chars.draw(ctx, { x: 0, y: 26, color: e.color, dir: 1, moving: false, dead: false, t: 0, shadow: false }); } catch (err) {}
        ctx.restore();
      }
      if (U.now() - t0 < 5600) raf = requestAnimationFrame(paint);
    }
    paint();
    setTimeout(function () {
      if (raf) cancelAnimationFrame(raf);
      ov.classList.add('fade');
      setTimeout(function () { show(ov, false); ov.classList.remove('fade'); ov.innerHTML = ''; }, 500);
    }, 5600);
  }

  /* ================= chat ================= */

  function appendChatTo(box, c) {
    var row = el('div', 'hud-chat-msg' + (c.ghost ? ' ghost' : ''), box);
    var nm = el('span', 'hud-chat-name', row);
    nm.textContent = c.name + ': ';
    nm.style.color = colorOf(c.color);
    var tx = el('span', 'hud-chat-text', row);
    tx.textContent = c.text;
    box.scrollTop = box.scrollHeight;
    while (box.children.length > 60) box.removeChild(box.firstChild);
  }
  function pushChat(c) {
    if (c.lobby) return; // lobby chat is ui.js's
    chatLog.push(c);
    if (chatLog.length > 80) chatLog.shift();
    if (els.chatBox) appendChatTo(els.chatBox, c);
    if (els.meetChatLog) appendChatTo(els.meetChatLog, c);
  }

  /* ================= frame update ================= */

  function update(hud) {
    if (!hudEl || !hud) return;
    lastHud = hud;
    var phase = hud.phase;
    if (['play', 'meeting', 'eject', 'countdown', 'reveal'].indexOf(phase) < 0) return;

    // keyboard edge actions
    var inp = AL.engine.input;
    if (phase === 'play') {
      if (inp.usePressed) {
        if (hud.use) AL.game.interact();
        else if (hud.report) AL.game.reportBody();
      }
      if (inp.reportPressed && hud.report) AL.game.reportBody();
      if (inp.killPressed && hud.kill && hud.kill.ready) AL.game.attemptKill();
      if (inp.ventPressed) {
        if (hud.vent) ventAction();
        else if (hud.ability && hud.ability.ready) abilityAction();
      }
      if (inp.mapPressed) toggleMap();
    }

    // task list
    var taskKey = JSON.stringify([hud.tasks, hud.taskbar, hud.commsOut]);
    if (lastVals.tasks !== taskKey) {
      lastVals.tasks = taskKey;
      show(els.commsOut, !!hud.commsOut);
      els.taskList.innerHTML = '';
      if (!hud.commsOut) {
        (hud.tasks || []).forEach(function (tk) {
          var row = el('div', 'hud-task' + (tk.done ? ' done' : ''), els.taskList);
          var txt = tk.room ? tk.room + ': ' + tk.name : tk.name;
          if (tk.steps > 1 && !tk.done) txt += ' (' + tk.step + '/' + tk.steps + ')';
          row.textContent = txt;
        });
        if (!(hud.tasks || []).length && hud.isImpostor) {
          var fake = el('div', 'hud-task hud-task-fake', els.taskList);
          fake.textContent = 'Fake tasks. Sabotage. Kill everyone.';
        }
      }
      show(els.taskbarWrap, hud.taskbar != null);
      if (hud.taskbar != null) els.taskbarFill.style.width = Math.round(hud.taskbar * 100) + '%';
    }

    // top-right widgets
    setText(els.room, hud.roomName || '');
    setText(els.timer, hud.timerText || '');
    show(els.timer, !!hud.timerText);
    if (hud.sabActive) {
      var labels = { lights: 'FIX LIGHTS', reactor: 'REACTOR MELTDOWN', o2: 'OXYGEN DEPLETED', comms: 'COMMS SABOTAGED' };
      var txt = labels[hud.sabActive.kind] || 'SABOTAGE';
      if (hud.sabActive.endsAt) txt += ' — ' + Math.max(0, Math.ceil((hud.sabActive.endsAt - Date.now()) / 1000)) + 's';
      setText(els.sabBanner, '⚠ ' + txt);
      show(els.sabBanner, true);
    } else show(els.sabBanner, false);

    if (hud.infection) {
      setText(els.infection, '🦠 INFECTED: ' + hud.infection.infected + ' / ' + hud.infection.total);
      show(els.infection, true);
    } else show(els.infection, false);

    if (hud.sprint) {
      var sKey = JSON.stringify(hud.sprint.map(function (r) { return [r.id, r.done]; }));
      if (lastVals.sprint !== sKey) {
        lastVals.sprint = sKey;
        els.sprint.innerHTML = '';
        var sh = el('div', 'hud-sprint-head', els.sprint);
        sh.textContent = 'RACE STANDINGS';
        hud.sprint.slice(0, 6).forEach(function (r, i) {
          var row = el('div', 'hud-sprint-row', els.sprint);
          var nm = el('span', '', row);
          nm.textContent = (i + 1) + '. ' + r.name;
          nm.style.color = colorOf(r.color);
          var pr = el('span', 'hud-sprint-score', row);
          pr.textContent = r.done + '/' + r.total;
        });
      }
      show(els.sprint, true);
    } else show(els.sprint, false);

    show(els.bombWarn, !!hud.bombMine);
    if (hud.bombMine && !heartbeat) heartbeat = AL.audio.sfx('heartbeat', { loop: true, vol: 0.5, rate: 1.3 });
    if (!hud.bombMine && heartbeat) { heartbeat.stop(); heartbeat = null; }

    // action buttons
    var useLabel = 'USE';
    if (hud.use) {
      useLabel = hud.use.label.toUpperCase();
      if (useLabel.length > 12) useLabel = useLabel.split(' ')[0].slice(0, 12);
    } else if (hud.report) useLabel = 'REPORT';
    updateBtn(els.bUse, !!hud.use || hud.report, useLabel, null);
    show(els.bReport.b, hud.mode === 'classic' && !hud.dead);
    updateBtn(els.bReport, hud.report, 'REPORT', null);
    show(els.bKill.b, !!hud.kill);
    if (hud.kill) updateBtn(els.bKill, hud.kill.ready, 'KILL', hud.kill.ready ? null : hud.kill.cd);
    show(els.bVent.b, !!hud.vent);
    if (hud.vent) updateBtn(els.bVent, true, hud.vent.in ? 'EXIT' : 'VENT', null);
    show(els.bAbility.b, !!hud.ability && hud.ability.id !== 'vent');
    if (hud.ability && hud.ability.id !== 'vent') {
      updateBtn(els.bAbility, hud.ability.ready && !hud.ability.used, hud.ability.name.toUpperCase(),
        hud.ability.ready || hud.ability.used ? null : hud.ability.cd);
    }
    show(els.bSab.b, !!hud.sabotage);
    if (hud.sabotage) updateBtn(els.bSab, hud.sabReady, 'SABOTAGE', hud.sabReady ? null : hud.sabCd);

    // vent navigation
    if (hud.ventLinks && hud.ventLinks.length && phase === 'play') {
      show(els.ventNav, true);
      var vKey = JSON.stringify(hud.ventLinks.map(function (v) { return v.id; }));
      if (lastVals.vents !== vKey) {
        lastVals.vents = vKey;
        els.ventNav.innerHTML = '';
        hud.ventLinks.forEach(function (v) {
          var b = el('button', 'hud-vent-arrow', els.ventNav);
          b.textContent = '⮕';
          b.addEventListener('click', function () { AL.game.ventTo(v.id); sfx('vent_move'); });
          b._vx = v.x; b._vy = v.y;
        });
        var exit = el('button', 'hud-vent-arrow hud-vent-exit', els.ventNav);
        exit.textContent = '⬆ EXIT';
        exit.addEventListener('click', function () { AL.game.exitVent(); });
      }
      // rotate arrows toward their vents
      var fr = AL.game.lastFrame;
      if (fr && fr.me) {
        Array.prototype.forEach.call(els.ventNav.children, function (b) {
          if (b._vx == null) return;
          var a = Math.atan2(b._vy - fr.me.y, b._vx - fr.me.x);
          b.style.transform = 'rotate(' + a + 'rad)';
        });
      }
    } else { show(els.ventNav, false); lastVals.vents = ''; }

    // track arrow
    if (hud.trackArrow && phase === 'play') {
      var sp = AL.engine.screenFromWorld(hud.trackArrow.x, hud.trackArrow.y);
      var cs = AL.engine.canvasSize();
      var margin = 40;
      var cx = U.clamp(sp.x, margin, cs.w - margin), cy = U.clamp(sp.y, margin, cs.h - margin);
      els.track.style.left = cx + 'px';
      els.track.style.top = cy + 'px';
      var fr2 = AL.game.lastFrame;
      if (fr2 && fr2.me) {
        var ang = Math.atan2(hud.trackArrow.y - fr2.me.y, hud.trackArrow.x - fr2.me.x);
        els.track.style.transform = 'translate(-50%,-50%) rotate(' + ang + 'rad)';
      }
      show(els.track, true);
    } else show(els.track, false);

    // ghost chat drawer
    show(els.chatDrawer, !!hud.dead && phase === 'play');

    // meeting
    meetingUpdate(hud);
  }

  function updateBtn(btn, enabled, label, cd) {
    btn.b.classList.toggle('disabled', !enabled);
    var showCd = cd != null && cd > 0;
    btn.b.classList.toggle('cding', showCd);
    setText(btn.label, label);
    setText(btn.cd, showCd ? String(cd) : '');
  }

  /* ================= public ================= */

  var inited = false;
  AL.hud = {
    init: function () {
      if (inited) return;
      inited = true;
      build();
    },
    update: function (hud) {
      try { update(hud); } catch (e) { console.warn('[hud]', e); }
    },
  };
})();
