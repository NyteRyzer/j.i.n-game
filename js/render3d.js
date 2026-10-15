'use strict';
// ---------------------------------------------------------------------------
// Three.js renderer: builds Retroville and the lab in 3D, mirrors the game
// simulation (which runs in 2D map pixels) onto 3D models every frame, and
// owns the cameras, lighting, day/night cycle and screen-space overlays.
// Mapping: map pixel (x, y) -> world (x / TILE, height, y / TILE).
// ---------------------------------------------------------------------------

const R3 = {
  cam: { mode: 'iso', zoom: 1, yaw: -Math.PI / 2, pitch: 0.42, lastMouse: -10 },
  reg: new Map(),
  projMeshes: new Map(),
  ringPool: [], ballPool: [], gatePool: [],
  look: new THREE.Vector3(),
  ray: new THREE.Raycaster(),
  tmpV: new THREE.Vector3(),

  init(canvas) {
    const r = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
    r.shadowMap.enabled = true;
    r.shadowMap.type = THREE.PCFSoftShadowMap;
    this.renderer = r;
    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color('#8fd3ff');
    this.scene.fog = new THREE.Fog('#8fd3ff', 45, 120);
    this.camera = new THREE.PerspectiveCamera(42, 1, 0.1, 400);

    this.hemi = new THREE.HemisphereLight('#dff1ff', '#5f8a45', 0.8);
    this.scene.add(this.hemi);
    this.sun = new THREE.DirectionalLight('#fff2d8', 0.85);
    this.sun.castShadow = true;
    this.sun.shadow.mapSize.set(2048, 2048);
    Object.assign(this.sun.shadow.camera, { left: -26, right: 26, top: 26, bottom: -26, near: 1, far: 90 });
    this.sun.shadow.bias = -0.0006;
    this.scene.add(this.sun, this.sun.target);
    this.playerLight = new THREE.PointLight('#ffe8b0', 0, 10, 1.6);
    this.scene.add(this.playerLight);

    this.groups = { town: new THREE.Group(), lab: new THREE.Group() };
    this.scene.add(this.groups.town, this.groups.lab);
    this.dynamic = new THREE.Group(); this.scene.add(this.dynamic);
    this.initParticles();
    this.initSky();
  },

  // Graphics quality: shadow resolution and render resolution.
  quality: 'high',
  setQuality(q) {
    const prevShadows = this.renderer.shadowMap.enabled;
    this.quality = q;
    const shadows = q !== 'low';
    this.renderer.shadowMap.enabled = shadows;
    const size = q === 'high' ? 2048 : 1024;
    if (this.sun.shadow.mapSize.x !== size) {
      this.sun.shadow.mapSize.set(size, size);
      if (this.sun.shadow.map) { this.sun.shadow.map.dispose(); this.sun.shadow.map = null; }
    }
    if (prevShadows !== shadows) this.scene.traverse((o) => { if (o.material) (Array.isArray(o.material) ? o.material : [o.material]).forEach((m) => { m.needsUpdate = true; }); });
    if (this.W) this.resize(this.W, this.H, this.dprIn || 1);
  },
  resize(w, h, dpr) {
    this.dprIn = dpr;
    dpr = Math.min(dpr, this.quality === 'high' ? 1.5 : this.quality === 'medium' ? 1 : 0.75);
    this.renderer.setPixelRatio(dpr);
    this.renderer.setSize(w, h, false);
    this.camera.aspect = w / h; this.camera.updateProjectionMatrix();
    this.W = w; this.H = h;
  },

  // -------------------------------------------------------------------------
  // World construction
  // -------------------------------------------------------------------------
  buildWorld(town, lab) {
    this.buildGround(town, this.groups.town, 24);
    this.buildWater(town, this.groups.town);
    this.buildProps(town, this.groups.town);
    this.buildings = [];
    for (const b of town.buildings) {
      const g = makeBuilding(b);
      g.traverse((o) => { if (o.isMesh) { o.receiveShadow = true; } });
      const mats = [];
      g.traverse((o) => { if (o.isMesh && o.material !== WINDOW_MAT) { o.material = o.material.clone(); o.material.userData.wasTransparent = o.material.transparent; o.material.userData.baseOpacity = o.material.opacity; mats.push(o.material); } });
      this.groups.town.add(g);
      this.buildings.push({ b, g, mats, fade: 1 });
    }
    this.buildGround(lab, this.groups.lab, 32);
    this.buildLab(lab);
  },

  buildGround(m, group, ppt) {
    const c = document.createElement('canvas');
    c.width = m.w * ppt; c.height = m.h * ppt;
    const g = c.getContext('2d');
    g.scale(ppt / TILE, ppt / TILE);
    for (let y = 0; y < m.h; y++) for (let x = 0; x < m.w; x++) drawTile(g, m, x, y, groundBase(m, x, y), 0);
    const tex = new THREE.CanvasTexture(c);
    tex.anisotropy = this.renderer.capabilities.getMaxAnisotropy();
    const plane = new THREE.Mesh(new THREE.PlaneGeometry(m.w, m.h), new THREE.MeshLambertMaterial({ map: tex, color: '#b4b4b4' }));
    plane.rotation.x = -Math.PI / 2;
    plane.position.set(m.w / 2, 0, m.h / 2);
    plane.receiveShadow = true;
    group.add(plane);
    if (m.name === 'town') {
      // grassy skirt beyond the map edge
      const skirt = new THREE.Mesh(new THREE.PlaneGeometry(600, 600), new THREE.MeshLambertMaterial({ color: '#4a8a32' }));
      skirt.rotation.x = -Math.PI / 2; skirt.position.set(m.w / 2, -0.02, m.h / 2);
      group.add(skirt);
    }
  },

  buildWater(m, group) {
    const pos = [];
    for (let y = 0; y < m.h; y++) for (let x = 0; x < m.w; x++) {
      if (m.get(x, y) !== T.WATER) continue;
      pos.push(x, 0, y, x, 0, y + 1, x + 1, 0, y, x + 1, 0, y, x, 0, y + 1, x + 1, 0, y + 1);
    }
    const geom = new THREE.BufferGeometry();
    geom.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    geom.computeVertexNormals();
    this.waterMat = new THREE.MeshPhongMaterial({ color: '#3d93db', transparent: true, opacity: 0.72, shininess: 120, specular: '#cfefff' });
    const water = new THREE.Mesh(geom, this.waterMat);
    water.position.y = 0.06; water.receiveShadow = true;
    group.add(water);
  },

  buildProps(m, group) {
    const dummy = new THREE.Object3D();
    const rng = mulberry32(99);
    const list = (t) => { const out = []; for (let y = 0; y < m.h; y++) for (let x = 0; x < m.w; x++) if (m.get(x, y) === t) out.push([x, y]); return out; };
    const inst = (geometry, material, items, place, colorFn) => {
      const im = new THREE.InstancedMesh(geometry, material, Math.max(1, items.length));
      im.count = items.length;
      items.forEach((it, i) => { place(dummy, it, i); dummy.updateMatrix(); im.setMatrixAt(i, dummy.matrix); if (colorFn) im.setColorAt(i, colorFn(it, i)); });
      im.castShadow = true; im.receiveShadow = true;
      group.add(im); return im;
    };
    // Trees
    const trees = list(T.TREE).map(([x, y]) => ({ x: x + 0.5 + (rng() - 0.5) * 0.3, z: y + 0.5 + (rng() - 0.5) * 0.3, s: 0.8 + rng() * 0.45, rot: rng() * 6, c: rng() }));
    const greens = ['#2f8a3a', '#3a9a3f', '#2a7a34', '#47a64a', '#358f2f'].map((c) => new THREE.Color(c));
    inst(geo('trunk', () => new THREE.CylinderGeometry(0.09, 0.14, 1, 7)), toon('#7a5233'), trees, (d, t) => { d.position.set(t.x, 0.5 * t.s, t.z); d.scale.set(t.s, t.s, t.s); d.rotation.set(0, 0, 0); });
    const leafMat = toon('#ffffff', { flatShading: true });
    inst(geo('ico1', () => new THREE.IcosahedronGeometry(1, 1)), leafMat, trees, (d, t) => { d.position.set(t.x, 1.35 * t.s, t.z); d.scale.set(0.72 * t.s, 0.62 * t.s, 0.72 * t.s); d.rotation.set(0, t.rot, 0); }, (t) => greens[Math.floor(t.c * greens.length)]);
    inst(geo('ico1', () => new THREE.IcosahedronGeometry(1, 1)), leafMat, trees, (d, t) => { d.position.set(t.x + 0.1, 1.85 * t.s, t.z - 0.05); d.scale.set(0.45 * t.s, 0.42 * t.s, 0.45 * t.s); d.rotation.set(0, t.rot * 2, 0); }, (t) => greens[(Math.floor(t.c * greens.length) + 2) % greens.length].clone().offsetHSL(0, 0, 0.06));
    // Hedges
    inst(G_BOX(), toon('#2f7a34'), list(T.HEDGE), (d, [x, y]) => { d.position.set(x + 0.5, 0.35, y + 0.5); d.scale.set(0.98, 0.7, 0.85); d.rotation.set(0, 0, 0); });
    // Fences: posts plus rails toward fence neighbours
    const fences = list(T.FENCE);
    const isF = (x, y) => m.get(x, y) === T.FENCE;
    inst(G_BOX(), toon('#f4f0e6'), fences, (d, [x, y]) => { d.position.set(x + 0.5, 0.4, y + 0.5); d.scale.set(0.12, 0.8, 0.12); d.rotation.set(0, 0, 0); });
    const rails = [];
    for (const [x, y] of fences) { if (isF(x + 1, y)) rails.push([x + 1, y + 0.5, 'h']); if (isF(x, y + 1)) rails.push([x + 0.5, y + 1, 'v']); }
    for (const h of [0.35, 0.62]) inst(G_BOX(), toon('#f4f0e6'), rails, (d, [x, z, o]) => { d.position.set(x, h, z); d.scale.set(o === 'h' ? 1 : 0.07, 0.08, o === 'h' ? 0.07 : 1); d.rotation.set(0, 0, 0); });
    // Junk piles
    const junk = []; for (const [x, y] of list(T.JUNK)) for (let k = 0; k < 3; k++) junk.push({ x: x + 0.2 + rng() * 0.6, z: y + 0.2 + rng() * 0.6, s: 0.25 + rng() * 0.45, r: rng() * 3, c: rng() });
    const junkCols = ['#7a7f88', '#a35a3a', '#5a6a7a', '#c8b04a', '#4a5a4a'].map((c) => new THREE.Color(c));
    inst(G_BOX(), toon('#ffffff'), junk, (d, j) => { d.position.set(j.x, j.s * 0.4, j.z); d.scale.set(j.s, j.s * 0.8, j.s * 1.2); d.rotation.set(j.r * 0.3, j.r, j.r * 0.2); }, (j) => junkCols[Math.floor(j.c * junkCols.length)]);
    // Street lamps along the sidewalks
    const lamps = [];
    for (const vx of V_ROADS) for (let y = 3; y < m.h; y += 7) for (const x of [vx - 2, vx + 2]) if (m.get(x, y) === T.WALK) lamps.push([x + 0.5, y + 0.5]);
    for (const hy of H_ROADS) for (let x = 3; x < m.w; x += 7) for (const y of [hy - 2, hy + 2]) if (m.get(x, y) === T.WALK) lamps.push([x + 0.5, y + 0.5]);
    inst(geo('pole', () => new THREE.CylinderGeometry(0.05, 0.07, 1, 6)), toon('#3a4050'), lamps, (d, [x, z]) => { d.position.set(x, 1.3, z); d.scale.set(1, 2.6, 1); d.rotation.set(0, 0, 0); });
    this.lampMat = new THREE.MeshBasicMaterial({ color: '#d8d4c0' });
    const bulbs = inst(G_SPHERE(10, 8), this.lampMat, lamps, (d, [x, z]) => { d.position.set(x, 2.65, z); d.scale.setScalar(0.16); });
    bulbs.castShadow = false;
    // Soft lamp glow halos (only visible at night)
    const halo = new THREE.BufferGeometry();
    halo.setAttribute('position', new THREE.Float32BufferAttribute(lamps.flatMap(([x, z]) => [x, 2.65, z]), 3));
    this.haloMat = new THREE.PointsMaterial({ size: 2.6, map: glowTexture('#ffd98a'), transparent: true, depthWrite: false, opacity: 0, blending: THREE.AdditiveBlending });
    group.add(new THREE.Points(halo, this.haloMat));
    // Bridge railings
    const rails2 = [];
    for (let y = 0; y < m.h; y++) for (let x = 0; x < m.w; x++) if (m.get(x, y) === T.BRIDGE) {
      if (m.get(x, y - 1) === T.WATER) rails2.push([x + 0.5, y + 0.05]);
      if (m.get(x, y + 1) === T.WATER) rails2.push([x + 0.5, y + 0.95]);
    }
    inst(G_BOX(), toon('#8a5d2f'), rails2, (d, [x, z]) => { d.position.set(x, 0.3, z); d.scale.set(1, 0.12, 0.1); d.rotation.set(0, 0, 0); });
    // Launch pad markings and a fountain spout
    const pad = new THREE.Mesh(geo('padring2', () => new THREE.RingGeometry(1.6, 1.9, 40)), basic('#ffe14f'));
    pad.rotation.x = -Math.PI / 2; pad.position.set(53.5, 0.03, 27.5); group.add(pad);
    const spout = cyl(toon('#d8d0c0'), 78.5, 0.4, 70.5, 0.25, 0.8); group.add(spout);
    const spray = mesh(G_SPHERE(10, 8), basic('#cfefff', { transparent: true, opacity: 0.6 }), [78.5, 1.1, 70.5], [0.35, 0.5, 0.35], { shadow: false });
    group.add(spray); GFX.animators.push((t) => { spray.scale.y = 0.45 + Math.sin(t * 8) * 0.08; });
  },

  buildLab(m) {
    const group = this.groups.lab;
    const dummy = new THREE.Object3D();
    const walls = [];
    for (let y = 0; y < m.h; y++) for (let x = 0; x < m.w; x++) if (m.get(x, y) === T.LABWALL) walls.push([x, y]);
    const im = new THREE.InstancedMesh(G_BOX(), toon('#2b3352'), walls.length);
    walls.forEach(([x, y], i) => {
      const h = y === m.h - 1 ? 0.25 : y > 1 && x > 0 && x < m.w - 1 ? 1.2 : 2.6; // low south & interior walls keep the view open
      dummy.position.set(x + 0.5, h / 2, y + 0.5); dummy.scale.set(1, h, 1); dummy.updateMatrix(); im.setMatrixAt(i, dummy.matrix);
    });
    im.castShadow = true; im.receiveShadow = true; group.add(im);
    const trimmed = walls.filter(([, y]) => y < m.h - 1);
    const trim = new THREE.InstancedMesh(G_BOX(), basic('#2a8fa8'), trimmed.length);
    trimmed.forEach(([x, y], i) => { const h = y > 1 && x > 0 && x < m.w - 1 ? 1.22 : 2.62; dummy.position.set(x + 0.5, h, y + 0.5); dummy.scale.set(1.01, 0.05, 1.01); dummy.updateMatrix(); trim.setMatrixAt(i, dummy.matrix); });
    group.add(trim);
    for (const s of m.stations) group.add(makeStation(s));
    // specimen tubes with rising bubbles
    for (let k = 0; k < 4; k++) {
      const x = 8.6 + k * 1.15, z = 1.6;
      group.add(mesh(G_CYL(16), toon('#7fffaa', { transparent: true, opacity: 0.35, emissive: '#0c3a20' }), [x, 0.9, z], [0.32, 1.6, 0.32], { shadow: false }));
      group.add(cyl(toon('#5c6474'), x, 0.05, z, 0.36, 0.1)); group.add(cyl(toon('#5c6474'), x, 1.72, z, 0.36, 0.08));
      const bub = ball(basic('#ffffff', { transparent: true, opacity: 0.7 }), x, 0.3, z, 0.06, { shadow: false }); group.add(bub);
      GFX.animators.push((t) => { bub.position.y = 0.2 + ((t * 0.5 + k * 0.27) % 1) * 1.4; });
    }
    // elevator back up to the clubhouse
    group.add(box(basic('#3fe0ff'), 15, 0.05, 18.9, 2, 0.06, 0.15));
    const sign = signMesh('▲ ELEVATOR TO CLUBHOUSE', 0.4, { bg: '#2b3352', fg: '#7ff0ff' });
    sign.rotation.x = -Math.PI / 2; sign.position.set(15, 0.04, 18.3); group.add(sign);
    const tr = signMesh('TRAINING ROOM', 0.4, { bg: 'rgba(43,51,82,0.9)', fg: '#ffffff' });
    tr.rotation.x = -Math.PI / 2; tr.position.set(24.5, 0.04, 9.6); group.add(tr);
    for (const s of m.stations) {
      const l = new THREE.PointLight(s.color, 0.9, 7, 1.5);
      l.position.set(s.x + s.w / 2, 2.4, s.y + s.h + 0.5); group.add(l);
    }
  },

  // -------------------------------------------------------------------------
  // Sky: gradient dome, stars at night, drifting clouds (seen in third-person)
  // -------------------------------------------------------------------------
  initSky() {
    this.skyMat = new THREE.ShaderMaterial({
      uniforms: { top: { value: new THREE.Color('#4aa8ff') }, bottom: { value: new THREE.Color('#bfe8ff') } },
      vertexShader: 'varying vec3 vP; void main(){ vP = normalize(position); gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
      fragmentShader: 'uniform vec3 top; uniform vec3 bottom; varying vec3 vP; void main(){ float h = clamp(vP.y * 1.8 + 0.08, 0.0, 1.0); gl_FragColor = vec4(mix(bottom, top, h), 1.0); }',
      side: THREE.BackSide, depthWrite: false,
    });
    this.sky = new THREE.Mesh(new THREE.SphereGeometry(300, 24, 12), this.skyMat);
    this.sky.renderOrder = -1;
    this.scene.add(this.sky);
    const rng = mulberry32(5), pos = [];
    for (let i = 0; i < 500; i++) {
      const a = rng() * Math.PI * 2, el = 0.08 + rng() * 1.3;
      pos.push(Math.cos(a) * Math.cos(el) * 280, Math.sin(el) * 280, Math.sin(a) * Math.cos(el) * 280);
    }
    const sg = new THREE.BufferGeometry(); sg.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    this.starMat = new THREE.PointsMaterial({ color: '#ffffff', size: 1.6, sizeAttenuation: false, transparent: true, opacity: 0, depthWrite: false, fog: false });
    this.stars = new THREE.Points(sg, this.starMat);
    this.scene.add(this.stars);
    this.clouds = new THREE.Group();
    const puff = toon('#ffffff', { transparent: true, opacity: 0.92 });
    for (let i = 0; i < 26; i++) {
      const c = new THREE.Group();
      const n = 3 + Math.floor(rng() * 3);
      for (let k = 0; k < n; k++) c.add(mesh(G_SPHERE(12, 8), puff, [k * 2.2 - n, rng() * 0.8, (rng() - 0.5) * 2], [2 + rng() * 1.6, 1.2 + rng() * 0.6, 1.8 + rng()], { shadow: false }));
      c.position.set(rng() * 190 - 20, 34 + rng() * 10, rng() * 150 - 20);
      c.userData.speed = 0.4 + rng() * 0.5;
      this.clouds.add(c);
    }
    this.scene.add(this.clouds);
  },
  updateSky(dt, n, lab) {
    const day = n < 0.5;
    this.skyMat.uniforms.top.value.set(lab ? '#05070f' : n < 0.2 ? '#3d9bff' : n < 0.6 ? '#5a5ab8' : '#070a24');
    this.skyMat.uniforms.bottom.value.set(lab ? '#05070f' : n < 0.2 ? '#cdeeff' : n < 0.6 ? '#ffa070' : '#1a1f4a');
    this.sky.visible = !lab; this.clouds.visible = !lab; this.stars.visible = !lab;
    this.starMat.opacity = clamp((n - 0.5) * 2, 0, 1);
    this.sky.position.copy(this.camera.position); this.stars.position.copy(this.camera.position);
    for (const c of this.clouds.children) {
      c.position.x += c.userData.speed * dt;
      if (c.position.x > 180) c.position.x = -30;
      c.children.forEach((m) => { m.material.color.set(day ? '#ffffff' : '#5a6090'); });
    }
  },

  // -------------------------------------------------------------------------
  // Particles, rings, fireballs
  // -------------------------------------------------------------------------
  initParticles() {
    const N = 3000;
    this.pGeo = new THREE.BufferGeometry();
    this.pPos = new Float32Array(N * 3); this.pCol = new Float32Array(N * 3);
    this.pGeo.setAttribute('position', new THREE.BufferAttribute(this.pPos, 3));
    this.pGeo.setAttribute('color', new THREE.BufferAttribute(this.pCol, 3));
    this.pMat = new THREE.PointsMaterial({ size: 0.22, vertexColors: true, map: glowTexture('#ffffff'), transparent: true, depthWrite: false, alphaTest: 0.05 });
    this.points = new THREE.Points(this.pGeo, this.pMat);
    this.points.frustumCulled = false;
    this.scene.add(this.points);
    this.pMax = N;
  },

  syncEffects(m) {
    const col = new THREE.Color();
    let n = 0;
    let ri = 0, bi = 0;
    for (const e of m.effects) {
      const t = clamp(e.life / e.max, 0, 1);
      if (e.type === 'p' && n < this.pMax) {
        this.pPos[n * 3] = e.x / TILE; this.pPos[n * 3 + 1] = e.z === undefined ? 0.8 : e.z; this.pPos[n * 3 + 2] = e.y / TILE;
        col.set(e.color).multiplyScalar(0.4 + t * 0.6);
        this.pCol[n * 3] = col.r; this.pCol[n * 3 + 1] = col.g; this.pCol[n * 3 + 2] = col.b;
        n++;
      } else if (e.type === 'ring') {
        const r = this.ringPool[ri] || this.makePooled(this.ringPool, () => { const mm = new THREE.Mesh(geo('fxring', () => new THREE.RingGeometry(0.88, 1, 48)), new THREE.MeshBasicMaterial({ transparent: true, depthWrite: false, side: THREE.DoubleSide })); mm.rotation.x = -Math.PI / 2; return mm; });
        r.visible = true; r.position.set(e.x / TILE, 0.12, e.y / TILE);
        r.scale.setScalar(Math.max(0.01, (e.radius / TILE) * (1 - t * 0.7)));
        r.material.color.set(e.color); r.material.opacity = t;
        ri++;
      } else if (e.type === 'ball') {
        const b = this.ballPool[bi] || this.makePooled(this.ballPool, () => new THREE.Mesh(G_SPHERE(16, 10), new THREE.MeshBasicMaterial({ transparent: true, depthWrite: false })));
        b.visible = true; b.position.set(e.x / TILE, 0.6, e.y / TILE);
        b.scale.setScalar(Math.max(0.01, (e.radius / TILE) * (0.3 + (1 - t) * 0.8)));
        b.material.color.set(e.color); b.material.opacity = t * 0.75;
        bi++;
      }
    }
    for (let i = ri; i < this.ringPool.length; i++) this.ringPool[i].visible = false;
    for (let i = bi; i < this.ballPool.length; i++) this.ballPool[i].visible = false;
    this.pGeo.setDrawRange(0, n);
    this.pGeo.attributes.position.needsUpdate = true;
    this.pGeo.attributes.color.needsUpdate = true;
  },
  makePooled(pool, make) { const o = make(); pool.push(o); this.scene.add(o); return o; },

  // -------------------------------------------------------------------------
  // Entities
  // -------------------------------------------------------------------------
  modelFor(e) {
    if (e === G.player) {
      const c = makeCharacter(LOOKS.jimmy);
      c.aiming = true;
      c.gadget = new THREE.Group(); c.hand.add(c.gadget);
      c.gadget.add(box(toon('#5a6478'), 0, -0.05, 0.1, 0.08, 0.08, 0.28, { ink: 0.1 }));
      c.gadgetTip = ball(basic('#ffe14f'), 0, -0.05, 0.26, 0.06, { shadow: false }); c.gadget.add(c.gadgetTip);
      c.jet = new THREE.Group(); c.jet.position.set(0, 0.55, -0.2); c.body.add(c.jet);
      for (const s of [-1, 1]) { c.jet.add(mesh(G_CYL(), toon('#9aa6bc'), [s * 0.1, 0, 0], [0.07, 0.32, 0.07], { ink: 0.1 })); c.jet.add(mesh(G_CONE(8), basic('#ffb23f'), [s * 0.1, -0.3, 0], [0.06, 0.28, 0.06], { rot: [Math.PI, 0, 0], shadow: false })); }
      c.jet.visible = false;
      return c;
    }
    if (e instanceof Goddard) return makeGoddard();
    if (e instanceof Clone) {
      const c = makeCharacter(LOOKS.jimmy);
      c.root.traverse((o) => { if (o.isMesh && o.material !== INK) { o.material = o.material.clone(); o.material.transparent = true; o.material.opacity = 0.7; if (o.material.emissive) o.material.emissive.set('#0a4a55'); } });
      return c;
    }
    if (e instanceof NPC) return makeCharacter(e.look);
    if (e instanceof MissionItem) return makeItemModel(e.kind);
    if (e instanceof GoldenAtom) return makeItemModel('goldatom');
    if (e instanceof Enemy) return makeEnemyModel(e.type);
    if (e instanceof Vehicle) return makeVehicleModel(e.kind);
    return null;
  },

  syncEntities(dt) {
    const m = G.map, seen = new Set();
    const list = m.entities.slice();
    list.push(G.player, G.goddard);
    for (const e of list) {
      if (e.dead) continue;
      let rec = this.reg.get(e);
      if (!rec) {
        const model = this.modelFor(e);
        if (!model) continue;
        rec = { model, px: e.x, py: e.y };
        this.reg.set(e, rec);
        this.dynamic.add(model.root);
      }
      seen.add(e);
      this.updateModel(e, rec, dt);
    }
    for (const [e, rec] of this.reg) {
      if (seen.has(e)) continue;
      if (e.dead) { this.dynamic.remove(rec.model.root); this.reg.delete(e); } else rec.model.root.visible = false;
    }
    // pickups
    for (const k of m.pickups) {
      let rec = this.reg.get(k);
      if (!rec) { rec = { model: makeItemModel(k.kind) }; this.reg.set(k, rec); this.dynamic.add(rec.model.root); }
      seen.add(k);
      const r = rec.model.root; r.visible = true;
      r.position.set(k.x / TILE, Math.sin(k.t * 5) * 0.08, k.y / TILE);
      r.rotation.y = k.t * 3;
    }
    for (const [k, rec] of this.reg) if (!seen.has(k) && k.kind && k.value !== undefined) { this.dynamic.remove(rec.model.root); this.reg.delete(k); }
  },

  updateModel(e, rec, dt) {
    const md = rec.model, root = md.root;
    root.visible = true;
    root.position.set(e.x / TILE, 0, e.y / TILE);
    const moved = Math.hypot(e.x - rec.px, e.y - rec.py) / Math.max(dt, 1e-4);
    rec.px = e.x; rec.py = e.y;
    rec.moving = moved > 8;
    const blink = e.flash > 0 && Math.floor(G.time * 30) % 2 === 0;
    const face = (a) => { root.rotation.y = Math.PI / 2 - a; };

    if (e === G.player) {
      root.visible = !e.vehicle && !blink;
      root.position.y = e.alt * 0.095;
      face(e.facing);
      animateCharacter(md, e.walkPhase, e.moving && !e.jetpack, dt);
      md.armR.rotation.x = lerp(md.armR.rotation.x, -1.45, Math.min(1, dt * 12));
      md.gadgetTip.material = basic(INVENTIONS[e.invIndex].color);
      md.jet.visible = e.jetpack;
      if (e.jetpack) { md.legL.rotation.x = 0.2; md.legR.rotation.x = 0.1; md.jet.children.forEach((c, i) => { if (i % 2) c.scale.y = 0.2 + Math.random() * 0.25; }); }
      return;
    }
    if (e instanceof Goddard) {
      root.visible = !e.isBike && !blink;
      const off = e.offline > 0;
      root.position.y = off ? 0 : 0.12 + Math.sin(G.time * 5) * 0.05;
      face(e.facing);
      md.body.rotation.z = lerp(md.body.rotation.z, off ? 1.3 : 0, Math.min(1, dt * 6));
      md.legs.forEach((l, i) => { l.rotation.x = rec.moving && !off ? Math.sin(G.time * 14 + (i % 2) * Math.PI + (i > 1 ? Math.PI : 0)) * 0.6 : 0; });
      md.ears.forEach((ear, i) => { ear.rotation.x = Math.sin(G.time * (rec.moving ? 14 : 3) + i) * (rec.moving ? 0.5 : 0.12); });
      md.tail.rotation.z = Math.sin(G.time * 10) * 0.4;
      return;
    }
    if (e instanceof Clone || e instanceof NPC) {
      face(e.facing);
      animateCharacter(md, e.walkPhase || 0, e instanceof NPC ? e.moving : rec.moving, dt);
      if (e instanceof Clone) root.visible = !(e.life < 2 && Math.floor(G.time * 10) % 2 === 0);
      return;
    }
    if (e instanceof GoldenAtom) {
      root.position.y = e.h + Math.sin(G.time * 2 + e.atomId) * 0.15;
      md.body.rotation.y = G.time * 2;
      md.body.children.forEach((c, i) => { if (i) c.rotation.x = G.time * (1 + i * 0.3); });
      return;
    }
    if (e instanceof MissionItem) {
      if (e.kind === 'llama') face(e.facing); else root.rotation.y = G.time * 1.5;
      md.body.position.y = e.kind === 'llama' ? 0 : 0.15 + Math.sin(G.time * 3) * 0.08;
      return;
    }
    if (e instanceof Vehicle) {
      root.rotation.y = Math.PI / 2 - e.angle;
      root.visible = !blink;
      if (e.kind === 'hovercar') {
        root.position.y = 0.15 + Math.sin(G.time * 3 + e.id) * 0.05;
        md.body.rotation.z = lerp(md.body.rotation.z, (e.driver && Math.abs(e.spd) > 50 ? -0.12 : 0) * ((G.input.right ? 1 : 0) - (G.input.left ? 1 : 0)), Math.min(1, dt * 5));
        md.glow.scale.set(1.1 + Math.sin(G.time * 10) * 0.05, 1.6, 1);
      }
      if (e.kind === 'rocket') {
        const up = 1 - clamp(e.alt / 26, 0, 1); // 1 = parked upright on the pad
        md.craft.rotation.x = -Math.PI / 2 * up;
        root.position.y = e.alt * 0.095 + 0.95 * up + 0.45;
        md.flame.visible = !!e.driver && (Math.abs(e.spd) > 15 || up > 0.05);
        md.flame.scale.set(0.22, 0.6 + Math.random() * 0.5 + Math.abs(e.spd) / 600, 0.22);
      }
      if (e.kind === 'goddardbike') md.body.rotation.z = lerp(md.body.rotation.z, (e.driver ? -0.25 : 0) * ((G.input.right ? 1 : 0) - (G.input.left ? 1 : 0)), Math.min(1, dt * 6));
      if (md.driver) md.driver.root.visible = !!e.driver;
      return;
    }
    if (e instanceof Enemy) {
      const sc = e.sizeScale();
      root.scale.setScalar(lerp(root.scale.x, sc, Math.min(1, dt * 10)));
      root.visible = !blink;
      face(e.facing);
      const fz = e.frozen > 0;
      md.ice.visible = fz;
      md.hypno.visible = e.hypno > 0;
      if (e.hypno > 0) md.hypno.rotation.z = G.time * 8;
      if (fz) return;
      const t = e.anim;
      switch (e.type) {
        case 'twonky': md.body.position.y = Math.abs(Math.sin(t * 8)) * 0.18; md.body.scale.set(1 + Math.sin(t * 16) * 0.04, 1 - Math.sin(t * 16) * 0.04, 1); break;
        case 'yokian': md.body.position.y = 0.1 + Math.sin(t * 4) * 0.06; break;
        case 'saucer': root.position.y = 2.0 + Math.sin(t * 2) * 0.15; md.body.rotation.y = t * 1.5; md.lights.forEach((l, i) => { l.material = basic(Math.sin(t * 6 + i) > 0 ? '#ffe14f' : '#ff4040'); }); break;
        case 'goobot': root.position.y = 2.6 + Math.sin(t * 1.5) * 0.25; md.lights.forEach((l, i) => { l.material = basic(Math.sin(t * 5 + i * 0.8) > 0 ? '#ffe14f' : '#ff4040'); }); break;
        case 'robot': case 'ultrabot': case 'megabot':
          md.body.position.y = Math.abs(Math.sin(t * 6)) * 0.04;
          md.arms.forEach((a, i) => { a.rotation.x = rec.moving ? Math.sin(t * 8 + i * Math.PI) * 0.5 : -0.3; });
          md.glow.visible = e.charging > 0;
          break;
        case 'nanobot': md.body.position.y = Math.abs(Math.sin(t * 20)) * 0.05; break;
      }
    }
  },

  syncProjectiles(m) {
    const seen = new Set();
    for (const p of m.projectiles) {
      let o = this.projMeshes.get(p);
      if (!o) {
        if (p.kind === 'grenade') o = ball(basic('#ff6fd0'), 0, 0, 0, 0.16, { shadow: false });
        else if (p.kind === 'missile') { o = new THREE.Group(); o.add(mesh(geo('lsr', () => new THREE.CylinderGeometry(1, 1, 1, 8).rotateX(Math.PI / 2)), toon('#eef2f8'), [0, 0, 0], [0.07, 0.07, 0.4])); o.add(ball(basic(p.color), 0, 0, 0.22, 0.08, { shadow: false })); }
        else o = mesh(geo('lsr', () => new THREE.CylinderGeometry(1, 1, 1, 8).rotateX(Math.PI / 2)), basic(p.color), null, [p.r * 0.02, p.r * 0.02, 0.55], { shadow: false });
        if (p.effect === 'hypno') o.add(mesh(geo('hyp', () => new THREE.TorusGeometry(0.18, 0.03, 6, 20)), basic('#ffffff'), null, 1, { shadow: false }));
        this.projMeshes.set(p, o); this.dynamic.add(o);
      }
      seen.add(p);
      let h = p.h === undefined ? 0.9 : p.h;
      if (p.kind === 'grenade') h = 0.5 + Math.sin((1 - p.life / p.max) * Math.PI) * 2.2;
      o.position.set(p.x / TILE, h, p.y / TILE);
      o.rotation.y = Math.atan2(p.vx, p.vy);
    }
    for (const [p, o] of this.projMeshes) if (!seen.has(p)) { this.dynamic.remove(o); this.projMeshes.delete(p); }
  },

  syncMissionMarkers() {
    const s = Missions.step();
    let gi = 0;
    const gate = (x, y, cur, flat) => {
      const g = this.gatePool[gi] || this.makePooled(this.gatePool, () => new THREE.Mesh(geo('gate', () => new THREE.TorusGeometry(1.7, 0.12, 8, 40)), new THREE.MeshBasicMaterial({ transparent: true })));
      g.visible = true;
      g.position.set(x / TILE, flat ? 0.1 : 1.8, y / TILE);
      g.rotation.set(flat ? -Math.PI / 2 : 0, flat ? 0 : G.time * 0.8, 0);
      g.material.color.set(flat ? '#7aff6a' : '#ffe14f'); g.material.opacity = cur ? 0.95 : 0.3;
      g.scale.setScalar(cur ? 1 + Math.sin(G.time * 5) * 0.06 : 0.8);
      gi++;
    };
    if (s && G.map.name === 'town') {
      if (s.type === 'race') s.checkpoints.forEach((c, i) => { if (i >= Missions.active.cp) gate(c.x, c.y, i === Missions.active.cp, false); });
      if (s.type === 'goto') gate(s.x, s.y, true, true);
    }
    for (let i = gi; i < this.gatePool.length; i++) this.gatePool[i].visible = false;
  },

  // -------------------------------------------------------------------------
  // Camera
  // -------------------------------------------------------------------------
  focus() {
    const p = G.player;
    const f = new THREE.Vector3(p.x / TILE, 0, p.y / TILE);
    if (p.vehicle && this.cam.mode === 'iso') { f.x += Math.cos(p.vehicle.angle) * p.vehicle.spd * 0.008; f.z += Math.sin(p.vehicle.angle) * p.vehicle.spd * 0.008; }
    return f;
  },

  updateCamera(dt, snap) {
    const c = this.cam, cam = this.camera, p = G.player;
    const f = this.focus();
    const k = snap ? 1 : Math.min(1, dt * 6);
    if (!G.started) {
      // title screen: slow fly-over of Retroville
      const t = G.time * 0.05;
      cam.position.set(75 + Math.cos(t) * 40, 26, 55 + Math.sin(t) * 30);
      cam.lookAt(75, 0, 55);
      return;
    }
    if (c.mode === 'chase') {
      if (p.vehicle && G.time - c.lastMouse > 1.2) c.yaw += angleDiff(c.yaw, p.vehicle.angle) * Math.min(1, dt * 2.5);
      const d = p.vehicle ? 8 : 6;
      const hgt = 1.2 + Math.sin(c.pitch) * d, hor = Math.cos(c.pitch) * d;
      const alt = p.vehicle ? p.vehicle.alt * 0.095 : p.alt * 0.095;
      const want = new THREE.Vector3(f.x - Math.cos(c.yaw) * hor, f.y + alt + hgt, f.z - Math.sin(c.yaw) * hor);
      cam.position.lerp(want, snap ? 1 : Math.min(1, dt * 10));
      const lookAt = new THREE.Vector3(f.x + Math.cos(c.yaw) * 2, alt + 1.3, f.z + Math.sin(c.yaw) * 2);
      this.look.lerp(lookAt, snap ? 1 : Math.min(1, dt * 12));
    } else {
      const z = ([1, 0.68, 1.45][c.zoom] || 1) * (G.map.name === 'lab' ? 0.85 : 1);
      const want = new THREE.Vector3(f.x, 20 * z, f.z + 14.5 * z);
      const jump = cam.position.distanceTo(want) > 30;
      cam.position.lerp(want, jump ? 1 : k);
      this.look.lerp(new THREE.Vector3(f.x, 0.6, f.z), jump ? 1 : k);
    }
    cam.lookAt(this.look);
  },

  // Map-pixel point under the mouse (ground plane at waist height)
  mouseWorld(mx, my) {
    const ndc = new THREE.Vector2((mx / this.W) * 2 - 1, -(my / this.H) * 2 + 1);
    this.ray.setFromCamera(ndc, this.camera);
    const h = 0.9 + (G.player.alt || 0) * 0.095;
    const o = this.ray.ray.origin, d = this.ray.ray.direction;
    if (Math.abs(d.y) < 1e-4) return { x: G.player.x, y: G.player.y };
    const t = (h - o.y) / d.y;
    if (t < 0) return { x: G.player.x + Math.cos(G.player.facing) * 300, y: G.player.y + Math.sin(G.player.facing) * 300 };
    return { x: (o.x + d.x * t) * TILE, y: (o.z + d.z * t) * TILE };
  },

  worldToScreen(px, py, h = 0) {
    const v = this.tmpV.set(px / TILE, h, py / TILE).project(this.camera);
    return { x: (v.x + 1) / 2 * this.W, y: (1 - v.y) / 2 * this.H, behind: v.z > 1 };
  },

  // -------------------------------------------------------------------------
  // Lighting
  // -------------------------------------------------------------------------
  updateLighting() {
    const lab = G.map.name === 'lab';
    const n = lab ? 0 : (G.started ? nightAmount() : 0.15);
    const day = new THREE.Color('#8fd3ff'), dusk = new THREE.Color('#ff9a6a'), night = new THREE.Color('#0d1030');
    const sky = n < 0.4 ? day.clone().lerp(dusk, n / 0.4) : dusk.clone().lerp(night, (n - 0.4) / 0.6);
    if (lab) sky.set('#05070f');
    this.scene.background.copy(sky);
    this.scene.fog.color.copy(sky);
    this.hemi.intensity = lab ? 0.5 : 0.62 - n * 0.4;
    this.hemi.color.set(lab ? '#7f9aff' : n > 0.5 ? '#6f7fd0' : '#dff1ff');
    this.sun.intensity = lab ? 0.2 : 0.78 * (1 - n) + 0.06;
    this.sun.color.set(n > 0.2 && n < 0.8 ? '#ffb27a' : '#fff2d8');
    const f = this.focus();
    this.sun.position.set(f.x - 14, 28, f.z + 9);
    this.sun.target.position.copy(f);
    this.playerLight.intensity = lab ? 0.5 : n * 1.4;
    this.playerLight.position.set(f.x, 2.2, f.z);
    WINDOW_MAT.emissive.setRGB(n * 0.95, n * 0.75, n * 0.35);
    this.lampMat.color.set(n > 0.3 ? '#fff1b0' : '#d8d4c0');
    this.haloMat.opacity = n * 0.8;
    this.groups.town.visible = !lab; this.groups.lab.visible = lab;
    this.updateSky(this.lastDt || 0, n, lab);
  },

  // Fade buildings that hide Jimmy from the overhead camera
  updateOcclusion(dt) {
    if (!this.buildings) return;
    const p = G.player, px = p.x / TILE, pz = p.y / TILE;
    const iso = this.cam.mode === 'iso' && G.map.name === 'town';
    for (const rec of this.buildings) {
      const b = rec.b;
      const hide = iso && px > b.x - 0.6 && px < b.x + b.w + 0.6 && pz < b.y + b.h && pz > b.y - 4.5;
      const target = hide ? 0.28 : 1;
      if (Math.abs(rec.fade - target) < 0.01) continue;
      rec.fade = lerp(rec.fade, target, Math.min(1, dt * 8));
      if (Math.abs(rec.fade - target) < 0.02) rec.fade = target;
      for (const mt of rec.mats) { mt.transparent = rec.fade < 1 || mt.userData.wasTransparent; mt.opacity = rec.fade * mt.userData.baseOpacity; }
    }
  },

  update(dt, snap) {
    this.lastDt = dt;
    for (const a of GFX.animators) a(G.time);
    if (G.started) {
      this.syncEntities(dt);
      this.syncProjectiles(G.map);
      this.syncEffects(G.map);
      this.syncMissionMarkers();
      this.updateOcclusion(dt);
    } else {
      this.syncEntities(dt);
    }
    this.updateLighting();
    this.updateCamera(dt, snap);
  },

  render() { this.renderer.render(this.scene, this.camera); },

  // -------------------------------------------------------------------------
  // Screen-space overlays: names, markers, speech bubbles, damage numbers
  // -------------------------------------------------------------------------
  drawOverlays(ctx) {
    const m = G.map, p = G.player;
    const topOf = (e) => { const rec = this.reg.get(e); if (!rec) return null; const h = (rec.model.height || 1.6) * (e.sizeScale ? e.sizeScale() : 1) + rec.model.root.position.y; return this.worldToScreen(e.x, e.y, h + 0.15); };
    for (const e of m.entities) {
      if (e.dead) continue;
      const near = dist(e, p) < 360;
      if (e instanceof NPC) {
        const marker = Missions.npcMarker(e.name);
        if (!near && !marker && !e.bubble) continue;
        const s = topOf(e); if (!s || s.behind) continue;
        let y = s.y;
        if (!e.citizen && near) { tag(ctx, e.name, s.x, y, '#fff'); y -= 18; }
        if (marker) {
          const b = Math.sin(G.time * 4) * 3;
          ctx.font = 'bold 26px Bungee, Fredoka, sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
          ctx.lineWidth = 5; ctx.strokeStyle = '#1d2140'; ctx.strokeText(marker, s.x, y - 8 + b);
          ctx.fillStyle = marker === '!' ? '#ffe14f' : '#7aff6a'; ctx.fillText(marker, s.x, y - 8 + b);
          y -= 30;
        }
        if (e.bubble) bubble(ctx, s.x, y - 4, e.bubble.text);
      } else if (e instanceof Enemy) {
        if (e.boss || e.type === 'nanobot' || e.hp >= e.maxHp || e.type === 'dummy' && e.hp > e.maxHp - 1) continue;
        const s = topOf(e); if (!s || s.behind) continue;
        const w = clamp(e.r * 2.2, 24, 50);
        ctx.fillStyle = 'rgba(0,0,0,0.55)'; ctx.fillRect(s.x - w / 2, s.y - 4, w, 5);
        ctx.fillStyle = e.hypno > 0 ? '#c36bff' : '#ff4f5a'; ctx.fillRect(s.x - w / 2, s.y - 4, w * clamp(e.hp / e.maxHp, 0, 1), 5);
      } else if (e instanceof Vehicle) {
        if (e.driver || p.vehicle || dist(e, p) > 150) continue;
        const s = topOf(e) || this.worldToScreen(e.x, e.y, 1.5); if (s.behind) continue;
        tag(ctx, e.def.name, s.x, s.y - 6, '#7ff0ff');
      } else if (e instanceof Clone) {
        const s = topOf(e); if (s && !s.behind) tag(ctx, 'CLONE', s.x, s.y, '#7ff0ff', 10);
      }
    }
    const g = G.goddard;
    if (g.bubble && !g.isBike) { const s = topOf(g); if (s && !s.behind) bubble(ctx, s.x, s.y - 4, g.bubble.text); }
    for (const e of m.effects) {
      if (e.type !== 'text') continue;
      const t = clamp(e.life / e.max, 0, 1);
      const s = this.worldToScreen(e.x, e.y, 1.6 + (1 - t) * 0.8);
      if (s.behind) continue;
      ctx.globalAlpha = Math.min(1, t * 2);
      ctx.font = `bold ${e.size + 2}px Bungee, Fredoka, Impact, sans-serif`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.lineWidth = 4; ctx.strokeStyle = 'rgba(0,0,0,0.75)'; ctx.strokeText(e.text, s.x, s.y); ctx.fillStyle = e.color; ctx.fillText(e.text, s.x, s.y);
    }
    ctx.globalAlpha = 1;
    // race checkpoint numbers
    const st = Missions.step();
    if (st && st.type === 'race' && m.name === 'town') {
      const c = st.checkpoints[Missions.active.cp];
      if (c) { const s = this.worldToScreen(c.x, c.y, 3.9); if (!s.behind) tag(ctx, `CHECKPOINT ${Missions.active.cp + 1}`, s.x, s.y, '#ffe14f', 12); }
    }
  },
};

