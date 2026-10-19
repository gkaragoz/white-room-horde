import * as THREE from 'three';
import { ENEMY_TYPES, EnemyState, MAX_ENEMIES, TICK_DT, type EnemyType } from '@wrh/shared';
import type { SimEvent, World } from '@wrh/sim';
import type { Backend } from './backend';
import { asset } from '../assets';

/** Baked vertex-animation data for one enemy type (tools/blender/bake_vat.py). */
interface VatMeta {
  type: string;
  scale: number;
  vertexCount: number;
  indexCount: number;
  frames: number;
  clips: { id: string; start: number; frames: number; loop: boolean; duration: number }[];
}

/** Boss looks, picked by the sim's eBoss value (1-based) and baked as their own VAT types. */
export const BOSS_TYPES = ['boss_dev_grunt', 'boss_kral_tank', 'boss_sayaci_ana', 'boss_suru_lideri'] as const;
const BOSS_CLIPS = { move: 'z_walk', attack: 'z_attack_overhead', spawn: 'z_scream', death: 'z_death_back' };

interface ClipRef {
  id: string;
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
transformed *= iPosYaw.y;
transformed = vec3( yc * transformed.x + ys * transformed.z, transformed.y, - ys * transformed.x + yc * transformed.z ) + vec3( iPosYaw.x, 0.0, iPosYaw.z );
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

/**
 * WebGPU twin of the GLSL patch above, written in TSL: the same texture fetch, rotation and per-instance shade, so
 * both renderers show identical enemies. Loaded on demand so the WebGL build never pulls the WebGPU code.
 */
async function makeNodeMaterial(vat: THREE.DataTexture, paint: THREE.Texture): Promise<THREE.Material> {
  const webgpu = await import('three/webgpu');
  const tsl = await import('three/tsl');
  const { attribute, vertexIndex, textureLoad, ivec2, int, vec3, vec4, mix, cos, sin, texture } = tsl;
  const posYaw = attribute('iPosYaw', 'vec4');
  const anim = attribute('iAnim', 'vec4');
  const idx = int(vertexIndex);
  const pa = textureLoad(vat, ivec2(idx, int(anim.x))).xyz;
  const pb = textureLoad(vat, ivec2(idx, int(anim.y))).xyz;
  const p = mix(pa, pb, anim.z).mul(posYaw.y);
  const yc = cos(posYaw.w);
  const ys = sin(posYaw.w);
  const rotated = vec3(yc.mul(p.x).add(ys.mul(p.z)), p.y, ys.negate().mul(p.x).add(yc.mul(p.z)));
  const mat = new webgpu.MeshStandardNodeMaterial({ flatShading: true, roughness: 0.85, metalness: 0 });
  mat.positionNode = rotated.add(vec3(posYaw.x, 0, posYaw.z));
  const col = attribute('color', 'vec3');
  mat.colorNode = vec4(texture(paint).rgb.mul(col).mul(anim.w), 1);
  return mat;
}

interface TypeRenderer {
  mesh: THREE.Mesh;
  geometry: THREE.InstancedBufferGeometry;
  posYaw: Float32Array;
  anim: Float32Array;
  clips: Map<string, ClipRef>;
  count: number;
  capacity: number;
  /** Authoring scale of the baked model (world units per model unit), used for stride matching. */
  scale: number;
}

interface Corpse {
  type: number;
  x: number;
  y: number;
  yaw: number;
  born: number;
  clip: string;
  scale: number;
  /** Knock-back velocity (sim units/s), decays quickly. */
  vx: number;
  vy: number;
  /** Index into `types` (boss looks live after the regular types). */
  render: number;
}

/** Ground speed (model units per second, before scale) each baked locomotion clip was authored for. */
function strideOf(clipId: string, scale: number, duration: number): number {
  const speed = clipId === 'z_run' ? 3.0 : clipId === 'z_walk_creep' ? 0.6 : 1.0;
  return speed * scale * duration;
}

/** Hundreds of animated enemies per draw call: vertex-animation textures + instancing (docs/DESIGN.md section 15). */
export class Crowd {
  readonly group = new THREE.Group();
  private readonly types: TypeRenderer[] = [];
  private readonly prevX = new Float32Array(MAX_ENEMIES);
  private readonly prevY = new Float32Array(MAX_ENEMIES);
  private readonly prevActive = new Uint8Array(MAX_ENEMIES);
  private corpses: Corpse[] = [];
  private readonly flash = new Float32Array(MAX_ENEMIES);
  private lastNow = 0;
  /** Walk/run phase in cycles, advanced by distance travelled so feet do not slide. */
  private readonly phase = new Float32Array(MAX_ENEMIES);
  private readonly drawX = new Float32Array(MAX_ENEMIES);
  private readonly drawY = new Float32Array(MAX_ENEMIES);
  private readonly yaw = new Float32Array(MAX_ENEMIES);
  private readonly drawn = new Uint8Array(MAX_ENEMIES);
  private readonly lastClip: string[] = new Array<string>(MAX_ENEMIES).fill('');
  private readonly lastTime = new Float32Array(MAX_ENEMIES);
  /** Moves faster than this many units in one frame are treated as teleports (slot reuse). */
  readonly maxCorpses: number;
  triangles = 0;

