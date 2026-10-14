'use strict';
// ---------------------------------------------------------------------------
// Everything that moves: Jimmy, Goddard, clones, townsfolk, enemies,
// vehicles, projectiles, pickups and visual effects.
// ---------------------------------------------------------------------------

let nextEntityId = 1;

class Entity {
  constructor(x, y, r) {
    this.id = nextEntityId++;
    this.x = x; this.y = y; this.r = r;
    this.dead = false;
    this.team = 'neutral';
    this.hp = 1; this.maxHp = 1;
    this.moveMode = 'walk';
    this.facing = Math.PI / 2;
    this.flash = 0; this.frozen = 0; this.shrunk = 0; this.hypno = 0; this.slow = 0;
    this.anim = Math.random() * 10;
    this.kx = 0; this.ky = 0; // knockback velocity
  }
  teamNow() { return this.team; }
  sizeScale() { return this.shrunk > 0 ? 0.45 : 1; }
  knock(ax, ay) { this.kx += ax; this.ky += ay; }
  applyKnock(m, dt) {
    if (Math.abs(this.kx) + Math.abs(this.ky) < 1) { this.kx = this.ky = 0; return; }
    moveWithCollision(m, this, this.kx * dt, this.ky * dt);
    const f = Math.pow(0.02, dt);
    this.kx *= f; this.ky *= f;
  }
}

function moveWithCollision(m, e, dx, dy) {
  const steps = Math.max(1, Math.ceil(Math.max(Math.abs(dx), Math.abs(dy)) / 6));
  const sx = dx / steps, sy = dy / steps, r = (e.colR || e.r) * e.sizeScale();
  let hit = false;
  for (let i = 0; i < steps; i++) {
    e.x += sx; if (m.circleBlocked(e.x, e.y, r, e.moveMode)) { e.x -= sx; hit = true; }
    e.y += sy; if (m.circleBlocked(e.x, e.y, r, e.moveMode)) { e.y -= sy; hit = true; }
  }
  e.x = clamp(e.x, r, m.w * TILE - r); e.y = clamp(e.y, r, m.h * TILE - r);
  return hit;
}

// ---------------------------------------------------------------------------
// Effects
// ---------------------------------------------------------------------------
function particles(m, x, y, n, color, speed = 120, size = 3, life = 0.6) {
  for (let i = 0; i < n; i++) {
    const a = Math.random() * Math.PI * 2, s = speed * (0.3 + Math.random() * 0.7);
    m.effects.push({ type: 'p', x, y, vx: Math.cos(a) * s, vy: Math.sin(a) * s, life: life * (0.6 + Math.random() * 0.6), max: life, color, size });
  }
}
function floatText(m, x, y, text, color = '#fff', size = 14) {
  m.effects.push({ type: 'text', x, y, text, color, size, life: 1.1, max: 1.1 });
}
function ring(m, x, y, radius, color, life = 0.4) {
  m.effects.push({ type: 'ring', x, y, radius, color, life, max: life });
}
function beam(m, x1, y1, x2, y2, color, life = 0.15, width = 4) {
  m.effects.push({ type: 'beam', x1, y1, x2, y2, color, life, max: life, width });
}

function updateEffects(m, dt) {
  for (const e of m.effects) {
    e.life -= dt;
    if (e.type === 'p') { e.x += e.vx * dt; e.y += e.vy * dt; e.vx *= 0.92; e.vy *= 0.92; }
    if (e.type === 'text') e.y -= 30 * dt;
  }
  m.effects = m.effects.filter((e) => e.life > 0);
}

function drawEffects(ctx, m) {
  for (const e of m.effects) {
    const t = clamp(e.life / e.max, 0, 1);
    if (e.type === 'p') { ctx.globalAlpha = t; ctx.fillStyle = e.color; ctx.fillRect(e.x - e.size / 2, e.y - e.size / 2, e.size, e.size); }
    else if (e.type === 'ring') { ctx.globalAlpha = t; ctx.strokeStyle = e.color; ctx.lineWidth = 4 * t + 1; ctx.beginPath(); ctx.arc(e.x, e.y, e.radius * (1 - t * 0.7), 0, 7); ctx.stroke(); }
    else if (e.type === 'beam') { ctx.globalAlpha = t; ctx.strokeStyle = e.color; ctx.lineWidth = e.width; ctx.beginPath(); ctx.moveTo(e.x1, e.y1); ctx.lineTo(e.x2, e.y2); ctx.stroke(); }
    else if (e.type === 'text') {
      ctx.globalAlpha = Math.min(1, t * 2);
      ctx.font = `bold ${e.size}px Bungee, Fredoka, Impact, sans-serif`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.lineWidth = 4; ctx.strokeStyle = 'rgba(0,0,0,0.7)'; ctx.strokeText(e.text, e.x, e.y); ctx.fillStyle = e.color; ctx.fillText(e.text, e.x, e.y);
    }
  }
  ctx.globalAlpha = 1;
}

// ---------------------------------------------------------------------------
// Combat helpers
// ---------------------------------------------------------------------------
function powerMult() { return 1 + 0.25 * (G.upgrades.power || 0); }

function playerTeamTargets(m) {
  const list = [];
  if (G.map === m && !G.player.dead) list.push(G.player);
  if (G.goddard && G.map === m && G.goddard.active()) list.push(G.goddard);
  for (const e of m.entities) if (!e.dead && e.teamNow() === 'player' && e !== G.player && e !== G.goddard) list.push(e);
  return list;
}
function enemyTargets(m) {
  return m.entities.filter((e) => e instanceof Enemy && !e.dead && e.teamNow() === 'enemy');
}
function nearest(from, list, maxD = Infinity) {
  let best = null, bd = maxD;
  for (const e of list) { if (e === from) continue; const d = dist(from, e); if (d < bd) { bd = d; best = e; } }
  return best;
}

function damage(target, amount, opts = {}) {
  if (!target || target.dead) return;
  if (target === G.player) {
    if (G.player.vehicle) return damage(G.player.vehicle, amount, opts);
    if (G.godMode) return;
  }
  if (target.invulnerable) return;
  if (target.boss && target.shrunk > 0) amount *= 1.6;
  if (target instanceof Vehicle) amount *= 1 - 0.15 * (G.upgrades.armor || 0);
  target.hp -= amount;
  target.flash = 0.12;
  const m = G.map;
  if (opts.knock && target.knock) {
    const a = opts.from ? angleTo(opts.from, target) : Math.random() * 7;
    const k = target.boss ? opts.knock * 0.1 : opts.knock;
    target.knock(Math.cos(a) * k, Math.sin(a) * k);
  }
  if (target instanceof Enemy) {
    floatText(m, target.x + rand(-6, 6), target.y - target.r - 10, Math.round(amount).toString(), '#ffe14f', 12);
    Sfx.play('hit');
  }
  if (target === G.player) { Sfx.play('hurt'); G.shake = Math.max(G.shake, 4); G.hurtFlash = 0.25; }
  if (target.hp <= 0) target.die ? target.die() : (target.dead = true);
}

function explosion(m, x, y, radius, dmg, team, opts = {}) {
  Sfx.play('explode');
  G.shake = Math.max(G.shake, 8);
  ring(m, x, y, radius, opts.color || '#ffb23f', 0.45);
  particles(m, x, y, 26, opts.color || '#ffb23f', 260, 5, 0.6);
  particles(m, x, y, 14, '#ff5a2a', 160, 6, 0.5);
  particles(m, x, y, 10, '#555', 90, 7, 0.9);
  if (dmg <= 0) return;
  const victims = team === 'player' ? enemyTargets(m) : playerTeamTargets(m);
  for (const e of victims) {
    const d = distXY(x, y, e.x, e.y);
    if (d < radius + e.r) {
      damage(e, dmg * (1 - (d / (radius + e.r)) * 0.5), { knock: 380, from: { x, y } });
      if (opts.slow && e.slow !== undefined) e.slow = opts.slow;
    }
  }
}

// ---------------------------------------------------------------------------
// Character art
// ---------------------------------------------------------------------------
const LOOKS = {
  jimmy: { skin: '#f6c89f', hair: '#6b3a1e', hairStyle: 'jimmy', shirt: '#e2312f', pants: '#3a5fcd', logo: true },
  carl: { skin: '#f9d6b8', hair: '#e07b2a', hairStyle: 'curly', shirt: '#4fb07a', pants: '#7a5a3a', glasses: true, wide: 1.25 },
  sheen: { skin: '#e9b48a', hair: '#1f1f2a', hairStyle: 'spiky', shirt: '#3fa7ff', pants: '#2b3a7a', height: 1.15 },
  cindy: { skin: '#f8d0b0', hair: '#f5d34a', hairStyle: 'ponytail', shirt: '#4fc06a', pants: '#e0e0f0' },
  libby: { skin: '#7a4a2a', hair: '#1a1a1a', hairStyle: 'headband', shirt: '#b34fd8', pants: '#3a2a5a' },
  hugh: { skin: '#f6c89f', hair: '#7a5a3a', hairStyle: 'short', shirt: '#e8e0c0', pants: '#5a6a3a', height: 1.4, wide: 1.2 },
  judy: { skin: '#f6c89f', hair: '#6b3a1e', hairStyle: 'beehive', shirt: '#ff7aa8', pants: '#ff7aa8', height: 1.35, dress: true },
  fowl: { skin: '#f0d0b8', hair: '#c8c8d0', hairStyle: 'bun', shirt: '#8a5ab0', pants: '#8a5ab0', glasses: true, height: 1.25, dress: true },
  sam: { skin: '#e9b48a', hair: '#3a2a1a', hairStyle: 'bald', shirt: '#ffffff', pants: '#3a3a4a', height: 1.4, wide: 1.4, apron: true },
  butch: { skin: '#f6c89f', hair: '#e0c050', hairStyle: 'buzz', shirt: '#7a3a3a', pants: '#3a3a3a', height: 1.2, wide: 1.3 },
  nick: { skin: '#f6c89f', hair: '#1a1a1a', hairStyle: 'swoop', shirt: '#2a2a3a', pants: '#5a5a7a', height: 1.15 },
  mayor: { skin: '#f6c89f', hair: '#8a8a8a', hairStyle: 'short', shirt: '#3a3a6a', pants: '#3a3a6a', height: 1.4, wide: 1.3 },
};

