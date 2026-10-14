'use strict';
// ---------------------------------------------------------------------------
// Tiles, maps, the town of Retroville and Jimmy's underground lab.
// ---------------------------------------------------------------------------

const T = {
  GRASS: 0, ROAD: 1, WALK: 2, WATER: 3, BUILDING: 4, TREE: 5, SAND: 6, PLAZA: 7,
  FENCE: 8, FLOWER: 9, LABFLOOR: 10, LABWALL: 11, DIRT: 12, BRIDGE: 13, PARKLOT: 14,
  HEDGE: 15, JUNK: 16, MACHINE: 17, PAD: 18,
};
const SOLID_TILES = new Set([T.BUILDING, T.TREE, T.FENCE, T.LABWALL, T.HEDGE, T.JUNK, T.MACHINE]);

// moveMode: 'walk' (blocked by solids + water), 'hover' (solids only), 'fly' (only map edge / lab walls)
function tileBlocks(t, mode) {
  if (mode === 'fly') return t === T.LABWALL;
  if (SOLID_TILES.has(t)) return true;
  if (mode === 'walk' && t === T.WATER) return true;
  return false;
}

class GameMap {
  constructor(name, w, h, fill) {
    this.name = name; this.w = w; this.h = h;
    this.tiles = new Uint8Array(w * h).fill(fill);
    this.deco = new Uint8Array(w * h);
    this.vary = new Uint8Array(w * h);
    this.under = new Uint8Array(w * h).fill(fill); // ground drawn beneath buildings
    const rng = mulberry32(name.length * 991 + w);
    for (let i = 0; i < this.vary.length; i++) this.vary[i] = Math.floor(rng() * 256);
    this.buildings = [];
    this.interactables = [];
    this.entities = [];
    this.projectiles = [];
    this.pickups = [];
    this.effects = [];
    this.zones = [];
    this.dark = false;
  }
  inBounds(x, y) { return x >= 0 && y >= 0 && x < this.w && y < this.h; }
  get(x, y) { return this.inBounds(x, y) ? this.tiles[y * this.w + x] : T.LABWALL; }
  set(x, y, t) { if (this.inBounds(x, y)) this.tiles[y * this.w + x] = t; }
  rect(x, y, w, h, t) { for (let j = y; j < y + h; j++) for (let i = x; i < x + w; i++) this.set(i, j, t); }
  rectIf(x, y, w, h, t, onlyOn) { for (let j = y; j < y + h; j++) for (let i = x; i < x + w; i++) if (this.get(i, j) === onlyOn) this.set(i, j, t); }
  ellipse(cx, cy, rx, ry, t) {
    for (let j = Math.floor(cy - ry); j <= cy + ry; j++)
      for (let i = Math.floor(cx - rx); i <= cx + rx; i++) {
        const dx = (i - cx) / rx, dy = (j - cy) / ry;
        if (dx * dx + dy * dy <= 1) this.set(i, j, t);
      }
  }
  tileAtPx(px, py) { return this.get(Math.floor(px / TILE), Math.floor(py / TILE)); }
  blockedAt(px, py, mode) { return tileBlocks(this.tileAtPx(px, py), mode); }
  // Does a circle at (x,y) radius r overlap any blocking tile?
  circleBlocked(x, y, r, mode) {
    const x0 = Math.floor((x - r) / TILE), x1 = Math.floor((x + r) / TILE);
    const y0 = Math.floor((y - r) / TILE), y1 = Math.floor((y + r) / TILE);
    for (let ty = y0; ty <= y1; ty++) for (let tx = x0; tx <= x1; tx++) {
      if (!tileBlocks(this.get(tx, ty), mode)) continue;
      const cx = clamp(x, tx * TILE, tx * TILE + TILE), cy = clamp(y, ty * TILE, ty * TILE + TILE);
      if ((x - cx) * (x - cx) + (y - cy) * (y - cy) < r * r) return true;
    }
    return false;
  }
  addBuilding(b) {
    b.kind = b.kind || 'house';
    this.buildings.push(b);
    for (let j = b.y; j < b.y + b.h; j++) for (let i = b.x; i < b.x + b.w; i++) if (this.inBounds(i, j)) this.under[j * this.w + i] = this.get(i, j);
    this.rect(b.x, b.y, b.w, b.h, T.BUILDING);
    if (b.door !== false) {
      const dx = b.x + Math.floor(b.w / 2), dy = b.y + b.h;
      b.doorTile = { x: dx, y: dy };
      if (tileBlocks(this.get(dx, dy), 'walk')) this.set(dx, dy, T.WALK);
    }
    return b;
  }
  zoneAt(px, py) {
    const tx = px / TILE, ty = py / TILE;
    for (const z of this.zones) if (tx >= z.x && ty >= z.y && tx < z.x + z.w && ty < z.y + z.h) return z;
    return null;
  }
  // Nearest open spot for something of radius r (spiral search).
  findOpen(px, py, r, mode = 'walk') {
    if (!this.circleBlocked(px, py, r, mode)) return { x: px, y: py };
    for (let rad = 16; rad < 600; rad += 16) {
      for (let a = 0; a < Math.PI * 2; a += Math.PI / 8) {
        const x = px + Math.cos(a) * rad, y = py + Math.sin(a) * rad;
        if (!this.circleBlocked(x, y, r, mode)) return { x, y };
      }
    }
    return { x: px, y: py };
  }
}

// ---------------------------------------------------------------------------
// Retroville
// ---------------------------------------------------------------------------
const V_ROADS = [25, 60, 95, 125];
const H_ROADS = [20, 50, 80];

