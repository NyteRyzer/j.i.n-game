'use strict';
// ---------------------------------------------------------------------------
// Procedural 3D models (Three.js), built in the show's style: big-headed kids,
// cel shading with ink outlines, chunky retro-futurist Retroville buildings.
// World units: 1 unit = 1 map tile. Models face +Z.
// ---------------------------------------------------------------------------

const GFX = { geos: new Map(), mats: new Map(), animators: [], windowMats: [], lampMats: [] };

const TOON_RAMP = (() => {
  const t = new THREE.DataTexture(new Uint8Array([110, 185, 255]), 3, 1, THREE.LuminanceFormat);
  t.minFilter = t.magFilter = THREE.NearestFilter; t.generateMipmaps = false; t.needsUpdate = true;
  return t;
})();

function geo(key, make) { let g = GFX.geos.get(key); if (!g) { g = make(); GFX.geos.set(key, g); } return g; }
function toon(color, extra) {
  const key = 't' + color + (extra ? JSON.stringify(extra) : '');
  let m = GFX.mats.get(key);
  if (!m) { m = new THREE.MeshToonMaterial(Object.assign({ color, gradientMap: TOON_RAMP }, extra || {})); GFX.mats.set(key, m); }
  return m;
}
function basic(color, extra) {
  const key = 'b' + color + (extra ? JSON.stringify(extra) : '');
  let m = GFX.mats.get(key);
  if (!m) { m = new THREE.MeshBasicMaterial(Object.assign({ color }, extra || {})); GFX.mats.set(key, m); }
  return m;
}
const INK = new THREE.MeshBasicMaterial({ color: 0x1b1530, side: THREE.BackSide });

const G_SPHERE = (w = 20, h = 14) => geo(`sph${w},${h}`, () => new THREE.SphereGeometry(1, w, h));
const G_BOX = () => geo('box', () => new THREE.BoxGeometry(1, 1, 1));
const G_CYL = (seg = 14) => geo('cyl' + seg, () => new THREE.CylinderGeometry(1, 1, 1, seg));
const G_CONE = (seg = 14) => geo('cone' + seg, () => new THREE.ConeGeometry(1, 1, seg));

// A mesh with position/scale in one call. `ink` adds a cartoon outline hull.
function mesh(geometry, material, pos, scale, opts = {}) {
  const m = new THREE.Mesh(geometry, material);
  if (pos) m.position.set(pos[0], pos[1], pos[2]);
  if (scale !== undefined && scale !== null) { if (typeof scale === 'number') m.scale.setScalar(scale); else m.scale.set(scale[0], scale[1], scale[2]); }
  if (opts.rot) m.rotation.set(opts.rot[0], opts.rot[1], opts.rot[2]);
  m.castShadow = opts.shadow !== false;
  if (opts.ink) { const o = new THREE.Mesh(geometry, INK); o.scale.setScalar(1 + opts.ink); m.add(o); }
  return m;
}
const box = (mat, x, y, z, sx, sy, sz, opts) => mesh(G_BOX(), mat, [x, y, z], [sx, sy, sz], opts);
const ball = (mat, x, y, z, r, opts) => mesh(G_SPHERE(), mat, [x, y, z], r, opts);
// Cylinder from radius & height, centred on (x,y,z)
const cyl = (mat, x, y, z, r, h, opts) => mesh(G_CYL(), mat, [x, y, z], [r, h, r], opts);

function labelTexture(text, { bg = '#1d2140', fg = '#ffffff', font = 'bold 44px Fredoka, "Trebuchet MS", sans-serif', pad = 22, border = null } = {}) {
  const c = document.createElement('canvas');
  const g = c.getContext('2d');
  g.font = font;
  const w = Math.ceil(g.measureText(text).width) + pad * 2;
  c.width = w; c.height = 72;
  g.font = font;
  g.fillStyle = bg; roundRect(g, 0, 0, w, 72, 18); g.fill();
  if (border) { g.strokeStyle = border; g.lineWidth = 6; roundRect(g, 3, 3, w - 6, 66, 16); g.stroke(); }
  g.fillStyle = fg; g.textAlign = 'center'; g.textBaseline = 'middle';
  g.fillText(text, w / 2, 38);
  const t = new THREE.CanvasTexture(c);
  t.anisotropy = 4;
  return { tex: t, aspect: w / 72 };
}
function signMesh(text, height, opts) {
  const { tex, aspect } = labelTexture(text, opts);
  const m = new THREE.Mesh(new THREE.PlaneGeometry(height * aspect, height), new THREE.MeshBasicMaterial({ map: tex, transparent: true }));
  return m;
}

// ---------------------------------------------------------------------------
// People
// ---------------------------------------------------------------------------
function jimmySwirlGeometry(r) {
  // The famous soft-serve swirl: a lathe that tapers to a forward-curling tip.
  return geo('swirl' + r, () => {
    const prof = [[0.86, 0], [0.9, 0.16], [0.84, 0.38], [0.68, 0.62], [0.5, 0.86], [0.32, 1.06], [0.16, 1.2], [0.04, 1.28], [0, 1.3]];
    return new THREE.LatheGeometry(prof.map(([x, y]) => new THREE.Vector2(x * r, y * r)), 28);
  });
}
function jimmySwirlGroove(r) {
  return geo('groove' + r, () => {
    const prof = (h) => { // radius of the lathe at height h (0..1.3)
      const P = [[0, 0.86], [0.16, 0.9], [0.38, 0.84], [0.62, 0.68], [0.86, 0.5], [1.06, 0.32], [1.2, 0.16], [1.28, 0.04]];
      for (let i = 1; i < P.length; i++) if (h <= P[i][0]) { const t = (h - P[i - 1][0]) / (P[i][0] - P[i - 1][0]); return lerp(P[i - 1][1], P[i][1], t); }
      return 0.02;
    };
    const pts = [];
    for (let i = 0; i <= 160; i++) {
      const t = i / 160, h = 0.08 + t * 1.15, a = t * Math.PI * 2 * 3.6;
      const rr = prof(h) * 1.01;
      pts.push(new THREE.Vector3(Math.cos(a) * rr * r, h * r, Math.sin(a) * rr * r));
    }
    return new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), 220, r * 0.05, 6, false);
  });
}

