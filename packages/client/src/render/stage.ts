import * as THREE from 'three';
import { CAMERA } from '@wrh/shared';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { SMAAPass } from 'three/addons/postprocessing/SMAAPass.js';

import type { Backend } from './backend';

export type AaMode = 'off' | 'msaa' | 'smaa';
export interface StageOptions {
  aa: AaMode;
  /** Cheap fake global illumination: a warm bounce fill from the floor side. */
  bounce: boolean;
  backend?: Backend;
  /** Floor texture detail: 0 low, 1 high. */
  texture?: 0 | 1;
}

/** Everything that is not a character: renderer, iso camera, warm sun, painted floor (docs/DESIGN.md sections 3b, 4, 5). */
export class Stage {
  /** WebGLRenderer or WebGPURenderer (typed as the former; WebGL-only calls are never made on the WebGPU path). */
  readonly renderer: THREE.WebGLRenderer;
  readonly backend: Backend;
  readonly scene = new THREE.Scene();
  readonly camera: THREE.OrthographicCamera;
  readonly sun: THREE.DirectionalLight;
  private readonly camOffset: THREE.Vector3;
  private readonly sunOffset: THREE.Vector3;

  private composer: EffectComposer | null = null;
  private readonly bounce: THREE.DirectionalLight;
  private readonly hemi: THREE.HemisphereLight;
  private readonly bg = new THREE.Color('#d5dde6');
  /** 0 = broad daylight, 1 = deep night. Moves smoothly towards `nightTarget`. */
  night = 0;
  nightTarget = 0;
  /** Real-time lights: a fixed pool (a constant light count avoids shader recompiles), lamp lights and a flashlight. */
  private readonly pool: { light: THREE.PointLight; life: number; max: number; peak: number }[] = [];
  private readonly lampLights: THREE.PointLight[] = [];
  private readonly flashlight: THREE.SpotLight;
  private readonly selfLight: THREE.PointLight;
  private dynamicLights = true;
  private lampSpots: { x: number; y: number; z: number; color?: string }[] = [];
  private flashOn = false;

  /** Build a stage on the requested backend (WebGPU is initialised asynchronously). */
  static async create(container: HTMLElement, opts: StageOptions = { aa: 'msaa', bounce: true }): Promise<Stage> {
    if (opts.backend === 'webgpu') {
      const { WebGPURenderer } = await import('three/webgpu');
      const r = new WebGPURenderer({ antialias: opts.aa !== 'off', powerPreference: 'high-performance', stencil: true });
      await r.init();
      return new Stage(container, r as unknown as THREE.WebGLRenderer, { ...opts, aa: opts.aa === 'off' ? 'off' : 'msaa' }, 'webgpu');
    }
    return new Stage(container, new THREE.WebGLRenderer({ antialias: opts.aa === 'msaa', powerPreference: 'high-performance', stencil: true }), opts, 'webgl');
  }

  constructor(
    private readonly container: HTMLElement,
    renderer: THREE.WebGLRenderer,
    opts: StageOptions = { aa: 'msaa', bounce: true },
    backend: Backend = 'webgl',
  ) {
    this.backend = backend;
    this.renderer = renderer;
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.toneMapping = THREE.AgXToneMapping;
    this.renderer.toneMappingExposure = 1.05;
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFShadowMap;
    container.appendChild(this.renderer.domElement);

    this.scene.background = new THREE.Color('#d5dde6');

    // Camera: elevation 28 deg above the horizon, yaw 30 deg, orthographic 32 units wide.
    const el = THREE.MathUtils.degToRad(CAMERA.elevationDeg);
    const yaw = THREE.MathUtils.degToRad(CAMERA.yawDeg);
    this.camOffset = new THREE.Vector3(Math.sin(yaw) * Math.cos(el), Math.sin(el), Math.cos(yaw) * Math.cos(el)).multiplyScalar(40);
    this.camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0.1, 200);

