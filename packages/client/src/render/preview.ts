import * as THREE from 'three';
import * as SkeletonUtils from 'three/addons/utils/SkeletonUtils.js';
import { asset } from '../assets';
import { Character, loadGLB } from './character';

export type PreviewMode = 'char' | 'weapon';

export interface PreviewLook {
  mode: PreviewMode;
  /** Accessory model name, e.g. 'acc_cap'. */
  accessory: string;
  /** Vest colour. */
  color: string;
  /** Weapon id, e.g. 'smg'. */
  weapon: string;
}

/**
 * The 3D turntable in the menu and lobby: the chibi with the chosen accessory, vest colour and weapon, or the weapon on
 * its own. It owns a small renderer of its own that lives only while the menu is on screen.
 */
export class Preview {
  readonly canvas = document.createElement('canvas');
  private readonly renderer: THREE.WebGLRenderer;
  private readonly scene = new THREE.Scene();
  private readonly camera = new THREE.PerspectiveCamera(30, 1, 0.1, 50);
  private readonly stage = new THREE.Group();
  private readonly clock = new THREE.Clock();
  private character: Character | null = null;
  private weaponMesh: THREE.Object3D | null = null;
  private look: PreviewLook | null = null;
  private generation = 0;
  private raf = 0;
  private spin = 0.6;
  private dragging = false;
  private lastX = 0;
  /** True once something has been drawn (QA). */
  ready = false;
  private disposed = false;

  constructor(size = 260) {
    this.canvas.width = size * Math.min(2, window.devicePixelRatio || 1);
    this.canvas.height = this.canvas.width;
    this.canvas.style.width = size + 'px';
    this.canvas.style.height = size + 'px';
    this.canvas.className = 'wrh-prev-canvas';
    this.renderer = new THREE.WebGLRenderer({ canvas: this.canvas, antialias: true, alpha: true });
    this.renderer.setClearColor(0x000000, 0);
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.05;
    this.scene.add(new THREE.HemisphereLight(0xffffff, 0xcfc4ae, 1.6));
    const sun = new THREE.DirectionalLight(0xffffff, 2.4);
    sun.position.set(2.5, 4, 3);
    this.scene.add(sun);
    const rim = new THREE.DirectionalLight(0xbfd8ff, 1.1);
    rim.position.set(-3, 2, -2.5);
    this.scene.add(rim);
    this.scene.add(this.stage);
    // soft disc under the model
    const disc = new THREE.Mesh(new THREE.CircleGeometry(0.75, 40), new THREE.MeshBasicMaterial({ color: 0x3a352d, transparent: true, opacity: 0.16 }));
    disc.rotation.x = -Math.PI / 2;
    disc.position.y = 0.002;
    this.scene.add(disc);

    this.canvas.addEventListener('pointerdown', (e) => {
      this.dragging = true;
      this.lastX = e.clientX;
      this.canvas.setPointerCapture(e.pointerId);
    });
    this.canvas.addEventListener('pointermove', (e) => {
      if (!this.dragging) return;
      this.stage.rotation.y += (e.clientX - this.lastX) * 0.012;
      this.lastX = e.clientX;
    });
    const end = (): void => {
      this.dragging = false;
    };
    this.canvas.addEventListener('pointerup', end);
    this.canvas.addEventListener('pointercancel', end);
    this.frame();
  }

  /** Show a look; only the parts that changed are rebuilt. */
  async set(look: PreviewLook): Promise<void> {
    const prev = this.look;
    this.look = { ...look };
    const changed = !prev || prev.mode !== look.mode || prev.accessory !== look.accessory || prev.color !== look.color || prev.weapon !== look.weapon;
    if (!changed) return;
    const gen = ++this.generation;
    this.building++;
    try {
      if (look.mode === 'char') await this.buildCharacter(look, gen);
      else await this.buildWeapon(look, gen);
    } finally {
      this.building--;
    }
  }

  private clearStage(): void {
    this.character = null;
    this.weaponMesh = null;
    while (this.stage.children.length) this.stage.remove(this.stage.children[0]!);
  }