function drawPerson(ctx, x, y, L, facing, phase, opts = {}) {
  const s = opts.scale || 1, h = L.height || 1, w = L.wide || 1;
  ctx.save();
  ctx.translate(x, y); ctx.scale(s, s);
  if (opts.alpha !== undefined) ctx.globalAlpha = opts.alpha;
  ctx.fillStyle = 'rgba(0,0,0,0.25)'; ctx.beginPath(); ctx.ellipse(0, 1, 9 * w, 4, 0, 0, 7); ctx.fill();
  const sw = Math.sin(phase) * 3;
  // legs
  ctx.fillStyle = L.pants;
  ctx.fillRect(-5 * w, -9 + sw * 0.4, 4, 9 - sw * 0.4);
  ctx.fillRect(1 * w, -9 - sw * 0.4, 4, 9 + sw * 0.4);
  ctx.fillStyle = '#2a2a2a';
  ctx.fillRect(-5 * w - 1, -2 + sw * 0.4, 6, 3); ctx.fillRect(1 * w - 1, -2 - sw * 0.4, 6, 3);
  // torso
  const ty = -9 - 13 * h;
  ctx.fillStyle = L.shirt;
  if (L.dress) { ctx.beginPath(); ctx.moveTo(-6 * w, ty); ctx.lineTo(6 * w, ty); ctx.lineTo(9 * w, -6); ctx.lineTo(-9 * w, -6); ctx.closePath(); ctx.fill(); }
  else { roundRect(ctx, -7 * w, ty, 14 * w, 13 * h + 1, 4); ctx.fill(); }
  if (L.apron) { ctx.fillStyle = '#ffb0c8'; ctx.fillRect(-5 * w, ty + 4, 10 * w, 13 * h - 3); }
  // arms
  ctx.fillStyle = L.shirt; ctx.fillRect(-10 * w, ty + 1 - sw * 0.5, 4, 9); ctx.fillRect(6 * w, ty + 1 + sw * 0.5, 4, 9);
  ctx.fillStyle = L.skin; ctx.fillRect(-10 * w, ty + 9 - sw * 0.5, 4, 3); ctx.fillRect(6 * w, ty + 9 + sw * 0.5, 4, 3);
  if (L.logo) {
    ctx.strokeStyle = '#ffe14f'; ctx.lineWidth = 1.2;
    for (let k = 0; k < 3; k++) { ctx.beginPath(); ctx.ellipse(0, ty + 6, 4.5, 1.6, k * 1.05, 0, 7); ctx.stroke(); }
    ctx.fillStyle = '#ffe14f'; ctx.beginPath(); ctx.arc(0, ty + 6, 1.2, 0, 7); ctx.fill();
  }
  // head
  const hy = ty - 7;
  const back = Math.sin(facing) < -0.6;
  ctx.fillStyle = L.skin; ctx.beginPath(); ctx.arc(0, hy, 8, 0, 7); ctx.fill();
  // hair
  ctx.fillStyle = L.hair;
  switch (L.hairStyle) {
    case 'jimmy': {
      ctx.beginPath(); ctx.ellipse(0, hy - 9, 11, 9, 0, 0, 7); ctx.fill();
      ctx.beginPath(); ctx.arc(0, hy - 3, 8.5, Math.PI, 0); ctx.fill();
      ctx.strokeStyle = shade(L.hair, 45); ctx.lineWidth = 1.6;
      ctx.beginPath(); for (let a = 0; a < 9; a += 0.25) { const rr = 1 + a * 0.85; const px = Math.cos(a) * rr, py = hy - 10 + Math.sin(a) * rr * 0.75; a === 0 ? ctx.moveTo(px, py) : ctx.lineTo(px, py); } ctx.stroke();
      if (!back) { ctx.fillStyle = L.hair; ctx.beginPath(); ctx.moveTo(-3, hy - 6); ctx.quadraticCurveTo(2, hy - 1, 6, hy - 5); ctx.lineTo(1, hy - 8); ctx.fill(); }
      break;
    }
    case 'spiky':
      for (let k = -2; k <= 2; k++) { ctx.beginPath(); ctx.moveTo(k * 4 - 3, hy - 4); ctx.lineTo(k * 4.5, hy - 17 + Math.abs(k) * 2); ctx.lineTo(k * 4 + 3, hy - 4); ctx.fill(); }
      ctx.beginPath(); ctx.arc(0, hy - 2, 8.3, Math.PI, 0); ctx.fill(); break;
    case 'curly':
      for (let k = -2; k <= 2; k++) { ctx.beginPath(); ctx.arc(k * 3.5, hy - 7 + Math.abs(k), 4, 0, 7); ctx.fill(); } break;
    case 'ponytail':
      ctx.beginPath(); ctx.arc(0, hy - 2, 8.5, Math.PI, 0); ctx.fill();
      ctx.beginPath(); ctx.ellipse(Math.cos(facing) < 0 ? 9 : -9, hy - 2, 4, 7, 0.4, 0, 7); ctx.fill(); break;
    case 'headband':
      ctx.beginPath(); ctx.arc(0, hy - 2, 9, Math.PI, 0); ctx.fill();
      ctx.beginPath(); ctx.arc(0, hy - 8, 6, 0, 7); ctx.fill();
      ctx.fillStyle = '#ff5fa2'; ctx.fillRect(-8, hy - 5, 16, 2.5); break;
    case 'short': ctx.beginPath(); ctx.arc(0, hy - 2, 8.4, Math.PI, 0); ctx.fill(); break;
    case 'beehive': ctx.beginPath(); ctx.ellipse(0, hy - 14, 8, 14, 0, 0, 7); ctx.fill(); break;
    case 'bun': ctx.beginPath(); ctx.arc(0, hy - 2, 8.4, Math.PI, 0); ctx.fill(); ctx.beginPath(); ctx.arc(0, hy - 10, 5, 0, 7); ctx.fill(); break;
    case 'buzz': ctx.beginPath(); ctx.arc(0, hy - 3, 7.8, Math.PI, 0); ctx.fill(); break;
    case 'swoop': ctx.beginPath(); ctx.arc(0, hy - 2, 8.4, Math.PI, 0); ctx.fill(); ctx.beginPath(); ctx.ellipse(3, hy - 8, 9, 4, -0.3, 0, 7); ctx.fill(); break;
    case 'bald': ctx.fillRect(-8, hy - 2, 2, 4); ctx.fillRect(6, hy - 2, 2, 4); break;
  }
  if (!back) {
    const ex = Math.cos(facing) * 2.5, ey = Math.max(-1, Math.sin(facing) * 1.5);
    ctx.fillStyle = '#fff'; ctx.beginPath(); ctx.arc(-3 + ex, hy + 1 + ey, 2.4, 0, 7); ctx.arc(3 + ex, hy + 1 + ey, 2.4, 0, 7); ctx.fill();
    ctx.fillStyle = '#1a1a1a'; ctx.beginPath(); ctx.arc(-3 + ex * 1.3, hy + 1 + ey, 1.2, 0, 7); ctx.arc(3 + ex * 1.3, hy + 1 + ey, 1.2, 0, 7); ctx.fill();
    if (L.glasses) { ctx.strokeStyle = '#2a2a2a'; ctx.lineWidth = 1; ctx.beginPath(); ctx.arc(-3 + ex, hy + 1 + ey, 3.2, 0, 7); ctx.moveTo(6.2 + ex, hy + 1 + ey); ctx.arc(3 + ex, hy + 1 + ey, 3.2, 0, 7); ctx.stroke(); }
  }
  ctx.restore();
}

// ---------------------------------------------------------------------------
// Jimmy
// ---------------------------------------------------------------------------
class Player extends Entity {
  constructor(x, y) {
    super(x, y, 10);
    this.team = 'player';
    this.maxHp = 100; this.hp = 100;
    this.maxEnergy = 100; this.energy = 100;
    this.invIndex = 0;
    this.cds = {};
    this.vehicle = null;
    this.jetpack = false;
    this.dash = null;
    this.walkPhase = 0;
    this.moving = false;
    this.alt = 0;
  }
  recalcStats() {
    const u = G.upgrades;
    this.maxHp = 100 + 25 * (u.health || 0);
    this.maxEnergy = 100 + 25 * (u.energy || 0);
    this.hp = Math.min(this.hp, this.maxHp);
    this.energy = Math.min(this.energy, this.maxEnergy);
  }
  update(dt, m, input) {
    for (const k in this.cds) this.cds[k] = Math.max(0, this.cds[k] - dt);
    this.flash = Math.max(0, this.flash - dt);
    if (this.vehicle) { this.x = this.vehicle.x; this.y = this.vehicle.y; this.energy = Math.min(this.maxEnergy, this.energy + 10 * dt); return; }

    const regen = 14 * (1 + 0.25 * (G.upgrades.energy || 0));
    if (!this.jetpack) this.energy = Math.min(this.maxEnergy, this.energy + regen * dt);
    else {
      this.energy -= 9 * dt;
      if (Math.random() < 0.5) particles(m, this.x + rand(-4, 4), this.y + 4, 1, pick(['#ffb23f', '#ff5a2a', '#ffe14f']), 60, 4, 0.3);
      if (this.energy <= 0) { this.energy = 0; this.setJetpack(false); G.toast('Jetpack out of energy!'); }
    }
    this.alt = lerp(this.alt, this.jetpack ? 18 : 0, Math.min(1, dt * 8));

    let ix = 0, iy = 0;
    if (input.left) ix -= 1; if (input.right) ix += 1;
    if (input.up) iy -= 1; if (input.down) iy += 1;
    const len = Math.hypot(ix, iy) || 1;
    ix /= len; iy /= len;
    let speed = this.jetpack ? 270 : input.sprint ? 235 : 155;
    if (this.slow > 0) { speed *= 0.6; this.slow -= dt; }
    this.moving = ix !== 0 || iy !== 0;
    this.moveMode = this.jetpack ? 'fly' : 'walk';
    if (this.dash) {
      this.dash.t -= dt;
      moveWithCollision(m, this, this.dash.vx * dt, this.dash.vy * dt);
      if (Math.random() < 0.8) particles(m, this.x, this.y, 1, '#b8ff8a', 40, 5, 0.4);
      if (this.dash.t <= 0) this.dash = null;
    } else if (this.moving) {
      moveWithCollision(m, this, ix * speed * dt, iy * speed * dt);
      this.walkPhase += dt * (input.sprint ? 16 : 11);
    }
    this.applyKnock(m, dt);
    this.facing = input.aim;

    // Stomp shrunken enemies by walking over them
    if (!this.jetpack) for (const e of m.entities) {
      if (e instanceof Enemy && !e.dead && !e.boss && e.shrunk > 0 && e.teamNow() === 'enemy' && dist(this, e) < this.r + e.r * 0.45 + 3) {
        floatText(m, e.x, e.y - 10, 'SQUISH!', '#ff8ad8', 16); Sfx.play('squish');
        e.hp = 0; e.die();
      }
    }
    if (input.fire) useInvention(this, input.aim, input.worldMouse);
  }
  setJetpack(on) {
    const m = G.map;
    if (on) { this.jetpack = true; Sfx.play('jet'); return; }
    this.jetpack = false;
    if (m.circleBlocked(this.x, this.y, this.r, 'walk')) { const p = m.findOpen(this.x, this.y, this.r, 'walk'); this.x = p.x; this.y = p.y; }
  }
  draw(ctx) {
    if (this.vehicle) return;
    if (this.alt > 1) {
      ctx.fillStyle = 'rgba(0,0,0,0.2)'; ctx.beginPath(); ctx.ellipse(this.x, this.y + 2, 9, 4, 0, 0, 7); ctx.fill();
    }
    const y = this.y - this.alt;
    if (this.jetpack) {
      ctx.fillStyle = '#9aa6bc'; roundRect(ctx, this.x - 9, y - 22, 18, 12, 3); ctx.fill();
      ctx.fillStyle = Math.random() < 0.5 ? '#ffb23f' : '#ff5a2a';
      ctx.beginPath(); ctx.moveTo(this.x - 7, y - 10); ctx.lineTo(this.x - 4, y - 2 + rand(0, 6)); ctx.lineTo(this.x - 1, y - 10); ctx.fill();
      ctx.beginPath(); ctx.moveTo(this.x + 1, y - 10); ctx.lineTo(this.x + 4, y - 2 + rand(0, 6)); ctx.lineTo(this.x + 7, y - 10); ctx.fill();
    }
    drawPerson(ctx, this.x, y, LOOKS.jimmy, this.facing, this.moving ? this.walkPhase : 0);
    // the current invention in hand
    const inv = INVENTIONS[this.invIndex];
    const hx = this.x + Math.cos(this.facing) * 12, hy = y - 16 + Math.sin(this.facing) * 6;
    ctx.save(); ctx.translate(hx, hy); ctx.rotate(this.facing);
    ctx.fillStyle = '#5a6478'; ctx.fillRect(-2, -2.5, 12, 5);
    ctx.fillStyle = inv.color; ctx.fillRect(8, -3, 4, 6);
    ctx.restore();
    if (this.flash > 0) { ctx.globalAlpha = 0.5; ctx.fillStyle = '#fff'; ctx.beginPath(); ctx.arc(this.x, y - 16, 14, 0, 7); ctx.fill(); ctx.globalAlpha = 1; }
  }
  die() {
    this.dead = true;
    G.onPlayerDeath();
  }
}

