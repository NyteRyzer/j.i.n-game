'use strict';
// ---------------------------------------------------------------------------
// Game state, input, main loop.
// ---------------------------------------------------------------------------

const G = {
  maps: {}, map: null, player: null, goddard: null,
  time: 0, dayTime: 0.1,
  neutronium: 0, upgrades: {}, stats: { kills: 0 },
  shake: 0, hurtFlash: 0, zoneName: '', zoneT: 0,
  currentInteract: null, started: false, spawnT: 8, saveT: 30, godMode: false,
  W: 0, H: 0, dpr: 1,
};

const HOME = {
  hovercar: { ...tp(35.5, 33), angle: -Math.PI / 2 },
  rocket: { ...tp(53.5, 27.5), angle: -Math.PI / 2 },
};

const DOOR_LINES = {
  'Neutron House': ['Mom: "Jimmy, wipe your feet!"', 'The house smells like pie. Dad must be baking again.'],
  "Carl's House": ['Carl\'s mom: "Carl is resting his sinuses right now."'],
  "Sheen's House": ['You hear the Ultra Lord theme song blasting from inside.'],
  "Cindy's House": ['A sign on the door: "NO NERDS. THAT MEANS YOU, NEUTRON."'],
  "Libby's House": ['Pop Pop Fizz is playing at full volume.'],
  "Butch's House": ['You decide knocking here would be a bad idea.'],
  "Nick's House": ['Nobody answers. Too cool for doors, apparently.'],
  "Ms. Fowl's House": ['You hear clucking. You decide not to ask.'],
  'Lindbergh Elementary': ['School is out. Thank goodness.'],
  'Retroville Town Hall': ['The Mayor is out shaking hands. Probably near the fountain.'],
  'Retro Cinema': ['Now showing: "Ultra Lord vs. the Flaming Mailbox". Sheen has seen it 14 times.'],
  'Retroville Library': ['The librarian shushes you through the door.'],
  'Retroville Mall': ['The mall is packed. Maybe come back without a robot dog.'],
  'Retroville Observatory': ['The big telescope is pointed at... a suspicious green blip near the crash site.'],
  'Bumper Cars': ['Closed for repairs after the Twonky incident.'],
  'Snack Shack': ['Corn dogs: sold out. Cotton candy: eaten by Twonkies.'],
  'Calamitous Industries': ['The door is locked with a half-finished lock. Classic Calamitous.'],
};

// ---------------------------------------------------------------------------
// Input
// ---------------------------------------------------------------------------
const Input = {
  keys: new Set(), mouse: { x: 0, y: 0 }, mouseDown: false, firePressed: false, worldMouse: { x: 0, y: 0 }, aim: 0,
  usingPad: false,
  get up() { return this.keys.has('w') || this.keys.has('arrowup') || Pad.my < -0.4; },
  get down() { return this.keys.has('s') || this.keys.has('arrowdown') || Pad.my > 0.4; },
  get left() { return this.keys.has('a') || this.keys.has('arrowleft') || Pad.mx < -0.4; },
  get right() { return this.keys.has('d') || this.keys.has('arrowright') || Pad.mx > 0.4; },
  get sprint() { return this.keys.has('shift') || Pad.sprint; },
  get fire() { return this.mouseDown || this.keys.has(' ') || Pad.fire; },
  clearMouse() { this.mouseDown = false; this.firePressed = false; },
};
G.input = Input;
// Movement keys -> world-space direction. In chase view it's relative to the camera.
function moveVector() {
  let ix = (Input.right ? 1 : 0) - (Input.left ? 1 : 0), iy = (Input.down ? 1 : 0) - (Input.up ? 1 : 0);
  if (Pad.mx || Pad.my) { ix = Pad.mx; iy = Pad.my; } // analog stick
  if (R3.cam.mode === 'chase' && (ix || iy)) {
    const yaw = R3.cam.yaw, f = -iy, sd = ix;
    return { mx: Math.cos(yaw) * f + Math.cos(yaw + Math.PI / 2) * sd, my: Math.sin(yaw) * f + Math.sin(yaw + Math.PI / 2) * sd };
  }
  return { mx: ix, my: iy };
}
function inputSnapshot() {
  const mv = moveVector();
  Input.mx = mv.mx; Input.my = mv.my;
  return { up: Input.up, down: Input.down, left: Input.left, right: Input.right, mx: mv.mx, my: mv.my, sprint: Input.sprint, fire: Input.fire, aim: Input.aim, worldMouse: Input.worldMouse };
}

