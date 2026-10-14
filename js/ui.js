'use strict';
// ---------------------------------------------------------------------------
// HUD (drawn on the canvas) and menus (DOM overlays).
// ---------------------------------------------------------------------------

const UPGRADES = [
  { id: 'health', name: 'Reinforced Lab Coat', desc: '+25 max health', base: 80, max: 5 },
  { id: 'energy', name: 'Neutron Battery', desc: '+25 max energy, faster recharge', base: 80, max: 5 },
  { id: 'power', name: 'Invention Overclock', desc: '+25% damage for every invention and vehicle weapon', base: 120, max: 5 },
  { id: 'goddard', name: 'Goddard Firmware', desc: 'Goddard gets more health and stronger lasers', base: 100, max: 4 },
  { id: 'magnet', name: 'Neutronium Magnet', desc: 'Bigger pickup radius, +10% neutronium from enemies', base: 60, max: 4 },
  { id: 'armor', name: 'Vehicle Armor Plating', desc: 'Vehicles take 15% less damage', base: 90, max: 4 },
];

const UI = {
  modal: null,
  init() {
    this.root = document.getElementById('overlay');
    this.toastBox = document.getElementById('toasts');
    this.bannerEl = document.getElementById('banner');
  },
  isOpen() { return !!this.modal; },
  close() {
    if (!this.modal) return;
    const m = this.modal; this.modal = null;
    m.el.remove();
    if (m.onClose) m.onClose();
    G.input.clearMouse();
  },
  open(html, opts = {}) {
    this.close();
    const el = document.createElement('div');
    el.className = 'modal-wrap';
    el.innerHTML = `<div class="modal ${opts.cls || ''}" role="dialog" aria-modal="true">${html}</div>`;
    this.root.appendChild(el);
    el.addEventListener('mousedown', (e) => { if (e.target === el && !opts.sticky) this.close(); });
    this.modal = { el, onClose: opts.onClose };
    const first = el.querySelector('button');
    if (first) first.focus();
    return el;
  },

  toast(text) {
    const t = document.createElement('div');
    t.className = 'toast';
    t.textContent = text;
    this.toastBox.appendChild(t);
    while (this.toastBox.children.length > 4) this.toastBox.firstChild.remove();
    setTimeout(() => t.classList.add('out'), 3600);
    setTimeout(() => t.remove(), 4200);
  },
  banner(title, sub) {
    const b = this.bannerEl;
    b.innerHTML = `<div class="banner-sub">${sub}</div><div class="banner-title">${title}</div>`;
    b.classList.remove('show'); void b.offsetWidth; b.classList.add('show');
  },

  dialogue({ name, text, buttons }) {
    const el = this.open(`
      <div class="dlg-name">${name}</div>
      <p class="dlg-text">${text}</p>
      <div class="btn-row">${(buttons || [{ label: 'OK' }]).map((b, i) => `<button class="btn ${i === 0 ? 'primary' : ''}" data-i="${i}">${b.label}</button>`).join('')}</div>
    `, { cls: 'dialogue' });
    el.querySelectorAll('button[data-i]').forEach((btn) => btn.addEventListener('click', () => {
      const b = buttons ? buttons[+btn.dataset.i] : null;
      Sfx.play('ui');
      this.close();
      if (b && b.action) b.action();
    }));
  },

  offerMission(def, speaker) {
    this.dialogue({
      name: speaker,
      text: `${def.offer}<span class="dlg-meta">Mission: <b>${def.title}</b> · Reward ${def.reward} neutronium</span>`,
      buttons: [{ label: 'Accept mission', action: () => Missions.start(def) }, { label: 'Not now' }],
    });
  },

  missionBoard() {
    const avail = Missions.available();
    const done = Missions.defs.filter((d) => Missions.completed.has(d.id));
    const row = (d) => {
      const fromVox = d.giver === 'VOX';
      const action = Missions.active ? '<span class="tag">Finish your current mission first</span>'
        : fromVox ? `<button class="btn primary small" data-start="${d.id}">Start</button>` : `<span class="tag">Talk to ${d.giver}</span>`;
      return `<li><div><b>${d.title}</b><small>${fromVox ? 'VOX alert' : 'Requested by ' + d.giver} · ${d.reward} neutronium</small></div>${action}</li>`;
    };
    const el = this.open(`
      <div class="dlg-name">VOX Mission Computer</div>
      ${Missions.active ? `<p class="dlg-text">Active: <b>${Missions.active.def.title}</b><br>${Missions.stepText()}</p>` : ''}
      <h3>Available</h3>
      <ul class="list">${avail.length ? avail.map(row).join('') : '<li><div>No new missions. Retroville is quiet... for now. Random alien and robot attacks continue around town.</div></li>'}</ul>
      <h3>Completed ${done.length}/${Missions.defs.length}</h3>
      <p class="muted">${done.map((d) => d.title).join(' · ') || 'None yet.'}</p>
      <div class="btn-row"><button class="btn" data-close>Close</button></div>
    `, { cls: 'wide' });
    el.querySelectorAll('[data-start]').forEach((b) => b.addEventListener('click', () => { const d = Missions.def(b.dataset.start); this.close(); this.offerMission(d, 'VOX'); }));
    el.querySelector('[data-close]').addEventListener('click', () => this.close());
  },

  upgrades() {
    const render = () => {
      const el = this.open(`
        <div class="dlg-name">Invention Workbench</div>
        <p class="dlg-text">Spend neutronium to upgrade your gear. You have <b class="neu">${G.neutronium}</b> neutronium.</p>
        <ul class="list">${UPGRADES.map((u) => {
          const lvl = G.upgrades[u.id] || 0, cost = u.base * (lvl + 1), maxed = lvl >= u.max;
          return `<li><div><b>${u.name}</b> <span class="pips">${'●'.repeat(lvl)}${'○'.repeat(u.max - lvl)}</span><small>${u.desc}</small></div>
            ${maxed ? '<span class="tag">MAX</span>' : `<button class="btn small ${G.neutronium >= cost ? 'primary' : ''}" data-up="${u.id}" ${G.neutronium >= cost ? '' : 'disabled'}>${cost}</button>`}</li>`;
        }).join('')}</ul>
        <div class="btn-row"><button class="btn" data-close>Close</button></div>
      `, { cls: 'wide' });
      el.querySelectorAll('[data-up]').forEach((b) => b.addEventListener('click', () => {
        const u = UPGRADES.find((x) => x.id === b.dataset.up), lvl = G.upgrades[u.id] || 0, cost = u.base * (lvl + 1);
        if (G.neutronium < cost) return;
        G.neutronium -= cost; G.upgrades[u.id] = lvl + 1;
        G.player.recalcStats(); G.goddard.recalcStats(false);
        if (u.id === 'health') G.player.hp = G.player.maxHp;
        Sfx.play('brainblast'); G.save();
        render();
      }));
      el.querySelector('[data-close]').addEventListener('click', () => this.close());
    };
    render();
  },

  vehicleBay() {
    const el = this.open(`
      <div class="dlg-name">Vehicle Bay</div>
      <p class="dlg-text">Summon a fresh, fully repaired vehicle outside the clubhouse.</p>
      <ul class="list">
        ${['hovercar', 'rocket'].map((k) => `<li><div><b>${VEHICLE_TYPES[k].name}</b><small>${k === 'rocket' ? 'Flies over everything. Fires twin missiles.' : 'Hovers over water. Ram enemies, honk to stun them.'}</small></div><button class="btn primary small" data-v="${k}">Summon</button></li>`).join('')}
        <li><div><b>Goddard Bike</b><small>Press V next to Goddard anywhere in town to ride him. Laser cannons included.</small></div><span class="tag">Press V</span></li>
      </ul>
      <div class="btn-row"><button class="btn" data-close>Close</button></div>
    `, { cls: 'wide' });
    el.querySelectorAll('[data-v]').forEach((b) => b.addEventListener('click', () => { G.summonVehicle(b.dataset.v); Sfx.play('ui'); this.close(); G.toast(`${VEHICLE_TYPES[b.dataset.v].name} is waiting outside the clubhouse.`); }));
    el.querySelector('[data-close]').addEventListener('click', () => this.close());
  },

  vault() {
    const el = this.open(`
      <div class="dlg-name">Invention Vault</div>
      <ul class="list">${INVENTIONS.map((i) => `<li><div><b><span class="swatch" style="background:${i.color}"></span>${i.key}. ${i.name}</b><small>${i.desc} Energy: ${i.cost}.</small></div></li>`).join('')}</ul>
      <div class="btn-row"><button class="btn" data-close>Close</button></div>
    `, { cls: 'wide' });
    el.querySelector('[data-close]').addEventListener('click', () => this.close());
  },

  questLog() {
    const a = Missions.active;
    const avail = Missions.available();
    const el = this.open(`
      <div class="dlg-name">Mission Log</div>
      ${a ? `<p class="dlg-text"><b>${a.def.title}</b><br>${Missions.stepText()}</p><div class="btn-row"><button class="btn danger small" data-abandon>Abandon mission</button></div>` : '<p class="dlg-text">No active mission. Look for a yellow <b class="neu">!</b> over someone\'s head, or check VOX in the lab.</p>'}
      <h3>Who needs help</h3>
      <ul class="list">${avail.map((d) => `<li><div><b>${d.title}</b><small>${d.giver === 'VOX' ? 'VOX computer in the lab' : d.giver}</small></div><span class="tag">${d.reward}</span></li>`).join('') || '<li><div>Nobody right now. Enjoy the sandbox!</div></li>'}</ul>
      <p class="muted">Story progress: ${Missions.completed.size}/${Missions.defs.length} missions · Enemies defeated: ${G.stats.kills}</p>
      <div class="btn-row"><button class="btn" data-close>Close</button></div>
    `, { cls: 'wide' });
    const ab = el.querySelector('[data-abandon]');
    if (ab) ab.addEventListener('click', () => { Missions.abandon(); this.close(); });
    el.querySelector('[data-close]').addEventListener('click', () => this.close());
  },

  controlsHtml() {
    return `<div class="controls">
      <div><kbd>W A S D</kbd> Move / drive</div><div><kbd>Mouse</kbd> Aim</div>
      <div><kbd>Click</kbd> Use invention / vehicle weapon</div><div><kbd>1</kbd>–<kbd>8</kbd> / <kbd>Wheel</kbd> Pick invention</div>
      <div><kbd>Shift</kbd> Sprint / vehicle boost</div><div><kbd>E</kbd> Talk · enter · use · get in/out</div>
      <div><kbd>G</kbd> Goddard: follow / attack / stay</div><div><kbd>V</kbd> Ride the Goddard Bike</div>
      <div><kbd>Q</kbd> Mission log</div><div><kbd>M</kbd> Town map</div>
      <div><kbd>Esc</kbd> Pause</div><div><kbd>N</kbd> Mute sound</div>
    </div>`;
  },

  pause() {
    const el = this.open(`
      <div class="dlg-name">Paused</div>
      ${this.controlsHtml()}
      <div class="btn-row">
        <button class="btn primary" data-close>Resume</button>
        <button class="btn" data-mute>${Sfx.muted ? 'Unmute' : 'Mute'} sound</button>
        <button class="btn danger" data-reset>Reset save</button>
      </div>
    `, { cls: 'wide' });
    el.querySelector('[data-close]').addEventListener('click', () => this.close());
    el.querySelector('[data-mute]').addEventListener('click', (e) => { e.target.textContent = (Sfx.toggle() ? 'Unmute' : 'Mute') + ' sound'; });
    el.querySelector('[data-reset]').addEventListener('click', (e) => {
      if (e.target.dataset.armed) { Store.clear(); location.reload(); return; }
      e.target.dataset.armed = '1'; e.target.textContent = 'Click again to erase all progress';
    });
  },

  bigMap() {
    const el = this.open(`<div class="dlg-name">Retroville</div><canvas id="bigmap" width="750" height="550"></canvas><p class="muted">Yellow: you · Green: objective · Blue: vehicles · ! : someone needs help</p><div class="btn-row"><button class="btn" data-close>Close</button></div>`, { cls: 'map' });
    el.querySelector('[data-close]').addEventListener('click', () => this.close());
    const c = el.querySelector('#bigmap'), g = c.getContext('2d');
    const town = G.maps.town, s = 5;
    g.imageSmoothingEnabled = false;
    g.drawImage(G.minimapImg, 0, 0, town.w * s, town.h * s);
    g.font = 'bold 11px Fredoka, sans-serif'; g.textAlign = 'center';
    for (const z of town.zones) {
      if (z.name === 'Retroville River') continue;
      g.fillStyle = 'rgba(29,33,64,0.65)'; const w = g.measureText(z.name).width + 8;
      g.fillRect((z.x + z.w / 2) * s - w / 2, (z.y + 3) * s - 9, w, 14);
      g.fillStyle = '#fff'; g.fillText(z.name, (z.x + z.w / 2) * s, (z.y + 3) * s + 2);
    }
    const dot = (x, y, col, r = 5) => { g.fillStyle = col; g.beginPath(); g.arc((x / TILE) * s, (y / TILE) * s, r, 0, 7); g.fill(); g.strokeStyle = '#1d2140'; g.lineWidth = 2; g.stroke(); };
    for (const e of town.entities) {
      if (e instanceof Vehicle && !e.dead) dot(e.x, e.y, '#3fa7ff', 4);
      if (e instanceof NPC && Missions.npcMarker(e.name)) { g.fillStyle = '#ffe14f'; g.font = 'bold 16px Bungee, sans-serif'; g.fillText(Missions.npcMarker(e.name), (e.x / TILE) * s, (e.y / TILE) * s); }
    }
    const mk = Missions.marker();
    if (mk && mk.map === 'town') dot(mk.x, mk.y, '#7aff6a', 7);
    const p = G.map.name === 'town' ? G.player : { x: 45.5 * TILE, y: 27 * TILE };
    dot(p.x, p.y, '#ffe14f', 6);
  },
};

