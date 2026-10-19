import * as THREE from 'three';
import { GLTFLoader, type GLTF } from 'three/addons/loaders/GLTFLoader.js';
import * as SkeletonUtils from 'three/addons/utils/SkeletonUtils.js';
import { asset } from '../assets';

const loader = new GLTFLoader();
const cache = new Map<string, Promise<GLTF>>();

export function loadGLB(url: string): Promise<GLTF> {
  let p = cache.get(url);
  if (!p) {
    p = loader.loadAsync(url);
    cache.set(url, p);
  }
  return p;
}

/** Characters are authored at 1.5x (player) / 1.35x (grunt) ...; hips translation tracks are authored at 1.0. */
export const PLAYER_SCALE = 1.5;

/** Weapon grip placement on the right hand bone (tuned visually, see docs/DESIGN.md "Silah tutusu ve IK"). */
export const HAND_ATTACH = { position: new THREE.Vector3(0, 0.1, 0), rotation: new THREE.Euler(-Math.PI / 2, 0, 0) };

const UP = new THREE.Vector3(0, 1, 0);
const _q1 = new THREE.Quaternion();
const _q2 = new THREE.Quaternion();
const _v1 = new THREE.Vector3();

/** Rotate a bone (world space) by `delta`, keeping its position. */
function rotateBoneWorld(bone: THREE.Bone, delta: THREE.Quaternion): void {
  bone.updateWorldMatrix(true, false);
  bone.getWorldQuaternion(_q1); // current world rotation
  _q1.premultiply(delta);
  const parent = bone.parent;
  if (parent) parent.getWorldQuaternion(_q2);
  else _q2.identity();
  bone.quaternion.copy(_q2.invert().multiply(_q1));
  bone.updateMatrixWorld(true);
}

/** Make a bone's local +Y (the bone axis) point along a world direction. */
function pointBone(bone: THREE.Bone, dir: THREE.Vector3): void {
  bone.updateWorldMatrix(true, false);
  bone.getWorldQuaternion(_q1);
  const cur = _v1.set(0, 1, 0).applyQuaternion(_q1);
  const delta = new THREE.Quaternion().setFromUnitVectors(cur, dir);
  rotateBoneWorld(bone, delta);
}

function collectSkinned(root: THREE.Object3D): THREE.SkinnedMesh[] {
  const out: THREE.SkinnedMesh[] = [];
  root.traverse((o) => {
    if ((o as THREE.SkinnedMesh).isSkinnedMesh) out.push(o as THREE.SkinnedMesh);
  });
  return out;
}

function tint(mesh: THREE.Mesh, color: THREE.ColorRepresentation): void {
  const apply = (m: THREE.Material): THREE.Material => {
    if (m.name.includes('tint')) {
      const c = m.clone() as THREE.MeshStandardMaterial;
      c.color.set(color);
      return c;
    }
    return m;
  };
  mesh.material = Array.isArray(mesh.material) ? mesh.material.map(apply) : apply(mesh.material);
}

export interface CharacterOptions {
  color: THREE.ColorRepresentation;
  accessory?: string; // e.g. 'acc_bandana'
  weapon?: string; // e.g. 'weapon_pistol'
}

/** A skinned chibi with mixer, tinted vest, an accessory bound to the same skeleton and a weapon in the right hand. */
export class Character {
  readonly root = new THREE.Group();
  readonly mixer: THREE.AnimationMixer;
  readonly bones = new Map<string, THREE.Bone>();
  private readonly actions = new Map<string, THREE.AnimationAction>();
  private current: THREE.AnimationAction | null = null;
  currentName = '';

  /** Translucent outline of the parts hidden behind scenery or enemies (see armGhosts). */
  private readonly ghostMaterial: THREE.MeshBasicMaterial;
  private readonly ghostMeshes: THREE.Mesh[] = [];
  private ghostOn = true;

