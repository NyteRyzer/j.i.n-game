'use strict';
// ---------------------------------------------------------------------------
// Golden Atoms: hidden collectibles all over Retroville. Rooftop and water
// atoms need the jetpack, the hovercar or the rocket.
// ---------------------------------------------------------------------------

const GOLDEN_ATOM_SPOTS = [
  [10, 8], [30, 3], [41, 8], [78, 4], [146, 3], [130, 14], [2, 45], [7, 27], [35, 26], [45, 27],
  [68, 26], [70, 39], [138, 29], [146, 46], [11, 65], [40, 57], [32, 76], [77, 57], [78, 70], [68, 74],
  [137, 60], [143, 77], [145, 105], [8, 88], [38, 102], [78, 96], [109, 40], [147, 22],
];
const ATOM_REWARD = 25, ATOM_BONUS = 500;

class GoldenAtom extends Entity {
  constructor(id, tx, ty, h) {
    super(...Object.values(tp(tx, ty)), 12);
    this.atomId = id;
    this.h = h; // float height in world units, for the renderer
    this.invulnerable = true;
  }
  update(dt, m) {
    this.anim += dt;
    const p = G.player;
    if (distXY(this.x, this.y, p.x, p.y) < 28) Collectibles.collect(this, m);
  }
}

const Collectibles = {
  found: new Set(),
  total: GOLDEN_ATOM_SPOTS.length,
  spawn(town) {
    GOLDEN_ATOM_SPOTS.forEach(([x, y], id) => {
      if (this.found.has(id)) return;
      const t = town.get(x, y);
      const h = t === T.BUILDING ? 4.6 : t === T.WATER ? 1.1 : 0.9;
      town.entities.push(new GoldenAtom(id, x, y, h));
    });
  },
  collect(atom, m) {
    atom.dead = true;
    this.found.add(atom.atomId);
    G.neutronium += ATOM_REWARD;
    Sfx.play('brainblast');
    particles(m, atom.x, atom.y, 30, '#ffd52e', 220, 5, 0.7);
    ring(m, atom.x, atom.y, 70, '#ffd52e', 0.5);
    if (this.found.size >= this.total) {
      G.neutronium += ATOM_BONUS;
      UI.banner('Every Golden Atom found!', `+${ATOM_BONUS} NEUTRONIUM BONUS`);
    } else {
      G.toast(`Golden Atom ${this.found.size}/${this.total}! +${ATOM_REWARD} neutronium`);
    }
    G.save();
  },
  serialize() { return [...this.found]; },
  restore(list) { this.found = new Set(list || []); },
};
