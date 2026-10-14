'use strict';
// ---------------------------------------------------------------------------
// Jimmy's inventions. Each one costs energy and has its own cooldown.
// ---------------------------------------------------------------------------

const INVENTIONS = [
  {
    id: 'blaster', name: 'Neutronic Blaster', key: '1', cost: 3, cd: 0.17, color: '#ffe14f',
    desc: 'Rapid-fire neutron bolts. Your bread-and-butter weapon.',
    use(p, a, m) {
      shootFrom(p, m, a, { speed: 680, dmg: 12 * powerMult(), color: '#ffe14f', life: 0.8 });
      Sfx.play('blaster');
    },
  },
  {
    id: 'shrink', name: 'Shrink Ray', key: '2', cost: 14, cd: 0.6, color: '#ff5fd2',
    desc: 'Shrinks enemies to bug size. Walk over them to squish them. Bosses take extra damage while shrunk.',
    use(p, a, m) {
      shootFrom(p, m, a, { speed: 520, dmg: 2, color: '#ff5fd2', life: 0.9, effect: 'shrink', r: 6 });
      Sfx.play('shrink');
    },
  },
  {
    id: 'freeze', name: 'Freeze Ray', key: '3', cost: 12, cd: 0.5, color: '#8fe8ff',
    desc: 'Encases enemies in ice for a few seconds.',
    use(p, a, m) {
      shootFrom(p, m, a, { speed: 540, dmg: 6 * powerMult(), color: '#8fe8ff', life: 0.9, effect: 'freeze', r: 6 });
      Sfx.play('freeze');
    },
  },
  {
    id: 'hypno', name: 'Hypno-Beam', key: '4', cost: 25, cd: 1.0, color: '#c36bff',
    desc: 'Hypnotizes an enemy so it fights on your side for 10 seconds.',
    use(p, a, m) {
      shootFrom(p, m, a, { speed: 460, dmg: 1, color: '#c36bff', life: 1.1, effect: 'hypno', r: 6 });
      Sfx.play('hypno');
    },
  },
  {
    id: 'burp', name: 'Burping Soda', key: '5', cost: 20, cd: 1.2, color: '#b8ff8a',
    desc: 'A swig of soda launches you forward on a mighty burp, blasting enemies away.',
    use(p, a, m, input) {
      const dx = input.mx || 0, dy = input.my || 0;
      const da = dx || dy ? Math.atan2(dy, dx) : a;
      p.dash = { vx: Math.cos(da) * 900, vy: Math.sin(da) * 900, t: 0.28 };
      Sfx.play('burp');
      floatText(m, p.x, p.y - 36, 'BUUURP!', '#b8ff8a', 18);
      ring(m, p.x, p.y, 110, '#b8ff8a', 0.4);
      particles(m, p.x, p.y, 20, '#b8ff8a', 200, 5, 0.5);
      for (const e of enemyTargets(m)) if (dist(e, p) < 110 + e.r) damage(e, 18 * powerMult(), { knock: 650, from: p });
    },
  },
  {
    id: 'clone', name: 'Clone-O-Matic', key: '6', cost: 40, cd: 6, color: '#7ff0ff',
    desc: 'Prints two Jimmy clones that fight beside you for 14 seconds.',
    use(p, a, m) {
      for (const side of [-1, 1]) {
        const sp = m.findOpen(p.x + Math.cos(a + side * 1.6) * 30, p.y + Math.sin(a + side * 1.6) * 30, 10);
        m.entities.push(new Clone(sp.x, sp.y));
        ring(m, sp.x, sp.y, 30, '#7ff0ff');
      }
      Sfx.play('clone');
    },
  },
  {
    id: 'grenade', name: 'Gum Grenade', key: '7', cost: 18, cd: 0.9, color: '#ff6fd0',
    desc: 'Lob an explosive wad of super-gum. Hits everything in the blast and leaves enemies stuck and slow.',
    use(p, a, m, input) {
      const target = input.worldMouse;
      const d = Math.min(340, distXY(p.x, p.y, target.x, target.y));
      const t = 0.55;
      m.projectiles.push(new Projectile({ x: p.x, y: p.y, vx: (Math.cos(a) * d) / t, vy: (Math.sin(a) * d) / t, team: 'player', dmg: 42 * powerMult(), color: '#ff6fd0', life: t, kind: 'grenade', splash: 100, fly: true }));
      Sfx.play('grenade');
    },
  },
  {
    id: 'jetpack', name: 'Rocket Jetpack', key: '8', cost: 5, cd: 0.4, color: '#ffb23f',
    desc: 'Toggle flight. Soar over houses, rivers and fences while energy lasts.',
    use(p) {
      p.setJetpack(!p.jetpack);
      G.toast(p.jetpack ? 'Jetpack ON. Fly over anything!' : 'Jetpack off.');
    },
  },
];

function shootFrom(p, m, a, o) {
  m.projectiles.push(new Projectile({
    x: p.x + Math.cos(a) * 14, y: p.y + Math.sin(a) * 14, h: 0.95 + (p.alt || 0) * 0.095,
    vx: Math.cos(a) * o.speed, vy: Math.sin(a) * o.speed,
    team: 'player', dmg: o.dmg, color: o.color, life: o.life, effect: o.effect || null, r: o.r || 4, fly: !!p.jetpack,
  }));
}

function useInvention(p, aim, worldMouse) {
  const inv = INVENTIONS[p.invIndex];
  const m = G.map;
  if ((p.cds[inv.id] || 0) > 0) return;
  if (inv.id === 'jetpack' && !G.input.firePressed) return; // toggle only on a fresh click
  if (p.energy < inv.cost) {
    if (G.input.firePressed) { Sfx.play('error'); G.toast('Not enough energy! It recharges over time.'); }
    return;
  }
  p.energy -= inv.cost;
  p.cds[inv.id] = inv.cd;
  inv.use(p, aim, m, G.input);
}
