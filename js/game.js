/* Outcast — game.js: host-authoritative simulation, modes, meetings, sabotage, bots */
(function () {
  'use strict';
  window.AL = window.AL || {};
  var U = AL.util, C = AL.C, bus = AL.bus;

  var BOT_NAMES = ['Ada', 'Bolt', 'Comet', 'Dobby', 'Echo', 'Fizz', 'Gizmo', 'Juno', 'Koda', 'Luna',
    'Mochi', 'Nova', 'Ozzy', 'Pip', 'Quark', 'Rusty', 'Sprout', 'Tango', 'Widget', 'Ziggy'];
  var BOT_LINES = ['where?', 'sus.', 'i was doing tasks', 'it wasnt me', 'anyone on cams?', 'hmm.',
    'I saw nothing', 'skip?', 'vote them', 'trust me', 'who called this?', 'lets think...'];

  var S = null;            // session state; null = menu
  var tickTimer = null, posTimer = null;
  var lastFrameT = 0;
  var stepPhase = 0, stepDist = 0;
  var sabAlarmHandle = null, heartbeatHandle = null;

  function now() { return Date.now(); }

  /* ================================================================
     SETTINGS
     ================================================================ */

  function defaultSettings() {
    return {
      impostors: 1, speed: 1, crewVision: 1, impVision: 1.25,
      killCd: 35, emergencies: 1, emergencyCd: 20,
      discussTime: 30, voteTime: 60,
      anonymousVotes: false, confirmEjects: true, visualTasks: true,
      taskbar: 'always', commonTasks: 2, longTasks: 2, shortTasks: 3,
      hideTime: 240,
      roles: AL.roles.defaultRoleSettings(),
    };
  }

  function settingsSchema() {
    var sch = [
      { key: 'impostors', label: 'Impostors', type: 'int', min: 1, max: 3, step: 1, group: 'Core', modes: ['classic', 'hideseek'] },
      { key: 'speed', label: 'Player Speed', type: 'float', min: 0.5, max: 2, step: 0.25, group: 'Core' },
      { key: 'crewVision', label: 'Crew Vision', type: 'float', min: 0.25, max: 2, step: 0.25, group: 'Core' },
      { key: 'impVision', label: 'Impostor Vision', type: 'float', min: 0.25, max: 2.5, step: 0.25, group: 'Core', modes: ['classic', 'hideseek', 'outbreak'] },
      { key: 'killCd', label: 'Kill Cooldown (s)', type: 'int', min: 10, max: 60, step: 2.5, group: 'Core', modes: ['classic', 'outbreak'] },
      { key: 'emergencies', label: 'Emergency Meetings', type: 'int', min: 0, max: 3, step: 1, group: 'Meetings', modes: ['classic'] },
      { key: 'discussTime', label: 'Discussion Time (s)', type: 'int', min: 0, max: 120, step: 15, group: 'Meetings', modes: ['classic'] },
      { key: 'voteTime', label: 'Voting Time (s)', type: 'int', min: 15, max: 180, step: 15, group: 'Meetings', modes: ['classic'] },
      { key: 'anonymousVotes', label: 'Anonymous Votes', type: 'bool', group: 'Meetings', modes: ['classic'] },
      { key: 'confirmEjects', label: 'Confirm Ejects', type: 'bool', group: 'Meetings', modes: ['classic'] },
      { key: 'visualTasks', label: 'Visual Tasks', type: 'bool', group: 'Tasks' },
      { key: 'taskbar', label: 'Task Bar Updates', type: 'enum', options: ['always', 'meetings', 'never'], group: 'Tasks' },
      { key: 'commonTasks', label: 'Common Tasks', type: 'int', min: 0, max: 2, step: 1, group: 'Tasks' },
      { key: 'longTasks', label: 'Long Tasks', type: 'int', min: 0, max: 3, step: 1, group: 'Tasks' },
      { key: 'shortTasks', label: 'Short Tasks', type: 'int', min: 0, max: 5, step: 1, group: 'Tasks' },
      { key: 'hideTime', label: 'Hide Time (s)', type: 'int', min: 120, max: 420, step: 30, group: 'Hide & Seek', modes: ['hideseek'] },
    ];
    Object.keys(AL.roles.DEFS).forEach(function (rid) {
      if (rid === 'crewmate' || rid === 'impostor') return;
      sch.push({
        key: 'roles.' + rid + '.chance',
        label: AL.roles.DEFS[rid].name + ' Chance %',
        type: 'int', min: 0, max: 100, step: 25, group: 'Roles', modes: ['classic'],
      });
    });
    return sch;
  }

  function getSetting(key) {
    if (key.indexOf('roles.') === 0) {
      var parts = key.split('.');
      return S.settings.roles[parts[1]] ? S.settings.roles[parts[1]][parts[2]] : 0;
    }
    return S.settings[key];
  }
  function putSetting(key, val) {
    if (key.indexOf('roles.') === 0) {
      var parts = key.split('.');
      if (!S.settings.roles[parts[1]]) S.settings.roles[parts[1]] = { chance: 0, max: 1 };
      S.settings.roles[parts[1]][parts[2]] = val;
    } else S.settings[key] = val;
  }

  /* ================================================================
     PLAYERS / LOBBY
     ================================================================ */

  function mkPlayer(id, profile, isBot) {
    return {
      id: id, name: String(profile.name || 'Bean').slice(0, 12),
      color: profile.color | 0, hat: profile.hat || 'none', pet: profile.pet || 'none', skin: profile.skin || 'none',
      isHost: false, isBot: !!isBot, dead: false, disconnected: false,
      x: 0, y: 0, dir: 1, moving: false, inVent: null,
      role: 'crewmate', shield: false, infected: false,
      killAt: 0, abilityAt: 0, emergenciesLeft: 1,
      morphId: null, morphUntil: 0, cloakUntil: 0, ventEnterAt: 0,
      scanning: false, freezeUntil: 0,
      kills: 0, tasksDone: 0,
      buf: [], // interpolation buffer [{t,x,y,dir,moving}]
    };
  }

  function fixColor(p) {
    var taken = {};
    S.order.forEach(function (id) { if (id !== p.id) taken[S.players[id].color] = 1; });
    if (!taken[p.color]) return;
    for (var i = 0; i < 18; i++) if (!taken[i]) { p.color = i; return; }
  }

  function publicPlayers() {
    return S.order.map(function (id) {
      var p = S.players[id];
      return {
        id: p.id, name: p.name, color: p.color, hat: p.hat, pet: p.pet, skin: p.skin,
        isHost: p.id === S.hostId, isBot: p.isBot, ready: true, dead: p.dead, disconnected: p.disconnected,
      };
    });
  }

  function lobbyPayload() {
    return {
      players: publicPlayers(), settings: U.deep(S.settings),
      mode: S.mode, mapId: S.mapId, code: S.code, hostId: S.hostId, meId: S.meId,
    };
  }

  function syncLobby() {
    if (S.isHost && S.online) broadcast({ t: 'lobby', d: lobbyPayload() });
    bus.emit('game:lobby', lobbyPayload());
  }

  function setPhase(ph) {
    if (!S) return;
    S.phase = ph;
    bus.emit('game:phase', { phase: ph });
    if (ph === 'lobby') AL.audio.playMusic('lobby');
    else if (ph === 'play') AL.audio.playMusic(S.mode === 'hideseek' ? 'hide' : 'game');
    else if (ph === 'meeting') AL.audio.playMusic('meeting');
  }

  /* ================================================================
     NET PLUMBING
     ================================================================ */

  function broadcast(msg, exceptId) {
    if (S && S.online) { try { AL.net.broadcast(msg, exceptId); } catch (e) {} }
  }
  function sendTo(playerId, msg) {
    if (!S) return;
    if (playerId === S.meId) { handleMsg(playerId, msg); return; }
    var p = S.players[playerId];
    if (p && p.isBot) return;
    if (S.online) { try { AL.net.send(playerId, msg); } catch (e) {} }
  }
  // client -> host action
  function act(k, data) {
    if (!S) return;
    var d = data || {};
    d.k = k;
    if (S.isHost) hostAction(S.meId, d);
    else broadcast({ t: 'act', d: d });
  }

  var busWired = false;
  function wireBus() {
    if (busWired) return;
    busWired = true;
    bus.on('net:peerJoin', function (e) {
      if (!S || !S.isHost) return;
      if (S.order.length >= C.MAX_PLAYERS || S.phase !== 'lobby') {
        try { AL.net.kick(e.id); } catch (er) {}
        return;
      }
      var prof = (e.meta && e.meta.profile) || {};
      var p = mkPlayer(e.id, prof, false);
      S.players[e.id] = p;
      S.order.push(e.id);
      fixColor(p);
      sendTo(e.id, { t: 'welcome', d: { yourId: e.id, lobby: lobbyPayload() } });
      syncLobby();
      AL.audio.sfx('join');
      bus.emit('game:toast', { text: p.name + ' joined', kind: 'info' });
    });
    bus.on('net:peerLeave', function (e) {
      if (!S) return;
      if (S.isHost) {
        var p = S.players[e.id];
        if (!p) return;
        if (S.phase === 'lobby') {
          delete S.players[e.id];
          S.order = S.order.filter(function (id) { return id !== e.id; });
          syncLobby();
        } else {
          p.disconnected = true;
          p.dead = true;
          hostEvent('pupdate', { id: p.id, dead: true, disconnected: true });
          checkWin();
        }
        AL.audio.sfx('leave');
        bus.emit('game:toast', { text: p.name + ' left', kind: 'warn' });
      }
    });
    bus.on('net:msg', function (e) { if (S) handleMsg(e.from, e.msg); });
    bus.on('net:hostLost', function () { if (S && !S.isHost) teardown(false); });
  }

  function handleMsg(from, msg) {
    if (!msg || typeof msg !== 'object') return;
    try {
      switch (msg.t) {
        case 'welcome':
          if (!S || S.isHost) return;
          S.meId = msg.d.yourId;
          applyLobby(msg.d.lobby);
          setPhase('lobby');
          break;
        case 'lobby':
          if (!S || S.isHost) return;
          applyLobby(msg.d);
          break;
        case 'act':
          if (S.isHost) hostAction(from, msg.d);
          break;
        case 'pos':
          if (S.isHost) hostPos(from, msg.d);
          break;
        case 'snap':
          if (!S.isHost) applySnap(msg.d);
          break;
        case 'ev':
          if (!S.isHost) applyEvent(msg.d);
          break;
        case 'start':
          if (!S.isHost) clientStart(msg.d);
          break;
      }
    } catch (err) { console.warn('[game] msg error', err); }
  }

  function applyLobby(lb) {
    if (!lb) return;
    S.settings = lb.settings;
    S.mode = lb.mode; S.mapId = lb.mapId; S.code = lb.code; S.hostId = lb.hostId;
    var seen = {};
    lb.players.forEach(function (pp) {
      seen[pp.id] = 1;
      if (!S.players[pp.id]) {
        S.players[pp.id] = mkPlayer(pp.id, pp, pp.isBot);
        S.order.push(pp.id);
      }
      var p = S.players[pp.id];
      p.name = pp.name; p.color = pp.color; p.hat = pp.hat; p.pet = pp.pet; p.skin = pp.skin;
      p.isBot = pp.isBot; p.dead = pp.dead; p.disconnected = pp.disconnected;
    });
    S.order = S.order.filter(function (id) { if (!seen[id]) delete S.players[id]; return seen[id]; });
    bus.emit('game:lobby', lobbyPayload());
  }

  /* ================================================================
     SESSION LIFECYCLE
     ================================================================ */

  function baseSession(online, isHost) {
    return {
      phase: 'lobby', online: online, isHost: isHost,
      code: null, meId: null, hostId: null,
      mode: 'classic', mapId: 'vessel',
      settings: defaultSettings(),
      players: {}, order: [],
      map: null, bodies: [], meeting: null, sab: null,
      sabCdUntil: 0, doorCds: {}, taskbar: 0, taskTotal: 0, taskDone: 0,
      winner: null, botSeq: 0, seed: (Math.random() * 1e9) | 0,
      bomb: null, hsEndsAt: 0, chaosUntil: 0, chaosWarnAt: 0, lastChaosAt: 0,
      emergencyCdUntil: 0, graceUntil: 0,
      myTasks: [], panel: null, reactorHolds: {}, o2Done: {}, o2Codes: {},
      startPos: {}, trackTarget: null, trackUntil: 0, freeplay: false,
      endInfo: null, snapCount: 0,
    };
  }

  function hostLobby(profile) {
    wireBus();
    return AL.net.host({ v: C.PROTO }).then(function (code) {
      S = baseSession(true, true);
      S.code = code;
      S.meId = AL.net.id || 'host';
      S.hostId = S.meId;
      var p = mkPlayer(S.meId, profile, false);
      p.isHost = true;
      S.players[S.meId] = p;
      S.order.push(S.meId);
      startTick();
      setPhase('lobby');
      syncLobby();
      return code;
    });
  }

  function joinLobby(code, profile) {
    wireBus();
    S = baseSession(true, false);
    return AL.net.join(code, { profile: profile, v: C.PROTO }).then(function () {
      S.code = String(code || '').toUpperCase();
      startTick();
      // welcome msg will set meId + lobby
    }).catch(function (err) {
      S = null;
      throw err;
    });
  }

  function startFreeplay(profile, opts) {
    wireBus();
    opts = opts || {};
    S = baseSession(false, true);
    S.freeplay = true;
    S.meId = 'p0'; S.hostId = 'p0'; S.code = null;
    S.mapId = opts.mapId || 'vessel';
    S.mode = opts.mode || 'classic';
    if (S.mode === 'bombtag') S.mapId = 'meteor';
    var p = mkPlayer('p0', profile, false);
    p.isHost = true;
    S.players.p0 = p;
    S.order.push('p0');
    var n = U.clamp(opts.botCount != null ? opts.botCount : 7, 1, 14);
    for (var i = 0; i < n; i++) addBot(true);
    S.forcedRole = opts.myRole || null;
    startTick();
    setPhase('lobby');
    syncLobby();
    startGame();
  }

  function addBot(silent) {
    if (!S || !S.isHost || S.order.length >= C.MAX_PLAYERS) return;
    var used = S.order.map(function (id) { return S.players[id].name; });
    var name = BOT_NAMES.filter(function (n) { return used.indexOf(n) < 0; })[0] || ('Bot' + (S.botSeq + 1));
    S.botSeq++;
    var id = 'bot' + S.botSeq;
    var rnd = Math.random;
    var hats = AL.chars.HATS, pets = AL.chars.PETS;
    var p = mkPlayer(id, {
      name: name, color: Math.floor(rnd() * 18),
      hat: hats[Math.floor(rnd() * hats.length)].id,
      pet: rnd() < 0.35 ? pets[Math.floor(rnd() * pets.length)].id : 'none',
    }, true);
    p.bot = { state: 'idle', path: null, pathI: 0, stateUntil: 0, taskI: 0, susp: {}, target: null, voteAt: 0, lastSabFix: 0 };
    S.players[id] = p;
    S.order.push(id);
    fixColor(p);
    if (!silent) { syncLobby(); AL.audio.sfx('join'); }
  }

  function removeBot() {
    if (!S || !S.isHost) return;
    for (var i = S.order.length - 1; i >= 0; i--) {
      var id = S.order[i];
      if (S.players[id].isBot) {
        delete S.players[id];
        S.order.splice(i, 1);
        syncLobby();
        return;
      }
    }
  }

  function teardown(quiet) {
    stopTick();
    if (sabAlarmHandle) { sabAlarmHandle.stop(); sabAlarmHandle = null; }
    if (heartbeatHandle) { heartbeatHandle.stop(); heartbeatHandle = null; }
    try { AL.net.leave(); } catch (e) {}
    S = null;
    bus.emit('game:phase', { phase: 'menu' });
    if (!quiet) AL.audio.playMusic('menu');
  }

  function startTick() {
    stopTick();
    tickTimer = setInterval(hostTickWrap, 33);
    posTimer = setInterval(sendPos, 1000 / C.SNAP_HZ);
  }
  function stopTick() {
    if (tickTimer) { clearInterval(tickTimer); tickTimer = null; }
    if (posTimer) { clearInterval(posTimer); posTimer = null; }
  }

  /* ================================================================
     GAME START
     ================================================================ */

  function activeIds() { return S.order.filter(function (id) { return !S.players[id].disconnected; }); }
  function aliveIds() { return S.order.filter(function (id) { var p = S.players[id]; return !p.dead && !p.disconnected; }); }
  function isImp(p) { return AL.roles.isImpostor(p.role) || p.infected; }
  function aliveImps() { return aliveIds().filter(function (id) { return isImp(S.players[id]); }); }
  function aliveCrew() { return aliveIds().filter(function (id) { return !isImp(S.players[id]); }); }

  function spawnRing(map, ids) {
    var pos = {};
    var n = ids.length;
    ids.forEach(function (id, i) {
      var a = i / n * Math.PI * 2 - Math.PI / 2;
      pos[id] = {
        x: map.spawn.x + Math.cos(a) * C.TILE * 1.6,
        y: map.spawn.y + Math.sin(a) * C.TILE * 1.1,
      };
    });
    return pos;
  }

  function assignTasks(map, rnd, forPlayerIds) {
    // returns {playerId: [{taskId, name, spotIds:[], step, done, room}]}
    var res = {};
    var spotsByTask = {};
    map.taskSpots.forEach(function (s) {
      if (s.task.indexOf('sab_') === 0) return;
      (spotsByTask[s.task] = spotsByTask[s.task] || []).push(s);
    });
    var byKind = { common: [], long: [], short: [] };
    Object.keys(spotsByTask).forEach(function (tid) {
      var def = AL.tasks.DEFS[tid];
      if (def) byKind[def.kind].push(tid);
    });
    function mkInst(tid) {
      var def = AL.tasks.DEFS[tid];
      var spots = U.shuffle(spotsByTask[tid], rnd);
      var nSteps = Math.min(def.steps || 1, spots.length);
      var chosen = spots.slice(0, nSteps);
      return {
        taskId: tid, name: def.name, spotIds: chosen.map(function (s) { return s.id; }),
        step: 0, steps: nSteps, done: false,
        room: (map.taskSpots.find(function (s) { return s.id === chosen[0].id; }) || {}).room || '',
      };
    }
    var st = S.settings;
    var isSprint = S.mode === 'sprint';
    // common tasks: same for everyone
    var commons = U.shuffle(byKind.common, rnd).slice(0, isSprint ? 1 : st.commonTasks);
    forPlayerIds.forEach(function (pid) {
      var list = commons.map(mkInst);
      var longs = U.shuffle(byKind.long, rnd).slice(0, isSprint ? 3 : st.longTasks);
      var shorts = U.shuffle(byKind.short, rnd).slice(0, isSprint ? 6 : st.shortTasks);
      longs.forEach(function (t) { list.push(mkInst(t)); });
      shorts.forEach(function (t) { list.push(mkInst(t)); });
      res[pid] = list;
    });
    return res;
  }

  function countTaskSteps(list) {
    var total = 0, done = 0;
    list.forEach(function (t) { total += t.steps; done += t.done ? t.steps : t.step; });
    return { total: total, done: done };
  }

  function recomputeTaskbar() {
    var total = 0, done = 0;
    S.order.forEach(function (id) {
      var p = S.players[id];
      if (p.disconnected) return;
      if (isImp(p)) return;
      var c = countTaskSteps(S.tasks[id] || []);
      total += c.total; done += c.done;
    });
    S.taskTotal = total; S.taskDone = done;
    S.taskbar = total > 0 ? done / total : 0;
  }

  function startGame() {
    if (!S || !S.isHost || (S.phase !== 'lobby' && S.phase !== 'end')) return;
    var ids = activeIds();
    var minP = S.freeplay ? 2 : (S.mode === 'classic' ? 4 : 2);
    if (ids.length < minP) {
      bus.emit('game:toast', { text: 'Need at least ' + minP + ' players', kind: 'warn' });
      return;
    }
    var map = AL.maps.loadFresh(S.mapId);
    if (!map) { bus.emit('game:toast', { text: 'Map missing!', kind: 'warn' }); return; }
    if (S.mode === 'bombtag' && S.mapId !== 'meteor') { S.mapId = 'meteor'; map = AL.maps.loadFresh('meteor'); }
    S.map = map;
    S.seed = (Math.random() * 1e9) | 0;
    var rnd = U.rng(S.seed);

    // roles
    var roleMap = AL.roles.assign(ids, S.settings, S.mode, rnd);
    if (S.freeplay && S.forcedRole && roleMap) {
      var mine = roleMap[S.meId];
      if (S.forcedRole !== mine) {
        var swapWith = ids.find(function (id) { return id !== S.meId && roleMap[id] === S.forcedRole; });
        if (swapWith) { roleMap[swapWith] = mine; roleMap[S.meId] = S.forcedRole; }
        else roleMap[S.meId] = S.forcedRole;
      }
    }
    ids.forEach(function (id) {
      var p = S.players[id];
      p.role = roleMap[id] || 'crewmate';
      p.dead = false; p.infected = false; p.shield = false;
      p.inVent = null; p.morphId = null; p.cloakUntil = 0;
      p.kills = 0; p.tasksDone = 0;
      p.emergenciesLeft = S.settings.emergencies;
      p.killAt = now() + 10000; // initial grace
      p.abilityAt = 0;
      p.freezeUntil = S.mode === 'hideseek' && isImp(p) ? now() + 14500 : 0;
      p.buf = [];
    });
    if (S.mode === 'outbreak') {
      // exactly one patient zero
      var z = aliveImps()[0];
      if (z) { S.players[z].infected = true; S.players[z].killAt = now() + 8000; }
    }

    // tasks
    S.tasks = assignTasks(map, rnd, ids.filter(function (id) { return !AL.roles.isImpostor(S.players[id].role); }));
    ids.forEach(function (id) { if (!S.tasks[id]) S.tasks[id] = []; });
    recomputeTaskbar();

    // positions
    var pos = spawnRing(map, ids);
    ids.forEach(function (id) { S.players[id].x = pos[id].x; S.players[id].y = pos[id].y; });
    S.startPos = pos;
    S.bodies = []; S.meeting = null; S.sab = null; S.sabCdUntil = now() + 15000;
    S.doorCds = {}; S.bomb = null; S.winner = null; S.endInfo = null;
    S.emergencyCdUntil = 0; S.graceUntil = 0; S.reactorHolds = {}; S.o2Done = {}; S.o2Codes = {};
    S.hsEndsAt = S.mode === 'hideseek' ? 0 : 0; // set at play start
    S.lastChaosAt = 0; S.chaosUntil = 0; S.chaosWarnAt = 0;

    // notify clients
    if (S.online) {
      ids.forEach(function (id) {
        if (S.players[id].isBot || id === S.meId) return;
        sendTo(id, {
          t: 'start',
          d: {
            mapId: S.mapId, mode: S.mode, settings: S.settings, seed: S.seed,
            role: S.players[id].role,
            infected: S.players[id].infected,
            mates: (AL.roles.isImpostor(S.players[id].role) ? ids.filter(function (o) { return o !== id && AL.roles.isImpostor(S.players[o].role); }) : []),
            seekers: S.mode === 'hideseek' ? ids.filter(function (o) { return AL.roles.isImpostor(S.players[o].role); }) : [],
            tasks: S.tasks[id],
            pos: pos,
            players: publicPlayers(),
          },
        });
      });
    }
    S.myTasks = S.tasks[S.meId] || [];
    beginCountdown();
  }

  function clientStart(d) {
    S.mapId = d.mapId; S.mode = d.mode; S.settings = d.settings;
    S.map = AL.maps.loadFresh(d.mapId);
    S.myRole = d.role;
    S.myTasks = d.tasks || [];
    S.myMates = d.mates || [];
    S.seekers = d.seekers || [];
    (d.players || []).forEach(function (pp) {
      if (!S.players[pp.id]) { S.players[pp.id] = mkPlayer(pp.id, pp, pp.isBot); S.order.push(pp.id); }
      var p = S.players[pp.id];
      p.dead = false; p.buf = [];
      if (d.pos && d.pos[pp.id]) { p.x = d.pos[pp.id].x; p.y = d.pos[pp.id].y; }
    });
    var me = S.players[S.meId];
    if (me) {
      me.role = d.role;
      me.infected = !!d.infected;
      me.emergenciesLeft = S.settings.emergencies;
      me.freezeUntil = S.mode === 'hideseek' && AL.roles.isImpostor(d.role) ? now() + 14500 : 0;
    }
    S.bodies = []; S.sab = null; S.bomb = null; S.meeting = null;
    beginCountdown();
  }

  function beginCountdown() {
    setPhase('countdown');
    var n = 3;
    AL.audio.sfx('countdown');
    bus.emit('game:countdown', { n: n });
    if (S.isHost) hostEventOthers('countdown', { n: n });
    var iv = setInterval(function () {
      if (!S || S.phase !== 'countdown') { clearInterval(iv); return; }
      n--;
      if (n <= 0) {
        clearInterval(iv);
        AL.audio.sfx('start_whoosh');
        beginReveal();
      } else {
        AL.audio.sfx('countdown');
        bus.emit('game:countdown', { n: n });
      }
    }, 900);
  }

  function beginReveal() {
    setPhase('reveal');
    var me = S.players[S.meId];
    var role = S.isHost ? (me ? me.role : 'crewmate') : S.myRole;
    var mates = S.isHost
      ? (me && AL.roles.isImpostor(me.role) ? S.order.filter(function (o) { return o !== S.meId && AL.roles.isImpostor(S.players[o].role); }) : [])
      : (S.myMates || []);
    bus.emit('game:start', { role: role, teamMates: mates, mode: S.mode, mapId: S.mapId });
    setTimeout(function () {
      if (!S || S.phase !== 'reveal') return;
      setPhase('play');
      if (S.mode === 'hideseek' && S.isHost) {
        S.hsEndsAt = now() + S.settings.hideTime * 1000;
      }
      if (S.mode === 'bombtag' && S.isHost) {
        setTimeout(function () { if (S && S.phase === 'play') newBomb(); }, 3000);
      }
      if (S.mode === 'sprint' && S.isHost) S.lastChaosAt = now();
      bus.emit('game:tasks', { tasks: S.myTasks, taskbar: taskbarShown() });
    }, 3500);
  }

  /* ================================================================
     HOST: actions from players
     ================================================================ */

  function distP(a, b) { return U.dist(a.x, a.y, b.x, b.y); }

  function hostPos(from, d) {
    if (!S || !S.isHost || !Array.isArray(d)) return;
    var p = S.players[from];
    if (!p || p.disconnected) return;
    if (S.phase === 'meeting' || S.phase === 'eject') return;
    var x = +d[0], y = +d[1];
    if (!isFinite(x) || !isFinite(y)) return;
    // clamp displacement
    var maxD = C.SPEED * S.settings.speed * (1 / C.SNAP_HZ) * 2.6 * (S.bomb && S.bomb.holderId === from ? 1.2 : 1);
    if (distP(p, { x: x, y: y }) > maxD * 3) {
      // hard teleport rejection: snap back
      sendTo(from, { t: 'ev', d: { k: 'teleport', x: p.x, y: p.y } });
      return;
    }
    p.x = x; p.y = y;
    p.dir = d[2] >= 0 ? 1 : -1;
    p.moving = !!d[3];
    p.buf.push({ t: now(), x: x, y: y, dir: p.dir, moving: p.moving });
    if (p.buf.length > 20) p.buf.shift();
  }

  function hostAction(from, d) {
    if (!S || !S.isHost || !d) return;
    var p = S.players[from];
    if (!p) return;
    var k = d.k;
    if (k === 'chat') return hostChat(from, d);
    if (S.phase === 'lobby') return;
    switch (k) {
      case 'kill': return hostKill(from);
      case 'report': return hostReport(from);
      case 'meeting': return hostEmergency(from);
      case 'vote': return hostVote(from, d.target);
      case 'ability': return hostAbility(from, d.id);
      case 'ventIn': return hostVentIn(from);
      case 'ventTo': return hostVentTo(from, d.vent);
      case 'ventOut': return hostVentOut(from);
      case 'spotDone': return hostSpotDone(from, d.spot);
      case 'panelProg': return hostPanelProg(from, d.spot, d.p);
      case 'sab': return hostSabotage(from, d.kind);
      case 'doors': return hostDoors(from, d.room);
      case 'scanStart': return hostScan(from, true);
      case 'scanStop': return hostScan(from, false);
    }
  }

  function hostChat(from, d) {
    var p = S.players[from];
    var text = String(d.text || '').slice(0, 160);
    if (!text.trim()) return;
    var ghost = p.dead && S.phase !== 'lobby';
    var payload = { from: from, name: p.name, color: p.color, text: text, ghost: ghost, lobby: S.phase === 'lobby' };
    // ghosts only to ghosts (host relays selectively)
    if (ghost) {
      S.order.forEach(function (id) {
        if (S.players[id].isBot) return;
        if (S.players[id].dead || id === from) sendTo(id, { t: 'ev', d: { k: 'chat', c: payload } });
      });
      if (S.players[S.meId] && !S.players[S.meId].dead && from !== S.meId) return;
    } else {
      hostEventOthers('chat', { c: payload });
      applyEvent({ k: 'chat', c: payload });
    }
  }

  function nearestPlayer(p, filter, range) {
    var best = null, bd = range;
    aliveIds().forEach(function (id) {
      if (id === p.id) return;
      var o = S.players[id];
      if (o.inVent) return;
      if (filter && !filter(o)) return;
      var dd = distP(p, o);
      if (dd < bd) { bd = dd; best = o; }
    });
    return best;
  }

  function doKill(killer, victim, opts) {
    opts = opts || {};
    if (victim.shield && !opts.ignoreShield) {
      victim.shield = false;
      killer.killAt = now() + 10000;
      hostEvent('shield', { target: victim.id, x: victim.x, y: victim.y });
      return false;
    }
    victim.dead = true;
    victim.scanning = false;
    if (!opts.noBody) S.bodies.push({ id: 'b' + now() + victim.id, of: victim.id, color: victim.color, x: victim.x, y: victim.y, t0: now() });
    if (!opts.noJump) { killer.x = victim.x; killer.y = victim.y; }
    killer.kills++;
    hostEvent('kill', {
      victimId: victim.id, killerId: killer.id, x: victim.x, y: victim.y,
      body: !opts.noBody,
    });
    recomputeTaskbar();
    checkWin();
    return true;
  }

  function hostKill(from) {
    var p = S.players[from];
    if (S.phase !== 'play' || p.dead || p.inVent) return;
    if (now() < S.graceUntil || now() < p.freezeUntil) return;
    if (S.mode === 'bombtag' || S.mode === 'sprint') return;
    if (!isImp(p)) return;
    if (now() < p.killAt) return;
    var victim = nearestPlayer(p, function (o) { return !isImp(o); }, C.KILL_RANGE);
    if (!victim) return;
    if (S.mode === 'outbreak') {
      // convert
      p.killAt = now() + (S.settings.killCd * 1000);
      victim.infected = true;
      victim.killAt = now() + 30000;
      hostEvent('convert', { id: victim.id, by: from, x: victim.x, y: victim.y });
      recomputeTaskbar();
      checkWin();
      return;
    }
    var cd = S.mode === 'hideseek' ? 9000 : S.settings.killCd * 1000;
    if (doKill(p, victim, { noBody: S.mode === 'hideseek' ? false : false })) {
      p.killAt = now() + cd;
    }
  }

  function hostReport(from) {
    var p = S.players[from];
    if (S.phase !== 'play' || p.dead) return;
    if (S.mode !== 'classic') return;
    var body = S.bodies.find(function (b) { return U.dist(p.x, p.y, b.x, b.y) < C.REPORT_RANGE; });
    if (!body) return;
    startMeeting(from, body.of);
  }

  function hostEmergency(from) {
    var p = S.players[from];
    if (S.phase !== 'play' || p.dead || S.mode !== 'classic') return;
    if (p.emergenciesLeft <= 0 || now() < S.emergencyCdUntil) return;
    if (S.sab && (S.sab.kind === 'reactor' || S.sab.kind === 'o2')) return;
    var dev = S.map.devices.find(function (dv) { return dv.kind === 'emergency' && U.dist(p.x, p.y, dv.x, dv.y) < C.USE_RANGE * 1.4; });
    if (!dev) return;
    p.emergenciesLeft--;
    startMeeting(from, null);
  }

  /* -------- abilities -------- */

  function hostAbility(from, id) {
    var p = S.players[from];
    if (S.phase !== 'play' || p.dead || p.inVent) return;
    if (now() < p.abilityAt) return;
    var role = p.role;
    if (id === 'shoot' && role === 'sheriff') {
      var t = nearestPlayer(p, null, C.KILL_RANGE);
      if (!t) return;
      p.abilityAt = now() + 30000;
      hostEvent('sheriff', { by: from, x: p.x, y: p.y });
      if (isImp(t)) doKill(p, t, { noJump: true });
      else doKill(t, p, { ignoreShield: true, noJump: true }); // sheriff dies instead
    } else if (id === 'shield' && role === 'medic') {
      if (p.usedShield) return;
      var tgt = nearestPlayer(p, function (o) { return true; }, C.USE_RANGE * 1.4);
      if (!tgt) return;
      p.usedShield = true;
      tgt.shield = true;
      p.abilityAt = now() + 1e12;
      sendTo(from, { t: 'ev', d: { k: 'shieldOn', target: tgt.id } });
      sendTo(tgt.id, { t: 'ev', d: { k: 'shieldOn', target: tgt.id } });
      if (S.meId === from || S.meId === tgt.id) applyEvent({ k: 'shieldOn', target: tgt.id });
    } else if (id === 'track' && role === 'tracker') {
      var tt = nearestPlayer(p, null, C.USE_RANGE * 1.6);
      if (!tt) return;
      p.abilityAt = now() + 45000;
      p.trackId = tt.id; p.trackUntil = now() + 25000;
      sendTo(from, { t: 'ev', d: { k: 'track', target: tt.id, until: p.trackUntil } });
      if (from === S.meId) applyEvent({ k: 'track', target: tt.id, until: p.trackUntil });
    } else if (id === 'shift' && role === 'shapeshifter') {
      var st = nearestPlayer(p, function (o) { return !isImp(o); }, C.USE_RANGE * 2.2);
      if (!st) return;
      p.abilityAt = now() + 25000;
      p.morphId = st.id; p.morphUntil = now() + 15000;
      hostEvent('morph', { id: from, as: st.id, until: p.morphUntil });
    } else if (id === 'cloak' && role === 'phantom') {
      p.abilityAt = now() + 30000;
      p.cloakUntil = now() + 10000;
      hostEvent('cloak', { id: from, until: p.cloakUntil });
    } else if (id === 'vitals' && role === 'scientist') {
      p.abilityAt = now() + 12000;
      sendTo(from, { t: 'ev', d: { k: 'vitalsOpen' } });
      if (from === S.meId) applyEvent({ k: 'vitalsOpen' });
    } else if (id === 'vent' && role === 'engineer') {
      hostVentIn(from, true);
    }
  }

  /* -------- vents -------- */

  function canUseVents(p) {
    return isImp(p) || p.role === 'engineer';
  }

  function hostVentIn(from, viaAbility) {
    var p = S.players[from];
    if (S.phase !== 'play' || p.dead || p.inVent || !canUseVents(p)) return;
    if (S.mode === 'bombtag' || S.mode === 'sprint') return;
    if (p.role === 'engineer') {
      if (now() < p.abilityAt) return;
    }
    var v = S.map.vents.find(function (vv) { return U.dist(p.x, p.y, vv.x, vv.y) < C.USE_RANGE; });
    if (!v) return;
    p.inVent = v.id;
    p.ventEnterAt = now();
    p.x = v.x; p.y = v.y;
    hostEvent('vent', { id: from, vent: v.id, inV: true, x: v.x, y: v.y });
  }

  function hostVentTo(from, ventId) {
    var p = S.players[from];
    if (!p.inVent || S.phase !== 'play') return;
    var links = S.map.ventLinksOf(p.inVent);
    if (links.indexOf(ventId) < 0) return;
    var v = S.map.ventById(ventId);
    if (!v) return;
    p.inVent = v.id;
    p.x = v.x; p.y = v.y;
    hostEvent('vent', { id: from, vent: v.id, inV: true, move: true, x: v.x, y: v.y });
  }

  function hostVentOut(from) {
    var p = S.players[from];
    if (!p.inVent) return;
    var v = S.map.ventById(p.inVent);
    p.inVent = null;
    if (p.role === 'engineer') p.abilityAt = now() + 25000;
    hostEvent('vent', { id: from, vent: v ? v.id : null, inV: false, x: p.x, y: p.y });
  }

  /* -------- tasks / panels -------- */

  function spotById(id) { return S.map.taskSpots.find(function (s) { return s.id === id; }); }

  function hostSpotDone(from, spotId) {
    var p = S.players[from];
    var spot = spotById(spotId);
    if (!spot || S.phase !== 'play' && S.phase !== 'meeting') return;
    if (U.dist(p.x, p.y, spot.x, spot.y) > C.USE_RANGE * 2.2) return;
    if (spot.task.indexOf('sab_') === 0) return hostSabFixed(from, spot);
    var list = S.tasks[from] || [];
    var inst = list.find(function (t) { return !t.done && t.spotIds[t.step] === spotId; });
    if (!inst) return;
    inst.step++;
    if (inst.step >= inst.steps) inst.done = true;
    p.tasksDone += inst.done ? 1 : 0;
    recomputeTaskbar();
    // hide&seek: task completion burns time
    if (S.mode === 'hideseek' && S.hsEndsAt) S.hsEndsAt -= 6000;
    sendTo(from, { t: 'ev', d: { k: 'taskOk', spot: spotId, tasks: list } });
    if (from === S.meId) applyEvent({ k: 'taskOk', spot: spotId, tasks: list });
    hostEventOthers('taskbar', { v: Math.round(S.taskbar * 100) });
    if (S.mode === 'sprint') {
      var c = countTaskSteps(list);
      if (c.done >= c.total) return endGame('player', [from], p.name + ' finished every task!');
    }
    checkWin();
  }

  function hostPanelProg(from, spotId, prog) {
    var p = S.players[from];
    var spot = spotById(spotId);
    if (!spot || !S.sab) return;
    if (spot.task === 'sab_reactor' && S.sab.kind === 'reactor') {
      if (prog > 0 && U.dist(p.x, p.y, spot.x, spot.y) < C.USE_RANGE * 2.2) {
        S.reactorHolds[spotId] = { until: now() + 900, full: prog >= 0.99 };
      } else {
        delete S.reactorHolds[spotId];
      }
      // both consoles fully held?
      var consoles = S.map.taskSpots.filter(function (s) { return s.task === 'sab_reactor'; });
      var heldFull = consoles.filter(function (s) {
        var h = S.reactorHolds[s.id];
        return h && h.until > now() && h.full;
      });
      if (heldFull.length >= 2) sabFixed();
    }
  }

  function hostScan(from, on) {
    var p = S.players[from];
    if (p.dead) return;
    p.scanning = !!on && S.settings.visualTasks;
  }

  /* -------- sabotage -------- */

  function hostSabotage(from, kind) {
    var p = S.players[from];
    if (S.phase !== 'play' || p.dead || !isImp(p) || S.mode !== 'classic') return;
    if (S.sab || now() < S.sabCdUntil) return;
    if (['lights', 'reactor', 'o2', 'comms'].indexOf(kind) < 0) return;
    var sab = { kind: kind, endsAt: null };
    if (kind === 'reactor') sab.endsAt = now() + 40000;
    if (kind === 'o2') {
      sab.endsAt = now() + 35000;
      S.o2Done = {};
      S.o2Codes = {};
      S.map.taskSpots.filter(function (s) { return s.task === 'sab_o2'; }).forEach(function (s) {
        S.o2Codes[s.id] = String(Math.floor(10000 + Math.random() * 90000));
      });
      sab.codes = S.o2Codes;
    }
    S.sab = sab;
    S.reactorHolds = {};
    hostEvent('sab', { kind: kind, endsAt: sab.endsAt, codes: sab.codes || null });
  }

  function hostSabFixed(from, spot) {
    if (!S.sab) return;
    var k = S.sab.kind;
    if (spot.task === 'sab_lights' && k === 'lights') return sabFixed();
    if (spot.task === 'sab_comms' && k === 'comms') return sabFixed();
    if (spot.task === 'sab_o2' && k === 'o2') {
      S.o2Done[spot.id] = true;
      var all = S.map.taskSpots.filter(function (s) { return s.task === 'sab_o2'; });
      if (all.every(function (s) { return S.o2Done[s.id]; })) return sabFixed();
      hostEvent('toast', { text: 'O2 keypad accepted (' + Object.keys(S.o2Done).length + '/' + all.length + ')', kind: 'info' });
    }
  }

  function sabFixed() {
    if (!S.sab) return;
    S.sab = null;
    S.reactorHolds = {};
    S.sabCdUntil = now() + 30000;
    hostEvent('sabFix', {});
  }

  function hostDoors(from, roomId) {
    var p = S.players[from];
    if (S.phase !== 'play' || p.dead || !isImp(p)) return;
    if (S.mode !== 'classic') return;
    if (S.doorCds[roomId] && now() < S.doorCds[roomId]) return;
    var doors = Object.keys(S.map.doors).filter(function (id) { return S.map.doors[id].room === roomId; });
    if (!doors.length) return;
    S.doorCds[roomId] = now() + 25000;
    doors.forEach(function (id) { S.map.setDoor(id, true); S.map.doors[id].closedUntil = now() + 10000; });
    hostEvent('doors', { roomId: roomId, closed: true, doorIds: doors });
  }

  /* -------- meetings -------- */

  function startMeeting(reporter, bodyOf) {
    S.bodies = [];
    if (S.sab && (S.sab.kind === 'reactor' || S.sab.kind === 'o2')) { S.sab = null; hostEvent('sabFix', { silent: true }); }
    var ids = activeIds();
    var pos = spawnRing(S.map, ids);
    ids.forEach(function (id) {
      var p = S.players[id];
      p.x = pos[id].x; p.y = pos[id].y;
      p.inVent = null; p.scanning = false; p.buf = [];
      if (!p.isBot && id !== S.meId) sendTo(id, { t: 'ev', d: { k: 'teleport', x: p.x, y: p.y } });
    });
    S.meeting = {
      stage: 'intro', reporter: reporter, bodyOf: bodyOf || null,
      votes: {}, endsAt: now() + 3000,
    };
    setPhase('meeting');
    hostEventOthers('meeting', meetingPayload());
    applyEvent({ k: 'meeting', m: meetingPayload().m });
  }

  function meetingPayload() {
    var m = S.meeting;
    return {
      m: {
        stage: m.stage, endsAt: m.endsAt, reporter: m.reporter, bodyOf: m.bodyOf,
        votes: m.stage === 'reveal' && !S.settings.anonymousVotes ? m.votes :
          Object.keys(m.votes).reduce(function (acc, k) { acc[k] = true; return acc; }, {}),
        result: m.result || null,
      },
    };
  }

  function hostVote(from, target) {
    var m = S.meeting;
    if (!m || m.stage !== 'vote') return;
    var p = S.players[from];
    if (!p || p.dead || m.votes[from] != null) return;
    if (target !== 'skip' && (!S.players[target] || S.players[target].dead)) return;
    m.votes[from] = target;
    hostEventOthers('meeting', meetingPayload());
    applyEvent({ k: 'meeting', m: meetingPayload().m });
    AL.audio.sfx('vote_lock', { vol: 0.6 });
    var alive = aliveIds();
    if (alive.every(function (id) { return m.votes[id] != null || S.players[id].isBot; })) {
      // bots may still be "thinking"; force them to vote now
      alive.forEach(function (id) {
        if (S.players[id].isBot && m.votes[id] == null) botVoteNow(S.players[id]);
      });
      m.endsAt = Math.min(m.endsAt, now() + 1200);
    }
  }

  function meetingTick() {
    var m = S.meeting;
    if (!m) return;
    if (now() < m.endsAt) return;
    if (m.stage === 'intro') {
      m.stage = S.settings.discussTime > 0 ? 'discuss' : 'vote';
      m.endsAt = now() + (m.stage === 'discuss' ? S.settings.discussTime : S.settings.voteTime) * 1000;
      if (m.stage === 'vote') scheduleBotVotes();
    } else if (m.stage === 'discuss') {
      m.stage = 'vote';
      m.endsAt = now() + S.settings.voteTime * 1000;
      scheduleBotVotes();
    } else if (m.stage === 'vote') {
      // tally
      aliveIds().forEach(function (id) {
        if (S.players[id].isBot && m.votes[id] == null) botVoteNow(S.players[id]);
      });
      var counts = {};
      Object.keys(m.votes).forEach(function (voter) {
        var t = m.votes[voter];
        counts[t] = (counts[t] || 0) + 1;
      });
      var best = null, bestN = 0, tie = false;
      Object.keys(counts).forEach(function (t) {
        if (counts[t] > bestN) { best = t; bestN = counts[t]; tie = false; }
        else if (counts[t] === bestN) tie = true;
      });
      var ejected = (!tie && best && best !== 'skip') ? best : null;
      m.result = { ejected: ejected, tie: tie, counts: counts, skipped: best === 'skip' };
      m.stage = 'reveal';
      m.endsAt = now() + 4000;
    } else if (m.stage === 'reveal') {
      var r = m.result || {};
      var ep = r.ejected ? S.players[r.ejected] : null;
      if (ep) {
        ep.dead = true;
        recomputeTaskbar();
      }
      var ejectInfo = {
        playerId: ep ? ep.id : null,
        name: ep ? ep.name : null,
        color: ep ? ep.color : 0,
        roleRevealed: ep && S.settings.confirmEjects ? (isImp(ep) ? 'impostor' : (ep.role === 'jester' ? 'jester' : 'crew')) : null,
        tie: !!r.tie, skipped: !!r.skipped,
        remainingImps: S.settings.confirmEjects ? aliveImps().length : null,
      };
      S.meeting = null;
      setPhase('eject');
      hostEventOthers('eject', ejectInfo);
      applyEvent(Object.assign({ k: 'eject' }, ejectInfo));
      setTimeout(function () {
        if (!S) return;
        if (ep && ep.role === 'jester') return endGame('jester', [ep.id], ep.name + ' fooled you all!');
        if (checkWin()) return;
        // resume
        aliveIds().forEach(function (id) { S.players[id].killAt = now() + Math.min(S.settings.killCd * 1000, 15000); });
        S.graceUntil = now() + 5000;
        S.emergencyCdUntil = now() + S.settings.emergencyCd * 1000;
        setPhase('play');
        hostEventOthers('phase', { phase: 'play' });
        activeIds().forEach(function (id) {
          var p2 = S.players[id];
          if (!p2.isBot && id !== S.meId) sendTo(id, { t: 'ev', d: { k: 'teleport', x: p2.x, y: p2.y } });
        });
      }, 6000);
      return;
    }
    hostEventOthers('meeting', meetingPayload());
    applyEvent({ k: 'meeting', m: meetingPayload().m });
  }

  /* -------- win conditions / end -------- */

  function endGame(winnerTeam, winnerIds, reason) {
    if (!S || S.phase === 'end') return;
    var stats = S.order.map(function (id) {
      var p = S.players[id];
      return {
        id: id, name: p.name, color: p.color, role: p.role + (p.infected ? ' (infected)' : ''),
        tasksDone: p.tasksDone, kills: p.kills,
      };
    });
    var info = {
      winnerTeam: winnerTeam,
      winnerIds: winnerIds || [],
      winnerName: winnerIds && winnerIds.length === 1 && S.players[winnerIds[0]] ? S.players[winnerIds[0]].name : null,
      reason: reason || '',
      stats: stats,
    };
    S.endInfo = info;
    setPhase('end');
    hostEventOthers('end', info);
    applyEvent(Object.assign({ k: 'end' }, info));
    return true;
  }

  function checkWin() {
    if (!S || !S.isHost || S.phase === 'end' || S.phase === 'lobby') return false;
    var imps = aliveImps(), crew = aliveCrew();
    if (S.mode === 'classic') {
      if (S.taskTotal > 0 && S.taskDone >= S.taskTotal) return endGame('crew', crew.concat(S.order.filter(function (id) { return !isImp(S.players[id]) && S.players[id].dead; })), 'All tasks completed!');
      if (imps.length === 0) return endGame('crew', S.order.filter(function (id) { return !isImp(S.players[id]); }), 'All impostors eliminated!');
      if (imps.length >= crew.length) return endGame('impostor', S.order.filter(function (id) { return isImp(S.players[id]); }), 'The impostors took over.');
    } else if (S.mode === 'hideseek') {
      if (crew.length === 0) return endGame('impostor', imps, 'Every crewmate was found.');
    } else if (S.mode === 'outbreak') {
      var healthy = aliveIds().filter(function (id) { return !S.players[id].infected; });
      if (healthy.length === 0) return endGame('infected', aliveIds(), 'Everyone was infected!');
      if (S.taskTotal > 0 && S.taskDone >= S.taskTotal) return endGame('crew', healthy, 'The cure was completed!');
    } else if (S.mode === 'bombtag') {
      var alive = aliveIds();
      if (alive.length <= 1) return endGame('player', alive, alive.length ? S.players[alive[0]].name + ' survived the meteor!' : 'Nobody survived.');
    }
    return false;
  }

  /* ================================================================
     HOST TICK
     ================================================================ */

  function hostTickWrap() {
    try { hostTick(); } catch (e) { console.warn('[game] tick', e); }
  }

  function hostTick() {
    if (!S) return;
    if (!S.isHost) return;
    var t = now();

    if (S.phase === 'meeting') { meetingTick(); botsTick(0.033); snapshot(); return; }
    if (S.phase !== 'play') { snapshot(); return; }

    // timers: morph / cloak expiry
    S.order.forEach(function (id) {
      var p = S.players[id];
      if (p.morphId && t > p.morphUntil) { p.morphId = null; hostEvent('morph', { id: id, as: null }); }
      if (p.inVent && p.role === 'engineer' && t - p.ventEnterAt > 12000) hostVentOut(id);
    });

    // sabotage countdowns
    if (S.sab && S.sab.endsAt && t > S.sab.endsAt) {
      var sk = S.sab.kind;
      S.sab = null;
      if (S.mode === 'classic') {
        endGame('impostor', S.order.filter(function (id) { return isImp(S.players[id]); }),
          sk === 'reactor' ? 'The reactor melted down.' : 'The crew ran out of oxygen.');
        return;
      }
    }
    // doors reopen
    Object.keys(S.map.doors).forEach(function (id) {
      var d = S.map.doors[id];
      if (d.closed && t > d.closedUntil) {
        S.map.setDoor(id, false);
        hostEvent('doors', { roomId: d.room, closed: false, doorIds: [id] });
      }
    });

    // hide & seek timer
    if (S.mode === 'hideseek' && S.hsEndsAt) {
      var left = S.hsEndsAt - t;
      AL.audio.setMusicParam('intensity', left < 25000 ? 1 : U.clamp(1 - left / (S.settings.hideTime * 1000), 0, 0.5));
      if (left <= 0) {
        return void endGame('crew', aliveCrew(), 'The crew survived!');
      }
    }

    // bomb tag
    if (S.mode === 'bombtag' && S.bomb) {
      var holder = S.players[S.bomb.holderId];
      if (!holder || holder.dead) { newBomb(); }
      else {
        // contact transfer
        if (t > S.bomb.immuneUntil) {
          var near = nearestPlayer(holder, null, C.PLAYER_R * 2 + 6);
          if (near) {
            S.bomb.holderId = near.id;
            S.bomb.immuneUntil = t + 900;
            hostEvent('bomb', { holderId: near.id, endsAt: S.bomb.endsAt });
          }
        }
        if (t > S.bomb.endsAt) {
          var hp = S.players[S.bomb.holderId];
          hp.dead = true;
          hostEvent('boom', { id: hp.id, x: hp.x, y: hp.y });
          S.bomb = null;
          if (!checkWin()) setTimeout(function () { if (S && S.phase === 'play') newBomb(); }, 3000);
        }
      }
    }

    // sprint chaos events
    if (S.mode === 'sprint') {
      if (t - S.lastChaosAt > 35000) {
        S.lastChaosAt = t;
        S.chaosWarnAt = t;
        S.chaosUntil = t + 8000; // 2s warn + 6s dark
        hostEvent('chaos', { until: S.chaosUntil });
      }
    }

    // scan visual check (auto-managed client-side via scanStart/Stop)
    botsTick(0.033);
    snapshot();
  }

  function newBomb() {
    var alive = aliveIds();
    if (!alive.length) return;
    var id = alive[Math.floor(Math.random() * alive.length)];
    S.bomb = { holderId: id, endsAt: now() + 25000, immuneUntil: now() + 1500 };
    hostEvent('bomb', { holderId: id, endsAt: S.bomb.endsAt });
  }

  /* ================================================================
     SNAPSHOTS + EVENTS
     ================================================================ */

  function hostEvent(k, data) {
    var d = Object.assign({ k: k }, data);
    hostEventOthers(k, data);
    applyEvent(d);
  }
  function hostEventOthers(k, data) {
    broadcast({ t: 'ev', d: Object.assign({ k: k }, data) });
  }

  function snapshot() {
    S.snapCount++;
    if (S.snapCount % 2 !== 0) return; // 15Hz
    if (!S.online) return;
    var arr = S.order.map(function (id) {
      var p = S.players[id];
      return [id, Math.round(p.x), Math.round(p.y), p.dir, p.moving ? 1 : 0,
        p.inVent ? 1 : 0, p.dead ? 1 : 0, now() < p.cloakUntil ? 1 : 0,
        p.morphId || 0, p.scanning ? 1 : 0];
    });
    broadcast({
      t: 'snap',
      d: {
        p: arr,
        sab: S.sab ? { k: S.sab.kind, e: S.sab.endsAt } : null,
        tb: Math.round(S.taskbar * 100),
        hs: S.hsEndsAt ? Math.max(0, S.hsEndsAt - now()) : null,
        bomb: S.bomb ? { h: S.bomb.holderId, e: S.bomb.endsAt } : null,
        chaos: S.chaosUntil > now() ? S.chaosUntil - now() : null,
        bodies: S.bodies.map(function (b) { return [b.id, b.color, Math.round(b.x), Math.round(b.y)]; }),
        sprint: S.mode === 'sprint' ? sprintRanks() : null,
        inf: S.mode === 'outbreak' ? { i: aliveIds().filter(function (id) { return S.players[id].infected; }).length, t: aliveIds().length } : null,
      },
    });
  }

  function sprintRanks() {
    return S.order.filter(function (id) { return !S.players[id].disconnected; }).map(function (id) {
      var c = countTaskSteps(S.tasks[id] || []);
      return { id: id, name: S.players[id].name, color: S.players[id].color, done: c.done, total: c.total };
    }).sort(function (a, b) { return b.done - a.done; });
  }

  function applySnap(d) {
    if (!S || !d) return;
    var t = now();
    (d.p || []).forEach(function (row) {
      var p = S.players[row[0]];
      if (!p) return;
      if (row[0] !== S.meId) {
        p.buf.push({ t: t, x: row[1], y: row[2], dir: row[3], moving: !!row[4] });
        if (p.buf.length > 20) p.buf.shift();
      }
      p.inVent = row[5] ? 'v' : null;
      var wasDead = p.dead;
      p.dead = !!row[6];
      p.cloaked = !!row[7];
      p.morphId = row[8] || null;
      p.scanning = !!row[9];
    });
    S.remoteSab = d.sab || null;
    if (d.sab && !S.sab) S.sab = { kind: d.sab.k, endsAt: d.sab.e };
    else if (!d.sab) S.sab = null;
    else { S.sab.kind = d.sab.k; S.sab.endsAt = d.sab.e; }
    S.taskbar = (d.tb || 0) / 100;
    S.hsLeft = d.hs;
    S.bomb = d.bomb ? { holderId: d.bomb.h, endsAt: d.bomb.e } : null;
    S.chaosUntil = d.chaos ? now() + d.chaos : 0;
    S.bodies = (d.bodies || []).map(function (b) { return { id: b[0], color: b[1], x: b[2], y: b[3] }; });
    S.sprintRanks = d.sprint || null;
    S.infection = d.inf || null;
  }

  // Shared event application (host applies locally; clients apply from net)
  function applyEvent(d) {
    if (!S || !d) return;
    var k = d.k;
    var me = myP();
    switch (k) {
      case 'countdown':
        AL.audio.sfx('countdown');
        bus.emit('game:countdown', { n: d.n });
        break;
      case 'phase':
        if (!S.isHost) setPhase(d.phase);
        break;
      case 'chat':
        bus.emit('game:chat', d.c);
        if (d.c.from !== S.meId) AL.audio.sfx('chat', { vol: 0.5 });
        break;
      case 'toast':
        bus.emit('game:toast', { text: d.text, kind: d.kind || 'info' });
        break;
      case 'pupdate': {
        var pu = S.players[d.id];
        if (pu) { if (d.dead != null) pu.dead = d.dead; if (d.disconnected != null) pu.disconnected = d.disconnected; }
        break;
      }
      case 'teleport':
        if (me) { me.x = d.x; me.y = d.y; }
        break;
      case 'kill': {
        var vic = S.players[d.victimId];
        if (vic) {
          vic.dead = true;
          if (!S.isHost && d.body) S.bodies.push({ id: 'b' + d.victimId, of: d.victimId, color: vic.color, x: d.x, y: d.y });
          if (!S.isHost && S.players[d.killerId]) { S.players[d.killerId].x = d.x; S.players[d.killerId].y = d.y; }
        }
        var dd = me ? U.dist(me.x, me.y, d.x, d.y) : 1e9;
        AL.audio.sfx('kill', { vol: U.clamp(1.2 - dd / 900, 0.05, 1) });
        bus.emit('game:kill', { victimId: d.victimId, x: d.x, y: d.y, youVictim: d.victimId === S.meId, youKiller: d.killerId === S.meId });
        break;
      }
      case 'convert': {
        var cv = S.players[d.id];
        if (cv) cv.infected = true;
        AL.audio.sfx('shift', { vol: 0.8 });
        if (AL.render) AL.render.spawnParticles('ecto', d.x, d.y);
        if (d.id === S.meId) {
          bus.emit('game:toast', { text: 'You have been INFECTED! Convert the others.', kind: 'warn' });
          if (me) { me.infected = true; me.killAt = now() + 30000; }
        }
        break;
      }
      case 'shield':
        AL.audio.sfx('shield_break', { vol: 0.8 });
        if (AL.render) AL.render.spawnParticles('shieldBreak', d.x, d.y);
        break;
      case 'shieldOn':
        AL.audio.sfx('shield_on');
        if (d.target === S.meId) bus.emit('game:toast', { text: 'The Medic shielded you!', kind: 'info' });
        else bus.emit('game:toast', { text: 'Shield applied.', kind: 'info' });
        if (S.players[d.target] && !S.isHost) S.players[d.target].shield = true;
        break;
      case 'sheriff':
        AL.audio.sfx('sheriff_shot', { vol: 0.9 });
        break;
      case 'track':
        S.trackTarget = d.target; S.trackUntil = d.until;
        bus.emit('game:toast', { text: 'Tracking ' + (S.players[d.target] ? S.players[d.target].name : '???'), kind: 'info' });
        break;
      case 'morph': {
        var mp = S.players[d.id];
        if (mp) { mp.morphId = d.as; mp.morphUntil = d.until || 0; }
        if (d.id === S.meId || (me && isImpMe())) AL.audio.sfx('shift', { vol: 0.6 });
        break;
      }
      case 'cloak': {
        var cp = S.players[d.id];
        if (cp) cp.cloakUntil = d.until;
        AL.audio.sfx(d.until > now() ? 'cloak' : 'uncloak', { vol: 0.5 });
        break;
      }
      case 'vitalsOpen':
        bus.emit('game:panel', { open: true, kind: 'device', device: 'vitals' });
        break;
      case 'vent': {
        var vp = S.players[d.id];
        if (vp) {
          vp.inVent = d.inV ? d.vent : null;
          vp.x = d.x; vp.y = d.y;
          if (!S.isHost) vp.buf = [];
        }
        var vd = me ? U.dist(me.x, me.y, d.x, d.y) : 1e9;
        AL.audio.sfx(d.move ? 'vent_move' : (d.inV ? 'vent_in' : 'vent_out'), { vol: U.clamp(1 - vd / 700, 0, 0.9) });
        if (AL.render && vd < 900) AL.render.spawnParticles('dust', d.x, d.y);
        break;
      }
      case 'taskOk':
        if (d.tasks) S.myTasks = d.tasks;
        AL.audio.sfx('task_done');
        bus.emit('game:tasks', { tasks: S.myTasks, taskbar: taskbarShown() });
        if (S.myTasks.every(function (tt) { return tt.done; }) && S.myTasks.length) AL.audio.sfx('task_all_done');
        break;
      case 'taskbar':
        if (!S.isHost) S.taskbar = (d.v || 0) / 100;
        bus.emit('game:tasks', { tasks: S.myTasks, taskbar: taskbarShown() });
        break;
      case 'sab': {
        if (!S.isHost) S.sab = { kind: d.kind, endsAt: d.endsAt, codes: d.codes };
        else if (S.sab) S.sab.codes = d.codes;
        bus.emit('game:sab', { kind: d.kind, endsAt: d.endsAt });
        AL.audio.duck(800);
        AL.audio.sfx('body_report', { vol: 0.5 });
        if (sabAlarmHandle) { sabAlarmHandle.stop(); sabAlarmHandle = null; }
        if (d.kind === 'reactor' || d.kind === 'o2') sabAlarmHandle = AL.audio.sfx('sab_alarm', { loop: true, vol: 0.6 });
        bus.emit('game:toast', {
          text: { lights: 'Lights sabotaged!', reactor: 'REACTOR MELTDOWN — hold both consoles!', o2: 'OXYGEN DEPLETED — enter both codes!', comms: 'Comms sabotaged!' }[d.kind] || 'Sabotage!',
          kind: 'warn',
        });
        break;
      }
      case 'sabFix':
        if (!S.isHost) S.sab = null;
        if (sabAlarmHandle) { sabAlarmHandle.stop(); sabAlarmHandle = null; }
        if (!d.silent) AL.audio.sfx('sab_fixed');
        bus.emit('game:sab', { kind: null, endsAt: null, fixed: true });
        break;
      case 'doors': {
        if (!S.isHost && S.map && d.doorIds) d.doorIds.forEach(function (id) { S.map.setDoor(id, d.closed); });
        if (d.closed) {
          var room = S.map ? S.map.rooms.find(function (r) { return r.id === d.roomId; }) : null;
          AL.audio.sfx('door_close', { vol: 0.7 });
          bus.emit('game:doors', { roomId: d.roomId, closed: d.closed });
          if (room && d.closed) bus.emit('game:toast', { text: room.name + ' doors closed', kind: 'warn' });
        }
        break;
      }
      case 'meeting': {
        var m = d.m;
        var prev = S.meetingView;
        S.meetingView = m;
        if (!S.isHost) {
          if (S.phase !== 'meeting' && m.stage !== 'reveal') setPhase('meeting');
          S.bodies = [];
          if (me && S.startPosClient == null) { /* positions come via snap */ }
        }
        if (!prev || prev.stage !== m.stage) {
          if (m.stage === 'intro') { AL.audio.sfx(m.bodyOf ? 'body_report' : 'emergency'); if (sabAlarmHandle) { sabAlarmHandle.stop(); sabAlarmHandle = null; } }
          if (m.stage === 'vote') AL.audio.sfx('meeting_chime');
        }
        bus.emit('game:meeting', {
          stage: m.stage, endsAt: m.endsAt, reporter: m.reporter, bodyOf: m.bodyOf,
          votes: m.votes, canVote: !!(me && !me.dead && m.stage === 'vote' && m.votes[S.meId] == null),
          myVote: m.votes ? m.votes[S.meId] : null, result: m.result,
        });
        break;
      }
      case 'eject':
        if (!S.isHost) {
          setPhase('eject');
          if (d.playerId && S.players[d.playerId]) S.players[d.playerId].dead = true;
        }
        S.meetingView = null;
        AL.audio.sfx('eject');
        bus.emit('game:eject', d);
        break;
      case 'bomb':
        if (!S.isHost) S.bomb = { holderId: d.holderId, endsAt: d.endsAt };
        AL.audio.sfx('bomb_pass', { vol: 0.7 });
        if (d.holderId === S.meId) bus.emit('game:toast', { text: 'YOU have the bomb! Pass it!', kind: 'warn' });
        break;
      case 'boom': {
        if (S.players[d.id]) S.players[d.id].dead = true;
        AL.audio.sfx('explode');
        if (AL.render) { AL.render.spawnParticles('explosion', d.x, d.y); AL.render.flash('#ff9d2e', 260); }
        if (d.id === S.meId) bus.emit('game:toast', { text: 'BOOM. You are out — spectate the survivors!', kind: 'warn' });
        break;
      }
      case 'chaos':
        S.chaosUntil = d.until;
        bus.emit('game:toast', { text: 'Power flickering...', kind: 'warn' });
        break;
      case 'end': {
        if (!S.isHost) setPhase('end');
        if (sabAlarmHandle) { sabAlarmHandle.stop(); sabAlarmHandle = null; }
        var win = d.winnerIds && d.winnerIds.indexOf(S.meId) >= 0;
        if (d.winnerTeam === 'crew' && me && !isImpMe() && !win) win = true;
        AL.audio.playMusic(win ? 'win' : 'lose');
        bus.emit('game:end', { winnerTeam: d.winnerTeam, winnerName: d.winnerName, winnerIds: d.winnerIds, reason: d.reason, stats: d.stats });
        break;
      }
    }
  }

  /* ================================================================
     LOCAL PLAYER (prediction + input application)
     ================================================================ */

  function myP() { return S ? S.players[S.meId] : null; }
  function isImpMe() {
    var me = myP();
    if (!me) return false;
    if (S.isHost) return isImp(me);
    return AL.roles.isImpostor(S.myRole) || me.infected;
  }
  function myRole() {
    var me = myP();
    return S.isHost ? (me ? me.role : 'crewmate') : (S.myRole || 'crewmate');
  }

  function mySpeed() {
    var sp = C.SPEED * S.settings.speed;
    if (S.mode === 'hideseek' && isImpMe()) {
      sp *= (S.hsLeftNow() < 25000 ? 1.18 : 1.08);
    }
    if (S.bomb && S.bomb.holderId === S.meId) sp *= 1.15;
    return sp;
  }

  function moveLocal(dt) {
    var me = myP();
    if (!me || !S.map) return;
    if (me.dead) {
      // ghosts fly free
      var inp = AL.engine.input;
      me.moving = !!(inp.moveX || inp.moveY);
      if (me.moving) me.dir = inp.moveX < 0 ? -1 : (inp.moveX > 0 ? 1 : me.dir);
      me.x = U.clamp(me.x + inp.moveX * C.SPEED * 1.3 * dt, 0, S.map.worldW);
      me.y = U.clamp(me.y + inp.moveY * C.SPEED * 1.3 * dt, 0, S.map.worldH);
      return;
    }
    if (S.phase !== 'play' || me.inVent || S.panel || now() < me.freezeUntil) { me.moving = false; return; }
    var inp2 = AL.engine.input;
    var mx = inp2.moveX, myy = inp2.moveY;
    me.moving = !!(mx || myy);
    if (mx) me.dir = mx < 0 ? -1 : 1;
    if (me.moving) {
      var sp = mySpeed();
      var res = AL.engine.moveCircle(S.map, me.x, me.y, mx * sp * dt, myy * sp * dt, C.PLAYER_R);
      me.x = res.x; me.y = res.y;
      // footsteps
      stepDist += U.dist(0, 0, mx * sp * dt, myy * sp * dt);
      if (stepDist > 42) {
        stepDist = 0;
        stepPhase = 1 - stepPhase;
        AL.audio.sfx(stepPhase ? 'step_a' : 'step_b', { vol: 0.55 });
      }
    }
    // scan auto-detect
    var role = myRole();
    if (!isImpMe()) {
      var scanInst = (S.myTasks || []).find(function (tt) { return tt.taskId === 'scan' && !tt.done; });
      // scanning visual is triggered by opening the scan panel; handled via panel events
    }
  }

  function sendPos() {
    if (!S || S.isHost || S.phase !== 'play') return;
    var me = myP();
    if (!me || me.dead) return;
    broadcast({ t: 'pos', d: [Math.round(me.x), Math.round(me.y), me.dir, me.moving ? 1 : 0] });
  }

  function interpPos(p) {
    if (p.id === S.meId) return p;
    var buf = p.buf;
    if (!buf || buf.length === 0) return p;
    var target = now() - C.INTERP_MS;
    var a = null, b = null;
    for (var i = buf.length - 1; i >= 0; i--) {
      if (buf[i].t <= target) { a = buf[i]; b = buf[i + 1] || null; break; }
    }
    if (!a) { a = buf[0]; b = buf[1] || null; }
    if (b && b.t > a.t) {
      var f = U.clamp((target - a.t) / (b.t - a.t), 0, 1);
      p.x = U.lerp(a.x, b.x, f);
      p.y = U.lerp(a.y, b.y, f);
      p.dir = f > 0.5 ? b.dir : a.dir;
      p.moving = b.moving;
    } else {
      p.x = a.x; p.y = a.y; p.dir = a.dir;
      p.moving = now() - a.t < 300 ? a.moving : false;
    }
    return p;
  }

  /* ================================================================
     FRAME / HUD (pull interfaces)
     ================================================================ */

  S && 0; // noop

  function hsLeftNow() {
    if (!S) return 0;
    if (S.isHost) return S.hsEndsAt ? Math.max(0, S.hsEndsAt - now()) : 0;
    return S.hsLeft || 0;
  }

  function visionInfo() {
    var me = myP();
    var role = myRole();
    var imp = isImpMe();
    var base = imp ? C.VISION_IMP * S.settings.impVision : C.VISION_CREW * S.settings.crewVision;
    if (S.mode === 'hideseek') base *= imp ? 1.6 : 0.6;
    var dark = 0;
    if (S.sab && S.sab.kind === 'lights' && !imp) base *= 0.35;
    if (S.chaosUntil && now() < S.chaosUntil && now() > S.chaosUntil - 6000) base *= 0.5;
    return { r: base * C.TILE, dark: dark };
  }

  function getFrame() {
    var t = U.now();
    var dt = Math.min(0.05, (t - lastFrameT) / 1000) || 0.016;
    lastFrameT = t;
    if (!S || S.phase === 'menu' || S.phase === 'lobby' || !S.map) {
      AL.game.lastFrame = { t: t, phase: S ? S.phase : 'menu', map: null, me: null, players: [], bodies: [], vision: { r: 0, dark: 0 } };
      return AL.game.lastFrame;
    }
    moveLocal(dt);
    var me = myP();
    var reveal = S.mode === 'hideseek' || S.phase === 'end';
    var imp = isImpMe();
    var players = S.order.map(function (id) {
      var p = S.players[id];
      if (p.disconnected) return null;
      if (id !== S.meId) interpPos(p);
      var cloaked = p.cloaked || (p.cloakUntil && now() < p.cloakUntil);
      var alpha = 1;
      if (p.dead) alpha = (id === S.meId || (me && me.dead)) ? 0.55 : 0;
      else if (cloaked) {
        if (id === S.meId) alpha = 0.45;
        else if (imp) alpha = 0.45;
        else {
          var dd = me ? U.dist(me.x, me.y, p.x, p.y) : 1e9;
          alpha = dd < C.TILE * 3 ? 0.10 : 0;
        }
      }
      var morphSrc = p.morphId ? S.players[p.morphId] : null;
      var roleTag = null, roleTagColor = null;
      var isSeeker = S.isHost ? isImp(p) : (id === S.meId ? imp : ((S.seekers || []).indexOf(id) >= 0 || p.infected));
      if (S.mode === 'hideseek' && isSeeker) { roleTag = 'SEEKER'; roleTagColor = '#ff3860'; }
      var isMate = S.isHost ? isImp(p) : ((S.myMates || []).indexOf(id) >= 0 || p.infected);
      if (imp && !p.dead && id !== S.meId && isMate) { roleTag = roleTag || 'IMPOSTOR'; roleTagColor = '#ff3860'; }
      if (S.mode === 'outbreak' && p.infected) { roleTag = 'INFECTED'; roleTagColor = '#3ee06f'; }
      return {
        id: id, name: morphSrc ? morphSrc.name : p.name,
        color: morphSrc ? morphSrc.color : p.color,
        hat: morphSrc ? morphSrc.hat : p.hat,
        pet: p.pet, skin: morphSrc ? morphSrc.skin : p.skin,
        x: p.x, y: p.y, dir: p.dir, moving: p.moving,
        dead: p.dead, inVent: !!p.inVent, alpha: alpha,
        morphColor: null, isMe: id === S.meId,
        roleTag: roleTag, roleTagColor: roleTagColor,
        scanning: p.scanning,
        petX: p.x - 40 * p.dir, petY: p.y + 2,
      };
    }).filter(Boolean);
    var meP = me ? {
      id: me.id, x: me.x, y: me.y, dir: me.dir, moving: me.moving, dead: me.dead,
      role: myRole(), team: imp ? 'impostor' : 'crew', inVent: !!me.inVent,
      color: me.color, hat: me.hat, pet: me.pet, skin: me.skin,
      cloaked: me.cloakUntil && now() < me.cloakUntil, morphColor: null,
    } : null;
    AL.game.lastFrame = {
      t: t, phase: S.phase, mode: S.mode, mapId: S.mapId, map: S.map,
      me: meP, players: players,
      bodies: S.bodies,
      vision: visionInfo(),
      revealRoles: reveal,
      sab: S.sab ? { kind: S.sab.kind, endsAt: S.sab.endsAt } : null,
      taskSpotsMine: myNextSpotIds(),
      bomb: S.bomb ? { holderId: S.bomb.holderId, endsAt: S.bomb.endsAt } : null,
      camsWatched: false,
    };
    return AL.game.lastFrame;
  }

  function myNextSpotIds() {
    if (isImpMe()) return [];
    var out = [];
    (S.myTasks || []).forEach(function (tk) {
      if (!tk.done) out.push(tk.spotIds[tk.step]);
    });
    return out;
  }

  function nearestUse() {
    var me = myP();
    if (!me || me.dead && S.mode !== 'hideseek' && false) return null;
    if (!me) return null;
    // ghosts can still do tasks
    var best = null, bd = C.USE_RANGE;
    // my task spots
    var mine = myNextSpotIds();
    S.map.taskSpots.forEach(function (sp) {
      var d = U.dist(me.x, me.y, sp.x, sp.y);
      if (d > bd) return;
      if (mine.indexOf(sp.id) >= 0) {
        best = { kind: 'task', spotId: sp.id, taskId: sp.task, label: (AL.tasks.DEFS[sp.task] || {}).name || sp.task };
        bd = d;
      } else if (S.sab && sp.task === 'sab_' + S.sab.kind && !me.dead) {
        best = { kind: 'sab', spotId: sp.id, taskId: sp.task, label: (AL.tasks.DEFS[sp.task] || {}).name || 'Fix' };
        bd = d;
      }
    });
    if (!me.dead) {
      S.map.devices.forEach(function (dv) {
        var d = U.dist(me.x, me.y, dv.x, dv.y);
        if (d > bd && !(dv.kind === 'emergency' && d < C.USE_RANGE * 1.4)) return;
        if (S.sab && S.sab.kind === 'comms' && (dv.kind === 'admin' || dv.kind === 'cams')) return;
        if (dv.kind === 'emergency' && S.mode !== 'classic') return;
        var labels = { emergency: 'Emergency', admin: 'Admin Map', cams: 'Cameras', vitals: 'Vitals' };
        best = { kind: 'device', device: dv.kind, label: labels[dv.kind] };
        bd = Math.min(bd, d);
      });
    }
    return best;
  }

  function myTasksHud() {
    return (S.myTasks || []).map(function (tk) {
      var roomName = '';
      var sp = spotById(tk.spotIds[Math.min(tk.step, tk.spotIds.length - 1)]);
      if (sp) {
        var rm = S.map.rooms.find(function (r) { return r.id === sp.room; });
        roomName = rm ? rm.name : '';
      }
      return { name: tk.name, room: roomName, done: tk.done, step: tk.step, steps: tk.steps, progress: tk.steps ? tk.step / tk.steps : 0 };
    });
  }

  function taskbarShown() {
    if (S.settings.taskbar === 'never') return null;
    if (S.settings.taskbar === 'meetings' && S.phase !== 'meeting') return null;
    return S.taskbar;
  }

  function getHud() {
    if (!S || !S.map || S.phase === 'lobby' || S.phase === 'menu') {
      return { phase: S ? S.phase : 'menu', mode: S ? S.mode : null };
    }
    var me = myP();
    if (!me) return { phase: S.phase, mode: S.mode };
    var imp = isImpMe();
    var role = myRole();
    var rd = AL.roles.DEFS[role] || {};
    var ability = null;
    if (rd.abilities && rd.abilities.length && !me.dead) {
      var ab = rd.abilities[0];
      var cdLeft = Math.max(0, (me.abilityAt - now()) / 1000);
      if (role === 'medic' && me.usedShield) ability = { id: ab.id, name: ab.name, cd: 0, ready: false, once: true, used: true };
      else ability = { id: ab.id, name: ab.name, cd: Math.ceil(cdLeft), ready: cdLeft <= 0, once: !!ab.once };
    }
    var use = (S.phase === 'play' && !me.inVent && !S.panel) ? nearestUse() : null;
    if (me.dead && use && use.kind !== 'task') use = null;
    var canKill = null;
    if (imp && !me.dead && S.mode !== 'bombtag' && S.mode !== 'sprint') {
      var kcd = Math.max(0, (me.killAt - now()) / 1000);
      canKill = { cd: Math.ceil(kcd), ready: kcd <= 0 && S.phase === 'play' };
    }
    var canReport = false;
    if (!me.dead && S.mode === 'classic' && S.phase === 'play') {
      canReport = S.bodies.some(function (b) { return U.dist(me.x, me.y, b.x, b.y) < C.REPORT_RANGE; });
    }
    var vent = null;
    if (!me.dead && (imp || role === 'engineer') && S.phase === 'play' && S.mode !== 'bombtag' && S.mode !== 'sprint') {
      if (me.inVent) vent = { in: true };
      else if (S.map.vents.some(function (v) { return U.dist(me.x, me.y, v.x, v.y) < C.USE_RANGE; })) vent = { in: false };
    }
    var timerText = null;
    if (S.mode === 'hideseek') timerText = U.fmtTime(hsLeftNow() / 1000);
    if (S.sab && S.sab.endsAt) timerText = U.fmtTime(Math.max(0, S.sab.endsAt - now()) / 1000);
    if (S.mode === 'bombtag' && S.bomb) timerText = U.fmtTime(Math.max(0, S.bomb.endsAt - now()) / 1000);
    var mv = S.isHost && S.meeting ? meetingPayload().m : S.meetingView;
    var room = S.map.roomAt(me.x, me.y);
    var trackArrow = null;
    if (S.trackTarget && now() < S.trackUntil && S.players[S.trackTarget]) {
      trackArrow = { x: S.players[S.trackTarget].x, y: S.players[S.trackTarget].y };
    }
    return {
      phase: S.phase, mode: S.mode, timerText: timerText, roomName: room ? room.name : '',
      dead: me.dead, isImpostor: imp, role: role,
      use: use ? { kind: use.kind, label: use.label } : null,
      kill: canKill, report: canReport, vent: vent, ability: ability,
      sabotage: imp && S.mode === 'classic' && !me.dead && S.phase === 'play',
      sabReady: !S.sab && now() >= S.sabCdUntil,
      sabCd: Math.max(0, Math.ceil((S.sabCdUntil - now()) / 1000)),
      sabActive: S.sab ? { kind: S.sab.kind, endsAt: S.sab.endsAt } : null,
      emergencyLeft: me.emergenciesLeft,
      tasks: myTasksHud(), taskbar: taskbarShown(),
      commsOut: !!(S.sab && S.sab.kind === 'comms' && !imp),
      ventLinks: me.inVent ? S.map.ventLinksOf(me.inVent).map(function (vid) {
        var v = S.map.ventById(vid);
        return { id: vid, x: v.x, y: v.y };
      }) : null,
      sprint: S.mode === 'sprint' ? (S.isHost ? sprintRanks() : S.sprintRanks) : null,
      infection: S.mode === 'outbreak' ? (S.isHost ? { infected: aliveIds().filter(function (id) { return S.players[id].infected; }).length, total: aliveIds().length } : (S.infection ? { infected: S.infection.i, total: S.infection.t } : null)) : null,
      bombMine: !!(S.bomb && S.bomb.holderId === S.meId),
      meeting: mv ? {
        stage: mv.stage, endsAt: mv.endsAt, reporter: mv.reporter, bodyOf: mv.bodyOf,
        votes: mv.votes || {}, result: mv.result || null,
        canVote: !!(me && !me.dead && mv.stage === 'vote' && !(mv.votes && mv.votes[S.meId] != null)),
        myVote: mv.votes ? mv.votes[S.meId] : null,
        anonymous: S.settings.anonymousVotes,
      } : null,
      trackArrow: trackArrow,
      mates: S.isHost ? (imp ? S.order.filter(function (id) { return id !== S.meId && isImp(S.players[id]); }) : []) : (S.myMates || []),
      settings: S.settings,
      players: publicPlayers(),
      meId: S.meId,
      o2Codes: S.sab && S.sab.kind === 'o2' ? (S.sab.codes || S.o2Codes) : null,
    };
  }

  function getDeviceData(kind) {
    if (!S || !S.map) return null;
    if (kind === 'admin') {
      var counts = {};
      S.order.forEach(function (id) {
        var p = S.players[id];
        if (p.dead || p.disconnected || p.inVent) return;
        var r = S.map.roomAt(p.x, p.y);
        if (r) counts[r.id] = (counts[r.id] || 0) + 1;
      });
      return {
        rooms: S.map.rooms.map(function (r) { return { id: r.id, name: r.name, count: counts[r.id] || 0 }; }),
      };
    }
    if (kind === 'vitals') {
      return S.order.map(function (id) {
        var p = S.players[id];
        return { id: id, name: p.name, color: p.color, dead: p.dead, disconnected: p.disconnected };
      });
    }
    if (kind === 'cams') {
      var spots = [];
      S.map.rooms.forEach(function (r, i) {
        if (i % 3 !== 0 || spots.length >= 4) return;
        var rc = r.rects[0];
        spots.push({ x: (rc[0] + rc[2] / 2) * C.TILE, y: (rc[1] + rc[3] / 2) * C.TILE, room: r.name });
      });
      while (spots.length < 4 && S.map.rooms[spots.length]) {
        var rr = S.map.rooms[spots.length].rects[0];
        spots.push({ x: (rr[0] + rr[2] / 2) * C.TILE, y: (rr[1] + rr[3] / 2) * C.TILE, room: S.map.rooms[spots.length].name });
      }
      return { spots: spots.slice(0, 4) };
    }
    return null;
  }

  /* ================================================================
     PLAYER-FACING ACTIONS (called by hud/ui)
     ================================================================ */

  function interact() {
    if (!S || !S.map || S.panel) return;
    var me = myP();
    if (!me) return;
    var use = nearestUse();
    if (!use) return;
    if (use.kind === 'device') {
      if (use.device === 'emergency') {
        bus.emit('game:panel', { open: true, kind: 'device', device: 'emergency' });
      } else {
        bus.emit('game:panel', { open: true, kind: 'device', device: use.device });
      }
      AL.audio.sfx('use');
      return;
    }
    // task or sab console
    var def = AL.tasks.DEFS[use.taskId];
    if (!def) return;
    var inst = (S.myTasks || []).find(function (tk) { return !tk.done && tk.spotIds[tk.step] === use.spotId; });
    S.panel = { spotId: use.spotId, taskId: use.taskId };
    var data = {};
    if (use.taskId === 'sab_o2') {
      var codes = S.sab ? (S.sab.codes || S.o2Codes) : {};
      data.code = codes ? codes[use.spotId] : '00000';
    }
    if (use.taskId === 'scan') act('scanStart');
    AL.audio.sfx('task_open');
    bus.emit('game:panel', {
      open: true, kind: 'task', taskId: use.taskId, spotId: use.spotId,
      data: data, step: inst ? inst.step : 0, steps: inst ? inst.steps : 1,
    });
  }

  function panelDone(spotId) {
    if (!S) return;
    if (S.panel && S.panel.taskId === 'scan') act('scanStop');
    S.panel = null;
    act('spotDone', { spot: spotId });
    bus.emit('game:panel', { open: false });
  }

  function panelClosed() {
    if (!S) return;
    if (S.panel) {
      if (S.panel.taskId === 'scan') act('scanStop');
      if (S.panel.taskId === 'sab_reactor') act('panelProg', { spot: S.panel.spotId, p: 0 });
    }
    S.panel = null;
    AL.audio.sfx('task_close', { vol: 0.6 });
  }

  function panelProgress(spotId, p) {
    if (!S) return;
    act('panelProg', { spot: spotId, p: p });
  }

  /* ================================================================
     BOTS
     ================================================================ */

  function botPathTo(map, p, tx, ty) {
    // BFS from player's tile to target tile; returns [{x,y} world centers]
    var W = map.W, H = map.H;
    var sx = Math.floor(p.x / C.TILE), sy = Math.floor(p.y / C.TILE);
    if (sx === tx && sy === ty) return [];
    var prev = new Int32Array(W * H).fill(-1);
    var seen = new Uint8Array(W * H);
    var q = [sy * W + sx];
    seen[sy * W + sx] = 1;
    var qi = 0, found = -1, tgt = ty * W + tx;
    while (qi < q.length) {
      var cur = q[qi++];
      if (cur === tgt) { found = cur; break; }
      var cx = cur % W, cy = (cur / W) | 0;
      for (var d = 0; d < 4; d++) {
        var nx = cx + [1, -1, 0, 0][d], ny = cy + [0, 0, 1, -1][d];
        if (nx < 0 || ny < 0 || nx >= W || ny >= H) continue;
        var ni = ny * W + nx;
        if (seen[ni] || map.isSolid(nx, ny)) continue;
        seen[ni] = 1; prev[ni] = cur;
        q.push(ni);
      }
    }
    if (found < 0) return null;
    var path = [];
    var node = found;
    while (node !== sy * W + sx && node >= 0) {
      path.push({ x: (node % W + 0.5) * C.TILE, y: (((node / W) | 0) + 0.5) * C.TILE });
      node = prev[node];
    }
    path.reverse();
    return path;
  }

  function randFloorTile(map) {
    for (var i = 0; i < 60; i++) {
      var tx = 1 + Math.floor(Math.random() * (map.W - 2));
      var ty = 1 + Math.floor(Math.random() * (map.H - 2));
      if (map.isFloor(tx, ty) && !map.isSolid(tx, ty)) return { tx: tx, ty: ty };
    }
    return { tx: map.spawn.tx, ty: map.spawn.ty };
  }

  function botsTick(dt) {
    if (!S.isHost) return;
    var t = now();
    S.order.forEach(function (id) {
      var p = S.players[id];
      if (!p.isBot || p.disconnected) return;
      var B = p.bot;
      if (!B) return;
      if (S.phase === 'meeting') { p.moving = false; return; }
      if (p.dead) {
        // dead crew bots keep "doing" tasks off-screen for taskbar realism
        if (!isImp(p) && Math.random() < 0.0012) botFinishRandomTask(p);
        p.moving = false;
        return;
      }
      if (now() < p.freezeUntil) { p.moving = false; return; }
      var imp = isImp(p);

      // pick behavior
      if (S.mode === 'bombtag') return botBombTag(p, B, dt);
      if (imp) botImpostor(p, B, dt, t);
      else botCrew(p, B, dt, t);
      botWalk(p, B, dt);
    });
  }

  function botWalk(p, B, dt) {
    if (!B.path || B.pathI >= B.path.length) { p.moving = false; return; }
    var node = B.path[B.pathI];
    var dx = node.x - p.x, dy = node.y - p.y;
    var dd = Math.sqrt(dx * dx + dy * dy);
    if (dd < 10) { B.pathI++; return; }
    var sp = C.SPEED * S.settings.speed * (isImp(p) && S.mode === 'hideseek' ? 1.08 : 0.92);
    if (S.bomb && S.bomb.holderId === p.id) sp *= 1.15;
    p.x += dx / dd * sp * dt;
    p.y += dy / dd * sp * dt;
    p.dir = dx < 0 ? -1 : 1;
    p.moving = true;
    p.buf.push({ t: now(), x: p.x, y: p.y, dir: p.dir, moving: true });
    if (p.buf.length > 8) p.buf.shift();
  }

  function botGoto(p, B, tx, ty, state) {
    var path = botPathTo(S.map, p, tx, ty);
    if (path === null) { B.state = 'idle'; B.path = null; return false; }
    B.path = path; B.pathI = 0; B.state = state || 'goto';
    return true;
  }

  function botFinishRandomTask(p) {
    var list = S.tasks[p.id] || [];
    var inst = list.find(function (tk) { return !tk.done; });
    if (!inst) return;
    inst.step++;
    if (inst.step >= inst.steps) { inst.done = true; p.tasksDone++; }
    recomputeTaskbar();
    if (S.mode === 'hideseek' && S.hsEndsAt) S.hsEndsAt -= 6000;
    hostEventOthers('taskbar', { v: Math.round(S.taskbar * 100) });
    bus.emit('game:tasks', { tasks: S.myTasks, taskbar: taskbarShown() });
    if (S.mode === 'sprint') {
      var c = countTaskSteps(list);
      if (c.done >= c.total) endGame('player', [p.id], p.name + ' finished every task!');
    }
    checkWin();
  }

  function botCrew(p, B, dt, t) {
    // flee if we see an active killer
    if (B.fleeUntil && t < B.fleeUntil) return;
    // respond to sabotage: critical sab pulls two bots, minor pulls one
    if (S.sab && B.state !== 'fix') {
      var critical = S.sab.kind === 'reactor' || S.sab.kind === 'o2';
      var needed = critical ? 2 : 1;
      var fixerSpots = [];
      S.order.forEach(function (oid) {
        var o = S.players[oid];
        if (o.isBot && !o.dead && o.bot && o.bot.state === 'fix') fixerSpots.push(o.bot.fixSpot);
      });
      if (fixerSpots.length < needed && (critical || Math.random() < 0.01)) {
        var consoles = S.map.taskSpots.filter(function (s) {
          return s.task === 'sab_' + S.sab.kind && fixerSpots.indexOf(s.id) < 0;
        });
        if (consoles.length) {
          var cns = consoles[Math.floor(Math.random() * consoles.length)];
          B.lastSabFix = t;
          B.fixSpot = cns.id;
          botGoto(p, B, cns.tx, cns.ty, 'fix');
          return;
        }
      }
    }
    if (B.state === 'fix') {
      if (!S.sab) { B.state = 'idle'; return; }
      if (B.path && B.pathI >= B.path.length) {
        var spot = spotById(B.fixSpot);
        if (spot && S.sab) {
          if (spot.task === 'sab_reactor') {
            S.reactorHolds[spot.id] = { until: t + 900, full: true };
            var cs = S.map.taskSpots.filter(function (s) { return s.task === 'sab_reactor'; });
            if (cs.every(function (s) { var h = S.reactorHolds[s.id]; return h && h.until > t && h.full; })) sabFixed();
          } else if (Math.random() < 0.02) hostSabFixed(p.id, spot);
        }
      }
      return;
    }
    if (B.state === 'task') {
      if (t > B.stateUntil) {
        botFinishRandomTask(p);
        B.state = 'idle';
      }
      return;
    }
    if (B.state === 'goto' && B.path && B.pathI >= B.path.length) {
      B.state = 'task';
      B.stateUntil = t + 3500 + Math.random() * 4500;
      p.moving = false;
      return;
    }
    if (B.state === 'idle' || !B.path) {
      // next task spot or wander
      var list = S.tasks[p.id] || [];
      var inst = list.find(function (tk) { return !tk.done; });
      if (inst) {
        var spot = spotById(inst.spotIds[inst.step]);
        if (spot) { botGoto(p, B, spot.tx, spot.ty, 'goto'); return; }
      }
      var rt = randFloorTile(S.map);
      botGoto(p, B, rt.tx, rt.ty, 'goto');
    }
    // report bodies we bump into
    if (S.mode === 'classic') {
      var body = S.bodies.find(function (b) { return U.dist(p.x, p.y, b.x, b.y) < C.REPORT_RANGE * 0.8; });
      if (body && Math.random() < 0.7) {
        startMeeting(p.id, body.of);
        botSay(p, U.pick(['body!!', 'found ' + (S.players[body.of] ? S.players[body.of].name : 'someone') + ' dead', 'REPORT!']));
      }
    }
  }

  function botImpostor(p, B, dt, t) {
    if (S.mode === 'hideseek') {
      // hunt nearest crew
      var prey = nearestPlayer(p, function (o) { return !isImp(o); }, 1e9);
      if (prey) {
        if (t > (B.repathAt || 0)) {
          B.repathAt = t + 900;
          botGoto(p, B, Math.floor(prey.x / C.TILE), Math.floor(prey.y / C.TILE), 'hunt');
        }
        if (U.dist(p.x, p.y, prey.x, prey.y) < C.KILL_RANGE && t > p.killAt) {
          doKill(p, prey, {});
          p.killAt = t + 9000;
        }
      }
      return;
    }
    // classic / outbreak hunting
    if (t < p.killAt || S.mode === 'sprint') {
      // fake task / wander
      if (B.state === 'idle' || !B.path || B.pathI >= (B.path ? B.path.length : 0)) {
        var rt = randFloorTile(S.map);
        botGoto(p, B, rt.tx, rt.ty, 'goto');
      }
      // sabotage sometimes
      if (S.mode === 'classic' && !S.sab && t > S.sabCdUntil && Math.random() < 0.0008) {
        hostSabotage(p.id, U.pick(['lights', 'reactor', 'o2', 'comms']));
      }
      return;
    }
    // find isolated victim
    var victim = null, vd = 1e9;
    aliveIds().forEach(function (oid) {
      var o = S.players[oid];
      if (oid === p.id || isImp(o) || o.inVent) return;
      var dd = U.dist(p.x, p.y, o.x, o.y);
      // witnesses near victim (excluding us and the victim)
      var witnesses = aliveIds().filter(function (w) {
        if (w === oid || w === p.id) return false;
        var wp = S.players[w];
        return !isImp(wp) && U.dist(wp.x, wp.y, o.x, o.y) < C.TILE * 6;
      });
      if (witnesses.length === 0 && dd < vd) { vd = dd; victim = o; }
    });
    if (!victim) {
      if (B.state === 'idle' || !B.path || B.pathI >= (B.path ? B.path.length : 0)) {
        var rt2 = randFloorTile(S.map);
        botGoto(p, B, rt2.tx, rt2.ty, 'goto');
      }
      return;
    }
    if (t > (B.repathAt || 0)) {
      B.repathAt = t + 1100;
      botGoto(p, B, Math.floor(victim.x / C.TILE), Math.floor(victim.y / C.TILE), 'hunt');
    }
    if (vd < C.KILL_RANGE) {
      if (S.mode === 'outbreak') {
        victim.infected = true;
        victim.killAt = t + 30000;
        p.killAt = t + 18000;
        hostEvent('convert', { id: victim.id, by: p.id, x: victim.x, y: victim.y });
        recomputeTaskbar();
        checkWin();
      } else {
        if (doKill(p, victim, {})) {
          p.killAt = t + S.settings.killCd * 1000;
          // flee: vent away if one is near, else run
          var v = S.map.vents.find(function (vv) { return U.dist(p.x, p.y, vv.x, vv.y) < C.TILE * 4; });
          if (v && Math.random() < 0.5) {
            var links = S.map.ventLinksOf(v.id);
            if (links.length) {
              var dest = S.map.ventById(U.pick(links));
              p.x = dest.x; p.y = dest.y;
              p.buf = [];
            }
          } else {
            var rt3 = randFloorTile(S.map);
            botGoto(p, B, rt3.tx, rt3.ty, 'goto');
          }
        }
      }
    }
  }

  function botBombTag(p, B, dt) {
    var t = now();
    var holder = S.bomb ? S.players[S.bomb.holderId] : null;
    if (holder && holder.id === p.id) {
      // chase nearest
      var prey = nearestPlayer(p, null, 1e9);
      if (prey && t > (B.repathAt || 0)) {
        B.repathAt = t + 700;
        botGoto(p, B, Math.floor(prey.x / C.TILE), Math.floor(prey.y / C.TILE), 'hunt');
      }
    } else if (holder) {
      // run away
      if (t > (B.repathAt || 0)) {
        B.repathAt = t + 1200;
        var away = randFloorTile(S.map);
        // prefer tiles far from holder
        for (var i = 0; i < 5; i++) {
          var cand = randFloorTile(S.map);
          if (U.dist(cand.tx * C.TILE, cand.ty * C.TILE, holder.x, holder.y) >
              U.dist(away.tx * C.TILE, away.ty * C.TILE, holder.x, holder.y)) away = cand;
        }
        botGoto(p, B, away.tx, away.ty, 'goto');
      }
    } else if (B.state === 'idle' || !B.path) {
      var rt = randFloorTile(S.map);
      botGoto(p, B, rt.tx, rt.ty, 'goto');
    }
    botWalk(p, B, dt);
  }

  function botSay(p, text) {
    hostChat(p.id, { text: text });
  }

  function scheduleBotVotes() {
    aliveIds().forEach(function (id) {
      var p = S.players[id];
      if (!p.isBot) return;
      p.bot.voteAt = now() + 2000 + Math.random() * 7000;
      if (Math.random() < 0.3) setTimeout(function () {
        if (S && S.meeting) botSay(p, U.pick(BOT_LINES));
      }, 500 + Math.random() * 4000);
    });
    // meeting tick handles vote casting via timer below
    var iv = setInterval(function () {
      if (!S || !S.meeting || S.meeting.stage !== 'vote') { clearInterval(iv); return; }
      aliveIds().forEach(function (id) {
        var p = S.players[id];
        if (p.isBot && S.meeting.votes[id] == null && now() > p.bot.voteAt) botVoteNow(p);
      });
    }, 500);
  }

  function botVoteNow(p) {
    var m = S.meeting;
    if (!m || m.votes[p.id] != null) return;
    var sus = Object.keys(p.bot.susp || {}).filter(function (id) {
      return p.bot.susp[id] > 50 && S.players[id] && !S.players[id].dead;
    });
    var target = 'skip';
    if (sus.length) target = sus[0];
    else if (Math.random() > 0.6) {
      var opts = aliveIds().filter(function (id) { return id !== p.id; });
      if (opts.length) target = U.pick(opts);
    }
    m.votes[p.id] = target;
    hostEventOthers('meeting', meetingPayload());
    applyEvent({ k: 'meeting', m: meetingPayload().m });
  }

  /* ================================================================
     PUBLIC API
     ================================================================ */

  AL.game = {
    hostLobby: hostLobby,
    joinLobby: joinLobby,
    startFreeplay: startFreeplay,
    addBot: function () { addBot(false); },
    removeBot: removeBot,
    leave: function () { teardown(false); },
    setSetting: function (key, val) {
      if (!S || !S.isHost) return;
      putSetting(key, val);
      syncLobby();
    },
    setMode: function (m) {
      if (!S || !S.isHost) return;
      S.mode = m;
      if (m === 'bombtag') S.mapId = 'meteor';
      else if (S.mapId === 'meteor') S.mapId = 'vessel';
      syncLobby();
    },
    setMap: function (id) { if (S && S.isHost) { S.mapId = id; syncLobby(); } },
    startGame: startGame,
    backToLobby: function () {
      if (!S || !S.isHost || S.phase !== 'end') return;
      S.map = null;
      // purge disconnected players; clear per-round state
      S.order = S.order.filter(function (id) {
        if (S.players[id].disconnected) { delete S.players[id]; return false; }
        return true;
      });
      S.order.forEach(function (id) {
        var p = S.players[id];
        p.dead = false; p.inVent = null; p.infected = false; p.morphId = null;
      });
      setPhase('lobby');
      hostEventOthers('phase', { phase: 'lobby' });
      syncLobby();
    },
    sendChat: function (text) { act('chat', { text: String(text || '') }); },
    castVote: function (target) { act('vote', { target: target }); },
    callMeeting: function () { act('meeting'); },
    reportBody: function () { act('report'); AL.audio.sfx('body_report', { vol: 0.4 }); },
    attemptKill: function () { act('kill'); },
    useAbility: function (id) { act('ability', { id: id }); },
    enterVent: function () { act('ventIn'); },
    ventTo: function (ventId) { act('ventTo', { vent: ventId }); },
    exitVent: function () { act('ventOut'); },
    interact: interact,
    panelDone: panelDone,
    panelClosed: panelClosed,
    panelProgress: panelProgress,
    sabotage: function (kind) { act('sab', { kind: kind }); },
    closeDoors: function (roomId) { act('doors', { room: roomId }); },
    getFrame: getFrame,
    getHud: getHud,
    getDeviceData: getDeviceData,
    settingsSchema: settingsSchema,
    get state() {
      if (!S) return { phase: 'menu', players: [], settings: null, mode: null, mapId: null, code: null, isHost: false, meId: null, winner: null };
      return {
        phase: S.phase, mode: S.mode, mapId: S.mapId, code: S.code,
        isHost: S.isHost, settings: S.settings, players: publicPlayers(),
        meId: S.meId, winner: S.endInfo,
      };
    },
  };

  // convenience for internal use
  S && (S.hsLeftNow = hsLeftNow);
  // attach hsLeftNow accessor used in mySpeed
  Object.defineProperty(AL.game, '_debug', { get: function () { return S; } });

  // patch: baseSession lacks hsLeftNow; provide via closure
  var _origBase = baseSession;
  baseSession = function (a, b) {
    var s = _origBase(a, b);
    s.hsLeftNow = function () {
      if (s.isHost) return s.hsEndsAt ? Math.max(0, s.hsEndsAt - now()) : 0;
      return s.hsLeft || 0;
    };
    return s;
  };
})();
