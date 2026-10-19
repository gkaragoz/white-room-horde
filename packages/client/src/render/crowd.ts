import * as THREE from 'three';
import { ENEMY_TYPES, EnemyState, MAX_ENEMIES, TICK_DT, type EnemyType } from '@wrh/shared';
import type { SimEvent, World } from '@wrh/sim';

/** Baked vertex-animation data for one enemy type (tools/blender/bake_vat.py). */
interface VatMeta {
  type: string;
  vertexCount: number;
  indexCount: number;
  frames: number;
  clips: { id: string; start: number; frames: number; loop: boolean; duration: number }[];
}

interface ClipRef {
  start: number;
  frames: number;
  loop: boolean;
  duration: number;
}

/** Which baked clip plays in which state (falls back to the move clip when a type lacks one). */
const CLIPS: Record<EnemyType, { move: string; attack: string; spawn: string; death: string; deathFwd?: string }> = {
  grunt: { move: 'z_walk', attack: 'z_attack_swipe', spawn: 'z_scream', death: 'z_death_back' },
  runner: { move: 'z_run', attack: 'z_attack_swipe', spawn: 'z_scream', death: 'z_death_fwd', deathFwd: 'z_death_fwd' },
  tank: { move: 'z_walk', attack: 'z_attack_overhead', spawn: 'z_scream', death: 'z_death_back' },
  exploder: { move: 'z_run', attack: 'z_scream', spawn: 'z_scream', death: 'z_death_fwd', deathFwd: 'z_death_fwd' },
  spitter: { move: 'z_walk_creep', attack: 'z_attack_swipe', spawn: 'z_scream', death: 'z_death_back' },
  shielder: { move: 'z_walk_creep', attack: 'z_punch', spawn: 'z_walk_creep', death: 'z_death_back' },
  spawner: { move: 'z_walk_creep', attack: 'z_scream', spawn: 'z_scream', death: 'z_death_back' },
};

const VERTEX_DECL = /* glsl */ `
attribute vec4 iPosYaw;
attribute vec4 iAnim;
uniform highp sampler2D uVat;
`;

const VERTEX_BEGIN = /* glsl */ `
vec3 pa = texelFetch( uVat, ivec2( gl_VertexID, int( iAnim.x ) ), 0 ).xyz;
vec3 pb = texelFetch( uVat, ivec2( gl_VertexID, int( iAnim.y ) ), 0 ).xyz;
vec3 transformed = mix( pa, pb, iAnim.z );
float yc = cos( iPosYaw.w );
float ys = sin( iPosYaw.w );
transformed = vec3( yc * transformed.x + ys * transformed.z, transformed.y, - ys * transformed.x + yc * transformed.z ) + iPosYaw.xyz;
`;

function patchVat(material: THREE.Material, vat: THREE.DataTexture, tint: boolean): void {
  material.onBeforeCompile = (shader) => {
    shader.uniforms.uVat = { value: vat };
    shader.vertexShader = shader.vertexShader.replace('#include <common>', '#include <common>\n' + VERTEX_DECL).replace('#include <begin_vertex>', VERTEX_BEGIN);
    if (tint) {
      // per-instance brightness variation rides in iAnim.w
      shader.vertexShader = shader.vertexShader.replace('#include <color_vertex>', '#include <color_vertex>\n#ifdef USE_COLOR\nvColor.rgb *= iAnim.w;\n#endif');
    }
  };
  material.customProgramCacheKey = () => (tint ? 'wrh-vat-lit' : 'wrh-vat-depth');
}

interface TypeRenderer {
  mesh: THREE.Mesh;
  geometry: THREE.InstancedBufferGeometry;
  posYaw: Float32Array;
  anim: Float32Array;
  clips: Map<string, ClipRef>;
  count: number;
  capacity: number;
}

interface Corpse {
  type: number;
  x: number;
  y: number;
  yaw: number;
  born: number;
  clip: string;
}

/** Hundreds of animated enemies per draw call: vertex-animation textures + instancing (docs/DESIGN.md section 15). */
export class Crowd {
  readonly group = new THREE.Group();
  private readonly types: TypeRenderer[] = [];
  private readonly prevX = new Float32Array(MAX_ENEMIES);
  private readonly prevY = new Float32Array(MAX_ENEMIES);
  private readonly prevActive = new Uint8Array(MAX_ENEMIES);
  private corpses: Corpse[] = [];
  readonly maxCorpses: number;
  triangles = 0;