// Controller buttons (see Pad in settings.js)
function padAction(a) {
  const p = G.player, n = INVENTIONS.length;
  Input.usingPad = true;
  switch (a) {
    case 'e': doInteract(); break;
    case 'g': cycleGoddard(); break;
    case 'v': toggleBike(); break;
    case 'q': UI.questLog(); break;
    case 'm': UI.bigMap(); break;
    case 'c': toggleCamera(); break;
    case 'escape': UI.pause(); break;
    case 'prev': case 'next': if (!p.vehicle) { p.invIndex = (p.invIndex + (a === 'next' ? 1 : -1) + n) % n; Sfx.play('ui'); } break;
    case 'burp': case 'jet': {
      if (p.vehicle) break;
      const keep = p.invIndex;
      p.invIndex = INVENTIONS.findIndex((i) => i.id === (a === 'burp' ? 'burp' : 'jetpack'));
      Input.firePressed = true; useInvention(p, Input.aim, Input.worldMouse); Input.firePressed = false;
      p.invIndex = keep;
      break;
    }
  }
}

// Third-person view captures the mouse so moving it turns the camera.
function lockPointer() {
  if (R3.cam.mode !== 'chase' || !G.started || UI.isOpen() || G.noPointerLock || document.pointerLockElement === canvas) return;
  try { const r = canvas.requestPointerLock(); if (r && r.catch) r.catch(() => pointerLockFailed()); } catch (err) { pointerLockFailed(); }
}
function pointerLockFailed() {
  if (G.noPointerLock) return;
  G.noPointerLock = true;
  G.toast('Mouse capture is blocked here. Hold the right mouse button and move the mouse to look around.');
}

function toggleFullscreen() {
  if (window.desktopApp) return window.desktopApp.toggleFullscreen();
  try {
    if (document.fullscreenElement) document.exitFullscreen();
    else document.documentElement.requestFullscreen().catch(() => {});
  } catch (e) { /* fullscreen unavailable */ }
}

function onKeyDown(e) {
  const k = e.key.toLowerCase();
  if (k === 'f11') { e.preventDefault(); toggleFullscreen(); return; }
  if (k === 'f3') { e.preventDefault(); Settings.data.showFps = !Settings.data.showFps; Settings.save(); return; }
  Input.usingPad = false;
  if (!G.started) { if (k === 'enter') startGame(!!Store.load()); return; }
  if ([' ', 'arrowup', 'arrowdown', 'arrowleft', 'arrowright', 'tab'].includes(k)) e.preventDefault();
  if (UI.isOpen()) {
    if (k === 'escape' || (k === 'm' && document.getElementById('bigmap')) || k === 'q' && UI.modal.el.querySelector('.dlg-name')?.textContent === 'Mission Log') UI.close();
    return;
  }
  if (e.repeat && !['w', 'a', 's', 'd'].includes(k)) return;
  Input.keys.add(k);
  if (k === ' ') Input.firePressed = true;
  if (k >= '1' && k <= '8') { G.player.invIndex = +k - 1; Sfx.play('ui'); }
  switch (k) {
    case 'e': doInteract(); break;
    case 'g': cycleGoddard(); break;
    case 'v': toggleBike(); break;
    case 'q': UI.questLog(); break;
    case 'm': UI.bigMap(); break;
    case 'escape': case 'p': case 'h': UI.pause(); break;
    case 'n': G.toast(Sfx.toggle() ? 'Sound muted' : 'Sound on'); break;
    case 'c': toggleCamera(); break;
    case 'z': R3.cam.zoom = (R3.cam.zoom + 1) % 3; break;
  }
}

