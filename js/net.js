/* Outcast — net.js: AL.net, PeerJS transport layer (SPEC section 10).
   Transport only: room hosting/joining, reliable JSON data connections,
   heartbeats, and bus events. No game logic lives here. */
(function () {
  'use strict';
  window.AL = window.AL || {};

  var PREFIX = 'alkd2026-';   // peer id prefix for room hosts (pinned)
  var HB_MS = 2000;           // heartbeat send interval
  var HB_TIMEOUT = 8000;      // silence longer than this -> synthetic leave
  var JOIN_TIMEOUT = 10000;   // ms allowed to fully connect to a host
  var MAX_RETRIES = 5;        // host retries on 'unavailable-id' (fresh code each time)
  var MAX_MSG = 64 * 1024;    // inbound message cap (JSON chars, ~64KB)
  var RECONNECT_MAX = 5;      // attempts to restore the signaling socket

  // ---------- state ----------
  var peer = null;      // our PeerJS Peer instance (host or client)
  var conns = {};       // host only: peerId -> open DataConnection
  var hostConn = null;  // client only: DataConnection to the host
  var lastSeen = {};    // peerId -> AL.util.now() of last inbound data
  var hbTimer = null;   // heartbeat interval id
  var timers = [];      // pending setTimeout ids, cleared on teardown
  var active = false;   // true while a session is live
  var session = 0;      // bumped on every host()/join()/teardown; stale handlers no-op
  var reconnects = 0;   // signaling reconnect attempts this session

  var net = {
    id: null,        // our peer id (null when offline)
    isHost: false,
    code: null,      // room code (normalized) when in a room
    host: host,
    join: join,
    send: send,
    broadcast: broadcast,
    peers: peersList,
    kick: kick,
    leave: leave,
  };
  AL.net = net;

  // ---------- friendly errors ----------
  var FRIENDLY = {
    'nolib': 'Online play is unavailable: the network library did not load. Check your internet connection and refresh the page.',
    'badcode': 'Enter a room code first.',
    'peer-unavailable': 'No room was found with that code. Double-check it with the host and try again.',
    'network': 'Could not reach the connection service. Check your internet connection and try again.',
    'browser-incompatible': 'This browser does not support the peer-to-peer connections needed for online play. Try an up-to-date Chrome, Firefox, or Edge.',
    'timeout': 'Connection timed out. The room may be closed, or a firewall is blocking the connection.',
    'unavailable-id': 'Could not reserve a room code right now. Please try hosting again.',
    'cancelled': 'The connection attempt was cancelled.',
    'kicked': 'You were removed from the room by the host.',
    'full': 'That room is full.',
    'webrtc': 'The peer-to-peer connection failed. Please try again.',
  };
  function friendly(codeStr, fallback) {
    return FRIENDLY[codeStr] || fallback || 'A network error occurred. Please try again.';
  }
  function mkError(codeStr, fallback) {
    var e = new Error(friendly(codeStr, fallback));
    e.code = codeStr;
    return e;
  }
  function emitError(codeStr, fallback) {
    AL.bus.emit('net:error', { code: codeStr, message: friendly(codeStr, fallback) });
  }

  // ---------- small helpers ----------
  function hasPeerLib() { return typeof Peer !== 'undefined' && !!Peer; }

  function normCode(code) {
    return String(code == null ? '' : code).replace(/\s+/g, '').toUpperCase();
  }

  function later(fn, ms) {
    var id = setTimeout(fn, ms);
    timers.push(id);
    return id;
  }

  function clearTimers() {
    for (var i = 0; i < timers.length; i++) clearTimeout(timers[i]);
    timers.length = 0;
    if (hbTimer) { clearInterval(hbTimer); hbTimer = null; }
  }

  function safeSend(conn, msg) {
    if (!conn || !conn.open) return false;
    try { conn.send(msg); return true; } catch (e) { return false; }
  }

  function safeClose(conn) {
    if (!conn) return;
    try { conn.close(); } catch (e) { /* already dead */ }
  }

  // Validate + decode an inbound payload. Returns a plain object or null (ignore).
  function decode(data) {
    try {
      if (typeof data === 'string') {
        if (data.length > MAX_MSG) return null;
        var parsed = JSON.parse(data);
        return (parsed && typeof parsed === 'object') ? parsed : null;
      }
      if (data && typeof data === 'object' &&
          !(data instanceof ArrayBuffer) && !ArrayBuffer.isView(data) &&
          !(typeof Blob !== 'undefined' && data instanceof Blob)) {
        // Size guard; also proves the payload is plain JSON-able data.
        var s = JSON.stringify(data);
        if (typeof s !== 'string' || s.length > MAX_MSG) return null;
        return data;
      }
    } catch (e) { /* malformed: ignore */ }
    return null;
  }

  // ---------- teardown ----------
  // Internal teardown: destroys everything, emits nothing.
  function teardown() {
    active = false;
    session++;
    clearTimers();
    var ids = Object.keys(conns);
    for (var i = 0; i < ids.length; i++) safeClose(conns[ids[i]]);
    conns = {};
    lastSeen = {};
    safeClose(hostConn);
    hostConn = null;
    if (peer) { try { peer.destroy(); } catch (e) { /* already destroyed */ } }
    peer = null;
    reconnects = 0;
    net.id = null;
    net.isHost = false;
    net.code = null;
  }

  // Public, idempotent: says goodbye politely, then tears down. Emits nothing.
  function leave() {
    if (!active && !peer) {
      net.id = null; net.isHost = false; net.code = null;
      return;
    }
    if (active) {
      if (net.isHost) {
        var ids = Object.keys(conns);
        for (var i = 0; i < ids.length; i++) safeSend(conns[ids[i]], { t: 'bye', reason: 'closed' });
      } else {
        safeSend(hostConn, { t: 'bye', reason: 'leave' });
      }
    }
    teardown();
  }

  // Client-side: the connection to the host is gone.
  function hostLost() {
    if (!active) return;
    teardown();
    AL.bus.emit('net:hostLost', {});
  }

  // Host-side: remove a client connection (synthetic or real leave).
  function dropPeer(id, emitLeave) {
    var c = conns[id];
    if (!c) return;
    delete conns[id];
    delete lastSeen[id];
    safeClose(c);
    if (emitLeave && active) AL.bus.emit('net:peerLeave', { id: id });
  }

  // ---------- heartbeats ----------
  function startHeartbeat() {
    if (hbTimer) clearInterval(hbTimer);
    var s = session;
    hbTimer = setInterval(function () {
      if (s !== session || !active) return;
      var t = AL.util.now();
      if (net.isHost) {
        var ids = Object.keys(conns);
        for (var i = 0; i < ids.length; i++) {
          var id = ids[i];
          safeSend(conns[id], { t: 'hb' });
          if (t - (lastSeen[id] || 0) > HB_TIMEOUT) dropPeer(id, true);
        }
      } else if (hostConn) {
        safeSend(hostConn, { t: 'hb' });
        if (t - (lastSeen[hostConn.peer] || 0) > HB_TIMEOUT) hostLost();
      }
    }, HB_MS);
  }

  // ---------- signaling resilience ----------
  function tryReconnect(p, s) {
    if (reconnects >= RECONNECT_MAX) {
      console.warn('[net] signaling connection lost; gave up reconnecting (existing peers unaffected)');
      return;
    }
    reconnects++;
    later(function () {
      if (s !== session || !active || !peer || peer.destroyed) return;
      try { if (peer.disconnected) peer.reconnect(); } catch (e) { /* retry on next error */ }
    }, Math.min(15000, 1000 * reconnects));
  }

  // Runtime peer watchers, attached once a session is established.
  function watchPeer(p) {
    var s = session;
    p.on('open', function () {
      if (s === session) reconnects = 0; // signaling restored
    });
    p.on('disconnected', function () {
      if (s !== session || !active) return;
      tryReconnect(p, s);
    });
    p.on('error', function (err) {
      if (s !== session || !active) return;
      var type = (err && err.type) || 'unknown';
      if (type === 'peer-unavailable') return; // stale outbound connect; not fatal
      if (type === 'network' || type === 'socket-error' ||
          type === 'socket-closed' || type === 'server-error' ||
          type === 'disconnected') {
        tryReconnect(p, s); // signaling only; live connections keep working
        return;
      }
      // Anything else is fatal in PeerJS and destroys the peer; connection
      // 'close' handlers will cascade into peerLeave / hostLost events.
      console.warn('[net] peer error: ' + type, err);
      emitError(type, 'Connection error (' + type + ').');
    });
  }

  // ---------- inbound routing ----------
  function routeMsg(fromId, data) {
    var msg = decode(data);
    if (!msg) return; // malformed / oversized / non-JSON: ignore
    lastSeen[fromId] = AL.util.now();
    var t = msg.t;
    if (t === 'hb') return; // heartbeat, filtered from net:msg
    if (t === 'bye') {
      if (net.isHost) {
        dropPeer(fromId, true);
      } else {
        var reason = typeof msg.reason === 'string' ? msg.reason : 'closed';
        if (reason === 'kick') emitError('kicked');
        else if (reason === 'full') emitError('full');
        hostLost();
      }
      return;
    }
    AL.bus.emit('net:msg', { from: fromId, msg: msg });
  }

  // ---------- host: incoming client connections ----------
  function watchIncoming(conn) {
    var s = session;
    conn.on('open', function () {
      if (s !== session || !active || !net.isHost) { safeClose(conn); return; }
      var id = conn.peer;
      // Transport-level capacity guard.
      if (!conns[id] && Object.keys(conns).length >= AL.C.MAX_PLAYERS - 1) {
        safeSend(conn, { t: 'bye', reason: 'full' });
        later(function () { safeClose(conn); }, 250);
        return;
      }
      // Reconnect edge: the same peer id rejoining replaces its stale connection.
      var old = conns[id];
      if (old && old !== conn) {
        delete conns[id]; // so the stale conn's close handler stays quiet
        safeClose(old);
      }
      conns[id] = conn;
      lastSeen[id] = AL.util.now();
      AL.bus.emit('net:peerJoin', { id: id, meta: conn.metadata != null ? conn.metadata : null });
    });
    conn.on('data', function (data) {
      if (s !== session || conns[conn.peer] !== conn) return;
      try { routeMsg(conn.peer, data); } catch (e) { console.warn('[net] inbound handler error', e); }
    });
    conn.on('close', function () {
      if (s !== session) return;
      if (conns[conn.peer] === conn) dropPeer(conn.peer, true);
    });
    conn.on('error', function () {
      if (s !== session) return;
      if (conns[conn.peer] === conn) dropPeer(conn.peer, true);
    });
  }

  // ---------- client: connection to host ----------
  function watchHostConn(conn) {
    var s = session;
    conn.on('data', function (data) {
      if (s !== session || hostConn !== conn) return;
      try { routeMsg(conn.peer, data); } catch (e) { console.warn('[net] inbound handler error', e); }
    });
    conn.on('close', function () {
      if (s !== session || hostConn !== conn) return;
      hostLost();
    });
    conn.on('error', function () {
      if (s !== session || hostConn !== conn) return;
      hostLost();
    });
  }

  // ---------- public: host ----------
  function host(meta) {
    leave();
    return new Promise(function (resolve, reject) {
      if (!hasPeerLib()) { emitError('nolib'); reject(mkError('nolib')); return; }
      session++;
      var s = session;
      var retries = 0;

      function attempt() {
        if (s !== session) { reject(mkError('cancelled')); return; }
        var code = AL.util.randId(6);
        var p;
        try { p = new Peer(PREFIX + code, { debug: 0 }); }
        catch (e) { reject(mkError('network')); return; }
        var settled = false;

        p.on('open', function (id) {
          if (settled) return;
          if (s !== session) { try { p.destroy(); } catch (e) {} reject(mkError('cancelled')); settled = true; return; }
          settled = true;
          peer = p;
          active = true;
          conns = {};
          lastSeen = {};
          hostConn = null;
          reconnects = 0;
          net.id = id;
          net.isHost = true;
          net.code = code;
          p.on('connection', function (conn) {
            if (s !== session || !active) { safeClose(conn); return; }
            watchIncoming(conn);
          });
          watchPeer(p);
          startHeartbeat();
          AL.bus.emit('net:open', { id: id, code: code });
          resolve(code);
        });

        p.on('error', function (err) {
          if (settled) return; // runtime errors are watchPeer's job
          var type = (err && err.type) || 'unknown';
          settled = true;
          try { p.destroy(); } catch (e) { /* ignore */ }
          if (type === 'unavailable-id' && retries < MAX_RETRIES) {
            retries++;
            attempt(); // fresh random code
            return;
          }
          reject(mkError(type, 'Could not open a room (' + type + ').'));
        });
      }
      attempt();
    });
  }

  // ---------- public: join ----------
  function join(code, meta) {
    leave();
    return new Promise(function (resolve, reject) {
      if (!hasPeerLib()) { emitError('nolib'); reject(mkError('nolib')); return; }
      var roomCode = normCode(code);
      if (!roomCode) { reject(mkError('badcode')); return; }
      session++;
      var s = session;
      var settled = false;
      var p;
      try { p = new Peer({ debug: 0 }); }
      catch (e) { reject(mkError('network')); return; }

      var joinTimer = setTimeout(function () { fail('timeout'); }, JOIN_TIMEOUT);

      function fail(codeStr, fallback) {
        if (settled) return;
        settled = true;
        clearTimeout(joinTimer);
        try { p.destroy(); } catch (e) { /* ignore */ }
        reject(mkError(codeStr, fallback));
      }

      p.on('open', function (myId) {
        if (settled) return;
        if (s !== session) { fail('cancelled'); return; }
        var conn;
        try {
          conn = p.connect(PREFIX + roomCode, {
            metadata: meta == null ? {} : meta,
            reliable: true,
            serialization: 'json',
          });
        } catch (e) { conn = null; }
        if (!conn) { fail('webrtc'); return; }

        conn.on('open', function () {
          if (settled) { safeClose(conn); return; }
          if (s !== session) { safeClose(conn); fail('cancelled'); return; }
          settled = true;
          clearTimeout(joinTimer);
          peer = p;
          active = true;
          conns = {};
          hostConn = conn;
          lastSeen = {};
          lastSeen[conn.peer] = AL.util.now();
          reconnects = 0;
          net.id = myId;
          net.isHost = false;
          net.code = roomCode;
          watchHostConn(conn);
          watchPeer(p);
          startHeartbeat();
          AL.bus.emit('net:open', { id: myId, code: roomCode });
          resolve(roomCode);
        });
        conn.on('close', function () {
          if (!settled) fail('peer-unavailable', 'The room refused the connection.');
        });
        conn.on('error', function (err) {
          if (!settled) fail((err && err.type) || 'webrtc');
        });
      });

      p.on('error', function (err) {
        if (settled) return;
        var type = (err && err.type) || 'unknown';
        fail(type, 'Could not connect (' + type + ').');
      });
    });
  }

  // ---------- public: messaging ----------
  function send(id, msg) {
    if (!active || msg == null) return false;
    if (net.isHost) return safeSend(conns[id], msg);
    if (hostConn && (id == null || id === hostConn.peer)) return safeSend(hostConn, msg);
    return false;
  }

  function broadcast(msg, exceptId) {
    if (!active || msg == null) return;
    if (net.isHost) {
      var ids = Object.keys(conns);
      for (var i = 0; i < ids.length; i++) {
        if (ids[i] === exceptId) continue;
        safeSend(conns[ids[i]], msg);
      }
    } else {
      // A client's only peer is the host.
      if (exceptId !== (hostConn && hostConn.peer)) safeSend(hostConn, msg);
    }
  }

  function peersList() {
    if (!active) return [];
    if (net.isHost) return Object.keys(conns);
    return hostConn ? [hostConn.peer] : [];
  }

  function kick(id) {
    if (!active || !net.isHost) return;
    var c = conns[id];
    if (!c) return;
    safeSend(c, { t: 'bye', reason: 'kick' });
    delete conns[id];
    delete lastSeen[id];
    later(function () { safeClose(c); }, 200); // give the goodbye a moment to flush
    AL.bus.emit('net:peerLeave', { id: id });
  }

  // Leave cleanly on page close so peers notice immediately.
  window.addEventListener('beforeunload', function () {
    try { leave(); } catch (e) { /* nothing to do */ }
  });
})();
