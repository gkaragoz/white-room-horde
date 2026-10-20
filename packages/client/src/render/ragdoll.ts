import * as THREE from 'three';
import * as SkeletonUtils from 'three/addons/utils/SkeletonUtils.js';
import { ARENA_HALF_H, ARENA_HALF_W } from '@wrh/shared';
import { loadGLB } from './character';
import { asset } from '../assets';

/** Authoring scale of each enemy rig (hips translation tracks are authored at 1.0). */
const SCALE: Record<string, number> = { grunt: 1.35, runner: 1.05, tank: 2.5, exploder: 1.3, spitter: 1.35, shielder: 1.5, spawner: 1.5 };

const P = { hips: 0, spine: 1, head: 2, armL: 3, armR: 4, handL: 5, handR: 6, thighL: 7, thighR: 8, footL: 9, footR: 10 } as const;
const NAMES = ['hips', 'spine', 'head', 'armL', 'armR', 'handL', 'handR', 'thighL', 'thighR', 'footL', 'footR'] as const;
const N = NAMES.length;
/** Distance constraints: the skeleton links plus braces that keep the torso from folding flat. */
const LINKS: [number, number][] = [
  [P.hips, P.spine], [P.spine, P.head], [P.spine, P.armL], [P.spine, P.armR], [P.armL, P.handL], [P.armR, P.handR],
  [P.hips, P.thighL], [P.hips, P.thighR], [P.thighL, P.footL], [P.thighR, P.footR],
  [P.armL, P.armR], [P.thighL, P.thighR], [P.spine, P.thighL], [P.spine, P.thighR], [P.hips, P.armL], [P.hips, P.armR], [P.head, P.armL], [P.head, P.armR],
];
/** For each aimed bone: [bone, from particle, to particle, side pair]. Leaves reuse their parent's direction. */
const AIMS: { bone: string; from: number; to: number; side: 'up' | 'low' }[] = [
  { bone: 'hips', from: P.hips, to: P.spine, side: 'low' },
  { bone: 'spine', from: P.spine, to: P.head, side: 'up' },
  { bone: 'head', from: P.spine, to: P.head, side: 'up' },
  { bone: 'armL', from: P.armL, to: P.handL, side: 'up' },
  { bone: 'armR', from: P.armR, to: P.handR, side: 'up' },
  { bone: 'handL', from: P.armL, to: P.handL, side: 'up' },
  { bone: 'handR', from: P.armR, to: P.handR, side: 'up' },
  { bone: 'thighL', from: P.thighL, to: P.footL, side: 'low' },
  { bone: 'thighR', from: P.thighR, to: P.footR, side: 'low' },
  { bone: 'footL', from: P.thighL, to: P.footL, side: 'low' },
  { bone: 'footR', from: P.thighR, to: P.footR, side: 'low' },
];
const RADIUS = [0.18, 0.18, 0.34, 0.12, 0.12, 0.12, 0.12, 0.14, 0.14, 0.12, 0.12];
const GRAVITY = -20;
const STEP = 1 / 60;
/** Seconds a resting body stays, and how long it takes to shrink away. */
const REST_FADE = 1.0;

interface Body {
  root: THREE.Group;
  model: THREE.Object3D;
  mixer: THREE.AnimationMixer;
  bones: Map<string, THREE.Bone>;
  parentOf: Map<string, string>;
  restQ: Map<string, THREE.Quaternion>; // local rest rotations
  restWorldQ: Map<string, THREE.Quaternion>;
  restPos: THREE.Vector3[]; // rest particle positions (model space)
  restDir: Map<string, THREE.Vector3>;
  restSide: { up: THREE.Vector3; low: THREE.Vector3 };
  lens: number[];
  pos: Float32Array;
  prev: Float32Array;
  age: number;
  /** Seconds a resting body has been lying there (it shrinks away after a while). */
  rested: number;
  asleep: boolean;
  quiet: number;
  active: boolean;
  type: string;
  actions: Map<string, THREE.AnimationAction>;
  born: number;
}

const _v = new THREE.Vector3();
const _a = new THREE.Vector3();
const _b = new THREE.Vector3();
const _m = new THREE.Matrix4();
// scratch objects of apply(): it runs for every awake body on every frame and must not allocate
const _loc = NAMES.map(() => new THREE.Vector3());
const _sideUp = new THREE.Vector3();
const _sideLow = new THREE.Vector3();
const _s0 = new THREE.Vector3();
const _hp = new THREE.Vector3();
const _swing = new THREE.Quaternion();
const _twist = new THREE.Quaternion();
const _pq = new THREE.Quaternion();
const ORDER = ['root', 'hips', 'spine', 'head', 'armL', 'armR', 'handL', 'handR', 'thighL', 'thighR', 'footL', 'footR'];
const _wq = new Map<string, THREE.Quaternion>(ORDER.map((n) => [n, new THREE.Quaternion()]));
const AIM_OF = new Map<string, (typeof AIMS)[number]>(AIMS.map((a) => [a.bone, a]));

