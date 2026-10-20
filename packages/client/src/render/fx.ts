import * as THREE from 'three';
import { ARENA_HALF_H, ARENA_HALF_W, BALANCE, ENEMY_TYPES, MAPS, WEAPON_IDS, type Box } from '@wrh/shared';
import type { SimEvent } from '@wrh/sim';

const MAX_PARTICLES = 3600;
const MAX_HOLES = 360;
const GRAVITY = 16;

export const GIB_COLORS: Record<string, string> = {
  grunt: '#9aa57a',
  runner: '#b9b27a',
  tank: '#8e8a98',
  exploder: '#d88a4a',
  spitter: '#7fa88e',
  shielder: '#8a98b8',
  spawner: '#a88ab0',
  crawler: '#a3b58a',
  leaper: '#7fa0d8',
  bloater: '#9fbf6a',
  screamer: '#d78bc1',
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

  /** Smoke and fire are soft round puffs (camera-facing quads with a radial texture and a per-puff alpha), not cubes. */
  private readonly smoke: THREE.InstancedMesh;
  private readonly fire: THREE.InstancedMesh;
  private readonly smokeAlpha = new Float32Array(MAX_PARTICLES);
  private readonly fireAlpha = new Float32Array(MAX_PARTICLES);
  private readonly camQ = new THREE.Quaternion();

  /** Bullet holes on the cover boxes: a ring buffer of little dark discs standing on the faces. */
  private readonly holes: THREE.InstancedMesh;
  private holeNext = 0;
  private holeCount = 0;
  private boxes: readonly Box[] = MAPS[0]!.boxes;

  /** Real-time light at a spot (muzzle flashes, explosions); wired to the stage's light pool by main. */
  light: (x: number, y: number, z: number, color: string, intensity: number, life: number, distance?: number) => void = () => undefined;

  /** The blood layer is cut into tiles: a splat only re-uploads the one or two small textures it touches. */
  private readonly decalTiles: { canvas: HTMLCanvasElement; ctx: CanvasRenderingContext2D; tex: THREE.CanvasTexture; mat: THREE.MeshBasicMaterial; x0: number; y0: number; dirty: boolean }[] = [];
  private decalW = 0;
  private decalH = 0;
  private decalAge = 0;
  private readonly flashes: { mesh: THREE.Mesh; life: number; max: number; grow: number; ring: boolean }[] = [];
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

    const pc = document.createElement('canvas');
    pc.width = pc.height = 64;
    const pg = pc.getContext('2d')!;
    const rg2 = pg.createRadialGradient(32, 32, 2, 32, 32, 31);
    rg2.addColorStop(0, 'rgba(255,255,255,.95)');
    rg2.addColorStop(0.45, 'rgba(255,255,255,.55)');
    rg2.addColorStop(1, 'rgba(255,255,255,0)');
    pg.fillStyle = rg2;
    pg.fillRect(0, 0, 64, 64);
    const puffTex = new THREE.CanvasTexture(pc);
    const makeSoft = (blending: THREE.Blending, alpha: Float32Array): THREE.InstancedMesh => {
      const geo = new THREE.PlaneGeometry(1, 1);
      geo.setAttribute('iAlpha', new THREE.InstancedBufferAttribute(alpha, 1));
      const mat = new THREE.MeshBasicMaterial({ map: puffTex, transparent: true, depthWrite: false, blending, toneMapped: false });
      mat.onBeforeCompile = (sh) => {
        sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\nattribute float iAlpha;\nvarying float vAlpha;').replace('#include <begin_vertex>', '#include <begin_vertex>\nvAlpha = iAlpha;');
        sh.fragmentShader = sh.fragmentShader.replace('#include <common>', '#include <common>\nvarying float vAlpha;').replace('#include <opaque_fragment>', '#include <opaque_fragment>\ngl_FragColor.a *= vAlpha;');
      };
      const m = new THREE.InstancedMesh(geo, mat, MAX_PARTICLES);
      m.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(MAX_PARTICLES * 3), 3);
      m.frustumCulled = false;
      m.count = 0;
      m.renderOrder = 4;
      this.group.add(m);
      return m;
    };
    this.smoke = makeSoft(THREE.NormalBlending, this.smokeAlpha);
    this.fire = makeSoft(THREE.AdditiveBlending, this.fireAlpha);

    // persistent decal layer: transparent canvas tiles laid over the floor
    const TX = 4;
    const TY = 3;
    const tw = (ARENA_HALF_W * 2) / TX;
    const th = (ARENA_HALF_H * 2) / TY;
    this.decalW = tw;
    this.decalH = th;
    for (let j = 0; j < TY; j++) {
      for (let i = 0; i < TX; i++) {
        const canvas = document.createElement('canvas');
        canvas.width = Math.round(tw * this.ppu);
        canvas.height = Math.round(th * this.ppu);
        const tex = new THREE.CanvasTexture(canvas);
        tex.colorSpace = THREE.SRGBColorSpace;
        const mat = new THREE.MeshBasicMaterial({ map: tex, transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2 });
        const mesh = new THREE.Mesh(new THREE.PlaneGeometry(tw, th), mat);
        const x0 = -ARENA_HALF_W + i * tw;
        const y0 = ARENA_HALF_H - j * th; // the top edge of the tile in sim y
        mesh.rotation.x = -Math.PI / 2;
        mesh.position.set(x0 + tw / 2, 0.012, -(y0 - th / 2));
        mesh.renderOrder = 1;
        this.group.add(mesh);
        this.decalTiles.push({ canvas, ctx: canvas.getContext('2d')!, tex, mat, x0, y0, dirty: false });
      }
    }

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

  /** The camera the puffs face (set once by main; the iso camera never turns). */
  faceCamera(q: THREE.Quaternion): void {
    this.camQ.copy(q);
  }

  /** Wipe the blood and the bullet holes: a new floor starts clean. */
  /** Called when the floor is wiped (a new floor starts clean); main clears the flying parts here. */
  onClear: (() => void) | null = null;

  clearFloor(): void {
    this.onClear?.();
    for (const t of this.decalTiles) {
      t.ctx.clearRect(0, 0, t.canvas.width, t.canvas.height);
      t.tex.needsUpdate = true;
      t.dirty = false;
    }
    this.holeCount = 0;
    this.holeNext = 0;
    this.holes.count = 0;
    this.setFloorFade(1);
  }

  /** Fade the floor's blood and holes (the old floor dissolves during the climb). */
  setFloorFade(f: number): void {
    for (const t of this.decalTiles) t.mat.opacity = f;
    this.holes.visible = f > 0.35;
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

  private readonly splatBlobs = new Float32Array(3 * 8);

  private splat(x: number, y: number, radius: number, color: string, alpha = 0.7): void {
    const blobs = 3 + Math.floor(Math.random() * 4);
    const bl = this.splatBlobs;
    let minX = 1e9;
    let maxX = -1e9;
    let minY = 1e9;
    let maxY = -1e9;
    for (let i = 0; i < blobs; i++) {
      const a = Math.random() * Math.PI * 2;
      const d = Math.random() * radius * 0.7;
      const r = (0.25 + Math.random() * 0.6) * radius;
      const bx = x + Math.cos(a) * d;
      const by = y + Math.sin(a) * d;
      bl[i * 3] = bx;
      bl[i * 3 + 1] = by;
      bl[i * 3 + 2] = r;
      minX = Math.min(minX, bx - r);
      maxX = Math.max(maxX, bx + r);
      minY = Math.min(minY, by - r);
      maxY = Math.max(maxY, by + r);
    }
    for (const t of this.decalTiles) {
      if (maxX < t.x0 || minX > t.x0 + this.decalW || maxY < t.y0 - this.decalH || minY > t.y0) continue;
      const ctx = t.ctx;
      ctx.globalAlpha = alpha;
      ctx.fillStyle = color;
      for (let i = 0; i < blobs; i++) {
        ctx.beginPath();
        ctx.arc((bl[i * 3]! - t.x0) * this.ppu, (t.y0 - bl[i * 3 + 1]!) * this.ppu, bl[i * 3 + 2]! * this.ppu, 0, Math.PI * 2);
        ctx.fill();
      }
      t.dirty = true;
    }
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

  /** An expanding ring on the floor under a heavy hit. */
  shockRing(x: number, y: number, color: string, size: number): void {
    let m = this.ringFree.pop();
    if (!m) {
      m = new THREE.Mesh(this.ringGeo, new THREE.MeshBasicMaterial({ transparent: true, opacity: 0.75, depthWrite: false, side: THREE.DoubleSide, toneMapped: false }));
      m.rotation.x = -Math.PI / 2;
    }
    const mat = m.material as THREE.MeshBasicMaterial;
    mat.color.set(color);
    mat.opacity = 0.75;
    m.position.set(x, 0.06, -y);
    m.scale.setScalar(0.5);
    this.group.add(m);
    this.flashes.push({ mesh: m, life: 0.28, max: 0.28, grow: size * 2.2, ring: true });
  }

  /** The streak of a melee swing: a ring segment (the whole ring for a spin) that sweeps and fades in a moment. */
  slash(x: number, y: number, angle: number, arc: number, radius: number, color: string, spin: boolean): void {
    const full = arc > 6;
    const key = full ? -1 : Math.round(arc * 20);
    let geo = this.slashGeo.get(key);
    if (!geo) {
      geo = new THREE.RingGeometry(0.5, 1, full ? 40 : 24, 1, full ? 0 : -arc / 2, full ? Math.PI * 2 : arc);
      this.slashGeo.set(key, geo);
    }
    const sl = this.slashFree.pop() ?? (() => {
      const g = new THREE.Group();
      const mesh = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ transparent: true, opacity: 0.8, depthWrite: false, side: THREE.DoubleSide, toneMapped: false }));
      mesh.rotation.x = -Math.PI / 2;
      g.add(mesh);
      return { group: g, mesh, life: 0, max: 0.2, spin: false, radius: 1 };
    })();
    sl.mesh.geometry = geo;
    (sl.mesh.material as THREE.MeshBasicMaterial).color.set(color);
    (sl.mesh.material as THREE.MeshBasicMaterial).opacity = 0.8;
    sl.group.position.set(x, 0.55, -y);
    sl.group.rotation.y = angle;
    sl.radius = radius;
    sl.spin = spin;
    sl.life = sl.max = 0.2;
    sl.group.scale.setScalar(radius * (spin ? 0.5 : 0.85));
    this.group.add(sl.group);
    this.slashes.push(sl);
  }

  private readonly slashGeo = new Map<number, THREE.RingGeometry>();
  private readonly slashFree: { group: THREE.Group; mesh: THREE.Mesh; life: number; max: number; spin: boolean; radius: number }[] = [];
  private readonly slashes: { group: THREE.Group; mesh: THREE.Mesh; life: number; max: number; spin: boolean; radius: number }[] = [];

  /** A small kick of dust under a running character's feet. */
  dust(x: number, y: number): void {
    this.burst(Kind.Smoke, x, y, 0.12, 1, 0.9, 0, 0, 6.28, 0.35, 0.15, '#d9d3c6');
  }

  /** One puff of flame along a flamethrower's path. */
  flame(x: number, y: number, h: number): void {
    this.burst(Kind.Fire, x, y, h, 1, 1.2, 0, 0, 6.28, 0.35, 0.2, '#ff8a2a');
  }

  /** A soft sparkle drifting up from a spot (upgrade auras). */
  sparkle(x: number, y: number, h: number, color: string, count: number, speed: number): void {
    this.burst(Kind.Spark, x, y, h, count, speed, 0, 0, 6.28, 0.7, 0.05, color);
  }

  /** A single drop of blood shed by a flying part. */
  drip(x: number, y: number, h: number): void {
    this.burst(Kind.Blood, x, y, h, 1, 1.2, 0, 0, 6.28, 0.5, 0.06, '#9b121a');
  }

  /** The blood that lands where a part hits the floor. */
  gorePatch(x: number, y: number, r: number): void {
    this.splat(x, y, r, '#7d0d14', 0.65);
    this.burst(Kind.Blood, x, y, 0.2, 7, 4, 0, 0, 6.28, 0.5, 0.07, '#a3141c');
  }

  /** Blood pumping out of a stump: a few droplets thrown up and out, weaker as `k` falls from 1 to 0. */
  spurt(x: number, y: number, h: number, dirX: number, dirY: number, k: number): void {
    this.burst(Kind.Blood, x, y, h, Math.max(1, Math.round(5 * k)), 3 + 4 * k, dirX, dirY, 1.2, 0.7, 0.07, '#b3161f');
  }

  /** Particle amount and blood/gib amount multipliers (settings). */
  density = 1;
  gore = 1;

  private burst(kind: Kind, sx: number, sy: number, h: number, count: number, speed: number, dirX: number, dirY: number, spread: number, life: number, size: number, color: string): void {
    const want = count * this.density * (kind === Kind.Blood || kind === Kind.Gib ? this.gore : 1);
    count = Math.floor(want) + (Math.random() < want - Math.floor(want) ? 1 : 0);
    for (let n = 0; n < count; n++) {
      // sim (x, y) -> three (x, h, -y)
      const a = Math.atan2(dirY, dirX) + (Math.random() - 0.5) * spread;
      const s = speed * (0.4 + Math.random() * 0.8);
      this.emit(kind, sx, h, -sy, Math.cos(a) * s, 2 + Math.random() * speed * 0.5, -Math.sin(a) * s, life * (0.6 + Math.random() * 0.6), size * (0.6 + Math.random() * 0.8), color);
    }
  }

  /** Meshes of finished flashes and rings, kept for the next one (no allocation, no new material per hit). */
  private readonly flashFree: THREE.Mesh[] = [];
  private readonly ringFree: THREE.Mesh[] = [];
  private readonly ringGeo = new THREE.RingGeometry(0.42, 0.55, 28);

  private flash(x: number, y: number, z: number, radius: number, color: string, life: number, grow: number): void {
    const m = this.flashFree.pop() ?? new THREE.Mesh(this.flashGeo, new THREE.MeshBasicMaterial({ transparent: true, opacity: 0.9, depthWrite: false }));
    (m.material as THREE.MeshBasicMaterial).color.set(color);
    (m.material as THREE.MeshBasicMaterial).opacity = 0.9;
    m.position.set(x, y, z);
    m.scale.setScalar(radius);
    this.group.add(m);
    this.flashes.push({ mesh: m, life, max: life, grow, ring: false });
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
        if (WEAPON_IDS[e.weapon] !== 'flamer' && WEAPON_IDS[e.weapon] !== 'gl') {
          // an empty brass case flips out to the right and bounces on the floor
          this.burst(Kind.Gib, e.x + Math.cos(e.angle) * 0.9, e.y + Math.sin(e.angle) * 0.9, st.muzzleH, 1, 2.6, Math.sin(e.angle), -Math.cos(e.angle), 0.9, 0.9, 0.045, '#d9a441');
        }
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
        // the harder the blow, the more blood, and a spray of fine droplets
        this.burst(Kind.Blood, e.x, e.y, 0.9, 6 + Math.min(14, Math.round(e.damage * 0.12)), 4 + Math.min(4, e.damage * 0.03), 0, 0, 6.28, 0.55, 0.075, '#8c1018');
        if (e.damage >= 18) this.burst(Kind.Blood, e.x, e.y, 1.1, Math.min(16, Math.round(e.damage * 0.1)), 7.5, 0, 0, 6.28, 0.4, 0.04, '#b3161f');
        if (e.damage >= 45) this.splat(e.x, e.y, 0.5 + Math.min(0.6, e.damage * 0.004), '#7d0d14', 0.55);
        if (e.damage >= 30) this.shockRing(e.x, e.y, e.damage >= 80 ? '#ffe9a0' : '#ffffff', 0.9 + Math.min(1.4, e.damage * 0.01));
        break;
      case 'enemyDeath': {
        const power = Math.min(1.6, 0.6 + e.power * 0.01);
        const type = ENEMY_TYPES[e.etype]!;
        if (type === 'exploder') break; // the explosion event covers it
        this.burst(Kind.Blood, e.x, e.y, 0.8, Math.round(38 * power), 9 * power, e.dx, e.dy, 1.8, 0.95, 0.1, '#a3141c');
        this.burst(Kind.Blood, e.x, e.y, 0.9, Math.round(18 * power), 5, 0, 0, 6.28, 0.7, 0.08, '#8c1018');
        this.burst(Kind.Gib, e.x, e.y, 0.8, 6 + Math.round(9 * power), 7.5 * power, e.dx, e.dy, 2.8, 1.9, 0.18, GIB_COLORS[type] ?? '#aaa');
        this.splat(e.x + e.dx * 0.5, e.y + e.dy * 0.5, 0.95 * power, '#7d0d14');
        this.splat(e.x + e.dx * 1.6, e.y + e.dy * 1.6, 0.6 * power, '#6a0a10', 0.6);
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
      case 'teleHit': {
        // the blow lands: a ring that sweeps out, dust and a hard shake (bigger for the deadly ones)
        const deadly = e.effect === 1 || e.effect === 2;
        const acid = e.effect === 3;
        const col = acid ? '#a6ff4d' : deadly ? '#ff3da8' : '#ffb04a';
        this.shockRing(e.x, e.y, col, Math.min(6, e.radius * 0.9));
        this.burst(Kind.Smoke, e.x, e.y, 0.3, Math.min(40, 6 + Math.round(e.radius * 2)), 3 + e.radius * 0.4, 0, 0, 6.28, 0.9, 0.35, acid ? '#9ad65a' : '#d9cfc0');
        if (!acid) {
          this.flash(e.x, 1.0, -e.y, 0.9, col, 0.4, Math.min(12, e.radius * 2.5));
          this.shake = Math.min(0.9, this.shake + (deadly ? 0.5 : 0.28));
        }
        break;
      }
      case 'swing': {
        const hammer = e.weapon === WEAPON_IDS.indexOf('hammer');
        const spin = e.arc > 6;
        this.slash(e.x, e.y, e.angle, e.arc, e.radius, hammer ? '#ffb04a' : '#e6f6ff', spin);
        if (spin) {
          this.burst(Kind.Smoke, e.x, e.y, 0.3, 10, 4, 0, 0, 6.28, 0.5, 0.3, '#d9cfc0');
          this.shake = Math.min(0.9, this.shake + 0.15 + e.charge * 0.35);
        } else this.shake = Math.min(0.9, this.shake + (hammer ? 0.12 : 0.04));
        if (e.hits > 0) this.burst(Kind.Spark, e.x + Math.cos(e.angle) * e.radius * 0.6, e.y + Math.sin(e.angle) * e.radius * 0.6, 0.8, Math.min(14, 3 + e.hits * 2), 5, 0, 0, 6.28, 0.25, 0.07, '#fff3b0');
        break;
      }
      case 'ability': {
        const x = e.x;
        const y = e.y;
        // one coloured ring and a shower of sparkles in the colour of the class
        const look: Record<number, [string, number]> = { 0: ['#ffd84a', 6], 1: ['#6dff9a', 6], 2: ['#8fb4ff', 3], 3: ['#6df2ff', 3], 5: ['#ffe27a', 3], 6: ['#ff5a3c', 5], 7: ['#e6f6ff', 4], 8: ['#ffb04a', 5] };
        const [col, size] = look[e.cls] ?? ['#ffffff', 4];
        this.shockRing(x, y, col, size);
        this.sparkle(x, y, 0.6, col, 18, 5);
        this.flash(x, 0.9, -y, 0.8, col, 0.3, 4);
        break;
      }
      case 'blink':
        for (const [x, y] of [[e.x0, e.y0], [e.x, e.y]] as const) {
          this.burst(Kind.Smoke, x, y, 0.5, 8, 2.5, 0, 0, 6.28, 0.5, 0.3, '#6a6fd8');
          this.sparkle(x, y, 0.9, '#8ff6ff', 10, 3);
        }
        break;
      case 'launch':
        this.burst(Kind.Smoke, e.x, e.y, 0.2, 10, 3, 0, 0, 6.28, 0.5, 0.3, '#d9cfc0');
        this.burst(Kind.Spark, e.x, e.y, 0.6, 8, 5, 0, 0, 6.28, 0.3, 0.07, '#ffe27a');
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
    for (let k = this.slashes.length - 1; k >= 0; k--) {
      const sl = this.slashes[k]!;
      sl.life -= dt;
      if (sl.life <= 0) {
        this.group.remove(sl.group);
        this.slashFree.push(sl);
        this.slashes.splice(k, 1);
        continue;
      }
      const t = 1 - sl.life / sl.max;
      sl.group.scale.setScalar(sl.radius * (sl.spin ? 0.5 + 0.6 * t : 0.85 + 0.25 * t));
      (sl.mesh.material as THREE.MeshBasicMaterial).opacity = 0.8 * (1 - t) * (1 - t * 0.4);
    }
    this.hurt = Math.max(0, this.hurt - dt * 2.2);
    this.decalAge += dt;
    if (this.decalAge > 0.12) {
      // one small tile per interval: a fight never uploads the whole floor at once
      for (const t of this.decalTiles) {
        if (!t.dirty) continue;
        t.tex.needsUpdate = true;
        t.dirty = false;
        this.decalAge = 0;
        break;
      }
    }
    for (let k = this.flashes.length - 1; k >= 0; k--) {
      const f = this.flashes[k]!;
      f.life -= dt;
      if (f.life <= 0) {
        this.group.remove(f.mesh);
        (f.ring ? this.ringFree : this.flashFree).push(f.mesh);
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
    let nb = 0;
    let ns = 0;
    let nf = 0;
    for (let i = 0; i < this.live; i++) {
      const t = this.life[i]! / this.maxLife[i]!;
      const kind = this.kind[i]!;
      let s = this.size[i]!;
      if (kind === Kind.Smoke) {
        // a puff swells and thins out
        d.position.set(this.px[i]!, this.py[i]!, this.pz[i]!);
        d.quaternion.copy(this.camQ);
        d.rotateZ(this.rot[i]! + this.spin[i]! * (1 - t) * 0.15);
        d.scale.setScalar(s * (2.2 + (1 - t) * 3.2));
        d.updateMatrix();
        this.smoke.setMatrixAt(ns, d.matrix);
        this.smoke.setColorAt(ns, this.c.setRGB(this.col[i * 3]!, this.col[i * 3 + 1]!, this.col[i * 3 + 2]!));
        this.smokeAlpha[ns++] = Math.min(1, t * 2.2) * 0.55;
      } else if (kind === Kind.Fire) {
        d.position.set(this.px[i]!, this.py[i]!, this.pz[i]!);
        d.quaternion.copy(this.camQ);
        d.rotateZ(this.rot[i]!);
        d.scale.setScalar(s * (2.4 + t * 1.6));
        d.updateMatrix();
        this.fire.setMatrixAt(nf, d.matrix);
        this.fire.setColorAt(nf, this.c.setRGB(this.col[i * 3]!, this.col[i * 3 + 1]!, this.col[i * 3 + 2]!));
        this.fireAlpha[nf++] = Math.min(1, t * 1.8) * 0.8;
      } else {
        if (kind === Kind.Spark) s *= t;
        else if (t < 0.25) s *= t * 4;
        d.position.set(this.px[i]!, this.py[i]!, this.pz[i]!);
        d.rotation.set(this.rot[i]! + this.spin[i]! * (1 - t), this.rot[i]! * 0.5, this.spin[i]! * (1 - t) * 0.5);
        d.scale.setScalar(s);
        d.updateMatrix();
        m.setMatrixAt(nb, d.matrix);
        m.setColorAt(nb++, this.c.setRGB(this.col[i * 3]!, this.col[i * 3 + 1]!, this.col[i * 3 + 2]!));
      }
    }
    m.count = nb;
    m.instanceMatrix.needsUpdate = true;
    if (m.instanceColor) m.instanceColor.needsUpdate = true;
    for (const [mesh, n, attr] of [[this.smoke, ns, this.smokeAlpha], [this.fire, nf, this.fireAlpha]] as const) {
      mesh.count = n;
      mesh.instanceMatrix.needsUpdate = true;
      if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
      (mesh.geometry.getAttribute('iAlpha') as THREE.InstancedBufferAttribute).needsUpdate = true;
      void attr;
    }
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