function makeCharacter(L) {
  const h = L.height || 1, w = L.wide || 1;
  const kid = h < 1.2;
  const legLen = 0.3 * h, torsoLen = 0.33 * h;
  const hr = (kid ? 0.25 : 0.2) * (L.headScale || 1);
  const ink = 0.06;
  const skin = toon(L.skin), shirt = toon(L.shirt), pants = toon(L.pants), hairM = toon(L.hair), shoe = toon(L.shoes || '#f5f5f5');

  const root = new THREE.Group();
  const body = new THREE.Group(); root.add(body);
  const parts = { root, body };

  const mkLeg = (side) => {
    const g = new THREE.Group(); g.position.set(side * 0.085 * w, legLen, 0);
    g.add(cyl(pants, 0, -legLen / 2, 0, 0.07 * w, legLen));
    g.add(box(shoe, 0, -legLen + 0.04, 0.04, 0.13, 0.08, 0.22, { ink: 0.1 }));
    body.add(g); return g;
  };
  parts.legL = mkLeg(-1); parts.legR = mkLeg(1);

  // torso
  if (L.dress) body.add(mesh(G_CYL(), shirt, [0, legLen + torsoLen * 0.4, 0], [0.24 * w, torsoLen * 1.25, 0.24 * w], { ink }));
  body.add(cyl(pants, 0, legLen + 0.03, 0, 0.17 * w, 0.08));
  const torso = mesh(geo('torso', () => new THREE.CylinderGeometry(0.85, 1, 1, 16)), shirt, [0, legLen + torsoLen / 2 + 0.02, 0], [0.17 * w, torsoLen, 0.15 * w], { ink });
  body.add(torso);
  if (L.apron) body.add(box(toon('#ffb0c8'), 0, legLen + torsoLen * 0.45, 0.14 * w, 0.24 * w, torsoLen * 0.85, 0.02));
  if (L.vest) body.add(box(toon(L.vest), 0, legLen + torsoLen * 0.55, 0.135 * w, 0.26 * w, torsoLen * 0.7, 0.03));
  if (L.logo === 'atom') {
    const atom = new THREE.Group(); atom.position.set(0, legLen + torsoLen * 0.62, 0.155 * w);
    const yel = basic('#ffd52e');
    for (let k = 0; k < 3; k++) {
      const og = new THREE.Group(); og.rotation.z = (k * Math.PI) / 3;
      og.add(mesh(geo('orbit', () => new THREE.TorusGeometry(0.07, 0.009, 6, 24)), yel, [0, 0, 0], [1, 0.38, 1], { shadow: false }));
      atom.add(og);
    }
    atom.add(ball(yel, 0, 0, 0.005, 0.022, { shadow: false }));
    body.add(atom);
  }
  if (L.logo === 'ultra') body.add(box(toon('#ffd52e'), 0, legLen + torsoLen * 0.6, 0.15 * w, 0.12, 0.12, 0.01));

  const mkArm = (side) => {
    const g = new THREE.Group(); g.position.set(side * (0.17 * w + 0.05), legLen + torsoLen * 0.9, 0); g.rotation.z = side * 0.15;
    g.add(cyl(shirt, 0, -0.06, 0, 0.055, 0.13));
    g.add(cyl(skin, 0, -0.17, 0, 0.045, 0.16));
    g.add(ball(skin, 0, -0.27, 0, 0.055));
    body.add(g); return g;
  };
  parts.armL = mkArm(-1); parts.armR = mkArm(1);
  parts.hand = new THREE.Group(); parts.hand.position.set(0, -0.28, 0.04); parts.armR.add(parts.hand);

  // head
  const head = new THREE.Group(); head.position.set(0, legLen + torsoLen + hr * 0.92, 0);
  body.add(head); parts.head = head;
  head.add(ball(skin, 0, 0, 0, hr, { ink }));
  head.add(cyl(skin, 0, -hr * 0.9, 0, 0.05, 0.12));
  head.add(mesh(G_SPHERE(), skin, [-hr, 0, 0], [0.025, 0.05, 0.04]));
  head.add(mesh(G_SPHERE(), skin, [hr, 0, 0], [0.025, 0.05, 0.04]));
  const eyeR = kid ? 0.085 : 0.06;
  const white = toon('#ffffff'), black = basic('#15121f');
  for (const s of [-1, 1]) {
    head.add(mesh(G_SPHERE(), white, [s * hr * 0.36, hr * 0.12, hr * 0.8], [eyeR, eyeR * 1.15, eyeR * 0.6], { ink: 0.12 }));
    head.add(ball(black, s * hr * 0.34, hr * 0.12, hr * 0.8 + eyeR * 0.5, eyeR * 0.42, { shadow: false }));
    head.add(ball(basic('#ffffff'), s * hr * 0.34 + 0.012, hr * 0.12 + 0.02, hr * 0.8 + eyeR * 0.68, eyeR * 0.13, { shadow: false }));
  }
  head.add(ball(skin, 0, -hr * 0.12, hr * 0.98, hr * 0.12));
  head.add(mesh(geo('smile', () => new THREE.TorusGeometry(0.07, 0.014, 6, 14, Math.PI)), black, [0, -hr * 0.42, hr * 0.84], [hr * 4.5, hr * 4.5, hr * 4.5], { rot: [0.2, 0, Math.PI], shadow: false }));
  if (L.glasses) {
    const fr = basic('#2a2a3a');
    for (const s of [-1, 1]) head.add(mesh(geo('lens', () => new THREE.TorusGeometry(1, 0.13, 6, 20)), fr, [s * hr * 0.36, hr * 0.12, hr * 0.8 + eyeR * 0.65], eyeR * 1.15, { shadow: false }));
    head.add(box(fr, 0, hr * 0.14, hr * 0.8 + eyeR * 0.65, hr * 0.25, 0.014, 0.014, { shadow: false }));
  }

  // hair: a cap tilted back off the forehead, plus a back piece that covers the back of the skull
  const cap = (scaleY = 1, coverage = 0.48) => mesh(geo('cap' + coverage, () => new THREE.SphereGeometry(1, 20, 12, 0, Math.PI * 2, 0, Math.PI * coverage)), hairM, [0, 0, -hr * 0.04], [hr * 1.06, hr * 1.06 * scaleY, hr * 1.06], { ink, rot: [-0.25, 0, 0] });
  if (L.hairStyle !== 'bald') head.add(mesh(geo('backhair', () => new THREE.SphereGeometry(1, 16, 12, Math.PI * 1.08, Math.PI * 0.84, 0, Math.PI * 0.74)), hairM, [0, 0, -hr * 0.02], hr * 1.05, { ink }));
  switch (L.hairStyle) {
    case 'jimmy': {
      head.add(cap(1, 0.42));
      const swirl = new THREE.Group(); swirl.position.set(0, hr * 0.45, -hr * 0.08); swirl.rotation.x = 0.28;
      swirl.add(mesh(jimmySwirlGeometry(hr), hairM, [0, 0, 0], 1, { ink: 0.04 }));
      swirl.add(mesh(jimmySwirlGroove(hr), toon(shade(L.hair, -28)), [0, 0, 0], 1, { shadow: false }));
      // tip curl over the forehead
      swirl.add(mesh(geo('curl', () => new THREE.TorusGeometry(1, 0.42, 8, 16, Math.PI * 1.3)), hairM, [0, hr * 1.24, hr * 0.12], hr * 0.16, { rot: [0, Math.PI / 2, 0.4], ink: 0.12 }));
      head.add(swirl);
      // front flick
      head.add(mesh(G_CONE(), hairM, [hr * 0.1, hr * 0.62, hr * 0.72], [hr * 0.22, hr * 0.5, hr * 0.15], { rot: [1.1, 0, -0.4], ink: 0.1 }));
      break;
    }
    case 'spiky': {
      head.add(cap(0.8));
      for (let k = 0; k < 9; k++) {
        const a = (k / 9) * Math.PI * 2, tilt = 0.55;
        head.add(mesh(G_CONE(6), hairM, [Math.cos(a) * hr * 0.45, hr * 0.85, Math.sin(a) * hr * 0.45 - hr * 0.1], [hr * 0.22, hr * 0.9, hr * 0.22], { rot: [Math.sin(a) * tilt, 0, -Math.cos(a) * tilt], ink: 0.1 }));
      }
      head.add(mesh(G_CONE(6), hairM, [0, hr * 1.1, -hr * 0.1], [hr * 0.25, hr, hr * 0.25]));
      break;
    }
    case 'curly':
      for (let k = 0; k < 11; k++) { const a = (k / 11) * Math.PI * 2; head.add(ball(hairM, Math.cos(a) * hr * 0.62, hr * 0.62 + (k % 2) * hr * 0.08, Math.sin(a) * hr * 0.62 - hr * 0.08, hr * 0.32, { ink: 0.1 })); }
      head.add(ball(hairM, 0, hr * 0.85, -hr * 0.05, hr * 0.45, { ink: 0.08 }));
      break;
    case 'ponytail':
      head.add(cap(1.05, 0.52));
      head.add(mesh(G_SPHERE(), hairM, [0, hr * 0.35, -hr * 1.15], [hr * 0.34, hr * 0.5, hr * 0.34], { rot: [0.6, 0, 0], ink: 0.1 }));
      head.add(mesh(geo('band', () => new THREE.TorusGeometry(1, 0.35, 6, 14)), toon('#ff6fa8'), [0, hr * 0.55, -hr * 0.95], hr * 0.15, { rot: [0.9, 0, 0] }));
      break;
    case 'headband':
      head.add(cap(1.1, 0.5));
      head.add(ball(hairM, 0, hr * 0.75, -hr * 0.4, hr * 0.6, { ink: 0.08 }));
      head.add(mesh(geo('hb', () => new THREE.TorusGeometry(1, 0.06, 6, 24)), toon('#ff5fa2'), [0, hr * 0.42, -hr * 0.05], hr * 1.02, { rot: [Math.PI / 2 - 0.35, 0, 0] }));
      break;
    case 'beehive':
      head.add(cap(1, 0.5));
      head.add(mesh(G_SPHERE(), hairM, [0, hr * 1.35, -hr * 0.1], [hr * 0.85, hr * 1.4, hr * 0.85], { ink: 0.06 }));
      break;
    case 'bun':
      head.add(cap(1, 0.5)); head.add(ball(hairM, 0, hr * 0.95, -hr * 0.3, hr * 0.42, { ink: 0.08 })); break;
    case 'buzz': head.add(cap(0.95, 0.44)); break;
    case 'swoop':
      head.add(cap(1, 0.5));
      head.add(mesh(G_SPHERE(), hairM, [hr * 0.15, hr * 0.75, hr * 0.25], [hr * 0.95, hr * 0.42, hr * 0.8], { rot: [0.2, 0, -0.25], ink: 0.08 }));
      break;
    case 'bald':
      head.add(mesh(G_SPHERE(), hairM, [-hr * 0.9, hr * 0.1, -hr * 0.2], [hr * 0.18, hr * 0.3, hr * 0.4]));
      head.add(mesh(G_SPHERE(), hairM, [hr * 0.9, hr * 0.1, -hr * 0.2], [hr * 0.18, hr * 0.3, hr * 0.4]));
      break;
    default: head.add(cap());
  }
  if (L.mustache) head.add(mesh(G_SPHERE(), hairM, [0, -hr * 0.3, hr * 0.92], [hr * 0.4, hr * 0.1, hr * 0.12]));
  parts.height = legLen + torsoLen + hr * 2.4 + (L.hairStyle === 'beehive' ? hr * 2 : L.hairStyle === 'jimmy' ? hr * 1.5 : 0);
  return parts;
}