    // Neutral daylight: a near-white sun, cool sky fill and a pale blue-grey ground, so the colourful characters pop.
    this.sunOffset = new THREE.Vector3(0.505, 0.788, 0.353).multiplyScalar(30);
    this.sun = new THREE.DirectionalLight('#fff6ea', 3.1);
    this.sun.castShadow = true;
    this.sun.shadow.mapSize.set(2048, 2048);
    const sc = this.sun.shadow.camera;
    sc.left = -26; sc.right = 26; sc.top = 26; sc.bottom = -26; sc.near = 1; sc.far = 80;
    this.sun.shadow.bias = -0.0004;
    this.sun.shadow.normalBias = 0.04;
    this.scene.add(this.sun, this.sun.target);
    this.hemi = new THREE.HemisphereLight('#e4eefc', '#a9b2bd', 1.55);
    this.scene.add(this.hemi);

    // fake bounce light: sunlight reflected by the cream floor tints the shaded sides warmly
    this.bounce = new THREE.DirectionalLight('#dfe9f5', 0.5);
    this.bounce.position.set(-this.sunOffset.x, -this.sunOffset.y * 0.2 + 2, -this.sunOffset.z);
    this.bounce.visible = opts.bounce;
    this.scene.add(this.bounce);

    // real-time lights: 8 for flashes and explosions, 4 for the street lamps nearest to the camera, the player's own
    // little light and a flashlight cone (all start dark; the night turns lamps and flashlight on)
    for (let i = 0; i < 8; i++) {
      const light = new THREE.PointLight('#ffd9a0', 0, 12, 1.6);
      this.scene.add(light);
      this.pool.push({ light, life: 0, max: 1, peak: 0 });
    }
    for (let i = 0; i < 4; i++) {
      const l = new THREE.PointLight('#ffe2a8', 0, 13, 1.5);
      this.scene.add(l);
      this.lampLights.push(l);
    }
    this.selfLight = new THREE.PointLight('#cfe0ff', 0, 7, 1.5);
    this.scene.add(this.selfLight);
    this.flashlight = new THREE.SpotLight('#fff3d6', 0, 22, Math.PI / 5, 0.45, 1.3);
    this.scene.add(this.flashlight, this.flashlight.target);

