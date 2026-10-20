import * as THREE from 'three';

/**
 * The mark on the enemy (or barrel) the auto-aim is locked on: a round target sign in the player's own colour that is
 * stuck to the floor under the target and follows it. It lives in the scene, so bodies and cover hide parts of it.
 */
export class AimMarker {
  readonly group = new THREE.Group();
  private readonly mat = new THREE.MeshBasicMaterial({ color: '#ffffff', transparent: true, opacity: 0.95, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -5, toneMapped: false, side: THREE.DoubleSide });
  private readonly dark = new THREE.MeshBasicMaterial({ color: '#10141c', transparent: true, opacity: 0.55, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -4, toneMapped: false, side: THREE.DoubleSide });
  private readonly ring: THREE.Mesh;
  private readonly shadow: THREE.Mesh;
  private readonly dot: THREE.Mesh;
  private readonly ticks: THREE.Mesh[] = [];
  private size = 0.8;
  private seen = -1;

  constructor() {
    // a thin dark ring under the coloured one keeps the sign readable on pale floors
    this.shadow = new THREE.Mesh(new THREE.RingGeometry(0.86, 1.1, 40), this.dark);
    this.ring = new THREE.Mesh(new THREE.RingGeometry(0.9, 1.04, 40), this.mat);
    this.dot = new THREE.Mesh(new THREE.CircleGeometry(0.16, 16), this.mat);
    for (const m of [this.shadow, this.ring, this.dot]) {
      m.rotation.x = -Math.PI / 2;
      m.renderOrder = 4;
      this.group.add(m);
    }
    for (let k = 0; k < 4; k++) {
      const t = new THREE.Mesh(new THREE.PlaneGeometry(0.34, 0.1), this.mat);
      t.rotation.x = -Math.PI / 2;
      t.rotation.z = (k * Math.PI) / 2;
      t.renderOrder = 4;
      this.ticks.push(t);
      this.group.add(t);
    }
    this.group.visible = false;
  }

  /** Stick the sign to floor position (x, z); `radius` is about the target's size. A null `x` hides it. */
  update(x: number | null, z: number, radius: number, color: string, now: number, targetKey: number): void {
    if (x === null) {
      this.group.visible = false;
      this.seen = -1;
      return;
    }
    // a freshly chosen target gets a quick shrink-in so the player sees the lock change
    if (targetKey !== this.seen) {
      this.seen = targetKey;
      this.born = now;
    }
    this.group.visible = true;
    this.mat.color.set(color);
    const age = Math.min(1, (now - this.born) / 0.18);
    const pop = 1 + (1 - age) * (1 - age) * 0.9;
    this.size = radius;
    this.group.position.set(x, 0.07, z);
    this.group.scale.setScalar(radius * pop * (1 + Math.sin(now * 7) * 0.025));
    this.group.rotation.y = now * 0.9;
    this.ticks.forEach((t, k) => {
      const a = (k * Math.PI) / 2;
      t.position.set(Math.cos(a) * 1.3, 0, -Math.sin(a) * 1.3);
    });
  }

  private born = 0;

  get radius(): number {
    return this.size;
  }
}
