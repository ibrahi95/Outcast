# Outcast — Technical Specification (v1)

A polished, serverless, browser-based social-deduction game in the spirit of Among Us.
Pure static files. Multiplayer is peer-to-peer via WebRTC (PeerJS + its free cloud broker for
signaling only). All art is procedural canvas drawing. All audio is synthesized with Web Audio.
No build step, no bundler, no external assets except the PeerJS script from CDN.

This document is the CONTRACT between modules. Every module is written by a different author.
Follow the interfaces here EXACTLY — names, argument shapes, event payloads. If you must deviate,
keep the specified surface working and note the deviation in your report.

---

## 0. Stack & file layout

- Vanilla JavaScript, **no ES modules, no imports/exports**. Each file is an IIFE in strict mode
  that attaches its API to the global namespace `window.AL` (created by util.js, but every file
  should start with `window.AL = window.AL || {};` defensively).
- Files & load order (index.html loads them in this order):

```
index.html            (already written — do not modify)
styles.css            (owned by ui.js author)
hud.css               (owned by hud.js author)
js/util.js            (already written — do not modify) -> AL.C, AL.util, AL.bus
js/maps.js            (already written — do not modify) -> AL.maps registry + parser
js/map_vessel.js      (maps author A)  -> registers 'vessel'
js/map_meteor.js      (maps author A)  -> registers 'meteor'
js/map_outpost.js     (maps author B)  -> registers 'outpost'
js/map_abyss.js       (maps author B)  -> registers 'abyss'
js/characters.js      -> AL.chars
js/roles.js           -> AL.roles
js/audio.js           -> AL.audio
js/tasks.js           -> AL.tasks
js/engine.js          -> AL.engine
js/render.js          -> AL.render
js/net.js             -> AL.net
js/game.js            -> AL.game
js/ui.js              -> AL.ui   (menus, lobby, wardrobe, settings, end screen; owns styles.css)
js/hud.js             -> AL.hud  (in-game HUD, meeting UI, task/device panels; owns hud.css)
js/main.js            (written by integrator — do not write it)
```

- Write ONLY the file(s) assigned to you. Never modify files owned by others or this spec.
- Code style: readable, cohesive, no TODOs, no stubbed/empty functions, no console.log spam
  (console.warn for real problems is fine). ASCII-only in code; unicode allowed inside UI strings.
- Everything must work offline except PeerJS signaling (only needed for online rooms).
- Target: 60fps on a mid laptop, up to 15 players.

## 1. Global constants — AL.C (defined in util.js, already written)

```js
AL.C = {
  TILE: 64,              // world pixels per tile
  PLAYER_R: 20,          // player collision radius (px)
  SPEED: 230,            // base walk speed px/s (multiplied by settings.speed)
  VISION_CREW: 5.0,      // vision radius in TILES (multiplied by settings.crewVision)
  VISION_IMP: 7.5,       // impostor vision in tiles
  KILL_RANGE: 78,        // px
  USE_RANGE: 84,         // px (tasks, devices, vent entering)
  REPORT_RANGE: 120,     // px
  SNAP_HZ: 15,           // host snapshot rate & client pos send rate
  INTERP_MS: 120,        // remote player interpolation delay
  MAX_PLAYERS: 15,
  PROTO: 1,              // protocol version
  NAME: 'Outcast',
}
```

## 2. util.js — AL.util & AL.bus (already written; use, don't redefine)

```js
AL.util = {
  clamp(v,a,b), lerp(a,b,t), dist(x1,y1,x2,y2), angle(x1,y1,x2,y2),
  rng(seed)            // -> mulberry32 function returning [0,1)
  randId(len)          // uppercase alphanumeric code, no ambiguous chars
  pick(arr, rnd?), shuffle(arr, rnd?),   // rnd optional () => [0,1)
  now(),               // performance.now()
  fmtTime(seconds)     // "M:SS"
  deep(obj)            // JSON deep clone
}
AL.bus = { on(ev,fn)->off, off(ev,fn), once(ev,fn), emit(ev,payload) }
```

`AL.bus` is the single global event bus. All cross-module events flow through it. The full event
table is in §14. Modules must only emit/listen to events listed there (plus their own internal ones
prefixed with their module name).

## 3. maps.js — AL.maps (already written; map authors read this carefully)

`AL.maps.register(def)` stores a map definition. `AL.maps.list()` -> array of defs (id, name,
sizeLabel, modes). `AL.maps.load(id)` -> parsed **runtime map** (cached).

### 3.1 Map definition schema (what map authors write)

```js
AL.maps.register({
  id: 'vessel', name: 'The Vessel', sizeLabel: 'Large',
  modes: ['classic','hideseek','outbreak','sprint'],   // modes this map supports ('all' ok)
  palette: {
    floor: '#3b4668', floorAlt: '#333d5c',   // checker tint
    wall: '#1b2033', wallEdge: '#525f8f',    // wall fill + highlight edge
    accent: '#35e0ff',                       // room label / trim color
    bg: 'space'                              // 'space' | 'planet' | 'ocean' (render bg theme)
  },
  grid: [        // array of equal-length strings. '#'=wall, '.'=floor, ' '=void(space),
    '#######',   // '~'=alt floor (visual tint only, walkable)
    '#.....#',
    '#######',
  ],
  rooms: [ // rects in TILE coords [tx,ty,w,h]; a room may have several rects
    { id:'cafeteria', name:'Cafeteria', rects:[[10,2,14,10]] },
  ],
  spawn: { tx: 17, ty: 6 },                 // players spawn in a ring around this tile
  vents: [ { id:'v1', tx:4, ty:5 }, ... ],
  ventLinks: [ ['v1','v2','v3'], ['v4','v5'] ],   // groups; every vent in a group is connected
  taskSpots: [ // id unique per spot; task = task id from §7; room = room id
    { id:'ts1', task:'wires', room:'electrical', tx: 5, ty: 8 },
    // Sabotage-fix consoles are taskSpots whose task id starts with 'sab_':
    { id:'sr1', task:'sab_reactor', room:'reactor', tx:3, ty:14 },
  ],
  devices: [ // kind: 'emergency'|'admin'|'cams'|'vitals'
    { kind:'emergency', tx:17, ty:6, room:'cafeteria' },
  ],
  doors: [ // closable by impostor sabotage; tiles must be floor tiles in the grid
    { id:'d_caf_n', room:'cafeteria', tiles:[[14,2],[15,2]] },
  ],
  decor: [ // procedural props drawn by render.js. kind list in §3.3
    { kind:'table', tx: 15, ty: 5, w:3, h:2 },
  ],
})
```

