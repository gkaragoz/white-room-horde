import * as THREE from 'three';
import { ARENA_HALF_H, ARENA_HALF_W, MAPS } from '@wrh/shared';
import * as SkeletonUtils from 'three/addons/utils/SkeletonUtils.js';
import { asset } from '../assets';
import { loadGLB } from './character';

const NAMES = [
  'crate', 'crate_stack', 'barrel', 'barrel_blue', 'cone', 'lamp', 'pallet', 'tyres', 'sandbags', 'bench', 'plant', 'barrier', 'container', 'sign',
  'pine_tree', 'rock', 'hay_bale', 'dumpster', 'tent', 'generator', 'wreck_car', 'tombstone', 'campfire', 'fuel_tank', 'picnic_table', 'neon_sign', 'radio_tower', 'skull_pile',
] as const;
type PropName = (typeof NAMES)[number];

/** Props that shine at night: where the light sits (model units, rotated with the prop), its colour and how big the glow is. */
const LIGHTS: Partial<Record<string, { dx: number; dy: number; dz: number; color: string; size: number }>> = {
  lamp: { dx: 0.62, dy: 3.38, dz: 0, color: '#ffe2a8', size: 3.4 },
  campfire: { dx: 0, dy: 0.7, dz: 0, color: '#ff9a3a', size: 3.6 },
  neon_sign: { dx: 0, dy: 3.1, dz: 0, color: '#ff4fd8', size: 3.2 },
  radio_tower: { dx: 0, dy: 5.1, dz: 0, color: '#ff3a3a', size: 1.6 },
};

let glowTexture: THREE.CanvasTexture | null = null;
function glowTex(): THREE.CanvasTexture {
  if (glowTexture) return glowTexture;
  const c = document.createElement('canvas');
  c.width = c.height = 64;
  const g = c.getContext('2d')!;
  const rg = g.createRadialGradient(32, 32, 0, 32, 32, 32);
  rg.addColorStop(0, 'rgba(255,255,255,1)');
  rg.addColorStop(0.25, 'rgba(255,255,255,.55)');
  rg.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = rg;
  g.fillRect(0, 0, 64, 64);
  glowTexture = new THREE.CanvasTexture(c);
  return glowTexture;
}