function animateCharacter(c, phase, moving, dt) {
  const amp = moving ? 0.75 : 0;
  const s = Math.sin(phase) * amp;
  c.legL.rotation.x = lerp(c.legL.rotation.x, s, Math.min(1, dt * 14));
  c.legR.rotation.x = lerp(c.legR.rotation.x, -s, Math.min(1, dt * 14));
  c.armL.rotation.x = lerp(c.armL.rotation.x, -s * 0.8, Math.min(1, dt * 14));
  if (!c.aiming) c.armR.rotation.x = lerp(c.armR.rotation.x, s * 0.8, Math.min(1, dt * 14));
  c.body.position.y = moving ? Math.abs(Math.cos(phase)) * 0.04 : 0;
}

// ---------------------------------------------------------------------------
// Goddard
// ---------------------------------------------------------------------------
function makeGoddard() {
  const root = new THREE.Group(), body = new THREE.Group(); root.add(body);
  const metal = toon('#c3cad6'), dark = toon('#5c6474'), black = basic('#15121f');
  body.add(mesh(G_CYL(), metal, [0, 0.36, 0], [0.15, 0.42, 0.15], { rot: [Math.PI / 2, 0, 0], ink: 0.08 }));
  body.add(ball(metal, 0, 0.36, 0.21, 0.15)); body.add(ball(metal, 0, 0.36, -0.21, 0.15));
  body.add(box(toon('#3fe0ff', { emissive: '#0d4a55' }), 0.155, 0.38, 0, 0.01, 0.1, 0.18, { shadow: false }));
  body.add(box(toon('#3fe0ff', { emissive: '#0d4a55' }), -0.155, 0.38, 0, 0.01, 0.1, 0.18, { shadow: false }));
  const legs = [];
  for (const [x, z] of [[-0.1, 0.18], [0.1, 0.18], [-0.1, -0.18], [0.1, -0.18]]) {
    const g = new THREE.Group(); g.position.set(x, 0.3, z);
    g.add(cyl(dark, 0, -0.14, 0, 0.035, 0.28)); g.add(ball(metal, 0, -0.28, 0.02, 0.05));
    body.add(g); legs.push(g);
  }
  const head = new THREE.Group(); head.position.set(0, 0.58, 0.28); body.add(head);
  head.add(mesh(G_SPHERE(), metal, [0, 0, 0], [0.17, 0.15, 0.17], { ink: 0.08 }));
  head.add(box(toon('#dfe4ec'), 0, -0.04, 0.15, 0.15, 0.1, 0.16, { ink: 0.1 }));
  head.add(ball(black, 0, -0.01, 0.235, 0.035));
  for (const s of [-1, 1]) {
    head.add(mesh(G_SPHERE(), black, [s * 0.07, 0.05, 0.13], [0.035, 0.05, 0.03]));
    head.add(ball(basic('#7ff0ff'), s * 0.07 + 0.01, 0.07, 0.155, 0.01, { shadow: false }));
  }
  const ears = [];
  for (const s of [-1, 1]) {
    const e = new THREE.Group(); e.position.set(s * 0.15, 0.08, -0.02); e.rotation.z = s * 0.5;
    e.add(box(toon('#9aa6bc'), s * 0.02, -0.1, 0, 0.03, 0.22, 0.12, { ink: 0.15 }));
    head.add(e); ears.push(e);
  }
  const tail = new THREE.Group(); tail.position.set(0, 0.42, -0.34); tail.rotation.x = -0.7; body.add(tail);
  tail.add(cyl(dark, 0, 0.15, 0, 0.015, 0.3)); tail.add(ball(basic('#ff4040'), 0, 0.31, 0, 0.04));
  return { root, body, head, legs, ears, tail, height: 0.9 };
}

// ---------------------------------------------------------------------------
// Enemies
// ---------------------------------------------------------------------------
function eyePair(parent, y, z, r, spread, pupilMat) {
  const white = toon('#ffffff'), pupils = [];
  for (const s of [-1, 1]) {
    parent.add(mesh(G_SPHERE(), white, [s * spread, y, z], [r, r * 1.1, r * 0.7], { ink: 0.1 }));
    const p = ball(pupilMat || basic('#15121f'), s * spread * 0.95, y, z + r * 0.55, r * 0.45, { shadow: false });
    parent.add(p); pupils.push(p);
  }
  return pupils;
}