### 3.2 Runtime map (what AL.maps.load(id) returns; consumers: engine/render/game)

```js
{
  def, id, W, H,                 // W/H in tiles
  worldW, worldH,                // px
  isSolid(tx,ty),                // static walls/void + CLOSED doors
  isFloor(tx,ty),
  floorKind(tx,ty),              // 0 none, 1 floor, 2 alt floor
  doorAt(tx,ty),                 // door id or null
  doors: { [id]: {id,room,tiles,closed:false,closedUntil:0} },
  setDoor(id, closed),           // updates solidity + invalidates segment cache
  getSegments(),                 // array [x1,y1,x2,y2] wall segments in px (merged), includes closed doors
  roomAt(x,y),                   // px coords -> room object or null
  rooms, vents, ventLinksOf(id), // vents have px x,y added
  taskSpots, devices, spawn,     // px x,y added ({x,y} = tile center)
  decor,
  palette,
}
```

### 3.3 Decor kinds (render.js must draw all of these; map authors may only use these)

`table, chair, crate, barrel, plant, console, screen, pipes, wires, bed, locker, rock, crystal,
coral, seaweed, glass, lamp, rug, shelf, engine, window` — each drawn procedurally, scaled to
`w`x`h` tiles (default 1x1), in the map palette with slight per-instance variation
(seed by tx,ty).

### 3.4 Required content per playable map (vessel, outpost, abyss)

- Size roughly 60–100 tiles wide, 40–65 tall. Distinct rooms (10–16) connected by corridors,
  interesting loops (no dead-end-only layouts), landmark decor per room.
- ≥ 22 task spots covering ≥ 12 distinct task ids from §7, spread across rooms; wires in ≥ 3 spots;
  upload in ≥ 3 spots; exactly 1 'scan' spot (medbay-like room).
- Sabotage consoles: exactly 1 `sab_lights` (electrical-like room), 1 `sab_comms` (comms room),
  2 `sab_reactor` (same reactor room, a few tiles apart), 2 `sab_o2` (different rooms).
- Devices: exactly 1 emergency (central room), 1 admin, ≥1 cams, 1 vitals.
- ≥ 8 vents in ≥ 3 link groups. ≥ 6 closable doors on major choke points.
- 'vessel' follows the classic Skeld flow: central cafeteria with emergency button; upper engine,
  reactor, security west; medbay & admin center; electrical/storage south-center; comms/shields
  south-east; navigation east; weapons/O2 north-east. Original art, familiar bones.
- 'outpost' = lunar surface base (palette: warm greys + orange accent, bg 'planet'): habitat domes
  connected by tube corridors, some "outside" moon-surface areas with rocks.
- 'abyss' = deep-sea research station (palette: deep teals + green accent, bg 'ocean'): glass
  tunnels, kelp, airlock pools.
- 'meteor' = small FFA arena (~36x28) for bombtag: open center, obstacle rocks/crates, spawn
  center, no tasks/devices/vents needed, modes:['bombtag'].

## 4. characters.js — AL.chars

The signature crew look: a rounded "bean" astronaut with a reflective visor, backpack, stubby legs
with a bouncy walk cycle. Original art — do NOT copy Among Us pixel-for-pixel, but capture the charm.

```js
AL.chars.COLORS   // exactly 18: [{ id:0..17, name:'Red', body:'#c51111', shade:'#7a0838' }, ...]
                  // pleasing, distinguishable spread incl. classic-feeling + fresh ones
AL.chars.HATS     // >= 16: [{ id:'none', name:'None' }, { id:'tophat', name:'Top Hat' }, ...]
AL.chars.PETS     // >= 6:  [{ id:'none', name:'None' }, { id:'blob', name:'Blob' }, ...]
AL.chars.SKINS    // >= 6 suit styles: [{ id:'none', name:'None' }, { id:'suit', ...}] (torso overlay)

AL.chars.draw(ctx, p)
// p: { x, y (feet center, world px — ctx is already camera-transformed),
//      color (0..17), hat, pet (drawn trailing at p.petX,p.petY if provided), skin,
//      dir (1 right, -1 left), moving (bool), dead (bool -> draw as ghost),
//      ghost (alias of dead for clarity), scale (default 1),
//      t (ms timestamp for animation), alpha (0..1), morphColor (int|null: shapeshifter),
//      shadow (bool, default true) }
// Walk cycle: body bob + leg shuffle driven by t when moving. Idle: soft breathing bob.
// Ghost: translucent, no legs, gentle float (sin on t), little tail wisp.
AL.chars.drawBody(ctx, b)      // corpse: half-bean lying down, X eyes on visor or bone-ish stub,
                               // small teal ecto pool. b: { x, y, color, t }
AL.chars.drawPet(ctx, pet)     // { x, y, kind, color, dir, moving, t }
AL.chars.drawPortrait(ctx, opts) // bust for meeting UI/wardrobe:
                               // { x,y,size,color,hat,skin,dead,t, dir }
AL.chars.height                // approx body height px (~52) for nameplate offset
```