    this.scene.add(makeFloor(opts.texture ?? 1));
    if (opts.aa === 'smaa' && backend === 'webgl') {
      // the x-ray outline of hidden characters needs a stencil buffer in the post-processing target too
      this.composer = new EffectComposer(this.renderer, new THREE.WebGLRenderTarget(1, 1, { type: THREE.HalfFloatType, stencilBuffer: true }));
      this.composer.addPass(new RenderPass(this.scene, this.camera));
      // tone map first so SMAA sees display-referred colours (edge detection is tuned for those)
      this.composer.addPass(new OutputPass());
      this.composer.addPass(new SMAAPass());
    }
    this.resize();
    window.addEventListener('resize', () => this.resize());
  }

  /** Switch the real-time lights (muzzle flashes, explosions, lamps, flashlight) on or off. */
  setDynamicLights(on: boolean): void {
    this.dynamicLights = on;
    if (!on) {
      for (const p of this.pool) p.light.intensity = 0;
      for (const l of this.lampLights) l.intensity = 0;
      this.selfLight.intensity = 0;
      this.flashlight.intensity = 0;
    }
  }

  /** Where the street lamps stand (world coordinates of their lamp heads); the nearest ones to the camera get a light. */
  setLamps(spots: { x: number; y: number; z: number; color?: string }[]): void {
    this.lampSpots = spots;
  }

  /** A short real-time light: muzzle flash, explosion, spark. Reuses the dimmest light of the pool. */
  glow(x: number, y: number, z: number, color: string, intensity: number, life: number, distance = 10): void {
    if (!this.dynamicLights) return;
    let best = this.pool[0]!;
    for (const p of this.pool) if (p.life < best.life) best = p;
    best.light.position.set(x, y, z);
    best.light.color.set(color);
    best.light.distance = distance;
    best.peak = intensity;
    best.life = life;
    best.max = life;
    best.light.intensity = intensity;
  }

  /** The local player's flashlight: position, aim direction (floor plane) and whether it is lit. */
  setFlashlight(x: number, z: number, dx: number, dz: number, on: boolean): void {
    this.flashOn = on;
    this.flashlight.position.set(x, 1.7, z);
    this.flashlight.target.position.set(x + dx * 8, 0, z + dz * 8);
    this.selfLight.position.set(x, 1.8, z);
  }

  /** Jump straight to a time of day (no fade), for the start of a game. */
  setNightNow(t: number): void {
    this.night = t;
    this.nightTarget = t;
    this.applyNight();
  }

  /** Advance the time of day and the flicker of the real-time lights. */
  update(dt: number, cx: number, cz: number): void {
    if (Math.abs(this.night - this.nightTarget) > 0.001) {
      this.night += Math.sign(this.nightTarget - this.night) * Math.min(Math.abs(this.nightTarget - this.night), dt * 0.35);
      this.applyNight();
    }
    for (const p of this.pool) {
      if (p.life <= 0) continue;
      p.life -= dt;
      p.light.intensity = this.dynamicLights ? Math.max(0, p.life / p.max) * p.peak : 0;
    }
    const n = this.night;
    // lamps: the four nearest to the camera focus
    const near = [...this.lampSpots].sort((a, b) => (a.x - cx) ** 2 + (a.z - cz) ** 2 - ((b.x - cx) ** 2 + (b.z - cz) ** 2)).slice(0, this.lampLights.length);
    this.lampLights.forEach((l, i) => {
      const s = near[i];
      if (!s || !this.dynamicLights) {
        l.intensity = 0;
        return;
      }
      l.position.set(s.x, s.y, s.z);
      l.color.set(s.color ?? '#ffe2a8');
      l.intensity = n * 14 * (0.95 + 0.05 * Math.sin(performance.now() / 90 + i));
    });
    this.flashlight.intensity = this.dynamicLights && this.flashOn ? n * 60 : 0;
    this.selfLight.intensity = this.dynamicLights && this.flashOn ? n * 4 : 0;
  }

  private static readonly DAY = { bg: new THREE.Color('#d5dde6'), sky: new THREE.Color('#e4eefc'), ground: new THREE.Color('#a9b2bd'), hemi: 1.55, sun: new THREE.Color('#fff6ea'), sunI: 3.1, bounce: 0.5, exposure: 1.05 };
  private static readonly NIGHT = { bg: new THREE.Color('#0a1020'), sky: new THREE.Color('#3a4e86'), ground: new THREE.Color('#10172a'), hemi: 0.85, sun: new THREE.Color('#8fa6ff'), sunI: 0.75, bounce: 0.0, exposure: 1.2 };

  private applyNight(): void {
    const t = this.night;
    const D = Stage.DAY;
    const N = Stage.NIGHT;
    this.bg.copy(D.bg).lerp(N.bg, t);
    (this.scene.background as THREE.Color).copy(this.bg);
    this.hemi.color.copy(D.sky).lerp(N.sky, t);
    this.hemi.groundColor.copy(D.ground).lerp(N.ground, t);
    this.hemi.intensity = D.hemi + (N.hemi - D.hemi) * t;
    this.sun.color.copy(D.sun).lerp(N.sun, t);
    this.sun.intensity = D.sunI + (N.sunI - D.sunI) * t;
    this.bounce.intensity = D.bounce * (1 - t);
    this.renderer.toneMappingExposure = D.exposure + (N.exposure - D.exposure) * t;
    if (t > 0.02) {
      if (!this.scene.fog) this.scene.fog = new THREE.Fog(this.bg.clone(), 38, 95);
      (this.scene.fog as THREE.Fog).color.copy(this.bg);
      (this.scene.fog as THREE.Fog).far = 95 - 30 * t;
    } else {
      this.scene.fog = null;
    }
  }

  /** 0 = off, 1 = low (1024 map), 2 = high (2048 map). */
  setShadowQuality(q: number): void {
    this.renderer.shadowMap.enabled = q > 0;
    this.sun.castShadow = q > 0;
    const size = q >= 2 ? 2048 : 1024;
    if (this.sun.shadow.mapSize.x !== size) {
      this.sun.shadow.map?.dispose();
      this.sun.shadow.map = null;
      this.sun.shadow.mapSize.set(size, size);
    }
    this.scene.traverse((o) => {
      const m = (o as THREE.Mesh).material as THREE.Material | THREE.Material[] | undefined;
      if (m) for (const x of Array.isArray(m) ? m : [m]) x.needsUpdate = true;
    });
  }

  /** Render resolution scale (0.5..1) on top of the device pixel ratio. */
  setScale(scale: number): void {
    this.scale = scale;
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2) * scale);
    this.resize();
  }

  private scale = 1;

  resize(): void {
    const w = this.container.clientWidth || window.innerWidth;
    const h = this.container.clientHeight || window.innerHeight;
    this.renderer.setSize(w, h);
    this.composer?.setPixelRatio(this.renderer.getPixelRatio());
    this.composer?.setSize(w, h);
    const halfW = CAMERA.orthoWidth / 2;
    const halfH = halfW * (h / w);
    this.camera.left = -halfW;
    this.camera.right = halfW;
    this.camera.top = halfH;
    this.camera.bottom = -halfH;
    this.camera.updateProjectionMatrix();
  }

  /** Follow a point on the floor (three coordinates). */
  follow(x: number, z: number, shake = 0): void {
    const t = new THREE.Vector3(x + (Math.random() - 0.5) * shake * 0.5, 0.6, z + (Math.random() - 0.5) * shake * 0.5);
    this.camera.position.copy(t).add(this.camOffset);
    this.camera.lookAt(t);
    this.sun.position.set(x, 0, z).add(this.sunOffset);
    this.sun.target.position.set(x, 0, z);
    this.sun.target.updateMatrixWorld();
  }

  setBounce(on: boolean): void {
    this.bounce.visible = on;
  }

  render(): void {
    if (this.composer) this.composer.render();
    else this.renderer.render(this.scene, this.camera);
  }
}