function setupInput(canvas) {
  window.addEventListener('keydown', onKeyDown);
  window.addEventListener('keyup', (e) => Input.keys.delete(e.key.toLowerCase()));
  window.addEventListener('blur', () => { Input.keys.clear(); Input.clearMouse(); });
  canvas.addEventListener('mousemove', (e) => {
    Input.mouse.x = e.clientX; Input.mouse.y = e.clientY;
    Input.usingPad = false;
    if (R3.cam.mode === 'chase' && G.started && !UI.isOpen() && (document.pointerLockElement === canvas || e.buttons & 2)) {
      const sens = Settings.data.sensitivity, inv = Settings.data.invertY ? -1 : 1;
      R3.cam.yaw += e.movementX * 0.0032 * sens;
      R3.cam.pitch = clamp(R3.cam.pitch + e.movementY * 0.0025 * sens * inv, 0.08, 1.15);
      R3.cam.lastMouse = G.time;
    }
  });
  canvas.addEventListener('mousedown', (e) => {
    if (!G.started || UI.isOpen()) return;
    Sfx.init();
    // first click in third-person just grabs the mouse; it doesn't fire
    if (R3.cam.mode === 'chase' && !G.noPointerLock && document.pointerLockElement !== canvas) { lockPointer(); return; }
    if (e.button === 0) { Input.mouseDown = true; Input.firePressed = true; }
  });
  document.addEventListener('pointerlockerror', pointerLockFailed);
  document.addEventListener('pointerlockchange', () => {
    // a lock that lands after a menu opened would trap the cursor behind it
    if (document.pointerLockElement && UI.isOpen()) { document.exitPointerLock(); return; }
    if (!document.pointerLockElement && R3.cam.mode === 'chase' && G.started && !UI.isOpen()) UI.pause(); });
  window.addEventListener('mouseup', (e) => { if (e.button === 0) Input.mouseDown = false; });
  canvas.addEventListener('contextmenu', (e) => e.preventDefault());
  canvas.addEventListener('wheel', (e) => {
    if (!G.started || UI.isOpen() || G.player.vehicle) return;
    e.preventDefault();
    const n = INVENTIONS.length;
    G.player.invIndex = (G.player.invIndex + (e.deltaY > 0 ? 1 : -1) + n) % n;
  }, { passive: false });
}

// ---------------------------------------------------------------------------
// Setup
// ---------------------------------------------------------------------------
function setupWorld() {
  G.maps.town = buildTown();
  G.maps.lab = buildLab();
  const town = G.maps.town, lab = G.maps.lab;
  for (const d of NPC_DEFS) town.entities.push(new NPC(d));
  for (const c of makeCitizens()) town.entities.push(c);
  for (const k of ['hovercar', 'rocket']) town.entities.push(new Vehicle(k, HOME[k].x, HOME[k].y, HOME[k].angle));
  for (const [x, y] of [[23, 11], [26, 13], [23, 16], [27, 16]]) lab.entities.push(new Enemy('dummy', ...Object.values(tp(x, y))));
  G.player = new Player(...Object.values(tp(45, 32)));
  G.map = town;
  G.goddard = new Goddard(G.player.x - 30, G.player.y + 10);
  G.minimapImg = buildMinimap(town);
  R3.buildWorld(town, lab);
  // Some trouble already brewing around town.
  for (let i = 0; i < 10; i++) spawnEncounter(true);
}

