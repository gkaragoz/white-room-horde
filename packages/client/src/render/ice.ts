import * as THREE from 'three';
import { MAX_ENEMIES } from '@wrh/shared';
import type { World } from '@wrh/sim';
import { asset } from '../assets';
import { loadGLB } from './character';

const PER_ENEMY = 5;
const CAPACITY = 520;

/**
 * The broken ice that grows out of a frozen enemy: a few clusters of crystals (a Blender-made mesh, tools/blender/make_ice.py)
 * on a ring around the body, growing with the frost level of the enemy and sinking away again as it thaws. They sit on top
 * of the shader's ice coat (render/crowd.ts) and give the frozen horde its jagged silhouette.
 */
export class IceShards {
  readonly group = new THREE.Group();
  private mesh: THREE.InstancedMesh | null = null;
  private readonly dummy = new THREE.Object3D();
  private count = 0;

  static async create(): Promise<IceShards> {
    const ice = new IceShards();
    try {
      const gltf = await loadGLB(asset('models/props/ice_shard.glb'));
      let geo: THREE.BufferGeometry | null = null;
      gltf.scene.traverse((o) => {
        if (!geo && (o as THREE.Mesh).isMesh) geo = (o as THREE.Mesh).geometry;
      });
      if (geo) {
        const mat = new THREE.MeshStandardMaterial({ color: '#b9e3ff', roughness: 0.14, metalness: 0.05, emissive: '#2a5a8a', emissiveIntensity: 0.55, transparent: true, opacity: 0.88, flatShading: true });
        const mesh = new THREE.InstancedMesh(geo, mat, CAPACITY);
        mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
        mesh.frustumCulled = false;
        mesh.castShadow = false;
        mesh.count = 0;
        ice.mesh = mesh;
        ice.group.add(mesh);
      }
    } catch {
      /* no shards: the shader coat alone still shows the freeze */
    }
    return ice;
  }

  /** `level[i]` is the drawn frost (0..1) of enemy i; `pos(i)` is where it is drawn. Call once per frame. */
  update(w: World, level: Float32Array, nowSec: number, pos: (i: number) => { x: number; y: number } | null, bigOf: (i: number) => number): void {
    const mesh = this.mesh;
    if (!mesh) return;
    let n = 0;
    for (let i = 0; i < MAX_ENEMIES && n + PER_ENEMY <= CAPACITY; i++) {
      const k = level[i]!;
      if (k < 0.12 || !w.eActive[i]) continue;
      const p = pos(i);
      if (!p) continue;
      const size = bigOf(i);
      for (let c = 0; c < PER_ENEMY; c++) {
        // a stable pseudo-random place on the body for every shard of every enemy (so they do not jump about)
        const h1 = Math.sin(i * 12.9898 + c * 78.233) * 43758.5453;
        const r1 = h1 - Math.floor(h1);
        const h2 = Math.sin(i * 39.3467 + c * 11.135) * 24634.6345;
        const r2 = h2 - Math.floor(h2);
        const a = (c / PER_ENEMY) * Math.PI * 2 + r1 * 1.1;
        const ring = (0.34 + r2 * 0.22) * size;
        const grow = Math.min(1, Math.max(0, (k - 0.12 - c * 0.04) / 0.5));
        // shards grow in turn; the last ones come up late and drop first
        const s = (0.5 + r1 * 0.55) * size * grow;
        if (s <= 0.02) continue;
        this.dummy.position.set(p.x + Math.cos(a) * ring, 0.05 + r2 * 0.9 * size * k, -p.y + Math.sin(a) * ring);
        // lean out away from the body
        this.dummy.rotation.set(Math.sin(a) * (0.5 + r2 * 0.5), r1 * 6.28, -Math.cos(a) * (0.5 + r2 * 0.5));
        this.dummy.scale.set(s, s * (0.9 + r2 * 0.6), s);
        this.dummy.updateMatrix();
        mesh.setMatrixAt(n++, this.dummy.matrix);
      }
    }
    mesh.count = n;
    mesh.instanceMatrix.needsUpdate = true;
    this.count = n;
    void nowSec;
  }

  get shown(): number {
    return this.count;
  }
}
