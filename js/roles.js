/* Outcast - roles.js: role definitions, assignment logic, flavor text, glyphs (AL.roles) */
(function () {
  'use strict';
  window.AL = window.AL || {};

  /* ------------------------------------------------------------------ *
   * Role definitions (pinned by SPEC section 5 - do not rename fields) *
   * ------------------------------------------------------------------ */
  var DEFS = {
    crewmate:     { team: 'crew',     color: '#8fd3ff', name: 'Crewmate' },
    sheriff:      { team: 'crew',     color: '#ffd23e', name: 'Sheriff',
                    desc: 'Shoot an impostor. Shoot wrong and you die instead.',
                    abilities: [{ id: 'shoot', name: 'Shoot', cd: 30 }] },
    engineer:     { team: 'crew',     color: '#ff9d2e', name: 'Engineer',
                    desc: 'Use vents. 12s inside max.',
                    abilities: [{ id: 'vent', name: 'Vent', cd: 25 }] },
    scientist:    { team: 'crew',     color: '#3ee06f', name: 'Scientist',
                    desc: 'Check vitals anywhere.',
                    abilities: [{ id: 'vitals', name: 'Vitals', cd: 12 }] },
    medic:        { team: 'crew',     color: '#3ef0d0', name: 'Medic',
                    desc: 'Give one player a shield that blocks a kill.',
                    abilities: [{ id: 'shield', name: 'Shield', cd: 0, once: true }] },
    tracker:      { team: 'crew',     color: '#c8ff4d', name: 'Tracker',
                    desc: 'Tag a player; see their position for 25s.',
                    abilities: [{ id: 'track', name: 'Track', cd: 45 }] },
    impostor:     { team: 'impostor', color: '#ff3860', name: 'Impostor',
                    desc: 'Kill the crew. Sabotage. Deceive.' },
    shapeshifter: { team: 'impostor', color: '#ff3860', name: 'Shapeshifter',
                    desc: 'Take the look of another crewmate for 15s.',
                    abilities: [{ id: 'shift', name: 'Shift', cd: 25 }] },
    phantom:      { team: 'impostor', color: '#ff3860', name: 'Phantom',
                    desc: 'Turn invisible for 10s.',
                    abilities: [{ id: 'cloak', name: 'Cloak', cd: 30 }] },
    jester:       { team: 'neutral',  color: '#d06bff', name: 'Jester',
                    desc: 'Get yourself voted out to win.' },
  };

  // Fixed processing order keeps assignment deterministic for a given rnd stream.
  var CREW_SPECIALS = ['sheriff', 'engineer', 'scientist', 'medic', 'tracker'];
  var IMP_SPECIALS = ['shapeshifter', 'phantom'];

  var FLAVOR = {
    crewmate:     'Finish your tasks. Trust no one.',
    sheriff:      'Justice travels at muzzle velocity.',
    engineer:     'Every vent is a shortcut.',
    scientist:    'The vitals never lie.',
    medic:        'One life, saved in advance.',
    tracker:      'They can run. You will know where.',
    impostor:     'Smile. Blend in. Strike.',
    shapeshifter: 'Anyone. Anywhere. Any face.',
    phantom:      'Now you see me. Now you do not.',
    jester:       'Convince them you did it.',
  };

  /* ------------------------------------------------------------------ *
   * Assignment                                                          *
   * ------------------------------------------------------------------ */

  function cfgOf(rolesCfg, id) {
    var c = rolesCfg && rolesCfg[id];
    if (!c) return { chance: 0, max: 0 };
    return {
      chance: AL.util.clamp(+c.chance || 0, 0, 100),
      max: Math.max(0, Math.floor(+c.max || 0)),
    };
  }

  function roll(rnd, chance) {
    return rnd() * 100 < chance;
  }

  // assign(playerIds, settings, mode, rnd) -> { [playerId]: roleId }
  // Deterministic for a given rnd stream (host seeds it; every client can replay).
  function assign(playerIds, settings, mode, rnd) {
    var out = {};
    var ids = (playerIds || []).slice();
    if (!ids.length) return out;
    if (typeof rnd !== 'function') rnd = Math.random;
    settings = settings || {};
    mode = mode || 'classic';

    var order = AL.util.shuffle(ids, rnd);
    var i, k, s;
    for (i = 0; i < order.length; i++) out[order[i]] = 'crewmate';

    // Pure FFA modes: everyone is a plain crewmate.
    if (mode === 'bombtag' || mode === 'sprint') return out;

    // Outbreak: exactly one patient zero, everyone else crew.
    if (mode === 'outbreak') {
      out[order[0]] = 'impostor';
      return out;
    }

    // Classic & hide-and-seek honor the impostor count setting (clamped 1..3,
    // and never leaving zero crew).
    var impWant = AL.util.clamp(Math.floor(+settings.impostors || 1), 1, 3);
    var impCount = Math.min(impWant, Math.max(0, order.length - 1));
    for (i = 0; i < impCount; i++) out[order[i]] = 'impostor';

    // Hide & seek uses base roles only.
    if (mode === 'hideseek') return out;

    // ---- Classic: special roles ----
    var rolesCfg = settings.roles || {};

    // Impostor specials replace base impostors by chance, up to each role's max.
    var impSlots = order.slice(0, impCount);
    var slot = 0;
    for (s = 0; s < IMP_SPECIALS.length; s++) {
      var impCfg = cfgOf(rolesCfg, IMP_SPECIALS[s]);
      for (k = 0; k < impCfg.max && slot < impSlots.length; k++) {
        if (roll(rnd, impCfg.chance)) out[impSlots[slot++]] = IMP_SPECIALS[s];
      }
    }

    // Crew specials fill remaining (already shuffled) crew slots.
    var crew = order.slice(impCount);
    var ci = 0;
    for (s = 0; s < CREW_SPECIALS.length; s++) {
      var crewCfg = cfgOf(rolesCfg, CREW_SPECIALS[s]);
      for (k = 0; k < crewCfg.max && ci < crew.length; k++) {
        if (roll(rnd, crewCfg.chance)) out[crew[ci++]] = CREW_SPECIALS[s];
      }
    }

    // Jester replaces a crewmate by chance -- never with fewer than 6 players.
    if (order.length >= 6) {
      var jCfg = cfgOf(rolesCfg, 'jester');
      for (k = 0; k < jCfg.max; k++) {
        if (!roll(rnd, jCfg.chance)) continue;
        var plain = [], special = [];
        for (i = 0; i < crew.length; i++) {
          if (out[crew[i]] === 'crewmate') plain.push(crew[i]);
          else if (out[crew[i]] !== 'jester') special.push(crew[i]);
        }
        var pool = plain.length ? plain : special; // prefer plain crewmates
        if (!pool.length) break;
        out[pool[Math.floor(rnd() * pool.length) % pool.length]] = 'jester';
      }
    }

    return out;
  }

  function teamOf(roleId) {
    var d = DEFS[roleId];
    return d ? d.team : 'crew';
  }

  function isImpostor(roleId) {
    return teamOf(roleId) === 'impostor';
  }

  function defaultRoleSettings() {
    return {
      sheriff:      { chance: 40, max: 1 },
      engineer:     { chance: 50, max: 1 },
      scientist:    { chance: 40, max: 1 },
      medic:        { chance: 35, max: 1 },
      tracker:      { chance: 30, max: 1 },
      shapeshifter: { chance: 25, max: 1 },
      phantom:      { chance: 25, max: 1 },
      jester:       { chance: 20, max: 1 },
    };
  }

  function flavor(roleId) {
    return FLAVOR[roleId] || 'Good luck out there.';
  }

  /* ------------------------------------------------------------------ *
   * Glyphs -- icon(roleId, ctx, x, y, size)                             *
   * (x, y) = glyph center; size = box edge in px. Designed in a         *
   * 24x24 space (-12..12) and scaled.                                   *
   * ------------------------------------------------------------------ */

  // Multiply toward black (f < 1) or mix toward white (f > 1).
  function tint(hex, f) {
    var n = parseInt(hex.slice(1), 16);
    var r = (n >> 16) & 255, g = (n >> 8) & 255, b = n & 255;
    if (f <= 1) { r *= f; g *= f; b *= f; }
    else { var m = Math.min(1, f - 1); r += (255 - r) * m; g += (255 - g) * m; b += (255 - b) * m; }
    return 'rgb(' + Math.round(r) + ',' + Math.round(g) + ',' + Math.round(b) + ')';
  }

  function iconCrewmate(ctx, col) {
    ctx.fillStyle = tint(col, 0.7); // backpack
    ctx.beginPath();
    ctx.moveTo(-9.5, -3.5); ctx.lineTo(-6, -3.5); ctx.lineTo(-6, 5.5); ctx.lineTo(-8, 5.5);
    ctx.quadraticCurveTo(-9.5, 5.5, -9.5, 3.5); ctx.closePath(); ctx.fill();
    ctx.fillStyle = col; // bean body
    ctx.beginPath();
    ctx.moveTo(-6.2, 8); ctx.lineTo(-6.2, -2);
    ctx.quadraticCurveTo(-6.2, -11, 0.6, -11);
    ctx.quadraticCurveTo(7.6, -11, 7.6, -2);
    ctx.lineTo(7.6, 8);
    ctx.quadraticCurveTo(7.6, 11, 4.8, 11);
    ctx.lineTo(-3.4, 11);
    ctx.quadraticCurveTo(-6.2, 11, -6.2, 8);
    ctx.closePath(); ctx.fill();
    ctx.fillStyle = '#cfeaff'; // visor
    ctx.beginPath(); ctx.ellipse(3.2, -4.2, 4.4, 3, 0, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = 'rgba(255,255,255,0.65)';
    ctx.beginPath(); ctx.ellipse(4.6, -5.2, 1.5, 0.9, -0.4, 0, Math.PI * 2); ctx.fill();
  }

  function iconSheriff(ctx, col) {
    ctx.fillStyle = col;
    ctx.beginPath();
    for (var i = 0; i < 5; i++) {
      var a = -Math.PI / 2 + i * Math.PI * 2 / 5;
      var b = a + Math.PI / 5;
      ctx.lineTo(Math.cos(a) * 11, Math.sin(a) * 11);
      ctx.lineTo(Math.cos(b) * 4.6, Math.sin(b) * 4.6);
    }
    ctx.closePath(); ctx.fill();
    ctx.strokeStyle = tint(col, 1.5); ctx.lineWidth = 1.4;
    ctx.beginPath(); ctx.arc(0, 0, 2.6, 0, Math.PI * 2); ctx.stroke();
  }

  function iconEngineer(ctx, col) {
    ctx.rotate(Math.PI / 4);
    ctx.strokeStyle = col;
    var cx = 0, cy = -5.8, r = 4.4;
    var a0 = -0.13 * Math.PI, a1 = 1.13 * Math.PI; // opening faces up
    ctx.lineWidth = 3.4;
    ctx.beginPath(); ctx.arc(cx, cy, r, a0, a1); ctx.stroke();
    ctx.lineWidth = 2.6; // flared jaw tips
    var ends = [a0, a1];
    for (var i = 0; i < 2; i++) {
      var ex = cx + Math.cos(ends[i]) * r, ey = cy + Math.sin(ends[i]) * r;
      ctx.beginPath(); ctx.moveTo(ex, ey);
      ctx.lineTo(ex + Math.cos(ends[i]) * 2.4, ey + Math.sin(ends[i]) * 2.4);
      ctx.stroke();
    }
    ctx.lineWidth = 3.8; // handle
    ctx.beginPath(); ctx.moveTo(0, -1.2); ctx.lineTo(0, 10.6); ctx.stroke();
  }

  function iconScientist(ctx, col) {
    ctx.beginPath(); // flask silhouette
    ctx.moveTo(-2.6, -9.4); ctx.lineTo(-2.6, -2.4);
    ctx.lineTo(-8.6, 7.6); ctx.quadraticCurveTo(-10.2, 10.6, -6.8, 10.6);
    ctx.lineTo(6.8, 10.6); ctx.quadraticCurveTo(10.2, 10.6, 8.6, 7.6);
    ctx.lineTo(2.6, -2.4); ctx.lineTo(2.6, -9.4);
    ctx.closePath();
    ctx.save(); // liquid inside
    ctx.clip();
    ctx.fillStyle = col; ctx.globalAlpha = 0.45;
    ctx.fillRect(-12, 4, 24, 8);
    ctx.restore();
    ctx.strokeStyle = col; ctx.lineWidth = 2.2; ctx.stroke();
    ctx.lineWidth = 2.6; // rim
    ctx.beginPath(); ctx.moveTo(-4.6, -9.8); ctx.lineTo(4.6, -9.8); ctx.stroke();
    ctx.fillStyle = col; // bubbles
    ctx.beginPath(); ctx.arc(-1.2, 1.6, 1.15, 0, Math.PI * 2); ctx.fill();
    ctx.beginPath(); ctx.arc(1.9, -0.8, 0.8, 0, Math.PI * 2); ctx.fill();
  }

  function iconMedic(ctx, col) {
    ctx.fillStyle = col; ctx.strokeStyle = col; ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(-3.3, -9.5); ctx.lineTo(3.3, -9.5); ctx.lineTo(3.3, -3.3);
    ctx.lineTo(9.5, -3.3); ctx.lineTo(9.5, 3.3); ctx.lineTo(3.3, 3.3);
    ctx.lineTo(3.3, 9.5); ctx.lineTo(-3.3, 9.5); ctx.lineTo(-3.3, 3.3);
    ctx.lineTo(-9.5, 3.3); ctx.lineTo(-9.5, -3.3); ctx.lineTo(-3.3, -3.3);
    ctx.closePath(); ctx.fill(); ctx.stroke();
  }

  function iconTracker(ctx, col) {
    ctx.rotate(-0.18);
    ctx.fillStyle = col;
    ctx.beginPath(); ctx.ellipse(0, -3, 4.9, 6.6, 0, 0, Math.PI * 2); ctx.fill(); // sole
    ctx.beginPath(); ctx.ellipse(0.7, 7.8, 3.5, 3, 0, 0, Math.PI * 2); ctx.fill(); // heel
    ctx.strokeStyle = tint(col, 0.45); ctx.lineWidth = 1.5; // tread
    var ys = [-6.4, -3.2, 0];
    for (var i = 0; i < ys.length; i++) {
      var hw = 4.9 * Math.sqrt(Math.max(0, 1 - Math.pow((ys[i] + 3) / 6.6, 2))) - 1.3;
      ctx.beginPath(); ctx.moveTo(-hw, ys[i]); ctx.lineTo(hw, ys[i]); ctx.stroke();
    }
  }

  function iconImpostor(ctx, col) {
    ctx.fillStyle = col; // sleek blade
    ctx.beginPath();
    ctx.moveTo(0.2, -11.6);
    ctx.quadraticCurveTo(4.4, -4.4, 2.7, 3);
    ctx.lineTo(-2.7, 3);
    ctx.quadraticCurveTo(-1.5, -5.8, 0.2, -11.6);
    ctx.closePath(); ctx.fill();
    ctx.strokeStyle = tint(col, 1.45); ctx.lineWidth = 0.9; // edge glint
    ctx.beginPath(); ctx.moveTo(0.2, -9.8); ctx.lineTo(0.1, 2); ctx.stroke();
    ctx.fillStyle = tint(col, 0.72); // guard
    ctx.strokeStyle = ctx.fillStyle; ctx.lineWidth = 1.6;
    ctx.beginPath(); ctx.rect(-4.4, 3.2, 8.8, 2); ctx.fill(); ctx.stroke();
    ctx.fillStyle = tint(col, 0.5); // grip
    ctx.strokeStyle = ctx.fillStyle;
    ctx.beginPath(); ctx.rect(-1.7, 5.6, 3.4, 5.6); ctx.fill(); ctx.stroke();
  }

  function iconShapeshifter(ctx, col) {
    ctx.fillStyle = col;
    ctx.beginPath(); // mask with punched eye holes
    ctx.moveTo(-8.5, -7);
    ctx.quadraticCurveTo(0, -11.5, 8.5, -7);
    ctx.lineTo(8.5, 0.5);
    ctx.quadraticCurveTo(8.5, 8.5, 0, 11);
    ctx.quadraticCurveTo(-8.5, 8.5, -8.5, 0.5);
    ctx.closePath();
    ctx.moveTo(-1.4, -1.8); ctx.ellipse(-3.7, -1.8, 2.3, 1.5, 0.18, 0, Math.PI * 2);
    ctx.moveTo(6, -1.8); ctx.ellipse(3.7, -1.8, 2.3, 1.5, -0.18, 0, Math.PI * 2);
    ctx.fill('evenodd');
    ctx.strokeStyle = tint(col, 0.45); ctx.lineWidth = 1.6; // sly mouth
    ctx.beginPath(); ctx.arc(0, 3.4, 3, Math.PI * 0.2, Math.PI * 0.8); ctx.stroke();
  }

  function iconPhantom(ctx, col) {
    ctx.fillStyle = col;
    ctx.beginPath();
    ctx.arc(0, -1, 7.6, Math.PI, Math.PI * 2); // dome
    ctx.lineTo(7.6, 7.6);
    ctx.quadraticCurveTo(5.1, 11.6, 2.5, 7.9); // three trailing scallops
    ctx.quadraticCurveTo(0, 11.6, -2.5, 7.9);
    ctx.quadraticCurveTo(-5.1, 11.6, -7.6, 7.6);
    ctx.closePath(); ctx.fill();
    ctx.fillStyle = 'rgba(10,14,28,0.8)'; // eyes
    ctx.beginPath(); ctx.arc(-2.8, -1.6, 1.6, 0, Math.PI * 2); ctx.fill();
    ctx.beginPath(); ctx.arc(2.8, -1.6, 1.6, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = 'rgba(255,255,255,0.5)'; // fading shimmer
    ctx.beginPath(); ctx.ellipse(-3.4, -5.4, 1.6, 0.9, 0.6, 0, Math.PI * 2); ctx.fill();
  }

  function iconJester(ctx, col) {
    ctx.fillStyle = col; // three floppy points
    ctx.beginPath();
    ctx.moveTo(-9, 6);
    ctx.quadraticCurveTo(-11, -7, -7.7, -8.4);
    ctx.quadraticCurveTo(-5.5, -3.6, -3.4, -2.2);
    ctx.quadraticCurveTo(-1.9, -9.8, 0.1, -11);
    ctx.quadraticCurveTo(2.1, -9.8, 3.5, -2.2);
    ctx.quadraticCurveTo(5.6, -3.6, 7.8, -8.4);
    ctx.quadraticCurveTo(11, -7, 9, 6);
    ctx.closePath(); ctx.fill();
    ctx.fillStyle = tint(col, 0.55); // brim band
    ctx.strokeStyle = ctx.fillStyle; ctx.lineWidth = 2;
    ctx.beginPath(); ctx.rect(-9.4, 6, 18.8, 2.8); ctx.fill(); ctx.stroke();
    ctx.fillStyle = '#ffd23e'; // bells
    var tips = [[-7.9, -8.8], [0.1, -11.3], [8, -8.8]];
    for (var i = 0; i < tips.length; i++) {
      ctx.beginPath(); ctx.arc(tips[i][0], tips[i][1], 1.7, 0, Math.PI * 2); ctx.fill();
    }
  }

  function iconUnknown(ctx, col) {
    ctx.strokeStyle = col; ctx.lineWidth = 2.4;
    ctx.beginPath(); ctx.arc(0, 0, 9.6, 0, Math.PI * 2); ctx.stroke();
    ctx.fillStyle = col;
    ctx.font = 'bold 13px sans-serif';
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillText('?', 0, 0.8);
  }

  var ICONS = {
    crewmate: iconCrewmate,
    sheriff: iconSheriff,
    engineer: iconEngineer,
    scientist: iconScientist,
    medic: iconMedic,
    tracker: iconTracker,
    impostor: iconImpostor,
    shapeshifter: iconShapeshifter,
    phantom: iconPhantom,
    jester: iconJester,
  };

  function icon(roleId, ctx, x, y, size) {
    if (!ctx) return;
    var d = DEFS[roleId];
    ctx.save();
    ctx.translate(x, y);
    var s = (+size || 24) / 24;
    ctx.scale(s, s);
    ctx.lineJoin = 'round';
    ctx.lineCap = 'round';
    (ICONS[roleId] || iconUnknown)(ctx, d ? d.color : '#8fd3ff');
    ctx.restore();
  }

  /* ------------------------------------------------------------------ */

  AL.roles = {
    DEFS: DEFS,
    assign: assign,
    teamOf: teamOf,
    isImpostor: isImpostor,
    defaultRoleSettings: defaultRoleSettings,
    flavor: flavor,
    icon: icon,
  };
})();