  private constructor(
    readonly model: THREE.Object3D,
    clips: Map<string, THREE.AnimationClip>,
    color: THREE.ColorRepresentation = '#ffffff',
  ) {
    // Drawn only where the character is behind something that is already in the depth buffer (GreaterDepth) and
    // where the character's own visible body did not write the stencil, so it neither tints the visible body nor
    // shows the body parts that hide behind each other.
    this.ghostMaterial = new THREE.MeshBasicMaterial({
      color: new THREE.Color(color).lerp(new THREE.Color('#ffffff'), 0.2),
      transparent: true,
      opacity: 0.55,
      depthWrite: false,
      depthFunc: THREE.GreaterDepth,
      stencilWrite: true,
      stencilFunc: THREE.NotEqualStencilFunc,
      stencilRef: 1,
      stencilFail: THREE.KeepStencilOp,
      stencilZFail: THREE.KeepStencilOp,
      stencilZPass: THREE.KeepStencilOp,
      toneMapped: false,
    });
    this.root.add(model);
    this.mixer = new THREE.AnimationMixer(model);
    for (const [name, clip] of clips) this.actions.set(name, this.mixer.clipAction(clip));
  }

  static async createPlayer(opts: CharacterOptions): Promise<Character> {
    const [base, anims] = await Promise.all([loadGLB(asset('models/characters/player_base.glb')), loadGLB(asset('models/anims/player_anims.glb'))]);
    const model = SkeletonUtils.clone(base.scene);
    const skinned = collectSkinned(model);
    for (const m of skinned) {
      m.castShadow = true;
      m.receiveShadow = true;
      m.frustumCulled = false;
      tint(m, opts.color);
    }
    const clips = new Map<string, THREE.AnimationClip>();
    for (const c of anims.animations) {
      const clip = c.clone();
      for (const t of clip.tracks) if (t.name.endsWith('.position')) t.values = t.values.map((v) => v * PLAYER_SCALE);
      clips.set(clip.name, clip);
    }
    const ch = new Character(model, clips, opts.color);
    const skeleton = skinned[0]!.skeleton;
    for (const b of skeleton.bones) ch.bones.set(b.name, b);

    if (opts.accessory) {
      const acc = await loadGLB(asset(`models/characters/${opts.accessory}.glb`));
      const copy = SkeletonUtils.clone(acc.scene);
      for (const m of collectSkinned(copy)) {
        m.removeFromParent();
        m.bind(skeleton, m.bindMatrix);
        m.userData.accessory = true;
        m.castShadow = true;
        m.frustumCulled = false;
        tint(m, opts.color);
        model.add(m);
      }
    }
    if (opts.weapon) await ch.attachWeapon(opts.weapon);
    ch.armGhosts(model);
    return ch;
  }

  async attachWeapon(id: string): Promise<void> {
    const hand = this.bones.get('handR') ?? [...this.bones.values()].find((b) => /hand.?r/i.test(b.name));
    if (!hand) throw new Error('right hand bone not found: ' + [...this.bones.keys()].join(','));
    const w = await loadGLB(asset(`models/weapons/${id}.glb`));
    const g = SkeletonUtils.clone(w.scene);
    g.traverse((o) => {
      if ((o as THREE.Mesh).isMesh) {
        o.castShadow = true;
        o.frustumCulled = false;
      }
    });
    const holder = new THREE.Group();
    holder.name = 'weapon';
    holder.scale.setScalar(PLAYER_SCALE);
    holder.position.copy(HAND_ATTACH.position);
    holder.rotation.copy(HAND_ATTACH.rotation);
    holder.add(g);
    hand.add(holder);
    this.armGhosts(holder);
  }

