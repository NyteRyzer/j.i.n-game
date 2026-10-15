'use strict';
// ---------------------------------------------------------------------------
// Player settings (saved separately from game progress) and gamepad input.
// ---------------------------------------------------------------------------

const DIFFICULTY = {
  easy: { label: 'Easy', enemyDmg: 0.55, enemyHp: 0.8 },
  normal: { label: 'Normal', enemyDmg: 1, enemyHp: 1 },
  hard: { label: 'Hard', enemyDmg: 1.45, enemyHp: 1.3 },
};

const Settings = {
  key: 'jn_retroville_settings_v1',
  data: { music: 0.6, sfx: 0.8, sensitivity: 1, quality: 'high', difficulty: 'normal', invertY: false, showFps: false },
  load() {
    try { Object.assign(this.data, JSON.parse(localStorage.getItem(this.key) || '{}')); } catch (e) { /* storage unavailable */ }
    if (!DIFFICULTY[this.data.difficulty]) this.data.difficulty = 'normal';
  },
  save() { try { localStorage.setItem(this.key, JSON.stringify(this.data)); } catch (e) { /* storage unavailable */ } },
  apply() {
    Sfx.setVolumes(this.data.music, this.data.sfx);
    if (typeof R3 !== 'undefined' && R3.renderer) R3.setQuality(this.data.quality);
  },
  diff() { return DIFFICULTY[this.data.difficulty]; },
};

// ---------------------------------------------------------------------------
// Gamepad (standard mapping: Xbox / PlayStation / Switch Pro layouts)
//   Left stick move · Right stick aim/look · RT fire · LT or L3 sprint/boost
//   A interact · B burp dash · X jetpack · Y Goddard · LB/RB switch invention
//   D-pad up mission log · D-pad down camera · Back map · Start pause · R3 ride Goddard
// ---------------------------------------------------------------------------
const Pad = {
  connected: false, prev: [], mx: 0, my: 0, ax: 0, ay: 0, fire: false, sprint: false, active: false,
  dead(v) { return Math.abs(v) < 0.2 ? 0 : (v - Math.sign(v) * 0.2) / 0.8; },
  poll() {
    const pads = navigator.getGamepads ? navigator.getGamepads() : [];
    const gp = Array.from(pads || []).find((p) => p && p.connected);
    this.connected = !!gp;
    if (!gp) { this.mx = this.my = this.ax = this.ay = 0; this.fire = this.sprint = false; return; }
    const b = gp.buttons.map((x) => x.pressed || x.value > 0.5);
    const pressed = (i) => b[i] && !this.prev[i];
    this.mx = this.dead(gp.axes[0] || 0); this.my = this.dead(gp.axes[1] || 0);
    this.ax = this.dead(gp.axes[2] || 0); this.ay = this.dead(gp.axes[3] || 0);
    this.fire = !!b[7]; this.sprint = !!(b[6] || b[10]);
    if (b.some(Boolean) || this.mx || this.my || this.ax || this.ay) this.active = true;
    if (UI.isOpen()) this.menuNav(pressed);
    else if (G.started) {
      if (pressed(7)) Input.firePressed = true;
      const map = { 0: 'e', 1: 'burp', 2: 'jet', 3: 'g', 4: 'prev', 5: 'next', 8: 'm', 9: 'escape', 11: 'v', 12: 'q', 13: 'c' };
      for (const i in map) if (pressed(+i)) padAction(map[i]);
    } else if (pressed(0) || pressed(9)) startGame(!!Store.load());
    this.prev = b;
  },
  menuNav(pressed) {
    const root = UI.modal && UI.modal.el;
    if (!root) return;
    const btns = Array.from(root.querySelectorAll('button:not([disabled]), input, select'));
    const i = btns.indexOf(document.activeElement);
    const move = (d) => { const n = btns[(i + d + btns.length) % btns.length]; if (n) n.focus(); };
    const el = document.activeElement;
    const slider = el && el.type === 'range';
    if (pressed(12)) move(-1);
    if (pressed(13)) move(1);
    if (pressed(14) || pressed(15)) {
      if (slider) { el.value = +el.value + (pressed(15) ? 1 : -1) * (+el.step || 0.1); el.dispatchEvent(new Event('input')); }
      else move(pressed(15) ? 1 : -1);
    }
    if (pressed(0) && el && el.click && !slider) el.click();
    if (pressed(1) || pressed(9)) UI.close();
  },
};
