import * as THREE from 'three';
import { CAMERA } from '@wrh/shared';

/** Everything that is not a character: renderer, iso camera, warm sun, painted floor (docs/DESIGN.md sections 3b, 4, 5). */
export class Stage {
  readonly renderer: THREE.WebGLRenderer;
  readonly scene = new THREE.Scene();
  readonly camera: THREE.OrthographicCamera;
  readonly sun: THREE.DirectionalLight;
  private readonly camOffset: THREE.Vector3;
  private readonly sunOffset: THREE.Vector3;

  constructor(private readonly container: HTMLElement) {
    // M1 uses WebGL2; the renderer is created only here so WebGPU can replace it later (design section 21).
    this.renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.toneMapping = THREE.AgXToneMapping;
    this.renderer.toneMappingExposure = 1.05;
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFShadowMap;
    container.appendChild(this.renderer.domElement);

    this.scene.background = new THREE.Color('#e8d9c2');

    // Camera: elevation 28 deg above the horizon, yaw 30 deg, orthographic 17 units wide.
    const el = THREE.MathUtils.degToRad(CAMERA.elevationDeg);
    const yaw = THREE.MathUtils.degToRad(CAMERA.yawDeg);
    this.camOffset = new THREE.Vector3(Math.sin(yaw) * Math.cos(el), Math.sin(el), Math.cos(yaw) * Math.cos(el)).multiplyScalar(40);
    this.camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0.1, 200);

    // Warm key light and cream ambient (blender: sun #FFD7A0, elevation 38, yaw 55; world #E8D9C2).
    this.sunOffset = new THREE.Vector3(0.505, 0.788, 0.353).multiplyScalar(30);
    this.sun = new THREE.DirectionalLight('#ffd7a0', 3.4);
    this.sun.castShadow = true;
    this.sun.shadow.mapSize.set(2048, 2048);
    const sc = this.sun.shadow.camera;
    sc.left = -16; sc.right = 16; sc.top = 16; sc.bottom = -16; sc.near = 1; sc.far = 80;
    this.sun.shadow.bias = -0.0004;
    this.sun.shadow.normalBias = 0.04;
    this.scene.add(this.sun, this.sun.target);
    this.scene.add(new THREE.HemisphereLight('#f2e6d0', '#b9a88f', 1.5));

    this.scene.add(makeFloor());
    this.resize();
    window.addEventListener('resize', () => this.resize());
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

  render(): void {
    this.renderer.render(this.scene, this.camera);
  }
}

/** Light cream floor with soft painted patches and a faint grid, drawn once to a canvas. */
function makeFloor(): THREE.Mesh {
  const size = 2048;
  const c = document.createElement('canvas');
  c.width = c.height = size;
  const g = c.getContext('2d')!;
  g.fillStyle = '#e4e6ed';
  g.fillRect(0, 0, size, size);
  let seed = 7;
  const rnd = () => ((seed = (seed * 1664525 + 1013904223) >>> 0) / 4294967296);
  const patches = ['#d9d2c5', '#ede6da', '#cfc7ba', '#e0d9cc', '#d3ccc0', '#e9e3d8'];
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
  g.strokeStyle = '#c6beaf';
  g.lineWidth = 3;
  const cell = size / 24;
  for (let i = 0; i <= 24; i++) {
    g.beginPath(); g.moveTo(i * cell, 0); g.lineTo(i * cell, size); g.stroke();
    g.beginPath(); g.moveTo(0, i * cell); g.lineTo(size, i * cell); g.stroke();
  }
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.anisotropy = 8;
  tex.repeat.set(2.5, 1.8);
  const mesh = new THREE.Mesh(new THREE.PlaneGeometry(60, 40), new THREE.MeshStandardMaterial({ map: tex, roughness: 0.95, metalness: 0 }));
  mesh.rotation.x = -Math.PI / 2;
  mesh.receiveShadow = true;
  return mesh;
}
