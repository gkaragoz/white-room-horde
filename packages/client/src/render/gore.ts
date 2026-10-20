import * as THREE from 'three';
import type { Fx } from './fx';

/** What can be torn off. */
export const enum Part {
  Head = 0,
  Arm = 1,
  Leg = 2,
  Chunk = 3,
}

const CAP = 28;
const GRAVITY = 24;
const _m = new THREE.Matrix4();
const _q = new THREE.Quaternion();
const _e = new THREE.Euler();
const _p = new THREE.Vector3();
const _s = new THREE.Vector3();
const _c = new THREE.Color();

interface Fountain {
  at: () => { x: number; y: number; z: number };
  t: number;
  dx: number;
  dy: number;
}

/**
 * Heads, limbs and lumps that fly off a body: a small pool of instanced meshes with their own little physics (arc, bounce,
 * spin), a trail of blood while they fly, a splat where they land, and a fountain of blood from the stump. Visual only.
 */
export class GoreParts {
  readonly group = new THREE.Group();
  private readonly meshes: THREE.InstancedMesh[] = [];
  private readonly live: { kind: number; x: number; y: number; z: number; vx: number; vy: number; vz: number; rx: number; ry: number; rz: number; sx: number; sy: number; sz: number; age: number; life: number; size: number; bounces: number }[] = [];
  private readonly counts = [0, 0, 0, 0];
  /** How many parts have been thrown in all (QA). */
  spawned = 0;
  private readonly fountains: Fountain[] = [];
  private readonly colors: THREE.Color[] = [];

  constructor() {
    const geos = [new THREE.SphereGeometry(0.5, 14, 10), new THREE.CapsuleGeometry(0.28, 0.7, 4, 8), new THREE.CapsuleGeometry(0.32, 0.9, 4, 8), new THREE.DodecahedronGeometry(0.5, 0)];
    for (const g of geos) {
      const m = new THREE.InstancedMesh(g, new THREE.MeshStandardMaterial({ roughness: 0.55, metalness: 0 }), CAP);
      m.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(CAP * 3), 3);
      m.castShadow = true;
      m.frustumCulled = false;
      m.count = 0;
      this.group.add(m);
      this.meshes.push(m);
    }
  }

  /** Throw a part (position in sim coordinates, `h` the height it leaves from). */
  spawn(kind: Part, x: number, y: number, h: number, dirX: number, dirY: number, power: number, color: string, size = 1): void {
    this.spawned++;
    if (this.live.length >= CAP) this.live.shift();
    const a = Math.atan2(dirY, dirX) + (Math.random() - 0.5) * 1.4;
    const sp = 3.5 + Math.random() * 3 + power * 0.04;
    this.live.push({
      kind,
      x,
      y: h,
      z: -y,
      vx: Math.cos(a) * sp,
      vy: 5 + Math.random() * 4 + power * 0.03,
      vz: -Math.sin(a) * sp,
      rx: Math.random() * 6,
      ry: Math.random() * 6,
      rz: Math.random() * 6,
      sx: (Math.random() - 0.5) * 16,
      sy: (Math.random() - 0.5) * 16,
      sz: (Math.random() - 0.5) * 16,
      age: 0,
      life: 7,
      size,
      bounces: 0,
    });
    this.colors.push(new THREE.Color(color));
    if (this.colors.length > CAP) this.colors.shift();
    this.live[this.live.length - 1]!.kind = kind;
  }

  /** Blood pumping out of a stump for a moment (`at` follows the joint of the body). */
  fountain(at: () => { x: number; y: number; z: number }, dirX: number, dirY: number): void {
    if (this.fountains.length > 10) this.fountains.shift();
    this.fountains.push({ at, t: 0.9, dx: dirX, dy: dirY });
  }

  update(dt: number, fx: Fx): void {
    for (let i = this.live.length - 1; i >= 0; i--) {
      const p = this.live[i]!;
      p.age += dt;
      p.vy -= GRAVITY * dt;
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.z += p.vz * dt;
      p.rx += p.sx * dt;
      p.ry += p.sy * dt;
      p.rz += p.sz * dt;
      const floor = p.kind === Part.Head ? 0.26 * p.size : 0.16 * p.size;
      if (p.y < floor) {
        p.y = floor;
        if (p.bounces < 3 && Math.abs(p.vy) > 1.2) {
          fx.gorePatch(p.x, -p.z, 0.45 * p.size);
          p.vy = -p.vy * 0.4;
          p.vx *= 0.6;
          p.vz *= 0.6;
          p.sx *= 0.5;
          p.sy *= 0.5;
          p.sz *= 0.5;
          p.bounces++;
        } else {
          p.vy = 0;
          p.vx *= Math.max(0, 1 - dt * 9);
          p.vz *= Math.max(0, 1 - dt * 9);
          p.sx *= 0.8;
          p.sy *= 0.8;
          p.sz *= 0.8;
        }
      } else if (p.age < 1.2 && Math.random() < dt * 40) {
        fx.drip(p.x, -p.z, p.y); // a trail of blood while it flies
      }
      if (p.age > p.life) {
        this.live.splice(i, 1);
        this.colors.splice(i, 1);
      }
    }
    for (let i = this.fountains.length - 1; i >= 0; i--) {
      const f = this.fountains[i]!;
      f.t -= dt;
      if (f.t <= 0) {
        this.fountains.splice(i, 1);
        continue;
      }
      const a = f.at();
      fx.spurt(a.x, -a.z, a.y, f.dx, f.dy, f.t / 0.9);
    }
    this.counts.fill(0);
    for (let i = 0; i < this.live.length; i++) {
      const p = this.live[i]!;
      const m = this.meshes[p.kind]!;
      const k = this.counts[p.kind]!++;
      const left = 7 - p.age;
      const shrink = left < 1 ? Math.max(0.01, left) : 1;
      _e.set(p.rx, p.ry, p.rz);
      _q.setFromEuler(_e);
      const sz = p.size * (p.kind === Part.Head ? 0.62 : p.kind === Part.Chunk ? 0.3 : 0.45) * shrink;
      _p.set(p.x, p.y - (left < 1 ? (1 - left) * 0.3 : 0), p.z);
      _s.set(sz, sz, sz);
      _m.compose(_p, _q, _s);
      m.setMatrixAt(k, _m);
      _c.copy(this.colors[i]!);
      m.setColorAt(k, _c);
    }
    for (let k = 0; k < this.meshes.length; k++) {
      const m = this.meshes[k]!;
      m.count = this.counts[k]!;
      m.instanceMatrix.needsUpdate = true;
      if (m.instanceColor) m.instanceColor.needsUpdate = true;
    }
  }

  clear(): void {
    this.live.length = 0;
    this.colors.length = 0;
    this.fountains.length = 0;
    for (const m of this.meshes) m.count = 0;
  }
}