/**
 * Physical corpses: a pool of skinned enemies driven by a small verlet rig (11 joints, distance links, ground and
 * arena collision). A body starts in the pose it died in (a walk or attack clip frozen at the death frame), is thrown
 * by the killing shot, tumbles, then goes to sleep and stays as a corpse until its pool slot is recycled.
 */
export class RagdollPool {
  readonly group = new THREE.Group();
  private readonly bodies: Body[] = [];
  private clock = 0;
  private acc = 0;
  private readonly building = new Set<string>();
  private readonly templates = new Map<string, THREE.Object3D>();
  private anims: THREE.AnimationClip[] = [];

  constructor(readonly capacity = 14) {}

  static async create(capacity = 14): Promise<RagdollPool> {
    const pool = new RagdollPool(capacity);
    const [anims] = await Promise.all([loadGLB(asset('models/anims/enemy_anims.glb'))]);
    pool.anims = anims.animations;
    return pool;
  }

  private async template(type: string): Promise<THREE.Object3D> {
    let t = this.templates.get(type);
    if (!t) {
      t = (await loadGLB(asset(`models/characters/${type}.glb`))).scene;
      this.templates.set(type, t);
    }
    return t;
  }

  /** Pre-load every enemy model so spawning is synchronous. */
  async preload(types: string[]): Promise<void> {
    for (const t of types) await this.template(t);
  }

  /**
   * Build the bodies of the most common types now and let the renderer compile their shaders, so the first kills of a
   * game do not hitch (cloning a skeleton and compiling a skinned program in the middle of a fight is a visible stall).
   */
  warm(types: string[], renderer: THREE.WebGLRenderer, scene: THREE.Scene, camera: THREE.Camera): void {
    for (const t of types) {
      if (this.bodies.length >= this.capacity || !this.templates.has(t)) break;
      if (this.bodies.some((b) => b.type === t)) continue;
      this.bodies.push(this.makeBody(t));
    }
    const shown = this.bodies.map((b) => b.root.visible);
    for (const b of this.bodies) b.root.visible = true;
    renderer.compile(scene, camera);
    this.bodies.forEach((b, i) => (b.root.visible = shown[i]!));
  }

  private makeBody(type: string): Body {
    const tpl = this.templates.get(type)!;
    const model = SkeletonUtils.clone(tpl);
    const root = new THREE.Group();
    root.add(model);
    const bones = new Map<string, THREE.Bone>();
    const parentOf = new Map<string, string>();
    model.traverse((o) => {
      if ((o as THREE.Bone).isBone) {
        bones.set(o.name, o as THREE.Bone);
        if (o.parent && (o.parent as THREE.Bone).isBone) parentOf.set(o.name, o.parent.name);
      }
      if ((o as THREE.Mesh).isMesh) {
        o.castShadow = true;
        o.receiveShadow = true;
        o.frustumCulled = false;
      }
    });
    const restQ = new Map<string, THREE.Quaternion>();
    for (const [n, b] of bones) restQ.set(n, b.quaternion.clone());
    model.updateMatrixWorld(true);
    const restPos: THREE.Vector3[] = NAMES.map((n) => bones.get(n)!.getWorldPosition(new THREE.Vector3()));
    const restWorldQ = new Map<string, THREE.Quaternion>();
    for (const [n, b] of bones) restWorldQ.set(n, b.getWorldQuaternion(new THREE.Quaternion()));
    const restDir = new Map<string, THREE.Vector3>();
    for (const a of AIMS) restDir.set(a.bone, restPos[a.to]!.clone().sub(restPos[a.from]!).normalize());
    const restSide = {
      up: restPos[P.armL]!.clone().sub(restPos[P.armR]!).normalize(),
      low: restPos[P.thighL]!.clone().sub(restPos[P.thighR]!).normalize(),
    };
    const lens = LINKS.map(([a, b]) => restPos[a]!.distanceTo(restPos[b]!));
    const mixer = new THREE.AnimationMixer(model);
    const actions = new Map<string, THREE.AnimationAction>();
    const s = SCALE[type] ?? 1.3;
    for (const c of this.anims) {
      const clip = c.clone();
      for (const t of clip.tracks) if (t.name.endsWith('.position')) t.values = t.values.map((v) => v * s);
      actions.set(clip.name, mixer.clipAction(clip));
    }
    root.visible = false;
    this.group.add(root);
    return { root, model, mixer, bones, parentOf, restQ, restWorldQ, restPos, restDir, restSide, lens, pos: new Float32Array(N * 3), prev: new Float32Array(N * 3), age: 0, rested: 0, asleep: true, quiet: 0, active: false, type, actions, born: 0 };
  }

