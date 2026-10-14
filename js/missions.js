'use strict';
// ---------------------------------------------------------------------------
// Townsfolk and missions.
// ---------------------------------------------------------------------------

const NPC_DEFS = [
  { name: 'Hugh', look: LOOKS.hugh, ...tp(32, 33), wander: 50, lines: ['Ducks are so majestic, Jimmy. Just look at their little feet!', 'Pie! Did somebody say pie?', "Son, that's a mighty fine gizmo you've got there.", 'Your mother says no more rockets in the living room.'], idle: ['Quack!', 'Mmm, pie...'] },
  { name: 'Judy', look: LOOKS.judy, ...tp(38, 32), wander: 40, lines: ['James Isaac Neutron! Be home before dinner.', 'Did you remember to wear your jacket, sweetie?', 'Goddard, keep an eye on him for me.'] },
  { name: 'Carl', look: LOOKS.carl, ...tp(36, 46), wander: 60, lines: ['Llamas are so neat.', "I'm allergic to that. And that. And probably this.", 'Can we go home now, Jim?', 'My mom says adventure is bad for my asthma.'], idle: ['Llamas...', '*sniffle*'] },
  { name: 'Sheen', look: LOOKS.sheen, ...tp(48, 46), wander: 70, lines: ['ULTRA LORD! ...sorry, reflex.', 'Did you know Ultra Lord can punch through the space-time continuum?', "I'm not a nerd, I'm a superhero in training!", 'Jimmy, I need a jetpack. For science.'], idle: ['ULTRA LORD!', 'Hi-yah!'] },
  { name: 'Cindy', look: LOOKS.cindy, ...tp(69, 32), wander: 60, lines: ['Oh look, it\'s Nerd-tron.', "I could've invented that. Probably better.", 'Whatever, Neutron.', 'Bet you can\'t beat my time.'] },
  { name: 'Libby', look: LOOKS.libby, ...tp(82, 32), wander: 60, lines: ['Hey Jimmy! Have you heard the new Pop Pop Fizz single?', 'Cindy is SO into you. Don\'t tell her I said that.', 'You got any Purple Flurp?'], idle: ['♪ la la la ♪'] },
  { name: 'Sam', look: LOOKS.sam, ...tp(74, 46), wander: 30, lines: ['Welcome to the Candy Bar! Purple Flurp is 10 neutronium, kid.', 'No running near the jukebox.', 'You break it, you bought it.'] },
  { name: 'Ms. Fowl', look: LOOKS.fowl, ...tp(45, 64), wander: 50, lines: ['Settle down, class! ...oh, it\'s just you, James.', 'Did you know the Earth is 70% water? Bawk!', 'Homework is due Monday, no exceptions.'] },
  { name: 'Butch', look: LOOKS.butch, ...tp(7, 33), wander: 60, lines: ['What are you lookin\' at, Neutron?', 'Hand over your lunch money, nerd.', 'Heh heh. Nerd.'] },
  { name: 'Nick', look: LOOKS.nick, ...tp(17, 33), wander: 60, lines: ['Hey. *chews gum coolly*', 'Nice hair, Neutron. Very... tall.', 'I don\'t run. I stroll.'] },
  { name: 'Mayor', look: LOOKS.mayor, ...tp(77, 64), wander: 60, lines: ['Retroville thanks you, young Neutron!', 'Please, no more alien invasions this week. My schedule is full.', 'Vote for me!'] },
];

const CITIZEN_LOOK_PARTS = {
  skin: ['#f6c89f', '#e9b48a', '#c88a5a', '#7a4a2a', '#f0d0b8'],
  hair: ['#1a1a1a', '#6b3a1e', '#e0c050', '#a03a2a', '#8a8a8a', '#3a2a1a'],
  hairStyle: ['short', 'curly', 'ponytail', 'buzz', 'bun', 'swoop', 'bald'],
  shirt: ['#e2312f', '#3fa7ff', '#4fc06a', '#ffb23f', '#b34fd8', '#ff7aa8', '#4a4a6a', '#ffffff'],
  pants: ['#3a5fcd', '#3a3a4a', '#7a5a3a', '#5a6a3a', '#2b3a7a'],
};
const CITIZEN_SPOTS = [[30, 48], [56, 22], [62, 35], [92, 48], [97, 30], [70, 66], [88, 66], [66, 68], [82, 76], [40, 78], [27, 60], [138, 40], [132, 46], [135, 60], [140, 90], [72, 88], [86, 86], [12, 50], [100, 80], [120, 22]];
const CITIZEN_LINES = ['Nice day in Retroville, huh?', 'Is that the Neutron kid? Uh oh.', 'Did you see the lights in the sky last night?', 'My cat got shrunk last week. Long story.', 'I just want ONE week without an alien invasion.', 'Have you tried the Purple Flurp at the Candy Bar?', 'Retroland has a new coaster!', 'Keep that robot dog away from my petunias.'];