// ---------------------------------------------------------------------------
// Goddard
// ---------------------------------------------------------------------------
class Goddard extends Entity {
  constructor(x, y) {
    super(x, y, 9);
    this.team = 'player';
    this.moveMode = 'fly';
    this.mode = 'follow';
    this.offline = 0;
    this.fireCd = 0;
    this.barkT = rand(6, 14);
    this.stay = null;
    this.bubble = null;
    this.recalcStats(true);
  }
  recalcStats(full) {
    this.maxHp = 80 + 30 * (G.upgrades.goddard || 0);
    if (full) this.hp = this.maxHp;
  }
  active() { return this.offline <= 0 && !this.isBike; }
  say(text, t = 2) { this.bubble = { text, t }; }
  update(dt, m) {
    this.flash = Math.max(0, this.flash - dt);
    if (this.bubble) { this.bubble.t -= dt; if (this.bubble.t <= 0) this.bubble = null; }
    if (this.isBike) return;
    if (this.offline > 0) {
      this.offline -= dt;
      if (this.offline <= 0) { this.hp = this.maxHp; this.say('REBOOT COMPLETE'); Sfx.play('bark'); }
      return;
    }
    this.hp = Math.min(this.maxHp, this.hp + 2 * dt);
    const p = G.player;
    if (dist(this, p) > 700) { this.x = p.x - 30; this.y = p.y + 10; }
    const range = this.mode === 'attack' ? 460 : 300;
    const target = nearest(this, enemyTargets(m), range);
    let gx, gy;
    if (this.mode === 'stay' && this.stay) { gx = this.stay.x; gy = this.stay.y; }
    else if (this.mode === 'attack' && target) {
      const a = angleTo(target, this) + Math.sin(G.time * 1.3) * 0.8;
      gx = target.x + Math.cos(a) * 110; gy = target.y + Math.sin(a) * 110;
    } else {
      const fa = p.vehicle ? p.vehicle.angle : p.facing;
      gx = p.x - Math.cos(fa) * 34 + Math.cos(G.time) * 6; gy = p.y - Math.sin(fa) * 34 + 6;
    }
    const d = distXY(this.x, this.y, gx, gy);
    if (d > 6) {
      const sp = Math.min(d * 4, p.vehicle ? 600 : 260);
      this.x += ((gx - this.x) / d) * sp * dt; this.y += ((gy - this.y) / d) * sp * dt;
      this.facing = Math.atan2(gy - this.y, gx - this.x);
      this.anim += dt * 12;
    }
    this.fireCd -= dt;
    if (target) {
      this.facing = angleTo(this, target);
      if (this.fireCd <= 0) {
        this.fireCd = 0.55;
        const a = angleTo(this, target);
        m.projectiles.push(new Projectile({ x: this.x, y: this.y - 10, vx: Math.cos(a) * 560, vy: Math.sin(a) * 560, team: 'player', dmg: 7 * (1 + 0.35 * (G.upgrades.goddard || 0)), color: '#ff4040', life: 0.7, r: 3 }));
      }
    }
    this.barkT -= dt;
    if (this.barkT <= 0) {
      this.barkT = rand(10, 22);
      if (Math.random() < 0.5) { this.say(pick(['Bark!', 'Arf arf!', '*whirr*', 'Bark bark!', '♥'])); Sfx.play('bark'); }
    }
  }
  die() {
    this.hp = 0; this.offline = 12;
    this.say('SYSTEM OFFLINE', 3);
    particles(G.map, this.x, this.y, 20, '#aab', 120, 4, 0.8);
    G.toast('Goddard is rebooting...');
  }
  draw(ctx) {
    if (this.isBike) return;
    const off = this.offline > 0;
    const bob = off ? 0 : Math.sin(G.time * 5) * 2;
    const x = this.x, y = this.y - 6 + bob;
    ctx.fillStyle = 'rgba(0,0,0,0.22)'; ctx.beginPath(); ctx.ellipse(x, this.y + 4, 11, 4, 0, 0, 7); ctx.fill();
    ctx.save(); ctx.translate(x, y);
    if (Math.cos(this.facing) < 0) ctx.scale(-1, 1);
    if (off) ctx.rotate(0.3);
    // legs
    ctx.fillStyle = '#7d8696';
    const lp = Math.sin(this.anim) * 2;
    ctx.fillRect(-8, 2 + lp, 3, 6); ctx.fillRect(4, 2 - lp, 3, 6);
    // body
    ctx.fillStyle = '#b8c0cc'; roundRect(ctx, -11, -6, 20, 11, 4); ctx.fill();
    ctx.fillStyle = '#e2312f'; ctx.fillRect(-4, -6, 3, 11);
    // tail antenna
    ctx.strokeStyle = '#7d8696'; ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(-11, -3); ctx.lineTo(-16, -10); ctx.stroke();
    ctx.fillStyle = '#ff4040'; ctx.beginPath(); ctx.arc(-16, -11, 2, 0, 7); ctx.fill();
    // head
    ctx.fillStyle = '#c8d0dc'; roundRect(ctx, 4, -15, 13, 11, 4); ctx.fill();
    ctx.fillStyle = '#3a4050'; ctx.fillRect(12, -10, 6, 4);
    ctx.fillStyle = off ? '#333' : '#3fe0ff'; ctx.beginPath(); ctx.arc(10, -11, 2, 0, 7); ctx.fill();
    // ears
    ctx.fillStyle = '#9aa6bc';
    ctx.beginPath(); ctx.moveTo(5, -14); ctx.lineTo(3, -22); ctx.lineTo(9, -15); ctx.fill();
    ctx.beginPath(); ctx.moveTo(9, -14); ctx.lineTo(9, -22); ctx.lineTo(13, -15); ctx.fill();
    ctx.restore();
    if (this.flash > 0) { ctx.globalAlpha = 0.5; ctx.fillStyle = '#fff'; ctx.beginPath(); ctx.arc(x, y - 4, 13, 0, 7); ctx.fill(); ctx.globalAlpha = 1; }
    if (this.bubble) drawBubble(ctx, x, y - 30, this.bubble.text);
  }
}

function drawBubble(ctx, x, y, text) {
  ctx.font = 'bold 12px Fredoka, sans-serif';
  const w = ctx.measureText(text).width + 14;
  ctx.fillStyle = '#ffffff'; roundRect(ctx, x - w / 2, y - 18, w, 20, 8); ctx.fill();
  ctx.beginPath(); ctx.moveTo(x - 4, y + 2); ctx.lineTo(x, y + 8); ctx.lineTo(x + 4, y + 2); ctx.fill();
  ctx.fillStyle = '#1d2140'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  ctx.fillText(text, x, y - 8);
}

// ---------------------------------------------------------------------------
// Clone-O-Matic clones
// ---------------------------------------------------------------------------
class Clone extends Entity {
  constructor(x, y) {
    super(x, y, 10);
    this.team = 'player';
    this.hp = this.maxHp = 45;
    this.life = 14;
    this.fireCd = rand(0, 0.5);
    this.goal = { x, y };
    this.retarget = 0;
    this.walkPhase = 0;
  }
  update(dt, m) {
    this.life -= dt; this.flash = Math.max(0, this.flash - dt);
    if (this.life <= 0) { particles(m, this.x, this.y, 12, '#7ff0ff', 100, 4, 0.5); this.dead = true; return; }
    const target = nearest(this, enemyTargets(m), 380);
    this.retarget -= dt;
    if (this.retarget <= 0) {
      this.retarget = rand(0.8, 1.6);
      const base = target || G.player;
      const a = Math.random() * Math.PI * 2, r = target ? 140 : 60;
      this.goal = { x: base.x + Math.cos(a) * r, y: base.y + Math.sin(a) * r };
    }
    const d = distXY(this.x, this.y, this.goal.x, this.goal.y);
    if (d > 8) { moveWithCollision(m, this, ((this.goal.x - this.x) / d) * 170 * dt, ((this.goal.y - this.y) / d) * 170 * dt); this.walkPhase += dt * 12; }
    this.applyKnock(m, dt);
    if (target) {
      this.facing = angleTo(this, target);
      this.fireCd -= dt;
      if (this.fireCd <= 0) {
        this.fireCd = 0.45;
        m.projectiles.push(new Projectile({ x: this.x, y: this.y - 14, vx: Math.cos(this.facing) * 600, vy: Math.sin(this.facing) * 600, team: 'player', dmg: 8 * powerMult(), color: '#7ff0ff', life: 0.7 }));
      }
    }
  }
  die() { this.dead = true; particles(G.map, this.x, this.y, 14, '#7ff0ff', 120, 4, 0.5); }
  draw(ctx) {
    drawPerson(ctx, this.x, this.y, LOOKS.jimmy, this.facing, this.walkPhase, { alpha: this.life < 2 ? 0.3 + 0.3 * Math.sin(G.time * 20) : 0.75 });
    ctx.fillStyle = '#7ff0ff'; ctx.font = 'bold 9px Fredoka, sans-serif'; ctx.textAlign = 'center'; ctx.fillText('CLONE', this.x, this.y - 44);
  }
}

