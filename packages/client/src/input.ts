import * as THREE from 'three';
import { Buttons, type PlayerInput } from '@wrh/shared';
import { encodeAim, keysToMove } from './controls';

/** Keyboard + mouse sampling. Quantises to the wire format used by the sim (PlayerInput). */
export class Input {
  private readonly keys = new Set<string>();
  private mouse = new THREE.Vector2(0, 0);
  private mouseDown = false;
  private readonly ray = new THREE.Raycaster();
  private readonly plane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
  private readonly hit = new THREE.Vector3();
  private queued = 0;
  /** Disabled while a menu is open so typing does not move the character. */
  enabled = true;

  constructor(
    private readonly dom: HTMLElement,
    private readonly camera: THREE.Camera,
  ) {
    window.addEventListener('keydown', (e) => this.keys.add(e.code));
    window.addEventListener('keyup', (e) => this.keys.delete(e.code));
    window.addEventListener('blur', () => {
      this.keys.clear();
      this.mouseDown = false;
    });
    dom.addEventListener('pointermove', (e) => {
      const r = dom.getBoundingClientRect();
      this.mouse.set(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1);
    });
    dom.addEventListener('pointerdown', () => {
      this.mouseDown = true;
    });
    window.addEventListener('pointerup', () => {
      this.mouseDown = false;
    });
    dom.addEventListener('contextmenu', (e) => e.preventDefault());
  }

  /** A one-shot button press (card click) sent with the next sample. */
  queueButton(mask: number): void {
    this.queued |= mask;
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
    const m = keysToMove(dx, dy);
    const aim = this.aimPoint();
    const aimAngle = Math.atan2(aim.y - playerY, aim.x - playerX);
    const input: PlayerInput = {
      moveX: Math.round(m.x * 127),
      moveY: Math.round(m.y * 127),
      aim: encodeAim(aimAngle),
      buttons:
        (this.enabled && (this.mouseDown || this.keys.has('Space')) ? Buttons.Fire : 0) |
        (this.keys.has('KeyE') ? Buttons.Revive : 0) |
        (this.keys.has('Digit1') ? Buttons.Card1 : 0) |
        (this.keys.has('Digit2') ? Buttons.Card2 : 0) |
        (this.keys.has('Digit3') ? Buttons.Card3 : 0) |
        this.queued,
    };
    this.queued = 0;
    return { input, moveAngle: Math.atan2(m.y, m.x), aimAngle };
  }
}