  /**
   * Give every mesh under `root` a stencil-writing material of its own and a ghost twin that draws the hidden parts
   * (the x-ray outline that keeps the player visible behind obstacles and the horde).
   */
  private armGhosts(root: THREE.Object3D): void {
    const meshes: THREE.Mesh[] = [];
    root.traverse((o) => {
      if ((o as THREE.Mesh).isMesh && !o.userData.ghost) meshes.push(o as THREE.Mesh);
    });
    const mark = (m: THREE.Material): THREE.Material => {
      const copy = m.clone();
      copy.stencilWrite = true;
      copy.stencilRef = 1;
      copy.stencilFunc = THREE.AlwaysStencilFunc;
      copy.stencilZPass = THREE.ReplaceStencilOp;
      return copy;
    };
    for (const m of meshes) {
      m.material = Array.isArray(m.material) ? m.material.map(mark) : mark(m.material);
      // draw the characters after everything that can hide them: the stencil must only be written where they really
      // end up visible, and an object drawn first would leave its stencil under whatever covers it later
      m.renderOrder = 5;
      const skinned = m as THREE.SkinnedMesh;
      let g: THREE.Mesh;
      if (skinned.isSkinnedMesh) {
        const sm = new THREE.SkinnedMesh(m.geometry, this.ghostMaterial);
        sm.bind(skinned.skeleton, skinned.bindMatrix);
        g = sm;
      } else {
        g = new THREE.Mesh(m.geometry, this.ghostMaterial);
      }
      g.userData.ghost = true;
      g.position.copy(m.position);
      g.quaternion.copy(m.quaternion);
      g.scale.copy(m.scale);
      g.renderOrder = 10;
      g.frustumCulled = false;
      g.visible = this.ghostOn;
      m.parent?.add(g);
      this.ghostMeshes.push(g);
    }
  }

  /** QA: the material of the x-ray twin. */
  get ghostMat(): THREE.MeshBasicMaterial {
    return this.ghostMaterial;
  }

  /** The x-ray outline can be switched off (settings, QA). */
  setGhost(on: boolean): void {
    this.ghostOn = on;
    for (const g of this.ghostMeshes) g.visible = on;
  }

  /** Weapon node (`muzzle`, `grip`, `grip_l` empties live inside it). */
  private weaponNode(): THREE.Object3D | undefined {
    return this.bones.get('handR')?.getObjectByName('weapon') ?? undefined;
  }

  clipNames(): string[] {
    return [...this.actions.keys()];
  }

  /** Freeze the skeleton at `fraction` (0..1) of a clip. Used by the QA tool and screenshots. */
  poseAt(name: string, fraction: number): void {
    const a = this.actions.get(name);
    if (!a) throw new Error('unknown clip ' + name);
    this.mixer.stopAllAction();
    this.current = null;
    this.currentName = '';
    a.reset().play();
    a.time = Math.min(0.9999, Math.max(0, fraction)) * a.getClip().duration;
    this.mixer.update(0);
    this.root.updateMatrixWorld(true);
  }

  detachWeapon(): void {
    this.bones.get('handR')?.getObjectByName('weapon')?.removeFromParent();
  }

  /** How the right arm is aimed: sideways, forward and downward weights (tuned with the head-clearance QA test). */
  static aimPose = { side: 0.9, fwd: 0.45, down: 0.25, drop: 0.4, out: 0.2, push: 0.35 };
  lastHeadBox = new THREE.Vector3();
  private headVerts: { mesh: THREE.SkinnedMesh; ids: number[] } | null = null;