// ---------------------------------------------------------------------------
// Townsfolk
// ---------------------------------------------------------------------------
class NPC extends Entity {
  constructor(def) {
    super(def.x, def.y, 10);
    this.name = def.name;
    this.look = def.look;
    this.lines = def.lines || ['Hi Jimmy!'];
    this.home = { x: def.x, y: def.y };
    this.wanderR = def.wander === undefined ? 70 : def.wander;
    this.invulnerable = true;
    this.goal = null;
    this.waitT = rand(0, 3);
    this.walkPhase = 0;
    this.speed = def.speed || 45;
    this.bubble = null;
    this.citizen = !!def.citizen;
    this.idleLines = def.idle || null;
  }
  say(text, t = 2.5) { this.bubble = { text, t }; }
  update(dt, m) {
    if (this.bubble) { this.bubble.t -= dt; if (this.bubble.t <= 0) this.bubble = null; }
    const p = G.player;
    if (dist(this, p) < 70 && !p.vehicle) { this.facing = angleTo(this, p); this.moving = false; return; }
    // flee from nearby enemies
    const threat = nearest(this, enemyTargets(m), 140);
    if (threat) {
      const a = angleTo(threat, this);
      moveWithCollision(m, this, Math.cos(a) * 110 * dt, Math.sin(a) * 110 * dt);
      this.walkPhase += dt * 14; this.moving = true; this.facing = a;
      if (!this.bubble && Math.random() < 0.01) this.say(pick(['Aaah!', 'Help!', 'Jimmy, do something!']));
      return;
    }
    if (this.goal) {
      const d = distXY(this.x, this.y, this.goal.x, this.goal.y);
      if (d < 4) { this.goal = null; this.waitT = rand(1.5, 5); this.moving = false; }
      else {
        const hit = moveWithCollision(m, this, ((this.goal.x - this.x) / d) * this.speed * dt, ((this.goal.y - this.y) / d) * this.speed * dt);
        this.facing = Math.atan2(this.goal.y - this.y, this.goal.x - this.x);
        this.walkPhase += dt * 9; this.moving = true;
        if (hit) { this.goal = null; this.waitT = rand(0.5, 2); }
      }
    } else {
      this.moving = false;
      this.waitT -= dt;
      if (this.waitT <= 0 && this.wanderR > 0) {
        const a = Math.random() * Math.PI * 2, r = Math.random() * this.wanderR;
        this.goal = { x: this.home.x + Math.cos(a) * r, y: this.home.y + Math.sin(a) * r };
      }
      if (this.idleLines && !this.bubble && Math.random() < dt * 0.04 && dist(this, p) < 400) this.say(pick(this.idleLines));
    }
  }
  draw(ctx) {
    drawPerson(ctx, this.x, this.y, this.look, this.facing, this.moving ? this.walkPhase : 0);
    const p = G.player;
    const top = this.y - 30 - 14 * (this.look.height || 1) - (this.look.hairStyle === 'beehive' ? 14 : 0);
    if (!this.citizen && dist(this, p) < 220) {
      ctx.font = 'bold 11px Fredoka, sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.lineWidth = 3; ctx.strokeStyle = 'rgba(0,0,0,0.6)'; ctx.strokeText(this.name, this.x, top - 4);
      ctx.fillStyle = '#fff'; ctx.fillText(this.name, this.x, top - 4);
    }
    const marker = Missions.npcMarker(this.name);
    if (marker) {
      const bob = Math.sin(G.time * 4) * 3;
      ctx.font = 'bold 22px Bungee, Fredoka, sans-serif'; ctx.textAlign = 'center';
      ctx.lineWidth = 4; ctx.strokeStyle = '#1d2140'; ctx.strokeText(marker, this.x, top - 22 + bob);
      ctx.fillStyle = marker === '!' ? '#ffe14f' : '#7aff6a'; ctx.fillText(marker, this.x, top - 22 + bob);
    }
    if (this.bubble) drawBubble(ctx, this.x, top - (marker ? 40 : 14), this.bubble.text);
  }
}

// Things that need picking up for missions (Carl's llamas, Hugh's ducks...)
class MissionItem extends Entity {
  constructor(kind, x, y, missionId) {
    super(x, y, 10);
    this.kind = kind; this.missionId = missionId;
    this.home = { x, y }; this.goal = null; this.waitT = rand(0, 2);
    this.invulnerable = true;
  }
  update(dt, m) {
    this.anim += dt;
    if (this.kind === 'llama') {
      if (this.goal) {
        const d = distXY(this.x, this.y, this.goal.x, this.goal.y);
        if (d < 4) this.goal = null;
        else if (moveWithCollision(m, this, ((this.goal.x - this.x) / d) * 40 * dt, ((this.goal.y - this.y) / d) * 40 * dt)) this.goal = null;
        if (this.goal) this.facing = Math.atan2(this.goal.y - this.y, this.goal.x - this.x);
      } else if ((this.waitT -= dt) <= 0) {
        this.waitT = rand(1, 4);
        this.goal = { x: this.home.x + rand(-60, 60), y: this.home.y + rand(-60, 60) };
      }
    }
    const p = G.player;
    if (dist(this, p) < 24 + p.r && !p.jetpack) {
      this.dead = true;
      Sfx.play('pickup');
      particles(m, this.x, this.y, 14, '#ffe14f', 120, 4, 0.5);
      Missions.onCollect(this.kind, this.missionId);
    }
  }
  draw(ctx) {
    const x = this.x, y = this.y, b = Math.sin(this.anim * 3) * 2;
    ctx.fillStyle = 'rgba(0,0,0,0.2)'; ctx.beginPath(); ctx.ellipse(x, y + 4, 10, 4, 0, 0, 7); ctx.fill();
    ctx.globalAlpha = 0.35 + 0.2 * Math.sin(this.anim * 4); ctx.fillStyle = '#ffe14f'; ctx.beginPath(); ctx.arc(x, y - 6, 18, 0, 7); ctx.fill(); ctx.globalAlpha = 1;
    if (this.kind === 'llama') {
      ctx.save(); ctx.translate(x, y); if (Math.cos(this.facing) < 0) ctx.scale(-1, 1);
      ctx.fillStyle = '#f4ecd8';
      ctx.fillRect(-9, -2, 3, 7); ctx.fillRect(5, -2, 3, 7);
      roundRect(ctx, -11, -12, 20, 11, 5); ctx.fill();
      ctx.fillRect(4, -24, 6, 14);
      roundRect(ctx, 3, -28, 11, 7, 3); ctx.fill();
      ctx.fillStyle = '#c9b89a'; ctx.fillRect(4, -32, 2, 5); ctx.fillRect(8, -32, 2, 5);
      ctx.fillStyle = '#222'; ctx.fillRect(10, -26, 2, 2);
      ctx.restore();
    } else if (this.kind === 'duck') {
      ctx.fillStyle = '#ffe14f'; ctx.beginPath(); ctx.ellipse(x, y - 4 + b, 9, 6, 0, 0, 7); ctx.fill();
      ctx.beginPath(); ctx.arc(x + 6, y - 11 + b, 5, 0, 7); ctx.fill();
      ctx.fillStyle = '#ff8a2a'; ctx.beginPath(); ctx.moveTo(x + 10, y - 12 + b); ctx.lineTo(x + 15, y - 10 + b); ctx.lineTo(x + 10, y - 9 + b); ctx.fill();
      ctx.fillStyle = '#222'; ctx.fillRect(x + 7, y - 13 + b, 2, 2);
    } else if (this.kind === 'figure') {
      ctx.fillStyle = '#3a6fd1'; roundRect(ctx, x - 6, y - 22 + b, 12, 20, 3); ctx.fill();
      ctx.fillStyle = '#e2312f'; ctx.fillRect(x - 8, y - 18 + b, 16, 4);
      ctx.fillStyle = '#ffe14f'; ctx.beginPath(); ctx.arc(x, y - 26 + b, 5, 0, 7); ctx.fill();
    } else if (this.kind === 'flurp') {
      ctx.fillStyle = '#9b4fd8'; roundRect(ctx, x - 5, y - 20 + b, 10, 18, 3); ctx.fill();
      ctx.fillStyle = '#fff'; ctx.fillRect(x - 5, y - 14 + b, 10, 4);
    } else if (this.kind === 'part') {
      ctx.strokeStyle = '#3fe0ff'; ctx.lineWidth = 3;
      ctx.beginPath(); ctx.arc(x, y - 10 + b, 7, 0, 7); ctx.stroke();
      ctx.fillStyle = '#9aa6bc'; ctx.fillRect(x - 3, y - 13 + b, 6, 6);
    }
  }
}

// ---------------------------------------------------------------------------
// Enemies
// ---------------------------------------------------------------------------
const ENEMY_TYPES = {
  twonky: { name: 'Twonky', hp: 24, speed: 88, r: 10, dmg: 7, attack: 'melee', range: 6, cd: 0.8, reward: 3, sight: 330 },
  yokian: { name: 'Yokian Soldier', hp: 42, speed: 62, r: 12, dmg: 8, attack: 'ranged', range: 250, cd: 1.5, bullet: 270, reward: 6, sight: 430 },
  saucer: { name: 'Yokian Saucer', hp: 150, speed: 95, r: 24, dmg: 7, attack: 'saucer', range: 300, cd: 2.2, bullet: 300, reward: 16, sight: 540, fly: true },
  robot: { name: 'Calamitous Bot', hp: 90, speed: 56, r: 14, dmg: 15, attack: 'melee', range: 8, cd: 1.1, reward: 8, sight: 380, charge: true },
  nanobot: { name: 'Nanobot', hp: 7, speed: 150, r: 5, dmg: 3, attack: 'melee', range: 4, cd: 0.5, reward: 1, sight: 520 },
  dummy: { name: 'Training Dummy', hp: 250, speed: 0, r: 14, attack: 'none', reward: 0, sight: 0 },
  goobot: { name: 'King Goobot', hp: 1100, speed: 75, r: 42, dmg: 9, attack: 'goobot', cd: 1, bullet: 250, reward: 220, sight: 1100, fly: true, boss: true },
  megabot: { name: 'Calamitous Mega-Bot', hp: 1300, speed: 62, r: 34, dmg: 22, attack: 'megabot', cd: 1, bullet: 230, reward: 260, sight: 1000, boss: true },
  ultrabot: { name: "Butch's Bully-Bot", hp: 420, speed: 70, r: 22, dmg: 14, attack: 'melee', range: 10, cd: 0.9, reward: 60, sight: 600, charge: true, boss: true },
};