  private constructor(maxCorpses: number) {
    this.maxCorpses = maxCorpses;
  }

  static async create(maxCorpses = 150): Promise<Crowd> {
    const crowd = new Crowd(maxCorpses);
    const paint = await new THREE.TextureLoader().loadAsync('/models/vat/paint.png');
    paint.colorSpace = THREE.SRGBColorSpace;
    paint.magFilter = THREE.NearestFilter;
    paint.minFilter = THREE.NearestFilter;
    paint.generateMipmaps = false;
    paint.wrapS = paint.wrapT = THREE.RepeatWrapping;
    for (const id of ENEMY_TYPES) crowd.types.push(await crowd.loadType(id, paint));
    return crowd;
  }

  private async loadType(id: EnemyType, paint: THREE.Texture): Promise<TypeRenderer> {
    const base = `/models/vat/${id}`;
    const [meta, geoBuf, vatBuf] = await Promise.all([
      fetch(base + '.json').then((r) => r.json() as Promise<VatMeta>),
      fetch(base + '.geo.bin').then((r) => r.arrayBuffer()),
      fetch(base + '.vat.bin').then((r) => r.arrayBuffer()),
    ]);
    const n = meta.vertexCount;
    const geometry = new THREE.InstancedBufferGeometry();
    geometry.setAttribute('position', new THREE.BufferAttribute(new Float32Array(geoBuf, 0, n * 3), 3));
    geometry.setAttribute('uv', new THREE.BufferAttribute(new Float32Array(geoBuf, n * 12, n * 2), 2));
    geometry.setAttribute('color', new THREE.BufferAttribute(new Float32Array(geoBuf, n * 20, n * 3), 3));
    geometry.setIndex(new THREE.BufferAttribute(new Uint16Array(geoBuf, n * 32, meta.indexCount), 1));
    const capacity = MAX_ENEMIES + this.maxCorpses;
    const posYaw = new Float32Array(capacity * 4);
    const anim = new Float32Array(capacity * 4);
    const aPos = new THREE.InstancedBufferAttribute(posYaw, 4).setUsage(THREE.DynamicDrawUsage);
    const aAnim = new THREE.InstancedBufferAttribute(anim, 4).setUsage(THREE.DynamicDrawUsage);
    geometry.setAttribute('iPosYaw', aPos);
    geometry.setAttribute('iAnim', aAnim);
    geometry.instanceCount = 0;
    geometry.boundingSphere = new THREE.Sphere(new THREE.Vector3(), 1000);

    const vat = new THREE.DataTexture(new Uint16Array(vatBuf), n, meta.frames, THREE.RGBAFormat, THREE.HalfFloatType);
    vat.minFilter = vat.magFilter = THREE.NearestFilter;
    vat.generateMipmaps = false;
    vat.needsUpdate = true;

    const material = new THREE.MeshStandardMaterial({ map: paint, vertexColors: true, flatShading: true, roughness: 0.85, metalness: 0 });
    patchVat(material, vat, true);
    const depth = new THREE.MeshDepthMaterial({ depthPacking: THREE.RGBADepthPacking });
    patchVat(depth, vat, false);

    const mesh = new THREE.Mesh(geometry, material);
    mesh.customDepthMaterial = depth;
    mesh.frustumCulled = false;
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    this.group.add(mesh);

    const clips = new Map<string, ClipRef>();
    for (const c of meta.clips) clips.set(c.id, c);
    return { mesh, geometry, posYaw, anim, clips, count: 0, capacity };
  }

  /** Call before each sim step so the next frames can interpolate from the previous tick. */
  snapshot(w: World): void {
    this.prevX.set(w.eX);
    this.prevY.set(w.eY);
    this.prevActive.set(w.eActive);
  }

