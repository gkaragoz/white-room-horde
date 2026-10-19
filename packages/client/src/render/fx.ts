import * as THREE from 'three';
import { ARENA_HALF_H, ARENA_HALF_W, BALANCE, ENEMY_TYPES, MAPS, WEAPON_IDS, type Box } from '@wrh/shared';
import type { SimEvent } from '@wrh/sim';

const MAX_PARTICLES = 3600;
const MAX_HOLES = 360;
const GRAVITY = 16;

const GIB_COLORS: Record<string, string> = {
  grunt: '#9aa57a',
  runner: '#b9b27a',
  tank: '#8e8a98',
  exploder: '#d88a4a',
  spitter: '#7fa88e',
  shielder: '#8a98b8',
  spawner: '#a88ab0',
};

const enum Kind {
  Blood,
  Gib,
  Spark,
  Fire,
  Smoke,
}

/**
 * Local cosmetics only (docs/DESIGN.md section 7): blood, gibs, sparks, explosions, muzzle flashes and floor decals
 * are driven by sim events and never feed back into the simulation, so they cost nothing on the network.
 */
export class Fx {
  readonly group = new THREE.Group();
  /** Screen shake amount, decays on its own; the stage reads it. */
  shake = 0;
  /** Red flash strength for the local player getting hurt (0..1). */
  hurt = 0;

  private readonly mesh: THREE.InstancedMesh;
  private readonly px = new Float32Array(MAX_PARTICLES);
  private readonly py = new Float32Array(MAX_PARTICLES);
  private readonly pz = new Float32Array(MAX_PARTICLES);
  private readonly vx = new Float32Array(MAX_PARTICLES);
  private readonly vy = new Float32Array(MAX_PARTICLES);
  private readonly vz = new Float32Array(MAX_PARTICLES);
  private readonly life = new Float32Array(MAX_PARTICLES);
  private readonly maxLife = new Float32Array(MAX_PARTICLES);
  private readonly size = new Float32Array(MAX_PARTICLES);
  private readonly kind = new Uint8Array(MAX_PARTICLES);
  private readonly spin = new Float32Array(MAX_PARTICLES);
  private readonly rot = new Float32Array(MAX_PARTICLES);
  private readonly col = new Float32Array(MAX_PARTICLES * 3);
  private live = 0;

  /** Bullet holes on the cover boxes: a ring buffer of little dark discs standing on the faces. */
  private readonly holes: THREE.InstancedMesh;
  private holeNext = 0;
  private holeCount = 0;
  private boxes: readonly Box[] = MAPS[0]!.boxes;

  /** Real-time light at a spot (muzzle flashes, explosions); wired to the stage's light pool by main. */
  light: (x: number, y: number, z: number, color: string, intensity: number, life: number, distance?: number) => void = () => undefined;

  private readonly decalCanvas: HTMLCanvasElement;
  private readonly decalCtx: CanvasRenderingContext2D;
  private readonly decalTex: THREE.CanvasTexture;
  private decalDirty = false;
  private decalAge = 0;
  private readonly flashes: { mesh: THREE.Mesh; life: number; max: number; grow: number }[] = [];
  private readonly flashGeo = new THREE.SphereGeometry(1, 10, 8);
  private readonly dummy = new THREE.Object3D();
  private readonly c = new THREE.Color();

  /** Pixels per world unit on the blood canvas (12 low, 24 high). */
  private readonly ppu: number;

  constructor(
    private readonly onExplosionShake: (amount: number) => void = () => undefined,
    decalDetail: 0 | 1 = 1,
  ) {
    this.ppu = decalDetail === 1 ? 24 : 12;
    const geo = new THREE.BoxGeometry(1, 1, 1);
    const mat = new THREE.MeshBasicMaterial({ vertexColors: false });
    this.mesh = new THREE.InstancedMesh(geo, mat, MAX_PARTICLES);
    this.mesh.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(MAX_PARTICLES * 3), 3);
    this.mesh.frustumCulled = false;
    this.mesh.count = 0;
    this.group.add(this.mesh);