function buildTown() {
  const m = new GameMap('town', 150, 110, T.GRASS);
  const rng = mulberry32(42);
  const riverX = (y) => 107 + Math.round(Math.sin(y / 9) * 1.5);

  // River first, so roads crossing it become bridges.
  for (let y = 0; y < m.h; y++) { const x0 = riverX(y); m.rect(x0, y, 4, 1, T.WATER); }
  for (let y = 0; y < m.h; y++) { const x0 = riverX(y); if (m.get(x0 - 1, y) === T.GRASS) m.set(x0 - 1, y, T.SAND); if (m.get(x0 + 4, y) === T.GRASS) m.set(x0 + 4, y, T.SAND); }

  const road = (x, y) => { const t = m.get(x, y); m.set(x, y, t === T.WATER || t === T.BRIDGE ? T.BRIDGE : T.ROAD); };
  for (const vx of V_ROADS) for (let y = 0; y < m.h; y++) for (let i = -1; i <= 1; i++) road(vx + i, y);
  for (const hy of H_ROADS) for (let x = 0; x < m.w; x++) for (let i = -1; i <= 1; i++) road(x, hy + i);
  // Lane markings
  for (const vx of V_ROADS) for (let y = 0; y < m.h; y++) if (!H_ROADS.some((hy) => Math.abs(hy - y) <= 1)) m.deco[y * m.w + vx] = 1;
  for (const hy of H_ROADS) for (let x = 0; x < m.w; x++) if (!V_ROADS.some((vx) => Math.abs(vx - x) <= 1) && m.get(x, hy) === T.ROAD) m.deco[hy * m.w + x] = 2;
  // Sidewalks around every road tile.
  const snapshot = m.tiles.slice();
  for (let y = 0; y < m.h; y++) for (let x = 0; x < m.w; x++) {
    if (snapshot[y * m.w + x] !== T.ROAD) continue;
    for (let j = -1; j <= 1; j++) for (let i = -1; i <= 1; i++) {
      const t = m.get(x + i, y + j);
      if (t === T.GRASS || t === T.SAND) m.set(x + i, y + j, T.WALK);
    }
  }

  const scatterTrees = (x, y, w, h, density) => {
    for (let j = y; j < y + h; j++) for (let i = x; i < x + w; i++)
      if (m.get(i, j) === T.GRASS && rng() < density) m.set(i, j, T.TREE);
  };
  const scatterFlowers = (x, y, w, h, density) => {
    for (let j = y; j < y + h; j++) for (let i = x; i < x + w; i++)
      if (m.get(i, j) === T.GRASS && rng() < density) m.set(i, j, T.FLOWER);
  };

  // --- North: woods, hills/observatory, dump, crash site -------------------
  scatterTrees(0, 0, 23, 18, 0.32);
  m.rect(7, 6, 8, 6, T.GRASS); // clearing
  m.addBuilding({ name: 'Retroville Observatory', x: 36, y: 5, w: 10, h: 8, wall: '#d9d4e8', roof: '#7a6fb5', kind: 'observatory' });
  scatterTrees(28, 0, 31, 18, 0.07);
  m.rect(63, 0, 31, 18, T.DIRT);
  for (let i = 63; i < 94; i++) { m.set(i, 0, T.FENCE); if (i < 76 || i > 80) m.set(i, 17, T.FENCE); }
  for (let j = 0; j < 18; j++) { m.set(63, j, T.FENCE); m.set(93, j, T.FENCE); }
  for (let k = 0; k < 26; k++) { const x = 66 + Math.floor(rng() * 25), y = 2 + Math.floor(rng() * 13); if (Math.abs(x - 78) > 3) m.rect(x, y, 1 + Math.floor(rng() * 2), 1 + Math.floor(rng() * 2), T.JUNK); }
  scatterTrees(98, 0, 9, 18, 0.25);
  m.rectIf(114, 0, 36, 18, T.SAND, T.GRASS);
  m.ellipse(137, 9, 11, 7, T.DIRT);
  m.addBuilding({ name: 'Crashed Yokian Ship', x: 133, y: 6, w: 8, h: 4, wall: '#9be37a', roof: '#3f8a3a', kind: 'wreck', door: false });

  // --- Row 2: west houses, Neutron St, Candy Bar block, mall --------------
  m.addBuilding({ name: "Butch's House", x: 3, y: 25, w: 8, h: 6, wall: '#c9a27e', roof: '#6d4c3d' });
  m.addBuilding({ name: "Nick's House", x: 13, y: 25, w: 8, h: 6, wall: '#a8c8e8', roof: '#3f5f8a' });
  m.addBuilding({ name: "Ms. Fowl's House", x: 5, y: 38, w: 9, h: 6, wall: '#e8c8e0', roof: '#8a4f7a' });
  scatterTrees(0, 32, 23, 17, 0.06);

  m.addBuilding({ name: 'Neutron House', x: 30, y: 24, w: 10, h: 6, wall: '#f2e2b4', roof: '#c0453a', kind: 'neutron' });
  const club = m.addBuilding({ name: "Jimmy's Clubhouse", x: 43, y: 25, w: 5, h: 5, wall: '#c4cbd6', roof: '#3d6fd1', kind: 'lab' });
  m.rect(50, 24, 7, 7, T.PAD);
  m.rect(34, 31, 4, 4, T.PARKLOT);
  m.addBuilding({ name: "Carl's House", x: 30, y: 39, w: 9, h: 6, wall: '#f0d7a2', roof: '#9a6b3f' });
  m.addBuilding({ name: "Sheen's House", x: 43, y: 39, w: 9, h: 6, wall: '#b7e0b0', roof: '#4b8a3f' });
  for (let i = 28; i <= 58; i++) if (m.get(i, 37) === T.GRASS) m.set(i, 37, i % 5 === 0 ? T.GRASS : T.HEDGE);
  scatterFlowers(28, 23, 31, 26, 0.05);

  m.addBuilding({ name: "Cindy's House", x: 64, y: 24, w: 9, h: 6, wall: '#f5e6c8', roof: '#d17a3d' });
  m.addBuilding({ name: "Libby's House", x: 77, y: 24, w: 9, h: 6, wall: '#e3c6f0', roof: '#7a3f9a' });
  m.addBuilding({ name: 'The Candy Bar', x: 65, y: 37, w: 12, h: 7, wall: '#ffd1e3', roof: '#e0427a', kind: 'candy' });
  m.rect(79, 36, 13, 11, T.PARKLOT);
  scatterTrees(98, 23, 9, 26, 0.18);
  m.addBuilding({ name: 'Retroville Mall', x: 129, y: 25, w: 18, h: 10, wall: '#d6dde6', roof: '#4c5a70', kind: 'big' });
  m.rect(128, 37, 21, 11, T.PARKLOT);
  scatterTrees(114, 23, 9, 26, 0.2);

  // --- Row 3: lake, school, downtown, Retroland ---------------------------
  m.ellipse(11, 65, 9, 9, T.SAND);
  m.ellipse(11, 65, 7.5, 7.5, T.WATER);
  scatterTrees(0, 53, 23, 26, 0.12);
  m.addBuilding({ name: 'Lindbergh Elementary', x: 31, y: 54, w: 20, h: 9, wall: '#e0b48a', roof: '#8a3f3f', kind: 'school' });
  m.rect(30, 66, 12, 12, T.SAND);
  for (let j = 66; j < 78; j++) for (let i = 45; i < 58; i++) if (i === 45 || i === 57 || j === 66 || j === 77 || i === 51) m.deco[j * m.w + i] = 3;

  m.rect(63, 63, 31, 16, T.PLAZA);
  m.rect(77, 69, 3, 3, T.WATER);
  m.addBuilding({ name: 'Retroville Town Hall', x: 71, y: 54, w: 13, h: 8, wall: '#ece6d6', roof: '#5b6b7a', kind: 'townhall' });
  m.addBuilding({ name: 'Retro Cinema', x: 64, y: 72, w: 8, h: 6, wall: '#2f2f48', roof: '#b8323c', kind: 'shop' });
  m.addBuilding({ name: 'Retroville Library', x: 85, y: 72, w: 8, h: 6, wall: '#dcc9a5', roof: '#55703f', kind: 'shop' });
  scatterTrees(98, 53, 9, 26, 0.2);
  scatterTrees(114, 53, 9, 57, 0.18);

  m.rect(129, 54, 20, 55, T.PLAZA);
  for (let j = 53; j <= 109; j++) { if (j < 64 || j > 67) m.set(128, j, T.FENCE); m.set(149, j, T.FENCE); }
  for (let i = 128; i <= 149; i++) { m.set(i, 53, T.FENCE); m.set(i, 109, T.FENCE); }
  m.addBuilding({ name: 'Ferris Wheel', x: 133, y: 56, w: 8, h: 8, wall: '#ffffff', roof: '#ff4f7a', kind: 'ferris', door: false });
  m.addBuilding({ name: 'Bat Coaster', x: 140, y: 70, w: 7, h: 14, wall: '#3a3a5a', roof: '#ffb23f', kind: 'coaster', door: false });
  m.addBuilding({ name: 'Bumper Cars', x: 131, y: 88, w: 8, h: 6, wall: '#ffe066', roof: '#3fa7ff', kind: 'shop' });
  m.addBuilding({ name: 'Snack Shack', x: 141, y: 96, w: 5, h: 4, wall: '#fff0d0', roof: '#ff7a3f', kind: 'shop' });

  // --- Row 4: warehouses, park ---------------------------------------------
  m.rectIf(0, 83, 23, 27, T.DIRT, T.GRASS);
  m.rectIf(28, 83, 31, 27, T.PARKLOT, T.GRASS);
  m.addBuilding({ name: 'Warehouse 7', x: 3, y: 85, w: 12, h: 7, wall: '#8a8f99', roof: '#4b505a', kind: 'warehouse' });
  m.addBuilding({ name: 'Warehouse 9', x: 3, y: 97, w: 12, h: 8, wall: '#8a8f99', roof: '#4b505a', kind: 'warehouse' });
  m.addBuilding({ name: 'Calamitous Industries', x: 30, y: 85, w: 12, h: 8, wall: '#5a4a6a', roof: '#2a1f35', kind: 'warehouse' });
  m.addBuilding({ name: 'Retroville Recycling', x: 45, y: 85, w: 11, h: 7, wall: '#8aa08a', roof: '#3f5a3f', kind: 'warehouse' });
  m.addBuilding({ name: 'Old Toy Factory', x: 31, y: 98, w: 16, h: 8, wall: '#a07a5a', roof: '#5a3a2a', kind: 'warehouse' });
  for (let k = 0; k < 10; k++) { const x = 17 + Math.floor(rng() * 5), y = 85 + Math.floor(rng() * 22); m.set(x, y, T.JUNK); }

  m.ellipse(78, 96, 8.5, 6.5, T.SAND);
  m.ellipse(78, 96, 7, 5, T.WATER);
  scatterTrees(63, 83, 31, 27, 0.08);
  scatterFlowers(63, 83, 31, 27, 0.08);
  scatterTrees(98, 83, 9, 27, 0.2);

  // Keep a clear path around the clubhouse & launch pad.
  m.rectIf(41, 30, 9, 2, T.GRASS, T.TREE);

  m.zones = [
    { name: 'Retroville Woods', x: 0, y: 0, w: 23, h: 18, enemies: ['twonky', 'robot'] },
    { name: 'Retroville Hills', x: 23, y: 0, w: 37, h: 18, enemies: ['twonky', 'yokian'] },
    { name: 'Retroville Dump', x: 60, y: 0, w: 37, h: 18, enemies: ['robot', 'nanobot'] },
    { name: 'Yokian Crash Site', x: 114, y: 0, w: 36, h: 18, enemies: ['yokian', 'yokian', 'saucer'] },
    { name: 'West Retroville', x: 0, y: 18, w: 23, h: 33, enemies: ['twonky', 'robot'] },
    { name: 'Neutron Street', x: 23, y: 18, w: 37, h: 33, enemies: ['twonky'], safe: true },
    { name: 'Candy Bar District', x: 60, y: 18, w: 37, h: 33, enemies: ['twonky', 'yokian'] },
    { name: 'Retroville Mall', x: 114, y: 18, w: 36, h: 33, enemies: ['yokian', 'robot'] },
    { name: 'Retroville Lake', x: 0, y: 51, w: 23, h: 30, enemies: ['twonky', 'nanobot'] },
    { name: 'Lindbergh Elementary', x: 23, y: 51, w: 37, h: 30, enemies: ['nanobot', 'twonky'] },
    { name: 'Downtown Retroville', x: 60, y: 51, w: 37, h: 30, enemies: ['yokian', 'robot', 'twonky'] },
    { name: 'Retroland', x: 126, y: 51, w: 24, h: 59, enemies: ['twonky', 'twonky', 'nanobot'] },
    { name: 'Warehouse District', x: 0, y: 81, w: 60, h: 29, enemies: ['robot', 'robot', 'nanobot'] },
    { name: 'Retroville Park', x: 60, y: 81, w: 37, h: 29, enemies: ['twonky', 'yokian'] },
    { name: 'Retroville River', x: 97, y: 0, w: 29, h: 110, enemies: ['yokian', 'twonky'] },
  ];
  m.clubhouse = club;
  return m;
}