/** Light concrete floor with soft painted patches and a faint grid, drawn once to a canvas. */
function makeFloor(quality: 0 | 1): THREE.Mesh {
  const size = quality === 1 ? 2048 : 1024;
  const c = document.createElement('canvas');
  c.width = c.height = size;
  const g = c.getContext('2d')!;
  g.fillStyle = '#dfe4ea';
  g.fillRect(0, 0, size, size);
  let seed = 7;
  const rnd = () => ((seed = (seed * 1664525 + 1013904223) >>> 0) / 4294967296);
  const patches = ['#d3dae2', '#e8edf2', '#c9d1da', '#dde3ea', '#cdd5de', '#e4e9ef'];
  for (let i = 0; i < 90; i++) {
    g.fillStyle = patches[Math.floor(rnd() * patches.length)]!;
    g.globalAlpha = 0.55;
    g.beginPath();
    const cx = rnd() * size, cy = rnd() * size, r = 40 + rnd() * 150;
    for (let k = 0; k < 9; k++) {
      const a = (k / 9) * Math.PI * 2;
      const rr = r * (0.8 + rnd() * 0.3);
      if (k === 0) g.moveTo(cx + Math.cos(a) * rr, cy + Math.sin(a) * rr);
      else g.lineTo(cx + Math.cos(a) * rr, cy + Math.sin(a) * rr);
    }
    g.closePath();
    g.fill();
  }
  g.globalAlpha = 1;
  g.strokeStyle = '#bcc6d1';
  g.lineWidth = 3;
  const cell = size / 24;
  for (let i = 0; i <= 24; i++) {
    g.beginPath(); g.moveTo(i * cell, 0); g.lineTo(i * cell, size); g.stroke();
    g.beginPath(); g.moveTo(0, i * cell); g.lineTo(size, i * cell); g.stroke();
  }
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.anisotropy = quality === 1 ? 8 : 1;
  tex.repeat.set(2.5, 1.8);
  const mesh = new THREE.Mesh(new THREE.PlaneGeometry(60, 40), new THREE.MeshStandardMaterial({ map: tex, roughness: 0.95, metalness: 0 }));
  mesh.rotation.x = -Math.PI / 2;
  mesh.receiveShadow = true;
  return mesh;
}