function makeEnemyModel(type) {
  const root = new THREE.Group(), body = new THREE.Group(); root.add(body);
  const r = { root, body, height: 1 };
  switch (type) {
    case 'twonky': {
      body.add(mesh(geo('ico1', () => new THREE.IcosahedronGeometry(1, 1)), toon('#f2a33a', { flatShading: true }), [0, 0.32, 0], 0.3, { ink: 0.06 }));
      body.add(mesh(geo('ico0', () => new THREE.IcosahedronGeometry(1, 0)), toon('#d88a2a', { flatShading: true }), [0, 0.32, 0], 0.34, { rot: [0.4, 0.3, 0] }));
      body.add(mesh(G_SPHERE(), toon('#ffd9a0'), [0, 0.26, 0.17], [0.18, 0.14, 0.1]));
      for (const s of [-1, 1]) body.add(mesh(G_CONE(6), toon('#f2a33a'), [s * 0.17, 0.62, 0], [0.08, 0.2, 0.06], { rot: [0, 0, -s * 0.4], ink: 0.1 }));
      r.pupils = eyePair(body, 0.4, 0.22, 0.11, 0.11);
      r.height = 0.75;
      break;
    }
    case 'yokian': {
      body.add(mesh(G_CYL(), toon('#7d8696'), [0, 0.2, 0], [0.32, 0.08, 0.32], { ink: 0.06 }));
      body.add(mesh(G_CYL(), basic('#3fe0ff'), [0, 0.15, 0], [0.24, 0.02, 0.24], { shadow: false }));
      body.add(mesh(G_SPHERE(), toon('#8fe86a'), [0, 0.58, 0], [0.22, 0.32, 0.22], { ink: 0.06 }));
      body.add(mesh(geo('collar', () => new THREE.TorusGeometry(1, 0.25, 8, 20)), toon('#7a3fb0'), [0, 0.36, 0], 0.18, { rot: [Math.PI / 2, 0, 0] }));
      r.pupils = eyePair(body, 0.7, 0.17, 0.07, 0.08);
      for (const s of [-1, 1]) {
        const pts = [new THREE.Vector3(s * 0.18, 0.5, 0), new THREE.Vector3(s * 0.32, 0.45, 0.08), new THREE.Vector3(s * 0.3, 0.32, 0.2)];
        body.add(mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), 8, 0.035, 6), toon('#7bd85a'), null, null));
      }
      r.height = 1.0;
      break;
    }
    case 'saucer': {
      body.add(mesh(G_CYL(24), toon('#5f6e5f'), [0, 0, 0], [1, 0.14, 1], { ink: 0.03 }));
      body.add(mesh(geo('saucerTop', () => new THREE.CylinderGeometry(0.75, 1.05, 0.22, 24)), toon('#9be37a'), [0, 0.15, 0], 1));
      body.add(mesh(geo('dome', () => new THREE.SphereGeometry(1, 20, 10, 0, Math.PI * 2, 0, Math.PI / 2)), toon('#c8ffe0', { transparent: true, opacity: 0.55 }), [0, 0.25, 0], 0.5, { shadow: false }));
      body.add(mesh(G_SPHERE(), toon('#8fe86a'), [0, 0.42, 0], [0.16, 0.22, 0.16]));
      r.lights = [];
      for (let k = 0; k < 10; k++) { const a = (k / 10) * Math.PI * 2; const l = ball(basic('#ffe14f'), Math.cos(a) * 1.0, 0.02, Math.sin(a) * 1.0, 0.06, { shadow: false }); body.add(l); r.lights.push(l); }
      body.add(mesh(G_CYL(), basic('#7aff6a', { transparent: true, opacity: 0.25 }), [0, -0.8, 0], [0.5, 1.5, 0.5], { shadow: false }));
      r.height = 2.8;
      break;
    }
    case 'robot': case 'ultrabot': {
      const main = type === 'robot' ? '#8a8fa0' : '#a63a3a', acc = type === 'robot' ? '#5a4a6a' : '#e0c050', s = type === 'robot' ? 1 : 1.5;
      body.scale.setScalar(s);
      for (const x of [-0.17, 0.17]) body.add(box(toon('#2e2e3c'), x, 0.1, 0, 0.14, 0.2, 0.4, { ink: 0.06 }));
      body.add(box(toon(main), 0, 0.55, 0, 0.5, 0.55, 0.38, { ink: 0.05 }));
      body.add(box(toon(acc), 0, 0.42, 0, 0.52, 0.08, 0.4));
      body.add(box(toon(main), 0, 0.96, 0, 0.34, 0.26, 0.3, { ink: 0.06 }));
      body.add(box(basic('#25202e'), 0, 0.97, 0.15, 0.26, 0.1, 0.02, { shadow: false }));
      r.eye = ball(basic('#ff3030'), 0, 0.97, 0.17, 0.045, { shadow: false }); body.add(r.eye);
      body.add(cyl(toon('#5c6474'), 0, 1.2, 0, 0.015, 0.22)); body.add(ball(basic('#ffb23f'), 0, 1.32, 0, 0.045));
      r.arms = [];
      for (const sd of [-1, 1]) { const a = new THREE.Group(); a.position.set(sd * 0.32, 0.72, 0); a.add(box(toon(main), 0, -0.18, 0, 0.12, 0.36, 0.12, { ink: 0.08 })); a.add(box(toon('#5c6474'), 0, -0.4, 0.02, 0.16, 0.1, 0.16)); body.add(a); r.arms.push(a); }
      r.glow = box(basic('#ff3030', { transparent: true, opacity: 0.35 }), 0, 0.6, 0, 0.6, 1.2, 0.5, { shadow: false }); r.glow.visible = false; body.add(r.glow);
      r.height = 1.45 * s;
      break;
    }
    case 'nanobot': {
      body.add(ball(toon('#c8d0dc'), 0, 0.14, 0, 0.1, { ink: 0.1 }));
      body.add(ball(basic('#ff3030'), 0, 0.15, 0.08, 0.035, { shadow: false }));
      for (let k = 0; k < 4; k++) { const a = (k / 4) * Math.PI * 2 + 0.78; body.add(mesh(G_CYL(5), toon('#7d8696'), [Math.cos(a) * 0.1, 0.06, Math.sin(a) * 0.1], [0.012, 0.14, 0.012], { rot: [Math.sin(a) * 0.9, 0, -Math.cos(a) * 0.9], shadow: false })); }
      r.height = 0.35;
      break;
    }
    case 'dummy': {
      body.add(cyl(toon('#6b4a2a'), 0, 0.3, 0, 0.04, 0.6));
      body.add(mesh(G_CYL(), toon('#d9b77a'), [0, 0.85, 0], [0.24, 0.6, 0.2], { ink: 0.06 }));
      body.add(ball(toon('#d9b77a'), 0, 1.3, 0, 0.17, { ink: 0.08 }));
      body.add(mesh(geo('target', () => new THREE.CircleGeometry(1, 20)), basic('#ffffff'), [0, 0.9, 0.205], 0.15, { shadow: false }));
      body.add(mesh(geo('target', () => new THREE.CircleGeometry(1, 20)), basic('#e2312f'), [0, 0.9, 0.21], 0.1, { shadow: false }));
      body.add(mesh(geo('target', () => new THREE.CircleGeometry(1, 20)), basic('#ffffff'), [0, 0.9, 0.215], 0.045, { shadow: false }));
      r.height = 1.55;
      break;
    }
    case 'goobot': {
      // King Goobot in his royal egg-ship
      body.add(mesh(G_SPHERE(28, 16), toon('#4f5f4f'), [0, 0, 0], [2.2, 0.45, 2.2], { ink: 0.02 }));
      body.add(mesh(G_SPHERE(28, 16), toon('#9be37a'), [0, 0.12, 0], [2.0, 0.4, 2.0]));
      body.add(mesh(geo('dome', () => new THREE.SphereGeometry(1, 20, 10, 0, Math.PI * 2, 0, Math.PI / 2)), toon('#c8ffe0', { transparent: true, opacity: 0.4 }), [0, 0.35, 0], 1.25, { shadow: false }));
      const king = new THREE.Group(); king.position.y = 0.35; body.add(king);
      king.add(mesh(G_SPHERE(), toon('#8fe86a'), [0, 0.65, 0], [0.42, 0.62, 0.42], { ink: 0.05 }));
      king.add(mesh(geo('collar', () => new THREE.TorusGeometry(1, 0.25, 8, 20)), toon('#7a3fb0'), [0, 0.2, 0], 0.4, { rot: [Math.PI / 2, 0, 0] }));
      for (let k = -2; k <= 2; k++) king.add(mesh(G_CONE(4), toon('#b04fd8'), [k * 0.12, 1.25 - Math.abs(k) * 0.06, -0.08], [0.06, 0.45 - Math.abs(k) * 0.07, 0.12], { rot: [-0.3, 0, k * 0.25], ink: 0.08 }));
      r.pupils = eyePair(king, 0.85, 0.34, 0.12, 0.15);
      r.lights = [];
      for (let k = 0; k < 14; k++) { const a = (k / 14) * Math.PI * 2; const l = ball(basic('#ffe14f'), Math.cos(a) * 2.05, 0.1, Math.sin(a) * 2.05, 0.09, { shadow: false }); body.add(l); r.lights.push(l); }
      r.height = 4.2;
      break;
    }
    case 'megabot': {
      const purple = toon('#6a4a8a'), dark = toon('#2a2a38');
      for (const x of [-0.45, 0.45]) { body.add(box(dark, x, 0.45, 0, 0.36, 0.9, 0.5, { ink: 0.04 })); body.add(box(purple, x, 0.08, 0.08, 0.48, 0.16, 0.7)); }
      body.add(box(purple, 0, 1.55, 0, 1.6, 1.3, 1.0, { ink: 0.03 }));
      body.add(box(toon('#4a3a6a'), 0, 1.05, 0, 1.62, 0.12, 1.02));
      const face = new THREE.Mesh(new THREE.PlaneGeometry(0.9, 0.62), new THREE.MeshBasicMaterial({ map: calamitousFaceTexture() }));
      face.position.set(0, 1.68, 0.51); body.add(face);
      r.arms = [];
      for (const s of [-1, 1]) {
        const a = new THREE.Group(); a.position.set(s * 1.0, 1.8, 0);
        a.add(box(purple, 0, -0.35, 0, 0.32, 0.8, 0.32, { ink: 0.05 }));
        a.add(mesh(G_CYL(), dark, [0, -0.8, 0.15], [0.16, 0.4, 0.16], { rot: [Math.PI / 2, 0, 0] }));
        a.add(ball(basic('#ff8a2a'), 0, -0.8, 0.36, 0.1, { shadow: false }));
        body.add(a); r.arms.push(a);
      }
      body.add(box(basic('#ffb23f'), 0, 2.28, 0, 0.12, 0.2, 0.12));
      r.glow = box(basic('#ff3030', { transparent: true, opacity: 0.3 }), 0, 1.4, 0, 1.9, 2.8, 1.3, { shadow: false }); r.glow.visible = false; body.add(r.glow);
      r.height = 2.6;
      break;
    }
  }
  // status overlays
  r.ice = mesh(G_BOX(), toon('#a8ecff', { transparent: true, opacity: 0.55 }), [0, r.height * 0.45, 0], [0.9, r.height * 0.95, 0.9], { shadow: false });
  r.ice.visible = false; root.add(r.ice);
  r.hypno = mesh(geo('hyp', () => new THREE.TorusGeometry(0.18, 0.03, 6, 20)), basic('#c36bff'), [0, r.height + 0.25, 0], 1, { rot: [Math.PI / 2, 0, 0], shadow: false });
  r.hypno.visible = false; root.add(r.hypno);
  return r;
}

function calamitousFaceTexture() {
  const c = document.createElement('canvas'); c.width = 180; c.height = 124;
  const g = c.getContext('2d');
  g.fillStyle = '#10121e'; g.fillRect(0, 0, 180, 124);
  g.fillStyle = '#3fe0ff22'; for (let y = 0; y < 124; y += 4) g.fillRect(0, y, 180, 1);
  g.fillStyle = '#f2c9a0'; g.beginPath(); g.ellipse(90, 66, 40, 50, 0, 0, 7); g.fill();
  g.fillStyle = '#d8d8e0'; g.beginPath(); g.ellipse(52, 60, 9, 18, 0, 0, 7); g.ellipse(128, 60, 9, 18, 0, 0, 7); g.fill();
  g.strokeStyle = '#1a1a1a'; g.lineWidth = 4; g.beginPath(); g.arc(74, 62, 12, 0, 7); g.moveTo(118, 62); g.arc(106, 62, 12, 0, 7); g.moveTo(86, 62); g.lineTo(94, 62); g.stroke();
  g.lineWidth = 5; g.beginPath(); g.moveTo(60, 44); g.lineTo(84, 50); g.moveTo(120, 44); g.lineTo(96, 50); g.stroke();
  g.lineWidth = 3; g.beginPath(); g.arc(90, 100, 12, Math.PI * 1.15, Math.PI * 1.85); g.stroke();
  const t = new THREE.CanvasTexture(c); return t;
}