    // persistent decal layer: a transparent canvas laid over the floor
    this.decalCanvas = document.createElement('canvas');
    this.decalCanvas.width = ARENA_HALF_W * 2 * this.ppu;
    this.decalCanvas.height = ARENA_HALF_H * 2 * this.ppu;
    this.decalCtx = this.decalCanvas.getContext('2d')!;
    this.decalTex = new THREE.CanvasTexture(this.decalCanvas);
    this.decalTex.colorSpace = THREE.SRGBColorSpace;
    const plane = new THREE.Mesh(
      new THREE.PlaneGeometry(ARENA_HALF_W * 2, ARENA_HALF_H * 2),
      new THREE.MeshBasicMaterial({ map: this.decalTex, transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2 }),
    );
    plane.rotation.x = -Math.PI / 2;
    plane.position.y = 0.012;
    plane.renderOrder = 1;
    this.group.add(plane);

    const hc = document.createElement('canvas');
    hc.width = hc.height = 64;
    const h = hc.getContext('2d')!;
    const rg = h.createRadialGradient(32, 32, 2, 32, 32, 30);
    rg.addColorStop(0, 'rgba(8,9,12,1)');
    rg.addColorStop(0.35, 'rgba(14,16,20,.95)');
    rg.addColorStop(0.55, 'rgba(60,64,72,.55)');
    rg.addColorStop(1, 'rgba(60,64,72,0)');
    h.fillStyle = rg;
    h.fillRect(0, 0, 64, 64);
    h.strokeStyle = 'rgba(20,22,26,.7)';
    h.lineWidth = 1.5;
    for (let k = 0; k < 7; k++) {
      const a = (k / 7) * Math.PI * 2 + 0.3;
      h.beginPath();
      h.moveTo(32 + Math.cos(a) * 9, 32 + Math.sin(a) * 9);
      h.lineTo(32 + Math.cos(a + 0.15) * (20 + (k % 3) * 4), 32 + Math.sin(a + 0.15) * (20 + (k % 3) * 4));
      h.stroke();
    }
    const holeTex = new THREE.CanvasTexture(hc);
    holeTex.colorSpace = THREE.SRGBColorSpace;
    this.holes = new THREE.InstancedMesh(
      new THREE.PlaneGeometry(1, 1),
      new THREE.MeshBasicMaterial({ map: holeTex, transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -4 }),
      MAX_HOLES,
    );
    this.holes.frustumCulled = false;
    this.holes.count = 0;
    this.holes.renderOrder = 2;
    this.group.add(this.holes);
  }

  /** Remember the cover boxes of the arena in play (bullet holes stick to them). */
  setMap(index: number): void {
    this.boxes = MAPS[index]?.boxes ?? MAPS[0]!.boxes;
    this.holeCount = 0;
    this.holeNext = 0;
    this.holes.count = 0;
  }

  /** Stick a bullet hole on the face of the box nearest to a bullet's last position; returns the face normal (sim axes). */
  private bulletHole(x: number, y: number): { nx: number; ny: number; hx: number; hy: number } | null {
    let best: Box | null = null;
    let bestD = 0.9;
    let bnx = 0;
    let bny = 0;
    for (const b of this.boxes) {
      const dx = x - b.x;
      const dy = y - b.y;
      const fx = b.w / 2 - Math.abs(dx);
      const fy = b.h / 2 - Math.abs(dy);
      if (fx < -0.7 || fy < -0.7) continue;
      const d = Math.max(0, -Math.min(fx, fy));
      if (d <= bestD) {
        bestD = d;
        best = b;
        if (fx < fy) {
          bnx = Math.sign(dx) || 1;
          bny = 0;
        } else {
          bnx = 0;
          bny = Math.sign(dy) || 1;
        }
      }
    }
    if (!best) return null;
    const hx = bnx !== 0 ? best.x + bnx * best.w / 2 : Math.max(best.x - best.w / 2 + 0.05, Math.min(best.x + best.w / 2 - 0.05, x));
    const hy = bny !== 0 ? best.y + bny * best.h / 2 : Math.max(best.y - best.h / 2 + 0.05, Math.min(best.y + best.h / 2 - 0.05, y));
    const height = 0.18 + Math.random() * 0.75;
    const size = 0.16 + Math.random() * 0.12;
    const d = this.dummy;
    d.position.set(hx + bnx * 0.014, height, -(hy + bny * 0.014));
    d.lookAt(d.position.x + bnx, height, d.position.z - bny);
    d.rotateZ(Math.random() * 6.28);
    d.scale.setScalar(size);
    d.updateMatrix();
    this.holes.setMatrixAt(this.holeNext, d.matrix);
    this.holeNext = (this.holeNext + 1) % MAX_HOLES;
    this.holeCount = Math.min(MAX_HOLES, this.holeCount + 1);
    this.holes.count = this.holeCount;
    this.holes.instanceMatrix.needsUpdate = true;
    return { nx: bnx, ny: bny, hx, hy };
  }

  private splat(x: number, y: number, radius: number, color: string, alpha = 0.7): void {
    const ctx = this.decalCtx;
    const cx = (x + ARENA_HALF_W) * this.ppu;
    const cy = (ARENA_HALF_H - y) * this.ppu;
    ctx.globalAlpha = alpha;
    ctx.fillStyle = color;
    const blobs = 3 + Math.floor(Math.random() * 4);
    for (let i = 0; i < blobs; i++) {
      const a = Math.random() * Math.PI * 2;
      const d = Math.random() * radius * 0.7 * this.ppu;
      const r = (0.25 + Math.random() * 0.6) * radius * this.ppu;
      ctx.beginPath();
      ctx.arc(cx + Math.cos(a) * d, cy + Math.sin(a) * d, r, 0, Math.PI * 2);
      ctx.fill();
    }
    this.decalDirty = true;
  }

  private emit(kind: Kind, x: number, y: number, z: number, vx: number, vy: number, vz: number, life: number, size: number, color: string): void {
    if (this.live >= MAX_PARTICLES) return;
    const i = this.live++;
    this.px[i] = x;
    this.py[i] = y;
    this.pz[i] = z;
    this.vx[i] = vx;
    this.vy[i] = vy;
    this.vz[i] = vz;
    this.life[i] = life;
    this.maxLife[i] = life;
    this.size[i] = size;
    this.kind[i] = kind;
    this.spin[i] = (Math.random() - 0.5) * 12;
    this.rot[i] = Math.random() * 6;
    this.c.set(color);
    this.col[i * 3] = this.c.r;
    this.col[i * 3 + 1] = this.c.g;
    this.col[i * 3 + 2] = this.c.b;
  }

  /** Strength of a player's offensive upgrades (0 = none): bigger muzzle flashes for stronger shooters. Set by main. */
  powerFor: (slot: number) => number = () => 0;

  /** A soft sparkle drifting up from a spot (upgrade auras). */
  sparkle(x: number, y: number, h: number, color: string, count: number, speed: number): void {
    this.burst(Kind.Spark, x, y, h, count, speed, 0, 0, 6.28, 0.7, 0.05, color);
  }

  private burst(kind: Kind, sx: number, sy: number, h: number, count: number, speed: number, dirX: number, dirY: number, spread: number, life: number, size: number, color: string): void {
    for (let n = 0; n < count; n++) {
      // sim (x, y) -> three (x, h, -y)
      const a = Math.atan2(dirY, dirX) + (Math.random() - 0.5) * spread;
      const s = speed * (0.4 + Math.random() * 0.8);
      this.emit(kind, sx, h, -sy, Math.cos(a) * s, 2 + Math.random() * speed * 0.5, -Math.sin(a) * s, life * (0.6 + Math.random() * 0.6), size * (0.6 + Math.random() * 0.8), color);
    }
  }

  private flash(x: number, y: number, z: number, radius: number, color: string, life: number, grow: number): void {
    const m = new THREE.Mesh(this.flashGeo, new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.9, depthWrite: false }));
    m.position.set(x, y, z);
    m.scale.setScalar(radius);
    this.group.add(m);
    this.flashes.push({ mesh: m, life, max: life, grow });
  }

  /** React to one sim event. */
  onEvent(e: SimEvent, localSlot: number): void {
    switch (e.type) {
      case 'shot': {
        const st = BALANCE.weapons[WEAPON_IDS[e.weapon]!];
        const mx = e.x + Math.cos(e.angle) * st.muzzleFwd + Math.sin(e.angle) * st.muzzleSide;
        const my = e.y + Math.sin(e.angle) * st.muzzleFwd - Math.cos(e.angle) * st.muzzleSide;
        const pw = this.powerFor(e.slot);
        this.flash(mx, st.muzzleH, -my, (0.16 + st.damage * 0.002) * (1 + pw * 0.6), pw > 0.3 ? '#ffd0a0' : '#ffe9a0', 0.05, 0);
        this.light(mx, st.muzzleH + 0.2, -my, WEAPON_IDS[e.weapon] === 'flamer' ? '#ff8a2a' : '#ffd9a0', 4 + st.damage * 0.04 + pw * 3, 0.07, 8);
        if (pw > 0.25) this.burst(Kind.Spark, mx, my, st.muzzleH, Math.min(6, Math.round(pw * 4)), 6, Math.cos(e.angle), Math.sin(e.angle), 0.9, 0.2, 0.05, '#ff9a5a');
        this.burst(Kind.Spark, mx, my, st.muzzleH, 2, 5, Math.cos(e.angle), Math.sin(e.angle), 0.5, 0.18, 0.05, '#ffd36a');
        if (WEAPON_IDS[e.weapon] === 'flamer') this.burst(Kind.Fire, mx, my, st.muzzleH, 3, 5, Math.cos(e.angle), Math.sin(e.angle), 0.5, 0.4, 0.22, '#ff8a1a');
        if (e.slot === localSlot) this.shake = Math.min(0.22, this.shake + Math.min(0.1, st.damage * 0.0006 * Math.sqrt(st.pellets)));
        break;
      }
      case 'bulletGone': {
        if (e.reason === 2) break; // the blood of a hit enemy is shown by enemyHit
        if (e.reason === 1) {
          // cover: sparks fly back out, chips and dust, a bullet hole stays on the wall
          const hole = this.bulletHole(e.x, e.y);
          const bx = hole ? hole.nx : -Math.cos(e.angle);
          const by = hole ? hole.ny : -Math.sin(e.angle);
          const px = hole ? hole.hx + bx * 0.1 : e.x;
          const py = hole ? hole.hy + by * 0.1 : e.y;
          const h = 0.5 + Math.random() * 0.4;
          this.burst(Kind.Spark, px, py, h, 7, 6.5, bx, by, 1.5, 0.28, 0.06, '#ffc866');
          this.burst(Kind.Spark, px, py, h, 3, 3, bx, by, 2.4, 0.2, 0.05, '#ffffff');
          this.burst(Kind.Gib, px, py, h, 3, 3.5, bx, by, 1.8, 0.7, 0.05, '#aeb4bd');
          this.burst(Kind.Smoke, px, py, h, 2, 0.9, bx, by, 1.2, 0.6, 0.16, '#bfc4cc');
          this.light(px, h, -py, '#ffd9a0', 3.5, 0.09, 4.5);
        } else {
          // a miss: the round digs into the ground
          this.burst(Kind.Smoke, e.x, e.y, 0.15, 3, 1.1, 0, 0, 6.28, 0.55, 0.2, '#cfc8bb');
          this.burst(Kind.Spark, e.x, e.y, 0.2, 3, 3, 0, 0, 6.28, 0.18, 0.045, '#ffe08a');
          this.splat(e.x, e.y, 0.12, '#3a3f47', 0.55);
        }
        break;
      }
      case 'enemyHit':
        this.burst(Kind.Blood, e.x, e.y, 0.9, 5, 4, 0, 0, 6.28, 0.5, 0.07, '#8c1018');
        break;
      case 'enemyDeath': {
        const power = Math.min(1.6, 0.6 + e.power * 0.01);
        const type = ENEMY_TYPES[e.etype]!;
        if (type === 'exploder') break; // the explosion event covers it
        this.burst(Kind.Blood, e.x, e.y, 0.8, Math.round(26 * power), 8 * power, e.dx, e.dy, 1.8, 0.9, 0.09, '#a3141c');
        this.burst(Kind.Gib, e.x, e.y, 0.8, 5 + Math.round(6 * power), 7.5 * power, e.dx, e.dy, 2.8, 1.9, 0.18, GIB_COLORS[type] ?? '#aaa');
        this.splat(e.x + e.dx * 0.5, e.y + e.dy * 0.5, 0.7 * power, '#7d0d14');
        break;
      }
      case 'explosion':
        this.light(e.x, 1.4, -e.y, '#ffa24a', 26 + e.radius * 6, 0.5, 18 + e.radius * 3);
        this.flash(e.x, 0.8, -e.y, 0.5, '#ffb347', 0.35, e.radius * 3.2);
        this.flash(e.x, 0.8, -e.y, 0.3, '#fff2c8', 0.18, e.radius * 2);
        this.burst(Kind.Fire, e.x, e.y, 0.8, 26, 8, 0, 0, 6.28, 0.6, 0.22, '#ff7a1a');
        this.burst(Kind.Gib, e.x, e.y, 0.8, 16, 11, 0, 0, 6.28, 1.8, 0.17, '#d88a4a');
        this.burst(Kind.Gib, e.x, e.y, 0.8, 8, 8, 0, 0, 6.28, 1.6, 0.14, '#6b6258');
        this.burst(Kind.Smoke, e.x, e.y, 0.9, 10, 2.5, 0, 0, 6.28, 1.2, 0.35, '#5a5148');
        this.splat(e.x, e.y, e.radius * 0.6, '#2a211c', 0.55);
        this.shake = Math.min(0.6, this.shake + 0.22);
        this.onExplosionShake(0.3);
        break;
      case 'nuke':
        this.light(e.x, 3, -e.y, '#fff2c0', 60, 0.9, 40);
        this.flash(e.x, 1, -e.y, 0.6, '#fff6d0', 0.7, 24);
        this.burst(Kind.Fire, e.x, e.y, 0.8, 80, 16, 0, 0, 6.28, 1.2, 0.3, '#ffb347');
        this.shake = Math.min(0.7, this.shake + 0.35);
        break;
      case 'secondWind':
        break;
      case 'barrelHit':
        this.burst(Kind.Spark, e.x, e.y, 0.8, 5, 4, 0, 0, 6.28, 0.25, 0.05, '#ff9a4a');
        break;
      case 'playerHit':
        this.burst(Kind.Blood, e.x, e.y, 1.0, 8, 4, 0, 0, 6.28, 0.6, 0.08, '#c01822');
        if (e.slot === localSlot) {
          this.hurt = 1;
          this.shake = Math.min(0.5, this.shake + 0.12);
        }
        break;
      case 'dash':
        this.burst(Kind.Smoke, e.x, e.y, 0.3, 6, 1.5, 0, 0, 6.28, 0.5, 0.25, '#d9cfc0');
        this.burst(Kind.Spark, e.x, e.y, 0.5, 4, 5, 0, 0, 6.28, 0.25, 0.06, '#ffffff');
        break;
      case 'bossAbility':
        this.flash(e.x, 0.6, -e.y, 0.4, e.kind === 'charge' ? '#ff5533' : '#a050ff', 0.5, 5);
        this.shake = Math.min(0.5, this.shake + 0.2);
        break;
      case 'pickup':
        this.burst(Kind.Spark, e.x, e.y, 0.6, 8, 4, 0, 0, 6.28, 0.35, 0.07, e.kind === 1 ? '#6dff9a' : e.kind === 3 ? '#d79bff' : '#ffe27a');
        break;
      case 'playerDown':
        this.burst(Kind.Blood, e.x, e.y, 0.9, 20, 5, 0, 0, 6.28, 0.9, 0.1, '#a3141c');
        this.splat(e.x, e.y, 0.9, '#7d0d14');
        break;
      default:
        break;
    }
  }

  update(dt: number): void {
    this.shake *= Math.max(0, 1 - dt * 7);
    this.hurt = Math.max(0, this.hurt - dt * 2.2);
    this.decalAge += dt;
    if (this.decalDirty && this.decalAge > 0.1) {
      this.decalTex.needsUpdate = true;
      this.decalDirty = false;
      this.decalAge = 0;
    }
    for (let k = this.flashes.length - 1; k >= 0; k--) {
      const f = this.flashes[k]!;
      f.life -= dt;
      if (f.life <= 0) {
        this.group.remove(f.mesh);
        (f.mesh.material as THREE.Material).dispose();
        this.flashes.splice(k, 1);
        continue;
      }
      const t = 1 - f.life / f.max;
      (f.mesh.material as THREE.MeshBasicMaterial).opacity = 0.9 * (1 - t);
      if (f.grow > 0) f.mesh.scale.setScalar(0.4 + f.grow * t);
    }
    // particles: swap-remove dead ones
    for (let i = 0; i < this.live; i++) {
      this.life[i] = this.life[i]! - dt;
      const kind = this.kind[i]!;
      if (this.life[i]! <= 0) {
        if (kind === Kind.Blood && this.py[i]! < 0.1) this.splat(this.px[i]!, -this.pz[i]!, 0.18, '#7d0d14', 0.6);
        this.remove(i);
        i--;
        continue;
      }
      if (kind !== Kind.Smoke && kind !== Kind.Fire) this.vy[i] = this.vy[i]! - GRAVITY * dt;
      else this.vy[i] = this.vy[i]! + 2 * dt;
      this.px[i] = this.px[i]! + this.vx[i]! * dt;
      this.py[i] = this.py[i]! + this.vy[i]! * dt;
      this.pz[i] = this.pz[i]! + this.vz[i]! * dt;
      if (this.py[i]! <= 0.05 && (kind === Kind.Blood || kind === Kind.Gib)) {
        this.py[i] = 0.05;
        if (kind === Kind.Blood) {
          this.splat(this.px[i]!, -this.pz[i]!, 0.14 + Math.random() * 0.1, '#7d0d14', 0.55);
          this.remove(i);
          i--;
          continue;
        }
        this.vy[i] = -this.vy[i]! * 0.35;
        this.vx[i] = this.vx[i]! * 0.7;
        this.vz[i] = this.vz[i]! * 0.7;
        this.spin[i] = this.spin[i]! * 0.7;
      }
    }
    const d = this.dummy;
    const m = this.mesh;
    for (let i = 0; i < this.live; i++) {
      const t = this.life[i]! / this.maxLife[i]!;
      let s = this.size[i]!;
      if (this.kind[i] === Kind.Smoke) s *= 1 + (1 - t) * 2.2;
      else if (this.kind[i] === Kind.Fire || this.kind[i] === Kind.Spark) s *= t;
      else if (t < 0.25) s *= t * 4;
      d.position.set(this.px[i]!, this.py[i]!, this.pz[i]!);
      d.rotation.set(this.rot[i]! + this.spin[i]! * (1 - t), this.rot[i]! * 0.5, this.spin[i]! * (1 - t) * 0.5);
      d.scale.setScalar(s);
      d.updateMatrix();
      m.setMatrixAt(i, d.matrix);
      m.setColorAt(i, this.c.setRGB(this.col[i * 3]!, this.col[i * 3 + 1]!, this.col[i * 3 + 2]!));
    }
    m.count = this.live;
    m.instanceMatrix.needsUpdate = true;
    if (m.instanceColor) m.instanceColor.needsUpdate = true;
  }

  private remove(i: number): void {
    const last = --this.live;
    if (i === last) return;
    this.px[i] = this.px[last]!;
    this.py[i] = this.py[last]!;
    this.pz[i] = this.pz[last]!;
    this.vx[i] = this.vx[last]!;
    this.vy[i] = this.vy[last]!;
    this.vz[i] = this.vz[last]!;
    this.life[i] = this.life[last]!;
    this.maxLife[i] = this.maxLife[last]!;
    this.size[i] = this.size[last]!;
    this.kind[i] = this.kind[last]!;
    this.spin[i] = this.spin[last]!;
    this.rot[i] = this.rot[last]!;
    this.col[i * 3] = this.col[last * 3]!;
    this.col[i * 3 + 1] = this.col[last * 3 + 1]!;
    this.col[i * 3 + 2] = this.col[last * 3 + 2]!;
  }

  get particleCount(): number {
    return this.live;
  }
}