// ---------------------------------------------------------------------------
// Canvas HUD
// ---------------------------------------------------------------------------
function hudFont(size, display) { return `${display ? '' : 'bold '}${size}px ${display ? 'Bungee, Impact' : 'Fredoka, "Trebuchet MS"'}, sans-serif`; }

function drawBar(ctx, x, y, w, h, frac, col, back = 'rgba(0,0,0,0.45)') {
  ctx.fillStyle = back; roundRect(ctx, x, y, w, h, h / 2); ctx.fill();
  if (frac > 0) { ctx.fillStyle = col; roundRect(ctx, x, y, Math.max(h, w * clamp(frac, 0, 1)), h, h / 2); ctx.fill(); }
  ctx.fillStyle = 'rgba(255,255,255,0.25)'; roundRect(ctx, x + 3, y + 2, Math.max(0, w * clamp(frac, 0, 1) - 6), h / 3, h / 6); ctx.fill();
}

function drawHUD(ctx, W, H) {
  const p = G.player;
  const small = W < 700;
  ctx.textBaseline = 'middle';
  // --- Vitals (top-left) ---
  const px = 14, py = 14;
  ctx.fillStyle = 'rgba(16,19,40,0.78)'; roundRect(ctx, px, py, 250, 92, 14); ctx.fill();
  ctx.strokeStyle = 'rgba(63,224,255,0.35)'; ctx.lineWidth = 2; roundRect(ctx, px, py, 250, 92, 14); ctx.stroke();
  // portrait
  ctx.save(); ctx.beginPath(); ctx.arc(px + 36, py + 46, 28, 0, 7); ctx.fillStyle = '#2a3160'; ctx.fill(); ctx.clip();
  drawPerson(ctx, px + 36, py + 92, LOOKS.jimmy, Math.PI / 2, 0, { scale: 1.9 });
  ctx.restore();
  ctx.font = hudFont(12, true); ctx.fillStyle = '#fff'; ctx.textAlign = 'left';
  ctx.fillText('JIMMY', px + 74, py + 16);
  drawBar(ctx, px + 74, py + 28, 160, 14, p.hp / p.maxHp, '#ff4f5a');
  ctx.font = hudFont(10); ctx.fillStyle = '#fff'; ctx.fillText(`${Math.ceil(Math.max(0, p.hp))}/${p.maxHp}`, px + 80, py + 35.5);
  drawBar(ctx, px + 74, py + 48, 160, 12, p.energy / p.maxEnergy, p.jetpack ? '#ffb23f' : '#3fe0ff');
  ctx.fillStyle = '#0b1a2a'; ctx.fillText('ENERGY', px + 80, py + 54.5);
  // neutronium
  ctx.strokeStyle = '#7aff6a'; ctx.lineWidth = 1.4;
  for (let i = 0; i < 3; i++) { ctx.beginPath(); ctx.ellipse(px + 84, py + 76, 8, 3, i * 1.05 + G.time, 0, 7); ctx.stroke(); }
  ctx.font = hudFont(14, true); ctx.fillStyle = '#7aff6a'; ctx.fillText(String(G.neutronium), px + 98, py + 77);
  // goddard status
  const gd = G.goddard;
  ctx.font = hudFont(11); ctx.textAlign = 'right';
  ctx.fillStyle = gd.offline > 0 ? '#ff8a8a' : '#c8d0dc';
  ctx.fillText(gd.isBike ? 'GODDARD: BIKE' : gd.offline > 0 ? `GODDARD: REBOOT ${Math.ceil(gd.offline)}s` : `GODDARD: ${gd.mode.toUpperCase()}`, px + 238, py + 77);

  // --- Vehicle panel ---
  if (p.vehicle) {
    const v = p.vehicle;
    ctx.fillStyle = 'rgba(16,19,40,0.78)'; roundRect(ctx, px, py + 100, 250, 44, 12); ctx.fill();
    ctx.font = hudFont(11, true); ctx.textAlign = 'left'; ctx.fillStyle = '#7ff0ff'; ctx.fillText(v.def.name.toUpperCase(), px + 12, py + 114);
    drawBar(ctx, px + 12, py + 124, 140, 10, v.hp / v.maxHp, '#ffb23f');
    ctx.font = hudFont(13, true); ctx.textAlign = 'right'; ctx.fillStyle = '#fff'; ctx.fillText(`${Math.round(Math.abs(v.spd) / 6)} MPH`, px + 238, py + 128);
  }

  // --- Hotbar ---
  if (!p.vehicle) {
    const n = INVENTIONS.length, sz = small ? 38 : 50, gap = 6, total = n * sz + (n - 1) * gap;
    const hx = W / 2 - total / 2, hy = H - sz - 16;
    ctx.fillStyle = 'rgba(16,19,40,0.7)'; roundRect(ctx, hx - 10, hy - 26, total + 20, sz + 36, 14); ctx.fill();
    const cur = INVENTIONS[p.invIndex];
    ctx.font = hudFont(small ? 10 : 12, true); ctx.textAlign = 'center'; ctx.fillStyle = cur.color;
    ctx.fillText(cur.name.toUpperCase() + (cur.id === 'jetpack' && p.jetpack ? ' (ON)' : ''), W / 2, hy - 13);
    INVENTIONS.forEach((inv, i) => {
      const x = hx + i * (sz + gap), sel = i === p.invIndex;
      ctx.fillStyle = sel ? 'rgba(63,224,255,0.25)' : 'rgba(255,255,255,0.07)';
      roundRect(ctx, x, hy, sz, sz, 10); ctx.fill();
      ctx.strokeStyle = sel ? '#3fe0ff' : 'rgba(255,255,255,0.15)'; ctx.lineWidth = sel ? 3 : 1.5; roundRect(ctx, x, hy, sz, sz, 10); ctx.stroke();
      drawInventionIcon(ctx, inv.id, x + sz / 2, hy + sz / 2, sz * 0.36, inv.color);
      const cd = (p.cds[inv.id] || 0) / inv.cd;
      if (cd > 0) { ctx.fillStyle = 'rgba(0,0,0,0.55)'; ctx.fillRect(x, hy + sz * (1 - cd), sz, sz * cd); }
      if (p.energy < inv.cost) { ctx.fillStyle = 'rgba(80,0,0,0.45)'; roundRect(ctx, x, hy, sz, sz, 10); ctx.fill(); }
      ctx.font = hudFont(10); ctx.fillStyle = '#fff'; ctx.textAlign = 'left'; ctx.fillText(inv.key, x + 5, hy + 9);
    });
  }

  // --- Minimap (top-right) ---
  if (G.map.name === 'town') drawMinimap(ctx, W - (small ? 130 : 194), 14, small ? 116 : 180, small ? 86 : 132);
  else {
    ctx.fillStyle = 'rgba(16,19,40,0.78)'; roundRect(ctx, W - 194, 14, 180, 40, 12); ctx.fill();
    ctx.font = hudFont(12, true); ctx.textAlign = 'center'; ctx.fillStyle = '#3fe0ff'; ctx.fillText("JIMMY'S LAB", W - 104, 34);
  }

  // --- Mission tracker ---
  const mw = small ? 200 : 270;
  const mx = W - mw - 14, my = G.map.name === 'town' ? (small ? 108 : 154) : 62;
  if (Missions.active) {
    const text = Missions.stepText();
    ctx.font = hudFont(12);
    const lines = wrapText(ctx, text, mw - 24);
    const h = 36 + lines.length * 16;
    ctx.fillStyle = 'rgba(16,19,40,0.78)'; roundRect(ctx, mx, my, mw, h, 12); ctx.fill();
    ctx.fillStyle = '#ffe14f'; ctx.fillRect(mx, my + 10, 4, h - 20);
    ctx.font = hudFont(11, true); ctx.textAlign = 'left'; ctx.fillStyle = '#ffe14f'; ctx.fillText(Missions.active.def.title.toUpperCase(), mx + 14, my + 16);
    ctx.font = hudFont(12); ctx.fillStyle = '#fff';
    lines.forEach((l, i) => ctx.fillText(l, mx + 14, my + 36 + i * 16));
  } else {
    ctx.fillStyle = 'rgba(16,19,40,0.6)'; roundRect(ctx, mx, my, mw, 30, 10); ctx.fill();
    ctx.font = hudFont(11); ctx.textAlign = 'left'; ctx.fillStyle = '#c8d0dc';
    ctx.fillText(Missions.available().length ? 'Free roam. Find a ! or visit VOX for missions.' : 'Free roam. Retroville is yours!', mx + 12, my + 15);
  }

  // --- Boss bar ---
  const boss = G.map.entities.find((e) => e instanceof Enemy && e.boss && !e.dead && dist(e, p) < 900);
  if (boss) {
    const bw = Math.min(460, W - 40), bx = W / 2 - bw / 2;
    ctx.font = hudFont(13, true); ctx.textAlign = 'center'; ctx.fillStyle = '#fff'; ctx.fillText(boss.def.name.toUpperCase(), W / 2, small ? 128 : 22);
    drawBar(ctx, bx, small ? 138 : 32, bw, 14, boss.hp / boss.maxHp, boss.hypno > 0 ? '#c36bff' : '#ff4f5a');
  }

  // --- Objective arrow ---
  const mk = Missions.marker();
  if (mk) {
    const sameMap = mk.map === G.map.name;
    const target = sameMap ? mk : G.map.name === 'lab' ? G.maps.lab.exit : { ...tp(45, 31) };
    const sx = target.x - G.cam.x, sy = target.y - G.cam.y;
    if (sx < 20 || sy < 20 || sx > W - 20 || sy > H - 20) {
      const a = Math.atan2(sy - H / 2, sx - W / 2);
      const ax = clamp(W / 2 + Math.cos(a) * (W / 2 - 50), 40, W - 40), ay = clamp(H / 2 + Math.sin(a) * (H / 2 - 50), 120, H - 100);
      ctx.save(); ctx.translate(ax, ay); ctx.rotate(a);
      ctx.fillStyle = '#7aff6a'; ctx.strokeStyle = '#1d2140'; ctx.lineWidth = 3;
      ctx.beginPath(); ctx.moveTo(18, 0); ctx.lineTo(-10, -12); ctx.lineTo(-4, 0); ctx.lineTo(-10, 12); ctx.closePath(); ctx.stroke(); ctx.fill();
      ctx.restore();
      ctx.font = hudFont(11); ctx.textAlign = 'center'; ctx.fillStyle = '#7aff6a';
      ctx.fillText(`${Math.round(distXY(p.x, p.y, target.x, target.y) / TILE)}m`, ax, ay + 22);
    } else {
      const b = Math.sin(G.time * 5) * 4;
      ctx.fillStyle = '#7aff6a'; ctx.strokeStyle = '#1d2140'; ctx.lineWidth = 3;
      ctx.beginPath(); ctx.moveTo(sx, sy - 38 + b); ctx.lineTo(sx - 9, sy - 54 + b); ctx.lineTo(sx + 9, sy - 54 + b); ctx.closePath(); ctx.stroke(); ctx.fill();
    }
  }

  // --- Interaction prompt ---
  const it = G.currentInteract;
  if (it && !UI.isOpen()) {
    const text = `[E] ${it.label}`;
    ctx.font = hudFont(15);
    const w = ctx.measureText(text).width + 30, y = H - (p.vehicle ? 60 : small ? 112 : 136);
    ctx.fillStyle = 'rgba(16,19,40,0.85)'; roundRect(ctx, W / 2 - w / 2, y - 17, w, 34, 17); ctx.fill();
    ctx.strokeStyle = '#ffe14f'; ctx.lineWidth = 2; roundRect(ctx, W / 2 - w / 2, y - 17, w, 34, 17); ctx.stroke();
    ctx.fillStyle = '#ffe14f'; ctx.textAlign = 'center'; ctx.fillText(text, W / 2, y + 1);
  }

  // --- Zone name ---
  if (G.zoneT > 0) {
    ctx.globalAlpha = clamp(G.zoneT, 0, 1);
    ctx.font = hudFont(small ? 18 : 26, true); ctx.textAlign = 'center';
    ctx.lineWidth = 6; ctx.strokeStyle = 'rgba(16,19,40,0.8)'; ctx.strokeText(G.zoneName, W / 2, H * 0.22);
    ctx.fillStyle = '#fff'; ctx.fillText(G.zoneName, W / 2, H * 0.22);
    ctx.globalAlpha = 1;
  }

  // --- Clock ---
  const hours = (G.dayTime * 24 + 6) % 24;
  const hh = Math.floor(hours), mm = Math.floor((hours % 1) * 60);
  ctx.font = hudFont(11); ctx.textAlign = 'left'; ctx.fillStyle = '#c8d0dc';
  ctx.fillText(`${((hh + 11) % 12) + 1}:${String(mm).padStart(2, '0')} ${hh < 12 ? 'AM' : 'PM'}  ·  ${G.zoneName}`, 18, p.vehicle ? 170 : 122);

  // crosshair
  if (!UI.isOpen()) {
    const { x, y } = G.input.mouse;
    ctx.strokeStyle = '#fff'; ctx.lineWidth = 2;
    ctx.beginPath(); ctx.arc(x, y, 9, 0, 7); ctx.moveTo(x - 14, y); ctx.lineTo(x - 5, y); ctx.moveTo(x + 5, y); ctx.lineTo(x + 14, y); ctx.moveTo(x, y - 14); ctx.lineTo(x, y - 5); ctx.moveTo(x, y + 5); ctx.lineTo(x, y + 14); ctx.stroke();
    ctx.fillStyle = INVENTIONS[p.invIndex].color; ctx.beginPath(); ctx.arc(x, y, 2, 0, 7); ctx.fill();
  }

  if (G.hurtFlash > 0) {
    const g = ctx.createRadialGradient(W / 2, H / 2, Math.min(W, H) * 0.3, W / 2, H / 2, Math.max(W, H) * 0.7);
    g.addColorStop(0, 'rgba(255,0,0,0)'); g.addColorStop(1, `rgba(255,30,30,${G.hurtFlash * 1.6})`);
    ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
  }
}