Hats and pets are each drawn procedurally (a draw function per id kept internal). Make them charming:
top hat, party cone, halo, crown, beanie, chef, cowboy, viking horns, headphones, flower, antenna,
paper bag, ushanka, wizard, pirate, sprout, etc. Pets: mini-crewmate, blob, robot, cat, ufo, snail...
Pets follow their owner (game provides petX/petY); when drawing standalone (wardrobe) idle-animate.

## 5. roles.js — AL.roles

```js
AL.roles.DEFS = {
  crewmate:     { team:'crew',     color:'#8fd3ff', name:'Crewmate' },
  sheriff:      { team:'crew',     color:'#ffd23e', name:'Sheriff',
                  desc:'Shoot an impostor. Shoot wrong and you die instead.',
                  abilities:[{id:'shoot', name:'Shoot', cd:30}] },
  engineer:     { team:'crew',     color:'#ff9d2e', name:'Engineer',
                  desc:'Use vents. 12s inside max.', abilities:[{id:'vent',name:'Vent',cd:25}] },
  scientist:    { team:'crew',     color:'#3ee06f', name:'Scientist',
                  desc:'Check vitals anywhere.', abilities:[{id:'vitals',name:'Vitals',cd:12}] },
  medic:        { team:'crew',     color:'#3ef0d0', name:'Medic',
                  desc:'Give one player a shield that blocks a kill.',
                  abilities:[{id:'shield', name:'Shield', cd:0, once:true}] },
  tracker:      { team:'crew',     color:'#c8ff4d', name:'Tracker',
                  desc:'Tag a player; see their position for 25s.',
                  abilities:[{id:'track', name:'Track', cd:45}] },
  impostor:     { team:'impostor', color:'#ff3860', name:'Impostor',
                  desc:'Kill the crew. Sabotage. Deceive.' },
  shapeshifter: { team:'impostor', color:'#ff3860', name:'Shapeshifter',
                  desc:'Take the look of another crewmate for 15s.',
                  abilities:[{id:'shift', name:'Shift', cd:25}] },
  phantom:      { team:'impostor', color:'#ff3860', name:'Phantom',
                  desc:'Turn invisible for 10s.', abilities:[{id:'cloak',name:'Cloak',cd:30}] },
  jester:       { team:'neutral',  color:'#d06bff', name:'Jester',
                  desc:'Get yourself voted out to win.' },
}
AL.roles.assign(playerIds, settings, mode, rnd) // -> { [playerId]: roleId }
// settings.impostors = 1..3; settings.roles = { sheriff:{chance:0..100,max:1}, ... } for every
// non-basic role. Impostor specials (shapeshifter/phantom) replace base impostors by chance.
// Jester replaces a crewmate by chance (never in <6 players). In 'hideseek'/'outbreak'/'bombtag'/
// 'sprint' modes only base roles are used (assign handles this).
AL.roles.teamOf(roleId), AL.roles.isImpostor(roleId)
AL.roles.defaultRoleSettings() // -> the settings.roles object with sensible defaults
```

## 6. audio.js — AL.audio  (make it genuinely good — this is a headline feature)

Web Audio, procedural only. Build a small but real synth engine: polyphonic voices (detuned saw/
square/triangle/sine + noise), ADSR, biquad filters with envelope, LFOs, a master chain with a
gentle compressor, a synthesized-impulse convolver reverb send, and a tempo-synced feedback delay
send. Music uses a lookahead pattern scheduler (setInterval ~25ms scheduling 100ms ahead of
AudioContext.currentTime). Write actual compositions — chord progressions, basslines, arps,
melodies, synthesized drums (kick=pitch-swept sine, snare/hat=shaped noise). No plain beeps.

```js
AL.audio.init()                   // safe to call multiple times; call on first user gesture
AL.audio.playMusic(id)            // crossfade if something else playing
AL.audio.stopMusic(fadeSec=1)
AL.audio.sfx(id, opts?)           // opts: { vol, pan(-1..1), rate }
AL.audio.setMusicVol(0..1), AL.audio.setSfxVol(0..1)   // persisted by UI
AL.audio.duck(ms)                 // briefly duck music (under stings)
```

**Music tracks (ids pinned):**
- `menu` — the identity theme. Mid-tempo synthwave/space, minor key, warm pad chords
  (e.g. i–VI–III–VII), plucky arp, soft kick and side-stick, memorable 4–8 bar lead motif. Loop ~32 bars.
- `lobby` — lighter, playful variation of menu (same key/motif family, bouncier).
- `game` — sparse tense ambience: slow dark pad, deep pulse, occasional motif echoes; must sit
  under gameplay without fatigue. Subtle random variation between loops.
- `meeting` — tense clock-ticking discussion loop: staccato bass, ticking percussion, rising tension.
- `hide` — driving chase loop for Hide & Seek (faster, percussive, pounding eighth-note bass).
  Expose intensity: `AL.audio.setMusicParam('intensity', 0..1)` (adds hats/layer as it rises).
- `win` — triumphant 6–10s victory jingle (resolves major).
- `lose` — dark 5–8s defeat sting.

**SFX ids (pinned; unknown ids must fail silently with a soft default click):**
`ui_hover, ui_click, ui_back, join, leave, chat, countdown, start_whoosh,
step_a, step_b, use, task_open, task_close, task_done, task_progress, task_all_done,
kill, body_report, emergency, meeting_chime, vote, vote_lock, eject,
sab_alarm (loopable: AL.audio.sfx('sab_alarm',{loop:true}) returns {stop()}), sab_fixed,
door_close, vent_in, vent_out, vent_move,
shield_on, shield_break, shift, cloak, uncloak, sheriff_shot,
heartbeat (loopable), bomb_tick, bomb_pass, explode, scan_beep, wire_snap, card_ok, card_bad,
download_tick, horn, splash, sparkle`
Footsteps alternate step_a/step_b, subtle pitch jitter. Kill = meaty thud + quick dark stab. Emergency
= klaxon-ish but musical. Eject = airlock whoosh into deep space silence.