function startGame(continueSave) {
  if (G.started) return;
  Sfx.init();
  document.getElementById('title').hidden = true;
  G.started = true;
  const save = continueSave ? Store.load() : null;
  if (save) {
    G.neutronium = save.neutronium || 0;
    G.upgrades = save.upgrades || {};
    G.stats = save.stats || { kills: 0 };
    Missions.restore(save.completed);
    Collectibles.restore(save.atoms);
    if (typeof save.dayTime === 'number') G.dayTime = save.dayTime;
  } else Store.clear();
  Collectibles.spawn(G.maps.town);
  G.player.recalcStats(); G.player.hp = G.player.maxHp; G.player.energy = G.player.maxEnergy;
  G.goddard.recalcStats(true);
  if (save && save.pos && G.maps[save.pos.map]) {
    const m = G.maps[save.pos.map], spot = m.findOpen(save.pos.x, save.pos.y, G.player.r, 'walk');
    G.changeMap(save.pos.map, spot);
  }
  R3.cam.yaw = G.player.facing = -Math.PI / 2;
  R3.update(0, true);
  if (!Missions.completed.has('tutorial')) {
    UI.dialogue({ name: 'Goddard', text: 'BARK! BARK! <i>(Translation: Jimmy, strange readings all over Retroville. Get to the lab!)</i>', buttons: [{ label: "Let's go!", action: () => Missions.start(Missions.def('tutorial')) }] });
  } else {
    const resume = save && save.activeMission && Missions.def(save.activeMission);
    if (resume && Missions.isAvailable(resume)) Missions.start(resume);
    G.toast(resume ? `Welcome back, Jimmy! Resuming "${resume.title}".` : 'Welcome back, Jimmy! Press Q for your mission log.');
  }
  lockPointer(); // no-op while the intro dialogue is up; closing it grabs the mouse
}

G.save = function () {
  if (!G.started) return;
  const p = G.player, a = Missions.active;
  Store.save({
    version: 2, neutronium: G.neutronium, upgrades: G.upgrades, completed: Missions.serialize(), stats: G.stats,
    atoms: Collectibles.serialize(), dayTime: G.dayTime,
    pos: p.vehicle ? { map: G.map.name, x: p.vehicle.x, y: p.vehicle.y } : { map: G.map.name, x: p.x, y: p.y },
    activeMission: a && !a.def.repeatable ? a.def.id : null,
  });
};
G.toast = (t) => UI.toast(t);

G.summonVehicle = function (kind) {
  const town = G.maps.town;
  for (const e of town.entities) if (e instanceof Vehicle && e.kind === kind && !e.driver) e.dead = true;
  town.entities.push(new Vehicle(kind, HOME[kind].x, HOME[kind].y, HOME[kind].angle));
};

G.changeMap = function (name, pos) {
  const p = G.player;
  if (p.jetpack) p.setJetpack(false);
  G.map = G.maps[name];
  p.x = pos.x; p.y = pos.y; p.kx = p.ky = 0; p.dash = null;
  G.goddard.x = p.x - 24; G.goddard.y = p.y + 8;
  if (G.goddard.mode === 'stay') G.goddard.mode = 'follow';
  R3.update(0, true);
  Missions.onMapChange(name);
  G.zoneName = ''; // force zone banner
};

G.onPlayerDeath = function () {
  const lost = Math.floor(G.neutronium * 0.1);
  G.neutronium -= lost;
  UI.dialogue({
    name: 'Knocked out!',
    text: `Jimmy got knocked out. Goddard drags you back to the clubhouse${lost ? ` and ${lost} neutronium spilled out of your pockets` : ''}. Your current mission is still active.`,
    buttons: [{ label: 'Gotta blast!' }],
  });
  const p = G.player;
  if (p.vehicle) exitVehicle(true);
  G.changeMap('town', tp(45, 32));
  p.dead = false; p.hp = p.maxHp; p.energy = p.maxEnergy;
  for (const e of G.maps.town.entities) if (e instanceof Enemy && !e.missionId && dist(e, p) < 500) e.dead = true;
};