function wrapText(ctx, text, maxW) {
  const words = text.split(' '); const lines = []; let line = '';
  for (const w of words) { const t = line ? line + ' ' + w : w; if (ctx.measureText(t).width > maxW && line) { lines.push(line); line = w; } else line = t; }
  if (line) lines.push(line);
  return lines;
}

function drawMinimap(ctx, x, y, w, h) {
  const town = G.maps.town, p = G.player;
  const scale = 1.6; // minimap pixels per tile
  const cx = p.x / TILE, cy = p.y / TILE;
  const vw = w / scale, vh = h / scale;
  const sx = clamp(cx - vw / 2, 0, town.w - vw), sy = clamp(cy - vh / 2, 0, town.h - vh);
  ctx.save();
  ctx.fillStyle = 'rgba(16,19,40,0.85)'; roundRect(ctx, x - 4, y - 4, w + 8, h + 8, 12); ctx.fill();
  roundRect(ctx, x, y, w, h, 9); ctx.clip();
  ctx.imageSmoothingEnabled = false;
  ctx.drawImage(G.minimapImg, sx, sy, vw, vh, x, y, w, h);
  const toMini = (wx, wy) => ({ x: x + (wx / TILE - sx) * scale, y: y + (wy / TILE - sy) * scale });
  for (const e of town.entities) {
    if (e.dead) continue;
    let col = null, r = 2;
    if (e instanceof Enemy) { col = e.hypno > 0 ? '#c36bff' : '#ff3b3b'; r = e.boss ? 4 : 2; }
    else if (e instanceof Vehicle) { col = '#3fa7ff'; r = 3; }
    else if (e instanceof NPC && !e.citizen) { col = Missions.npcMarker(e.name) ? '#ffe14f' : '#ffffff'; r = Missions.npcMarker(e.name) ? 3.5 : 2; }
    else if (e instanceof MissionItem) { col = '#7aff6a'; r = 3; }
    if (!col) continue;
    const q = toMini(e.x, e.y);
    ctx.fillStyle = col; ctx.beginPath(); ctx.arc(q.x, q.y, r, 0, 7); ctx.fill();
  }
  const mk = Missions.marker();
  if (mk && mk.map === 'town') {
    const q = toMini(mk.x, mk.y);
    const qx = clamp(q.x, x + 5, x + w - 5), qy = clamp(q.y, y + 5, y + h - 5);
    ctx.strokeStyle = '#7aff6a'; ctx.lineWidth = 2; ctx.beginPath(); ctx.arc(qx, qy, 5 + Math.sin(G.time * 6), 0, 7); ctx.stroke();
  }
  const pp = toMini(p.x, p.y);
  const fa = p.vehicle ? p.vehicle.angle : p.facing;
  ctx.save(); ctx.translate(pp.x, pp.y); ctx.rotate(fa);
  ctx.fillStyle = '#ffe14f'; ctx.strokeStyle = '#1d2140'; ctx.lineWidth = 1.5;
  ctx.beginPath(); ctx.moveTo(6, 0); ctx.lineTo(-4, -4); ctx.lineTo(-4, 4); ctx.closePath(); ctx.fill(); ctx.stroke();
  ctx.restore();
  ctx.restore();
  ctx.font = hudFont(9); ctx.textAlign = 'right'; ctx.fillStyle = 'rgba(255,255,255,0.6)'; ctx.fillText('M: map', x + w - 4, y + h - 6);
}