function rng(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** What each arena is surrounded by, so the four layouts feel like different places. */
const THEMES: { outer: PropName[]; top: PropName[]; ground: string }[] = [
  { outer: ['container', 'crate_stack', 'pallet', 'barrel', 'barrel_blue', 'lamp', 'crate'], top: ['crate', 'barrel', 'pallet', 'cone'], ground: '#c3ccd8' }, // warehouse yard
  { outer: ['bench', 'plant', 'lamp', 'sandbags', 'sign', 'barrier', 'picnic_table', 'pine_tree'], top: ['plant', 'sandbags', 'cone', 'sign'], ground: '#c6cbd1' }, // courtyard
  { outer: ['tyres', 'barrel', 'barrier', 'crate_stack', 'lamp', 'sign', 'sandbags'], top: ['tyres', 'crate', 'cone', 'barrel_blue'], ground: '#c8c2c4' }, // corridors
  { outer: ['plant', 'plant', 'bench', 'sandbags', 'lamp', 'crate', 'barrel'], top: ['plant', 'plant', 'crate', 'sandbags'], ground: '#bfd0b6' }, // field
  { outer: ['tombstone', 'rock', 'skull_pile', 'pine_tree', 'campfire', 'lamp', 'wreck_car', 'tent'], top: ['skull_pile', 'rock', 'tombstone', 'sandbags'], ground: '#b9b0a6' }, // ruins
  { outer: ['generator', 'fuel_tank', 'dumpster', 'wreck_car', 'neon_sign', 'radio_tower', 'lamp', 'crate_stack', 'barrel'], top: ['generator', 'crate', 'barrel_blue', 'fuel_tank'], ground: '#c2bfba' }, // factory
];

/**
 * Decorative 3D scenery: a fence of barriers along the edge of the floor, a ring of themed props outside it and a few
 * things standing on top of the cover boxes. Nothing here collides; the simulation never knows about it.
 */
export class PropsView {
  readonly group = new THREE.Group();
  private readonly models = new Map<PropName, THREE.Object3D>();
  private current = -1;
  private ground: THREE.Mesh | null = null;
  /** Light sources of the current arena (world coordinates), for the stage's real-time lamp lights. */
  lamps: { x: number; y: number; z: number; color?: string }[] = [];
  private readonly glows: THREE.Sprite[] = [];

  static async create(): Promise<PropsView> {
    const v = new PropsView();
    await Promise.all(
      NAMES.map(async (n) => {
        const g = await loadGLB(asset(`models/props/prop_${n}.glb`));
        g.scene.traverse((o) => {
          if ((o as THREE.Mesh).isMesh) {
            o.castShadow = true;
            o.receiveShadow = true;
          }
        });
        v.models.set(n, g.scene);
      }),
    );
    return v;
  }

  private place(name: PropName, x: number, z: number, y = 0, rotY = 0, scale = 1): THREE.Object3D {
    const o = SkeletonUtils.clone(this.models.get(name)!);
    o.position.set(x, y, z);
    o.rotation.y = rotY;
    o.scale.setScalar(scale);
    this.group.add(o);
    const lt = LIGHTS[name];
    if (lt) {
      const c = Math.cos(rotY);
      const s = Math.sin(rotY);
      const hx = x + (lt.dx * c + lt.dz * s) * scale;
      const hz = z + (-lt.dx * s + lt.dz * c) * scale;
      const hy = y + lt.dy * scale;
      const sprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTex(), color: lt.color, transparent: true, opacity: 0, depthWrite: false, blending: THREE.AdditiveBlending, toneMapped: false }));
      sprite.position.set(hx, hy, hz);
      sprite.scale.setScalar(lt.size * scale);
      this.group.add(sprite);
      this.glows.push(sprite);
      this.lamps.push({ x: hx, y: hy, z: hz, color: lt.color });
    }
    return o;
  }

  setMap(index: number): void {
    if (index === this.current) return;
    this.current = index;
    for (const c of [...this.group.children]) this.group.remove(c);
    this.barrelMeshes.length = 0;
    this.lamps = [];
    this.glows.length = 0;
    const theme = THEMES[index] ?? THEMES[0]!;
    const rand = rng(1234 + index * 77);
    const pick = <T,>(a: readonly T[]): T => a[Math.floor(rand() * a.length)]!;

    // ground beyond the floor so the arena does not float in the sky colour
    if (!this.ground) {
      this.ground = new THREE.Mesh(new THREE.PlaneGeometry(220, 160), new THREE.MeshStandardMaterial({ color: theme.ground, roughness: 1 }));
      this.ground.rotation.x = -Math.PI / 2;
      this.ground.position.y = -0.02;
      this.ground.receiveShadow = true;
    }
    (this.ground.material as THREE.MeshStandardMaterial).color.set(theme.ground);
    this.group.add(this.ground);

    // fence of barriers right outside the floor edge, with gaps and lamps
    const W = ARENA_HALF_W + 0.9;
    const H = ARENA_HALF_H + 0.9;
    for (let x = -W; x <= W; x += 1.95) {
      for (const z of [-H, H]) if (rand() > 0.12) this.place('barrier', x, z, 0, 0, 1);
    }
    for (let z = -H + 1.3; z <= H - 1.3; z += 1.95) {
      for (const x of [-W, W]) if (rand() > 0.12) this.place('barrier', x, z, 0, Math.PI / 2, 1);
    }
    for (const [x, z] of [[-W + 0.4, -H + 0.4], [W - 0.4, -H + 0.4], [-W + 0.4, H - 0.4], [W - 0.4, H - 0.4], [0, -H - 0.2], [0, H + 0.2]] as const) this.place('lamp', x, z, 0, rand() * 6.28, 1.15);

    // themed props in a loose ring outside; big ones further out
    const count = 46;
    for (let i = 0; i < count; i++) {
      const side = Math.floor(rand() * 4);
      const along = rand();
      const out = 2.2 + rand() * 9;
      let x: number, z: number;
      if (side === 0) [x, z] = [-W - 0.5 + (along - 0.5) * 2 * (W + 10), -H - out];
      else if (side === 1) [x, z] = [-W - 0.5 + (along - 0.5) * 2 * (W + 10), H + out];
      else if (side === 2) [x, z] = [-W - out, (along - 0.5) * 2 * (H + 6)];
      else [x, z] = [W + out, (along - 0.5) * 2 * (H + 6)];
      const name = pick(theme.outer);
      const big = name === 'container';
      if (big && out < 4) continue;
      this.place(name, x, z, 0, big ? (side < 2 ? 0 : Math.PI / 2) + (rand() - 0.5) * 0.2 : rand() * 6.28, big ? 1 : 0.9 + rand() * 0.4);
    }

    // little scenes on top of some cover boxes
    const boxes = MAPS[index]?.boxes ?? MAPS[0]!.boxes;
    for (const b of boxes) {
      if (rand() < 0.45) continue;
      const n = 1 + Math.floor(rand() * 2);
      for (let k = 0; k < n; k++) {
        const name = pick(theme.top);
        const ox = (rand() - 0.5) * Math.max(0, b.w - 1);
        const oy = (rand() - 0.5) * Math.max(0, b.h - 1);
        this.place(name, b.x + ox, -(b.y + oy), 1.1, rand() * 6.28, 0.7 + rand() * 0.2);
      }
    }
  }

  private readonly barrelMeshes: THREE.Object3D[] = [];

  /** The explosive barrels of the simulation: stand them up where the world says, hide the ones that blew up. */
  syncBarrels(w: { brActive: Uint8Array; brX: Float64Array; brY: Float64Array }, now: number): void {
    const proto = this.models.get('barrel');
    if (!proto) return;
    for (let b = 0; b < w.brActive.length; b++) {
      let m = this.barrelMeshes[b];
      if (!m) {
        m = SkeletonUtils.clone(proto);
        m.scale.setScalar(1.1);
        this.group.add(m);
        this.barrelMeshes[b] = m;
      }
      m.visible = w.brActive[b] === 1;
      m.position.set(w.brX[b]!, 0, -w.brY[b]!);
      m.rotation.y = b * 1.3;
      m.scale.y = 1.1 + Math.sin(now * 5 + b) * 0.02;
    }
  }

  /** Glow sprites of lamps and fires fade in with the night. */
  setNight(n: number): void {
    for (const s of this.glows) (s.material as THREE.SpriteMaterial).opacity = Math.min(1, n * 1.1);
  }

  get count(): number {
    return this.group.children.length;
  }
}