// ---------------------------------------------------------------------------
// Interaction (E)
// ---------------------------------------------------------------------------
function findInteract() {
  const p = G.player, m = G.map;
  if (p.vehicle) return { label: p.vehicle.kind === 'goddardbike' ? 'Hop off Goddard' : 'Exit ' + p.vehicle.def.name, action: () => exitVehicle() };
  let best = null;
  const consider = (d, max, label, action) => { if (d < max && (!best || d < best.d)) best = { d, label, action }; };
  for (const e of m.entities) {
    if (e.dead) continue;
    if (e instanceof Vehicle && !e.driver) consider(dist(e, p), e.r + 34, 'Drive the ' + e.def.name, () => enterVehicle(e));
    if (e instanceof NPC) consider(dist(e, p), 52, e.citizen ? 'Chat' : 'Talk to ' + e.name, () => talkTo(e));
  }
  if (m.name === 'town') {
    for (const b of m.buildings) {
      if (!b.doorTile) continue;
      const dp = tp(b.doorTile.x, b.doorTile.y);
      const d = distXY(p.x, p.y, dp.x, dp.y - 8);
      if (b.kind === 'lab') consider(d, 46, "Enter Jimmy's Lab", () => G.changeMap('lab', tp(15, 16.5)));
      else if (b.kind === 'candy') consider(d, 46, 'Buy a Purple Flurp (10 neutronium)', buyFlurp);
      else consider(d, 40, 'Knock on the door', () => UI.dialogue({ name: b.name, text: pick(DOOR_LINES[b.name] || ['Nobody seems to be home.']) }));
    }
  } else if (m.name === 'lab') {
    consider(distXY(p.x, p.y, m.exit.x, m.exit.y), 50, 'Take the elevator up to the clubhouse', () => G.changeMap('town', tp(45, 31.5)));
    for (const s of m.stations) {
      const cx = clamp(p.x, s.x * TILE, (s.x + s.w) * TILE), cy = clamp(p.y, s.y * TILE, (s.y + s.h) * TILE);
      const labels = { vox: 'Use the VOX Mission Computer', upgrade: 'Upgrade gear at the Workbench', vehicles: 'Open the Vehicle Bay', heal: 'Recharge in the Neutron Pod', vault: 'Browse the Invention Vault', cloner: G.godMode ? 'Take off the Brain-Drain Helmet (God Mode off)' : 'Wear the Brain-Drain Helmet (God Mode)' };
      consider(distXY(p.x, p.y, cx, cy), 34, labels[s.id], () => useStation(s.id));
    }
  }
  return best;
}

function doInteract() {
  const it = findInteract();
  if (it) { Sfx.play('ui'); it.action(); }
}

function talkTo(npc) {
  npc.facing = angleTo(npc, G.player);
  if (Missions.onTalk(npc.name)) return;
  if (!Missions.active) {
    const offers = Missions.availableFrom(npc.name);
    if (offers.length) return UI.offerMission(offers[0], npc.name);
  }
  UI.dialogue({ name: npc.citizen ? 'Retroville Citizen' : npc.name, text: pick(npc.lines) });
}

function buyFlurp() {
  const p = G.player;
  if (G.neutronium < 10) { Sfx.play('error'); return G.toast('Sam: "No neutronium, no Flurp, kid."'); }
  G.neutronium -= 10;
  p.hp = Math.min(p.maxHp, p.hp + 50); p.energy = p.maxEnergy;
  Sfx.play('burp');
  floatText(G.map, p.x, p.y - 36, 'FLURP! +50 HP', '#c36bff', 15);
}

function useStation(id) {
  if (Missions.onStation(id)) return;
  const p = G.player;
  switch (id) {
    case 'vox': UI.missionBoard(); break;
    case 'upgrade': UI.upgrades(); break;
    case 'vehicles': UI.vehicleBay(); break;
    case 'vault': UI.vault(); break;
    case 'heal':
      p.hp = p.maxHp; p.energy = p.maxEnergy; G.goddard.hp = G.goddard.maxHp; G.goddard.offline = 0;
      Sfx.play('brainblast'); floatText(G.map, p.x, p.y - 36, 'FULLY RECHARGED', '#ff5fa2', 15); break;
    case 'cloner':
      G.godMode = !G.godMode; Sfx.play('brainblast');
      G.toast(G.godMode ? 'God Mode ON: no damage, unlimited energy. Pure sandbox!' : 'God Mode OFF.'); break;
  }
}