// ---------------------------------------------------------------------------
// Jimmy's Lab (under the clubhouse)
// ---------------------------------------------------------------------------
function buildLab() {
  const m = new GameMap('lab', 30, 20, T.LABFLOOR);
  m.dark = true;
  for (let x = 0; x < m.w; x++) { m.set(x, 0, T.LABWALL); m.set(x, m.h - 1, T.LABWALL); }
  for (let y = 0; y < m.h; y++) { m.set(0, y, T.LABWALL); m.set(m.w - 1, y, T.LABWALL); }
  // Training room divider
  for (let y = 9; y < 19; y++) if (y < 12 || y > 14) m.set(19, y, T.LABWALL);
  m.stations = [
    { id: 'vox', name: 'VOX Mission Computer', x: 13, y: 1, w: 4, h: 2, color: '#3fe0ff' },
    { id: 'upgrade', name: 'Invention Workbench', x: 3, y: 2, w: 4, h: 2, color: '#ffb23f' },
    { id: 'vehicles', name: 'Vehicle Bay', x: 23, y: 2, w: 4, h: 2, color: '#7aff6a' },
    { id: 'heal', name: 'Neutron Recharge Pod', x: 2, y: 13, w: 2, h: 3, color: '#ff5fa2' },
    { id: 'vault', name: 'Invention Vault', x: 7, y: 9, w: 3, h: 2, color: '#b48aff' },
    { id: 'cloner', name: 'Brain-Drain Helmet Rack', x: 12, y: 9, w: 3, h: 2, color: '#ffe066' },
  ];
  for (const s of m.stations) m.rect(s.x, s.y, s.w, s.h, T.MACHINE);
  m.exit = tp(15, 18);
  m.zones = [{ name: "Jimmy's Lab", x: 0, y: 0, w: 30, h: 20, enemies: [] }];
  return m;
}