function drawInventionIcon(ctx, id, x, y, s, col) {
  ctx.save(); ctx.translate(x, y);
  ctx.fillStyle = col; ctx.strokeStyle = col; ctx.lineWidth = 2.5; ctx.lineCap = 'round';
  switch (id) {
    case 'blaster':
      ctx.fillStyle = '#9aa6bc'; roundRect(ctx, -s, -s * 0.3, s * 1.4, s * 0.6, 3); ctx.fill(); ctx.fillRect(-s * 0.7, 0, s * 0.4, s * 0.8);
      ctx.fillStyle = col; ctx.beginPath(); ctx.arc(s * 0.6, 0, s * 0.35, 0, 7); ctx.fill(); break;
    case 'shrink':
      ctx.beginPath(); ctx.moveTo(-s, -s * 0.6); ctx.lineTo(s * 0.2, 0); ctx.lineTo(-s, s * 0.6); ctx.stroke();
      ctx.beginPath(); ctx.arc(s * 0.6, 0, s * 0.25, 0, 7); ctx.fill(); break;
    case 'freeze':
      for (let k = 0; k < 3; k++) { ctx.rotate(Math.PI / 3); ctx.beginPath(); ctx.moveTo(-s, 0); ctx.lineTo(s, 0); ctx.stroke(); } break;
    case 'hypno':
      ctx.beginPath(); for (let a = 0; a < 12; a += 0.2) { const r = (a / 12) * s; a === 0 ? ctx.moveTo(0, 0) : ctx.lineTo(Math.cos(a) * r, Math.sin(a) * r); } ctx.stroke(); break;
    case 'burp':
      ctx.fillStyle = '#5ab83f'; roundRect(ctx, -s * 0.45, -s * 0.8, s * 0.9, s * 1.6, 4); ctx.fill();
      ctx.fillStyle = '#fff'; ctx.fillRect(-s * 0.45, -s * 0.2, s * 0.9, s * 0.35);
      ctx.fillStyle = col; ctx.beginPath(); ctx.arc(s * 0.7, -s * 0.8, s * 0.2, 0, 7); ctx.arc(s * 0.9, -s * 0.4, s * 0.14, 0, 7); ctx.fill(); break;
    case 'clone':
      ctx.globalAlpha = 0.5; ctx.beginPath(); ctx.arc(-s * 0.35, -s * 0.2, s * 0.45, 0, 7); ctx.fill(); ctx.fillRect(-s * 0.8, s * 0.3, s * 0.9, s * 0.6);
      ctx.globalAlpha = 1; ctx.beginPath(); ctx.arc(s * 0.3, -s * 0.2, s * 0.45, 0, 7); ctx.fill(); ctx.fillRect(-s * 0.15, s * 0.3, s * 0.9, s * 0.6); break;
    case 'grenade':
      ctx.beginPath(); ctx.arc(0, s * 0.1, s * 0.75, 0, 7); ctx.fill();
      ctx.fillStyle = '#fff'; ctx.beginPath(); ctx.arc(-s * 0.25, -s * 0.15, s * 0.2, 0, 7); ctx.fill(); break;
    case 'jetpack':
      ctx.fillStyle = '#9aa6bc'; roundRect(ctx, -s * 0.8, -s * 0.8, s * 0.7, s * 1.2, 4); ctx.fill(); roundRect(ctx, s * 0.1, -s * 0.8, s * 0.7, s * 1.2, 4); ctx.fill();
      ctx.fillStyle = col; ctx.beginPath(); ctx.moveTo(-s * 0.75, s * 0.4); ctx.lineTo(-s * 0.45, s); ctx.lineTo(-s * 0.15, s * 0.4); ctx.fill(); ctx.beginPath(); ctx.moveTo(s * 0.15, s * 0.4); ctx.lineTo(s * 0.45, s); ctx.lineTo(s * 0.75, s * 0.4); ctx.fill(); break;
  }
  ctx.restore();
}