  private acquire(type: string): Body | null {
    // reuse a body of the same type that is free or the oldest of that type
    let best: Body | null = null;
    for (const b of this.bodies) {
      if (b.type !== type) continue;
      if (!b.active) return b;
      if (!best || b.born < best.born) best = b;
    }
    if (this.bodies.length < this.capacity) {
      const b = this.makeBody(type);
      this.bodies.push(b);
      return b;
    }
    // pool is full of other types: steal the oldest overall (rebuilt for the new type)
    let oldest = this.bodies[0]!;
    for (const b of this.bodies) if (b.born < oldest.born) oldest = b;
    const i = this.bodies.indexOf(oldest);
    this.group.remove(oldest.root);
    const nb = this.makeBody(type);
    this.bodies[i] = nb;
    return nb;
  }

  get ready(): boolean {
    return this.templates.size > 0;
  }

  /**
   * Throw a new corpse. (x, z) is the three-space floor position, `yaw` the model heading, the pose is `clip` at `time`,
   * `vel` the horizontal velocity it had, `push` an extra impulse along the killing shot (world x/z, with an up kick).
   */
  spawn(type: string, x: number, z: number, yaw: number, clip: string, time: number, vel: { x: number; z: number }, push: { x: number; z: number; power: number }): boolean {
    if (!this.templates.has(type)) {
      if (!this.building.has(type)) {
        this.building.add(type);
        void this.template(type);
      }
      return false;
    }
    const b = this.acquire(type);
    if (!b) return false;
    b.root.position.set(x, 0, z);
    b.root.rotation.set(0, yaw, 0);
    b.root.visible = true;
    // pose from the animation at the moment of death
    for (const [n, bone] of b.bones) {
      bone.quaternion.copy(b.restQ.get(n)!);
      bone.scale.setScalar(1); // (a part may have been torn off the last time this body was used)
    }
    b.mixer.stopAllAction();
    const act = b.actions.get(clip) ?? b.actions.get('z_walk');
    if (act) {
      act.reset().play();
      act.paused = true;
      act.time = Math.min(act.getClip().duration - 0.001, Math.max(0, time));
    }
    b.mixer.update(0);
    b.root.updateMatrixWorld(true);
    for (let i = 0; i < N; i++) {
      b.bones.get(NAMES[i]!)!.getWorldPosition(_v);
      b.pos[i * 3] = _v.x;
      b.pos[i * 3 + 1] = Math.max(_v.y, RADIUS[i]!);
      b.pos[i * 3 + 2] = _v.z;
    }
    // verlet velocity: carry the walk, add the shot
    const kick = Math.min(22, 3.5 + push.power * 0.13);
    const lift = 1 + Math.min(2.2, push.power * 0.012);
    for (let i = 0; i < N; i++) {
      // the upper body is thrown harder than the legs so the body spins as it falls
      const w = i === P.head || i === P.spine ? 1.3 : i === P.hips ? 0.9 : 0.7;
      const spinX = (Math.random() - 0.5) * 2.2;
      const spinZ = (Math.random() - 0.5) * 2.2;
      const vx = vel.x + push.x * kick * w + spinX * (i === P.head ? 1.5 : 0.6);
      const vz = vel.z + push.z * kick * w + spinZ * (i === P.head ? 1.5 : 0.6);
      const vy = (3 + Math.min(9, push.power * 0.07)) * w * lift * (0.85 + Math.random() * 0.3);
      b.prev[i * 3] = b.pos[i * 3]! - vx * STEP;
      b.prev[i * 3 + 1] = b.pos[i * 3 + 1]! - vy * STEP;
      b.prev[i * 3 + 2] = b.pos[i * 3 + 2]! - vz * STEP;
    }
    b.asleep = false;
    b.rested = 0;
    b.root.scale.setScalar(1);
    b.root.position.y = 0;
    b.quiet = 0;
    b.active = true;
    b.age = 0;
    b.born = ++this.clock;
    this.apply(b);
    this.lastBody = b;
    return true;
  }

