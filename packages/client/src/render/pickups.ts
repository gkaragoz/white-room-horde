import * as THREE from 'three';
import { MAX_PICKUPS } from '@wrh/shared';
import type { World } from '@wrh/sim';

const COLORS = ['#ffcf3a', '#3ddc6a', '#6b8f4a', '#c06bff'];

/** Floating, spinning crates for the loot the sim drops (ammo, health, grenades), with a glow ring on the floor. */
export class PickupView {
  readonly group = new THREE.Group();
  private readonly crates: THREE.InstancedMesh[] = [];
  private readonly rings: THREE.InstancedMesh;
  private readonly dummy = new THREE.Object3D();
  private readonly counts = [0, 0, 0, 0];

  constructor() {
    const geo = [new THREE.BoxGeometry(0.46, 0.34, 0.46), new THREE.BoxGeometry(0.42, 0.42, 0.42), new THREE.SphereGeometry(0.26, 10, 8), new THREE.OctahedronGeometry(0.34)];
    for (let k = 0; k < 4; k++) {
      const mat = new THREE.MeshStandardMaterial({ color: COLORS[k], emissive: COLORS[k], emissiveIntensity: 0.55, roughness: 0.5, flatShading: true });
      const m = new THREE.InstancedMesh(geo[k]!, mat, MAX_PICKUPS);
      m.frustumCulled = false;
      m.castShadow = true;
      m.count = 0;
      this.crates.push(m);
      this.group.add(m);
    }
    const ringMat = new THREE.MeshBasicMaterial({ color: '#ffffff', transparent: true, opacity: 0.45, depthWrite: false });
    this.rings = new THREE.InstancedMesh(new THREE.RingGeometry(0.38, 0.52, 20), ringMat, MAX_PICKUPS);
    this.rings.frustumCulled = false;
    this.rings.count = 0;
    this.group.add(this.rings);
  }

  update(w: World, now: number): void {
    this.counts.fill(0);
    let rings = 0;
    const d = this.dummy;
    for (let i = 0; i < MAX_PICKUPS; i++) {
      if (!w.kActive[i]) continue;
      const kind = w.kType[i]!;
      const left = w.kLife[i]!;
      // blink in the last seconds
      if (left < 4 && Math.floor(now * 8) % 2 === 0) continue;
      const bob = 0.55 + Math.sin(now * 3 + i) * 0.1;
      d.position.set(w.kX[i]!, bob, -w.kY[i]!);
      d.rotation.set(0, now * 1.6 + i, 0);
      d.scale.setScalar(1);
      d.updateMatrix();
      this.crates[kind]!.setMatrixAt(this.counts[kind]!++, d.matrix);
      d.position.set(w.kX[i]!, 0.03, -w.kY[i]!);
      d.rotation.set(-Math.PI / 2, 0, 0);
      d.scale.setScalar(1 + Math.sin(now * 4 + i) * 0.12);
      d.updateMatrix();
      this.rings.setMatrixAt(rings++, d.matrix);
    }
    for (let k = 0; k < 4; k++) {
      this.crates[k]!.count = this.counts[k]!;
      this.crates[k]!.instanceMatrix.needsUpdate = true;
    }
    this.rings.count = rings;
    this.rings.instanceMatrix.needsUpdate = true;
  }

  get visibleCount(): number {
    return this.counts[0]! + this.counts[1]! + this.counts[2]! + this.counts[3]!;
  }
}

