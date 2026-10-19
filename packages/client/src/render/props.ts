import * as THREE from 'three';
import { ARENA_HALF_H, ARENA_HALF_W, MAPS } from '@wrh/shared';
import * as SkeletonUtils from 'three/addons/utils/SkeletonUtils.js';
import { asset } from '../assets';
import { loadGLB } from './character';

const NAMES = ['crate', 'crate_stack', 'barrel', 'barrel_blue', 'cone', 'lamp', 'pallet', 'tyres', 'sandbags', 'bench', 'plant', 'barrier', 'container', 'sign'] as const;
type PropName = (typeof NAMES)[number];

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
  { outer: ['bench', 'plant', 'lamp', 'sandbags', 'sign', 'barrier'], top: ['plant', 'sandbags', 'cone', 'sign'], ground: '#c6cbd1' }, // courtyard
  { outer: ['tyres', 'barrel', 'barrier', 'crate_stack', 'lamp', 'sign', 'sandbags'], top: ['tyres', 'crate', 'cone', 'barrel_blue'], ground: '#c8c2c4' }, // corridors
  { outer: ['plant', 'plant', 'bench', 'sandbags', 'lamp', 'crate', 'barrel'], top: ['plant', 'plant', 'crate', 'sandbags'], ground: '#bfd0b6' }, // field
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
    return o;
  }

  setMap(index: number): void {
    if (index === this.current) return;
    this.current = index;
    for (const c of [...this.group.children]) this.group.remove(c);
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

  get count(): number {
    return this.group.children.length;
  }
}
