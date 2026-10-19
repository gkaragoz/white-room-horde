import * as THREE from 'three';
import { Buttons, CAMERA, type PlayerInput } from '@wrh/shared';

const yaw = THREE.MathUtils.degToRad(CAMERA.yawDeg);
// Screen right/up expressed in sim axes (sim y = -three z), so W always moves up the screen.
const RIGHT = { x: Math.cos(yaw), y: Math.sin(yaw) };
const UP = { x: -Math.sin(yaw), y: Math.cos(yaw) };

/** Keyboard + mouse sampling. Quantises to the wire format used by the sim (PlayerInput). */
export class Input {
  private readonly keys = new Set<string>();
  private mouse = new THREE.Vector2(0, 0);
  private mouseDown = false;
  private readonly ray = new THREE.Raycaster();
  private readonly plane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
  private readonly hit = new THREE.Vector3();

  constructor(private readonly dom: HTMLElement, private readonly camera: THREE.Camera) {
    window.addEventListener('keydown', (e) => this.keys.add(e.code));
    window.addEventListener('keyup', (e) => this.keys.delete(e.code));
    window.addEventListener('blur', () => { this.keys.clear(); this.mouseDown = false; });
    dom.addEventListener('pointermove', (e) => {
      const r = dom.getBoundingClientRect();
      this.mouse.set(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1);
    });
    dom.addEventListener('pointerdown', () => { this.mouseDown = true; });
    window.addEventListener('pointerup', () => { this.mouseDown = false; });
    dom.addEventListener('contextmenu', (e) => e.preventDefault());
  }

  /** Aim point on the floor in sim coordinates. */
  aimPoint(): { x: number; y: number } {
    this.ray.setFromCamera(this.mouse, this.camera);
    this.ray.ray.intersectPlane(this.plane, this.hit);
    return { x: this.hit.x, y: -this.hit.z };
  }

  sample(playerX: number, playerY: number): { input: PlayerInput; moveAngle: number; aimAngle: number } {
    const dx = (this.keys.has('KeyD') || this.keys.has('ArrowRight') ? 1 : 0) - (this.keys.has('KeyA') || this.keys.has('ArrowLeft') ? 1 : 0);
    const dy = (this.keys.has('KeyW') || this.keys.has('ArrowUp') ? 1 : 0) - (this.keys.has('KeyS') || this.keys.has('ArrowDown') ? 1 : 0);
    let mx = dx * RIGHT.x + dy * UP.x;
    let my = dx * RIGHT.y + dy * UP.y;
    const len = Math.hypot(mx, my);
    if (len > 1) { mx /= len; my /= len; }
    const aim = this.aimPoint();
    const aimAngle = Math.atan2(aim.y - playerY, aim.x - playerX);
    const turns = ((aimAngle / (Math.PI * 2)) % 1 + 1) % 1;
    const input: PlayerInput = {
      moveX: Math.round(mx * 127),
      moveY: Math.round(my * 127),
      aim: Math.round(turns * 65536) & 0xffff,
      buttons: (this.mouseDown || this.keys.has('Space') ? Buttons.Fire : 0),
    };
    return { input, moveAngle: Math.atan2(my, mx), aimAngle };
  }
}