class Enemy extends Entity {
  constructor(type, x, y, missionId = null) {
    const def = ENEMY_TYPES[type];
    super(x, y, def.r);
    this.type = type; this.def = def;
    this.team = 'enemy';
    this.hp = this.maxHp = def.hp;
    this.boss = !!def.boss;
    this.moveMode = def.fly ? 'fly' : 'walk';
    this.cd = rand(0.3, def.cd || 1);
    this.home = { x, y };
    this.goal = null; this.waitT = rand(0, 2);
    this.missionId = missionId;
    this.timers = { spawn: 6, burst: 3, special: 5, charge: 4 };
    this.ramCd = 0;
    this.charging = 0;
    this.strafe = Math.random() < 0.5 ? 1 : -1;
  }
  teamNow() { return this.hypno > 0 ? 'player' : 'enemy'; }
  update(dt, m) {
    const def = this.def;
    this.anim += dt;
    this.flash = Math.max(0, this.flash - dt);
    this.ramCd = Math.max(0, this.ramCd - dt);
    if (this.shrunk > 0) this.shrunk -= dt;
    if (this.hypno > 0) { this.hypno -= dt; if (this.hypno <= 0) floatText(m, this.x, this.y - 20, 'snapped out!', '#c36bff', 11); }
    if (this.slow > 0) this.slow -= dt;
    this.applyKnock(m, dt);
    if (this.frozen > 0) { this.frozen -= dt; return; }
    if (this.type === 'dummy') { this.hp = Math.min(this.maxHp, this.hp + 30 * dt); return; }

    const sc = this.sizeScale();
    let speed = def.speed * (this.shrunk > 0 ? 0.7 : 1) * (this.slow > 0 ? 0.45 : 1);
    const targets = this.hypno > 0 ? enemyTargets(m).filter((e) => e !== this) : playerTeamTargets(m);
    const target = nearest(this, targets, this.hypno > 0 ? 450 : def.sight);
    this.cd -= dt;

    if (!target) { this.wander(dt, m, speed * 0.5); return; }
    const d = dist(this, target), a = angleTo(this, target);
    this.facing = a;

    switch (def.attack) {
      case 'melee': {
        if (def.charge && this.charging <= 0 && d < 260 && d > 90 && (this.timers.charge -= dt) <= 0) { this.charging = 0.7; this.timers.charge = rand(3, 5); floatText(m, this.x, this.y - 26, '!', '#ff4040', 18); }
        if (this.charging > 0) { this.charging -= dt; speed *= 3.2; }
        if (d > this.r * sc + target.r + def.range) this.moveToward(dt, m, a, speed);
        else if (this.cd <= 0) {
          this.cd = def.cd;
          damage(target, def.dmg * (this.shrunk > 0 ? 0.25 : 1), { knock: this.charging > 0 ? 400 : 160, from: this });
          this.charging = 0;
        }
        break;
      }
      case 'ranged': {
        const want = def.range * 0.75;
        if (d > def.range) this.moveToward(dt, m, a, speed);
        else if (d < want * 0.6) this.moveToward(dt, m, a + Math.PI, speed * 0.8);
        else this.moveToward(dt, m, a + (Math.PI / 2) * this.strafe, speed * 0.5);
        if (Math.random() < dt * 0.4) this.strafe *= -1;
        if (this.cd <= 0 && d < def.range * 1.1) { this.cd = def.cd + rand(-0.2, 0.3); this.shoot(m, a, def.bullet, def.dmg * (this.shrunk > 0 ? 0.25 : 1), '#7aff6a'); }
        break;
      }
      case 'saucer': {
        const orbit = a + Math.PI + 0.9 * this.strafe;
        const gx = target.x + Math.cos(orbit) * 200, gy = target.y + Math.sin(orbit) * 200;
        this.moveToward(dt, m, Math.atan2(gy - this.y, gx - this.x), speed);
        if (this.cd <= 0) {
          this.cd = def.cd;
          for (let k = 0; k < 3; k++) setTimeout(() => { if (!this.dead && this.frozen <= 0 && G.map === m) this.shoot(m, angleTo(this, target) + rand(-0.1, 0.1), def.bullet, def.dmg, '#7aff6a'); }, k * 150);
        }
        if (this.hypno <= 0 && (this.timers.spawn -= dt) <= 0) {
          this.timers.spawn = 9;
          const near = m.entities.filter((e) => e.type === 'yokian' && !e.dead && dist(e, this) < 600).length;
          if (near < 4) { const p = m.findOpen(this.x, this.y + 30, 12); m.entities.push(new Enemy('yokian', p.x, p.y, this.missionId)); ring(m, p.x, p.y, 30, '#7aff6a'); }
        }
        break;
      }
      case 'goobot': this.updateGoobot(dt, m, target, d, a, speed); break;
      case 'megabot': this.updateMegabot(dt, m, target, d, a, speed); break;
    }
    // Touching damage for small swarmers handled by melee; bosses also bump.
    if (this.boss && d < this.r + target.r && this.ramCd <= 0) { this.ramCd = 0.8; damage(target, 10, { knock: 500, from: this }); }
  }
  updateGoobot(dt, m, target, d, a, speed) {
    const orbit = a + Math.PI + 0.6;
    const gx = target.x + Math.cos(orbit) * 260, gy = target.y + Math.sin(orbit) * 260;
    this.moveToward(dt, m, Math.atan2(gy - this.y, gx - this.x), speed);
    const enraged = this.hp < this.maxHp * 0.5;
    if (this.cd <= 0) {
      this.cd = enraged ? 0.7 : 1.0;
      for (let k = -1; k <= 1; k++) this.shoot(m, a + k * 0.18, 300, this.def.dmg, '#7aff6a');
    }
    if ((this.timers.burst -= dt) <= 0) {
      this.timers.burst = enraged ? 2.2 : 3.2;
      const n = enraged ? 22 : 16, off = Math.random();
      for (let k = 0; k < n; k++) this.shoot(m, off + (k / n) * Math.PI * 2, 200, this.def.dmg, '#c6ff4f', 6);
      ring(m, this.x, this.y, 80, '#c6ff4f');
    }
    if ((this.timers.spawn -= dt) <= 0) {
      this.timers.spawn = 10;
      const count = m.entities.filter((e) => e.type === 'yokian' && !e.dead).length;
      if (count < 6) for (let k = 0; k < 2; k++) { const p = m.findOpen(this.x + rand(-60, 60), this.y + 60, 12); m.entities.push(new Enemy('yokian', p.x, p.y, this.missionId)); }
    }
  }
  updateMegabot(dt, m, target, d, a, speed) {
    const enraged = this.hp < this.maxHp * 0.5;
    if (this.charging > 0) {
      this.charging -= dt;
      const hit = moveWithCollision(m, this, Math.cos(this.chargeA) * 430 * dt, Math.sin(this.chargeA) * 430 * dt);
      if (hit) { this.charging = 0; G.shake = 10; ring(m, this.x, this.y, 90, '#b48aff'); }
    } else {
      if (d > 120) this.moveToward(dt, m, a, speed * (enraged ? 1.3 : 1));
      if ((this.timers.charge -= dt) <= 0) { this.timers.charge = enraged ? 4 : 6; this.charging = 0.9; this.chargeA = a; floatText(m, this.x, this.y - 50, 'CHARGE!', '#ff4040', 18); }
    }
    if (this.cd <= 0) {
      this.cd = enraged ? 2.0 : 2.8;
      for (let k = -1; k <= 1; k++) {
        const p = new Projectile({ x: this.x, y: this.y - 30, vx: Math.cos(a + k * 0.5) * 210, vy: Math.sin(a + k * 0.5) * 210, team: 'enemy', dmg: 14, color: '#ff8a2a', life: 3.2, r: 6, kind: 'missile', splash: 50, homing: 2.2, target, fly: true });
        m.projectiles.push(p);
      }
      Sfx.play('missile');
    }
    if (d < 110 && (this.timers.special -= dt) <= 0) {
      this.timers.special = 2.5;
      ring(m, this.x, this.y, 150, '#b48aff', 0.5); G.shake = 8; Sfx.play('explode');
      for (const t of playerTeamTargets(m)) if (dist(t, this) < 150) damage(t, 18, { knock: 600, from: this });
    }
  }
  shoot(m, a, speed, dmg, color, r = 4) {
    const team = this.teamNow();
    m.projectiles.push(new Projectile({ x: this.x + Math.cos(a) * this.r, y: this.y - 8 + Math.sin(a) * this.r, vx: Math.cos(a) * speed, vy: Math.sin(a) * speed, team, dmg, color: team === 'player' ? '#c36bff' : color, life: 2.2, r }));
    if (dist(this, G.player) < 600) Sfx.play('enemyShot');
  }
  moveToward(dt, m, a, speed) {
    const hit = moveWithCollision(m, this, Math.cos(a) * speed * dt, Math.sin(a) * speed * dt);
    if (hit && this.moveMode === 'walk') {
      // slide around obstacles
      const a2 = a + (Math.PI / 2) * this.strafe;
      if (moveWithCollision(m, this, Math.cos(a2) * speed * dt, Math.sin(a2) * speed * dt)) this.strafe *= -1;
    }
  }
  wander(dt, m, speed) {
    if (this.goal) {
      const d = distXY(this.x, this.y, this.goal.x, this.goal.y);
      if (d < 6) { this.goal = null; this.waitT = rand(0.5, 2.5); return; }
      const a = Math.atan2(this.goal.y - this.y, this.goal.x - this.x);
      this.facing = a;
      if (moveWithCollision(m, this, Math.cos(a) * speed * dt, Math.sin(a) * speed * dt)) this.goal = null;
    } else if ((this.waitT -= dt) <= 0) {
      this.goal = { x: this.home.x + rand(-140, 140), y: this.home.y + rand(-140, 140) };
    }
  }
  die() {
    if (this.dead) return;
    const m = G.map;
    if (this.type === 'dummy') { this.hp = this.maxHp; floatText(m, this.x, this.y - 30, 'BRAIN BLAST!', '#3fe0ff', 13); return; }
    this.dead = true;
    if (this.boss) explosion(m, this.x, this.y, 140, 0, 'none', { color: '#ffe14f' });
    else { particles(m, this.x, this.y, 14, this.type === 'twonky' ? '#f2a33a' : this.type === 'yokian' || this.type === 'saucer' ? '#7aff6a' : '#aab4c4', 150, 4, 0.6); }
    if (this.type === 'saucer') explosion(m, this.x, this.y, 70, 0, 'none');
    const reward = Math.round(this.def.reward * (1 + 0.1 * (G.upgrades.magnet || 0)));
    const drops = Math.min(8, Math.max(1, Math.ceil(reward / 4)));
    for (let k = 0; k < drops; k++) m.pickups.push(makePickup('neutronium', this.x + rand(-12, 12), this.y + rand(-12, 12), Math.max(1, Math.round(reward / drops))));
    if (Math.random() < (this.boss ? 1 : 0.08)) m.pickups.push(makePickup('health', this.x + rand(-10, 10), this.y + rand(-10, 10), 30));
    if (Math.random() < 0.06) m.pickups.push(makePickup('energy', this.x + rand(-10, 10), this.y + rand(-10, 10), 40));
    G.stats.kills++;
    Missions.onKill(this.type, this);
  }
  draw(ctx) {
    const sc = this.sizeScale();
    const x = this.x, y = this.y;
    ctx.save(); ctx.translate(x, y); ctx.scale(sc, sc);
    drawEnemyBody(ctx, this);
    ctx.restore();
    if (this.flash > 0) { ctx.globalAlpha = 0.55; ctx.fillStyle = '#fff'; ctx.beginPath(); ctx.arc(x, y - this.r * sc * 0.6, this.r * sc + 2, 0, 7); ctx.fill(); ctx.globalAlpha = 1; }
    if (this.frozen > 0) {
      ctx.fillStyle = 'rgba(160,230,255,0.55)'; ctx.strokeStyle = '#e8fbff'; ctx.lineWidth = 2;
      const r = this.r * sc + 4; roundRect(ctx, x - r, y - r * 1.6, r * 2, r * 1.9, 4); ctx.fill(); ctx.stroke();
    }
    if (this.hypno > 0) {
      ctx.strokeStyle = '#c36bff'; ctx.lineWidth = 2;
      ctx.beginPath(); for (let a = 0; a < 12; a += 0.3) { const rr = a * 0.9; const px = x + Math.cos(a + G.time * 6) * rr, py = y - this.r * sc * 2 - 10 + Math.sin(a + G.time * 6) * rr * 0.5; a === 0 ? ctx.moveTo(px, py) : ctx.lineTo(px, py); } ctx.stroke();
    }
    if (this.hp < this.maxHp && !this.boss && this.type !== 'nanobot') {
      const w = Math.max(20, this.r * 2), top = y - this.r * sc * 2 - 12;
      ctx.fillStyle = 'rgba(0,0,0,0.5)'; ctx.fillRect(x - w / 2, top, w, 4);
      ctx.fillStyle = this.hypno > 0 ? '#c36bff' : '#ff4f5a'; ctx.fillRect(x - w / 2, top, w * clamp(this.hp / this.maxHp, 0, 1), 4);
    }
  }
}

