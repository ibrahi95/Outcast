/* Outcast — tasks.js: 14 task minigames + 4 sabotage fix panels.
   Each DEF.make(el, api) builds a self-contained game inside the panel div. */
(function () {
  'use strict';
  window.AL = window.AL || {};

  var ACCENT = '#35e0ff', GOOD = '#3ee06f', BAD = '#ff3860', WARN = '#ffd23e';
  var PANEL = '#10152a', LINE = '#2c3560', TEXT = '#eaf0ff', DIM = '#8b96c9';

  // one-time style injection
  (function () {
    if (document.getElementById('al-tasks-css')) return;
    var s = document.createElement('style');
    s.id = 'al-tasks-css';
    s.textContent =
      '.al-tk{display:flex;flex-direction:column;height:100%;gap:8px;font-family:"Trebuchet MS","Segoe UI",system-ui,sans-serif;color:' + TEXT + ';}' +
      '.al-tk-hint{font-size:13px;color:' + DIM + ';text-align:center;letter-spacing:.4px;min-height:17px;}' +
      '.al-tk-cv{flex:1;border-radius:12px;background:' + PANEL + ';border:2px solid ' + LINE + ';touch-action:none;width:100%;display:block;min-height:0;}' +
      '.al-tk-row{display:flex;gap:8px;justify-content:center;flex-wrap:wrap;}' +
      '.al-tk-btn{background:#1d2440;color:' + TEXT + ';border:2px solid ' + LINE + ';border-radius:10px;padding:10px 16px;' +
      'font-weight:800;font-size:15px;cursor:pointer;letter-spacing:.5px;min-width:48px;min-height:44px;}' +
      '.al-tk-btn:active{transform:translateY(2px);}' +
      '.al-tk-btn.on{border-color:' + ACCENT + ';color:' + ACCENT + ';}';
    document.head.appendChild(s);
  })();

  /* ---------- panel scaffolding ---------- */

  function scaffold(el, hintText) {
    el.innerHTML = '';
    var wrap = document.createElement('div');
    wrap.className = 'al-tk';
    var hint = document.createElement('div');
    hint.className = 'al-tk-hint';
    hint.textContent = hintText || '';
    var cv = document.createElement('canvas');
    cv.className = 'al-tk-cv';
    wrap.appendChild(hint);
    wrap.appendChild(cv);
    el.appendChild(wrap);
    var W = 440, H = 320;
    cv.width = W; cv.height = H;
    return { wrap: wrap, hint: hint, cv: cv, g: cv.getContext('2d'), W: W, H: H };
  }

  function pointer(cv, W, H, handlers) {
    var down = false;
    function pos(ev) {
      var r = cv.getBoundingClientRect();
      return { x: (ev.clientX - r.left) / r.width * W, y: (ev.clientY - r.top) / r.height * H };
    }
    function pd(ev) { ev.preventDefault(); down = true; cv.setPointerCapture && cv.setPointerCapture(ev.pointerId); var p = pos(ev); handlers.down && handlers.down(p.x, p.y); }
    function pm(ev) { var p = pos(ev); handlers.move && handlers.move(p.x, p.y, down); }
    function pu(ev) { if (!down) return; down = false; var p = pos(ev); handlers.up && handlers.up(p.x, p.y); }
    cv.addEventListener('pointerdown', pd);
    cv.addEventListener('pointermove', pm);
    cv.addEventListener('pointerup', pu);
    cv.addEventListener('pointercancel', pu);
    return function () {
      cv.removeEventListener('pointerdown', pd);
      cv.removeEventListener('pointermove', pm);
      cv.removeEventListener('pointerup', pu);
      cv.removeEventListener('pointercancel', pu);
    };
  }

  function looper(fn) {
    var alive = true, raf = 0, t0 = performance.now();
    function step(t) {
      if (!alive) return;
      fn((t - t0) / 1000);
      raf = requestAnimationFrame(step);
    }
    raf = requestAnimationFrame(step);
    return function () { alive = false; cancelAnimationFrame(raf); };
  }

  function roundRect(g, x, y, w, h, r) {
    g.beginPath();
    g.moveTo(x + r, y);
    g.arcTo(x + w, y, x + w, y + h, r);
    g.arcTo(x + w, y + h, x, y + h, r);
    g.arcTo(x, y + h, x, y, r);
    g.arcTo(x, y, x + w, y, r);
    g.closePath();
  }

  function once(fn) { var did = false; return function () { if (!did) { did = true; fn(); } }; }

  /* =============================================================
     TASK MINIGAMES
     ============================================================= */

  var DEFS = {};

  DEFS.wires = {
    id: 'wires', name: 'Fix Wiring', kind: 'common', steps: 3, visual: false,
    make: function (el, api) {
      var s = scaffold(el, 'Drag each wire to its matching color');
      var COLS = ['#ff3860', '#35e0ff', '#ffd23e', '#d06bff'];
      var left = AL.util.shuffle([0, 1, 2, 3], api.rnd);
      var right = AL.util.shuffle([0, 1, 2, 3], api.rnd);
      var conns = {}; // leftIdx -> rightIdx
      var drag = null; // {li, x, y}
      var sparks = [];
      var doneCall = once(function () { api.sfx('sparkle'); setTimeout(api.done, 350); });
      function nodeY(i) { return 62 + i * 68; }
      var stop = pointer(s.cv, s.W, s.H, {
        down: function (x, y) {
          for (var i = 0; i < 4; i++) {
            if (conns[i] == null && Math.abs(x - 46) < 40 && Math.abs(y - nodeY(i)) < 26) { drag = { li: i, x: x, y: y }; return; }
          }
        },
        move: function (x, y) { if (drag) { drag.x = x; drag.y = y; } },
        up: function (x, y) {
          if (!drag) return;
          for (var j = 0; j < 4; j++) {
            if (Math.abs(x - (s.W - 46)) < 46 && Math.abs(y - nodeY(j)) < 28) {
              if (COLS[right[j]] === COLS[left[drag.li]]) {
                conns[drag.li] = j;
                api.sfx('wire_snap');
                for (var k = 0; k < 10; k++) sparks.push({ x: s.W - 60, y: nodeY(j), vx: -Math.random() * 90, vy: (Math.random() - 0.5) * 140, l: 0.5 });
                if (Object.keys(conns).length === 4) doneCall();
                api.progress(Object.keys(conns).length / 4);
              } else api.sfx('card_bad', { vol: 0.5 });
            }
          }
          drag = null;
        },
      });
      var stopLoop = looper(function (t) {
        var g = s.g;
        g.clearRect(0, 0, s.W, s.H);
        g.fillStyle = '#0c1122'; g.fillRect(0, 0, s.W, s.H);
        g.fillStyle = '#161d38'; g.fillRect(0, 0, 26, s.H); g.fillRect(s.W - 26, 0, 26, s.H);
        for (var i = 0; i < 4; i++) {
          var y = nodeY(i);
          // left stub
          g.strokeStyle = COLS[left[i]]; g.lineWidth = 9; g.lineCap = 'round';
          g.beginPath(); g.moveTo(10, y); g.lineTo(52, y); g.stroke();
          // right stub
          g.strokeStyle = COLS[right[i]];
          g.beginPath(); g.moveTo(s.W - 52, y); g.lineTo(s.W - 10, y); g.stroke();
          g.fillStyle = COLS[right[i]];
          g.beginPath(); g.arc(s.W - 52, y, 8, 0, 7); g.fill();
          // connected wire
          if (conns[i] != null) {
            var ty = nodeY(conns[i]);
            g.strokeStyle = COLS[left[i]];
            g.beginPath(); g.moveTo(52, y);
            g.bezierCurveTo(s.W * 0.4, y, s.W * 0.6, ty, s.W - 52, ty);
            g.stroke();
            g.fillStyle = '#fff'; g.globalAlpha = 0.6 + 0.4 * Math.sin(t * 6 + i);
            g.beginPath(); g.arc(s.W - 52, ty, 4, 0, 7); g.fill(); g.globalAlpha = 1;
          }
          g.fillStyle = COLS[left[i]];
          g.beginPath(); g.arc(52, y, 8, 0, 7); g.fill();
        }
        if (drag) {
          var yy = nodeY(drag.li);
          s.g.strokeStyle = COLS[left[drag.li]]; s.g.lineWidth = 9;
          s.g.beginPath(); s.g.moveTo(52, yy);
          s.g.bezierCurveTo((52 + drag.x) / 2, yy, (52 + drag.x) / 2, drag.y, drag.x, drag.y);
          s.g.stroke();
        }
        for (var p = sparks.length - 1; p >= 0; p--) {
          var sp = sparks[p];
          sp.x += sp.vx * 0.016; sp.y += sp.vy * 0.016; sp.l -= 0.03;
          if (sp.l <= 0) { sparks.splice(p, 1); continue; }
          g.fillStyle = 'rgba(255,220,120,' + sp.l + ')';
          g.fillRect(sp.x, sp.y, 3, 3);
        }
      });
      return function () { stop(); stopLoop(); };
    },
  };

  DEFS.swipe = {
    id: 'swipe', name: 'Swipe Card', kind: 'common', steps: 1, visual: false,
    make: function (el, api) {
      var s = scaffold(el, 'Swipe the card through the reader — steady does it');
      var cardX = 60, holding = false, enterT = 0, status = '', statusCol = DIM, statusT = 0;
      var readerY = 190;
      var doneCall = once(function () { setTimeout(api.done, 500); });
      var stop = pointer(s.cv, s.W, s.H, {
        down: function (x, y) { if (Math.abs(x - cardX) < 70 && y > 60 && y < 170) holding = true; },
        move: function (x, y, dn) {
          if (!holding) return;
          var prev = cardX;
          cardX = AL.util.clamp(x, 40, s.W - 40);
          if (prev < 90 && cardX >= 90) enterT = performance.now();
          if (prev < s.W - 90 && cardX >= s.W - 90 && enterT) {
            var dur = performance.now() - enterT;
            if (dur > 320 && dur < 1150) { status = 'ACCEPTED. THANK YOU.'; statusCol = GOOD; api.sfx('card_ok'); doneCall(); }
            else { status = dur <= 320 ? 'TOO FAST. TRY AGAIN.' : 'TOO SLOW. TRY AGAIN.'; statusCol = BAD; api.sfx('card_bad'); }
            statusT = performance.now();
            enterT = 0;
          }
        },
        up: function () { holding = false; if (status.indexOf('ACCEPTED') !== 0) cardX = 60; },
      });
      var stopLoop = looper(function (t) {
        var g = s.g;
        g.clearRect(0, 0, s.W, s.H);
        g.fillStyle = '#0c1122'; g.fillRect(0, 0, s.W, s.H);
        // reader slot
        g.fillStyle = '#161d38'; roundRect(g, 20, readerY - 14, s.W - 40, 46, 8); g.fill();
        g.strokeStyle = LINE; g.lineWidth = 2; g.stroke();
        g.fillStyle = '#05070f'; g.fillRect(30, readerY, s.W - 60, 8);
        // status lcd
        g.fillStyle = '#05070f'; roundRect(g, 90, 250, s.W - 180, 40, 6); g.fill();
        g.fillStyle = statusCol; g.font = 'bold 15px monospace'; g.textAlign = 'center';
        g.fillText(status || 'PLEASE SWIPE CARD', s.W / 2, 275);
        // card
        var cy = holding || status.indexOf('ACCEPTED') === 0 ? readerY - 58 : 108;
        g.save();
        g.translate(cardX, cy);
        g.fillStyle = '#eef2ff'; roundRect(g, -60, -38, 120, 76, 8); g.fill();
        g.fillStyle = ACCENT; g.fillRect(-60, -18, 120, 14);
        g.fillStyle = '#9aa5cf'; g.fillRect(-48, 8, 60, 6); g.fillRect(-48, 20, 40, 6);
        g.beginPath(); g.arc(36, 14, 14, 0, 7); g.fillStyle = '#c9d4f5'; g.fill();
        g.restore();
      });
      return function () { stop(); stopLoop(); };
    },
  };

  DEFS.upload = {
    id: 'upload', name: 'Upload Data', kind: 'long', steps: 2, visual: false,
    make: function (el, api) {
      var isUp = api.step === 1;
      var s = scaffold(el, isUp ? 'Uploading to central server...' : 'Downloading room data...');
      var prog = 0, started = false, lastTick = 0;
      var doneCall = once(function () { api.sfx('task_done', { vol: 0.6 }); setTimeout(api.done, 600); });
      var btn = document.createElement('button');
      btn.className = 'al-tk-btn on';
      btn.textContent = isUp ? 'START UPLOAD' : 'START DOWNLOAD';
      var row = document.createElement('div'); row.className = 'al-tk-row';
      row.appendChild(btn); s.wrap.appendChild(row);
      btn.addEventListener('click', function () { started = true; btn.style.visibility = 'hidden'; api.sfx('ui_click'); });
      var stopLoop = looper(function (t) {
        var g = s.g;
        if (started && prog < 1) {
          prog = Math.min(1, prog + 0.0022 + api.rnd() * 0.004);
          api.progress(prog);
          if (t - lastTick > 0.13) { lastTick = t; api.sfx('download_tick', { vol: 0.5 }); }
          if (prog >= 1) doneCall();
        }
        g.clearRect(0, 0, s.W, s.H);
        g.fillStyle = '#0c1122'; g.fillRect(0, 0, s.W, s.H);
        // folder -> server icons
        function folder(x, y, col) {
          g.fillStyle = col; roundRect(g, x - 34, y - 20, 68, 46, 6); g.fill();
          g.fillStyle = col; roundRect(g, x - 34, y - 30, 30, 14, 4); g.fill();
        }
        folder(70, 130, isUp ? '#2c3560' : WARN);
        g.fillStyle = '#1d2440'; roundRect(g, s.W - 110, 92, 80, 86, 8); g.fill();
        g.strokeStyle = LINE; g.stroke();
        for (var i = 0; i < 3; i++) {
          g.fillStyle = '#0c1122'; g.fillRect(s.W - 100, 102 + i * 26, 60, 16);
          g.fillStyle = (Math.sin(t * 5 + i * 2) > 0) ? GOOD : '#1d2440';
          g.beginPath(); g.arc(s.W - 48, 110 + i * 26, 4, 0, 7); g.fill();
        }
        // flying file
        if (started && prog < 1) {
          var fx = 110 + (s.W - 230) * ((t * 0.7) % 1), fy = 128 - Math.sin(((t * 0.7) % 1) * Math.PI) * 34;
          if (isUp) { fx = 110 + (s.W - 230) * ((t * 0.7) % 1); } else { fx = s.W - 120 - (s.W - 230) * ((t * 0.7) % 1); }
          g.fillStyle = '#eef2ff'; roundRect(g, fx - 10, fy - 13, 20, 26, 3); g.fill();
          g.fillStyle = ACCENT; g.fillRect(fx - 6, fy - 6, 12, 3); g.fillRect(fx - 6, fy, 12, 3);
        }
        // progress bar
        g.fillStyle = '#05070f'; roundRect(g, 40, 210, s.W - 80, 26, 13); g.fill();
        g.fillStyle = prog >= 1 ? GOOD : ACCENT;
        if (prog > 0.02) { roundRect(g, 43, 213, (s.W - 86) * prog, 20, 10); g.fill(); }
        g.fillStyle = TEXT; g.font = 'bold 15px monospace'; g.textAlign = 'center';
        var eta = started ? Math.ceil((1 - prog) * 8) : '--';
        g.fillText(prog >= 1 ? 'COMPLETE' : (Math.floor(prog * 100) + '%   ETA: ' + eta + 's'), s.W / 2, 262);
      });
      return function () { stopLoop(); };
    },
  };

  DEFS.asteroids = {
    id: 'asteroids', name: 'Clear Asteroids', kind: 'long', steps: 1, visual: false,
    make: function (el, api) {
      var s = scaffold(el, 'Tap the asteroids to blast them — 12 to go');
      var rocks = [], shot = 0, lasers = [], bits = [];
      var mx = s.W / 2, my = s.H / 2;
      function spawn() {
        var edge = api.rnd() < 0.5;
        rocks.push({
          x: edge ? -20 : s.W + 20, y: 40 + api.rnd() * (s.H - 80),
          vx: (edge ? 1 : -1) * (26 + api.rnd() * 34), vy: (api.rnd() - 0.5) * 30,
          r: 15 + api.rnd() * 13, rot: api.rnd() * 7, vr: (api.rnd() - 0.5) * 2,
        });
      }
      for (var i = 0; i < 4; i++) spawn();
      var doneCall = once(function () { api.sfx('task_done', { vol: 0.6 }); setTimeout(api.done, 500); });
      var stop = pointer(s.cv, s.W, s.H, {
        down: function (x, y) {
          mx = x; my = y;
          lasers.push({ x: x, y: y, l: 0.25 });
          api.sfx('sheriff_shot', { vol: 0.25 });
          for (var i = rocks.length - 1; i >= 0; i--) {
            var r = rocks[i];
            if ((x - r.x) * (x - r.x) + (y - r.y) * (y - r.y) < (r.r + 8) * (r.r + 8)) {
              rocks.splice(i, 1);
              shot++;
              api.progress(shot / 12);
              api.sfx('explode', { vol: 0.18 });
              for (var b = 0; b < 8; b++) bits.push({ x: r.x, y: r.y, vx: (Math.random() - 0.5) * 220, vy: (Math.random() - 0.5) * 220, l: 0.6 });
              if (shot >= 12) doneCall();
              break;
            }
          }
        },
        move: function (x, y) { mx = x; my = y; },
      });
      var last = 0;
      var stopLoop = looper(function (t) {
        var dt = Math.min(0.05, t - last); last = t;
        var g = s.g;
        g.fillStyle = '#05070f'; g.fillRect(0, 0, s.W, s.H);
        // stars
        for (var st = 0; st < 40; st++) {
          g.fillStyle = 'rgba(234,240,255,' + (0.2 + (st * 37 % 10) / 18) + ')';
          g.fillRect((st * 83 + t * (6 + st % 5)) % s.W, (st * 47) % s.H, 2, 2);
        }
        if (shot < 12 && rocks.length < 5 && Math.random() < 0.03) spawn();
        rocks.forEach(function (r) {
          r.x += r.vx * dt; r.y += r.vy * dt; r.rot += r.vr * dt;
          if (r.x < -30) r.x = s.W + 20; if (r.x > s.W + 30) r.x = -20;
          if (r.y < 20 || r.y > s.H - 20) r.vy *= -1;
          g.save(); g.translate(r.x, r.y); g.rotate(r.rot);
          g.fillStyle = '#6b6355'; g.strokeStyle = '#8f8672'; g.lineWidth = 2;
          g.beginPath();
          for (var a = 0; a < 7; a++) {
            var rr = r.r * (0.8 + 0.28 * Math.sin(a * 4.7 + r.r));
            var ang = a / 7 * Math.PI * 2;
            if (a === 0) g.moveTo(Math.cos(ang) * rr, Math.sin(ang) * rr);
            else g.lineTo(Math.cos(ang) * rr, Math.sin(ang) * rr);
          }
          g.closePath(); g.fill(); g.stroke();
          g.fillStyle = '#57503f';
          g.beginPath(); g.arc(-r.r * 0.3, -r.r * 0.2, r.r * 0.22, 0, 7); g.fill();
          g.restore();
        });
        for (var li = lasers.length - 1; li >= 0; li--) {
          var L = lasers[li]; L.l -= dt;
          if (L.l <= 0) { lasers.splice(li, 1); continue; }
          g.strokeStyle = 'rgba(255,56,96,' + (L.l * 4) + ')'; g.lineWidth = 3;
          g.beginPath(); g.moveTo(s.W / 2, s.H + 10); g.lineTo(L.x, L.y); g.stroke();
        }
        for (var bi = bits.length - 1; bi >= 0; bi--) {
          var B = bits[bi]; B.x += B.vx * dt; B.y += B.vy * dt; B.l -= dt;
          if (B.l <= 0) { bits.splice(bi, 1); continue; }
          g.fillStyle = 'rgba(143,134,114,' + B.l + ')'; g.fillRect(B.x, B.y, 4, 4);
        }
        // crosshair
        g.strokeStyle = ACCENT; g.lineWidth = 2;
        g.beginPath(); g.arc(mx, my, 14, 0, 7); g.stroke();
        g.beginPath(); g.moveTo(mx - 22, my); g.lineTo(mx - 8, my); g.moveTo(mx + 8, my); g.lineTo(mx + 22, my);
        g.moveTo(mx, my - 22); g.lineTo(mx, my - 8); g.moveTo(mx, my + 8); g.lineTo(mx, my + 22); g.stroke();
        g.fillStyle = TEXT; g.font = 'bold 16px monospace'; g.textAlign = 'left';
        g.fillText('DESTROYED: ' + shot + ' / 12', 14, 24);
      });
      return function () { stop(); stopLoop(); };
    },
  };

  DEFS.shields = {
    id: 'shields', name: 'Prime Shields', kind: 'short', steps: 1, visual: false,
    make: function (el, api) {
      var s = scaffold(el, 'Tap the red cells to prime all shields');
      var cells = [];
      var cx = s.W / 2, cy = s.H / 2, R = 52;
      cells.push({ x: cx, y: cy });
      for (var i = 0; i < 6; i++) {
        var a = i / 6 * Math.PI * 2 - Math.PI / 2;
        cells.push({ x: cx + Math.cos(a) * R * 1.75, y: cy + Math.sin(a) * R * 1.75 });
      }
      cells.forEach(function (c) { c.on = api.rnd() < 0.45; });
      if (cells.every(function (c) { return c.on; })) cells[0].on = false;
      var doneCall = once(function () { api.sfx('task_done', { vol: 0.6 }); setTimeout(api.done, 450); });
      function hex(g, x, y, r) {
        g.beginPath();
        for (var a = 0; a < 6; a++) {
          var an = a / 6 * Math.PI * 2 + Math.PI / 6;
          if (a === 0) g.moveTo(x + Math.cos(an) * r, y + Math.sin(an) * r);
          else g.lineTo(x + Math.cos(an) * r, y + Math.sin(an) * r);
        }
        g.closePath();
      }
      var stop = pointer(s.cv, s.W, s.H, {
        down: function (x, y) {
          cells.forEach(function (c) {
            if ((x - c.x) * (x - c.x) + (y - c.y) * (y - c.y) < 48 * 48 && !c.on) {
              c.on = true;
              api.sfx('use', { vol: 0.7 });
              api.progress(cells.filter(function (q) { return q.on; }).length / 7);
              if (cells.every(function (q) { return q.on; })) doneCall();
            }
          });
        },
      });
      var stopLoop = looper(function (t) {
        var g = s.g;
        g.fillStyle = '#0c1122'; g.fillRect(0, 0, s.W, s.H);
        cells.forEach(function (c, i) {
          hex(g, c.x, c.y, 46);
          if (c.on) {
            g.fillStyle = 'rgba(53,224,255,' + (0.25 + 0.12 * Math.sin(t * 4 + i)) + ')';
            g.fill(); g.strokeStyle = ACCENT;
          } else {
            g.fillStyle = 'rgba(255,56,96,0.22)';
            g.fill(); g.strokeStyle = BAD;
          }
          g.lineWidth = 3; g.stroke();
        });
      });
      return function () { stop(); stopLoop(); };
    },
  };

  DEFS.calibrate = {
    id: 'calibrate', name: 'Calibrate Distributor', kind: 'short', steps: 1, visual: false,
    make: function (el, api) {
      var s = scaffold(el, 'Tap when the spinner crosses the marker — 3 in a row');
      var stage = 0, ang = -Math.PI / 2, speed = 3.1, flashT = 0, flashCol = null;
      var doneCall = once(function () { api.sfx('task_done', { vol: 0.6 }); setTimeout(api.done, 450); });
      var stop = pointer(s.cv, s.W, s.H, {
        down: function () {
          if (stage >= 3) return;
          var d = Math.abs((((ang + Math.PI / 2) % (Math.PI * 2)) + Math.PI * 2) % (Math.PI * 2));
          d = Math.min(d, Math.PI * 2 - d);
          if (d < 0.42) {
            stage++; speed += 0.9; flashCol = GOOD; api.sfx('card_ok', { vol: 0.7 });
            api.progress(stage / 3);
            if (stage >= 3) doneCall();
          } else {
            stage = 0; flashCol = BAD; api.sfx('card_bad', { vol: 0.6 }); api.progress(0);
          }
          flashT = performance.now();
        },
      });
      var last = 0;
      var stopLoop = looper(function (t) {
        var dt = Math.min(0.05, t - last); last = t;
        ang += speed * dt;
        var g = s.g;
        g.fillStyle = '#0c1122'; g.fillRect(0, 0, s.W, s.H);
        for (var d = 0; d < 3; d++) {
          var x = 90 + d * 130, y = s.H / 2;
          g.beginPath(); g.arc(x, y, 48, 0, 7);
          g.fillStyle = d < stage ? 'rgba(62,224,111,0.2)' : '#161d38'; g.fill();
          g.strokeStyle = d < stage ? GOOD : LINE; g.lineWidth = 3; g.stroke();
          // marker wedge at top
          g.strokeStyle = d === stage ? WARN : '#3a4573'; g.lineWidth = 6;
          g.beginPath(); g.arc(x, y, 48, -Math.PI / 2 - 0.4, -Math.PI / 2 + 0.4); g.stroke();
          // needle
          if (d === stage) {
            g.strokeStyle = ACCENT; g.lineWidth = 4;
            g.beginPath(); g.moveTo(x, y); g.lineTo(x + Math.cos(ang) * 40, y + Math.sin(ang) * 40); g.stroke();
          } else if (d < stage) {
            g.fillStyle = GOOD; g.font = 'bold 26px monospace'; g.textAlign = 'center'; g.fillText('OK', x, y + 9);
          }
          g.fillStyle = '#0c1122'; g.beginPath(); g.arc(x, y, 6, 0, 7); g.fill();
        }
        if (flashCol && performance.now() - flashT < 160) {
          g.fillStyle = flashCol; g.globalAlpha = 0.12; g.fillRect(0, 0, s.W, s.H); g.globalAlpha = 1;
        }
      });
      return function () { stop(); stopLoop(); };
    },
  };

  DEFS.chart = {
    id: 'chart', name: 'Chart Course', kind: 'short', steps: 1, visual: false,
    make: function (el, api) {
      var s = scaffold(el, 'Drag your ship through every waypoint');
      var pts = [];
      for (var i = 0; i < 5; i++) {
        pts.push({ x: 50 + (s.W - 100) * i / 4, y: 70 + (api.rnd() * (s.H - 150)), hit: i === 0 });
      }
      var ship = { x: pts[0].x, y: pts[0].y };
      var dragging = false;
      var doneCall = once(function () { api.sfx('task_done', { vol: 0.6 }); setTimeout(api.done, 450); });
      var stop = pointer(s.cv, s.W, s.H, {
        down: function (x, y) { if (AL.util.dist(x, y, ship.x, ship.y) < 40) dragging = true; },
        move: function (x, y) {
          if (!dragging) return;
          ship.x = AL.util.clamp(x, 20, s.W - 20); ship.y = AL.util.clamp(y, 20, s.H - 20);
          var next = pts.findIndex(function (p) { return !p.hit; });
          if (next >= 0 && AL.util.dist(ship.x, ship.y, pts[next].x, pts[next].y) < 24) {
            pts[next].hit = true;
            api.sfx('scan_beep', { vol: 0.8 });
            api.progress(pts.filter(function (p) { return p.hit; }).length / 5);
            if (pts.every(function (p) { return p.hit; })) doneCall();
          }
        },
        up: function () { dragging = false; },
      });
      var stopLoop = looper(function (t) {
        var g = s.g;
        g.fillStyle = '#05070f'; g.fillRect(0, 0, s.W, s.H);
        for (var st = 0; st < 30; st++) {
          g.fillStyle = 'rgba(234,240,255,0.35)';
          g.fillRect((st * 97) % s.W, (st * 61) % s.H, 2, 2);
        }
        // dotted route
        g.strokeStyle = 'rgba(53,224,255,0.5)'; g.lineWidth = 2; g.setLineDash([6, 8]);
        g.beginPath(); g.moveTo(pts[0].x, pts[0].y);
        for (var i = 1; i < 5; i++) g.lineTo(pts[i].x, pts[i].y);
        g.stroke(); g.setLineDash([]);
        pts.forEach(function (p, i) {
          g.beginPath(); g.arc(p.x, p.y, p.hit ? 9 : 12 + 2 * Math.sin(t * 4 + i), 0, 7);
          g.fillStyle = p.hit ? GOOD : 'rgba(255,210,62,0.9)';
          g.fill();
        });
        // ship (little bean rocket)
        g.save(); g.translate(ship.x, ship.y);
        g.fillStyle = '#eef2ff';
        g.beginPath(); g.ellipse(0, 0, 12, 16, 0, 0, 7); g.fill();
        g.fillStyle = ACCENT; g.beginPath(); g.ellipse(0, -5, 7, 5, 0, 0, 7); g.fill();
        g.fillStyle = '#ff9d2e';
        g.beginPath(); g.moveTo(-6, 15); g.lineTo(0, 24 + 3 * Math.sin(t * 20)); g.lineTo(6, 15); g.closePath(); g.fill();
        g.restore();
      });
      return function () { stop(); stopLoop(); };
    },
  };

  DEFS.filter = {
    id: 'filter', name: 'Clean Air Filter', kind: 'short', steps: 1, visual: false,
    make: function (el, api) {
      var s = scaffold(el, 'Flick the debris out of the filter');
      var debris = [];
      for (var i = 0; i < 8; i++) {
        debris.push({
          x: 90 + api.rnd() * (s.W - 180), y: 70 + api.rnd() * (s.H - 140),
          vx: 0, vy: 0, held: false, gone: false,
          r: 10 + api.rnd() * 6, hue: 80 + api.rnd() * 60, rot: api.rnd() * 7,
        });
      }
      var grabbed = null, lastP = null;
      var doneCall = once(function () { api.sfx('task_done', { vol: 0.6 }); setTimeout(api.done, 400); });
      var stop = pointer(s.cv, s.W, s.H, {
        down: function (x, y) {
          for (var i = 0; i < debris.length; i++) {
            var d = debris[i];
            if (!d.gone && AL.util.dist(x, y, d.x, d.y) < d.r + 14) { grabbed = d; lastP = { x: x, y: y, t: performance.now() }; break; }
          }
        },
        move: function (x, y) {
          if (!grabbed) return;
          var now = performance.now(), dt = Math.max(1, now - lastP.t);
          grabbed.vx = (x - lastP.x) / dt * 1000; grabbed.vy = (y - lastP.y) / dt * 1000;
          grabbed.x = x; grabbed.y = y;
          lastP = { x: x, y: y, t: now };
        },
        up: function () { grabbed = null; },
      });
      var last = 0;
      var stopLoop = looper(function (t) {
        var dt = Math.min(0.05, t - last); last = t;
        var g = s.g;
        g.fillStyle = '#0c1122'; g.fillRect(0, 0, s.W, s.H);
        // grate
        g.strokeStyle = '#1d2440'; g.lineWidth = 6;
        for (var gx = 30; gx < s.W - 20; gx += 34) { g.beginPath(); g.moveTo(gx, 30); g.lineTo(gx, s.H - 30); g.stroke(); }
        for (var gy = 30; gy < s.H - 20; gy += 34) { g.beginPath(); g.moveTo(30, gy); g.lineTo(s.W - 30, gy); g.stroke(); }
        var left = 0;
        debris.forEach(function (d) {
          if (d.gone) return;
          if (d !== grabbed) {
            d.x += d.vx * dt; d.y += d.vy * dt;
            d.vx *= 0.985; d.vy *= 0.985;
          }
          if (d.x < -25 || d.x > s.W + 25 || d.y < -25 || d.y > s.H + 25) {
            d.gone = true;
            api.sfx('splash', { vol: 0.4 });
            api.progress(debris.filter(function (q) { return q.gone; }).length / 8);
            if (debris.every(function (q) { return q.gone; })) doneCall();
            return;
          }
          left++;
          g.save(); g.translate(d.x, d.y); g.rotate(d.rot + t);
          g.fillStyle = 'hsl(' + d.hue + ',45%,45%)';
          g.beginPath(); g.ellipse(0, 0, d.r, d.r * 0.62, 0, 0, 7); g.fill();
          g.strokeStyle = 'hsl(' + d.hue + ',45%,30%)'; g.lineWidth = 2;
          g.beginPath(); g.moveTo(-d.r * 0.7, 0); g.lineTo(d.r * 0.7, 0); g.stroke();
          g.restore();
        });
        g.fillStyle = TEXT; g.font = 'bold 15px monospace'; g.textAlign = 'left';
        g.fillText('DEBRIS: ' + left, 14, 22);
      });
      return function () { stop(); stopLoop(); };
    },
  };

  DEFS.fuel = {
    id: 'fuel', name: 'Fuel Engines', kind: 'long', steps: 2, visual: false,
    make: function (el, api) {
      var isEngine = api.step === 1;
      var s = scaffold(el, isEngine ? 'Hold the button to fuel the engine' : 'Hold the button to fill the canister');
      var lvl = 0, holding = false, lastG = 0;
      var doneCall = once(function () { api.sfx('task_done', { vol: 0.6 }); setTimeout(api.done, 450); });
      var stop = pointer(s.cv, s.W, s.H, {
        down: function (x, y) { if (x > s.W - 140 && y > s.H - 130) holding = true; },
        up: function () { holding = false; },
      });
      var last = 0;
      var stopLoop = looper(function (t) {
        var dt = Math.min(0.05, t - last); last = t;
        if (holding && lvl < 1) {
          lvl = Math.min(1, lvl + dt * 0.24);
          api.progress(lvl);
          if (t - lastG > 0.4) { lastG = t; api.sfx('splash', { vol: 0.25 }); }
          if (lvl >= 1) doneCall();
        }
        var g = s.g;
        g.fillStyle = '#0c1122'; g.fillRect(0, 0, s.W, s.H);
        // tank
        var tx = 80, ty = 50, tw = 140, th = 210;
        g.strokeStyle = LINE; g.lineWidth = 3; roundRect(g, tx, ty, tw, th, 12); g.stroke();
        g.fillStyle = '#161d38'; roundRect(g, tx, ty, tw, th, 12); g.fill();
        var fh = (th - 12) * lvl;
        if (lvl > 0.01) {
          g.fillStyle = 'rgba(255,157,46,0.85)';
          roundRect(g, tx + 5, ty + th - 6 - fh, tw - 10, fh, 6); g.fill();
          // wobble surface
          g.fillStyle = 'rgba(255,200,120,0.9)';
          for (var w = 0; w < tw - 10; w += 8) {
            g.fillRect(tx + 5 + w, ty + th - 8 - fh + Math.sin(t * 6 + w) * 2, 7, 3);
          }
        }
        g.fillStyle = TEXT; g.font = 'bold 15px monospace'; g.textAlign = 'center';
        g.fillText(isEngine ? 'ENGINE' : 'CANISTER', tx + tw / 2, ty - 12);
        g.fillText(Math.floor(lvl * 100) + '%', tx + tw / 2, ty + th + 24);
        // hose
        g.strokeStyle = '#3a4573'; g.lineWidth = 10;
        g.beginPath(); g.moveTo(s.W - 74, s.H - 120);
        g.bezierCurveTo(s.W - 90, 150, tx + tw + 60, 90, tx + tw - 4, ty + 40);
        g.stroke();
        // hold button
        g.fillStyle = holding ? GOOD : '#1d2440';
        roundRect(g, s.W - 134, s.H - 124, 118, 100, 14); g.fill();
        g.strokeStyle = holding ? GOOD : LINE; g.lineWidth = 3; g.stroke();
        g.fillStyle = holding ? '#05070f' : TEXT; g.font = 'bold 16px monospace';
        g.fillText('HOLD', s.W - 75, s.H - 68);
      });
      return function () { stop(); stopLoop(); };
    },
  };

  DEFS.divert = {
    id: 'divert', name: 'Divert Power', kind: 'short', steps: 2, visual: false,
    make: function (el, api) {
      if (api.step === 0) {
        var s = scaffold(el, 'Pull the breaker lever up to divert power');
        var lever = 0, dragging = false;
        var doneCall = once(function () { api.sfx('task_done', { vol: 0.55 }); setTimeout(api.done, 450); });
        var stop = pointer(s.cv, s.W, s.H, {
          down: function (x, y) { if (Math.abs(x - s.W / 2) < 70) dragging = true; },
          move: function (x, y) {
            if (!dragging) return;
            lever = AL.util.clamp((s.H - 70 - y) / (s.H - 150), 0, 1);
            if (lever >= 1) { dragging = false; doneCall(); }
          },
          up: function () { dragging = false; if (lever < 1) lever = 0; },
        });
        var stopLoop = looper(function (t) {
          var g = s.g;
          g.fillStyle = '#0c1122'; g.fillRect(0, 0, s.W, s.H);
          g.fillStyle = '#161d38'; roundRect(g, s.W / 2 - 80, 40, 160, s.H - 80, 14); g.fill();
          g.strokeStyle = LINE; g.stroke();
          // slot
          g.fillStyle = '#05070f'; roundRect(g, s.W / 2 - 10, 70, 20, s.H - 150, 10); g.fill();
          var ly = (s.H - 80) - lever * (s.H - 150);
          // handle
          g.fillStyle = lever >= 1 ? GOOD : WARN;
          roundRect(g, s.W / 2 - 52, ly - 18, 104, 36, 10); g.fill();
          g.fillStyle = '#05070f'; g.font = 'bold 14px monospace'; g.textAlign = 'center';
          g.fillText(lever >= 1 ? 'ON' : 'PULL', s.W / 2, ly + 5);
          for (var b = 0; b < 5; b++) {
            g.fillStyle = lever * 5 > b ? GOOD : '#1d2440';
            g.fillRect(s.W / 2 + 96, s.H - 90 - b * 34, 18, 24);
          }
        });
        return function () { stop(); stopLoop(); };
      }
      // step 1: accept power
      var s2 = scaffold(el, 'Tap the live node to accept the diverted power');
      var liveIdx = Math.floor(api.rnd() * 6);
      var doneCall2 = once(function () { api.sfx('task_done', { vol: 0.55 }); setTimeout(api.done, 400); });
      var stop2 = pointer(s2.cv, s2.W, s2.H, {
        down: function (x, y) {
          for (var i = 0; i < 6; i++) {
            var nx = 70 + (i % 3) * 150, ny = 100 + Math.floor(i / 3) * 130;
            if (AL.util.dist(x, y, nx, ny) < 40) {
              if (i === liveIdx) doneCall2();
              else api.sfx('card_bad', { vol: 0.4 });
            }
          }
        },
      });
      var stopLoop2 = looper(function (t) {
        var g = s2.g;
        g.fillStyle = '#0c1122'; g.fillRect(0, 0, s2.W, s2.H);
        for (var i = 0; i < 6; i++) {
          var nx = 70 + (i % 3) * 150, ny = 100 + Math.floor(i / 3) * 130;
          g.strokeStyle = '#3a4573'; g.lineWidth = 4;
          g.beginPath(); g.moveTo(nx, ny); g.lineTo(nx, s2.H); g.stroke();
          var live = i === liveIdx && Math.sin(t * 8) > -0.3;
          g.beginPath(); g.arc(nx, ny, 26, 0, 7);
          g.fillStyle = live ? 'rgba(255,210,62,0.9)' : '#161d38';
          g.fill();
          g.strokeStyle = live ? WARN : LINE; g.lineWidth = 3; g.stroke();
          if (live) {
            g.strokeStyle = 'rgba(255,210,62,0.7)'; g.lineWidth = 2;
            g.beginPath(); g.moveTo(nx - 8, ny - 6); g.lineTo(nx + 2, ny); g.lineTo(nx - 4, ny + 8); g.stroke();
          }
        }
      });
      return function () { stop2(); stopLoop2(); };
    },
  };

  DEFS.unlock = {
    id: 'unlock', name: 'Unlock Manifolds', kind: 'short', steps: 1, visual: false,
    make: function (el, api) {
      var s = scaffold(el, 'Rotate the dial to each marked angle — 3 clicks');
      var targets = [];
      for (var i = 0; i < 3; i++) targets.push((api.rnd() * 0.7 + 0.15 + i) * (Math.PI * 2 / 3));
      var cur = 0, curAng = -Math.PI / 2, dragging = false, prevA = 0;
      var cx = s.W / 2, cy = s.H / 2 + 10;
      var doneCall = once(function () { api.sfx('task_done', { vol: 0.6 }); setTimeout(api.done, 450); });
      var stop = pointer(s.cv, s.W, s.H, {
        down: function (x, y) { dragging = true; prevA = Math.atan2(y - cy, x - cx); },
        move: function (x, y) {
          if (!dragging) return;
          var a = Math.atan2(y - cy, x - cx);
          var d = a - prevA;
          if (d > Math.PI) d -= Math.PI * 2;
          if (d < -Math.PI) d += Math.PI * 2;
          curAng += d; prevA = a;
          if (cur < 3) {
            var tgt = targets[cur] - Math.PI / 2;
            var diff = Math.abs(((curAng - tgt) % (Math.PI * 2) + Math.PI * 3) % (Math.PI * 2) - Math.PI);
            if (diff > Math.PI - 0.12) {
              cur++;
              api.sfx('card_ok', { vol: 0.6 });
              api.progress(cur / 3);
              if (cur >= 3) doneCall();
            }
          }
        },
        up: function () { dragging = false; },
      });
      var stopLoop = looper(function (t) {
        var g = s.g;
        g.fillStyle = '#0c1122'; g.fillRect(0, 0, s.W, s.H);
        // dial body
        g.beginPath(); g.arc(cx, cy, 96, 0, 7);
        g.fillStyle = '#161d38'; g.fill();
        g.strokeStyle = LINE; g.lineWidth = 4; g.stroke();
        // target ticks
        targets.forEach(function (tg, i) {
          var a = tg - Math.PI / 2;
          g.strokeStyle = i < cur ? GOOD : (i === cur ? WARN : '#3a4573');
          g.lineWidth = i === cur ? 7 : 5;
          g.beginPath();
          g.moveTo(cx + Math.cos(a) * 100, cy + Math.sin(a) * 100);
          g.lineTo(cx + Math.cos(a) * 116, cy + Math.sin(a) * 116);
          g.stroke();
        });
        // knurled edge
        for (var k = 0; k < 24; k++) {
          var ka = k / 24 * Math.PI * 2 + curAng;
          g.fillStyle = '#2c3560';
          g.beginPath(); g.arc(cx + Math.cos(ka) * 88, cy + Math.sin(ka) * 88, 4, 0, 7); g.fill();
        }
        // pointer
        g.strokeStyle = ACCENT; g.lineWidth = 6; g.lineCap = 'round';
        g.beginPath(); g.moveTo(cx, cy); g.lineTo(cx + Math.cos(curAng) * 70, cy + Math.sin(curAng) * 70); g.stroke();
        g.fillStyle = '#0c1122'; g.beginPath(); g.arc(cx, cy, 16, 0, 7); g.fill();
        g.strokeStyle = LINE; g.lineWidth = 3; g.stroke();
        g.fillStyle = TEXT; g.font = 'bold 15px monospace'; g.textAlign = 'center';
        g.fillText(cur + ' / 3', cx, cy - 120);
      });
      return function () { stop(); stopLoop(); };
    },
  };

  DEFS.scan = {
    id: 'scan', name: 'Submit Scan', kind: 'long', steps: 1, visual: true,
    make: function (el, api) {
      var s = scaffold(el, 'Hold still — medical scan in progress');
      var T = 8, t0 = performance.now();
      var lastBeep = 0;
      var doneCall = once(function () { api.sfx('task_done', { vol: 0.6 }); setTimeout(api.done, 500); });
      var READ = ['ID: CREW-' + Math.floor(1000 + api.rnd() * 9000), 'HEIGHT: 3\'6"', 'WEIGHT: 92 LBS', 'BLOOD: B+', 'STATUS: ...'];
      var stopLoop = looper(function (t) {
        var elapsed = (performance.now() - t0) / 1000;
        var p = Math.min(1, elapsed / T);
        api.progress(p);
        if (elapsed - lastBeep > 1) { lastBeep = elapsed; api.sfx('scan_beep', { vol: 0.6 }); }
        if (p >= 1) doneCall();
        var g = s.g;
        g.fillStyle = '#0c1122'; g.fillRect(0, 0, s.W, s.H);
        // scanner pad
        g.beginPath(); g.ellipse(s.W / 2, s.H - 50, 90, 22, 0, 0, 7);
        g.fillStyle = '#161d38'; g.fill(); g.strokeStyle = ACCENT; g.lineWidth = 2; g.stroke();
        // bean silhouette
        g.fillStyle = 'rgba(53,224,255,0.25)';
        g.beginPath(); g.ellipse(s.W / 2, s.H - 130, 40, 62, 0, 0, 7); g.fill();
        g.fillStyle = 'rgba(53,224,255,0.4)';
        g.beginPath(); g.ellipse(s.W / 2 + 12, s.H - 158, 24, 15, 0, 0, 7); g.fill();
        // rings
        for (var r = 0; r < 3; r++) {
          var ry = s.H - 50 - ((elapsed * 40 + r * 55) % 160);
          var k = 1 - (s.H - 50 - ry) / 160;
          g.strokeStyle = 'rgba(62,224,111,' + (0.5 * k) + ')';
          g.lineWidth = 3;
          g.beginPath(); g.ellipse(s.W / 2, ry, 90 * (0.6 + 0.4 * k), 20 * (0.6 + 0.4 * k), 0, 0, 7); g.stroke();
        }
        // readout
        g.font = '13px monospace'; g.textAlign = 'left';
        for (var i = 0; i < READ.length; i++) {
          var show = p * READ.length * 1.2 > i;
          if (!show) continue;
          var txt = READ[i];
          if (i === READ.length - 1 && p >= 1) txt = 'STATUS: HEALTHY';
          g.fillStyle = i === READ.length - 1 && p >= 1 ? GOOD : 'rgba(62,224,111,0.8)';
          g.fillText(txt, 20, 40 + i * 22);
        }
        // progress arc
        g.strokeStyle = GOOD; g.lineWidth = 5;
        g.beginPath(); g.arc(s.W - 50, 50, 26, -Math.PI / 2, -Math.PI / 2 + p * Math.PI * 2); g.stroke();
        g.fillStyle = TEXT; g.font = 'bold 13px monospace'; g.textAlign = 'center';
        g.fillText(Math.ceil(T - elapsed) + 's', s.W - 50, 55);
      });
      return function () { stopLoop(); };
    },
  };

  DEFS.steer = {
    id: 'steer', name: 'Stabilize Steering', kind: 'short', steps: 1, visual: false,
    make: function (el, api) {
      var s = scaffold(el, 'Keep the crosshair inside the target zone');
      var cx = s.W / 2, cy = s.H / 2;
      var pos = { x: cx, y: cy }, vel = { x: 30, y: -20 };
      var hold = 0, NEED = 5, seedT = api.rnd() * 100;
      var ptr = null;
      var doneCall = once(function () { api.sfx('task_done', { vol: 0.6 }); setTimeout(api.done, 450); });
      var stop = pointer(s.cv, s.W, s.H, {
        down: function (x, y) { ptr = { x: x, y: y }; },
        move: function (x, y, dn) { if (dn) ptr = { x: x, y: y }; },
        up: function () { ptr = null; },
      });
      var last = 0;
      var stopLoop = looper(function (t) {
        var dt = Math.min(0.05, t - last); last = t;
        // drift forces
        vel.x += Math.sin(t * 1.7 + seedT) * 260 * dt;
        vel.y += Math.cos(t * 1.3 + seedT * 2) * 260 * dt;
        if (ptr) {
          vel.x += (ptr.x - pos.x) * 6 * dt * 4;
          vel.y += (ptr.y - pos.y) * 6 * dt * 4;
          vel.x *= 0.92; vel.y *= 0.92;
        }
        pos.x = AL.util.clamp(pos.x + vel.x * dt, 20, s.W - 20);
        pos.y = AL.util.clamp(pos.y + vel.y * dt, 20, s.H - 20);
        var inside = AL.util.dist(pos.x, pos.y, cx, cy) < 60;
        if (inside) { hold += dt; api.progress(Math.min(1, hold / NEED)); if (hold >= NEED) doneCall(); }
        else hold = Math.max(0, hold - dt * 0.6);
        var g = s.g;
        g.fillStyle = '#05070f'; g.fillRect(0, 0, s.W, s.H);
        for (var st = 0; st < 30; st++) {
          g.fillStyle = 'rgba(234,240,255,0.3)';
          g.fillRect((st * 89 + t * 12) % s.W, (st * 53) % s.H, 2, 2);
        }
        // target zone
        g.beginPath(); g.arc(cx, cy, 60, 0, 7);
        g.fillStyle = inside ? 'rgba(62,224,111,0.12)' : 'rgba(53,224,255,0.07)'; g.fill();
        g.strokeStyle = inside ? GOOD : ACCENT; g.lineWidth = 2; g.setLineDash([8, 6]); g.stroke(); g.setLineDash([]);
        // crosshair
        g.strokeStyle = inside ? GOOD : WARN; g.lineWidth = 3;
        g.beginPath(); g.arc(pos.x, pos.y, 16, 0, 7); g.stroke();
        g.beginPath(); g.moveTo(pos.x - 26, pos.y); g.lineTo(pos.x + 26, pos.y);
        g.moveTo(pos.x, pos.y - 26); g.lineTo(pos.x, pos.y + 26); g.stroke();
        // hold bar
        g.fillStyle = '#05070f'; roundRect(g, 40, s.H - 34, s.W - 80, 16, 8); g.fill();
        g.fillStyle = GOOD;
        if (hold > 0.05) { roundRect(g, 42, s.H - 32, (s.W - 84) * Math.min(1, hold / NEED), 12, 6); g.fill(); }
      });
      return function () { stop(); stopLoop(); };
    },
  };

  DEFS.trash = {
    id: 'trash', name: 'Empty Garbage', kind: 'short', steps: 2, visual: false,
    make: function (el, api) {
      var s = scaffold(el, 'Hold the lever to flush the garbage');
      var open = 0, holding = false;
      var junk = [];
      for (var i = 0; i < 14; i++) {
        junk.push({ x: 90 + api.rnd() * 180, y: 60 + api.rnd() * 140, vx: 0, vy: 0, r: 5 + api.rnd() * 7, hue: api.rnd() * 360, out: false });
      }
      var doneCall = once(function () { api.sfx('task_done', { vol: 0.55 }); setTimeout(api.done, 400); });
      var stop = pointer(s.cv, s.W, s.H, {
        down: function (x, y) { if (x > s.W - 120) holding = true; },
        up: function () { holding = false; },
      });
      var last = 0;
      var stopLoop = looper(function (t) {
        var dt = Math.min(0.05, t - last); last = t;
        open = AL.util.clamp(open + (holding ? dt * 1.6 : -dt * 2.5), 0, 1);
        var g = s.g;
        g.fillStyle = '#0c1122'; g.fillRect(0, 0, s.W, s.H);
        // chute
        g.strokeStyle = LINE; g.lineWidth = 3;
        g.strokeRect(70, 40, 220, 200);
        // hatch at bottom opens
        g.fillStyle = '#161d38'; g.fillRect(70, 240, 220 * (1 - open), 14);
        var remaining = 0;
        junk.forEach(function (j) {
          if (j.out) return;
          if (open > 0.6) {
            j.vy += 500 * dt;
            j.vx += (180 - j.x) * 0.4 * dt;
          }
          j.x += j.vx * dt; j.y += j.vy * dt;
          if (j.y > s.H + 30) {
            j.out = true;
            api.sfx('splash', { vol: 0.2 });
            if (junk.every(function (q) { return q.out; })) doneCall();
            return;
          }
          if (j.y > 232 - j.r && open <= 0.6) { j.y = 232 - j.r; j.vy = 0; j.vx *= 0.9; }
          remaining++;
          g.fillStyle = 'hsl(' + j.hue + ',35%,42%)';
          g.beginPath(); g.arc(j.x, j.y, j.r, 0, 7); g.fill();
        });
        api.progress(1 - remaining / junk.length);
        // stars visible below when open
        if (open > 0.2) {
          g.fillStyle = 'rgba(5,7,15,' + open + ')';
          g.fillRect(72, 254, 216, 60);
        }
        // lever
        g.fillStyle = '#161d38'; roundRect(g, s.W - 110, 60, 70, 200, 12); g.fill();
        g.strokeStyle = LINE; g.stroke();
        var ly = 80 + open * 140;
        g.strokeStyle = '#3a4573'; g.lineWidth = 8;
        g.beginPath(); g.moveTo(s.W - 75, 80); g.lineTo(s.W - 75, 240); g.stroke();
        g.fillStyle = holding ? WARN : '#8b96c9';
        g.beginPath(); g.arc(s.W - 75, ly, 20, 0, 7); g.fill();
        g.fillStyle = '#05070f'; g.font = 'bold 11px monospace'; g.textAlign = 'center';
        g.fillText('HOLD', s.W - 75, ly + 4);
      });
      return function () { stop(); stopLoop(); };
    },
  };

  /* =============================================================
     SABOTAGE FIX PANELS
     ============================================================= */

  DEFS.sab_lights = {
    id: 'sab_lights', name: 'Fix Lights', kind: 'sab', steps: 1, visual: false,
    make: function (el, api) {
      var s = scaffold(el, 'Flip all the breakers up');
      var sw = [];
      for (var i = 0; i < 5; i++) sw.push(api.rnd() < 0.5);
      if (sw.every(function (v) { return v; })) sw[2] = false;
      var doneCall = once(function () { api.sfx('sab_fixed', { vol: 0.8 }); setTimeout(api.done, 350); });
      var stop = pointer(s.cv, s.W, s.H, {
        down: function (x, y) {
          for (var i = 0; i < 5; i++) {
            var sx = 60 + i * 82;
            if (Math.abs(x - sx) < 32 && y > 80 && y < 240) {
              sw[i] = !sw[i];
              api.sfx('use', { vol: 0.6 });
              if (sw.every(function (v) { return v; })) doneCall();
            }
          }
        },
      });
      var stopLoop = looper(function (t) {
        var g = s.g;
        g.fillStyle = '#0c1122'; g.fillRect(0, 0, s.W, s.H);
        g.fillStyle = '#161d38'; roundRect(g, 20, 50, s.W - 40, 220, 14); g.fill();
        g.strokeStyle = LINE; g.lineWidth = 3; g.stroke();
        for (var i = 0; i < 5; i++) {
          var sx = 60 + i * 82;
          g.fillStyle = '#05070f'; roundRect(g, sx - 22, 90, 44, 130, 8); g.fill();
          var on = sw[i];
          g.fillStyle = on ? GOOD : BAD;
          roundRect(g, sx - 18, on ? 96 : 158, 36, 56, 6); g.fill();
          g.fillStyle = on ? 'rgba(62,224,111,0.9)' : '#1d2440';
          g.beginPath(); g.arc(sx, 250, 7, 0, 7); g.fill();
        }
      });
      return function () { stop(); stopLoop(); };
    },
  };

  DEFS.sab_comms = {
    id: 'sab_comms', name: 'Restore Comms', kind: 'sab', steps: 1, visual: false,
    make: function (el, api) {
      var s = scaffold(el, 'Drag the dial until the waveforms align');
      var target = 0.25 + api.rnd() * 0.5;
      var val = api.rnd();
      while (Math.abs(val - target) < 0.2) val = api.rnd();
      var dragging = false, matchT = 0, lastBeep = 0;
      var doneCall = once(function () { api.sfx('sab_fixed', { vol: 0.8 }); setTimeout(api.done, 400); });
      var stop = pointer(s.cv, s.W, s.H, {
        down: function (x, y) { if (y > s.H - 90) dragging = true; },
        move: function (x, y) { if (dragging) val = AL.util.clamp((x - 50) / (s.W - 100), 0, 1); },
        up: function () { dragging = false; },
      });
      var last = 0;
      var stopLoop = looper(function (t) {
        var dt = Math.min(0.05, t - last); last = t;
        var err = Math.abs(val - target);
        var matched = err < 0.035;
        if (matched) { matchT += dt; if (matchT > 1.2) doneCall(); }
        else matchT = 0;
        if (t - lastBeep > 0.25) {
          lastBeep = t;
          api.sfx('download_tick', { vol: AL.util.clamp(1 - err * 2.5, 0.1, 0.8) });
        }
        var g = s.g;
        g.fillStyle = '#0c1122'; g.fillRect(0, 0, s.W, s.H);
        // scope
        g.fillStyle = '#05070f'; roundRect(g, 20, 20, s.W - 40, 170, 10); g.fill();
        g.strokeStyle = LINE; g.stroke();
        function wave(freq, amp, col, phase) {
          g.strokeStyle = col; g.lineWidth = 2.5;
          g.beginPath();
          for (var x = 0; x <= s.W - 56; x += 3) {
            var y = 105 + Math.sin(x * 0.05 * freq + t * 3 + (phase || 0)) * amp;
            if (x === 0) g.moveTo(28 + x, y); else g.lineTo(28 + x, y);
          }
          g.stroke();
        }
        wave(1 + target * 3, 46, 'rgba(62,224,111,0.55)');
        wave(1 + val * 3, 46, matched ? GOOD : ACCENT);
        if (matched) {
          g.fillStyle = GOOD; g.font = 'bold 14px monospace'; g.textAlign = 'center';
          g.fillText('SIGNAL LOCKING ' + Math.floor(matchT / 1.2 * 100) + '%', s.W / 2, 40);
        }
        // slider
        g.fillStyle = '#161d38'; roundRect(g, 40, s.H - 70, s.W - 80, 40, 20); g.fill();
        g.strokeStyle = LINE; g.stroke();
        var hx = 50 + val * (s.W - 100);
        g.fillStyle = matched ? GOOD : ACCENT;
        g.beginPath(); g.arc(hx, s.H - 50, 24, 0, 7); g.fill();
      });
      return function () { stop(); stopLoop(); };
    },
  };

  DEFS.sab_reactor = {
    id: 'sab_reactor', name: 'Stabilize Reactor', kind: 'sab', steps: 1, visual: false,
    make: function (el, api) {
      var s = scaffold(el, 'HOLD your hand on the pad — both consoles at once!');
      var holding = false, held = 0;
      var stop = pointer(s.cv, s.W, s.H, {
        down: function () { holding = true; },
        up: function () { holding = false; held = 0; api.progress(0); },
      });
      var last = 0;
      var stopLoop = looper(function (t) {
        var dt = Math.min(0.05, t - last); last = t;
        if (holding) {
          held = Math.min(2.5, held + dt);
          api.progress(held / 2.5);
        }
        var g = s.g;
        g.fillStyle = '#0c1122'; g.fillRect(0, 0, s.W, s.H);
        // warning glow
        g.fillStyle = 'rgba(255,56,96,' + (0.08 + 0.06 * Math.sin(t * 6)) + ')';
        g.fillRect(0, 0, s.W, s.H);
        // hand pad
        var padCol = holding ? (held >= 2.5 ? GOOD : WARN) : BAD;
        g.beginPath(); g.arc(s.W / 2, s.H / 2 + 10, 84, 0, 7);
        g.fillStyle = '#161d38'; g.fill();
        g.strokeStyle = padCol; g.lineWidth = 5; g.stroke();
        // hand shape
        g.fillStyle = holding ? 'rgba(255,210,62,0.25)' : 'rgba(53,224,255,0.15)';
        g.beginPath(); g.ellipse(s.W / 2, s.H / 2 + 26, 30, 38, 0, 0, 7); g.fill();
        for (var f = 0; f < 4; f++) {
          g.beginPath();
          g.ellipse(s.W / 2 - 21 + f * 14, s.H / 2 - 16, 7, 22, (f - 1.5) * 0.12, 0, 7);
          g.fill();
        }
        g.beginPath(); g.ellipse(s.W / 2 - 38, s.H / 2 + 14, 8, 18, 0.8, 0, 7); g.fill();
        // progress ring
        if (held > 0) {
          g.strokeStyle = held >= 2.5 ? GOOD : ACCENT; g.lineWidth = 7;
          g.beginPath(); g.arc(s.W / 2, s.H / 2 + 10, 96, -Math.PI / 2, -Math.PI / 2 + (held / 2.5) * Math.PI * 2); g.stroke();
        }
        g.fillStyle = held >= 2.5 ? GOOD : TEXT;
        g.font = 'bold 15px monospace'; g.textAlign = 'center';
        g.fillText(held >= 2.5 ? 'HOLDING — WAITING FOR SECOND CONSOLE' : (holding ? 'SCANNING...' : 'PLACE HAND ON PAD'), s.W / 2, 36);
      });
      return function () { stop(); stopLoop(); };
    },
  };

  DEFS.sab_o2 = {
    id: 'sab_o2', name: 'Enter O2 Code', kind: 'sab', steps: 1, visual: false,
    make: function (el, api) {
      var code = (api.data && api.data.code) || '12345';
      var entered = '';
      el.innerHTML = '';
      var wrap = document.createElement('div');
      wrap.className = 'al-tk';
      var hint = document.createElement('div');
      hint.className = 'al-tk-hint';
      hint.textContent = 'Enter the code from the O2 canister slip';
      wrap.appendChild(hint);
      // code slip
      var slip = document.createElement('div');
      slip.style.cssText = 'background:#f5f0dc;color:#3a3428;font-family:monospace;font-weight:bold;text-align:center;' +
        'padding:6px 10px;border-radius:4px;margin:0 auto;transform:rotate(-2deg);box-shadow:0 3px 8px rgba(0,0,0,.4);font-size:15px;';
      slip.textContent = 'O2 CODE: ' + code;
      wrap.appendChild(slip);
      // display
      var disp = document.createElement('div');
      disp.style.cssText = 'background:#05070f;color:' + GOOD + ';font-family:monospace;font-size:26px;letter-spacing:10px;' +
        'text-align:center;padding:8px;border-radius:8px;border:2px solid ' + LINE + ';min-height:34px;';
      wrap.appendChild(disp);
      // keypad
      var pad = document.createElement('div');
      pad.style.cssText = 'display:grid;grid-template-columns:repeat(3,1fr);gap:6px;flex:1;';
      wrap.appendChild(pad);
      el.appendChild(wrap);
      var doneCall = once(function () { api.sfx('sab_fixed', { vol: 0.8 }); setTimeout(api.done, 400); });
      function upd() { disp.textContent = entered.padEnd(5, '_'); }
      upd();
      ['1', '2', '3', '4', '5', '6', '7', '8', '9', 'C', '0', 'OK'].forEach(function (k) {
        var b = document.createElement('button');
        b.className = 'al-tk-btn';
        b.textContent = k;
        b.style.fontSize = '18px';
        if (k === 'OK') b.style.color = GOOD;
        if (k === 'C') b.style.color = BAD;
        b.addEventListener('click', function () {
          if (k === 'C') { entered = ''; api.sfx('ui_back'); }
          else if (k === 'OK') {
            if (entered === code) { disp.style.color = GOOD; doneCall(); }
            else { entered = ''; disp.style.color = BAD; api.sfx('card_bad'); setTimeout(function () { disp.style.color = GOOD; upd(); }, 350); disp.textContent = 'ERROR'; return; }
          } else if (entered.length < 5) { entered += k; api.sfx('download_tick', { vol: 0.8 }); }
          upd();
        });
        pad.appendChild(b);
      });
      return function () {};
    },
  };

  /* ---------- map marker icons ---------- */

  function icon(taskId, ctx, x, y, size) {
    if (!ctx) return;
    var r = (size || 16) / 2;
    ctx.save();
    ctx.translate(x, y);
    ctx.strokeStyle = ctx.fillStyle;
    ctx.lineWidth = Math.max(1.5, r * 0.22);
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    var t = (taskId || '').replace('sab_', '');
    ctx.beginPath();
    switch (t) {
      case 'wires':
        ctx.moveTo(-r, -r * 0.5); ctx.bezierCurveTo(0, -r * 0.5, 0, r * 0.5, r, r * 0.5); ctx.stroke();
        break;
      case 'swipe':
        ctx.rect(-r, -r * 0.65, r * 2, r * 1.3); ctx.stroke();
        ctx.beginPath(); ctx.moveTo(-r, -r * 0.15); ctx.lineTo(r, -r * 0.15); ctx.stroke();
        break;
      case 'upload':
        ctx.moveTo(0, r * 0.7); ctx.lineTo(0, -r * 0.7); ctx.moveTo(-r * 0.6, 0); ctx.lineTo(0, -r * 0.7); ctx.lineTo(r * 0.6, 0); ctx.stroke();
        break;
      case 'asteroids':
        ctx.arc(0, 0, r * 0.7, 0, 7); ctx.stroke();
        ctx.beginPath(); ctx.moveTo(-r, 0); ctx.lineTo(r, 0); ctx.moveTo(0, -r); ctx.lineTo(0, r); ctx.stroke();
        break;
      case 'shields':
        ctx.moveTo(0, -r); ctx.lineTo(r * 0.85, -r * 0.3); ctx.lineTo(r * 0.6, r * 0.8); ctx.lineTo(-r * 0.6, r * 0.8); ctx.lineTo(-r * 0.85, -r * 0.3); ctx.closePath(); ctx.stroke();
        break;
      case 'calibrate':
        ctx.arc(0, 0, r * 0.8, 0, 7); ctx.stroke();
        ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(r * 0.5, -r * 0.5); ctx.stroke();
        break;
      case 'chart':
        ctx.moveTo(-r, r * 0.6); ctx.lineTo(-r * 0.2, -r * 0.2); ctx.lineTo(r * 0.3, r * 0.2); ctx.lineTo(r, -r * 0.7); ctx.stroke();
        break;
      case 'filter':
        ctx.moveTo(-r, -r * 0.6); ctx.lineTo(r, -r * 0.6); ctx.moveTo(-r, 0); ctx.lineTo(r, 0); ctx.moveTo(-r, r * 0.6); ctx.lineTo(r, r * 0.6); ctx.stroke();
        break;
      case 'fuel':
        ctx.rect(-r * 0.7, -r * 0.8, r * 1.4, r * 1.6); ctx.stroke();
        ctx.beginPath(); ctx.moveTo(-r * 0.4, r * 0.3); ctx.lineTo(r * 0.4, r * 0.3); ctx.stroke();
        break;
      case 'divert':
        ctx.moveTo(-r * 0.7, r * 0.8); ctx.lineTo(-r * 0.7, -r * 0.3); ctx.moveTo(-r * 0.7, -r * 0.3); ctx.lineTo(r * 0.7, -r * 0.8); ctx.stroke();
        break;
      case 'unlock':
        ctx.arc(0, r * 0.2, r * 0.55, 0, 7); ctx.stroke();
        ctx.beginPath(); ctx.arc(0, -r * 0.35, r * 0.4, Math.PI, 0); ctx.stroke();
        break;
      case 'scan':
        ctx.ellipse(0, r * 0.5, r * 0.8, r * 0.3, 0, 0, 7); ctx.stroke();
        ctx.beginPath(); ctx.ellipse(0, -r * 0.2, r * 0.5, r * 0.2, 0, 0, 7); ctx.stroke();
        break;
      case 'steer':
        ctx.arc(0, 0, r * 0.8, 0, 7); ctx.stroke();
        ctx.beginPath(); ctx.moveTo(0, -r * 0.8); ctx.lineTo(0, -r * 0.3); ctx.moveTo(0, r * 0.3); ctx.lineTo(0, r * 0.8);
        ctx.moveTo(-r * 0.8, 0); ctx.lineTo(-r * 0.3, 0); ctx.moveTo(r * 0.3, 0); ctx.lineTo(r * 0.8, 0); ctx.stroke();
        break;
      case 'trash':
        ctx.moveTo(-r * 0.6, -r * 0.5); ctx.lineTo(-r * 0.45, r * 0.8); ctx.lineTo(r * 0.45, r * 0.8); ctx.lineTo(r * 0.6, -r * 0.5); ctx.closePath(); ctx.stroke();
        ctx.beginPath(); ctx.moveTo(-r * 0.8, -r * 0.5); ctx.lineTo(r * 0.8, -r * 0.5); ctx.stroke();
        break;
      case 'lights':
        ctx.arc(0, -r * 0.15, r * 0.55, 0, 7); ctx.stroke();
        ctx.beginPath(); ctx.moveTo(-r * 0.25, r * 0.55); ctx.lineTo(r * 0.25, r * 0.55); ctx.stroke();
        break;
      case 'comms':
        ctx.arc(0, r * 0.4, r * 0.25, 0, 7); ctx.stroke();
        ctx.beginPath(); ctx.arc(0, r * 0.4, r * 0.65, -Math.PI * 0.8, -Math.PI * 0.2); ctx.stroke();
        ctx.beginPath(); ctx.arc(0, r * 0.4, r, -Math.PI * 0.75, -Math.PI * 0.25); ctx.stroke();
        break;
      case 'reactor':
        ctx.arc(0, 0, r * 0.3, 0, 7); ctx.stroke();
        for (var i = 0; i < 3; i++) {
          var a = i / 3 * Math.PI * 2 - Math.PI / 2;
          ctx.beginPath(); ctx.arc(0, 0, r * 0.75, a - 0.4, a + 0.4); ctx.stroke();
        }
        break;
      case 'o2':
        ctx.arc(-r * 0.3, 0, r * 0.5, 0, 7); ctx.stroke();
        ctx.beginPath(); ctx.arc(r * 0.45, r * 0.3, r * 0.3, 0, 7); ctx.stroke();
        break;
      default:
        ctx.arc(0, 0, r * 0.6, 0, 7); ctx.stroke();
    }
    ctx.restore();
  }

  AL.tasks = { DEFS: DEFS, icon: icon };
})();
