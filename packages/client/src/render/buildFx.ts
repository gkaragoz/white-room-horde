import * as THREE from 'three';

/** What happened to a piece (for dust and sound): it landed, or it began to crumble. */
export type BuildEvent = (kind: 'land' | 'crumble', x: number, z: number, big: boolean) => void;

interface Item {
  obj: THREE.Object3D;
  base: { px: number; py: number; pz: number; rx: number; ry: number; rz: number; sx: number; sy: number; sz: number };
  delay: number;
  spin: number;
  tilt: number;
  axis: number;
  height: number;
  big: boolean;
  fired: boolean;
  sprite: boolean;
  done: boolean;
}

const FALL_IN = 0.95;
const FALL_OUT = 1.15;
const SKY = 62;

const _box = new THREE.Box3();
const _size = new THREE.Vector3();

/**
 * The building and the demolition of an arena, drawn from the pieces it is made of (every direct child of the groups it is
 * given: cover, decks, ramps, rails, scenery). Purely visual. `in`: the pieces drop out of the sky one after the other,
 * land with a squash and a puff of dust. `out`: they shake, topple and fall away through the floor, one after the other.
 * `update(t)` takes the progress of the whole show from 0 to 1.
 */
export class BuildAnim {
  private items: Item[] = [];
  private mode: 'none' | 'in' | 'out' = 'none';
  private rnd = 1;
  private last = -1;
  onEvent: BuildEvent | null = null;

  get armed(): 'none' | 'in' | 'out' {
    return this.mode;
  }

  private random(): number {
    this.rnd = (Math.imul(this.rnd, 1664525) + 1013904223) >>> 0;
    return this.rnd / 4294967296;
  }

  /** Take the pieces of these groups; in `in` mode they are hidden until their turn. */
  arm(groups: THREE.Object3D[], mode: 'in' | 'out', seed: number): void {
    this.restore();
    this.rnd = (seed * 2654435761) >>> 0 || 1;
    this.mode = mode;
    this.items = [];
    let far = 1;
    for (const g of groups) for (const o of g.children) far = Math.max(far, Math.hypot(o.position.x, o.position.z));
    for (const g of groups) {
      for (const o of g.children) {
        if (o.userData.noBuild) continue;
        _box.setFromObject(o);
        _box.getSize(_size);
        const foot = _size.x * _size.z;
        const sprite = (o as THREE.Sprite).isSprite === true;
        const d = Math.hypot(o.position.x, o.position.z) / far;
        this.items.push({
          obj: o,
          base: { px: o.position.x, py: o.position.y, pz: o.position.z, rx: o.rotation.x, ry: o.rotation.y, rz: o.rotation.z, sx: o.scale.x, sy: o.scale.y, sz: o.scale.z },
          // the middle is built first and the build spreads outward (and the other way round when it comes down), with some chance in it
          delay: Math.min(1, Math.max(0, mode === 'in' ? 0.55 * d + 0.45 * this.random() : 0.55 * (1 - d) + 0.45 * this.random())),
          spin: (this.random() - 0.5) * 2.4,
          tilt: (this.random() - 0.5) * 1.4,
          axis: this.random() < 0.5 ? 0 : 1,
          height: SKY + this.random() * 14 + Math.min(10, _size.y * 3),
          big: foot > 7 || _size.y > 2.6,
          fired: false,
          sprite,
          done: false,
        });
        if (mode === 'in') o.visible = false;
      }
    }
    this.last = -1;
  }

  /** Put every piece back where it belongs and show it (the floor is whole again, or about to be rebuilt). */
  restore(): void {
    for (const it of this.items) {
      const b = it.base;
      it.obj.position.set(b.px, b.py, b.pz);
      it.obj.rotation.set(b.rx, b.ry, b.rz);
      it.obj.scale.set(b.sx, b.sy, b.sz);
      it.obj.visible = true;
    }
    this.items = [];
    this.mode = 'none';
  }

