/* Outcast — audio.js: Web Audio synth engine, composed soundtrack, SFX
   Everything synthesized live. No samples, no beeps-as-music. */
(function () {
  'use strict';
  window.AL = window.AL || {};

  var ctx = null;
  var comp, musicBus, sfxBus, revIn, delIn, delayNode;
  var musicVol = 0.8, sfxVol = 0.9;
  var noiseBuf = null;
  var params = { intensity: 0 };

  function mtof(m) { return 440 * Math.pow(2, (m - 69) / 12); }
  function jit() { return (Math.random() - 0.5) * 0.008; }

  /* ================= graph ================= */

  function init() {
    if (ctx) {
      if (ctx.state === 'suspended') { try { ctx.resume(); } catch (e) {} }
      return;
    }
    var AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    ctx = new AC();

    comp = ctx.createDynamicsCompressor();
    comp.threshold.value = -18; comp.knee.value = 12; comp.ratio.value = 3;
    comp.attack.value = 0.006; comp.release.value = 0.24;
    comp.connect(ctx.destination);

    musicBus = ctx.createGain(); musicBus.gain.value = musicVol * 0.9; musicBus.connect(comp);
    sfxBus = ctx.createGain(); sfxBus.gain.value = sfxVol; sfxBus.connect(comp);

    // reverb: synthesized stereo impulse, exp decay, darkened
    var conv = ctx.createConvolver();
    var seconds = 2.6, rate = ctx.sampleRate, len = Math.floor(seconds * rate);
    var imp = ctx.createBuffer(2, len, rate);
    for (var chn = 0; chn < 2; chn++) {
      var d = imp.getChannelData(chn), last = 0;
      for (var i = 0; i < len; i++) {
        var w = (Math.random() * 2 - 1) * Math.pow(1 - i / len, 2.2);
        last = last * 0.62 + w * 0.38; // cheap lowpass -> darker tail
        d[i] = last;
      }
    }
    conv.buffer = imp;
    revIn = ctx.createGain(); revIn.gain.value = 1;
    var revOut = ctx.createGain(); revOut.gain.value = 0.85;
    revIn.connect(conv); conv.connect(revOut); revOut.connect(comp);

    // feedback delay
    delayNode = ctx.createDelay(1.5); delayNode.delayTime.value = 0.28;
    var fb = ctx.createGain(); fb.gain.value = 0.34;
    var dFilt = ctx.createBiquadFilter(); dFilt.type = 'lowpass'; dFilt.frequency.value = 2600;
    var delOut = ctx.createGain(); delOut.gain.value = 0.55;
    delIn = ctx.createGain(); delIn.gain.value = 1;
    delIn.connect(delayNode); delayNode.connect(dFilt); dFilt.connect(fb); fb.connect(delayNode);
    dFilt.connect(delOut); delOut.connect(comp);

    // cached noise buffer (2s)
    noiseBuf = ctx.createBuffer(1, rate * 2, rate);
    var nd = noiseBuf.getChannelData(0);
    for (var n = 0; n < nd.length; n++) nd[n] = Math.random() * 2 - 1;

    if (pendingMusic) { var pm = pendingMusic; pendingMusic = null; playMusic(pm); }
  }

  function noiseSrc(t, dur) {
    var s = ctx.createBufferSource();
    s.buffer = noiseBuf; s.loop = true;
    s.start(t); s.stop(t + dur + 0.05);
    return s;
  }

  /* ================= voices ================= */
  // tone(o): t,time; m midi | f freq; d dur(s); type; spread(cents); vol; a/dec/sus/r env;
  // filt(Hz) fEnv(mult) fQ; lfoRate lfoAmt(cents vibrato); dest; pan; rev; del; slideTo(freq) slideT
  function tone(o) {
    if (!ctx) return;
    var t = o.t, f = o.f || mtof(o.m), d = o.d || 0.3;
    var dest = o.dest || sfxBus;
    var vg = ctx.createGain();
    var a = o.a != null ? o.a : 0.005, dec = o.dec != null ? o.dec : 0.08;
    var sus = o.s != null ? o.s : 0.6, rel = o.r != null ? o.r : 0.08;
    var vol = o.vol != null ? o.vol : 0.2;
    vg.gain.setValueAtTime(0.0001, t);
    vg.gain.linearRampToValueAtTime(vol, t + a);
    vg.gain.linearRampToValueAtTime(vol * sus, t + a + dec);
    vg.gain.setValueAtTime(vol * sus, Math.max(t + a + dec, t + d));
    vg.gain.exponentialRampToValueAtTime(0.0001, t + d + rel);

    var node = vg;
    if (o.filt) {
      var bi = ctx.createBiquadFilter();
      bi.type = o.fType || 'lowpass'; bi.Q.value = o.fQ || 0.8;
      bi.frequency.setValueAtTime(o.filt, t);
      if (o.fEnv) {
        bi.frequency.linearRampToValueAtTime(o.filt * o.fEnv, t + a + dec * 1.6);
        bi.frequency.exponentialRampToValueAtTime(Math.max(80, o.filt * 0.7), t + d + rel);
      }
      bi.connect(vg); node = bi;
    }
    var pan = null;
    if (o.pan && ctx.createStereoPanner) {
      pan = ctx.createStereoPanner(); pan.pan.value = AL.util.clamp(o.pan, -1, 1);
      vg.connect(pan); pan.connect(dest);
    } else vg.connect(dest);
    if (o.rev) { var rs = ctx.createGain(); rs.gain.value = o.rev; vg.connect(rs); rs.connect(revIn); }
    if (o.del) { var ds = ctx.createGain(); ds.gain.value = o.del; vg.connect(ds); ds.connect(delIn); }

    var types = o.type === 'noise' ? [] : (o.types || [o.type || 'sawtooth']);
    var spread = o.spread != null ? o.spread : 0;
    var oscs = [];
    var count = spread > 0 ? (o.voices || 2) : 1;
    for (var v = 0; v < Math.max(1, count * types.length); v++) {
      var osc = ctx.createOscillator();
      osc.type = types[v % types.length] || 'sawtooth';
      osc.frequency.setValueAtTime(f, t);
      if (o.slideTo) osc.frequency.exponentialRampToValueAtTime(Math.max(20, o.slideTo), t + (o.slideT || d));
      osc.detune.value = spread * ((v % 2 === 0 ? 1 : -1) * Math.ceil((v + 1) / 2));
      if (o.lfoRate && o.lfoAmt) {
        var lfo = ctx.createOscillator(), lg = ctx.createGain();
        lfo.frequency.value = o.lfoRate; lg.gain.value = o.lfoAmt;
        lfo.connect(lg); lg.connect(osc.detune);
        lfo.start(t + (o.lfoDelay || 0.15)); lfo.stop(t + d + rel + 0.1);
      }
      var og = ctx.createGain(); og.gain.value = 1 / Math.max(1, count * types.length * 0.85);
      osc.connect(og); og.connect(node);
      osc.start(t); osc.stop(t + d + rel + 0.1);
      oscs.push(osc);
    }
    if (o.noise) {
      var ns = noiseSrc(t, d + rel);
      var ng = ctx.createGain(); ng.gain.value = o.noise;
      var nf = ctx.createBiquadFilter(); nf.type = 'bandpass'; nf.frequency.value = o.noiseF || f * 2; nf.Q.value = 1;
      ns.connect(nf); nf.connect(ng); ng.connect(node);
    }
    return vg;
  }

  function burst(o) { // filtered noise hit: t, d, type, f, fTo, Q, vol, a, dest, pan, rev
    if (!ctx) return;
    var t = o.t, d = o.d || 0.2;
    var src = noiseSrc(t, d);
    var bi = ctx.createBiquadFilter();
    bi.type = o.type || 'bandpass'; bi.Q.value = o.Q || 1;
    bi.frequency.setValueAtTime(o.f || 1000, t);
    if (o.fTo) bi.frequency.exponentialRampToValueAtTime(Math.max(30, o.fTo), t + d);
    var g = ctx.createGain();
    var vol = o.vol != null ? o.vol : 0.25;
    g.gain.setValueAtTime(0.0001, t);
    g.gain.linearRampToValueAtTime(vol, t + (o.a || 0.004));
    g.gain.exponentialRampToValueAtTime(0.0001, t + d);
    src.connect(bi); bi.connect(g);
    var dest = o.dest || sfxBus;
    if (o.pan && ctx.createStereoPanner) {
      var p = ctx.createStereoPanner(); p.pan.value = AL.util.clamp(o.pan, -1, 1);
      g.connect(p); p.connect(dest);
    } else g.connect(dest);
    if (o.rev) { var rs = ctx.createGain(); rs.gain.value = o.rev; g.connect(rs); rs.connect(revIn); }
  }

  /* ================= drums ================= */

  function kick(t, v, dest) {
    v = v || 0.5;
    tone({ t: t, f: 118, slideTo: 42, slideT: 0.09, d: 0.16, r: 0.06, type: 'sine', vol: v, a: 0.002, dec: 0.03, s: 0.55, dest: dest });
    burst({ t: t, d: 0.03, type: 'highpass', f: 900, vol: v * 0.25, dest: dest });
  }
  function snare(t, v, dest) {
    v = v || 0.35;
    burst({ t: t, d: 0.16, type: 'bandpass', f: 1800, Q: 0.7, vol: v, dest: dest, rev: 0.25 });
    tone({ t: t, f: 196, d: 0.07, type: 'triangle', vol: v * 0.5, a: 0.001, dec: 0.05, s: 0.1, r: 0.03, dest: dest });
  }
  function hat(t, v, open, dest) {
    v = v || 0.12;
    burst({ t: t, d: open ? 0.22 : 0.045, type: 'highpass', f: 7500, Q: 0.7, vol: v, dest: dest });
  }
  function stick(t, v, dest) {
    v = v || 0.2;
    burst({ t: t, d: 0.035, type: 'bandpass', f: 2900, Q: 4, vol: v, dest: dest, rev: 0.3 });
  }
  function shaker(t, v, dest) {
    burst({ t: t, d: 0.06, type: 'bandpass', f: 5200, Q: 2, vol: v || 0.08, a: 0.015, dest: dest });
  }

  /* ================= music sequencer ================= */

  var cur = null;       // { id, gain, layers, timer, nextBar, barIdx, track, stopping }
  var pendingMusic = null;

  function mkLayers(parent, spec) {
    var L = {};
    Object.keys(spec).forEach(function (k) {
      var g = ctx.createGain(); g.gain.value = spec[k]; g.connect(parent);
      L[k] = g;
    });
    return L;
  }

  function padChord(midis, t, d, dest, opts) {
    opts = opts || {};
    for (var i = 0; i < midis.length; i++) {
      tone({ t: t + i * 0.012, m: midis[i], d: d * 0.96, type: 'sawtooth', spread: 9, voices: 2,
        vol: 0.075, a: opts.a || d * 0.22, dec: 0.3, s: 0.85, r: d * 0.25,
        filt: opts.filt || 950, fQ: 0.6, dest: dest, rev: 0.5, pan: (i - 1) * 0.25 });
    }
  }
  function pluck(m, t, d, dest, vol, pan) {
    tone({ t: t, m: m, d: d, type: 'square', vol: vol || 0.09, a: 0.002, dec: 0.09, s: 0.25, r: 0.05,
      filt: 2200, fEnv: 1.6, fQ: 1.5, dest: dest, del: 0.35, rev: 0.16, pan: pan || 0 });
  }
  function bassNote(m, t, d, dest, vol) {
    tone({ t: t, m: m, d: d, types: ['sine', 'triangle'], vol: vol || 0.24, a: 0.004, dec: 0.06, s: 0.8, r: 0.05,
      filt: 700, fEnv: 1.5, fQ: 1, dest: dest });
  }
  function lead(m, t, d, dest, vol) {
    tone({ t: t, m: m, d: d, type: 'sawtooth', spread: 6, voices: 2, vol: vol || 0.11,
      a: 0.02, dec: 0.08, s: 0.8, r: 0.12, filt: 2400, fEnv: 1.3, fQ: 1.2,
      lfoRate: 5.5, lfoAmt: 9, lfoDelay: 0.18, dest: dest, rev: 0.3, del: 0.22 });
  }

  // ---- shared synthwave material (menu / lobby / win share DNA) ----
  var CH = {
    Am: [57, 60, 64], F: [53, 57, 60], C: [55, 60, 64], G: [55, 59, 62], E: [56, 59, 64],
    Dm: [50, 53, 57], Bb: [46, 50, 53], Fl: [45, 48, 53], Cl: [48, 52, 55],
    Em: [52, 55, 59], Gh: [55, 59, 62], Bh: [47, 51, 54], Ch: [48, 52, 55],
    Cmaj: [60, 64, 67], Gmaj: [59, 62, 67], Am2: [57, 60, 64], Fmaj: [57, 60, 65],
  };
  var MENU_PROG = [CH.Am, CH.F, CH.C, CH.G, CH.Am, CH.F, CH.C, CH.E];
  var MENU_BASS = [45, 41, 48, 43, 45, 41, 48, 40];
  // the Outcast motif — 8 bars of [beat, midi, durBeats]
  var MOTIF = [
    [[0, 76, 1.5], [1.5, 74, 0.5], [2, 72, 1], [3, 69, 1]],
    [[0, 72, 0.75], [0.75, 74, 0.25], [1, 76, 2], [3, 74, 1]],
    [[0, 72, 1.5], [1.5, 71, 0.5], [2, 72, 1], [3, 74, 1]],
    [[0, 71, 2], [2, 67, 2]],
    [[0, 76, 1.5], [1.5, 74, 0.5], [2, 72, 1], [3, 69, 1]],
    [[0, 77, 1.5], [1.5, 76, 0.5], [2, 74, 1], [3, 72, 1]],
    [[0, 72, 1], [1, 74, 1], [2, 76, 1], [3, 79, 1]],
    [[0, 80, 2.5], [3, 76, 1]],
  ];

  function synthwaveBar(L, bar, bt, spb, opts) {
    var ci = bar % 8;
    var ch = MENU_PROG[ci], bass = MENU_BASS[ci];
    var barLen = 4 * spb;
    var sec = Math.floor((bar % 16) / 4); // 0..3 sections
    padChord(ch, bt, barLen, L.pad, { filt: 800 + sec * 140 + (opts.bright ? 250 : 0) });
    // arp: 16ths on chord tones + octave
    var seq = opts.bright ? [0, 2, 1, 2, 3, 2, 1, 2] : [0, 1, 2, 1];
    var tones = [ch[0] + 12, ch[1] + 12, ch[2] + 12, ch[0] + 24];
    for (var s16 = 0; s16 < 16; s16++) {
      if (!opts.bright && s16 % 2 === 1) continue; // menu arps 8ths
      var m = tones[seq[s16 % seq.length] % tones.length];
      pluck(m, bt + s16 * spb / 4 + jit(), spb / 4 * 0.9, L.arp, 0.07 + (s16 % 4 === 0 ? 0.02 : 0), (s16 % 8) / 8 - 0.4);
    }
    var full = opts.always || sec >= 1;
    if (full) {
      // bass: root pattern w/ push
      bassNote(bass, bt, spb * 1.4, L.bass);
      bassNote(bass, bt + 1.5 * spb, spb * 0.4, L.bass, 0.18);
      bassNote(bass + (ci % 2 ? 12 : 7), bt + 2 * spb, spb * 0.9, L.bass, 0.2);
      bassNote(bass, bt + 3 * spb, spb * 0.9, L.bass);
      stick(bt + 2 * spb, 0.16, L.drum);
    }
    if (opts.always || sec >= 2) {
      kick(bt, 0.5, L.drum); kick(bt + 2 * spb, 0.45, L.drum);
      if (opts.bright) kick(bt + 3.5 * spb, 0.3, L.drum);
      for (var h = 0; h < 8; h++) hat(bt + h * spb / 2 + jit(), h % 2 ? 0.05 : 0.09, false, L.drum);
      snare(bt + spb, 0.22, L.drum); snare(bt + 3 * spb, 0.25, L.drum);
      // lead motif
      var ph = MOTIF[ci];
      for (var i = 0; i < ph.length; i++) {
        lead(ph[i][1], bt + ph[i][0] * spb + jit(), ph[i][2] * spb * 0.92, L.lead);
      }
    }
  }

  var TRACKS = {
    menu: {
      bpm: 96, form: 16,
      layers: { pad: 0.9, bass: 0.9, arp: 0.75, lead: 0.8, drum: 0.8 },
      onBar: function (L, bar, bt, spb) { synthwaveBar(L, bar, bt, spb, { bright: false }); },
    },
    lobby: {
      bpm: 104, form: 16,
      layers: { pad: 0.8, bass: 0.95, arp: 0.9, lead: 0.7, drum: 0.85 },
      onBar: function (L, bar, bt, spb) { synthwaveBar(L, bar, bt, spb, { bright: true, always: true }); },
    },
    game: {
      bpm: 60, form: 8,
      layers: { pad: 0.9, bass: 0.9, ping: 0.8, drum: 0.7 },
      onBar: function (L, bar, bt, spb) {
        var barLen = 4 * spb;
        var prog = [CH.Dm, CH.Dm, CH.Bb, CH.Fl, CH.Dm, CH.Cl, CH.Bb, CH.Dm];
        // low drone
        tone({ t: bt, m: 38, d: barLen, type: 'sine', vol: 0.14, a: barLen * 0.3, dec: 0.3, s: 0.9, r: barLen * 0.3, dest: L.bass });
        if (bar % 2 === 0) {
          padChord(prog[bar % 8], bt, barLen * 2, L.pad, { filt: 620, a: barLen * 0.6 });
        }
        // deep pulse
        kick(bt, 0.16, L.drum);
        if (bar % 4 === 3) kick(bt + 3.5 * spb, 0.1, L.drum);
        // sparse pentatonic echoes
        if (Math.random() < 0.4) {
          var pent = [62, 65, 69, 72, 74, 77];
          var m = pent[Math.floor(Math.random() * pent.length)];
          pluck(m, bt + Math.floor(Math.random() * 8) * spb / 2, spb, L.ping, 0.05, Math.random() - 0.5);
        }
        if (bar % 8 === 6) { // motif ghost
          lead(74, bt, spb * 1.4, L.ping, 0.035); lead(72, bt + 1.5 * spb, spb, L.ping, 0.03);
        }
      },
    },
    meeting: {
      bpm: 120, form: 8,
      layers: { bass: 1, perc: 0.9, stab: 0.8, rise: 0.7 },
      onBar: function (L, bar, bt, spb) {
        // staccato 8th bass D2/D3
        for (var e = 0; e < 8; e++) {
          bassNote(e % 4 === 3 ? 50 : 38, bt + e * spb / 2, spb * 0.22, L.bass, e % 2 ? 0.13 : 0.19);
        }
        for (var h = 0; h < 8; h++) shaker(bt + h * spb / 2 + jit(), h % 2 ? 0.05 : 0.09, L.perc);
        stick(bt + spb, 0.18, L.perc); stick(bt + 3 * spb, 0.2, L.perc);
        var stabs = [CH.Dm, CH.Dm, [50, 53, 56], CH.Dm, CH.Bb, CH.Bb, [49, 53, 56], [49, 52, 55]];
        var st = stabs[bar % 8];
        for (var i = 0; i < st.length; i++) {
          tone({ t: bt, m: st[i] + 12, d: 0.14, type: 'sawtooth', vol: 0.06, a: 0.004, dec: 0.06, s: 0.3, r: 0.05, filt: 1500, dest: L.stab, rev: 0.3 });
        }
        if (bar % 8 === 7) {
          burst({ t: bt, d: 4 * spb, type: 'bandpass', f: 400, fTo: 3200, Q: 2, vol: 0.07, a: spb, dest: L.rise, rev: 0.4 });
        }
      },
    },
    hide: {
      bpm: 142, form: 8,
      layers: { bass: 1, drum: 0.95, chord: 0.7, hats16: 0.0, lead: 0.0 },
      applyParam: function (L) {
        var v = AL.util.clamp(params.intensity, 0, 1);
        L.hats16.gain.linearRampToValueAtTime(v * 0.9, ctx.currentTime + 0.3);
        L.lead.gain.linearRampToValueAtTime(v > 0.55 ? (v - 0.55) * 2 : 0, ctx.currentTime + 0.3);
      },
      onBar: function (L, bar, bt, spb) {
        this.applyParam(L);
        var roots = [40, 40, 36, 43, 40, 40, 47, 43];
        var r = roots[bar % 8];
        for (var e = 0; e < 8; e++) {
          bassNote(e % 2 ? r + 12 : r, bt + e * spb / 2, spb * 0.28, L.bass, 0.2);
        }
        for (var b = 0; b < 4; b++) kick(bt + b * spb, 0.5, L.drum);
        snare(bt + spb, 0.3, L.drum); snare(bt + 3 * spb, 0.3, L.drum);
        for (var h = 0; h < 8; h++) hat(bt + h * spb / 2 + spb / 4, 0.07, false, L.drum);
        for (var h16 = 0; h16 < 16; h16++) hat(bt + h16 * spb / 4 + jit(), h16 % 4 === 2 ? 0.09 : 0.05, h16 % 8 === 6, L.hats16);
        var chords = [CH.Em, CH.Em, CH.Ch, CH.Gh, CH.Em, CH.Em, CH.Bh, CH.Bh];
        var c = chords[bar % 8];
        for (var i = 0; i < c.length; i++) {
          tone({ t: bt + 1.5 * spb, m: c[i] + 12, d: 0.2, type: 'sawtooth', vol: 0.05, a: 0.004, dec: 0.08, s: 0.4, r: 0.06, filt: 1800, dest: L.chord, rev: 0.25 });
          tone({ t: bt + 3.5 * spb, m: c[i] + 12, d: 0.15, type: 'sawtooth', vol: 0.045, a: 0.004, dec: 0.08, s: 0.4, r: 0.06, filt: 1800, dest: L.chord, rev: 0.25 });
        }
        // panic lead: fast em pentatonic runs
        var pent = [64, 67, 69, 71, 74, 76, 79];
        for (var s = 0; s < 16; s += 2) {
          var m = pent[(bar * 3 + s) % pent.length];
          lead(m + 12, bt + s * spb / 4, spb / 4, L.lead, 0.07);
        }
      },
    },
    win: {
      bpm: 112, form: 5, once: true,
      layers: { pad: 1, bass: 1, lead: 1, drum: 0.9 },
      onBar: function (L, bar, bt, spb) {
        var prog = [CH.Cmaj, CH.Gmaj, CH.Am2, CH.Fmaj, CH.Cmaj];
        var basses = [48, 43, 45, 41, 48];
        var barLen = 4 * spb;
        if (bar >= 5) return;
        padChord(prog[bar], bt, bar === 4 ? barLen * 2 : barLen, L.pad, { filt: 1400, a: 0.06 });
        bassNote(basses[bar], bt, barLen * 0.9, L.bass, 0.26);
        if (bar < 4) {
          kick(bt, 0.5, L.drum); kick(bt + 2 * spb, 0.4, L.drum);
          snare(bt + spb, 0.25, L.drum); snare(bt + 3 * spb, 0.3, L.drum);
          for (var h = 0; h < 8; h++) hat(bt + h * spb / 2, 0.07, false, L.drum);
        } else {
          burst({ t: bt, d: 1.4, type: 'highpass', f: 5000, vol: 0.16, dest: L.drum, rev: 0.6 }); // crash
        }
        var fan = [
          [[0, 67, 0.5], [0.5, 72, 0.5], [1, 76, 0.5], [1.5, 79, 1.5], [3, 76, 1]],
          [[0, 74, 1], [1, 71, 0.75], [2, 74, 2]],
          [[0, 76, 1.5], [1.5, 74, 0.5], [2, 72, 1], [3, 69, 1]],
          [[0, 72, 1], [1, 74, 1], [2, 76, 2]],
          [[0, 79, 4]],
        ];
        var ph = fan[bar];
        for (var i = 0; i < ph.length; i++) lead(ph[i][1] + 12, bt + ph[i][0] * spb, ph[i][2] * spb * 0.95, L.lead, 0.13);
      },
    },
    lose: {
      bpm: 70, form: 3, once: true,
      layers: { pad: 1, bass: 1, lead: 0.9 },
      onBar: function (L, bar, bt, spb) {
        var prog = [CH.Am, CH.F, CH.E];
        var basses = [45, 41, 40];
        var barLen = 4 * spb;
        if (bar >= 3) return;
        padChord(prog[bar].map(function (m) { return m - 12; }), bt, bar === 2 ? barLen * 2 : barLen, L.pad, { filt: 520, a: 0.25 });
        // low toll
        tone({ t: bt, m: basses[bar] - 12, d: barLen, types: ['sine', 'triangle'], vol: 0.22, a: 0.01, dec: barLen * 0.5, s: 0.3, r: 0.6, dest: L.bass, rev: 0.5 });
        var fall = [[76, 72], [74, 69], [68, 64]][bar];
        lead(fall[0], bt + spb * 0.5, spb * 1.4, L.lead, 0.06);
        lead(fall[1], bt + spb * 2.5, spb * 1.4, L.lead, 0.05);
      },
    },
  };

  function stopCur(fadeSec) {
    if (!cur) return;
    var c = cur; cur = null;
    c.stopping = true;
    if (c.timer) { clearInterval(c.timer); c.timer = null; }
    var f = fadeSec != null ? fadeSec : 1;
    try {
      c.gain.gain.setValueAtTime(c.gain.gain.value, ctx.currentTime);
      c.gain.gain.linearRampToValueAtTime(0.0001, ctx.currentTime + f);
    } catch (e) {}
    setTimeout(function () { try { c.gain.disconnect(); } catch (e) {} }, f * 1000 + 4200);
  }

  function playMusic(id) {
    if (!ctx) { pendingMusic = id; return; }
    if (cur && cur.id === id) return;
    var tr = TRACKS[id];
    if (!tr) { stopCur(1); return; }
    stopCur(0.8);
    var gain = ctx.createGain();
    gain.gain.setValueAtTime(0.0001, ctx.currentTime);
    gain.gain.linearRampToValueAtTime(1, ctx.currentTime + 0.6);
    gain.connect(musicBus);
    var layers = mkLayers(gain, tr.layers);
    var st = { id: id, gain: gain, layers: layers, track: tr, barIdx: 0, nextBar: ctx.currentTime + 0.08, timer: null };
    var spb = 60 / tr.bpm;
    st.timer = setInterval(function () {
      if (cur !== st) { clearInterval(st.timer); return; }
      while (st.nextBar < ctx.currentTime + 0.35) {
        if (tr.once && st.barIdx >= tr.form) {
          clearInterval(st.timer); st.timer = null;
          return;
        }
        try { tr.onBar(layers, st.barIdx, st.nextBar, spb); } catch (e) { console.warn('[audio] track error', e); }
        st.barIdx++;
        st.nextBar += 4 * spb;
      }
    }, 90);
    cur = st;
  }

  /* ================= SFX ================= */

  function seq(notes, base, dest) { // notes: [dt, midi, dur, vol]
    var t = ctx.currentTime + 0.01;
    for (var i = 0; i < notes.length; i++) {
      var n = notes[i];
      tone({ t: t + n[0], m: n[1], d: n[2], type: base.type || 'triangle', vol: (n[3] || 0.14) * (base.vol || 1),
        a: 0.003, dec: 0.05, s: 0.5, r: 0.06, filt: base.filt || 3200, dest: dest || sfxBus, rev: base.rev || 0.12, pan: base.pan || 0 });
    }
  }

  var SFX = {
    ui_hover: function (o) { tone({ t: n0(), f: 1350, d: 0.03, type: 'triangle', vol: 0.05 * o.vol, a: 0.002, dec: 0.02, s: 0.2, r: 0.02, pan: o.pan }); },
    ui_click: function (o) { seq([[0, 88, 0.04, 0.1], [0.045, 93, 0.05, 0.09]], { type: 'square', filt: 2600, vol: o.vol }); },
    ui_back: function (o) { seq([[0, 93, 0.04, 0.09], [0.045, 88, 0.05, 0.08]], { type: 'square', filt: 2400, vol: o.vol }); },
    join: function (o) { seq([[0, 76, 0.07, 0.12], [0.09, 83, 0.12, 0.12]], { type: 'triangle', vol: o.vol, rev: 0.25 }); },
    leave: function (o) { seq([[0, 83, 0.07, 0.1], [0.09, 76, 0.12, 0.1]], { type: 'triangle', vol: o.vol, rev: 0.25 }); },
    chat: function (o) { tone({ t: n0(), f: 900, d: 0.05, type: 'sine', vol: 0.08 * o.vol, a: 0.003, dec: 0.04, s: 0.3, r: 0.03 }); },
    countdown: function (o) { tone({ t: n0(), f: 880, d: 0.1, type: 'square', vol: 0.1 * o.vol, a: 0.002, dec: 0.06, s: 0.4, r: 0.04, filt: 2000, rev: 0.2 }); },
    start_whoosh: function (o) {
      burst({ t: n0(), d: 0.7, type: 'bandpass', f: 300, fTo: 3800, Q: 1.4, vol: 0.24 * o.vol, a: 0.25, rev: 0.4 });
      tone({ t: n0() + 0.55, f: 70, slideTo: 42, slideT: 0.25, d: 0.4, type: 'sine', vol: 0.3 * o.vol, a: 0.005, dec: 0.15, s: 0.5, r: 0.2, rev: 0.3 });
    },
    step_a: function (o) { burst({ t: n0(), d: 0.055, type: 'lowpass', f: 500, vol: 0.1 * o.vol * (o.rate || 1), a: 0.006 }); burst({ t: n0(), d: 0.02, type: 'bandpass', f: 1500 + Math.random() * 300, Q: 2, vol: 0.03 * o.vol }); },
    step_b: function (o) { burst({ t: n0(), d: 0.05, type: 'lowpass', f: 430, vol: 0.09 * o.vol * (o.rate || 1), a: 0.006 }); burst({ t: n0(), d: 0.02, type: 'bandpass', f: 1250 + Math.random() * 300, Q: 2, vol: 0.03 * o.vol }); },
    use: function (o) { seq([[0, 81, 0.05, 0.1], [0.06, 85, 0.07, 0.1]], { type: 'triangle', vol: o.vol }); },
    task_open: function (o) { burst({ t: n0(), d: 0.14, type: 'bandpass', f: 900, fTo: 2400, vol: 0.08 * o.vol }); seq([[0.05, 84, 0.06, 0.08]], { vol: o.vol }); },
    task_close: function (o) { burst({ t: n0(), d: 0.12, type: 'bandpass', f: 2200, fTo: 800, vol: 0.07 * o.vol }); },
    task_done: function (o) { seq([[0, 84, 0.08, 0.12], [0.09, 88, 0.08, 0.12], [0.18, 91, 0.18, 0.14]], { type: 'triangle', vol: o.vol, rev: 0.35 }); },
    task_progress: function (o) { tone({ t: n0(), f: 1100, d: 0.04, type: 'sine', vol: 0.07 * o.vol, a: 0.002, dec: 0.03, s: 0.3, r: 0.02 }); },
    task_all_done: function (o) { seq([[0, 79, 0.09, 0.12], [0.1, 84, 0.09, 0.12], [0.2, 88, 0.09, 0.13], [0.3, 91, 0.1, 0.14], [0.42, 96, 0.3, 0.15]], { type: 'triangle', vol: o.vol, rev: 0.45 }); },
    kill: function (o) {
      tone({ t: n0(), f: 90, slideTo: 34, slideT: 0.16, d: 0.3, type: 'sine', vol: 0.42 * o.vol, a: 0.003, dec: 0.1, s: 0.6, r: 0.15 });
      burst({ t: n0(), d: 0.12, type: 'lowpass', f: 700, vol: 0.2 * o.vol });
      tone({ t: n0() + 0.03, m: 44, d: 0.35, type: 'sawtooth', spread: 22, voices: 2, vol: 0.1 * o.vol, a: 0.01, dec: 0.2, s: 0.4, r: 0.2, filt: 500, rev: 0.4 });
      tone({ t: n0() + 0.03, m: 45, d: 0.35, type: 'sawtooth', vol: 0.07 * o.vol, a: 0.01, dec: 0.2, s: 0.4, r: 0.2, filt: 500, rev: 0.4 });
    },
    body_report: function (o) {
      tone({ t: n0(), m: 50, d: 0.5, type: 'sawtooth', spread: 15, voices: 3, vol: 0.16 * o.vol, a: 0.004, dec: 0.3, s: 0.5, r: 0.3, filt: 1100, rev: 0.5 });
      tone({ t: n0(), m: 56, d: 0.5, type: 'sawtooth', vol: 0.12 * o.vol, a: 0.004, dec: 0.3, s: 0.5, r: 0.3, filt: 1100, rev: 0.5 });
      burst({ t: n0(), d: 0.3, type: 'highpass', f: 3000, vol: 0.06 * o.vol, rev: 0.4 });
    },
    emergency: function (o) {
      for (var i = 0; i < 3; i++) {
        tone({ t: n0() + i * 0.32, f: 660, d: 0.14, type: 'square', vol: 0.12 * o.vol, a: 0.004, dec: 0.05, s: 0.7, r: 0.05, filt: 1600, rev: 0.3 });
        tone({ t: n0() + i * 0.32 + 0.15, f: 494, d: 0.14, type: 'square', vol: 0.12 * o.vol, a: 0.004, dec: 0.05, s: 0.7, r: 0.05, filt: 1600, rev: 0.3 });
      }
      tone({ t: n0() + 1.0, f: 1320, d: 0.5, type: 'sine', vol: 0.1 * o.vol, a: 0.002, dec: 0.4, s: 0.2, r: 0.3, rev: 0.5 });
    },
    meeting_chime: function (o) { seq([[0, 88, 0.15, 0.12], [0.16, 84, 0.15, 0.11], [0.32, 91, 0.3, 0.13]], { type: 'sine', vol: o.vol, rev: 0.5 }); },
    vote: function (o) { burst({ t: n0(), d: 0.08, type: 'bandpass', f: 1600, fTo: 2600, vol: 0.06 * o.vol }); seq([[0.04, 86, 0.05, 0.08]], { vol: o.vol }); },
    vote_lock: function (o) { burst({ t: n0(), d: 0.06, type: 'lowpass', f: 900, vol: 0.14 * o.vol }); tone({ t: n0() + 0.01, f: 220, d: 0.08, type: 'triangle', vol: 0.12 * o.vol, a: 0.002, dec: 0.05, s: 0.3, r: 0.04 }); },
    eject: function (o) {
      burst({ t: n0(), d: 1.6, type: 'bandpass', f: 1800, fTo: 200, Q: 0.8, vol: 0.2 * o.vol, a: 0.15, rev: 0.5 });
      tone({ t: n0() + 0.1, f: 300, slideTo: 60, slideT: 1.2, d: 1.3, type: 'sine', vol: 0.06 * o.vol, a: 0.1, dec: 0.5, s: 0.5, r: 0.4 });
    },
    sab_fixed: function (o) { seq([[0, 74, 0.08, 0.11], [0.09, 78, 0.08, 0.11], [0.18, 81, 0.2, 0.13]], { type: 'triangle', vol: o.vol, rev: 0.3 }); },
    door_close: function (o) { burst({ t: n0(), d: 0.18, type: 'bandpass', f: 500, fTo: 180, vol: 0.14 * o.vol, pan: o.pan }); burst({ t: n0() + 0.13, d: 0.05, type: 'lowpass', f: 300, vol: 0.16 * o.vol, pan: o.pan }); },
    vent_in: function (o) { burst({ t: n0(), d: 0.25, type: 'bandpass', f: 1400, fTo: 300, Q: 1.5, vol: 0.14 * o.vol, pan: o.pan }); tone({ t: n0() + 0.1, f: 160, d: 0.1, type: 'triangle', vol: 0.08 * o.vol, a: 0.004, dec: 0.06, s: 0.3, r: 0.05 }); },
    vent_out: function (o) { burst({ t: n0(), d: 0.25, type: 'bandpass', f: 300, fTo: 1400, Q: 1.5, vol: 0.14 * o.vol, pan: o.pan }); },
    vent_move: function (o) { burst({ t: n0(), d: 0.16, type: 'bandpass', f: 700, fTo: 1100, Q: 1.2, vol: 0.1 * o.vol }); },
    shield_on: function (o) { seq([[0, 84, 0.06, 0.08], [0.06, 89, 0.06, 0.09], [0.12, 93, 0.15, 0.1]], { type: 'sine', vol: o.vol, rev: 0.4 }); },
    shield_break: function (o) { burst({ t: n0(), d: 0.3, type: 'highpass', f: 3400, vol: 0.16 * o.vol, rev: 0.3 }); seq([[0, 93, 0.05, 0.1], [0.06, 86, 0.06, 0.09], [0.13, 79, 0.09, 0.08]], { type: 'triangle', vol: o.vol }); },
    shift: function (o) { tone({ t: n0(), f: 300, slideTo: 700, slideT: 0.18, d: 0.2, type: 'sawtooth', vol: 0.08 * o.vol, filt: 1200, fEnv: 2 }); tone({ t: n0() + 0.18, f: 700, slideTo: 340, slideT: 0.15, d: 0.18, type: 'sawtooth', vol: 0.07 * o.vol, filt: 1200 }); },
    cloak: function (o) { burst({ t: n0(), d: 0.3, type: 'bandpass', f: 2600, fTo: 500, Q: 2, vol: 0.09 * o.vol, rev: 0.35 }); },
    uncloak: function (o) { burst({ t: n0(), d: 0.3, type: 'bandpass', f: 500, fTo: 2600, Q: 2, vol: 0.09 * o.vol, rev: 0.35 }); },
    sheriff_shot: function (o) { burst({ t: n0(), d: 0.14, type: 'lowpass', f: 1600, fTo: 300, vol: 0.3 * o.vol }); tone({ t: n0(), f: 180, slideTo: 60, slideT: 0.08, d: 0.12, type: 'sine', vol: 0.26 * o.vol, a: 0.001, dec: 0.05, s: 0.5, r: 0.06 }); },
    bomb_tick: function (o) { burst({ t: n0(), d: 0.04, type: 'bandpass', f: 2200, Q: 6, vol: 0.14 * o.vol }); },
    bomb_pass: function (o) { burst({ t: n0(), d: 0.14, type: 'bandpass', f: 600, fTo: 1800, vol: 0.12 * o.vol }); SFX.bomb_tick(o); },
    explode: function (o) {
      burst({ t: n0(), d: 0.9, type: 'lowpass', f: 2800, fTo: 120, vol: 0.4 * o.vol, rev: 0.5 });
      tone({ t: n0(), f: 110, slideTo: 30, slideT: 0.5, d: 0.8, type: 'sine', vol: 0.4 * o.vol, a: 0.002, dec: 0.4, s: 0.4, r: 0.3 });
    },
    scan_beep: function (o) { tone({ t: n0(), f: 990, d: 0.09, type: 'sine', vol: 0.07 * o.vol, a: 0.003, dec: 0.06, s: 0.4, r: 0.05, rev: 0.3 }); },
    wire_snap: function (o) { burst({ t: n0(), d: 0.03, type: 'highpass', f: 2500, vol: 0.14 * o.vol }); burst({ t: n0() + 0.02, d: 0.09, type: 'bandpass', f: 4200, Q: 3, vol: 0.09 * o.vol }); },
    card_ok: function (o) { seq([[0, 88, 0.06, 0.11], [0.07, 95, 0.09, 0.12]], { type: 'square', filt: 3400, vol: o.vol }); },
    card_bad: function (o) { tone({ t: n0(), f: 156, d: 0.22, type: 'square', vol: 0.11 * o.vol, a: 0.003, dec: 0.05, s: 0.8, r: 0.05, filt: 900 }); tone({ t: n0(), f: 165, d: 0.22, type: 'square', vol: 0.08 * o.vol, a: 0.003, dec: 0.05, s: 0.8, r: 0.05, filt: 900 }); },
    download_tick: function (o) { tone({ t: n0(), f: 1400 + Math.random() * 900, d: 0.03, type: 'sine', vol: 0.05 * o.vol, a: 0.002, dec: 0.02, s: 0.2, r: 0.02 }); },
    horn: function (o) { tone({ t: n0(), f: 330, d: 0.5, type: 'sawtooth', vol: 0.14 * o.vol, a: 0.02, dec: 0.1, s: 0.85, r: 0.1, filt: 1400, lfoRate: 7, lfoAmt: 40, rev: 0.3 }); },
    splash: function (o) { burst({ t: n0(), d: 0.4, type: 'bandpass', f: 600, fTo: 320, Q: 0.8, vol: 0.14 * o.vol, a: 0.02, rev: 0.35 }); },
    sparkle: function (o) {
      for (var i = 0; i < 4; i++) {
        tone({ t: n0() + i * 0.05, f: 2000 + Math.random() * 2600, d: 0.08, type: 'sine', vol: 0.045 * o.vol, a: 0.002, dec: 0.05, s: 0.3, r: 0.05, rev: 0.5 });
      }
    },
  };

  function n0() { return ctx.currentTime + 0.005; }

  // loopable sfx
  function loopHandle(startFn, periodMs) {
    var iv = setInterval(startFn, periodMs);
    startFn();
    return { stop: function () { clearInterval(iv); } };
  }

  function sfx(id, opts) {
    if (!ctx) return { stop: function () {} };
    opts = opts || {};
    var o = { vol: opts.vol != null ? opts.vol : 1, pan: opts.pan || 0, rate: opts.rate || 1 };
    if (o.vol <= 0.01) return { stop: function () {} };
    try {
      if (id === 'sab_alarm') {
        if (opts.loop) {
          return loopHandle(function () {
            tone({ t: n0(), f: 622, d: 0.22, type: 'square', vol: 0.07 * o.vol, a: 0.01, dec: 0.08, s: 0.7, r: 0.06, filt: 1300, rev: 0.25 });
            tone({ t: n0() + 0.35, f: 466, d: 0.22, type: 'square', vol: 0.07 * o.vol, a: 0.01, dec: 0.08, s: 0.7, r: 0.06, filt: 1300, rev: 0.25 });
          }, 800);
        }
        tone({ t: n0(), f: 622, d: 0.22, type: 'square', vol: 0.07 * o.vol, a: 0.01, dec: 0.08, s: 0.7, r: 0.06, filt: 1300, rev: 0.25 });
        return { stop: function () {} };
      }
      if (id === 'heartbeat') {
        var period = 900 / o.rate;
        var beat = function () {
          tone({ t: n0(), f: 62, d: 0.1, type: 'sine', vol: 0.28 * o.vol, a: 0.004, dec: 0.06, s: 0.4, r: 0.06 });
          tone({ t: n0() + 0.16, f: 55, d: 0.09, type: 'sine', vol: 0.2 * o.vol, a: 0.004, dec: 0.06, s: 0.4, r: 0.06 });
        };
        if (opts.loop) return loopHandle(beat, period);
        beat();
        return { stop: function () {} };
      }
      var fn = SFX[id];
      if (fn) fn(o);
      else tone({ t: n0(), f: 800, d: 0.03, type: 'sine', vol: 0.04 * o.vol, a: 0.002, dec: 0.02, s: 0.2, r: 0.02 });
    } catch (e) { /* never throw from sfx */ }
    return { stop: function () {} };
  }

  /* ================= public ================= */

  AL.audio = {
    init: init,
    playMusic: function (id) { try { playMusic(id); } catch (e) { console.warn('[audio]', e); } },
    stopMusic: function (fadeSec) { try { stopCur(fadeSec != null ? fadeSec : 1); } catch (e) {} },
    sfx: sfx,
    setMusicVol: function (v) {
      musicVol = AL.util.clamp(+v || 0, 0, 1);
      if (musicBus) musicBus.gain.linearRampToValueAtTime(musicVol * 0.9, ctx.currentTime + 0.1);
    },
    setSfxVol: function (v) {
      sfxVol = AL.util.clamp(+v || 0, 0, 1);
      if (sfxBus) sfxBus.gain.linearRampToValueAtTime(sfxVol, ctx.currentTime + 0.1);
    },
    getMusicVol: function () { return musicVol; },
    getSfxVol: function () { return sfxVol; },
    setMusicParam: function (k, v) { params[k] = v; },
    duck: function (ms) {
      if (!musicBus) return;
      var t = ctx.currentTime;
      musicBus.gain.cancelScheduledValues(t);
      musicBus.gain.setValueAtTime(musicBus.gain.value, t);
      musicBus.gain.linearRampToValueAtTime(musicVol * 0.28, t + 0.08);
      musicBus.gain.linearRampToValueAtTime(musicVol * 0.9, t + (ms || 600) / 1000);
    },
    currentMusic: function () { return cur ? cur.id : null; },
  };
})();