// ---------------------------------------------------------------------------
// Vehicles
// ---------------------------------------------------------------------------
function seatedJimmy(scale) {
  const c = makeCharacter(LOOKS.jimmy);
  c.legL.rotation.x = c.legR.rotation.x = -1.4;
  c.armL.rotation.x = c.armR.rotation.x = -0.9;
  c.root.scale.setScalar(scale);
  return c;
}
function makeVehicleModel(kind) {
  const root = new THREE.Group(), body = new THREE.Group(); root.add(body);
  const r = { root, body };
  if (kind === 'hovercar') {
    const blue = toon('#3fa7ff'), deep = toon('#2a6fc0'), chrome = toon('#e8eef8');
    body.add(mesh(G_SPHERE(24, 14), blue, [0, 0.45, 0], [0.62, 0.28, 0.95], { ink: 0.03 }));
    body.add(box(deep, 0, 0.36, 0, 1.1, 0.14, 1.5, { ink: 0.04 }));
    body.add(mesh(G_SPHERE(20, 10), toon('#cdf3ff', { transparent: true, opacity: 0.5 }), [0, 0.68, -0.05], [0.45, 0.25, 0.5], { shadow: false }));
    for (const s of [-1, 1]) {
      body.add(mesh(G_CONE(4), deep, [s * 0.5, 0.65, -0.7], [0.08, 0.5, 0.25], { rot: [-0.5, 0, s * 0.2], ink: 0.08 }));
      body.add(ball(basic('#fff6c8'), s * 0.32, 0.45, 0.88, 0.07, { shadow: false }));
      body.add(ball(basic('#ff4040'), s * 0.4, 0.42, -0.86, 0.05, { shadow: false }));
    }
    body.add(box(chrome, 0, 0.36, 0.78, 0.9, 0.06, 0.08));
    r.glow = mesh(geo('padring', () => new THREE.TorusGeometry(0.5, 0.06, 6, 24)), basic('#3fe0ff'), [0, 0.18, 0], [1.1, 1.6, 1], { rot: [Math.PI / 2, 0, 0], shadow: false });
    body.add(r.glow);
    r.driver = seatedJimmy(0.85); r.driver.root.position.set(0, 0.38, -0.05); body.add(r.driver.root);
  } else if (kind === 'rocket') {
    const white = toon('#eef2f8'), red = toon('#e2312f');
    const craft = new THREE.Group(); body.add(craft); r.craft = craft;
    craft.add(mesh(G_CYL(20), white, [0, 0, 0], [0.38, 1.7, 0.38], { rot: [Math.PI / 2, 0, 0], ink: 0.04 }));
    craft.add(mesh(G_CONE(20), red, [0, 0, 1.25], [0.38, 0.8, 0.38], { rot: [Math.PI / 2, 0, 0], ink: 0.04 }));
    craft.add(mesh(G_CYL(20), red, [0, 0, -0.55], [0.4, 0.18, 0.4], { rot: [Math.PI / 2, 0, 0] }));
    craft.add(mesh(G_CONE(12), toon('#5c6474'), [0, 0, -0.95], [0.26, 0.25, 0.26], { rot: [-Math.PI / 2, 0, 0] }));
    for (let k = 0; k < 3; k++) {
      const a = (k / 3) * Math.PI * 2 + Math.PI / 2;
      const f = box(red, Math.cos(a) * 0.48, Math.sin(a) * 0.48, -0.6, 0.06, 0.5, 0.55, { ink: 0.08 });
      f.rotation.z = a - Math.PI / 2; f.scale.set(0.06, 0.5, 0.55);
      f.position.set(Math.cos(a) * 0.48, Math.sin(a) * 0.48, -0.6);
      // orient fin outward
      f.rotation.set(0, 0, a + Math.PI / 2);
      craft.add(f);
    }
    craft.add(mesh(G_SPHERE(), toon('#7ff0ff', { transparent: true, opacity: 0.75 }), [0, 0.3, 0.45], [0.22, 0.18, 0.32], { shadow: false }));
    const decal = signMesh('STRATO XL', 0.16, { bg: '#e2312f', fg: '#fff' });
    decal.position.set(0.39, 0, 0.1); decal.rotation.y = Math.PI / 2; craft.add(decal);
    r.flame = mesh(G_CONE(10), basic('#ffb23f', { transparent: true, opacity: 0.85 }), [0, 0, -1.4], [0.22, 0.8, 0.22], { rot: [-Math.PI / 2, 0, 0], shadow: false });
    craft.add(r.flame);
  } else {
    // Goddard Bike
    const metal = toon('#c3cad6'), dark = toon('#2a2a38');
    for (const z of [-0.5, 0.5]) body.add(mesh(geo('wheel', () => new THREE.TorusGeometry(0.22, 0.08, 8, 18)), dark, [0, 0.3, z], 1, { rot: [0, Math.PI / 2, 0], ink: 0.06 }));
    body.add(mesh(G_CYL(), metal, [0, 0.5, 0], [0.16, 0.9, 0.16], { rot: [Math.PI / 2, 0, 0], ink: 0.08 }));
    const head = new THREE.Group(); head.position.set(0, 0.72, 0.55); body.add(head);
    head.add(mesh(G_SPHERE(), metal, [0, 0, 0], [0.16, 0.14, 0.18], { ink: 0.08 }));
    for (const s of [-1, 1]) { head.add(ball(basic('#15121f'), s * 0.07, 0.04, 0.13, 0.035)); head.add(box(toon('#9aa6bc'), s * 0.17, -0.02, -0.04, 0.03, 0.18, 0.1, { rot: [0, 0, s * 0.9] })); }
    body.add(ball(basic('#ff4040'), 0, 0.55, -0.6, 0.05));
    r.driver = seatedJimmy(0.85); r.driver.root.position.set(0, 0.48, -0.15); body.add(r.driver.root);
  }
  return r;
}

// ---------------------------------------------------------------------------
// Items & pickups
// ---------------------------------------------------------------------------
function makeItemModel(kind) {
  const root = new THREE.Group(), body = new THREE.Group(); root.add(body);
  if (kind === 'llama') {
    const wool = toon('#f4ecd8'), tan = toon('#c9b89a');
    body.add(mesh(G_SPHERE(), wool, [0, 0.55, 0], [0.24, 0.22, 0.38], { ink: 0.06 }));
    for (const [x, z] of [[-0.12, 0.2], [0.12, 0.2], [-0.12, -0.2], [0.12, -0.2]]) body.add(cyl(tan, x, 0.2, z, 0.04, 0.4));
    body.add(mesh(G_CYL(), wool, [0, 0.9, 0.3], [0.08, 0.5, 0.08], { rot: [0.25, 0, 0], ink: 0.08 }));
    body.add(mesh(G_SPHERE(), wool, [0, 1.15, 0.38], [0.1, 0.1, 0.16], { ink: 0.08 }));
    for (const s of [-1, 1]) { body.add(mesh(G_CONE(5), tan, [s * 0.06, 1.28, 0.33], [0.03, 0.12, 0.03])); body.add(ball(basic('#15121f'), s * 0.07, 1.18, 0.48, 0.02)); }
  } else if (kind === 'duck') {
    const y = toon('#ffe14f');
    body.add(mesh(G_SPHERE(), y, [0, 0.2, 0], [0.22, 0.17, 0.27], { ink: 0.08 }));
    body.add(ball(y, 0, 0.42, 0.12, 0.13, { ink: 0.08 }));
    body.add(mesh(G_CONE(8), toon('#ff8a2a'), [0, 0.4, 0.27], [0.06, 0.12, 0.04], { rot: [Math.PI / 2, 0, 0] }));
    for (const s of [-1, 1]) body.add(ball(basic('#15121f'), s * 0.06, 0.46, 0.22, 0.02));
  } else if (kind === 'figure') {
    const c = makeCharacter({ skin: '#ffd52e', hair: '#3a6fd1', hairStyle: 'buzz', shirt: '#3a6fd1', pants: '#e2312f', height: 1.25, wide: 1.4, shoes: '#3a6fd1', logo: 'ultra' });
    c.root.scale.setScalar(0.45); c.armL.rotation.z = -2.6; body.add(c.root);
  } else if (kind === 'flurp' || kind === 'health') {
    body.add(mesh(G_CYL(), toon('#9b4fd8'), [0, 0.22, 0], [0.1, 0.36, 0.1], { ink: 0.1 }));
    body.add(mesh(G_CYL(), toon('#ffffff'), [0, 0.22, 0], [0.102, 0.1, 0.102]));
    body.add(mesh(G_CYL(), toon('#c8d0dc'), [0, 0.42, 0], [0.07, 0.04, 0.07]));
  } else if (kind === 'part') {
    body.add(mesh(geo('partring', () => new THREE.TorusGeometry(0.18, 0.05, 8, 20)), basic('#3fe0ff'), [0, 0.35, 0], 1, { shadow: false }));
    body.add(box(toon('#9aa6bc'), 0, 0.35, 0, 0.14, 0.14, 0.14, { ink: 0.1 }));
  } else if (kind === 'neutronium') {
    body.add(ball(basic('#bfffb0'), 0, 0.35, 0, 0.06, { shadow: false }));
    for (let k = 0; k < 3; k++) { const g = new THREE.Group(); g.position.y = 0.35; g.rotation.set(k * 1.05, k * 0.7, 0); g.add(mesh(geo('nring', () => new THREE.TorusGeometry(0.15, 0.015, 5, 20)), basic('#7aff6a'), null, [1, 0.4, 1], { shadow: false })); body.add(g); }
  } else if (kind === 'energy') {
    body.add(mesh(geo('oct', () => new THREE.OctahedronGeometry(0.16)), basic('#3fe0ff'), [0, 0.35, 0], [1, 1.5, 1], { shadow: false }));
  }
  if (kind !== 'neutronium' && kind !== 'energy' && kind !== 'health') {
    root.add(mesh(G_CYL(), basic('#ffe14f', { transparent: true, opacity: 0.22, depthWrite: false }), [0, 2, 0], [0.3, 4, 0.3], { shadow: false }));
  }
  return { root, body };
}