function drawEnemyBody(ctx, e) {
  const t = e.anim, r = e.r;
  const hovering = e.def.fly;
  ctx.fillStyle = 'rgba(0,0,0,0.25)'; ctx.beginPath(); ctx.ellipse(0, hovering ? 10 : 2, r, r * 0.4, 0, 0, 7); ctx.fill();
  const lookX = Math.cos(e.facing) * 2.5, lookY = Math.sin(e.facing) * 1.5;
  switch (e.type) {
    case 'twonky': {
      const b = Math.abs(Math.sin(t * 8)) * 4;
      ctx.translate(0, -b);
      ctx.fillStyle = '#c97a2a';
      for (let k = 0; k < 10; k++) { const a = (k / 10) * Math.PI * 2; ctx.beginPath(); ctx.arc(Math.cos(a) * 9, -10 + Math.sin(a) * 9, 4, 0, 7); ctx.fill(); }
      ctx.fillStyle = '#f2a33a'; ctx.beginPath(); ctx.arc(0, -10, 10, 0, 7); ctx.fill();
      ctx.fillStyle = '#f2a33a'; ctx.beginPath(); ctx.moveTo(-9, -16); ctx.lineTo(-12, -26); ctx.lineTo(-4, -19); ctx.fill(); ctx.beginPath(); ctx.moveTo(9, -16); ctx.lineTo(12, -26); ctx.lineTo(4, -19); ctx.fill();
      ctx.fillStyle = '#fff'; ctx.beginPath(); ctx.arc(-4 + lookX, -11 + lookY, 4.5, 0, 7); ctx.arc(4 + lookX, -11 + lookY, 4.5, 0, 7); ctx.fill();
      const angry = e.hypno <= 0 && e.cd < 0.3;
      ctx.fillStyle = angry ? '#c00' : '#222'; ctx.beginPath(); ctx.arc(-4 + lookX * 1.4, -11 + lookY, 2.4, 0, 7); ctx.arc(4 + lookX * 1.4, -11 + lookY, 2.4, 0, 7); ctx.fill();
      ctx.fillStyle = '#8a3a1a'; ctx.fillRect(-2, -5, 4, 2);
      break;
    }
    case 'yokian': {
      const b = Math.sin(t * 4) * 2;
      ctx.fillStyle = '#7d8696'; ctx.beginPath(); ctx.ellipse(0, -4 + b, 13, 5, 0, 0, 7); ctx.fill();
      ctx.fillStyle = '#3fe0ff'; ctx.fillRect(-8, -2 + b, 3, 2); ctx.fillRect(5, -2 + b, 3, 2);
      ctx.fillStyle = '#8fe86a'; ctx.beginPath(); ctx.ellipse(0, -16 + b, 9, 12, 0, 0, 7); ctx.fill();
      ctx.fillStyle = '#5ab83f'; ctx.beginPath(); ctx.ellipse(-3, -20 + b, 3, 5, 0, 0, 7); ctx.fill();
      ctx.fillStyle = '#fff'; ctx.beginPath(); ctx.arc(-3 + lookX, -18 + b, 3, 0, 7); ctx.arc(3 + lookX, -18 + b, 3, 0, 7); ctx.fill();
      ctx.fillStyle = '#111'; ctx.beginPath(); ctx.arc(-3 + lookX * 1.3, -18 + b, 1.5, 0, 7); ctx.arc(3 + lookX * 1.3, -18 + b, 1.5, 0, 7); ctx.fill();
      ctx.strokeStyle = '#2a5a1f'; ctx.lineWidth = 1.5; ctx.beginPath(); ctx.arc(0, -12 + b, 3, 0.2, Math.PI - 0.2); ctx.stroke();
      break;
    }
    case 'saucer': {
      const b = Math.sin(t * 3) * 3;
      ctx.fillStyle = '#5a6a5a'; ctx.beginPath(); ctx.ellipse(0, -14 + b, 26, 9, 0, 0, 7); ctx.fill();
      ctx.fillStyle = '#9be37a'; ctx.beginPath(); ctx.ellipse(0, -16 + b, 24, 7, 0, 0, 7); ctx.fill();
      ctx.fillStyle = 'rgba(200,255,220,0.8)'; ctx.beginPath(); ctx.ellipse(0, -20 + b, 11, 10, 0, Math.PI, 0); ctx.fill();
      ctx.fillStyle = '#8fe86a'; ctx.beginPath(); ctx.ellipse(0, -24 + b, 5, 6, 0, 0, 7); ctx.fill();
      for (let k = 0; k < 6; k++) { const a = t * 3 + (k / 6) * Math.PI * 2; ctx.fillStyle = Math.sin(a * 2) > 0 ? '#ffe14f' : '#ff4040'; ctx.beginPath(); ctx.arc(Math.cos(a) * 20, -14 + b + Math.sin(a) * 5, 2.2, 0, 7); ctx.fill(); }
      break;
    }
    case 'robot': {
      const b = Math.abs(Math.sin(t * 6)) * 1.5;
      ctx.fillStyle = '#3a3a48'; ctx.fillRect(-12, -6, 7, 8); ctx.fillRect(5, -6, 7, 8);
      ctx.fillStyle = e.charging > 0 ? '#c05a5a' : '#8a8fa0'; roundRect(ctx, -13, -28 - b, 26, 23, 4); ctx.fill();
      ctx.fillStyle = '#5a4a6a'; ctx.fillRect(-13, -14 - b, 26, 3);
      ctx.fillStyle = '#2a2a38'; roundRect(ctx, -8, -25 - b, 16, 8, 3); ctx.fill();
      ctx.fillStyle = '#ff3030'; ctx.beginPath(); ctx.arc(lookX * 1.5, -21 - b, 3, 0, 7); ctx.fill();
      ctx.strokeStyle = '#8a8fa0'; ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(0, -28 - b); ctx.lineTo(0, -34 - b); ctx.stroke();
      ctx.fillStyle = '#ffb23f'; ctx.beginPath(); ctx.arc(0, -35 - b, 2.5, 0, 7); ctx.fill();
      ctx.fillStyle = '#8a8fa0'; ctx.fillRect(-17, -22 - b, 4, 12); ctx.fillRect(13, -22 - b, 4, 12);
      break;
    }
    case 'nanobot': {
      ctx.strokeStyle = '#9aa6bc'; ctx.lineWidth = 1;
      for (let k = 0; k < 3; k++) { ctx.beginPath(); ctx.moveTo(-5, -3 + k * 2); ctx.lineTo(5, -5 + k * 3 + Math.sin(t * 30 + k) * 1.5); ctx.stroke(); }
      ctx.fillStyle = '#c8d0dc'; ctx.beginPath(); ctx.arc(0, -4, 4.5, 0, 7); ctx.fill();
      ctx.fillStyle = '#ff3030'; ctx.beginPath(); ctx.arc(0, -4, 1.8, 0, 7); ctx.fill();
      break;
    }
    case 'dummy': {
      ctx.fillStyle = '#6b4a2a'; ctx.fillRect(-2, -12, 4, 14);
      ctx.fillStyle = '#d9b77a'; roundRect(ctx, -11, -34, 22, 24, 8); ctx.fill();
      ctx.strokeStyle = '#e2312f'; ctx.lineWidth = 2;
      ctx.beginPath(); ctx.arc(0, -22, 7, 0, 7); ctx.stroke(); ctx.beginPath(); ctx.arc(0, -22, 2.5, 0, 7); ctx.stroke();
      break;
    }
    case 'goobot': {
      const b = Math.sin(t * 2) * 4;
      ctx.fillStyle = '#4a5a4a'; ctx.beginPath(); ctx.ellipse(0, -20 + b, 46, 16, 0, 0, 7); ctx.fill();
      ctx.fillStyle = '#9be37a'; ctx.beginPath(); ctx.ellipse(0, -24 + b, 44, 13, 0, 0, 7); ctx.fill();
      for (let k = 0; k < 10; k++) { const a = t * 2 + (k / 10) * Math.PI * 2; ctx.fillStyle = Math.sin(a * 3) > 0 ? '#ffe14f' : '#ff4040'; ctx.beginPath(); ctx.arc(Math.cos(a) * 38, -22 + b + Math.sin(a) * 9, 3, 0, 7); ctx.fill(); }
      ctx.fillStyle = 'rgba(200,255,220,0.6)'; ctx.beginPath(); ctx.ellipse(0, -32 + b, 22, 22, 0, Math.PI, 0); ctx.fill();
      ctx.fillStyle = '#8fe86a'; ctx.beginPath(); ctx.ellipse(0, -44 + b, 12, 15, 0, 0, 7); ctx.fill();
      ctx.fillStyle = '#ffd34a'; ctx.beginPath(); ctx.moveTo(-10, -56 + b); ctx.lineTo(-10, -66 + b); ctx.lineTo(-5, -60 + b); ctx.lineTo(0, -68 + b); ctx.lineTo(5, -60 + b); ctx.lineTo(10, -66 + b); ctx.lineTo(10, -56 + b); ctx.fill();
      ctx.fillStyle = '#fff'; ctx.beginPath(); ctx.arc(-4 + lookX, -46 + b, 3.5, 0, 7); ctx.arc(4 + lookX, -46 + b, 3.5, 0, 7); ctx.fill();
      ctx.fillStyle = '#111'; ctx.beginPath(); ctx.arc(-4 + lookX * 1.3, -46 + b, 1.7, 0, 7); ctx.arc(4 + lookX * 1.3, -46 + b, 1.7, 0, 7); ctx.fill();
      break;
    }
    case 'megabot': {
      const b = Math.abs(Math.sin(t * 4)) * 2;
      ctx.fillStyle = '#2a2a38'; ctx.fillRect(-26, -12, 16, 14); ctx.fillRect(10, -12, 16, 14);
      ctx.fillStyle = e.charging > 0 ? '#9a3a5a' : '#6a4a8a'; roundRect(ctx, -30, -62 - b, 60, 52, 8); ctx.fill();
      ctx.fillStyle = '#4a3a6a'; ctx.fillRect(-30, -30 - b, 60, 6);
      ctx.fillStyle = '#1a1a28'; roundRect(ctx, -18, -56 - b, 36, 22, 4); ctx.fill();
      ctx.fillStyle = '#f6c89f'; ctx.beginPath(); ctx.arc(0, -45 - b, 8, 0, 7); ctx.fill();
      ctx.fillStyle = '#3a3a3a'; ctx.fillRect(-8, -53 - b, 16, 3);
      ctx.strokeStyle = '#111'; ctx.lineWidth = 1.5; ctx.beginPath(); ctx.arc(-3, -45 - b, 2.5, 0, 7); ctx.moveTo(5.5, -45 - b); ctx.arc(3, -45 - b, 2.5, 0, 7); ctx.stroke();
      ctx.fillStyle = '#6a4a8a'; ctx.fillRect(-40, -56 - b, 10, 30); ctx.fillRect(30, -56 - b, 10, 30);
      ctx.fillStyle = '#ff8a2a'; ctx.beginPath(); ctx.arc(-35, -24 - b, 5, 0, 7); ctx.arc(35, -24 - b, 5, 0, 7); ctx.fill();
      break;
    }
    case 'ultrabot': {
      const b = Math.abs(Math.sin(t * 6)) * 2;
      ctx.fillStyle = '#2a2a38'; ctx.fillRect(-16, -8, 10, 10); ctx.fillRect(6, -8, 10, 10);
      ctx.fillStyle = e.charging > 0 ? '#c05a5a' : '#7a3a3a'; roundRect(ctx, -18, -40 - b, 36, 33, 6); ctx.fill();
      ctx.fillStyle = '#e0c050'; ctx.fillRect(-18, -40 - b, 36, 7);
      ctx.fillStyle = '#ff3030'; ctx.fillRect(-10, -30 - b, 6, 4); ctx.fillRect(4, -30 - b, 6, 4);
      ctx.fillStyle = '#7a3a3a'; ctx.fillRect(-26, -34 - b, 8, 20); ctx.fillRect(18, -34 - b, 8, 20);
      break;
    }
  }
}