## 7. tasks.js — AL.tasks  (14 minigames + 4 sabotage-fix panels)

```js
AL.tasks.DEFS = { [taskId]: {
  id, name,                       // display name e.g. 'Fix Wiring'
  kind: 'short'|'long'|'common',  // classic task categories
  steps: 1|2|3,                   // multi-location tasks (game picks that many spots)
  visual: bool,                   // true only for 'scan'
  make(el, api) -> cleanup()      // build the minigame inside el (a ~460x420px panel div)
} }
// api: {
//   done(),                  // call when this step is complete (host validates)
//   progress(0..1),          // optional midway progress (drives download bar etc.)
//   sfx(id),                 // play a sound
//   rnd(),                   // seeded [0,1) — SAME seed on retry, unique per spot
//   step, steps,             // which step of a multi-step task (0-based)
//   data                     // extra data injected by game (e.g. o2 code)
// }
// cleanup() must remove listeners/intervals. Minigames must work with mouse AND touch
// (pointer events), take 4–25 seconds, and be self-explanatory (1-line hint at top).
```

**Task ids (pinned — map authors use exactly these):**
- `wires` (common, steps up to 3): match & drag 4 colored wires left→right; sparks on connect.
- `swipe` (common): drag a card through a reader at the right speed; too fast/slow rejects.
- `upload` (long, steps 2): step 0 "Download Data" progress bar w/ moving file icon, step 1 "Upload".
- `asteroids` (long): click/tap 12 drifting asteroids to blast them, crosshair + laser fx.
- `shields` (short): tap the 7 hex cells to light them all.
- `calibrate` (short): 3 dials — tap when the spinner passes 12 o'clock, 3x in a row.
- `chart` (short): drag your ship icon along a dotted route through 5 waypoints.
- `filter` (short): flick 8 leaves/debris out of an air filter grate (drag them off-panel).
- `fuel` (long, steps 2): hold a lever to fill a canister (step 0), then fill the engine (step 1).
- `divert` (short, steps 2): flip the big breaker for your target room, then accept power downstream.
- `unlock` (short): rotate a ring to 3 shown angles (safe-dial style), satisfying clicks.
- `scan` (long, visual): stand in the scanner 8s (auto-completes; green rings visible to everyone).
- `steer` (short): keep a drifting crosshair inside a moving target zone for 5s (joystick feel).
- `trash` (short, steps 2): hold a lever, watch trash flush out the airlock w/ physics-y bits.

**Sabotage fix panels (same make() contract):**
- `sab_lights`: flip the 5 breaker switches that are down (some already up).
- `sab_comms`: drag a tuning dial to match a target waveform (visual + audio wobble via api.sfx).
- `sab_reactor`: hold your hand on a pad (hold pointer) until meltdown gauge empties (~2.5s). Two
  consoles must be BEING HELD simultaneously (game handles the pairing; panel calls api.progress
  while held, api.done() when host confirms — panel should listen: game closes it).
- `sab_o2`: keypad — type the 5-digit code from api.data.code, ok/clear buttons, receipt printout look.

Also export `AL.tasks.icon(taskId, ctx, x, y, size)` small glyph used in map markers (simple line icons).

## 8. engine.js — AL.engine (simulation plumbing; NO game rules here)

```js
AL.engine.init(canvas)         // sets up input listeners, resize (devicePixelRatio aware)
AL.engine.onFrame(fn)          // fn(dt, t) called each rAF; dt seconds clamped to 0.05
AL.engine.start(), AL.engine.stop()
AL.engine.input = {
  moveX, moveY,                // -1..1 combined (WASD/arrows + touch joystick), normalized
  aimX, aimY,                  // pointer position in world coords (via camera)
  usePressed, reportPressed, killPressed, ventPressed, mapPressed, // edge-triggered, auto-clear
  anyKey(cb),
}
// keys: WASD/arrows move; E or Space = use; R = report; Q = kill; F = vent/ability; Tab/M = map;
// Enter = chat focus (hud listens itself for Enter/Escape; engine must not swallow keys when
// document.activeElement is an input/textarea).
// Touch: left-half drag = virtual joystick (render via AL.engine.drawTouchUI(ctx) called by render);
// engine exposes AL.engine.touch = {active, baseX, baseY, stickX, stickY} for that.
AL.engine.camera = { x, y, zoom, follow(x,y,dt), shake(amt) }  // smooth-follow + trauma shake decay
AL.engine.applyCamera(ctx), AL.engine.resetCamera(ctx)
AL.engine.worldFromScreen(sx,sy), AL.engine.screenFromWorld(wx,wy)
AL.engine.moveCircle(map, x, y, dx, dy, r) // -> {x,y} circle vs solid tiles, axis-separated slide
AL.engine.canvasSize()        // {w,h} css px
```
Camera default zoom: fit ~11.5 tiles vertically (zoom = canvasH/(11.5*64)), clamped 0.6..1.6;
game may set zoom for modes. Also expose `AL.engine.setPixelSmoothing(bool)`.

## 9. render.js — AL.render (all world drawing; UI overlays belong to hud)