function tag(ctx, text, x, y, color, size = 11) {
  ctx.font = `bold ${size}px Fredoka, sans-serif`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  ctx.lineWidth = 3; ctx.strokeStyle = 'rgba(0,0,0,0.65)'; ctx.strokeText(text, x, y);
  ctx.fillStyle = color; ctx.fillText(text, x, y);
}
function bubble(ctx, x, y, text) {
  ctx.font = 'bold 12px Fredoka, sans-serif';
  const w = ctx.measureText(text).width + 14;
  ctx.fillStyle = '#ffffff'; roundRect(ctx, x - w / 2, y - 22, w, 20, 8); ctx.fill();
  ctx.beginPath(); ctx.moveTo(x - 4, y - 2); ctx.lineTo(x, y + 4); ctx.lineTo(x + 4, y - 2); ctx.fill();
  ctx.fillStyle = '#1d2140'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  ctx.fillText(text, x, y - 12);
}

function groundBase(m, x, y) {
  const t = m.get(x, y);
  if (t === T.TREE || t === T.HEDGE) return T.GRASS;
  if (t === T.JUNK) return T.DIRT;
  if (t === T.MACHINE) return T.LABFLOOR;
  if (t === T.FENCE) {
    for (const [dx, dy] of [[0, 1], [0, -1], [1, 0], [-1, 0]]) { const n = m.get(x + dx, y + dy); if (!SOLID_TILES.has(n) && n !== T.WATER) return n; }
    return T.GRASS;
  }
  return t;
}

function glowTexture(color) {
  const c = document.createElement('canvas'); c.width = c.height = 64;
  const g = c.getContext('2d');
  const gr = g.createRadialGradient(32, 32, 0, 32, 32, 32);
  gr.addColorStop(0, color); gr.addColorStop(0.4, color); gr.addColorStop(1, 'rgba(0,0,0,0)');
  g.fillStyle = gr; g.fillRect(0, 0, 64, 64);
  return new THREE.CanvasTexture(c);
}
