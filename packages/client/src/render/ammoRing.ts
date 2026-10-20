import * as THREE from 'three';

const R_IN = 0.8;
const R_OUT = 1.12;
const STEPS = 72;

/**
 * The magazine ring on the floor around the local player: a real object in the scene, so the player's body and the
 * enemies in front of it cover the part of the ring that passes behind them. Green when the magazine is full, red when it
 * is empty; while reloading the ring fills up again.
 */
export class AmmoRing {
  readonly group = new THREE.Group();
  private readonly track: THREE.Mesh;
  private arc: THREE.Mesh;
  private readonly arcMat: THREE.MeshBasicMaterial;
  private step = -1;
  private readonly color = new THREE.Color();

  constructor() {
    const common = { transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -3, toneMapped: false } as const;
    this.track = new THREE.Mesh(new THREE.RingGeometry(R_IN, R_OUT, 64), new THREE.MeshBasicMaterial({ color: '#1c2230', opacity: 0.4, ...common }));
    this.arcMat = new THREE.MeshBasicMaterial({ color: '#3ddc6a', opacity: 0.95, side: THREE.DoubleSide, ...common });
    this.arc = new THREE.Mesh(new THREE.RingGeometry(R_IN, R_OUT, 2, 1, 0, 0.01), this.arcMat);
    for (const m of [this.track, this.arc]) {
      m.rotation.x = -Math.PI / 2;
      m.renderOrder = 3;
      this.group.add(m);
    }
    this.arc.position.y = 0.012;
    this.group.visible = false;
  }

  /** Place the ring at floor position (x, z) and show `frac` (0..1) of the magazine. */
  update(x: number, z: number, frac: number, reloading: boolean, now: number, visible: boolean, y = 0): void {
    this.group.visible = visible;
    if (!visible) return;
    this.group.position.set(x, 0.04 + y, z);
    const f = Math.max(0, Math.min(1, frac));
    const step = Math.round(f * STEPS);
    if (step !== this.step) {
      this.step = step;
      this.arc.geometry.dispose();
      // the arc starts at the top of the screen and runs clockwise; a ring seen from above is rotated -90 degrees about x
      this.arc.geometry = new THREE.RingGeometry(R_IN, R_OUT, Math.max(2, step), 1, Math.PI / 2, Math.max(0.0001, (step / STEPS) * Math.PI * 2));
      this.arc.geometry.scale(1, -1, 1);
    }
    this.color.setHSL(reloading ? 0.58 : f * 0.35, 1, 0.52);
    this.arcMat.color.copy(this.color);
    this.arcMat.opacity = reloading ? 0.7 + Math.sin(now * 14) * 0.25 : f <= 0.25 ? 0.65 + Math.sin(now * 12) * 0.3 : 0.95;
    this.group.rotation.y = reloading ? now * 3 : 0;
  }

  dispose(): void {
    this.arc.geometry.dispose();
    this.track.geometry.dispose();
  }
}