  private backend: Backend = 'webgl';

  private constructor(maxCorpses: number) {
    this.maxCorpses = maxCorpses;
  }

  static async create(maxCorpses = 150, backend: Backend = 'webgl'): Promise<Crowd> {
    const crowd = new Crowd(maxCorpses);
    crowd.backend = backend;
    const paint = await new THREE.TextureLoader().loadAsync(asset('models/vat/paint.png'));
    paint.colorSpace = THREE.SRGBColorSpace;
    paint.magFilter = THREE.NearestFilter;
    paint.minFilter = THREE.NearestFilter;
    paint.generateMipmaps = false;
    paint.wrapS = paint.wrapT = THREE.RepeatWrapping;
    for (const id of ENEMY_TYPES) crowd.types.push(await crowd.loadType(id, paint));
    for (const id of BOSS_TYPES) crowd.types.push(await crowd.loadType(id, paint));
    return crowd;
  }

  private async loadType(id: string, paint: THREE.Texture): Promise<TypeRenderer> {
    const base = asset(`models/vat/${id}`);
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

    let material: THREE.Material;
    let depth: THREE.Material | null = null;
    if (this.backend === 'webgpu') {
      material = await makeNodeMaterial(vat, paint); // shadows reuse positionNode
    } else {
      material = new THREE.MeshStandardMaterial({ map: paint, vertexColors: true, flatShading: true, roughness: 0.85, metalness: 0 });
      patchVat(material, vat, true);
      depth = new THREE.MeshDepthMaterial({ depthPacking: THREE.RGBADepthPacking });
      patchVat(depth, vat, false);
    }

    const mesh = new THREE.Mesh(geometry, material);
    if (depth) mesh.customDepthMaterial = depth;
    mesh.frustumCulled = false;
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    this.group.add(mesh);

    const clips = new Map<string, ClipRef>();
    for (const c of meta.clips) clips.set(c.id, c);
    return { mesh, geometry, posYaw, anim, clips, count: 0, capacity, scale: meta.scale };
  }

  /** Call before each sim step so the next frames can interpolate from the previous tick. */
  snapshot(w: World): void {
    this.prevX.set(w.eX);
    this.prevY.set(w.eY);
    this.prevActive.set(w.eActive);
  }

  private renderIndex(w: World, id: number, etype: number): number {
    const boss = w.eBoss[id]!;
    return boss ? ENEMY_TYPES.length + ((boss - 1) % BOSS_TYPES.length) : etype;
  }

  private specFor(render: number): { move: string; attack: string; spawn: string; death: string; deathFwd?: string } {
    return render >= ENEMY_TYPES.length ? BOSS_CLIPS : CLIPS[ENEMY_TYPES[render]!];
  }