```js
AL.render.init(canvas)
AL.render.draw(frame)   // called every rAF by main with AL.game.getFrame() (§11.6)
AL.render.spawnParticles(kind, x, y, opts?)  // kinds: 'poof','spark','ecto','confetti','smoke',
                                             // 'bubbles','dust','shieldBreak','explosion','blood_teal'
AL.render.flash(color, ms)                   // fullscreen tint flash
AL.render.drawRegionTo(ctx, map, cx, cy, wPx, hPx, zoom, frame) // for cams device panel
AL.render.drawMinimap(ctx, map, w, h, blips) // blips:[{x,y,color,kind:'you'|'task'|'sab'|'player'|'body'}]
AL.render.getMapThumb(mapId, w, h)           // cached canvas for map-select cards
```
Responsibilities & quality bar:
- Static map layer cached to offscreen canvas per map (floor w/ subtle per-room tint from rooms +
  palette, checker `~` alt tiles, wall tiles with edge highlight + soft drop shading, decor from
  §3.3, vent grates, door frames). Redraw static layer only on door state change (or draw doors
  dynamically on top — your choice).
- Animated background outside the hull by palette.bg: 'space' = parallax starfield + occasional
  shooting star + distant planet; 'planet' = moon surface w/ stars + earthrise; 'ocean' = deep
  gradient + light rays + rising bubbles + occasional fish silhouette.
- Draw order: bg → static map → task-spot markers (soft pulsing outline for MY available tasks,
  yellow; sabotage consoles flashing red during sabotage) → bodies → vents → players (y-sorted,
  via AL.chars.draw; nameplates above heads: name colored white/gray-dead, small role tag ONLY
  when frame.revealRoles or player is me) → pets → doors (closed) → particles → **vision/lighting**
  → weather/fog subtlety → sabotage overlays (reactor red pulse vignette, o2 warning) → engine
  touch UI → CRT-subtle vignette.
- Vision: offscreen darkness canvas; punch out a visibility polygon (raycast to
  map.getSegments() endpoints ±0.0001 rad, sorted by angle) with a radial gradient falloff at
  frame.vision.r px. During lights sabotage crew radius is already reduced by game. Ghosts
  (frame.me.dead) see everything (skip darkness). Impostors unaffected by lights.
- Kill flourish: on bus 'game:kill' spawn ecto/poof at victim + camera shake if near.
- Keep it fast: pools for particles, no per-frame allocations in hot loops where avoidable.

## 10. net.js — AL.net (transport only; no game logic)

Uses global `Peer` (PeerJS, loaded from CDN in index.html; check `typeof Peer !== 'undefined'` and
emit 'net:error' {code:'nolib'} if missing). Free PeerJS cloud broker (default `new Peer(...)`).

```js
AL.net.host(meta) -> Promise<code>   // code = AL.util.randId(6); peer id 'alkd2026-<code>';
                                     // on 'unavailable-id' retry with new code (max 5)
AL.net.join(code, meta) -> Promise   // random peer id; connect to 'alkd2026-<CODE>' with {metadata:meta, reliable:true}
                                     // reject with friendly Error on: peer-unavailable, network, timeout(10s)
AL.net.send(id, msg), AL.net.broadcast(msg, exceptId?)   // msg = plain JSON-able object
AL.net.peers() -> [ids]; AL.net.id; AL.net.isHost; AL.net.code
AL.net.kick(id), AL.net.leave()
```
Bus events emitted: `net:open {id,code?}`, `net:peerJoin {id, meta}` (host only),
`net:peerLeave {id}`, `net:msg {from, msg}`, `net:error {code, message}` (friendly message),
`net:hostLost` (client side: connection to host closed).
Heartbeat `{t:'hb'}` every 2s both directions; 8s silence -> treat as leave. Filter 'hb' from
net:msg. Guard against malformed JSON/objects (try/catch, ignore). Max message ~64KB.

## 11. game.js — AL.game (THE BRAIN: host-authoritative sim, modes, bots)

Runs in two flavors sharing code: **host** (authoritative, also plays) and **client** (predicts own
movement, renders interpolated remote state, sends inputs/actions). Freeplay = host with bots, no net.

### 11.1 Public API (called by ui/hud/main)

```js
AL.game.hostLobby(profile)             // -> Promise<code>; profile {name,color,hat,pet,skin}
AL.game.joinLobby(code, profile)       // -> Promise
AL.game.startFreeplay(profile, opts)   // opts {mapId, mode, botCount, myRole}
AL.game.addBot(), AL.game.removeBot()  // host, lobby only
AL.game.leave()                        // teardown to menu
AL.game.setSetting(key, value)         // host only; broadcasts lobby update
AL.game.setMode(modeId), AL.game.setMap(mapId)     // host only
AL.game.startGame()                    // host only; validates min players (>=4 online classic; bots count)
AL.game.sendChat(text)                 // lobby/meeting/ghost chat (game routes by phase/dead)
AL.game.castVote(targetIdOr'skip')
AL.game.callMeeting()                  // at emergency device
AL.game.reportBody()
AL.game.attemptKill()
AL.game.useAbility(abilityId)          // sheriff shoot, medic shield, tracker track target =
                                       // nearest valid player in range/vision; shapeshifter shift
                                       // = nearest; scientist vitals opens device panel
AL.game.enterVent(), AL.game.ventTo(ventId), AL.game.exitVent()
AL.game.interact()                     // context 'use': nearest task spot/device/sab console in range
AL.game.panelDone(spotId)              // hud reports minigame completion
AL.game.panelClosed()                  // hud closed a panel without finishing
AL.game.sabotage(kind)                 // 'lights'|'reactor'|'o2'|'comms' (impostor, via sab map)
AL.game.closeDoors(roomId)             // impostor
AL.game.getFrame()                     // §11.6 — render pull, every rAF
AL.game.getHud()                       // §11.7 — hud pull, every rAF
AL.game.getDeviceData(kind)            // 'admin' -> {rooms:[{id,name,count}]}; 'vitals' ->
                                       // [{id,name,color,dead,disconnected}]; 'cams' -> {spots:[{x,y,room}]}
AL.game.state                          // read-only-ish: {phase, mode, mapId, code, isHost, settings,
                                       //  players (public list §11.5), meId, winner}
AL.game.settingsSchema()               // §11.4 list for UI to auto-build the settings panel
```