  /** The body most recently thrown (a part can still be torn off it). */
  private lastBody: Body | null = null;

  /** Tear a part off the newest body: its bone shrinks to nothing; returns where the joint is (world coordinates), or null. */
  detachLast(name: 'head' | 'armL' | 'armR' | 'thighL' | 'thighR'): (() => { x: number; y: number; z: number }) | null {
    const b = this.lastBody;
    const bone = b?.bones.get(name);
    if (!b || !b.active || !bone) return null;
    bone.scale.setScalar(0.0001);
    const i = NAMES.indexOf(name);
    const at = { x: 0, y: 0, z: 0 };
    // the joint keeps moving with the body, so a fountain of blood can stay on the stump
    return () => {
      at.x = b.pos[i * 3]!;
      at.y = b.pos[i * 3 + 1]!;
      at.z = b.pos[i * 3 + 2]!;
      return at;
    };
  }

  private integrate(b: Body): void {
    const { pos, prev } = b;
    for (let i = 0; i < N; i++) {
      const k = i * 3;
      const x = pos[k]!;
      const y = pos[k + 1]!;
      const z = pos[k + 2]!;
      pos[k] = x + (x - prev[k]!) * 0.992;
      pos[k + 1] = y + (y - prev[k + 1]!) * 0.992 + GRAVITY * STEP * STEP;
      pos[k + 2] = z + (z - prev[k + 2]!) * 0.992;
      prev[k] = x;
      prev[k + 1] = y;
      prev[k + 2] = z;
    }
    for (let it = 0; it < 7; it++) {
      for (let c = 0; c < LINKS.length; c++) {
        const [a, bi] = LINKS[c]!;
        const ia = a * 3;
        const ib = bi * 3;
        const dx = pos[ib]! - pos[ia]!;
        const dy = pos[ib + 1]! - pos[ia + 1]!;
        const dz = pos[ib + 2]! - pos[ia + 2]!;
        const d = Math.sqrt(dx * dx + dy * dy + dz * dz) || 1e-6;
        const diff = (d - b.lens[c]!) / d / 2;
        pos[ia] = pos[ia]! + dx * diff;
        pos[ia + 1] = pos[ia + 1]! + dy * diff;
        pos[ia + 2] = pos[ia + 2]! + dz * diff;
        pos[ib] = pos[ib]! - dx * diff;
        pos[ib + 1] = pos[ib + 1]! - dy * diff;
        pos[ib + 2] = pos[ib + 2]! - dz * diff;
      }
      for (let i = 0; i < N; i++) {
        const k = i * 3;
        const r = RADIUS[i]!;
        if (pos[k + 1]! < r) {
          // ground: push out and apply friction to the horizontal motion
          pos[k + 1] = r;
          prev[k] = pos[k]! - (pos[k]! - prev[k]!) * 0.82;
          prev[k + 2] = pos[k + 2]! - (pos[k + 2]! - prev[k + 2]!) * 0.82;
          prev[k + 1] = pos[k + 1]! + (pos[k + 1]! - prev[k + 1]!) * 0.2;
        }
        // arena walls (three space: x +-30, z +-20)
        if (pos[k]! < -(ARENA_HALF_W - 0.5)) pos[k] = -(ARENA_HALF_W - 0.5);
        if (pos[k]! > (ARENA_HALF_W - 0.5)) pos[k] = (ARENA_HALF_W - 0.5);
        if (pos[k + 2]! < -(ARENA_HALF_H - 0.5)) pos[k + 2] = -(ARENA_HALF_H - 0.5);
        if (pos[k + 2]! > (ARENA_HALF_H - 0.5)) pos[k + 2] = (ARENA_HALF_H - 0.5);
      }
    }
  }

