import * as THREE from 'three';

/**
 * Where the next grenade will land: a ring the size of the blast and a little cross on the floor at the cursor. It sits
 * in the scene, so cover and bodies in front of it hide parts of it like any other floor marking.
 */
export class TargetMarker {
  readonly group = new THREE.Group();
  private readonly ring: THREE.Mesh;
  private readonly dot: THREE.Mesh;
  private readonly cross: THREE.Mesh[] = [];
  private readonly mat = new THREE.MeshBasicMaterial({ color: '#ff7a2a', transparent: true, opacity: 0.8, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -4, toneMapped: false });

  constructor() {
    this.ring = new THREE.Mesh(new THREE.RingGeometry(0.94, 1, 64), this.mat);
    this.dot = new THREE.Mesh(new THREE.RingGeometry(0.12, 0.22, 20), this.mat);
    for (const m of [this.ring, this.dot]) {
      m.rotation.x = -Math.PI / 2;
      m.renderOrder = 3;
      this.group.add(m);
    }
    for (let k = 0; k < 2; k++) {
      const bar = new THREE.Mesh(new THREE.PlaneGeometry(0.9, 0.07), this.mat);
      bar.rotation.x = -Math.PI / 2;
      bar.rotation.z = k * Math.PI / 2;
      bar.renderOrder = 3;
      this.cross.push(bar);
      this.group.add(bar);
    }
    this.group.visible = false;
  }

  /** Put the marker at floor position (x, z); `radius` is the blast radius, `hot` while the throw key is held. */
  update(x: number, z: number, radius: number, now: number, visible: boolean, hot: boolean): void {
    this.group.visible = visible;
    if (!visible) return;
    this.group.position.set(x, 0.05, z);
    const pulse = 1 + Math.sin(now * 6) * 0.03 + (hot ? 0.08 : 0);
    this.ring.scale.setScalar(radius * pulse);
    this.group.rotation.y = now * 0.6;
    this.mat.opacity = hot ? 0.95 : 0.6;
  }
}