  /** The show is over: after `out` nothing is left standing (hidden), after `in` everything is in place. */
  finish(): void {
    if (this.mode === 'none') return;
    if (this.mode === 'in') this.restore();
    else {
      for (const it of this.items) it.obj.visible = false;
    }
  }

  /** QA: how many pieces there are, how many are drawn right now and how many are done. */
  stats(): { mode: string; total: number; shown: number; done: number } {
    return { mode: this.mode, total: this.items.length, shown: this.items.filter((i) => i.obj.visible).length, done: this.items.filter((i) => i.done).length };
  }

  /** Is every piece done (so the show can end)? */
  get complete(): boolean {
    return this.items.every((i) => i.done);
  }

  /** Draw the show at progress `t` (0..1); `window` is its length in seconds (it sets how long a piece takes against the whole). */
  update(t: number, window: number): void {
    if (this.mode === 'none') return;
    const fall = this.mode === 'in' ? FALL_IN : FALL_OUT;
    const span = Math.max(0.01, 1 - fall / window);
    let events = 0;
    for (const it of this.items) {
      if (it.done) continue;
      const o = it.obj;
      const b = it.base;
      const u = (t - it.delay * span) / (fall / window);
      if (this.mode === 'in') {
        if (u <= 0) {
          o.visible = false;
          continue;
        }
        if (it.sprite) {
          o.visible = u >= 1; // the glow of a lamp comes on once the lamp is down
          if (u >= 1) it.done = true;
          continue;
        }
        o.visible = true;
        if (u < 1) {
          const k = u * u;
          o.position.set(b.px, b.py + it.height * (1 - k), b.pz);
          o.rotation.set(b.rx + it.tilt * (1 - u) * (it.axis ? 1 : 0), b.ry + it.spin * (1 - u), b.rz + it.tilt * (1 - u) * (it.axis ? 0 : 1));
          o.scale.set(b.sx, b.sy, b.sz);
        } else {
          const v = (u - 1) * (fall / 0.32); // the squash after landing lasts about a third of a second
          if (!it.fired) {
            it.fired = true;
            if (events < 4 && t !== this.last) {
              events++;
              this.onEvent?.('land', b.px, b.pz, it.big);
            }
          }
          if (v < 1) {
            const s = Math.sin(Math.PI * v) * (it.big ? 0.05 : 0.11) * (1 - v);
            o.position.set(b.px, b.py, b.pz);
            o.rotation.set(b.rx, b.ry, b.rz);
            o.scale.set(b.sx * (1 + s * 0.6), b.sy * (1 - s), b.sz * (1 + s * 0.6));
          } else {
            o.position.set(b.px, b.py, b.pz);
            o.rotation.set(b.rx, b.ry, b.rz);
            o.scale.set(b.sx, b.sy, b.sz);
            it.done = true;
          }
        }
      } else {
        if (u < -0.3) continue;
        if (u < 0) {
          // a piece about to go cracks and trembles
          const sh = (1 + u / 0.3) * 0.07;
          o.position.set(b.px + Math.sin(t * 140 + b.px) * sh, b.py, b.pz + Math.cos(t * 120 + b.pz) * sh);
          continue;
        }
        if (it.sprite) {
          o.visible = false;
          it.done = true;
          continue;
        }
        if (!it.fired) {
          it.fired = true;
          if (events < 4 && t !== this.last) {
            events++;
            this.onEvent?.('crumble', b.px, b.pz, it.big);
          }
        }
        if (u >= 1) {
          o.visible = false;
          it.done = true;
          continue;
        }
        // topples to one side and drops through the floor, faster and faster
        const k = u * u;
        o.position.set(b.px, b.py - 11 * k, b.pz);
        o.rotation.set(b.rx + (it.axis ? it.tilt * 1.6 * k : 0), b.ry + it.spin * 0.3 * u, b.rz + (it.axis ? 0 : it.tilt * 1.6 * k));
      }
    }
    this.last = t;
  }
}
