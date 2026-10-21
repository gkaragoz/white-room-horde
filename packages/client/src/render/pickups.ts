import * as THREE from 'three';
import { MAPS, MAX_PICKUPS, heightAt } from '@wrh/shared';
import type { World } from '@wrh/sim';
import { WEAPON_IDS } from '@wrh/shared';
import { asset } from '../assets';
import { loadGLB } from './character';

const MODELS = ['ammo', 'health', 'grenade', 'weapon', 'shield', 'haste', 'quad', 'nuke', 'freeze'] as const;
const MODEL_SCALE = 0.85;
/** Rarity colours, as on the cards: white (plain), blue (useful), purple (valuable), red (legendary). */
export const TIER_COLORS = ['#e6e9ef', '#4aa8ff', '#b45cff', '#ff3b30'] as const;
const KIND_TIER = [0, 1, 0, 2, 1, 1, 2, 3, 2, 3];
const WEAPON_TIER: Record<string, number> = { pistol: 0, smg: 1, ar: 1, shotgun: 1, mp: 1, revolver: 1, dbl: 1, hmg: 2, sniper: 2, dmr: 2, flamer: 2, gl: 2, minigun: 3 };

/** How valuable a drop is: 0 plain, 1 useful, 2 valuable, 3 legendary. */
export function pickupTier(kind: number, data: number): number {
  return kind === 3 ? (WEAPON_TIER[WEAPON_IDS[data] ?? ''] ?? 1) : (KIND_TIER[kind] ?? 0);
}

function hullMaterial(): THREE.MeshBasicMaterial {
  return new THREE.MeshBasicMaterial({ color: '#ffffff', side: THREE.BackSide, transparent: true, opacity: 0.9, toneMapped: false, depthWrite: false });
}

const COLORS = ['#ffcf3a', '#3ddc6a', '#6b8f4a', '#c06bff', '#35c8ff', '#fff23a', '#ff3a3a', '#ffb000', '#9be8ff', '#4df0c8'];
const KINDS = COLORS.length;

/** Floating, spinning crates for the loot the sim drops (ammo, health, grenades), with a glow ring on the floor. */
export class PickupView {
  readonly group = new THREE.Group();
  private readonly crates: THREE.InstancedMesh[] = [];
  private readonly rings: THREE.InstancedMesh;
  private readonly hulls: THREE.InstancedMesh[] = [];
  private readonly tierColor = TIER_COLORS.map((c) => new THREE.Color(c));
  private readonly dummy = new THREE.Object3D();
  private readonly counts = new Array<number>(KINDS).fill(0);

  constructor() {
    const geo = [
      new THREE.BoxGeometry(0.46, 0.34, 0.46), new THREE.BoxGeometry(0.42, 0.42, 0.42), new THREE.SphereGeometry(0.26, 10, 8), new THREE.OctahedronGeometry(0.34),
      new THREE.IcosahedronGeometry(0.34, 0), new THREE.TetrahedronGeometry(0.4), new THREE.BoxGeometry(0.4, 0.4, 0.4), new THREE.DodecahedronGeometry(0.5, 0), new THREE.OctahedronGeometry(0.44), new THREE.IcosahedronGeometry(0.4, 1),
    ];
    for (let k = 0; k < KINDS; k++) {
      const mat = new THREE.MeshStandardMaterial({ color: COLORS[k], emissive: COLORS[k], emissiveIntensity: 0.55, roughness: 0.5, flatShading: true });
      const m = new THREE.InstancedMesh(geo[k]!, mat, MAX_PICKUPS);
      m.frustumCulled = false;
      m.castShadow = true;
      m.count = 0;
      this.crates.push(m);
      this.group.add(m);
      const h = new THREE.InstancedMesh(geo[k]!, hullMaterial(), MAX_PICKUPS);
      h.frustumCulled = false;
      h.count = 0;
      h.renderOrder = 2;
      this.hulls.push(h);
      this.group.add(h);
    }
    const ringMat = new THREE.MeshBasicMaterial({ color: '#ffffff', transparent: true, opacity: 0.45, depthWrite: false });
    this.rings = new THREE.InstancedMesh(new THREE.RingGeometry(0.38, 0.52, 20), ringMat, MAX_PICKUPS);
    this.rings.frustumCulled = false;
    this.rings.count = 0;
    this.group.add(this.rings);
  }

  /** Swap the placeholder shapes for the Blender models (ammo box, medkit, grenade ...); the shapes stay if loading fails. */
  async load(): Promise<void> {
    await Promise.all(
      MODELS.map(async (n, k) => {
        try {
          const g = await loadGLB(asset(`models/pickups/pickup_${n}.glb`));
          let mesh: THREE.Mesh | null = null;
          g.scene.traverse((o) => {
            if (!mesh && (o as THREE.Mesh).isMesh) mesh = o as THREE.Mesh;
          });
          const found = mesh as THREE.Mesh | null;
          if (!found) return;
          const m = this.crates[k]!;
          m.geometry = found.geometry;
          const hg = found.geometry.clone();
          hg.clearGroups();
          this.hulls[k]!.geometry = hg;
          const mat = (Array.isArray(found.material) ? found.material : [found.material]).map((x) => {
            const c = x.clone() as THREE.MeshStandardMaterial;
            if (c.emissive) {
              c.emissive = c.color.clone();
              c.emissiveIntensity = 0.18;
            }
            return c;
          });
          m.material = mat.length === 1 ? mat[0]! : mat;
          this.modelScale[k] = MODEL_SCALE;
        } catch {
          /* keep the placeholder */
        }
      }),
    );
  }

  private readonly weaponProto = new Map<string, THREE.Object3D>();
  private readonly weaponObjs: (THREE.Object3D | undefined)[] = [];
  private readonly weaponIds: string[] = [];