// ---------------------------------------------------------------------------
// Rendering
// ---------------------------------------------------------------------------
const TILE_COLORS = {
  [T.GRASS]: ['#6cc04a', '#66b946', '#71c54f', '#62b343'],
  [T.ROAD]: ['#50525c', '#4d4f59', '#53555f', '#4b4d57'],
  [T.WALK]: ['#cfc8b8', '#c9c2b2', '#d3ccbc', '#ccc5b5'],
  [T.SAND]: ['#ecd896', '#e8d38f', '#efdc9d', '#e5cf8a'],
  [T.PLAZA]: ['#ddd2bd', '#d6cbb5', '#e1d7c3', '#d9ceb9'],
  [T.DIRT]: ['#a3825a', '#9d7c55', '#a8875f', '#987750'],
  [T.PARKLOT]: ['#6e7078', '#6a6c74', '#72747c', '#686a72'],
  [T.LABFLOOR]: ['#262c45', '#242a42', '#282e48', '#232941'],
};

function drawTile(ctx, m, tx, ty, t, time) {
  const x = tx * TILE, y = ty * TILE, i = ty * m.w + tx, v = m.vary[i];
  const base = (arr) => arr[v & 3];
  if (t === T.BUILDING) t = m.under[i] === T.BUILDING ? T.GRASS : m.under[i];
  switch (t) {
    case T.GRASS: case T.FLOWER: case T.TREE: case T.HEDGE: case T.FENCE: {
      const onDirt = t === T.FENCE && m.name === 'town' && (m.get(tx, ty + 1) === T.DIRT || m.get(tx, ty - 1) === T.DIRT);
      ctx.fillStyle = onDirt ? base(TILE_COLORS[T.DIRT]) : base(TILE_COLORS[T.GRASS]);
      ctx.fillRect(x, y, TILE, TILE);
      if (t === T.GRASS && (v & 7) === 1) { ctx.fillStyle = '#5aa83c'; ctx.fillRect(x + (v % 20) + 4, y + 10, 2, 5); ctx.fillRect(x + (v % 20) + 7, y + 12, 2, 4); }
      if (t === T.FLOWER) {
        const cols = ['#ff6fa8', '#ffe14f', '#ffffff', '#b98aff'];
        for (let k = 0; k < 3; k++) { ctx.fillStyle = cols[(v + k) & 3]; ctx.beginPath(); ctx.arc(x + 6 + ((v * (k + 3)) % 20), y + 6 + ((v * (k + 7)) % 20), 3, 0, 7); ctx.fill(); }
      }
      if (t === T.HEDGE) { ctx.fillStyle = '#2f7a34'; roundRect(ctx, x + 1, y + 4, TILE - 2, TILE - 6, 8); ctx.fill(); ctx.fillStyle = '#3d9443'; roundRect(ctx, x + 3, y + 5, TILE - 6, 12, 6); ctx.fill(); }
      if (t === T.FENCE) {
        ctx.fillStyle = '#f4f0e6';
        ctx.fillRect(x, y + 12, TILE, 4); ctx.fillRect(x, y + 21, TILE, 3);
        ctx.fillStyle = '#d8d0c0'; ctx.fillRect(x + 4, y + 6, 5, 22); ctx.fillRect(x + 20, y + 6, 5, 22);
      }
      break;
    }
    case T.WATER: {
      ctx.fillStyle = '#3d93db'; ctx.fillRect(x, y, TILE, TILE);
      ctx.strokeStyle = 'rgba(255,255,255,0.35)'; ctx.lineWidth = 2;
      const o = Math.sin(time * 2 + tx * 0.7 + ty * 0.5) * 4;
      ctx.beginPath(); ctx.moveTo(x + 4 + o, y + 10 + (v & 7)); ctx.lineTo(x + 14 + o, y + 10 + (v & 7)); ctx.stroke();
      break;
    }
    case T.BRIDGE: {
      ctx.fillStyle = '#a5743f'; ctx.fillRect(x, y, TILE, TILE);
      ctx.fillStyle = '#8a5d2f';
      const vertical = m.get(tx, ty - 1) === T.BRIDGE && m.get(tx, ty + 1) === T.BRIDGE && m.get(tx - 1, ty) !== T.BRIDGE;
      if (vertical) for (let k = 0; k < 4; k++) ctx.fillRect(x, y + k * 8, TILE, 2);
      else for (let k = 0; k < 4; k++) ctx.fillRect(x + k * 8, y, 2, TILE);
      break;
    }
    case T.ROAD: {
      ctx.fillStyle = base(TILE_COLORS[T.ROAD]); ctx.fillRect(x, y, TILE, TILE);
      const d = m.deco[i];
      ctx.fillStyle = '#f2d34a';
      if (d === 1 && ty % 2 === 0) ctx.fillRect(x + 14, y + 4, 4, 22);
      if (d === 2 && tx % 2 === 0) ctx.fillRect(x + 4, y + 14, 22, 4);
      break;
    }
    case T.WALK: {
      ctx.fillStyle = base(TILE_COLORS[T.WALK]); ctx.fillRect(x, y, TILE, TILE);
      ctx.strokeStyle = 'rgba(0,0,0,0.08)'; ctx.lineWidth = 1; ctx.strokeRect(x + 0.5, y + 0.5, TILE - 1, TILE - 1);
      break;
    }
    case T.PLAZA: {
      ctx.fillStyle = (tx + ty) % 2 ? '#ddd2bd' : '#d2c6ae'; ctx.fillRect(x, y, TILE, TILE);
      break;
    }
    case T.PARKLOT: {
      ctx.fillStyle = base(TILE_COLORS[T.PARKLOT]); ctx.fillRect(x, y, TILE, TILE);
      if (tx % 3 === 0) { ctx.fillStyle = 'rgba(255,255,255,0.5)'; ctx.fillRect(x, y + 4, 2, 24); }
      break;
    }
    case T.PAD: {
      ctx.fillStyle = '#7d8696'; ctx.fillRect(x, y, TILE, TILE);
      ctx.strokeStyle = '#5c6474'; ctx.strokeRect(x + 0.5, y + 0.5, TILE - 1, TILE - 1);
      break;
    }
    case T.JUNK: {
      ctx.fillStyle = base(TILE_COLORS[T.DIRT]); ctx.fillRect(x, y, TILE, TILE);
      const cols = ['#7a7f88', '#a35a3a', '#5a6a7a', '#c8b04a'];
      for (let k = 0; k < 4; k++) { ctx.fillStyle = cols[(v + k) & 3]; ctx.fillRect(x + 3 + ((v * (k + 2)) % 18), y + 4 + ((v * (k + 5)) % 16), 10, 8); }
      break;
    }
    case T.LABFLOOR: case T.MACHINE: {
      ctx.fillStyle = base(TILE_COLORS[T.LABFLOOR]); ctx.fillRect(x, y, TILE, TILE);
      ctx.strokeStyle = 'rgba(63,224,255,0.12)'; ctx.strokeRect(x + 0.5, y + 0.5, TILE - 1, TILE - 1);
      break;
    }
    case T.LABWALL: {
      ctx.fillStyle = '#141829'; ctx.fillRect(x, y, TILE, TILE);
      ctx.fillStyle = '#2b3352'; ctx.fillRect(x + 2, y + 2, TILE - 4, TILE - 4);
      ctx.fillStyle = 'rgba(63,224,255,0.25)'; ctx.fillRect(x + 2, y + TILE - 6, TILE - 4, 2);
      break;
    }
    default: {
      const arr = TILE_COLORS[t];
      ctx.fillStyle = arr ? base(arr) : '#f0f';
      ctx.fillRect(x, y, TILE, TILE);
      if (t === T.SAND && (v & 15) === 3) { ctx.fillStyle = '#d8c27a'; ctx.fillRect(x + 8, y + 12, 3, 3); }
    }
  }
  if (m.deco[i] === 3) { ctx.fillStyle = 'rgba(255,255,255,0.75)'; ctx.fillRect(x, y + 14, TILE, 3); ctx.fillRect(x + 14, y, 3, TILE); }
}