function makeCitizens() {
  const rng = mulberry32(7);
  const pickR = (a) => a[Math.floor(rng() * a.length)];
  return CITIZEN_SPOTS.map(([x, y]) => new NPC({
    name: 'Citizen', citizen: true, ...tp(x, y), wander: 120, speed: 35, lines: CITIZEN_LINES,
    look: { skin: pickR(CITIZEN_LOOK_PARTS.skin), hair: pickR(CITIZEN_LOOK_PARTS.hair), hairStyle: pickR(CITIZEN_LOOK_PARTS.hairStyle), shirt: pickR(CITIZEN_LOOK_PARTS.shirt), pants: pickR(CITIZEN_LOOK_PARTS.pants), height: 1 + rng() * 0.45, wide: 1 + rng() * 0.3 },
  }));
}

// Step types: goto, map, station, talk, kill, collect, boss, race
const MISSION_DEFS = [
  {
    id: 'tutorial', title: 'Welcome Back, Boy Genius', giver: null, reward: 50,
    intro: 'Goddard is beeping urgently. Something is up in Retroville. Head to your clubhouse lab and check in with VOX.',
    steps: [
      { type: 'goto', ...tp(45, 31), r: 50, text: 'Walk to your clubhouse (WASD to move)' },
      { type: 'map', map: 'lab', text: 'Press E at the clubhouse door to enter the lab' },
      { type: 'station', station: 'vox', text: 'Press E at the VOX computer' },
    ],
    outro: 'VOX: "Greetings, Jimmy. Multiple anomalies detected across Retroville. Your friends need help too. Check the mission board any time, and use the Workbench to upgrade your gear with neutronium."',
  },
  {
    id: 'twonky', title: 'Twonky Trouble', giver: 'Sheen', reward: 150, requires: ['tutorial'],
    offer: 'Jimmy! I brought a Twonky to Retroland and played the Ultra Lord theme. Now there are TEN of them and they are eating the cotton candy machine!',
    steps: [
      { type: 'kill', target: 'twonky', count: 10, spawn: [{ type: 'twonky', ...tp(138, 80), n: 10, spread: 220 }], text: 'Defeat the Twonkies at Retroland', marker: tp(138, 80) },
      { type: 'talk', npc: 'Sheen', text: 'Report back to Sheen', say: 'You did it! Retroland is safe! Ultra Lord would be proud. ...Of me, for calling you.' },
    ],
  },
  {
    id: 'llamas', title: 'Llama Drama', giver: 'Carl', reward: 120, requires: ['tutorial'],
    offer: 'Jim! My llamas got out of their pen and wandered all over town. There are four of them. Can you bring them home? Please? Their names are Lucy, Lloyd, Larry and Llloyd.',
    steps: [
      { type: 'collect', kind: 'llama', items: [tp(11, 9), tp(46, 16), tp(19, 72), tp(89, 104)], text: "Round up Carl's lost llamas" },
      { type: 'talk', npc: 'Carl', text: 'Return to Carl', say: 'My babies! Thank you, Jim! *sniffle* I think I\'m allergic, but I don\'t care!' },
    ],
  },
  {
    id: 'ducks', title: 'Duck Duck Hugh', giver: 'Hugh', reward: 100, requires: ['tutorial'],
    offer: 'Jimmy! My prize collection of rubber ducks floated off around the park pond. Five of them! Your mother says I\'m not allowed in the pond again.',
    steps: [
      { type: 'collect', kind: 'duck', items: [tp(68, 96), tp(88, 96), tp(78, 88), tp(78, 104), tp(70, 102)], text: "Find Dad's rubber ducks at Retroville Park" },
      { type: 'talk', npc: 'Hugh', text: 'Bring the ducks back to Dad', say: 'Oh, my precious little ducks! Jimmy, you\'re the best son a duck enthusiast could ask for!' },
    ],
  },
  {
    id: 'flurp', title: 'Purple Flurp Run', giver: 'Libby', reward: 90, requires: ['tutorial'],
    offer: 'Jimmy, I need a Purple Flurp from the Candy Bar for band practice. Sam says the nanobots got loose in there again though...',
    steps: [
      { type: 'collect', kind: 'flurp', items: [tp(71, 46)], spawn: [{ type: 'nanobot', ...tp(71, 47), n: 8, spread: 120 }], text: 'Grab a Purple Flurp at the Candy Bar' },
      { type: 'talk', npc: 'Libby', text: 'Deliver the Flurp to Libby', say: 'Mmm, purple! You\'re a lifesaver, Jimmy. Don\'t tell Cindy I said that.' },
    ],
  },
  {
    id: 'race', title: "Cindy's Challenge", giver: 'Cindy', reward: 200, requires: ['tutorial'],
    offer: 'Bet your little gadgets can\'t beat me around town. Hit every checkpoint and get back here in 70 seconds. Use whatever nerd-mobile you want.',
    steps: [
      { type: 'race', time: 70, checkpoints: [tp(60, 20), tp(95, 20), tp(95, 50), tp(125, 50), tp(125, 80), tp(95, 80), tp(60, 80), tp(60, 50), tp(69, 34)], text: 'Hit every checkpoint before time runs out!' },
      { type: 'talk', npc: 'Cindy', text: 'Gloat to Cindy', say: 'Okay, fine. That was... adequate. Don\'t let it go to your giant head, Neutron.' },
    ],
  },
  {
    id: 'parts', title: 'Science Fair Salvage', giver: 'Ms. Fowl', reward: 150, requires: ['tutorial'],
    offer: 'James, the science fair is tomorrow and the school\'s reactor kit is missing three parts. Someone saw them at the Retroville Dump. Bawk! Watch out for those scrap robots.',
    steps: [
      { type: 'collect', kind: 'part', items: [tp(70, 5), tp(88, 12), tp(67, 14)], spawn: [{ type: 'robot', ...tp(78, 9), n: 4, spread: 200 }], text: 'Salvage reactor parts from the Dump' },
      { type: 'talk', npc: 'Ms. Fowl', text: 'Return the parts to Ms. Fowl', say: 'Splendid! An A-plus for you, James. Now don\'t let it go to your head. Bawk!' },
    ],
  },
  {
    id: 'nanobots', title: 'Nanobot Meltdown', giver: 'VOX', reward: 200, requires: ['tutorial'],
    offer: 'VOX: "Alert. Your nanobot swarm escaped containment and is reprogramming the school vending machines. Recommend immediate extermination."',
    steps: [
      { type: 'kill', target: 'nanobot', count: 25, spawn: [{ type: 'nanobot', ...tp(41, 71), n: 25, spread: 200 }], text: 'Destroy the nanobot swarm at Lindbergh Elementary', marker: tp(41, 71) },
    ],
    outro: 'VOX: "Swarm neutralized. The vending machines are back to dispensing regular snacks."',
  },
  {
    id: 'ultralord', title: 'The Ultra Lord Heist', giver: 'Sheen', reward: 250, requires: ['twonky'],
    offer: 'BUTCH TOOK MY LIMITED EDITION ULTRA LORD! The one with the real kung-fu grip! Jimmy, you have to get it back!',
    steps: [
      { type: 'talk', npc: 'Butch', text: 'Confront Butch in West Retroville', say: 'The action figure? Heh. I gave it to my new Bully-Bot. It\'s at the Dump. Good luck, nerd.' },
      { type: 'boss', spawn: { type: 'ultrabot', ...tp(78, 9) }, text: "Defeat Butch's Bully-Bot at the Dump" },
      { type: 'collect', kind: 'figure', items: [tp(78, 11)], text: 'Grab the Ultra Lord figure' },
      { type: 'talk', npc: 'Sheen', text: 'Return Ultra Lord to Sheen', say: 'ULTRA LORD! You\'re home! *sobs* Jimmy, you are my Ultra Lord now.' },
    ],
  },
  {
    id: 'calamitous', title: 'Calamitous Comeback', giver: 'VOX', reward: 400, requires: ['nanobots'],
    offer: 'VOX: "Professor Finbarr Calamitous has reactivated his factory in the Warehouse District. Robot production is at 300% and climbing."',
    steps: [
      { type: 'kill', target: 'robot', count: 6, spawn: [{ type: 'robot', ...tp(36, 95), n: 6, spread: 170 }], text: 'Smash the Calamitous Bots in the Warehouse District', marker: tp(36, 95) },
      { type: 'boss', spawn: { type: 'megabot', ...tp(9, 94) }, text: 'Defeat the Calamitous Mega-Bot!' },
    ],
    outro: 'Calamitous (over a loudspeaker): "Curse you, Neutron! I never finish anyth—" *static*',
  },
  {
    id: 'yokians', title: 'Attack of the Yokians', giver: 'VOX', reward: 800, requires: ['calamitous', 'twonky'],
    offer: 'VOX: "Warning! Yokian warships detected over the crash site. King Goobot is back, and he wants revenge. This is it, Jimmy."',
    steps: [
      { type: 'kill', target: 'saucer', count: 3, spawn: [{ type: 'saucer', ...tp(128, 12), n: 1 }, { type: 'saucer', ...tp(140, 14), n: 1 }, { type: 'saucer', ...tp(146, 6), n: 1 }], text: 'Shoot down 3 Yokian saucers at the crash site', marker: tp(137, 12) },
      { type: 'boss', spawn: { type: 'goobot', ...tp(137, 12) }, text: 'Defeat King Goobot!' },
      { type: 'talk', npc: 'Mayor', text: 'Report to the Mayor at Town Hall', say: 'Jimmy Neutron, you have saved Retroville once again! I hereby give you the key to the city. Please try not to shrink it.' },
    ],
    outro: 'RETROVILLE IS SAVED! Every story mission is done, but the sandbox stays open. Keep exploring, keep inventing, keep blasting.',
  },
];