### 11.2 Phases
`menu → lobby → countdown(3s) → reveal(role card ~3.5s) → play ⇄ meeting/eject → end → lobby`
Emit `game:phase {phase}` on every change (see §14 for all events).

### 11.3 Modes (modeId pinned)
- `classic` — tasks vs impostors. Crew win: all tasks OR all impostors ejected/dead. Impostor win:
  imps >= non-imp alive OR reactor/O2 timeout. Meetings, sabotage, roles per settings.
- `hideseek` — impostors REVEALED at start (everyone sees role banner). 10s freeze for impostor
  ("hiding time"). No meetings/reports/sabotage/bodies persist (corpses fade after 5s). Crew vision
  x0.6, impostor vision x1.6, impostor speed x1.08, kill cd 9s. Timer settings.hideTime (default
  240s) counts down; each completed task -6s. Final 25s: 'hide' music intensity 1, impostor
  speed x1.18. Crew alive when timer ends win; impostor wins by killing all. Ghosts finish tasks.
- `outbreak` — 1 Patient Zero (bright green tint 'infected'); kills CONVERT instead (victim becomes
  infected after 2s "turning" animation, keeps playing). Infected see each other; kill cd: zero's
  18s, converted 30s. No meetings. Crew win: global taskbar 100% before everyone infected; infected
  win: all converted. Show infection counter.
- `bombtag` — FFA on 'meteor'. A lit bomb attaches to a random player; passes on TOUCH (contact,
  0.8s transfer immunity); explodes every 25s (audible tick accelerando + growing) eliminating the
  holder (spectate as ghost); new bomb after 3s. Speed x1.15 for the holder. Last alive wins
  (game:end winner = player). No tasks/roles.
- `sprint` — FFA task race: everyone gets the same 10-task list; first to finish all wins; live
  leaderboard (ranks in getHud().sprint). Random 'lights flicker' chaos events every ~35s (vision
  x0.5 for 6s, forewarned 2s). No kills. Others shown semi-transparent (x0.6 alpha).

### 11.4 Settings (defaults; host edits in lobby; schema drives UI)
`impostors:1(1-3), speed:1(0.5-2 step .25), crewVision:1(0.25-2), impVision:1.25(0.25-2.5),
killCd:35(10-60 s), emergencies:1(0-3), emergencyCd:20, discussTime:30(0-120), voteTime:60(15-180),
anonymousVotes:false, confirmEjects:true, visualTasks:true, taskbar:'always'|'meetings'|'never',
commonTasks:2(0-2), longTasks:2(0-3), shortTasks:3(0-5), hideTime:240(120-420),
roles:{...per §5 chance/max}`  — settingsSchema() returns
`[{key,label,type:'int'|'float'|'bool'|'enum',min,max,step,options?,group,modes?}]` so UI renders it.

### 11.5 Public player shape (lobby & state.players)
`{ id, name, color, hat, pet, skin, isHost, isBot, ready:true, dead, disconnected }`
(roles are PRIVATE — host only sends your own role at start; on end/eject reveal per rules.)

### 11.6 getFrame() (render contract — every field render reads must exist)
```js
{ t, phase, mode, mapId, map,          // runtime map (or null in menu)
  me: { id,x,y,dir,moving,dead,role,team,inVent,color,hat,pet,skin,cloaked,morphColor },
  players: [ { id,name,color,hat,pet,skin,x,y,dir,moving,dead, inVent(bool → skip draw),
               alpha, morphColor, petX,petY, isMe, roleTag(str|null), speaking:false } ],
  bodies: [ {id,color,x,y,t0} ],
  vision: { r(px), dark(0..1 extra dim from lights sab) },
  revealRoles(bool: hideseek/end), sab: {kind,endsAt}|null,
  doors (from map), taskSpotsMine: [spotIds highlighted],
  bomb: {holderId, endsAt}|null, camsWatched(bool: someone on cams → cam blink),
  shake?: consumed via AL.engine.camera }
```
Remote players interpolated with AL.C.INTERP_MS buffer; me = predicted local. Positions frozen in
meeting (frame still returned; hud draws meeting UI on top).

### 11.7 getHud()
```js
{ phase, mode, timerText|null,                      // hideseek countdown, bomb timer, sab countdown
  use:  null|{kind:'task'|'device'|'sab', label},   // nearest in range (label e.g. 'Fix Wiring')
  kill: null|{cd:0(ready)|seconds},                 // shown only impostor/sheriff
  report: bool, vent: null|{in:bool},
  ability: null|{id,name,cd,ready,once},
  sabotage: bool(imp, ready), sabCd: seconds,
  emergencyLeft, tasks:[{name,room,done,step,steps,progress}], taskbar:0..1|null,
  ventLinks: [{id,dirLabel}] when in vent,
  sprint: null|[{name,color,done,total,me}], infection: null|{infected,total},
  meeting: null|{stage:'intro'|'discuss'|'vote'|'reveal', endsAt, reporter, bodyOf,
                 votes:{[voterId]:targetId|'skip'} (reveal or !anonymous ? filled : {voterId:true}),
                 canVote(bool), myVote },
  trackArrow: null|{x,y} (tracker target world pos), watchers:{cams:bool} }
```

### 11.8 Host simulation details
- Tick at 30Hz fixed (accumulator); snapshots broadcast at AL.C.SNAP_HZ with compact arrays.
- Clients send `{t:'pos', d:[x,y,dir,moving]}` at 15Hz; host clamps displacement to
  speed*dt*1.8 and rejects wall-clips by snapping to last valid.