function cycleGoddard() {
  const g = G.goddard;
  if (g.isBike) return;
  if (g.offline > 0) return G.toast('Goddard is still rebooting.');
  const order = ['follow', 'attack', 'stay'];
  g.mode = order[(order.indexOf(g.mode) + 1) % order.length];
  if (g.mode === 'stay') g.stay = { x: g.x, y: g.y };
  g.say({ follow: 'Heel mode!', attack: 'ATTACK MODE!', stay: 'Staying put.' }[g.mode]);
  Sfx.play('bark');
}

function toggleBike() {
  const p = G.player, g = G.goddard;
  if (p.vehicle) { if (p.vehicle.kind === 'goddardbike') exitVehicle(); return; }
  if (G.map.name !== 'town') return G.toast('No room for the Goddard Bike in here.');
  if (!g.active()) return G.toast('Goddard is rebooting. Give him a moment.');
  if (dist(g, p) > 120) return G.toast('Goddard needs to be next to you. Press G to call him back.');
  g.isBike = true;
  const bike = new Vehicle('goddardbike', g.x, g.y, p.facing);
  if (g.bikeHp) bike.hp = Math.max(40, g.bikeHp);
  G.map.entities.push(bike);
  particles(G.map, g.x, g.y, 16, '#b8c0cc', 140, 4, 0.5);
  enterVehicle(bike);
}

// ---------------------------------------------------------------------------
// Random encounters
// ---------------------------------------------------------------------------
function spawnEncounter(anywhere = false) {
  const town = G.maps.town, p = G.player;
  let x, y;
  if (anywhere) { x = rand(2, town.w - 2) * TILE; y = rand(2, town.h - 2) * TILE; if (distXY(x, y, p.x, p.y) < 900) return; }
  else { const a = Math.random() * Math.PI * 2, r = rand(600, 850); x = p.x + Math.cos(a) * r; y = p.y + Math.sin(a) * r; }
  if (x < 64 || y < 64 || x > town.w * TILE - 64 || y > town.h * TILE - 64) return;
  const zone = town.zoneAt(x, y);
  if (!zone || !zone.enemies.length) return;
  if (zone.safe && Math.random() < 0.7) return;
  const type = pick(zone.enemies);
  const n = { twonky: randi(3, 5), nanobot: randi(6, 10), yokian: randi(2, 3), robot: randi(1, 2), saucer: 1 }[type];
  const mode = ENEMY_TYPES[type].fly ? 'fly' : 'walk';
  if (town.circleBlocked(x, y, 14, mode)) return;
  for (let i = 0; i < n; i++) {
    const q = town.findOpen(x + rand(-50, 50), y + rand(-50, 50), ENEMY_TYPES[type].r, mode);
    town.entities.push(new Enemy(type, q.x, q.y));
  }
}

function updateEncounters(dt) {
  const town = G.maps.town;
  if (G.map !== town) return;
  G.spawnT -= dt;
  const wild = town.entities.filter((e) => e instanceof Enemy && !e.dead && !e.missionId);
  for (const e of wild) if (dist(e, G.player) > 2200) e.dead = true;
  if (G.spawnT <= 0) {
    G.spawnT = rand(10, 18);
    if (wild.length < 28) spawnEncounter();
  }
}

// ---------------------------------------------------------------------------
// Loop
// ---------------------------------------------------------------------------
const canvas = document.getElementById('game');
const hud = document.getElementById('hud');
const hctx = hud.getContext('2d');

function resize() {
  G.dpr = Math.min(window.devicePixelRatio || 1, 1.5);
  G.W = window.innerWidth; G.H = window.innerHeight;
  R3.resize(G.W, G.H, G.dpr);
  hud.width = Math.floor(G.W * G.dpr); hud.height = Math.floor(G.H * G.dpr);
  hud.style.width = G.W + 'px'; hud.style.height = G.H + 'px';
}