// ---------------------------------------------------------------------------
// Vehicles
// ---------------------------------------------------------------------------
const VEHICLE_TYPES = {
  hovercar: { name: 'Neutron Hovercar', maxSpeed: 410, accel: 430, turn: 2.9, r: 17, hp: 220, mode: 'hover', fire: 'Honk (stuns nearby enemies)' },
  rocket: { name: 'Strato XL Rocket', maxSpeed: 580, accel: 520, turn: 3.3, r: 18, hp: 260, mode: 'fly', fire: 'Twin missiles' },
  goddardbike: { name: 'Goddard Bike', maxSpeed: 340, accel: 560, turn: 3.7, r: 13, hp: 160, mode: 'walk', fire: 'Laser cannons' },
};

class Vehicle extends Entity {
  constructor(kind, x, y, angle = 0) {
    const def = VEHICLE_TYPES[kind];
    super(x, y, def.r);
    this.kind = kind; this.def = def;
    this.angle = angle;
    this.spd = 0;
    this.maxHpBase = def.hp;
    this.hp = this.maxHp = def.hp;
    this.moveMode = def.mode;
    this.driver = null;
    this.fireCd = 0;
    this.alt = 0;
    this.invulnerable = false;
  }
  update(dt, m, input) {
    this.flash = Math.max(0, this.flash - dt);
    this.fireCd -= dt;
    const def = this.def;
    if (this.driver) {
      let max = def.maxSpeed;
      if (input.sprint && G.player.energy > 1) { max *= 1.4; G.player.energy -= 18 * dt; if (Math.random() < 0.7) particles(m, this.x - Math.cos(this.angle) * this.r, this.y - Math.sin(this.angle) * this.r, 1, '#ffb23f', 60, 5, 0.3); }
      const throttle = input.up ? 1 : input.down ? -0.7 : 0;
      if (throttle) this.spd += throttle * def.accel * dt;
      else this.spd *= Math.pow(0.25, dt);
      if (!input.sprint && this.spd > def.maxSpeed) this.spd = lerp(this.spd, def.maxSpeed, dt * 3);
      this.spd = clamp(this.spd, -max * 0.4, max);
      const steer = (input.left ? -1 : 0) + (input.right ? 1 : 0);
      const grip = this.kind === 'rocket' ? 1 : clamp(Math.abs(this.spd) / 140, 0.25, 1);
      this.angle += steer * def.turn * dt * grip * (this.spd < -5 ? -1 : 1);
      if (input.fire && this.fireCd <= 0) this.fire(m, input);
      if (Math.random() < dt * 3) Sfx.play('engine');
    } else {
      this.spd *= Math.pow(0.1, dt);
    }
    this.alt = this.kind === 'rocket' ? lerp(this.alt, this.driver ? 26 : 0, Math.min(1, dt * 3)) : this.kind === 'hovercar' ? 6 : 0;
    const hit = moveWithCollision(m, this, Math.cos(this.angle) * this.spd * dt, Math.sin(this.angle) * this.spd * dt);
    if (hit) {
      if (Math.abs(this.spd) > 220) { damage(this, Math.abs(this.spd) * 0.04); G.shake = 6; particles(m, this.x, this.y, 8, '#ffe14f', 120, 3, 0.4); }
      this.spd *= -0.3;
    }
    // Ramming
    if (this.driver && Math.abs(this.spd) > 140 && this.kind !== 'rocket') {
      for (const e of enemyTargets(m)) {
        if (e.ramHitBy === this && e.ramT > G.time) continue;
        if (dist(this, e) < this.r + e.r * e.sizeScale()) {
          damage(e, Math.abs(this.spd) * 0.11 * powerMult(), { knock: Math.abs(this.spd) * 1.2, from: this });
          e.ramHitBy = this; e.ramT = G.time + 0.5;
          this.spd *= 0.85;
          G.shake = 4;
        }
      }
    }
  }
  fire(m, input) {
    const aim = input.aim;
    if (this.kind === 'rocket') {
      this.fireCd = 0.35;
      for (const side of [-1, 1]) {
        const ox = Math.cos(this.angle + Math.PI / 2) * 12 * side, oy = Math.sin(this.angle + Math.PI / 2) * 12 * side;
        m.projectiles.push(new Projectile({ x: this.x + ox, y: this.y + oy - this.alt, vx: Math.cos(aim) * 700, vy: Math.sin(aim) * 700, team: 'player', dmg: 26 * powerMult(), color: '#ffb23f', life: 0.9, r: 5, kind: 'missile', splash: 55, fly: true }));
      }
      Sfx.play('missile');
    } else if (this.kind === 'goddardbike') {
      this.fireCd = 0.16;
      m.projectiles.push(new Projectile({ x: this.x, y: this.y - 8, vx: Math.cos(aim) * 720, vy: Math.sin(aim) * 720, team: 'player', dmg: 11 * powerMult(), color: '#ff4040', life: 0.7, r: 3 }));
      Sfx.play('blaster');
    } else {
      this.fireCd = 1.2;
      Sfx.play('honk');
      ring(m, this.x, this.y, 130, '#ffe14f', 0.4);
      floatText(m, this.x, this.y - 30, 'HONK!', '#ffe14f', 16);
      for (const e of enemyTargets(m)) if (dist(e, this) < 130) { if (!e.boss) e.frozen = Math.max(e.frozen, 0.8); damage(e, 5, { knock: 450, from: this }); }
    }
  }
  die() {
    if (this.dead) return;
    const m = G.map;
    this.dead = true;
    explosion(m, this.x, this.y, 90, 25, 'player');
    if (this.driver) {
      const p = G.player;
      exitVehicle(true);
      damage(p, 15);
    }
    if (this.kind === 'goddardbike') { G.goddard.isBike = false; G.goddard.x = this.x; G.goddard.y = this.y; G.goddard.die(); }
    G.toast(`${this.def.name} destroyed! Summon a new one from the Vehicle Bay in the lab.`);
  }
  draw(ctx) {
    const x = this.x, y = this.y - this.alt;
    ctx.fillStyle = 'rgba(0,0,0,0.25)'; ctx.beginPath(); ctx.ellipse(this.x + this.alt * 0.4, this.y + 4, this.r + 6, this.r * 0.6, this.angle, 0, 7); ctx.fill();
    ctx.save(); ctx.translate(x, y); ctx.rotate(this.angle);
    if (this.kind === 'hovercar') {
      ctx.fillStyle = 'rgba(63,224,255,0.4)'; ctx.beginPath(); ctx.ellipse(0, 0, 26, 15, 0, 0, 7); ctx.fill();
      ctx.fillStyle = '#3fa7ff'; roundRect(ctx, -22, -12, 44, 24, 10); ctx.fill();
      ctx.fillStyle = '#2a7ad1'; roundRect(ctx, -22, -12, 12, 24, 6); ctx.fill();
      ctx.fillStyle = 'rgba(200,240,255,0.85)'; roundRect(ctx, -4, -9, 16, 18, 6); ctx.fill();
      ctx.fillStyle = '#e8eef8'; ctx.fillRect(16, -10, 5, 4); ctx.fillRect(16, 6, 5, 4);
      ctx.fillStyle = '#ff4040'; ctx.fillRect(-23, -10, 3, 4); ctx.fillRect(-23, 6, 3, 4);
    } else if (this.kind === 'rocket') {
      if (this.driver && Math.abs(this.spd) > 20) { ctx.fillStyle = Math.random() < 0.5 ? '#ffb23f' : '#ff5a2a'; ctx.beginPath(); ctx.moveTo(-20, -6); ctx.lineTo(-34 - rand(0, 14), 0); ctx.lineTo(-20, 6); ctx.fill(); }
      ctx.fillStyle = '#c0453a'; ctx.beginPath(); ctx.moveTo(-18, -8); ctx.lineTo(-26, -18); ctx.lineTo(-8, -8); ctx.fill(); ctx.beginPath(); ctx.moveTo(-18, 8); ctx.lineTo(-26, 18); ctx.lineTo(-8, 8); ctx.fill();
      ctx.fillStyle = '#e8eef8'; ctx.beginPath(); ctx.moveTo(-20, -9); ctx.lineTo(10, -9); ctx.quadraticCurveTo(28, 0, 10, 9); ctx.lineTo(-20, 9); ctx.closePath(); ctx.fill();
      ctx.fillStyle = '#e2312f'; ctx.beginPath(); ctx.moveTo(12, -8); ctx.quadraticCurveTo(28, 0, 12, 8); ctx.closePath(); ctx.fill();
      ctx.fillStyle = '#3fe0ff'; ctx.beginPath(); ctx.arc(2, 0, 4.5, 0, 7); ctx.fill();
      ctx.fillStyle = '#e2312f'; ctx.fillRect(-14, -9, 4, 18);
    } else {
      ctx.fillStyle = '#2a2a38'; ctx.beginPath(); ctx.arc(-13, 0, 6, 0, 7); ctx.arc(13, 0, 6, 0, 7); ctx.fill();
      ctx.fillStyle = '#b8c0cc'; roundRect(ctx, -14, -6, 28, 12, 5); ctx.fill();
      ctx.fillStyle = '#e2312f'; ctx.fillRect(-4, -6, 3, 12);
      ctx.fillStyle = '#c8d0dc'; roundRect(ctx, 10, -5, 9, 10, 3); ctx.fill();
      ctx.fillStyle = '#3fe0ff'; ctx.beginPath(); ctx.arc(16, 0, 2, 0, 7); ctx.fill();
      ctx.fillStyle = '#9aa6bc'; ctx.beginPath(); ctx.moveTo(12, -5); ctx.lineTo(9, -11); ctx.lineTo(15, -5); ctx.fill(); ctx.beginPath(); ctx.moveTo(12, 5); ctx.lineTo(9, 11); ctx.lineTo(15, 5); ctx.fill();
    }
    if (this.driver) {
      ctx.rotate(-this.angle);
      drawPerson(ctx, 0, this.kind === 'goddardbike' ? 2 : 6, LOOKS.jimmy, this.angle, 0, { scale: this.kind === 'rocket' ? 0.55 : 0.7 });
    }
    ctx.restore();
    if (this.flash > 0) { ctx.globalAlpha = 0.5; ctx.fillStyle = '#fff'; ctx.beginPath(); ctx.arc(x, y, this.r + 4, 0, 7); ctx.fill(); ctx.globalAlpha = 1; }
    if (!this.driver && dist(this, G.player) < 160 && !G.player.vehicle) {
      ctx.font = 'bold 11px Fredoka, sans-serif'; ctx.textAlign = 'center'; ctx.lineWidth = 3; ctx.strokeStyle = 'rgba(0,0,0,0.6)';
      ctx.strokeText(this.def.name, x, y - this.r - 14); ctx.fillStyle = '#7ff0ff'; ctx.fillText(this.def.name, x, y - this.r - 14);
    }
  }
}