function drawTreeCanopy(ctx, tx, ty, v) {
  const x = tx * TILE + 16, y = ty * TILE + 16;
  ctx.fillStyle = 'rgba(0,0,0,0.18)'; ctx.beginPath(); ctx.ellipse(x + 3, y + 10, 15, 7, 0, 0, 7); ctx.fill();
  ctx.fillStyle = '#6b4a2a'; ctx.fillRect(x - 3, y, 6, 12);
  const g = (v & 1) ? '#2f8a3a' : '#357f2f';
  ctx.fillStyle = g; ctx.beginPath(); ctx.arc(x, y - 6, 15, 0, 7); ctx.fill();
  ctx.fillStyle = (v & 2) ? '#48a650' : '#4a9a3d'; ctx.beginPath(); ctx.arc(x - 4, y - 10, 9, 0, 7); ctx.fill();
}

function drawBuilding(ctx, b, time) {
  const x = b.x * TILE, y = b.y * TILE, w = b.w * TILE, h = b.h * TILE;
  if (b.kind === 'ferris') return drawFerris(ctx, x, y, w, h, time);
  if (b.kind === 'coaster') return drawCoaster(ctx, x, y, w, h, time);
  if (b.kind === 'wreck') return drawWreck(ctx, x, y, w, h, time);

  ctx.fillStyle = 'rgba(0,0,0,0.22)'; ctx.fillRect(x + 6, y + 8, w, h);
  const roofH = Math.floor(h * 0.55);
  // front wall
  ctx.fillStyle = b.wall; ctx.fillRect(x, y + roofH, w, h - roofH);
  ctx.fillStyle = shade(b.wall, -25); ctx.fillRect(x, y + h - 4, w, 4);
  // windows
  const wy = y + roofH + 8, wh = Math.max(10, h - roofH - 30);
  const glow = b.kind === 'lab' ? '#7ff0ff' : '#bfe6ff';
  for (let wx = x + 12; wx < x + w - 24; wx += 34) {
    if (Math.abs(wx + 9 - (x + w / 2)) < 22) continue;
    ctx.fillStyle = '#3a3f4a'; ctx.fillRect(wx - 1, wy - 1, 20, wh + 2);
    ctx.fillStyle = glow; ctx.fillRect(wx, wy, 18, wh);
    ctx.fillStyle = 'rgba(255,255,255,0.6)'; ctx.fillRect(wx + 2, wy + 2, 5, wh - 4);
  }
  // door
  if (b.door !== false) {
    const dw = b.kind === 'big' || b.kind === 'school' || b.kind === 'townhall' ? 34 : 20;
    const dx = x + Math.floor(b.w / 2) * TILE + 16 - dw / 2;
    ctx.fillStyle = b.kind === 'lab' ? '#2b3352' : shade(b.roof, -30);
    ctx.fillRect(dx, y + h - 26, dw, 26);
    ctx.fillStyle = '#ffd34a'; ctx.fillRect(dx + dw - 6, y + h - 14, 3, 3);
  }
  // roof
  const rg = ctx.createLinearGradient(0, y, 0, y + roofH);
  rg.addColorStop(0, shade(b.roof, 30)); rg.addColorStop(1, shade(b.roof, -20));
  ctx.fillStyle = rg; ctx.fillRect(x - 4, y, w + 8, roofH);
  ctx.fillStyle = shade(b.roof, -45); ctx.fillRect(x - 4, y + roofH - 4, w + 8, 4);
  ctx.strokeStyle = 'rgba(0,0,0,0.12)'; ctx.lineWidth = 1;
  for (let ly = y + 8; ly < y + roofH - 4; ly += 8) { ctx.beginPath(); ctx.moveTo(x - 4, ly); ctx.lineTo(x + w + 4, ly); ctx.stroke(); }

  if (b.kind === 'lab') {
    // satellite dish + antenna, the signature of Jimmy's clubhouse
    ctx.strokeStyle = '#d0d8e8'; ctx.lineWidth = 3;
    ctx.beginPath(); ctx.moveTo(x + w - 20, y + 10); ctx.lineTo(x + w - 20, y - 22); ctx.stroke();
    ctx.fillStyle = Math.sin(time * 6) > 0 ? '#ff4040' : '#ffaaaa'; ctx.beginPath(); ctx.arc(x + w - 20, y - 24, 4, 0, 7); ctx.fill();
    ctx.fillStyle = '#e8eef8'; ctx.beginPath(); ctx.ellipse(x + 28, y + 14, 16, 10, -0.5, 0, 7); ctx.fill();
    ctx.fillStyle = '#9aa6bc'; ctx.beginPath(); ctx.arc(x + 28, y + 14, 3, 0, 7); ctx.fill();
  }
  if (b.kind === 'observatory') {
    ctx.fillStyle = '#e8e4f4'; ctx.beginPath(); ctx.arc(x + w / 2, y + roofH * 0.7, w * 0.32, Math.PI, 0); ctx.fill();
    ctx.fillStyle = '#3a3460'; ctx.fillRect(x + w / 2 - 6, y + roofH * 0.7 - w * 0.32, 12, w * 0.3);
  }
  if (b.kind === 'candy') {
    for (let k = 0; k < w; k += 24) { ctx.fillStyle = (k / 24) % 2 ? '#ffffff' : '#ff6fa8'; ctx.fillRect(x + k, y + roofH, 24, 10); }
  }
  if (b.kind === 'school') {
    ctx.fillStyle = '#c0453a'; ctx.fillRect(x + w / 2 - 2, y - 26, 3, 30);
    ctx.fillStyle = '#3d6fd1'; ctx.fillRect(x + w / 2 + 1, y - 26, 18, 11);
  }
  // sign
  ctx.font = 'bold 12px Fredoka, "Trebuchet MS", sans-serif';
  const tw = ctx.measureText(b.name).width + 12;
  const sx = x + w / 2 - tw / 2, sy = y + roofH - 22;
  ctx.fillStyle = 'rgba(20,20,35,0.75)'; roundRect(ctx, sx, sy, tw, 17, 5); ctx.fill();
  ctx.fillStyle = '#ffffff'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  ctx.fillText(b.name, x + w / 2, sy + 9);
}