function setCameraMode(mode) {
  const c = R3.cam;
  c.mode = mode;
  Settings.data.camera = mode; Settings.save();
  if (mode === 'chase') {
    c.yaw = G.player.vehicle ? G.player.vehicle.angle : G.player.facing;
    lockPointer();
  } else if (document.pointerLockElement) document.exitPointerLock();
}
function toggleCamera() {
  setCameraMode(R3.cam.mode === 'iso' ? 'chase' : 'iso');
  G.toast(R3.cam.mode === 'chase' ? 'Third-person view. Press C for the overhead view.' : 'Overhead view: aim with the mouse. Press C to go back to third-person.');
}

function update(dt) {
  G.time += dt;
  // controller right stick: aim in overhead view, look around in third-person
  if (Pad.ax || Pad.ay) {
    Input.usingPad = true;
    const sens = Settings.data.sensitivity;
    if (R3.cam.mode === 'chase') {
      R3.cam.yaw += Pad.ax * dt * 2.6 * sens;
      R3.cam.pitch = clamp(R3.cam.pitch + Pad.ay * dt * 1.6 * sens * (Settings.data.invertY ? -1 : 1), 0.08, 1.15);
      R3.cam.lastMouse = G.time;
    } else Input.padAim = Math.atan2(Pad.ay, Pad.ax);
  } else if (Input.usingPad && (Pad.mx || Pad.my) && !G.player.vehicle) Input.padAim = Math.atan2(Pad.my, Pad.mx);
  G.dayTime = (G.dayTime + dt / 360) % 1;
  G.shake = Math.max(0, G.shake - dt * 30);
  G.hurtFlash = Math.max(0, G.hurtFlash - dt);
  const m = G.map, p = G.player;

  if (R3.cam.mode === 'chase') {
    Input.aim = R3.cam.yaw;
    Input.worldMouse = { x: p.x + Math.cos(R3.cam.yaw) * 300, y: p.y + Math.sin(R3.cam.yaw) * 300 };
  } else if (Input.usingPad) {
    Input.aim = Input.padAim === undefined ? p.facing : Input.padAim;
    Input.worldMouse = { x: p.x + Math.cos(Input.aim) * 260, y: p.y + Math.sin(Input.aim) * 260 };
  } else {
    Input.worldMouse = R3.mouseWorld(Input.mouse.x, Input.mouse.y);
    Input.aim = Math.atan2(Input.worldMouse.y - p.y, Input.worldMouse.x - p.x);
  }
  const input = inputSnapshot();
  if (G.godMode) { p.energy = p.maxEnergy; p.hp = p.maxHp; }

  if (p.vehicle) p.vehicle.update(dt, m, input);
  p.update(dt, m, input);
  G.goddard.update(dt, m);
  for (const e of m.entities) if (!e.dead && !(e instanceof Vehicle && e.driver)) e.update(dt, m, input);
  // keep enemies from stacking on top of each other
  const enemies = m.entities.filter((e) => e instanceof Enemy && !e.dead && e.type !== 'dummy');
  for (let i = 0; i < enemies.length; i++) for (let j = i + 1; j < enemies.length; j++) {
    const a = enemies[i], b = enemies[j];
    const dx = b.x - a.x, dy = b.y - a.y, d = Math.hypot(dx, dy), min = (a.r * a.sizeScale() + b.r * b.sizeScale()) * 0.9;
    if (d > 0 && d < min) {
      const push = (min - d) / 2, nx = dx / d, ny = dy / d;
      if (a.moveMode === b.moveMode) { moveWithCollision(m, a, -nx * push, -ny * push); moveWithCollision(m, b, nx * push, ny * push); }
    }
  }
  for (const pr of m.projectiles) pr.update(dt, m);
  m.projectiles = m.projectiles.filter((pr) => !pr.dead);
  m.entities = m.entities.filter((e) => !e.dead);
  updatePickups(m, dt);
  updateEffects(m, dt);
  Missions.update(dt);
  updateEncounters(dt);

  const zone = m.zoneAt(p.x, p.y);
  const zn = zone ? zone.name : 'Retroville';
  if (zn !== G.zoneName) { G.zoneName = zn; G.zoneT = 2.5; }
  G.zoneT -= dt;

  G.currentInteract = findInteract();
  Input.firePressed = false;

  G.saveT -= dt;
  if (G.saveT <= 0) { G.saveT = 30; G.save(); }
}

