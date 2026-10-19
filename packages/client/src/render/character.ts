import * as THREE from 'three';
import { GLTFLoader, type GLTF } from 'three/addons/loaders/GLTFLoader.js';
import * as SkeletonUtils from 'three/addons/utils/SkeletonUtils.js';

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

  private constructor(readonly model: THREE.Object3D, clips: Map<string, THREE.AnimationClip>) {
    this.root.add(model);
    this.mixer = new THREE.AnimationMixer(model);
    for (const [name, clip] of clips) this.actions.set(name, this.mixer.clipAction(clip));
  }

  static async createPlayer(opts: CharacterOptions): Promise<Character> {
    const [base, anims] = await Promise.all([loadGLB('/models/characters/player_base.glb'), loadGLB('/models/anims/player_anims.glb')]);
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
    const ch = new Character(model, clips);
    const skeleton = skinned[0]!.skeleton;
    for (const b of skeleton.bones) ch.bones.set(b.name, b);

    if (opts.accessory) {
      const acc = await loadGLB(`/models/characters/${opts.accessory}.glb`);
      const copy = SkeletonUtils.clone(acc.scene);
      for (const m of collectSkinned(copy)) {
        m.removeFromParent();
        m.bind(skeleton, m.bindMatrix);
        m.castShadow = true;
        m.frustumCulled = false;
        tint(m, opts.color);
        model.add(m);
      }
    }
    if (opts.weapon) await ch.attachWeapon(opts.weapon);
    return ch;
  }

  async attachWeapon(id: string): Promise<void> {
    const hand = this.bones.get('handR') ?? [...this.bones.values()].find((b) => /hand.?r/i.test(b.name));
    if (!hand) throw new Error('right hand bone not found: ' + [...this.bones.keys()].join(','));
    const w = await loadGLB(`/models/weapons/${id}.glb`);
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
    const armDir = right.clone().multiplyScalar(-0.9).addScaledVector(dir, 0.45).addScaledVector(UP, -0.25).normalize();
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
  playOnce(name: string, fade = 0.15): void {
    if (name === this.currentName) return;
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