// ---------------------------------------------------------------------------
// Buildings & props
// ---------------------------------------------------------------------------
function gableRoof(width, depth, height, mat) {
  const s = new THREE.Shape();
  s.moveTo(-depth / 2, 0); s.lineTo(depth / 2, 0); s.lineTo(0, height); s.lineTo(-depth / 2, 0);
  const g = new THREE.ExtrudeGeometry(s, { depth: width, bevelEnabled: false });
  g.translate(0, 0, -width / 2); g.rotateY(Math.PI / 2);
  const m = new THREE.Mesh(g, mat); m.castShadow = true; m.receiveShadow = true;
  const o = new THREE.Mesh(g, INK); o.scale.set(1.01, 1.03, 1.03); m.add(o);
  return m;
}

const WINDOW_MAT = new THREE.MeshToonMaterial({ color: '#bfe6ff', gradientMap: TOON_RAMP, emissive: '#000000' });
GFX.windowMats.push(WINDOW_MAT);
const LAB_WINDOW_MAT = new THREE.MeshToonMaterial({ color: '#7ff0ff', gradientMap: TOON_RAMP, emissive: '#1a5a66' });

function addWindows(g, W, H, D, doorX, y0, rows = 1, mat = WINDOW_MAT) {
  const frame = toon('#ffffff');
  for (let row = 0; row < rows; row++) {
    const y = y0 + row * 1.0;
    for (let x = -W / 2 + 0.8; x <= W / 2 - 0.6; x += 1.3) {
      if (Math.abs(x - doorX) < 0.9 && row === 0) continue;
      g.add(box(frame, x, y, D / 2 + 0.01, 0.66, 0.66, 0.04, { shadow: false }));
      g.add(box(mat, x, y, D / 2 + 0.03, 0.54, 0.54, 0.04, { shadow: false }));
    }
  }
}

function makeBuilding(b) {
  const g = new THREE.Group();
  const W = b.w, D = b.h;
  g.position.set(b.x + W / 2, 0, b.y + D / 2);
  const doorX = b.doorTile ? b.doorTile.x + 0.5 - (b.x + W / 2) : 0;
  const wall = toon(b.wall), roof = toon(b.roof);
  const addDoor = (h = 1.1, w = 0.6, color = shade(b.roof, -30)) => {
    g.add(box(toon(color), doorX, h / 2, D / 2 + 0.02, w, h, 0.08));
    g.add(ball(basic('#ffd34a'), doorX + w * 0.32, h * 0.48, D / 2 + 0.08, 0.04, { shadow: false }));
    g.add(box(toon('#d8d0c0'), doorX, 0.04, D / 2 + 0.35, w + 0.4, 0.08, 0.5));
  };
  const addSign = (text, y, opts) => { const s = signMesh(text, 0.42, opts); s.position.set(doorX, y, D / 2 + 0.06); g.add(s); return s; };
  const walls = (H, color = wall) => { const m = box(color, 0, H / 2, 0, W - 0.1, H, D - 0.1, { ink: 0.008 }); m.receiveShadow = true; g.add(m); return m; };

  switch (b.kind) {
    case 'ferris': return makeFerris(b);
    case 'coaster': return makeCoaster(b);
    case 'wreck': return makeWreck(b);
    case 'observatory': {
      walls(1.6);
      g.add(mesh(G_CYL(24), wall, [0, 2.0, 0], [W * 0.38, 0.8, W * 0.38], { ink: 0.02 }));
      g.add(mesh(geo('dome', () => new THREE.SphereGeometry(1, 20, 10, 0, Math.PI * 2, 0, Math.PI / 2)), roof, [0, 2.4, 0], W * 0.37, { ink: 0.02 }));
      g.add(mesh(G_CYL(), toon('#3a3460'), [0, 3.6, 0.8], [0.35, 2.4, 0.35], { rot: [0.9, 0, 0] }));
      addWindows(g, W, 1.6, D, doorX, 0.9); addDoor(); addSign(b.name, 1.45);
      break;
    }
    case 'big': {
      walls(3.4);
      g.add(box(toon(shade(b.roof, 10)), 0, 3.5, 0, W, 0.2, D));
      g.add(box(WINDOW_MAT, 0, 1.4, D / 2 + 0.03, W - 2, 1.6, 0.05, { shadow: false }));
      addDoor(1.3, 1.4, '#5a6a7a');
      const s = signMesh('RETROVILLE MALL', 1.0, { bg: '#4c5a70', fg: '#ffe14f' }); s.position.set(0, 2.85, D / 2 + 0.06); g.add(s);
      break;
    }
    case 'school': {
      walls(3);
      g.add(box(toon(shade(b.roof, -10)), 0, 3.1, 0, W + 0.2, 0.25, D + 0.2, { ink: 0.01 }));
      addWindows(g, W, 3, D, doorX, 1.0, 2);
      addDoor(1.3, 1.2, '#5a2a2a');
      addSign('LINDBERGH ELEMENTARY', 1.75, { bg: '#8a3f3f', fg: '#fff' });
      g.add(ball(toon('#ffffff'), doorX, 2.55, D / 2 + 0.06, 0.28, { ink: 0.08 }));
      g.add(cyl(toon('#c8c8d0'), W / 2 - 0.8, 2.6, D / 2 + 0.8, 0.04, 5.2));
      g.add(box(toon('#3d6fd1'), W / 2 - 0.4, 4.8, D / 2 + 0.8, 0.8, 0.5, 0.02));
      g.add(box(toon('#e2312f'), W / 2 - 0.4, 4.92, D / 2 + 0.82, 0.8, 0.12, 0.02));
      break;
    }
    case 'townhall': {
      walls(3.2);
      g.add(box(toon('#ffffff'), 0, 3.3, 0.3, W + 0.2, 0.3, D - 0.4));
      for (let x = -W / 2 + 1; x <= W / 2 - 1; x += 1.4) g.add(mesh(G_CYL(), toon('#ffffff'), [x, 1.6, D / 2 + 0.45], [0.18, 3.2, 0.18], { ink: 0.05 }));
      const ped = new THREE.Shape(); ped.moveTo(-W / 2, 0); ped.lineTo(W / 2, 0); ped.lineTo(0, 1.2); ped.lineTo(-W / 2, 0);
      const pm = new THREE.Mesh(new THREE.ExtrudeGeometry(ped, { depth: 0.4, bevelEnabled: false }), toon('#f4f0e6')); pm.position.set(0, 3.45, D / 2 + 0.2); pm.castShadow = true; g.add(pm);
      g.add(mesh(geo('dome', () => new THREE.SphereGeometry(1, 20, 10, 0, Math.PI * 2, 0, Math.PI / 2)), toon('#e0b84a'), [0, 3.45, -0.5], 1.6, { ink: 0.02 }));
      addWindows(g, W, 3, D, doorX, 1.4);
      addDoor(1.5, 1.0, '#5b3a2a');
      addSign('TOWN HALL', 4.0, { bg: '#5b6b7a', fg: '#fff' });
      break;
    }
    case 'warehouse': {
      walls(3.2);
      const rf = new THREE.Mesh(geo('vault' + W + 'x' + D, () => { const c = new THREE.CylinderGeometry(D / 2, D / 2, W, 20, 1, false, 0, Math.PI); c.rotateZ(Math.PI / 2); return c; }), roof);
      rf.position.y = 3.2; rf.scale.y = 0.35; rf.castShadow = true; g.add(rf);
      g.add(box(toon('#5c6474'), doorX, 0.9, D / 2 + 0.03, 1.8, 1.8, 0.06));
      for (let y = 0.2; y < 1.8; y += 0.2) g.add(box(toon('#4b505a'), doorX, y, D / 2 + 0.07, 1.8, 0.03, 0.02, { shadow: false }));
      addWindows(g, W, 3, D, doorX, 2.4);
      addSign(b.name.toUpperCase(), 2.05, b.name === 'Calamitous Industries' ? { bg: '#2a1f35', fg: '#c36bff' } : { bg: '#3a3f4a', fg: '#fff' });
      break;
    }
    case 'candy': {
      walls(2.4);
      g.add(box(toon('#ffffff'), 0, 2.5, 0, W + 0.2, 0.2, D + 0.2));
      for (let i = 0; i < W * 2; i++) g.add(box(toon(i % 2 ? '#ffffff' : '#ff6fa8'), -W / 2 + 0.25 + i * 0.5, 1.95, D / 2 + 0.4, 0.5, 0.06, 0.8, { rot: [0.35, 0, 0] }));
      addWindows(g, W, 2.4, D, doorX, 1.15);
      addDoor(1.2, 0.7, '#c02a6a');
      // a giant Purple Flurp on the roof
      g.add(mesh(G_CYL(), toon('#9b4fd8'), [-W / 2 + 1.5, 3.4, 0], [0.55, 1.8, 0.55], { ink: 0.04 }));
      g.add(mesh(G_CYL(), toon('#ffffff'), [-W / 2 + 1.5, 3.4, 0], [0.56, 0.5, 0.56]));
      g.add(mesh(G_CYL(), toon('#c8d0dc'), [-W / 2 + 1.5, 4.4, 0], [0.4, 0.2, 0.4]));
      const s = signMesh('THE CANDY BAR', 0.8, { bg: '#e0427a', fg: '#fff', border: '#ffe14f' }); s.position.set(1.2, 3.1, D / 2 - 0.3); g.add(s);
      break;
    }
    case 'shop': {
      walls(2.4);
      g.add(box(roof, 0, 2.5, 0, W + 0.2, 0.2, D + 0.2, { ink: 0.01 }));
      g.add(box(roof, doorX, 1.75, D / 2 + 0.4, W * 0.8, 0.08, 0.8, { rot: [0.3, 0, 0] }));
      addWindows(g, W, 2.4, D, doorX, 1.1);
      addDoor();
      if (b.name === 'Retro Cinema') {
        const s = signMesh('NOW SHOWING: ULTRA LORD', 0.45, { bg: '#ffe14f', fg: '#2f2f48' }); s.position.set(doorX, 2.15, D / 2 + 0.85); g.add(s);
      }
      const s = signMesh(b.name, 0.5, { bg: shade(b.roof, -20), fg: '#fff' }); s.position.set(0, 2.85, D / 2 - 0.2); g.add(s);
      break;
    }
    case 'lab': {
      // Jimmy's clubhouse
      walls(2.0);
      const rf = gableRoof(W + 0.4, D + 0.4, 1.3, roof); rf.position.y = 2.0; g.add(rf);
      addWindows(g, W, 2.0, D, doorX, 1.15, 1, LAB_WINDOW_MAT);
      addDoor(1.1, 0.6, '#2b3352');
      g.add(box(basic('#3fe0ff'), doorX + 0.55, 0.95, D / 2 + 0.05, 0.16, 0.22, 0.04, { shadow: false })); // retina scanner
      const dish = new THREE.Group(); dish.position.set(-W / 2 + 1.2, 3.0, 0.4); dish.rotation.set(-0.6, 0.4, 0);
      dish.add(mesh(geo('dishg', () => new THREE.SphereGeometry(0.6, 18, 8, 0, Math.PI * 2, 0, Math.PI / 3)), toon('#e8eef8', { side: THREE.DoubleSide }), [0, 0, 0], 1, { rot: [Math.PI, 0, 0], ink: 0.03 }));
      dish.add(cyl(toon('#9aa6bc'), 0, -0.25, 0, 0.03, 0.5));
      g.add(dish); GFX.animators.push((t) => { dish.rotation.y = 0.4 + Math.sin(t * 0.4) * 0.5; });
      g.add(cyl(toon('#d0d8e8'), W / 2 - 0.9, 3.6, -0.4, 0.04, 2.2));
      const bulb = ball(basic('#ff4040'), W / 2 - 0.9, 4.75, -0.4, 0.09, { shadow: false }); g.add(bulb);
      GFX.animators.push((t) => { bulb.visible = Math.sin(t * 6) > -0.2; });
      addSign("JIMMY'S LAB · KEEP OUT", 1.6, { bg: '#2b3352', fg: '#7ff0ff' });
      break;
    }
    default: {
      // suburban house
      walls(2.1);
      const rf = gableRoof(W + 0.5, D + 0.5, Math.min(1.6, D * 0.3), roof); rf.position.y = 2.1; g.add(rf);
      addWindows(g, W, 2.1, D, doorX, 1.1);
      addDoor();
      if (b.kind === 'neutron') {
        g.add(box(toon('#9a4a3a'), W / 2 - 1.5, 3.4, -0.6, 0.6, 1.4, 0.6, { ink: 0.04 }));
        g.add(box(toon('#ffffff'), doorX - 1.7, 0.5, D / 2 + 0.6, 1.4, 0.06, 0.06)); // picket
      }
      const s = signMesh(b.name, 0.34, { bg: 'rgba(29,33,64,0.85)', fg: '#fff' }); s.position.set(doorX, 1.38, D / 2 + 0.07); g.add(s);
    }
  }
  return g;
}