function drawFerris(ctx, x, y, w, h, time) {
  const cx = x + w / 2, cy = y + h / 2, r = Math.min(w, h) / 2 - 10;
  ctx.fillStyle = 'rgba(0,0,0,0.2)'; ctx.beginPath(); ctx.ellipse(cx + 8, y + h - 6, r, 12, 0, 0, 7); ctx.fill();
  ctx.strokeStyle = '#8a8fa0'; ctx.lineWidth = 6;
  ctx.beginPath(); ctx.moveTo(cx - 40, y + h); ctx.lineTo(cx, cy); ctx.lineTo(cx + 40, y + h); ctx.stroke();
  ctx.strokeStyle = '#ffffff'; ctx.lineWidth = 4; ctx.beginPath(); ctx.arc(cx, cy, r, 0, 7); ctx.stroke();
  const n = 10;
  for (let k = 0; k < n; k++) {
    const a = time * 0.4 + (k / n) * Math.PI * 2;
    const px = cx + Math.cos(a) * r, py = cy + Math.sin(a) * r;
    ctx.strokeStyle = 'rgba(255,255,255,0.6)'; ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(cx, cy); ctx.lineTo(px, py); ctx.stroke();
    ctx.fillStyle = ['#ff4f7a', '#3fa7ff', '#ffe066', '#7aff6a'][k % 4];
    roundRect(ctx, px - 9, py - 4, 18, 14, 4); ctx.fill();
  }
  ctx.fillStyle = '#ff4f7a'; ctx.beginPath(); ctx.arc(cx, cy, 8, 0, 7); ctx.fill();
}