  /** Feed the events of one step (deaths become client-side corpses). */
  onEvents(w: World, events: readonly SimEvent[], now: number, skip?: (e: Extract<SimEvent, { type: 'enemyDeath' }>) => boolean): void {
    for (const e of events) {
      if (e.type !== 'enemyDeath') continue;
      if (skip?.(e)) continue;
      const name = ENEMY_TYPES[e.etype]!;
      if (name === 'exploder') continue; // blown to pieces
      const render = this.renderIndex(w, e.id, e.etype);
      const spec = this.specFor(render);
      const ang = w.eAngle[e.id]!;
      // a push along the facing means it was shot in the back: fall forward when a clip exists
      const along = e.dx * Math.cos(ang) + e.dy * Math.sin(ang);
      const clip = along > 0.2 && spec.deathFwd ? spec.deathFwd : spec.death;
      const kick = Math.min(5.5, 1.5 + e.power * 0.06);
      this.corpses.push({
        type: e.etype,
        render,
        x: e.x,
        y: e.y,
        yaw: this.drawn[e.id] ? this.yaw[e.id]! : ang + Math.PI / 2,
        born: now,
        clip,
        scale: 1,
        vx: e.dx * kick,
        vy: e.dy * kick,
      });
    }
    while (this.corpses.length > this.maxCorpses) this.corpses.shift();
  }