- All actions validated host-side (range via AL.C, cooldowns, phase, alive, role).
- Kill: victim -> dead ghost; body dropped at victim pos; killer teleports onto victim (classic);
  'game:kill' broadcast w/ victimId (+youVictim client-side flag); shield (medic) blocks once ->
  'shield_break' fx to medic+target+killer, killer cd reset to 10s.
- Meetings: report/emergency → gather (positions reset to spawn ring), bodies cleared, sab paused
  (reactor/o2 CANCELLED for fairness), stages intro(3s)/discuss/vote/reveal(5s)+eject(5.5s).
  Votes: majority ejects; tie/skip = no eject. confirmEjects → announce team. Jester ejected →
  instant jester win. After meeting: kill cds reset, 5s no-kill grace.
- Sabotage: shared cd 30s (doors separate: per-room 25s, close for 10s). lights: crew vision x0.35
  until fixed. reactor: 40s to doom, needs both consoles held within same 3s window (each hold
  2.5s). o2: 35s, 2 keypads (each its own code via panel data). comms: task list hidden, cams/admin
  disabled, task markers hidden until fixed.
- Tasks: assignment per settings counts (common same for all); each spot instance unique per player;
  scan is 8s stand-in-zone visual (broadcast ring fx while scanning if visualTasks). Global taskbar
  = done/total across alive+dead crew (ghosts still do tasks) per taskbar setting timing.
- Vitals/admin/cams live-computed on host; clients request via `{t:'dev'}`/response or host includes
  light aggregates in snapshots (your choice — keep bandwidth sane).
- Disconnects: player marked disconnected+dead(no body); host leaving → all clients get net:hostLost
  → ui shows "Host left" → menu. Win checks after every relevant event.
- **Bots** (freeplay + host 'Add Bot'): BFS pathfinding over floor tiles (recompute target on
  arrive/blocked). Crew bots: pick own task spots, walk, "do" them (4-8s stand), wander/idle
  sometimes, run from witnessed kills, report bodies they bump into (70%), vote: witnessed killer
  else random-ish (weighted sus), fix sabotages sometimes. Impostor bots: hunt isolated targets,
  kill off-cooldown when no witnesses nearby, occasionally vent away after, fake tasks, sabotage
  sometimes, in meetings vote randomly (never self). Bot chat: short canned lines on meeting start /
  accusations ('where?', 'i was in <room>', 'X is sus, saw them near <room>'). Bot names: pick from
  ['Ada','Bolt','Comet','Dobby','Echo','Fizz','Gizmo','Juno','Koda','Луна'→'Luna','Mochi','Nova',
  'Ozzy','Pip','Quark','Rusty','Sprout','Tango','Widget','Ziggy'].
- Mode logic per §11.3 including win conditions and mode-specific HUD data.

### 11.9 Client prediction
Own movement simulated locally each frame with AL.engine.moveCircle + input; host echoes are
ignored for self unless teleport flag (meeting gather, kill jump, vent) — then snap.

## 12. ui.js — AL.ui (menus/lobby/etc; owns styles.css) & 13. hud.js — AL.hud (owns hud.css)

Both build their DOM dynamically inside `#ui-root` (empty div over the canvas). Canvas is
`#game-canvas` (fills viewport). `AL.ui.init()` / `AL.hud.init()` called once by main.js.
UI shows/hides screens by listening to bus events + calling AL.game API. Keep DOM creation in
helper `el(tag, cls, parent)` style — no innerHTML with user strings (XSS: always textContent for
names/chat).

**Design language (both css files):** dark space theme. Tokens:
`--bg:#0a0e1c; --panel:#151b31; --panel2:#1d2440; --line:#2c3560; --text:#eaf0ff; --dim:#8b96c9;
--accent:#35e0ff; --danger:#ff3860; --good:#3ee06f; --warn:#ffd23e; radius 14px+;`
Chunky rounded buttons w/ 3px borders + bottom shadow edge (press = translateY), letterspaced
uppercase titles, panel headers with accent underline glow. Font stack:
`'Trebuchet MS', 'Segoe UI', system-ui, sans-serif` with weight 800 titles. Subtle animations
(fade/slide 150-250ms). Fully responsive down to 380px + touch friendly (44px+ hit targets).
`ui_hover`/`ui_click` sfx on interactive elements (delegate listeners).

**AL.ui screens:**
- `menu`: big animated logotype "Outcast" (letter bounce/glow), version tag, buttons: HOST GAME,
  JOIN GAME (code input inline), FREEPLAY, WARDROBE, HOW TO PLAY, OPTIONS. A canvas strip of your
  character walking with pet behind the menu (use AL.chars.draw on a small canvas). Music: 'menu'.
  First interaction anywhere calls AL.audio.init().
- `join`: 6-char code input (auto-uppercase, paste-friendly), name field (persisted), connect
  + friendly errors.
- `host`: name field, then creates lobby.
- `freeplay`: map picker (thumbnails via AL.render.getMapThumb), mode picker, bots count, role.
- `wardrobe`: live preview (canvas, AL.chars.drawPortrait or full draw, idle anim), color grid
  (18 swatches, taken-colors disabled in lobby context), hats/pets/skins galleries (canvas previews),
  persist to localStorage 'al_profile'.
- `lobby`: room code display w/ copy button ("click to copy") + share hint, player list (portrait,
  name, host star, kick button for host), chat, mode selector (5 cards w/ description), map selector,
  settings panel (auto-built from AL.game.settingsSchema(), host-editable, live for others), add-bot
  button (host), START button (host, with min-player tooltip). Music: 'lobby'.