  /** Load the real weapon models: a weapon drop shows the gun itself, spinning. */
  async loadWeapons(): Promise<void> {
    await Promise.all(
      WEAPON_IDS.map(async (id) => {
        try {
          const g = await loadGLB(asset(`models/weapons/weapon_${id}.glb`));
          const box = new THREE.Box3().setFromObject(g.scene);
          const c = box.getCenter(new THREE.Vector3());
          g.scene.position.sub(c);
          const wrap = new THREE.Group();
          wrap.add(g.scene);
          const len = Math.max(box.max.x - box.min.x, box.max.z - box.min.z, 0.1);
          wrap.userData.fit = 1.9 / len;
          g.scene.traverse((o) => {
            if ((o as THREE.Mesh).isMesh) o.castShadow = true;
          });
          this.weaponProto.set(id, wrap);
        } catch {
          /* the crate stays */
        }
      }),
    );
  }

  /** Floor position, kind and display key of every drop, for the name tags. */
  readonly drops: { x: number; z: number; kind: number; data: number; tier: number }[] = [];

  private readonly modelScale = new Array<number>(KINDS).fill(1);

  update(w: World, now: number): void {
    this.counts.fill(0);
    this.drops.length = 0;
    const seenWeapon: number[] = [];
    let rings = 0;
    const mapDef = MAPS[w.map] ?? MAPS[0]!;
    const d = this.dummy;
    for (let i = 0; i < MAX_PICKUPS; i++) {
      if (!w.kActive[i]) continue;
      const kind = w.kType[i]!;
      const left = w.kLife[i]!;
      // blink in the last seconds
      if (left < 4 && Math.floor(now * 8) % 2 === 0) continue;
      const gz = heightAt(mapDef, w.kX[i]!, w.kY[i]!, w.kLayer[i]!);
      const bob = 0.55 + Math.sin(now * 3 + i) * 0.1 + gz;
      const tier = pickupTier(kind, w.kData[i]!);
      this.drops.push({ x: w.kX[i]!, z: -w.kY[i]!, kind, data: w.kData[i]!, tier });
      const tc = this.tierColor[tier]!;
      if (kind === 3) {
        const wid = WEAPON_IDS[w.kData[i]!];
        const proto = wid ? this.weaponProto.get(wid) : undefined;
        if (proto) {
          let o = this.weaponObjs[i];
          if (!o || this.weaponIds[i] !== wid) {
            if (o) this.group.remove(o);
            const hull = proto.clone(true);
            const hm = hullMaterial();
            hm.color.copy(this.tierColor[pickupTier(3, w.kData[i]!)]!);
            hull.traverse((c) => {
              if ((c as THREE.Mesh).isMesh) {
                (c as THREE.Mesh).material = hm;
                c.castShadow = false;
              }
            });
            hull.scale.setScalar(1.14);
            o = new THREE.Group();
            o.add(proto.clone(true), hull);
            o.scale.setScalar(proto.userData.fit as number);
            this.group.add(o);
            this.weaponObjs[i] = o;
            this.weaponIds[i] = wid!;
          }
          o.visible = true;
          o.position.set(w.kX[i]!, bob + 0.1, -w.kY[i]!);
          o.rotation.set(0, now * 1.6 + i, 0);
          seenWeapon[i] = 1;
          d.position.set(w.kX[i]!, 0.03 + gz, -w.kY[i]!);
          d.rotation.set(-Math.PI / 2, 0, 0);
          d.scale.setScalar(1 + Math.sin(now * 4 + i) * 0.12);
          d.updateMatrix();
          this.rings.setColorAt(rings, tc);
          this.rings.setMatrixAt(rings++, d.matrix);
          continue;
        }
      }
      d.position.set(w.kX[i]!, bob, -w.kY[i]!);
      d.rotation.set(0, now * 1.6 + i, 0);
      d.scale.setScalar(this.modelScale[kind]!);
      d.updateMatrix();
      d.scale.multiplyScalar(1.13);
      d.updateMatrix();
      this.hulls[kind]!.setMatrixAt(this.counts[kind]!, d.matrix);
      this.hulls[kind]!.setColorAt(this.counts[kind]!, tc);
      d.scale.setScalar(this.modelScale[kind]!);
      d.updateMatrix();
      this.crates[kind]!.setMatrixAt(this.counts[kind]!++, d.matrix);
      d.position.set(w.kX[i]!, 0.03 + gz, -w.kY[i]!);
      d.rotation.set(-Math.PI / 2, 0, 0);
      d.scale.setScalar(1 + Math.sin(now * 4 + i) * 0.12);
      d.updateMatrix();
      this.rings.setColorAt(rings, tc);
      this.rings.setMatrixAt(rings++, d.matrix);
    }
    for (let k = 0; k < KINDS; k++) {
      this.crates[k]!.count = this.counts[k]!;
      this.crates[k]!.instanceMatrix.needsUpdate = true;
      const h = this.hulls[k]!;
      h.count = this.counts[k]!;
      h.instanceMatrix.needsUpdate = true;
      if (h.instanceColor) h.instanceColor.needsUpdate = true;
      (h.material as THREE.MeshBasicMaterial).opacity = 0.6 + Math.sin(now * 5) * 0.25;
    }
    for (let i = 0; i < this.weaponObjs.length; i++) if (this.weaponObjs[i] && !seenWeapon[i]) this.weaponObjs[i]!.visible = false;
    this.rings.count = rings;
    this.rings.instanceMatrix.needsUpdate = true;
    if (this.rings.instanceColor) this.rings.instanceColor.needsUpdate = true;
  }

  get visibleCount(): number {
    return this.counts.reduce((a, b) => a + b, 0);
  }
}