  /** The skull as a sphere: mean and largest distance of the vertices that follow the head bone, in the current pose. */
  headSphere(): { centre: THREE.Vector3; radius: number } {
    const headBone = this.bones.get('head');
    const body = collectSkinned(this.model).find((m) => !m.userData.accessory && m.skeleton.bones.includes(headBone!));
    const centre = new THREE.Vector3();
    if (!headBone || !body) return { centre: centre.set(0, 1.65, 0).add(this.root.position), radius: 0.62 };
    if (!this.headVerts) {
      const idx = body.skeleton.bones.indexOf(headBone);
      const si = body.geometry.getAttribute('skinIndex');
      const sw = body.geometry.getAttribute('skinWeight');
      const ids: number[] = [];
      for (let i = 0; i < si.count; i++) {
        for (let k = 0; k < 4; k++) if (si.getComponent(i, k) === idx && sw.getComponent(i, k) > 0.6) ids.push(i);
      }
      this.headVerts = { mesh: body, ids };
    }
    const { mesh, ids } = this.headVerts;
    mesh.updateWorldMatrix(true, false);
    mesh.skeleton.update();
    const v = new THREE.Vector3();
    const pts: THREE.Vector3[] = [];
    for (const i of ids) {
      mesh.getVertexPosition(i, v);
      pts.push(v.clone().applyMatrix4(mesh.matrixWorld));
    }
    const box = new THREE.Box3();
    for (const p of pts) box.expandByPoint(p);
    box.getCenter(centre);
    const size = box.getSize(new THREE.Vector3());
    // an ellipsoid in reality; as a sphere take the horizontal half-width so a rifle above the chin is not blamed
    const radius = Math.max(size.x, size.z) / 2;
    this.lastHeadBox = size;
    return { centre, radius };
  }

  /** World position of the head bone (the neck). */
  headCentre(out = new THREE.Vector3()): THREE.Vector3 {
    const h = this.bones.get('head');
    if (!h) return out.set(0, 1.65, 0).add(this.root.position);
    h.updateWorldMatrix(true, false);
    return out.setFromMatrixPosition(h.matrixWorld);
  }

  /** Deepest the weapon reaches into a sphere of radius `r` around `centre` (0 = clear). Samples the weapon's vertices. */
  weaponPenetration(centre: THREE.Vector3, r: number): number {
    const node = this.weaponNode();
    if (!node) return 0;
    node.updateWorldMatrix(true, true);
    const v = new THREE.Vector3();
    let worst = 0;
    node.traverse((o) => {
      const m = o as THREE.Mesh;
      if (!m.isMesh || o.userData.ghost) return;
      const pos = m.geometry.getAttribute('position');
      for (let i = 0; i < pos.count; i++) {
        v.fromBufferAttribute(pos, i).applyMatrix4(m.matrixWorld);
        const d = r - v.distanceTo(centre);
        if (d > worst) worst = d;
      }
    });
    return worst;
  }

  /** World position of a named weapon node (`grip`, `muzzle`, `grip_l`). */
  weaponPoint(name: string, out = new THREE.Vector3()): THREE.Vector3 | null {
    const n = this.weaponNode()?.getObjectByName(name);
    if (!n) return null;
    n.updateWorldMatrix(true, false);
    return out.setFromMatrixPosition(n.matrixWorld);
  }

  /** World direction of the barrel axis and of the weapon's up axis. */
  weaponAxes(): { barrel: THREE.Vector3; up: THREE.Vector3 } | null {
    const w = this.weaponNode();
    if (!w) return null;
    w.updateWorldMatrix(true, false);
    return {
      barrel: new THREE.Vector3(0, 0, 1).transformDirection(w.matrixWorld),
      up: new THREE.Vector3(0, 1, 0).transformDirection(w.matrixWorld),
    };
  }

  /** World position of the weapon's muzzle (null when no weapon). */
  muzzleWorld(out = new THREE.Vector3()): THREE.Vector3 | null {
    const m = this.weaponNode()?.getObjectByName('muzzle');
    if (!m) return null;
    m.updateWorldMatrix(true, false);
    return out.setFromMatrixPosition(m.matrixWorld);
  }

