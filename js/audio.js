'use strict';
// Tiny WebAudio synth: every sound in the game is generated, no audio files.

const Sfx = {
  ctx: null,
  master: null,
  muted: false,
  init() {
    if (this.ctx) return;
    try {
      this.ctx = new (window.AudioContext || window.webkitAudioContext)();
      this.master = this.ctx.createGain();
      this.master.gain.value = 0.25;
      this.master.connect(this.ctx.destination);
    } catch (e) { this.ctx = null; }
  },
  toggle() {
    this.muted = !this.muted;
    if (this.master) this.master.gain.value = this.muted ? 0 : 0.25;
    return this.muted;
  },
  tone(freq, dur, type = 'square', vol = 0.3, slide = 0, delay = 0) {
    if (!this.ctx || this.muted) return;
    const t = this.ctx.currentTime + delay;
    const o = this.ctx.createOscillator();
    const g = this.ctx.createGain();
    o.type = type;
    o.frequency.setValueAtTime(freq, t);
    if (slide) o.frequency.exponentialRampToValueAtTime(Math.max(20, freq + slide), t + dur);
    g.gain.setValueAtTime(vol, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + dur);
    o.connect(g); g.connect(this.master);
    o.start(t); o.stop(t + dur + 0.02);
  },
  noise(dur, vol = 0.3, filterFreq = 1200) {
    if (!this.ctx || this.muted) return;
    const len = Math.floor(this.ctx.sampleRate * dur);
    const buf = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / len);
    const src = this.ctx.createBufferSource();
    src.buffer = buf;
    const f = this.ctx.createBiquadFilter();
    f.type = 'lowpass'; f.frequency.value = filterFreq;
    const g = this.ctx.createGain(); g.gain.value = vol;
    src.connect(f); f.connect(g); g.connect(this.master);
    src.start();
  },
  play(name) {
    switch (name) {
      case 'blaster': this.tone(880, 0.08, 'square', 0.12, -500); break;
      case 'shrink': this.tone(1200, 0.25, 'sine', 0.2, -1000); break;
      case 'freeze': this.tone(2000, 0.2, 'triangle', 0.15, -800); this.tone(2600, 0.15, 'sine', 0.08, -900, 0.05); break;
      case 'hypno': for (let i = 0; i < 4; i++) this.tone(400 + i * 120, 0.12, 'sine', 0.12, 60, i * 0.06); break;
      case 'burp': this.tone(110, 0.45, 'sawtooth', 0.35, -60); this.noise(0.3, 0.15, 400); break;
      case 'clone': this.tone(300, 0.3, 'square', 0.15, 900); break;
      case 'grenade': this.tone(500, 0.15, 'sine', 0.12, -200); break;
      case 'explode': this.noise(0.6, 0.5, 700); this.tone(80, 0.4, 'sine', 0.4, -40); break;
      case 'jet': this.noise(0.15, 0.1, 2500); break;
      case 'hit': this.tone(200, 0.08, 'square', 0.15, -120); break;
      case 'hurt': this.tone(160, 0.2, 'sawtooth', 0.25, -80); break;
      case 'pickup': this.tone(1046, 0.07, 'square', 0.1); this.tone(1568, 0.09, 'square', 0.1, 0, 0.05); break;
      case 'enemyShot': this.tone(500, 0.1, 'sawtooth', 0.08, -300); break;
      case 'honk': this.tone(330, 0.25, 'square', 0.2); this.tone(415, 0.25, 'square', 0.15); break;
      case 'missile': this.noise(0.25, 0.2, 1800); this.tone(300, 0.2, 'sawtooth', 0.1, 400); break;
      case 'bark': this.tone(600, 0.06, 'square', 0.15, -200); this.tone(500, 0.08, 'square', 0.15, -250, 0.09); break;
      case 'squish': this.tone(900, 0.12, 'sine', 0.2, -800); break;
      case 'mission': [523, 659, 784, 1046].forEach((f, i) => this.tone(f, 0.18, 'square', 0.12, 0, i * 0.11)); break;
      case 'step': this.tone(300, 0.1, 'triangle', 0.1, 200); break;
      case 'ui': this.tone(700, 0.05, 'square', 0.08); break;
      case 'error': this.tone(180, 0.15, 'square', 0.12); break;
      case 'engine': this.tone(70, 0.12, 'sawtooth', 0.05); break;
      case 'brainblast': [392, 523, 659, 784, 1046, 1318].forEach((f, i) => this.tone(f, 0.12, 'triangle', 0.12, 0, i * 0.05)); break;
    }
  },
};
