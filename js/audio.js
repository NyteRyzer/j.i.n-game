'use strict';
// Tiny WebAudio synth: every sound in the game is generated, no audio files.

const Sfx = {
  ctx: null,
  master: null,
  muted: false,
  sfxVol: 0.8,
  musicVol: 0.6,
  init() {
    if (this.ctx) { if (this.ctx.state === 'suspended') this.ctx.resume(); return; }
    try {
      this.ctx = new (window.AudioContext || window.webkitAudioContext)();
      this.master = this.ctx.createGain();
      this.master.connect(this.ctx.destination);
      Music.init(this.ctx);
      this.applyVolumes();
    } catch (e) { this.ctx = null; }
  },
  setVolumes(music, sfx) { this.musicVol = music; this.sfxVol = sfx; this.applyVolumes(); },
  applyVolumes() {
    if (!this.ctx) return;
    this.master.gain.value = this.muted ? 0 : 0.3 * this.sfxVol;
    Music.setVolume(this.muted ? 0 : this.musicVol);
  },
  toggle() {
    this.muted = !this.muted;
    this.applyVolumes();
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

// ---------------------------------------------------------------------------
// Procedural soundtrack: a tiny step sequencer with one loop per mood.
// Notes are MIDI numbers; 0 = rest. Each loop is 4 bars of 16 steps.
// ---------------------------------------------------------------------------
const mtof = (m) => 440 * Math.pow(2, (m - 69) / 12);
const MUSIC_TRACKS = {
  // Sunny Retroville: C - Am - F - G
  explore: {
    bpm: 116, chords: [[60, 64, 67], [57, 60, 64], [53, 57, 60], [55, 59, 62]],
    arp: [0, 1, 2, 1, 0, 1, 2, 1, 0, 1, 2, 1, 0, 2, 1, 2], arpOct: 12, arpVol: 0.05,
    bass: 'x...x.x.x...x.x.', kick: 'x.......x.......', snare: '....x.......x...', hat: '..x...x...x...x.',
    lead: [72, 0, 76, 0, 79, 0, 76, 0, 74, 0, 72, 0, 74, 0, 76, 0, 76, 0, 0, 0, 72, 0, 69, 0, 72, 0, 0, 0, 0, 0, 0, 0,
      69, 0, 72, 0, 77, 0, 76, 0, 74, 0, 72, 0, 69, 0, 72, 0, 74, 0, 0, 0, 71, 0, 74, 0, 79, 0, 0, 0, 77, 0, 74, 0],
    leadWave: 'square', leadVol: 0.045,
  },
  // Night: Am7 - Fmaj7 - C - G, soft pads and sparse plucks
  night: {
    bpm: 84, chords: [[57, 60, 64, 67], [53, 57, 60, 64], [48, 55, 60, 64], [55, 59, 62, 67]], pad: true,
    arp: [3, -1, 2, -1, 1, -1, 2, -1, 3, -1, 2, -1, 0, -1, -1, -1], arpOct: 12, arpVol: 0.035, arpWave: 'sine',
    bass: 'x.......x.......', hat: '........x.......',
  },
  // Enemies nearby: Am - F - G - E, driving
  combat: {
    bpm: 140, chords: [[57, 60, 64], [53, 57, 60], [55, 59, 62], [52, 56, 59]],
    arp: [0, 1, 2, 0, 1, 2, 0, 1, 2, 0, 1, 2, 2, 1, 0, 1], arpOct: 12, arpVol: 0.04,
    bass: 'x.xxx.xxx.xxx.xx', kick: 'x...x...x...x...', snare: '....x.......x..x', hat: 'xxxxxxxxxxxxxxxx',
    lead: [81, 0, 0, 79, 0, 0, 76, 0, 77, 0, 76, 0, 74, 0, 72, 0, 77, 0, 0, 76, 0, 0, 72, 0, 74, 0, 72, 0, 69, 0, 0, 0,
      79, 0, 0, 77, 0, 0, 74, 0, 76, 0, 74, 0, 71, 0, 74, 0, 76, 0, 0, 0, 80, 0, 0, 0, 83, 0, 81, 0, 80, 0, 76, 0],
    leadWave: 'sawtooth', leadVol: 0.03,
  },
  // Boss fight: Dm - Bb - C - A
  boss: {
    bpm: 152, chords: [[50, 53, 57], [46, 50, 53], [48, 52, 55], [45, 49, 52]],
    arp: [0, 2, 1, 2, 0, 2, 1, 2, 0, 2, 1, 2, 0, 1, 2, 1], arpOct: 24, arpVol: 0.035,
    bass: 'xxxxxxxxxxxxxxxx', kick: 'x.x.x.x.x.x.x.x.', snare: '....x.......x.x.', hat: 'x.xxx.xxx.xxx.xx',
    lead: [74, 0, 74, 0, 77, 0, 74, 0, 81, 0, 0, 0, 79, 0, 77, 0, 74, 0, 74, 0, 77, 0, 79, 0, 82, 0, 0, 0, 81, 0, 79, 0,
      76, 0, 76, 0, 79, 0, 76, 0, 84, 0, 0, 0, 82, 0, 81, 0, 79, 0, 77, 0, 76, 0, 73, 0, 76, 0, 0, 0, 0, 0, 0, 0],
    leadWave: 'sawtooth', leadVol: 0.035,
  },
  // Jimmy's lab: gadgety sine arpeggios
  lab: {
    bpm: 100, chords: [[60, 64, 67, 71], [62, 65, 69, 72], [57, 60, 64, 67], [55, 59, 62, 65]], pad: true,
    arp: [0, 1, 2, 3, 2, 1, 0, 1, 2, 3, 2, 1, 0, 2, 1, 3], arpOct: 12, arpVol: 0.04, arpWave: 'sine',
    bass: 'x.....x.x.......', hat: 'x...x...x...x...',
  },
};

const Music = {
  ctx: null, gain: null, track: null, want: 'explore', step: 0, nextTime: 0, vol: 0.6,
  init(ctx) {
    this.ctx = ctx;
    this.gain = ctx.createGain();
    this.gain.gain.value = 0;
    this.gain.connect(ctx.destination);
    this.nextTime = ctx.currentTime + 0.1;
  },
  setVolume(v) { this.vol = v; if (this.gain) this.gain.gain.setTargetAtTime(0.5 * v, this.ctx.currentTime, 0.3); },
  setMood(name) { if (MUSIC_TRACKS[name]) this.want = name; },
  // Called every frame; schedules a little ahead of the audio clock.
  update() {
    if (!this.ctx || this.vol <= 0) return;
    const ctx = this.ctx;
    if (this.nextTime < ctx.currentTime - 0.5) this.nextTime = ctx.currentTime + 0.05;
    while (this.nextTime < ctx.currentTime + 0.25) {
      if (this.step % 16 === 0 && this.want !== this.track) { this.track = this.want; this.step = 0; }
      const tr = MUSIC_TRACKS[this.track || this.want];
      const spb = 60 / tr.bpm / 4; // seconds per 16th
      this.playStep(tr, this.step % 64, this.nextTime, spb);
      this.nextTime += spb;
      this.step = (this.step + 1) % 64;
    }
  },
  playStep(tr, s, t, spb) {
    const bar = Math.floor(s / 16), i = s % 16, chord = tr.chords[bar];
    if (tr.pad && i === 0) for (const n of chord) this.note(mtof(n), t, spb * 16, 'sine', 0.025, 0.3);
    const a = tr.arp[i];
    if (a >= 0 && a < chord.length) this.note(mtof(chord[a] + tr.arpOct), t, spb * 0.9, tr.arpWave || 'square', tr.arpVol, 0.005, 1800);
    if (tr.bass && tr.bass[i] === 'x') this.note(mtof(chord[0] - 12), t, spb * 1.8, 'triangle', 0.16, 0.005);
    if (tr.lead && tr.lead[s]) this.note(mtof(tr.lead[s]), t, spb * 1.9, tr.leadWave, tr.leadVol, 0.01, 2600);
    if (tr.kick && tr.kick[i] === 'x') this.kick(t);
    if (tr.snare && tr.snare[i] === 'x') this.noise(t, 0.12, 0.09, 'highpass', 1500);
    if (tr.hat && tr.hat[i] === 'x') this.noise(t, 0.03, 0.03, 'highpass', 7000);
  },
  note(freq, t, dur, type, vol, attack = 0.01, cutoff = 0) {
    const ctx = this.ctx, o = ctx.createOscillator(), g = ctx.createGain();
    o.type = type; o.frequency.value = freq;
    g.gain.setValueAtTime(0.0001, t);
    g.gain.linearRampToValueAtTime(vol, t + attack);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    let out = o;
    if (cutoff) { const f = ctx.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = cutoff; o.connect(f); out = f; }
    out.connect(g); g.connect(this.gain);
    o.start(t); o.stop(t + dur + 0.05);
  },
  kick(t) {
    const ctx = this.ctx, o = ctx.createOscillator(), g = ctx.createGain();
    o.frequency.setValueAtTime(140, t); o.frequency.exponentialRampToValueAtTime(40, t + 0.12);
    g.gain.setValueAtTime(0.35, t); g.gain.exponentialRampToValueAtTime(0.0001, t + 0.18);
    o.connect(g); g.connect(this.gain); o.start(t); o.stop(t + 0.2);
  },
  noise(t, dur, vol, type, freq) {
    const ctx = this.ctx;
    if (!this.noiseBuf) {
      this.noiseBuf = ctx.createBuffer(1, ctx.sampleRate * 0.5, ctx.sampleRate);
      const d = this.noiseBuf.getChannelData(0);
      for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
    }
    const src = ctx.createBufferSource(), f = ctx.createBiquadFilter(), g = ctx.createGain();
    src.buffer = this.noiseBuf; f.type = type; f.frequency.value = freq;
    g.gain.setValueAtTime(vol, t); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    src.connect(f); f.connect(g); g.connect(this.gain);
    src.start(t); src.stop(t + dur + 0.02);
  },
};