const Missions = {
  defs: MISSION_DEFS,
  active: null,
  completed: new Set(),

  def(id) { return this.defs.find((d) => d.id === id); },
  isAvailable(d) { return !this.completed.has(d.id) && (d.requires || []).every((r) => this.completed.has(r)); },
  available() { return this.defs.filter((d) => this.isAvailable(d)); },
  availableFrom(giver) { return this.available().filter((d) => d.giver === giver); },
  step() { return this.active ? this.active.def.steps[this.active.stepIndex] : null; },

  npcMarker(name) {
    const s = this.step();
    if (s && s.type === 'talk' && s.npc === name) return '?';
    if (!this.active && this.availableFrom(name).length) return '!';
    return null;
  },

  start(def) {
    if (this.active) return;
    this.active = { def, stepIndex: -1 };
    Sfx.play('ui');
    UI.banner(def.title, 'MISSION STARTED');
    this.nextStep();
  },

  nextStep() {
    const a = this.active;
    a.stepIndex++;
    if (a.stepIndex >= a.def.steps.length) return this.complete();
    const s = this.step();
    a.progress = 0;
    const town = G.maps.town;
    if (Array.isArray(s.spawn)) for (const sp of s.spawn) for (let i = 0; i < (sp.n || 1); i++) {
      const ang = Math.random() * Math.PI * 2, r = Math.random() * (sp.spread || 0);
      const p = town.findOpen(sp.x + Math.cos(ang) * r, sp.y + Math.sin(ang) * r, ENEMY_TYPES[sp.type].r, ENEMY_TYPES[sp.type].fly ? 'fly' : 'walk');
      town.entities.push(new Enemy(sp.type, p.x, p.y, a.def.id));
    }
    if (s.type === 'collect') {
      a.items = s.items.map((it) => { const p = town.findOpen(it.x, it.y, 10); const e = new MissionItem(s.kind, p.x, p.y, a.def.id); town.entities.push(e); return e; });
    }
    if (s.type === 'boss') {
      const p = town.findOpen(s.spawn.x, s.spawn.y, ENEMY_TYPES[s.spawn.type].r, ENEMY_TYPES[s.spawn.type].fly ? 'fly' : 'walk');
      a.boss = new Enemy(s.spawn.type, p.x, p.y, a.def.id);
      town.entities.push(a.boss);
      G.toast(`${a.boss.def.name} has appeared!`);
    }
    if (s.type === 'race') { a.cp = 0; a.timer = s.time; G.toast(`GO! ${s.time} seconds on the clock.`); }
    if (s.type === 'map' && G.map.name === s.map) this.nextStep();
  },

  complete() {
    const d = this.active.def;
    this.completed.add(d.id);
    this.active = null;
    G.neutronium += d.reward;
    Sfx.play('mission');
    UI.banner(d.title, `MISSION COMPLETE  +${d.reward} NEUTRONIUM`);
    if (d.outro) setTimeout(() => UI.dialogue({ name: d.id === 'yokians' ? 'THE END?' : d.title, text: d.outro, buttons: [{ label: 'Continue' }] }), 900);
    G.save();
  },

  abandon() {
    if (!this.active) return;
    const id = this.active.def.id;
    for (const e of G.maps.town.entities) if (e.missionId === id) e.dead = true;
    this.active = null;
    G.toast('Mission abandoned. You can start it again from the same person.');
  },

  fail(reason) {
    const title = this.active.def.title;
    this.abandon();
    Sfx.play('error');
    UI.banner(title, 'MISSION FAILED: ' + reason);
  },

  onKill(type, e) {
    const s = this.step(); if (!s) return;
    if (s.type === 'kill' && (s.target === type || s.target === 'any')) {
      this.active.progress++;
      if (this.active.progress >= s.count) this.nextStep();
    }
    if (s.type === 'boss' && e === this.active.boss) this.nextStep();
  },
  onCollect(kind) {
    const s = this.step(); if (!s || s.type !== 'collect' || s.kind !== kind) return;
    this.active.progress++;
    G.toast(`${kind === 'llama' ? 'Llama' : kind === 'duck' ? 'Rubber duck' : kind === 'part' ? 'Reactor part' : kind === 'flurp' ? 'Purple Flurp' : 'Ultra Lord'} collected! (${this.active.progress}/${s.items.length})`);
    if (this.active.progress >= s.items.length) this.nextStep();
  },
  onTalk(name) {
    const s = this.step();
    if (!s || s.type !== 'talk' || s.npc !== name) return false;
    UI.dialogue({ name, text: s.say, buttons: [{ label: 'Continue' }] });
    this.nextStep();
    return true;
  },
  onStation(id) {
    const s = this.step();
    if (s && s.type === 'station' && s.station === id) { this.nextStep(); return true; }
    return false;
  },
  onMapChange(name) {
    const s = this.step();
    if (s && s.type === 'map' && s.map === name) this.nextStep();
  },

  update(dt) {
    const s = this.step(); if (!s) return;
    const p = G.player, a = this.active;
    if (s.type === 'goto' && G.map.name === 'town' && distXY(p.x, p.y, s.x, s.y) < s.r) this.nextStep();
    if (s.type === 'race') {
      a.timer -= dt;
      const cp = s.checkpoints[a.cp];
      if (G.map.name === 'town' && distXY(p.x, p.y, cp.x, cp.y) < 80) {
        a.cp++; Sfx.play('pickup');
        if (a.cp >= s.checkpoints.length) { G.toast(`Finished with ${a.timer.toFixed(1)}s to spare!`); this.nextStep(); return; }
      }
      if (a.timer <= 0) this.fail('Too slow! Talk to Cindy to try again.');
    }
  },

  // Where the current objective is (for the arrow and the minimap)
  marker() {
    const s = this.step(); if (!s) return null;
    const a = this.active, town = G.maps.town;
    const p = G.player;
    switch (s.type) {
      case 'goto': return { x: s.x, y: s.y, map: 'town' };
      case 'map': return { ...tp(45, 30), map: 'town' };
      case 'station': { const st = G.maps.lab.stations.find((x) => x.id === s.station); return { x: (st.x + st.w / 2) * TILE, y: (st.y + st.h + 0.5) * TILE, map: 'lab' }; }
      case 'talk': { const n = town.entities.find((e) => e instanceof NPC && e.name === s.npc); return n ? { x: n.x, y: n.y, map: 'town' } : null; }
      case 'kill': {
        const list = town.entities.filter((e) => e instanceof Enemy && !e.dead && e.type === s.target);
        const n = nearest(p, list);
        return n ? { x: n.x, y: n.y, map: 'town' } : (s.marker ? { ...s.marker, map: 'town' } : null);
      }
      case 'collect': { const n = nearest(p, a.items.filter((e) => !e.dead)); return n ? { x: n.x, y: n.y, map: 'town' } : null; }
      case 'boss': return a.boss && !a.boss.dead ? { x: a.boss.x, y: a.boss.y, map: 'town' } : null;
      case 'race': { const c = s.checkpoints[a.cp]; return c ? { x: c.x, y: c.y, map: 'town' } : null; }
    }
    return null;
  },

  stepText() {
    const s = this.step(); if (!s) return '';
    const a = this.active;
    if (s.type === 'kill') return `${s.text} (${a.progress}/${s.count})`;
    if (s.type === 'collect') return `${s.text} (${a.progress}/${s.items.length})`;
    if (s.type === 'race') return `${s.text} Checkpoint ${a.cp + 1}/${s.checkpoints.length}  ${Math.max(0, a.timer).toFixed(1)}s`;
    if (G.map.name === 'lab' && this.marker() && this.marker().map === 'town' && s.type !== 'map') return s.text + ' (leave the lab first)';
    return s.text;
  },

  serialize() { return [...this.completed]; },
  restore(list) { this.completed = new Set(list || []); },
};