  private put(t: TypeRenderer, x: number, z: number, yaw: number, rowA: number, rowB: number, mix: number, shade: number, scale = 1): void {
    const k = t.count * 4;
    t.posYaw[k] = x;
    t.posYaw[k + 1] = scale;
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
  /** Brief white flash on a hit enemy. */
  hit(id: number): void {
    this.flash[id] = 1;
  }

  update(w: World, alpha: number, now: number): void {
    const dt = Math.min(0.1, now - this.lastNow);
    this.lastNow = now;
    for (let i = 0; i < MAX_ENEMIES; i++) if (this.flash[i]! > 0) this.flash[i] = Math.max(0, this.flash[i]! - dt * 8);
    for (const t of this.types) t.count = 0;
    for (let i = 0; i < MAX_ENEMIES; i++) {
      if (!w.eActive[i]) {
        this.drawn[i] = 0;
        continue;
      }
      const ri = this.renderIndex(w, i, w.eType[i]!);
      const t = this.types[ri]!;
      const spec = this.specFor(ri);
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
      // heading: ease toward the sim heading instead of snapping at 30 Hz
      const target = w.eAngle[i]! + Math.PI / 2;
      if (!this.drawn[i]) {
        this.yaw[i] = target;
        this.phase[i] = (i * 0.173) % 1;
      } else {
        let d = target - this.yaw[i]!;
        d = Math.atan2(Math.sin(d), Math.cos(d));
        this.yaw[i] = this.yaw[i]! + d * Math.min(1, dt * 14);
      }
      const state = w.eState[i]!;
      const age = (w.tick - w.eStateTick[i]! + alpha) * TICK_DT;
      const clipId = state === EnemyState.Attack ? spec.attack : state === EnemyState.Spawn ? spec.spawn : spec.move;
      const clip = t.clips.get(clipId) ?? t.clips.get(spec.move)!;
      let time = age;
      if (clip.loop) {
        // advance the cycle by the distance actually covered
        if (this.drawn[i]) {
          const mx = x - this.drawX[i]!;
          const my = y - this.drawY[i]!;
          const moved = Math.sqrt(mx * mx + my * my);
          if (moved < 1.5) this.phase[i] = this.phase[i]! + moved / strideOf(clip.id, t.scale, clip.duration);
        }
        time = (this.phase[i]! % 1) * clip.duration;
      }
      this.lastClip[i] = clip.id;
      this.lastTime[i] = time;
      this.drawX[i] = x;
      this.drawY[i] = y;
      this.drawn[i] = 1;
      const s = this.sample(clip, time);
      // elites stand out: giants are big, swift ones bright, armoured ones dark, volatile ones glow hot
      const mod = w.eMod[i]!;
      const eliteShade = mod === 6 ? 0.55 : mod === 4 ? 1.9 : mod === 2 ? 1.35 : mod === 3 ? 1.25 : mod === 5 ? 1.15 : 1;
      this.put(t, x, -y, this.yaw[i]!, s.a, s.b, s.m, (0.9 + ((i * 53) % 10) * 0.02) * eliteShade + this.flash[i]! * 1.6, mod === 1 ? 1.55 : mod === 2 ? 0.88 : mod === 3 ? 1.12 : 1);
    }
    for (const c of this.corpses) {
      const t = this.types[c.render]!;
      const clip = t.clips.get(c.clip) ?? t.clips.get(this.specFor(c.render).death)!;
      // knocked back by the killing shot, friction brings it to rest
      c.x += c.vx * dt;
      c.y += c.vy * dt;
      const f = Math.max(0, 1 - dt * 5);
      c.vx *= f;
      c.vy *= f;
      const s = this.sample(clip, now - c.born);
      this.put(t, c.x, -c.y, c.yaw, s.a, s.b, s.m, 0.8, c.scale);
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

  /** What an enemy was doing when it died (for a ragdoll to continue from): clip, time, velocity and heading. */
  deathInfo(w: World, id: number): { clip: string; time: number; vx: number; vy: number; yaw: number; boss: boolean } {
    return {
      clip: this.lastClip[id] || 'z_walk',
      time: this.lastTime[id]!,
      vx: this.prevActive[id] ? (w.eX[id]! - this.prevX[id]!) / TICK_DT : 0,
      vy: this.prevActive[id] ? (w.eY[id]! - this.prevY[id]!) / TICK_DT : 0,
      yaw: this.drawn[id] ? this.yaw[id]! : w.eAngle[id]! + Math.PI / 2,
      boss: w.eBoss[id] !== 0,
    };
  }

  /** QA helper: show exactly one enemy in a given pose (type index or name), nothing else. */
  debugPose(type: number | string, clipId: string, time: number, x = 0, y = 0, yaw = 0): { rows: number; clip: ClipRef } | null {
    const names: string[] = [...ENEMY_TYPES, ...BOSS_TYPES];
    const idx = typeof type === 'number' ? type : names.indexOf(type);
    for (const t of this.types) t.count = 0;
    const t = this.types[idx];
    const clip = t?.clips.get(clipId);
    if (!t || !clip) return null;
    const s = this.sample(clip, time);
    this.put(t, x, -y, yaw, s.a, s.b, s.m, 1, 1);
    for (const r of this.types) {
      r.geometry.instanceCount = r.count;
      (r.geometry.getAttribute('iPosYaw') as THREE.InstancedBufferAttribute).needsUpdate = true;
      (r.geometry.getAttribute('iAnim') as THREE.InstancedBufferAttribute).needsUpdate = true;
    }
    return { rows: clip.frames, clip };
  }

  /** QA helper: instance buffers of a type (rows, mix) for the first instances. */
  debugInstances(type: number): { rowA: number; rowB: number; mix: number; x: number; z: number; yaw: number }[] {
    const t = this.types[type]!;
    const out = [];
    for (let i = 0; i < t.count; i++) out.push({ rowA: t.anim[i * 4]!, rowB: t.anim[i * 4 + 1]!, mix: t.anim[i * 4 + 2]!, x: t.posYaw[i * 4]!, z: t.posYaw[i * 4 + 2]!, yaw: t.posYaw[i * 4 + 3]! });
    return out;
  }

  /** Crowd shadows are the most expensive part of a huge horde; the auto-quality controller switches them off first. */
  setShadows(on: boolean): void {
    for (const t of this.types) t.mesh.castShadow = on;
  }

  get typeCount(): number {
    return this.types.length;
  }

  get corpseCount(): number {
    return this.corpses.length;
  }
}