function nightAmount() {
  // 0 at midday, 1 deep at night. dayTime 0 = 6 AM.
  const h = (G.dayTime * 24 + 6) % 24;
  if (h >= 7 && h <= 18) return 0;
  if (h > 18 && h < 21) return (h - 18) / 3;
  if (h >= 21 || h < 4) return 1;
  return 1 - (h - 4) / 3;
}

let last = performance.now();
function musicMood() {
  if (!G.started) return 'explore';
  if (G.map.name === 'lab') return 'lab';
  const p = G.player;
  let threat = 0;
  for (const e of G.map.entities) {
    if (!(e instanceof Enemy) || e.dead || e.type === 'dummy' || e.teamNow() !== 'enemy') continue;
    const d = dist(e, p);
    if (e.boss && d < 900) return 'boss';
    if (d < 420) threat++;
  }
  if (threat >= 2) return 'combat';
  return nightAmount() > 0.5 ? 'night' : 'explore';
}

function frame(now) {
  const dt = Math.min(0.05, (now - last) / 1000);
  last = now;
  G.fps = lerp(G.fps || 60, 1 / Math.max(1e-3, (now - (G.lastFrame || now - 16)) / 1000), 0.05);
  G.lastFrame = now;
  Pad.poll();
  Music.setMood(musicMood());
  Music.update();
  if (G.started && !UI.isOpen()) update(dt);
  else if (!G.started) G.time += dt;
  R3.update(dt);
  if (G.shake > 0) { R3.camera.position.x += rand(-1, 1) * G.shake * 0.012; R3.camera.position.y += rand(-1, 1) * G.shake * 0.012; }
  R3.render();
  hctx.setTransform(G.dpr, 0, 0, G.dpr, 0, 0);
  hctx.clearRect(0, 0, G.W, G.H);
  if (G.started) { R3.drawOverlays(hctx); drawHUD(hctx, G.W, G.H); }
  requestAnimationFrame(frame);
}

function boot() {
  Settings.load();
  UI.init();
  R3.init(canvas);
  R3.cam.mode = Settings.data.camera;
  Settings.apply();
  resize();
  window.addEventListener('resize', resize);
  setupWorld();
  setupInput(canvas);
  R3.update(0, true);
  const hasSave = !!Store.load();
  const cont = document.getElementById('btn-continue');
  cont.hidden = !hasSave;
  cont.addEventListener('click', () => startGame(true));
  document.getElementById('btn-new').addEventListener('click', () => {
    if (hasSave && !document.getElementById('btn-new').dataset.armed) {
      const b = document.getElementById('btn-new'); b.dataset.armed = '1'; b.textContent = 'Click again to start over';
      return;
    }
    startGame(false);
  });
  document.getElementById('btn-settings').addEventListener('click', () => { Sfx.init(); UI.settings(); });
  document.getElementById('title-controls').innerHTML = UI.controlsHtml();
  // Pause when the window loses focus, and save when it closes.
  window.addEventListener('blur', () => { if (G.started && !UI.isOpen()) UI.pause(); });
  window.addEventListener('beforeunload', () => G.save());
  document.getElementById('loading').hidden = true;
  requestAnimationFrame(frame);
}

// Let the loading screen paint (and the bundled fonts load) before the heavy world build.
const fontsReady = document.fonts && document.fonts.load
  ? Promise.race([Promise.all(['400 16px Bungee', '700 16px Fredoka', '400 16px Fredoka'].map((f) => document.fonts.load(f))), new Promise((r) => setTimeout(r, 1500))])
  : Promise.resolve();
fontsReady.catch(() => {}).then(() => setTimeout(boot, 30));