  private async buildCharacter(look: PreviewLook, gen: number): Promise<void> {
    const c = await Character.createPlayer({ color: look.color, accessory: look.accessory, weapon: 'weapon_' + look.weapon });
    if (gen !== this.generation) return;
    c.setGhost(false);
    c.play(c.has('aim_idle') ? 'aim_idle' : (c.clipNames()[0] ?? ''));
    c.update(0.01);
    this.clearStage();
    this.character = c;
    this.stage.add(c.root);
    this.camera.position.set(0, 1.35, 5.2);
    this.camera.lookAt(0, 0.95, 0);
    this.camera.fov = 30;
    this.camera.updateProjectionMatrix();
  }

  private async buildWeapon(look: PreviewLook, gen: number): Promise<void> {
    const w = await loadGLB(asset(`models/weapons/weapon_${look.weapon}.glb`));
    if (gen !== this.generation) return;
    const g = SkeletonUtils.clone(w.scene);
    const box = new THREE.Box3().setFromObject(g);
    const size = box.getSize(new THREE.Vector3());
    const centre = box.getCenter(new THREE.Vector3());
    const holder = new THREE.Group();
    g.position.sub(centre);
    holder.add(g);
    // weapons are authored along +Z: show them side on, scaled to fill the frame
    const longest = Math.max(size.x, size.y, size.z) || 1;
    holder.scale.setScalar(2.1 / longest);
    holder.position.y = 1;
    this.clearStage();
    this.weaponMesh = holder;
    this.stage.add(holder);
    this.camera.position.set(0, 1.3, 4.6);
    this.camera.lookAt(0, 1, 0);
    this.camera.fov = 30;
    this.camera.updateProjectionMatrix();
  }

  private frame = (): void => {
    if (this.disposed) return;
    this.raf = requestAnimationFrame(this.frame);
    if (this.ready && !this.canvas.isConnected) {
      this.dispose(); // the screen it lived on is gone
      return;
    }
    if (!this.look) return;
    if (this.ready && this.canvas.offsetParent === null) {
      this.clock.getDelta(); // on a menu page that is not showing: do not spend a frame on it
      return;
    }
    this.tick(Math.min(0.05, this.clock.getDelta()));
    this.renderer.render(this.scene, this.camera);
    if (this.character || this.weaponMesh) this.ready = true;
  };

  /** Advance the turntable and the pose by `dt` seconds (the render loop, and QA). */
  tick(dt: number): void {
    if (!this.dragging) this.stage.rotation.y += dt * this.spin;
    if (this.weaponMesh) this.weaponMesh.position.y = 1 + Math.sin(performance.now() / 700) * 0.04;
    const c = this.character;
    if (!c) return;
    c.update(dt);
    // the clip only supplies the body: the arms are aimed along the way the character faces (the stage turns, so in world space)
    this.stage.updateMatrixWorld(true);
    c.applyAim(this.facing(new THREE.Vector3()));
  }

  /** World direction the character looks at (its forward axis, flat). */
  private facing(out: THREE.Vector3): THREE.Vector3 {
    const c = this.character;
    if (!c) return out.set(0, 0, 1);
    c.root.updateWorldMatrix(true, false);
    out.set(0, 0, 1).transformDirection(c.root.matrixWorld);
    out.y = 0;
    return out.normalize();
  }

  /** QA: where the barrel and the weapon's up axis point against the way the character faces (null without a character weapon). */
  weaponAxes(): { barrel: THREE.Vector3; up: THREE.Vector3; facing: THREE.Vector3 } | null {
    const a = this.character?.weaponAxes();
    return a ? { ...a, facing: this.facing(new THREE.Vector3()) } : null;
  }

  /** QA: resolves when the last `set` has finished building. */
  get busy(): boolean {
    return this.building > 0;
  }
  private building = 0;

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    cancelAnimationFrame(this.raf);
    this.generation++;
    this.renderer.dispose();
    this.renderer.forceContextLoss();
    this.canvas.remove();
  }
}