function drawCoaster(ctx, x, y, w, h, time) {
  ctx.fillStyle = 'rgba(0,0,0,0.15)'; ctx.fillRect(x + 6, y + 6, w, h);
  ctx.strokeStyle = '#ffb23f'; ctx.lineWidth = 6;
  const path = (t) => ({ x: x + w / 2 + Math.sin(t * 2) * (w / 2 - 14), y: y + h / 2 + Math.cos(t) * (h / 2 - 14) });
  ctx.beginPath();
  for (let t = 0; t <= Math.PI * 2 + 0.05; t += 0.05) { const p = path(t); t === 0 ? ctx.moveTo(p.x, p.y) : ctx.lineTo(p.x, p.y); }
  ctx.stroke();
  ctx.strokeStyle = '#3a3a5a'; ctx.lineWidth = 2; ctx.stroke();
  for (let k = 0; k < 4; k++) {
    const p = path(time * 1.4 + k * 0.12);
    ctx.fillStyle = k === 0 ? '#ff4040' : '#c02a2a'; ctx.beginPath(); ctx.arc(p.x, p.y, 7, 0, 7); ctx.fill();
  }
  ctx.font = 'bold 12px Fredoka, sans-serif'; ctx.fillStyle = '#fff'; ctx.textAlign = 'center';
  ctx.fillText('BAT COASTER', x + w / 2, y + 12);
}

function drawWreck(ctx, x, y, w, h, time) {
  const cx = x + w / 2, cy = y + h / 2;
  ctx.fillStyle = 'rgba(0,0,0,0.3)'; ctx.beginPath(); ctx.ellipse(cx + 8, cy + 14, w / 2 + 10, h / 2 + 4, 0.15, 0, 7); ctx.fill();
  ctx.save(); ctx.translate(cx, cy); ctx.rotate(0.15);
  ctx.fillStyle = '#7fcf5a'; ctx.beginPath(); ctx.ellipse(0, 0, w / 2 + 6, h / 2, 0, 0, 7); ctx.fill();
  ctx.fillStyle = '#5aa63f'; ctx.beginPath(); ctx.ellipse(0, 6, w / 2 + 6, h / 4, 0, 0, Math.PI); ctx.fill();
  ctx.fillStyle = 'rgba(200,255,220,0.7)'; ctx.beginPath(); ctx.ellipse(-10, -10, 40, 22, 0, Math.PI, 0); ctx.fill();
  ctx.restore();
  for (let k = 0; k < 3; k++) {
    const t = (time * 0.6 + k / 3) % 1;
    ctx.fillStyle = `rgba(90,90,90,${0.5 * (1 - t)})`; ctx.beginPath(); ctx.arc(cx + 30 + t * 20, cy - 20 - t * 60, 8 + t * 14, 0, 7); ctx.fill();
  }
}