  /**
   * Aim the weapon: after the animation has posed the skeleton, rotate the right arm chain so the barrel points exactly
   * along `dir` (a horizontal world direction), keep the weapon upright, and reach the left hand to the weapon's `grip_l`.
   * The clip only supplies the body motion; this makes the held angle match where the shot leaves (docs/DESIGN.md IK note).
   */
  applyAim(dir: THREE.Vector3): void {
    const armR = this.bones.get('armR');
    const handR = this.bones.get('handR');
    const weapon = this.weaponNode();
    if (!armR || !handR || !weapon) return;
    this.root.updateMatrixWorld(true);
    const right = new THREE.Vector3(-dir.z, 0, dir.x).normalize(); // the character's right hand side
    // arm points inward and forward so the weapon sits close to the body centre line
    const T = Character.aimPose;
    const armDir = right.clone().multiplyScalar(-T.side).addScaledVector(dir, T.fwd).addScaledVector(UP, -T.down).normalize();
    pointBone(armR, armDir);
    pointBone(handR, dir);
    // roll about the barrel so the weapon's up axis is world up
    weapon.updateWorldMatrix(true, false);
    const up = new THREE.Vector3(0, 1, 0).transformDirection(weapon.matrixWorld);
    const want = UP.clone().addScaledVector(dir, -UP.dot(dir)).normalize();
    up.addScaledVector(dir, -up.dot(dir)).normalize();
    const ang = Math.atan2(new THREE.Vector3().crossVectors(up, want).dot(dir), up.dot(want));
    if (Number.isFinite(ang)) {
      const q = new THREE.Quaternion().setFromAxisAngle(dir, ang);
      rotateBoneWorld(handR, q);
    }
    // seat the weapon lower, further out to the right and a bit forward so sights, scopes and stocks clear the big head
    weapon.position.copy(HAND_ATTACH.position);
    if (T.drop !== 0 || T.out !== 0 || T.push !== 0) {
      const hand = weapon.parent!;
      hand.updateWorldMatrix(true, false);
      const wp = weapon.getWorldPosition(new THREE.Vector3());
      wp.y -= T.drop;
      wp.addScaledVector(right, T.out).addScaledVector(dir, T.push);
      weapon.position.copy(hand.worldToLocal(wp));
      this.root.updateMatrixWorld(true);
    }
    // support hand to grip_l
    const armL = this.bones.get('armL');
    const handL = this.bones.get('handL');
    const gl = weapon.getObjectByName('grip_l');
    if (armL && handL && gl) {
      gl.updateWorldMatrix(true, false);
      const target = new THREE.Vector3().setFromMatrixPosition(gl.matrixWorld);
      armL.updateWorldMatrix(true, false);
      const shoulder = new THREE.Vector3().setFromMatrixPosition(armL.matrixWorld);
      pointBone(armL, target.clone().sub(shoulder).normalize());
      handL.updateWorldMatrix(true, false);
      const elbow = new THREE.Vector3().setFromMatrixPosition(handL.matrixWorld);
      pointBone(handL, target.clone().sub(elbow).normalize());
    }
    this.root.updateMatrixWorld(true);
  }

  /** Length of a clip in seconds (0 when unknown). */
  clipDuration(name: string): number {
    return this.actions.get(name)?.getClip().duration ?? 0;
  }

  has(name: string): boolean {
    return this.actions.has(name);
  }

  play(name: string, fade = 0.15): void {
    if (name === this.currentName) return;
    const next = this.actions.get(name);
    if (!next) return;
    next.setLoop(THREE.LoopRepeat, Infinity);
    next.reset().play();
    if (this.current) this.current.crossFadeTo(next, fade, false);
    this.current = next;
    this.currentName = name;
  }

  /** Play a clip once and hold its last frame (death, get up). */
  playOnce(name: string, fade = 0.15, force = false): void {
    if (name === this.currentName && !force) return;
    const next = this.actions.get(name);
    if (!next) return;
    next.setLoop(THREE.LoopOnce, 1);
    next.clampWhenFinished = true;
    next.reset().play();
    if (this.current) this.current.crossFadeTo(next, fade, false);
    this.current = next;
    this.currentName = name;
  }

  update(dt: number): void {
    this.mixer.update(dt);
  }
}