  /** Turn the particle skeleton back into bone rotations (swing from the rest direction plus a twist from the side axis). */
  private apply(b: Body): void {
    // work in model space: undo the root transform
    b.root.updateMatrixWorld(true);
    _m.copy(b.root.matrixWorld).invert();
    for (let i = 0; i < N; i++) _loc[i]!.set(b.pos[i * 3]!, b.pos[i * 3 + 1]!, b.pos[i * 3 + 2]!).applyMatrix4(_m);
    const sideUp = _sideUp.copy(_loc[P.armL]!).sub(_loc[P.armR]!).normalize();
    const sideLow = _sideLow.copy(_loc[P.thighL]!).sub(_loc[P.thighR]!).normalize();
    for (const name of ORDER) {
      const bone = b.bones.get(name);
      if (!bone) continue;
      const parentName = b.parentOf.get(name);
      const wq = _wq.get(name)!;
      const aim = AIM_OF.get(name);
      if (!aim) {
        wq.copy(b.restWorldQ.get(name)!);
      } else {
        const d = _a.copy(_loc[aim.to]!).sub(_loc[aim.from]!).normalize();
        const d0 = b.restDir.get(name)!;
        const swing = _swing.setFromUnitVectors(d0, d);
        const s0 = _s0.copy(aim.side === 'up' ? b.restSide.up : b.restSide.low).applyQuaternion(swing);
        const sT = aim.side === 'up' ? sideUp : sideLow;
        s0.addScaledVector(d, -s0.dot(d)).normalize();
        _b.copy(sT).addScaledVector(d, -sT.dot(d)).normalize();
        const ang = Math.atan2(_v.crossVectors(s0, _b).dot(d), s0.dot(_b));
        if (Number.isFinite(ang)) _twist.setFromAxisAngle(d, ang);
        else _twist.identity();
        wq.copy(_twist).multiply(swing).multiply(b.restWorldQ.get(name)!);
      }
      if (parentName) _pq.copy(_wq.get(parentName)!);
      else _pq.identity();
      bone.quaternion.copy(_pq.invert().multiply(wq));
    }
    // the hips carry the body: place them where the hips particle is
    const hips = b.bones.get('hips')!;
    const parent = hips.parent!;
    b.model.updateMatrixWorld(true);
    parent.updateWorldMatrix(true, false);
    hips.position.copy(parent.worldToLocal(_hp.set(b.pos[P.hips * 3]!, b.pos[P.hips * 3 + 1]!, b.pos[P.hips * 3 + 2]!)));
    b.model.updateMatrixWorld(true);
  }

  /** Resting bodies shrink away after a few seconds (QA switches it off to measure them). */
  fadeAway = true;
  /** Seconds a resting body lies there before it shrinks away (a setting). */
  restLife = 3.2;

  update(dt: number): void {
    this.acc += Math.min(dt, 0.1);
    let steps = 0;
    while (this.acc >= STEP && steps < 4) {
      this.acc -= STEP;
      steps++;
      for (const b of this.bodies) {
        if (!b.active || b.asleep) continue;
        this.integrate(b);
        b.age += STEP;
        // sleep when nothing moves any more
        let ke = 0;
        for (let k = 0; k < N * 3; k++) ke += Math.abs(b.pos[k]! - b.prev[k]!);
        b.quiet = ke < 0.02 ? b.quiet + STEP : 0;
        if (b.quiet > 0.4 || b.age > 5) b.asleep = true;
      }
    }
    for (const b of this.bodies) {
      if (!b.active) continue;
      if (!b.asleep) {
        this.apply(b);
        continue;
      }
      // a body that has come to rest lies there for a moment, then shrinks away (only the blood stays)
      b.rested += dt;
      if (this.fadeAway && b.rested > this.restLife) {
        const k = 1 - (b.rested - this.restLife) / REST_FADE;
        if (k <= 0) {
          b.active = false;
          b.root.visible = false;
          b.root.position.y = 0;
        } else {
          // sink into the floor where it lies (the body is placed in world coordinates, so scaling the root would drag it toward the middle of the arena)
          b.root.position.y = -(1 - k) * 1.4;
        }
      }
    }
  }

  get activeCount(): number {
    return this.bodies.filter((b) => b.active).length;
  }

  get awakeCount(): number {
    return this.bodies.filter((b) => b.active && !b.asleep).length;
  }

  /** QA: world position of a joint of the newest body. */
  debugJoint(name: (typeof NAMES)[number], index = -1): THREE.Vector3 | null {
    const act = this.bodies.filter((b) => b.active).sort((a, b) => a.born - b.born);
    const body = index < 0 ? act[act.length - 1] : act[index];
    if (!body) return null;
    const i = NAMES.indexOf(name);
    return new THREE.Vector3(body.pos[i * 3], body.pos[i * 3 + 1], body.pos[i * 3 + 2]);
  }

  /** QA: bone world position of the newest body (what is actually drawn). */
  debugBoneWorld(name: string): THREE.Vector3 | null {
    const act = this.bodies.filter((b) => b.active).sort((a, b) => a.born - b.born);
    const body = act[act.length - 1];
    const bone = body?.bones.get(name);
    if (!bone) return null;
    bone.updateWorldMatrix(true, false);
    return bone.getWorldPosition(new THREE.Vector3());
  }

  clear(): void {
    for (const b of this.bodies) {
      b.active = false;
      b.root.visible = false;
    }
  }
}