function makeFerris(b) {
  const g = new THREE.Group();
  g.position.set(b.x + b.w / 2, 0, b.y + b.h / 2);
  const R = 3.2, cy = 3.9;
  const steel = toon('#9aa0b4');
  for (const z of [-0.6, 0.6]) for (const s of [-1, 1]) g.add(mesh(G_CYL(), steel, [s * 1.1, cy / 2, z], [0.09, cy * 1.1, 0.09], { rot: [0, 0, -s * 0.3] }));
  const wheel = new THREE.Group(); wheel.position.set(0, cy, 0); g.add(wheel);
  wheel.add(mesh(geo('frim', () => new THREE.TorusGeometry(R, 0.07, 6, 48)), toon('#ffffff'), null, null, { ink: 0.02 }));
  wheel.add(mesh(geo('frim2', () => new THREE.TorusGeometry(R * 0.55, 0.05, 6, 36)), toon('#ff4f7a'), null, null));
  const cars = [];
  const cols = ['#ff4f7a', '#3fa7ff', '#ffe066', '#7aff6a'];
  for (let k = 0; k < 10; k++) {
    const a = (k / 10) * Math.PI * 2;
    const sp = mesh(G_CYL(6), toon('#ffffff'), [Math.cos(a) * R / 2, Math.sin(a) * R / 2, 0], [0.03, R, 0.03], { rot: [0, 0, a - Math.PI / 2], shadow: false });
    wheel.add(sp);
    const car = new THREE.Group(); car.position.set(Math.cos(a) * R, Math.sin(a) * R, 0);
    car.add(box(toon(cols[k % 4]), 0, -0.35, 0, 0.5, 0.4, 0.5, { ink: 0.06 }));
    car.add(box(toon(cols[k % 4]), 0, -0.05, 0, 0.56, 0.06, 0.56));
    wheel.add(car); cars.push(car);
  }
  wheel.add(ball(toon('#ff4f7a'), 0, 0, 0, 0.3));
  GFX.animators.push((t) => { wheel.rotation.z = t * 0.25; for (const c of cars) c.rotation.z = -wheel.rotation.z; });
  return g;
}

function makeCoaster(b) {
  const g = new THREE.Group();
  const cx = b.x + b.w / 2, cz = b.y + b.h / 2;
  const pts = [];
  for (let i = 0; i < 64; i++) {
    const t = (i / 64) * Math.PI * 2;
    pts.push(new THREE.Vector3(cx + Math.sin(t * 2) * (b.w / 2 - 0.6), 1.2 + 1.6 * (1 + Math.sin(t * 3 + 0.5)), cz + Math.cos(t) * (b.h / 2 - 0.6)));
  }
  const curve = new THREE.CatmullRomCurve3(pts, true);
  const track = new THREE.Mesh(new THREE.TubeGeometry(curve, 300, 0.1, 6, true), toon('#ffb23f'));
  track.castShadow = true; g.add(track);
  for (let i = 0; i < 64; i += 3) { const p = pts[i]; g.add(mesh(G_CYL(6), toon('#3a3a5a'), [p.x, p.y / 2, p.z], [0.05, p.y, 0.05])); }
  const cars = [];
  for (let k = 0; k < 4; k++) { const c = new THREE.Group(); c.add(box(toon(k ? '#c02a2a' : '#ff4040'), 0, 0.2, 0, 0.36, 0.26, 0.5, { ink: 0.06 })); g.add(c); cars.push(c); }
  const look = new THREE.Vector3();
  GFX.animators.push((t) => {
    cars.forEach((c, k) => {
      const u = ((t * 0.05 - k * 0.012) % 1 + 1) % 1;
      c.position.copy(curve.getPointAt(u));
      look.copy(curve.getPointAt((u + 0.005) % 1)); c.lookAt(look);
    });
  });
  const s = signMesh('BAT COASTER', 0.6, { bg: '#3a3a5a', fg: '#ffb23f' }); s.position.set(cx, 0.5, b.y + b.h + 0.1); g.add(s);
  return g;
}