  /** Feed the events of one step (deaths become client-side corpses). */
  onEvents(w: World, events: readonly SimEvent[], now: number): void {
    for (const e of events) {
      if (e.type !== 'enemyDeath') continue;
      const name = ENEMY_TYPES[e.etype]!;
      if (name === 'exploder') continue; // blown to pieces
      const spec = CLIPS[name];
      const yaw = w.eAngle[e.id]! + Math.PI / 2;
      // a push along the facing means it was shot in the back: fall forward when a clip exists
      const along = e.dx * Math.cos(w.eAngle[e.id]!) + e.dy * Math.sin(w.eAngle[e.id]!);
      const clip = along > 0.2 && spec.deathFwd ? spec.deathFwd : spec.death;
      this.corpses.push({ type: e.etype, x: e.x, y: e.y, yaw, born: now, clip });
    }
    while (this.corpses.length > this.maxCorpses) this.corpses.shift();
  }

  private put(t: TypeRenderer, x: number, z: number, yaw: number, rowA: number, rowB: number, mix: number, shade: number): void {
    const k = t.count * 4;
    t.posYaw[k] = x;
    t.posYaw[k + 1] = 0;
    t.posYaw[k + 2] = z;
    t.posYaw[k + 3] = yaw;
    t.anim[k] = rowA;
    t.anim[k + 1] = rowB;
    t.anim[k + 2] = mix;
    t.anim[k + 3] = shade;
    t.count++;
  }

  private sample(c: ClipRef, time: number): { a: number; b: number; m: number } {
    if (c.loop) {
      const p = (time / c.duration) % 1;
      const f = p * c.frames;
      const i = Math.floor(f);
      return { a: c.start + i, b: c.start + ((i + 1) % c.frames), m: f - i };
    }
    const p = Math.min(1, time / c.duration);
    const f = p * (c.frames - 1);
    const i = Math.min(c.frames - 2, Math.floor(f));
    return { a: c.start + i, b: c.start + i + 1, m: Math.min(1, f - i) };
  }

  /** Fill the instance buffers for this frame. `alpha` is the sim tick interpolation factor, `now` is seconds. */
  update(w: World, alpha: number, now: number): void {
    for (const t of this.types) t.count = 0;
    for (let i = 0; i < MAX_ENEMIES; i++) {
      if (!w.eActive[i]) continue;
      const t = this.types[w.eType[i]!]!;
      const spec = CLIPS[ENEMY_TYPES[w.eType[i]!]!];
      let x = w.eX[i]!;
      let y = w.eY[i]!;
      if (this.prevActive[i]) {
        const dx = x - this.prevX[i]!;
        const dy = y - this.prevY[i]!;
        if (dx * dx + dy * dy < 4) {
          x = this.prevX[i]! + dx * alpha;
          y = this.prevY[i]! + dy * alpha;
        }
      }
      const state = w.eState[i]!;
      const age = (w.tick - w.eStateTick[i]! + alpha) * TICK_DT;
      const clipId = state === EnemyState.Attack ? spec.attack : state === EnemyState.Spawn ? spec.spawn : spec.move;
      const clip = t.clips.get(clipId) ?? t.clips.get(spec.move)!;
      const time = clip.loop ? now * 1.0 + i * 0.173 : age;
      const s = this.sample(clip, time);
      this.put(t, x, -y, w.eAngle[i]! + Math.PI / 2, s.a, s.b, s.m, 0.9 + ((i * 53) % 10) * 0.02);
    }
    for (const c of this.corpses) {
      const t = this.types[c.type]!;
      const clip = t.clips.get(c.clip) ?? t.clips.get(CLIPS[ENEMY_TYPES[c.type]!].death)!;
      const s = this.sample(clip, now - c.born);
      this.put(t, c.x, -c.y, c.yaw, s.a, s.b, s.m, 0.8);
    }
    let tris = 0;
    for (const t of this.types) {
      t.geometry.instanceCount = t.count;
      (t.geometry.getAttribute('iPosYaw') as THREE.InstancedBufferAttribute).needsUpdate = true;
      (t.geometry.getAttribute('iAnim') as THREE.InstancedBufferAttribute).needsUpdate = true;
      tris += t.count * ((t.geometry.index?.count ?? 0) / 3);
    }
    this.triangles = tris;
  }

  get corpseCount(): number {
    return this.corpses.length;
  }
}