- `howto`: friendly illustrated rules pages (crew/impostor/roles/modes/controls incl. touch).
- `options`: music/sfx sliders (persist 'al_options', apply via AL.audio), colorblind-friendly
  nameplate toggle (stores; game/render read AL.ui.options), reduced-flash toggle.
- `end`: victory/defeat splash (bus 'game:end'): big VICTORY/DEFEAT text (crew cyan / impostor red /
  jester purple / winner name), parade of winner characters (canvas), stats lines, confetti via
  AL.render.spawnParticles is canvas-side — ui can do its own DOM confetti; buttons: BACK TO LOBBY
  (host triggers, others auto-follow), LEAVE.
- Connection toasts, error modals ('net:error', 'net:hostLost'), confirm dialogs (leave etc).

**AL.hud (in game):**
- Top-left: task list panel (collapsible, per-task progress, room names; hidden during comms sab
  with "COMMS OFFLINE" glitch text), global taskbar.
- Bottom-right cluster: USE (context icon), REPORT; KILL + cooldown ring (impostor/sheriff),
  VENT, ABILITY button w/ cooldown, SABOTAGE (opens sab map overlay: full minimap + door buttons
  per room + 4 system icons). Buttons enable/disable from getHud() every frame; keyboard hints on
  desktop.
- Top-right: room name you're in; mode timers (hide&seek countdown, bomb timer w/ pulsing red,
  sprint leaderboard mini-panel, infection counter); sab warning banner w/ countdown (reactor/o2).
- Minimap overlay (Tab/M or button): map + you + task blips (+all players for ghosts).
- Task panel overlay: dark backdrop, centered panel (title + close X), instantiates
  AL.tasks.DEFS[id].make(el, api); wires api.sfx→AL.audio.sfx, done→AL.game.panelDone. Draggable
  is not needed. ESC/close → AL.game.panelClosed().
- Device panels: admin (room occupancy table w/ live counts), cams (2x2 canvases via
  AL.render.drawRegionTo of camera spots, static-flicker fx, red REC dot; watching sets
  camsWatched), vitals (player list w/ pulse lines: alive animated ECG, dead flatline, dc'd grey).
- Meeting overlay: full-screen panel "EMERGENCY MEETING"/"DEAD BODY REPORTED" intro stinger, grid
  of player cards (portrait canvas, name, dead=grayscale w/ X, reporter icon, shield/voted "I VOTED"
  stamp), chat on the side (dead see ghost chat), vote flow: select → confirm/cancel, SKIP button,
  timer bar, reveal: vote counts by target with voter chips (or anonymous), then result text.
  Ghost chat input available while dead outside meetings too (small chat drawer).
- Eject cinematic: fullscreen starfield canvas, body tumbling across (AL.chars.draw rotated),
  typewriter text "Nova was ejected." / "Nova was An Impostor." per confirmEjects, then fade.
- Kill cam: brief fullscreen overlay when YOU are killed (killer bean lunges, screen crack),
  then "You are dead — finish your tasks!" ghost banner.
- Role reveal card at game start: dark screen, your role name in team color, teammates shown for
  impostors, flavor line, appropriate sting (game plays it).
- Toasts (bus 'game:toast'), chat bubbles above players optional (nice-to-have).

## 14. Bus events table (complete; payloads must match exactly)

| event | payload | emitted by |
|---|---|---|
| net:open | {id, code?} | net |
| net:peerJoin / net:peerLeave | {id, meta?} | net |
| net:msg | {from, msg} | net |
| net:error | {code, message} | net |
| net:hostLost | {} | net |
| game:phase | {phase} | game |
| game:lobby | {players, settings, mode, mapId, code, hostId, meId} | game (any lobby change) |
| game:start | {role, teamMates:[ids], mode, mapId} | game (private reveal) |
| game:kill | {victimId, x, y, youVictim, youKiller} | game |
| game:bodyReported | {} | game |
| game:meeting | {stage, endsAt, reporter, bodyOf, votes, canVote, myVote} | game (each stage) |
| game:voteUpdate | {votes} | game |
| game:eject | {playerId, name, color, roleRevealed|null, tie, skipped, remainingImps|null} | game |
| game:end | {winnerTeam:'crew'|'impostor'|'jester'|'player'|'infected', winnerName?, winnerIds:[], reason, stats:[{id,name,color,role,tasksDone,kills}]} | game |
| game:sab | {kind|null, endsAt|null, fixed?} | game |
| game:doors | {roomId, closed} | game |
| game:panel | {open, kind:'task'|'device'|'sab', taskId?, spotId?, device?, data?, step?, steps?} | game |
| game:tasks | {tasks, taskbar} | game |
| game:chat | {from, name, color, text, ghost, lobby} | game |
| game:toast | {text, kind:'info'|'warn'} | game |
| game:countdown | {n} | game (3..2..1 + start) |
| ui:screen | {screen} | ui (informational) |

Music ownership: **game** calls AL.audio.playMusic at phase changes (menu/lobby handled by ui).
SFX: emitter closest to the cause plays it (game for world events incl. positional-ish volume by
distance to me; hud/ui for interface).

## 15. index.html (already written — for reference)

Minimal: `<canvas id="game-canvas">`, `<div id="ui-root">`, PeerJS CDN script (with fallback),
then all js files in §0 order. main.js calls: engine.init, render.init, ui.init, hud.init, then
ui shows menu; rAF loop: `AL.render.draw(AL.game.getFrame()); AL.hud.update(AL.game.getHud())`
— hud must expose `AL.hud.update(hud)` (cheap; DOM writes only on change).

## 16. Quality bar

Every module: no runtime errors on load (files are also `node --check`ed), defensive against
missing optional data, cleans up listeners/intervals on teardown, and FEELS finished — easing,
sound on interactions, empty-state text, hover states. This should read like a shipped indie game
with production values, not a demo.