function drawStation(ctx, s, time) {
  const x = s.x * TILE, y = s.y * TILE, w = s.w * TILE, h = s.h * TILE;
  ctx.fillStyle = 'rgba(0,0,0,0.35)'; ctx.fillRect(x + 4, y + 6, w, h);
  ctx.fillStyle = '#3a4466'; roundRect(ctx, x, y, w, h, 6); ctx.fill();
  ctx.strokeStyle = s.color; ctx.lineWidth = 2; roundRect(ctx, x + 1, y + 1, w - 2, h - 2, 6); ctx.stroke();
  const pulse = 0.5 + Math.sin(time * 3 + s.x) * 0.25;
  ctx.globalAlpha = pulse; ctx.fillStyle = s.color;
  if (s.id === 'vox') {
    for (let k = 0; k < 3; k++) { ctx.fillRect(x + 8 + k * 38, y + 8, 30, 26); }
    ctx.globalAlpha = 1; ctx.fillStyle = '#0a1a24';
    for (let k = 0; k < 3; k++) for (let l = 0; l < 4; l++) ctx.fillRect(x + 11 + k * 38, y + 12 + l * 5, 8 + ((l * 7 + k * 5 + Math.floor(time * 4)) % 16), 2);
  } else if (s.id === 'heal') {
    ctx.beginPath(); ctx.ellipse(x + w / 2, y + h / 2, w / 2 - 6, h / 2 - 8, 0, 0, 7); ctx.fill();
  } else if (s.id === 'vehicles') {
    ctx.fillRect(x + 8, y + 8, w - 16, h - 16);
    ctx.globalAlpha = 1; ctx.fillStyle = '#10301a'; ctx.font = 'bold 11px Fredoka, sans-serif'; ctx.textAlign = 'center';
    ctx.fillText('BAY', x + w / 2, y + h / 2 + 4);
  } else {
    ctx.beginPath(); ctx.arc(x + w / 2, y + h / 2, Math.min(w, h) / 3, 0, 7); ctx.fill();
  }
  ctx.globalAlpha = 1;
  ctx.font = 'bold 11px Fredoka, sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'alphabetic';
  ctx.fillStyle = s.color; ctx.fillText(s.name, x + w / 2, y + h + 14);
}

function drawLabDecor(ctx, m, time) {
  // Bubbling specimen tubes along the walls
  for (let k = 0; k < 4; k++) {
    const x = 32 * (8 + k * 1.5), y = 40;
    ctx.fillStyle = 'rgba(127,255,170,0.35)'; roundRect(ctx, x, y, 22, 40, 8); ctx.fill();
    ctx.strokeStyle = '#9ad'; ctx.lineWidth = 2; roundRect(ctx, x, y, 22, 40, 8); ctx.stroke();
    const by = y + 34 - ((time * 30 + k * 13) % 30);
    ctx.fillStyle = 'rgba(255,255,255,0.7)'; ctx.beginPath(); ctx.arc(x + 11, by, 3, 0, 7); ctx.fill();
  }
  // Exit door
  const ex = 14 * TILE, ey = 19 * TILE;
  ctx.fillStyle = '#3fe0ff'; ctx.fillRect(ex, ey, TILE * 2, 6);
  ctx.font = 'bold 12px Fredoka, sans-serif'; ctx.fillStyle = '#3fe0ff'; ctx.textAlign = 'center';
  ctx.fillText('▲ ELEVATOR TO CLUBHOUSE', 15 * TILE, ey - 6);
  ctx.fillStyle = 'rgba(255,255,255,0.4)'; ctx.fillText('TRAINING ROOM', 24.5 * TILE, 9.6 * TILE);
}

function renderMap(ctx, m, cam, vw, vh, time) {
  const x0 = Math.max(0, Math.floor(cam.x / TILE) - 1), y0 = Math.max(0, Math.floor(cam.y / TILE) - 1);
  const x1 = Math.min(m.w - 1, Math.ceil((cam.x + vw) / TILE) + 1), y1 = Math.min(m.h - 1, Math.ceil((cam.y + vh) / TILE) + 1);
  for (let ty = y0; ty <= y1; ty++) for (let tx = x0; tx <= x1; tx++) drawTile(ctx, m, tx, ty, m.tiles[ty * m.w + tx], time);
  if (m.name === 'lab') {
    drawLabDecor(ctx, m, time);
    for (const s of m.stations) drawStation(ctx, s, time);
  }
  for (const b of m.buildings) {
    if ((b.x + b.w + 1) * TILE < cam.x || (b.x - 1) * TILE > cam.x + vw || (b.y + b.h + 1) * TILE < cam.y - 40 || (b.y - 2) * TILE > cam.y + vh) continue;
    drawBuilding(ctx, b, time);
  }
}

function renderCanopies(ctx, m, cam, vw, vh) {
  const x0 = Math.max(0, Math.floor(cam.x / TILE) - 1), y0 = Math.max(0, Math.floor(cam.y / TILE) - 1);
  const x1 = Math.min(m.w - 1, Math.ceil((cam.x + vw) / TILE) + 1), y1 = Math.min(m.h - 1, Math.ceil((cam.y + vh) / TILE) + 1);
  for (let ty = y0; ty <= y1; ty++) for (let tx = x0; tx <= x1; tx++)
    if (m.tiles[ty * m.w + tx] === T.TREE) drawTreeCanopy(ctx, tx, ty, m.vary[ty * m.w + tx]);
}

// Small pre-rendered overview used by the minimap and full map.
function buildMinimap(m) {
  const c = document.createElement('canvas');
  c.width = m.w; c.height = m.h;
  const g = c.getContext('2d');
  const col = {
    [T.GRASS]: '#6cc04a', [T.ROAD]: '#4d4f59', [T.WALK]: '#cfc8b8', [T.WATER]: '#3d93db', [T.BUILDING]: '#c0453a',
    [T.TREE]: '#2f7a34', [T.SAND]: '#ecd896', [T.PLAZA]: '#ddd2bd', [T.FENCE]: '#f4f0e6', [T.FLOWER]: '#7ccf5a',
    [T.LABFLOOR]: '#262c45', [T.LABWALL]: '#141829', [T.DIRT]: '#a3825a', [T.BRIDGE]: '#a5743f', [T.PARKLOT]: '#6e7078',
    [T.HEDGE]: '#2f7a34', [T.JUNK]: '#7a6a5a', [T.MACHINE]: '#3fe0ff', [T.PAD]: '#7d8696',
  };
  for (let y = 0; y < m.h; y++) for (let x = 0; x < m.w; x++) { g.fillStyle = col[m.tiles[y * m.w + x]] || '#000'; g.fillRect(x, y, 1, 1); }
  for (const b of m.buildings) { g.fillStyle = b.roof; g.fillRect(b.x, b.y, b.w, b.h); }
  return c;
}