function enterVehicle(v) {
  const p = G.player;
  if (p.jetpack) p.setJetpack(false);
  p.vehicle = v; v.driver = p;
  v.hp = Math.min(v.hp, v.maxHp);
  Sfx.play('ui');
  G.toast(`${v.def.name}: W/S drive, A/D steer, Shift boost, Click: ${v.def.fire}. E to exit.`);
}
function exitVehicle(forced = false) {
  const p = G.player, v = p.vehicle;
  if (!v) return;
  const m = G.map;
  v.driver = null; p.vehicle = null;
  const side = v.angle + Math.PI / 2;
  const spot = m.findOpen(v.x + Math.cos(side) * (v.r + 14), v.y + Math.sin(side) * (v.r + 14), p.r, 'walk');
  p.x = spot.x; p.y = spot.y;
  if (v.kind === 'goddardbike' && !forced) {
    v.dead = true;
    const g = G.goddard; g.isBike = false; g.x = v.x; g.y = v.y; g.say('Bark!'); g.bikeHp = v.hp;
    particles(m, v.x, v.y, 14, '#b8c0cc', 120, 4, 0.4);
  }
}

// ---------------------------------------------------------------------------
// Projectiles
// ---------------------------------------------------------------------------
class Projectile {
  constructor(o) {
    this.r = 4; this.life = 1; this.kind = 'laser'; this.splash = 0; this.effect = null; this.fly = false; this.homing = 0; this.target = null;
    Object.assign(this, o);
    this.max = this.life;
    this.dead = false;
  }
  update(dt, m) {
    this.life -= dt;
    if (this.homing && this.target && !this.target.dead) {
      const want = angleTo(this, this.target), cur = Math.atan2(this.vy, this.vx);
      const na = cur + clamp(angleDiff(cur, want), -this.homing * dt, this.homing * dt);
      const sp = Math.hypot(this.vx, this.vy);
      this.vx = Math.cos(na) * sp; this.vy = Math.sin(na) * sp;
    }
    this.x += this.vx * dt; this.y += this.vy * dt;
    if (this.kind === 'missile' && Math.random() < 0.6) m.effects.push({ type: 'p', x: this.x, y: this.y, vx: 0, vy: 0, life: 0.3, max: 0.3, color: '#bbb', size: 4 });
    if (this.kind === 'grenade') {
      if (this.life <= 0) { this.detonate(m); return; }
      return;
    }
    if (this.life <= 0) { if (this.splash) this.detonate(m); this.dead = true; return; }
    if (!this.fly && m.blockedAt(this.x, this.y, 'hover')) { particles(m, this.x, this.y, 5, this.color, 80, 3, 0.3); if (this.splash) this.detonate(m); this.dead = true; return; }
    const victims = this.team === 'player' ? enemyTargets(m) : playerTeamTargets(m);
    for (const e of victims) {
      const er = e.r * (e.sizeScale ? e.sizeScale() : 1);
      if (distXY(this.x, this.y, e.x, e.y - er * 0.6) < this.r + er + 2) { this.hit(m, e); return; }
    }
  }
  hit(m, e) {
    this.dead = true;
    particles(m, this.x, this.y, 6, this.color, 100, 3, 0.3);
    if (this.splash) return this.detonate(m);
    switch (this.effect) {
      case 'freeze':
        e.frozen = e.boss ? 1.2 : 4; floatText(m, e.x, e.y - 30, 'FROZEN', '#8fe8ff', 12); break;
      case 'shrink':
        if (!(e.shrunk > 0)) floatText(m, e.x, e.y - 30, e.boss ? 'WEAKENED!' : 'SHRUNK!', '#ff5fd2', 12);
        e.shrunk = e.boss ? 4 : 9; break;
      case 'hypno':
        if (e.boss) floatText(m, e.x, e.y - 40, 'TOO STRONG-WILLED!', '#c36bff', 12);
        else { e.hypno = 10; floatText(m, e.x, e.y - 30, 'HYPNOTIZED', '#c36bff', 12); }
        break;
    }
    damage(e, this.dmg, { knock: this.knock || 60, from: this });
  }
  detonate(m) {
    this.dead = true;
    explosion(m, this.x, this.y, this.splash || 60, this.dmg, this.team, { color: this.kind === 'grenade' ? '#ff6fd0' : '#ffb23f', slow: this.kind === 'grenade' ? 3 : 0 });
  }
  draw(ctx) {
    if (this.kind === 'grenade') {
      const t = 1 - this.life / this.max;
      const h = Math.sin(t * Math.PI) * 40;
      ctx.fillStyle = 'rgba(0,0,0,0.25)'; ctx.beginPath(); ctx.ellipse(this.x, this.y + 4, 6, 3, 0, 0, 7); ctx.fill();
      ctx.fillStyle = '#ff6fd0'; ctx.beginPath(); ctx.arc(this.x, this.y - h, 7, 0, 7); ctx.fill();
      ctx.fillStyle = '#fff'; ctx.beginPath(); ctx.arc(this.x - 2, this.y - h - 2, 2, 0, 7); ctx.fill();
      return;
    }
    const a = Math.atan2(this.vy, this.vx);
    if (this.kind === 'missile') {
      ctx.save(); ctx.translate(this.x, this.y); ctx.rotate(a);
      ctx.fillStyle = '#e8eef8'; ctx.fillRect(-7, -2.5, 12, 5); ctx.fillStyle = this.color; ctx.fillRect(4, -2.5, 4, 5);
      ctx.restore(); return;
    }
    ctx.strokeStyle = this.color; ctx.lineWidth = this.r * 1.4; ctx.lineCap = 'round';
    ctx.globalAlpha = 0.35; ctx.lineWidth = this.r * 3;
    ctx.beginPath(); ctx.moveTo(this.x, this.y); ctx.lineTo(this.x - Math.cos(a) * 14, this.y - Math.sin(a) * 14); ctx.stroke();
    ctx.globalAlpha = 1; ctx.lineWidth = this.r * 1.2;
    ctx.beginPath(); ctx.moveTo(this.x, this.y); ctx.lineTo(this.x - Math.cos(a) * 10, this.y - Math.sin(a) * 10); ctx.stroke();
    ctx.lineCap = 'butt';
    if (this.effect === 'hypno') { ctx.strokeStyle = '#fff'; ctx.lineWidth = 1; ctx.beginPath(); ctx.arc(this.x, this.y, 6 + Math.sin(G.time * 30) * 2, 0, 7); ctx.stroke(); }
  }
}

// ---------------------------------------------------------------------------
// Pickups
// ---------------------------------------------------------------------------
function makePickup(kind, x, y, value) {
  return { kind, x, y, value, t: 0, vx: rand(-60, 60), vy: rand(-60, 60), dead: false };
}
function updatePickups(m, dt) {
  const p = G.player;
  const magnet = 90 + 45 * (G.upgrades.magnet || 0);
  for (const k of m.pickups) {
    k.t += dt;
    k.x += k.vx * dt; k.y += k.vy * dt; k.vx *= 0.9; k.vy *= 0.9;
    const d = dist(k, p);
    if (d < magnet && k.t > 0.3) { const s = 420 * (1 - d / magnet) + 120; k.x += ((p.x - k.x) / d) * s * dt; k.y += ((p.y - k.y) / d) * s * dt; }
    if (d < 18 + p.r) {
      k.dead = true;
      if (k.kind === 'neutronium') { G.neutronium += k.value; Sfx.play('pickup'); }
      else if (k.kind === 'health') { p.hp = Math.min(p.maxHp, p.hp + k.value); floatText(m, p.x, p.y - 30, '+' + k.value + ' HP', '#ff6f8a', 12); Sfx.play('pickup'); }
      else if (k.kind === 'energy') { p.energy = Math.min(p.maxEnergy, p.energy + k.value); floatText(m, p.x, p.y - 30, '+ENERGY', '#3fe0ff', 12); Sfx.play('pickup'); }
    }
    if (k.t > 40) k.dead = true;
  }
  m.pickups = m.pickups.filter((k) => !k.dead);
}
function drawPickups(ctx, m) {
  for (const k of m.pickups) {
    const b = Math.sin(k.t * 6) * 2;
    if (k.kind === 'neutronium') {
      ctx.fillStyle = 'rgba(122,255,106,0.3)'; ctx.beginPath(); ctx.arc(k.x, k.y + b, 7, 0, 7); ctx.fill();
      ctx.strokeStyle = '#7aff6a'; ctx.lineWidth = 1.2;
      for (let i = 0; i < 3; i++) { ctx.beginPath(); ctx.ellipse(k.x, k.y + b, 6, 2.2, i * 1.05 + k.t * 2, 0, 7); ctx.stroke(); }
      ctx.fillStyle = '#eaffdf'; ctx.beginPath(); ctx.arc(k.x, k.y + b, 1.8, 0, 7); ctx.fill();
    } else if (k.kind === 'health') {
      ctx.fillStyle = '#9b4fd8'; roundRect(ctx, k.x - 5, k.y - 9 + b, 10, 16, 3); ctx.fill();
      ctx.fillStyle = '#fff'; ctx.fillRect(k.x - 5, k.y - 3 + b, 10, 3);
    } else {
      ctx.fillStyle = '#3fe0ff'; ctx.beginPath(); ctx.moveTo(k.x + 2, k.y - 9 + b); ctx.lineTo(k.x - 5, k.y + 1 + b); ctx.lineTo(k.x, k.y + 1 + b); ctx.lineTo(k.x - 2, k.y + 9 + b); ctx.lineTo(k.x + 5, k.y - 1 + b); ctx.lineTo(k.x, k.y - 1 + b); ctx.fill();
    }
  }
}