function makeWreck(b) {
  const g = new THREE.Group();
  g.position.set(b.x + b.w / 2, 0, b.y + b.h / 2);
  const ship = new THREE.Group(); ship.rotation.set(0.12, 0.3, 0.22); ship.position.y = 0.3; g.add(ship);
  ship.add(mesh(G_SPHERE(28, 16), toon('#7fcf5a'), [0, 0, 0], [4.4, 1.2, 2.4], { ink: 0.01 }));
  ship.add(mesh(G_SPHERE(28, 16), toon('#5aa63f'), [0, -0.2, 0], [4.5, 0.6, 2.5]));
  ship.add(mesh(geo('dome', () => new THREE.SphereGeometry(1, 20, 10, 0, Math.PI * 2, 0, Math.PI / 2)), toon('#c8ffe0', { transparent: true, opacity: 0.6 }), [-0.8, 0.8, 0], [1.6, 1.1, 1.3], { shadow: false }));
  for (let k = 0; k < 5; k++) ship.add(box(toon('#3a4a3a'), rand(-3, 3), rand(0.4, 1), rand(-1.5, 1.5), rand(0.3, 0.8), 0.1, rand(0.3, 0.8), { rot: [rand(-1, 1), rand(-1, 1), 0] }));
  const puffs = [];
  for (let k = 0; k < 6; k++) { const p = mesh(G_SPHERE(10, 8), toon('#6a6a6a', { transparent: true, opacity: 0.6 }), [1.8, 1.5, 0], 0.4, { shadow: false }); g.add(p); puffs.push(p); }
  GFX.animators.push((t) => {
    puffs.forEach((p, k) => {
      const u = (t * 0.25 + k / puffs.length) % 1;
      p.position.set(1.8 + u * 1.4, 1.2 + u * 4, Math.sin(u * 6 + k) * 0.3);
      p.scale.setScalar(0.3 + u * 0.9);
    });
  });
  return g;
}

function makeStation(s) {
  const g = new THREE.Group();
  g.position.set(s.x + s.w / 2, 0, s.y + s.h / 2);
  const shell = toon('#3a4466'), glowM = toon(s.color, { emissive: s.color });
  switch (s.id) {
    case 'vox': {
      g.add(box(shell, 0, 0.45, 0, s.w - 0.2, 0.9, s.h - 0.4, { ink: 0.02 }));
      g.add(box(toon('#2b3352'), 0, 0.92, 0.4, s.w - 0.3, 0.08, 0.6, { rot: [0.35, 0, 0] }));
      const screen = voxScreenTexture();
      for (let k = -1; k <= 1; k++) {
        const fr = box(toon('#2b3352'), k * 1.25, 1.85, -0.3, 1.15, 0.85, 0.08, { ink: 0.04 });
        fr.rotation.y = -k * 0.3; g.add(fr);
        const sc = new THREE.Mesh(new THREE.PlaneGeometry(1.0, 0.7), new THREE.MeshBasicMaterial({ map: screen }));
        sc.position.set(k * 1.25, 1.85, -0.25); sc.rotation.y = -k * 0.3; g.add(sc);
      }
      for (let k = 0; k < 12; k++) g.add(box(basic(pick(['#ff4040', '#7aff6a', '#ffe14f', '#3fe0ff'])), -1.5 + (k % 6) * 0.25, 0.97, 0.3 + Math.floor(k / 6) * 0.18, 0.1, 0.03, 0.08, { shadow: false }));
      break;
    }
    case 'upgrade': {
      g.add(box(toon('#8a6a4a'), 0, 0.85, 0, s.w - 0.3, 0.12, s.h - 0.4, { ink: 0.02 }));
      for (const [x, z] of [[-1.6, -0.6], [1.6, -0.6], [-1.6, 0.6], [1.6, 0.6]]) g.add(box(toon('#5a4a3a'), x, 0.4, z, 0.12, 0.8, 0.12));
      g.add(box(toon('#e2312f'), -0.8, 1.0, 0, 0.5, 0.2, 0.3));
      g.add(mesh(G_CYL(), toon('#9aa6bc'), [0.3, 1.05, 0.1], [0.12, 0.3, 0.12]));
      g.add(ball(glowM, 1.0, 1.05, -0.1, 0.15));
      g.add(cyl(toon('#5c6474'), 1.4, 1.5, -0.6, 0.03, 1.2));
      g.add(mesh(G_CONE(), toon('#ffb23f', { emissive: '#7a4a00' }), [1.2, 2.0, -0.6], [0.25, 0.3, 0.25], { rot: [0, 0, 0.8] }));
      break;
    }
    case 'vehicles': {
      g.add(mesh(G_CYL(24), shell, [0, 0.08, 0], [1.8, 0.16, 0.9], { ink: 0.02 }));
      g.add(mesh(geo('bayring', () => new THREE.TorusGeometry(1, 0.05, 6, 32)), basic(s.color), [0, 0.18, 0], [1.6, 0.8, 1], { rot: [Math.PI / 2, 0, 0], shadow: false }));
      const holo = makeVehicleModel('hovercar').root;
      holo.traverse((o) => { if (o.isMesh) o.material = new THREE.MeshBasicMaterial({ color: s.color, wireframe: true, transparent: true, opacity: 0.6 }); });
      holo.position.y = 0.6; holo.scale.setScalar(0.9); g.add(holo);
      GFX.animators.push((t) => { holo.rotation.y = t * 0.8; holo.position.y = 0.6 + Math.sin(t * 2) * 0.08; });
      break;
    }
    case 'heal': {
      g.add(mesh(G_CYL(20), shell, [0, 0.1, 0], [0.9, 0.2, 0.9], { ink: 0.03 }));
      g.add(mesh(G_CYL(20), toon(s.color, { transparent: true, opacity: 0.35, emissive: '#5a1030' }), [0, 1.2, 0], [0.75, 2.0, 0.75], { shadow: false }));
      g.add(mesh(G_CYL(20), shell, [0, 2.3, 0], [0.9, 0.2, 0.9]));
      const ringM = mesh(geo('hring', () => new THREE.TorusGeometry(0.8, 0.04, 6, 24)), basic(s.color), [0, 0.5, 0], 1, { rot: [Math.PI / 2, 0, 0], shadow: false });
      g.add(ringM); GFX.animators.push((t) => { ringM.position.y = 0.3 + ((t * 0.6) % 1) * 1.8; });
      break;
    }
    case 'vault': {
      g.add(box(shell, 0, 0.9, -0.3, s.w - 0.2, 1.8, 0.4, { ink: 0.02 }));
      INVENTIONS.forEach((inv, k) => { const x = -1.1 + (k % 4) * 0.75, y = 0.6 + Math.floor(k / 4) * 0.7; g.add(ball(toon(inv.color, { emissive: shade(inv.color, -120) }), x, y, -0.05, 0.15)); });
      break;
    }
    case 'cloner': {
      g.add(cyl(toon('#5c6474'), 0, 0.6, 0, 0.08, 1.2));
      g.add(mesh(geo('dome', () => new THREE.SphereGeometry(1, 20, 10, 0, Math.PI * 2, 0, Math.PI / 2)), toon('#c8d0dc'), [0, 1.2, 0], 0.4, { ink: 0.05 }));
      for (const sd of [-1, 1]) { g.add(cyl(toon('#5c6474'), sd * 0.2, 1.75, 0, 0.02, 0.4)); g.add(ball(basic('#ffe066'), sd * 0.2, 1.97, 0, 0.06)); }
      break;
    }
  }
  const label = signMesh(s.name, 0.32, { bg: 'rgba(16,19,40,0.85)', fg: s.color });
  label.position.set(0, s.id === 'vox' ? 2.6 : 2.3, s.h / 2); g.add(label);
  return g;
}

function voxScreenTexture() {
  const c = document.createElement('canvas'); c.width = 200; c.height = 140;
  const g = c.getContext('2d');
  g.fillStyle = '#062a33'; g.fillRect(0, 0, 200, 140);
  g.strokeStyle = '#3fe0ff'; g.lineWidth = 3;
  g.beginPath(); for (let x = 0; x < 200; x += 4) g.lineTo(x, 70 + Math.sin(x / 10) * 25 * Math.cos(x / 37)); g.stroke();
  g.fillStyle = '#7ff0ff'; g.font = 'bold 20px Fredoka, sans-serif'; g.fillText('V.O.X.', 10, 26);
  for (let k = 0; k < 5; k++) g.fillRect(120, 100 + k * 7, 20 + k * 12, 3);
  const t = new THREE.CanvasTexture(c); return t;
}
